/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * World Manager: groups maps into worlds (floors, zones, campuses), manages
 * membership/order and inspects the door/portal connections derived from
 * `door_warp` zones across the world's maps.
 */

import React, { useEffect, useState } from 'react';
import {
  X,
  Globe2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Link2,
  Star,
  RefreshCw,
} from 'lucide-react';
import { WorldData, WorldMapEntry, MapConnection } from '../../types/game';
import { worldRepository, WorldSummary, createWorldData } from '../../services/WorldRepository';
import { MapSummary } from '../../services/MapRepository';
import { firestoreMapRepository } from '../../services/FirestoreMapRepository';
import { getMapConnections } from '../../game/maps/mapSchema';

export interface WorldManagerModalProps {
  isOpen: boolean;
  onClose(): void;
  worlds: WorldSummary[];
  activeWorldId: string | null;
  maps: MapSummary[];
  currentMapId: string;
  activeWorld: WorldData | null;
  onWorldsChanged(): void;
  onOpenMap(mapId: string): void;
  onSetActiveWorld(worldId: string, world: WorldData | null): void;
}

interface NamedConnection extends MapConnection {
  fromMapName: string;
  targetMapName: string;
}

export const WorldManagerModal: React.FC<WorldManagerModalProps> = ({
  isOpen,
  onClose,
  worlds,
  activeWorldId,
  maps,
  currentMapId,
  activeWorld,
  onWorldsChanged,
  onOpenMap,
  onSetActiveWorld,
}) => {
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(activeWorldId);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [tab, setTab] = useState<'maps' | 'connections'>('maps');
  const [newWorldName, setNewWorldName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connections, setConnections] = useState<NamedConnection[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (!selectedWorldId && activeWorldId) setSelectedWorldId(activeWorldId);
  }, [isOpen, selectedWorldId, activeWorldId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedWorldId) {
      setWorldData(null);
      return;
    }
    worldRepository.getWorld(selectedWorldId).then((world) => {
      if (cancelled) return;
      setWorldData(world);
      setRenameValue(world?.name || '');
    });
    return () => {
      cancelled = true;
    };
  }, [selectedWorldId, worlds]);

  // Load connections for the selected world
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || tab !== 'connections' || !worldData) return;
    setConnecting(true);
    Promise.all(
      worldData.maps.map(async (entry) => ({
        entry,
        map: await firestoreMapRepository.getMap(entry.mapId).catch(() => null),
      }))
    )
      .then((loaded) => {
        if (cancelled) return;
        const names = new Map<string, string>();
        for (const { entry, map } of loaded) names.set(entry.mapId, map?.name || entry.name);
        const all: NamedConnection[] = [];
        for (const { entry, map } of loaded) {
          if (!map) continue;
          for (const conn of getMapConnections(map)) {
            all.push({
              ...conn,
              fromMapName: map.name,
              targetMapName: names.get(conn.targetMapId) || conn.targetMapId,
            });
          }
        }
        setConnections(all);
      })
      .finally(() => {
        if (!cancelled) setConnecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, tab, worldData]);

  if (!isOpen) return null;

  const persist = async (world: WorldData) => {
    setBusy(true);
    try {
      await worldRepository.saveWorld(world);
      setWorldData(world);
      onWorldsChanged();
    } finally {
      setBusy(false);
    }
  };

  const createWorld = async () => {
    const world = createWorldData(newWorldName || 'New World');
    await persist(world);
    setSelectedWorldId(world.id);
    setNewWorldName('');
  };

  const addMapToWorld = async (mapId: string) => {
    if (!worldData || worldData.maps.some((m) => m.mapId === mapId)) return;
    const summary = maps.find((m) => m.id === mapId);
    const order = worldData.maps.reduce((max, m) => Math.max(max, m.order), 0) + 10;
    const entry: WorldMapEntry = { mapId, name: summary?.name || mapId, order };
    await persist({ ...worldData, maps: [...worldData.maps, entry], version: worldData.version + 1 });
  };

  const removeMapFromWorld = async (mapId: string) => {
    if (!worldData) return;
    await persist({
      ...worldData,
      maps: worldData.maps.filter((m) => m.mapId !== mapId),
      version: worldData.version + 1,
    });
  };

  const moveMap = async (mapId: string, direction: -1 | 1) => {
    if (!worldData) return;
    const sorted = [...worldData.maps].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((m) => m.mapId === mapId);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[swap];
    const next = worldData.maps.map((m) => {
      if (m.mapId === a.mapId) return { ...m, order: b.order };
      if (m.mapId === b.mapId) return { ...m, order: a.order };
      return m;
    });
    await persist({ ...worldData, maps: next, version: worldData.version + 1 });
  };

  const worldMaps = worldData ? [...worldData.maps].sort((a, b) => a.order - b.order) : [];
  const availableMaps = maps.filter((m) => !worldMaps.some((w) => w.mapId === m.id));

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[880px] max-w-[96vw] max-h-[88vh] rpg-window flex flex-col overflow-hidden">
        <div className="rpg-window-title px-4 py-3 flex items-center gap-3">
          <Globe2 className="w-4 h-4 text-rpg-gold" />
          <span className="pixel-title text-[10px]">World Manager</span>
          <span className="text-[10px] text-rpg-dim">
            {worlds.length} world(s) · {maps.length} map(s) available
          </span>
          <button className="rpg-btn rpg-btn-danger ml-auto p-1 cursor-pointer" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* World list */}
          <div className="w-64 border-r border-rpg-line flex flex-col">
            <div className="p-2 flex gap-1">
              <input
                type="text"
                value={newWorldName}
                placeholder="New world name…"
                onChange={(e) => setNewWorldName(e.target.value)}
                className="rpg-input flex-1 min-w-0 px-2 py-1 text-xs"
              />
              <button
                className="rpg-btn rpg-btn-gold px-2 py-1 text-xs cursor-pointer disabled:opacity-50"
                disabled={busy}
                onClick={() => void createWorld()}
                title="Create world"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {worlds.map((world) => {
                const isSelected = world.id === selectedWorldId;
                const isActive = world.id === activeWorldId;
                return (
                  <button
                    key={world.id}
                    onClick={() => setSelectedWorldId(world.id)}
                    className={`rpg-inset px-2 py-1.5 text-left cursor-pointer ${
                      isSelected
                        ? 'rpg-inset-active'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-rpg-text truncate flex-1">{world.name}</span>
                      {isActive && <Star className="w-3 h-3 text-rpg-gold shrink-0" />}
                    </div>
                    <div className="text-[10px] text-rpg-dim">
                      {world.mapCount} map(s){world.isLocal ? ' · local' : ''}
                    </div>
                  </button>
                );
              })}
              {worlds.length === 0 && (
                <div className="text-[11px] text-rpg-dim p-2">No worlds yet — create one above.</div>
              )}
            </div>
          </div>

          {/* World detail */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!worldData ? (
              <div className="flex-1 flex items-center justify-center text-xs text-rpg-dim">
                Select a world to manage its maps and connections.
              </div>
            ) : (
              <>
                <div className="rpg-window-title px-3 py-2 flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="rpg-input px-2 py-1 text-xs w-48"
                  />
                  <button
                    className="rpg-btn rpg-btn-plain px-2 py-1 text-[11px] cursor-pointer"
                    disabled={busy || !renameValue.trim() || renameValue === worldData.name}
                    onClick={() => void persist({ ...worldData, name: renameValue.trim(), version: worldData.version + 1 })}
                  >
                    Rename
                  </button>
                  <button
                    className={`rpg-btn px-2 py-1 text-[11px] cursor-pointer ${
                      worldData.id === activeWorldId
                        ? 'rpg-btn-gold'
                        : 'rpg-btn-plain'
                    }`}
                    onClick={() => onSetActiveWorld(worldData.id, worldData)}
                    title="Mark this world as the active world used for browsing"
                  >
                    {worldData.id === activeWorldId ? 'Active world' : 'Set active'}
                  </button>
                  <button
                    className="rpg-btn rpg-btn-danger px-2 py-1 text-[11px] cursor-pointer flex items-center gap-1"
                    onClick={() => {
                      if (window.confirm(`Delete world "${worldData.name}"? Maps themselves are not deleted.`)) {
                        void worldRepository.deleteWorld(worldData.id).then(() => {
                          setSelectedWorldId(null);
                          setWorldData(null);
                          onWorldsChanged();
                        });
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>

                <div className="px-3 pt-2 flex gap-1">
                  <button
                    className={`rpg-tab px-2.5 py-1 text-[11px] cursor-pointer ${
                      tab === 'maps' ? 'rpg-tab-active' : ''
                    }`}
                    onClick={() => setTab('maps')}
                  >
                    Maps ({worldMaps.length})
                  </button>
                  <button
                    className={`rpg-tab px-2.5 py-1 text-[11px] cursor-pointer flex items-center gap-1 ${
                      tab === 'connections' ? 'rpg-tab-active' : ''
                    }`}
                    onClick={() => setTab('connections')}
                  >
                    <Link2 className="w-3 h-3" /> Connections
                  </button>
                </div>

                <div className="rpg-inset flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                  {tab === 'maps' && (
                    <>
                      <div className="flex items-center gap-2">
                        <select
                          className="rpg-input flex-1 px-2 py-1 text-xs"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) void addMapToWorld(e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="">Add a map to this world…</option>
                          {availableMaps.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.width}×{m.height})
                            </option>
                          ))}
                        </select>
                        <button
                          className="rpg-btn rpg-btn-plain px-2 py-1 text-[11px] cursor-pointer flex items-center gap-1"
                          onClick={() => onWorldsChanged()}
                          title="Refresh world list"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>

                      {worldMaps.map((entry) => (
                        <div
                          key={entry.mapId}
                          className="rpg-inset flex items-center gap-2 px-2 py-1.5"
                        >
                          <span className="text-xs text-rpg-text truncate flex-1">{entry.name}</span>
                          {entry.mapId === currentMapId && (
                            <span className="rpg-chip rpg-chip-gold px-1 py-0.5">
                              CURRENT
                            </span>
                          )}
                          <span className="text-[10px] text-rpg-dim font-mono">{entry.mapId}</span>
                          <button
                            className="rpg-btn rpg-btn-plain p-1 cursor-pointer"
                            title="Open in World Mode"
                            onClick={() => onOpenMap(entry.mapId)}
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="rpg-btn rpg-btn-plain p-1 cursor-pointer"
                            title="Move up"
                            onClick={() => void moveMap(entry.mapId, -1)}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="rpg-btn rpg-btn-plain p-1 cursor-pointer"
                            title="Move down"
                            onClick={() => void moveMap(entry.mapId, 1)}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="rpg-btn rpg-btn-danger p-1 cursor-pointer"
                            title="Remove from world"
                            onClick={() => void removeMapFromWorld(entry.mapId)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {worldMaps.length === 0 && (
                        <div className="text-[11px] text-rpg-dim">
                          This world has no maps yet. Add maps above — each map can belong to any number of worlds.
                        </div>
                      )}
                    </>
                  )}

                  {tab === 'connections' && (
                    <>
                      {connecting ? (
                        <div className="text-[11px] text-rpg-dim">Loading connections…</div>
                      ) : connections.length === 0 ? (
                        <div className="text-[11px] text-rpg-dim">
                          No door/portal connections found. Create them in Studio Mode by adding
                          <span className="text-rpg-text"> door / warp </span>
                          zones and setting their destination in the inspector.
                        </div>
                      ) : (
                        <table className="w-full text-[11px] text-rpg-text border-collapse">
                          <thead>
                            <tr className="text-left text-rpg-dim">
                              <th className="py-1 pr-2">From</th>
                              <th className="py-1 pr-2">Zone</th>
                              <th className="py-1 pr-2">Destination</th>
                              <th className="py-1" />
                            </tr>
                          </thead>
                          <tbody>
                            {connections.map((conn, i) => (
                              <tr key={`${conn.fromMapId}_${conn.zoneId}_${i}`} className="border-t border-rpg-line">
                                <td className="py-1 pr-2">
                                  <span className="text-rpg-text">{conn.fromMapName}</span>
                                  <span className="text-rpg-dim font-mono">
                                    {' '}
                                    ({conn.fromTileX},{conn.fromTileY})
                                  </span>
                                </td>
                                <td className="py-1 pr-2 truncate max-w-[140px]">{conn.name}</td>
                                <td className="py-1 pr-2">
                                  <span className="text-rpg-text">{conn.targetMapName}</span>
                                  <span className="text-rpg-dim font-mono">
                                    {' '}
                                    ({conn.targetTileX},{conn.targetTileY})
                                    {conn.targetSpawnId ? ` via ${conn.targetSpawnId}` : ''}
                                  </span>
                                </td>
                                <td className="py-1 text-right">
                                  <button
                                    className="rpg-btn rpg-btn-plain px-1.5 py-0.5 text-[10px] cursor-pointer"
                                    onClick={() => onOpenMap(conn.fromMapId)}
                                  >
                                    Open map
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
