const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { vehicleDir, UPLOADS_DIR } = require('../db');
const { generateCode } = require('./vehicleId');
const userRepo = require('./userRepository');

const SLOT_LABELS = {
  front: '前',
  rear: '后',
  left45: '45度左',
  left: '左',
  right45: '45度右',
  right: '右',
  center_console: '中控',
  screen: '车机',
  driver_seat: '主驾驶位',
  front_seats: '前排座椅',
  rear_seats: '后排座椅',
  trunk: '后备箱',
  frunk: '前备箱',
};

const PLACEHOLDER_MODEL = '待填写产品名';

async function hasVehicleInfo(vehicle, db) {
  const model = (vehicle.brandModel || '').trim();
  if (model && model !== PLACEHOLDER_MODEL) return true;
  if (vehicle.priceWan != null && vehicle.priceWan > 0) return true;
  if ((vehicle.extraDescription || '').trim()) return true;
  if ((vehicle.polishedDescription || '').trim()) return true;
  if (vehicle.sellingPoints?.length) return true;
  if (db && vehicle.id) {
    const row = await db.get('SELECT COUNT(*) AS c FROM vehicle_photos WHERE vehicle_id = ?', vehicle.id);
    if (row?.c > 0) return true;
  }
  return false;
}

async function ensureVehicleCode(db, vehicleId) {
  const row = await db.get('SELECT code FROM vehicles WHERE id = ?', vehicleId);
  if (!row || row.code) return row?.code || null;
  const code = await generateCode(db);
  await db.run('UPDATE vehicles SET code = ?, updated_at = ? WHERE id = ?', code, Date.now(), vehicleId);
  return code;
}

function mapVehicleRow(row, photos = [], sellingPoints = []) {
  if (!row) return null;
  const lastPosterGeneratedAt = row.last_poster_at || null;
  const hasPoster = !!lastPosterGeneratedAt || !!row.has_poster;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    brandModel: row.brand_model,
    year: row.year,
    mileageKm: row.mileage_km,
    priceWan: row.price_wan,
    priceTags: row.price_tags_json ? JSON.parse(row.price_tags_json) : [],
    extraDescription: row.extra_description,
    polishedDescription: row.polished_description,
    templateId: row.template_id,
    hasPoster,
    lastPosterGeneratedAt,
    thumbPath: row.thumb_path,
    hasFrunkSlot: !!row.has_frunk_slot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    soldAt: row.sold_at,
    userId: row.user_id || null,
    photos,
    sellingPoints,
    shareCount: row.share_count || 0,
    photoCount: row.photo_count || photos.length,
  };
}

const POSTER_AT_SUBQUERY = `(SELECT MAX(pg.created_at)
  FROM poster_generation_vehicles pgv
  INNER JOIN poster_generations pg ON pg.id = pgv.generation_id
  WHERE pgv.vehicle_id = v.id AND pg.is_preview = 0)`;

async function loadPhotos(db, vehicleId) {
  const rows = await db.all(
    `SELECT * FROM vehicle_photos WHERE vehicle_id = ? ORDER BY category, slot_key, sort_index`,
    vehicleId
  );
  return rows.map((p) => ({
    id: p.id,
    category: p.category,
    slotKey: p.slot_key,
    filePath: p.file_path,
    sortIndex: p.sort_index,
    url: `/uploads/${path.relative(path.join(UPLOADS_DIR), p.file_path).split(path.sep).join('/')}`,
  }));
}

async function loadSellingPoints(db, vehicleId) {
  const rows = await db.all(
    `SELECT * FROM vehicle_selling_points WHERE vehicle_id = ? ORDER BY sort_index`,
    vehicleId
  );
  return rows.map((p) => ({
    id: p.id,
    pointId: p.point_id,
    category: p.category,
    text: p.text,
    emoji: p.emoji,
    source: p.source,
  }));
}

async function findById(db, id, userId = null) {
  let sql = `
    SELECT v.*,
      (SELECT COUNT(*) FROM share_records sr WHERE sr.vehicle_id = v.id) AS share_count,
      (SELECT COUNT(*) FROM vehicle_photos vp WHERE vp.vehicle_id = v.id) AS photo_count,
      ${POSTER_AT_SUBQUERY} AS last_poster_at
     FROM vehicles v WHERE v.id = ?`;
  const params = [id];
  if (userId) {
    sql += ' AND v.user_id = ?';
    params.push(userId);
  }
  const row = await db.get(sql, ...params);
  if (!row) return null;
  const photos = await loadPhotos(db, id);
  const sellingPoints = await loadSellingPoints(db, id);
  return mapVehicleRow(row, photos, sellingPoints);
}

