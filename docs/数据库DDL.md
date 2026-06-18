# 通用产品销售助手 — 数据库 DDL

**版本**: v1.1  
**日期**: 2026-06-15  
**引擎**: SQLite 3（本地）/ MySQL 8（生产）  
**关联文档**: [系统架构设计.md](../系统架构设计.md)、[API设计.md](./API设计.md)、[开发更新日志.md](./开发更新日志.md)

---

## 1. 设计说明

- 业务数据存服务端 DB；**长图 PNG 不在服务端落盘**
- 长图生成仅写 `poster_generations` 元数据；客户端 IndexedDB 缓存 PNG Base64
- **v1.1**：用户、产品、经销商资料按 `user_id` 隔离（多租户）
- 时间戳统一 **Unix 毫秒**（`INTEGER` / `BIGINT`）
- 软删除：**不使用**；删除产品即硬删 + 清 uploads 目录
- 字符集：UTF-8

**Schema 版本**：当前 `4`（迁移 `001` → `002` → `003` → `004`）

**迁移文件**：

| 文件 | 说明 |
|------|------|
| `001_init.sql` / `.mysql.sql` | 初始表 |
| `002_vehicle_code_nullable.sql` | 草稿阶段 `code` 可空 |
| `003_poster_generations.sql` / `.mysql.sql` | 长图生成记录 |
| `004_users.sql` / `.mysql.sql` | **用户、验证码、user_id 列** |

## 2. ER 关系

```
users (1) ──< vehicles (N)
users (1) ──< dealer_profile (N)   [每用户一条，user_id UNIQUE]
users (1) ──< auth_codes (N)       [验证码记录，按 phone 查询]
vehicles (1) ──< vehicle_photos (N)
vehicles (1) ──< vehicle_selling_points (N)
vehicles (1) ──< share_records (N)
vehicles (N) ──> poster_templates (1)  [optional FK]
poster_generations (1) ──< poster_generation_vehicles (N) >── vehicles
seq_counter (独立)
selling_point_builtin (预置)
analytics_events (独立)
app_meta (独立)
```

---

## 3. DDL（SQLite）

### 3.1 元数据

```sql
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

-- 初始化
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('cache_quota_bytes', '524288000');
```

---

### 3.2 经销商资料（单条或少量）

```sql
CREATE TABLE IF NOT EXISTS dealer_profile (
  id              TEXT PRIMARY KEY NOT NULL,  -- UUID
  shop_name       TEXT NOT NULL DEFAULT '',
  contact_phone   TEXT NOT NULL DEFAULT '',
  contact_wechat  TEXT NOT NULL DEFAULT '',
  watermark_text  TEXT,
  watermark_x     REAL,                       -- 0~1 相对坐标
  watermark_y     REAL,
  watermark_enabled INTEGER NOT NULL DEFAULT 1,
  qrcode_path     TEXT,                       -- 本地 PNG 路径
  qrcode_payload  TEXT,                       -- 扫码跳转：vehicle://{id} 或 https://
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_dealer_profile_updated ON dealer_profile(updated_at DESC);
```

---

### 3.3 车辆主表

```sql
CREATE TABLE IF NOT EXISTS vehicles (
  id                    TEXT PRIMARY KEY NOT NULL,
  code                  TEXT NOT NULL UNIQUE,  -- CCyyyyMMddHHmmNNN
  status                TEXT NOT NULL CHECK (status IN ('draft', 'on_sale', 'sold')),

  brand_model           TEXT,
  year                  INTEGER,
  mileage_km            INTEGER,
  price_wan             REAL,
  price_tags_json       TEXT,                  -- JSON array: ["首付低至","分期价"]

  extra_description     TEXT,                  -- 用户原文
  polished_description  TEXT,                  -- AI 润色后选用版

  template_id           TEXT,
  long_image_path       TEXT,                  -- 遗留字段；MVP 不再写入 PNG 路径
  long_image_updated_at INTEGER,
  last_poster_generated_at INTEGER,            -- v3：最后正式生成长图时间
  has_poster            INTEGER NOT NULL DEFAULT 0,  -- v3：是否已生成长图
  thumb_path            TEXT,

  has_frunk_slot        INTEGER NOT NULL DEFAULT 0,  -- 是否展示前备箱位

  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  sold_at               INTEGER,

  FOREIGN KEY (template_id) REFERENCES poster_templates(id)
);

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_updated ON vehicles(updated_at DESC);
CREATE INDEX idx_vehicles_brand ON vehicles(brand_model);
CREATE INDEX idx_vehicles_price ON vehicles(price_wan);
CREATE INDEX idx_vehicles_code ON vehicles(code);
```

---

### 3.4 车辆照片（结构化槽位）

```sql
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

CREATE INDEX idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);
CREATE INDEX idx_vehicle_photos_slot ON vehicle_photos(vehicle_id, category, slot_key);
```

**slot_key 枚举**（应用层校验）：

