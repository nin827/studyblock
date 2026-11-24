import { loadModule, domainOf, checkAnswer, buildQuiz } from '../lib/engine.js';
import { saveAttempt, setCookie } from '../lib/storage.js';
import { renderMarkdown, renderInline } from '../lib/markdown.js';
import { esc, icon, icons, cap, errorBox, hashPart, scoreClass, domClass, tag } from './ui.js';

export function renderPrompt(src) {
  const s = String(src ?? '');
  return s.includes('\n') ? renderMarkdown(s) : `<p>${renderInline(s)}</p>`;
}

// "Domain › Module" + "subtopic · difficulty" tags for questions that carry their own origin.
// All parts are optional (older stored attempts have none). `q.domain` (id) picks the tint.
export function questionTag(q) {
  if (!q || typeof q.module !== 'string') return '';
  return `<p class="q-tag tag-row">${originTags(q.domain, q.domainTitle, q.moduleTitle ?? q.module, q.subtopicTitle ?? q.subtopic, q.difficulty)}</p>`;
}

// Plain-text parts; tag() escapes them.
function originTags(domainId, domainTitle, moduleTitle, subtopicTitle, difficulty) {
  const where = [domainTitle, moduleTitle].filter(Boolean).join(' › ');
  const rest = [subtopicTitle, difficulty ? cap(difficulty) : null].filter(Boolean).join(' · ');
  return (where ? tag(where, domClass(domainId)) : '') + (rest ? tag(rest) : '');
}

/*
 * Shared quiz runner used by single-module and mixed quizzes.
 * opts:
 *   build()          async -> questions[]
 *   title            HTML (already escaped)
 *   crumbs           HTML for the breadcrumb nav (already escaped)
 *   backHref/backLabel/backIcon   secondary button on the results screen
 *   showTags         show questionTag() above each prompt / in the review
 *   cardTags         optional HTML (already escaped) shown above every prompt when showTags is off
 *   toAttempt(results)  -> attempt fields (module/subtopic/difficulty/questions/score/total)
 */
