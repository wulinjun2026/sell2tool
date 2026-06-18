-- Schema v1 - 二手车信息发布助手
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '2');
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('cache_quota_bytes', '524288000');

CREATE TABLE IF NOT EXISTS dealer_profile (
  id              TEXT PRIMARY KEY NOT NULL,
  shop_name       TEXT NOT NULL DEFAULT '',
  contact_phone   TEXT NOT NULL DEFAULT '',
  contact_wechat  TEXT NOT NULL DEFAULT '',
  watermark_text  TEXT,
  watermark_x     REAL,
  watermark_y     REAL,
  watermark_enabled INTEGER NOT NULL DEFAULT 1,
  qrcode_path     TEXT,
  qrcode_payload  TEXT,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poster_templates (
  id              TEXT PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL,
  style           TEXT NOT NULL,
  layout_path     TEXT NOT NULL,
  preview_path    TEXT,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  bundled         INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicles (
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

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_updated ON vehicles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(brand_model);
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles(price_wan);
CREATE INDEX IF NOT EXISTS idx_vehicles_code ON vehicles(code);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id          TEXT PRIMARY KEY NOT NULL,
  vehicle_id  TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('exterior', 'interior', 'seats')),
  slot_key    TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  sort_index  INTEGER NOT NULL DEFAULT 0,
  file_size   INTEGER,
  width       INTEGER,
  height      INTEGER,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  UNIQUE (vehicle_id, category, slot_key, sort_index)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);

CREATE TABLE IF NOT EXISTS vehicle_selling_points (
  id          TEXT PRIMARY KEY NOT NULL,
  vehicle_id  TEXT NOT NULL,
  point_id    TEXT,
  category    TEXT NOT NULL,
  text        TEXT NOT NULL,
  emoji       TEXT,
  sort_index  INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL CHECK (source IN ('builtin', 'custom', 'ai')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vsp_vehicle ON vehicle_selling_points(vehicle_id);

CREATE TABLE IF NOT EXISTS share_records (
  id              TEXT PRIMARY KEY NOT NULL,
  vehicle_id      TEXT NOT NULL,
  shared_at       INTEGER NOT NULL,
  copy_text       TEXT,
  share_type      TEXT NOT NULL CHECK (share_type IN (
    'long_image_only', 'long_image_with_photos', 'photos_only'
  )),
  platform        TEXT NOT NULL DEFAULT 'wechat_moments',
  long_image_path TEXT,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_share_records_vehicle ON share_records(vehicle_id, shared_at DESC);

CREATE TABLE IF NOT EXISTS seq_counter (
  date_key    TEXT PRIMARY KEY NOT NULL,
  last_seq    INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0 AND last_seq <= 999),
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS selling_point_builtin (
  id          TEXT PRIMARY KEY NOT NULL,
  category    TEXT NOT NULL,
  text        TEXT NOT NULL,
  emoji       TEXT,
  tags_json   TEXT,
  weight      INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_spb_category ON selling_point_builtin(category);
CREATE INDEX IF NOT EXISTS idx_spb_weight ON selling_point_builtin(weight DESC);

CREATE TABLE IF NOT EXISTS cache_lru_index (
  file_path      TEXT PRIMARY KEY NOT NULL,
  vehicle_id     TEXT,
  asset_type     TEXT NOT NULL CHECK (asset_type IN (
    'photo', 'poster', 'thumb', 'render_block'
  )),
  size_bytes     INTEGER NOT NULL,
  last_access_at INTEGER NOT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_lru_access ON cache_lru_index(last_access_at ASC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          TEXT PRIMARY KEY NOT NULL,
  event       TEXT NOT NULL,
  properties  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event, created_at DESC);
