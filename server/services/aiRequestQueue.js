const appSettings = require('./appSettings');

let MAX_CONCURRENT = 3;
let MAX_QUEUE = 30;
let QUEUE_WAIT_MS = 120000;

let active = 0;
const pending = [];

function reloadFromSettings() {
  const ai = appSettings.getEffectiveAi();
  MAX_CONCURRENT = Math.max(1, ai.queueConcurrency);
  MAX_QUEUE = Math.max(1, ai.queueMax);
  QUEUE_WAIT_MS = Math.max(1000, ai.queueWaitMs);
}

reloadFromSettings();

function createQueueError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function pump() {
  while (active < MAX_CONCURRENT && pending.length) {
    const job = pending.shift();
    if (!job || job.cancelled) continue;
    clearTimeout(job.timeoutId);
    active += 1;
    Promise.resolve()
      .then(() => job.fn())
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

function run(fn, { label = 'ai' } = {}) {
  return new Promise((resolve, reject) => {
    if (pending.length >= MAX_QUEUE) {
      reject(createQueueError('AI_QUEUE_FULL'));
      return;
    }

    const job = {
      label,
      fn,
      resolve,
      reject,
      cancelled: false,
      timeoutId: setTimeout(() => {
        job.cancelled = true;
        const idx = pending.indexOf(job);
        if (idx >= 0) pending.splice(idx, 1);
        reject(createQueueError('AI_QUEUE_TIMEOUT'));
      }, QUEUE_WAIT_MS),
    };

    pending.push(job);
    pump();
  });
}

function getStats() {
  return {
    maxConcurrent: MAX_CONCURRENT,
    maxQueue: MAX_QUEUE,
    queueWaitMs: QUEUE_WAIT_MS,
    active,
    pending: pending.length,
  };
}

module.exports = {
  run,
  getStats,
  reloadFromSettings,
  get MAX_CONCURRENT() {
    return MAX_CONCURRENT;
  },
  get MAX_QUEUE() {
    return MAX_QUEUE;
  },
  get QUEUE_WAIT_MS() {
    return QUEUE_WAIT_MS;
  },
};
