// localStorage store (source of truth), cookie cache, import/export.

import { requestPersistentStorage } from './pwa.js';
import { isLang, DEFAULT_LANG } from './languages.js';

const KEY = 'studyblock:data';
const VERSION = 1;

const empty = () => ({ version: VERSION, attempts: [] });

// ---- change notifications (the data folder listens to these; no import cycle) ----

const saveListeners = new Set();

// Registers fn() to be called after every successful save of attempts, presets or the draft.
// Returns an unsubscribe function.
export function onSaved(fn) {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}

function notifySaved() {
  // Ask the browser not to evict our storage (call-once inside pwa.js; harmless on file://).
  requestPersistentStorage().catch(() => {});
  for (const fn of saveListeners) {
    try { fn(); } catch (e) { console.error('StudyBlock: save listener failed', e); }
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION || !Array.isArray(data.attempts)) throw new Error('Stored data has unexpected shape');
    // Drop individual malformed attempts rather than losing the whole history.
    data.attempts = data.attempts.filter((a, i) => {
      try { validateAttempt(a, i); return true; } catch (e) { console.error('StudyBlock: skipping stored attempt', e); return false; }
    });
    for (const a of data.attempts) for (const q of a.questions) dropBadLang(q);
    return data;
  } catch (e) {
    console.error('StudyBlock: could not read stored data', e);
    return empty();
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    notifySaved();
    return true;
  } catch (e) {
    console.error('StudyBlock: could not save data', e);
    return false;
  }
}

export function uuid() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- validation (data only, never executed) ----

