/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NPC manager — spawns, animates and drives the ambient cast.
 *
 * The manager owns the sprites, their patrol routes and their nameplates.
 * Sheet binding is delegated to the host scene (see `NpcManagerOptions`)
 * so NPCs go through exactly the same texture/animation pipeline as players:
 * bundled roster presets, imported RPG Maker sheets or procedural avatars.
 */

import Phaser from 'phaser';
import { Direction } from '../../types/game';
import { NPC_DEFAULT_SPEED } from './npcTypes';
import { NpcDefinition, NpcSheetSource } from './npcTypes';
import { buildRoute, directionFromDelta, nextLine, nextWaypointIndex, stepToward } from './npcPathing';

/** A live NPC instance. */
export interface NpcRuntime {
  definition: NpcDefinition;
  sprite: Phaser.Physics.Arcade.Sprite;
  nameTag: Phaser.GameObjects.Container;
  /** Texture key currently bound to the sprite. */
  textureKey: string;
  /** Patrol route in tile coordinates (first entry is the spawn tile). */
  route: NpcDefinition['waypoints'];
  /** Index of the waypoint the NPC is heading to. */
  waypointIndex: number;
  direction: Direction;
  /** Timestamp (ms) until which the NPC stands still at a waypoint. */
  pauseUntil: number;
  /** Index of the next dialogue line. */
  lineIndex: number;
}

export interface NpcManagerOptions {
  /** World size of one tile in pixels. */
  getTileSize: () => number;
  /** Depth base used for Y sorting (shared with the player sprites). */
  depthBase: number;
  /**
   * Registers the sheet for an NPC and returns the texture key that should
   * drive the sprite. `null` keeps the placeholder texture.
   */
  bindSheet: (
    sprite: Phaser.Physics.Arcade.Sprite,
    key: string,
    source: NpcSheetSource,
    direction: Direction
  ) => Promise<string | null>;
  /** Called when the player talks to an NPC. */
  onTalk?: (npc: NpcRuntime, line: string) => void;
}

/** Texture used until the real sheet is bound. */
const PLACEHOLDER_TEXTURE_KEY = 'player_avatar';

export class NpcManager {
  private scene: Phaser.Scene;
  private options: NpcManagerOptions;
  private npcs: Map<string, NpcRuntime> = new Map();

  constructor(scene: Phaser.Scene, options: NpcManagerOptions) {
    this.scene = scene;
    this.options = options;
  }

  /** Removes every NPC (used when the map changes). */
  public clear(): void {
    for (const npc of this.npcs.values()) {
      if (npc.nameTag) npc.nameTag.destroy();
      if (npc.sprite) npc.sprite.destroy();
    }
    this.npcs.clear();
  }

  /** Spawns every NPC that belongs to the given map. */
  public spawnForMap(mapId: string, definitions: NpcDefinition[]): void {
    this.clear();
    for (const definition of definitions) {
      if (definition.mapId !== mapId) continue;
      this.spawn(definition);
    }
  }

  private spawn(definition: NpcDefinition): void {
    const tile = this.options.getTileSize();
    const worldX = definition.x * tile + tile / 2;
    const worldY = definition.y * tile + tile / 2;
    const direction = definition.direction ?? 'down';

    // The placeholder keeps the sprite renderable until the sheet is bound.
    const sprite = this.scene.physics.add.sprite(worldX, worldY, PLACEHOLDER_TEXTURE_KEY);
    sprite.setDepth(this.options.depthBase + worldY + 0.2);

    const nameTag = this.createNameTag(definition);
    const runtime: NpcRuntime = {
      definition,
      sprite,
      nameTag,
      textureKey: PLACEHOLDER_TEXTURE_KEY,
      route: buildRoute({ x: definition.x, y: definition.y }, definition.waypoints),
      waypointIndex: 1,
      direction,
      pauseUntil: 0,
      lineIndex: 0,
    };
    this.npcs.set(definition.id, runtime);

    if (definition.solid) {
      sprite.setImmovable(true);
    }

    if (definition.showNameplate !== false) {
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerover', () => nameTag.setVisible(true));
      sprite.on('pointerout', () => nameTag.setVisible(false));
    }

    void this.bind(runtime);
  }

