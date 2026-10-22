/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The office cast used by NPCs and bots.
 *
 * These sheets come from a horizontal AI-generated cast sheet (ten characters,
 * twelve frames per character) that is imported by the `npccast` action of
 * `raw-assets/import/`. Every character is stored as a regular 3×4 RPG Maker
 * sheet (down / left / right / up, step / idle / step) so the renderer can
 * treat them exactly like the bundled roster presets.
 */

import { CharacterPreset } from '../characterPresets';
import { NpcCharacterId } from '../assets/characterIds';
import amberUrl from '../../assets/npc/char_npc_amber.png';
import beanieUrl from '../../assets/npc/char_npc_beanie.png';
import captainUrl from '../../assets/npc/char_npc_captain.png';
import curlyUrl from '../../assets/npc/char_npc_curly.png';
import lilacUrl from '../../assets/npc/char_npc_lilac.png';
import ochreUrl from '../../assets/npc/char_npc_ochre.png';
import poppyUrl from '../../assets/npc/char_npc_poppy.png';
import sandUrl from '../../assets/npc/char_npc_sand.png';
import silverUrl from '../../assets/npc/char_npc_silver.png';
import tealUrl from '../../assets/npc/char_npc_teal.png';

/** A cast sheet; the id is restricted to the known office cast. */
export interface NpcSheet extends CharacterPreset {
  id: NpcCharacterId;
}

export const NPC_SHEETS: NpcSheet[] = [
  {
    id: 'npc_captain',
    name: 'Navy Cap',
    tagline: 'Keeps the floor running',
    image: captainUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_poppy',
    name: 'Ponytail',
    tagline: 'Runs the standup',
    image: poppyUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_amber',
    name: 'Hoodie',
    tagline: 'Always on a break',
    image: amberUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_lilac',
    name: 'Lilac Sweater',
    tagline: 'Quiet until standup',
    image: lilacUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_teal',
    name: 'Teal Jacket',
    tagline: 'Deep in the logs',
    image: tealUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_ochre',
    name: 'Ochre Coat',
    tagline: 'Knows every shortcut',
    image: ochreUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_silver',
    name: 'Silver Hair',
    tagline: 'Seen it all',
    image: silverUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_curly',
    name: 'Curly & Glasses',
    tagline: 'Reads the docs',
    image: curlyUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_beanie',
    name: 'Red Beanie',
    tagline: 'Ships on Fridays',
    image: beanieUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
  {
    id: 'npc_sand',
    name: 'Sand Jacket',
    tagline: 'On the roof again',
    image: sandUrl,
    frameWidth: 97,
    frameHeight: 153,
  },
];

/** Returns the cast sheet for an id, if it exists. */
export function getNpcSheet(id?: string | null): NpcSheet | undefined {
  if (!id) return undefined;
  return NPC_SHEETS.find((sheet) => sheet.id === id);
}
