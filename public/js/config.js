const SERVER_URL_KEY = 'uca_server_url';
export const DEFAULT_SERVER_URL = 'http://106.12.40.212';

export function isNativeApp() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

/** 浏览器访问时返回空字符串（同源）；APK 内默认连生产服务器 */
export function getServerBase() {
  const stored = localStorage.getItem(SERVER_URL_KEY)?.trim();
  if (stored) return stored.replace(/\/$/, '');
  if (isNativeApp()) return DEFAULT_SERVER_URL;
  return '';
}

export function getConfiguredServerUrl() {
  return localStorage.getItem(SERVER_URL_KEY)?.trim() || '';
}

export function setServerBase(url) {
  const normalized = (url || '').trim().replace(/\/$/, '');
  if (normalized) localStorage.setItem(SERVER_URL_KEY, normalized);
  else localStorage.removeItem(SERVER_URL_KEY);
}

export function apiUrl(path) {
  const base = getServerBase();
  return `${base}${path}`;
}

export function assetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = getServerBase();
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}
