// #/domains: every domain with its groups and subjects (a sibling of the Roles list).

import { loadDomains, loadModulesOf } from '../lib/engine.js';
import { getStatsForModules } from '../lib/storage.js';
import { esc, icon, fmtPct, scoreClass, errorBox, hashPart, domClass, domStyle } from './ui.js';
import { crumbsHtml } from './quiz.js';
import { groupLoaded } from './domain.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const chips = list => `<div class="chip-scroll">${list.map(m =>
  `<a class="chip chip-main" href="#/m/${hashPart(m.id)}">${icon(m.icon)}<span>${esc(m.title ?? m.id)}</span></a>`).join('')}</div>`;

function subjectsHtml(d) {
  if (!d.loaded.length) return '<div class="role-subs"><span class="muted small">Coming soon</span></div>';
  const groups = groupLoaded(d, d.loaded) || [{ id: 'all', title: 'Subjects', modules: d.loaded }];
  return groups.map(g => `<div class="role-subs domain-subs">
      <span class="muted small domain-subs-title">${esc(g.title)}</span>
      ${chips(g.modules)}
    </div>`).join('');
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
  if (!ctx.alive()) return;
  const total = domains.reduce((n, d) => n + d.loaded.length, 0);
  const cards = domains.map(d => {
    const n = d.loaded.length;
    const s = n ? getStatsForModules(d.loaded.map(m => m.id)) : { overall: null };
    const groups = d.loaded.length ? groupLoaded(d, d.loaded) : null;
    const meta = [n ? plural(n, 'subject') : 'Coming soon'];
    if (groups) meta.push(plural(groups.length, 'group'));
    return `<article class="card role-card domain-entry ${domClass(d.id)}"${domStyle(d)}>
      <a class="role-card-main" href="#/d/${hashPart(d.id)}">
        <span class="icon-tile">${icon(d.icon)}</span>
        <span class="role-card-text">
          <span class="role-card-title">${esc(d.title)}</span>
          ${d.description ? `<span class="role-card-sub">${esc(d.description)}</span>` : ''}
          <span class="role-card-meta">${esc(meta.join(' · '))}${s.overall === null ? '' : ` · <span class="score ${scoreClass(s.overall)}">${fmtPct(s.overall)}</span> correct`}</span>
        </span>
        <span class="tool-card-go" aria-hidden="true">${icon('chevron-right')}</span>
      </a>
      ${subjectsHtml(d)}
    </article>`;
  }).join('');
  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { label: 'Domains' }])}
    <section class="page-head">
      <div class="page-head-row">
        <span class="icon-tile">${icon('library')}</span>
        <div><p class="eyebrow">Browse subjects</p><h1>Domains</h1></div>
      </div>
      <p>${esc(`${plural(domains.length, 'domain')} · ${plural(total, 'subject')}.`)} Open a domain for its subjects and scores, or jump straight to a subject.</p>
    </section>
    ${domains.length ? `<div class="role-list domain-list">${cards}</div>` : '<div class="card"><p class="muted">No domains yet.</p></div>'}`;
}
