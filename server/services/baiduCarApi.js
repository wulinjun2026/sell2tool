const { normalizeRecognizeResult } = require('./recognizeNormalize');

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function isConfigured() {
  return Boolean(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY);
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60000) {
    return cachedToken;
  }

  const key = process.env.BAIDU_API_KEY;
  const secret = process.env.BAIDU_SECRET_KEY;
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || 'BAIDU_TOKEN_FAILED');
    }
    cachedToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + (data.expires_in || 2592000) * 1000;
    return cachedToken;
  } finally {
    clearTimeout(timer);
  }
}

function parseYearRange(yearText) {
  if (!yearText) return null;
  const nums = String(yearText).match(/20\d{2}/g);
  if (!nums?.length) return null;
  return parseInt(nums[nums.length - 1], 10);
}

async function recognizeCar(imageBase64) {
  if (!isConfigured()) return null;

  const token = await getAccessToken();
  const body = new URLSearchParams({ image: imageBase64 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parseInt(process.env.BAIDU_IMAGE_TIMEOUT_MS || '25000', 10));
  try {
    const res = await fetch(`https://aip.baidubce.com/rest/2.0/image-classify/v1/car?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error_code) {
      throw new Error(data.error_msg || 'BAIDU_CAR_API_FAILED');
    }

    const top = data.result?.[0];
    if (!top?.name) return null;

    const year = parseYearRange(top.year);
    const brandModel = year ? `${top.name} ${year}款` : top.name;
    const confidence = Number(top.score);
    const normalized = normalizeRecognizeResult({
      brandModel,
      year,
      confidence: Number.isFinite(confidence) ? confidence : 0.8,
    }, { maxConfidence: 0.98 });

    if (!normalized) return null;
    return {
      ...normalized,
      source: 'baidu_car_api',
      color: top.color || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isConfigured,
  getAccessToken,
  recognizeCar,
};
