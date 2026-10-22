/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio palette: builtin tile catalog, imported tileset sheets (click a frame
 * to select it), placeable objects and the asset library entry point.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Palette as PaletteIcon, ChevronDown, ChevronUp, ImagePlus, Plus, Check } from 'lucide-react';
import { MapTilesetRef, OfficeMapData } from '../../types/game';
import { StudioEditorSettings, StudioObjectRef } from '../../game/OfficeScene';
import { BUILTIN_OBJECTS, BUILTIN_TILES } from '../../game/maps/mapSchema';
import { getObjectSprite } from '../../game/objectSprites';
import { assetRegistry } from '../../services/AssetRegistry';
import { AssetCategory } from '../../types/assets';

export interface StudioPaletteProps {
  map: OfficeMapData;
  settings: StudioEditorSettings;
  onSelectTile(tileId: number): void;
  onSelectObject(ref: StudioObjectRef): void;
  /** Adds a tileset for the asset if missing; returns its first global tile id. */
  onAddTileset(assetId: string): number | null;
  onOpenAssetManager(): void;
}

const OBJECT_ASSET_CATEGORIES: AssetCategory[] = ['object', 'decoration', 'door', 'plant', 'prop'];

const TILE_ASSET_CATEGORIES: AssetCategory[] = ['tileset', 'autotile'];

/** Renders a full imported sheet scaled down; clicking picks a frame. */
const TilesetSheetCanvas: React.FC<{
  tileset: MapTilesetRef;
  onPickFrame(frame: number): void;
}> = ({ tileset, onPickFrame }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas || !tileset.assetId) return;
      let img = assetRegistry.getCachedImage(tileset.assetId);
      if (!img) {
        await assetRegistry.getImage(tileset.assetId);
        img = assetRegistry.getCachedImage(tileset.assetId);
        if (cancelled) return;
        setVersion((v) => v + 1);
      }
      if (!img) return;

      const maxWidth = 236;
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      canvas.width = Math.max(1, Math.floor(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.floor(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    draw();
    return () => {
      cancelled = true;
    };
  }, [tileset.assetId, version]);

  const tileCount = Math.max(1, tileset.columns * tileset.rows);

  return (
    <div
      className="rounded-md border border-rpg-line overflow-hidden cursor-crosshair"
      style={{
        backgroundImage:
          'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
        backgroundSize: '12px 12px',
        backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
          const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
          const colW = canvas.width / Math.max(1, tileset.columns);
          const rowH = canvas.height / Math.max(1, tileset.rows);
          const frame =
            Math.min(tileset.columns - 1, Math.floor(px / colW)) +
            Math.min(tileset.rows - 1, Math.floor(py / rowH)) * tileset.columns;
          if (frame >= 0 && frame < tileCount) onPickFrame(frame);
        }}
        className="block"
      />
    </div>
  );
};

