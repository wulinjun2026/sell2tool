-- Schema v4 - users & multi-tenant (MySQL)
CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(64) PRIMARY KEY NOT NULL,
  phone           VARCHAR(20) NOT NULL UNIQUE,
  plan            VARCHAR(16) NOT NULL DEFAULT 'free',
  product_limit   INT NOT NULL DEFAULT 40,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  last_login_at   BIGINT
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id              VARCHAR(64) PRIMARY KEY NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  code_hash       VARCHAR(128) NOT NULL,
  expires_at      BIGINT NOT NULL,
  created_at      BIGINT NOT NULL,
  used_at         BIGINT
);

CREATE INDEX idx_auth_codes_phone ON auth_codes(phone);

ALTER TABLE vehicles ADD COLUMN user_id VARCHAR(64);
CREATE INDEX idx_vehicles_user ON vehicles(user_id);

ALTER TABLE dealer_profile ADD COLUMN user_id VARCHAR(64);
CREATE UNIQUE INDEX idx_dealer_user ON dealer_profile(user_id);
