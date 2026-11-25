// Music theory helpers for the Music Theory generators (Intervals & Scales, Chords, Rhythm).
// Pure: no DOM, no randomness. Notes are spelled as { l, a }: l = letter index 0-6 (C D E F G A B),
// a = accidental in semitones (-1 flat, +1 sharp; ±2 would be a double flat/sharp, which the
// generators avoid). Two independent toolkits live here:
//   - BUILD (used by generate): pitch-class arithmetic and key-signature tables.
//   - CHECK (used by verify): walking letter names on a keyboard (E-F and B-C are half steps),
//     step patterns (W W H W W W H) and interval classification. They share no lookup tables
//     with the builders, so a mistake in one is caught by the other.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SHARP = '♯';
export const FLAT = '♭';

export const note = (l, a = 0) => ({ l: ((l % 7) + 7) % 7, a });
export const sameNote = (x, y) => !!x && !!y && x.l === y.l && x.a === y.a;
export const plain = (n) => Math.abs(n.a) <= 1; // no double sharps/flats

export function fmt(n) {
  return LETTERS[n.l] + (n.a > 0 ? SHARP.repeat(n.a) : FLAT.repeat(-n.a));
}
export const fmtList = (ns) => ns.map(fmt).join(', ');

// "F♯", "F#", "Bb", "B♭", "C" -> note, or null.
export function parseNote(s) {
  const m = /^([A-G])([♯#]*|[♭b]*)$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const acc = m[2];
  const a = /[♯#]/.test(acc) ? acc.length : -acc.length;
  return note(LETTERS.indexOf(m[1]), a);
}
// "D, F♯, A" -> [notes] or null.
export function parseList(s) {
  const out = String(s ?? '').split(',').map((x) => parseNote(x));
  return out.every(Boolean) ? out : null;
}

// 4 distinct options: the answer plus the first 3 usable candidates (after a seeded shuffle),
// shuffled. null when there are not enough distinct candidates.
export function fourChoices(rng, answer, candidates) {
  const out = [answer];
  for (const c of rng.shuffle(candidates)) {
    if (out.length >= 4) break;
    if (typeof c === 'string' && c && !out.includes(c)) out.push(c);
  }
  return out.length === 4 ? rng.shuffle(out) : null;
}

export const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

// ---------------------------------------------------------------- BUILD (generation side)

const NAT = [0, 2, 4, 5, 7, 9, 11];
export const pc = (n) => (((NAT[n.l] + n.a) % 12) + 12) % 12;

const PERFECT_NUMS = new Set([1, 4, 5, 8]);
const MAJOR_SIZE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };

export const QUALITIES_PERFECT = ['perfect', 'augmented', 'diminished'];
export const QUALITIES_IMPERFECT = ['major', 'minor', 'augmented', 'diminished'];
export const qualitiesFor = (num) => (PERFECT_NUMS.has(num) ? QUALITIES_PERFECT : QUALITIES_IMPERFECT);
export const isPerfectNum = (num) => PERFECT_NUMS.has(num);

// Semitones in an interval, e.g. (3, 'major') -> 4. undefined for impossible combinations.
export function intervalSize(num, quality) {
  const b = MAJOR_SIZE[num];
  if (b === undefined) return undefined;
  if (PERFECT_NUMS.has(num)) return { perfect: b, augmented: b + 1, diminished: b - 1 }[quality];
  return { major: b, minor: b - 1, augmented: b + 1, diminished: b - 2 }[quality];
}

// The note `num` letter names above root with the given quality, correctly spelled.
export function noteAbove(root, num, quality) {
  const steps = num - 1;
  const l = (root.l + steps) % 7;
  const octaves = Math.floor((root.l + steps) / 7);
  const target = NAT[root.l] + root.a + intervalSize(num, quality);
  return note(l, target - (NAT[l] + 12 * octaves));
}

const ORD = { 1: 'unison', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: 'octave' };
export const intervalName = (num, quality) => `${quality} ${ORD[num]}`;
export function parseInterval(s) {
  const m = /^(perfect|major|minor|augmented|diminished) (unison|2nd|3rd|4th|5th|6th|7th|octave)$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const num = Number(Object.keys(ORD).find((k) => ORD[k] === m[2]));
  if (!qualitiesFor(num).includes(m[1])) return null;
  return { num, quality: m[1] };
}

// Major keys by position on the circle of fifths: k > 0 sharps, k < 0 flats.
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
const MAJOR_TONIC = { '-7': [0, -1], '-6': [4, -1], '-5': [1, -1], '-4': [5, -1], '-3': [2, -1], '-2': [6, -1], '-1': [3, 0],
  0: [0, 0], 1: [4, 0], 2: [1, 0], 3: [5, 0], 4: [2, 0], 5: [6, 0], 6: [3, 1], 7: [0, 1] };
export const majorTonic = (k) => note(...MAJOR_TONIC[k]);
// Relative minor tonic: a major 6th above the major tonic.
export const minorTonic = (k) => noteAbove(majorTonic(k), 6, 'major');

// Accidental a key signature gives to letter l.
function sigAcc(k, l) {
  if (k > 0) return SHARP_ORDER.slice(0, k).includes(l) ? 1 : 0;
  if (k < 0) return FLAT_ORDER.slice(0, -k).includes(l) ? -1 : 0;
  return 0;
}
// The letters a key signature alters, in signature order.
export function signatureNotes(k) {
  return k > 0 ? SHARP_ORDER.slice(0, k).map((l) => note(l, 1)) : FLAT_ORDER.slice(0, -k).map((l) => note(l, -1));
}
// Scale from a key signature: 7 consecutive letters from the tonic, each with the signature's accidental.
// mode: 'major' | 'natural' | 'harmonic' (minor modes use the relative major's signature k).
export function scaleFromSignature(k, mode) {
  const tonic = mode === 'major' ? majorTonic(k) : minorTonic(k);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const l = (tonic.l + i) % 7;
    out.push(note(l, sigAcc(k, l)));
  }
  if (mode === 'harmonic') out[6] = note(out[6].l, out[6].a + 1);
  return out;
}
// Circle-of-fifths index of a major key (or of the relative major of a minor key), or null.
export function keyIndex(tonic, mode) {
  for (let k = -7; k <= 7; k++) {
    if (sameNote(mode === 'major' ? majorTonic(k) : minorTonic(k), tonic)) return k;
  }
  return null;
}

// Triads / sevenths by stacking intervals on the root.
export const TRIAD = {
  major: [[3, 'major'], [5, 'perfect']],
  minor: [[3, 'minor'], [5, 'perfect']],
  diminished: [[3, 'minor'], [5, 'diminished']],
  augmented: [[3, 'major'], [5, 'augmented']],
};
export const SEVENTH = {
  dom7: [[3, 'major'], [5, 'perfect'], [7, 'minor']],
  maj7: [[3, 'major'], [5, 'perfect'], [7, 'major']],
  min7: [[3, 'minor'], [5, 'perfect'], [7, 'minor']],
};
export const buildChord = (root, recipe) => [root, ...recipe.map(([n, q]) => noteAbove(root, n, q))];

// ---------------------------------------------------------------- CHECK (verification side)

// Half steps between neighbouring letters, counted on the keyboard: C-D 2, D-E 2, E-F 1, F-G 2, G-A 2, A-B 2, B-C 1.
const LETTER_STEP = [2, 2, 1, 2, 2, 2, 1];

// Semitones going up from x to y, walking `letterSteps` letter names (0-7) and adjusting for accidentals.
export function walkSemis(x, letterSteps, y) {
  let s = 0;
  for (let i = 0; i < letterSteps; i++) s += LETTER_STEP[(x.l + i) % 7];
  return s + y.a - x.a;
}

// Semitones from x up to the next y (0-11), found by walking up the keyboard one key at a time.
export function keyboardDistance(x, y) {
  const KEYS = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
  const keyOf = (n) => {
    // white key of the letter, then move one key per accidental
    let k = KEYS.indexOf(LETTERS[n.l]);
    k += n.a;
    return ((k % 12) + 12) % 12;
  };
  let k = keyOf(x);
  const target = keyOf(y);
  let d = 0;
  while (k !== target) { k = (k + 1) % 12; d++; }
  return d;
}

// Name of the ascending interval from lower to upper ({ num, quality }) or null if it has no
// standard name. `octave` = true reads a same-letter pair as an octave rather than a unison.
export function classify(lower, upper, octave = false) {
  let steps = (upper.l - lower.l + 7) % 7;
  if (steps === 0 && octave) steps = 7;
  const num = steps + 1;
  const semis = walkSemis(lower, steps, upper);
  // Reference size: the interval from the tonic of a major scale to its own degree `num`,
  // walked with the major step pattern.
  const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
  let ref = 0;
  for (let i = 0; i < steps; i++) ref += MAJOR_STEPS[i];
  const d = semis - ref;
  let quality;
  if (num === 1 || num === 4 || num === 5 || num === 8) quality = { 0: 'perfect', 1: 'augmented', '-1': 'diminished' }[d];
  else quality = { 0: 'major', '-1': 'minor', 1: 'augmented', '-2': 'diminished' }[d];
  return quality ? { num, quality } : null;
}
export const isInterval = (lower, upper, num, quality, octave = num === 8) => {
  const c = classify(lower, upper, octave);
  return !!c && c.num === num && c.quality === quality;
};

export const PATTERN = {
  major: [2, 2, 1, 2, 2, 2, 1],
  natural: [2, 1, 2, 2, 1, 2, 2],
  harmonic: [2, 1, 2, 2, 1, 3, 1],
};
// Scale built from a step pattern: each next note uses the next letter name, with whatever
// accidental makes the step the right size.
export function scaleByPattern(tonic, mode) {
  const out = [tonic];
  for (let i = 0; i < 6; i++) {
    const prev = out[i];
    const l = (prev.l + 1) % 7;
    const natural = walkSemis(prev, 1, note(l, prev.a)); // letter step size, accidentals cancelling
    out.push(note(l, prev.a + PATTERN[mode][i] - natural));
  }
  return out;
}
// True when `scale` (7 notes) uses each letter once in order and matches the pattern.
export function matchesPattern(scale, mode) {
  if (!Array.isArray(scale) || scale.length !== 7) return false;
  for (let i = 0; i < 6; i++) {
    if (scale[i + 1].l !== (scale[i].l + 1) % 7) return false;
    if (walkSemis(scale[i], 1, scale[i + 1]) !== PATTERN[mode][i]) return false;
  }
  return walkSemis(scale[6], 1, scale[0]) === PATTERN[mode][6];
}

// Name a chord from its notes in any order by finding the note the others stack on in thirds.
// -> { root, quality, inversion (0/1/2/3), kind: 'triad' | 'seventh' } or null.
export function identifyChord(notes) {
  if (!Array.isArray(notes) || (notes.length !== 3 && notes.length !== 4)) return null;
  for (const r of notes) {
    const by = {};
    for (const n of notes) by[(n.l - r.l + 7) % 7] = n;
    const want = notes.length === 3 ? [0, 2, 4] : [0, 2, 4, 6];
    if (Object.keys(by).length !== notes.length || !want.every((s) => by[s])) continue;
    const third = classify(r, by[2]);
    const fifth = classify(r, by[4]);
    const q3 = third && third.quality, q5 = fifth && fifth.quality;
    let quality = null;
    if (notes.length === 3) {
      if (q3 === 'major' && q5 === 'perfect') quality = 'major';
      else if (q3 === 'minor' && q5 === 'perfect') quality = 'minor';
      else if (q3 === 'minor' && q5 === 'diminished') quality = 'diminished';
      else if (q3 === 'major' && q5 === 'augmented') quality = 'augmented';
    } else {
      const sev = classify(r, by[6]);
      const q7 = sev && sev.quality;
      if (q3 === 'major' && q5 === 'perfect' && q7 === 'minor') quality = 'dom7';
      else if (q3 === 'major' && q5 === 'perfect' && q7 === 'major') quality = 'maj7';
      else if (q3 === 'minor' && q5 === 'perfect' && q7 === 'minor') quality = 'min7';
    }
    if (!quality) return null;
    const bassStep = (notes[0].l - r.l + 7) % 7;
    return { root: r, quality, inversion: [0, 2, 4, 6].indexOf(bassStep), kind: notes.length === 3 ? 'triad' : 'seventh' };
  }
  return null;
}
