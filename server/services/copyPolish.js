const { v4: uuidv4 } = require('uuid');
const aiRequestQueue = require('./aiRequestQueue');
const appSettings = require('./appSettings');

const SELLING_CATEGORIES = ['appearance', 'interior', 'performance', 'value', 'resale', 'maintenance'];

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - 1) + '…';
}

function resolveLlmConfig() {
  const ai = appSettings.getEffectiveAi();
  return {
    apiKey: ai.apiKey,
    apiUrl: ai.apiUrl,
    model: ai.model,
    timeoutMs: ai.timeoutMs,
    sellingLlmStrict: ai.sellingLlmStrict,
  };
}

function extractJsonObject(text = '') {
  const raw = String(text).trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function callChatApiDirect({ prompt, maxTokens = 800, temperature = 0.35, jsonMode = true }) {
  const { apiKey, apiUrl, model, timeoutMs } = resolveLlmConfig();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  if (/deepseek\.com/i.test(apiUrl)) body.thinking = { type: 'disabled' };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.code || res.statusText;
      throw new Error(msg || 'LLM_API_ERROR');
    }
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  } finally {
    clearTimeout(timer);
  }
}

async function callChatApi(params) {
  const { apiKey } = resolveLlmConfig();
  if (!apiKey) return null;
  return aiRequestQueue.run(() => callChatApiDirect(params), { label: 'llm-chat' });
}

function normalizeSellingPoint(item = {}) {
  const text = String(item.text || item.title || '').trim();
  if (!text || text.length < 2 || text.length > 24) return null;
  const category = SELLING_CATEGORIES.includes(item.category) ? item.category : 'value';
  const emoji = String(item.emoji || '✨').trim().slice(0, 4) || '✨';
  return {
    id: item.id || `sp_ai_${uuidv4().slice(0, 8)}`,
    category,
    text,
    emoji,
    source: 'ai',
  };
}

function localGenerateSellingPoints(rawText = '', brandModel = '', limit = 10) {
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  const name = brandModel || (cleaned.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,16}/)?.[0] || '本产品');
  const points = [];
  const seen = new Set();

  const addPoint = (text, emoji = '✨', category = 'general') => {
    const value = String(text).replace(/\s+/g, ' ').trim().slice(0, 24);
    if (value.length < 4 || seen.has(value) || points.length >= limit) return;
    seen.add(value);
    points.push(normalizeSellingPoint({ text: value, emoji, category }));
  };

  cleaned.split(/[。！？；\n,，、]/).forEach((part) => {
    const seg = part.trim();
    if (seg.length >= 4) addPoint(seg);
  });

  if (/万|价格|优惠|特惠|折扣/.test(cleaned)) addPoint('价格优惠，欢迎咨询', '💰', 'value');
  if (/全新|正品|品质|保证|质保/.test(cleaned)) addPoint('品质可靠，放心选购', '✅', 'quality');
  if (/包邮|发货|现货|库存/.test(cleaned)) addPoint('现货供应，发货及时', '📦', 'service');

  if (!points.length) {
    addPoint(`${name}，详情欢迎咨询`, '📦', 'general');
    addPoint('支持进一步了解与沟通', '📞', 'service');
  }

  return points.filter(Boolean).slice(0, limit);
}

async function generateSellingPointsFromInput(rawText = '', options = {}) {
  const {
    brandModel = '',
    priceWan = null,
    limit = 12,
  } = options;
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  if (!cleaned && !brandModel) {
    throw new Error('EMPTY_INPUT');
  }

  const start = Date.now();
  const priceHint = Number.isFinite(priceWan) ? `售价约 ${priceWan} 万元。` : '';
  const prompt = `你是通用产品销售文案助手。请根据以下产品描述，提炼总结 ${Math.min(limit, 12)} 条核心要点，用于长图展示与朋友圈推广。

产品信息：
${brandModel ? `- 产品名称：${brandModel}` : ''}
${priceHint}
- 原始描述：${cleaned || '（用户未补充描述）'}

要求：
1. 要点应忠实于原描述，提炼关键信息，不臆造未提及的内容
2. 每条 4-20 个汉字，简洁清晰，便于快速阅读
3. category 只能是：general, quality, feature, value, service
4. 只返回 JSON：
{"points":[{"text":"限时特惠","emoji":"💰","category":"value"}]}`;

  try {
    const content = await callChatApi({ prompt, maxTokens: 700, temperature: 0.4 });
    if (content) {
      const parsed = extractJsonObject(content);
      const points = (parsed?.points || [])
        .map(normalizeSellingPoint)
        .filter(Boolean)
        .slice(0, limit);
      if (points.length) {
        return {
          points,
          source: 'llm',
          durationMs: Date.now() - start,
        };
      }
    }
  } catch (err) {
    if (resolveLlmConfig().sellingLlmStrict) throw err;
  }

  const points = localGenerateSellingPoints(cleaned, brandModel, limit);
  return {
    points,
    source: 'local_template',
    durationMs: Date.now() - start,
  };
}

