/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor edit commands with exact inversion — powers undo/redo and dirty
 * tracking. Commands are plain serializable objects so they can be unit
 * tested and (in principle) broadcast between collaborators.
 */

import {
  InteractionZone,
  MapLayerData,
  MapObject,
  MapSpawnPoint,
  MapTilesetRef,
  OfficeMapData,
} from '../types/game';
import { assignTilesetIds, getCollisionLayer, getTileLayer } from './maps/mapSchema';

// ---------------------------------------------------------------------------
// Command model
// ---------------------------------------------------------------------------

export interface CellChange<T> {
  x: number;
  y: number;
  prev: T;
  next: T;
}

export interface ResizeSnapshot {
  width: number;
  height: number;
  layers: MapLayerData[];
  objects: MapObject[];
  interactionZones: InteractionZone[];
  spawnPoints: MapSpawnPoint[];
  spawnPoint: { tileX: number; tileY: number; direction: OfficeMapData['spawnPoint']['direction'] };
}

export type EditCommand =
  | { kind: 'tiles'; layerId: string; changes: Array<CellChange<number>> }
  | { kind: 'collision'; changes: Array<CellChange<boolean>> }
  | { kind: 'object.add'; object: MapObject }
  | { kind: 'object.remove'; object: MapObject }
  | { kind: 'object.update'; id: string; prev: Partial<MapObject>; next: Partial<MapObject> }
  | { kind: 'zone.add'; zone: InteractionZone }
  | { kind: 'zone.remove'; zone: InteractionZone }
  | { kind: 'zone.update'; id: string; prev: Partial<InteractionZone>; next: Partial<InteractionZone> }
  | { kind: 'spawn.add'; spawn: MapSpawnPoint }
  | { kind: 'spawn.remove'; spawn: MapSpawnPoint }
  | { kind: 'spawn.update'; id: string; prev: Partial<MapSpawnPoint>; next: Partial<MapSpawnPoint> }
  | { kind: 'layer.add'; layer: MapLayerData }
  | { kind: 'layer.remove'; layer: MapLayerData }
  | { kind: 'layer.update'; id: string; prev: Partial<MapLayerData>; next: Partial<MapLayerData> }
  | { kind: 'tileset.add'; tileset: MapTilesetRef }
  | { kind: 'tileset.remove'; tileset: MapTilesetRef }
  | { kind: 'map.meta'; prev: Partial<OfficeMapData>; next: Partial<OfficeMapData> }
  | { kind: 'map.resize'; prev: ResizeSnapshot; next: ResizeSnapshot };

// ---------------------------------------------------------------------------
// Apply / invert
// ---------------------------------------------------------------------------

export function applyCommand(map: OfficeMapData, command: EditCommand): void {
  switch (command.kind) {
    case 'tiles': {
      const layer = getTileLayer(map, command.layerId);
      if (!layer || !layer.tiles) return;
      for (const change of command.changes) {
        const row = layer.tiles[change.y];
        if (!row) continue;
        row[change.x] = change.next;
      }
      return;
    }
    case 'collision': {
      const layer = getCollisionLayer(map);
      if (!layer || !layer.mask) return;
      for (const change of command.changes) {
        const row = layer.mask[change.y];
        if (!row) continue;
        row[change.x] = change.next;
      }
      return;
    }
    case 'object.add': {
      map.objects = map.objects.filter((o) => o.id !== command.object.id);
      map.objects.push(command.object);
      return;
    }
    case 'object.remove': {
      map.objects = map.objects.filter((o) => o.id !== command.object.id);
      return;
    }
    case 'object.update': {
      map.objects = map.objects.map((o) => (o.id === command.id ? { ...o, ...command.next } : o));
      return;
    }
    case 'zone.add': {
      map.interactionZones = map.interactionZones.filter((z) => z.id !== command.zone.id);
      map.interactionZones.push(command.zone);
      return;
    }
    case 'zone.remove': {
      map.interactionZones = map.interactionZones.filter((z) => z.id !== command.zone.id);
      return;
    }
    case 'zone.update': {
      map.interactionZones = map.interactionZones.map((z) =>
        z.id === command.id ? { ...z, ...command.next } : z
      );
      return;
    }
    case 'spawn.add': {
      const spawns = map.spawnPoints || [];
      map.spawnPoints = [...spawns.filter((s) => s.id !== command.spawn.id), command.spawn];
      return;
    }
    case 'spawn.remove': {
      map.spawnPoints = (map.spawnPoints || []).filter((s) => s.id !== command.spawn.id);
      return;
    }
    case 'spawn.update': {
      map.spawnPoints = (map.spawnPoints || []).map((s) =>
        s.id === command.id ? { ...s, ...command.next } : s
      );
      syncPrimarySpawn(map);
      return;
    }
    case 'layer.add': {
      const layers = map.layers || [];
      map.layers = [...layers.filter((l) => l.id !== command.layer.id), command.layer];
      return;
    }
    case 'layer.remove': {
      map.layers = (map.layers || []).filter((l) => l.id !== command.layer.id);
      return;
    }
    case 'layer.update': {
      map.layers = (map.layers || []).map((l) =>
        l.id === command.id ? { ...l, ...command.next } : l
      );
      return;
    }
    case 'tileset.add': {
      const tilesets = (map.tilesets || []).filter((t) => t.id !== command.tileset.id);
      tilesets.push(command.tileset);
      assignTilesetIds(tilesets);
      map.tilesets = tilesets;
      return;
    }
    case 'tileset.remove': {
      const tilesets = (map.tilesets || []).filter((t) => t.id !== command.tileset.id);
      assignTilesetIds(tilesets);
      map.tilesets = tilesets;
      return;
    }
    case 'map.meta': {
      Object.assign(map, command.next);
      return;
    }
    case 'map.resize': {
      restoreResizeSnapshot(map, command.next);
      return;
    }
    default:
      return;
  }
}

