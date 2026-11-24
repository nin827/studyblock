import { loadDomains, loadModulesOf, loadOfficialPresets } from '../lib/engine.js';
import { getStatsForModules, getCookie, loadMixDraft, getPresets } from '../lib/storage.js';
import { esc, icon, fmtPct, scoreClass, errorBox, hashPart } from './ui.js';

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

  const lastId = getCookie('lastModule');
  const last = domains.flatMap(d => d.loaded).find(m => m.id === lastId);

  const cards = domains.map(d => {
    const n = d.loaded.length;
    if (!n) {
      return `<a class="card module-card is-soon" href="#/d/${hashPart(d.id)}">
        <div class="module-card-head">
          <span class="module-icon">${icon(d.icon)}</span>
          <h2>${esc(d.title)}</h2>
        </div>
        <p class="muted">${esc(d.description)}</p>
        <div class="stats-row"><span>Coming soon</span></div>
      </a>`;
    }
    const s = getStatsForModules(d.loaded.map(m => m.id));
    return `<a class="card module-card" href="#/d/${hashPart(d.id)}">
      <div class="module-card-head">
        <span class="module-icon">${icon(d.icon)}</span>
        <h2>${esc(d.title)}</h2>
      </div>
      <p class="muted">${esc(d.description)}</p>
      <div class="stats-row">
        <span>${n} subdomain${n === 1 ? '' : 's'}</span>
        <span>${s.attempts} attempt${s.attempts === 1 ? '' : 's'}</span>
        <span class="score ${scoreClass(s.overall)}" title="Correct answers across all attempts">Overall ${fmtPct(s.overall)}</span>
        <span class="score ${scoreClass(s.last)}">Last ${fmtPct(s.last)}</span>
      </div>
    </a>`;
  }).join('');

  const anyModules = domains.some(d => d.loaded.length);

  root.innerHTML = `
    <section class="page-head">
      <h1>Choose a domain</h1>
      <p class="muted">Procedurally generated practice. Progress is saved in this browser.</p>
    </section>
    ${last ? `<a class="card continue" href="#/m/${hashPart(last.id)}">
        ${icon('play')}<span>Continue with <strong>${esc(last.title ?? last.id)}</strong></span>${icon('chevron-right')}
      </a>` : ''}
    ${anyModules ? `<section class="card mix-home">
        <a class="mix-card" href="#/mix">
          <span class="module-icon">${icon('shuffle')}</span>
          <span class="mix-card-text"><strong>Mixed quiz</strong>
            <span class="muted">Questions from several domains at once — choose domains, subdomains and weights.</span></span>
          ${icon('chevron-right')}
        </a>
        ${draft || quick.length ? `<div class="chip-scroll quick-start">
          ${draft ? `<a class="chip chip-main is-primary" href="#/mix/play">${icon('play')}<span>Start last mix</span></a>` : ''}
          ${quick.map(p => `<a class="chip chip-main ${p.official ? 'is-official' : ''}" href="#/mix/play?preset=${hashPart(p.id)}"
              title="${esc(p.description || p.name)}">${icon(p.official ? 'badge-check' : 'bookmark')}<span>${esc(p.name)}</span></a>`).join('')}
        </div>` : ''}
      </section>` : ''}
    ${domains.length ? `<div class="grid">${cards}</div>` : '<div class="card"><p class="muted">No modules installed yet.</p></div>'}
  `;
}
