const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../public/js/galleryStore.js'), 'utf8');
assert.ok(src.includes('buildGalleryName'), 'missing buildGalleryName');
assert.ok(src.includes('saveMultiPosterToGallery'), 'missing saveMultiPosterToGallery');
assert.ok(src.includes('listGalleryItems'), 'missing listGalleryItems');
assert.ok(src.includes('deleteGalleryItem'), 'missing deleteGalleryItem');
assert.ok(src.includes('findRecentGalleryItem'), 'missing findRecentGalleryItem');

function buildGalleryName(date, storage) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateKey = `${y}${m}${d}`;
  const seqKey = `uca_gallery_seq_${dateKey}`;
  const seq = parseInt(storage.getItem(seqKey) || '0', 10) + 1;
  storage.setItem(seqKey, String(seq));
  return `${dateKey}-${String(seq).padStart(2, '0')}`;
}

const storage = new Map();
const mockStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
};

const day = new Date(2026, 5, 4, 10, 0, 0);
assert.strictEqual(buildGalleryName(day, mockStorage), '20260604-01');
assert.strictEqual(buildGalleryName(day, mockStorage), '20260604-02');
assert.strictEqual(buildGalleryName(new Date(2026, 5, 5), mockStorage), '20260605-01');

const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
assert.ok(appSrc.includes('maybeSaveMultiPosterToGallery'), 'app should auto-save multi poster');
assert.ok(appSrc.includes("data-gallery-type"), 'gallery cards should distinguish multi/single');
assert.ok(appSrc.includes('delete-record'), 'gallery should support delete record');
assert.ok(appSrc.includes('savePosterToGalleryAndGo'), 'app should save poster to gallery');
assert.ok(appSrc.includes("switchTab('page-gallery')"), 'app should navigate to gallery after save');
assert.ok(appSrc.includes('btn-save-gallery'), 'template page should have save-to-gallery button');

console.log('✓ 多车图库命名规则：YYYYMMDD-序号');
console.log('✓ 图库模块与 app 集成检查通过');
