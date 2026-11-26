// #/d/<domain> — a domain's subdomain (module) cards.

import { loadDomains, loadModulesOf } from '../lib/engine.js';
import { getStats } from '../lib/storage.js';
import { esc, icon, fmtPct, scoreClass, errorBox, hashPart, domClass, domStyle } from './ui.js';
import { crumbsHtml } from './quiz.js';

// `domainId` (optional) tints the card with its domain colour; `domain` adds its registry colour.
export function moduleCard(m, domainId, domain) {
  const s = getStats({ module: m.id });
  const best = s.best ?? 0;
  return `<a class="domain-card ${domClass(domainId)}"${domStyle(domain)} href="#/m/${hashPart(m.id)}">
    <span class="icon-tile">${icon(m.icon)}</span>
    <span class="domain-card-text">
      <span class="domain-card-title">${esc(m.title ?? m.id)}</span>
      <span class="domain-card-sub">${esc(m.description ?? '')}</span>
    </span>
    <span class="domain-card-stats">
      <span class="meter" role="img" aria-label="${esc(`Best score: ${fmtPct(s.best)}`)}"><span style="width:${best}%"></span></span>
      <span class="meter-meta"><span>${s.attempts ? `${s.attempts} attempt${s.attempts === 1 ? '' : 's'} · last <span class="score ${scoreClass(s.last)}">${fmtPct(s.last)}</span>` : 'Not started'}</span>
        <strong class="score ${scoreClass(s.best)}" title="Best score">${s.best === null ? '—' : `Best ${fmtPct(s.best)}`}</strong></span>
    </span>
  </a>`;
}

// Loaded modules of a domain split by its display-only groups: [{ id, title, modules: [module objects] }].
// Groups with no loaded module are left out; returns null when the domain has no groups.
export function groupLoaded(domain, loaded) {
  if (!Array.isArray(domain.groups) || !domain.groups.length) return null;
  const byId = new Map(loaded.map(m => [m.id, m]));
  return domain.groups
    .map(g => ({ id: g.id, title: g.title, modules: g.modules.map(id => byId.get(id)).filter(Boolean) }))
    .filter(g => g.modules.length);
}

// Module cards: one grid, or a titled section per group.
function groupedCards(domain, modules) {
  const grid = list => `<div class="domain-grid is-detailed">${list.map(m => moduleCard(m, domain.id, domain)).join('')}</div>`;
  const groups = groupLoaded(domain, modules);
  if (!groups) return grid(modules);
  return groups.map(g => `<section class="domain-group" aria-labelledby="dg-${esc(g.id)}">
      <h2 class="domain-group-title" id="dg-${esc(g.id)}">${esc(g.title)} <span class="domain-group-count">${g.modules.length}<span class="sr-only"> subject${g.modules.length === 1 ? '' : 's'}</span></span></h2>
      ${grid(g.modules)}
    </section>`).join('');
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
      <div class="page-head-row ${domClass(domain.id)}"${domStyle(domain)}>
        <span class="icon-tile">${icon(domain.icon)}</span>
        <div>
          <p class="eyebrow">Domain</p>
          <h1>${esc(domain.title)}</h1>
        </div>
      </div>
      ${domain.description ? `<p>${esc(domain.description)}</p>` : ''}
    </section>
    ${modules.length ? `
      <a class="card mix-cta" href="#/mix?only=${hashPart(domain.id)}">
        <span class="icon-tile icon-tile-sm">${icon('shuffle')}</span>
        <span class="mix-cta-text"><strong>Mix this domain</strong>
          <span class="muted small">Random questions from all ${esc(domain.title)} subdomains</span></span>
        ${icon('chevron-right')}
      </a>
      ${groupedCards(domain, modules)}`
    : '<div class="card"><p class="muted">Coming soon — no subdomains are available here yet.</p></div>'}
  `;
}
