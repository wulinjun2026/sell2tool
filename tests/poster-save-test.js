/**
 * 长图保存与分享工具测试
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const saveSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterSave.js'), 'utf8');
const progressSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterProgress.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(saveSrc.includes('buildPosterFilename'), 'missing buildPosterFilename');
assert.ok(saveSrc.includes('产品长图_'), 'must use Chinese filename prefix');
assert.ok(saveSrc.includes('sharePosterImage'), 'missing sharePosterImage');
assert.ok(saveSrc.includes('shareViaWebShare'), 'missing web share');
assert.ok(saveSrc.includes('files: [file]'), 'must share image files');
assert.ok(!saveSrc.includes("title: '产品长图'"), 'must not pass title to avoid link share');
assert.ok(saveSrc.includes('showImageSaveOverlay'), 'missing browser fallback UI');
assert.ok(saveSrc.includes('shareViaCapacitor'), 'missing native capacitor share');
assert.ok(saveSrc.includes('saveViaDownload'), 'missing download fallback');
assert.ok(saveSrc.includes('shareResultMessage'), 'missing share result message');
assert.ok(progressSrc.includes('showPosterProgress'), 'missing progress UI');
assert.ok(progressSrc.includes('poster-progress-check'), 'missing completion animation');
assert.ok(appSrc.includes('ensurePosterReady'), 'share/save must reuse ensurePosterReady');
assert.ok(!appSrc.includes('ensurePosterForShare'), 'must not re-render on share via ensurePosterForShare');
assert.ok(!appSrc.includes("toast('✅ 分享成功！')"), 'must not claim success before image share');

console.log('✓ 长图保存与分享模块存在');
console.log('✓ 分享流程优先发送 PNG 文件，禁止网页链接');
console.log('✓ 长图生成进度动画模块存在');
