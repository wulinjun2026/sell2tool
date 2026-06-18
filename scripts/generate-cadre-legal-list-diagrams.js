/**
 * 领导干部应知应会党内法规和国家法律清单制度 — 知识示意图 × 4
 * 依据中办国办《意见》要点
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');
const { svgToPng } = require('../server/services/posterExport');
const { renderTextTag } = require('../server/services/posterText');
const { ensurePosterFonts } = require('../server/services/posterFonts');

const OUT_DIR = path.join(ROOT, 'output', 'cadre-legal-list-article');
const W = 900;
const H = 1200;
let svgUid = 0;

const C = {
  ink: '#1c2833',
  sub: '#5d6d7e',
  navy: '#1a365d',
  blue: '#2c5282',
  blueLight: '#ebf4ff',
  crimson: '#742a2a',
  crimsonLight: '#fff5f5',
  orange: '#c05621',
  orangeLight: '#fffaf0',
  green: '#276749',
  greenLight: '#f0fff4',
  gold: '#b7791f',
  goldLight: '#fffff0',
  purple: '#553c9a',
  purpleLight: '#faf5ff',
  border: '#cbd5e0',
  white: '#ffffff',
  bg: '#f7fafc',
};

function uid() {
  svgUid += 1;
  return `u${svgUid}`;
}

function wrapLines(text, maxChars) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (line.length >= maxChars) {
      lines.push(line);
      line = '';
    }
    line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function multiLine(x, y, text, opts = {}) {
  const { fontSize = 21, fill = C.ink, lineHeight = 32, maxChars = 28, anchor, weight } = opts;
  const lines = Array.isArray(text) ? text : wrapLines(text, maxChars);
  return lines
    .map((ln, i) =>
      renderTextTag({ x, y: y + i * lineHeight, text: ln, fill, fontSize, anchor, weight })
    )
    .join('\n');
}

function panel(x, y, w, h, fill, accent) {
  const a = accent || C.border;
  return `
    <rect x="${x + 2}" y="${y + 3}" width="${w}" height="${h}" rx="8" fill="rgba(26,54,93,0.06)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${a}" stroke-width="1.5"/>
  `;
}

function sectionTitle(x, y, text, accent) {
  return `
    <rect x="${x}" y="${y}" width="4" height="22" rx="2" fill="${accent}"/>
    ${renderTextTag({ x: x + 14, y: y + 18, text, fill: accent, fontSize: 22, weight: 'bold' })}
  `;
}

function summaryTile(x, y, w, title, desc, accent) {
  return `
    ${panel(x, y, w, 88, C.white, accent)}
    <rect x="${x}" y="${y}" width="4" height="88" rx="2" fill="${accent}"/>
    ${renderTextTag({ x: x + 16, y: y + 32, text: title, fill: accent, fontSize: 18, weight: 'bold' })}
    ${renderTextTag({ x: x + 16, y: y + 58, text: desc, fill: C.sub, fontSize: 16 })}
  `;
}

function legalHeader(title, subtitle) {
  const g1 = uid();
  const g2 = uid();
  return `
    <defs>
      <linearGradient id="${g1}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#742a2a"/>
        <stop offset="100%" stop-color="#1a365d"/>
      </linearGradient>
      <linearGradient id="${g2}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.08)"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="196" fill="url(#${g1})"/>
    <rect width="${W}" height="196" fill="url(#${g2})"/>
    ${renderTextTag({ x: W / 2, y: 62, text: title, fill: '#fff', fontSize: 30, anchor: 'middle', weight: 'bold' })}
    ${renderTextTag({ x: W / 2, y: 102, text: subtitle, fill: '#e2e8f0', fontSize: 20, anchor: 'middle' })}
    ${renderTextTag({ x: W / 2, y: 138, text: '中办国办《意见》· 应知应会清单制度', fill: '#a0aec0', fontSize: 16, anchor: 'middle' })}
    ${renderTextTag({ x: W / 2, y: 172, text: '尊规学法 · 依法决策 · 依法办事', fill: '#feb2b2', fontSize: 15, anchor: 'middle' })}
    ${iconScale(48, 52)}
    ${iconBook(780, 48)}
  `;
}

function legalFooter(note) {
  const fy = H - 92;
  return `
    ${panel(32, fy, 836, 72, '#edf2f7', C.border)}
    ${multiLine(48, fy + 28, note, { fontSize: 17, fill: C.sub, maxChars: 44, lineHeight: 24 })}
    ${renderTextTag({ x: W - 40, y: H - 24, text: '学习成果须转化为依法履职自觉行动', fill: '#a0aec0', fontSize: 14, anchor: 'end' })}
  `;
}

function iconScale(x, y) {
  return `
    <g transform="translate(${x},${y})" opacity="0.9">
      <path d="M20,56 L44,56 L44,20 L56,20 L40,4 L24,20 L36,20 Z" fill="none" stroke="#feb2b2" stroke-width="2"/>
      <circle cx="40" cy="44" r="14" fill="none" stroke="#fff" stroke-width="2"/>
      <line x1="28" y1="56" x2="52" y2="32" stroke="#fff" stroke-width="2"/>
    </g>
  `;
}

function iconBook(x, y) {
  return `
    <g transform="translate(${x},${y})" opacity="0.88">
      <rect x="8" y="12" width="40" height="48" rx="3" fill="#ebf4ff" stroke="#90cdf4"/>
      <line x1="28" y1="12" x2="28" y2="60" stroke="#90cdf4"/>
      <line x1="14" y1="28" x2="24" y2="28" stroke="#2c5282" stroke-width="2"/>
      <line x1="14" y1="40" x2="24" y2="40" stroke="#2c5282" stroke-width="2"/>
    </g>
  `;
}

function buildSvg(body, title, subtitle, footerNote) {
  svgUid = 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${legalHeader(title, subtitle)}
  ${body}
  ${legalFooter(footerNote || '提示：抓住关键少数，防止学规学法形式主义。')}
</svg>`;
}

const DIAGRAMS = [
  {
    file: '01-制度要义与总体要求.png',
    title: '制度要义与总体要求',
    subtitle: '关键少数 · 尊规学法 · 清单制度',
    body: () => `
      ${panel(40, 212, 820, 200, C.crimsonLight, C.crimson)}
      ${sectionTitle(56, 232, '出台目的', C.crimson)}
      ${multiLine(56, 268, '落实党的二十大精神；推动领导干部带头尊规学规守规用规、尊法学法守法用法；依据《法治中国建设规划（2020-2025年）》。', { maxChars: 42 })}
      ${multiLine(56, 332, '建立应知应会党内法规和国家法律清单制度。', { maxChars: 42, fill: C.crimson, weight: 'bold' })}

      <g transform="translate(80,440)">
        ${['习近平法治思想', '党章党规党纪', '宪法法律观念', '依法决策办事'].map((t, i) => `
          ${panel(i * 152, 0, 140, 72, C.white, C.navy)}
          ${renderTextTag({ x: i * 152 + 70, y: 42, text: t, fill: C.navy, fontSize: 16, anchor: 'middle', weight: 'bold' })}
          ${i < 3 ? `<polygon points="${i * 152 + 148},36 ${i * 152 + 158},42 ${i * 152 + 148},48" fill="${C.navy}"/>` : ''}
        `).join('')}
      </g>

      ${panel(40, 540, 400, 280, C.blueLight, C.blue)}
      ${sectionTitle(56, 560, '指导思想', C.blue)}
      ${multiLine(56, 600, [
        '· 抓住领导干部“关键少数”',
        '· 增强法治观念与思维能力',
        '· 遵守党规国法',
        '· 深刻领悟“两个确立”',
        '· 做到“两个维护”',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 540, 400, 280, C.greenLight, C.green)}
      ${sectionTitle(476, 560, '树立的观念', C.green)}
      ${multiLine(480, 600, [
        '· 牢固树立党章意识',
        '· 用党规党纪约束一言一行',
        '· 宪法法律至上',
        '· 法律面前人人平等',
        '· 权由法定、权依法使',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 838, 820, 100, C.goldLight, C.gold)}
      ${multiLine(56, 872, '核心：在法治之下想问题、作决策、办事情。', { maxChars: 42, fill: C.gold, weight: 'bold' })}
    `,
  },
  {
    file: '02-党内法规学习重点.png',
    title: '党内法规学习重点',
    subtitle: '五条线 · 分岗应知应会',
    body: () => `
      ${panel(40, 212, 820, 148, C.crimsonLight, C.crimson)}
      ${sectionTitle(56, 232, '必修：习近平法治思想', C.crimson)}
      ${multiLine(56, 272, '指定书目与《学习纲要》；坚定信仰者、传播者、实践者。', { maxChars: 42 })}

      <g transform="translate(40,380)">
        ${summaryTile(0, 0, 200, '党章', '必修课基本功', C.crimson)}
        ${summaryTile(210, 0, 200, '组织法规', '机构职权职责', C.blue)}
        ${summaryTile(420, 0, 200, '领导法规', '全面党的领导', C.green)}
        ${summaryTile(630, 0, 190, '自身建设', '从严治党', C.orange)}
      </g>

      ${panel(40, 490, 820, 120, C.purpleLight, C.purple)}
      ${sectionTitle(56, 510, '监督保障法规', C.purple)}
      ${multiLine(56, 548, '党内监督、巡视、考核、问责、纪律处分、执纪规则等——贯彻自我革命战略部署。', { maxChars: 42 })}

      ${panel(40, 630, 400, 260, C.blueLight, C.blue)}
      ${sectionTitle(56, 650, '党章要求', C.blue)}
      ${multiLine(56, 690, [
        '· 党章是根本大法',
        '· 党员必须做的，领导首先做',
        '· 党员不能做的，领导带头不做',
        '· 政治立场方向原则道路',
        '  同党中央保持一致',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 630, 400, 260, C.orangeLight, C.orange)}
      ${sectionTitle(476, 650, '基层相关举例', C.orange)}
      ${multiLine(480, 690, [
        '· 农村工作条例',
        '· 信访工作条例',
        '· 安全生产责任制',
        '· 八项规定及细则',
        '· 全面从严治党主体责任',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 906, 820, 88, C.greenLight, C.green)}
      ${multiLine(56, 938, '根据工作需要选学相关条例，熟悉组织体系与职权职责。', { maxChars: 42, fill: C.green })}
    `,
  },
  {
    file: '03-国家法律学习重点.png',
    title: '国家法律学习重点',
    subtitle: '七类法律 · 结合履职需要',
    body: () => `
      ${panel(40, 212, 820, 168, C.blueLight, C.blue)}
      ${sectionTitle(56, 232, '宪法为根本', C.blue)}
      ${multiLine(56, 272, [
        '· 国体政体、根本制度与根本任务',
        '· 坚持党的领导、人民民主专政、人大制度',
        '· 组织法、监察法、立法法等宪法相关法',
      ], { fontSize: 20, maxChars: 40, lineHeight: 34 })}

      <g transform="translate(40,400)">
        ${summaryTile(0, 0, 190, '国家安全', '统筹发展与安全', C.crimson)}
        ${summaryTile(205, 0, 190, '高质量发展', '乡村振兴等', C.green)}
        ${summaryTile(410, 0, 190, '民法典', '化解矛盾纠纷', C.blue)}
        ${summaryTile(615, 0, 205, '刑法+政务处分', '不碰红线', C.orange)}
      </g>

      ${panel(40, 510, 400, 240, C.greenLight, C.green)}
      ${sectionTitle(56, 530, '行政法律', C.green)}
      ${multiLine(56, 570, [
        '· 合法行政、程序正当',
        '· 职权法定、法无授权不可为',
        '· 许可、处罚、强制、复议、诉讼',
        '· 公务员法',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 510, 400, 240, C.goldLight, C.gold)}
      ${sectionTitle(476, 530, '其他履职相关法律', C.gold)}
      ${multiLine(480, 570, [
        '· 社会治理、涉外法治',
        '· 反腐败斗争领域法律',
        '· 政府信息公开',
        '· 重大行政决策程序',
        '· 军事法规、监察法规等',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 768, 820, 140, C.orangeLight, C.orange)}
      ${sectionTitle(56, 788, '民法典运用', C.orange)}
      ${multiLine(56, 828, '作为决策、管理、监督的重要标尺；维护人民权益、化解矛盾、促进和谐稳定。', { maxChars: 42, fill: C.orange, weight: 'bold' })}

      ${panel(40, 926, 820, 72, C.blueLight, C.blue)}
      ${multiLine(56, 958, '原则：结合岗位需要学，一体推进学规学法。', { maxChars: 42, fill: C.navy })}
    `,
  },
  {
    file: '04-工作措施与落实路径.png',
    title: '工作措施与落实路径',
    subtitle: '编清单 · 进教育 · 建机制',
    body: () => `
      ${panel(40, 212, 820, 200, C.white, C.navy)}
      ${sectionTitle(56, 232, '① 分级分类制定清单', C.navy)}
      ${multiLine(56, 272, [
        '· 区分层级、岗位，抓住关键突出重点',
        '· 提升学习精准性、科学性、实效性',
        '· 中央和国家机关带头示范',
        '· 动态调整：新制修订法规及时纳入',
      ], { fontSize: 20, maxChars: 40, lineHeight: 34 })}

      ${panel(40, 428, 400, 280, C.blueLight, C.blue)}
      ${sectionTitle(56, 448, '② 纳入干部教育体系', C.blue)}
      ${multiLine(56, 488, [
        '· 党政主要负责人带头示范',
        '· 党委（党组）理论学习中心组',
        '· 党校（行政学院）必训课程',
        '· 任职培训、在职培训',
        '· 常务会、班子会前、决策前学法',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 428, 400, 280, C.greenLight, C.green)}
      ${sectionTitle(476, 448, '③ 学法用法激励机制', C.green)}
      ${multiLine(480, 488, [
        '· 年终述法制度',
        '· 领导干部在线学法平台',
        '· 纳入考核与精神文明创建',
        '· 列入法治创建考核指标',
        '· 防止形式主义',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      <g transform="translate(40,730)">
        ${summaryTile(0, 0, 200, '编清单', '分岗精准', C.navy)}
        ${summaryTile(210, 0, 200, '抓学习', '中心组+党校', C.blue)}
        ${summaryTile(420, 0, 200, '促转化', '依法决策办事', C.green)}
        ${summaryTile(630, 0, 150, '督实效', '考核述法', C.orange)}
      </g>

      ${panel(40, 838, 820, 108, C.crimsonLight, C.crimson)}
      ${multiLine(56, 876, '落脚点：把学习成果转化为依法决策、依法办事的自觉行动。', { maxChars: 42, fill: C.crimson, weight: 'bold' })}
    `,
  },
];

async function main() {
  ensurePosterFonts();
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const d of DIAGRAMS) {
    const svg = buildSvg(d.body(), d.title, d.subtitle, d.footer);
    const png = svgToPng(svg, W);
    fs.writeFileSync(path.join(OUT_DIR, d.file), png);
    console.log('✓', d.file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
