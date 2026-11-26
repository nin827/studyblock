// Standalone Calculator page: #/calc. The quiz calculator (Sheet | Graph) full-page, usable outside
// quizzes. Its rows and functions persist in localStorage "studyblock:calcPage", separate from the
// quiz's sessionStorage sheet. "Clear all" (after confirming) resets the sheet and the graph.

import { mountCalculator } from './calculator.js';
import { icon, icons } from './ui.js';

const PAGE_KEY = 'studyblock:calcPage';

export function render(root, params, ctx) {
  root.innerHTML = `<div class="stack calc-page">
    <section class="page-head">
      <h1>Calculator</h1>
      <p class="muted">Named values that update live, and a graph of up to six functions. Saved in this browser.</p>
    </section>
    <section class="card calc-page-card" aria-label="Calculator">
      <div id="calc-page-body"></div>
      <div class="calc-page-foot">
        <button type="button" class="btn btn-small btn-ghost" id="calc-page-clear">${icon('eraser')}<span>Clear all</span></button>
        <span class="muted calc-page-note">Clears every row and function.</span>
      </div>
    </section>
  </div>`;
  const calc = mountCalculator(root.querySelector('#calc-page-body'), {
    storageKey: PAGE_KEY, store: 'local', showUse: false, page: true,
  });
  calc.setVisible(true);
  root.querySelector('#calc-page-clear').addEventListener('click', () => {
    if (!confirm('Clear the calculator? All rows and graph functions will be removed.')) return;
    calc.clearAll();
    calc.focus();
  });
  ctx.onCleanup(() => calc.destroy());
  icons();
}
