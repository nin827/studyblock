// Roles: #/roles (list), #/roles/<role>[/<subrole>] (role page), and role quizzes
// #/rq/<role>[~<subrole>]/<level>[?n=<count>] (practice) and #/rg/… (guided).
// Levels: easy, medium, hard, expert ("normal" / "expert-plus" are accepted as old aliases).

import {
  loadRoles, findRole, roleLevels, roleShares, roleSubjectLevel, roleQuestionCount, buildRoleQuiz,
  loadDomains, loadModule, loadGuide, isValidId, roleKey, normalizeRoleLevel, roleScenarioCount, sanitizeRoleCount,
  ROLE_TOP, ROLE_MIN_COUNT, ROLE_MAX_COUNT, ROLE_MODULE,
} from '../lib/engine.js';
import { getStats, getAttempts, isGuided, percent, getRoleCount, setRoleCount } from '../lib/storage.js';
import { esc, icon, icons, fmtPct, scoreClass, errorBox, hashPart, domClass, domVars, domStyle, difficultyHtml, difficultyLabel } from './ui.js';
import { runQuiz, storedQuestion, crumbsHtml } from './quiz.js';
import { getQuizMode, setQuizMode, parseGuide, guideHtml, GUIDED, PRACTICE } from './guided.js';

const fmtShare = s => {
  const p = s * 100;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
};

// What each level draws, as plain text. `mixed` = how many of the `n` questions are role scenarios.
function levelNote(level, n, mixed) {
  const qs = `${n} question${n === 1 ? '' : 's'}`;
  if (level === ROLE_TOP) return `Role-only scenarios across several subjects · ${qs}`;
  const base = `Subjects at ${difficultyLabel(roleSubjectLevel(level))} · ${qs}`;
  return mixed ? `${base}, the last ${mixed} ${mixed === 1 ? 'is a role scenario' : 'are role scenarios'}` : base;
}

// Count control kinds: Easy/Medium/Hard share one count, Expert has its own (default 5).
const countKind = level => (level === ROLE_TOP ? 'expert' : 'std');

const roleHref = (roleId, subroleId) => `#/roles/${hashPart(roleId)}${subroleId ? `/${hashPart(subroleId)}` : ''}`;
// Quiz route: "~" joins role and subrole (ids never contain it); "?n=<count>" when not the default.
const runHref = (key, level, mode, n = null) => {
  const count = sanitizeRoleCount(n, roleQuestionCount(level));
  return `#/${mode === GUIDED ? 'rg' : 'rq'}/${hashPart(key).replace(/%7E/gi, '~')}/${hashPart(level)}${count !== roleQuestionCount(level) ? `?n=${count}` : ''}`;
};

// Scored stats of one role key at one level, counting attempts stored under an old alias id
// ("normal" -> easy, "expert-plus" -> expert). Score/total are the stored (weighted) ones.
function levelStats(key, level) {
  const list = getAttempts().filter(a => a.module === ROLE_MODULE && a.subtopic === key && !isGuided(a)
    && normalizeRoleLevel(a.difficulty) === level);
  return { attempts: list.length, best: list.length ? Math.max(...list.map(percent)) : null };
}

async function loadRolesSafe(root, ctx) {
  try { return await loadRoles(); } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Could not load roles', 'roles/index.json is missing or invalid.');
    return null;
  }
}

// ---- #/roles ----

