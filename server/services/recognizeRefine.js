const { CAR_BRANDS } = require('./baiduImageSearch');

const NOISE_PATTERN = /明星|演员|人脸|美女|帅哥|表情包|头像|壁纸|动漫|卡通|风景|美食|宠物|猫|狗|花卉/i;
const BRAND_ORDER = [...CAR_BRANDS].sort((a, b) => b.length - a.length);

const SLOT_WEIGHTS = {
  'exterior/front': 1.18,
  'exterior/left45': 1.12,
  'exterior/right45': 1.12,
  'exterior/left': 1.06,
  'exterior/right': 1.06,
  'exterior/rear': 1.04,
  'interior/center_console': 0.82,
  'interior/screen': 0.78,
};

function detectBrand(text = '') {
  const compact = String(text).replace(/\s+/g, '');
  for (const brand of BRAND_ORDER) {
    if (compact.includes(brand) || text.includes(brand)) return brand;
  }
  return '';
}

function normalizeBrandModelText(brandModel = '', year = null) {
  const raw = String(brandModel).trim();
  if (!raw || NOISE_PATTERN.test(raw)) return null;

  const brand = detectBrand(raw);
  if (!brand) return null;

  let body = raw.replace(new RegExp(brand, 'i'), '').trim();
  body = body.replace(/(20\d{2})\s*款?/g, '').replace(/款$/g, '').trim();
  body = body.replace(/^[\s·\-—]+/, '').replace(/[\s·\-—]+$/, '');
  if (!body) body = '';

  const resolvedYear = year ?? (raw.match(/(20\d{2})/)?.[1] ? parseInt(raw.match(/(20\d{2})/)[1], 10) : null);
  const series = body.replace(/\s+/g, '');
  const label = series ? `${brand}${series}` : brand;
  return {
    brandModel: resolvedYear ? `${label} ${resolvedYear}款` : label,
    year: resolvedYear,
    brand,
    series,
  };
}

function getSlotWeight(photo = {}) {
  const key = `${photo.category}/${photo.slotKey}`;
  return SLOT_WEIGHTS[key] || 1;
}

function applySlotWeight(result, photo) {
  if (!result) return null;
  const weight = getSlotWeight(photo);
  const confidence = Number(result.confidence);
  if (!Number.isFinite(confidence)) return result;
  return {
    ...result,
    confidence: Math.min(0.98, Math.round(confidence * weight * 1000) / 1000),
    slotWeight: weight,
  };
}

function refineRecognizeResult(result) {
  if (!result?.brandModel) return null;
  const normalized = normalizeBrandModelText(result.brandModel, result.year);
  if (!normalized) return null;
  return {
    ...result,
    brandModel: normalized.brandModel,
    year: normalized.year ?? result.year,
  };
}

function filterExteriorPhotos(photos = []) {
  const exterior = photos.filter((p) => p.category === 'exterior');
  return exterior.length ? exterior : photos;
}

module.exports = {
  SLOT_WEIGHTS,
  detectBrand,
  normalizeBrandModelText,
  getSlotWeight,
  applySlotWeight,
  refineRecognizeResult,
  filterExteriorPhotos,
};