| category | slot_key |
|----------|----------|
| exterior | front, rear, left45, left, right45, right |
| interior | center_console, screen, driver_seat |
| seats | front_seats, rear_seats, trunk, frunk |

---

### 3.5 车辆已选卖点（关联表）

```sql
CREATE TABLE IF NOT EXISTS vehicle_selling_points (
  id          TEXT PRIMARY KEY NOT NULL,
  vehicle_id  TEXT NOT NULL,
  point_id    TEXT,              -- 内置库 id，自定义为空
  category    TEXT NOT NULL,
  text        TEXT NOT NULL,
  emoji       TEXT,
  sort_index  INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL CHECK (source IN ('builtin', 'custom', 'ai')),

  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX idx_vsp_vehicle ON vehicle_selling_points(vehicle_id);
```

---

### 3.6 分享记录

```sql
CREATE TABLE IF NOT EXISTS share_records (
  id            TEXT PRIMARY KEY NOT NULL,
  vehicle_id    TEXT NOT NULL,
  shared_at     INTEGER NOT NULL,
  copy_text     TEXT,
  share_type    TEXT NOT NULL CHECK (share_type IN (
    'long_image_only', 'long_image_with_photos', 'photos_only'
  )),
  platform      TEXT NOT NULL DEFAULT 'wechat_moments',
  long_image_path TEXT,

  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX idx_share_records_vehicle ON share_records(vehicle_id, shared_at DESC);
```

---

### 3.7 当日发号计数器

```sql
CREATE TABLE IF NOT EXISTS seq_counter (
  date_key    TEXT PRIMARY KEY NOT NULL,  -- yyyyMMdd
  last_seq    INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0 AND last_seq <= 999),
  updated_at  INTEGER NOT NULL
);
```

**发号伪代码**（须在事务内）：

```sql
BEGIN IMMEDIATE;
INSERT INTO seq_counter (date_key, last_seq, updated_at)
  VALUES (:today, 0, :now)
  ON CONFLICT(date_key) DO NOTHING;
UPDATE seq_counter
  SET last_seq = last_seq + 1, updated_at = :now
  WHERE date_key = :today AND last_seq < 999;
-- 若 changes()=0 则 ROLLBACK，抛 CODE_EXHAUSTED
COMMIT;
```

---

### 3.8 内置卖点库（预置数据）

```sql
CREATE TABLE IF NOT EXISTS selling_point_builtin (
  id          TEXT PRIMARY KEY NOT NULL,
  category    TEXT NOT NULL,
  text        TEXT NOT NULL,
  emoji       TEXT,
  tags_json   TEXT,              -- JSON: ["宝马","SUV","低里程"]
  weight      INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_spb_category ON selling_point_builtin(category);
CREATE INDEX idx_spb_weight ON selling_point_builtin(weight DESC);
```

---

### 3.9 海报模板元数据

```sql
CREATE TABLE IF NOT EXISTS poster_templates (
  id              TEXT PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL,
  style           TEXT NOT NULL,           -- simple | business | sport | luxury ...
  layout_path     TEXT NOT NULL,           -- 本地 layoutSchema JSON 路径
  preview_path    TEXT,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  bundled         INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1
);
```

---

### 3.10 长图生成记录（v3）

服务端**不保存 PNG 文件**，仅记录生成元数据，供 `hasPoster` 与分享 `generationId` 使用。

```sql
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
```

**客户端补充**（非服务端 DB）：

| 存储 | 说明 |
|------|------|
| IndexedDB `used-car-poster-cache-v1` | 长图 PNG Base64 缓存，最多 24 条 |
| IndexedDB `used-car-gallery-v1` | 多车合集图库，命名 `YYYYMMDD-NN`，最多 100 条 |

原规划 `cache_lru_index` 表暂未在 MVP 实现，LRU 由客户端 IndexedDB 条目上限代替。

---

### 3.11 用户与多租户（v4）

```sql
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY NOT NULL,
  phone           TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free',   -- free | paid
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

-- 迁移：为既有表增加 user_id
ALTER TABLE vehicles ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);

ALTER TABLE dealer_profile ADD COLUMN user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dealer_user ON dealer_profile(user_id);
```

| 字段 | 说明 |
|------|------|
| `users.plan` | `paid` 时无试用与产品数限制 |
| `users.product_limit` | 免费用户默认 40 |
| `auth_codes.code_hash` | SHA-256，明文不落库 |
| `vehicles.user_id` | 列表/创建/删除均按当前登录用户过滤 |

---

## 4. 视图（可选）

```sql
CREATE VIEW IF NOT EXISTS v_vehicle_summary AS
SELECT
  v.id,
  v.code,
  v.status,
  v.brand_model,
  v.year,
  v.mileage_km,
  v.price_wan,
  v.thumb_path,
  v.long_image_path,
  v.updated_at,
  (SELECT COUNT(*) FROM share_records sr WHERE sr.vehicle_id = v.id) AS share_count,
  (SELECT COUNT(*) FROM vehicle_photos vp WHERE vp.vehicle_id = v.id) AS photo_count
FROM vehicles v;
```

