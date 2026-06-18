/** Safari / iOS 浏览器检测与能力判断 */

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|UCBrowser|MicroMessenger|QQ\//i.test(ua);
  return isSafari || isIOS();
}

export function supportsWebShareFiles() {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  if (!navigator.canShare) return isIOS();
  try {
    const probe = new File(['x'], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return isIOS();
  }
}
