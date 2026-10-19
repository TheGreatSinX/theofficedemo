/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ALL_GOOGLE_EMOJIS,
  EMOJI_CATEGORIES,
  EmojiCategory,
  filterGoogleEmojis,
  GoogleEmoji,
} from '../data/googleEmojis';
import { Search, X, Sparkles, Check, RotateCcw } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface GoogleEmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  quickSlots: string[];
  onUpdateQuickSlot: (slotIndex: number, emoji: string) => void;
  onResetQuickSlots: () => void;
}

export const GoogleEmojiPickerModal: React.FC<GoogleEmojiPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  quickSlots,
  onUpdateQuickSlot,
  onResetQuickSlots,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<EmojiCategory | 'All'>('All');
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gathergrid_recent_emojis');
      return saved ? JSON.parse(saved) : ['👍', '❤️', '😂', '🎉', '🔥', '☕', '🚀', '✨'];
    } catch {
      return ['👍', '❤️', '😂', '🎉', '🔥', '☕', '🚀', '✨'];
    }
  });

  const filteredEmojis = useMemo(() => {
    return filterGoogleEmojis(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  const handleEmojiClick = (emojiObj: GoogleEmoji) => {
    sounds.playInteract();

    // If currently assigning to a quick slot (1-5)
    if (assigningSlot !== null) {
      onUpdateQuickSlot(assigningSlot, emojiObj.emoji);
      setAssigningSlot(null);
    }

    // Trigger reaction over avatar
    onSelectEmoji(emojiObj.emoji);

    // Save to recently used
    setRecentlyUsed((prev) => {
      const next = [emojiObj.emoji, ...prev.filter((e) => e !== emojiObj.emoji)].slice(0, 16);
      try {
        localStorage.setItem('gathergrid_recent_emojis', JSON.stringify(next));
      } catch {
        // Ignore quota
      }
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="rpg-window relative w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rpg-window-title flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rpg-inset w-9 h-9 flex items-center justify-center text-xl">
              😊
            </div>
            <div>
              <h2 className="pixel-title text-[10px] flex items-center gap-2">
                Google Emoji Reactions
                <span className="rpg-chip rpg-chip-gold px-2 py-0.5 text-[10px]">
                  Noto Emoji
                </span>
              </h2>
              <p className="text-xs text-rpg-dim">
                Click any emoji to react, or assign to quick hotkeys [1] to [5]
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rpg-btn rpg-btn-danger p-1.5"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Slots 1-5 Customizer Bar */}
        <div className="px-5 py-3 bg-rpg-ink border-b-2 border-rpg-line flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-rpg-text flex items-center gap-1.5">
              <Sparkles size={13} className="text-rpg-gold" /> Quick Hotkeys:
            </span>
            <div className="flex items-center gap-1.5">
              {quickSlots.map((emoji, idx) => {
                const isSelectedForAssign = assigningSlot === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      sounds.playInteract();
                      setAssigningSlot(isSelectedForAssign ? null : idx);
                    }}
                    className={`rpg-btn group relative flex items-center gap-1 px-2.5 py-1 text-sm font-medium transition-all ${
                      isSelectedForAssign
                        ? 'rpg-btn-gold scale-105'
                        : 'rpg-btn-plain'
                    }`}
                    title={
                      isSelectedForAssign
                        ? `Click any emoji below to set Slot ${idx + 1}`
                        : `Key [${idx + 1}] — Click to reassign`
                    }
                  >
                    <span className="rpg-chip text-[10px] font-mono px-1 py-0.2">
                      {idx + 1}
                    </span>
                    <span
                      className="text-base leading-none"
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
          </div>

          <div className="flex items-center gap-2">
            {assigningSlot !== null && (
              <span className="rpg-chip rpg-chip-gold text-[11px] px-2 py-0.5 animate-pulse">
                Click any emoji below to set slot {assigningSlot + 1}
              </span>
            )}
            <button
              onClick={() => {
                sounds.playInteract();
                onResetQuickSlots();
                setAssigningSlot(null);
              }}
              className="rpg-btn rpg-btn-plain flex items-center gap-1 text-[11px] px-2 py-1 transition-colors"
              title="Reset 1-5 slots to defaults"
            >
              <RotateCcw size={11} /> Reset Defaults
            </button>
          </div>
        </div>

        {/* Search Bar & Category Filter */}
        <div className="p-4 border-b-2 border-rpg-line space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rpg-dim" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Google emojis (e.g. smile, coffee, fire, thumbs, rocket)..."
              className="rpg-input w-full pl-10 pr-9 py-2 text-sm transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-rpg-dim hover:text-rpg-text"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <button
              onClick={() => {
                sounds.playInteract();
                setSelectedCategory('All');
              }}
              className={`rpg-tab px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'All'
                  ? 'rpg-tab-active'
                  : ''
              }`}
            >
              All ({ALL_GOOGLE_EMOJIS.length})
            </button>
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  sounds.playInteract();
                  setSelectedCategory(cat.id);
                }}
                className={`rpg-tab flex items-center gap-1.5 px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'rpg-tab-active'
                    : ''
                }`}
              >
                <span
                  style={{
                    fontFamily:
                      "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
                  }}
                >
                  {cat.icon}
                </span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Emoji Grid Area */}
        <div className="rpg-inset flex-1 overflow-y-auto p-4 space-y-4">
          {/* Recently Used (if not searching) */}
          {!searchQuery && selectedCategory === 'All' && recentlyUsed.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-rpg-dim mb-2">
                Recently Used
              </div>
              <div className="flex flex-wrap gap-2">
                {recentlyUsed.map((emoji, idx) => {
                  const match = ALL_GOOGLE_EMOJIS.find((e) => e.emoji === emoji) || {
                    emoji,
                    name: 'Emoji',
                    category: 'Smileys & Emotion',
                    keywords: [],
                  };
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleEmojiClick(match)}
                      className="w-11 h-11 flex items-center justify-center rounded-xl bg-rpg-inset hover:bg-rpg-gold/20 hover:border-rpg-edge border border-rpg-line text-2xl transition-transform hover:scale-115 active:scale-95"
                      title={match.name}
                      style={{
                        fontFamily:
                          "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grid of Results */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-rpg-dim mb-2">
              <span>{selectedCategory === 'All' ? 'All Google Emojis' : selectedCategory}</span>
              <span>{filteredEmojis.length} emojis</span>
            </div>

            {filteredEmojis.length === 0 ? (
              <div className="py-12 text-center text-rpg-dim">
                <p className="text-base font-semibold">No matching Google emojis found</p>
                <p className="text-xs text-rpg-dim mt-1">Try another keyword like &quot;smile&quot;, &quot;thumbs&quot;, &quot;party&quot;, or &quot;fire&quot;.</p>
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {filteredEmojis.map((item, idx) => (
                  <button
                    key={`${item.emoji}-${idx}`}
                    type="button"
                    onClick={() => handleEmojiClick(item)}
                    className="group relative aspect-square flex items-center justify-center rounded-xl bg-rpg-inset hover:bg-rpg-gold/20 border border-rpg-line hover:border-rpg-edge text-2xl sm:text-3xl transition-all hover:scale-120 hover:z-10 active:scale-95 shadow-sm"
                    title={`${item.name} (${item.emoji}) — Click to React`}
                    style={{
                      fontFamily:
                        "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
                    }}
                  >
                    <span>{item.emoji}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="px-5 py-2.5 bg-rpg-ink border-t-2 border-rpg-line flex items-center justify-between text-xs text-rpg-dim">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping" />
            <span>Multiplayer synchronized reactions in real-time</span>
          </div>
          <span className="text-[11px] text-rpg-dim">
            Tip: Press keyboard keys <kbd className="rpg-chip px-1 py-0.5 font-mono">1</kbd> to <kbd className="rpg-chip px-1 py-0.5 font-mono">5</kbd> anytime
          </span>
        </div>
      </div>
    </div>
  );
};
