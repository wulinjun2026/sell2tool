/**
 * 外卖异物 — 写实风格知识示意图 × 4
 * 法释〔2024〕9号
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');
const { svgToPng } = require('../server/services/posterExport');
const { renderTextTag } = require('../server/services/posterText');
const { ensurePosterFonts } = require('../server/services/posterFonts');

const OUT_DIR = path.join(ROOT, 'output', 'takeout-food-safety-article');
const W = 900;
const H = 1200;
let svgUid = 0;

const C = {
  ink: '#1c2833',
  sub: '#5d6d7e',
  navy: '#1a365d',
  blue: '#2c5282',
  blueLight: '#ebf4ff',
  blueMid: '#bee3f8',
  orange: '#c05621',
  orangeLight: '#fffaf0',
  green: '#276749',
  greenLight: '#f0fff4',
  red: '#9b2c2c',
  redLight: '#fff5f5',
  gold: '#b7791f',
  goldLight: '#fffff0',
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

function realisticHeader(title, subtitle) {
  const g1 = uid();
  const g2 = uid();
  return `
    <defs>
      <linearGradient id="${g1}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2d4a6f"/>
        <stop offset="100%" stop-color="#1a365d"/>
      </linearGradient>
      <linearGradient id="${g2}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.08)"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="196" fill="url(#${g1})"/>
    <rect width="${W}" height="196" fill="url(#${g2})"/>
    <line x1="0" y1="196" x2="${W}" y2="196" stroke="#4a6fa5" stroke-width="1" opacity="0.4"/>
    ${renderTextTag({ x: W / 2, y: 68, text: title, fill: '#fff', fontSize: 34, anchor: 'middle', weight: 'bold' })}
    ${renderTextTag({ x: W / 2, y: 108, text: subtitle, fill: '#a0aec0', fontSize: 20, anchor: 'middle' })}
    ${renderTextTag({ x: W / 2, y: 142, text: '法释〔2024〕9号 · 食品药品惩罚性赔偿司法解释', fill: '#718096', fontSize: 16, anchor: 'middle' })}
    ${renderTextTag({ x: W / 2, y: 172, text: '外卖异物维权 · 写实图解', fill: '#90cdf4', fontSize: 15, anchor: 'middle' })}
    ${iconTakeoutRealistic(48, 52)}
    ${iconScaleRealistic(780, 48)}
  `;
}

function realisticFooter(note) {
  const fy = H - 92;
  return `
    ${panel(32, fy, 836, 72, '#edf2f7', C.border)}
    ${multiLine(48, fy + 28, note, { fontSize: 17, fill: C.sub, maxChars: 44, lineHeight: 24 })}
    ${renderTextTag({ x: W - 40, y: H - 24, text: '2024年8月22日起施行 · 最高法权威发布', fill: '#a0aec0', fontSize: 14, anchor: 'end' })}
  `;
}

/** 写实外卖餐盒（渐变光影） */
function iconTakeoutRealistic(x, y) {
  const g = uid();
  return `
    <g transform="translate(${x},${y})" opacity="0.92">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e8dcc8"/>
          <stop offset="100%" stop-color="#c4a882"/>
        </linearGradient>
      </defs>
      <ellipse cx="42" cy="88" rx="36" ry="8" fill="rgba(0,0,0,0.25)"/>
      <path d="M12,32 L72,32 L78,82 L6,82 Z" fill="url(#${g})" stroke="#8b7355" stroke-width="1"/>
      <path d="M12,32 L72,32 L68,42 L16,42 Z" fill="#f5f0e6" opacity="0.9"/>
      <rect x="18" y="48" width="48" height="28" rx="2" fill="#2d3748" opacity="0.15"/>
      <ellipse cx="42" cy="62" rx="14" ry="10" fill="#8b4513" opacity="0.35"/>
    </g>
  `;
}

/** 写实天平 */
function iconScaleRealistic(x, y) {
  return `
    <g transform="translate(${x},${y})" opacity="0.88">
      <rect x="38" y="70" width="4" height="28" fill="#c9a227"/>
      <rect x="20" y="96" width="40" height="4" rx="1" fill="#a08030"/>
      <line x1="40" y1="28" x2="40" y2="72" stroke="#c9a227" stroke-width="3"/>
      <line x1="8" y1="36" x2="72" y2="36" stroke="#c9a227" stroke-width="2"/>
      <ellipse cx="16" cy="44" rx="14" ry="4" fill="#d4af37" opacity="0.8"/>
      <path d="M6,36 L26,36 L22,52 L10,52 Z" fill="#d4af37" opacity="0.6"/>
      <ellipse cx="64" cy="44" rx="14" ry="4" fill="#d4af37" opacity="0.8"/>
      <path d="M54,36 L74,36 L70,52 L58,52 Z" fill="#d4af37" opacity="0.6"/>
    </g>
  `;
}

