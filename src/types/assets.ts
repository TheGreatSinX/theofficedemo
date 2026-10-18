/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asset metadata model for the persistent asset library.
 */

export type AssetCategory =
  | 'tileset'
  | 'autotile'
  | 'character'
  | 'object'
  | 'decoration'
  | 'door'
  | 'plant'
  | 'prop'
  | 'audio';

export const ASSET_CATEGORIES: Array<{ id: AssetCategory; label: string }> = [
  { id: 'tileset', label: 'Tileset (B/C/D/E)' },
  { id: 'autotile', label: 'Autotile / Terrain (A1–A4)' },
  { id: 'character', label: 'Character Spritesheet' },
  { id: 'object', label: 'Furniture / Object' },
  { id: 'decoration', label: 'Decoration' },
  { id: 'door', label: 'Door / Window' },
  { id: 'plant', label: 'Plant' },
  { id: 'prop', label: 'Prop' },
  { id: 'audio', label: 'Audio (metadata only)' },
];

/** Asset sheet archetype derived from RPG Maker MZ conventions. */
export type AssetLayout =
  | 'character_grid' // 4×2 characters, 3×4 frames each
  | 'character_single' // `$` single character
  | 'tileset_bcde' // 16×16 grid of tiles (MZ 48px) / 16×16 (MV 32px)
  | 'autotile_a' // A1–A4 terrain sheets
  | 'single_image' // one image, no grid
  | 'grid'; // generic uniform grid

export interface AssetMetadata {
  /** Stable registry id (`asset_<timestamp>_<rand>`). */
  id: string;
  name: string;
  category: AssetCategory;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  hasTransparency: boolean;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  layout: AssetLayout;
  /** RPG Maker MZ sheet family (A1–A5 / B–E) when detected. */
  rpgMakerFamily: string | null;
  /** `$` single-character sheet convention. */
  isDollar: boolean;
  /** `!` no-shift character convention. */
  isBang: boolean;
  storageBackend: 'indexeddb' | 'firebase' | 'none';
  /** Path/key under which the original binary is stored. */
  storagePath: string;
  /** Optional Firebase Storage download URL (when mirrored to the cloud). */
  downloadUrl?: string;
  thumbnailDataUrl?: string;
  createdAt: number;
  createdBy?: string;
  /** Free-form notes, e.g. manual layout overrides. */
  notes?: string;
}

export interface AssetImportDraft {
  file: File;
  name: string;
  category: AssetCategory;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  layout: AssetLayout;
  rpgMakerFamily: string | null;
  isDollar: boolean;
  isBang: boolean;
  hasTransparency: boolean;
  warnings: string[];
  errors: string[];
  duplicateOf?: string;
  previewUrl?: string;
}

export interface AssetValidationLimits {
  maxFileBytes: number;
  maxDimension: number;
  minDimension: number;
  allowedMimeTypes: string[];
}

export const DEFAULT_ASSET_LIMITS: AssetValidationLimits = {
  maxFileBytes: 8 * 1024 * 1024, // 8 MB
  maxDimension: 4096,
  minDimension: 8,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
};

export interface AssetValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Assets within a map: reference helpers
// ---------------------------------------------------------------------------

export interface AssetTileRef {
  assetId: string;
  frame: number;
}

/** Human label for a tile/object coming from an imported asset. */
export function describeAssetRef(meta: AssetMetadata | undefined, frame: number | undefined): string {
  if (!meta) return 'Missing asset';
  const frameLabel = typeof frame === 'number' ? ` #${frame}` : '';
  return `${meta.name}${frameLabel}`;
}
