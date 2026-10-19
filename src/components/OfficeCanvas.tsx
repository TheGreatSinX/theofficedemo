/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * React wrapper around the Phaser OfficeScene. The Phaser game instance is
 * created exactly once and never re-created on React re-renders; all runtime
 * synchronization flows through the imperative handle and prop effects.
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import Phaser from 'phaser';
import {
  OfficeScene,
  SceneCallbacks,
  StudioEditorSettings,
  StudioSelection,
  WeatherEffectFlags,
  WeatherVisualState,
} from '../game/OfficeScene';
import {
  UserProfile,
  InteractionZone,
  AvatarConfig,
  OfficeMapData,
  Direction,
} from '../types/game';
import { EditCommand } from '../game/edits';
import { PlayerNetState } from '../multiplayer/protocol';

interface OfficeCanvasProps {
  playerProfile: UserProfile;
  mockUsers: UserProfile[];
  initialMapData: OfficeMapData;
  onZoneChange: (zone: InteractionZone | null) => void;
  onPlayerMove: (pos: { x: number; y: number; tileX: number; tileY: number; mapId: string }) => void;
  onPlayerMoveIntent?: (intent: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    direction: Direction;
    isMoving: boolean;
  }) => void;
  onMapChange: (mapId: string, mapName: string) => void;
  onInteract: (zone: InteractionZone) => void;
  onEditTransaction?: (commands: EditCommand[]) => void;
  onSelectionChange?: (selection: StudioSelection) => void;
  onCursorMove?: (tileX: number, tileY: number, inside: boolean) => void;
  onZoomChange?: (zoom: number) => void;
  avatarConfig: AvatarConfig;
  speedBoostActive: boolean;
  isControlsEnabled: boolean;
  isStudioMode: boolean;
  studioSettings: StudioEditorSettings;
  weatherState?: WeatherVisualState | null;
  weatherFlags?: Partial<WeatherEffectFlags>;
}

export interface OfficeCanvasHandle {
  loadMapData: (data: OfficeMapData, spawnX?: number, spawnY?: number) => void;
  switchMapWithTransition: (data: OfficeMapData, spawnX?: number, spawnY?: number) => void;
  showSpeechBubble: (senderId: string, text: string, durationMs?: number) => void;
  showReactionBubble: (senderId: string, emoji: string, durationMs?: number) => void;
  setControlsEnabled: (enabled: boolean) => void;
  syncRemoteSnapshot: (players: PlayerNetState[]) => void;
  handleRemotePlayerJoined: (player: PlayerNetState) => void;
  handleRemotePlayerLeft: (userId: string) => void;
  handleRemotePlayerStates: (
    states: Array<{
      userId: string;
      x: number;
      y: number;
      direction: Direction;
      isMoving: boolean;
    }>
  ) => void;
  handleServerCorrection: (correctX: number, correctY: number) => void;
  updateLocalPlayerProfile: (profile: UserProfile) => void;
  applyExternalCommands: (commands: EditCommand[]) => void;
  refreshFromCommands: (commands: EditCommand[]) => void;
  recenterCamera: () => void;
  getPlayerPosition: () => { x: number; y: number };
}

