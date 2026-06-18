const { callChatApi, extractJsonObject } = require('./copyPolish');

const BRAND_NAMES = [
  '宝马', '奔驰', '奥迪', '丰田', '本田', '大众', '特斯拉', '比亚迪', '蔚来', '理想', '小鹏',
  '路虎', '保时捷', '沃尔沃', '凯迪拉克', '雷克萨斯', '别克', '雪佛兰', '福特', '马自达', '日产',
  '现代', '起亚', '五菱', '吉利', '哈弗', '长安', '传祺', '荣威', '名爵', '领克', '极氪', '问界', '小米',
];

function normalizePriceWan(value) {
  if (value == null || value === '' || value === false) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n >= 10000) return null;
  return Math.round(n * 100) / 100;
}

function normalizeBrandModel(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function localExtractVehicleInfo(rawText = '') {
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  if (!cleaned) return { brandModel: '', priceWan: null, source: 'local' };

  let priceWan = null;
  const pricePatterns = [
    /(?:全款|售价|价格|仅需|只要|现价|特惠|开走)\s*(\d+\.?\d*)\s*万/,
    /(\d+\.?\d*)\s*万(?:元)?(?:[^\d]|$)/,
  ];
  for (const re of pricePatterns) {
    const match = cleaned.match(re);
    if (match) {
      priceWan = normalizePriceWan(match[1]);
      if (priceWan != null) break;
    }
  }

  let brandModel = '';
  for (const brand of BRAND_NAMES) {
    const idx = cleaned.indexOf(brand);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 6);
    const snippet = cleaned.slice(start, idx + 24);
    const yearMatch = snippet.match(/(\d{2,4}年)/);
    const modelMatch = snippet.match(new RegExp(`${brand}[\\u4e00-\\u9fa5A-Za-z0-9·]{0,18}`));
    brandModel = `${yearMatch ? yearMatch[1] : ''}${modelMatch ? modelMatch[0] : brand}`.trim();
    break;
  }

  if (!brandModel) {
    const head = cleaned.match(/^(.{2,24}?)(?:[，,。！？；\s]|$)/);
    if (head?.[1]) brandModel = head[1].trim();
  }

  return {
    brandModel: normalizeBrandModel(brandModel),
    priceWan,
    source: 'local',
  };
}

async function extractVehicleInfoFromDescription(rawText = '') {
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  if (!cleaned) throw new Error('EMPTY_INPUT');

  const start = Date.now();
  const prompt = `你是产品信息提取助手。请从以下产品描述中提取「产品名称」和「售价（万元）」。

描述：
${cleaned}

规则：
1. brandModel：简洁准确的产品名称，如「10年款旗舰套装」「无线蓝牙耳机 Pro」
2. priceWan：描述中明确出现的售价（单位：万元），如「2.55万」→ 2.55；若未提及具体售价则为 null
3. 面议、价格美丽、优惠咨询等不算具体售价，priceWan 应为 null
4. 只返回 JSON：{"brandModel":"无线蓝牙耳机 Pro","priceWan":2.55}`;

  try {
    const content = await callChatApi({ prompt, maxTokens: 180, temperature: 0.2 });
    if (content) {
      const parsed = extractJsonObject(content);
      const brandModel = normalizeBrandModel(parsed?.brandModel);
      const priceWan = normalizePriceWan(parsed?.priceWan);
      if (brandModel || priceWan != null) {
        return {
          brandModel,
          priceWan,
          source: 'llm',
          durationMs: Date.now() - start,
        };
      }
    }
  } catch (err) {
    if (process.env.SELLING_LLM_STRICT === 'true') throw err;
  }

  const local = localExtractVehicleInfo(cleaned);
  return {
    ...local,
    durationMs: Date.now() - start,
  };
}

module.exports = {
  extractVehicleInfoFromDescription,
  localExtractVehicleInfo,
  normalizePriceWan,
};
