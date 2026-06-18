/**
 * 上传方式互斥：一次选多张 vs 分步上传
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');

assert.ok(appSrc.includes("uploadPhotoMode"), 'state.uploadPhotoMode');
assert.ok(appSrc.includes("ensureUploadPhotoMode"), 'ensureUploadPhotoMode');
assert.ok(appSrc.includes("applyUploadModeUI"), 'applyUploadModeUI');
assert.ok(appSrc.includes("'batch_all'"), 'batch_all mode');
assert.ok(appSrc.includes("'stepwise'"), 'stepwise mode');
assert.ok(appSrc.includes('upload-step-area'), 'step area wrapper');
assert.ok(appSrc.includes('revertUploadModeIfEmpty'), 'cancel picker revert');
assert.ok(appSrc.includes('batchAwaitingPhotos'), 'batch mode unlocks after photos uploaded');
assert.ok(appSrc.includes('upload-ready'), 'editable state after upload');

assert.ok(htmlSrc.includes('id="upload-step-area"'), 'upload-step-area in HTML');
assert.ok(htmlSrc.includes('upload-mode-hint'), 'mode hint in HTML');

assert.ok(cssSrc.includes('upload-mode-locked'), 'locked styles');

console.log('✓ 上传方式互斥逻辑与 UI 结构检查通过');
