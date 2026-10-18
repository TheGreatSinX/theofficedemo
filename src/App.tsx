/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OfficeCanvas, OfficeCanvasHandle } from './components/OfficeCanvas';
import { Navbar } from './components/Navbar';
import { NearbyColleagues } from './components/NearbyColleagues';
import { InteractionModal } from './components/InteractionModal';
import { AvatarCustomizerModal } from './components/AvatarCustomizerModal';
import { MiniMap } from './components/MiniMap';
import { ChatPreviewDrawer } from './components/ChatPreviewDrawer';
import { ControlsOverlay } from './components/ControlsOverlay';
import { MapEditorToolbar } from './components/MapEditorToolbar';
import { LoginModal } from './components/LoginModal';
import { HQWeatherModal } from './components/HQWeatherModal';
import { EmojiReactionDock } from './components/EmojiReactionDock';
import { GoogleEmojiPickerModal } from './components/GoogleEmojiPickerModal';
import { DEFAULT_QUICK_EMOJIS } from './data/googleEmojis';
import { AuthProvider, useAuth } from './context/AuthContext';
import { firestoreMapRepository } from './services/FirestoreMapRepository';
import { chatService } from './services/ChatService';
import { presenceService } from './services/PresenceService';
import { hqWeatherService, CurrentWeatherState } from './services/HQWeatherService';
import { testFirestoreConnection } from './services/firebase';
import { OFFICE_MAPS } from './game/maps/officeMaps';
import {
  UserProfile,
  InteractionZone,
  OfficeMapData,
  EditorSettings,
} from './types/game';
import { sounds } from './game/soundEffects';
import { multiplayerClient, ConnectionState } from './multiplayer/client';

