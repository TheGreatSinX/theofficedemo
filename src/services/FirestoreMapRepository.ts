/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firestore-backed map repository with localStorage fallback.
 *
 * Storage model:
 *  - `officeMaps/{mapId}` holds the envelope (status, version, audit fields)
 *    plus the full map document. Map documents are kept compact by referencing
 *    imported assets by id instead of embedding image data.
 *  - schemaVersion 2 documents store layered data; legacy grid fields are
 *    re-derived on save for backwards compatibility.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { MAP_SCHEMA_VERSION, OfficeMapData, StoredMapEnvelope } from '../types/game';
import { OFFICE_MAP_IDS, getFactoryMap, hasFactoryMap } from '../game/maps/officeMaps';
import { migrateMapData, serializeMapForStorage, validateMapData } from '../game/maps/mapSchema';
import { IMapRepository, MapSummary, SaveMapResult, summarizeMap } from './MapRepository';

export type StoredOfficeMapRecord = StoredMapEnvelope;

export class FirestoreMapRepository implements IMapRepository {
  private localFallbackPrefix = 'gathergrid_map_';

  private readLocalFallback(mapId: string): OfficeMapData | null {
    try {
      const raw = localStorage.getItem(`${this.localFallbackPrefix}${mapId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OfficeMapData;
      const { map } = migrateMapData(parsed);
      return validateMapData(map).valid ? map : null;
    } catch {
      return null;
    }
  }

  async getMap(mapId: string): Promise<OfficeMapData> {
    try {
      const snap = await getDoc(doc(db, 'officeMaps', mapId));
      if (snap.exists()) {
        const record = snap.data() as StoredOfficeMapRecord;
        if (record?.mapData) {
          const { map } = migrateMapData(record.mapData);
          if (validateMapData(map).valid) return map;
        }
      }
    } catch (err) {
      console.warn(`Firestore getMap failed for ${mapId}, checking fallback...`, err);
    }

    const local = this.readLocalFallback(mapId);
    if (local) return local;

    return getFactoryMap(mapId);
  }

  async getMapRecord(mapId: string): Promise<StoredOfficeMapRecord | null> {
    try {
      const snap = await getDoc(doc(db, 'officeMaps', mapId));
      if (snap.exists()) return snap.data() as StoredOfficeMapRecord;
    } catch (err) {
      console.warn(`Firestore getMapRecord error for ${mapId}:`, err);
    }
    return null;
  }

  async listMaps(): Promise<MapSummary[]> {
    const summaries = new Map<string, MapSummary>();

    // Factory defaults seed the list.
    for (const id of OFFICE_MAP_IDS) {
      summaries.set(id, summarizeMap(getFactoryMap(id)));
    }

    try {
      const snap = await getDocs(collection(db, 'officeMaps'));
      snap.forEach((docSnap) => {
        const record = docSnap.data() as StoredOfficeMapRecord;
        if (record?.mapData) {
          try {
            const { map } = migrateMapData(record.mapData);
            summaries.set(map.id, {
              ...summarizeMap(map),
              status: record.status,
              updatedAt: toMillis(record.updatedAt),
            });
          } catch {
            // ignore corrupt documents
          }
        }
      });
    } catch (err) {
      console.warn('Firestore listMaps failed, using local + factory maps.', err);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.localFallbackPrefix)) continue;
        const mapId = key.slice(this.localFallbackPrefix.length);
        const local = this.readLocalFallback(mapId);
        if (local) summaries.set(mapId, summarizeMap(local));
      }
    }

    return Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveMap(map: OfficeMapData): Promise<SaveMapResult> {
    return this.saveMapDraft(map);
  }

  /** Saves a draft. Falls back to localStorage when unauthenticated/offline. */
  async saveMapDraft(map: OfficeMapData): Promise<SaveMapResult> {
    const serialized = serializeMapForStorage(map);
    const validity = validateMapData(serialized);
    if (!validity.valid) {
      throw new Error(`Invalid map structure. Cannot save draft: ${validity.errors.join(' ')}`);
    }

    const mapDocRef = doc(db, 'officeMaps', map.id);
    const currentUser = auth.currentUser;

    if (!currentUser) {
      localStorage.setItem(`${this.localFallbackPrefix}${map.id}`, JSON.stringify(serialized));
      return { persistedToCloud: false };
    }

    try {
      const existingSnap = await getDoc(mapDocRef);
      let currentVersion = 1;
      let createdAt: unknown = serverTimestamp();
      let createdBy = currentUser.uid;
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as StoredOfficeMapRecord;
        currentVersion = (existingData.mapVersion || 1) + 1;
        createdAt = existingData.createdAt ?? serverTimestamp();
        createdBy = existingData.createdBy || currentUser.uid;
      }

      const updatedMap: OfficeMapData = { ...serialized, version: currentVersion };

      const payload = {
        id: map.id,
        name: map.name,
        description: map.metadata?.description,
        schemaVersion: MAP_SCHEMA_VERSION,
        mapVersion: currentVersion,
        status: 'draft',
        mapData: updatedMap,
        createdBy,
        updatedBy: currentUser.uid,
        createdAt,
        updatedAt: serverTimestamp(),
      };

      await setDoc(mapDocRef, payload, { merge: true });
      localStorage.setItem(`${this.localFallbackPrefix}${map.id}`, JSON.stringify(updatedMap));
      return { persistedToCloud: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `officeMaps/${map.id}`);
      localStorage.setItem(`${this.localFallbackPrefix}${map.id}`, JSON.stringify(serialized));
      return { persistedToCloud: false };
    }
  }

  async publishMap(map: OfficeMapData): Promise<{ persistedToCloud: boolean }> {
    const serialized = serializeMapForStorage(map);
    const validity = validateMapData(serialized);
    if (!validity.valid) {
      throw new Error(`Invalid map structure. Cannot publish: ${validity.errors.join(' ')}`);
    }

    const mapDocRef = doc(db, 'officeMaps', map.id);
    const platformConfigRef = doc(db, 'platformConfig', 'general');
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error('You must be signed in as an administrator to publish maps.');
    }

    const existingSnap = await getDoc(mapDocRef);
    const nextVersion = existingSnap.exists()
      ? ((existingSnap.data() as StoredOfficeMapRecord).mapVersion || 1) + 1
      : 1;

    const publishedMap: OfficeMapData = { ...serialized, version: nextVersion };

    await setDoc(
      mapDocRef,
      {
        id: map.id,
        name: map.name,
        description: map.metadata?.description,
        schemaVersion: MAP_SCHEMA_VERSION,
        mapVersion: nextVersion,
        status: 'published',
        mapData: publishedMap,
        updatedBy: currentUser.uid,
        publishedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      platformConfigRef,
      {
        platformName: 'GatherGrid RPG Virtual Office',
        activeMapId: map.id,
        publishedMapVersion: nextVersion,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
      },
      { merge: true }
    );

    localStorage.setItem(`${this.localFallbackPrefix}${map.id}`, JSON.stringify(publishedMap));
    return { persistedToCloud: true };
  }

  async resetMap(mapId: string): Promise<OfficeMapData> {
    localStorage.removeItem(`${this.localFallbackPrefix}${mapId}`);
    return getFactoryMap(mapId);
  }

  async deleteMap(mapId: string): Promise<void> {
    localStorage.removeItem(`${this.localFallbackPrefix}${mapId}`);
    if (hasFactoryMap(mapId)) return; // factory maps are never deleted remotely
    await deleteDoc(doc(db, 'officeMaps', mapId));
  }

  exportMapJson(map: OfficeMapData): string {
    return JSON.stringify(serializeMapForStorage(map), null, 2);
  }

  importMapJson(jsonString: string): OfficeMapData {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Malformed JSON string. Please verify the map file format.');
    }
    const { map } = migrateMapData(parsed as OfficeMapData);
    const result = validateMapData(map);
    if (!result.valid) {
      throw new Error(`Imported map is invalid: ${result.errors.join(' ')}`);
    }
    return map;
  }
}

function toMillis(value: unknown): number | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const maybe = value as { toMillis?: () => number; seconds?: number };
  if (typeof maybe.toMillis === 'function') return maybe.toMillis();
  if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  return undefined;
}

export const firestoreMapRepository = new FirestoreMapRepository();
