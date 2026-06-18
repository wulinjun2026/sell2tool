import { api, ApiError } from './api.js';
import { getToken, setToken, clearToken, maskPhone as maskAuthPhone } from './auth.js';
import {
  DEFAULT_SERVER_URL,
  assetUrl,
  getConfiguredServerUrl,
  getServerBase,
  isNativeApp,
  setServerBase,
} from './config.js';
import { renderPosterOnClient } from './posterRenderClient.js';
import { compressPhotoForUpload, compressPhotosForUpload, compressQrcodeForUpload } from './photoCompressClient.js';
import { showPosterProgress } from './posterProgress.js';
import { createSlotUploadProgress, showGlobalUploadProgress } from './photoUploadProgress.js';
import { savePosterToAlbum, saveResultMessage, sharePosterImage, shareResultMessage } from './posterSave.js';
import {
  buildPosterCacheContext,
  buildPosterCacheKey,
  cacheResultToPayload,
  invalidatePosterCacheForVehicleIds,
  readPosterCache,
  writePosterCache,
} from './posterCache.js';
import {
  deleteGalleryItem,
  getGalleryDisplayUrl,
  getGalleryItem,
  listGalleryItems,
  saveMultiPosterToGallery,
} from './galleryStore.js';
import { initPwa } from './pwa.js';
import { isIOS, isSafariBrowser } from './browser.js';
import { bindListScrollbar, refreshListScrollbar } from './listScrollbar.js';
import { initClientSettings, getClientSetting, getSystemHint } from './clientSettings.js';
import { bindSettingsPages } from './settingsPages.js';
import { bindUsersAdminPage } from './usersAdminPage.js';
import { clearPosterEmbedCache } from './posterImageEmbedClient.js';
// 本地处理模块（客户端优先，减少服务器负载）
import { extractVehicleInfoLocal } from './descExtractClient.js';
import { generateSellingPointsLocal } from './copyPolishClient.js';
import { recommendLocal, generateFromTextLocal } from './sellingEngineClient.js';
import { offlineCache } from './offlineCache.js';

function hdPosterMode() {
  return !!getClientSetting('hdPosterRender');
}

const SLOT_CONFIG = [
  {
    key: 'exterior',
    label: '外观',
    sub: 'Exterior · 拍摄产品外观各角度',
    slots: [
      { key: 'front', label: '前' },
      { key: 'rear', label: '后' },
      { key: 'left45', label: '45度左' },
      { key: 'left', label: '左' },
      { key: 'right45', label: '45度右' },
      { key: 'right', label: '右' },
    ],
  },
  {
    key: 'interior',
    label: '细节',
    sub: 'Details · 拍摄产品细节特写',
    slots: [
      { key: 'center_console', label: '正面' },
      { key: 'screen', label: '特写' },
      { key: 'driver_seat', label: '关键细节' },
    ],
  },
  {
    key: 'seats',
    label: '补充',
    sub: 'Extra · 拍摄场景、包装与其他角度',
    slots: [
      { key: 'front_seats', label: '使用场景' },
      { key: 'rear_seats', label: '规格参数' },
      { key: 'trunk', label: '包装附件' },
      { key: 'frunk', label: '其他角度' },
    ],
  },
];

const TAB_PAGE_IDS = ['page-list', 'page-upload', 'page-gallery', 'page-profile'];
const FLOW_PAGES = ['page-desc', 'page-template'];

const TEMPLATE_STYLES = {
  tpl_simple_01: { bg: '#FFFFFF', color: '#1A1A1A', border: '1px solid #E5E5E5' },
  tpl_business_01: { bg: 'linear-gradient(135deg,#0052D9,#6AA1FF)', color: '#fff' },
  tpl_sport_01: { bg: 'linear-gradient(135deg,#FF8F1F,#FFC069)', color: '#fff' },
};

// 图片布局方式
const PHOTO_LAYOUTS = [
  { id: 'grid_2', name: '双列网格', cols: 2, icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="24" y="4" width="16" height="16" rx="2"/><rect x="4" y="24" width="16" height="16" rx="2"/><rect x="24" y="24" width="16" height="16" rx="2"/>' },
  { id: 'grid_3', name: '三列紧凑', cols: 3, icon: '<rect x="2" y="4" width="10" height="16" rx="1"/><rect x="15" y="4" width="10" height="16" rx="1"/><rect x="28" y="4" width="10" height="16" rx="1"/><rect x="2" y="24" width="10" height="12" rx="1"/><rect x="15" y="24" width="10" height="12" rx="1"/><rect x="28" y="24" width="10" height="12" rx="1"/>' },
  { id: 'single', name: '单列大图', cols: 1, icon: '<rect x="4" y="4" width="32" height="12" rx="2"/><rect x="4" y="20" width="32" height="12" rx="2"/><rect x="4" y="36" width="32" height="8" rx="2"/>' },
  { id: 'wide', name: '横幅展示', cols: 2, wide: true, icon: '<rect x="2" y="8" width="36" height="8" rx="2"/><rect x="2" y="20" width="36" height="8" rx="2"/><rect x="2" y="32" width="36" height="8" rx="2"/>' },
];

const state = {
  vehicles: [],
  counts: { draft: 0, on_sale: 0, sold: 0 },
  selectedIds: new Set(),
  currentVehicleId: null,
  currentStep: 0,
  currentFilter: 'all',
  templates: [],
  selectedTemplateId: 'tpl_simple_01',
  selectedPhotoLayout: 'grid_2',
  posterDataUrl: null,
  posterGenerationId: null,
  posterUrl: null,
  multiMode: false,
  shareVehicleIds: [],
  shareReuse: false,
  sellingPoints: [],
  selectedPointIds: new Set(),
  polishVersion: 0,
  originalText: '',
  polishedText: '',
  editingSellingPoints: [],
  descBody: '',
  /** null | 'batch_all' | 'stepwise' — 一次选多张 与 分步上传 互斥 */
  uploadPhotoMode: null,
  /** 模板页已生成的长图预览会话缓存，保存/分享直接复用 */
  posterPreviewBundle: null,
  dealer: null,
  user: null,
  usage: null,
  canManageSettings: false,
  sendCodeCooldown: 0,
  sendCodeTimer: null,
  modelTouchedByUser: false,
  descExtractSeq: 0,
  descExtractTimer: null,
};

let vehicleLoadSeq = 0;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Toast 消息队列（防止快速操作时消息覆盖）
const toastQueue = [];
let toastTimer = null;
let isToastShowing = false;
const MAX_TOAST_QUEUE = 10;

function toast(msg, { duration = 1800, deduplicate = true } = {}) {
  if (deduplicate) {
    if (toastQueue.some((item) => item.msg === msg)) return;
    if (isToastShowing && $('#toast')?.textContent === msg) return;
  }

  if (toastQueue.length >= MAX_TOAST_QUEUE) {
    toastQueue.shift();
  }

  toastQueue.push({ msg, duration });

  if (!isToastShowing) showNextToast();
}

function showNextToast() {
  if (toastQueue.length === 0) {
    isToastShowing = false;
    return;
  }

  isToastShowing = true;
  const { msg, duration } = toastQueue.shift();
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.display = 'none';
    isToastShowing = false;
    setTimeout(showNextToast, 100);
  }, duration);
}

function syncTabHighlight(pageId) {
  const tabId = FLOW_PAGES.includes(pageId) ? 'page-upload' : pageId;
  if (!TAB_PAGE_IDS.includes(tabId)) return;
  $$('.tab-item').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
}

function statusLabel(status) {
  return { on_sale: ['sale', '🟢 在售'], sold: ['sold', '🔴 已售'], draft: ['draft', '⚪ 草稿'] }[status] || ['draft', '⚪ 草稿'];
}

function mapStatusFilter(chip) {
  const fromAttr = chip?.dataset?.filter;
  if (fromAttr) return fromAttr;
  const chipText = chip?.textContent || '';
  if (chipText.includes('在售')) return 'on_sale';
  if (chipText.includes('已售')) return 'sold';
  if (chipText.includes('草稿')) return 'draft';
  return 'all';
}

function syncFilterChipsUI() {
  $$('.filter-chip').forEach((chip) => {
    chip.classList.toggle('active', mapStatusFilter(chip) === state.currentFilter);
  });
}

function closeAllOverlays() {
  hideShare();
  hidePosterPreview();
  closeDialog();
}

const TAB_ICON_SVGS = {
  'page-list': {
    outline: '<path d="M5 17h14M5 17l-1.2-4.8a2 2 0 012-1.7h12.4a2 2 0 012 1.7L19 17" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.5" cy="17" r="1.25" stroke="currentColor" stroke-width="1.75"/><circle cx="16.5" cy="17" r="1.25" stroke="currentColor" stroke-width="1.75"/>',
    solid: '<path fill="currentColor" d="M5 16.2l1.3-5.1A2.3 2.3 0 018.6 9.5h6.8a2.3 2.3 0 012.3 1.6L19 16.2H5zm2.4 1.3a1.3 1.3 0 110-2.6 1.3 1.3 0 010 2.6zm9 0a1.3 1.3 0 110-2.6 1.3 1.3 0 010 2.6z"/>',
  },
  'page-upload': {
    outline: '<path d="M9 7h1.7L12 5h4l1.3 2H20a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0120 17H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 7h5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.75" stroke="currentColor" stroke-width="1.75"/>',
    solid: '<path fill="currentColor" d="M9 6.5h1.8L12.8 4h2.4l2 2.5H20a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 012-2h5zM12 10a3 3 0 100 6 3 3 0 000-6z"/>',
  },
  'page-gallery': {
    outline: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.75"/><circle cx="8.5" cy="10" r="1.5" stroke="currentColor" stroke-width="1.75"/><path d="M3 16l5-4 4 3 4-3 5 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    solid: '<path fill="currentColor" d="M19 5H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2zm-9.5 3a2 2 0 110 4 2 2 0 010-4zm-4.1 9.5l4.6-3.7 3.4 2.5 3.8-3.1L18.9 17H5.4z"/>',
  },
  'page-profile': {
    outline: '<circle cx="12" cy="8" r="3.25" stroke="currentColor" stroke-width="1.75"/><path d="M5 19.5c1.2-3 3.8-4.5 7-4.5s5.8 1.5 7 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
    solid: '<path fill="currentColor" d="M12 12a4 4 0 100-8 4 4 0 000 8zm-6.5 8a6.5 6.5 0 0113 0H5.5z"/>',
  },
};

function hydrateTabIcons() {
  $$('.tab-item').forEach((item) => {
    const box = item.querySelector('.icon');
    if (!box || box.dataset.hydrated) return;
    const def = TAB_ICON_SVGS[item.dataset.tab];
    if (!def) return;
    box.innerHTML = `
      <svg class="tab-icon tab-icon--outline" viewBox="0 0 24 24" fill="none" aria-hidden="true">${def.outline}</svg>
      <svg class="tab-icon tab-icon--solid" viewBox="0 0 24 24" aria-hidden="true">${def.solid}</svg>
    `;
    box.dataset.hydrated = '1';
  });
}

function hasPublishedPoster(vehicle) {
  return !!(vehicle?.hasPoster || vehicle?.lastPosterGeneratedAt);
}

function posterDataUrl(result) {
  if (!result) return '';
  if (typeof result === 'string') {
    if (result.startsWith('data:')) return result;
    return `data:image/png;base64,${result}`;
  }
  if (result.imageBase64) return `data:image/png;base64,${result.imageBase64}`;
  return result.url ? assetUrl(result.url) : '';
}

function applyPosterResult(result, { displayUrl } = {}) {
  state.posterDataUrl = displayUrl || posterDataUrl(result);
  state.posterGenerationId = result.generationId || null;
  state.posterUrl = state.posterDataUrl;
}

async function resolvePosterRender({
  vehicleIds,
  templateId,
  photoLayout,
  previewMode,
  signal,
  skipCache = false,
  showProgress = true,
}) {
  const ctx = await buildPosterCacheContext(vehicleIds, api, state);
  const cacheKey = buildPosterCacheKey({
    vehicleIds,
    templateId,
    photoLayout,
    previewMode,
    vehicles: ctx.vehicles,
    dealer: ctx.dealer,
  });

  if (!skipCache) {
    const cached = await readPosterCache(cacheKey);
    if (cached) {
      return { result: cacheResultToPayload(cached), cached, cacheKey };
    }
  }

  let result;
  if (showProgress) {
    result = await renderPosterWithProgress({
      vehicleIds,
      templateId,
      photoLayout,
      previewMode,
      signal,
    });
  } else {
    await persistDealerIfNeeded({ silent: true });
    result = await renderPosterOnClient({ vehicleIds, templateId, photoLayout, previewMode, signal });
  }

  await writePosterCache(cacheKey, result);
  return { result, cached: null, cacheKey };
}

