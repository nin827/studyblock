// Loads modules, generates + verifies questions, checks answers.

import { createRng, randomSeed } from './rng.js';
import { parseCSV } from './csv.js';
import { loadJSON, loadText, loadModule as loadSourceModule } from './source.js';
import { LANG_IDS, isLang } from './languages.js';
import { getCodeLang } from './storage.js';

const ID_RE = /^[a-z0-9-]+$/;

// Reserved id meaning "every subtopic" / "every difficulty" of one module.
export const ALL = 'all';
// Target length of a CSV quiz that uses "all" (single CSV cells are often only 4 questions).
const CSV_ALL_TARGET = 10;

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

/*
 * Archived modules (modules/index.json top-level "archived": [{ id, title }]): never loaded, shown
 * or sampled. Only their titles are kept, so stored attempts can still show a name instead of the
 * raw id. Returns Map(id -> title). Invalid ids are dropped; an id that is still listed in a
 * domain stays active (that listing wins, with a warning). A missing list yields an empty Map.
 */
export async function loadArchived() {
  let idx;
  try { idx = await loadJSON('modules/index.json'); } catch { return new Map(); }
  const active = new Set(parseRegistry(idx).flatMap(d => d.modules));
  const out = new Map();
  if (idx?.archived === undefined) return out;
  if (!Array.isArray(idx.archived)) { console.warn('StudyBlock: "archived" in modules/index.json must be a list; ignoring it'); return out; }
  for (const a of idx.archived) {
    const id = a && typeof a === 'object' ? a.id : a;
    if (!isValidId(id)) { console.warn(`StudyBlock: ignoring invalid archived module id ${JSON.stringify(id)}`); continue; }
    if (active.has(id)) { console.warn(`StudyBlock: module ${id} is both active and archived; keeping it active`); continue; }
    if (out.has(id)) continue;
    const title = a && typeof a === 'object' && typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 80) : id;
    out.set(id, title);
  }
  return out;
}

// Title lookup for stored attempts: loaded modules first, then archived titles, else the raw id.
// `modules` = loaded module objects; returns id => title (plain text, escape when displaying).
export function titleLookup(modules, archived) {
  const byId = new Map((modules || []).map(m => [m.id, String(m.title ?? m.id)]));
  return id => byId.get(id) ?? archived?.get(id) ?? String(id ?? '');
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
  // "all" is reserved for whole-module quizzes (#/q/<module>/all/<difficulty>).
  const subtopics = (Array.isArray(m.subtopics) ? m.subtopics : []).filter(s => {
    if (s && s.id === ALL) { console.warn(`StudyBlock: module ${id} has a subtopic called "${ALL}", which is reserved; skipping it`); return false; }
    return true;
  }).map(s => cleanDifficulties(s, id)).filter(Boolean);
  return {
    ...m,
    id,
    questionsPerQuiz: Number.isInteger(m.questionsPerQuiz) && m.questionsPerQuiz > 0 ? m.questionsPerQuiz : 10,
    subtopics,
    // Quiz calculator panel; a module opts out with "calculator": false.
    calculator: m.calculator !== false,
    // Code languages the module can show its snippets in ([] = not language-aware).
    languages: parseLanguages(m, id),
    // Blocks-mode credit factor per difficulty for dual Type | Blocks questions (missing = 1).
    tilesMultiplier: parseTilesMultiplier(m, id),
    // Close-answer partial credit; a module opts out with "fuzzy": false.
    fuzzy: m.fuzzy !== false,
  };
}

// module.json "tilesMultiplier": { easy, medium, hard, expert } numbers 0-1; a missing or invalid
// level counts as 1 (invalid ones warn once per module).
const multWarned = new Set();
function parseTilesMultiplier(m, id) {
  const out = { easy: 1, medium: 1, hard: 1, expert: 1 };
  const src = m.tilesMultiplier;
  if (src === undefined || src === null) return out;
  let bad = typeof src !== 'object' || Array.isArray(src);
  if (!bad) {
    for (const [k, v] of Object.entries(src)) {
      if (!Object.prototype.hasOwnProperty.call(out, k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) { bad = true; continue; }
      out[k] = v;
    }
  }
  if (bad && !multWarned.has(id)) {
    multWarned.add(id);
    console.warn(`StudyBlock: module ${id}: "tilesMultiplier" must map easy/medium/hard/expert to numbers 0-1; ignoring bad entries`);
  }
  return out;
}

// Blocks-mode multiplier of a loaded module at one difficulty (1 when unset).
export function tilesMultiplierOf(mod, difficulty) {
  const v = mod?.tilesMultiplier?.[difficulty];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
}

// Per-question module facts the quiz and the grader need (never stored in attempts):
// `srcModule` (the generator's run() and the per-module answer mode), `calculator` (number close
// answers need it), `fuzzy: false` when the module opts out, and the Blocks multiplier.
function decorate(q, mod, difficulty) {
  if (!q) return q;
  const out = { ...q, srcModule: mod.id, calculator: mod.calculator !== false };
  if (mod.fuzzy === false) out.fuzzy = false;
  if (out.blocks) out.blocks = { ...out.blocks, multiplier: tilesMultiplierOf(mod, difficulty) };
  return out;
}

// ---- difficulties ----

// Every difficulty, easiest first. Modules list the ones each subtopic offers.
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'expert'];
export const isDifficulty = d => DIFFICULTY_ORDER.includes(d);

