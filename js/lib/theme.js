// Accent colour: one of 24 OKLCH hues (0–345° in 15° steps) or grey.
// Stored in the `sb_accent` cookie; applied as --accent-h / --accent-c on <html>
// (css/style.css derives --accent, --accent-soft and --accent-ink from them).

import { getCookie, setCookie } from './storage.js';

export const ACCENT_HUES = Array.from({ length: 24 }, (_, i) => i * 15);
const DEFAULT_HUE = 300;
const CHROMA = 0.16;

// Returns a valid hue number, 'grey', or null for anything else.
function normalize(v) {
  if (v === 'grey') return 'grey';
  if (typeof v === 'string') { if (!/^\d{1,3}$/.test(v.trim())) return null; }
  else if (typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isInteger(n) && ACCENT_HUES.includes(n) ? n : null;
}

// Saved accent: a hue number or 'grey'. Defaults to 300 (purple).
export function getAccent() {
  const v = normalize(getCookie('accent'));
  return v === null ? DEFAULT_HUE : v;
}

// Sets the CSS custom properties on <html>. Invalid values fall back to the default hue.
export function applyAccent(v) {
  const a = normalize(v);
  const style = document.documentElement.style;
  if (a === 'grey') {
    style.setProperty('--accent-h', String(DEFAULT_HUE));
    style.setProperty('--accent-c', '0');
  } else {
    style.setProperty('--accent-h', String(a === null ? DEFAULT_HUE : a));
    style.setProperty('--accent-c', String(CHROMA));
  }
}

// Validates, stores and applies. Returns false (and changes nothing) for invalid values.
export function setAccent(v) {
  const a = normalize(v);
  if (a === null) return false;
  setCookie('accent', String(a));
  applyAccent(a);
  return true;
}
