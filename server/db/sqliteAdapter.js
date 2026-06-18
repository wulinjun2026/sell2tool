function createSqliteAdapter(nativeDb) {
  const adapter = {
    driver: 'sqlite',
    native: nativeDb,
    get(sql, ...params) {
      return Promise.resolve(nativeDb.prepare(sql).get(...params));
    },
    all(sql, ...params) {
      return Promise.resolve(nativeDb.prepare(sql).all(...params));
    },
    run(sql, ...params) {
      const info = nativeDb.prepare(sql).run(...params);
      return Promise.resolve({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
    },
    exec(sql) {
      nativeDb.exec(sql);
      return Promise.resolve();
    },
    async transaction(fn) {
      nativeDb.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(adapter);
        nativeDb.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          nativeDb.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
    },
  };
  return adapter;
}

module.exports = { createSqliteAdapter };