const diffWarned = new Set();

// A subtopic with its "difficulties" list cleaned: unknown values and duplicates dropped (one
// console.warn per module), kept in the module's own order. A subtopic without a list is unchanged
// (it counts as "medium"); one whose list has nothing valid left is skipped. Never mutates `s`.
function cleanDifficulties(s, moduleId) {
  if (!s || typeof s !== 'object' || s.difficulties === undefined) return s;
  const raw = Array.isArray(s.difficulties) ? s.difficulties : [];
  const list = [];
  const bad = [];
  for (const d of raw) {
    if (isDifficulty(d)) { if (!list.includes(d)) list.push(d); } else bad.push(d);
  }
  if ((bad.length || !Array.isArray(s.difficulties)) && !diffWarned.has(moduleId)) {
    diffWarned.add(moduleId);
    console.warn(`StudyBlock: module ${moduleId}: ignoring unknown difficulty value(s) ${JSON.stringify(Array.isArray(s.difficulties) ? bad : s.difficulties)} (known: ${DIFFICULTY_ORDER.join(', ')})`);
  }
  if (!list.length) {
    const key = `${moduleId}|${String(s.id)}`;
    if (!diffWarned.has(key)) {
      diffWarned.add(key);
      console.warn(`StudyBlock: module ${moduleId}: subtopic ${JSON.stringify(s.id)} has no valid difficulties; skipping it`);
    }
    return null;
  }
  return { ...s, difficulties: list };
}

// ---- code languages (Code Writing / Code Reviewing; see js/lib/languages.js) ----

const langWarned = new Set();
function warnLangOnce(id, msg) {
  if (langWarned.has(id)) return;
  langWarned.add(id);
  console.warn(`StudyBlock: module ${id}: ${msg}`);
}

// module.json "languages": a subset of LANG_IDS in the module's own order. Unknown ids and
// duplicates are dropped (one console.warn per module). Generator modules only.
function parseLanguages(m, id) {
  if (m.languages === undefined || m.languages === null) return [];
  if (!Array.isArray(m.languages)) { warnLangOnce(id, '"languages" must be a list; ignoring it'); return []; }
  if (m.type === 'csv') {
    if (m.languages.length) warnLangOnce(id, '"languages" is only supported for generator modules; ignoring it');
    return [];
  }
  const out = [];
  const bad = [];
  for (const l of m.languages) {
    if (isLang(l)) { if (!out.includes(l)) out.push(l); } else bad.push(l);
  }
  if (bad.length) warnLangOnce(id, `ignoring unknown language id(s) ${JSON.stringify(bad)} (known: ${LANG_IDS.join(', ')})`);
  return out;
}

// True when the module shows code in a language the user picks.
export const isLangModule = mod => Array.isArray(mod?.languages) && mod.languages.length > 0;