---

## 5. 迁移策略

```sql
-- 示例：v1 → v2 增加字段
-- PRAGMA user_version = 2;
-- ALTER TABLE vehicles ADD COLUMN displacement TEXT;
```

| 版本 | 变更 |
|------|------|
| 1 | 初版全表（`001_init`） |
| 2 | 草稿 `code` 可空（`002_vehicle_code_nullable`） |
| 3 | `poster_generations` / `poster_generation_vehicles`；`has_poster`、`last_poster_generated_at`（`003_poster_generations`） |
| 4（规划） | `sync_state`、分享统计字段 |

应用启动时：

```sql
PRAGMA user_version;
-- 若 < target，顺序执行 migration_v{n}.sql
```

---

## 6. 预置数据示例

### 6.1 卖点（节选）

```sql
INSERT INTO selling_point_builtin (id, category, text, emoji, tags_json, weight) VALUES
('sp_001', 'appearance', '全车原版原漆，漆面光泽如新', '🚗', '["原版原漆","外观"]', 90),
('sp_002', 'performance', '仅行驶 3 万公里，动力充沛无事故', '⚡', '["低里程","无事故"]', 95),
('sp_003', 'interior', '真皮座椅零磨损，内饰 9.9 成新', '💺', '["内饰","真皮"]', 80),
('sp_004', 'value', '新车落地 30w，现仅需 16.8w 开回家', '💰', '["性价比"]', 85),
('sp_005', 'resale', '三年保值率 75%，再开两年也不亏', '📈', '["保值率"]', 70),
('sp_006', 'inspection', '第三方检测认证，90 天回购保障', '✅', '["检测"]', 60);
```

### 6.2 模板（节选）

```sql
INSERT INTO poster_templates (id, name, style, layout_path, preview_path, sort_order) VALUES
('tpl_simple_01', '简约白', 'simple', 'assets/templates/tpl_simple_01.json', 'assets/templates/previews/tpl_simple_01.png', 1),
('tpl_business_01', '商务蓝', 'business', 'assets/templates/tpl_business_01.json', 'assets/templates/previews/tpl_business_01.png', 2),
('tpl_sport_01', '运动橙', 'sport', 'assets/templates/tpl_sport_01.json', 'assets/templates/previews/tpl_sport_01.png', 3);
```

---

## 7. 文件系统与 DB 一致性

| 操作 | DB | 文件 |
|------|-----|------|
| 上传照片 | INSERT vehicle_photos | 写 `uploads/vehicles/{id}/{uuid}.jpg`（Multer 内存 + UUID） |
| 正式生成长图 | INSERT poster_generations；UPDATE vehicles.has_poster | **不写 PNG**；客户端 IndexedDB 缓存 Base64 |
| 删除车辆 | DELETE CASCADE | `rm -rf uploads/vehicles/{id}/` |

**thumb_path**：取 `exterior/front` 首张或任意首张可用图生成 200×200 缩略图。

---

## 8. 查询示例

### 8.1 列表筛选（在售 + 关键词）

```sql
SELECT * FROM vehicles
WHERE status = 'on_sale'
  AND (brand_model LIKE '%' || :kw || '%' OR code LIKE '%' || :kw || '%')
ORDER BY updated_at DESC
LIMIT :limit OFFSET :offset;
```

### 8.2 统计概览

```sql
SELECT status, COUNT(*) AS cnt
FROM vehicles
GROUP BY status;
```

### 8.3 已发布车源数（v1.2，`GET /api/stats` → `posterTotal`）

统计有**正式长图**生成记录的不重复车源数（非生成次数）：

```sql
SELECT COUNT(DISTINCT pgv.vehicle_id) AS c
FROM poster_generation_vehicles pgv
INNER JOIN poster_generations pg ON pg.id = pgv.generation_id
WHERE pg.is_preview = 0;
```

实现：`vehicleRepository.countPublishedVehicles(db)`

### 8.4 车辆是否已生成长图

```sql
SELECT v.*, pg.id AS last_generation_id
FROM vehicles v
LEFT JOIN poster_generation_vehicles pgv ON pgv.vehicle_id = v.id
LEFT JOIN poster_generations pg ON pg.id = pgv.generation_id AND pg.is_preview = 0
WHERE v.has_poster = 1
ORDER BY v.updated_at DESC;
```

---

## 9. 容量估算

| 项 | 估算 |
|----|------|
| 单车 DB 行 | ~2KB（含 JSON 字段） |
| 100 辆车 | ~200KB 结构化数据 |
| 照片 13 槽 × 3 张 × 400KB | ~15MB/车（压缩后远小于此） |
| 配额 500MB | 以文件为主，DB 可忽略 |

---

*文档结束*
