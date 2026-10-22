/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Map schema v2 — creation, validation, migration, resize, serialization.
 *
 * The v2 model replaces the flat `floorTiles` / `wallTiles` / `solidMask`
 * grids with an ordered list of layers. Legacy (v1) documents are migrated
 * transparently on load; legacy grid fields are re-derived on save so older
 * readers keep working.
 */

import {
  Direction,
  IMPORTED_TILE_ID_BASE,
  InteractionZone,
  MAP_SCHEMA_VERSION,
  MapConnection,
  MapLayerData,
  MapObject,
  MapSpawnPoint,
  MapTilesetRef,
  OfficeMapData,
} from '../../types/game';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BUILTIN_TILESET_ID = 'builtin';

/** Hard ceiling for map dimensions (tiles per axis). */
export const MAX_MAP_DIMENSION = 400;
/** Dimension above which the editor warns about performance. */
export const WARN_MAP_DIMENSION = 128;
/** Maximum number of cells (width * height) allowed for a single map. */
export const MAX_MAP_CELLS = 160_000;
/** Supported tile grid sizes offered by the UI. */
export const SUPPORTED_TILE_SIZES = [16, 32, 48] as const;
export const MIN_TILE_SIZE = 8;
export const MAX_TILE_SIZE = 128;

export interface BuiltinTileDef {
  id: number;
  kind: 'floor' | 'wall';
  label: string;
  color: string;
  textureKey: string;
}

/** Legacy procedural tile catalog (IDs are preserved forever). */
export const BUILTIN_TILES: BuiltinTileDef[] = [
  { id: 0, kind: 'floor', label: 'Wood Parquet', color: '#b48a60', textureKey: 'tile_wood' },
  { id: 1, kind: 'floor', label: 'Blue Carpet', color: '#223348', textureKey: 'tile_carpet_blue' },
  { id: 2, kind: 'floor', label: 'Gray Marble', color: '#2d333b', textureKey: 'tile_gray' },
  { id: 3, kind: 'floor', label: 'Checkered Tile', color: '#d8d4cf', textureKey: 'tile_checkered' },
  { id: 4, kind: 'floor', label: 'Deck Wood', color: '#785b3e', textureKey: 'tile_deck' },
  { id: 5, kind: 'floor', label: 'Garden Grass', color: '#3a6338', textureKey: 'tile_grass' },
  { id: 10, kind: 'wall', label: 'Top Moulding', color: '#1e242d', textureKey: 'wall_top' },
  { id: 11, kind: 'wall', label: 'Modern Drywall', color: '#29303d', textureKey: 'wall_face' },
  { id: 12, kind: 'wall', label: 'Skyline Window', color: '#3b82f6', textureKey: 'wall_window' },
  { id: 13, kind: 'wall', label: 'Glass Partition', color: '#94a3b8', textureKey: 'wall_glass' },
];

export const BUILTIN_TEXTURE_KEY_BY_TILE_ID: Record<number, string> = Object.fromEntries(
  BUILTIN_TILES.map((t) => [t.id, t.textureKey])
);

export const BUILTIN_FLOOR_TILE_IDS = BUILTIN_TILES.filter((t) => t.kind === 'floor').map((t) => t.id);
export const BUILTIN_WALL_TILE_IDS = BUILTIN_TILES.filter((t) => t.kind === 'wall').map((t) => t.id);

/** Legacy procedural object catalog (texture key === type). */
export interface BuiltinObjectDef {
  type: string;
  label: string;
  isSolidByDefault: boolean;
}

/**
 * Object catalog shared by the Studio palette and the renderer.
 * The definition lives in `src/game/assets/objectIds.ts` so the schema tests
 * stay free of asset imports.
 */
export { BUILTIN_OBJECTS } from '../assets/objectIds';
import { BUILTIN_OBJECTS as OBJECT_CATALOG } from '../assets/objectIds';

/** Object catalog with the footprint used when the object is placed. */
export const BUILTIN_OBJECT_FOOTPRINTS = OBJECT_CATALOG;

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

export function createGrid<T>(w: number, h: number, value: T): T[][] {
  const rows: T[][] = new Array(h);
  for (let y = 0; y < h; y++) {
    const row: T[] = new Array(w);
    for (let x = 0; x < w; x++) row[x] = value;
    rows[y] = row;
  }
  return rows;
}

export function createTileGrid(w: number, h: number, fill = -1): number[][] {
  return createGrid<number>(w, h, fill);
}

export function createMaskGrid(w: number, h: number, fill = false): boolean[][] {
  return createGrid<boolean>(w, h, fill);
}

export function makeLayerId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