// The language a module's questions are generated in: the user's preference if the module
// lists it, else the module's first listed language. null for modules that aren't language-aware.
export function effectiveLang(mod, pref = getCodeLang()) {
  if (!isLangModule(mod)) return null;
  return mod.languages.includes(pref) ? pref : mod.languages[0];
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

// Guided-mode "How to solve" notes (modules/<id>/guide.md), or null if missing.
export async function loadGuide(id) {
  await assertListed(id);
  try {
    return await loadText(`modules/${id}/guide.md`);
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

// Every answer in one subtopic of a CSV module (any difficulty): the lookalike list for close answers.
function csvAnswers(rows, subtopic) {
  return [...new Set(rows.filter(r => (r.subtopic || '').trim() === subtopic).map(r => (r.answer ?? '').trim()).filter(Boolean))];
}

// `near` (optional): the subtopic's answers; the other ones become the question's `nearMisses`.
function csvQuestion(pool, seed, near = null) {
  const rng = createRng(seed);
  const row = rng.pick(pool);
  const choicesRaw = (row.choices || '').trim();
  const choices = choicesRaw ? rng.shuffle(choicesRaw.split('|').map(s => s.trim()).filter(Boolean)) : undefined;
  const answer = (row.answer ?? '').trim();
  const nearMisses = !choices && near ? near.filter(a => normText(a) !== normText(answer)) : [];
  return {
    seed,
    prompt: row.prompt ?? '',
    answer,
    answerType: choices ? 'choice' : 'text',
    choices,
    tolerance: undefined,
    explanation: row.explanation || '',
    ...(nearMisses.length ? { nearMisses } : {}),
  };
}

const PART_TYPES = ['number', 'text', 'choice'];
export const MULTI_MIN_PARTS = 2;
export const MULTI_MAX_PARTS = 4;

// One part of a multi-part question, normalised like a single question.
// `hint` (guided mode, optional): one markdown string, sanitised like `hints`.
function normalizePart(p, warnKey) {
  const answerType = PART_TYPES.includes(p?.answerType) ? p.answerType : 'text';
  const hint = p && p.hint !== undefined && p.hint !== null ? sanitizeHints([p.hint], warnKey, p.hint)?.[0] : undefined;
  return {
    id: String(p?.id ?? ''),
    label: String(p?.label ?? ''),
    ask: p?.ask ? String(p.ask) : '',
    answerType,
    answer: p?.answer,
    choices: answerType === 'choice' && Array.isArray(p.choices) ? p.choices.map(String) : undefined,
    tolerance: typeof p?.tolerance === 'number' ? p.tolerance : undefined,
    ...(hint ? { hint } : {}),
    ...closeExtras(p, answerType),
  };
}

// ---- accepted alternatives, lookalikes and the close-answer opt-out ----
export const ACCEPTS_MAX = 20;
const NEAR_MISSES_MAX = 50;
function cleanStrList(raw, max) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const v of raw) {
    if (out.length >= max) break;
    const t = typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) ? String(v).trim() : '';
    if (t && t.length <= 300) out.push(t);
  }
  return out.length ? out : undefined;
}
// `accepts` (text / tiles answers), `nearMisses` (text / number) and `fuzzy: false`, when given.
function closeExtras(q, answerType) {
  const accepts = answerType === 'text' || answerType === 'tiles' ? cleanStrList(q?.accepts, ACCEPTS_MAX) : undefined;
  const nearMisses = answerType === 'text' || answerType === 'number' ? cleanStrList(q?.nearMisses, NEAR_MISSES_MAX) : undefined;
  return { ...(accepts ? { accepts } : {}), ...(nearMisses ? { nearMisses } : {}), ...(q?.fuzzy === false ? { fuzzy: false } : {}) };
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

// Calculator "given values": [{ label, value }] rows the calculator pre-fills for a question.
// Max 8; labels follow the calculator row rule and are unique ignoring case; values finite.
// Bad entries are dropped (one console.warn per generator module). Never stored in attempts.
export const GIVEN_MAX = 8;
const GIVEN_LABEL_RE = /^_[A-Za-z0-9_]{1,23}$/;
const givenWarned = new WeakSet();

export function sanitizeGiven(raw, warnKey) {
  if (raw === undefined || raw === null) return undefined;
  const out = [];
  const seen = new Set();
  let bad = !Array.isArray(raw);
  for (const g of Array.isArray(raw) ? raw : []) {
    const label = g && typeof g === 'object' ? g.label : undefined;
    const value = g && typeof g === 'object' ? g.value : undefined;
    const low = typeof label === 'string' ? label.toLowerCase() : '';
    if (out.length >= GIVEN_MAX || typeof label !== 'string' || !GIVEN_LABEL_RE.test(label) || seen.has(low)
      || typeof value !== 'number' || !Number.isFinite(value)) { bad = true; continue; }
    seen.add(low);
    out.push({ label, value });
  }
  if (bad && warnKey && typeof warnKey === 'object' && !givenWarned.has(warnKey)) {
    givenWarned.add(warnKey);
    console.warn('StudyBlock: a generator returned invalid "given" entries; they were dropped', raw);
  }
  return out.length ? out : undefined;
}

// Guided-mode hints: [markdown] shown one at a time; they lead toward the method without stating
// the final answer. Strings only, trimmed, non-empty, each ≤ HINT_MAX_LEN chars, at most HINTS_MAX.
// Bad entries are dropped (one console.warn per generator module). Never stored in attempts.
export const HINTS_MAX = 4;
export const HINT_MAX_LEN = 600;
const hintsWarned = new WeakSet();

export function sanitizeHints(raw, warnKey, shown = raw) {
  if (raw === undefined || raw === null) return undefined;
  const out = [];
  let bad = !Array.isArray(raw);
  for (const h of Array.isArray(raw) ? raw : []) {
    const t = typeof h === 'string' ? h.trim() : '';
    if (out.length >= HINTS_MAX || !t || t.length > HINT_MAX_LEN) { bad = true; continue; }
    out.push(t);
  }
  if (bad && warnKey && typeof warnKey === 'object' && !hintsWarned.has(warnKey)) {
    hintsWarned.add(warnKey);
    console.warn('StudyBlock: a generator returned invalid "hints" entries; they were dropped', shown);
  }
  return out.length ? out : undefined;
}

// ---- drag-the-blocks answers (answerType "tiles") ----
// tiles: 2-24 entries (room for distractor blocks), each a string (shorthand for { value: s, label: s }) or { value, label }.
// joiner: placed between the placed tiles' values (string, at most 5 chars, default " ").
// useAll: true = every tile must be placed before Check (no distractors); default false.
// The answer is the correct tiles' values joined by `joiner`; checking uses the text rules.
export const TILES_MIN = 2;
export const TILES_MAX = 24;
const TILE_VALUE_MAX = 200;
const TILE_LABEL_MAX = 300;
const TILE_JOINER_MAX = 5;

// { tiles: [{ value, label }], joiner, useAll } or null when the shape is invalid.
// Bad tile entries are dropped; fewer than 2 (or more than 24) left = invalid.
export function sanitizeTiles(q) {
  if (!q || !Array.isArray(q.tiles)) return null;
  const tiles = [];
  for (const t of q.tiles) {
    const raw = typeof t === 'string' || typeof t === 'number' ? { value: t, label: t } : (t && typeof t === 'object' ? t : null);
    if (!raw) continue;
    const value = typeof raw.value === 'string' || (typeof raw.value === 'number' && Number.isFinite(raw.value)) ? String(raw.value).trim() : '';
    const lab = raw.label === undefined || raw.label === null ? value : raw.label;
    const label = typeof lab === 'string' || (typeof lab === 'number' && Number.isFinite(lab)) ? String(lab).trim() : '';
    if (!value || !label || value.length > TILE_VALUE_MAX || label.length > TILE_LABEL_MAX) continue;
    const slot = cleanSlot(raw.slot);
    if (slot === null) return null; // a malformed slot makes the whole question invalid
    tiles.push(slot ? { value, label, slot } : { value, label });
  }
  if (tiles.length < TILES_MIN || tiles.length > TILES_MAX) return null;
  if (q.joiner !== undefined && (typeof q.joiner !== 'string' || q.joiner.length > TILE_JOINER_MAX)) return null;
  if (q.useAll !== undefined && typeof q.useAll !== 'boolean') return null;
  return { tiles, joiner: q.joiner === undefined ? ' ' : q.joiner, useAll: q.useAll === true };
}

// ---- nested blocks: a tile with `slot: { open, close, sep }` holds other tiles ----
export const SLOT_DEPTH_MAX = 3;  // slots inside slots, at most 3 deep
const SLOT_EDGE_MAX = 3;
const SLOT_SEP_MAX = 5;

// { open, close, sep } (defaults "(", ")", ", "), undefined for no slot, null when malformed.
function cleanSlot(s) {
  if (s === undefined || s === null || s === false) return undefined;
  if (typeof s !== 'object' || Array.isArray(s)) return null;
  const open = s.open === undefined ? '(' : s.open;
  const close = s.close === undefined ? ')' : s.close;
  const sep = s.sep === undefined ? ', ' : s.sep;
  if (typeof open !== 'string' || typeof close !== 'string' || typeof sep !== 'string') return null;
  if (open.length > SLOT_EDGE_MAX || close.length > SLOT_EDGE_MAX || sep.length > SLOT_SEP_MAX) return null;
  return { open, close, sep };
}

/*
 * A solution tree of tile indices: [0, { t: 1, kids: [2] }, 3]. Returns [{ t, kids? }] (kids is set,
 * possibly empty, exactly for slot tiles) or null when an index is invalid or reused, kids sit under
 * a tile without a slot, or slots nest more than SLOT_DEPTH_MAX deep.
 */
export function cleanSolution(raw, tiles) {
  if (!Array.isArray(raw) || !Array.isArray(tiles)) return null;
  const used = new Set();
  const walk = (list, depth) => {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const item of list) {
      const obj = item && typeof item === 'object' && !Array.isArray(item);
      const t = obj ? item.t : item;
      if (!Number.isInteger(t) || t < 0 || t >= tiles.length || used.has(t)) return null;
      used.add(t);
      const slot = tiles[t].slot;
      if (obj && item.kids !== undefined && !slot) return null;
      if (!slot) { out.push({ t }); continue; }
      if (depth + 1 > SLOT_DEPTH_MAX && obj && Array.isArray(item.kids) && item.kids.length) return null;
      const kids = obj && item.kids !== undefined ? walk(item.kids, depth + 1) : [];
      if (!kids) return null;
      out.push({ t, kids });
    }
    return out;
  };
  const tree = walk(raw, 0);
  return tree && tree.length ? tree : null;
}

