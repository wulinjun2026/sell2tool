const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(appSrc.includes('posterPreviewBundle'), 'missing session poster preview bundle state');
assert.ok(appSrc.includes('clearPosterPreviewBundle'), 'missing clearPosterPreviewBundle');
assert.ok(appSrc.includes('resolvePreviewPosterCacheKey'), 'missing resolvePreviewPosterCacheKey');
assert.ok(appSrc.includes('ensurePosterReady'), 'missing ensurePosterReady');
assert.ok(appSrc.includes('HD_POSTER_RENDER'), 'missing HD poster render flag');
assert.ok(appSrc.includes('reused: true'), 'ensurePosterReady should mark session reuse');
assert.match(
  appSrc,
  /state\.posterPreviewBundle\?\.cacheKey === cacheKey/,
  'should reuse in-memory preview when cache key matches'
);
assert.match(
  appSrc,
  /previewMode: HD_POSTER_RENDER/,
  'template page should render 1242px HD posters'
);
assert.ok(!appSrc.includes('ensurePosterForShare'), 'share/save must not re-render via ensurePosterForShare');
assert.match(
  appSrc,
  /ensurePosterReady\(\{ showProgress: false \}\)/,
  'share/save should reuse ensurePosterReady without regen'
);
assert.ok(appSrc.includes('storePosterPreviewBundle'), 'generation should populate session bundle');
assert.ok(appSrc.includes('confirmPosterPublishedIfNeeded'), 'should register publish without re-render');

console.log('✓ 模板页直接生成 1242px 高清长图');
console.log('✓ 保存/分享复用当前长图，不再重新生成');
