/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';
import {
  generateTileTextures,
  generateObjectTextures,
  generateAvatarSpritesheet,
  TILE_SIZE,
} from './pixelArtGenerator';
import {
  OfficeMapData,
  UserProfile,
  InteractionZone,
  Direction,
  AvatarConfig,
  EditorSettings,
  MapObject,
} from '../types/game';
import { sounds } from './soundEffects';
import { RemotePlayerManager } from '../multiplayer/RemotePlayerManager';
import { PlayerNetState } from '../multiplayer/protocol';

export interface SceneCallbacks {
  onZoneChange: (zone: InteractionZone | null) => void;
  onPlayerMove: (pos: { x: number; y: number; tileX: number; tileY: number; mapId: string }) => void;
  onPlayerMoveIntent?: (intent: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    direction: Direction;
    isMoving: boolean;
  }) => void;
  onMapChange: (mapId: string, mapName: string) => void;
  onInteract: (zone: InteractionZone) => void;
  onMapModified?: (newMapData: OfficeMapData) => void;
  onSceneReady?: () => void;
}

interface ActiveSpeechBubble {
  container: Phaser.GameObjects.Container;
  targetSprite: Phaser.Physics.Arcade.Sprite;
  expiresAt: number;
}

interface ActiveReactionBubble {
  container: Phaser.GameObjects.Container;
  targetSprite: Phaser.Physics.Arcade.Sprite;
  userId: string;
  expiresAt: number;
  offsetY: number;
}

export class OfficeScene extends Phaser.Scene {
  private currentMapId: string = 'main_office';
  private mapData!: OfficeMapData;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerNameTag!: Phaser.GameObjects.Container;
  private playerProfile: UserProfile;
  private remotePlayerManager!: RemotePlayerManager;
  private otherUsers: UserProfile[] = [];
  private otherUserSprites: Map<
    string,
    {
      sprite: Phaser.Physics.Arcade.Sprite;
      nameTag: Phaser.GameObjects.Container;
      profile: UserProfile;
    }
  > = new Map();

  // Rendering containers
  private floorImageMap: Map<string, Phaser.GameObjects.Image> = new Map();
  private wallImageMap: Map<string, Phaser.GameObjects.Image> = new Map();
  private objectImageMap: Map<string, Phaser.GameObjects.Image> = new Map();
  private collisionOverlayGraphics!: Phaser.GameObjects.Graphics;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private interactionKeyE!: Phaser.Input.Keyboard.Key;
  private interactionKeySpace!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;

  // Click-to-move destination target
  private clickTargetPos: { x: number; y: number } | null = null;
  private clickIndicatorGraphics?: Phaser.GameObjects.Graphics;

  private staticWallsGroup!: Phaser.Physics.Arcade.StaticGroup;
  private collisionBlocksMap: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private currentNearbyZone: InteractionZone | null = null;
  private callbacks: SceneCallbacks;
  private promptTag!: Phaser.GameObjects.Container;
  private isWarping: boolean = false;
  private lastFootstepTime: number = 0;
  private speedMultiplier: number = 1.0;
  private isControlsEnabled: boolean = true;
  public isReady: boolean = false;

  // Editor mode state
  private isEditorMode: boolean = false;
  private editorSettings: EditorSettings = {
    activeTool: 'brush_floor',
    selectedFloorTile: 0,
    selectedWallTile: 11,
    selectedObjectType: 'desk_single',
    showCollisionOverlay: false,
  };
  private editorHoverBox!: Phaser.GameObjects.Graphics;
  private isPointerDownForPainting: boolean = false;

  // Speech bubbles list
  private activeSpeechBubbles: ActiveSpeechBubble[] = [];
  // Emoji reaction bubbles
  private activeReactionBubbles: Map<string, ActiveReactionBubble> = new Map();

  constructor(
    playerProfile: UserProfile,
    mockUsers: UserProfile[],
    initialMapData: OfficeMapData,
    callbacks: SceneCallbacks
  ) {
    super({ key: 'OfficeScene' });
    this.playerProfile = playerProfile;
    this.otherUsers = mockUsers;
    this.mapData = initialMapData;
    this.currentMapId = initialMapData.id;
    this.callbacks = callbacks;
  }

  init() {
    this.isWarping = false;
    this.currentNearbyZone = null;
    this.isControlsEnabled = true;
    this.clickTargetPos = null;
  }

  preload() {
    // Generate and register tile & object textures
    const tileTextures = generateTileTextures();
    Object.entries(tileTextures).forEach(([key, canvas]) => {
      if (!this.textures.exists(key)) {
        this.textures.addCanvas(key, canvas);
      }
    });

    const objectTextures = generateObjectTextures();
    Object.entries(objectTextures).forEach(([key, canvas]) => {
      if (!this.textures.exists(key)) {
        this.textures.addCanvas(key, canvas);
      }
    });

    // Generate player spritesheet
    this.registerAvatarSpritesheet('player_avatar', this.playerProfile.avatarConfig);

    // Generate mock users spritesheets
    this.otherUsers.forEach((user) => {
      this.registerAvatarSpritesheet(`avatar_${user.id}`, user.avatarConfig);
    });
  }

