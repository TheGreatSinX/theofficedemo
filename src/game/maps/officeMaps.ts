/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OfficeMapData } from '../../types/game';

/**
 * Tile IDs:
 * 0: Floor Wood
 * 1: Floor Blue Carpet
 * 2: Floor Gray Stone
 * 3: Floor Breakroom Checkered
 * 4: Floor Deck Outdoor
 * 5: Floor Grass Garden
 * 10: Wall Top
 * 11: Wall Face
 * 12: Wall Window
 * 13: Wall Glass Partition
 */

// Helper to create 2D array
function createGrid<T>(w: number, h: number, defaultVal: T): T[][] {
  return Array.from({ length: h }, () => Array(w).fill(defaultVal));
}

/**
 * 1. MAIN OPEN OFFICE (24 x 18 tiles)
 */
export function createMainOfficeMap(): OfficeMapData {
  const width = 24;
  const height = 18;
  const tileSize = 32;

  const floorTiles = createGrid<number>(width, height, 0); // wood floor default
  const wallTiles = createGrid<number>(width, height, 0);
  const solidMask = createGrid<boolean>(width, height, false);

  // Set carpet in workspace zones (middle area)
  for (let y = 4; y < 13; y++) {
    for (let x = 3; x < 16; x++) {
      floorTiles[y][x] = 1; // Blue carpet
    }
  }

  // Set checkered floor in kitchen/breakroom (top right x=17..22, y=3..8)
  for (let y = 3; y < 9; y++) {
    for (let x = 17; x < 23; x++) {
      floorTiles[y][x] = 3; // Checkered breakroom
    }
  }

  // Set gray tile in server room (bottom right x=17..22, y=10..16)
  for (let y = 10; y < 17; y++) {
    for (let x = 17; x < 23; x++) {
      floorTiles[y][x] = 2; // Gray tech floor
    }
  }

  // Top perimeter walls
  for (let x = 0; x < width; x++) {
    wallTiles[0][x] = 10; // Wall top
    solidMask[0][x] = true;
    wallTiles[1][x] = (x === 6 || x === 7 || x === 12 || x === 13) ? 12 : 11; // Windows or standard wall
    solidMask[1][x] = true;
  }

  // Bottom, Left, Right perimeter boundaries
  for (let y = 0; y < height; y++) {
    solidMask[y][0] = true;
    wallTiles[y][0] = 11;
    solidMask[y][width - 1] = true;
    wallTiles[y][width - 1] = 11;
  }
  for (let x = 0; x < width; x++) {
    solidMask[height - 1][x] = true;
    wallTiles[height - 1][x] = 11;
  }

  // Interior dividing walls
  // Glass partition separating breakroom (x=16, y=3..8)
  for (let y = 3; y < 7; y++) {
    wallTiles[y][16] = 13; // Glass partition
    solidMask[y][16] = true;
  }
  // Wall separating server room (x=16, y=10..15)
  for (let y = 11; y < 16; y++) {
    wallTiles[y][16] = 11;
    solidMask[y][16] = true;
  }

  // Define objects and solid coordinates
  const objects: OfficeMapData['objects'] = [
    // --- WORKSTATION CLUSTERS (Left & Center) ---
    // Cluster 1 (x=4, y=5 and x=5, y=5)
    { id: 'desk_1', type: 'desk_single', tileX: 4, tileY: 5, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_desk_sarah' },
    { id: 'chair_1', type: 'chair_office', tileX: 4, tileY: 6, width: 1, height: 1, isSolid: false },
    { id: 'desk_2', type: 'desk_dual', tileX: 6, tileY: 5, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_desk_alex' },
    { id: 'chair_2', type: 'chair_office', tileX: 6, tileY: 6, width: 1, height: 1, isSolid: false },

    // Cluster 2 (x=4, y=8 and x=6, y=8)
    { id: 'desk_3', type: 'desk_dual', tileX: 4, tileY: 8, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_desk_liam' },
    { id: 'chair_3', type: 'chair_office', tileX: 4, tileY: 9, width: 1, height: 1, isSolid: false },
    { id: 'desk_4', type: 'desk_single', tileX: 6, tileY: 8, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_desk_maya' },
    { id: 'chair_4', type: 'chair_office', tileX: 6, tileY: 9, width: 1, height: 1, isSolid: false },

    // Cluster 3 (x=10, y=5 and x=12, y=5)
    { id: 'desk_5', type: 'desk_single', tileX: 10, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'chair_5', type: 'chair_office', tileX: 10, tileY: 6, width: 1, height: 1, isSolid: false },
    { id: 'desk_6', type: 'desk_dual', tileX: 12, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'chair_6', type: 'chair_office', tileX: 12, tileY: 6, width: 1, height: 1, isSolid: false },

    // Cluster 4 (x=10, y=8 and x=12, y=8)
    { id: 'desk_7', type: 'desk_dual', tileX: 10, tileY: 8, width: 1, height: 1, isSolid: true },
    { id: 'chair_7', type: 'chair_office', tileX: 10, tileY: 9, width: 1, height: 1, isSolid: false },
    { id: 'desk_8', type: 'desk_single', tileX: 12, tileY: 8, width: 1, height: 1, isSolid: true },
    { id: 'chair_8', type: 'chair_office', tileX: 12, tileY: 9, width: 1, height: 1, isSolid: false },

    // Whiteboards & Agile Standup area
    { id: 'wb_main', type: 'whiteboard', tileX: 8, tileY: 2, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_whiteboard' },
    { id: 'plant_1', type: 'plant_monstera', tileX: 2, tileY: 2, width: 1, height: 1, isSolid: true },
    { id: 'plant_2', type: 'plant_monstera', tileX: 14, tileY: 2, width: 1, height: 1, isSolid: true },
    { id: 'plant_3', type: 'plant_monstera', tileX: 2, tileY: 11, width: 1, height: 1, isSolid: true },

    // Phone booths (x=2, y=6..8)
    { id: 'booth_1', type: 'phone_booth', tileX: 2, tileY: 6, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_booth_1' },
    { id: 'booth_2', type: 'phone_booth', tileX: 2, tileY: 8, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_booth_2' },

    // Lounge sofa in open area (x=8, y=14)
    { id: 'sofa_1', type: 'sofa_lounge', tileX: 8, tileY: 14, width: 1, height: 1, isSolid: true },
    { id: 'sofa_2', type: 'sofa_lounge', tileX: 10, tileY: 14, width: 1, height: 1, isSolid: true },

    // --- BREAKROOM (Top Right) ---
    { id: 'coffee_bar', type: 'coffee_machine', tileX: 18, tileY: 2, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_coffee' },
    { id: 'water_dispenser', type: 'water_cooler', tileX: 21, tileY: 2, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_watercooler' },
    { id: 'break_table', type: 'table_conference', tileX: 19, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'break_chair_1', type: 'chair_office', tileX: 19, tileY: 4, width: 1, height: 1, isSolid: false },
    { id: 'break_chair_2', type: 'chair_office', tileX: 19, tileY: 6, width: 1, height: 1, isSolid: false },

    // --- SERVER & DEVOPS ROOM (Bottom Right) ---
    { id: 'server_1', type: 'server_rack', tileX: 18, tileY: 11, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_server' },
    { id: 'server_2', type: 'server_rack', tileX: 20, tileY: 11, width: 1, height: 1, isSolid: true },
    { id: 'server_3', type: 'server_rack', tileX: 22, tileY: 11, width: 1, height: 1, isSolid: true },

    // --- WARP PADS (Room Transitions) ---
    // Warp to Executive Boardroom Wing (Top Doorway at x=15, y=2)
    { id: 'warp_boardroom', type: 'door_warp', tileX: 15, tileY: 2, width: 1, height: 1, isSolid: false, interactionZoneId: 'zone_warp_boardroom' },
    // Warp to Rooftop Terrace (Bottom Doorway at x=4, y=15)
    { id: 'warp_rooftop', type: 'door_warp', tileX: 4, tileY: 15, width: 1, height: 1, isSolid: false, interactionZoneId: 'zone_warp_rooftop' },
  ];

  // Mark solids
  for (const obj of objects) {
    if (obj.isSolid) {
      solidMask[obj.tileY][obj.tileX] = true;
    }
  }

  const interactionZones: OfficeMapData['interactionZones'] = [
    {
      id: 'zone_warp_boardroom',
      name: 'Door to Executive Boardroom',
      type: 'door_warp',
      tileX: 15,
      tileY: 2,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Enter Boardroom Wing',
      warpTarget: {
        mapId: 'boardroom_wing',
        spawnTileX: 9,
        spawnTileY: 11,
      },
    },
    {
      id: 'zone_warp_rooftop',
      name: 'Door to Rooftop Terrace Garden',
      type: 'door_warp',
      tileX: 4,
      tileY: 15,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Step onto Rooftop Garden',
      warpTarget: {
        mapId: 'rooftop_garden',
        spawnTileX: 9,
        spawnTileY: 11,
      },
    },
    {
      id: 'zone_coffee',
      name: 'Espresso Bar',
      type: 'coffee',
      tileX: 18,
      tileY: 3,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Brew Fresh Espresso',
      description: 'Single-origin Ethiopian roast. Gives your avatar a +30% sprint speed boost for 60 seconds!',
    },
    {
      id: 'zone_watercooler',
      name: 'Water Cooler Chat',
      type: 'watercooler',
      tileX: 21,
      tileY: 3,
      width: 1,
      height: 1,
      prompt: 'Press [E] for Water Cooler Icebreaker',
      description: 'Catch up on office gossip and view today’s team icebreaker prompt.',
    },
    {
      id: 'zone_whiteboard',
      name: 'Main Sprint Whiteboard',
      type: 'whiteboard',
      tileX: 8,
      tileY: 3,
      width: 1,
      height: 1,
      prompt: 'Press [E] to View Sprint Board',
      description: 'Sprint 42: "Multiplayer Virtual Office Launch". Review active stickies and agile goals.',
    },
    {
      id: 'zone_booth_1',
      name: 'Focus Pod Alpha',
      type: 'phone_booth',
      tileX: 3,
      tileY: 6,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Enter Focus Pod',
      description: 'Soundproof privacy pod. Sets your status to "Focus / Do Not Disturb".',
    },
    {
      id: 'zone_desk_sarah',
      name: 'Sarah Chen’s Desk',
      type: 'desk',
      tileX: 4,
      tileY: 6,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Inspect Design Desk',
      description: 'Lead Product Designer. Sketchbook open with GatherGrid UI wireframes.',
    },
    {
      id: 'zone_server',
      name: 'Core Server Infrastructure',
      type: 'desk',
      tileX: 18,
      tileY: 12,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Check Server Diagnostics',
      description: 'Kubernetes Cluster Status: All 12 nodes healthy. 99.99% uptime.',
    },
  ];

  return {
    id: 'main_office',
    name: 'Main Open Workspace (Floor 1)',
    version: 1,
    width,
    height,
    tileSize,
    floorTiles,
    wallTiles,
    solidMask,
    objects,
    interactionZones,
    spawnPoint: {
      tileX: 8,
      tileY: 11,
      direction: 'down',
    },
  };
}

/**
 * 2. EXECUTIVE BOARDROOM WING (18 x 14 tiles)
 */
export function createBoardroomMap(): OfficeMapData {
  const width = 18;
  const height = 14;
  const tileSize = 32;

  const floorTiles = createGrid<number>(width, height, 1); // Navy carpet
  const wallTiles = createGrid<number>(width, height, 0);
  const solidMask = createGrid<boolean>(width, height, false);

  // Top perimeter walls
  for (let x = 0; x < width; x++) {
    wallTiles[0][x] = 10;
    solidMask[0][x] = true;
    wallTiles[1][x] = (x >= 4 && x <= 13) ? 12 : 11; // Big skyline windows behind conference table
    solidMask[1][x] = true;
  }

  // Borders
  for (let y = 0; y < height; y++) {
    solidMask[y][0] = true;
    wallTiles[y][0] = 11;
    solidMask[y][width - 1] = true;
    wallTiles[y][width - 1] = 11;
  }
  for (let x = 0; x < width; x++) {
    solidMask[height - 1][x] = true;
    wallTiles[height - 1][x] = 11;
  }

  const objects: OfficeMapData['objects'] = [
    // Grand Conference Table (3 modules wide: x=7..10, y=5..6)
    { id: 'conf_1', type: 'table_conference', tileX: 7, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'conf_2', type: 'table_conference', tileX: 8, tileY: 5, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_meet_boardroom' },
    { id: 'conf_3', type: 'table_conference', tileX: 9, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'conf_4', type: 'table_conference', tileX: 10, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'conf_5', type: 'table_conference', tileX: 7, tileY: 6, width: 1, height: 1, isSolid: true },
    { id: 'conf_6', type: 'table_conference', tileX: 8, tileY: 6, width: 1, height: 1, isSolid: true },
    { id: 'conf_7', type: 'table_conference', tileX: 9, tileY: 6, width: 1, height: 1, isSolid: true },
    { id: 'conf_8', type: 'table_conference', tileX: 10, tileY: 6, width: 1, height: 1, isSolid: true },

    // Conference Chairs around the table
    { id: 'c_t1', type: 'chair_office', tileX: 7, tileY: 4, width: 1, height: 1, isSolid: false },
    { id: 'c_t2', type: 'chair_office', tileX: 8, tileY: 4, width: 1, height: 1, isSolid: false },
    { id: 'c_t3', type: 'chair_office', tileX: 9, tileY: 4, width: 1, height: 1, isSolid: false },
    { id: 'c_t4', type: 'chair_office', tileX: 10, tileY: 4, width: 1, height: 1, isSolid: false },
    { id: 'c_b1', type: 'chair_office', tileX: 7, tileY: 7, width: 1, height: 1, isSolid: false },
    { id: 'c_b2', type: 'chair_office', tileX: 8, tileY: 7, width: 1, height: 1, isSolid: false },
    { id: 'c_b3', type: 'chair_office', tileX: 9, tileY: 7, width: 1, height: 1, isSolid: false },
    { id: 'c_b4', type: 'chair_office', tileX: 10, tileY: 7, width: 1, height: 1, isSolid: false },

    // Big presentation screen / whiteboard on left wall
    { id: 'screen_boardroom', type: 'whiteboard', tileX: 2, tileY: 5, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_presentation_screen' },

    // Plants & decor
    { id: 'p_br1', type: 'plant_monstera', tileX: 2, tileY: 2, width: 1, height: 1, isSolid: true },
    { id: 'p_br2', type: 'plant_monstera', tileX: 15, tileY: 2, width: 1, height: 1, isSolid: true },

    // Refreshments corner
    { id: 'coffee_br', type: 'coffee_machine', tileX: 15, tileY: 5, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_coffee_br' },
    { id: 'water_br', type: 'water_cooler', tileX: 15, tileY: 7, width: 1, height: 1, isSolid: true },

    // Warp Door back to Main Office
    { id: 'warp_exit_main', type: 'door_warp', tileX: 9, tileY: 12, width: 1, height: 1, isSolid: false, interactionZoneId: 'zone_warp_back_main' },
  ];

  for (const obj of objects) {
    if (obj.isSolid) {
      solidMask[obj.tileY][obj.tileX] = true;
    }
  }

  const interactionZones: OfficeMapData['interactionZones'] = [
    {
      id: 'zone_meet_boardroom',
      name: 'Google Meet: Executive Boardroom',
      type: 'meeting_room',
      tileX: 8,
      tileY: 6,
      width: 2,
      height: 2,
      prompt: 'Press [E] to Join Google Meet',
      description: 'Official Boardroom video conference room with audio spatial zone.',
      meetUrl: 'https://meet.google.com/new',
    },
    {
      id: 'zone_presentation_screen',
      name: 'Keynote Projection Screen',
      type: 'whiteboard',
      tileX: 3,
      tileY: 5,
      width: 1,
      height: 1,
      prompt: 'Press [E] to View Slide Deck',
      description: 'Q3 Product Roadmap & Architectural Diagrams.',
    },
    {
      id: 'zone_coffee_br',
      name: 'Executive Nespresso Bar',
      type: 'coffee',
      tileX: 15,
      tileY: 6,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Brew Espresso',
      description: 'Ristretto roast ready for board meetings.',
    },
    {
      id: 'zone_warp_back_main',
      name: 'Exit to Main Workspace',
      type: 'door_warp',
      tileX: 9,
      tileY: 12,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Return to Open Office',
      warpTarget: {
        mapId: 'main_office',
        spawnTileX: 15,
        spawnTileY: 3,
      },
    },
  ];

  return {
    id: 'boardroom_wing',
    name: 'Executive Boardroom Wing (Floor 2)',
    version: 1,
    width,
    height,
    tileSize,
    floorTiles,
    wallTiles,
    solidMask,
    objects,
    interactionZones,
    spawnPoint: {
      tileX: 9,
      tileY: 10,
      direction: 'up',
    },
  };
}

/**
 * 3. ROOFTOP GARDEN & CAFE (18 x 14 tiles)
 */
export function createRooftopMap(): OfficeMapData {
  const width = 18;
  const height = 14;
  const tileSize = 32;

  const floorTiles = createGrid<number>(width, height, 4); // Teak deck default
  const wallTiles = createGrid<number>(width, height, 0);
  const solidMask = createGrid<boolean>(width, height, false);

  // Grass garden area in center (x=4..13, y=3..8)
  for (let y = 3; y < 9; y++) {
    for (let x = 4; x < 14; x++) {
      floorTiles[y][x] = 5; // Lush grass
    }
  }

  // Perimeter glass railing
  for (let x = 0; x < width; x++) {
    wallTiles[0][x] = 13; // glass railing
    solidMask[0][x] = true;
    wallTiles[height - 1][x] = 13;
    solidMask[height - 1][x] = true;
  }
  for (let y = 0; y < height; y++) {
    wallTiles[y][0] = 13;
    solidMask[y][0] = true;
    wallTiles[y][width - 1] = 13;
    solidMask[y][width - 1] = true;
  }

  const objects: OfficeMapData['objects'] = [
    // Lounge couches on the grass
    { id: 'rf_sofa1', type: 'sofa_lounge', tileX: 6, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'rf_sofa2', type: 'sofa_lounge', tileX: 8, tileY: 5, width: 1, height: 1, isSolid: true },
    { id: 'rf_table', type: 'table_conference', tileX: 11, tileY: 5, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_meet_rooftop' },

    // Planters & trees
    { id: 'rf_p1', type: 'plant_monstera', tileX: 3, tileY: 3, width: 1, height: 1, isSolid: true },
    { id: 'rf_p2', type: 'plant_monstera', tileX: 14, tileY: 3, width: 1, height: 1, isSolid: true },
    { id: 'rf_p3', type: 'plant_monstera', tileX: 3, tileY: 8, width: 1, height: 1, isSolid: true },
    { id: 'rf_p4', type: 'plant_monstera', tileX: 14, tileY: 8, width: 1, height: 1, isSolid: true },

    // Rooftop Cold Brew Bar
    { id: 'rf_coffee', type: 'coffee_machine', tileX: 15, tileY: 10, width: 1, height: 1, isSolid: true, interactionZoneId: 'zone_cold_brew' },

    // Warp Door back to Main Office
    { id: 'warp_exit_rf', type: 'door_warp', tileX: 9, tileY: 12, width: 1, height: 1, isSolid: false, interactionZoneId: 'zone_warp_back_from_rf' },
  ];

  for (const obj of objects) {
    if (obj.isSolid) {
      solidMask[obj.tileY][obj.tileX] = true;
    }
  }

  const interactionZones: OfficeMapData['interactionZones'] = [
    {
      id: 'zone_meet_rooftop',
      name: 'Google Meet: Rooftop Casual Table',
      type: 'meeting_room',
      tileX: 11,
      tileY: 5,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Join Outdoor 1-on-1 Meet',
      description: 'Relaxed open-air video link for casual 1-on-1s and coffee syncs.',
      meetUrl: 'https://meet.google.com/new',
    },
    {
      id: 'zone_cold_brew',
      name: 'Iced Cold Brew Tap',
      type: 'coffee',
      tileX: 15,
      tileY: 10,
      width: 1,
      height: 1,
      prompt: 'Press [E] for Nitro Cold Brew',
      description: 'Refreshing cold brew on tap with oat milk options.',
    },
    {
      id: 'zone_warp_back_from_rf',
      name: 'Exit to Main Workspace',
      type: 'door_warp',
      tileX: 9,
      tileY: 12,
      width: 1,
      height: 1,
      prompt: 'Press [E] to Return to Open Office',
      warpTarget: {
        mapId: 'main_office',
        spawnTileX: 4,
        spawnTileY: 14,
      },
    },
  ];

  return {
    id: 'rooftop_garden',
    name: 'Rooftop Garden & Cafe (Terrace)',
    version: 1,
    width,
    height,
    tileSize,
    floorTiles,
    wallTiles,
    solidMask,
    objects,
    interactionZones,
    spawnPoint: {
      tileX: 9,
      tileY: 10,
      direction: 'up',
    },
  };
}

export const OFFICE_MAPS: Record<string, () => OfficeMapData> = {
  main_office: createMainOfficeMap,
  boardroom_wing: createBoardroomMap,
  rooftop_garden: createRooftopMap,
};
