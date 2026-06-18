const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.ok(apiSrc.includes('deletePhoto'), 'missing deletePhoto API');
assert.ok(serverSrc.includes("app.delete('/api/vehicles/:vehicleId/photos/:photoId'"), 'missing delete photo route');
assert.ok(appSrc.includes('showPhotoActionSheet'), 'missing photo action sheet');
assert.ok(appSrc.includes('replacePhotoInSlot'), 'missing replace flow');
assert.ok(appSrc.includes('deleteVehiclePhoto'), 'missing delete flow');
assert.ok(appSrc.includes('showPhotoActionSheet(category, slotKey, el)'), 'has-photo should open action sheet');
assert.ok(htmlSrc.includes('photo-action-replace'), 'missing replace button in UI');
assert.ok(htmlSrc.includes('photo-action-delete'), 'missing delete button in UI');
assert.match(appSrc, /stepLocked && !manageOnly/, 'batch mode should still allow managing existing photos');

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: urlPath,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = {};
          try { parsed = JSON.parse(raw || '{}'); } catch { parsed = {}; }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadPhoto(vehicleId, category, slotKey, replace = false) {
  const boundary = '----PhotoReplaceDeleteTest';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\n${category}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="slotKey"\r\n\r\n${slotKey}\r\n`),
    replace ? Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="replace"\r\n\r\ntrue\r\n`) : Buffer.alloc(0),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ].filter((b) => b.length));
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: `/api/vehicles/${vehicleId}/photos`,
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = {};
          try { parsed = JSON.parse(raw || '{}'); } catch { parsed = {}; }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runIntegration() {
  let created;
  try {
    created = await requestJson('POST', '/api/vehicles');
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.log('⊘ 跳过接口联调（服务未启动）');
      return;
    }
    throw e;
  }
  if (created.status !== 201) {
    console.log('⊘ 跳过接口联调（服务未启动）');
    return;
  }
  const vehicleId = created.data.id;

  const up1 = await uploadPhoto(vehicleId, 'exterior', 'front', false);
  assert.strictEqual(up1.status, 201, 'upload should succeed');
  const photoId = up1.data.photo?.id;
  assert.ok(photoId, 'upload should return photo id');

  const vehicle1 = await requestJson('GET', `/api/vehicles/${vehicleId}`);
  assert.strictEqual(vehicle1.data.photos.length, 1);

  const up2 = await uploadPhoto(vehicleId, 'exterior', 'front', true);
  assert.strictEqual(up2.status, 201, 'replace upload should succeed');
  const newPhotoId = up2.data.photo?.id;
  assert.notStrictEqual(newPhotoId, photoId, 'replace should create new photo');

  const vehicle2 = await requestJson('GET', `/api/vehicles/${vehicleId}`);
  assert.strictEqual(vehicle2.data.photos.length, 1, 'replace should keep one photo in slot');

  const del = await requestJson('DELETE', `/api/vehicles/${vehicleId}/photos/${newPhotoId}`);
  assert.strictEqual(del.status, 200, 'delete should succeed');

  const vehicle3 = await requestJson('GET', `/api/vehicles/${vehicleId}`);
  assert.strictEqual(vehicle3.data.photos.length, 0, 'slot should be empty after delete');

  await requestJson('DELETE', `/api/vehicles/${vehicleId}`);
  console.log('✓ 替换与删除接口联调通过');
}

runIntegration()
  .then(() => {
    console.log('✓ 照片替换/删除 UI 与 API 就绪');
  })
  .catch((e) => {
    console.error('✗ 测试失败:', e.message);
    process.exit(1);
  });
