// Loads modules, generates + verifies questions, checks answers.

import { createRng, randomSeed } from './rng.js';
import { parseCSV } from './csv.js';
import { loadJSON, loadText, loadModule as loadSourceModule } from './source.js';

const ID_RE = /^[a-z0-9-]+$/;

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

const strOr = (v, d) => (typeof v === 'string' ? v : d);

// Parses modules/index.json -> [{ id, title, icon, description, modules: [moduleId] }].
// Invalid / duplicate domain ids are dropped; a module id may belong to only one domain
// (later duplicates are ignored). The legacy flat `{ modules: [...] }` shape is accepted
// as a single "modules" domain.
function parseRegistry(idx) {
  let raw = Array.isArray(idx?.domains) ? idx.domains : null;
  if (!raw && Array.isArray(idx?.modules)) raw = [{ id: 'modules', title: 'Modules', icon: 'layout-grid', modules: idx.modules }];
  const domains = [];
  const seenDomains = new Set();
  const seenModules = new Set();
  for (const d of raw || []) {
    if (!d || typeof d !== 'object' || !isValidId(d.id)) { console.error(`StudyBlock: ignoring invalid domain ${JSON.stringify(d?.id)}`); continue; }
    if (seenDomains.has(d.id)) { console.error(`StudyBlock: duplicate domain id ${d.id}`); continue; }
    seenDomains.add(d.id);
    const modules = [];
    for (const id of Array.isArray(d.modules) ? d.modules : []) {
      if (!isValidId(id)) { console.error(`StudyBlock: ignoring invalid module id ${JSON.stringify(id)}`); continue; }
      if (seenModules.has(id)) { console.error(`StudyBlock: module ${id} is listed in more than one domain; keeping the first`); continue; }
      seenModules.add(id);
      modules.push(id);
    }
    const domain = {
      id: d.id,
      title: strOr(d.title, d.id),
      icon: strOr(d.icon, 'folder'),
      description: strOr(d.description, ''),
      modules,
    };
    // Optional solid colour for bars/segments; anything but #RRGGBB is dropped.
    if (typeof d.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.color)) domain.color = d.color;
    domains.push(domain);
  }
  return domains;
}

export async function loadDomains() {
  const idx = await loadJSON('modules/index.json');
  return parseRegistry(idx);
}

// Flat list of every registered module id (all domains).
export async function loadIndex() {
  const domains = await loadDomains();
  return domains.flatMap(d => d.modules);
}

// Domain object containing the module, or null.
export async function domainOf(moduleId) {
  const domains = await loadDomains();
  return domains.find(d => d.modules.includes(moduleId)) || null;
}

// Loads the modules of one domain, silently skipping any that fail (e.g. not written yet).
export async function loadModulesOf(domain) {
  const results = await Promise.all(domain.modules.map(id => loadModule(id).catch(e => {
    console.warn(`StudyBlock: module ${id} unavailable`, e);
    return null;
  })));
  return results.filter(Boolean);
}

async function assertListed(id) {
  if (!isValidId(id)) throw new Error('Invalid module id.');
  const ids = await loadIndex();
  if (!ids.includes(id)) throw new Error('Unknown module.');
}

export async function loadModule(id) {
  await assertListed(id);
  const m = await loadJSON(`modules/${id}/module.json`);
  if (!m || typeof m !== 'object') throw new Error(`Bad module.json for ${id}`);
  return {
    ...m,
    id,
    questionsPerQuiz: Number.isInteger(m.questionsPerQuiz) && m.questionsPerQuiz > 0 ? m.questionsPerQuiz : 10,
    subtopics: Array.isArray(m.subtopics) ? m.subtopics : [],
    // Quiz calculator panel; a module opts out with "calculator": false.
    calculator: m.calculator !== false,
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
    return await loadText(`modules/${id}/intro.md`);
  } catch {
    return null;
  }
}

const generators = new Map();
async function loadGenerator(id) {
  await assertListed(id);
  if (!generators.has(id)) {
    const p = loadSourceModule(`modules/${id}/generator.js`);
    p.catch(() => generators.delete(id));
    generators.set(id, p);
  }
  const mod = await generators.get(id);
  if (typeof mod.generate !== 'function') throw new Error(`Module ${id}: generator.js has no generate()`);
  return mod;
}

