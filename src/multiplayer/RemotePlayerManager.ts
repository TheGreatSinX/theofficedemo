/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type Phaser from 'phaser';
import { PlayerNetState } from './protocol';
import { Direction, AvatarConfig } from '../types/game';

interface RemotePlayerEntity {
  userId: string;
  displayName: string;
  role: 'admin' | 'employee';
  avatarConfig: AvatarConfig;
  sprite: Phaser.Physics.Arcade.Sprite;
  nameTag: Phaser.GameObjects.Container;
  targetX: number;
  targetY: number;
  direction: Direction;
  isMoving: boolean;
  lastUpdate: number;
}

export class RemotePlayerManager {
  private scene: Phaser.Scene;
  private localUserId: string;
  private remotePlayers: Map<string, RemotePlayerEntity> = new Map();
  private registerSpritesheetFn: (key: string, config: AvatarConfig) => void;
  private applySpriteMetricsFn?: (sprite: Phaser.Physics.Arcade.Sprite, config: AvatarConfig) => void;
  private staticWallsGroup?: Phaser.Physics.Arcade.StaticGroup;
  /** Uniform scale applied to avatar sprites (tileSize / 32). */
  private tileScale: number = 1;

  // Snap threshold: if remote player jumps more than 120px, snap instead of lerping
  public static readonly SNAP_DISTANCE_THRESHOLD = 120;
  // Interpolation smoothing factor (0.15 - 0.25 gives very smooth 60fps motion for 20Hz ticks)
  public static readonly LERP_FACTOR = 0.22;
  /** Base depth band for Y-sorted entities (keeps sprites above tile layers). */
  public static readonly ENTITY_DEPTH_BASE = 2000;

  constructor(
    scene: Phaser.Scene,
    localUserId: string,
    registerSpritesheetFn: (key: string, config: AvatarConfig) => void,
    staticWallsGroup?: Phaser.Physics.Arcade.StaticGroup,
    tileScale: number = 1,
    applySpriteMetricsFn?: (sprite: Phaser.Physics.Arcade.Sprite, config: AvatarConfig) => void
  ) {
    this.scene = scene;
    this.localUserId = localUserId;
    this.registerSpritesheetFn = registerSpritesheetFn;
    this.staticWallsGroup = staticWallsGroup;
    this.tileScale = tileScale;
    this.applySpriteMetricsFn = applySpriteMetricsFn;
  }

  /** Updates the avatar scale (called when the active map's tile size changes). */
  public setTileScale(scale: number): void {
    this.tileScale = scale;
    for (const entity of this.remotePlayers.values()) {
      this.applySpriteMetrics(entity.sprite, entity.avatarConfig);
    }
  }

  private applySpriteMetrics(sprite: Phaser.Physics.Arcade.Sprite, config?: AvatarConfig): void {
    if (this.applySpriteMetricsFn && config) {
      this.applySpriteMetricsFn(sprite, config);
      return;
    }
    sprite.setScale(this.tileScale);
    sprite.setSize(18 * this.tileScale, 12 * this.tileScale);
    sprite.setOffset(7 * this.tileScale, 20 * this.tileScale);
  }

  public setLocalUserId(id: string) {
    this.localUserId = id;
    // Ensure local user is not tracked as remote
    if (this.remotePlayers.has(id)) {
      this.removePlayer(id);
    }
  }

  public getPlayerCount(): number {
    return this.remotePlayers.size;
  }

  public hasPlayer(userId: string): boolean {
    return this.remotePlayers.has(userId);
  }

  public getPlayerSprite(userId: string): Phaser.Physics.Arcade.Sprite | undefined {
    return this.remotePlayers.get(userId)?.sprite;
  }

  public spawnOrUpdatePlayer(playerState: PlayerNetState): void {
    // Crucial: Local player must NEVER be rendered as a remote player
    if (playerState.userId === this.localUserId) {
      return;
    }

    const existing = this.remotePlayers.get(playerState.userId);
    if (existing) {
      // Update target positions for smooth interpolation
      existing.targetX = playerState.x;
      existing.targetY = playerState.y;
      existing.direction = playerState.direction;
      existing.isMoving = playerState.isMoving;
      existing.lastUpdate = Date.now();
      return;
    }

    // Register avatar texture
    const textureKey = `avatar_remote_${playerState.userId}`;
    this.registerSpritesheetFn(textureKey, playerState.avatarConfig);

    const sprite = this.scene.physics.add.sprite(playerState.x, playerState.y, textureKey);
    this.applySpriteMetrics(sprite, playerState.avatarConfig);
    sprite.setDepth(RemotePlayerManager.ENTITY_DEPTH_BASE + playerState.y + 0.25);

    const idleKey = `${textureKey}_idle_${playerState.direction}`;
    if (this.scene.anims.exists(idleKey)) {
      sprite.play(idleKey);
    }

    // Ragnarok Online hover nameplate below sprite
    const nameTag = this.createRagnarokNameplate(
      sprite,
      playerState.displayName,
      playerState.role === 'admin' ? '#a855f7' : '#10b981'
    );

    const entity: RemotePlayerEntity = {
      userId: playerState.userId,
      displayName: playerState.displayName,
      role: playerState.role,
      avatarConfig: playerState.avatarConfig,
      sprite,
      nameTag,
      targetX: playerState.x,
      targetY: playerState.y,
      direction: playerState.direction,
      isMoving: playerState.isMoving,
      lastUpdate: Date.now(),
    };

    this.remotePlayers.set(playerState.userId, entity);
  }