export function createTileLayer(name: string, w: number, h: number, depthMode: 'ground' | 'row' = 'ground'): MapLayerData {
  return {
    id: makeLayerId('layer'),
    name,
    kind: 'tiles',
    visible: true,
    locked: false,
    order: 0,
    depthMode,
    tiles: createTileGrid(w, h),
  };
}

export function createCollisionLayer(name: string, w: number, h: number): MapLayerData {
  return {
    id: makeLayerId('collision'),
    name,
    kind: 'collision',
    visible: false,
    locked: false,
    order: 1000,
    mask: createMaskGrid(w, h),
  };
}

/** Ensures every layer grid matches the map dimensions (pads with empty values). */
export function normalizeLayerGrids(map: OfficeMapData): void {
  if (!map.layers) return;
  for (const layer of map.layers) {
    if (layer.kind === 'tiles') {
      if (!Array.isArray(layer.tiles)) layer.tiles = createTileGrid(map.width, map.height);
      layer.tiles = normalizeTileGrid(layer.tiles, map.width, map.height);
    } else if (layer.kind === 'collision') {
      if (!Array.isArray(layer.mask)) layer.mask = createMaskGrid(map.width, map.height);
      layer.mask = normalizeMaskGrid(layer.mask, map.width, map.height);
    }
  }
}

function normalizeTileGrid(grid: number[][], w: number, h: number): number[][] {
  const next = createTileGrid(w, h);
  for (let y = 0; y < Math.min(h, grid.length); y++) {
    const row = grid[y] || [];
    for (let x = 0; x < Math.min(w, row.length); x++) {
      const v = row[x];
      next[y][x] = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : -1;
    }
  }
  return next;
}

