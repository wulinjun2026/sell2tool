#!/usr/bin/env node
/**
 * 从生产/本地 App 采集真机演示截图，供产品介绍视频使用。
 * 用法: node scripts/capture-app-screenshots.mjs
 * 环境: CAPTURE_BASE=http://106.12.86.64 CAPTURE_PHONE=13523515442
 */
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_RAW = path.join(ROOT, 'docs/output/product-intro-video/screenshots-raw');
const BASE = process.env.CAPTURE_BASE || 'http://106.12.86.64';
const PHONE = process.env.CAPTURE_PHONE || '13523515442';

async function apiLogin() {
  const send = await fetch(`${BASE}/api/auth/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  }).then((r) => r.json());
  if (!send.devCode) throw new Error('无法获取 devCode，请确认 AUTH_DEV_MODE 已开启');
  const login = await fetch(`${BASE}/api/auth/sms/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: send.devCode }),
  }).then((r) => r.json());
  if (!login.token) throw new Error('登录失败');
  return login.token;
}

async function pickVehicle(token) {
  const data = await fetch(`${BASE}/api/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const list = data.vehicles || [];
  const withPhotos = list.filter((v) => (v.photoCount || 0) > 3);
  return withPhotos[0] || list[0];
}

async function shot(page, name) {
  fs.mkdirSync(OUT_RAW, { recursive: true });
  const file = path.join(OUT_RAW, name);
  await page.screenshot({ path: file, type: 'png', fullPage: false });
  console.log('  ✓', name);
  return file;
}

async function goTab(page, tabId) {
  await page.locator(`.tab-item[data-tab="${tabId}"]`).click({ force: true });
  await page.waitForTimeout(600);
}

async function goScreen(page, screenId) {
  await page.evaluate((id) => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    const tabMap = {
      'page-list': 'page-list',
      'page-upload': 'page-upload',
      'page-gallery': 'page-gallery',
      'page-profile': 'page-profile',
      'page-desc': 'page-upload',
      'page-template': 'page-upload',
    };
    const tab = tabMap[id] || id;
    document.querySelectorAll('.tab-item').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
  }, screenId);
  await page.waitForTimeout(500);
}

async function main() {
  console.log(`==> 登录 ${BASE} (${PHONE})`);
  const token = await apiLogin();
  const vehicle = await pickVehicle(token);
  if (!vehicle) throw new Error('账号下无产品，请先录入演示数据');
  console.log(`==> 演示产品: ${vehicle.brandModel} (${vehicle.id.slice(0, 8)}…)`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...devices['iPhone 13 Pro'],
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => localStorage.setItem('uca_auth_token', t), token);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('==> 采集分镜截图');

  // 1 产品列表（开场）
  await goTab(page, 'page-list');
  await page.waitForTimeout(800);
  await shot(page, 'scene-01.png');

  // 2 我的页（登录后 + Tab 栏）
  await goTab(page, 'page-profile');
  await page.waitForSelector('#profile-authed:not(.hidden)', { timeout: 10000 });
  await shot(page, 'scene-02.png');

  // 3 拍照上传
  await page.evaluate((vid) => {
    window.__demoVehicleId = vid;
  }, vehicle.id);
  await page.evaluate(async (vid) => {
    const res = await fetch(`/api/vehicles/${vid}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('uca_auth_token')}` },
    });
    const v = await res.json();
    // 触发上传页
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById('page-upload')?.classList.add('active');
    document.querySelectorAll('.tab-item').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'page-upload'));
  }, vehicle.id);
  await page.waitForTimeout(1200);
  await shot(page, 'scene-03.png');

  // 通过编辑按钮进入描述页
  await goTab(page, 'page-list');
  await page.waitForTimeout(500);
  const editBtn = page.locator(`button[data-action="edit"][data-id="${vehicle.id}"]`).first();
  if (await editBtn.count()) {
    await editBtn.click();
  } else {
    await page.locator('#car-list .card').first().locator('button[data-action="edit"]').click();
  }
  await page.waitForTimeout(2000);
  await goScreen(page, 'page-desc');
  await page.waitForTimeout(1000);
  await shot(page, 'scene-04.png');

  // 5 模板预览 — 点「下一步」或直接进入模板页
  await page.evaluate(() => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById('page-template')?.classList.add('active');
  });
  await page.waitForTimeout(2500);
  // 尝试触发生成预览
  await page.evaluate(async () => {
    if (typeof window.generatePosterPreview === 'function') {
      try { await window.generatePosterPreview(); } catch (_) {}
    }
  });
  await page.waitForTimeout(4000);
  await shot(page, 'scene-05.png');

  // 6 图库
  await goTab(page, 'page-gallery');
  await page.waitForTimeout(1000);
  await shot(page, 'scene-06.png');

  // 7 我的 — 配额统计（结尾）
  await goTab(page, 'page-profile');
  await page.waitForSelector('#trial-quota', { timeout: 8000 });
  await shot(page, 'scene-07.png');

  await browser.close();
  console.log(`\n✅ 原始截图: ${OUT_RAW}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
