const assert = require('assert');
const fs = require('fs');
const path = require('path');

const recognizeSrc = fs.readFileSync(path.join(__dirname, '../server/services/vehicleRecognize.js'), 'utf8');
const baiduSrc = fs.readFileSync(path.join(__dirname, '../server/services/baiduImageSearch.js'), 'utf8');

assert.ok(recognizeSrc.includes('prepareForRecognition'), 'should use image prep');
assert.ok(recognizeSrc.includes('filterExteriorPhotos'), 'should prefer exterior photos');
assert.ok(recognizeSrc.includes('collectRecognitionHints'), 'should pass baidu hints to fallback');
assert.ok(recognizeSrc.includes('shouldVerifyWithVision'), 'should verify low-confidence baidu with vision');
assert.ok(recognizeSrc.includes('wrapRecognizeResult'), 'should refine recognize output');
assert.ok(baiduSrc.includes('uploadForSearch'), 'should prefer url upload when available');
assert.ok(baiduSrc.includes('normalizeCandidateKey'), 'should vote baidu candidates');

const { extractVehicleModel, extractTextsFromSearchHtml } = require('../server/services/baiduImageSearch');
const { normalizeBrandModelText, getSlotWeight, filterExteriorPhotos } = require('../server/services/recognizeRefine');
const {
  normalizeModelKey,
  aggregateRecognizeResults,
  getSourceWeight,
} = require('../server/services/recognizeAggregate');
const {
  shouldVerifyWithVision,
  collectRecognitionHints,
} = require('../server/services/vehicleRecognize');

const html = `
<title>宝马X5 2021款 白色SUV - 百度图片</title>
<script>{"keyword":"宝马X5","brief":"2021款宝马X5实拍"}</script>
<a href="https://graph.baidu.com/s?wd=%E5%AE%9D%E9%A9%ACX5%202021%E6%AC%BE">link</a>
`;
const texts = extractTextsFromSearchHtml(html, 'https://graph.baidu.com/s?wd=%E5%AE%9D%E9%A9%ACX5%202021%E6%AC%BE');
const parsed = extractVehicleModel(texts.concat([
  '宝马X5 2021款 汽车外观',
  '宝马 X5 2021 白色 SUV',
  '奔驰C级 2020款',
]));
assert.ok(parsed, 'should parse bmw from multiple clues');
assert.ok(/宝马/.test(parsed.brandModel));
assert.ok(parsed.confidence >= 0.7, 'vote bonus should raise confidence');

assert.strictEqual(
  normalizeModelKey('宝马 X5 2021款', 2021),
  normalizeModelKey('宝马X5 2021', 2021)
);

const refined = normalizeBrandModelText('宝马 X5 2021', 2021);
assert.strictEqual(refined.brandModel, '宝马X5 2021款');

assert.ok(getSlotWeight({ category: 'exterior', slotKey: 'front' }) > getSlotWeight({ category: 'interior', slotKey: 'screen' }));

const photos = [
  { id: '1', category: 'interior', slotKey: 'screen', filePath: __filename },
  { id: '2', category: 'exterior', slotKey: 'front', filePath: __filename },
];
const exterior = filterExteriorPhotos(photos);
assert.strictEqual(exterior.length, 1);
assert.strictEqual(exterior[0].id, '2');

const noise = extractVehicleModel(['陈道明 演员 写真', '风景壁纸 高清']);
assert.strictEqual(noise, null, 'should reject non-vehicle noise');

assert.ok(getSourceWeight('baidu_car_api') > getSourceWeight('deepseek_text'));

const fused = aggregateRecognizeResults([
  { brandModel: '宝马X5 2021款', year: 2021, confidence: 0.7, source: 'baidu_image', photoId: 'p1' },
  { brandModel: '宝马 X5 2021', year: 2021, confidence: 0.62, source: 'deepseek_text', photoId: 'p2' },
]);
assert.strictEqual(fused.brandModel, '宝马X5 2021款');
assert.ok(fused.crossSource, 'baidu + deepseek should count as cross-source');
assert.ok(fused.confidence > 0.7, 'cross-source fusion should boost confidence');

assert.strictEqual(
  shouldVerifyWithVision([{ brandModel: '宝马X5', confidence: 0.8 }], { apiKey: 'k', provider: 'deepseek' }),
  false
);
assert.strictEqual(
  shouldVerifyWithVision([{ brandModel: '宝马X5', confidence: 0.6 }], { apiKey: 'k', provider: 'deepseek' }),
  true
);
assert.strictEqual(
  shouldVerifyWithVision([], { apiKey: 'k', provider: 'vision' }),
  true
);

const hints = collectRecognitionHints(
  [{ brandModel: '宝马X5 2021款', keywords: ['宝马X5实拍'] }],
  ['奔驰C级']
);
assert.ok(hints.includes('宝马X5 2021款'));
assert.ok(hints.includes('宝马X5实拍'));

console.log('✓ 识别准确率优化逻辑就绪');