async function list(db, filter = {}) {
  let sql = `
    SELECT v.*,
      (SELECT COUNT(*) FROM share_records sr WHERE sr.vehicle_id = v.id) AS share_count,
      (SELECT COUNT(*) FROM vehicle_photos vp WHERE vp.vehicle_id = v.id) AS photo_count,
      ${POSTER_AT_SUBQUERY} AS last_poster_at
    FROM vehicles v WHERE 1=1
  `;
  const params = [];

  if (filter.userId) {
    sql += ' AND v.user_id = ?';
    params.push(filter.userId);
  }

  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    sql += ` AND v.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  if (filter.keyword) {
    sql += ` AND (v.brand_model LIKE ? OR v.code LIKE ?)`;
    const kw = `%${filter.keyword}%`;
    params.push(kw, kw);
  }

  const sortBy = filter.sortBy === 'price_wan' ? 'v.price_wan' : filter.sortBy === 'created_at' ? 'v.created_at' : 'v.updated_at';
  const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortBy} ${sortOrder}`;

  if (filter.limit) {
    sql += ` LIMIT ?`;
    params.push(filter.limit);
    if (filter.offset) {
      sql += ` OFFSET ?`;
      params.push(filter.offset);
    }
  }

  const rows = await db.all(sql, ...params);
  const vehicles = [];
  for (const row of rows) {
    const photos = await loadPhotos(db, row.id);
    const sellingPoints = await loadSellingPoints(db, row.id);
    vehicles.push(mapVehicleRow(row, photos, sellingPoints));
  }
  return vehicles;
}

async function countByStatus(db, userId = null) {
  let sql = 'SELECT status, COUNT(*) AS cnt FROM vehicles';
  const params = [];
  if (userId) {
    sql += ' WHERE user_id = ?';
    params.push(userId);
  }
  sql += ' GROUP BY status';
  const rows = await db.all(sql, ...params);
  const result = { draft: 0, on_sale: 0, sold: 0 };
  rows.forEach((r) => {
    result[r.status] = Number(r.cnt);
  });
  return result;
}

async function countPublishedVehicles(db, userId = null) {
  let sql = `
    SELECT COUNT(DISTINCT pgv.vehicle_id) AS c
     FROM poster_generation_vehicles pgv
     INNER JOIN poster_generations pg ON pg.id = pgv.generation_id
     INNER JOIN vehicles v ON v.id = pgv.vehicle_id
     WHERE pg.is_preview = 0`;
  const params = [];
  if (userId) {
    sql += ' AND v.user_id = ?';
    params.push(userId);
  }
  const row = await db.get(sql, ...params);
  return Number(row?.c ?? 0);
}

async function createDraft(db, userId) {
  // 如果没有 userId，尝试创建默认测试用户或跳过配额检查
  if (!userId) {
    userId = 'test-user-default';
    const existing = await userRepo.findById(db, userId);
    if (!existing) {
      const now = Date.now();
      await db.run(
        `INSERT INTO users (id, phone, plan, product_limit, created_at, updated_at)
         VALUES (?, ?, 'free', ?, ?, ?)`,
        userId,
        '13800000000',
        100, // 测试用户给一个较大的配额
        now,
        now
      );
    }
  }

  const usage = await userRepo.getUsage(db, userId);
  if (!usage?.canCreate) {
    if (usage?.trial?.expired) {
      const err = new Error('TRIAL_EXPIRED');
      err.trialEndsAt = usage.trial.trialEndsAt;
      err.trialDays = usage.trial.days;
      throw err;
    }
    const err = new Error('PRODUCT_LIMIT_REACHED');
    err.limit = usage?.limit ?? userRepo.DEFAULT_PRODUCT_LIMIT;
    err.current = usage?.used ?? err.limit;
    throw err;
  }

  const id = uuidv4();
  const now = Date.now();
  await db.run(
    `INSERT INTO vehicles (id, code, status, user_id, created_at, updated_at)
     VALUES (?, NULL, 'draft', ?, ?, ?)`,
    id,
    userId,
    now,
    now
  );
  return findById(db, id, userId);
}

