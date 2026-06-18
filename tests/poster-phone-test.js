/**
 * 电话数字渲染测试 - 确保数字走 Arial，不依赖系统 STHeiti 路径
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');
const { renderPhoneText } = require('../server/services/posterText');
const { ensurePosterFonts, invalidateFontCache, resolveExportFont } = require('../server/services/posterFonts');
const { svgToPng } = require('../server/services/posterExport');

function assert(cond, msg) {
  console.log(cond ? `✓ ${msg}` : `✗ ${msg}`);
  return cond;
}

function run() {
  let ok = true;
  invalidateFontCache();
  ensurePosterFonts();

  const font = resolveExportFont();
  ok = assert(font.files.length >= 2, `bundled CJK+Arial (${font.files.length} files)`) && ok;
  ok = assert(font.files.some((f) => f.includes('Arial.ttf')), '包含 bundled Arial') && ok;
  ok =
    assert(
      font.files.some((f) => f.includes('STHeiti-Medium.ttc') || f.includes('NotoSansSC')),
      '包含 bundled CJK 字体'
    ) && ok;

  const phoneSvg = renderPhoneText({ x: 300, y: 50, phone: '13900139000', fill: '#666666' });
  ok = assert(phoneSvg.includes('电话:'), '包含电话标签') && ok;
  ok = assert(phoneSvg.includes('font-family="Arial">13900139000'), '数字节点指定 Arial') && ok;
  ok = assert(phoneSvg.split('<text').length === 3, '电话拆为两个 text 节点') && ok;

  const arial = path.join(ROOT, 'assets/fonts/Arial.ttf');
  const heiti = path.join(ROOT, 'assets/fonts/STHeiti-Medium.ttc');
  const svgDoc = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="600" height="80">
    <rect width="600" height="80" fill="#f5f5f5"/>
    ${phoneSvg}
  </svg>`;
  const png = svgToPng(svgDoc, 600);
  ok = assert(png.length > 800, '电话 PNG 渲染成功') && ok;

  const resvgOnlyBundled = new (require('@resvg/resvg-js').Resvg)(svgDoc, {
    fitTo: { mode: 'width', value: 600 },
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'Heiti TC',
      sansSerifFamily: 'Arial',
      fontFiles: [heiti, arial],
    },
  }).render().asPng();
  fs.writeFileSync('/tmp/poster-phone-bundled-test.png', resvgOnlyBundled);
  ok = assert(resvgOnlyBundled.length > 800, '仅 bundled 字体时 PNG 正常') && ok;

  process.exit(ok ? 0 : 1);
}

run();
