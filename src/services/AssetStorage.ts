/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asset binary storage.
 *
 * Originals are always written to IndexedDB (persistent, offline-safe). When
 * the Firebase Storage bucket is reachable for the signed-in user the blob is
 * additionally mirrored to the cloud so other users can download the original
 * asset on demand. Rendering never depends on the cloud copy: the local cache
 * is the runtime source of truth and downloads are re-cached.
 *
 * If cloud storage is unavailable (missing bucket config or rules not
 * deployed) the app remains fully functional with local storage; the Asset
 * Manager surfaces the storage mode so the limitation is explicit.
 */

const DB_NAME = 'gathergrid_assets';
const DB_VERSION = 1;
const STORE = 'files';

export interface AssetStorageDescriptor {
  local: 'indexeddb';
  cloud: 'firebase' | 'unavailable';
  cloudDetail: string;
}

export interface SaveBinaryResult {
  backend: 'indexeddb' | 'firebase';
  path: string;
  downloadUrl?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open asset database'));
  });
  return dbPromise;
}

async function idbPut(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save asset binary'));
  });
}

async function idbGet(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) || null);
    req.onerror = () => reject(req.error || new Error('Failed to read asset binary'));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to delete asset binary'));
  });
}

export function assetStorageKey(assetId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
  return `assets/${assetId}/${safeName}`;
}

// ---------------------------------------------------------------------------
// Firebase Storage (optional mirror)
// ---------------------------------------------------------------------------

let cloudState: 'unknown' | 'available' | 'unavailable' = 'unknown';
let cloudDetail = 'Not checked yet.';

async function getFirebaseStorageModule(): Promise<typeof import('firebase/storage') | null> {
  try {
    return await import('firebase/storage');
  } catch (err) {
    cloudState = 'unavailable';
    cloudDetail = `firebase/storage module unavailable: ${(err as Error).message}`;
    return null;
  }
}

async function getBucket() {
  const mod = await getFirebaseStorageModule();
  if (!mod) return null;
  try {
    const { app } = await import('./firebase');
    const storage = mod.getStorage(app);
    return { storage, mod };
  } catch (err) {
    cloudState = 'unavailable';
    cloudDetail = `Storage bucket unavailable: ${(err as Error).message}`;
    return null;
  }
}

async function cloudUpload(path: string, blob: Blob): Promise<string | undefined> {
  const bucket = await getBucket();
  if (!bucket) return undefined;
  try {
    const { storage, mod } = bucket;
    const objectRef = mod.ref(storage, path);
    await mod.uploadBytes(objectRef, blob, { contentType: blob.type || 'image/png' });
    const url = await mod.getDownloadURL(objectRef);
    cloudState = 'available';
    cloudDetail = 'Firebase Storage mirror active.';
    return url;
  } catch (err) {
    cloudState = 'unavailable';
    cloudDetail = `Cloud upload failed (${(err as Error).message}). Assets remain available locally; deploy Storage rules to enable cloud persistence.`;
    return undefined;
  }
}

async function cloudDownload(path: string): Promise<Blob | null> {
  const bucket = await getBucket();
  if (!bucket) return null;
  try {
    const { storage, mod } = bucket;
    const objectRef = mod.ref(storage, path);
    const blob = await mod.getBlob(objectRef);
    cloudState = 'available';
    return blob;
  } catch {
    return null;
  }
}

async function cloudDelete(path: string): Promise<void> {
  const bucket = await getBucket();
  if (!bucket) return;
  try {
    const { storage, mod } = bucket;
    await mod.deleteObject(mod.ref(storage, path));
  } catch {
    // Cloud copy may not exist — local deletion still proceeds.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function describeAssetStorage(): AssetStorageDescriptor {
  return {
    local: 'indexeddb',
    cloud: cloudState === 'available' ? 'firebase' : 'unavailable',
    cloudDetail,
  };
}

/** Persists an original asset binary (local first, then optional cloud mirror). */
export async function saveAssetBinary(
  assetId: string,
  fileName: string,
  blob: Blob
): Promise<SaveBinaryResult> {
  const path = assetStorageKey(assetId, fileName);
  await idbPut(path, blob);
  const downloadUrl = await cloudUpload(path, blob);
  return {
    backend: downloadUrl ? 'firebase' : 'indexeddb',
    path,
    downloadUrl,
  };
}

/** Loads an original asset binary, preferring the local cache. */
export async function loadAssetBinary(storagePath: string, downloadUrl?: string): Promise<Blob | null> {
  try {
    const local = await idbGet(storagePath);
    if (local) return local;
  } catch {
    // fall through to cloud
  }
  if (downloadUrl) {
    const remote = await cloudDownload(storagePath);
    if (remote) {
      try {
        await idbPut(storagePath, remote);
      } catch {
        // cache write is best-effort
      }
      return remote;
    }
  }
  return null;
}

export async function deleteAssetBinary(storagePath: string): Promise<void> {
  try {
    await idbDelete(storagePath);
  } catch {
    // ignore local deletion failures
  }
  await cloudDelete(storagePath);
}

export async function clearLocalAssetCache(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to clear asset cache'));
  });
}
