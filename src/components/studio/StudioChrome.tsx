/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio chrome: top command bar (file/edit/view actions) and bottom status
 * bar. Studio shares the map document with World Mode — every action here
 * operates on the same in-memory map that the Phaser scene renders.
 */

import React, { useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  Save,
  UploadCloud,
  RotateCcw,
  Download,
  FilePlus2,
  Scaling,
  Image,
  Globe2,
  FolderOpen,
  X,
  FileJson,
  Info,
} from 'lucide-react';
import { OfficeMapData } from '../../types/game';
import { StudioSelection } from '../../game/OfficeScene';
import { MAX_MAP_DIMENSION, MAX_MAP_CELLS, SUPPORTED_TILE_SIZES } from '../../game/maps/mapSchema';

export interface StudioCommandBarProps {
  map: OfficeMapData;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isAdmin: boolean;
  onUndo(): void;
  onRedo(): void;
  onSaveDraft(): void;
  onPublish(): void;
  onExportJson(): void;
  onImportJson(jsonText: string): void;
  onNewMap(options: { name: string; width: number; height: number; tileSize: number }): void;
  onResizeMap(width: number, height: number): void;
  onExitStudio(): void;
  onOpenAssetManager(): void;
  onOpenMapPicker(): void;
  onOpenWorldManager(): void;
  onReloadFromSaved(): void;
}

const barButton =
  'px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border';