async function saveVehicle(db, vehicle, userId = null) {
  const now = Date.now();
  const existing = await db.get('SELECT id, user_id FROM vehicles WHERE id = ?', vehicle.id);
  if (userId && existing?.user_id && existing.user_id !== userId) {
    throw new Error('FORBIDDEN');
  }

  if (existing) {
    await db.run(
      `UPDATE vehicles SET
        brand_model = ?, year = ?, mileage_km = ?, price_wan = ?,
        price_tags_json = ?, extra_description = ?, polished_description = ?,
        template_id = ?, has_frunk_slot = ?, updated_at = ?
      WHERE id = ?`,
      vehicle.brandModel || null,
      vehicle.year || null,
      vehicle.mileageKm || null,
      vehicle.priceWan || null,
      vehicle.priceTags ? JSON.stringify(vehicle.priceTags) : null,
      vehicle.extraDescription || null,
      vehicle.polishedDescription || null,
      vehicle.templateId || null,
      vehicle.hasFrunkSlot ? 1 : 0,
      now,
      vehicle.id
    );
  } else {
    const code = vehicle.code || null;
    await db.run(
      `INSERT INTO vehicles (
        id, code, status, user_id, brand_model, year, mileage_km, price_wan,
        price_tags_json, extra_description, polished_description,
        template_id, has_frunk_slot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      vehicle.id,
      code,
      vehicle.status || 'draft',
      userId,
      vehicle.brandModel || null,
      vehicle.year || null,
      vehicle.mileageKm || null,
      vehicle.priceWan || null,
      vehicle.priceTags ? JSON.stringify(vehicle.priceTags) : null,
      vehicle.extraDescription || null,
      vehicle.polishedDescription || null,
      vehicle.templateId || null,
      vehicle.hasFrunkSlot ? 1 : 0,
      vehicle.createdAt || now,
      now
    );
  }

  if (vehicle.sellingPoints) {
    await db.run('DELETE FROM vehicle_selling_points WHERE vehicle_id = ?', vehicle.id);
    for (let idx = 0; idx < vehicle.sellingPoints.length; idx += 1) {
      const sp = vehicle.sellingPoints[idx];
      await db.run(
        `INSERT INTO vehicle_selling_points (id, vehicle_id, point_id, category, text, emoji, sort_index, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(),
        vehicle.id,
        sp.pointId || sp.id || null,
        sp.category,
        sp.text,
        sp.emoji || null,
        idx,
        sp.source || 'builtin'
      );
    }
  }

  const merged = await findById(db, vehicle.id, userId || undefined);
  if (!merged.code && (await hasVehicleInfo(merged, db))) {
    await ensureVehicleCode(db, vehicle.id);
    return findById(db, vehicle.id, userId || undefined);
  }

  return merged;
}

async function updateStatus(db, id, status, userId = null) {
  if (userId) {
    const row = await db.get('SELECT user_id FROM vehicles WHERE id = ?', id);
    if (!row) throw new Error('VEHICLE_NOT_FOUND');
    if (row.user_id !== userId) throw new Error('FORBIDDEN');
  }
  const now = Date.now();
  const soldAt = status === 'sold' ? now : null;
  await db.run(`UPDATE vehicles SET status = ?, updated_at = ?, sold_at = ? WHERE id = ?`, status, now, soldAt, id);
}

async function markPosterGenerated(db, vehicleIds, templateId, userId = null) {
  const now = Date.now();
  for (const id of vehicleIds) {
    if (userId) {
      const row = await db.get('SELECT user_id FROM vehicles WHERE id = ?', id);
      if (!row || row.user_id !== userId) throw new Error('FORBIDDEN');
    }
    await db.run(
      `UPDATE vehicles SET template_id = ?, status = 'on_sale', long_image_path = NULL, long_image_updated_at = ?, updated_at = ?
       WHERE id = ?`,
      templateId,
      now,
      now,
      id
    );
  }
}

async function deleteVehicle(db, id, userId = null) {
  if (userId) {
    const row = await db.get('SELECT user_id FROM vehicles WHERE id = ?', id);
    if (!row) return;
    if (row.user_id !== userId) throw new Error('FORBIDDEN');
  }
  await db.run('DELETE FROM vehicles WHERE id = ?', id);
  const dir = vehicleDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

async function deleteBatch(db, ids, userId = null) {
  for (const id of ids) {
    await deleteVehicle(db, id, userId);
  }
}

async function getUploadProgress(db, vehicleId) {
  const photos = await loadPhotos(db, vehicleId);
  const countSlot = (category, keys) => {
    const done = keys.filter((k) => photos.some((p) => p.category === category && p.slotKey === k)).length;
    return { done, total: keys.length };
  };
  const vehicle = await db.get('SELECT has_frunk_slot FROM vehicles WHERE id = ?', vehicleId);
  const seatKeys = vehicle?.has_frunk_slot ? ['front_seats', 'rear_seats', 'trunk', 'frunk'] : ['front_seats', 'rear_seats', 'trunk'];
  return {
    exterior: countSlot('exterior', ['front', 'rear', 'left45', 'left', 'right45', 'right']),
    interior: countSlot('interior', ['center_console', 'screen', 'driver_seat']),
    seats: countSlot('seats', seatKeys),
  };
}

module.exports = {
  SLOT_LABELS,
  PLACEHOLDER_MODEL,
  findById,
  list,
  countByStatus,
  countPublishedVehicles,
  createDraft,
  saveVehicle,
  ensureVehicleCode,
  hasVehicleInfo,
  updateStatus,
  markPosterGenerated,
  deleteVehicle,
  deleteBatch,
  loadPhotos,
  getUploadProgress,
};
