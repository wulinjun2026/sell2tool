const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const aiRequestQueue = require('./aiRequestQueue');
const baiduImageSearch = require('./baiduImageSearch');
const baiduCarApi = require('./baiduCarApi');
const { extractJsonObject, normalizeRecognizeResult } = require('./recognizeNormalize');
const { aggregateRecognizeResults } = require('./recognizeAggregate');
const { prepareForRecognition } = require('./recognizeImagePrep');
const {
  applySlotWeight,
  refineRecognizeResult,
  filterExteriorPhotos,
} = require('./recognizeRefine');

const SLOT_PRIORITY = [
  ['exterior', 'front'],
  ['exterior', 'left45'],
  ['exterior', 'right45'],
  ['exterior', 'left'],
  ['exterior', 'right'],
  ['exterior', 'rear'],
  ['interior', 'center_console'],
  ['interior', 'screen'],
];

const SLOT_LABELS = {
  'exterior/front': '车辆正前方外观',
  'exterior/rear': '车辆正后方外观',
  'exterior/left45': '车辆左前45度外观',
  'exterior/right45': '车辆右前45度外观',
  'exterior/left': '车辆左侧外观',
  'exterior/right': '车辆右侧外观',
  'interior/center_console': '中控台内饰',
  'interior/screen': '车机屏幕',
};

function getRecognizeMaxPhotos() {
  const max = parseInt(process.env.RECOGNIZE_MAX_PHOTOS || '5', 10);
  if (!Number.isFinite(max) || max < 1) return 4;
  return Math.min(max, 8);
}

function pickPhotosForRecognition(photos = [], maxPhotos = getRecognizeMaxPhotos()) {
  const picked = [];
  const seenIds = new Set();

  for (const [category, slotKey] of SLOT_PRIORITY) {
    const hit = photos.find((p) => p.category === category && p.slotKey === slotKey);
    if (hit?.filePath && fs.existsSync(hit.filePath) && !seenIds.has(hit.id)) {
      picked.push(hit);
      seenIds.add(hit.id);
    }
    if (picked.length >= maxPhotos) return picked;
  }

  for (const photo of photos) {
    if (picked.length >= maxPhotos) break;
    if (photo?.filePath && fs.existsSync(photo.filePath) && !seenIds.has(photo.id)) {
      picked.push(photo);
      seenIds.add(photo.id);
    }
  }

  return picked;
}

function pickPhotoForRecognition(photos = []) {
  return pickPhotosForRecognition(photos, 1)[0] || null;
}

function isDeepSeekEndpoint(apiUrl = '') {
  return /deepseek\.com/i.test(apiUrl);
}

function resolveVisionConfig() {
  const imageApiKey = process.env.VISION_IMAGE_API_KEY;
  const imageApiUrl = process.env.VISION_IMAGE_API_URL;
  const imageModel = process.env.VISION_IMAGE_MODEL;

  if (imageApiKey && imageApiUrl) {
    return {
      apiKey: imageApiKey,
      apiUrl: imageApiUrl,
      model: imageModel || 'deepseek-ai/deepseek-vl2',
      provider: 'vision',
    };
  }

  const apiKey = process.env.VISION_API_KEY || process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.VISION_API_URL || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
  const model = process.env.VISION_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  return {
    apiKey,
    apiUrl,
    model,
    provider: isDeepSeekEndpoint(apiUrl) ? 'deepseek' : 'vision',
  };
}

async function prepareImageBase64(filePath, photo = {}) {
  const buf = await prepareForRecognition(filePath, {
    purpose: 'vision',
    category: photo.category,
    slotKey: photo.slotKey,
  });
  return buf.toString('base64');
}

function getVisionFallbackThreshold() {
  const threshold = parseFloat(process.env.RECOGNIZE_VISION_FALLBACK_THRESHOLD || '0.72');
  return Number.isFinite(threshold) ? Math.min(Math.max(threshold, 0.5), 0.95) : 0.72;
}

function getVisionPhotoLimit() {
  const limit = parseInt(process.env.RECOGNIZE_VISION_MAX_PHOTOS || '3', 10);
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, 5) : 3;
}

function shouldVerifyWithVision(partialResults = [], config) {
  if (!config.apiKey) return false;
  if (config.provider === 'vision') return true;
  if (!partialResults.length) return true;
  const peak = Math.max(...partialResults.map((item) => Number(item.confidence) || 0));
  return peak < getVisionFallbackThreshold();
}

function collectRecognitionHints(partialResults = [], extraHints = []) {
  const hints = [...extraHints];
  for (const item of partialResults) {
    if (item.brandModel) hints.push(item.brandModel);
    if (Array.isArray(item.keywords)) hints.push(...item.keywords);
  }
  return [...new Set(hints.filter(Boolean))].slice(0, 12);
}