  public updatePlayerState(
    userId: string,
    x: number,
    y: number,
    direction: Direction,
    isMoving: boolean
  ): void {
    if (userId === this.localUserId) return;

    const entity = this.remotePlayers.get(userId);
    if (!entity) return;

    entity.targetX = x;
    entity.targetY = y;
    entity.direction = direction;
    entity.isMoving = isMoving;
    entity.lastUpdate = Date.now();
  }

  public removePlayer(userId: string): void {
    const entity = this.remotePlayers.get(userId);
    if (!entity) return;

    if (entity.nameTag) {
      entity.nameTag.destroy();
    }
    if (entity.sprite) {
      entity.sprite.destroy();
    }

    this.remotePlayers.delete(userId);
  }

  /**
   * Called every frame from Phaser scene update loop
   * Smoothly interpolates remote character positions and animations
   */
  public update(_time: number, _delta: number): void {
    for (const entity of this.remotePlayers.values()) {
      const { sprite, nameTag, targetX, targetY, direction, isMoving } = entity;
      if (!sprite || !sprite.active) continue;

      const dx = targetX - sprite.x;
      const dy = targetY - sprite.y;
      const dist = Math.hypot(dx, dy);

      if (dist > RemotePlayerManager.SNAP_DISTANCE_THRESHOLD) {
        // Hard snap on large delta (teleport / warp)
        sprite.setPosition(targetX, targetY);
      } else if (dist > 0.5) {
        // Smooth lerp interpolation
        sprite.x += dx * RemotePlayerManager.LERP_FACTOR;
        sprite.y += dy * RemotePlayerManager.LERP_FACTOR;
      } else {
        sprite.setPosition(targetX, targetY);
      }

      // Dynamic depth sorting based on Y position
      sprite.setDepth(RemotePlayerManager.ENTITY_DEPTH_BASE + sprite.y + 0.25);

      // Update animations
      const textureKey = `avatar_remote_${entity.userId}`;
      const animKey = isMoving || dist > 1.5
        ? `${textureKey}_walk_${direction}`
        : `${textureKey}_idle_${direction}`;

      if (
        this.scene.anims.exists(animKey) &&
        sprite.anims.currentAnim?.key !== animKey
      ) {
        sprite.play(animKey, true);
      }

      // Follow sprite with Ragnarok nameplate
      if (nameTag && nameTag.active) {
        nameTag.setPosition(sprite.x, sprite.y + 20);
        nameTag.setDepth(sprite.depth + 10);
      }
    }
  }

  private createRagnarokNameplate(
    sprite: Phaser.Physics.Arcade.Sprite,
    displayName: string,
    accentColor: string
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(sprite.x, sprite.y + 20);
    container.setDepth(998);
    container.setVisible(false); // Hidden by default (Ragnarok Online discipline!)

    const paddingX = 6;
    const paddingY = 2;

    const nameText = this.scene.add
      .text(0, 0, displayName, {
        fontSize: '16px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: 2,
      })
      .setScale(0.5)
      .setOrigin(0.5);

    const bounds = nameText.getBounds();
    const bgW = Math.max(bounds.width + paddingX * 2, 28);
    const bgH = Math.max(bounds.height + paddingY * 2, 14);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x090d16, 0.9);
    const colorInt = parseInt(accentColor.replace('#', ''), 16) || 0x10b981;
    bg.lineStyle(1, colorInt, 0.9);
    bg.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 3);
    bg.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 3);

    container.add([bg, nameText]);

    // Enable hover detection on character sprite
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerover', () => {
      container.setVisible(true);
    });
    sprite.on('pointerout', () => {
      container.setVisible(false);
    });
    sprite.on('pointerdown', () => {
      container.setVisible(true);
    });

    return container;
  }

  public clearAll(): void {
    for (const id of Array.from(this.remotePlayers.keys())) {
      this.removePlayer(id);
    }
    this.remotePlayers.clear();
  }
}
