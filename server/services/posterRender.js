const fs = require('fs');
const path = require('path');
const { ROOT, vehicleDir, UPLOADS_DIR } = require('../db');
const { svgToPng } = require('./posterExport');
const { getExportFontFamily } = require('./posterFonts');
const { isUsableRasterImage } = require('./imageMeta');
const { fileToDataUri, fileToQrcodeDataUri, mimeFromExt, mapWithConcurrency } = require('./posterImageEmbed');
const {
  sanitizePosterText,
  renderTextTag,
  renderPhoneText,
  renderCodeText,
  validatePosterSvg,
} = require('./posterText');

const layoutCache = new Map();

let activeRenderContext = {
  previewMode: false,
  embedMap: null,
};

function withRenderContext(ctx, fn) {
  const prev = activeRenderContext;
  activeRenderContext = { ...prev, ...ctx };
  try {
    return fn();
  } finally {
    activeRenderContext = prev;
  }
}

const GRADIENT_FALLBACKS = {
  simple: ['#07C160', '#95EC69'],
  business: ['#0052D9', '#6AA1FF'],
  sport: ['#FF8F1F', '#FFC069'],
};

/** 长图中间文字区块不渲染，仅保留底部 footer_cta */
const SKIP_TEXT_BLOCKS = new Set([
  'vehicle_title',
  'selling_points',
  'specs_table',
  'price_tag',
  'cover_header',
]);

function shouldRenderBlock(block, vehicle) {
  if (SKIP_TEXT_BLOCKS.has(block.type)) return false;
  if (block.type === 'vehicle_description') return !!getVehicleDescription(vehicle);
  if (block.type === 'photo_grid') return getGridPhotos(vehicle, block.bind).length > 0;
  return true;
}

function resolveDealerBind(bind, dealer) {
  if (bind == null) return '';
  if (typeof bind === 'object') {
    if (bind.literal != null) return bind.literal;
    if (bind.template) return bind.template;
    return '';
  }
  if (typeof bind === 'string') {
    const map = {
      'dealerProfile.shopName': dealer?.shop_name || dealer?.shopName,
      'dealerProfile.contactPhone': dealer?.contact_phone || dealer?.contactPhone,
      'dealerProfile.contactWechat': dealer?.contact_wechat || dealer?.contactWechat,
      'dealerProfile.qrcodePath': dealer?.qrcode_path || dealer?.qrcodePath,
    };
    return map[bind] ?? '';
  }
  return '';
}

function resolveBlockTextColor(theme, block, { preferTitleColor = false } = {}) {
  if (block?.style?.textColor) return block.style.textColor;
  if (preferTitleColor && block?.style?.titleColor) return block.style.titleColor;
  return theme.textPrimary || theme.primaryColor || '#1A1A1A';
}

function renderQrcodePlaceholder(qrX, qrY, qrSize, fill = '#999999') {
  const cx = qrX + qrSize / 2;
  const cy = qrY + qrSize / 2;
  return `
    <rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="8" fill="#FFFFFF" stroke="#CCCCCC" stroke-width="2" stroke-dasharray="8 6"/>
    ${renderTextTag({ x: cx, y: cy - 6, text: '请上传', fill, fontSize: 16, anchor: 'middle' })}
    ${renderTextTag({ x: cx, y: cy + 18, text: '微信二维码', fill, fontSize: 16, anchor: 'middle' })}
  `;
}
function loadLayout(templateId) {
  if (layoutCache.has(templateId)) return layoutCache.get(templateId);
  const layoutPath = path.join(ROOT, 'assets', 'templates', `${templateId}.json`);
  if (!fs.existsSync(layoutPath)) throw new Error('TEMPLATE_INVALID');
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  layoutCache.set(templateId, layout);
  return layout;
}

function getPadding(block) {
  return block.padding || { top: 0, right: 0, bottom: 0, left: 0 };
}

function getHeroImage(vehicle, bind) {
  const photos = vehicle.photos || [];
  if (bind?.imageSource?.slot) {
    const [cat, key] = bind.imageSource.slot.split('.');
    const found = photos.find((p) => p.category === cat && p.slotKey === key);
    if (found) return found.url || found.filePath;
  }
  if (photos.length) return photos[0].url || photos[0].filePath;
  return null;
}

const { buildPosterDescription } = require('./descCompose');

function getVehicleDescription(vehicle) {
  return sanitizePosterText(buildPosterDescription(vehicle));
}

