/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Character ids (DOM free, so the rules can be unit tested).
 */

/** Ids of the bundled roster characters (see `characterPresets.ts`). */
export const ROSTER_CHARACTER_IDS = [
  'office_worker',
  'soc_analyst',
  'consultant',
  'project_manager',
  'devops_engineer',
  'field_engineer',
  'office_admin',
] as const;

export type RosterCharacterId = (typeof ROSTER_CHARACTER_IDS)[number];

/** Ids of the office cast sheets used by NPCs and bots (see `npcSprites.ts`). */
export const NPC_CHARACTER_IDS = [
  'npc_captain',
  'npc_poppy',
  'npc_amber',
  'npc_lilac',
  'npc_teal',
  'npc_ochre',
  'npc_silver',
  'npc_curly',
  'npc_beanie',
  'npc_sand',
] as const;

export type NpcCharacterId = (typeof NPC_CHARACTER_IDS)[number];