function normalizeMaskGrid(grid: boolean[][], w: number, h: number): boolean[][] {
  const next = createMaskGrid(w, h);
  for (let y = 0; y < Math.min(h, grid.length); y++) {
    const row = grid[y] || [];
    for (let x = 0; x < Math.min(w, row.length); x++) {
      next[y][x] = row[x] === true;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Layer / tileset accessors
// ---------------------------------------------------------------------------

export function getTileLayers(map: OfficeMapData): MapLayerData[] {
  return (map.layers || [])
    .filter((l) => l.kind === 'tiles' && Array.isArray(l.tiles))
    .sort((a, b) => a.order - b.order);
}

export function getTileLayer(map: OfficeMapData, layerId: string): MapLayerData | undefined {
  return (map.layers || []).find((l) => l.id === layerId && l.kind === 'tiles');
}

export function getCollisionLayer(map: OfficeMapData): MapLayerData | undefined {
  return (map.layers || []).find((l) => l.kind === 'collision');
}

export function getCollisionMask(map: OfficeMapData): boolean[][] {
  const layer = getCollisionLayer(map);
  if (layer && Array.isArray(layer.mask)) return layer.mask;
  if (Array.isArray(map.solidMask)) return map.solidMask;
  return createMaskGrid(map.width, map.height);
}

export function isSolidAt(map: OfficeMapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  const mask = getCollisionMask(map);
  return mask[y]?.[x] === true;
}

export function getBuiltinTileset(dims: { width: number; height: number }): MapTilesetRef {
  void dims;
  return {
    id: BUILTIN_TILESET_ID,
    name: 'Builtin RPG Tiles',
    source: 'builtin',
    tileSize: 32,
    columns: 4,
    rows: 4,
    firstTileId: 0,
    tileCount: 100,
  };
}

/** Re-assigns contiguous global tile ID ranges for imported tilesets. */
export function assignTilesetIds(tilesets: MapTilesetRef[]): void {
  const builtin = tilesets.find((t) => t.source === 'builtin');
  if (builtin) {
    builtin.firstTileId = 0;
    builtin.tileCount = 100;
  }
  let next = IMPORTED_TILE_ID_BASE;
  for (const ts of tilesets) {
    if (ts.source === 'builtin') continue;
    ts.firstTileId = next;
    ts.tileCount = Math.max(1, ts.columns * ts.rows);
    next += ts.tileCount;
  }
}

export function findTilesetForTile(map: OfficeMapData, tileId: number): MapTilesetRef | undefined {
  return (map.tilesets || []).find(
    (ts) => tileId >= ts.firstTileId && tileId < ts.firstTileId + ts.tileCount
  );
}

export function isBuiltinTileId(tileId: number): boolean {
  return tileId >= 0 && tileId < IMPORTED_TILE_ID_BASE;
}

/** Collect tile IDs present in the map that are not covered by any tileset. */
export function collectUnresolvedTileIds(map: OfficeMapData): number[] {
  const unresolved = new Set<number>();
  for (const layer of getTileLayers(map)) {
    for (const row of layer.tiles || []) {
      for (const tileId of row) {
        if (tileId < 0) continue;
        if (!findTilesetForTile(map, tileId)) unresolved.add(tileId);
      }
    }
  }
  return Array.from(unresolved).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Spawns & connections
// ---------------------------------------------------------------------------

export const DEFAULT_SPAWN_ID = 'spawn_default';

export function getSpawnPoints(map: OfficeMapData): MapSpawnPoint[] {
  if (map.spawnPoints && map.spawnPoints.length > 0) return map.spawnPoints;
  return [
    {
      id: DEFAULT_SPAWN_ID,
      name: 'Main Spawn',
      tileX: map.spawnPoint?.tileX ?? 1,
      tileY: map.spawnPoint?.tileY ?? 1,
      direction: map.spawnPoint?.direction ?? 'down',
    },
  ];
}

export function getDefaultSpawn(map: OfficeMapData): MapSpawnPoint {
  const spawns = getSpawnPoints(map);
  return spawns[0];
}

export function findSpawn(map: OfficeMapData, spawnId: string | undefined): MapSpawnPoint | undefined {
  if (!spawnId) return undefined;
  return getSpawnPoints(map).find((s) => s.id === spawnId);
}

/** Connections derived from `door_warp` zones (single source of truth). */
export function getMapConnections(map: OfficeMapData): MapConnection[] {
  const connections: MapConnection[] = [];
  for (const zone of map.interactionZones) {
    if (zone.type !== 'door_warp' || !zone.warpTarget) continue;
    connections.push({
      zoneId: zone.id,
      name: zone.name,
      fromMapId: map.id,
      fromTileX: zone.tileX,
      fromTileY: zone.tileY,
      targetMapId: zone.warpTarget.mapId,
      targetSpawnId: zone.warpTarget.targetSpawnId,
      targetTileX: zone.warpTarget.spawnTileX,
      targetTileY: zone.warpTarget.spawnTileY,
    });
  }
  return connections;
}

/**
 * Validates a warp destination before allowing the transition.
 * Returns the resolved spawn and an error string when invalid.
 */
export function validateTransition(
  targetMap: OfficeMapData,
  target: { targetSpawnId?: string; spawnTileX?: number; spawnTileY?: number }
): { ok: true; spawn: MapSpawnPoint } | { ok: false; error: string } {
  const explicit = findSpawn(targetMap, target.targetSpawnId);
  if (target.targetSpawnId && !explicit) {
    return { ok: false, error: `Destination spawn "${target.targetSpawnId}" does not exist in map "${targetMap.id}".` };
  }
  const spawn: MapSpawnPoint = explicit || {
    id: target.targetSpawnId || 'legacy',
    name: 'Legacy target',
    tileX: target.spawnTileX ?? getDefaultSpawn(targetMap).tileX,
    tileY: target.spawnTileY ?? getDefaultSpawn(targetMap).tileY,
    direction: 'down',
  };
  const x = Math.floor(spawn.tileX);
  const y = Math.floor(spawn.tileY);
  if (x < 0 || y < 0 || x >= targetMap.width || y >= targetMap.height) {
    return { ok: false, error: `Spawn (${x}, ${y}) is outside map "${targetMap.id}" bounds.` };
  }
  if (isSolidAt(targetMap, x, y)) {
    return { ok: false, error: `Spawn (${x}, ${y}) is inside a colliding tile in map "${targetMap.id}".` };
  }
  return { ok: true, spawn: { ...spawn, tileX: x, tileY: y } };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateMapOptions {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize?: number;
  environment?: 'indoor' | 'outdoor';
  fillFloorTileId?: number;
  floorLayerName?: string;
  wallBorder?: boolean;
}

/** Creates a fresh v2 map with default layers. */
export function createMap(options: CreateMapOptions): OfficeMapData {
  const width = clampDimension(options.width);
  const height = clampDimension(options.height);
  const tileSize = clampTileSize(options.tileSize ?? 32);

  const ground = createTileLayer(options.floorLayerName || 'Ground', width, height, 'ground');
  if (options.fillFloorTileId !== undefined && options.fillFloorTileId >= 0) {
    ground.tiles = createTileGrid(width, height, options.fillFloorTileId);
  }
  ground.order = 0;

  const walls = createTileLayer('Walls', width, height, 'row');
  walls.order = 10;
  const collision = createCollisionLayer('Collision', width, height);
  collision.order = 1000;

  if (options.wallBorder) {
    for (let x = 0; x < width; x++) {
      walls.tiles![0][x] = 11;
      walls.tiles![height - 1][x] = 11;
      collision.mask![0][x] = true;
      collision.mask![height - 1][x] = true;
    }
    for (let y = 0; y < height; y++) {
      walls.tiles![y][0] = 11;
      walls.tiles![y][width - 1] = 11;
      collision.mask![y][0] = true;
      collision.mask![y][width - 1] = true;
    }
  }

  const spawnTileX = options.wallBorder ? 1 : Math.floor(width / 2);
  const spawnTileY = options.wallBorder ? 1 : Math.floor(height / 2);

  return {
    id: options.id,
    name: options.name,
    schemaVersion: MAP_SCHEMA_VERSION,
    version: 1,
    width,
    height,
    tileSize,
    environment: options.environment,
    metadata: {},
    layers: [ground, walls, collision],
    tilesets: [getBuiltinTileset({ width, height })],
    spawnPoints: [
      { id: DEFAULT_SPAWN_ID, name: 'Main Spawn', tileX: spawnTileX, tileY: spawnTileY, direction: 'down' },
    ],
    objects: [],
    interactionZones: [],
    spawnPoint: { tileX: spawnTileX, tileY: spawnTileY, direction: 'down' },
  };
}

function clampDimension(v: number): number {
  const n = Math.floor(Number.isFinite(v) ? v : 1);
  return Math.max(1, Math.min(MAX_MAP_DIMENSION, n));
}

function clampTileSize(v: number): number {
  const n = Math.floor(Number.isFinite(v) ? v : 32);
  return Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, n));
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

export interface ResizeResult {
  map: OfficeMapData;
  warnings: string[];
  droppedObjects: number;
  droppedZones: number;
  droppedSpawns: number;
}

/**
 * Resizes a map preserving overlapping content. Shrinking drops out-of-bounds
 * objects and zones (callers must warn before applying).
 */
export function resizeMap(map: OfficeMapData, newWidth: number, newHeight: number): ResizeResult {
  const width = clampDimension(newWidth);
  const height = clampDimension(newHeight);
  const warnings: string[] = [];

  if (width * height > MAX_MAP_CELLS) {
    warnings.push(
      `Map area ${width * height} cells exceeds the recommended limit of ${MAX_MAP_CELLS}. Reduce dimensions for best performance.`
    );
  }

  const next: OfficeMapData = {
    ...map,
    width,
    height,
    layers: (map.layers || []).map((layer) => {
      if (layer.kind === 'tiles') {
        return {
          ...layer,
          tiles: resizeTileGrid(layer.tiles || createTileGrid(map.width, map.height), width, height),
        };
      }
      return {
        ...layer,
        mask: resizeMaskGrid(layer.mask || createMaskGrid(map.width, map.height), width, height),
      };
    }),
  };

  const objects: MapObject[] = [];
  let droppedObjects = 0;
  for (const obj of map.objects) {
    if (obj.tileX < width && obj.tileY < height && obj.tileX >= 0 && obj.tileY >= 0) {
      objects.push({
        ...obj,
        width: Math.min(obj.width, width - obj.tileX),
        height: Math.min(obj.height, height - obj.tileY),
      });
    } else {
      droppedObjects++;
    }
  }
  next.objects = objects;

  const zones: InteractionZone[] = [];
  let droppedZones = 0;
  for (const zone of map.interactionZones) {
    if (zone.tileX < width && zone.tileY < height && zone.tileX >= 0 && zone.tileY >= 0) {
      zones.push({
        ...zone,
        width: Math.min(zone.width, width - zone.tileX),
        height: Math.min(zone.height, height - zone.tileY),
      });
    } else {
      droppedZones++;
    }
  }
  next.interactionZones = zones;

  const spawns = getSpawnPoints(map).map((spawn) => ({
    ...spawn,
    tileX: Math.max(0, Math.min(width - 1, spawn.tileX)),
    tileY: Math.max(0, Math.min(height - 1, spawn.tileY)),
  }));
  const clampedSpawns = getSpawnPoints(map).filter(
    (s) => s.tileX !== Math.max(0, Math.min(width - 1, s.tileX)) || s.tileY !== Math.max(0, Math.min(height - 1, s.tileY))
  ).length;
  next.spawnPoints = spawns;
  next.spawnPoint = { tileX: spawns[0].tileX, tileY: spawns[0].tileY, direction: spawns[0].direction };

  // Remove warp zones that now point outside this map (self-targets) or onto dropped zones
  const zoneIds = new Set(next.interactionZones.map((z) => z.id));
  const validWarpTargets = new Set(spawns.map((s) => s.id));
  for (const zone of next.interactionZones) {
    if (zone.warpTarget?.targetSpawnId && !validWarpTargets.has(zone.warpTarget.targetSpawnId)) {
      // Keep the pixel target fallback but flag it
      warnings.push(
        `Door "${zone.name}" targets spawn "${zone.warpTarget.targetSpawnId}" which no longer exists after resize.`
      );
      delete zone.warpTarget.targetSpawnId;
    }
  }
  if (droppedZones > 0) {
    warnings.push(`${droppedZones} interaction zone(s) fell outside the new bounds and were removed.`);
    void zoneIds;
  }
  if (droppedObjects > 0) {
    warnings.push(`${droppedObjects} object(s) fell outside the new bounds and were removed.`);
  }
  if (clampedSpawns > 0) {
    warnings.push(`${clampedSpawns} spawn point(s) were clamped to stay inside the map.`);
  }

  return { map: next, warnings, droppedObjects, droppedZones, droppedSpawns: clampedSpawns };
}

function resizeTileGrid(grid: number[][], w: number, h: number): number[][] {
  const next = createTileGrid(w, h);
  for (let y = 0; y < Math.min(h, grid.length); y++) {
    const row = grid[y] || [];
    for (let x = 0; x < Math.min(w, row.length); x++) next[y][x] = row[x];
  }
  return next;
}

function resizeMaskGrid(grid: boolean[][], w: number, h: number): boolean[][] {
  const next = createMaskGrid(w, h);
  for (let y = 0; y < Math.min(h, grid.length); y++) {
    const row = grid[y] || [];
    for (let x = 0; x < Math.min(w, row.length); x++) next[y][x] = row[x] === true;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Serialization / RLE / hashing
// ---------------------------------------------------------------------------

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  // Node fallback
  const BufferImpl = (globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } }).Buffer;
  if (BufferImpl) return BufferImpl.from(bytes).toString('base64');
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? BASE64_CHARS[((b1! & 15) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_CHARS[b2! & 63] : '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const BufferImpl = (globalThis as { Buffer?: { from: (s: string, enc: string) => Uint8Array } }).Buffer;
  if (BufferImpl) return new Uint8Array(BufferImpl.from(b64, 'base64'));
  throw new Error('No base64 decoder available in this environment');
}

/** Bit-packs a boolean mask row-major into a byte array. */
export function packMaskBits(mask: boolean[][]): Uint8Array {
  const height = mask.length;
  const width = height > 0 ? mask[0].length : 0;
  const bytes = new Uint8Array(Math.ceil((width * height) / 8));
  let bit = 0;
  for (let y = 0; y < height; y++) {
    const row = mask[y];
    for (let x = 0; x < width; x++) {
      if (row[x]) bytes[bit >> 3] |= 1 << (bit & 7);
      bit++;
    }
  }
  return bytes;
}

/** Unpacks a row-major bit array into a boolean mask. */
export function unpackMaskBits(bytes: Uint8Array, width: number, height: number): boolean[][] {
  const mask = createMaskGrid(width, height);
  let bit = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = bytes[bit >> 3] ?? 0;
      mask[y][x] = ((byte >> (bit & 7)) & 1) === 1;
      bit++;
    }
  }
  return mask;
}

/** Bit-packs a boolean mask row-major into base64 for transport. */
export function encodeMask(mask: boolean[][]): string {
  return bytesToBase64(packMaskBits(mask));
}

export function decodeMask(b64: string, width: number, height: number): boolean[][] {
  return unpackMaskBits(base64ToBytes(b64), width, height);
}

/**
 * Byte run-length encodes the packed mask for compact transport. The wire
 * format is a sequence of [value, runLength] byte pairs (runs 1..255), which
 * keeps even 400x400 empty/nearly-empty masks under a few hundred bytes.
 */
export function encodeMaskRLE(mask: boolean[][]): string {
  const packed = packMaskBits(mask);
  const out: number[] = [];
  let i = 0;
  while (i < packed.length) {
    const value = packed[i];
    let run = 1;
    while (i + run < packed.length && packed[i + run] === value && run < 255) run++;
    out.push(value, run);
    i += run;
  }
  return bytesToBase64(new Uint8Array(out));
}

/**
 * Decodes a run-length encoded packed mask. Returns null when the payload is
 * malformed or does not produce enough bytes for the given dimensions.
 */
export function decodeMaskRLE(b64: string, width: number, height: number): boolean[][] | null {
  if (width <= 0 || height <= 0) return null;
  const expectedBytes = Math.ceil((width * height) / 8);
  let runs: Uint8Array;
  try {
    runs = base64ToBytes(b64);
  } catch {
    return null;
  }
  if (runs.length % 2 !== 0) return null;

  const packed = new Uint8Array(expectedBytes);
  let offset = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const value = runs[i];
    const run = runs[i + 1];
    if (run === 0) return null;
    for (let r = 0; r < run && offset < expectedBytes; r++) {
      packed[offset++] = value;
    }
    if (offset >= expectedBytes) break;
  }
  if (offset < expectedBytes) return null;
  return unpackMaskBits(packed, width, height);
}

/** Mask transport payload budget for register_map messages. */
export const MAX_MASK_TRANSPORT_CHARS = 30000;

/**
 * Encodes a mask for the `register_map` wire format. Picks the smaller of
 * RLE vs. plain bit-packed base64 and prefixes it with `rle:` / `raw:` so the
 * receiver always knows how to decode it.
 */
export function encodeMaskForTransport(mask: boolean[][]): string {
  const rle = encodeMaskRLE(mask);
  if (rle.length <= MAX_MASK_TRANSPORT_CHARS) return `rle:${rle}`;
  return `raw:${encodeMask(mask)}`;
}

/**
 * Decodes a mask produced by `encodeMaskForTransport`. Also accepts bare
 * (unprefixed) payloads for forward/backward compatibility.
 */
export function decodeMaskFromTransport(
  value: string,
  width: number,
  height: number
): boolean[][] | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    if (value.startsWith('rle:')) return decodeMaskRLE(value.slice(4), width, height);
    if (value.startsWith('raw:')) return decodeMask(value.slice(4), width, height);
    return decodeMaskRLE(value, width, height) ?? decodeMask(value, width, height);
  } catch {
    return null;
  }
}

