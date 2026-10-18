/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Direction, AvatarConfig } from '../types/game';

export const PROTOCOL_VERSION = '1.0.0';
export const DEFAULT_TICK_RATE = 20; // 20 updates per second (50ms interval)
export const MAX_MESSAGE_SIZE_BYTES = 16 * 1024; // 16 KB
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
  | 'reaction';

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
  | 'player_reaction';

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

export type ClientMessage =
  | ClientJoinRoomMessage
  | ClientMoveIntentMessage
  | ClientHeartbeatMessage
  | ClientLeaveRoomMessage
  | ClientResyncMessage
  | ClientReactionMessage;

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

export type ServerMessage =
  | ServerWelcomeMessage
  | ServerRoomSnapshotMessage
  | ServerPlayerJoinedMessage
  | ServerPlayerLeftMessage
  | ServerPlayerStateMessage
  | ServerMovementRejectedMessage
  | ServerErrorMessage
  | ServerPongMessage
  | ServerPlayerReactionMessage;

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
    default:
      return { valid: false, error: `Unknown message type: ${String(obj.type)}` };
  }
}
