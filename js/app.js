// Bootstrap + hash router.

import * as home from './views/home.js';
import * as moduleView from './views/module.js';
import * as domainView from './views/domain.js';
import * as mix from './views/mix.js';
import * as quiz from './views/quiz.js';
import * as results from './views/results.js';
import * as settings from './views/settings.js';
import * as calcPage from './views/calcpage.js';
import * as roles from './views/roles.js';
import * as domainsView from './views/domains.js';
import * as badges from './views/badges.js';
import { applyTheme } from './views/settings.js';
import { getCookie } from './lib/storage.js';
import { icons, errorBox, esc, icon } from './views/ui.js';
import * as folder from './lib/folder.js';
import { registerPWA } from './lib/pwa.js';

const ID_RE = /^[a-z0-9-]+$/;
const guidedView = { render: quiz.renderGuided };

function decode(s) {
  try { return decodeURIComponent(s); } catch { return null; }
}

function match(hash) {
  // Optional "?key=value" suffix (#/mix?only=<domain>, #/mix/play?preset=<id>, role quizzes' ?n=<count>).
  const raw = hash.replace(/^#/, '');
  const qi = raw.indexOf('?');
  const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  const path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decode);
  if (parts.some(p => p === null)) return null;
  if (parts.length === 0) return { view: home, nav: 'home', params: {} };
  if (parts[0] === 'd' && parts.length === 2 && ID_RE.test(parts[1])) {
    return { view: domainView, nav: 'home', params: { domainId: parts[1] } };
  }
  if (parts[0] === 'mix' && parts.length === 1) {
    const only = query.get('only');
    return { view: mix, nav: 'mix', params: only && ID_RE.test(only) ? { only } : {} };
  }
  if (parts[0] === 'mix' && parts.length === 2 && (parts[1] === 'play' || parts[1] === 'guided')) {
    // ?preset=<id> (quick-start chip). Only used to look up a preset by id, never in a path.
    // #/mix/guided runs the same mix in guided mode.
    const preset = query.get('preset');
    return { view: { render: parts[1] === 'guided' ? mix.renderGuidedPlay : mix.renderPlay }, nav: 'mix', params: preset && preset.length <= 120 ? { preset } : {} };
  }
  if (parts[0] === 'm' && parts.length === 2 && ID_RE.test(parts[1])) {
    return { view: moduleView, nav: 'home', params: { moduleId: parts[1] } };
  }
  if (parts[0] === 'q' && parts.length === 4 && ID_RE.test(parts[1])) {
    return { view: quiz, nav: 'home', params: { moduleId: parts[1], subtopic: parts[2], difficulty: parts[3] } };
  }
  // Guided practice: same params and validation as #/q/…
  if (parts[0] === 'g' && parts.length === 4 && ID_RE.test(parts[1])) {
    return { view: guidedView, nav: 'home', params: { moduleId: parts[1], subtopic: parts[2], difficulty: parts[3] } };
  }
  if (parts[0] === 'domains' && parts.length === 1) return { view: domainsView, nav: 'domains', params: {} };
  // Roles: #/roles, #/roles/<role>, #/roles/<role>/<subrole>.
  if (parts[0] === 'roles' && parts.length === 1) {
    const ind = query.get('industry');
    return { view: roles, nav: 'roles', params: ind && ID_RE.test(ind) ? { industry: ind } : {} };
  }
  if (parts[0] === 'roles' && (parts.length === 2 || parts.length === 3) && parts.slice(1).every(p => ID_RE.test(p))) {
    return { view: { render: roles.renderRole }, nav: 'roles', params: { roleId: parts[1], subroleId: parts[2] ?? null } };
  }
  // Role quizzes: #/rq/<role>[~<subrole>]/<level>[?n=<count>] (practice) and #/rg/… (guided).
  // `n` = question count (5-50, clamped by the view); absent or not a number = the level's default.
  if ((parts[0] === 'rq' || parts[0] === 'rg') && parts.length === 3) {
    const ids = parts[1].split('~');
    if (ids.length <= 2 && ids.every(p => ID_RE.test(p)) && ID_RE.test(parts[2])) {
      const n = query.get('n');
      return {
        view: { render: parts[0] === 'rg' ? roles.renderGuidedPlay : roles.renderPlay },
        nav: 'roles',
        params: { roleId: ids[0], subroleId: ids[1] ?? null, level: parts[2], count: n && /^\d{1,3}$/.test(n) ? Number(n) : null },
      };
    }
  }
  if (parts[0] === 'results' && parts.length === 1) return { view: results, nav: 'results', params: {} };
  if (parts[0] === 'badges' && parts.length === 1) return { view: badges, nav: 'results', params: {} };
  if (parts[0] === 'settings' && parts.length === 1) return { view: settings, nav: 'settings', params: {} };
  if (parts[0] === 'calc' && parts.length === 1) return { view: calcPage, nav: 'calc', params: {} };
  return null;
}