function describeDominantColor(dominant) {
  const { r, g, b } = dominant;
  if (r > 210 && g > 210 && b > 210) return '浅色/白色系车身';
  if (r < 70 && g < 70 && b < 70) return '深色/黑色系车身';
  if (r > g && r > b) return '偏红色系';
  if (b > r && b > g) return '偏蓝色系';
  if (g > r && g > b) return '偏绿色系';
  if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25) return '银灰/中性色车身';
  return `主色约 RGB(${r},${g},${b})`;
}

async function extractVisualFeatures(filePath, photo) {
  const img = sharp(filePath).rotate();
  const meta = await img.metadata();
  const { dominant } = await img.clone().resize(320, 320, { fit: 'inside' }).stats();
  const slotLabel = SLOT_LABELS[`${photo.category}/${photo.slotKey}`] || '车辆照片';
  const ratio = meta.width && meta.height ? (meta.width / meta.height) : 1;

  return {
    slotLabel,
    width: meta.width || 0,
    height: meta.height || 0,
    orientation: ratio > 1.15 ? '横向构图' : ratio < 0.85 ? '竖向构图' : '近方形构图',
    colorHint: describeDominantColor(dominant),
    publicUrl: photo.url && process.env.PUBLIC_BASE_URL
      ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}${photo.url}`
      : null,
  };
}

function buildChatRequestBody({ model, provider, prompt, imageBase64, jsonMode = true }) {
  const body = {
    model,
    messages: [],
    max_tokens: 260,
    temperature: 0.2,
  };

  if (provider === 'vision') {
    body.messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ];
  } else {
    body.messages = [{ role: 'user', content: prompt }];
    if (jsonMode) body.response_format = { type: 'json_object' };
    if (isDeepSeekEndpoint(process.env.VISION_API_URL || process.env.DEEPSEEK_API_URL || '')) {
      body.thinking = { type: 'disabled' };
    }
  }

  return body;
}

async function callChatApiDirect({ apiKey, apiUrl, model, provider, prompt, imageBase64, maxConfidence }) {
  if (!apiKey) return null;

  const timeoutMs = parseInt(process.env.VISION_TIMEOUT_MS || '45000', 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatRequestBody({ model, provider, prompt, imageBase64 })),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.code || res.statusText;
      throw new Error(msg || 'VISION_API_ERROR');
    }

    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c) => c.text || '').join('')
        : '';
    return normalizeRecognizeResult(extractJsonObject(text), { maxConfidence });
  } finally {
    clearTimeout(timer);
  }
}

async function callChatApi(params) {
  if (!params.apiKey) return null;
  return aiRequestQueue.run(() => callChatApiDirect(params), { label: 'vision-chat' });
}

async function callVisionRecognize(imageBase64, config) {
  const prompt = `你是二手车车型识别专家。请根据车辆照片识别品牌、车系、年款（上牌年份或改款年份）。
只返回 JSON：
{"brandModel":"品牌车系 年款 配置（可选）","year":2021,"confidence":0.85}
要求：
- brandModel 用中文，简洁，如「宝马X5 2021款」
- year 为 4 位整数年份；无法判断填 null
- confidence 为 0 到 1 的小数`;

  return callChatApi({
    ...config,
    provider: 'vision',
    prompt,
    imageBase64,
    maxConfidence: 0.98,
  });
}

async function callDeepSeekRecognize(features, config, { hints = [] } = {}) {
  const hintBlock = hints.length
    ? `\n识图线索（优先参考）：\n${hints.slice(0, 8).map((h) => `- ${h}`).join('\n')}`
    : '';

  const prompt = `你是资深二手车评估师。请根据以下车辆照片元信息，推测最可能的中文车型（品牌+车系+年款）。

照片信息：
- 拍摄位置：${features.slotLabel}
- 分辨率：${features.width} x ${features.height}（${features.orientation}）
- 色彩特征：${features.colorHint}
${features.publicUrl ? `- 图片地址：${features.publicUrl}` : ''}${hintBlock}

请结合中国市场主流二手车，给出最可能的识别结果。
只返回 JSON：
{"brandModel":"品牌车系 年款","year":2021,"confidence":0.45}
要求：
- brandModel 用中文，如「宝马X5 2021款」
- year 为 4 位整数；无法判断填 null
- confidence 不得超过 0.65（因未直接识图；有识图线索时可给到 0.55~0.65）`;

  return callChatApi({
    ...config,
    provider: 'deepseek',
    prompt,
    imageBase64: null,
    maxConfidence: hints.length ? 0.65 : 0.55,
  });
}

function wrapRecognizeResult(result, photo) {
  if (!result) return null;
  const weighted = applySlotWeight(result, photo);
  return refineRecognizeResult(weighted) || weighted;
}

async function recognizeWithBaiduImageSearch(photo, session = null) {
  if (!baiduImageSearch.isEnabled()) return null;

  const jpegBuffer = await prepareForRecognition(photo.filePath, {
    purpose: 'baidu',
    category: photo.category,
    slotKey: photo.slotKey,
  });

  const publicUrl = photo.url && process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}${photo.url}`
    : null;

  const result = await baiduImageSearch.recognizeFromImageBuffer(jpegBuffer, {
    mime: 'image/jpeg',
    filename: 'car.jpg',
    publicUrl,
    session,
  });

  return wrapRecognizeResult({
    brandModel: result.brandModel,
    year: result.year,
    confidence: result.confidence,
    source: result.source,
    photoId: photo.id,
    keywords: result.keywords,
  }, photo);
}

