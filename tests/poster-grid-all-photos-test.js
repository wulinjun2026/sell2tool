/**
 * 预览/正式长图均应包含全部上传实拍（除主图重复外）
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { initDb, vehicleDir } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const dealerProfile = require('../server/services/dealerProfile');
const { renderPosterToBuffer } = require('../server/services/posterRender');

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

const SLOTS = [
  ['exterior', 'front'],
  ['exterior', 'rear'],
  ['exterior', 'left45'],
  ['exterior', 'left'],
  ['exterior', 'right45'],
  ['exterior', 'right'],
  ['interior', 'center_console'],
  ['interior', 'screen'],
];

async function addPhoto(db, vehicleId, category, slotKey) {
  const photoPath = path.join(vehicleDir(vehicleId), 'photos', `${category}_${slotKey}.jpg`);
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
    0,
    TINY_JPEG.length,
    Date.now()
  );
}

async function run() {
  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  for (const [category, slotKey] of SLOTS) {
    await addPhoto(db, vehicle.id, category, slotKey);
  }
  const full = await vehicleRepo.findById(db, vehicle.id);
  const dealer = await dealerProfile.get(db);

  const preview = await renderPosterToBuffer({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: true,
  });
  const finalRender = await renderPosterToBuffer({
    vehicles: [full],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: false,
  });

  const heightMatch = preview.height === finalRender.height;
  const previewTallEnough = preview.height > 1200;

  console.log(heightMatch ? '✓ 预览与正式长图高度一致（含全部网格图）' : `✗ 高度不一致 preview=${preview.height} final=${finalRender.height}`);
  console.log(previewTallEnough ? '✓ 预览长图高度反映多图网格' : `✗ 预览高度偏低 ${preview.height}`);

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  process.exit(heightMatch && previewTallEnough ? 0 : 1);
}

run().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
