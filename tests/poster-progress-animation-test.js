/**
 * 长图进度：98% 后细粒度等待动画（98.1%–99.9%）与阶段上报
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const jsSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterProgress.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');
const renderSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterRenderClient.js'), 'utf8');
const embedSrc = fs.readFileSync(path.join(__dirname, '../public/js/posterImageEmbedClient.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

assert.ok(jsSrc.includes("getClientSetting('progressWaitMax')"), 'should creep to configurable wait max while waiting');
assert.ok(jsSrc.includes("getClientSetting('progressReportCap')"), 'actual work should cap at configurable report cap');
assert.ok(jsSrc.includes('formatPercent'), 'should show decimal percent after 98%');
assert.ok(jsSrc.includes('report(nextPercent'), 'should expose report API');
assert.ok(jsSrc.includes('toFixed(1)'), 'decimal display required');
assert.ok(jsSrc.includes('percent + 0.1'), 'should increment by 0.1 after 98%');
assert.ok(jsSrc.includes('targetPercent >= reportCap() && percent < waitMax()'), 'creep only after reaching report cap');

assert.ok(renderSrc.includes('onProgress'), 'render should report milestones');
assert.ok(renderSrc.includes("report(98, '即将完成')"), 'render should finish at 98% before waiting creep');
assert.ok(renderSrc.includes('28 + (54 * done) / total'), 'embed progress mapped to 28–82%');

assert.ok(embedSrc.includes('onProgress?.({ done: finished, total: unique.length })'), 'embed reports per image');

assert.ok(appSrc.includes('onProgress: ({ percent, label }) => progress.report(percent, label)'), 'app wires render to progress');

assert.ok(cssSrc.includes('poster-progress--waiting'), 'waiting styles required');
assert.ok(cssSrc.includes('poster-arc-pulse'), 'arc pulse animation required');
assert.ok(cssSrc.includes('poster-bar-flow'), 'bar flow animation required');

console.log('✓ 长图进度 98% 后细粒度等待动画与阶段上报就绪');
