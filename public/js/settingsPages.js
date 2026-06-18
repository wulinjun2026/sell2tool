import { api } from './api.js';
import { applyClientSettings, initClientSettings } from './clientSettings.js';

const FIELD_GROUPS = {
  system: {
    title: '系统与账号',
    hint: '试用配额、对外地址与上传限制；保存后立即对新注册用户与 API 校验生效。',
    fields: [
      { key: 'publicBaseUrl', label: '对外访问地址', type: 'url', placeholder: 'https://your-domain.com' },
      { key: 'trialDays', label: '免费试用天数', type: 'number', min: 1, max: 365 },
      { key: 'productLimit', label: '免费产品上限', type: 'number', min: 1, max: 10000 },
      { key: 'smsCooldownSec', label: '验证码重发间隔（秒）', type: 'number', min: 30, max: 300 },
      { key: 'photoMaxMb', label: '单张照片上限（MB）', type: 'number', min: 1, max: 20, step: 0.5 },
      { key: 'qrcodeMaxMb', label: '二维码上限（MB）', type: 'number', min: 1, max: 10, step: 0.5 },
      { key: 'authDevMode', label: '开发模式（接口返回 devCode）', type: 'checkbox' },
    ],
  },
  ai: {
    title: 'AI 与队列',
    hint: '大模型与排队参数；Key 留空或含 • 表示不修改原值。',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: '留空则不修改' },
      { key: 'apiUrl', label: 'API 地址', type: 'url' },
      { key: 'model', label: '模型名称', type: 'text' },
      { key: 'timeoutMs', label: '请求超时（毫秒）', type: 'number', min: 5000, max: 120000, step: 1000 },
      { key: 'queueConcurrency', label: '并发数', type: 'number', min: 1, max: 20 },
      { key: 'queueMax', label: '队列上限', type: 'number', min: 1, max: 200 },
      { key: 'queueWaitMs', label: '排队超时（毫秒）', type: 'number', min: 5000, max: 600000, step: 1000 },
      { key: 'sellingLlmStrict', label: 'LLM 失败时不降级本地模板', type: 'checkbox' },
    ],
  },
  client: {
    title: '性能与体验',
    hint: '上传压缩、长图嵌入与缓存；保存后本机与其他用户下次加载页面时生效。',
    fields: [
      { key: 'uploadMaxEdge', label: '上传压缩长边（px）', type: 'number', min: 800, max: 4096 },
      { key: 'uploadQuality', label: '上传 JPEG 质量', type: 'number', min: 0.5, max: 1, step: 0.01 },
      { key: 'skipJpegMaxMb', label: '跳过再压缩 JPEG 阈值（MB）', type: 'number', min: 0.5, max: 10, step: 0.5 },
      { key: 'embedConcurrency', label: '长图嵌入并发', type: 'number', min: 1, max: 12 },
      { key: 'embedCacheMax', label: '嵌入 LRU 缓存条数', type: 'number', min: 8, max: 200 },
      { key: 'posterCacheMax', label: '长图 IndexedDB 缓存', type: 'number', min: 4, max: 100 },
      { key: 'galleryMaxItems', label: '图库最多条数', type: 'number', min: 10, max: 500 },
      { key: 'previewDebounceMs', label: '预览防抖（毫秒）', type: 'number', min: 100, max: 2000 },
      { key: 'searchDebounceMs', label: '搜索防抖（毫秒）', type: 'number', min: 100, max: 2000 },
      { key: 'hdPosterRender', label: '正式长图 1242px 高清', type: 'checkbox' },
      { key: 'progressReportCap', label: '进度上报上限（%）', type: 'number', min: 50, max: 99 },
      { key: 'progressWaitMax', label: '等待动画上限（%）', type: 'number', min: 90, max: 99.9, step: 0.1 },
      { key: 'galleryDedupeWindowMin', label: '图库去重窗口（分钟）', type: 'number', min: 1, max: 120 },
    ],
  },
};

function readFieldValue(field, settings) {
  const raw = settings[field.key];
  if (field.type === 'checkbox') return !!raw;
  if (field.type === 'number') return raw ?? '';
  return raw ?? '';
}

