const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'app-settings.json');

const DEFAULTS = {
  system: {
    publicBaseUrl: '',
    trialDays: 20,
    productLimit: 40,
    authDevMode: false,
    smsCooldownSec: 60,
    photoMaxMb: 5,
    qrcodeMaxMb: 2,
  },
  ai: {
    apiKey: '',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    timeoutMs: 45000,
    sellingLlmStrict: false,
    queueConcurrency: 3,
    queueMax: 30,
    queueWaitMs: 120000,
  },
  client: {
    uploadMaxEdge: 2400,
    uploadQuality: 0.88,
    skipJpegMaxMb: 2,
    embedConcurrency: 6,
    embedCacheMax: 48,
    posterCacheMax: 24,
    galleryMaxItems: 100,
    previewDebounceMs: 350,
    searchDebounceMs: 300,
    hdPosterRender: false,
    progressReportCap: 98,
    progressWaitMax: 99.9,
    galleryDedupeWindowMin: 15,
  },
};

const CATEGORY_KEYS = {
  system: Object.keys(DEFAULTS.system),
  ai: Object.keys(DEFAULTS.ai),
  client: Object.keys(DEFAULTS.client),
};

let cached = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function envSeed() {
  return {
    system: {
      publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
      authDevMode: process.env.AUTH_DEV_MODE === 'true',
    },
    ai: {
      apiKey: process.env.VISION_API_KEY || process.env.DEEPSEEK_API_KEY || '',
      apiUrl:
        process.env.VISION_API_URL
        || process.env.DEEPSEEK_API_URL
        || DEFAULTS.ai.apiUrl,
      model: process.env.VISION_MODEL || process.env.DEEPSEEK_MODEL || DEFAULTS.ai.model,
      timeoutMs: parseInt(process.env.VISION_TIMEOUT_MS || String(DEFAULTS.ai.timeoutMs), 10),
      sellingLlmStrict: process.env.SELLING_LLM_STRICT === 'true',
      queueConcurrency: parseInt(process.env.AI_QUEUE_CONCURRENCY || '3', 10),
      queueMax: parseInt(process.env.AI_QUEUE_MAX || '30', 10),
      queueWaitMs: parseInt(process.env.AI_QUEUE_WAIT_MS || '120000', 10),
    },
  };
}

function deepMerge(base, patch) {
  const out = { ...base };
  Object.keys(patch || {}).forEach((key) => {
    if (patch[key] !== undefined && patch[key] !== null) out[key] = patch[key];
  });
  return out;
}

function clampNumber(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeCategory(category, input = {}) {
  const keys = CATEGORY_KEYS[category];
  if (!keys) throw new Error('INVALID_SETTINGS_CATEGORY');
  const base = { ...DEFAULTS[category] };
  const out = { ...base };
  keys.forEach((key) => {
    if (input[key] === undefined) return;
    out[key] = input[key];
  });

  if (category === 'system') {
    out.trialDays = clampNumber(out.trialDays, { min: 1, max: 365, fallback: base.trialDays });
    out.productLimit = clampNumber(out.productLimit, { min: 1, max: 10000, fallback: base.productLimit });
    out.smsCooldownSec = clampNumber(out.smsCooldownSec, { min: 30, max: 300, fallback: base.smsCooldownSec });
    out.photoMaxMb = clampNumber(out.photoMaxMb, { min: 1, max: 20, fallback: base.photoMaxMb });
    out.qrcodeMaxMb = clampNumber(out.qrcodeMaxMb, { min: 1, max: 10, fallback: base.qrcodeMaxMb });
    out.publicBaseUrl = String(out.publicBaseUrl || '').trim().replace(/\/$/, '');
    out.authDevMode = !!out.authDevMode;
  }

  if (category === 'ai') {
    out.timeoutMs = clampNumber(out.timeoutMs, { min: 5000, max: 120000, fallback: base.timeoutMs });
    out.queueConcurrency = clampNumber(out.queueConcurrency, { min: 1, max: 20, fallback: base.queueConcurrency });
    out.queueMax = clampNumber(out.queueMax, { min: 1, max: 200, fallback: base.queueMax });
    out.queueWaitMs = clampNumber(out.queueWaitMs, { min: 5000, max: 600000, fallback: base.queueWaitMs });
    out.apiUrl = String(out.apiUrl || base.apiUrl).trim();
    out.model = String(out.model || base.model).trim();
    out.sellingLlmStrict = !!out.sellingLlmStrict;
    out.apiKey = String(out.apiKey || '').trim();
  }

  if (category === 'client') {
    out.uploadMaxEdge = clampNumber(out.uploadMaxEdge, { min: 800, max: 4096, fallback: base.uploadMaxEdge });
    out.uploadQuality = clampNumber(out.uploadQuality, { min: 0.5, max: 1, fallback: base.uploadQuality });
    out.skipJpegMaxMb = clampNumber(out.skipJpegMaxMb, { min: 0.5, max: 10, fallback: base.skipJpegMaxMb });
    out.embedConcurrency = clampNumber(out.embedConcurrency, { min: 1, max: 12, fallback: base.embedConcurrency });
    out.embedCacheMax = clampNumber(out.embedCacheMax, { min: 8, max: 200, fallback: base.embedCacheMax });
    out.posterCacheMax = clampNumber(out.posterCacheMax, { min: 4, max: 100, fallback: base.posterCacheMax });
    out.galleryMaxItems = clampNumber(out.galleryMaxItems, { min: 10, max: 500, fallback: base.galleryMaxItems });
    out.previewDebounceMs = clampNumber(out.previewDebounceMs, { min: 100, max: 2000, fallback: base.previewDebounceMs });
    out.searchDebounceMs = clampNumber(out.searchDebounceMs, { min: 100, max: 2000, fallback: base.searchDebounceMs });
    out.progressReportCap = clampNumber(out.progressReportCap, { min: 50, max: 99, fallback: base.progressReportCap });
    out.progressWaitMax = clampNumber(out.progressWaitMax, { min: 90, max: 99.9, fallback: base.progressWaitMax });
    out.galleryDedupeWindowMin = clampNumber(out.galleryDedupeWindowMin, { min: 1, max: 120, fallback: base.galleryDedupeWindowMin });
    out.hdPosterRender = !!out.hdPosterRender;
  }

  return out;
}

function loadSettings() {
  ensureDataDir();
  let fileData = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      fileData = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch {
      fileData = {};
    }
  }
  const seed = envSeed();
  cached = {
    system: sanitizeCategory('system', deepMerge(deepMerge(DEFAULTS.system, seed.system), fileData.system || {})),
    ai: sanitizeCategory('ai', deepMerge(deepMerge(DEFAULTS.ai, seed.ai), fileData.ai || {})),
    client: sanitizeCategory('client', deepMerge(DEFAULTS.client, fileData.client || {})),
    updatedAt: fileData.updatedAt || null,
  };
  return cached;
}

