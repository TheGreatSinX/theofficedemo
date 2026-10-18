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
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xl">
              😊
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Google Emoji Reactions
                <span className="px-2 py-0.5 text-[10px] uppercase font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  Noto Emoji
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Click any emoji to react, or assign to quick hotkeys [1] to [5]
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Slots 1-5 Customizer Bar */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-400" /> Quick Hotkeys:
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
                    className={`group relative flex items-center gap-1 px-2.5 py-1 rounded-lg border text-sm font-medium transition-all ${
                      isSelectedForAssign
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-2 ring-amber-500/50 scale-105'
                        : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-200'
                    }`}
                    title={
                      isSelectedForAssign
                        ? `Click any emoji below to set Slot ${idx + 1}`
                        : `Key [${idx + 1}] — Click to reassign`
                    }
                  >
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-900/90 text-indigo-300 border border-slate-700">
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
              <span className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded-md animate-pulse">
                Click any emoji below to set slot {assigningSlot + 1}
              </span>
            )}
            <button
              onClick={() => {
                sounds.playInteract();
                onResetQuickSlots();
                setAssigningSlot(null);
              }}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
              title="Reset 1-5 slots to defaults"
            >
              <RotateCcw size={11} /> Reset Defaults
            </button>
          </div>
        </div>

        {/* Search Bar & Category Filter */}
        <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-900/60">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Google emojis (e.g. smile, coffee, fire, thumbs, rocket)..."
              className="w-full pl-10 pr-9 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
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
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'All'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/70'
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/70'
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Recently Used (if not searching) */}
          {!searchQuery && selectedCategory === 'All' && recentlyUsed.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                      className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-indigo-600/30 hover:border-indigo-500/50 border border-slate-700/60 text-2xl transition-transform hover:scale-115 active:scale-95"
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
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <span>{selectedCategory === 'All' ? 'All Google Emojis' : selectedCategory}</span>
              <span>{filteredEmojis.length} emojis</span>
            </div>

            {filteredEmojis.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-base font-semibold">No matching Google emojis found</p>
                <p className="text-xs text-slate-500 mt-1">Try another keyword like &quot;smile&quot;, &quot;thumbs&quot;, &quot;party&quot;, or &quot;fire&quot;.</p>
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {filteredEmojis.map((item, idx) => (
                  <button
                    key={`${item.emoji}-${idx}`}
                    type="button"
                    onClick={() => handleEmojiClick(item)}
                    className="group relative aspect-square flex items-center justify-center rounded-xl bg-slate-800/40 hover:bg-indigo-600/30 border border-slate-700/50 hover:border-indigo-500/60 text-2xl sm:text-3xl transition-all hover:scale-120 hover:z-10 active:scale-95 shadow-sm"
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
        <div className="px-5 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping" />
            <span>Multiplayer synchronized reactions in real-time</span>
          </div>
          <span className="text-[11px] text-slate-500">
            Tip: Press keyboard keys <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">1</kbd> to <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">5</kbd> anytime
          </span>
        </div>
      </div>
    </div>
  );
};
