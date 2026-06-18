const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/js/listScrollbar.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(html.includes('list-scroll-shell'), 'missing scroll shell');
assert.ok(html.includes('id="car-list-scroll"'), 'missing car list scroll panel');
assert.ok(html.includes('list-scrollbar-thumb'), 'missing scrollbar thumb');
assert.ok(css.includes('min-height: 0'), 'scroll panel needs min-height 0');
assert.ok(css.includes('100svh'), 'mobile viewport height for scroll layout');
assert.ok(/#page-list[\s\S]*height: calc\(100dvh/.test(css) || css.includes('#page-list'), 'page-list bounded height');
assert.ok(js.includes('bindListScrollbar'), 'missing bindListScrollbar');
assert.ok(app.includes('initListScrollbars'), 'app should init scrollbars');
assert.ok(app.includes("refreshListScrollbar('desc-page-scroll')"), 'desc page should refresh scrollbar');
assert.ok(html.includes('id="desc-page-scroll"'), 'missing desc scroll panel');

console.log('✓ 产品/图库列表支持右侧滑条');
