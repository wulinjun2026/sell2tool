const BRAND_META = {
  宝马: { tags: ['宝马', '德系', '豪华', '四驱'], tier: 'luxury' },
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

function mapRow(row) {
  return {
    id: row.id,
    category: row.category,
    text: row.text,
    emoji: row.emoji,
    source: 'builtin',
  };
}

function parseVehicleProfile(brandModel = '', year = null) {
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

  (text.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || []).forEach((part) => {
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

function buildRecommendKeywords(brandModel = '', year = null) {
  const profile = parseVehicleProfile(brandModel, year);
  if (profile.tags.length) return profile.tags;

  const keywords = brandModel.toLowerCase().split(/[\s,，]+/).filter(Boolean);
  (brandModel.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || []).forEach((part) => {
    const lower = part.toLowerCase();
    if (lower.length >= 2) keywords.push(lower);
  });
  return keywords;
}

function scoreSellingPoint(row, profile, keywords) {
  let score = row.weight;
  const tags = row.tags_json ? JSON.parse(row.tags_json) : [];
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

async function recommend(db, brandModel = '', limit = 12, { year = null } = {}) {
  const all = await db.all(
    `SELECT * FROM selling_point_builtin WHERE enabled = 1 ORDER BY weight DESC`
  );

  const profile = parseVehicleProfile(brandModel, year);
  const parsedYear = profile.year;
  const keywords = profile.tags.length ? profile.tags : buildRecommendKeywords(brandModel, parsedYear);

  const scored = all.map((row) => ({
    row,
    score: scoreSellingPoint(row, profile, keywords),
  }));

  const points = pickWithRandomness(scored, limit, { brandModel });
  return points;
}

async function recommendForVehicle(db, { brandModel = '', year = null, limit = 12 } = {}) {
  const profile = parseVehicleProfile(brandModel, year);
  const points = await recommend(db, brandModel, limit, { year: profile.year });
  return { points, profile };
}

async function listByCategory(db, category) {
  const rows = await db.all(
    `SELECT * FROM selling_point_builtin WHERE enabled = 1 AND category = ? ORDER BY weight DESC`,
    category
  );
  return rows.map((row) => mapRow(row));
}

async function search(db, keyword) {
  const kw = `%${keyword}%`;
  const rows = await db.all(
    `SELECT * FROM selling_point_builtin WHERE enabled = 1 AND text LIKE ? ORDER BY weight DESC LIMIT 20`,
    kw
  );
  return rows.map((row) => mapRow(row));
}

module.exports = {
  recommend,
  recommendForVehicle,
  parseVehicleProfile,
  buildRecommendKeywords,
  scoreSellingPoint,
  listByCategory,
  search,
};
