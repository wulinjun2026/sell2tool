/**
 * 预览模式：内存输出、不写持久化 PNG；正式生成写入生成记录
 */
const fs = require('fs');
const path = require('path');
const { initDb } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const posterGenerationRepo = require('../server/services/posterGenerationRepository');
const { renderPosterToBuffer } = require('../server/services/posterRender');

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

async function run() {
  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  const photoPath = path.join(require('../server/db').vehicleDir(vehicle.id), 'photos', 'exterior_front.jpg');
  fs.mkdirSync(path.dirname(photoPath), { recursive: true });
  fs.writeFileSync(photoPath, TINY_JPEG);

  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: '测试车型',
    year: 2020,
    extraDescription: '车况良好',
    polishedDescription: '车况良好，欢迎咨询。',
  });

  const fullVehicle = await vehicleRepo.findById(db, vehicle.id);
  const dealer = await db.get('SELECT * FROM dealer_profile LIMIT 1');

  const preview = await renderPosterToBuffer({
    vehicles: [fullVehicle],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: true,
  });

  const full = await renderPosterToBuffer({
    vehicles: [fullVehicle],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: false,
  });

  await posterGenerationRepo.create(db, {
    vehicleIds: [vehicle.id],
    templateId: 'tpl_simple_01',
    width: full.width,
    height: full.height,
    fileSize: full.fileSize,
    durationMs: full.durationMs,
    isPreview: false,
  });
  await vehicleRepo.markPosterGenerated(db, [vehicle.id], 'tpl_simple_01');
  const mapped = await vehicleRepo.findById(db, vehicle.id);

  const previewOk =
    preview.previewMode === true &&
    preview.pngBuffer?.length > 0 &&
    preview.width <= 375;
  const fullOk = full.width >= 1242 && full.pngBuffer.length > preview.pngBuffer.length;
  const recordOk = mapped.hasPoster === true && mapped.lastPosterGeneratedAt > 0;
  const posterDir = path.join(require('../server/db').vehicleDir(vehicle.id), 'posters');
  const previewsDir = path.join(require('../server/db').vehicleDir(vehicle.id), 'previews');
  const noPersist = !fs.existsSync(posterDir) && !fs.existsSync(previewsDir);

  console.log(previewOk ? '✓ 预览模式内存输出且宽度 ≤375' : '✗ 预览模式异常');
  console.log(fullOk ? '✓ 正式导出宽度 ≥1242' : '✗ 正式导出异常');
  console.log(recordOk ? '✓ 正式生成写入生成记录' : '✗ 生成记录异常');
  console.log(noPersist ? '✓ 服务器未持久化 PNG 文件' : '✗ 仍存在持久化 PNG');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  process.exit(previewOk && fullOk && recordOk && noPersist ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