export const NumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange(value: number): void;
  step?: number;
}> = ({ label, value, min = -100000, max = 100000, onChange, step = 1 }) => (
  <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
    <span className="text-slate-400">{label}</span>
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const next = parseFloat(e.target.value);
        if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
      }}
      className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500"
    />
  </label>
);

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange(value: string): void;
  width?: string;
}> = ({ label, value, onChange, width = 'w-40' }) => (
  <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
    <span className="text-slate-400">{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500`}
    />
  </label>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}> = ({ label, value, options, onChange }) => (
  <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
    <span className="text-slate-400">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </label>
);

export const StudioCommandBar: React.FC<StudioCommandBarProps> = ({
  map,
  isDirty,
  isSaving,
  isPublishing,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  isAdmin,
  onUndo,
  onRedo,
  onSaveDraft,
  onPublish,
  onExportJson,
  onImportJson,
  onNewMap,
  onResizeMap,
  onExitStudio,
  onOpenAssetManager,
  onOpenMapPicker,
  onOpenWorldManager,
  onReloadFromSaved,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewMap, setShowNewMap] = useState(false);
  const [showResize, setShowResize] = useState(false);
  const [newName, setNewName] = useState('New Map');
  const [newWidth, setNewWidth] = useState(40);
  const [newHeight, setNewHeight] = useState(30);
  const [newTileSize, setNewTileSize] = useState(map.tileSize || 32);
  const [resizeW, setResizeW] = useState(map.width);
  const [resizeH, setResizeH] = useState(map.height);

  const fileTooLarge = newWidth * newHeight > MAX_MAP_CELLS;

  return (
    <div className="shrink-0 bg-slate-900 border-b border-slate-700/80 px-3 py-2 flex flex-wrap items-center gap-2 z-30">
      <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black tracking-wider">
        STUDIO
      </span>
      <span className="text-xs font-semibold text-white truncate max-w-[180px]" title={map.name}>
        {map.name}
      </span>
      <span className="text-[10px] font-mono text-slate-400">
        {map.width}×{map.height} · {map.tileSize}px
      </span>
      {isDirty && (
        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
          UNSAVED
        </span>
      )}

      <div className="w-px h-5 bg-slate-700/80 mx-1" />

      <button
        className={`${barButton} ${
          canUndo
            ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
            : 'bg-slate-800/40 border-slate-700/50 text-slate-600 cursor-not-allowed'
        }`}
        onClick={onUndo}
        disabled={!canUndo}
        title={canUndo ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
      >
        <Undo2 className="w-3.5 h-3.5" /> Undo
      </button>
      <button
        className={`${barButton} ${
          canRedo
            ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
            : 'bg-slate-800/40 border-slate-700/50 text-slate-600 cursor-not-allowed'
        }`}
        onClick={onRedo}
        disabled={!canRedo}
        title={canRedo ? `Redo: ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
      >
        <Redo2 className="w-3.5 h-3.5" /> Redo
      </button>

      <div className="w-px h-5 bg-slate-700/80 mx-1" />

      <button
        className={`${barButton} bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white`}
        onClick={onSaveDraft}
        disabled={isSaving}
        title="Save draft (Ctrl+S)"
      >
        <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving…' : 'Save'}
      </button>
      <button
        className={`${barButton} ${
          isAdmin
            ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white'
            : 'bg-slate-800/40 border-slate-700/50 text-slate-600 cursor-not-allowed'
        }`}
        onClick={onPublish}
        disabled={!isAdmin || isPublishing}
        title={isAdmin ? 'Publish this revision for everyone' : 'Admins only'}
      >
        <UploadCloud className="w-3.5 h-3.5" /> {isPublishing ? 'Publishing…' : 'Publish'}
      </button>
      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={onReloadFromSaved}
        title="Discard unsaved changes and reload the saved version"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Reload
      </button>

      <div className="w-px h-5 bg-slate-700/80 mx-1" />

      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={onExportJson}
        title="Export this map as JSON"
      >
        <Download className="w-3.5 h-3.5" /> Export
      </button>
      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={() => fileInputRef.current?.click()}
        title="Import a map JSON file"
      >
        <FileJson className="w-3.5 h-3.5" /> Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') onImportJson(reader.result);
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
      />

      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={() => {
          setResizeW(map.width);
          setResizeH(map.height);
          setShowResize((v) => !v);
        }}
        title="Resize the map canvas"
      >
        <Scaling className="w-3.5 h-3.5" /> Resize
      </button>
      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={() => setShowNewMap((v) => !v)}
        title="Create a new map"
      >
        <FilePlus2 className="w-3.5 h-3.5" /> New
      </button>
      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={onOpenAssetManager}
        title="Asset manager: import RPG Maker MZ sheets"
      >
        <Image className="w-3.5 h-3.5" /> Assets
      </button>
      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={onOpenMapPicker}
        title="Browse all maps"
      >
        <FolderOpen className="w-3.5 h-3.5" /> Maps
      </button>
      <button
        className={`${barButton} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200`}
        onClick={onOpenWorldManager}
        title="World manager: group maps, inspect connections"
      >
        <Globe2 className="w-3.5 h-3.5" /> Worlds
      </button>

      <div className="flex-1" />

      <button
        className={`${barButton} bg-amber-500 hover:bg-amber-400 border-amber-400 text-slate-950 font-semibold`}
        onClick={onExitStudio}
        title="Back to World Mode (Esc)"
      >
        <X className="w-3.5 h-3.5" /> Exit Studio
      </button>

      {showResize && (
        <div className="w-full flex flex-wrap items-center gap-3 bg-slate-950/70 border border-slate-700/70 rounded-lg px-3 py-2 mt-1">
          <span className="text-[11px] font-semibold text-slate-300">Resize map</span>
          <NumberField label="W" value={resizeW} min={1} max={MAX_MAP_DIMENSION} onChange={setResizeW} />
          <NumberField label="H" value={resizeH} min={1} max={MAX_MAP_DIMENSION} onChange={setResizeH} />
          <button
            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs text-white cursor-pointer"
            onClick={() => {
              onResizeMap(resizeW, resizeH);
              setShowResize(false);
            }}
          >
            Apply resize
          </button>
          <span className="text-[10px] text-slate-400">
            Shrinking drops content outside the new bounds (undoable).
          </span>
        </div>
      )}

      {showNewMap && (
        <div className="w-full flex flex-wrap items-center gap-3 bg-slate-950/70 border border-slate-700/70 rounded-lg px-3 py-2 mt-1">
          <span className="text-[11px] font-semibold text-slate-300">New map</span>
          <TextField label="Name" value={newName} onChange={setNewName} />
          <NumberField label="W" value={newWidth} min={1} max={MAX_MAP_DIMENSION} onChange={setNewWidth} />
          <NumberField label="H" value={newHeight} min={1} max={MAX_MAP_DIMENSION} onChange={setNewHeight} />
          <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className="text-slate-400">Tile</span>
            <select
              value={newTileSize}
              onChange={(e) => setNewTileSize(parseInt(e.target.value, 10))}
              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
            >
              {SUPPORTED_TILE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          <button
            className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
              fileTooLarge ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
            disabled={fileTooLarge}
            onClick={() => {
              onNewMap({ name: newName, width: newWidth, height: newHeight, tileSize: newTileSize });
              setShowNewMap(false);
            }}
          >
            Create
          </button>
          {fileTooLarge && (
            <span className="text-[10px] text-amber-300">Map exceeds the recommended {MAX_MAP_CELLS} cells.</span>
          )}
        </div>
      )}
    </div>
  );
};

export interface StudioStatusBarProps {
  map: OfficeMapData;
  cursor: { x: number; y: number; inside: boolean };
  zoom: number;
  selection: StudioSelection;
  isDirty: boolean;
  lastSavedAt: number | null;
}

export const StudioStatusBar: React.FC<StudioStatusBarProps> = ({
  map,
  cursor,
  zoom,
  selection,
  isDirty,
  lastSavedAt,
}) => {
  const selectionText = selection
    ? `${selection.kind}${selection.id ? ` · ${selection.id}` : ''}`
    : 'no selection';
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-slate-900/95 border-t border-slate-700/80 px-3 py-1 flex flex-wrap items-center gap-4 text-[10px] font-mono text-slate-300">
      <span>
        Cursor: {cursor.inside ? `(${cursor.x}, ${cursor.y})` : '—'} / {map.width}×{map.height}
      </span>
      <span>Tile: {map.tileSize}px</span>
      <span>Zoom: {zoom.toFixed(2)}×</span>
      <span>
        Objects: {map.objects.length} · Zones: {map.interactionZones.length} · Spawns:{' '}
        {(map.spawnPoints || []).length}
      </span>
      <span className="text-amber-300">Selected: {selectionText}</span>
      <span className="flex-1" />
      <span className={isDirty ? 'text-amber-300' : 'text-emerald-300'}>
        {isDirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Saved'}
      </span>
      <span className="flex items-center gap-1 text-slate-400">
        <Info className="w-3 h-3" /> V/B/E/C/H/O/N tools · G grid · Ctrl+Z undo · Ctrl+S save
      </span>
    </div>
  );
};
