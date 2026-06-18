const assert = require('assert');
const fs = require('fs');
const path = require('path');

const progressSrc = fs.readFileSync(path.join(__dirname, '../public/js/photoUploadProgress.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');

assert.ok(progressSrc.includes('createSlotUploadProgress'), 'slot progress');
assert.ok(progressSrc.includes('showGlobalUploadProgress'), 'global progress');
assert.ok(apiSrc.includes('xhr.upload.onprogress'), 'XHR upload progress');
assert.ok(appSrc.includes('photoUploadProgress'), 'app imports progress');
assert.ok(appSrc.includes('onProgress'), 'app uses onProgress');
assert.ok(cssSrc.includes('photo-upload-progress'), 'progress styles');
assert.ok(indexSrc.includes('renderPosterToBuffer'), 'inline preview render');

console.log('✓ 图片上传进度与预览内联渲染检查通过');
