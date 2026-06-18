const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../db');

function dealerDir(userId = 'default') {
  const dir = path.join(UPLOADS_DIR, 'dealer', userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mapDealer(row) {
  if (!row) return null;
  let qrcodeUrl = null;
  if (row.qrcode_path && fs.existsSync(row.qrcode_path)) {
    const rel = path.relative(UPLOADS_DIR, row.qrcode_path).split(path.sep).join('/');
    qrcodeUrl = `/uploads/${rel}`;
  }
  return {
    id: row.id,
    userId: row.user_id || null,
    shopName: row.shop_name,
    contactPhone: row.contact_phone,
    contactWechat: row.contact_wechat,
    watermarkText: row.watermark_text,
    watermarkEnabled: !!row.watermark_enabled,
    qrcodePath: row.qrcode_path,
    qrcodeUrl,
    shop_name: row.shop_name,
    contact_phone: row.contact_phone,
    contact_wechat: row.contact_wechat,
    watermark_text: row.watermark_text,
    watermark_enabled: row.watermark_enabled,
    qrcode_path: row.qrcode_path,
    updatedAt: row.updated_at,
  };
}

async function getOrCreate(db, userId, phone = '') {
  let row = await db.get('SELECT * FROM dealer_profile WHERE user_id = ?', userId);
  if (!row) {
    const now = Date.now();
    await db.run(
      `INSERT INTO dealer_profile (id, user_id, shop_name, contact_phone, contact_wechat, watermark_text, watermark_enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      userId,
      userId,
      '',
      phone || '',
      '',
      '',
      now
    );
    row = await db.get('SELECT * FROM dealer_profile WHERE user_id = ?', userId);
  }
  return mapDealer(row);
}

async function get(db, userId) {
  if (!userId) {
    const row = await db.get('SELECT * FROM dealer_profile LIMIT 1');
    return mapDealer(row);
  }
  return getOrCreate(db, userId);
}

async function update(db, userId, patch) {
  // 兼容旧的调用方式 update(db, patch)
  if (userId && typeof userId === 'object' && patch === undefined) {
    patch = userId;
    userId = null;
  }

  const existing = userId
    ? await getOrCreate(db, userId)
    : mapDealer(await db.get('SELECT * FROM dealer_profile LIMIT 1'));
  if (!existing) return null;

  const shopName = patch.shopName ?? existing.shopName;
  const contactPhone = patch.contactPhone ?? existing.contactPhone;
  const contactWechat = patch.contactWechat ?? existing.contactWechat;
  const watermarkText = patch.watermarkText ?? existing.watermarkText;
  const watermarkEnabled =
    patch.watermarkEnabled != null ? (patch.watermarkEnabled ? 1 : 0) : (existing.watermarkEnabled ? 1 : 0);

  await db.run(
    `UPDATE dealer_profile SET
      shop_name = ?, contact_phone = ?, contact_wechat = ?,
      watermark_text = ?, watermark_enabled = ?, updated_at = ?
    WHERE id = ?`,
    shopName || '',
    contactPhone || '',
    contactWechat || '',
    watermarkText,
    watermarkEnabled,
    Date.now(),
    existing.id
  );

  return get(db, userId);
}

async function setQrcodePath(db, userId, filePath) {
  // 兼容旧的调用方式 setQrcodePath(db, filePath)
  if (userId && typeof userId !== 'string' && filePath === undefined) {
    filePath = userId;
    userId = null;
  }

  const existing = userId
    ? await getOrCreate(db, userId)
    : mapDealer(await db.get('SELECT * FROM dealer_profile LIMIT 1'));
  if (!existing) return null;

  if (existing.qrcodePath && existing.qrcodePath !== filePath && fs.existsSync(existing.qrcodePath)) {
    try {
      fs.unlinkSync(existing.qrcodePath);
    } catch {
      /* ignore */
    }
  }

  await db.run('UPDATE dealer_profile SET qrcode_path = ?, updated_at = ? WHERE id = ?', filePath, Date.now(), existing.id);

  return get(db, userId);
}

module.exports = { dealerDir, mapDealer, get, getOrCreate, update, setQrcodePath };
