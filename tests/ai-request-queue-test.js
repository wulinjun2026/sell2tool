/**
 * AI 请求队列测试
 */
process.env.AI_QUEUE_CONCURRENCY = '2';
process.env.AI_QUEUE_MAX = '4';
process.env.AI_QUEUE_WAIT_MS = '5000';

const assert = require('assert');
const aiRequestQueue = require('../server/services/aiRequestQueue');

(async () => {
  assert.strictEqual(aiRequestQueue.MAX_CONCURRENT, 2);
  assert.strictEqual(aiRequestQueue.MAX_QUEUE, 4);

  let running = 0;
  let maxRunning = 0;

  const slowJob = () => new Promise((resolve) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    setTimeout(() => {
      running -= 1;
      resolve('ok');
    }, 100);
  });

  await Promise.all([aiRequestQueue.run(slowJob), aiRequestQueue.run(slowJob), aiRequestQueue.run(slowJob)]);
  assert.ok(maxRunning <= 2, `concurrency should be <= 2, got ${maxRunning}`);

  let queueFull = false;
  const blockers = [
    aiRequestQueue.run(() => new Promise((r) => setTimeout(r, 400))),
    aiRequestQueue.run(() => new Promise((r) => setTimeout(r, 400))),
  ];
  await new Promise((r) => setTimeout(r, 20));
  const extras = await Promise.allSettled([
    aiRequestQueue.run(() => Promise.resolve('a')),
    aiRequestQueue.run(() => Promise.resolve('b')),
    aiRequestQueue.run(() => Promise.resolve('c')),
    aiRequestQueue.run(() => Promise.resolve('d')),
    aiRequestQueue.run(() => Promise.resolve('e')),
  ]);
  if (extras.some((item) => item.reason?.code === 'AI_QUEUE_FULL')) queueFull = true;
  await Promise.all(blockers);
  assert.ok(queueFull, 'queue should reject when full');

  const stats = aiRequestQueue.getStats();
  assert.strictEqual(stats.maxConcurrent, 2);
  assert.ok(stats.pending >= 0);

  console.log('✓ AI 请求队列并发与限流逻辑就绪');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
