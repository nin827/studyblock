import { loadModule, loadGuide, domainOf, checkAnswer, gradeAnswer, runAnswer, serialiseTree, SLOT_DEPTH_MAX, buildQuiz, allowedCells, ALL } from '../lib/engine.js';
import { hintsFor, parseGuide, guideHtml, setQuizMode, OUTCOMES, GUIDED, PRACTICE } from './guided.js';
import { saveAttempt, setCookie, getCookie, cleanWork, cleanGraph, creditOf, roundScore, cleanChoiceCols, cleanPartCols, splitSegs, SEG_SEP } from '../lib/storage.js';
import { renderMarkdown, renderInline } from '../lib/markdown.js';
import { formatValue } from '../lib/calc.js';
import { esc, icon, icons, cap, errorBox, hashPart, scoreClass, domClass, tag, fmtScore, difficultyLabel, difficultyHtml, difficultyTag, subtopicLabel, isFlameLevel } from './ui.js';
import { mountCalculator } from './calculator.js';
import { compileGraph } from './staticgraph.js'; // also defines <sb-graph> (static plots in the review)
import { isLang, langTitle } from '../lib/languages.js';
import { parseDate, formatDate, hasPrecision, precisionHint } from '../lib/dates.js';

// The calculator sheet survives a reload: only the first quiz after page load, on the same
// address it was opened on, may restore it from sessionStorage. Every other run starts empty.
const BOOT_HASH = typeof location !== 'undefined' ? location.hash : '';
let restoreOnBoot = true;
const CALC_KEY = 'studyblock:calc';
const CALC_PANEL_COOKIE = 'calcPanel'; // "closed" = desktop panel collapsed
const DESKTOP_CALC = '(min-width: 900px)';
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// ---- date answers (answerType "date"; parsing in js/lib/dates.js) ----
const DATE_EXAMPLES = { year: 'e.g. 1969 or 44 BC', month: 'e.g. July 1969', day: 'e.g. 20 July 1969' };
const datePlaceholder = precision => DATE_EXAMPLES[precision] || DATE_EXAMPLES.year;
// The live "Read as" line under a date field (aria-live polite). `id` is already safe.
function readAsHtml(id, precision) {
  return `<p class="date-readas" id="${id}" aria-live="polite" data-precision="${esc(precision || 'year')}">${readAsInner('', precision)}</p>`;
}
function readAsInner(text, precision) {
  if (!String(text ?? '').trim()) return `<span class="muted">${esc(precisionHint(precision))}, ${esc(datePlaceholder(precision))}</span>`;
  const d = parseDate(text);
  if (!d) return `${icon('calendar-x')}<span>Not a date yet</span>`;
  const short = !hasPrecision(d, precision);
  return `${icon(short ? 'circle-alert' : 'calendar-check')}<span>Read as: <strong>${esc(formatDate(d))}</strong>${short ? ` · ${esc(precisionHint(precision))}` : ''}</span>`;
}
function updateReadAs(el, text, precision) {
  if (!el) return;
  el.innerHTML = readAsInner(text, precision);
  const d = parseDate(text);
  el.classList.toggle('is-invalid', !!String(text ?? '').trim() && (!d || !hasPrecision(d, precision)));
  icons();
}
// Feedback: how a wrong date answer was read.
function dateReadHtml(text, precision) {
  const d = parseDate(text);
  if (!d) return '';
  const short = !hasPrecision(d, precision);
  return `<p class="date-read-back">Your answer read as: <strong>${esc(formatDate(d))}</strong>${short ? ` · not enough detail (${esc(precisionHint(precision).replace(/^Give/, 'give').toLowerCase())})` : ''}</p>`;
}
const offText = (n, unit) => `${n} ${unit || 'year'}${n === 1 ? '' : 's'}`;

function forgetSheet() {
  try { sessionStorage.removeItem(CALC_KEY); } catch { /* ignore */ }
}

export function renderPrompt(src) {
  const s = String(src ?? '');
  return s.includes('\n') ? renderMarkdown(s) : `<p>${renderInline(s)}</p>`;
}

// "Domain › Module" + "subtopic · difficulty" tags for questions that carry their own origin.
// All parts are optional (older stored attempts have none). `q.domain` (id) picks the tint.
export function questionTag(q) {
  if (!q || typeof q.module !== 'string') return '';
  return `<p class="q-tag tag-row">${originTags(q.domain, q.domainTitle, q.moduleTitle ?? q.module, q.subtopicTitle ?? q.subtopic, q.difficulty, q.lang)}</p>`;
}

// "Subtopic · Difficulty" tag only (whole-module quizzes, where the module is already known).
export function cellTag(q) {
  if (!q || (typeof q.subtopic !== 'string' && typeof q.difficulty !== 'string')) return langRow(q);
  return `<p class="q-tag tag-row">${originTags(null, null, null, q.subtopicTitle ?? q.subtopic, q.difficulty, q.lang)}</p>`;
}

// Code language pill ("Python", "C#", …) for questions from language-aware modules; '' otherwise.
export function langTag(q) {
  const l = q && isLang(q.lang) ? q.lang : null;
  return l ? `<span class="tag tag-lang" title="Code language">${icon('code')}<span class="sr-only">Code language: </span>${esc(langTitle(l))}</span>` : '';
}

// A tag row holding only the language pill (where no other origin tags are shown).
function langRow(q) {
  const t = langTag(q);
  return t ? `<p class="q-tag tag-row">${t}</p>` : '';
}

// Result state of a question from its credit: full, partial (multi-part only) or none.
export function creditState(credit) {
  return credit >= 1 - 1e-9 ? 'correct' : credit > 1e-9 ? 'partial' : 'wrong';
}
// Display state of a result: correct whenever `correct` is true (a Blocks answer at ×0.85 is still
// correct), else from its credit (close answers and partly right multi-part ones are partial).
export function resultState(r) {
  if (r && r.correct === true) return 'correct';
  return creditState(typeof r?.credit === 'number' ? r.credit : creditOf(r || {}));
}
const SEG_CLASS = { correct: 'is-correct', partial: 'is-partial', wrong: 'is-wrong' };

// Plain-text parts; tag() escapes them.
function originTags(domainId, domainTitle, moduleTitle, subtopicTitle, difficulty, lang) {
  const where = [domainTitle, moduleTitle].filter(Boolean).join(' › ');
  // Expert gets its own pill (flame icon + label); other difficulties share the subtopic pill.
  const expert = isFlameLevel(difficulty);
  const rest = [subtopicTitle, difficulty && !expert ? difficultyLabel(difficulty) : null].filter(Boolean).join(' · ');
  return (where ? tag(where, domClass(domainId)) : '') + (rest ? tag(rest) : '') + (expert ? difficultyTag(difficulty) : '') + langTag({ lang });
}

/*
 * Shared quiz runner used by single-module and mixed quizzes.
 * opts:
 *   build()          async -> questions[]
 *   title            HTML (already escaped)
 *   crumbs           HTML for the breadcrumb nav (already escaped)
 *   backHref/backLabel/backIcon   secondary button on the results screen
 *   showTags         show questionTag() above each prompt / in the review
 *   tagsFor(q)       optional: HTML (already escaped) tag row for each question, overrides showTags
 *   breakdown        show the per-module breakdown on the results screen (default: showTags)
 *   cardTags         optional HTML (already escaped) shown above every prompt when showTags is off
 *   toAttempt(results)  -> attempt fields (module/subtopic/difficulty/questions/score/total)
 *   guided           optional { guideFor(q) -> HTML } — guided mode: hints, unlimited tries, never
 *                    saved (toAttempt is not called). `practiceHref` links the end screen to #/q/….
 */
