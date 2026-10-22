/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hand-drawn office equipment.
 *
 * The art comes from the raw equipment and prop sheets (imported by the
 * `equipexport` and `propsexport` actions of `raw-assets/import/`) and is cut
 * into one transparent PNG per item. Every item is registered as a map object
 * type and drawn through the same pipeline as the procedural office furniture.
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
import artAbstractUrl from '../assets/objects/art_abstract.png';
import artLandscapeUrl from '../assets/objects/art_landscape.png';
import booksStackUrl from '../assets/objects/books_stack.png';
import bookshelfWoodUrl from '../assets/objects/bookshelf_wood.png';
import cabinetAntiqueUrl from '../assets/objects/cabinet_antique.png';
import cabinetBaseWoodUrl from '../assets/objects/cabinet_base_wood.png';
import cabinetCreamUrl from '../assets/objects/cabinet_cream.png';
import cabinetFileLowUrl from '../assets/objects/cabinet_file_low.png';
import cabinetFileNarrowUrl from '../assets/objects/cabinet_file_narrow.png';
import cabinetFileOpenUrl from '../assets/objects/cabinet_file_open.png';
import cabinetFileTallUrl from '../assets/objects/cabinet_file_tall.png';
import cabinetGlassUrl from '../assets/objects/cabinet_glass.png';
import cabinetLateralUrl from '../assets/objects/cabinet_lateral.png';
import cabinetSinkUrl from '../assets/objects/cabinet_sink.png';
import cabinetSupplyOpenUrl from '../assets/objects/cabinet_supply_open.png';
import cabinetTallLightUrl from '../assets/objects/cabinet_tall_light.png';
import cabinetVentUrl from '../assets/objects/cabinet_vent.png';
import calendarDeskUrl from '../assets/objects/calendar_desk.png';
import cartPrinterUrl from '../assets/objects/cart_printer.png';
import certificateUrl from '../assets/objects/certificate.png';
import clockWallUrl from '../assets/objects/clock_wall.png';
import corkboardUrl from '../assets/objects/corkboard.png';
import globeUrl from '../assets/objects/globe.png';
import lampTableUrl from '../assets/objects/lamp_table.png';
import lockerNarrowUrl from '../assets/objects/locker_narrow.png';
import lockerOpenUrl from '../assets/objects/locker_open.png';
import lockerQuadUrl from '../assets/objects/locker_quad.png';
import ottomanNavyUrl from '../assets/objects/ottoman_navy.png';
import pedestalDrawersUrl from '../assets/objects/pedestal_drawers.png';
import plantBonsaiUrl from '../assets/objects/plant_bonsai.png';
import plantCactusUrl from '../assets/objects/plant_cactus.png';
import plantFernUrl from '../assets/objects/plant_fern.png';
import plantFicusUrl from '../assets/objects/plant_ficus.png';
import plantGrassUrl from '../assets/objects/plant_grass.png';
import plantHangingMacrameUrl from '../assets/objects/plant_hanging_macrame.png';
import plantHydrangeaUrl from '../assets/objects/plant_hydrangea.png';
import plantLilyUrl from '../assets/objects/plant_lily.png';
import plantPalmUrl from '../assets/objects/plant_palm.png';
import plantPothosCrateUrl from '../assets/objects/plant_pothos_crate.png';
import plantSnakeUrl from '../assets/objects/plant_snake.png';
import plantSucculentUrl from '../assets/objects/plant_succulent.png';
import rackServerOpenUrl from '../assets/objects/rack_server_open.png';
import sculptureGoldUrl from '../assets/objects/sculpture_gold.png';
import shelfBindersBeigeUrl from '../assets/objects/shelf_binders_beige.png';
import shelfBindersTallUrl from '../assets/objects/shelf_binders_tall.png';
import sideboardWoodUrl from '../assets/objects/sideboard_wood.png';
import sofaBenchBeigeUrl from '../assets/objects/sofa_bench_beige.png';
import sofaBlackLeatherUrl from '../assets/objects/sofa_black_leather.png';
import sofaBlueUrl from '../assets/objects/sofa_blue.png';
import sofaBrownLeatherUrl from '../assets/objects/sofa_brown_leather.png';
import sofaChesterfieldUrl from '../assets/objects/sofa_chesterfield.png';
import sofaCreamRoundUrl from '../assets/objects/sofa_cream_round.png';
import sofaDarkGrayUrl from '../assets/objects/sofa_dark_gray.png';
import sofaGrayUrl from '../assets/objects/sofa_gray.png';
import sofaNavyUrl from '../assets/objects/sofa_navy.png';
import sofaSectionalCreamUrl from '../assets/objects/sofa_sectional_cream.png';
import sofaTanThreeUrl from '../assets/objects/sofa_tan_three.png';
import sofaTanTuftedUrl from '../assets/objects/sofa_tan_tufted.png';
import trophyGoldUrl from '../assets/objects/trophy_gold.png';
import vaseBlueUrl from '../assets/objects/vase_blue.png';
import wardrobeSteelUrl from '../assets/objects/wardrobe_steel.png';
import wardrobeWoodUrl from '../assets/objects/wardrobe_wood.png';

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
  cabinet_file_low: cabinetFileLowUrl,
  cabinet_file_tall: cabinetFileTallUrl,
  cabinet_lateral: cabinetLateralUrl,
  cabinet_file_narrow: cabinetFileNarrowUrl,
  wardrobe_wood: wardrobeWoodUrl,
  sideboard_wood: sideboardWoodUrl,
  locker_narrow: lockerNarrowUrl,
  cabinet_glass: cabinetGlassUrl,
  bookshelf_wood: bookshelfWoodUrl,
  locker_open: lockerOpenUrl,
  cabinet_supply_open: cabinetSupplyOpenUrl,
  wardrobe_steel: wardrobeSteelUrl,
  cabinet_vent: cabinetVentUrl,
  rack_server_open: rackServerOpenUrl,
  cart_printer: cartPrinterUrl,
  cabinet_cream: cabinetCreamUrl,
  cabinet_sink: cabinetSinkUrl,
  cabinet_base_wood: cabinetBaseWoodUrl,
  locker_quad: lockerQuadUrl,
  shelf_binders_tall: shelfBindersTallUrl,
  pedestal_drawers: pedestalDrawersUrl,
  cabinet_file_open: cabinetFileOpenUrl,
  shelf_binders_beige: shelfBindersBeigeUrl,
  cabinet_tall_light: cabinetTallLightUrl,
  cabinet_antique: cabinetAntiqueUrl,
  plant_succulent: plantSucculentUrl,
  plant_ficus: plantFicusUrl,
  plant_snake: plantSnakeUrl,
  plant_lily: plantLilyUrl,
  plant_hanging_macrame: plantHangingMacrameUrl,
  plant_cactus: plantCactusUrl,
  plant_fern: plantFernUrl,
  plant_bonsai: plantBonsaiUrl,
  plant_hydrangea: plantHydrangeaUrl,
  plant_palm: plantPalmUrl,
  plant_grass: plantGrassUrl,
  plant_pothos_crate: plantPothosCrateUrl,
  art_abstract: artAbstractUrl,
  art_landscape: artLandscapeUrl,
  clock_wall: clockWallUrl,
  sculpture_gold: sculptureGoldUrl,
  vase_blue: vaseBlueUrl,
  globe: globeUrl,
  calendar_desk: calendarDeskUrl,
  trophy_gold: trophyGoldUrl,
  certificate: certificateUrl,
  corkboard: corkboardUrl,
  books_stack: booksStackUrl,
  lamp_table: lampTableUrl,
  sofa_black_leather: sofaBlackLeatherUrl,
  sofa_tan_three: sofaTanThreeUrl,
  sofa_gray: sofaGrayUrl,
  sofa_brown_leather: sofaBrownLeatherUrl,
  sofa_blue: sofaBlueUrl,
  sofa_chesterfield: sofaChesterfieldUrl,
  sofa_sectional_cream: sofaSectionalCreamUrl,
  sofa_dark_gray: sofaDarkGrayUrl,
  sofa_cream_round: sofaCreamRoundUrl,
  sofa_bench_beige: sofaBenchBeigeUrl,
  sofa_navy: sofaNavyUrl,
  ottoman_navy: ottomanNavyUrl,
  sofa_tan_tufted: sofaTanTuftedUrl,
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
