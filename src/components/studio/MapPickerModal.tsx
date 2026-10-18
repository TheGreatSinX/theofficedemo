/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Map browser: lists every map (factory + saved + drafts), and exposes the
 * open / edit / export / reset / delete / import actions.
 */

import React, { useRef } from 'react';
import { X, FolderOpen, Wrench, Download, RotateCcw, Trash2, FileJson, RefreshCw, Factory } from 'lucide-react';
import { MapSummary } from '../../services/MapRepository';

export interface MapPickerModalProps {
  isOpen: boolean;
  onClose(): void;
  maps: MapSummary[];
  currentMapId: string;
  onOpenMap(mapId: string): void;
  onEditMap(mapId: string): void;
  onExportMap(mapId: string): void;
  onResetMap(mapId: string): void;
  onDeleteMap(mapId: string): void;
  onRefresh(): void;
  onImportJson(jsonText: string): void;
  showToast(kind: 'info' | 'success' | 'error', message: string, ms?: number): void;
}

export const MapPickerModal: React.FC<MapPickerModalProps> = ({
  isOpen,
  onClose,
  maps,
  currentMapId,
  onOpenMap,
  onEditMap,
  onExportMap,
  onResetMap,
  onDeleteMap,
  onRefresh,
  onImportJson,
  showToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[820px] max-w-[96vw] max-h-[86vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/80 flex items-center gap-3">
          <FolderOpen className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Maps</span>
          <span className="text-[10px] text-slate-400">{maps.length} map(s)</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[11px] text-slate-200 cursor-pointer flex items-center gap-1"
              onClick={onRefresh}
              title="Refresh list"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            <button
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[11px] text-slate-200 cursor-pointer flex items-center gap-1"
              onClick={() => fileInputRef.current?.click()}
              title="Import a map JSON file"
            >
              <FileJson className="w-3 h-3" /> Import JSON
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
            <button className="text-slate-400 hover:text-white cursor-pointer" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {maps.map((map) => {
            const isCurrent = map.id === currentMapId;
            return (
              <div
                key={map.id}
                className={`rounded-xl border p-3 flex flex-col gap-2 ${
                  isCurrent ? 'bg-indigo-950/40 border-indigo-500/50' : 'bg-slate-800/50 border-slate-700/60'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-100 truncate">{map.name}</span>
                  {isCurrent && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/30 text-indigo-200 font-semibold">
                      CURRENT
                    </span>
                  )}
                  {map.isFactory && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-300 flex items-center gap-0.5">
                      <Factory className="w-2.5 h-2.5" /> factory
                    </span>
                  )}
                  {map.status === 'draft' && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300">draft</span>
                  )}
                  {map.status === 'published' && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300">published</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {map.id} · {map.width}×{map.height} @ {map.tileSize}px
                  {typeof map.objectCount === 'number' ? ` · ${map.objectCount} object(s)` : ''}
                  {map.updatedAt ? ` · updated ${new Date(map.updatedAt).toLocaleString()}` : ''}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] text-white cursor-pointer flex items-center gap-1"
                    onClick={() => onOpenMap(map.id)}
                  >
                    <FolderOpen className="w-3 h-3" /> Open
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-[11px] text-slate-950 font-semibold cursor-pointer flex items-center gap-1"
                    onClick={() => onEditMap(map.id)}
                  >
                    <Wrench className="w-3 h-3" /> Edit
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-200 cursor-pointer flex items-center gap-1"
                    onClick={() => onExportMap(map.id)}
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-200 cursor-pointer flex items-center gap-1"
                    onClick={() => {
                      if (window.confirm(`Reset "${map.name}" to its factory layout?`)) onResetMap(map.id);
                    }}
                    title={map.isFactory ? 'Reset to factory layout' : 'Reset (no factory version — clears saved copy)'}
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                  <button
                    className={`px-2 py-1 rounded text-[11px] cursor-pointer flex items-center gap-1 ${
                      map.isFactory
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-red-950/70 hover:bg-red-900/70 border border-red-800/60 text-red-200'
                    }`}
                    disabled={map.isFactory}
                    title={map.isFactory ? 'Factory maps cannot be deleted' : 'Delete this map'}
                    onClick={() => {
                      if (window.confirm(`Delete map "${map.name}"? This cannot be undone.`)) {
                        onDeleteMap(map.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
          {maps.length === 0 && (
            <div className="col-span-2 text-center text-xs text-slate-500 py-8">
              No maps found. Refresh the list or import a JSON file.
              <div className="mt-2">
                <button
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[11px] text-slate-200 cursor-pointer"
                  onClick={() => showToast('info', 'Tip: use Studio → New to create your first map.')}
                >
                  How do I create a map?
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
