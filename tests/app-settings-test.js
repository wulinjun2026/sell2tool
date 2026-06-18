/**
 * 应用配置读写与权限测试
 */
const assert = require('assert');
const fs = require('fs');

const appSettings = require('../server/services/appSettings');
const SETTINGS_PATH = appSettings.SETTINGS_PATH;

let backup = null;
if (fs.existsSync(SETTINGS_PATH)) {
  backup = fs.readFileSync(SETTINGS_PATH, 'utf8');
}

function restoreSettingsFile() {
  if (backup) fs.writeFileSync(SETTINGS_PATH, backup, 'utf8');
  else if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
  appSettings.loadSettings();
}

(async () => {
  try {
    if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
    appSettings.loadSettings();

    const defaults = appSettings.getSettings();
    assert.strictEqual(defaults.system.trialDays, 20);
    assert.strictEqual(defaults.system.productLimit, 40);
    assert.strictEqual(defaults.client.uploadMaxEdge, 2400);

    const updated = appSettings.updateCategory('system', {
      trialDays: 15,
      productLimit: 30,
      smsCooldownSec: 90,
    });
    assert.strictEqual(updated.trialDays, 15);
    assert.strictEqual(updated.productLimit, 30);
    assert.strictEqual(updated.smsCooldownSec, 90);

    appSettings.loadSettings();
    const reloaded = appSettings.getSystem();
    assert.strictEqual(reloaded.trialDays, 15, 'settings should persist to file');
    assert.strictEqual(reloaded.productLimit, 30);

    const ai = appSettings.updateCategory('ai', {
      queueConcurrency: 5,
      queueMax: 50,
      apiKey: 'sk-test-key-12345',
    });
    assert.strictEqual(ai.queueConcurrency, 5);
    assert.ok(ai.apiKey.includes('•'), 'api key should be masked for admin view');
    assert.strictEqual(ai.hasApiKey, true);

    const keepKey = appSettings.updateCategory('ai', { model: 'deepseek-v2', apiKey: '••••2345' });
    assert.strictEqual(keepKey.model, 'deepseek-v2');
    const effective = appSettings.getEffectiveAi();
    assert.strictEqual(effective.apiKey, 'sk-test-key-12345', 'masked update should keep previous key');

    const client = appSettings.updateCategory('client', {
      uploadMaxEdge: 1920,
      previewDebounceMs: 500,
      hdPosterRender: true,
    });
    assert.strictEqual(client.uploadMaxEdge, 1920);
    assert.strictEqual(client.previewDebounceMs, 500);
    assert.strictEqual(client.hdPosterRender, true);

    assert.strictEqual(appSettings.canManageSettings(null), false);
    assert.strictEqual(appSettings.canManageSettings({ phone: '13800138000', plan: 'free' }), false);
    assert.strictEqual(appSettings.canManageSettings({ phone: '13800138000', plan: 'paid' }), false);
    assert.strictEqual(appSettings.canManageSettings({ phone: '13523515442', plan: 'free' }), true);

    const prevAdmins = process.env.ADMIN_PHONES;
    process.env.ADMIN_PHONES = '13800138000,13900139000';
    assert.strictEqual(appSettings.canManageSettings({ phone: '13800138000', plan: 'free' }), true);
    assert.strictEqual(appSettings.canManageSettings({ phone: '13523515442', plan: 'free' }), false);
    assert.strictEqual(appSettings.canManageSettings({ phone: '13700137000', plan: 'paid' }), false);
    process.env.ADMIN_PHONES = prevAdmins;

    assert.throws(() => appSettings.sanitizeCategory('bad', {}), /INVALID_SETTINGS_CATEGORY/);

    const clamped = appSettings.sanitizeCategory('system', { trialDays: 9999, productLimit: 0 });
    assert.strictEqual(clamped.trialDays, 365);
    assert.strictEqual(clamped.productLimit, 1);

    console.log('✓ 应用配置读写、掩码与管理员权限逻辑就绪');
  } finally {
    restoreSettingsFile();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
