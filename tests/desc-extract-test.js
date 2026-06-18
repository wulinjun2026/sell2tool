const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { localExtractVehicleInfo, normalizePriceWan } = require('../server/services/descExtract');

const indexSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');

assert.ok(indexSrc.includes('/api/desc/extract'), 'extract API required');
assert.ok(appSrc.includes('extractDescInfo'), 'client extract API required');
assert.ok(appSrc.includes('scheduleDescExtract'), 'client should auto extract');
assert.ok(appSrc.includes('modelTouchedByUser'), 'model should be user-editable');
assert.ok(appSrc.includes('未公布'), 'unpublished price label required');
assert.ok(htmlSrc.indexOf('desc-input') < htmlSrc.indexOf('car-price-input'), 'description should be before price');
assert.ok(htmlSrc.indexOf('car-price-input') < htmlSrc.indexOf('car-model-input'), 'price should be before model');
assert.ok(apiSrc.includes('extractDescInfo'), 'api client missing extract');

const sample = '全款2.55万直接开走10年宝马X5，四驱豪华型，双电动座椅带加热记忆';
const local = localExtractVehicleInfo(sample);
assert.ok(local.brandModel.includes('宝马'), `brand expected, got ${local.brandModel}`);
assert.strictEqual(local.priceWan, 2.55);

const noPrice = localExtractVehicleInfo('10年宝马X5，原版原漆无事故，支持第三方检测');
assert.ok(noPrice.brandModel.includes('宝马'));
assert.strictEqual(noPrice.priceWan, null);

assert.strictEqual(normalizePriceWan('未公布'), null);
assert.strictEqual(normalizePriceWan(36.8), 36.8);

console.log('✓ 描述页字段顺序：描述 → 售价 → 产品名称');
console.log('✓ 大模型/本地识别产品名称与售价');
console.log('✓ 无售价时显示「未公布」');
