import { loadAllModules } from '../lib/engine.js';
import { getStats, getCookie } from '../lib/storage.js';
import { esc, icon, fmtPct, scoreClass, errorBox, hashPart } from './ui.js';

export async function render(root, params, ctx) {
  let modules;
  try {
    modules = await loadAllModules();
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Could not load modules', 'modules/index.json is missing or invalid. Make sure the app is served over HTTP.');
    return;
  }
  if (!ctx.alive()) return;

  const lastId = getCookie('lastModule');
  const last = modules.find(m => m.id === lastId);

  const cards = modules.map(m => {
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
  }).join('');

  root.innerHTML = `
    <section class="page-head">
      <h1>Choose a module</h1>
      <p class="muted">Procedurally generated practice. Progress is saved in this browser.</p>
    </section>
    ${last ? `<a class="card continue" href="#/m/${hashPart(last.id)}">
        ${icon('play')}<span>Continue with <strong>${esc(last.title ?? last.id)}</strong></span>${icon('chevron-right')}
      </a>` : ''}
    ${modules.length ? `<div class="grid">${cards}</div>` : '<div class="card"><p class="muted">No modules installed yet.</p></div>'}
  `;
}
