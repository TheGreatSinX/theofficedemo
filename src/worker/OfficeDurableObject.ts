/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cloudflare Durable Object hosting one authoritative `OfficeRoom` instance
 * per room id (the room id is the DO instance name). This is the Workers port
 * of the local dev server's room wiring (`server.ts`): connection tickets are
 * issued and consumed by the same DO using durable storage (per-room scope,
 * single-use, 60s TTL), and every WebSocket message flows through the shared
 * `OfficeRoom` logic (dynamic map registration, movement authority, ticks).
 */

import {
  PROTOCOL_VERSION,
  DEFAULT_TICK_RATE,
  MAX_MESSAGE_SIZE_BYTES,
  validateClientMessage,
  ServerMessage,
} from '../multiplayer/protocol';
import { MovementAuthority } from '../multiplayer/authority';
import { OfficeRoom, RoomClientSession } from '../multiplayer/room';
import { AvatarConfig } from '../types/game';

const TICKET_TTL_MS = 60 * 1000;

const DEFAULT_AVATAR: AvatarConfig = {
  skinColor: '#f8c291',
  hairStyle: 'short',
  hairColor: '#3d2714',
  shirtColor: '#2563eb',
  pantsColor: '#1e293b',
  accessory: 'none',
};

interface StoredTicket {
  ticketId: string;
  userId: string;
  displayName: string;
  role: 'admin' | 'employee';
  avatarConfig: AvatarConfig;
  roomId: string;
  createdAt: number;
  expiresAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function randomTicketId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `tkt_${hex}`;
}

