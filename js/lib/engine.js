// Loads modules, generates + verifies questions, checks answers.

import { createRng, randomSeed } from './rng.js';
import { parseCSV } from './csv.js';
import { loadJSON, loadText, loadModule as loadSourceModule } from './source.js';
import { LANG_IDS, isLang } from './languages.js';
import { getCodeLang, ROLE_MODULE, SEG_SEP, SEG_MAX_LEN, cleanChoiceCols, splitSegs } from './storage.js';
import { PRECISIONS, parseDate, hasPrecision, dateDistance, parseYear, yearDistance } from './dates.js';
import { parse as parseCalc, MAX_EXPR as CALC_MAX_EXPR } from './calc.js';
import { validView, clampView } from './graph.js';
import { cleanJournalSpec, serialiseJournal, gradeJournal } from './journal.js';

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
    const groups = parseGroups(d.groups, d.id, modules);
    if (groups) domain.groups = groups;
    domains.push(domain);
  }
  return domains;
}

// The registry is parsed on every loadModule, so registry warnings are shown once per message.
const registryWarned = new Set();
function warnRegistry(msg) {
  if (registryWarned.has(msg)) return;
  registryWarned.add(msg);
  console.warn(`StudyBlock: ${msg}`);
}

// Display-only groups of one domain: [{ id, title, modules }] or undefined when the domain has none.
// Group ids match ID_RE and are unique, titles are non-empty strings, modules are filtered to the
// domain's own list (a module may sit in one group only), and empty groups are dropped. Domain
// modules left out of every group go into a trailing "Other" group.
function parseGroups(raw, domainId, domainModules) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) { warnRegistry(`domain ${domainId}: "groups" must be a list; ignoring it`); return undefined; }
  const own = new Set(domainModules);
  const used = new Set();
  const ids = new Set();
  const out = [];
  let dropped = false;
  for (const g of raw) {
    if (!g || typeof g !== 'object' || !isValidId(g.id) || ids.has(g.id) || g.id === 'other'
      || typeof g.title !== 'string' || !g.title.trim() || !Array.isArray(g.modules)) {
      warnRegistry(`domain ${domainId}: ignoring invalid group ${JSON.stringify(g?.id ?? null)}`);
      continue;
    }
    ids.add(g.id);
    const modules = [];
    for (const id of g.modules) {
      if (!own.has(id) || used.has(id)) { dropped = true; continue; }
      used.add(id);
      modules.push(id);
    }
    if (modules.length) out.push({ id: g.id, title: g.title.trim().slice(0, 60), modules });
  }
  if (dropped) warnRegistry(`domain ${domainId}: group modules must be listed in the domain and in one group only; dropped the others`);
  if (!out.length) return undefined;
  const rest = domainModules.filter(id => !used.has(id));
  if (rest.length) out.push({ id: 'other', title: 'Other', modules: rest });
  return out;
}

