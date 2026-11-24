import { loadAllModules, loadDomains } from '../lib/engine.js';
import { getAttempts, getModuleRecords, percent, MIX_MODULE } from '../lib/storage.js';
import { esc, icon, cap, fmtDate, scoreClass, hashPart, domClass, tag, fmtScore, difficultyLabel, subtopicLabel } from './ui.js';
import { reviewItem, moduleBreakdown, cellTag } from './quiz.js';

export async function render(root, params, ctx) {
  const attempts = getAttempts(); // newest first
  let modules = [];
  let domains = [];
  try { domains = await loadDomains(); } catch { /* grouped under "Other" */ }
  try { modules = await loadAllModules(); } catch { /* titles fall back to ids */ }
  if (!ctx.alive()) return;
  const byId = Object.fromEntries(modules.map(m => [m.id, m]));
  const domainOfId = new Map();
  for (const d of domains) for (const mid of d.modules) domainOfId.set(mid, d);
  const modTitle = id => byId[id]?.title ?? id;
  const subTitle = (mid, sid) => subtopicLabel(sid, byId[mid]?.subtopics.find(s => s.id === sid)?.title);

  if (!attempts.length) {
    root.innerHTML = `<section class="page-head"><p class="eyebrow">Your progress</p><h1>History</h1></section>
      <div class="card"><p class="muted">No attempts yet. <a href="#/">Pick a module</a> to get started.</p></div>`;
    return;
  }

  // ---- summary grouped by domain ----
  // Every module that appears in a single attempt or in a mixed question.
  const seenModules = new Set();
  for (const a of attempts) {
    if (a.module !== MIX_MODULE) seenModules.add(a.module);
    else for (const q of a.questions) if (typeof q.module === 'string') seenModules.add(q.module);
  }

  const statRow = (label, list) => {
    const best = Math.max(...list.map(percent));
    const newest = list.reduce((x, y) => (y.ts > x.ts ? y : x));
    const last = percent(newest);
    const correct = list.reduce((s, a) => s + a.score, 0);
    const total = list.reduce((s, a) => s + a.total, 0);
    const avg = total ? Math.round((correct / total) * 100) : 0;
    return `<tr><th scope="row">${label}</th><td>${list.length}</td>
      <td class="score ${scoreClass(best)}">${best}%</td>
      <td class="score ${scoreClass(last)}">${last}%</td>
      <td class="score ${scoreClass(avg)}">${avg}%</td></tr>`;
  };
  const moduleRow = mid => {
    const list = getModuleRecords(mid); // single attempts + per-attempt mixed slices
    if (!list.length) return '';
    const label = byId[mid] ? `<a href="#/m/${hashPart(mid)}">${esc(modTitle(mid))}</a>` : esc(modTitle(mid));
    return statRow(label, list);
  };
  const groupHead = (title, href) =>
    `<tr class="group-row"><th scope="rowgroup" colspan="5">${href ? `<a href="${href}">${esc(title)}</a>` : esc(title)}</th></tr>`;

  let summaryRows = '';
  for (const d of domains) {
    const rows = d.modules.filter(mid => seenModules.has(mid)).map(moduleRow).join('');
    if (rows) summaryRows += groupHead(d.title, `#/d/${hashPart(d.id)}`) + rows;
  }
  const others = [...seenModules].filter(mid => !domainOfId.has(mid)).map(moduleRow).join('');
  if (others) summaryRows += groupHead('Other') + others;
  const mixed = attempts.filter(a => a.module === MIX_MODULE);
  if (mixed.length) summaryRows += groupHead('Mixed') + statRow('<a href="#/mix">Mixed quizzes</a>', mixed);

  // ---- attempt list ----
  const titlesFor = mid => ({ module: modTitle(mid), domain: domainOfId.get(mid)?.title });
  const items = attempts.map(a => {
    const p = percent(a);
    const isMix = a.module === MIX_MODULE;
    const isAll = !isMix && (a.subtopic === 'all' || a.difficulty === 'all');
    const dom = isMix ? null : domainOfId.get(a.module);
    const chip = isMix ? tag('Mix', 'tag-mix') : tag(dom ? dom.title : 'Other', domClass(dom?.id));
    const title = isMix
      ? `<strong>Mixed quiz</strong> · ${esc(a.difficulty === 'any' ? 'Any difficulty' : cap(a.difficulty))}`
      : `<strong>${esc(modTitle(a.module))}</strong> · ${esc(subTitle(a.module, a.subtopic))} · ${esc(difficultyLabel(a.difficulty))}`;
    const qs = isMix
      ? a.questions.map(q => (typeof q.module === 'string'
        ? { ...q, moduleTitle: modTitle(q.module), domain: domainOfId.get(q.module)?.id, domainTitle: domainOfId.get(q.module)?.title, subtopicTitle: subTitle(q.module, q.subtopic) }
        : q))
      : isAll ? a.questions.map(q => (typeof q.subtopic === 'string' ? { ...q, subtopicTitle: subTitle(a.module, q.subtopic) } : q))
      : a.questions;
    return `<li class="card attempt">
      <details>
        <summary>
          <span class="attempt-title">${chip}<span>${title}</span></span>
          <span class="attempt-meta"><span class="muted">${esc(fmtDate(a.ts))}</span>
          <span class="score ${scoreClass(p)}">${fmtScore(a.score)}/${a.total} (${p}%)</span>${icon('chevron-down', 'chev')}</span>
        </summary>
        ${isMix ? `<div class="attempt-breakdown">${moduleBreakdown(qs, titlesFor)}</div>` : ''}
        <ol class="review">${qs.map(q => reviewItem({ q, userAnswer: q.userAnswer ?? '', correct: q.correct, ...(typeof q.credit === 'number' ? { credit: q.credit } : {}), ...(Array.isArray(q.parts) ? { parts: q.parts } : {}) }, isMix || (isAll ? cellTag : false))).join('')}</ol>
      </details>
    </li>`;
  }).join('');

  root.innerHTML = `
    <section class="page-head"><p class="eyebrow">Your progress</p><h1>History</h1></section>
    <section class="card">
      <h2>By module</h2>
      <p class="muted small">Module stats include questions answered inside mixed quizzes.</p>
      <div class="table-wrap"><table class="summary">
        <thead><tr><th scope="col">Module</th><th scope="col">Attempts</th><th scope="col">Best</th><th scope="col">Last</th><th scope="col">Overall</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table></div>
    </section>
    <h2 class="list-head">All attempts</h2>
    <ul class="attempts">${items}</ul>`;
}
