/**
 * 在生产服务器上执行百度识图实网联调：
 *   node tests/baidu-live-production-test.js
 * 或本地带图片：
 *   BAIDU_IMAGE_LIVE_TEST=1 BAIDU_TEST_IMAGE=/path/to/car.jpg node tests/baidu-live-production-test.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const baiduImageSearch = require('../server/services/baiduImageSearch');

const DEFAULT_SAMPLE_URL = process.env.BAIDU_TEST_IMAGE_URL
  || 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/2018_Tesla_Model_3_Performance_AWD_Front.jpg/960px-2018_Tesla_Model_3_Performance_AWD_Front.jpg';

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadToFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`DOWNLOAD_FAILED_${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', reject);
  });
}

async function ensureValidImage(filePath) {
  const meta = await sharp(filePath).metadata();
  if (!meta.width || !meta.height) throw new Error('INVALID_IMAGE');
  return filePath;
}

async function main() {
  if (!baiduImageSearch.isEnabled()) {
    console.log('⊘ 百度识图未开启');
    process.exit(0);
  }

  const bundledFixture = path.join(__dirname, 'fixtures/sample-car.jpg');
  let imgPath = process.env.BAIDU_TEST_IMAGE;
  if (!imgPath || !fs.existsSync(imgPath)) {
    if (fs.existsSync(bundledFixture)) {
      imgPath = bundledFixture;
      console.log('==> 使用内置样例图:', imgPath);
    } else {
      const tmp = path.join(__dirname, '.tmp-car-sample.jpg');
      console.log('==> 下载样例车辆图片');
      try {
        await downloadToFile(DEFAULT_SAMPLE_URL, tmp);
        imgPath = await ensureValidImage(tmp);
      } catch (err) {
        throw new Error(`无法获取测试图片: ${err.message}`);
      }
    }
  }
  imgPath = await ensureValidImage(imgPath);

  console.log('==> 百度识图实网联调:', imgPath);
  try {
    const result = await baiduImageSearch.recognizeFromFile(imgPath);
    console.log('✓ 识别结果:', JSON.stringify({
      brandModel: result.brandModel,
      year: result.year,
      confidence: result.confidence,
      source: result.source,
      keywords: (result.keywords || []).slice(0, 5),
    }, null, 2));
    if (!result.brandModel || result.confidence < 0.5) {
      console.log('⚠ 置信度偏低，建议配置 BAIDU_API_KEY 或 VISION_IMAGE_API_KEY');
      process.exit(1);
    }
  } catch (err) {
    console.error('✗ 实网联调失败:', err.message);
    if (Array.isArray(err.keywords) && err.keywords.length) {
      console.log('  解析线索:', err.keywords.slice(0, 6).join(' | '));
    }
    process.exit(1);
  }
}

main();
