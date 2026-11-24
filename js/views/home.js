import { loadDomains, loadModulesOf, loadOfficialPresets, normalizeMixConfig, mixShares } from '../lib/engine.js';
import { getStatsForModules, getCookie, loadMixDraft, getPresets, getAttempts, MIX_MODULE } from '../lib/storage.js';
import * as pwa from '../lib/pwa.js';
import { esc, icon, icons, cap, fmtDate, errorBox, hashPart, domClass, domVars, domStyle, tag } from './ui.js';

const RECENT_COUNT = 4;
const INSTALL_DISMISS_KEY = 'studyblock:installCardDismissed';

function installDismissed() {
  try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
}

// Dismissible "Install StudyBlock" card: only when the browser offers a prompt (or on iOS,
// the Add to Home Screen hint); hidden once installed or dismissed.
function setupInstallCard(card, ctx) {
  if (!card) return;
  const draw = () => {
    const prompt = pwa.canInstall();
    const ios = !prompt && pwa.showIOSHint();
    if (pwa.isInstalled() || installDismissed() || (!prompt && !ios)) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    const body = prompt
      ? '<p class="muted">Open it from your home screen or app list, in its own window, even offline.</p>'
      : `<p>Tap ${icon('share')} <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>`;
    card.innerHTML = `<h2>${icon('download')} Install StudyBlock</h2>
      ${body}
      <div class="btn-row">
        ${prompt ? `<button type="button" class="btn btn-primary" data-install="go">${icon('monitor-down')} Install</button>` : ''}
        <button type="button" class="btn" data-install="dismiss">Not now</button>
      </div>`;
    card.hidden = false;
    icons();
  };
  card.addEventListener('click', async e => {
    const b = e.target.closest('[data-install]');
    if (!b) return;
    if (b.dataset.install === 'dismiss') {
      try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* ignore */ }
    } else {
      await pwa.promptInstall();
    }
    if (ctx.alive()) draw();
  });
  const off = pwa.onInstallChange(draw);
  if (typeof ctx.onCleanup === 'function') ctx.onCleanup(off);
  draw();
}

