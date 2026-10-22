/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NPC movement math (pure functions — no Phaser, no DOM).
 *
 * Keeping the pathing logic here makes the patrol behaviour unit testable
 * and lets the same helpers drive other NPC flavours later (chasing,
 * fleeing, queueing at the coffee machine).
 */

import { Direction } from '../../types/game';
import { NpcWaypoint } from './npcTypes';

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Picks the facing direction for a movement delta. The dominant axis wins so
 * a sprite never walks diagonally.
 */
export function directionFromDelta(dx: number, dy: number, fallback: Direction = 'down'): Direction {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fallback;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Next waypoint index; patrol routes loop back to the start. */
export function nextWaypointIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current + 1) % total;
}

/**
 * Moves a point toward a target by `speed` pixels per second.
 * Returns the new position and whether the target was reached.
 */
export function stepToward(
  from: Vec2,
  to: Vec2,
  speed: number,
  deltaMs: number
): { x: number; y: number; arrived: boolean } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.0001) return { x: from.x, y: from.y, arrived: true };

  const travel = (Math.max(0, speed) * Math.max(0, deltaMs)) / 1000;
  if (travel >= distance) return { x: to.x, y: to.y, arrived: true };
  return {
    x: from.x + (dx / distance) * travel,
    y: from.y + (dy / distance) * travel,
    arrived: false,
  };
}

/**
 * Builds the patrol route: the spawn tile first, then the waypoints.
 * A waypoint that sits on the spawn tile is dropped so the NPC does not
 * jitter on the first step.
 */
export function buildRoute(spawn: Vec2, waypoints: NpcWaypoint[] = []): NpcWaypoint[] {
  if (!waypoints || waypoints.length === 0) return [];
  const route: NpcWaypoint[] = [{ x: spawn.x, y: spawn.y }];
  for (const waypoint of waypoints) {
    if (waypoint.x === spawn.x && waypoint.y === spawn.y && route.length === 1) continue;
    route.push({ x: waypoint.x, y: waypoint.y, pauseMs: waypoint.pauseMs });
  }
  return route;
}

/** Picks the next line of an NPC, cycling through the list. */
export function nextLine(lines: string[], index: number): { line: string | null; index: number } {
  if (!lines || lines.length === 0) return { line: null, index: 0 };
  const safeIndex = ((index % lines.length) + lines.length) % lines.length;
  return { line: lines[safeIndex], index: (safeIndex + 1) % lines.length };
}
