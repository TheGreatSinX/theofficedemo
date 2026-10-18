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
        className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <CloudRain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">HQ Weather & Simulation Settings</h3>
              <p className="text-xs text-slate-400">Synchronized environmental climate across all office windows</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Live Preview Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border border-indigo-800/40 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-[11px] uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5" />
                <span>{config.location}</span>
                <span className="text-slate-500">·</span>
                <span className="font-mono text-slate-400">{config.timezone}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white font-mono">
                  {liveWeather ? `${liveWeather.temperatureC}°C` : '--°C'}
                </span>
                <span className="text-slate-300 font-medium">
                  {liveWeather?.conditionDescription || 'Loading live conditions...'}
                </span>
              </div>
              {liveWeather && (
                <p className="text-[11px] text-slate-400">
                  Humidity: {liveWeather.humidity}% · Rain: {liveWeather.rainMm}mm · Cloud cover: {liveWeather.cloudCoverPercent}% (Updated {liveWeather.lastUpdated})
                </p>
              )}
            </div>

            <button
              onClick={handleRefreshLive}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Refresh live Open-Meteo weather"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Success / Error feedback */}
          {statusMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">HQ Location Name</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config.location}
                  onChange={(e) => setConfig({ ...config, location: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Timezone</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config.timezone}
                  onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Latitude (-90 to +90)</label>
                <input
                  type="number"
                  step="0.0001"
                  disabled={!isAdmin}
                  value={config.latitude}
                  onChange={(e) => setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Longitude (-180 to +180)</label>
                <input
                  type="number"
                  step="0.0001"
                  disabled={!isAdmin}
                  value={config.longitude}
                  onChange={(e) => setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2.5">
              <span className="text-[11px] font-semibold text-slate-300 block">Simulation Toggles</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.weatherEnabled}
                    onChange={(e) => setConfig({ ...config, weatherEnabled: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-medium">Weather System Enabled</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.rainEffectsEnabled}
                    onChange={(e) => setConfig({ ...config, rainEffectsEnabled: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-medium">Window Raindrops Effect</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.lightingEffectsEnabled}
                    onChange={(e) => setConfig({ ...config, lightingEffectsEnabled: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-medium">Ambient Daylight Tinting</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={config.windowEffectsEnabled}
                    onChange={(e) => setConfig({ ...config, windowEffectsEnabled: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-medium">Skyline Backdrop Vista</span>
                </label>
              </div>
            </div>

            {isAdmin ? (
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {isSaving ? 'Saving to Firestore...' : 'Save HQ Settings'}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic pt-1">
                Viewing mode (Read-only). Only administrators can update persistent HQ weather parameters.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