// Number of tiles in a tree.
export const treeSize = nodes => (nodes || []).reduce((n, x) => n + 1 + treeSize(x.kids), 0);

// A plain tile -> its value; a slot tile -> value + open + kids joined by sep + close.
// The top level is joined by `joiner`.
export function serialiseTree(nodes, tiles, joiner = ' ') {
  const one = n => {
    const tile = tiles[n.t];
    if (!tile) return '';
    if (!tile.slot) return tile.value;
    return tile.value + tile.slot.open + (n.kids || []).map(one).join(tile.slot.sep) + tile.slot.close;
  };
  return (nodes || []).map(one).join(joiner);
}

// Shape check for a sanitised blocks spec against the answer it must spell. A spec with a slot tile
// (or with a given solution) must have a valid solution that serialises to the answer; plain specs
// may instead be reachable by some arrangement (tilesReachable).
function blocksSpecOk(spec, answer, solutionGiven) {
  if (!spec || spec.tiles.length < TILES_MIN) return false;
  const target = String(answer ?? '');
  if (spec.tiles.some(t => t.slot) || solutionGiven) {
    if (!spec.solution) return false;
    if (spec.useAll && treeSize(spec.solution) !== spec.tiles.length) return false;
    return target.trim() !== '' && serialiseTree(spec.solution, spec.tiles, spec.joiner) === target;
  }
  return tilesReachable(spec.tiles, spec.joiner, target, spec.useAll);
}

// sanitizeTiles plus the cleaned solution: { tiles, joiner, useAll, solution? } or null.
function blocksSpec(raw) {
  const t = sanitizeTiles(raw);
  if (!t) return null;
  const solution = raw.solution !== undefined ? cleanSolution(raw.solution, t.tiles) : null;
  return { ...t, ...(solution ? { solution } : {}) };
}

