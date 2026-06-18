const { v4: uuidv4 } = require('uuid');
const appSettings = require('./appSettings');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getTrialDays() {
  return appSettings.getSystem().trialDays;
}

function getProductLimitDefault() {
  return appSettings.getSystem().productLimit;
}

function isPaidPlan(plan) {
  return plan && plan !== 'free';
}

function getTrialInfo(user) {
  if (!user) return null;
  if (isPaidPlan(user.plan)) {
    return {
      days: getTrialDays(),
      trialEndsAt: null,
      expired: false,
      daysRemaining: null,
      isPaid: true,
    };
  }
  const createdAt = Number(user.createdAt || Date.now());
  const trialDays = getTrialDays();
  const trialEndsAt = createdAt + trialDays * MS_PER_DAY;
  const msRemaining = trialEndsAt - Date.now();
  return {
    days: trialDays,
    trialEndsAt,
    expired: msRemaining <= 0,
    daysRemaining: Math.max(0, Math.ceil(msRemaining / MS_PER_DAY)),
    isPaid: false,
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    plan: row.plan || 'free',
    productLimit: Number(row.product_limit ?? getProductLimitDefault()),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

async function findById(db, id) {
  const row = await db.get('SELECT * FROM users WHERE id = ?', id);
  return mapUser(row);
}

async function findByPhone(db, phone) {
  const row = await db.get('SELECT * FROM users WHERE phone = ?', phone);
  return mapUser(row);
}

async function createUser(db, phone) {
  const id = uuidv4();
  const now = Date.now();
  await db.run(
    `INSERT INTO users (id, phone, plan, product_limit, created_at, updated_at, last_login_at)
     VALUES (?, ?, 'free', ?, ?, ?, ?)`,
    id,
    phone,
    getProductLimitDefault(),
    now,
    now,
    now
  );
  return findById(db, id);
}

async function findOrCreateByPhone(db, phone) {
  const existing = await findByPhone(db, phone);
  if (existing) {
    await db.run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', Date.now(), Date.now(), existing.id);
    return findById(db, existing.id);
  }
  return createUser(db, phone);
}

async function upgradeToPaid(db, userId) {
  const now = Date.now();
  await db.run(
    `UPDATE users SET plan = 'paid', updated_at = ? WHERE id = ?`,
    now,
    userId
  );
  return findById(db, userId);
}

function phoneUpgradeCode(phone) {
  return String(phone || '').slice(-7);
}

async function countProducts(db, userId) {
  const row = await db.get('SELECT COUNT(*) AS c FROM vehicles WHERE user_id = ?', userId);
  return Number(row?.c ?? 0);
}

async function getUsage(db, userId) {
  const user = await findById(db, userId);
  if (!user) return null;
  const used = await countProducts(db, userId);
  const trial = getTrialInfo(user);

  if (isPaidPlan(user.plan)) {
    return {
      user,
      used,
      limit: null,
      remaining: null,
      unlimited: true,
      canCreate: true,
      trial,
      blockReason: null,
    };
  }

  const limit = Math.min(user.productLimit, getProductLimitDefault());
  const withinProductLimit = used < limit;
  const withinTrial = !trial.expired;
  let blockReason = null;
  if (!withinTrial) blockReason = 'TRIAL_EXPIRED';
  else if (!withinProductLimit) blockReason = 'PRODUCT_LIMIT_REACHED';
  return {
    user,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    unlimited: false,
    canCreate: withinProductLimit && withinTrial,
    trial,
    blockReason,
  };
}

module.exports = {
  getProductLimitDefault,
  getTrialDays,
  MS_PER_DAY,
  isPaidPlan,
  getTrialInfo,
  mapUser,
  findById,
  findByPhone,
  createUser,
  findOrCreateByPhone,
  upgradeToPaid,
  phoneUpgradeCode,
  countProducts,
  getUsage,
};