/** 仅展示已生成长图的车辆（录入中草稿不展示）；已售车辆始终保留 */
function getVisibleVehicles(vehicles = state.vehicles) {
  return vehicles.filter((v) => hasPublishedPoster(v) || v.status === 'sold');
}

function pruneHiddenSelections() {
  const visibleIds = new Set(getVisibleVehicles().map((v) => v.id));
  [...state.selectedIds].forEach((id) => {
    if (!visibleIds.has(id)) state.selectedIds.delete(id);
  });
}

async function setVehicleFilter(filter) {
  state.currentFilter = filter || 'all';
  syncFilterChipsUI();
  await refreshAll();
}

async function loadVehicles() {
  if (!state.user) {
    state.vehicles = [];
    state.counts = { draft: 0, on_sale: 0, sold: 0 };
    renderCarList();
    updateSummary();
    return false;
  }
  const seq = ++vehicleLoadSeq;
  const params = {};
  if (state.currentFilter !== 'all') params.status = state.currentFilter;
  const keyword = $('#search-input')?.value?.trim();
  if (keyword) params.keyword = keyword;
  const data = await api.listVehicles(params);
  if (seq !== vehicleLoadSeq) return false;
  state.vehicles = data.vehicles;
  state.counts = data.counts;
  return true;
}

async function refreshAll() {
  const applied = await loadVehicles();
  if (!applied) return;
  pruneHiddenSelections();
  renderCarList();
  await renderGallery();
  await updateProfile();
  updateSummary();
  updateSelectAllButton();
}

async function maybeSaveMultiPosterToGallery(vehicleIds, templateId, result, displayUrl) {
  if (!vehicleIds || vehicleIds.length <= 1) return null;
  const imageBase64 = result?.imageBase64
    || (displayUrl?.startsWith('data:image') ? displayUrl.split(',')[1] : null);
  if (!imageBase64) return null;
  const item = await saveMultiPosterToGallery({
    vehicleIds,
    templateId,
    imageBase64,
    generationId: result?.generationId || null,
    previewMode: !!result?.previewMode,
  });
  if (item?.name && !item.updatedAt) {
    toast(`已存入图库：${item.name}`);
  }
  return item;
}

function updateSelectAllButton() {
  const btn = $('#btn-select-all');
  if (!btn) return;
  const selectable = getVisibleVehicles().filter((c) => c.status !== 'sold');
  const allSelected = selectable.length > 0 && selectable.every((c) => state.selectedIds.has(c.id));
  btn.textContent = allSelected ? '取消全选' : '全选';
}

function toggleSelectAll() {
  const selectable = getVisibleVehicles().filter((c) => c.status !== 'sold');
  if (!selectable.length) {
    toast('当前列表没有可选产品');
    return;
  }
  const allSelected = selectable.every((c) => state.selectedIds.has(c.id));
  if (allSelected) {
    selectable.forEach((c) => state.selectedIds.delete(c.id));
  } else {
    selectable.forEach((c) => state.selectedIds.add(c.id));
  }
  renderCarList();
  updateSelectAllButton();
}

function updateSummary() {
  const visible = getVisibleVehicles();
  $('#total-count').textContent = visible.length;
  $('#sale-count').textContent = visible.filter((v) => v.status === 'on_sale').length;
  $('#sold-count').textContent = visible.filter((v) => v.status === 'sold').length;
}