export const StudioPalette: React.FC<StudioPaletteProps> = ({
  map,
  settings,
  onSelectTile,
  onSelectObject,
  onAddTileset,
  onOpenAssetManager,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [tab, setTab] = useState<'tiles' | 'objects' | 'assets'>('tiles');
  const [, bumpVersion] = useState(0);

  useEffect(() => assetRegistry.subscribe(() => bumpVersion((v) => v + 1)), []);
  useEffect(() => {
    void assetRegistry.initialize();
  }, []);

  const builtinTilesets = (map.tilesets || []).filter((t) => t.source === 'asset');
  const inMapAssetIds = new Set(
    (map.tilesets || []).filter((t) => t.assetId).map((t) => t.assetId as string)
  );
  const registryAssets = assetRegistry.list();
  const tileAssets = registryAssets.filter((a) => TILE_ASSET_CATEGORIES.includes(a.category));
  const objectAssets = registryAssets.filter((a) => OBJECT_ASSET_CATEGORIES.includes(a.category));

  const activeTileLabel = (() => {
    if (settings.activeTool !== 'paint' && settings.activeTool !== 'erase') return null;
    const builtin = BUILTIN_TILES.find((t) => t.id === settings.selectedTileId);
    if (builtin) return builtin.label;
    for (const ts of builtinTilesets) {
      if (settings.selectedTileId >= ts.firstTileId && settings.selectedTileId < ts.firstTileId + ts.tileCount) {
        return `${ts.name} #${settings.selectedTileId - ts.firstTileId}`;
      }
    }
    return `Tile ${settings.selectedTileId}`;
  })();

  return (
    <div className="absolute left-16 bottom-10 z-30 w-[290px] rpg-window flex flex-col max-h-[58%]">
      <button
        className="px-3 py-2 rpg-window-title flex items-center gap-2 cursor-pointer"
        onClick={() => setIsOpen((v) => !v)}
      >
        <PaletteIcon className="w-3.5 h-3.5 text-rpg-gold" />
        <span className="text-xs font-semibold text-rpg-text">Palette</span>
        {activeTileLabel && (
          <span className="text-[10px] text-rpg-gold truncate max-w-[120px]">{activeTileLabel}</span>
        )}
        <span className="ml-auto text-rpg-dim">{isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}</span>
      </button>

      {isOpen && (
        <>
          <div className="flex border-b-2 border-rpg-line">
            {(['tiles', 'objects', 'assets'] as const).map((entry) => (
              <button
                key={entry}
                onClick={() => setTab(entry)}
                className={`rpg-tab flex-1 px-2 py-1.5 text-[11px] font-medium cursor-pointer capitalize ${
                  tab === entry ? 'rpg-tab-active' : ''
                }`}
              >
                {entry}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto p-2 flex flex-col gap-3">
            {tab === 'tiles' && (
              <>
                <div>
                  <div className="text-[10px] font-semibold text-rpg-dim uppercase mb-1">Floors</div>
                  <div className="grid grid-cols-6 gap-1">
                    {BUILTIN_TILES.filter((t) => t.kind === 'floor').map((tile) => (
                      <button
                        key={tile.id}
                        title={`${tile.label} (${tile.id})`}
                        onClick={() => onSelectTile(tile.id)}
                        className={`h-8 rounded border cursor-pointer ${
                          settings.selectedTileId === tile.id
                            ? 'rpg-edge-gold ring-2 ring-rpg-gold/50'
                            : 'border-rpg-line hover:border-rpg-edge'
                        }`}
                        style={{ backgroundColor: tile.color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-rpg-dim uppercase mb-1">Walls &amp; windows</div>
                  <div className="grid grid-cols-6 gap-1">
                    {BUILTIN_TILES.filter((t) => t.kind === 'wall').map((tile) => (
                      <button
                        key={tile.id}
                        title={`${tile.label} (${tile.id})`}
                        onClick={() => onSelectTile(tile.id)}
                        className={`h-8 rounded border cursor-pointer ${
                          settings.selectedTileId === tile.id
                            ? 'rpg-edge-gold ring-2 ring-rpg-gold/50'
                            : 'border-rpg-line hover:border-rpg-edge'
                        }`}
                        style={{ backgroundColor: tile.color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-rpg-dim uppercase mb-1">
                    Imported tilesets
                  </div>
                  {builtinTilesets.length === 0 ? (
                    <div className="text-[10px] text-rpg-dim">
                      No imported tilesets in this map yet — add one from the{' '}
                      <button className="text-rpg-gold underline cursor-pointer" onClick={() => setTab('assets')}>
                        Assets tab
                      </button>
                      .
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {builtinTilesets.map((ts) => (
                        <div key={ts.id} className="flex flex-col gap-1">
                          <div className="text-[10px] text-rpg-text flex items-center gap-1">
                            <span className="truncate">{ts.name}</span>
                            <span className="text-rpg-dim font-mono">
                              {ts.columns}×{ts.rows} @{ts.tileSize}px
                            </span>
                          </div>
                          <TilesetSheetCanvas
                            tileset={ts}
                            onPickFrame={(frame) => onSelectTile(ts.firstTileId + frame)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'objects' && (
              <>
                <div>
                  <div className="text-[10px] font-semibold text-rpg-dim uppercase mb-1">Builtin objects</div>
                  <div className="grid grid-cols-2 gap-1">
                    {BUILTIN_OBJECTS.map((obj) => {
                      const selected =
                        settings.selectedObject?.kind === 'builtin' &&
                        settings.selectedObject.type === obj.type;
                      const art = getObjectSprite(obj.type);
                      return (
                        <button
                          key={obj.type}
                          onClick={() => onSelectObject({ kind: 'builtin', type: obj.type })}
                          className={`rpg-inset px-2 py-1.5 text-left cursor-pointer flex items-center gap-1.5 ${
                            selected ? 'rpg-inset-active' : ''
                          }`}
                        >
                          {art ? (
                            <img
                              src={art.image}
                              alt={obj.label}
                              className="w-7 h-7 object-contain shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 shrink-0 rounded bg-rpg-line/60" />
                          )}
                          <div className="min-w-0">
                            <div className="text-[10px] text-rpg-text truncate">{obj.label}</div>
                            <div className="text-[9px] text-rpg-dim">
                              {obj.isSolidByDefault ? 'solid' : 'walkable'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {objectAssets.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-rpg-dim uppercase mb-1">
                      Imported objects
                    </div>
                    <div className="flex flex-col gap-1">
                      {objectAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="rpg-inset flex items-center gap-2 px-2 py-1"
                        >
                          {asset.thumbnailDataUrl ? (
                            <img
                              src={asset.thumbnailDataUrl}
                              alt={asset.name}
                              className="w-8 h-8 object-contain rounded bg-rpg-ink"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-rpg-line" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-rpg-text truncate">{asset.name}</div>
                            <div className="text-[9px] text-rpg-dim">
                              {asset.width}×{asset.height} · {asset.category}
                            </div>
                          </div>
                          <button
                            className="rpg-btn rpg-btn-gold px-1.5 py-0.5 text-[10px] cursor-pointer flex items-center gap-0.5"
                            onClick={() =>
                              onSelectObject({
                                kind: 'asset',
                                assetId: asset.id,
                                frame: 0,
                                widthTiles: 1,
                                heightTiles: 1,
                              })
                            }
                            title="Select for placement (size editable in the inspector)"
                          >
                            <Plus className="w-3 h-3" /> Place
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'assets' && (
              <>
                <button
                  className="rpg-btn rpg-btn-gold w-full px-2 py-1.5 text-xs cursor-pointer flex items-center justify-center gap-1.5"
                  onClick={onOpenAssetManager}
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Open Asset Manager
                </button>

                {tileAssets.length === 0 ? (
                  <div className="text-[10px] text-rpg-dim">
                    Import RPG Maker MZ sheets (A1–A5, B–E, $/! characters) in the Asset Manager —
                    they are stored locally and mirrored to the cloud when available.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold text-rpg-dim uppercase">
                      Tileset assets
                    </div>
                    {tileAssets.map((asset) => {
                      const inMap = inMapAssetIds.has(asset.id);
                      return (
                        <div
                          key={asset.id}
                          className="rpg-inset flex items-center gap-2 px-2 py-1"
                        >
                          {asset.thumbnailDataUrl ? (
                            <img
                              src={asset.thumbnailDataUrl}
                              alt={asset.name}
                              className="w-8 h-8 object-contain rounded bg-rpg-ink"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-rpg-line" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-rpg-text truncate">{asset.name}</div>
                            <div className="text-[9px] text-rpg-dim">
                              {asset.columns}×{asset.rows} @{asset.frameWidth}px
                              {asset.rpgMakerFamily ? ` · ${asset.rpgMakerFamily}` : ''}
                            </div>
                          </div>
                          {inMap ? (
                            <span className="text-[9px] text-rpg-green flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> in map
                            </span>
                          ) : (
                            <button
                              className="rpg-btn rpg-btn-gold px-1.5 py-0.5 text-[10px] cursor-pointer"
                              onClick={() => {
                                const base = onAddTileset(asset.id);
                                if (base !== null) {
                                  onSelectTile(base);
                                  setTab('tiles');
                                }
                              }}
                            >
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