export async function runQuiz(root, ctx, opts) {
  let questions = [];
  let idx = 0;
  let phase = 'loading'; // loading | answer | feedback | done
  let results = [];

  async function start() {
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
    showQuestion();
  }

  const correctCount = () => results.filter(r => r.correct).length;
  const progressText = () => `Question ${Math.min(idx + 1, questions.length)} of ${questions.length}, ${correctCount()} correct`;

  // Segmented progress: one segment per question, coloured correct / wrong / current.
  function header() {
    const n = questions.length;
    const segs = questions.map((_, i) => {
      const cls = i < results.length ? (results[i].correct ? 'is-correct' : 'is-wrong') : (i === idx ? 'is-current' : '');
      return `<span class="${cls}"></span>`;
    }).join('');
    return `${opts.crumbs}
      <div class="quiz-top">
        <div class="quiz-bar">
          <a class="quiz-quit" href="${opts.backHref}" aria-label="Quit quiz">${icon('x')}<span class="quiz-quit-label">Quit</span></a>
          <div class="quiz-heading">
            <h1 class="quiz-title">${opts.title}</h1>
            <p class="quiz-meta">Question <strong>${Math.min(idx + 1, n)}</strong> of ${n}</p>
          </div>
          <span class="quiz-score">${icon('circle-check')}<span><span id="quiz-correct">${correctCount()}</span> correct</span></span>
        </div>
        <div class="seg-progress ${n > 20 ? 'is-dense' : ''}" id="seg-progress" role="progressbar" aria-label="Quiz progress"
          aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${idx}" aria-valuetext="${esc(progressText())}">${segs}</div>
      </div>`;
  }

  function inputHtml(q) {
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
    if (q.answerType === 'choice') {
      const n = Math.min((q.choices || []).length, 9);
      return `<p class="action-hint"><span class="action-hint-tap">Tap an answer</span>
        <span class="action-hint-key">Press <kbd>1</kbd>${n > 1 ? `–<kbd>${n}</kbd>` : ''} to answer</span></p>`;
    }
    return `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to check</span></p>
      <button type="submit" form="answer-form" class="btn btn-primary">${icon('check')} Check</button>`;
  }

  function showQuestion() {
    phase = 'answer';
    const q = questions[idx];
    root.innerHTML = `<div class="page-narrow quiz-page">${header()}
      <section class="card question">
        ${opts.showTags ? questionTag(q) : (opts.cardTags ? `<p class="q-tag tag-row">${opts.cardTags}</p>` : '')}
        <div class="prompt prose">${renderPrompt(q.prompt)}</div>
        ${inputHtml(q)}
        <div id="feedback"></div>
        <div class="action-bar" id="action-bar">${actionBar(q)}</div>
      </section></div>`;
    icons();
    const form = root.querySelector('.answer-form');
    if (form) {
      form.addEventListener('submit', e => { e.preventDefault(); submit(root.querySelector('#answer').value); });
      root.querySelector('#answer').focus();
    }
    root.querySelectorAll('.choice').forEach(b =>
      b.addEventListener('click', () => submit(q.choices[+b.dataset.i], +b.dataset.i)));
  }

  function submit(value, choiceIndex) {
    if (phase !== 'answer') return;
    const q = questions[idx];
    if (q.answerType !== 'choice' && !String(value ?? '').trim()) {
      root.querySelector('#answer')?.focus();
      return;
    }
    phase = 'feedback';
    const correct = checkAnswer(q, value);
    results.push({ q, userAnswer: String(value ?? ''), correct });

    root.querySelectorAll('.answer-form input, .action-bar button, .choice').forEach(el => { el.disabled = true; });
    if (q.answerType === 'choice') {
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
    if (seg) { seg.classList.remove('is-current'); seg.classList.add(correct ? 'is-correct' : 'is-wrong'); }
    const counter = root.querySelector('#quiz-correct');
    if (counter) counter.textContent = String(correctCount());
    root.querySelector('#seg-progress')?.setAttribute('aria-valuetext', progressText());

    const last = idx === questions.length - 1;
    root.querySelector('#feedback').innerHTML = `
      <div class="feedback ${correct ? 'good' : 'bad'}">
        <p class="feedback-title">${correct ? `${icon('circle-check')} Correct` : `${icon('circle-x')} Incorrect`}</p>
        ${correct ? '' : `<p>Correct answer: <strong>${renderInline(String(q.answer))}</strong></p>`}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    root.querySelector('#action-bar').innerHTML =
      `<p class="action-hint desktop-only"><span class="action-hint-key">Press <kbd>Enter</kbd> to continue</span></p>
      <button type="button" class="btn btn-primary" id="next">${last ? `${icon('flag')} Finish` : `Next question ${icon('arrow-right')}`}</button>`;
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

  function finish() {
    phase = 'done';
    const score = results.filter(r => r.correct).length;
    const total = results.length;
    saveAttempt({ ...opts.toAttempt(results), score, total });
    const pct = total ? Math.round((score / total) * 100) : 0;
    root.innerHTML = `<div class="page-narrow">
      ${opts.crumbs}
      <section class="card result-summary">
        <p class="eyebrow">Quiz complete</p>
        <h1 class="quiz-title">${opts.title}</h1>
        <p class="big-score score ${scoreClass(pct)}">${score} / ${total} <span>(${pct}%)</span></p>
        <div class="result-meter" aria-hidden="true">${results.map(r => `<span class="${r.correct ? 'is-correct' : 'is-wrong'}"></span>`).join('')}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="retry">${icon('rotate-ccw')} Retry</button>
          <a class="btn" href="${opts.backHref}">${icon(opts.backIcon || 'layout-grid')} ${esc(opts.backLabel)}</a>
          <a class="btn" href="#/results">${icon('history')} History</a>
        </div>
      </section>
      ${opts.showTags ? moduleBreakdown(results.map(r => ({ ...r.q, correct: r.correct }))) : ''}
      <section class="card">
        <h2>Review</h2>
        <ol class="review">${results.map(r => reviewItem(r, opts.showTags)).join('')}</ol>
      </section></div>`;
    icons();
    root.querySelector('#retry').addEventListener('click', start);
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.repeat && !e.isComposing) {
      if (phase === 'answer' && questions[idx]?.answerType !== 'choice') {
        e.preventDefault();
        submit(root.querySelector('#answer')?.value);
      } else if (phase === 'feedback') {
        e.preventDefault();
        advance();
      }
    } else if (phase === 'answer' && questions[idx]?.answerType === 'choice' && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = +e.key - 1;
      const q = questions[idx];
      if (i < (q.choices || []).length) { e.preventDefault(); submit(q.choices[i], i); }
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
    ...(r.q.explanation ? { explanation: r.q.explanation } : {}),
    ...(withOrigin ? { module: r.q.module, subtopic: r.q.subtopic, difficulty: r.q.difficulty } : {}),
  };
}

// Per-module correct/total table for mixed quizzes. `qs` = [{ module, moduleTitle?, domainTitle?, correct }].
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
    if (q.correct) g.correct++;
  }
  const rows = [...groups.values()].map(g => {
    const p = g.total ? Math.round((g.correct / g.total) * 100) : 0;
    return `<tr><th scope="row">${esc(g.label)}</th><td>${g.correct}/${g.total}</td><td class="score ${scoreClass(p)}">${p}%</td></tr>`;
  }).join('');
  return `<section class="card breakdown">
    <h2>By module</h2>
    <div class="table-wrap"><table class="summary">
      <thead><tr><th scope="col">Module</th><th scope="col">Score</th><th scope="col">%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

export function reviewItem(r, showTag = false) {
  const q = r.q ?? r;
  const answer = q.answer;
  return `<li class="review-item ${r.correct ? 'good' : 'bad'}">
    <div class="review-mark">${icon(r.correct ? 'circle-check' : 'circle-x')}<span class="sr-only">${r.correct ? 'Correct' : 'Incorrect'}</span></div>
    <div class="review-body">
      ${showTag ? questionTag(q) : ''}
      <div class="prose">${renderPrompt(q.prompt)}</div>
      <p class="review-answers">Your answer: <strong>${esc(r.userAnswer === '' ? '(blank)' : r.userAnswer)}</strong>
        ${r.correct ? '' : ` · Correct: <strong>${renderInline(String(answer ?? ''))}</strong>`}</p>
      ${q.explanation ? `<details><summary>Explanation</summary><div class="prose">${renderMarkdown(q.explanation)}</div></details>` : ''}
    </div>
  </li>`;
}

export function crumbsHtml(parts) {
  // parts: [{ href?, label }] — labels are plain text.
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.map((p, i) => {
    const sep = i ? `<span class="crumb-sep" aria-hidden="true">›</span>` : '';
    return p.href ? `${sep}<a href="${p.href}">${i === 0 ? icon('house') : ''}${esc(p.label)}</a>` : `${sep}<span aria-current="page">${esc(p.label)}</span>`;
  }).join('')}</nav>`;
}

// ---- single-module quiz: #/q/<module>/<subtopic>/<difficulty> ----

export async function render(root, { moduleId, subtopic, difficulty }, ctx) {
  let mod, st, domain;
  try {
    mod = await loadModule(moduleId);
    st = mod.subtopics.find(s => s.id === subtopic);
    if (!st || (Array.isArray(st.difficulties) && !st.difficulties.includes(difficulty))) throw new Error('Unknown subtopic or difficulty.');
    domain = await domainOf(mod.id);
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Quiz not found', 'That module, subtopic or difficulty does not exist.');
    return;
  }
  if (!ctx.alive()) return;
  setCookie('lastModule', mod.id);
  setCookie('lastDifficulty', difficulty);

  const moduleHref = `#/m/${hashPart(mod.id)}`;
  const modTitle = String(mod.title ?? mod.id);
  const crumbs = crumbsHtml([
    { href: '#/', label: 'Home' },
    ...(domain ? [{ href: `#/d/${hashPart(domain.id)}`, label: domain.title }] : []),
    { href: moduleHref, label: modTitle },
  ]);

  await runQuiz(root, ctx, {
    build: () => buildQuiz(mod.id, st.id, difficulty),
    title: `${esc(modTitle)} · ${esc(st.title ?? st.id)} · ${esc(cap(difficulty))}`,
    cardTags: originTags(domain?.id, domain?.title, modTitle, String(st.title ?? st.id), difficulty),
    crumbs,
    backHref: moduleHref,
    backLabel: 'Module',
    backIcon: 'layout-grid',
    showTags: false,
    toAttempt: results => ({
      module: mod.id, subtopic: st.id, difficulty,
      questions: results.map(r => storedQuestion(r, false)),
    }),
  });
}
