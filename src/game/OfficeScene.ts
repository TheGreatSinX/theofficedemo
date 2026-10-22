/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * OfficeScene — the shared Phaser renderer for World Mode (gameplay) and
 * Studio Mode (map editing).
 *
 * Rendering model (schema v2):
 *  - Ground tile layers are batched into chunked canvas textures.
 *  - Row tile layers (walls) become Y-sorted sprites.
 *  - Objects and avatars are Y-sorted sprites above the tile layers.
 *  - Imported RPG Maker MZ assets are resolved through the asset registry;
 *    builtin procedural textures remain the fallback for legacy tile IDs.
 */

import Phaser from 'phaser';
import {
  generateTileTextures,
  generateObjectTextures,
  generateAvatarSpritesheet,
} from './pixelArtGenerator';
import {
  OfficeMapData,
  UserProfile,
  InteractionZone,
  Direction,
  AvatarConfig,
  MapObject,
  MapLayerData,
} from '../types/game';
import { sounds } from './soundEffects';
import { chatService } from '../services/ChatService';
import {
  CHARACTER_FEET_MARGIN,
  CHARACTER_PRESETS,
  DEFAULT_CHARACTER_ID as DEFAULT_AVATAR_CHARACTER_ID,
  avatarSheetTextureKey,
  characterPresetTextureKey,
  getCharacterPreset,
} from './characterPresets';
import type { CharacterPreset } from './characterPresets';
import { RemotePlayerManager } from '../multiplayer/RemotePlayerManager';
import { PlayerNetState } from '../multiplayer/protocol';
import { assetRegistry } from '../services/AssetRegistry';
import { OBJECT_SPRITES, getObjectSprite, objectSpriteTextureKey } from './objectSprites';
import { FLOOR_ART, floorArtTextureKey } from './floorArt';
import {
  CustomCharacterSheet,
  resolveCustomCharacterSheet,
} from './assets/customCharacterSheets';
import {
  NPC_CATALOG,
  NPC_SHEETS,
  NPC_TALK_RADIUS_TILES,
  NpcManager,
  NpcRuntime,
  NpcSheetSource,
  getNpcSheet,
} from './npc';
import {
  BUILTIN_TEXTURE_KEY_BY_TILE_ID,
  BUILTIN_OBJECT_FOOTPRINTS,
  findTilesetForTile,
  getCollisionLayer,
  getCollisionMask,
  getDefaultSpawn,
  getTileLayers,
  getSpawnPoints,
  isBuiltinTileId,
} from './maps/mapSchema';
import {
  applyCommand,
  CellChange,
  EditCommand,
} from './edits';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type StudioTool = 'select' | 'pan' | 'paint' | 'erase' | 'object' | 'collision' | 'spawn';

export type StudioObjectRef =
  | { kind: 'builtin'; type: string }
  | { kind: 'asset'; assetId: string; frame: number; widthTiles: number; heightTiles: number };

export interface StudioEditorSettings {
  activeTool: StudioTool;
  activeLayerId: string | null;
  selectedTileId: number;
  paintCollisionWithWalls: boolean;
  selectedObject: StudioObjectRef | null;
  brushSize: number;
  showGrid: boolean;
  showCollision: boolean;
  showZones: boolean;
  zoom: number;
}

export const DEFAULT_STUDIO_SETTINGS: StudioEditorSettings = {
  activeTool: 'paint',
  activeLayerId: null,
  selectedTileId: 0,
  paintCollisionWithWalls: true,
  selectedObject: { kind: 'builtin', type: 'desk_single' },
  brushSize: 1,
  showGrid: false,
  showCollision: false,
  showZones: true,
  zoom: 2,
};

export type StudioSelection =
  | { kind: 'object'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'spawn'; id: string }
  | null;

export interface WeatherVisualState {
  isRaining: boolean;
  lightning: boolean;
  condition: string;
}

export interface WeatherEffectFlags {
  rainEffectsEnabled: boolean;
  lightingEffectsEnabled: boolean;
  windowEffectsEnabled: boolean;
}

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
  onEditTransaction?: (commands: EditCommand[]) => void;
  onSelectionChange?: (selection: StudioSelection) => void;
  onCursorMove?: (tileX: number, tileY: number, inside: boolean) => void;
  onZoomChange?: (zoom: number) => void;
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

interface DragState {
  active: boolean;
  kind: 'object' | 'zone' | 'spawn' | null;
  id: string | null;
  offsetX: number;
  offsetY: number;
  ghostX: number;
  ghostY: number;
  moved: boolean;
}

const ZONE_COLORS: Record<string, number> = {
  meeting_room: 0x8b5cf6,
  coffee: 0xf59e0b,
  watercooler: 0x38bdf8,
  whiteboard: 0xec4899,
  desk: 0x94a3b8,
  door_warp: 0x22c55e,
  phone_booth: 0x06b6d4,
};

/**
 * A baked block of ground tiles.
 *
 * Phaser 4's RenderTexture does not reliably persist `draw()` output, so each
 * chunk is composed into an offscreen 2D canvas and uploaded as a canvas
 * texture instead. This also keeps the bake resolution-independent and lets the
 * ground use imported PNG tiles at their native pixel size.
 */
interface TerrainChunk {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: Phaser.Textures.CanvasTexture;
  image: Phaser.GameObjects.Image;
}

export class OfficeScene extends Phaser.Scene {
  private currentMapId: string = 'main_office';
  private mapData!: OfficeMapData;
  private tileSize: number = 32;
  private tileScale: number = 1;

  private player!: Phaser.Physics.Arcade.Sprite;
  private playerNameTag!: Phaser.GameObjects.Container;
  /** Texture key that currently drives the player sprite. */
  private playerAvatarKey: string = 'player_avatar';
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

  /** Ambient cast (see `src/game/npc`). */
  private npcManager!: NpcManager;
  private currentNearbyNpc: NpcRuntime | null = null;

  // Rendering containers
  private terrainChunks: Map<string, TerrainChunk> = new Map();
  private rowLayerImages: Map<string, Phaser.GameObjects.Image> = new Map();
  private objectImageMap: Map<string, Phaser.GameObjects.Image> = new Map();
  private dirtyChunks: Set<string> = new Set();

  // Overlays
  private collisionOverlayGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private boundsGraphics!: Phaser.GameObjects.Graphics;
  private zoneGraphics!: Phaser.GameObjects.Graphics;
  private spawnMarkerMap: Map<string, Phaser.GameObjects.Container> = new Map();
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private windowRainGraphics?: Phaser.GameObjects.Graphics;

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

  // Studio state
  private isStudioMode: boolean = false;
  private studioSettings: StudioEditorSettings = { ...DEFAULT_STUDIO_SETTINGS };
  private studioSelection: StudioSelection = null;
  private isPointerDownForEditing: boolean = false;
  private strokeIsErasing: boolean = false;
  private dragState: DragState = {
    active: false,
    kind: null,
    id: null,
    offsetX: 0,
    offsetY: 0,
    ghostX: 0,
    ghostY: 0,
    moved: false,
  };

  // Stroke buffers (flushed into a single undo transaction on pointerup)
  private pendingTileChanges: Map<string, Array<CellChange<number>>> = new Map();
  private pendingCollisionChanges: Array<CellChange<boolean>> = [];
  private pendingObjectCommands: EditCommand[] = [];
  private pendingZoneCommands: EditCommand[] = [];
  private pendingSpawnCommands: EditCommand[] = [];
  private isPanning: boolean = false;
  private panPointerStart: { x: number; y: number; scrollX: number; scrollY: number } = {
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
  };
  private lastCursorTile: { x: number; y: number } | null = null;

  // Weather
  private weatherState: WeatherVisualState | null = null;
  private weatherFlags: WeatherEffectFlags = {
    rainEffectsEnabled: true,
    lightingEffectsEnabled: true,
    windowEffectsEnabled: true,
  };
  private rainEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private lightningTimer: Phaser.Time.TimerEvent | null = null;

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

    this.registerPlaceholderTextures();

    // Preload the hand-drawn character cast so avatar sheets can be sliced
    // synchronously when create() runs (after this loader completes).
    CHARACTER_PRESETS.forEach((preset) => {
      const presetKey = characterPresetTextureKey(preset.id);
      if (!this.textures.exists(presetKey)) {
        this.load.image(presetKey, preset.image);
      }
    });

    // The office cast used by NPCs and bots is preloaded the same way.
    NPC_SHEETS.forEach((sheet) => {
      const sheetKey = characterPresetTextureKey(sheet.id);
      if (!this.textures.exists(sheetKey)) {
        this.load.image(sheetKey, sheet.image);
      }
    });

    // Hand-drawn office equipment.
    OBJECT_SPRITES.forEach((sprite) => {
      const spriteKey = objectSpriteTextureKey(sprite.id);
      if (!this.textures.exists(spriteKey)) {
        this.load.image(spriteKey, sprite.image);
      }
    });

