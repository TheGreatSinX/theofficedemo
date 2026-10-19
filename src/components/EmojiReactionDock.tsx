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
    <div className="rpg-window flex items-center gap-1.5 p-1.5 transition-all">
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
              className={`rpg-btn group relative w-10 h-10 flex items-center justify-center transition-all duration-150 ${
                isActive
                  ? 'rpg-btn-gold scale-125 z-20'
                  : 'rpg-btn-plain hover:scale-110 active:scale-95'
              }`}
              title={`Reaction [${idx + 1}] — Press ${idx + 1} or click`}
            >
              {/* Hotkey Number Badge */}
              <span className="rpg-chip absolute -top-1.5 -left-1 px-1 py-0.2 text-[9px] leading-none pointer-events-none transition-colors">
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

      <div className="w-[1px] h-6 bg-rpg-ink mx-0.5" />

      {/* Full Google Emoji Picker Trigger */}
      <button
        type="button"
        onClick={() => {
          sounds.playInteract();
          onOpenEmojiPicker();
        }}
        className="rpg-btn rpg-btn-plain flex items-center gap-1.5 px-2.5 h-10 transition-all hover:scale-105 active:scale-95 text-xs font-semibold"
        title="Open Full Google Emoji Picker (All Google Emojis)"
      >
        <Smile size={16} className="text-rpg-gold" />
        <span className="hidden sm:inline">Google Emojis</span>
      </button>
    </div>
  );
};
