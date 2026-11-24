// localStorage store (source of truth), cookie cache, import/export.

const KEY = 'studyblock:data';
const VERSION = 1;

const empty = () => ({ version: VERSION, attempts: [] });

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
  if (!list.length) return { attempts: 0, best: null, last: null };
  let best = 0, lastA = list[0];
  for (const a of list) {
    best = Math.max(best, pct(a));
    if (a.ts > lastA.ts) lastA = a;
  }
  return { attempts: list.length, best, last: pct(lastA), lastTs: lastA.ts };
}

// Stats for any combination of module / subtopic / difficulty (omit to aggregate).
export function getStats({ module, subtopic, difficulty } = {}) {
  const list = load().attempts.filter(a =>
    (module === undefined || a.module === module) &&
    (subtopic === undefined || a.subtopic === subtopic) &&
    (difficulty === undefined || a.difficulty === difficulty));
  return summarize(list);
}

// Map "subtopic|difficulty" -> stats for one module.
export function getModuleCellStats(module) {
  const groups = {};
  for (const a of load().attempts) {
    if (a.module !== module) continue;
    (groups[`${a.subtopic}|${a.difficulty}`] ||= []).push(a);
  }
  const out = {};
  for (const k in groups) out[k] = summarize(groups[k]);
  return out;
}

export function percent(a) { return pct(a); }

// ---- cookies (small cache only) ----

export function getCookie(name) {
  try {
    const prefix = `sb_${name}=`;
    for (const part of document.cookie.split(';')) {
      const p = part.trim();
      if (p.startsWith(prefix)) return decodeURIComponent(p.slice(prefix.length));
    }
  } catch { /* ignore */ }
  return null;
}

export function setCookie(name, value) {
  try {
    document.cookie = `sb_${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
  } catch { /* ignore */ }
}

// ---- export / import / clear ----

function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function exportData() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studyblock-progress-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reads a File, validates, and merges or replaces. Returns { added, total }.
export async function importData(file, mode) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Import mode must be "merge" or "replace".');
  if (!file) throw new Error('No file selected.');
  const text = await file.text();
  let incoming;
  try {
    incoming = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
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
    })),
  }));
  let data;
  let added;
  if (mode === 'replace') {
    data = { version: VERSION, attempts: clean };
    added = clean.length;
  } else {
    data = load();
    const ids = new Set(data.attempts.map(a => a.id));
    added = 0;
    for (const a of clean) {
      if (!ids.has(a.id)) { data.attempts.push(a); ids.add(a.id); added++; }
    }
  }
  if (!save(data)) throw new Error('Could not write to local storage (full or blocked?).');
  return { added, total: data.attempts.length };
}

export function clearData() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
