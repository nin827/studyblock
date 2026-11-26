// Light gamification: XP, levels, streaks and badges, all derived from the stored attempts list.
// Pure (no DOM) apart from the two tiny preference/seen-badge helpers at the bottom.
// Nothing here is stored except the per-browser "seen badges" list and the sb_game cookie.
import { getCookie, setCookie } from './storage.js';

// ---- XP ----

export const LEVEL_POINTS = { easy: 10, medium: 15, hard: 20, expert: 30, 'expert-plus': 40 };
const DEFAULT_POINTS = 15;
const COMPLETION_BONUS = 5;
const PERFECT_FACTOR = 1.2;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isAttempt = (a) => isObj(a) && Array.isArray(a.questions) && a.questions.length > 0 && num(a.ts) !== null;

const creditOf = (q) => {
  const c = num(q.credit);
  if (c !== null) return Math.min(1, Math.max(0, c));
  return q.correct === true ? 1 : 0;
};
const weightOf = (q) => {
  const w = num(q.weight);
  return w !== null && w > 0 ? w : 1;
};
const pointsFor = (q, a) => {
  const d = typeof q.difficulty === 'string' && q.difficulty in LEVEL_POINTS ? q.difficulty : (typeof a.difficulty === 'string' && a.difficulty in LEVEL_POINTS ? a.difficulty : null);
  return d ? LEVEL_POINTS[d] : DEFAULT_POINTS;
};
const isPerfect = (a) => num(a.score) !== null && num(a.total) !== null && a.total > 0 && a.score === a.total;

// XP for one attempt (integer). Guided and malformed attempts give 0.
export function xpForAttempt(a) {
  if (!isAttempt(a) || a.guided === true) return 0;
  let sum = COMPLETION_BONUS;
  for (const q of a.questions) {
    if (!isObj(q)) continue;
    sum += creditOf(q) * weightOf(q) * pointsFor(q, a);
  }
  if (isPerfect(a)) sum *= PERFECT_FACTOR;
  return Math.round(sum);
}

export function totalXp(attempts) {
  let xp = 0;
  if (Array.isArray(attempts)) for (const a of attempts) xp += xpForAttempt(a);
  return xp;
}

// ---- Levels ----

// XP to go from level L to L+1.
export const xpToNext = (L) => 100 + 50 * (L - 1);

export function levelFromXp(xp) {
  let rest = Math.max(0, Math.floor(num(xp) ?? 0));
  let level = 1;
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  const xpForNext = xpToNext(level);
  return { level, xpIntoLevel: rest, xpForNext, progress: rest / xpForNext };
}

// ---- Streaks (local calendar days) ----

