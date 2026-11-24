import { loadModule, domainOf, checkAnswer, buildQuiz } from '../lib/engine.js';
import { saveAttempt, setCookie } from '../lib/storage.js';
import { renderMarkdown, renderInline } from '../lib/markdown.js';
import { esc, icon, icons, cap, errorBox, hashPart, scoreClass } from './ui.js';

export function renderPrompt(src) {
  const s = String(src ?? '');
  return s.includes('\n') ? renderMarkdown(s) : `<p>${renderInline(s)}</p>`;
}

// "Domain › Module · subtopic · difficulty" tag for questions that carry their own origin.
// All parts are optional (older stored attempts have none).
export function questionTag(q) {
  if (!q || typeof q.module !== 'string') return '';
  const where = [q.domainTitle, q.moduleTitle ?? q.module].filter(Boolean).map(esc).join(' › ');
  const rest = [q.subtopicTitle ?? q.subtopic, q.difficulty ? cap(q.difficulty) : null].filter(Boolean).map(esc);
  return `<p class="q-tag">${[where, ...rest].join(' · ')}</p>`;
}

/*
 * Shared quiz runner used by single-module and mixed quizzes.
 * opts:
 *   build()          async -> questions[]
 *   title            HTML (already escaped)
 *   crumbs           HTML for the breadcrumb nav (already escaped)
 *   backHref/backLabel/backIcon   secondary button on the results screen
 *   showTags         show questionTag() above each prompt / in the review
 *   toAttempt(results)  -> attempt fields (module/subtopic/difficulty/questions/score/total)
 */
export async function runQuiz(root, ctx, opts) {
  let questions = [];
  let idx = 0;
  let phase = 'loading'; // loading | answer | feedback | done
  let results = [];

  async function start() {
    phase = 'loading';
    root.innerHTML = `${opts.crumbs}<div class="card"><p class="muted">${icon('loader')} Building quiz…</p></div>`;
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

  function header() {
    const n = questions.length;
    const pctDone = Math.round((idx / n) * 100);
    return `${opts.crumbs}
      <div class="quiz-head">
        <h1 class="quiz-title">${opts.title}</h1>
        <span class="muted">Question ${Math.min(idx + 1, n)} of ${n}</span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${idx}">
        <div class="progress-bar" style="width:${pctDone}%"></div>
      </div>`;
  }

  function inputHtml(q) {
    if (q.answerType === 'choice') {
      return `<div class="choices">${(q.choices || []).map((c, i) =>
        `<button type="button" class="btn choice" data-i="${i}"><span class="choice-key">${i + 1}</span><span>${renderInline(c)}</span></button>`).join('')}</div>`;
    }
    const num = q.answerType === 'number';
    // The Check button lives in the action bar (sticky on phones) and targets this form by id.
    return `<form class="answer-form" id="answer-form" autocomplete="off">
      <input id="answer" class="answer-input" type="text" ${num ? 'inputmode="decimal"' : ''} enterkeyhint="go"
        autocapitalize="off" autocorrect="off"
        placeholder="${num ? 'Enter a number' : 'Type your answer'}" aria-label="Your answer" spellcheck="false">
    </form>`;
  }

  function actionBar(q) {
    return q.answerType === 'choice'
      ? '<p class="muted action-hint">Tap an answer</p>'
      : `<button type="submit" form="answer-form" class="btn btn-primary">${icon('check')} Check</button>`;
  }

  function showQuestion() {
    phase = 'answer';
    const q = questions[idx];
    root.innerHTML = `${header()}
      <section class="card question">
        ${opts.showTags ? questionTag(q) : ''}
        <div class="prompt prose">${renderPrompt(q.prompt)}</div>
        ${inputHtml(q)}
        <div id="feedback"></div>
        <div class="action-bar" id="action-bar">${actionBar(q)}</div>
      </section>`;
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
      root.querySelectorAll('.choice').forEach(b => {
        const c = q.choices[+b.dataset.i];
        if (String(c) === String(q.answer)) b.classList.add('is-correct');
        else if (+b.dataset.i === choiceIndex) b.classList.add('is-wrong');
      });
    } else {
      root.querySelector('#answer')?.classList.add(correct ? 'is-correct' : 'is-wrong');
    }

    const last = idx === questions.length - 1;
    root.querySelector('#feedback').innerHTML = `
      <div class="feedback ${correct ? 'good' : 'bad'}">
        <p class="feedback-title">${correct ? `${icon('circle-check')} Correct` : `${icon('circle-x')} Incorrect`}</p>
        ${correct ? '' : `<p>Correct answer: <strong>${renderInline(String(q.answer))}</strong></p>`}
        ${q.explanation ? `<div class="prose explanation">${renderMarkdown(q.explanation)}</div>` : ''}
      </div>`;
    root.querySelector('#action-bar').innerHTML =
      `<button type="button" class="btn btn-primary" id="next">${last ? `${icon('flag')} Finish` : `Next ${icon('arrow-right')}`}</button>`;
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
    root.innerHTML = `
      ${opts.crumbs}
      <section class="card result-summary">
        <h1 class="quiz-title">${opts.title}</h1>
        <p class="big-score score ${scoreClass(pct)}">${score} / ${total} <span>(${pct}%)</span></p>
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
      </section>`;
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
    <div class="review-mark">${icon(r.correct ? 'circle-check' : 'circle-x')}</div>
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
