/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio inspector: edits the current selection (object / zone / spawn point)
 * and shows map overview lists when nothing is selected. All edits are routed
 * through the App as undoable edit commands.
 */

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Trash2, Plus, Box, Flag, Square, DoorOpen } from 'lucide-react';
import {
  InteractionZone,
  MapObject,
  MapSpawnPoint,
  OfficeMapData,
  ZoneType,
} from '../../types/game';
import { StudioSelection } from '../../game/OfficeScene';
import { NumberField, SelectField, TextField } from './StudioChrome';
import { MapSummary } from '../../services/MapRepository';
import { firestoreMapRepository } from '../../services/FirestoreMapRepository';

export interface StudioPropertiesPanelProps {
  map: OfficeMapData;
  selection: StudioSelection;
  cursor: { x: number; y: number; inside: boolean };
  mapOptions: MapSummary[];
  onSelect(selection: StudioSelection): void;
  onUpdateObject(id: string, patch: Partial<MapObject>): void;
  onRemoveObject(id: string): void;
  onUpdateZone(id: string, patch: Partial<InteractionZone>): void;
  onRemoveZone(id: string): void;
  onUpdateSpawn(id: string, patch: Partial<MapSpawnPoint>): void;
  onRemoveSpawn(id: string): void;
  onAddSpawn(): void;
  onAddZone(): void;
}

const ZONE_TYPES: Array<{ value: ZoneType; label: string }> = [
  { value: 'meeting_room', label: 'Meeting room' },
  { value: 'coffee', label: 'Coffee bar' },
  { value: 'watercooler', label: 'Watercooler' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'desk', label: 'Desk' },
  { value: 'phone_booth', label: 'Phone booth' },
  { value: 'door_warp', label: 'Door / warp' },
];

const DIRECTIONS = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const sectionHeader = 'px-3 py-2 border-b border-slate-700/70 flex items-center gap-2 sticky top-0 bg-slate-900/95 z-10';
const listRow =
  'flex items-center gap-2 px-2 py-1 rounded border border-slate-700/60 bg-slate-800/50 hover:bg-slate-800 cursor-pointer text-[11px] text-slate-200';

