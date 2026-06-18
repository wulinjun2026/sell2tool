/**
 * 经销商资料 + 长图底部信息测试
 */
const fs = require('fs');
const path = require('path');
const { initDb, ROOT } = require('../server/db');
const dealerProfile = require('../server/services/dealerProfile');
const vehicleRepo = require('../server/services/vehicleRepository');
const { renderPoster, buildPosterSvg } = require('../server/services/posterRender');

async function run() {
  const db = await initDb();
  const qrcodePath = path.join(dealerProfile.dealerDir(), 'test_qrcode.png');
  fs.copyFileSync(
    path.join(ROOT, 'assets', 'fixtures', 'sample_qrcode.png'),
    qrcodePath
  );

  await dealerProfile.update(db, {
    shopName: '测试车商张三',
    contactPhone: '13900139000',
    contactWechat: 'zhangsan_cars',
  });
  await dealerProfile.setQrcodePath(db, qrcodePath);
  const dealer = await dealerProfile.get(db);

  const vehicle = await vehicleRepo.createDraft(db);
  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: '测试车型',
    extraDescription: '测试描述',
  });

  const full = await vehicleRepo.findById(db, vehicle.id);
  const result = await renderPoster({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });

  const png = fs.readFileSync(result.filePath);
  const { svgDoc } = buildPosterSvg({ vehicles: [full], templateId: 'tpl_simple_01', dealer });
  const hasName = svgDoc.includes('测试车商张三');
  const hasPhone = svgDoc.includes('电话:') && svgDoc.includes('13900139000');
  const hasQrcode = svgDoc.includes('data:image/png;base64,');
  const noEmojiPhone = !svgDoc.includes('📞 13900139000');
  const noTinyQrcodeOnly = !svgDoc.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ');
  let codeBelowQr = true;
  const qrMatch = svgDoc.match(/<image[^>]+y="(\d+)"[^>]+height="(\d+)"/);
  const codeYMatch = svgDoc.match(
    /<text x="[^"]+" y="(\d+)" fill="[^"]+" font-size="18" font-family="Arial"[^>]*>/
  );
  if (qrMatch && codeYMatch) {
    const qrY = parseInt(qrMatch[1], 10);
    const qrH = parseInt(qrMatch[2], 10);
    const codeY = parseInt(codeYMatch[1], 10);
    codeBelowQr = codeY > qrY + qrH;
  }

  const isPng = png[0] === 0x89 && png[1] === 0x50;
  console.log(isPng ? '✓ 长图已导出为 PNG' : '✗ 长图格式不是 PNG');
  console.log(hasName ? '✓ 长图包含店铺姓名' : '✗ 长图未包含店铺姓名');
  console.log(hasPhone ? '✓ 长图包含联系电话' : '✗ 长图未包含联系电话');
  console.log(noEmojiPhone ? '✓ 电话行不使用 emoji' : '✗ 电话行仍含 emoji');
  console.log(hasQrcode && noTinyQrcodeOnly ? '✓ 长图内嵌有效二维码' : '✗ 长图未内嵌有效二维码');
  console.log(codeBelowQr ? '✓ 车辆编号位于二维码下方' : '✗ 车辆编号遮挡二维码');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  process.exit(
    isPng && hasName && hasPhone && noEmojiPhone && hasQrcode && noTinyQrcodeOnly && codeBelowQr ? 0 : 1
  );
}

run().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
