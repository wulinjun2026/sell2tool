-- Schema v2 - MySQL / MariaDB
CREATE TABLE IF NOT EXISTS app_meta (
  `key`   VARCHAR(64) PRIMARY KEY NOT NULL,
  value   TEXT NOT NULL
);

INSERT IGNORE INTO app_meta (`key`, value) VALUES ('schema_version', '2');
INSERT IGNORE INTO app_meta (`key`, value) VALUES ('cache_quota_bytes', '524288000');

CREATE TABLE IF NOT EXISTS dealer_profile (
  id              VARCHAR(64) PRIMARY KEY NOT NULL,
  shop_name       VARCHAR(255) NOT NULL DEFAULT '',
  contact_phone   VARCHAR(32) NOT NULL DEFAULT '',
  contact_wechat  VARCHAR(64) NOT NULL DEFAULT '',
  watermark_text  TEXT,
  watermark_x     DOUBLE,
  watermark_y     DOUBLE,
  watermark_enabled TINYINT(1) NOT NULL DEFAULT 1,
  qrcode_path     TEXT,
  qrcode_payload  TEXT,
  updated_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS poster_templates (
  id              VARCHAR(64) PRIMARY KEY NOT NULL,
  name            VARCHAR(128) NOT NULL,
  style           VARCHAR(64) NOT NULL,
  layout_path     VARCHAR(512) NOT NULL,
  preview_path    VARCHAR(512),
  schema_version  INT NOT NULL DEFAULT 1,
  bundled         TINYINT(1) NOT NULL DEFAULT 1,
  sort_order      INT NOT NULL DEFAULT 0,
  enabled         TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicles (
  id                    VARCHAR(64) PRIMARY KEY NOT NULL,
  code                  VARCHAR(32) UNIQUE,
  status                VARCHAR(16) NOT NULL,
  brand_model           VARCHAR(255),
  year                  INT,
  mileage_km            INT,
  price_wan             DOUBLE,
  price_tags_json       TEXT,
  extra_description     TEXT,
  polished_description  TEXT,
  template_id           VARCHAR(64),
  long_image_path       TEXT,
  long_image_updated_at BIGINT,
  thumb_path            TEXT,
  has_frunk_slot        TINYINT(1) NOT NULL DEFAULT 0,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  sold_at               BIGINT,
  CONSTRAINT chk_vehicle_status CHECK (status IN ('draft', 'on_sale', 'sold')),
  FOREIGN KEY (template_id) REFERENCES poster_templates(id)
);

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_updated ON vehicles(updated_at DESC);
CREATE INDEX idx_vehicles_brand ON vehicles(brand_model);
CREATE INDEX idx_vehicles_price ON vehicles(price_wan);
CREATE INDEX idx_vehicles_code ON vehicles(code);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id          VARCHAR(64) PRIMARY KEY NOT NULL,
  vehicle_id  VARCHAR(64) NOT NULL,
  category    VARCHAR(32) NOT NULL,
  slot_key    VARCHAR(64) NOT NULL,
  file_path   TEXT NOT NULL,
  sort_index  INT NOT NULL DEFAULT 0,
  file_size   INT,
  width       INT,
  height      INT,
  created_at  BIGINT NOT NULL,
  CONSTRAINT chk_photo_category CHECK (category IN ('exterior', 'interior', 'seats')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_vehicle_photo_slot (vehicle_id, category, slot_key, sort_index)
);

CREATE INDEX idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);

CREATE TABLE IF NOT EXISTS vehicle_selling_points (
  id          VARCHAR(64) PRIMARY KEY NOT NULL,
  vehicle_id  VARCHAR(64) NOT NULL,
  point_id    VARCHAR(64),
  category    VARCHAR(64) NOT NULL,
  text        TEXT NOT NULL,
  emoji       VARCHAR(16),
  sort_index  INT NOT NULL DEFAULT 0,
  source      VARCHAR(16) NOT NULL,
  CONSTRAINT chk_sp_source CHECK (source IN ('builtin', 'custom', 'ai')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX idx_vsp_vehicle ON vehicle_selling_points(vehicle_id);

CREATE TABLE IF NOT EXISTS share_records (
  id              VARCHAR(64) PRIMARY KEY NOT NULL,
  vehicle_id      VARCHAR(64) NOT NULL,
  shared_at       BIGINT NOT NULL,
  copy_text       TEXT,
  share_type      VARCHAR(32) NOT NULL,
  platform        VARCHAR(32) NOT NULL DEFAULT 'wechat_moments',
  long_image_path TEXT,
  CONSTRAINT chk_share_type CHECK (share_type IN ('long_image_only', 'long_image_with_photos', 'photos_only')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX idx_share_records_vehicle ON share_records(vehicle_id, shared_at DESC);

CREATE TABLE IF NOT EXISTS seq_counter (
  date_key    VARCHAR(8) PRIMARY KEY NOT NULL,
  last_seq    INT NOT NULL DEFAULT 0,
  updated_at  BIGINT NOT NULL,
  CONSTRAINT chk_seq_range CHECK (last_seq >= 0 AND last_seq <= 999)
);

CREATE TABLE IF NOT EXISTS selling_point_builtin (
  id          VARCHAR(64) PRIMARY KEY NOT NULL,
  category    VARCHAR(64) NOT NULL,
  text        TEXT NOT NULL,
  emoji       VARCHAR(16),
  tags_json   TEXT,
  weight      INT NOT NULL DEFAULT 0,
  enabled     TINYINT(1) NOT NULL DEFAULT 1
);

CREATE INDEX idx_spb_category ON selling_point_builtin(category);
CREATE INDEX idx_spb_weight ON selling_point_builtin(weight DESC);

CREATE TABLE IF NOT EXISTS cache_lru_index (
  file_path      VARCHAR(512) PRIMARY KEY NOT NULL,
  vehicle_id     VARCHAR(64),
  asset_type     VARCHAR(32) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  last_access_at BIGINT NOT NULL,
  CONSTRAINT chk_cache_type CHECK (asset_type IN ('photo', 'poster', 'thumb', 'render_block')),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);

CREATE INDEX idx_cache_lru_access ON cache_lru_index(last_access_at ASC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          VARCHAR(64) PRIMARY KEY NOT NULL,
  event       VARCHAR(128) NOT NULL,
  properties  TEXT,
  created_at  BIGINT NOT NULL
);

CREATE INDEX idx_analytics_event ON analytics_events(event, created_at DESC);
