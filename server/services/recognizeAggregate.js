function parseYearFromText(text = '') {
  const match = String(text).match(/(20\d{2})/);
  return match ? parseInt(match[1], 10) : null;
}

function normalizeSeriesToken(text = '') {
  return String(text)
    .replace(/\s+/g, '')
    .replace(/款$/g, '')
    .replace(/(20\d{2})款?/g, '')
    .toLowerCase()
    .replace(/[·\-—]/g, '');
}

function normalizeModelKey(brandModel = '', year = null) {
  const compact = String(brandModel).replace(/\s+/g, '').replace(/款$/g, '').trim();
  const resolvedYear = year || parseYearFromText(compact);
  const seriesKey = normalizeSeriesToken(compact);
  return `${seriesKey}|${resolvedYear || ''}`;
}

const SOURCE_WEIGHTS = {
  baidu_car_api: 1.28,
  baidu_image: 1.12,
  vision_api: 1.18,
  deepseek_text: 0.82,
  stub: 0.5,
  multi: 1,
};

function getSourceWeight(source = '') {
  return SOURCE_WEIGHTS[source] || 1;
}

function aggregateRecognizeResults(results = [], options = {}) {
  const valid = results.filter((item) => item?.brandModel);
  if (!valid.length) return null;

  const boostPerPhoto = Number(options.boostPerPhoto ?? process.env.RECOGNIZE_CONSENSUS_BOOST ?? 0.06);
  const maxBoost = Number(options.maxBoost ?? process.env.RECOGNIZE_MAX_CONSENSUS_BOOST ?? 0.2);
  const crossSourceBoost = Number(options.crossSourceBoost ?? process.env.RECOGNIZE_CROSS_SOURCE_BOOST ?? 0.08);
  const maxConfidence = Number(options.maxConfidence ?? 0.98);

  const groups = new Map();
  for (const item of valid) {
    const key = normalizeModelKey(item.brandModel, item.year);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let winner = null;
  for (const [key, items] of groups.entries()) {
    const voteCount = items.length;
    const weightedConfidences = items.map((item) => {
      const raw = Number(item.confidence);
      const base = Number.isFinite(raw) ? raw : 0.5;
      return base * getSourceWeight(item.source);
    });
    const avgConfidence = weightedConfidences.reduce((sum, val) => sum + val, 0) / voteCount;
    const peakConfidence = Math.max(...weightedConfidences);
    const consensusBoost = Math.min(maxBoost, Math.max(0, voteCount - 1) * boostPerPhoto);
    const uniqueSources = new Set(items.map((item) => item.source).filter(Boolean));
    const multiSourceBonus = uniqueSources.size >= 2 ? crossSourceBoost : 0;
    const mergedConfidence = Math.min(
      maxConfidence,
      peakConfidence * 0.42 + avgConfidence * 0.58 + consensusBoost + multiSourceBonus
    );
    const score = voteCount * 1000 + mergedConfidence + uniqueSources.size * 50;
    const representative = items
      .slice()
      .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0];

    if (!winner || score > winner.score) {
      winner = {
        key,
        score,
        voteCount,
        consensusBoost,
        mergedConfidence,
        representative,
        items,
        uniqueSources,
        multiSourceBonus,
      };
    }
  }

  const {
    representative,
    voteCount,
    consensusBoost,
    mergedConfidence,
    items,
    uniqueSources,
    multiSourceBonus,
  } = winner;
  const sources = [...new Set(items.map((item) => item.source).filter(Boolean))];
  const source = sources.length === 1
    ? sources[0]
    : representative.source || sources[0] || 'multi';

  const totalBoost = consensusBoost + (multiSourceBonus || 0);

  return {
    brandModel: representative.brandModel,
    year: representative.year ?? parseYearFromText(representative.brandModel),
    confidence: Math.round(mergedConfidence * 1000) / 1000,
    source,
    photoId: representative.photoId,
    photoCount: valid.length,
    matchedPhotoCount: voteCount,
    confidenceBoost: totalBoost > 0 ? Math.round(totalBoost * 1000) / 1000 : 0,
    sources,
    crossSource: uniqueSources.size >= 2,
  };
}

module.exports = {
  parseYearFromText,
  normalizeSeriesToken,
  normalizeModelKey,
  SOURCE_WEIGHTS,
  getSourceWeight,
  aggregateRecognizeResults,
};