// Local y/m/d as a day number: DST-safe because it never divides real milliseconds.
const dayNum = (ts) => {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

function sortedDays(attempts) {
  const set = new Set();
  if (Array.isArray(attempts)) for (const a of attempts) if (isAttempt(a)) set.add(dayNum(a.ts));
  return [...set].sort((x, y) => x - y);
}

export function streak(attempts, now = Date.now()) {
  const days = sortedDays(attempts);
  const t = dayNum(now);
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  const upto = days.filter((d) => d <= t);
  const today = upto.length > 0 && upto[upto.length - 1] === t;
  let current = 0;
  if (upto.length) {
    const last = upto[upto.length - 1];
    if (last === t || last === t - 1) {
      current = 1;
      for (let i = upto.length - 2; i >= 0 && upto[i] === upto[i + 1] - 1; i--) current++;
    }
  }
  return { current, best, today, atRisk: current > 0 && !today };
}

// ---- Badges ----

const EXPERT_LEVELS = new Set(['expert', 'expert-plus']);
const mapGet = (m, k) => (m instanceof Map ? m.get(k) : isObj(m) && Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined);

// ctx: { domainOf: { moduleId: domainId } | Map, levelsOf: { moduleId: [difficulty ids] } | Map }
// Both optional; without them the domain-based badges (explorer, all-rounder) stay unearned.
export const BADGE_DEFS = [
  { id: 'first-quiz', title: 'First steps', icon: 'award', description: 'Finish your first quiz.', of: 1 },
  { id: 'perfect', title: 'Flawless', icon: 'star', description: 'Score 100% on a quiz of 5 or more questions.', of: 1 },
  { id: 'first-expert', title: 'Expert attempt', icon: 'flame', description: 'Finish a quiz at Expert level.', of: 1 },
  { id: 'expert-perfect', title: 'Expert flawless', icon: 'crown', description: 'Score 100% on an Expert quiz of 5 or more questions.', of: 1 },
  { id: 'quizzes-10', title: 'Ten quizzes', icon: 'target', description: 'Finish 10 quizzes.', of: 10 },
  { id: 'quizzes-50', title: 'Fifty quizzes', icon: 'medal', description: 'Finish 50 quizzes.', of: 50 },
  { id: 'quizzes-200', title: 'Two hundred quizzes', icon: 'trophy', description: 'Finish 200 quizzes.', of: 200 },
  { id: 'streak-3', title: 'Three-day streak', icon: 'flame', description: 'Practise on 3 days in a row.', of: 3 },
  { id: 'streak-7', title: 'Week streak', icon: 'flame', description: 'Practise on 7 days in a row.', of: 7 },
  { id: 'streak-30', title: 'Month streak', icon: 'flame', description: 'Practise on 30 days in a row.', of: 30 },
  { id: 'explorer', title: 'Explorer', icon: 'map', description: 'Answer questions from 5 different domains.', of: 5 },
  { id: 'all-rounder', title: 'All-rounder', icon: 'layers', description: 'Finish every difficulty of one subject.', of: 1 },
  { id: 'first-role', title: 'On the job', icon: 'briefcase-business', description: 'Finish a role quiz.', of: 1 },
  { id: 'first-mix', title: 'Mixer', icon: 'shuffle', description: 'Finish a mixed quiz.', of: 1 },
  { id: 'guided-learner', title: 'Guided learner', icon: 'compass', description: 'Finish 5 guided runs.', of: 5 },
];

export function badges(attempts, ctx = {}) {
  const list = (Array.isArray(attempts) ? attempts.filter(isAttempt) : []).slice().sort((a, b) => a.ts - b.ts);
  const domainOf = ctx && ctx.domainOf;
  const levelsOf = ctx && ctx.levelsOf;
  const at = {}; // id -> earnedAt
  const count = {}; // id -> running progress n
  const earn = (id, ts) => { if (at[id] === undefined) at[id] = ts; };
  const bump = (id, n, ts) => {
    const of = BADGE_DEFS.find((b) => b.id === id).of;
    count[id] = Math.max(count[id] || 0, n);
    if (n >= of) earn(id, ts);
  };

  let quizzes = 0, guided = 0;
  const domains = new Set();
  const done = new Map(); // module -> Set of difficulties
  // streak tracking in time order
  let prevDay = null, run = 0;
  const seenDay = new Set();

  for (const a of list) {
    const day = dayNum(a.ts);
    if (!seenDay.has(day)) {
      seenDay.add(day);
      run = prevDay !== null && day === prevDay + 1 ? run + 1 : 1;
      prevDay = day;
      bump('streak-3', run, a.ts); bump('streak-7', run, a.ts); bump('streak-30', run, a.ts);
    }
    if (a.guided === true) {
      guided++;
      bump('guided-learner', guided, a.ts);
      continue;
    }
    quizzes++;
    bump('first-quiz', quizzes, a.ts);
    bump('quizzes-10', quizzes, a.ts); bump('quizzes-50', quizzes, a.ts); bump('quizzes-200', quizzes, a.ts);
    const perfect = isPerfect(a) && a.total >= 5;
    const expert = EXPERT_LEVELS.has(a.difficulty);
    if (perfect) earn('perfect', a.ts);
    if (expert) { earn('first-expert', a.ts); if (perfect) earn('expert-perfect', a.ts); }
    if (a.module === 'role') earn('first-role', a.ts);
    if (a.module === 'mix') earn('first-mix', a.ts);

    for (const q of a.questions) {
      if (!isObj(q)) continue;
      const m = typeof q.module === 'string' ? q.module : a.module;
      const dom = mapGet(domainOf, m);
      if (typeof dom === 'string') domains.add(dom);
      if (a.module !== 'mix' && a.module !== 'role' && typeof m === 'string') {
        const d = typeof q.difficulty === 'string' ? q.difficulty : a.difficulty;
        if (typeof d === 'string' && d !== 'all' && d !== 'any') {
          let s = done.get(m); if (!s) done.set(m, (s = new Set()));
          s.add(d);
        }
      }
    }
    bump('explorer', domains.size, a.ts);
    for (const [m, s] of done) {
      const lv = mapGet(levelsOf, m);
      if (Array.isArray(lv) && lv.length && lv.every((d) => s.has(d))) earn('all-rounder', a.ts);
    }
  }

  // best partial progress for all-rounder: most complete module
  let arBest = 0, arOf = 1;
  for (const [m, s] of done) {
    const lv = mapGet(levelsOf, m);
    if (!Array.isArray(lv) || !lv.length) continue;
    const n = lv.filter((d) => s.has(d)).length;
    if (n / lv.length > arBest / arOf) { arBest = n; arOf = lv.length; }
  }

  return BADGE_DEFS.map((b) => {
    const earned = at[b.id] !== undefined;
    const out = { id: b.id, title: b.title, description: b.description, icon: b.icon, earned, earnedAt: earned ? at[b.id] : null };
    if (b.of > 1) out.progress = { n: earned ? b.of : Math.min(count[b.id] || 0, b.of), of: b.of };
    else if (b.id === 'all-rounder') out.progress = { n: earned ? arOf : arBest, of: arOf };
    return out;
  });
}

// Badges unlocked by the attempts added between `before` and `after`.
export function badgesEarnedBy(before, after, ctx = {}) {
  const had = new Set(badges(before, ctx).filter((b) => b.earned).map((b) => b.id));
  return badges(after, ctx).filter((b) => b.earned && !had.has(b.id));
}

// ---- Summary ----

export function summary(attempts, ctx = {}, now = Date.now()) {
  const list = Array.isArray(attempts) ? attempts : [];
  const xp = totalXp(list);
  const bs = badges(list, ctx);
  const frac = (b) => (b.progress ? b.progress.n / b.progress.of : 0);
  const next = bs.filter((b) => !b.earned).sort((a, b) => frac(b) - frac(a))[0] || null;
  return {
    xp,
    level: levelFromXp(xp),
    streak: streak(list, now),
    badges: bs,
    earnedCount: bs.filter((b) => b.earned).length,
    next,
    // Earned badges whose id is not in prevSeenIds (array or Set).
    newlyEarned: (prevSeenIds = []) => {
      const seen = prevSeenIds instanceof Set ? prevSeenIds : new Set(prevSeenIds);
      return bs.filter((b) => b.earned && !seen.has(b.id));
    },
  };
}

// ---- Seen badges (per-browser convenience, never exported) ----

const SEEN_KEY = 'studyblock:seenBadges';

export function loadSeen() {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export function saveSeen(ids) {
  try {
    const clean = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string'))];
    localStorage.setItem(SEEN_KEY, JSON.stringify(clean));
  } catch { /* storage unavailable */ }
}

// ---- Preference: Settings → Game elements (cookie sb_game, "0" = off, default on) ----

export const gameOn = () => getCookie('game') !== '0';
export const setGameOn = (on) => setCookie('game', on ? '1' : '0');
