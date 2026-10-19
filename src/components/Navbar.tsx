/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Volume2,
  VolumeX,
  Sparkles,
  MapPin,
  Wrench,
  LogIn,
  LogOut,
  CloudSun,
  Shield,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { sounds } from '../game/soundEffects';
import { useAuth } from '../context/AuthContext';
import { CurrentWeatherState } from '../services/HQWeatherService';
import { ConnectionState } from '../multiplayer/client';

interface NavbarProps {
  currentMapId: string;
  onSelectMap: (mapId: string) => void;
  onOpenAvatarModal: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onlineCount: number;
  isEditorOpen: boolean;
  onToggleEditor: () => void;
  onOpenLoginModal: () => void;
  onOpenWeatherModal: () => void;
  currentWeather: CurrentWeatherState | null;
  connectionState?: ConnectionState;
  pingMs?: number;
  isDirectoryOpen?: boolean;
  onToggleDirectory?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentMapId,
  onSelectMap,
  onOpenAvatarModal,
  isMuted,
  onToggleMute,
  onlineCount,
  isEditorOpen,
  onToggleEditor,
  onOpenLoginModal,
  onOpenWeatherModal,
  currentWeather,
  connectionState = 'connected',
  pingMs = 0,
  isDirectoryOpen = true,
  onToggleDirectory,
}) => {
  const { user, profile, isAdmin, signOut } = useAuth();

  const floors = [
    { id: 'main_office', label: 'Main Workspace' },
    { id: 'boardroom_wing', label: 'Boardroom Wing' },
    { id: 'rooftop_garden', label: 'Rooftop Terrace' },
  ];

  return (
    <header className="rpg-bar flex items-center justify-between gap-8 px-6 py-3 z-30 select-none">
      {/* Zone 1: Wordmark & Live Weather Pill */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="pixel-title text-[10px] whitespace-nowrap shrink-0 flex items-center gap-2">
          <span className="w-6 h-6 rpg-chip rpg-chip-gold !text-[11px] flex items-center justify-center">
            G
          </span>
          GatherGrid
        </a>

        {/* Live Weather Indicator Pill */}
        <button
          onClick={onOpenWeatherModal}
          className="rpg-btn rpg-btn-plain rpg-btn-round hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs"
          title="Click to view HQ Weather Simulation"
        >
          <CloudSun className="w-3.5 h-3.5 text-rpg-gold shrink-0" />
          <span className="truncate max-w-44">
            {currentWeather
              ? `Manila: ${currentWeather.temperatureC}°C · ${currentWeather.conditionDescription}`
              : 'Manila HQ: Tropical Climate'}
          </span>
        </button>

        {/* Live Multiplayer Connection Status */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          <span aria-hidden="true" className="text-rpg-dim opacity-60">·</span>
          <div className="rpg-inset flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px]">
            {connectionState === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
                <span className="text-rpg-green font-medium">{onlineCount} Online</span>
                {pingMs > 0 && <span className="text-rpg-dim text-[10px]">({pingMs}ms)</span>}
              </>
            )}
            {connectionState === 'connecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                <span className="text-rpg-title">Connecting...</span>
              </>
            )}
            {connectionState === 'reconnecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
                <span className="text-rpg-gold font-medium">Reconnecting...</span>
              </>
            )}
            {(connectionState === 'disconnected' || connectionState === 'failed') && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-rpg-dim">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2: Floor Navigation Links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-rpg-dim">
        {floors.map((floor) => {
          const isActive = currentMapId === floor.id;
          return (
            <button
              key={floor.id}
              onClick={() => {
                sounds.playInteract();
                onSelectMap(floor.id);
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer py-1 ${
                isActive ? 'text-rpg-gold border-b-2 border-rpg-gold font-semibold' : 'text-rpg-dim'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 opacity-70" />
              {floor.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Action & Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Colleagues Directory Toggle (world mode; hidden while Studio is open) */}
        {!isEditorOpen && onToggleDirectory && (
          <button
            onClick={onToggleDirectory}
            aria-expanded={isDirectoryOpen}
            aria-controls="colleagues-directory"
            title={isDirectoryOpen ? 'Collapse Colleagues Directory' : 'Expand Colleagues Directory'}
            className={`rpg-btn relative p-2 cursor-pointer ${isDirectoryOpen ? 'rpg-btn-gold' : 'rpg-btn-plain'}`}
          >
            <Users className="w-4 h-4" />
            <span className="rpg-chip rpg-chip-gold absolute -top-1.5 -right-1.5 !min-w-4 h-4 px-1 rounded-full flex items-center justify-center tabular-nums">
              {onlineCount}
            </span>
          </button>
        )}

        {/* Audio Mute */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          className="rpg-btn rpg-btn-plain p-2 cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Admin Map Editor Button (Authorized Admins Only) */}
        {isAdmin && (
          <button
            onClick={() => {
              sounds.playInteract();
              onToggleEditor();
            }}
            className={`rpg-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              isEditorOpen ? 'rpg-btn-gold font-bold' : 'rpg-btn-plain'
            }`}
            title="Open the map Studio (World/Studio modes)"
          >
            <Wrench className={`w-3.5 h-3.5 ${isEditorOpen ? '' : 'text-rpg-gold'}`} />
            <span>{isEditorOpen ? 'Exit Studio' : 'Studio'}</span>
          </button>
        )}

        {/* Avatar Customizer */}
        <button
          onClick={() => {
            sounds.playInteract();
            onOpenAvatarModal();
          }}
          className="rpg-btn rpg-btn-gold px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Avatar</span>
        </button>

        {/* Authentication Account State */}
        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l-2 border-rpg-line">
            <div className="flex items-center gap-1.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 rounded-full border-2 border-rpg-edge object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full border-2 border-rpg-edge flex items-center justify-center font-bold text-xs text-white shadow-inner"
                  style={{ backgroundColor: profile?.avatarConfig?.shirtColor || '#2563eb' }}
                >
                  {(profile?.name || user.displayName || 'U').charAt(0)}
                </div>
              )}
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-[11px] font-semibold text-rpg-text leading-tight truncate max-w-24">
                  {profile?.name || user.displayName}
                </span>
                <span className="text-[10px] font-mono text-rpg-dim flex items-center gap-0.5">
                  {isAdmin ? (
                    <span className="text-rpg-gold font-bold flex items-center gap-0.5">
                      <Shield className="w-2.5 h-2.5" /> ADMIN
                    </span>
                  ) : (
                    <span>EMPLOYEE</span>
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                sounds.playInteract();
                signOut();
              }}
              className="rpg-btn rpg-btn-plain p-1.5 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              sounds.playInteract();
              onOpenLoginModal();
            }}
            className="rpg-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