export function invertCommand(command: EditCommand): EditCommand {
  switch (command.kind) {
    case 'tiles':
    case 'collision':
      return {
        ...command,
        changes: (command.changes as Array<CellChange<number | boolean>>).map((c) => ({
          ...c,
          prev: c.next,
          next: c.prev,
        })) as never,
      };
    case 'object.add':
      return { kind: 'object.remove', object: command.object };
    case 'object.remove':
      return { kind: 'object.add', object: command.object };
    case 'object.update':
      return { kind: 'object.update', id: command.id, prev: command.next, next: command.prev };
    case 'zone.add':
      return { kind: 'zone.remove', zone: command.zone };
    case 'zone.remove':
      return { kind: 'zone.add', zone: command.zone };
    case 'zone.update':
      return { kind: 'zone.update', id: command.id, prev: command.next, next: command.prev };
    case 'spawn.add':
      return { kind: 'spawn.remove', spawn: command.spawn };
    case 'spawn.remove':
      return { kind: 'spawn.add', spawn: command.spawn };
    case 'spawn.update':
      return { kind: 'spawn.update', id: command.id, prev: command.next, next: command.prev };
    case 'layer.add':
      return { kind: 'layer.remove', layer: command.layer };
    case 'layer.remove':
      return { kind: 'layer.add', layer: command.layer };
    case 'layer.update':
      return { kind: 'layer.update', id: command.id, prev: command.next, next: command.prev };
    case 'tileset.add':
      return { kind: 'tileset.remove', tileset: command.tileset };
    case 'tileset.remove':
      return { kind: 'tileset.add', tileset: command.tileset };
    case 'map.meta':
      return { kind: 'map.meta', prev: command.next, next: command.prev };
    case 'map.resize':
      return { kind: 'map.resize', prev: command.next, next: command.prev };
    default:
      return command;
  }
}

