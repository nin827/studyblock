import { loadModule, loadIntro, domainOf, ALL } from '../lib/engine.js';
import { crumbsHtml } from './quiz.js';
import { getModuleCellStats, getCookie, setCookie } from '../lib/storage.js';
import { renderMarkdown } from '../lib/markdown.js';
import { esc, icon, cap, fmtPct, scoreClass, errorBox, hashPart, domClass, domStyle, difficultyLabel } from './ui.js';

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
  const domain = await domainOf(mod.id).catch(() => null);
  if (!ctx.alive()) return;
  const stats = getModuleCellStats(mod.id);
  const diffCols = difficultyColumns(mod.subtopics);
  // Whole-module options: an "All" difficulty column (when there is more than one difficulty) and an
  // "All topics" row (when there is more than one subtopic). "all" is a reserved id (see engine.js).
  const withAllCol = diffCols.length > 1;
  const withAllRow = mod.subtopics.length > 1;
  const cols = withAllCol ? [...diffCols, ALL] : diffCols;
  const cookieDiff = getCookie('lastDifficulty');
  const preferred = cols.includes(cookieDiff) ? cookieDiff : cols[0];
  const colLabel = d => (d === ALL ? 'All' : cap(d));

  const cell = (stId, stTitle, d) => {
    const s = stats[`${stId}|${d}`];
    const best = s ? s.best : null;
    const href = `#/q/${hashPart(mod.id)}/${hashPart(stId)}/${hashPart(d)}`;
    return `<td class="${d === preferred ? 'preferred' : ''} ${d === ALL ? 'all-col' : ''}">
        <a class="btn btn-small ${d === preferred ? 'btn-primary' : ''}" href="${href}" data-diff="${esc(d)}"
           aria-label="Start ${esc(stTitle)}, ${esc(difficultyLabel(d).toLowerCase())}">${icon('play')} Start</a>
        <div class="cell-score score ${scoreClass(best)}" title="${s ? `${s.attempts} attempt(s)` : 'Not attempted'}">Best ${fmtPct(best)}</div>
      </td>`;
  };

  const rows = mod.subtopics.map(st => {
    const title = String(st.title ?? st.id);
    const cells = cols.map(d => {
      if (d !== ALL && !(st.difficulties || []).includes(d)) return '<td class="na">–</td>';
      return cell(st.id, title, d);
    }).join('');
    return `<tr><th scope="row">${esc(title)}</th>${cells}</tr>`;
  }).join('') + (withAllRow
    ? `<tr class="all-row"><th scope="row">${icon('layers')}All topics</th>${cols.map(d => cell(ALL, 'all topics', d)).join('')}</tr>`
    : '');

  root.innerHTML = `
    ${crumbsHtml([
      { href: '#/', label: 'Home' },
      ...(domain ? [{ href: `#/d/${hashPart(domain.id)}`, label: domain.title }] : []),
      { label: String(mod.title ?? mod.id) },
    ])}
    <section class="page-head">
      <div class="page-head-row ${domClass(domain?.id)}"${domStyle(domain)}>
        <span class="icon-tile">${icon(mod.icon)}</span>
        <div>
          ${domain ? `<p class="eyebrow">${esc(domain.title)}</p>` : ''}
          <h1>${esc(mod.title ?? mod.id)}</h1>
        </div>
      </div>
      ${mod.description ? `<p>${esc(mod.description)}</p>` : ''}
    </section>
    ${intro ? `<article class="card prose">${renderMarkdown(intro)}</article>` : ''}
    <section class="card practice">
      <div class="section-head">
        <h2>Practice</h2>
        <label class="inline-field">Difficulty
          <select id="diff-select">${cols.map(d => `<option value="${esc(d)}" ${d === preferred ? 'selected' : ''}>${esc(d === ALL ? 'All difficulties' : cap(d))}</option>`).join('')}</select>
        </label>
      </div>
      ${mod.subtopics.length ? `<div class="table-wrap"><table class="matrix">
        <thead><tr><th scope="col">Subtopic</th>${cols.map(d => `<th scope="col" data-col="${esc(d)}" ${d === ALL ? 'class="all-col" title="All difficulties"' : ''}>${esc(colLabel(d))}</th>`).join('')}</tr></thead>
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
