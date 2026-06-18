const assert = require('assert');
const fs = require('fs');
const path = require('path');

const copyPolishSrc = fs.readFileSync(path.join(__dirname, '../server/services/copyPolish.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(copyPolishSrc.includes('generateSellingPointsFromInput'), 'should generate selling from input');
assert.ok(copyPolishSrc.includes('callChatApi'), 'should support LLM');
assert.ok(serverSrc.includes('/api/selling-points/generate'), 'api should expose generate endpoint');
assert.ok(appSrc.includes('generateSellingPointsFromDesc'), 'client should generate on desc page');
assert.ok(!appSrc.includes('recommendSellingPoints'), 'client should not use rule-based recommend');

const { generateSellingPointsFromInput } = require('../server/services/copyPolish');

(async () => {
  const result = await generateSellingPointsFromInput('特斯拉Model 3，电池健康95%，一手车', {
    brandModel: '特斯拉 Model 3 2022款',
    limit: 6,
  });
  assert.ok(result.points.length >= 2);
  assert.ok(result.points[0].source === 'ai');
  console.log('✓ 描述驱动提炼总结逻辑就绪');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
