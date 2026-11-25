import { loadModule, loadIntro, domainOf, ALL, isLangModule, effectiveLang, DIFFICULTY_ORDER } from '../lib/engine.js';
import { crumbsHtml } from './quiz.js';
import { getModuleCellStats, getCookie, setCookie, setCodeLang } from '../lib/storage.js';
import { renderMarkdown } from '../lib/markdown.js';
import { isLang, langTitle } from '../lib/languages.js';
import { esc, icon, cap, fmtPct, scoreClass, errorBox, hashPart, domClass, domStyle, difficultyLabel, difficultyHtml } from './ui.js';
import { getQuizMode, setQuizMode, GUIDED, PRACTICE } from './guided.js';

const ORDER = DIFFICULTY_ORDER;

/*
 * Code language picker (module page of a language-aware module, and Settings): a segmented radio
 * group over `ids` (language ids from js/lib/languages.js) with `current` checked. Titles are escaped.
 * `hint` is optional plain text shown under the label.
 */
export function codeLangPickerHtml(ids, current, { id = 'code-lang', label = 'Language', hint = '', labelIcon = true } = {}) {
  const list = ids.filter(isLang);
  return `<div class="lang-picker">
    <p class="field-label" id="${esc(id)}-label">${labelIcon ? `${icon('code')} ` : ''}${esc(label)}</p>
    ${hint ? `<p class="muted small lang-picker-hint" id="${esc(id)}-hint">${esc(hint)}</p>` : ''}
    <div class="segmented seg-lang" role="radiogroup" aria-labelledby="${esc(id)}-label"${hint ? ` aria-describedby="${esc(id)}-hint"` : ''}>
      ${list.map(l => `<label class="seg"><input type="radio" name="${esc(id)}" value="${esc(l)}" ${l === current ? 'checked' : ''}><span>${esc(langTitle(l))}</span></label>`).join('')}
    </div>
  </div>`;
}

// Saves the picked language (cookie sb_codeLang) whenever a radio inside `scope` changes.
export function bindCodeLangPicker(scope, onChange) {
  scope?.querySelectorAll('.seg-lang input[type="radio"]').forEach(r => r.addEventListener('change', () => {
    if (r.checked && setCodeLang(r.value)) onChange?.(r.value);
  }));
}

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

  // Practice | Guided switch (per tab). Guided cells link to #/g/… and show no best score.
  let mode = getQuizMode();
  const cellHref = (stId, d, m = mode) => `#/${m === GUIDED ? 'g' : 'q'}/${hashPart(mod.id)}/${hashPart(stId)}/${hashPart(d)}`;
  const cellLabel = (stTitle, d, m = mode) => `Start ${m === GUIDED ? 'guided ' : ''}${stTitle}, ${difficultyLabel(d).toLowerCase()}`;

  const cell = (stId, stTitle, d) => {
    const s = stats[`${stId}|${d}`];
    const best = s ? s.best : null;
    return `<td class="${d === preferred ? 'preferred' : ''} ${d === ALL ? 'all-col' : ''}">
        <a class="btn btn-small ${d === preferred ? 'btn-primary' : ''}" href="${cellHref(stId, d)}" data-diff="${esc(d)}"
           data-st="${esc(stId)}" data-st-title="${esc(stTitle)}"
           aria-label="${esc(cellLabel(stTitle, d))}">${icon('play')} Start</a>
        <div class="cell-score score ${scoreClass(best)} practice-only" title="${s ? `${s.attempts} attempt(s)` : 'Not attempted'}">Best ${fmtPct(best)}</div>
        <div class="cell-score cell-guided guided-only">Guided</div>
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
    <section class="card practice ${mode === GUIDED ? 'is-guided' : ''}" id="practice-card">
      <div class="section-head">
        <h2 id="practice-title">${mode === GUIDED ? 'Guided practice' : 'Practice'}</h2>
        <label class="inline-field">Difficulty
          <select id="diff-select">${cols.map(d => `<option value="${esc(d)}" ${d === preferred ? 'selected' : ''}>${esc(difficultyLabel(d))}</option>`).join('')}</select>
        </label>
      </div>
      <div class="mode-switch">
        <div class="segmented seg-mode" role="radiogroup" aria-label="Quiz mode">
          <label class="seg"><input type="radio" name="quiz-mode" value="${PRACTICE}" ${mode === GUIDED ? '' : 'checked'}><span>${icon('target')}Practice</span></label>
          <label class="seg"><input type="radio" name="quiz-mode" value="${GUIDED}" ${mode === GUIDED ? 'checked' : ''}><span>${icon('compass')}Guided</span></label>
        </div>
        <p class="muted small mode-note guided-only">${icon('lightbulb')}Guided: hints, unlimited tries, not scored.</p>
      </div>
      ${isLangModule(mod) ? codeLangPickerHtml(mod.languages, effectiveLang(mod), { id: 'code-lang', label: 'Language' }) : ''}
      ${mod.subtopics.length ? `<div class="table-wrap"><table class="matrix">
        <thead><tr><th scope="col">Subtopic</th>${cols.map(d => `<th scope="col" data-col="${esc(d)}" ${d === ALL ? 'class="all-col" title="All difficulties"' : ''}>${difficultyHtml(d, colLabel(d))}</th>`).join('')}</tr></thead>
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
  // The next quiz started from this page uses the picked language.
  bindCodeLangPicker(root);

  // Practice | Guided: swap the cell links in place (no re-render, so the select/highlight stay).
  const card = root.querySelector('#practice-card');
  root.querySelectorAll('input[name="quiz-mode"]').forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    mode = r.value === GUIDED ? GUIDED : PRACTICE;
    setQuizMode(mode);
    card?.classList.toggle('is-guided', mode === GUIDED);
    const h = root.querySelector('#practice-title');
    if (h) h.textContent = mode === GUIDED ? 'Guided practice' : 'Practice';
    root.querySelectorAll('.matrix a[data-diff]').forEach(a => {
      a.href = cellHref(a.dataset.st, a.dataset.diff);
      a.setAttribute('aria-label', cellLabel(a.dataset.stTitle, a.dataset.diff));
    });
  }));
}
