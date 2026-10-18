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
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            {zone.type === 'meeting_room' && <Video className="w-5 h-5 text-indigo-400" />}
            {zone.type === 'coffee' && <Coffee className="w-5 h-5 text-amber-400" />}
            {zone.type === 'watercooler' && <MessageCircle className="w-5 h-5 text-cyan-400" />}
            {zone.type === 'whiteboard' && <Layout className="w-5 h-5 text-purple-400" />}
            {zone.type === 'desk' && <Zap className="w-5 h-5 text-emerald-400" />}
            {zone.type === 'phone_booth' && <ShieldAlert className="w-5 h-5 text-rose-400" />}
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">{zone.name}</h3>
              <p className="text-xs text-slate-400">{zone.description || 'Interactive Zone'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* 1. MEETING ROOM (Google Meet Integration) */}
          {zone.type === 'meeting_room' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-indigo-950/30 border border-indigo-800/40 space-y-2">
                <div className="flex items-center justify-between text-xs text-indigo-300">
                  <span className="font-semibold uppercase tracking-wider">Spatial Audio Zone Active</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px]">
                    Available
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Stepping into this meeting area connects you to your colleagues. Launch Google Meet to begin audio/video conferencing with screen sharing.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Assigned Meeting Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={zone.meetUrl || 'https://meet.google.com/new'}
                    className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-300 font-mono select-all"
                  />
                  <a
                    href={zone.meetUrl || 'https://meet.google.com/new'}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Join Meeting
                  </a>
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                <p className="font-medium text-slate-300 mb-1">Upcoming REST API Support (Milestone 5):</p>
                <p className="text-[11px] leading-relaxed">
                  Google Workspace OAuth integration will enable automatic Google Calendar event syncing and instant authenticated space provisioning without leaving the virtual office.
                </p>
              </div>
            </div>
          )}

          {/* 2. ESPRESSO & COFFEE MACHINE */}
          {zone.type === 'coffee' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Coffee className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Barista Craft Espresso</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Brew a double shot of Ethiopian roast. Increases your avatar's sprint speed by 40% for 45 seconds!
                </p>
              </div>
              <button
                onClick={handleBrewCoffee}
                disabled={espressoBrewed}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white transition-all shadow-md cursor-pointer ${
                  espressoBrewed
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 active:scale-95'
                }`}
              >
                {espressoBrewed ? 'Espresso Brewed! Speed Buff Active (+40%)' : 'Brew Double Espresso ☕'}
              </button>
            </div>
          )}

          {/* 3. WATER COOLER CHAT & ICEBREAKER */}
          {zone.type === 'watercooler' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40">
                <p className="text-xs font-semibold text-cyan-300 mb-1">Today’s Question of the Day</p>
                <p className="text-sm text-white font-medium">
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
                    className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      watercoolerVote === option
                        ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium'
                        : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{option}</span>
                    {watercoolerVote === option && (
                      <span className="text-[10px] text-indigo-400 font-bold">Voted ✓</span>
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
                    <div key={col} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col gap-2 min-h-36">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
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
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={newStickyCol}
                  onChange={(e) => setNewStickyCol(e.target.value as 'todo' | 'progress' | 'done')}
                  className="px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                >
                  <option value="todo">To Do</option>
                  <option value="progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
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
              <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-white">Focus Pod Alpha (Do Not Disturb)</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Acoustic isolation booth. While inside this booth, other users see you in "Focus / Deep Work" mode with notifications muted.
              </p>
              <div className="pt-2">
                <span className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30">
                  Focus Shield: ACTIVE
                </span>
              </div>
            </div>
          )}

          {/* 6. DESK / WORKSTATION */}
          {zone.type === 'desk' && (
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800 space-y-2">
              <p className="text-xs text-slate-300 leading-relaxed">{zone.description}</p>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                <span>Workstation Specs: Quad-core ARM · Dual 4K Displays · Ergonomic Mesh Chair</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Close [Esc]
          </button>
        </div>
      </div>
    </div>
  );
};
