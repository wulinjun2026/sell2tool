// 本地文案润色与卖点生成（从 server/services/copyPolish.js 迁移）
// 纯模板匹配，不依赖 LLM

const SELLING_CATEGORIES = ['appearance', 'interior', 'performance', 'value', 'resale', 'maintenance'];

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - 1) + '…';
}

function normalizeSellingPoint(item = {}) {
  const text = String(item.text || item.title || '').trim();
  if (!text || text.length < 2 || text.length > 24) return null;
  const category = SELLING_CATEGORIES.includes(item.category) ? item.category : 'value';
  const emoji = String(item.emoji || '✨').trim().slice(0, 4) || '✨';
  return {
    id: item.id || `sp_local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    category,
    text,
    emoji,
    source: 'local',
  };
}

/** 从文本中本地生成卖点 */
export function generateSellingPointsLocal(rawText = '', brandModel = '', limit = 10) {
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  const name = brandModel || (cleaned.match(/[一-龥A-Za-z0-9·]{2,16}/)?.[0] || '本产品');
  const points = [];
  const seen = new Set();

  const addPoint = (text, emoji = '✨', category = 'general') => {
    const value = String(text).replace(/\s+/g, ' ').trim().slice(0, 24);
    if (value.length < 4 || seen.has(value) || points.length >= limit) return;
    seen.add(value);
    const normalized = normalizeSellingPoint({ text: value, emoji, category });
    if (normalized) points.push(normalized);
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

/** 本地润色描述文本 */
export function polishDescriptionLocal(rawText, brandModel = '') {
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  const brand = brandModel || (cleaned.match(/[一-龥A-Za-z0-9]+/)?.[0] || '精品车源');

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

/** 本地润色卖点组合 */
export function polishSellingPointsLocal(points) {
  const lines = points.map((p) => p.text);
  return truncate(`推荐理由：${lines.join(' · ')} 感兴趣的朋友欢迎私信咨询！`, 120);
}