// Bootstrap + hash router.

import * as home from './views/home.js';
import * as moduleView from './views/module.js';
import * as quiz from './views/quiz.js';
import * as results from './views/results.js';
import * as settings from './views/settings.js';
import { applyTheme } from './views/settings.js';
import { getCookie } from './lib/storage.js';
import { icons, errorBox } from './views/ui.js';

const ID_RE = /^[a-z0-9-]+$/;

function decode(s) {
  try { return decodeURIComponent(s); } catch { return null; }
}

function match(hash) {
  const path = (hash.replace(/^#/, '') || '/').replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decode);
  if (parts.some(p => p === null)) return null;
  if (parts.length === 0) return { view: home, nav: 'home', params: {} };
  if (parts[0] === 'm' && parts.length === 2 && ID_RE.test(parts[1])) {
    return { view: moduleView, nav: 'home', params: { moduleId: parts[1] } };
  }
  if (parts[0] === 'q' && parts.length === 4 && ID_RE.test(parts[1])) {
    return { view: quiz, nav: 'home', params: { moduleId: parts[1], subtopic: parts[2], difficulty: parts[3] } };
  }
  if (parts[0] === 'results' && parts.length === 1) return { view: results, nav: 'results', params: {} };
  if (parts[0] === 'settings' && parts.length === 1) return { view: settings, nav: 'settings', params: {} };
  return null;
}

const main = document.getElementById('app');
let token = 0;
let cleanups = [];

async function route() {
  cleanups.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  cleanups = [];
  const my = ++token;
  const ctx = {
    alive: () => my === token,
    onCleanup: fn => cleanups.push(fn),
  };

  const r = match(location.hash);
  document.querySelectorAll('.nav-link').forEach(a =>
    a.classList.toggle('active', !!r && a.dataset.nav === r.nav));

  main.setAttribute('aria-busy', 'true');
  if (!r) {
    main.innerHTML = errorBox('Page not found', 'That address does not match any page.');
  } else {
    try {
      await r.view.render(main, r.params, ctx);
    } catch (e) {
      console.error(e);
      if (ctx.alive()) main.innerHTML = errorBox('Something went wrong', e.message || String(e));
    }
  }
  if (!ctx.alive()) return;
  main.removeAttribute('aria-busy');
  icons();
  window.scrollTo(0, 0);
}

applyTheme(getCookie('theme'));
window.addEventListener('hashchange', route);
route();
