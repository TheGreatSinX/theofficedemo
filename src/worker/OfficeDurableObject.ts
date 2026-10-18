/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PlayerNetState,
  ServerMessage,
  ClientMessage,
  validateClientMessage,
  PROTOCOL_VERSION,
  DEFAULT_TICK_RATE,
  MAX_MESSAGE_SIZE_BYTES,
  MAX_PLAYERS_PER_ROOM,
} from '../multiplayer/protocol';
import { MovementAuthority } from '../multiplayer/authority';
import { Direction, AvatarConfig } from '../types/game';

/**
 * Cloudflare Durable Object implementation for Authoritative Office Room State.
 * This class coordinates real-time WebSockets, movement validation, and ticks on Cloudflare edge.
 */
export class OfficeDurableObject {
  private state: any; // DurableObjectState
  private env: any;
  private roomId: string = 'main_office';
  private clients: Map<string, { ws: WebSocket; userId: string; lastSeen: number }> = new Map();
  private playerStates: Map<string, PlayerNetState> = new Map();
  private dirtyPlayerIds: Set<string> = new Set();
  private movementAuthority: MovementAuthority = new MovementAuthority();
  private tickInterval: any = null;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const userId = url.searchParams.get('userId') || `user_${Date.now()}`;
      const displayName = url.searchParams.get('displayName') || 'Colleague';
      const role = (url.searchParams.get('role') === 'admin' ? 'admin' : 'employee') as 'admin' | 'employee';

      // Cloudflare WebSocket Pair
      const [client, server] = Object.values(new (globalThis as any).WebSocketPair());
      (server as any).accept();

      this.handleWebSocket(server as any, {
        userId,
        displayName,
        role,
        avatarConfig: {
          skinColor: '#f8c291',
          hairStyle: 'short',
          hairColor: '#3d2714',
          shirtColor: role === 'admin' ? '#7c3aed' : '#2563eb',
          pantsColor: '#1e293b',
          accessory: 'none',
        },
      });

      return new Response(null, {
        status: 101,
        webSocket: client as any,
      } as any);
    }

    if (url.pathname === '/occupants') {
      return new Response(JSON.stringify(Array.from(this.playerStates.values())), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('OfficeDurableObject Active', { status: 200 });
  }

  private handleWebSocket(
    ws: WebSocket,
    userMeta: { userId: string; displayName: string; role: 'admin' | 'employee'; avatarConfig: AvatarConfig }
  ) {
    const { userId, displayName, role, avatarConfig } = userMeta;

    if (this.clients.size >= MAX_PLAYERS_PER_ROOM) {
      ws.close(4003, 'Room is full (max 50 users)');
      return;
    }

    const netState: PlayerNetState = {
      userId,
      displayName,
      role,
      avatarConfig,
      roomId: this.roomId,
      x: 8 * 32 + 16,
      y: 11 * 32 + 16,
      direction: 'down',
      isMoving: false,
      seq: 0,
      timestamp: Date.now(),
    };

    this.clients.set(userId, { ws, userId, lastSeen: Date.now() });
    this.playerStates.set(userId, netState);

    // Send room snapshot
    const snapshotMsg: ServerMessage = {
      type: 'room_snapshot',
      roomId: this.roomId,
      players: Array.from(this.playerStates.values()),
      serverTime: Date.now(),
    };
    ws.send(JSON.stringify(snapshotMsg));

    // Broadcast player joined
    this.broadcast({
      type: 'player_joined',
      roomId: this.roomId,
      player: netState,
    }, userId);

    ws.addEventListener('message', (event) => {
      try {
        const text = typeof event.data === 'string' ? event.data : '';
        if (text.length > MAX_MESSAGE_SIZE_BYTES) {
          ws.close(1009, 'Payload too large');
          return;
        }

        const data = JSON.parse(text);
        const validated = validateClientMessage(data);
        if (!validated.valid || !validated.message) return;

        const msg = validated.message;
        if (msg.type === 'move_intent') {
          const current = this.playerStates.get(userId);
          if (current) {
            const validation = this.movementAuthority.validateMovement(
              current.x,
              current.y,
              msg.x,
              msg.y,
              0.05,
              { width: 36, height: 24, tileSize: 32 }
            );

            if (validation.valid) {
              current.x = validation.correctX;
              current.y = validation.correctY;
              current.direction = msg.direction;
              current.isMoving = msg.isMoving;
              current.seq = msg.seq;
              current.timestamp = Date.now();
              this.dirtyPlayerIds.add(userId);
            } else {
              ws.send(JSON.stringify({
                type: 'movement_rejected',
                roomId: this.roomId,
                seq: msg.seq,
                correctX: validation.correctX,
                correctY: validation.correctY,
                reason: validation.reason,
              }));
            }
          }
        } else if (msg.type === 'heartbeat') {
          ws.send(JSON.stringify({
            type: 'pong',
            clientTimestamp: msg.timestamp,
            serverTime: Date.now(),
          }));
        } else if (msg.type === 'leave_room') {
          this.removePlayer(userId, 'left');
        } else if (msg.type === 'reaction') {
          this.broadcast(
            {
              type: 'player_reaction',
              roomId: this.roomId,
              userId,
              emoji: msg.emoji,
              timestamp: Date.now(),
            },
            userId
          );
        }
      } catch (err) {
        // Ignore parse error
      }
    });

    ws.addEventListener('close', () => {
      this.removePlayer(userId, 'disconnect');
    });

    // Ensure tick loop is running
    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => this.tick(), 1000 / DEFAULT_TICK_RATE);
    }
  }

  private tick() {
    if (this.dirtyPlayerIds.size === 0) return;

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
      this.broadcast({
        type: 'player_state',
        roomId: this.roomId,
        players: updates,
      });
    }
  }

  private removePlayer(userId: string, reason: 'disconnect' | 'left' = 'disconnect') {
    if (!this.clients.has(userId)) return;

    this.clients.delete(userId);
    this.playerStates.delete(userId);
    this.dirtyPlayerIds.delete(userId);

    this.broadcast({
      type: 'player_left',
      roomId: this.roomId,
      userId,
      reason,
    });

    if (this.clients.size === 0 && this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private broadcast(msg: ServerMessage, excludeUserId?: string) {
    const json = JSON.stringify(msg);
    for (const [uid, client] of this.clients.entries()) {
      if (excludeUserId && uid === excludeUserId) continue;
      try {
        client.ws.send(json);
      } catch {
        // Socket closed
      }
    }
  }
}
