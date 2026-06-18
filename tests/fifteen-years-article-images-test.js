/**
 * 《缘分十五年》写实配图生成测试
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');

const OUT_DIR = path.join(ROOT, 'output', '缘分十五年-男人的独白');
const EXPECTED = [
  '01-深圳初见-一生的坐标.png',
  '02-微信重逢-缘分还在.png',
  '03-病后重逢-性情成溪.png',
  '04-无法赴约的夜晚.png',
];

async function run() {
  const missing = EXPECTED.filter((f) => !fs.existsSync(path.join(OUT_DIR, f)));
  if (missing.length) {
    require('../scripts/generate-fifteen-years-article-images');
    await new Promise((r) => setTimeout(r, 500));
  }

  let ok = true;
  for (const f of EXPECTED) {
    const p = path.join(OUT_DIR, f);
    const exists = fs.existsSync(p);
    const size = exists ? fs.statSync(p).size : 0;
    const pass = exists && size > 8000;
    console.log(pass ? `✓ ${f} (${size} bytes)` : `✗ ${f}`);
    ok = ok && pass;
  }

  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
