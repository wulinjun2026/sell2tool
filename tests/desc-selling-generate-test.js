const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');

assert.ok(!serverSrc.includes('/api/vehicles/:vehicleId/recognize'), 'recognize route should be removed');
assert.ok(serverSrc.includes('/api/selling-points/generate'), 'should have LLM selling generate route');
assert.ok(!htmlSrc.includes('id="page-sell"'), 'page-sell should be removed');
assert.ok(htmlSrc.includes('btn-generate-selling'), 'desc page should have generate selling button');
assert.ok(htmlSrc.includes('selling-tags'), 'desc page should have selling tags');
assert.ok(!appSrc.includes('recognizeAndApplyModel'), 'client should not call recognize');
assert.ok(appSrc.includes('generateSellingPointsFromDesc'), 'client should generate selling from desc');
assert.ok(apiSrc.includes('generateSellingPoints'), 'api client should call generate endpoint');

const {
  generateSellingPointsFromInput,
  localGenerateSellingPoints,
  polishSync,
} = require('../server/services/copyPolish');

const local = localGenerateSellingPoints(
  '21年宝马X5，3万公里，全程4S店保养，原版原漆',
  '宝马X5 2021款',
  8
);
assert.ok(local.length >= 3, 'local fallback should produce selling points');
assert.ok(local.every((p) => p.text && p.emoji), 'each point needs text and emoji');

(async () => {
  const generated = await generateSellingPointsFromInput(
    '21年宝马X5，3万公里，全程4S店保养，原版原漆无事故',
    { brandModel: '宝马X5 2021款', priceWan: 36.8, limit: 8 }
  );
  assert.ok(generated.points.length >= 3);
  assert.ok(['llm', 'local_template'].includes(generated.source));

  const polished = await polishSync({
    scene: 'vehicle_description',
    rawText: '21年宝马X5，3万公里，全程4S店保养',
    brandModel: '宝马X5 2021款',
    maxLength: 100,
  });
  assert.ok(polished.polished.length > 10);

  console.log('✓ 描述页大模型提炼总结逻辑就绪');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