export async function render(root, params, ctx) {
  const roles = await loadRolesSafe(root, ctx);
  if (!roles || !ctx.alive()) return;
  const cards = roles.map(r => {
    const s = getStats({ module: ROLE_MODULE, subtopic: r.id });
    return `<article class="card role-card">
      <a class="role-card-main" href="${roleHref(r.id)}">
        <span class="icon-tile">${icon(r.icon)}</span>
        <span class="role-card-text">
          <span class="role-card-title">${esc(r.title)}</span>
          <span class="role-card-sub">${esc(r.description)}</span>
          <span class="role-card-meta">${s.attempts ? `${s.attempts} quiz${s.attempts === 1 ? '' : 'zes'} · best <span class="score ${scoreClass(s.best)}">${fmtPct(s.best)}</span>` : 'Not started'}</span>
        </span>
        <span class="tool-card-go" aria-hidden="true">${icon('chevron-right')}</span>
      </a>
      ${r.subroles.length ? `<div class="role-subs"><span class="muted small">Subroles</span>
        <div class="chip-scroll">${r.subroles.map(s => `<a class="chip chip-main" href="${roleHref(r.id, s.id)}">${icon(s.icon || 'user-round')}<span>${esc(s.title)}</span></a>`).join('')}</div></div>` : ''}
    </article>`;
  }).join('');
  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { label: 'Roles' }])}
    <section class="page-head">
      <div class="page-head-row">
        <span class="icon-tile">${icon('briefcase-business')}</span>
        <div><p class="eyebrow">Career mixes</p><h1>Roles</h1></div>
      </div>
      <p>Each role mixes the subjects that job uses, one level harder than you pick: Easy draws Medium questions, Medium draws Hard, Hard draws Expert, and the last fifth of each run are role scenarios that combine several subjects in one problem. Expert is only role scenarios (Expert+).</p>
    </section>
    ${roles.length ? `<div class="role-list">${cards}</div>` : '<div class="card"><p class="muted">No roles yet.</p></div>'}`;
}

// ---- #/roles/<role>[/<subrole>] ----

export async function renderRole(root, { roleId, subroleId }, ctx) {
  let found = null;
  try { found = await findRole(roleId, subroleId); } catch (e) { console.error(e); }
  if (!ctx.alive()) return;
  if (!found) {
    root.innerHTML = errorBox('Role not found', 'That role or subrole does not exist.');
    return;
  }
  const { role, subrole } = found;
  const me = subrole || role;
  const key = roleKey(role.id, subrole?.id);
  const mix = subrole ? subrole.mix : role.mix;
  let domains = [];
  try { domains = await loadDomains(); } catch { /* untinted */ }
  const mods = new Map();
  await Promise.all(mix.map(async e => { try { mods.set(e.module, await loadModule(e.module)); } catch { /* id shown */ } }));
  if (!ctx.alive()) return;
  const domainOfId = new Map(domains.flatMap(d => d.modules.map(mid => [mid, d])));
  const levels = roleLevels(role);
  let mode = getQuizMode();
  // Question counts (5-50), remembered per role key in localStorage.
  const counts = {
    std: getRoleCount(key, 'std') ?? roleQuestionCount('easy'),
    expert: getRoleCount(key, 'expert') ?? roleQuestionCount(ROLE_TOP),
  };
  const countOf = level => counts[countKind(level)];
  const noteOf = level => levelNote(level, countOf(level), roleScenarioCount(role, subrole, level, countOf(level)));

  const shares = roleShares(mix).map(x => {
    const m = mods.get(x.module);
    const entry = mix.find(e => e.module === x.module);
    const d = domainOfId.get(x.module);
    const all = m && entry.subtopics.length === m.subtopics.length;
    const subs = m && !all ? entry.subtopics.map(id => m.subtopics.find(s => s.id === id)?.title ?? id) : [];
    return { ...x, title: m ? String(m.title ?? m.id) : x.module, d, subs };
  });
  const label = `Subjects: ${shares.map(p => `${p.title} ${fmtShare(p.share)}`).join(', ')}`;

  const levelCard = level => {
    const s = levelStats(key, level);
    return `<li class="role-level ${level === ROLE_TOP ? 'is-plus' : ''}">
      <div class="role-level-text">
        <span class="role-level-name">${difficultyHtml(level)}</span>
        <span class="muted small" data-note="${esc(level)}">${esc(noteOf(level))}</span>
        <span class="small practice-only">${s.attempts ? `Best <span class="score ${scoreClass(s.best)}">${fmtPct(s.best)}</span> · ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}` : '<span class="muted">Not attempted</span>'}</span>
      </div>
      <a class="btn ${level === 'easy' ? 'btn-primary' : ''}" data-level="${esc(level)}" href="${runHref(key, level, mode, countOf(level))}"
         aria-label="${esc(`Start ${mode === GUIDED ? 'guided ' : ''}${me.title}, ${difficultyLabel(level)}`)}">${icon('play')} Start</a>
    </li>`;
  };

  // −/+ stepper around a number input (5-50), as in the Mix builder.
  const countControl = (kind, label, which) => {
    const id = `role-count-${kind}`;
    const full = which ? `${label} (${which})` : label;
    return `<div class="role-count">
      <label class="field-label" for="${id}">${esc(full)}</label>
      <span class="stepper count-stepper" role="group" aria-label="${esc(`Question count${which ? `, ${which}` : ''}`)}">
        <button type="button" class="step" data-count-step="-1" data-kind="${kind}" aria-label="Fewer questions">−</button>
        <input type="number" id="${id}" class="count-input" data-kind="${kind}" min="${ROLE_MIN_COUNT}" max="${ROLE_MAX_COUNT}" step="1"
          inputmode="numeric" enterkeyhint="done" value="${counts[kind]}">
        <button type="button" class="step" data-count-step="1" data-kind="${kind}" aria-label="More questions">+</button>
      </span>
    </div>`;
  };

  const subCards = !subrole && role.subroles.length ? `<section aria-labelledby="subroles-h">
      <div class="section-head"><h2 id="subroles-h" class="section-title">Subroles</h2></div>
      <div class="role-list">${role.subroles.map(s => {
        const st = getStats({ module: ROLE_MODULE, subtopic: roleKey(role.id, s.id) });
        return `<a class="tool-card" href="${roleHref(role.id, s.id)}">
          <span class="icon-tile">${icon(s.icon || 'user-round')}</span>
          <span class="tool-card-text"><span class="tool-card-title">${esc(s.title)}</span>
            <span class="tool-card-sub">${esc(s.description)}</span>
            <span class="tool-card-sub">${st.attempts ? `Best ${esc(fmtPct(st.best))}` : 'Not started'}</span></span>
          <span class="tool-card-go" aria-hidden="true">${icon('chevron-right')}</span>
        </a>`;
      }).join('')}</div>
    </section>` : '';

  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { href: '#/roles', label: 'Roles' },
      ...(subrole ? [{ href: roleHref(role.id), label: role.title }] : []), { label: me.title }])}
    <section class="page-head">
      <div class="page-head-row">
        <span class="icon-tile">${icon(me.icon || role.icon)}</span>
        <div>
          <p class="eyebrow">${subrole ? `Subrole of ${esc(role.title)}` : 'Role'}</p>
          <h1>${esc(me.title)}</h1>
        </div>
      </div>
      ${me.description ? `<p>${esc(me.description)}</p>` : ''}
    </section>
    <section class="card practice ${mode === GUIDED ? 'is-guided' : ''}" id="practice-card">
      <div class="section-head"><h2 id="practice-title">${mode === GUIDED ? 'Guided practice' : 'Practice'}</h2></div>
      <div class="mode-switch">
        <div class="segmented seg-mode" role="radiogroup" aria-label="Quiz mode">
          <label class="seg"><input type="radio" name="quiz-mode" value="${PRACTICE}" ${mode === GUIDED ? '' : 'checked'}><span>${icon('target')}Practice</span></label>
          <label class="seg"><input type="radio" name="quiz-mode" value="${GUIDED}" ${mode === GUIDED ? 'checked' : ''}><span>${icon('compass')}Guided</span></label>
        </div>
        <p class="muted small mode-note guided-only">${icon('lightbulb')}Guided: hints, unlimited tries, not scored (saved in History).</p>
      </div>
      <div class="role-counts">
        ${countControl('std', 'Questions', levels.includes(ROLE_TOP) ? 'Easy to Hard' : '')}
        ${levels.includes(ROLE_TOP) ? countControl('expert', 'Questions', 'Expert') : ''}
      </div>
      <ul class="role-levels">${levels.map(levelCard).join('')}</ul>
      ${levels.includes(ROLE_TOP) ? '' : `<p class="muted small">${icon('flame')} Expert role scenarios for this role are coming soon.</p>`}
    </section>
    <section class="card">
      <h2>Subjects</h2>
      <p class="muted small">How often each subject comes up at Easy, Medium and Hard (before the role scenarios at the end).</p>
      <div class="share-bar" role="img" aria-label="${esc(label)}">${shares.map(p =>
        `<span class="share-seg ${domClass(p.d?.id)}" style="${domVars(p.d)}flex-grow:${p.share.toFixed(4)}"></span>`).join('')}</div>
      <ul class="role-shares">${shares.map(p => `<li class="${domClass(p.d?.id)}"${domStyle(p.d)}>
          <span class="swatch" aria-hidden="true"></span>
          <span class="role-share-text"><a href="#/m/${hashPart(p.module)}">${esc(p.title)}</a>
            ${p.subs.length ? `<span class="muted small">${esc(p.subs.join(', '))}</span>` : ''}</span>
          <span class="role-share-pct">${esc(fmtShare(p.share))}</span>
        </li>`).join('')}</ul>
    </section>
    ${subCards}`;

  const card = root.querySelector('#practice-card');
  // Start links and notes follow the mode and the counts.
  const refreshLevels = () => {
    root.querySelectorAll('.role-levels a[data-level]').forEach(a => {
      a.href = runHref(key, a.dataset.level, mode, countOf(a.dataset.level));
      a.setAttribute('aria-label', `Start ${mode === GUIDED ? 'guided ' : ''}${me.title}, ${difficultyLabel(a.dataset.level)}, ${countOf(a.dataset.level)} questions`);
    });
    root.querySelectorAll('[data-note]').forEach(n => { n.textContent = noteOf(n.dataset.note); });
  };
  root.querySelectorAll('input[name="quiz-mode"]').forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    mode = r.value === GUIDED ? GUIDED : PRACTICE;
    setQuizMode(mode);
    card?.classList.toggle('is-guided', mode === GUIDED);
    const h = root.querySelector('#practice-title');
    if (h) h.textContent = mode === GUIDED ? 'Guided practice' : 'Practice';
    refreshLevels();
  }));
  // Counts: typing updates live when the value is a whole number in range; blur/Enter clamp it.
  const applyCount = (input, clamp) => {
    const kind = input.dataset.kind;
    const raw = input.value.trim();
    const n = Number(raw);
    const valid = raw !== '' && Number.isInteger(n) && n >= ROLE_MIN_COUNT && n <= ROLE_MAX_COUNT;
    if (!valid && !clamp) { input.setAttribute('aria-invalid', raw === '' ? 'false' : 'true'); return; }
    const v = valid ? n : sanitizeRoleCount(raw, counts[kind]);
    input.value = String(v);
    input.removeAttribute('aria-invalid');
    if (v !== counts[kind]) { counts[kind] = v; setRoleCount(key, kind, v); }
    refreshLevels();
  };
  root.querySelectorAll('.role-count .count-input').forEach(input => {
    input.addEventListener('input', () => applyCount(input, false));
    input.addEventListener('blur', () => applyCount(input, true));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCount(input, true); } });
  });
  root.querySelectorAll('.role-count .step[data-count-step]').forEach(b => b.addEventListener('click', () => {
    const input = root.querySelector(`#role-count-${b.dataset.kind}`);
    if (!input) return;
    const cur = Number(input.value);
    const base = Number.isFinite(cur) ? Math.round(cur) : counts[b.dataset.kind];
    input.value = String(Math.min(ROLE_MAX_COUNT, Math.max(ROLE_MIN_COUNT, base + Number(b.dataset.countStep))));
    applyCount(input, true);
  }));
  icons();
}

