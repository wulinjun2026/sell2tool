async function generateCode(db) {
  const now = new Date();
  const dateKey =
    now.getFullYear() +
    pad(now.getMonth() + 1, 2) +
    pad(now.getDate(), 2);
  const timePart = pad(now.getHours(), 2) + pad(now.getMinutes(), 2);
  const ts = Date.now();

  return db.transaction(async (tx) => {
    if (db.driver === 'mysql') {
      await tx.run(
        `INSERT INTO seq_counter (date_key, last_seq, updated_at) VALUES (?, 0, ?)
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        dateKey,
        ts
      );
    } else {
      await tx.run(
        `INSERT INTO seq_counter (date_key, last_seq, updated_at) VALUES (?, 0, ?)
         ON CONFLICT(date_key) DO NOTHING`,
        dateKey,
        ts
      );
    }

    const result = await tx.run(
      `UPDATE seq_counter SET last_seq = last_seq + 1, updated_at = ? WHERE date_key = ? AND last_seq < 999`,
      ts,
      dateKey
    );

    if (result.changes === 0) {
      throw new Error('CODE_EXHAUSTED');
    }

    const row = await tx.get('SELECT last_seq FROM seq_counter WHERE date_key = ?', dateKey);
    return `CC${dateKey}${timePart}${pad(row.last_seq)}`;
  });
}

function pad(n, len = 3) {
  return String(n).padStart(len, '0');
}

function validate(code) {
  return /^CC\d{8}\d{4}\d{3}$/.test(code);
}

module.exports = { generateCode, validate };
