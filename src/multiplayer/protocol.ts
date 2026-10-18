/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Direction, AvatarConfig } from '../types/game';

export const PROTOCOL_VERSION = '1.1.0';
export const DEFAULT_TICK_RATE = 20; // 20 updates per second (50ms interval)
// 48 KB: register_map carries a compact transport-encoded collision mask
// (bounded to ~30k chars by validation) in addition to the regular messages.
export const MAX_MESSAGE_SIZE_BYTES = 48 * 1024;
export const MAX_PLAYERS_PER_ROOM = 50;

/**
 * Client -> Server message types
 */
export type ClientMessageType =
  | 'join_room'
  | 'move_intent'
  | 'heartbeat'
  | 'leave_room'
  | 'request_resync'
  | 'reaction'
  | 'register_map';

/**
 * Server -> Client message types
 */
export type ServerMessageType =
  | 'welcome'
  | 'room_snapshot'
  | 'player_joined'
  | 'player_left'
  | 'player_state'
  | 'movement_rejected'
  | 'server_error'
  | 'room_resync'
  | 'pong'
  | 'player_reaction'
  | 'map_registered'
  | 'map_mismatch';

export interface PlayerNetState {
  userId: string;
  displayName: string;
  role: 'admin' | 'employee';
  avatarConfig: AvatarConfig;
  roomId: string;
  x: number; // in pixels
  y: number; // in pixels
  direction: Direction;
  isMoving: boolean;
  seq: number;
  timestamp: number;
}

// Client Messages
export interface ClientJoinRoomMessage {
  type: 'join_room';
  version: string;
  roomId: string;
  initialX?: number;
  initialY?: number;
}

export interface ClientMoveIntentMessage {
  type: 'move_intent';
  seq: number;
  roomId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  isMoving: boolean;
  clientTime: number;
}

export interface ClientHeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
}

export interface ClientLeaveRoomMessage {
  type: 'leave_room';
  roomId: string;
}

export interface ClientResyncMessage {
  type: 'request_resync';
  roomId: string;
}

export interface ClientReactionMessage {
  type: 'reaction';
  roomId: string;
  emoji: string;
  timestamp?: number;
}

/**
 * Sent by a client after joining a room to inform the server about the actual
 * dimensions / tile size / collision mask of the map the room is running. This
 * lets the server validate movement against dynamic (edited) maps instead of
 * the hardcoded factory fallback.
 */
export interface ClientRegisterMapMessage {
  type: 'register_map';
  roomId: string;
  mapId: string;
  width: number;
  height: number;
  tileSize: number;
  /** FNV-1a hash of the collision mask (see computeMaskHash). */
  maskHash: string;
  /**
   * Transport-encoded, bit-packed collision mask (see encodeMaskForTransport):
   * either `rle:<base64>` (byte run-length) or `raw:<base64>` (plain packed).
   */
  maskRle: string;
  /** Spawn tile of the registering client (used to validate joins). */
  spawnTileX?: number;
  spawnTileY?: number;
}

export type ClientMessage =
  | ClientJoinRoomMessage
  | ClientMoveIntentMessage
  | ClientHeartbeatMessage
  | ClientLeaveRoomMessage
  | ClientResyncMessage
  | ClientReactionMessage
  | ClientRegisterMapMessage;

// Server Messages
export interface ServerWelcomeMessage {
  type: 'welcome';
  version: string;
  userId: string;
  serverTime: number;
  tickRate: number;
}

export interface ServerRoomSnapshotMessage {
  type: 'room_snapshot';
  roomId: string;
  players: PlayerNetState[];
  serverTime: number;
}

export interface ServerPlayerJoinedMessage {
  type: 'player_joined';
  roomId: string;
  player: PlayerNetState;
}

export interface ServerPlayerLeftMessage {
  type: 'player_left';
  roomId: string;
  userId: string;
  reason?: 'disconnect' | 'left' | 'timeout' | 'kicked';
}

export interface ServerPlayerStateMessage {
  type: 'player_state';
  roomId: string;
  players: Array<{
    userId: string;
    x: number;
    y: number;
    direction: Direction;
    isMoving: boolean;
    seq: number;
    timestamp: number;
  }>;
}

export interface ServerMovementRejectedMessage {
  type: 'movement_rejected';
  roomId: string;
  seq: number;
  correctX: number;
  correctY: number;
  reason: string;
}

export interface ServerErrorMessage {
  type: 'server_error';
  code: string;
  message: string;
}

export interface ServerPongMessage {
  type: 'pong';
  clientTimestamp: number;
  serverTime: number;
}

export interface ServerPlayerReactionMessage {
  type: 'player_reaction';
  roomId: string;
  userId: string;
  emoji: string;
  timestamp: number;
}

export interface ServerMapRegisteredMessage {
  type: 'map_registered';
  roomId: string;
  mapId: string;
  width: number;
  height: number;
  tileSize: number;
  maskHash: string;
  /** True when this client's registration defined the authoritative room map. */
  canonical: boolean;
  /** Validated initial position for the requesting client (pixels). */
  spawnX: number;
  spawnY: number;
}

export interface ServerMapMismatchMessage {
  type: 'map_mismatch';
  roomId: string;
  /** The canonical room map the server validates against. */
  mapId: string;
  width: number;
  height: number;
  tileSize: number;
  maskHash: string;
  /** RLE collision mask of the canonical room map. */
  maskRle: string;
  message: string;
}