/** FNV-1a hash of the solid mask (matches the server-side implementation). */
export function computeMaskHash(width: number, height: number, mask: boolean[][]): string {
  let hash = 0x811c9dc5;
  const mix = (byte: number) => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  mix(width & 0xff);
  mix((width >> 8) & 0xff);
  mix(height & 0xff);
  mix((height >> 8) & 0xff);
  for (let y = 0; y < height; y++) {
    const row = mask[y];
    if (!row) {
      mix(0);
      continue;
    }
    for (let x = 0; x < width; x++) mix(row[x] ? 1 : 0);
  }
  return hash.toString(16).padStart(8, '0');
}

/** Derives legacy v1 grid fields for storage/back-compat. */
export function deriveLegacyFields(map: OfficeMapData): {
  floorTiles: number[][];
  wallTiles: number[][];
  solidMask: boolean[][];
} {
  const tileLayers = getTileLayers(map);
  const ground = tileLayers.find((l) => l.depthMode === 'ground') || tileLayers[0];
  const walls = tileLayers.find((l) => l.depthMode === 'row');

  const floorTiles = createTileGrid(map.width, map.height, 0);
  if (ground?.tiles) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const v = ground.tiles[y]?.[x] ?? -1;
        // Legacy floor IDs only satisfy 0..5; unknown/imported tiles fall back to wood.
        floorTiles[y][x] = v >= 0 && v <= 5 ? v : 0;
      }
    }
  }

  const wallTiles = createTileGrid(map.width, map.height, 0);
  if (walls?.tiles) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const v = walls.tiles[y]?.[x] ?? -1;
        wallTiles[y][x] = v >= 10 && v <= 13 ? v : 0;
      }
    }
  }

  return { floorTiles, wallTiles, solidMask: cloneMask(getCollisionMask(map)) };
}

