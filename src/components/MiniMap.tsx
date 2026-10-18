/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mini-map: renders a compact top-down preview of the active map. Reads the
 * schema-v2 layer data (with legacy `floorTiles`/`solidMask` fallback) so it
 * stays correct for both migrated factory maps and edited maps.
 */

import React, { useRef, useEffect } from 'react';
import { OfficeMapData, UserProfile } from '../types/game';
import { Map, Maximize2, Minimize2 } from 'lucide-react';
import { getCollisionMask, getTileLayers } from '../game/maps/mapSchema';

interface MiniMapProps {
  mapData: OfficeMapData;
  playerTileX: number;
  playerTileY: number;
  colleagues: UserProfile[];
  isOpen: boolean;
  onToggle: () => void;
}

/** Builtin tile id -> minimap color. */
const TILE_COLORS: Record<number, string> = {
  0: '#3a2e22', // wood floor
  1: '#1e293b', // blue carpet
  2: '#334155', // gray stone
  3: '#3f3f46', // checkered break room
  4: '#4b3f2f', // outdoor deck
  5: '#14532d', // grass
  10: '#475569', // wall top
  11: '#64748b', // wall face
  12: '#0e7490', // window
  13: '#312e81', // glass partition
};

const ASSET_TILE_COLOR = '#4c1d95';
const EMPTY_TILE_COLOR = '#0b1120';

export const MiniMap: React.FC<MiniMapProps> = ({
  mapData,
  playerTileX,
  playerTileY,
  colleagues,
  isOpen,
  onToggle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current || !mapData) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = 6; // pixels per tile on minimap
    canvas.width = mapData.width * scale;
    canvas.height = mapData.height * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tileLayers = getTileLayers(mapData);
    const groundLayer = tileLayers.find((l) => l.depthMode === 'ground') || tileLayers[0];
    const rowLayers = tileLayers.filter((l) => l.depthMode === 'row');
    const legacyFloor = mapData.floorTiles;
    const collisionMask = getCollisionMask(mapData);

    // 1. Draw ground tiles (active layer data first, legacy fields as fallback)
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        let tileId: number | undefined = groundLayer?.tiles?.[y]?.[x];
        if (tileId === undefined) tileId = legacyFloor?.[y]?.[x];
        let color = EMPTY_TILE_COLOR;
        if (tileId !== undefined && tileId >= 0) {
          color = TILE_COLORS[tileId] ?? ASSET_TILE_COLOR;
        }
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    // 2. Draw wall / foreground layers
    for (const layer of rowLayers) {
      if (!layer.tiles || layer.visible === false) continue;
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const tileId = layer.tiles[y]?.[x] ?? -1;
          if (tileId < 0) continue;
          ctx.fillStyle = TILE_COLORS[tileId] ?? ASSET_TILE_COLOR;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    // 3. Draw solid collision tiles as a light overlay
    for (let y = 0; y < mapData.height; y++) {
      const row = collisionMask[y];
      if (!row) continue;
      for (let x = 0; x < mapData.width; x++) {
        if (!row[x]) continue;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    // 4. Draw interaction zones (colored subtle overlays)
    mapData.interactionZones.forEach((zone) => {
      ctx.fillStyle =
        zone.type === 'meeting_room' ? 'rgba(99, 102, 241, 0.45)' : 'rgba(234, 179, 8, 0.35)';
      ctx.fillRect(zone.tileX * scale, zone.tileY * scale, zone.width * scale, zone.height * scale);
    });

    // 5. Draw colleagues blips
    colleagues
      .filter((u) => u.currentMapId === mapData.id)
      .forEach((colleague) => {
        ctx.fillStyle = colleague.status === 'in_meeting' ? '#a855f7' : '#10b981';
        ctx.beginPath();
        ctx.arc(
          colleague.x * scale + scale / 2,
          colleague.y * scale + scale / 2,
          scale / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

    // 6. Draw Player blip (pulsing white/cyan marker)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(playerTileX * scale + scale / 2, playerTileY * scale + scale / 2, scale / 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [mapData, playerTileX, playerTileY, colleagues, isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute top-16 left-4 z-20 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-medium flex items-center gap-1.5 shadow-lg backdrop-blur transition-colors cursor-pointer"
        title="Toggle Mini-map [M]"
      >
        <Map className="w-3.5 h-3.5 text-indigo-400" />
        <span>Map</span>
      </button>
    );
  }

  return (
    <div className="absolute top-16 left-4 z-20 bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur select-none flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-white flex items-center gap-1.5">
          <Map className="w-3.5 h-3.5 text-indigo-400" />
          {mapData.name.split('(')[0]}
        </span>
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
        <canvas ref={canvasRef} className="max-w-[200px] max-h-[160px]" />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span>
          X: {playerTileX} Y: {playerTileY}
        </span>
        <span className="text-cyan-400 font-sans">You: ● Blue</span>
      </div>
    </div>
  );
};
