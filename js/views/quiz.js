import { loadModule, loadGuide, domainOf, checkAnswer, buildQuiz, allowedCells, ALL } from '../lib/engine.js';
import { hintsFor, parseGuide, guideHtml, setQuizMode, OUTCOMES, GUIDED, PRACTICE } from './guided.js';
import { saveAttempt, setCookie, getCookie, cleanWork, creditOf, roundScore } from '../lib/storage.js';
import { renderMarkdown, renderInline } from '../lib/markdown.js';
import { formatValue } from '../lib/calc.js';
import { esc, icon, icons, cap, errorBox, hashPart, scoreClass, domClass, tag, fmtScore, difficultyLabel, difficultyHtml, difficultyTag, subtopicLabel } from './ui.js';
import { mountCalculator } from './calculator.js';
import { isLang, langTitle } from '../lib/languages.js';

// The calculator sheet survives a reload: only the first quiz after page load, on the same
// address it was opened on, may restore it from sessionStorage. Every other run starts empty.
const BOOT_HASH = typeof location !== 'undefined' ? location.hash : '';
let restoreOnBoot = true;
const CALC_KEY = 'studyblock:calc';
const CALC_PANEL_COOKIE = 'calcPanel'; // "closed" = desktop panel collapsed
const DESKTOP_CALC = '(min-width: 900px)';
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

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
const SEG_CLASS = { correct: 'is-correct', partial: 'is-partial', wrong: 'is-wrong' };

