/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AvatarConfig } from '../types/game';

/**
 * Procedural Pixel Art Generator
 * Generates crisp 32x32 RPG Maker MZ style tiles, furniture, and animated character sprites.
 */

export const TILE_SIZE = 32;

// Helper to draw a pixel-perfect rectangle with optional border/shading
function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor: string,
  borderColor?: string
) {
  ctx.fillStyle = fillColor;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(w) - 1, Math.floor(h) - 1);
  }
}

/**
 * Generate all environmental tile textures
 */
export function generateTileTextures(): Record<string, HTMLCanvasElement> {
  const textures: Record<string, HTMLCanvasElement> = {};

  const createTileCanvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  };

  // 1. Wood Plank Flooring (Office Parquet)
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#b48a60';
    ctx.fillRect(0, 0, 32, 32);
    // Plank lines & grain
    ctx.fillStyle = '#9e754a';
    ctx.fillRect(0, 7, 32, 1);
    ctx.fillRect(0, 15, 32, 1);
    ctx.fillRect(0, 23, 32, 1);
    ctx.fillRect(0, 31, 32, 1);

    ctx.fillRect(16, 0, 1, 7);
    ctx.fillRect(8, 8, 1, 7);
    ctx.fillRect(24, 16, 1, 7);
    ctx.fillRect(12, 24, 1, 7);

    // Subtle grain highlights
    ctx.fillStyle = '#c59d74';
    ctx.fillRect(2, 2, 8, 1);
    ctx.fillRect(18, 10, 6, 1);
    ctx.fillRect(5, 18, 10, 1);
    ctx.fillRect(15, 26, 8, 1);
    textures['tile_wood'] = canvas;
  }

  // 2. Modern Blue Carpet
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#223348';
    ctx.fillRect(0, 0, 32, 32);
    // Grid texture
    ctx.fillStyle = '#1b293a';
    ctx.fillRect(0, 31, 32, 1);
    ctx.fillRect(31, 0, 1, 32);
    // Subtle fabric stipple
    ctx.fillStyle = '#283c54';
    for (let x = 2; x < 30; x += 4) {
      for (let y = 2; y < 30; y += 4) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
    textures['tile_carpet_blue'] = canvas;
  }

  // 3. Polished Executive Gray Marble / Stone
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#2d333b';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#22272e';
    ctx.fillRect(0, 31, 32, 1);
    ctx.fillRect(31, 0, 1, 32);
    ctx.fillStyle = '#373e47';
    ctx.fillRect(1, 1, 30, 1);
    ctx.fillRect(1, 1, 1, 30);
    // Marble vein
    ctx.fillStyle = '#444c56';
    ctx.fillRect(6, 8, 4, 1);
    ctx.fillRect(10, 9, 6, 1);
    ctx.fillRect(16, 10, 8, 1);
    textures['tile_gray'] = canvas;
  }

  // 4. Breakroom / Cafe Tile (Checkerboard)
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#d8d4cf';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#a89f91';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillRect(16, 16, 16, 16);
    ctx.fillStyle = '#7a7267';
    ctx.fillRect(0, 15, 32, 1);
    ctx.fillRect(15, 0, 1, 32);
    ctx.fillRect(0, 31, 32, 1);
    ctx.fillRect(31, 0, 1, 32);
    textures['tile_checkered'] = canvas;
  }

  // 5. Outdoor Terrace Decking
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#785b3e';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#5c432b';
    ctx.fillRect(0, 7, 32, 1);
    ctx.fillRect(0, 15, 32, 1);
    ctx.fillRect(0, 23, 32, 1);
    ctx.fillRect(0, 31, 32, 1);
    ctx.fillStyle = '#8e6d4c';
    ctx.fillRect(0, 0, 32, 1);
    ctx.fillRect(0, 8, 32, 1);
    ctx.fillRect(0, 16, 32, 1);
    ctx.fillRect(0, 24, 32, 1);
    textures['tile_deck'] = canvas;
  }

  // 6. Grass / Planter Garden
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#3a6338';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#4a7c48';
    // Grass tufts
    ctx.fillRect(4, 6, 2, 3);
    ctx.fillRect(6, 5, 2, 4);
    ctx.fillRect(18, 16, 2, 4);
    ctx.fillRect(20, 17, 2, 3);
    ctx.fillRect(10, 24, 2, 3);
    ctx.fillStyle = '#2c4d2a';
    ctx.fillRect(4, 9, 4, 1);
    ctx.fillRect(18, 20, 4, 1);
    textures['tile_grass'] = canvas;
  }

  // 7. Modern Wall Top
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#1e242d';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#333b47';
    ctx.fillRect(0, 0, 32, 4);
    ctx.fillStyle = '#15191f';
    ctx.fillRect(0, 30, 32, 2);
    textures['wall_top'] = canvas;
  }

  // 8. Modern Wall Face
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#29303d';
    ctx.fillRect(0, 0, 32, 32);
    // Wall shadow from top
    ctx.fillStyle = '#1d232e';
    ctx.fillRect(0, 0, 32, 4);
    // Baseboard moulding
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(0, 26, 32, 2);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 28, 32, 4);
    // Vertical panel lines
    ctx.fillStyle = '#232a35';
    ctx.fillRect(0, 0, 1, 26);
    ctx.fillRect(31, 0, 1, 26);
    textures['wall_face'] = canvas;
  }

  // 9. Wall Window (Skyline City View)
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = '#29303d';
    ctx.fillRect(0, 0, 32, 32);
    // Window cutout
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(3, 4, 26, 20);
    // Sky gradient & city skyline
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(4, 5, 24, 10);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(4, 15, 24, 8);
    // Silhouette towers with lit windows
    ctx.fillStyle = '#090d16';
    ctx.fillRect(6, 12, 6, 11);
    ctx.fillRect(14, 8, 8, 15);
    ctx.fillRect(23, 14, 4, 9);
    // lit window specs
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(8, 14, 1, 1);
    ctx.fillRect(16, 11, 1, 1);
    ctx.fillRect(18, 15, 1, 1);
    // Window frame
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(3, 3, 26, 1);
    ctx.fillRect(3, 23, 26, 1);
    ctx.fillRect(3, 3, 1, 21);
    ctx.fillRect(28, 3, 1, 21);
    ctx.fillRect(15, 3, 2, 21);
    // Baseboard
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 28, 32, 4);
    textures['wall_window'] = canvas;
  }

  // 10. Glass Partition (Frosted Office Wall)
  {
    const { canvas, ctx } = createTileCanvas();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.fillRect(0, 0, 32, 32);
    // Frosted stripe
    ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.fillRect(2, 10, 28, 12);
    // Aluminum frame
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 32, 3);
    ctx.fillRect(0, 29, 32, 3);
    ctx.fillRect(0, 0, 2, 32);
    ctx.fillRect(30, 0, 2, 32);
    textures['wall_glass'] = canvas;
  }

  return textures;
}

