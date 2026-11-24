import { loadAllModules } from '../lib/engine.js';
import { getAttempts, percent } from '../lib/storage.js';
import { esc, icon, cap, fmtDate, scoreClass, hashPart } from './ui.js';
import { reviewItem } from './quiz.js';

export async function render(root, params, ctx) {
  const attempts = getAttempts(); // newest first
  let modules = [];
  try { modules = await loadAllModules(); } catch { /* titles fall back to ids */ }
  if (!ctx.alive()) return;
  const byId = Object.fromEntries(modules.map(m => [m.id, m]));
  const modTitle = id => byId[id]?.title ?? id;
  const subTitle = (mid, sid) => byId[mid]?.subtopics.find(s => s.id === sid)?.title ?? sid;

  if (!attempts.length) {
    root.innerHTML = `<section class="page-head"><h1>History</h1></section>
      <div class="card"><p class="muted">No attempts yet. <a href="#/">Pick a module</a> to get started.</p></div>`;
    return;
  }

  // Per-module summary
  const groups = {};
  for (const a of attempts) (groups[a.module] ||= []).push(a);
  const summaryRows = Object.entries(groups).map(([mid, list]) => {
    const best = Math.max(...list.map(percent));
    const last = percent(list[0]);
    const correct = list.reduce((s, a) => s + a.score, 0);
    const total = list.reduce((s, a) => s + a.total, 0);
    const avg = total ? Math.round((correct / total) * 100) : 0;
    const link = byId[mid] ? `<a href="#/m/${hashPart(mid)}">${esc(modTitle(mid))}</a>` : esc(modTitle(mid));
    return `<tr><th scope="row">${link}</th><td>${list.length}</td>
      <td class="score ${scoreClass(best)}">${best}%</td>
      <td class="score ${scoreClass(last)}">${last}%</td>
      <td class="score ${scoreClass(avg)}">${avg}%</td></tr>`;
  }).join('');

  const items = attempts.map(a => {
    const p = percent(a);
    return `<li class="card attempt">
      <details>
        <summary>
          <span class="attempt-title"><strong>${esc(modTitle(a.module))}</strong> · ${esc(subTitle(a.module, a.subtopic))} · ${esc(cap(a.difficulty))}</span>
          <span class="attempt-meta"><span class="muted">${esc(fmtDate(a.ts))}</span>
          <span class="score ${scoreClass(p)}">${a.score}/${a.total} (${p}%)</span>${icon('chevron-down', 'chev')}</span>
        </summary>
        <ol class="review">${a.questions.map(q => reviewItem({ q, userAnswer: q.userAnswer ?? '', correct: q.correct })).join('')}</ol>
      </details>
    </li>`;
  }).join('');

  root.innerHTML = `
    <section class="page-head"><h1>History</h1></section>
    <section class="card">
      <h2>By module</h2>
      <div class="table-wrap"><table class="summary">
        <thead><tr><th scope="col">Module</th><th scope="col">Attempts</th><th scope="col">Best</th><th scope="col">Last</th><th scope="col">Overall</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table></div>
    </section>
    <h2 class="list-head">All attempts</h2>
    <ul class="attempts">${items}</ul>`;
}
