/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Floor tile art catalogue (pure data — no image imports, so the tests can
 * import it without a bundler).
 *
 * The renderer attaches the bundled PNGs in `src/game/floorArt.ts`.
 */

export interface FloorTileArtDef {
  /** Builtin tile id this art replaces. */
  tileId: number;
  /** Base name of the exported tile image (`src/assets/objects/<artId>.png`). */
  artId: string;
}

/**
 * Builtin floor tiles that have hand-drawn art.
 *
 * Tiles not listed here (blue carpet, garden grass) keep their procedural
 * texture. New ids 6/7 were added to the builtin catalogue for the two extra
 * imported floor styles (herringbone wood, light stone).
 */
export const FLOOR_TILE_ART: FloorTileArtDef[] = [
  { tileId: 0, artId: 'floor_wood' },
  { tileId: 2, artId: 'floor_tile_dark' },
  { tileId: 3, artId: 'floor_checker' },
  { tileId: 4, artId: 'floor_wood_dark' },
  { tileId: 6, artId: 'floor_herringbone' },
  { tileId: 7, artId: 'floor_tile_light' },
];

/** Stable Phaser texture key for an imported floor tile image. */
export function floorArtTextureKey(tileId: number): string | undefined {
  const def = FLOOR_TILE_ART.find((art) => art.tileId === tileId);
  return def ? `art_${def.artId}` : undefined;
}

/** The art definition for a builtin tile id, if one exists. */
export function getFloorTileArt(tileId: number): FloorTileArtDef | undefined {
  return FLOOR_TILE_ART.find((art) => art.tileId === tileId);
}