    // Hand-drawn floor tiles (procedural textures stay as the fallback).
    FLOOR_ART.forEach((art) => {
      if (!this.textures.exists(art.textureKey)) {
        this.load.image(art.textureKey, art.image);
      }
    });
  }

  private registerPlaceholderTextures() {
    if (!this.textures.exists('tile_missing')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillRect(16, 16, 16, 16);
      this.textures.addCanvas('tile_missing', canvas);
    }
    if (!this.textures.exists('obj_missing')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(239,68,68,0.85)';
      ctx.fillRect(4, 4, 24, 24);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(5, 5, 22, 22);
      this.textures.addCanvas('obj_missing', canvas);
    }
    if (!this.textures.exists('weather_rain_drop')) {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 10;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 10);
      gradient.addColorStop(0, 'rgba(186,230,253,0)');
      gradient.addColorStop(1, 'rgba(125,211,252,0.9)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2, 10);
      this.textures.addCanvas('weather_rain_drop', canvas);
    }
  }

  /**
   * Removes the walk/idle animations of a texture key. Only safe when no
   * sprite is playing them — avatar sheets now live under stable keys, so
   * this is only used for cleanup.
   */
  private removeAvatarAnimations(key: string) {
    const dirs = ['down', 'left', 'right', 'up'];
    dirs.forEach((dir) => {
      const walkKey = `${key}_walk_${dir}`;
      if (this.anims.exists(walkKey)) this.anims.remove(walkKey);
      const idleKey = `${key}_idle_${dir}`;
      if (this.anims.exists(idleKey)) this.anims.remove(idleKey);
    });
  }

  private createAvatarAnimations(key: string) {
    const anims = this.anims;
    const dirs: { name: string; row: number }[] = [
      { name: 'down', row: 0 },
      { name: 'left', row: 1 },
      { name: 'right', row: 2 },
      { name: 'up', row: 3 },
    ];

    dirs.forEach(({ name, row }) => {
      const animKey = `${key}_walk_${name}`;
      if (anims.exists(animKey)) anims.remove(animKey);
      anims.create({
        key: animKey,
        frames: anims.generateFrameNumbers(key, { start: row * 3, end: row * 3 + 2 }),
        frameRate: 8,
        repeat: -1,
        yoyo: true,
      });

      const idleKey = `${key}_idle_${name}`;
      if (anims.exists(idleKey)) anims.remove(idleKey);
      anims.create({ key: idleKey, frames: [{ key, frame: row * 3 + 1 }], frameRate: 1 });
    });
  }

  /**
   * Registers a hand-drawn preset sheet: an image texture sliced into the
   * RPG Maker frame grid. Returns the texture key that drives the sprite, or
   * null when the source image is not loaded so the caller can fall back to
   * the procedural avatar.
   *
   * The texture key is derived from the preset id, so switching between
   * characters never destroys a texture that a live sprite still uses — a
   * removed texture leaves the sprite with a dead frame and the WebGL
   * renderer throws ("reading 'resolution' of null") and the scene goes
   * black.
   */
  private registerPresetSpritesheet(key: string, preset: CharacterPreset): string | null {
    const presetKey = characterPresetTextureKey(preset.id);
    if (!this.textures.exists(presetKey)) return null;
    const source = this.textures.get(presetKey).getSourceImage();
    if (!source) return null;

    const sheetKey = avatarSheetTextureKey(key, preset.id);

    if (!this.textures.exists(sheetKey)) {
      const texture = this.textures.addImage(sheetKey, source as HTMLImageElement);
      if (!texture) return null;

      // The cast art is high resolution shown far below native size. Linear
      // filtering keeps the downscale soft instead of shimmering like nearest.
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

      const { frameWidth, frameHeight } = preset;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          texture.add(row * 3 + col, 0, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
        }
      }
    }

    // Animations are created once per sheet: the frames never change, so
    // re-creating them would tear down an animation a sprite is playing.
    if (!this.anims.exists(`${sheetKey}_walk_down`)) {
      this.createAvatarAnimations(sheetKey);
    }
    return sheetKey;
  }

  /**
   * Registers the sheet for an avatar and returns the texture key that
   * drives the sprite (a preset/cast sheet key, or the procedural canvas
   * key). Never destroys a texture a live sprite may still reference.
   */
  private registerAvatarSpritesheet(key: string, config: AvatarConfig): string {
    if (!this.textures || !this.anims) return key;

    const preset = this.resolveCharacterSheet(config.characterId);
    if (preset) {
      const sheetKey = this.registerPresetSpritesheet(key, preset);
      if (sheetKey) return sheetKey;
    }

    // Placeholder pixel sprites are opt-in: without an explicit choice the
    // avatar falls back to a hand-drawn character sheet.
    if (!config.useProceduralAvatar) {
      const fallback = this.resolveCharacterSheet(DEFAULT_AVATAR_CHARACTER_ID);
      if (fallback) {
        const sheetKey = this.registerPresetSpritesheet(key, fallback);
        if (sheetKey) return sheetKey;
      }
    }

    const canvas = generateAvatarSpritesheet(config);

    if (this.textures.exists(key)) {
      const existing = this.textures.get(key) as Phaser.Textures.CanvasTexture;
      if (existing && typeof existing.getContext === 'function') {
        const ctx = existing.getContext();
        ctx.clearRect(0, 0, existing.width, existing.height);
        ctx.drawImage(canvas, 0, 0);
        existing.refresh();
        if (!this.anims.exists(`${key}_walk_down`)) {
          this.createAvatarAnimations(key);
        }
        return key;
      }
    }

    // Something else already owns this key: use a private one instead of
    // removing a texture that might still be in use.
    const canvasKey = `${key}_custom`;
    if (this.textures.exists(canvasKey)) {
      const existing = this.textures.get(canvasKey) as Phaser.Textures.CanvasTexture;
      if (existing && typeof existing.getContext === 'function') {
        const ctx = existing.getContext();
        ctx.clearRect(0, 0, existing.width, existing.height);
        ctx.drawImage(canvas, 0, 0);
        existing.refresh();
        if (!this.anims.exists(`${canvasKey}_walk_down`)) {
          this.createAvatarAnimations(canvasKey);
        }
        return canvasKey;
      }
    }

    const texture = this.textures.addCanvas(canvasKey, canvas);
    if (texture) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          const frameIndex = row * 3 + col;
          texture.add(frameIndex, 0, col * 32, row * 32, 32, 32);
        }
      }
    }

    this.createAvatarAnimations(canvasKey);
    return canvasKey;
  }

  /**
   * Applies display scale and physics body metrics for an avatar.
   *
   * Procedural 32x32 avatars keep their classic footprint. Preset art is
   * 97x153, so it is scaled down to a ~1.4-tile-tall character and the body is
   * expressed in source pixels (Phaser multiplies it by the sprite scale) so
   * the collision footprint stays identical to the classic avatars.
   */
  private applyAvatarMetrics(sprite: Phaser.Physics.Arcade.Sprite, config: AvatarConfig) {
    const preset = this.resolveCharacterSheet(config.characterId);

    if (preset) {
      this.applyPresetMetrics(sprite, preset);
      return;
    }

    sprite.setScale(this.tileScale);
    sprite.setSize(18 * this.tileScale, 12 * this.tileScale);
    sprite.setOffset(7 * this.tileScale, 20 * this.tileScale);
  }

  /**
   * Display scale and physics body metrics for a bundled roster preset.
   * Preset art is 97×153, so it is scaled down to a ~1.4-tile-tall character
   * and the body is expressed in source pixels (Phaser multiplies it by the
   * sprite scale) so the collision footprint stays identical to the classic
   * avatars.
   */
  private applyPresetMetrics(sprite: Phaser.Physics.Arcade.Sprite, preset: CharacterPreset) {
    const displayHeight = 44 * this.tileScale;
    const scale = displayHeight / preset.frameHeight;
    const bodyWidth = (18 * this.tileScale) / scale;
    const bodyHeight = (12 * this.tileScale) / scale;
    const feetY = preset.frameHeight - CHARACTER_FEET_MARGIN;

    sprite.setScale(scale);
    sprite.setSize(bodyWidth, bodyHeight);
    sprite.setOffset((preset.frameWidth - bodyWidth) / 2, feetY - bodyHeight);
  }

  /**
   * Resolves a character id to a sheet: a bundled roster preset or one of the
   * office cast sheets used by NPCs and bots.
   */
  private resolveCharacterSheet(characterId?: string): CharacterPreset | undefined {
    return getCharacterPreset(characterId) ?? getNpcSheet(characterId);
  }

  /**
   * Metrics for a sprite that has no character sheet yet: the default
   * hand-drawn character, so placeholders are never rendered at the raw
   * texture size.
   */
  private applyAvatarFallbackMetrics(sprite: Phaser.Physics.Arcade.Sprite) {
    const fallback = this.resolveCharacterSheet(DEFAULT_AVATAR_CHARACTER_ID);
    if (fallback) {
      this.applyPresetMetrics(sprite, fallback);
      return;
    }
    sprite.setScale(this.tileScale);
    sprite.setSize(18 * this.tileScale, 12 * this.tileScale);
    sprite.setOffset(7 * this.tileScale, 20 * this.tileScale);
  }

  /**
   * Binds the sprite sheet of an NPC: a bundled roster preset, a sheet
   * imported through the asset library, or a procedural avatar. Returns the
   * texture key that drives the sprite, or null when the sheet is missing.
   */
  private async bindNpcSheet(
    sprite: Phaser.Physics.Arcade.Sprite,
    key: string,
    source: NpcSheetSource,
    direction: Direction
  ): Promise<string | null> {
    if (source.kind === 'preset') {
      // Roster presets *and* the office cast sheets have to resolve here,
      // otherwise the NPC keeps the placeholder texture and renders giant.
      const preset = this.resolveCharacterSheet(source.id);
      if (!preset) return null;
      const sheetKey = this.registerPresetSpritesheet(key, preset);
      if (!sheetKey) return null;
      sprite.setTexture(sheetKey);
      this.applyPresetMetrics(sprite, preset);
      return sheetKey;
    }

    if (source.kind === 'asset') {
      const config: AvatarConfig = {
        skinColor: '#f8c291',
        hairStyle: 'short',
        hairColor: '#4a3728',
        shirtColor: '#2563eb',
        pantsColor: '#1e293b',
        customCharacterAssetId: source.assetId,
        customCharacterIndex: source.characterIndex ?? 0,
      };
      return this.applyCustomCharacterAvatar(sprite, config, direction);
    }

    const canvasKey = this.registerAvatarSpritesheet(key, source.avatar);
    sprite.setTexture(canvasKey);
    this.applyAvatarMetrics(sprite, source.avatar);
    return canvasKey;
  }

  /** Shows the NPC's line in a speech bubble and posts it to the chat. */
  private handleNpcTalk(npc: NpcRuntime, line: string) {
    this.showSpeechBubbleForSprite(npc.sprite, line);
    chatService.sendMessage({
      senderId: npc.definition.id,
      senderName: npc.definition.name,
      channel: 'broadcast',
      text: line,
      role: 'employee',
    });
  }

  /**
   * Texture key shared by every avatar that uses the same imported sheet.
   */
  private customCharacterTextureKey(assetId: string, characterIndex: number): string {
    return `custom_char_${assetId}_${characterIndex}`;
  }

  /**
   * Registers an imported character sheet (Studio asset library) as a Phaser
   * texture with the 12 frames the avatar animations expect.
   *
   * Returns null when the sheet is not available on this device — for
   * example an asset that was never mirrored to the cloud — so the caller can
   * keep the procedural fallback.
   */
  private async ensureCustomCharacterTexture(
    assetId: string,
    characterIndex: number
  ): Promise<{ key: string; sheet: CustomCharacterSheet } | null> {
    // The registry is only initialized when the asset library is opened; make
    // sure the local mirror (and its binaries) are available here.
    if (!assetRegistry.isInitialized()) {
      await assetRegistry.initialize();
    }

    const meta = assetRegistry.get(assetId);
    if (!meta) return null;

    const sheet = resolveCustomCharacterSheet(meta, characterIndex);
    if (!sheet) return null;

    const key = this.customCharacterTextureKey(assetId, characterIndex);
    if (!this.textures.exists(key)) {
      const image = await assetRegistry.getImage(assetId);
      if (!image) return null;

      const texture = this.textures.addImage(key, image);
      if (!texture) return null;

      // Uploaded sheets are usually high resolution; linear filtering keeps
      // the downscale soft instead of shimmering.
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

      sheet.frames.forEach((frame, index) => {
        texture.add(index, 0, frame.sx, frame.sy, frame.sw, frame.sh);
      });

      this.createAvatarAnimations(key);
    }

    return { key, sheet };
  }

  /**
   * Applies display scale and physics body metrics for an imported sheet.
   * Mirrors the preset metrics: the sheet is scaled to ~1.4 tiles tall and
   * the body is expressed in source pixels so the collision footprint matches
   * the classic 32×32 avatars.
   */
  private applyCustomCharacterMetrics(
    sprite: Phaser.Physics.Arcade.Sprite,
    sheet: CustomCharacterSheet
  ) {
    const displayHeight = 44 * this.tileScale;
    const scale = displayHeight / sheet.frameHeight;
    const bodyWidth = (18 * this.tileScale) / scale;
    const bodyHeight = (12 * this.tileScale) / scale;
    // Imported sheets have no baked margin: the feet sit on the last row.
    const feetY = sheet.frameHeight - Math.max(1, Math.round(sheet.frameHeight * 0.02));

    sprite.setScale(scale);
    sprite.setSize(bodyWidth, bodyHeight);
    sprite.setOffset((sheet.frameWidth - bodyWidth) / 2, feetY - bodyHeight);
  }

  /**
   * Swaps a sprite over to an imported character sheet once it is available.
   * Returns the texture key that was applied, or null when the sheet could
   * not be loaded (the caller keeps the procedural fallback).
   */
  public async applyCustomCharacterAvatar(
    sprite: Phaser.Physics.Arcade.Sprite,
    config: AvatarConfig,
    direction: Direction = 'down'
  ): Promise<string | null> {
    const assetId = config.customCharacterAssetId;
    if (!assetId) return null;

    const result = await this.ensureCustomCharacterTexture(
      assetId,
      config.customCharacterIndex ?? 0
    );
    if (!result) return null;
    if (!sprite.active) return null;

    sprite.setTexture(result.key);
    this.applyCustomCharacterMetrics(sprite, result.sheet);

    const idleKey = `${result.key}_idle_${direction}`;
    if (this.anims.exists(idleKey)) {
      sprite.play(idleKey, true);
    }

    return result.key;
  }

  create() {
    // The imported equipment is high resolution; linear filtering keeps the
    // downscale soft instead of shimmering.
    OBJECT_SPRITES.forEach((sprite) => {
      const key = objectSpriteTextureKey(sprite.id);
      const texture = this.textures.get(key);
      if (texture) texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    });

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.input.keyboard.clearCaptures();
      this.interactionKeyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
      this.interactionKeySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
      this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);

      this.interactionKeyE.on('down', () => this.handleInteractionPress());
      this.interactionKeySpace.on('down', () => this.handleInteractionPress());
    }

    // Preset sheets finished loading in preload(); register every avatar
    // texture before the world (and its sprites) is built.
    this.playerAvatarKey = this.registerAvatarSpritesheet('player_avatar', this.playerProfile.avatarConfig);
    this.otherUsers.forEach((user) => {
      this.registerAvatarSpritesheet(`avatar_${user.id}`, user.avatarConfig);
    });

    // Ambient cast (NPCs) — spawned per map in buildMapFromCurrentData().
    this.npcManager = new NpcManager(this, {
      getTileSize: () => this.tileSize,
      depthBase: RemotePlayerManager.ENTITY_DEPTH_BASE,
      placeholderTextureKey: this.playerAvatarKey,
      applyFallbackMetrics: (sprite) => this.applyAvatarFallbackMetrics(sprite),
      bindSheet: (sprite, key, source, direction) => this.bindNpcSheet(sprite, key, source, direction),
      onTalk: (npc, line) => this.handleNpcTalk(npc, line),
    });

    this.buildMapFromCurrentData();
    this.setupPointerEvents();
    this.scale.on('resize', this.handleResize, this);

    this.isReady = true;
    if (this.callbacks.onSceneReady) this.callbacks.onSceneReady();
  }

  private handleResize() {
    if (!this.mapData || !this.cameras.main) return;
    const worldWidth = this.mapData.width * this.tileSize;
    const worldHeight = this.mapData.height * this.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
  }

  // -------------------------------------------------------------------------
  // Public control surface
  // -------------------------------------------------------------------------

  public setControlsEnabled(enabled: boolean) {
    this.isControlsEnabled = enabled;
    if (this.isReady && !enabled && this.player) {
      this.player.setVelocity(0, 0);
    }
  }

  public setSpeedBoost(active: boolean) {
    this.speedMultiplier = active ? 1.4 : 1.0;
  }

  public setStudioMode(enabled: boolean, settings?: StudioEditorSettings) {
    this.isStudioMode = enabled;
    if (settings) this.studioSettings = { ...settings };
    if (!this.isReady) return;
    this.refreshAllOverlays();
    this.setControlsEnabled(!enabled);
    if (!enabled) {
      this.clearSelectionInternal();
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.cameras.main.setZoom(this.defaultZoom());
    } else {
      this.cameras.main.setZoom(this.studioSettings.zoom || this.defaultZoom());
    }
  }

  public updateStudioSettings(settings: StudioEditorSettings) {
    this.studioSettings = { ...settings };
    if (!this.isReady) return;
    if (this.isStudioMode && settings.zoom > 0) {
      this.cameras.main.setZoom(settings.zoom);
    }
    this.refreshAllOverlays();
  }

  public setSelection(selection: StudioSelection) {
    this.studioSelection = selection;
  }

  public recenterCamera() {
    if (!this.isReady) return;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
  }

  public updatePlayerAvatar(newConfig: AvatarConfig) {
    this.playerProfile.avatarConfig = newConfig;
    if (!this.isReady || !this.textures || !this.anims) return;
    const key = this.registerAvatarSpritesheet('player_avatar', newConfig);
    this.playerAvatarKey = key;
    if (this.player && this.player.active) {
      this.applyAvatarMetrics(this.player, newConfig);
      this.player.setTexture(key);
      const idleKey = `${key}_idle_${this.playerProfile.direction}`;
      if (this.anims.exists(idleKey)) {
        try {
          // The texture and its animations were re-created above; stop first
          // so Phaser rebinds the animation to the new frames.
          this.player.anims.stop();
          this.player.play(idleKey);
        } catch (err) {
          console.warn('Error playing avatar animation:', err);
        }
      }
    }
    // Uploaded sheet from the asset library: swap it in once the image loads.
    if (newConfig.customCharacterAssetId && this.player && this.player.active) {
      void this.applyCustomCharacterAvatar(
        this.player,
        newConfig,
        this.playerProfile.direction
      );
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

  /**
   * Applies externally computed commands (undo/redo/property edits) and
   * refreshes the visuals. The commands are applied to the same in-memory map
   * object held by React.
   */
  public applyExternalCommands(commands: EditCommand[]) {
    if (!this.isReady || commands.length === 0) return;
    for (const command of commands) {
      applyCommand(this.mapData, command);
    }
    this.refreshFromCommands(commands);
  }

  /**
   * Refreshes the rendered scene after the map data object was mutated
   * elsewhere (e.g. React applied undo/redo commands). Does not re-apply the
   * commands.
   */
  public refreshFromCommands(commands: EditCommand[]) {
    if (!this.isReady || commands.length === 0) return;

    const plan = this.collectRefreshPlan(commands);

    if (plan.structural) {
      const px = this.player?.x;
      const py = this.player?.y;
      this.buildMapFromCurrentData();
      if (this.player && px !== undefined && py !== undefined) {
        const clamped = this.clampToWalkable(px, py);
        this.player.setPosition(clamped.x, clamped.y);
      }
      return;
    }

    for (const [layerId, cells] of plan.tileCells) {
      const layer = (this.mapData.layers || []).find((l) => l.id === layerId);
      if (!layer) continue;
      for (const cell of cells) this.markCellDirty(layer, cell.x, cell.y);
    }
    if (plan.collisionTouched) this.refreshCollisionBodies();
    if (plan.objectsTouched) this.refreshObjects();
    if (plan.zonesTouched) this.refreshZoneVisuals();
    if (plan.spawnsTouched) this.refreshSpawnMarkers();
    this.refreshAllOverlays();
  }

  private collectRefreshPlan(commands: EditCommand[]): {
    structural: boolean;
    tileCells: Map<string, Array<{ x: number; y: number }>>;
    collisionTouched: boolean;
    objectsTouched: boolean;
    zonesTouched: boolean;
    spawnsTouched: boolean;
  } {
    let structural = false;
    const tileCells = new Map<string, Array<{ x: number; y: number }>>();
    let collisionTouched = false;
    let objectsTouched = false;
    let zonesTouched = false;
    let spawnsTouched = false;

    for (const command of commands) {
      switch (command.kind) {
        case 'tiles': {
          const list = tileCells.get(command.layerId) || [];
          for (const c of command.changes) list.push({ x: c.x, y: c.y });
          tileCells.set(command.layerId, list);
          break;
        }
        case 'collision':
          collisionTouched = true;
          break;
        case 'object.add':
        case 'object.remove':
        case 'object.update':
          objectsTouched = true;
          break;
        case 'zone.add':
        case 'zone.remove':
        case 'zone.update':
          zonesTouched = true;
          break;
        case 'spawn.add':
        case 'spawn.remove':
        case 'spawn.update':
          spawnsTouched = true;
          break;
        default:
          structural = true;
      }
    }

    return { structural, tileCells, collisionTouched, objectsTouched, zonesTouched, spawnsTouched };
  }

  // -------------------------------------------------------------------------
  // Weather
  // -------------------------------------------------------------------------

  public setWeather(state: WeatherVisualState | null, flags?: Partial<WeatherEffectFlags>) {
    this.weatherState = state;
    if (flags) this.weatherFlags = { ...this.weatherFlags, ...flags };
    if (!this.isReady) return;
    this.applyWeatherVisuals();
  }

  private applyWeatherVisuals() {
    const outdoor = this.mapData?.environment === 'outdoor';
    const state = this.weatherState;
    const raining = !!state?.isRaining && this.weatherFlags.rainEffectsEnabled;

    // Rain particles (outdoor maps, or indoor when window effects are enabled)
    const shouldRain = raining && (outdoor || this.weatherFlags.windowEffectsEnabled);
    if (shouldRain) {
      this.ensureRainEmitter();
      this.rainEmitter?.start();
    } else if (this.rainEmitter) {
      this.rainEmitter.stop();
    }

    // Lightning
    const lightningEnabled = !!state?.lightning && this.weatherFlags.lightingEffectsEnabled;
    if (lightningEnabled && !this.lightningTimer) {
      this.lightningTimer = this.time.addEvent({
        delay: Phaser.Math.Between(7000, 18000),
        loop: true,
        callback: () => {
          if (this.cameras?.main) this.cameras.main.flash(260, 232, 240, 255);
        },
      });
    } else if (!lightningEnabled && this.lightningTimer) {
      this.lightningTimer.remove();
      this.lightningTimer = null;
    }

    this.refreshWindowRainOverlay(raining && !outdoor);
  }

  private ensureRainEmitter() {
    if (this.rainEmitter) return;
    try {
      const width = this.scale.width;
      const handle = this.add.particles(0, 0, 'weather_rain_drop', {
        x: { min: -40, max: width + 40 },
        y: -24,
        lifespan: 1400,
        speedY: { min: 520, max: 680 },
        speedX: { min: -70, max: -30 },
        quantity: 2,
        frequency: 45,
        scale: { start: 0.9, end: 0.5 },
        alpha: { start: 0.6, end: 0.15 },
        emitting: false,
      });
      this.rainEmitter = handle as unknown as Phaser.GameObjects.Particles.ParticleEmitter;
      this.rainEmitter.setDepth(9400);
      this.rainEmitter.setScrollFactor(0);
    } catch (err) {
      console.warn('[OfficeScene] Rain particle emitter unavailable:', err);
      this.rainEmitter = null;
      this.weatherFlags.rainEffectsEnabled = false;
    }
  }

  private refreshWindowRainOverlay(active: boolean) {
    if (!this.windowRainGraphics) {
      this.windowRainGraphics = this.add.graphics();
      this.windowRainGraphics.setDepth(9350);
    }
    const g = this.windowRainGraphics;
    g.clear();
    if (!active) return;

    g.fillStyle(0x38bdf8, 0.14);
    const tileLayers = getTileLayers(this.mapData);
    for (const layer of tileLayers) {
      if (!layer.tiles) continue;
      for (let y = 0; y < this.mapData.height; y++) {
        for (let x = 0; x < this.mapData.width; x++) {
          const tileId = layer.tiles[y]?.[x];
          if (tileId === 12) {
            g.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Map building
  // -------------------------------------------------------------------------

  private defaultZoom(): number {
    return Phaser.Math.Clamp(70 / this.tileSize, 0.75, 3.2);
  }

  private buildMapFromCurrentData(overrideSpawnX?: number, overrideSpawnY?: number) {
    this.clearWorld();

    this.tileSize = this.mapData.tileSize || 32;
    this.tileScale = this.tileSize / 32;

    this.callbacks.onMapChange(this.mapData.id, this.mapData.name);

    this.staticWallsGroup = this.physics.add.staticGroup();

    // 1. Register imported asset textures used by this map.
    const assetIds = this.collectAssetIds();
    for (const assetId of assetIds) this.ensureAssetTexture(assetId);
    if (assetIds.length > 0) {
      const missing = assetIds.filter((id) => !assetRegistry.getCachedImage(id));
      if (missing.length > 0) {
        // Load in the background, then rebuild once textures are available.
        assetRegistry.preload(missing).then(() => {
          if (this.isReady && !this.isWarping) {
            const px = this.player?.x;
            const py = this.player?.y;
            this.buildMapFromCurrentData();
            if (this.player && px !== undefined && py !== undefined) {
              const clamped = this.clampToWalkable(px, py);
              this.player.setPosition(clamped.x, clamped.y);
            }
          }
        });
      }
    }

    // 2. Tile layers
    const tileLayers = getTileLayers(this.mapData);
    for (const layer of tileLayers) {
      if (!layer.visible) continue;
      if (layer.depthMode === 'row') {
        this.renderRowLayer(layer);
      } else {
        this.renderGroundLayer(layer);
      }
    }

    // 3. Objects
    this.refreshObjects();

    // 4. Collision bodies
    this.refreshCollisionBodies();

    // 5. Overlays
    this.collisionOverlayGraphics = this.add.graphics();
    this.collisionOverlayGraphics.setDepth(8000);
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(8100);
    this.boundsGraphics = this.add.graphics();
    this.boundsGraphics.setDepth(8050);
    this.zoneGraphics = this.add.graphics();
    this.zoneGraphics.setDepth(8150);
    this.selectionGraphics = this.add.graphics();
    this.selectionGraphics.setDepth(8250);
    this.hoverGraphics = this.add.graphics();
    this.hoverGraphics.setDepth(8300);
    this.spawnMarkerMap.clear();

    // 6. Spawn Player
    const spawn = getDefaultSpawn(this.mapData);
    const spawnX = (overrideSpawnX !== undefined ? overrideSpawnX : spawn.tileX) * this.tileSize + this.tileSize / 2;
    const spawnY = (overrideSpawnY !== undefined ? overrideSpawnY : spawn.tileY) * this.tileSize + this.tileSize / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, this.playerAvatarKey);
    this.applyAvatarMetrics(this.player, this.playerProfile.avatarConfig);
    // Uploaded sheet from the asset library (the player sprite is rebuilt on
    // every map change, so the swap has to be re-applied here).
    if (this.playerProfile.avatarConfig.customCharacterAssetId) {
      void this.applyCustomCharacterAvatar(
        this.player,
        this.playerProfile.avatarConfig,
        this.playerProfile.direction
      );
    }
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(RemotePlayerManager.ENTITY_DEPTH_BASE + spawnY + 0.3);
    this.createRagnarokNameplate(this.player, `${this.playerProfile.name} (You)`, '#38bdf8', true);
    this.physics.add.collider(this.player, this.staticWallsGroup);

    if (!this.remotePlayerManager) {
      this.remotePlayerManager = new RemotePlayerManager(
        this,
        this.playerProfile.id,
        (key, cfg) => this.registerAvatarSpritesheet(key, cfg),
        this.staticWallsGroup,
        this.tileScale,
        (sprite, cfg) => this.applyAvatarMetrics(sprite, cfg),
        (sprite, cfg, direction) => this.applyCustomCharacterAvatar(sprite, cfg, direction)
      );
    } else {
      this.remotePlayerManager.setLocalUserId(this.playerProfile.id);
      this.remotePlayerManager.setTileScale(this.tileScale);
    }

    // 7. Mock colleagues
    this.otherUsers
      .filter((u) => u.currentMapId === this.mapData.id)
      .forEach((colleague) => this.spawnColleague(colleague));

    // 7b. Ambient cast (NPCs) for this map
    if (this.npcManager) {
      this.npcManager.spawnForMap(this.mapData.id, NPC_CATALOG);
      this.currentNearbyNpc = null;
    }

    // 8. Camera
    const worldWidth = this.mapData.width * this.tileSize;
    const worldHeight = this.mapData.height * this.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.isStudioMode ? this.studioSettings.zoom || this.defaultZoom() : this.defaultZoom());

    // 9. Prompt + editor overlays
    this.createFloatingPrompt();
    this.refreshAllOverlays();
    this.applyWeatherVisuals();
  }

  private collectAssetIds(): string[] {
    const ids = new Set<string>();
    for (const ts of this.mapData.tilesets || []) {
      if (ts.assetId) ids.add(ts.assetId);
    }
    for (const obj of this.mapData.objects) {
      if (obj.assetId) ids.add(obj.assetId);
    }
    return Array.from(ids);
  }

  private clearWorld() {
    for (const chunk of this.terrainChunks.values()) {
      chunk.image.destroy();
      if (this.textures.exists(chunk.texture.key)) this.textures.remove(chunk.texture.key);
    }
    this.terrainChunks.clear();
    this.dirtyChunks.clear();
    for (const img of this.rowLayerImages.values()) img.destroy();
    this.rowLayerImages.clear();
    for (const img of this.objectImageMap.values()) img.destroy();
    this.objectImageMap.clear();
    for (const marker of this.spawnMarkerMap.values()) marker.destroy();
    this.spawnMarkerMap.clear();
    if (this.staticWallsGroup) this.staticWallsGroup.clear(true, true);
    this.collisionBlocksMap.clear();
    this.otherUserSprites.forEach((entry) => {
      entry.sprite.destroy();
      entry.nameTag.destroy();
    });
    this.otherUserSprites.clear();
    this.activeSpeechBubbles.forEach((b) => b.container.destroy());
    this.activeSpeechBubbles = [];
    this.activeReactionBubbles.forEach((b) => b.container.destroy());
    this.activeReactionBubbles.clear();
    if (this.remotePlayerManager) this.remotePlayerManager.clearAll();
    if (this.rainEmitter) {
      try {
        (this.rainEmitter as unknown as { destroy?: () => void }).destroy?.();
      } catch {
        // ignore emitter teardown errors
      }
      this.rainEmitter = null;
    }

    // Destroy remaining display-list children (player, overlays, prompt tags...).
    this.children.removeAll(true);
  }

  private ensureAssetTexture(assetId: string): boolean {
    const key = `asset_${assetId}`;
    if (this.textures.exists(key)) return true;
    const img = assetRegistry.getCachedImage(assetId);
    if (!img) return false;
    const meta = assetRegistry.get(assetId);
    const texture = this.textures.addImage(key, img);
    if (texture && meta) {
      const count = Math.max(1, meta.columns * meta.rows);
      for (let i = 0; i < count; i++) {
        const col = i % meta.columns;
        const row = Math.floor(i / meta.columns);
        try {
          texture.add(i, 0, col * meta.frameWidth, row * meta.frameHeight, meta.frameWidth, meta.frameHeight);
        } catch {
          // Frame may already exist — ignore duplicates.
        }
      }
      if (meta.columns === 1 && meta.rows === 1) {
        // Ensure frame 0 exists for single-image assets.
        try {
          texture.add(0, 0, 0, 0, meta.width, meta.height);
        } catch {
          // ignore
        }
      }
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Tile rendering
  // -------------------------------------------------------------------------

  private resolveTile(layerTileId: number): { key: string; frame?: number; displayW: number; displayH: number } {
    if (layerTileId < 0) return { key: 'tile_missing', displayW: this.tileSize, displayH: this.tileSize };

    if (isBuiltinTileId(layerTileId)) {
      const artKey = floorArtTextureKey(layerTileId);
      const key =
        artKey && this.textures.exists(artKey)
          ? artKey
          : BUILTIN_TEXTURE_KEY_BY_TILE_ID[layerTileId] || 'tile_missing';
      return { key, displayW: this.tileSize, displayH: this.tileSize };
    }

    const tileset = findTilesetForTile(this.mapData, layerTileId);
    if (tileset && tileset.assetId) {
      this.ensureAssetTexture(tileset.assetId);
      const key = `asset_${tileset.assetId}`;
      if (this.textures.exists(key)) {
        const scale = tileset.scale ?? 1;
        return {
          key,
          frame: layerTileId - tileset.firstTileId,
          displayW: this.tileSize * scale,
          displayH: this.tileSize * scale,
        };
      }
    }
    return { key: 'tile_missing', displayW: this.tileSize, displayH: this.tileSize };
  }

  private chunkSizeTiles(): number {
    const cells = this.mapData.width * this.mapData.height;
    const target = Math.ceil(Math.sqrt(cells / 256));
    return Phaser.Math.Clamp(Math.max(16, target), 16, 64);
  }

  private chunkKey(layerId: string, cx: number, cy: number): string {
    return `${layerId}:${cx},${cy}`;
  }

  private renderGroundLayer(layer: MapLayerData) {
    if (!layer.tiles) return;
    const chunk = this.chunkSizeTiles();
    const cols = Math.ceil(this.mapData.width / chunk);
    const rows = Math.ceil(this.mapData.height / chunk);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (this.chunkHasTiles(layer, cx, cy, chunk)) {
          this.rebuildChunk(layer, cx, cy, chunk);
        }
      }
    }
  }

  private chunkHasTiles(layer: MapLayerData, cx: number, cy: number, chunk: number): boolean {
    if (!layer.tiles) return false;
    const x0 = cx * chunk;
    const y0 = cy * chunk;
    for (let y = y0; y < Math.min(y0 + chunk, this.mapData.height); y++) {
      for (let x = x0; x < Math.min(x0 + chunk, this.mapData.width); x++) {
        if ((layer.tiles[y]?.[x] ?? -1) >= 0) return true;
      }
    }
    return false;
  }

  private rebuildChunk(layer: MapLayerData, cx: number, cy: number, chunk: number) {
    const key = this.chunkKey(layer.id, cx, cy);
    const worldX = cx * chunk * this.tileSize;
    const worldY = cy * chunk * this.tileSize;
    const worldW = Math.max(1, Math.min(chunk, this.mapData.width - cx * chunk) * this.tileSize);
    const worldH = Math.max(1, Math.min(chunk, this.mapData.height - cy * chunk) * this.tileSize);

    let entry = this.terrainChunks.get(key);
    if (entry && (entry.canvas.width !== worldW || entry.canvas.height !== worldH)) {
      // The map was resized under this chunk — rebuild it from scratch.
      entry.image.destroy();
      this.textures.remove(entry.texture.key);
      entry = undefined;
    }
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = worldW;
      canvas.height = worldH;
      const textureKey = `terrain_${layer.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${cx}_${cy}`;
      const texture = this.textures.addCanvas(textureKey, canvas);
      if (!texture) {
        console.warn('[OfficeScene] could not create terrain chunk texture', textureKey);
        return;
      }
      const image = this.add
        .image(worldX, worldY, textureKey)
        .setOrigin(0, 0)
        .setDepth(layer.order * 0.1);
      entry = { canvas, ctx: canvas.getContext('2d')!, texture, image };
      this.terrainChunks.set(key, entry);
    }

    const ctx = entry.ctx;
    ctx.clearRect(0, 0, worldW, worldH);
    ctx.imageSmoothingQuality = 'high';

    for (let y = cy * chunk; y < Math.min(cy * chunk + chunk, this.mapData.height); y++) {
      for (let x = cx * chunk; x < Math.min(cx * chunk + chunk, this.mapData.width); x++) {
        const tileId = layer.tiles?.[y]?.[x] ?? -1;
        if (tileId < 0) continue;
        const resolved = this.resolveTile(tileId);
        this.drawTileToCanvas(ctx, resolved, x * this.tileSize - worldX, y * this.tileSize - worldY);
      }
    }

    // Canvas textures are uploaded lazily; flag the new pixels for the GPU.
    entry.texture.refresh();
  }

  /**
   * Composes one tile into a ground chunk canvas.
   *
   * Up-scaled pixel art stays crisp (nearest), down-scaled hand-drawn art is
   * smoothed so the 168px floor illustrations read cleanly at 32px.
   */
  private drawTileToCanvas(
    ctx: CanvasRenderingContext2D,
    resolved: { key: string; frame?: number; displayW: number; displayH: number },
    destX: number,
    destY: number
  ) {
    const texture = this.textures.get(resolved.key);
    if (!texture || !texture.key || texture.key === '__MISSING') return;
    const frame = texture.get(resolved.frame ?? 0);
    const source = texture.getSourceImage() as CanvasImageSource | null;
    if (!frame || !source) return;

    const sw = frame.cutWidth || frame.width;
    const sh = frame.cutHeight || frame.height;
    if (sw <= 0 || sh <= 0) return;

    ctx.imageSmoothingEnabled = resolved.displayW < sw * 0.75 || resolved.displayH < sh * 0.75;
    ctx.drawImage(
      source,
      frame.cutX,
      frame.cutY,
      sw,
      sh,
      destX + (this.tileSize - resolved.displayW) / 2,
      destY + (this.tileSize - resolved.displayH) / 2,
      resolved.displayW,
      resolved.displayH
    );
  }

  private renderRowLayer(layer: MapLayerData) {
    if (!layer.tiles) return;
    for (let y = 0; y < this.mapData.height; y++) {
      for (let x = 0; x < this.mapData.width; x++) {
        const tileId = layer.tiles[y]?.[x] ?? -1;
        if (tileId < 0) continue;
        this.createRowImage(layer, x, y, tileId);
      }
    }
  }

  private createRowImage(layer: MapLayerData, x: number, y: number, tileId: number) {
    const key = `${layer.id}:${x},${y}`;
    const resolved = this.resolveTile(tileId);
    let img = this.rowLayerImages.get(key);
    if (!img) {
      img = this.add.image(0, 0, resolved.key, resolved.frame);
      this.rowLayerImages.set(key, img);
    } else {
      img.setTexture(resolved.key, resolved.frame);
    }
    img.setDisplaySize(resolved.displayW, resolved.displayH);
    img.setPosition(x * this.tileSize + this.tileSize / 2, y * this.tileSize + this.tileSize / 2);
    img.setDepth(layer.order * 0.1 + (y + 1) * this.tileSize + 0.1);
  }

  private markCellDirty(layer: MapLayerData, x: number, y: number) {
    if (layer.kind === 'collision') {
      this.updateCollisionCell(x, y);
      return;
    }
    if (!layer.tiles) return;
    const tileId = layer.tiles[y]?.[x] ?? -1;
    if (layer.depthMode === 'row') {
      const key = `${layer.id}:${x},${y}`;
      const existing = this.rowLayerImages.get(key);
      if (tileId < 0) {
        if (existing) {
          existing.destroy();
          this.rowLayerImages.delete(key);
        }
      } else {
        this.createRowImage(layer, x, y, tileId);
      }
      return;
    }
    const chunk = this.chunkSizeTiles();
    this.dirtyChunks.add(this.chunkKey(layer.id, Math.floor(x / chunk), Math.floor(y / chunk)));
  }

  // -------------------------------------------------------------------------
  // Objects / collision / overlays
  // -------------------------------------------------------------------------

  private resolveObjectTexture(obj: MapObject): {
    key: string;
    frame?: number;
    displayW: number;
    displayH: number;
    /** Anchor the sprite to the bottom of its footprint (furniture). */
    anchorBottom?: boolean;
  } {
    const displayW = obj.width * this.tileSize;
    const displayH = obj.height * this.tileSize;
    if (obj.assetId) {
      this.ensureAssetTexture(obj.assetId);
      const key = `asset_${obj.assetId}`;
      if (this.textures.exists(key)) {
        return { key, frame: obj.frame ?? 0, displayW, displayH };
      }
      return { key: 'obj_missing', displayW, displayH };
    }

    // Hand-drawn equipment keeps its aspect ratio and stands on the floor.
    const sprite = getObjectSprite(obj.type);
    if (sprite) {
      const key = objectSpriteTextureKey(sprite.id);
      if (this.textures.exists(key)) {
        const source = this.textures.get(key).getSourceImage();
        const sourceW = source?.width ?? 1;
        const sourceH = source?.height ?? 1;
        // Furniture fills the height of its footprint and may reach into the
        // next tile horizontally (a desk is wider than it is deep).
        const scale = Math.min(displayH / sourceH, (displayW * 2) / sourceW);
        return {
          key,
          displayW: sourceW * scale,
          displayH: sourceH * scale,
          anchorBottom: true,
        };
      }
    }

    if (this.textures.exists(obj.type)) {
      return { key: obj.type, displayW, displayH };
    }
    return { key: 'obj_missing', displayW, displayH };
  }

  private refreshObjects() {
    for (const img of this.objectImageMap.values()) img.destroy();
    this.objectImageMap.clear();
    for (const obj of this.mapData.objects) {
      if (obj.layerId) {
        const layer = (this.mapData.layers || []).find((l) => l.id === obj.layerId);
        if (layer && layer.visible === false) continue;
      }
      const resolved = this.resolveObjectTexture(obj);
      const tileLeft = obj.tileX * this.tileSize;
      const tileTop = obj.tileY * this.tileSize;
      const footprintW = obj.width * this.tileSize;
      const footprintH = obj.height * this.tileSize;
      const img = this.add.image(
        tileLeft + footprintW / 2,
        resolved.anchorBottom
          ? tileTop + footprintH - resolved.displayH / 2
          : tileTop + footprintH / 2,
        resolved.key,
        resolved.frame
      );
      img.setDisplaySize(resolved.displayW, resolved.displayH);
      if (obj.opacity !== undefined) img.setAlpha(obj.opacity);
      if (obj.rotation) img.setAngle(obj.rotation);
      img.setDepth(RemotePlayerManager.ENTITY_DEPTH_BASE + (obj.tileY + obj.height) * this.tileSize + 0.2);
      this.objectImageMap.set(obj.id, img);
    }
  }

  private refreshCollisionBodies() {
    if (this.staticWallsGroup) this.staticWallsGroup.clear(true, true);
    this.collisionBlocksMap.clear();
    const mask = getCollisionMask(this.mapData);
    for (let y = 0; y < this.mapData.height; y++) {
      for (let x = 0; x < this.mapData.width; x++) {
        if (mask[y]?.[x]) this.createCollisionBlock(x, y);
      }
    }
  }

  private createCollisionBlock(x: number, y: number) {
    const key = `${x},${y}`;
    if (this.collisionBlocksMap.has(key)) return;

    const block = this.add.rectangle(
      x * this.tileSize + this.tileSize / 2,
      y * this.tileSize + this.tileSize / 2,
      this.tileSize,
      this.tileSize
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

  private updateCollisionCell(x: number, y: number) {
    const solid = getCollisionMask(this.mapData)[y]?.[x] === true;
    if (solid) this.createCollisionBlock(x, y);
    else this.removeCollisionBlock(x, y);
  }

  public clampToWalkable(x: number, y: number): { x: number; y: number } {
    const maxX = this.mapData.width * this.tileSize - 1;
    const maxY = this.mapData.height * this.tileSize - 1;
    let cx = Phaser.Math.Clamp(x, 1, maxX);
    let cy = Phaser.Math.Clamp(y, 1, maxY);
    const mask = getCollisionMask(this.mapData);
    const tx = Phaser.Math.Clamp(Math.floor(cx / this.tileSize), 0, this.mapData.width - 1);
    const ty = Phaser.Math.Clamp(Math.floor(cy / this.tileSize), 0, this.mapData.height - 1);
    if (mask[ty]?.[tx]) {
      // Nudge towards the nearest open neighbour.
      const candidates = [
        { x: tx + 1, y: ty },
        { x: tx - 1, y: ty },
        { x: tx, y: ty + 1 },
        { x: tx, y: ty - 1 },
      ];
      for (const c of candidates) {
        if (c.x >= 0 && c.y >= 0 && c.x < this.mapData.width && c.y < this.mapData.height && !mask[c.y]?.[c.x]) {
          cx = c.x * this.tileSize + this.tileSize / 2;
          cy = c.y * this.tileSize + this.tileSize / 2;
          break;
        }
      }
    }
    return { x: cx, y: cy };
  }

  private refreshAllOverlays() {
    this.updateCollisionOverlay();
    this.updateGridOverlay();
    this.updateBoundsOverlay();
    this.refreshZoneVisuals();
    this.refreshSpawnMarkers();
    this.updateSelectionOverlay();
  }

  private updateCollisionOverlay() {
    if (!this.collisionOverlayGraphics || !this.mapData.layers) return;
    const g = this.collisionOverlayGraphics;
    g.clear();
    const show = (this.isStudioMode && this.studioSettings.showCollision) || false;
    if (!show) return;
    const mask = getCollisionMask(this.mapData);
    g.fillStyle(0xef4444, 0.3);
    g.lineStyle(1, 0xef4444, 0.65);
    for (let y = 0; y < this.mapData.height; y++) {
      for (let x = 0; x < this.mapData.width; x++) {
        if (mask[y]?.[x]) {
          g.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
          g.strokeRect(x * this.tileSize + 0.5, y * this.tileSize + 0.5, this.tileSize - 1, this.tileSize - 1);
        }
      }
    }
  }

  private updateGridOverlay() {
    if (!this.gridGraphics) return;
    const g = this.gridGraphics;
    g.clear();
    if (!this.isStudioMode || !this.studioSettings.showGrid) return;
    g.lineStyle(1, 0x64748b, 0.28);
    const w = this.mapData.width * this.tileSize;
    const h = this.mapData.height * this.tileSize;
    for (let x = 0; x <= this.mapData.width; x++) {
      g.beginPath();
      g.moveTo(x * this.tileSize + 0.5, 0);
      g.lineTo(x * this.tileSize + 0.5, h);
      g.strokePath();
    }
    for (let y = 0; y <= this.mapData.height; y++) {
      g.beginPath();
      g.moveTo(0, y * this.tileSize + 0.5);
      g.lineTo(w, y * this.tileSize + 0.5);
      g.strokePath();
    }
  }

  private updateBoundsOverlay() {
    if (!this.boundsGraphics) return;
    const g = this.boundsGraphics;
    g.clear();
    g.lineStyle(2, 0x6366f1, 0.85);
    g.strokeRect(1, 1, this.mapData.width * this.tileSize - 2, this.mapData.height * this.tileSize - 2);
  }

  private refreshZoneVisuals() {
    if (!this.zoneGraphics) return;
    const g = this.zoneGraphics;
    g.clear();
    if (!this.isStudioMode || !this.studioSettings.showZones) return;
    for (const zone of this.mapData.interactionZones) {
      const color = ZONE_COLORS[zone.type] ?? 0x6366f1;
      g.fillStyle(color, 0.14);
      g.lineStyle(1.5, color, 0.8);
      const x = zone.tileX * this.tileSize;
      const y = zone.tileY * this.tileSize;
      const w = zone.width * this.tileSize;
      const h = zone.height * this.tileSize;
      g.fillRect(x, y, w, h);
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  private refreshSpawnMarkers() {
    for (const marker of this.spawnMarkerMap.values()) marker.destroy();
    this.spawnMarkerMap.clear();
    if (!this.isStudioMode) return;

    for (const spawn of getSpawnPoints(this.mapData)) {
      const container = this.add.container(
        spawn.tileX * this.tileSize + this.tileSize / 2,
        spawn.tileY * this.tileSize + this.tileSize / 2
      );
      container.setDepth(8200);
      const g = this.add.graphics();
      g.fillStyle(0x22c55e, 0.9);
      g.lineStyle(1.5, 0x052e16, 0.9);
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(6, 0);
      g.lineTo(0, 6);
      g.lineTo(-6, 0);
      g.closePath();
      g.fillPath();
      g.strokePath();
      const label = this.add
        .text(0, -14, spawn.name, {
          fontSize: '12px',
          fontFamily: 'system-ui, sans-serif',
          color: '#bbf7d0',
          resolution: 2,
        })
        .setOrigin(0.5)
        .setScale(0.55);
      container.add([g, label]);
      this.spawnMarkerMap.set(spawn.id, container);
    }
  }

  private updateSelectionOverlay() {
    if (!this.selectionGraphics) return;
    const g = this.selectionGraphics;
    g.clear();
    if (!this.isStudioMode || !this.studioSelection) return;

    let rect: { x: number; y: number; w: number; h: number } | null = null;
    if (this.studioSelection.kind === 'object') {
      const target = this.mapData.objects.find((o) => o.id === (this.studioSelection as { id: string }).id);
      if (target) {
        rect = {
          x: target.tileX * this.tileSize,
          y: target.tileY * this.tileSize,
          w: target.width * this.tileSize,
          h: target.height * this.tileSize,
        };
      }
    } else if (this.studioSelection.kind === 'zone') {
      const zone = this.mapData.interactionZones.find((z) => z.id === (this.studioSelection as { id: string }).id);
      if (zone) {
        rect = {
          x: zone.tileX * this.tileSize,
          y: zone.tileY * this.tileSize,
          w: zone.width * this.tileSize,
          h: zone.height * this.tileSize,
        };
      }
    } else if (this.studioSelection.kind === 'spawn') {
      const spawn = getSpawnPoints(this.mapData).find((s) => s.id === (this.studioSelection as { id: string }).id);
      if (spawn) {
        rect = {
          x: spawn.tileX * this.tileSize,
          y: spawn.tileY * this.tileSize,
          w: this.tileSize,
          h: this.tileSize,
        };
      }
    }

    if (rect) {
      g.lineStyle(2, 0xfacc15, 0.95);
      g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
      g.lineStyle(1, 0xfacc15, 0.4);
      g.strokeRect(rect.x - 2.5, rect.y - 2.5, rect.w + 4, rect.h + 4);
    }
  }

  // -------------------------------------------------------------------------
  // Avatars, colleagues, bubbles
  // -------------------------------------------------------------------------

  private createRagnarokNameplate(
    sprite: Phaser.Physics.Arcade.Sprite,
    displayName: string,
    accentColor: string,
    isLocalPlayer: boolean = false
  ): Phaser.GameObjects.Container {
    const container = this.add.container(sprite.x, sprite.y + 20);
    container.setDepth(9000);
    container.setVisible(false);

    const paddingX = 6;
    const paddingY = 2;

    const nameText = this.add
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

    const bg = this.add.graphics();
    bg.fillStyle(0x090d16, 0.9);
    bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(accentColor).color, 0.9);
    bg.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 3);
    bg.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 3);

    container.add([bg, nameText]);

    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerover', () => container.setVisible(true));
    sprite.on('pointerout', () => container.setVisible(false));
    sprite.on('pointerdown', () => container.setVisible(true));

    if (isLocalPlayer) this.playerNameTag = container;
    return container;
  }

  private spawnColleague(user: UserProfile) {
    const baseKey = `avatar_${user.id}`;
    const key = this.registerAvatarSpritesheet(baseKey, user.avatarConfig);
    const cx = user.x * this.tileSize + this.tileSize / 2;
    const cy = user.y * this.tileSize + this.tileSize / 2;

    const sprite = this.physics.add.sprite(cx, cy, key);
    this.applyAvatarMetrics(sprite, user.avatarConfig);
    sprite.setImmovable(true);
    sprite.setDepth(RemotePlayerManager.ENTITY_DEPTH_BASE + cy + 0.25);
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

    // Uploaded sheet from the asset library: swap it in once the image loads.
    if (user.avatarConfig.customCharacterAssetId) {
      void this.applyCustomCharacterAvatar(sprite, user.avatarConfig, user.direction);
    }
  }

  public showSpeechBubble(senderId: string, text: string, durationMs: number = 4500) {
    if (!this.isReady) return;
    let targetSprite: Phaser.Physics.Arcade.Sprite | null = null;

    if (senderId === this.playerProfile.id || senderId === 'current_user') {
      targetSprite = this.player;
    } else {
      const entry = this.otherUserSprites.get(senderId);
      if (entry) targetSprite = entry.sprite;
      else if (this.remotePlayerManager) targetSprite = this.remotePlayerManager.getPlayerSprite(senderId) || null;
    }

    if (!targetSprite) return;

    this.showSpeechBubbleForSprite(targetSprite, text, durationMs);
  }

  /** Shows a speech bubble above any sprite (players, colleagues, NPCs). */
  private showSpeechBubbleForSprite(
    targetSprite: Phaser.Physics.Arcade.Sprite,
    text: string,
    durationMs: number = 4500
  ) {
    if (!this.isReady || !targetSprite.active) return;

    const container = this.add.container(targetSprite.x, targetSprite.y - 36 * this.tileScale);
    container.setDepth(9100);

    const maxWidth = 160;
    const bubbleText = this.add
      .text(0, -6, text, {
        fontSize: '16px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontStyle: '500',
        color: '#0f172a',
        resolution: 2,
        wordWrap: { width: (maxWidth - 16) * 2 },
        align: 'center',
      })
      .setScale(0.5)
      .setOrigin(0.5);

    const bounds = bubbleText.getBounds();
    const w = Math.max(bounds.width + 16, 48);
    const h = Math.max(bounds.height + 12, 22);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 - 5 + 1, w, h, 6);
    g.fillStyle(0xffffff, 0.98);
    g.lineStyle(1, 0x64748b, 0.6);
    g.fillRoundedRect(-w / 2, -h / 2 - 5, w, h, 6);
    g.strokeRoundedRect(-w / 2, -h / 2 - 5, w, h, 6);

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

  public showReactionBubble(senderId: string, emoji: string, durationMs: number = 3200) {
    if (!this.isReady) return;
    let targetSprite: Phaser.Physics.Arcade.Sprite | null = null;

    if (senderId === this.playerProfile.id || senderId === 'current_user') {
      targetSprite = this.player;
    } else {
      const entry = this.otherUserSprites.get(senderId);
      if (entry) targetSprite = entry.sprite;
      else if (this.remotePlayerManager) targetSprite = this.remotePlayerManager.getPlayerSprite(senderId) || null;
    }

    if (!targetSprite) return;

    sounds.playReactionPop();

    const existing = this.activeReactionBubbles.get(senderId);
    if (existing) {
      existing.container.destroy();
      this.activeReactionBubbles.delete(senderId);
    }

    const container = this.add.container(targetSprite.x, targetSprite.y - 42 * this.tileScale);
    container.setDepth(9200);
    container.setScale(0.15);
    container.setAlpha(0.2);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(1, 2, 20);
    g.fillStyle(0xffffff, 0.98);
    g.lineStyle(2, 0x6366f1, 0.9);
    g.fillCircle(0, 0, 19);
    g.strokeCircle(0, 0, 19);

    g.beginPath();
    g.moveTo(-4, 16);
    g.lineTo(0, 23);
    g.lineTo(4, 16);
    g.closePath();
    g.fill();
    g.stroke();

    const emojiText = this.add
      .text(0, -1, emoji, {
        fontSize: '24px',
        fontFamily: "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
        resolution: 2,
        align: 'center',
      })
      .setOrigin(0.5);

    container.add([g, emojiText]);

    const bubbleData: ActiveReactionBubble = {
      container,
      targetSprite,
      userId: senderId,
      expiresAt: Date.now() + durationMs,
      offsetY: -42 * this.tileScale,
    };
    this.activeReactionBubbles.set(senderId, bubbleData);

    this.tweens.add({
      targets: container,
      scale: 1.15,
      alpha: 1,
      duration: 140,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: container, scale: 1.0, duration: 90, ease: 'Sine.easeOut' });
      },
    });

    this.tweens.add({
      targets: bubbleData,
      offsetY: bubbleData.offsetY - 8,
      duration: durationMs - 400,
      ease: 'Sine.easeOut',
    });

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
    this.promptTag.setDepth(8600);
    this.promptTag.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.lineStyle(1, 0x6366f1, 0.9);
    bg.fillRoundedRect(-52, -10, 104, 20, 3);
    bg.strokeRoundedRect(-52, -10, 104, 20, 3);

    const text = this.add
      .text(0, 0, 'Press [E] Interact', {
        fontSize: '15px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontStyle: 'bold',
        color: '#c7d2fe',
        resolution: 2,
      })
      .setScale(0.5)
      .setOrigin(0.5);

    this.promptTag.add([bg, text]);
  }

  // -------------------------------------------------------------------------
  // Pointer handling (gameplay + studio)
  // -------------------------------------------------------------------------

  private pointerToTile(pointer: Phaser.Input.Pointer): { tx: number; ty: number; inside: boolean } {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(worldPoint.x / this.tileSize);
    const ty = Math.floor(worldPoint.y / this.tileSize);
    const inside = tx >= 0 && ty >= 0 && tx < this.mapData.width && ty < this.mapData.height;
    return { tx, ty, inside };
  }

  private setupPointerEvents() {
    this.clickIndicatorGraphics = this.add.graphics();
    this.clickIndicatorGraphics.setDepth(8400);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (!this.isStudioMode) return;
      const current = this.cameras.main.zoom;
      const next = Phaser.Math.Clamp(current - dy * 0.0012, 0.6, 4);
      this.cameras.main.setZoom(next);
      this.studioSettings.zoom = next;
      this.callbacks.onZoomChange?.(next);
    });
  }

  private isMiddleOrRightButton(pointer: Phaser.Input.Pointer): boolean {
    return pointer.middleButtonDown() || pointer.rightButtonDown();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    // Middle/right button: pan in studio, ignore in world mode.
    if (this.isMiddleOrRightButton(pointer)) {
      if (this.isStudioMode) this.beginPan(pointer);
      else if (pointer.rightButtonDown() && !this.isStudioMode) return;
      return;
    }

    if (!this.isStudioMode) {
      if (!this.isControlsEnabled || pointer.button !== 0) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clamped = this.clampToWalkable(worldPoint.x, worldPoint.y);
      this.clickTargetPos = { x: clamped.x, y: clamped.y };
      this.drawClickTargetIndicator(clamped.x, clamped.y);
      return;
    }

    const { tx, ty, inside } = this.pointerToTile(pointer);
    if (!inside) return;

    const tool = this.studioSettings.activeTool;
    if (tool === 'pan') {
      this.beginPan(pointer);
      return;
    }

    if (tool === 'select') {
      this.beginSelectionDrag(tx, ty);
      return;
    }

    this.isPointerDownForEditing = true;
    if (tool === 'paint' || tool === 'erase' || tool === 'collision') {
      this.strokeIsErasing = tool === 'erase' || (tool === 'collision' && this.isCellSolid(tx, ty));
      this.applyStrokeAt(tx, ty);
    } else if (tool === 'object') {
      this.placeObjectAt(tx, ty);
      this.isPointerDownForEditing = false;
    } else if (tool === 'spawn') {
      this.placeSpawnAt(tx, ty);
      this.isPointerDownForEditing = false;
    }
  }

  private onPointerUp(_pointer: Phaser.Input.Pointer) {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }
    if (this.dragState.active) {
      this.finishSelectionDrag();
      return;
    }
    if (this.isPointerDownForEditing) {
      this.isPointerDownForEditing = false;
      this.flushStrokeTransaction();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.mapData) return;

    if (this.isPanning) {
      const cam = this.cameras.main;
      cam.stopFollow();
      const zoom = cam.zoom;
      cam.scrollX = this.panPointerStart.scrollX - (pointer.x - this.panPointerStart.x) / zoom;
      cam.scrollY = this.panPointerStart.scrollY - (pointer.y - this.panPointerStart.y) / zoom;
      return;
    }

    const { tx, ty, inside } = this.pointerToTile(pointer);

    if (this.isStudioMode) {
      if (!this.lastCursorTile || this.lastCursorTile.x !== tx || this.lastCursorTile.y !== ty || !inside) {
        this.lastCursorTile = { x: tx, y: ty };
        this.callbacks.onCursorMove?.(tx, ty, inside);
      }

      if (this.dragState.active) {
        this.updateSelectionDrag(tx, ty);
        return;
      }

      this.drawHoverBox(tx, ty, inside);

      if (this.isPointerDownForEditing && inside && (this.studioSettings.activeTool === 'paint' || this.studioSettings.activeTool === 'erase' || this.studioSettings.activeTool === 'collision')) {
        this.applyStrokeAt(tx, ty);
      }
    }
  }

  private beginPan(pointer: Phaser.Input.Pointer) {
    this.isPanning = true;
    this.cameras.main.stopFollow();
    this.panPointerStart = {
      x: pointer.x,
      y: pointer.y,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
    };
  }

  private drawHoverBox(tx: number, ty: number, inside: boolean) {
    if (!this.hoverGraphics) return;
    const g = this.hoverGraphics;
    g.clear();
    if (!inside) return;
    const size = Phaser.Math.Clamp(this.studioSettings.brushSize || 1, 1, 6);
    const half = Math.floor((size - 1) / 2);
    const x0 = (tx - half) * this.tileSize;
    const y0 = (ty - half) * this.tileSize;
    g.lineStyle(1.5, 0xfacc15, 0.95);
    g.strokeRect(x0 + 0.5, y0 + 0.5, size * this.tileSize - 1, size * this.tileSize - 1);
  }

  // -------------------------------------------------------------------------
  // Studio tools
  // -------------------------------------------------------------------------

  private isLayerLocked(layerId: string | null): boolean {
    if (!layerId) return true;
    const layer = (this.mapData.layers || []).find((l) => l.id === layerId);
    return !layer || layer.locked || !layer.visible;
  }

  private isCellSolid(tx: number, ty: number): boolean {
    return getCollisionMask(this.mapData)[ty]?.[tx] === true;
  }

  private brushCells(tx: number, ty: number): Array<{ x: number; y: number }> {
    const size = Phaser.Math.Clamp(this.studioSettings.brushSize || 1, 1, 6);
    const half = Math.floor((size - 1) / 2);
    const cells: Array<{ x: number; y: number }> = [];
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const x = tx - half + dx;
        const y = ty - half + dy;
        if (x >= 0 && y >= 0 && x < this.mapData.width && y < this.mapData.height) cells.push({ x, y });
      }
    }
    return cells;
  }

  private applyStrokeAt(tx: number, ty: number) {
    const tool = this.studioSettings.activeTool;
    if (tool === 'collision') {
      this.applyCollisionStroke(tx, ty);
      return;
    }
    this.applyTileStroke(tx, ty);
  }

  private applyTileStroke(tx: number, ty: number) {
    const layerId = this.studioSettings.activeLayerId;
    if (!layerId || this.isLayerLocked(layerId)) return;
    const layer = (this.mapData.layers || []).find((l) => l.id === layerId);
    if (!layer || layer.kind !== 'tiles' || !layer.tiles) return;

    const newTileId = this.studioSettings.activeTool === 'erase' ? -1 : this.studioSettings.selectedTileId;
    const paintCollision =
      this.studioSettings.paintCollisionWithWalls && layer.depthMode === 'row' && newTileId >= 0;

    let list = this.pendingTileChanges.get(layerId);
    if (!list) {
      list = [];
      this.pendingTileChanges.set(layerId, list);
    }

    for (const cell of this.brushCells(tx, ty)) {
      const prev = layer.tiles[cell.y]?.[cell.x] ?? -1;
      if (prev === newTileId) continue;
      layer.tiles[cell.y][cell.x] = newTileId;
      list.push({ x: cell.x, y: cell.y, prev, next: newTileId });
      this.markCellDirty(layer, cell.x, cell.y);

      if (layer.depthMode === 'row') {
        // Auto collision for wall-like layers (both painting and erasing)
        if (paintCollision) {
          if (!this.isCellSolid(cell.x, cell.y)) {
            this.pendingCollisionChanges.push({ x: cell.x, y: cell.y, prev: false, next: true });
            const collLayer = getCollisionLayer(this.mapData);
            if (collLayer?.mask) collLayer.mask[cell.y][cell.x] = true;
            this.updateCollisionCell(cell.x, cell.y);
          }
        } else if (newTileId < 0 && this.isCellSolid(cell.x, cell.y)) {
          this.pendingCollisionChanges.push({ x: cell.x, y: cell.y, prev: true, next: false });
          const collLayer = getCollisionLayer(this.mapData);
          if (collLayer?.mask) collLayer.mask[cell.y][cell.x] = false;
          this.updateCollisionCell(cell.x, cell.y);
        }
      }
    }
    this.updateCollisionOverlay();
  }

  private applyCollisionStroke(tx: number, ty: number) {
    const collLayer = getCollisionLayer(this.mapData);
    if (!collLayer?.mask || collLayer.locked) return;
    const targetSolid = !this.strokeIsErasing;
    for (const cell of this.brushCells(tx, ty)) {
      const prev = collLayer.mask[cell.y]?.[cell.x] === true;
      if (prev === targetSolid) continue;
      collLayer.mask[cell.y][cell.x] = targetSolid;
      this.pendingCollisionChanges.push({ x: cell.x, y: cell.y, prev, next: targetSolid });
      this.updateCollisionCell(cell.x, cell.y);
    }
    this.updateCollisionOverlay();
  }

  private placeObjectAt(tx: number, ty: number) {
    const ref = this.studioSettings.selectedObject;
    if (!ref) return;

    const removed: EditCommand[] = [];
    for (const obj of [...this.mapData.objects]) {
      if (obj.tileX === tx && obj.tileY === ty) {
        applyCommand(this.mapData, { kind: 'object.remove', object: obj });
        removed.push({ kind: 'object.remove', object: obj });
      }
    }

    const id = `obj_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffff).toString(36)}`;
    let object: MapObject;
    if (ref.kind === 'builtin') {
      const entry = BUILTIN_OBJECT_FOOTPRINTS.find((o) => o.type === ref.type);
      object = {
        id,
        type: ref.type,
        tileX: tx,
        tileY: ty,
        width: entry?.width ?? 1,
        height: entry?.height ?? 1,
        isSolid: entry ? entry.isSolidByDefault : true,
      };
    } else {
      object = {
        id,
        type: 'asset',
        assetId: ref.assetId,
        frame: ref.frame,
        tileX: tx,
        tileY: ty,
        width: Math.max(1, ref.widthTiles),
        height: Math.max(1, ref.heightTiles),
        isSolid: true,
      };
    }

    applyCommand(this.mapData, { kind: 'object.add', object });
    this.pendingObjectCommands.push(...removed, { kind: 'object.add', object });
    this.refreshObjects();
    this.refreshCollisionBodies();
    this.updateCollisionOverlay();
  }

  private placeSpawnAt(tx: number, ty: number) {
    const existing = getSpawnPoints(this.mapData);
    const spawn = {
      id: `spawn_${Date.now().toString(36)}`,
      name: `Spawn ${existing.length + 1}`,
      tileX: tx,
      tileY: ty,
      direction: 'down' as Direction,
    };
    applyCommand(this.mapData, { kind: 'spawn.add', spawn });
    this.pendingSpawnCommands.push({ kind: 'spawn.add', spawn });
    this.refreshSpawnMarkers();
  }

  private flushStrokeTransaction() {
    const commands: EditCommand[] = [];
    for (const [layerId, changes] of this.pendingTileChanges) {
      if (changes.length > 0) commands.push({ kind: 'tiles', layerId, changes });
    }
    if (this.pendingCollisionChanges.length > 0) {
      commands.push({ kind: 'collision', changes: this.pendingCollisionChanges });
    }
    commands.push(...this.pendingObjectCommands, ...this.pendingZoneCommands, ...this.pendingSpawnCommands);

    this.pendingTileChanges.clear();
    this.pendingCollisionChanges = [];
    this.pendingObjectCommands = [];
    this.pendingZoneCommands = [];
    this.pendingSpawnCommands = [];

    if (commands.length > 0 && this.callbacks.onEditTransaction) {
      this.callbacks.onEditTransaction(commands);
    }
  }

  // -------------------------------------------------------------------------
  // Selection + drag
  // -------------------------------------------------------------------------

  private hitTestSelectable(tx: number, ty: number): StudioSelection {
    // Topmost object first, then zones, then spawns.
    for (let i = this.mapData.objects.length - 1; i >= 0; i--) {
      const obj = this.mapData.objects[i];
      if (tx >= obj.tileX && tx < obj.tileX + obj.width && ty >= obj.tileY && ty < obj.tileY + obj.height) {
        return { kind: 'object', id: obj.id };
      }
    }
    for (const zone of this.mapData.interactionZones) {
      if (tx >= zone.tileX && tx < zone.tileX + zone.width && ty >= zone.tileY && ty < zone.tileY + zone.height) {
        return { kind: 'zone', id: zone.id };
      }
    }
    for (const spawn of getSpawnPoints(this.mapData)) {
      if (spawn.tileX === tx && spawn.tileY === ty) return { kind: 'spawn', id: spawn.id };
    }
    return null;
  }

  private beginSelectionDrag(tx: number, ty: number) {
    const hit = this.hitTestSelectable(tx, ty);
    this.studioSelection = hit;
    this.callbacks.onSelectionChange?.(hit);
    this.updateSelectionOverlay();
    if (!hit) return;

    let anchorX = tx;
    let anchorY = ty;
    if (hit.kind === 'object') {
      const obj = this.mapData.objects.find((o) => o.id === hit.id);
      if (obj) {
        anchorX = obj.tileX;
        anchorY = obj.tileY;
      }
    } else if (hit.kind === 'zone') {
      const zone = this.mapData.interactionZones.find((z) => z.id === hit.id);
      if (zone) {
        anchorX = zone.tileX;
        anchorY = zone.tileY;
      }
    } else {
      const spawn = getSpawnPoints(this.mapData).find((s) => s.id === hit.id);
      if (spawn) {
        anchorX = spawn.tileX;
        anchorY = spawn.tileY;
      }
    }

    this.dragState = {
      active: true,
      kind: hit.kind,
      id: hit.id,
      offsetX: tx - anchorX,
      offsetY: ty - anchorY,
      ghostX: anchorX,
      ghostY: anchorY,
      moved: false,
    };
  }

  private updateSelectionDrag(tx: number, ty: number) {
    const drag = this.dragState;
    if (!drag.active || !drag.id) return;
    const nx = tx - drag.offsetX;
    const ny = ty - drag.offsetY;
    if (nx === drag.ghostX && ny === drag.ghostY) return;
    drag.ghostX = nx;
    drag.ghostY = ny;
    drag.moved = true;

    // Visual feedback: move the sprite/marker with the pointer.
    if (drag.kind === 'object') {
      const img = this.objectImageMap.get(drag.id);
      const obj = this.mapData.objects.find((o) => o.id === drag.id);
      if (img && obj) {
        img.setPosition(
          nx * this.tileSize + (obj.width * this.tileSize) / 2,
          ny * this.tileSize + (obj.height * this.tileSize) / 2
        );
      }
    } else if (drag.kind === 'spawn') {
      const marker = this.spawnMarkerMap.get(drag.id);
      if (marker) {
        marker.setPosition(nx * this.tileSize + this.tileSize / 2, ny * this.tileSize + this.tileSize / 2);
      }
    }
    this.updateSelectionOverlayFromGhost(nx, ny);
  }

  private updateSelectionOverlayFromGhost(tx: number, ty: number) {
    if (!this.selectionGraphics) return;
    const g = this.selectionGraphics;
    g.clear();
    g.lineStyle(2, 0xfacc15, 0.95);
    g.strokeRect(tx * this.tileSize + 0.5, ty * this.tileSize + 0.5, this.tileSize - 1, this.tileSize - 1);
  }

  private finishSelectionDrag() {
    const drag = this.dragState;
    this.dragState = {
      active: false,
      kind: null,
      id: null,
      offsetX: 0,
      offsetY: 0,
      ghostX: 0,
      ghostY: 0,
      moved: false,
    };
    if (!drag.active || !drag.id || !drag.moved) {
      this.updateSelectionOverlay();
      return;
    }

    let command: EditCommand | null = null;
    if (drag.kind === 'object') {
      const obj = this.mapData.objects.find((o) => o.id === drag.id);
      if (obj) {
        command = {
          kind: 'object.update',
          id: obj.id,
          prev: { tileX: obj.tileX, tileY: obj.tileY },
          next: { tileX: drag.ghostX, tileY: drag.ghostY },
        };
      }
    } else if (drag.kind === 'zone') {
      const zone = this.mapData.interactionZones.find((z) => z.id === drag.id);
      if (zone) {
        command = {
          kind: 'zone.update',
          id: zone.id,
          prev: { tileX: zone.tileX, tileY: zone.tileY },
          next: { tileX: drag.ghostX, tileY: drag.ghostY },
        };
      }
    } else if (drag.kind === 'spawn') {
      const spawn = getSpawnPoints(this.mapData).find((s) => s.id === drag.id);
      if (spawn) {
        command = {
          kind: 'spawn.update',
          id: spawn.id,
          prev: { tileX: spawn.tileX, tileY: spawn.tileY },
          next: { tileX: drag.ghostX, tileY: drag.ghostY },
        };
      }
    }

    if (command) {
      applyCommand(this.mapData, command);
      this.callbacks.onEditTransaction?.([command]);
      this.refreshObjects();
      this.refreshZoneVisuals();
      this.refreshSpawnMarkers();
      this.updateSelectionOverlay();
    }
  }

  private clearSelectionInternal() {
    this.studioSelection = null;
    if (this.selectionGraphics) this.selectionGraphics.clear();
  }

  // -------------------------------------------------------------------------
  // Gameplay
  // -------------------------------------------------------------------------

  private drawClickTargetIndicator(x: number, y: number) {
    if (!this.clickIndicatorGraphics) return;
    this.clickIndicatorGraphics.clear();
    this.clickIndicatorGraphics.lineStyle(1.5, 0x38bdf8, 0.9);
    this.clickIndicatorGraphics.strokeCircle(x, y, 7);
    this.clickIndicatorGraphics.fillStyle(0x38bdf8, 0.35);
    this.clickIndicatorGraphics.fillCircle(x, y, 3);

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

  private handleInteractionPress() {
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
    if (!this.isControlsEnabled || this.isStudioMode) return;

    // NPCs take priority: talking is the most common interaction.
    if (this.currentNearbyNpc && this.npcManager) {
      sounds.playInteract();
      this.npcManager.talk(this.currentNearbyNpc);
      return;
    }

    if (this.currentNearbyZone) {
      if (this.currentNearbyZone.type === 'door_warp' && this.currentNearbyZone.warpTarget) {
        this.callbacks.onZoneChange(null);
        this.callbacks.onInteract(this.currentNearbyZone);
      } else {
        sounds.playInteract();
        this.callbacks.onInteract(this.currentNearbyZone);
      }
    }
  }

  update(time: number, delta: number) {
    // Flush dirty ground chunks once per frame
    if (this.dirtyChunks.size > 0) {
      const chunk = this.chunkSizeTiles();
      for (const key of Array.from(this.dirtyChunks)) {
        const [layerId, coords] = key.split(':');
        const [cxStr, cyStr] = coords.split(',');
        const layer = (this.mapData.layers || []).find((l) => l.id === layerId);
        if (layer) this.rebuildChunk(layer, parseInt(cxStr, 10), parseInt(cyStr, 10), chunk);
      }
      this.dirtyChunks.clear();
    }

    if (!this.player || this.isWarping) return;

    const baseSpeed = 135 * this.tileScale * this.speedMultiplier;
    const isShiftDown =
      this.isControlsEnabled &&
      ((this.cursors.shift && this.cursors.shift.isDown) || (this.shiftKey && this.shiftKey.isDown));
    const speed = isShiftDown ? baseSpeed * 1.55 : baseSpeed;

    let vx = 0;
    let vy = 0;
    let newDir: Direction = this.playerProfile.direction;

    const activeEl = document.activeElement as HTMLElement | null;
    const isInputActive =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        (activeEl.closest && activeEl.closest('input, textarea, [contenteditable="true"]')));

    const controlsAllowed = this.isControlsEnabled && !isInputActive && !this.isStudioMode;

    const arrowLeft = controlsAllowed && this.cursors.left.isDown;
    const arrowRight = controlsAllowed && this.cursors.right.isDown;
    const arrowUp = controlsAllowed && this.cursors.up.isDown;
    const arrowDown = controlsAllowed && this.cursors.down.isDown;

    const isKeyboardMoving = arrowLeft || arrowRight || arrowUp || arrowDown;

    if (isKeyboardMoving) {
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
      if (vx !== 0 && vy !== 0) {
        vx *= 0.70710678;
        vy *= 0.70710678;
      }
    } else if (controlsAllowed && this.clickTargetPos) {
      const dx = this.clickTargetPos.x - this.player.x;
      const dy = this.clickTargetPos.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3) {
        this.clickTargetPos = null;
      } else {
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
        if (Math.abs(dx) > Math.abs(dy)) newDir = dx > 0 ? 'right' : 'left';
        else newDir = dy > 0 ? 'down' : 'up';
      }
    }

    this.player.setVelocity(vx, vy);
    const isMoving = vx !== 0 || vy !== 0;

    this.player.setDepth(RemotePlayerManager.ENTITY_DEPTH_BASE + this.player.y + 0.3);

    // The animation keys follow the texture key in use (a sheet can change
    // when the player picks another character).
    const animKey = isMoving
      ? `${this.playerAvatarKey}_walk_${newDir}`
      : `${this.playerAvatarKey}_idle_${newDir}`;
    if (this.player.anims.currentAnim?.key !== animKey) {
      this.player.play(animKey, true);
    }

    this.playerProfile.direction = newDir;
    this.playerProfile.isMoving = isMoving;

    if (isMoving) {
      const stepInterval = isShiftDown ? 180 : 280;
      if (time - this.lastFootstepTime > stepInterval) {
        sounds.playFootstep();
        this.lastFootstepTime = time;
      }
    }

    if (this.playerNameTag) {
      this.playerNameTag.setPosition(this.player.x, this.player.y + 20 * this.tileScale);
      this.playerNameTag.setDepth(this.player.depth + 10);
    }

    this.activeSpeechBubbles.forEach((bubble) => {
      if (bubble.targetSprite && bubble.container) {
        bubble.container.setPosition(bubble.targetSprite.x, bubble.targetSprite.y - 36 * this.tileScale);
        bubble.container.setDepth(bubble.targetSprite.depth + 50);
      }
    });

    this.activeReactionBubbles.forEach((bubble) => {
      if (bubble.targetSprite && bubble.container && bubble.container.active) {
        bubble.container.setPosition(bubble.targetSprite.x, bubble.targetSprite.y + bubble.offsetY);
        bubble.container.setDepth(bubble.targetSprite.depth + 60);
      }
    });

    if (this.remotePlayerManager) this.remotePlayerManager.update(time, delta);

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

    const currentTileX = Math.floor(this.player.x / this.tileSize);
    const currentTileY = Math.floor(this.player.y / this.tileSize);
    this.callbacks.onPlayerMove({
      x: this.player.x,
      y: this.player.y,
      tileX: currentTileX,
      tileY: currentTileY,
      mapId: this.currentMapId,
    });

    this.checkZoneProximity(this.player.x, this.player.y);
    this.updateMockColleagues(time);
    if (this.npcManager) {
      this.npcManager.update(time, delta);
    }
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
    states: Array<{ userId: string; x: number; y: number; direction: Direction; isMoving: boolean }>
  ) {
    if (!this.remotePlayerManager) return;
    states.forEach((s) => this.remotePlayerManager.updatePlayerState(s.userId, s.x, s.y, s.direction, s.isMoving));
  }

  public handleServerCorrection(correctX: number, correctY: number) {
    if (this.player) this.player.setPosition(correctX, correctY);
  }

  public updateLocalPlayerProfile(profile: UserProfile) {
    this.playerProfile = profile;
    if (this.remotePlayerManager) this.remotePlayerManager.setLocalUserId(profile.id);
    this.updatePlayerAvatar(profile.avatarConfig);
  }

  public getPlayerPosition(): { x: number; y: number } {
    return this.player ? { x: this.player.x, y: this.player.y } : { x: 0, y: 0 };
  }

  private checkZoneProximity(playerWorldX: number, playerWorldY: number) {
    if (!this.mapData) return;

    const halfW = 9 * this.tileScale;
    const top = 4 * this.tileScale;
    const bottom = 16 * this.tileScale;
    const pLeft = playerWorldX - halfW;
    const pRight = playerWorldX + halfW;
    const pTop = playerWorldY + top;
    const pBottom = playerWorldY + bottom;

    let closestZone: InteractionZone | null = null;
    let minDistance = 5.0 * this.tileScale;

    for (const zone of this.mapData.interactionZones) {
      const zLeft = zone.tileX * this.tileSize;
      const zRight = (zone.tileX + zone.width) * this.tileSize;
      const zTop = zone.tileY * this.tileSize;
      const zBottom = (zone.tileY + zone.height) * this.tileSize;

      const dx = Math.max(0, Math.max(zLeft - pRight, pLeft - zRight));
      const dy = Math.max(0, Math.max(zTop - pBottom, pTop - zBottom));
      const dist = Math.hypot(dx, dy);

      if (dist <= minDistance && dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }
    }

    // Zones whose rectangle overlaps the player box also count (distance 0).
    if (!closestZone) {
      for (const zone of this.mapData.interactionZones) {
        const zLeft = zone.tileX * this.tileSize;
        const zRight = (zone.tileX + zone.width) * this.tileSize;
        const zTop = zone.tileY * this.tileSize;
        const zBottom = (zone.tileY + zone.height) * this.tileSize;
        if (pRight >= zLeft && pLeft <= zRight && pBottom >= zTop && pTop <= zBottom) {
          closestZone = zone;
          break;
        }
      }
    }

    const nearbyNpc = this.npcManager
      ? this.npcManager.findNearby(playerWorldX, playerWorldY, NPC_TALK_RADIUS_TILES)
      : null;

    const zoneChanged = closestZone !== this.currentNearbyZone;
    const npcChanged = nearbyNpc !== this.currentNearbyNpc;

    if (zoneChanged) {
      this.currentNearbyZone = closestZone;
      this.callbacks.onZoneChange(closestZone);
    }
    if (npcChanged) {
      this.currentNearbyNpc = nearbyNpc;
    }

    if (this.isStudioMode) {
      this.promptTag.setVisible(false);
      return;
    }

    // An NPC in range takes priority over a zone prompt.
    if (nearbyNpc) {
      this.promptTag.setVisible(true);
      this.promptTag.setPosition(nearbyNpc.sprite.x, nearbyNpc.sprite.y - 26 * this.tileScale);
      const npcText = this.promptTag.list[1] as Phaser.GameObjects.Text;
      if (npcText) npcText.setText(`Press [E] Talk to ${nearbyNpc.definition.name}`);
      return;
    }

    if (zoneChanged || npcChanged) {
      if (closestZone) {
        this.promptTag.setVisible(true);
        const targetWorldX = (closestZone.tileX + closestZone.width / 2) * this.tileSize;
        const targetWorldY = closestZone.tileY * this.tileSize - 12;
        this.promptTag.setPosition(targetWorldX, targetWorldY);
        const textObj = this.promptTag.list[1] as Phaser.GameObjects.Text;
        if (textObj) textObj.setText(closestZone.prompt || 'Press [E] Interact');
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
      // The animation key follows the texture the colleague is wearing.
      const key = `${liamEntry.sprite.texture.key}_idle_${targetDir}`;
      if (liamEntry.sprite.anims.currentAnim?.key !== key && this.anims.exists(key)) {
        liamEntry.sprite.play(key);
      }
    }
  }
}
