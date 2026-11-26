// Audio previews for music questions (ticket 023). Knowledge only: no DOM, no storage, no rng.
// Pitch comes from a spelled note ({ l, a }, see js/lib/music.js) through its pitch class, so
// C♯ and D♭ sound the same. Octaves are chosen here, not by the generators (A4 = 440 Hz, equal
// temperament). A tiny Web Audio synth plays the result: no sound files, so it works offline and
// in the single-file bundle. The AudioContext is created lazily, on the first Play click.
//
// A `play` description (what generators attach to a question; plain data, never stored):
//   { mode: 'note',        notes: [n] }                      one note
//   { mode: 'interval',    notes: [lower], semis }           lower, then the upper one (lower + semis
//                                                            semitones), then both together
//   { mode: 'chord',       notes: [n, n, n(, n)] }           notes lowest first: block, then broken
//   { mode: 'scale',       notes: [7 notes] }                rising, ending on the octave of the first
//   { mode: 'progression', chords: [[n, n, n], …] }          each chord as a block, one after another
// Each n is { l: 0-6 (C D E F G A B), a: -2..2 }. A note may add `o` (0-3): extra octaves above where
// it would normally fall (compound intervals are given with `semis` instead).
// Notes of a chord or scale go upwards: each is the next key above the previous one with its pitch class.

import { pc } from './music.js';

export const A4_HZ = 440;
export const MODES = ['note', 'interval', 'chord', 'scale', 'progression'];
const MAX_NOTES = 9;
const MAX_CHORDS = 8;

// ---------------------------------------------------------------- pitch (pure)

export const midiToHz = (m) => A4_HZ * 2 ** ((m - 69) / 12);

const isNote = (n) => !!n && typeof n === 'object' && Number.isInteger(n.l) && n.l >= 0 && n.l <= 6
  && Number.isInteger(n.a) && n.a >= -2 && n.a <= 2 && (n.o === undefined || (Number.isInteger(n.o) && n.o >= 0 && n.o <= 3));

// First note of a sound: the pitch class placed between G3 (55) and F#4 (66); `low` shifts it down
// an octave (progressions sit lower so the top of the chord stays comfortable).
export const startMidi = (n, low = false) => 60 + ((pc(n) + 5) % 12) - 5 - (low ? 12 : 0);

// Notes upwards from `first`: each the nearest key above the previous with its pitch class.
function ascend(notes, first) {
  const out = [first];
  for (let i = 1; i < notes.length; i++) {
    const prev = out[i - 1];
    const up = (((pc(notes[i]) - prev) % 12) + 12) % 12 || 12; // 1-12 semitones above the previous key
    out.push(prev + up + 12 * (notes[i].o || 0));
  }
  return out;
}

// A validated copy of a `play` description, or null.
export function sanitizePlay(p) {
  if (!p || typeof p !== 'object' || !MODES.includes(p.mode)) return null;
  const notes = (arr) => (Array.isArray(arr) && arr.every(isNote) ? arr.map(({ l, a, o }) => (o ? { l, a, o } : { l, a })) : null);
  if (p.mode === 'progression') {
    if (!Array.isArray(p.chords) || p.chords.length < 2 || p.chords.length > MAX_CHORDS) return null;
    const chords = p.chords.map((c) => (Array.isArray(c) && c.length >= 3 && c.length <= 4 ? notes(c) : null));
    return chords.every(Boolean) ? { mode: 'progression', chords } : null;
  }
  const ns = notes(p.notes);
  if (!ns || ns.length < 1 || ns.length > MAX_NOTES) return null;
  if (p.mode === 'note') return ns.length === 1 ? { mode: 'note', notes: ns } : null;
  if (p.mode === 'interval') {
    return ns.length === 1 && Number.isInteger(p.semis) && p.semis >= 0 && p.semis <= 36 ? { mode: 'interval', notes: ns, semis: p.semis } : null;
  }
  if (p.mode === 'chord') return ns.length >= 3 && ns.length <= 4 ? { mode: 'chord', notes: ns } : null;
  return ns.length >= 5 ? { mode: 'scale', notes: ns } : null; // scale
}

// Short name of what plays, for aria-labels: "Play the chord".
export function playLabel(p) {
  const w = { note: 'note', interval: 'interval', chord: 'chord', scale: 'scale', progression: 'chord progression' }[p?.mode];
  return w ? `Play the ${w}` : 'Play';
}

