/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InteractionZone } from '../types/game';
import { X, Video, Coffee, MessageCircle, Layout, ShieldAlert, Zap, Plus, ExternalLink } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface InteractionModalProps {
  zone: InteractionZone | null;
  onClose: () => void;
  onActivateSpeedBoost: () => void;
}

interface WhiteboardSticky {
  id: string;
  column: 'todo' | 'progress' | 'done';
  text: string;
  color: string;
}

export const InteractionModal: React.FC<InteractionModalProps> = ({
  zone,
  onClose,
  onActivateSpeedBoost,
}) => {
  const [stickies, setStickies] = useState<WhiteboardSticky[]>([
    { id: '1', column: 'todo', text: 'Firebase Auth & Custom Claims (M2)', color: 'bg-amber-500/20 text-amber-200 border-amber-500/30' },
    { id: '2', column: 'progress', text: 'Real-time avatar synchronization (M3)', color: 'bg-blue-500/20 text-blue-200 border-blue-500/30' },
    { id: '3', column: 'done', text: 'Pixel art office tile grid & 4-way movement (M1)', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' },
    { id: '4', column: 'done', text: 'Collision detection & Multi-room transitions (M1)', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' },
  ]);
  const [newStickyText, setNewStickyText] = useState('');
  const [newStickyCol, setNewStickyCol] = useState<'todo' | 'progress' | 'done'>('todo');
  const [espressoBrewed, setEspressoBrewed] = useState(false);
  const [watercoolerVote, setWatercoolerVote] = useState<string | null>(null);

  if (!zone) return null;

  const handleAddSticky = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStickyText.trim()) return;
    const colors = {
      todo: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
      progress: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
      done: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
    };
    setStickies([
      ...stickies,
      {
        id: Date.now().toString(),
        column: newStickyCol,
        text: newStickyText.trim(),
        color: colors[newStickyCol],
      },
    ]);
    setNewStickyText('');
    sounds.playInteract();
  };

  const handleBrewCoffee = () => {
    sounds.playCoffeeBrew();
    setEspressoBrewed(true);
    onActivateSpeedBoost();
    setTimeout(() => setEspressoBrewed(false), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="rpg-window w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rpg-window-title p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {zone.type === 'meeting_room' && <Video className="w-5 h-5 text-rpg-gold" />}
            {zone.type === 'coffee' && <Coffee className="w-5 h-5 text-rpg-gold" />}
            {zone.type === 'watercooler' && <MessageCircle className="w-5 h-5 text-rpg-title" />}
            {zone.type === 'whiteboard' && <Layout className="w-5 h-5 text-rpg-title" />}
            {zone.type === 'desk' && <Zap className="w-5 h-5 text-rpg-green" />}
            {zone.type === 'phone_booth' && <ShieldAlert className="w-5 h-5 text-rpg-red" />}
            <div>
              <h3 className="pixel-title text-[10px]">{zone.name}</h3>
              <p className="text-xs text-rpg-dim">{zone.description || 'Interactive Zone'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rpg-btn rpg-btn-danger p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* 1. MEETING ROOM (Google Meet Integration) */}
          {zone.type === 'meeting_room' && (
            <div className="space-y-4">
              <div className="rpg-inset p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-rpg-gold">
                  <span className="font-semibold uppercase tracking-wider">Spatial Audio Zone Active</span>
                  <span className="rpg-chip rpg-chip-green px-2 py-0.5 font-mono text-[10px]">
                    Available
                  </span>
                </div>
                <p className="text-xs text-rpg-text leading-relaxed">
                  Stepping into this meeting area connects you to your colleagues. Launch Google Meet to begin audio/video conferencing with screen sharing.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-rpg-text">Assigned Meeting Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={zone.meetUrl || 'https://meet.google.com/new'}
                    className="rpg-input flex-1 px-3 py-2 text-xs font-mono select-all"
                  />
                  <a
                    href={zone.meetUrl || 'https://meet.google.com/new'}
                    target="_blank"
                    rel="noreferrer"
                    className="rpg-btn rpg-btn-gold px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Join Meeting
                  </a>
                </div>
              </div>

              <div className="rpg-inset text-xs text-rpg-dim p-3">
                <p className="font-medium text-rpg-text mb-1">Upcoming REST API Support (Milestone 5):</p>
                <p className="text-[11px] leading-relaxed">
                  Google Workspace OAuth integration will enable automatic Google Calendar event syncing and instant authenticated space provisioning without leaving the virtual office.
                </p>
              </div>
            </div>
          )}

          {/* 2. ESPRESSO & COFFEE MACHINE */}
          {zone.type === 'coffee' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-rpg-gold">
                <Coffee className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rpg-text">Barista Craft Espresso</h4>
                <p className="text-xs text-rpg-dim max-w-sm mx-auto">
                  Brew a double shot of Ethiopian roast. Increases your avatar's sprint speed by 40% for 45 seconds!
                </p>
              </div>
              <button
                onClick={handleBrewCoffee}
                disabled={espressoBrewed}
                className={`rpg-btn px-5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  espressoBrewed
                    ? 'rpg-btn-plain'
                    : 'rpg-btn-gold active:scale-95'
                }`}
              >
                {espressoBrewed ? 'Espresso Brewed! Speed Buff Active (+40%)' : 'Brew Double Espresso ☕'}
              </button>
            </div>
          )}

          {/* 3. WATER COOLER CHAT & ICEBREAKER */}
          {zone.type === 'watercooler' && (
            <div className="space-y-4">
              <div className="rpg-inset p-3.5">
                <p className="text-xs font-semibold text-rpg-title mb-1">Today’s Question of the Day</p>
                <p className="text-sm text-rpg-text font-medium">
                  "What is your favorite retro RPG mechanic or game world you wish existed in real offices?"
                </p>
              </div>
              <div className="space-y-2">
                {[
                  'Instant warp doors to skip office stairwells',
                  'Inns where a 5-second sleep fully restores HP & energy',
                  'Inventory bag with unlimited capacity for office snacks',
                  'Level-up fanfares when completing pull requests',
                ].map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setWatercoolerVote(option);
                      sounds.playInteract();
                    }}
                    className={`rpg-btn w-full text-left p-3 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      watercoolerVote === option
                        ? 'rpg-btn-gold font-medium'
                        : 'rpg-btn-plain'
                    }`}
                  >
                    <span>{option}</span>
                    {watercoolerVote === option && (
                      <span className="text-[10px] font-bold">Voted ✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. AGILE KANBAN WHITEBOARD */}
          {zone.type === 'whiteboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(['todo', 'progress', 'done'] as const).map((col) => {
                  const titles = { todo: 'To Do', progress: 'In Progress', done: 'Completed' };
                  const colItems = stickies.filter((s) => s.column === col);
                  return (
                    <div key={col} className="rpg-inset p-2.5 flex flex-col gap-2 min-h-36">
                      <div className="text-[11px] font-bold text-rpg-dim uppercase tracking-wider flex items-center justify-between">
                        <span>{titles[col]}</span>
                        <span className="font-mono text-[10px]">{colItems.length}</span>
                      </div>
                      <div className="space-y-1.5 flex-1">
                        {colItems.map((item) => (
                          <div
                            key={item.id}
                            className={`p-2 rounded border text-[11px] leading-tight ${item.color}`}
                          >
                            {item.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleAddSticky} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add note to board..."
                  value={newStickyText}
                  onChange={(e) => setNewStickyText(e.target.value)}
                  className="rpg-input flex-1 px-3 py-1.5 text-xs"
                />
                <select
                  value={newStickyCol}
                  onChange={(e) => setNewStickyCol(e.target.value as 'todo' | 'progress' | 'done')}
                  className="rpg-input px-2 py-1.5 text-xs"
                >
                  <option value="todo">To Do</option>
                  <option value="progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
                <button
                  type="submit"
                  className="rpg-btn rpg-btn-gold px-3 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </form>
            </div>
          )}

          {/* 5. FOCUS POD */}
          {zone.type === 'phone_booth' && (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rpg-red">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-rpg-text">Focus Pod Alpha (Do Not Disturb)</h4>
              <p className="text-xs text-rpg-dim max-w-sm mx-auto">
                Acoustic isolation booth. While inside this booth, other users see you in "Focus / Deep Work" mode with notifications muted.
              </p>
              <div className="pt-2">
                <span className="rpg-chip rpg-chip-red px-3 py-1 text-xs">
                  Focus Shield: ACTIVE
                </span>
              </div>
            </div>
          )}

          {/* 6. DESK / WORKSTATION */}
          {zone.type === 'desk' && (
            <div className="rpg-inset p-3 space-y-2">
              <p className="text-xs text-rpg-text leading-relaxed">{zone.description}</p>
              <div className="flex items-center gap-2 pt-2 border-t-2 border-rpg-line text-[11px] text-rpg-dim">
                <span>Workstation Specs: Quad-core ARM · Dual 4K Displays · Ergonomic Mesh Chair</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t-2 border-rpg-line flex justify-end">
          <button
            onClick={onClose}
            className="rpg-btn rpg-btn-plain px-4 py-1.5 text-xs font-semibold cursor-pointer"
          >
            Close [Esc]
          </button>
        </div>
      </div>
    </div>
  );
};
