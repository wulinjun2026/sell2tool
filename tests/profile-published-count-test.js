const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');

assert.ok(appSrc.includes('countPublishedVehicles') || serverSrc.includes('countPublishedVehicles'));
assert.ok(appSrc.includes('markVehiclesPublishedLocally'), 'should update local publish state');
assert.ok(appSrc.includes('await updateProfile'), 'profile stats should refresh after publish');
assert.ok(serverSrc.includes('countPublishedVehicles'), 'stats should count published vehicles');

const { initDb } = require('../server/db');
const vehicleRepo = require('../server/services/vehicleRepository');
const posterGenerationRepo = require('../server/services/posterGenerationRepository');

(async () => {
  const db = await initDb();
  const v1 = await vehicleRepo.createDraft(db);
  const v2 = await vehicleRepo.createDraft(db);

  assert.strictEqual(await vehicleRepo.countPublishedVehicles(db), 0);

  const record = await posterGenerationRepo.create(db, {
    vehicleIds: [v1.id, v2.id],
    templateId: 'tpl_simple_01',
    width: 750,
    height: 1200,
    fileSize: 1000,
    durationMs: 100,
    isPreview: false,
  });
  await vehicleRepo.markPosterGenerated(db, [v1.id, v2.id], 'tpl_simple_01');

  assert.strictEqual(await vehicleRepo.countPublishedVehicles(db), 2);

  await posterGenerationRepo.deleteById(db, record.id);
  assert.strictEqual(await vehicleRepo.countPublishedVehicles(db), 0);

  await vehicleRepo.deleteVehicle(db, v1.id);
  await vehicleRepo.deleteVehicle(db, v2.id);

  console.log('✓ 我的页已发布数量统计逻辑就绪');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
