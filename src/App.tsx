/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GatherGrid application shell.
 *
 * Two modes share one engine, one map document and one asset library:
 *  - World Mode: Gather.town-style live office with multiplayer.
 *  - Studio Mode: RPG Maker MZ-inspired map editor (admins only).
 */

import React, { useState, useEffect, useCallback, useRef, useReducer } from 'react';
import { OfficeCanvas, OfficeCanvasHandle } from './components/OfficeCanvas';
import { Navbar } from './components/Navbar';
import { NearbyColleagues } from './components/NearbyColleagues';
import { InteractionModal } from './components/InteractionModal';
import { AvatarCustomizerModal } from './components/AvatarCustomizerModal';
import { MiniMap } from './components/MiniMap';
import { ChatPreviewDrawer } from './components/ChatPreviewDrawer';
import { ControlsOverlay } from './components/ControlsOverlay';
import { LoginModal } from './components/LoginModal';
import { HQWeatherModal } from './components/HQWeatherModal';
import { EmojiReactionDock } from './components/EmojiReactionDock';
import { GoogleEmojiPickerModal } from './components/GoogleEmojiPickerModal';
import { StudioCommandBar, StudioStatusBar } from './components/studio/StudioChrome';
import { StudioToolsRail, StudioLayersPanel } from './components/studio/StudioSidebar';
import { StudioPalette } from './components/studio/StudioPalette';
import { StudioPropertiesPanel } from './components/studio/StudioProperties';
import { AssetManagerModal } from './components/studio/AssetManagerModal';
import { WorldManagerModal } from './components/studio/WorldManagerModal';
import { MapPickerModal } from './components/studio/MapPickerModal';
import { DEFAULT_QUICK_EMOJIS } from './data/googleEmojis';
import { AuthProvider, useAuth } from './context/AuthContext';
import { firestoreMapRepository } from './services/FirestoreMapRepository';
import { MapSummary } from './services/MapRepository';
import { chatService } from './services/ChatService';
import { presenceService } from './services/PresenceService';
import { hqWeatherService, CurrentWeatherState, HQWeatherConfig, DEFAULT_HQ_WEATHER_CONFIG } from './services/HQWeatherService';
import { testFirestoreConnection } from './services/firebase';
import { getFactoryMap, listFactoryMapSummaries } from './game/maps/officeMaps';
import { worldRepository, WorldSummary } from './services/WorldRepository';
import { assetRegistry } from './services/AssetRegistry';
import {
  UserProfile,
  InteractionZone,
  OfficeMapData,
  WorldData,
  MapObject,
  MapSpawnPoint,
  MapLayerData,
  MapTilesetRef,
} from './types/game';
import { sounds } from './game/soundEffects';
import { multiplayerClient, ConnectionState } from './multiplayer/client';
import {
  EditHistory,
  applyCommand,
  captureResizeSnapshot,
  EditCommand,
  syncPrimarySpawn,
} from './game/edits';
import {
  DEFAULT_STUDIO_SETTINGS,
  StudioEditorSettings,
  StudioSelection,
  WeatherVisualState,
  WeatherEffectFlags,
} from './game/OfficeScene';
import {
  createMap,
  createTileLayer,
  encodeMaskForTransport,
  computeMaskHash,
  getCollisionMask,
  getDefaultSpawn,
  getTileLayers,
  makeLayerId,
  resizeMap,
  validateTransition,
} from './game/maps/mapSchema';

interface ToastState {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

function VirtualOfficeApp() {
  const canvasRef = useRef<OfficeCanvasHandle>(null);
  const { user, profile, isAdmin, updateUserProfile } = useAuth();
  const signedInUid = user?.uid ?? null;

  // -------------------------------------------------------------------------
  // User profile & presence
  // -------------------------------------------------------------------------
  const [playerProfile, setPlayerProfile] = useState<UserProfile>(
    profile || presenceService.getCurrentUser()
  );
  const [colleagues, setColleagues] = useState<UserProfile[]>(
    presenceService.getOnlineUsers().filter((u) => u.id !== playerProfile.id)
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [pingMs, setPingMs] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Map state + edit history
  // -------------------------------------------------------------------------
  const [currentMapId, setCurrentMapId] = useState<string>('main_office');
  const [currentMapName, setCurrentMapName] = useState<string>('Main Open Workspace');
  const [currentMapData, setCurrentMapData] = useState<OfficeMapData>(() => getFactoryMap('main_office'));
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const historyRef = useRef(new EditHistory());
  const [historyVersion, bumpHistoryVersion] = useReducer((x: number) => x + 1, 0);

  // Coordinate tracking
  const [playerCoords, setPlayerCoords] = useState<{ x: number; y: number; tileX: number; tileY: number }>({
    x: 8 * 32,
    y: 11 * 32,
    tileX: 8,
    tileY: 11,
  });

  // -------------------------------------------------------------------------
  // Mode / studio state
  // -------------------------------------------------------------------------
  const [mode, setMode] = useState<'world' | 'studio'>('world');
  const isStudioMode = mode === 'studio';
  const [studioSettings, setStudioSettings] = useState<StudioEditorSettings>({ ...DEFAULT_STUDIO_SETTINGS });
  const [selection, setSelection] = useState<StudioSelection>(null);
  const [cursorTile, setCursorTile] = useState<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // -------------------------------------------------------------------------
  // Worlds + map lists
  // -------------------------------------------------------------------------
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [activeWorld, setActiveWorld] = useState<WorldData | null>(null);
  const [mapSummaries, setMapSummaries] = useState<MapSummary[]>([]);

  // -------------------------------------------------------------------------
  // Modals & panels
  // -------------------------------------------------------------------------
  const [activeZone, setActiveZone] = useState<InteractionZone | null>(null);
  const [modalZone, setModalZone] = useState<InteractionZone | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [speedBoostTimeLeft, setSpeedBoostTimeLeft] = useState(0);
  const [selectedDirectUser, setSelectedDirectUser] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('gathergrid_directory_open');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);
  const [isWorldManagerOpen, setIsWorldManagerOpen] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);

  // Weather
  const [currentWeather, setCurrentWeather] = useState<CurrentWeatherState | null>(null);
  const [weatherConfig, setWeatherConfig] = useState<HQWeatherConfig>({ ...DEFAULT_HQ_WEATHER_CONFIG });

