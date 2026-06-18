const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
assert.ok(appSrc.includes('refreshDescWithSelling'), 'client should merge selected selling into desc');
assert.ok(appSrc.includes('mergeSellingIntoDescription'), 'should inline merge selling text');
assert.ok(appSrc.includes('getPosterDescPreviewText'), 'preview should include price');

const {
  composeDescriptionText,
  mergeSellingIntoDescription,
  stripKnownSellingTexts,
  appendPriceToDescription,
  buildPosterDescription,
} = require('../server/services/descCompose');

const allPoints = [
  { text: '原版原漆' },
  { text: '车况极品' },
  { text: '空间宽敞' },
  { text: '支持分期' },
];

const base = '大众速腾，品质之选！';
const composed = mergeSellingIntoDescription(base, [
  { text: '车况极品' },
  { text: '原版原漆' },
  { text: '空间宽敞' },
], allPoints);

assert.ok(composed.includes('大众速腾，品质之选'));
assert.ok(composed.includes('车况极品'));
assert.ok(composed.includes('原版原漆'));
assert.ok(!composed.includes('【车辆亮点】'), 'should inline merge without legacy block');

const reduced = mergeSellingIntoDescription(composed, [
  { text: '车况极品' },
], allPoints);
assert.ok(!reduced.includes('原版原漆'));
assert.ok(reduced.includes('车况极品'));

const stripped = stripKnownSellingTexts(composed, allPoints);
assert.strictEqual(stripped, '大众速腾，品质之选！');

const fromLegacy = composeDescriptionText(
  '21年宝马X5\n\n【车辆亮点】原版原漆、全程4S保养',
  [{ text: '低里程精品车况' }],
  [{ text: '原版原漆' }, { text: '全程4S保养' }, { text: '低里程精品车况' }]
);
assert.ok(fromLegacy.includes('21年宝马X5'));
assert.ok(fromLegacy.includes('低里程精品车况'));
assert.ok(!fromLegacy.includes('【车辆亮点】'));

const withPrice = buildPosterDescription({
  polishedDescription: '车况精品，欢迎咨询！',
  priceWan: 4,
});
assert.ok(withPrice.includes('售价：4万元'));

console.log('✓ 点选要点并入产品描述与长图售价展示逻辑就绪');
