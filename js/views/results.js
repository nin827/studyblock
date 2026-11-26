import { loadAllModules, loadDomains, loadArchived, titleLookup, loadRoles, parseRoleKey, normalizeRoleLevel } from '../lib/engine.js';
import { getAttempts, getModuleRecords, percent, isGuided, MIX_MODULE, ROLE_MODULE } from '../lib/storage.js';
import { esc, icon, cap, fmtDate, scoreClass, hashPart, domClass, tag, fmtScore, difficultyHtml, subtopicLabel } from './ui.js';
import { reviewItem, moduleBreakdown, cellTag, questionTag, guidedItemHtml } from './quiz.js';

export async function render(root, params, ctx) {
  const attempts = getAttempts(); // newest first
  let modules = [];
  let domains = [];
  try { domains = await loadDomains(); } catch { /* grouped under "Other" */ }
  try { modules = await loadAllModules(); } catch { /* titles fall back to ids */ }
  // Archived modules are never loaded; their stored attempts show the archived title (no link).
  let archived = new Map();
  try { archived = await loadArchived(); } catch { /* titles fall back to ids */ }
  // Roles: titles for role attempts and their role-only (Expert+) modules.
  let roles = [];
  try { roles = await loadRoles(); } catch { /* titles fall back to ids */ }
  if (!ctx.alive()) return;
  const roleOnly = roles.map(r => r.exclusiveModule).filter(Boolean);
  const byId = Object.fromEntries(modules.concat(roleOnly).map(m => [m.id, m]));
  const domainOfId = new Map();
  for (const d of domains) for (const mid of d.modules) domainOfId.set(mid, d);
  const modTitle = titleLookup(modules.concat(roleOnly), archived);
  // Role-only modules count only under their role, never in the per-module summary.
  const roleOnlyIds = new Set(roles.map(r => r.exclusive).filter(Boolean));
  const isRoleOnly = mid => roleOnlyIds.has(mid) || (!domainOfId.has(mid) && !archived.has(mid) && String(mid).startsWith('role-'));
  const roleOfOnly = new Map(roles.filter(r => r.exclusive).map(r => [r.exclusive, r]));
  // "<role>" / "<role>~<subrole>" -> { title (plain text), icon, href|null }.
  const roleInfo = key => {
    const k = parseRoleKey(key);
    const r = k && roles.find(x => x.id === k.roleId);
    const sr = r && k.subroleId ? r.subroles.find(x => x.id === k.subroleId) : null;
    if (!r || (k.subroleId && !sr)) return { title: String(key ?? 'Role'), icon: 'briefcase-business', href: null };
    return {
      title: sr ? `${r.title} › ${sr.title}` : r.title,
      icon: (sr && sr.icon) || r.icon,
      href: `#/roles/${hashPart(r.id)}${sr ? `/${hashPart(sr.id)}` : ''}`,
    };
  };
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
    if (isGuided(a)) continue; // guided runs never count in the summary
    if (a.module !== MIX_MODULE && a.module !== ROLE_MODULE) seenModules.add(a.module);
    else for (const q of a.questions) if (typeof q.module === 'string' && !isRoleOnly(q.module)) seenModules.add(q.module);
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
  const unlisted = [...seenModules].filter(mid => !domainOfId.has(mid));
  const archivedRows = unlisted.filter(mid => archived.has(mid)).map(moduleRow).join('');
  if (archivedRows) summaryRows += groupHead('Archived') + archivedRows;
  const others = unlisted.filter(mid => !archived.has(mid)).map(moduleRow).join('');
  if (others) summaryRows += groupHead('Other') + others;
  const mixed = attempts.filter(a => a.module === MIX_MODULE && !isGuided(a));
  if (mixed.length) summaryRows += groupHead('Mixed') + statRow('<a href="#/mix">Mixed quizzes</a>', mixed);
  // Roles: one row per role / subrole (all levels together).
  const roleAttempts = attempts.filter(a => a.module === ROLE_MODULE && !isGuided(a));
  if (roleAttempts.length) {
    const keys = [...new Set(roleAttempts.map(a => a.subtopic))].sort();
    summaryRows += groupHead('Roles', '#/roles') + keys.map(k => {
      const info = roleInfo(k);
      return statRow(info.href ? `<a href="${info.href}">${esc(info.title)}</a>` : esc(info.title), roleAttempts.filter(a => a.subtopic === k));
    }).join('');
  }

  // ---- attempt list ----
  const titlesFor = mid => ({ module: modTitle(mid), domain: domainOfId.get(mid)?.title ?? roleOfOnly.get(mid)?.title });
  const guidedTag = `<span class="tag tag-guided">${icon('compass')}<span>Guided</span></span>`;
  const items = attempts.map(a => {
    const p = percent(a);
    const guided = isGuided(a);
    const isRole = a.module === ROLE_MODULE;
    // Role attempts behave like mixes (each question carries its own origin).
    const isMix = a.module === MIX_MODULE || isRole;
    const isAll = !isMix && (a.subtopic === 'all' || a.difficulty === 'all');
    const dom = isMix ? null : domainOfId.get(a.module);
    const rInfo = isRole ? roleInfo(a.subtopic) : null;
    const chip = isRole ? `<span class="tag tag-role">${icon(rInfo.icon)}<span>Role</span></span>`
      : isMix ? tag('Mix', 'tag-mix') : tag(dom ? dom.title : archived.has(a.module) ? 'Archived' : 'Other', domClass(dom?.id));
    const title = isRole
      ? `<strong>${esc(rInfo.title)}</strong> · ${difficultyHtml(normalizeRoleLevel(a.difficulty) ?? a.difficulty)}`
      : isMix
      ? `<strong>Mixed quiz</strong> · ${a.difficulty === 'any' ? 'Any difficulty' : difficultyHtml(a.difficulty)}`
      : `<strong>${esc(modTitle(a.module))}</strong> · ${esc(subTitle(a.module, a.subtopic))} · ${difficultyHtml(a.difficulty)}`;
    // Where a question came from: its domain, or (role-only questions) the role.
    const originOf = mid => {
      const d = domainOfId.get(mid);
      if (d) return { domain: d.id, domainTitle: d.title };
      const r = roleOfOnly.get(mid);
      return r ? { domainTitle: r.title } : {};
    };
    const qs = isMix
      ? a.questions.map(q => (typeof q.module === 'string'
        ? { ...q, moduleTitle: modTitle(q.module), ...originOf(q.module), subtopicTitle: subTitle(q.module, q.subtopic) }
        : q))
      : isAll ? a.questions.map(q => (typeof q.subtopic === 'string' ? { ...q, subtopicTitle: subTitle(a.module, q.subtopic) } : q))
      : a.questions;
    return `<li class="card attempt">
      <details>
        <summary>
          <span class="attempt-title">${chip}${guided ? guidedTag : ''}<span>${title}</span></span>
          <span class="attempt-meta"><span class="muted">${esc(fmtDate(a.ts))}</span>
          ${guided
            ? `<span class="guided-score">${fmtScore(a.score)}/${a.total} first try</span>`
            : `<span class="score ${scoreClass(p)}">${fmtScore(a.score)}/${a.total} (${p}%)</span>`}${icon('chevron-down', 'chev')}</span>
        </summary>
        ${guided ? '<p class="muted small attempt-note">Guided practice: not scored, never counted in stats or best scores.</p>' : ''}
        ${isMix && !guided ? `<div class="attempt-breakdown">${moduleBreakdown(qs, titlesFor)}</div>` : ''}
        <ol class="review">${guided
          ? qs.map(q => guidedItemHtml(q, q.outcome, isMix ? questionTag(q) : isAll ? cellTag(q) : '')).join('')
          : qs.map(q => reviewItem({ q, userAnswer: q.userAnswer ?? '', correct: q.correct, ...(typeof q.credit === 'number' ? { credit: q.credit } : {}), ...(Array.isArray(q.parts) ? { parts: q.parts } : {}) }, isMix || (isAll ? cellTag : false))).join('')}</ol>
      </details>
    </li>`;
  }).join('');

  root.innerHTML = `
    <section class="page-head"><p class="eyebrow">Your progress</p><h1>History</h1></section>
    <section class="card">
      <h2>By module</h2>
      <p class="muted small">Module stats include questions answered inside mixed and role quizzes.</p>
      <div class="table-wrap"><table class="summary">
        <thead><tr><th scope="col">Module</th><th scope="col">Attempts</th><th scope="col">Best</th><th scope="col">Last</th><th scope="col">Overall</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table></div>
    </section>
    <h2 class="list-head">All attempts</h2>
    <ul class="attempts">${items}</ul>`;
}