function renderCarList() {
  const container = $('#car-list');
  const list = getVisibleVehicles();

  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><span class="icon">📦</span><h3>暂无产品</h3><p>点击右上角「+ 录入」添加产品</p></div>';
    updateBatchButtons();
    updateSelectAllButton();
    refreshListScrollbar('car-list-scroll');
    return;
  }

  container.innerHTML = list.map((c) => {
    const [cls, label] = statusLabel(c.status);
    const checked = state.selectedIds.has(c.id) ? 'checked' : '';
    const disabled = c.status === 'sold' ? 'style="opacity:0.55"' : '';
    const hasPoster = hasPublishedPoster(c);
    return `<div class="card" ${disabled}>
      <div style="display:flex;gap:10px;">
        <div class="checkbox ${checked}" data-id="${c.id}"></div>
        <div class="card-img">${c.photos?.[0]?.url ? `<img src="${c.photos[0].url}" alt="">` : '📦'}</div>
        <div class="card-info">
          <h3>${c.brandModel || '未填写产品名'}</h3>
          <div class="code">${formatVehicleCode(c.code)}</div>
          <div class="meta">${c.photoCount || 0} 张照片 ${hasPoster ? '· ✅ 长图已生成' : ''}</div>
          <div class="price">${c.priceWan || '--'} 万元</div>
          <div style="margin-top:4px;"><span class="tag ${cls}">${label}</span></div>
        </div>
      </div>
      <div class="card-actions">
        ${hasPoster && c.status !== 'sold' ? `<button class="btn-sm primary" data-action="share" data-id="${c.id}">📤 分享</button>` : ''}
        ${c.status !== 'sold' ? `<button class="btn-sm" data-action="edit" data-id="${c.id}">✏️ 编辑</button>` : ''}
        ${c.status === 'sold'
    ? `<button class="btn-sm primary" data-action="onsale" data-id="${c.id}">🟢 标注在售</button><button class="btn-sm danger" data-action="delete" data-id="${c.id}">🗑️ 删除</button>`
    : `<button class="btn-sm" data-action="sold" data-id="${c.id}">🔴 已售</button>`}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.checkbox').forEach((el) => {
    el.onclick = () => toggleSelect(el.dataset.id);
  });
  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.onclick = () => handleCardAction(btn.dataset.action, btn.dataset.id);
  });
  updateBatchButtons();
  updateSelectAllButton();
  refreshListScrollbar('car-list-scroll');
}

function renderGalleryCardActions(id, type, status) {
  const sold = status === 'sold';
  const deleteRecordBtn = `<button class="btn-sm danger" data-action="delete-record" data-id="${id}" data-gallery-type="${type}">🗑️ 删除记录</button>`;
  if (type === 'multi') {
    return `
    <button class="btn-sm" data-action="preview" data-id="${id}" data-gallery-type="${type}">👁 预览长图</button>
    <button class="btn-sm primary" data-action="share" data-id="${id}" data-gallery-type="${type}">📤 直接分享</button>
    ${deleteRecordBtn}`;
  }
  return `
    <button class="btn-sm" data-action="preview" data-id="${id}" data-gallery-type="${type}">👁 预览长图</button>
    ${!sold ? `<button class="btn-sm primary" data-action="share" data-id="${id}" data-gallery-type="${type}">📤 直接分享</button>` : ''}
    ${deleteRecordBtn}
    ${sold
    ? `<button class="btn-sm primary" data-action="onsale" data-id="${id}" data-gallery-type="${type}">🟢 标注在售</button><button class="btn-sm danger" data-action="delete" data-id="${id}" data-gallery-type="${type}">🗑️ 删产品</button>`
    : ''}`;
}

async function previewGalleryLocalItem(galleryId) {
  const item = await getGalleryItem(galleryId);
  if (!item) return toast('图库条目不存在');
  const body = $('#preview-poster-body');
  body.innerHTML = `<img src="${getGalleryDisplayUrl(item)}" alt="${item.name}">`;
  $('#preview-overlay').classList.add('show');
  $('#preview-panel').classList.add('show');
}

async function deleteGalleryLocalItem(galleryId) {
  return showDialog('删除图库记录', '确定删除该多品长图记录？删除后不可恢复。', async () => {
    const item = await deleteGalleryItem(galleryId);
    if (!item) return toast('记录不存在');
    if (item.generationId) {
      try {
        await api.deletePosterGeneration(item.generationId);
      } catch {
        /* 服务端记录可能已清理 */
      }
    }
    toast('🗑️ 已删除图库记录');
    renderGallery();
    await updateProfile();
  });
}

async function deletePosterRecordForVehicle(vehicleId) {
  return showDialog('删除生成记录', '仅删除长图生成记录，产品信息保留。确定继续？', async () => {
    await api.deletePosterRecord(vehicleId);
    await invalidatePosterCacheForVehicleIds([vehicleId]);
    clearPosterPreviewBundle();
    const v = state.vehicles.find((c) => c.id === vehicleId);
    if (v) {
      v.hasPoster = false;
      v.lastPosterGeneratedAt = null;
      v.templateId = null;
    }
    toast('🗑️ 已删除生成记录');
    refreshAll();
  });
}

async function shareGalleryLocalItem(galleryId) {
  const item = await getGalleryItem(galleryId);
  if (!item) return toast('图库条目不存在');
  applyPosterResult(
    { generationId: item.generationId, imageBase64: item.imageBase64 },
    { displayUrl: getGalleryDisplayUrl(item) }
  );
  state.shareVehicleIds = item.vehicleIds;
  state.shareReuse = true;
  state.selectedTemplateId = item.templateId || state.selectedTemplateId;
  const { copyText } = await api.defaultShareCopy(item.vehicleIds);
  $('#share-text').value = copyText;
  showShare();
}

async function renderGallery() {
  const container = $('#gallery-list');
  const localItems = await listGalleryItems();
  const withPoster = getVisibleVehicles().filter((v) => hasPublishedPoster(v));

  if (!localItems.length && !withPoster.length) {
    container.innerHTML = '<div class="empty-state"><span class="icon">🖼️</span><h3>本地图库为空</h3><p>多品生成长图后将自动存入此处</p></div>';
    refreshListScrollbar('gallery-list-scroll');
    return;
  }

  const multiHtml = localItems.map((item) => {
    const thumb = getGalleryDisplayUrl(item);
    const labels = item.vehicleIds
      .map((id) => state.vehicles.find((v) => v.id === id)?.brandModel)
      .filter(Boolean)
      .slice(0, 2)
      .join('、');
    const subtitle = labels || `${item.vehicleIds.length} 件产品合集`;
    return `<div class="card gallery-card" data-gallery-id="${item.id}" data-type="multi">
      <div style="display:flex;gap:12px;">
        <div class="card-img gallery-card-img gallery-card-img--poster">
          <img src="${thumb}" alt="${item.name}">
        </div>
        <div class="card-info">
          <h3>${item.name}</h3>
          <div class="code">${subtitle}</div>
          <div class="meta">多品合集 · ${item.vehicleIds.length} 件产品 · ${item.previewMode ? '预览' : '高清'}</div>
        </div>
      </div>
      <div class="card-actions">
        ${renderGalleryCardActions(item.id, 'multi', 'on_sale')}
      </div>
    </div>`;
  }).join('');

  const singleHtml = withPoster.map((c) => {
    const [cls, label] = statusLabel(c.status);
    const img = c.photos?.[0]?.url
      ? `<img src="${assetUrl(c.photos[0].url)}" alt="">`
      : '📦';
    return `<div class="card gallery-card" data-id="${c.id}" data-type="single">
      <div style="display:flex;gap:12px;">
        <div class="card-img gallery-card-img" data-id="${c.id}">${img}</div>
        <div class="card-info">
          <h3>${c.brandModel || '未填写产品名'}</h3>
          <div class="code">${formatVehicleCode(c.code)}</div>
          <div class="meta">${c.photoCount || 0} 张照片 · 分享 ${c.shareCount || 0} 次 · 长图已生成</div>
          <div class="price">${c.priceWan || '--'} 万元</div>
          <div style="margin-top:4px;"><span class="tag ${cls}">${label}</span></div>
        </div>
      </div>
      <div class="card-actions">
        ${renderGalleryCardActions(c.id, 'single', c.status)}
      </div>
    </div>`;
  }).join('');

  container.innerHTML = multiHtml + singleHtml;

  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const type = btn.dataset.galleryType;
      const id = btn.dataset.id;
      if (type === 'multi') {
        if (btn.dataset.action === 'preview') return previewGalleryLocalItem(id);
        if (btn.dataset.action === 'share') return shareGalleryLocalItem(id);
        if (btn.dataset.action === 'delete-record') return deleteGalleryLocalItem(id);
        return;
      }
      if (btn.dataset.action === 'delete-record') return deletePosterRecordForVehicle(id);
      handleCardAction(btn.dataset.action, id);
    };
  });

  container.querySelectorAll('.gallery-card[data-type="multi"]').forEach((card) => {
    card.onclick = (e) => {
      if (e.target.closest('[data-action]')) return;
      previewGalleryLocalItem(card.dataset.galleryId);
    };
  });

  container.querySelectorAll('.gallery-card[data-type="single"]').forEach((card) => {
    card.onclick = (e) => {
      if (e.target.closest('[data-action]')) return;
      previewGalleryPoster(card.dataset.id);
    };
  });
  refreshListScrollbar('gallery-list-scroll');
}

function markVehiclesPublishedLocally(ids = []) {
  const now = Date.now();
  ids.forEach((id) => {
    const vehicle = state.vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    vehicle.hasPoster = true;
    vehicle.lastPosterGeneratedAt = now;
    if (vehicle.status === 'draft') vehicle.status = 'on_sale';
  });
}

async function updateProfile() {
  if (!state.user) {
    $('#profile-total').textContent = '0';
    $('#profile-sale').textContent = '0';
    if ($('#profile-pub')) $('#profile-pub').textContent = '0';
    updateQuotaUI();
    return;
  }
  const visible = getVisibleVehicles();
  const pubEl = $('#profile-pub');
  $('#profile-total').textContent = visible.length;
  $('#profile-sale').textContent = visible.filter((v) => v.status === 'on_sale').length;

  let published = 0;
  try {
    const stats = await api.getStats();
    published = Number(stats.posterTotal ?? 0);
    if (stats.usage) {
      state.usage = stats.usage;
      updateQuotaUI();
    }
  } catch {
    published = 0;
  }

  if (state.currentFilter === 'all') {
    published = Math.max(published, visible.filter(hasPublishedPoster).length);
  }

  if (pubEl) pubEl.textContent = String(published);
}

function toggleSelect(id) {
  const car = state.vehicles.find((c) => c.id === id);
  if (!car || car.status === 'sold') return;
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderCarList();
  updateSelectAllButton();
}

function updateBatchButtons() {
  const count = state.selectedIds.size;
  $('#btn-batch-sell').disabled = count === 0;
  $('#btn-batch-del').disabled = count === 0;
  const genBtn = $('#btn-generate');
  const genCount = $('#generate-count');
  genBtn.disabled = count === 0;
  if (genCount) genCount.textContent = count;
  const bar = $('#multi-car-bar');
  if (count > 1) {
    bar.style.display = 'block';
    $('#multi-count').textContent = count;
  } else {
    bar.style.display = 'none';
  }
}

async function previewGalleryPoster(id) {
  try {
    const v = state.vehicles.find((c) => c.id === id) || await api.getVehicle(id);
    if (!hasPublishedPoster(v)) {
      toast('暂无长图记录，请先在模板页生成长图');
      return;
    }
    const templateId = v.templateId || state.selectedTemplateId || 'tpl_simple_01';
    const { result, cached } = await resolvePosterRender({
      vehicleIds: [id],
      templateId,
      previewMode: hdPosterMode(),
      showProgress: false,
    });
    const body = $('#preview-poster-body');
    body.innerHTML = `<img src="${cached?.displayUrl || posterDataUrl(result)}" alt="长图预览">`;
    $('#preview-overlay').classList.add('show');
    $('#preview-panel').classList.add('show');
  } catch (e) {
    toast('预览失败: ' + e.message);
  }
}

function hidePosterPreview() {
  $('#preview-overlay').classList.remove('show');
  $('#preview-panel').classList.remove('show');
}

async function handleCardAction(action, id) {
  if (action === 'preview') return previewGalleryPoster(id);
  if (action === 'share') return quickShare(id, true);
  if (action === 'sold') {
    await api.markSold(id);
    toast('🔴 已标记为已售');
    state.selectedIds.delete(id);
    return refreshAll();
  }
  if (action === 'onsale') {
    return showDialog('标注为在售', '确定将此产品重新标注为在售？', async () => {
      await api.markOnSale(id);
      toast('🟢 已标注为在售');
      refreshAll();
    });
  }
  if (action === 'delete') {
    return showDialog('确认删除', '删除后数据不可恢复，确定删除吗？', async () => {
      await api.deleteVehicle(id);
      state.selectedIds.delete(id);
      toast('🗑️ 已删除');
      refreshAll();
    });
  }
  if (action === 'edit') {
    state.currentVehicleId = id;
    const v = await api.getVehicle(id);
    renderUploadSteps();
    hydrateUploadFromVehicle(v);
    $('#car-price-input').value = v.priceWan != null ? formatPriceInputValue(v.priceWan) : '未公布';
    $('#desc-input').value = v.polishedDescription || v.extraDescription || '';
    state.originalText = v.extraDescription || '';
    state.polishedText = v.polishedDescription || '';
    state.editingSellingPoints = v.sellingPoints || [];
    goTo('page-upload');
    toast('📷 点击已有照片可替换或删除');
  }
}

function normalizeSellingText(point) {
  if (typeof point === 'string') return point.trim();
  return String(point?.text || '').trim();
}

function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownSellingTexts(text = '', points = []) {
  let result = String(text).trim();
  const labels = [...new Set(
    (points || []).map(normalizeSellingText).filter((label) => label.length >= 2)
  )].sort((a, b) => b.length - a.length);

  for (const label of labels) {
    const re = new RegExp(`[，、\\s]*${escapeRegExp(label)}`, 'g');
    result = result.replace(re, '');
  }

  return result
    .replace(/[，、]{2,}/g, '，')
    .replace(/[，、]([！。！？])/g, '$1')
    .replace(/^[，、\s]+|[，、\s]+$/g, '')
    .trim();
}

function mergeSellingIntoDescription(base = '', selectedPoints = [], allPoints = []) {
  const core = stripKnownSellingTexts(base, allPoints.length ? allPoints : selectedPoints);
  const labels = selectedPoints.map(normalizeSellingText).filter(Boolean);
  if (!labels.length) return core;
  if (!core) return `${labels.join('，')}！`;

  const trailing = core.match(/([！。！？])$/);
  const endPunct = trailing ? trailing[1] : '！';
  const main = trailing ? core.slice(0, -1).trimEnd() : core;
  const needsComma = main && !/[，、：:；;]$/.test(main);
  return `${main}${needsComma ? '，' : ''}${labels.join('，')}${endPunct}`;
}

function parseDescWithHighlights(fullText = '') {
  const text = String(fullText);
  const legacyPrefix = '【车辆亮点】';
  const idx = text.indexOf(legacyPrefix);
  if (idx < 0) return { body: text.trimEnd(), highlights: '' };
  const body = text.slice(0, idx).trimEnd();
  const highlights = text.slice(idx + legacyPrefix.length).trim();
  const legacyPoints = highlights.split(/[、，]/).map((t) => t.trim()).filter(Boolean);
  return { body, highlights, legacyPoints };
}

function composeDescriptionText(body = '', sellingPoints = [], allPoints = sellingPoints) {
  const legacy = parseDescWithHighlights(body);
  const base = legacy.highlights
    ? legacy.body
    : stripKnownSellingTexts(body, allPoints);
  return mergeSellingIntoDescription(base, sellingPoints, allPoints);
}

function formatPriceInputValue(priceWan) {
  if (priceWan == null || !Number.isFinite(Number(priceWan)) || Number(priceWan) <= 0) return '未公布';
  return String(priceWan);
}

function parsePriceInputValue(raw) {
  const v = String(raw ?? '').trim();
  if (!v || v === '未公布') return null;
  const n = parseFloat(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setPriceInputValue(priceWan) {
  const input = $('#car-price-input');
  if (!input) return;
  input.value = formatPriceInputValue(priceWan);
}

function getPriceInputValue() {
  return parsePriceInputValue($('#car-price-input')?.value);
}

function setDescExtractStatus(text, tone = '') {
  const el = $('#desc-extract-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('loading', 'ok');
  if (tone) el.classList.add(tone);
}

function scheduleDescExtract() {
  clearTimeout(state.descExtractTimer);
  state.descExtractTimer = setTimeout(() => runDescExtract(), 700);
}

async function runDescExtract() {
  const rawText = ($('#desc-input')?.value || '').trim();
  if (!rawText || rawText.length < 8) {
    setDescExtractStatus('');
    return;
  }

  const seq = ++state.descExtractSeq;
  setDescExtractStatus('识别产品名称与售价中…', 'loading');

  try {
    // 优先本地提取（即时响应，<5ms）
    const localResult = extractVehicleInfoLocal(rawText);

    if (localResult.brandModel || localResult.priceWan != null) {
      if (seq !== state.descExtractSeq) return;

      if (!state.modelTouchedByUser && localResult.brandModel) {
        $('#car-model-input').value = localResult.brandModel;
      }
      setPriceInputValue(localResult.priceWan);

      const priceHint = localResult.priceWan != null ? `售价 ${localResult.priceWan} 万` : '售价未公布';
      const modelHint = localResult.brandModel ? `产品名称 ${localResult.brandModel}` : '未识别到产品名称';
      setDescExtractStatus(`✓ ${modelHint} · ${priceHint}（智能识别）`, 'ok');
      updateDescPreview($('#desc-input')?.value || '');
    } else {
      // 本地未提取到，尝试服务端 LLM
      const result = await api.extractDescInfo({ rawText });
      if (seq !== state.descExtractSeq) return;

      if (!state.modelTouchedByUser && result.brandModel) {
        $('#car-model-input').value = result.brandModel;
      }
      setPriceInputValue(result.priceWan);

      const priceHint = result.priceWan != null ? `售价 ${result.priceWan} 万` : '售价未公布';
      const modelHint = result.brandModel ? `产品名称 ${result.brandModel}` : '未识别到产品名称';
      const sourceLabel = result.source === 'llm' ? '大模型' : '智能识别';
      setDescExtractStatus(`✓ ${modelHint} · ${priceHint}（${sourceLabel}）`, 'ok');
      updateDescPreview($('#desc-input')?.value || '');
    }
  } catch {
    if (seq !== state.descExtractSeq) return;
    setDescExtractStatus('');
  }
  refreshListScrollbar('desc-page-scroll');
}

function appendPriceToDescription(text = '', priceWan = null) {
  const trimmed = String(text).trim();
  const price = Number(priceWan);
  if (!Number.isFinite(price) || price <= 0) return trimmed;
  const priceLine = `售价：${price}万元`;
  if (!trimmed) return priceLine;
  if (/售价[：:]\s*[\d.]+\s*万/.test(trimmed)) return trimmed;
  return `${trimmed}\n\n${priceLine}`;
}

function getSelectedSellingPoints() {
  return state.sellingPoints.filter((p) => state.selectedPointIds.has(p.id));
}

function getPosterDescPreviewText(descText = '') {
  const priceWan = getPriceInputValue();
  if (priceWan == null) {
    const trimmed = String(descText).trim();
    if (!trimmed) return '';
    if (/售价[：:]\s*未公布/.test(trimmed)) return trimmed;
    return `${trimmed}\n\n售价：未公布`;
  }
  return appendPriceToDescription(descText, priceWan);
}

function refreshDescWithSelling({ updatePreview = true } = {}) {
  const input = $('#desc-input');
  if (!input) return;
  const composed = composeDescriptionText(
    state.descBody || '',
    getSelectedSellingPoints(),
    state.sellingPoints
  );
  input.value = composed;
  if (updatePreview) updateDescPreview(composed);
}

function applySellingToDesc(options = {}) {
  refreshDescWithSelling(options);
}

function buildDescFromSellingPoints(points) {
  if (!points?.length) return '';
  return mergeSellingIntoDescription('', points, points);
}

async function quickShare(id, isReuse = false) {
  try {
    const v = await api.getVehicle(id);
    const templateId = v.templateId || state.selectedTemplateId || 'tpl_simple_01';
    const { result, cached } = await resolvePosterRender({
      vehicleIds: [id],
      templateId,
      previewMode: hdPosterMode(),
      showProgress: false,
    });
    applyPosterResult(result, { displayUrl: cached?.displayUrl });
    state.shareVehicleIds = [id];
    state.shareReuse = isReuse;
    const { copyText } = await api.defaultShareCopy([id]);
    $('#share-text').value = copyText;
    showShare();
    if (cached) toast('已使用本地缓存长图');
  } catch (e) {
    toast('长图生成失败: ' + e.message);
  }
}

function maskPhone(phone) {
  if (!phone) return '—';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function renderServerSettings() {
  const input = $('#server-url-input');
  if (!input) return;
  const saved = getConfiguredServerUrl();
  input.value = saved || (isNativeApp() ? DEFAULT_SERVER_URL : '');
  const hint = input.closest('.dealer-settings')?.querySelector('.dealer-settings-hint');
  if (hint && !isNativeApp() && !saved) {
    hint.textContent = '当前通过浏览器访问，已自动连接本服务器，无需修改。';
  }
}

async function testServerConnection() {
  const input = $('#server-url-input');
  const url = (input?.value || '').trim().replace(/\/$/, '');
  if (!url) return toast('请输入服务器地址');
  try {
    const res = await fetch(`${url}/api/health`);
    const data = await res.json();
    if (!data.ok) throw new Error('bad health');
    toast('连接成功');
  } catch {
    toast('无法连接，请检查地址与网络');
  }
}

async function saveServerSettings() {
  const input = $('#server-url-input');
  const url = (input?.value || '').trim().replace(/\/$/, '');
  if (!url) return toast('请输入服务器地址');
  try {
    const res = await fetch(`${url}/api/health`);
    const data = await res.json();
    if (!data.ok) throw new Error('bad health');
    setServerBase(url);
    toast('服务器已保存');
    await refreshAll();
    state.dealer = await api.getDealer().catch(() => null);
    renderDealerProfile(state.dealer);
  } catch {
    toast('无法连接，请检查地址与网络');
  }
}

function renderDealerProfile(dealer) {
  state.dealer = dealer;
  const shopInput = $('#dealer-shop-input');
  if (!shopInput) return;

  if (!dealer) {
    $('#dealer-name').textContent = '销售者';
    $('#dealer-phone-display').textContent = '📞 —';
    return;
  }

  $('#dealer-name').textContent = dealer.shopName || dealer.shop_name || '销售者';
  $('#dealer-phone-display').textContent = '📞 ' + maskPhone(dealer.contactPhone || dealer.contact_phone);
  $('#dealer-shop-input').value = dealer.shopName || dealer.shop_name || '';
  $('#dealer-phone-input').value = dealer.contactPhone || dealer.contact_phone || '';
  $('#dealer-wechat-input').value = dealer.contactWechat || dealer.contact_wechat || '';
  const qrImg = $('#dealer-qrcode-img');
  const qrPlaceholder = $('#dealer-qrcode-placeholder');
  const qrcodeUrl = dealer.qrcodeUrl;
  if (qrcodeUrl) {
    qrImg.src = `${assetUrl(qrcodeUrl)}?t=${Date.now()}`;
    qrImg.classList.remove('hidden');
    qrPlaceholder.style.display = 'none';
  } else {
    qrImg.classList.add('hidden');
    qrImg.removeAttribute('src');
    qrPlaceholder.style.display = 'block';
    qrPlaceholder.textContent = '+ 点击上传二维码';
  }
}

async function persistDealerIfNeeded({ silent = false } = {}) {
  const shopInput = $('#dealer-shop-input');
  if (!shopInput) return state.dealer;
  const shopName = shopInput.value.trim();
  const contactPhone = $('#dealer-phone-input').value.trim();
  const contactWechat = $('#dealer-wechat-input').value.trim();
  if (!shopName || !contactPhone) return state.dealer;

  const prev = state.dealer || {};
  const unchanged =
    shopName === (prev.shopName || prev.shop_name || '') &&
    contactPhone === (prev.contactPhone || prev.contact_phone || '') &&
    contactWechat === (prev.contactWechat || prev.contact_wechat || '');
  if (unchanged) return state.dealer;

  try {
    const updated = await api.updateDealer({ shopName, contactPhone, contactWechat });
    renderDealerProfile(updated);
    if (!silent) toast('✅ 联系信息已同步');
    return updated;
  } catch (e) {
    if (!silent) toast('保存失败: ' + e.message);
    return state.dealer;
  }
}

async function saveDealerProfile() {
  const shopName = $('#dealer-shop-input').value.trim();
  const contactPhone = $('#dealer-phone-input').value.trim();
  const contactWechat = $('#dealer-wechat-input').value.trim();
  if (!shopName) return toast('请填写姓名或店铺名');
  if (!contactPhone) return toast('请填写联系电话');
  try {
    const updated = await api.updateDealer({ shopName, contactPhone, contactWechat });
    renderDealerProfile(updated);
    toast('✅ 联系信息已保存');
  } catch (e) {
    toast('保存失败: ' + e.message);
  }
}

async function pickDealerQrcode() {
  const input = $('#qrcode-input');
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await persistDealerIfNeeded({ silent: true });
      const compressed = await compressQrcodeForUpload(file);
      const updated = await api.uploadDealerQrcode(compressed);
      renderDealerProfile(updated);
      toast('✅ 二维码已上传');
    } catch (e) {
      toast('二维码上传失败: ' + e.message);
    }
    input.value = '';
  };
  input.click();
}

async function savePosterToGalleryAndGo() {
  const btn = $('#btn-save-gallery');
  const prevText = btn?.textContent;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '保存中…';
    }
    const ids = getFinalPosterIds();
    if (!ids.length) throw new Error('请先选择产品');
    const result = await ensurePosterReady({ showProgress: false });
    const displayUrl = state.posterDataUrl || state.posterUrl || posterDataUrl(result);
    if (!displayUrl) throw new Error('请先在模板页生成长图');
    await confirmPosterPublishedIfNeeded(result, ids);
    const item = await maybeSaveMultiPosterToGallery(ids, state.selectedTemplateId, result, displayUrl);
    if (ids.length > 1 && item?.name) {
      toast(`✅ 已保存到图库：${item.name}`);
    } else {
      toast('✅ 已保存到图库');
    }
    await switchTab('page-gallery');
  } catch (e) {
    if (e.name !== 'AbortError') toast('保存失败: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

async function goToDraftBox() {
  closeAllOverlays();
  state.currentFilter = 'on_sale';
  syncFilterChipsUI();
  await switchTab('page-list');
}

async function switchTab(pageId) {
  const current = $('.screen.active')?.id;
  if (current === 'page-profile' && pageId !== 'page-profile') {
    await persistDealerIfNeeded({ silent: true });
  }
  closeAllOverlays();
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${pageId}`).classList.add('active');
  syncTabHighlight(pageId);
  if (pageId === 'page-list') syncFilterChipsUI();
  if (pageId === 'page-profile') {
    if (state.dealer) renderDealerProfile(state.dealer);
    else api.getDealer().then(renderDealerProfile).catch(() => renderDealerProfile(null));
    renderServerSettings();
  }
  await refreshAll();
}

