const fs = require('fs');
const vm = require('vm');
const { normalizeRecognizeResult } = require('./recognizeNormalize');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ACS_SCRIPT_URL = 'https://dlswbr.baidu.com/heicha/mm/2033/acs-2033.js?_=247369';

const CAR_BRANDS = [
  '阿维塔', '埃安', '奥迪', '宝马', '奔驰', '保时捷', '别克', '比亚迪', '宝骏', '标致',
  '宾利', '大众', '道奇', '东风', '法拉利', '丰田', '福特', '广汽传祺', '传祺', '哈弗',
  '海马', '红旗', '本田', '吉利', '捷豹', '吉普', 'Jeep', '凯迪拉克', '克莱斯勒', '兰博基尼',
  '路虎', '林肯', '领克', '马自达', '玛莎拉蒂', '名爵', '迷你', 'MINI', '三菱', '蔚来',
  '日产', '荣威', '赛力斯', '问界', '三菱', '斯柯达', '斯巴鲁', '特斯拉', '沃尔沃', '五菱',
  '现代', '雪佛兰', '雪铁龙', '小鹏', '理想', '一汽', '英菲尼迪', '长安', '长城', '奇瑞',
  'smart', 'Smart', '极氪', '岚图', '腾势', '欧拉', '哪吒', '零跑', '深蓝', '智己',
];

let cachedAcsScript = null;
let cachedAcsScriptAt = 0;

function isEnabled() {
  return process.env.BAIDU_IMAGE_SEARCH_ENABLED !== 'false';
}

function decodeWd(value = '') {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' ')).trim();
  } catch {
    return String(value).trim();
  }
}

function collectCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const raw = response.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(/,(?=[^;]+?=)/).map((c) => c.split(';')[0].trim()).join('; ');
}

async function fetchAcsScript() {
  const ttl = parseInt(process.env.BAIDU_ACS_SCRIPT_TTL_MS || '3600000', 10);
  if (cachedAcsScript && Date.now() - cachedAcsScriptAt < ttl) {
    return cachedAcsScript;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(ACS_SCRIPT_URL, {
      headers: { 'User-Agent': UA, Referer: 'https://image.baidu.com/' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('BAIDU_ACS_SCRIPT_FETCH_FAILED');
    cachedAcsScript = await res.text();
    cachedAcsScriptAt = Date.now();
    return cachedAcsScript;
  } finally {
    clearTimeout(timer);
  }
}

function generateAcsToken(cookie = '') {
  const script = cachedAcsScript;
  if (!script) return process.env.BAIDU_ACS_TOKEN || null;

  const sandbox = {
    window: {},
    document: {
      cookie,
      referrer: 'https://image.baidu.com/',
      createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
      getElementsByTagName: () => [],
    },
    navigator: {
      userAgent: UA,
      platform: 'Win32',
      language: 'zh-CN',
    },
    location: { href: 'https://image.baidu.com/', host: 'image.baidu.com', protocol: 'https:' },
    screen: { width: 1920, height: 1080 },
    history: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Uint8Array,
    XMLHttpRequest() {
      this.open = () => {};
      this.send = () => {};
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { timeout: 10000 });
  const acs = sandbox.window.ACS_2033;
  if (!acs || typeof acs.gst !== 'function') return process.env.BAIDU_ACS_TOKEN || null;
  try {
    return acs.gst();
  } catch {
    return process.env.BAIDU_ACS_TOKEN || null;
  }
}

async function bootstrapSession() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://image.baidu.com/', {
      headers: { 'User-Agent': UA, Referer: 'https://image.baidu.com/' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('BAIDU_SESSION_FAILED');
    const cookie = collectCookies(res);
    await fetchAcsScript();
    const token = process.env.BAIDU_ACS_TOKEN || generateAcsToken(cookie);
    return { cookie, token };
  } finally {
    clearTimeout(timer);
  }
}

function buildMultipartBody(fields, fileField, fileBuffer, filename, mime) {
  const boundary = `----BaiduImage${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const [name, value] of fields) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  ));
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    boundary,
    body: Buffer.concat(chunks),
  };
}

async function uploadImageBuffer(imageBuffer, { cookie, token, mime = 'image/jpeg', filename = 'car.jpg' }) {
  const uptime = Date.now();
  const fields = [
    ['tn', 'pc'],
    ['from', 'pc'],
    ['image_source', 'PC_UPLOAD_SEARCH_FILE'],
    ['range', '{"page_from":"searchResult"}'],
  ];
  const { boundary, body } = buildMultipartBody(fields, 'image', imageBuffer, filename, mime);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parseInt(process.env.BAIDU_IMAGE_TIMEOUT_MS || '25000', 10));
  try {
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
      'User-Agent': UA,
      Referer: 'https://image.baidu.com/',
      Origin: 'https://image.baidu.com',
      Accept: '*/*',
    };
    if (cookie) headers.Cookie = cookie;
    if (token) headers['Acs-Token'] = token;

    const res = await fetch(`https://graph.baidu.com/upload?uptime=${uptime}`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.status !== 0 || !data?.data?.url) {
      const msg = data?.msg || 'BAIDU_UPLOAD_FAILED';
      throw new Error(msg);
    }
    return data.data.url;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadImageByPublicUrl(imageUrl, session) {
  const uptime = Date.now();
  const fields = [
    ['tn', 'pc'],
    ['from', 'pc'],
    ['image_source', 'PC_UPLOAD_URL'],
    ['range', '{"page_from":"searchResult"}'],
    ['image', imageUrl],
  ];
  const boundary = `----BaiduUrl${Date.now()}`;
  const body = Buffer.concat(fields.map(([name, value]) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  )).concat([Buffer.from(`--${boundary}--\r\n`)]));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parseInt(process.env.BAIDU_IMAGE_TIMEOUT_MS || '25000', 10));
  try {
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
      'User-Agent': UA,
      Referer: 'https://image.baidu.com/',
      Origin: 'https://image.baidu.com',
      Accept: '*/*',
    };
    if (session.cookie) headers.Cookie = session.cookie;
    if (session.token) headers['Acs-Token'] = session.token;

    const res = await fetch(`https://graph.baidu.com/upload?uptime=${uptime}`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.status !== 0 || !data?.data?.url) {
      throw new Error(data?.msg || 'BAIDU_URL_UPLOAD_FAILED');
    }
    return data.data.url;
  } finally {
    clearTimeout(timer);
  }
}

