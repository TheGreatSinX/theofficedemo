/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asset pipeline test suite — RPG Maker MZ sheet detection ($/! conventions,
 * A1–A5 families, B–E tilesets, character grids), frame math and file/image
 * validation limits.
 */

import assert from 'node:assert';
import { existsSync } from 'node:fs';
import {
  detectSheetLayout,
  getAutotileFamilyLabel,
  getCharacterFrames,
  getFrameCount,
  getFrameRect,
} from '../src/game/assets/rpgMakerSheets';
import { validateAssetFile, validateImageDimensions } from '../src/game/assets/assetValidation';
import {
  DEFAULT_CHARACTER_ID,
  avatarSheetTextureKey,
  characterPresetTextureKey,
} from '../src/game/assets/characterKeys';
import {
  ART_OBJECTS,
  BUILTIN_OBJECTS,
  LEGACY_ART_MAP,
  LEGACY_OBJECTS,
} from '../src/game/assets/objectIds';
import {
  characterCountFor,
  isCharacterSheetAsset,
  resolveCustomCharacterSheet,
} from '../src/game/assets/customCharacterSheets';
import { FLOOR_TILE_ART, floorArtTextureKey } from '../src/game/assets/floorTiles';
import { BUILTIN_TILES } from '../src/game/maps/mapSchema';
import { AssetMetadata, DEFAULT_ASSET_LIMITS } from '../src/types/assets';