async function recognizeWithVisionPipeline(photo, config, { hints = [] } = {}) {
  const imageBase64 = await prepareImageBase64(photo.filePath, photo);

  if (config.provider === 'vision') {
    const visionResult = await callVisionRecognize(imageBase64, config);
    if (visionResult) {
      return wrapRecognizeResult({ ...visionResult, source: 'vision_api', photoId: photo.id }, photo);
    }
    return null;
  }

  try {
    const visionResult = await callVisionRecognize(imageBase64, { ...config, provider: 'vision' });
    if (visionResult) {
      return wrapRecognizeResult({ ...visionResult, source: 'vision_api', photoId: photo.id }, photo);
    }
  } catch (err) {
    const msg = String(err.message || '');
    if (!/image_url|unknown variant|multimodal|vision/i.test(msg)) {
      throw err;
    }
  }

  const features = await extractVisualFeatures(photo.filePath, photo);
  const deepseekResult = await callDeepSeekRecognize(features, config, { hints });
  if (deepseekResult) {
    return wrapRecognizeResult({ ...deepseekResult, source: 'deepseek_text', photoId: photo.id }, photo);
  }
  return null;
}

async function recognizeSelectedPhotos(selected, config) {
  const allResults = [];
  const baiduHints = [];
  let baiduSession = null;
  const baiduTargets = filterExteriorPhotos(selected);

  if (baiduImageSearch.isEnabled()) {
    try {
      baiduSession = await baiduImageSearch.bootstrapSession();
    } catch {
      baiduSession = null;
    }
  }

  if (baiduCarApi.isConfigured()) {
    const carTargets = baiduTargets.slice(0, 2);
    for (const photo of carTargets) {
      try {
        const imageBase64 = await prepareImageBase64(photo.filePath, photo);
        const carResult = await baiduCarApi.recognizeCar(imageBase64);
        const wrapped = wrapRecognizeResult({ ...carResult, photoId: photo.id }, photo);
        if (wrapped) allResults.push(wrapped);
      } catch (err) {
        if (process.env.BAIDU_CAR_API_STRICT === 'true') throw err;
      }
    }
  }

  if (baiduImageSearch.isEnabled()) {
    for (const photo of baiduTargets) {
      try {
        const baiduResult = await recognizeWithBaiduImageSearch(photo, baiduSession);
        if (baiduResult) {
          allResults.push(baiduResult);
          if (Array.isArray(baiduResult.keywords)) baiduHints.push(...baiduResult.keywords);
        }
      } catch (err) {
        if (Array.isArray(err.keywords)) baiduHints.push(...err.keywords);
        if (process.env.BAIDU_IMAGE_SEARCH_STRICT === 'true') throw err;
      }
    }
  }

  if (shouldVerifyWithVision(allResults, config)) {
    const uniqueHints = collectRecognitionHints(allResults, baiduHints);
    const visionTargets = selected.slice(0, getVisionPhotoLimit());
    for (const photo of visionTargets) {
      try {
        const visionResult = await recognizeWithVisionPipeline(photo, config, { hints: uniqueHints });
        if (visionResult) allResults.push(visionResult);
      } catch (err) {
        if (config.provider === 'vision') throw err;
      }
    }
  }

  if (!allResults.length) return null;
  return aggregateRecognizeResults(allResults);
}

async function recognize(photos = []) {
  const selected = pickPhotosForRecognition(filterExteriorPhotos(photos));
  if (!selected.length) throw new Error('NO_PHOTO');

  const primary = selected[0];
  const config = resolveVisionConfig();

  if (process.env.VISION_ALLOW_STUB === 'true' && !config.apiKey && !baiduCarApi.isConfigured()) {
    const stub = {
      brandModel: '宝马X5 2021款',
      year: 2021,
      confidence: 0.5,
      source: 'stub',
      photoId: primary.id,
    };
    if (selected.length > 1) {
      return aggregateRecognizeResults(
        selected.map((photo) => ({ ...stub, photoId: photo.id, confidence: 0.48 }))
      );
    }
    return { ...stub, photoCount: 1, matchedPhotoCount: 1, confidenceBoost: 0 };
  }

  const aggregated = await recognizeSelectedPhotos(selected, config);
  if (aggregated) return aggregated;

  throw new Error('RECOGNIZE_FAILED');
}

module.exports = {
  pickPhotoForRecognition,
  pickPhotosForRecognition,
  getRecognizeMaxPhotos,
  getVisionFallbackThreshold,
  getVisionPhotoLimit,
  shouldVerifyWithVision,
  collectRecognitionHints,
  prepareImageBase64,
  normalizeRecognizeResult,
  extractJsonObject,
  extractVisualFeatures,
  resolveVisionConfig,
  isDeepSeekEndpoint,
  recognize,
};