/** 写实手机订单 */
function iconPhoneOrder(x, y) {
  const g = uid();
  return `
    <g transform="translate(${x},${y})">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4a5568"/>
          <stop offset="100%" stop-color="#2d3748"/>
        </linearGradient>
      </defs>
      <rect x="4" y="2" width="44" height="76" rx="6" fill="url(#${g})"/>
      <rect x="8" y="10" width="36" height="58" rx="2" fill="#fff"/>
      <rect x="12" y="16" width="28" height="4" rx="1" fill="#cbd5e0"/>
      <rect x="12" y="24" width="20" height="3" rx="1" fill="#e2e8f0"/>
      <rect x="12" y="32" width="24" height="8" rx="1" fill="${C.blueLight}"/>
      <rect x="12" y="44" width="16" height="3" rx="1" fill="#e2e8f0"/>
      <circle cx="24" cy="78" r="3" fill="#718096"/>
    </g>
  `;
}

/** 写实相机/取证 */
function iconCameraEvidence(x, y) {
  const g = uid();
  return `
    <g transform="translate(${x},${y})">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4a5568"/>
          <stop offset="100%" stop-color="#1a202c"/>
        </linearGradient>
      </defs>
      <rect x="8" y="22" width="52" height="38" rx="4" fill="url(#${g})"/>
      <circle cx="34" cy="41" r="12" fill="#2d3748" stroke="#718096" stroke-width="2"/>
      <circle cx="34" cy="41" r="7" fill="#1a365d" opacity="0.6"/>
      <rect x="22" y="14" width="16" height="10" rx="2" fill="#4a5568"/>
      <rect x="48" y="30" width="6" height="4" rx="1" fill="#718096"/>
    </g>
  `;
}

/** 写实计算器 */
function iconCalculator(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <rect x="6" y="8" width="52" height="64" rx="4" fill="#edf2f7" stroke="#a0aec0" stroke-width="1"/>
      <rect x="10" y="12" width="44" height="14" rx="2" fill="#2d3748"/>
      <text x="32" y="23" text-anchor="middle" font-size="10" fill="#48bb78" font-family="Arial">×10</text>
      ${[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) =>
          `<rect x="${12 + c * 14}" y="${30 + r * 12}" width="10" height="8" rx="1" fill="#cbd5e0"/>`
        ).join('')
      ).join('')}
    </g>
  `;
}

/** 写实盾牌勾选 */
function iconShieldCheck(x, y, color = C.green) {
  return `
    <g transform="translate(${x},${y})">
      <path d="M28,4 L48,14 L48,38 Q28,54 8,38 L8,14 Z" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="1.5"/>
      <path d="M18,30 L24,36 L40,20" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    </g>
  `;
}

/** 写实警示 */
function iconAlert(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <path d="M28,6 L50,48 L6,48 Z" fill="${C.goldLight}" stroke="${C.gold}" stroke-width="1.5"/>
      <text x="28" y="40" text-anchor="middle" font-size="20" fill="${C.gold}" font-weight="bold">!</text>
    </g>
  `;
}

/** 写实禁止 */
function iconProhibit(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <circle cx="28" cy="28" r="24" fill="${C.redLight}" stroke="${C.red}" stroke-width="1.5"/>
      <line x1="12" y1="12" x2="44" y2="44" stroke="${C.red}" stroke-width="3" stroke-linecap="round"/>
    </g>
  `;
}

function buildSvg(body, title, subtitle, footerNote) {
  svgUid = 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${realisticHeader(title, subtitle)}
  ${body}
  ${realisticFooter(footerNote || '维权提示：保留订单、支付记录、开箱视频与异物照片，先向平台投诉并拨打12315，协商不成可依法起诉。')}
</svg>`;
}

