/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistent asset registry.
 *
 * Metadata lives in Firestore (`assets` collection) with a localStorage mirror
 * so imports survive reloads even when offline. Original binaries live in
 * IndexedDB with an optional Firebase Storage mirror (see AssetStorage.ts).
 * Decoded images are cached in memory for Phaser texture registration.
 */

import {
  AssetCategory,
  AssetImportDraft,
  AssetMetadata,
  AssetValidationResult,
  DEFAULT_ASSET_LIMITS,
} from '../types/assets';
import { detectSheetLayout, getFrameRect } from '../game/assets/rpgMakerSheets';
import {
  analyzeTransparency,
  createThumbnail,
  loadImageElement,
  validateAssetFile,
  validateImageDimensions,
} from '../game/assets/assetValidation';
import { saveAssetBinary, loadAssetBinary, deleteAssetBinary } from './AssetStorage';

const LOCAL_META_KEY = 'gathergrid_assets_meta_v1';
const MAX_LOCAL_META_BYTES = 4 * 1024 * 1024;

export interface AssetImportOptions {
  name?: string;
  category?: AssetCategory;
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  rows?: number;
  layout?: AssetMetadata['layout'];
  rpgMakerFamily?: string | null;
  notes?: string;
  createdBy?: string;
  /** Continue importing even when a duplicate is detected. */
  allowDuplicate?: boolean;
}

export interface AssetImportProgress {
  stage:
    | 'validating'
    | 'reading'
    | 'analyzing'
    | 'saving-local'
    | 'saving-cloud'
    | 'registering'
    | 'done'
    | 'failed';
  message: string;
  percent: number;
}

export type AssetProgressCallback = (progress: AssetImportProgress) => void;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

class AssetRegistry {
  private assets: Map<string, AssetMetadata> = new Map();
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private imagePromises: Map<string, Promise<HTMLImageElement | null>> = new Map();
  private listeners: Set<() => void> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // 1. Local mirror first (instant availability)
    this.loadLocalMirror();
    this.initialized = true;
    this.emit();

