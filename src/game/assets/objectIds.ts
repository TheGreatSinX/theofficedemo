/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Object catalogue shared by the map schema and the Studio palette.
 *
 * Kept free of asset imports so the schema tests can run in node.
 */

export interface BuiltinObjectDef {
  /** Object type stored in the map data (`MapObject.type`). */
  type: string;
  label: string;
  isSolidByDefault: boolean;
  /** Footprint in tiles used when the object is placed. */
  width: number;
  height: number;
}

/** Legacy procedural objects (still used when no hand-drawn art matches). */
export const LEGACY_OBJECTS: BuiltinObjectDef[] = [
  { type: 'desk_single', label: 'Single Desk', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'desk_dual', label: 'Dual Monitor Desk', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'chair_office', label: 'Mesh Chair', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'table_conference', label: 'Walnut Board Table', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_monstera', label: 'Potted Monstera', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'water_cooler', label: 'Water Dispenser', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'coffee_machine', label: 'Espresso Counter', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'whiteboard', label: 'Kanban Whiteboard', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'server_rack', label: 'Server Rack', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'sofa_lounge', label: 'Lounge Sofa', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'phone_booth', label: 'Focus Pod', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'door_warp', label: 'Warp Pad', isSolidByDefault: false, width: 1, height: 1 },
];

/** Hand-drawn equipment imported from the raw art sheets. */
export const ART_OBJECTS: BuiltinObjectDef[] = [
  { type: 'desk_simple', label: 'Wooden Desk', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'desk_lshape', label: 'L-Desk', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'desk_drawers', label: 'Desk with Drawers', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'chair', label: 'Office Chair', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'gaming_desk_purple', label: 'Gaming Desk (Neon)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_ice', label: 'Gaming Desk (Ice)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_crimson', label: 'Gaming Desk (Crimson)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_sand', label: 'Gaming Desk (Sand)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_dual', label: 'Gaming Desk (Dual)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'monitor', label: 'Monitor', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'monitor_curved', label: 'Curved Monitor', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'laptop', label: 'Laptop', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'keyboard', label: 'Keyboard', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'mouse', label: 'Mouse', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'lamp_desk', label: 'Desk Lamp', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'headphones', label: 'Headphones', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'speaker', label: 'Speakers', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'books', label: 'Books', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'mug_coffee', label: 'Coffee Mug', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'plant_pot', label: 'Potted Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_small', label: 'Small Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_dark', label: 'Tall Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_hanging', label: 'Hanging Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'shelf', label: 'Shelf', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'frame', label: 'Framed Picture', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'rug', label: 'Rug', isSolidByDefault: false, width: 1, height: 1 },
];

/** Ids of the imported equipment art (see `objectSprites.ts`). */
export const ART_OBJECT_IDS = [
  'desk_simple',
  'desk_lshape',
  'desk_drawers',
  'chair',
  'gaming_desk_purple',
  'gaming_desk_ice',
  'gaming_desk_crimson',
  'gaming_desk_sand',
  'gaming_desk_mint',
  'gaming_desk_gold',
  'gaming_desk_neon',
  'gaming_desk_amber',
  'gaming_desk_lilac',
  'gaming_desk_dual',
  'monitor',
  'monitor_curved',
  'laptop',
  'keyboard',
  'mouse',
  'lamp_desk',
  'headphones',
  'speaker',
  'books',
  'mug_coffee',
  'plant_pot',
  'plant_small',
  'plant_dark',
  'plant_hanging',
  'shelf',
  'frame',
  'rug',
] as const;

export type ArtObjectId = (typeof ART_OBJECT_IDS)[number];

export const BUILTIN_OBJECTS: BuiltinObjectDef[] = [...LEGACY_OBJECTS, ...ART_OBJECTS];

/**
 * Legacy object types that now use hand-drawn art.
 * The map data keeps the old type so existing maps keep working.
 */
export const LEGACY_ART_MAP: Record<string, string> = {
  desk_single: 'desk_simple',
  desk_dual: 'desk_drawers',
  chair_office: 'chair',
  table_conference: 'desk_lshape',
  plant_monstera: 'plant_dark',
};
