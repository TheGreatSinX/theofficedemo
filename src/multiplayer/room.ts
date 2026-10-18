/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PlayerNetState,
  ServerMessage,
  ClientMoveIntentMessage,
  DEFAULT_TICK_RATE,
  MAX_PLAYERS_PER_ROOM,
} from './protocol';
import { MovementAuthority, AuthoritativeMapBounds } from './authority';
import { Direction, AvatarConfig } from '../types/game';
import { OFFICE_MAPS } from '../game/maps/officeMaps';

export interface RoomClientSession {
  userId: string;
  displayName: string;
  role: 'admin' | 'employee';
  avatarConfig: AvatarConfig;
  roomId: string;
  socket: {
    send: (data: string) => void;
    readyState?: number;
    close?: () => void;
  };
  lastSeen: number;
}

export class OfficeRoom {
  public readonly roomId: string;
  private clients: Map<string, RoomClientSession> = new Map();
  private playerStates: Map<string, PlayerNetState> = new Map();
  private dirtyPlayerIds: Set<string> = new Set();
  private mapBounds: AuthoritativeMapBounds;
  private movementAuthority: MovementAuthority;
  private tickInterval: NodeJS.Timeout | null = null;
  private tickRateHz: number;

  constructor(
    roomId: string,
    movementAuthority: MovementAuthority,
    tickRateHz: number = DEFAULT_TICK_RATE
  ) {
    this.roomId = roomId;
    this.movementAuthority = movementAuthority;
    this.tickRateHz = tickRateHz;

    // Load authoritative map data if standard map exists
    const mapFactory = OFFICE_MAPS[roomId];
    if (mapFactory) {
      const mapData = mapFactory();
      this.mapBounds = {
        width: mapData.width,
        height: mapData.height,
        tileSize: mapData.tileSize,
        solidMask: mapData.solidMask,
      };
    } else {
      // Default bounds for dynamic / custom rooms (e.g. 36x24 tiles, 32px each)
      this.mapBounds = {
        width: 36,
        height: 24,
        tileSize: 32,
      };
    }

    this.startTickLoop();
  }

  public getPlayerCount(): number {
    return this.clients.size;
  }

  public getOccupants(): PlayerNetState[] {
    return Array.from(this.playerStates.values());
  }

  public addPlayer(
    session: RoomClientSession,
    spawnX?: number,
    spawnY?: number
  ): { success: boolean; error?: string } {
    if (this.clients.size >= MAX_PLAYERS_PER_ROOM) {
      return { success: false, error: 'Room is full (max 50 users)' };
    }

    const { userId, displayName, role, avatarConfig } = session;

    // If an existing session for the same userId exists in this room, disconnect the old one gracefully
    if (this.clients.has(userId)) {
      const old = this.clients.get(userId);
      try {
        old?.socket.close?.();
      } catch {
        // Ignore close error
      }
      this.clients.delete(userId);
    }

    // Determine initial spawn position
    const initX = spawnX !== undefined ? spawnX : 8 * 32 + 16;
    const initY = spawnY !== undefined ? spawnY : 11 * 32 + 16;

    const netState: PlayerNetState = {
      userId,
      displayName,
      role,
      avatarConfig,
      roomId: this.roomId,
      x: initX,
      y: initY,
      direction: 'down',
      isMoving: false,
      seq: 0,
      timestamp: Date.now(),
    };

    this.clients.set(userId, session);
    this.playerStates.set(userId, netState);

    // 1. Send Room Snapshot to the joining player
    const snapshotMsg: ServerMessage = {
      type: 'room_snapshot',
      roomId: this.roomId,
      players: Array.from(this.playerStates.values()),
      serverTime: Date.now(),
    };
    this.sendToSession(session, snapshotMsg);

    // 2. Broadcast player_joined to all other players in this room
    const joinedMsg: ServerMessage = {
      type: 'player_joined',
      roomId: this.roomId,
      player: netState,
    };
    this.broadcast(joinedMsg, userId);

    return { success: true };
  }

