/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PlayerNetState,
  ServerMessage,
  ClientMoveIntentMessage,
  ClientRegisterMapMessage,
  DEFAULT_TICK_RATE,
  MAX_PLAYERS_PER_ROOM,
} from './protocol';
import { MovementAuthority, AuthoritativeMapBounds } from './authority';
import { Direction, AvatarConfig } from '../types/game';
import { getFactoryMap, hasFactoryMap } from '../game/maps/officeMaps';
import {
  computeMaskHash,
  decodeMaskFromTransport,
  encodeMaskForTransport,
  getCollisionMask,
} from '../game/maps/mapSchema';

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
  /** Map id the authoritative collision data was declared for. */
  private mapId: string = '';
  /** FNV-1a collision mask hash; 'unregistered' until a client declares one. */
  private mapMaskHash: string = 'unregistered';
  /** True once a client has declared the authoritative (edited) map. */
  private hasClientRegistration: boolean = false;

  constructor(
    roomId: string,
    movementAuthority: MovementAuthority,
    tickRateHz: number = DEFAULT_TICK_RATE
  ) {
    this.roomId = roomId;
    this.movementAuthority = movementAuthority;
    this.tickRateHz = tickRateHz;

    // Factory map data seeds the bounds; the first client `register_map` for
    // this room replaces it with the actual (possibly edited) map so movement
    // validation always matches what players see.
    if (hasFactoryMap(roomId)) {
      const mapData = getFactoryMap(roomId);
      const mask = getCollisionMask(mapData);
      this.mapId = mapData.id;
      this.mapBounds = {
        width: mapData.width,
        height: mapData.height,
        tileSize: mapData.tileSize,
        solidMask: mask,
      };
      this.mapMaskHash = computeMaskHash(mapData.width, mapData.height, mask);
    } else {
      // Default bounds until a client declares the room's actual map.
      this.mapId = roomId;
      this.mapBounds = {
        width: 36,
        height: 24,
        tileSize: 32,
      };
      this.mapMaskHash = 'unregistered';
    }

    this.startTickLoop();
  }

  public getPlayerCount(): number {
    return this.clients.size;
  }

  public getOccupants(): PlayerNetState[] {
    return Array.from(this.playerStates.values());
  }

  /** Snapshot of the authoritative map this room validates movement against. */
  public getMapRegistrationInfo(): {
    mapId: string;
    width: number;
    height: number;
    tileSize: number;
    maskHash: string;
    registered: boolean;
  } {
    return {
      mapId: this.mapId,
      width: this.mapBounds.width,
      height: this.mapBounds.height,
      tileSize: this.mapBounds.tileSize,
      maskHash: this.mapMaskHash,
      registered: this.hasClientRegistration,
    };
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

    // Determine initial spawn position (validated against the room map)
    const tileSize = this.mapBounds.tileSize;
    const requestedX = spawnX !== undefined ? spawnX : 8 * tileSize + tileSize / 2;
    const requestedY = spawnY !== undefined ? spawnY : 11 * tileSize + tileSize / 2;
    const safe = this.findOpenPosition(requestedX, requestedY);

    const netState: PlayerNetState = {
      userId,
      displayName,
      role,
      avatarConfig,
      roomId: this.roomId,
      x: safe.x,
      y: safe.y,
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

  /**
   * Handles a client declaring the map the room is running. The first
   * registration defines the authoritative map (dimensions, tile size and
   * collision mask) for the room; later registrations are answered with the
   * canonical data, or a mismatch report when they disagree.
   */
  public registerMap(session: RoomClientSession, msg: ClientRegisterMapMessage): void {
    if (!this.clients.has(session.userId)) return;

    const mask = decodeMaskFromTransport(msg.maskRle, msg.width, msg.height);
    if (!mask) {
      this.sendError(session, 'INVALID_MAP_MASK', 'Could not decode the collision mask from register_map.');
      return;
    }
    // Trust our own hash of the decoded mask, not the client-provided one.
    const decodedHash = computeMaskHash(msg.width, msg.height, mask);

    if (!this.hasClientRegistration) {
      this.mapId = msg.mapId;
      this.mapBounds = {
        width: msg.width,
        height: msg.height,
        tileSize: msg.tileSize,
        solidMask: mask,
      };
      this.mapMaskHash = decodedHash;
      this.hasClientRegistration = true;

      this.revalidatePlayersAgainstMap();

      const safe = this.applyClientSpawn(session.userId, msg);
      const reply: ServerMessage = {
        type: 'map_registered',
        roomId: this.roomId,
        mapId: this.mapId,
        width: this.mapBounds.width,
        height: this.mapBounds.height,
        tileSize: this.mapBounds.tileSize,
        maskHash: this.mapMaskHash,
        canonical: true,
        spawnX: safe.x,
        spawnY: safe.y,
      };
      // Broadcast so every client in the room knows the authoritative map.
      this.broadcast(reply);
      return;
    }

    const sameAsCanonical =
      this.mapBounds.width === msg.width &&
      this.mapBounds.height === msg.height &&
      this.mapMaskHash === decodedHash;

    if (sameAsCanonical) {
      const safe = this.applyClientSpawn(session.userId, msg);
      const reply: ServerMessage = {
        type: 'map_registered',
        roomId: this.roomId,
        mapId: this.mapId,
        width: this.mapBounds.width,
        height: this.mapBounds.height,
        tileSize: this.mapBounds.tileSize,
        maskHash: this.mapMaskHash,
        canonical: false,
        spawnX: safe.x,
        spawnY: safe.y,
      };
      this.sendToSession(session, reply);
      return;
    }

    // Mismatch: report the canonical room map so the client can reconcile.
    const canonicalMask = this.mapBounds.solidMask;
    const mismatch: ServerMessage = {
      type: 'map_mismatch',
      roomId: this.roomId,
      mapId: this.mapId,
      width: this.mapBounds.width,
      height: this.mapBounds.height,
      tileSize: this.mapBounds.tileSize,
      maskHash: this.mapMaskHash,
      maskRle: canonicalMask ? encodeMaskForTransport(canonicalMask) : '',
      message:
        'This room is validating movement against a different revision of this map. Ask everyone to save and reload, or reset the room.',
    };
    this.sendToSession(session, mismatch);
  }

  /**
   * Validates the registering client's spawn tile against the room map and
   * snaps the authoritative player state to it so the first move_intent is
   * accepted without a correction round-trip.
   */
  private applyClientSpawn(
    userId: string,
    msg: ClientRegisterMapMessage
  ): { x: number; y: number } {
    const tileSize = this.mapBounds.tileSize;
    const requestedX =
      (msg.spawnTileX !== undefined ? msg.spawnTileX : 8) * tileSize + tileSize / 2;
    const requestedY =
      (msg.spawnTileY !== undefined ? msg.spawnTileY : 11) * tileSize + tileSize / 2;
    const safe = this.findOpenPosition(requestedX, requestedY);

    const state = this.playerStates.get(userId);
    if (state) {
      state.x = safe.x;
      state.y = safe.y;
      state.timestamp = Date.now();
      this.dirtyPlayerIds.add(userId);
    }
    return safe;
  }

  /**
   * Clamps a world position into the room bounds and nudges it out of solid
   * tiles using an expanding ring search.
   */
  public findOpenPosition(x: number, y: number): { x: number; y: number } {
    const { width, height, tileSize, solidMask } = this.mapBounds;
    const margin = Math.max(4, tileSize / 2);
    const clampedX = Math.min(Math.max(x, margin), width * tileSize - margin);
    const clampedY = Math.min(Math.max(y, margin), height * tileSize - margin);
    if (!solidMask) return { x: clampedX, y: clampedY };

    let tx = Math.min(Math.max(Math.floor(clampedX / tileSize), 0), width - 1);
    let ty = Math.min(Math.max(Math.floor(clampedY / tileSize), 0), height - 1);
    if (!solidMask[ty]?.[tx]) return { x: clampedX, y: clampedY };

    const maxRadius = Math.max(width, height);
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // Only the ring border (skip interior, covered by smaller radii)
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!solidMask[ny]?.[nx]) {
            return { x: nx * tileSize + tileSize / 2, y: ny * tileSize + tileSize / 2 };
          }
        }
      }
    }
    return { x: clampedX, y: clampedY };
  }

  /**
   * After the authoritative map changes, relocate any player whose position is
   * now out of bounds or inside a solid tile and notify them of the correction.
   */
  private revalidatePlayersAgainstMap(): void {
    for (const [userId, state] of this.playerStates.entries()) {
      const safe = this.findOpenPosition(state.x, state.y);
      if (safe.x !== state.x || safe.y !== state.y) {
        state.x = safe.x;
        state.y = safe.y;
        state.timestamp = Date.now();
        this.dirtyPlayerIds.add(userId);

        const session = this.clients.get(userId);
        if (session) {
          const rejectMsg: ServerMessage = {
            type: 'movement_rejected',
            roomId: this.roomId,
            seq: state.seq,
            correctX: safe.x,
            correctY: safe.y,
            reason: 'Relocated to match the room map revision',
          };
          this.sendToSession(session, rejectMsg);
        }
      }
    }
  }

  private sendError(session: RoomClientSession, code: string, message: string): void {
    const errMsg: ServerMessage = { type: 'server_error', code, message };
    this.sendToSession(session, errMsg);
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
