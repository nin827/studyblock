// Loads modules, generates + verifies questions, checks answers.

import { createRng, randomSeed } from './rng.js';
import { parseCSV } from './csv.js';

const ID_RE = /^[a-z0-9-]+$/;
const cache = new Map(); // url -> Promise

const urlFor = path => new URL(path, document.baseURI).href;

function fetchCached(path, kind) {
  const url = urlFor(path);
  const key = `${kind}:${url}`;
  if (!cache.has(key)) {
    const p = fetch(url).then(res => {
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} loading ${path}`);
        err.status = res.status;
        throw err;
      }
      return kind === 'json' ? res.json() : res.text();
    });
    p.catch(() => cache.delete(key)); // allow retry after failure
    cache.set(key, p);
  }
  return cache.get(key);
}

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export async function loadIndex() {
  const idx = await fetchCached('modules/index.json', 'json');
  const list = Array.isArray(idx?.modules) ? idx.modules : [];
  return list.filter(id => {
    if (!isValidId(id)) { console.error(`StudyBlock: ignoring invalid module id ${JSON.stringify(id)}`); return false; }
    return true;
  });
}

async function assertListed(id) {
  if (!isValidId(id)) throw new Error('Invalid module id.');
  const ids = await loadIndex();
  if (!ids.includes(id)) throw new Error('Unknown module.');
}

export async function loadModule(id) {
  await assertListed(id);
  const m = await fetchCached(`modules/${id}/module.json`, 'json');
  if (!m || typeof m !== 'object') throw new Error(`Bad module.json for ${id}`);
  return {
    ...m,
    id,
    questionsPerQuiz: Number.isInteger(m.questionsPerQuiz) && m.questionsPerQuiz > 0 ? m.questionsPerQuiz : 10,
    subtopics: Array.isArray(m.subtopics) ? m.subtopics : [],
  };
}

export async function loadAllModules() {
  const ids = await loadIndex();
  const results = await Promise.all(ids.map(id => loadModule(id).catch(e => {
    console.error(`StudyBlock: failed to load module ${id}`, e);
    return null;
  })));
  return results.filter(Boolean);
}

// Returns intro markdown text, or null if missing.
export async function loadIntro(id) {
  await assertListed(id);
  try {
    return await fetchCached(`modules/${id}/intro.md`, 'text');
  } catch {
    return null;
  }
}

const generators = new Map();
async function loadGenerator(id) {
  await assertListed(id);
  if (!generators.has(id)) {
    const p = import(urlFor(`modules/${id}/generator.js`));
    p.catch(() => generators.delete(id));
    generators.set(id, p);
  }
  const mod = await generators.get(id);
  if (typeof mod.generate !== 'function') throw new Error(`Module ${id}: generator.js has no generate()`);
  return mod;
}

async function loadCsvRows(id) {
  await assertListed(id);
  const text = await fetchCached(`modules/${id}/questions.csv`, 'text');
  return parseCSV(text);
}

function csvPool(rows, subtopic, difficulty) {
  return rows.filter(r =>
    (r.subtopic || '').trim() === subtopic &&
    (!(r.difficulty || '').trim() || r.difficulty.trim() === difficulty));
}

function csvQuestion(pool, seed) {
  const rng = createRng(seed);
  const row = rng.pick(pool);
  const choicesRaw = (row.choices || '').trim();
  const choices = choicesRaw ? rng.shuffle(choicesRaw.split('|').map(s => s.trim()).filter(Boolean)) : undefined;
  return {
    seed,
    prompt: row.prompt ?? '',
    answer: (row.answer ?? '').trim(),
    answerType: choices ? 'choice' : 'text',
    choices,
    tolerance: undefined,
    explanation: row.explanation || '',
  };
}

function normalizeGenerated(q, seed) {
  const answerType = ['number', 'text', 'choice'].includes(q.answerType) ? q.answerType : 'text';
  return {
    seed,
    prompt: String(q.prompt ?? ''),
    answer: q.answer,
    answerType,
    choices: answerType === 'choice' && Array.isArray(q.choices) ? q.choices.map(String) : undefined,
    tolerance: typeof q.tolerance === 'number' ? q.tolerance : undefined,
    explanation: q.explanation ? String(q.explanation) : '',
  };
}

// Generate one verified question from a generator module. Returns null on failure.
function generateVerified(gen, subtopic, difficulty, seed, maxTries = 20) {
  let s = seed;
  for (let t = 0; t < maxTries; t++) {
    try {
      const raw = gen.generate({ subtopic, difficulty, rng: createRng(s) });
      const q = normalizeGenerated(raw, s);
      const shapeOk = q.answerType !== 'choice' || (q.choices && q.choices.includes(String(q.answer)));
      const ok = shapeOk && typeof gen.verify === 'function' ? gen.verify(raw, raw.answer) === true : true;
      if (ok) return q;
    } catch (e) {
      console.warn('StudyBlock: generator threw', e);
    }
    s = randomSeed();
  }
  console.error(`StudyBlock: could not generate a verified question (${subtopic}/${difficulty}) after ${maxTries} tries`);
  return null;
}

export async function buildQuiz(moduleId, subtopic, difficulty) {
  const mod = await loadModule(moduleId);
  const st = mod.subtopics.find(s => s.id === subtopic);
  if (!st) throw new Error('Unknown subtopic.');
  if (Array.isArray(st.difficulties) && !st.difficulties.includes(difficulty)) throw new Error('Unknown difficulty.');
  const n = mod.questionsPerQuiz;
  const questions = [];
  const seen = new Set();

  if (mod.type === 'csv') {
    const pool = csvPool(await loadCsvRows(moduleId), subtopic, difficulty);
    if (!pool.length) throw new Error('No questions available for this subtopic and difficulty.');
    const unique = new Set(pool.map(r => r.prompt)).size;
    const target = Math.min(n, unique);
    let tries = 0;
    while (questions.length < target && tries < target * 50) {
      tries++;
      const q = csvQuestion(pool, randomSeed());
      if (seen.has(q.prompt)) continue;
      seen.add(q.prompt);
      questions.push(q);
    }
  } else {
    const gen = await loadGenerator(moduleId);
    let failures = 0;
    let dupTries = 0;
    while (questions.length < n && failures < n) {
      const q = generateVerified(gen, subtopic, difficulty, randomSeed());
      if (!q) { failures++; continue; }
      if (seen.has(q.prompt) && dupTries < n * 10) { dupTries++; continue; }
      seen.add(q.prompt);
      questions.push(q);
    }
    if (!questions.length) throw new Error('This quiz could not generate any valid questions.');
  }
  return questions;
}

// Rebuild a stored question from its seed.
export async function regenerate(moduleId, subtopic, difficulty, seed) {
  const mod = await loadModule(moduleId);
  if (mod.type === 'csv') {
    const pool = csvPool(await loadCsvRows(moduleId), subtopic, difficulty);
    return pool.length ? csvQuestion(pool, seed) : null;
  }
  const gen = await loadGenerator(moduleId);
  const raw = gen.generate({ subtopic, difficulty, rng: createRng(seed) });
  return normalizeGenerated(raw, seed);
}

const normText = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function checkAnswer(question, userAnswer) {
  switch (question.answerType) {
    case 'number': {
      let str = String(userAnswer ?? '').trim().replace(/−/g, '-');
      if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) str = str.replace(/,/g, ''); // thousands separators
      if (!str) return false;
      const u = Number(str);
      const a = Number(question.answer);
      if (!Number.isFinite(u) || !Number.isFinite(a)) return false;
      const tol = typeof question.tolerance === 'number' ? Math.max(question.tolerance, 1e-9) : 1e-9;
      return Math.abs(u - a) <= tol;
    }
    case 'choice':
      return String(userAnswer) === String(question.answer);
    default:
      return normText(userAnswer) === normText(question.answer);
  }
}
