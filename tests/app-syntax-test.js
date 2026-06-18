/**
 * app.js 语法与关键符号完整性检查（防止模块加载失败导致按钮无响应）
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../public/js/app.js');
const src = fs.readFileSync(appPath, 'utf8');

assert.ok(src.includes("import { initPwa } from './pwa.js'"), 'missing initPwa import');
assert.ok(/const SLOT_CONFIG = \[\s*\{[\s\S]*key: 'exterior'/.test(src), 'missing SLOT_CONFIG declaration');
assert.ok(src.includes('function hdPosterMode()'), 'missing hdPosterMode');
assert.ok(src.includes("import { bindSettingsPages } from './settingsPages.js'"), 'missing settingsPages import');

const { execSync } = require('child_process');
try {
  execSync(`node --check "${appPath}"`, { stdio: 'pipe' });
} catch (err) {
  assert.fail(`app.js syntax error: ${err.stderr?.toString() || err.message}`);
}

console.log('✓ app.js 语法正常，SLOT_CONFIG / initPwa 就绪');
