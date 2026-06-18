/**
 * 葫芦岛中央生态环保督察整改 — 知识示意图 × 4
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');
const { svgToPng } = require('../server/services/posterExport');
const { renderTextTag } = require('../server/services/posterText');
const { ensurePosterFonts } = require('../server/services/posterFonts');

const OUT_DIR = path.join(ROOT, 'output', 'huludao-eco-inspection-article');
const W = 900;
const H = 1200;
let svgUid = 0;

const C = {
  ink: '#1c2833',
  sub: '#5d6d7e',
  navy: '#1a365d',
  blue: '#2c5282',
  blueLight: '#ebf4ff',
  teal: '#234e52',
  tealLight: '#e6fffa',
  orange: '#c05621',
  orangeLight: '#fffaf0',
  green: '#276749',
  greenLight: '#f0fff4',
  red: '#9b2c2c',
  redLight: '#fff5f5',
  gold: '#b7791f',
  goldLight: '#fffff0',
  water: '#2b6cb0',
  waterLight: '#bee3f8',
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

function ecoHeader(title, subtitle) {
  const g1 = uid();
  const g2 = uid();
  return `
    <defs>
      <linearGradient id="${g1}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#285e61"/>
        <stop offset="100%" stop-color="#1a365d"/>
      </linearGradient>
      <linearGradient id="${g2}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.08)"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="196" fill="url(#${g1})"/>
    <rect width="${W}" height="196" fill="url(#${g2})"/>
    <path d="M0,160 Q200,140 400,155 T800,150 L900,148 L900,196 L0,196 Z" fill="${C.water}" opacity="0.25"/>
    ${renderTextTag({ x: W / 2, y: 68, text: title, fill: '#fff', fontSize: 32, anchor: 'middle', weight: 'bold' })}
    ${renderTextTag({ x: W / 2, y: 108, text: subtitle, fill: '#a0aec0', fontSize: 20, anchor: 'middle' })}
    ${renderTextTag({ x: W / 2, y: 142, text: '中央生态环保督察 · 生活污水与黑臭水体整治', fill: '#718096', fontSize: 16, anchor: 'middle' })}
    ${renderTextTag({ x: W / 2, y: 172, text: '葫芦岛典型案例整改要点', fill: '#90cdf4', fontSize: 15, anchor: 'middle' })}
    ${iconRiver(48, 52)}
    ${iconShieldGov(780, 48)}
  `;
}

function ecoFooter(note) {
  const fy = H - 92;
  return `
    ${panel(32, fy, 836, 72, '#edf2f7', C.border)}
    ${multiLine(48, fy + 28, note, { fontSize: 17, fill: C.sub, maxChars: 44, lineHeight: 24 })}
    ${renderTextTag({ x: W - 40, y: H - 24, text: '整改成效须经得起群众与历史检验', fill: '#a0aec0', fontSize: 14, anchor: 'end' })}
  `;
}

function iconRiver(x, y) {
  const g = uid();
  return `
    <g transform="translate(${x},${y})" opacity="0.9">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#63b3ed"/>
          <stop offset="100%" stop-color="#2b6cb0"/>
        </linearGradient>
      </defs>
      <path d="M8,50 Q30,35 52,50 T96,50" fill="none" stroke="url(#${g})" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="52" cy="58" rx="40" ry="6" fill="rgba(43,108,176,0.2)"/>
      <circle cx="24" cy="42" r="4" fill="#bee3f8" opacity="0.8"/>
      <circle cx="72" cy="38" r="3" fill="#bee3f8" opacity="0.6"/>
    </g>
  `;
}

function iconShieldGov(x, y) {
  return `
    <g transform="translate(${x},${y})" opacity="0.88">
      <path d="M28,4 L48,14 L48,38 Q28,54 8,38 L8,14 Z" fill="${C.teal}" opacity="0.2" stroke="${C.teal}" stroke-width="1.5"/>
      <rect x="18" y="22" width="20" height="14" rx="2" fill="${C.teal}" opacity="0.5"/>
      <path d="M22,36 L34,36" stroke="${C.teal}" stroke-width="2"/>
    </g>
  `;
}

function iconPipe(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <rect x="4" y="28" width="56" height="16" rx="8" fill="#718096"/>
      <rect x="0" y="32" width="12" height="8" rx="4" fill="#4a5568"/>
      <rect x="52" y="32" width="12" height="8" rx="4" fill="#4a5568"/>
      <path d="M20,20 L44,20" stroke="#e53e3e" stroke-width="3" stroke-dasharray="4 3" opacity="0.7"/>
      <text x="32" y="16" text-anchor="middle" font-size="10" fill="${C.red}">断</text>
    </g>
  `;
}

function iconPlant(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <rect x="12" y="24" width="40" height="36" rx="3" fill="#edf2f7" stroke="#4a5568"/>
      <rect x="18" y="32" width="28" height="8" rx="2" fill="${C.waterLight}"/>
      <rect x="18" y="44" width="28" height="8" rx="2" fill="${C.greenLight}"/>
      <circle cx="32" cy="18" r="8" fill="#a0aec0" opacity="0.5"/>
    </g>
  `;
}

function iconLoop(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <path d="M28,8 A20,20 0 1,1 20,40" fill="none" stroke="${C.blue}" stroke-width="3"/>
      <polygon points="18,38 24,44 22,32" fill="${C.blue}"/>
    </g>
  `;
}

function buildSvg(body, title, subtitle, footerNote) {
  svgUid = 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${ecoHeader(title, subtitle)}
  ${body}
  ${ecoFooter(footerNote || '提示：整改须全链条闭环，杜绝点位式、补丁式、表面整改。')}
</svg>`;
}

const DIAGRAMS = [
  {
    file: '01-督察整改责任链.png',
    title: '督察整改责任链',
    subtitle: '通报 → 省级担责 → 现场督导 → 限期清零',
    body: () => `
      ${panel(40, 212, 820, 200, C.blueLight, C.blue)}
      ${sectionTitle(56, 232, '事件脉络', C.blue)}
      ${multiLine(56, 268, '中央生态环保督察通报葫芦岛生活污水收集处理短板；省委省政府扛政治责任，即知即改、边督边改、举一反三。', { maxChars: 42 })}
      ${multiLine(56, 332, '省委书记批示推进整改；省长赴现场督导检查，要求问题按期清零。', { maxChars: 42, fill: C.blue, weight: 'bold' })}

      <g transform="translate(80,440)">
        ${['中央督察通报', '省委省政府', '书记批示', '省长现场', '属地整改'].map((t, i) => `
          ${panel(i * 152, 0, 140, 72, C.white, C.blue)}
          ${renderTextTag({ x: i * 152 + 70, y: 42, text: t, fill: C.navy, fontSize: 17, anchor: 'middle', weight: 'bold' })}
          ${i < 4 ? `<polygon points="${i * 152 + 148},36 ${i * 152 + 158},42 ${i * 152 + 148},48" fill="${C.blue}"/>` : ''}
        `).join('')}
      </g>

      ${panel(40, 540, 400, 280, C.tealLight, C.teal)}
      ${sectionTitle(56, 560, '省级要求', C.teal)}
      ${multiLine(56, 600, [
        '· 扛牢整改主体责任',
        '· 省生态环境厅、住建厅督导',
        '· 限期消除污水直排点位',
        '· 黑臭水体排查整治',
        '· 全面排查同类问题',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 540, 400, 280, C.orangeLight, C.orange)}
      ${iconShieldGov(476, 556)}
      ${sectionTitle(524, 560, '政绩观', C.orange)}
      ${multiLine(480, 600, [
        '· 践行习近平生态文明思想',
        '· 树立正确政绩观',
        '· 完善制度机制',
        '· 提升污水收集处理效能',
        '· 以水环境质量改善取信于民',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 838, 820, 100, C.greenLight, C.green)}
      ${multiLine(56, 872, '核心：政治性、严肃性、重要性——整改不是应付检查，而是对群众负责。', { maxChars: 42, fill: C.green, weight: 'bold' })}
    `,
  },
  {
    file: '02-污水治理四大短板.png',
    title: '污水治理要啃的四块硬骨头',
    subtitle: '收不到 · 处理不好 · 反弹 · 管不好',
    body: () => `
      ${panel(40, 212, 820, 168, C.waterLight, C.water)}
      ${iconRiver(56, 224)}
      ${sectionTitle(108, 232, '典型案例表现', C.water)}
      ${multiLine(56, 272, [
        '· 凡和水务周边河道溢流、污水直排',
        '· 朝葫路泵站前200余米管道缺失，污水走明渠',
        '· 污水处理厂提标改造与设备更新滞后',
      ], { fontSize: 20, maxChars: 40, lineHeight: 34 })}

      <g transform="translate(40,400)">
        ${summaryTile(0, 0, 190, '收不到', '管网空白、直排口', C.red)}
        ${summaryTile(205, 0, 190, '处理不好', '能力、达标排放', C.orange)}
        ${summaryTile(410, 0, 190, '反弹', '黑臭返黑返臭', C.blue)}
        ${summaryTile(615, 0, 205, '管不好', '运维、数字化监管', C.teal)}
      </g>

      ${panel(40, 520, 400, 300, C.redLight, C.red)}
      ${iconPipe(52, 536)}
      ${sectionTitle(100, 552, '管网与直排', C.red)}
      ${multiLine(56, 592, [
        '· 拉网式排查污水直排口',
        '· 混错接、老化破损、雨污混流',
        '· 填补管网空白区',
        '· 结合“六张网”更新改造',
        '· 企业全流程数字化管控',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 520, 400, 300, C.greenLight, C.green)}
      ${iconPlant(476, 536)}
      ${sectionTitle(524, 552, '处理与修复', C.green)}
      ${multiLine(480, 592, [
        '· 进水、处理、出水稳定达标',
        '· 受污染河段与土壤修复',
        '· 提标改造与设施设备更新',
        '· 优化运行调度',
        '· 常态抓、长效治',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 840, 820, 108, C.orangeLight, C.orange)}
      ${multiLine(56, 876, '省长强调：摒弃“点位式”“补丁式”整改，工程+管理+生态措施并用，全覆盖“回头看”。', { maxChars: 42, fill: C.orange })}
    `,
  },
  {
    file: '03-黑臭水体整治闭环.png',
    title: '黑臭水体怎么治到位',
    subtitle: '排查走过场 · 整治不彻底 · 必须闭环',
    body: () => `
      ${panel(40, 212, 820, 188, C.redLight, C.red)}
      ${sectionTitle(56, 232, '暴露的问题', C.red)}
      ${multiLine(56, 268, [
        '· 龙港区：销号不到半年即返黑返臭',
        '· 兴城市：7次排查均报“未发现黑臭水体”',
        '· 说明排查走过场、整治不彻底、作风不扎实',
      ], { fontSize: 20, maxChars: 42, lineHeight: 34 })}

      ${panel(40, 416, 820, 200, C.blueLight, C.blue)}
      ${iconLoop(56, 432)}
      ${sectionTitle(100, 448, '五步闭环机制', C.blue)}
      ${multiLine(56, 488, '拉网式排查 → 清单化管理 → 限期治理 → 验收销号 → 长效监管', { fontSize: 24, maxChars: 36, fill: C.navy, weight: 'bold', lineHeight: 40 })}
      ${multiLine(56, 548, '加大排查频次；建立智慧监管体系；治理成效须经得起历史检验、得到群众认可。', { maxChars: 42 })}

      ${panel(40, 632, 400, 248, C.orangeLight, C.orange)}
      ${sectionTitle(56, 652, '现场点位', C.orange)}
      ${multiLine(56, 692, [
        '· 龙港区疏港路箱涵桥',
        '· 兴城市钓鱼台河岸',
        '· 与当地负责同志研治方案',
        '· 集中排查整治黑臭水体',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 632, 400, 248, C.tealLight, C.teal)}
      ${sectionTitle(476, 652, '追责问责', C.teal)}
      ${multiLine(480, 692, [
        '· 属地深刻反思、痛定思痛',
        '· 失察失管、失职失责严肃查处',
        '· 虚假整改、表面整改、敷衍整改',
        '  严肃追责问责',
        '· 推动黑臭水体动态清零',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 896, 820, 88, C.greenLight, C.green)}
      ${multiLine(56, 930, '黑臭水体是环境之伤、民生之痛——群众鼻子认账，返黑返臭就是整改不到位。', { maxChars: 42, fill: C.green })}
    `,
  },
  {
    file: '04-管网排查与六张网.png',
    title: '管网排查与长久之计',
    subtitle: '摸清底数 · 六张网 · 多元筹资 · 当下改+长久立',
    body: () => `
      ${panel(40, 212, 820, 220, C.white, C.blue)}
      ${sectionTitle(56, 232, '全域管网排查要摸清', C.blue)}
      ${multiLine(56, 272, [
        '· 管道混错接、老化破损淤堵',
        '· 雨污混流底数',
        '· 闭环管理、限期整改',
        '· 朝葫路案例：泵站有、配套管缺失→明渠输污',
      ], { fontSize: 20, maxChars: 40, lineHeight: 34 })}
      ${iconPipe(720, 280)}

      ${panel(40, 448, 400, 260, C.tealLight, C.teal)}
      ${sectionTitle(56, 468, '“六张网”建设', C.teal)}
      ${multiLine(56, 508, [
        '· 谋划建设“六张网”',
        '· 加快管网更新改造',
        '· 填补管网空白区',
        '· 为水环境质量巩固提升',
        '  打基础',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(460, 448, 400, 260, C.goldLight, '#b7791f')}
      ${sectionTitle(476, 468, '资金保障', '#b7791f')}
      ${multiLine(480, 508, [
        '· 创新多元筹资机制',
        '· 政策争取',
        '· 市场引入',
        '· 财政投入',
        '· 存量盘活',
      ], { fontSize: 20, maxChars: 18, lineHeight: 34 })}

      ${panel(40, 726, 820, 200, C.greenLight, C.green)}
      ${sectionTitle(56, 746, '长效机制', C.green)}
      ${multiLine(56, 786, [
        '· “当下改”与“长久立”相结合',
        '· 举一反三、标本兼治、综合治理',
        '· 常态化巡查监管',
        '· 联合执法惩戒机制',
        '· 改一个、规范一片、治理一域',
      ], { fontSize: 20, maxChars: 40, lineHeight: 34 })}

      <g transform="translate(40,948)">
        ${summaryTile(0, 0, 200, '排查', '拉网摸清', C.blue)}
        ${summaryTile(210, 0, 200, '建设', '六张网补空白', C.teal)}
        ${summaryTile(420, 0, 200, '资金', '多元筹资', '#b7791f')}
        ${summaryTile(630, 0, 150, '监管', '长效闭环', C.green)}
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
