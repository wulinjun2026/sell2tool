/**
 * 长图导出质量：正式版 1080px 宽 + 更高嵌入分辨率
 */
const fs = require('fs');
const path = require('path');
const { initDb } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const { renderPosterToBuffer } = require('../server/services/posterRender');
const { fileToDataUri } = require('../server/services/posterImageEmbed');

const SAMPLE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

async function run() {
  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  const photoPath = path.join(require('../server/db').vehicleDir(vehicle.id), 'photos', 'exterior_front.jpg');
  fs.mkdirSync(path.dirname(photoPath), { recursive: true });
  fs.writeFileSync(photoPath, SAMPLE_JPEG);

  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: '画质测试',
    polishedDescription: '高清导出测试。',
  });

  const fullVehicle = await vehicleRepo.findById(db, vehicle.id);
  const dealer = await db.get('SELECT * FROM dealer_profile LIMIT 1');

  const full = await renderPosterToBuffer({
    vehicles: [fullVehicle],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: false,
  });

  const exportWidthOk = full.width === 1242;
  const sizeOk = full.fileSize > 100 * 1024;
  const heightScaledOk = full.height > full.width;

  const highResUri = await fileToDataUri(photoPath, {
    maxEdge: 2880,
    quality: 93,
    chromaSubsampling: '4:4:4',
    fastShrinkOnLoad: false,
  });
  const lowResUri = await fileToDataUri(photoPath, {
    maxEdge: 1200,
    quality: 80,
    chromaSubsampling: '4:2:0',
    fastShrinkOnLoad: true,
  });
  const embedQualityOk = highResUri.length >= lowResUri.length;

  console.log(exportWidthOk ? '✓ 正式导出宽度 1242px' : `✗ 正式宽度异常: ${full.width}`);
  console.log(sizeOk ? '✓ 正式 PNG 体积合理' : `✗ PNG 过小: ${full.fileSize}`);
  console.log(heightScaledOk ? '✓ 正式高度随宽度等比缩放' : '✗ 高度缩放异常');
  console.log(embedQualityOk ? '✓ 高清嵌入参数优于旧参数' : '✗ 嵌入质量参数异常');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  process.exit(exportWidthOk && sizeOk && heightScaledOk && embedQualityOk ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
