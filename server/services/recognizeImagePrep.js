const sharp = require('sharp');

async function prepareForRecognition(filePath, { purpose = 'baidu', category, slotKey } = {}) {
  let pipeline = sharp(filePath).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  const cropExterior = process.env.RECOGNIZE_CROP_EXTERIOR !== 'false';
  if (cropExterior && category === 'exterior' && width > 240 && height > 240) {
    const cropW = Math.round(width * 0.9);
    const cropH = Math.round(height * 0.86);
    const left = Math.max(0, Math.round((width - cropW) / 2));
    const top = Math.max(0, Math.round((height - cropH) * 0.1));
    pipeline = pipeline.extract({
      left,
      top,
      width: Math.min(cropW, width - left),
      height: Math.min(cropH, height - top),
    });
  }

  const maxSize = purpose === 'baidu'
    ? parseInt(process.env.RECOGNIZE_BAIDU_MAX_PX || '1600', 10)
    : 1024;

  return pipeline
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .modulate({ brightness: 1.03, saturation: 1.06 })
    .sharpen({ sigma: 0.9 })
    .jpeg({ quality: purpose === 'baidu' ? 90 : 82 })
    .toBuffer();
}

module.exports = {
  prepareForRecognition,
};
