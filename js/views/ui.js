// Shared view helpers.

import { escapeHtml } from '../lib/markdown.js';
import { getAccent, applyAccent } from '../lib/theme.js';

export { escapeHtml };

// Every view imports this module, so the saved accent is applied on every page
// (index.html also sets it before first paint).
try { applyAccent(getAccent()); } catch (e) { console.warn('Accent not applied', e); }

// Domain colour class: fixed tints for known domains, a neutral one for anything else.
const KNOWN_DOMAINS = ['math', 'science', 'geography', 'business', 'computing', 'history', 'language'];
export function domClass(id) {
  return KNOWN_DOMAINS.includes(id) ? `dom-${id}` : 'dom-default';
}

// Inline custom property for a domain's optional registry colour (validated #RRGGBB in
// engine.js; re-checked here). Tints still come from domClass(). Returns '' or '--dom-solid:#xxxxxx;'.
export function domVars(d) {
  const c = d?.color;
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? `--dom-solid:${c};` : '';
}
// Same, as a full ` style="…"` attribute (or '').
export function domStyle(d) {
  const v = domVars(d);
  return v ? ` style="${v}"` : '';
}

// Small pill label. `cls` is a class list from code (e.g. domClass()), `text` is plain text.
export function tag(text, cls = '') {
  return `<span class="tag ${esc(cls)}">${esc(text)}</span>`;
}

export function icons() {
  try { window.lucide?.createIcons(); } catch (e) { console.warn('Lucide failed', e); }
}

export const esc = escapeHtml;

// Lucide icon names are restricted to a safe charset before going into markup.
export function icon(name, cls = '') {
  const n = /^[a-z0-9-]+$/.test(String(name)) ? name : 'book-open';
  return `<i data-lucide="${n}" class="icon ${esc(cls)}" aria-hidden="true"></i>`;
}

export function cap(s) {
  s = String(s ?? '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Scores are sums of credits: at most 2 decimals, no trailing zeros ("6.5", "7", "6.67").
export function fmtScore(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v);
}

// Labels for the reserved "all" subtopic / difficulty of whole-module quizzes.
export function difficultyLabel(d) {
  return d === 'all' ? 'All difficulties' : cap(d);
}
export function subtopicLabel(id, title) {
  return id === 'all' ? 'All topics' : String(title ?? id);
}

export function fmtPct(v) {
  return v === null || v === undefined ? '–' : `${v}%`;
}

export function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(ts);
  }
}

export function scoreClass(p) {
  if (p === null || p === undefined) return '';
  if (p >= 80) return 'good';
  if (p >= 50) return 'ok';
  return 'bad';
}

export function errorBox(title, msg) {
  return `<div class="card error-box">${icon('triangle-alert')}<div><h2>${esc(title)}</h2><p>${esc(msg)}</p>
    <p><a class="btn" href="#/">${icon('house')} Home</a></p></div></div>`;
}

export function hashPart(s) {
  return encodeURIComponent(String(s));
}
