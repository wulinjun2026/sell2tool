const fs = require('fs');
const path = require('path');
const { ROOT } = require('../db');

const BUNDLED_HEITI = path.join(ROOT, 'assets', 'fonts', 'STHeiti-Medium.ttc');
const BUNDLED_CJK = path.join(ROOT, 'assets', 'fonts', 'NotoSansSC-Regular.otf');
const BUNDLED_CJK_BOLD = path.join(ROOT, 'assets', 'fonts', 'NotoSansSC-Bold.otf');
const BUNDLED_LATIN = path.join(ROOT, 'assets', 'fonts', 'Arial.ttf');

/** resvg 需与字体文件内部名称一致 */
const CJK_FAMILY = 'Heiti TC';
const NOTO_FAMILY = 'Noto Sans SC';
const LATIN_FAMILY = 'Arial';

const SYSTEM_DARWIN_CJK = '/System/Library/Fonts/STHeiti Medium.ttc';
const SYSTEM_DARWIN_ARIAL = '/System/Library/Fonts/Supplemental/Arial.ttf';
const SYSTEM_LINUX = [
  {
    family: NOTO_FAMILY,
    files: [
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    ],
  },
  {
    family: 'WenQuanYi Micro Hei',
    files: ['/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'],
  },
];

let cached;

function firstExisting(paths) {
  return paths.find((p) => p && fs.existsSync(p));
}

function ensurePosterFonts() {
  const dir = path.dirname(BUNDLED_LATIN);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const copies = [
    [BUNDLED_HEITI, SYSTEM_DARWIN_CJK],
    [BUNDLED_LATIN, SYSTEM_DARWIN_ARIAL],
  ];
  copies.forEach(([dest, src]) => {
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });
}

function invalidateFontCache() {
  cached = null;
}

/** 解析长图导出字体：优先 bundled，CJK + Arial */
function resolveExportFont() {
  if (cached) return cached;

  ensurePosterFonts();

  const files = [];
  let family = CJK_FAMILY;
  let latinFamily = LATIN_FAMILY;

  const latin = firstExisting([BUNDLED_LATIN, SYSTEM_DARWIN_ARIAL]);
  if (latin) files.push(latin);

  if (fs.existsSync(BUNDLED_CJK)) {
    family = NOTO_FAMILY;
    files.unshift(BUNDLED_CJK);
    if (fs.existsSync(BUNDLED_CJK_BOLD)) files.unshift(BUNDLED_CJK_BOLD);
  } else if (fs.existsSync(BUNDLED_HEITI)) {
    family = CJK_FAMILY;
    files.unshift(BUNDLED_HEITI);
  } else if (process.platform === 'darwin' && fs.existsSync(SYSTEM_DARWIN_CJK)) {
    files.unshift(SYSTEM_DARWIN_CJK);
  } else if (process.platform === 'linux') {
    for (const candidate of SYSTEM_LINUX) {
      const file = firstExisting(candidate.files);
      if (file) {
        family = candidate.family;
        files.unshift(file);
        break;
      }
    }
  }

  if (!files.length) {
    cached = {
      family: 'sans-serif',
      latinFamily: LATIN_FAMILY,
      files: [],
      loadSystemFonts: true,
      sansSerifFamily: LATIN_FAMILY,
    };
    return cached;
  }

  if (!latin) {
    if (process.platform === 'linux') {
      const dejavu = firstExisting(['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']);
      if (dejavu) {
        files.push(dejavu);
        latinFamily = 'DejaVu Sans';
      }
    }
  }

  cached = {
    family,
    latinFamily,
    files,
    loadSystemFonts: false,
    sansSerifFamily: latinFamily,
  };
  return cached;
}

function getExportFontFamily() {
  const { family, latinFamily } = resolveExportFont();
  return `"${family}", "${latinFamily}", sans-serif`;
}

function getLatinFontFamily() {
  return resolveExportFont().latinFamily;
}

function getCjkFontFamily() {
  return resolveExportFont().family;
}

module.exports = {
  ensurePosterFonts,
  invalidateFontCache,
  resolveExportFont,
  getExportFontFamily,
  getLatinFontFamily,
  getCjkFontFamily,
};
