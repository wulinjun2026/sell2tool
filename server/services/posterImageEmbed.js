const fs = require('fs');
const path = require('path');
const { getImageDimensions } = require('./imageMeta');

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const embedCache = new Map();
const CACHE_MAX = 80;

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function mapWithConcurrency(items, limit, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function trimCache() {
  if (embedCache.size <= CACHE_MAX) return;
  const drop = embedCache.size - CACHE_MAX;
  const keys = embedCache.keys();
  for (let i = 0; i < drop; i += 1) {
    const { value } = keys.next();
    if (value) embedCache.delete(value);
  }
}

async function fileToDataUri(filePath, {
  maxEdge = 0,
  quality = 82,
  chromaSubsampling = '4:2:0',
  fastShrinkOnLoad = true,
  resizeKernel,
} = {}) {
  const stat = fs.statSync(filePath);
  const cacheKey = `${filePath}:${stat.mtimeMs}:${maxEdge}:${quality}:${chromaSubsampling}:${fastShrinkOnLoad}:${resizeKernel || 'default'}`;
  if (embedCache.has(cacheKey)) return embedCache.get(cacheKey);

  let buf;
  let mime;
  if (sharp && maxEdge > 0) {
    const dim = getImageDimensions(filePath);
    const nativeMax = dim ? Math.max(dim.width, dim.height) : maxEdge;
    const targetEdge = Math.min(maxEdge, nativeMax > 0 ? nativeMax : maxEdge);
    const resizeOpts = {
      width: targetEdge,
      height: targetEdge,
      fit: 'inside',
      withoutEnlargement: true,
      fastShrinkOnLoad,
    };
    if (resizeKernel && sharp.kernel?.[resizeKernel]) {
      resizeOpts.kernel = sharp.kernel[resizeKernel];
    } else if (!fastShrinkOnLoad && sharp.kernel?.lanczos3) {
      resizeOpts.kernel = sharp.kernel.lanczos3;
    }
    buf = await sharp(filePath, { failOn: 'none' })
      .rotate()
      .resize(resizeOpts)
      .jpeg({ quality, mozjpeg: true, chromaSubsampling, trellisQuantisation: !fastShrinkOnLoad })
      .toBuffer();
    mime = 'image/jpeg';
  } else {
    buf = fs.readFileSync(filePath);
    mime = mimeFromExt(filePath);
  }

  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  embedCache.set(cacheKey, dataUri);
  trimCache();
  return dataUri;
}

/**
 * 二维码专用：PNG 无损 + 最近邻缩放，保证长图内可扫描识别
 * @param {number} targetPixels 嵌入 SVG 前的目标边长（建议 ≥ 显示尺寸 × 导出倍率 × 4）
 */
async function fileToQrcodeDataUri(filePath, { targetPixels = 480 } = {}) {
  const stat = fs.statSync(filePath);
  const cacheKey = `qr:${filePath}:${stat.mtimeMs}:${targetPixels}`;
  if (embedCache.has(cacheKey)) return embedCache.get(cacheKey);

  let buf;
  let mime = 'image/png';
  const dim = getImageDimensions(filePath);
  const nativeMax = dim ? Math.max(dim.width, dim.height) : 0;
  const edge = Math.max(targetPixels, nativeMax > 0 && nativeMax < targetPixels ? targetPixels : Math.min(nativeMax || targetPixels, targetPixels * 2));

  if (sharp) {
    buf = await sharp(filePath)
      .rotate()
      .resize({
        width: edge,
        height: edge,
        fit: 'inside',
        kernel: sharp.kernel.nearest,
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 6, adaptiveFiltering: false })
      .toBuffer();
  } else {
    buf = fs.readFileSync(filePath);
    mime = mimeFromExt(filePath);
  }

  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  embedCache.set(cacheKey, dataUri);
  trimCache();
  return dataUri;
}

function clearEmbedCache() {
  embedCache.clear();
}

module.exports = {
  fileToDataUri,
  fileToQrcodeDataUri,
  clearEmbedCache,
  mimeFromExt,
  mapWithConcurrency,
};
