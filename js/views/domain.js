// #/d/<domain> — a domain's subdomain (module) cards.

import { loadDomains, loadModulesOf } from '../lib/engine.js';
import { getStats } from '../lib/storage.js';
import { esc, icon, fmtPct, scoreClass, errorBox, hashPart } from './ui.js';
import { crumbsHtml } from './quiz.js';

export function moduleCard(m) {
  const s = getStats({ module: m.id });
  return `<a class="card module-card" href="#/m/${hashPart(m.id)}">
    <div class="module-card-head">
      <span class="module-icon">${icon(m.icon)}</span>
      <h2>${esc(m.title ?? m.id)}</h2>
    </div>
    <p class="muted">${esc(m.description ?? '')}</p>
    <div class="stats-row">
      <span>${s.attempts} attempt${s.attempts === 1 ? '' : 's'}</span>
      <span class="score ${scoreClass(s.best)}">Best ${fmtPct(s.best)}</span>
      <span class="score ${scoreClass(s.last)}">Last ${fmtPct(s.last)}</span>
    </div>
  </a>`;
}

export async function render(root, { domainId }, ctx) {
  let domain, modules;
  try {
    domain = (await loadDomains()).find(d => d.id === domainId);
    if (domain) modules = await loadModulesOf(domain);
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Could not load modules', 'modules/index.json is missing or invalid. Make sure the app is served over HTTP.');
    return;
  }
  if (!ctx.alive()) return;
  if (!domain) {
    root.innerHTML = errorBox('Domain not found', 'That domain does not exist.');
    return;
  }

  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { label: domain.title }])}
    <section class="page-head">
      <h1><span class="module-icon">${icon(domain.icon)}</span> ${esc(domain.title)}</h1>
      <p class="muted">${esc(domain.description)}</p>
    </section>
    ${modules.length ? `
      <a class="card continue mix-cta" href="#/mix?only=${hashPart(domain.id)}">
        ${icon('shuffle')}<span>Mix this domain <span class="muted">— random questions from all ${esc(domain.title)} subdomains</span></span>${icon('chevron-right')}
      </a>
      <div class="grid">${modules.map(moduleCard).join('')}</div>`
    : '<div class="card"><p class="muted">Coming soon — no subdomains are available here yet.</p></div>'}
  `;
}
