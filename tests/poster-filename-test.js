/**
 * 长图中文文件名测试
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const saveSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterSave.js'), 'utf8');

assert.ok(saveSrc.includes('buildPosterFilename'), 'missing buildPosterFilename');
assert.ok(saveSrc.includes('产品长图_'), 'filename must use Chinese prefix');
assert.ok(!saveSrc.includes('used-car-poster'), 'should not use English default name');

// 动态 import ESM
(async () => {
  const mod = await import(`file://${path.join(__dirname, '../public/js/posterSave.js')}`);
  const { buildPosterFilename } = mod;

  const single = buildPosterFilename({ brandModel: '宝马 320Li' });
  assert.match(single, /^产品长图_宝马320Li_\d{8}_\d{4}\.png$/, `single name: ${single}`);

  const multi = buildPosterFilename({ vehicleCount: 3 });
  assert.match(multi, /^产品长图_多件合集3件_\d{8}_\d{4}\.png$/, `multi name: ${multi}`);

  const fallback = buildPosterFilename({ code: 'CC20260611001' });
  assert.ok(fallback.startsWith('产品长图_'), fallback);
  assert.ok(fallback.endsWith('.png'), fallback);

  console.log('✓ 长图中文文件名规则正确');
  console.log(`  示例: ${single}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
