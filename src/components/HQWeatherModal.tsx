/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  HQWeatherConfig,
  CurrentWeatherState,
  hqWeatherService,
} from '../services/HQWeatherService';
import { CloudRain, Sun, RefreshCw, X, Check, MapPin, Sliders } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface HQWeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onConfigUpdated: (config: HQWeatherConfig) => void;
}

export const HQWeatherModal: React.FC<HQWeatherModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  onConfigUpdated,
}) => {
  const [config, setConfig] = useState<HQWeatherConfig | null>(null);
  const [liveWeather, setLiveWeather] = useState<CurrentWeatherState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    hqWeatherService.getConfig().then((cfg) => {
      setConfig(cfg);
      hqWeatherService.fetchLiveWeather(cfg).then((live) => {
        setLiveWeather(live);
        setIsLoading(false);
      });
    });
  }, [isOpen]);

  if (!isOpen || !config) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMessage('Only authorized administrators can modify HQ weather settings.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const saved = await hqWeatherService.saveConfig(config);
      onConfigUpdated(saved);
      sounds.playInteract();
      setStatusMessage('HQ Weather configuration successfully saved to Firestore!');
      const freshLive = await hqWeatherService.fetchLiveWeather(saved);
      setLiveWeather(freshLive);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to save HQ weather configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshLive = async () => {
    sounds.playInteract();
    const live = await hqWeatherService.fetchLiveWeather(config);
    setLiveWeather(live);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="rpg-window w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rpg-window-title p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rpg-inset p-2 text-rpg-gold">
              <CloudRain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="pixel-title text-[10px]">HQ Weather & Simulation Settings</h3>
              <p className="text-xs text-rpg-dim">Synchronized environmental climate across all office windows</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rpg-btn rpg-btn-danger p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Live Preview Card */}
          <div className="rpg-inset p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-rpg-gold font-semibold text-[11px] uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5" />
                <span>{config.location}</span>
                <span className="text-rpg-dim">·</span>
                <span className="font-mono text-rpg-dim">{config.timezone}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-rpg-text font-mono">
                  {liveWeather ? `${liveWeather.temperatureC}°C` : '--°C'}
                </span>
                <span className="text-rpg-text font-medium">
                  {liveWeather?.conditionDescription || 'Loading live conditions...'}
                </span>
              </div>
              {liveWeather && (
                <p className="text-[11px] text-rpg-dim">
                  Humidity: {liveWeather.humidity}% · Rain: {liveWeather.rainMm}mm · Cloud cover: {liveWeather.cloudCoverPercent}% (Updated {liveWeather.lastUpdated})
                </p>
              )}
            </div>

            <button
              onClick={handleRefreshLive}
              className="rpg-btn rpg-btn-plain p-2 cursor-pointer shrink-0"
              title="Refresh live Open-Meteo weather"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Success / Error feedback */}
          {statusMessage && (
            <div className="rpg-inset rpg-edge-green p-3 text-rpg-green flex items-center gap-2">
              <Check className="w-4 h-4 text-rpg-green shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="rpg-inset rpg-edge-red p-3 text-rpg-red">
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="text-[11px] font-semibold text-rpg-text block mb-1">HQ Location Name</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config.location}
                  onChange={(e) => setConfig({ ...config, location: e.target.value })}
                  className="rpg-input w-full px-3 py-2 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-rpg-text block mb-1">Timezone</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config.timezone}
                  onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                  className="rpg-input w-full px-3 py-2 font-mono disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-rpg-text block mb-1">Latitude (-90 to +90)</label>
                <input
                  type="number"
                  step="0.0001"
                  disabled={!isAdmin}
                  value={config.latitude}
                  onChange={(e) => setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })}
                  className="rpg-input w-full px-3 py-2 font-mono disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-rpg-text block mb-1">Longitude (-180 to +180)</label>
                <input
                  type="number"
                  step="0.0001"
                  disabled={!isAdmin}
                  value={config.longitude}
                  onChange={(e) => setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })}
                  className="rpg-input w-full px-3 py-2 font-mono disabled:opacity-50"
                />
              </div>
            </div>

            <div className="pt-2 border-t-2 border-rpg-line space-y-2.5">
              <span className="text-[11px] font-semibold text-rpg-text block">Simulation Toggles</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="rpg-inset flex items-center gap-2 p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.weatherEnabled}
                    onChange={(e) => setConfig({ ...config, weatherEnabled: e.target.checked })}
                    className="accent-rpg-gold rounded focus:ring-0"
                  />
                  <span className="text-rpg-text font-medium">Weather System Enabled</span>
                </label>

                <label className="rpg-inset flex items-center gap-2 p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.rainEffectsEnabled}
                    onChange={(e) => setConfig({ ...config, rainEffectsEnabled: e.target.checked })}
                    className="accent-rpg-gold rounded focus:ring-0"
                  />
                  <span className="text-rpg-text font-medium">Window Raindrops Effect</span>
                </label>

                <label className="rpg-inset flex items-center gap-2 p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.lightingEffectsEnabled}
                    onChange={(e) => setConfig({ ...config, lightingEffectsEnabled: e.target.checked })}
                    className="accent-rpg-gold rounded focus:ring-0"
                  />
                  <span className="text-rpg-text font-medium">Ambient Daylight Tinting</span>
                </label>

                <label className="rpg-inset flex items-center gap-2 p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.windowEffectsEnabled}
                    onChange={(e) => setConfig({ ...config, windowEffectsEnabled: e.target.checked })}
                    className="accent-rpg-gold rounded focus:ring-0"
                  />
                  <span className="text-rpg-text font-medium">Skyline Backdrop Vista</span>
                </label>
              </div>
            </div>

            {isAdmin ? (
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rpg-btn rpg-btn-plain px-4 py-2 font-medium cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rpg-btn rpg-btn-gold px-5 py-2 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {isSaving ? 'Saving to Firestore...' : 'Save HQ Settings'}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-rpg-dim italic pt-1">
                Viewing mode (Read-only). Only administrators can update persistent HQ weather parameters.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
