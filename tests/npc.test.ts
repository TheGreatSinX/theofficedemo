/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NPC system test suite — patrol math, route building and the default cast.
 */

import assert from 'node:assert';
// Only the pure modules are imported here: the manager pulls in Phaser, which
// needs a browser environment.
import { NPC_CATALOG, npcsForMap } from '../src/game/npc/npcCatalog';
import {
  buildRoute,
  directionFromDelta,
  nextLine,
  nextWaypointIndex,
  stepToward,
} from '../src/game/npc/npcPathing';
import { NPC_DEFAULT_SPEED, NPC_TALK_RADIUS_TILES } from '../src/game/npc/npcTypes';

let passedCount = 0;
let failedCount = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passedCount++;
    console.log(`\u2714 [PASS] ${name}`);
  } catch (err) {
    failedCount++;
    console.error(`\u2718 [FAIL] ${name}`);
    console.error(err instanceof Error ? err.stack || err.message : err);
  }
}

async function runTests() {
  console.log('------------------------------------------------------------');
  console.log('GatherGrid NPC Suite — Patrol Routes, Cast & Interaction');
  console.log('------------------------------------------------------------');

  await test('Test 1: Facing direction follows the dominant movement axis', () => {
    assert.strictEqual(directionFromDelta(10, 0), 'right');
    assert.strictEqual(directionFromDelta(-10, 0), 'left');
    assert.strictEqual(directionFromDelta(0, 10), 'down');
    assert.strictEqual(directionFromDelta(0, -10), 'up');
    // A diagonal keeps the dominant axis so sprites never walk diagonally.
    assert.strictEqual(directionFromDelta(10, 4), 'right');
    assert.strictEqual(directionFromDelta(-4, 10), 'down');
    // No movement keeps the previous facing.
    assert.strictEqual(directionFromDelta(0, 0, 'left'), 'left');
    assert.strictEqual(directionFromDelta(Number.NaN, 0, 'up'), 'up');
  });

  await test('Test 2: Patrol routes loop and steps never overshoot', () => {
    assert.strictEqual(nextWaypointIndex(0, 3), 1);
    assert.strictEqual(nextWaypointIndex(2, 3), 0);
    assert.strictEqual(nextWaypointIndex(0, 0), 0);

    const step = stepToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 1000);
    assert.strictEqual(step.x, 60);
    assert.strictEqual(step.y, 0);
    assert.strictEqual(step.arrived, false);

    const arrive = stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 60, 1000);
    assert.strictEqual(arrive.x, 10);
    assert.strictEqual(arrive.arrived, true);

    const idle = stepToward({ x: 5, y: 5 }, { x: 5, y: 5 }, 60, 16);
    assert.strictEqual(idle.arrived, true);
  });

  await test('Test 3: Routes start at the spawn tile and drop duplicates', () => {
    const route = buildRoute({ x: 3, y: 4 }, [{ x: 3, y: 4 }, { x: 9, y: 4 }]);
    assert.strictEqual(route.length, 2);
    assert.deepStrictEqual(route[0], { x: 3, y: 4 });
    assert.deepStrictEqual(route[1], { x: 9, y: 4, pauseMs: undefined });

    assert.deepStrictEqual(buildRoute({ x: 1, y: 1 }, []), []);
  });

  await test('Test 4: Dialogue lines cycle through the list', () => {
    const first = nextLine(['a', 'b'], 0);
    assert.strictEqual(first.line, 'a');
    assert.strictEqual(first.index, 1);

    const second = nextLine(['a', 'b'], 1);
    assert.strictEqual(second.line, 'b');
    assert.strictEqual(second.index, 0);

    const empty = nextLine([], 0);
    assert.strictEqual(empty.line, null);
  });

  await test('Test 5: The default cast is valid and map-scoped', () => {
    assert.ok(NPC_CATALOG.length > 0, 'The catalog must not be empty');

    const ids = new Set<string>();
    for (const npc of NPC_CATALOG) {
      assert.ok(!ids.has(npc.id), `Duplicate NPC id: ${npc.id}`);
      ids.add(npc.id);
      assert.ok(npc.name.length > 0, 'NPC needs a name');
      assert.ok(npc.mapId.length > 0, 'NPC needs a map');
      assert.ok(Number.isFinite(npc.x) && Number.isFinite(npc.y), 'NPC needs a spawn tile');
      assert.ok(npc.sheet.kind === 'preset' || npc.sheet.kind === 'asset' || npc.sheet.kind === 'procedural');
      if (npc.sheet.kind === 'preset') {
        assert.ok(npc.sheet.id.length > 0, 'Preset NPCs need a preset id');
      }
      if (npc.waypoints && npc.waypoints.length > 0) {
        assert.ok(npc.speed === undefined || npc.speed > 0, 'NPC speed must be positive');
      }
    }

    const mainOffice = npcsForMap('main_office');
    assert.ok(mainOffice.length >= 2, 'The main office needs ambient NPCs');
    assert.strictEqual(npcsForMap('does_not_exist').length, 0);
    assert.ok(NPC_DEFAULT_SPEED > 0);
    assert.ok(NPC_TALK_RADIUS_TILES > 0);
  });

  console.log('\n============================================================');
  if (failedCount > 0) {
    console.error(`GatherGrid NPC Suite: ${failedCount} test(s) FAILED (${passedCount} passed).`);
    console.error('============================================================\n');
    process.exit(1);
  }
  console.log(`GatherGrid NPC Suite Complete: All ${passedCount} Tests PASSED!`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
