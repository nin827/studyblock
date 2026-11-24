// localStorage store (source of truth), cookie cache, import/export.

import { requestPersistentStorage } from './pwa.js';

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
  if (!isNum(a.score) || !isNum(a.total) || a.total < 0 || a.score < 0) {
    throw new Error(`${where} has an invalid "score" or "total".`);
  }
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

// ---- attempts ----

export function saveAttempt(attempt) {
  const data = load();
  const a = { id: uuid(), ts: Date.now(), ...attempt };
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

/*
 * Per-module attribution rule (kept deliberately simple):
 * - A single-module attempt counts for its module as-is.
 * - A mixed attempt (module "mix") is split into one "slice" per module (optionally narrowed
 *   further to a subtopic/difficulty) using each question's own module/subtopic/difficulty.
 *   A slice behaves like a small attempt: { ts, score = correct questions, total = questions }.
 *   So it adds 1 to that module's attempt count and its percentage feeds Best/Last/Overall
 *   (a 1-question slice answered correctly therefore counts as a 100% "best").
 * - Mixed questions without a `module` field (shouldn't happen) are ignored for per-module stats.
 */
function mixSlices(attempts, match) {
  const out = [];
  for (const a of attempts) {
    if (a.module !== MIX_MODULE) continue;
    const groups = new Map();
    for (const q of a.questions) {
      if (typeof q.module !== 'string' || !match(q)) continue;
      const key = `${q.module}|${q.subtopic ?? ''}|${q.difficulty ?? ''}`;
      if (!groups.has(key)) groups.set(key, { ts: a.ts, module: q.module, subtopic: q.subtopic, difficulty: q.difficulty, score: 0, total: 0, fromMix: true, attemptId: a.id });
      const g = groups.get(key);
      g.total++;
      if (q.correct) g.score++;
    }
    out.push(...groups.values());
  }
  return out;
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
  const slices = mergeSlices(mixSlices(attempts, q => matches(filter, q)));
  return single.concat(slices);
}

// Stats for any combination of module / subtopic / difficulty.
// With a real module id, mixed-quiz questions for that module are included (see rule above).
// With no module (or module "mix"), attempts are aggregated as stored.
export function getStats({ module, subtopic, difficulty } = {}) {
  const attempts = load().attempts;
  if (module === undefined || module === MIX_MODULE) {
    return summarize(attempts.filter(a => matches({ module, subtopic, difficulty }, a)));
  }
  return summarize(recordsFor(attempts, { module, subtopic, difficulty }));
}

// Stats over a set of modules (e.g. a domain): single attempts of those modules plus,
// for each mixed attempt, one slice with its questions from those modules.
export function getStatsForModules(ids) {
  const set = new Set(ids);
  const attempts = load().attempts;
  const single = attempts.filter(a => a.module !== MIX_MODULE && set.has(a.module));
  const slices = mixSlices(attempts, q => set.has(q.module)).map(s => ({ ...s, module: 'set' }));
  return summarize(single.concat(mergeSlices(slices)));
}

// Attempt-like records (newest first) for one module, including mixed slices.
export function getModuleRecords(module) {
  return recordsFor(load().attempts, { module }).sort((a, b) => b.ts - a.ts);
}

// Map "subtopic|difficulty" -> stats for one module (mixed questions included).
export function getModuleCellStats(module) {
  const attempts = load().attempts;
  const groups = {};
  for (const a of attempts) {
    if (a.module !== module) continue;
    (groups[`${a.subtopic}|${a.difficulty}`] ||= []).push(a);
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
    questions: a.questions.map(q => ({
      seed: isNum(q.seed) ? q.seed : null,
      prompt: q.prompt,
      answer: isNum(q.answer) || isStr(q.answer) ? q.answer : String(q.answer ?? ''),
      userAnswer: isStr(q.userAnswer) ? q.userAnswer : String(q.userAnswer ?? ''),
      correct: q.correct,
      ...(isStr(q.explanation) ? { explanation: q.explanation } : {}),
      // Optional per-question attribution (mixed quizzes); older data has none.
      ...(isStr(q.module) && /^[a-z0-9-]+$/.test(q.module) ? { module: q.module } : {}),
      ...(isStr(q.subtopic) ? { subtopic: q.subtopic } : {}),
      ...(isStr(q.difficulty) ? { difficulty: q.difficulty } : {}),
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
