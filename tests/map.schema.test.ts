/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Map schema test suite — v1→v2 migration, storage serialization round-trips,
 * map creation defaults, resizing, mask transport (RLE/raw), spawn lookup,
 * validated transitions and derived connections.
 */

import assert from 'node:assert';
import {
  BUILTIN_TILESET_ID,
  DEFAULT_SPAWN_ID,
  MAX_MAP_DIMENSION,
  collectUnresolvedTileIds,
  computeMaskHash,
  createMap,
  createMaskGrid,
  decodeMaskFromTransport,
  encodeMaskForTransport,
  findSpawn,
  findTilesetForTile,
  getCollisionMask,
  getDefaultSpawn,
  getMapConnections,
  getTileLayers,
  isBuiltinTileId,
  migrateMapData,
  resizeMap,
  serializeMapForStorage,
  validateMapData,
  validateTransition,
} from '../src/game/maps/mapSchema';
import { OFFICE_MAP_IDS, OFFICE_MAPS } from '../src/game/maps/officeMaps';
import { InteractionZone, MAP_SCHEMA_VERSION, MapObject } from '../src/types/game';

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
  console.log('GatherGrid Map Schema v2 — Migration, Resize & Mask Transport');
  console.log('------------------------------------------------------------');

  await test('Test 1: Legacy v1 factory maps migrate to schema v2 without losing tiles or collision', () => {
    assert.ok(OFFICE_MAP_IDS.length >= 3, 'Factory catalog should expose at least three maps');

    for (const mapId of OFFICE_MAP_IDS) {
      const legacy = OFFICE_MAPS[mapId]();
      assert.ok(legacy, `Factory map "${mapId}" must exist`);
      assert.strictEqual(legacy.schemaVersion, 1, 'Raw factory maps are schema v1');

      const { map, report } = migrateMapData(JSON.parse(JSON.stringify(legacy)));
      assert.strictEqual(map.schemaVersion, MAP_SCHEMA_VERSION);
      assert.strictEqual(report.fromVersion, 1);
      assert.strictEqual(report.toVersion, MAP_SCHEMA_VERSION);
      assert.ok(report.notes.length >= 1, 'Migration should report what it changed');
      assert.ok(Array.isArray(map.layers) && map.layers.length >= 3, 'Migrated map must have layers');

      const ground = getTileLayers(map).find((l) => l.depthMode === 'ground');
      const walls = getTileLayers(map).find((l) => l.depthMode === 'row');
      assert.ok(ground && ground.tiles, 'Ground layer exists');
      assert.strictEqual(ground!.tiles!.length, map.height);
      assert.strictEqual(ground!.tiles![0].length, map.width);

      const floorTiles = legacy.floorTiles || [];
      for (let y = 0; y < Math.min(map.height, floorTiles.length); y++) {
        for (let x = 0; x < Math.min(map.width, floorTiles[y].length); x++) {
          const v = floorTiles[y][x];
          if (typeof v === 'number' && v >= 0 && v <= 5) {
            assert.strictEqual(ground!.tiles![y][x], v, `floor tile lost at ${x},${y} in ${mapId}`);
          }
        }
      }

      const wallTiles = legacy.wallTiles || [];
      if (walls) {
        for (let y = 0; y < Math.min(map.height, wallTiles.length); y++) {
          for (let x = 0; x < Math.min(map.width, wallTiles[y].length); x++) {
            const v = wallTiles[y][x];
            if (typeof v === 'number' && v > 0) {
              assert.strictEqual(walls.tiles![y][x], v, `wall tile lost at ${x},${y} in ${mapId}`);
            }
          }
        }
      }

      const solidMask = legacy.solidMask || [];
      const mask = getCollisionMask(map);
      for (let y = 0; y < Math.min(map.height, solidMask.length); y++) {
        for (let x = 0; x < Math.min(map.width, solidMask[y].length); x++) {
          assert.strictEqual(mask[y][x], solidMask[y][x] === true, `collision lost at ${x},${y} in ${mapId}`);
        }
      }

      assert.ok(map.tilesets!.some((t) => t.id === BUILTIN_TILESET_ID), 'Builtin tileset reference present');
      assert.strictEqual(map.spawnPoints!.length, 1, 'Legacy spawn becomes a spawn point entry');
      assert.strictEqual(map.spawnPoints![0].id, DEFAULT_SPAWN_ID);
    }
  });

  await test('Test 2: serializeMapForStorage derives legacy grids and round-trips through migration', () => {
    const { map } = migrateMapData(JSON.parse(JSON.stringify(OFFICE_MAPS[OFFICE_MAP_IDS[0]]())));
    const stored = serializeMapForStorage(map);

    assert.strictEqual(stored.schemaVersion, MAP_SCHEMA_VERSION);
    assert.ok(Array.isArray(stored.floorTiles), 'floorTiles derived for storage');
    assert.strictEqual(stored.floorTiles!.length, map.height);
    assert.strictEqual(stored.floorTiles![0].length, map.width);
    assert.ok(Array.isArray(stored.wallTiles), 'wallTiles derived for storage');
    assert.ok(Array.isArray(stored.solidMask), 'solidMask derived for storage');

    const mask = getCollisionMask(map);
    assert.deepStrictEqual(stored.solidMask, mask, 'Derived solidMask matches the collision layer');

    const { map: again } = migrateMapData(JSON.parse(JSON.stringify(stored)));
    const groundA = getTileLayers(map).find((l) => l.depthMode === 'ground')!;
    const groundB = getTileLayers(again).find((l) => l.depthMode === 'ground')!;
    assert.deepStrictEqual(groundB.tiles, groundA.tiles, 'Tiles survive storage serialization');
    assert.deepStrictEqual(getCollisionMask(again), mask, 'Collision survives storage serialization');

    const validation = validateMapData(stored);
    assert.strictEqual(validation.valid, true, `Stored map must validate: ${validation.errors.join('; ')}`);
  });

  await test('Test 3: createMap produces valid v2 defaults and validateMapData rejects broken documents', () => {
    const map = createMap({
      id: 'unit_map',
      name: 'Unit Map',
      width: 12,
      height: 8,
      tileSize: 48,
      wallBorder: true,
      fillFloorTileId: 2,
    });

    assert.strictEqual(map.schemaVersion, MAP_SCHEMA_VERSION);
    assert.strictEqual(map.width, 12);
    assert.strictEqual(map.height, 8);
    assert.strictEqual(map.tileSize, 48);
    assert.strictEqual(map.layers!.length, 3);
    assert.ok(map.tilesets!.some((t) => t.source === 'builtin' && t.id === BUILTIN_TILESET_ID));

    const ground = getTileLayers(map).find((l) => l.depthMode === 'ground')!;
    assert.strictEqual(ground.tiles![3][5], 2, 'fillFloorTileId is applied to the floor layer');

    const mask = getCollisionMask(map);
    assert.strictEqual(mask[0][0], true, 'Top-left corner is a solid wall border');
    assert.strictEqual(mask[0][11], true);
    assert.strictEqual(mask[7][0], true);
    assert.strictEqual(mask[2][2], false, 'Interior tiles are walkable');

    assert.strictEqual(map.spawnPoint.tileX, 1, 'wallBorder maps spawn inside the border');
    assert.strictEqual(getDefaultSpawn(map).tileX, 1);

    const validation = validateMapData(map);
    assert.strictEqual(validation.valid, true, validation.errors.join('; '));

    assert.strictEqual(validateMapData({}).valid, false, 'Empty documents are invalid');
    assert.strictEqual(validateMapData(null).valid, false, 'Null documents are invalid');

    const clamped = createMap({ id: 'huge', name: 'Huge', width: MAX_MAP_DIMENSION + 500, height: 3 });
    assert.strictEqual(clamped.width, MAX_MAP_DIMENSION, 'Oversized dimensions clamp to the hard limit');
  });

  await test('Test 4: resizeMap preserves overlapping content and drops out-of-bounds entities', () => {
    const map = createMap({ id: 'resize_map', name: 'Resize', width: 12, height: 8 });
    const ground = getTileLayers(map).find((l) => l.depthMode === 'ground')!;
    ground.tiles![2][2] = 4;
    const desk: MapObject = {
      id: 'obj_a',
      name: 'Desk',
      type: 'desk_single',
      tileX: 10,
      tileY: 6,
      width: 1,
      height: 1,
      isSolid: true,
    };
    map.objects.push(desk);
    const zone: InteractionZone = {
      id: 'zone_a',
      name: 'Coffee',
      type: 'coffee',
      tileX: 3,
      tileY: 3,
      width: 1,
      height: 1,
      prompt: 'Sip',
    };
    map.interactionZones.push(zone);

    const grown = resizeMap(map, 16, 10);
    assert.strictEqual(grown.map.width, 16);
    assert.strictEqual(grown.map.height, 10);
    const grownGround = getTileLayers(grown.map).find((l) => l.depthMode === 'ground')!;
    assert.strictEqual(grownGround.tiles![2][2], 4, 'Existing tiles preserved while growing');
    assert.strictEqual(grownGround.tiles!.length, 10, 'Layer grids resized to the new height');
    assert.strictEqual(grown.map.objects.length, 1, 'In-bounds object kept');
    assert.strictEqual(grown.map.interactionZones.length, 1, 'In-bounds zone kept');

    const shrunk = resizeMap(grown.map, 6, 6);
    assert.strictEqual(shrunk.map.width, 6);
    assert.strictEqual(shrunk.droppedObjects, 1, 'Desk outside the new bounds is dropped');
    assert.strictEqual(shrunk.map.objects.length, 0);
    assert.strictEqual(shrunk.map.interactionZones.length, 1, 'Zone inside the new bounds kept');
    assert.strictEqual(
      getTileLayers(shrunk.map).find((l) => l.depthMode === 'ground')!.tiles![2][2],
      4,
      'Overlapping tiles survive shrinking'
    );
    assert.ok(shrunk.map.spawnPoints!.length >= 1, 'At least one spawn point remains after shrinking');
    assert.ok(shrunk.warnings.length > 0, 'Shrinking warns about dropped content');
  });

  await test('Test 5: Mask transport round-trips RLE and worst-case patterns, rejects malformed payloads', () => {
    const mask = createMaskGrid(24, 18, false);
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 24; x++) mask[y][x] = (x + y) % 7 === 0;
    }
    const encoded = encodeMaskForTransport(mask);
    assert.ok(/^(rle|raw):/.test(encoded), `Encoded mask must be prefixed, got: ${encoded.slice(0, 16)}`);

    const decoded = decodeMaskFromTransport(encoded, 24, 18);
    assert.ok(decoded, 'Encoded mask must decode');
    assert.deepStrictEqual(decoded, mask);

    // A checkerboard is the RLE worst case but must still round-trip.
    const checker = createMaskGrid(32, 32, false);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) checker[y][x] = (x + y) % 2 === 0;
    }
    assert.deepStrictEqual(decodeMaskFromTransport(encodeMaskForTransport(checker), 32, 32), checker);

    // Malformed payloads are rejected without throwing.
    assert.strictEqual(decodeMaskFromTransport('', 8, 8), null);
    assert.strictEqual(decodeMaskFromTransport('rle:not-valid-base64!!!', 8, 8), null);
    assert.strictEqual(decodeMaskFromTransport('@@invalid@@', 8, 8), null);
  });

  await test('Test 6: computeMaskHash is deterministic and sensitive to any cell change', () => {
    const mask = createMaskGrid(16, 12, false);
    mask[4][4] = true;

    const a = computeMaskHash(16, 12, mask);
    const b = computeMaskHash(16, 12, mask.map((row) => row.slice()));
    assert.strictEqual(a, b, 'Same mask hashes identically');
    assert.strictEqual(typeof a, 'string');

    const flipped = mask.map((row) => row.slice());
    flipped[4][4] = false;
    assert.notStrictEqual(computeMaskHash(16, 12, flipped), a, 'Changing one cell changes the hash');
    assert.notStrictEqual(computeMaskHash(17, 12, mask), a, 'Dimensions participate in the hash');
  });

  await test('Test 7: Spawn lookup and validateTransition enforce bounds and collision rules', () => {
    const mapB = createMap({ id: 'map_b', name: 'B', width: 12, height: 8 });
    mapB.spawnPoints = [
      { id: 'lobby', name: 'Lobby', tileX: 2, tileY: 3, direction: 'down' },
      { id: 'terrace', name: 'Terrace', tileX: 5, tileY: 5, direction: 'up' },
    ];
    mapB.spawnPoint = { tileX: 2, tileY: 3, direction: 'down' };

    assert.strictEqual(getDefaultSpawn(mapB).id, 'lobby');
    assert.strictEqual(findSpawn(mapB, 'terrace')?.tileY, 5);
    assert.strictEqual(findSpawn(mapB, undefined), undefined);

    const ok = validateTransition(mapB, { targetSpawnId: 'lobby' });
    assert.strictEqual(ok.ok, true);
    if (ok.ok) {
      assert.strictEqual(ok.spawn.tileX, 2);
      assert.strictEqual(ok.spawn.tileY, 3);
    }

    const missing = validateTransition(mapB, { targetSpawnId: 'nope' });
    assert.strictEqual(missing.ok, false, 'Unknown spawn ids are rejected');

    const oob = validateTransition(mapB, { spawnTileX: -1, spawnTileY: 0 });
    assert.strictEqual(oob.ok, false, 'Out-of-bounds destinations are rejected');

    const collisionLayer = mapB.layers!.find((l) => l.kind === 'collision')!;
    collisionLayer.mask![6][6] = true;
    const solid = validateTransition(mapB, { spawnTileX: 6, spawnTileY: 6 });
    assert.strictEqual(solid.ok, false, 'Destinations inside colliding tiles are rejected');
    if (!solid.ok) {
      assert.ok(
        solid.error.toLowerCase().includes('collid'),
        `Expected a collision error, got: ${solid.error}`
      );
    }
  });

  await test('Test 8: getMapConnections derives door edges; unresolved tile ids are reported', () => {
    const mapA = createMap({ id: 'map_a', name: 'A', width: 10, height: 8 });
    const door: InteractionZone = {
      id: 'zone_door',
      name: 'To B',
      type: 'door_warp',
      tileX: 9,
      tileY: 4,
      width: 1,
      height: 1,
      prompt: 'Enter',
      warpTarget: { mapId: 'map_b', spawnTileX: 2, spawnTileY: 3, targetSpawnId: 'lobby' },
    };
    const plain: InteractionZone = {
      id: 'zone_plain',
      name: 'Coffee',
      type: 'coffee',
      tileX: 1,
      tileY: 1,
      width: 1,
      height: 1,
      prompt: 'Sip',
    };
    mapA.interactionZones.push(door, plain);

    const connections = getMapConnections(mapA);
    assert.strictEqual(connections.length, 1, 'Only door zones produce connections');
    assert.strictEqual(connections[0].zoneId, 'zone_door');
    assert.strictEqual(connections[0].fromMapId, 'map_a');
    assert.strictEqual(connections[0].fromTileX, 9);
    assert.strictEqual(connections[0].targetMapId, 'map_b');
    assert.strictEqual(connections[0].targetSpawnId, 'lobby');
    assert.strictEqual(connections[0].targetTileX, 2);

    const ground = getTileLayers(mapA).find((l) => l.depthMode === 'ground')!;
    ground.tiles![1][1] = 50_000;
    const unresolved = collectUnresolvedTileIds(mapA);
    assert.ok(unresolved.includes(50_000), 'Imported id without a tileset must be flagged');
    assert.strictEqual(isBuiltinTileId(0), true);
    assert.ok(findTilesetForTile(mapA, 0), 'Builtin tile ids resolve to the builtin tileset');
    assert.strictEqual(findTilesetForTile(mapA, 50_000), undefined);
  });

  console.log('\n============================================================');
  if (failedCount > 0) {
    console.error(`GatherGrid Map Schema Suite: ${failedCount} test(s) FAILED (${passedCount} passed).`);
    console.error('============================================================\n');
    process.exit(1);
  }
  console.log(`GatherGrid Map Schema Suite Complete: All ${passedCount} Tests PASSED!`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
