const userRepo = require('./userRepository');
const vehicleRepo = require('./vehicleRepository');

function maskPhone(phone = '') {
  const p = String(phone);
  if (p.length !== 11) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

function formatUserStatus(usage) {
  if (!usage) return 'unknown';
  if (usage.trial?.isPaid) return 'paid';
  if (usage.trial?.expired) return 'trial_expired';
  if (usage.blockReason === 'PRODUCT_LIMIT_REACHED') return 'limit_reached';
  return 'trial_active';
}

function statusLabel(status) {
  return {
    paid: '付费版',
    trial_active: '试用中',
    trial_expired: '试用到期',
    limit_reached: '配额已满',
    unknown: '未知',
  }[status] || status;
}

async function getDealerMap(db, userIds) {
  if (!userIds.length) return new Map();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT user_id, shop_name, contact_phone FROM dealer_profile WHERE user_id IN (${placeholders})`,
    ...userIds
  );
  return new Map(rows.map((r) => [r.user_id, r]));
}

async function buildUserRow(db, user, dealerMap) {
  const usage = await userRepo.getUsage(db, user.id);
  const published = await vehicleRepo.countPublishedVehicles(db, user.id);
  const dealer = dealerMap.get(user.id);
  const status = formatUserStatus(usage);
  return {
    id: user.id,
    phone: user.phone,
    phoneMasked: maskPhone(user.phone),
    plan: user.plan,
    shopName: dealer?.shop_name || '',
    contactPhone: dealer?.contact_phone || '',
    used: usage?.used ?? 0,
    limit: usage?.limit,
    unlimited: !!usage?.unlimited,
    canCreate: !!usage?.canCreate,
    blockReason: usage?.blockReason || null,
    status,
    statusLabel: statusLabel(status),
    trial: usage?.trial || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    publishedCount: published,
  };
}

async function listUsers(db, { q = '', status = 'all', limit = 100, offset = 0 } = {}) {
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  if (q.trim()) {
    sql += ' AND phone LIKE ?';
    params.push(`%${q.trim()}%`);
  }
  sql += ' ORDER BY last_login_at DESC, created_at DESC';
  const rows = await db.all(sql, ...params);
  const users = rows.map(userRepo.mapUser);
  const dealerMap = await getDealerMap(db, users.map((u) => u.id));

  let items = [];
  for (const user of users) {
    items.push(await buildUserRow(db, user, dealerMap));
  }

  if (status !== 'all') {
    items = items.filter((item) => item.status === status);
  }

  const total = items.length;
  const page = items.slice(offset, offset + limit);

  return { users: page, total, limit, offset };
}

async function getOverview(db) {
  const rows = await db.all('SELECT * FROM users ORDER BY created_at ASC');
  const users = rows.map(userRepo.mapUser);
  const dealerMap = await getDealerMap(db, users.map((u) => u.id));

  const summary = {
    totalUsers: 0,
    paidUsers: 0,
    trialActive: 0,
    trialExpired: 0,
    limitReached: 0,
    totalProducts: 0,
    totalPublished: 0,
    activeLast7Days: 0,
  };

  const now = Date.now();
  const weekAgo = now - 7 * userRepo.MS_PER_DAY;

  for (const user of users) {
    const row = await buildUserRow(db, user, dealerMap);
    summary.totalUsers += 1;
    summary.totalProducts += row.used;
    summary.totalPublished += row.publishedCount;
    if (row.lastLoginAt && row.lastLoginAt >= weekAgo) summary.activeLast7Days += 1;
    if (row.status === 'paid') summary.paidUsers += 1;
    else if (row.status === 'trial_active') summary.trialActive += 1;
    else if (row.status === 'trial_expired') summary.trialExpired += 1;
    else if (row.status === 'limit_reached') summary.limitReached += 1;
  }

  return summary;
}

async function setUserPlan(db, userId, plan) {
  if (plan === 'paid') {
    await userRepo.upgradeToPaid(db, userId);
    return buildUserRow(db, await userRepo.findById(db, userId), await getDealerMap(db, [userId]));
  }
  if (plan === 'free') {
    await db.run(
      'UPDATE users SET plan = ?, updated_at = ? WHERE id = ?',
      'free',
      Date.now(),
      userId
    );
    return buildUserRow(db, await userRepo.findById(db, userId), await getDealerMap(db, [userId]));
  }
  throw new Error('INVALID_PLAN');
}

module.exports = {
  listUsers,
  getOverview,
  setUserPlan,
  maskPhone,
  statusLabel,
};
