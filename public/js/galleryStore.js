import { getClientSetting, galleryDedupeWindowMs } from './clientSettings.js';

const DB_NAME = 'used-car-gallery-v1';
const STORE = 'items';

function maxItems() {
  return getClientSetting('galleryMaxItems');
}

const memItems = new Map();
const blobUrlById = new Map();
let dbPromise = null;

function supportsIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  if (!supportsIndexedDB()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return dbPromise;
}

function idbGetAll() {
  return openDb().then((db) => {
    if (!db) return [...memItems.values()];
    return new Promise((resolve, reject) => {
      const list = [];
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (cursor) {
          list.push(cursor.value);
          cursor.continue();
        } else {
          resolve(list);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

function idbDelete(id) {
  blobUrlById.delete(id);
  memItems.delete(id);
  return openDb().then((db) => {
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function idbPut(item) {
  return openDb().then((db) => {
    if (!db) {
      memItems.set(item.id, item);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item, item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function buildGalleryName(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateKey = `${y}${m}${d}`;
  const seqKey = `uca_gallery_seq_${dateKey}`;
  const seq = parseInt(localStorage.getItem(seqKey) || '0', 10) + 1;
  localStorage.setItem(seqKey, String(seq));
  return `${dateKey}-${String(seq).padStart(2, '0')}`;
}

function vehicleKey(vehicleIds) {
  return [...vehicleIds].sort().join(',');
}

export function getGalleryDisplayUrl(item) {
  if (!item?.imageBase64) return '';
  const prev = blobUrlById.get(item.id);
  if (prev) return prev;
  try {
    const binary = atob(item.imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    blobUrlById.set(item.id, url);
    return url;
  } catch {
    return `data:image/png;base64,${item.imageBase64}`;
  }
}

export async function listGalleryItems() {
  const items = await idbGetAll();
  return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getGalleryItem(id) {
  const items = await idbGetAll();
  return items.find((item) => item.id === id) || null;
}

export async function findRecentGalleryItem(vehicleIds, templateId, windowMs = galleryDedupeWindowMs()) {
  const key = vehicleKey(vehicleIds);
  const now = Date.now();
  const items = await listGalleryItems();
  return items.find((item) =>
    item.templateId === templateId
    && vehicleKey(item.vehicleIds) === key
    && now - (item.createdAt || 0) <= windowMs
  ) || null;
}

export async function saveMultiPosterToGallery({
  vehicleIds,
  templateId,
  imageBase64,
  generationId,
  previewMode = false,
}) {
  if (!vehicleIds?.length || vehicleIds.length <= 1 || !imageBase64) return null;

  const existing = await findRecentGalleryItem(vehicleIds, templateId);
  if (existing) {
    const updated = {
      ...existing,
      imageBase64,
      generationId: generationId || existing.generationId,
      previewMode: !!previewMode,
      updatedAt: Date.now(),
    };
    await idbPut(updated);
    blobUrlById.delete(existing.id);
    return updated;
  }

  const item = {
    id: crypto.randomUUID?.() || `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: buildGalleryName(),
    createdAt: Date.now(),
    vehicleIds: [...vehicleIds],
    templateId,
    imageBase64,
    generationId: generationId || null,
    previewMode: !!previewMode,
  };
  await idbPut(item);

  const all = await listGalleryItems();
  if (all.length > maxItems()) {
    const drop = all.slice(maxItems());
    for (const old of drop) {
      blobUrlById.delete(old.id);
      memItems.delete(old.id);
      if (supportsIndexedDB()) {
        const db = await openDb();
        if (db) {
          await new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(old.id);
            tx.oncomplete = () => resolve();
          });
        }
      }
    }
  }

  return item;
}

/** 删除图库中的多车生成记录（IndexedDB） */
export async function deleteGalleryItem(id) {
  const item = await getGalleryItem(id);
  if (!item) return false;
  await idbDelete(id);
  return item;
}
