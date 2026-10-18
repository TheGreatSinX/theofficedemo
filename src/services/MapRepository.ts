/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Map repository abstraction. All repositories normalize documents through
 * the schema-v2 migration and re-derive legacy grid fields on save.
 */

import { OfficeMapData } from '../types/game';
import { OFFICE_MAP_IDS, hasFactoryMap, getFactoryMap } from '../game/maps/officeMaps';
import { migrateMapData, serializeMapForStorage, validateMapData } from '../game/maps/mapSchema';

export interface MapSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  status?: 'draft' | 'published';
  updatedAt?: number;
  isFactory: boolean;
  objectCount?: number;
}

export interface SaveMapResult {
  persistedToCloud: boolean;
}

export interface IMapRepository {
  getMap(mapId: string): Promise<OfficeMapData>;
  listMaps(): Promise<MapSummary[]>;
  saveMap(map: OfficeMapData): Promise<SaveMapResult>;
  resetMap(mapId: string): Promise<OfficeMapData>;
  deleteMap(mapId: string): Promise<void>;
  exportMapJson(map: OfficeMapData): string;
  importMapJson(jsonString: string): OfficeMapData;
}

/** Normalizes any raw document (v1 or v2) into a v2 map object. */
export function normalizeMapDocument(raw: OfficeMapData): OfficeMapData {
  const { map } = migrateMapData(raw);
  return map;
}

export function summarizeMap(map: OfficeMapData, extra?: Partial<MapSummary>): MapSummary {
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    isFactory: hasFactoryMap(map.id),
    objectCount: map.objects?.length ?? 0,
    ...extra,
  };
}

export class LocalStorageMapRepository implements IMapRepository {
  private storagePrefix = 'gathergrid_map_';

  async getMap(mapId: string): Promise<OfficeMapData> {
    const raw = localStorage.getItem(`${this.storagePrefix}${mapId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as OfficeMapData;
        const normalized = normalizeMapDocument(parsed);
        if (validateMapData(normalized).valid) return normalized;
      } catch (err) {
        console.warn(`Failed to parse saved map "${mapId}" from localStorage. Falling back to default.`, err);
      }
    }
    return getFactoryMap(mapId);
  }

  async listMaps(): Promise<MapSummary[]> {
    const summaries = new Map<string, MapSummary>();
    for (const id of OFFICE_MAP_IDS) {
      summaries.set(id, summarizeMap(getFactoryMap(id)));
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.storagePrefix)) continue;
      const mapId = key.slice(this.storagePrefix.length);
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '') as OfficeMapData;
        const normalized = normalizeMapDocument(parsed);
        summaries.set(mapId, summarizeMap(normalized));
      } catch {
        // ignore corrupt entries
      }
    }
    return Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveMap(map: OfficeMapData): Promise<SaveMapResult> {
    const serialized = serializeMapForStorage(map);
    const result = validateMapData(serialized);
    if (!result.valid) {
      throw new Error(`Invalid map structure. Cannot save: ${result.errors.join(' ')}`);
    }
    const versionedMap: OfficeMapData = { ...serialized, version: (map.version || 1) + 1 };
    localStorage.setItem(`${this.storagePrefix}${map.id}`, JSON.stringify(versionedMap));
    return { persistedToCloud: false };
  }

  async resetMap(mapId: string): Promise<OfficeMapData> {
    localStorage.removeItem(`${this.storagePrefix}${mapId}`);
    return getFactoryMap(mapId);
  }

  async deleteMap(mapId: string): Promise<void> {
    localStorage.removeItem(`${this.storagePrefix}${mapId}`);
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
    const normalized = normalizeMapDocument(parsed as OfficeMapData);
    const result = validateMapData(normalized);
    if (!result.valid) {
      throw new Error(`Imported map is invalid: ${result.errors.join(' ')}`);
    }
    return normalized;
  }
}

export const mapRepository = new LocalStorageMapRepository();
