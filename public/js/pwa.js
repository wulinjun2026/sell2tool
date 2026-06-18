import { isNativeApp } from './config.js';
import { isIOS } from './browser.js';

export function initPwa() {
  if (isNativeApp()) return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  let deferredPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  const btn = document.getElementById('btn-pwa-install');
  const bannerText = banner?.querySelector('span');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (bannerText) bannerText.textContent = '安装到手机桌面，像 App 一样使用';
    if (btn) btn.textContent = '安装';
    banner?.classList.remove('hidden');
  });

  btn?.addEventListener('click', async () => {
    if (isIOS()) {
      banner?.classList.add('hidden');
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner?.classList.add('hidden');
  });

  if (isIOS() && banner && !window.matchMedia('(display-mode: standalone)').matches) {
    if (bannerText) {
      bannerText.textContent = 'Safari：点分享 →「添加到主屏幕」，像 App 一样使用';
    }
    if (btn) btn.textContent = '知道了';
    banner.classList.remove('hidden');
  }
}
