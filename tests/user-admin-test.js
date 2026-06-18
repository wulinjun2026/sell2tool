/**
 * 管理员使用者状态 API 测试
 */
const assert = require('assert');
const { initDb } = require('../server/db');
const authService = require('../server/services/authService');
const userAdminService = require('../server/services/userAdminService');
const userRepo = require('../server/services/userRepository');
const vehicleRepo = require('../server/services/vehicleRepository');

process.env.AUTH_DEV_MODE = 'true';

(async () => {
  const db = await initDb();
  const phone = '13700137001';
  const existing = await userRepo.findByPhone(db, phone);
  if (existing) {
    await db.run('DELETE FROM vehicles WHERE user_id = ?', existing.id);
    await db.run('DELETE FROM users WHERE id = ?', existing.id);
  }

  const send = await authService.sendSmsCode(db, phone);
  const login = await authService.verifySmsCode(db, phone, send.devCode);
  assert.ok(login.user?.id);

  const overview1 = await userAdminService.getOverview(db);
  assert.ok(overview1.totalUsers >= 1);

  const list = await userAdminService.listUsers(db, { status: 'all' });
  assert.ok(list.users.some((u) => u.phone === phone));
  const row = list.users.find((u) => u.phone === phone);
  assert.strictEqual(row.status, 'trial_active');
  assert.strictEqual(row.canCreate, true);

  await vehicleRepo.createDraft(db, login.user.id);
  const updated = await userAdminService.listUsers(db, { q: phone.slice(-4) });
  assert.strictEqual(updated.users[0].used, 1);

  await userAdminService.setUserPlan(db, login.user.id, 'paid');
  const paidRow = (await userAdminService.listUsers(db, { q: phone })).users[0];
  assert.strictEqual(paidRow.status, 'paid');
  assert.strictEqual(paidRow.unlimited, true);

  const overview2 = await userAdminService.getOverview(db);
  assert.ok(overview2.paidUsers >= 1);

  await db.run('DELETE FROM vehicles WHERE user_id = ?', login.user.id);
  await db.run('DELETE FROM users WHERE id = ?', login.user.id);

  console.log('✓ 使用者状态概览与列表 API 逻辑就绪');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
