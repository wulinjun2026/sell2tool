import { mapWithConcurrency } from './asyncUtils.js';
import { decodeImageSource, imageToDataUri, resolveAssetImageUrl } from './imageClientUtils.js';
import { getClientSetting, getEmbedConcurrency } from './clientSettings.js';

const HREF_RE = /(?:href|xlink:href)="([^"]+)"/g;
const embedCache = new Map();

function embedCacheMax() {
  return getClientSetting('embedCacheMax');
}

function isQrcodeUrl(url, qrcodeUrl) {
  if (!qrcodeUrl) return false;
  return url === qrcodeUrl || url.endsWith(qrcodeUrl) || qrcodeUrl.endsWith(url);
}

function cacheEmbed(key, value) {
  const max = embedCacheMax();
  if (embedCache.size >= max) {
    const first = embedCache.keys().next().value;
    if (first) embedCache.delete(first);
  }
  embedCache.set(key, value);
}

function embedCacheKey(url, embed, asQr) {
  const maxEdge = asQr ? (embed.qrcodeTargetPixels || 768) : (embed.maxEdge || 2880);
  const quality = embed.quality ?? 0.93;
  return `${url}|${maxEdge}|${quality}|${asQr ? 'qr' : 'photo'}`;
}

async function embedOneUrl(url, embed, qrcodeUrl) {
  if (!url || url.startsWith('data:')) return url;
  const asQr = isQrcodeUrl(url, qrcodeUrl);
  const cacheKey = embedCacheKey(url, embed, asQr);
  if (embedCache.has(cacheKey)) return embedCache.get(cacheKey);

  const full = resolveAssetImageUrl(url);
  const source = await decodeImageSource(full);
  const maxEdge = asQr ? (embed.qrcodeTargetPixels || 768) : (embed.maxEdge || 2880);
  const dataUri = imageToDataUri(source, {
    maxEdge,
    quality: embed.quality ?? 0.93,
    png: asQr,
    nearest: asQr,
  });
  cacheEmbed(cacheKey, dataUri);
  return dataUri;
}

/** 将 SVG 中的 /uploads 图片 URL 在本地压缩并内嵌为 data URI（并行加载） */
export async function embedImagesInSvg(svgDoc, embed = {}, qrcodeUrl = null, options = {}) {
  const { onProgress } = options;
  const urls = [...svgDoc.matchAll(HREF_RE)]
    .map((m) => m[1])
    .filter((u) => u && !u.startsWith('data:'));
  const unique = [...new Set(urls)];
  if (!unique.length) {
    onProgress?.({ done: 0, total: 0 });
    return svgDoc;
  }

  const concurrency = getEmbedConcurrency();
  let finished = 0;
  const pairs = await mapWithConcurrency(unique, concurrency, async (url) => {
    const dataUri = await embedOneUrl(url, embed, qrcodeUrl);
    finished += 1;
    onProgress?.({ done: finished, total: unique.length });
    return [url, dataUri];
  });
  const map = new Map(pairs);

  let out = svgDoc;
  for (const [from, to] of map) {
    out = out.split(`"${from}"`).join(`"${to}"`);
  }
  return out;
}

export function clearPosterEmbedCache() {
  embedCache.clear();
}