function getSettings() {
  if (!cached) loadSettings();
  return cached;
}

function saveSettings(next) {
  ensureDataDir();
  cached = next;
  cached.updatedAt = Date.now();
  fs.writeFileSync(
    SETTINGS_PATH,
    JSON.stringify(
      {
        system: cached.system,
        ai: cached.ai,
        client: cached.client,
        updatedAt: cached.updatedAt,
      },
      null,
      2
    ),
    'utf8'
  );
  return cached;
}

function getCategory(category) {
  return { ...getSettings()[category] };
}

function maskApiKey(key = '') {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
}

function getCategoryForAdmin(category) {
  const data = getCategory(category);
  if (category === 'ai') {
    return { ...data, apiKey: data.apiKey ? maskApiKey(data.apiKey) : '', hasApiKey: !!data.apiKey };
  }
  return data;
}

function updateCategory(category, input = {}) {
  const current = getSettings();
  const prev = current[category] || {};
  let merged = sanitizeCategory(category, { ...prev, ...input });

  if (category === 'ai') {
    const incomingKey = String(input.apiKey || '').trim();
    if (!incomingKey || incomingKey.includes('•')) {
      merged.apiKey = prev.apiKey || '';
    }
  }

  const next = { ...current, [category]: merged };
  saveSettings(next);
  return getCategoryForAdmin(category);
}

const DEFAULT_ADMIN_PHONES = ['13523515442'];

function getAdminPhones() {
  const fromEnv = String(process.env.ADMIN_PHONES || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ADMIN_PHONES;
}

function canManageSettings(user) {
  if (!user) return false;
  return getAdminPhones().includes(String(user.phone || ''));
}

function getSystem() {
  return getCategory('system');
}

function getClient() {
  return getCategory('client');
}

function getEffectiveAi() {
  const ai = getCategory('ai');
  return {
    apiKey: ai.apiKey || process.env.VISION_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    apiUrl: ai.apiUrl || process.env.VISION_API_URL || 'https://api.deepseek.com/chat/completions',
    model: ai.model || process.env.VISION_MODEL || 'deepseek-chat',
    timeoutMs: ai.timeoutMs,
    sellingLlmStrict: ai.sellingLlmStrict,
    queueConcurrency: ai.queueConcurrency,
    queueMax: ai.queueMax,
    queueWaitMs: ai.queueWaitMs,
  };
}

function isAuthDevMode() {
  const sys = getSystem();
  if (sys.authDevMode) return true;
  return process.env.AUTH_DEV_MODE === 'true' || process.env.NODE_ENV !== 'production';
}

module.exports = {
  DEFAULTS,
  SETTINGS_PATH,
  loadSettings,
  getSettings,
  getCategory,
  getCategoryForAdmin,
  updateCategory,
  canManageSettings,
  getSystem,
  getClient,
  getEffectiveAi,
  isAuthDevMode,
  maskApiKey,
  sanitizeCategory,
};
