/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cloudflare Worker entry point. Serves the built SPA from static assets and
 * hosts the authoritative multiplayer backend (connection tickets + Durable
 * Object rooms) that mirrors the local dev server in `server.ts`.
 *
 * Routing:
 *  - `GET  /api/health`        → protocol/health probe
 *  - `POST /api/auth/ticket`   → verified identity → single-use connection ticket
 *  - `GET  /api/rooms`         → occupants of a room (debug/ops)
 *  - `GET  /ws` (upgrade)      → forwarded verbatim to the room's Durable Object
 *  - `*    /api/*`             → JSON 404 (never falls through to the SPA)
 *  - everything else           → static assets (SPA fallback configured in
 *                                wrangler.jsonc)
 */

export { OfficeDurableObject } from './OfficeDurableObject';

import { resolveTicketIdentity } from './workerAuth';
import { PROTOCOL_VERSION, DEFAULT_TICK_RATE } from '../multiplayer/protocol';

interface Env {
  OFFICE_ROOM: any; // DurableObjectNamespace
  ASSETS: any; // Fetcher
}

/** Mirrors express.json({ limit: '64kb' }) in server.ts. */
const MAX_TICKET_BODY_CHARS = 64 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeRoomId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    ? value
    : 'main_office';
}

function roomStub(env: Env, roomId: string): any {
  const id = env.OFFICE_ROOM.idFromName(roomId);
  return env.OFFICE_ROOM.get(id);
}

/** Ticket handshake: verify identity, then store a ticket in the room's DO. */
async function handleTicketRequest(request: Request, env: Env): Promise<Response> {
  let body: any = {};
  try {
    const text = await request.text();
    if (text.length > MAX_TICKET_BODY_CHARS) {
      return json({ error: 'Request body too large' }, 413);
    }
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { identity, error } = await resolveTicketIdentity(
    request.headers.get('authorization') ?? undefined,
    body
  );
  if (!identity) {
    return json({ error: error?.message ?? 'Unauthorized' }, error?.status ?? 401);
  }

  // Disallow disabled accounts (mirrors server.ts).
  if (body.status === 'disabled') {
    return json({ error: 'Account is suspended or disabled' }, 403);
  }

  const roomId = normalizeRoomId(body.roomId);
  const doResponse = await roomStub(env, roomId).fetch('https://office.internal/issue-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: identity.userId,
      displayName: identity.displayName || 'Colleague',
      role: identity.role,
      avatarConfig: body.avatarConfig,
      verified: identity.verified,
    }),
  });

  return new Response(doResponse.body, {
    status: doResponse.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check (mirrors GET /api/health in server.ts).
    if (url.pathname === '/api/health') {
      return json({
        status: 'ok',
        protocol: PROTOCOL_VERSION,
        tickRate: DEFAULT_TICK_RATE,
        time: Date.now(),
      });
    }

    // Connection ticket handshake API.
    if (url.pathname === '/api/auth/ticket') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
      }
      return handleTicketRequest(request, env);
    }

    // Room occupancy (debug/ops): ?roomId=... defaults to main_office.
    if (url.pathname === '/api/rooms') {
      const roomId = normalizeRoomId(url.searchParams.get('roomId'));
      return roomStub(env, roomId).fetch('https://office.internal/occupants');
    }

    // WebSocket handshake: forward the original request (headers + ticket +
    // roomId query) to the room's Durable Object.
    if (url.pathname.startsWith('/ws')) {
      const roomId = normalizeRoomId(url.searchParams.get('roomId'));
      return roomStub(env, roomId).fetch(request);
    }

    // API fallback (mirrors server.ts): never let /api/* fall through to the SPA.
    if (url.pathname.startsWith('/api/')) {
      return json({ error: `API endpoint not found: ${request.method} ${url.pathname}` }, 404);
    }

    // Static assets. The assets router already serves every matching file
    // without invoking this worker; this branch covers SPA deep links, where
    // the configured `not_found_handling` may apply. As a safety net, serve
    // index.html ourselves for HTML navigation that still misses.
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (
        assetResponse.status === 404 &&
        request.method === 'GET' &&
        (request.headers.get('accept') || '').includes('text/html')
      ) {
        return env.ASSETS.fetch(new Request(new URL('/', url.origin).toString()));
      }
      return assetResponse;
    }

    return new Response('GatherGrid Cloudflare Worker Active', { status: 200 });
  },
};
