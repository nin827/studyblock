import { loadModule, buildQuiz, checkAnswer } from '../lib/engine.js';
import { saveAttempt, setCookie } from '../lib/storage.js';
import { renderMarkdown, renderInline } from '../lib/markdown.js';
import { esc, icon, icons, cap, errorBox, hashPart, scoreClass } from './ui.js';

export function renderPrompt(src) {
  const s = String(src ?? '');
  return s.includes('\n') ? renderMarkdown(s) : `<p>${renderInline(s)}</p>`;
}

export async function render(root, { moduleId, subtopic, difficulty }, ctx) {
  let mod, st;
  try {
    mod = await loadModule(moduleId);
    st = mod.subtopics.find(s => s.id === subtopic);
    if (!st || (Array.isArray(st.difficulties) && !st.difficulties.includes(difficulty))) throw new Error('Unknown subtopic or difficulty.');
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Quiz not found', 'That module, subtopic or difficulty does not exist.');
    return;
  }
  setCookie('lastModule', mod.id);
  setCookie('lastDifficulty', difficulty);

  const moduleHref = `#/m/${hashPart(mod.id)}`;
  const title = `${esc(mod.title ?? mod.id)} · ${esc(st.title ?? st.id)} · ${esc(cap(difficulty))}`;

  let questions = [];
  let idx = 0;
  let phase = 'loading'; // loading | answer | feedback | done
  let results = [];

  async function start() {
    phase = 'loading';
    root.innerHTML = `<div class="card"><p class="muted">${icon('loader')} Building quiz…</p></div>`;
    icons();
    try {
      questions = await buildQuiz(mod.id, st.id, difficulty);
    } catch (e) {
      console.error(e);
      if (ctx.alive()) { root.innerHTML = errorBox('Could not build quiz', e.message || String(e)); icons(); }
      return;
    }
    if (!ctx.alive()) return;
    idx = 0;
    results = [];
    showQuestion();
  }

  function header() {
    const n = questions.length;
    const pctDone = Math.round((idx / n) * 100);
    return `<nav class="crumbs"><a href="${moduleHref}">${icon('arrow-left')} ${esc(mod.title ?? mod.id)}</a></nav>
      <div class="quiz-head">
        <h1 class="quiz-title">${title}</h1>
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
    return `<form class="answer-form" autocomplete="off">
      <input id="answer" class="answer-input" type="text" ${num ? 'inputmode="decimal"' : ''}
        placeholder="${num ? 'Enter a number' : 'Type your answer'}" aria-label="Your answer" spellcheck="false">
      <button type="submit" class="btn btn-primary">${icon('check')} Submit</button>
    </form>`;
  }

  function showQuestion() {
    phase = 'answer';
    const q = questions[idx];
    root.innerHTML = `${header()}
      <section class="card question">
        <div class="prompt prose">${renderPrompt(q.prompt)}</div>
        ${inputHtml(q)}
        <div id="feedback"></div>
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

    root.querySelectorAll('.answer-form input, .answer-form button, .choice').forEach(el => { el.disabled = true; });
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
      </div>
      <button type="button" class="btn btn-primary" id="next">${last ? `${icon('flag')} Finish` : `Next ${icon('arrow-right')}`}</button>`;
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
    saveAttempt({
      module: mod.id, subtopic: st.id, difficulty,
      questions: results.map(r => ({
        seed: r.q.seed, prompt: r.q.prompt, answer: r.q.answer, userAnswer: r.userAnswer, correct: r.correct,
        ...(r.q.explanation ? { explanation: r.q.explanation } : {}),
      })),
      score, total,
    });
    const pct = total ? Math.round((score / total) * 100) : 0;
    root.innerHTML = `
      <nav class="crumbs"><a href="${moduleHref}">${icon('arrow-left')} ${esc(mod.title ?? mod.id)}</a></nav>
      <section class="card result-summary">
        <h1 class="quiz-title">${title}</h1>
        <p class="big-score score ${scoreClass(pct)}">${score} / ${total} <span>(${pct}%)</span></p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="retry">${icon('rotate-ccw')} Retry</button>
          <a class="btn" href="${moduleHref}">${icon('layout-grid')} Module</a>
          <a class="btn" href="#/results">${icon('history')} History</a>
        </div>
      </section>
      <section class="card">
        <h2>Review</h2>
        <ol class="review">${results.map(reviewItem).join('')}</ol>
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
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));

  await start();
}

export function reviewItem(r) {
  const q = r.q ?? r;
  const answer = q.answer;
  return `<li class="review-item ${r.correct ? 'good' : 'bad'}">
    <div class="review-mark">${icon(r.correct ? 'circle-check' : 'circle-x')}</div>
    <div class="review-body">
      <div class="prose">${renderPrompt(q.prompt)}</div>
      <p class="review-answers">Your answer: <strong>${esc(r.userAnswer === '' ? '(blank)' : r.userAnswer)}</strong>
        ${r.correct ? '' : ` · Correct: <strong>${renderInline(String(answer ?? ''))}</strong>`}</p>
      ${q.explanation ? `<details><summary>Explanation</summary><div class="prose">${renderMarkdown(q.explanation)}</div></details>` : ''}
    </div>
  </li>`;
}