export async function runQuiz(root, ctx, opts) {
  let questions = [];
  let idx = 0;
  let phase = 'loading'; // loading | answer | feedback | done
  let results = [];
  // ---- guided mode state ----
  const guided = !!opts.guided;
  let gs = null;          // current question: { tries, hintsShown, partHints, hints, source, lastValue }
  let gResults = [];      // [{ q, outcome: 'first'|'after'|'solution', tries, hints, userAnswer }]
  let guideOpen = false;  // "How to solve" card stays open/closed across questions

  // ---- calculator panel (desktop side panel ≥900px, bottom sheet below) ----
  let calc = null;
  let shell = null;
  let panel = null;
  let sheetOpen = false;
  let collapsed = getCookie(CALC_PANEL_COOKIE) === 'closed';
  const mq = window.matchMedia ? window.matchMedia(DESKTOP_CALC) : null;
  const isDesktop = () => !!mq?.matches;
  const calcAllowed = q => !!q && opts.calculator !== false && q.calculator !== false;
  const calcShown = () => !!(calc && panel && !panel.hidden);

  function teardownCalc({ forget = true } = {}) {
    stopViewportTracking();
    if (calc) { calc.destroy({ forget }); calc = null; }
    if (forget) forgetSheet();
    shell = null;
    panel = null;
    sheetOpen = false;
  }

  // Keeps the phone sheet above the on-screen keyboard.
  const vv = window.visualViewport || null;
  function onViewport() {
    if (!panel || !vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.setProperty('--calc-kb', `${Math.round(kb)}px`);
  }
  function startViewportTracking() {
    if (!vv) return;
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
    onViewport();
  }
  function stopViewportTracking() {
    if (!vv) return;
    vv.removeEventListener('resize', onViewport);
    vv.removeEventListener('scroll', onViewport);
  }

  function syncOpeners() {
    root.querySelectorAll('[data-calc-open]').forEach(b => b.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false'));
  }

  function setSheet(open) {
    if (!panel) return;
    sheetOpen = !!open && !isDesktop() && !panel.hidden;
    panel.classList.toggle('is-open', sheetOpen);
    shell?.classList.toggle('sheet-open', sheetOpen);
    if (sheetOpen) startViewportTracking(); else stopViewportTracking();
    syncOpeners();
  }

  function setCollapsed(v) {
    collapsed = !!v;
    setCookie(CALC_PANEL_COOKIE, collapsed ? 'closed' : 'open');
    applyCollapsed();
  }
  function applyCollapsed() {
    if (!panel) return;
    panel.classList.toggle('is-collapsed', collapsed);
    shell?.classList.toggle('calc-collapsed', collapsed);
    const b = panel.querySelector('#calc-collapse');
    if (b) {
      b.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      b.querySelector('.calc-collapse-label').textContent = collapsed ? 'Calculator' : 'Hide calculator';
      b.setAttribute('aria-label', collapsed ? 'Show calculator' : 'Hide calculator');
    }
  }

  // Ctrl/Cmd+K: show the calculator and put the cursor in it.
  function openCalc() {
    if (!calcShown()) return;
    if (isDesktop()) { if (collapsed) setCollapsed(false); } else setSheet(true);
    calc.focus();
  }

  function focusAnswer() {
    if (phase === 'answer' && isMulti(questions[idx]) && focusPart(lastPart)) return;
    const q = questions[idx];
    const blockTile = phase === 'answer' && (inBlocks(q) || inBuild(q)) ? root.querySelector('.tiles-form .tile:not(:disabled):not([hidden])') : null;
    const target = blockTile || root.querySelector('#answer:not(:disabled)') || root.querySelector('#next') || root.querySelector('.choice:not(:disabled)')
      || root.querySelector('.tiles-form .tile:not(:disabled)');
    target?.focus();
  }

  function mountShell(restore) {
    const key = isMac() ? '⌘K' : 'Ctrl K';
    root.innerHTML = `<div class="quiz-shell" id="quiz-shell">
      <div class="quiz-main page-narrow quiz-page" id="quiz-main"></div>
      <aside class="calc-panel" id="calc-panel" aria-labelledby="calc-title" hidden>
        <div class="calc-panel-head">
          <span class="sheet-handle" aria-hidden="true"></span>
          <h2 class="calc-title" id="calc-title">${icon('calculator')}<span>Calculator</span></h2>
          <kbd class="calc-shortcut" title="Focus the calculator">${esc(key)}</kbd>
          <button type="button" class="btn btn-small calc-collapse" id="calc-collapse" aria-controls="calc-body" aria-expanded="true">${icon('panel-right-close', 'when-open')}${icon('panel-right-open', 'when-collapsed')}<span class="calc-collapse-label">Hide calculator</span></button>
          <button type="button" class="btn btn-small calc-close" id="calc-close" aria-label="Close calculator">${icon('x')}</button>
        </div>
        <div class="calc-panel-body" id="calc-body"></div>
      </aside>
    </div>`;
    shell = root.querySelector('#quiz-shell');
    panel = root.querySelector('#calc-panel');
    if (!restore) forgetSheet();
    calc = mountCalculator(panel.querySelector('#calc-body'), {
      storageKey: CALC_KEY,
      owner: location.hash,
      onUse: value => {
        const q = questions[idx];
        const input = isMulti(q)
          ? (lastPart ? partEl(lastPart)?.querySelector('.part-input') : null)
          : root.querySelector('#answer');
        if (!input || input.disabled || phase !== 'answer') return;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true })); // keeps Check's enabled state in sync
        setSheet(false);
        input.focus();
      },
      onEscape: () => { setSheet(false); focusAnswer(); },
    });
    applyCollapsed();
    panel.querySelector('#calc-collapse').addEventListener('click', () => setCollapsed(!collapsed));
    panel.querySelector('#calc-close').addEventListener('click', () => { setSheet(false); focusAnswer(); });
    shell.addEventListener('click', e => {
      if (e.target.closest('[data-calc-open]')) {
        if (sheetOpen) setSheet(false); else { setSheet(true); calc?.focus(); }
      }
    });
  }

  // Show/hide per question (modules with "calculator": false hide it) and enable Use.
  function applyCalc(q) {
    if (!panel || !calc) return;
    const on = calcAllowed(q);
    panel.hidden = !on;
    shell.classList.toggle('has-calc', on);
    calc.setVisible(on);
    if (!on) setSheet(false);
    // Multi-part: Use follows the part that last had focus (disabled on a choice group).
    const kind = isMulti(q) ? partOf(q)(lastPart)?.answerType : q.answerType;
    const isDate = kind === 'date';
    const typed = isMulti(q) ? kind !== 'choice' && !isDate : q.answerType !== 'choice' && !isDate && !inBlocks(q);
    calc.setUseEnabled(on && typed && phase === 'answer',
      inBlocks(q) ? 'Use fills typed answers. For this question, arrange the blocks.'
        : inBuild(q) ? 'Use fills typed answers. For this question, place the blocks.'
        : isSegQ(q) ? 'Use fills typed answers. For this question, pick an option.'
        : isDate ? 'Use fills number answers. For this question, type a date.'
        : !typed ? 'Use fills typed answers. For this question, pick one of the choices.'
        : phase !== 'answer' ? 'Use fills the answer on the next question.' : '');
  }

  function calcButton(q) {
    if (!calcAllowed(q)) return '';
    return `<button type="button" class="btn calc-open-btn" data-calc-open aria-controls="calc-panel" aria-expanded="${sheetOpen ? 'true' : 'false'}">${icon('calculator')}<span>Calculator</span></button>`;
  }

  function onMedia() {
    if (isDesktop()) setSheet(false);
  }
  mq?.addEventListener?.('change', onMedia);
  ctx.onCleanup(() => { mq?.removeEventListener?.('change', onMedia); teardownCalc(); });

  async function start() {
    // Only the very first run after a page load (same address) may restore a saved sheet.
    const restore = restoreOnBoot && location.hash === BOOT_HASH;
    restoreOnBoot = false;
    teardownCalc({ forget: !restore });
    phase = 'loading';
    root.innerHTML = `<div class="page-narrow quiz-page">${opts.crumbs}<div class="card"><p class="muted">${icon('loader')} Building quiz…</p></div></div>`;
    icons();
    let built;
    try {
      built = await opts.build();
    } catch (e) {
      console.error(e);
      if (ctx.alive()) {
        root.innerHTML = opts.buildError ? opts.buildError(e) : errorBox('Could not build quiz', e.message || String(e));
        icons();
      }
      return;
    }
    if (!ctx.alive()) return;
    questions = built;
    idx = 0;
    results = [];
    gResults = [];
    mountShell(restore);
    showQuestion();
  }

  // Running score = sum of credits (multi-part questions can earn part of a point).
  const correctCount = () => fmtScore(results.reduce((s, r) => s + r.credit, 0));
  const progressText = () => guided
    ? `Question ${Math.min(idx + 1, questions.length)} of ${questions.length}, guided, not scored`
    : `Question ${Math.min(idx + 1, questions.length)} of ${questions.length}, ${correctCount()} correct`;

  // Segmented progress: one segment per question, coloured correct / wrong / current.
  // Guided: neutral "done" segments (nothing is scored).
  function header() {
    const n = questions.length;
    const segs = questions.map((_, i) => {
      const cls = guided
        ? (i < gResults.length ? 'is-done' : (i === idx ? 'is-current' : ''))
        : i < results.length ? SEG_CLASS[resultState(results[i])] : (i === idx ? 'is-current' : '');
      return `<span class="${cls}"></span>`;
    }).join('');
    const pill = guided
      ? `<span class="quiz-score guided-pill">${icon('compass')}<span>Guided · not scored</span></span>`
      : `<span class="quiz-score">${icon('circle-check')}<span><span id="quiz-correct">${correctCount()}</span> correct</span></span>`;
    return `${opts.crumbs}
      <div class="quiz-top">
        <div class="quiz-bar">
          <a class="quiz-quit" href="${opts.backHref}" aria-label="Quit quiz">${icon('x')}<span class="quiz-quit-label">Quit</span></a>
          <div class="quiz-heading">
            <h1 class="quiz-title">${opts.title}</h1>
            <p class="quiz-meta">Question <strong>${Math.min(idx + 1, n)}</strong> of ${n}</p>
          </div>
          ${pill}
        </div>
        <div class="seg-progress ${n > 20 ? 'is-dense' : ''}" id="seg-progress" role="progressbar" aria-label="Quiz progress"
          aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${idx}" aria-valuetext="${esc(progressText())}">${segs}</div>
      </div>`;
  }

  // ---- multi-part questions (answerType "multi") ----
  // One stacked field per part: a text/number input, or a choice button group that only selects.
  // Part ids match ^[a-z0-9-]+$ (checked by the engine), so they are safe inside ids/attributes.
  const isMulti = q => q?.answerType === 'multi';
  let lastPart = null; // part id that last had focus (the calculator's Use fills it)

  // Guided: a part's own hint (button + aria-live box under the part).
  function partHintHtml(p) {
    if (!guided || typeof p.hint !== 'string' || !p.hint) return '';
    return `<div class="part-hint-row">
        <button type="button" class="btn btn-soft part-hint-btn" data-part-hint="${esc(p.id)}" aria-controls="part-${esc(p.id)}-hint">${icon('lightbulb')}<span>Hint for this part</span></button>
      </div>
      <div class="part-hint-box" id="part-${esc(p.id)}-hint" aria-live="polite"></div>`;
  }

  function partHtml(p, i, n) {
    const last = i === n - 1;
    const head = `<p class="part-head"><span class="part-num" aria-hidden="true">${i + 1}</span><span class="part-label${String(p.label).trim().length <= 3 ? ' keep-case' : ''}">${esc(p.label)}</span></p>`;
    if (p.answerType === 'choice') {
      return `<div class="part" data-part="${esc(p.id)}">
        ${head}
        <p class="part-ask" id="part-${esc(p.id)}-ask">${renderInline(p.ask || p.label)}</p>
        ${isSeg(p)
          ? `<div class="choices part-choices ${segClass(p)}" role="group" aria-labelledby="part-${esc(p.id)}-ask" data-part="${esc(p.id)}">${segHeadHtml(p)}${(p.choices || []).map((c, j) =>
            `<button type="button" class="btn choice part-choice seg-choice" data-part="${esc(p.id)}" data-i="${j}" aria-pressed="false"><span class="choice-key seg-tick" aria-hidden="true"></span>${segCellsHtml(p, j)}<span class="choice-mark"></span></button>`).join('')}</div>`
          : `<div class="choices part-choices" role="group" aria-labelledby="part-${esc(p.id)}-ask" data-part="${esc(p.id)}">${(p.choices || []).map((c, j) =>
            `<button type="button" class="btn choice part-choice" data-part="${esc(p.id)}" data-i="${j}" aria-pressed="false"><span class="choice-text">${renderInline(c)}</span><span class="choice-mark"></span></button>`).join('')}</div>`}
        ${partHintHtml(p)}
      </div>`;
    }
    const num = p.answerType === 'number';
    const date = p.answerType === 'date';
    return `<div class="part" data-part="${esc(p.id)}">
      ${head}
      <label class="part-ask" for="part-${esc(p.id)}">${renderInline(p.ask || p.label)}</label>
      <input id="part-${esc(p.id)}" class="answer-input part-input${date ? ' date-input' : ''}" data-part="${esc(p.id)}" type="text" ${num ? 'inputmode="decimal"' : date ? 'inputmode="text"' : ''}
        enterkeyhint="${last ? 'go' : 'next'}" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${num ? 'Type a number' : date ? datePlaceholder(p.precision) : 'Type your answer'}"${caseDescribed(p.answerType === 'text' ? p : null, `part-${p.id}-case`, date ? `part-${p.id}-readas` : '')}>
      ${date ? readAsHtml(`part-${esc(p.id)}-readas`, p.precision) : ''}
      ${p.answerType === 'text' ? caseNoteHtml(p, `part-${p.id}-case`) : ''}
      ${partHintHtml(p)}
    </div>`;
  }

  const partOf = q => id => (q.parts || []).find(p => p.id === id) || null;
  const partEl = id => root.querySelector(`.part[data-part="${CSS.escape(id)}"]`);

  // { [partId]: string } from the current fields ('' when empty / not chosen).
  function readParts(q) {
    const out = {};
    for (const p of q.parts || []) {
      const el = partEl(p.id);
      if (p.answerType === 'choice') {
        const b = el?.querySelector('.part-choice[aria-pressed="true"]');
        out[p.id] = b ? String(p.choices[+b.dataset.i]) : '';
      } else {
        out[p.id] = el?.querySelector('.part-input')?.value ?? '';
      }
    }
    return out;
  }
  const isFilled = v => String(v ?? '').trim() !== '';
  // A part is ready for Check once it has a value (date parts: a value that reads as a date).
  const partReady = (p, v) => (p?.answerType === 'date' ? !!parseDate(v) : isFilled(v));
  const partsReady = (q, vals) => (q.parts || []).every(p => partReady(p, vals?.[p.id]));
  const allFilled = q => partsReady(q, readParts(q));

  // `reveal`: also scroll the part to the middle, so the phone's sticky action bar can't hide it.
  function focusPart(id, reveal = false) {
    const el = id && partEl(id);
    if (!el) return false;
    const target = el.querySelector('.part-input:not(:disabled)')
      || el.querySelector('.part-choice[aria-pressed="true"]:not(:disabled)')
      || el.querySelector('.part-choice:not(:disabled)');
    if (!target) return false;
    target.focus({ preventScroll: reveal });
    if (reveal) el.scrollIntoView({ block: 'center' });
    return true;
  }

  function updateCheck(q) {
    const btn = root.querySelector('#check');
    if (btn) btn.disabled = phase !== 'answer' || !allFilled(q);
  }

  // Remember which part was used last, and enable/disable the calculator's Use to match.
  function setLastPart(id) {
    if (!id || id === lastPart) return;
    lastPart = id;
    applyCalc(questions[idx]);
  }

  // Enter in a multi-part question: go to the next empty part (after this one, wrapping);
  // once every part has a value, submit.
  function enterMulti(q, fromId) {
    const vals = readParts(q);
    const ids = (q.parts || []).map(p => p.id);
    const start = Math.max(0, ids.indexOf(fromId));
    const ready = id => partReady(partOf(q)(id), vals[id]);
    for (let k = 1; k <= ids.length; k++) {
      const id = ids[(start + k) % ids.length];
      if (!ready(id)) { focusPart(id, true); return; }
    }
    if (!ready(fromId)) { focusPart(fromId, true); return; }
    submit(vals);
  }

  function bindMulti(q) {
    const form = root.querySelector('#answer-form');
    if (!form) return;
    lastPart = q.parts?.[0]?.id ?? null;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (allFilled(q)) submit(readParts(q));
      else enterMulti(q, lastPart);
    });
    form.addEventListener('input', e => {
      const id = e.target.closest?.('.part')?.dataset.part;
      const p = id ? partOf(q)(id) : null;
      if (p?.answerType === 'date') updateReadAs(root.querySelector(`#part-${CSS.escape(id)}-readas`), e.target.value, p.precision);
      updateCheck(q);
    });
    const track = e => { const id = e.target.closest?.('[data-part]')?.dataset.part; if (id) setLastPart(id); };
    form.addEventListener('focusin', track);
    form.addEventListener('pointerdown', track); // Safari doesn't focus buttons on click
    form.querySelectorAll('.part-choice').forEach(b => b.addEventListener('click', () => {
      if (phase !== 'answer') return;
      const group = b.closest('.part-choices');
      group.querySelectorAll('.part-choice').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      setLastPart(b.dataset.part);
      updateCheck(q);
    }));
    updateCheck(q);
    focusPart(lastPart);
  }

  // ---- drag-the-blocks questions (answerType "tiles", and the Blocks side of dual questions) ----
  // A bank of tile buttons and an answer row. Tap (or Enter/Space) moves a tile between them;
  // Pointer Events drag places, reorders and returns tiles (mouse and touch, no HTML5 DnD);
  // Alt/Shift+←/→ moves a placed tile within its row or slot; Delete/Backspace returns it.
  // Nested blocks: a tile with `slot` shows an inner drop zone once placed. The "active target"
  // (answer row, or the slot of the placed slot tile last tapped / Entered) receives tapped bank
  // blocks; Esc makes the answer row active again. Returning a slot tile returns its kids too.
  // The answer is the serialised tree (serialiseTree in engine.js).
  const isTiles = q => q?.answerType === 'tiles';
  // Dual Type | Blocks question: a text question carrying a `blocks` alternative.
  const isDual = q => q?.answerType === 'text' && !!q.blocks && Array.isArray(q.blocks.tiles) && q.blocks.tiles.length >= 2;
  let answerMode = 'type'; // dual questions: 'type' | 'blocks' (per question, remembered per module)
  const inBlocks = q => isTiles(q) || (isDual(q) && answerMode === 'blocks');
  const modeFor = q => (isSegQ(q) ? segMode : isDual(q) && answerMode === 'blocks' ? 'blocks' : 'type');
  const DRAG_THRESHOLD = 6;
  const TILES_FILTER_MIN = 10; // more blocks than this in the bank shows "Filter blocks"
  let ts = null; // { spec, tree: [{ t, kids? }], active: tile index | null, locked, drag, pointerAt }

  const tileText = t => (t.value !== t.label ? `${t.value}: ${t.label}` : t.label);
  function tileInner(t) {
    const badge = t.value !== t.label && !t.slot ? `<span class="tile-key">${esc(t.value)}</span>` : '';
    return `${badge}<span class="tile-label">${renderInline(t.label)}</span>`;
  }

  // ---- tree helpers (ts.tree) ----
  function findNode(t, list = ts.tree, parent = null) {
    for (let k = 0; k < list.length; k++) {
      const n = list[k];
      if (n.t === t) return { list, k, node: n, parent };
      if (n.kids) { const r = findNode(t, n.kids, n); if (r) return r; }
    }
    return null;
  }
  const placedSet = () => {
    const s = new Set();
    const walk = l => l.forEach(n => { s.add(n.t); if (n.kids) walk(n.kids); });
    if (ts) walk(ts.tree);
    return s;
  };
  // The list a target names: null = the answer row, a tile index = that placed tile's slot.
  const listOf = target => (target === null ? ts.tree : findNode(target)?.node.kids ?? null);
  // How many slots enclose the items of a target list.
  function depthOf(target) {
    let d = 0;
    let f = target === null ? null : findNode(target);
    while (f) { d++; f = f.parent ? findNode(f.parent.t) : null; }
    return d;
  }
  // Slots a subtree adds: a plain tile 0, a slot tile 1 + its deepest kid.
  const height = n => (n.kids ? 1 + n.kids.reduce((m, k) => Math.max(m, height(k)), 0) : 0);
  const cloneTree = nodes => (nodes || []).map(n => (n.kids ? { t: n.t, kids: cloneTree(n.kids) } : { t: n.t }));
  const treeCount = nodes => (nodes || []).reduce((c, n) => c + 1 + treeCount(n.kids), 0);
  const tileName = t => tileText(ts.spec.tiles[t]);
  const targetName = target => (target === null ? 'your answer' : tileName(target));

  const tilesReady = () => !!ts && !ts.locked && phase === 'answer'
    && (ts.spec.useAll ? placedSet().size === ts.spec.tiles.length : ts.tree.length >= 1);
  const tilesValue = () => serialiseTree(ts.tree, ts.spec.tiles, ts.spec.joiner);
  const canAct = () => !!ts && !ts.locked && phase === 'answer';

  // The inner markup of a blocks answer (shared by tiles questions and the Blocks side of dual ones).
  function tilesBody(spec, describedBy = '') {
    const nested = spec.tiles.some(t => t.slot);
    const rule = spec.useAll ? 'Use every block.' : 'You may not need every block.';
    const slotHelp = nested ? ' Tap a placed block with brackets to fill it (it gets an outline), tap it again to send it back; <kbd>Esc</kbd> goes back to the answer row.' : '';
    return `<div class="tiles-head">
          <p class="field-label" id="tiles-answer-label">Your answer</p>
          <button type="button" class="btn btn-small tiles-reset" id="tiles-reset" disabled>${icon('rotate-ccw')}<span>Reset</span></button>
        </div>
        <div class="tiles-row tiles-answer" id="tiles-answer" role="group" aria-labelledby="tiles-answer-label" aria-describedby="tiles-help${describedBy ? ` ${esc(describedBy)}` : ''}"
          data-placeholder="Drag or tap blocks here"></div>
        <p class="field-label tiles-bank-label" id="tiles-bank-label">Blocks</p>
        ${spec.tiles.length > TILES_FILTER_MIN ? `<div class="tiles-filter" id="tiles-filter-wrap" hidden>${icon('search')}
          <input type="text" class="tiles-filter-input" id="tiles-filter" placeholder="Filter blocks" aria-label="Filter blocks"
            aria-controls="tiles-bank" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></div>` : ''}
        <div class="tiles-row tiles-bank" id="tiles-bank" role="group" aria-labelledby="tiles-bank-label" aria-describedby="tiles-help"></div>
        <p class="tiles-help muted" id="tiles-help">${esc(rule)} Tap a block to place it, tap it again to send it back.${slotHelp}<span class="desktop-only"> <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> moves a placed block.</span></p>
        <p class="sr-only" id="tiles-status" aria-live="polite"></p>`;
  }

  function tilesHtml(q) {
    return `<form class="answer-form tiles-form" id="answer-form" autocomplete="off" novalidate>${caseNoteHtml(q, 'answer-case')}${tilesBody(q, q.caseSensitive === true ? 'answer-case' : '')}</form>`;
  }

  // `caseSensitive: true` (text / tiles answers): a visible warning near the answer, which the
  // answer field also names with aria-describedby. '' when the question (or part) isn't case-sensitive.
  function caseNoteHtml(owner, id) {
    if (owner?.caseSensitive !== true) return '';
    return `<p class="case-note" id="${esc(id)}">${icon('triangle-alert')}<span>Case-sensitive: capital letters matter</span></p>`;
  }
  const caseDescribed = (owner, id, others = '') => {
    const ids = [others, owner?.caseSensitive === true ? id : ''].filter(Boolean).join(' ');
    return ids ? ` aria-describedby="${esc(ids)}"` : '';
  };

  function tileButton(i, pos, n) {
    const t = ts.spec.tiles[i];
    const where = pos === null ? '' : `<span class="sr-only">, position ${pos + 1} of ${n}</span>`;
    return `<button type="button" class="tile" data-t="${i}"${ts.locked ? ' disabled' : ''}>${tileInner(t)}${where}</button>`;
  }

  // The slot's separator between kids, shown as text (e.g. the comma in "title, rating").
  const sepHtml = t => (t.slot.sep.trim() ? `<span class="tile-sep" aria-hidden="true">${esc(t.slot.sep.trim())}</span>` : '');

  // A placed tile: a plain button, or a slot tile's group (head button, inner zone, closing text).
  function nodeHtml(n, pos, count) {
    const t = ts.spec.tiles[n.t];
    if (!t.slot) return tileButton(n.t, pos, count);
    const active = ts.active === n.t && !ts.locked;
    const kids = (n.kids || []).map((k, j) => nodeHtml(k, j, n.kids.length)).join(sepHtml(t));
    const state = n.kids.length ? `holds ${n.kids.length} ${n.kids.length === 1 ? 'block' : 'blocks'}` : 'empty';
    return `<span class="tile-wrap${active ? ' is-active' : ''}" data-w="${n.t}">
        <button type="button" class="tile tile-head" data-t="${n.t}"${ts.locked ? ' disabled' : ''}><span class="tile-label">${esc(t.value + t.slot.open)}</span><span class="sr-only">, ${esc(t.label)}, ${state}${active ? ', filling' : ''}, position ${pos + 1} of ${count}</span></button>
        <span class="tile-slot${n.kids.length ? '' : ' is-empty'}" data-slot="${n.t}" role="group" aria-label="Inside ${esc(t.label)}">${kids}</span>
        <span class="tile-close" aria-hidden="true">${esc(t.slot.close)}</span>
      </span>`;
  }

  // Redraw both rows from `ts.tree`. `focus`: { t, where: 'answer'|'bank' } or a fallback slot.
  function renderTiles(focus) {
    const ans = root.querySelector('#tiles-answer');
    const bank = root.querySelector('#tiles-bank');
    if (!ts || !ans || !bank) return;
    const n = ts.tree.length;
    ans.innerHTML = ts.tree.map((node, k) => nodeHtml(node, k, n)).join('');
    const placed = placedSet();
    const unplaced = ts.spec.tiles.map((_, i) => i).filter(i => !placed.has(i));
    bank.innerHTML = unplaced.map(i => tileButton(i, null, 0)).join('');
    ans.classList.toggle('is-empty', n === 0);
    ans.classList.toggle('is-target', ts.active === null && ts.spec.tiles.some(t => t.slot) && !ts.locked);
    bank.classList.toggle('is-empty', unplaced.length === 0);
    applyTileFilter(unplaced.length);
    const reset = root.querySelector('#tiles-reset');
    if (reset) {
      if (reset === document.activeElement && (n === 0 || ts.locked)) bank.querySelector('.tile')?.focus();
      reset.disabled = n === 0 || ts.locked;
    }
    const check = root.querySelector('#check');
    if (check && inBlocks(questions[idx])) check.disabled = !tilesReady();
    if (focus) {
      const row = focus.where === 'answer' ? ans : bank;
      const vis = [...row.querySelectorAll('.tile:not([hidden])')];
      const el = row.querySelector(`.tile[data-t="${focus.t}"]:not([hidden])`)
        || vis[Math.min(focus.slot ?? 0, vis.length - 1)]
        || ans.querySelector('.tile:last-child') || bank.querySelector('.tile:not([hidden])');
      el?.focus({ preventScroll: true });
    }
  }

  // "Filter blocks": shown while the bank holds more than TILES_FILTER_MIN blocks. Case-insensitive
  // substring match on label and value; hides non-matching bank blocks only (never placed ones).
  function applyTileFilter(bankCount = root.querySelectorAll('#tiles-bank .tile').length) {
    const wrap = root.querySelector('#tiles-filter-wrap');
    const input = root.querySelector('#tiles-filter');
    if (!wrap || !input || !ts) return;
    const show = bankCount > TILES_FILTER_MIN && !ts.locked;
    if (!show && input.value) input.value = '';
    if (!show && document.activeElement === input) root.querySelector('#tiles-bank .tile')?.focus();
    wrap.hidden = !show;
    const needle = input.value.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll('#tiles-bank .tile').forEach(b => {
      const t = ts.spec.tiles[+b.dataset.t];
      const hit = !needle || t.label.toLowerCase().includes(needle) || t.value.toLowerCase().includes(needle);
      b.hidden = !hit;
      if (hit) shown++;
    });
    root.querySelector('#tiles-bank')?.classList.toggle('is-filtered-empty', !!needle && shown === 0);
  }

  function tilesAnnounce(msg) {
    const s = root.querySelector('#tiles-status');
    if (s) s.textContent = msg;
  }

  // Any change clears a guided "wrong" mark.
  function tilesChanged() {
    root.querySelector('#tiles-answer')?.classList.remove('is-wrong');
  }

  // Makes a placed slot tile's slot (or the answer row, null) the target for tapped bank blocks.
  function setActive(target, announce = true) {
    if (!canAct()) return;
    if (target !== null && !(ts.spec.tiles[target]?.slot && findNode(target))) target = null;
    if (ts.active === target) return;
    ts.active = target;
    renderTiles(target === null ? null : { t: target, where: 'answer' });
    if (announce) {
      tilesAnnounce(target === null ? 'Blocks now go into your answer'
        : `Filling ${tileName(target)}. Tapped blocks go inside it; Escape goes back to the answer row.`);
    }
  }

  // Is tile `inner` somewhere inside placed tile `outer`'s slot?
  function isInside(inner, outer) {
    const f = findNode(outer);
    if (!f?.node.kids) return false;
    const search = l => l.some(n => n.t === inner || (n.kids && search(n.kids)));
    return search(f.node.kids);
  }

  // Places tile `t` (from the bank, or moved with its kids) into `target` at `at` (counted without t).
  function placeTile(t, target = ts?.active ?? null, at = Infinity, focusWhere = null) {
    if (!canAct()) return;
    if (target !== null && (target === t || isInside(target, t) || !findNode(target))) target = null;
    const found = findNode(t);
    const node = found ? found.node : (ts.spec.tiles[t].slot ? { t, kids: [] } : { t });
    if (depthOf(target) + height(node) > SLOT_DEPTH_MAX) { tilesAnnounce(`${tileName(t)} can't go that deep`); return; }
    const bankSlot = found ? 0 : ts.spec.tiles.map((_, k) => k).filter(k => !placedSet().has(k)).indexOf(t);
    if (found) found.list.splice(found.k, 1);
    const list = listOf(target) || ts.tree;
    const pos = Math.max(0, Math.min(at, list.length));
    list.splice(pos, 0, node);
    tilesChanged();
    // Tapping from the bank keeps focus in the bank (next block), so blocks can be placed in turn.
    const stayInBank = focusWhere === 'bank' && placedSet().size < ts.spec.tiles.length;
    renderTiles(stayInBank ? { where: 'bank', slot: bankSlot } : (focusWhere ? { t, where: 'answer' } : null));
    tilesAnnounce(`Placed ${tileName(t)} in ${targetName(target)}, position ${pos + 1} of ${list.length}`);
  }

  function returnTile(t, focusWhere = null) {
    if (!canAct()) return;
    const f = findNode(t);
    if (!f) return;
    f.list.splice(f.k, 1);
    const kids = treeCount(f.node.kids);
    if (ts.active !== null && !findNode(ts.active)) ts.active = null;
    tilesChanged();
    const flatIdx = f.k;
    renderTiles(focusWhere ? (ts.tree.length ? { where: 'answer', slot: flatIdx } : { t, where: 'bank' }) : null);
    tilesAnnounce(`Returned ${tileName(t)}${kids ? ` and the ${kids === 1 ? 'block' : `${kids} blocks`} inside it` : ''}`);
  }

  function resetTiles() {
    if (!canAct() || !ts.tree.length) return;
    ts.tree = [];
    ts.active = null;
    tilesChanged();
    renderTiles({ where: 'bank', slot: 0 });
    tilesAnnounce('All blocks returned');
  }

  function lockTiles() {
    if (!ts) return;
    ts.locked = true;
    cancelDrag();
    root.querySelectorAll('.tiles-form .tile, #tiles-reset').forEach(el => { el.disabled = true; });
    root.querySelector('.tiles-form')?.classList.add('is-locked');
    root.querySelectorAll('.tile-wrap.is-active').forEach(el => el.classList.remove('is-active'));
    root.querySelector('#tiles-answer')?.classList.remove('is-target');
    applyTileFilter();
  }

  // Flat tile indices that spell the answer (values joined by the joiner, longest value first at each
  // step), or null when the answer can't be mapped onto the tiles. For specs without a solution.
  function solutionOrder(spec, answer) {
    const used = new Set();
    const out = [];
    let rest = String(answer ?? '');
    while (rest.length) {
      let hit = -1;
      spec.tiles.forEach((t, i) => {
        if (!used.has(i) && !t.slot && (rest === t.value || rest.startsWith(t.value + spec.joiner))
          && (hit < 0 || t.value.length > spec.tiles[hit].value.length)) hit = i;
      });
      if (hit < 0) return null;
      used.add(hit);
      out.push(hit);
      rest = rest === spec.tiles[hit].value ? '' : rest.slice(spec.tiles[hit].value.length + spec.joiner.length);
    }
    return out.length ? out : null;
  }
  // The correct tree: the spec's own solution, else the flat order worked out from the answer.
  function solutionTree(spec, answer) {
    if (Array.isArray(spec?.solution) && spec.solution.length) return cloneTree(spec.solution);
    const order = spec ? solutionOrder(spec, answer) : null;
    return order ? order.map(t => ({ t })) : null;
  }

  // Static (non-interactive) chips for the correct blocks, or '' if the answer can't be mapped.
  function tilesOrderHtml(spec, answer) {
    const tree = solutionTree(spec, answer);
    if (!tree) return '';
    const one = n => {
      const t = spec.tiles[n.t];
      if (!t.slot) return `<li class="tile is-static">${tileInner(t)}</li>`;
      return `<li class="tile-wrap is-static"><span class="tile tile-head is-static"><span class="tile-label">${esc(t.value + t.slot.open)}</span></span><ol class="tile-slot${n.kids.length ? '' : ' is-empty'}" aria-label="Inside ${esc(t.label)}">${n.kids.map(one).join(t.slot.sep.trim() ? `<li class="tile-sep" aria-hidden="true">${esc(t.slot.sep.trim())}</li>` : '')}</ol><span class="tile-close" aria-hidden="true">${esc(t.slot.close)}</span></li>`;
    };
    return `<ol class="tiles-row tiles-solution" aria-label="Correct blocks">${tree.map(one).join('')}</ol>`;
  }

  // Shows the correct blocks in the answer row itself (guided Show solution).
  function placeSolution(spec, answer) {
    const tree = solutionTree(spec, answer);
    if (!tree || !ts) return false;
    ts.tree = tree;
    ts.active = null;
    renderTiles();
    return true;
  }

  // ---- pointer dragging ----
  function cancelDrag() {
    const d = ts?.drag;
    if (!d) return;
    d.ghost?.remove();
    d.marker?.remove();
    d.visual?.classList.remove('is-drag-source');
    root.querySelectorAll('.tiles-row.is-over, .tile-slot.is-over').forEach(r => r.classList.remove('is-over'));
    document.body.classList.remove('tiles-dragging');
    ts.drag = null;
  }

  // Direct items (plain tiles and slot groups) of an answer-row or slot container.
  const itemsOf = (container, skipT) => [...container.children]
    .filter(el => (el.matches('.tile, .tile-wrap')) && Number(el.dataset.t ?? el.dataset.w) !== skipT);

  // Index in a container where a tile dropped at (x, y) would go, ignoring the dragged tile.
  function dropIndex(container, x, y, skipT) {
    const items = itemsOf(container, skipT);
    for (let k = 0; k < items.length; k++) {
      const r = items[k].getBoundingClientRect();
      if (y < r.top) return k;
      if (y <= r.bottom && x < r.left + r.width / 2) return k;
    }
    return items.length;
  }

  // Drop zone under (x, y): the deepest slot (never the dragged tile's own), else the answer row or bank.
  function zoneAt(x, y, dragT) {
    const inRect = (el, pad) => {
      const r = el.getBoundingClientRect();
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    };
    const slots = [...root.querySelectorAll('#tiles-answer .tile-slot')]
      .filter(el => !el.closest(`.tile-wrap[data-w="${dragT}"]`))
      .map(el => { let d = 0; for (let p = el.parentElement; p; p = p.parentElement) if (p.classList?.contains('tile-slot')) d++; return { el, d }; })
      .sort((a, b) => b.d - a.d);
    for (const { el } of slots) if (inRect(el, 2)) return { kind: 'slot', el, target: +el.dataset.slot };
    const pad = 12; // a little slack around each row
    const ans = root.querySelector('#tiles-answer');
    if (ans && inRect(ans, pad)) return { kind: 'answer', el: ans, target: null };
    const bank = root.querySelector('#tiles-bank');
    if (bank && inRect(bank, pad)) return { kind: 'bank', el: bank };
    return null;
  }

  function onTilePointerDown(e) {
    const b = e.target.closest?.('.tile');
    if (!b || b.disabled || b.classList.contains('is-static') || !canAct()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelDrag();
    const visual = b.classList.contains('tile-head') ? b.closest('.tile-wrap') : b;
    ts.drag = { id: e.pointerId, src: b, visual, t: +b.dataset.t, x0: e.clientX, y0: e.clientY, active: false, ghost: null, marker: null };
    try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function onTilePointerMove(e) {
    const d = ts?.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
      d.active = true;
      const r = d.visual.getBoundingClientRect();
      d.dx = d.x0 - r.left;
      d.dy = d.y0 - r.top;
      const g = d.visual.cloneNode(true);
      g.removeAttribute('data-t');
      g.removeAttribute('data-w');
      g.querySelectorAll('[data-t], [data-w], [data-slot]').forEach(el => { el.removeAttribute('data-t'); el.removeAttribute('data-w'); el.removeAttribute('data-slot'); });
      g.querySelectorAll('button').forEach(el => { el.tabIndex = -1; });
      g.classList.add('tile-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.tabIndex = -1;
      g.style.width = `${r.width}px`;
      g.style.height = `${r.height}px`;
      document.body.appendChild(g);
      d.ghost = g;
      d.visual.classList.add('is-drag-source');
      d.marker = document.createElement('span');
      d.marker.className = 'tile-marker';
      d.marker.setAttribute('aria-hidden', 'true');
      document.body.classList.add('tiles-dragging');
    }
    e.preventDefault();
    d.ghost.style.transform = `translate(${Math.round(e.clientX - d.dx)}px, ${Math.round(e.clientY - d.dy)}px)`;
    const zone = zoneAt(e.clientX, e.clientY, d.t);
    root.querySelectorAll('.tiles-row.is-over, .tile-slot.is-over').forEach(r => r.classList.remove('is-over'));
    if (zone && zone.kind !== 'bank') zone.el.classList.add('is-over');
    if (zone?.kind === 'bank' && placedSet().has(d.t)) zone.el.classList.add('is-over');
    if (zone && zone.kind !== 'bank') {
      const k = dropIndex(zone.el, e.clientX, e.clientY, d.t);
      const others = itemsOf(zone.el, d.t);
      if (k < others.length) zone.el.insertBefore(d.marker, others[k]); else zone.el.appendChild(d.marker);
    } else {
      d.marker.remove();
    }
  }

  function onTilePointerUp(e) {
    const d = ts?.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      // A tap. Handled here rather than in `click`: after a touch drag, Chrome's gesture detector
      // can swallow the next tap's click. The click that may still follow is ignored (onTileClick).
      ts.drag = null;
      ts.pointerAt = performance.now();
      activateTile(d.src);
      return;
    }
    // Work the drop out from the release point: pointermoves are coalesced per frame, so the last
    // one may not be where the pointer ended up.
    const zone = zoneAt(e.clientX, e.clientY, d.t);
    const t = d.t;
    d.marker?.remove();
    const at = zone && zone.kind !== 'bank' ? dropIndex(zone.el, e.clientX, e.clientY, t) : null;
    cancelDrag();
    ts.pointerAt = performance.now();
    if (zone && zone.kind !== 'bank' && at !== null) placeTile(t, zone.target, at);
    else if (zone?.kind === 'bank' && placedSet().has(t)) returnTile(t);
  }

  // Pointer taps and drops are handled on pointerup; a pointer click (detail > 0) right after one is
  // that same gesture. Keyboard and assistive-tech clicks (detail 0) always count.
  // A click on a slot's own area (not on a block) makes that slot active; on the bare answer row,
  // the answer row.
  function onTileClick(e) {
    if (!ts) return;
    const b = e.target.closest?.('.tile');
    if (!b) {
      if (!canAct()) return;
      const wrap = e.target.closest?.('#tiles-answer .tile-wrap');
      if (wrap) setActive(+wrap.dataset.w);
      else if (e.target.closest?.('#tiles-answer')) setActive(null);
      return;
    }
    if (b.disabled || b.classList.contains('is-static')) return;
    if (e.detail > 0 && performance.now() - ts.pointerAt < 1000) { e.preventDefault(); return; }
    activateTile(b);
  }

  function activateTile(b) {
    if (!b || b.disabled || !canAct() || !b.isConnected) return;
    const t = +b.dataset.t;
    if (b.closest('#tiles-answer')) {
      // A placed slot tile: the first tap makes its slot active, the next one sends it back.
      if (ts.spec.tiles[t].slot && ts.active !== t) { setActive(t); return; }
      returnTile(t, 'answer');
    } else {
      placeTile(t, ts.active, Infinity, 'bank');
    }
  }

  function onTileKey(e) {
    if (!ts) return;
    if (e.key === 'Escape' && ts.active !== null && canAct()) {
      e.preventDefault();
      e.stopPropagation();
      setActive(null);
      root.querySelector('#tiles-answer .tile')?.focus({ preventScroll: true });
      return;
    }
    const b = e.target.closest?.('.tile');
    if (!b || b.disabled) return;
    const inAnswer = !!b.closest('#tiles-answer');
    const t = +b.dataset.t;
    if ((e.key === 'Delete' || e.key === 'Backspace') && inAnswer && canAct()) {
      e.preventDefault();
      returnTile(t, 'answer');
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    if ((e.altKey || e.shiftKey) && inAnswer) {
      e.preventDefault();
      if (!canAct()) return;
      const f = findNode(t);
      const to = f ? f.k + dir : -1;
      if (!f || to < 0 || to >= f.list.length) return;
      f.list.splice(f.k, 1);
      f.list.splice(to, 0, f.node);
      tilesChanged();
      renderTiles({ t, where: 'answer' });
      tilesAnnounce(`Moved ${tileName(t)}, position ${to + 1} of ${f.list.length}`);
    } else if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // Plain arrows move focus along the row (placed blocks in reading order, nested ones included).
      const row = [...b.closest('.tiles-row').querySelectorAll('.tile:not([hidden])')];
      const next = row[row.indexOf(b) + dir];
      if (next) { e.preventDefault(); next.focus(); }
    }
  }

  // Tile events on the element holding the answer row and bank (a form, or the Blocks side of a dual form).
  function bindTileEvents(box) {
    box.addEventListener('click', onTileClick);
    box.addEventListener('keydown', onTileKey);
    box.addEventListener('pointerdown', onTilePointerDown);
    box.addEventListener('pointermove', onTilePointerMove);
    box.addEventListener('pointerup', onTilePointerUp);
    box.addEventListener('pointercancel', () => cancelDrag());
    box.addEventListener('lostpointercapture', e => { if (ts?.drag && ts.drag.id === e.pointerId && ts.drag.active) cancelDrag(); });
    root.querySelector('#tiles-reset')?.addEventListener('click', resetTiles);
    const filter = root.querySelector('#tiles-filter');
    filter?.addEventListener('input', () => applyTileFilter());
    filter?.addEventListener('keydown', e => {
      if (e.key === 'Escape' && filter.value) { e.preventDefault(); e.stopPropagation(); filter.value = ''; applyTileFilter(); }
    });
  }

  function bindTiles(q) {
    ts = { spec: q, tree: [], active: null, locked: false, drag: null, pointerAt: -Infinity };
    const form = root.querySelector('#answer-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (tilesReady()) submit(tilesValue());
    });
    bindTileEvents(form);
    renderTiles({ where: 'bank', slot: 0 });
  }

  // ---- dual questions: Type | Blocks switch (remembered per module in this tab) ----
  const ANSWER_MODE_KEY = 'studyblock:answerMode';
  const modeModule = q => String(q?.srcModule ?? q?.module ?? opts.moduleId ?? '');
  function savedAnswerMode(q) {
    try {
      const m = JSON.parse(sessionStorage.getItem(ANSWER_MODE_KEY) || '{}');
      return m && m[modeModule(q)] === 'blocks' ? 'blocks' : 'type';
    } catch { return 'type'; }
  }
  function saveAnswerMode(q, mode) {
    try {
      const raw = JSON.parse(sessionStorage.getItem(ANSWER_MODE_KEY) || '{}');
      const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      m[modeModule(q)] = mode;
      sessionStorage.setItem(ANSWER_MODE_KEY, JSON.stringify(m));
    } catch { /* ignore */ }
  }
  const multiplierOf = q => (typeof q?.blocks?.multiplier === 'number' ? q.blocks.multiplier : 1);
  const pctText = f => `${Math.round(f * 100)}%`;
  const multText = m => `×${Number(m.toFixed(2))}`;

  function dualHtml(q) {
    const m = multiplierOf(q);
    const level = q.difficulty && q.difficulty !== ALL ? difficultyLabel(q.difficulty) : (opts.difficulty && opts.difficulty !== ALL ? difficultyLabel(opts.difficulty) : '');
    const note = !guided && m < 1
      ? `<p class="answer-mode-note" id="answer-mode-note" hidden>${icon('info')}<span>Blocks: up to ${pctText(m)} credit${level ? ` at ${esc(level)}` : ''}</span></p>` : '';
    return `<form class="answer-form dual-form" id="answer-form" autocomplete="off" novalidate>
        <div class="answer-mode" role="group" aria-label="Answer by">
          <button type="button" class="answer-mode-btn" data-mode="type" aria-pressed="true">${icon('keyboard')}<span>Type</span></button>
          <button type="button" class="answer-mode-btn" data-mode="blocks" aria-pressed="false">${icon('blocks')}<span>Blocks</span></button>
        </div>
        ${note}
        ${caseNoteHtml(q, 'answer-case')}
        <div class="dual-type" id="dual-type">
          <label class="field-label" for="answer">Your answer</label>
          <input id="answer" class="answer-input" type="text" enterkeyhint="go" autocapitalize="off" autocorrect="off"
            placeholder="Type your answer" spellcheck="false"${caseDescribed(q, 'answer-case')}>
        </div>
        <div class="dual-blocks tiles-form" id="dual-blocks" hidden>${tilesBody(q.blocks, q.caseSensitive === true ? 'answer-case' : '')}</div>
      </form>`;
  }

  function setAnswerMode(q, mode, { focus = false, remember = true } = {}) {
    if (!isDual(q)) return;
    answerMode = mode === 'blocks' ? 'blocks' : 'type';
    if (remember) saveAnswerMode(q, answerMode);
    const blocks = answerMode === 'blocks';
    root.querySelectorAll('.answer-mode-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === answerMode ? 'true' : 'false'));
    const typeBox = root.querySelector('#dual-type');
    const blockBox = root.querySelector('#dual-blocks');
    if (typeBox) typeBox.hidden = blocks;
    if (blockBox) blockBox.hidden = !blocks;
    const note = root.querySelector('#answer-mode-note');
    if (note) note.hidden = !blocks;
    const check = root.querySelector('#check');
    if (check && phase === 'answer') check.disabled = blocks ? !tilesReady() : false;
    const hint = root.querySelector('#action-hint-key');
    if (hint) hint.innerHTML = blocks ? 'Press <kbd>Enter</kbd> on a block to place it' : 'Press <kbd>Enter</kbd> to check';
    applyCalc(q);
    if (focus) {
      if (blocks) root.querySelector('#tiles-bank .tile:not([hidden])')?.focus();
      else root.querySelector('#answer')?.focus();
    }
  }

  function bindDual(q) {
    ts = { spec: q.blocks, tree: [], active: null, locked: false, drag: null, pointerAt: -Infinity };
    const form = root.querySelector('#answer-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (answerMode === 'blocks') { if (tilesReady()) submit(tilesValue()); } else submit(root.querySelector('#answer')?.value);
    });
    form.querySelectorAll('.answer-mode-btn').forEach(b => b.addEventListener('click', () => {
      if (phase !== 'answer') return;
      setAnswerMode(q, b.dataset.mode, { focus: false });
    }));
    const box = root.querySelector('#dual-blocks');
    if (box) bindTileEvents(box);
    renderTiles();
    setAnswerMode(q, savedAnswerMode(q), { remember: false });
    if (answerMode === 'blocks') root.querySelector('#tiles-bank .tile')?.focus();
    else root.querySelector('#answer')?.focus();
  }

  // ---- segmented choices: Build | Choose switch (remembered per module in this tab) ----
  // Build (default): one block per column from a bank (column-tagged blocks; order never matters;
  // a second block in a column replaces the first). Full credit. Choose: pick one of the options,
  // credit × the question's chooseMultiplier. The built answer is the column values joined by " | ",
  // the same string as the matching option.
  const isSegQ = q => q?.answerType === 'choice' && isSeg(q) && Array.isArray(q.segBank) && q.segBank.length >= 2;
  let segMode = 'build';
  const inBuild = q => isSegQ(q) && segMode === 'build';
  let sb = null; // { q, cols, bank: [{ col, value }], placed: [bank index | null], locked, drag, pointerAt }

  function savedSegMode(q) {
    try {
      const m = JSON.parse(sessionStorage.getItem(ANSWER_MODE_KEY) || '{}');
      return m && m[modeModule(q)] === 'choose' ? 'choose' : 'build';
    } catch { return 'build'; }
  }

  function segDualHtml(q) {
    const m = typeof q.chooseMultiplier === 'number' ? q.chooseMultiplier : 1;
    const level = q.difficulty && q.difficulty !== ALL ? difficultyLabel(q.difficulty) : (opts.difficulty && opts.difficulty !== ALL ? difficultyLabel(opts.difficulty) : '');
    const note = !guided && m < 1
      ? `<p class="answer-mode-note" id="answer-mode-note" hidden>${icon('info')}<span>Choose: up to ${pctText(m)} credit${level ? ` at ${esc(level)}` : ''}</span></p>` : '';
    const cols = cleanChoiceCols(q.choiceCols);
    return `<form class="answer-form dual-form seg-form" id="answer-form" autocomplete="off" novalidate>
        <div class="answer-mode" role="group" aria-label="Answer by">
          <button type="button" class="answer-mode-btn" data-mode="build" aria-pressed="true">${icon('blocks')}<span>Build</span></button>
          <button type="button" class="answer-mode-btn" data-mode="choose" aria-pressed="false">${icon('list')}<span>Choose</span></button>
        </div>
        ${note}
        <div class="seg-build tiles-form" id="seg-build">
          <div class="tiles-head">
            <p class="field-label" id="segb-answer-label">Your answer</p>
            <button type="button" class="btn btn-small tiles-reset" id="segb-reset" disabled>${icon('rotate-ccw')}<span>Reset</span></button>
          </div>
          <div class="segb-slots segb-n${cols.length}" id="segb-slots" role="group" aria-labelledby="segb-answer-label" aria-describedby="segb-help"></div>
          <p class="field-label tiles-bank-label" id="segb-bank-label">Blocks</p>
          ${q.segBank.length > TILES_FILTER_MIN ? `<div class="tiles-filter" id="segb-filter-wrap" hidden>${icon('search')}
            <input type="text" class="tiles-filter-input" id="segb-filter" placeholder="Filter blocks" aria-label="Filter blocks"
              aria-controls="segb-bank" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></div>` : ''}
          <div class="tiles-row tiles-bank segb-bank" id="segb-bank" role="group" aria-labelledby="segb-bank-label" aria-describedby="segb-help"></div>
          <p class="tiles-help muted" id="segb-help">Place one block in each column; the order doesn't matter. Tap a block to place it, tap it again to send it back.</p>
          <p class="sr-only" id="segb-status" aria-live="polite"></p>
        </div>
        <div class="seg-choose" id="seg-choose" hidden>
          <div class="choices ${segClass(q)}">${segHeadHtml(q)}${(q.choices || []).map((c, i) =>
            `<button type="button" class="btn choice seg-choice" data-i="${i}"><span class="choice-key" aria-hidden="true">${i + 1}</span>${segCellsHtml(q, i)}<span class="choice-mark"></span></button>`).join('')}</div>
        </div>
      </form>`;
  }

  const segReady = () => !!sb && !sb.locked && phase === 'answer' && sb.placed.every(k => k !== null);
  const segValue = () => sb.placed.map(k => sb.bank[k].value).join(SEG_SEP);
  const segCanAct = () => !!sb && !sb.locked && phase === 'answer';
  const segName = k => `${sb.bank[k].value} (${sb.cols[sb.bank[k].col]})`;
  function segAnnounce(msg) { const s = root.querySelector('#segb-status'); if (s) s.textContent = msg; }

  // A block button. In a slot, the column caption is the slot's own label (screen-reader text only).
  function segTileHtml(k, inSlot) {
    const b = sb.bank[k];
    const cap = inSlot ? `<span class="sr-only">${esc(sb.cols[b.col])}: </span>` : `<span class="segb-cap">${esc(sb.cols[b.col])}<span class="sr-only">: </span></span>`;
    return `<button type="button" class="tile segb-tile" data-b="${k}"${sb.locked ? ' disabled' : ''}>${cap}<span class="tile-label">${renderInline(b.value)}</span>${inSlot ? '<span class="sr-only">, placed</span>' : ''}</button>`;
  }

  // Redraw the column slots and the bank. `focus`: { k, where: 'slots'|'bank' } or { where, slot } fallback.
  function renderSeg(focus) {
    const slots = root.querySelector('#segb-slots');
    const bank = root.querySelector('#segb-bank');
    if (!sb || !slots || !bank) return;
    slots.innerHTML = sb.cols.map((c, j) => {
      const k = sb.placed[j];
      return `<div class="segb-slot${k === null ? ' is-empty' : ''}" data-col="${j}"><span class="segb-col" aria-hidden="true">${esc(c)}</span>
        <span class="segb-hole">${k === null ? `<span class="segb-empty">Empty<span class="sr-only">: ${esc(c)}</span></span>` : segTileHtml(k, true)}</span><span class="segb-mark"></span></div>`;
    }).join('');
    const placed = new Set(sb.placed.filter(k => k !== null));
    const unplaced = sb.bank.map((_, k) => k).filter(k => !placed.has(k));
    bank.innerHTML = unplaced.map(k => segTileHtml(k, false)).join('');
    bank.classList.toggle('is-empty', unplaced.length === 0);
    applySegFilter(unplaced.length);
    const reset = root.querySelector('#segb-reset');
    if (reset) {
      if (reset === document.activeElement && (!placed.size || sb.locked)) bank.querySelector('.tile')?.focus();
      reset.disabled = !placed.size || sb.locked;
    }
    const check = root.querySelector('#check');
    if (check && segMode === 'build' && phase === 'answer') check.disabled = !segReady();
    if (focus) {
      const row = focus.where === 'slots' ? slots : bank;
      const vis = [...row.querySelectorAll('.tile:not([hidden])')];
      const el = (focus.k !== undefined ? row.querySelector(`.tile[data-b="${focus.k}"]:not([hidden])`) : null)
        || vis[Math.min(focus.slot ?? 0, vis.length - 1)] || bank.querySelector('.tile:not([hidden])') || slots.querySelector('.tile');
      el?.focus({ preventScroll: true });
    }
  }

  // "Filter blocks" while the bank holds more than TILES_FILTER_MIN blocks: value and column label.
  function applySegFilter(bankCount = root.querySelectorAll('#segb-bank .tile').length) {
    const wrap = root.querySelector('#segb-filter-wrap');
    const input = root.querySelector('#segb-filter');
    if (!wrap || !input || !sb) return;
    const show = bankCount > TILES_FILTER_MIN && !sb.locked;
    if (!show && input.value) input.value = '';
    if (!show && document.activeElement === input) root.querySelector('#segb-bank .tile')?.focus();
    wrap.hidden = !show;
    const needle = input.value.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll('#segb-bank .tile').forEach(el => {
      const b = sb.bank[+el.dataset.b];
      const hit = !needle || b.value.toLowerCase().includes(needle) || sb.cols[b.col].toLowerCase().includes(needle);
      el.hidden = !hit;
      if (hit) shown++;
    });
    root.querySelector('#segb-bank')?.classList.toggle('is-filtered-empty', !!needle && shown === 0);
  }

  function segChanged() { root.querySelector('#segb-slots')?.classList.remove('is-wrong'); }

  function segPlace(k, focusWhere = null) {
    if (!segCanAct() || sb.placed.includes(k)) return;
    const j = sb.bank[k].col;
    const prev = sb.placed[j];
    const bankSlot = sb.bank.map((_, i) => i).filter(i => !sb.placed.includes(i)).indexOf(k);
    sb.placed[j] = k;
    segChanged();
    const more = sb.placed.some(x => x === null);
    renderSeg(focusWhere === 'bank' && more ? { where: 'bank', slot: bankSlot } : focusWhere ? { k, where: 'slots' } : null);
    segAnnounce(`Placed ${segName(k)}${prev !== null ? `; ${sb.bank[prev].value} went back to the blocks` : ''}`);
  }

  function segReturn(k, focusWhere = null) {
    if (!segCanAct()) return;
    const j = sb.placed.indexOf(k);
    if (j < 0) return;
    sb.placed[j] = null;
    segChanged();
    renderSeg(focusWhere ? (sb.placed.some(x => x !== null) ? { where: 'slots', slot: 0 } : { k, where: 'bank' }) : null);
    segAnnounce(`Returned ${segName(k)}`);
  }

  function segReset() {
    if (!segCanAct() || sb.placed.every(k => k === null)) return;
    sb.placed = sb.cols.map(() => null);
    segChanged();
    renderSeg({ where: 'bank', slot: 0 });
    segAnnounce('All blocks returned');
  }

  function segToggle(el) {
    if (!el || el.disabled || !segCanAct() || !el.isConnected) return;
    const k = +el.dataset.b;
    if (el.closest('#segb-slots')) segReturn(k, 'slots'); else segPlace(k, 'bank');
  }

  function lockSeg() {
    if (!sb) return;
    sb.locked = true;
    cancelSegDrag();
    root.querySelectorAll('#seg-build .tile, #segb-reset').forEach(el => { el.disabled = true; });
    root.querySelector('#seg-build')?.classList.add('is-locked');
    applySegFilter();
  }

  // The answer's blocks, one per column (bank indices), or null.
  function segSolution() {
    const ans = splitSegs(String(sb?.q.answer ?? ''), sb?.cols);
    if (!ans) return null;
    const out = ans.map((v, j) => sb.bank.findIndex(b => b.col === j && b.value === v));
    return out.every(k => k >= 0) ? out : null;
  }

  // After grading (or Show solution): ✓/✗ per column, icon + screen-reader text.
  function markSegSlots(reveal = false) {
    const ans = splitSegs(String(sb?.q.answer ?? ''), sb?.cols);
    if (!ans) return;
    root.querySelectorAll('#segb-slots .segb-slot').forEach(el => {
      const j = +el.dataset.col;
      const k = sb.placed[j];
      const ok = k !== null && sb.bank[k].value === ans[j];
      el.classList.add(ok ? 'is-correct' : 'is-wrong');
      const m = el.querySelector('.segb-mark');
      if (m) m.innerHTML = `${icon(ok ? 'circle-check' : 'circle-x')}<span class="sr-only">${ok ? (reveal ? 'Correct block' : 'Correct') : 'Incorrect'}</span>`;
    });
    icons();
  }

  // ---- Build: pointer dragging (bank -> answer places, answer -> bank returns; taps toggle) ----
  function cancelSegDrag() {
    const d = sb?.drag;
    if (!d) return;
    d.ghost?.remove();
    d.src?.classList.remove('is-drag-source');
    root.querySelectorAll('#segb-slots.is-over, #segb-bank.is-over').forEach(r => r.classList.remove('is-over'));
    document.body.classList.remove('tiles-dragging');
    sb.drag = null;
  }
  function segZoneAt(x, y) {
    const hit = el => { if (!el) return false; const r = el.getBoundingClientRect(); return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12; };
    if (hit(root.querySelector('#segb-slots'))) return 'slots';
    if (hit(root.querySelector('#segb-bank'))) return 'bank';
    return null;
  }
  function onSegPointerDown(e) {
    const el = e.target.closest?.('.segb-tile');
    if (!el || el.disabled || !segCanAct()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelSegDrag();
    sb.drag = { id: e.pointerId, src: el, k: +el.dataset.b, x0: e.clientX, y0: e.clientY, active: false, ghost: null };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onSegPointerMove(e) {
    const d = sb?.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
      d.active = true;
      const r = d.src.getBoundingClientRect();
      d.dx = d.x0 - r.left;
      d.dy = d.y0 - r.top;
      const g = d.src.cloneNode(true);
      g.removeAttribute('data-b');
      g.classList.add('tile-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.tabIndex = -1;
      g.style.width = `${r.width}px`;
      g.style.height = `${r.height}px`;
      document.body.appendChild(g);
      d.ghost = g;
      d.src.classList.add('is-drag-source');
      document.body.classList.add('tiles-dragging');
    }
    e.preventDefault();
    d.ghost.style.transform = `translate(${Math.round(e.clientX - d.dx)}px, ${Math.round(e.clientY - d.dy)}px)`;
    const zone = segZoneAt(e.clientX, e.clientY);
    root.querySelectorAll('#segb-slots.is-over, #segb-bank.is-over').forEach(r => r.classList.remove('is-over'));
    if (zone) root.querySelector(zone === 'slots' ? '#segb-slots' : '#segb-bank')?.classList.add('is-over');
  }
  function onSegPointerUp(e) {
    const d = sb?.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      sb.drag = null;
      sb.pointerAt = performance.now();
      segToggle(d.src);
      return;
    }
    const zone = segZoneAt(e.clientX, e.clientY);
    const k = d.k;
    cancelSegDrag();
    sb.pointerAt = performance.now();
    const placed = sb.placed.includes(k);
    if (zone === 'slots' && !placed) segPlace(k);
    else if (zone === 'bank' && placed) segReturn(k);
  }
  function onSegClick(e) {
    const el = e.target.closest?.('.segb-tile');
    if (!el || el.disabled || !sb) return;
    if (e.detail > 0 && performance.now() - sb.pointerAt < 1000) { e.preventDefault(); return; }
    segToggle(el);
  }
  function onSegKey(e) {
    const el = e.target.closest?.('.segb-tile');
    if (!el || el.disabled || !sb) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && el.closest('#segb-slots')) { e.preventDefault(); segReturn(+el.dataset.b, 'slots'); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const row = [...el.closest('#segb-slots, #segb-bank').querySelectorAll('.tile:not([hidden])')];
      const next = row[row.indexOf(el) + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (next) { e.preventDefault(); next.focus(); }
    }
  }

  function segActionHint(q) {
    const hint = root.querySelector('#seg-action-hint');
    if (!hint) return;
    const n = Math.min((q.choices || []).length, 9);
    hint.classList.toggle('desktop-only', segMode === 'build');
    hint.innerHTML = segMode === 'build'
      ? '<span class="action-hint-key">Press <kbd>Enter</kbd> on a block to place it</span>'
      : `<span class="action-hint-tap">Tap an answer</span><span class="action-hint-key">Press <kbd>1</kbd>${n > 1 ? `–<kbd>${n}</kbd>` : ''} to answer</span>`;
  }

  function setSegMode(q, mode, { remember = true } = {}) {
    if (!isSegQ(q)) return;
    segMode = mode === 'choose' ? 'choose' : 'build';
    if (remember) saveAnswerMode(q, segMode);
    const build = segMode === 'build';
    root.querySelectorAll('.answer-mode-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === segMode ? 'true' : 'false'));
    const bBox = root.querySelector('#seg-build');
    const cBox = root.querySelector('#seg-choose');
    if (bBox) bBox.hidden = !build;
    if (cBox) cBox.hidden = build;
    const note = root.querySelector('#answer-mode-note');
    if (note) note.hidden = build;
    const check = root.querySelector('#check');
    if (check) { check.hidden = !build; if (phase === 'answer') check.disabled = !segReady(); }
    segActionHint(q);
    applyCalc(q); // the calculator's Use note names the current mode
  }

  function bindSeg(q) {
    sb = { q, cols: cleanChoiceCols(q.choiceCols), bank: q.segBank, placed: cleanChoiceCols(q.choiceCols).map(() => null), locked: false, drag: null, pointerAt: -Infinity };
    const form = root.querySelector('#answer-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (segMode === 'build' && segReady()) submit(segValue());
    });
    form.querySelectorAll('.answer-mode-btn').forEach(b => b.addEventListener('click', () => {
      if (phase !== 'answer') return;
      setSegMode(q, b.dataset.mode);
    }));
    const box = root.querySelector('#seg-build');
    box.addEventListener('click', onSegClick);
    box.addEventListener('keydown', onSegKey);
    box.addEventListener('pointerdown', onSegPointerDown);
    box.addEventListener('pointermove', onSegPointerMove);
    box.addEventListener('pointerup', onSegPointerUp);
    box.addEventListener('pointercancel', () => cancelSegDrag());
    box.addEventListener('lostpointercapture', e => { if (sb?.drag && sb.drag.id === e.pointerId && sb.drag.active) cancelSegDrag(); });
    root.querySelector('#segb-reset')?.addEventListener('click', segReset);
    const filter = root.querySelector('#segb-filter');
    filter?.addEventListener('input', () => applySegFilter());
    filter?.addEventListener('keydown', e => {
      if (e.key === 'Escape' && filter.value) { e.preventDefault(); e.stopPropagation(); filter.value = ''; applySegFilter(); }
    });
    root.querySelectorAll('#seg-choose .choice').forEach(b =>
      b.addEventListener('click', () => { if (segMode === 'choose') submit(q.choices[+b.dataset.i], +b.dataset.i); }));
    renderSeg();
    setSegMode(q, savedSegMode(q), { remember: false });
    if (segMode === 'build') root.querySelector('#segb-bank .tile')?.focus();
    else root.querySelector('#seg-choose .choice')?.focus();
  }

  // ---- Run (test the output) for runnable questions ----
  const RUN_SHOW_ROWS = 20;
  let runToken = 0;

  // Output card: an escaped table (at most 20 rows shown) or the error message.
  function outputHtml(res, title = 'Output') {
    if (!res || typeof res.error === 'string') {
      return `<div class="run-card is-error"><p class="run-title">${icon('terminal')}<span>${esc(title)}</span></p>
        <p class="run-error">${icon('circle-alert')}<span>${esc(res?.error || 'Error')}</span></p></div>`;
    }
    const total = typeof res.total === 'number' ? res.total : res.rows.length;
    const shown = res.rows.slice(0, RUN_SHOW_ROWS);
    const cell = v => (v === null || v === undefined ? '<span class="run-null">NULL</span>' : esc(String(v)));
    const table = res.columns.length
      ? `<div class="table-wrap run-table-wrap"><table class="run-table">
          <thead><tr>${res.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${shown.map(r => `<tr>${res.columns.map((_, j) => `<td>${cell(r[j])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>` : '';
    const count = `${total} ${total === 1 ? 'row' : 'rows'}${total > shown.length ? ` · ${total - shown.length} more not shown` : ''}`;
    return `<div class="run-card"><p class="run-title">${icon('terminal')}<span>${esc(title)}</span><span class="run-count">${esc(count)}</span></p>${table}</div>`;
  }

  function currentRunValue(q) {
    if (inBlocks(q)) return ts && ts.tree.length ? tilesValue() : '';
    return root.querySelector('#answer')?.value ?? '';
  }

  async function runCurrent() {
    const q = questions[idx];
    if (!q?.runnable || phase !== 'answer') return;
    const out = root.querySelector('#run-output');
    if (!out) return;
    const value = currentRunValue(q);
    if (!value.trim()) {
      out.innerHTML = outputHtml({ error: inBlocks(q) ? 'Place some blocks first.' : 'Type an answer first.' });
      icons();
      return;
    }
    const token = ++runToken;
    out.innerHTML = `<div class="run-card"><p class="run-title">${icon('loader')}<span>Running…</span></p></div>`;
    icons();
    const res = await runAnswer(q, value);
    if (token !== runToken || questions[idx] !== q || !out.isConnected) return;
    out.innerHTML = outputHtml(res);
    icons();
  }

  // After Check: the expected output (running the correct answer) in the feedback panel.
  async function showExpectedOutput(q) {
    if (!q?.runnable) return;
    const slot = root.querySelector('#expected-output');
    if (!slot) return;
    const res = await runAnswer(q, String(q.answer ?? ''));
    if (questions[idx] !== q || !slot.isConnected) return;
    slot.innerHTML = outputHtml(res, 'Expected output');
    icons();
  }

  const runButton = q => (q?.runnable ? `<button type="button" class="btn run-btn" id="run-btn" title="Run (${isMac() ? '⌘' : 'Ctrl'}+Enter)">${icon('play')}<span>Run</span></button>` : '');

  function inputHtml(q) {
    if (isMulti(q)) {
      const n = (q.parts || []).length;
      return `<form class="answer-form multi-form" id="answer-form" autocomplete="off" novalidate>
        ${(q.parts || []).map((p, i) => partHtml(p, i, n)).join('')}
      </form>`;
    }
    if (isTiles(q)) return tilesHtml(q);
    if (isDual(q)) return dualHtml(q);
    if (isSegQ(q)) return segDualHtml(q);
    if (q.answerType === 'choice' && isSeg(q)) {
      return `<div class="choices ${segClass(q)}">${segHeadHtml(q)}${(q.choices || []).map((c, i) =>
        `<button type="button" class="btn choice seg-choice" data-i="${i}"><span class="choice-key" aria-hidden="true">${i + 1}</span>${segCellsHtml(q, i)}<span class="choice-mark"></span></button>`).join('')}</div>`;
    }
    if (q.answerType === 'choice') {
      return `<div class="choices">${(q.choices || []).map((c, i) =>
        `<button type="button" class="btn choice" data-i="${i}"><span class="choice-key" aria-hidden="true">${i + 1}</span><span class="choice-text">${renderInline(c)}</span><span class="choice-mark"></span></button>`).join('')}</div>`;
    }
    const num = q.answerType === 'number';
    if (q.answerType === 'date') {
      return `<form class="answer-form" id="answer-form" autocomplete="off">
      <label class="field-label" for="answer">Your answer</label>
      <input id="answer" class="answer-input date-input" type="text" inputmode="text" enterkeyhint="go"
        autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${datePlaceholder(q.precision)}" aria-describedby="answer-readas">
      ${readAsHtml('answer-readas', q.precision)}
    </form>`;
    }
    // The Check button lives in the action bar (sticky on phones) and targets this form by id.
    return `<form class="answer-form" id="answer-form" autocomplete="off">
      <label class="field-label" for="answer">Your answer</label>
      <input id="answer" class="answer-input" type="text" ${num ? 'inputmode="decimal"' : ''} enterkeyhint="go"
        autocapitalize="off" autocorrect="off"
        placeholder="${num ? 'Type a number' : 'Type your answer'}" spellcheck="false"${q.answerType === 'text' ? caseDescribed(q, 'answer-case') : ''}>
      ${q.answerType === 'text' ? caseNoteHtml(q, 'answer-case') : ''}
    </form>`;
  }

  function actionBar(q) {
    if (isMulti(q)) {
      return `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> for the next part</span></p>
        ${calcButton(q)}<button type="submit" form="answer-form" class="btn btn-primary" id="check" disabled>${icon('check')} Check</button>`;
    }
    if (isTiles(q) || isDual(q)) {
      const blocks = inBlocks(q);
      return `<p class="action-hint desktop-only"><span class="action-hint-key" id="action-hint-key">Press <kbd>Enter</kbd> ${blocks ? 'on a block to place it' : 'to check'}</span></p>
        ${calcButton(q)}${runButton(q)}<button type="submit" form="answer-form" class="btn btn-primary" id="check"${blocks ? ' disabled' : ''}>${icon('check')} Check</button>`;
    }
    if (isSegQ(q)) {
      return `<p class="action-hint" id="seg-action-hint"></p>
        ${calcButton(q)}<button type="submit" form="answer-form" class="btn btn-primary" id="check" disabled>${icon('check')} Check</button>`;
    }
    if (q.answerType === 'choice') {
      const n = Math.min((q.choices || []).length, 9);
      return `<p class="action-hint"><span class="action-hint-tap">Tap an answer</span>
        <span class="action-hint-key">Press <kbd>1</kbd>${n > 1 ? `–<kbd>${n}</kbd>` : ''} to answer</span></p>${calcButton(q)}`;
    }
    return `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to check</span></p>
      ${calcButton(q)}${runButton(q)}<button type="submit" form="answer-form" class="btn btn-primary" id="check">${icon('check')} Check</button>`;
  }

  // ---- guided mode: guide card, hints, Show solution ----

  function guideCardHtml(q) {
    let body = '';
    try { body = opts.guided.guideFor ? opts.guided.guideFor(q) : ''; } catch (e) { console.warn('StudyBlock: guide failed', e); }
    if (!body) return '';
    return `<details class="card guide-card" id="guide-card" ${guideOpen ? 'open' : ''}>
        <summary>${icon('book-open')}<span>How to solve</span>${icon('chevron-down', 'guide-chev')}</summary>
        <div class="prose guide-body">${body}</div>
      </details>`;
  }

  const hintLabel = () => (gs.hintsShown < gs.hints.length
    ? `Hint ${gs.hintsShown + 1} of ${gs.hints.length}`
    : 'No more hints');

  function guidedToolsHtml() {
    const hintBtn = gs.hints.length
      ? `<button type="button" class="btn btn-soft" id="hint-btn" aria-controls="hint-list">${icon('lightbulb')}<span class="hint-btn-label">${esc(hintLabel())}</span></button>`
      : '';
    const keyHint = gs.hints.length ? '<span class="guided-key desktop-only">Press <kbd>H</kbd> for a hint</span>' : '';
    // Show solution needs one try first (or every hint shown): aria-disabled, so it stays focusable
    // and its reason stays readable.
    return `<div class="guided-tools" id="guided-tools">
        ${hintBtn}
        <button type="button" class="btn" id="show-solution" aria-disabled="true" aria-describedby="solution-gate">${icon('eye')}<span>Show solution</span></button>
        <span class="solution-gate" id="solution-gate">${icon('lock')}<span>Try once first</span></span>
        ${keyHint}
      </div>`;
  }

  // Show solution unlocks after the first checked wrong answer, or once every hint has been shown.
  function hintTotal(q) {
    const partHints = isMulti(q) ? (q.parts || []).filter(p => typeof p.hint === 'string' && p.hint).length : 0;
    return (gs?.hints.length || 0) + partHints;
  }
  const solutionAllowed = () => {
    if (!gs) return false;
    const total = hintTotal(questions[idx]);
    return gs.tries > 0 || (total > 0 && hintsUsed() >= total);
  };
  function syncSolutionGate() {
    const btn = root.querySelector('#show-solution');
    if (!btn) return;
    const ok = solutionAllowed();
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    btn.classList.toggle('is-gated', !ok);
    const gate = root.querySelector('#solution-gate');
    if (gate) gate.hidden = ok;
    if (ok) btn.removeAttribute('aria-describedby'); else btn.setAttribute('aria-describedby', 'solution-gate');
  }

  const hintsUsed = () => (gs ? gs.hintsShown + gs.partHints : 0);

  function revealHint() {
    if (!guided || phase !== 'answer' || !gs || gs.hintsShown >= gs.hints.length) return false;
    const list = root.querySelector('#hint-list');
    if (!list) return false;
    const i = gs.hintsShown++;
    const li = document.createElement('li');
    li.className = 'hint';
    li.innerHTML = `<p class="hint-head">${icon('lightbulb')}<span>Hint ${i + 1} of ${gs.hints.length}</span></p>
      <div class="prose hint-body">${renderMarkdown(gs.hints[i])}</div>`;
    list.appendChild(li);
    const btn = root.querySelector('#hint-btn');
    if (btn) {
      btn.querySelector('.hint-btn-label').textContent = hintLabel();
      if (gs.hintsShown >= gs.hints.length) {
        // Keep focus somewhere useful before disabling the focused button.
        if (document.activeElement === btn) root.querySelector('#show-solution')?.focus();
        btn.disabled = true;
      }
    }
    syncSolutionGate();
    icons();
    return true;
  }

  function revealPartHint(id) {
    if (!guided || phase !== 'answer' || !gs) return false;
    const q = questions[idx];
    const p = isMulti(q) ? partOf(q)(id) : null;
    const box = p && root.querySelector(`#part-${CSS.escape(id)}-hint`);
    const btn = p && root.querySelector(`.part-hint-btn[data-part-hint="${CSS.escape(id)}"]`);
    if (!p || !box || !btn || btn.disabled || !p.hint) return false;
    box.innerHTML = `<p class="hint-head">${icon('lightbulb')}<span>Hint · ${esc(p.label)}</span></p><div class="prose hint-body">${renderMarkdown(p.hint)}</div>`;
    gs.partHints++;
    syncSolutionGate();
    btn.disabled = true;
    btn.closest('.part-hint-row')?.setAttribute('hidden', '');
    icons();
    focusPart(id);
    return true;
  }

  // H: the next question-level hint, else the hint of the part last used.
  function hotkeyHint() {
    if (revealHint()) return;
    const q = questions[idx];
    if (isMulti(q)) {
      const ids = [lastPart, ...(q.parts || []).map(p => p.id)].filter(Boolean);
      for (const id of ids) if (revealPartHint(id)) return;
    }
  }

  function bindGuided(q) {
    gs = { tries: 0, hintsShown: 0, partHints: 0, lastValue: undefined, ...hintsFor(q) };
    const tools = root.querySelector('#guided-tools-slot');
    if (tools) tools.outerHTML = guidedToolsHtml();
    syncSolutionGate();
    root.querySelector('#hint-btn')?.addEventListener('click', () => revealHint());
    root.querySelector('#show-solution')?.addEventListener('click', showSolution);
    root.querySelectorAll('.part-hint-btn').forEach(b => b.addEventListener('click', () => revealPartHint(b.dataset.partHint)));
    root.querySelector('#guide-card')?.addEventListener('toggle', e => { guideOpen = e.currentTarget.open; });
    // A wrong mark clears as soon as the user changes that field.
    const form = root.querySelector('#answer-form');
    form?.addEventListener('input', e => {
      e.target.classList?.remove('is-wrong');
      e.target.closest?.('.part')?.classList.remove('is-wrong', 'is-close');
    });
    form?.addEventListener('click', e => {
      const b = e.target.closest?.('.part-choice');
      if (b && !b.disabled) b.closest('.part')?.classList.remove('is-wrong');
    });
  }

  // Questions answered with code-like blocks or run as queries: inline code in the prompt names
  // tables and columns, so it stays at text size (not the large equation style).
  // Prose-style prompts: inline code stays at text size (scenario questions name columns, functions, cells).
  const isCodeQuestion = q => isDual(q) || !!q?.runnable || q?.difficulty === 'expert-plus'
    || (isTiles(q) && (q.tiles || []).some(t => t.slot));

  function showQuestion() {
    phase = 'answer';
    const q = questions[idx];
    answerMode = isDual(q) ? savedAnswerMode(q) : 'type';
    segMode = isSegQ(q) ? savedSegMode(q) : 'build';
    runToken++;
    const main = root.querySelector('#quiz-main');
    if (!main) return;
    main.innerHTML = `${header()}
      ${guided ? guideCardHtml(q) : ''}
      <section class="card question${guided ? ' is-guided' : ''}${isCodeQuestion(q) ? ' is-code' : ''}">
        ${opts.tagsFor ? opts.tagsFor(q) : opts.showTags ? questionTag(q) : (opts.cardTags ? `<p class="q-tag tag-row">${opts.cardTags}${langTag(q)}</p>` : langRow(q))}
        <div class="prompt prose">${renderPrompt(q.prompt)}</div>
        ${guided ? '<div class="guided-hints" aria-live="polite"><ol class="hint-list" id="hint-list" aria-label="Hints"></ol></div>' : ''}
        ${inputHtml(q)}
        ${q.runnable ? '<div class="run-output" id="run-output" aria-live="polite"></div>' : ''}
        ${guided ? '<div id="guided-tools-slot"></div>' : ''}
        <div id="feedback"${guided ? ' aria-live="polite"' : ''}></div>
        <div class="action-bar" id="action-bar">${actionBar(q)}</div>
      </section>`;
    if (isMulti(q)) lastPart = q.parts?.[0]?.id ?? null;
    cancelDrag();
    ts = null;
    cancelSegDrag();
    sb = null;
    if (guided) bindGuided(q);
    // Given values: the previous question's untouched pre-filled rows go; this one's (if any) come in.
    calc?.setGiven(calcAllowed(q) && Array.isArray(q.given) ? q.given : []);
    // Given graph functions (after the rows, so references like _a resolve): same rule as given rows.
    calc?.setGivenGraph(calcAllowed(q) && Array.isArray(q.graphFns) ? q.graphFns : [], calcAllowed(q) ? q.graphView ?? null : null);
    applyCalc(q);
    icons();
    if (isMulti(q)) { bindMulti(q); return; }
    root.querySelector('#run-btn')?.addEventListener('click', runCurrent);
    if (isTiles(q)) { bindTiles(q); return; }
    if (isDual(q)) { bindDual(q); return; }
    if (isSegQ(q)) { bindSeg(q); return; }
    const form = root.querySelector('.answer-form');
    if (form) {
      form.addEventListener('submit', e => { e.preventDefault(); submit(root.querySelector('#answer').value); });
      if (q.answerType === 'date') {
        // Live "Read as" line; Check needs a value that reads as a date.
        const input = root.querySelector('#answer');
        const sync = () => {
          updateReadAs(root.querySelector('#answer-readas'), input.value, q.precision);
          const btn = root.querySelector('#check');
          if (btn && phase === 'answer') btn.disabled = !parseDate(input.value);
        };
        input.addEventListener('input', sync);
        sync();
      }
      root.querySelector('#answer').focus();
    }
    root.querySelectorAll('.choice').forEach(b =>
      b.addEventListener('click', () => submit(q.choices[+b.dataset.i], +b.dataset.i)));
  }

  // ---- guided checking: unlimited tries; right parts lock, wrong ones stay editable ----

  const markHtml = ok => `${icon(ok ? 'circle-check' : 'circle-x')}<span class="sr-only">${ok ? 'Correct' : 'Not correct'}</span>`;

  function lockPart(p, el) {
    if (el.classList.contains('is-locked')) return;
    el.classList.remove('is-wrong', 'is-close');
    el.classList.add('is-correct', 'is-locked');
    if (p.answerType === 'choice') {
      el.querySelector('.part-choices')?.classList.add('is-answered');
      el.querySelectorAll('.part-choice').forEach(b => {
        if (b.getAttribute('aria-pressed') === 'true') {
          b.classList.add('is-correct');
          const m = b.querySelector('.choice-mark');
          if (m) m.innerHTML = markHtml(true);
        }
        b.disabled = true;
      });
    } else {
      const input = el.querySelector('.part-input');
      if (input) { input.classList.remove('is-wrong'); input.classList.add('is-correct'); input.disabled = true; }
    }
    const head = el.querySelector('.part-head');
    if (head && !head.querySelector('.part-ok')) {
      head.insertAdjacentHTML('beforeend', `<span class="part-ok">${icon('circle-check')}<span>Correct</span></span>`);
    }
    el.querySelector('.part-hint-row')?.setAttribute('hidden', '');
  }

  function markPartWrong(p, el, close = false) {
    el.classList.add('is-wrong');
    el.classList.toggle('is-close', !!close);
    if (p.answerType === 'choice') {
      const b = el.querySelector('.part-choice[aria-pressed="true"]');
      if (b) {
        b.setAttribute('aria-pressed', 'false');
        b.classList.add('is-wrong');
        const m = b.querySelector('.choice-mark');
        if (m) m.innerHTML = markHtml(false);
        b.disabled = true;
      }
    } else {
      el.querySelector('.part-input')?.classList.add('is-wrong');
    }
  }

  function guidedSubmit(value, choiceIndex) {
    if (phase !== 'answer' || !gs) return;
    const q = questions[idx];
    const multi = isMulti(q);
    const blocks = inBlocks(q);
    if (multi) {
      if (!value || typeof value !== 'object' || !partsReady(q, value)) { enterMulti(q, lastPart); return; }
    } else if (inBuild(q)) {
      if (!segReady()) return;
    } else if (q.answerType === 'choice') {
      const b = root.querySelector(`.choices .choice[data-i="${Number(choiceIndex)}"]`);
      if (!b || b.disabled) return;
    } else if (blocks) {
      if (!tilesReady()) return;
    } else if (!String(value ?? '').trim() || (q.answerType === 'date' && !parseDate(value))) {
      root.querySelector('#answer')?.focus();
      return;
    }
    const res = gradeAnswer(q, value, modeFor(q));
    gs.lastValue = value;
    let firstWrong = null;
    let nClose = 0;
    if (multi) {
      for (const pr of res.parts) {
        const p = partOf(q)(pr.id);
        const el = partEl(pr.id);
        if (!p || !el) continue;
        if (pr.correct) lockPart(p, el);
        else { markPartWrong(p, el, !!pr.close); if (pr.close) nClose++; firstWrong = firstWrong || pr.id; }
      }
      if (res.correct) { solvedGuided(q, value, choiceIndex); return; }
    } else if (res.correct) {
      solvedGuided(q, value, choiceIndex, res);
      return;
    } else if (inBuild(q)) {
      root.querySelector('#segb-slots')?.classList.add('is-wrong'); // cleared on the next change
    } else if (q.answerType === 'choice') {
      const b = root.querySelector(`.choices .choice[data-i="${Number(choiceIndex)}"]`);
      b.classList.add('is-wrong');
      const m = b.querySelector('.choice-mark');
      if (m) m.innerHTML = markHtml(false);
      b.disabled = true;
    } else if (blocks) {
      root.querySelector('#tiles-answer')?.classList.add('is-wrong'); // cleared on the next change
    } else {
      root.querySelector('#answer')?.classList.add('is-wrong');
    }
    gs.tries++;
    syncSolutionGate();
    const nRight = multi ? res.parts.filter(p => p.correct).length : 0;
    // A close answer counts as "almost": still a try, with a nudge to check spelling or rounding.
    const almost = !multi && !!res.fuzzy;
    const nudge = !almost ? '' : res.fuzzy.kind === 'date' ? `${offText(res.fuzzy.off, q.precision)} out, check the date`
      : res.fuzzy.mode === 'years' ? `${offText(res.fuzzy.off, 'year')} out`
      : res.fuzzy.kind === 'number' ? 'very close, check your rounding' : 'very close, check the spelling';
    root.querySelector('#feedback').innerHTML = `<div class="feedback ${almost ? 'partial' : 'bad'} guided-retry">
        <p class="feedback-title">${icon(almost ? 'circle-dot' : 'circle-x')}<span>${almost ? `Almost · ${esc(nudge)}` : 'Not quite, try again'}</span></p>
        ${res.note ? `<p class="grade-note">${icon('info')}<span>${esc(res.note)}</span></p>` : ''}
        <p class="feedback-sub">${multi ? `${nRight} of ${res.parts.length} parts right${nClose ? ` · ${nClose} almost` : ''} · ` : ''}Tries: ${gs.tries}</p>
      </div>`;
    icons();
    if (multi) {
      updateCheck(q);
      focusPart(firstWrong, true);
    } else if (inBuild(q)) {
      root.querySelector('#segb-slots .tile')?.focus();
    } else if (q.answerType === 'choice') {
      root.querySelector('.choices .choice:not(:disabled)')?.focus();
    } else if (blocks) {
      root.querySelector('#tiles-answer .tile')?.focus();
    } else {
      const input = root.querySelector('#answer');
      input?.focus();
      input?.select();
    }
  }

  function solvedGuided(q, value, choiceIndex, res = null) {
    const multi = isMulti(q);
    if (inBuild(q)) {
      root.querySelector('#segb-slots')?.classList.add('is-correct');
    } else if (!multi && q.answerType === 'choice') {
      const b = root.querySelector(`.choices .choice[data-i="${Number(choiceIndex)}"]`);
      if (b) {
        b.classList.add('is-correct');
        const m = b.querySelector('.choice-mark');
        if (m) m.innerHTML = markHtml(true);
      }
    } else if (inBlocks(q)) {
      root.querySelector('#tiles-answer')?.classList.add('is-correct');
    } else if (!multi) {
      root.querySelector('#answer')?.classList.remove('is-wrong');
      root.querySelector('#answer')?.classList.add('is-correct');
    }
    endGuidedQuestion(q, gs.tries === 0 && hintsUsed() === 0 ? 'first' : 'after', value, res);
  }

  function showSolution() {
    if (!guided || phase !== 'answer' || !gs) return;
    if (!solutionAllowed()) {
      // Gated: point at the reason instead of revealing anything.
      const gate = root.querySelector('#solution-gate');
      if (gate) { gate.classList.remove('is-flash'); void gate.offsetWidth; gate.classList.add('is-flash'); }
      return;
    }
    const q = questions[idx];
    if (isMulti(q)) {
      // Reveal each unsolved part's answer in place.
      for (const p of q.parts || []) {
        const el = partEl(p.id);
        if (!el || el.classList.contains('is-locked')) continue;
        el.classList.remove('is-wrong', 'is-close');
        el.classList.add('is-revealed');
        if (p.answerType === 'choice') {
          el.querySelector('.part-choices')?.classList.add('is-answered');
          el.querySelectorAll('.part-choice').forEach(b => {
            if (String(p.choices[+b.dataset.i]) === String(p.answer)) {
              b.classList.add('is-correct');
              const m = b.querySelector('.choice-mark');
              if (m) m.innerHTML = `${icon('circle-check')}<span class="sr-only">Correct answer</span>`;
            }
          });
        }
      }
    } else if (inBuild(q)) {
      // Place the answer's blocks, one per column.
      const sol = segSolution();
      if (sol) { sb.placed = sol; renderSeg(); }
      const slots = root.querySelector('#segb-slots');
      slots?.classList.remove('is-wrong');
      slots?.classList.add('is-revealed');
    } else if (inBlocks(q)) {
      // Lay the correct blocks out in the answer row.
      if (placeSolution(ts.spec, q.answer)) {
        const ans = root.querySelector('#tiles-answer');
        ans?.classList.remove('is-wrong');
        ans?.classList.add('is-revealed');
      }
    } else if (q.answerType === 'choice') {
      root.querySelector('.choices')?.classList.add('is-answered');
      root.querySelectorAll('.choices .choice').forEach(b => {
        if (String(q.choices[+b.dataset.i]) === String(q.answer)) {
          b.classList.add('is-correct');
          const m = b.querySelector('.choice-mark');
          if (m) m.innerHTML = `${icon('circle-check')}<span class="sr-only">Correct answer</span>`;
        }
      });
    }
    endGuidedQuestion(q, 'solution', gs.lastValue);
  }

  // `value`: the answer that solved it (or the last try, for the solution); `res`: its grade.
  function endGuidedQuestion(q, outcome, value, res = null) {
    phase = 'feedback';
    const multi = isMulti(q);
    const userAnswer = value === undefined ? (multi ? {} : '')
      : multi ? Object.fromEntries((q.parts || []).map(p => [p.id, String(value?.[p.id] ?? '')])) : String(value ?? '');
    gResults.push({ q, outcome, tries: gs.tries, hints: hintsUsed(), userAnswer, ...(res?.gradedBy ? { gradedBy: res.gradedBy } : {}) });
    applyCalc(q);
    root.querySelectorAll('.answer-form input, .choice, #check, #run-btn, .part-hint-btn, .answer-mode-btn').forEach(el => { el.disabled = true; });
    if (ts) lockTiles();
    if (sb) lockSeg();
    const tools = root.querySelector('#guided-tools');
    if (tools) tools.hidden = true;

    const seg = root.querySelector(`#seg-progress > span:nth-child(${idx + 1})`);
    if (seg) { seg.classList.remove('is-current'); seg.classList.add('is-done'); }
    root.querySelector('#seg-progress')?.setAttribute('aria-valuetext', progressText());

    const last = idx === questions.length - 1;
    const bits = [];
    if (gs.tries) bits.push(`${gs.tries} wrong ${gs.tries === 1 ? 'try' : 'tries'}`);
    if (hintsUsed()) bits.push(`${hintsUsed()} ${hintsUsed() === 1 ? 'hint' : 'hints'}`);
    const expected = q.runnable ? '<div class="expected-output" id="expected-output"></div>' : '';
    let box;
    if (outcome === 'solution') {
      const locked = id => !!partEl(id)?.classList.contains('is-locked');
      const mine = multi ? Object.fromEntries(Object.entries(readParts(q)).filter(([id]) => locked(id))) : null;
      const answers = multi
        ? partListHtml(q.parts, q.parts.map(p => ({ id: p.id, label: p.label, correct: locked(p.id) ? true : null })), mine, q.answer, 'feedback-parts', partColsOf(q))
        : `<p>Answer: <strong>${answerInline(q.answer, q.choiceCols)}</strong></p>`;
      box = `<div class="feedback info">
        <p class="feedback-title">${icon('eye')}<span>Solved with solution</span></p>
        ${answers}
        ${expected}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    } else {
      box = `<div class="feedback good">
        <p class="feedback-title">${icon('circle-check')}<span>Correct</span>${outcome === 'first'
          ? '<span class="feedback-sub">· first try</span>'
          : `<span class="feedback-sub">· after ${esc(bits.join(', '))}</span>`}</p>
        ${res?.note ? `<p class="grade-note">${icon('info')}<span>${esc(res.note)}</span></p>` : ''}
        ${expected}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    }
    root.querySelector('#feedback').innerHTML = box;
    root.querySelector('#action-bar').innerHTML =
      `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to continue</span></p>
      ${calcButton(q)}<button type="button" class="btn btn-primary" id="next">${last ? `${icon('flag')} Finish` : `Next question ${icon('arrow-right')}`}</button>`;
    icons();
    const next = root.querySelector('#next');
    next.addEventListener('click', advance);
    next.focus();
    showExpectedOutput(q);
  }

  // Feedback title for a graded single or multi-part answer (icon + text, never colour alone).
  function feedbackTitle(g, state, partsSub) {
    const blocksBit = g.mode === 'blocks' || g.mode === 'choose'
      ? ` <span class="feedback-sub">· ${g.mode === 'choose' ? 'Choose' : 'Blocks'}${g.multiplier < 1 ? ` ${esc(multText(g.multiplier))}` : ''}</span>` : '';
    if (state === 'correct') return `${icon('circle-check')} Correct${blocksBit}`;
    if (g.fuzzy) return `${icon('circle-dot')} Close · ${esc(pctText(g.fuzzy.factor))} credit`;
    if (state === 'partial') return `${icon('circle-dot')} Partly correct ·${partsSub}`;
    return `${icon('circle-x')} Incorrect${partsSub}${blocksBit}`;
  }

  function submit(value, choiceIndex) {
    if (guided) { guidedSubmit(value, choiceIndex); return; }
    if (phase !== 'answer') return;
    const q = questions[idx];
    const multi = isMulti(q);
    if (multi) {
      if (!value || typeof value !== 'object' || !partsReady(q, value)) { enterMulti(q, lastPart); return; }
    } else if (inBuild(q) && !segReady()) {
      return;
    } else if (q.answerType !== 'choice' && (!String(value ?? '').trim() || (q.answerType === 'date' && !parseDate(value)))) {
      if (!inBlocks(q)) root.querySelector('#answer')?.focus();
      return;
    }
    const mode = modeFor(q);
    const blocks = inBlocks(q);
    phase = 'feedback';
    const g = gradeAnswer(q, value, mode);
    const { correct, credit } = g;
    const state = resultState(g);
    const partResults = multi ? g.parts : null;
    // Snapshot of the calculator sheet at check time ("Your working"), when it was shown.
    const work = calcAllowed(q) && calc ? cleanWork(calc.snapshot()) : null;
    // ...and the graph's functions, when at least one is non-empty ("Your graph").
    const graph = calcAllowed(q) && calc ? cleanGraph(calc.graphSnapshot()) : null;
    const userAnswer = multi
      ? Object.fromEntries((q.parts || []).map(p => [p.id, String(value[p.id] ?? '')]))
      : String(value ?? '');
    results.push({
      q, userAnswer, correct, credit,
      ...(partResults ? { parts: partResults } : {}),
      ...(work ? { work } : {}),
      ...(graph ? { graph } : {}),
      ...(g.mode === 'blocks' || g.mode === 'choose' ? { mode: g.mode, multiplier: g.multiplier } : {}),
      ...(g.fuzzy ? { fuzzy: g.fuzzy } : {}),
      ...(g.gradedBy ? { gradedBy: g.gradedBy } : {}),
      ...(g.note ? { note: g.note } : {}),
    });
    applyCalc(q);

    root.querySelectorAll('.answer-form input, .action-bar button, .choice, .answer-mode-btn').forEach(el => { el.disabled = true; });
    if (ts) lockTiles();
    if (sb) { lockSeg(); if (segMode === 'build') markSegSlots(); }
    if (blocks) root.querySelector('#tiles-answer')?.classList.add(correct ? 'is-correct' : 'is-wrong');
    if (multi) {
      for (const pr of partResults) {
        const p = partOf(q)(pr.id);
        const el = partEl(pr.id);
        if (!p || !el) continue;
        el.classList.add(pr.correct ? 'is-correct' : pr.close ? 'is-close' : 'is-wrong');
        if (p.answerType === 'choice') {
          el.querySelector('.part-choices')?.classList.add('is-answered');
          el.querySelectorAll('.part-choice').forEach(b => {
            const c = p.choices[+b.dataset.i];
            const mark = b.querySelector('.choice-mark');
            if (String(c) === String(p.answer)) {
              b.classList.add('is-correct');
              if (mark) mark.innerHTML = `${icon('circle-check')}<span class="sr-only">Correct answer</span>`;
            } else if (b.getAttribute('aria-pressed') === 'true') {
              b.classList.add('is-wrong');
              if (mark) mark.innerHTML = `${icon('circle-x')}<span class="sr-only">Your answer, incorrect</span>`;
            }
          });
        } else {
          el.querySelector('.part-input')?.classList.add(pr.correct ? 'is-correct' : pr.close ? 'is-close' : 'is-wrong');
        }
      }
    } else if (q.answerType === 'choice') {
      root.querySelector('.choices')?.classList.add('is-answered');
      root.querySelectorAll('.choice').forEach(b => {
        const c = q.choices[+b.dataset.i];
        const mark = b.querySelector('.choice-mark');
        if (String(c) === String(q.answer)) {
          b.classList.add('is-correct');
          if (mark) mark.innerHTML = `${icon('circle-check')}<span class="sr-only">Correct answer</span>`;
        } else if (+b.dataset.i === choiceIndex) {
          b.classList.add('is-wrong');
          if (mark) mark.innerHTML = `${icon('circle-x')}<span class="sr-only">Your answer, incorrect</span>`;
        }
      });
    } else if (!blocks) {
      root.querySelector('#answer')?.classList.add(correct ? 'is-correct' : g.fuzzy ? 'is-close' : 'is-wrong');
    }

    // Progress: colour the current segment and bump the correct count.
    const seg = root.querySelector(`#seg-progress > span:nth-child(${idx + 1})`);
    if (seg) { seg.classList.remove('is-current'); seg.classList.add(SEG_CLASS[state]); }
    const counter = root.querySelector('#quiz-correct');
    if (counter) counter.textContent = String(correctCount());
    root.querySelector('#seg-progress')?.setAttribute('aria-valuetext', progressText());

    const last = idx === questions.length - 1;
    const nRight = multi ? partResults.filter(p => p.correct).length : 0;
    const partsSub = multi ? ` <span class="feedback-sub">${nRight} of ${partResults.length} parts right</span>` : '';
    const spec = isTiles(q) ? q : isDual(q) ? q.blocks : null;
    root.querySelector('#feedback').innerHTML = `
      <div class="feedback ${state === 'correct' ? 'good' : state === 'partial' ? 'partial' : 'bad'}">
        <p class="feedback-title">${feedbackTitle(g, state, partsSub)}</p>
        ${g.note ? `<p class="grade-note">${icon('info')}<span>${esc(g.note)}</span></p>` : ''}
        ${multi ? partListHtml(q.parts, partResults, userAnswer, q.answer, 'feedback-parts', partColsOf(q))
          : correct ? '' : `${q.answerType === 'date' ? dateReadHtml(value, q.precision) : ''}<p>Correct answer: <strong>${answerInline(q.answer, q.choiceCols)}</strong></p>${blocks && spec ? tilesOrderHtml(spec, q.answer) : ''}`}
        ${q.runnable ? '<div class="expected-output" id="expected-output"></div>' : ''}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    root.querySelector('#action-bar').innerHTML =
      `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to continue</span></p>
      ${calcButton(q)}<button type="button" class="btn btn-primary" id="next">${last ? `${icon('flag')} Finish` : `Next question ${icon('arrow-right')}`}</button>`;
    icons();
    const next = root.querySelector('#next');
    next.addEventListener('click', advance);
    next.focus();
    showExpectedOutput(q);
  }

  function advance() {
    if (phase !== 'feedback') return;
    idx++;
    if (idx < questions.length) showQuestion();
    else finish();
  }

  // Guided end screen: saved in History as a guided attempt (score = solved first try, display
  // only), never counted in stats or best scores.
  function finishGuided() {
    phase = 'done';
    teardownCalc();
    const count = k => gResults.filter(r => r.outcome === k).length;
    if (opts.toAttempt && gResults.length) {
      const att = opts.toAttempt(gResults.map(r => ({
        q: r.q, userAnswer: r.userAnswer, correct: r.outcome !== 'solution', credit: r.outcome === 'first' ? 1 : 0,
        ...(r.gradedBy ? { gradedBy: r.gradedBy } : {}),
      })));
      att.questions = (att.questions || []).map((sq, i) => ({ ...sq, outcome: gResults[i]?.outcome ?? 'solution' }));
      saveAttempt({ ...att, guided: true, score: count('first'), total: gResults.length });
    }
    const counts = ['first', 'after', 'solution'].map(k =>
      `<li class="guided-count is-${OUTCOMES[k].cls}">${icon(OUTCOMES[k].icon)}<strong>${count(k)}</strong><span>${esc(OUTCOMES[k].label)}</span></li>`).join('');
    root.innerHTML = `<div class="page-narrow">
      ${opts.crumbs}
      <section class="card result-summary guided-summary">
        <p class="eyebrow">${icon('compass')} Guided set complete</p>
        <h1 class="quiz-title">${opts.title}</h1>
        <p class="muted guided-note">Saved in History as guided practice. Not scored: stats and best scores don't change.</p>
        <ul class="guided-counts">${counts}</ul>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="retry">${icon('rotate-ccw')} Another guided set</button>
          ${opts.practiceHref ? `<a class="btn" href="${opts.practiceHref}">${icon('play')} Practice for real</a>` : ''}
          <a class="btn" href="${opts.backHref}">${icon(opts.backIcon || 'layout-grid')} ${esc(opts.backLabel)}</a>
          <a class="btn" href="#/results">${icon('history')} History</a>
        </div>
      </section>
      <section class="card">
        <h2>Questions</h2>
        <ol class="review">${gResults.map(guidedReviewItem).join('')}</ol>
      </section></div>`;
    icons();
    root.querySelector('#retry').addEventListener('click', start);
  }

  function guidedReviewItem(r) {
    const extra = [];
    if (r.tries) extra.push(`${r.tries} wrong ${r.tries === 1 ? 'try' : 'tries'}`);
    if (r.hints) extra.push(`${r.hints} ${r.hints === 1 ? 'hint' : 'hints'}`);
    return guidedItemHtml(r.q, r.outcome, opts.tagsFor ? opts.tagsFor(r.q) : opts.showTags ? questionTag(r.q) : langRow(r.q), extra);
  }

  function finish() {
    if (guided) { finishGuided(); return; }
    phase = 'done';
    teardownCalc();
    const score = roundScore(results.reduce((s, r) => s + r.credit, 0));
    const total = results.length;
    saveAttempt({ ...opts.toAttempt(results), score, total });
    const pct = total ? Math.round((score / total) * 100) : 0;
    root.innerHTML = `<div class="page-narrow">
      ${opts.crumbs}
      <section class="card result-summary">
        <p class="eyebrow">Quiz complete</p>
        <h1 class="quiz-title">${opts.title}</h1>
        <p class="big-score score ${scoreClass(pct)}">${fmtScore(score)} / ${total} <span>(${pct}%)</span></p>
        <div class="result-meter" aria-hidden="true">${results.map(r => `<span class="${SEG_CLASS[resultState(r)]}"></span>`).join('')}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="retry">${icon('rotate-ccw')} Retry</button>
          <a class="btn" href="${opts.backHref}">${icon(opts.backIcon || 'layout-grid')} ${esc(opts.backLabel)}</a>
          <a class="btn" href="#/results">${icon('history')} History</a>
        </div>
      </section>
      ${(opts.breakdown ?? opts.showTags) ? moduleBreakdown(results.map(r => ({ ...r.q, correct: r.correct, credit: r.credit }))) : ''}
      <section class="card">
        <h2>Review</h2>
        <ol class="review">${results.map(r => reviewItem(r, opts.tagsFor || opts.showTags)).join('')}</ol>
      </section></div>`;
    icons();
    root.querySelector('#retry').addEventListener('click', start);
    // Runnable questions: the expected output under each review item (run while still in memory).
    root.querySelectorAll('.review > .review-item').forEach((li, i) => {
      const q = results[i]?.q;
      if (!q?.runnable) return;
      const box = document.createElement('details');
      box.className = 'review-output';
      box.innerHTML = `<summary>${icon('terminal')} Expected output</summary><div class="review-output-body"></div>`;
      li.querySelector('.review-body')?.appendChild(box);
      runAnswer(q, String(q.answer ?? '')).then(res => {
        if (!box.isConnected) return;
        box.querySelector('.review-output-body').innerHTML = outputHtml(res, 'Expected output');
        icons();
      });
    });
  }

  function onKey(e) {
    // Ctrl/Cmd+Enter runs the answer of a runnable question (also from inside the answer field).
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.repeat && phase === 'answer' && questions[idx]?.runnable
      && !(e.target && e.target.closest && e.target.closest('.calc-panel'))) {
      e.preventDefault();
      runCurrent();
      return;
    }
    // Ctrl/Cmd+K focuses the calculator (when this question shows it).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'k') {
      if (calcShown()) { e.preventDefault(); openCalc(); }
      return;
    }
    // Keys typed in the calculator never answer or advance the quiz.
    if (e.target && e.target.closest && e.target.closest('.calc-panel')) return;
    if (e.key === 'Enter' && !e.repeat && !e.isComposing) {
      // Guided: the hint / solution buttons and the "How to solve" toggle keep their native Enter.
      if (guided && e.target?.closest?.('#guided-tools, .part-hint-row, #guide-card')) return;
      if (phase === 'answer' && isMulti(questions[idx])) {
        const t = e.target;
        const btn = t?.closest?.('button');
        // Other buttons (e.g. Calculator) keep their native Enter; Check and the part fields don't.
        if (btn && !btn.classList.contains('part-choice') && btn.id !== 'check') return;
        e.preventDefault();
        if (btn && btn.classList.contains('part-choice') && !btn.disabled) btn.click(); // Enter picks this choice
        enterMulti(questions[idx], t?.closest?.('[data-part]')?.dataset.part || lastPart);
      } else if (phase === 'answer' && isDual(questions[idx]) && e.target?.closest?.('.answer-mode, #run-btn')) {
        // The Type | Blocks switch and Run keep their native Enter.
      } else if (phase === 'answer' && isSegQ(questions[idx])) {
        // Build | Choose: buttons (blocks, options, the switch, Reset, Check) keep their native Enter;
        // elsewhere Enter checks a complete build.
        if (e.target?.closest?.('button')) return;
        e.preventDefault();
        if (e.target?.id === 'segb-filter') return;
        if (segMode === 'build' && segReady()) submit(segValue());
      } else if (phase === 'answer' && inBlocks(questions[idx])) {
        // Blocks, Reset, Check and other buttons keep their native Enter; elsewhere Enter checks
        // only once Check is enabled.
        if (e.target?.closest?.('button')) return;
        e.preventDefault();
        if (e.target?.id === 'tiles-filter') return; // Enter in "Filter blocks" never checks
        if (tilesReady()) submit(tilesValue());
      } else if (phase === 'answer' && questions[idx]?.answerType !== 'choice') {
        e.preventDefault();
        submit(root.querySelector('#answer')?.value);
      } else if (phase === 'feedback') {
        e.preventDefault();
        advance();
      }
    } else if (phase === 'answer' && questions[idx]?.answerType === 'choice' && !inBuild(questions[idx]) && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = +e.key - 1;
      const q = questions[idx];
      // Guided: a choice already ruled out (disabled) can't be picked again from the keyboard.
      if (guided && root.querySelector(`.choices .choice[data-i="${i}"]`)?.disabled) { e.preventDefault(); return; }
      if (i < (q.choices || []).length) { e.preventDefault(); submit(q.choices[i], i); }
    } else if (guided && phase === 'answer' && String(e.key).toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
      // H: next hint, unless the user is typing.
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
      if (!typing) { e.preventDefault(); hotkeyHint(); }
    }
  }
  // Registered once per render (not per start) so Retry doesn't stack listeners.
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));
  ctx.onCleanup(() => cancelDrag()); // a drag ghost never outlives the quiz

  await start();
}

// ---- segmented choices ("block-list" options) ----
// A choice question (or multi-part part) with `choiceCols` shows each option as aligned chips, one
// column per label. Options are stored as strings joined by " | "; `choiceSegs` (in memory) or a
// split of the string gives the segments. Labels are escaped; segments go through renderInline.
const segsOf = (str, cols) => (typeof str === 'string' ? splitSegs(str, cols) : null);
function segRow(owner, i) {
  const cols = cleanChoiceCols(owner?.choiceCols);
  const row = Array.isArray(owner?.choiceSegs?.[i]) ? owner.choiceSegs[i].map(String) : segsOf(owner?.choices?.[i], cols);
  return cols && row && row.length === cols.length ? row : null;
}
const isSeg = owner => !!cleanChoiceCols(owner?.choiceCols) && Array.isArray(owner?.choices) && owner.choices.every((_, i) => segRow(owner, i));
const segClass = owner => `seg-choices seg-n${cleanChoiceCols(owner.choiceCols).length}`;
// Column headers (desktop). Hidden from screen readers: every cell carries its own label.
function segHeadHtml(owner) {
  return `<div class="seg-head" aria-hidden="true"><span class="seg-head-key"></span>${cleanChoiceCols(owner.choiceCols).map(c =>
    `<span class="seg-col">${esc(c)}</span>`).join('')}<span class="seg-head-mark"></span></div>`;
}
// One option's cells: a caption (visible on phones, screen-reader only on wider screens) + a chip.
function segCellsHtml(owner, i) {
  const cols = cleanChoiceCols(owner.choiceCols);
  return segRow(owner, i).map((s, j) =>
    `<span class="seg-cell"><span class="seg-cap">${esc(cols[j])}<span class="sr-only">: </span></span><span class="seg-chip">${renderInline(s)}</span></span>`).join('');
}
// An answer value shown inline: chips when it splits into the labelled segments, else as before.
function answerInline(value, cols) {
  const segs = segsOf(value, cols);
  if (!segs) return renderInline(String(value ?? ''));
  const c = cleanChoiceCols(cols);
  // Each chip carries its column label as a small caption, so "Yes / Yes / No" reads unambiguously.
  return `<span class="seg-inline">${segs.map((s, j) =>
    `<span class="seg-chip"><span class="seg-chip-cap">${esc(c[j])}<span class="sr-only">: </span></span><span class="seg-chip-val">${renderInline(s)}</span></span>`).join('')}</span>`;
}
// { [partId]: cols } for a multi-part question: live parts carry `choiceCols`, stored ones `partCols`.
function partColsOf(q) {
  const live = Array.isArray(q?.parts) ? Object.fromEntries(q.parts.filter(p => p && cleanChoiceCols(p.choiceCols)).map(p => [p.id, p.choiceCols])) : {};
  return cleanPartCols({ ...live, ...(q?.partCols && typeof q.partCols === 'object' ? q.partCols : {}) });
}

// Stored question fields for an attempt (mixed quizzes also keep per-question origin).
export function storedQuestion(r, withOrigin) {
  return {
    seed: r.q.seed, prompt: r.q.prompt, answer: r.q.answer, userAnswer: r.userAnswer, correct: r.correct,
    // Partial credit 0–1 (multi-part: parts right / parts total); `correct` stays the strict flag.
    credit: typeof r.credit === 'number' ? roundScore(r.credit) : (r.correct ? 1 : 0),
    // Multi-part: answer/userAnswer are { [partId]: value } objects, plus per-part results.
    ...(Array.isArray(r.parts) ? { parts: r.parts.map(p => ({ id: p.id, label: p.label, correct: !!p.correct, ...(!p.correct && p.close ? { close: p.close } : {}) })) } : {}),
    // Segmented choices: the column labels, so review and History can show the stored string as chips.
    ...(cleanChoiceCols(r.q.choiceCols) ? { choiceCols: cleanChoiceCols(r.q.choiceCols) } : {}),
    ...(partColsOf(r.q) ? { partCols: partColsOf(r.q) } : {}),
    // Dual questions answered with blocks: the mode and the credit multiplier applied.
    ...(r.mode === 'blocks' || r.mode === 'choose' ? { mode: r.mode, multiplier: r.multiplier } : {}),
    // Close answer: { kind, typos | relErr, factor }.
    ...(r.fuzzy ? { fuzzy: r.fuzzy } : {}),
    // Accepted by the module's own grader (e.g. SQL output), not by the text match.
    ...(r.correct && r.gradedBy === 'output' ? { gradedBy: 'output' } : {}),
    ...(r.q.explanation ? { explanation: r.q.explanation } : {}),
    ...(withOrigin ? { module: r.q.module, subtopic: r.q.subtopic, difficulty: r.q.difficulty } : {}),
    // Code language (language-aware modules), stored on every quiz kind so the seed regenerates it.
    ...(isLang(r.q.lang) ? { lang: r.q.lang } : {}),
    ...(r.work && r.work.length ? { work: r.work.slice(0, 30) } : {}),
    ...(cleanGraph(r.graph) ? { graph: cleanGraph(r.graph) } : {}),
  };
}

/*
 * One guided question (live end screen or a stored guided attempt in History): its outcome
 * (icon + label, never colour alone), the prompt and the answer. `tagHtml` is already escaped;
 * `extra` = plain-text details ("1 wrong try"). Stored data is escaped / rendered safely.
 */
export function guidedItemHtml(q, outcome, tagHtml = '', extra = []) {
  const o = OUTCOMES[outcome] || OUTCOMES.solution;
  const multi = isPlainObj(q.answer);
  const answers = multi
    ? partListHtml(q.parts, (Array.isArray(q.parts) ? q.parts : Object.keys(q.answer).map(id => ({ id, label: id }))).map(p => ({ id: p.id, label: p.label, correct: null })), undefined, q.answer, 'review-parts', partColsOf(q))
    : `<p class="review-answers">Answer: <strong>${answerInline(q.answer ?? '', q.choiceCols)}</strong></p>`;
  return `<li class="review-item guided-item is-${o.cls}">
      <div class="review-mark">${icon(o.icon)}<span class="sr-only">${esc(o.label)}</span></div>
      <div class="review-body">
        ${tagHtml}
        <p class="guided-outcome">${esc(o.label)}${extra.length ? ` <span class="muted">· ${esc(extra.join(', '))}</span>` : ''}</p>
        <div class="prose">${renderPrompt(q.prompt)}</div>
        ${answers}
        ${q.explanation ? `<details><summary>Explanation</summary><div class="prose">${renderMarkdown(q.explanation)}</div></details>` : ''}
      </div>
    </li>`;
}

// Per-module score/total table for mixed quizzes. `qs` = [{ module, moduleTitle?, domainTitle?, correct, credit? }].
// `titleFor(moduleId)` optionally returns { module, domain } titles for stored questions.
export function moduleBreakdown(qs, titleFor) {
  const groups = new Map();
  for (const q of qs) {
    const id = typeof q.module === 'string' ? q.module : '';
    if (!groups.has(id)) {
      const t = titleFor ? titleFor(id) : null;
      groups.set(id, {
        label: [t?.domain ?? q.domainTitle, t?.module ?? q.moduleTitle ?? (id || 'Unknown')].filter(Boolean).join(' › '),
        correct: 0, total: 0,
      });
    }
    const g = groups.get(id);
    g.total++;
    g.correct += creditOf(q);
  }
  const rows = [...groups.values()].map(g => {
    const p = g.total ? Math.round((g.correct / g.total) * 100) : 0;
    return `<tr><th scope="row">${esc(g.label)}</th><td>${fmtScore(g.correct)}/${g.total}</td><td class="score ${scoreClass(p)}">${p}%</td></tr>`;
  }).join('');
  return `<section class="card breakdown">
    <h2>By module</h2>
    <div class="table-wrap"><table class="summary">
      <thead><tr><th scope="col">Module</th><th scope="col">Score</th><th scope="col">%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

const isPlainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ownVal = (o, k) => (isPlainObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// Part-by-part results: ✓/✗ with icon + label, the user's value, and the correct value when wrong.
// `parts` = [{ id, label, correct }] (labels/values may come from imported data: escaped).
// `defs` (optional) = full part definitions; only their labels are used as a fallback.
// `partCols` (optional) = { [partId]: column labels } for segmented choice parts (values shown as chips).
export function partListHtml(defs, parts, userAnswer, answer, cls = '', partCols = null) {
  const list = Array.isArray(parts) && parts.length ? parts
    : (Array.isArray(defs) ? defs.map(d => ({ id: d.id, label: d.label, correct: null })) : []);
  return `<ul class="part-results ${cls}">${list.map(p => {
    const ok = p.correct === true;
    const known = typeof p.correct === 'boolean';
    const close = !ok && p.close && typeof p.close.factor === 'number' ? p.close : null;
    const mine = ownVal(userAnswer, p.id);
    const right = ownVal(answer, p.id);
    const cols = isPlainObj(partCols) ? ownVal(partCols, p.id) : undefined;
    const closeText = close ? `Close · ${Math.round(Math.min(1, Math.max(0, close.factor)) * 100)}% credit` : '';
    const mark = known
      ? `${icon(ok ? 'circle-check' : close ? 'circle-dot' : 'circle-x')}<span class="sr-only">${ok ? 'Correct' : close ? esc(closeText) : 'Incorrect'}</span>`
      : '';
    return `<li class="part-result ${known ? (ok ? 'good' : close ? 'partial' : 'bad') : ''}">
      <span class="part-result-mark">${mark}</span>
      <span class="part-result-body"><span class="part-result-label">${esc(p.label || p.id)}${close ? ` <span class="part-result-close">${esc(closeText)}</span>` : ''}</span>
        <span class="part-result-values">${mine === undefined ? '' : `Your answer: <strong>${segsOf(mine, cols) ? answerInline(mine, cols) : esc(String(mine) === '' ? '(blank)' : String(mine))}</strong>`}${!ok && right !== undefined ? `${mine === undefined ? '' : ' · '}Correct: <strong>${answerInline(right, cols)}</strong>` : ''}</span></span>
    </li>`;
  }).join('')}</ul>`;
}

// `showTag`: true = questionTag(), or a function (q) -> tag HTML (already escaped).
// `r.credit` (or the stored question's `credit`) picks the state: correct, partly correct or incorrect.
export function reviewItem(r, showTag = false) {
  const q = r.q ?? r;
  const credit = typeof r.credit === 'number' ? Math.min(1, Math.max(0, r.credit)) : creditOf({ credit: q.credit, correct: r.correct ?? q.correct });
  const correctFlag = r.correct ?? q.correct;
  const state = correctFlag === true ? 'correct' : creditState(credit);
  // Blocks mode (dual questions) and close-answer credit, from the run or the stored question.
  const mode = ['blocks', 'choose'].includes(r.mode ?? q.mode) ? (r.mode ?? q.mode) : null;
  const mult = typeof (r.multiplier ?? q.multiplier) === 'number' ? Math.min(1, Math.max(0, r.multiplier ?? q.multiplier)) : null;
  const fz = r.fuzzy ?? q.fuzzy;
  const close = correctFlag !== true && fz && typeof fz === 'object' && typeof fz.factor === 'number' ? Math.min(1, Math.max(0, fz.factor)) : null;
  const blocksText = mode ? `${mode === 'choose' ? 'Choose' : 'Blocks'}${mult !== null && mult < 1 ? ` ×${Number(mult.toFixed(2))}` : ''}` : '';
  const closeText = close !== null ? `Close · ${Math.round(close * 100)}% credit` : '';
  const nParts = Array.isArray(r.parts) ? r.parts.length : 0;
  const nRight = Array.isArray(r.parts) ? r.parts.filter(p => p.correct).length : 0;
  const answer = q.answer;
  const multi = isPlainObj(answer) || isPlainObj(r.userAnswer);
  const answers = multi
    ? partListHtml(q.parts, r.parts ?? q.parts, r.userAnswer, answer, 'review-parts', partColsOf(q))
    : `<p class="review-answers">Your answer: <strong>${segsOf(r.userAnswer, q.choiceCols) ? answerInline(r.userAnswer, q.choiceCols) : esc(r.userAnswer === '' ? '(blank)' : String(r.userAnswer ?? ''))}</strong>
        ${r.correct ? '' : ` · Correct: <strong>${answerInline(answer ?? '', q.choiceCols)}</strong>`}</p>`;
  const partialText = closeText || (nParts ? `Partly correct · ${nRight} of ${nParts} parts right` : 'Partly correct');
  const markIcon = state === 'correct' ? 'circle-check' : state === 'partial' ? 'circle-dot' : 'circle-x';
  const markText = (state === 'correct' ? 'Correct' : state === 'partial' ? partialText : 'Incorrect') + (blocksText ? ` · ${blocksText}` : '');
  return `<li class="review-item ${state === 'correct' ? 'good' : state === 'partial' ? 'partial' : 'bad'}">
    <div class="review-mark">${icon(markIcon)}<span class="sr-only">${esc(markText)}</span></div>
    <div class="review-body">
      ${typeof showTag === 'function' ? showTag(q) : showTag ? questionTag(q) : langRow(q)}
      ${state === 'partial' ? `<p class="review-partial">${icon('circle-dot')}<span>${esc(partialText)}</span></p>` : ''}
      ${blocksText ? `<p class="review-mode">${icon(mode === 'choose' ? 'list' : 'blocks')}<span>${state === 'correct' ? 'Correct · ' : ''}${esc(blocksText)}</span></p>` : ''}
      ${r.note ? `<p class="grade-note">${icon('info')}<span>${esc(r.note)}</span></p>`
        : correctFlag === true && (r.gradedBy ?? q.gradedBy) === 'output' ? `<p class="grade-note">${icon('info')}<span>Accepted: the output matches the expected result</span></p>` : ''}
      <div class="prose">${renderPrompt(q.prompt)}</div>
      ${answers}
      ${q.explanation ? `<details><summary>Explanation</summary><div class="prose">${renderMarkdown(q.explanation)}</div></details>` : ''}
      ${workHtml(r.work ?? q.work)}
      ${graphHtml(r.graph ?? q.graph, r.work ?? q.work)}
    </div>
  </li>`;
}

// "Your working": the calculator rows saved when the answer was checked. Escaped throughout.
function workHtml(work) {
  const rows = cleanWork(work);
  if (!rows) return '';
  const val = v => {
    if (v === null) return `<span class="work-err">${icon('circle-alert')}error</span>`;
    try { return `<span class="work-value">${esc(formatValue(v))}</span>`; } catch { return '<span class="work-err">error</span>'; }
  };
  return `<details class="work"><summary>${icon('calculator')} Your working</summary>
    <ol class="work-list">${rows.map(r =>
      `<li><code class="work-label">${esc(r.label)}</code><span class="work-eq">=</span><code class="work-expr">${esc(r.expr)}</code><span class="work-arrow" aria-hidden="true">→</span>${val(r.value)}</li>`).join('')}</ol>
  </details>`;
}

// "Your graph": the calculator's functions saved when the answer was checked, re-plotted by
// <sb-graph> (js/views/staticgraph.js) from the stored functions; references like _a use the saved
// working's values. Escaped throughout (the JSON attributes are escaped and re-validated on read).
function graphHtml(graph, work) {
  const g = cleanGraph(graph);
  if (!g) return '';
  const compiled = compileGraph(g, work);
  const values = cleanWork(work) || [];
  const fmtN = v => String(Number(v.toPrecision(6)));
  const v = g.view;
  const items = compiled.map(c => `<li class="graph-c${c.slot}${c.hidden ? ' is-hidden' : ''}">
      <span class="graph-swatch" aria-hidden="true"></span><code class="work-label">y${c.slot}</code><span class="work-eq">=</span><code class="work-expr">${esc(c.expr)}</code>${
      c.hidden ? '<span class="work-note">(hidden)</span>' : ''}${
      c.error ? `<span class="work-err">${icon('circle-alert')}${esc(c.error)}</span>` : ''}</li>`).join('');
  return `<details class="work work-graph"><summary>${icon('chart-spline')} Your graph</summary>
    <sb-graph class="static-graph" data-graph="${esc(JSON.stringify(g))}" data-work="${esc(JSON.stringify(values))}"></sb-graph>
    <ol class="work-list graph-list">${items}</ol>
    <p class="work-window">Window: x ${esc(fmtN(v.xmin))} to ${esc(fmtN(v.xmax))}, y ${esc(fmtN(v.ymin))} to ${esc(fmtN(v.ymax))}</p>
  </details>`;
}

export function crumbsHtml(parts) {
  // parts: [{ href?, label }] — labels are plain text.
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.map((p, i) => {
    const sep = i ? `<span class="crumb-sep" aria-hidden="true">›</span>` : '';
    return p.href ? `${sep}<a href="${p.href}">${i === 0 ? icon('house') : ''}${esc(p.label)}</a>` : `${sep}<span aria-current="page">${esc(p.label)}</span>`;
  }).join('')}</nav>`;
}

// ---- single-module quiz: #/q/<module>/<subtopic>/<difficulty> ----

export function render(root, params, ctx) {
  return renderCell(root, params, ctx, false);
}

// ---- guided practice: #/g/<module>/<subtopic>/<difficulty> (same params and `all` handling) ----
export function renderGuided(root, params, ctx) {
  return renderCell(root, params, ctx, true);
}

async function renderCell(root, { moduleId, subtopic, difficulty }, ctx, guidedMode) {
  let mod, st, domain;
  // "all" in either position = a whole-module quiz; its questions carry their own subtopic/difficulty.
  const whole = subtopic === ALL || difficulty === ALL;
  try {
    mod = await loadModule(moduleId);
    if (whole) {
      st = subtopic === ALL ? { id: ALL } : mod.subtopics.find(s => s.id === subtopic);
      if (!st || !allowedCells(mod, subtopic, difficulty).length) throw new Error('Unknown subtopic or difficulty.');
    } else {
      st = mod.subtopics.find(s => s.id === subtopic);
      if (!st || (Array.isArray(st.difficulties) && !st.difficulties.includes(difficulty))) throw new Error('Unknown subtopic or difficulty.');
    }
    domain = await domainOf(mod.id);
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Quiz not found', 'That module, subtopic or difficulty does not exist.');
    return;
  }
  // Guided: the optional "How to solve" notes (modules/<id>/guide.md).
  const guide = guidedMode ? parseGuide(await loadGuide(mod.id).catch(() => null)) : null;
  if (!ctx.alive()) return;
  setCookie('lastModule', mod.id);
  setCookie('lastDifficulty', difficulty);
  // The module page's Practice | Guided switch follows the last quiz kind opened in this tab.
  setQuizMode(guidedMode ? GUIDED : PRACTICE);

  const moduleHref = `#/m/${hashPart(mod.id)}`;
  const modTitle = String(mod.title ?? mod.id);
  const crumbs = crumbsHtml([
    { href: '#/', label: 'Home' },
    ...(domain ? [{ href: `#/d/${hashPart(domain.id)}`, label: domain.title }] : []),
    { href: moduleHref, label: modTitle },
  ]);

  const stTitle = subtopicLabel(st.id, st.title);
  await runQuiz(root, ctx, {
    build: () => buildQuiz(mod.id, st.id, difficulty),
    title: `${esc(modTitle)} · ${esc(stTitle)} · ${difficultyHtml(difficulty)}`,
    cardTags: originTags(domain?.id, domain?.title, modTitle, stTitle, difficulty === ALL ? null : difficulty),
    // Whole-module quizzes tag each question with the subtopic/difficulty it came from.
    ...(whole ? { tagsFor: cellTag, breakdown: false } : {}),
    crumbs,
    backHref: moduleHref,
    backLabel: 'Module',
    backIcon: 'layout-grid',
    showTags: false,
    calculator: mod.calculator !== false,
    moduleId: mod.id,
    difficulty,
    ...(guidedMode ? {
      // Per-question subtopic (whole-module quizzes) or the route's own one.
      guided: { guideFor: q => guideHtml(guide, q.subtopicTitle ?? stTitle, q.subtopic ?? st.id) },
      practiceHref: `#/q/${hashPart(mod.id)}/${hashPart(st.id)}/${hashPart(difficulty)}`,
    } : {}),
    toAttempt: results => ({
      module: mod.id, subtopic: st.id, difficulty,
      questions: results.map(r => storedQuestion(r, whole)),
    }),
  });
}