// True if some arrangement of distinct tiles (all of them when useAll) joined by `joiner` gives
// exactly `answer`. Depth-first with prefix pruning; equal values are tried once per depth.
export function tilesReachable(tiles, joiner, answer, useAll) {
  const target = String(answer ?? '');
  if (!target.trim()) return false;
  const used = new Array(tiles.length).fill(false);
  const dfs = (prefix, count) => {
    if (count > 0 && prefix === target && (!useAll || count === tiles.length)) return true;
    if (count === tiles.length) return false;
    const tried = new Set();
    for (let i = 0; i < tiles.length; i++) {
      const v = tiles[i].value;
      if (used[i] || tried.has(v)) continue;
      tried.add(v);
      const next = count ? prefix + joiner + v : v;
      if (!target.startsWith(next)) continue;
      used[i] = true;
      if (dfs(next, count + 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return dfs('', 0);
}

function normalizeGenerated(q, seed, warnKey, lang = null) {
  const given = sanitizeGiven(q?.given, warnKey);
  const hints = sanitizeHints(q?.hints, warnKey);
  // `lang` only on questions from language-aware modules.
  const extra = {
    ...(given ? { given } : {}), ...(hints ? { hints } : {}), ...(lang ? { lang } : {}),
    // `runnable`: the module's run(question, answer) can show the answer's output (Run button).
    ...(q?.runnable === true ? { runnable: true } : {}),
    // Generator-private data (e.g. what run() needs); kept in memory only, never stored.
    ...(q?.meta && typeof q.meta === 'object' ? { meta: q.meta } : {}),
  };
  if (q.answerType === 'multi') {
    const parts = (Array.isArray(q.parts) ? q.parts : []).map(p => normalizePart(p, warnKey));
    return {
      seed,
      prompt: String(q.prompt ?? ''),
      answer: multiAnswer(parts),
      answerType: 'multi',
      parts,
      choices: undefined,
      tolerance: undefined,
      explanation: q.explanation ? String(q.explanation) : '',
      ...extra,
    };
  }
  if (q.answerType === 'tiles') {
    // An invalid shape keeps answerType "tiles" with no tiles; generateVerified rejects it.
    const t = blocksSpec(q);
    return {
      seed,
      prompt: String(q.prompt ?? ''),
      answer: q.answer === undefined || q.answer === null ? '' : String(q.answer),
      answerType: 'tiles',
      tiles: t ? t.tiles : [],
      joiner: t ? t.joiner : ' ',
      useAll: t ? t.useAll : false,
      ...(t?.solution ? { solution: t.solution } : {}),
      ...closeExtras(q, 'tiles'),
      choices: undefined,
      tolerance: undefined,
      explanation: q.explanation ? String(q.explanation) : '',
      ...extra,
    };
  }
  const answerType = PART_TYPES.includes(q.answerType) ? q.answerType : 'text';
  // Dual Type | Blocks: a text question's block alternative (null = malformed; rejected later).
  const blocks = answerType === 'text' && q.blocks !== undefined && q.blocks !== null
    ? (q.blocks && typeof q.blocks === 'object' ? blocksSpec(q.blocks) : null) : undefined;
  return {
    seed,
    prompt: String(q.prompt ?? ''),
    answer: q.answer,
    answerType,
    choices: answerType === 'choice' && Array.isArray(q.choices) ? q.choices.map(String) : undefined,
    tolerance: typeof q.tolerance === 'number' ? q.tolerance : undefined,
    explanation: q.explanation ? String(q.explanation) : '',
    ...closeExtras(q, answerType),
    ...(blocks !== undefined ? { blocks } : {}),
    ...extra,
  };
}

// Arguments for generate(): language-aware modules also get `lang`; every other module is called
// exactly as before (no `lang` key at all), so existing generators are unaffected.
const genArgs = (subtopic, difficulty, seed, lang) =>
  (lang ? { subtopic, difficulty, rng: createRng(seed), lang } : { subtopic, difficulty, rng: createRng(seed) });

// Generate one verified question from a generator module. Returns null on failure.
// `lang` (or null) stays the same across retries.
function generateVerified(gen, subtopic, difficulty, seed, lang = null, maxTries = 20) {
  let s = seed;
  for (let t = 0; t < maxTries; t++) {
    try {
      const raw = gen.generate(genArgs(subtopic, difficulty, s, lang));
      const q = normalizeGenerated(raw, s, gen, lang);
      let shapeOk, own;
      if (raw.answerType === 'multi') {
        shapeOk = multiShapeOk(raw);
        own = shapeOk ? multiAnswer(raw.parts) : null;
      } else if (raw.answerType === 'tiles') {
        shapeOk = blocksSpecOk(q.tiles.length ? q : null, q.answer, raw.solution !== undefined);
        own = raw.answer;
      } else {
        shapeOk = q.answerType !== 'choice' || (q.choices && q.choices.includes(String(q.answer)));
        // A block alternative must spell exactly the typed answer.
        if (shapeOk && q.blocks !== undefined) shapeOk = blocksSpecOk(q.blocks, String(q.answer ?? ''), raw.blocks?.solution !== undefined);
        if (shapeOk && raw.blocks !== undefined && raw.blocks !== null && q.answerType !== 'text') shapeOk = false;
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

/*
 * Cells a whole-module quiz may draw from: [{ st, diffs: [difficulty] }].
 * subtopic "all" = every subtopic; difficulty "all" = each subtopic's own difficulties
 * (a subtopic without a list counts as "medium", like mixed quizzes). A fixed difficulty skips
 * subtopics that don't support it. An unknown subtopic yields [].
 */
export function allowedCells(mod, subtopic, difficulty) {
  const subs = subtopic === ALL ? mod.subtopics : mod.subtopics.filter(s => s.id === subtopic);
  const out = [];
  for (const st of subs) {
    if (!st || typeof st.id !== 'string' || !st.id) continue;
    const list = Array.isArray(st.difficulties) && st.difficulties.length ? st.difficulties.map(String) : null;
    if (difficulty === ALL) out.push({ st, diffs: list ?? ['medium'] });
    else if (!list || list.includes(difficulty)) out.push({ st, diffs: [difficulty] });
  }
  return out;
}

// Origin fields carried by every question of a whole-module quiz (same as mixed quizzes).
function annotate(q, mod, st, difficulty) {
  return {
    ...q,
    module: mod.id,
    moduleTitle: String(mod.title ?? mod.id),
    subtopic: st.id,
    subtopicTitle: String(st.title ?? st.id),
    difficulty,
    calculator: mod.calculator !== false,
  };
}

// Quiz over several cells of one module: subtopic and/or difficulty is "all".
// Per question: a subtopic uniformly from the allowed ones, then a difficulty uniformly from its
// allowed list. Each question is drawn from its own cell's pool so `regenerate` works from the seed.
async function buildAllQuiz(mod, subtopic, difficulty) {
  const cells = allowedCells(mod, subtopic, difficulty);
  if (!cells.length) throw new Error('No subtopic supports this difficulty.');
  const rng = createRng(randomSeed());
  const nextSeed = () => Math.floor(rng.next() * 0x100000000) >>> 0;
  const questions = [];
  const seen = new Set();

  if (mod.type === 'csv') {
    const rows = await loadCsvRows(mod.id);
    // Per cell: its pool and the set of its prompts (to know when a cell is used up).
    let live = cells.map(c => ({
      st: c.st,
      diffs: c.diffs.map(d => {
        const pool = csvPool(rows, c.st.id, d);
        return { d, pool, prompts: new Set(pool.map(r => r.prompt)) };
      }).filter(x => x.pool.length),
    })).filter(c => c.diffs.length);
    if (!live.length) throw new Error('No questions available for this selection.');
    const unique = new Set(live.flatMap(c => c.diffs.flatMap(x => [...x.prompts]))).size;
    const target = Math.min(Math.max(mod.questionsPerQuiz, CSV_ALL_TARGET), unique);
    let tries = 0;
    while (questions.length < target && tries < target * 200 && live.length) {
      tries++;
      const c = rng.pick(live);
      const x = rng.pick(c.diffs);
      const q = decorate(csvQuestion(x.pool, nextSeed(), csvAnswers(rows, c.st.id)), mod, x.d);
      if (!seen.has(q.prompt)) {
        seen.add(q.prompt);
        questions.push(annotate(q, mod, c.st, x.d));
      }
      // Drop cells whose prompts have all been used, so sampling never stalls on them.
      live = live
        .map(cc => ({ ...cc, diffs: cc.diffs.filter(y => [...y.prompts].some(p => !seen.has(p))) }))
        .filter(cc => cc.diffs.length);
    }
  } else {
    const gen = await loadGenerator(mod.id);
    const lang = effectiveLang(mod);
    const n = mod.questionsPerQuiz;
    let failures = 0;
    let dupTries = 0;
    while (questions.length < n && failures < n) {
      const c = rng.pick(cells);
      const d = rng.pick(c.diffs);
      const q = decorate(generateVerified(gen, c.st.id, d, nextSeed(), lang), mod, d);
      if (!q) { failures++; continue; }
      if (seen.has(q.prompt) && dupTries < n * 10) { dupTries++; continue; }
      seen.add(q.prompt);
      questions.push(annotate(q, mod, c.st, d));
    }
  }
  if (!questions.length) throw new Error('This quiz could not generate any valid questions.');
  return questions;
}

export async function buildQuiz(moduleId, subtopic, difficulty) {
  const mod = await loadModule(moduleId);
  if (subtopic === ALL || difficulty === ALL) return buildAllQuiz(mod, subtopic, difficulty);
  const st = mod.subtopics.find(s => s.id === subtopic);
  if (!st) throw new Error('Unknown subtopic.');
  if (Array.isArray(st.difficulties) && !st.difficulties.includes(difficulty)) throw new Error('Unknown difficulty.');
  const n = mod.questionsPerQuiz;
  const questions = [];
  const seen = new Set();

  if (mod.type === 'csv') {
    const rows = await loadCsvRows(moduleId);
    const pool = csvPool(rows, subtopic, difficulty);
    const near = csvAnswers(rows, subtopic);
    if (!pool.length) throw new Error('No questions available for this subtopic and difficulty.');
    const unique = new Set(pool.map(r => r.prompt)).size;
    const target = Math.min(n, unique);
    let tries = 0;
    while (questions.length < target && tries < target * 50) {
      tries++;
      const q = decorate(csvQuestion(pool, randomSeed(), near), mod, difficulty);
      if (seen.has(q.prompt)) continue;
      seen.add(q.prompt);
      questions.push(q);
    }
  } else {
    const gen = await loadGenerator(moduleId);
    const lang = effectiveLang(mod);
    let failures = 0;
    let dupTries = 0;
    while (questions.length < n && failures < n) {
      const q = decorate(generateVerified(gen, subtopic, difficulty, randomSeed(), lang), mod, difficulty);
      if (!q) { failures++; continue; }
      if (seen.has(q.prompt) && dupTries < n * 10) { dupTries++; continue; }
      seen.add(q.prompt);
      questions.push(q);
    }
    if (!questions.length) throw new Error('This quiz could not generate any valid questions.');
  }
  return questions;
}

// Rebuild a stored question from its seed. `lang` is the stored question's language: for a
// language-aware module it is used if the module still lists it, else the effective language.
export async function regenerate(moduleId, subtopic, difficulty, seed, lang) {
  const mod = await loadModule(moduleId);
  if (mod.type === 'csv') {
    const rows = await loadCsvRows(moduleId);
    const pool = csvPool(rows, subtopic, difficulty);
    return pool.length ? decorate(csvQuestion(pool, seed, csvAnswers(rows, subtopic)), mod, difficulty) : null;
  }
  const gen = await loadGenerator(moduleId);
  const l = isLangModule(mod) ? (isLang(lang) && mod.languages.includes(lang) ? lang : effectiveLang(mod)) : null;
  const raw = gen.generate(genArgs(subtopic, difficulty, seed, l));
  return decorate(normalizeGenerated(raw, seed, gen, l), mod, difficulty);
}

// ---- multi-domain mix ----

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
      else sources.set(mid, { mod, gen: await loadGenerator(mid), lang: effectiveLang(mod) });
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
    const { mod, gen, rows, lang } = sources.get(pick.module);
    const st = rng.pick(mod.subtopics);
    const difficulty = resolveDifficulty(rng, st, cfg.difficulty);
    const qSeed = Math.floor(rng.next() * 0x100000000) >>> 0;
    let q = null;
    if (rows) {
      const p = csvPool(rows, st.id, difficulty);
      if (p.length) q = csvQuestion(p, qSeed, csvAnswers(rows, st.id));
    } else {
      q = generateVerified(gen, st.id, difficulty, qSeed, lang);
    }
    q = decorate(q, mod, difficulty);
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

// Spaces around ":" don't matter, so "2 : 7" matches the ratio "2:7".
const normText = s => String(s ?? '').replace(/−/g, '-').trim().replace(/\s+/g, ' ').replace(/ ?: ?/g, ':').replace(/ ?, ?/g, ', ').toLowerCase();

// ---- close answers (partial credit for near misses) ----

// Damerau-Levenshtein distance (optimal string alignment: an adjacent swap counts as 1 edit),
// over code points. `max` (optional): stop early and return max + 1 once the distance must exceed it.
export function dlDistance(a, b, max = Infinity) {
  const s = Array.from(String(a ?? ''));
  const t = Array.from(String(b ?? ''));
  if (Math.abs(s.length - t.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[t.length];
}

// Credit for one typo by answer length (characters after the text rules): 1-3 exact only (0).
export function textTier(len) {
  if (len <= 3) return 0;
  if (len <= 7) return 0.75;
  if (len <= 14) return 0.85;
  return 0.9;
}

// Credit for a relative error r beyond tolerance: ≤ 0.1% 0.9, ≤ 1% 0.75, ≤ 2% 0.5, else 0.
export function numberTier(r) {
  const e = 1e-9;
  if (!(r >= 0)) return 0;
  if (r <= 0.001 + e) return 0.9;
  if (r <= 0.01 + e) return 0.75;
  if (r <= 0.02 + e) return 0.5;
  return 0;
}

const parseNumber = v => {
  let str = String(v ?? '').trim().replace(/−/g, '-');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) str = str.replace(/,/g, ''); // thousands separators
  return str ? Number(str) : NaN;
};

// Lookalike rule: typed text that exactly matches another real answer earns nothing.
const isLookalike = (q, u) => Array.isArray(q.nearMisses) && q.nearMisses.some(n => normText(n) === u);

function closeText(q, userAnswer) {
  const u = normText(userAnswer);
  if (!u || isLookalike(q, u)) return null;
  let best = 0;
  for (const target of [q.answer, ...(Array.isArray(q.accepts) ? q.accepts : [])].map(normText)) {
    // Answers with digits (years, fractions, times, codes) are never "close": a changed digit is a
    // different answer, not a typo.
    if (/\d/.test(target)) continue;
    const tier = textTier(Array.from(target).length);
    if (tier > best && dlDistance(u, target, 1) === 1) best = tier;
  }
  return best > 0 ? { kind: 'text', typos: 1, factor: best } : null;
}

function closeNumber(q, userAnswer) {
  const u = parseNumber(userAnswer);
  const a = Number(q.answer);
  if (!Number.isFinite(u) || !Number.isFinite(a) || a === 0 || Number.isInteger(a)) return null;
  if (Math.sign(u) !== Math.sign(a)) return null;
  if (Array.isArray(q.nearMisses) && q.nearMisses.some(n => Number(n) === u)) return null;
  const tol = typeof q.tolerance === 'number' ? Math.max(q.tolerance, 1e-9) : 1e-9;
  if (Math.abs(u - a) <= tol) return null; // already correct
  const r = Math.abs(u - a) / Math.abs(a);
  const factor = numberTier(r);
  return factor > 0 ? { kind: 'number', relErr: Math.round(r * 1e6) / 1e6, factor } : null;
}

/*
 * Close-answer credit for a wrong typed answer: { kind: 'text', typos, factor } |
 * { kind: 'number', relErr, factor } | null. `q` is a single question or one multi-part part;
 * `owner` is the question it belongs to (module/question-level `fuzzy: false` and `calculator`).
 * Never for choice or tiles answers; numbers only when the calculator is on.
 */
export function closeOf(q, userAnswer, owner = q) {
  if (!q || q.fuzzy === false || owner?.fuzzy === false) return null;
  if (q.answerType === 'text') return closeText(q, userAnswer);
  if (q.answerType === 'number' && owner?.calculator !== false && q.calculator !== false) return closeNumber(q, userAnswer);
  return null;
}

/*
 * Single questions: returns a boolean (unchanged). Text and tiles answers also match any of the
 * question's `accepts`. Tiles questions are checked by the text rules: `userAnswer` is the
 * serialised placed blocks.
 * Multi-part questions (answerType "multi"): `userAnswer` is { [partId]: value } and the result is
 * { correct, credit, parts: [{ id, label, correct, close? }] }; `correct` only if every part is
 * correct, `credit` = the average of part credits (1, a close part's factor, or 0).
 */
export function checkAnswer(question, userAnswer) {
  if (question.answerType === 'multi') {
    const given = userAnswer && typeof userAnswer === 'object' ? userAnswer : {};
    const parts = (question.parts || []).map(p => {
      const has = Object.prototype.hasOwnProperty.call(given, p.id);
      const correct = has && checkSingle(p, given[p.id]);
      const close = has && !correct ? closeOf(p, given[p.id], question) : null;
      return { id: p.id, label: p.label, correct, ...(close ? { close } : {}) };
    });
    const right = parts.filter(p => p.correct).length;
    const sum = parts.reduce((s, p) => s + (p.correct ? 1 : p.close ? p.close.factor : 0), 0);
    return { correct: parts.length > 0 && right === parts.length, credit: parts.length ? sum / parts.length : 0, parts };
  }
  return checkSingle(question, userAnswer);
}

/*
 * Full grading result: { correct, credit, parts?, fuzzy?, mode?, multiplier? }.
 * `mode` "blocks" (dual Type | Blocks questions answered with blocks): credit = correct × the
 * question's blocks multiplier, never a close answer. Typed text/number answers that miss may earn
 * close-answer credit (`fuzzy`); `correct` stays false for those.
 */
export function gradeAnswer(q, userAnswer, mode = 'type') {
  if (q.answerType === 'multi') {
    const r = checkAnswer(q, userAnswer);
    return { correct: r.correct, credit: r.credit, parts: r.parts };
  }
  if (mode === 'blocks' && q.blocks) {
    const correct = checkSingle({ answerType: 'text', answer: q.answer, accepts: q.accepts }, userAnswer);
    const m = typeof q.blocks.multiplier === 'number' ? Math.min(1, Math.max(0, q.blocks.multiplier)) : 1;
    return { correct, credit: correct ? m : 0, mode: 'blocks', multiplier: m };
  }
  const correct = checkSingle(q, userAnswer);
  if (correct) return { correct: true, credit: 1 };
  const close = closeOf(q, userAnswer);
  return close ? { correct: false, credit: close.factor, fuzzy: close } : { correct: false, credit: 0 };
}

function checkSingle(question, userAnswer) {
  switch (question.answerType) {
    case 'number': {
      const u = parseNumber(userAnswer);
      const a = Number(question.answer);
      if (!Number.isFinite(u) || !Number.isFinite(a)) return false;
      const tol = typeof question.tolerance === 'number' ? Math.max(question.tolerance, 1e-9) : 1e-9;
      return Math.abs(u - a) <= tol;
    }
    case 'choice':
      return String(userAnswer) === String(question.answer);
    default: {
      const u = normText(userAnswer);
      return u === normText(question.answer) || (Array.isArray(question.accepts) && question.accepts.some(a => normText(a) === u));
    }
  }
}

// ---- Run (test the output): a module's run(question, answer) for `runnable` questions ----
const RUN_MAX_ROWS = 200;
const RUN_MAX_COLS = 30;
const runCell = v => (v === null || v === undefined ? null : typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : String(v).slice(0, 500));

/*
 * Runs `answer` (string) for a runnable question with its own module's run(). Resolves to
 * { columns: [string], rows: [[string|number|null]] } (sanitised, at most 200 rows) or { error }.
 * Never rejects.
 */
export async function runAnswer(question, answer) {
  try {
    const id = question?.srcModule ?? question?.module;
    if (!question?.runnable || !isValidId(id)) return { error: 'This question has no output to run.' };
    const gen = await loadGenerator(id);
    if (typeof gen.run !== 'function') return { error: 'This question has no output to run.' };
    const res = gen.run(question, String(answer ?? ''));
    if (res && typeof res === 'object' && typeof res.error === 'string') return { error: res.error.slice(0, 300) || 'Error' };
    if (!res || !Array.isArray(res.columns) || !Array.isArray(res.rows)) return { error: 'The query gave no output.' };
    const columns = res.columns.slice(0, RUN_MAX_COLS).map(c => String(c ?? '').slice(0, 100));
    const rows = res.rows.slice(0, RUN_MAX_ROWS).map(r => (Array.isArray(r) ? r : [r]).slice(0, columns.length).map(runCell));
    return { columns, rows, total: res.rows.length };
  } catch (e) {
    console.warn('StudyBlock: run() failed', e);
    return { error: String(e?.message || e || 'Error').slice(0, 300) };
  }
}
