const assert = require('assert');
const fs = require('fs');
const path = require('path');

const recognizeSrc = fs.readFileSync(path.join(__dirname, '../server/services/vehicleRecognize.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(recognizeSrc.includes('pickPhotosForRecognition'), 'should pick multiple photos');
assert.ok(recognizeSrc.includes('aggregateRecognizeResults'), 'should aggregate multi-photo results');
assert.ok(recognizeSrc.includes('recognizeSelectedPhotos'), 'should recognize selected photos');
assert.ok(serverSrc.includes('matchedPhotoCount'), 'api should return matched photo count');
assert.ok(appSrc.includes('matchedPhotoCount'), 'client should display multi-photo confidence');

const {
  normalizeModelKey,
  aggregateRecognizeResults,
} = require('../server/services/recognizeAggregate');
const {
  pickPhotosForRecognition,
  getRecognizeMaxPhotos,
} = require('../server/services/vehicleRecognize');

assert.strictEqual(
  normalizeModelKey('宝马X5 2021款', 2021),
  normalizeModelKey('宝马 X5 2021', 2021),
  'similar models should normalize to same key'
);

const single = aggregateRecognizeResults([
  { brandModel: '宝马X5 2021款', year: 2021, confidence: 0.72, source: 'baidu_image', photoId: 'p1' },
]);
assert.strictEqual(single.matchedPhotoCount, 1);
assert.strictEqual(single.confidenceBoost, 0);
assert.ok(single.confidence >= 0.72);

const multi = aggregateRecognizeResults([
  { brandModel: '宝马X5 2021款', year: 2021, confidence: 0.68, source: 'baidu_image', photoId: 'p1' },
  { brandModel: '宝马 X5 2021', year: 2021, confidence: 0.74, source: 'baidu_image', photoId: 'p2' },
  { brandModel: '宝马X5', year: 2021, confidence: 0.7, source: 'baidu_image', photoId: 'p3' },
  { brandModel: '奔驰C级 2020款', year: 2020, confidence: 0.8, source: 'baidu_image', photoId: 'p4' },
]);
assert.strictEqual(multi.brandModel, '宝马 X5 2021');
assert.strictEqual(multi.matchedPhotoCount, 3);
assert.strictEqual(multi.photoCount, 4);
assert.ok(multi.confidence > 0.74, 'consensus should boost confidence above best single vote');
assert.ok(multi.confidenceBoost > 0, 'should report confidence boost');

const photos = [
  { id: '1', category: 'exterior', slotKey: 'front', filePath: __filename },
  { id: '2', category: 'exterior', slotKey: 'left45', filePath: __filename },
  { id: '3', category: 'exterior', slotKey: 'rear', filePath: __filename },
  { id: '4', category: 'interior', slotKey: 'screen', filePath: __filename },
  { id: '5', category: 'exterior', slotKey: 'right', filePath: __filename },
];
const picked = pickPhotosForRecognition(photos, 4);
assert.strictEqual(picked.length, 4);
assert.strictEqual(picked[0].slotKey, 'front');
assert.ok(getRecognizeMaxPhotos() >= 1);

console.log('✓ 多图联合识别与置信度聚合逻辑就绪');
