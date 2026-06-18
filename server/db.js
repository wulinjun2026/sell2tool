const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createSqliteAdapter } = require('./db/sqliteAdapter');
const { createMysqlPool } = require('./db/mysqlAdapter');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
}

function ensureDirs() {
  [DATA_DIR, UPLOADS_DIR, path.join(UPLOADS_DIR, 'vehicles')].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

const SEED_POINTS = [
  ['sp_001', 'appearance', '全车原版原漆，漆面光泽如新', '🚗', '["原版原漆","外观","宝马"]', 90],
  ['sp_002', 'performance', '仅行驶 3 万公里，动力充沛无事故', '⚡', '["低里程","无事故"]', 95],
  ['sp_003', 'interior', '真皮座椅零磨损，内饰 9.9 成新', '💺', '["内饰","真皮"]', 80],
  ['sp_004', 'value', '新车落地 30w，现仅需 16.8w 开回家', '💰', '["性价比"]', 85],
  ['sp_005', 'resale', '三年保值率 75%，再开两年也不亏', '📈', '["保值率"]', 70],
  ['sp_006', 'inspection', '第三方检测认证，90 天回购保障', '✅', '["检测"]', 60],
  ['sp_007', 'performance', '全程4S店保养，记录齐全', '🔧', '["保养","4S"]', 88],
  ['sp_008', 'interior', '哈曼卡顿音响，音质顶级', '🎵', '["音响","宝马"]', 75],
  ['sp_009', 'appearance', '加装隐形车衣，漆面保护到位', '🛡️', '["车衣","外观"]', 82],
  ['sp_010', 'value', '支持分期置换，首付低至3成', '💳', '["分期"]', 78],
  ['sp_011', 'performance', '准新车况，一手户', '⭐', '["一手","准新"]', 92],
  ['sp_012', 'appearance', '无钣金无喷漆，车况透明', '🔍', '["无事故"]', 86],
  ['sp_013', 'performance', '新能源电池健康度98%，续航扎实', '🔋', '["新能源","电池"]', 84],
  ['sp_014', 'interior', '电动尾门、全景天窗配置齐全', '🌤️', '["配置","天窗"]', 76],
  ['sp_015', 'value', '比新车省一半，性价比超高', '💎', '["性价比"]', 88],
  ['sp_016', 'inspection', '已通过268项检测，放心购买', '📋', '["检测"]', 72],
  ['sp_017', 'appearance', '改色膜可撕，原漆完好', '🎨', '["外观","车衣"]', 74],
  ['sp_018', 'performance', '涡轮介入平顺，动力随叫随到', '🏎️', '["动力"]', 81],
  ['sp_019', 'interior', '后排空间宽敞，家用商务两相宜', '🛋️', '["空间","商务"]', 79],
  ['sp_020', 'resale', '热门车型，出手快流通强', '🔥', '["热门","流通"]', 83],
  ['sp_021', 'value', '包过户包提档，手续齐全当天开走', '📄', '["手续","过户"]', 77],
  ['sp_022', 'performance', '四驱版本，雨雪天气更稳', '❄️', '["四驱","宝马"]', 80],
  ['sp_023', 'appearance', 'LED大灯升级，夜间行车更安全', '💡', '["灯光","外观"]', 73],
  ['sp_024', 'interior', '座椅通风加热，四季驾乘舒适', '🌡️', '["座椅","舒适"]', 78],
  ['sp_025', 'performance', '丰田系保值率高，开两年仍好出手', '📈', '["丰田","保值","热门","流通"]', 86],
  ['sp_026', 'performance', '本田发动机可靠，保养省心耐用', '🔧', '["本田","耐用","保养"]', 84],
  ['sp_027', 'interior', '奔驰内饰氛围灯，豪华感拉满', '✨', '["奔驰","豪华","商务","内饰"]', 82],
  ['sp_028', 'performance', '奥迪quattro四驱，湿滑路面更稳', '❄️', '["奥迪","四驱","豪华"]', 81],
  ['sp_029', 'performance', '特斯拉智驾辅助，科技配置领先', '🤖', '["特斯拉","新能源","配置","准新"]', 87],
  ['sp_030', 'value', '比亚迪刀片电池，安全续航双在线', '🔋', '["比亚迪","新能源","电池","性价比"]', 85],
  ['sp_031', 'interior', 'SUV视野开阔，家用出游空间足', '🏕️', '["SUV","空间","家用"]', 80],
  ['sp_032', 'interior', 'MPV座椅布局灵活，商务接待首选', '💼', '["MPV","空间","商务"]', 79],
];

async function seedData(db) {
  const dealerCount = (await db.get('SELECT COUNT(*) AS c FROM dealer_profile')).c;
  if (dealerCount === 0) {
    await db.run(
      `INSERT INTO dealer_profile (id, shop_name, contact_phone, contact_wechat, watermark_text, watermark_enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      'default-dealer',
      '李明二手车',
      '13888888888',
      'liming_cars',
      '李明二手车 · 13888888888',
      Date.now()
    );
  }

  const tplCount = (await db.get('SELECT COUNT(*) AS c FROM poster_templates')).c;
  if (tplCount === 0) {
    const templates = [
      ['tpl_simple_01', '简约白', 'simple', 'assets/templates/tpl_simple_01.json', null, 1],
      ['tpl_business_01', '商务蓝', 'business', 'assets/templates/tpl_business_01.json', null, 2],
      ['tpl_sport_01', '运动橙', 'sport', 'assets/templates/tpl_sport_01.json', null, 3],
    ];
    for (const tpl of templates) {
      await db.run(
        `INSERT INTO poster_templates (id, name, style, layout_path, preview_path, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ...tpl
      );
    }
  }

  const insertSp = `INSERT INTO selling_point_builtin (id, category, text, emoji, tags_json, weight)
    VALUES (?, ?, ?, ?, ?, ?)`;
  for (const p of SEED_POINTS) {
    const exists = await db.get('SELECT id FROM selling_point_builtin WHERE id = ?', p[0]);
    if (!exists) {
      await db.run(insertSp, ...p);
    }
  }
}

async function runPosterGenerationMigration(db, driver) {
  const file = driver === 'mysql'
    ? '003_poster_generations.mysql.sql'
    : '003_poster_generations.sql';
  const migration = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
  await db.exec(migration);
}

async function runUsersMigration(db, driver, nativeDb = null) {
  const file = driver === 'mysql'
    ? '004_users.mysql.sql'
    : '004_users.sql';
  const migration = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
  await db.exec(migration);

  if (driver !== 'mysql' && nativeDb) {
    const vehicleCols = nativeDb.prepare('PRAGMA table_info(vehicles)').all();
    if (!vehicleCols.find((c) => c.name === 'user_id')) {
      nativeDb.exec('ALTER TABLE vehicles ADD COLUMN user_id TEXT');
      nativeDb.exec('CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id)');
    }
    const dealerCols = nativeDb.prepare('PRAGMA table_info(dealer_profile)').all();
    if (!dealerCols.find((c) => c.name === 'user_id')) {
      nativeDb.exec('ALTER TABLE dealer_profile ADD COLUMN user_id TEXT');
      nativeDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_dealer_user ON dealer_profile(user_id)');
    }
  }
}

async function runSqliteMigrations(nativeDb) {
  const version = parseInt(
    nativeDb.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value || '1',
    10
  );
  if (version >= 2) return;

  const codeCol = nativeDb.prepare('PRAGMA table_info(vehicles)').all().find((c) => c.name === 'code');
  if (codeCol?.notnull === 1) {
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrations', '002_vehicle_code_nullable.sql'),
      'utf8'
    );
    nativeDb.exec(migration);
  } else {
    nativeDb.prepare("UPDATE app_meta SET value = '2' WHERE key = 'schema_version'").run();
  }
}

