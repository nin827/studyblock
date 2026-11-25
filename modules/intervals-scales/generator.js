// Intervals & Scales generator. Uses only the seeded rng passed in by the engine.
//
// Notes are spelled (letter + accidental), never just semitone numbers, so a major 3rd above D
// is F♯ and not G♭. Spelled-note answers are always multiple choice (the app's text check can't
// tell "F#" from "F♯"); counts are typed numbers. No double sharps or flats appear anywhere.
//
// generate() builds answers with pitch-class arithmetic and key-signature tables (BUILD side of
// js/lib/music.js). verify() re-derives them from each question's params.check with the CHECK
// side: walking letter names on the keyboard, step patterns and interval classification.

import {
  LETTERS, note, fmt, fmtList, parseNote, parseList, plain, sameNote, pc,
  noteAbove, intervalSize, intervalName, parseInterval, qualitiesFor, isPerfectNum,
  majorTonic, minorTonic, scaleFromSignature, signatureNotes,
  keyboardDistance, walkSemis, classify, isInterval, scaleByPattern, matchesPattern,
  fourChoices, ordinal,
} from '../../js/lib/music.js';

const NATURALS = [0, 1, 2, 3, 4, 5, 6].map((l) => note(l, 0));
// Everyday spellings: naturals plus the five black keys spelled both ways.
const BLACK = [note(0, 1), note(1, -1), note(1, 1), note(2, -1), note(3, 1), note(4, -1), note(4, 1), note(5, -1), note(5, 1), note(6, -1)];
const COMMON = [...NATURALS, ...BLACK];
// Every spelling with at most one sharp or flat (21 notes).
const ALL_PLAIN = [];
for (let l = 0; l < 7; l++) for (const a of [-1, 0, 1]) ALL_PLAIN.push(note(l, a));

const DIFFS = ['easy', 'medium', 'hard'];
const art = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const semis = (n) => (n === 1 ? '1 semitone' : `${n} semitones`);
const code = (s) => s; // notes are shown as plain text (♯/♭ render fine)
const keyName = (tonic, mode) => `${fmt(tonic)} ${mode === 'major' ? 'major' : mode === 'natural' ? 'natural minor' : 'harmonic minor'}`;

// Other spellings of the same pitch (enharmonics) with at most one accidental.
const enharmonics = (n) => ALL_PLAIN.filter((m) => m.l !== n.l && pc(m) === pc(n));

// ---------------------------------------------------------------- Notes

