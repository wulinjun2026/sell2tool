const boundPanels = new WeakSet();

/** 绑定右侧滑条：列表区域独立滚动，滑条随内容比例显示 */
export function bindListScrollbar(panelEl, shellEl) {
  if (!panelEl || !shellEl || boundPanels.has(panelEl)) return;
  boundPanels.add(panelEl);

  const thumb = shellEl.querySelector('.list-scrollbar-thumb');
  const track = shellEl.querySelector('.list-scrollbar');
  if (!thumb || !track) return;

  const update = () => {
    const { scrollHeight, clientHeight, scrollTop } = panelEl;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 4) {
      track.classList.add('hidden');
      return;
    }
    track.classList.remove('hidden');
    const trackH = track.clientHeight;
    const thumbH = Math.max(40, Math.round((clientHeight / scrollHeight) * trackH));
    const maxTop = Math.max(0, trackH - thumbH);
    const top = overflow > 0 ? (scrollTop / overflow) * maxTop : 0;
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${top}px)`;
  };

  panelEl.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(panelEl);
    if (panelEl.firstElementChild) ro.observe(panelEl.firstElementChild);
  }
  window.addEventListener('resize', update);
  requestAnimationFrame(update);
  return update;
}

export function refreshListScrollbar(panelId) {
  const panel = document.getElementById(panelId);
  const shell = panel?.closest('.list-scroll-shell');
  if (!panel || !shell) return;
  const thumb = shell.querySelector('.list-scrollbar-thumb');
  const track = shell.querySelector('.list-scrollbar');
  if (!thumb || !track) return;

  const { scrollHeight, clientHeight, scrollTop } = panel;
  const overflow = scrollHeight - clientHeight;
  if (overflow <= 4) {
    track.classList.add('hidden');
    return;
  }
  track.classList.remove('hidden');
  const trackH = track.clientHeight;
  const thumbH = Math.max(40, Math.round((clientHeight / scrollHeight) * trackH));
  const maxTop = Math.max(0, trackH - thumbH);
  const top = overflow > 0 ? (scrollTop / overflow) * maxTop : 0;
  thumb.style.height = `${thumbH}px`;
  thumb.style.transform = `translateY(${top}px)`;
}