export const OfficeCanvas = forwardRef<OfficeCanvasHandle, OfficeCanvasProps>(
  (
    {
      playerProfile,
      mockUsers,
      initialMapData,
      onZoneChange,
      onPlayerMove,
      onPlayerMoveIntent,
      onMapChange,
      onInteract,
      onEditTransaction,
      onSelectionChange,
      onCursorMove,
      onZoomChange,
      avatarConfig,
      speedBoostActive,
      isControlsEnabled,
      isStudioMode,
      studioSettings,
      weatherState,
      weatherFlags,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<OfficeScene | null>(null);
    const isSceneReadyRef = useRef(false);

    // Keep the latest callbacks/props available to the scene-ready handler
    // without recreating the Phaser game.
    const latestRef = useRef({
      onZoneChange,
      onPlayerMove,
      onPlayerMoveIntent,
      onMapChange,
      onInteract,
      onEditTransaction,
      onSelectionChange,
      onCursorMove,
      onZoomChange,
      isControlsEnabled,
      speedBoostActive,
      isStudioMode,
      studioSettings,
      weatherState,
      weatherFlags,
    });
    latestRef.current = {
      onZoneChange,
      onPlayerMove,
      onPlayerMoveIntent,
      onMapChange,
      onInteract,
      onEditTransaction,
      onSelectionChange,
      onCursorMove,
      onZoomChange,
      isControlsEnabled,
      speedBoostActive,
      isStudioMode,
      studioSettings,
      weatherState,
      weatherFlags,
    };

    useImperativeHandle(ref, () => ({
      loadMapData: (data, spawnX, spawnY) => {
        sceneRef.current?.loadMapData(data, spawnX, spawnY);
      },
      switchMapWithTransition: (data, spawnX, spawnY) => {
        sceneRef.current?.switchMapWithTransition(data, spawnX, spawnY);
      },
      showSpeechBubble: (senderId, text, durationMs) => {
        sceneRef.current?.showSpeechBubble(senderId, text, durationMs);
      },
      showReactionBubble: (senderId, emoji, durationMs) => {
        sceneRef.current?.showReactionBubble(senderId, emoji, durationMs);
      },
      setControlsEnabled: (enabled) => {
        sceneRef.current?.setControlsEnabled(enabled);
      },
      syncRemoteSnapshot: (players) => {
        sceneRef.current?.syncRemoteSnapshot(players);
      },
      handleRemotePlayerJoined: (player) => {
        sceneRef.current?.handleRemotePlayerJoined(player);
      },
      handleRemotePlayerLeft: (userId) => {
        sceneRef.current?.handleRemotePlayerLeft(userId);
      },
      handleRemotePlayerStates: (states) => {
        sceneRef.current?.handleRemotePlayerStates(states);
      },
      handleServerCorrection: (correctX, correctY) => {
        sceneRef.current?.handleServerCorrection(correctX, correctY);
      },
      updateLocalPlayerProfile: (profile) => {
        sceneRef.current?.updateLocalPlayerProfile(profile);
      },
      applyExternalCommands: (commands) => {
        sceneRef.current?.applyExternalCommands(commands);
      },
      refreshFromCommands: (commands) => {
        sceneRef.current?.refreshFromCommands(commands);
      },
      recenterCamera: () => {
        sceneRef.current?.recenterCamera();
      },
      getPlayerPosition: () => sceneRef.current?.getPlayerPosition() ?? { x: 0, y: 0 },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const callbacks: SceneCallbacks = {
        onZoneChange: (zone) => latestRef.current.onZoneChange(zone),
        onPlayerMove: (pos) => latestRef.current.onPlayerMove(pos),
        onPlayerMoveIntent: (intent) => latestRef.current.onPlayerMoveIntent?.(intent),
        onMapChange: (mapId, name) => latestRef.current.onMapChange(mapId, name),
        onInteract: (zone) => latestRef.current.onInteract(zone),
        onEditTransaction: (commands) => latestRef.current.onEditTransaction?.(commands),
        onSelectionChange: (selection) => latestRef.current.onSelectionChange?.(selection),
        onCursorMove: (x, y, inside) => latestRef.current.onCursorMove?.(x, y, inside),
        onZoomChange: (zoom) => latestRef.current.onZoomChange?.(zoom),
        onSceneReady: () => {
          isSceneReadyRef.current = true;
          if (sceneRef.current) {
            sceneRef.current.setControlsEnabled(
              latestRef.current.isControlsEnabled && !latestRef.current.isStudioMode
            );
            sceneRef.current.setSpeedBoost(latestRef.current.speedBoostActive);
            sceneRef.current.setStudioMode(latestRef.current.isStudioMode, latestRef.current.studioSettings);
            sceneRef.current.setWeather(
              latestRef.current.weatherState ?? null,
              latestRef.current.weatherFlags
            );
          }
        },
      };

      const scene = new OfficeScene(playerProfile, mockUsers, initialMapData, callbacks);
      sceneRef.current = scene;

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: containerRef.current.clientWidth || 960,
        height: containerRef.current.clientHeight || 640,
        pixelArt: true,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
        scene: [scene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        backgroundColor: '#090d16',
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      return () => {
        isSceneReadyRef.current = false;
        game.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      };
      // The game instance intentionally lives for the component's lifetime.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.updatePlayerAvatar(avatarConfig);
      }
    }, [avatarConfig]);

    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.updateLocalPlayerProfile(playerProfile);
      }
    }, [playerProfile]);

    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setSpeedBoost(speedBoostActive);
      }
    }, [speedBoostActive]);

    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setControlsEnabled(isControlsEnabled && !isStudioMode);
      }
    }, [isControlsEnabled, isStudioMode]);

    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setStudioMode(isStudioMode, studioSettings);
      }
    }, [isStudioMode, studioSettings]);

    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setWeather(weatherState ?? null, weatherFlags);
      }
    }, [weatherState, weatherFlags]);

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden select-none bg-rpg-ink"
        style={{ imageRendering: 'pixelated' }}
      />
    );
  }
);

OfficeCanvas.displayName = 'OfficeCanvas';