// Top-level "domainAliases": { "<old domain id>": "<domain id>" } -> Map(old -> target).
// Both ids must be valid, the target must be a registered domain and the old id must not be one.
function parseAliases(idx, domains) {
  const out = new Map();
  const raw = idx?.domainAliases;
  if (raw === undefined) return out;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { warnRegistry('"domainAliases" in modules/index.json must be an object; ignoring it'); return out; }
  const ids = new Set(domains.map(d => d.id));
  for (const [from, to] of Object.entries(raw)) {
    if (!isValidId(from) || !isValidId(to) || !ids.has(to) || ids.has(from)) {
      warnRegistry(`ignoring domain alias ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
      continue;
    }
    out.set(from, to);
  }
  return out;
}

// Aliases from the last registry load; normalizeMixConfig applies them by default.
let registryAliases = new Map();

export async function loadDomains() {
  const idx = await loadJSON('modules/index.json');
  const domains = parseRegistry(idx);
  registryAliases = parseAliases(idx, domains);
  return domains;
}

// Map(old domain id -> current domain id) from modules/index.json "domainAliases".
export async function loadDomainAliases() {
  await loadDomains();
  return new Map(registryAliases);
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

// `roleOnly`: also accept a role-only module (the `exclusive` of a listed role).
async function assertListed(id, roleOnly = false) {
  if (!isValidId(id)) throw new Error('Invalid module id.');
  const ids = await loadIndex();
  if (ids.includes(id)) return;
  if (roleOnly && (await roleOnlyIds()).has(id)) return;
  throw new Error('Unknown module.');
}

// Domain modules only: a module.json with "roleOnly": true is never loaded here, even if listed,
// so it never shows on domain pages, Home, mixes or #/m/….
export async function loadModule(id) {
  await assertListed(id);
  const m = await loadJSON(`modules/${id}/module.json`);
  if (m && typeof m === 'object' && m.roleOnly === true) throw new Error(`Module ${id} is role-only.`);
  return parseModule(m, id, false);
}

// A role-only module (modules/role-*/, "roleOnly": true), reachable only through roles.
export async function loadRoleOnlyModule(id) {
  await assertListed(id, true);
  const m = await loadJSON(`modules/${id}/module.json`);
  if (!m || typeof m !== 'object' || m.roleOnly !== true) throw new Error(`Module ${id} is not role-only.`);
  return parseModule(m, id, true);
}

function parseModule(m, id, roleOnly) {
  if (!m || typeof m !== 'object') throw new Error(`Bad module.json for ${id}`);
  // "all" is reserved for whole-module quizzes (#/q/<module>/all/<difficulty>).
  const subtopics = (Array.isArray(m.subtopics) ? m.subtopics : []).filter(s => {
    if (s && s.id === ALL) { console.warn(`StudyBlock: module ${id} has a subtopic called "${ALL}", which is reserved; skipping it`); return false; }
    return true;
  }).map(s => cleanDifficulties(s, id, roleOnly)).filter(Boolean);
  return {
    ...m,
    id,
    roleOnly,
    questionsPerQuiz: Number.isInteger(m.questionsPerQuiz) && m.questionsPerQuiz > 0 ? m.questionsPerQuiz : 10,
    subtopics,
    // Quiz calculator panel; a module opts out with "calculator": false.
    calculator: m.calculator !== false,
    // Code languages the module can show its snippets in ([] = not language-aware).
    languages: parseLanguages(m, id),
    // Blocks-mode credit factor per difficulty for dual Type | Blocks questions (missing = 1).
    tilesMultiplier: parseTilesMultiplier(m, id),
    chooseMultiplier: parseTilesMultiplier(m, id, 'chooseMultiplier', CHOOSE_MULT_DEFAULT),
    // Close-answer leniency: text level (false = 0, true/missing = 1) and the number spec
    // ({ mode, level } or null when unset; see numberSpecOf).
    fuzzy: parseLevel(m.fuzzy, id, 'fuzzy') ?? 1,
    fuzzyNumber: parseFuzzyNumber(m.fuzzyNumber, id),
  };
}

// ---- close-answer leniency levels (0 = exact, 1 = normal, higher = more lenient, max 5) ----
export const LEVEL_MAX = 5;
const levelWarned = new Set();
function warnLevel(key, msg) {
  if (!key || levelWarned.has(key)) return;
  levelWarned.add(key);
  console.warn(`StudyBlock: ${msg}`);
}
// A leniency level: false -> 0, true -> 1, a number 0-5 (clamped). undefined when missing/invalid.
export function parseLevel(v, warnId, field = 'fuzzy') {
  if (v === undefined || v === null) return undefined;
  if (v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.min(v, LEVEL_MAX);
  if (warnId) warnLevel(`${warnId}|${field}`, `module ${warnId}: "${field}" must be true, false or a number 0-${LEVEL_MAX}; ignoring it`);
  return undefined;
}
// "fuzzyNumber": a level (relative mode) or { mode: "relative" | "years", level }. -> { mode, level } | undefined.
export function parseFuzzyNumber(v, warnId) {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number' || typeof v === 'boolean') {
    const level = parseLevel(v, warnId, 'fuzzyNumber');
    return level === undefined ? undefined : { mode: 'relative', level };
  }
  if (typeof v === 'object' && !Array.isArray(v) && (v.mode === 'relative' || v.mode === 'years')) {
    const level = v.level === undefined ? 1 : parseLevel(v.level, warnId, 'fuzzyNumber');
    if (level !== undefined) return { mode: v.mode, level };
  }
  if (warnId) warnLevel(`${warnId}|fuzzyNumber`, `module ${warnId}: "fuzzyNumber" must be a number 0-${LEVEL_MAX} or { "mode": "relative" | "years", "level": n }; ignoring it`);
  return undefined;
}

// module.json "tilesMultiplier": { easy, medium, hard, expert } numbers 0-1; a missing or invalid
// level counts as 1 (invalid ones warn once per module).
const multWarned = new Set();
// Segmented choices answered with Choose (instead of Build): credit × this, per difficulty.
export const CHOOSE_MULT_DEFAULT = { easy: 1, medium: 1, hard: 0.85, expert: 0.7 };
// `key`: "tilesMultiplier" (Blocks mode of dual questions) or "chooseMultiplier" (Choose mode).
function parseTilesMultiplier(m, id, key = 'tilesMultiplier', defaults = { easy: 1, medium: 1, hard: 1, expert: 1 }) {
  const out = { ...defaults };
  const src = m[key];
  if (src === undefined || src === null) return out;
  let bad = typeof src !== 'object' || Array.isArray(src);
  if (!bad) {
    for (const [k, v] of Object.entries(src)) {
      if (!Object.prototype.hasOwnProperty.call(out, k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) { bad = true; continue; }
      out[k] = v;
    }
  }
  if (bad && !multWarned.has(id + key)) {
    multWarned.add(id + key);
    console.warn(`StudyBlock: module ${id}: "${key}" must map easy/medium/hard/expert to numbers 0-1; ignoring bad entries`);
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
  // Module leniency (the question's own `fuzzy` / `fuzzyNumber` win; see textLevelOf / numberSpecOf).
  out.modFuzzy = typeof mod.fuzzy === 'number' ? mod.fuzzy : (mod.fuzzy === false ? 0 : 1);
  if (mod.fuzzyNumber) out.modFuzzyNumber = mod.fuzzyNumber;
  if (out.blocks) out.blocks = { ...out.blocks, multiplier: tilesMultiplierOf(mod, difficulty) };
  if (out.answerType === 'choice' && Array.isArray(out.choiceCols)) {
    const v = mod?.chooseMultiplier?.[difficulty];
    out.chooseMultiplier = typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : (CHOOSE_MULT_DEFAULT[difficulty] ?? 1);
    out.segBank = segBankFor(out, difficulty);
    const want = difficulty === 'easy' ? 3 : 5;
    if (out.choices.length !== want && !segCountWarned.has(mod.id)) {
      segCountWarned.add(mod.id);
      console.warn(`StudyBlock: module ${mod.id}: segmented choice questions should have ${want} options at ${difficulty} (got ${out.choices.length})`);
    }
  }
  warnSegMix(out, mod.id);
  return out;
}
const segCountWarned = new Set();

// ---- difficulties ----

// Every difficulty, easiest first. Modules list the ones each subtopic offers.
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'expert'];
export const isDifficulty = d => DIFFICULTY_ORDER.includes(d);
// Role-only questions (modules with "roleOnly": true). Valid only inside those modules.
export const EXPERT_PLUS = 'expert-plus';
// Scenario tiers a role-only subtopic may offer: medium (2 parts), hard (3), expert (3-4) and
// expert-plus (the role Expert level). Role Easy/Medium/Hard runs end with medium/hard/expert ones.
const ROLE_TIERS = ['medium', 'hard', 'expert', EXPERT_PLUS];

const diffWarned = new Set();

// A subtopic with its "difficulties" list cleaned: unknown values and duplicates dropped (one
// console.warn per module), kept in the module's own order. A subtopic without a list is unchanged
// (it counts as "medium"); one whose list has nothing valid left is skipped. Never mutates `s`.
// Role-only modules: only the scenario tiers "medium", "hard", "expert" and "expert-plus" are valid
// (and every subtopic needs a list).
function cleanDifficulties(s, moduleId, roleOnly = false) {
  if (!s || typeof s !== 'object') return s;
  if (s.difficulties === undefined && !roleOnly) return s;
  const known = roleOnly ? ROLE_TIERS : DIFFICULTY_ORDER;
  const raw = Array.isArray(s.difficulties) ? s.difficulties : [];
  const list = [];
  const bad = [];
  for (const d of raw) {
    if (known.includes(d)) { if (!list.includes(d)) list.push(d); } else bad.push(d);
  }
  if ((bad.length || !Array.isArray(s.difficulties)) && !diffWarned.has(moduleId)) {
    diffWarned.add(moduleId);
    console.warn(`StudyBlock: module ${moduleId}: ignoring unknown difficulty value(s) ${JSON.stringify(Array.isArray(s.difficulties) ? bad : s.difficulties)} (known: ${known.join(', ')})`);
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
  await assertListed(id, true);
  try {
    return await loadText(`modules/${id}/guide.md`);
  } catch {
    return null;
  }
}

const generators = new Map();
// Generators that have finished loading (id -> module), so grading can call grade() synchronously.
const loadedGenerators = new Map();
async function loadGenerator(id) {
  await assertListed(id, true);
  if (!generators.has(id)) {
    const p = loadSourceModule(`modules/${id}/generator.js`);
    p.catch(() => generators.delete(id));
    generators.set(id, p);
  }
  const mod = await generators.get(id);
  if (typeof mod.generate !== 'function') throw new Error(`Module ${id}: generator.js has no generate()`);
  loadedGenerators.set(id, mod);
  return mod;
}

const csvWarned = new Set();
// One warn key object per CSV module, so bad `hints` cells warn once per module (sanitizeHints).
const csvHintKeys = new Map();
const csvHintKey = id => { if (!csvHintKeys.has(id)) csvHintKeys.set(id, { csv: id }); return csvHintKeys.get(id); };
async function loadCsvRows(id) {
  await assertListed(id);
  const text = await loadText(`modules/${id}/questions.csv`);
  // Optional columns:
  //   type    empty = text/choice (as before), "date" = a date answer whose precision comes from
  //           the answer's own format, "tiles" = a pure blocks question (needs `tiles`).
  //   hints   guided-mode steps separated by "|" (1-4, each <= 600 chars; empty = explanation split).
  //   tiles   "|"-separated blocks (label = value). With an empty type and a free-text answer the
  //           row becomes a dual Type | Blocks question; the answer must be buildable from them.
  //   joiner  placed between blocks (default " "; "(none)" = nothing). At most 5 characters.
  // Bad rows are skipped, one warning per module.
  const bad = [];
  const warnKey = csvHintKey(id);
  const rows = [];
  parseCSV(text).forEach((r, i) => {
    const row = csvRowPrepare(r, warnKey);
    if (row) rows.push(row); else bad.push(i + 2);
  });
  if (bad.length && !csvWarned.has(id)) {
    csvWarned.add(id);
    console.warn(`StudyBlock: module ${id}: skipping invalid questions.csv row(s) on line(s) ${bad.slice(0, 20).join(', ')}`);
  }
  return rows;
}

const csvType = r => String(r?.type ?? '').trim().toLowerCase();
const CSV_TYPES = ['', 'date', 'tiles'];

// A CSV row's blocks spec ({ tiles, joiner, useAll }, tiles shuffled later per seed), undefined when
// it has no `tiles`, or null when the tiles or joiner are malformed or can't spell the answer.
function csvBlocks(r) {
  const raw = String(r?.tiles ?? '');
  if (!raw.trim()) return undefined;
  const tiles = raw.split('|').map(t => t.trim()).filter(Boolean);
  const j = String(r?.joiner ?? '');
  const joiner = j === '' ? ' ' : j.trim().toLowerCase() === '(none)' ? '' : j;
  const spec = sanitizeTiles({ tiles, joiner });
  if (!spec || spec.tiles.length !== tiles.length) return null;
  const answer = String(r.answer ?? '').trim();
  // "Use every block" only when the answer really needs all of them (no distractors listed).
  const useAll = tilesReachable(spec.tiles, spec.joiner, answer, true);
  if (!useAll && !tilesReachable(spec.tiles, spec.joiner, answer, false)) return null;
  return { tiles: spec.tiles, joiner: spec.joiner, useAll };
}

// Validates one row and attaches its parsed extras (`_hints`, `_blocks`); null = skip the row.
function csvRowPrepare(r, warnKey) {
  const type = csvType(r);
  if (!CSV_TYPES.includes(type)) return null;
  const choices = String(r.choices ?? '').trim();
  const answer = String(r.answer ?? '').trim();
  const blocks = csvBlocks(r);
  if (blocks === null) return null;
  // Segmented choices: `cols` = "|"-separated column labels; each choice (and the answer) is its
  // segments joined by " ; ". Needs `choices` and an empty type; segment counts must match.
  const colsRaw = String(r.cols ?? '').trim();
  let seg;
  if (colsRaw) {
    if (type || !choices || blocks) return null;
    seg = segChoiceSpec(colsRaw.split('|'), choices.split('|').map(c => c.trim()).filter(Boolean).map(c => c.split(' ; ')), answer.split(' ; '));
    if (!seg) return null;
    // `extra`: Build-mode decoys as "Column=value" pairs separated by " ; ".
    const extraRaw = String(r.extra ?? '').trim();
    if (extraRaw) {
      const pairs = extraRaw.split(' ; ').map(x => { const i = x.indexOf('='); return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1)] : null; });
      const extra = cleanSegExtra(pairs, seg.choiceCols);
      if (pairs.some(x => !x) || extra.length !== pairs.length) return null;
      seg.segExtra = extra;
    }
  }
  if (type === 'date') {
    if (choices || blocks) return null;
    if (!dateAnswerOk(answer)) return null;
  } else if (type === 'tiles') {
    if (choices || !blocks) return null;
  } else if (blocks && choices) {
    return null; // blocks only go with a free-text answer
  }
  const hintsRaw = String(r.hints ?? '').trim();
  const hints = hintsRaw ? sanitizeHints(hintsRaw.split('|'), warnKey) : undefined;
  return { ...r, ...(hints ? { _hints: hints } : {}), ...(blocks ? { _blocks: blocks } : {}), ...(seg ? { _seg: seg } : {}) };
}

// A canonical date answer: parses, and BC only at year precision. -> its precision, or null.
function datePrecisionOf(answer) {
  const d = parseDate(answer);
  if (!d || (d.year < 0 && d.precision !== 'year')) return null;
  return d.precision;
}
const dateAnswerOk = (answer, precision) => {
  const p = datePrecisionOf(answer);
  return !!p && (precision === undefined || p === precision);
};

function csvPool(rows, subtopic, difficulty) {
  return rows.filter(r =>
    (r.subtopic || '').trim() === subtopic &&
    (!(r.difficulty || '').trim() || r.difficulty.trim() === difficulty));
}

// Every answer in one subtopic of a CSV module (any difficulty): the lookalike list for close answers.
// Only free-text rows count: segmented rows (a `cols` column) and choice rows are skipped, so a
// text question's nearMisses never hold "↑ Increase ; …" tuples or multiple-choice answers.
function csvAnswers(rows, subtopic) {
  const freeText = r => !String(r.cols ?? '').trim() && !r._seg && !String(r.choices ?? '').trim();
  return [...new Set(rows.filter(r => (r.subtopic || '').trim() === subtopic && freeText(r)).map(r => (r.answer ?? '').trim()).filter(Boolean))];
}

// `near` (optional): the subtopic's answers; the other ones become the question's `nearMisses`.
// Rows with blocks draw their tile order last, so rows without them keep the same question per seed.
function csvQuestion(pool, seed, near = null) {
  const rng = createRng(seed);
  const row = rng.pick(pool);
  const choicesRaw = (row.choices || '').trim();
  // Segmented rows shuffle their joined options (same count, so the same rng draws); tuples stay intact.
  const seg = row._seg;
  const choices = seg ? rng.shuffle(seg.choices.slice())
    : choicesRaw ? rng.shuffle(choicesRaw.split('|').map(s => s.trim()).filter(Boolean)) : undefined;
  const answer = seg ? seg.answer : (row.answer ?? '').trim();
  const isDate = !choices && csvType(row) === 'date';
  const isTiles = !choices && csvType(row) === 'tiles' && !!row._blocks;
  const blocks = !choices && !isDate && row._blocks
    ? { ...row._blocks, tiles: rng.shuffle(row._blocks.tiles.map(t => ({ ...t }))) } : null;
  const nearMisses = !choices && !isDate && !isTiles && near ? near.filter(a => normText(a) !== normText(answer)) : [];
  return {
    seed,
    prompt: row.prompt ?? '',
    answer,
    answerType: choices ? 'choice' : isDate ? 'date' : isTiles ? 'tiles' : 'text',
    ...(isDate ? { precision: datePrecisionOf(answer) } : {}),
    ...(isTiles ? { tiles: blocks.tiles, joiner: blocks.joiner, useAll: blocks.useAll } : blocks ? { blocks } : {}),
    choices,
    ...(seg ? { choiceCols: seg.choiceCols.slice(), choiceSegs: choices.map(c => seg.choiceSegs[seg.choices.indexOf(c)].slice()), ...(seg.segExtra ? { segExtra: seg.segExtra.map(e => e.slice()) } : {}) } : {}),
    tolerance: undefined,
    explanation: row.explanation || '',
    ...(row._hints ? { hints: row._hints.slice() } : {}),
    ...(nearMisses.length ? { nearMisses } : {}),
  };
}

// ---- segmented choices ("block-list" options) ----
// A choice question may give `choiceCols` (2–4 short column labels) and every choice as an array
// with one segment per column. The engine joins each choice with SEG_SEP, so checking, storage,
// History and import see plain strings; `choiceCols` and `choiceSegs` stay on the in-memory question.
export const SEG_CHOICES_MIN = 2;
export const SEG_CHOICES_MAX = 6;
const segText = v => (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) ? String(v).trim() : '');
const segOk = s => !!s && s.length <= SEG_MAX_LEN && !s.includes('|') && !/[\r\n]/.test(s);
// One answer given as an array of segments or as a string ("a | b" or "a|b") -> segments.
const segsOfAnswer = a => (Array.isArray(a) ? a.map(segText) : typeof a === 'string' ? a.split('|').map(s => s.trim()) : null);

/*
 * Validates a segmented choice set. `choices`: arrays of segments (one per column); `answer`: the
 * correct array or its joined string. -> { choiceCols, choiceSegs, choices: [joined], answer: joined }
 * or null (bad labels, 2–6 choices, wrong segment counts, empty/long segments, duplicate tuples,
 * or an answer that isn't one of the choices).
 */
export function segChoiceSpec(cols, choices, answer) {
  const c = cleanChoiceCols(cols);
  if (!c || !Array.isArray(choices) || choices.length < SEG_CHOICES_MIN || choices.length > SEG_CHOICES_MAX) return null;
  const segs = [];
  for (const ch of choices) {
    if (!Array.isArray(ch) || ch.length !== c.length) return null;
    const row = ch.map(segText);
    if (!row.every(segOk)) return null;
    segs.push(row);
  }
  const joined = segs.map(r => r.join(SEG_SEP));
  if (new Set(joined).size !== joined.length) return null;
  const a = segsOfAnswer(answer);
  if (!a || a.length !== c.length) return null;
  const ans = a.join(SEG_SEP);
  if (!joined.includes(ans)) return null;
  return { choiceCols: c, choiceSegs: segs, choices: joined, answer: ans };
}

/*
 * Mixed distances (ticket 022): counting values across the options must not find the answer.
 * `segs`: every option's segments (the answer's row included); `ans`: the answer's segments.
 * -> issue codes, [] when the set is fine:
 *   'near'     no wrong option differs from the answer in 2+ columns;
 *   'majority' in every column the answer's value is strictly the most common one (no column where
 *              another value appears at least as often);
 *   'far'      with 3+ columns, a wrong option differs from the answer in every column (wrong
 *              options differ in 1 to n−1 columns; with 2 columns, in 1 or 2).
 * The same rule applies to 3-option Easy sets; it is reachable with 2+ columns: both wrong options
 * differ in one shared column (the tie breaks the majority) and one of them also in another column.
 * Only a warning (decorate, once per module); nothing is rejected or regenerated for it.
 */
export function segMixIssues(segs, ans) {
  if (!Array.isArray(segs) || !Array.isArray(ans) || !ans.length) return [];
  const n = ans.length;
  const key = ans.join(SEG_SEP);
  const wrong = segs.filter(r => Array.isArray(r) && r.length === n && r.join(SEG_SEP) !== key);
  if (!wrong.length) return [];
  const issues = [];
  const dists = wrong.map(r => r.reduce((d, v, j) => d + (v !== ans[j] ? 1 : 0), 0));
  if (!dists.some(d => d >= 2)) issues.push('near');
  const strictMajority = j => {
    const counts = new Map();
    for (const r of segs) if (Array.isArray(r) && r.length === n) counts.set(r[j], (counts.get(r[j]) || 0) + 1);
    const mine = counts.get(ans[j]) || 0;
    for (const [v, k] of counts) if (v !== ans[j] && k >= mine) return false;
    return true;
  };
  if (ans.every((_, j) => strictMajority(j))) issues.push('majority');
  if (n >= 3 && dists.some(d => d >= n)) issues.push('far');
  return issues;
}
const segMixWarned = new Set();
// Warns (once per module) when a question's segmented options, or a part's, break the mixed-distance rule.
function warnSegMix(q, modId) {
  if (segMixWarned.has(modId)) return;
  const sets = [];
  if (Array.isArray(q.choiceSegs) && Array.isArray(q.choiceCols)) sets.push(['', q]);
  if (Array.isArray(q.parts)) for (const p of q.parts) if (Array.isArray(p?.choiceSegs) && Array.isArray(p?.choiceCols)) sets.push([` part ${p.id}`, p]);
  for (const [where, s] of sets) {
    const ans = splitSegs(String(s.answer ?? ''), s.choiceCols);
    const issues = ans ? segMixIssues(s.choiceSegs, ans) : [];
    if (issues.length) {
      segMixWarned.add(modId);
      console.warn(`StudyBlock: module ${modId}: segmented options${where} (seed ${q.seed}) break the mixed-distance rule (${issues.join(', ')}); see ticket 022`);
      return;
    }
  }
}

// Extra decoy blocks for Build mode: [[col, value], ...] where col is a column label (any case)
// or a 0-based index. -> [[colIndex, value]] (bad, duplicate or answer-equal entries dropped).
export const SEG_EXTRA_MAX = 30;
export function cleanSegExtra(raw, cols) {
  if (!Array.isArray(raw) || !Array.isArray(cols)) return [];
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    if (out.length >= SEG_EXTRA_MAX) break;
    if (!Array.isArray(e) || e.length !== 2) continue;
    const j = typeof e[0] === 'number' ? e[0] : cols.findIndex(c => c.toLowerCase() === String(e[0] ?? '').trim().toLowerCase());
    const v = segText(e[1]);
    if (!Number.isInteger(j) || j < 0 || j >= cols.length || !segOk(v) || seen.has(j + '\u0000' + v)) continue;
    seen.add(j + '\u0000' + v);
    out.push([j, v]);
  }
  return out;
}

// Build mode's bank: Easy 1–2, Medium 3–5, Hard 6–9, Expert 9–14 distractor blocks (at most 24
// blocks in all), first from the other options' segments, then the question's extra decoys.
export const SEG_DISTRACTORS = { easy: [1, 2], medium: [3, 5], hard: [6, 9], expert: [9, 14] };
export const SEG_BANK_MAX = 24;
const SEG_BANK_SALT = 0x5e9b10c5;
/*
 * -> [{ col, value }] in a seeded shuffled order: the answer's blocks plus distractors. Drawn from its
 * own rng (derived from the question's seed), so the question itself never changes. A block is a
 * (column, value) pair: the same value under two columns is two different blocks.
 */
function segBankFor(q, difficulty) {
  const cols = q.choiceCols;
  const ans = splitSegs(q.answer, cols);
  if (!ans) return [];
  const rng = createRng(((Number(q.seed) >>> 0) ^ SEG_BANK_SALT) >>> 0);
  const key = (j, v) => `${j}\u0000${v}`;
  const used = new Set(ans.map((v, j) => key(j, v)));
  const fromOptions = [];
  for (const row of q.choiceSegs || []) row.forEach((v, j) => { const k = key(j, v); if (!used.has(k)) { used.add(k); fromOptions.push({ col: j, value: v }); } });
  const extras = [];
  for (const [j, v] of q.segExtra || []) { const k = key(j, v); if (!used.has(k)) { used.add(k); extras.push({ col: j, value: v }); } }
  const [lo, hi] = SEG_DISTRACTORS[difficulty] || SEG_DISTRACTORS.medium;
  const n = Math.min(rng.int(lo, hi), SEG_BANK_MAX - ans.length);
  const picked = [...rng.shuffle(fromOptions), ...rng.shuffle(extras)].slice(0, Math.max(0, n));
  return rng.shuffle([...ans.map((v, j) => ({ col: j, value: v })), ...picked]);
}

// A (raw) choice question or part's normalised choice fields: { choices, answer?, choiceCols?, choiceSegs? }.
// Plain choices are stringified as before; segmented ones are joined (null spec = choices undefined,
// so the shape check rejects it). Arrays without `choiceCols` are invalid too.
function choiceFields(q) {
  if (q?.choiceCols !== undefined && q?.choiceCols !== null) {
    const spec = segChoiceSpec(q.choiceCols, q.choices, q.answer);
    if (!spec) return { choices: undefined };
    const extra = cleanSegExtra(q.extraSegs, spec.choiceCols);
    return { choices: spec.choices, answer: spec.answer, choiceCols: spec.choiceCols, choiceSegs: spec.choiceSegs, ...(extra.length ? { segExtra: extra } : {}) };
  }
  if (!Array.isArray(q?.choices) || q.choices.some(Array.isArray)) return { choices: undefined };
  return { choices: q.choices.map(String) };
}

const PART_TYPES = ['number', 'text', 'choice', 'date'];
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
    choices: undefined,
    ...(answerType === 'choice' ? choiceFields(p) : {}),
    tolerance: typeof p?.tolerance === 'number' ? p.tolerance : undefined,
    ...(answerType === 'date' ? { answer: String(p?.answer ?? '').trim(), precision: datePrecisionFor(p) } : {}),
    ...(p?.exactForm === true ? { exactForm: true } : {}),
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
// `accepts` (text / tiles answers), `nearMisses` (text / number) and the question's own leniency
// (`fuzzy` level, `fuzzy: false` kept as is; `fuzzyNumber` as { mode, level }), when given.
function closeExtras(q, answerType) {
  const accepts = answerType === 'text' || answerType === 'tiles' ? cleanStrList(q?.accepts, ACCEPTS_MAX) : undefined;
  const nearMisses = answerType === 'text' || answerType === 'number' ? cleanStrList(q?.nearMisses, NEAR_MISSES_MAX) : undefined;
  const level = q?.fuzzy === false ? false : parseLevel(q?.fuzzy);
  const num = parseFuzzyNumber(q?.fuzzyNumber);
  // `caseSensitive: true` (text / tiles): letter case counts when checking; no close credit.
  const cs = (answerType === 'text' || answerType === 'tiles') && q?.caseSensitive === true;
  return {
    ...(cs ? { caseSensitive: true } : {}),
    ...(accepts ? { accepts } : {}), ...(nearMisses ? { nearMisses } : {}),
    ...(level !== undefined ? { fuzzy: level } : {}), ...(num ? { fuzzyNumber: num } : {}),
  };
}

// A date question's precision: its own valid `precision`, else the answer's format.
function datePrecisionFor(q) {
  return PRECISIONS.includes(q?.precision) ? q.precision : (datePrecisionOf(String(q?.answer ?? '').trim()) ?? 'year');
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
    } else if (p.answerType === 'date') {
      if (typeof p.answer !== 'string' || !dateAnswerOk(p.answer.trim(), p.precision)) return false;
      if (p.precision !== undefined && !PRECISIONS.includes(p.precision)) return false;
    } else if (p.choiceCols !== undefined && p.choiceCols !== null) {
      if (!segChoiceSpec(p.choiceCols, p.choices, p.answer)) return false;
    } else {
      if (!Array.isArray(p.choices) || p.choices.length < 2 || p.choices.some(Array.isArray)) return false;
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

// Calculator graph functions a question pre-fills (Graph mode, like given rows):
// graphFns [{ expr, label? }] (1–3; the graph grammar: x, sheet labels such as _a, constants and
// functions; expr ≤ 200 chars; label plain text ≤ 40 chars) and graphView { xmin, xmax, ymin, ymax }
// (finite, min < max, spans 1e-6 to 1e9; only with graphFns). Bad entries are dropped with one
// console.warn per generator module. Never stored in attempts (the user's graph is, as `graph`).
export const GRAPH_FNS_MAX = 3;
const GRAPH_LABEL_MAX = 40;
const graphWarned = new WeakSet();

export function sanitizeGraphFns(rawFns, rawView, warnKey) {
  if ((rawFns === undefined || rawFns === null) && (rawView === undefined || rawView === null)) return {};
  const fns = [];
  let bad = !Array.isArray(rawFns);
  for (const g of Array.isArray(rawFns) ? rawFns : []) {
    const expr = g && typeof g === 'object' ? g.expr : undefined;
    let ok = fns.length < GRAPH_FNS_MAX && typeof expr === 'string' && expr.trim() !== '' && expr.length <= CALC_MAX_EXPR;
    if (ok) { try { parseCalc(expr, { vars: ['x'] }); } catch { ok = false; } }
    if (!ok) { bad = true; continue; }
    const label = g.label;
    if (label !== undefined && (typeof label !== 'string' || !label.trim() || label.length > GRAPH_LABEL_MAX)) bad = true;
    const cleanLabel = typeof label === 'string' && label.trim() && label.length <= GRAPH_LABEL_MAX ? label.trim() : '';
    fns.push({ expr, ...(cleanLabel ? { label: cleanLabel } : {}) });
  }
  let view;
  if (rawView !== undefined && rawView !== null) {
    if (fns.length && validView(rawView)) {
      const { xmin, xmax, ymin, ymax } = rawView;
      view = clampView({ xmin, xmax, ymin, ymax });
    } else bad = true;
  }
  if (bad && warnKey && typeof warnKey === 'object' && !graphWarned.has(warnKey)) {
    graphWarned.add(warnKey);
    console.warn('StudyBlock: a generator returned invalid "graphFns" / "graphView" entries; they were dropped', rawFns, rawView);
  }
  return fns.length ? { graphFns: fns, ...(view ? { graphView: view } : {}) } : {};
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

const JOURNAL_ROWS_DEFAULT = 2;

function normalizeGenerated(q, seed, warnKey, lang = null) {
  const given = sanitizeGiven(q?.given, warnKey);
  const graph = sanitizeGraphFns(q?.graphFns, q?.graphView, warnKey);
  const hints = sanitizeHints(q?.hints, warnKey);
  // `lang` only on questions from language-aware modules.
  const extra = {
    ...(given ? { given } : {}), ...graph, ...(hints ? { hints } : {}), ...(lang ? { lang } : {}),
    // `runnable`: the module's run(question, answer) can show the answer's output (Run button).
    ...(q?.runnable === true ? { runnable: true } : {}),
    // `gradeByOutput`: a text answer that fails the text check is offered to the module's grade().
    ...(q?.gradeByOutput === true ? { gradeByOutput: true } : {}),
    // Generator-private data (e.g. what run() needs); kept in memory only, never stored.
    ...(q?.meta && typeof q.meta === 'object' ? { meta: q.meta } : {}),
    // `exactForm: true` (text answers): the answer must be typed in exactly this form, so an
    // equivalent but unsimplified fraction is wrong (used where simplifying is the skill tested).
    ...(q?.exactForm === true ? { exactForm: true } : {}),
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
  if (q.answerType === 'journal') {
    // Journal entry (js/lib/journal.js). The answer is stored as the canonical string; the lines,
    // account and amount blocks and aliases stay on the live question. An invalid shape keeps
    // answerType "journal" with no lines; generateVerified rejects it.
    const j = cleanJournalSpec(q);
    return {
      seed,
      prompt: String(q.prompt ?? ''),
      answer: j ? serialiseJournal(j.lines) : '',
      answerType: 'journal',
      lines: j ? j.lines : [],
      accounts: j ? j.accounts : [],
      amounts: j ? j.amounts : [],
      rows: j ? j.rows : JOURNAL_ROWS_DEFAULT,
      accepts: j ? j.accepts : {},
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
    choices: undefined,
    ...(answerType === 'choice' ? choiceFields(q) : {}),
    tolerance: typeof q.tolerance === 'number' ? q.tolerance : undefined,
    explanation: q.explanation ? String(q.explanation) : '',
    ...closeExtras(q, answerType),
    ...(answerType === 'date' ? { answer: String(q.answer ?? '').trim(), precision: datePrecisionFor(q) } : {}),
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
      } else if (raw.answerType === 'journal') {
        shapeOk = q.lines.length > 0;
        own = raw.answer;
      } else if (raw.answerType === 'tiles') {
        shapeOk = blocksSpecOk(q.tiles.length ? q : null, q.answer, raw.solution !== undefined);
        own = raw.answer;
      } else {
        shapeOk = q.answerType !== 'choice' || (q.choices && q.choices.includes(String(q.answer)));
        // A date answer is canonical text matching its precision ("July 1969"; BC at year precision only).
        if (shapeOk && q.answerType === 'date') {
          shapeOk = typeof raw.answer === 'string' && dateAnswerOk(raw.answer.trim(), raw.precision)
            && (raw.precision === undefined || PRECISIONS.includes(raw.precision));
        }
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
  const mod = await loadModule(moduleId).catch(() => loadRoleOnlyModule(moduleId));
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
// Mixes have at least 5 questions; older drafts, presets and imports are clamped up silently.
export const MIX_MIN_COUNT = 5;
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
  return Math.min(MIX_MAX_COUNT, Math.max(MIX_MIN_COUNT, n));
}

// Fills a (possibly stale or partial) mix config against the available domains:
// `available` = [{ id, modules: [moduleId] }]. Unknown domains/modules default to weight 1.
/*
 * Maps merged (aliased) domains of a stored mix config onto their new domain, before
 * normalizeMixConfig drops unknown domains. Pure: returns a new config, never edits `raw`.
 * For each alias S -> T present in raw.domains:
 * - S's module weights move into T's `modules` (an unticked S, weight 0, moves them at weight 0);
 * - T present: T keeps its own weight; T absent: T gets S's weight, only S's modules ticked,
 *   T's other modules at weight 0.
 * Only module ids that belong to T in `available` are moved; S is then removed.
 */
export function applyDomainAliases(raw, aliases, available) {
  if (!raw || typeof raw !== 'object' || !raw.domains || typeof raw.domains !== 'object' || !aliases?.size) return raw;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const objOr = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const byId = new Map((available || []).map(d => [d.id, d]));
  let domains = null;
  for (const [from, to] of aliases) {
    if (!has(raw.domains, from) || !byId.has(to)) continue;
    if (!domains) {
      domains = {};
      for (const [k, v] of Object.entries(raw.domains)) {
        const o = objOr(v);
        domains[k] = { ...o, modules: { ...objOr(o.modules) } };
      }
    }
    const src = objOr(raw.domains[from]);
    const srcOn = sanitizeWeight(src.weight, 1) > 0;
    const srcModules = objOr(src.modules);
    const target = byId.get(to);
    if (!has(domains, to)) {
      const modules = {};
      for (const mid of target.modules) modules[mid] = 0;
      domains[to] = { weight: sanitizeWeight(src.weight, 1), modules };
    }
    for (const mid of target.modules) {
      if (has(srcModules, mid)) domains[to].modules[mid] = srcOn ? sanitizeWeight(srcModules[mid], 1) : 0;
    }
    delete domains[from];
  }
  return domains ? { ...raw, domains } : raw;
}

// `aliases` defaults to the registry's domainAliases (loaded with loadDomains()).
export function normalizeMixConfig(raw, available, aliases = registryAliases) {
  raw = applyDomainAliases(raw, aliases, available);
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


// ---- roles (roles/index.json + roles/<id>.json) ----
//
// A role is a hand-made weighted mix of subjects (modules, optionally narrowed to subtopics), with
// subroles (narrower mixes) and one role-only module (`exclusive`, "roleOnly": true) of scenarios.
// Role levels shift the subject difficulty up: Easy -> Medium, Medium -> Hard, Hard -> Expert
// (closest level the subtopic has, as in mixes), with role-only scenarios in the last 20% of the
// run; Expert draws only role-only scenarios (tier "expert-plus", shown as "Expert+").

export { ROLE_MODULE };
// Separates role and subrole in quiz routes and the stored attempt subtopic: "<role>~<subrole>".
export const ROLE_SEP = '~';
// Role levels Easy/Medium/Hard/Expert. Easy draws subject Medium, Medium -> Hard, Hard -> Expert;
// Expert draws only role-only scenarios (tier "expert-plus", shown as "Expert+").
export const ROLE_LEVELS = ['easy', 'medium', 'hard', 'expert'];
export const ROLE_TOP = 'expert';
export const isRoleLevel = l => ROLE_LEVELS.includes(l);
// Older role-level ids (URLs, stored attempts): "normal" -> easy, "expert-plus" -> expert.
// "hard" and "expert" always read with the current meaning.
const ROLE_LEVEL_ALIASES = { normal: 'easy', [EXPERT_PLUS]: 'expert' };
export const normalizeRoleLevel = l => (isRoleLevel(l) ? l : ROLE_LEVEL_ALIASES[l] ?? null);
const ROLE_SHIFT = { easy: 'medium', medium: 'hard', hard: 'expert' };
// The subject level a role level draws (null for Expert, which has no subject questions).
export const roleSubjectLevel = level => ROLE_SHIFT[normalizeRoleLevel(level)] ?? null;
// The role-only scenario tier a role level draws (its mixed slots; Expert: every question).
export const roleScenarioTier = level => {
  const l = normalizeRoleLevel(level);
  return l === ROLE_TOP ? EXPERT_PLUS : ROLE_SHIFT[l] ?? null;
};
export const ROLE_COUNT = 10;
export const ROLE_COUNT_EXPERT_PLUS = 5;
export const ROLE_MIN_COUNT = 5;
export const ROLE_MAX_COUNT = 50;
// Default question count of a role level (the role page's count control can change it, 5-50).
export const roleQuestionCount = level => (normalizeRoleLevel(level) === ROLE_TOP ? ROLE_COUNT_EXPERT_PLUS : ROLE_COUNT);
// A role question count: an integer 5-50 (rounded, clamped), else `fallback`.
export function sanitizeRoleCount(v, fallback = ROLE_COUNT) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ROLE_MAX_COUNT, Math.max(ROLE_MIN_COUNT, n));
}
// Easy/Medium/Hard runs end with this many role-only scenario questions: ceil(20% of the count).
export const roleMixedSlots = n => Math.ceil(n * 0.2);
// Weight of a role-only (mixed) question in the attempt score: its number of parts (1-6).
export const MAX_QUESTION_WEIGHT = 6;
function scenarioWeight(q) {
  const n = Array.isArray(q?.parts) ? q.parts.length : 1;
  return Math.min(MAX_QUESTION_WEIGHT, Math.max(1, n));
}

// "<role>" or "<role>~<subrole>" -> { roleId, subroleId|null } or null when malformed.
export function parseRoleKey(key) {
  const parts = String(key ?? '').split(ROLE_SEP);
  if (parts.length > 2 || !parts.every(isValidId)) return null;
  return { roleId: parts[0], subroleId: parts[1] ?? null };
}
export const roleKey = (roleId, subroleId) => (subroleId ? `${roleId}${ROLE_SEP}${subroleId}` : roleId);

const roleWarned = new Set();
function warnRole(key, msg) {
  if (roleWarned.has(key)) return;
  roleWarned.add(key);
  console.warn(`StudyBlock: ${msg}`);
}

// Listed role ids (valid, deduped). A missing roles/index.json yields [].
async function roleIds() {
  let idx;
  try { idx = await loadJSON('roles/index.json'); } catch { return []; }
  const out = [];
  for (const id of Array.isArray(idx?.roles) ? idx.roles : []) {
    if (!isValidId(id)) { warnRole(`id|${JSON.stringify(id)}`, `ignoring invalid role id ${JSON.stringify(id)}`); continue; }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

async function rawRole(id) {
  const r = await loadJSON(`roles/${id}.json`);
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`Bad roles/${id}.json`);
  return r;
}

// Ids of role-only modules (the `exclusive` of every listed role). Used to allow loading them.
async function roleOnlyIds() {
  const out = new Set();
  for (const id of await roleIds()) {
    try {
      const r = await rawRole(id);
      if (isValidId(r.exclusive)) out.add(r.exclusive);
    } catch { /* reported by loadRoles */ }
  }
  return out;
}

// Mix entries { moduleId: { weight, subtopics? } } checked against loaded modules (Map id -> mod).
// Unknown modules/subtopics and bad weights are dropped with one console.warn per role.
function parseRoleMix(raw, mods, where) {
  const out = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const bad = [];
  for (const [mid, e] of Object.entries(raw)) {
    const mod = mods.get(mid);
    const w = e && typeof e === 'object' ? e.weight : undefined;
    if (!mod || !mod.subtopics.length) { bad.push(mid); continue; }
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) { bad.push(`${mid} (weight)`); continue; }
    let subtopics = mod.subtopics;
    if (Array.isArray(e.subtopics)) {
      const wanted = e.subtopics.filter(x => typeof x === 'string');
      for (const x of e.subtopics) if (!mod.subtopics.some(s => s.id === x)) bad.push(`${mid}/${x}`);
      subtopics = mod.subtopics.filter(s => wanted.includes(s.id));
      if (!subtopics.length) continue;
    }
    out.push({ module: mid, weight: Math.min(w, MAX_WEIGHT), subtopics: subtopics.map(s => s.id) });
  }
  if (bad.length) warnRole(`mix|${where}`, `${where}: ignoring unknown or invalid mix entries ${JSON.stringify(bad)}`);
  return out;
}

const strField = (v, max, d = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d);

/*
 * -> [{ id, title, icon, description, exclusive|null, exclusiveModule|null, mix, subroles }]
 *   mix      = [{ module, weight, subtopics: [id] }] (validated)
 *   subroles = [{ id, title, icon, description, mix, exclusiveSubtopics: [id] }]
 *     A subrole without its own mix uses the role's. Empty exclusiveSubtopics = all of the
 *     role-only module's subtopics.
 * `exclusiveModule` is the loaded role-only module (null when missing or invalid: no Expert+).
 * A broken role file is skipped with a warning.
 */
export async function loadRoles() {
  const ids = await roleIds();
  const raws = (await Promise.all(ids.map(id => rawRole(id).catch(e => {
    console.warn(`StudyBlock: could not load role ${id}`, e);
    return null;
  })))).map((r, i) => (r ? { ...r, id: ids[i] } : null)).filter(Boolean);
  // Every module referenced by any mix, loaded once (domain modules only; role-only ones never mix).
  const wanted = new Set();
  for (const r of raws) {
    for (const m of [r.mix, ...(Array.isArray(r.subroles) ? r.subroles.map(s => s?.mix) : [])]) {
      if (m && typeof m === 'object') Object.keys(m).filter(isValidId).forEach(x => wanted.add(x));
    }
  }
  const mods = new Map();
  await Promise.all([...wanted].map(async mid => {
    try { mods.set(mid, await loadModule(mid)); } catch { /* unknown: dropped with a warning */ }
  }));
  const roles = [];
  for (const r of raws) {
    let exclusiveModule = null;
    if (r.exclusive !== undefined) {
      if (!isValidId(r.exclusive)) warnRole(`ex|${r.id}`, `role ${r.id}: invalid "exclusive" id`);
      else {
        try { exclusiveModule = await loadRoleOnlyModule(r.exclusive); } catch (e) {
          warnRole(`ex|${r.id}`, `role ${r.id}: role-only module ${r.exclusive} unavailable (${e.message || e}); role Expert and scenarios are off`);
        }
      }
    }
    if (exclusiveModule && !exclusiveModule.subtopics.length) exclusiveModule = null;
    const mix = parseRoleMix(r.mix, mods, `role ${r.id}`);
    const subroles = [];
    for (const s of Array.isArray(r.subroles) ? r.subroles : []) {
      if (!s || typeof s !== 'object' || !isValidId(s.id)) { warnRole(`sub|${r.id}|${JSON.stringify(s?.id)}`, `role ${r.id}: ignoring a subrole with an invalid id`); continue; }
      if (subroles.some(x => x.id === s.id)) { warnRole(`sub|${r.id}|${s.id}`, `role ${r.id}: duplicate subrole ${s.id}`); continue; }
      const own = s.mix !== undefined ? parseRoleMix(s.mix, mods, `role ${r.id} / ${s.id}`) : null;
      let exSubs = [];
      if (exclusiveModule && Array.isArray(s.exclusiveSubtopics)) {
        exSubs = s.exclusiveSubtopics.filter(x => exclusiveModule.subtopics.some(st => st.id === x));
        if (exSubs.length !== s.exclusiveSubtopics.length) warnRole(`exs|${r.id}|${s.id}`, `role ${r.id} / ${s.id}: ignoring unknown exclusiveSubtopics`);
      }
      subroles.push({
        id: s.id,
        title: strField(s.title, 80, s.id),
        icon: strField(s.icon, 60, ''),
        description: strField(s.description, 400),
        mix: own && own.length ? own : mix,
        exclusiveSubtopics: exSubs,
      });
    }
    roles.push({
      id: r.id,
      title: strField(r.title, 80, r.id),
      icon: strField(r.icon, 60, 'briefcase-business'),
      description: strField(r.description, 400),
      exclusive: exclusiveModule ? exclusiveModule.id : null,
      exclusiveModule,
      mix,
      subroles,
    });
  }
  return roles;
}

// { role, subrole|null } for "<role>" / "<role>~<subrole>", or null when unknown.
export async function findRole(roleId, subroleId = null) {
  const role = (await loadRoles()).find(r => r.id === roleId);
  if (!role) return null;
  if (!subroleId) return { role, subrole: null };
  const subrole = role.subroles.find(s => s.id === subroleId);
  return subrole ? { role, subrole } : null;
}

// Levels a role (or subrole) offers: Expert only when its role-only module is available.
export function roleLevels(role) {
  return role?.exclusiveModule ? ROLE_LEVELS.slice() : ROLE_LEVELS.filter(l => l !== ROLE_TOP);
}

// Share of each subject in a role mix: [{ module, share }] (share 0-1, ∝ weight).
export function roleShares(mix) {
  const total = mix.reduce((s, e) => s + e.weight, 0);
  return total > 0 ? mix.map(e => ({ module: e.module, share: e.weight / total })) : [];
}

// Role-only subtopics of (role, subrole) that offer scenario tier `tier` (subrole: only its
// exclusiveSubtopics). Expert runs draw only from these (expert-plus); Easy/Medium/Hard runs end with them.
export function roleScenarioSubtopics(role, subrole, tier = EXPERT_PLUS) {
  const mod = role?.exclusiveModule;
  if (!mod) return [];
  const has = st => Array.isArray(st.difficulties) && st.difficulties.includes(tier);
  const pick = subrole && subrole.exclusiveSubtopics.length ? subrole.exclusiveSubtopics : null;
  return mod.subtopics.filter(st => has(st) && (!pick || pick.includes(st.id)));
}

// How many questions of an n-question run at role `level` are role-only scenarios: all of them at
// Expert, else the last ceil(20% × n), or 0 when the module has no scenarios at that tier.
export function roleScenarioCount(role, subrole, level, n) {
  if (normalizeRoleLevel(level) === ROLE_TOP) return n;
  return roleScenarioSubtopics(role, subrole, roleScenarioTier(level)).length ? Math.min(n, roleMixedSlots(n)) : 0;
}

// Draws up to `n` role-only scenario questions at `tier` (seeded via `rng`/`nextSeed`), each with
// `weight` = its number of parts. Prompts already in `seen` are avoided where possible.
async function roleScenarios(role, subs, tier, n, rng, nextSeed, seen) {
  const mod = role.exclusiveModule;
  const gen = await loadGenerator(mod.id);
  const lang = effectiveLang(mod);
  const out = [];
  let failures = 0, dupTries = 0;
  while (out.length < n && failures < n * 2) {
    const st = rng.pick(subs);
    const q = decorate(generateVerified(gen, st.id, tier, nextSeed(), lang), mod, tier);
    if (!q) { failures++; continue; }
    if (seen.has(q.prompt) && dupTries < n * 10) { dupTries++; continue; }
    seen.add(q.prompt);
    out.push({ ...annotate(q, mod, st, tier), domainTitle: role.title, weight: scenarioWeight(q), scenario: true });
  }
  return out;
}

/*
 * Builds a role quiz (seeded) of `count` questions (5-50; default 10, Expert 5).
 * Easy/Medium/Hard: per question a subject ∝ weight, a subtopic uniformly from its allowed ones
 * (those offering the shifted level; if none does, all of them, at the closest level), then the
 * shifted difficulty (closest available). The last ceil(20% × count) slots are role-only scenario
 * questions at the tier matching the subject level (medium/hard/expert; subrole: its
 * exclusiveSubtopics); when the module has none at that tier, the run has no scenarios (one
 * warning). Expert: only role-only scenarios, stored difficulty "expert-plus". Scenario questions carry `weight` = their part count.
 * Every question carries module/subtopic/difficulty (+ titles), as in mixes.
 */
export async function buildRoleQuiz(roleId, subroleId, rawLevel, seed = randomSeed(), count = null) {
  const level = normalizeRoleLevel(rawLevel);
  if (!level) throw new Error('Unknown role level.');
  const found = await findRole(roleId, subroleId);
  if (!found) throw new Error('Unknown role.');
  const { role, subrole } = found;
  const rng = createRng(seed);
  const nextSeed = () => Math.floor(rng.next() * 0x100000000) >>> 0;
  const n = sanitizeRoleCount(count, roleQuestionCount(level));
  const questions = [];
  const seen = new Set();

  if (level === ROLE_TOP) {
    const subs = roleScenarioSubtopics(role, subrole, EXPERT_PLUS);
    if (!subs.length) throw new Error('Expert questions (role scenarios) for this role are not available yet.');
    questions.push(...await roleScenarios(role, subs, EXPERT_PLUS, n, rng, nextSeed, seen));
    if (!questions.length) throw new Error('This quiz could not generate any valid questions.');
    return questions;
  }

  // Scenario slots at the end of the run (0 when the role-only module lacks this tier).
  const tier = roleScenarioTier(level);
  const scenarioSubs = roleScenarioSubtopics(role, subrole, tier);
  if (!scenarioSubs.length && role.exclusiveModule) {
    warnRole(`tier|${role.id}|${subrole?.id ?? ''}|${tier}`,
      `role ${roleKey(role.id, subrole?.id)}: role-only module ${role.exclusiveModule.id} has no "${tier}" scenarios${subrole ? ' for this subrole' : ''}; ${level} runs have no mixed questions`);
  }
  const nMixed = scenarioSubs.length ? Math.min(n, roleMixedSlots(n)) : 0;
  const nSubject = n - nMixed;

  const target = roleSubjectLevel(level);
  const mix = (subrole ? subrole.mix : role.mix);
  const domains = await loadDomains();
  const domainOfId = new Map(domains.flatMap(d => d.modules.map(mid => [mid, d])));
  const sources = new Map();
  await Promise.all(mix.map(async e => {
    try {
      const mod = await loadModule(e.module);
      const subs = mod.subtopics.filter(s => e.subtopics.includes(s.id));
      if (!subs.length) return;
      const withLevel = subs.filter(s => !Array.isArray(s.difficulties) || s.difficulties.includes(target));
      const src = { mod, subs: withLevel.length ? withLevel : subs };
      if (mod.type === 'csv') src.rows = await loadCsvRows(mod.id);
      else { src.gen = await loadGenerator(mod.id); src.lang = effectiveLang(mod); }
      sources.set(e.module, src);
    } catch (err) {
      console.warn(`StudyBlock: skipping module ${e.module} in role ${role.id}`, err);
    }
  }));
  let pool = mix.filter(e => sources.has(e.module));
  if (!pool.length && !nMixed) throw new Error('None of this role\'s subjects are available.');
  const failures = new Map();
  let tries = 0;
  const maxTries = nSubject * 40;
  while (questions.length < nSubject && tries < maxTries && pool.length) {
    tries++;
    const e = weightedPick(rng, pool, x => x.weight);
    if (!e) break;
    const { mod, subs, gen, rows, lang } = sources.get(e.module);
    const st = rng.pick(subs);
    const difficulty = resolveDifficulty(rng, st, target);
    const qSeed = nextSeed();
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
      if (f >= 25) {
        console.error(`StudyBlock: dropping module ${mod.id} from role ${role.id} after repeated failures`);
        pool = pool.filter(x => x.module !== mod.id);
      }
      continue;
    }
    failures.set(mod.id, 0);
    const key = `${mod.id}|${q.prompt}`;
    if (seen.has(key) && tries < maxTries * 0.75) continue;
    seen.add(key);
    const d = domainOfId.get(mod.id);
    questions.push({ ...annotate(q, mod, st, difficulty), ...(d ? { domain: d.id, domainTitle: d.title } : {}) });
  }
  if (nMixed) {
    try {
      questions.push(...await roleScenarios(role, scenarioSubs, tier, nMixed, rng, nextSeed, new Set()));
    } catch (err) {
      console.warn(`StudyBlock: role ${role.id}: no scenario questions this run`, err);
    }
  }
  if (!questions.length) throw new Error('The role quiz could not generate any questions.');
  return questions;
}

// Spaces around ":" don't matter, so "2 : 7" matches the ratio "2:7".
const normCase = s => String(s ?? '').replace(/−/g, '-').trim().replace(/\s+/g, ' ').replace(/ ?: ?/g, ':').replace(/ ?, ?/g, ', ');
const normText = s => normCase(s).toLowerCase();
// The text rules for one question: `caseSensitive: true` keeps letter case (e.g. genotypes Tt vs tt).
const normFor = q => (q?.caseSensitive === true ? normCase : normText);

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

// Credit for k typos at text level L: up to floor(L) typos; the length tier for 1 typo, then
// 0.15 less per extra typo (minimum 0.25). Level < 1 = exact only.
export function textCredit(len, typos, level = 1) {
  const base = textTier(len);
  if (!base || !(typos >= 1) || typos > Math.floor(level)) return 0;
  return Math.max(0.25, Math.round((base - 0.15 * (typos - 1)) * 100) / 100);
}

// Credit for a relative error r beyond tolerance at level L (band edges × L):
// ≤ 0.1%·L 0.9, ≤ 1%·L 0.75, ≤ 2%·L 0.5, else 0. Level 0 = exact.
export function numberTier(r, level = 1) {
  const e = 1e-9;
  if (!(r >= 0) || !(level > 0)) return 0;
  if (r <= 0.001 * level + e) return 0.9;
  if (r <= 0.01 * level + e) return 0.75;
  if (r <= 0.02 * level + e) return 0.5;
  return 0;
}

// Years/absolute mode (and dates, in units of the precision): off by d > 0 at level L earns
// max(0, 1 − d/(L+1)), 2 dp (L = 1: 1 off 0.5, 2 off 0; L = 2: 0.67, 0.33, 0). Level 0 = exact.
export function offTier(d, level = 1) {
  if (!(d > 0) || !(level > 0)) return 0;
  return Math.max(0, Math.round((1 - d / (level + 1)) * 100) / 100);
}

const parseNumber = v => {
  let str = String(v ?? '').trim().replace(/−/g, '-');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) str = str.replace(/,/g, ''); // thousands separators
  return str ? Number(str) : NaN;
};

// ---- leniency of one question or part (`owner` = the question a part belongs to) ----
const firstDefined = (...vs) => vs.find(v => v !== undefined && v !== null);
const asLevel = v => (v === false ? 0 : v === true ? 1 : typeof v === 'number' && v >= 0 ? Math.min(v, LEVEL_MAX) : undefined);
// Text level: the part's, else the question's, else the module's (missing = 1).
export function textLevelOf(q, owner = q) {
  const v = firstDefined(asLevel(q?.fuzzy), owner !== q ? asLevel(owner?.fuzzy) : undefined, asLevel(owner?.modFuzzy), asLevel(q?.modFuzzy));
  return v === undefined ? 1 : v;
}
/*
 * Number spec { mode: 'relative' | 'years', level, explicit }: the part's, the question's or the
 * module's `fuzzyNumber`; with none, relative at level 1, or 0 when the text level is 0 (so
 * modules with "fuzzy": false stay exact). `explicit` (any fuzzyNumber set) drops the calculator gate.
 */
export function numberSpecOf(q, owner = q) {
  const set = firstDefined(q?.fuzzyNumber, owner !== q ? owner?.fuzzyNumber : undefined, owner?.modFuzzyNumber, q?.modFuzzyNumber);
  if (set && typeof set === 'object' && (set.mode === 'relative' || set.mode === 'years') && asLevel(set.level) !== undefined) {
    return { mode: set.mode, level: asLevel(set.level), explicit: true };
  }
  return { mode: 'relative', level: textLevelOf(q, owner) === 0 ? 0 : 1, explicit: false };
}
// Date level: `fuzzyNumber` in years mode, else 1 (relative-mode numbers don't apply to dates).
function dateLevelOf(q, owner = q) {
  const spec = numberSpecOf(q, owner);
  if (spec.explicit && spec.mode === 'years') return spec.level;
  return spec.explicit || textLevelOf(q, owner) !== 0 ? 1 : 0;
}
const yearsMode = (q, owner) => numberSpecOf(q, owner).mode === 'years';

// Lookalike rule: typed text that exactly matches another real answer earns nothing.
const isLookalike = (q, u) => Array.isArray(q.nearMisses) && q.nearMisses.some(n => normText(n) === u);

function closeYears(q, a, userAnswer, spec) {
  const u = parseYear(userAnswer);
  if (!Number.isFinite(u) || !Number.isFinite(a)) return null;
  if (Array.isArray(q.nearMisses) && q.nearMisses.some(n => parseYear(n) === u)) return null;
  const d = yearDistance(u, a);
  const factor = offTier(d, spec.level);
  return factor > 0 ? { kind: 'number', mode: 'years', off: d, factor, level: spec.level } : null;
}

function closeText(q, userAnswer, owner) {
  const u = normText(userAnswer);
  if (!u || isLookalike(q, u)) return null;
  // Year answers in a years-mode module (CSV "1066", "44 BC"): off-by-years credit.
  const spec = numberSpecOf(q, owner);
  if (spec.mode === 'years' && Number.isFinite(parseYear(q.answer))) return closeYears(q, parseYear(q.answer), userAnswer, spec);
  const level = textLevelOf(q, owner);
  const maxTypos = Math.floor(level);
  if (maxTypos < 1) return null;
  let best = null;
  for (const target of [q.answer, ...(Array.isArray(q.accepts) ? q.accepts : [])].map(normText)) {
    // Answers with digits (years, fractions, times, codes) are never "close": a changed digit is a
    // different answer, not a typo.
    if (/\d/.test(target)) continue;
    const typos = dlDistance(u, target, maxTypos);
    const factor = textCredit(Array.from(target).length, typos, level);
    if (factor > 0 && (!best || factor > best.factor)) best = { kind: 'text', typos, factor, level };
  }
  return best;
}

function closeNumber(q, userAnswer, owner) {
  const spec = numberSpecOf(q, owner);
  if (!(spec.level > 0)) return null;
  // Without an explicit fuzzyNumber, numbers need the calculator (as before).
  if (!spec.explicit && (owner?.calculator === false || q.calculator === false)) return null;
  const a = Number(q.answer);
  if (spec.mode === 'years') return closeYears(q, a, userAnswer, spec);
  const u = parseNumber(userAnswer);
  if (!Number.isFinite(u) || !Number.isFinite(a) || a === 0) return null;
  if (Math.sign(u) !== Math.sign(a)) return null;
  if (Array.isArray(q.nearMisses) && q.nearMisses.some(n => Number(n) === u)) return null;
  const tol = typeof q.tolerance === 'number' ? Math.max(q.tolerance, 1e-9) : 1e-9;
  if (Math.abs(u - a) <= tol) return null; // already correct
  const r = Math.abs(u - a) / Math.abs(a);
  const factor = numberTier(r, spec.level);
  return factor > 0 ? { kind: 'number', relErr: Math.round(r * 1e6) / 1e6, factor, level: spec.level } : null;
}

function closeDate(q, userAnswer, owner) {
  const level = dateLevelOf(q, owner);
  const precision = PRECISIONS.includes(q.precision) ? q.precision : 'year';
  const a = parseDate(q.answer);
  const u = parseDate(userAnswer);
  if (!a || !u || !hasPrecision(u, precision)) return null;
  const d = dateDistance(u, a, precision);
  const factor = offTier(d, level);
  return factor > 0 ? { kind: 'date', off: d, factor, level } : null;
}

/*
 * Close-answer credit for a wrong typed answer: { kind: 'text', typos, factor, level } |
 * { kind: 'number', relErr | (mode: 'years', off), factor, level } | { kind: 'date', off, factor, level }
 * | null. `q` is a single question or one multi-part part; `owner` is the question it belongs to
 * (question and module leniency, `calculator`). Never for choice or tiles answers.
 */
export function closeOf(q, userAnswer, owner = q) {
  if (!q || q.caseSensitive === true) return null;
  if (q.answerType === 'text') return closeText(q, userAnswer, owner);
  if (q.answerType === 'number') return closeNumber(q, userAnswer, owner);
  if (q.answerType === 'date') return closeDate(q, userAnswer, owner);
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
      const correct = has && checkSingle(p, given[p.id], question);
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
 * question's blocks multiplier, never a close answer. Typed text/number/date answers that miss may
 * earn close-answer credit (`fuzzy`); `correct` stays false for those.
 */
export function gradeAnswer(q, userAnswer, mode = 'type') {
  if (q.answerType === 'multi') {
    const r = checkAnswer(q, userAnswer);
    return { correct: r.correct, credit: r.credit, parts: r.parts };
  }
  // Journal entries: lines matched in any order; credit = matched lines / max(answer, user lines).
  // `journal` = { matched, total, lines: per user line true/false/null (blank) }. No close credit.
  if (q.answerType === 'journal') {
    const r = gradeJournal(q, userAnswer);
    return { correct: r.correct, credit: r.credit, journal: { matched: r.matched, total: r.total, lines: r.lines } };
  }
  if (mode === 'blocks' && q.blocks) {
    let correct = checkSingle({ answerType: 'text', answer: q.answer, accepts: q.accepts, ...(q.caseSensitive === true ? { caseSensitive: true } : {}), ...(q.exactForm === true ? { exactForm: true } : {}) }, userAnswer);
    const m = typeof q.blocks.multiplier === 'number' ? Math.min(1, Math.max(0, q.blocks.multiplier)) : 1;
    const g = correct ? null : gradeByModule(q, userAnswer);
    if (g) correct = g.correct;
    return { correct, credit: correct ? m : 0, mode: 'blocks', multiplier: m, ...gradeExtras(g) };
  }
  // Segmented choices: Build (default) earns full credit; Choose earns credit × chooseMultiplier.
  if (q.answerType === 'choice' && Array.isArray(q.choiceCols) && mode === 'choose') {
    const correct = checkSingle(q, userAnswer);
    const m = typeof q.chooseMultiplier === 'number' ? Math.min(1, Math.max(0, q.chooseMultiplier)) : 1;
    return { correct, credit: correct ? m : 0, mode: 'choose', multiplier: m };
  }
  const correct = checkSingle(q, userAnswer);
  if (correct) return { correct: true, credit: 1 };
  // The module's own grader (e.g. SQL: same output, no hard-coded values) has the last word.
  const g = gradeByModule(q, userAnswer);
  if (g) return { correct: g.correct, credit: g.correct ? 1 : 0, ...gradeExtras(g) };
  const close = closeOf(q, userAnswer);
  return close ? { correct: false, credit: close.factor, fuzzy: close } : { correct: false, credit: 0 };
}

const GRADE_NOTE_MAX = 300;
// { gradedBy: 'output', note? } for a module grader's verdict (only when it accepted), plus its note.
const gradeExtras = g => (g ? { ...(g.correct ? { gradedBy: 'output' } : {}), ...(g.note ? { note: g.note } : {}) } : {});

/*
 * Module grading hook: a generator may export grade(question, answerString) ->
 * { correct: boolean, note?: string } | null. Called only for text questions with
 * `gradeByOutput: true` whose plain text/accepts check failed. Returns { correct, note? } or null
 * (no opinion, or the generator isn't loaded / has no grade() / threw / returned a bad shape).
 */
export function gradeByModule(q, userAnswer) {
  if (!q || q.gradeByOutput !== true || q.answerType !== 'text') return null;
  const id = q.srcModule ?? q.module;
  const gen = isValidId(id) ? loadedGenerators.get(id) : null;
  if (!gen || typeof gen.grade !== 'function') return null;
  try {
    const r = gen.grade(q, String(userAnswer ?? ''));
    if (!r || typeof r !== 'object' || typeof r.correct !== 'boolean') return null;
    const note = typeof r.note === 'string' ? r.note.trim().slice(0, GRADE_NOTE_MAX) : '';
    return { correct: r.correct, ...(note ? { note } : {}) };
  } catch (e) {
    console.warn('StudyBlock: grade() failed', e);
    return null;
  }
}

// A date answer: same value at the answer's precision (extra detail ignored; less detail is wrong).
export function checkDate(question, userAnswer) {
  const precision = PRECISIONS.includes(question.precision) ? question.precision : 'year';
  const a = parseDate(question.answer);
  const u = parseDate(userAnswer);
  return !!a && !!u && hasPrecision(u, precision) && dateDistance(u, a, precision) === 0;
}

function checkSingle(question, userAnswer, owner = question) {
  switch (question.answerType) {
    case 'date':
      return checkDate(question, userAnswer);
    case 'number': {
      // Years mode also reads "44 BC", "AD 79".
      const u = yearsMode(question, owner) ? parseYear(userAnswer) : parseNumber(userAnswer);
      const a = Number(question.answer);
      if (!Number.isFinite(u) || !Number.isFinite(a)) return false;
      const tol = typeof question.tolerance === 'number' ? Math.max(question.tolerance, 1e-9) : 1e-9;
      return Math.abs(u - a) <= tol;
    }
    case 'choice':
      return String(userAnswer) === String(question.answer);
    case 'journal':
      return gradeJournal(question, userAnswer).correct;
    default: {
      const norm = normFor(question);
      const u = norm(userAnswer);
      if (u === norm(question.answer) || (Array.isArray(question.accepts) && question.accepts.some(a => norm(a) === u))) return true;
      // Years mode: a year answer also matches the same year written another way ("AD 1066").
      if (question.answerType === 'text' && yearsMode(question, owner)) {
        const a = parseYear(question.answer);
        return Number.isFinite(a) && parseYear(userAnswer) === a;
      }
      // Equivalent fractions: "2/6" for the answer "1/3", unless the question wants this exact form.
      return question.answerType === 'text' && !question.exactForm && sameFraction(userAnswer, question.answer);
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

// A plain fraction "a/b" (optional leading minus, whole numbers, b > 0) as [n, d], else null.
// Mixed numbers ("2 1/3") and decimals are not fractions here.
function parseFraction(s) {
  const m = /^(-?)(\d{1,9})\/(\d{1,9})$/.exec(String(s ?? '').replace(/−/g, '-').replace(/\s+/g, ''));
  if (!m) return null;
  const d = Number(m[3]);
  return d > 0 ? [(m[1] ? -1 : 1) * Number(m[2]), d] : null;
}

// Equivalent fractions count as the same answer (2/6 for 1/3), but only when the expected
// answer is itself a fraction: "4/2" is not accepted for a whole-number answer "2".
function sameFraction(user, answer) {
  const a = parseFraction(answer);
  const u = a && parseFraction(user);
  return !!u && u[0] * a[1] === a[0] * u[1];
}

// True when `user` is a correct fraction that isn't in the same (simplest) form as the answer,
// so feedback can add "simplest form: 1/3".
export function unsimplifiedFraction(question, user) {
  return question?.answerType === 'text' && !question.exactForm
    && normFor(question)(user) !== normFor(question)(question.answer) && sameFraction(user, question.answer);
}