// Plain-text parts; tag() escapes them.
function originTags(domainId, domainTitle, moduleTitle, subtopicTitle, difficulty, lang) {
  const where = [domainTitle, moduleTitle].filter(Boolean).join(' › ');
  // Expert gets its own pill (flame icon + label); other difficulties share the subtopic pill.
  const expert = difficulty === 'expert';
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
  let gs = null;          // current question: { tries, hintsShown, partHints, hints, source }
  let gResults = [];      // [{ q, outcome: 'first'|'assisted'|'solution', tries, hints }]
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
    const target = root.querySelector('#answer:not(:disabled)') || root.querySelector('#next') || root.querySelector('.choice:not(:disabled)');
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
    const typed = isMulti(q) ? partOf(q)(lastPart)?.answerType !== 'choice' : q.answerType !== 'choice';
    calc.setUseEnabled(on && typed && phase === 'answer',
      !typed ? 'Use fills typed answers. For this question, pick one of the choices.'
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
        : i < results.length ? SEG_CLASS[creditState(results[i].credit)] : (i === idx ? 'is-current' : '');
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
        <div class="choices part-choices" role="group" aria-labelledby="part-${esc(p.id)}-ask" data-part="${esc(p.id)}">${(p.choices || []).map((c, j) =>
          `<button type="button" class="btn choice part-choice" data-part="${esc(p.id)}" data-i="${j}" aria-pressed="false"><span class="choice-text">${renderInline(c)}</span><span class="choice-mark"></span></button>`).join('')}</div>
        ${partHintHtml(p)}
      </div>`;
    }
    const num = p.answerType === 'number';
    return `<div class="part" data-part="${esc(p.id)}">
      ${head}
      <label class="part-ask" for="part-${esc(p.id)}">${renderInline(p.ask || p.label)}</label>
      <input id="part-${esc(p.id)}" class="answer-input part-input" data-part="${esc(p.id)}" type="text" ${num ? 'inputmode="decimal"' : ''}
        enterkeyhint="${last ? 'go' : 'next'}" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${num ? 'Type a number' : 'Type your answer'}">
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
  const allFilled = q => Object.values(readParts(q)).every(isFilled);

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
    for (let k = 1; k <= ids.length; k++) {
      const id = ids[(start + k) % ids.length];
      if (!isFilled(vals[id])) { focusPart(id, true); return; }
    }
    if (!isFilled(vals[fromId])) { focusPart(fromId, true); return; }
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
    form.addEventListener('input', () => updateCheck(q));
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

  function inputHtml(q) {
    if (isMulti(q)) {
      const n = (q.parts || []).length;
      return `<form class="answer-form multi-form" id="answer-form" autocomplete="off" novalidate>
        ${(q.parts || []).map((p, i) => partHtml(p, i, n)).join('')}
      </form>`;
    }
    if (q.answerType === 'choice') {
      return `<div class="choices">${(q.choices || []).map((c, i) =>
        `<button type="button" class="btn choice" data-i="${i}"><span class="choice-key" aria-hidden="true">${i + 1}</span><span class="choice-text">${renderInline(c)}</span><span class="choice-mark"></span></button>`).join('')}</div>`;
    }
    const num = q.answerType === 'number';
    // The Check button lives in the action bar (sticky on phones) and targets this form by id.
    return `<form class="answer-form" id="answer-form" autocomplete="off">
      <label class="field-label" for="answer">Your answer</label>
      <input id="answer" class="answer-input" type="text" ${num ? 'inputmode="decimal"' : ''} enterkeyhint="go"
        autocapitalize="off" autocorrect="off"
        placeholder="${num ? 'Type a number' : 'Type your answer'}" spellcheck="false">
    </form>`;
  }

  function actionBar(q) {
    if (isMulti(q)) {
      return `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> for the next part</span></p>
        ${calcButton(q)}<button type="submit" form="answer-form" class="btn btn-primary" id="check" disabled>${icon('check')} Check</button>`;
    }
    if (q.answerType === 'choice') {
      const n = Math.min((q.choices || []).length, 9);
      return `<p class="action-hint"><span class="action-hint-tap">Tap an answer</span>
        <span class="action-hint-key">Press <kbd>1</kbd>${n > 1 ? `–<kbd>${n}</kbd>` : ''} to answer</span></p>${calcButton(q)}`;
    }
    return `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to check</span></p>
      ${calcButton(q)}<button type="submit" form="answer-form" class="btn btn-primary">${icon('check')} Check</button>`;
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
    return `<div class="guided-tools" id="guided-tools">
        ${hintBtn}
        <button type="button" class="btn" id="show-solution">${icon('eye')}<span>Show solution</span></button>
        ${keyHint}
      </div>`;
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
    gs = { tries: 0, hintsShown: 0, partHints: 0, ...hintsFor(q) };
    const tools = root.querySelector('#guided-tools-slot');
    if (tools) tools.outerHTML = guidedToolsHtml();
    root.querySelector('#hint-btn')?.addEventListener('click', () => revealHint());
    root.querySelector('#show-solution')?.addEventListener('click', showSolution);
    root.querySelectorAll('.part-hint-btn').forEach(b => b.addEventListener('click', () => revealPartHint(b.dataset.partHint)));
    root.querySelector('#guide-card')?.addEventListener('toggle', e => { guideOpen = e.currentTarget.open; });
    // A wrong mark clears as soon as the user changes that field.
    const form = root.querySelector('#answer-form');
    form?.addEventListener('input', e => {
      e.target.classList?.remove('is-wrong');
      e.target.closest?.('.part')?.classList.remove('is-wrong');
    });
    form?.addEventListener('click', e => {
      const b = e.target.closest?.('.part-choice');
      if (b && !b.disabled) b.closest('.part')?.classList.remove('is-wrong');
    });
  }

  function showQuestion() {
    phase = 'answer';
    const q = questions[idx];
    const main = root.querySelector('#quiz-main');
    if (!main) return;
    main.innerHTML = `${header()}
      ${guided ? guideCardHtml(q) : ''}
      <section class="card question${guided ? ' is-guided' : ''}">
        ${opts.tagsFor ? opts.tagsFor(q) : opts.showTags ? questionTag(q) : (opts.cardTags ? `<p class="q-tag tag-row">${opts.cardTags}${langTag(q)}</p>` : langRow(q))}
        <div class="prompt prose">${renderPrompt(q.prompt)}</div>
        ${guided ? '<div class="guided-hints" aria-live="polite"><ol class="hint-list" id="hint-list" aria-label="Hints"></ol></div>' : ''}
        ${inputHtml(q)}
        ${guided ? '<div id="guided-tools-slot"></div>' : ''}
        <div id="feedback"${guided ? ' aria-live="polite"' : ''}></div>
        <div class="action-bar" id="action-bar">${actionBar(q)}</div>
      </section>`;
    if (isMulti(q)) lastPart = q.parts?.[0]?.id ?? null;
    if (guided) bindGuided(q);
    // Given values: the previous question's untouched pre-filled rows go; this one's (if any) come in.
    calc?.setGiven(calcAllowed(q) && Array.isArray(q.given) ? q.given : []);
    applyCalc(q);
    icons();
    if (isMulti(q)) { bindMulti(q); return; }
    const form = root.querySelector('.answer-form');
    if (form) {
      form.addEventListener('submit', e => { e.preventDefault(); submit(root.querySelector('#answer').value); });
      root.querySelector('#answer').focus();
    }
    root.querySelectorAll('.choice').forEach(b =>
      b.addEventListener('click', () => submit(q.choices[+b.dataset.i], +b.dataset.i)));
  }

  // ---- guided checking: unlimited tries; right parts lock, wrong ones stay editable ----

  const markHtml = ok => `${icon(ok ? 'circle-check' : 'circle-x')}<span class="sr-only">${ok ? 'Correct' : 'Not correct'}</span>`;

  function lockPart(p, el) {
    if (el.classList.contains('is-locked')) return;
    el.classList.remove('is-wrong');
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

  function markPartWrong(p, el) {
    el.classList.add('is-wrong');
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
    if (multi) {
      if (!value || typeof value !== 'object' || !Object.values(value).every(isFilled)) { enterMulti(q, lastPart); return; }
    } else if (q.answerType === 'choice') {
      const b = root.querySelector(`.choices .choice[data-i="${Number(choiceIndex)}"]`);
      if (!b || b.disabled) return;
    } else if (!String(value ?? '').trim()) {
      root.querySelector('#answer')?.focus();
      return;
    }
    const res = checkAnswer(q, value);
    let firstWrong = null;
    if (multi) {
      for (const pr of res.parts) {
        const p = partOf(q)(pr.id);
        const el = partEl(pr.id);
        if (!p || !el) continue;
        if (pr.correct) lockPart(p, el);
        else { markPartWrong(p, el); firstWrong = firstWrong || pr.id; }
      }
      if (res.correct) { solvedGuided(q, value, choiceIndex); return; }
    } else if (res) {
      solvedGuided(q, value, choiceIndex);
      return;
    } else if (q.answerType === 'choice') {
      const b = root.querySelector(`.choices .choice[data-i="${Number(choiceIndex)}"]`);
      b.classList.add('is-wrong');
      const m = b.querySelector('.choice-mark');
      if (m) m.innerHTML = markHtml(false);
      b.disabled = true;
    } else {
      root.querySelector('#answer')?.classList.add('is-wrong');
    }
    gs.tries++;
    const nRight = multi ? res.parts.filter(p => p.correct).length : 0;
    root.querySelector('#feedback').innerHTML = `<div class="feedback bad guided-retry">
        <p class="feedback-title">${icon('circle-x')}<span>Not quite, try again</span></p>
        <p class="feedback-sub">${multi ? `${nRight} of ${res.parts.length} parts right · ` : ''}Tries: ${gs.tries}</p>
      </div>`;
    icons();
    if (multi) {
      updateCheck(q);
      focusPart(firstWrong, true);
    } else if (q.answerType === 'choice') {
      root.querySelector('.choices .choice:not(:disabled)')?.focus();
    } else {
      const input = root.querySelector('#answer');
      input?.focus();
      input?.select();
    }
  }

  function solvedGuided(q, value, choiceIndex) {
    const multi = isMulti(q);
    if (!multi && q.answerType === 'choice') {
      const b = root.querySelector(`.choices .choice[data-i="${Number(choiceIndex)}"]`);
      if (b) {
        b.classList.add('is-correct');
        const m = b.querySelector('.choice-mark');
        if (m) m.innerHTML = markHtml(true);
      }
    } else if (!multi) {
      root.querySelector('#answer')?.classList.remove('is-wrong');
      root.querySelector('#answer')?.classList.add('is-correct');
    }
    endGuidedQuestion(q, gs.tries === 0 && hintsUsed() === 0 ? 'first' : 'assisted');
  }

  function showSolution() {
    if (!guided || phase !== 'answer' || !gs) return;
    const q = questions[idx];
    if (isMulti(q)) {
      // Reveal each unsolved part's answer in place.
      for (const p of q.parts || []) {
        const el = partEl(p.id);
        if (!el || el.classList.contains('is-locked')) continue;
        el.classList.remove('is-wrong');
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
    endGuidedQuestion(q, 'solution');
  }

  function endGuidedQuestion(q, outcome) {
    phase = 'feedback';
    const multi = isMulti(q);
    gResults.push({ q, outcome, tries: gs.tries, hints: hintsUsed() });
    applyCalc(q);
    root.querySelectorAll('.answer-form input, .choice, #check, .part-hint-btn').forEach(el => { el.disabled = true; });
    const tools = root.querySelector('#guided-tools');
    if (tools) tools.hidden = true;

    const seg = root.querySelector(`#seg-progress > span:nth-child(${idx + 1})`);
    if (seg) { seg.classList.remove('is-current'); seg.classList.add('is-done'); }
    root.querySelector('#seg-progress')?.setAttribute('aria-valuetext', progressText());

    const last = idx === questions.length - 1;
    const bits = [];
    if (gs.tries) bits.push(`${gs.tries} wrong ${gs.tries === 1 ? 'try' : 'tries'}`);
    if (hintsUsed()) bits.push(`${hintsUsed()} ${hintsUsed() === 1 ? 'hint' : 'hints'}`);
    let box;
    if (outcome === 'solution') {
      const locked = id => !!partEl(id)?.classList.contains('is-locked');
      const mine = multi ? Object.fromEntries(Object.entries(readParts(q)).filter(([id]) => locked(id))) : null;
      const answers = multi
        ? partListHtml(q.parts, q.parts.map(p => ({ id: p.id, label: p.label, correct: locked(p.id) ? true : null })), mine, q.answer, 'feedback-parts')
        : `<p>Answer: <strong>${renderInline(String(q.answer))}</strong></p>`;
      box = `<div class="feedback info">
        <p class="feedback-title">${icon('eye')}<span>Solved with solution</span></p>
        ${answers}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    } else {
      box = `<div class="feedback good">
        <p class="feedback-title">${icon('circle-check')}<span>Correct</span>${outcome === 'first'
          ? '<span class="feedback-sub">· first try</span>'
          : `<span class="feedback-sub">· after ${esc(bits.join(', '))}</span>`}</p>
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
  }

  function submit(value, choiceIndex) {
    if (guided) { guidedSubmit(value, choiceIndex); return; }
    if (phase !== 'answer') return;
    const q = questions[idx];
    const multi = isMulti(q);
    if (multi) {
      if (!value || typeof value !== 'object' || !Object.values(value).every(isFilled)) { enterMulti(q, lastPart); return; }
    } else if (q.answerType !== 'choice' && !String(value ?? '').trim()) {
      root.querySelector('#answer')?.focus();
      return;
    }
    phase = 'feedback';
    const res = checkAnswer(q, value);
    const correct = multi ? !!res.correct : res;
    const credit = multi ? res.credit : (correct ? 1 : 0);
    const state = creditState(credit);
    const partResults = multi ? res.parts : null;
    // Snapshot of the calculator sheet at check time ("Your working"), when it was shown.
    const work = calcAllowed(q) && calc ? cleanWork(calc.snapshot()) : null;
    const userAnswer = multi
      ? Object.fromEntries((q.parts || []).map(p => [p.id, String(value[p.id] ?? '')]))
      : String(value ?? '');
    results.push({ q, userAnswer, correct, credit, ...(partResults ? { parts: partResults } : {}), ...(work ? { work } : {}) });
    applyCalc(q);

    root.querySelectorAll('.answer-form input, .action-bar button, .choice').forEach(el => { el.disabled = true; });
    if (multi) {
      for (const pr of partResults) {
        const p = partOf(q)(pr.id);
        const el = partEl(pr.id);
        if (!p || !el) continue;
        el.classList.add(pr.correct ? 'is-correct' : 'is-wrong');
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
          el.querySelector('.part-input')?.classList.add(pr.correct ? 'is-correct' : 'is-wrong');
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
    } else {
      root.querySelector('#answer')?.classList.add(correct ? 'is-correct' : 'is-wrong');
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
    const title = state === 'correct'
      ? `${icon('circle-check')} Correct`
      : state === 'partial'
        ? `${icon('circle-dot')} Partly correct ·${partsSub}`
        : `${icon('circle-x')} Incorrect${partsSub}`;
    root.querySelector('#feedback').innerHTML = `
      <div class="feedback ${state === 'correct' ? 'good' : state === 'partial' ? 'partial' : 'bad'}">
        <p class="feedback-title">${title}</p>
        ${multi ? partListHtml(q.parts, partResults, userAnswer, q.answer, 'feedback-parts')
          : correct ? '' : `<p>Correct answer: <strong>${renderInline(String(q.answer))}</strong></p>`}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    root.querySelector('#action-bar').innerHTML =
      `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to continue</span></p>
      ${calcButton(q)}<button type="button" class="btn btn-primary" id="next">${last ? `${icon('flag')} Finish` : `Next question ${icon('arrow-right')}`}</button>`;
    icons();
    const next = root.querySelector('#next');
    next.addEventListener('click', advance);
    next.focus();
  }

  function advance() {
    if (phase !== 'feedback') return;
    idx++;
    if (idx < questions.length) showQuestion();
    else finish();
  }

  // Guided end screen: no score, nothing saved (no saveAttempt, no history, no stats).
  function finishGuided() {
    phase = 'done';
    teardownCalc();
    const count = k => gResults.filter(r => r.outcome === k).length;
    const counts = ['first', 'assisted', 'solution'].map(k =>
      `<li class="guided-count is-${OUTCOMES[k].cls}">${icon(OUTCOMES[k].icon)}<strong>${count(k)}</strong><span>${esc(OUTCOMES[k].label)}</span></li>`).join('');
    root.innerHTML = `<div class="page-narrow">
      ${opts.crumbs}
      <section class="card result-summary guided-summary">
        <p class="eyebrow">${icon('compass')} Guided set complete</p>
        <h1 class="quiz-title">${opts.title}</h1>
        <p class="muted guided-note">Not scored: nothing was added to your history or stats.</p>
        <ul class="guided-counts">${counts}</ul>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="retry">${icon('rotate-ccw')} Another guided set</button>
          ${opts.practiceHref ? `<a class="btn" href="${opts.practiceHref}">${icon('play')} Practice for real</a>` : ''}
          <a class="btn" href="${opts.backHref}">${icon(opts.backIcon || 'layout-grid')} ${esc(opts.backLabel)}</a>
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
    const q = r.q;
    const o = OUTCOMES[r.outcome] || OUTCOMES.solution;
    const extra = [];
    if (r.tries) extra.push(`${r.tries} wrong ${r.tries === 1 ? 'try' : 'tries'}`);
    if (r.hints) extra.push(`${r.hints} ${r.hints === 1 ? 'hint' : 'hints'}`);
    const answers = isMulti(q)
      ? partListHtml(q.parts, q.parts.map(p => ({ id: p.id, label: p.label, correct: null })), undefined, q.answer, 'review-parts')
      : `<p class="review-answers">Answer: <strong>${renderInline(String(q.answer ?? ''))}</strong></p>`;
    return `<li class="review-item guided-item is-${o.cls}">
      <div class="review-mark">${icon(o.icon)}</div>
      <div class="review-body">
        ${opts.tagsFor ? opts.tagsFor(q) : langRow(q)}
        <p class="guided-outcome">${esc(o.label)}${extra.length ? ` <span class="muted">· ${esc(extra.join(', '))}</span>` : ''}</p>
        <div class="prose">${renderPrompt(q.prompt)}</div>
        ${answers}
        ${q.explanation ? `<details><summary>Explanation</summary><div class="prose">${renderMarkdown(q.explanation)}</div></details>` : ''}
      </div>
    </li>`;
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
        <div class="result-meter" aria-hidden="true">${results.map(r => `<span class="${SEG_CLASS[creditState(r.credit)]}"></span>`).join('')}</div>
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
  }

  function onKey(e) {
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
      } else if (phase === 'answer' && questions[idx]?.answerType !== 'choice') {
        e.preventDefault();
        submit(root.querySelector('#answer')?.value);
      } else if (phase === 'feedback') {
        e.preventDefault();
        advance();
      }
    } else if (phase === 'answer' && questions[idx]?.answerType === 'choice' && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
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

  await start();
}

// Stored question fields for an attempt (mixed quizzes also keep per-question origin).
export function storedQuestion(r, withOrigin) {
  return {
    seed: r.q.seed, prompt: r.q.prompt, answer: r.q.answer, userAnswer: r.userAnswer, correct: r.correct,
    // Partial credit 0–1 (multi-part: parts right / parts total); `correct` stays the strict flag.
    credit: typeof r.credit === 'number' ? roundScore(r.credit) : (r.correct ? 1 : 0),
    // Multi-part: answer/userAnswer are { [partId]: value } objects, plus per-part results.
    ...(Array.isArray(r.parts) ? { parts: r.parts.map(p => ({ id: p.id, label: p.label, correct: !!p.correct })) } : {}),
    ...(r.q.explanation ? { explanation: r.q.explanation } : {}),
    ...(withOrigin ? { module: r.q.module, subtopic: r.q.subtopic, difficulty: r.q.difficulty } : {}),
    // Code language (language-aware modules), stored on every quiz kind so the seed regenerates it.
    ...(isLang(r.q.lang) ? { lang: r.q.lang } : {}),
    ...(r.work && r.work.length ? { work: r.work.slice(0, 30) } : {}),
  };
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
export function partListHtml(defs, parts, userAnswer, answer, cls = '') {
  const list = Array.isArray(parts) && parts.length ? parts
    : (Array.isArray(defs) ? defs.map(d => ({ id: d.id, label: d.label, correct: null })) : []);
  return `<ul class="part-results ${cls}">${list.map(p => {
    const ok = p.correct === true;
    const known = typeof p.correct === 'boolean';
    const mine = ownVal(userAnswer, p.id);
    const right = ownVal(answer, p.id);
    const mark = known
      ? `${icon(ok ? 'circle-check' : 'circle-x')}<span class="sr-only">${ok ? 'Correct' : 'Incorrect'}</span>`
      : '';
    return `<li class="part-result ${known ? (ok ? 'good' : 'bad') : ''}">
      <span class="part-result-mark">${mark}</span>
      <span class="part-result-body"><span class="part-result-label">${esc(p.label || p.id)}</span>
        <span class="part-result-values">${mine === undefined ? '' : `Your answer: <strong>${esc(String(mine) === '' ? '(blank)' : String(mine))}</strong>`}${!ok && right !== undefined ? `${mine === undefined ? '' : ' · '}Correct: <strong>${renderInline(String(right))}</strong>` : ''}</span></span>
    </li>`;
  }).join('')}</ul>`;
}

// `showTag`: true = questionTag(), or a function (q) -> tag HTML (already escaped).
// `r.credit` (or the stored question's `credit`) picks the state: correct, partly correct or incorrect.
export function reviewItem(r, showTag = false) {
  const q = r.q ?? r;
  const credit = typeof r.credit === 'number' ? Math.min(1, Math.max(0, r.credit)) : creditOf({ credit: q.credit, correct: r.correct ?? q.correct });
  const state = creditState(credit);
  const nParts = Array.isArray(r.parts) ? r.parts.length : 0;
  const nRight = Array.isArray(r.parts) ? r.parts.filter(p => p.correct).length : 0;
  const answer = q.answer;
  const multi = isPlainObj(answer) || isPlainObj(r.userAnswer);
  const answers = multi
    ? partListHtml(q.parts, r.parts ?? q.parts, r.userAnswer, answer, 'review-parts')
    : `<p class="review-answers">Your answer: <strong>${esc(r.userAnswer === '' ? '(blank)' : String(r.userAnswer ?? ''))}</strong>
        ${r.correct ? '' : ` · Correct: <strong>${renderInline(String(answer ?? ''))}</strong>`}</p>`;
  const partialText = nParts ? `Partly correct · ${nRight} of ${nParts} parts right` : 'Partly correct';
  const markIcon = state === 'correct' ? 'circle-check' : state === 'partial' ? 'circle-dot' : 'circle-x';
  const markText = state === 'correct' ? 'Correct' : state === 'partial' ? partialText : 'Incorrect';
  return `<li class="review-item ${state === 'correct' ? 'good' : state === 'partial' ? 'partial' : 'bad'}">
    <div class="review-mark">${icon(markIcon)}<span class="sr-only">${esc(markText)}</span></div>
    <div class="review-body">
      ${typeof showTag === 'function' ? showTag(q) : showTag ? questionTag(q) : langRow(q)}
      ${state === 'partial' ? `<p class="review-partial">${esc(partialText)}</p>` : ''}
      <div class="prose">${renderPrompt(q.prompt)}</div>
      ${answers}
      ${q.explanation ? `<details><summary>Explanation</summary><div class="prose">${renderMarkdown(q.explanation)}</div></details>` : ''}
      ${workHtml(r.work ?? q.work)}
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