async function loadCsvRows(id) {
  await assertListed(id);
  const text = await loadText(`modules/${id}/questions.csv`);
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

const PART_TYPES = ['number', 'text', 'choice'];
export const MULTI_MIN_PARTS = 2;
export const MULTI_MAX_PARTS = 4;

// One part of a multi-part question, normalised like a single question.
function normalizePart(p) {
  const answerType = PART_TYPES.includes(p?.answerType) ? p.answerType : 'text';
  return {
    id: String(p?.id ?? ''),
    label: String(p?.label ?? ''),
    ask: p?.ask ? String(p.ask) : '',
    answerType,
    answer: p?.answer,
    choices: answerType === 'choice' && Array.isArray(p.choices) ? p.choices.map(String) : undefined,
    tolerance: typeof p?.tolerance === 'number' ? p.tolerance : undefined,
  };
}

// Shape check for a raw multi-part question: 2-4 parts, unique ids matching ID_RE, a label,
// and each part valid as its own number/text/choice question.
export function multiShapeOk(raw) {
  const parts = raw?.parts;
  if (!Array.isArray(parts) || parts.length < MULTI_MIN_PARTS || parts.length > MULTI_MAX_PARTS) return false;
  const ids = new Set();
  for (const p of parts) {
    if (!p || typeof p !== 'object' || !isValidId(p.id) || ids.has(p.id)) return false;
    ids.add(p.id);
    if (typeof p.label !== 'string' || !p.label.trim()) return false;
    if (!PART_TYPES.includes(p.answerType)) return false;
    if (p.answerType === 'number') {
      if (typeof p.answer !== 'number' || !Number.isFinite(p.answer)) return false;
    } else if (p.answerType === 'text') {
      if (typeof p.answer !== 'string' && typeof p.answer !== 'number') return false;
      if (!String(p.answer).trim()) return false;
    } else {
      if (!Array.isArray(p.choices) || p.choices.length < 2) return false;
      const cs = p.choices.map(String);
      if (new Set(cs).size !== cs.length || !cs.includes(String(p.answer))) return false;
    }
  }
  return true;
}

// The generator's own answers as { [partId]: value }.
const multiAnswer = parts => Object.fromEntries(parts.map(p => [p.id, p.answer]));

function normalizeGenerated(q, seed) {
  if (q.answerType === 'multi') {
    const parts = (Array.isArray(q.parts) ? q.parts : []).map(normalizePart);
    return {
      seed,
      prompt: String(q.prompt ?? ''),
      answer: multiAnswer(parts),
      answerType: 'multi',
      parts,
      choices: undefined,
      tolerance: undefined,
      explanation: q.explanation ? String(q.explanation) : '',
    };
  }
  const answerType = PART_TYPES.includes(q.answerType) ? q.answerType : 'text';
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
      let shapeOk, own;
      if (raw.answerType === 'multi') {
        shapeOk = multiShapeOk(raw);
        own = shapeOk ? multiAnswer(raw.parts) : null;
      } else {
        shapeOk = q.answerType !== 'choice' || (q.choices && q.choices.includes(String(q.answer)));
        own = raw.answer;
      }
      const ok = shapeOk && (typeof gen.verify !== 'function' || gen.verify(raw, own) === true);
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

// ---- multi-domain mix ----

export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];
export const MIX_MAX_COUNT = 50;
const MAX_WEIGHT = 1000;

// Non-negative finite number (capped), else `fallback`.
export function sanitizeWeight(v, fallback = 1) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, MAX_WEIGHT);
}

export function sanitizeCount(v, fallback = 10) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MIX_MAX_COUNT, Math.max(1, n));
}

// Fills a (possibly stale or partial) mix config against the available domains:
// `available` = [{ id, modules: [moduleId] }]. Unknown domains/modules default to weight 1.
export function normalizeMixConfig(raw, available) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const srcDomains = src.domains && typeof src.domains === 'object' ? src.domains : {};
  const domains = {};
  for (const d of available) {
    const sd = Object.prototype.hasOwnProperty.call(srcDomains, d.id) && srcDomains[d.id] && typeof srcDomains[d.id] === 'object' ? srcDomains[d.id] : {};
    const sm = sd.modules && typeof sd.modules === 'object' ? sd.modules : {};
    const modules = {};
    for (const mid of d.modules) {
      modules[mid] = Object.prototype.hasOwnProperty.call(sm, mid) ? sanitizeWeight(sm[mid], 1) : 1;
    }
    domains[d.id] = { weight: sanitizeWeight(sd.weight, 1), modules };
  }
  const difficulty = ['any', ...DIFFICULTY_ORDER].includes(src.difficulty) ? src.difficulty : 'any';
  return { domains, difficulty, count: sanitizeCount(src.count, 10) };
}

// Effective share of each (domain, module) under the sampling rule:
// P(domain) ∝ domain weight (only domains whose module weights sum > 0),
// P(module | domain) ∝ module weight. Returns [{ domain, module, share }] with share in [0,1].
export function mixShares(config, available) {
  const rows = [];
  let domainTotal = 0;
  const per = [];
  for (const d of available) {
    const dc = config.domains[d.id];
    if (!dc) continue;
    const mods = d.modules.map(mid => ({ mid, w: dc.modules[mid] || 0 })).filter(x => x.w > 0);
    const mSum = mods.reduce((s, x) => s + x.w, 0);
    const dw = mSum > 0 ? (dc.weight || 0) : 0;
    if (dw <= 0) continue;
    domainTotal += dw;
    per.push({ d, dw, mods, mSum });
  }
  for (const { d, dw, mods, mSum } of per) {
    for (const { mid, w } of mods) rows.push({ domain: d.id, module: mid, share: (dw / domainTotal) * (w / mSum) });
  }
  return rows;
}

