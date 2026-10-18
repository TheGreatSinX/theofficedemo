/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asset pipeline test suite — RPG Maker MZ sheet detection ($/! conventions,
 * A1–A5 families, B–E tilesets, character grids), frame math and file/image
 * validation limits.
 */

import assert from 'node:assert';
import {
  detectSheetLayout,
  getAutotileFamilyLabel,
  getCharacterFrames,
  getFrameCount,
  getFrameRect,
} from '../src/game/assets/rpgMakerSheets';
import { validateAssetFile, validateImageDimensions } from '../src/game/assets/assetValidation';
import { DEFAULT_ASSET_LIMITS } from '../src/types/assets';

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
