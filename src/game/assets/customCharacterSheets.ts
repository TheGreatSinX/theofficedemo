/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Imported character sheets (Studio asset library) → avatar frames.
 *
 * RPG Maker MZ character sheets are 3 columns × 4 rows per character
 * (down / left / right / up; the middle column is the standing pose). A
 * standard sheet packs 4 characters per row and 2 rows (12×8 frames); a `$`
 * sheet holds a single character (3×4 frames).
 *
 * The frame math is deliberately free of DOM/registry dependencies so it can
 * be unit tested; the renderer turns the resolved frames into Phaser texture
 * frames and the shared 3-frame walk cycle.
 */

import { AssetMetadata } from '../../types/assets';

/** Columns/rows of one MZ character block. */
export const CHARACTER_BLOCK_COLUMNS = 3;
export const CHARACTER_BLOCK_ROWS = 4;

export interface CustomCharacterFrame {
  /** Source rectangle inside the imported sheet. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface CustomCharacterSheet {
  assetId: string;
  name: string;
  frameWidth: number;
  frameHeight: number;
  /** 12 frames, row-major: down (0-2), left (3-5), right (6-8), up (9-11). */
  frames: CustomCharacterFrame[];
  /** Number of characters the sheet contains. */
  characterCount: number;
}

/** True when the asset can drive an avatar. */
export function isCharacterSheetAsset(meta: AssetMetadata): boolean {
  if (meta.layout === 'character_single') {
    return meta.columns === CHARACTER_BLOCK_COLUMNS && meta.rows === CHARACTER_BLOCK_ROWS;
  }
  if (meta.layout === 'character_grid') {
    return meta.columns === 12 && meta.rows === 8;
  }
  // Manually configured sheets (a plain 3×4 grid) work as well.
  return meta.columns === CHARACTER_BLOCK_COLUMNS && meta.rows === CHARACTER_BLOCK_ROWS;
}

/** How many characters a sheet contains (1 for 3×4 sheets, 8 for 12×8). */
export function characterCountFor(meta: AssetMetadata): number {
  if (meta.layout === 'character_grid' && meta.columns === 12 && meta.rows === 8) return 8;
  return 1;
}

/**
 * Maps one character block of an imported sheet to the 12 frames the avatar
 * animations expect. Returns null when the sheet cannot be used.
 */
export function resolveCustomCharacterSheet(
  meta: AssetMetadata,
  characterIndex = 0
): CustomCharacterSheet | null {
  if (!isCharacterSheetAsset(meta)) return null;

  const fw = meta.frameWidth;
  const fh = meta.frameHeight;
  const frames: CustomCharacterFrame[] = [];

  if (meta.layout === 'character_grid' && meta.columns === 12 && meta.rows === 8) {
    const perRow = meta.columns / CHARACTER_BLOCK_COLUMNS; // 4 characters per row
    const blockCol = (characterIndex % perRow) * CHARACTER_BLOCK_COLUMNS;
    const blockRow = Math.floor(characterIndex / perRow) * CHARACTER_BLOCK_ROWS;
    for (let row = 0; row < CHARACTER_BLOCK_ROWS; row++) {
      for (let col = 0; col < CHARACTER_BLOCK_COLUMNS; col++) {
        frames.push({
          sx: (blockCol + col) * fw,
          sy: (blockRow + row) * fh,
          sw: fw,
          sh: fh,
        });
      }
    }
  } else {
    for (let row = 0; row < CHARACTER_BLOCK_ROWS; row++) {
      for (let col = 0; col < CHARACTER_BLOCK_COLUMNS; col++) {
        frames.push({ sx: col * fw, sy: row * fh, sw: fw, sh: fh });
      }
    }
  }

  return {
    assetId: meta.id,
    name: meta.name,
    frameWidth: fw,
    frameHeight: fh,
    frames,
    characterCount: characterCountFor(meta),
  };
}
