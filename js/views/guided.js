// Guided mode helpers: hint lists, the explanation-to-steps fallback, guide.md sections and the
// per-tab Practice | Guided switch. Pure functions (plus sessionStorage); the guided runner itself
// is the shared quiz runner in quiz.js with `opts.guided`.

import { renderMarkdown } from '../lib/markdown.js';
import { esc } from './ui.js';

// ---- Practice | Guided switch, remembered per tab ----

const MODE_KEY = 'studyblock:quizMode';
export const GUIDED = 'guided';
export const PRACTICE = 'practice';

export function getQuizMode() {
  try { return sessionStorage.getItem(MODE_KEY) === GUIDED ? GUIDED : PRACTICE; } catch { return PRACTICE; }
}
export function setQuizMode(mode) {
  try { sessionStorage.setItem(MODE_KEY, mode === GUIDED ? GUIDED : PRACTICE); } catch { /* ignore */ }
}

// ---- hints ----

const FENCE = /^\s*```/;
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/;

/*
 * Splits explanation markdown into steps:
 *   1. blocks separated by blank lines (never inside a ``` fence),
 *   2. list items become their own step (lines before the first item form one step),
 *   3. if that still gives a single plain block, its lines.
 * Blocks with a code fence or a table stay whole. List markers are dropped from items.
 */
export function splitSteps(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && !line.trim()) {
      if (cur.length) blocks.push(cur);
      cur = [];
      continue;
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  const solid = b => b.some(l => FENCE.test(l) || /^\s*\|/.test(l));
  let steps = [];
  for (const b of blocks) {
    if (solid(b) || !b.some(l => LIST_ITEM.test(l))) { steps.push(b); continue; }
    let item = [];
    for (const l of b) {
      if (LIST_ITEM.test(l)) {
        if (item.length) steps.push(item);
        item = [l.replace(LIST_ITEM, '')];
      } else item.push(l);
    }
    if (item.length) steps.push(item);
  }
  if (steps.length === 1 && !solid(steps[0]) && steps[0].length > 1) steps = steps[0].map(l => [l]);
  return steps.map(s => s.join('\n').trim()).filter(Boolean);
}

/*
 * Hints for one question: { hints: [markdown], source: 'hints' | 'explanation' | 'none' }.
 * The generator's own `hints` win. Otherwise (and only when no part has its own `hint`) the
 * explanation's steps minus the last one; "Show solution" reveals everything.
 */
export function hintsFor(q) {
  if (Array.isArray(q?.hints) && q.hints.length) return { hints: q.hints.slice(), source: 'hints' };
  const partHints = Array.isArray(q?.parts) && q.parts.some(p => typeof p?.hint === 'string' && p.hint);
  if (!partHints && q?.explanation) {
    const steps = splitSteps(q.explanation);
    if (steps.length > 1) return { hints: steps.slice(0, -1), source: 'explanation' };
  }
  return { hints: [], source: 'none' };
}

// ---- guide.md: "## <Subtopic title>" sections, plus an optional "## General" ----

// Map(lower-cased heading -> markdown body). Text before the first "## " heading is ignored.
export function parseGuide(text) {
  const out = new Map();
  if (typeof text !== 'string') return out;
  let cur = null;
  let inFence = false;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h) {
      cur = h[1].trim().toLowerCase();
      if (!out.has(cur)) out.set(cur, []);
      continue;
    }
    if (cur !== null) out.get(cur).push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join('\n').trim()]).filter(([, v]) => v));
}

// "How to solve" body (HTML) for a subtopic: General first, then the subtopic's own section
// (matched by title, case-insensitive; the id is accepted as a fallback). '' when there is none.
export function guideHtml(guide, subtopicTitle, subtopicId) {
  if (!(guide instanceof Map) || !guide.size) return '';
  const general = guide.get('general') || '';
  const title = String(subtopicTitle ?? '').trim();
  const key = title.toLowerCase();
  const own = (key && key !== 'general' ? guide.get(key) : '')
    || (typeof subtopicId === 'string' && subtopicId.toLowerCase() !== 'general' ? guide.get(subtopicId.toLowerCase()) : '')
    || '';
  if (!general && !own) return '';
  return `${general ? `<div class="guide-section">${renderMarkdown(general)}</div>` : ''}
    ${own ? `<div class="guide-section">${general && title ? `<h3>${esc(title)}</h3>` : ''}${renderMarkdown(own)}</div>` : ''}`;
}

// ---- outcomes (end-of-set summary) ----

export const OUTCOMES = {
  first: { icon: 'circle-check', label: 'Solved first try', cls: 'good' },
  assisted: { icon: 'lightbulb', label: 'Solved after hints/tries', cls: 'assisted' },
  solution: { icon: 'eye', label: 'Used the solution', cls: 'info' },
};
