const { getCjkFontFamily, getLatinFontFamily } = require('./posterFonts');

const EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
const INVISIBLE_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
const FULLWIDTH_ASCII_RE = /[\uFF01-\uFF5E]/g;
const FULLWIDTH_DIGIT_RE = /[\uFF10-\uFF19]/g;

/** 清洗长图文本：去 emoji、控制符，归一化全角字符 */
function sanitizePosterText(text, { trim = true } = {}) {
  let s = String(text ?? '')
    .replace(EMOJI_RE, '')
    .replace(INVISIBLE_RE, '')
    .replace(FULLWIDTH_ASCII_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff00 + 0x20))
    .replace(FULLWIDTH_DIGIT_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));

  if (trim) return s.replace(/\s+/g, ' ').trim();
  return s.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 兼容旧调用 */
function esc(text) {
  return escapeXml(sanitizePosterText(text));
}

function isLatinChar(ch) {
  return /[0-9A-Za-z]/.test(ch);
}

function isCjkChar(ch) {
  const code = ch.codePointAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function charKind(ch) {
  if (isLatinChar(ch)) return 'latin';
  return 'cjk';
}

/** 按 CJK / 拉丁拆段，便于 resvg 分别指定字体 */
function splitTextRuns(text) {
  const cleaned = sanitizePosterText(text, { trim: false });
  if (!cleaned) return [];

  const runs = [];
  let current = '';
  let kind = null;

  for (const ch of cleaned) {
    const chKind = charKind(ch);
    if (kind && chKind !== kind && current) {
      runs.push({ kind, text: current });
      current = '';
    }
    kind = chKind;
    current += ch;
  }
  if (current) runs.push({ kind, text: current });
  return runs;
}

function needsMixedSplit(text) {
  const kinds = new Set(splitTextRuns(text).map((r) => r.kind));
  return kinds.size > 1;
}

function renderMixedContent(text) {
  const cjk = getCjkFontFamily();
  const latin = getLatinFontFamily();
  const runs = splitTextRuns(text);
  if (!runs.length) return '';

  return runs
    .map((run) => {
      const useLatin = run.kind === 'latin' && !/^[\u4e00-\u9fff]+$/.test(run.text);
      const font = useLatin ? latin : cjk;
      return `<tspan font-family="${font}">${escapeXml(run.text)}</tspan>`;
    })
    .join('');
}

/** 电话行：中文标签与数字分两个 text，数字强制 Arial */
function renderPhoneText({ x, y, phone, fill, fontSize = 24 }) {
  const digits = normalizeDisplayPhone(phone);
  if (!digits) return '';
  const cjk = getCjkFontFamily();
  const latin = getLatinFontFamily();
  const label = '电话:';
  const labelWidth = fontSize * 1.02 * label.length;
  const digitWidth = fontSize * 0.58 * digits.length;
  const totalWidth = labelWidth + digitWidth;
  const labelX = x - totalWidth / 2;
  const digitX = labelX + labelWidth;
  return [
    `<text x="${labelX}" y="${y}" fill="${fill}" font-size="${fontSize}" font-family="${cjk}">${escapeXml(label)}</text>`,
    `<text x="${digitX}" y="${y}" fill="${fill}" font-size="${fontSize}" font-family="${latin}">${escapeXml(digits)}</text>`,
  ].join('');
}

function posterFontAttr() {
  const cjk = getCjkFontFamily();
  const latin = getLatinFontFamily();
  return `font-family="${cjk}, ${latin}, sans-serif"`;
}

/**
 * 统一 SVG 文本节点：显式 font-family + 中英数分字体
 */
function renderTextTag({
  x,
  y,
  text,
  fill,
  fontSize = 28,
  anchor,
  weight,
  splitMixed = false,
  trim = true,
}) {
  const cleaned = sanitizePosterText(text, { trim });
  if (!cleaned) return '';

  const cjk = getCjkFontFamily();
  const latin = getLatinFontFamily();
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `fill="${fill}"`,
    `font-size="${fontSize}"`,
    posterFontAttr(),
  ];
  if (anchor) attrs.push(`text-anchor="${anchor}"`);
  if (weight) attrs.push(`font-weight="${weight}"`);

  const runs = splitTextRuns(cleaned);
  let inner;
  if (splitMixed && runs.length > 1) {
    inner = renderMixedContent(cleaned);
  } else {
    inner = `<tspan font-family="${cjk}, ${latin}, sans-serif">${escapeXml(cleaned)}</tspan>`;
  }

  return `<text ${attrs.join(' ')}>${inner}</text>`;
}

function renderCodeText({
  x,
  y,
  code,
  fill,
  fontSize = 18,
  anchor = 'middle',
  prefix = '编号: ',
  weight,
}) {
  const safeCode = sanitizePosterText(code);
  if (!safeCode) return '';
  const cjk = getCjkFontFamily();
  const latin = getLatinFontFamily();
  const label = sanitizePosterText(prefix, { trim: false });
  const labelWidth = fontSize * 1.02 * label.length;
  const codeWidth = fontSize * 0.58 * safeCode.length;
  const totalWidth = labelWidth + codeWidth;
  const startX = anchor === 'middle' ? x - totalWidth / 2 : x;
  const weightAttr = weight ? ` font-weight="${weight}"` : '';
  return [
    `<text x="${startX}" y="${y}" fill="${fill}" font-size="${fontSize}" font-family="${cjk}"${weightAttr}>${escapeXml(label)}</text>`,
    `<text x="${startX + labelWidth}" y="${y}" fill="${fill}" font-size="${fontSize}" font-family="${latin}"${weightAttr}>${escapeXml(safeCode)}</text>`,
  ].join('');
}

function normalizeDisplayPhone(phone) {
  return sanitizePosterText(phone).replace(/[^\d+]/g, '');
}

function validatePosterSvg(svgDoc) {
  const issues = [];

  if (EMOJI_RE.test(svgDoc)) {
    issues.push('SVG 仍包含 emoji');
  }

  const textTags = svgDoc.match(/<text\b[^>]*>/g) || [];
  textTags.forEach((tag, i) => {
    if (!/font-family=/.test(tag)) {
      issues.push(`第 ${i + 1} 个 <text> 缺少 font-family`);
    }
  });

  const textContents = [...svgDoc.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '')
  );
  textContents.forEach((content, i) => {
    if (EMOJI_RE.test(content)) {
      issues.push(`第 ${i + 1} 段文本仍含 emoji: ${content.slice(0, 20)}`);
    }
    if (!content.trim()) {
      issues.push(`第 ${i + 1} 段文本为空`);
    }
  });

  return { ok: issues.length === 0, issues };
}

module.exports = {
  sanitizePosterText,
  escapeXml,
  esc,
  splitTextRuns,
  needsMixedSplit,
  renderMixedContent,
  renderTextTag,
  renderPhoneText,
  renderCodeText,
  posterFontAttr,
  normalizeDisplayPhone,
  validatePosterSvg,
};
