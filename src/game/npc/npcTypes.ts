/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NPC (non-player character) model.
 *
 * NPCs are the ambient cast of the office: they stand or patrol the floor,
 * use the same sprite pipeline as players (bundled roster presets, imported
 * RPG Maker sheets or a procedural avatar) and can be talked to.
 *
 * Everything in this folder is map-agnostic: a definition says *what* an NPC
 * is, the manager in `NpcManager.ts` decides how it is drawn and animated.
 */

import { AvatarConfig, Direction } from '../../types/game';

/** Where an NPC gets its sprites from. */
export type NpcSheetSource =
  /** One of the bundled roster characters (`characterPresets.ts`). */
  | { kind: 'preset'; id: string }
  /** A character sheet imported through the Studio asset library. */
  | { kind: 'asset'; assetId: string; characterIndex?: number }
  /** A procedurally generated 32×32 avatar. */
  | { kind: 'procedural'; avatar: AvatarConfig };

/** A point on an NPC patrol route, in tile coordinates. */
export interface NpcWaypoint {
  x: number;
  y: number;
  /** Optional pause at this waypoint, in milliseconds. */
  pauseMs?: number;
}

export interface NpcDefinition {
  /** Stable id (used for the texture key and the chat sender id). */
  id: string;
  name: string;
  title?: string;
  /** Map the NPC lives on. */
  mapId: string;
  /** Spawn tile. */
  x: number;
  y: number;
  /** Facing direction at spawn. */
  direction?: Direction;
  /** Sprite source. */
  sheet: NpcSheetSource;
  /**
   * Patrol route in tile coordinates. The NPC walks the route in order and
   * loops back to the first waypoint. An empty route keeps the NPC in place.
   */
  waypoints?: NpcWaypoint[];
  /** Movement speed in pixels per second (default 60). */
  speed?: number;
  /** Lines the NPC says when the player talks to it. */
  lines?: string[];
  /** Show a nameplate on hover (default true). */
  showNameplate?: boolean;
  /** Block the player's path (default false). */
  solid?: boolean;
}

/** Default NPC movement speed in pixels per second. */
export const NPC_DEFAULT_SPEED = 60;

/** Default radius (in tiles) at which the player can talk to an NPC. */
export const NPC_TALK_RADIUS_TILES = 1.75;
