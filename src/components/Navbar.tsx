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
}) => {
  const { user, profile, isAdmin, signOut } = useAuth();

  const floors = [
    { id: 'main_office', label: 'Main Workspace' },
    { id: 'boardroom_wing', label: 'Boardroom Wing' },
    { id: 'rooftop_garden', label: 'Rooftop Terrace' },
  ];

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100 z-30 select-none">
      {/* Zone 1: Wordmark & Live Weather Pill */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-xs font-mono font-bold text-white shadow-sm">
            G
          </span>
          GatherGrid
        </a>

        {/* Live Weather Indicator Pill */}
        <button
          onClick={onOpenWeatherModal}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-xs transition-colors cursor-pointer"
          title="Click to view HQ Weather Simulation"
        >
          <CloudSun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate max-w-44">
            {currentWeather
              ? `Manila: ${currentWeather.temperatureC}°C · ${currentWeather.conditionDescription}`
              : 'Manila HQ: Tropical Climate'}
          </span>
        </button>

        {/* Live Multiplayer Connection Status */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          <span aria-hidden="true" className="text-slate-600">·</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 font-mono text-[11px]">
            {connectionState === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
                <span className="text-emerald-300 font-medium">{onlineCount} Online</span>
                {pingMs > 0 && <span className="text-slate-400 text-[10px]">({pingMs}ms)</span>}
              </>
            )}
            {connectionState === 'connecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                <span className="text-sky-300">Connecting...</span>
              </>
            )}
            {connectionState === 'reconnecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
                <span className="text-amber-300 font-medium">Reconnecting...</span>
              </>
            )}
            {(connectionState === 'disconnected' || connectionState === 'failed') && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-slate-400">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2: Floor Navigation Links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
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
                isActive ? 'text-white border-b-2 border-indigo-500 font-semibold' : 'text-slate-400'
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
        {/* Audio Mute */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
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
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm ${
              isEditorOpen
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
            }`}
            title="Open Admin Visual Map Editor"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{isEditorOpen ? 'Close Editor' : 'Map Editor'}</span>
          </button>
        )}

        {/* Avatar Customizer */}
        <button
          onClick={() => {
            sounds.playInteract();
            onOpenAvatarModal();
          }}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Avatar</span>
        </button>

        {/* Authentication Account State */}
        {user ? (
          <div className="flex items-center gap-2 pl-1 border-l border-slate-800">
            <div className="flex items-center gap-1.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 rounded-full border border-slate-700 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-inner"
                  style={{ backgroundColor: profile?.avatarConfig?.shirtColor || '#2563eb' }}
                >
                  {(profile?.name || user.displayName || 'U').charAt(0)}
                </div>
              )}
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-xs font-semibold text-white leading-tight truncate max-w-24">
                  {profile?.name || user.displayName}
                </span>
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-0.5">
                  {isAdmin ? (
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
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
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
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
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
