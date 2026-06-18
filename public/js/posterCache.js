import { getClientSetting } from './clientSettings.js';

const DB_NAME = 'used-car-poster-cache-v1';
const STORE = 'entries';

function maxEntries() {
  return getClientSetting('posterCacheMax');
}

const memStore = new Map();
const blobUrlByKey = new Map();
let dbPromise = null;

function supportsIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  if (!supportsIndexedDB()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return dbPromise;
}

function idbGet(key) {
  return openDb().then((db) => {
    if (!db) return memStore.get(key) || null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

function idbPut(key, value) {
  return openDb().then((db) => {
    if (!db) {
      memStore.set(key, value);
      trimMemStore();
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function idbDelete(key) {
  blobUrlByKey.delete(key);
  return openDb().then((db) => {
    if (!db) {
      memStore.delete(key);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

async function trimMemStore() {
  if (memStore.size <= maxEntries()) return;
  const keys = [...memStore.entries()]
    .sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
  while (memStore.size > maxEntries()) {
    const [oldKey] = keys.shift();
    await idbDelete(oldKey);
  }
}

async function trimIndexedDb() {
  const db = await openDb();
  if (!db) return;
  const entries = await new Promise((resolve, reject) => {
    const list = [];
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor) {
        list.push({ key: cursor.key, savedAt: cursor.value?.savedAt || 0 });
        cursor.continue();
      } else {
        resolve(list);
      }
    };
    req.onerror = () => reject(req.error);
  }).catch(() => []);

  if (entries.length <= maxEntries()) return;
  entries.sort((a, b) => a.savedAt - b.savedAt);
  const drop = entries.length - maxEntries();
  for (let i = 0; i < drop; i += 1) {
    await idbDelete(String(entries[i].key));
  }
}

/** 仅基于影响长图内容的字段，避免生成记录写入后 updatedAt 变化导致缓存失效 */
export function vehiclePosterFingerprint(v) {
  if (!v) return '';
  const photos = (v.photos || [])
    .map((p) => `${p.category}/${p.slotKey}#${p.id || p.url || ''}`)
    .sort()
    .join(',');
  const points = (v.sellingPoints || [])
    .map((p) => `${p.id || ''}:${p.text || ''}`)
    .sort()
    .join(',');
  return [
    v.brandModel || '',
    v.year ?? '',
    v.priceWan ?? '',
    v.polishedDescription || v.extraDescription || '',
    photos,
    points,
  ].join('::');
}

export function buildPosterCacheKey({ vehicleIds, templateId, photoLayout, previewMode, vehicles, dealer }) {
  const sortedIds = [...vehicleIds].sort();
  const vehicleMap = new Map((vehicles || []).map((v) => [v.id, v]));
  const vPart = sortedIds
    .map((id) => `${id}:${vehiclePosterFingerprint(vehicleMap.get(id))}`)
    .join('|');
  const dPart = dealer
    ? `${dealer.updatedAt || dealer.updated_at || 0}:${dealer.shopName || dealer.shop_name || ''}:${dealer.contactPhone || dealer.contact_phone || ''}:${dealer.qrcodeUrl || dealer.qrcode_path || ''}`
    : '0';
  const layoutPart = photoLayout || 'grid_2';
  return `${previewMode ? 'preview' : 'final'}:${templateId}:${layoutPart}:${vPart}:${dPart}`;
}

function toDataUrl(base64) {
  if (!base64) return '';
  if (base64.startsWith('data:')) return base64;
  return `data:image/png;base64,${base64}`;
}

export function getPosterDisplayUrl(cacheKey, base64) {
  const dataUrl = toDataUrl(base64);
  if (!cacheKey) return dataUrl;
  const prev = blobUrlByKey.get(cacheKey);
  if (prev) return prev;
  try {
    const binary = atob(base64.replace(/^data:image\/\w+;base64,/, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    blobUrlByKey.set(cacheKey, url);
    return url;
  } catch {
    return dataUrl;
  }
}

export async function readPosterCache(cacheKey) {
  const entry = await idbGet(cacheKey);
  if (!entry?.imageBase64) return null;
  const displayUrl = getPosterDisplayUrl(cacheKey, entry.imageBase64);
  return {
    cacheKey,
    imageBase64: entry.imageBase64,
    displayUrl,
    dataUrl: toDataUrl(entry.imageBase64),
    generationId: entry.generationId || null,
    width: entry.width,
    height: entry.height,
    fileSize: entry.fileSize,
    previewMode: !!entry.previewMode,
    fromCache: true,
  };
}

export async function writePosterCache(cacheKey, result) {
  if (!cacheKey || !result?.imageBase64) return;
  const payload = {
    imageBase64: result.imageBase64,
    generationId: result.generationId || null,
    width: result.width,
    height: result.height,
    fileSize: result.fileSize,
    previewMode: !!result.previewMode,
    savedAt: Date.now(),
  };
  await idbPut(cacheKey, payload);
  getPosterDisplayUrl(cacheKey, payload.imageBase64);
  await trimIndexedDb();
}

export async function buildPosterCacheContext(vehicleIds, api, state) {
  const sortedIds = [...vehicleIds].sort();
  const vehicles = await Promise.all(
    sortedIds.map(async (id) => {
      const cached = state.vehicles.find((v) => v.id === id);
      if (cached?.updatedAt != null) return cached;
      return api.getVehicle(id);
    })
  );
  let dealer = state.dealer;
  if (!dealer) {
    dealer = await api.getDealer().catch(() => null);
    if (dealer) state.dealer = dealer;
  }
  return { vehicles, dealer };
}

/** 删除与指定车辆相关的长图缓存（删除生成记录时调用） */
export async function invalidatePosterCacheForVehicleIds(vehicleIds) {
  if (!vehicleIds?.length) return;
  const idSet = new Set(vehicleIds);
  const db = await openDb();
  if (!db) {
    for (const key of [...memStore.keys()]) {
      if ([...idSet].some((id) => key.includes(id))) await idbDelete(key);
    }
    return;
  }
  const keys = await new Promise((resolve, reject) => {
    const list = [];
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor) {
        list.push(String(cursor.key));
        cursor.continue();
      } else {
        resolve(list);
      }
    };
    req.onerror = () => reject(req.error);
  }).catch(() => []);
  for (const key of keys) {
    if ([...idSet].some((id) => key.includes(id))) await idbDelete(key);
  }
}

export function cacheResultToPayload(cached) {
  return {
    imageBase64: cached.imageBase64,
    generationId: cached.generationId,
    width: cached.width,
    height: cached.height,
    fileSize: cached.fileSize,
    previewMode: cached.previewMode,
    fromCache: true,
  };
}
