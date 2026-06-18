function normalizeSellingText(point = '') {
  if (typeof point === 'string') return point.trim();
  return String(point?.text || '').trim();
}

function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownSellingTexts(text = '', points = []) {
  let result = String(text).trim();
  const labels = [...new Set(
    (points || []).map(normalizeSellingText).filter((label) => label.length >= 2)
  )].sort((a, b) => b.length - a.length);

  for (const label of labels) {
    const re = new RegExp(`[，、\\s]*${escapeRegExp(label)}`, 'g');
    result = result.replace(re, '');
  }

  return result
    .replace(/[，、]{2,}/g, '，')
    .replace(/[，、]([！。！？])/g, '$1')
    .replace(/^[，、\s]+|[，、\s]+$/g, '')
    .trim();
}

function mergeSellingIntoDescription(base = '', selectedPoints = [], allPoints = []) {
  const core = stripKnownSellingTexts(base, allPoints.length ? allPoints : selectedPoints);
  const labels = selectedPoints.map(normalizeSellingText).filter(Boolean);
  if (!labels.length) return core;
  if (!core) return `${labels.join('，')}！`;

  const trailing = core.match(/([！。！？])$/);
  const endPunct = trailing ? trailing[1] : '！';
  const main = trailing ? core.slice(0, -1).trimEnd() : core;
  const needsComma = main && !/[，、：:；;]$/.test(main);
  return `${main}${needsComma ? '，' : ''}${labels.join('，')}${endPunct}`;
}

/** @deprecated 兼容旧数据解析 */
function parseDescWithHighlights(fullText = '') {
  const text = String(fullText);
  const legacyPrefix = '【车辆亮点】';
  const idx = text.indexOf(legacyPrefix);
  if (idx < 0) return { body: text.trimEnd(), highlights: '' };
  return {
    body: text.slice(0, idx).trimEnd(),
    highlights: text.slice(idx).trim(),
  };
}

function composeDescriptionText(body = '', sellingPoints = [], allPoints = sellingPoints) {
  const legacy = parseDescWithHighlights(body);
  const base = legacy.highlights
    ? legacy.body
    : stripKnownSellingTexts(body, allPoints);
  return mergeSellingIntoDescription(base, sellingPoints, allPoints);
}

function appendPriceToDescription(text = '', priceWan = null) {
  const trimmed = String(text).trim();
  const price = Number(priceWan);
  if (!Number.isFinite(price) || price <= 0) return trimmed;
  const priceLine = `售价：${price}万元`;
  if (!trimmed) return priceLine;
  if (/售价[：:]\s*[\d.]+\s*万/.test(trimmed)) return trimmed;
  return `${trimmed}\n\n${priceLine}`;
}

function buildPosterDescription(vehicle = {}) {
  const base = vehicle.polishedDescription || vehicle.extraDescription || '';
  return appendPriceToDescription(base, vehicle.priceWan);
}

module.exports = {
  normalizeSellingText,
  stripKnownSellingTexts,
  mergeSellingIntoDescription,
  parseDescWithHighlights,
  composeDescriptionText,
  appendPriceToDescription,
  buildPosterDescription,
};