function localPolishDescription(rawText, brandModel = '') {
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  const brand = brandModel || (cleaned.match(/[\u4e00-\u9fa5A-Za-z0-9]+/)?.[0] || '精品车源');

  const highlights = [];
  if (/4[Ss]|[Ss]店|保养/.test(cleaned)) highlights.push('全程4S店保养记录齐全');
  if (/车衣|隐形/.test(cleaned)) highlights.push('加装隐形车衣');
  if (/电尾门|踏板|改装|加装/.test(cleaned)) highlights.push('多项实用加装，配置到位');
  if (/公里|里程|万/.test(cleaned)) highlights.push('低里程精品车况');
  if (/内饰|磨损/.test(cleaned)) highlights.push('内饰如新零磨损');

  const priceMatch = cleaned.match(/(\d+\.?\d*)\s*万/);
  const pricePart = priceMatch ? `现仅需${priceMatch[1]}万即可拥有` : '价格美丽，支持分期';

  const base = `【${brand}】${cleaned.slice(0, 40)}`;
  const extra = highlights.length ? `${highlights.join('，')}。` : '';
  const ending = `${pricePart} 支持第三方检测 随时看车`;

  return truncate(`${base}。${extra}${ending}`, 100);
}

async function polishDescriptionWithLlm(rawText, brandModel = '', maxLength = 100) {
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  if (!cleaned) throw new Error('EMPTY_INPUT');

  const prompt = `你是二手车销售文案专家。请将以下车辆描述润色为适合朋友圈发布的专业文案，100字以内，语气真诚有感染力，突出车况亮点与购买理由。

${brandModel ? `车型：${brandModel}\n` : ''}原文：${cleaned}

只返回 JSON：{"polished":"润色后的文案"}`;

  const content = await callChatApi({ prompt, maxTokens: 260, temperature: 0.5 });
  if (content) {
    const parsed = extractJsonObject(content);
    const polished = String(parsed?.polished || '').trim();
    if (polished) return truncate(polished, maxLength);
  }
  return null;
}

function localPolishSellingPoints(points) {
  const lines = points.map((p) => p.text);
  return truncate(`推荐理由：${lines.join(' · ')} 感兴趣的朋友欢迎私信咨询！`, 120);
}

async function polishSync(req) {
  const { scene, rawText, sellingPointIds, style, maxLength = 100, brandModel = '' } = req;
  const start = Date.now();

  let polished;
  let source = 'local_template';

  if (scene === 'selling_points_combo' && sellingPointIds?.length) {
    polished = localPolishSellingPoints(
      sellingPointIds.map((t) => ({ text: t.text || t, emoji: '✨' }))
    );
  } else if (scene === 'vehicle_description') {
    try {
      const llmPolished = await polishDescriptionWithLlm(rawText, brandModel, maxLength);
      if (llmPolished) {
        polished = llmPolished;
        source = 'llm';
      }
    } catch (err) {
      if (resolveLlmConfig().sellingLlmStrict) throw err;
    }
    if (!polished) polished = localPolishDescription(rawText, brandModel);
  } else {
    polished = localPolishDescription(rawText, brandModel);
  }

  if (maxLength) polished = truncate(polished, maxLength);

  return {
    polished,
    polishedText: polished,
    original: rawText,
    source,
    durationMs: Date.now() - start,
    style: style || 'default',
  };
}

module.exports = {
  polishSync,
  generateSellingPointsFromInput,
  localPolishDescription,
  localPolishSellingPoints,
  localGenerateSellingPoints,
  resolveLlmConfig,
  callChatApi,
  extractJsonObject,
};
