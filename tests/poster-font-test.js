/**
 * 长图中文字体测试 - 验证 SVG 注入 font-family 且 resvg 能加载 CJK 字体
 */
const fs = require('fs');
const { initDb } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const { renderPoster, buildPosterSvg } = require('../server/services/posterRender');
const { resolveExportFont } = require('../server/services/posterFonts');
const { svgToPng } = require('../server/services/posterExport');

async function run() {
  const font = resolveExportFont();
  const hasFontFiles = font.files.length > 0 || font.loadSystemFonts;
  console.log(hasFontFiles ? `✓ 已解析导出字体: ${font.family}` : '✗ 未找到可用中文字体');

  const sampleSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60">
  <style>text { font-family: "${font.family}", sans-serif; }</style>
  <text x="8" y="40" font-size="28">推荐卖点</text>
</svg>`;
  const samplePng = svgToPng(sampleSvg, 300);
  const sampleOk = samplePng.length > 500;
  console.log(sampleOk ? '✓ 中文样例 PNG 渲染成功' : '✗ 中文样例 PNG 渲染失败');

  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  const current = await vehicleRepo.findById(db, vehicle.id);
  await vehicleRepo.saveVehicle(db, {
    ...current,
    extraDescription: '测试产品介绍文字',
  });
  const full = await vehicleRepo.findById(db, vehicle.id);
  const dealer = await db.get('SELECT * FROM dealer_profile LIMIT 1');
  const { svgDoc } = buildPosterSvg({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });
  const hasFontStyle = svgDoc.includes('font-family:');
  const usesPhoneLabel = svgDoc.includes('电话:') && !svgDoc.includes('📞');
  const noEmojiInSvg = !/[\p{Extended_Pictographic}]/u.test(svgDoc);
  const hasDescTitle = svgDoc.includes('产品介绍');
  console.log(hasFontStyle ? '✓ 长图 SVG 已注入 font-family' : '✗ 长图 SVG 缺少 font-family');
  console.log(usesPhoneLabel ? '✓ 电话行使用文字前缀' : '✗ 电话行仍使用 emoji');
  console.log(noEmojiInSvg ? '✓ 长图 SVG 不含 emoji' : '✗ 长图 SVG 仍含 emoji');
  console.log(hasDescTitle ? '✓ 长图包含产品介绍标题' : '✗ 长图缺少产品介绍标题');

  const result = await renderPoster({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });
  const png = fs.readFileSync(result.filePath);
  const isPng = png[0] === 0x89 && png[1] === 0x50;
  console.log(isPng ? '✓ 长图 PNG 导出成功' : '✗ 长图 PNG 导出失败');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  const ok = hasFontFiles && sampleOk && hasFontStyle && usesPhoneLabel && noEmojiInSvg && hasDescTitle && isPng;
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
