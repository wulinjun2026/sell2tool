/** 单槽位 / 全局图片上传进度 */

export function createSlotUploadProgress(el) {
  if (!el) return createNoopSlotProgress();

  let overlay = el.querySelector('.photo-upload-progress');
  let fileIndex = 1;
  let fileTotal = 1;

  function ensureOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'photo-upload-progress';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      el.appendChild(overlay);
    }
    return overlay;
  }

  function paint({ fileIndex, fileTotal, filePct, label }) {
    const box = ensureOverlay();
    const overall = fileTotal > 0
      ? Math.round(((fileIndex - 1) + filePct) / fileTotal * 100)
      : Math.round(filePct * 100);
    box.innerHTML = `
      <div class="photo-upload-progress-inner">
        <div class="photo-upload-spinner" aria-hidden="true"></div>
        <div class="photo-upload-pct">${overall}%</div>
        <div class="photo-upload-label">${label || '上传中…'}</div>
        <div class="photo-upload-bar"><div class="photo-upload-fill" style="width:${overall}%"></div></div>
      </div>`;
  }

  return {
    start(nextIndex, nextTotal, fileName = '') {
      fileIndex = nextIndex;
      fileTotal = nextTotal;
      el.classList.add('is-uploading');
      paint({
        fileIndex,
        fileTotal,
        filePct: 0,
        label: fileTotal > 1 ? `第 ${fileIndex}/${fileTotal} 张` : (fileName || '上传中…'),
      });
    },
    setFilePercent(ratio) {
      paint({
        fileIndex,
        fileTotal,
        filePct: Math.max(0, Math.min(1, ratio)),
        label: fileTotal > 1 ? `第 ${fileIndex}/${fileTotal} 张` : '上传中…',
      });
    },
    prepare(nextIndex, nextTotal) {
      this.start(nextIndex, nextTotal);
    },
    done() {
      el.classList.remove('is-uploading');
      overlay?.remove();
      overlay = null;
    },
  };
}

export function showGlobalUploadProgress() {
  let bar = document.getElementById('upload-global-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'upload-global-progress';
    bar.className = 'upload-global-progress';
    bar.hidden = true;
    const host = document.getElementById('page-upload') || document.body;
    host.appendChild(bar);
  }

  return {
    show(current, total, hint = '') {
      bar.hidden = false;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      bar.innerHTML = `
        <div class="upload-global-progress-inner">
          <span class="upload-global-text">📤 正在上传 ${current}/${total}${hint ? ` · ${hint}` : ''}</span>
          <div class="upload-global-bar"><div class="upload-global-fill" style="width:${pct}%"></div></div>
        </div>`;
    },
    hide() {
      bar.hidden = true;
      bar.innerHTML = '';
    },
  };
}

function createNoopSlotProgress() {
  return {
    start() {},
    setFilePercent() {},
    prepare() {},
    done() {},
  };
}