function genNotes(difficulty, rng) {
  const kinds = { easy: ['count', 'step', 'letters'], medium: ['count', 'enh', 'above'], hard: ['count', 'enh', 'multi'] }[difficulty];
  const kind = rng.pick(kinds);

  if (kind === 'letters') {
    // Counting letter names: "counting C as 1, which letter is number 5?"
    const x = rng.pick(NATURALS);
    const n = rng.int(3, 7);
    const ans = LETTERS[(x.l + n - 1) % 7];
    const cands = [-2, -1, 1, 2].map((d) => LETTERS[(x.l + n - 1 + d + 7) % 7]);
    const choices = fourChoices(rng, ans, cands);
    return {
      prompt: `The musical alphabet uses the letters A to G and then starts again. Counting ${fmt(x)} as 1 and going up, which letter name is number ${n}?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `Count up from ${fmt(x)}, calling it 1, and wrap from G back to A:\n\n${Array.from({ length: n }, (_, i) => `${i + 1}: ${LETTERS[(x.l + i) % 7]}`).join(' · ')}\n\nSo number ${n} is **${ans}**.`,
      hints: [
        `Write the letters out from ${fmt(x)}: after G the alphabet starts again at A.`,
        `Number them as you go, starting with ${fmt(x)} = 1. You need to reach ${n}.`,
      ],
      params: { check: { kind: 'letter-count', from: fmt(x), n } },
    };
  }

  if (kind === 'step') {
    // One semitone above/below a natural note.
    const x = rng.pick(NATURALS);
    const up = rng.next() < 0.5;
    const target = (pc(x) + (up ? 1 : 11)) % 12;
    // Preferred spelling: an accidental on x itself, unless the neighbour is a white key.
    const nbr = up ? note(x.l + 1, 0) : note(x.l - 1, 0);
    const ans = pc(nbr) === target ? nbr : note(x.l, up ? 1 : -1);
    const cands = [note(x.l, up ? -1 : 1), nbr, up ? note(x.l - 1, 0) : note(x.l + 1, 0), note(nbr.l, up ? 1 : -1)]
      .filter((m) => plain(m) && pc(m) !== target).map(fmt);
    const choices = fourChoices(rng, fmt(ans), cands);
    if (!choices) return genNotes(difficulty, rng);
    const dir = up ? 'above' : 'below';
    return {
      prompt: `On a piano keyboard, which note is one semitone ${dir} ${fmt(x)}?`,
      answer: fmt(ans), answerType: 'choice', choices,
      explanation: `A semitone is the very next key, black or white, with no key in between.\n\nThe next key ${dir} ${fmt(x)} is **${fmt(ans)}**.${pc(nbr) === target ? ` ${fmt(x)} and ${fmt(nbr)} are two white keys with no black key between them.` : ` It is a black key, written with ${up ? 'a sharp' : 'a flat'}.`}`,
      hints: [
        `A semitone is the very next key ${dir} ${fmt(x)}, whether it is black or white.`,
        `Look at the keyboard: is there a black key directly ${dir} ${fmt(x)}, or another white key? A sharp (♯) raises a note by one semitone; a flat (♭) lowers it by one.`,
      ],
      params: { check: { kind: 'semis-from', from: fmt(x), n: 1, up } },
    };
  }

  if (kind === 'count') {
    // Semitones going up from x to the next y.
    const pool = difficulty === 'easy' ? NATURALS : difficulty === 'medium' ? COMMON : ALL_PLAIN.filter((m) => !(m.a === 1 && (m.l === 2 || m.l === 6)) || difficulty === 'hard');
    let x, y;
    do { x = rng.pick(pool); y = rng.pick(pool); } while (pc(x) === pc(y) || x.l === y.l);
    const ans = (pc(y) - pc(x) + 12) % 12;
    const xWhite = note(x.l, 0);
    const yWhite = note(y.l, 0);
    const whiteGap = (pc(yWhite) - pc(xWhite) + 12) % 12;
    const steps = [`From ${fmt(xWhite)} up to ${fmt(yWhite)} on the white keys is ${semis(whiteGap)}.`];
    if (x.a !== 0) steps.push(`${fmt(x)} is one semitone ${x.a > 0 ? 'above' : 'below'} ${fmt(xWhite)}, so ${x.a > 0 ? 'take 1 away' : 'add 1'}.`);
    if (y.a !== 0) steps.push(`${fmt(y)} is one semitone ${y.a > 0 ? 'above' : 'below'} ${fmt(yWhite)}, so ${y.a > 0 ? 'add 1' : 'take 1 away'}.`);
    const q = {
      prompt: `On a piano keyboard, how many semitones is it from ${fmt(x)} up to the next ${fmt(y)}?`,
      answer: ans, answerType: 'number', tolerance: 0,
      explanation: `Count every key, black and white, going up from ${fmt(x)}.\n\n${steps.map((s) => `- ${s}`).join('\n')}\n\nSo it is **${ans}** semitones.`,
      hints: [
        `Start on ${fmt(x)} and move up one key at a time, black or white. Each move is one semitone.`,
        `Count the white-key letters first: from ${fmt(xWhite)} up to ${fmt(yWhite)}. Most neighbouring letters are a tone (two semitones) apart, but E–F and B–C are only a semitone apart.`,
        ...(x.a !== 0 || y.a !== 0 ? ['Then adjust for the sharps and flats: a sharp is one semitone higher than its letter, a flat one semitone lower.'] : []),
      ],
      params: { check: { kind: 'semis-between', from: fmt(x), to: fmt(y) } },
    };
    return q;
  }

  if (kind === 'enh') {
    // Enharmonic equivalent: same key, different letter name.
    const pool = difficulty === 'medium' ? BLACK : [note(2, 1), note(3, -1), note(6, 1), note(0, -1), note(3, 0), note(2, 0), note(0, 0), note(6, 0), ...BLACK];
    const x = rng.pick(pool);
    const eq = enharmonics(x);
    if (eq.length !== 1) return genNotes(difficulty, rng);
    const ans = eq[0];
    const cands = [note(ans.l, ans.a === 0 ? (x.a > 0 ? 1 : -1) : -ans.a), note(x.l, -x.a || 1), note(ans.l, 0), note(x.l, 0), note(ans.l + (ans.l > x.l || (x.l === 6 && ans.l === 0) ? 1 : -1), 0)]
      .filter((m) => plain(m) && pc(m) !== pc(x)).map(fmt);
    const choices = fourChoices(rng, fmt(ans), cands);
    if (!choices) return genNotes(difficulty, rng);
    const white = x.a === 0;
    return {
      prompt: `Which note is enharmonically equivalent to ${fmt(x)} (the same key on a piano, with a different letter name)?`,
      answer: fmt(ans), answerType: 'choice', choices,
      explanation: `${fmt(x)} is ${white ? 'a white key' : `one semitone ${x.a > 0 ? 'above' : 'below'} ${LETTERS[x.l]}`}.\n\nThe same key can be named from the neighbouring letter ${LETTERS[ans.l]}: ${ans.a === 0 ? `it is the white key ${LETTERS[ans.l]} itself` : `it is one semitone ${ans.a > 0 ? 'above' : 'below'} ${LETTERS[ans.l]}`}, so it is **${fmt(ans)}**.`,
      hints: [
        `Find ${fmt(x)} on the keyboard: ${white ? 'it is a white key' : `it is one semitone ${x.a > 0 ? 'above' : 'below'} ${LETTERS[x.l]}`}.`,
        `Now name that same key from the neighbouring letter ${ans.l === (x.l + 1) % 7 ? 'above' : 'below'} ${LETTERS[x.l]}. Some pairs of white keys have no black key between them.`,
      ],
      params: { check: { kind: 'enharmonic', of: fmt(x) } },
    };
  }

  if (kind === 'above') {
    // Which note is n semitones above x? (one spelling per pitch among the options)
    const x = rng.pick(COMMON);
    const n = rng.int(2, 5);
    const target = (pc(x) + n) % 12;
    const spellings = COMMON.filter((m) => pc(m) === target);
    const ans = spellings.find((m) => m.a === 0) || spellings.find((m) => m.a === (x.a < 0 ? -1 : 1)) || spellings[0];
    const near = COMMON.filter((m) => [1, 11].includes((pc(m) - target + 12) % 12) || (pc(m) - target + 12) % 12 === 2);
    const cands = near.filter((m) => pc(m) !== target).map(fmt);
    // At most one spelling per pitch among the options.
    const seenPc = new Set([target]);
    const uniq = [];
    for (const c of rng.shuffle(cands)) { const p = pc(parseNote(c)); if (!seenPc.has(p)) { seenPc.add(p); uniq.push(c); } }
    const choices = fourChoices(rng, fmt(ans), uniq);
    if (!choices) return genNotes(difficulty, rng);
    return {
      prompt: `Which note is ${semis(n)} above ${fmt(x)}?`,
      answer: fmt(ans), answerType: 'choice', choices,
      explanation: `Move up one key at a time from ${fmt(x)}, counting black and white keys.\n\nAfter ${semis(n)} you reach **${fmt(ans)}**.`,
      hints: [
        `Start on ${fmt(x)} and move up one key at a time, black or white.`,
        `Count ${n} moves, one key at a time. Where two white keys have no black key between them, that step is still just one semitone.`,
      ],
      params: { check: { kind: 'semis-from', from: fmt(x), n, up: true } },
    };
  }

  // hard multi-part: semitone count, then an enharmonic of the upper note.
  let x, y;
  do { x = rng.pick(COMMON); y = rng.pick(BLACK); } while (pc(x) === pc(y) || x.l === y.l);
  const n = (pc(y) - pc(x) + 12) % 12;
  const enh = enharmonics(y)[0];
  const cands = [note(enh.l, -enh.a), note(enh.l, 0), note(y.l, -y.a), note(y.l, 0)].filter((m) => plain(m) && pc(m) !== pc(y)).map(fmt);
  const choices = fourChoices(rng, fmt(enh), cands);
  if (!choices) return genNotes(difficulty, rng);
  return {
    prompt: `Start on ${fmt(x)} and go up the keyboard to the next ${fmt(y)}.`,
    answerType: 'multi',
    parts: [
      { id: 'count', label: 'Semitones', ask: `How many semitones up is it from ${fmt(x)} to ${fmt(y)}?`, answerType: 'number', answer: n, tolerance: 0,
        hint: `Count the white-key letters from ${LETTERS[x.l]} up to ${LETTERS[y.l]} first (E–F and B–C are a semitone apart, other neighbours a tone), then adjust for the sharps and flats.` },
      { id: 'enh', label: 'Other name', ask: `Which note is enharmonically equivalent to ${fmt(y)}?`, answerType: 'choice', answer: fmt(enh), choices,
        hint: `${fmt(y)} is a black key. Name the same key from the neighbouring letter ${y.a > 0 ? 'above' : 'below'} ${LETTERS[y.l]}.` },
    ],
    explanation: `**Semitones:** counting every key from ${fmt(x)} up to ${fmt(y)} gives **${n}**.\n\n**Other name:** ${fmt(y)} is the black key ${y.a > 0 ? 'above' : 'below'} ${LETTERS[y.l]}; named from ${LETTERS[enh.l]} it is **${fmt(enh)}**.`,
    hints: [`Picture the keyboard from ${fmt(x)} to ${fmt(y)}.`],
    params: { multi: true, parts: { count: { kind: 'semis-between', from: fmt(x), to: fmt(y) }, enh: { kind: 'enharmonic', of: fmt(y) } } },
  };
}

// ---------------------------------------------------------------- Intervals

const ROOTS_MED = COMMON;

// Interval-name distractors: other qualities of the same number, and the "same size,
// neighbouring number" names (augmented 4th vs diminished 5th).
function intervalDistractors(num, quality, allowAugDim) {
  const out = [];
  const qs = (n) => qualitiesFor(n).filter((q) => allowAugDim || (q !== 'augmented' && q !== 'diminished'));
  for (const q of qs(num)) if (q !== quality) out.push(intervalName(num, q));
  const size = intervalSize(num, quality);
  for (const n2 of [num - 1, num + 1]) {
    if (n2 < 2 || n2 > 8) continue;
    for (const q of qs(n2)) {
      if (intervalSize(n2, q) === size || (!allowAugDim && q !== 'augmented' && q !== 'diminished' && Math.abs(intervalSize(n2, q) - size) <= 1)) out.push(intervalName(n2, q));
    }
  }
  // Too few (e.g. the octave): add near-miss numbers, major/minor/perfect only.
  if (new Set(out).size < 3) {
    for (const n2 of [num - 1, num - 2, num + 1]) {
      if (n2 < 2 || n2 > 8) continue;
      for (const q of qs(n2).filter((x) => x !== 'augmented' && x !== 'diminished')) out.push(intervalName(n2, q));
    }
  }
  return out;
}

function pickInterval(rng, difficulty) {
  if (difficulty === 'easy') return rng.pick([[2, 'major'], [3, 'major'], [3, 'minor'], [4, 'perfect'], [5, 'perfect'], [6, 'major'], [8, 'perfect'], [2, 'minor']]);
  if (difficulty === 'medium') {
    const num = rng.int(2, 7);
    return [num, rng.pick(isPerfectNum(num) ? ['perfect'] : ['major', 'minor'])];
  }
  return rng.pick([[4, 'augmented'], [5, 'diminished'], [2, 'augmented'], [5, 'augmented'], [7, 'diminished'], [6, 'augmented'], [3, 'diminished'], [4, 'diminished']]);
}

const howBuilt = (num, quality) => {
  const size = intervalSize(num, quality);
  return `${cap(art(intervalName(num, quality)))} spans ${num === 8 ? '8' : num} letter names and ${semis(size)}.`;
};

function genIntervals(difficulty, rng) {
  const kind = rng.pick(difficulty === 'hard' ? ['name', 'above', 'multi'] : ['name', 'above', 'size']);
  const roots = difficulty === 'easy' ? NATURALS : ROOTS_MED;
  const [num, quality] = pickInterval(rng, difficulty);
  const root = rng.pick(roots);
  const top = noteAbove(root, num, quality);
  if (!plain(top) || (difficulty === 'easy' && top.a !== 0 && kind === 'name')) return genIntervals(difficulty, rng);
  const name = intervalName(num, quality);
  const size = intervalSize(num, quality);
  const letters = Array.from({ length: num }, (_, i) => LETTERS[(root.l + i) % 7]);
  const letterHint = `Count letter names up from ${fmt(root)}, calling it 1. Letter number ${num} is the one you need; ignore sharps and flats for now.`;

  if (kind === 'size') {
    const prompt = `How many semitones are in ${art(name)}?`;
    return {
      prompt, answer: size, answerType: 'number', tolerance: 0,
      explanation: `Build it on C to see it on the keyboard: ${art(name)} above C is ${fmt(noteAbove(note(0), num, quality))}.\n\nCounting keys from C up to ${fmt(noteAbove(note(0), num, quality))} gives **${size}** semitones.`,
      hints: [
        `Build the interval on C, where most notes are white keys. In C major the ${ordinal(num === 8 ? 8 : num)} note is ${num === 8 ? 'C again' : LETTERS[num - 1]}, and every interval from C to a note of C major is major or perfect.`,
        quality === 'minor' ? 'A minor interval is one semitone smaller than the major one.' : quality === 'major' || quality === 'perfect' ? 'Count the keys from C up to that note, black and white.' : `An augmented interval is one semitone larger than the major or perfect one; a diminished one is one smaller than minor or perfect.`,
      ],
      params: { check: { kind: 'interval-size', num, quality } },
    };
  }

  if (kind === 'name') {
    const choices = fourChoices(rng, name, intervalDistractors(num, quality, difficulty === 'hard'));
    if (!choices) return genIntervals(difficulty, rng);
    const lettersShown = num === 8 ? `${fmt(root)} up to the next ${fmt(top)} is an octave` : `${letters.join(', ')}: ${num} letter names, so it is a ${ordinal(num)}`;
    return {
      prompt: `Name the interval from ${fmt(root)} up to ${fmt(top)}.`,
      answer: name, answerType: 'choice', choices,
      explanation: `First the number, from the letter names: ${lettersShown}.\n\nThen the size: ${fmt(root)} up to ${fmt(top)} is ${semis(size)}. A major or perfect ${num === 8 ? 'octave' : ordinal(num)} has ${semis(intervalSize(num, isPerfectNum(num) ? 'perfect' : 'major'))}, so this one is **${name}**.`,
      hints: [
        `Get the number from the letter names alone: count from ${LETTERS[root.l]} up to ${LETTERS[top.l]}, counting both ends.`,
        `Now count semitones from ${fmt(root)} up to ${fmt(top)}, black and white keys.`,
        `Compare with the major or perfect version of that interval (in the major scale of ${fmt(root)}). One semitone smaller than major is minor; one larger than major or perfect is augmented; one smaller than minor or perfect is diminished.`,
      ],
      params: { check: { kind: 'interval-name', lower: fmt(root), upper: fmt(top) } },
    };
  }

  if (kind === 'above') {
    const enh = enharmonics(top);
    const cands = [...enh, note(top.l, top.a + 1), note(top.l, top.a - 1), note(top.l + 1, 0), note(top.l - 1, 0)]
      .filter((m) => plain(m) && !sameNote(m, top)).map(fmt);
    const choices = fourChoices(rng, fmt(top), cands);
    if (!choices) return genIntervals(difficulty, rng);
    return {
      prompt: `Which note is ${art(name)} above ${fmt(root)}?`,
      answer: fmt(top), answerType: 'choice', choices,
      explanation: `${howBuilt(num, quality)}\n\n- Letter: counting ${num} letter names from ${fmt(root)} gives ${LETTERS[top.l]}.\n- Size: the note on ${LETTERS[top.l]} that is ${semis(size)} above ${fmt(root)} is **${fmt(top)}**.\n\nA note with a different letter (such as ${enh[0] ? fmt(enh[0]) : 'its enharmonic'}) may sound the same but is spelled as a different interval.`,
      hints: [
        letterHint,
        `The ${name} spans ${semis(size)}. Count that many keys up from ${fmt(root)}, black and white.`,
        `Keep the letter from the first step and choose the sharp, flat or natural that lands on that key.`,
      ],
      params: { check: { kind: 'interval-above', root: fmt(root), num, quality } },
    };
  }

  // hard multi: from root up to top, semitones + interval name.
  const choices = fourChoices(rng, name, intervalDistractors(num, quality, true));
  if (!choices) return genIntervals(difficulty, rng);
  return {
    prompt: `Look at the interval from ${fmt(root)} up to ${fmt(top)}.`,
    answerType: 'multi',
    parts: [
      { id: 'semis', label: 'Semitones', ask: `How many semitones is it from ${fmt(root)} up to ${fmt(top)}?`, answerType: 'number', answer: size, tolerance: 0,
        hint: `Count every key from ${fmt(root)} up to ${fmt(top)}, black and white. Count the white-key letters first, then adjust for sharps and flats.` },
      { id: 'name', label: 'Interval', ask: 'What is the name of the interval?', answerType: 'choice', answer: name, choices,
        hint: `The number comes from the letters ${LETTERS[root.l]} to ${LETTERS[top.l]}, counting both ends. Then compare the size with the major or perfect interval of that number.` },
    ],
    explanation: `**Semitones:** ${fmt(root)} up to ${fmt(top)} is **${size}**.\n\n**Interval:** ${LETTERS[root.l]} to ${LETTERS[top.l]} spans ${num} letter names, so it is a ${ordinal(num)}. A ${isPerfectNum(num) ? 'perfect' : 'major'} ${ordinal(num)} has ${semis(intervalSize(num, isPerfectNum(num) ? 'perfect' : 'major'))}, so ${semis(size)} makes it ${/^[aeiou]/.test(name) ? 'an' : 'a'} **${name}**.`,
    hints: ['Treat the letters and the semitones separately: the letters give the number, the semitones give the quality.'],
    params: { multi: true, parts: { semis: { kind: 'semis-between', from: fmt(root), to: fmt(top) }, name: { kind: 'interval-name', lower: fmt(root), upper: fmt(top) } } },
  };
}

// ---------------------------------------------------------------- Scales

function keyPool(difficulty) {
  const out = [];
  const max = { easy: 2, medium: 4, hard: 6 }[difficulty];
  const modes = { easy: ['major'], medium: ['major', 'major', 'natural'], hard: ['major', 'natural', 'harmonic'] }[difficulty];
  for (let k = -max; k <= max; k++) for (const mode of modes) {
    const sc = scaleFromSignature(k, mode);
    if (sc.every(plain)) out.push({ k, mode, tonic: sc[0], scale: sc });
  }
  return out;
}

function genScales(difficulty, rng) {
  const kind = rng.pick(difficulty === 'hard' ? ['degree', 'list', 'multi', 'degree'] : ['degree', 'notin', 'list']);
  const pool = keyPool(difficulty);
  let key = rng.pick(pool);
  if (kind === 'multi') key = rng.pick(pool.filter((x) => x.mode !== 'harmonic'));
  if (difficulty === 'hard' && kind === 'degree' && rng.next() < 0.6) key = rng.pick(pool.filter((x) => x.mode === 'harmonic'));
  const { tonic, mode, scale, k } = key;
  const kname = keyName(tonic, mode);
  const sigLine = mode === 'major'
    ? `${fmt(tonic)} major has ${k === 0 ? 'no sharps or flats' : `${Math.abs(k)} ${k > 0 ? 'sharp' : 'flat'}${Math.abs(k) > 1 ? 's' : ''}: ${signatureNotes(k).map(fmt).join(', ')}`}.`
    : `${fmt(tonic)} minor has the same key signature as its relative major, ${fmt(majorTonic(k))} major: ${k === 0 ? 'no sharps or flats' : signatureNotes(k).map(fmt).join(', ')}.${mode === 'harmonic' ? ` The harmonic minor also raises the 7th note by a semitone.` : ''}`;
  const orderWords = k > 0 ? 'Sharps are added in the order F C G D A E B.' : k < 0 ? 'Flats are added in the order B E A D G C F.' : '';
  const sigHint = (mode === 'major'
    ? `${fmt(tonic)} major has ${accWord(k)} in its key signature. ${orderWords}`
    : `${fmt(tonic)} minor uses the key signature of its relative major (a minor 3rd higher), which has ${accWord(k)}. ${orderWords}${mode === 'harmonic' ? ' The harmonic minor also raises the 7th note by a semitone.' : ''}`).trim();
  const patternWords = { major: 'tone, tone, semitone, tone, tone, tone, semitone', natural: 'tone, semitone, tone, tone, semitone, tone, tone', harmonic: 'tone, semitone, tone, tone, semitone, tone-and-a-half, semitone' }[mode];

  if (kind === 'degree' || kind === 'multi') {
    const deg = mode === 'harmonic' ? rng.pick([7, 7, 3, 6]) : rng.int(2, 7);
    const ans = scale[deg - 1];
    const cands = [note(ans.l, ans.a + 1), note(ans.l, ans.a - 1), ...enharmonics(ans), scale[(deg) % 7], scale[deg - 2]]
      .filter((m) => plain(m) && !sameNote(m, ans) && m.l !== tonic.l).map(fmt);
    const choices = fourChoices(rng, fmt(ans), cands);
    if (!choices) return genScales(difficulty, rng);
    const degHints = [
      `The scale uses each letter name once, starting on ${fmt(tonic)}. Count up ${deg} letter names (${fmt(tonic)} is 1) to find the letter.`,
      `${sigHint} Apply that to the letter you found.`,
    ];
    const explanation = `${sigLine}\n\nThe ${kname} scale is ${fmtList(scale)}.\n\nIts ${ordinal(deg)} note is **${fmt(ans)}**.`;
    if (kind === 'degree') {
      return {
        prompt: `What is the ${ordinal(deg)} note of the ${kname} scale?`,
        answer: fmt(ans), answerType: 'choice', choices,
        explanation,
        hints: [...degHints, `Or build it from the pattern ${patternWords}, starting on ${fmt(tonic)}.`],
        params: { check: { kind: 'degree', tonic: fmt(tonic), mode, deg } },
      };
    }
    const count = scale.filter((m) => m.a !== 0).length;
    return {
      prompt: `Think about the ${kname} scale.`,
      answerType: 'multi',
      parts: [
        { id: 'count', label: 'Sharps or flats', ask: 'How many of its seven notes have a sharp or a flat?', answerType: 'number', answer: count, tolerance: 0,
          hint: mode === 'major' ? `A major scale has exactly the sharps or flats of its key signature. Where does ${fmt(tonic)} major sit in the circle of fifths?` : `A natural minor scale uses the key signature of its relative major, a minor 3rd above ${fmt(tonic)}.` },
        { id: 'deg', label: `${ordinal(deg)} note`, ask: `What is its ${ordinal(deg)} note?`, answerType: 'choice', answer: fmt(ans), choices,
          hint: degHints[0] },
      ],
      explanation: `${sigLine}\n\nThe scale is ${fmtList(scale)}, so **${count}** of its notes ${count === 1 ? 'has' : 'have'} an accidental, and its ${ordinal(deg)} note is **${fmt(ans)}**.`,
      hints: [`Write the scale out first, one letter name per note, starting on ${fmt(tonic)}.`],
      params: { multi: true, parts: { count: { kind: 'scale-accidentals', tonic: fmt(tonic), mode }, deg: { kind: 'degree', tonic: fmt(tonic), mode, deg } } },
    };
  }

  if (kind === 'notin') {
    // Three notes of the scale and one with the wrong accidental.
    const idx = rng.shuffle([1, 2, 3, 4, 5, 6]);
    const odd = scale[idx[0]];
    const wrong = rng.pick([note(odd.l, odd.a + 1), note(odd.l, odd.a - 1)].filter(plain));
    if (!wrong) return genScales(difficulty, rng);
    const ans = fmt(wrong);
    const choices = rng.shuffle([ans, ...idx.slice(1, 4).map((i) => fmt(scale[i]))]);
    return {
      prompt: `Which of these notes is NOT in the ${kname} scale?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `${sigLine}\n\nThe ${kname} scale is ${fmtList(scale)}.\n\nIt has ${fmt(odd)}, not ${ans}, so the note that does not belong is **${ans}**.`,
      hints: [
        sigHint,
        `Write the scale out from ${fmt(tonic)}, one letter name per note, with those accidentals. Then compare each option with your list.`,
      ],
      params: { check: { kind: 'not-in', tonic: fmt(tonic), mode } },
    };
  }

  // list: which line is the scale?
  const ans = fmtList(scale);
  const cands = [];
  const accIdx = scale.map((m, i) => (m.a !== 0 ? i : -1)).filter((i) => i > 0);
  // 1) one note with its accidental dropped / added
  const i1 = accIdx.length ? rng.pick(accIdx) : rng.int(1, 6);
  const s1 = scale.slice(); s1[i1] = note(scale[i1].l, scale[i1].a === 0 ? (k < 0 ? -1 : 1) : 0); cands.push(s1);
  // 2) an accidental respelled enharmonically (repeats a letter)
  if (accIdx.length) {
    const i2 = rng.pick(accIdx);
    const e = enharmonics(scale[i2]);
    if (e.length) { const s2 = scale.slice(); s2[i2] = e[0]; cands.push(s2); }
  }
  // 3) the other mode on the same tonic
  const otherMode = mode === 'major' ? 'natural' : mode === 'natural' ? 'major' : 'natural';
  const s3 = scaleByPattern(tonic, otherMode); cands.push(s3);
  // 4) harmonic/natural swap or a different wrong note
  const s4 = scale.slice(); const i4 = (i1 % 6) + 1; s4[i4] = note(scale[i4].l, scale[i4].a + (scale[i4].a > 0 ? -1 : 1)); cands.push(s4);
  if (mode === 'harmonic') { const s5 = scale.slice(); s5[6] = note(scale[6].l, scale[6].a - 1); cands.push(s5); }
  const choices = fourChoices(rng, ans, cands.filter((s) => s.every(plain)).map(fmtList));
  if (!choices) return genScales(difficulty, rng);
  return {
    prompt: `Which of these is the ${kname} scale?`,
    answer: ans, answerType: 'choice', choices,
    explanation: `${sigLine}\n\nUsing each letter once from ${fmt(tonic)} gives **${ans}**. Its steps are ${patternWords}.`,
    hints: [
      `A scale uses each letter name exactly once. Rule out any option that repeats or skips a letter.`,
      `The ${mode === 'major' ? 'major' : mode === 'natural' ? 'natural minor' : 'harmonic minor'} pattern is ${patternWords}. Check the steps of each remaining option from ${fmt(tonic)}.`,
    ],
    params: { check: { kind: 'scale-list', tonic: fmt(tonic), mode } },
  };
}

