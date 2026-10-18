/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * World repository — persistent grouping of maps (floors, zones, campuses)
 * with connection metadata derived from door/portal zones.
 *
 * Storage: `worlds/{worldId}` in Firestore with a localStorage mirror so the
 * world list survives fully offline sessions.
 */

import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { WORLD_SCHEMA_VERSION, WorldData, WorldMapEntry } from '../types/game';

const LOCAL_KEY = 'gathergrid_worlds_v1';

export interface WorldSummary {
  id: string;
  name: string;
  mapCount: number;
  updatedAt?: number;
  isLocal: boolean;
}

function makeWorldId(): string {
  return `world_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

export function createWorldData(name: string, maps: WorldMapEntry[] = [], description?: string): WorldData {
  return {
    id: makeWorldId(),
    name: name.trim() || 'New World',
    description,
    schemaVersion: WORLD_SCHEMA_VERSION,
    version: 1,
    maps,
  };
}

export class WorldRepository {
  private readLocal(): WorldData[] {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as WorldData[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeLocal(worlds: WorldData[]): void {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(worlds));
    } catch (err) {
      console.warn('[WorldRepository] Failed to persist local worlds.', err);
    }
  }

  private upsertLocal(world: WorldData): void {
    const worlds = this.readLocal().filter((w) => w.id !== world.id);
    worlds.push(world);
    this.writeLocal(worlds);
  }

  async listWorlds(): Promise<WorldSummary[]> {
    const summaries = new Map<string, WorldSummary>();

    // Local mirror first (instant, offline-safe)
    for (const world of this.readLocal()) {
      summaries.set(world.id, {
        id: world.id,
        name: world.name,
        mapCount: world.maps?.length ?? 0,
        isLocal: true,
      });
    }

    try {
      const snap = await getDocs(collection(db, 'worlds'));
      snap.forEach((docSnap) => {
        const world = docSnap.data() as WorldData;
        if (!world?.id) return;
        summaries.set(world.id, {
          id: world.id,
          name: world.name,
          mapCount: world.maps?.length ?? 0,
          updatedAt: toMillis(world.updatedAt),
          isLocal: false,
        });
      });
    } catch (err) {
      console.warn('[WorldRepository] Cloud list failed; using local mirror.', err);
    }

    return Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWorld(worldId: string): Promise<WorldData | null> {
    try {
      const snap = await getDoc(doc(db, 'worlds', worldId));
      if (snap.exists()) {
        const world = snap.data() as WorldData;
        this.upsertLocal(world);
        return world;
      }
    } catch (err) {
      console.warn(`[WorldRepository] getWorld(${worldId}) failed; trying local.`, err);
    }
    return this.readLocal().find((w) => w.id === worldId) ?? null;
  }

  async saveWorld(world: WorldData): Promise<{ persistedToCloud: boolean }> {
    const next: WorldData = { ...world, version: (world.version || 1) + 1 };
    this.upsertLocal(next);

    if (!auth.currentUser) return { persistedToCloud: false };

    try {
      await setDoc(
        doc(db, 'worlds', next.id),
        { ...next, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() },
        { merge: true }
      );
      return { persistedToCloud: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `worlds/${next.id}`);
      return { persistedToCloud: false };
    }
  }

  async deleteWorld(worldId: string): Promise<void> {
    this.writeLocal(this.readLocal().filter((w) => w.id !== worldId));
    try {
      await deleteDoc(doc(db, 'worlds', worldId));
    } catch (err) {
      console.warn('[WorldRepository] Cloud delete failed (local removal applied).', err);
    }
  }

  /**
   * Ensures at least one world exists, seeded with the factory maps.
   * Returns the world list after the check.
   */
  async ensureDefaultWorld(factoryMaps: Array<{ id: string; name: string }>): Promise<WorldSummary[]> {
    const worlds = await this.listWorlds();
    if (worlds.length > 0) return worlds;

    const world = createWorldData(
      'Main Campus',
      factoryMaps.map((m, index) => ({ mapId: m.id, name: m.name, order: index })),
      'Default world containing the factory office maps.'
    );
    await this.saveWorld(world);
    return this.listWorlds();
  }
}

function toMillis(value: unknown): number | undefined {
  if (!value) return undefined;
  const maybe = value as { toMillis?: () => number; seconds?: number };
  if (typeof maybe.toMillis === 'function') return maybe.toMillis();
  if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  return undefined;
}

export const worldRepository = new WorldRepository();