  private registerAvatarSpritesheet(key: string, config: AvatarConfig) {
    if (!this.textures || !this.anims) return;
    const canvas = generateAvatarSpritesheet(config);

    // If texture already exists as a CanvasTexture, update its 2D context in-place.
    // This immediately updates the texture in WebGL without destroying the underlying
    // frames or corrupting active animation states!
    if (this.textures.exists(key)) {
      const existing = this.textures.get(key) as Phaser.Textures.CanvasTexture;
      if (existing && typeof existing.getContext === 'function') {
        const ctx = existing.getContext();
        ctx.clearRect(0, 0, existing.width, existing.height);
        ctx.drawImage(canvas, 0, 0);
        existing.refresh();
        return;
      }

      // If existing is not an in-place CanvasTexture, remove associated animations before removing texture
      const dirs = ['down', 'left', 'right', 'up'];
      dirs.forEach((dir) => {
        const walkKey = `${key}_walk_${dir}`;
        if (this.anims.exists(walkKey)) {
          this.anims.remove(walkKey);
        }
        const idleKey = `${key}_idle_${dir}`;
        if (this.anims.exists(idleKey)) {
          this.anims.remove(idleKey);
        }
      });
      this.textures.remove(key);
    }

    const texture = this.textures.addCanvas(key, canvas);
    if (texture) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          const frameIndex = row * 3 + col;
          texture.add(frameIndex, 0, col * 32, row * 32, 32, 32);
        }
      }
    }

    // Create 4-direction walking and idle animations
    const anims = this.anims;
    const dirs: { name: string; row: number }[] = [
      { name: 'down', row: 0 },
      { name: 'left', row: 1 },
      { name: 'right', row: 2 },
      { name: 'up', row: 3 },
    ];

    dirs.forEach(({ name, row }) => {
      const animKey = `${key}_walk_${name}`;
      if (anims.exists(animKey)) {
        anims.remove(animKey);
      }
      anims.create({
        key: animKey,
        frames: anims.generateFrameNumbers(key, {
          start: row * 3,
          end: row * 3 + 2,
        }),
        frameRate: 8,
        repeat: -1,
        yoyo: true,
      });

      const idleKey = `${key}_idle_${name}`;
      if (anims.exists(idleKey)) {
        anims.remove(idleKey);
      }
      anims.create({
        key: idleKey,
        frames: [{ key, frame: row * 3 + 1 }],
        frameRate: 1,
      });
    });
  }

  create() {
    // Input setup - Arrow keys & click to move (WASD removed per user request)
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      // CRITICAL: Disable all global browser key captures in Phaser!
      // By default Phaser captures registered keys and calls event.preventDefault() on keydown,
      // which completely breaks typing characters like 'E', Space, or arrows in input fields & chat.
      this.input.keyboard.clearCaptures();
      this.interactionKeyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
      this.interactionKeySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
      this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);

      // Listen for E / Space interaction (with safeguard against active text inputs)
      this.interactionKeyE.on('down', () => this.handleInteractionPress());
      this.interactionKeySpace.on('down', () => this.handleInteractionPress());
    }

    // Build the map
    this.buildMapFromCurrentData();

    // Setup Click to move and Editor pointer events
    this.setupPointerAndEditorEvents();

    // Viewport resize handling
    this.scale.on('resize', this.handleResize, this);

    // Mark scene as ready and notify React
    this.isReady = true;
    if (this.callbacks.onSceneReady) {
      this.callbacks.onSceneReady();
    }
  }

  private handleResize() {
    if (!this.mapData || !this.cameras.main) return;
    const worldWidth = this.mapData.width * TILE_SIZE;
    const worldHeight = this.mapData.height * TILE_SIZE;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
  }

  public setControlsEnabled(enabled: boolean) {
    this.isControlsEnabled = enabled;
    if (this.isReady && !enabled && this.player) {
      this.player.setVelocity(0, 0);
    }
  }

  public setSpeedBoost(active: boolean) {
    this.speedMultiplier = active ? 1.4 : 1.0;
  }

  public setEditorMode(enabled: boolean, settings?: EditorSettings) {
    this.isEditorMode = enabled;
    if (settings) {
      this.editorSettings = { ...settings };
    }
    if (!this.isReady) return;
    if (this.editorHoverBox) {
      this.editorHoverBox.setVisible(enabled);
    }
    this.updateCollisionOverlay();
  }

  public updateEditorSettings(settings: EditorSettings) {
    this.editorSettings = { ...settings };
    if (!this.isReady) return;
    this.updateCollisionOverlay();
  }

  public updatePlayerAvatar(newConfig: AvatarConfig) {
    this.playerProfile.avatarConfig = newConfig;
    if (!this.isReady || !this.textures || !this.anims) return;
    this.registerAvatarSpritesheet('player_avatar', newConfig);
    if (this.player && this.player.active) {
      this.player.setTexture('player_avatar');
      const idleKey = `player_avatar_idle_${this.playerProfile.direction}`;
      if (this.anims.exists(idleKey)) {
        try {
          this.player.play(idleKey, true);
        } catch (err) {
          console.warn('Error playing avatar animation:', err);
        }
      }
    }
  }

  public loadMapData(newMapData: OfficeMapData, spawnTileX?: number, spawnTileY?: number) {
    this.mapData = newMapData;
    this.currentMapId = newMapData.id;
    if (!this.isReady) return;
    this.buildMapFromCurrentData(spawnTileX, spawnTileY);
  }

  public switchMapWithTransition(mapData: OfficeMapData, spawnTileX?: number, spawnTileY?: number) {
    if (this.isWarping) return;
    this.isWarping = true;
    sounds.playDoorWarp();

    this.cameras.main.fade(200, 15, 23, 42, false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) {
        this.loadMapData(mapData, spawnTileX, spawnTileY);
        this.cameras.main.fadeIn(250, 15, 23, 42);
        this.isWarping = false;
      }
    });
  }

  private buildMapFromCurrentData(overrideSpawnX?: number, overrideSpawnY?: number) {
    // Clear existing objects
    if (this.staticWallsGroup) {
      this.staticWallsGroup.clear(true, true);
    }
    this.collisionBlocksMap.clear();
    this.floorImageMap.clear();
    this.wallImageMap.clear();
    this.objectImageMap.clear();
    this.children.removeAll();
    this.otherUserSprites.clear();
    this.activeSpeechBubbles = [];
    this.activeReactionBubbles.forEach((b) => b.container.destroy());
    this.activeReactionBubbles.clear();
    if (this.remotePlayerManager) {
      this.remotePlayerManager.clearAll();
    }

    this.callbacks.onMapChange(this.mapData.id, this.mapData.name);

    const { width, height, tileSize, floorTiles, wallTiles, solidMask, objects } = this.mapData;

    this.staticWallsGroup = this.physics.add.staticGroup();

    // 1. Render Floor Layer
    const floorKeyMap: Record<number, string> = {
      0: 'tile_wood',
      1: 'tile_carpet_blue',
      2: 'tile_gray',
      3: 'tile_checkered',
      4: 'tile_deck',
      5: 'tile_grass',
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileId = floorTiles[y][x];
        const textureKey = floorKeyMap[tileId] || 'tile_wood';
        const img = this.add.image(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, textureKey);
        img.setDepth(0);
        this.floorImageMap.set(`${x},${y}`, img);
      }
    }

    // 2. Render Wall Tiles
    const wallKeyMap: Record<number, string> = {
      10: 'wall_top',
      11: 'wall_face',
      12: 'wall_window',
      13: 'wall_glass',
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wallId = wallTiles[y][x];
        if (wallId > 0) {
          const textureKey = wallKeyMap[wallId] || 'wall_face';
          const wallImg = this.add.image(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, textureKey);
          wallImg.setDepth(10 + y);
          this.wallImageMap.set(`${x},${y}`, wallImg);
        }
      }
    }

    // 3. Render Objects & Furniture
    objects.forEach((obj) => {
      const objImg = this.add.image(
        obj.tileX * tileSize + (obj.width * tileSize) / 2,
        obj.tileY * tileSize + (obj.height * tileSize) / 2,
        obj.type
      );
      objImg.setDepth(15 + obj.tileY);
      this.objectImageMap.set(obj.id, objImg);
    });

    // 4. Create Collision Bodies from solidMask
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (solidMask[y][x]) {
          this.createCollisionBlock(x, y);
        }
      }
    }

    // 5. Collision Overlay Graphic for Editor
    this.collisionOverlayGraphics = this.add.graphics();
    this.collisionOverlayGraphics.setDepth(995);
    this.updateCollisionOverlay();

    // 6. Spawn Player
    const spawnX = (overrideSpawnX !== undefined ? overrideSpawnX : this.mapData.spawnPoint.tileX) * tileSize + tileSize / 2;
    const spawnY = (overrideSpawnY !== undefined ? overrideSpawnY : this.mapData.spawnPoint.tileY) * tileSize + tileSize / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_avatar');
    this.player.setCollideWorldBounds(true);
    this.player.setSize(18, 12);
    this.player.setOffset(7, 20);

    // Ragnarok-style hover nameplate below player sprite
    this.createRagnarokNameplate(this.player, `${this.playerProfile.name} (You)`, '#38bdf8', true);

    this.physics.add.collider(this.player, this.staticWallsGroup);

    // Initialize or reset RemotePlayerManager
    if (!this.remotePlayerManager) {
      this.remotePlayerManager = new RemotePlayerManager(
        this,
        this.playerProfile.id,
        (key, cfg) => this.registerAvatarSpritesheet(key, cfg),
        this.staticWallsGroup
      );
    } else {
      this.remotePlayerManager.setLocalUserId(this.playerProfile.id);
    }

    // 7. Spawn Mock Colleagues
    this.otherUsers
      .filter((u) => u.currentMapId === this.mapData.id)
      .forEach((colleague) => {
        this.spawnColleague(colleague);
      });

    // 8. Setup Camera
    const worldWidth = width * tileSize;
    const worldHeight = height * tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(2.2);

    // 9. Floating Interaction Prompt
    this.createFloatingPrompt();

    // 10. Editor Hover Box
    this.editorHoverBox = this.add.graphics();
    this.editorHoverBox.setDepth(996);
    this.editorHoverBox.setVisible(this.isEditorMode);
  }

  private createCollisionBlock(x: number, y: number) {
    const key = `${x},${y}`;
    if (this.collisionBlocksMap.has(key)) return;

    const block = this.add.rectangle(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE,
      TILE_SIZE
    );
    block.setVisible(false);
    this.physics.add.existing(block, true);
    this.staticWallsGroup.add(block);
    this.collisionBlocksMap.set(key, block);
  }

  private removeCollisionBlock(x: number, y: number) {
    const key = `${x},${y}`;
    const block = this.collisionBlocksMap.get(key);
    if (block) {
      this.staticWallsGroup.remove(block, true, true);
      this.collisionBlocksMap.delete(key);
    }
  }

  private updateCollisionOverlay() {
    if (!this.collisionOverlayGraphics || !this.mapData) return;
    this.collisionOverlayGraphics.clear();

    if (!this.isEditorMode || !this.editorSettings.showCollisionOverlay) {
      return;
    }

    const { width, height, solidMask } = this.mapData;
    this.collisionOverlayGraphics.fillStyle(0xef4444, 0.35);
    this.collisionOverlayGraphics.lineStyle(1, 0xef4444, 0.7);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (solidMask[y][x]) {
          this.collisionOverlayGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          this.collisionOverlayGraphics.strokeRect(x * TILE_SIZE + 0.5, y * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }
      }
    }
  }

  /**
   * Ragnarok Online Inspired Character Nameplate
   * Rendered BELOW character sprite on hover or touch selection with ultra-crisp resolution!
   */
  private createRagnarokNameplate(
    sprite: Phaser.Physics.Arcade.Sprite,
    displayName: string,
    accentColor: string,
    isLocalPlayer: boolean = false
  ): Phaser.GameObjects.Container {
    const container = this.add.container(sprite.x, sprite.y + 20);
    container.setDepth(998);
    container.setVisible(false); // Hidden by default (Ragnarok Online discipline!)

    const paddingX = 6;
    const paddingY = 2;

    const nameText = this.add.text(0, 0, displayName, {
      fontSize: '16px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontStyle: 'bold',
      color: '#ffffff',
      resolution: 2,
    }).setScale(0.5).setOrigin(0.5);

    const bounds = nameText.getBounds();
    const bgW = Math.max(bounds.width + paddingX * 2, 28);
    const bgH = Math.max(bounds.height + paddingY * 2, 14);

    const bg = this.add.graphics();
    bg.fillStyle(0x090d16, 0.9);
    bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(accentColor).color, 0.9);
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

    if (isLocalPlayer) {
      this.playerNameTag = container;
    }

    return container;
  }

  private spawnColleague(user: UserProfile) {
    const key = `avatar_${user.id}`;
    const cx = user.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = user.y * TILE_SIZE + TILE_SIZE / 2;

    const sprite = this.physics.add.sprite(cx, cy, key);
    sprite.setImmovable(true);
    sprite.setSize(18, 12);
    sprite.setOffset(7, 20);
    sprite.setDepth(16 + user.y);
    sprite.play(`${key}_idle_${user.direction}`);

    this.physics.add.collider(this.player, sprite);

    const statusColors: Record<string, string> = {
      online: '#10b981',
      in_meeting: '#8b5cf6',
      busy: '#ef4444',
      coffee_break: '#f59e0b',
    };
    const accent = statusColors[user.status] || '#10b981';

    const nameTag = this.createRagnarokNameplate(sprite, `${user.name} · ${user.title.split(' ')[0]}`, accent, false);
    this.otherUserSprites.set(user.id, { sprite, nameTag, profile: user });
  }

  /**
   * Display temporary retro RPG speech bubble above avatar
   */
  public showSpeechBubble(senderId: string, text: string, durationMs: number = 4500) {
    if (!this.isReady) return;
    let targetSprite: Phaser.Physics.Arcade.Sprite | null = null;

    if (senderId === this.playerProfile.id || senderId === 'current_user') {
      targetSprite = this.player;
    } else {
      const entry = this.otherUserSprites.get(senderId);
      if (entry) {
        targetSprite = entry.sprite;
      } else if (this.remotePlayerManager) {
        targetSprite = this.remotePlayerManager.getPlayerSprite(senderId) || null;
      }
    }

    if (!targetSprite) return;

    // Create speech bubble container
    const container = this.add.container(targetSprite.x, targetSprite.y - 36);
    container.setDepth(1100);

    const maxWidth = 160;
    const bubbleText = this.add.text(0, -6, text, {
      fontSize: '16px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontStyle: '500',
      color: '#0f172a',
      resolution: 2,
      wordWrap: { width: (maxWidth - 16) * 2 },
      align: 'center',
    }).setScale(0.5).setOrigin(0.5);

    const bounds = bubbleText.getBounds();
    const w = Math.max(bounds.width + 16, 48);
    const h = Math.max(bounds.height + 12, 22);

    const g = this.add.graphics();
    // Bubble drop shadow
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 - 5 + 1, w, h, 6);
    // Bubble body (crisp white)
    g.fillStyle(0xffffff, 0.98);
    g.lineStyle(1, 0x64748b, 0.6);
    g.fillRoundedRect(-w / 2, -h / 2 - 5, w, h, 6);
    g.strokeRoundedRect(-w / 2, -h / 2 - 5, w, h, 6);

    // Speech bubble tail pointing down to head
    g.fillStyle(0xffffff, 0.98);
    g.beginPath();
    g.moveTo(-4, h / 2 - 5);
    g.lineTo(0, h / 2);
    g.lineTo(4, h / 2 - 5);
    g.closePath();
    g.fill();

    container.add([g, bubbleText]);

    const activeBubble: ActiveSpeechBubble = {
      container,
      targetSprite,
      expiresAt: Date.now() + durationMs,
    };
    this.activeSpeechBubbles.push(activeBubble);

    // Auto fade out
    this.time.delayedCall(durationMs - 400, () => {
      this.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 6,
        duration: 400,
        onComplete: () => {
          container.destroy();
          this.activeSpeechBubbles = this.activeSpeechBubbles.filter((b) => b !== activeBubble);
        },
      });
    });
  }

  /**
   * Display temporary emoji reaction bubble over avatar
   */
  public showReactionBubble(senderId: string, emoji: string, durationMs: number = 3200) {
    if (!this.isReady) return;
    let targetSprite: Phaser.Physics.Arcade.Sprite | null = null;

    if (senderId === this.playerProfile.id || senderId === 'current_user') {
      targetSprite = this.player;
    } else {
      const entry = this.otherUserSprites.get(senderId);
      if (entry) {
        targetSprite = entry.sprite;
      } else if (this.remotePlayerManager) {
        targetSprite = this.remotePlayerManager.getPlayerSprite(senderId) || null;
      }
    }

    if (!targetSprite) return;

    // Audio cue
    sounds.playReactionPop();

    // Clean up any existing reaction bubble for this avatar
    const existing = this.activeReactionBubbles.get(senderId);
    if (existing) {
      existing.container.destroy();
      this.activeReactionBubbles.delete(senderId);
    }

    const container = this.add.container(targetSprite.x, targetSprite.y - 42);
    container.setDepth(1150);
    container.setScale(0.15);
    container.setAlpha(0.2);

    // Graphic bubble circle with tail
    const g = this.add.graphics();
    // Drop shadow
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(1, 2, 20);
    // Bubble body - crisp white with subtle Indigo accent ring
    g.fillStyle(0xffffff, 0.98);
    g.lineStyle(2, 0x6366f1, 0.9);
    g.fillCircle(0, 0, 19);
    g.strokeCircle(0, 0, 19);

    // Bubble pointer nub down to head
    g.beginPath();
    g.moveTo(-4, 16);
    g.lineTo(0, 23);
    g.lineTo(4, 16);
    g.closePath();
    g.fill();
    g.stroke();

    // High-resolution emoji text
    const emojiText = this.add.text(0, -1, emoji, {
      fontSize: '24px',
      fontFamily: "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
      resolution: 2,
      align: 'center',
    }).setOrigin(0.5);

    container.add([g, emojiText]);

    const bubbleData: ActiveReactionBubble = {
      container,
      targetSprite,
      userId: senderId,
      expiresAt: Date.now() + durationMs,
      offsetY: -42,
    };
    this.activeReactionBubbles.set(senderId, bubbleData);

    // Pop-in bounce animation
    this.tweens.add({
      targets: container,
      scale: 1.15,
      alpha: 1,
      duration: 140,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: container,
          scale: 1.0,
          duration: 90,
          ease: 'Sine.easeOut',
        });
      },
    });

    // Gentle float upwards over lifetime
    this.tweens.add({
      targets: bubbleData,
      offsetY: -50,
      duration: durationMs - 400,
      ease: 'Sine.easeOut',
    });

    // Fade out and cleanup
    this.time.delayedCall(durationMs - 400, () => {
      this.tweens.add({
        targets: container,
        alpha: 0,
        scale: 0.4,
        duration: 380,
        ease: 'Sine.easeIn',
        onComplete: () => {
          container.destroy();
          if (this.activeReactionBubbles.get(senderId)?.container === container) {
            this.activeReactionBubbles.delete(senderId);
          }
        },
      });
    });
  }

  private createFloatingPrompt() {
    this.promptTag = this.add.container(0, 0);
    this.promptTag.setDepth(1000);
    this.promptTag.setVisible(false);

    // Compact, refined pill: 84px wide by 18px high
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.lineStyle(1, 0x6366f1, 0.9);
    bg.fillRoundedRect(-42, -9, 84, 18, 3);
    bg.strokeRoundedRect(-42, -9, 84, 18, 3);

    const text = this.add.text(0, 0, 'Press [E] Interact', {
      fontSize: '15px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontStyle: 'bold',
      color: '#c7d2fe',
      resolution: 2,
    }).setScale(0.5).setOrigin(0.5);

    this.promptTag.add([bg, text]);
  }

  private setupPointerAndEditorEvents() {
    this.clickIndicatorGraphics = this.add.graphics();
    this.clickIndicatorGraphics.setDepth(994);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // In editor mode, pointer down edits the map
      if (this.isEditorMode) {
        this.isPointerDownForPainting = true;
        this.applyEditorActionAtPointer(pointer);
        return;
      }

      // Normal gameplay: Click-to-move!
      // Only trigger if controls are enabled and left button clicked
      if (!this.isControlsEnabled || pointer.button !== 0) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clampedX = Phaser.Math.Clamp(worldPoint.x, 16, this.mapData.width * TILE_SIZE - 16);
      const clampedY = Phaser.Math.Clamp(worldPoint.y, 16, this.mapData.height * TILE_SIZE - 16);

      this.clickTargetPos = { x: clampedX, y: clampedY };
      this.drawClickTargetIndicator(clampedX, clampedY);
    });

    this.input.on('pointerup', () => {
      this.isPointerDownForPainting = false;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isEditorMode || !this.mapData) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(worldPoint.x / TILE_SIZE);
      const ty = Math.floor(worldPoint.y / TILE_SIZE);

      if (tx >= 0 && tx < this.mapData.width && ty >= 0 && ty < this.mapData.height) {
        this.editorHoverBox.clear();
        this.editorHoverBox.lineStyle(1, 0xfacc15, 0.9);
        this.editorHoverBox.strokeRect(tx * TILE_SIZE + 0.5, ty * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

        if (this.isPointerDownForPainting) {
          this.applyEditorActionAtPointer(pointer);
        }
      }
    });
  }

  private drawClickTargetIndicator(x: number, y: number) {
    if (!this.clickIndicatorGraphics) return;
    this.clickIndicatorGraphics.clear();
    this.clickIndicatorGraphics.lineStyle(1.5, 0x38bdf8, 0.9);
    this.clickIndicatorGraphics.strokeCircle(x, y, 7);
    this.clickIndicatorGraphics.fillStyle(0x38bdf8, 0.35);
    this.clickIndicatorGraphics.fillCircle(x, y, 3);

    // Fade out effect
    this.tweens.add({
      targets: this.clickIndicatorGraphics,
      alpha: 0,
      duration: 750,
      onComplete: () => {
        if (this.clickIndicatorGraphics) {
          this.clickIndicatorGraphics.clear();
          this.clickIndicatorGraphics.setAlpha(1);
        }
      },
    });
  }

  private applyEditorActionAtPointer(pointer: Phaser.Input.Pointer) {
    if (!this.isEditorMode || !this.mapData) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(worldPoint.x / TILE_SIZE);
    const ty = Math.floor(worldPoint.y / TILE_SIZE);

    if (tx < 0 || tx >= this.mapData.width || ty < 0 || ty >= this.mapData.height) return;

    const tool = this.editorSettings.activeTool;
    let modified = false;

    if (tool === 'brush_floor') {
      const tileId = this.editorSettings.selectedFloorTile;
      if (this.mapData.floorTiles[ty][tx] !== tileId) {
        this.mapData.floorTiles[ty][tx] = tileId;
        const floorKeyMap: Record<number, string> = {
          0: 'tile_wood',
          1: 'tile_carpet_blue',
          2: 'tile_gray',
          3: 'tile_checkered',
          4: 'tile_deck',
          5: 'tile_grass',
        };
        const key = floorKeyMap[tileId] || 'tile_wood';
        const img = this.floorImageMap.get(`${tx},${ty}`);
        if (img) {
          img.setTexture(key);
        }
        modified = true;
      }
    } else if (tool === 'brush_wall') {
      const wallId = this.editorSettings.selectedWallTile;
      if (this.mapData.wallTiles[ty][tx] !== wallId) {
        this.mapData.wallTiles[ty][tx] = wallId;
        const wallKeyMap: Record<number, string> = {
          10: 'wall_top',
          11: 'wall_face',
          12: 'wall_window',
          13: 'wall_glass',
        };
        const key = wallKeyMap[wallId] || 'wall_face';
        let img = this.wallImageMap.get(`${tx},${ty}`);
        if (!img) {
          img = this.add.image(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, key);
          img.setDepth(10 + ty);
          this.wallImageMap.set(`${tx},${ty}`, img);
        } else {
          img.setTexture(key);
        }
        // Auto mark wall as solid
        this.mapData.solidMask[ty][tx] = true;
        this.createCollisionBlock(tx, ty);
        this.updateCollisionOverlay();
        modified = true;
      }
    } else if (tool === 'erase_tile') {
      if (this.mapData.wallTiles[ty][tx] > 0) {
        this.mapData.wallTiles[ty][tx] = 0;
        const img = this.wallImageMap.get(`${tx},${ty}`);
        if (img) {
          img.destroy();
          this.wallImageMap.delete(`${tx},${ty}`);
        }
        this.mapData.solidMask[ty][tx] = false;
        this.removeCollisionBlock(tx, ty);
        this.updateCollisionOverlay();
        modified = true;
      }
    } else if (tool === 'place_object') {
      const objType = this.editorSettings.selectedObjectType;
      const objId = `obj_${tx}_${ty}_${Date.now()}`;
      // Remove any existing object on this tile
      this.removeObjectAt(tx, ty);

      const newObj: MapObject = {
        id: objId,
        type: objType,
        tileX: tx,
        tileY: ty,
        width: 1,
        height: 1,
        isSolid: objType !== 'chair_office' && objType !== 'door_warp',
      };
      this.mapData.objects.push(newObj);

      const img = this.add.image(
        tx * TILE_SIZE + TILE_SIZE / 2,
        ty * TILE_SIZE + TILE_SIZE / 2,
        objType
      );
      img.setDepth(15 + ty);
      this.objectImageMap.set(objId, img);

      if (newObj.isSolid) {
        this.mapData.solidMask[ty][tx] = true;
        this.createCollisionBlock(tx, ty);
        this.updateCollisionOverlay();
      }
      modified = true;
    } else if (tool === 'delete_object') {
      modified = this.removeObjectAt(tx, ty);
    } else if (tool === 'toggle_collision') {
      const currentState = this.mapData.solidMask[ty][tx];
      this.mapData.solidMask[ty][tx] = !currentState;
      if (!currentState) {
        this.createCollisionBlock(tx, ty);
      } else {
        this.removeCollisionBlock(tx, ty);
      }
      this.updateCollisionOverlay();
      modified = true;
    }

    if (modified && this.callbacks.onMapModified) {
      this.callbacks.onMapModified({ ...this.mapData });
    }
  }

  private removeObjectAt(tx: number, ty: number): boolean {
    const idx = this.mapData.objects.findIndex((o) => o.tileX === tx && o.tileY === ty);
    if (idx !== -1) {
      const obj = this.mapData.objects[idx];
      this.mapData.objects.splice(idx, 1);
      const img = this.objectImageMap.get(obj.id);
      if (img) {
        img.destroy();
        this.objectImageMap.delete(obj.id);
      }
      if (obj.isSolid) {
        this.mapData.solidMask[ty][tx] = false;
        this.removeCollisionBlock(tx, ty);
        this.updateCollisionOverlay();
      }
      return true;
    }
    return false;
  }

  private handleInteractionPress() {
    // Crucial: Check if an input, textarea, or contenteditable is focused
    const activeEl = document.activeElement as HTMLElement | null;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        (activeEl.closest && activeEl.closest('input, textarea, [contenteditable="true"]')))
    ) {
      return;
    }
    if (!this.isControlsEnabled) return;

    if (this.currentNearbyZone) {
      if (this.currentNearbyZone.type === 'door_warp' && this.currentNearbyZone.warpTarget) {
        const { mapId, spawnTileX, spawnTileY } = this.currentNearbyZone.warpTarget;
        this.callbacks.onZoneChange(null);
        this.callbacks.onInteract(this.currentNearbyZone);
      } else {
        sounds.playInteract();
        this.callbacks.onInteract(this.currentNearbyZone);
      }
    }
  }

  update(time: number, delta: number) {
    if (!this.player || this.isWarping) return;

    // Frame-rate independent movement calculation:
    // Base speed in pixels per second:
    const baseSpeed = 135 * this.speedMultiplier;
    const isShiftDown =
      this.isControlsEnabled &&
      ((this.cursors.shift && this.cursors.shift.isDown) ||
        (this.shiftKey && this.shiftKey.isDown));
    const speed = isShiftDown ? baseSpeed * 1.55 : baseSpeed;

    let vx = 0;
    let vy = 0;
    let newDir: Direction = this.playerProfile.direction;

    // Check if an input element in DOM is currently focused
    const activeEl = document.activeElement as HTMLElement | null;
    const isInputActive =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        (activeEl.closest && activeEl.closest('input, textarea, [contenteditable="true"]')));

    const controlsAllowed = this.isControlsEnabled && !isInputActive;

    // Arrow keys movement
    const arrowLeft = controlsAllowed && this.cursors.left.isDown;
    const arrowRight = controlsAllowed && this.cursors.right.isDown;
    const arrowUp = controlsAllowed && this.cursors.up.isDown;
    const arrowDown = controlsAllowed && this.cursors.down.isDown;

    const isKeyboardMoving = arrowLeft || arrowRight || arrowUp || arrowDown;

    if (isKeyboardMoving) {
      // Keyboard input overrides active click-to-move destination
      this.clickTargetPos = null;

      if (arrowLeft) {
        vx = -speed;
        newDir = 'left';
      } else if (arrowRight) {
        vx = speed;
        newDir = 'right';
      }

      if (arrowUp) {
        vy = -speed;
        newDir = 'up';
      } else if (arrowDown) {
        vy = speed;
        newDir = 'down';
      }

      // Normalized diagonal speed
      if (vx !== 0 && vy !== 0) {
        vx *= 0.70710678;
        vy *= 0.70710678;
      }
    } else if (controlsAllowed && this.clickTargetPos) {
      // Click-to-move path interpolation
      const dx = this.clickTargetPos.x - this.player.x;
      const dy = this.clickTargetPos.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 3) {
        // Arrived at destination
        this.clickTargetPos = null;
        vx = 0;
        vy = 0;
      } else {
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;

        if (Math.abs(dx) > Math.abs(dy)) {
          newDir = dx > 0 ? 'right' : 'left';
        } else {
          newDir = dy > 0 ? 'down' : 'up';
        }
      }
    }

    this.player.setVelocity(vx, vy);

    const isMoving = vx !== 0 || vy !== 0;

    // Dynamic depth sorting for player
    this.player.setDepth(16 + Math.floor(this.player.y / TILE_SIZE));

    // Animation cycle
    const animKey = isMoving
      ? `player_avatar_walk_${newDir}`
      : `player_avatar_idle_${newDir}`;

    if (this.player.anims.currentAnim?.key !== animKey) {
      this.player.play(animKey, true);
    }

    this.playerProfile.direction = newDir;
    this.playerProfile.isMoving = isMoving;

    // Footstep audio
    if (isMoving) {
      const stepInterval = isShiftDown ? 180 : 280;
      if (time - this.lastFootstepTime > stepInterval) {
        sounds.playFootstep();
        this.lastFootstepTime = time;
      }
    }

    // Follow player with Ragnarok nameplate
    if (this.playerNameTag) {
      this.playerNameTag.setPosition(this.player.x, this.player.y + 20);
      this.playerNameTag.setDepth(this.player.depth + 10);
    }

    // Follow target sprites for active speech bubbles
    this.activeSpeechBubbles.forEach((bubble) => {
      if (bubble.targetSprite && bubble.container) {
        bubble.container.setPosition(bubble.targetSprite.x, bubble.targetSprite.y - 36);
        bubble.container.setDepth(bubble.targetSprite.depth + 50);
      }
    });

    // Follow target sprites for active emoji reaction bubbles
    this.activeReactionBubbles.forEach((bubble) => {
      if (bubble.targetSprite && bubble.container && bubble.container.active) {
        bubble.container.setPosition(bubble.targetSprite.x, bubble.targetSprite.y + bubble.offsetY);
        bubble.container.setDepth(bubble.targetSprite.depth + 60);
      }
    });

    // Update remote players with smooth interpolation
    if (this.remotePlayerManager) {
      this.remotePlayerManager.update(time, delta);
    }

    // Emit movement intent to multiplayer networking
    if (this.callbacks.onPlayerMoveIntent) {
      this.callbacks.onPlayerMoveIntent({
        x: this.player.x,
        y: this.player.y,
        vx,
        vy,
        direction: newDir,
        isMoving,
      });
    }

    // Emit movement to React
    const currentTileX = Math.floor(this.player.x / TILE_SIZE);
    const currentTileY = Math.floor(this.player.y / TILE_SIZE);
    this.callbacks.onPlayerMove({
      x: this.player.x,
      y: this.player.y,
      tileX: currentTileX,
      tileY: currentTileY,
      mapId: this.currentMapId,
    });

    // Proximity to interaction zones (5-pixel activation)
    this.checkZoneProximity(this.player.x, this.player.y);

    // Mock colleague autonomous animation
    this.updateMockColleagues(time);
  }

  public syncRemoteSnapshot(players: PlayerNetState[]) {
    if (!this.remotePlayerManager) return;
    players.forEach((p) => this.remotePlayerManager.spawnOrUpdatePlayer(p));
  }

  public handleRemotePlayerJoined(player: PlayerNetState) {
    if (!this.remotePlayerManager) return;
    this.remotePlayerManager.spawnOrUpdatePlayer(player);
  }

  public handleRemotePlayerLeft(userId: string) {
    if (!this.remotePlayerManager) return;
    this.remotePlayerManager.removePlayer(userId);
  }

  public handleRemotePlayerStates(
    states: Array<{
      userId: string;
      x: number;
      y: number;
      direction: Direction;
      isMoving: boolean;
    }>
  ) {
    if (!this.remotePlayerManager) return;
    states.forEach((s) =>
      this.remotePlayerManager.updatePlayerState(s.userId, s.x, s.y, s.direction, s.isMoving)
    );
  }

  public handleServerCorrection(correctX: number, correctY: number) {
    if (this.player) {
      this.player.setPosition(correctX, correctY);
    }
  }

  public updateLocalPlayerProfile(profile: UserProfile) {
    this.playerProfile = profile;
    if (this.remotePlayerManager) {
      this.remotePlayerManager.setLocalUserId(profile.id);
    }
    this.updatePlayerAvatar(profile.avatarConfig);
  }

  /**
   * Activates when the player's bounding box is within 5 pixels of the zone rectangle.
   */
  private checkZoneProximity(playerWorldX: number, playerWorldY: number) {
    if (!this.mapData) return;

    // Player bounding box (offset 7, 20 with size 18, 12 centered around player.x, player.y)
    // Left: playerWorldX - 9, Right: playerWorldX + 9, Top: playerWorldY + 4, Bottom: playerWorldY + 16
    const pLeft = playerWorldX - 9;
    const pRight = playerWorldX + 9;
    const pTop = playerWorldY + 4;
    const pBottom = playerWorldY + 16;

    let closestZone: InteractionZone | null = null;
    let minDistance = 5.0; // Activated when 5 pixels away

    for (const zone of this.mapData.interactionZones) {
      const zLeft = zone.tileX * TILE_SIZE;
      const zRight = (zone.tileX + zone.width) * TILE_SIZE;
      const zTop = zone.tileY * TILE_SIZE;
      const zBottom = (zone.tileY + zone.height) * TILE_SIZE;

      // Distance from player box to zone box:
      const dx = Math.max(0, Math.max(zLeft - pRight, pLeft - zRight));
      const dy = Math.max(0, Math.max(zTop - pBottom, pTop - zBottom));
      const dist = Math.hypot(dx, dy);

      if (dist <= 5.0 && dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }
    }

    if (closestZone !== this.currentNearbyZone) {
      this.currentNearbyZone = closestZone;
      this.callbacks.onZoneChange(closestZone);

      if (closestZone) {
        this.promptTag.setVisible(true);
        const targetWorldX = (closestZone.tileX + closestZone.width / 2) * TILE_SIZE;
        const targetWorldY = closestZone.tileY * TILE_SIZE - 12;
        this.promptTag.setPosition(targetWorldX, targetWorldY);

        const textObj = this.promptTag.list[1] as Phaser.GameObjects.Text;
        if (textObj) {
          textObj.setText(closestZone.prompt || 'Press [E] Interact');
        }
      } else {
        this.promptTag.setVisible(false);
      }
    }
  }

  private updateMockColleagues(time: number) {
    const liamEntry = this.otherUserSprites.get('user_liam');
    if (liamEntry) {
      const cycle = Math.floor(time / 3000) % 2;
      const targetDir = cycle === 0 ? 'left' : 'down';
      if (liamEntry.sprite.anims.currentAnim?.key !== `avatar_user_liam_idle_${targetDir}`) {
        liamEntry.sprite.play(`avatar_user_liam_idle_${targetDir}`);
      }
    }
  }
}
