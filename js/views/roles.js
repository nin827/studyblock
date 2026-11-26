// Roles: #/roles (list), #/roles/<role>[/<subrole>] (role page), and role quizzes
// #/rq/<role>[~<subrole>]/<level>[?n=<count>] (practice) and #/rg/… (guided).
// Levels: easy, medium, hard, expert ("normal" / "expert-plus" are accepted as old aliases).

import {
  loadRoles, loadRoleIndustries, findRole, roleLevels, roleShares, roleSubjectLevel, roleQuestionCount, buildRoleQuiz,
  loadDomains, loadModule, loadGuide, isValidId, roleKey, normalizeRoleLevel, roleScenarioCount, sanitizeRoleCount,
  ROLE_TOP, ROLE_MIN_COUNT, ROLE_MAX_COUNT, ROLE_MODULE, isLangModule,
} from '../lib/engine.js';
import { loadText, loadJSON } from '../lib/source.js';
import { renderMarkdown } from '../lib/markdown.js';
import { getStats, getAttempts, isGuided, percent, getRoleCount, setRoleCount } from '../lib/storage.js';
import { esc, icon, icons, fmtPct, scoreClass, errorBox, hashPart, domClass, domVars, domStyle, difficultyHtml, difficultyLabel } from './ui.js';
import { runQuiz, storedQuestion, crumbsHtml } from './quiz.js';
import { getQuizMode, setQuizMode, parseGuide, guideHtml, GUIDED, PRACTICE } from './guided.js';
import { codeLangsHtml, bindCodeLangs } from './codelangs.js';

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

// Role flags: tags (icon + label) and callouts (markdown). CALLOUT_ORDER is the fixed display order.
const FLAGS = {
  experience_heavy: { label: 'Experience-led', icon: 'hammer', kind: 'IMPORTANT', title: 'Experience matters most',
    text: 'This role is mostly learned on the job. Theory and knowledge, which is what these questions practise, are only a small part of the real work: experience, judgement and working with people count for more.' },
  safety_critical: { label: 'Safety-critical', icon: 'shield-alert', kind: 'WARNING', title: 'Safety-critical work',
    text: 'Mistakes in the real job can hurt people. Rules here are simplified; real work follows official standards and procedures.' },
  authority_required: { label: 'Authority required', icon: 'gavel', kind: 'WARNING', title: 'Practice only',
    text: 'Real decisions here need a qualified, authorised professional. These questions are practice, not professional, financial or health advice.' },
  license_oriented: { label: 'License-oriented', icon: 'badge-check', kind: 'NOTE', title: 'Licence or qualification',
    text: "The real job usually needs a formal licence, certification or qualification. This practice doesn't replace it." },
  region_specific: { label: 'Varies by country', icon: 'globe', kind: 'NOTE', title: 'Rules vary by country',
    text: 'Laws and standards differ between countries; questions use general textbook versions.' },
  tool_heavy: { label: 'Tool-driven', icon: 'wrench', kind: 'TIP', title: 'Real work runs on tools',
    text: 'Day to day this is done in software (spreadsheets, SQL, engines, simulators). These questions practise the reasoning behind the tools.' },
  tool_specific: { label: 'Tool-specific', icon: 'lock', kind: 'NOTE', title: 'Tied to specific tools',
    text: 'Some questions assume a particular language, tool, standard or piece of gear, named in the question. Others work differently, so check their conventions before applying an answer elsewhere.' },
  creative_oriented: { label: 'Creative-oriented', icon: 'palette', kind: 'TIP', title: 'Taste and judgement count',
    text: 'Creative choices matter; theory here is a toolkit, not a rulebook.' },
  theory_heavy: { label: 'Theory-led', icon: 'book-open' },
};
const CALLOUT_ORDER = ['safety_critical', 'authority_required', 'experience_heavy', 'license_oriented', 'region_specific', 'tool_specific', 'tool_heavy', 'creative_oriented'];