export function cloneMask(mask: boolean[][]): boolean[][] {
  return mask.map((row) => [...row]);
}

export function cloneMapData(map: OfficeMapData): OfficeMapData {
  return JSON.parse(JSON.stringify(map)) as OfficeMapData;
}

/** Serializes a map for storage: v2 shape + legacy fields for old readers. */
export function serializeMapForStorage(map: OfficeMapData): OfficeMapData {
  const legacy = deriveLegacyFields(map);
  return {
    ...cloneMapData(map),
    floorTiles: legacy.floorTiles,
    wallTiles: legacy.wallTiles,
    solidMask: legacy.solidMask,
  };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export interface MigrationReport {
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
  notes: string[];
}

/**
 * Migrates any stored/imported map document to schema v2.
 * - v1 documents (flat grids) are converted into layers without data loss.
 * - v2 documents are normalized (grid sizes, tilesets, spawn points).
 */
export function migrateMapData(raw: OfficeMapData): { map: OfficeMapData; report: MigrationReport } {
  const notes: string[] = [];
  const fromVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid map document: not an object');
  }
  const width = clampDimension(raw.width ?? 24);
  const height = clampDimension(raw.height ?? 18);
  const tileSize = clampTileSize(raw.tileSize ?? 32);

  const migrated: OfficeMapData = {
    ...raw,
    width,
    height,
    tileSize,
    schemaVersion: MAP_SCHEMA_VERSION,
    version: typeof raw.version === 'number' && raw.version > 0 ? raw.version : 1,
    objects: Array.isArray(raw.objects) ? raw.objects.map(normalizeObject) : [],
    interactionZones: Array.isArray(raw.interactionZones) ? raw.interactionZones.map(normalizeZone) : [],
    spawnPoint: raw.spawnPoint || { tileX: 1, tileY: 1, direction: 'down' },
    metadata: raw.metadata || {},
  };

  const hasV2Layers = Array.isArray(raw.layers) && raw.layers.some((l) => l.kind === 'tiles');

  if (!hasV2Layers) {
    // v1 → v2 conversion
    notes.push('Migrated legacy flat tile grids to layered schema v2.');
    const ground = createTileLayer('Ground', width, height, 'ground');
    ground.order = 0;
    if (Array.isArray(raw.floorTiles)) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = raw.floorTiles[y]?.[x];
          ground.tiles![y][x] = typeof v === 'number' && v >= 0 ? v : -1;
        }
      }
    }

    const walls = createTileLayer('Walls', width, height, 'row');
    walls.order = 10;
    if (Array.isArray(raw.wallTiles)) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = raw.wallTiles[y]?.[x];
          walls.tiles![y][x] = typeof v === 'number' && v > 0 ? v : -1;
        }
      }
    }

    const collision = createCollisionLayer('Collision', width, height);
    if (Array.isArray(raw.solidMask)) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          collision.mask![y][x] = raw.solidMask[y]?.[x] === true;
        }
      }
    }

    migrated.layers = [ground, walls, collision];
  } else {
    // Already layered — normalize grids and layer flags
    migrated.layers = raw.layers!.map((layer) => ({
      ...layer,
      id: layer.id || makeLayerId('layer'),
      name: layer.name || (layer.kind === 'collision' ? 'Collision' : 'Layer'),
      visible: layer.visible !== false,
      locked: layer.locked === true,
      order: typeof layer.order === 'number' ? layer.order : 0,
    }));
    normalizeLayerGrids(migrated);
    notes.push('Normalized existing layered map document.');
  }

  // Ensure a collision layer exists
  if (!migrated.layers!.some((l) => l.kind === 'collision')) {
    const collision = createCollisionLayer('Collision', width, height);
    if (Array.isArray(raw.solidMask)) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) collision.mask![y][x] = raw.solidMask[y]?.[x] === true;
      }
    }
    migrated.layers!.push(collision);
    notes.push('Added missing collision layer.');
  }

  // Tilesets: always include builtin; keep existing asset refs
  const tilesets = (raw.tilesets || []).filter((t) => t.id !== BUILTIN_TILESET_ID);
  migrated.tilesets = [getBuiltinTileset({ width, height }), ...tilesets];
  assignTilesetIds(migrated.tilesets);

  // Spawn points
  if (!Array.isArray(raw.spawnPoints) || raw.spawnPoints.length === 0) {
    migrated.spawnPoints = [
      {
        id: DEFAULT_SPAWN_ID,
        name: 'Main Spawn',
        tileX: migrated.spawnPoint.tileX,
        tileY: migrated.spawnPoint.tileY,
        direction: migrated.spawnPoint.direction,
      },
    ];
    notes.push('Created spawn point list from legacy spawn.');
  } else {
    migrated.spawnPoints = raw.spawnPoints.map((s, i) => ({
      id: s.id || `spawn_${i}`,
      name: s.name || `Spawn ${i + 1}`,
      tileX: clampTileCoord(s.tileX, width),
      tileY: clampTileCoord(s.tileY, height),
      direction: s.direction || 'down',
    }));
  }
  migrated.spawnPoint = {
    tileX: migrated.spawnPoints[0].tileX,
    tileY: migrated.spawnPoints[0].tileY,
    direction: migrated.spawnPoints[0].direction,
  };

  // Environment inference for legacy factory maps
  if (!migrated.environment) {
    if (migrated.id === 'rooftop_garden') migrated.environment = 'outdoor';
    else migrated.environment = 'indoor';
  }

  return {
    map: migrated,
    report: { migrated: fromVersion < MAP_SCHEMA_VERSION || !hasV2Layers, fromVersion, toVersion: MAP_SCHEMA_VERSION, notes },
  };
}

