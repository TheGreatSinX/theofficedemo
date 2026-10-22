/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Default NPC cast.
 *
 * The ambient characters wear the hand-drawn office cast sheets
 * (`src/assets/npc`). Each entry places one character on a map; NPCs reuse
 * the player sprite pipeline, so they can also point at a sheet imported
 * through the Studio asset library (`{ kind: 'asset', assetId }`) or at a
 * procedural avatar.
 *
 * Waypoints are tile coordinates; the NPC walks the route in order and loops
 * back to the start. Tiles are chosen to stay clear of desks, plants and
 * other solid objects.
 */

import { NpcDefinition } from './npcTypes';

export const NPC_CATALOG: NpcDefinition[] = [
  {
    id: 'npc_field_captain',
    name: 'Navy Cap',
    title: 'Floor Captain',
    mapId: 'main_office',
    x: 3,
    y: 3,
    direction: 'right',
    sheet: { kind: 'preset', id: 'npc_captain' },
    waypoints: [{ x: 13, y: 3, pauseMs: 1200 }],
    speed: 55,
    lines: [
      'Quiet on the floor right now — enjoy it while it lasts.',
      'If the boardroom Wi-Fi drops, it is not me.',
    ],
  },
  {
    id: 'npc_field_hoodie',
    name: 'Hoodie',
    title: 'Breakroom Regular',
    mapId: 'main_office',
    x: 17,
    y: 4,
    direction: 'right',
    sheet: { kind: 'preset', id: 'npc_amber' },
    // L-shaped loop: every segment (including the one back to the start)
    // stays axis aligned, so the sprite always faces a direction the sheet
    // has art for.
    waypoints: [
      { x: 22, y: 4, pauseMs: 600 },
      { x: 22, y: 7, pauseMs: 2000 },
      { x: 17, y: 7, pauseMs: 600 },
    ],
    speed: 45,
    lines: [
      'Third coffee today. Do not judge me.',
      'The vending machine on floor 2 owes me a snack.',
    ],
  },
  {
    id: 'npc_field_lilac',
    name: 'Lilac Sweater',
    title: 'Studio Lead',
    mapId: 'boardroom_wing',
    x: 4,
    y: 9,
    direction: 'right',
    sheet: { kind: 'preset', id: 'npc_lilac' },
    waypoints: [{ x: 12, y: 9, pauseMs: 1000 }],
    speed: 60,
    lines: [
      'Sprint review moved to 3 PM — the room is booked.',
      'Good news: the timeline is still green.',
    ],
  },
  {
    id: 'npc_field_ochre',
    name: 'Ochre Coat',
    title: 'Site Coordinator',
    mapId: 'rooftop_garden',
    x: 5,
    y: 9,
    direction: 'right',
    sheet: { kind: 'preset', id: 'npc_ochre' },
    waypoints: [{ x: 12, y: 9, pauseMs: 2500 }],
    speed: 50,
    lines: [
      'Best signal on the whole floor is up here.',
      'Do not lean over the railing, seriously.',
    ],
  },
  {
    id: 'npc_field_sand',
    name: 'Sand Jacket',
    title: 'Field Technician',
    mapId: 'main_office',
    x: 16,
    y: 6,
    direction: 'down',
    sheet: { kind: 'preset', id: 'npc_sand' },
    waypoints: [{ x: 16, y: 12, pauseMs: 800 }],
    speed: 70,
    lines: [
      'Rack 4 is making noise again. It is fine.',
      'If the badge reader beeps, wave — it always does.',
    ],
  },
];

/** NPCs that live on a given map. */
export function npcsForMap(mapId: string, catalog: NpcDefinition[] = NPC_CATALOG): NpcDefinition[] {
  return catalog.filter((npc) => npc.mapId === mapId);
}
