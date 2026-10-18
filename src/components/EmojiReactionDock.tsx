/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Smile, Sparkles } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface EmojiReactionDockProps {
  quickSlots: string[];
  onTriggerReaction: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  activeReactionSlot: number | null;
}

export const EmojiReactionDock: React.FC<EmojiReactionDockProps> = ({
  quickSlots,
  onTriggerReaction,
  onOpenEmojiPicker,
  activeReactionSlot,
}) => {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const handleSlotClick = (emoji: string, index: number) => {
    sounds.playInteract();
    onTriggerReaction(emoji);
  };

  return (
    <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/90 hover:bg-slate-900 border border-slate-700/80 rounded-2xl shadow-xl backdrop-blur-md transition-all">
      {/* 5 Quick Reaction Hotkey Buttons */}
      <div className="flex items-center gap-1">
        {quickSlots.map((emoji, idx) => {
          const isActive = activeReactionSlot === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSlotClick(emoji, idx)}
              onMouseEnter={() => setHoveredSlot(idx)}
              onMouseLeave={() => setHoveredSlot(null)}
              className={`group relative w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-150 ${
                isActive
                  ? 'bg-indigo-600 border-indigo-400 scale-125 z-20 shadow-lg shadow-indigo-500/50'
                  : 'bg-slate-800/80 hover:bg-indigo-950/60 border-slate-700 hover:border-indigo-500/60 hover:scale-110 active:scale-95'
              }`}
              title={`Reaction [${idx + 1}] — Press ${idx + 1} or click`}
            >
              {/* Hotkey Number Badge */}
              <span className="absolute -top-1.5 -left-1 px-1 py-0.2 rounded-md bg-slate-950/90 text-indigo-300 border border-slate-700 font-mono text-[9px] font-bold leading-none shadow-sm pointer-events-none group-hover:border-indigo-400 group-hover:text-white transition-colors">
                {idx + 1}
              </span>

              {/* Emoji Display */}
              <span
                className={`text-xl transition-transform ${isActive ? 'scale-125 animate-bounce' : 'group-hover:scale-115'}`}
                style={{
                  fontFamily:
                    "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
                }}
              >
                {emoji}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-6 bg-slate-800 mx-0.5" />

      {/* Full Google Emoji Picker Trigger */}
      <button
        type="button"
        onClick={() => {
          sounds.playInteract();
          onOpenEmojiPicker();
        }}
        className="flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-slate-800/80 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/60 text-slate-200 hover:text-white transition-all hover:scale-105 active:scale-95 text-xs font-semibold"
        title="Open Full Google Emoji Picker (All Google Emojis)"
      >
        <Smile size={16} className="text-amber-400" />
        <span className="hidden sm:inline">Google Emojis</span>
      </button>
    </div>
  );
};
