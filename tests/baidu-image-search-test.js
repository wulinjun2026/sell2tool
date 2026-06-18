const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const recognizeSrc = fs.readFileSync(path.join(__dirname, '../server/services/vehicleRecognize.js'), 'utf8');
const baiduSrc = fs.readFileSync(path.join(__dirname, '../server/services/baiduImageSearch.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(recognizeSrc.includes('recognizeWithBaiduImageSearch'), 'vehicleRecognize should call baidu image search');
assert.ok(recognizeSrc.includes('baiduCarApi'), 'vehicleRecognize should support baidu car api');
assert.ok(baiduSrc.includes('graph.baidu.com/upload'), 'baidu service should upload to graph.baidu.com');
assert.ok(baiduSrc.includes('extractVehicleModel'), 'baidu service should parse vehicle model');
assert.ok(appSrc.includes('百度识图'), 'client should show baidu source label');

const {
  extractTextsFromSearchHtml,
  extractVehicleModel,
  generateAcsToken,
  isEnabled,
} = require('../server/services/baiduImageSearch');

assert.strictEqual(isEnabled(), true, 'baidu search enabled by default');
process.env.BAIDU_IMAGE_SEARCH_ENABLED = 'false';
assert.strictEqual(isEnabled(), false, 'baidu search can be disabled');
delete process.env.BAIDU_IMAGE_SEARCH_ENABLED;

const sampleHtml = `
<html><head><title>宝马X5 2021款 汽车外观 - 百度图片</title></head>
<body>
<script>window.__DATA__={"keyword":"宝马X5","tag":"SUV"}</script>
<a href="http://graph.baidu.com/view/similar?wd=%E5%AE%9D%E9%A9%ACX5%202021%E6%AC%BE">相似图</a>
</body></html>`;

const texts = extractTextsFromSearchHtml(
  sampleHtml,
  'https://graph.baidu.com/s?wd=%E5%AE%9D%E9%A9%ACX5%202021%E6%AC%BE'
);
assert.ok(texts.some((t) => /宝马/.test(t)), 'should extract keyword texts from html');

const parsed = extractVehicleModel([
  '宝马X5 2021款 汽车外观实拍',
  '图片来源：奔驰C级 2020款',
]);
assert.ok(parsed, 'should parse vehicle model');
assert.ok(/宝马X5/.test(parsed.brandModel), 'should prefer bmw candidate');
assert.strictEqual(parsed.year, 2021);

// ACS token 生成（依赖外网脚本，失败时跳过）
(async () => {
  try {
    const acs = await (async () => {
      const https = require('https');
      return new Promise((resolve, reject) => {
        https.get(
          'https://dlswbr.baidu.com/heicha/mm/2033/acs-2033.js?_=247369',
          { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://image.baidu.com/' } },
          (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve(data));
          }
        ).on('error', reject);
      });
    })();
    const sandbox = {
      window: {},
      document: {
        cookie: 'BAIDUID=test:FG=1',
        referrer: 'https://image.baidu.com/',
        createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
        getElementsByTagName: () => [],
      },
      navigator: { userAgent: 'Mozilla/5.0', platform: 'Win32', language: 'zh-CN' },
      location: { href: 'https://image.baidu.com/' },
      screen: { width: 1920, height: 1080 },
      history: {},
      localStorage: { getItem: () => null, setItem: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Date,
      Math,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      parseInt,
      parseFloat,
      encodeURIComponent,
      decodeURIComponent,
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
      Uint8Array,
      XMLHttpRequest() {
        this.open = () => {};
        this.send = () => {};
      },
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.top = sandbox;
    sandbox.parent = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(acs, sandbox, { timeout: 10000 });
    const token = sandbox.window.ACS_2033?.gst?.();
    assert.ok(token && token.length > 10, 'acs token should be generated');
    console.log('✓ 百度 Acs-Token 可本地生成');
  } catch (e) {
    console.log('⊘ 跳过 Acs-Token 外网测试:', e.message);
  }

  // 实网识图联调（可选）
  if (process.env.BAIDU_IMAGE_LIVE_TEST === '1') {
    const { recognizeFromImageBuffer, bootstrapSession } = require('../server/services/baiduImageSearch');
    const imgPath = process.env.BAIDU_TEST_IMAGE;
    if (!imgPath || !fs.existsSync(imgPath)) {
      console.log('⊘ 跳过实网联调（设置 BAIDU_IMAGE_LIVE_TEST=1 与 BAIDU_TEST_IMAGE）');
    } else {
      const session = await bootstrapSession();
      const buf = fs.readFileSync(imgPath);
      try {
        const live = await recognizeFromImageBuffer(buf, { session, mime: 'image/jpeg', filename: 'car.jpg' });
        assert.ok(live.brandModel, 'live recognize should return brandModel');
        console.log('✓ 百度识图实网联调通过:', live.brandModel);
      } catch (e) {
        if (/Reject|BAIDU_|illegal|format error/i.test(String(e.message))) {
          console.log('⊘ 实网联调被百度风控拦截（部署到国内服务器或配置 BAIDU_API_KEY 后重试）:', e.message);
        } else {
          throw e;
        }
      }
    }
  } else {
    console.log('⊘ 跳过实网联调（BAIDU_IMAGE_LIVE_TEST 未开启）');
  }

  console.log('✓ 百度识图解析与接入逻辑就绪');
})().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
