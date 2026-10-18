/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RPG Maker MZ / MV resource-layout compatibility layer.
 *
 * Supported conventions (image assets only — project data, events, plugins and
 * other MZ features are explicitly out of scope):
 *
 * Tileset sheets (img/tilesets)
 *  - A1 water/autotiles, A2 ground autotiles, A3 wall-top autotiles,
 *    A4 wall autotiles: 16×12 grid of 48px cells (MZ) / 16×12 of 32px (MV).
 *  - A5 normal tiles: 8×16 grid.
 *  - B, C, D, E normal tiles: 16×16 grid.
 *  Autotile corner/blend composition is NOT reproduced (documented limitation);
 *  sheets are exposed as plain frame grids so users can paint individual cells.
 *
 * Character sheets (img/characters)
 *  - standard: 4 characters × 2 rows; each character is 3×4 frames.
 *  - `$` prefix: a single character sheet (3×4 frames).
 *  - `!` prefix: no vertical shift (rendering hint only; grid unchanged).
 */

import { AssetLayout } from '../../types/assets';

export interface SheetDetectionResult {
  layout: AssetLayout;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  rpgMakerFamily: string | null;
  isDollar: boolean;
  isBang: boolean;
  confidence: number; // 0..1
  notes: string[];
}

const CANDIDATE_FRAME_SIZES = [16, 24, 32, 48, 64, 96];

/** RPG Maker MZ tileset family grids (columns × rows) keyed by family. */
const TILESET_FAMILY_GRIDS: Record<string, Array<{ cols: number; rows: number; frame: number }>> = {
  A1: [{ cols: 16, rows: 12, frame: 48 }],
  A2: [{ cols: 16, rows: 12, frame: 48 }],
  A3: [{ cols: 16, rows: 12, frame: 48 }],
  A4: [{ cols: 16, rows: 12, frame: 48 }],
  A5: [{ cols: 8, rows: 16, frame: 48 }],
  B: [{ cols: 16, rows: 16, frame: 48 }],
  C: [{ cols: 16, rows: 16, frame: 48 }],
  D: [{ cols: 16, rows: 16, frame: 48 }],
  E: [{ cols: 16, rows: 16, frame: 48 }],
};

