/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor command + history test suite — undo/redo purity, command inversion,
 * snapshot round-trips and depth capping for the Studio edit pipeline.
 */

import assert from 'node:assert';
import {
  createMap,
  createMaskGrid,
  createTileGrid,
  createTileLayer,
  getCollisionLayer,
  getTileLayers,
  resizeMap,
} from '../src/game/maps/mapSchema';
import {
  EditCommand,
  EditHistory,
  applyCommand,
  buildCollisionChanges,
  buildTileChanges,
  captureResizeSnapshot,
  invertCommand,
  restoreResizeSnapshot,
  syncPrimarySpawn,
} from '../src/game/edits';
import { InteractionZone, MapObject, MapSpawnPoint } from '../src/types/game';

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

function makeMap() {
  const map = createMap({ id: 'edit_map', name: 'Edit Map', width: 8, height: 6 });
  const ground = getTileLayers(map).find((l) => l.depthMode === 'ground')!;
  const collision = getCollisionLayer(map)!;
  return { map, ground, collision };
}

async function runTests() {
  console.log('------------------------------------------------------------');
  console.log('GatherGrid Studio Editor — Commands, Snapshots & History');
  console.log('------------------------------------------------------------');

  await test('Test 1: Command builders skip no-op cells and capture previous values', () => {
    const grid = createTileGrid(4, 4, -1);
    grid[1][1] = 2;
    const changes = buildTileChanges(grid, [
      { x: 1, y: 1, tileId: 2 }, // no-op
      { x: 2, y: 2, tileId: 3 }, // change
      { x: 0, y: 0, tileId: -1 }, // no-op (empty → empty)
    ]);
    assert.strictEqual(changes.length, 1);
    assert.deepStrictEqual(changes[0], { x: 2, y: 2, prev: -1, next: 3 });

    const mask = createMaskGrid(4, 4, false);
    mask[1][1] = true;
    const collisionChanges = buildCollisionChanges(mask, [
      { x: 1, y: 1, solid: true }, // no-op
      { x: 2, y: 2, solid: true }, // change
    ]);
    assert.strictEqual(collisionChanges.length, 1);
    assert.deepStrictEqual(collisionChanges[0], { x: 2, y: 2, prev: false, next: true });
  });

  await test('Test 2: applyCommand and invertCommand round-trip tile and collision edits', () => {
    const { map, ground } = makeMap();

    const tileCmd: EditCommand = {
      kind: 'tiles',
      layerId: ground.id,
      changes: buildTileChanges(ground.tiles!, [{ x: 3, y: 2, tileId: 4 }]),
    };
    applyCommand(map, tileCmd);
    assert.strictEqual(getTileLayers(map).find((l) => l.id === ground.id)!.tiles![2][3], 4);
    applyCommand(map, invertCommand(tileCmd));
    assert.strictEqual(getTileLayers(map).find((l) => l.id === ground.id)!.tiles![2][3], -1);

    const collisionCmd: EditCommand = {
      kind: 'collision',
      changes: buildCollisionChanges(getCollisionLayer(map)!.mask!, [{ x: 2, y: 2, solid: true }]),
    };
    applyCommand(map, collisionCmd);
    assert.strictEqual(getCollisionLayer(map)!.mask![2][2], true);
    applyCommand(map, invertCommand(collisionCmd));
    assert.strictEqual(getCollisionLayer(map)!.mask![2][2], false);
  });

  await test('Test 3: Object, zone and spawn commands apply and revert cleanly', () => {
    const { map } = makeMap();

    const desk: MapObject = {
      id: 'obj_a',
      name: 'Desk',
      type: 'desk_single',
      tileX: 1,
      tileY: 1,
      width: 1,
      height: 1,
      isSolid: true,
    };
    applyCommand(map, { kind: 'object.add', object: desk });
    assert.ok(map.objects.some((o) => o.id === 'obj_a'));
    const moveDesk: EditCommand = { kind: 'object.update', id: 'obj_a', prev: { tileX: 1 }, next: { tileX: 5 } };
    applyCommand(map, moveDesk);
    assert.strictEqual(map.objects.find((o) => o.id === 'obj_a')!.tileX, 5);
    applyCommand(map, invertCommand(moveDesk));
    assert.strictEqual(map.objects.find((o) => o.id === 'obj_a')!.tileX, 1);
    applyCommand(map, { kind: 'object.remove', object: desk });
    assert.ok(!map.objects.some((o) => o.id === 'obj_a'));

    const zone: InteractionZone = {
      id: 'zone_a',
      name: 'Coffee',
      type: 'coffee',
      tileX: 2,
      tileY: 2,
      width: 2,
      height: 2,
      prompt: 'Sip',
    };
    applyCommand(map, { kind: 'zone.add', zone });
    assert.ok(map.interactionZones.some((z) => z.id === 'zone_a'));
    const renameZone: EditCommand = { kind: 'zone.update', id: 'zone_a', prev: { prompt: 'Sip' }, next: { prompt: 'Drink' } };
    applyCommand(map, renameZone);
    assert.strictEqual(map.interactionZones.find((z) => z.id === 'zone_a')!.prompt, 'Drink');
    applyCommand(map, invertCommand(renameZone));
    assert.strictEqual(map.interactionZones.find((z) => z.id === 'zone_a')!.prompt, 'Sip');
    applyCommand(map, { kind: 'zone.remove', zone });
    assert.ok(!map.interactionZones.some((z) => z.id === 'zone_a'));

    // Spawn commands keep the primary spawn mirrored to the first entry.
    map.spawnPoints = [
      { id: 'spawn_default', name: 'Main Spawn', tileX: 1, tileY: 1, direction: 'down' },
    ];
    syncPrimarySpawn(map);
    const lobby: MapSpawnPoint = { id: 'spawn_lobby', name: 'Lobby', tileX: 4, tileY: 4, direction: 'up' };
    applyCommand(map, { kind: 'spawn.add', spawn: lobby });
    applyCommand(map, {
      kind: 'spawn.update',
      id: 'spawn_lobby',
      prev: { tileX: 4 },
      next: { tileX: 5 },
    });
    assert.strictEqual(map.spawnPoints!.find((s) => s.id === 'spawn_lobby')!.tileX, 5);
    assert.strictEqual(map.spawnPoint.tileX, 1, 'Primary spawn stays the first spawn point');
    applyCommand(map, { kind: 'spawn.remove', spawn: { ...lobby, tileX: 5 } });
    assert.strictEqual(map.spawnPoints!.length, 1);
  });

  await test('Test 4: EditHistory undo/redo returns pure command data with dirty tracking', () => {
    const { map, ground } = makeMap();
    const history = new EditHistory();
    assert.strictEqual(history.canUndo, false);
    assert.strictEqual(history.undo(), null);
    assert.strictEqual(history.redo(), null);

    const cmdA: EditCommand = {
      kind: 'tiles',
      layerId: ground.id,
      changes: [{ x: 1, y: 1, prev: -1, next: 2 }],
    };
    applyCommand(map, cmdA);
    history.push([cmdA], 'Paint floor');
    assert.strictEqual(history.canUndo, true);
    assert.strictEqual(history.undoLabel, 'Paint floor');
    assert.strictEqual(history.isDirty, true);

    const undoCommands = history.undo();
    assert.ok(undoCommands && undoCommands.length === 1, 'Undo returns the inverted command list');
    assert.strictEqual(
      getTileLayers(map).find((l) => l.id === ground.id)!.tiles![1][1],
      2,
      'undo() itself must not mutate the map — the caller applies commands'
    );
    for (const c of undoCommands!) applyCommand(map, c);
    assert.strictEqual(getTileLayers(map).find((l) => l.id === ground.id)!.tiles![1][1], -1);

    assert.strictEqual(history.canRedo, true);
    const redoCommands = history.redo();
    assert.ok(redoCommands && redoCommands.length === 1);
    for (const c of redoCommands!) applyCommand(map, c);
    assert.strictEqual(getTileLayers(map).find((l) => l.id === ground.id)!.tiles![1][1], 2);

    history.markSaved();
    assert.strictEqual(history.isDirty, false, 'Saving clears the dirty flag');
    history.undo();
    assert.strictEqual(history.isDirty, true, 'Undoing past the save point is dirty again');
    history.redo();

    // A new push clears the redo tail.
    history.undo();
    const cmdB: EditCommand = {
      kind: 'tiles',
      layerId: ground.id,
      changes: [{ x: 2, y: 2, prev: -1, next: 3 }],
    };
    applyCommand(map, cmdB);
    history.push([cmdB], 'Paint again');
    assert.strictEqual(history.canRedo, false, 'New edits drop the redo tail');
    assert.strictEqual(history.undoLabel, 'Paint again');
  });

  await test('Test 5: EditHistory caps depth at maxDepth and drops the oldest entries', () => {
    const { map, ground } = makeMap();
    void map;
    const history = new EditHistory();
    for (let i = 0; i < 100; i++) {
      history.push(
        [{ kind: 'tiles', layerId: ground.id, changes: [{ x: 0, y: 0, prev: i, next: i + 1 }] }],
        `Edit ${i}`
      );
    }
    assert.strictEqual(history.depth, 80, 'History depth is capped');
    let undos = 0;
    while (history.undo()) undos++;
    assert.strictEqual(undos, 80, 'Exactly maxDepth entries can be undone');
    assert.strictEqual(history.canUndo, false);
  });

  await test('Test 6: captureResizeSnapshot / restoreResizeSnapshot round-trip full map state', () => {
    const { map, ground } = makeMap();
    ground.tiles![2][2] = 5;
    map.objects.push({
      id: 'obj_snap',
      type: 'plant_monstera',
      tileX: 1,
      tileY: 1,
      width: 1,
      height: 1,
      isSolid: true,
    });
    map.interactionZones.push({
      id: 'zone_snap',
      name: 'Z',
      type: 'coffee',
      tileX: 2,
      tileY: 2,
      width: 1,
      height: 1,
      prompt: 'p',
    });

    const snapshot = captureResizeSnapshot(map);
    const original = JSON.stringify({
      width: map.width,
      height: map.height,
      layers: map.layers,
      objects: map.objects,
      zones: map.interactionZones,
      spawns: map.spawnPoints,
      spawnPoint: map.spawnPoint,
    });

    map.width = 3;
    map.height = 3;
    map.layers = [];
    map.objects = [];
    map.interactionZones = [];
    map.spawnPoints = [];
    map.spawnPoint = { tileX: 0, tileY: 0, direction: 'down' };

    restoreResizeSnapshot(map, snapshot);
    const restored = JSON.stringify({
      width: map.width,
      height: map.height,
      layers: map.layers,
      objects: map.objects,
      zones: map.interactionZones,
      spawns: map.spawnPoints,
      spawnPoint: map.spawnPoint,
    });
    assert.strictEqual(restored, original, 'Restoring a snapshot reproduces the exact map state');
  });

  await test('Test 7: map.meta and map.resize commands invert through command data alone', () => {
    const { map } = makeMap();

    const metaCmd: EditCommand = {
      kind: 'map.meta',
      prev: { name: 'Edit Map', tileSize: 32 },
      next: { name: 'Renamed Map', tileSize: 48 },
    };
    applyCommand(map, metaCmd);
    assert.strictEqual(map.name, 'Renamed Map');
    assert.strictEqual(map.tileSize, 48);
    applyCommand(map, invertCommand(metaCmd));
    assert.strictEqual(map.name, 'Edit Map');
    assert.strictEqual(map.tileSize, 32);

    const before = captureResizeSnapshot(map);
    const grown = resizeMap(map, before.width + 4, before.height + 2);
    const resizeCmd: EditCommand = {
      kind: 'map.resize',
      prev: before,
      next: captureResizeSnapshot(grown.map),
    };
    applyCommand(map, resizeCmd);
    assert.strictEqual(map.width, before.width + 4);
    assert.strictEqual(map.height, before.height + 2);
    applyCommand(map, invertCommand(resizeCmd));
    assert.strictEqual(map.width, before.width);
    assert.strictEqual(map.height, before.height);
    assert.deepStrictEqual(map.layers, before.layers, 'Inverted resize restores layer grids');
  });

  await test('Test 8: layer and tileset commands keep the map consistent', () => {
    const { map, ground } = makeMap();

    const extraLayer = createTileLayer('Foreground', map.width, map.height, 'row');
    applyCommand(map, { kind: 'layer.add', layer: extraLayer });
    assert.ok(map.layers!.some((l) => l.id === extraLayer.id));
    applyCommand(map, { kind: 'layer.remove', layer: extraLayer });
    assert.ok(!map.layers!.some((l) => l.id === extraLayer.id));

    const toggle: EditCommand = {
      kind: 'layer.update',
      id: ground.id,
      prev: { visible: true },
      next: { visible: false },
    };
    applyCommand(map, toggle);
    assert.strictEqual(map.layers!.find((l) => l.id === ground.id)!.visible, false);
    applyCommand(map, invertCommand(toggle));
    assert.strictEqual(map.layers!.find((l) => l.id === ground.id)!.visible, true);

    const tileset = {
      id: 'ts_unit',
      name: 'Unit Tileset',
      source: 'asset' as const,
      assetId: 'asset_unit',
      tileSize: 48,
      columns: 16,
      rows: 16,
      firstTileId: 0,
      tileCount: 256,
    };
    applyCommand(map, { kind: 'tileset.add', tileset });
    const added = map.tilesets!.find((t) => t.id === 'ts_unit');
    assert.ok(added, 'Tileset reference added');
    assert.ok(added!.firstTileId >= 1000, 'Imported tilesets are assigned ids above the builtin range');
    applyCommand(map, { kind: 'tileset.remove', tileset: added! });
    assert.ok(!map.tilesets!.some((t) => t.id === 'ts_unit'));
  });

  console.log('\n============================================================');
  if (failedCount > 0) {
    console.error(`GatherGrid Editor Suite: ${failedCount} test(s) FAILED (${passedCount} passed).`);
    console.error('============================================================\n');
    process.exit(1);
  }
  console.log(`GatherGrid Editor Suite Complete: All ${passedCount} Tests PASSED!`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