const warnedFlags = new Set();
// Known flag ids of one raw role/subrole object (legacy experience_based: true counts); unknown ids warn once per role.
function parseFlags(obj, roleId) {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  if (obj.experience_based === true) out.push('experience_heavy');
  if (Array.isArray(obj.flags)) {
    for (let f of obj.flags) {
      if (f === 'experience_based') f = 'experience_heavy'; // legacy alias
      if (typeof f === 'string' && Object.hasOwn(FLAGS, f)) { if (!out.includes(f)) out.push(f); }
      else if (!warnedFlags.has(roleId)) {
        warnedFlags.add(roleId);
        console.warn(`StudyBlock: role ${roleId}: ignoring unknown flag ${JSON.stringify(String(f)).slice(0, 40)}`);
      }
    }
  }
  return out;
}

const rawRoles = new Map();
async function rawRole(roleId) {
  if (!isValidId(roleId)) return null;
  if (!rawRoles.has(roleId)) rawRoles.set(roleId, loadJSON(`roles/${roleId}.json`).catch(() => null));
  return rawRoles.get(roleId);
}
// { role: [flags], sub: Map(subroleId -> [flags]) } from the role's own JSON.
async function roleFlagData(roleId) {
  const raw = await rawRole(roleId);
  const sub = new Map();
  for (const s of Array.isArray(raw?.subroles) ? raw.subroles : []) {
    if (s && typeof s === 'object' && isValidId(s.id)) sub.set(s.id, parseFlags(s, roleId));
  }
  return { role: parseFlags(raw, roleId), sub };
}
// startNotice: { title (1-60 chars), text (1-600 chars) } of a raw role/subrole object, or null (invalid warns once per role).
const warnedNotice = new Set();
function parseNotice(obj, roleId) {
  const n = obj && typeof obj === 'object' ? obj.startNotice : undefined;
  if (n === undefined) return null;
  const ok = n && typeof n === 'object' && !Array.isArray(n)
    && typeof n.title === 'string' && n.title.trim() && n.title.length <= 60
    && typeof n.text === 'string' && n.text.trim() && n.text.length <= 600;
  if (ok) return { title: n.title.trim(), text: n.text.trim() };
  if (!warnedNotice.has(roleId)) {
    warnedNotice.add(roleId);
    console.warn(`StudyBlock: role ${roleId}: ignoring invalid startNotice (needs title <= 60 and text <= 600 characters, strings)`);
  }
  return null;
}
// The notice that applies: the subrole's own, else the role's.
async function roleNotice(roleId, subroleId) {
  const raw = await rawRole(roleId);
  if (!raw) return null;
  const own = subroleId ? parseNotice((Array.isArray(raw.subroles) ? raw.subroles : []).find(s => s && s.id === subroleId), roleId) : null;
  return own || parseNotice(raw, roleId);
}
const noticeMd = (n, title = n.title) => `> [!WARNING] ${title.replace(/\s+/g, ' ')}\n${n.text.split(/\r?\n/).map(l => `> ${l}`).join('\n')}`;

