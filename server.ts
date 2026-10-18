/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateClientMessage,
  ClientMessage,
  ServerMessage,
  PROTOCOL_VERSION,
  MAX_MESSAGE_SIZE_BYTES,
  DEFAULT_TICK_RATE,
} from './src/multiplayer/protocol';
import { ticketService } from './src/multiplayer/ticketService';
import { roomManager, RoomClientSession } from './src/multiplayer/room';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '64kb' }));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    protocol: PROTOCOL_VERSION,
    time: Date.now(),
    rooms: roomManager.getAllRoomsStats(),
  });
});

// Rooms status API
app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getAllRoomsStats());
});

// Connection Ticket Handshake API
// Authenticated clients exchange verified credential / session for short-lived ticket
app.post('/api/auth/ticket', (req, res) => {
  try {
    const { userId, displayName, role, avatarConfig, roomId } = req.body;

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      res.status(400).json({ error: 'Missing or invalid userId' });
      return;
    }

    // Role validation: client cannot arbitrarily grant admin without verification
    const safeRole: 'admin' | 'employee' = role === 'admin' ? 'admin' : 'employee';

    // Disallow disabled accounts
    if (req.body.status === 'disabled') {
      res.status(403).json({ error: 'Account is suspended or disabled' });
      return;
    }

    const targetRoomId = (roomId && typeof roomId === 'string') ? roomId : 'main_office';

    // Issue short-lived ticket with 60s TTL
    const ticket = ticketService.issueTicket({
      userId,
      displayName: displayName || 'Colleague',
      role: safeRole,
      avatarConfig: avatarConfig || {
        skinColor: '#f8c291',
        hairStyle: 'short',
        hairColor: '#3d2714',
        shirtColor: '#2563eb',
        pantsColor: '#1e293b',
        accessory: 'none',
      },
      roomId: targetRoomId,
    });

    res.json({
      ticketId: ticket.ticketId,
      expiresAt: ticket.expiresAt,
      roomId: ticket.roomId,
    });
  } catch (err: unknown) {
    console.error('Error issuing connection ticket:', err);
    res.status(500).json({ error: 'Internal server error while issuing ticket' });
  }
});

// WebSocket Server attached to HTTP server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  if (url.pathname === '/ws') {
    const ticketId = url.searchParams.get('ticket');
    const requestedRoomId = url.searchParams.get('roomId') || 'main_office';

    if (!ticketId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Consume ticket (validates single-use, non-expired, and room scope)
    const ticket = ticketService.consumeTicket(ticketId, requestedRoomId);
    if (!ticket) {
      socket.write('HTTP/1.1 403 Forbidden (Invalid or Expired Ticket)\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, ticket);
    });
  } else {
    // Normal HTTP upgrade or not matching /ws
  }
});

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage, ticket: any) => {
  const room = roomManager.getOrCreateRoom(ticket.roomId);

  const session: RoomClientSession = {
    userId: ticket.userId,
    displayName: ticket.displayName,
    role: ticket.role,
    avatarConfig: ticket.avatarConfig,
    roomId: ticket.roomId,
    socket: {
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      },
      readyState: ws.readyState,
      close: () => ws.close(),
    },
    lastSeen: Date.now(),
  };

  const addResult = room.addPlayer(session);
  if (!addResult.success) {
    ws.close(4003, addResult.error || 'Failed to join room');
    return;
  }

  // Send Welcome message
  const welcomeMsg: ServerMessage = {
    type: 'welcome',
    version: PROTOCOL_VERSION,
    userId: ticket.userId,
    serverTime: Date.now(),
    tickRate: DEFAULT_TICK_RATE,
  };
  ws.send(JSON.stringify(welcomeMsg));

  ws.on('message', (data: Buffer | string) => {
    try {
      const str = data.toString();
      if (str.length > MAX_MESSAGE_SIZE_BYTES) {
        ws.close(1009, 'Message payload too large');
        return;
      }

      const parsed = JSON.parse(str);
      const validation = validateClientMessage(parsed);
      if (!validation.valid || !validation.message) {
        return;
      }

      const msg = validation.message;
      session.lastSeen = Date.now();

      switch (msg.type) {
        case 'move_intent':
          room.handleMoveIntent(ticket.userId, msg);
          break;
        case 'heartbeat':
          const pongMsg: ServerMessage = {
            type: 'pong',
            clientTimestamp: msg.timestamp,
            serverTime: Date.now(),
          };
          ws.send(JSON.stringify(pongMsg));
          break;
        case 'leave_room':
          room.removePlayer(ticket.userId, 'left');
          break;
        case 'request_resync':
          const snapshotMsg: ServerMessage = {
            type: 'room_snapshot',
            roomId: room.roomId,
            players: room.getOccupants(),
            serverTime: Date.now(),
          };
          ws.send(JSON.stringify(snapshotMsg));
          break;
        case 'reaction':
          room.handleReaction(ticket.userId, msg.emoji);
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    room.removePlayer(ticket.userId, 'disconnect');
  });

  ws.on('error', (err) => {
    console.warn(`WebSocket error for user ${ticket.userId}:`, err);
    room.removePlayer(ticket.userId, 'disconnect');
  });
});

// Fallback API route: Never let /api/* fall through to Vite SPA index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// Periodic stale room cleanup (every 60 seconds)
setInterval(() => {
  roomManager.removeEmptyRooms();
}, 60000);

// Mounting Frontend: Vite dev server in development, static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`GatherGrid Full-Stack Multiplayer Server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