function basename(fileName: string): string {
  const clean = fileName.replace(/\\/g, '/');
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  return base.replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Detects the sheet layout for an image asset using file naming conventions,
 * dimensions and (optionally) the requested frame size.
 */
export function detectSheetLayout(
  fileName: string,
  width: number,
  height: number,
  options?: { preferredFrameSize?: number; categoryHint?: string }
): SheetDetectionResult {
  const name = basename(fileName);
  const isDollar = name.startsWith('$');
  const isBang = name.startsWith('!');
  const notes: string[] = [];

  // --- 1. Character sheet conventions -------------------------------------
  if (isDollar) {
    for (const size of CANDIDATE_FRAME_SIZES) {
      if (width === size * 3 && height === size * 4) {
        notes.push(`Detected "$" single-character sheet (${size}px frames, 3×4).`);
        return {
          layout: 'character_single',
          frameWidth: size,
          frameHeight: size,
          columns: 3,
          rows: 4,
          rpgMakerFamily: null,
          isDollar,
          isBang,
          confidence: 1,
          notes,
        };
      }
    }
    if (width % 3 === 0 && height % 4 === 0 && width / 3 === height / 4) {
      const size = width / 3;
      notes.push(`"$" prefix with non-standard ${size}px frames; using inferred 3×4 grid.`);
      return {
        layout: 'character_single',
        frameWidth: size,
        frameHeight: size,
        columns: 3,
        rows: 4,
        rpgMakerFamily: null,
        isDollar,
        isBang,
        confidence: 0.7,
        notes,
      };
    }
    notes.push('"$" prefix present but dimensions do not form a 3×4 character grid.');
  }

  // Standard character sheet: 12 columns × 8 rows (4 chars × 2 rows, each 3×4)
  for (const size of CANDIDATE_FRAME_SIZES) {
    if (width === size * 12 && height === size * 8) {
      notes.push(`Detected standard character sheet (${size}px frames, 4×2 characters, 3×4 frames each).`);
      return {
        layout: 'character_grid',
        frameWidth: size,
        frameHeight: size,
        columns: 12,
        rows: 8,
        rpgMakerFamily: null,
        isDollar,
        isBang,
        confidence: 1,
        notes,
      };
    }
  }
  if (width % 12 === 0 && height % 8 === 0 && width / 12 === height / 8) {
    const size = width / 12;
    if (CANDIDATE_FRAME_SIZES.includes(size)) {
      notes.push(`Character-grid proportions detected (${size}px frames).`);
      return {
        layout: 'character_grid',
        frameWidth: size,
        frameHeight: size,
        columns: 12,
        rows: 8,
        rpgMakerFamily: null,
        isDollar,
        isBang,
        confidence: 0.9,
        notes,
      };
    }
  }

  // --- 2. RPG Maker tileset families --------------------------------------
  const familyCandidate = detectTilesetFamily(fileName, width, height);
  if (familyCandidate) {
    notes.push(`Matched RPG Maker "${familyCandidate.family}" tileset grid (${familyCandidate.cols}×${familyCandidate.rows} @ ${familyCandidate.frame}px).`);
    return {
      layout: familyCandidate.family.startsWith('A') ? 'autotile_a' : 'tileset_bcde',
      frameWidth: familyCandidate.frame,
      frameHeight: familyCandidate.frame,
      columns: familyCandidate.cols,
      rows: familyCandidate.rows,
      rpgMakerFamily: familyCandidate.family,
      isDollar,
      isBang,
      confidence: 0.9,
      notes,
    };
  }

  // --- 3. Preferred / hinted square grid ----------------------------------
  const preferred = options?.preferredFrameSize;
  if (preferred && width % preferred === 0 && height % preferred === 0) {
    const cols = width / preferred;
    const rows = height / preferred;
    notes.push(`Using preferred frame size ${preferred}px → ${cols}×${rows} frames.`);
    return {
      layout: cols === 1 && rows === 1 ? 'single_image' : 'grid',
      frameWidth: preferred,
      frameHeight: preferred,
      columns: cols,
      rows: rows,
      rpgMakerFamily: null,
      isDollar,
      isBang,
      confidence: 0.8,
      notes,
    };
  }

  // --- 4. Largest square divisor heuristic --------------------------------
  for (let i = CANDIDATE_FRAME_SIZES.length - 1; i >= 0; i--) {
    const size = CANDIDATE_FRAME_SIZES[i];
    if (width % size === 0 && height % size === 0 && width >= size && height >= size) {
      const cols = width / size;
      const rows = height / size;
      notes.push(`Inferred uniform ${size}px grid (${cols}×${rows}); configure manually if incorrect.`);
      return {
        layout: cols === 1 && rows === 1 ? 'single_image' : 'grid',
        frameWidth: size,
        frameHeight: size,
        columns: cols,
        rows: rows,
        rpgMakerFamily: null,
        isDollar,
        isBang,
        confidence: 0.45,
        notes,
      };
    }
  }

  notes.push('Could not infer a uniform grid; the image will be imported as a single image.');
  return {
    layout: 'single_image',
    frameWidth: width,
    frameHeight: height,
    columns: 1,
    rows: 1,
    rpgMakerFamily: null,
    isDollar,
    isBang,
    confidence: 0.3,
    notes,
  };
}

function detectTilesetFamily(
  fileName: string,
  width: number,
  height: number
): { family: string; cols: number; rows: number; frame: number } | null {
  const name = basename(fileName).toLowerCase();

  // Prefer a family named in the filename when dimensions are consistent.
  const explicit = name.match(/^(a[1-5]|b|c|d|e)(?:[_\-\s]|$)/i);
  if (explicit) {
    const family = explicit[1].toUpperCase();
    const grids = TILESET_FAMILY_GRIDS[family];
    for (const g of grids) {
      if (width === g.cols * g.frame && height === g.rows * g.frame) {
        return { family, ...g };
      }
      // MV-era 32px variant of the same family
      if (g.frame === 48) {
        const mv = 32;
        if (width === g.cols * mv && height === g.rows * mv) {
          return { family, cols: g.cols, rows: g.rows, frame: mv };
        }
      }
    }
  }

  // Dimension-only matching (48px MZ and 32px MV variants)
  for (const family of ['A1', 'A2', 'A3', 'A4']) {
    const g = TILESET_FAMILY_GRIDS[family][0];
    if ((width === g.cols * 48 && height === g.rows * 48) || (width === g.cols * 32 && height === g.rows * 32)) {
      return { family, cols: g.cols, rows: g.rows, frame: width === g.cols * 48 ? 48 : 32 };
    }
  }
  for (const family of ['B', 'C', 'D', 'E']) {
    const g = TILESET_FAMILY_GRIDS[family][0];
    if ((width === g.cols * 48 && height === g.rows * 48) || (width === g.cols * 32 && height === g.rows * 32)) {
      return { family, cols: g.cols, rows: g.rows, frame: width === g.cols * 48 ? 48 : 32 };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Frame math
// ---------------------------------------------------------------------------

export interface FrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function getFrameRect(
  frameIndex: number,
  columns: number,
  frameWidth: number,
  frameHeight: number
): FrameRect | null {
  if (!Number.isFinite(frameIndex) || frameIndex < 0 || columns <= 0) return null;
  const col = frameIndex % columns;
  const row = Math.floor(frameIndex / columns);
  return { sx: col * frameWidth, sy: row * frameHeight, sw: frameWidth, sh: frameHeight };
}

export function getFrameCount(columns: number, rows: number): number {
  return Math.max(0, Math.floor(columns) * Math.floor(rows));
}

/**
 * Character-frame mapping for RPG Maker character blocks:
 * each character uses 3 columns × 4 rows; the middle column is the idle frame.
 */
export function getCharacterFrames(characterIndex: number, columns = 12): number[] {
  const perRow = Math.max(1, Math.floor(columns / 3));
  const charCol = characterIndex % perRow;
  const charRow = Math.floor(characterIndex / perRow);
  const frames: number[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const gridCol = charCol * 3 + col;
      const gridRow = charRow * 4 + row;
      frames.push(gridRow * columns + gridCol);
    }
  }
  return frames;
}

/** Categorizes a tile frame index for autotile-style sheets (informational). */
export function getAutotileFamilyLabel(family: string | null): string {
  switch (family) {
    case 'A1':
      return 'A1 — Water / waterfall autotiles';
    case 'A2':
      return 'A2 — Ground autotiles';
    case 'A3':
      return 'A3 — Wall-top autotiles';
    case 'A4':
      return 'A4 — Wall autotiles';
    case 'A5':
      return 'A5 — Normal (single) tiles';
    case 'B':
    case 'C':
    case 'D':
    case 'E':
      return `${family} — Normal tileset`;
    default:
      return 'Generic tilesheet';
  }
}
