/**
 * 多车长图分割线测试 - 验证编号与分割线结合且样式突出
 */
const fs = require('fs');
const { initDb } = require('../server/db');
const dealerProfile = require('../server/services/dealerProfile');
const vehicleRepo = require('../server/services/vehicleRepository');
const { renderPoster, buildPosterSvg } = require('../server/services/posterRender');

async function run() {
  const db = await initDb();
  const dealer = await dealerProfile.get(db);
  const v1 = await vehicleRepo.createDraft(db);
  const v2 = await vehicleRepo.createDraft(db);

  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, v1.id)),
    brandModel: '宝马X5',
    extraDescription: '第一台车',
  });
  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, v2.id)),
    brandModel: '奥迪A6',
    extraDescription: '第二台车',
  });

  const full1 = await vehicleRepo.findById(db, v1.id);
  const full2 = await vehicleRepo.findById(db, v2.id);

  const result = await renderPoster({
    vehicles: [full1, full2],
    templateId: 'tpl_simple_01',
    dealer,
  });

  const png = fs.readFileSync(result.filePath);
  const { svgDoc } = buildPosterSvg({
    vehicles: [full1, full2],
    templateId: 'tpl_simple_01',
    dealer,
  });
  const hasFirstCode = svgDoc.includes('编号:') && svgDoc.includes(`>${full1.code}</text>`);
  const hasSecondCode = svgDoc.includes(`编号 ${full2.code}`) || svgDoc.includes(`>${full2.code}</text>`);
  const hasBoldLine = svgDoc.includes('stroke-width="3"');
  const hasBadge = svgDoc.includes('font-weight="700"');
  const isPng = png[0] === 0x89 && png[1] === 0x50;

  console.log(isPng ? '✓ 多车长图已导出为 PNG' : '✗ 多车长图格式不是 PNG');
  console.log(hasFirstCode ? `✓ 第一台车显示编号 ${full1.code}` : '✗ 第一台车未显示编号');
  console.log(hasSecondCode ? `✓ 分割线包含下一台车辆编号 ${full2.code}` : '✗ 分割线未包含车辆编号');
  console.log(hasBoldLine ? '✓ 分割线加粗突出' : '✗ 分割线未加粗');
  console.log(hasBadge ? '✓ 编号标签样式突出' : '✗ 编号标签未突出');

  await vehicleRepo.deleteVehicle(db, v1.id);
  await vehicleRepo.deleteVehicle(db, v2.id);
  process.exit(isPng && hasFirstCode && hasSecondCode && hasBoldLine && hasBadge ? 0 : 1);
}

run().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