function goTo(pageId) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${pageId}`).classList.add('active');
  syncTabHighlight(pageId);
  if (pageId === 'page-template') {
    persistDealerIfNeeded({ silent: true }).then(() => renderTemplatePage());
    return;
  }
  if (pageId === 'page-desc' && state.currentVehicleId) {
    loadDescPage();
    requestAnimationFrame(() => refreshListScrollbar('desc-page-scroll'));
  }
}

async function loadDescPage() {
  const v = await api.getVehicle(state.currentVehicleId);
  let text = v.polishedDescription || v.extraDescription || '';
  if (!text.trim() && v.sellingPoints?.length) {
    text = buildDescFromSellingPoints(v.sellingPoints);
  }
  $('#car-model-input').value = v.brandModel && v.brandModel !== '待填写产品名' ? v.brandModel : '';
  setPriceInputValue(v.priceWan);
  state.modelTouchedByUser = !!(v.brandModel && v.brandModel !== '待填写产品名');
  setDescExtractStatus('');
  state.originalText = v.extraDescription || '';
  state.polishedText = v.polishedDescription || '';

  if (v.sellingPoints?.length) {
    state.sellingPoints = v.sellingPoints.map((p) => ({
      id: p.pointId || p.id,
      category: p.category,
      text: p.text,
      emoji: p.emoji,
      source: p.source || 'ai',
    }));
    state.selectedPointIds = new Set(state.sellingPoints.map((p) => p.id));
    renderSellingTagsUI();
    updateSellingTagHint(`已加载 ${state.sellingPoints.length} 条要点，可重新提炼`);
  } else {
    state.sellingPoints = [];
    state.selectedPointIds = new Set();
    renderSellingTagsUI();
    updateSellingTagHint('填写描述后点击「AI 提炼总结」');
  }

  state.descBody = stripKnownSellingTexts(
    parseDescWithHighlights(text).body || v.extraDescription || text,
    state.sellingPoints
  );
  refreshDescWithSelling();
  if (text.trim().length >= 8 && !state.modelTouchedByUser) scheduleDescExtract();
  requestAnimationFrame(() => refreshListScrollbar('desc-page-scroll'));
}

function updateSellingTagHint(text) {
  const el = $('#selling-tag-hint');
  if (el) el.textContent = text;
}

function updateDescPreview(text) {
  const preview = $('#desc-preview');
  if (!preview) return;
  const posterText = getPosterDescPreviewText(text);
  preview.textContent = posterText || '填写后将显示在长图「产品介绍」区域（含售价）';
  preview.classList.toggle('empty', !posterText.trim());
  refreshListScrollbar('desc-page-scroll');
}

function formatVehicleCode(code) {
  return code || '编号待生成';
}

function uploadModeStorageKey(vehicleId) {
  return `uca_upload_mode_${vehicleId}`;
}

function persistUploadPhotoMode() {
  if (!state.currentVehicleId || !state.uploadPhotoMode) return;
  localStorage.setItem(uploadModeStorageKey(state.currentVehicleId), state.uploadPhotoMode);
}

function loadUploadPhotoMode(vehicleId) {
  return localStorage.getItem(uploadModeStorageKey(vehicleId)) || null;
}

function vehicleHasUploadPhotos(vehicle) {
  const photos = vehicle?.photos;
  if (photos?.length) return true;
  return $$('.photo-item.has-photo').length > 0;
}

function setUploadPhotoMode(mode) {
  state.uploadPhotoMode = mode;
  persistUploadPhotoMode();
  applyUploadModeUI();
}

function applyUploadModeUI() {
  const mode = state.uploadPhotoMode;
  const hasPhotos = vehicleHasUploadPhotos();
  const batchAwaitingPhotos = mode === 'batch_all' && !hasPhotos;
  const stepLocked = batchAwaitingPhotos;
  const topBtn = $('#btn-batch-all-photos');
  const batchBar = $('.upload-batch-bar');
  const stepArea = $('#upload-step-area');

  if (mode === 'batch_all') {
    topBtn?.removeAttribute('disabled');
    topBtn?.classList.remove('is-locked');
    batchBar?.classList.remove('upload-mode-locked');
    stepArea?.classList.toggle('upload-mode-locked', batchAwaitingPhotos);
    stepArea?.classList.toggle('upload-ready', hasPhotos);
    if (batchAwaitingPhotos) stepArea?.setAttribute('aria-disabled', 'true');
    else stepArea?.removeAttribute('aria-disabled');
  } else if (mode === 'stepwise') {
    topBtn?.setAttribute('disabled', 'disabled');
    topBtn?.classList.add('is-locked');
    batchBar?.classList.add('upload-mode-locked');
    stepArea?.classList.remove('upload-mode-locked');
    stepArea?.classList.toggle('upload-ready', hasPhotos);
    stepArea?.removeAttribute('aria-disabled');
  } else {
    topBtn?.removeAttribute('disabled');
    topBtn?.classList.remove('is-locked');
    batchBar?.classList.remove('upload-mode-locked');
    stepArea?.classList.remove('upload-mode-locked');
    stepArea?.classList.toggle('upload-ready', hasPhotos);
    stepArea?.removeAttribute('aria-disabled');
  }

  $$('.btn-batch-photos').forEach((btn) => {
    btn.disabled = stepLocked;
    btn.classList.toggle('is-locked', stepLocked);
  });
  $$('.photo-item').forEach((el) => {
    el.classList.remove('upload-mode-locked');
    el.removeAttribute('aria-disabled');
  });
  $$('[data-skip]').forEach((btn) => {
    btn.disabled = stepLocked;
    btn.classList.toggle('is-locked', stepLocked);
  });

  const hint = $('#upload-mode-hint');
  if (hint) hint.hidden = !!mode;
}

function ensureUploadPhotoMode(mode) {
  if (!state.uploadPhotoMode) {
    setUploadPhotoMode(mode);
    return true;
  }
  if (state.uploadPhotoMode === mode) return true;
  const msg = mode === 'batch_all'
    ? '已使用分步上传，无法再使用「一次选多张」'
    : '已使用「一次选多张」，分步上传已锁定';
  toast(msg);
  return false;
}

function isPaidUser() {
  return !!state.usage?.trial?.isPaid || !!state.usage?.unlimited;
}

async function startNewVehicle() {
  if (!state.user) {
    toast('请先登录');
    switchTab('page-profile');
    return;
  }
  if (state.usage && !state.usage.canCreate && !isPaidUser()) {
    showPaywall({
      code: state.usage.blockReason,
      limit: state.usage.limit,
      current: state.usage.used,
      trialDays: state.usage.trial?.days,
    });
    return;
  }
  try {
    const v = await api.createVehicle();
    state.currentVehicleId = v.id;
    state.currentStep = 0;
    state.editingSellingPoints = [];
    state.uploadPhotoMode = null;
    renderUploadSteps();
    goTo('page-upload');
    toast('已开始录入新产品');
    if (state.usage) {
      state.usage.used += 1;
      if (isPaidUser()) {
        state.usage.canCreate = true;
        state.usage.blockReason = null;
      } else {
        state.usage.remaining = Math.max(0, state.usage.limit - state.usage.used);
        state.usage.canCreate = state.usage.used < state.usage.limit && !state.usage.trial?.expired;
        if (!state.usage.canCreate && state.usage.trial?.expired) {
          state.usage.blockReason = 'TRIAL_EXPIRED';
        } else if (!state.usage.canCreate) {
          state.usage.blockReason = 'PRODUCT_LIMIT_REACHED';
        } else {
          state.usage.blockReason = null;
        }
      }
      updateQuotaUI();
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'PRODUCT_LIMIT_REACHED') {
      showPaywall({ code: 'PRODUCT_LIMIT_REACHED', ...e.details });
      return;
    }
    if (e instanceof ApiError && e.code === 'TRIAL_EXPIRED') {
      showPaywall({ code: 'TRIAL_EXPIRED', ...e.details });
      return;
    }
    toast('创建失败: ' + (e.message || '请重试'));
  }
}

function renderUploadSteps() {
  SLOT_CONFIG.forEach((step, idx) => {
    const el = $(`#step-${idx}`);
    if (!el) return;
    const grid = step.slots.map((slot) => `
      <div class="photo-item" data-category="${step.key}" data-slot="${slot.key}">
        <span class="add-icon">+</span>
        <span class="label">${slot.label}</span>
        <span class="badge">0</span>
      </div>`).join('');
    el.innerHTML = `
      <div class="step-header">
        <h2>${step.label}</h2>
        <div class="sub">${step.sub}</div>
        <div class="step-header-actions">
          <button type="button" class="btn-batch-photos" data-step="${idx}">📷 本步起自动填充</button>
        </div>
      </div>
      <div class="photo-grid">${grid}</div>
      <div class="photo-extras" id="step-${idx}-extras" hidden></div>
      <div class="skip-bar"><button type="button" data-skip="${idx}">${idx < 2 ? `跳过此步 → ${SLOT_CONFIG[idx + 1].label}` : '跳过此步 → 完成'}</button></div>`;
  });

  $$('.photo-item').forEach((item) => {
    item.onclick = () => pickPhoto(item.dataset.category, item.dataset.slot, item);
  });
  $$('.btn-batch-photos').forEach((btn) => {
    btn.onclick = () => pickPhotosForStep(parseInt(btn.dataset.step, 10));
  });
  $$('[data-skip]').forEach((btn) => {
    btn.onclick = () => {
      if (!ensureUploadPhotoMode('stepwise')) return;
      const n = parseInt(btn.dataset.skip, 10);
      if (n >= 2) finishUpload();
      else goStep(n + 1);
    };
  });
  goStep(0);
  applyUploadModeUI();
}

