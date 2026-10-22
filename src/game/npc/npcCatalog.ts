/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Default NPC cast.
 *
 * Each entry places one ambient character on a map. NPCs reuse the player
 * sprite pipeline, so they can point at a bundled roster preset, at a sheet
 * imported through the Studio asset library (`{ kind: 'asset', assetId }`) or
 * at a procedural avatar.
 *
 * Waypoints are tile coordinates; the NPC walks the route in order and loops
 * back to the start. Tiles are chosen to stay clear of desks, plants and
 * other solid objects.
 */

import { NpcDefinition } from './npcTypes';

export const NPC_CATALOG: NpcDefinition[] = [
  {
    id: 'npc_riley',
    name: 'Riley Vance',
    title: 'SOC Analyst',
    mapId: 'main_office',
    x: 3,
    y: 3,
    direction: 'right',
    sheet: { kind: 'preset', id: 'soc_analyst' },
    waypoints: [{ x: 13, y: 3, pauseMs: 1200 }],
    speed: 55,
    lines: [
      'Quiet on the logs right now — enjoy it while it lasts.',
      'If the boardroom Wi-Fi drops, it is not me.',
    ],
  },
  {
    id: 'npc_jordan',
    name: 'Jordan Lee',
    title: 'Consultant',
    mapId: 'main_office',
    x: 16,
    y: 6,
    direction: 'down',
    sheet: { kind: 'preset', id: 'consultant' },
    waypoints: [{ x: 16, y: 12, pauseMs: 800 }],
    speed: 70,
    lines: [
      'Client call at 2 — coffee is the only way through those.',
      'I keep the slide deck in the shared drive, promise.',
    ],
  },
  {
    id: 'npc_sam',
    name: 'Sam Rivera',
    title: 'Office Admin',
    mapId: 'main_office',
    x: 17,
    y: 4,
    direction: 'right',
    sheet: { kind: 'preset', id: 'office_admin' },
    waypoints: [{ x: 22, y: 7, pauseMs: 2000 }],
    speed: 45,
    lines: [
      'New badges are on the desk by the water cooler.',
      'Meeting rooms need a quick tidy before the next standup.',
    ],
  },
  {
    id: 'npc_kai',
    name: 'Kai Okafor',
    title: 'DevOps Engineer',
    mapId: 'main_office',
    x: 17,
    y: 12,
    direction: 'up',
    sheet: { kind: 'preset', id: 'devops_engineer' },
    waypoints: [{ x: 21, y: 13, pauseMs: 1500 }],
    speed: 50,
    lines: [
      'The racks are humming, so the deploy went fine.',
      'Ping me before you restart the cluster, please.',
    ],
  },
  {
    id: 'npc_dana',
    name: 'Dana Whitfield',
    title: 'Project Manager',
    mapId: 'boardroom_wing',
    x: 4,
    y: 9,
    direction: 'right',
    sheet: { kind: 'preset', id: 'project_manager' },
    waypoints: [{ x: 12, y: 9, pauseMs: 1000 }],
    speed: 60,
    lines: [
      'Sprint review moved to 3 PM — the room is booked.',
      'Good news: the timeline is still green.',
    ],
  },
  {
    id: 'npc_noor',
    name: 'Noor Haddad',
    title: 'Field Engineer',
    mapId: 'rooftop_garden',
    x: 5,
    y: 9,
    direction: 'right',
    sheet: { kind: 'preset', id: 'field_engineer' },
    waypoints: [{ x: 12, y: 9, pauseMs: 2500 }],
    speed: 50,
    lines: [
      'Best signal on the whole floor is up here.',
      'Do not lean over the railing, seriously.',
    ],
  },
];

/** NPCs that live on a given map. */
export function npcsForMap(mapId: string, catalog: NpcDefinition[] = NPC_CATALOG): NpcDefinition[] {
  return catalog.filter((npc) => npc.mapId === mapId);
}
