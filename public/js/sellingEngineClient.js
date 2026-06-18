// 本地卖点推荐引擎（从 server/services/sellingEngine.js 迁移）
// 纯计算逻辑，包含品牌元数据、打分算法、内置卖点数据

const BRAND_META = {
  宝马: { tags: ['宝马', '德系', '豪华', '四驱'], tier: 'luxury' },
  奔驰: { tags: ['奔驰', '德系', '豪华', '商务'], tier: 'luxury' },
  奔驰: { tags: ['奔驰', '德系', '豪华', '商务'], tier: 'luxury' },
  奥迪: { tags: ['奥迪', '德系', '豪华', '四驱'], tier: 'luxury' },
  保时捷: { tags: ['保时捷', '德系', '豪华', '动力'], tier: 'luxury' },
  雷克萨斯: { tags: ['雷克萨斯', '日系', '豪华', '保值'], tier: 'luxury' },
  路虎: { tags: ['路虎', '四驱', 'SUV', '豪华'], tier: 'luxury' },
  沃尔沃: { tags: ['沃尔沃', '安全', '豪华'], tier: 'premium' },
  凯迪拉克: { tags: ['凯迪拉克', '豪华', '配置'], tier: 'premium' },
  丰田: { tags: ['丰田', '日系', '保值', '耐用', '热门'], tier: 'mainstream' },
  本田: { tags: ['本田', '日系', '耐用', '热门'], tier: 'mainstream' },
  日产: { tags: ['日产', '日系', '舒适'], tier: 'mainstream' },
  马自达: { tags: ['马自达', '日系', '操控'], tier: 'mainstream' },
  大众: { tags: ['大众', '德系', '热门', '流通'], tier: 'mainstream' },
  别克: { tags: ['别克', '商务', '舒适'], tier: 'mainstream' },
  特斯拉: { tags: ['特斯拉', '新能源', '电池', '准新', '热门'], tier: 'ev', isEv: true },
  比亚迪: { tags: ['比亚迪', '新能源', '电池', '性价比', '热门'], tier: 'ev', isEv: true },
  蔚来: { tags: ['蔚来', '新能源', '电池', '配置'], tier: 'ev', isEv: true },
  理想: { tags: ['理想', '新能源', '空间', '配置'], tier: 'ev', isEv: true },
  小鹏: { tags: ['小鹏', '新能源', '电池', '配置'], tier: 'ev', isEv: true },
  埃安: { tags: ['埃安', '新能源', '电池', '性价比'], tier: 'ev', isEv: true },
  问界: { tags: ['问界', '新能源', '配置', '热门'], tier: 'ev', isEv: true },
  哈弗: { tags: ['哈弗', 'SUV', '性价比'], tier: 'suv' },
  吉利: { tags: ['吉利', '性价比', '热门'], tier: 'mainstream' },
  长安: { tags: ['长安', '性价比', '热门'], tier: 'mainstream' },
  五菱: { tags: ['五菱', '性价比', '热门', '流通'], tier: 'value' },
  传祺: { tags: ['传祺', '空间', '性价比'], tier: 'mainstream' },
};

const SUV_HINTS = /x[1-7]|q[3-8]|gl[csebak]|揽胜|发现|卡宴|cayenne|macan|汉兰达|rav4|cr-v|途观|探岳|奇骏|逍客|冠道|ur-v|昂科威|途昂|牧马人|大切|model\s*y|唐|宋|元|问界|理想l|蔚来es|领克0[1-9]|传祺gs|星越|博越|h6|h9|suv/i;
const SEDAN_HINTS = /3系|5系|7系|c级|e级|s级|a4|a6|帕萨特|迈腾|凯美瑞|雅阁|天籁|君越|蒙迪欧|model\s*3|汉|秦|海豹|轿车/i;
const MPV_HINTS = /gl8|埃尔法|塞纳|奥德赛|艾力绅|传祺m8|威然|嘉际|mpv/i;

const TIER_CATEGORY_BOOST = {
  luxury: { interior: 14, performance: 12, appearance: 10 },
  premium: { interior: 10, performance: 8 },
  ev: { performance: 16, value: 10, interior: 8 },
  suv: { interior: 12, appearance: 8, performance: 6 },
  mainstream: { value: 10, resale: 8, performance: 6 },
  value: { value: 14, resale: 10 },
};