export type ServerMessage =
  | ServerWelcomeMessage
  | ServerRoomSnapshotMessage
  | ServerPlayerJoinedMessage
  | ServerPlayerLeftMessage
  | ServerPlayerStateMessage
  | ServerMovementRejectedMessage
  | ServerErrorMessage
  | ServerPongMessage
  | ServerPlayerReactionMessage
  | ServerMapRegisteredMessage
  | ServerMapMismatchMessage;

/**
 * Message Validation Helper
 */
export function validateClientMessage(raw: unknown): { valid: boolean; error?: string; message?: ClientMessage } {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'Message must be an object' };
  }

  const obj = raw as Record<string, unknown>;
  const type = obj.type as ClientMessageType;

  switch (type) {
    case 'join_room': {
      if (typeof obj.roomId !== 'string' || obj.roomId.length > 64) {
        return { valid: false, error: 'Invalid roomId in join_room' };
      }
      return { valid: true, message: raw as ClientJoinRoomMessage };
    }
    case 'move_intent': {
      if (typeof obj.seq !== 'number' || !Number.isFinite(obj.seq)) {
        return { valid: false, error: 'Invalid seq number in move_intent' };
      }
      if (typeof obj.roomId !== 'string') {
        return { valid: false, error: 'Invalid roomId in move_intent' };
      }
      if (typeof obj.x !== 'number' || !Number.isFinite(obj.x) || typeof obj.y !== 'number' || !Number.isFinite(obj.y)) {
        return { valid: false, error: 'Invalid x or y coordinates in move_intent' };
      }
      if (typeof obj.vx !== 'number' || !Number.isFinite(obj.vx) || typeof obj.vy !== 'number' || !Number.isFinite(obj.vy)) {
        return { valid: false, error: 'Invalid velocity in move_intent' };
      }
      const validDirs: Direction[] = ['down', 'left', 'right', 'up'];
      if (!validDirs.includes(obj.direction as Direction)) {
        return { valid: false, error: 'Invalid direction in move_intent' };
      }
      if (typeof obj.isMoving !== 'boolean') {
        return { valid: false, error: 'Invalid isMoving in move_intent' };
      }
      return { valid: true, message: raw as ClientMoveIntentMessage };
    }
    case 'heartbeat': {
      if (typeof obj.timestamp !== 'number' || !Number.isFinite(obj.timestamp)) {
        return { valid: false, error: 'Invalid timestamp in heartbeat' };
      }
      return { valid: true, message: raw as ClientHeartbeatMessage };
    }
    case 'leave_room': {
      if (typeof obj.roomId !== 'string') {
        return { valid: false, error: 'Invalid roomId in leave_room' };
      }
      return { valid: true, message: raw as ClientLeaveRoomMessage };
    }
    case 'request_resync': {
      if (typeof obj.roomId !== 'string') {
        return { valid: false, error: 'Invalid roomId in request_resync' };
      }
      return { valid: true, message: raw as ClientResyncMessage };
    }
    case 'reaction': {
      if (typeof obj.roomId !== 'string' || obj.roomId.length > 64) {
        return { valid: false, error: 'Invalid roomId in reaction' };
      }
      if (typeof obj.emoji !== 'string' || obj.emoji.trim() === '' || obj.emoji.length > 32) {
        return { valid: false, error: 'Invalid emoji in reaction' };
      }
      return { valid: true, message: raw as ClientReactionMessage };
    }
    case 'register_map': {
      if (typeof obj.roomId !== 'string' || obj.roomId.length > 64) {
        return { valid: false, error: 'Invalid roomId in register_map' };
      }
      if (typeof obj.mapId !== 'string' || obj.mapId.length === 0 || obj.mapId.length > 128) {
        return { valid: false, error: 'Invalid mapId in register_map' };
      }
      const width = obj.width;
      const height = obj.height;
      const tileSize = obj.tileSize;
      if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        typeof tileSize !== 'number' ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        !Number.isInteger(tileSize) ||
        width < 1 ||
        height < 1 ||
        width > 400 ||
        height > 400 ||
        tileSize < 8 ||
        tileSize > 128
      ) {
        return { valid: false, error: 'Invalid map dimensions in register_map' };
      }
      if (typeof obj.maskHash !== 'string' || obj.maskHash.length === 0 || obj.maskHash.length > 16) {
        return { valid: false, error: 'Invalid maskHash in register_map' };
      }
      if (typeof obj.maskRle !== 'string' || obj.maskRle.length === 0 || obj.maskRle.length > 30050) {
        return { valid: false, error: 'Invalid maskRle in register_map' };
      }
      if (obj.spawnTileX !== undefined && (typeof obj.spawnTileX !== 'number' || !Number.isFinite(obj.spawnTileX))) {
        return { valid: false, error: 'Invalid spawnTileX in register_map' };
      }
      if (obj.spawnTileY !== undefined && (typeof obj.spawnTileY !== 'number' || !Number.isFinite(obj.spawnTileY))) {
        return { valid: false, error: 'Invalid spawnTileY in register_map' };
      }
      return { valid: true, message: raw as ClientRegisterMapMessage };
    }
    default:
      return { valid: false, error: `Unknown message type: ${String(obj.type)}` };
  }
}
