/**
 * 长图底部姓名、电话、编号与正文主色一致
 */
const fs = require('fs');
const path = require('path');
const { initDb } = require('../server/db');
const dealerProfile = require('../server/services/dealerProfile');
const vehicleRepo = require('../server/services/vehicleRepository');
const { buildPosterCompose } = require('../server/services/posterRender');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const renderSrc = fs.readFileSync(path.join(__dirname, '../server/services/posterRender.js'), 'utf8');
  assert(renderSrc.includes('resolveBlockTextColor'), 'missing resolveBlockTextColor');
  assert(renderSrc.includes('footerTextColor'), 'footer should use unified text color');
  assert(renderSrc.includes('resolveBlockTextColor(theme, block)'), 'vehicle code should use body text color');

  const db = await initDb();
  await dealerProfile.update(db, {
    shopName: '测试车商张三',
    contactPhone: '13900139000',
    contactWechat: 'test',
  });
  const dealer = await dealerProfile.get(db);
  const vehicle = await vehicleRepo.createDraft(db);
  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: '宝马X5',
    extraDescription: '精品车况',
  });
  const full = await vehicleRepo.findById(db, vehicle.id);

  const composed = await buildPosterCompose({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: false,
  });
  const primary = '#1A1A1A';
  assert(composed.svgDoc.includes('测试车商张三'), 'missing dealer name');
  assert(composed.svgDoc.includes('13900139000'), 'missing phone');
  assert(composed.svgDoc.includes(`fill="${primary}"`), `should use textPrimary ${primary}`);
  assert(!composed.svgDoc.includes('fill="#999999"'), 'should not use gray secondary for footer fields');
  assert(!composed.svgDoc.includes('fill="#07C160"'), 'vehicle code should not use accent green');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  console.log('✓ 姓名、电话、编号使用正文主色 textPrimary');
})().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