function normalizeObject(obj: MapObject): MapObject {
  return {
    ...obj,
    id: obj.id || `obj_${Math.random().toString(36).slice(2, 9)}`,
    tileX: Math.max(0, Math.floor(obj.tileX ?? 0)),
    tileY: Math.max(0, Math.floor(obj.tileY ?? 0)),
    width: Math.max(1, Math.floor(obj.width ?? 1)),
    height: Math.max(1, Math.floor(obj.height ?? 1)),
    isSolid: obj.isSolid === true,
  };
}

function normalizeZone(zone: InteractionZone): InteractionZone {
  return {
    ...zone,
    id: zone.id || `zone_${Math.random().toString(36).slice(2, 9)}`,
    tileX: Math.max(0, Math.floor(zone.tileX ?? 0)),
    tileY: Math.max(0, Math.floor(zone.tileY ?? 0)),
    width: Math.max(1, Math.floor(zone.width ?? 1)),
    height: Math.max(1, Math.floor(zone.height ?? 1)),
  };
}

function clampTileCoord(v: number, max: number): number {
  const n = Math.floor(Number.isFinite(v) ? v : 0);
  return Math.max(0, Math.min(max - 1, n));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMapData(map: unknown): MapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!map || typeof map !== 'object') {
    return { valid: false, errors: ['Map document must be an object.'], warnings };
  }
  const m = map as OfficeMapData;

  if (typeof m.id !== 'string' || m.id.trim() === '') errors.push('Missing map id.');
  if (typeof m.name !== 'string' || m.name.trim() === '') errors.push('Missing map name.');
  if (!Number.isFinite(m.width) || m.width < 1) errors.push('Invalid map width.');
  if (!Number.isFinite(m.height) || m.height < 1) errors.push('Invalid map height.');
  if (m.width > MAX_MAP_DIMENSION || m.height > MAX_MAP_DIMENSION) {
    errors.push(`Map dimensions exceed the ${MAX_MAP_DIMENSION}×${MAX_MAP_DIMENSION} limit.`);
  }
  if (m.width * m.height > MAX_MAP_CELLS) {
    errors.push(`Map area exceeds the ${MAX_MAP_CELLS}-cell limit.`);
  }
  if (m.width > WARN_MAP_DIMENSION || m.height > WARN_MAP_DIMENSION) {
    warnings.push('Large map: rendering uses chunked batching, but editor operations may be slower.');
  }
  if (!Number.isFinite(m.tileSize) || m.tileSize < MIN_TILE_SIZE || m.tileSize > MAX_TILE_SIZE) {
    errors.push(`Tile size must be between ${MIN_TILE_SIZE} and ${MAX_TILE_SIZE} pixels.`);
  }
  if (!Array.isArray(m.objects)) errors.push('Missing objects array.');
  if (!Array.isArray(m.interactionZones)) errors.push('Missing interaction zones array.');
  if (!m.spawnPoint || typeof m.spawnPoint.tileX !== 'number') errors.push('Missing spawn point.');

  if (m.schemaVersion >= MAP_SCHEMA_VERSION) {
    if (!Array.isArray(m.layers) || m.layers.length === 0) {
      errors.push('Layered map is missing layers.');
    } else {
      const tileLayers = m.layers.filter((l) => l.kind === 'tiles');
      if (tileLayers.length === 0) errors.push('Layered map has no tile layers.');
      if (!m.layers.some((l) => l.kind === 'collision')) errors.push('Layered map has no collision layer.');
      for (const layer of m.layers) {
        if (layer.kind === 'tiles') {
          if (!Array.isArray(layer.tiles) || layer.tiles.length !== m.height) {
            errors.push(`Layer "${layer.name}" grid does not match map dimensions.`);
          }
        } else if (!Array.isArray(layer.mask) || layer.mask.length !== m.height) {
          errors.push(`Collision layer "${layer.name}" grid does not match map dimensions.`);
        }
      }
      if (!Array.isArray(m.tilesets) || !m.tilesets.some((t) => t.source === 'builtin')) {
        errors.push('Layered map is missing the builtin tileset reference.');
      }
      const unresolved = Array.isArray(m.layers) ? collectUnresolvedTileIds(m) : [];
      if (unresolved.length > 0) {
        warnings.push(
          `${unresolved.length} tile id(s) are not covered by any tileset and will render with a fallback: ${unresolved
            .slice(0, 8)
            .join(', ')}${unresolved.length > 8 ? '…' : ''}`
        );
      }
    }
  }

  if (Array.isArray(m.objects) && m.objects.length > 20_000) {
    errors.push('Map contains more than 20,000 objects.');
  }
  if (Array.isArray(m.interactionZones) && m.interactionZones.length > 2_000) {
    errors.push('Map contains more than 2,000 interaction zones.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Quick structural check used by repositories (throws with detail). */
export function assertValidMapData(map: OfficeMapData): void {
  const result = validateMapData(map);
  if (!result.valid) {
    throw new Error(`Invalid map data: ${result.errors.join(' ')}`);
  }
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function computeMapFootprintBytes(map: OfficeMapData): number {
  let cells = 0;
  for (const layer of map.layers || []) {
    if (layer.kind === 'tiles' && layer.tiles) cells += layer.tiles.length * (layer.tiles[0]?.length || 0);
    if (layer.kind === 'collision' && layer.mask) cells += layer.mask.length * (layer.mask[0]?.length || 0);
  }
  return cells * 4;
}

export function directionFromDelta(dx: number, dy: number, fallback: Direction = 'down'): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy !== 0) return dy > 0 ? 'down' : 'up';
  return fallback;
}
