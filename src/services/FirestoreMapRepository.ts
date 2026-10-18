/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { OfficeMapData } from '../types/game';
import { OFFICE_MAPS } from '../game/maps/officeMaps';
import { IMapRepository } from './MapRepository';

export interface StoredOfficeMapRecord {
  id: string;
  name: string;
  description?: string;
  schemaVersion: number;
  mapVersion: number;
  status: 'draft' | 'published';
  mapData: OfficeMapData;
  createdBy?: string;
  updatedBy?: string;
  publishedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  publishedAt?: unknown;
}

export class FirestoreMapRepository implements IMapRepository {
  private localFallbackPrefix = 'gathergrid_map_';

  async getMap(mapId: string): Promise<OfficeMapData> {
    const mapDocRef = doc(db, 'officeMaps', mapId);

    try {
      const snap = await getDoc(mapDocRef);
      if (snap.exists()) {
        const record = snap.data() as StoredOfficeMapRecord;
        if (record && record.mapData && this.validateMapData(record.mapData)) {
          return record.mapData;
        }
      }
    } catch (err) {
      console.warn(`Firestore getMap failed for ${mapId}, checking fallback...`, err);
    }

    // Fallback to local storage or factory defaults
    const raw = localStorage.getItem(`${this.localFallbackPrefix}${mapId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (this.validateMapData(parsed)) {
          return parsed;
        }
      } catch {
        // Fallback to built-in map
      }
    }

    const factory = OFFICE_MAPS[mapId] || OFFICE_MAPS['main_office'];
    return factory();
  }

  async getMapRecord(mapId: string): Promise<StoredOfficeMapRecord | null> {
    const mapDocRef = doc(db, 'officeMaps', mapId);
    try {
      const snap = await getDoc(mapDocRef);
      if (snap.exists()) {
        return snap.data() as StoredOfficeMapRecord;
      }
    } catch (err) {
      console.warn(`Firestore getMapRecord error for ${mapId}:`, err);
    }
    return null;
  }

  async saveMap(map: OfficeMapData): Promise<void> {
    return this.saveMapDraft(map);
  }

  async saveMapDraft(map: OfficeMapData): Promise<void> {
    if (!this.validateMapData(map)) {
      throw new Error('Invalid map structure. Cannot save draft.');
    }

    const mapDocRef = doc(db, 'officeMaps', map.id);
    const currentUser = auth.currentUser;

    if (!currentUser) {
      // Offline / unauthenticated fallback to local storage
      localStorage.setItem(`${this.localFallbackPrefix}${map.id}`, JSON.stringify(map));
      return;
    }

    try {
      // Check for version conflict
      const existingSnap = await getDoc(mapDocRef);
      let currentVersion = 1;
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as StoredOfficeMapRecord;
        currentVersion = (existingData.mapVersion || 1) + 1;
      }

      const updatedMap: OfficeMapData = {
        ...map,
        version: currentVersion,
      };

      const payload: StoredOfficeMapRecord = {
        id: map.id,
        name: map.name,
        schemaVersion: 1,
        mapVersion: currentVersion,
        status: 'draft',
        mapData: updatedMap,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      await setDoc(mapDocRef, payload, { merge: true });
      // Keep local storage synced as well
      localStorage.setItem(`${this.localFallbackPrefix}${map.id}`, JSON.stringify(updatedMap));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `officeMaps/${map.id}`);
    }
  }

  async publishMap(map: OfficeMapData): Promise<void> {
    if (!this.validateMapData(map)) {
      throw new Error('Invalid map structure. Cannot publish.');
    }

    const mapDocRef = doc(db, 'officeMaps', map.id);
    const platformConfigRef = doc(db, 'platformConfig', 'general');
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error('You must be signed in as an administrator to publish maps.');
    }

    try {
      const existingSnap = await getDoc(mapDocRef);
      const nextVersion = existingSnap.exists()
        ? ((existingSnap.data() as StoredOfficeMapRecord).mapVersion || 1) + 1
        : 1;

      const publishedMap: OfficeMapData = {
        ...map,
        version: nextVersion,
      };

      const mapPayload: StoredOfficeMapRecord = {
        id: map.id,
        name: map.name,
        schemaVersion: 1,
        mapVersion: nextVersion,
        status: 'published',
        mapData: publishedMap,
        updatedBy: currentUser.uid,
        publishedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
      };

      await setDoc(mapDocRef, mapPayload, { merge: true });

      // Update platform configuration
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
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `officeMaps/${map.id}`);
    }
  }

  async resetMap(mapId: string): Promise<OfficeMapData> {
    localStorage.removeItem(`${this.localFallbackPrefix}${mapId}`);
    const factory = OFFICE_MAPS[mapId] || OFFICE_MAPS['main_office'];
    return factory();
  }

  exportMapJson(map: OfficeMapData): string {
    return JSON.stringify(map, null, 2);
  }

  importMapJson(jsonString: string): OfficeMapData {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Malformed JSON string. Please verify the map file format.');
    }

    if (!this.validateMapData(parsed as OfficeMapData)) {
      throw new Error('JSON is missing mandatory map fields (id, dimensions, floorTiles, solidMask).');
    }

    return parsed as OfficeMapData;
  }

  private validateMapData(data: OfficeMapData): boolean {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.id !== 'string' || typeof data.name !== 'string') return false;
    if (typeof data.width !== 'number' || typeof data.height !== 'number') return false;
    if (!Array.isArray(data.floorTiles) || !Array.isArray(data.solidMask)) return false;
    if (data.floorTiles.length !== data.height) return false;
    return true;
  }
}

export const firestoreMapRepository = new FirestoreMapRepository();
