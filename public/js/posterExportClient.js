import { loadImage } from './imageClientUtils.js';

/** 移动端将 SVG 栅格化为 PNG Blob（不经过服务器） */
export async function svgToPngBlob(svgDoc, exportWidth) {
  const blob = new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const srcW = img.naturalWidth || exportWidth;
    const srcH = img.naturalHeight || exportWidth;
    const scale = exportWidth / srcW;
    const width = exportWidth;
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG_EXPORT_FAILED'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
