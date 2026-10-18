/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio rails: the tools rail (left) with the active tool, brush size and
 * overlay toggles, and the layers + map settings panel (right).
 */

import React from 'react';
import {
  MousePointer2,
  Hand,
  Paintbrush,
  Eraser,
  Package,
  Grid2x2,
  Flag,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Layers,
  Settings2,
} from 'lucide-react';
import { MapLayerData, MapTilesetRef } from '../../types/game';
import { OfficeMapData } from '../../types/game';
import { StudioEditorSettings, StudioTool } from '../../game/OfficeScene';

// ---------------------------------------------------------------------------
// Tools rail
// ---------------------------------------------------------------------------

export interface StudioToolsRailProps {
  settings: StudioEditorSettings;
  onChange(patch: Partial<StudioEditorSettings>): void;
}

const TOOLS: Array<{ tool: StudioTool; icon: React.ReactNode; label: string; hint: string }> = [
  { tool: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select', hint: 'V' },
  { tool: 'pan', icon: <Hand className="w-4 h-4" />, label: 'Pan', hint: 'H' },
  { tool: 'paint', icon: <Paintbrush className="w-4 h-4" />, label: 'Paint tiles', hint: 'B' },
  { tool: 'erase', icon: <Eraser className="w-4 h-4" />, label: 'Erase tiles', hint: 'E' },
  { tool: 'object', icon: <Package className="w-4 h-4" />, label: 'Place objects', hint: 'O' },
  { tool: 'collision', icon: <Grid2x2 className="w-4 h-4" />, label: 'Collision brush', hint: 'C' },
  { tool: 'spawn', icon: <Flag className="w-4 h-4" />, label: 'Spawn points', hint: 'N' },
];

const RailToggle: React.FC<{
  active: boolean;
  title: string;
  onClick(): void;
  children: React.ReactNode;
}> = ({ active, title, onClick, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
      active
        ? 'bg-indigo-600 border-indigo-400 text-white'
        : 'bg-slate-800/90 border-slate-600/60 text-slate-300 hover:bg-slate-700'
    }`}
  >
    {children}
  </button>
);

export const StudioToolsRail: React.FC<StudioToolsRailProps> = ({ settings, onChange }) => {
  return (
    <div className="absolute left-2 top-16 z-30 flex flex-col gap-1 bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl backdrop-blur">
      {TOOLS.map((entry) => (
        <button
          key={entry.tool}
          onClick={() => onChange({ activeTool: entry.tool })}
          title={`${entry.label} (${entry.hint})`}
          className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
            settings.activeTool === entry.tool
              ? 'bg-indigo-600 border-indigo-400 text-white'
              : 'bg-slate-800/90 border-slate-600/60 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {entry.icon}
        </button>
      ))}

      <div className="h-px bg-slate-700/70 my-1" />

      <RailToggle
        active={settings.showGrid}
        title="Toggle grid (G)"
        onClick={() => onChange({ showGrid: !settings.showGrid })}
      >
        <span className="text-[10px] font-bold">#</span>
      </RailToggle>
      <RailToggle
        active={settings.showCollision}
        title="Toggle collision overlay"
        onClick={() => onChange({ showCollision: !settings.showCollision })}
      >
        <Lock className="w-4 h-4" />
      </RailToggle>
      <RailToggle
        active={settings.showZones}
        title="Toggle zone overlays"
        onClick={() => onChange({ showZones: !settings.showZones })}
      >
        <Flag className="w-4 h-4" />
      </RailToggle>
      <RailToggle
        active={settings.paintCollisionWithWalls}
        title="Painting walls automatically sets collision"
        onClick={() => onChange({ paintCollisionWithWalls: !settings.paintCollisionWithWalls })}
      >
        <Grid2x2 className="w-4 h-4" />
      </RailToggle>

      <div className="h-px bg-slate-700/70 my-1" />

      <div className="flex flex-col items-center gap-1" title="Brush size (1-4 tiles)">
        {[1, 2, 3, 4].map((size) => (
          <button
            key={size}
            onClick={() => onChange({ brushSize: size })}
            className={`w-9 h-7 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
              settings.brushSize === size
                ? 'bg-amber-500 border-amber-400 text-slate-950'
                : 'bg-slate-800/90 border-slate-600/60 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Layers + map settings panel
// ---------------------------------------------------------------------------

export interface StudioLayersPanelProps {
  map: OfficeMapData;
  settings: StudioEditorSettings;
  onChange(patch: Partial<StudioEditorSettings>): void;
  onAddTileLayer(depthMode: 'ground' | 'row'): void;
  onRemoveLayer(layerId: string): void;
  onUpdateLayer(layerId: string, patch: Partial<MapLayerData>): void;
  onMoveLayer(layerId: string, direction: -1 | 1): void;
  onSetTileSize(tileSize: number): void;
  onSetEnvironment(environment: 'indoor' | 'outdoor' | undefined): void;
  onSetMapName(name: string): void;
}

function describeLayer(layer: MapLayerData): string {
  if (layer.kind === 'collision') return 'Collision';
  return layer.depthMode === 'row' ? 'Row (walls, Y-sorted)' : 'Ground (flattened)';
}

function tilesetLabel(tilesets: MapTilesetRef[] | undefined): string {
  if (!tilesets || tilesets.length === 0) return '0 tilesets';
  const imported = tilesets.filter((t) => t.source === 'asset').length;
  return imported > 0 ? `${tilesets.length} tilesets (${imported} imported)` : `${tilesets.length} tileset`;
}

export const StudioLayersPanel: React.FC<StudioLayersPanelProps> = ({
  map,
  settings,
  onChange,
  onAddTileLayer,
  onRemoveLayer,
  onUpdateLayer,
  onMoveLayer,
  onSetTileSize,
  onSetEnvironment,
  onSetMapName,
}) => {
  const layers = (map.layers || []).slice().sort((a, b) => (b.order || 0) - (a.order || 0));

  return (
    <div className="absolute right-2 top-16 z-30 w-72 max-h-[46%] overflow-y-auto bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur">
      <div className="px-3 py-2 border-b border-slate-700/70 flex items-center gap-2 sticky top-0 bg-slate-900/95 z-10">
        <Layers className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-semibold text-white">Layers</span>
        <span className="text-[10px] text-slate-400 font-mono ml-auto">{layers.length}</span>
      </div>

      <div className="p-2 flex flex-col gap-1">
        {layers.map((layer) => {
          const isActive = settings.activeLayerId === layer.id;
          return (
            <div
              key={layer.id}
              className={`rounded-lg border px-2 py-1.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-indigo-950/60 border-indigo-500/60'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
              }`}
              onClick={() => onChange({ activeLayerId: layer.id })}
            >
              <div className="flex items-center gap-1.5">
                <button
                  className="text-slate-300 hover:text-white cursor-pointer"
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateLayer(layer.id, { visible: !layer.visible });
                  }}
                >
                  {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                <button
                  className="text-slate-300 hover:text-white cursor-pointer"
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateLayer(layer.id, { locked: !layer.locked });
                  }}
                >
                  {layer.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                <span className={`text-xs font-medium truncate flex-1 ${layer.visible ? 'text-slate-100' : 'text-slate-500'}`}>
                  {layer.name}
                </span>
                {isActive && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/30 text-indigo-200 font-semibold">
                    ACTIVE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 pl-0.5">
                <span className="text-[10px] text-slate-400 flex-1 truncate">{describeLayer(layer)}</span>
                <button
                  className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-30"
                  title="Move layer up"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLayer(layer.id, -1);
                  }}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-30"
                  title="Move layer down"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLayer(layer.id, 1);
                  }}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {layer.kind === 'tiles' && (
                  <button
                    className="text-slate-400 hover:text-red-400 cursor-pointer"
                    title="Remove layer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveLayer(layer.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-1.5 mt-1">
          <button
            className="flex-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[11px] text-slate-200 cursor-pointer flex items-center justify-center gap-1"
            onClick={() => onAddTileLayer('ground')}
            title="Add a flat ground layer"
          >
            <Plus className="w-3 h-3" /> Ground layer
          </button>
          <button
            className="flex-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[11px] text-slate-200 cursor-pointer flex items-center justify-center gap-1"
            onClick={() => onAddTileLayer('row')}
            title="Add a Y-sorted wall / foreground layer"
          >
            <Plus className="w-3 h-3" /> Wall layer
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-b border-slate-700/70 flex items-center gap-2 sticky top-[37px] bg-slate-900/95 z-10">
        <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-semibold text-white">Map settings</span>
      </div>

      <div className="p-2 flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-400">Map name</span>
          <input
            type="text"
            value={map.name}
            onChange={(e) => onSetMapName(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] text-slate-400">Tile size</span>
            <select
              value={map.tileSize}
              onChange={(e) => onSetTileSize(parseInt(e.target.value, 10))}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {[16, 32, 48].map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] text-slate-400">Environment</span>
            <select
              value={map.environment || 'indoor'}
              onChange={(e) =>
                onSetEnvironment(e.target.value === 'outdoor' ? 'outdoor' : 'indoor')
              }
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </label>
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          {map.width}×{map.height} tiles · {tilesetLabel(map.tilesets)}
        </div>
      </div>
    </div>
  );
};
