/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { OfficeMapData, UserProfile } from '../types/game';
import { Map, Maximize2, Minimize2 } from 'lucide-react';

interface MiniMapProps {
  mapData: OfficeMapData;
  playerTileX: number;
  playerTileY: number;
  colleagues: UserProfile[];
  isOpen: boolean;
  onToggle: () => void;
}

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

    // 1. Draw floor tiles
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const floorId = mapData.floorTiles[y][x];
        if (floorId === 1) {
          ctx.fillStyle = '#1e293b'; // carpet
        } else if (floorId === 3) {
          ctx.fillStyle = '#334155'; // checkered
        } else if (floorId === 5) {
          ctx.fillStyle = '#14532d'; // grass
        } else {
          ctx.fillStyle = '#1e1e24'; // wood
        }
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    // 2. Draw solid walls & objects
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        if (mapData.solidMask[y][x]) {
          ctx.fillStyle = '#475569';
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    // 3. Draw interaction zones (colored subtle overlays)
    mapData.interactionZones.forEach((zone) => {
      ctx.fillStyle = zone.type === 'meeting_room' ? 'rgba(99, 102, 241, 0.45)' : 'rgba(234, 179, 8, 0.35)';
      ctx.fillRect(zone.tileX * scale, zone.tileY * scale, zone.width * scale, zone.height * scale);
    });

    // 4. Draw colleagues blips
    colleagues
      .filter((u) => u.currentMapId === mapData.id)
      .forEach((colleague) => {
        ctx.fillStyle = colleague.status === 'in_meeting' ? '#a855f7' : '#10b981';
        ctx.beginPath();
        ctx.arc(colleague.x * scale + scale / 2, colleague.y * scale + scale / 2, scale / 2, 0, Math.PI * 2);
        ctx.fill();
      });

    // 5. Draw Player blip (pulsing white/cyan marker)
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
        <span>X: {playerTileX} Y: {playerTileY}</span>
        <span className="text-cyan-400 font-sans">You: ● Blue</span>
      </div>
    </div>
  );
};
