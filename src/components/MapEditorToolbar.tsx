/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EditorSettings,
  EditorTool,
  OfficeMapData,
} from '../types/game';
import {
  Paintbrush,
  Eraser,
  Box,
  Trash2,
  Shield,
  RotateCcw,
  Save,
  Download,
  Upload,
  RefreshCw,
  X,
  AlertTriangle,
  Check,
  Send,
  CloudRain,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface MapEditorToolbarProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onUpdateSettings: (settings: EditorSettings) => void;
  canUndo: boolean;
  onUndo: () => void;
  onSaveDraft: () => Promise<void>;
  onPublishMap: () => Promise<void>;
  onResetMap: () => void;
  currentMapData: OfficeMapData;
  onImportJson: (jsonStr: string) => void;
  isAdmin: boolean;
  onOpenWeatherModal: () => void;
}

const FLOOR_TILES = [
  { id: 0, label: 'Wood Parquet', color: '#b48a60' },
  { id: 1, label: 'Blue Carpet', color: '#223348' },
  { id: 2, label: 'Gray Marble', color: '#2d333b' },
  { id: 3, label: 'Checkered Tile', color: '#d8d4cf' },
  { id: 4, label: 'Deck Wood', color: '#785b3e' },
  { id: 5, label: 'Garden Grass', color: '#3a6338' },
];

const WALL_TILES = [
  { id: 11, label: 'Modern Drywall', color: '#29303d' },
  { id: 12, label: 'Skyline Window', color: '#3b82f6' },
  { id: 13, label: 'Glass Partition', color: '#94a3b8' },
  { id: 10, label: 'Top Moulding', color: '#1e242d' },
];

const FURNITURE_OBJECTS = [
  { type: 'desk_single', label: 'Single Desk' },
  { type: 'desk_dual', label: 'Dual Monitor Desk' },
  { type: 'chair_office', label: 'Mesh Chair' },
  { type: 'table_conference', label: 'Walnut Board Table' },
  { type: 'plant_monstera', label: 'Potted Monstera' },
  { type: 'water_cooler', label: 'Water Dispenser' },
  { type: 'coffee_machine', label: 'Espresso Counter' },
  { type: 'whiteboard', label: 'Kanban Whiteboard' },
  { type: 'server_rack', label: 'Server Rack' },
  { type: 'sofa_lounge', label: 'Lounge Sofa' },
  { type: 'phone_booth', label: 'Focus Pod' },
];