export const StudioPropertiesPanel: React.FC<StudioPropertiesPanelProps> = ({
  map,
  selection,
  cursor,
  mapOptions,
  onSelect,
  onUpdateObject,
  onRemoveObject,
  onUpdateZone,
  onRemoveZone,
  onUpdateSpawn,
  onRemoveSpawn,
  onAddSpawn,
  onAddZone,
}) => {
  // Warp-target spawn list (loaded lazily for the zone editor)
  const [warpSpawns, setWarpSpawns] = useState<MapSpawnPoint[]>([]);
  const selectedZone =
    selection?.kind === 'zone' ? map.interactionZones.find((z) => z.id === selection.id) : undefined;
  const warpMapId = selectedZone?.warpTarget?.mapId;

  useEffect(() => {
    let cancelled = false;
    if (!warpMapId) {
      setWarpSpawns([]);
      return;
    }
    firestoreMapRepository
      .getMap(warpMapId)
      .then((target) => {
        if (!cancelled) setWarpSpawns(target.spawnPoints || []);
      })
      .catch(() => {
        if (!cancelled) setWarpSpawns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [warpMapId]);

  const selectedObject =
    selection?.kind === 'object' ? map.objects.find((o) => o.id === selection.id) : undefined;
  const selectedSpawn =
    selection?.kind === 'spawn' ? (map.spawnPoints || []).find((s) => s.id === selection.id) : undefined;

  const headerTitle = selectedObject
    ? `Object: ${selectedObject.name || selectedObject.type}`
    : selectedZone
      ? `Zone: ${selectedZone.name}`
      : selectedSpawn
        ? `Spawn: ${selectedSpawn.name}`
        : 'Inspector';

  return (
    <div className="absolute right-2 bottom-8 z-30 w-72 max-h-[44%] overflow-y-auto bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur">
      <div className={sectionHeader}>
        <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-semibold text-white truncate">{headerTitle}</span>
        {selection && (
          <button
            className="ml-auto text-[10px] text-slate-400 hover:text-white cursor-pointer"
            onClick={() => onSelect(null)}
            title="Clear selection"
          >
            clear
          </button>
        )}
      </div>

      {selectedObject && (
        <div className="p-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <TextField
              label="Name"
              value={selectedObject.name || selectedObject.type}
              width="w-36"
              onChange={(name) => onUpdateObject(selectedObject.id, { name })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <NumberField
              label="X"
              value={selectedObject.tileX}
              min={0}
              max={map.width - 1}
              onChange={(tileX) => onUpdateObject(selectedObject.id, { tileX: Math.round(tileX) })}
            />
            <NumberField
              label="Y"
              value={selectedObject.tileY}
              min={0}
              max={map.height - 1}
              onChange={(tileY) => onUpdateObject(selectedObject.id, { tileY: Math.round(tileY) })}
            />
            <NumberField
              label="W"
              value={selectedObject.width}
              min={1}
              max={map.width}
              onChange={(width) => onUpdateObject(selectedObject.id, { width: Math.round(width) })}
            />
            <NumberField
              label="H"
              value={selectedObject.height}
              min={1}
              max={map.height}
              onChange={(height) => onUpdateObject(selectedObject.id, { height: Math.round(height) })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedObject.isSolid}
                onChange={(e) => onUpdateObject(selectedObject.id, { isSolid: e.target.checked })}
              />
              Solid (blocks movement)
            </label>
            <SelectField
              label="Rot"
              value={String(selectedObject.rotation ?? 0)}
              options={[
                { value: '0', label: '0°' },
                { value: '90', label: '90°' },
                { value: '180', label: '180°' },
                { value: '270', label: '270°' },
              ]}
              onChange={(v) => onUpdateObject(selectedObject.id, { rotation: parseInt(v, 10) })}
            />
          </div>
          {selectedObject.assetId && (
            <div className="text-[10px] text-slate-500 font-mono truncate">
              asset: {selectedObject.assetId} · frame {selectedObject.frame ?? 0}
            </div>
          )}
          <button
            className="mt-1 px-2 py-1.5 rounded-md bg-red-900/60 hover:bg-red-800/70 border border-red-700/60 text-[11px] text-red-100 cursor-pointer flex items-center justify-center gap-1"
            onClick={() => onRemoveObject(selectedObject.id)}
          >
            <Trash2 className="w-3 h-3" /> Delete object
          </button>
        </div>
      )}

      {selectedZone && (
        <div className="p-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <TextField
              label="Name"
              value={selectedZone.name}
              width="w-36"
              onChange={(name) => onUpdateZone(selectedZone.id, { name })}
            />
            <SelectField
              label="Type"
              value={selectedZone.type}
              options={ZONE_TYPES}
              onChange={(v) => onUpdateZone(selectedZone.id, { type: v as ZoneType })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <NumberField
              label="X"
              value={selectedZone.tileX}
              min={0}
              max={map.width - 1}
              onChange={(tileX) => onUpdateZone(selectedZone.id, { tileX: Math.round(tileX) })}
            />
            <NumberField
              label="Y"
              value={selectedZone.tileY}
              min={0}
              max={map.height - 1}
              onChange={(tileY) => onUpdateZone(selectedZone.id, { tileY: Math.round(tileY) })}
            />
            <NumberField
              label="W"
              value={selectedZone.width}
              min={1}
              max={map.width}
              onChange={(width) => onUpdateZone(selectedZone.id, { width: Math.round(width) })}
            />
            <NumberField
              label="H"
              value={selectedZone.height}
              min={1}
              max={map.height}
              onChange={(height) => onUpdateZone(selectedZone.id, { height: Math.round(height) })}
            />
          </div>
          <TextField
            label="Prompt"
            value={selectedZone.prompt}
            width="w-40"
            onChange={(prompt) => onUpdateZone(selectedZone.id, { prompt })}
          />

          {selectedZone.type === 'door_warp' && (
            <div className="rounded-lg border border-indigo-700/50 bg-indigo-950/30 p-2 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-300">
                <DoorOpen className="w-3.5 h-3.5" /> WARP DESTINATION
              </div>
              <SelectField
                label="Map"
                value={selectedZone.warpTarget?.mapId || ''}
                options={[
                  { value: '', label: '— choose map —' },
                  ...mapOptions
                    .filter((m) => m.id !== map.id)
                    .map((m) => ({ value: m.id, label: m.name })),
                ]}
                onChange={(mapId) => {
                  if (!mapId) {
                    onUpdateZone(selectedZone.id, { warpTarget: undefined });
                    return;
                  }
                  const existing = selectedZone.warpTarget;
                  onUpdateZone(selectedZone.id, {
                    warpTarget: {
                      mapId,
                      spawnTileX: existing?.spawnTileX ?? 1,
                      spawnTileY: existing?.spawnTileY ?? 1,
                      targetSpawnId: undefined,
                    },
                  });
                }}
              />
              {selectedZone.warpTarget && (
                <SelectField
                  label="Spawn"
                  value={selectedZone.warpTarget.targetSpawnId || ''}
                  options={[
                    { value: '', label: 'first spawn / coordinates' },
                    ...warpSpawns.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  onChange={(spawnId) => {
                    const spawn = warpSpawns.find((s) => s.id === spawnId);
                    onUpdateZone(selectedZone.id, {
                      warpTarget: {
                        mapId: selectedZone.warpTarget!.mapId,
                        targetSpawnId: spawnId || undefined,
                        spawnTileX: spawn ? spawn.tileX : selectedZone.warpTarget!.spawnTileX,
                        spawnTileY: spawn ? spawn.tileY : selectedZone.warpTarget!.spawnTileY,
                      },
                    });
                  }}
                />
              )}
              {selectedZone.warpTarget && !selectedZone.warpTarget.targetSpawnId && (
                <div className="flex gap-2">
                  <NumberField
                    label="X"
                    value={selectedZone.warpTarget.spawnTileX}
                    min={0}
                    onChange={(spawnTileX) =>
                      onUpdateZone(selectedZone.id, {
                        warpTarget: {
                          ...selectedZone.warpTarget!,
                          spawnTileX: Math.round(spawnTileX),
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Y"
                    value={selectedZone.warpTarget.spawnTileY}
                    min={0}
                    onChange={(spawnTileY) =>
                      onUpdateZone(selectedZone.id, {
                        warpTarget: {
                          ...selectedZone.warpTarget!,
                          spawnTileY: Math.round(spawnTileY),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}

          <button
            className="mt-1 px-2 py-1.5 rounded-md bg-red-900/60 hover:bg-red-800/70 border border-red-700/60 text-[11px] text-red-100 cursor-pointer flex items-center justify-center gap-1"
            onClick={() => onRemoveZone(selectedZone.id)}
          >
            <Trash2 className="w-3 h-3" /> Delete zone
          </button>
        </div>
      )}

      {selectedSpawn && (
        <div className="p-2 flex flex-col gap-2">
          <TextField
            label="Name"
            value={selectedSpawn.name}
            width="w-36"
            onChange={(name) => onUpdateSpawn(selectedSpawn.id, { name })}
          />
          <div className="flex flex-wrap gap-2">
            <NumberField
              label="X"
              value={selectedSpawn.tileX}
              min={0}
              max={map.width - 1}
              onChange={(tileX) => onUpdateSpawn(selectedSpawn.id, { tileX: Math.round(tileX) })}
            />
            <NumberField
              label="Y"
              value={selectedSpawn.tileY}
              min={0}
              max={map.height - 1}
              onChange={(tileY) => onUpdateSpawn(selectedSpawn.id, { tileY: Math.round(tileY) })}
            />
            <SelectField
              label="Facing"
              value={selectedSpawn.direction}
              options={DIRECTIONS}
              onChange={(v) =>
                onUpdateSpawn(selectedSpawn.id, { direction: v as MapSpawnPoint['direction'] })
              }
            />
          </div>
          <button
            className="mt-1 px-2 py-1.5 rounded-md bg-red-900/60 hover:bg-red-800/70 border border-red-700/60 text-[11px] text-red-100 cursor-pointer flex items-center justify-center gap-1"
            onClick={() => onRemoveSpawn(selectedSpawn.id)}
          >
            <Trash2 className="w-3 h-3" /> Delete spawn point
          </button>
        </div>
      )}

      {!selection && (
        <div className="p-2 flex flex-col gap-2">
          <div className="flex gap-1.5">
            <button
              className="flex-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[10px] text-slate-200 cursor-pointer flex items-center justify-center gap-1"
              onClick={onAddSpawn}
              title={`Uses cursor tile ${cursor.inside ? `(${cursor.x}, ${cursor.y})` : '(center)'}`}
            >
              <Plus className="w-3 h-3" /> Spawn
            </button>
            <button
              className="flex-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-[10px] text-slate-200 cursor-pointer flex items-center justify-center gap-1"
              onClick={onAddZone}
              title={`Uses cursor tile ${cursor.inside ? `(${cursor.x}, ${cursor.y})` : '(center)'}`}
            >
              <Plus className="w-3 h-3" /> Zone
            </button>
          </div>

          {(map.spawnPoints || []).length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                <Flag className="w-3 h-3" /> Spawn points
              </div>
              {(map.spawnPoints || []).map((spawn) => (
                <div key={spawn.id} className={listRow} onClick={() => onSelect({ kind: 'spawn', id: spawn.id })}>
                  <span className="truncate flex-1">{spawn.name}</span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {spawn.tileX},{spawn.tileY}
                  </span>
                </div>
              ))}
            </div>
          )}

          {map.interactionZones.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                <Square className="w-3 h-3" /> Zones
              </div>
              {map.interactionZones.slice(0, 12).map((zone) => (
                <div key={zone.id} className={listRow} onClick={() => onSelect({ kind: 'zone', id: zone.id })}>
                  <span className="truncate flex-1">{zone.name}</span>
                  <span className="text-[9px] text-slate-500">{zone.type}</span>
                </div>
              ))}
            </div>
          )}

          {map.objects.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                <Box className="w-3 h-3" /> Objects
              </div>
              {map.objects.slice(0, 12).map((obj) => (
                <div key={obj.id} className={listRow} onClick={() => onSelect({ kind: 'object', id: obj.id })}>
                  <span className="truncate flex-1">{obj.name || obj.type}</span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {obj.tileX},{obj.tileY}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