// 内置卖点数据（32 条，从 server/db.js SEED_POINTS 迁移）
const BUILTIN_SELLING_POINTS = [
  { id: 'sp_001', category: 'appearance', text: '全车原版原漆，漆面光泽如新', emoji: '🚗', tags: ['原版原漆', '外观', '宝马'], weight: 90 },
  { id: 'sp_002', category: 'performance', text: '仅行驶 3 万公里，动力充沛无事故', emoji: '⚡', tags: ['低里程', '无事故'], weight: 95 },
  { id: 'sp_003', category: 'interior', text: '真皮座椅零磨损，内饰 9.9 成新', emoji: '💺', tags: ['内饰', '真皮'], weight: 80 },
  { id: 'sp_004', category: 'value', text: '新车落地 30w，现仅需 16.8w 开回家', emoji: '💰', tags: ['性价比'], weight: 85 },
  { id: 'sp_005', category: 'resale', text: '三年保值率 75%，再开两年也不亏', emoji: '📈', tags: ['保值率'], weight: 70 },
  { id: 'sp_006', category: 'inspection', text: '第三方检测认证，90 天回购保障', emoji: '✅', tags: ['检测'], weight: 60 },
  { id: 'sp_007', category: 'performance', text: '全程4S店保养，记录齐全', emoji: '🔧', tags: ['保养', '4S'], weight: 88 },
  { id: 'sp_008', category: 'interior', text: '哈曼卡顿音响，音质顶级', emoji: '🎵', tags: ['音响', '宝马'], weight: 75 },
  { id: 'sp_009', category: 'appearance', text: '加装隐形车衣，漆面保护到位', emoji: '🛡️', tags: ['车衣', '外观'], weight: 82 },
  { id: 'sp_010', category: 'value', text: '支持分期置换，首付低至3成', emoji: '💳', tags: ['分期'], weight: 78 },
  { id: 'sp_011', category: 'performance', text: '准新车况，一手户', emoji: '⭐', tags: ['一手', '准新'], weight: 92 },
  { id: 'sp_012', category: 'appearance', text: '无钣金无喷漆，车况透明', emoji: '🔍', tags: ['无事故'], weight: 86 },
  { id: 'sp_013', category: 'performance', text: '新能源电池健康度98%，续航扎实', emoji: '🔋', tags: ['新能源', '电池'], weight: 84 },
  { id: 'sp_014', category: 'interior', text: '电动尾门、全景天窗配置齐全', emoji: '🌤️', tags: ['配置', '天窗'], weight: 76 },
  { id: 'sp_015', category: 'value', text: '比新车省一半，性价比超高', emoji: '💎', tags: ['性价比'], weight: 88 },
  { id: 'sp_016', category: 'inspection', text: '已通过268项检测，放心购买', emoji: '📋', tags: ['检测'], weight: 72 },
  { id: 'sp_017', category: 'appearance', text: '改色膜可撕，原漆完好', emoji: '🎨', tags: ['外观', '车衣'], weight: 74 },
  { id: 'sp_018', category: 'performance', text: '涡轮介入平顺，动力随叫随到', emoji: '🏎️', tags: ['动力'], weight: 81 },
  { id: 'sp_019', category: 'interior', text: '后排空间宽敞，家用商务两相宜', emoji: '🛋️', tags: ['空间', '商务'], weight: 79 },
  { id: 'sp_020', category: 'resale', text: '热门车型，出手快流通强', emoji: '🔥', tags: ['热门', '流通'], weight: 83 },
  { id: 'sp_021', category: 'value', text: '包过户包提档，手续齐全当天开走', emoji: '📄', tags: ['手续', '过户'], weight: 77 },
  { id: 'sp_022', category: 'performance', text: '四驱版本，雨雪天气更稳', emoji: '❄️', tags: ['四驱', '宝马'], weight: 80 },
  { id: 'sp_023', category: 'appearance', text: 'LED大灯升级，夜间行车更安全', emoji: '💡', tags: ['灯光', '外观'], weight: 73 },
  { id: 'sp_024', category: 'interior', text: '座椅通风加热，四季驾乘舒适', emoji: '🌡️', tags: ['座椅', '舒适'], weight: 78 },
  { id: 'sp_025', category: 'performance', text: '丰田系保值率高，开两年仍好出手', emoji: '📈', tags: ['丰田', '保值', '热门', '流通'], weight: 86 },
  { id: 'sp_026', category: 'performance', text: '本田发动机可靠，保养省心耐用', emoji: '🔧', tags: ['本田', '耐用', '保养'], weight: 84 },
  { id: 'sp_027', category: 'interior', text: '奔驰内饰氛围灯，豪华感拉满', emoji: '✨', tags: ['奔驰', '豪华', '商务', '内饰'], weight: 82 },
  { id: 'sp_028', category: 'performance', text: '奥迪quattro四驱，湿滑路面更稳', emoji: '❄️', tags: ['奥迪', '四驱', '豪华'], weight: 81 },
  { id: 'sp_029', category: 'performance', text: '特斯拉智驾辅助，科技配置领先', emoji: '🤖', tags: ['特斯拉', '新能源', '配置', '准新'], weight: 87 },
  { id: 'sp_030', category: 'value', text: '比亚迪刀片电池，安全续航双在线', emoji: '🔋', tags: ['比亚迪', '新能源', '电池', '性价比'], weight: 85 },
  { id: 'sp_031', category: 'interior', text: 'SUV视野开阔，家用出游空间足', emoji: '🏕️', tags: ['SUV', '空间', '家用'], weight: 80 },
  { id: 'sp_032', category: 'interior', text: 'MPV座椅布局灵活，商务接待首选', emoji: '💼', tags: ['MPV', '空间', '商务'], weight: 79 },
];

