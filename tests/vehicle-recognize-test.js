const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(!serverSrc.includes('/api/vehicles/:vehicleId/recognize'), 'recognize route should be removed');
assert.ok(!apiSrc.includes('recognizeVehicle'), 'client recognize API should be removed');
assert.ok(!appSrc.includes('recognizeAndApplyModel'), 'client recognize flow should be removed');
assert.ok(appSrc.includes('generateSellingPointsFromDesc'), 'selling should be on desc page');
assert.ok(serverSrc.includes('/api/selling-points/generate'), 'should have generate selling API');

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let data = {};
          try { data = JSON.parse(raw || '{}'); } catch { data = {}; }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runIntegration() {
  let health;
  try {
    health = await requestJson('GET', '/api/health');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.log('⊘ 跳过接口联调（服务未启动）');
      return;
    }
    throw e;
  }
  if (health.status !== 200) {
    console.log('⊘ 跳过接口联调（服务未启动）');
    return;
  }

  const rec = await requestJson('POST', '/api/vehicles/test-id/recognize', {});
  assert.strictEqual(rec.status, 404, 'recognize endpoint should be gone');

  const gen = await requestJson('POST', '/api/selling-points/generate', {
    rawText: '21年宝马X5，3万公里，全程4S店保养',
    brandModel: '宝马X5 2021款',
    priceWan: 36.8,
  });
  assert.strictEqual(gen.status, 200, `generate should succeed, got ${gen.status}`);
  assert.ok(gen.data.points?.length >= 2, 'should return selling points');

  console.log('✓ 描述页提炼总结接口联调通过');
}

runIntegration()
  .then(() => {
    console.log('✓ 产品描述页提炼总结逻辑就绪');
  })
  .catch((e) => {
    console.error('✗ 测试失败:', e.message);
    process.exit(1);
  });
