/**
 * 长图文本乱码严格测试
 */
const fs = require('fs');
const path = require('path');
const { initDb, ROOT } = require('../server/db');
const dealerProfile = require('../server/services/dealerProfile');
const vehicleRepo = require('../server/services/vehicleRepository');
const { renderPoster, buildPosterSvg } = require('../server/services/posterRender');
const {
  sanitizePosterText,
  splitTextRuns,
  validatePosterSvg,
} = require('../server/services/posterText');
const { resolveExportFont } = require('../server/services/posterFonts');
const { svgToPng } = require('../server/services/posterExport');

const PROBLEM_SAMPLES = [
  '📝 产品介绍',
  '📞 13900139000',
  '电话：１３９００１３９０００',
  '编号: CC202606021723047',
  '3.98万，准14年奥迪A6L',
  '✨ 精品车况 🚗 欢迎咨询',
];

function assert(cond, msg) {
  console.log(cond ? `✓ ${msg}` : `✗ ${msg}`);
  return cond;
}

async function run() {
  let ok = true;

  PROBLEM_SAMPLES.forEach((sample) => {
    const cleaned = sanitizePosterText(sample);
    ok = assert(!/[\p{Extended_Pictographic}]/u.test(cleaned), `清洗 emoji: ${sample.slice(0, 12)}`) && ok;
  });

  const phoneRuns = splitTextRuns('电话:13900139000');
  ok = assert(phoneRuns.length >= 2, '电话行拆分为多段字体') && ok;

  const font = resolveExportFont();
  ok = assert(font.files.length >= 2, `已加载 CJK+拉丁字体 (${font.files.length} 个文件)`) && ok;

  const db = await initDb();
  const qrcodePath = path.join(dealerProfile.dealerDir(), 'test_qrcode.png');
  fs.copyFileSync(path.join(ROOT, 'assets', 'fixtures', 'sample_qrcode.png'), qrcodePath);

  await dealerProfile.update(db, {
    shopName: '测试车商张三',
    contactPhone: '13900139000',
    contactWechat: 'zhangsan_cars',
  });
  await dealerProfile.setQrcodePath(db, qrcodePath);

  const vehicle = await vehicleRepo.createDraft(db);
  const messyDesc =
    '📝 全款3.98万，准14年奥迪A6L 📋 自动挡2.0高配，表显15万公里 ✅ 分期0首付 💰';
  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: '奥迪A6L',
    extraDescription: messyDesc,
    polishedDescription: messyDesc,
  });

  const full = await vehicleRepo.findById(db, vehicle.id);
  const dealer = await dealerProfile.get(db);

  const { svgDoc } = buildPosterSvg({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });

  const validation = validatePosterSvg(svgDoc);
  ok = assert(validation.ok, `SVG 文本校验: ${validation.issues.join('; ') || '通过'}`) && ok;
  ok = assert(svgDoc.includes('产品介绍'), '包含产品介绍标题') && ok;
  ok = assert(svgDoc.includes('奥迪A6L') || svgDoc.includes('3.98万'), '包含产品正文') && ok;
  ok = assert(svgDoc.includes('13900139000'), '包含电话号码') && ok;
  ok = assert(
    svgDoc.includes('font-family="Heiti TC"') ||
      svgDoc.includes('font-family="Noto Sans SC"') ||
      svgDoc.includes('font-family="Arial"'),
    '电话行分字体渲染'
  ) && ok;
  ok = assert(svgDoc.includes('font-family="Arial">13900139000'), '电话数字使用 Arial') && ok;
  ok = assert(!/[\p{Extended_Pictographic}]/u.test(svgDoc), 'SVG 不含 emoji') && ok;

  const allTextHaveFont = (svgDoc.match(/<text\b[^>]*>/g) || []).every((tag) => /font-family=/.test(tag));
  ok = assert(allTextHaveFont, '所有 text 节点含 font-family') && ok;

  const result = await renderPoster({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });
  const png = fs.readFileSync(result.filePath);
  ok = assert(png[0] === 0x89 && png[1] === 0x50, 'PNG 导出成功') && ok;
  ok = assert(png.length > 5000, 'PNG 体积合理') && ok;

  const sampleSvg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="600" height="80"><style>text,tspan{font-family:${require('../server/services/posterFonts').getExportFontFamily()};}</style>${require('../server/services/posterText').renderPhoneText({ x: 300, y: 50, phone: '13900139000', fill: '#666' })}</svg>`;
  const samplePng = svgToPng(sampleSvg, 600);
  ok = assert(samplePng.length > 800, '电话样例 PNG 渲染成功') && ok;

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
