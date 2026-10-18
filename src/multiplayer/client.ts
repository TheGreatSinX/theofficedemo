/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ClientMessage,
  ClientRegisterMapMessage,
  ServerMessage,
  ServerMapRegisteredMessage,
  ServerMapMismatchMessage,
  PlayerNetState,
  PROTOCOL_VERSION,
  DEFAULT_TICK_RATE,
} from './protocol';
import { IMultiplayerTransport, WebSocketTransport } from './transport';
import { UserProfile, Direction } from '../types/game';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface MultiplayerClientConfig {
  wsUrl?: string;
  ticketEndpoint?: string;
}

export class MultiplayerClient {
  private transport: IMultiplayerTransport;
  private state: ConnectionState = 'idle';
  private currentRoomId: string = 'main_office';
  private userProfile: UserProfile | null = null;
  private idToken: string | null = null;

  private seqNumber: number = 0;
  private lastMoveSentTime: number = 0;
  private moveThrottleMs: number = 1000 / DEFAULT_TICK_RATE; // ~50ms
  private pendingMoveIntent: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    direction: Direction;
    isMoving: boolean;
  } | null = null;

  // Reconnection configuration
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 8;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isIntentionallyClosed: boolean = false;

  // Latency tracking
  private pingInterval: NodeJS.Timeout | null = null;
  private currentPingMs: number = 0;

  // Listeners
  private stateListeners: Array<(state: ConnectionState) => void> = [];
  private snapshotListeners: Array<(players: PlayerNetState[]) => void> = [];
  private playerJoinedListeners: Array<(player: PlayerNetState) => void> = [];
  private playerLeftListeners: Array<(userId: string) => void> = [];
  private playerStateListeners: Array<
    (
      states: Array<{
        userId: string;
        x: number;
        y: number;
        direction: Direction;
        isMoving: boolean;
        seq: number;
        timestamp: number;
      }>
    ) => void
  > = [];
  private correctionListeners: Array<
    (correction: { correctX: number; correctY: number; seq: number; reason: string }) => void
  > = [];
  private reactionListeners: Array<(reaction: { userId: string; emoji: string }) => void> = [];
  private mapRegisteredListeners: Array<(info: ServerMapRegisteredMessage) => void> = [];
  private mapMismatchListeners: Array<(info: ServerMapMismatchMessage) => void> = [];

  /** Map registration payload sent after joining so the server validates against this map. */
  private mapRegistration: ClientRegisterMapMessage | null = null;

  constructor(transport?: IMultiplayerTransport) {
    this.transport = transport || new WebSocketTransport();
    this.setupTransportListeners();
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getPing(): number {
    return this.currentPingMs;
  }

  public getCurrentRoomId(): string {
    return this.currentRoomId;
  }

  private setupTransportListeners() {
    this.transport.onOpen(() => {
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.startHeartbeat();

      // Send join_room immediately after socket opens
      this.transport.send({
        type: 'join_room',
        version: PROTOCOL_VERSION,
        roomId: this.currentRoomId,
      });

      // Follow up with the map declaration so server-side movement validation
      // uses this map's actual dimensions and collision mask.
      if (this.mapRegistration) {
        this.transport.send({ ...this.mapRegistration, roomId: this.currentRoomId });
      }
    });

    this.transport.onMessage((msg: ServerMessage) => {
      this.handleServerMessage(msg);
    });

    this.transport.onClose((code, reason) => {
      this.stopHeartbeat();
      if (this.isIntentionallyClosed) {
        this.setState('disconnected');
        return;
      }

      if (code === 4001 || code === 4003) {
        // Authentication or room forbidden error, do not retry indefinitely
        console.warn('Multiplayer connection rejected by server:', reason);
        this.setState('failed');
        return;
      }

      this.scheduleReconnect();
    });

    this.transport.onError((err) => {
      console.warn('Multiplayer transport encountered error:', err);
    });
  }

  public async connect(
    userProfile: UserProfile,
    roomId: string = 'main_office',
    idToken?: string
  ): Promise<void> {
    this.isIntentionallyClosed = false;
    this.userProfile = userProfile;
    this.currentRoomId = roomId;
    this.idToken = idToken || null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      // 1. Obtain short-lived connection ticket from secure backend
      const ticket = await this.fetchConnectionTicket(userProfile, roomId, this.idToken);

      // 2. Derive WebSocket URL
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${loc.host}/ws?ticket=${ticket}&roomId=${encodeURIComponent(roomId)}`;

      // 3. Connect transport
      await this.transport.connect(wsUrl);
    } catch (err) {
      console.warn('[Multiplayer] Connection attempt pending / retrying:', err);
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    }
  }

  private async fetchConnectionTicket(
    profile: UserProfile,
    roomId: string,
    idToken: string | null
  ): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch('/api/auth/ticket', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            userId: profile.id,
            displayName: profile.name,
            role: profile.role,
            avatarConfig: profile.avatarConfig,
            roomId,
          }),
        });

        const contentType = res.headers.get('content-type') || '';

        // If the backend is warming up or a proxy returned HTML (e.g. warmup.html)
        if (!contentType.includes('application/json')) {
          const text = await res.text().catch(() => '');
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, attempt * 500));
            continue;
          }
          throw new Error(
            `Server returned non-JSON response (${res.status}): ${text.slice(0, 80)}`
          );
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || errData.error || `Failed to acquire ticket: HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data || typeof data.ticketId !== 'string') {
          throw new Error('Invalid ticket response payload from server');
        }

        return data.ticketId;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }

    throw lastError || new Error('Failed to acquire ticket after retries');
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.transport.close();
    this.setState('disconnected');
  }

  public switchRoom(newRoomId: string): void {
    if (this.currentRoomId === newRoomId) return;

    if (this.state === 'connected') {
      this.transport.send({
        type: 'leave_room',
        roomId: this.currentRoomId,
      });
    }

    this.currentRoomId = newRoomId;
    // The map for the new room has not been declared yet.
    this.mapRegistration = null;

    if (this.userProfile) {
      this.connect(this.userProfile, newRoomId, this.idToken || undefined);
    }
  }

  /**
   * Declares the map this client is running so the server can validate
   * movement against it. Safe to call before or after connecting; the payload
   * is cached and (re)sent whenever the socket opens.
   */
  public setMapRegistration(
    payload: Omit<ClientRegisterMapMessage, 'type' | 'roomId'> | null
  ): void {
    if (!payload) {
      this.mapRegistration = null;
      return;
    }
    this.mapRegistration = {
      type: 'register_map',
      roomId: this.currentRoomId,
      ...payload,
    };
    if (this.transport.isOpen()) {
      this.transport.send({ ...this.mapRegistration, roomId: this.currentRoomId });
    }
  }

  public getMapRegistration(): ClientRegisterMapMessage | null {
    return this.mapRegistration;
  }

  /**
   * Throttled send of movement intent (up to 20Hz)
   */
  public sendMovement(movement: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    direction: Direction;
    isMoving: boolean;
  }): void {
    if (this.state !== 'connected') return;

    const now = Date.now();
    this.pendingMoveIntent = movement;

    if (now - this.lastMoveSentTime >= this.moveThrottleMs) {
      this.flushMovement();
    }
  }

  private flushMovement() {
    if (!this.pendingMoveIntent || this.state !== 'connected') return;

    this.seqNumber += 1;
    this.lastMoveSentTime = Date.now();

    const msg: ClientMessage = {
      type: 'move_intent',
      seq: this.seqNumber,
      roomId: this.currentRoomId,
      x: Math.round(this.pendingMoveIntent.x * 10) / 10,
      y: Math.round(this.pendingMoveIntent.y * 10) / 10,
      vx: Math.round(this.pendingMoveIntent.vx * 10) / 10,
      vy: Math.round(this.pendingMoveIntent.vy * 10) / 10,
      direction: this.pendingMoveIntent.direction,
      isMoving: this.pendingMoveIntent.isMoving,
      clientTime: this.lastMoveSentTime,
    };

    this.transport.send(msg);
  }

  private handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'welcome':
        // Connection handshake verified
        break;
      case 'room_snapshot':
        this.snapshotListeners.forEach((cb) => cb(msg.players));
        break;
      case 'player_joined':
        this.playerJoinedListeners.forEach((cb) => cb(msg.player));
        break;
      case 'player_left':
        this.playerLeftListeners.forEach((cb) => cb(msg.userId));
        break;
      case 'player_state':
        this.playerStateListeners.forEach((cb) => cb(msg.players));
        break;
      case 'movement_rejected':
        this.correctionListeners.forEach((cb) =>
          cb({
            correctX: msg.correctX,
            correctY: msg.correctY,
            seq: msg.seq,
            reason: msg.reason,
          })
        );
        break;
      case 'pong':
        this.currentPingMs = Math.max(1, Date.now() - msg.clientTimestamp);
        break;
      case 'server_error':
        console.error('Multiplayer server error:', msg.code, msg.message);
        break;
      case 'player_reaction':
        this.reactionListeners.forEach((cb) => cb({ userId: msg.userId, emoji: msg.emoji }));
        break;
      case 'map_registered':
        this.mapRegisteredListeners.forEach((cb) => cb(msg));
        break;
      case 'map_mismatch':
        console.warn(
          `[Multiplayer] Room is running map "${msg.mapId}" (${msg.width}x${msg.height}, hash ${msg.maskHash}):`,
          msg.message
        );
        this.mapMismatchListeners.forEach((cb) => cb(msg));
        break;
    }
  }

  private scheduleReconnect() {
    if (this.isIntentionallyClosed) return;

    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.setState('failed');
      return;
    }

    this.setState('reconnecting');
    // Exponential backoff with jitter: 400ms, 800ms, 1600ms, etc.
    const backoff = Math.min(
      8000,
      Math.pow(2, this.reconnectAttempts) * 350 + Math.random() * 250
    );

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isIntentionallyClosed && this.userProfile) {
        this.connect(this.userProfile, this.currentRoomId, this.idToken || undefined);
      }
    }, backoff);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.transport.isOpen()) {
        this.transport.send({
          type: 'heartbeat',
          timestamp: Date.now(),
        });
      }
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((cb) => cb(newState));
    }
  }

  // Subscription methods
  public onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.stateListeners.push(callback);
    callback(this.state);
    return () => {
      this.stateListeners = this.stateListeners.filter((cb) => cb !== callback);
    };
  }

  public onRoomSnapshot(callback: (players: PlayerNetState[]) => void): () => void {
    this.snapshotListeners.push(callback);
    return () => {
      this.snapshotListeners = this.snapshotListeners.filter((cb) => cb !== callback);
    };
  }

  public onPlayerJoined(callback: (player: PlayerNetState) => void): () => void {
    this.playerJoinedListeners.push(callback);
    return () => {
      this.playerJoinedListeners = this.playerJoinedListeners.filter((cb) => cb !== callback);
    };
  }

  public onPlayerLeft(callback: (userId: string) => void): () => void {
    this.playerLeftListeners.push(callback);
    return () => {
      this.playerLeftListeners = this.playerLeftListeners.filter((cb) => cb !== callback);
    };
  }

  public onPlayerStates(
    callback: (
      states: Array<{
        userId: string;
        x: number;
        y: number;
        direction: Direction;
        isMoving: boolean;
        seq: number;
        timestamp: number;
      }>
    ) => void
  ): () => void {
    this.playerStateListeners.push(callback);
    return () => {
      this.playerStateListeners = this.playerStateListeners.filter((cb) => cb !== callback);
    };
  }

  public onMovementRejected(
    callback: (correction: { correctX: number; correctY: number; seq: number; reason: string }) => void
  ): () => void {
    this.correctionListeners.push(callback);
    return () => {
      this.correctionListeners = this.correctionListeners.filter((cb) => cb !== callback);
    };
  }

  public sendReaction(emoji: string): void {
    if (!this.transport.isOpen()) return;
    this.transport.send({
      type: 'reaction',
      roomId: this.currentRoomId,
      emoji,
      timestamp: Date.now(),
    });
  }

  public onPlayerReaction(
    callback: (reaction: { userId: string; emoji: string }) => void
  ): () => void {
    this.reactionListeners.push(callback);
    return () => {
      this.reactionListeners = this.reactionListeners.filter((cb) => cb !== callback);
    };
  }

  public onMapRegistered(callback: (info: ServerMapRegisteredMessage) => void): () => void {
    this.mapRegisteredListeners.push(callback);
    return () => {
      this.mapRegisteredListeners = this.mapRegisteredListeners.filter((cb) => cb !== callback);
    };
  }

  public onMapMismatch(callback: (info: ServerMapMismatchMessage) => void): () => void {
    this.mapMismatchListeners.push(callback);
    return () => {
      this.mapMismatchListeners = this.mapMismatchListeners.filter((cb) => cb !== callback);
    };
  }
}

export const multiplayerClient = new MultiplayerClient();
