/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import Phaser from 'phaser';
import { OfficeScene, SceneCallbacks } from '../game/OfficeScene';
import {
  UserProfile,
  InteractionZone,
  AvatarConfig,
  OfficeMapData,
  EditorSettings,
  Direction,
} from '../types/game';
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
  onMapModified?: (newMapData: OfficeMapData) => void;
  avatarConfig: AvatarConfig;
  speedBoostActive: boolean;
  isControlsEnabled: boolean;
  isEditorMode: boolean;
  editorSettings: EditorSettings;
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
      onMapModified,
      avatarConfig,
      speedBoostActive,
      isControlsEnabled,
      isEditorMode,
      editorSettings,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<OfficeScene | null>(null);

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
    }));

    const isSceneReadyRef = useRef(false);

    useEffect(() => {
      if (!containerRef.current) return;

      const callbacks: SceneCallbacks = {
        onZoneChange,
        onPlayerMove,
        onPlayerMoveIntent,
        onMapChange,
        onInteract,
        onMapModified,
        onSceneReady: () => {
          isSceneReadyRef.current = true;
          if (sceneRef.current) {
            sceneRef.current.setControlsEnabled(isControlsEnabled);
            sceneRef.current.setSpeedBoost(speedBoostActive);
            sceneRef.current.setEditorMode(isEditorMode, editorSettings);
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
    }, []);

    // Sync avatar updates
    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.updatePlayerAvatar(avatarConfig);
      }
    }, [avatarConfig]);

    // Sync player profile (including name or ID changes)
    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.updateLocalPlayerProfile(playerProfile);
      }
    }, [playerProfile]);

    // Sync speed boost
    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setSpeedBoost(speedBoostActive);
      }
    }, [speedBoostActive]);

    // Sync controls enabled (e.g. typing in chat/editor)
    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setControlsEnabled(isControlsEnabled);
      }
    }, [isControlsEnabled]);

    // Sync editor mode & settings
    useEffect(() => {
      if (sceneRef.current && isSceneReadyRef.current) {
        sceneRef.current.setEditorMode(isEditorMode, editorSettings);
      }
    }, [isEditorMode, editorSettings]);

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden select-none cursor-crosshair bg-slate-950"
        style={{ imageRendering: 'pixelated' }}
      />
    );
  }
);

OfficeCanvas.displayName = 'OfficeCanvas';
