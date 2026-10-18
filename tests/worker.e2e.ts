/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * End-to-end smoke test for the Cloudflare Worker multiplayer stack.
 *
 * Requires a locally running worker (from the repo root):
 *   npx wrangler dev --port 8787
 * Then run:
 *   npx tsx tests/worker.e2e.ts
 *
 * Covers: /api/health, the ticket JSON contract (happy path, missing user,
 * disabled account, malformed token), WebSocket handshake via ticket,
 * single-use + room-scoped ticket rejection, register_map canonical/mismatch
 * flows, the movement validation round-trip, heartbeat/pong, reactions, and
 * disconnect broadcasts.
 */

import { WebSocket } from 'ws';
import { encodeMaskForTransport, computeMaskHash } from '../src/game/maps/mapSchema';
import { PROTOCOL_VERSION } from '../src/multiplayer/protocol';

const BASE = process.env.WORKER_BASE_URL || 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const ROOM = `e2e_${Date.now()}`;

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeMask(width: number, height: number): boolean[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => false));
}

async function postTicket(payload: unknown, authorization?: string) {
  const res = await fetch(`${BASE}/api/auth/ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(payload),
  });
  const contentType = res.headers.get('content-type') || '';
  const body = await res.json().catch(() => null);
  return { status: res.status, contentType, body };
}

interface SocketHarness {
  ws: WebSocket;
  messages: any[];
  waitFor(predicate: (m: any) => boolean, timeoutMs?: number): Promise<any>;
}

function connectSocket(url: string): Promise<SocketHarness> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: any[] = [];
    let settled = false;
    const waiters: Array<{
      predicate: (m: any) => boolean;
      resolve: (m: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }> = [];

    ws.on('message', (data) => {
      let msg: any = null;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      messages.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(msg)) {
          const waiter = waiters.splice(i, 1)[0];
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        }
      }
    });

    ws.on('open', () => {
      if (settled) return;
      settled = true;
      resolve({
        ws,
        messages,
        waitFor: (predicate, timeoutMs = 3000) =>
          new Promise((res, rej) => {
            const existing = messages.find(predicate);
            if (existing) return res(existing);
            const timer = setTimeout(() => {
              const idx = waiters.findIndex((w) => w.timer === timer);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(new Error(`Timed out after ${timeoutMs}ms waiting for a server message`));
            }, timeoutMs);
            waiters.push({ predicate, resolve: res, timer });
          }),
      });
    });

    ws.on('unexpected-response', (_req, res) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Unexpected handshake response: HTTP ${res.statusCode}`));
    });

    ws.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

/** Expects the WebSocket handshake to be rejected; resolves with the HTTP status. */
function expectRejected(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timed out waiting for handshake rejection'));
    }, 5000);
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      ws.terminate();
      resolve(res.statusCode ?? 0);
    });
    ws.on('error', () => {
      clearTimeout(timer);
      resolve(-1);
    });
    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error('Socket unexpectedly opened'));
    });
  });
}

