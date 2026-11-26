// #/badges: level, streak and every badge (earned with its date; not earned with progress).
// Opening it marks all earned badges as seen. Reached from Home's progress card and History.

import { getAttempts } from '../lib/storage.js';
import { esc, icon } from './ui.js';
import { crumbsHtml } from './quiz.js';
import { gameOn, summary, gameContext, markSeen, badgeCardHtml, levelSummaryHtml } from './game.js';

export async function render(root, params, ctx) {
  const crumbs = crumbsHtml([{ href: '#/', label: 'Home' }, { href: '#/results', label: 'History' }, { label: 'Badges' }]);
  const head = `${crumbs}<section class="page-head"><p class="eyebrow">Your progress</p><h1>Badges</h1></section>`;
  if (!gameOn()) {
    root.innerHTML = `${head}<div class="card">
      <p>${icon('eye-off')} Game elements are turned off, so XP, levels, streaks and badges are hidden.</p>
      <p class="muted">They are worked out from your history, so turning them back on shows everything again.</p>
      <p><a class="btn" href="#/settings">${icon('settings')} Open Settings</a></p>
    </div>`;
    return;
  }
  const gctx = await gameContext();
  if (!ctx.alive()) return;
  const sum = summary(getAttempts(), gctx);
  root.innerHTML = `${head}
    ${levelSummaryHtml(sum)}
    <section aria-labelledby="badges-h">
      <h2 id="badges-h" class="sr-only">${esc(`All badges, ${sum.earnedCount} earned`)}</h2>
      <ul class="badge-grid">${sum.badges.map(badgeCardHtml).join('')}</ul>
    </section>`;
  markSeen(sum.badges);
}
