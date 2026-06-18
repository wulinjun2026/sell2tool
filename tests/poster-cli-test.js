/**
 * 子进程 CLI 长图渲染
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, vehicleDir } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const { spawnPosterRender } = require('../server/services/posterRenderWorker');

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

async function addPhoto(db, vehicleId) {
  const photoPath = path.join(vehicleDir(vehicleId), 'photos', 'exterior_front.jpg');
  fs.mkdirSync(path.dirname(photoPath), { recursive: true });
  fs.writeFileSync(photoPath, TINY_JPEG);
  await db.run(
    `INSERT INTO vehicle_photos (id, vehicle_id, category, slot_key, file_path, sort_index, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    uuidv4(),
    vehicleId,
    'exterior',
    'front',
    photoPath,
    0,
    TINY_JPEG.length,
    Date.now()
  );
}

async function run() {
  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  await addPhoto(db, vehicle.id);
  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: 'CLI测试车',
    polishedDescription: '子进程渲染测试',
  });

  const payload = await spawnPosterRender({
    vehicleIds: [vehicle.id],
    templateId: 'tpl_simple_01',
    previewMode: true,
  });

  assert.strictEqual(payload.ok, true);
  assert.ok(payload.pngBase64.length > 100, 'cli should return base64 png');
  assert.ok(payload.width <= 375, 'preview width should be small');

  const cliPath = path.join(__dirname, '../server/scripts/render-poster-cli.js');
  assert.ok(fs.existsSync(cliPath), 'cli script exists');

  console.log('✓ 子进程 CLI 长图渲染成功');
  console.log('✓ 返回 pngBase64 而非持久化文件');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