async function main() {
  console.log(`Worker multiplayer e2e against ${BASE} (room: ${ROOM})`);

  // --- Health ---------------------------------------------------------------
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('health: protocol matches', health?.protocol === PROTOCOL_VERSION, JSON.stringify(health));

  // --- Ticket issuance ------------------------------------------------------
  const alice = await postTicket({ userId: 'e2e-alice', displayName: 'Alice', roomId: ROOM });
  check('ticket(alice): 200 JSON', alice.status === 200 && alice.contentType.includes('application/json'), JSON.stringify(alice));
  check('ticket(alice): ticketId issued', typeof alice.body?.ticketId === 'string' && alice.body.ticketId.startsWith('tkt_'));
  check('ticket(alice): verified=false without token', alice.body?.verified === false);
  check('ticket(alice): room echoed', alice.body?.roomId === ROOM);
  const aliceTicket: string = alice.body?.ticketId;

  const missingUser = await postTicket({ displayName: 'Nobody', roomId: ROOM });
  check('ticket(no user): 400 JSON', missingUser.status === 400 && missingUser.contentType.includes('application/json'));

  const disabled = await postTicket({ userId: 'e2e-disabled', status: 'disabled', roomId: ROOM });
  check('ticket(disabled): 403', disabled.status === 403);

  const badToken = await postTicket({ userId: 'e2e-alice', roomId: ROOM }, 'Bearer not-a-token');
  check('ticket(bad token): 401 JSON', badToken.status === 401 && badToken.contentType.includes('application/json'));

  const badMethod = await fetch(`${BASE}/api/auth/ticket`);
  check('ticket(GET): 405 JSON', badMethod.status === 405 && (badMethod.headers.get('content-type') || '').includes('application/json'));

  const notFound = await fetch(`${BASE}/api/does-not-exist`);
  check('api fallback: 404 JSON', notFound.status === 404 && (notFound.headers.get('content-type') || '').includes('application/json'));

  // --- Handshake rejection paths --------------------------------------------
  const noTicketStatus = await expectRejected(`${WS_BASE}/ws?roomId=${ROOM}`).catch(() => -99);
  check('ws(no ticket): rejected with 401', noTicketStatus === 401, `status=${noTicketStatus}`);

  const bob = await postTicket({ userId: 'e2e-bob', displayName: 'Bob', roomId: ROOM });
  const bobTicket: string = bob.body?.ticketId;
  check('ticket(bob): issued', typeof bobTicket === 'string');

  const wrongRoomStatus = await expectRejected(
    `${WS_BASE}/ws?ticket=${bobTicket}&roomId=e2e_other_room`
  ).catch(() => -99);
  check('ws(ticket scoped to another room): rejected with 403', wrongRoomStatus === 403, `status=${wrongRoomStatus}`);

  // --- Alice connects and registers the canonical map ------------------------
  const aliceSock = await connectSocket(`${WS_BASE}/ws?ticket=${aliceTicket}&roomId=${ROOM}`);
  const welcome = await aliceSock.waitFor((m) => m.type === 'welcome');
  check('alice: welcome with protocol version', welcome.version === PROTOCOL_VERSION);
  const snapshot = await aliceSock.waitFor((m) => m.type === 'room_snapshot');
  check('alice: snapshot contains only alice', snapshot.players?.length === 1 && snapshot.players[0]?.userId === 'e2e-alice');

  const reuseStatus = await expectRejected(`${WS_BASE}/ws?ticket=${aliceTicket}&roomId=${ROOM}`).catch(() => -99);
  check('ws(consumed ticket reuse): rejected with 403', reuseStatus === 403, `status=${reuseStatus}`);

  const mask64 = makeMask(6, 4);
  aliceSock.ws.send(
    JSON.stringify({
      type: 'register_map',
      roomId: ROOM,
      mapId: ROOM,
      width: 6,
      height: 4,
      tileSize: 32,
      maskHash: computeMaskHash(6, 4, mask64),
      maskRle: encodeMaskForTransport(mask64),
      spawnTileX: 1,
      spawnTileY: 1,
    })
  );
  const registered = await aliceSock.waitFor((m) => m.type === 'map_registered');
  check('alice: map_registered canonical', registered.canonical === true && registered.width === 6 && registered.height === 4);
  check('alice: validated spawn tile center', registered.spawnX === 48 && registered.spawnY === 48, `${registered.spawnX},${registered.spawnY}`);

  const occupants = await fetch(`${BASE}/api/rooms?roomId=${ROOM}`).then((r) => r.json());
  check('api/rooms: reports alice + registered map', occupants?.players?.length === 1 && occupants?.map?.width === 6);

  // --- Movement round-trip ---------------------------------------------------
  aliceSock.ws.send(
    JSON.stringify({
      type: 'move_intent',
      seq: 1,
      roomId: ROOM,
      x: 50,
      y: 48,
      vx: 0,
      vy: 0,
      direction: 'right',
      isMoving: true,
      clientTime: Date.now(),
    })
  );
  const stateMsg = await aliceSock.waitFor(
    (m) => m.type === 'player_state' && m.players?.some((p: any) => p.userId === 'e2e-alice' && p.x === 50),
    undefined
  ).catch(async (err) => {
    // Surface a rejection message if the authority refused the move instead.
    const rejection = aliceSock.messages.find((m) => m.type === 'movement_rejected');
    throw new Error(`${err.message}${rejection ? ` (server rejected: ${rejection.reason})` : ''}`);
  });
  check('alice: player_state broadcast for move', !!stateMsg);

  // --- Heartbeat -------------------------------------------------------------
  const pingAt = Date.now();
  aliceSock.ws.send(JSON.stringify({ type: 'heartbeat', timestamp: pingAt }));
  const pong = await aliceSock.waitFor((m) => m.type === 'pong');
  check('alice: pong echoes client timestamp', pong.clientTimestamp === pingAt);

  // --- Bob joins: mismatch then canonical agree ------------------------------
  const bobSock = await connectSocket(`${WS_BASE}/ws?ticket=${bobTicket}&roomId=${ROOM}`);
  const bobSnapshot = await bobSock.waitFor((m) => m.type === 'room_snapshot');
  check('bob: snapshot includes both players', bobSnapshot.players?.length === 2);
  const joined = await aliceSock.waitFor((m) => m.type === 'player_joined' && m.player?.userId === 'e2e-bob');
  check('alice: player_joined broadcast', !!joined);

  const mask44 = makeMask(4, 4);
  bobSock.ws.send(
    JSON.stringify({
      type: 'register_map',
      roomId: ROOM,
      mapId: ROOM,
      width: 4,
      height: 4,
      tileSize: 32,
      maskHash: computeMaskHash(4, 4, mask44),
      maskRle: encodeMaskForTransport(mask44),
    })
  );
  const mismatch = await bobSock.waitFor((m) => m.type === 'map_mismatch');
  check(
    'bob: mismatch reports canonical map',
    mismatch.width === 6 && mismatch.height === 4 && typeof mismatch.maskRle === 'string' && mismatch.maskRle.length > 0
  );

  bobSock.ws.send(
    JSON.stringify({
      type: 'register_map',
      roomId: ROOM,
      mapId: ROOM,
      width: 6,
      height: 4,
      tileSize: 32,
      maskHash: computeMaskHash(6, 4, mask64),
      maskRle: encodeMaskForTransport(mask64),
    })
  );
  const bobRegistered = await bobSock.waitFor((m) => m.type === 'map_registered');
  check('bob: map_registered canonical=false', bobRegistered.canonical === false);

  // --- Reaction + disconnect --------------------------------------------------
  bobSock.ws.send(JSON.stringify({ type: 'reaction', roomId: ROOM, emoji: '👋' }));
  const reaction = await aliceSock.waitFor((m) => m.type === 'player_reaction' && m.userId === 'e2e-bob');
  check('alice: reaction from bob', reaction.emoji === '👋');

  bobSock.ws.close();
  const left = await aliceSock.waitFor((m) => m.type === 'player_left' && m.userId === 'e2e-bob');
  check('alice: player_left after bob disconnects', left.reason === 'disconnect');

  aliceSock.ws.send(JSON.stringify({ type: 'leave_room', roomId: ROOM }));
  await sleep(150);
  aliceSock.ws.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('e2e fatal error:', err);
  process.exit(1);
});
