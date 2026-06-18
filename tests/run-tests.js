/**
 * API 集成测试 - 二手车信息发布助手 MVP
 */
const http = require('http');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
let authToken = '';
let passed = 0;
let failed = 0;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (authToken) opts.headers.Authorization = `Bearer ${authToken}`;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

async function run() {
  console.log('\n🧪 运行 API 测试...\n');

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data.ok, '健康检查');

  const sms = await request('POST', '/api/auth/sms/send', { phone: '13800138000' });
  assert(sms.status === 200 && sms.data.devCode, '发送登录验证码');
  const login = await request('POST', '/api/auth/sms/verify', { phone: '13800138000', code: sms.data.devCode });
  assert(login.status === 200 && login.data.token, '手机号登录');
  authToken = login.data.token;

  const created = await request('POST', '/api/vehicles');
  assert(created.status === 201 && !created.data.code, '创建车辆时不生成编号');
  const vehicleId = created.data.id;

  const updated = await request('PUT', `/api/vehicles/${vehicleId}`, {
    brandModel: '测试宝马X5 2021款',
    priceWan: 36.8,
    year: 2021,
    mileageKm: 30000,
    sellingPoints: [{ category: 'appearance', text: '全车原版原漆', emoji: '🚗', source: 'builtin' }],
  });
  assert(updated.status === 200 && updated.data.code?.startsWith('CC'), '录入信息后生成编号');

  const recommend = await request('GET', '/api/selling-points/recommend?brandModel=宝马&limit=5');
  assert(recommend.data.points?.length >= 1, '卖点推荐');

  const polish = await request('POST', '/api/polish', {
    scene: 'vehicle_description',
    rawText: '21年宝马X5，3万公里，4S店保养',
    brandModel: '宝马X5',
  });
  assert(polish.data.polished?.length > 0, 'AI 润色（本地模板）');

  // 使用 compose 端点生成 SVG（服务端不再生成 PNG）
  const compose = await request('POST', '/api/posters/compose', {
    vehicleIds: [vehicleId],
    templateId: 'tpl_simple_01',
  });
  assert(compose.status === 200 && compose.data.svgDoc, '长图渲染');
  assert(compose.data.generationId, '长图生成记录');

  const share = await request('POST', '/api/share', {
    vehicleIds: [vehicleId],
    copyText: '测试分享文案',
    shareType: 'long_image_only',
    generationId: compose.data.generationId,
  });
  assert(share.status === 200, '分享记录');

  const list = await request('GET', '/api/vehicles');
  assert(list.data.vehicles?.some((v) => v.id === vehicleId), '车辆列表');

  const stats = await request('GET', '/api/stats');
  assert(typeof stats.data.counts === 'object', '统计数据');

  const dealerUpdate = await request('PUT', '/api/dealer', {
    shopName: '测试车商',
    contactPhone: '13700137000',
    contactWechat: 'test_dealer',
  });
  assert(dealerUpdate.status === 200 && dealerUpdate.data.shopName === '测试车商', '更新经销商资料');

  const markSold = await request('PATCH', `/api/vehicles/${vehicleId}/status`, { status: 'sold' });
  assert(markSold.status === 200, '标记已售');

  const soldVehicle = await request('GET', `/api/vehicles/${vehicleId}`);
  assert(soldVehicle.data.status === 'sold' && soldVehicle.data.soldAt, '已售状态记录 sold_at');

  const markOnSale = await request('PATCH', `/api/vehicles/${vehicleId}/status`, { status: 'on_sale' });
  assert(markOnSale.status === 200, '重新标注在售');

  const onSaleVehicle = await request('GET', `/api/vehicles/${vehicleId}`);
  assert(onSaleVehicle.data.status === 'on_sale' && !onSaleVehicle.data.soldAt, '在售状态并清除 sold_at');

  await request('DELETE', `/api/vehicles/${vehicleId}`);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('测试失败 - 请先运行 npm start:', e.message);
  process.exit(1);
});
