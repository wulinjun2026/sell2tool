// 结构化数据离线缓存（IndexedDB）
// 缓存模板列表、卖点推荐结果，减少网络请求

const STRUCTURED_DB_NAME = 'used-car-structured-cache-v1';
const STORES = {
  templates: 'templates',
  sellingPoints: 'sellingPoints',
  vehicleInfo: 'vehicleInfo',
};

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(STRUCTURED_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.values(STORES).forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'key' });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    }).catch(() => null);
  }
  return dbPromise;
}

async function getCache(storeName, key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry) { resolve(null); return; }
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          const delTx = db.transaction(storeName, 'readwrite');
          delTx.objectStore(storeName).delete(key);
          resolve(null);
          return;
        }
        resolve(entry.data);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setCache(storeName, key, data, ttlMs) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({
        key,
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function clearCacheStore(storeName) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export const offlineCache = {
  // 模板列表缓存（TTL 24小时）
  getTemplates: () => getCache(STORES.templates, 'all'),
  setTemplates: (templates) => setCache(STORES.templates, 'all', templates, 24 * 60 * 60 * 1000),
  clearTemplates: () => clearCacheStore(STORES.templates),

  // 卖点推荐结果缓存（TTL 7天）
  getSellingRecommendation: (brandModel, year) =>
    getCache(STORES.sellingPoints, `${brandModel}::${year || 'none'}`),
  setSellingRecommendation: (brandModel, year, points) =>
    setCache(STORES.sellingPoints, `${brandModel}::${year || 'none'}`, points, 7 * 24 * 60 * 60 * 1000),
  clearSellingPoints: () => clearCacheStore(STORES.sellingPoints),

  // 产品信息提取缓存（TTL 1小时）
  getVehicleInfo: (textHash) => getCache(STORES.vehicleInfo, textHash),
  setVehicleInfo: (textHash, info) =>
    setCache(STORES.vehicleInfo, textHash, info, 60 * 60 * 1000),
  clearVehicleInfo: () => clearCacheStore(STORES.vehicleInfo),

  // 清除所有缓存
  clearAll: async () => {
    await Promise.all([
      clearCacheStore(STORES.templates),
      clearCacheStore(STORES.sellingPoints),
      clearCacheStore(STORES.vehicleInfo),
    ]);
  },
};