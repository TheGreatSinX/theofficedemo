/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Character presets rendered from the hand-drawn office cast sheet.
 *
 * Every bundled spritesheet follows the RPG Maker layout:
 *   3 columns (step-left / idle / step-right) × 4 rows (down / left / right / up).
 *
 * Selecting a preset stores its id in `AvatarConfig.characterId`; the renderer
 * then registers the sheet instead of generating the procedural avatar.
 */

import officeWorkerUrl from '../assets/characters/char_office_worker.png';
import socAnalystUrl from '../assets/characters/char_soc_analyst.png';
import consultantUrl from '../assets/characters/char_consultant.png';
import projectManagerUrl from '../assets/characters/char_project_manager.png';
import devopsEngineerUrl from '../assets/characters/char_devops_engineer.png';
import fieldEngineerUrl from '../assets/characters/char_field_engineer.png';
import officeAdminUrl from '../assets/characters/char_office_admin.png';

export interface CharacterPreset {
  id: string;
  name: string;
  /** Short role blurb shown in the avatar studio. */
  tagline: string;
  /** Bundled spritesheet URL. */
  image: string;
  /** Width of a single frame in the sheet, in pixels. */
  frameWidth: number;
  /** Height of a single frame in the sheet, in pixels. */
  frameHeight: number;
}

/** All exported frames share one canvas size (see `tools` export pipeline). */
export const CHARACTER_FRAME_WIDTH = 97;
export const CHARACTER_FRAME_HEIGHT = 153;

/** Transparent padding baked below the feet when the sheets were exported. */
export const CHARACTER_FEET_MARGIN = 6;

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'office_worker',
    name: 'Office Worker',
    tagline: 'Keeps the floor running',
    image: officeWorkerUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
  {
    id: 'soc_analyst',
    name: 'SOC Analyst',
    tagline: 'Threat hunting & triage',
    image: socAnalystUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
  {
    id: 'consultant',
    name: 'Consultant',
    tagline: 'Client-facing analysis',
    image: consultantUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
  {
    id: 'project_manager',
    name: 'Project Manager',
    tagline: 'Delivery & planning',
    image: projectManagerUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
  {
    id: 'devops_engineer',
    name: 'DevOps Engineer',
    tagline: 'Infra & automation',
    image: devopsEngineerUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
  {
    id: 'field_engineer',
    name: 'Field Engineer',
    tagline: 'On-site systems',
    image: fieldEngineerUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
  {
    id: 'office_admin',
    name: 'Office Admin',
    tagline: 'People & workplace',
    image: officeAdminUrl,
    frameWidth: CHARACTER_FRAME_WIDTH,
    frameHeight: CHARACTER_FRAME_HEIGHT,
  },
];

/** Returns the preset for a stored `characterId`, if it still exists. */
export function getCharacterPreset(id?: string | null): CharacterPreset | undefined {
  if (!id) return undefined;
  return CHARACTER_PRESETS.find((preset) => preset.id === id);
}

/** Phaser texture key under which a preset image is preloaded. */
export { characterPresetTextureKey, avatarSheetTextureKey, DEFAULT_CHARACTER_ID } from './assets/characterKeys';
