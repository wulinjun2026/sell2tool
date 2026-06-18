-- Schema v3 - 长图生成记录（不持久化 PNG 文件）
CREATE TABLE IF NOT EXISTS poster_generations (
  id              TEXT PRIMARY KEY NOT NULL,
  vehicle_ids_json TEXT NOT NULL,
  template_id     TEXT NOT NULL,
  width           INTEGER,
  height          INTEGER,
  file_size_bytes INTEGER,
  duration_ms     INTEGER,
  is_preview      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (template_id) REFERENCES poster_templates(id)
);

CREATE INDEX IF NOT EXISTS idx_poster_generations_created ON poster_generations(created_at DESC);

CREATE TABLE IF NOT EXISTS poster_generation_vehicles (
  generation_id   TEXT NOT NULL,
  vehicle_id      TEXT NOT NULL,
  PRIMARY KEY (generation_id, vehicle_id),
  FOREIGN KEY (generation_id) REFERENCES poster_generations(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poster_gen_vehicles_vehicle ON poster_generation_vehicles(vehicle_id, generation_id);