/** Human label used by undo/redo buttons and toasts. */
export function describeCommand(command: EditCommand): string {
  switch (command.kind) {
    case 'tiles':
      return `Paint ${command.changes.length} tile(s)`;
    case 'collision':
      return `Toggle collision (${command.changes.length})`;
    case 'object.add':
      return `Place ${command.object.name || command.object.type}`;
    case 'object.remove':
      return `Delete ${command.object.name || command.object.type}`;
    case 'object.update':
      return 'Move/edit object';
    case 'zone.add':
      return `Add zone "${command.zone.name}"`;
    case 'zone.remove':
      return `Remove zone "${command.zone.name}"`;
    case 'zone.update':
      return 'Edit zone';
    case 'spawn.add':
      return `Add spawn "${command.spawn.name}"`;
    case 'spawn.remove':
      return `Remove spawn "${command.spawn.name}"`;
    case 'spawn.update':
      return 'Move spawn point';
    case 'layer.add':
      return `Add layer "${command.layer.name}"`;
    case 'layer.remove':
      return `Remove layer "${command.layer.name}"`;
    case 'layer.update':
      return 'Edit layer';
    case 'tileset.add':
      return `Add tileset "${command.tileset.name}"`;
    case 'tileset.remove':
      return `Remove tileset "${command.tileset.name}"`;
    case 'map.meta':
      return 'Edit map settings';
    case 'map.resize':
      return `Resize map to ${command.next.width}×${command.next.height}`;
    default:
      return 'Edit';
  }
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

export function captureResizeSnapshot(map: OfficeMapData): ResizeSnapshot {
  return {
    width: map.width,
    height: map.height,
    layers: JSON.parse(JSON.stringify(map.layers || [])),
    objects: JSON.parse(JSON.stringify(map.objects)),
    interactionZones: JSON.parse(JSON.stringify(map.interactionZones)),
    spawnPoints: JSON.parse(JSON.stringify(map.spawnPoints || [])),
    spawnPoint: { ...map.spawnPoint },
  };
}

export function restoreResizeSnapshot(map: OfficeMapData, snapshot: ResizeSnapshot): void {
  map.width = snapshot.width;
  map.height = snapshot.height;
  map.layers = JSON.parse(JSON.stringify(snapshot.layers));
  map.objects = JSON.parse(JSON.stringify(snapshot.objects));
  map.interactionZones = JSON.parse(JSON.stringify(snapshot.interactionZones));
  map.spawnPoints = JSON.parse(JSON.stringify(snapshot.spawnPoints));
  map.spawnPoint = { ...snapshot.spawnPoint };
}

/** Mirrors the first spawn point into the legacy `spawnPoint` field. */
export function syncPrimarySpawn(map: OfficeMapData): void {
  const first = (map.spawnPoints || [])[0];
  if (first) {
    map.spawnPoint = { tileX: first.tileX, tileY: first.tileY, direction: first.direction };
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  commands: EditCommand[];
  label: string;
  timestamp: number;
}

export class EditHistory {
  private entries: HistoryEntry[] = [];
  private index = 0; // number of applied entries
  private savedIndex = 0;
  public maxDepth = 80;

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length;
  }

  get isDirty(): boolean {
    return this.index !== this.savedIndex;
  }

  get undoLabel(): string | null {
    return this.canUndo ? this.entries[this.index - 1].label : null;
  }

  get redoLabel(): string | null {
    return this.canRedo ? this.entries[this.index].label : null;
  }

  get depth(): number {
    return this.entries.length;
  }

  get position(): number {
    return this.index;
  }

  /** Records an applied transaction. Clears the redo tail. */
  push(commands: EditCommand[], label?: string): void {
    if (commands.length === 0) return;
    // Drop redo tail
    this.entries = this.entries.slice(0, this.index);
    const entry: HistoryEntry = {
      commands: commands.map((c) => JSON.parse(JSON.stringify(c)) as EditCommand),
      label: label || describeCommand(commands[commands.length - 1]),
      timestamp: Date.now(),
    };
    this.entries.push(entry);

    // Trim from the front when exceeding the depth cap
    if (this.entries.length > this.maxDepth) {
      const overflow = this.entries.length - this.maxDepth;
      this.entries.splice(0, overflow);
      this.savedIndex = Math.max(0, this.savedIndex - overflow);
    }

    this.index = this.entries.length;
  }

  /**
   * Moves back one transaction and returns the commands that must be applied
   * to the map to undo it (already inverted, in reverse order). Returns null
   * when there is nothing to undo. The map itself is not mutated — the caller
   * decides how to apply the returned commands.
   */
  undo(): EditCommand[] | null {
    if (!this.canUndo) return null;
    const entry = this.entries[this.index - 1];
    const inverses = [...entry.commands].reverse().map((command) => invertCommand(command));
    this.index--;
    return inverses;
  }

  /**
   * Moves forward one transaction and returns the commands to re-apply.
   * The map itself is not mutated.
   */
  redo(): EditCommand[] | null {
    if (!this.canRedo) return null;
    const entry = this.entries[this.index];
    this.index++;
    return entry.commands.map((command) => JSON.parse(JSON.stringify(command)) as EditCommand);
  }

  /** Marks the current position as the saved state. */
  markSaved(): void {
    this.savedIndex = this.index;
  }

  clear(): void {
    this.entries = [];
    this.index = 0;
    this.savedIndex = 0;
  }
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

export function buildTileChanges(
  prevGrid: number[][],
  cells: Array<{ x: number; y: number; tileId: number }>
): Array<CellChange<number>> {
  const changes: Array<CellChange<number>> = [];
  for (const cell of cells) {
    const prev = prevGrid[cell.y]?.[cell.x] ?? -1;
    if (prev === cell.tileId) continue;
    changes.push({ x: cell.x, y: cell.y, prev, next: cell.tileId });
  }
  return changes;
}

export function buildCollisionChanges(
  prevGrid: boolean[][],
  cells: Array<{ x: number; y: number; solid: boolean }>
): Array<CellChange<boolean>> {
  const changes: Array<CellChange<boolean>> = [];
  for (const cell of cells) {
    const prev = prevGrid[cell.y]?.[cell.x] === true;
    if (prev === cell.solid) continue;
    changes.push({ x: cell.x, y: cell.y, prev, next: cell.solid });
  }
  return changes;
}
