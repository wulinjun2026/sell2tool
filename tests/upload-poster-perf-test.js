/**
 * 并发工具与嵌入并行逻辑
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const asyncSrc = fs.readFileSync(path.join(__dirname, '../public/js/asyncUtils.js'), 'utf8');
const embedSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterImageEmbedClient.js'), 'utf8');
const compressSrc = fs.readFileSync(path.join(__dirname, '../public/js/photoCompressClient.js'), 'utf8');

assert.ok(asyncSrc.includes('mapWithConcurrency'), 'asyncUtils required');
assert.ok(embedSrc.includes('mapWithConcurrency'), 'embed must run in parallel');
assert.ok(embedSrc.includes('EMBED_CONCURRENCY'), 'embed concurrency constant required');
assert.ok(compressSrc.includes('shouldSkipReencode'), 'skip reencode for optimized jpeg');
assert.ok(compressSrc.includes('compressPhotosForUpload'), 'batch compress required');

(async () => {
  const { mapWithConcurrency } = await import('../public/js/asyncUtils.js');
  let running = 0;
  let maxRunning = 0;
  await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setTimeout(r, 30));
    running -= 1;
  });
  assert.ok(maxRunning <= 2, `expected concurrency 2, got ${maxRunning}`);
  console.log('✓ 上传/长图并行优化模块检查通过');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
