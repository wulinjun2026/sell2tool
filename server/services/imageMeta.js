const fs = require('fs');

/** 读取 PNG/JPEG 宽高，用于校验二维码等图片是否可用 */
function getImageDimensions(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (buf.length < 24) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}

function isUsableRasterImage(filePath, minSize = 32) {
  const dim = getImageDimensions(filePath);
  if (!dim) return false;
  return dim.width >= minSize && dim.height >= minSize;
}

function getImageDimensionsFromBuffer(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function isUsableRasterBuffer(buf, minSize = 32) {
  const dim = getImageDimensionsFromBuffer(buf);
  if (!dim) return false;
  return dim.width >= minSize && dim.height >= minSize;
}

module.exports = {
  getImageDimensions,
  getImageDimensionsFromBuffer,
  isUsableRasterImage,
  isUsableRasterBuffer,
};
