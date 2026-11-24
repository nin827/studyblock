import { loadModule, loadIntro } from '../lib/engine.js';
import { getModuleCellStats, getCookie, setCookie } from '../lib/storage.js';
import { renderMarkdown } from '../lib/markdown.js';
import { esc, icon, cap, fmtPct, scoreClass, errorBox, hashPart } from './ui.js';

const ORDER = ['easy', 'medium', 'hard'];

function difficultyColumns(subtopics) {
  const all = [];
  for (const s of subtopics) for (const d of s.difficulties || []) if (!all.includes(d)) all.push(d);
  return all.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

export async function render(root, { moduleId }, ctx) {
  let mod;
  try {
    mod = await loadModule(moduleId);
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Module not found', 'That module does not exist or failed to load.');
    return;
  }
  setCookie('lastModule', mod.id);
  const intro = await loadIntro(mod.id);
  if (!ctx.alive()) return;
  const stats = getModuleCellStats(mod.id);
  const cols = difficultyColumns(mod.subtopics);
  const cookieDiff = getCookie('lastDifficulty');
  const preferred = cols.includes(cookieDiff) ? cookieDiff : cols[0];

  const rows = mod.subtopics.map(st => {
    const cells = cols.map(d => {
      if (!(st.difficulties || []).includes(d)) return '<td class="na">–</td>';
      const s = stats[`${st.id}|${d}`];
      const best = s ? s.best : null;
      const href = `#/q/${hashPart(mod.id)}/${hashPart(st.id)}/${hashPart(d)}`;
      return `<td class="${d === preferred ? 'preferred' : ''}">
        <a class="btn btn-small ${d === preferred ? 'btn-primary' : ''}" href="${href}" data-diff="${esc(d)}"
           aria-label="Start ${esc(st.title ?? st.id)}, ${esc(d)}">${icon('play')} Start</a>
        <div class="cell-score score ${scoreClass(best)}" title="${s ? `${s.attempts} attempt(s)` : 'Not attempted'}">Best ${fmtPct(best)}</div>
      </td>`;
    }).join('');
    return `<tr><th scope="row">${esc(st.title ?? st.id)}</th>${cells}</tr>`;
  }).join('');

  root.innerHTML = `
    <nav class="crumbs"><a href="#/">${icon('arrow-left')} All modules</a></nav>
    <section class="page-head">
      <h1><span class="module-icon">${icon(mod.icon)}</span> ${esc(mod.title ?? mod.id)}</h1>
      <p class="muted">${esc(mod.description ?? '')}</p>
    </section>
    ${intro ? `<article class="card prose">${renderMarkdown(intro)}</article>` : ''}
    <section class="card">
      <div class="section-head">
        <h2>Practice</h2>
        <label class="inline-field">Difficulty
          <select id="diff-select">${cols.map(d => `<option value="${esc(d)}" ${d === preferred ? 'selected' : ''}>${esc(cap(d))}</option>`).join('')}</select>
        </label>
      </div>
      ${mod.subtopics.length ? `<div class="table-wrap"><table class="matrix">
        <thead><tr><th scope="col">Subtopic</th>${cols.map(d => `<th scope="col" data-col="${esc(d)}">${esc(cap(d))}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : '<p class="muted">This module has no subtopics.</p>'}
    </section>
  `;

  const select = root.querySelector('#diff-select');
  const highlight = d => {
    root.querySelectorAll('.matrix td').forEach(td => td.classList.remove('preferred'));
    root.querySelectorAll('.matrix a[data-diff]').forEach(a => {
      const on = a.dataset.diff === d;
      a.classList.toggle('btn-primary', on);
      if (on) a.closest('td').classList.add('preferred');
    });
  };
  select?.addEventListener('change', () => {
    setCookie('lastDifficulty', select.value);
    highlight(select.value);
  });
  root.querySelectorAll('.matrix a[data-diff]').forEach(a =>
    a.addEventListener('click', () => setCookie('lastDifficulty', a.dataset.diff)));
}