const DIAGRAMS = [
  {
    file: '01-外卖异物能不能要十倍.png',
    title: '外卖吃出异物：能要十倍吗？',
    subtitle: '个人点餐 · 生活消费 · 一般可以主张',
    body: () => `
      ${panel(40, 212, 820, 188, C.blueLight, C.blue)}
      ${sectionTitle(56, 232, '结论摘要', C.blue)}
      ${iconTakeoutRealistic(760, 228)}
      ${multiLine(56, 268, '因个人或家庭生活消费需要购买的外卖，饭菜中出现头发、塑料、虫子、钢丝等异物，通常属于不符合食品安全标准。', { maxChars: 42 })}
      ${multiLine(56, 332, '司法解释第1条：可请求生产者或经营者按实际支付价款十倍支付惩罚性赔偿金（食品安全法第148条）。', { maxChars: 42, fill: C.blue, weight: 'bold' })}

      ${panel(40, 416, 400, 268, C.orangeLight, C.orange)}
      ${iconShieldCheck(52, 432, C.orange)}
      ${sectionTitle(100, 448, '主张前提', C.orange)}
      ${multiLine(56, 488, ['为自己或家人就餐而购买', '食品存在异物等安全问题', '无证据证明明知不合格仍购买', '餐厅/经营者为适格被告'], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 416, 400, 268, C.greenLight, C.green)}
      ${iconCameraEvidence(476, 428)}
      ${sectionTitle(524, 448, '外卖场景', C.green)}
      ${multiLine(480, 488, ['平台订单可作为消费凭证', '异物照片、开箱视频为关键证据', '可向餐厅、平台先行协商', '第5条质量安全类问题可支持', '惩罚性赔偿请求'], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 698, 820, 148, C.redLight, C.red)}
      ${iconAlert(56, 714)}
      ${sectionTitle(100, 730, '赔偿基数提示', C.red)}
      ${multiLine(56, 770, '十倍以实际支付价款为基数；数额较低时，食品安全法另有不足一千元按一千元计算的规定（以法院认定为准），勿仅主张退还餐费。', { maxChars: 42 })}

      <g transform="translate(40,868)">
        ${summaryTile(0, 0, 200, '异物', '通常属不合格', C.blue)}
        ${summaryTile(210, 0, 200, '消费', '生活所需', C.green)}
        ${summaryTile(420, 0, 200, '倍数', '价款×10', C.orange)}
        ${summaryTile(630, 0, 150, '证据', '订单与影像', C.navy)}
      </g>
      ${iconCalculator(780, 868)}
    `,
  },
  {
    file: '02-索赔要备齐什么.png',
    title: '想打赢：证据与诉讼主体',
    subtitle: '订单 · 异物 · 沟通记录 · 被告',
    body: () => `
      ${panel(40, 212, 820, 318, C.white, C.blue)}
      ${iconPhoneOrder(52, 228)}
      ${sectionTitle(108, 232, '证据四件套', C.blue)}
      ${multiLine(56, 272, [
        '① 外卖订单截图（店名、下单时间、金额、配送信息）',
        '② 支付记录（微信、支付宝等电子账单）',
        '③ 开箱过程录像及异物特写（建议连续拍摄）',
        '④ 与商家、平台客服沟通记录（含时间与诉求）',
      ], { fontSize: 20, maxChars: 40, lineHeight: 36 })}
      ${iconCameraEvidence(720, 380)}

      ${panel(40, 546, 400, 288, C.blueLight, C.blue)}
      ${sectionTitle(56, 566, '起诉找谁', C.blue)}
      ${multiLine(56, 606, [
        '· 主要起诉餐饮服务经营者',
        '· 平台明知仍提供服务的，',
        '  可能承担相应责任',
        '· 小作坊、摊贩不合格食品',
        '  第4条亦可主张十倍',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 546, 400, 288, C.orangeLight, C.orange)}
      ${sectionTitle(476, 566, '行政投诉', C.orange)}
      ${multiLine(480, 606, [
        '· 12315 / 12345 食品安全投诉',
        '· 平台食安险或先行赔付机制',
        '· 监管部门调查结论可作证据',
        '· 涉嫌违法犯罪，法院可移送',
        '  （第17条）',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 852, 820, 108, C.greenLight, C.green)}
      ${iconShieldCheck(56, 868, C.green)}
      ${multiLine(100, 892, '经营者主张“知假买假”的，应由经营者举证（第12条）。消费者未故意购买问题食品的，一般无需自证“不知情”。', { maxChars: 42, fill: C.green })}
    `,
  },
  {
    file: '03-十倍怎么算.png',
    title: '赔偿如何计算',
    subtitle: '价款十倍 · 合理消费 · 法定兜底',
    body: () => `
      ${panel(40, 212, 820, 172, C.goldLight, C.gold)}
      ${iconCalculator(52, 224)}
      ${sectionTitle(108, 232, '基本公式（第1条）', C.gold)}
      ${renderTextTag({ x: W / 2, y: 300, text: '惩罚性赔偿金 ＝ 实际支付价款 × 10', fill: C.ink, fontSize: 30, anchor: 'middle', weight: 'bold' })}
      ${renderTextTag({ x: W / 2, y: 344, text: '基数为向商家或平台实际支付的餐费，非商品标价', fill: C.sub, fontSize: 17, anchor: 'middle' })}

      ${panel(40, 400, 400, 248, C.blueLight, C.blue)}
      ${sectionTitle(56, 420, '数额较低时', C.blue)}
      ${multiLine(56, 460, [
        '· 十倍赔偿可能仅为数十至数百元',
        '· 食品安全法第148条',
        '  “不足一千按一千”规则',
        '· 具体以法院审理认定为准',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 400, 400, 248, C.redLight, C.red)}
      ${sectionTitle(476, 420, '知假买假', C.red)}
      ${multiLine(480, 460, [
        '· 第12条：合理生活消费范围内',
        '  仍可能支持十倍',
        '· 第13、14条：短时间多次购买',
        '  牟利情形将限制支持范围',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 664, 820, 168, C.greenLight, C.green)}
      ${sectionTitle(56, 684, '欺诈情形（第9条）', C.green)}
      ${multiLine(56, 724, '经营者明知不符合食品安全标准仍销售，构成欺诈的，消费者亦可选择依照消费者权益保护法主张“退一赔三”（最低五百元），择有利方式起诉。', { maxChars: 42 })}

      ${panel(40, 848, 820, 88, C.white, C.border)}
      ${multiLine(56, 880, '可同时主张医疗费、误工费等实际损失；惩罚性赔偿与返还价款可一并提出（第2条）。', { maxChars: 42, fontSize: 19, fill: C.sub })}
    `,
  },
  {
    file: '04-这些情况要小心.png',
    title: '维权红线与正途',
    subtitle: '禁止碰瓷 · 依法维权',
    footer: '法律保障真实消费受害者的惩罚性赔偿请求，对恶意制造违法假象、敲诈勒索等行为不予保护。',
    body: () => `
      ${panel(40, 212, 820, 198, C.redLight, C.red)}
      ${iconProhibit(56, 228)}
      ${sectionTitle(100, 232, '驳回或移送情形（第15、16条）', C.red)}
      ${multiLine(56, 272, [
        '· 自行向食品中投放异物后索赔，涉嫌敲诈勒索的，移送公安机关',
        '· 恶意制造违法假象提起诉讼的，驳回诉讼请求',
        '· 以投诉相要挟索取高额“私了金”的，可能承担刑事责任',
      ], { fontSize: 20, maxChars: 40, lineHeight: 34 })}

      ${panel(40, 424, 400, 256, '#f7fafc', C.border)}
      ${sectionTitle(56, 444, '与异物无关情形', C.sub)}
      ${multiLine(56, 484, [
        '· 标签瑕疵不影响安全且',
        '  不造成误导（第7、8条）',
        '· 符合地方规定且食品本身合格',
        '· 药品民间偏方等例外',
        '  （第11条）',
      ], { fontSize: 19, maxChars: 18, lineHeight: 32, fill: C.sub })}

      ${panel(460, 424, 400, 256, C.blueLight, C.blue)}
      ${iconShieldCheck(476, 440, C.blue)}
      ${sectionTitle(524, 444, '外卖维权路径', C.blue)}
      ${multiLine(480, 484, [
        '· 真实消费与真实异物',
        '· 合理数量，非批量牟利',
        '· 先协商，保留沟通记录',
        '· 依法起诉，拒绝碰瓷',
        '· 恶意诉讼侵害名誉的，',
        '  经营者可反诉（第16条）',
      ], { fontSize: 19, maxChars: 18, lineHeight: 32 })}

      ${panel(40, 696, 820, 120, C.greenLight, C.green)}
      ${sectionTitle(56, 716, '实务要点', C.green)}
      ${multiLine(56, 756, '固定证据、向平台及监管部门投诉、协商不成提起诉讼，是外卖异物维权的高效路径。', { maxChars: 42 })}

      <g transform="translate(40,836)">
        ${summaryTile(0, 0, 200, '拒绝', '碰瓷讹诈', C.red)}
        ${summaryTile(210, 0, 200, '真实', '异物与订单', C.green)}
        ${summaryTile(420, 0, 200, '合理', '生活消费', C.blue)}
        ${summaryTile(630, 0, 150, '依法', '起诉维权', C.navy)}
      </g>
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