/**
 * Generate office furniture & decoration object textures
 */
export function generateObjectTextures(): Record<string, HTMLCanvasElement> {
  const textures: Record<string, HTMLCanvasElement> = {};

  const createObjCanvas = (w = 32, h = 32): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  };

  // 1. Desk with Single Laptop
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Desk surface
    drawPixelRect(ctx, 2, 8, 28, 20, '#dfba87', '#b38f5f');
    // Shadow underneath
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(3, 28, 26, 3);
    // Desk legs
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(4, 26, 2, 5);
    ctx.fillRect(26, 26, 2, 5);
    // Laptop
    ctx.fillStyle = '#374151';
    ctx.fillRect(10, 11, 12, 8); // screen
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(11, 12, 10, 6); // glowing blue screen
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(9, 19, 14, 5);  // keyboard base
    // Coffee cup
    ctx.fillStyle = '#f87171';
    ctx.fillRect(24, 14, 4, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(25, 14, 2, 1);
    textures['desk_single'] = canvas;
  }

  // 2. Desk with Dual Monitors
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Desk surface
    drawPixelRect(ctx, 2, 8, 28, 20, '#d1d5db', '#9ca3af');
    // Desk legs
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(3, 27, 2, 4);
    ctx.fillRect(27, 27, 2, 4);
    // Left Monitor
    ctx.fillStyle = '#111827';
    ctx.fillRect(4, 9, 11, 8);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(5, 10, 9, 6);
    // Right Monitor
    ctx.fillStyle = '#111827';
    ctx.fillRect(17, 9, 11, 8);
    ctx.fillStyle = '#4ade80'; // code editor screen
    ctx.fillRect(18, 10, 9, 6);
    // Keyboard & Mousepad
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(10, 20, 12, 4);
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(24, 20, 4, 5);
    textures['desk_dual'] = canvas;
  }

  // 3. Ergonomic Office Chair (Facing Down)
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Castors / 5-star base
    ctx.fillStyle = '#111827';
    ctx.fillRect(12, 24, 8, 3);
    ctx.fillRect(15, 20, 2, 5);
    // Seat cushion
    drawPixelRect(ctx, 8, 14, 16, 10, '#2563eb', '#1d4ed8');
    // Mesh Backrest
    drawPixelRect(ctx, 9, 4, 14, 11, '#1e40af', '#172554');
    // Armrests
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(6, 12, 2, 9);
    ctx.fillRect(24, 12, 2, 9);
    textures['chair_office'] = canvas;
  }

  // 4. Conference Table (Modular Tile)
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Rich walnut wood surface
    drawPixelRect(ctx, 0, 4, 32, 24, '#6b4423', '#4a2c11');
    // Center tech strip
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(4, 14, 24, 4);
    // Embedded microphone pods
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(8, 15, 2, 2);
    ctx.fillRect(22, 15, 2, 2);
    textures['table_conference'] = canvas;
  }

  // 5. Potted Monstera Plant
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Ceramic white pot
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(8, 28, 16, 3);
    drawPixelRect(ctx, 10, 20, 12, 9, '#f8fafc', '#cbd5e1');
    ctx.fillStyle = '#573a21'; // soil
    ctx.fillRect(11, 20, 10, 2);
    // Stems & Lush broad leaves
    ctx.fillStyle = '#15803d';
    // Center leaf
    ctx.fillRect(13, 8, 6, 12);
    ctx.fillRect(11, 10, 10, 6);
    // Left leaf
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(6, 11, 7, 7);
    ctx.fillRect(8, 9, 4, 3);
    // Right leaf
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(19, 12, 8, 6);
    ctx.fillRect(18, 10, 4, 3);
    // Leaf fenestrations (cuts)
    ctx.fillStyle = '#14532d';
    ctx.fillRect(15, 11, 1, 6);
    ctx.fillRect(9, 13, 1, 3);
    ctx.fillRect(22, 14, 1, 3);
    textures['plant_monstera'] = canvas;
  }

  // 6. Water Cooler
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // White body base
    drawPixelRect(ctx, 8, 14, 16, 17, '#f1f5f9', '#94a3b8');
    // Dispenser alcove
    ctx.fillStyle = '#334155';
    ctx.fillRect(11, 19, 10, 6);
    // Red & Blue taps
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(13, 18, 2, 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(17, 18, 2, 2);
    // 5-Gallon transparent blue jug with water bubble
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(10, 3, 12, 11);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(12, 4, 3, 8); // water highlight
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(12, 13, 8, 2); // collar neck
    textures['water_cooler'] = canvas;
  }

  // 7. Coffee Espresso Machine Counter
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Stainless steel counter
    drawPixelRect(ctx, 2, 12, 28, 18, '#64748b', '#475569');
    // Espresso Machine
    drawPixelRect(ctx, 6, 6, 20, 14, '#1e293b', '#0f172a');
    // Chrome face & gauges
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(8, 9, 16, 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(9, 10, 2, 2); // steam gauge
    ctx.fillStyle = '#10b981';
    ctx.fillRect(13, 10, 2, 2); // power indicator
    // Dual portafilters & drip tray
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 13, 4, 3);
    ctx.fillRect(18, 13, 4, 3);
    // Tiny espresso cups
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(11, 16, 2, 2);
    ctx.fillRect(19, 16, 2, 2);
    textures['coffee_machine'] = canvas;
  }

  // 8. Whiteboard (32x32)
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Aluminum rolling frame legs
    ctx.fillStyle = '#64748b';
    ctx.fillRect(4, 25, 2, 6);
    ctx.fillRect(26, 25, 2, 6);
    ctx.fillRect(2, 30, 6, 2);
    ctx.fillRect(24, 30, 6, 2);
    // Board surface
    drawPixelRect(ctx, 2, 4, 28, 21, '#ffffff', '#94a3b8');
    // Pen tray
    ctx.fillStyle = '#475569';
    ctx.fillRect(4, 24, 24, 2);
    // Colorful sticky notes & diagram lines
    ctx.fillStyle = '#facc15'; // yellow sticky
    ctx.fillRect(5, 7, 4, 4);
    ctx.fillRect(10, 7, 4, 4);
    ctx.fillStyle = '#ec4899'; // pink sticky
    ctx.fillRect(5, 13, 4, 4);
    ctx.fillStyle = '#38bdf8'; // blue sticky
    ctx.fillRect(16, 7, 5, 4);
    // Chart flow lines
    ctx.fillStyle = '#334155';
    ctx.fillRect(16, 14, 10, 1);
    ctx.fillRect(16, 17, 7, 1);
    ctx.fillRect(22, 14, 1, 6);
    textures['whiteboard'] = canvas;
  }

  // 9. Server Rack with Blinking LEDs
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    drawPixelRect(ctx, 4, 2, 24, 28, '#0f172a', '#334155');
    // Unit bays
    for (let y = 5; y < 27; y += 4) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(6, y, 20, 3);
      // Status LEDs
      ctx.fillStyle = '#10b981'; // green
      ctx.fillRect(8, y + 1, 1, 1);
      ctx.fillStyle = '#06b6d4'; // cyan
      ctx.fillRect(10, y + 1, 1, 1);
      ctx.fillStyle = '#3b82f6'; // blue
      ctx.fillRect(12, y + 1, 1, 1);
      // Drive slots
      ctx.fillStyle = '#475569';
      ctx.fillRect(16, y + 1, 8, 1);
    }
    textures['server_rack'] = canvas;
  }

  // 10. Cozy Lounge Sofa (32x32)
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Backrest
    drawPixelRect(ctx, 2, 6, 28, 10, '#047857', '#065f46');
    // Cushion seat
    drawPixelRect(ctx, 2, 14, 28, 12, '#059669', '#047857');
    // Left & Right Armrests
    drawPixelRect(ctx, 1, 9, 5, 17, '#064e3b', '#022c22');
    drawPixelRect(ctx, 26, 9, 5, 17, '#064e3b', '#022c22');
    // Center cushion seam
    ctx.fillStyle = '#047857';
    ctx.fillRect(15, 14, 2, 12);
    textures['sofa_lounge'] = canvas;
  }

  // 11. Door Warp Mat (Active teleporter pad)
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.fillRect(2, 2, 28, 28);
    // Tech border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.strokeRect(3.5, 3.5, 25, 25);
    // Chevron arrows
    ctx.fillStyle = '#60a5fa';
    // Arrow pointing up
    ctx.fillRect(15, 9, 2, 4);
    ctx.fillRect(13, 11, 6, 2);
    ctx.fillRect(11, 13, 10, 2);
    ctx.fillRect(15, 17, 2, 4);
    ctx.fillRect(13, 19, 6, 2);
    ctx.fillRect(11, 21, 10, 2);
    textures['door_warp'] = canvas;
  }

  // 12. Acoustic Phone Booth (Privacy Pod)
  {
    const { canvas, ctx } = createObjCanvas(32, 32);
    // Exterior acoustic felt shell
    drawPixelRect(ctx, 4, 2, 24, 28, '#1e293b', '#0f172a');
    // Glass door panel
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.fillRect(7, 5, 18, 22);
    // Interior stool & shelf
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(11, 17, 10, 2); // shelf
    ctx.fillStyle = '#475569';
    ctx.fillRect(14, 22, 4, 4);  // stool
    // "ON AIR" light on top
    ctx.fillStyle = '#10b981';
    ctx.fillRect(13, 3, 6, 2);
    textures['phone_booth'] = canvas;
  }

  return textures;
}

