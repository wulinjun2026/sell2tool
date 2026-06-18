import { api } from './api.js';
import { getToken } from './auth.js';

const DEFAULTS = {
  uploadMaxEdge: 2400,
  uploadQuality: 0.88,
  skipJpegMaxMb: 2,
  embedConcurrency: 6,
  embedConcurrencyLowEnd: 3,
  embedConcurrencyHighEnd: 10,
  embedCacheMax: 48,
  posterCacheMax: 24,
  galleryMaxItems: 100,
  previewDebounceMs: 350,
  searchDebounceMs: 300,
  hdPosterRender: false,
  progressReportCap: 98,
  progressWaitMax: 99.9,
  galleryDedupeWindowMin: 15,
};

let settings = { ...DEFAULTS };
let systemHints = { smsCooldownSec: 60, trialDays: 20, productLimit: 40 };
let loaded = false;

export function getClientSetting(key) {
  return settings[key] ?? DEFAULTS[key];
}

export function getClientSettings() {
  return { ...settings };
}

export function getSystemHint(key) {
  return systemHints[key];
}

export function applyClientSettings(payload = {}) {
  if (payload.settings) {
    settings = { ...settings, ...payload.settings };
  } else if (!payload.system) {
    settings = { ...settings, ...payload };
  }
  if (payload.system) systemHints = { ...systemHints, ...payload.system };
  loaded = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('uca:client-settings', { detail: { ...settings } }));
  }
}

export function isClientSettingsLoaded() {
  return loaded;
}

export async function initClientSettings({ force = false } = {}) {
  if (!getToken()) {
    if (loaded && !force) return settings;
    try {
      const health = await api.health();
      if (health.system) {
        applyClientSettings({ system: health.system });
      } else {
        applyClientSettings({});
      }
    } catch {
      applyClientSettings({});
    }
    return settings;
  }
  if (loaded && !force) return settings;
  try {
    const data = await api.getClientSettings();
    applyClientSettings({ settings: data.settings || {}, system: data.system });
  } catch {
    applyClientSettings({});
  }
  return settings;
}

export function skipJpegMaxBytes() {
  return Math.round(getClientSetting('skipJpegMaxMb') * 1024 * 1024);
}

export function galleryDedupeWindowMs() {
  return getClientSetting('galleryDedupeWindowMin') * 60 * 1000;
}

// 根据设备性能动态调整图片嵌入并发数
export function getEmbedConcurrency() {
  const cores = navigator?.hardwareConcurrency || 4;
  const isLowEnd = cores <= 4;
  return isLowEnd ? getClientSetting('embedConcurrencyLowEnd') : getClientSetting('embedConcurrencyHighEnd');
}
