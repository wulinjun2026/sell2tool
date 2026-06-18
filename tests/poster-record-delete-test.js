/**
 * 删除单车长图生成记录 API
 */
const { initDb } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const posterGenerationRepo = require('../server/services/posterGenerationRepository');

async function run() {
  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  await posterGenerationRepo.create(db, {
    vehicleIds: [vehicle.id],
    templateId: 'tpl_simple_01',
    width: 750,
    height: 1000,
    fileSize: 1000,
    durationMs: 100,
    isPreview: false,
  });

  const before = await vehicleRepo.findById(db, vehicle.id);
  const hasBefore = !!before.lastPosterGeneratedAt;

  const removed = await posterGenerationRepo.deleteAllForVehicle(db, vehicle.id);
  const after = await vehicleRepo.findById(db, vehicle.id);

  console.log(hasBefore ? '✓ 生成前有长图记录' : '✗ 生成记录未写入');
  console.log(removed >= 1 ? '✓ 删除生成记录条数正确' : '✗ 未删除生成记录');
  console.log(!after.lastPosterGeneratedAt ? '✓ 删除后车辆无长图时间戳' : '✗ 仍有长图标记');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  process.exit(hasBefore && removed >= 1 && !after.lastPosterGeneratedAt ? 0 : 1);
}

run().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