  private async bind(runtime: NpcRuntime): Promise<void> {
    const key = `npc_${runtime.definition.id}`;
    const bound = await this.options.bindSheet(
      runtime.sprite,
      key,
      runtime.definition.sheet,
      runtime.direction
    );
    if (!bound || !runtime.sprite.active) return;
    runtime.textureKey = bound;
    this.playIdle(runtime);
  }

  /** Advances every NPC: patrol movement, animation and Y sorting. */
  public update(time: number, delta: number): void {
    const tile = this.options.getTileSize();

    for (const runtime of this.npcs.values()) {
      const sprite = runtime.sprite;
      if (!sprite.active) continue;

      if (runtime.route && runtime.route.length > 1) {
        if (time < runtime.pauseUntil) {
          this.playIdle(runtime);
        } else {
          const target = runtime.route[runtime.waypointIndex];
          const targetX = target.x * tile + tile / 2;
          const targetY = target.y * tile + tile / 2;
          const direction = directionFromDelta(
            targetX - sprite.x,
            targetY - sprite.y,
            runtime.direction
          );
          runtime.direction = direction;

          const step = stepToward(
            { x: sprite.x, y: sprite.y },
            { x: targetX, y: targetY },
            runtime.definition.speed ?? NPC_DEFAULT_SPEED,
            delta
          );
          sprite.setPosition(step.x, step.y);

          if (step.arrived) {
            runtime.waypointIndex = nextWaypointIndex(runtime.waypointIndex, runtime.route.length);
            runtime.pauseUntil = time + (target.pauseMs ?? 0);
            this.playIdle(runtime);
          } else {
            this.playWalk(runtime, direction);
          }
        }
      } else {
        this.playIdle(runtime);
      }

      sprite.setDepth(this.options.depthBase + sprite.y + 0.2);
      if (runtime.nameTag) {
        runtime.nameTag.setPosition(sprite.x, sprite.y + 20);
        // Keep the plate above the sprite it belongs to.
        runtime.nameTag.setDepth(sprite.depth + 10);
      }
    }
  }

  private playIdle(runtime: NpcRuntime): void {
    const key = `${runtime.textureKey}_idle_${runtime.direction}`;
    if (this.scene.anims.exists(key) && runtime.sprite.anims.currentAnim?.key !== key) {
      runtime.sprite.play(key, true);
    }
  }

  private playWalk(runtime: NpcRuntime, direction: Direction): void {
    const key = `${runtime.textureKey}_walk_${direction}`;
    if (this.scene.anims.exists(key) && runtime.sprite.anims.currentAnim?.key !== key) {
      runtime.sprite.play(key, true);
    }
  }

  /** The closest NPC within `radiusTiles` of a world position. */
  public findNearby(worldX: number, worldY: number, radiusTiles: number): NpcRuntime | null {
    const limit = radiusTiles * this.options.getTileSize();
    let best: NpcRuntime | null = null;
    let bestDistance = limit;

    for (const runtime of this.npcs.values()) {
      if (!runtime.sprite.active) continue;
      const distance = Phaser.Math.Distance.Between(worldX, worldY, runtime.sprite.x, runtime.sprite.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = runtime;
      }
    }
    return best;
  }

  /** Returns the next dialogue line of an NPC and notifies the host scene. */
  public talk(runtime: NpcRuntime): string | null {
    const result = nextLine(runtime.definition.lines ?? [], runtime.lineIndex);
    runtime.lineIndex = result.index;
    if (!result.line) return null;
    this.options.onTalk?.(runtime, result.line);
    return result.line;
  }

  /** All live NPCs (for debugging and the proximity checks). */
  public list(): NpcRuntime[] {
    return Array.from(this.npcs.values());
  }

  private createNameTag(definition: NpcDefinition): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    container.setDepth(this.options.depthBase + 10);
    container.setVisible(false);

    const label = definition.title ? `${definition.name} · ${definition.title}` : definition.name;
    const text = this.scene.add
      .text(0, 0, label, {
        fontSize: '15px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontStyle: 'bold',
        color: '#e2e8f0',
        resolution: 2,
      })
      .setScale(0.5)
      .setOrigin(0.5);

    const bounds = text.getBounds();
    const width = Math.max(bounds.width + 12, 40);
    const height = Math.max(bounds.height + 8, 18);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0b1120, 0.92);
    bg.lineStyle(1, 0x38bdf8, 0.85);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 3);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 3);

    container.add([bg, text]);
    return container;
  }
}