const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function validateAttempt(a, idx) {
  const where = `Attempt #${idx + 1}`;
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${where} is not an object.`);
  if (!isStr(a.id) || !a.id) throw new Error(`${where} has no valid "id".`);
  if (!isNum(a.ts)) throw new Error(`${where} has no valid "ts" timestamp.`);
  for (const k of ['module', 'subtopic', 'difficulty']) {
    if (!isStr(a[k])) throw new Error(`${where} has no valid "${k}".`);
  }
  // `score` is a sum of per-question credits, so it may be a decimal (e.g. 6.67), never above `total`.
  if (!isNum(a.score) || !isNum(a.total) || a.total < 0 || a.score < 0 || a.score > a.total + 1e-9) {
    throw new Error(`${where} has an invalid "score" or "total".`);
  }
  if (a.guided !== undefined && typeof a.guided !== 'boolean') throw new Error(`${where} has an invalid "guided" flag.`);
  if (!Array.isArray(a.questions)) throw new Error(`${where} has no "questions" list.`);
  a.questions.forEach((q, j) => {
    if (!q || typeof q !== 'object' || Array.isArray(q)) throw new Error(`${where}, question ${j + 1} is not an object.`);
    if (!isStr(q.prompt)) throw new Error(`${where}, question ${j + 1} has no "prompt".`);
    if (typeof q.correct !== 'boolean') throw new Error(`${where}, question ${j + 1} has no "correct" flag.`);
  });
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('File is not a StudyBlock progress object.');
  if (data.version !== VERSION) {
    throw new Error(`Unsupported data version: ${JSON.stringify(data.version)} (expected ${VERSION}).`);
  }
  if (!Array.isArray(data.attempts)) throw new Error('Missing "attempts" list.');
  data.attempts.forEach(validateAttempt);
}

// Calculator working saved on a question: [{ label, expr, value }], at most 30 rows.
// Rows with a bad shape are dropped; returns null when nothing valid is left. Data only.
export const WORK_MAX_ROWS = 30;
const WORK_LABEL_RE = /^_[A-Za-z0-9_]{1,23}$/;

export function cleanWork(work) {
  if (!Array.isArray(work)) return null;
  const out = [];
  for (const r of work) {
    if (out.length >= WORK_MAX_ROWS) break;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    if (!isStr(r.label) || !WORK_LABEL_RE.test(r.label) || !isStr(r.expr) || r.expr.length > 200) continue;
    out.push({ label: r.label, expr: r.expr, value: isNum(r.value) ? r.value : null });
  }
  return out.length ? out : null;
}

// Calculator graph saved on a question with its working: { fns: [{ slot, expr, hidden }], view }.
// At most 6 functions (slots 1–6, unique), non-empty expressions of at most 200 characters. The view
// must be four finite numbers with min < max (spans 1e-6 to 1e9); otherwise the default window is used.
// Returns null when no valid function is left. Data only (expressions are parsed, never executed).
export const GRAPH_MAX_FNS = 6;
const GRAPH_EXPR_MAX = 200;
const GRAPH_DEFAULT_VIEW = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };

function cleanGraphView(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const { xmin, xmax, ymin, ymax } = v;
  if (![xmin, xmax, ymin, ymax].every(isNum)) return null;
  const okAxis = (a, b) => a < b && b - a >= 1e-6 * 0.999 && b - a <= 1e9 * 1.001 && Math.abs(a) <= 2e9 && Math.abs(b) <= 2e9;
  return okAxis(xmin, xmax) && okAxis(ymin, ymax) ? { xmin, xmax, ymin, ymax } : null;
}

export function cleanGraph(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph) || !Array.isArray(graph.fns)) return null;
  const fns = [];
  const used = new Set();
  for (const f of graph.fns.slice(0, GRAPH_MAX_FNS)) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    if (!isStr(f.expr) || !f.expr.trim() || f.expr.length > GRAPH_EXPR_MAX) continue;
    if (!Number.isInteger(f.slot) || f.slot < 1 || f.slot > GRAPH_MAX_FNS || used.has(f.slot)) continue;
    used.add(f.slot);
    fns.push({ slot: f.slot, expr: f.expr, hidden: f.hidden === true });
  }
  if (!fns.length) return null;
  fns.sort((a, b) => a.slot - b.slot);
  return { fns, view: cleanGraphView(graph.view) || { ...GRAPH_DEFAULT_VIEW } };
}

// Segmented choices: an option made of 2–4 aligned segments ("Elastic | Price ↓ | Revenue ↑"),
// stored as one string joined by SEG_SEP, plus the column labels (`choiceCols` on a single
// question, `partCols: { [partId]: cols }` on a multi-part one). Labels ≤ 24 chars, segments ≤ 40.
export const SEG_SEP = ' | ';
export const SEG_COLS_MIN = 2;
export const SEG_COLS_MAX = 4;
export const SEG_COL_MAX_LEN = 24;
export const SEG_MAX_LEN = 40;

// Column labels: 2–4 non-empty trimmed strings (≤ 24 chars, no "|"), or null.
export function cleanChoiceCols(v) {
  if (!Array.isArray(v) || v.length < SEG_COLS_MIN || v.length > SEG_COLS_MAX) return null;
  const out = v.map(c => (isStr(c) ? c.trim() : ''));
  return out.every(c => c && c.length <= SEG_COL_MAX_LEN && !c.includes('|')) ? out : null;
}

// { [partId]: cols } for a multi-part question's segmented parts, or null.
export function cleanPartCols(v) {
  if (!isObj(v)) return null;
  const out = {};
  let n = 0;
  for (const k of Object.keys(v).slice(0, PARTS_MAX)) {
    const cols = PART_ID_RE.test(k) && k.length <= 40 ? cleanChoiceCols(v[k]) : null;
    if (cols) { out[k] = cols; n++; }
  }
  return n ? out : null;
}

// A stored/joined option split back into its segments: an array of cols.length strings, or null
// (no valid cols, or the string doesn't have exactly that many segments).
export function splitSegs(str, cols) {
  const c = cleanChoiceCols(cols);
  if (!c || !isStr(str)) return null;
  const segs = str.split('|').map(s => s.trim());
  return segs.length === c.length && segs.every(Boolean) ? segs : null;
}

// Multi-part questions store `answer` / `userAnswer` as { [partId]: value } and
// `parts: [{ id, label, correct }]`. All optional on import; validated and capped here. Data only.
export const PARTS_MAX = 4;
const PART_ID_RE = /^[a-z0-9-]+$/;
const PART_VALUE_MAX = 200;
const PART_LABEL_MAX = 60;

// { [partId]: string|number } with at most PARTS_MAX keys, or null when nothing valid is left.
// Keys must match the id rule (which also rules out "__proto__" and friends).
export function cleanPartMap(v) {
  if (!isObj(v)) return null;
  const out = {};
  let n = 0;
  for (const k of Object.keys(v)) {
    if (n >= PARTS_MAX) break;
    if (!PART_ID_RE.test(k) || k.length > 40) continue;
    const x = v[k];
    if (isNum(x)) out[k] = x;
    else if (isStr(x)) out[k] = x.slice(0, PART_VALUE_MAX);
    else continue;
    n++;
  }
  return n ? out : null;
}

// [{ id, label, correct }] with at most PARTS_MAX entries and unique ids, or null.
export function cleanParts(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const ids = new Set();
  for (const p of list) {
    if (out.length >= PARTS_MAX) break;
    if (!isObj(p) || !isStr(p.id) || !PART_ID_RE.test(p.id) || p.id.length > 40 || ids.has(p.id)) continue;
    if (typeof p.correct !== 'boolean') continue;
    ids.add(p.id);
    const close = p.correct ? null : cleanClose(p.close);
    out.push({ id: p.id, label: isStr(p.label) ? p.label.slice(0, PART_LABEL_MAX) : p.id, correct: p.correct, ...(close ? { close } : {}) });
  }
  return out.length ? out : null;
}

// Close-answer credit on a stored question (`fuzzy`) or part (`close`), factor 0-1:
// { kind: "text", typos, factor, level } | { kind: "number", relErr, factor, level }
// | { kind: "number", mode: "years", off, factor, level } | { kind: "date", off, factor, level }.
// Optional fields are kept only when valid (level 0-5). Else null.
export function cleanClose(v) {
  if (!isObj(v) || !['text', 'number', 'date'].includes(v.kind)) return null;
  if (!isNum(v.factor) || v.factor < 0 || v.factor > 1) return null;
  const out = { kind: v.kind, factor: v.factor };
  if (v.kind === 'text' && Number.isInteger(v.typos) && v.typos >= 0 && v.typos <= 50) out.typos = v.typos;
  if (v.kind === 'number' && v.mode === 'years') out.mode = 'years';
  if (v.kind === 'number' && isNum(v.relErr) && v.relErr >= 0) out.relErr = v.relErr;
  if (v.kind !== 'text' && isNum(v.off) && v.off >= 0 && v.off <= 1e6) out.off = v.off;
  if (isNum(v.level) && v.level >= 0 && v.level <= 5) out.level = v.level;
  return out;
}

// Answer mode of a stored question: "blocks" (dual Type | Blocks question answered with blocks)
// with its multiplier 0-1. Returns the fields to keep ({} when absent or invalid).
// Also "choose" (a segmented-choice question answered by picking an option instead of building it).
export function cleanMode(q) {
  if (!isObj(q) || (q.mode !== 'blocks' && q.mode !== 'choose')) return {};
  return { mode: q.mode, ...(isNum(q.multiplier) && q.multiplier >= 0 && q.multiplier <= 1 ? { multiplier: q.multiplier } : {}) };
}

// A stored answer: number, string, or a multi-part object; anything else becomes a string.
function cleanAnswer(v) {
  if (isNum(v) || isStr(v)) return v;
  if (isObj(v)) return cleanPartMap(v) ?? '';
  return v === null || v === undefined ? '' : String(v);
}

// Optional code language of a stored question (language-aware modules only): kept only when it
// is a known id from js/lib/languages.js, so regenerating the question uses the same language.
function dropBadLang(q) {
  if (q && typeof q === 'object' && 'lang' in q && !isLang(q.lang)) delete q.lang;
  return q;
}

// ---- guided attempts (saved in History, never scored) ----

// Per-question outcome of a guided run: solved first try, solved after hints/tries, used the solution.
export const GUIDED_OUTCOMES = ['first', 'after', 'solution'];
export const isGuided = a => !!a && a.guided === true;
// Attempts that count for stats, best scores and "Recent" scores (guided runs never do).
const scoredOnly = list => list.filter(a => !isGuided(a));

// ---- credit (partial credit for multi-part questions) ----

// A question's credit, 0–1: the stored `credit` (clamped), else 1/0 from `correct` (older data).
export function creditOf(q) {
  if (q && isNum(q.credit)) return Math.min(1, Math.max(0, q.credit));
  return q && q.correct ? 1 : 0;
}

// Scores are sums of credits, kept to 2 decimals.
export const roundScore = n => Math.round((Number(n) || 0) * 100) / 100;

// ---- attempts ----

export function saveAttempt(attempt) {
  const data = load();
  const a = { id: uuid(), ts: Date.now(), ...attempt };
  if (Array.isArray(a.questions)) a.questions = a.questions.map(q => dropBadLang({ ...q }));
  data.attempts.push(a);
  save(data);
  return a;
}

export function getAttempts() {
  return load().attempts.slice().sort((a, b) => b.ts - a.ts);
}

const pct = a => (a.total > 0 ? Math.round((a.score / a.total) * 100) : 0);

function summarize(list) {
  if (!list.length) return { attempts: 0, best: null, last: null, overall: null, correct: 0, total: 0 };
  let best = 0, lastA = list[0], correct = 0, total = 0;
  for (const a of list) {
    best = Math.max(best, pct(a));
    if (a.ts > lastA.ts) lastA = a;
    correct += a.score;
    total += a.total;
  }
  return {
    attempts: list.length, best, last: pct(lastA), lastTs: lastA.ts,
    overall: total ? Math.round((correct / total) * 100) : null, correct, total,
  };
}

export const MIX_MODULE = 'mix';
export const ALL_ID = 'all';

// A whole-module attempt: subtopic and/or difficulty "all"; its questions carry their own origin.
const isAllAttempt = a => a.module !== MIX_MODULE && (a.subtopic === ALL_ID || a.difficulty === ALL_ID);

/*
 * Per-module attribution rule (kept deliberately simple):
 * - A single-module attempt counts for its module as-is.
 * - A mixed attempt (module "mix") is split into one "slice" per module (optionally narrowed
 *   further to a subtopic/difficulty) using each question's own module/subtopic/difficulty.
 *   A slice behaves like a small attempt: { ts, score = sum of question credits, total = questions }.
 *   So it adds 1 to that module's attempt count and its percentage feeds Best/Last/Overall
 *   (a 1-question slice answered correctly therefore counts as a 100% "best").
 * - Mixed questions without a `module` field (shouldn't happen) are ignored for per-module stats.
 * - A whole-module attempt ("all" topics and/or difficulties) counts as-is for its module and for
 *   its own "all" cell; for a specific subtopic/difficulty it is sliced like a mixed attempt.
 */
function slicesOf(a, match) {
  const groups = new Map();
  for (const q of a.questions) {
    const mod = typeof q.module === 'string' ? q.module : (a.module !== MIX_MODULE ? a.module : null);
    if (!mod) continue;
    const qq = { ...q, module: mod };
    if (!match(qq)) continue;
    const key = `${mod}|${q.subtopic ?? ''}|${q.difficulty ?? ''}`;
    if (!groups.has(key)) groups.set(key, { ts: a.ts, module: mod, subtopic: q.subtopic, difficulty: q.difficulty, score: 0, total: 0, fromMix: true, attemptId: a.id });
    const g = groups.get(key);
    g.total++;
    g.score += creditOf(q);
  }
  return [...groups.values()];
}

function mixSlices(attempts, match) {
  return attempts.filter(a => a.module === MIX_MODULE).flatMap(a => slicesOf(a, match));
}

// Merges the per-key slices of one mixed attempt back into one slice (for module-level stats).
function mergeSlices(slices) {
  const byAttempt = new Map();
  for (const s of slices) {
    const m = byAttempt.get(s.attemptId);
    if (m) { m.score += s.score; m.total += s.total; } else byAttempt.set(s.attemptId, { ...s });
  }
  return [...byAttempt.values()];
}

const matches = (filter, x) =>
  (filter.module === undefined || x.module === filter.module) &&
  (filter.subtopic === undefined || x.subtopic === filter.subtopic) &&
  (filter.difficulty === undefined || x.difficulty === filter.difficulty);

// Attempt-like records for a module (single attempts + mixed slices), optionally narrowed.
function recordsFor(attempts, filter) {
  const single = attempts.filter(a => a.module !== MIX_MODULE && matches(filter, a));
  // Whole-module attempts that don't match as stored (e.g. filter subtopic "addition", attempt "all"):
  // count the questions that do match, as one slice per attempt.
  const allSlices = attempts
    .filter(a => isAllAttempt(a) && !matches(filter, a) && (filter.module === undefined || a.module === filter.module))
    .flatMap(a => slicesOf(a, q => matches(filter, q)));
  const slices = mergeSlices(mixSlices(attempts, q => matches(filter, q)).concat(allSlices));
  return single.concat(slices);
}

// Stats for any combination of module / subtopic / difficulty.
// With a real module id, mixed-quiz questions for that module are included (see rule above).
// With no module (or module "mix"), attempts are aggregated as stored.
export function getStats({ module, subtopic, difficulty } = {}) {
  const attempts = scoredOnly(load().attempts);
  if (module === undefined || module === MIX_MODULE) {
    return summarize(attempts.filter(a => matches({ module, subtopic, difficulty }, a)));
  }
  return summarize(recordsFor(attempts, { module, subtopic, difficulty }));
}

// Stats over a set of modules (e.g. a domain): single attempts of those modules plus,
// for each mixed attempt, one slice with its questions from those modules.
export function getStatsForModules(ids) {
  const set = new Set(ids);
  const attempts = scoredOnly(load().attempts);
  const single = attempts.filter(a => a.module !== MIX_MODULE && set.has(a.module));
  const slices = mixSlices(attempts, q => set.has(q.module)).map(s => ({ ...s, module: 'set' }));
  return summarize(single.concat(mergeSlices(slices)));
}

// Attempt-like records (newest first) for one module, including mixed slices.
export function getModuleRecords(module) {
  return recordsFor(scoredOnly(load().attempts), { module }).sort((a, b) => b.ts - a.ts);
}

// Map "subtopic|difficulty" -> stats for one module (mixed questions included).
// Whole-module attempts count under their own key ("all|easy", "addition|all", "all|all") and
// their questions are also attributed to the real cells they came from.
export function getModuleCellStats(module) {
  const attempts = scoredOnly(load().attempts);
  const groups = {};
  for (const a of attempts) {
    if (a.module !== module) continue;
    (groups[`${a.subtopic}|${a.difficulty}`] ||= []).push(a);
    if (isAllAttempt(a)) {
      for (const s of slicesOf(a, q => q.module === module && q.subtopic !== ALL_ID && q.difficulty !== ALL_ID)) {
        (groups[`${s.subtopic}|${s.difficulty}`] ||= []).push(s);
      }
    }
  }
  for (const s of mixSlices(attempts, q => q.module === module)) {
    (groups[`${s.subtopic}|${s.difficulty}`] ||= []).push(s);
  }
  const out = {};
  for (const k in groups) out[k] = summarize(groups[k]);
  return out;
}

export function percent(a) { return pct(a); }

// ---- mix draft + presets (localStorage only; configs are normalised by engine.normalizeMixConfig) ----

const MIX_KEY = 'studyblock:mix';
const PRESETS_KEY = 'studyblock:mixPresets';
export const PRESET_NAME_MAX = 40;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn(`StudyBlock: could not read ${key}`, e);
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`StudyBlock: could not save ${key}`, e);
    return false;
  }
}

function cleanDraft(v) {
  if (!isObj(v)) return null;
  if (!isObj(v.config)) return null;
  return { config: v.config, presetId: isStr(v.presetId) && v.presetId ? v.presetId : null };
}

// Draft: { config, presetId|null } or null when there is none.
export function loadMixDraft() {
  return cleanDraft(readJson(MIX_KEY));
}

export function saveMixDraft(draft) {
  const ok = writeJson(MIX_KEY, { config: draft.config, presetId: draft.presetId ?? null });
  if (ok) notifySaved();
  return ok;
}

export function normalizePresetName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function cleanPreset(p) {
  // "official:" ids are reserved for repo presets, which are never stored/imported.
  if (!isObj(p) || !isStr(p.id) || !p.id || p.id.length > 100 || p.id.startsWith('official:') || !isObj(p.config)) return null;
  const name = normalizePresetName(p.name);
  if (!name || name.length > PRESET_NAME_MAX) return null;
  const now = Date.now();
  return {
    id: p.id, name, config: p.config,
    createdAt: isNum(p.createdAt) ? p.createdAt : now,
    updatedAt: isNum(p.updatedAt) ? p.updatedAt : (isNum(p.createdAt) ? p.createdAt : now),
  };
}

function cleanPresetList(list) {
  if (!Array.isArray(list)) return [];
  const ids = new Set();
  const out = [];
  for (const raw of list) {
    const p = cleanPreset(raw);
    if (!p || ids.has(p.id)) continue;
    ids.add(p.id);
    out.push(p);
  }
  return out;
}

export function getPresets() {
  return cleanPresetList(readJson(PRESETS_KEY));
}

function savePresets(list) {
  if (!writeJson(PRESETS_KEY, list)) throw new Error('Could not write to local storage (full or blocked?).');
  notifySaved();
}

const nameTaken = (list, name, exceptId) =>
  list.some(p => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());

function checkName(list, name, exceptId) {
  const n = normalizePresetName(name);
  if (!n) throw new Error('Name cannot be empty.');
  if (n.length > PRESET_NAME_MAX) throw new Error(`Name must be at most ${PRESET_NAME_MAX} characters.`);
  if (nameTaken(list, n, exceptId)) throw new Error(`A preset named "${n}" already exists.`);
  return n;
}

export function createPreset(name, config) {
  const list = getPresets();
  const n = checkName(list, name);
  const now = Date.now();
  const p = { id: uuid(), name: n, config, createdAt: now, updatedAt: now };
  list.push(p);
  savePresets(list);
  return p;
}

export function updatePreset(id, config) {
  const list = getPresets();
  const p = list.find(x => x.id === id);
  if (!p) throw new Error('That preset no longer exists.');
  p.config = config;
  p.updatedAt = Date.now();
  savePresets(list);
  return p;
}

export function renamePreset(id, name) {
  const list = getPresets();
  const p = list.find(x => x.id === id);
  if (!p) throw new Error('That preset no longer exists.');
  p.name = checkName(list, name, id);
  p.updatedAt = Date.now();
  savePresets(list);
  return p;
}

export function deletePreset(id) {
  savePresets(getPresets().filter(p => p.id !== id));
}

// Appends " (2)", " (3)", … until the name is unique (case-insensitive) and fits the limit.
function uniqueName(list, name) {
  if (!nameTaken(list, name)) return name;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const cand = name.slice(0, PRESET_NAME_MAX - suffix.length).trimEnd() + suffix;
    if (!nameTaken(list, cand)) return cand;
  }
}

// ---- cookies (small cache only) ----
//
// Over HTTP(S): cookies named sb_<name>, scoped to the app's directory (not "/"), because a host
// like username.github.io is shared by every repo of that user.
// On file:// cookies don't work, so the same small values live in localStorage "studyblock:prefs".

const PREFS_KEY = 'studyblock:prefs';
const isFile = () => typeof location !== 'undefined' && location.protocol === 'file:';
const appDir = () => {
  try { return location.pathname.replace(/[^/]*$/, '') || '/'; } catch { return '/'; }
};

function readPrefs() {
  const v = readJson(PREFS_KEY);
  return isObj(v) ? v : {};
}

function rawCookies() {
  const out = new Map();
  try {
    for (const part of document.cookie.split(';')) {
      const p = part.trim();
      const eq = p.indexOf('=');
      if (eq <= 3 || !p.startsWith('sb_')) continue;
      const k = p.slice(3, eq);
      // document.cookie lists more specific paths first; keep the first value for each name.
      if (!out.has(k)) {
        try { out.set(k, decodeURIComponent(p.slice(eq + 1))); } catch { /* skip malformed */ }
      }
    }
  } catch { /* ignore */ }
  return out;
}

const COOKIE_NAME_RE = /^[A-Za-z0-9_]+$/;

function writeCookie(name, value, path, maxAge = 31536000) {
  document.cookie = `sb_${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=${path}; SameSite=Lax`;
}

// One-time migration of old cookies written with path=/ (before cookies were scoped to the
// app directory). Read their values, expire the path=/ copies, then re-create any value that
// only existed there under the app directory. Skipped when the app itself lives at "/".
function migrateRootCookies() {
  if (isFile()) return;
  const dir = appDir();
  if (dir === '/') return;
  try {
    const before = rawCookies();
    if (!before.size) return;
    for (const k of before.keys()) {
      if (COOKIE_NAME_RE.test(k)) document.cookie = `sb_${k}=; max-age=0; path=/; SameSite=Lax`;
    }
    const after = rawCookies();
    for (const [k, v] of before) {
      if (!after.has(k) && COOKIE_NAME_RE.test(k)) writeCookie(k, v, dir);
    }
  } catch { /* ignore */ }
}
migrateRootCookies();

export function getCookie(name) {
  if (isFile()) {
    const v = readPrefs()[name];
    return typeof v === 'string' ? v : null;
  }
  const v = rawCookies().get(name);
  return v === undefined ? null : v;
}

export function setCookie(name, value) {
  if (!COOKIE_NAME_RE.test(String(name))) return;
  if (isFile()) {
    const prefs = readPrefs();
    prefs[name] = String(value);
    writeJson(PREFS_KEY, prefs);
    return;
  }
  try { writeCookie(name, String(value), appDir()); } catch { /* ignore */ }
}

export function deleteCookie(name) {
  if (!COOKIE_NAME_RE.test(String(name))) return;
  if (isFile()) {
    const prefs = readPrefs();
    delete prefs[name];
    writeJson(PREFS_KEY, prefs);
    return;
  }
  try { document.cookie = `sb_${name}=; max-age=0; path=${appDir()}; SameSite=Lax`; } catch { /* ignore */ }
}

// Code language for language-aware modules (Code Writing, Code Reviewing): cookie sb_codeLang.
const CODE_LANG_COOKIE = 'codeLang';

export function getCodeLang() {
  const v = getCookie(CODE_LANG_COOKIE);
  return isLang(v) ? v : DEFAULT_LANG;
}

// Returns true when `id` is a known language and was stored.
export function setCodeLang(id) {
  if (!isLang(id)) return false;
  setCookie(CODE_LANG_COOKIE, id);
  return true;
}

// ---- export / import / clear ----

function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Everything worth keeping, in the export/import shape. Optional extra fields (version stays 1):
// mixPresets + mixDraft. Also the contents of the data folder's studyblock-data.json.
export function snapshot() {
  const out = { ...load(), mixPresets: getPresets() };
  const draft = loadMixDraft();
  if (draft) out.mixDraft = draft;
  return out;
}

export function exportData() {
  const out = snapshot();
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studyblock-progress-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reads a File, validates, and merges or replaces. Returns { added, total, presetsAdded }.
export async function importData(file, mode) {
  if (!file) throw new Error('No file selected.');
  return importText(await file.text(), mode);
}

// Same as importData, for JSON text from anywhere (e.g. the data folder). Data only, never executed.
export function importText(text, mode) {
  let incoming;
  try {
    incoming = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  return importObject(incoming, mode);
}

function importObject(incoming, mode) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Import mode must be "merge" or "replace".');
  validate(incoming);
  // Keep only known fields (data only).
  const clean = incoming.attempts.map(a => ({
    id: a.id, ts: a.ts, module: a.module, subtopic: a.subtopic, difficulty: a.difficulty,
    score: a.score, total: a.total,
    // Optional: a guided run (shown in History, never scored).
    ...(a.guided === true ? { guided: true } : {}),
    questions: a.questions.map(q => ({
      seed: isNum(q.seed) ? q.seed : null,
      prompt: q.prompt,
      answer: cleanAnswer(q.answer),
      userAnswer: isStr(q.userAnswer) ? q.userAnswer : isObj(q.userAnswer) ? (cleanPartMap(q.userAnswer) ?? '') : String(q.userAnswer ?? ''),
      correct: q.correct,
      // Optional partial credit (0–1); older data has none and falls back to `correct`.
      ...(isNum(q.credit) ? { credit: Math.min(1, Math.max(0, q.credit)) } : {}),
      // Optional per-part results of a multi-part question.
      ...(cleanParts(q.parts) ? { parts: cleanParts(q.parts) } : {}),
      // Optional segmented-choice column labels (single question / per multi-part part).
      ...(cleanChoiceCols(q.choiceCols) ? { choiceCols: cleanChoiceCols(q.choiceCols) } : {}),
      ...(cleanPartCols(q.partCols) ? { partCols: cleanPartCols(q.partCols) } : {}),
      // Optional answer mode (Blocks + multiplier) and close-answer credit; validated, 0-1.
      ...cleanMode(q),
      ...(!q.correct && cleanClose(q.fuzzy) ? { fuzzy: cleanClose(q.fuzzy) } : {}),
      // Optional: accepted by the module's grader (e.g. SQL output), and a guided run's outcome.
      ...(q.correct && q.gradedBy === 'output' ? { gradedBy: 'output' } : {}),
      ...(a.guided === true && GUIDED_OUTCOMES.includes(q.outcome) ? { outcome: q.outcome } : {}),
      ...(isStr(q.explanation) ? { explanation: q.explanation } : {}),
      // Optional per-question attribution (mixed quizzes); older data has none.
      ...(isStr(q.module) && /^[a-z0-9-]+$/.test(q.module) ? { module: q.module } : {}),
      ...(isStr(q.subtopic) ? { subtopic: q.subtopic } : {}),
      ...(isStr(q.difficulty) ? { difficulty: q.difficulty } : {}),
      // Optional code language (language-aware modules); unknown ids are dropped.
      ...(isLang(q.lang) ? { lang: q.lang } : {}),
      // Optional calculator working ("Your working"); validated and capped.
      ...(cleanWork(q.work) ? { work: cleanWork(q.work) } : {}),
      // Optional calculator graph saved with the working; validated and capped.
      ...(cleanGraph(q.graph) ? { graph: cleanGraph(q.graph) } : {}),
    })),
  }));
  // Optional mix fields: invalid presets are dropped individually; an invalid draft is ignored.
  const hasPresets = Array.isArray(incoming.mixPresets);
  const inPresets = cleanPresetList(incoming.mixPresets);
  const inDraft = cleanDraft(incoming.mixDraft);
  let data;
  let added;
  let presets;
  let presetsAdded = 0;
  if (mode === 'replace') {
    data = { version: VERSION, attempts: clean };
    added = clean.length;
    if (hasPresets) { presets = []; for (const p of inPresets) { presets.push({ ...p, name: uniqueName(presets, p.name) }); presetsAdded++; } }
  } else {
    data = load();
    const ids = new Set(data.attempts.map(a => a.id));
    added = 0;
    for (const a of clean) {
      if (!ids.has(a.id)) { data.attempts.push(a); ids.add(a.id); added++; }
    }
    if (inPresets.length) {
      presets = getPresets();
      const pids = new Set(presets.map(p => p.id));
      for (const p of inPresets) {
        if (pids.has(p.id)) continue; // dedupe by id
        presets.push({ ...p, name: uniqueName(presets, p.name) });
        pids.add(p.id);
        presetsAdded++;
      }
    }
  }
  if (!save(data)) throw new Error('Could not write to local storage (full or blocked?).');
  if (presets) savePresets(presets);
  // Draft: replace takes the file's draft; merge only fills in when there is no local draft.
  if (inDraft && (mode === 'replace' || !loadMixDraft())) saveMixDraft(inDraft);
  return { added, total: data.attempts.length, presetsAdded };
}

export function clearData() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  notifySaved();
}
