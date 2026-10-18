/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Zap } from 'lucide-react';

interface ControlsOverlayProps {
  speedBoostTimeLeft: number;
  currentMapName: string;
}

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({
  speedBoostTimeLeft,
  currentMapName,
}) => {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-none select-none">
      {/* Speed Boost Active Indicator */}
      {speedBoostTimeLeft > 0 && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur animate-pulse">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Espresso Sprint Buff: {speedBoostTimeLeft}s (+40%)</span>
        </div>
      )}

      {/* Control hints pill */}
      <div className="px-3.5 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-300 text-xs shadow-xl backdrop-blur flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">
            Click
          </span>
          <span className="text-slate-400">/</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">
            Arrows
          </span>
          <span className="text-slate-400">Move</span>
        </div>

        <span className="text-slate-600">·</span>

        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">
            Shift
          </span>
          <span className="text-slate-400">Sprint</span>
        </div>

        <span className="text-slate-600">·</span>

        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">
            [E]
          </span>
          <span className="text-indigo-400 font-medium">Interact</span>
        </div>

        <span className="text-slate-600">·</span>

        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-amber-300">
            [1-5]
          </span>
          <span className="text-amber-300 font-medium">React</span>
        </div>

        <span className="text-slate-600 hidden sm:inline">·</span>

        <span className="text-slate-400 text-[11px] hidden sm:inline truncate max-w-40 font-mono">
          {currentMapName.split('(')[0]}
        </span>
      </div>
    </div>
  );
};
