/**
 * 领导干部应知应会清单制度 — 知识示意图生成测试
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ROOT } = require('../server/db');

const OUT_DIR = path.join(ROOT, 'output', 'cadre-legal-list-article');
const SCRIPT = path.join(ROOT, 'scripts', 'generate-cadre-legal-list-diagrams.js');
const MD = path.join(OUT_DIR, '公众号文章-领导干部应知应会清单制度.md');

function ok(cond, msg) {
  console.log(cond ? `  ✓ ${msg}` : `  ✗ ${msg}`);
  if (!cond) process.exitCode = 1;
}

function main() {
  console.log('\n🧪 应知应会清单制度示意图测试\n');

  try {
    execSync(`node "${SCRIPT}"`, { cwd: ROOT, stdio: 'pipe' });
    ok(true, '示意图生成脚本可执行');
  } catch (e) {
    ok(false, `示意图生成脚本可执行: ${e.message}`);
    return;
  }

  const files = [
    '01-制度要义与总体要求.png',
    '02-党内法规学习重点.png',
    '03-国家法律学习重点.png',
    '04-工作措施与落实路径.png',
  ];
  for (const f of files) {
    const p = path.join(OUT_DIR, f);
    ok(fs.existsSync(p) && fs.statSync(p).size > 1000, `已生成 ${f}`);
  }

  const md = fs.readFileSync(MD, 'utf8');
  ok(md.includes('应知应会'), '文章含主题关键词');
  ok(!/^#{2,3}\s/m.test(md.replace(/^#\s.+$/m, '')), '正文未使用分项小标题');
  ok(md.includes('![](01-制度要义与总体要求.png'), '文章嵌入示意图引用');
  ok(md.includes('ccdi.gov.cn'), '文章注明来源链接');

  console.log('\n完成\n');
}

main();
