function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeRecognizeResult(parsed, { maxConfidence } = {}) {
  if (!parsed || typeof parsed !== 'object') return null;
  const brandModel = String(parsed.brandModel || parsed.brand_model || '').trim();
  if (!brandModel) return null;

  let year = parsed.year;
  if (year != null) {
    year = parseInt(String(year), 10);
    if (!Number.isFinite(year) || year < 1990 || year > new Date().getFullYear() + 1) {
      year = null;
    }
  }

  const yearFromText = brandModel.match(/(20\d{2})/);
  if (!year && yearFromText) year = parseInt(yearFromText[1], 10);

  let confidence = parsed.confidence;
  if (confidence != null) {
    confidence = Number(confidence);
    if (!Number.isFinite(confidence)) confidence = null;
    else confidence = Math.max(0, Math.min(maxConfidence ?? 1, confidence));
  }

  return { brandModel, year: year || null, confidence: confidence ?? null };
}

module.exports = {
  extractJsonObject,
  normalizeRecognizeResult,
};
