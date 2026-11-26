// Game elements UI (XP, levels, streaks, badges): shared pieces for Home, the quiz Results
// screen and #/badges. All numbers come from js/lib/gamify.js; nothing here stores data except
// gamify's per-browser "seen badges" list. Hidden everywhere when Settings → Game elements is off.

import { loadDomains, loadModulesOf, DIFFICULTY_ORDER } from '../lib/engine.js';
import {
  LEVEL_POINTS, xpForAttempt, totalXp, levelFromXp, badges, badgesEarnedBy, loadSeen, saveSeen,
} from '../lib/gamify.js';
import { esc, icon, fmtScore, difficultyLabel } from './ui.js';

export { gameOn, setGameOn, summary, loadSeen } from '../lib/gamify.js';

// ---- badge context (domainOf, levelsOf), built once per page load from the registry ----

let ctxPromise = null;
export function gameContext() {
  if (!ctxPromise) {
    ctxPromise = (async () => {
      const domains = await loadDomains();
      const domainOf = new Map();
      const levelsOf = new Map();
      await Promise.all(domains.map(async d => {
        for (const m of await loadModulesOf(d)) {
          domainOf.set(m.id, d.id);
          const set = new Set();
          for (const st of m.subtopics || []) {
            // A subtopic with no list counts as medium (engine rule).
            const list = Array.isArray(st.difficulties) && st.difficulties.length ? st.difficulties : ['medium'];
            list.forEach(x => set.add(x));
          }
          levelsOf.set(m.id, DIFFICULTY_ORDER.filter(x => set.has(x)));
        }
      }));
      return { domainOf, levelsOf };
    })().catch(e => {
      console.warn('StudyBlock: badge context unavailable', e);
      ctxPromise = null;
      return {};
    });
  }
  return ctxPromise;
}

// Seen badge ids for the Home notice. The first time (no list stored yet), badges earned
// before game elements existed are marked seen silently, so they aren't all announced as new.
export function seenForNotice(list) {
  let stored = null;
  try { stored = localStorage.getItem('studyblock:seenBadges'); } catch { /* storage blocked */ }
  if (stored === null) { markSeen(list); }
  return loadSeen();
}

// Marks every earned badge as seen (keeps ids seen before).
export function markSeen(list) {
  const ids = new Set(loadSeen());
  for (const b of list) if (b.earned) ids.add(b.id);
  saveSeen([...ids]);
}

// ---- small pieces ----

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function fmtDay(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; }
}

export function xpBarHtml(level) {
  const pct = Math.max(0, Math.min(100, Math.round(level.progress * 100)));
  return `<div class="xp-bar" role="progressbar" aria-label="${esc(`XP towards level ${level.level + 1}`)}"
      aria-valuemin="0" aria-valuemax="${level.xpForNext}" aria-valuenow="${level.xpIntoLevel}"
      aria-valuetext="${esc(`${level.xpIntoLevel} of ${level.xpForNext} XP`)}"><span style="width:${pct}%"></span></div>`;
}

const levelPill = level => `<span class="level-pill">${icon('star')}<span>Level ${level.level}</span></span>`;

// Badge progress ("7 of 10") or null when the badge has no meaningful count.
const progressOf = b => (b.progress && b.progress.of > 1 ? b.progress : null);
const thinBar = p => `<span class="thin-bar" aria-hidden="true"><span style="width:${Math.round((p.n / p.of) * 100)}%"></span></span>`;

function streakText(st) {
  const title = st.current ? `${st.current}-day streak` : 'No streak right now';
  const sub = st.atRisk ? 'Practise today to keep it' : st.current ? 'Practised today' : 'Practise today to start one';
  return { title, sub: `${sub} · best ${st.best}` };
}

// "New badge: Flawless" line (names escaped). Returns '' when nothing is new.
export function newBadgeLine(list) {
  if (!list.length) return '';
  const names = list.slice(0, 3).map(b => b.title);
  const more = list.length > 3 ? ` and ${list.length - 3} more` : '';
  return `<p class="game-new" role="status">${icon('sparkles')}<span><strong>${list.length === 1 ? 'New badge' : 'New badges'}:</strong>
    ${esc(names.join(', ') + more)}</span><a href="#/badges">See badges</a></p>`;
}

// ---- Home: "Your progress" card ----

export function progressCardHtml(sum, newly) {
  const lv = sum.level;
  const st = sum.streak;
  const streak = st.current || st.best ? (() => {
    const t = streakText(st);
    return `<div class="streak-box${st.atRisk ? ' is-at-risk' : ''}">${icon('flame')}
      <span class="streak-text"><strong>${esc(t.title)}</strong><span>${esc(t.sub)}</span></span></div>`;
  })() : '';
  const n = sum.next;
  const np = n && progressOf(n);
  const next = n ? `<a class="next-badge" href="#/badges">
      <span class="badge-tile">${icon(n.icon)}</span>
      <span class="next-badge-text">
        <span class="next-badge-label">Next badge</span>
        <strong>${esc(n.title)}${np ? ` · ${np.n} of ${np.of}` : ''}</strong>
        ${np ? thinBar(np) : `<span class="next-badge-desc">${esc(n.description)}</span>`}
      </span>
      ${icon('chevron-right', 'next-badge-go')}
    </a>` : '';
  return `<section class="card game-card" aria-labelledby="game-h">
    <div class="game-head">
      <h2 id="game-h" class="game-title">Your progress</h2>
      ${levelPill(lv)}
      <span class="game-xp">${lv.xpIntoLevel} / ${lv.xpForNext} XP</span>
    </div>
    ${xpBarHtml(lv)}
    ${newBadgeLine(newly)}
    ${streak || next ? `<div class="game-row">${streak}${next}</div>` : ''}
    <a class="game-all" href="#/badges">${icon('award')} All badges (${sum.earnedCount} of ${sum.badges.length})</a>
  </section>`;
}