function goStep(n) {
  $$('.step-content').forEach((s, i) => { s.style.display = i === n ? 'block' : 'none'; });
  $$('.step-dot').forEach((d, i) => {
    d.classList.toggle('active', i === n);
    d.classList.toggle('done', i < n);
  });
  state.currentStep = n;
  $('#btn-upload-next').style.display = n < 2 ? 'block' : 'none';
  $('#btn-upload-done').style.display = n === 2 ? 'block' : 'none';
}

function getSlotPhotos(vehicle, category, slotKey) {
  return (vehicle?.photos || [])
    .filter((p) => p.category === category && p.slotKey === slotKey)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

function updatePhotoItemUI(el, photos, previewUrl) {
  el.querySelector('.photo-manage-hint')?.remove();
  if (!photos?.length) {
    el.classList.remove('has-photo');
    delete el.dataset.photoId;
    el.querySelector('.badge').textContent = '0';
    el.querySelector('.badge').style.display = 'none';
    el.querySelector('.add-icon').textContent = '+';
    el.querySelector('.photo-thumb')?.remove();
    return;
  }
  const primary = photos[0];
  el.classList.add('has-photo');
  el.dataset.photoId = primary.id;
  el.querySelector('.badge').textContent = String(photos.length);
  el.querySelector('.badge').style.display = 'flex';
  el.querySelector('.add-icon').textContent = '📷';
  let img = el.querySelector('.photo-thumb');
  if (!img) {
    img = document.createElement('img');
    img.className = 'photo-thumb';
    el.appendChild(img);
  }
  img.src = previewUrl || `${primary.url}?t=${Date.now()}`;
  const hint = document.createElement('span');
  hint.className = 'photo-manage-hint';
  hint.textContent = '点击管理';
  el.appendChild(hint);
}

function openPhotoPicker(onSelect, { onCancel } = {}) {
  const input = $('#file-input');
  input.multiple = true;
  input.accept = 'image/*';
  input.onchange = async () => {
    const files = [...(input.files || [])].filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) {
      onCancel?.();
      return;
    }
    try {
      await onSelect(files);
    } catch (e) {
      onCancel?.();
      toast('上传失败: ' + e.message);
    }
  };
  input.click();
}

async function uploadFilesToSlot(category, slotKey, el, files, { replace = false, preparedFiles = null } = {}) {
  const slotProgress = createSlotUploadProgress(el);
  const sources = preparedFiles || files;
  try {
    let nextCompress = null;
    for (let i = 0; i < sources.length; i += 1) {
      slotProgress.prepare(i + 1, sources.length);
      let compressed;
      if (preparedFiles) {
        compressed = sources[i];
      } else {
        compressed = await (nextCompress || compressPhotoForUpload(files[i]));
        if (i + 1 < files.length) {
          nextCompress = compressPhotoForUpload(files[i + 1]);
        }
      }
      await api.uploadPhoto(state.currentVehicleId, category, slotKey, compressed, {
        replace: replace && i === 0,
        onProgress: ({ loaded, total }) => {
          if (total > 0) slotProgress.setFilePercent(loaded / total);
        },
      });
      slotProgress.setFilePercent(1);
    }
  } finally {
    slotProgress.done();
  }
  const vehicle = await api.getVehicle(state.currentVehicleId);
  const slotPhotos = vehicle.photos.filter((p) => p.category === category && p.slotKey === slotKey);
  const previewFile = files?.[files.length - 1] || sources[sources.length - 1];
  const previewUrl = previewFile instanceof File ? URL.createObjectURL(previewFile) : null;
  updatePhotoItemUI(el, slotPhotos, previewUrl);
  applyUploadModeUI();
  return slotPhotos.length;
}

function getOrderedUploadSlots() {
  const slots = [];
  SLOT_CONFIG.forEach((step, stepIndex) => {
    $$(`#step-${stepIndex} .photo-item`).forEach((el) => {
      slots.push({
        el,
        category: el.dataset.category,
        slotKey: el.dataset.slot,
        label: el.querySelector('.label')?.textContent || '',
        stepIndex,
      });
    });
  });
  return slots;
}

function findSlotIndex(category, slotKey) {
  return getOrderedUploadSlots().findIndex((s) => s.category === category && s.slotKey === slotKey);
}

function refreshAllSlotUI(vehicle) {
  $$('.photo-item').forEach((el) => {
    const photos = (vehicle?.photos || []).filter(
      (p) => p.category === el.dataset.category && p.slotKey === el.dataset.slot
    );
    updatePhotoItemUI(el, photos);
  });
}

function refreshAllPhotoExtras(vehicle) {
  SLOT_CONFIG.forEach((step, stepIndex) => {
    const box = $(`#step-${stepIndex}-extras`);
    if (!box) return;
    const extraItems = [];
    step.slots.forEach((slot) => {
      const photos = (vehicle?.photos || []).filter(
        (p) => p.category === step.key && p.slotKey === slot.key
      );
      photos.slice(1).forEach((photo, i) => {
        extraItems.push({ photo, label: `${slot.label} +${i + 2}` });
      });
    });
    if (!extraItems.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.innerHTML = `
      <div class="photo-extras-title">多出 ${extraItems.length} 张（同位置追加，可删除）</div>
      <div class="photo-overflow-strip">
        ${extraItems.map(({ photo, label }) => `
          <div class="photo-extra-item">
            <button type="button" class="photo-extra-del" data-photo-id="${photo.id}" aria-label="删除">×</button>
            <img src="${assetUrl(photo.url)}?t=${Date.now()}" alt="">
            <span>${label}</span>
          </div>`).join('')}
      </div>`;
    box.querySelectorAll('.photo-extra-del').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteVehiclePhoto(btn.dataset.photoId, { label: btn.closest('.photo-extra-item')?.querySelector('span')?.textContent || '该图片' });
      };
    });
  });
}

let photoActionContext = null;

function hidePhotoActionSheet() {
  $('#photo-action-overlay')?.classList.remove('show');
  $('#photo-action-sheet')?.classList.remove('show');
  photoActionContext = null;
}

function showPhotoActionSheet(category, slotKey, el) {
  const thumb = el.querySelector('.photo-thumb');
  const label = el.querySelector('.label')?.textContent || '该位置';
  photoActionContext = { category, slotKey, el, label, photoId: el.dataset.photoId || null };
  const preview = $('#photo-action-preview');
  if (preview) {
    preview.innerHTML = thumb
      ? `<img src="${thumb.src}" alt="">`
      : '<div class="share-preview-empty">暂无预览</div>';
  }
  const title = $('#photo-action-title');
  if (title) title.textContent = label;
  $('#photo-action-overlay')?.classList.add('show');
  $('#photo-action-sheet')?.classList.add('show');
}

async function replacePhotoInSlot(category, slotKey, el) {
  if (!state.currentVehicleId) return;
  const label = el.querySelector('.label')?.textContent || '该位置';
  hidePhotoActionSheet();
  const modeBefore = state.uploadPhotoMode;
  openPhotoPicker(async (files) => {
    if (files.length !== 1) {
      toast('替换请选择一张图片');
      return;
    }
    await uploadFilesToSlot(category, slotKey, el, files, { replace: true });
    const vehicle = await api.getVehicle(state.currentVehicleId);
    refreshAllPhotoExtras(vehicle);
    updateStepDots();
    toast(`🔄 已替换 ${label}`);
  }, {
    onCancel: () => revertUploadModeIfEmpty(modeBefore),
  });
}

async function deleteVehiclePhoto(photoId, { label = '该图片', category, slotKey, el } = {}) {
  if (!state.currentVehicleId || !photoId) return;
  hidePhotoActionSheet();
  showDialog('删除图片', `确定删除「${label}」的照片？`, async () => {
    try {
      await api.deletePhoto(state.currentVehicleId, photoId);
      const vehicle = await api.getVehicle(state.currentVehicleId);
      if (el) {
        const slotPhotos = getSlotPhotos(vehicle, category, slotKey);
        updatePhotoItemUI(el, slotPhotos);
      } else {
        refreshAllSlotUI(vehicle);
      }
      refreshAllPhotoExtras(vehicle);
      updateStepDots();
      toast('🗑️ 已删除');
    } catch (e) {
      toast('删除失败: ' + e.message);
    }
  });
}

async function deletePhotoFromSlot(category, slotKey, el) {
  const photoId = el.dataset.photoId;
  if (!photoId) return;
  const label = el.querySelector('.label')?.textContent || '该位置';
  await deleteVehiclePhoto(photoId, { label, category, slotKey, el });
}

async function distributePhotosToSlots(files, { startSlotIndex = 0 } = {}) {
  const slots = getOrderedUploadSlots();
  if (!slots.length) return { filledSlots: 0, overflow: files.length, emptySlots: 0 };

  const globalProgress = showGlobalUploadProgress();
  let fileIdx = 0;
  let lastFilled = null;
  const total = files.length;
  const prepared = await compressPhotosForUpload(files, { concurrency: 4 });

  try {
    for (let i = startSlotIndex; i < slots.length && fileIdx < files.length; i += 1) {
      const slot = slots[i];
      if (slot.el.classList.contains('has-photo')) continue;
      globalProgress.show(fileIdx + 1, total, slot.label);
      await uploadFilesToSlot(slot.category, slot.slotKey, slot.el, [files[fileIdx]], {
        preparedFiles: [prepared[fileIdx]],
      });
      lastFilled = slot;
      fileIdx += 1;
    }

    if (fileIdx < files.length) {
      const target = lastFilled || slots[Math.max(startSlotIndex, 0)] || slots[slots.length - 1];
      globalProgress.show(fileIdx + 1, total, target.label);
      await uploadFilesToSlot(
        target.category,
        target.slotKey,
        target.el,
        files.slice(fileIdx),
        { preparedFiles: prepared.slice(fileIdx) }
      );
      fileIdx = files.length;
    }
  } finally {
    globalProgress.hide();
  }

  const vehicle = await api.getVehicle(state.currentVehicleId);
  refreshAllSlotUI(vehicle);
  refreshAllPhotoExtras(vehicle);
  updateStepDots();
  applyUploadModeUI();

  const emptySlots = slots.filter((s) => !s.el.classList.contains('has-photo')).length;
  return {
    emptySlots,
    totalSlots: slots.length,
    filesCount: files.length,
  };
}

