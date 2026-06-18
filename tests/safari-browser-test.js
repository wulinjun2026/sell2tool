/**
 * Safari / iOS 浏览器适配测试
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const browserSrc = fs.readFileSync(path.join(__dirname, '../public/js/browser.js'), 'utf8');
const saveSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterSave.js'), 'utf8');
const pwaSrc = fs.readFileSync(path.join(__dirname, '../public/js/pwa.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(browserSrc.includes('isIOS'), 'missing isIOS');
assert.ok(browserSrc.includes('isSafariBrowser'), 'missing isSafariBrowser');
assert.ok(browserSrc.includes('supportsWebShareFiles'), 'missing supportsWebShareFiles');
assert.ok(saveSrc.includes("from './browser.js'"), 'posterSave must use browser helpers');
assert.ok(saveSrc.includes('execCommand'), 'clipboard fallback for Safari');
assert.ok(saveSrc.includes('iosSaveFallback'), 'missing iOS save fallback');
assert.ok(saveSrc.includes('-webkit-touch-callout') || saveSrc.includes('showImageSaveOverlay'), 'iOS long-press save UI');
assert.ok(saveSrc.includes('dataUrl.startsWith'), 'dataUrlToBlob must support Safari base64 path');
assert.ok(pwaSrc.includes('isIOS'), 'PWA must handle iOS install hint');
assert.ok(pwaSrc.includes('添加到主屏幕'), 'iOS add-to-home-screen hint');
assert.ok(cssSrc.includes('page-desc.screen.active') || cssSrc.includes('.screen.active#page-desc'), 'desc page flex scroll layout');
assert.ok(cssSrc.includes('page-settings-system'), 'settings pages full-height layout');
assert.ok(cssSrc.includes('upload-page-scroll'), 'upload page scroll shell');
assert.ok(cssSrc.includes('profile-scroll-body'), 'profile page scroll shell');
assert.ok(cssSrc.includes('--keyboard-offset'), 'iOS keyboard offset for tab bar');
assert.ok(!cssSrc.includes('max-height: 52vh'), 'users list must not use fragile vh cap');
assert.ok(cssSrc.includes('-webkit-overflow-scrolling: touch'), 'iOS momentum scroll');
assert.ok(htmlSrc.includes('id="desc-page-scroll"'), 'desc page scroll panel');
assert.ok(appSrc.includes('initSafariFormAdaptation'), 'Safari form adaptation');
assert.ok(!cssSrc.includes('.hidden-input { display: none; }'), 'file input must not use display:none on iOS');
assert.ok(cssSrc.includes('-webkit-touch-callout: default'), 'allow iOS long-press on poster image');

console.log('✓ Safari / iOS 浏览器适配模块齐全');
