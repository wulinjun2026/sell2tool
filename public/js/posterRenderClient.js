import { api } from './api.js';
import { blobToBase64 } from './imageClientUtils.js';
import { embedImagesInSvg } from './posterImageEmbedClient.js';
import { svgToPngBlob } from './posterExportClient.js';

/**
 * 在移动端完成长图生成：服务器只返回 SVG 结构与图片 URL，PNG 在本地导出。
 * onProgress({ percent, label }) 与 posterProgress 联动，percent 范围 0–98。
 */
export async function renderPosterOnClient({
  vehicleIds,
  templateId,
  photoLayout = 'grid_2',
  previewMode = false,
  signal,
  onProgress,
} = {}) {
  const report = (percent, label) => onProgress?.({ percent, label });

  report(8, '加载产品与模板');
  const compose = await api.composePoster({ vehicleIds, templateId, photoLayout, previewMode }, { signal });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  report(25, '加载产品与模板');

  report(28, '嵌入照片素材');
  const svgEmbedded = await embedImagesInSvg(
    compose.svgDoc,
    compose.embed || {},
    compose.qrcodeUrl || null,
    {
      onProgress: ({ done, total }) => {
        if (!total) return;
        // 使用幂函数平滑进度，消除"卡住"感知
        const smoothPercent = 28 + Math.round(54 * Math.pow(done / total, 0.8));
        report(smoothPercent, '嵌入照片素材');
      },
    }
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  report(82, '渲染长图画面');

  report(85, '导出 PNG 图片');
  const pngBlob = await svgToPngBlob(svgEmbedded, compose.exportWidth);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  report(94, '导出 PNG 图片');

  report(96, '导出 PNG 图片');
  const imageBase64 = await blobToBase64(pngBlob);
  report(98, '即将完成');

  const scaledHeight = Math.round(compose.height * compose.exportWidth / compose.width);

  return {
    imageBase64,
    width: compose.exportWidth,
    height: scaledHeight,
    durationMs: compose.durationMs,
    blockCount: compose.blockCount,
    fileSize: pngBlob.size,
    mimeType: 'image/png',
    format: 'png',
    previewMode: !!compose.previewMode,
    generationId: compose.generationId || null,
    clientRender: true,
  };
}
