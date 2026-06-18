/**
 * 多用户登录与产品配额测试
 */
const assert = require('assert');
const { initDb } = require('../server/db');
const authService = require('../server/services/authService');
const userRepo = require('../server/services/userRepository');
const vehicleRepo = require('../server/services/vehicleRepository');

process.env.AUTH_DEV_MODE = 'true';

(async () => {
  const db = await initDb();

  for (const phone of ['13800138000', '13900139000']) {
    const existing = await userRepo.findByPhone(db, phone);
    if (existing) {
      await db.run('DELETE FROM vehicles WHERE user_id = ?', existing.id);
      await db.run('DELETE FROM users WHERE id = ?', existing.id);
    }
  }

  assert.strictEqual(authService.normalizePhone('13800138000'), '13800138000');
  assert.strictEqual(authService.normalizePhone('+86 138 0013 8000'), '13800138000');
  assert.strictEqual(authService.normalizePhone('123'), null);

  const send = await authService.sendSmsCode(db, '13800138000');
  assert.ok(send.devCode, 'dev mode should expose code');

  const login = await authService.verifySmsCode(db, '13800138000', send.devCode);
  assert.ok(login.token);
  assert.ok(login.user?.id);
  assert.strictEqual(login.usage.limit, 40);
  assert.strictEqual(login.usage.trial.days, 20);
  assert.strictEqual(login.usage.trial.expired, false);
  assert.ok(login.usage.trial.daysRemaining > 0);

  const userId = login.user.id;
  const existingRows = await db.all('SELECT id FROM vehicles WHERE user_id = ?', userId);
  for (const row of existingRows) {
    await vehicleRepo.deleteVehicle(db, row.id, userId);
  }

  let created = 0;
  for (let i = 0; i < 40; i += 1) {
    await vehicleRepo.createDraft(db, userId);
    created += 1;
  }
  assert.strictEqual(created, 40);

  let limitHit = false;
  try {
    await vehicleRepo.createDraft(db, userId);
  } catch (err) {
    limitHit = err.message === 'PRODUCT_LIMIT_REACHED';
  }
  assert.ok(limitHit, '41st product should hit limit');

  const expiredAt = Date.now() - (userRepo.getTrialDays() + 1) * userRepo.MS_PER_DAY;
  await db.run('UPDATE users SET created_at = ? WHERE id = ?', expiredAt, userId);
  const expiredUsage = await userRepo.getUsage(db, userId);
  assert.strictEqual(expiredUsage.trial.expired, true);
  assert.strictEqual(expiredUsage.canCreate, false);
  assert.strictEqual(expiredUsage.blockReason, 'TRIAL_EXPIRED');

  let trialHit = false;
  try {
    await vehicleRepo.createDraft(db, userId);
  } catch (err) {
    trialHit = err.message === 'TRIAL_EXPIRED';
  }
  assert.ok(trialHit, 'expired trial should block new products');

  await db.run('UPDATE users SET plan = ?, created_at = ? WHERE id = ?', 'paid', Date.now(), userId);
  const paidUsage = await userRepo.getUsage(db, userId);
  assert.strictEqual(paidUsage.trial.isPaid, true);
  assert.strictEqual(paidUsage.trial.expired, false);
  assert.strictEqual(paidUsage.unlimited, true);
  assert.strictEqual(paidUsage.canCreate, true, 'paid user has no product limit');
  await vehicleRepo.createDraft(db, userId);
  const paidList = await vehicleRepo.list(db, { userId });
  assert.strictEqual(paidList.length, 41, 'paid user can exceed 40 products');

  await db.run('UPDATE users SET plan = ?, created_at = ? WHERE id = ?', 'free', Date.now(), userId);
  const upgradeCode = userRepo.phoneUpgradeCode('13800138000');
  assert.strictEqual(upgradeCode, '0138000');
  const upgradedLogin = await authService.verifySmsCode(db, '13800138000', upgradeCode);
  assert.strictEqual(upgradedLogin.upgraded, true);
  assert.strictEqual(upgradedLogin.user.plan, 'paid');
  assert.strictEqual(upgradedLogin.usage.trial.isPaid, true);
  assert.strictEqual(upgradedLogin.usage.canCreate, true);
  const afterUpgradeList = await vehicleRepo.list(db, { userId });
  assert.strictEqual(afterUpgradeList.length, 41, 'existing products should remain after upgrade');
  await vehicleRepo.createDraft(db, userId);
  const afterSecondCreate = await vehicleRepo.list(db, { userId });
  assert.strictEqual(afterSecondCreate.length, 42, 'upgraded paid user can keep creating products');

  const user2Login = await authService.verifySmsCode(db, '13900139000', (await authService.sendSmsCode(db, '13900139000')).devCode);
  const list1 = await vehicleRepo.list(db, { userId });
  const list2 = await vehicleRepo.list(db, { userId: user2Login.user.id });
  assert.strictEqual(list1.length, 42);
  assert.strictEqual(list2.length, 0, 'users should be isolated');

  const rows = await db.all('SELECT id FROM vehicles WHERE user_id = ?', userId);
  for (const row of rows) {
    await vehicleRepo.deleteVehicle(db, row.id, userId);
  }

  console.log('✓ 手机号登录、20 天试用、40 产品配额与数据隔离逻辑就绪');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
