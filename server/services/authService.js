const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const userRepo = require('./userRepository');
const appSettings = require('./appSettings');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;

function authSecret() {
  return process.env.AUTH_SECRET || 'uca-dev-secret-change-in-production';
}

function isAuthDisabled() {
  return process.env.AUTH_DISABLED === 'true';
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2);
  return null;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', authSecret()).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload?.userId || !payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function resolveUserFromToken(db, token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  return userRepo.findById(db, payload.userId);
}

async function sendSmsCode(db, rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error('INVALID_PHONE');

  const code = generateCode();
  const now = Date.now();
  await db.run(
    `INSERT INTO auth_codes (id, phone, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    uuidv4(),
    phone,
    hashCode(code),
    now + CODE_TTL_MS,
    now
  );

  console.log(`[auth] 验证码 ${phone}: ${code}`);

  const response = { ok: true, expiresIn: CODE_TTL_MS / 1000 };
  if (appSettings.isAuthDevMode()) {
    response.devCode = code;
  }
  return response;
}

function isValidVerifyCode(code) {
  const trimmed = String(code || '').trim();
  return /^\d{6}$/.test(trimmed) || /^\d{7}$/.test(trimmed);
}

function issueAuthSession(user) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const token = signToken({ userId: user.id, phone: user.phone, exp });
  return { token, expiresAt: exp };
}

async function verifySmsCode(db, rawPhone, code) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error('INVALID_PHONE');
  const trimmed = String(code || '').trim();
  if (!isValidVerifyCode(trimmed)) throw new Error('INVALID_CODE');

  if (trimmed === userRepo.phoneUpgradeCode(phone)) {
    let user = await userRepo.findOrCreateByPhone(db, phone);
    let upgraded = false;
    if (!userRepo.isPaidPlan(user.plan)) {
      user = await userRepo.upgradeToPaid(db, user.id);
      upgraded = true;
    }
    const usage = await userRepo.getUsage(db, user.id);
    const { token, expiresAt } = issueAuthSession(user);
    return { token, user, usage, expiresAt, upgraded };
  }

  if (!/^\d{6}$/.test(trimmed)) throw new Error('CODE_INVALID');

  const row = await db.get(
    `SELECT * FROM auth_codes
     WHERE phone = ? AND used_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
    phone,
    Date.now()
  );
  if (!row || row.code_hash !== hashCode(trimmed)) {
    throw new Error('CODE_INVALID');
  }

  await db.run('UPDATE auth_codes SET used_at = ? WHERE id = ?', Date.now(), row.id);
  const user = await userRepo.findOrCreateByPhone(db, phone);
  const usage = await userRepo.getUsage(db, user.id);
  const { token, expiresAt } = issueAuthSession(user);

  return { token, user, usage, expiresAt, upgraded: false };
}

function createRequireAuth(db) {
  return async function requireAuth(req, res, next) {
    if (isAuthDisabled()) {
      req.userId = process.env.AUTH_TEST_USER_ID || 'auth-disabled-user';
      req.user = await userRepo.findById(db, req.userId)
        || await userRepo.findOrCreateByPhone(db, '13800000000');
      req.userId = req.user.id;
      return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = await resolveUserFromToken(db, token);
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } });
    }
    req.user = user;
    req.userId = user.id;
    return next();
  };
}

async function assertVehicleAccess(db, vehicleId, userId) {
  const row = await db.get('SELECT user_id FROM vehicles WHERE id = ?', vehicleId);
  if (!row) return { ok: false, code: 'VEHICLE_NOT_FOUND' };
  if (row.user_id && row.user_id !== userId) return { ok: false, code: 'FORBIDDEN' };
  if (!row.user_id && !isAuthDisabled()) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, row };
}

module.exports = {
  isAuthDisabled,
  normalizePhone,
  signToken,
  verifyToken,
  resolveUserFromToken,
  sendSmsCode,
  verifySmsCode,
  createRequireAuth,
  assertVehicleAccess,
  TOKEN_TTL_MS,
};
