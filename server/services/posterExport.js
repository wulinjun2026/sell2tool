const { Resvg } = require('@resvg/resvg-js');
const { resolveExportFont } = require('./posterFonts');

/** 将 SVG 长图导出为 PNG（便于朋友圈分享，不使用 SVG 文件） */
function svgToPng(svgDoc, width) {
  const { family, files, loadSystemFonts, sansSerifFamily } = resolveExportFont();
  const resvg = new Resvg(svgDoc, {
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts,
      defaultFontFamily: family,
      sansSerifFamily: sansSerifFamily || family,
      fontFiles: files,
    },
  });
  return resvg.render().asPng();
}

module.exports = { svgToPng };
