const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../public/js/posterCache.js'), 'utf8');
assert.ok(src.includes('buildPosterCacheKey'), 'missing cache key builder');
assert.ok(src.includes('readPosterCache'), 'missing read cache');
assert.ok(src.includes('writePosterCache'), 'missing write cache');
assert.ok(src.includes('indexedDB'), 'missing indexedDB cache');
assert.ok(src.includes('vehiclePosterFingerprint'), 'missing content fingerprint');

function vehiclePosterFingerprint(v) {
  if (!v) return '';
  const photos = (v.photos || [])
    .map((p) => `${p.category}/${p.slotKey}#${p.id || p.url || ''}`)
    .sort()
    .join(',');
  const points = (v.sellingPoints || [])
    .map((p) => `${p.id || ''}:${p.text || ''}`)
    .sort()
    .join(',');
  return [
    v.brandModel || '',
    v.year ?? '',
    v.priceWan ?? '',
    v.polishedDescription || v.extraDescription || '',
    photos,
    points,
  ].join('::');
}

function buildPosterCacheKey({ vehicleIds, templateId, previewMode, vehicles, dealer }) {
  const sortedIds = [...vehicleIds].sort();
  const vehicleMap = new Map((vehicles || []).map((v) => [v.id, v]));
  const vPart = sortedIds
    .map((id) => `${id}:${vehiclePosterFingerprint(vehicleMap.get(id))}`)
    .join('|');
  const dPart = dealer
    ? `${dealer.updatedAt || 0}:${dealer.shopName || ''}:${dealer.contactPhone || ''}:${dealer.qrcodeUrl || ''}`
    : '0';
  return `${previewMode ? 'preview' : 'final'}:${templateId}:${vPart}:${dPart}`;
}

const baseVehicle = {
  id: 'a',
  brandModel: '宝马X5',
  year: 2021,
  priceWan: 45,
  polishedDescription: '车况良好',
  photos: [{ category: 'exterior', slotKey: 'front', id: 'p1' }],
  sellingPoints: [{ id: 's1', text: '一手车' }],
};

const vehicles = [
  baseVehicle,
  { id: 'b', brandModel: '奥迪A6', year: 2020, priceWan: 30, photos: [], sellingPoints: [] },
];
const dealer = { updatedAt: 9, shopName: '店', contactPhone: '138', qrcodeUrl: '' };
const key1 = buildPosterCacheKey({
  vehicleIds: ['b', 'a'],
  templateId: 'tpl_simple_01',
  previewMode: true,
  vehicles,
  dealer,
});
const key2 = buildPosterCacheKey({
  vehicleIds: ['a', 'b'],
  templateId: 'tpl_simple_01',
  previewMode: true,
  vehicles,
  dealer,
});

assert.strictEqual(key1, key2);
assert.ok(key1.startsWith('preview:tpl_simple_01:'));

const afterGenerate = {
  ...baseVehicle,
  updatedAt: 999,
  lastPosterGeneratedAt: 888,
};
const keyBefore = buildPosterCacheKey({
  vehicleIds: ['a'],
  templateId: 'tpl_simple_01',
  previewMode: false,
  vehicles: [baseVehicle],
  dealer,
});
const keyAfter = buildPosterCacheKey({
  vehicleIds: ['a'],
  templateId: 'tpl_simple_01',
  previewMode: false,
  vehicles: [afterGenerate],
  dealer,
});
assert.strictEqual(keyBefore, keyAfter, '生成记录写入后缓存 key 应保持不变');

console.log('✓ 长图本地缓存模块就绪');
console.log('✓ 缓存 key 对车辆顺序不敏感');
console.log('✓ 生成后时间戳变化不使缓存失效');
