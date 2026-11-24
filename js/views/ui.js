// Shared view helpers.

import { escapeHtml } from '../lib/markdown.js';

export { escapeHtml };

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
