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
  'rpg-btn px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer';

export const NumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange(value: number): void;
  step?: number;
}> = ({ label, value, min = -100000, max = 100000, onChange, step = 1 }) => (
  <label className="flex items-center gap-1.5 text-[11px] text-rpg-text">
    <span className="text-rpg-dim">{label}</span>
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
      className="w-16 rpg-input px-1.5 py-0.5 text-xs text-rpg-text"
    />
  </label>
);

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange(value: string): void;
  width?: string;
}> = ({ label, value, onChange, width = 'w-40' }) => (
  <label className="flex items-center gap-1.5 text-[11px] text-rpg-text">
    <span className="text-rpg-dim">{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} rpg-input px-1.5 py-0.5 text-xs text-rpg-text`}
    />
  </label>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}> = ({ label, value, options, onChange }) => (
  <label className="flex items-center gap-1.5 text-[11px] text-rpg-text">
    <span className="text-rpg-dim">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rpg-input px-1.5 py-0.5 text-xs text-rpg-text"
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
    <div className="shrink-0 rpg-bar px-3 py-2 flex flex-wrap items-center gap-2 z-30">
      <span className="rpg-chip rpg-chip-gold px-2 py-0.5">
        STUDIO
      </span>
      <span className="text-xs font-semibold text-rpg-text truncate max-w-[180px]" title={map.name}>
        {map.name}
      </span>
      <span className="text-[10px] font-mono text-rpg-dim">
        {map.width}×{map.height} · {map.tileSize}px
      </span>
      {isDirty && (
        <span className="rpg-chip rpg-chip-gold px-1.5 py-0.5">
          UNSAVED
        </span>
      )}

      <div className="w-px h-5 bg-rpg-ink mx-1" />

      <button
        className={`${barButton} ${
          canUndo ? 'rpg-btn-plain' : 'cursor-not-allowed'
        }`}
        onClick={onUndo}
        disabled={!canUndo}
        title={canUndo ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
      >
        <Undo2 className="w-3.5 h-3.5" /> Undo
      </button>
      <button
        className={`${barButton} ${
          canRedo ? 'rpg-btn-plain' : 'cursor-not-allowed'
        }`}
        onClick={onRedo}
        disabled={!canRedo}
        title={canRedo ? `Redo: ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
      >
        <Redo2 className="w-3.5 h-3.5" /> Redo
      </button>

      <div className="w-px h-5 bg-rpg-ink mx-1" />

      <button
        className={`${barButton} rpg-btn-gold`}
        onClick={onSaveDraft}
        disabled={isSaving}
        title="Save draft (Ctrl+S)"
      >
        <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving…' : 'Save'}
      </button>
      <button
        className={`${barButton} ${
          isAdmin ? 'rpg-btn-gold' : 'cursor-not-allowed'
        }`}
        onClick={onPublish}
        disabled={!isAdmin || isPublishing}
        title={isAdmin ? 'Publish this revision for everyone' : 'Admins only'}
      >
        <UploadCloud className="w-3.5 h-3.5" /> {isPublishing ? 'Publishing…' : 'Publish'}
      </button>
      <button
        className={`${barButton} rpg-btn-plain`}
        onClick={onReloadFromSaved}
        title="Discard unsaved changes and reload the saved version"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Reload
      </button>

      <div className="w-px h-5 bg-rpg-ink mx-1" />

      <button
        className={`${barButton} rpg-btn-plain`}
        onClick={onExportJson}
        title="Export this map as JSON"
      >
        <Download className="w-3.5 h-3.5" /> Export
      </button>
      <button
        className={`${barButton} rpg-btn-plain`}
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
        className={`${barButton} rpg-btn-plain`}
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
        className={`${barButton} rpg-btn-plain`}
        onClick={() => setShowNewMap((v) => !v)}
        title="Create a new map"
      >
        <FilePlus2 className="w-3.5 h-3.5" /> New
      </button>
      <button
        className={`${barButton} rpg-btn-plain`}
        onClick={onOpenAssetManager}
        title="Asset manager: import RPG Maker MZ sheets"
      >
        <Image className="w-3.5 h-3.5" /> Assets
      </button>
      <button
        className={`${barButton} rpg-btn-plain`}
        onClick={onOpenMapPicker}
        title="Browse all maps"
      >
        <FolderOpen className="w-3.5 h-3.5" /> Maps
      </button>
      <button
        className={`${barButton} rpg-btn-plain`}
        onClick={onOpenWorldManager}
        title="World manager: group maps, inspect connections"
      >
        <Globe2 className="w-3.5 h-3.5" /> Worlds
      </button>

      <div className="flex-1" />

      <button
        className={`${barButton} rpg-btn-plain font-semibold`}
        onClick={onExitStudio}
        title="Back to World Mode (Esc)"
      >
        <X className="w-3.5 h-3.5" /> Exit Studio
      </button>

      {showResize && (
        <div className="rpg-window w-full flex flex-wrap items-center gap-3 px-3 py-2 mt-1">
          <span className="rpg-window-title text-[11px] font-semibold text-rpg-title">Resize map</span>
          <NumberField label="W" value={resizeW} min={1} max={MAX_MAP_DIMENSION} onChange={setResizeW} />
          <NumberField label="H" value={resizeH} min={1} max={MAX_MAP_DIMENSION} onChange={setResizeH} />
          <button
            className="rpg-btn rpg-btn-gold px-2.5 py-1 text-xs cursor-pointer"
            onClick={() => {
              onResizeMap(resizeW, resizeH);
              setShowResize(false);
            }}
          >
            Apply resize
          </button>
          <span className="text-[10px] text-rpg-dim">
            Shrinking drops content outside the new bounds (undoable).
          </span>
        </div>
      )}

      {showNewMap && (
        <div className="rpg-window w-full flex flex-wrap items-center gap-3 px-3 py-2 mt-1">
          <span className="rpg-window-title text-[11px] font-semibold text-rpg-title">New map</span>
          <TextField label="Name" value={newName} onChange={setNewName} />
          <NumberField label="W" value={newWidth} min={1} max={MAX_MAP_DIMENSION} onChange={setNewWidth} />
          <NumberField label="H" value={newHeight} min={1} max={MAX_MAP_DIMENSION} onChange={setNewHeight} />
          <label className="flex items-center gap-1.5 text-[11px] text-rpg-text">
            <span className="text-rpg-dim">Tile</span>
            <select
              value={newTileSize}
              onChange={(e) => setNewTileSize(parseInt(e.target.value, 10))}
              className="rpg-input px-1.5 py-0.5 text-xs text-rpg-text"
            >
              {SUPPORTED_TILE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          <button
            className={`rpg-btn px-2.5 py-1 text-xs cursor-pointer ${
              fileTooLarge ? 'cursor-not-allowed' : 'rpg-btn-gold'
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
            <span className="text-[10px] text-rpg-gold">Map exceeds the recommended {MAX_MAP_CELLS} cells.</span>
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
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-rpg-ink border-t-2 border-rpg-line px-3 py-1 flex flex-wrap items-center gap-4 text-[10px] font-mono text-rpg-dim">
      <span>
        Cursor: {cursor.inside ? `(${cursor.x}, ${cursor.y})` : '—'} / {map.width}×{map.height}
      </span>
      <span>Tile: {map.tileSize}px</span>
      <span>Zoom: {zoom.toFixed(2)}×</span>
      <span>
        Objects: {map.objects.length} · Zones: {map.interactionZones.length} · Spawns:{' '}
        {(map.spawnPoints || []).length}
      </span>
      <span className="text-rpg-gold">Selected: {selectionText}</span>
      <span className="flex-1" />
      <span className={isDirty ? 'text-rpg-gold' : 'text-rpg-green'}>
        {isDirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Saved'}
      </span>
      <span className="flex items-center gap-1 text-rpg-dim">
        <Info className="w-3 h-3" /> V/B/E/C/H/O/N tools · G grid · Ctrl+Z undo · Ctrl+S save
      </span>
    </div>
  );
};