function collectForm(category, root) {
  const group = FIELD_GROUPS[category];
  const settings = {};
  group.fields.forEach((field) => {
    const el = root.querySelector(`[data-setting-key="${field.key}"]`);
    if (!el) return;
    if (field.type === 'checkbox') {
      settings[field.key] = el.checked;
    } else if (field.type === 'number') {
      settings[field.key] = el.value === '' ? undefined : Number(el.value);
    } else {
      settings[field.key] = el.value.trim();
    }
  });
  return settings;
}

function renderField(field, settings) {
  const value = readFieldValue(field, settings);
  if (field.type === 'checkbox') {
    return `
      <label class="settings-check-row">
        <input type="checkbox" data-setting-key="${field.key}" ${value ? 'checked' : ''}>
        <span>${field.label}</span>
      </label>`;
  }
  const inputType = field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text';
  const attrs = [
    `data-setting-key="${field.key}"`,
    `type="${inputType}"`,
    `class="dealer-field"`,
    field.placeholder ? `placeholder="${field.placeholder}"` : '',
    field.min != null ? `min="${field.min}"` : '',
    field.max != null ? `max="${field.max}"` : '',
    field.step != null ? `step="${field.step}"` : '',
    value !== '' && value != null ? `value="${String(value).replace(/"/g, '&quot;')}"` : '',
  ].filter(Boolean).join(' ');
  return `
    <label class="field-label">${field.label}</label>
    <input ${attrs}>`;
}

export function renderSettingsForm(category, container, settings = {}) {
  const group = FIELD_GROUPS[category];
  if (!group || !container) return;
  container.innerHTML = `
    <p class="dealer-settings-hint">${group.hint}</p>
    <div class="settings-form-fields">
      ${group.fields.map((f) => renderField(f, settings)).join('')}
    </div>
    <p class="settings-updated hidden" id="settings-updated-${category}"></p>
    <button type="button" class="btn-block primary" data-save-settings="${category}">保存并生效</button>`;
}

export async function loadSettingsPage(category) {
  const container = document.querySelector(`#settings-form-${category}`);
  const meta = document.querySelector(`#settings-meta-${category}`);
  if (!container) return;
  try {
    const data = await api.getSettingsCategory(category);
    renderSettingsForm(category, container, data.settings || {});
    if (meta) {
      meta.textContent = data.updatedAt
        ? `最近更新：${new Date(data.updatedAt).toLocaleString()}`
        : '尚未保存过自定义配置';
    }
  } catch (e) {
    container.innerHTML = `<p class="settings-error">${e.message === 'SETTINGS_FORBIDDEN' ? '无权访问系统配置' : '加载失败'}</p>`;
  }
}

export async function saveSettingsPage(category, toast) {
  const root = document.querySelector(`#settings-form-${category}`);
  if (!root) return;
  const settings = collectForm(category, root);
  try {
    const data = await api.updateSettingsCategory(category, settings);
    renderSettingsForm(category, root, data.settings || {});
    const hint = document.querySelector(`#settings-meta-${category}`);
    if (hint) {
      hint.textContent = data.updatedAt
        ? `已保存 · ${new Date(data.updatedAt).toLocaleString()}`
        : '已保存';
    }
    if (category === 'client' || category === 'system') {
      await initClientSettings({ force: true });
      if (typeof window.syncClientRuntimeSettings === 'function') {
        window.syncClientRuntimeSettings();
      }
    }
    toast?.('配置已保存并生效');
  } catch (e) {
    toast?.(e.message === 'SETTINGS_FORBIDDEN' ? '无权修改配置' : '保存失败');
  }
}

export function bindSettingsPages({ goto, toast }) {
  document.querySelector('#settings-hub')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto-settings]');
    if (!btn) return;
    goto(btn.dataset.gotoSettings);
  });

  document.body.addEventListener('click', (e) => {
    const saveBtn = e.target.closest('[data-save-settings]');
    if (!saveBtn) return;
    saveSettingsPage(saveBtn.dataset.saveSettings, toast);
  });

  document.querySelectorAll('[data-settings-page]').forEach((page) => {
    const observer = new MutationObserver(() => {
      if (page.classList.contains('active')) {
        loadSettingsPage(page.dataset.settingsPage);
      }
    });
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  });
}

export { FIELD_GROUPS };
