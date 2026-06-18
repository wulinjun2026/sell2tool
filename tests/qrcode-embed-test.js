/**
 * 二维码嵌入：PNG + 最近邻，避免 JPEG 模糊导致无法扫描
 */
const fs = require('fs');
const path = require('path');
const { fileToDataUri, fileToQrcodeDataUri, clearEmbedCache } = require('../server/services/posterImageEmbed');

const ROOT = path.join(__dirname, '..');
const sampleQr = path.join(ROOT, 'assets', 'fixtures', 'sample_qrcode.png');

async function run() {
  clearEmbedCache();
  const photoUri = await fileToDataUri(sampleQr, { maxEdge: 400, quality: 82 });
  const qrUri = await fileToQrcodeDataUri(sampleQr, { targetPixels: 480 });

  const photoIsJpeg = photoUri.startsWith('data:image/jpeg');
  const qrIsPng = qrUri.startsWith('data:image/png');
  const qrLen = qrUri.length;
  const photoLen = photoUri.length;

  console.log(photoIsJpeg ? '✓ 普通图仍走 JPEG 压缩' : '✗ 普通图格式异常');
  console.log(qrIsPng ? '✓ 二维码使用 PNG 嵌入' : '✗ 二维码未使用 PNG');
  console.log(qrLen >= photoLen * 0.5 ? '✓ 二维码保留足够像素信息' : '✗ 二维码嵌入过小');

  process.exit(photoIsJpeg && qrIsPng && qrLen > 1000 ? 0 : 1);
}

run().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