// ---- Results: +XP, how, level up, new badges ----

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// Mirrors gamify.js's per-question points, only to explain the total in words.
function xpHow(a) {
  const groups = new Map(); // level key -> weighted credit
  for (const q of a.questions || []) {
    if (!isObj(q)) continue;
    const c = fin(q.credit) !== null ? Math.min(1, Math.max(0, q.credit)) : q.correct === true ? 1 : 0;
    const w = fin(q.weight) !== null && q.weight > 0 ? q.weight : 1;
    const d = typeof q.difficulty === 'string' && q.difficulty in LEVEL_POINTS ? q.difficulty
      : typeof a.difficulty === 'string' && a.difficulty in LEVEL_POINTS ? a.difficulty : '';
    groups.set(d, (groups.get(d) || 0) + c * w);
  }
  const parts = [...groups].filter(([, n]) => n > 0);
  if (parts.length > 2) return null; // a long mixed list says nothing useful
  const order = k => (k ? Object.keys(LEVEL_POINTS).indexOf(k) : 99);
  parts.sort((x, y) => order(x[0]) - order(y[0]));
  const bits = parts.map(([k, n]) => `${fmtScore(n)} × ${k ? LEVEL_POINTS[k] : 15} for ${k ? difficultyLabel(k) : 'this level'}`);
  bits.push(parts.length ? '+5 for finishing' : '5 for finishing');
  const perfect = fin(a.score) !== null && fin(a.total) !== null && a.total > 0 && a.score === a.total;
  if (perfect) bits.push('then ×1.2 for a perfect score');
  return bits.join(', ');
}

export function resultsGameHtml(before, after, attempt, ctx) {
  const gained = xpForAttempt(attempt);
  const lvBefore = levelFromXp(totalXp(before)).level;
  const lvAfter = levelFromXp(totalXp(after));
  const how = xpHow(attempt);
  const earned = badgesEarnedBy(before, after, ctx);
  const levelUp = lvAfter.level > lvBefore
    ? `<p class="level-up">${icon('arrow-up')}<span><strong>Level up.</strong> You reached level ${lvAfter.level}.</span></p>` : '';
  const list = earned.length ? `<div class="earned">
      <h2 class="earned-title">${earned.length === 1 ? 'New badge' : 'New badges'}</h2>
      <ul class="earned-list">${earned.map(b => `<li>
        <span class="badge-tile is-earned">${icon(b.icon)}</span>
        <span class="earned-text"><strong>${esc(b.title)}</strong><span>${esc(b.description)}</span></span>
      </li>`).join('')}</ul>
    </div>` : '';
  return `<div class="xp-line">
      <span class="xp-pill">${icon('sparkles')}<span>+${gained} XP</span></span>
      ${how ? `<span class="xp-how">${esc(how)}</span>` : ''}
    </div>
    ${levelUp}${list}
    <p class="game-links"><a href="#/badges">${icon('award')} Badges</a> · Level ${lvAfter.level}, ${lvAfter.xpIntoLevel} / ${lvAfter.xpForNext} XP</p>`;
}

// ---- #/badges pieces ----

export function badgeCardHtml(b) {
  const p = progressOf(b);
  const status = b.earned
    ? `<span class="badge-status is-earned">${icon('circle-check')}Earned ${esc(fmtDay(b.earnedAt))}</span>`
    : `<span class="badge-status">${icon('lock')}${p ? `${p.n} of ${p.of}` : 'Not earned yet'}</span>${p ? thinBar(p) : ''}`;
  return `<li class="badge-card ${b.earned ? 'is-earned' : 'is-locked'}">
    <span class="badge-tile${b.earned ? ' is-earned' : ''}">${icon(b.icon)}</span>
    <strong class="badge-name">${esc(b.title)}</strong>
    <span class="badge-desc">${esc(b.description)}</span>
    ${status}
  </li>`;
}

export function levelSummaryHtml(sum) {
  const lv = sum.level;
  const st = sum.streak;
  const bits = [];
  if (st.current || st.best) {
    bits.push(`<span class="game-meta-streak">${icon('flame')}${esc(st.current ? `${st.current}-day streak` : 'No streak right now')}</span>`);
    bits.push(`<span>best ${st.best}</span>`);
    if (st.atRisk) bits.push('<span>practise today to keep it</span>');
  }
  bits.push(`<span>${sum.earnedCount} of ${plural(sum.badges.length, 'badge')}</span>`);
  return `<section class="card game-card game-summary" aria-label="Level and streak">
    <div class="game-head">
      <strong class="game-level">Level ${lv.level}</strong>
      <span class="game-xp">${lv.xpIntoLevel} / ${lv.xpForNext} XP · ${sum.xp} XP in all</span>
    </div>
    ${xpBarHtml(lv)}
    <p class="game-meta">${bits.join('<span aria-hidden="true">·</span>')}</p>
  </section>`;
}

export { badges };
