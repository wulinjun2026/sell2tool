import { assetUrl } from './config.js';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    img.src = src;
  });
}

export function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  return loadImage(url).finally(() => URL.revokeObjectURL(url));
}

export async function readImageDimensions(file) {
  if (!file) return null;
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { w: bitmap.width, h: bitmap.height };
      bitmap.close?.();
      return dims;
    } catch {
      /* fallback */
    }
  }
  const img = await loadImageFromFile(file);
  return {
    w: img.naturalWidth || img.width,
    h: img.naturalHeight || img.height,
  };
}

function scaledSize(w, h, maxEdge) {
  if (!w || !h) throw new Error('INVALID_IMAGE');
  if (!maxEdge || maxEdge <= 0) return { w, h };
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

function drawSourceToCanvas(ctx, source, width, height) {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    ctx.drawImage(source, 0, 0, width, height);
    source.close?.();
    return;
  }
  ctx.drawImage(source, 0, 0, width, height);
}

function createDrawCanvas(source, { maxEdge = 0, nearest = false } = {}) {
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  const { w, h } = scaledSize(srcW, srcH, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (nearest) ctx.imageSmoothingEnabled = false;
  drawSourceToCanvas(ctx, source, w, h);
  return canvas;
}

export function imageToDataUri(img, { maxEdge = 0, quality = 0.9, png = false, nearest = false } = {}) {
  const canvas = createDrawCanvas(img, { maxEdge, nearest });
  if (png || nearest) return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', quality);
}

export function imageToBlob(img, { maxEdge = 0, quality = 0.9, png = false, nearest = false } = {}) {
  const canvas = createDrawCanvas(img, { maxEdge, nearest });
  const mime = png || nearest ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('IMAGE_ENCODE_FAILED'));
    }, mime, png || nearest ? undefined : quality);
  });
}

export async function decodeImageSource(source) {
  if (typeof createImageBitmap === 'function') {
    try {
      if (source instanceof Blob) {
        return await createImageBitmap(source);
      }
      if (typeof source === 'string') {
        const res = await fetch(source);
        const blob = await res.blob();
        return await createImageBitmap(blob);
      }
    } catch {
      /* fallback */
    }
  }
  if (typeof source === 'string') return loadImage(source);
  if (source instanceof Blob) return loadImageFromFile(source);
  return source;
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function resolveAssetImageUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  return assetUrl(url);
}