// The sound as a timeline: [{ at, dur, midi: [..] }] in seconds. Pure, so tests can check it.
export function timeline(play) {
  const p = sanitizePlay(play);
  if (!p) return [];
  if (p.mode === 'note') return [{ at: 0, dur: 1.4, midi: [startMidi(p.notes[0])] }];
  if (p.mode === 'interval') {
    const lo = startMidi(p.notes[0]);
    const hi = lo + p.semis;
    return [{ at: 0, dur: 0.8, midi: [lo] }, { at: 0.9, dur: 0.8, midi: [hi] }, { at: 1.9, dur: 1.5, midi: [lo, hi] }];
  }
  if (p.mode === 'chord') {
    const ms = ascend(p.notes, startMidi(p.notes[0]));
    const out = [{ at: 0, dur: 1.5, midi: ms }];
    ms.forEach((m, i) => out.push({ at: 1.8 + i * 0.4, dur: 0.7, midi: [m] }));
    return out;
  }
  if (p.mode === 'scale') {
    const ms = ascend(p.notes, startMidi(p.notes[0]));
    ms.push(ms[0] + 12);
    return ms.map((m, i) => ({ at: i * 0.42, dur: i === ms.length - 1 ? 1.1 : 0.55, midi: [m] }));
  }
  return p.chords.map((c, i) => ({ at: i * 1.25, dur: 1.15, midi: ascend(c, startMidi(c[0], true)) }));
}

export const playDuration = (play) => timeline(play).reduce((t, e) => Math.max(t, e.at + e.dur), 0);

// ---------------------------------------------------------------- builders (used by generators)

// Attach `play` to a generated question without touching anything else. Invalid specs are dropped.
// The engine hands `meta` (in-memory generator data) through to the quiz, so the spec is mirrored
// there; a question-level `play` is read first when the engine passes it through.
export function withPlay(q, spec) {
  const p = sanitizePlay(spec);
  if (!p || !q || typeof q !== 'object') return q;
  q.play = p;
  q.meta = { ...(q.meta && typeof q.meta === 'object' ? q.meta : {}), play: p };
  return q;
}
export const playNote = (n) => ({ mode: 'note', notes: [n] });
export const playInterval = (lower, semis) => ({ mode: 'interval', notes: [lower], semis });
export const playChord = (notes) => ({ mode: 'chord', notes });
export const playScale = (notes) => ({ mode: 'scale', notes });
export const playProgression = (chords) => ({ mode: 'progression', chords });

// ---------------------------------------------------------------- synth (browser only)

let ctx = null;
let current = null; // { master, nodes: [], timer, onEnd }

export function canPlay() {
  try { return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); } catch { return false; }
}

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  return ctx;
}

// Stop whatever is playing (a short fade so there is no click).
export function stopPlayback() {
  const c = current;
  current = null;
  if (!c) return;
  clearTimeout(c.timer);
  try {
    const t = ctx.currentTime;
    c.master.gain.cancelScheduledValues(t);
    c.master.gain.setValueAtTime(c.master.gain.value, t);
    c.master.gain.linearRampToValueAtTime(0, t + 0.04);
    for (const o of c.nodes) { try { o.stop(t + 0.06); } catch { /* already stopped */ } }
    setTimeout(() => { try { c.master.disconnect(); } catch { /* ignore */ } }, 120);
  } catch { /* ignore */ }
  if (c.onEnd) c.onEnd();
}

// Soft tone: a triangle with a quiet octave and a quieter twelfth, a fast attack, an exponential fade.
function voice(c, master, midi, at, dur, level, nodes) {
  const hz = midiToHz(midi);
  const env = c.createGain();
  const end = at + dur;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(level, at + 0.025);
  env.gain.exponentialRampToValueAtTime(level * 0.35, at + Math.min(0.3, dur * 0.5));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(master);
  [['triangle', 1, 1], ['sine', 2, 0.22], ['sine', 3, 0.08]].forEach(([type, mult, g]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type;
    o.frequency.value = hz * mult;
    og.gain.value = g;
    o.connect(og);
    og.connect(env);
    o.start(at);
    o.stop(end + 0.05);
    nodes.push(o);
  });
}

// Play a `play` description. Returns true if it started. `onEnd` runs when it finishes or is stopped.
export function playSpec(play, onEnd) {
  const events = timeline(play);
  if (!events.length || !canPlay()) return false;
  stopPlayback();
  let c;
  try { c = getCtx(); } catch { return false; }
  try { if (c.state === 'suspended') c.resume(); } catch { /* ignore */ }
  const master = c.createGain();
  master.gain.value = 0.22;
  master.connect(c.destination);
  const nodes = [];
  const t0 = c.currentTime + 0.05;
  for (const e of events) {
    const level = 0.55 / Math.sqrt(e.midi.length);
    for (const m of e.midi) voice(c, master, m, t0 + e.at, e.dur, level, nodes);
  }
  const total = playDuration(play);
  const run = { master, nodes, onEnd, timer: 0 };
  run.timer = setTimeout(() => { if (current === run) { current = null; try { master.disconnect(); } catch { /* ignore */ } if (onEnd) onEnd(); } }, (total + 0.2) * 1000);
  current = run;
  return true;
}