// Per-session confirmation (sessionStorage studyblock:roleAck: { roleId: true }).
const ACK_KEY = 'studyblock:roleAck';
function readAck() {
  try { const o = JSON.parse(sessionStorage.getItem(ACK_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
const isAcked = roleId => readAck()[roleId] === true;
function setAcked(roleId) {
  try { sessionStorage.setItem(ACK_KEY, JSON.stringify({ ...readAck(), [roleId]: true })); } catch { /* memory only */ }
}

const combine = (...lists) => [...new Set(lists.flat())];

function tagsHtml(flags) {
  if (!flags.length) return '';
  return `<ul class="flag-tags" aria-label="Role traits">${flags.map(f =>
    `<li class="flag-tag">${icon(FLAGS[f].icon)}<span>${esc(FLAGS[f].label)}</span></li>`).join('')}</ul>`;
}

// "About this role": callouts for the flags (fixed order), then the exclusive module's intro.md.
async function aboutHtml(role, flags, notice) {
  let intro = null;
  if (role.exclusive && isValidId(role.exclusive)) {
    try { intro = await loadText(`modules/${role.exclusive}/intro.md`); } catch { /* no intro */ }
  }
  const notes = (notice ? [noticeMd(notice)] : []).concat(CALLOUT_ORDER.filter(f => flags.includes(f))
    .map(f => `> [!${FLAGS[f].kind}] ${FLAGS[f].title}\n> ${FLAGS[f].text}`));
  if (!notes.length && !intro) return '';
  const md = notes.join('\n\n') + (notes.length && intro ? '\n\n' : '') + (intro || '');
  return `<section class="card prose" aria-label="About this role">${renderMarkdown(md)}</section>`;
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
  const fdata = await Promise.all(roles.map(r => roleFlagData(r.id)));
  if (!ctx.alive()) return;
  const tocItem = r => `<li data-role="${esc(r.id)}"><button type="button" class="roles-toc-link" data-role="${esc(r.id)}">${icon(r.icon)}<span class="roles-toc-name">${esc(r.title)}</span>${r.subroles.length ? `<span class="roles-toc-n" aria-label="${r.subroles.length} subroles">${r.subroles.length}</span>` : ''}</button></li>`;
  const optHtml = r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`;
  // Sections drive the cards, the TOC and the jump menu. Today: one untitled section with every role (a titled section gets a heading and a TOC group).
  const byId = new Map(roles.map(r => [r.id, r]));
  const industries = await loadRoleIndustries();
  if (!ctx.alive()) return;
  const sections = industries.length
    ? industries.map(g => ({ ...g, roles: g.roles.map(id => byId.get(id)).filter(Boolean) })).filter(g => g.roles.length)
    : [{ id: "all", title: "", icon: "", roles }];
  const lvl = sections[0]?.title ? 3 : 2;
  const cardHtml = r => {
    const i = roles.indexOf(r);
    const s = getStats({ module: ROLE_MODULE, subtopic: r.id });
    return `<article class="card role-card" id="role-${esc(r.id)}" data-role="${esc(r.id)}" data-search="${esc([r.title, ...r.subroles.map(x => x.title)].join(' ').toLowerCase())}">
      <a class="role-card-main" href="${roleHref(r.id)}">
        <span class="icon-tile">${icon(r.icon)}</span>
        <span class="role-card-text">
          <span class="role-card-title" role="heading" aria-level="${lvl}" tabindex="-1">${esc(r.title)}</span>
          <span class="role-card-sub">${esc(r.description)}</span>
          ${tagsHtml(fdata[i].role)}
          <span class="role-card-meta">${s.attempts ? `${s.attempts} quiz${s.attempts === 1 ? '' : 'zes'} · best <span class="score ${scoreClass(s.best)}">${fmtPct(s.best)}</span>` : 'Not started'}</span>
        </span>
        <span class="tool-card-go" aria-hidden="true">${icon('chevron-right')}</span>
      </a>
      ${r.subroles.length ? `<div class="role-subs"><span class="muted small">Subroles</span>
        <div class="chip-scroll">${r.subroles.map(s => `<a class="chip chip-main" href="${roleHref(r.id, s.id)}">${icon(s.icon || 'user-round')}<span>${esc(s.title)}</span></a>`).join('')}</div></div>` : ''}
    </article>`;
  };
  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { label: 'Roles' }])}
    <section class="page-head">
      <div class="page-head-row">
        <span class="icon-tile">${icon('briefcase-business')}</span>
        <div><p class="eyebrow">Career mixes</p><h1>Roles</h1></div>
      </div>
      <p>Each role mixes the subjects that job uses, one level harder than you pick: Easy draws Medium questions, Medium draws Hard, Hard draws Expert, and the last fifth of each run are role scenarios that combine several subjects in one problem. Expert is only role scenarios (Expert+).</p>
    </section>
    ${roles.length ? `<div class="roles-layout">
      <nav class="roles-toc" id="roles-toc" aria-label="Roles on this page"><p class="roles-toc-title">Roles</p>
        ${sections.map(sec => `${sec.title ? `<p class="roles-toc-title roles-toc-sec">${esc(sec.title)}</p>` : ""}<ul>${sec.roles.map(tocItem).join("")}</ul>`).join("")}
      </nav>
      <div class="roles-main">
        <div class="roles-tools">
          <label class="roles-jump" for="roles-jump-sel"><span class="sr-only">Jump to role</span>${icon('list')}
            <select id="roles-jump-sel"><option value="">Jump to role…</option>${sections.map(sec => sec.title ? `<optgroup label="${esc(sec.title)}">${sec.roles.map(optHtml).join("")}</optgroup>` : sec.roles.map(optHtml).join("")).join("")}</select></label>
          <label class="mix-search roles-search">${icon('search')}<span class="sr-only">Find a role</span>
            <input type="search" id="roles-search" placeholder="Find a role or subrole, e.g. Chef" autocomplete="off" enterkeyhint="search"></label>
        </div>
        <p class="mix-noresults is-empty" id="roles-none" role="status" hidden>No roles match</p>
        ${sections.map(sec => `<section class="role-section" data-section="${esc(sec.id)}"${sec.title ? ` aria-label="${esc(sec.title)}"` : ""}>${sec.title ? `<h2 class="section-title role-section-title">${icon(sec.icon)}<span>${esc(sec.title)}</span><span class="muted small">${sec.roles.length} roles</span></h2>` : ""}<div class="role-list">${sec.roles.map(cardHtml).join("")}</div></section>`).join("")}
      </div>
    </div>` : '<div class="card"><p class="muted">No roles yet.</p></div>'}`;
  icons();
  if (roles.length) setupRolesNav(root, ctx);
  // #/roles?industry=<id> (role page breadcrumb): scroll to that industry's section.
  const sec = params?.industry && root.querySelector(`.role-section[data-section="${CSS.escape(params.industry)}"]`);
  if (sec) {
    ctx.scrollTarget = sec; // the router scrolls here instead of to the top
    const h = sec.querySelector('.role-section-title');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
}

// TOC + "Jump to role" + filter + scroll-spy for #/roles. No #anchor hrefs (the hash is the router's).
function setupRolesNav(root, ctx) {
  const list = root.querySelector('.roles-main');
  const toc = root.querySelector('#roles-toc');
  const sel = root.querySelector('#roles-jump-sel');
  const input = root.querySelector('#roles-search');
  const none = root.querySelector('#roles-none');
  const cards = [...list.querySelectorAll('.role-card')];
  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tocLi = id => toc.querySelector(`li[data-role="${CSS.escape(id)}"]`);
  const optOf = id => [...sel.options].find(o => o.value === id);

  const goTo = id => {
    const card = root.querySelector(`#role-${CSS.escape(id)}`);
    if (!card || card.hidden) return;
    card.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
    card.querySelector('.role-card-title')?.focus({ preventScroll: true });
  };
  toc.addEventListener('click', e => {
    const b = e.target.closest('.roles-toc-link');
    if (b) { e.preventDefault(); goTo(b.dataset.role); }
  });
  sel.addEventListener('change', () => { if (sel.value) goTo(sel.value); });

  const setActive = id => {
    toc.querySelectorAll('.roles-toc-link').forEach(b => {
      if (b.dataset.role === id) {
        b.setAttribute('aria-current', 'true');
        // Keep the active entry visible inside a TOC that scrolls on its own.
        const li = b.closest('li');
        if (toc.scrollHeight > toc.clientHeight && li) {
          const t = toc.getBoundingClientRect(); const r = li.getBoundingClientRect();
          if (r.top < t.top || r.bottom > t.bottom) toc.scrollTop += (r.top - t.top) - t.height / 2;
        }
      } else b.removeAttribute('aria-current');
    });
    if (id && document.activeElement !== sel) sel.value = optOf(id) && !optOf(id).hidden ? id : '';
  };

  // Scroll-spy: the first visible card inside the top band of the viewport.
  const seen = new Set();
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(entries => {
      for (const en of entries) { if (en.isIntersecting) seen.add(en.target.dataset.role); else seen.delete(en.target.dataset.role); }
      const first = cards.find(c => !c.hidden && seen.has(c.dataset.role));
      if (first) setActive(first.dataset.role);
    }, { rootMargin: '-120px 0px -55% 0px', threshold: 0 });
    cards.forEach(c => io.observe(c));
  }
  ctx.onCleanup?.(() => io?.disconnect());

  const filter = () => {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const hit = terms.every(t => c.dataset.search.includes(t));
      c.hidden = !hit;
      const li = tocLi(c.dataset.role); if (li) li.hidden = !hit;
      const o = optOf(c.dataset.role); if (o) { o.hidden = !hit; o.disabled = !hit; }
      if (hit) shown++;
    }
    none.hidden = shown > 0;
    root.querySelectorAll('.role-section').forEach(s => { s.hidden = !s.querySelector('.role-card:not([hidden])'); });
    toc.hidden = shown === 0 ? true : false;
    if (shown && !cards.some(c => !c.hidden && c.dataset.role === sel.value)) sel.value = '';
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; filter(); }
  });
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
  const fd = await roleFlagData(role.id);
  const flags = combine(fd.role, subrole ? (fd.sub.get(subrole.id) || []) : []);
  const about = await aboutHtml(role, flags, await roleNotice(role.id, subrole?.id ?? null));
  if (!ctx.alive()) return;
  const label = `Subjects: ${shares.map(p => `${p.title} ${fmtShare(p.share)}`).join(', ')}`;
  // Code languages: every language the role's code subjects list (its mix and its role-only module).
  const codeMods = [...mods.values(), role.exclusiveModule].filter(isLangModule);
  const codeIds = [...new Set(codeMods.flatMap(m => m.languages))];

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

  let industry = null;
  try { industry = (await loadRoleIndustries()).find(g => g.roles.includes(role.id) && g.title) || null; } catch { /* no industries */ }
  if (!ctx.alive()) return;
  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { href: '#/roles', label: 'Roles' },
      ...(industry ? [{ href: `#/roles?industry=${encodeURIComponent(industry.id)}`, label: industry.title }] : []),
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
      ${tagsHtml(flags)}
    </section>
    ${about}
    <section class="card practice ${mode === GUIDED ? 'is-guided' : ''}" id="practice-card">
      <div class="section-head"><h2 id="practice-title">${mode === GUIDED ? 'Guided practice' : 'Practice'}</h2></div>
      <div class="mode-switch">
        <div class="segmented seg-mode" role="radiogroup" aria-label="Quiz mode">
          <label class="seg"><input type="radio" name="quiz-mode" value="${PRACTICE}" ${mode === GUIDED ? '' : 'checked'}><span>${icon('target')}Practice</span></label>
          <label class="seg"><input type="radio" name="quiz-mode" value="${GUIDED}" ${mode === GUIDED ? 'checked' : ''}><span>${icon('compass')}Guided</span></label>
        </div>
        <p class="muted small mode-note guided-only">${icon('lightbulb')}Guided: hints, unlimited tries, not scored (saved in History).</p>
      </div>
      ${codeIds.length ? codeLangsHtml({ ids: codeIds, ctx: 'role', id: 'role-code-langs', label: 'Code languages',
        hint: 'Role runs use the industry-standard languages that are on, one per code question. Shared with Settings and the code subjects.' }) : ''}
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
  bindCodeLangs(root);
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
  const notice = await roleNotice(role.id, subrole?.id ?? null);
  if (!ctx.alive()) return;
  if (notice && !isAcked(role.id)) {
    root.innerHTML = `${crumbsHtml([{ href: '#/', label: 'Home' }, { href: '#/roles', label: 'Roles' },
      ...(subrole ? [{ href: roleHref(role.id), label: role.title }] : []), { href: pageHref, label: me.title }])}
      <section class="card start-gate" aria-labelledby="gate-h">
        <p class="eyebrow">Before you start · ${esc(me.title)}</p>
        <h1 id="gate-h" tabindex="-1">${esc(notice.title)}</h1>
        <div class="prose">${renderMarkdown(noticeMd(notice, 'Please read before you start'))}</div>
        <div class="start-gate-actions">
          <button type="button" class="btn btn-primary" data-gate-ok>I understand · Start</button>
          <a class="btn" href="${pageHref}">${icon('arrow-left')} Back to role</a>
        </div>
      </section>`;
    icons();
    root.querySelector('#gate-h')?.focus({ preventScroll: false });
    root.querySelector('[data-gate-ok]')?.addEventListener('click', () => {
      setAcked(role.id);
      if (ctx.alive()) playRole(root, { roleId, subroleId, level: rawLevel, count: rawCount }, ctx, guided);
    });
    return;
  }
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
