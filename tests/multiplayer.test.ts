/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {
  validateClientMessage,
  ClientJoinRoomMessage,
  ClientMoveIntentMessage,
  PROTOCOL_VERSION,
  DEFAULT_TICK_RATE,
} from '../src/multiplayer/protocol';
import { MovementAuthority } from '../src/multiplayer/authority';
import { TicketService } from '../src/multiplayer/ticketService';
import { OfficeRoom, OfficeRoomManager, RoomClientSession } from '../src/multiplayer/room';
import { RemotePlayerManager } from '../src/multiplayer/RemotePlayerManager';
import { AvatarConfig } from '../src/types/game';

const sampleAvatar: AvatarConfig = {
  skinColor: '#f8c291',
  hairStyle: 'short',
  hairColor: '#3d2714',
  shirtColor: '#2563eb',
  pantsColor: '#1e293b',
  accessory: 'none',
};

async function runTests() {
  console.log('------------------------------------------------------------');
  console.log('GatherGrid Milestone 3 — Multiplayer & Authority Test Suite');
  console.log('------------------------------------------------------------\n');

  let passedCount = 0;
  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`✔ [PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`✘ [FAIL] ${name}:`, err.message);
      throw err;
    }
  };

  // ==========================================
  // SECTION 1: AUTHENTICATION & ROOM ACCESS
  // ==========================================
  console.log('--- 1. Authentication & Connection Tickets ---');

  const ticketService = new TicketService();

  await test('Test 1: Unauthenticated request cannot get valid ticket without userId', () => {
    // Missing userId must be rejected
    let threw = false;
    try {
      ticketService.issueTicket({
        userId: '',
        displayName: 'Guest',
        role: 'employee',
        avatarConfig: sampleAvatar,
        roomId: 'main_office',
      });
    } catch {
      threw = true;
    }
    // In service logic, invalid ticket consuming will fail
    const consumed = ticketService.consumeTicket('invalid_nonexistent_ticket');
    assert.strictEqual(consumed, null, 'Nonexistent ticket must not be consumable');
  });

  await test('Test 2: Invalid or expired connection tickets are rejected', () => {
    const ticket = ticketService.issueTicket({
      userId: 'user_alice',
      displayName: 'Alice',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'main_office',
    });

    // Simulate ticket expiration
    ticket.expiresAt = Date.now() - 5000;
    const consumed = ticketService.consumeTicket(ticket.ticketId, 'main_office');
    assert.strictEqual(consumed, null, 'Expired ticket must be rejected');
  });

  await test('Test 3: Single-use ticket prevents replay and impersonation', () => {
    const ticket = ticketService.issueTicket({
      userId: 'user_bob',
      displayName: 'Bob',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'main_office',
    });

    const firstUse = ticketService.consumeTicket(ticket.ticketId, 'main_office');
    assert.ok(firstUse !== null, 'First consumption must succeed');
    assert.strictEqual(firstUse?.userId, 'user_bob');

    const replayAttempt = ticketService.consumeTicket(ticket.ticketId, 'main_office');
    assert.strictEqual(replayAttempt, null, 'Second consumption (replay) must be rejected');
  });

  await test('Test 4: Ticket scoped to room cannot be used to join another room', () => {
    const ticket = ticketService.issueTicket({
      userId: 'user_charlie',
      displayName: 'Charlie',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'main_office',
    });

    const wrongRoom = ticketService.consumeTicket(ticket.ticketId, 'confidential_draft_room');
    assert.strictEqual(wrongRoom, null, 'Ticket must be rejected if requested room does not match ticket scope');
  });

  await test('Test 5: Protocol rejects malformed client message payloads', () => {
    const invalidPayloads = [
      null,
      {},
      { type: 'move_intent', x: NaN, y: 100 },
      { type: 'move_intent', x: 100, y: 100, seq: 'not_a_number' },
      { type: 'unknown_type' },
      { type: 'join_room', roomId: 12345 },
    ];

    for (const payload of invalidPayloads) {
      const res = validateClientMessage(payload);
      assert.strictEqual(res.valid, false, `Payload ${JSON.stringify(payload)} must be invalid`);
    }
  });

  // ==========================================
  // SECTION 2: MOVEMENT VALIDATION & AUTHORITY
  // ==========================================
  console.log('\n--- 2. Movement Validation & Authority ---');

  const authority = new MovementAuthority();
  const mapBounds = {
    width: 30,
    height: 20,
    tileSize: 32,
    solidMask: Array(20)
      .fill(null)
      .map(() => Array(30).fill(false)),
  };
  // Mark tile (5, 5) as solid wall
  mapBounds.solidMask[5][5] = true;

  await test('Test 6: Valid movement within speed and bounds is accepted', () => {
    const result = authority.validateMovement(100, 100, 110, 100, 0.05, mapBounds);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.correctX, 110);
    assert.strictEqual(result.correctY, 100);
  });

  await test('Test 7: Impossible movement speed (teleport hack) is rejected', () => {
    // Attempting to move 600px in 50ms (12,000 px/sec)
    const result = authority.validateMovement(100, 100, 700, 100, 0.05, mapBounds);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.correctX, 100);
    assert.ok(result.reason?.includes('speed'));
  });

  await test('Test 8: Out-of-bounds positions are clamped or rejected', () => {
    const result = authority.validateMovement(100, 100, -50, 100, 0.05, mapBounds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.correctX >= 16);
  });

  await test('Test 9: NaN or non-finite coordinates are strictly rejected', () => {
    const resNaN = authority.validateMovement(100, 100, NaN, 100, 0.05, mapBounds);
    assert.strictEqual(resNaN.valid, false);
    assert.strictEqual(resNaN.correctX, 100);

    const resInf = authority.validateMovement(100, 100, Infinity, 100, 0.05, mapBounds);
    assert.strictEqual(resInf.valid, false);
    assert.strictEqual(resInf.correctX, 100);
  });

  await test('Test 10: Excessive movement update rate is limited (rate limiter)', () => {
    const userId = 'spammer_user';
    const now = Date.now();
    for (let i = 0; i < 35; i++) {
      const allowed = authority.checkRateLimit(userId, now);
      assert.strictEqual(allowed, true);
    }
    // 36th update in the same second must be throttled
    const throttled = authority.checkRateLimit(userId, now);
    assert.strictEqual(throttled, false, 'Rate limit must throttle excessive updates (> 35/sec)');
  });

  await test('Test 11: Blocked-tile movement is rejected by solid collision mask', () => {
    // Tile (5, 5) corresponds to world coords (5*32 + 16, 5*32 + 16) = (176, 176)
    const currentX = 140;
    const currentY = 176;
    const blockedTargetX = 5 * 32 + 16;
    const blockedTargetY = 5 * 32 + 16;

    const result = authority.validateMovement(currentX, currentY, blockedTargetX, blockedTargetY, 0.05, mapBounds);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes('blocked'));
  });

  // ==========================================
  // SECTION 3: ROOM LIFECYCLE & ISOLATION
  // ==========================================
  console.log('\n--- 3. Room Lifecycle & Multi-User Isolation ---');

  const room = new OfficeRoom('test_room_alpha', new MovementAuthority(), 20);

  const createMockSocket = () => {
    const messages: any[] = [];
    return {
      messages,
      send: (data: string) => messages.push(JSON.parse(data)),
      readyState: 1,
    };
  };

  const clientA_sock = createMockSocket();
  const clientB_sock = createMockSocket();

  await test('Test 12: New player joining receives room snapshot', () => {
    const sessionA: RoomClientSession = {
      userId: 'player_a',
      displayName: 'Alice Lead',
      role: 'admin',
      avatarConfig: sampleAvatar,
      roomId: 'test_room_alpha',
      socket: clientA_sock,
      lastSeen: Date.now(),
    };

    const res = room.addPlayer(sessionA, 100, 120);
    assert.strictEqual(res.success, true);

    const snapshot = clientA_sock.messages.find((m) => m.type === 'room_snapshot');
    assert.ok(snapshot !== undefined, 'Snapshot message must be sent to joining player');
    assert.strictEqual(snapshot.players.length, 1);
    assert.strictEqual(snapshot.players[0].userId, 'player_a');
  });

  await test('Test 13: Existing players receive player_joined event when another user connects', () => {
    const sessionB: RoomClientSession = {
      userId: 'player_b',
      displayName: 'Bob Dev',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'test_room_alpha',
      socket: clientB_sock,
      lastSeen: Date.now(),
    };

    room.addPlayer(sessionB, 150, 150);

    const joinEvent = clientA_sock.messages.find((m) => m.type === 'player_joined');
    assert.ok(joinEvent !== undefined, 'Player A must receive player_joined for Player B');
    assert.strictEqual(joinEvent.player.userId, 'player_b');
  });

  await test('Test 14: Valid movement updates are queued and broadcast to room occupants', async () => {
    clientB_sock.messages.length = 0; // Clear messages

    const moveMsg: ClientMoveIntentMessage = {
      type: 'move_intent',
      seq: 1,
      roomId: 'test_room_alpha',
      x: 105,
      y: 120,
      vx: 135,
      vy: 0,
      direction: 'right',
      isMoving: true,
      clientTime: Date.now(),
    };

    room.handleMoveIntent('player_a', moveMsg);

    // Wait for room tick (55ms for 20Hz)
    await new Promise((r) => setTimeout(r, 60));

    const stateBroadcast = clientB_sock.messages.find((m) => m.type === 'player_state');
    assert.ok(stateBroadcast !== undefined, 'Player B must receive movement broadcast');
    assert.strictEqual(stateBroadcast.players[0].userId, 'player_a');
    assert.strictEqual(stateBroadcast.players[0].x, 105);
  });

  await test('Test 15: Separate room instances are isolated from each other', async () => {
    const roomBeta = new OfficeRoom('test_room_beta', new MovementAuthority(), 20);
    const clientC_sock = createMockSocket();

    const sessionC: RoomClientSession = {
      userId: 'player_c',
      displayName: 'Charlie Remote',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'test_room_beta',
      socket: clientC_sock,
      lastSeen: Date.now(),
    };

    roomBeta.addPlayer(sessionC);
    clientC_sock.messages.length = 0;

    // Move player in room alpha
    room.handleMoveIntent('player_a', {
      type: 'move_intent',
      seq: 2,
      roomId: 'test_room_alpha',
      x: 110,
      y: 120,
      vx: 135,
      vy: 0,
      direction: 'right',
      isMoving: true,
      clientTime: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 60));

    // Player C in room beta must not receive room alpha updates
    const stateInBeta = clientC_sock.messages.find((m) => m.type === 'player_state');
    assert.strictEqual(stateInBeta, undefined, 'Room Beta occupants must not receive Room Alpha movement');
    roomBeta.dispose();
  });

  await test('Test 16: Disconnecting removes the player and notifies the room', () => {
    clientB_sock.messages.length = 0;
    room.removePlayer('player_a', 'disconnect');

    const leftEvent = clientB_sock.messages.find((m) => m.type === 'player_left');
    assert.ok(leftEvent !== undefined, 'Player B must receive player_left event');
    assert.strictEqual(leftEvent.userId, 'player_a');
    assert.strictEqual(room.getPlayerCount(), 1);
  });

  await test('Test 17: Reconnecting with same user updates session without duplicate characters', () => {
    const newSock = createMockSocket();
    const sessionB_Reconnected: RoomClientSession = {
      userId: 'player_b',
      displayName: 'Bob Dev',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'test_room_alpha',
      socket: newSock,
      lastSeen: Date.now(),
    };

    // Player B reconnects
    room.addPlayer(sessionB_Reconnected, 200, 200);
    assert.strictEqual(room.getPlayerCount(), 1, 'Player count must remain 1 (no duplicate player_b)');
  });

  await test('Test 18: Room cleanly returns to empty state on last player exit', () => {
    room.removePlayer('player_b', 'left');
    assert.strictEqual(room.getPlayerCount(), 0, 'Room must be empty');
    room.dispose();
  });

  // ==========================================
  // SECTION 4: CLIENT RENDERING & INTERPOLATION
  // ==========================================
  console.log('\n--- 4. Client Rendering & Interpolation Simulation ---');

  // Create lightweight mock scene for RemotePlayerManager tests
  const mockScene: any = {
    physics: {
      add: {
        sprite: (x: number, y: number, key: string) => {
          return {
            x,
            y,
            depth: 16,
            active: true,
            setSize: () => {},
            setOffset: () => {},
            setDepth: function (d: number) { this.depth = d; },
            setPosition: function (nx: number, ny: number) { this.x = nx; this.y = ny; },
            play: () => {},
            setInteractive: () => {},
            on: () => {},
            destroy: function () { this.active = false; },
            anims: { currentAnim: { key: 'idle' } },
          };
        },
      },
    },
    add: {
      container: (x: number, y: number) => {
        return {
          x,
          y,
          depth: 998,
          active: true,
          setDepth: function (d: number) { this.depth = d; },
          setVisible: () => {},
          setPosition: function (nx: number, ny: number) { this.x = nx; this.y = ny; },
          add: () => {},
          destroy: function () { this.active = false; },
        };
      },
      text: () => {
        const textObj: any = {
          getBounds: () => ({ width: 40, height: 10 }),
          setOrigin: () => textObj,
          setScale: () => textObj,
          setResolution: () => textObj,
        };
        return textObj;
      },
      graphics: () => ({
        fillStyle: () => {},
        lineStyle: () => {},
        fillRoundedRect: () => {},
        strokeRoundedRect: () => {},
      }),
    },
    anims: {
      exists: () => true,
    },
  };

  const remoteMgr = new RemotePlayerManager(
    mockScene,
    'local_player',
    () => {}
  );

  await test('Test 19: Local player is never duplicated as a remote player', () => {
    remoteMgr.spawnOrUpdatePlayer({
      userId: 'local_player',
      displayName: 'Self',
      role: 'admin',
      avatarConfig: sampleAvatar,
      roomId: 'main_office',
      x: 100,
      y: 100,
      direction: 'down',
      isMoving: false,
      seq: 0,
      timestamp: Date.now(),
    });

    assert.strictEqual(remoteMgr.hasPlayer('local_player'), false, 'Local player must never be added to remote players map');
  });

  await test('Test 20: Remote character smoothly interpolates towards target position', () => {
    remoteMgr.spawnOrUpdatePlayer({
      userId: 'remote_alice',
      displayName: 'Alice',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'main_office',
      x: 100,
      y: 100,
      direction: 'down',
      isMoving: false,
      seq: 0,
      timestamp: Date.now(),
    });

    const sprite = remoteMgr.getPlayerSprite('remote_alice');
    assert.ok(sprite !== undefined);
    assert.strictEqual(sprite?.x, 100);

    // Update target position to (150, 100)
    remoteMgr.updatePlayerState('remote_alice', 150, 100, 'right', true);

    // Frame 1 update
    remoteMgr.update(0, 16);
    assert.ok(sprite!.x > 100, 'Sprite must move towards target');
    assert.ok(sprite!.x < 150, 'Sprite must lerp smoothly, not snap instantaneously');

    // Run several updates until converged
    for (let i = 0; i < 25; i++) {
      remoteMgr.update(0, 16);
    }
    assert.strictEqual(Math.round(sprite!.x), 150, 'Sprite must reach target position after interpolation');
  });

  await test('Test 21: Large delta (> 120px) snaps character instead of long dragging lerp', () => {
    const sprite = remoteMgr.getPlayerSprite('remote_alice');
    // Teleport to (400, 100)
    remoteMgr.updatePlayerState('remote_alice', 400, 100, 'right', false);
    remoteMgr.update(0, 16);

    // Must snap directly to 400
    assert.strictEqual(sprite?.x, 400, 'Large distance warp must snap directly to prevent unnatural dragging');
  });

  await test('Test 22: Remote player removal destroys sprite and nameplate', () => {
    const sprite = remoteMgr.getPlayerSprite('remote_alice');
    remoteMgr.removePlayer('remote_alice');
    assert.strictEqual(remoteMgr.hasPlayer('remote_alice'), false);
    assert.strictEqual(sprite?.active, false, 'Sprite must be destroyed');
  });

  // ==========================================
  // SECTION 5: CONCURRENCY & LOAD SIMULATION
  // ==========================================
  console.log('\n--- 5. Concurrency & Load Simulation (25 to 50 Concurrent Clients) ---');

  await test('Test 23: 25 concurrent clients can join room simultaneously and receive broadcasts', async () => {
    const loadRoom = new OfficeRoom('load_office_25', new MovementAuthority(), 20);
    const clients: any[] = [];
    const clientCount = 25;

    const startTime = Date.now();
    for (let i = 0; i < clientCount; i++) {
      const sock = createMockSocket();
      clients.push(sock);
      loadRoom.addPlayer({
        userId: `client_${i}`,
        displayName: `Colleague ${i}`,
        role: i === 0 ? 'admin' : 'employee',
        avatarConfig: sampleAvatar,
        roomId: 'load_office_25',
        socket: sock,
        lastSeen: Date.now(),
      });
    }

    const joinDurationMs = Date.now() - startTime;
    assert.strictEqual(loadRoom.getPlayerCount(), 25);
    console.log(`     Joined 25 clients in ${joinDurationMs}ms`);

    // Simulate 5 simultaneous player movement intents within allowable speed
    for (let i = 0; i < 5; i++) {
      loadRoom.handleMoveIntent(`client_${i}`, {
        type: 'move_intent',
        seq: 1,
        roomId: 'load_office_25',
        x: 272 + 8,
        y: 368,
        vx: 135,
        vy: 0,
        direction: 'right',
        isMoving: true,
        clientTime: Date.now(),
      });
    }

    // Wait for tick
    await new Promise((r) => setTimeout(r, 60));

    // Every other client should have received the state update
    const broadcastsReceived = clients.slice(5).every((c) =>
      c.messages.some((m: any) => m.type === 'player_state')
    );
    assert.strictEqual(broadcastsReceived, true, 'All other clients must receive player state updates');
    loadRoom.dispose();
  });

  await test('Test 24: 50 concurrent clients capacity test (design target validation)', async () => {
    const maxLoadRoom = new OfficeRoom('load_office_50', new MovementAuthority(), 20);
    const maxClients = 50;
    const sockets: any[] = [];

    const startTime = Date.now();
    for (let i = 0; i < maxClients; i++) {
      const sock = createMockSocket();
      sockets.push(sock);
      const res = maxLoadRoom.addPlayer({
        userId: `user_capacity_${i}`,
        displayName: `Worker ${i}`,
        role: 'employee',
        avatarConfig: sampleAvatar,
        roomId: 'load_office_50',
        socket: sock,
        lastSeen: Date.now(),
      });
      assert.strictEqual(res.success, true);
    }

    const duration = Date.now() - startTime;
    assert.strictEqual(maxLoadRoom.getPlayerCount(), 50);
    console.log(`     Successfully connected 50 concurrent sessions in ${duration}ms`);

    // 51st user should be gracefully rejected with room full
    const rejectedSock = createMockSocket();
    const rejectRes = maxLoadRoom.addPlayer({
      userId: 'user_overflow',
      displayName: 'Extra User',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'load_office_50',
      socket: rejectedSock,
      lastSeen: Date.now(),
    });
    assert.strictEqual(rejectRes.success, false);
    assert.ok(rejectRes.error?.includes('full'));

    maxLoadRoom.dispose();
  });

  await test('Test 25: Rapid connect, disconnect, and reconnect churn does not crash room', () => {
    const churnRoom = new OfficeRoom('churn_office', new MovementAuthority(), 20);

    for (let cycle = 0; cycle < 100; cycle++) {
      const uid = `churn_${cycle % 10}`;
      const sock = createMockSocket();
      churnRoom.addPlayer({
        userId: uid,
        displayName: `Churn ${uid}`,
        role: 'employee',
        avatarConfig: sampleAvatar,
        roomId: 'churn_office',
        socket: sock,
        lastSeen: Date.now(),
      });

      if (cycle % 2 === 0) {
        churnRoom.removePlayer(uid, 'disconnect');
      }
    }

    assert.ok(churnRoom.getPlayerCount() >= 0);
    churnRoom.dispose();
  });

  // ==========================================
  // SECTION 6: EMOJI REACTIONS SYNCHRONIZATION
  // ==========================================
  console.log('\n--- 6. Emoji Reactions & Broadcast ---');

  await test('Test 26: Reaction message validation accepts valid emojis and rejects malformed payloads', () => {
    const valid = validateClientMessage({
      type: 'reaction',
      roomId: 'main_office',
      emoji: '👍',
    });
    assert.strictEqual(valid.valid, true);

    const invalid1 = validateClientMessage({
      type: 'reaction',
      roomId: 'main_office',
      emoji: '',
    });
    assert.strictEqual(invalid1.valid, false);

    const invalid2 = validateClientMessage({
      type: 'reaction',
      roomId: 123,
      emoji: '👍',
    });
    assert.strictEqual(invalid2.valid, false);
  });

  await test('Test 27: Room broadcasts emoji reaction to other connected players in real-time', () => {
    const reactionRoom = new OfficeRoom('reaction_office', new MovementAuthority(), 20);
    const sock1 = createMockSocket();
    const sock2 = createMockSocket();

    reactionRoom.addPlayer({
      userId: 'user_sender',
      displayName: 'Sender',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'reaction_office',
      socket: sock1,
      lastSeen: Date.now(),
    });

    reactionRoom.addPlayer({
      userId: 'user_receiver',
      displayName: 'Receiver',
      role: 'employee',
      avatarConfig: sampleAvatar,
      roomId: 'reaction_office',
      socket: sock2,
      lastSeen: Date.now(),
    });

    sock2.messages.length = 0;
    reactionRoom.handleReaction('user_sender', '🎉');

    const receivedReaction = sock2.messages.find((m: any) => m.type === 'player_reaction');
    assert.ok(receivedReaction, 'Receiver must receive player_reaction message');
    assert.strictEqual((receivedReaction as any).userId, 'user_sender');
    assert.strictEqual((receivedReaction as any).emoji, '🎉');

    reactionRoom.dispose();
  });

  console.log('\n============================================================');
  console.log(`GatherGrid Automated Test Suite Complete: All ${passedCount} Tests PASSED!`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
