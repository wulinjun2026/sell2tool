import { isNativeApp } from './config.js';
import { isIOS, isSafariBrowser, supportsWebShareFiles } from './browser.js';

export async function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime === 'image/png' ? 'image/png' : mime });
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (blob.type === 'image/png') return blob;
  return new Blob([blob], { type: 'image/png' });
}

function sanitizeFilenamePart(text, maxLen = 28) {
  return String(text || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .slice(0, maxLen);
}

function buildTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 生成本地保存/下载用的中文 PNG 文件名 */
export function buildPosterFilename({ brandModel, vehicleCount = 1, code } = {}) {
  const stamp = buildTimestamp();
  let label;
  if (vehicleCount > 1) {
    label = `多件合集${vehicleCount}件`;
  } else {
    label = sanitizeFilenamePart(brandModel)
      || sanitizeFilenamePart(code?.replace(/^CC/i, ''))
      || '产品';
  }
  return `产品长图_${label}_${stamp}.png`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function copyShareText(text) {
  const value = (text || '').trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function saveViaDownload(blob, filename) {
  if (isIOS()) return null;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true, method: 'download' };
}

/**
 * 仅分享 PNG 文件，绝不携带 url/title，避免浏览器把网页链接发到微信。
 */
async function shareViaWebShare(blob, filename) {
  if (!navigator.share) return null;
  const file = new File([blob], filename, { type: 'image/png' });
  const payload = { files: [file] };
  if (navigator.canShare) {
    try {
      if (!navigator.canShare(payload) && !isIOS()) return null;
    } catch {
      if (!isIOS()) return null;
    }
  } else if (!isIOS()) {
    return null;
  }
  await navigator.share(payload);
  return { ok: true, method: 'share' };
}

async function shareViaCapacitor(blob, filename) {
  if (!isNativeApp() || !window.Capacitor?.Plugins) return null;
  const { Filesystem, Share } = window.Capacitor.Plugins;
  if (!Filesystem?.writeFile || !Share?.share) return null;

  const base64 = await blobToBase64(blob);
  const cachePath = `share/${filename}`;
  await Filesystem.writeFile({
    path: cachePath,
    data: base64,
    directory: Filesystem.Directory?.Cache || 'CACHE',
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({
    path: cachePath,
    directory: Filesystem.Directory?.Cache || 'CACHE',
  });
  await Share.share({
    files: [uri],
    dialogTitle: '分享长图到微信',
  });
  return { ok: true, method: 'share' };
}

async function saveViaCapacitorFilesystem(blob, filename) {
  if (!isNativeApp() || !window.Capacitor?.Plugins?.Filesystem) return null;
  const { Filesystem, Directory } = window.Capacitor.Plugins.Filesystem;
  const base64 = await blobToBase64(blob);
  const path = `Pictures/UsedCarAssistant/${filename}`;
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory?.ExternalStorage || Directory?.External || 'EXTERNAL',
    recursive: true,
  });
  return { ok: true, method: 'album', path };
}

function getOverlayCopy(mode, { copied, copyText } = {}) {
  const isSave = mode === 'save';
  const safariTip = isIOS()
    ? (isSave
      ? 'Safari 不支持直接下载文件。请长按下方长图，选择「添加到照片」或「存储图像」。'
      : 'Safari 请长按下方长图保存到相册，再打开微信选择该图片发布。')
    : (isSave
      ? '当前浏览器不支持直接保存，请右键或长按图片保存。'
      : '当前浏览器不支持直接分享图片，请长按下方长图保存到相册，再打开微信朋友圈选择该图片发布。');
  return {
    title: isSave ? '保存长图到相册' : '保存长图后分享到朋友圈',
    tip: safariTip,
    copiedHint: copied && copyText ? '分享文案已复制，可在朋友圈粘贴。' : '',
  };
}

function showImageSaveOverlay(dataUrl, { mode = 'share', copied = false, copyText = '' } = {}) {
  const existing = document.getElementById('share-image-fallback');
  if (existing) existing.remove();

  const { title, tip, copiedHint } = getOverlayCopy(mode, { copied, copyText });
  const overlay = document.createElement('div');
  overlay.id = 'share-image-fallback';
  overlay.className = 'share-image-fallback';
  overlay.innerHTML = `
    <div class="share-image-fallback-panel">
      <h3>${title}</h3>
      <p class="share-image-fallback-tip">${tip}</p>
      ${copiedHint ? `<p class="share-image-fallback-copy">${copiedHint}</p>` : ''}
      <div class="share-image-fallback-img-wrap">
        <img src="${dataUrl}" alt="产品长图" class="share-image-save-target">
      </div>
      <button type="button" class="share-image-fallback-close">我知道了</button>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('.share-image-fallback-close')?.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function iosSaveFallback(dataUrl) {
  showImageSaveOverlay(dataUrl, { mode: 'save' });
  return { ok: true, method: 'ios-save' };
}

/**
 * 分享长图 PNG 到微信（优先系统分享面板传图片文件，禁止分享网页链接）
 */
export async function sharePosterImage(dataUrl, { filename, copyText, brandModel, vehicleCount, code } = {}) {
  if (!dataUrl) throw new Error('NO_POSTER');
  const name = filename || buildPosterFilename({ brandModel, vehicleCount, code });
  const blob = await dataUrlToBlob(dataUrl);
  const copied = await copyShareText(copyText);

  try {
    const nativeShared = await shareViaCapacitor(blob, name);
    if (nativeShared) return { ...nativeShared, copied };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  try {
    const shared = await shareViaWebShare(blob, name);
    if (shared) return { ...shared, copied };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  if (!saveViaDownload(blob, name)) {
    showImageSaveOverlay(dataUrl, { mode: 'share', copied, copyText });
    return { ok: true, method: isIOS() ? 'ios-save' : 'fallback', copied };
  }
  showImageSaveOverlay(dataUrl, { mode: 'share', copied, copyText });
  return { ok: true, method: 'fallback', copied };
}

/**
 * 保存长图到本地相册（优先系统分享/相册，其次下载）
 */
export async function savePosterToAlbum(dataUrl, { filename, brandModel, vehicleCount, code } = {}) {
  if (!dataUrl) throw new Error('NO_POSTER');
  const name = filename || buildPosterFilename({ brandModel, vehicleCount, code });
  const blob = await dataUrlToBlob(dataUrl);

  try {
    const shared = await shareViaWebShare(blob, name);
    if (shared) return shared;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  try {
    const saved = await saveViaCapacitorFilesystem(blob, name);
    if (saved) return saved;
  } catch {
    /* fallback below */
  }

  const downloaded = saveViaDownload(blob, name);
  if (downloaded) return downloaded;
  return iosSaveFallback(dataUrl);
}

export function saveResultMessage(result) {
  if (result.method === 'share') {
    return isIOS()
      ? '请在分享面板选择「存储到照片」或「微信」'
      : '请在分享面板中选择「微信」或「保存到相册」';
  }
  if (result.method === 'album') return '长图已保存到相册';
  if (result.method === 'ios-save') return '请长按图片，选择「添加到照片」保存';
  return '长图已保存到本机（下载目录，可在相册/文件中查看）';
}

export function shareResultMessage(result) {
  if (result.method === 'share') {
    return result.copied
      ? '请在分享面板选择微信；文案已复制，可在朋友圈粘贴'
      : '请在分享面板选择微信，发送 PNG 长图';
  }
  if (result.method === 'fallback' || result.method === 'ios-save') {
    return result.copied
      ? '请按提示长按保存图片；文案已复制'
      : (isIOS() ? '请长按图片保存到相册后再分享' : '长图已下载，请按提示保存图片后分享到朋友圈');
  }
  return saveResultMessage(result);
}

export { isSafariBrowser, supportsWebShareFiles };
