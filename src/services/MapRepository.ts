/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OfficeMapData } from '../types/game';
import { OFFICE_MAPS } from '../game/maps/officeMaps';

export interface IMapRepository {
  getMap(mapId: string): Promise<OfficeMapData>;
  saveMap(map: OfficeMapData): Promise<void>;
  resetMap(mapId: string): Promise<OfficeMapData>;
  exportMapJson(map: OfficeMapData): string;
  importMapJson(jsonString: string): OfficeMapData;
}

export class LocalStorageMapRepository implements IMapRepository {
  private storagePrefix = 'gathergrid_map_';

  async getMap(mapId: string): Promise<OfficeMapData> {
    const raw = localStorage.getItem(`${this.storagePrefix}${mapId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as OfficeMapData;
        if (this.validateMapData(parsed)) {
          return parsed;
        }
      } catch (err) {
        console.warn(`Failed to parse saved map "${mapId}" from localStorage. Falling back to default.`, err);
      }
    }

    const factory = OFFICE_MAPS[mapId] || OFFICE_MAPS['main_office'];
    return factory();
  }

  async saveMap(map: OfficeMapData): Promise<void> {
    if (!this.validateMapData(map)) {
      throw new Error('Invalid map structure. Cannot save to storage.');
    }
    const versionedMap: OfficeMapData = {
      ...map,
      version: (map.version || 1) + 1,
    };
    localStorage.setItem(`${this.storagePrefix}${map.id}`, JSON.stringify(versionedMap));
  }

  async resetMap(mapId: string): Promise<OfficeMapData> {
    localStorage.removeItem(`${this.storagePrefix}${mapId}`);
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

export const mapRepository = new LocalStorageMapRepository();
