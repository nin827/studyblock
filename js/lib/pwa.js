// Installable web app support: service worker registration, update detection,
// install prompt, and persistent storage. No DOM building here; views call this API.
//
// Off on file:// (no service workers there); every function is a safe no-op.

const IS_HTTP = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
// The single-file bundle (dist/studyblock.html) is a plain page even when served over HTTP: no service worker there.
const IS_BUNDLE = typeof window !== 'undefined' && !!window.__SB_BUNDLE__;
const HAS_SW = IS_HTTP && !IS_BUNDLE && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

let deferredPrompt = null;   // captured beforeinstallprompt event
let installedNow = false;    // set by appinstalled during this session
const installListeners = new Set();

function emitInstallChange() {
  for (const cb of installListeners) {
    try { cb({ canInstall: canInstall(), installed: isInstalled() }); } catch (e) { console.error(e); }
  }
}

// Attach install listeners at import time: beforeinstallprompt can fire before registerPWA runs.
if (typeof window !== 'undefined' && IS_HTTP) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emitInstallChange();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    emitInstallChange();
  });
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', emitInstallChange);
  } catch (e) { /* older browsers */ }
}

/**
 * Register ./sw.js (scope ./). Calls onUpdate(applyUpdate) when a new version is waiting.
 * `applyUpdate()` tells the waiting worker to activate and reloads the page once it takes control;
 * the caller decides when (e.g. not during a quiz).
 * Resolves to the ServiceWorkerRegistration, or null when unsupported / failed.
 */
export async function registerPWA({ onUpdate } = {}) {
  if (!HAS_SW) return null;
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  }
  let reg;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }

  let notified = null;
  const notify = (worker) => {
    // Only an update if a controller exists (first install is not an "update").
    if (!worker || !navigator.serviceWorker.controller || notified === worker) return;
    notified = worker;
    if (typeof onUpdate === 'function') onUpdate(() => applyUpdate(worker));
  };
  const track = (worker) => {
    if (!worker) return;
    if (worker.state === 'installed') { notify(worker); return; }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') notify(reg.waiting || worker);
    });
  };

  if (reg.waiting) notify(reg.waiting);
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));

  // Check for a new version when the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  return reg;
}

let reloading = false;
function applyUpdate(worker) {
  if (!HAS_SW) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  worker.postMessage({ type: 'SKIP_WAITING' });
}

/** True when the browser offered an install prompt we can show. */
export function canInstall() {
  return !!deferredPrompt && !isInstalled();
}

/** Show the native install prompt. Resolves to 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const evt = deferredPrompt;
  deferredPrompt = null; // a prompt event can only be used once
  try {
    evt.prompt();
    const { outcome } = await evt.userChoice;
    return outcome;
  } catch (e) {
    return 'unavailable';
  } finally {
    emitInstallChange();
  }
}

/** Running as an installed app (standalone window / iOS home-screen app). */
export function isInstalled() {
  if (installedNow) return true;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch (e) { /* ignore */ }
  return typeof navigator !== 'undefined' && navigator.standalone === true;
}

/** iOS / iPadOS (no install prompt; show "Share → Add to Home Screen" instead). */
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS desktop UA
}

/** Whether to show the iOS Add-to-Home-Screen hint. */
export function showIOSHint() {
  return IS_HTTP && isIOS() && !isInstalled();
}

/**
 * Subscribe to install-state changes (beforeinstallprompt, appinstalled, prompt used,
 * display-mode change). cb({ canInstall, installed }). Returns an unsubscribe function.
 */
export function onInstallChange(cb) {
  installListeners.add(cb);
  return () => installListeners.delete(cb);
}
export { onInstallChange as onChange };

let persistPromise = null;
/** Ask the browser not to evict our storage. Call-once; resolves to a boolean. */
export function requestPersistentStorage() {
  if (!persistPromise) {
    persistPromise = (async () => {
      try {
        if (!(navigator.storage && navigator.storage.persist)) return false;
        if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
        return !!(await navigator.storage.persist());
      } catch (e) {
        return false;
      }
    })();
  }
  return persistPromise;
}

/** Whether PWA features are available at all (http/https + service worker support). */
export function pwaSupported() {
  return HAS_SW;
}
