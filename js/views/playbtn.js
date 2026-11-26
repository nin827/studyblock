// "Play" button for music questions (ticket 023): shown only in feedback and review, after the answer
// is checked, so the sound never gives the answer away. The sound itself is js/lib/audio.js.
// Settings → Sound (cookie sb_sound, default on) hides every Play button when off, and the button
// is also left out when the browser has no Web Audio.
import { getCookie, setCookie } from '../lib/storage.js';
import { canPlay, playSpec, stopPlayback, sanitizePlay, playLabel } from '../lib/audio.js';
import { icon, icons } from './ui.js';

const SOUND_COOKIE = 'sound';

export const soundOn = () => getCookie(SOUND_COOKIE) !== 'off';
export const setSoundOn = (on) => setCookie(SOUND_COOKIE, on ? 'on' : 'off');

// The question's validated `play` description (the engine hands generator `meta` through, where
// withPlay() mirrors it; a question-level `play` wins), or null.
export const playOf = (q) => sanitizePlay(q && (q.play ?? q.meta?.play));

// Button markup for questions[i] ('' when sound is off, unavailable, or the question has no sound).
// The aria-label is fixed text built from the mode, never from question content.
export function playButtonHtml(q, i = 0) {
  if (!soundOn() || !canPlay()) return '';
  const p = playOf(q);
  if (!p) return '';
  const label = playLabel(p);
  return `<div class="play-row"><button type="button" class="btn play-btn" data-play-i="${Number(i) || 0}" aria-label="${label}">${icon('volume-2')}<span>Play</span></button></div>`;
}

// Wires every [data-play-i] button under `scope` to questions[i].
export function bindPlay(scope, questions) {
  if (!scope) return;
  scope.querySelectorAll('[data-play-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = playOf(questions[Number(btn.dataset.playI)]);
      if (!p) return;
      scope.querySelectorAll('.play-btn.is-playing').forEach((b) => b.classList.remove('is-playing'));
      btn.classList.add('is-playing');
      const ok = playSpec(p, () => btn.classList.remove('is-playing'));
      if (!ok) btn.classList.remove('is-playing');
    });
  });
}

// End-of-quiz review: a Play button in each `.review-item` whose question has a sound.
export function addReviewPlay(root, questions) {
  root.querySelectorAll('.review > .review-item').forEach((li, i) => {
    const html = playButtonHtml(questions[i], i);
    if (html) (li.querySelector('.review-body') || li).insertAdjacentHTML('beforeend', html);
  });
  bindPlay(root.querySelector('.review')?.parentElement, questions);
  icons();
}

export { stopPlayback };
