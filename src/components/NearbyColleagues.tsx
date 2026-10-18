/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UserProfile } from '../types/game';
import { Users, Video, MessageSquare, Compass } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface NearbyColleaguesProps {
  colleagues: UserProfile[];
  currentMapId: string;
  playerTileX: number;
  playerTileY: number;
  onTeleportTo: (user: UserProfile) => void;
  onDirectMessage: (user: UserProfile) => void;
}

export const NearbyColleagues: React.FC<NearbyColleaguesProps> = ({
  colleagues,
  currentMapId,
  playerTileX,
  playerTileY,
  onTeleportTo,
  onDirectMessage,
}) => {
  const getStatusBadge = (status: UserProfile['status']) => {
    switch (status) {
      case 'online':
        return { label: 'Online', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'in_meeting':
        return { label: 'In Meeting', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'busy':
        return { label: 'Focusing', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 'coffee_break':
        return { label: 'Coffee Break', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      default:
        return { label: 'Away', bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
    }
  };

  const getMapName = (mapId: string) => {
    if (mapId === 'main_office') return 'Floor 1: Main Workspace';
    if (mapId === 'boardroom_wing') return 'Floor 2: Boardroom';
    if (mapId === 'rooftop_garden') return 'Terrace: Rooftop Garden';
    return 'Office Area';
  };

  return (
    <aside className="w-80 bg-slate-900/95 border-l border-slate-800 flex flex-col h-full z-20 select-none overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white tracking-wide">Colleagues Directory</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono tabular-nums">{colleagues.length} online</span>
      </div>

      {/* Directory List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {colleagues.map((user) => {
          const isSameRoom = user.currentMapId === currentMapId;
          const distance = isSameRoom
            ? Math.round(Math.hypot(playerTileX - user.x, playerTileY - user.y))
            : null;
          const status = getStatusBadge(user.status);

          return (
            <div
              key={user.id}
              className="p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 transition-colors flex flex-col gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar Mini Icon */}
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-inner"
                    style={{ backgroundColor: user.avatarConfig.shirtColor || '#2563eb' }}
                  >
                    {user.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user.title}</p>
                  </div>
                </div>

                {/* Status indicator */}
                <span className={`text-[10px] px-2 py-0.5 rounded border font-medium whitespace-nowrap ${status.bg}`}>
                  {status.label}
                </span>
              </div>

              {/* Location & Distance Metadata */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/40">
                <span className="truncate">{getMapName(user.currentMapId)}</span>
                {distance !== null && (
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-2">
                    {distance === 0 ? 'Adjacent' : `${distance}m away`}
                  </span>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => {
                    sounds.playInteract();
                    onTeleportTo(user);
                  }}
                  className="flex-1 py-1.5 px-2 text-[11px] font-medium bg-slate-700/70 hover:bg-slate-700 text-slate-200 hover:text-white rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Walk or teleport to colleague"
                >
                  <Compass className="w-3 h-3 text-indigo-400" />
                  Locate
                </button>
                <button
                  onClick={() => {
                    sounds.playInteract();
                    onDirectMessage(user);
                  }}
                  className="py-1.5 px-2.5 text-[11px] font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Direct Message"
                >
                  <MessageSquare className="w-3 h-3" />
                  Chat
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Google Meet Card in Sidebar */}
      <div className="p-3.5 bg-slate-950/60 border-t border-slate-800 text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-medium text-slate-300 flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-emerald-400" />
            Quick Standup
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Google Meet</span>
        </div>
        <p className="text-[11px] text-slate-400 mb-2.5 leading-relaxed">
          Open a zero-friction video bridge or step into the Executive Boardroom.
        </p>
        <a
          href="https://meet.google.com/new"
          target="_blank"
          rel="noreferrer"
          className="w-full py-1.5 px-3 bg-emerald-600/90 hover:bg-emerald-600 text-white font-medium rounded text-center block transition-colors shadow-sm"
        >
          Launch Instant Meet
        </a>
      </div>
    </aside>
  );
};