function mapRow(row) {
  return {
    id: row.id,
    category: row.category,
    text: row.text,
    emoji: row.emoji,
    source: 'builtin',
  };
}

export function parseVehicleProfile(brandModel = '', year = null) {
  const text = String(brandModel).trim();
  const compact = text.replace(/\s+/g, '');
  const yearMatch = text.match(/(20\d{2})/);
  const parsedYear = year ?? (yearMatch ? parseInt(yearMatch[1], 10) : null);
  const age = parsedYear ? new Date().getFullYear() - parsedYear : null;

  let brand = '';
  const brandNames = Object.keys(BRAND_META).sort((a, b) => b.length - a.length);
  for (const name of brandNames) {
    if (compact.includes(name) || text.includes(name)) {
      brand = name;
      break;
    }
  }

  const lower = `${text} ${compact}`.toLowerCase();
  let bodyType = 'general';
  if (SUV_HINTS.test(lower)) bodyType = 'suv';
  else if (MPV_HINTS.test(lower)) bodyType = 'mpv';
  else if (SEDAN_HINTS.test(lower)) bodyType = 'sedan';

  const meta = brand ? BRAND_META[brand] : {};
  const tags = [...(meta.tags || [])];

  if (bodyType === 'suv') tags.push('suv', '空间', '四驱');
  if (bodyType === 'mpv') tags.push('mpv', '空间', '商务');
  if (bodyType === 'sedan') tags.push('轿车', '家用');
  if (meta.isEv) tags.push('新能源', '电池');
  if (parsedYear) {
    tags.push(String(parsedYear));
    if (age <= 2) tags.push('准新', '新款', '一手', '低里程');
    else if (age <= 5) tags.push('精品', '车况好', '保养');
    else if (age >= 8) tags.push('性价比', '成熟', '稳定', '耐用');
  }
  if (meta.tier === 'luxury') tags.push('豪华', '音响', '配置');
  if (meta.tier === 'value') tags.push('性价比', '热门', '流通');

  (text.match(/[一-龥A-Za-z0-9]+/g) || []).forEach((part) => {
    const token = part.toLowerCase();
    if (token.length >= 2 && token !== brand) tags.push(token);
  });

  return {
    brand,
    brandModel: text,
    year: parsedYear,
    age,
    bodyType,
    tier: meta.tier || (bodyType === 'suv' ? 'suv' : 'mainstream'),
    isEv: !!meta.isEv,
    tags: [...new Set(tags.map((t) => String(t).toLowerCase()).filter(Boolean))],
  };
}