export class OfficeDurableObject {
  private state: any; // DurableObjectState
  private env: any; // Env
  public readonly roomId: string;
  private room: OfficeRoom | null = null;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
    const name = state?.id?.name;
    this.roomId = typeof name === 'string' && name.length > 0 ? name : 'main_office';
  }

  /**
   * Lazily creates the room so an idle DO (no connected players) does not keep
   * a tick interval running; the room is released once the last player leaves.
   */
  private ensureRoom(): OfficeRoom {
    if (!this.room) {
      this.room = new OfficeRoom(this.roomId, new MovementAuthority());
    }
    return this.room;
  }

  private releaseRoomIfEmpty(): void {
    if (this.room && this.room.getPlayerCount() === 0) {
      this.room.dispose();
      this.room = null;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      return this.handleWebSocket(request, url);
    }

    if (url.pathname === '/occupants') {
      return json({
        roomId: this.roomId,
        players: this.room?.getOccupants() ?? [],
        map: this.room?.getMapRegistrationInfo() ?? null,
      });
    }

    if (url.pathname === '/issue-ticket') {
      return this.handleIssueTicket(request);
    }

    return new Response('OfficeDurableObject Active', { status: 200 });
  }

  /**
   * Internal endpoint (only reachable through the Worker): stores a
   * single-use connection ticket for this room. Identity was resolved by the
   * Worker; the role is re-normalized here so a malformed call can never mint
   * an admin.
   */
  private async handleIssueTicket(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (typeof body?.userId !== 'string' || body.userId.length === 0) {
      return json({ error: 'Missing userId' }, 400);
    }

    const now = Date.now();
    const ticket: StoredTicket = {
      ticketId: randomTicketId(),
      userId: body.userId,
      displayName:
        typeof body.displayName === 'string' && body.displayName.length > 0
          ? body.displayName
          : 'Colleague',
      role: body.role === 'admin' ? 'admin' : 'employee',
      avatarConfig: (body.avatarConfig as AvatarConfig) || DEFAULT_AVATAR,
      roomId: this.roomId,
      createdAt: now,
      expiresAt: now + TICKET_TTL_MS,
    };

    await this.state.storage.put(`ticket:${ticket.ticketId}`, ticket, {
      expirationTtl: TICKET_TTL_MS / 1000,
    });

    return json({
      ticketId: ticket.ticketId,
      expiresAt: ticket.expiresAt,
      roomId: ticket.roomId,
      verified: body.verified === true,
    });
  }

  /**
   * WebSocket handshake. Ticket consumption mirrors `TicketService.consumeTicket`:
   * single-use (deleted on first presentation), non-expired, and scoped to the
   * room id this DO hosts.
   */
  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const ticketId = url.searchParams.get('ticket');
    if (!ticketId) {
      return new Response('Missing connection ticket', { status: 401 });
    }

    const requestedRoomId = url.searchParams.get('roomId') || 'main_office';
    if (requestedRoomId !== this.roomId) {
      return new Response('Room mismatch', { status: 403 });
    }

    const storageKey = `ticket:${ticketId}`;
    const stored = (await this.state.storage.get(storageKey)) as StoredTicket | undefined;
    // Single-use: consume the ticket regardless of the outcome.
    await this.state.storage.delete(storageKey);

    if (!stored || stored.roomId !== requestedRoomId || Date.now() > stored.expiresAt) {
      return new Response('Invalid or expired ticket', { status: 403 });
    }

    const pair = new (globalThis as any).WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const room = this.ensureRoom();
    const session: RoomClientSession = {
      userId: stored.userId,
      displayName: stored.displayName,
      role: stored.role,
      avatarConfig: stored.avatarConfig,
      roomId: this.roomId,
      socket: {
        send: (data: string) => {
          try {
            server.send(data);
          } catch {
            // Socket already closed
          }
        },
        readyState: 1,
        close: () => {
          try {
            server.close();
          } catch {
            // Socket already closed
          }
        },
      },
      lastSeen: Date.now(),
    };

    // Note: addPlayer sends the room_snapshot before this welcome, mirroring
    // the local server's ordering.
    const addResult = room.addPlayer(session);
    if (!addResult.success) {
      server.close(4003, addResult.error || 'Failed to join room');
      this.releaseRoomIfEmpty();
      return new Response(null, { status: 101, webSocket: client } as any);
    }

    const welcomeMsg: ServerMessage = {
      type: 'welcome',
      version: PROTOCOL_VERSION,
      userId: stored.userId,
      serverTime: Date.now(),
      tickRate: DEFAULT_TICK_RATE,
    };
    server.send(JSON.stringify(welcomeMsg));

    server.addEventListener('message', (event: any) => {
      try {
        const raw = event?.data;
        const text =
          typeof raw === 'string'
            ? raw
            : raw instanceof ArrayBuffer
              ? new TextDecoder().decode(raw)
              : '';
        if (!text) return;

        if (text.length > MAX_MESSAGE_SIZE_BYTES) {
          server.close(1009, 'Message payload too large');
          return;
        }

        const parsed = JSON.parse(text);
        const validation = validateClientMessage(parsed);
        if (!validation.valid || !validation.message) {
          return;
        }

        const msg = validation.message;
        session.lastSeen = Date.now();

        switch (msg.type) {
          case 'move_intent':
            room.handleMoveIntent(stored.userId, msg);
            break;
          case 'heartbeat': {
            const pongMsg: ServerMessage = {
              type: 'pong',
              clientTimestamp: msg.timestamp,
              serverTime: Date.now(),
            };
            server.send(JSON.stringify(pongMsg));
            break;
          }
          case 'leave_room':
            room.removePlayer(stored.userId, 'left');
            this.releaseRoomIfEmpty();
            break;
          case 'request_resync': {
            const snapshotMsg: ServerMessage = {
              type: 'room_snapshot',
              roomId: room.roomId,
              players: room.getOccupants(),
              serverTime: Date.now(),
            };
            server.send(JSON.stringify(snapshotMsg));
            break;
          }
          case 'reaction':
            room.handleReaction(stored.userId, msg.emoji);
            break;
          case 'register_map':
            room.registerMap(session, msg);
            break;
        }
      } catch (err) {
        console.warn('[OfficeDurableObject] Error handling WebSocket message:', err);
      }
    });

    server.addEventListener('close', () => {
      room.removePlayer(stored.userId, 'disconnect');
      this.releaseRoomIfEmpty();
    });

    server.addEventListener('error', () => {
      room.removePlayer(stored.userId, 'disconnect');
      this.releaseRoomIfEmpty();
    });

    return new Response(null, { status: 101, webSocket: client } as any);
  }
}