    // 2. Cloud metadata (best effort)
    try {
      const { db } = await import('./firebase');
      const { collection, getDocs } = await import('firebase/firestore');
      const snap = await getDocs(collection(db, 'assets'));
      let changed = false;
      snap.forEach((docSnap) => {
        const data = docSnap.data() as AssetMetadata;
        if (data && data.id) {
          this.assets.set(data.id, { ...data, id: docSnap.id });
          changed = true;
        }
      });
      if (changed) {
        this.saveLocalMirror();
        this.emit();
      }
    } catch (err) {
      console.warn('[AssetRegistry] Cloud metadata unavailable; using local mirror only.', err);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.warn('[AssetRegistry] Listener failed', err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Local metadata mirror
  // -------------------------------------------------------------------------

  private loadLocalMirror(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(LOCAL_META_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AssetMetadata[];
      if (!Array.isArray(parsed)) return;
      for (const meta of parsed) {
        if (meta && meta.id) this.assets.set(meta.id, meta);
      }
    } catch (err) {
      console.warn('[AssetRegistry] Failed to read local asset metadata.', err);
    }
  }

  private saveLocalMirror(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = Array.from(this.assets.values());
      const serialized = JSON.stringify(list);
      if (serialized.length > MAX_LOCAL_META_BYTES) {
        // Strip thumbnails when the mirror grows too large for localStorage.
        const slim = list.map((a) => ({ ...a, thumbnailDataUrl: undefined }));
        localStorage.setItem(LOCAL_META_KEY, JSON.stringify(slim));
      } else {
        localStorage.setItem(LOCAL_META_KEY, serialized);
      }
    } catch (err) {
      console.warn('[AssetRegistry] Failed to persist local asset metadata.', err);
    }
  }

  private async persistMetadata(meta: AssetMetadata): Promise<{ cloud: boolean; error?: string }> {
    this.assets.set(meta.id, meta);
    this.saveLocalMirror();
    this.emit();
    try {
      const { db, auth } = await import('./firebase');
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(db, 'assets', meta.id), {
        ...meta,
        ownerUid: auth?.currentUser?.uid ?? null,
        updatedAt: serverTimestamp(),
      });
      return { cloud: true };
    } catch (err) {
      return { cloud: false, error: (err as Error).message };
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  list(): AssetMetadata[] {
    return Array.from(this.assets.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string | undefined): AssetMetadata | undefined {
    if (!id) return undefined;
    return this.assets.get(id);
  }

  /** Returns assets that are usable as tile sources (have frame grids). */
  listTilesetCandidates(): AssetMetadata[] {
    return this.list().filter(
      (a) =>
        a.category === 'tileset' ||
        a.category === 'autotile' ||
        a.category === 'object' ||
        a.category === 'decoration' ||
        a.category === 'plant' ||
        a.category === 'door' ||
        a.category === 'prop'
    );
  }

  findDuplicate(fileName: string, fileSize: number, width?: number, height?: number): AssetMetadata | undefined {
    for (const meta of this.assets.values()) {
      if (
        meta.fileName === fileName &&
        meta.fileSize === fileSize &&
        (width === undefined || meta.width === width) &&
        (height === undefined || meta.height === height)
      ) {
        return meta;
      }
    }
    return undefined;
  }

  /** Assets referenced by a map (tilesets + objects). */
  collectReferencedIds(map: {
    tilesets?: Array<{ assetId?: string }>;
    objects?: Array<{ assetId?: string }>;
  }): string[] {
    const ids = new Set<string>();
    for (const ts of map.tilesets || []) if (ts.assetId) ids.add(ts.assetId);
    for (const obj of map.objects || []) if (obj.assetId) ids.add(obj.assetId);
    return Array.from(ids);
  }

  /** Reports missing asset references for the given map. */
  findMissingReferences(map: {
    tilesets?: Array<{ assetId?: string; name: string }>;
    objects?: Array<{ assetId?: string; name?: string }>;
  }): string[] {
    const missing: string[] = [];
    for (const ts of map.tilesets || []) {
      if (ts.assetId && !this.assets.has(ts.assetId)) missing.push(`Tileset "${ts.name}"`);
    }
    for (const obj of map.objects || []) {
      if (obj.assetId && !this.assets.has(obj.assetId)) missing.push(`Object "${obj.name || obj.assetId}"`);
    }
    return missing;
  }

  // -------------------------------------------------------------------------
  // Image loading
  // -------------------------------------------------------------------------

  async getImage(assetId: string): Promise<HTMLImageElement | null> {
    if (typeof window === 'undefined') return null;
    const cached = this.imageCache.get(assetId);
    if (cached) return cached;
    const pending = this.imagePromises.get(assetId);
    if (pending) return pending;
    const promise = (async () => {
      const meta = this.assets.get(assetId);
      if (!meta) return null;
      try {
        const blob = await loadAssetBinary(meta.storagePath, meta.downloadUrl);
        if (!blob) return null;
        const img = await loadImageElement(blob);
        this.imageCache.set(assetId, img);
        return img;
      } catch (err) {
        console.warn(`[AssetRegistry] Failed to load asset ${assetId}`, err);
        return null;
      } finally {
        this.imagePromises.delete(assetId);
      }
    })();

    this.imagePromises.set(assetId, promise);
    return promise;
  }

  /** Preloads a list of assets; reports which ids failed. */
  async preload(assetIds: string[]): Promise<string[]> {
    const failed: string[] = [];
    await Promise.all(
      assetIds.map(async (id) => {
        const img = await this.getImage(id);
        if (!img) failed.push(id);
      })
    );
    return failed;
  }

  /** Frame rect helper bound to registry metadata. */
  getFrameRectFor(assetId: string, frame: number): { sx: number; sy: number; sw: number; sh: number } | null {
    const meta = this.assets.get(assetId);
    if (!meta) return null;
    return getFrameRect(frame, meta.columns, meta.frameWidth, meta.frameHeight);
  }

  /** Synchronously returns a decoded image when it is already cached. */
  getCachedImage(assetId: string): HTMLImageElement | undefined {
    return this.imageCache.get(assetId);
  }

  invalidateImage(assetId: string): void {
    this.imageCache.delete(assetId);
  }

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------

  /**
   * Builds a draft from a file: validates, reads dimensions, detects layout.
   * The draft is reviewed in the Asset Manager before `confirmImport`.
   */
  async prepareImport(file: File): Promise<{ draft: AssetImportDraft; validation: AssetValidationResult }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const fileCheck = validateAssetFile({ name: file.name, size: file.size, type: file.type });
    errors.push(...fileCheck.errors);
    warnings.push(...fileCheck.warnings);

    let width = 0;
    let height = 0;
    let hasTransparency = false;
    let img: HTMLImageElement | null = null;

    if (errors.length === 0) {
      try {
        img = await loadImageElement(file);
        width = img.naturalWidth;
        height = img.naturalHeight;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    if (img) {
      const dimCheck = validateImageDimensions(width, height, DEFAULT_ASSET_LIMITS);
      errors.push(...dimCheck.errors);
      warnings.push(...dimCheck.warnings);
      hasTransparency = analyzeTransparency(img);
    }

    const detection = img
      ? detectSheetLayout(file.name, width, height)
      : {
          layout: 'single_image' as const,
          frameWidth: width || 32,
          frameHeight: height || 32,
          columns: 1,
          rows: 1,
          rpgMakerFamily: null,
          isDollar: file.name.startsWith('$'),
          isBang: file.name.startsWith('!'),
          confidence: 0,
          notes: [] as string[],
        };
    warnings.push(...detection.notes);

    const category: AssetCategory = detection.layout.startsWith('character')
      ? 'character'
      : detection.layout === 'autotile_a'
        ? 'autotile'
        : detection.layout === 'tileset_bcde'
          ? 'tileset'
          : 'object';

    const duplicate = this.findDuplicate(file.name, file.size, width || undefined, height || undefined);
    if (duplicate) {
      warnings.push(`Duplicate of existing asset "${duplicate.name}".`);
    }

    const draft: AssetImportDraft = {
      file,
      name: file.name.replace(/\.[a-z0-9]+$/i, ''),
      category,
      frameWidth: detection.frameWidth,
      frameHeight: detection.frameHeight,
      columns: detection.columns,
      rows: detection.rows,
      layout: detection.layout,
      rpgMakerFamily: detection.rpgMakerFamily,
      isDollar: detection.isDollar,
      isBang: detection.isBang,
      hasTransparency,
      warnings,
      errors,
      duplicateOf: duplicate?.id,
      previewUrl: img ? createThumbnail(img, 160) : undefined,
    };

    return { draft, validation: { ok: errors.length === 0, errors, warnings } };
  }

  /**
   * Confirms an import draft: stores the binary and registers metadata.
   * The asset is usable locally immediately; cloud persistence is reported
   * truthfully in the result.
   */
  async confirmImport(
    draft: AssetImportDraft,
    options: AssetImportOptions = {},
    onProgress?: AssetProgressCallback
  ): Promise<{ ok: boolean; asset?: AssetMetadata; error?: string; cloudPersisted: boolean }> {
    const report = (stage: AssetImportProgress['stage'], message: string, percent: number) =>
      onProgress?.({ stage, message, percent });

    try {
      report('validating', 'Validating file…', 5);
      if (draft.errors.length > 0) {
        return { ok: false, error: draft.errors.join(' '), cloudPersisted: false };
      }
      if (draft.duplicateOf && !options.allowDuplicate) {
        return {
          ok: false,
          error: `Duplicate of "${this.assets.get(draft.duplicateOf)?.name || draft.duplicateOf}". Enable "import as copy" to keep both.`,
          cloudPersisted: false,
        };
      }

      report('reading', 'Reading image…', 15);
      const img = await loadImageElement(draft.file);

      report('analyzing', 'Building thumbnail…', 30);
      const thumbnail = createThumbnail(img, 96);

      const assetId = `asset_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`;

      report('saving-local', 'Saving original to local storage…', 45);
      const stored = await saveAssetBinary(assetId, draft.file.name, draft.file);
      if (stored.downloadUrl) {
        report('saving-cloud', 'Mirrored to Firebase Storage.', 70);
      } else {
        report(
          'saving-local',
          'Stored locally (Firebase Storage mirror unavailable — asset persists on this device).',
          70
        );
      }

      const meta: AssetMetadata = {
        id: assetId,
        name: options.name?.trim() || draft.name,
        category: options.category || draft.category,
        fileName: draft.file.name,
        mimeType: draft.file.type || 'image/png',
        fileSize: draft.file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        hasTransparency: draft.hasTransparency,
        frameWidth: options.frameWidth || draft.frameWidth,
        frameHeight: options.frameHeight || draft.frameHeight,
        columns: options.columns || draft.columns,
        rows: options.rows || draft.rows,
        layout: options.layout || draft.layout,
        rpgMakerFamily: options.rpgMakerFamily !== undefined ? options.rpgMakerFamily : draft.rpgMakerFamily,
        isDollar: draft.isDollar,
        isBang: draft.isBang,
        storageBackend: stored.backend,
        storagePath: stored.path,
        downloadUrl: stored.downloadUrl,
        thumbnailDataUrl: thumbnail,
        createdAt: Date.now(),
        createdBy: options.createdBy,
        notes: options.notes || draft.warnings.join(' '),
      };

      report('registering', 'Registering asset…', 85);
      this.imageCache.set(assetId, img);
      const persisted = await this.persistMetadata(meta);

      report('done', persisted.cloud ? 'Asset imported and synced.' : 'Asset imported locally.', 100);
      if (!persisted.cloud && persisted.error) {
        console.warn('[AssetRegistry] Cloud metadata write failed; kept locally.', persisted.error);
      }
      return { ok: true, asset: meta, cloudPersisted: persisted.cloud };
    } catch (err) {
      report('failed', (err as Error).message, 100);
      return { ok: false, error: (err as Error).message, cloudPersisted: false };
    }
  }

  /** Updates editable metadata (layout overrides, names, categories). */
  async updateAsset(assetId: string, updates: Partial<AssetMetadata>): Promise<void> {
    const existing = this.assets.get(assetId);
    if (!existing) throw new Error(`Asset ${assetId} not found`);
    const next: AssetMetadata = { ...existing, ...updates, id: assetId };
    this.invalidateImage(assetId);
    await this.persistMetadata(next);
  }

  async deleteAsset(assetId: string): Promise<void> {
    const meta = this.assets.get(assetId);
    if (!meta) return;
    this.assets.delete(assetId);
    this.imageCache.delete(assetId);
    this.saveLocalMirror();
    this.emit();
    await deleteAssetBinary(meta.storagePath);
    try {
      const { db } = await import('./firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'assets', assetId));
    } catch (err) {
      console.warn('[AssetRegistry] Cloud delete failed (local removal applied).', err);
    }
  }
}

export const assetRegistry = new AssetRegistry();
