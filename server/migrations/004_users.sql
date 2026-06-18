-- Schema v4 - users & multi-tenant
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY NOT NULL,
  phone           TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free',
  product_limit   INTEGER NOT NULL DEFAULT 40,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id              TEXT PRIMARY KEY NOT NULL,
  phone           TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  used_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes(phone);