function meta(overrides: Partial<AssetMetadata>): AssetMetadata {
  return {
    id: 'asset_test',
    name: 'Test Sheet',
    category: 'character',
    fileName: 'Test.png',
    mimeType: 'image/png',
    fileSize: 1024,
    width: 144,
    height: 192,
    hasTransparency: true,
    frameWidth: 48,
    frameHeight: 48,
    columns: 3,
    rows: 4,
    layout: 'character_single',
    rpgMakerFamily: null,
    isDollar: false,
    isBang: false,
    storageBackend: 'indexeddb',
    storagePath: 'assets/asset_test/Test.png',
    createdAt: 0,
    ...overrides,
  };
}

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
  console.log('GatherGrid Asset Pipeline — MZ Detection, Frames & Limits');
  console.log('------------------------------------------------------------');

  await test('Test 1: "$" single-character sheets are detected as 3×4 grids', () => {
    const dollar = detectSheetLayout('$Hero.png', 144, 192);
    assert.strictEqual(dollar.layout, 'character_single');
    assert.strictEqual(dollar.isDollar, true);
    assert.strictEqual(dollar.isBang, false);
    assert.strictEqual(dollar.frameWidth, 48);
    assert.strictEqual(dollar.frameHeight, 48);
    assert.strictEqual(dollar.columns, 3);
    assert.strictEqual(dollar.rows, 4);
    assert.strictEqual(dollar.confidence, 1);
  });

  await test('Test 2: Standard character sheets are detected as 12×8 grids (4×2 characters)', () => {
    const grid = detectSheetLayout('Actor1.png', 576, 384);
    assert.strictEqual(grid.layout, 'character_grid');
    assert.strictEqual(grid.isDollar, false);
    assert.strictEqual(grid.frameWidth, 48);
    assert.strictEqual(grid.columns, 12);
    assert.strictEqual(grid.rows, 8);
    assert.ok(grid.confidence > 0, 'Detection must report confidence');
  });

  await test('Test 3: B–E tilesets and A-family autotiles are detected from name + grid', () => {
    const b = detectSheetLayout('Inside_B.png', 768, 768);
    assert.strictEqual(b.layout, 'tileset_bcde');
    assert.strictEqual(b.frameWidth, 48);
    assert.strictEqual(b.columns, 16);
    assert.strictEqual(b.rows, 16);
    assert.strictEqual(b.rpgMakerFamily, 'B');

    const a1 = detectSheetLayout('A1_water.png', 768, 576);
    assert.strictEqual(a1.rpgMakerFamily, 'A1');
    assert.strictEqual(a1.frameWidth, 48);
    assert.strictEqual(a1.columns, 16);
    assert.strictEqual(a1.rows, 12);
  });

  await test('Test 4: "!" no-shift sheets are flagged without breaking tileset detection', () => {
    const bang = detectSheetLayout('!Exterior.png', 768, 768);
    assert.strictEqual(bang.isBang, true);
    assert.strictEqual(bang.isDollar, false);
    assert.strictEqual(bang.frameWidth, 48);
    assert.strictEqual(bang.columns, 16);
  });

  await test('Test 5: Frame math maps grid indexes to source rectangles', () => {
    const rect = getFrameRect(17, 16, 48, 48);
    assert.deepStrictEqual(rect, { sx: 48, sy: 48, sw: 48, sh: 48 });
    assert.strictEqual(getFrameRect(-1, 16, 48, 48), null);
    assert.strictEqual(getFrameRect(0, 0, 48, 48), null);
    assert.strictEqual(getFrameCount(16, 16), 256);
    assert.strictEqual(getFrameCount(0, 16), 0);

    // Character blocks are 3×4; the middle column is the idle frame.
    const frames = getCharacterFrames(1, 12);
    assert.strictEqual(frames.length, 12);
    assert.deepStrictEqual(frames.slice(0, 3), [3, 4, 5]);
    assert.deepStrictEqual(getCharacterFrames(0, 12).slice(0, 3), [0, 1, 2]);

    assert.ok(getAutotileFamilyLabel('A1').includes('A1'));
    assert.ok(getAutotileFamilyLabel('B').includes('B'));
    assert.ok(getAutotileFamilyLabel(null).toLowerCase().includes('generic'));
  });

  await test('Test 6: validateAssetFile enforces type, emptiness and size limits', () => {
    const ok = validateAssetFile({ name: 'tiles.png', size: 2048, type: 'image/png' });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.errors.length, 0);

    const badType = validateAssetFile({ name: 'notes.exe', size: 100, type: 'application/x-msdownload' });
    assert.strictEqual(badType.ok, false);
    assert.ok(badType.errors.some((e) => e.toLowerCase().includes('unsupported')));

    const empty = validateAssetFile({ name: 'empty.png', size: 0, type: 'image/png' });
    assert.strictEqual(empty.ok, false);
    assert.ok(empty.errors.some((e) => e.toLowerCase().includes('empty')));

    const huge = validateAssetFile({
      name: 'huge.png',
      size: DEFAULT_ASSET_LIMITS.maxFileBytes + 1,
      type: 'image/png',
    });
    assert.strictEqual(huge.ok, false);
    assert.ok(huge.errors.some((e) => e.toLowerCase().includes('too large')));

    // Extension alone is not enough to bypass the limits, but a valid
    // extension with an empty MIME type is tolerated (browser quirk).
    const noMime = validateAssetFile({ name: 'sprite.jpg', size: 1024, type: '' });
    assert.strictEqual(noMime.ok, true);
  });

  await test('Test 7: validateImageDimensions enforces minimum, maximum and megapixel limits', () => {
    const tiny = validateImageDimensions(4, 4);
    assert.strictEqual(tiny.ok, false);
    assert.ok(tiny.errors.some((e) => e.includes('too small')));

    const wide = validateImageDimensions(DEFAULT_ASSET_LIMITS.maxDimension + 1, 10);
    assert.strictEqual(wide.ok, false);
    assert.ok(wide.errors.some((e) => e.includes('too large')));

    const fine = validateImageDimensions(1024, 512);
    assert.strictEqual(fine.ok, true);
    assert.strictEqual(fine.errors.length, 0);

    const bogus = validateImageDimensions(Number.NaN, 100);
    assert.strictEqual(bogus.ok, false);
  });

  await test('Test 8: Imported character sheets map to the 12 avatar frames', () => {
    const single = meta({});
    assert.strictEqual(isCharacterSheetAsset(single), true);
    assert.strictEqual(characterCountFor(single), 1);

    const sheet = resolveCustomCharacterSheet(single);
    assert.ok(sheet, 'A 3×4 sheet must resolve');
    assert.strictEqual(sheet.frames.length, 12);
    // Row-major: down (0-2), left (3-5), right (6-8), up (9-11).
    assert.deepStrictEqual(sheet.frames[0], { sx: 0, sy: 0, sw: 48, sh: 48 });
    assert.deepStrictEqual(sheet.frames[1], { sx: 48, sy: 0, sw: 48, sh: 48 });
    assert.deepStrictEqual(sheet.frames[2], { sx: 96, sy: 0, sw: 48, sh: 48 });
    assert.deepStrictEqual(sheet.frames[3], { sx: 0, sy: 48, sw: 48, sh: 48 });
    assert.deepStrictEqual(sheet.frames[11], { sx: 96, sy: 144, sw: 48, sh: 48 });

    // A 12×8 sheet holds 4 characters per row and 2 rows.
    const grid = meta({
      layout: 'character_grid',
      columns: 12,
      rows: 8,
      width: 576,
      height: 384,
    });
    assert.strictEqual(isCharacterSheetAsset(grid), true);
    assert.strictEqual(characterCountFor(grid), 8);

    const second = resolveCustomCharacterSheet(grid, 1);
    assert.ok(second);
    assert.deepStrictEqual(second.frames[0], { sx: 144, sy: 0, sw: 48, sh: 48 });
    assert.deepStrictEqual(second.frames[11], { sx: 240, sy: 144, sw: 48, sh: 48 });

    // Index 5 is the second character of the second row.
    const sixth = resolveCustomCharacterSheet(grid, 5);
    assert.ok(sixth);
    assert.deepStrictEqual(sixth.frames[0], { sx: 144, sy: 192, sw: 48, sh: 48 });

    // Tilesets and unknown grids are not avatars.
    const tileset = meta({ category: 'tileset', layout: 'tileset_bcde', columns: 16, rows: 16 });
    assert.strictEqual(isCharacterSheetAsset(tileset), false);
    assert.strictEqual(resolveCustomCharacterSheet(tileset), null);
  });

  await test('Test 9: Avatar sheets keep a stable texture key per character', () => {
    // Switching characters must not reuse (and therefore destroy) the
    // texture a live sprite is still using.
    const a = avatarSheetTextureKey('player_avatar', 'soc_analyst');
    const b = avatarSheetTextureKey('player_avatar', 'consultant');
    assert.notStrictEqual(a, b);
    assert.strictEqual(a, avatarSheetTextureKey('player_avatar', 'soc_analyst'));
    assert.strictEqual(a.startsWith('player_avatar'), true);

    // The default character is always available so nobody renders as a
    // generated placeholder sprite.
    assert.strictEqual(DEFAULT_CHARACTER_ID, 'office_worker');
    assert.strictEqual(characterPresetTextureKey(DEFAULT_CHARACTER_ID), 'char_preset_office_worker');
  });

  await test('Test 10: The object catalogue maps legacy types to hand-drawn art', () => {
    const legacyTypes = LEGACY_OBJECTS.map((o) => o.type);
    const artTypes = ART_OBJECTS.map((o) => o.type);
    assert.ok(legacyTypes.length > 0 && artTypes.length > 0);

    // Every art id is unique and every legacy replacement points at real art.
    assert.strictEqual(new Set(artTypes).size, artTypes.length, 'Art ids must be unique');
    for (const [legacy, art] of Object.entries(LEGACY_ART_MAP)) {
      assert.ok(legacyTypes.includes(legacy), `Unknown legacy type "${legacy}"`);
      assert.ok(artTypes.includes(art), `Legacy type "${legacy}" points at unknown art "${art}"`);
    }

    // The palette catalogue contains every art id so nothing is unreachable.
    for (const art of artTypes) {
      assert.ok(
        BUILTIN_OBJECTS.some((o) => o.type === art),
        `Art "${art}" is missing from the builtin object catalogue`
      );
    }
  });

  await test('Test 11: Hand-drawn floor tiles replace specific builtin floor ids', () => {
    const floorIds = BUILTIN_TILES.filter((t) => t.kind === 'floor').map((t) => t.id);
    assert.ok(floorIds.includes(6) && floorIds.includes(7), 'Herringbone and light stone ids exist');

    const seenTiles = new Set<number>();
    const seenArts = new Set<string>();
    const seenKeys = new Set<string>();
    for (const def of FLOOR_TILE_ART) {
      assert.ok(floorIds.includes(def.tileId), `Tile ${def.tileId} is not a builtin floor`);
      assert.ok(!seenTiles.has(def.tileId), `Tile ${def.tileId} is mapped twice`);
      assert.ok(!seenArts.has(def.artId), `Art ${def.artId} is mapped twice`);
      seenTiles.add(def.tileId);
      seenArts.add(def.artId);

      const key = floorArtTextureKey(def.tileId);
      assert.strictEqual(key, `art_${def.artId}`);
      assert.ok(!seenKeys.has(key!), `Texture key ${key} is reused`);
      seenKeys.add(key!);

      // The exported PNG must actually ship with the app.
      assert.strictEqual(
        existsSync(new URL(`../src/assets/objects/${def.artId}.png`, import.meta.url)),
        true,
        `Missing art file for ${def.artId}`
      );
    }

    // Tiles without art keep their procedural texture.
    assert.strictEqual(floorArtTextureKey(1), undefined);
    assert.strictEqual(floorArtTextureKey(5), undefined);
    assert.strictEqual(floorArtTextureKey(99), undefined);
  });

  console.log('\n============================================================');
  if (failedCount > 0) {
    console.error(`GatherGrid Asset Suite: ${failedCount} test(s) FAILED (${passedCount} passed).`);
    console.error('============================================================\n');
    process.exit(1);
  }
  console.log(`GatherGrid Asset Suite Complete: All ${passedCount} Tests PASSED!`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
