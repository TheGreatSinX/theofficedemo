/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, isSignedIn, OperationType } from './firebase';

export interface HQWeatherConfig {
  location: string;
  latitude: number;
  longitude: number;
  timezone: string;
  weatherEnabled: boolean;
  refreshIntervalMinutes: number;
  rainEffectsEnabled: boolean;
  lightingEffectsEnabled: boolean;
  windowEffectsEnabled: boolean;
  sourcePreference: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface CurrentWeatherState {
  temperatureC: number;
  humidity: number;
  rainMm: number;
  weatherCode: number;
  conditionDescription: string;
  isRaining: boolean;
  cloudCoverPercent: number;
  lastUpdated: string;
}

export const DEFAULT_HQ_WEATHER_CONFIG: HQWeatherConfig = {
  location: 'Manila, Philippines',
  latitude: 14.5995,
  longitude: 120.9842,
  timezone: 'Asia/Manila',
  weatherEnabled: true,
  refreshIntervalMinutes: 10,
  rainEffectsEnabled: true,
  lightingEffectsEnabled: true,
  windowEffectsEnabled: true,
  sourcePreference: 'open-meteo',
};

class HQWeatherService {
  private configCache: HQWeatherConfig = { ...DEFAULT_HQ_WEATHER_CONFIG };

  async getConfig(): Promise<HQWeatherConfig> {
    // Rules require auth for `platformConfig` reads; guests use cache/defaults.
    if (await isSignedIn()) {
      const configDocRef = doc(db, 'platformConfig', 'hqWeather');
      try {
        const snap = await getDoc(configDocRef);
        if (snap.exists()) {
          const data = snap.data() as HQWeatherConfig;
          this.configCache = { ...DEFAULT_HQ_WEATHER_CONFIG, ...data };
          return this.configCache;
        }
      } catch (err) {
        console.warn('Failed to fetch hqWeather config from Firestore, using cache/defaults:', err);
      }
    }
    return this.configCache;
  }

  async saveConfig(updates: Partial<HQWeatherConfig>): Promise<HQWeatherConfig> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Must be signed in as administrator to update HQ weather configuration.');
    }

    const merged: HQWeatherConfig = {
      ...this.configCache,
      ...updates,
    };

    // Validation
    if (!merged.location || merged.location.trim().length === 0) {
      throw new Error('HQ Location cannot be empty.');
    }
    if (merged.latitude < -90 || merged.latitude > 90) {
      throw new Error('Latitude must be between -90 and 90 degrees.');
    }
    if (merged.longitude < -180 || merged.longitude > 180) {
      throw new Error('Longitude must be between -180 and 180 degrees.');
    }
    if (merged.refreshIntervalMinutes < 1) {
      throw new Error('Refresh interval must be at least 1 minute.');
    }

    const configDocRef = doc(db, 'platformConfig', 'hqWeather');
    try {
      const payload = {
        ...merged,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
      };
      await setDoc(configDocRef, payload, { merge: true });
      this.configCache = merged;
      return merged;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'platformConfig/hqWeather');
    }
  }

  async fetchLiveWeather(config: HQWeatherConfig): Promise<CurrentWeatherState | null> {
    if (!config.weatherEnabled) return null;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.latitude}&longitude=${config.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      const current = data.current;
      if (!current) return null;

      const code = current.weather_code || 0;
      const isRaining = current.rain > 0 || current.precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(code);

      const description = this.interpretWMOWeatherCode(code);

      return {
        temperatureC: Math.round(current.temperature_2m),
        humidity: current.relative_humidity_2m,
        rainMm: current.rain || 0,
        weatherCode: code,
        conditionDescription: description,
        isRaining,
        cloudCoverPercent: current.cloud_cover || 0,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    } catch (err) {
      console.warn('Open-Meteo live weather fetch failed, operating in offline/standard mode:', err);
      return null;
    }
  }

  private interpretWMOWeatherCode(code: number): string {
    if (code === 0) return 'Clear Skies';
    if (code === 1 || code === 2) return 'Partly Cloudy';
    if (code === 3) return 'Overcast';
    if (code >= 45 && code <= 48) return 'Foggy / Misty';
    if (code >= 51 && code <= 55) return 'Light Tropical Drizzle';
    if (code >= 61 && code <= 65) return 'Monsoon Rain';
    if (code >= 80 && code <= 82) return 'Rain Showers';
    if (code >= 95) return 'Tropical Thunderstorm';
    return 'Tropical Climate';
  }
}

export const hqWeatherService = new HQWeatherService();