export function buildRecommendKeywords(brandModel = '', year = null) {
  const profile = parseVehicleProfile(brandModel, year);
  if (profile.tags.length) return profile.tags;

  const keywords = brandModel.toLowerCase().split(/[\s,，]+/).filter(Boolean);
  (brandModel.match(/[一-龥A-Za-z0-9]+/g) || []).forEach((part) => {
    const lower = part.toLowerCase();
    if (lower.length >= 2) keywords.push(lower);
  });
  return keywords;
}

function scoreSellingPoint(row, profile, keywords) {
  let score = row.weight;
  const tags = row.tags || [];
  const textLower = row.text.toLowerCase();
  const tagLowerList = tags.map((tag) => String(tag).toLowerCase());

  keywords.forEach((keyword) => {
    if (tagLowerList.some((tag) => tag.includes(keyword) || keyword.includes(tag))) {
      score += 20;
    }
    if (textLower.includes(keyword)) score += 12;
  });

  if (profile.brand) {
    if (tagLowerList.some((tag) => tag.includes(profile.brand)) || textLower.includes(profile.brand)) {
      score += 28;
    }
  }

  if (profile.isEv) {
    if (tagLowerList.some((tag) => /新能源|电池|续航/.test(tag)) || /新能源|电池|续航/.test(textLower)) {
      score += 22;
    }
  }

  if (profile.bodyType === 'suv') {
    if (tagLowerList.some((tag) => /suv|空间|四驱/.test(tag)) || /空间|四驱/.test(textLower)) {
      score += 14;
    }
  }

  if (profile.bodyType === 'mpv') {
    if (tagLowerList.some((tag) => /空间|商务|mpv/.test(tag)) || /空间|商务/.test(textLower)) {
      score += 14;
    }
  }

  const tierBoost = TIER_CATEGORY_BOOST[profile.tier] || {};
  if (tierBoost[row.category]) score += tierBoost[row.category];

  if (profile.age != null) {
    if (profile.age <= 2 && (/准新|一手|低里程/.test(textLower) || tagLowerList.some((t) => /准新|一手|低里程/.test(t)))) {
      score += 16;
    }
    if (profile.age >= 8 && (/性价比|保值|耐用/.test(textLower) || tagLowerList.some((t) => /性价比|保值|耐用/.test(t)))) {
      score += 14;
    }
  }

  return score;
}

function pickWithRandomness(scored, limit, { brandModel = '' } = {}) {
  const jitterMax = brandModel?.trim() ? 8 : 30;
  const jittered = scored.map(({ row, score }) => ({
    row,
    score: score + Math.random() * jitterMax,
  }));
  jittered.sort((a, b) => b.score - a.score);

  const poolSize = Math.min(jittered.length, Math.max(limit * 2, brandModel?.trim() ? 14 : 18));
  const pool = jittered.slice(0, poolSize);

  if (!brandModel?.trim()) {
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  return pool.slice(0, limit).map(({ row }) => mapRow(row));
}

/** 本地推荐卖点（核心入口） */
export function recommendLocal(brandModel = '', year = null, limit = 12) {
  const profile = parseVehicleProfile(brandModel, year);
  const keywords = profile.tags.length ? profile.tags : buildRecommendKeywords(brandModel, profile.year);

  const scored = BUILTIN_SELLING_POINTS.map((row) => ({
    row,
    score: scoreSellingPoint(row, profile, keywords),
  }));

  return pickWithRandomness(scored, limit, { brandModel });
}

/** 从文本本地生成卖点（与 copyPolishClient 配合） */
export function generateFromTextLocal(rawText = '', brandModel = '', limit = 12) {
  // 优先使用推荐引擎
  const recommended = recommendLocal(brandModel, null, Math.min(limit, 8));

  // 补充从文本提取的要点
  const fromText = [];
  const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
  const seen = new Set(recommended.map((p) => p.text));

  cleaned.split(/[。！？；\n,，、]/).forEach((part) => {
    const seg = part.trim();
    if (seg.length >= 4 && seg.length <= 24 && !seen.has(seg)) {
      fromText.push({
        id: `sp_text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        category: 'general',
        text: seg,
        emoji: '✨',
        source: 'text',
      });
      seen.add(seg);
    }
  });

  // 合并结果
  const merged = [...recommended, ...fromText.slice(0, limit - recommended.length)];
  return merged.slice(0, limit);
}