function VirtualOfficeApp() {
  const canvasRef = useRef<OfficeCanvasHandle>(null);
  const { user, profile, isAdmin, updateUserProfile } = useAuth();

  // User Profile & Presence
  const [playerProfile, setPlayerProfile] = useState<UserProfile>(
    profile || presenceService.getCurrentUser()
  );
  const [colleagues, setColleagues] = useState<UserProfile[]>(
    presenceService.getOnlineUsers().filter((u) => u.id !== playerProfile.id)
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [pingMs, setPingMs] = useState<number>(0);

  // Map state
  const [currentMapId, setCurrentMapId] = useState<string>('main_office');
  const [currentMapName, setCurrentMapName] = useState<string>('Main Open Workspace');
  const [currentMapData, setCurrentMapData] = useState<OfficeMapData>(() => {
    const factory = OFFICE_MAPS['main_office'];
    return factory();
  });

  // Undo history stack for map edits
  const [mapHistory, setMapHistory] = useState<OfficeMapData[]>([]);

  // Coordinate tracking
  const [playerCoords, setPlayerCoords] = useState<{ x: number; y: number; tileX: number; tileY: number }>({
    x: 8 * 32,
    y: 11 * 32,
    tileX: 8,
    tileY: 11,
  });

  // Sync player profile with Firebase Auth profile when available
  useEffect(() => {
    if (profile) {
      setPlayerProfile(profile);
    }
  }, [profile]);

  // Subscribe to presence service updates
  useEffect(() => {
    const unsub = presenceService.subscribe((users) => {
      setColleagues(users.filter((u) => u.id !== playerProfile.id));
    });
    return unsub;
  }, [playerProfile.id]);

  // Real-time Multiplayer WebSocket coordination
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
      multiplayerClient.disconnect();
    };
  }, [currentMapId, playerProfile.id]);

  // UI Modals & Panels
  const [activeZone, setActiveZone] = useState<InteractionZone | null>(null);
  const [modalZone, setModalZone] = useState<InteractionZone | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [speedBoostTimeLeft, setSpeedBoostTimeLeft] = useState(0);
  const [selectedDirectUser, setSelectedDirectUser] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Weather state
  const [currentWeather, setCurrentWeather] = useState<CurrentWeatherState | null>(null);

  // Editor mode state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>({
    activeTool: 'brush_floor',
    selectedFloorTile: 0,
    selectedWallTile: 11,
    selectedObjectType: 'desk_single',
    showCollisionOverlay: false,
  });

  // Chat focus to disable keyboard movement
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Google Emoji Quick Reaction State
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

  const handleTriggerReaction = useCallback(
    (emoji: string, slotIndex?: number) => {
      // 1. Show local reaction bubble immediately above player avatar
      canvasRef.current?.showReactionBubble('current_user', emoji, 3200);

      // 2. Broadcast via multiplayer WebSocket
      multiplayerClient.sendReaction(emoji);

      // 3. Highlight slot button momentarily if triggered by hotkey
      if (slotIndex !== undefined) {
        setActiveReactionSlot(slotIndex);
        setTimeout(() => setActiveReactionSlot(null), 350);
      }
    },
    []
  );

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

  // Test Firestore connection on boot
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Fetch initial HQ weather and refresh every 10 minutes
  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      const cfg = await hqWeatherService.getConfig();
      if (!isMounted) return;
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
  }, []);

  // Load map from Firestore repository on mount or map change
  useEffect(() => {
    let isMounted = true;
    firestoreMapRepository.getMap(currentMapId).then((loaded) => {
      if (isMounted) {
        setCurrentMapData(loaded);
        setCurrentMapName(loaded.name);
        setMapHistory([]);
        canvasRef.current?.loadMapData(loaded);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentMapId]);

  // Subscribe to speech bubbles from ChatService
  useEffect(() => {
    const unsub = chatService.subscribeSpeechBubbles((bubble) => {
      canvasRef.current?.showSpeechBubble(bubble.senderId, bubble.text, bubble.durationMs);
    });
    return unsub;
  }, []);

  // Sound toggle handler
  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sounds.setMuted(nextMuted);
  }, [isMuted]);

  // Speed boost countdown
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

  // Map modification callback from Phaser scene
  const handleMapModified = useCallback(
    (newMapData: OfficeMapData) => {
      setMapHistory((prev) => [...prev.slice(-24), JSON.parse(JSON.stringify(currentMapData))]);
      setCurrentMapData(newMapData);
    },
    [currentMapData]
  );

  // Undo function
  const handleUndo = useCallback(() => {
    if (mapHistory.length === 0) return;
    const previous = mapHistory[mapHistory.length - 1];
    setMapHistory((prev) => prev.slice(0, -1));
    setCurrentMapData(previous);
    canvasRef.current?.loadMapData(previous);
    sounds.playInteract();
  }, [mapHistory]);

  // Save map draft to Firestore
  const handleSaveDraft = useCallback(async () => {
    await firestoreMapRepository.saveMapDraft(currentMapData);
  }, [currentMapData]);

  // Publish map to Firestore (updates publishedMapVersion in platformConfig)
  const handlePublishMap = useCallback(async () => {
    await firestoreMapRepository.publishMap(currentMapData);
  }, [currentMapData]);

  // Reset map to factory default
  const handleResetMap = useCallback(async () => {
    const fresh = await firestoreMapRepository.resetMap(currentMapId);
    setCurrentMapData(fresh);
    setMapHistory([]);
    canvasRef.current?.loadMapData(fresh);
    sounds.playDoorWarp();
  }, [currentMapId]);

  // Import JSON
  const handleImportJson = useCallback((jsonStr: string) => {
    const imported = firestoreMapRepository.importMapJson(jsonStr);
    setCurrentMapData(imported);
    setMapHistory([]);
    canvasRef.current?.loadMapData(imported);
  }, []);

  // Global focus tracking to safely disable game movement & interaction while typing
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable ||
          (target.closest && target.closest('input, textarea, select, [contenteditable="true"]')))
      ) {
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (
          !active ||
          (!['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) &&
            !active.isContentEditable &&
            !(active.closest && active.closest('input, textarea, select, [contenteditable="true"]')))
        ) {
          setIsInputFocused(false);
        }
      }, 50);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Keyboard shortcuts: Esc, M, Ctrl+Z (strictly ignored when typing in any input)
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

      if (isTyping) {
        return;
      }

      if (e.key === 'Escape') {
        setModalZone(null);
        setIsAvatarModalOpen(false);
        setIsLoginModalOpen(false);
        setIsWeatherModalOpen(false);
        setIsEmojiPickerOpen(false);
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const slotIdx = parseInt(e.key, 10) - 1;
        if (slotIdx >= 0 && slotIdx < quickEmojiSlots.length) {
          e.preventDefault();
          handleTriggerReaction(quickEmojiSlots[slotIdx], slotIdx);
        }
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMiniMapOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (isEditorOpen && mapHistory.length > 0 && isAdmin) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen, mapHistory, handleUndo, isAdmin, quickEmojiSlots, handleTriggerReaction]);

  const handleMapChange = useCallback((mapId: string, mapName: string) => {
    setCurrentMapId(mapId);
    setCurrentMapName(mapName);
    setPlayerProfile((prev) => ({ ...prev, currentMapId: mapId }));
  }, []);

  const handlePlayerMove = useCallback((pos: { x: number; y: number; tileX: number; tileY: number; mapId: string }) => {
    setPlayerCoords({
      x: pos.x,
      y: pos.y,
      tileX: pos.tileX,
      tileY: pos.tileY,
    });
  }, []);

  const handleInteract = useCallback((zone: InteractionZone) => {
    if (zone.type === 'door_warp' && zone.warpTarget) {
      const { mapId, spawnTileX, spawnTileY } = zone.warpTarget;
      firestoreMapRepository.getMap(mapId).then((targetMap) => {
        canvasRef.current?.switchMapWithTransition(targetMap, spawnTileX, spawnTileY);
      });
    } else {
      setModalZone(zone);
    }
  }, []);

  const handleTeleportTo = useCallback((colleague: UserProfile) => {
    if (colleague.currentMapId !== currentMapId) {
      setCurrentMapId(colleague.currentMapId);
    }
  }, [currentMapId]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <Navbar
        currentMapId={currentMapId}
        onSelectMap={(mapId) => setCurrentMapId(mapId)}
        onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onlineCount={colleagues.length + 1}
        isEditorOpen={isEditorOpen}
        onToggleEditor={() => setIsEditorOpen(!isEditorOpen)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
        currentWeather={currentWeather}
        connectionState={connectionState}
        pingMs={pingMs}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 2D Game Viewport */}
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
            onMapModified={handleMapModified}
            avatarConfig={playerProfile.avatarConfig}
            speedBoostActive={speedBoostTimeLeft > 0}
            isControlsEnabled={!isInputFocused && !modalZone && !isAvatarModalOpen && !isLoginModalOpen && !isWeatherModalOpen && !isEmojiPickerOpen}
            isEditorMode={isEditorOpen && isAdmin}
            editorSettings={editorSettings}
          />

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

          {/* Map Editor Toolbar */}
          <MapEditorToolbar
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            settings={editorSettings}
            onUpdateSettings={setEditorSettings}
            canUndo={mapHistory.length > 0}
            onUndo={handleUndo}
            onSaveDraft={handleSaveDraft}
            onPublishMap={handlePublishMap}
            onResetMap={handleResetMap}
            currentMapData={currentMapData}
            onImportJson={handleImportJson}
            isAdmin={isAdmin}
            onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
          />
        </main>

        {/* Colleagues Directory Sidebar */}
        <div className={`transition-all duration-200 shrink-0 ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          <NearbyColleagues
            colleagues={colleagues}
            currentMapId={currentMapId}
            playerTileX={playerCoords.tileX}
            playerTileY={playerCoords.tileY}
            onTeleportTo={handleTeleportTo}
            onDirectMessage={(colleague) => setSelectedDirectUser(colleague)}
          />
        </div>
      </div>

      {/* Interactive Zone Modal (Google Meet, Coffee, Sprint Board, Focus Pod) */}
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
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* HQ Weather Modal */}
      <HQWeatherModal
        isOpen={isWeatherModalOpen}
        onClose={() => setIsWeatherModalOpen(false)}
        isAdmin={isAdmin}
        onConfigUpdated={(cfg) => {
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
