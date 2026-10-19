/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UserProfile } from '../types/game';
import { Users, Video, MessageSquare, Compass, PanelRightClose } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface NearbyColleaguesProps {
  colleagues: UserProfile[];
  currentMapId: string;
  playerTileX: number;
  playerTileY: number;
  onTeleportTo: (user: UserProfile) => void;
  onDirectMessage: (user: UserProfile) => void;
  onCollapse: () => void;
}

export const NearbyColleagues: React.FC<NearbyColleaguesProps> = ({
  colleagues,
  currentMapId,
  playerTileX,
  playerTileY,
  onTeleportTo,
  onDirectMessage,
  onCollapse,
}) => {
  const getStatusBadge = (status: UserProfile['status']) => {
    switch (status) {
      case 'online':
        return { label: 'Online', bg: 'rpg-chip rpg-chip-green' };
      case 'in_meeting':
        return { label: 'In Meeting', bg: 'rpg-chip rpg-chip-gold' };
      case 'busy':
        return { label: 'Focusing', bg: 'rpg-chip rpg-chip-red' };
      case 'coffee_break':
        return { label: 'Coffee Break', bg: 'rpg-chip rpg-chip-gold' };
      default:
        return { label: 'Away', bg: 'rpg-chip' };
    }
  };

  const getMapName = (mapId: string) => {
    if (mapId === 'main_office') return 'Floor 1: Main Workspace';
    if (mapId === 'boardroom_wing') return 'Floor 2: Boardroom';
    if (mapId === 'rooftop_garden') return 'Terrace: Rooftop Garden';
    return 'Office Area';
  };

  return (
    <aside className="w-80 rpg-window flex flex-col h-full z-20 select-none overflow-hidden">
      {/* Header */}
      <div className="p-4 rpg-window-title flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-rpg-gold" />
          <h2 className="pixel-title text-[10px]">Colleagues Directory</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-rpg-dim font-mono tabular-nums">{colleagues.length} online</span>
          <button
            onClick={onCollapse}
            title="Collapse Colleagues Directory"
            aria-label="Collapse Colleagues Directory"
            className="rpg-btn rpg-btn-plain p-1.5 cursor-pointer"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
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
              className="p-3 rpg-inset transition-colors flex flex-col gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar Mini Icon */}
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs text-rpg-text shrink-0 shadow-inner"
                    style={{ backgroundColor: user.avatarConfig.shirtColor || '#2563eb' }}
                  >
                    {user.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-rpg-text truncate">{user.name}</p>
                    <p className="text-[11px] text-rpg-dim truncate">{user.title}</p>
                  </div>
                </div>

                {/* Status indicator */}
                <span className={`text-[10px] px-2 py-0.5 font-medium whitespace-nowrap ${status.bg}`}>
                  {status.label}
                </span>
              </div>

              {/* Location & Distance Metadata */}
              <div className="flex items-center justify-between text-[11px] text-rpg-dim pt-1 border-t border-rpg-line">
                <span className="truncate">{getMapName(user.currentMapId)}</span>
                {distance !== null && (
                  <span className="font-mono text-[10px] text-rpg-dim tabular-nums shrink-0 ml-2">
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
                  className="rpg-btn rpg-btn-plain flex-1 py-1.5 px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Walk or teleport to colleague"
                >
                  <Compass className="w-3 h-3 text-rpg-gold" />
                  Locate
                </button>
                <button
                  onClick={() => {
                    sounds.playInteract();
                    onDirectMessage(user);
                  }}
                  className="rpg-btn rpg-btn-plain py-1.5 px-2.5 text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer"
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
      <div className="p-3.5 border-t border-rpg-line text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-medium text-rpg-text flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-rpg-green" />
            Quick Standup
          </span>
          <span className="text-[10px] text-rpg-dim font-mono">Google Meet</span>
        </div>
        <p className="text-[11px] text-rpg-dim mb-2.5 leading-relaxed">
          Open a zero-friction video bridge or step into the Executive Boardroom.
        </p>
        <a
          href="https://meet.google.com/new"
          target="_blank"
          rel="noreferrer"
          className="rpg-btn rpg-btn-gold w-full py-1.5 px-3 font-medium text-center block cursor-pointer"
        >
          Launch Instant Meet
        </a>
      </div>
    </aside>
  );
};
