/**
 * 移动端配置：浏览器同源 / APK 远程服务器
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const configSrc = fs.readFileSync(path.join(__dirname, '../public/js/config.js'), 'utf8');

assert.ok(configSrc.includes('DEFAULT_SERVER_URL'), 'missing default server url');
assert.ok(configSrc.includes('getServerBase'), 'missing getServerBase');
assert.ok(fs.existsSync(path.join(__dirname, '../public/manifest.webmanifest')), 'missing manifest');
assert.ok(fs.existsSync(path.join(__dirname, '../public/sw.js')), 'missing service worker');
assert.ok(fs.existsSync(path.join(__dirname, '../capacitor.config.json')), 'missing capacitor config');

console.log('✓ 移动端配置文件齐全');
console.log('✓ config.js 支持可配置服务器地址');