function wrapTextLines(text, maxWidth, fontSize) {
  if (!text) return [];
  const charsPerLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.95)));
  const lines = [];
  const paragraphs = text.split(/\n+/);
  paragraphs.forEach((para) => {
    let line = '';
    for (const ch of para) {
      if (line.length >= charsPerLine) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) lines.push(line);
  });
  return lines;
}

function getGridPhotos(vehicle, bind) {
  const photos = vehicle.photos || [];
  const heroSrc = getHeroImage(vehicle, { imageSource: { slot: 'exterior.front', fallback: 'any' } });
  const heroPath = heroSrc ? resolvePhotoPath(heroSrc) : null;

  let list = photos;
  if (bind?.photos?.excludeSlot) {
    const [cat, key] = bind.photos.excludeSlot.split('.');
    list = list.filter((p) => !(p.category === cat && p.slotKey === key));
  }

  let paths = list.map((p) => p.url || p.filePath).filter(Boolean);

  if (heroPath) {
    paths = paths.filter((p) => resolvePhotoPath(p) !== heroPath);
  }

  // 仅当模板显式配置 maxCount 时才限制；预览与正式导出均展示全部实拍（除主图外）
  const maxCount = bind?.photos?.maxCount;
  if (typeof maxCount === 'number' && maxCount > 0) {
    paths = paths.slice(0, maxCount);
  }
  return paths;
}

function toImageHref(src) {
  if (!src) return null;
  if (src.startsWith('http') || src.startsWith('/')) return src;
  return `/uploads/${src.split('uploads/').pop()}`;
}

function resolvePhotoPath(src) {
  if (!src) return null;
  if (typeof src === 'object') src = src.filePath || src.url;
  if (!src) return null;
  if (path.isAbsolute(src) && fs.existsSync(src)) return src;

  let rel;
  if (src.startsWith('/uploads/')) {
    rel = src.slice('/uploads/'.length);
  } else if (src.includes('uploads/')) {
    rel = src.split('uploads/').pop();
  } else if (src.includes(`${path.sep}uploads${path.sep}`)) {
    rel = src.split(`${path.sep}uploads${path.sep}`).pop();
  } else {
    rel = src;
  }

  const filePath = path.join(UPLOADS_DIR, rel.split('/').join(path.sep));
  return fs.existsSync(filePath) ? filePath : null;
}

