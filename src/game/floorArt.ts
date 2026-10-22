/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hand-drawn floor tiles.
 *
 * The six floor illustrations cut from `office_equipment_sheet.jpeg` replace
 * the procedural ground textures one-for-one. The procedural textures stay in
 * the texture manager as a fallback (and for tiles that have no art yet), so a
 * failed image load can never leave a hole in the map.
 */

import { FLOOR_TILE_ART, floorArtTextureKey } from './assets/floorTiles';
import type { FloorTileArtDef } from './assets/floorTiles';

import checkerUrl from '../assets/objects/floor_checker.png';
import herringboneUrl from '../assets/objects/floor_herringbone.png';
import tileDarkUrl from '../assets/objects/floor_tile_dark.png';
import tileLightUrl from '../assets/objects/floor_tile_light.png';
import woodUrl from '../assets/objects/floor_wood.png';
import woodDarkUrl from '../assets/objects/floor_wood_dark.png';

export interface FloorArtDef extends FloorTileArtDef {
  /** Phaser texture key for the imported image. */
  textureKey: string;
  /** Bundled image URL (Vite asset import). */
  image: string;
}

const FLOOR_IMAGE_BY_ART_ID: Record<string, string> = {
  floor_checker: checkerUrl,
  floor_herringbone: herringboneUrl,
  floor_tile_dark: tileDarkUrl,
  floor_tile_light: tileLightUrl,
  floor_wood: woodUrl,
  floor_wood_dark: woodDarkUrl,
};

/** Every replacement floor tile, ready to preload. */
export const FLOOR_ART: FloorArtDef[] = FLOOR_TILE_ART.map((def) => ({
  ...def,
  textureKey: floorArtTextureKey(def.tileId)!,
  image: FLOOR_IMAGE_BY_ART_ID[def.artId],
}));

export { floorArtTextureKey };