export const MapEditorToolbar: React.FC<MapEditorToolbarProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  canUndo,
  onUndo,
  onSaveDraft,
  onPublishMap,
  onResetMap,
  currentMapData,
  onImportJson,
  isAdmin,
  onOpenWeatherModal,
}) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const setTool = (tool: EditorTool) => {
    if (!isAdmin) return;
    sounds.playInteract();
    onUpdateSettings({
      ...settings,
      activeTool: tool,
      showCollisionOverlay: tool === 'toggle_collision' ? true : settings.showCollisionOverlay,
    });
  };

  const toggleCollisionView = () => {
    sounds.playInteract();
    onUpdateSettings({
      ...settings,
      showCollisionOverlay: !settings.showCollisionOverlay,
    });
  };

  const handleSaveDraft = async () => {
    if (!isAdmin) {
      showToast('Unauthorized: Only administrators can save map drafts to Firestore.');
      return;
    }
    setIsProcessing(true);
    try {
      sounds.playInteract();
      await onSaveDraft();
      showToast('Map draft saved to Cloud Firestore!');
    } catch (err: unknown) {
      showToast(`Save failed: ${(err as Error).message || 'Database error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePublish = async () => {
    if (!isAdmin) {
      showToast('Unauthorized: Only administrators can publish maps.');
      return;
    }
    if (!window.confirm('Publish this map version to all connected employees?')) {
      return;
    }
    setIsProcessing(true);
    try {
      sounds.playInteract();
      await onPublishMap();
      showToast('Map successfully published! Employees will now load this version.');
    } catch (err: unknown) {
      showToast(`Publish failed: ${(err as Error).message || 'Database error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentMapData, null, 2));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const handleApplyImport = () => {
    try {
      setImportError(null);
      onImportJson(importText);
      setShowImportModal(false);
      setImportText('');
      sounds.playInteract();
      showToast('Map imported successfully!');
    } catch (err: unknown) {
      setImportError((err as Error).message || 'Failed to parse map JSON.');
    }
  };

  return (
    <>
      {/* Floating Editor Palette */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-4xl bg-slate-900/95 border border-amber-500/50 rounded-xl shadow-2xl backdrop-blur select-none overflow-hidden flex flex-col text-slate-100">
        {/* Security & Role Header Banner */}
        <div
          className={`px-4 py-2 border-b flex items-center justify-between text-xs ${
            isAdmin
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">
              {isAdmin
                ? `Authorized Admin Session (Editing ${currentMapData.name} · v${currentMapData.version})`
                : 'Read-Only Mode: Employee accounts cannot modify or publish maps.'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Exit Map Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800">
          {/* Tool buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setTool('brush_floor')}
              disabled={!isAdmin}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                settings.activeTool === 'brush_floor'
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
              title="Paint Floor Tiles"
            >
              <Paintbrush className="w-3.5 h-3.5" />
              Floor
            </button>

            <button
              onClick={() => setTool('brush_wall')}
              disabled={!isAdmin}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                settings.activeTool === 'brush_wall'
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
              title="Paint Wall Tiles & Auto-Collision"
            >
              <Paintbrush className="w-3.5 h-3.5" />
              Wall
            </button>

            <button
              onClick={() => setTool('erase_tile')}
              disabled={!isAdmin}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                settings.activeTool === 'erase_tile'
                  ? 'bg-rose-600 border-rose-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
              title="Erase Wall or Objects"
            >
              <Eraser className="w-3.5 h-3.5" />
              Eraser
            </button>

            <button
              onClick={() => setTool('place_object')}
              disabled={!isAdmin}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                settings.activeTool === 'place_object'
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
              title="Place Furniture / Decor"
            >
              <Box className="w-3.5 h-3.5" />
              Place Furniture
            </button>

            <button
              onClick={() => setTool('delete_object')}
              disabled={!isAdmin}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                settings.activeTool === 'delete_object'
                  ? 'bg-rose-600 border-rose-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
              title="Delete Furniture Object"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>

            <button
              onClick={() => setTool('toggle_collision')}
              disabled={!isAdmin}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                settings.activeTool === 'toggle_collision'
                  ? 'bg-amber-600 border-amber-400 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
              title="Toggle Solid Collision Grid"
            >
              <Shield className="w-3.5 h-3.5" />
              Collision
            </button>

            <button
              onClick={toggleCollisionView}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-colors cursor-pointer ${
                settings.showCollisionOverlay
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Toggle Collision Grid Overlay"
            >
              Grid: {settings.showCollisionOverlay ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Action buttons (Undo, Save Draft, Publish, Weather, Export, Import) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={onUndo}
              disabled={!canUndo || !isAdmin}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${
                canUndo && isAdmin
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white cursor-pointer'
                  : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Undo Last Edit (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Undo
            </button>

            <button
              onClick={handleSaveDraft}
              disabled={isProcessing || !isAdmin}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
              title="Save Draft to Firestore"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>

            <button
              onClick={handlePublish}
              disabled={isProcessing || !isAdmin}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
              title="Publish map to all employees"
            >
              <Send className="w-3.5 h-3.5" />
              Publish
            </button>

            <button
              onClick={onOpenWeatherModal}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 hover:text-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="HQ Weather Settings"
            >
              <CloudRain className="w-3.5 h-3.5" />
              Weather
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              title="Export Map JSON"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              disabled={!isAdmin}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              title="Import Map JSON"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
          </div>
        </div>

        {/* Palette Sub-row based on active tool */}
        {isAdmin && (
          <div className="p-3 bg-slate-950/60 flex items-center gap-3 overflow-x-auto text-xs">
            {settings.activeTool === 'brush_floor' && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium shrink-0">Selected Floor:</span>
                <div className="flex items-center gap-1.5">
                  {FLOOR_TILES.map((tile) => (
                    <button
                      key={tile.id}
                      onClick={() => {
                        sounds.playInteract();
                        onUpdateSettings({ ...settings, selectedFloorTile: tile.id });
                      }}
                      className={`px-2.5 py-1 rounded-md border text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                        settings.selectedFloorTile === tile.id
                          ? 'bg-indigo-600/30 border-indigo-500 text-white font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: tile.color }} />
                      {tile.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {settings.activeTool === 'brush_wall' && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium shrink-0">Selected Wall:</span>
                <div className="flex items-center gap-1.5">
                  {WALL_TILES.map((wall) => (
                    <button
                      key={wall.id}
                      onClick={() => {
                        sounds.playInteract();
                        onUpdateSettings({ ...settings, selectedWallTile: wall.id });
                      }}
                      className={`px-2.5 py-1 rounded-md border text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                        settings.selectedWallTile === wall.id
                          ? 'bg-indigo-600/30 border-indigo-500 text-white font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: wall.color }} />
                      {wall.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {settings.activeTool === 'place_object' && (
              <div className="flex items-center gap-2 overflow-x-auto py-0.5">
                <span className="text-slate-400 font-medium shrink-0">Selected Furniture:</span>
                <div className="flex items-center gap-1.5">
                  {FURNITURE_OBJECTS.map((obj) => (
                    <button
                      key={obj.type}
                      onClick={() => {
                        sounds.playInteract();
                        onUpdateSettings({ ...settings, selectedObjectType: obj.type });
                      }}
                      className={`px-2.5 py-1 rounded-md border text-[11px] whitespace-nowrap transition-colors cursor-pointer ${
                        settings.selectedObjectType === obj.type
                          ? 'bg-indigo-600/30 border-indigo-500 text-white font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {obj.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {settings.activeTool === 'toggle_collision' && (
              <div className="text-slate-400 text-xs flex items-center gap-2">
                <span className="text-amber-400 font-medium">Collision Brush active:</span>
                <span>Click on any tile to toggle solid physics collision block.</span>
              </div>
            )}

            {settings.activeTool === 'erase_tile' && (
              <div className="text-slate-400 text-xs">
                Click any wall or object to erase it and clear its solid collision.
              </div>
            )}

            {settings.activeTool === 'delete_object' && (
              <div className="text-slate-400 text-xs">
                Click any placed furniture piece to remove it.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save / Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold shadow-xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4" />
          {toastMessage}
        </div>
      )}

      {/* Export JSON Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl flex flex-col gap-3 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Export Map Data (JSON Backup)</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Structured versioned JSON backup representing dimensions, tile layers, objects, collision mask, and zones.
            </p>
            <textarea
              readOnly
              value={JSON.stringify(currentMapData, null, 2)}
              rows={12}
              className="w-full p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-300 resize-none select-all"
            />
            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-slate-500 font-mono">
                {currentMapData.id} · v{currentMapData.version}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyJson}
                  className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  {copiedNotification ? 'Copied to Clipboard!' : 'Copy JSON'}
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl flex flex-col gap-3 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Import Map Data (JSON)</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Paste a validated map JSON below to restore or preview the layout.
            </p>
            {importError && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {importError}
              </div>
            )}
            <textarea
              placeholder="Paste map JSON here..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={12}
              className="w-full p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-200 resize-none focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyImport}
                disabled={!importText.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
              >
                Apply Map JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