/**
 * Generate 96x128 4-direction, 3-frame animated character spritesheet.
 * 
 * Frame layout:
 * Columns: 0 = Step Left, 1 = Idle, 2 = Step Right
 * Rows: 0 = Facing DOWN, 1 = Facing LEFT, 2 = Facing RIGHT, 3 = Facing UP
 */
export function generateAvatarSpritesheet(config: AvatarConfig): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96; // 3 frames * 32px
  canvas.height = 128; // 4 directions * 32px
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const skin = config.skinColor || '#f8c291';
  const hair = config.hairColor || '#4a3728';
  const shirt = config.shirtColor || '#2563eb';
  const pants = config.pantsColor || '#1e293b';
  const shoe = '#0f172a';

  // 4 directions: 0 = down, 1 = left, 2 = right, 3 = up
  // 3 frames: 0 = step1, 1 = idle, 2 = step2
  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * 32;
      const oy = dir * 32;

      // Subtle step offset & head bob
      const isStepping = frame !== 1;
      const headBob = frame === 1 ? 0 : 1;
      const stepOffset = frame === 0 ? -1 : frame === 2 ? 1 : 0;

      // 1. Soft Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(ox + 16, oy + 29, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Legs / Shoes
      if (dir === 0) { // DOWN
        ctx.fillStyle = pants;
        ctx.fillRect(ox + 12 + stepOffset, oy + 21, 3, 6);
        ctx.fillRect(ox + 17 - stepOffset, oy + 21, 3, 6);
        ctx.fillStyle = shoe;
        ctx.fillRect(ox + 11 + stepOffset, oy + 27, 4, 3);
        ctx.fillRect(ox + 17 - stepOffset, oy + 27, 4, 3);
      } else if (dir === 1) { // LEFT
        ctx.fillStyle = pants;
        if (isStepping) {
          ctx.fillRect(ox + 13 + stepOffset * 2, oy + 21, 4, 6);
          ctx.fillRect(ox + 16 - stepOffset * 2, oy + 21, 3, 6);
          ctx.fillStyle = shoe;
          ctx.fillRect(ox + 12 + stepOffset * 2, oy + 27, 4, 3);
          ctx.fillRect(ox + 15 - stepOffset * 2, oy + 27, 4, 3);
        } else {
          ctx.fillRect(ox + 14, oy + 21, 5, 6);
          ctx.fillStyle = shoe;
          ctx.fillRect(ox + 13, oy + 27, 5, 3);
        }
      } else if (dir === 2) { // RIGHT
        ctx.fillStyle = pants;
        if (isStepping) {
          ctx.fillRect(ox + 13 - stepOffset * 2, oy + 21, 3, 6);
          ctx.fillRect(ox + 15 + stepOffset * 2, oy + 21, 4, 6);
          ctx.fillStyle = shoe;
          ctx.fillRect(ox + 13 - stepOffset * 2, oy + 27, 4, 3);
          ctx.fillRect(ox + 16 + stepOffset * 2, oy + 27, 4, 3);
        } else {
          ctx.fillRect(ox + 13, oy + 21, 5, 6);
          ctx.fillStyle = shoe;
          ctx.fillRect(ox + 14, oy + 27, 5, 3);
        }
      } else { // UP
        ctx.fillStyle = pants;
        ctx.fillRect(ox + 12 - stepOffset, oy + 21, 3, 6);
        ctx.fillRect(ox + 17 + stepOffset, oy + 21, 3, 6);
        ctx.fillStyle = shoe;
        ctx.fillRect(ox + 12 - stepOffset, oy + 27, 3, 3);
        ctx.fillRect(ox + 17 + stepOffset, oy + 27, 3, 3);
      }

      // 3. Torso / Shirt
      ctx.fillStyle = shirt;
      const torsoY = oy + 14 + headBob;
      if (dir === 0) { // DOWN
        ctx.fillRect(ox + 11, torsoY, 10, 8);
        // Collar & Tie/Crease
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 15, torsoY, 2, 2);
        // Hands
        ctx.fillStyle = skin;
        ctx.fillRect(ox + 9, torsoY + 4, 2, 3);
        ctx.fillRect(ox + 21, torsoY + 4, 2, 3);
      } else if (dir === 1) { // LEFT
        ctx.fillRect(ox + 12, torsoY, 8, 8);
        ctx.fillStyle = skin;
        ctx.fillRect(ox + 11 - (stepOffset > 0 ? 1 : 0), torsoY + 4, 3, 3);
      } else if (dir === 2) { // RIGHT
        ctx.fillRect(ox + 12, torsoY, 8, 8);
        ctx.fillStyle = skin;
        ctx.fillRect(ox + 18 + (stepOffset > 0 ? 1 : 0), torsoY + 4, 3, 3);
      } else { // UP
        ctx.fillRect(ox + 11, torsoY, 10, 8);
        // Back of collar
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(ox + 14, torsoY, 4, 2);
      }

      // 4. Head & Face
      const headY = oy + 6 + headBob;
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 11, headY, 10, 9);

      if (dir === 0) { // Facing DOWN
        // Eyes
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(ox + 13, headY + 4, 2, 2);
        ctx.fillRect(ox + 17, headY + 4, 2, 2);
        // Eye shine
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 13, headY + 4, 1, 1);
        ctx.fillRect(ox + 17, headY + 4, 1, 1);
        // Subtle smile
        ctx.fillStyle = '#d97706';
        ctx.fillRect(ox + 15, headY + 7, 2, 1);
      } else if (dir === 1) { // Facing LEFT
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(ox + 12, headY + 4, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 12, headY + 4, 1, 1);
      } else if (dir === 2) { // Facing RIGHT
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(ox + 18, headY + 4, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 19, headY + 4, 1, 1);
      }

      // 5. Hair
      ctx.fillStyle = hair;
      if (config.hairStyle !== 'bald') {
        if (dir === 0) { // DOWN
          // Hair cap on top
          ctx.fillRect(ox + 10, headY - 1, 12, 4);
          ctx.fillRect(ox + 10, headY + 2, 2, 3);
          ctx.fillRect(ox + 20, headY + 2, 2, 3);
          if (config.hairStyle === 'long') {
            ctx.fillRect(ox + 9, headY + 4, 2, 7);
            ctx.fillRect(ox + 21, headY + 4, 2, 7);
          } else if (config.hairStyle === 'spiky') {
            ctx.fillRect(ox + 11, headY - 3, 3, 3);
            ctx.fillRect(ox + 15, headY - 4, 3, 4);
            ctx.fillRect(ox + 19, headY - 3, 2, 3);
          } else if (config.hairStyle === 'curly') {
            ctx.fillRect(ox + 9, headY - 2, 4, 3);
            ctx.fillRect(ox + 14, headY - 2, 4, 3);
            ctx.fillRect(ox + 19, headY - 2, 4, 3);
          }
        } else if (dir === 1) { // LEFT
          ctx.fillRect(ox + 10, headY - 1, 12, 4);
          ctx.fillRect(ox + 16, headY + 2, 5, 5); // back of head hair
          if (config.hairStyle === 'long') {
            ctx.fillRect(ox + 17, headY + 6, 4, 7);
          }
        } else if (dir === 2) { // RIGHT
          ctx.fillRect(ox + 10, headY - 1, 12, 4);
          ctx.fillRect(ox + 11, headY + 2, 5, 5); // back of head hair
          if (config.hairStyle === 'long') {
            ctx.fillRect(ox + 11, headY + 6, 4, 7);
          }
        } else { // UP
          // Full back hair
          ctx.fillRect(ox + 10, headY - 1, 12, 9);
          if (config.hairStyle === 'long') {
            ctx.fillRect(ox + 10, headY + 7, 12, 6);
          }
        }
      }

      // 6. Optional Accessory
      if (config.accessory === 'glasses' && dir === 0) {
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(ox + 12, headY + 3, 3, 3);
        ctx.fillRect(ox + 17, headY + 3, 3, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 15, headY + 4, 2, 1);
      } else if (config.accessory === 'headset') {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(ox + 11, headY, 10, 1);
        ctx.fillRect(ox + 9, headY + 2, 2, 3);
        ctx.fillRect(ox + 21, headY + 2, 2, 3);
        if (dir === 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(ox + 10, headY + 5, 3, 1); // mic boom
        }
      } else if (config.accessory === 'badge' && dir === 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(ox + 18, torsoY + 2, 2, 3);
      }
    }
  }

  return canvas;
}
