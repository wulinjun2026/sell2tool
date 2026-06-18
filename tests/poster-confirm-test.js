const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');

assert.ok(serverSrc.includes("app.post('/api/posters/confirm'"), 'missing confirm poster endpoint');
assert.ok(serverSrc.includes('markPosterGenerated'), 'confirm should mark vehicles published');
assert.ok(apiSrc.includes('confirmPosterPublished'), 'missing client confirm API');

console.log('✓ 预览长图确认发布接口就绪');
