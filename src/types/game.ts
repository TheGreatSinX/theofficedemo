/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Direction = 'down' | 'left' | 'right' | 'up';

export interface AvatarConfig {
  skinColor: string;
  hairStyle: 'short' | 'long' | 'curly' | 'spiky' | 'bald';
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory?: 'glasses' | 'headset' | 'badge' | 'none';
}

export interface UserProfile {
  id: string;
  name: string;
  role: 'admin' | 'employee';
  title: string;
  status: 'online' | 'in_meeting' | 'busy' | 'coffee_break';
  avatarConfig: AvatarConfig;
  currentMapId: string;
  x: number; // tile or world coordinates
  y: number;
  direction: Direction;
  isMoving: boolean;
  isBot?: boolean;
}

export type ZoneType = 'meeting_room' | 'coffee' | 'watercooler' | 'whiteboard' | 'desk' | 'door_warp' | 'phone_booth';

export interface InteractionZone {
  id: string;
  name: string;
  type: ZoneType;
  tileX: number;
  tileY: number;
  width: number; // in tiles
  height: number;
  prompt: string;
  description?: string;
  meetUrl?: string;
  /**
   * Door/portal destinations. `spawnTileX/Y` are respected for legacy maps;
   * when `targetSpawnId` is present the destination spawn point is authoritative.
   */
  warpTarget?: {
    mapId: string;
    spawnTileX: number;
    spawnTileY: number;
    targetSpawnId?: string;
  };
}

// ---------------------------------------------------------------------------
// Map schema v2
// ---------------------------------------------------------------------------

/** Current map schema version produced by the editor. */
export const MAP_SCHEMA_VERSION = 2;

/** First global tile ID available to imported (non-builtin) tilesets. */
export const IMPORTED_TILE_ID_BASE = 1000;

export type MapEnvironment = 'indoor' | 'outdoor';

export type MapLayerKind = 'tiles' | 'collision';

/**
 * How a tile layer is rendered:
 * - `ground`: flat layers batched into chunked render textures (floors, carpets).
 * - `row`: per-tile sprites with Y-sorted depth (walls, foreground). Keep sparse.
 */
export type MapLayerDepthMode = 'ground' | 'row';

export interface MapLayerData {
  id: string;
  name: string;
  kind: MapLayerKind;
  visible: boolean;
  locked: boolean;
  /** Render order; lower renders first (is behind). */
  order: number;
  /** Only meaningful for `kind: 'tiles'`. */
  depthMode?: MapLayerDepthMode;
  /** Tile rows for `kind: 'tiles'`: global tile IDs, `-1` = empty. */
  tiles?: number[][];
  /** Collision rows for `kind: 'collision'`: `true` = blocked. */
  mask?: boolean[][];
}

export interface MapTilesetRef {
  /** Map-local stable identifier (e.g. `builtin`, `ts_1712345678`). */
  id: string;
  name: string;
  source: 'builtin' | 'asset';
  /** Registry asset id when `source === 'asset'`. */
  assetId?: string;
  /** Source frame size of the sheet in pixels. */
  tileSize: number;
  columns: number;
  rows: number;
  /** First global tile ID owned by this tileset. */
  firstTileId: number;
  tileCount: number;
  /** Optional draw scale relative to the map grid (default: scale to fit tileSize). */
  scale?: number;
}

export interface MapObject {
  id: string;
  name?: string;
  /** Legacy procedural type (`desk_single`, `plant_monstera`, ...) or `asset`. */
  type: string;
  /** Registry asset id when the object was placed from an imported asset. */
  assetId?: string;
  /** Frame index inside the asset sheet. */
  frame?: number;
  tileX: number;
  tileY: number;
  width: number; // in tiles
  height: number;
  /** Source pixel dimensions for imported assets (for exact scaling). */
  pixelWidth?: number;
  pixelHeight?: number;
  isSolid: boolean;
  interactionZoneId?: string;
  layerId?: string;
  opacity?: number;
  rotation?: number;
}

export interface MapSpawnPoint {
  id: string;
  name: string;
  tileX: number;
  tileY: number;
  direction: Direction;
}

export interface MapMetadata {
  description?: string;
  tags?: string[];
  worldId?: string;
  order?: number;
  author?: string;
}

export interface StoredMapEnvelope {
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

export interface OfficeMapData {
  id: string;
  name: string;
  /** Schema version; 1 = legacy grid fields, 2 = layered model. */
  schemaVersion: number;
  /** Content version, bumped on save/publish. */
  version: number;
  width: number; // in tiles
  height: number;
  tileSize: number;
  environment?: MapEnvironment;
  metadata?: MapMetadata;

  /** v2 layers (source of truth when `schemaVersion >= 2`). */
  layers?: MapLayerData[];
  /** v2 tileset registry for this map. */
  tilesets?: MapTilesetRef[];
  /** v2 spawn point list (the default spawn is mirrored to `spawnPoint`). */
  spawnPoints?: MapSpawnPoint[];

  objects: MapObject[];
  interactionZones: InteractionZone[];

  /**
   * Legacy single spawn point. Always kept in sync with the default spawn
   * point in `spawnPoints` for backwards compatibility.
   */
  spawnPoint: {
    tileX: number;
    tileY: number;
    direction: Direction;
  };

  /**
   * Legacy v1 grid fields. Kept optional at runtime (schema v2 derives them on
   * demand via `deriveLegacyFields`) but written to storage for older readers.
   */
  floorTiles?: number[][];
  wallTiles?: number[][];
  solidMask?: boolean[][];
}

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

export const WORLD_SCHEMA_VERSION = 1;

export interface WorldMapEntry {
  mapId: string;
  name: string;
  order: number;
  zone?: string;
}

export interface WorldData {
  id: string;
  name: string;
  description?: string;
  schemaVersion: number;
  version: number;
  maps: WorldMapEntry[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** A map-to-map link derived from a `door_warp` interaction zone. */
export interface MapConnection {
  zoneId: string;
  name: string;
  fromMapId: string;
  fromTileX: number;
  fromTileY: number;
  targetMapId: string;
  targetSpawnId?: string;
  targetTileX: number;
  targetTileY: number;
}

export interface SpeechBubble {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  durationMs: number;
}

export type ChatChannel = 'broadcast' | 'room' | 'direct' | 'local';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  channel: ChatChannel;
  recipientId?: string;
  text: string;
  timestamp: string;
  role?: 'admin' | 'employee';
}

export interface MeetingRoomConfig {
  id: string;
  name: string;
  meetUrl: string;
  activeCount: number;
  isLocked?: boolean;
}