export async function render(root, params, ctx) {
  let domains;
  try {
    const list = await loadDomains();
    domains = await Promise.all(list.map(async d => ({ ...d, loaded: await loadModulesOf(d) })));
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Could not load modules', 'modules/index.json is missing or invalid. Make sure the app is served over HTTP.');
    return;
  }
  let official = [];
  try { official = await loadOfficialPresets(); } catch (e) { console.warn(e); }
  if (!ctx.alive()) return;
  const draft = loadMixDraft();
  const quick = [...official, ...getPresets()];
  const attempts = getAttempts(); // newest first

  const modules = domains.flatMap(d => d.loaded);
  const modById = new Map(modules.map(m => [m.id, m]));
  const domainOfModule = new Map(domains.flatMap(d => d.modules.map(mid => [mid, d])));
  const modTitle = id => String(modById.get(id)?.title ?? id);
  const subTitle = (mid, sid) => String(modById.get(mid)?.subtopics.find(s => s.id === sid)?.title ?? sid);

  // ---- continue card ----
  const lastId = getCookie('lastModule');
  const last = modById.get(lastId);
  let continueCard = '';
  if (last) {
    const d = domainOfModule.get(last.id);
    const a = attempts.find(x => x.module === last.id);
    const title = a ? `${modTitle(last.id)} · ${subTitle(last.id, a.subtopic)}` : modTitle(last.id);
    const meta = a ? `${cap(a.difficulty)} · last score ${a.score} / ${a.total}` : (last.description || 'Not started yet');
    continueCard = `<a class="continue-card" href="#/m/${hashPart(last.id)}">
      <span class="continue-body">
        <span class="continue-label"><span>Continue where you left off</span>${d ? tag(d.title, domClass(d.id)) : ''}</span>
        <span class="continue-text">
          <span class="continue-title">${esc(title)}</span>
          <span class="continue-meta">${esc(meta)}</span>
        </span>
      </span>
      <span class="continue-go">${icon('play')}<span class="continue-go-label">Resume</span></span>
    </a>`;
  }

  // ---- domain cards ----
  const totalModules = domains.reduce((n, d) => n + d.loaded.length, 0);
  const cards = domains.map(d => {
    const n = d.loaded.length;
    const dc = domClass(d.id);
    if (!n) {
      return `<a class="domain-card is-soon ${dc}"${domStyle(d)} href="#/d/${hashPart(d.id)}">
        <span class="icon-tile">${icon(d.icon)}</span>
        <span class="domain-card-text">
          <span class="domain-card-title">${esc(d.title)}</span>
          <span class="domain-card-sub">${esc(d.description || 'Coming soon')}</span>
        </span>
        <span class="domain-card-stats">
          <span class="meter" aria-hidden="true"><span style="width:0%"></span></span>
          <span class="meter-meta"><span>Coming soon</span><strong>—</strong></span>
        </span>
      </a>`;
    }
    const s = getStatsForModules(d.loaded.map(m => m.id));
    const pct = s.overall ?? 0;
    return `<a class="domain-card ${dc}"${domStyle(d)} href="#/d/${hashPart(d.id)}">
      <span class="icon-tile">${icon(d.icon)}</span>
      <span class="domain-card-text">
        <span class="domain-card-title">${esc(d.title)}</span>
        <span class="domain-card-sub">${esc(d.loaded.map(m => m.title ?? m.id).join(', '))}</span>
      </span>
      <span class="domain-card-stats">
        <span class="meter" role="img" aria-label="${esc(`${d.title}: ${s.overall === null ? 'not started' : `${pct}% correct overall`}`)}"><span style="width:${pct}%"></span></span>
        <span class="meter-meta"><span>${s.attempts ? `${s.attempts} quiz${s.attempts === 1 ? '' : 'zes'}` : 'Not started'}</span>
          <strong title="Correct answers across all attempts">${s.overall === null ? '—' : `${pct}%`}</strong></span>
      </span>
    </a>`;
  }).join('');

  // ---- mixed quiz banner (share bar of the current draft, or the default mix) ----
  const available = domains.map(d => {
    const loaded = d.loaded.filter(m => m.subtopics.length);
    return { ...d, modules: loaded.map(m => m.id), loaded };
  });
  const anyModules = available.some(d => d.modules.length);
  let banner = '';
  if (anyModules) {
    const cfg = normalizeMixConfig(draft?.config ?? null, available);
    const byDomain = new Map();
    for (const r of mixShares(cfg, available)) byDomain.set(r.domain, (byDomain.get(r.domain) || 0) + r.share);
    const domById = new Map(available.map(d => [d.id, d]));
    const parts = [...byDomain.entries()].map(([id, s]) => ({ id, d: domById.get(id), title: domById.get(id)?.title ?? id, pct: Math.round(s * 100), s }));
    const label = parts.length ? `${draft ? 'Last mix' : 'Default mix'}: ${parts.map(p => `${p.title} ${p.pct}%`).join(', ')}` : 'Empty mix';
    banner = `<section class="mix-banner" aria-labelledby="mix-h">
      <div class="mix-banner-text">
        <h2 id="mix-h">Mixed quiz</h2>
        <p class="mix-banner-desc">Choose domains and subdomains, weight how often each appears, and get one shuffled quiz.</p>
        <div class="share-bar" role="img" aria-label="${esc(label)}">${parts.map(p =>
          `<span class="share-seg ${domClass(p.id)}" style="${domVars(p.d)}flex-grow:${p.s.toFixed(4)}"></span>`).join('')}</div>
        <ul class="legend" aria-hidden="true">${parts.map(p =>
          `<li class="${domClass(p.id)}"${domStyle(p.d)}><span class="swatch"></span>${esc(p.title)} ${p.pct}%</li>`).join('')}</ul>
      </div>
      <div class="mix-banner-actions">
        ${draft ? `<a class="btn btn-on-dark" href="#/mix/play">${icon('play')} Start last mix</a>` : ''}
        <a class="btn ${draft ? 'btn-outline-dark' : 'btn-on-dark'}" href="#/mix">${draft ? 'Edit mix' : `${icon('sliders-horizontal')} Build a mix`}</a>
      </div>
      <div class="chip-scroll">
        ${draft ? `<a class="chip chip-main is-primary" href="#/mix/play">${icon('play')}<span>Last mix</span></a>` : ''}
        ${quick.map(p => `<a class="chip chip-main ${p.official ? 'is-official' : ''}" href="#/mix/play?preset=${hashPart(p.id)}"
            title="${esc(p.description || p.name)}">${icon(p.official ? 'badge-check' : 'bookmark')}<span>${esc(p.name)}</span></a>`).join('')}
        <a class="chip chip-main mobile-only" href="#/mix">${icon('sliders-horizontal')}<span>${draft ? 'Edit mix' : 'Build a mix'}</span></a>
      </div>
    </section>`;
  }

  // ---- recent attempts ----
  const recent = attempts.slice(0, RECENT_COUNT).map(a => {
    const isMix = a.module === MIX_MODULE;
    let chip, title;
    if (isMix) {
      const ds = new Set(a.questions.map(q => domainOfModule.get(q.module)?.id).filter(Boolean));
      chip = tag('Mix', 'tag-mix');
      title = `Mixed quiz · ${ds.size} domain${ds.size === 1 ? '' : 's'} · ${a.difficulty === 'any' ? 'Any' : cap(a.difficulty)}`;
    } else {
      const d = domainOfModule.get(a.module);
      chip = tag(d ? d.title : 'Other', domClass(d?.id));
      title = `${modTitle(a.module)} · ${subTitle(a.module, a.subtopic)} · ${cap(a.difficulty)}`;
    }
    return `<li>${chip}<span class="recent-title">${esc(title)}</span>
      <span class="recent-when">${esc(fmtDate(a.ts))}</span>
      <span class="recent-score">${a.score} / ${a.total}</span></li>`;
  }).join('');

  root.innerHTML = `<div class="stack">
    <section class="hero">
      <div class="hero-text">
        <h1 class="eyebrow">Practice</h1>
        <p class="hero-title">Pick a domain, or mix them all.</p>
        <p class="hero-sub">Every question is generated fresh and checked before you see it. Progress stays in this browser.</p>
      </div>
      ${continueCard}
    </section>
    <section class="card" id="home-install" aria-label="Install app" hidden></section>
    <section aria-labelledby="domains-h">
      <div class="section-head">
        <h2 id="domains-h" class="section-title">Domains</h2>
        <span class="section-meta">${domains.length} domain${domains.length === 1 ? '' : 's'} · ${totalModules} subdomain${totalModules === 1 ? '' : 's'}</span>
      </div>
      ${domains.length ? `<div class="domain-grid">${cards}</div>` : '<div class="card"><p class="muted">No modules installed yet.</p></div>'}
    </section>
    ${banner}
    ${recent ? `<section aria-labelledby="recent-h">
      <div class="section-head">
        <h2 id="recent-h" class="section-title">Recent</h2>
        <a class="section-link" href="#/results">All history</a>
      </div>
      <ol class="recent">${recent}</ol>
    </section>` : ''}
  </div>`;
  setupInstallCard(root.querySelector('#home-install'), ctx);
}