function extractWdFromUrl(url = '') {
  const match = String(url).match(/[?&]wd=([^&]+)/i);
  return match ? decodeWd(match[1]) : '';
}

function extractTextsFromSearchHtml(html = '', resultUrl = '') {
  const texts = [];
  const wdFromUrl = extractWdFromUrl(resultUrl);
  if (wdFromUrl) texts.push(wdFromUrl);

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) texts.push(titleMatch[1].trim());

  const keywordPatterns = [
    /"keyword"\s*:\s*"([^"]+)"/gi,
    /"wd"\s*:\s*"([^"]+)"/gi,
    /"tag"\s*:\s*"([^"]+)"/gi,
    /"brief"\s*:\s*"([^"]{2,120})"/gi,
    /"cardName"\s*:\s*"([^"]{2,80})"/gi,
    /"text"\s*:\s*"([^"]{2,80})"/gi,
    /"title"\s*:\s*"([^"]{2,120})"/gi,
    /"fromPageTitle"\s*:\s*"([^"]{2,120})"/gi,
    /wd=([^&"']+)/gi,
    />([^<]{2,40}(?:宝马|奔驰|奥迪|大众|丰田|本田|特斯拉|比亚迪|哈弗|吉利|长安|蔚来|理想|小鹏)[^<]{0,40})</gi,
  ];
  for (const pattern of keywordPatterns) {
    let hit;
    while ((hit = pattern.exec(html)) !== null) {
      const text = decodeWd(hit[1]).replace(/\\u([\dA-Fa-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
      if (text && text.length >= 2) texts.push(text);
    }
  }

  return [...new Set(texts.filter(Boolean))];
}

const NOISE_PATTERN = /明星|演员|人脸|美女|帅哥|表情包|头像|壁纸|动漫|卡通|风景|美食|宠物|花卉|商标|logo/i;

function cleanCandidateText(text = '') {
  const cleaned = String(text)
    .replace(/[\x00-\x1f]/g, '')
    .replace(/图片来源[:：]?/g, '')
    .replace(/百度图片|相似图片|全网识图|识图搜索|百度识图/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || NOISE_PATTERN.test(cleaned)) return '';
  return cleaned;
}

function normalizeCandidateKey(brandModel = '', year = null) {
  const compact = String(brandModel)
    .replace(/\s+/g, '')
    .replace(/款$/g, '')
    .toLowerCase();
  const y = year || (compact.match(/(20\d{2})/)?.[1] || '');
  const series = compact.replace(/(20\d{2})款?/g, '').replace(/款$/g, '');
  return `${series}|${y}`;
}

function buildBrandRegex() {
  const escaped = CAR_BRANDS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('|')})[\\s·-]*([A-Za-z0-9\u4e00-\u9fa5]{0,12})`, 'i');
}

const BRAND_MODEL_RE = buildBrandRegex();
const YEAR_RE = /(20\d{2})\s*款?/;

function scoreCandidate(text) {
  const cleaned = cleanCandidateText(text);
  if (!cleaned) return null;

  const match = cleaned.match(BRAND_MODEL_RE);
  if (!match) return null;

  const brand = match[1];
  const tail = (match[2] || '').trim();
  let brandModel = tail ? `${brand}${tail}` : brand;
  brandModel = brandModel.replace(/\s+/g, '');

  const yearMatch = cleaned.match(YEAR_RE);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  let confidence = 0.62;
  if (tail) confidence += 0.08;
  if (year) confidence += 0.05;
  if (/款|版|型|轿车|SUV|MPV|越野/i.test(cleaned)) confidence += 0.04;
  if (/汽车|车型|二手车|实拍|外观/i.test(cleaned)) confidence += 0.03;

  return {
    brandModel: year ? `${brandModel} ${year}款` : brandModel,
    year,
    confidence: Math.min(0.88, confidence),
    raw: cleaned,
  };
}

function extractVehicleModel(texts = []) {
  const candidates = [];
  for (const text of texts) {
    const scored = scoreCandidate(text);
    if (scored) candidates.push(scored);
  }
  if (!candidates.length) return null;

  const groups = new Map();
  for (const item of candidates) {
    const key = normalizeCandidateKey(item.brandModel, item.year);
    if (!groups.has(key)) {
      groups.set(key, { items: [], votes: 0, peak: 0 });
    }
    const group = groups.get(key);
    group.items.push(item);
    group.votes += 1;
    group.peak = Math.max(group.peak, item.confidence);
  }

  let winner = null;
  for (const [key, group] of groups.entries()) {
    const score = group.votes * 100 + group.peak;
    if (!winner || score > winner.score) {
      winner = { key, score, group };
    }
  }

  const best = winner.group.items.sort((a, b) => b.confidence - a.confidence)[0];
  const voteBonus = Math.min(0.14, Math.max(0, winner.group.votes - 1) * 0.05);
  return normalizeRecognizeResult({
    brandModel: best.brandModel,
    year: best.year,
    confidence: Math.min(0.92, best.confidence + voteBonus),
  }, { maxConfidence: 0.92 });
}

async function fetchSearchTexts(resultUrl, session) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parseInt(process.env.BAIDU_IMAGE_TIMEOUT_MS || '25000', 10));
  try {
    const headers = { 'User-Agent': UA, Referer: 'https://image.baidu.com/' };
    if (session.cookie) headers.Cookie = session.cookie;
    if (session.token) headers['Acs-Token'] = session.token;

    const res = await fetch(resultUrl, { headers, signal: controller.signal });
    const html = await res.text();
    return extractTextsFromSearchHtml(html, resultUrl);
  } finally {
    clearTimeout(timer);
  }
}

async function uploadForSearch(imageBuffer, session, options = {}) {
  const uploadOpts = {
    cookie: session.cookie,
    token: session.token,
    mime: options.mime || 'image/jpeg',
    filename: options.filename || 'car.jpg',
  };

  if (options.publicUrl && process.env.BAIDU_PREFER_URL_UPLOAD !== 'false') {
    try {
      return await uploadImageByPublicUrl(options.publicUrl, session);
    } catch {
      // fallback to direct buffer upload
    }
  }

  try {
    return await uploadImageBuffer(imageBuffer, uploadOpts);
  } catch (err) {
    if (options.publicUrl) {
      return await uploadImageByPublicUrl(options.publicUrl, session);
    }
    throw err;
  }
}

async function recognizeFromImageBuffer(imageBuffer, options = {}) {
  const maxAttempts = parseInt(process.env.BAIDU_IMAGE_RETRY || '2', 10);
  let lastError = null;

  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    const session = attempt === 0 && options.session
      ? options.session
      : await bootstrapSession();
    try {
      const resultUrl = await uploadForSearch(imageBuffer, session, options);
      const texts = await fetchSearchTexts(resultUrl, session);
      const parsed = extractVehicleModel(texts);
      if (!parsed) {
        const err = new Error('BAIDU_PARSE_FAILED');
        err.keywords = texts.slice(0, 12);
        throw err;
      }

      return {
        ...parsed,
        source: 'baidu_image',
        keywords: texts.slice(0, 12),
        resultUrl,
      };
    } catch (err) {
      lastError = err;
      const retriable = /Reject|BAIDU_UPLOAD_FAILED|BAIDU_URL_UPLOAD_FAILED|BAIDU_SESSION_FAILED/i
        .test(String(err.message || ''));
      if (!retriable || attempt >= maxAttempts - 1) throw err;
    }
  }

  throw lastError || new Error('BAIDU_IMAGE_FAILED');
}

async function recognizeFromFile(filePath, options = {}) {
  const buf = await fs.promises.readFile(filePath);
  return recognizeFromImageBuffer(buf, {
    ...options,
    mime: options.mime || 'image/jpeg',
    filename: options.filename || 'car.jpg',
  });
}

module.exports = {
  isEnabled,
  bootstrapSession,
  generateAcsToken,
  uploadImageBuffer,
  extractTextsFromSearchHtml,
  extractVehicleModel,
  normalizeCandidateKey,
  uploadForSearch,
  recognizeFromImageBuffer,
  recognizeFromFile,
  CAR_BRANDS,
};
