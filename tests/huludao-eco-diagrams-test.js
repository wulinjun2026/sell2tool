/**
 * 葫芦岛生态督察整改知识示意图生成测试
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ROOT } = require('../server/db');

const OUT_DIR = path.join(ROOT, 'output', 'huludao-eco-inspection-article');
const MD_FILE = path.join(OUT_DIR, '公众号文章-中央督察通报后的污水整治.md');
const EXPECTED = [
  '01-督察整改责任链.png',
  '02-污水治理四大短板.png',
  '03-黑臭水体整治闭环.png',
  '04-管网排查与六张网.png',
];

function run() {
  let passed = 0;
  let failed = 0;

  function ok(cond, msg) {
    if (cond) {
      passed += 1;
      console.log(`  ✓ ${msg}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${msg}`);
    }
  }

  console.log('\n🧪 葫芦岛生态督察示意图测试\n');

  try {
    require('../scripts/generate-huludao-eco-diagrams');
    ok(true, '示意图生成脚本可执行');
  } catch (e) {
    ok(false, `示意图生成脚本可执行: ${e.message}`);
  }

  ok(fs.existsSync(MD_FILE), '公众号 MD 文章存在');
  const md = fs.readFileSync(MD_FILE, 'utf8');
  ok(md.includes('中央生态环境保护督察'), '文章含督察主题');
  ok(!/^##\s/m.test(md.split('\n').slice(2).join('\n')), '正文不使用二级分项标题');
  ok(!/^\s*[-*]\s/m.test(md), '文章不使用列表分项');
  ok(md.includes('![图1'), '文章嵌入示意图引用');

  for (const file of EXPECTED) {
    const p = path.join(OUT_DIR, file);
    ok(fs.existsSync(p), `${file} 已生成`);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      ok(stat.size > 8000, `${file} 体积合理 (${stat.size} bytes)`);
    }
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