  public handleMoveIntent(
    userId: string,
    msg: ClientMoveIntentMessage
  ): void {
    const session = this.clients.get(userId);
    const currentState = this.playerStates.get(userId);
    if (!session || !currentState) return;

    session.lastSeen = Date.now();

    // Rate limit check
    if (!this.movementAuthority.checkRateLimit(userId)) {
      const rejectMsg: ServerMessage = {
        type: 'movement_rejected',
        roomId: this.roomId,
        seq: msg.seq,
        correctX: currentState.x,
        correctY: currentState.y,
        reason: 'Rate limit exceeded for movement updates',
      };
      this.sendToSession(session, rejectMsg);
      return;
    }

    const now = Date.now();
    const dtSeconds = Math.max(0.016, (now - currentState.timestamp) / 1000);

    const validation = this.movementAuthority.validateMovement(
      currentState.x,
      currentState.y,
      msg.x,
      msg.y,
      dtSeconds,
      this.mapBounds
    );

    if (!validation.valid) {
      // Send correction to the client
      const rejectMsg: ServerMessage = {
        type: 'movement_rejected',
        roomId: this.roomId,
        seq: msg.seq,
        correctX: validation.correctX,
        correctY: validation.correctY,
        reason: validation.reason || 'Server movement validation rejected state',
      };
      this.sendToSession(session, rejectMsg);
      return;
    }

    // Update authoritative player state
    currentState.x = validation.correctX;
    currentState.y = validation.correctY;
    currentState.direction = msg.direction;
    currentState.isMoving = msg.isMoving;
    currentState.seq = msg.seq;
    currentState.timestamp = now;

    this.dirtyPlayerIds.add(userId);
  }

  public handleReaction(userId: string, emoji: string): void {
    if (!this.clients.has(userId)) return;

    const reactionMsg: ServerMessage = {
      type: 'player_reaction',
      roomId: this.roomId,
      userId,
      emoji,
      timestamp: Date.now(),
    };

    // Broadcast reaction to all other connected players in the room
    this.broadcast(reactionMsg, userId);
  }

  public removePlayer(
    userId: string,
    reason: 'disconnect' | 'left' | 'timeout' = 'disconnect'
  ): void {
    const existed = this.clients.has(userId);
    if (!existed) return;

    this.clients.delete(userId);
    this.playerStates.delete(userId);
    this.dirtyPlayerIds.delete(userId);
    this.movementAuthority.cleanupUser(userId);

    const leftMsg: ServerMessage = {
      type: 'player_left',
      roomId: this.roomId,
      userId,
      reason,
    };
    this.broadcast(leftMsg);
  }

  public broadcast(msg: ServerMessage, excludeUserId?: string) {
    const json = JSON.stringify(msg);
    for (const [uid, session] of this.clients.entries()) {
      if (excludeUserId && uid === excludeUserId) continue;
      this.sendRaw(session, json);
    }
  }

  private sendToSession(session: RoomClientSession, msg: ServerMessage) {
    this.sendRaw(session, JSON.stringify(msg));
  }

  private sendRaw(session: RoomClientSession, data: string) {
    try {
      session.socket.send(data);
    } catch (err) {
      // Socket may have disconnected
    }
  }

  private startTickLoop() {
    const intervalMs = Math.round(1000 / this.tickRateHz);
    this.tickInterval = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  private tick() {
    if (this.dirtyPlayerIds.size === 0) return;

    // Collect updated player positions
    const updates: Array<{
      userId: string;
      x: number;
      y: number;
      direction: Direction;
      isMoving: boolean;
      seq: number;
      timestamp: number;
    }> = [];

    for (const uid of this.dirtyPlayerIds) {
      const state = this.playerStates.get(uid);
      if (state) {
        updates.push({
          userId: state.userId,
          x: state.x,
          y: state.y,
          direction: state.direction,
          isMoving: state.isMoving,
          seq: state.seq,
          timestamp: state.timestamp,
        });
      }
    }

    this.dirtyPlayerIds.clear();

    if (updates.length > 0) {
      const stateMsg: ServerMessage = {
        type: 'player_state',
        roomId: this.roomId,
        players: updates,
      };
      this.broadcast(stateMsg);
    }
  }

  public dispose() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.clients.clear();
    this.playerStates.clear();
    this.dirtyPlayerIds.clear();
  }
}

export class OfficeRoomManager {
  private rooms: Map<string, OfficeRoom> = new Map();
  private movementAuthority: MovementAuthority = new MovementAuthority();

  public getOrCreateRoom(roomId: string): OfficeRoom {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new OfficeRoom(roomId, this.movementAuthority);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  public getRoom(roomId: string): OfficeRoom | undefined {
    return this.rooms.get(roomId);
  }

  public removeEmptyRooms() {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.getPlayerCount() === 0) {
        room.dispose();
        this.rooms.delete(roomId);
      }
    }
  }

  public getAllRoomsStats(): Array<{ roomId: string; playerCount: number }> {
    return Array.from(this.rooms.entries()).map(([roomId, room]) => ({
      roomId,
      playerCount: room.getPlayerCount(),
    }));
  }

  public dispose() {
    for (const room of this.rooms.values()) {
      room.dispose();
    }
    this.rooms.clear();
  }
}

export const roomManager = new OfficeRoomManager();
