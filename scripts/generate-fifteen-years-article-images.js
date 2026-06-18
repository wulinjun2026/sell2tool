/**
 * 《缘分十五年：男人的独白》— 写实风格场景配图 × 4
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');
const { svgToPng } = require('../server/services/posterExport');
const { renderTextTag } = require('../server/services/posterText');
const { ensurePosterFonts } = require('../server/services/posterFonts');

const OUT_DIR = path.join(ROOT, 'output', '缘分十五年-男人的独白');
const W = 1200;
const H = 675;
let svgUid = 0;

const C = {
  ink: '#1a202c',
  sub: '#718096',
  warm: '#c9a227',
  warmLight: '#f6e05e',
  night: '#1a365d',
  nightDeep: '#0f172a',
  mist: '#a0aec0',
  white: '#ffffff',
};

function uid() {
  svgUid += 1;
  return `g${svgUid}`;
}

function buildSvg(scene, caption, chapter) {
  svgUid = 0;
  const footerGrad = uid();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="blurSoft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="${footerGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.82)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b1020"/>
  ${scene}
  <rect x="0" y="${H - 120}" width="${W}" height="120" fill="url(#${footerGrad})"/>
  ${renderTextTag({ x: 48, y: H - 72, text: chapter, fill: C.warmLight, fontSize: 18, weight: 'bold' })}
  ${renderTextTag({ x: 48, y: H - 38, text: caption, fill: '#e2e8f0', fontSize: 22 })}
  ${renderTextTag({ x: W - 48, y: H - 24, text: '缘分十五年 · 写实配图', fill: '#718096', fontSize: 14, anchor: 'end' })}
</svg>`;
}

/** 场景一：深圳夜色街头 */
function sceneShenzhen() {
  const sky = uid();
  const neon1 = uid();
  const neon2 = uid();
  return `
    <defs>
      <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1e3a5f"/>
        <stop offset="55%" stop-color="#2d3748"/>
        <stop offset="100%" stop-color="#171923"/>
      </linearGradient>
      <radialGradient id="${neon1}" cx="30%" cy="70%" r="45%">
        <stop offset="0%" stop-color="#ff6b6b" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#ff6b6b" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${neon2}" cx="75%" cy="55%" r="40%">
        <stop offset="0%" stop-color="#63b3ed" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#63b3ed" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#${sky})"/>
    <rect width="${W}" height="${H}" fill="url(#${neon1})"/>
    <rect width="${W}" height="${H}" fill="url(#${neon2})"/>

    <!-- 远处楼群 -->
    ${[80, 200, 340, 480, 620, 760, 900, 1020].map((x, i) => {
      const bh = 120 + (i % 4) * 55;
      const bw = 70 + (i % 3) * 25;
      const op = 0.35 + (i % 3) * 0.12;
      return `<rect x="${x}" y="${H - 80 - bh}" width="${bw}" height="${bh}" fill="#2d3748" opacity="${op}"/>`;
    }).join('')}

    <!-- 地铁指示牌 -->
    <rect x="720" y="380" width="120" height="48" rx="4" fill="#2c5282" opacity="0.9"/>
    ${renderTextTag({ x: 780, y: 412, text: '地铁', fill: '#fff', fontSize: 22, anchor: 'middle', weight: 'bold' })}
    <rect x="730" y="428" width="100" height="6" rx="2" fill="#4299e1"/>

    <!-- 街灯 -->
    <line x1="180" y1="120" x2="180" y2="520" stroke="#4a5568" stroke-width="3"/>
    <ellipse cx="180" cy="115" rx="28" ry="12" fill="#fefcbf" opacity="0.85" filter="url(#glow)"/>
    <ellipse cx="180" cy="520" rx="90" ry="18" fill="rgba(254,252,191,0.12)"/>

    <!-- 地面反光 -->
    <ellipse cx="600" cy="580" rx="420" ry="40" fill="rgba(99,179,237,0.08)"/>
    <rect x="0" y="540" width="${W}" height="135" fill="rgba(26,32,44,0.75)"/>

    <!-- 男子背影 -->
    <g transform="translate(420, 280)">
      <ellipse cx="50" cy="248" rx="55" ry="10" fill="rgba(0,0,0,0.35)"/>
      <ellipse cx="50" cy="42" rx="22" ry="26" fill="#2d3748"/>
      <path d="M28,68 Q50,58 72,68 L78,200 Q50,215 22,200 Z" fill="#1a365d"/>
      <rect x="38" y="200" width="10" height="48" fill="#2d3748"/>
      <rect x="58" y="200" width="10" height="48" fill="#2d3748"/>
      <rect x="20" y="90" width="18" height="70" rx="6" fill="#2d3748" transform="rotate(-8 29 125)"/>
      <rect x="62" y="90" width="18" height="70" rx="6" fill="#2d3748" transform="rotate(8 71 125)"/>
    </g>

    <!-- 潮热雾气 -->
    <rect x="0" y="480" width="${W}" height="120" fill="rgba(160,174,192,0.06)" filter="url(#blurSoft)"/>
  `;
}

