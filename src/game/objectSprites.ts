/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hand-drawn office equipment.
 *
 * The art comes from the two raw equipment sheets (imported by the
 * `equipexport` action of `raw-assets/import/`) and is cut into one
 * transparent PNG per item. Every item is registered as a map object type
 * and drawn through the same pipeline as the procedural office furniture.
 */

import { ART_OBJECT_IDS, ArtObjectId, LEGACY_ART_MAP } from './assets/objectIds';

import booksUrl from '../assets/objects/books.png';
import chairUrl from '../assets/objects/chair_office.png';
import deskDrawersUrl from '../assets/objects/desk_drawers.png';
import deskLshapeUrl from '../assets/objects/desk_lshape.png';
import deskSimpleUrl from '../assets/objects/desk_simple.png';
import frameUrl from '../assets/objects/frame_landscape.png';
import gamingAmberUrl from '../assets/objects/gaming_desk_amber.png';
import gamingCrimsonUrl from '../assets/objects/gaming_desk_crimson.png';
import gamingDualUrl from '../assets/objects/gaming_desk_dual.png';
import gamingGoldUrl from '../assets/objects/gaming_desk_gold.png';
import gamingIceUrl from '../assets/objects/gaming_desk_ice.png';
import gamingLilacUrl from '../assets/objects/gaming_desk_lilac.png';
import gamingMintUrl from '../assets/objects/gaming_desk_mint.png';
import gamingNeonUrl from '../assets/objects/gaming_desk_neon.png';
import gamingPurpleUrl from '../assets/objects/gaming_desk_purple.png';
import gamingSandUrl from '../assets/objects/gaming_desk_sand.png';
import headphonesUrl from '../assets/objects/headphones.png';
import keyboardUrl from '../assets/objects/keyboard.png';
import lampUrl from '../assets/objects/lamp_desk.png';
import laptopUrl from '../assets/objects/laptop.png';
import monitorCurvedUrl from '../assets/objects/monitor_curved_on.png';
import monitorUrl from '../assets/objects/monitor_on.png';
import mouseUrl from '../assets/objects/mouse.png';
import mugUrl from '../assets/objects/mug_coffee.png';
import plantDarkUrl from '../assets/objects/plant_dark.png';
import plantHangingUrl from '../assets/objects/plant_hanging.png';
import plantPotUrl from '../assets/objects/plant_pot.png';
import plantSmallUrl from '../assets/objects/plant_small.png';
import rugUrl from '../assets/objects/rug_blue.png';
import shelfUrl from '../assets/objects/shelf_plant.png';
import speakerUrl from '../assets/objects/speaker.png';

export interface ObjectSpriteDef {
  /** Art id (also the texture key suffix). */
  id: string;
  image: string;
}

/** Every imported equipment item that can be placed on a map. */
const ART_IMAGES: Record<ArtObjectId, string> = {
  desk_simple: deskSimpleUrl,
  desk_lshape: deskLshapeUrl,
  desk_drawers: deskDrawersUrl,
  chair: chairUrl,
  gaming_desk_purple: gamingPurpleUrl,
  gaming_desk_ice: gamingIceUrl,
  gaming_desk_crimson: gamingCrimsonUrl,
  gaming_desk_sand: gamingSandUrl,
  gaming_desk_mint: gamingMintUrl,
  gaming_desk_gold: gamingGoldUrl,
  gaming_desk_neon: gamingNeonUrl,
  gaming_desk_amber: gamingAmberUrl,
  gaming_desk_lilac: gamingLilacUrl,
  gaming_desk_dual: gamingDualUrl,
  monitor: monitorUrl,
  monitor_curved: monitorCurvedUrl,
  laptop: laptopUrl,
  keyboard: keyboardUrl,
  mouse: mouseUrl,
  lamp_desk: lampUrl,
  headphones: headphonesUrl,
  speaker: speakerUrl,
  books: booksUrl,
  mug_coffee: mugUrl,
  plant_pot: plantPotUrl,
  plant_small: plantSmallUrl,
  plant_dark: plantDarkUrl,
  plant_hanging: plantHangingUrl,
  shelf: shelfUrl,
  frame: frameUrl,
  rug: rugUrl,
};

export const OBJECT_SPRITES: ObjectSpriteDef[] = ART_OBJECT_IDS.map((id) => ({
  id,
  image: ART_IMAGES[id],
}));

/** Phaser texture key of an imported equipment item. */
export function objectSpriteTextureKey(id: string): string {
  return `object_${id}`;
}

/**
 * Resolves the art for an object type. Legacy types (stored in existing maps)
 * point at their hand-drawn replacement through `LEGACY_ART_MAP`.
 */
export function getObjectSprite(type: string): ObjectSpriteDef | undefined {
  const artId = LEGACY_ART_MAP[type] ?? type;
  return OBJECT_SPRITES.find((sprite) => sprite.id === artId);
}