/** 内嵌 base64，优先使用预加载缓存 */
function toEmbeddedImage(src) {
  const filePath = resolvePhotoPath(src);
  if (!filePath) return null;
  const cached = activeRenderContext.embedMap?.get(filePath);
  if (cached) return cached;
  try {
    const buf = fs.readFileSync(filePath);
    return `data:${mimeFromExt(filePath)};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function collectPhotoGridBinds(layout) {
  const binds = [];
  (layout.blocks || []).forEach((b) => {
    if (b.type === 'photo_grid') binds.push(b.bind || {});
  });
  if (layout.multiVehicle?.vehicleBlockTemplate) {
    layout.multiVehicle.vehicleBlockTemplate.forEach((b) => {
      if (b.type === 'photo_grid') binds.push(b.bind || {});
    });
  }
  return binds.length ? binds : [{ photos: {} }];
}

function collectEmbedPaths(vehicles, dealer, layout) {
  const paths = new Set();
  const gridBinds = collectPhotoGridBinds(layout);

  vehicles.forEach((vehicle) => {
    const hero = getHeroImage(vehicle, { imageSource: { slot: 'exterior.front', fallback: 'any' } });
    const heroPath = resolvePhotoPath(hero);
    if (heroPath) paths.add(heroPath);

    (layout.blocks || []).forEach((b) => {
      if (b.type === 'hero_image') {
        const img = getHeroImage(vehicle, b.bind);
        const fp = resolvePhotoPath(img);
        if (fp) paths.add(fp);
      }
    });

    gridBinds.forEach((bind) => {
      getGridPhotos(vehicle, bind).forEach((p) => {
        const fp = resolvePhotoPath(p);
        if (fp) paths.add(fp);
      });
    });
  });

  const qrcodeSrc = dealer?.qrcode_path || dealer?.qrcodePath;
  const qrcodePath = resolvePhotoPath(qrcodeSrc);
  if (qrcodePath && isUsableRasterImage(qrcodePath, 32)) paths.add(qrcodePath);

  return [...paths];
}

function resolveExportWidth(layout, previewMode, canvasWidth) {
  if (previewMode) return layout.canvas?.previewExportWidth || 375;
  return layout.canvas?.exportMaxWidth || canvasWidth;
}

function getMaxPhotoDisplayEdge(layout) {
  const canvasWidth = layout.canvas?.width || 750;
  let maxEdge = 320;

  const scanBlocks = (blocks) => {
    (blocks || []).forEach((block) => {
      const pad = block.padding || {};
      const contentW = canvasWidth - (pad.left ?? 32) - (pad.right ?? 32);
      if (block.type === 'hero_image') {
        const h = typeof block.height === 'number' ? block.height : 420;
        maxEdge = Math.max(maxEdge, contentW, h);
      }
      if (block.type === 'photo_grid') {
        const cols = block.style?.columns || 2;
        const gap = block.style?.gap || 12;
        const cellW = (contentW - gap * (cols - 1)) / cols;
        const ratio = block.style?.cellAspectRatio === '4:3' ? 0.75 : 0.75;
        maxEdge = Math.max(maxEdge, cellW, cellW * ratio);
      }
    });
  };

  scanBlocks(layout.blocks);
  if (layout.multiVehicle) {
    scanBlocks(layout.multiVehicle.vehicleBlockTemplate);
    scanBlocks(layout.multiVehicle.headerBlocks);
  }
  return maxEdge;
}

function resolveEmbedMaxEdge(layout, previewMode, exportWidth) {
  const canvasWidth = layout.canvas?.width || 750;
  if (previewMode) return layout.canvas?.previewImageMaxEdge || 480;
  if (layout.canvas?.exportImageMaxEdge) return layout.canvas.exportImageMaxEdge;
  const scale = exportWidth / canvasWidth;
  const displayEdge = getMaxPhotoDisplayEdge(layout);
  return Math.min(3200, Math.max(1920, Math.ceil(displayEdge * scale * 2)));
}

async function preparePosterEmbeds(vehicles, dealer, layout, { previewMode = false, exportWidth } = {}) {
  const canvasWidth = layout.canvas?.width || 750;
  const resolvedExportWidth = exportWidth || resolveExportWidth(layout, previewMode, canvasWidth);
  const maxEdge = resolveEmbedMaxEdge(layout, previewMode, resolvedExportWidth);
  const quality = previewMode ? 72 : 93;
  const embedConcurrency = previewMode ? 8 : 6;
  let filePaths = [];
  withRenderContext({ previewMode }, () => {
    filePaths = collectEmbedPaths(vehicles, dealer, layout);
  });

  const qrcodeSrc = dealer?.qrcode_path || dealer?.qrcodePath;
  const qrcodeFile = resolvePhotoPath(qrcodeSrc);
  const qrTarget = getQrcodeTargetPixels(layout, previewMode, resolvedExportWidth);
  const photoPaths = filePaths.filter((fp) => fp !== qrcodeFile);

  const embedMap = new Map();
  const photoUris = await mapWithConcurrency(photoPaths, embedConcurrency, (fp) =>
    fileToDataUri(fp, {
      maxEdge,
      quality,
      chromaSubsampling: previewMode ? '4:2:0' : '4:4:4',
      fastShrinkOnLoad: previewMode,
    })
  );
  photoPaths.forEach((fp, i) => embedMap.set(fp, photoUris[i]));

  if (qrcodeFile && isUsableRasterImage(qrcodeFile, 32)) {
    embedMap.set(qrcodeFile, await fileToQrcodeDataUri(qrcodeFile, { targetPixels: qrTarget }));
  }
  return embedMap;
}

function svgImageTag(dataUri, x, y, w, h, extra = '') {
  return `<image href="${dataUri}" xlink:href="${dataUri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" ${extra}/>`;
}

function svgQrcodeTag(dataUri, x, y, size) {
  return `<image href="${dataUri}" xlink:href="${dataUri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** 二维码需达到最小尺寸，避免 1x1 占位图被放大成纯色块 */
function toEmbeddedQrcode(src) {
  const filePath = resolvePhotoPath(src);
  if (!filePath || !isUsableRasterImage(filePath, 32)) return null;
  const cached = activeRenderContext.embedMap?.get(filePath);
  if (cached) return cached;
  return toEmbeddedImage(src);
}

function getMaxQrcodeDisplaySize(layout) {
  let max = 120;
  const scan = (blocks) => {
    (blocks || []).forEach((b) => {
      if (b.type === 'footer_cta' && b.style?.qrcodeSize) {
        max = Math.max(max, b.style.qrcodeSize);
      }
    });
  };
  scan(layout.blocks);
  if (layout.multiVehicle) {
    scan(layout.multiVehicle.footerBlocks);
    scan(layout.multiVehicle.vehicleBlockTemplate);
  }
  return max;
}

function getQrcodeTargetPixels(layout, previewMode, exportWidth) {
  const canvasWidth = layout.canvas?.width || 750;
  const resolvedExportWidth = exportWidth || resolveExportWidth(layout, previewMode, canvasWidth);
  const scale = resolvedExportWidth / canvasWidth;
  const display = getMaxQrcodeDisplaySize(layout);
  const minTarget = previewMode ? 320 : 768;
  return Math.max(minTarget, Math.ceil(display * scale * 4));
}

function getFooterMetrics(block, vehicle, dealer) {
  const qrSize = block.style?.qrcodeSize || 120;
  const phone = resolveDealerBind(block.bind?.phone, dealer) || dealer?.contact_phone || dealer?.contactPhone || '';
  const showCode = !!(block.bind?.showCodeOnFooter && vehicle?.code);
  const titleY = 36;
  const subtitleY = 68;
  const phoneY = 98;
  const qrY = phone ? 126 : 92;
  const codeY = qrY + qrSize + 22;
  const innerH = showCode ? codeY + 8 : qrY + qrSize + 16;
  return { qrSize, phone, showCode, titleY, subtitleY, phoneY, qrY, codeY, innerH };
}

function getDividerLabel(block, vehicle) {
  const code = vehicle?.code || '';
  if (block.bind?.label?.template) {
    return block.bind.label.template.replace('{vehicleCode}', code);
  }
  if (block.bind?.label?.literal) return block.bind.label.literal;
  return code ? `编号 ${code}` : '下一台';
}

function measureBlock(block, vehicle, theme, canvasWidth, vehicleCount, dealer) {
  const pad = getPadding(block);
  let h = typeof block.height === 'number' ? block.height : 0;

  switch (block.type) {
    case 'vehicle_title':
      h = (theme.titleFontSize || 34) + (theme.bodyFontSize || 28) + 24;
      break;
    case 'selling_points': {
      const max = block.bind?.maxCount || 5;
      const points = (vehicle.sellingPoints || []).slice(0, max);
      h = Math.max(points.length, 1) * ((theme.bodyFontSize || 28) * 1.6) + 16;
      break;
    }
    case 'photo_grid': {
      const photos = getGridPhotos(vehicle, block.bind);
      const photoLayout = activeRenderContext.photoLayout || 'grid_2';

      // 根据布局方式调整参数
      let cols = block.style?.columns || 2;
      let gap = block.style?.gap || 12;
      let aspectRatio = 0.75;

      if (photoLayout === 'grid_3') {
        cols = 3;
        gap = 8;
        aspectRatio = 0.8;
      } else if (photoLayout === 'single') {
        cols = 1;
        gap = 12;
        aspectRatio = 0.6;
      } else if (photoLayout === 'wide') {
        cols = 2;
        gap = 12;
        aspectRatio = 0.45;
      }

      const rows = Math.ceil(Math.max(photos.length, 1) / cols);
      const contentW = canvasWidth - pad.left - pad.right;
      const cellH = ((contentW - gap * (cols - 1)) / cols) * aspectRatio;
      // 网格高度精确计算，移除多余缓冲区
      h = rows * cellH + (rows - 1) * gap;
      break;
    }
    case 'vehicle_description': {
      const text = getVehicleDescription(vehicle);
      const fontSize = block.style?.fontSize || theme.bodyFontSize || 28;
      const lines = wrapTextLines(text, canvasWidth - pad.left - pad.right, fontSize);
      const titleH = block.style?.showTitle !== false ? 36 : 0;
      // 标题 36px + 背景顶部内边距 20px + 文字高度（精确匹配渲染）
      // 渲染时文字从 ty+fontSize 绘制，每行间隔 fontSize*lineHeight
      // 最后一行底部位置：fontSize + (lines.length-1)*fontSize*lineHeight
      const lineHeight = block.style?.lineHeight || 1.5;
      const textH = lines.length > 0 ? fontSize + (lines.length - 1) * fontSize * lineHeight : 0;
      h = titleH + 20 + textH;
      break;
    }
    case 'specs_table':
      h = (theme.bodyFontSize || 28) + 20;
      break;
    case 'vehicle_code':
      h = (block.style?.fontSize || 22) + 20;
      break;
    case 'cover_header':
      h = block.height || 180;
      break;
    case 'divider':
      h = typeof block.height === 'number' ? block.height : 72;
      break;
    case 'footer_cta':
      h = getFooterMetrics(block, vehicle, dealer).innerH;
      break;
    default:
      if (block.height === 'auto') h = 80;
  }
  return h + pad.top + pad.bottom;
}

function renderBlockSvg(block, vehicle, dealer, theme, canvasWidth, yStart, vehicleCount) {
  const pad = getPadding(block);
  const x = pad.left;
  const w = canvasWidth - pad.left - pad.right;
  const y = yStart + pad.top;
  const blockH = measureBlock(block, vehicle, theme, canvasWidth, vehicleCount, dealer);
  const innerH = blockH - pad.top - pad.bottom;
  let svg = '';

  switch (block.type) {
    case 'hero_image': {
      const embedded = toEmbeddedImage(getHeroImage(vehicle, block.bind));
      const r = block.style?.borderRadius || 0;
      if (embedded) {
        const clipId = `clip-hero-${y}`;
        svg += `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${innerH}" rx="${r}"/></clipPath>`;
        svg += svgImageTag(embedded, x, y, w, innerH, `clip-path="url(#${clipId})"`);
      } else {
        const colors = GRADIENT_FALLBACKS.simple;
        svg += `<defs><linearGradient id="g-${y}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[1]}"/></linearGradient></defs>`;
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${innerH}" rx="${r}" fill="url(#g-${y})"/>`;
      }
      break;
    }
    case 'vehicle_code': {
      const code = vehicle.code || '';
      const prefix = block.style?.prefix || '编号: ';
      const align = block.style?.align === 'right' ? x + w : x;
      const fs = block.style?.fontSize || 22;
      const color = resolveBlockTextColor(theme, block);
      svg += renderCodeText({
        x: align,
        y: y + fs + 6,
        code,
        prefix,
        fill: color,
        fontSize: fs,
        anchor: block.style?.align === 'right' ? 'end' : 'start',
        weight: block.style?.fontWeight || 600,
      });
      break;
    }
    case 'vehicle_title': {
      const title = vehicle.brandModel || '精品产品';
      const year = vehicle.year;
      svg += renderTextTag({
        x,
        y: y + (theme.titleFontSize || 34),
        text: title,
        fill: block.style?.titleColor || theme.textPrimary,
        fontSize: theme.titleFontSize || 34,
        weight: 600,
      });
      if (year) {
        const sub = (block.style?.subtitleTemplate || '{year}款').replace('{year}', year);
        svg += renderTextTag({
          x,
          y: y + (theme.titleFontSize || 34) + (theme.bodyFontSize || 28) + 8,
          text: sub,
          fill: theme.textSecondary,
          fontSize: theme.bodyFontSize || 28,
        });
      }
      break;
    }
    case 'selling_points': {
      const max = block.bind?.maxCount || 5;
      const points = (vehicle.sellingPoints || []).slice(0, max);
      const list = points.length ? points : [{ text: '精品品质，欢迎咨询' }];
      let py = y;
      list.forEach((p) => {
        svg += renderTextTag({
          x,
          y: py + (theme.bodyFontSize || 28),
          text: p.text || '',
          fill: theme.textPrimary,
          fontSize: theme.bodyFontSize || 28,
        });
        py += (theme.bodyFontSize || 28) * (block.style?.lineHeight || 1.6);
      });
      break;
    }
    case 'photo_grid': {
      const photos = getGridPhotos(vehicle, block.bind);
      const photoLayout = activeRenderContext.photoLayout || 'grid_2';

      let cols = block.style?.columns || 2;
      let gap = block.style?.gap || 12;
      let aspectRatio = 0.75;

      // 根据布局方式调整参数
      if (photoLayout === 'grid_3') {
        cols = 3;
        gap = 8;
        aspectRatio = 0.8;
      } else if (photoLayout === 'single') {
        cols = 1;
        gap = 12;
        aspectRatio = 0.6;
      } else if (photoLayout === 'wide') {
        cols = 2;
        gap = 12;
        aspectRatio = 0.45;
      } else {
        // grid_2 默认
        cols = 2;
        gap = 12;
        aspectRatio = 0.75;
      }

      const borderRadius = block.style?.borderRadius || 8;
      const cellW = (w - gap * (cols - 1)) / cols;
      const cellH = cellW * aspectRatio;

      photos.forEach((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = x + col * (cellW + gap);
        const cy = y + row * (cellH + gap);
        const embedded = toEmbeddedImage(p);
        if (embedded) {
          svg += `<rect x="${cx}" y="${cy}" width="${cellW}" height="${cellH}" rx="${borderRadius}" fill="#F0F0F0"/>`;
          svg += `<image href="${embedded}" xlink:href="${embedded}" x="${cx}" y="${cy}" width="${cellW}" height="${cellH}" preserveAspectRatio="xMidYMid slice" style="clip-path: inset(0 round ${borderRadius}px)"/>`;
        }
      });
      break;
    }
    case 'vehicle_description': {
      const text = getVehicleDescription(vehicle);
      const fontSize = block.style?.fontSize || theme.bodyFontSize || 28;
      const lineHeight = block.style?.lineHeight || 1.5;
      const lines = wrapTextLines(text, w, fontSize);
      let ty = y;
      if (block.style?.showTitle !== false) {
        const title = block.bind?.title?.literal || '产品介绍';
        svg += renderTextTag({
          x,
          y: ty + 28,
          text: title,
          fill: block.style?.titleColor || theme.primaryColor || theme.textPrimary,
          fontSize: fontSize + 2,
          weight: 600,
        });
        ty += 36;
      }
      svg += `<rect x="${x}" y="${ty}" width="${w}" height="${innerH - (ty - y)}" rx="8" fill="${block.style?.backgroundColor || '#F9F9F9'}"/>`;
      ty += 20;
      lines.forEach((line) => {
        svg += renderTextTag({
          x: x + 16,
          y: ty + fontSize,
          text: line,
          fill: theme.textPrimary,
          fontSize,
        });
        ty += fontSize * lineHeight;
      });
      break;
    }
    case 'specs_table': {
      const rows = block.bind?.rows || [];
      const parts = rows
        .map((r) => {
          const val = vehicle[r.field === 'mileageKm' ? 'mileageKm' : r.field === 'priceWan' ? 'priceWan' : 'year'];
          if (!val) return null;
          return `${r.label} ${val}${r.suffix || ''}`;
        })
        .filter(Boolean);
      svg += renderTextTag({
        x,
        y: y + (theme.bodyFontSize || 28),
        text: parts.join(block.style?.separator || ' | '),
        fill: theme.textSecondary,
        fontSize: theme.bodyFontSize || 28,
      });
      break;
    }
    case 'price_tag': {
      const price = vehicle.priceWan || '--';
      const priceFs = block.style?.priceFontSize || 48;
      const priceText = (block.style?.currency || '¥') + price + (block.style?.unit || '万');
      if (block.style?.backgroundColor) {
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${innerH}" rx="8" fill="${block.style.backgroundColor}"/>`;
      }
      svg += renderTextTag({
        x: x + 16,
        y: y + priceFs + 8,
        text: priceText,
        fill: theme.priceColor || '#F53F3F',
        fontSize: priceFs,
        weight: 600,
      });
      break;
    }
    case 'divider': {
      const accent = block.style?.accentColor || theme.accentColor || '#07C160';
      const lineColor = block.style?.lineColor || accent;
      const lineW = block.style?.lineWidth || 3;
      const fs = block.style?.fontSize || 24;
      const label = getDividerLabel(block, vehicle);
      const mid = y + innerH / 2;
      const cx = x + w / 2;
      const bandH = Math.min(innerH - 8, fs + 28);
      const bandY = mid - bandH / 2;

      svg += `<rect x="${x}" y="${bandY}" width="${w}" height="${bandH}" rx="10" fill="${block.style?.backgroundColor || '#F5F5F5'}" stroke="${lineColor}" stroke-width="1" stroke-opacity="0.35"/>`;

      const estTextW = Math.min(w * 0.72, Math.max(label.length * fs * 0.62, 120));
      const badgePadX = 18;
      const badgeW = estTextW + badgePadX * 2;
      const badgeH = fs + 18;
      const badgeX = cx - badgeW / 2;
      const badgeY = mid - badgeH / 2;
      const gap = 10;
      const lineY = mid;

      svg += `<line x1="${x + 12}" y1="${lineY}" x2="${badgeX - gap}" y2="${lineY}" stroke="${lineColor}" stroke-width="${lineW}" stroke-linecap="round"/>`;
      svg += `<line x1="${badgeX + badgeW + gap}" y1="${lineY}" x2="${x + w - 12}" y2="${lineY}" stroke="${lineColor}" stroke-width="${lineW}" stroke-linecap="round"/>`;
      svg += `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="#FFFFFF" stroke="${accent}" stroke-width="2.5"/>`;
      svg += renderTextTag({
        x: cx,
        y: mid + fs * 0.35,
        text: label,
        fill: resolveBlockTextColor(theme, block),
        fontSize: fs,
        anchor: 'middle',
        weight: 700,
        splitMixed: true,
      });
      break;
    }
    case 'cover_header': {
      const colors = block.style?.backgroundGradient || GRADIENT_FALLBACKS.simple;
      svg += `<defs><linearGradient id="hc-${y}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[1]}"/></linearGradient></defs>`;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${innerH}" fill="url(#hc-${y})"/>`;
      const title = block.bind?.title?.literal || '今日好物推荐';
      const subtitle = (block.bind?.subtitle?.template || '').replace('{vehicleCount}', vehicleCount) || block.bind?.subtitle?.literal || '';
      svg += renderTextTag({
        x: x + w / 2,
        y: y + 70,
        text: title,
        fill: block.style?.titleColor || '#fff',
        fontSize: 36,
        anchor: 'middle',
        weight: 700,
      });
      svg += renderTextTag({
        x: x + w / 2,
        y: y + 110,
        text: subtitle,
        fill: block.style?.titleColor || '#fff',
        fontSize: 24,
        anchor: 'middle',
      });
      break;
    }
    case 'footer_cta': {
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${innerH}" fill="${block.style?.backgroundColor || '#F5F5F5'}"/>`;
      const title = block.bind?.title?.literal || '扫码咨询';
      const subtitle =
        resolveDealerBind(block.bind?.subtitle, dealer) || dealer?.shop_name || dealer?.shopName || '';
      const metrics = getFooterMetrics(block, vehicle, dealer);
      const { qrSize, phone, showCode, titleY, subtitleY, phoneY, qrY, codeY } = metrics;
      const footerTextColor = resolveBlockTextColor(theme, block, { preferTitleColor: true });
      svg += renderTextTag({
        x: x + w / 2,
        y: y + titleY,
        text: title,
        fill: footerTextColor,
        fontSize: 30,
        anchor: 'middle',
        weight: 600,
      });
      svg += renderTextTag({
        x: x + w / 2,
        y: y + subtitleY,
        text: subtitle,
        fill: footerTextColor,
        fontSize: 24,
        anchor: 'middle',
      });
      if (phone) {
        svg += renderPhoneText({ x: x + w / 2, y: y + phoneY, phone, fill: footerTextColor });
      }
      const qrcodeSrc =
        resolveDealerBind(block.bind?.qrcode, dealer) || dealer?.qrcode_path || dealer?.qrcodePath || null;
      const qrX = x + w / 2 - qrSize / 2;
      const qrEmbedded = toEmbeddedQrcode(qrcodeSrc);
      if (qrEmbedded) {
        svg += svgQrcodeTag(qrEmbedded, qrX, y + qrY, qrSize);
      } else {
        svg += renderQrcodePlaceholder(qrX, y + qrY, qrSize, footerTextColor);
      }
      if (showCode) {
        svg += renderCodeText({
          x: x + w / 2,
          y: y + codeY,
          code: vehicle.code,
          fill: footerTextColor,
        });
      }
      break;
    }
    default:
      break;
  }

  return { svg, height: blockH };
}

function buildBlockList(layout, vehicles) {
  const isMulti = vehicles.length > 1;
  const blocks = [];

  if (isMulti && layout.multiVehicle) {
    const mv = layout.multiVehicle;
    (mv.headerBlocks || []).forEach((b) => blocks.push({ block: b, vehicle: vehicles[0] }));
    vehicles.forEach((vehicle, idx) => {
      (mv.vehicleBlockTemplate || []).forEach((b) => blocks.push({ block: b, vehicle }));
      if (idx < vehicles.length - 1) {
        (mv.betweenBlocks || []).forEach((b) =>
          blocks.push({ block: b, vehicle: vehicles[idx + 1] })
        );
      }
    });
    (mv.footerBlocks || []).forEach((b) => blocks.push({ block: b, vehicle: vehicles[0] }));
  } else {
    (layout.blocks || []).forEach((b) => blocks.push({ block: b, vehicle: vehicles[0] }));
  }

  return blocks.filter(({ block, vehicle }) => shouldRenderBlock(block, vehicle));
}

function buildPosterSvg({ vehicles, templateId, dealer }) {
  const layout = loadLayout(templateId);
  const canvasWidth = layout.canvas?.width || 750;
  const theme = layout.theme || {};
  const vehicleCount = vehicles.length;
  const blockList = buildBlockList(layout, vehicles);

  const heights = blockList.map(({ block, vehicle }) =>
    measureBlock(block, vehicle, theme, canvasWidth, vehicleCount, dealer)
  );
  const totalHeight = heights.reduce((a, b) => a + b, 0);

  let y = 0;
  let body = `<rect width="${canvasWidth}" height="${totalHeight}" fill="${layout.canvas?.backgroundColor || '#fff'}"/>`;
  blockList.forEach(({ block, vehicle }) => {
    const { svg, height } = renderBlockSvg(block, vehicle, dealer, theme, canvasWidth, y, vehicleCount);
    body += svg;
    y += height;
  });

  const svgDoc = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvasWidth}" height="${totalHeight}" viewBox="0 0 ${canvasWidth} ${totalHeight}">
  <style type="text/css"><![CDATA[
    text, tspan { font-family: ${getExportFontFamily()}; }
  ]]></style>
  ${body}
</svg>`;

  const validation = validatePosterSvg(svgDoc);
  if (!validation.ok) {
    throw new Error(`POSTER_TEXT_INVALID: ${validation.issues.join('; ')}`);
  }

  return {
    svgDoc,
    width: canvasWidth,
    height: totalHeight,
    blockCount: blockList.length,
    layout,
  };
}

function pathToUploadUrl(filePath) {
  if (!filePath) return null;
  const rel = path.relative(UPLOADS_DIR, filePath);
  if (rel.startsWith('..')) return null;
  return `/uploads/${rel.split(path.sep).join('/')}`;
}

async function preparePosterUrlEmbeds(vehicles, dealer, layout) {
  let filePaths = [];
  withRenderContext({ previewMode: false }, () => {
    filePaths = collectEmbedPaths(vehicles, dealer, layout);
  });
  const embedMap = new Map();
  filePaths.forEach((fp) => {
    const url = pathToUploadUrl(fp);
    if (url) embedMap.set(fp, url);
  });
  return embedMap;
}

/** 仅组装 SVG 与嵌入 URL，不做任何图片读写/栅格化（由移动端完成 PNG 导出） */
async function buildPosterCompose({ vehicles, templateId, photoLayout = 'grid_2', dealer, previewMode = false }) {
  const start = Date.now();
  const layout = loadLayout(templateId);
  const canvasWidth = layout.canvas?.width || 750;
  const exportWidth = resolveExportWidth(layout, previewMode, canvasWidth);
  const embedMap = await preparePosterUrlEmbeds(vehicles, dealer, layout);
  const built = withRenderContext({ previewMode, embedMap, photoLayout }, () =>
    buildPosterSvg({ vehicles, templateId, dealer })
  );
  const { svgDoc, width, height, blockCount } = built;
  const qrcodeSrc = dealer?.qrcode_path || dealer?.qrcodePath;
  const qrcodeFile = resolvePhotoPath(qrcodeSrc);
  return {
    svgDoc,
    exportWidth,
    width,
    height,
    blockCount,
    durationMs: Date.now() - start,
    previewMode: !!previewMode,
    qrcodeUrl: qrcodeFile ? pathToUploadUrl(qrcodeFile) : null,
    embed: {
      maxEdge: resolveEmbedMaxEdge(layout, previewMode, exportWidth),
      quality: (previewMode ? 72 : 93) / 100,
      qrcodeTargetPixels: getQrcodeTargetPixels(layout, previewMode, exportWidth),
    },
  };
}

async function renderPosterToBuffer({ vehicles, templateId, dealer, previewMode = false }) {
  const start = Date.now();
  const layout = loadLayout(templateId);
  const canvasWidth = layout.canvas?.width || 750;
  const exportWidth = resolveExportWidth(layout, previewMode, canvasWidth);
  const embedMap = await preparePosterEmbeds(vehicles, dealer, layout, { previewMode, exportWidth });

  const built = withRenderContext({ previewMode, embedMap }, () =>
    buildPosterSvg({ vehicles, templateId, dealer })
  );
  const { svgDoc, width, height, blockCount } = built;
  const pngBuffer = svgToPng(svgDoc, exportWidth);
  const scaledHeight = Math.round(height * exportWidth / width);

  return {
    pngBuffer,
    width: exportWidth,
    height: scaledHeight,
    durationMs: Date.now() - start,
    blockCount,
    fileSize: pngBuffer.length,
    mimeType: 'image/png',
    format: 'png',
    previewMode,
  };
}

/** 兼容旧测试：写入临时文件 */
async function renderPoster(opts) {
  const result = await renderPosterToBuffer(opts);
  if (opts.previewMode) {
    return {
      ...result,
      filePath: null,
      url: null,
    };
  }
  const primaryId = opts.vehicles[0].id;
  const posterDir = path.join(vehicleDir(primaryId), 'posters');
  if (!fs.existsSync(posterDir)) fs.mkdirSync(posterDir, { recursive: true });
  const filename = `long_${opts.templateId}_${Date.now()}.png`;
  const filePath = path.join(posterDir, filename);
  fs.writeFileSync(filePath, result.pngBuffer);
  return {
    ...result,
    filePath,
  };
}

module.exports = {
  renderPoster,
  renderPosterToBuffer,
  buildPosterSvg,
  buildPosterCompose,
  loadLayout,
  pathToUploadUrl,
};