async function initSqliteDb() {
  ensureDirs();
  const nativeDb = new Database(DB_PATH);
  nativeDb.pragma('journal_mode = WAL');
  nativeDb.pragma('foreign_keys = ON');

  const migration = fs.readFileSync(path.join(__dirname, 'migrations', '001_init.sql'), 'utf8');
  nativeDb.exec(migration);
  await runSqliteMigrations(nativeDb);

  const db = createSqliteAdapter(nativeDb);
  await runPosterGenerationMigration(db, 'sqlite');
  await runUsersMigration(db, 'sqlite', nativeDb);
  await seedData(db);
  return db;
}

async function initMysqlDb() {
  ensureDirs();
  const db = await createMysqlPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const migration = fs.readFileSync(
    path.join(__dirname, 'migrations', '001_init.mysql.sql'),
    'utf8'
  );
  await db.exec(migration);
  await runPosterGenerationMigration(db, 'mysql');
  await runUsersMigration(db, 'mysql');
  await seedData(db);
  return db;
}

async function initDb() {
  loadEnvFile();
  const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
  if (driver === 'mysql') {
    return initMysqlDb();
  }
  return initSqliteDb();
}

function vehicleDir(vehicleId) {
  const dir = path.join(UPLOADS_DIR, 'vehicles', vehicleId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  ROOT,
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  initDb,
  vehicleDir,
};
