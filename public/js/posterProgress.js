import { getClientSetting } from './clientSettings.js';

const PHASES = [
  { until: 25, label: '加载产品与模板' },
  { until: 55, label: '嵌入照片素材' },
  { until: 82, label: '渲染长图画面' },
  { until: 94, label: '导出 PNG 图片' },
];

function reportCap() {
  return getClientSetting('progressReportCap');
}

function waitMax() {
  return getClientSetting('progressWaitMax');
}

function phaseLabel(percent, waiting, customLabel) {
  if (customLabel) return customLabel;
  if (waiting || percent >= reportCap()) return '即将完成';
  const hit = PHASES.find((p) => percent < p.until);
  return hit ? hit.label : '即将完成';
}

function formatPercent(value) {
  const cap = reportCap();
  const max = waitMax();
  if (value >= 100) return '100%';
  if (value >= cap) return `${Math.min(max, value).toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function dotsForFrame(frame) {
  return '.'.repeat((frame % 3) + 1);
}

export function showPosterProgress(container) {
  if (!container) return createNoopProgress();

  container.classList.add('poster-generating');
  container.innerHTML = `
    <div class="poster-progress" role="status" aria-live="polite">
      <div class="poster-progress-ring" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <circle class="poster-progress-track" cx="60" cy="60" r="52"></circle>
          <circle class="poster-progress-arc" cx="60" cy="60" r="52"></circle>
        </svg>
        <span class="poster-progress-pct">0%</span>
      </div>
      <p class="poster-progress-label">准备生成长图…</p>
      <div class="poster-progress-bar"><div class="poster-progress-fill"></div></div>
    </div>`;

  const root = container.querySelector('.poster-progress');
  const pctEl = container.querySelector('.poster-progress-pct');
  const labelEl = container.querySelector('.poster-progress-label');
  const fillEl = container.querySelector('.poster-progress-fill');
  const arcEl = container.querySelector('.poster-progress-arc');
  const circumference = 2 * Math.PI * 52;
  arcEl.style.strokeDasharray = `${circumference}`;
  arcEl.style.strokeDashoffset = `${circumference}`;

  let percent = 0;
  let targetPercent = 0;
  let timer = null;
  let done = false;
  let waiting = false;
  let dotFrame = 0;
  let startTitle = '正在生成长图…';
  let customLabel = '';

  function paint() {
    pctEl.textContent = formatPercent(percent);
    const waitingNow = waiting || percent >= reportCap();
    const base = phaseLabel(percent, waitingNow, customLabel);
    labelEl.textContent = waitingNow
      ? `${base}${dotsForFrame(dotFrame)}`
      : `${base}…`;
    fillEl.style.width = `${Math.min(100, percent)}%`;
    arcEl.style.strokeDashoffset = `${circumference * (1 - Math.min(100, percent) / 100)}`;
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function enterWaiting() {
    if (waiting) return;
    waiting = true;
    root.classList.add('poster-progress--waiting');
  }

  function tickProgress() {
    if (done) return;

    const cap = Math.min(targetPercent, reportCap());
    if (percent < cap) {
      const gap = cap - percent;
      const step = gap > 15 ? 2.8 : gap > 8 ? 1.6 : gap > 3 ? 0.9 : gap > 1 ? 0.4 : 0.2;
      percent = Math.min(cap, percent + step);
    } else if (targetPercent >= reportCap() && percent < waitMax()) {
      enterWaiting();
      percent = Math.min(waitMax(), Math.round((percent + 0.1) * 10) / 10);
      dotFrame += 1;
    } else if (percent >= waitMax() - 0.05) {
      enterWaiting();
      percent = waitMax();
      dotFrame += 1;
    }
    paint();
  }

  function animateToHundred() {
    return new Promise((resolve) => {
      const step = () => {
        if (percent >= 100) {
          paint();
          resolve();
          return;
        }
        const delta = Math.max(0.5, (100 - percent) * 0.35);
        percent = Math.min(100, percent + delta);
        paint();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  return {
    start(title = '正在生成长图…') {
      done = false;
      waiting = false;
      dotFrame = 0;
      percent = 0;
      targetPercent = 6;
      customLabel = '';
      startTitle = title;
      root.classList.remove('poster-progress--waiting', 'poster-progress--done');
      labelEl.textContent = title;
      paint();
      clearTimer();
      timer = setInterval(tickProgress, 100);
    },

    /** 上报实际生成进度（0–98），可选阶段文案 */
    report(nextPercent, label) {
      if (done) return;
      if (label) customLabel = label;
      const next = Number(nextPercent);
      if (!Number.isFinite(next)) return;
      targetPercent = Math.max(targetPercent, Math.min(reportCap(), next));
    },

    async complete(message = '长图生成完成') {
      done = true;
      targetPercent = 100;
      clearTimer();
      root.classList.remove('poster-progress--waiting');
      await animateToHundred();
      root.classList.add('poster-progress--done');
      root.innerHTML = `
        <div class="poster-progress-success">
          <div class="poster-progress-check" aria-hidden="true">✓</div>
          <p class="poster-progress-done-text">${message}</p>
        </div>`;
      container.classList.remove('poster-generating');
      await new Promise((r) => setTimeout(r, 650));
    },

    fail(message = '生成失败') {
      done = true;
      clearTimer();
      container.classList.remove('poster-generating');
      container.innerHTML = `<div class="poster-progress-error">${message}</div>`;
    },

    abort() {
      done = true;
      clearTimer();
      container.classList.remove('poster-generating');
    },
  };
}

function createNoopProgress() {
  return {
    start() {},
    report() {},
    async complete() {},
    fail() {},
    abort() {},
  };
}
