/**
 * 长图内嵌图片测试 - 验证 PNG 导出及 SVG 内嵌照片
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { initDb, vehicleDir } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const { renderPoster, buildPosterSvg } = require('../server/services/posterRender');

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

const DESC_TEXT = '21年宝马X5，3万公里，全程4S店保养，车况精品';

function isPng(buffer) {
  return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50;
}

async function addPhoto(db, vehicleId, category, slotKey, sortIndex) {
  const photoPath = path.join(vehicleDir(vehicleId), 'photos', `${category}_${slotKey}_${sortIndex}.jpg`);
  fs.mkdirSync(path.dirname(photoPath), { recursive: true });
  fs.writeFileSync(photoPath, TINY_JPEG);
  await db.run(
    `INSERT INTO vehicle_photos (id, vehicle_id, category, slot_key, file_path, sort_index, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    uuidv4(),
    vehicleId,
    category,
    slotKey,
    photoPath,
    sortIndex,
    TINY_JPEG.length,
    Date.now()
  );
}

async function run() {
  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);

  await addPhoto(db, vehicle.id, 'exterior', 'front', 0);
  await addPhoto(db, vehicle.id, 'exterior', 'rear', 0);
  await addPhoto(db, vehicle.id, 'exterior', 'left', 0);
  await addPhoto(db, vehicle.id, 'interior', 'center_console', 0);

  const current = await vehicleRepo.findById(db, vehicle.id);
  await vehicleRepo.saveVehicle(db, {
    ...current,
    extraDescription: DESC_TEXT,
    polishedDescription: DESC_TEXT,
  });

  const full = await vehicleRepo.findById(db, vehicle.id);
  const dealer = await db.get('SELECT * FROM dealer_profile LIMIT 1');
  const result = await renderPoster({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });

  const png = fs.readFileSync(result.filePath);
  const { svgDoc } = buildPosterSvg({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
  });
  const embedCount = (svgDoc.match(/<image /g) || []).length;
  const hasDesc = svgDoc.includes('产品介绍') && svgDoc.includes('21年宝马X5');

  console.log(isPng(png) && result.mimeType === 'image/png' ? '✓ 长图已导出为 PNG' : '✗ 长图格式不是 PNG');
  console.log(result.filePath.endsWith('.png') ? '✓ 文件扩展名为 .png' : '✗ 文件扩展名错误');
  console.log(embedCount >= 4 ? `✓ 渲染源包含 ${embedCount} 张内嵌照片` : `✗ 内嵌照片不足，仅 ${embedCount} 张`);
  console.log(hasDesc ? '✓ 长图包含产品介绍文案' : '✗ 长图未包含产品介绍');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  const ok = isPng(png) && embedCount >= 4 && hasDesc;
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
