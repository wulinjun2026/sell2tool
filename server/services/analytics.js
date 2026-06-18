const { v4: uuidv4 } = require('uuid');

async function track(db, event, properties = {}) {
  await db.run(
    `INSERT INTO analytics_events (id, event, properties, created_at) VALUES (?, ?, ?, ?)`,
    uuidv4(),
    event,
    JSON.stringify(properties),
    Date.now()
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[analytics] ${event}`, properties);
  }
}

async function trackTiming(db, name, durationMs, props = {}) {
  await track(db, `timing_${name}`, { duration_ms: durationMs, ...props });
}

module.exports = { track, trackTiming };