/** 场景二：深夜微信重逢 */
function sceneWechatNight() {
  const room = uid();
  const screen = uid();
  return `
    <defs>
      <linearGradient id="${room}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1a202c"/>
      </linearGradient>
      <radialGradient id="${screen}" cx="50%" cy="45%" r="35%">
        <stop offset="0%" stop-color="#48bb78" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#48bb78" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#${room})"/>
    <rect width="${W}" height="${H}" fill="url(#${screen})"/>

    <!-- 床头与窗帘 -->
    <rect x="0" y="0" width="280" height="${H}" fill="#171923" opacity="0.6"/>
    <path d="M900,0 Q1050,200 920,${H} L${W},${H} L${W},0 Z" fill="#2d3748" opacity="0.5"/>

    <!-- 男子侧脸持机 -->
    <g transform="translate(520, 160)">
      <ellipse cx="120" cy="320" rx="140" ry="22" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="200" cy="100" rx="52" ry="60" fill="#3d4a5c"/>
      <path d="M155,155 Q200,140 245,160 L260,280 Q200,300 140,275 Z" fill="#2d3748"/>
      <!-- 手臂 -->
      <path d="M120,220 Q80,260 60,340" fill="none" stroke="#3d4a5c" stroke-width="28" stroke-linecap="round"/>
      <!-- 手机 -->
      <rect x="40" y="300" width="56" height="96" rx="8" fill="#1a202c" stroke="#4a5568" stroke-width="2"/>
      <rect x="46" y="308" width="44" height="72" rx="4" fill="#1c4532"/>
      ${renderTextTag({ x: 68, y: 352, text: '缘分还在', fill: '#9ae6b4', fontSize: 11, anchor: 'middle' })}
      <!-- 屏幕光映脸 -->
      <ellipse cx="195" cy="130" rx="30" ry="40" fill="#48bb78" opacity="0.15"/>
      <path d="M175,115 Q195,108 215,118" fill="none" stroke="#718096" stroke-width="2" opacity="0.5"/>
    </g>

    <!-- 茶杯 -->
    <ellipse cx="340" cy="520" rx="36" ry="8" fill="rgba(0,0,0,0.3)"/>
    <path d="M310,480 L310,510 Q340,525 370,510 L370,480 Z" fill="#4a5568" opacity="0.7"/>
    <ellipse cx="340" cy="480" rx="30" ry="8" fill="#718096" opacity="0.5"/>

    <!-- 泪光点缀 -->
    <circle cx="680" cy="220" r="2" fill="#90cdf4" opacity="0.6"/>
    <circle cx="695" cy="235" r="1.5" fill="#90cdf4" opacity="0.4"/>
  `;
}

/** 场景三：病后重逢 · 咖啡馆 */
function sceneReunionCafe() {
  const win = uid();
  return `
    <defs>
      <linearGradient id="${win}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cbd5e0"/>
        <stop offset="100%" stop-color="#a0aec0"/>
      </linearGradient>
    </defs>
    <!-- 窗外阴天 -->
    <rect x="0" y="0" width="520" height="${H}" fill="url(#${win})" opacity="0.55"/>
    <ellipse cx="200" cy="120" rx="180" ry="60" fill="#fff" opacity="0.35"/>
    <rect x="0" y="0" width="8" height="${H}" fill="#4a5568"/>

    <!-- 室内暖光 -->
    <rect x="520" y="0" width="${W - 520}" height="${H}" fill="#2d2419"/>
    <ellipse cx="900" cy="180" rx="200" ry="120" fill="#f6ad55" opacity="0.12" filter="url(#glow)"/>

    <!-- 圆桌 -->
    <ellipse cx="780" cy="480" rx="200" ry="28" fill="rgba(0,0,0,0.35)"/>
    <ellipse cx="780" cy="450" rx="180" ry="22" fill="#744210"/>
    <ellipse cx="780" cy="445" rx="170" ry="18" fill="#975a16"/>

    <!-- 两杯咖啡 -->
    ${[700, 860].map((x) => `
      <ellipse cx="${x}" cy="430" rx="22" ry="6" fill="#1a202c" opacity="0.2"/>
      <path d="M${x - 16},400 L${x - 16},425 Q${x},435 ${x + 16},425 L${x + 16},400 Z" fill="#f7fafc" opacity="0.85"/>
    `).join('')}

    <!-- 女子 -->
    <g transform="translate(620, 200)">
      <ellipse cx="60" cy="250" rx="50" ry="10" fill="rgba(0,0,0,0.25)"/>
      <ellipse cx="60" cy="50" rx="24" ry="28" fill="#4a3728"/>
      <path d="M35,78 Q60,68 85,78 L92,230 Q60,245 28,230 Z" fill="#553c2a"/>
      <path d="M30,100 Q10,140 5,180" fill="none" stroke="#553c2a" stroke-width="16" stroke-linecap="round"/>
    </g>

    <!-- 男子 -->
    <g transform="translate(880, 210)">
      <ellipse cx="60" cy="245" rx="50" ry="10" fill="rgba(0,0,0,0.25)"/>
      <ellipse cx="60" cy="48" rx="26" ry="30" fill="#2d3748"/>
      <path d="M32,76 Q60,66 88,76 L95,228 Q60,242 25,228 Z" fill="#1a365d"/>
      <path d="M95,120 Q125,150 130,190" fill="none" stroke="#1a365d" stroke-width="14" stroke-linecap="round"/>
    </g>

    <!-- 视线交汇暗示 -->
    <path d="M680,320 Q730,300 780,310" fill="none" stroke="${C.warm}" stroke-width="1" opacity="0.25" stroke-dasharray="4 6"/>
  `;
}