function buildDistributeToast(filesCount, stats) {
  const parts = [`已分配 ${filesCount} 张`];
  if (stats.emptySlots > 0) parts.push(`空余 ${stats.emptySlots} 位`);
  if (filesCount > stats.totalSlots) {
    parts.push(`超出 ${filesCount - stats.totalSlots} 张已追加显示`);
  }
  return `📸 ${parts.join(' · ')}`;
}

function pickPhoto(category, slotKey, el) {
  if (!state.currentVehicleId) return;
  if (el.classList.contains('upload-mode-locked')) return;
  if (el.classList.contains('has-photo')) {
    showPhotoActionSheet(category, slotKey, el);
    return;
  }
  const modeBefore = state.uploadPhotoMode;
  if (!ensureUploadPhotoMode('stepwise')) return;
  const label = el.querySelector('.label').textContent;
  openPhotoPicker(async (files) => {
    if (files.length === 1) {
      await uploadFilesToSlot(category, slotKey, el, files, { replace: false });
      const vehicle = await api.getVehicle(state.currentVehicleId);
      refreshAllPhotoExtras(vehicle);
      updateStepDots();
      toast(`📸 已添加 ${label}`);
      return;
    }
    const startSlotIndex = Math.max(0, findSlotIndex(category, slotKey));
    const stats = await distributePhotosToSlots(files, { startSlotIndex });
    toast(buildDistributeToast(files.length, stats));
  }, {
    onCancel: () => revertUploadModeIfEmpty(modeBefore),
  });
}

function pickPhotosForStep(stepIndex) {
  if (!state.currentVehicleId) return;
  const modeBefore = state.uploadPhotoMode;
  if (!ensureUploadPhotoMode('stepwise')) return;
  const slots = getOrderedUploadSlots();
  const startSlotIndex = slots.findIndex((s) => s.stepIndex === stepIndex);
  openPhotoPicker(async (files) => {
    const stats = await distributePhotosToSlots(files, {
      startSlotIndex: Math.max(0, startSlotIndex),
    });
    toast(buildDistributeToast(files.length, stats));
  }, {
    onCancel: () => revertUploadModeIfEmpty(modeBefore),
  });
}

function pickPhotosForAllSteps() {
  if (!state.currentVehicleId) return;
  const modeBefore = state.uploadPhotoMode;
  if (!ensureUploadPhotoMode('batch_all')) return;
  openPhotoPicker(async (files) => {
    const stats = await distributePhotosToSlots(files, { startSlotIndex: 0 });
    toast(buildDistributeToast(files.length, stats));
  }, {
    onCancel: () => revertUploadModeIfEmpty(modeBefore),
  });
}

async function revertUploadModeIfEmpty(previousMode) {
  if (!state.currentVehicleId) return;
  const vehicle = await api.getVehicle(state.currentVehicleId).catch(() => null);
  if (!vehicleHasUploadPhotos(vehicle)) {
    state.uploadPhotoMode = previousMode;
    if (!previousMode) {
      localStorage.removeItem(uploadModeStorageKey(state.currentVehicleId));
    }
    applyUploadModeUI();
  }
}

function hydrateUploadFromVehicle(vehicle) {
  const saved = loadUploadPhotoMode(vehicle.id);
  if (saved) {
    state.uploadPhotoMode = saved;
  } else if (vehicleHasUploadPhotos(vehicle)) {
    state.uploadPhotoMode = 'stepwise';
    persistUploadPhotoMode();
  } else {
    state.uploadPhotoMode = null;
  }
  refreshAllSlotUI(vehicle);
  refreshAllPhotoExtras(vehicle);
  updateStepDots();
  applyUploadModeUI();
}

function updateStepDots() {
  $$('.step-dot').forEach((d, i) => {
    const step = SLOT_CONFIG[i];
    const grid = $(`#step-${i} .photo-grid`);
    const hasAny = grid && [...grid.querySelectorAll('.photo-item')].some((el) => el.classList.contains('has-photo'));
    if (hasAny) d.classList.add('done');
  });
}

async function finishUpload() {
  if (!state.currentVehicleId) return;
  state.editingSellingPoints = [];
  state.modelTouchedByUser = false;
  $('#compare-container').style.display = 'none';
  goTo('page-desc');
  await loadDescPage();
}

async function doAiPolish() {
  const text = $('#desc-input').value.trim();
  if (!text) return toast('请先输入产品描述');
  const btn = $('#btn-ai-polish');
  btn.classList.add('spinning');
  $('#polish-status').textContent = 'AI 润色中…';
  try {
    const result = await api.polish({
      scene: 'vehicle_description',
      rawText: text,
      brandModel: $('#car-model-input')?.value || '',
      maxLength: 100,
    });
    state.polishVersion += 1;
    state.originalText = result.original || text;
    state.polishedText = result.polished;
    state.descBody = stripKnownSellingTexts(result.polished, state.sellingPoints);
    refreshDescWithSelling();
    $('#polish-status').textContent = `✅ AI 润色完成 (${result.source})`;
    $('#compare-container').style.display = 'block';
    $('#polish-ver').textContent = `v${state.polishVersion}`;
    $('#btn-use-polished').style.display = 'inline-flex';
    $('#btn-use-original').style.display = 'inline-flex';
    $('#btn-polish-again').style.display = 'inline-flex';
    showCompareTab('polished');
    toast('✨ AI 润色完成');
  } catch (e) {
    toast('润色失败');
  } finally {
    btn.classList.remove('spinning');
  }
}

function showCompareTab(tab) {
  $('#cmp-original-tab').className = tab === 'original' ? 'active' : '';
  $('#cmp-polished-tab').className = tab === 'polished' ? 'active' : '';
  const body = $('#cmp-body');
  body.textContent = tab === 'original' ? state.originalText : state.polishedText;
}

async function saveDescAndNext() {
  if (!state.currentVehicleId) return;
  const brandModel = $('#car-model-input')?.value?.trim() || '精品产品';
  const priceWan = getPriceInputValue();
  const yearMatch = brandModel?.match(/(20\d{2})/);
  const sellingPoints = state.sellingPoints
    .filter((p) => state.selectedPointIds.has(p.id))
    .map((p) => ({
      pointId: p.id,
      category: p.category,
      text: p.text,
      emoji: p.emoji,
      source: p.source || 'ai',
    }));

  const descValue = $('#desc-input').value;

  await api.updateVehicle(state.currentVehicleId, {
    brandModel,
    extraDescription: state.descBody || stripKnownSellingTexts(descValue, state.sellingPoints) || state.originalText,
    polishedDescription: descValue,
    priceWan,
    sellingPoints,
    ...(yearMatch ? { year: parseInt(yearMatch[1], 10) } : {}),
  });
  state.selectedIds.clear();
  state.selectedIds.add(state.currentVehicleId);
  state.multiMode = false;
  clearPosterPreviewBundle();
  goTo('page-template');
}

