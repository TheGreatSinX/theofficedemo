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
        <div className="rpg-inset rpg-edge-gold px-3 py-1.5 text-rpg-gold text-xs font-semibold flex items-center gap-1.5 animate-pulse">
          <Zap className="w-3.5 h-3.5 text-rpg-gold" />
          <span>Espresso Sprint Buff: {speedBoostTimeLeft}s (+40%)</span>
        </div>
      )}

      {/* Control hints pill */}
      <div className="rpg-window px-3.5 py-2 text-rpg-text text-xs flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="rpg-chip px-1.5 py-0.5 text-[10px]">
            Click
          </span>
          <span className="text-rpg-dim">/</span>
          <span className="rpg-chip px-1.5 py-0.5 text-[10px]">
            Arrows
          </span>
          <span className="text-rpg-dim">Move</span>
        </div>

        <span className="text-rpg-dim opacity-60">·</span>

        <div className="flex items-center gap-1.5">
          <span className="rpg-chip px-1.5 py-0.5 text-[10px]">
            Shift
          </span>
          <span className="text-rpg-dim">Sprint</span>
        </div>

        <span className="text-rpg-dim opacity-60">·</span>

        <div className="flex items-center gap-1.5">
          <span className="rpg-chip px-1.5 py-0.5 text-[10px]">
            [E]
          </span>
          <span className="text-rpg-gold font-medium">Interact</span>
        </div>

        <span className="text-rpg-dim opacity-60">·</span>

        <div className="flex items-center gap-1.5">
          <span className="rpg-chip rpg-chip-gold px-1.5 py-0.5 text-[10px]">
            [1-5]
          </span>
          <span className="text-rpg-gold font-medium">React</span>
        </div>

        <span className="text-rpg-dim opacity-60 hidden sm:inline">·</span>

        <span className="text-rpg-dim text-[11px] hidden sm:inline truncate max-w-40 font-mono">
          {currentMapName.split('(')[0]}
        </span>
      </div>
    </div>
  );
};
