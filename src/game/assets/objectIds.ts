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
  // Desks & seating
  { type: 'desk_simple', label: 'Wooden Desk', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'desk_lshape', label: 'L-Desk', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'desk_drawers', label: 'Desk with Drawers', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'chair', label: 'Office Chair', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'gaming_desk_purple', label: 'Gaming Desk (Neon)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_ice', label: 'Gaming Desk (Ice)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_crimson', label: 'Gaming Desk (Crimson)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_sand', label: 'Gaming Desk (Sand)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_mint', label: 'Gaming Desk (Mint)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_gold', label: 'Gaming Desk (Gold)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_neon', label: 'Gaming Desk (Arcade)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_amber', label: 'Gaming Desk (Amber)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_lilac', label: 'Gaming Desk (Lilac)', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'gaming_desk_dual', label: 'Gaming Desk (Dual)', isSolidByDefault: true, width: 1, height: 1 },

  // Desk equipment
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

  // Original plants & decor
  { type: 'plant_pot', label: 'Potted Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_small', label: 'Small Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_dark', label: 'Tall Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_hanging', label: 'Hanging Plant', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'shelf', label: 'Shelf', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'frame', label: 'Framed Picture', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'rug', label: 'Rug', isSolidByDefault: false, width: 1, height: 1 },

  // Storage & cabinets (imported prop sheet)
  { type: 'cabinet_file_low', label: 'Low File Cabinet', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'cabinet_file_tall', label: 'Tall File Cabinet', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_lateral', label: 'Lateral File Cabinet', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'cabinet_file_narrow', label: 'Narrow File Cabinet', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'wardrobe_wood', label: 'Wooden Wardrobe', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'sideboard_wood', label: 'Wooden Sideboard', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'locker_narrow', label: 'Narrow Locker', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_glass', label: 'Display Cabinet', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'bookshelf_wood', label: 'Wooden Bookshelf', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'locker_open', label: 'Open Locker', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_supply_open', label: 'Supply Cupboard', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'wardrobe_steel', label: 'Steel Wardrobe', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_vent', label: 'Ventilated Cabinet', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'rack_server_open', label: 'Open Server Rack', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cart_printer', label: 'Printer Cart', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_cream', label: 'Cream Cabinet', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'cabinet_sink', label: 'Sink Cabinet', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'cabinet_base_wood', label: 'Wooden Base Cabinet', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'locker_quad', label: 'Four-Door Locker', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'shelf_binders_tall', label: 'Binder Shelf (Grey)', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'pedestal_drawers', label: 'Drawer Pedestal', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'cabinet_file_open', label: 'Open File Cabinet', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'shelf_binders_beige', label: 'Binder Shelf (Beige)', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_tall_light', label: 'Tall Light Cabinet', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'cabinet_antique', label: 'Antique Cabinet', isSolidByDefault: true, width: 1, height: 2 },

  // Plants & decor (imported prop sheet)
  { type: 'plant_succulent', label: 'Succulent', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_ficus', label: 'Ficus Tree', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'plant_snake', label: 'Snake Plant', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'plant_lily', label: 'Peace Lily', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'plant_hanging_macrame', label: 'Macrame Hanging Plant', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'plant_cactus', label: 'Potted Cactus', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_fern', label: 'Fern', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_bonsai', label: 'Bonsai', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_hydrangea', label: 'Hydrangea', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'plant_palm', label: 'Palm', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'plant_grass', label: 'Grass Planter', isSolidByDefault: true, width: 1, height: 2 },
  { type: 'plant_pothos_crate', label: 'Pothos Crate', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'art_abstract', label: 'Abstract Framed Art', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'art_landscape', label: 'Landscape Framed Art', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'clock_wall', label: 'Wall Clock', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'sculpture_gold', label: 'Gold Sculpture', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'vase_blue', label: 'Blue Vase', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'globe', label: 'Globe', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'calendar_desk', label: 'Desk Calendar', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'trophy_gold', label: 'Gold Trophy', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'certificate', label: 'Framed Certificate', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'corkboard', label: 'Corkboard', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'books_stack', label: 'Book Stack', isSolidByDefault: false, width: 1, height: 1 },
  { type: 'lamp_table', label: 'Table Lamp', isSolidByDefault: false, width: 1, height: 1 },

  // Sofas & lounge (imported prop sheet)
  { type: 'sofa_black_leather', label: 'Black Leather Loveseat', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_tan_three', label: 'Tan Three-Seat Sofa', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_gray', label: 'Grey Loveseat', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_brown_leather', label: 'Brown Leather Sofa', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_blue', label: 'Blue Sofa', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_chesterfield', label: 'Green Chesterfield', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_sectional_cream', label: 'Cream Sectional', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_dark_gray', label: 'Charcoal Sofa', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_cream_round', label: 'Cream Round Sofa', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_bench_beige', label: 'Beige Bench Seat', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'sofa_navy', label: 'Navy Loveseat', isSolidByDefault: true, width: 2, height: 1 },
  { type: 'ottoman_navy', label: 'Navy Ottoman', isSolidByDefault: true, width: 1, height: 1 },
  { type: 'sofa_tan_tufted', label: 'Tufted Tan Sofa', isSolidByDefault: true, width: 2, height: 1 },
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
  'cabinet_file_low',
  'cabinet_file_tall',
  'cabinet_lateral',
  'cabinet_file_narrow',
  'wardrobe_wood',
  'sideboard_wood',
  'locker_narrow',
  'cabinet_glass',
  'bookshelf_wood',
  'locker_open',
  'cabinet_supply_open',
  'wardrobe_steel',
  'cabinet_vent',
  'rack_server_open',
  'cart_printer',
  'cabinet_cream',
  'cabinet_sink',
  'cabinet_base_wood',
  'locker_quad',
  'shelf_binders_tall',
  'pedestal_drawers',
  'cabinet_file_open',
  'shelf_binders_beige',
  'cabinet_tall_light',
  'cabinet_antique',
  'plant_succulent',
  'plant_ficus',
  'plant_snake',
  'plant_lily',
  'plant_hanging_macrame',
  'plant_cactus',
  'plant_fern',
  'plant_bonsai',
  'plant_hydrangea',
  'plant_palm',
  'plant_grass',
  'plant_pothos_crate',
  'art_abstract',
  'art_landscape',
  'clock_wall',
  'sculpture_gold',
  'vase_blue',
  'globe',
  'calendar_desk',
  'trophy_gold',
  'certificate',
  'corkboard',
  'books_stack',
  'lamp_table',
  'sofa_black_leather',
  'sofa_tan_three',
  'sofa_gray',
  'sofa_brown_leather',
  'sofa_blue',
  'sofa_chesterfield',
  'sofa_sectional_cream',
  'sofa_dark_gray',
  'sofa_cream_round',
  'sofa_bench_beige',
  'sofa_navy',
  'ottoman_navy',
  'sofa_tan_tufted',
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
  sofa_lounge: 'sofa_tan_three',
  server_rack: 'rack_server_open',
};
