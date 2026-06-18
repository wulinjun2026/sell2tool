const { v4: uuidv4 } = require('uuid');

async function create(db, {
  vehicleIds,
  templateId,
  width,
  height,
  fileSize,
  durationMs,
  isPreview = false,
}) {
  const id = uuidv4();
  const now = Date.now();
  await db.run(
    `INSERT INTO poster_generations
      (id, vehicle_ids_json, template_id, width, height, file_size_bytes, duration_ms, is_preview, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    JSON.stringify(vehicleIds),
    templateId,
    width ?? null,
    height ?? null,
    fileSize ?? null,
    durationMs ?? null,
    isPreview ? 1 : 0,
    now
  );
  for (const vehicleId of vehicleIds) {
    await db.run(
      `INSERT INTO poster_generation_vehicles (generation_id, vehicle_id) VALUES (?, ?)`,
      id,
      vehicleId
    );
  }
  return { id, createdAt: now };
}

async function countFinalGenerations(db) {
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM poster_generations WHERE is_preview = 0`
  );
  return Number(row?.c || 0);
}

async function getLatestForVehicle(db, vehicleId, { preview = false } = {}) {
  return db.get(
    `SELECT pg.*
     FROM poster_generations pg
     INNER JOIN poster_generation_vehicles pgv ON pgv.generation_id = pg.id
     WHERE pgv.vehicle_id = ? AND pg.is_preview = ?
     ORDER BY pg.created_at DESC
     LIMIT 1`,
    vehicleId,
    preview ? 1 : 0
  );
}

async function deleteById(db, generationId) {
  await db.run('DELETE FROM poster_generation_vehicles WHERE generation_id = ?', generationId);
  await db.run('DELETE FROM poster_generations WHERE id = ?', generationId);
}

async function deleteAllForVehicle(db, vehicleId, { previewOnly = false } = {}) {
  const rows = await db.all(
    `SELECT pg.id FROM poster_generations pg
     INNER JOIN poster_generation_vehicles pgv ON pgv.generation_id = pg.id
     WHERE pgv.vehicle_id = ?${previewOnly ? ' AND pg.is_preview = 1' : ''}`,
    vehicleId
  );
  for (const row of rows) {
    await deleteById(db, row.id);
  }
  return rows.length;
}

module.exports = {
  create,
  countFinalGenerations,
  getLatestForVehicle,
  deleteById,
  deleteAllForVehicle,
};
