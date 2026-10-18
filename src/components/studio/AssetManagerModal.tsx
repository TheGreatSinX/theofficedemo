/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asset Manager: imports RPG Maker MZ-style sheets into the persistent asset
 * library (IndexedDB + Firestore metadata, Firebase Storage mirror when
 * available), detects duplicates / layout conventions and lets admins edit
 * metadata used by the tileset and object palettes.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Pencil, CheckCircle2, AlertTriangle, HardDrive, Cloud, Database } from 'lucide-react';
import { assetRegistry } from '../../services/AssetRegistry';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  AssetImportDraft,
  AssetMetadata,
  AssetValidationResult,
} from '../../types/assets';
import { NumberField, SelectField, TextField } from './StudioChrome';

export interface AssetManagerModalProps {
  isOpen: boolean;
  onClose(): void;
}

interface DraftState {
  draft: AssetImportDraft;
  validation: AssetValidationResult;
  include: boolean;
  importing: boolean;
  done: boolean;
  progress: number;
  stage: string;
  error?: string;
  name: string;
  category: AssetCategory;
}

const badge =
  'px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 whitespace-nowrap';

export const AssetManagerModal: React.FC<AssetManagerModalProps> = ({ isOpen, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<AssetMetadata[]>([]);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [editing, setEditing] = useState<AssetMetadata | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void assetRegistry.initialize();
    setLibrary(assetRegistry.list());
    const unsub = assetRegistry.subscribe(() => setLibrary(assetRegistry.list()));
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) setLibrary(assetRegistry.list());
  }, [isOpen]);

  if (!isOpen) return null;

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const next: DraftState[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      try {
        const { draft, validation } = await assetRegistry.prepareImport(file);
        next.push({
          draft,
          validation,
          include: validation.ok,
          importing: false,
          done: false,
          progress: 0,
          stage: '',
          name: draft.name,
          category: draft.category,
          error: undefined,
        });
      } catch (err) {
        // Skip files that fail early analysis
        console.warn('[AssetManager] prepareImport failed', file.name, err);
      }
    }
    setDrafts((prev) => [...prev, ...next]);
    setBusy(false);
  };

  const importDraft = async (index: number) => {
    const state = drafts[index];
    if (!state || state.importing || state.done) return;
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, importing: true, error: undefined } : d))
    );
    const result = await assetRegistry.confirmImport(
      { ...state.draft, name: state.name, category: state.category },
      {
        name: state.name,
        category: state.category,
        allowDuplicate: allowDuplicates,
      },
      (progress) => {
        setDrafts((prev) =>
          prev.map((d, i) =>
            i === index ? { ...d, progress: progress.percent, stage: progress.message } : d
          )
        );
      }
    );
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              importing: false,
              done: result.ok,
              error: result.ok ? undefined : result.error,
              progress: result.ok ? 100 : d.progress,
            }
          : d
      )
    );
    if (result.ok) setLibrary(assetRegistry.list());
  };

  const importAll = async () => {
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      if (d.include && d.validation.ok && !d.done && !d.importing) {
        // Sequential to keep memory and progress predictable.
        // eslint-disable-next-line no-await-in-loop
        await importDraft(i);
      }
    }
  };

  const cloudCount = library.filter((a) => a.storageBackend === 'firebase').length;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[900px] max-w-[96vw] max-h-[88vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/80 flex items-center gap-3">
          <Database className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Asset Manager</span>
          <span className="text-[10px] text-slate-400">
            {library.length} asset(s) · {cloudCount} cloud-mirrored · local IndexedDB is the source of truth
          </span>
          <button className="ml-auto text-slate-400 hover:text-white cursor-pointer" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Import area */}
          <div className="rounded-xl border border-dashed border-slate-600/80 bg-slate-950/40 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer flex items-center gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <Upload className="w-4 h-4" /> Choose images…
              </button>
              <span className="text-[11px] text-slate-400">
                RPG Maker MZ conventions detected automatically: A1–A5 autotiles, B–E tilesets,{' '}
                <span className="font-mono">$</span> single characters, <span className="font-mono">!</span> no-shift sheets.
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {drafts.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowDuplicates}
                    onChange={(e) => setAllowDuplicates(e.target.checked)}
                  />
                  Import duplicates as copies
                  <button
                    className="ml-auto px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] text-white cursor-pointer"
                    onClick={() => void importAll()}
                  >
                    Import all valid
                  </button>
                </label>

                {drafts.map((d, index) => (
                  <div
                    key={`${d.draft.file.name}_${index}`}
                    className="rounded-lg border border-slate-700/70 bg-slate-900/70 p-2 flex gap-3"
                  >
                    <div className="w-16 h-16 rounded bg-slate-950/70 border border-slate-700/60 flex items-center justify-center overflow-hidden shrink-0">
                      {d.draft.previewUrl ? (
                        <img src={d.draft.previewUrl} alt={d.name} className="max-w-full max-h-full object-contain" />
                      ) : (
                        <Upload className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={d.name}
                          onChange={(e) =>
                            setDrafts((prev) =>
                              prev.map((s, i) => (i === index ? { ...s, name: e.target.value } : s))
                            )
                          }
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-white w-48 focus:outline-none focus:border-indigo-500"
                        />
                        <select
                          value={d.category}
                          onChange={(e) =>
                            setDrafts((prev) =>
                              prev.map((s, i) =>
                                i === index ? { ...s, category: e.target.value as AssetCategory } : s
                              )
                            )
                          }
                          className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                        >
                          {ASSET_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {d.draft.file.name} · {(d.draft.file.size / 1024).toFixed(0)} KB
                        </span>
                        {d.draft.rpgMakerFamily && (
                          <span className={badge + ' bg-indigo-950 text-indigo-300 border border-indigo-700/60'}>
                            {d.draft.rpgMakerFamily}
                          </span>
                        )}
                        {d.draft.isDollar && (
                          <span className={badge + ' bg-amber-950 text-amber-300 border border-amber-700/60'}>$ single</span>
                        )}
                        {d.draft.isBang && (
                          <span className={badge + ' bg-slate-800 text-slate-300 border border-slate-600/60'}>! no-shift</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        frame {d.draft.frameWidth}×{d.draft.frameHeight}px · grid {d.draft.columns}×{d.draft.rows} ·
                        layout {d.draft.layout}
                        {d.draft.duplicateOf ? ` · duplicate of ${assetRegistry.get(d.draft.duplicateOf)?.name ?? d.draft.duplicateOf}` : ''}
                      </div>
                      {d.validation.warnings.length > 0 && (
                        <div className="text-[10px] text-amber-300 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{d.validation.warnings.join(' ')}</span>
                        </div>
                      )}
                      {d.validation.errors.length > 0 && (
                        <div className="text-[10px] text-red-300 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{d.validation.errors.join(' ')}</span>
                        </div>
                      )}
                      {d.importing && (
                        <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 transition-all"
                            style={{ width: `${d.progress}%` }}
                          />
                        </div>
                      )}
                      {d.importing && <div className="text-[10px] text-indigo-300">{d.stage}</div>}
                      {d.error && <div className="text-[10px] text-red-300">{d.error}</div>}
                      {d.done && (
                        <div className="text-[10px] text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Imported
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${
                          d.done
                            ? 'bg-slate-800 text-slate-500 cursor-default'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                        disabled={d.importing || d.done || !d.validation.ok}
                        onClick={() => void importDraft(index)}
                      >
                        {d.done ? 'Done' : 'Import'}
                      </button>
                      <button
                        className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                        onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Library */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-white">Library</div>
            {library.length === 0 ? (
              <div className="text-[11px] text-slate-500">
                No assets yet. Imported images live in IndexedDB on this device and their metadata is
                mirrored to Firestore (plus Firebase Storage when configured) so other clients can use them.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {library.map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2 flex gap-2"
                  >
                    <div className="w-14 h-14 rounded bg-slate-900 border border-slate-700/60 flex items-center justify-center overflow-hidden shrink-0">
                      {asset.thumbnailDataUrl ? (
                        <img src={asset.thumbnailDataUrl} alt={asset.name} className="max-w-full max-h-full object-contain" />
                      ) : (
                        <Database className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="text-[11px] text-slate-100 truncate" title={asset.name}>
                        {asset.name}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">
                        {asset.width}×{asset.height} · {asset.columns}×{asset.rows} @{asset.frameWidth}px
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={badge + ' bg-slate-800 text-slate-300 border border-slate-600/60'}>
                          {asset.category}
                        </span>
                        <span
                          className={
                            badge +
                            (asset.storageBackend === 'firebase'
                              ? ' bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                              : ' bg-slate-800 text-slate-300 border border-slate-600/60')
                          }
                        >
                          {asset.storageBackend === 'firebase' ? (
                            <>
                              <Cloud className="w-3 h-3" /> cloud
                            </>
                          ) : (
                            <>
                              <HardDrive className="w-3 h-3" /> local
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer flex items-center gap-0.5"
                          onClick={() => setEditing(asset)}
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          className="px-1.5 py-0.5 rounded bg-red-950/70 hover:bg-red-900/70 border border-red-800/60 text-[10px] text-red-200 cursor-pointer flex items-center gap-0.5"
                          onClick={() => {
                            if (window.confirm(`Delete asset "${asset.name}"? Maps using it will show placeholders.`)) {
                              void assetRegistry.deleteAsset(asset.id).then(() => setLibrary(assetRegistry.list()));
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Edit metadata dialog */}
        {editing && (
          <div className="border-t border-slate-700/80 bg-slate-950/70 px-4 py-3 flex flex-wrap items-end gap-3">
            <span className="text-xs font-semibold text-white">Edit: {editing.name}</span>
            <TextField
              label="Name"
              value={editing.name}
              onChange={(name) => setEditing({ ...editing, name })}
            />
            <SelectField
              label="Category"
              value={editing.category}
              options={ASSET_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
              onChange={(v) => setEditing({ ...editing, category: v as AssetCategory })}
            />
            <NumberField
              label="Frame W"
              value={editing.frameWidth}
              min={8}
              max={512}
              onChange={(frameWidth) => setEditing({ ...editing, frameWidth: Math.round(frameWidth) })}
            />
            <NumberField
              label="Frame H"
              value={editing.frameHeight}
              min={8}
              max={512}
              onChange={(frameHeight) => setEditing({ ...editing, frameHeight: Math.round(frameHeight) })}
            />
            <NumberField
              label="Cols"
              value={editing.columns}
              min={1}
              max={64}
              onChange={(columns) => setEditing({ ...editing, columns: Math.round(columns) })}
            />
            <NumberField
              label="Rows"
              value={editing.rows}
              min={1}
              max={64}
              onChange={(rows) => setEditing({ ...editing, rows: Math.round(rows) })}
            />
            <button
              className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs text-white cursor-pointer"
              onClick={() => {
                void assetRegistry
                  .updateAsset(editing.id, {
                    name: editing.name,
                    category: editing.category,
                    frameWidth: editing.frameWidth,
                    frameHeight: editing.frameHeight,
                    columns: editing.columns,
                    rows: editing.rows,
                  })
                  .then(() => setLibrary(assetRegistry.list()));
                setEditing(null);
              }}
            >
              Save metadata
            </button>
            <button
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
