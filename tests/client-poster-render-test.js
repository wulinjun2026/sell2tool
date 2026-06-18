/**
 * 客户端长图渲染：服务器不生成 PNG
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const renderSrc = fs.readFileSync(path.join(__dirname, '../server/services/posterRender.js'), 'utf8');
const clientSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterRenderClient.js'), 'utf8');
const embedSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterImageEmbedClient.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterExportClient.js'), 'utf8');
const compressSrc = fs.readFileSync(path.join(__dirname, '../public/js/photoCompressClient.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');

assert.ok(indexSrc.includes('/api/posters/compose'), 'compose API required');
assert.ok(indexSrc.includes('SERVER_RENDER_DISABLED'), 'legacy render must be disabled');
assert.ok(!indexSrc.includes('spawnPosterRender'), 'server must not spawn poster worker');
assert.ok(renderSrc.includes('buildPosterCompose'), 'server compose builder required');
assert.ok(renderSrc.includes('preparePosterUrlEmbeds'), 'server must only embed URLs');
assert.ok(clientSrc.includes('renderPosterOnClient'), 'client render entry required');
assert.ok(clientSrc.includes('composePoster'), 'client must call compose API');
assert.ok(embedSrc.includes('embedImagesInSvg'), 'client embed required');
assert.ok(embedSrc.includes('mapWithConcurrency'), 'parallel embed required');
assert.ok(exportSrc.includes('svgToPngBlob'), 'client PNG export required');
assert.ok(compressSrc.includes('compressPhotoForUpload'), 'client photo compress required');
assert.ok(appSrc.includes('renderPosterOnClient'), 'app must use client render');
assert.ok(appSrc.includes('compressPhotoForUpload'), 'app must compress uploads');
assert.ok(apiSrc.includes('composePoster'), 'api client must expose compose');
assert.ok(!apiSrc.includes('/api/posters/render'), 'api must not call server render');

console.log('✓ 长图 PNG 生成已迁移至移动端');
console.log('✓ 服务器仅返回 SVG 结构与图片 URL');
console.log('✓ 照片上传前在本地压缩');

(async () => {
  const { initDb } = require('../server/db');
  const vehicleRepo = require('../server/services/vehicleRepository');
  const { buildPosterCompose } = require('../server/services/posterRender');

  const db = await initDb();
  const vehicle = await vehicleRepo.createDraft(db);
  const dealer = await db.get('SELECT * FROM dealer_profile LIMIT 1');
  await vehicleRepo.saveVehicle(db, {
    ...(await vehicleRepo.findById(db, vehicle.id)),
    brandModel: '客户端渲染测试',
  });
  const fullVehicle = await vehicleRepo.findById(db, vehicle.id);

  const composed = await buildPosterCompose({
    vehicles: [fullVehicle],
    templateId: 'tpl_simple_01',
    dealer,
    previewMode: false,
  });

  assert.ok(composed.svgDoc.includes('<svg'), 'compose must return svg');
  assert.ok(!composed.imageBase64, 'compose must not return png');
  assert.ok(composed.exportWidth === 1242, `export width ${composed.exportWidth}`);
  assert.ok(composed.embed?.maxEdge >= 1920, 'embed spec required');
  assert.match(composed.svgDoc, /\/uploads\/|xlink:href="/, 'svg should reference upload urls not server processing');

  await vehicleRepo.deleteVehicle(db, vehicle.id);
  console.log('✓ buildPosterCompose 仅返回 SVG + URL 引用');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
