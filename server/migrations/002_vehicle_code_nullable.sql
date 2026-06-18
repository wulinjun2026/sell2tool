-- 车辆编号改为录入信息后再生成，草稿阶段允许 code 为空
PRAGMA foreign_keys=OFF;

CREATE TABLE vehicles_new (
  id                    TEXT PRIMARY KEY NOT NULL,
  code                  TEXT UNIQUE,
  status                TEXT NOT NULL CHECK (status IN ('draft', 'on_sale', 'sold')),
  brand_model           TEXT,
  year                  INTEGER,
  mileage_km            INTEGER,
  price_wan             REAL,
  price_tags_json       TEXT,
  extra_description     TEXT,
  polished_description  TEXT,
  template_id           TEXT,
  long_image_path       TEXT,
  long_image_updated_at INTEGER,
  thumb_path            TEXT,
  has_frunk_slot        INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  sold_at               INTEGER,
  FOREIGN KEY (template_id) REFERENCES poster_templates(id)
);

INSERT INTO vehicles_new SELECT * FROM vehicles;
DROP TABLE vehicles;
ALTER TABLE vehicles_new RENAME TO vehicles;

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_updated ON vehicles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(brand_model);
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles(price_wan);
CREATE INDEX IF NOT EXISTS idx_vehicles_code ON vehicles(code);

UPDATE app_meta SET value = '2' WHERE key = 'schema_version';

PRAGMA foreign_keys=ON;