// ---- #/rq/<role>[~<subrole>]/<level> and #/rg/… ----

export function renderPlay(root, params, ctx) {
  return playRole(root, params, ctx, false);
}
export function renderGuidedPlay(root, params, ctx) {
  return playRole(root, params, ctx, true);
}

async function playRole(root, { roleId, subroleId, level: rawLevel, count: rawCount }, ctx, guided) {
  let found = null;
  try { found = await findRole(roleId, subroleId); } catch (e) { console.error(e); }
  if (!ctx.alive()) return;
  // Old level ids ("normal", "expert-plus") still open the matching level.
  const level = normalizeRoleLevel(rawLevel);
  const count = sanitizeRoleCount(rawCount, roleQuestionCount(level));
  if (!found || !level || !roleLevels(found.role).includes(level)) {
    root.innerHTML = errorBox('Quiz not found', 'That role, subrole or level does not exist.');
    return;
  }
  const { role, subrole } = found;
  const me = subrole || role;
  const key = roleKey(role.id, subrole?.id);
  const pageHref = roleHref(role.id, subrole?.id);
  setQuizMode(guided ? GUIDED : PRACTICE);
  const crumbs = crumbsHtml([{ href: '#/', label: 'Home' }, { href: '#/roles', label: 'Roles' },
    ...(subrole ? [{ href: roleHref(role.id), label: role.title }] : []), { href: pageHref, label: me.title }]);
  // Guided: each question's module "How to solve" notes, loaded once per module after building.
  const guides = new Map();
  const build = async () => {
    const qs = await buildRoleQuiz(role.id, subrole?.id ?? null, level, undefined, count);
    if (guided) {
      const ids = [...new Set(qs.map(q => q.module))].filter(id => isValidId(id) && !guides.has(id));
      await Promise.all(ids.map(async id => { guides.set(id, parseGuide(await loadGuide(id).catch(() => null))); }));
    }
    return qs;
  };
  await runQuiz(root, ctx, {
    build,
    title: `${esc(me.title)} · ${difficultyHtml(level)}`,
    ...(guided ? {
      guided: { guideFor: q => guideHtml(guides.get(q.module), q.subtopicTitle, q.subtopic) },
      practiceHref: runHref(key, level, PRACTICE, count),
    } : {}),
    crumbs,
    backHref: pageHref,
    backLabel: subrole ? 'Subrole' : 'Role',
    backIcon: role.icon || 'briefcase-business',
    showTags: true,
    buildError: e => `${crumbs}<div class="card error-box">${icon('triangle-alert')}<div><h2>Could not build role quiz</h2>
      <p>${esc(e.message || String(e))}</p>
      <p><a class="btn" href="${pageHref}">${icon('arrow-left')} Back to ${esc(me.title)}</a></p></div></div>`,
    toAttempt: results => ({
      module: ROLE_MODULE, subtopic: key, difficulty: level,
      questions: results.map(r => storedQuestion(r, true)),
    }),
  });
}
