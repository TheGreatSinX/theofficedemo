/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Direction } from '../types/game';

export interface AuthoritativeMapBounds {
  width: number; // in tiles
  height: number;
  tileSize: number;
  solidMask?: boolean[][];
}

export interface MovementValidationResult {
  valid: boolean;
  correctX: number;
  correctY: number;
  reason?: string;
}

export class MovementAuthority {
  // Maximum allowed player speed in px/sec (base 135 * sprint 1.55 * buff 1.4 + margin for latency = 380 px/sec)
  public static readonly MAX_ALLOWABLE_SPEED_PX_PER_SEC = 380;
  // Maximum position leap allowed in a single frame/tick (allow up to 60px to absorb small network jitter bursts)
  public static readonly MAX_TICK_LEAP_PX = 75;
  // Rate limit: max allowed move_intent messages per second
  public static readonly MAX_UPDATES_PER_SECOND = 35;

  private messageTimestamps: Map<string, number[]> = new Map();

  /**
   * Rate limits incoming movement messages to prevent flood/denial of service.
   */
  public checkRateLimit(userId: string, now: number = Date.now()): boolean {
    let timestamps = this.messageTimestamps.get(userId);
    if (!timestamps) {
      timestamps = [];
      this.messageTimestamps.set(userId, timestamps);
    }

    // Keep only timestamps within the last 1000ms
    const windowStart = now - 1000;
    timestamps = timestamps.filter((t) => t > windowStart);
    timestamps.push(now);
    this.messageTimestamps.set(userId, timestamps);

    return timestamps.length <= MovementAuthority.MAX_UPDATES_PER_SECOND;
  }

  public cleanupUser(userId: string) {
    this.messageTimestamps.delete(userId);
  }

  /**
   * Validates movement intent against previous position, delta time, map boundaries, and solid collision mask.
   */
  public validateMovement(
    currentX: number,
    currentY: number,
    targetX: number,
    targetY: number,
    dtSeconds: number,
    mapBounds: AuthoritativeMapBounds
  ): MovementValidationResult {
    // 1. Check for NaN or non-finite numbers
    if (
      !Number.isFinite(targetX) ||
      !Number.isFinite(targetY) ||
      isNaN(targetX) ||
      isNaN(targetY)
    ) {
      return {
        valid: false,
        correctX: currentX,
        correctY: currentY,
        reason: 'Coordinates contain NaN or non-finite values',
      };
    }

    // 2. Map boundary bounds check (margin scales with the map's tile size)
    const margin = Math.max(4, mapBounds.tileSize / 2);
    const minX = margin;
    const minY = margin;
    const maxX = mapBounds.width * mapBounds.tileSize - margin;
    const maxY = mapBounds.height * mapBounds.tileSize - margin;

    if (targetX < minX || targetX > maxX || targetY < minY || targetY > maxY) {
      const clampedX = Math.max(minX, Math.min(maxX, targetX));
      const clampedY = Math.max(minY, Math.min(maxY, targetY));
      return {
        valid: false,
        correctX: clampedX,
        correctY: clampedY,
        reason: 'Movement exceeds map boundaries',
      };
    }

    // 3. Speed & distance check
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    const distance = Math.hypot(dx, dy);

    // If practically still, valid
    if (distance < 0.01) {
      return { valid: true, correctX: targetX, correctY: targetY };
    }

    const effectiveDt = Math.max(0.02, Math.min(dtSeconds, 1.0));
    const maxAllowedDist =
      MovementAuthority.MAX_ALLOWABLE_SPEED_PX_PER_SEC * effectiveDt +
      MovementAuthority.MAX_TICK_LEAP_PX;

    if (distance > maxAllowedDist) {
      // Possible speed hack or desync leap
      return {
        valid: false,
        correctX: currentX,
        correctY: currentY,
        reason: `Exceeded maximum allowable movement speed (${Math.round(distance)}px > ${Math.round(maxAllowedDist)}px)`,
      };
    }

    // 4. Solid collision check (if solidMask is present)
    if (mapBounds.solidMask) {
      const targetTileX = Math.floor(targetX / mapBounds.tileSize);
      const targetTileY = Math.floor(targetY / mapBounds.tileSize);

      if (
        targetTileY >= 0 &&
        targetTileY < mapBounds.solidMask.length &&
        targetTileX >= 0 &&
        targetTileX < (mapBounds.solidMask[targetTileY]?.length || 0)
      ) {
        if (mapBounds.solidMask[targetTileY][targetTileX]) {
          // Blocked by solid tile!
          return {
            valid: false,
            correctX: currentX,
            correctY: currentY,
            reason: `Attempted to move into blocked collision tile (${targetTileX}, ${targetTileY})`,
          };
        }
      }
    }

    // Passed all validation checks
    return {
      valid: true,
      correctX: targetX,
      correctY: targetY,
    };
  }
}