async function generateSellingPointsFromDesc({ silent = false, preserveSelection = false } = {}) {
  const desc = $('#desc-input')?.value?.trim() || '';
  const brandModel = $('#car-model-input')?.value?.trim() || '';
  if (!desc && !brandModel) {
    if (!silent) toast('请先填写产品描述或产品名称');
    return false;
  }

  const btn = $('#btn-generate-selling');
  const refreshBtn = $('#btn-refresh-selling');
  btn?.classList.add('spinning');
  if (refreshBtn) refreshBtn.disabled = true;
  updateSellingTagHint('✨ 正在提炼总结描述…');

  try {
    const priceWan = getPriceInputValue();
    const prevSelected = preserveSelection ? new Set(state.selectedPointIds) : null;

    // 优先本地生成（即时响应，<50ms）
    let points, source;
    const localResult = generateFromTextLocal(desc, brandModel, 12);

    if (localResult.length >= 3) {
      points = localResult;
      source = 'local_template';
    } else {
      // 本地结果不足，fallback 到服务端
      try {
        const serverResult = await api.generateSellingPoints({
          rawText: desc,
          brandModel,
          priceWan,
        });
        points = serverResult.points;
        source = serverResult.source;
      } catch {
        points = localResult;
        source = 'local_template';
      }
    }

    state.sellingPoints = points;
    if (preserveSelection && prevSelected?.size) {
      state.selectedPointIds = new Set(points.filter((p) => prevSelected.has(p.id)).map((p) => p.id));
    } else {
      state.selectedPointIds = new Set(points.slice(0, Math.min(6, points.length)).map((p) => p.id));
    }
    renderSellingTagsUI();
    refreshDescWithSelling();
    const sourceLabel = source === 'llm' ? '大模型' : '智能模板';
    updateSellingTagHint(`✅ 已提炼 ${points.length} 条要点（${sourceLabel}），点选后将写入下方描述`);
    if (!silent) toast('✨ 描述提炼完成');
    return true;
  } catch (e) {
    updateSellingTagHint('生成失败，请稍后重试');
    if (!silent) toast('提炼总结失败: ' + e.message);
    return false;
  } finally {
    btn?.classList.remove('spinning');
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function refreshSellingTags() {
  await generateSellingPointsFromDesc({ preserveSelection: true });
  toast('🔄 已重新提炼');
}

function renderSellingTagsUI() {
  const container = $('#selling-tags');
  if (!container) return;
  if (!state.sellingPoints.length) {
    container.innerHTML = '<span style="color:#999;font-size:13px;padding:4px 0;">暂无要点，点击「AI 提炼总结」</span>';
    return;
  }
  container.innerHTML = state.sellingPoints.map((p) => `
    <span class="selling-tag ${state.selectedPointIds.has(p.id) ? 'selected' : ''}" data-id="${p.id}">
      <span class="emoji">${p.emoji || '✨'}</span>${p.text}
    </span>`).join('');
  container.querySelectorAll('.selling-tag').forEach((el) => {
    el.onclick = () => {
      el.classList.toggle('selected');
      const id = el.dataset.id;
      if (state.selectedPointIds.has(id)) state.selectedPointIds.delete(id);
      else state.selectedPointIds.add(id);
      refreshDescWithSelling();
    };
  });
  refreshListScrollbar('desc-page-scroll');
}

async function renderTemplatePage() {
  clearPosterPreviewBundle();
  if (!state.templates.length) {
    // 优先检查离线缓存
    const cachedTemplates = await offlineCache.getTemplates();
    if (cachedTemplates && cachedTemplates.length) {
      state.templates = cachedTemplates;
    } else {
      const { templates } = await api.listTemplates();
      state.templates = templates;
      offlineCache.setTemplates(templates);
    }

    const grid = $('#template-grid');
    grid.innerHTML = state.templates.map((t, i) => {
      const style = TEMPLATE_STYLES[t.id] || TEMPLATE_STYLES.tpl_simple_01;
      return `<div class="template-item ${i === 0 ? 'active' : ''}" data-id="${t.id}">
        <div class="preview" style="background:${style.bg};color:${style.color};${style.border || ''}"></div>
        <div class="name">${t.name.slice(0, 3)}</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.template-item').forEach((el) => {
      el.onclick = () => selectTemplate(el, el.dataset.id);
    });
    state.selectedTemplateId = state.templates[0]?.id || 'tpl_simple_01';
  }

  // 渲染图片布局选择（迷你样式）
  const layoutGrid = $('#layout-grid');
  if (layoutGrid && !layoutGrid.dataset.hydrated) {
    layoutGrid.innerHTML = PHOTO_LAYOUTS.map((l, i) => `
      <div class="layout-item ${i === 0 ? 'active' : ''}" data-id="${l.id}" title="${l.name}">
        <div class="preview">
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">${l.icon}</svg>
        </div>
        <div class="name">${l.cols}列</div>
      </div>
    `).join('');
    layoutGrid.dataset.hydrated = 'true';
    layoutGrid.querySelectorAll('.layout-item').forEach((el) => {
      el.onclick = () => selectPhotoLayout(el, el.dataset.id);
    });
    state.selectedPhotoLayout = PHOTO_LAYOUTS[0]?.id || 'grid_2';
  }

  await generatePosterPreview();
}

function selectTemplate(el, id) {
  $$('.template-item').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
  state.selectedTemplateId = id;
  clearPosterPreviewBundle();
  schedulePosterPreview();
}

function selectPhotoLayout(el, id) {
  $$('.layout-item').forEach((l) => l.classList.remove('active'));
  el.classList.add('active');
  state.selectedPhotoLayout = id;
  clearPosterPreviewBundle();
  schedulePosterPreview();
}

let previewAbortController = null;
let previewDebounceTimer = null;

function schedulePosterPreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => generatePosterPreview(), getClientSetting('previewDebounceMs'));
}

async function renderPosterWithProgress({ vehicleIds, templateId, photoLayout, previewMode, signal }) {
  const container = $('#long-preview');
  const progress = showPosterProgress(container);
  progress.start('正在生成长图…');
  try {
    await persistDealerIfNeeded({ silent: true });
    const result = await renderPosterOnClient({
      vehicleIds,
      templateId,
      photoLayout,
      previewMode,
      signal,
      onProgress: ({ percent, label }) => progress.report(percent, label),
    });
    await progress.complete('长图生成完成');
    return result;
  } catch (e) {
    if (e.name === 'AbortError') {
      progress.abort();
      throw e;
    }
    progress.fail('长图生成失败，请重试');
    throw e;
  }
}

function showPosterImage(dataUrl) {
  const container = $('#long-preview');
  container.classList.remove('loading', 'poster-generating');
  container.classList.add('poster-fade-in');
  container.innerHTML = `<img src="${dataUrl}" alt="长图预览">`;
}

function getFinalPosterIds() {
  return state.shareVehicleIds.length
    ? state.shareVehicleIds
    : state.currentVehicleId
      ? [state.currentVehicleId]
      : [...state.selectedIds];
}

async function resolvePreviewPosterCacheKey(ids = getFinalPosterIds()) {
  const ctx = await buildPosterCacheContext(ids, api, state);
  return {
    ids,
    cacheKey: buildPosterCacheKey({
      vehicleIds: ids,
      templateId: state.selectedTemplateId,
      previewMode: hdPosterMode(),
      vehicles: ctx.vehicles,
      dealer: ctx.dealer,
    }),
  };
}

function clearPosterPreviewBundle() {
  state.posterPreviewBundle = null;
}

function storePosterPreviewBundle(ids, cacheKey, result, displayUrl) {
  state.posterPreviewBundle = {
    ids,
    templateId: state.selectedTemplateId,
    cacheKey,
    result: { ...result, previewMode: hdPosterMode() },
    displayUrl,
  };
}

async function confirmPosterPublishedIfNeeded(result, ids) {
  if (result?.generationId) {
    markVehiclesPublishedLocally(ids);
    await updateProfile();
    return result.generationId;
  }
  const confirmed = await api.confirmPosterPublished({
    vehicleIds: ids,
    templateId: state.selectedTemplateId,
    width: result?.width,
    height: result?.height,
    fileSize: result?.fileSize,
  });
  result.generationId = confirmed.generationId;
  state.posterGenerationId = confirmed.generationId;
  if (state.posterPreviewBundle?.result) {
    state.posterPreviewBundle.result.generationId = confirmed.generationId;
  }
  markVehiclesPublishedLocally(ids);
  await updateProfile();
  return confirmed.generationId;
}

/** 复用模板页已生成的预览长图；仅切换模板或内容变化后才重新生成 */
async function ensurePosterReady(options = {}) {
  const ids = getFinalPosterIds();
  if (!ids.length) throw new Error('请先选择产品');

  const { cacheKey } = await resolvePreviewPosterCacheKey(ids);

  if (!options.skipCache && state.posterPreviewBundle?.cacheKey === cacheKey) {
    const { result, displayUrl } = state.posterPreviewBundle;
    applyPosterResult(result, { displayUrl });
    state.shareVehicleIds = ids;
    showPosterImage(displayUrl);
    return { ...result, fromCache: true, reused: true };
  }

  if (!options.skipCache) {
    const cached = await readPosterCache(cacheKey);
    if (cached) {
      const result = { ...cacheResultToPayload(cached), previewMode: hdPosterMode() };
      const displayUrl = cached.displayUrl;
      storePosterPreviewBundle(ids, cacheKey, result, displayUrl);
      applyPosterResult(result, { displayUrl });
      state.shareVehicleIds = ids;
      showPosterImage(displayUrl);
      return { ...result, fromCache: true, reused: false };
    }
  }

  if (previewAbortController) previewAbortController.abort();
  const { result, cached, cacheKey: newKey } = await resolvePosterRender({
    vehicleIds: ids,
    templateId: state.selectedTemplateId,
    previewMode: hdPosterMode(),
    signal: options.signal,
    showProgress: options.showProgress !== false,
  });
  const displayUrl = cached?.displayUrl || posterDataUrl(result);
  const posterResult = { ...result, previewMode: hdPosterMode() };
  storePosterPreviewBundle(ids, newKey || cacheKey, posterResult, displayUrl);
  applyPosterResult(posterResult, { displayUrl });
  state.shareVehicleIds = ids;
  showPosterImage(displayUrl);
  await maybeSaveMultiPosterToGallery(ids, state.selectedTemplateId, posterResult, displayUrl);
  await renderGallery();
  return { ...posterResult, fromCache: false, reused: false };
}

async function generatePosterPreview() {
  const ids = state.multiMode && state.selectedIds.size
    ? [...state.selectedIds]
    : state.currentVehicleId
      ? [state.currentVehicleId]
      : [...state.selectedIds];

  if (!ids.length) {
    $('#long-preview').innerHTML = '<div class="empty-state"><p>请先选择或录入产品</p></div>';
    return;
  }

  if (previewAbortController) previewAbortController.abort();
  previewAbortController = new AbortController();
  const { signal } = previewAbortController;

  $('#long-preview').classList.add('loading');
  try {
    const { result, cached, cacheKey } = await resolvePosterRender({
      vehicleIds: ids,
      templateId: state.selectedTemplateId,
      photoLayout: state.selectedPhotoLayout,
      previewMode: hdPosterMode(),
      signal,
    });
    if (signal.aborted) return;
    const displayUrl = cached?.displayUrl || posterDataUrl(result);
    const posterResult = { ...result, previewMode: hdPosterMode() };
    storePosterPreviewBundle(ids, cacheKey, posterResult, displayUrl);
    applyPosterResult(posterResult, { displayUrl });
    state.shareVehicleIds = ids;
    showPosterImage(displayUrl);
    $('#preview-code').textContent = ids.length > 1 ? `共 ${ids.length} 件产品 · 1242px` : '1242px 高清';
    await maybeSaveMultiPosterToGallery(
      ids,
      state.selectedTemplateId,
      posterResult,
      displayUrl
    );
    await renderGallery();
  } catch (e) {
    if (e.name === 'AbortError') return;
    toast('长图生成失败: ' + e.message);
  } finally {
    if (!signal.aborted) {
      $('#long-preview').classList.remove('loading');
    }
  }
}

async function goMultiGenerate() {
  if (!state.selectedIds.size) return;
  state.multiMode = true;
  goTo('page-template');
}

function updateSharePreview() {
  const el = $('#share-poster-preview');
  if (!el) return;
  if (state.posterDataUrl || state.posterUrl) {
    const url = state.posterDataUrl || state.posterUrl;
    el.innerHTML = `<img src="${url}" alt="长图预览">`;
  } else {
    el.innerHTML = '<div class="share-preview-empty">暂无长图，请先在模板页生成</div>';
  }
}

function showShare() {
  updateSharePreview();
  $('#share-overlay').classList.add('show');
  $('#share-panel').classList.add('show');
}

function hideShare() {
  $('#share-overlay').classList.remove('show');
  $('#share-panel').classList.remove('show');
}

function resolvePosterFilenameMeta(ids) {
  const vehicles = ids
    .map((id) => state.vehicles.find((v) => v.id === id))
    .filter(Boolean);
  if (ids.length > 1) {
    return { vehicleCount: ids.length };
  }
  const v = vehicles[0];
  return {
    brandModel: v?.brandModel,
    code: v?.code,
    vehicleCount: 1,
  };
}

async function doShare() {
  const btn = document.querySelector('#share-panel .confirm');
  const prevText = btn?.textContent;
  try {
    const ids = state.shareVehicleIds.length ? state.shareVehicleIds : getFinalPosterIds();
    if (!ids.length) return toast('请先选择产品');
    const copyText = $('#share-text').value;

    if (btn) {
      btn.disabled = true;
      btn.textContent = '准备分享…';
    }

    const result = await ensurePosterReady({ showProgress: false });
    const displayUrl = state.posterDataUrl || state.posterUrl;
    if (!displayUrl) throw new Error('请先在模板页生成长图');

    await confirmPosterPublishedIfNeeded(result, ids);

    if (btn) btn.textContent = '唤起分享…';
    const shared = await sharePosterImage(displayUrl, {
      copyText,
      ...resolvePosterFilenameMeta(ids),
    });

    await api.share({
      vehicleIds: ids,
      copyText,
      shareType: 'long_image_only',
      generationId: state.posterGenerationId,
      isReuse: state.shareReuse,
    });

    hideShare();
    toast(`✅ ${shareResultMessage(shared)}`);
    refreshAll();
  } catch (e) {
    if (e.name !== 'AbortError') toast('分享失败: ' + (e.message || '请重试'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText || '分享到微信';
    }
  }
}

function showDialog(title, msg, cb) {
  $('#dialog-title').textContent = title;
  $('#dialog-msg').textContent = msg;
  $('#dialog-overlay').classList.add('show');
  $('#dialog-confirm-btn').onclick = () => {
    closeDialog();
    cb?.();
  };
}

function closeDialog() {
  $('#dialog-overlay').classList.remove('show');
}

function showPaywall(details = {}) {
  if (isPaidUser()) return;
  const reason = details?.code || details?.reason || state.usage?.blockReason;
  const titleEl = $('#paywall-title');
  const msgEl = $('#paywall-msg');
  if (reason === 'TRIAL_EXPIRED') {
    const days = details?.trialDays || state.usage?.trial?.days || getSystemHint('trialDays') || 20;
    if (titleEl) titleEl.textContent = '免费试用已到期';
    if (msgEl) {
      msgEl.textContent = `您的 ${days} 天免费试用已结束。如需继续发布产品，请付费升级账号。`;
    }
  } else {
    const limit = details?.limit || state.usage?.limit || getSystemHint('productLimit') || 40;
    const current = details?.current ?? state.usage?.used ?? limit;
    if (titleEl) titleEl.textContent = '产品数量已达上限';
    if (msgEl) {
      msgEl.textContent = `您已发布 ${current} 个产品，免费版上限为 ${limit} 个。如需继续发布，请付费升级账号。`;
    }
  }
  $('#paywall-overlay')?.classList.add('show');
}

function hidePaywall() {
  $('#paywall-overlay')?.classList.remove('show');
}

function updateQuotaUI() {
  const quotaEl = $('#product-quota');
  const trialEl = $('#trial-quota');
  if (!state.user || !state.usage) {
    if (quotaEl) {
      quotaEl.textContent = '产品配额：登录后可见';
      quotaEl.classList.remove('warn', 'hidden');
    }
    if (trialEl) {
      trialEl.textContent = '免费试用：登录后可见';
      trialEl.classList.remove('warn', 'ok', 'hidden');
    }
    return;
  }
  if (isPaidUser()) {
    quotaEl?.classList.add('hidden');
    trialEl?.classList.add('hidden');
    return;
  }
  quotaEl?.classList.remove('hidden');
  trialEl?.classList.remove('hidden');
  if (quotaEl) {
    quotaEl.textContent = `产品配额：${state.usage.used} / ${state.usage.limit}`;
    quotaEl.classList.toggle('warn', state.usage.used >= state.usage.limit);
  }
  if (trialEl) {
    const trial = state.usage.trial;
    if (trial?.expired) {
      trialEl.textContent = `免费试用已到期（${trial.days || 20} 天）`;
      trialEl.classList.add('warn');
      trialEl.classList.remove('ok');
    } else {
      const left = trial?.daysRemaining ?? trial?.days ?? 20;
      trialEl.textContent = `免费试用剩余 ${left} 天`;
      trialEl.classList.remove('warn');
      trialEl.classList.toggle('ok', left <= 3);
    }
  }
}

function updateAuthHints() {
  const trialDays = getSystemHint('trialDays') ?? 20;
  const productLimit = getSystemHint('productLimit') ?? 40;
  const loginHint = $('#login-panel')?.querySelector('.dealer-settings-hint');
  if (loginHint) {
    loginHint.textContent = `登录后产品数据相互隔离；免费试用 ${trialDays} 天，最多 ${productLimit} 个产品`;
  }
  if (!state.user) {
    const quotaEl = $('#product-quota');
    if (quotaEl) quotaEl.textContent = `产品配额：— / ${productLimit}`;
  }
}

function renderAuthUI() {
  const loggedIn = !!state.user;
  $('#login-panel')?.classList.toggle('hidden', loggedIn);
  $('#profile-authed')?.classList.toggle('hidden', !loggedIn);
  $('#profile-header')?.classList.toggle('hidden', !loggedIn);
  $('#settings-hub')?.classList.toggle('hidden', !loggedIn || !state.canManageSettings);
  updateAuthHints();
  if (loggedIn) {
    $('#dealer-name').textContent = state.dealer?.shopName || state.dealer?.shop_name || maskAuthPhone(state.user.phone);
    $('#dealer-phone-display').textContent = '📞 ' + maskAuthPhone(state.user.phone);
    updateQuotaUI();
  } else {
    $('#dealer-name').textContent = '未登录';
    $('#dealer-phone-display').textContent = '请先登录后使用';
    updateQuotaUI();
  }
}

async function restoreSession() {
  if (!getToken()) {
    state.user = null;
    state.usage = null;
    return;
  }
  try {
    const me = await api.getMe();
    state.user = me.user;
    state.usage = me.usage;
    state.dealer = me.dealer;
    state.canManageSettings = !!me.canManageSettings;
    await initClientSettings({ force: true });
    renderDealerProfile(state.dealer);
    renderAuthUI();
  } catch {
    clearToken();
    state.user = null;
    state.usage = null;
    renderAuthUI();
  }
}

function startSendCodeCooldown(seconds) {
  const sec = seconds ?? getSystemHint('smsCooldownSec') ?? 60;
  state.sendCodeCooldown = sec;
  const btn = $('#btn-send-code');
  if (!btn) return;
  btn.disabled = true;
  clearInterval(state.sendCodeTimer);
  const tick = () => {
    if (state.sendCodeCooldown <= 0) {
      btn.disabled = false;
      btn.textContent = '获取验证码';
      clearInterval(state.sendCodeTimer);
      return;
    }
    btn.textContent = `${state.sendCodeCooldown}秒`;
    state.sendCodeCooldown -= 1;
  };
  tick();
  state.sendCodeTimer = setInterval(tick, 1000);
}

async function sendLoginCode() {
  const phone = $('#login-phone-input')?.value?.trim();
  if (!phone) return toast('请输入手机号');
  const btn = $('#btn-send-code');
  try {
    btn.disabled = true;
    const result = await api.sendSmsCode(phone);
    toast('验证码已发送');
    if (result.devCode) {
      const hint = $('#login-dev-hint');
      if (hint) {
        hint.textContent = `开发模式验证码：${result.devCode}`;
        hint.classList.remove('hidden');
      }
    }
    startSendCodeCooldown(getSystemHint('smsCooldownSec') || 60);
  } catch (e) {
    toast(e.message === 'INVALID_PHONE' ? '请输入正确的手机号' : '验证码发送失败');
    if (btn) btn.disabled = false;
  }
}

async function doLogin() {
  const phone = $('#login-phone-input')?.value?.trim();
  const code = $('#login-code-input')?.value?.trim();
  if (!phone) return toast('请输入手机号');
  if (!code) return toast('请输入验证码');
  try {
    const result = await api.verifySmsCode(phone, code);
    setToken(result.token);
    state.user = result.user;
    state.usage = result.usage;
    state.dealer = result.dealer || null;
    state.canManageSettings = !!result.canManageSettings;
    renderDealerProfile(state.dealer);
    renderAuthUI();
    await initClientSettings({ force: true });
    toast('登录成功');
    await refreshAll();
  } catch (e) {
    const msg = e.message || e.code;
    if (msg === 'CODE_INVALID') toast('验证码错误或已过期');
    else if (msg === 'INVALID_CODE') toast('请输入6位验证码');
    else toast('登录失败');
  }
}

async function doLogout() {
  try {
    await api.logout().catch(() => {});
  } finally {
    clearToken();
    state.user = null;
    state.usage = null;
    state.dealer = null;
    state.canManageSettings = false;
    state.vehicles = [];
    state.selectedIds.clear();
    renderAuthUI();
    renderDealerProfile(null);
    await refreshAll();
    toast('已退出登录');
  }
}

async function bindEvents() {
  $('#photo-action-overlay')?.addEventListener('click', hidePhotoActionSheet);
  $('#photo-action-cancel')?.addEventListener('click', hidePhotoActionSheet);
  $('#photo-action-replace')?.addEventListener('click', () => {
    if (!photoActionContext) return;
    const { category, slotKey, el } = photoActionContext;
    replacePhotoInSlot(category, slotKey, el);
  });
  $('#photo-action-delete')?.addEventListener('click', () => {
    if (!photoActionContext) return;
    const { category, slotKey, el } = photoActionContext;
    deletePhotoFromSlot(category, slotKey, el);
  });

  $('#btn-new-vehicle').onclick = startNewVehicle;
  $('#btn-upload-next').onclick = () => goStep(state.currentStep + 1);
  $('#btn-batch-all-photos')?.addEventListener('click', pickPhotosForAllSteps);
  $('#btn-upload-done').onclick = finishUpload;
  $('#btn-ai-polish').onclick = doAiPolish;
  $('#desc-input').addEventListener('input', (e) => {
    state.descBody = stripKnownSellingTexts(e.target.value, state.sellingPoints);
    updateDescPreview(e.target.value);
    scheduleDescExtract();
  });
  $('#car-model-input')?.addEventListener('input', () => {
    state.modelTouchedByUser = true;
  });
  $('#btn-use-polished').onclick = () => {
    state.descBody = stripKnownSellingTexts(state.polishedText, state.sellingPoints);
    refreshDescWithSelling();
    toast('✅ 已使用润色版');
  };
  $('#btn-use-original').onclick = () => {
    state.descBody = stripKnownSellingTexts(state.originalText, state.sellingPoints);
    refreshDescWithSelling();
    toast('↩ 已恢复原文');
  };
  $('#btn-polish-again').onclick = doAiPolish;
  $('#btn-desc-next').onclick = saveDescAndNext;
  $('#btn-generate-selling')?.addEventListener('click', () => generateSellingPointsFromDesc());
  $('#btn-desc-skip').onclick = () => {
    state.selectedIds.clear();
    if (state.currentVehicleId) state.selectedIds.add(state.currentVehicleId);
    state.multiMode = false;
    clearPosterPreviewBundle();
    goTo('page-template');
  };
  $('#btn-generate').onclick = goMultiGenerate;
  $('#btn-show-share').onclick = async () => {
    try {
      await ensurePosterReady();
    } catch (e) {
      return toast('长图生成失败: ' + e.message);
    }
    const ids = state.shareVehicleIds.length ? state.shareVehicleIds : [...state.selectedIds];
    if (!ids.length && state.currentVehicleId) ids.push(state.currentVehicleId);
    state.shareVehicleIds = ids;
    state.shareReuse = false;
    const { copyText } = await api.defaultShareCopy(ids);
    $('#share-text').value = copyText;
    showShare();
  };
  $('#btn-save-album').onclick = async () => {
    const btn = $('#btn-save-album');
    const prevText = btn.textContent;
    try {
      btn.disabled = true;
      const ids = getFinalPosterIds();
      if (!ids.length) throw new Error('请先选择产品');
      btn.textContent = '保存中…';
      const result = await ensurePosterReady({ showProgress: false });
      const displayUrl = state.posterDataUrl || state.posterUrl || posterDataUrl(result);
      if (!displayUrl) throw new Error('请先在模板页生成长图');
      await confirmPosterPublishedIfNeeded(result, ids);
      const saved = await savePosterToAlbum(displayUrl, resolvePosterFilenameMeta(ids));
      toast(`✅ ${saveResultMessage(saved)}${result.reused ? '（已复用当前长图）' : ''}`);
      await refreshAll();
    } catch (e) {
      if (e.name !== 'AbortError') toast('保存失败: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  };
  $('#btn-save-gallery').onclick = () => savePosterToGalleryAndGo();
  $('#btn-batch-sell').onclick = () => batchAction('sell');
  $('#btn-batch-del').onclick = () => batchAction('delete');

  $('#btn-refresh-selling')?.addEventListener('click', refreshSellingTags);

  $$('.filter-chip').forEach((chip) => {
    chip.onclick = async () => {
      const filter = mapStatusFilter(chip);
      if (filter === state.currentFilter) {
        await refreshAll();
        return;
      }
      await setVehicleFilter(filter);
    };
  });

  $('#btn-select-all')?.addEventListener('click', toggleSelectAll);

  $('#search-input')?.addEventListener('input', debounce(refreshAll, () => getClientSetting('searchDebounceMs')));

  $('#btn-save-dealer')?.addEventListener('click', saveDealerProfile);
  $('#btn-upload-qrcode')?.addEventListener('click', pickDealerQrcode);
  $('#btn-test-server')?.addEventListener('click', testServerConnection);
  $('#btn-save-server')?.addEventListener('click', saveServerSettings);

  $$('[data-tab]').forEach((tab) => {
    tab.onclick = async () => {
      if (tab.dataset.tab === 'page-upload') {
        const current = $('.screen.active')?.id;
        if (current === 'page-profile') {
          await persistDealerIfNeeded({ silent: true });
        }
        await startNewVehicle();
        return;
      }
      switchTab(tab.dataset.tab);
    };
  });

  $('#btn-send-code')?.addEventListener('click', sendLoginCode);
  $('#btn-login')?.addEventListener('click', doLogin);
  $('#btn-logout')?.addEventListener('click', doLogout);
  $('#paywall-close')?.addEventListener('click', hidePaywall);
  $('#paywall-overlay')?.addEventListener('click', (e) => {
    if (e.target?.id === 'paywall-overlay') hidePaywall();
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.goto));
  });
}

function debounce(fn, msOrGetter) {
  let t;
  return (...args) => {
    clearTimeout(t);
    const ms = typeof msOrGetter === 'function' ? msOrGetter() : msOrGetter;
    t = setTimeout(() => fn(...args), ms);
  };
}

window.syncClientRuntimeSettings = () => {
  clearPosterEmbedCache();
  updateAuthHints();
};

function initListScrollbars() {
  document.querySelectorAll('.list-scroll-shell').forEach((shell) => {
    const panel = shell.querySelector('.list-scroll-panel');
    if (panel) bindListScrollbar(panel, shell);
  });
}

function initSafariFormAdaptation() {
  const isApple = isIOS() || isSafariBrowser();
  if (isApple) document.documentElement.classList.add('is-ios');

  const scrollPanelIds = ['desc-page-scroll', 'car-list-scroll', 'gallery-list-scroll'];
  const refreshScrollPanels = () => {
    scrollPanelIds.forEach((id) => refreshListScrollbar(id));
  };

  const focusScroll = (el) => {
    if (!isApple || !el) return;
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      refreshScrollPanels();
    }, 320);
  };

  document.querySelectorAll(
    '#desc-input, #car-model-input, #login-phone-input, #login-code-input, #server-url-input, ' +
    '.dealer-field, .share-textarea, .settings-page-body input, .settings-page-body textarea, .settings-page-body select'
  ).forEach((el) => {
    el.addEventListener('focus', (e) => focusScroll(e.target));
  });

  const vv = window.visualViewport;
  if (vv && isApple) {
    const syncViewport = () => {
      refreshScrollPanels();
      const kbOffset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--keyboard-offset', `${kbOffset}px`);
    };
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    syncViewport();
  }
}

async function batchAction(action) {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  const names = state.vehicles.filter((c) => ids.includes(c.id)).map((c) => c.brandModel).join('、');
  if (action === 'sell') {
    showDialog('批量标记已售', `确定将以下产品标记为已售？\n${names}`, async () => {
      await api.batchSold(ids);
      state.selectedIds.clear();
      toast('✅ 批量标记已售完成');
      refreshAll();
    });
  } else {
    showDialog('批量删除', `确定删除以下产品？\n${names}`, async () => {
      await api.batchDelete(ids);
      state.selectedIds.clear();
      toast('🗑️ 批量删除完成');
      refreshAll();
    });
  }
}

async function init() {
  hydrateTabIcons();
  renderUploadSteps();
  renderServerSettings();
  bindSettingsPages({ goto: goTo, toast });
  bindUsersAdminPage({ goto: goTo, toast });
  initPwa();
  initListScrollbars();
  initSafariFormAdaptation();
  await bindEvents();
  await initClientSettings();
  updateAuthHints();
  await restoreSession();
  if (!state.user) renderAuthUI();
  if (state.user) await refreshAll();
  const health = await api.health();
  console.log('App ready', health, getServerBase() || 'same-origin');
}

init().catch((e) => {
  console.error(e);
  toast('启动失败，请确认服务已运行');
});

// globals for inline handlers fallback
window.hideShare = hideShare;
window.hidePosterPreview = hidePosterPreview;
window.doShare = doShare;
window.showCompareTab = showCompareTab;
window.closeDialog = closeDialog;
window.hidePaywall = hidePaywall;
