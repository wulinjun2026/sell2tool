/**
 * 上传多图测试 - 验证各 slot 照片写入独立文件（非互相覆盖）
 */
const http = require('http');
const fs = require('fs');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function uploadPhoto(vehicleId, category, slotKey, { fileFirst = false } = {}) {
  return new Promise((resolve, reject) => {
    const boundary = `----UploadTest${Date.now()}${Math.random().toString(16).slice(2)}`;
    const textParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\n${category}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="slotKey"\r\n\r\n${slotKey}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\ngallery\r\n`,
    ];
    const filePartHead = `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const filePartTail = `\r\n--${boundary}--\r\n`;

    const chunks = fileFirst
      ? [filePartHead, TINY_JPEG, ...textParts, filePartTail]
      : [...textParts, filePartHead, TINY_JPEG, filePartTail];

    const body = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))));

    const url = new URL(`/api/vehicles/${vehicleId}/photos`, BASE);
    const req = http.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  const created = await requestJson('POST', '/api/vehicles');
  if (created.status !== 201) {
    console.error('✗ 无法创建测试车辆，请先运行 npm start');
    process.exit(1);
  }
  const vehicleId = created.data.id;

  const slots = [
    ['exterior', 'front'],
    ['exterior', 'rear'],
    ['exterior', 'left'],
    ['interior', 'center_console'],
  ];

  for (const [cat, slot] of slots) {
    const res = await uploadPhoto(vehicleId, cat, slot);
    if (res.status !== 201) {
      console.error(`✗ 上传失败 ${cat}.${slot}`, res.data);
      await requestJson('DELETE', `/api/vehicles/${vehicleId}`);
      process.exit(1);
    }
  }

  const vehicle = await requestJson('GET', `/api/vehicles/${vehicleId}`);
  const photos = vehicle.data.photos || [];
  const paths = photos.map((p) => p.filePath).filter(Boolean);
  const uniquePaths = new Set(paths);
  const allExist = paths.every((p) => fs.existsSync(p));

  const ok = photos.length === 4 && uniquePaths.size === 4 && allExist;
  console.log(
    ok
      ? `✓ 4 张上传照片各自独立文件 (${uniquePaths.size} 个路径)`
      : `✗ 照片路径异常: count=${photos.length}, unique=${uniquePaths.size}, exist=${allExist}`
  );

  const beforeCount = photos.length;
  const beforePaths = paths.slice();
  const resLegacy = await uploadPhoto(vehicleId, 'exterior', 'right', { fileFirst: true });
  const vehicle2 = await requestJson('GET', `/api/vehicles/${vehicleId}`);
  const paths2 = (vehicle2.data.photos || []).map((p) => p.filePath);
  const unique2 = new Set(paths2);
  const originalsIntact =
    beforePaths.every((p) => paths2.includes(p)) && new Set(beforePaths).size === beforePaths.length;

  const legacyOk = resLegacy.status === 400 && paths2.length === beforeCount && originalsIntact;
  console.log(
    legacyOk
      ? '✓ file 字段在前时拒绝上传且已有照片未被覆盖'
      : `✗ 旧版顺序处理异常 status=${resLegacy.status} count=${paths2.length} intact=${originalsIntact}`
  );

  await requestJson('DELETE', `/api/vehicles/${vehicleId}`);
  process.exit(ok && legacyOk ? 0 : 1);
}

run().catch((e) => {
  console.error('✗ 测试失败:', e.message);
  process.exit(1);
});