// ---- official presets (presets/index.json + presets/<id>.json, read-only) ----

export const OFFICIAL_PREFIX = 'official:';

// Maps an official preset's compact config onto a full mix config over the registry:
// missing domain -> excluded (weight 0); missing `modules` -> every module at weight 1;
// listed `modules` -> unlisted modules excluded; unknown ids ignored with console.warn.
export function officialToConfig(compact, domains, presetId = '?') {
  const src = compact && typeof compact === 'object' ? compact : {};
  const srcDomains = src.domains && typeof src.domains === 'object' && !Array.isArray(src.domains) ? src.domains : {};
  const known = new Map(domains.map(d => [d.id, d]));
  for (const id of Object.keys(srcDomains)) {
    if (!known.has(id)) console.warn(`StudyBlock: official preset ${presetId} references unknown domain ${JSON.stringify(id)}`);
  }
  const out = {};
  for (const d of domains) {
    const has = Object.prototype.hasOwnProperty.call(srcDomains, d.id);
    const sd = has && srcDomains[d.id] && typeof srcDomains[d.id] === 'object' ? srcDomains[d.id] : null;
    const modules = {};
    if (!sd) {
      for (const mid of d.modules) modules[mid] = 1; // excluded domain; modules keep defaults if re-ticked
      out[d.id] = { weight: 0, modules };
      continue;
    }
    const sm = sd.modules && typeof sd.modules === 'object' && !Array.isArray(sd.modules) ? sd.modules : null;
    if (sm) {
      for (const mid of Object.keys(sm)) {
        if (!d.modules.includes(mid)) console.warn(`StudyBlock: official preset ${presetId} references unknown module ${JSON.stringify(mid)} in ${d.id}`);
      }
    }
    for (const mid of d.modules) {
      modules[mid] = sm ? (Object.prototype.hasOwnProperty.call(sm, mid) ? sanitizeWeight(sm[mid], 1) : 0) : 1;
    }
    out[d.id] = { weight: sanitizeWeight(sd.weight, 1), modules };
  }
  const difficulty = ['any', ...DIFFICULTY_ORDER].includes(src.difficulty) ? src.difficulty : 'any';
  return { domains: out, difficulty, count: sanitizeCount(src.count, 10) };
}

// -> [{ id: "official:<id>", officialId, name, description, config, official: true }].
// A missing or broken presets folder (or file) yields fewer/no presets, never an error.
export async function loadOfficialPresets() {
  let ids = [];
  try {
    const idx = await loadJSON('presets/index.json');
    ids = (Array.isArray(idx?.presets) ? idx.presets : []).filter(id => {
      if (isValidId(id)) return true;
      console.warn(`StudyBlock: ignoring invalid official preset id ${JSON.stringify(id)}`);
      return false;
    });
  } catch (e) {
    console.warn('StudyBlock: no official presets', e);
    return [];
  }
  let domains = [];
  try { domains = await loadDomains(); } catch { return []; }
  const seen = new Set();
  const list = await Promise.all(ids.filter(id => !seen.has(id) && seen.add(id)).map(async id => {
    try {
      const p = await loadJSON(`presets/${id}.json`);
      if (!p || typeof p !== 'object') throw new Error('not an object');
      const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : id;
      return {
        id: OFFICIAL_PREFIX + id, officialId: id, official: true, name,
        description: typeof p.description === 'string' ? p.description : '',
        config: officialToConfig(p.config, domains, id),
      };
    } catch (e) {
      console.warn(`StudyBlock: could not load official preset ${id}`, e);
      return null;
    }
  }));
  return list.filter(Boolean);
}