/** 场景四：无法赴约的夜晚 */
function sceneSickNight() {
  const city = uid();
  return `
    <defs>
      <linearGradient id="${city}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2c5282"/>
        <stop offset="40%" stop-color="#1a365d"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
    </defs>
    <!-- 窗外城市 -->
    <rect x="620" y="40" width="560" height="400" rx="4" fill="url(#${city})" stroke="#4a5568" stroke-width="2"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const x = 650 + i * 42;
      const h = 60 + (i % 5) * 35;
      return `<rect x="${x}" y="${400 - h}" width="28" height="${h}" fill="#2d3748" opacity="0.7"/>`;
    }).join('')}
    ${Array.from({ length: 20 }, (_, i) => `
      <circle cx="${640 + i * 26}" cy="${120 + (i % 7) * 18}" r="1.5" fill="#fefcbf" opacity="${0.3 + (i % 3) * 0.2}"/>
    `).join('')}

    <!-- 室内暗部 -->
    <rect x="0" y="0" width="620" height="${H}" fill="#171923"/>

    <!-- 书桌 -->
    <rect x="80" y="420" width="480" height="16" rx="2" fill="#4a3728"/>
    <rect x="100" y="436" width="8" height="100" fill="#3d3428"/>
    <rect x="520" y="436" width="8" height="100" fill="#3d3428"/>

    <!-- 药瓶 -->
    <rect x="140" y="360" width="36" height="58" rx="6" fill="#fff" opacity="0.9"/>
    <rect x="148" y="368" width="20" height="32" fill="#e53e3e" opacity="0.5"/>
    <rect x="190" y="372" width="28" height="46" rx="4" fill="#bee3f8" opacity="0.85"/>
    <rect x="230" y="378" width="50" height="8" fill="#edf2f7" opacity="0.6"/>
    <rect x="230" y="392" width="40" height="6" fill="#edf2f7" opacity="0.4"/>

    <!-- 手机黑屏 -->
    <rect x="380" y="368" width="52" height="88" rx="8" fill="#1a202c" stroke="#4a5568"/>
    <rect x="388" y="376" width="36" height="64" rx="3" fill="#0f172a"/>

    <!-- 男子伏案 -->
    <g transform="translate(260, 180)">
      <ellipse cx="100" cy="250" rx="110" ry="14" fill="rgba(0,0,0,0.35)"/>
      <ellipse cx="160" cy="70" rx="40" ry="46" fill="#2d3748"/>
      <path d="M120,115 Q160,105 200,120 L210,230 Q160,250 110,235 Z" fill="#1a365d"/>
      <path d="M90,200 Q50,240 30,300" fill="none" stroke="#2d3748" stroke-width="22" stroke-linecap="round"/>
      <path d="M200,180 Q240,220 250,280" fill="none" stroke="#2d3748" stroke-width="18" stroke-linecap="round"/>
    </g>

    <!-- 台灯暖光 -->
    <line x1="560" y1="280" x2="560" y2="420" stroke="#4a5568" stroke-width="2"/>
    <path d="M520,280 L600,280 L580,300 Z" fill="#d69e2e" opacity="0.7"/>
    <ellipse cx="560" cy="420" rx="80" ry="20" fill="#f6ad55" opacity="0.1"/>
  `;
}

const IMAGES = [
  {
    file: '01-深圳初见-一生的坐标.png',
    chapter: '一、初见',
    caption: '火车、地铁、街灯——那一面，成了我一生的坐标',
    scene: sceneShenzhen,
  },
  {
    file: '02-微信重逢-缘分还在.png',
    chapter: '二、十五年',
    caption: '屏幕那头一句「缘分还在」，让我在黑暗里湿了眼眶',
    scene: sceneWechatNight,
  },
  {
    file: '03-病后重逢-性情成溪.png',
    chapter: '三、重病之后',
    caption: '劫后余生，在克制崩塌的边缘，把两颗心再缝在一起',
    scene: sceneReunionCafe,
  },
  {
    file: '04-无法赴约的夜晚.png',
    chapter: '六、如今',
    caption: '病与穷压顶，比任何时候更需要你，却不敢轻易说「明天见」',
    scene: sceneSickNight,
  },
];

async function main() {
  ensurePosterFonts();
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const img of IMAGES) {
    const svg = buildSvg(img.scene(), img.caption, img.chapter);
    const png = svgToPng(svg, W);
    fs.writeFileSync(path.join(OUT_DIR, img.file), png);
    console.log('✓', img.file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