  // Chat focus to disable keyboard movement
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Google Emoji quick reactions
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [quickEmojiSlots, setQuickEmojiSlots] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gathergrid_quick_emojis');
      return saved ? JSON.parse(saved) : DEFAULT_QUICK_EMOJIS;
    } catch {
      return DEFAULT_QUICK_EMOJIS;
    }
  });
  const [activeReactionSlot, setActiveReactionSlot] = useState<number | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const showToast = useCallback((kind: ToastState['kind'], message: string, ms: number = 3600) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ms);
  }, []);

  // Asset registry reactivity
  const [, bumpAssets] = useReducer((x: number) => x + 1, 0);
  useEffect(() => assetRegistry.subscribe(bumpAssets), []);

  // Pending warp (validated transition handled by the map-load effect)
  const pendingWarpRef = useRef<{ mapId: string; spawnTileX?: number; spawnTileY?: number } | null>(null);

  /** Opens a map in World Mode, optionally at a specific spawn tile. */
  const openMap = useCallback((mapId: string, spawn?: { tileX: number; tileY: number }) => {
    pendingWarpRef.current = {
      mapId,
      spawnTileX: spawn?.tileX,
      spawnTileY: spawn?.tileY,
    };
    setCurrentMapId(mapId);
  }, []);

  const anyModalOpen =
    !!modalZone ||
    isAvatarModalOpen ||
    isLoginModalOpen ||
    isWeatherModalOpen ||
    isEmojiPickerOpen ||
    isAssetManagerOpen ||
    isWorldManagerOpen ||
    isMapPickerOpen;

  // -------------------------------------------------------------------------
  // Profile sync + presence
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (profile) {
      setPlayerProfile(profile);
    }
  }, [profile]);

  useEffect(() => {
    const unsub = presenceService.subscribe((users) => {
      setColleagues(users.filter((u) => u.id !== playerProfile.id));
    });
    return unsub;
  }, [playerProfile.id]);

  // -------------------------------------------------------------------------
  // Multiplayer connection (per map room)
  // -------------------------------------------------------------------------
  const registerMapWithServer = useCallback((map: OfficeMapData) => {
    try {
      const mask = getCollisionMask(map);
      const hash = computeMaskHash(map.width, map.height, mask);
      const spawn = getDefaultSpawn(map);
      multiplayerClient.setMapRegistration({
        mapId: map.id,
        width: map.width,
        height: map.height,
        tileSize: map.tileSize,
        maskHash: hash,
        maskRle: encodeMaskForTransport(mask),
        spawnTileX: spawn.tileX,
        spawnTileY: spawn.tileY,
      });
    } catch (err) {
      console.warn('[App] Failed to register map with the multiplayer server', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    multiplayerClient.connect(playerProfile, currentMapId);

    const unsubState = multiplayerClient.onStateChange((state) => {
      if (isMounted) setConnectionState(state);
    });

    const unsubSnapshot = multiplayerClient.onRoomSnapshot((players) => {
      canvasRef.current?.syncRemoteSnapshot(players);
    });

    const unsubJoined = multiplayerClient.onPlayerJoined((player) => {
      canvasRef.current?.handleRemotePlayerJoined(player);
    });

    const unsubLeft = multiplayerClient.onPlayerLeft((userId) => {
      canvasRef.current?.handleRemotePlayerLeft(userId);
    });

    const unsubStates = multiplayerClient.onPlayerStates((states) => {
      canvasRef.current?.handleRemotePlayerStates(states);
    });

    const unsubCorrection = multiplayerClient.onMovementRejected((corr) => {
      canvasRef.current?.handleServerCorrection(corr.correctX, corr.correctY);
    });

    const unsubReaction = multiplayerClient.onPlayerReaction((reaction) => {
      canvasRef.current?.showReactionBubble(reaction.userId, reaction.emoji, 3200);
    });

    const unsubMapRegistered = multiplayerClient.onMapRegistered((info) => {
      if (isMounted && info.canonical) {
        canvasRef.current?.handleServerCorrection(info.spawnX, info.spawnY);
      }
    });

    const unsubMapMismatch = multiplayerClient.onMapMismatch((info) => {
      if (!isMounted) return;
      showToast(
        'error',
        `Multiplayer room is running a different map revision (${info.width}×${info.height}). Movement is validated against the room version — save and reload for everyone to match.`,
        7000
      );
    });

    const pingTimer = setInterval(() => {
      if (isMounted) {
        setPingMs(multiplayerClient.getPing());
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(pingTimer);
      unsubState();
      unsubSnapshot();
      unsubJoined();
      unsubLeft();
      unsubStates();
      unsubCorrection();
      unsubReaction();
      unsubMapRegistered();
      unsubMapMismatch();
      multiplayerClient.disconnect();
    };
  }, [currentMapId, playerProfile.id, showToast]);

  // -------------------------------------------------------------------------
  // Map loading (assets preloaded before the scene builds)
  // -------------------------------------------------------------------------
  const loadMapIntoScene = useCallback(
    async (mapId: string, useTransition: boolean) => {
      const loaded = await firestoreMapRepository.getMap(mapId);

      // Preload imported assets so the first render already has real textures.
      const assetIds = assetRegistry.collectReferencedIds(loaded);
      if (assetIds.length > 0) {
        const missing = await assetRegistry.preload(assetIds);
        if (missing.length > 0) {
          showToast('error', `${missing.length} map asset(s) could not be loaded; placeholders shown.`, 5200);
        }
      }

      setCurrentMapData(loaded);
      setCurrentMapName(loaded.name);
      historyRef.current.clear();
      bumpHistoryVersion();
      setIsDirty(false);
      setSelection(null);

      const firstLayer = getTileLayers(loaded)[0];
      setStudioSettings((s) => ({
        ...s,
        activeLayerId:
          s.activeLayerId && (loaded.layers || []).some((l) => l.id === s.activeLayerId)
            ? s.activeLayerId
            : firstLayer?.id ?? null,
      }));

      const warp = pendingWarpRef.current;
      if (useTransition && warp && warp.mapId === loaded.id) {
        pendingWarpRef.current = null;
        canvasRef.current?.switchMapWithTransition(loaded, warp.spawnTileX, warp.spawnTileY);
      } else {
        pendingWarpRef.current = null;
        canvasRef.current?.loadMapData(loaded);
      }

      registerMapWithServer(loaded);
      return loaded;
    },
    [registerMapWithServer, showToast]
  );

  useEffect(() => {
    let isMounted = true;
    loadMapIntoScene(currentMapId, true).catch((err) => {
      console.error('[App] Failed to load map', currentMapId, err);
      if (isMounted) showToast('error', `Failed to load map "${currentMapId}".`);
    });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMapId]);

  // -------------------------------------------------------------------------
  // Worlds
  // -------------------------------------------------------------------------
  const refreshWorlds = useCallback(async () => {
    const list = await worldRepository.ensureDefaultWorld(listFactoryMapSummaries());
    setWorlds(list);
    return list;
  }, []);

  const refreshMapSummaries = useCallback(async () => {
    const maps = await firestoreMapRepository.listMaps();
    setMapSummaries(maps);
    return maps;
  }, []);

  useEffect(() => {
    refreshWorlds()
      .then((list) => {
        if (list.length > 0 && !activeWorldId) setActiveWorldId(list[0].id);
      })
      .catch((err) => console.warn('[App] Failed to load worlds', err));
    refreshMapSummaries().catch((err) => console.warn('[App] Failed to load map list', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync cloud-backed data once a signed-in session is available — either a
  // fresh sign-in or a restored session that resolves after first paint.
  useEffect(() => {
    if (!signedInUid) return;
    refreshWorlds().catch((err) => console.warn('[App] Failed to refresh worlds after sign-in', err));
    refreshMapSummaries().catch((err) =>
      console.warn('[App] Failed to refresh map list after sign-in', err)
    );
    void assetRegistry.syncCloudMetadata();
  }, [signedInUid, refreshWorlds, refreshMapSummaries]);

  useEffect(() => {
    let isMounted = true;
    if (!activeWorldId) {
      setActiveWorld(null);
      return;
    }
    worldRepository.getWorld(activeWorldId).then((world) => {
      if (isMounted) setActiveWorld(world);
    });
    return () => {
      isMounted = false;
    };
  }, [activeWorldId]);

  // -------------------------------------------------------------------------
  // Weather (preserved HQ live integration + scene effects)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      const cfg = await hqWeatherService.getConfig();
      if (!isMounted) return;
      setWeatherConfig(cfg);
      const live = await hqWeatherService.fetchLiveWeather(cfg);
      if (isMounted) {
        setCurrentWeather(live);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
    // Re-run when the weather modal opens (config may have changed) and when a
    // signed-in session becomes available (cloud config is auth-gated).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeatherModalOpen, signedInUid]);

  const weatherVisualState: WeatherVisualState | null = currentWeather
    ? {
        isRaining: currentWeather.isRaining,
        lightning: currentWeather.weatherCode >= 95,
        condition: currentWeather.conditionDescription,
      }
    : null;

  const weatherFlags: Partial<WeatherEffectFlags> = {
    rainEffectsEnabled: weatherConfig.rainEffectsEnabled && weatherConfig.weatherEnabled,
    lightingEffectsEnabled: weatherConfig.lightingEffectsEnabled && weatherConfig.weatherEnabled,
    windowEffectsEnabled: weatherConfig.windowEffectsEnabled,
  };

  // -------------------------------------------------------------------------
  // Chat speech bubbles + Firestore connectivity check
  // -------------------------------------------------------------------------
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  useEffect(() => {
    const unsub = chatService.subscribeSpeechBubbles((bubble) => {
      canvasRef.current?.showSpeechBubble(bubble.senderId, bubble.text, bubble.durationMs);
    });
    return unsub;
  }, []);

  // -------------------------------------------------------------------------
  // Edit transaction plumbing
  // -------------------------------------------------------------------------
  /** Commands already applied to the map by the Phaser scene (strokes, drags). */
  const recordSceneTransaction = useCallback((commands: EditCommand[]) => {
    historyRef.current.push(commands);
    bumpHistoryVersion();
    setIsDirty(historyRef.current.isDirty);
  }, []);

  /** Commands produced by React UI: apply to the map, refresh the scene, record. */
  const emitCommands = useCallback(
    (commands: EditCommand[]) => {
      if (commands.length === 0) return;
      for (const command of commands) {
        applyCommand(currentMapData, command);
      }
      canvasRef.current?.refreshFromCommands(commands);
      historyRef.current.push(commands);
      bumpHistoryVersion();
      setIsDirty(historyRef.current.isDirty);
    },
    [currentMapData]
  );

  const handleUndo = useCallback(() => {
    const commands = historyRef.current.undo();
    if (!commands) return;
    for (const command of commands) {
      applyCommand(currentMapData, command);
    }
    canvasRef.current?.refreshFromCommands(commands);
    bumpHistoryVersion();
    setIsDirty(historyRef.current.isDirty);
    sounds.playInteract();
  }, [currentMapData]);

  const handleRedo = useCallback(() => {
    const commands = historyRef.current.redo();
    if (!commands) return;
    for (const command of commands) {
      applyCommand(currentMapData, command);
    }
    canvasRef.current?.refreshFromCommands(commands);
    bumpHistoryVersion();
    setIsDirty(historyRef.current.isDirty);
    sounds.playInteract();
  }, [currentMapData]);

  // -------------------------------------------------------------------------
  // Save / publish / reset / import / export / new map
  // -------------------------------------------------------------------------
  const handleSaveDraft = useCallback(async () => {
    setIsSaving(true);
    try {
      const result = await firestoreMapRepository.saveMapDraft(currentMapData);
      historyRef.current.markSaved();
      setIsDirty(false);
      setLastSavedAt(Date.now());
      registerMapWithServer(currentMapData);
      showToast(
        'success',
        result.persistedToCloud
          ? 'Draft saved and synced to the cloud.'
          : 'Draft saved locally (cloud unavailable — will persist on this device).'
      );
    } catch (err) {
      showToast('error', `Save failed: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }, [currentMapData, registerMapWithServer, showToast]);

  const handlePublishMap = useCallback(async () => {
    setIsPublishing(true);
    try {
      await firestoreMapRepository.publishMap(currentMapData);
      historyRef.current.markSaved();
      setIsDirty(false);
      setLastSavedAt(Date.now());
      registerMapWithServer(currentMapData);
      await refreshMapSummaries();
      showToast('success', 'Map published. All clients will load this version.');
    } catch (err) {
      showToast('error', `Publish failed: ${(err as Error).message}`);
    } finally {
      setIsPublishing(false);
    }
  }, [currentMapData, refreshMapSummaries, registerMapWithServer, showToast]);

  const handleResetMapById = useCallback(
    async (mapId: string) => {
      try {
        const fresh = await firestoreMapRepository.resetMap(mapId);
        await refreshMapSummaries();
        if (mapId === currentMapId) {
          setCurrentMapData(fresh);
          historyRef.current.clear();
          bumpHistoryVersion();
          setIsDirty(false);
          setSelection(null);
          canvasRef.current?.loadMapData(fresh);
          registerMapWithServer(fresh);
        }
        sounds.playDoorWarp();
        showToast('info', `Map "${fresh.name}" reset to the factory layout.`);
      } catch (err) {
        showToast('error', `Reset failed: ${(err as Error).message}`);
      }
    },
    [currentMapId, refreshMapSummaries, registerMapWithServer, showToast]
  );

  const handleImportJson = useCallback(
    async (jsonText: string, openAfterImport: boolean = true) => {
      try {
        const imported = firestoreMapRepository.importMapJson(jsonText);
        if (openAfterImport) {
          setCurrentMapId(imported.id);
        }
        showToast('success', `Imported map "${imported.name}" (${imported.width}×${imported.height}).`);
        await refreshMapSummaries();
      } catch (err) {
        showToast('error', `Import failed: ${(err as Error).message}`);
      }
    },
    [refreshMapSummaries, showToast]
  );

  const handleExportJson = useCallback(
    (map: OfficeMapData) => {
      try {
        const json = firestoreMapRepository.exportMapJson(map);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${map.id}.map.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('success', `Exported "${map.name}" as JSON.`);
      } catch (err) {
        showToast('error', `Export failed: ${(err as Error).message}`);
      }
    },
    [showToast]
  );

  const exportMapById = useCallback(
    async (mapId: string) => {
      try {
        const map = await firestoreMapRepository.getMap(mapId);
        handleExportJson(map);
      } catch (err) {
        showToast('error', `Export failed: ${(err as Error).message}`);
      }
    },
    [handleExportJson, showToast]
  );

  const handleDeleteMap = useCallback(
    async (mapId: string) => {
      try {
        await firestoreMapRepository.deleteMap(mapId);
      } catch (err) {
        showToast('error', `Delete failed: ${(err as Error).message}`);
        return;
      }
      await refreshMapSummaries();
      showToast('info', `Deleted map "${mapId}".`);
      if (mapId === currentMapId) {
        openMap('main_office');
      }
    },
    [currentMapId, openMap, refreshMapSummaries, showToast]
  );

  const handleNewMap = useCallback(
    async (options: { name: string; width: number; height: number; tileSize: number }) => {
      const id = `map_${Date.now().toString(36)}`;
      const fresh = createMap({
        id,
        name: options.name || 'New Map',
        width: options.width,
        height: options.height,
        tileSize: options.tileSize,
        environment: 'indoor',
        fillFloorTileId: 0,
        wallBorder: true,
      });
      const result = await firestoreMapRepository.saveMapDraft(fresh);
      await refreshMapSummaries();
      setCurrentMapId(id);
      showToast(
        result.persistedToCloud ? 'success' : 'info',
        result.persistedToCloud
          ? `Created map "${fresh.name}".`
          : `Created map "${fresh.name}" locally (cloud unavailable).`
      );
    },
    [refreshMapSummaries, showToast]
  );

  const handleResizeMap = useCallback(
    (width: number, height: number) => {
      if (width === currentMapData.width && height === currentMapData.height) return;
      const prev = captureResizeSnapshot(currentMapData);
      const result = resizeMap(currentMapData, width, height);
      const next = captureResizeSnapshot(result.map);
      emitCommands([{ kind: 'map.resize', prev, next }]);
      if (result.warnings.length > 0) {
        showToast('info', result.warnings.join(' '), 5200);
      }
      if (result.droppedObjects || result.droppedZones || result.droppedSpawns) {
        showToast(
          'info',
          `Shrink dropped ${result.droppedObjects} object(s), ${result.droppedZones} zone(s), ${result.droppedSpawns} spawn(s).`
        );
      }
    },
    [currentMapData, emitCommands, showToast]
  );

  const handleReloadFromSaved = useCallback(() => {
    loadMapIntoScene(currentMapId, false).catch(() => {
      showToast('error', 'Failed to reload the saved map.');
    });
    showToast('info', 'Reloaded the last saved version.');
  }, [currentMapId, loadMapIntoScene, showToast]);

  // -------------------------------------------------------------------------
  // Keys / focus / sounds / speed boost
  // -------------------------------------------------------------------------
  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sounds.setMuted(nextMuted);
  }, [isMuted]);

  const handleToggleDirectory = useCallback(() => {
    sounds.playInteract();
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gathergrid_directory_open', String(next));
      } catch {
        // Storage unavailable (private browsing) — collapse state is session-only.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (speedBoostTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setSpeedBoostTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [speedBoostTimeLeft]);

  const handleActivateSpeedBoost = useCallback(() => {
    setSpeedBoostTimeLeft(45);
  }, []);

  const handleTriggerReaction = useCallback((emoji: string, slotIndex?: number) => {
    canvasRef.current?.showReactionBubble('current_user', emoji, 3200);
    multiplayerClient.sendReaction(emoji);
    if (slotIndex !== undefined) {
      setActiveReactionSlot(slotIndex);
      setTimeout(() => setActiveReactionSlot(null), 350);
    }
  }, []);

  const handleUpdateQuickSlot = useCallback((slotIndex: number, newEmoji: string) => {
    setQuickEmojiSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = newEmoji;
      try {
        localStorage.setItem('gathergrid_quick_emojis', JSON.stringify(next));
      } catch {
        // Ignore quota
      }
      return next;
    });
  }, []);

  const handleResetQuickSlots = useCallback(() => {
    setQuickEmojiSlots(DEFAULT_QUICK_EMOJIS);
    try {
      localStorage.setItem('gathergrid_quick_emojis', JSON.stringify(DEFAULT_QUICK_EMOJIS));
    } catch {
      // Ignore quota
    }
  }, []);

  // Global focus tracking to safely disable game movement & interaction while typing
  useEffect(() => {
    const isEditable = (el: HTMLElement | null) =>
      !!el &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
        el.isContentEditable ||
        !!(el.closest && el.closest('input, textarea, select, [contenteditable="true"]')));

    const handleFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target as HTMLElement | null)) setIsInputFocused(true);
    };
    const handleFocusOut = () => {
      setTimeout(() => {
        if (!isEditable(document.activeElement as HTMLElement | null)) setIsInputFocused(false);
      }, 50);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Keyboard shortcuts (studio-aware; never fires while typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        (target &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
            target.isContentEditable ||
            (target.closest && target.closest('input, textarea, select, [contenteditable="true"]')))) ||
        (active &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ||
            active.isContentEditable ||
            (active.closest && active.closest('input, textarea, select, [contenteditable="true"]'))));
      if (isTyping) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Studio shortcuts
      if (isStudioMode) {
        if (ctrl && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (ctrl && (e.key === 'y' || e.key === 'Y')) {
          e.preventDefault();
          handleRedo();
          return;
        }
        if (ctrl && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          handleSaveDraft();
          return;
        }
        if (e.key === 'Escape') {
          setMode('world');
          return;
        }
        const toolKeyMap: Record<string, StudioEditorSettings['activeTool']> = {
          v: 'select',
          b: 'paint',
          e: 'erase',
          c: 'collision',
          h: 'pan',
          o: 'object',
          n: 'spawn',
        };
        const tool = toolKeyMap[e.key.toLowerCase()];
        if (tool && !ctrl) {
          setStudioSettings((s) => ({ ...s, activeTool: tool }));
          return;
        }
        if (e.key === 'g' || e.key === 'G') {
          setStudioSettings((s) => ({ ...s, showGrid: !s.showGrid }));
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
          e.preventDefault();
          if (selection.kind === 'object') {
            const obj = currentMapData.objects.find((o) => o.id === selection.id);
            if (obj) emitCommands([{ kind: 'object.remove', object: obj }]);
          } else if (selection.kind === 'spawn') {
            const spawn = (currentMapData.spawnPoints || []).find((s) => s.id === selection.id);
            if (spawn) emitCommands([{ kind: 'spawn.remove', spawn }]);
          } else if (selection.kind === 'zone') {
            const zone = currentMapData.interactionZones.find((z) => z.id === selection.id);
            if (zone) emitCommands([{ kind: 'zone.remove', zone }]);
          }
          setSelection(null);
          return;
        }
        return;
      }

      // World shortcuts
      if (e.key === 'Escape') {
        setModalZone(null);
        setIsAvatarModalOpen(false);
        setIsLoginModalOpen(false);
        setIsWeatherModalOpen(false);
        setIsEmojiPickerOpen(false);
        setIsAssetManagerOpen(false);
        setIsWorldManagerOpen(false);
        setIsMapPickerOpen(false);
      } else if (['1', '2', '3', '4', '5'].includes(e.key) && !anyModalOpen) {
        const slotIdx = parseInt(e.key, 10) - 1;
        if (slotIdx >= 0 && slotIdx < quickEmojiSlots.length) {
          e.preventDefault();
          handleTriggerReaction(quickEmojiSlots[slotIdx], slotIdx);
        }
      } else if ((e.key === 'm' || e.key === 'M') && !anyModalOpen) {
        setIsMiniMapOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isStudioMode,
    selection,
    currentMapData,
    emitCommands,
    handleUndo,
    handleRedo,
    handleSaveDraft,
    anyModalOpen,
    quickEmojiSlots,
    handleTriggerReaction,
  ]);

  // -------------------------------------------------------------------------
  // Scene callbacks
  // -------------------------------------------------------------------------
  const handleMapChange = useCallback((mapId: string, mapName: string) => {
    setCurrentMapId((prev) => (prev === mapId ? prev : mapId));
    setCurrentMapName(mapName);
    setPlayerProfile((prev) => (prev.currentMapId === mapId ? prev : { ...prev, currentMapId: mapId }));
  }, []);

  const handlePlayerMove = useCallback(
    (pos: { x: number; y: number; tileX: number; tileY: number; mapId: string }) => {
      setPlayerCoords({ x: pos.x, y: pos.y, tileX: pos.tileX, tileY: pos.tileY });
    },
    []
  );

  const handleInteract = useCallback(
    (zone: InteractionZone) => {
      if (zone.type === 'door_warp' && zone.warpTarget) {
        const { mapId, spawnTileX, spawnTileY, targetSpawnId } = zone.warpTarget;
        firestoreMapRepository
          .getMap(mapId)
          .then((targetMap) => {
            const result = validateTransition(targetMap, {
              targetSpawnId,
              spawnTileX,
              spawnTileY,
            });
            if (!result.ok) {
              showToast('error', `Cannot use this door: ${result.error}`, 5200);
              return;
            }
            pendingWarpRef.current = {
              mapId,
              spawnTileX: result.spawn.tileX,
              spawnTileY: result.spawn.tileY,
            };
            setCurrentMapId(mapId);
          })
          .catch(() => {
            showToast('error', `Destination map "${mapId}" could not be loaded.`);
          });
      } else {
        setModalZone(zone);
      }
    },
    [showToast]
  );

  const handleTeleportTo = useCallback(
    (colleague: UserProfile) => {
      if (colleague.currentMapId !== currentMapId) {
        openMap(colleague.currentMapId);
      }
    },
    [currentMapId, openMap]
  );

  // -------------------------------------------------------------------------
  // Studio helpers
  // -------------------------------------------------------------------------
  const toggleStudio = useCallback(() => {
    if (isStudioMode) {
      setMode('world');
      return;
    }
    if (!isAdmin) {
      showToast('error', 'Studio Mode is available to administrators only.');
      return;
    }
    const firstLayer = getTileLayers(currentMapData)[0];
    setStudioSettings((s) => ({
      ...s,
      activeLayerId: s.activeLayerId ?? firstLayer?.id ?? null,
    }));
    setMode('studio');
    sounds.playInteract();
  }, [currentMapData, isAdmin, isStudioMode, showToast]);

  const handleUpdateLayer = useCallback(
    (layerId: string, patch: Partial<MapLayerData>) => {
      const layer = (currentMapData.layers || []).find((l) => l.id === layerId);
      if (!layer) return;
      const prev: Partial<MapLayerData> = {};
      const next: Partial<MapLayerData> = {};
      for (const key of Object.keys(patch) as Array<keyof MapLayerData>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prev as any)[key] = (layer as any)[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[key] = (patch as any)[key];
      }
      emitCommands([{ kind: 'layer.update', id: layerId, prev, next }]);
    },
    [currentMapData, emitCommands]
  );

  const handleAddLayer = useCallback(
    (depthMode: 'ground' | 'row') => {
      const maxOrder = Math.max(0, ...(currentMapData.layers || []).map((l) => l.order || 0));
      const layer = createTileLayer(
        depthMode === 'row' ? `Walls ${(currentMapData.layers || []).filter((l) => l.depthMode === 'row').length + 1}` : `Ground ${(currentMapData.layers || []).filter((l) => l.depthMode === 'ground').length + 1}`,
        currentMapData.width,
        currentMapData.height,
        depthMode
      );
      layer.id = makeLayerId(depthMode === 'row' ? 'walls' : 'ground');
      layer.order = maxOrder + 10;
      emitCommands([{ kind: 'layer.add', layer }]);
      setStudioSettings((s) => ({ ...s, activeLayerId: layer.id }));
    },
    [currentMapData, emitCommands]
  );

  const handleRemoveLayer = useCallback(
    (layerId: string) => {
      const layer = (currentMapData.layers || []).find((l) => l.id === layerId);
      if (!layer) return;
      if (layer.kind !== 'tiles') {
        showToast('error', 'The collision layer cannot be removed.');
        return;
      }
      const groundCount = (currentMapData.layers || []).filter(
        (l) => l.kind === 'tiles' && l.depthMode === 'ground'
      ).length;
      if (layer.depthMode === 'ground' && groundCount <= 1) {
        showToast('error', 'At least one ground layer must remain.');
        return;
      }
      emitCommands([{ kind: 'layer.remove', layer }]);
      if (studioSettings.activeLayerId === layerId) {
        const next = getTileLayers(currentMapData).find((l) => l.id !== layerId);
        setStudioSettings((s) => ({ ...s, activeLayerId: next?.id ?? null }));
      }
    },
    [currentMapData, emitCommands, showToast, studioSettings.activeLayerId]
  );

  const handleMoveLayer = useCallback(
    (layerId: string, direction: -1 | 1) => {
      const layers = (currentMapData.layers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = layers.findIndex((l) => l.id === layerId);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= layers.length) return;
      const a = layers[index];
      const b = layers[swapWith];
      emitCommands([
        { kind: 'layer.update', id: a.id, prev: { order: a.order }, next: { order: b.order } },
        { kind: 'layer.update', id: b.id, prev: { order: b.order }, next: { order: a.order } },
      ]);
    },
    [currentMapData, emitCommands]
  );

  const handleAddTilesetToMap = useCallback(
    (assetId: string): number | null => {
      const existing = (currentMapData.tilesets || []).find((t) => t.assetId === assetId);
      if (existing) return existing.firstTileId;
      const asset = assetRegistry.get(assetId);
      if (!asset) {
        showToast('error', 'Asset metadata not found. Re-import it from the Asset Manager.');
        return null;
      }
      const tileset: MapTilesetRef = {
        id: `ts_${Date.now().toString(36)}`,
        name: asset.name,
        source: 'asset',
        assetId,
        tileSize: asset.frameWidth,
        columns: asset.columns,
        rows: asset.rows,
        firstTileId: 0,
        tileCount: Math.max(1, asset.columns * asset.rows),
      };
      emitCommands([{ kind: 'tileset.add', tileset }]);
      const added = (currentMapData.tilesets || []).find((t) => t.id === tileset.id);
      showToast('success', `Added tileset "${asset.name}" to this map.`);
      return added ? added.firstTileId : null;
    },
    [currentMapData, emitCommands, showToast]
  );

  const handleSetMapMeta = useCallback(
    (patch: Partial<OfficeMapData>) => {
      const prev: Partial<OfficeMapData> = {};
      const next: Partial<OfficeMapData> = {};
      for (const key of Object.keys(patch) as Array<keyof OfficeMapData>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prev as any)[key] = (currentMapData as any)[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[key] = (patch as any)[key];
      }
      emitCommands([{ kind: 'map.meta', prev, next }]);
      if (patch.name) setCurrentMapName(patch.name);
      if (patch.tileSize) {
        // Re-declare bounds/mask with the server at the new tile size.
        window.setTimeout(() => registerMapWithServer(currentMapData), 0);
      }
    },
    [currentMapData, emitCommands, registerMapWithServer]
  );

  const handleAddSpawn = useCallback(() => {
    const x = cursorTile.inside ? cursorTile.x : Math.floor(currentMapData.width / 2);
    const y = cursorTile.inside ? cursorTile.y : Math.floor(currentMapData.height / 2);
    const spawn: MapSpawnPoint = {
      id: `spawn_${Date.now().toString(36)}`,
      name: `Spawn ${(currentMapData.spawnPoints || []).length + 1}`,
      tileX: x,
      tileY: y,
      direction: 'down',
    };
    emitCommands([{ kind: 'spawn.add', spawn }]);
    syncPrimarySpawn(currentMapData);
    setSelection({ kind: 'spawn', id: spawn.id });
  }, [currentMapData, cursorTile, emitCommands]);

  const handleAddZone = useCallback(() => {
    const x = cursorTile.inside ? cursorTile.x : Math.floor(currentMapData.width / 2);
    const y = cursorTile.inside ? cursorTile.y : Math.floor(currentMapData.height / 2);
    const zone: InteractionZone = {
      id: `zone_${Date.now().toString(36)}`,
      name: `Zone ${(currentMapData.interactionZones || []).length + 1}`,
      type: 'desk',
      tileX: x,
      tileY: y,
      width: 2,
      height: 2,
      prompt: 'Press [E] to interact',
    };
    emitCommands([{ kind: 'zone.add', zone }]);
    setSelection({ kind: 'zone', id: zone.id });
  }, [currentMapData, cursorTile, emitCommands]);

  const handleUpdateObject = useCallback(
    (id: string, patch: Partial<MapObject>) => {
      const obj = currentMapData.objects.find((o) => o.id === id);
      if (!obj) return;
      const prev: Partial<MapObject> = {};
      const next: Partial<MapObject> = {};
      for (const key of Object.keys(patch) as Array<keyof MapObject>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prev as any)[key] = (obj as any)[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[key] = (patch as any)[key];
      }
      emitCommands([{ kind: 'object.update', id, prev, next }]);
    },
    [currentMapData, emitCommands]
  );

  const handleRemoveObject = useCallback(
    (id: string) => {
      const obj = currentMapData.objects.find((o) => o.id === id);
      if (!obj) return;
      emitCommands([{ kind: 'object.remove', object: obj }]);
      if (selection?.kind === 'object' && selection.id === id) setSelection(null);
    },
    [currentMapData, emitCommands, selection]
  );

  const handleUpdateZone = useCallback(
    (id: string, patch: Partial<InteractionZone>) => {
      const zone = currentMapData.interactionZones.find((z) => z.id === id);
      if (!zone) return;
      const prev: Partial<InteractionZone> = {};
      const next: Partial<InteractionZone> = {};
      for (const key of Object.keys(patch) as Array<keyof InteractionZone>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prev as any)[key] = (zone as any)[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[key] = (patch as any)[key];
      }
      emitCommands([{ kind: 'zone.update', id, prev, next }]);
    },
    [currentMapData, emitCommands]
  );

  const handleRemoveZone = useCallback(
    (id: string) => {
      const zone = currentMapData.interactionZones.find((z) => z.id === id);
      if (!zone) return;
      emitCommands([{ kind: 'zone.remove', zone }]);
      if (selection?.kind === 'zone' && selection.id === id) setSelection(null);
    },
    [currentMapData, emitCommands, selection]
  );

  const handleUpdateSpawn = useCallback(
    (id: string, patch: Partial<MapSpawnPoint>) => {
      const spawn = (currentMapData.spawnPoints || []).find((s) => s.id === id);
      if (!spawn) return;
      const prev: Partial<MapSpawnPoint> = {};
      const next: Partial<MapSpawnPoint> = {};
      for (const key of Object.keys(patch) as Array<keyof MapSpawnPoint>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prev as any)[key] = (spawn as any)[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[key] = (patch as any)[key];
      }
      emitCommands([{ kind: 'spawn.update', id, prev, next }]);
    },
    [currentMapData, emitCommands]
  );

  const handleRemoveSpawn = useCallback(
    (id: string) => {
      const spawn = (currentMapData.spawnPoints || []).find((s) => s.id === id);
      if (!spawn) return;
      emitCommands([{ kind: 'spawn.remove', spawn }]);
      syncPrimarySpawn(currentMapData);
      if (selection?.kind === 'spawn' && selection.id === id) setSelection(null);
    },
    [currentMapData, emitCommands, selection]
  );

  const historyKey = historyVersion; // re-render trigger
  void historyKey;
  const canUndo = historyRef.current.canUndo;
  const canRedo = historyRef.current.canRedo;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Navbar
        currentMapId={currentMapId}
        onSelectMap={(mapId) => openMap(mapId)}
        onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onlineCount={colleagues.length + 1}
        isDirectoryOpen={isSidebarOpen}
        onToggleDirectory={handleToggleDirectory}
        isEditorOpen={isStudioMode}
        onToggleEditor={toggleStudio}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
        currentWeather={currentWeather}
        connectionState={connectionState}
        pingMs={pingMs}
      />

      {isStudioMode && (
        <StudioCommandBar
          map={currentMapData}
          isDirty={isDirty}
          isSaving={isSaving}
          isPublishing={isPublishing}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={historyRef.current.undoLabel}
          redoLabel={historyRef.current.redoLabel}
          isAdmin={isAdmin}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublishMap}
          onExportJson={() => handleExportJson(currentMapData)}
          onImportJson={(jsonText) => handleImportJson(jsonText)}
          onNewMap={handleNewMap}
          onResizeMap={handleResizeMap}
          onExitStudio={() => setMode('world')}
          onOpenAssetManager={() => setIsAssetManagerOpen(true)}
          onOpenMapPicker={() => setIsMapPickerOpen(true)}
          onOpenWorldManager={() => setIsWorldManagerOpen(true)}
          onReloadFromSaved={handleReloadFromSaved}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 relative h-full w-full overflow-hidden">
          <OfficeCanvas
            ref={canvasRef}
            playerProfile={playerProfile}
            mockUsers={colleagues}
            initialMapData={currentMapData}
            onZoneChange={setActiveZone}
            onPlayerMove={handlePlayerMove}
            onPlayerMoveIntent={(intent) => multiplayerClient.sendMovement(intent)}
            onMapChange={handleMapChange}
            onInteract={handleInteract}
            onEditTransaction={recordSceneTransaction}
            onSelectionChange={setSelection}
            onCursorMove={(x, y, inside) => setCursorTile({ x, y, inside })}
            onZoomChange={(zoom) => setStudioSettings((s) => ({ ...s, zoom }))}
            avatarConfig={playerProfile.avatarConfig}
            speedBoostActive={speedBoostTimeLeft > 0}
            isControlsEnabled={!isInputFocused && !anyModalOpen && !isStudioMode}
            isStudioMode={isStudioMode}
            studioSettings={studioSettings}
            weatherState={weatherVisualState}
            weatherFlags={weatherFlags}
          />

          {!isStudioMode && (
            <>
              {/* Quick Reaction Dock (1-5 keys + Google Emoji Picker) */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                <EmojiReactionDock
                  quickSlots={quickEmojiSlots}
                  onTriggerReaction={handleTriggerReaction}
                  onOpenEmojiPicker={() => setIsEmojiPickerOpen(true)}
                  activeReactionSlot={activeReactionSlot}
                />
              </div>

              {/* Mini-Map Overlay */}
              <MiniMap
                mapData={currentMapData}
                playerTileX={playerCoords.tileX}
                playerTileY={playerCoords.tileY}
                colleagues={colleagues}
                isOpen={isMiniMapOpen}
                onToggle={() => setIsMiniMapOpen(!isMiniMapOpen)}
              />

              {/* Chat Preview Drawer with Speech Bubble triggering */}
              <ChatPreviewDrawer
                currentUser={playerProfile}
                selectedDirectUser={selectedDirectUser}
                onClearDirectUser={() => setSelectedDirectUser(null)}
                onFocusInput={(focused) => setIsInputFocused(focused)}
                onSendLocalMessage={(text) => {
                  canvasRef.current?.showSpeechBubble('current_user', text, 4500);
                }}
              />

              {/* HUD Keybind Controls & Buff Bar */}
              <ControlsOverlay
                speedBoostTimeLeft={speedBoostTimeLeft}
                currentMapName={currentMapName}
              />
            </>
          )}

          {isStudioMode && (
            <>
              <StudioToolsRail
                settings={studioSettings}
                onChange={(patch) => setStudioSettings((s) => ({ ...s, ...patch }))}
              />
              <StudioPalette
                map={currentMapData}
                settings={studioSettings}
                onSelectTile={(tileId) => setStudioSettings((s) => ({ ...s, selectedTileId: tileId, activeTool: 'paint' }))}
                onSelectObject={(ref) => setStudioSettings((s) => ({ ...s, selectedObject: ref, activeTool: 'object' }))}
                onAddTileset={handleAddTilesetToMap}
                onOpenAssetManager={() => setIsAssetManagerOpen(true)}
              />
              <StudioLayersPanel
                map={currentMapData}
                settings={studioSettings}
                onChange={(patch) => setStudioSettings((s) => ({ ...s, ...patch }))}
                onAddTileLayer={handleAddLayer}
                onRemoveLayer={handleRemoveLayer}
                onUpdateLayer={handleUpdateLayer}
                onMoveLayer={handleMoveLayer}
                onSetTileSize={(tileSize) => handleSetMapMeta({ tileSize })}
                onSetEnvironment={(environment) => handleSetMapMeta({ environment })}
                onSetMapName={(name) => handleSetMapMeta({ name })}
              />
              <StudioPropertiesPanel
                map={currentMapData}
                selection={selection}
                cursor={cursorTile}
                mapOptions={mapSummaries}
                onSelect={setSelection}
                onUpdateObject={handleUpdateObject}
                onRemoveObject={handleRemoveObject}
                onUpdateZone={handleUpdateZone}
                onRemoveZone={handleRemoveZone}
                onUpdateSpawn={handleUpdateSpawn}
                onRemoveSpawn={handleRemoveSpawn}
                onAddSpawn={handleAddSpawn}
                onAddZone={handleAddZone}
              />
              <StudioStatusBar
                map={currentMapData}
                cursor={cursorTile}
                zoom={studioSettings.zoom}
                selection={selection}
                isDirty={isDirty}
                lastSavedAt={lastSavedAt}
              />
            </>
          )}

          {/* Toasts */}
          <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`px-4 py-2.5 rounded-lg text-xs font-medium shadow-xl border backdrop-blur max-w-sm ${
                  toast.kind === 'success'
                    ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100'
                    : toast.kind === 'error'
                      ? 'bg-red-950/90 border-red-500/50 text-red-100'
                      : 'bg-slate-900/90 border-slate-600/60 text-slate-100'
                }`}
              >
                {toast.message}
              </div>
            ))}
          </div>
        </main>

        {/* Colleagues Directory Sidebar (world mode only) */}
        {!isStudioMode && (
          <div
            id="colleagues-directory"
            className={`transition-all duration-200 shrink-0 ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}
          >
            <NearbyColleagues
              colleagues={colleagues}
              currentMapId={currentMapId}
              playerTileX={playerCoords.tileX}
              playerTileY={playerCoords.tileY}
              onTeleportTo={handleTeleportTo}
              onDirectMessage={(colleague) => setSelectedDirectUser(colleague)}
              onCollapse={handleToggleDirectory}
            />
          </div>
        )}
      </div>

      {/* Interactive Zone Modal */}
      <InteractionModal
        zone={modalZone}
        onClose={() => setModalZone(null)}
        onActivateSpeedBoost={handleActivateSpeedBoost}
      />

      {/* Avatar Studio & Profile Customizer Modal */}
      <AvatarCustomizerModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        playerProfile={playerProfile}
        onSaveProfile={async (updatedProfile) => {
          setPlayerProfile(updatedProfile);
          if (user) {
            await updateUserProfile({
              displayName: updatedProfile.name,
              title: updatedProfile.title,
              avatarConfig: updatedProfile.avatarConfig,
            });
          }
        }}
      />

      {/* Login Modal */}
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />

      {/* HQ Weather Modal */}
      <HQWeatherModal
        isOpen={isWeatherModalOpen}
        onClose={() => setIsWeatherModalOpen(false)}
        isAdmin={isAdmin}
        onConfigUpdated={(cfg) => {
          setWeatherConfig(cfg);
          hqWeatherService.fetchLiveWeather(cfg).then((live) => setCurrentWeather(live));
        }}
      />

      {/* Full Google Emoji Picker Modal */}
      <GoogleEmojiPickerModal
        isOpen={isEmojiPickerOpen}
        onClose={() => setIsEmojiPickerOpen(false)}
        onSelectEmoji={(emoji) => handleTriggerReaction(emoji)}
        quickSlots={quickEmojiSlots}
        onUpdateQuickSlot={handleUpdateQuickSlot}
        onResetQuickSlots={handleResetQuickSlots}
      />

      {/* Studio modals */}
      <AssetManagerModal isOpen={isAssetManagerOpen} onClose={() => setIsAssetManagerOpen(false)} />
      <WorldManagerModal
        isOpen={isWorldManagerOpen}
        onClose={() => setIsWorldManagerOpen(false)}
        worlds={worlds}
        activeWorldId={activeWorldId}
        maps={mapSummaries}
        currentMapId={currentMapId}
        onWorldsChanged={() => {
          refreshWorlds().catch(() => undefined);
        }}
        onOpenMap={(mapId) => {
          setIsWorldManagerOpen(false);
          openMap(mapId);
        }}
        onSetActiveWorld={(worldId, world) => {
          setActiveWorldId(worldId);
          setActiveWorld(world);
        }}
        activeWorld={activeWorld}
      />
      <MapPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        maps={mapSummaries}
        currentMapId={currentMapId}
        onOpenMap={(mapId) => {
          setIsMapPickerOpen(false);
          openMap(mapId);
        }}
        onEditMap={(mapId) => {
          setIsMapPickerOpen(false);
          if (!isAdmin) {
            showToast('error', 'Studio Mode is available to administrators only.');
            return;
          }
          if (mapId !== currentMapId) openMap(mapId);
          setMode('studio');
        }}
        onExportMap={(mapId) => {
          void exportMapById(mapId);
        }}
        onResetMap={(mapId) => {
          void handleResetMapById(mapId);
        }}
        onDeleteMap={(mapId) => {
          void handleDeleteMap(mapId);
        }}
        onRefresh={() => {
          refreshMapSummaries().catch(() => undefined);
        }}
        onImportJson={(jsonText) => handleImportJson(jsonText, false)}
        showToast={showToast}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <VirtualOfficeApp />
    </AuthProvider>
  );
}
