const mysql = require('mysql2/promise');

function createMysqlAdapter(pool) {
  async function get(sql, ...params) {
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  }

  async function all(sql, ...params) {
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  async function run(sql, ...params) {
    const [result] = await pool.execute(sql, params);
    return { changes: result.affectedRows, lastInsertRowid: result.insertId };
  }

  async function exec(sql) {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        if ([1050, 1060, 1061, 1062].includes(err.errno)) continue;
        throw err;
      }
    }
  }

  async function transaction(fn) {
    const conn = await pool.getConnection();
    const tx = {
      driver: 'mysql',
      get: (sql, ...params) => conn.execute(sql, params).then(([rows]) => rows[0] || null),
      all: (sql, ...params) => conn.execute(sql, params).then(([rows]) => rows),
      run: (sql, ...params) =>
        conn.execute(sql, params).then(([result]) => ({
          changes: result.affectedRows,
          lastInsertRowid: result.insertId,
        })),
    };
    try {
      await conn.beginTransaction();
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return {
    driver: 'mysql',
    pool,
    get,
    all,
    run,
    exec,
    transaction,
    async close() {
      await pool.end();
    },
  };
}

async function createMysqlPool(config) {
  const connectionLimit = Math.max(
    1,
    parseInt(process.env.MYSQL_CONNECTION_LIMIT || '20', 10)
  );
  const pool = mysql.createPool({
    host: config.host || '127.0.0.1',
    port: parseInt(config.port || '3306', 10),
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit,
    charset: 'utf8mb4',
  });
  await pool.query('SELECT 1');
  return createMysqlAdapter(pool);
}

module.exports = { createMysqlAdapter, createMysqlPool };