function weightedPick(rng, items, weightOf) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  if (!(total > 0)) return null;
  let r = rng.next() * total;
  for (const x of items) {
    r -= weightOf(x);
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

// The chosen difficulty if supported, else the closest available (ties -> easier);
// "any" = uniform over the subtopic's difficulties.
function resolveDifficulty(rng, st, wanted) {
  const list = Array.isArray(st.difficulties) && st.difficulties.length ? st.difficulties : null;
  if (!list) return wanted === 'any' ? 'medium' : wanted;
  if (wanted === 'any') return rng.pick(list);
  if (list.includes(wanted)) return wanted;
  const w = DIFFICULTY_ORDER.indexOf(wanted);
  let best = list[0], bestDist = Infinity;
  for (const d of list) {
    const i = DIFFICULTY_ORDER.indexOf(d);
    const dist = i < 0 ? 99 : Math.abs(i - w);
    if (dist < bestDist || (dist === bestDist && i < DIFFICULTY_ORDER.indexOf(best))) { best = d; bestDist = dist; }
  }
  return best;
}

// Builds a mixed quiz. Each question is annotated with module/subtopic/difficulty and titles.
export async function buildMixQuiz(config, seed = randomSeed()) {
  const rng = createRng(seed);
  const domains = await loadDomains();
  const cfg = normalizeMixConfig(config, domains);

  // Preload every selected module and its question source; drop anything that fails.
  const sources = new Map(); // moduleId -> { mod, gen?, rows? }
  await Promise.all(mixShares(cfg, domains).map(async ({ module: mid }) => {
    try {
      const mod = await loadModule(mid);
      if (!mod.subtopics.length) return;
      if (mod.type === 'csv') sources.set(mid, { mod, rows: await loadCsvRows(mid) });
      else sources.set(mid, { mod, gen: await loadGenerator(mid) });
    } catch (e) {
      console.warn(`StudyBlock: skipping module ${mid} in mix`, e);
    }
  }));
  const usable = domains
    .map(d => ({ ...d, modules: d.modules.filter(mid => sources.has(mid)) }))
    .filter(d => d.modules.length);
  let pool = mixShares(cfg, usable);
  if (!pool.length) throw new Error('None of the selected subdomains are available. Adjust the mix and try again.');

  const titleOf = new Map(domains.map(d => [d.id, d.title]));
  const n = cfg.count;
  const questions = [];
  const seen = new Set();
  const failures = new Map(); // moduleId -> consecutive generation failures
  let tries = 0;
  const maxTries = n * 40;

  while (questions.length < n && tries < maxTries && pool.length) {
    tries++;
    // Domain ∝ its weight (= sum of its rows' shares), then module within it ∝ module weight.
    const domainIds = [...new Set(pool.map(r => r.domain))];
    const dId = weightedPick(rng, domainIds, id => pool.reduce((s, r) => s + (r.domain === id ? r.share : 0), 0));
    const pick = dId && weightedPick(rng, pool.filter(r => r.domain === dId), r => r.share);
    if (!pick) break;
    const { mod, gen, rows } = sources.get(pick.module);
    const st = rng.pick(mod.subtopics);
    const difficulty = resolveDifficulty(rng, st, cfg.difficulty);
    const qSeed = Math.floor(rng.next() * 0x100000000) >>> 0;
    let q = null;
    if (rows) {
      const p = csvPool(rows, st.id, difficulty);
      if (p.length) q = csvQuestion(p, qSeed);
    } else {
      q = generateVerified(gen, st.id, difficulty, qSeed);
    }
    if (!q) {
      const f = (failures.get(mod.id) || 0) + 1;
      failures.set(mod.id, f);
      if (f >= 25) { // persistently broken: drop it and renormalise
        console.error(`StudyBlock: dropping module ${mod.id} from mix after repeated failures`);
        sources.delete(mod.id);
        pool = mixShares(cfg, usable.map(d => ({ ...d, modules: d.modules.filter(mid => sources.has(mid)) })));
      }
      continue;
    }
    failures.set(mod.id, 0);
    const key = `${mod.id}|${q.prompt}`;
    // Avoid duplicate prompts while there is retry budget left.
    if (seen.has(key) && tries < maxTries * 0.75) continue;
    seen.add(key);
    questions.push({
      ...q,
      module: mod.id,
      moduleTitle: String(mod.title ?? mod.id),
      domain: pick.domain,
      domainTitle: titleOf.get(pick.domain) ?? pick.domain,
      subtopic: st.id,
      subtopicTitle: String(st.title ?? st.id),
      difficulty,
      calculator: mod.calculator !== false,
    });
  }
  if (!questions.length) throw new Error('The mixed quiz could not generate any questions.');
  return questions;
}

const normText = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/*
 * Single questions: returns a boolean (unchanged).
 * Multi-part questions (answerType "multi"): `userAnswer` is { [partId]: value } and the result is
 * { correct, parts: [{ id, label, correct }] }; correct only if every part is correct.
 */
export function checkAnswer(question, userAnswer) {
  if (question.answerType === 'multi') {
    const given = userAnswer && typeof userAnswer === 'object' ? userAnswer : {};
    const parts = (question.parts || []).map(p => ({
      id: p.id,
      label: p.label,
      correct: Object.prototype.hasOwnProperty.call(given, p.id) && checkSingle(p, given[p.id]),
    }));
    return { correct: parts.length > 0 && parts.every(p => p.correct), parts };
  }
  return checkSingle(question, userAnswer);
}

function checkSingle(question, userAnswer) {
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
