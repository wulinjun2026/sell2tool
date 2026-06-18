import { mapWithConcurrency } from './asyncUtils.js';
import {
  decodeImageSource,
  imageToBlob,
  loadImageFromFile,
  readImageDimensions,
} from './imageClientUtils.js';
import { getClientSetting, skipJpegMaxBytes } from './clientSettings.js';

function shouldSkipReencode(file, maxEdge) {
  if (file.type !== 'image/jpeg') return false;
  if (file.size > skipJpegMaxBytes()) return false;
  return readImageDimensions(file).then((dims) => {
    if (!dims) return false;
    return Math.max(dims.w, dims.h) <= maxEdge;
  });
}

/** 上传前在本地压缩照片，服务器仅存储文件；已符合尺寸的高质量 JPEG 跳过二次压缩 */
export async function compressPhotoForUpload(file, { maxEdge, quality } = {}) {
  const edge = maxEdge ?? getClientSetting('uploadMaxEdge');
  const q = quality ?? getClientSetting('uploadQuality');
  if (!file?.type?.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;
  if (await shouldSkipReencode(file, edge)) return file;

  const source = await decodeImageSource(file instanceof File ? file : file);
  const blob = await imageToBlob(source, { maxEdge: edge, quality: q });
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/** 批量并行压缩（限制并发，避免占满内存） */
export async function compressPhotosForUpload(files, options = {}) {
  const limit = options.concurrency || 4;
  return mapWithConcurrency(files, limit, (file) => compressPhotoForUpload(file, options));
}

/** 二维码上传：保持 PNG，适度缩放 */
export async function compressQrcodeForUpload(file, { maxEdge = 1024 } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  const source = file instanceof File
    ? await decodeImageSource(file)
    : await loadImageFromFile(file);
  const blob = await imageToBlob(source, { maxEdge, png: true, nearest: true });
  const base = (file.name || 'qrcode').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.png`, { type: 'image/png', lastModified: Date.now() });
}
