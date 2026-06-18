import { apiUrl } from './config.js';
import { getAuthHeaders, clearToken } from './auth.js';

class ApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code || message;
    this.status = status;
    this.details = details;
  }
}

// 超时与重试配置
const DEFAULT_TIMEOUT_MS = 15000;
const AI_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1000];

function isRetryableError(status) {
  return status >= 500 || status === 0;
}

function isAiPath(path) {
  return ['/api/selling-points/generate', '/api/desc/extract', '/api/polish'].some((p) => path.includes(p));
}

// 带超时和重试的请求核心实现
async function requestWithRetry(path, options = {}) {
  const timeout = options.timeout || (isAiPath(path) ? AI_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : MAX_RETRIES;
  const signal = options.signal;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1] || 2000));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    // 合理的AbortController与外部signal整合
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        throw new DOMException('Aborted', 'AbortError');
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(apiUrl(path), {
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(options.headers || {}) },
        signal: controller.signal,
        ...options,
      });

      clearTimeout(timer);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.error?.code || data.error?.message || res.statusText;
        if (isRetryableError(res.status) && attempt < maxRetries) continue;
        if (res.status === 401) clearToken();
        throw new ApiError(code, { code, status: res.status, details: data.error });
      }
      return data;
    } catch (err) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        // 区分用户取消与超时
        if (signal?.aborted) throw err;
        if (attempt < maxRetries) continue;
        throw new ApiError('请求超时', { code: 'REQUEST_TIMEOUT', status: 0 });
      }

      if (attempt < maxRetries && isRetryableError(err.status || 0)) continue;
      throw err;
    }
  }
}

// 统一的请求入口（保留原有接口签名）
async function request(path, options = {}) {
  return requestWithRetry(path, options);
}

export const api = {
  health: () => request('/api/health'),
  sendSmsCode: (phone) => request('/api/auth/sms/send', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifySmsCode: (phone, code) => request('/api/auth/sms/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  listVehicles: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/vehicles${q ? `?${q}` : ''}`);
  },
  createVehicle: () => request('/api/vehicles', { method: 'POST', body: '{}' }),
  getVehicle: (id) => request(`/api/vehicles/${id}`),
  updateVehicle: (id, body) => request(`/api/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteVehicle: (id) => request(`/api/vehicles/${id}`, { method: 'DELETE' }),
  deletePosterRecord: (id) => request(`/api/vehicles/${id}/poster-record`, { method: 'DELETE' }),
  deletePosterGeneration: (id) => request(`/api/poster-generations/${id}`, { method: 'DELETE' }),
  batchDelete: (ids) => request('/api/vehicles/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  batchSold: (ids) => request('/api/vehicles/batch-sold', { method: 'POST', body: JSON.stringify({ ids }) }),
  markSold: (id) => request(`/api/vehicles/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'sold' }) }),
  markOnSale: (id) => request(`/api/vehicles/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'on_sale' }) }),
  deletePhoto: (vehicleId, photoId) =>
    request(`/api/vehicles/${vehicleId}/photos/${photoId}`, { method: 'DELETE' }),
  uploadPhoto: (vehicleId, category, slotKey, file, { replace = false, onProgress } = {}) => {
    const fd = new FormData();
    fd.append('category', category);
    fd.append('slotKey', slotKey);
    fd.append('source', 'gallery');
    if (replace) fd.append('replace', 'true');
    fd.append('photo', file);

    const authHeaders = getAuthHeaders();

    if (typeof onProgress !== 'function') {
      return fetch(apiUrl(`/api/vehicles/${vehicleId}/photos`), { method: 'POST', headers: authHeaders, body: fd })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status === 401) clearToken();
            throw new ApiError(data.error?.code || 'UPLOAD_FAILED', { code: data.error?.code, status: res.status, details: data.error });
          }
          return data;
        });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(`/api/vehicles/${vehicleId}/photos`));
      Object.entries(authHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, phase: 'upload' });
        }
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          if (xhr.status === 401) clearToken();
          reject(new ApiError(data.error?.code || 'UPLOAD_FAILED', { code: data.error?.code, status: xhr.status, details: data.error }));
        }
      };
      xhr.onerror = () => reject(new ApiError('UPLOAD_NETWORK_ERROR'));
      xhr.send(fd);
    });
  },
  generateSellingPoints: (body) =>
    request('/api/selling-points/generate', { method: 'POST', body: JSON.stringify(body) }),
  extractDescInfo: (body) =>
    request('/api/desc/extract', { method: 'POST', body: JSON.stringify(body) }),
  polish: (body) => request('/api/polish', { method: 'POST', body: JSON.stringify(body) }),
  listTemplates: () => request('/api/templates'),
  composePoster: (body, options = {}) =>
    request('/api/posters/compose', { method: 'POST', body: JSON.stringify(body), ...options }),
  confirmPosterPublished: (body) =>
    request('/api/posters/confirm', { method: 'POST', body: JSON.stringify(body) }),
  defaultShareCopy: (vehicleIds) =>
    request('/api/share/default-copy', { method: 'POST', body: JSON.stringify({ vehicleIds }) }),
  share: (body) => request('/api/share', { method: 'POST', body: JSON.stringify(body) }),
  getStats: () => request('/api/stats'),
  getClientSettings: () => request('/api/settings/client'),
  getSettingsCategory: (category) => request(`/api/settings/${category}`),
  updateSettingsCategory: (category, settings) =>
    request(`/api/settings/${category}`, { method: 'PUT', body: JSON.stringify({ settings }) }),
  getAdminUsersOverview: () => request('/api/admin/users/overview'),
  getAdminUsers: ({ q = '', status = 'all', limit = 100, offset = 0 } = {}) => {
    const params = new URLSearchParams({ q, status, limit: String(limit), offset: String(offset) });
    return request(`/api/admin/users?${params}`);
  },
  setAdminUserPlan: (userId, plan) =>
    request(`/api/admin/users/${userId}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) }),
  getDealer: () => request('/api/dealer'),
  updateDealer: (body) => request('/api/dealer', { method: 'PUT', body: JSON.stringify(body) }),
  uploadDealerQrcode: async (file) => {
    const fd = new FormData();
    fd.append('qrcode', file);
    const res = await fetch(apiUrl('/api/dealer/qrcode'), { method: 'POST', headers: getAuthHeaders(), body: fd });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new ApiError(data.error?.code || 'QRCODE_UPLOAD_FAILED', { code: data.error?.code, status: res.status, details: data.error });
    }
    return data;
  },
};

export { ApiError };