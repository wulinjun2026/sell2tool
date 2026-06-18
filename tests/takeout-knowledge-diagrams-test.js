/**
 * 外卖异物知识示意图生成测试
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../server/db');

const OUT_DIR = path.join(ROOT, 'output', 'takeout-food-safety-article');
const EXPECTED = [
  '01-外卖异物能不能要十倍.png',
  '02-索赔要备齐什么.png',
  '03-十倍怎么算.png',
  '04-这些情况要小心.png',
];

async function run() {
  const missing = EXPECTED.filter((f) => !fs.existsSync(path.join(OUT_DIR, f)));
  if (missing.length) {
    require('../scripts/generate-takeout-knowledge-diagrams');
    await new Promise((r) => setTimeout(r, 500));
  }

  let ok = true;
  for (const f of EXPECTED) {
    const p = path.join(OUT_DIR, f);
    const exists = fs.existsSync(p);
    const size = exists ? fs.statSync(p).size : 0;
    const pass = exists && size > 10000;
    console.log(pass ? `✓ ${f} (${size} bytes)` : `✗ ${f}`);
    ok = ok && pass;
  }

  const articlePath = path.join(OUT_DIR, '公众号文章-外卖异物与惩罚性赔偿.md');
  const articleOk = fs.existsSync(articlePath) && fs.readFileSync(articlePath, 'utf8').includes('法释〔2024〕9号');
  console.log(articleOk ? '✓ 公众号文章已生成' : '✗ 公众号文章缺失');
  process.exit(ok && articleOk ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
