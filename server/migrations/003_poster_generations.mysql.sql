-- Schema v3 - 长图生成记录（不持久化 PNG 文件）
CREATE TABLE IF NOT EXISTS poster_generations (
  id               VARCHAR(64) PRIMARY KEY NOT NULL,
  vehicle_ids_json TEXT NOT NULL,
  template_id      VARCHAR(64) NOT NULL,
  width            INT,
  height           INT,
  file_size_bytes  INT,
  duration_ms      INT,
  is_preview       TINYINT NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES poster_templates(id)
);

CREATE INDEX idx_poster_generations_created ON poster_generations(created_at DESC);

CREATE TABLE IF NOT EXISTS poster_generation_vehicles (
  generation_id VARCHAR(64) NOT NULL,
  vehicle_id    VARCHAR(64) NOT NULL,
  PRIMARY KEY (generation_id, vehicle_id),
  FOREIGN KEY (generation_id) REFERENCES poster_generations(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX idx_poster_gen_vehicles_vehicle ON poster_generation_vehicles(vehicle_id, generation_id);