// ---------------------------------------------------------------- Key signatures

const majName = (k) => `${fmt(majorTonic(k))} major`;
const minName = (k) => `${fmt(minorTonic(k))} minor`;
const accWord = (k) => (k === 0 ? 'no sharps or flats' : `${Math.abs(k)} ${k > 0 ? 'sharp' : 'flat'}${Math.abs(k) === 1 ? '' : 's'}`);

// The circle of fifths for the key's side. `counts` (explanations only) labels each key with its count.
function circleHint(k, counts = false) {
  const c = (name, n) => (counts ? `${name} (${n})` : name);
  return k >= 0
    ? `Sharp major keys go up a perfect 5th at a time, each with one more sharp than the last, starting from C with none: ${['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'].map((x, i) => c(x, i)).join(', ')}.`
    : `Flat major keys go up a perfect 4th at a time, each with one more flat than the last, starting from F with one: ${['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'].map((x, i) => c(x, i + 1)).join(', ')}.`;
}

function genKeys(difficulty, rng) {
  const max = { easy: 3, medium: 5, hard: 7 }[difficulty];
  const kinds = { easy: ['count', 'which', 'relmin', 'relmaj'], medium: ['count', 'count-minor', 'which', 'relmaj', 'relmin'], hard: ['count-minor', 'order', 'multi', 'which-minor'] }[difficulty];
  const kind = rng.pick(kinds);
  let k = rng.int(-max, max);
  if (['which', 'which-minor', 'order', 'multi'].includes(kind) && k === 0) k = rng.pick([1, -1]) * rng.int(1, max);
  if (kind === 'order' && Math.abs(k) < 3) k = Math.sign(k) * rng.int(3, max);
  const maj = majorTonic(k);
  const min = minorTonic(k);
  if (!plain(maj) || !plain(min)) return genKeys(difficulty, rng);

  if (kind === 'count' || kind === 'count-minor') {
    const minor = kind === 'count-minor';
    const tonic = minor ? min : maj;
    const name = minor ? minName(k) : majName(k);
    return {
      prompt: `How many sharps or flats are in the key signature of ${name}?${k === 0 ? ' (Answer 0 if there are none.)' : ''}`,
      answer: Math.abs(k), answerType: 'number', tolerance: 0,
      explanation: `${minor ? `${name} shares its key signature with its relative major, ${majName(k)} (a minor 3rd higher).\n\n` : ''}${majName(k)} has ${accWord(k)}${k ? `: ${signatureNotes(k).map(fmt).join(', ')}` : ''}.\n\nSo the answer is **${Math.abs(k)}**.`,
      hints: [
        ...(minor ? [`A minor key has the same key signature as its relative major, a minor 3rd (three semitones) above ${fmt(tonic)}.`] : []),
        circleHint(k),
        'Count along the circle until you reach the key.',
      ].slice(0, 3),
      params: { check: { kind: 'sig-count', tonic: fmt(tonic), mode: minor ? 'natural' : 'major' } },
    };
  }

  if (kind === 'which' || kind === 'which-minor') {
    const minor = kind === 'which-minor';
    const name = minor ? minName : majName;
    const ans = name(k);
    const cands = [-k, k + Math.sign(k), k - Math.sign(k), k + 2 * Math.sign(k), -k + Math.sign(k)]
      .filter((x) => Math.abs(x) <= 7 && x !== k && plain(majorTonic(x)) && plain(minorTonic(x))).map(name);
    if (minor) cands.push(majName(k)); // the relative major has the same signature but is not a minor key
    const choices = fourChoices(rng, ans, cands);
    if (!choices) return genKeys(difficulty, rng);
    return {
      prompt: `Which ${minor ? 'minor' : 'major'} key has ${accWord(k)} in its key signature?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `${circleHint(k, true)}\n\nThe major key with ${accWord(k)} is ${majName(k)}.${minor ? ` Its relative minor, a minor 3rd lower, is **${ans}**.` : ` So the answer is **${ans}**.`}`,
      hints: [
        circleHint(k),
        ...(k > 0 ? ['Shortcut for sharp keys: the last sharp is the 7th note of the major scale, so the major key is a semitone above it.'] : k < -1 ? ['Shortcut for flat keys: the second-to-last flat names the major key.'] : []),
        ...(minor ? ['Find the major key first, then go down a minor 3rd (3 semitones, 3 letter names) to its relative minor.'] : []),
      ],
      params: { check: { kind: 'key-with', k, minor } },
    };
  }

  if (kind === 'relmin' || kind === 'relmaj') {
    const toMinor = kind === 'relmin';
    const ans = toMinor ? minName(k) : majName(k);
    const given = toMinor ? majName(k) : minName(k);
    const cands = toMinor
      ? [`${fmt(maj)} minor`, `${fmt(noteAbove(maj, 3, 'major'))} minor`, `${fmt(noteAbove(maj, 3, 'minor'))} minor`, `${fmt(noteAbove(maj, 6, 'minor'))} minor`, `${fmt(noteAbove(maj, 5, 'perfect'))} minor`]
      : [`${fmt(min)} major`, `${fmt(noteAbove(min, 3, 'major'))} major`, `${fmt(noteAbove(min, 6, 'minor'))} major`, `${fmt(noteAbove(min, 4, 'perfect'))} major`];
    const choices = fourChoices(rng, ans, cands.filter((c) => plain(parseNote(c.split(' ')[0]) || note(0, 9))));
    if (!choices) return genKeys(difficulty, rng);
    return {
      prompt: `What is the relative ${toMinor ? 'minor' : 'major'} of ${given}?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `Relative keys share a key signature (${accWord(k)}). The relative minor is a minor 3rd (3 semitones, 3 letter names) below the major, which is the 6th note of the major scale.\n\n${toMinor ? `Down a minor 3rd from ${fmt(maj)} is ${fmt(min)}` : `Up a minor 3rd from ${fmt(min)} is ${fmt(maj)}`}, so the answer is **${ans}**.`,
      hints: [
        `Relative keys share the same key signature: ${given} has ${accWord(k)}.`,
        toMinor ? `Go down a minor 3rd from ${fmt(maj)}: 3 letter names (counting ${LETTERS[maj.l]} as 1) and 3 semitones. It is also the 6th note of the ${fmt(maj)} major scale.` : `Go up a minor 3rd from ${fmt(min)}: 3 letter names (counting ${LETTERS[min.l]} as 1) and 3 semitones.`,
        'Check the spelling: the note must keep that letter and fit the key signature.',
      ],
      params: { check: { kind: toMinor ? 'rel-minor' : 'rel-major', of: fmt(toMinor ? maj : min) } },
    };
  }

  if (kind === 'order') {
    const sig = signatureNotes(k);
    const ans = fmtList(sig);
    const sorted = sig.slice().sort((x, y) => x.l - y.l);
    const cands = [
      fmtList(sorted),
      fmtList(sig.slice(0, -1)),
      fmtList(signatureNotes(k + Math.sign(k)).slice(0, Math.abs(k) + 1)),
      fmtList(sig.slice().reverse()),
      fmtList(signatureNotes(-k).length === Math.abs(k) ? signatureNotes(-k).map((m) => note(m.l, -m.a)) : sig),
    ];
    const choices = fourChoices(rng, ans, cands.filter((c) => c && c !== ans));
    if (!choices) return genKeys(difficulty, rng);
    return {
      prompt: `Which list shows the key signature of ${majName(k)}, in the order the ${k > 0 ? 'sharps' : 'flats'} are written?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `${majName(k)} has ${accWord(k)}.\n\n${k > 0 ? 'Sharps are always written in the order F C G D A E B, each a perfect 5th above the last.' : 'Flats are always written in the order B E A D G C F, each a perfect 4th above the last.'}\n\nTaking the first ${Math.abs(k)} gives **${ans}**.`,
      hints: [
        `${majName(k)} has ${accWord(k)}. ${k > 0 ? 'The first sharp is always on F, and each new sharp is a perfect 5th above the one before.' : 'The first flat is always on B, and each new flat is a perfect 4th above the one before.'}`,
        k > 0 ? 'The order of sharps is fixed: "Father Charles Goes Down And Ends Battle" (F C G D A E B).' : 'The order of flats is the order of sharps backwards: "Battle Ends And Down Goes Charles\' Father" (B E A D G C F).',
      ],
      params: { check: { kind: 'sig-order', tonic: fmt(maj) } },
    };
  }

  // hard multi: from a signature, the major key and its relative minor.
  const majCands = [-k, k + Math.sign(k), k - Math.sign(k), k + 2 * Math.sign(k)].filter((x) => Math.abs(x) <= 7 && x !== k && plain(majorTonic(x))).map(majName);
  const majChoices = fourChoices(rng, majName(k), majCands);
  const minCands = [`${fmt(maj)} minor`, `${fmt(noteAbove(maj, 3, 'minor'))} minor`, `${fmt(noteAbove(maj, 3, 'major'))} minor`, `${fmt(noteAbove(maj, 5, 'perfect'))} minor`].filter((c) => plain(parseNote(c.split(' ')[0])));
  const minChoices = fourChoices(rng, minName(k), minCands);
  if (!majChoices || !minChoices) return genKeys(difficulty, rng);
  return {
    prompt: `A piece has a key signature of ${accWord(k)}: ${signatureNotes(k).map(fmt).join(', ')}.`,
    answerType: 'multi',
    parts: [
      { id: 'major', label: 'Major key', ask: 'Which major key has this signature?', answerType: 'choice', answer: majName(k), choices: majChoices,
        hint: k > 0 ? `For sharp keys, the major key is a semitone above the last sharp (${fmt(signatureNotes(k).at(-1))}).` : k < -1 ? `For flat keys, the second-to-last flat names the major key.` : 'One flat is the special case to remember.' },
      { id: 'minor', label: 'Relative minor', ask: 'Which minor key shares it?', answerType: 'choice', answer: minName(k), choices: minChoices,
        hint: 'The relative minor is a minor 3rd (3 semitones, 3 letter names) below the major key.' },
    ],
    explanation: `**Major key:** ${circleHint(k, true)} With ${accWord(k)} the key is **${majName(k)}**.\n\n**Relative minor:** a minor 3rd below ${fmt(maj)} is **${minName(k)}**.`,
    hints: ['Find the major key first; the relative minor follows from it.'],
    params: { multi: true, parts: { major: { kind: 'key-with', k, minor: false }, minor: { kind: 'key-with', k, minor: true } } },
  };
}

// ---------------------------------------------------------------- generate / verify

export function generate({ subtopic, difficulty, rng }) {
  if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  switch (subtopic) {
    case 'notes': return genNotes(difficulty, rng);
    case 'intervals': return genIntervals(difficulty, rng);
    case 'scales': return genScales(difficulty, rng);
    case 'keys': return genKeys(difficulty, rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---- CHECK side: every predicate below re-derives the answer without the BUILD tables ----

const LETTER_RUN = 'CDEFGABCDEFGABCDEFGAB';

// Scale for a key named by tonic + mode, built from its step pattern.
const patScale = (tonicStr, mode) => scaleByPattern(parseNote(tonicStr), mode);
const accCount = (sc) => sc.filter((m) => m.a !== 0).length;
const accSign = (sc) => (sc.some((m) => m.a > 0) ? 1 : sc.some((m) => m.a < 0) ? -1 : 0);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.some((y) => sameNote(x, y)));

// Is `v` a correct answer to the question described by `c`?
function isRight(c, v) {
  const s = String(v ?? '').trim();
  switch (c.kind) {
    case 'letter-count': {
      const start = LETTER_RUN.indexOf(c.from);
      return start >= 0 && s === LETTER_RUN[start + c.n - 1];
    }
    case 'semis-between':
      return s !== '' && Number(s) === keyboardDistance(parseNote(c.from), parseNote(c.to));
    case 'semis-from': {
      const m = parseNote(s);
      if (!m) return false;
      return c.up ? keyboardDistance(parseNote(c.from), m) === c.n : keyboardDistance(m, parseNote(c.from)) === c.n;
    }
    case 'enharmonic': {
      const m = parseNote(s), x = parseNote(c.of);
      return !!m && m.l !== x.l && keyboardDistance(x, m) === 0 && Math.abs(m.a) <= 1;
    }
    case 'interval-size': {
      // Brute force: find the spelled note above C with that name, then walk the keyboard to it.
      const C = note(0, 0);
      for (let a = -2; a <= 2; a++) {
        const y = note(c.num - 1, a);
        if (isInterval(C, y, c.num, c.quality)) return s !== '' && Number(s) === walkSemis(C, c.num - 1, y);
      }
      return false;
    }
    case 'interval-name': {
      const want = parseInterval(s);
      const lo = parseNote(c.lower), up = parseNote(c.upper);
      const got = classify(lo, up, lo.l === up.l);
      return !!want && !!got && want.num === got.num && want.quality === got.quality;
    }
    case 'interval-above': {
      const m = parseNote(s);
      return !!m && isInterval(parseNote(c.root), m, c.num, c.quality);
    }
    case 'degree': {
      const sc = patScale(c.tonic, c.mode);
      return matchesPattern(sc, c.mode) && sameNote(parseNote(s), sc[c.deg - 1]);
    }
    case 'not-in': {
      const m = parseNote(s);
      return !!m && !patScale(c.tonic, c.mode).some((x) => sameNote(x, m));
    }
    case 'scale-list': {
      const list = parseList(s);
      return !!list && list.length === 7 && sameNote(list[0], parseNote(c.tonic)) && matchesPattern(list, c.mode);
    }
    case 'scale-accidentals':
    case 'sig-count':
      return s !== '' && Number(s) === accCount(patScale(c.tonic, c.mode));
    case 'key-with': {
      const m = /^(\S+) (major|minor)$/.exec(s);
      if (!m || (m[2] === 'minor') !== c.minor) return false;
      const sc = patScale(m[1], c.minor ? 'natural' : 'major');
      return accCount(sc) === Math.abs(c.k) && (c.k === 0 || accSign(sc) === Math.sign(c.k));
    }
    case 'rel-minor':
    case 'rel-major': {
      const m = /^(\S+) (major|minor)$/.exec(s);
      if (!m || !parseNote(m[1]) || m[2] !== (c.kind === 'rel-minor' ? 'minor' : 'major')) return false;
      const theirs = patScale(m[1], c.kind === 'rel-minor' ? 'natural' : 'major');
      const ours = patScale(c.of, c.kind === 'rel-minor' ? 'major' : 'natural');
      return sameSet(theirs, ours);
    }
    case 'sig-order': {
      const list = parseList(s);
      const accs = patScale(c.tonic, 'major').filter((m) => m.a !== 0);
      if (!list || !sameSet(list, accs)) return false;
      const sharp = accs[0].a > 0;
      // Sharps are added a perfect 5th apart, flats a perfect 4th apart; the first is F♯ or B♭.
      if (!sameNote(list[0], sharp ? note(3, 1) : note(6, -1))) return false;
      for (let i = 1; i < list.length; i++) {
        const got = classify(list[i - 1], list[i]);
        if (!got || got.quality !== 'perfect' || got.num !== (sharp ? 5 : 4)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

function checkOne(c, type, value, choices) {
  if (type === 'choice') {
    if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4) return false;
    if (!choices.includes(String(value))) return false;
    const right = choices.filter((x) => isRight(c, x));
    return right.length === 1 && right[0] === String(value);
  }
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) return false;
  return isRight(c, value);
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (question.answerType === 'multi') {
    if (!answer || typeof answer !== 'object' || !Array.isArray(question.parts)) return false;
    return question.parts.every((part) => p.parts[part.id] && checkOne(p.parts[part.id], part.answerType, answer[part.id], part.choices));
  }
  return checkOne(p.check, question.answerType, answer, question.choices);
}