const main = document.getElementById('app');
const pageTitle = document.getElementById('page-title');
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
  // Compact header on phones shows the current page title (textContent only — no HTML).
  const h1 = main.querySelector('h1');
  const title = (h1?.textContent || '').replace(/\s+/g, ' ').trim();
  if (pageTitle) pageTitle.textContent = title;
  document.title = title ? `${title} · StudyBlock` : 'StudyBlock';
  icons();
  // A view may set ctx.scrollTarget (an element) to open scrolled to it instead of the top.
  if (ctx.scrollTarget?.isConnected) ctx.scrollTarget.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

// ---- data folder banner (outside #app, so routing never wipes it) ----

const BANNER_DISMISS_KEY = 'studyblock:bannerDismissed';
const isFileProtocol = location.protocol === 'file:';

function bannerEl() {
  let el = document.getElementById('sb-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-banner';
    el.className = 'container';
    el.hidden = true;
    main.parentNode.insertBefore(el, main);
  }
  return el;
}

function bannerKind(f) {
  if (f.status === 'needs-permission') return f.denied ? 'denied' : 'resume';
  if (!isFileProtocol) return null;
  if (f.status === 'none') return 'connect';
  if (f.status === 'unsupported') return 'export';
  return null;
}

function dismissed(kind) {
  try { return sessionStorage.getItem(BANNER_DISMISS_KEY) === kind; } catch { return false; }
}

function renderBanner(f = folder.info()) {
  const el = bannerEl();
  const kind = bannerKind(f);
  if (!kind || dismissed(kind)) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const name = f.name ? `<strong>${esc(f.name)}</strong>` : 'your data folder';
  let text;
  let action = '';
  if (kind === 'resume') {
    text = `Click anywhere to resume syncing to ${name}.`;
    action = `<button type="button" class="btn btn-small btn-primary" data-banner="reconnect" data-folder-skip>${icon('refresh-cw')} Reconnect</button>`;
  } else if (kind === 'denied') {
    text = `StudyBlock can't save to ${name} until you allow it again.`;
    action = `<button type="button" class="btn btn-small btn-primary" data-banner="reconnect" data-folder-skip>${icon('refresh-cw')} Reconnect</button>`;
  } else if (kind === 'connect') {
    text = 'Connect a data folder so your progress is safe.';
    action = `<button type="button" class="btn btn-small btn-primary" data-banner="connect" data-folder-skip>${icon('folder-plus')} Connect data folder</button>`;
  } else {
    text = 'Progress saved from a file opened on disk is easy to lose. Export it regularly from Settings.';
    action = `<a class="btn btn-small" href="#/settings">${icon('settings')} Settings</a>`;
  }
  const msg = f.message && f.messageKind === 'bad' ? `<p class="msg bad">${esc(f.message)}</p>` : '';
  el.innerHTML = `<div class="card" role="status">
      ${icon(kind === 'export' ? 'triangle-alert' : 'folder-sync')}
      <p>${text}</p>
      <div class="btn-row">${action}
        <button type="button" class="btn btn-small" data-banner="dismiss" data-folder-skip aria-label="Dismiss">${icon('x')}</button>
      </div>${msg}
    </div>`;
  el.hidden = false;
  icons();
}

bannerEl().addEventListener('click', e => {
  const b = e.target.closest('[data-banner]');
  if (!b) return;
  const what = b.dataset.banner;
  if (what === 'dismiss') {
    try { sessionStorage.setItem(BANNER_DISMISS_KEY, bannerKind(folder.info()) || ''); } catch { /* ignore */ }
    renderBanner();
  } else if (what === 'reconnect') folder.reconnect();
  else if (what === 'connect') folder.connect();
});

// Re-render pages that show stored data when a folder merge brought in new attempts/presets.
const REFRESH_ON_MERGE = new Set(['home', 'results', 'roles', 'domains']);
folder.subscribe(f => {
  renderBanner(f);
  if (f.merged) {
    const r = match(location.hash);
    if (r && REFRESH_ON_MERGE.has(r.nav) && r.view !== quiz && r.view !== guidedView && r.view !== mix && !/^#\/r[qg]\//.test(location.hash)) route();
  }
});

// ---- PWA update toast ("Update available · Reload"); never auto-applies ----

function showUpdateToast(applyUpdate) {
  if (document.getElementById('sb-update')) return;
  const el = document.createElement('div');
  el.id = 'sb-update';
  el.className = 'card';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>Update available</span>
    <button type="button" class="btn btn-small btn-primary" data-act="reload">${icon('refresh-cw')} Reload</button>
    <button type="button" class="btn btn-small" data-act="close" aria-label="Dismiss">${icon('x')}</button>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'reload') {
      // A quiz in progress would be lost on reload: ask first.
      const inQuiz = /^#\/(q\/|g\/|rq\/|rg\/|mix\/(play|guided))/.test(location.hash);
      if (inQuiz && !confirm('Reload now? The quiz in progress will be lost.')) return;
      applyUpdate();
    } else el.remove();
  });
  document.body.appendChild(el);
  icons();
}

registerPWA({ onUpdate: showUpdateToast }).catch(e => console.warn('StudyBlock: PWA setup failed', e));

applyTheme(getCookie('theme'));
window.addEventListener('hashchange', route);
route();
// init() sets its instant guess (from the sb_folder marker) synchronously, before the banner draws.
folder.init().catch(e => console.error('StudyBlock: data folder init failed', e));
renderBanner();
