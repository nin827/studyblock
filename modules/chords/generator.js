// Chords generator. Uses only the seeded rng passed in by the engine.
//
// Chords are spelled from letter names (stacked thirds), so the D major triad is D, F♯, A and
// never D, G♭, A. Spelled notes are always multiple choice (the app's text check can't tell
// "F#" from "F♯"); "which notes make this chord?" questions are built from note blocks instead
// (one block per note, plus wrong spellings as distractors). No double sharps or flats appear anywhere.
//
// generate() builds chords with pitch-class arithmetic and key-signature tables (BUILD side of
// js/lib/music.js). verify() re-derives every answer from params.check with the CHECK side:
// brute-force search for chord tones by interval classification, step-pattern scales and
// identifyChord (which finds the root by letter distances).

import {
  LETTERS, note, fmt, fmtList, parseNote, parseList, plain, sameNote, pc,
  TRIAD, SEVENTH, buildChord, noteAbove, majorTonic, minorTonic, scaleFromSignature,
  classify, scaleByPattern, identifyChord, fourChoices, ordinal,
} from '../../js/lib/music.js';

const DIFFS = ['easy', 'medium', 'hard'];
const art = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const NATURALS = [0, 1, 2, 3, 4, 5, 6].map((l) => note(l, 0));
const BLACK = [note(0, 1), note(1, -1), note(1, 1), note(2, -1), note(3, 1), note(4, -1), note(4, 1), note(5, -1), note(5, 1), note(6, -1)];
const COMMON = [...NATURALS, ...BLACK];
// Easy roots: the white keys plus the most common black-key roots.
const EASY_ROOTS = [...NATURALS, note(6, -1), note(2, -1), note(5, -1), note(3, 1)];
const ALL_PLAIN = [];
for (let l = 0; l < 7; l++) for (const a of [-1, 0, 1]) ALL_PLAIN.push(note(l, a));
const enharmonics = (n) => ALL_PLAIN.filter((m) => m.l !== n.l && pc(m) === pc(n));

const QUAL_WORDS = ['major', 'minor', 'diminished', 'augmented'];
const triadName = (root, q) => `${fmt(root)} ${q}`;
const INV = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];
const SEV_SYMBOL = { dom7: '7', maj7: 'maj7', min7: 'm7' };
const SEV_WORDS = { dom7: 'dominant 7th', maj7: 'major 7th', min7: 'minor 7th' };
const sevName = (root, t) => `${fmt(root)}${SEV_SYMBOL[t]}`;
const RECIPE_WORDS = {
  major: 'a major 3rd (4 semitones) and a perfect 5th (7 semitones) above the root',
  minor: 'a minor 3rd (3 semitones) and a perfect 5th (7 semitones) above the root',
  diminished: 'a minor 3rd (3 semitones) and a diminished 5th (6 semitones) above the root',
  augmented: 'a major 3rd (4 semitones) and an augmented 5th (8 semitones) above the root',
};
const SEV_RECIPE = {
  dom7: 'a major triad plus a minor 7th (10 semitones above the root)',
  maj7: 'a major triad plus a major 7th (11 semitones above the root)',
  min7: 'a minor triad plus a minor 7th (10 semitones above the root)',
};
const NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const DEGREE_QUALITY = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];

// Roots whose chord of this recipe needs no double sharps/flats.
const okRoots = (pool, recipe) => pool.filter((r) => buildChord(r, recipe).every(plain));

// Wrong spellings of a chord: one note respelled enharmonically (repeats/skips a letter),
// or one note a semitone off.
function spellingDistractors(chord) {
  const out = [];
  for (let i = 1; i < chord.length; i++) {
    for (const e of enharmonics(chord[i])) { const c = chord.slice(); c[i] = e; out.push(c); }
    for (const d of [-1, 1]) { const c = chord.slice(); c[i] = note(chord[i].l, chord[i].a + d); if (plain(c[i])) out.push(c); }
  }
  return out.filter((c) => c.every(plain));
}

// Spell-the-chord questions are built from note blocks: the chord's notes plus distractor notes
// taken from the wrong options the old multiple-choice builder drew (enharmonic respellings, wrong
// 3rds/5ths/7ths), topped up from its other candidates when those give too few. fourChoices still
// runs first, so every seed keeps its chord and answer; the one extra rng call (the block order)
// comes last.
const EXTRA_NOTES = { easy: [1, 1], medium: [3, 3], hard: [4, 6] };
const ORDER_WORDS = { 3: 'root, 3rd, 5th', 4: 'root, 3rd, 5th, 7th' };
const blocksAsk = (n) => `Place the notes from the root up (${ORDER_WORDS[n]}).`;
function noteTiles(rng, difficulty, chord, choices, cands) {
  const right = chord.map(fmt);
  const ans = fmtList(chord);
  const notesOf = (lists, skip) => {
    const out = [];
    for (const s of lists) for (const n of s.split(', ')) if (!right.includes(n) && !skip.includes(n) && !out.includes(n)) out.push(n);
    return out;
  };
  const [min, max] = EXTRA_NOTES[difficulty];
  let extra = notesOf(choices.filter((c) => c !== ans), []).slice(0, max);
  if (extra.length < min) extra = [...extra, ...notesOf(cands, extra)].slice(0, min);
  return { answer: ans, answerType: 'tiles', tiles: rng.shuffle([...right, ...extra]), joiner: ', ', useAll: false };
}

// ---------------------------------------------------------------- Triads

function genTriads(difficulty, rng) {
  const quals = { easy: ['major', 'minor'], medium: ['major', 'minor', 'minor', 'major', 'diminished'], hard: ['diminished', 'augmented', 'major', 'minor'] }[difficulty];
  const q = rng.pick(quals);
  const roots = okRoots(difficulty === 'easy' ? EASY_ROOTS : COMMON, TRIAD[q]);
  const root = rng.pick(roots);
  const chord = buildChord(root, TRIAD[q]);
  const name = triadName(root, q);
  const kind = rng.pick(difficulty === 'hard' ? ['build', 'member', 'multi'] : ['build', 'build', 'member']);
  const explain = `${cap(art(q))} triad is the root plus ${RECIPE_WORDS[q]}. Stack two thirds on ${fmt(root)}, using every other letter name: ${LETTERS[root.l]}, ${LETTERS[chord[1].l]}, ${LETTERS[chord[2].l]}.\n\n- 3rd: ${fmt(chord[1])}\n- 5th: ${fmt(chord[2])}\n\nSo the ${name} triad is **${fmtList(chord)}**.`;
  const letterHint = `Triads stack two thirds: use every other letter name starting from ${LETTERS[root.l]}, and ignore sharps and flats for now.`;
  const sizeHint = `${cap(art(q))} triad has ${RECIPE_WORDS[q]}. Choose the sharp, flat or natural on each letter that gives those sizes.`;

  if (kind === 'build') {
    const others = QUAL_WORDS.filter((x) => x !== q).map((x) => buildChord(root, TRIAD[x])).filter((c) => c.every(plain));
    const cands = [...others, ...spellingDistractors(chord)].map(fmtList);
    const choices = fourChoices(rng, fmtList(chord), cands);
    if (!choices) return genTriads(difficulty, rng);
    return {
      prompt: `Which notes make the ${name} triad? ${blocksAsk(3)}`,
      ...noteTiles(rng, difficulty, chord, choices, cands),
      explanation: explain,
      hints: [letterHint, sizeHint],
      params: { check: { kind: 'triad-notes', root: fmt(root), quality: q } },
    };
  }

  if (kind === 'member') {
    const which = rng.pick([1, 2]);
    const ans = chord[which];
    const cands = [note(ans.l, ans.a + 1), note(ans.l, ans.a - 1), ...enharmonics(ans), chord[3 - which], note(ans.l + 1, 0), note(ans.l - 1, 0)]
      .filter((m) => plain(m) && !sameNote(m, ans) && !sameNote(m, root)).map(fmt);
    const choices = fourChoices(rng, fmt(ans), cands);
    if (!choices) return genTriads(difficulty, rng);
    const part = which === 1 ? '3rd' : '5th';
    return {
      prompt: `What is the ${part} of the ${name} triad?`,
      answer: fmt(ans), answerType: 'choice', choices,
      explanation: explain,
      hints: [
        `The ${part} of a triad is ${which === 1 ? '3' : '5'} letter names up from the root, counting ${LETTERS[root.l]} as 1.`,
        `In ${art(q)} triad the ${part} is ${which === 1 ? RECIPE_WORDS[q].split(' and ')[0] : RECIPE_WORDS[q].split(' and ')[1].replace(' above the root', '')} above ${fmt(root)}. Pick the accidental that gives that size.`,
      ],
      params: { check: { kind: 'triad-member', root: fmt(root), quality: q, which } },
    };
  }

  // hard multi: third and fifth separately.
  const mk = (i) => {
    const ans = chord[i];
    const cands = [note(ans.l, ans.a + 1), note(ans.l, ans.a - 1), ...enharmonics(ans), note(ans.l + 1, 0), note(ans.l - 1, 0)]
      .filter((m) => plain(m) && !sameNote(m, ans)).map(fmt);
    return fourChoices(rng, fmt(ans), cands);
  };
  const c3 = mk(1), c5 = mk(2);
  if (!c3 || !c5) return genTriads(difficulty, rng);
  return {
    prompt: `Build the ${name} triad on ${fmt(root)}.`,
    answerType: 'multi',
    parts: [
      { id: 'third', label: '3rd', ask: 'Which note is its 3rd?', answerType: 'choice', answer: fmt(chord[1]), choices: c3,
        hint: `Count 3 letter names up from ${LETTERS[root.l]}. In ${art(q)} triad the 3rd is ${RECIPE_WORDS[q].split(' and ')[0]}.` },
      { id: 'fifth', label: '5th', ask: 'Which note is its 5th?', answerType: 'choice', answer: fmt(chord[2]), choices: c5,
        hint: `Count 5 letter names up from ${LETTERS[root.l]}. In ${art(q)} triad the 5th is ${RECIPE_WORDS[q].split(' and ')[1].replace(' above the root', '')} above the root.` },
    ],
    explanation: explain,
    hints: [letterHint],
    params: { multi: true, parts: { third: { kind: 'triad-member', root: fmt(root), quality: q, which: 1 }, fifth: { kind: 'triad-member', root: fmt(root), quality: q, which: 2 } } },
  };
}

// ---------------------------------------------------------------- Identify

const invName = (root, q, inv) => `${triadName(root, q)}, ${INV[inv]}`;

function genIdentify(difficulty, rng) {
  const quals = { easy: ['major', 'minor'], medium: ['major', 'minor'], hard: ['major', 'minor', 'diminished', 'diminished'] }[difficulty];
  const q = rng.pick(quals);
  const root = rng.pick(okRoots(difficulty === 'easy' ? EASY_ROOTS : COMMON, TRIAD[q]));
  const chord = buildChord(root, TRIAD[q]);
  const inv = difficulty === 'easy' ? 0 : rng.int(difficulty === 'hard' ? 0 : 0, 2);
  const voiced = [...chord.slice(inv), ...chord.slice(0, inv)];
  const shown = fmtList(voiced);
  const stackLine = `Rearrange the notes into stacked thirds (every other letter): ${fmtList(chord)}. The bottom note of that stack, ${fmt(root)}, is the root.`;
  const qualLine = `${fmt(root)} up to ${fmt(chord[1])} is a ${q === 'major' || q === 'augmented' ? 'major' : 'minor'} 3rd and ${fmt(root)} up to ${fmt(chord[2])} is ${q === 'diminished' ? 'a diminished' : q === 'augmented' ? 'an augmented' : 'a perfect'} 5th, so it is ${q}.`;
  const invLine = `The bass (lowest) note is ${fmt(voiced[0])}, the ${['root', '3rd', '5th'][inv]}, so it is in ${INV[inv]}.`;
  const hintStack = `Rearrange the letters so they skip one letter each time (like C, E, G). The note at the bottom of that stack is the root.`;
  const hintQual = `Measure the 3rd (root to middle note) and the 5th (root to top note) of your stack in semitones: major 3rd 4, minor 3rd 3; perfect 5th 7, diminished 5th 6.`;
  const hintInv = `Then look at the bass note: root in the bass is root position, the 3rd in the bass is 1st inversion, the 5th in the bass is 2nd inversion.`;

  if (difficulty === 'easy') {
    const cands = [triadName(root, q === 'major' ? 'minor' : 'major'), triadName(root, 'diminished'), triadName(chord[1], 'minor'), triadName(chord[1], 'major'), triadName(chord[2], q)]
      .filter((s) => plain(parseNote(s.split(' ')[0])));
    const choices = fourChoices(rng, triadName(root, q), cands);
    if (!choices) return genIdentify(difficulty, rng);
    return {
      prompt: `Name the triad made of the notes ${shown} (root position, lowest note first).`,
      answer: triadName(root, q), answerType: 'choice', choices,
      explanation: `In root position the lowest note is the root: ${fmt(root)}.\n\n${qualLine}\n\nSo it is **${triadName(root, q)}**.`,
      hints: [`In root position the lowest note is the root.`, hintQual],
      params: { check: { kind: 'identify', notes: shown, mode: 'name' } },
    };
  }

  const kind = difficulty === 'hard' ? rng.pick(['full', 'multi', 'bass']) : rng.pick(['full', 'full', 'bass']);
  if (kind === 'bass') {
    const want = rng.int(0, 2);
    const ans = chord[want];
    const cands = [...chord.filter((m) => !sameNote(m, ans)), ...enharmonics(ans), note(ans.l, ans.a + (ans.a > 0 ? -1 : 1))].filter(plain).map(fmt);
    const choices = fourChoices(rng, fmt(ans), cands);
    if (!choices) return genIdentify(difficulty, rng);
    return {
      prompt: `The ${triadName(root, q)} triad is played in ${INV[want]}. Which note is in the bass (lowest)?`,
      answer: fmt(ans), answerType: 'choice', choices,
      explanation: `The ${triadName(root, q)} triad is ${fmtList(chord)} (root, 3rd, 5th).\n\nIn ${INV[want]} the ${['root', '3rd', '5th'][want]} is in the bass: **${fmt(ans)}**.`,
      hints: [
        `First spell the ${triadName(root, q)} triad: root, 3rd and 5th, using every other letter from ${LETTERS[root.l]}.`,
        `Root position has the root in the bass, 1st inversion the 3rd, and 2nd inversion the 5th.`,
      ],
      params: { check: { kind: 'bass', root: fmt(root), quality: q, inv: want } },
    };
  }

  if (kind === 'full') {
    const ans = invName(root, q, inv);
    const cands = [
      ...[0, 1, 2].filter((i) => i !== inv).map((i) => invName(root, q, i)),
      ...(inv ? [`${triadName(voiced[0], q === 'major' ? 'minor' : 'major')}, root position`, `${triadName(voiced[0], q)}, root position`] : []),
      invName(root, q === 'major' ? 'minor' : q === 'minor' ? 'major' : 'minor', inv),
    ].filter((s) => plain(parseNote(s.split(' ')[0])));
    const choices = fourChoices(rng, ans, cands);
    if (!choices) return genIdentify(difficulty, rng);
    return {
      prompt: `These notes are played from the lowest up: ${shown}. Name the triad and its position.`,
      answer: ans, answerType: 'choice', choices,
      explanation: `${stackLine}\n\n${qualLine}\n\n${invLine}\n\nSo it is **${ans}**.`,
      hints: [hintStack, hintQual, hintInv],
      params: { check: { kind: 'identify', notes: shown, mode: 'full' } },
    };
  }

  // hard multi: root, quality, position.
  const rootC = fourChoices(rng, fmt(root), [...chord.filter((m) => !sameNote(m, root)), ...enharmonics(root), note(root.l, root.a + (root.a > 0 ? -1 : 1))].filter(plain).map(fmt));
  const qualC = fourChoices(rng, q, QUAL_WORDS.filter((x) => x !== q));
  const invC = fourChoices(rng, INV[inv], INV.filter((x) => x !== INV[inv]));
  if (!rootC || !qualC || !invC) return genIdentify(difficulty, rng);
  return {
    prompt: `These notes are played from the lowest up: ${shown}.`,
    answerType: 'multi',
    parts: [
      { id: 'root', label: 'Root', ask: 'Which note is the root?', answerType: 'choice', answer: fmt(root), choices: rootC, hint: hintStack },
      { id: 'quality', label: 'Quality', ask: 'What quality is the triad?', answerType: 'choice', answer: q, choices: qualC, hint: hintQual },
      { id: 'position', label: 'Position', ask: 'Which position is it in?', answerType: 'choice', answer: INV[inv], choices: invC, hint: hintInv },
    ],
    explanation: `${stackLine}\n\n${qualLine}\n\n${invLine}\n\nSo the root is **${fmt(root)}**, the quality is **${q}** and the position is **${INV[inv]}**.`,
    hints: ['Find the root first; the quality and the position both follow from it.'],
    params: { multi: true, parts: { root: { kind: 'identify-part', notes: shown, field: 'root' }, quality: { kind: 'identify-part', notes: shown, field: 'quality' }, position: { kind: 'identify-part', notes: shown, field: 'position' } } },
  };
}

// ---------------------------------------------------------------- Chords in a key

function keyFor(difficulty, rng) {
  const max = { easy: 1, medium: 4, hard: 6 }[difficulty];
  const k = difficulty === 'easy' ? rng.pick([0, 1, -1, 2]) : rng.int(-max, max);
  return { k, tonic: majorTonic(k), scale: scaleFromSignature(k, 'major') };
}

function genInKey(difficulty, rng) {
  const { k, tonic, scale } = keyFor(difficulty, rng);
  const kname = `${fmt(tonic)} major`;
  const kind = { easy: ['chord', 'chord', 'quality'], medium: ['chord', 'numeral', 'quality'], hard: ['notes', 'numeral', 'multi'] }[difficulty];
  const what = rng.pick(kind);
  const degPool = difficulty === 'easy' ? [1, 4, 5, 2, 6] : [1, 2, 3, 4, 5, 6, 7];
  const deg = rng.pick(degPool);
  const root = scale[deg - 1];
  const q = DEGREE_QUALITY[deg - 1];
  const chord = buildChord(root, TRIAD[q]);
  const numeral = NUMERALS[deg - 1];
  const name = triadName(root, q);
  const scaleLine = `The ${kname} scale is ${fmtList(scale)}.`;
  const chordLine = `The chord on degree ${numeral} stacks the scale's notes ${deg}, ${((deg + 1) % 7) + 1} and ${((deg + 3) % 7) + 1}: ${fmtList(chord)}, which is ${name}.`;
  const caseHint = 'Roman numerals show the quality: capitals (I, IV, V) are major, lower case (ii, iii, vi) are minor, and vii° is diminished.';

  if (what === 'quality') {
    const ans = q;
    const choices = fourChoices(rng, ans, QUAL_WORDS.filter((x) => x !== q));
    return {
      prompt: `In any major key, what is the quality of the triad on degree ${numeral.replace('°', '')} (the ${ordinal(deg)} note of the scale)?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `The triads of a major key are I, ii, iii, IV, V, vi, vii°: major on 1, 4 and 5; minor on 2, 3 and 6; diminished on 7.\n\nSo degree ${deg} gives a **${ans}** triad.`,
      hints: [
        `Try it in C major, which has no sharps or flats: the ${ordinal(deg)} note is ${LETTERS[deg - 1]}. Stack every other note of the scale on it.`,
        'Measure that chord: major 3rd + perfect 5th is major, minor 3rd + perfect 5th is minor, minor 3rd + diminished 5th is diminished.',
      ],
      params: { check: { kind: 'degree-quality', deg } },
    };
  }

  if (what === 'chord') {
    const cands = [
      triadName(root, q === 'major' ? 'minor' : 'major'),
      triadName(scale[deg % 7], DEGREE_QUALITY[deg % 7]),
      triadName(scale[(deg + 5) % 7], DEGREE_QUALITY[(deg + 5) % 7]),
      triadName(note(root.l, 0), q),
      triadName(scale[(deg + 3) % 7], DEGREE_QUALITY[(deg + 3) % 7]),
    ].filter((s) => plain(parseNote(s.split(' ')[0])));
    const choices = fourChoices(rng, name, cands);
    if (!choices) return genInKey(difficulty, rng);
    return {
      prompt: `In ${kname}, which chord is ${numeral}?`,
      answer: name, answerType: 'choice', choices,
      explanation: `${scaleLine}\n\n${chordLine}\n\nSo ${numeral} is **${name}**.`,
      hints: [
        `${numeral} is the chord built on the ${ordinal(deg)} note of the ${kname} scale. Write the scale out first.`,
        caseHint,
      ],
      params: { check: { kind: 'chord-on', tonic: fmt(tonic), deg } },
    };
  }

  if (what === 'numeral') {
    const cands = NUMERALS.filter((x) => x !== numeral);
    // Plausible slips first: the same degree in the wrong case, then neighbours.
    const wrongCase = numeral === 'vii°' ? 'VII' : numeral === numeral.toUpperCase() ? numeral.toLowerCase() : numeral.toUpperCase();
    const choices = fourChoices(rng, numeral, [wrongCase, NUMERALS[deg % 7], NUMERALS[(deg + 5) % 7], ...cands].slice(0, 4));
    if (!choices) return genInKey(difficulty, rng);
    return {
      prompt: `In ${kname}, which Roman numeral is the ${name} chord?`,
      answer: numeral, answerType: 'choice', choices,
      explanation: `${scaleLine}\n\n${fmt(root)} is note ${deg} of the scale, and the chord on it is ${q}, so it is **${numeral}**.`,
      hints: [
        `Find ${fmt(root)} in the ${kname} scale: which number note is it?`,
        caseHint,
      ],
      params: { check: { kind: 'numeral', tonic: fmt(tonic), chord: name } },
    };
  }

  const others = [...QUAL_WORDS.filter((x) => x !== q).map((x) => buildChord(root, TRIAD[x])), ...spellingDistractors(chord),
    buildChord(scale[deg % 7], TRIAD[DEGREE_QUALITY[deg % 7]])].filter((c) => c.every(plain)).map(fmtList);
  const notesC = fourChoices(rng, fmtList(chord), others);
  if (!notesC) return genInKey(difficulty, rng);
  if (what === 'notes') {
    return {
      prompt: `Which notes make chord ${numeral} in ${kname}? ${blocksAsk(3)}`,
      ...noteTiles(rng, difficulty, chord, notesC, others),
      explanation: `${scaleLine}\n\n${chordLine}\n\nSo the notes are **${fmtList(chord)}**.`,
      hints: [
        `Write out the ${kname} scale with its key signature.`,
        `Start on note ${deg} and take every other note of the scale: three notes in all.`,
      ],
      params: { check: { kind: 'chord-notes', tonic: fmt(tonic), deg } },
    };
  }
  const nameC = fourChoices(rng, name, [triadName(root, q === 'major' ? 'minor' : 'major'), triadName(scale[deg % 7], DEGREE_QUALITY[deg % 7]), triadName(scale[(deg + 5) % 7], DEGREE_QUALITY[(deg + 5) % 7]), triadName(note(root.l, 0), q), triadName(scale[(deg + 3) % 7], DEGREE_QUALITY[(deg + 3) % 7])].filter((s) => plain(parseNote(s.split(' ')[0]))));
  if (!nameC) return genInKey(difficulty, rng);
  return {
    prompt: `Think about chord ${numeral} in ${kname}.`,
    answerType: 'multi',
    parts: [
      { id: 'name', label: 'Chord', ask: `Which chord is ${numeral}?`, answerType: 'choice', answer: name, choices: nameC,
        hint: `${numeral} is built on the ${ordinal(deg)} note of the scale. ${caseHint}` },
      { id: 'notes', label: 'Notes', ask: 'Which notes does it contain?', answerType: 'choice', answer: fmtList(chord), choices: notesC,
        hint: `Start on note ${deg} of the scale and take every other note, keeping the key signature's sharps or flats.` },
    ],
    explanation: `${scaleLine}\n\n${chordLine}`,
    hints: [`Write out the ${kname} scale first.`],
    params: { multi: true, parts: { name: { kind: 'chord-on', tonic: fmt(tonic), deg }, notes: { kind: 'chord-notes', tonic: fmt(tonic), deg } } },
  };
}

// ---------------------------------------------------------------- Seventh chords

function genSevenths(difficulty, rng) {
  const types = { easy: ['dom7'], medium: ['dom7', 'maj7', 'min7'], hard: ['dom7', 'maj7', 'min7'] }[difficulty];
  const kind = rng.pick({ easy: ['build', 'build', 'seventh'], medium: ['build', 'seventh', 'type'], hard: ['v7', 'v7', 'multi', 'type'] }[difficulty]);

  if (kind === 'v7' || kind === 'multi') {
    const k = rng.int(-6, 6);
    const tonic = majorTonic(k);
    const scale = scaleFromSignature(k, 'major');
    const root = scale[4];
    const chord = buildChord(root, SEVENTH.dom7);
    if (!chord.every(plain)) return genSevenths(difficulty, rng);
    const kname = `${fmt(tonic)} major`;
    const expl = `The ${kname} scale is ${fmtList(scale)}. Its 5th note is ${fmt(root)}.\n\nV7 is the dominant 7th on that note: ${SEV_RECIPE.dom7}. Taking notes 5, 7, 2 and 4 of the scale gives **${fmtList(chord)}** (${sevName(root, 'dom7')}).`;
    const listCands = [
      buildChord(root, SEVENTH.maj7), buildChord(root, SEVENTH.min7), buildChord(tonic, SEVENTH.dom7), buildChord(scale[3], SEVENTH.dom7), ...spellingDistractors(chord),
    ].filter((c) => c.every(plain)).map(fmtList);
    const listC = fourChoices(rng, fmtList(chord), listCands);
    if (!listC) return genSevenths(difficulty, rng);
    if (kind === 'v7') {
      return {
        prompt: `Which notes make the V7 chord in ${kname}? ${blocksAsk(4)}`,
        ...noteTiles(rng, difficulty, chord, listC, listCands),
        explanation: expl,
        hints: [
          `V is built on the 5th note of the ${kname} scale. Find that note first.`,
          `V7 stacks four notes of the scale in thirds: notes 5, 7, 2 and 4, with the key signature's sharps or flats.`,
        ],
        params: { check: { kind: 'v7', tonic: fmt(tonic) } },
      };
    }
    const rootC = fourChoices(rng, fmt(root), [fmt(scale[3]), fmt(scale[5]), fmt(tonic), ...enharmonics(root).map(fmt), fmt(note(root.l, root.a === 0 ? (k < 0 ? -1 : 1) : 0))]);
    const sev = chord[3];
    const sevC = fourChoices(rng, fmt(sev), [note(sev.l, sev.a + 1), note(sev.l, sev.a - 1), ...enharmonics(sev), scale[4 + 2 > 6 ? 0 : 6]].filter((m) => plain(m) && !sameNote(m, sev)).map(fmt));
    if (!rootC || !sevC) return genSevenths(difficulty, rng);
    return {
      prompt: `Think about the V7 chord in ${kname}.`,
      answerType: 'multi',
      parts: [
        { id: 'root', label: 'Root', ask: 'Which note is its root?', answerType: 'choice', answer: fmt(root), choices: rootC,
          hint: `V is the 5th note of the ${kname} scale. Count 5 letter names from ${LETTERS[tonic.l]} and apply the key signature.` },
        { id: 'seventh', label: '7th', ask: 'Which note is its 7th?', answerType: 'choice', answer: fmt(sev), choices: sevC,
          hint: 'The 7th of V7 is a minor 7th (10 semitones) above the root. It is also the 4th note of the scale.' },
      ],
      explanation: expl,
      hints: [`Write out the ${kname} scale first.`],
      params: { multi: true, parts: { root: { kind: 'v7-member', tonic: fmt(tonic), which: 0 }, seventh: { kind: 'v7-member', tonic: fmt(tonic), which: 3 } } },
    };
  }

  const t = rng.pick(types);
  const root = rng.pick(okRoots(difficulty === 'easy' ? EASY_ROOTS : COMMON, SEVENTH[t]));
  const chord = buildChord(root, SEVENTH[t]);
  const sym = sevName(root, t);
  const expl = `${sym} is a ${SEV_WORDS[t]} chord: ${SEV_RECIPE[t]}.\n\nStack thirds on ${fmt(root)} using every other letter (${chord.map((m) => LETTERS[m.l]).join(', ')}):\n\n- 3rd: ${fmt(chord[1])}\n- 5th: ${fmt(chord[2])}\n- 7th: ${fmt(chord[3])}\n\nSo ${sym} is **${fmtList(chord)}**.`;

  if (kind === 'build') {
    const cands = [...Object.keys(SEVENTH).filter((x) => x !== t).map((x) => buildChord(root, SEVENTH[x])), ...spellingDistractors(chord)]
      .filter((c) => c.every(plain)).map(fmtList);
    const choices = fourChoices(rng, fmtList(chord), cands);
    if (!choices) return genSevenths(difficulty, rng);
    return {
      prompt: `Which notes make ${sym} (${fmt(root)} ${SEV_WORDS[t]})? ${blocksAsk(4)}`,
      ...noteTiles(rng, difficulty, chord, choices, cands),
      explanation: expl,
      hints: [
        `A seventh chord stacks three thirds: use every other letter from ${LETTERS[root.l]}, four notes in all.`,
        `${sym} is ${SEV_RECIPE[t]}. Choose the accidental on each letter that gives those sizes.`,
      ],
      params: { check: { kind: 'sev-notes', root: fmt(root), type: t } },
    };
  }

  if (kind === 'seventh') {
    const ans = chord[3];
    const cands = [note(ans.l, ans.a + 1), note(ans.l, ans.a - 1), ...enharmonics(ans), note(ans.l + 1, 0), chord[2]]
      .filter((m) => plain(m) && !sameNote(m, ans) && !sameNote(m, root)).map(fmt);
    const choices = fourChoices(rng, fmt(ans), cands);
    if (!choices) return genSevenths(difficulty, rng);
    return {
      prompt: `What is the 7th (the top note) of ${sym}?`,
      answer: fmt(ans), answerType: 'choice', choices,
      explanation: expl,
      hints: [
        `The 7th is 7 letter names up from ${LETTERS[root.l]}, counting ${LETTERS[root.l]} as 1 (one letter below the root).`,
        `In ${sym} (${SEV_WORDS[t]}) the 7th is ${t === 'maj7' ? 'a major 7th: 11 semitones up, one semitone below the root' : 'a minor 7th: 10 semitones up, a whole tone below the root'}.`,
      ],
      params: { check: { kind: 'sev-member', root: fmt(root), type: t } },
    };
  }

  // type: name the seventh chord from its notes.
  const ans = sym;
  const choices = fourChoices(rng, ans, [...Object.keys(SEVENTH).filter((x) => x !== t).map((x) => sevName(root, x)), `${fmt(root)}dim7`, `${fmt(chord[1])}m7`, `${fmt(chord[2])}7`].filter((s) => /^[A-G][♯♭]?[^♯♭]/.test(s)));
  if (!choices) return genSevenths(difficulty, rng);
  return {
    prompt: `Name the seventh chord made of ${fmtList(chord)} (root position). Symbols: 7 = dominant 7th, maj7 = major 7th, m7 = minor 7th, dim7 = diminished 7th.`,
    answer: ans, answerType: 'choice', choices,
    explanation: `The lowest note, ${fmt(root)}, is the root.\n\n- ${fmt(root)} to ${fmt(chord[1])}: ${t === 'min7' ? 'minor' : 'major'} 3rd\n- ${fmt(root)} to ${fmt(chord[2])}: perfect 5th\n- ${fmt(root)} to ${fmt(chord[3])}: ${t === 'maj7' ? 'major' : 'minor'} 7th\n\nThat is ${SEV_RECIPE[t]}, so the chord is **${ans}**.`,
    hints: [
      `In root position the lowest note is the root. Measure the triad on it first: is the 3rd major (4 semitones) or minor (3)?`,
      'Then measure the 7th: 11 semitones is a major 7th, 10 is a minor 7th. Major triad + minor 7th is a dominant 7th.',
    ],
    params: { check: { kind: 'sev-name', notes: fmtList(chord) } },
  };
}

// ---------------------------------------------------------------- Expert
//
// A separate branch: generate() sends "expert" here before anything else, so easy/medium/hard
// never consume extra rng draws. Hints use only values already drawn (no rng calls).
// The calculator is off for this module, so there are no `given` rows.

// The note `num` letter names below `top` that makes the given interval up to it (BUILD side).
function noteBelow(top, num, quality) {
  const base = note(top.l - (num - 1), 0);
  return note(base.l, top.a - noteAbove(base, num, quality).a);
}
const MEMBER = ['root', '3rd', '5th', '7th'];
// "a major 3rd (4 semitones)" / "a perfect 5th (7 semitones)" for member 1 or 2 of a triad.
const memberWords = (q, which) => (which === 1 ? RECIPE_WORDS[q].split(' and ')[0] : RECIPE_WORDS[q].split(' and ')[1].replace(' above the root', ''));
const okName = (s) => plain(parseNote(s.split(/[ ,]/)[0]) || note(0, 9));
const SEV_HELP = 'Symbols: 7 = dominant 7th, maj7 = major 7th, m7 = minor 7th.';

// Triads with one note moved a semitone (same letter), and the triad that results.
const ALTER = [
  { from: 'major', which: 1, d: -1 }, { from: 'major', which: 2, d: 1 }, { from: 'major', which: 0, d: 1 },
  { from: 'minor', which: 1, d: 1 }, { from: 'minor', which: 2, d: -1 }, { from: 'minor', which: 0, d: -1 },
  { from: 'diminished', which: 2, d: 1 }, { from: 'diminished', which: 0, d: -1 },
  { from: 'augmented', which: 2, d: -1 }, { from: 'augmented', which: 0, d: 1 },
];

function genTriadsExpert(rng) {
  const kind = rng.pick(['which-triad', 'alter']);

  if (kind === 'which-triad') {
    // Working backwards: x is the 3rd (or 5th) of which triad?
    const q = rng.pick(QUAL_WORDS);
    const which = rng.pick([1, 2]);
    const root = rng.pick(okRoots(COMMON, TRIAD[q]));
    const chord = buildChord(root, TRIAD[q]);
    const x = chord[which];
    const [n1, q1] = TRIAD[q][which - 1];
    const [n2, q2] = TRIAD[q][2 - which];
    const cands = [noteBelow(x, n2, q2), x, noteAbove(x, n1, q1), ...enharmonics(root), note(root.l, root.a + 1), note(root.l, root.a - 1)]
      .filter((m) => plain(m) && !sameNote(m, root)).map((m) => triadName(m, q));
    const choices = fourChoices(rng, triadName(root, q), cands);
    if (!choices) return genTriadsExpert(rng);
    const part = MEMBER[which];
    return {
      prompt: `${fmt(x)} is the ${part} of which ${q} triad?`,
      answer: triadName(root, q), answerType: 'choice', choices,
      explanation: `Work downwards from ${fmt(x)}.\n\n- Letter: the ${part} is ${which === 1 ? 3 : 5} letter names above the root, so the root's letter is ${LETTERS[root.l]}.\n- Size: in ${art(q)} triad the ${part} is ${memberWords(q, which)} above the root. The note on ${LETTERS[root.l]} that fits is ${fmt(root)}.\n\nCheck: the ${triadName(root, q)} triad is ${fmtList(chord)}, and its ${part} is ${fmt(x)}. So the answer is **${triadName(root, q)}**.`,
      hints: [
        `Work downwards: the root is ${which === 1 ? 3 : 5} letter names below ${LETTERS[x.l]} (count ${LETTERS[x.l]} as ${which === 1 ? 3 : 5} and go down to 1).`,
        `In ${art(q)} triad the ${part} is ${memberWords(q, which)} above the root. Choose the accidental on the root letter that gives that size.`,
      ],
      params: { check: { kind: 'triad-with', member: fmt(x), which, quality: q } },
    };
  }

  // alter: move one note a semitone and name the new triad.
  const t = rng.pick(ALTER);
  const roots = COMMON.filter((r) => {
    const c = buildChord(r, TRIAD[t.from]);
    return c.every(plain) && plain(note(c[t.which].l, c[t.which].a + t.d));
  });
  const root = rng.pick(roots);
  const chord = buildChord(root, TRIAD[t.from]);
  const old = chord[t.which];
  const moved = note(old.l, old.a + t.d);
  const after = chord.slice();
  after[t.which] = moved;
  const newRoot = t.which === 0 ? moved : root;
  // Quality of the new triad from its 3rd and 5th sizes (BUILD side, pitch classes).
  const s3 = (pc(after[1]) - pc(after[0]) + 12) % 12;
  const s5 = (pc(after[2]) - pc(after[0]) + 12) % 12;
  const newQ = QUAL_WORDS.find((x) => (pc(buildChord(note(0), TRIAD[x])[1]) === s3 && pc(buildChord(note(0), TRIAD[x])[2]) === s5));
  if (!newQ) return genTriadsExpert(rng);
  const part = MEMBER[t.which];
  const noteC = fourChoices(rng, fmt(moved), [note(old.l, old.a - t.d), ...enharmonics(moved), old, note(moved.l, moved.a + t.d)]
    .filter((m) => plain(m) && !sameNote(m, moved)).map(fmt));
  const nameC = fourChoices(rng, triadName(newRoot, newQ), [...QUAL_WORDS.filter((x) => x !== newQ).map((x) => triadName(newRoot, x)), triadName(t.which === 0 ? root : old, newQ)]
    .filter((s) => okName(s) && s !== triadName(newRoot, newQ)));
  if (!noteC || !nameC) return genTriadsExpert(rng);
  const verb = t.d > 0 ? 'Raise' : 'Lower';
  return {
    prompt: `Start with the ${triadName(root, t.from)} triad: ${fmtList(chord)}. ${verb} its ${part} by a semitone, keeping the same letter name.`,
    answerType: 'multi',
    parts: [
      { id: 'note', label: `New ${part}`, ask: `Which note replaces ${fmt(old)}?`, answerType: 'choice', answer: fmt(moved), choices: noteC,
        hint: `Keep the letter ${LETTERS[old.l]} and ${t.d > 0 ? 'raise' : 'lower'} it by one semitone: ${t.d > 0 ? 'a flat becomes natural, a natural becomes sharp' : 'a sharp becomes natural, a natural becomes flat'}.` },
      { id: 'name', label: 'New triad', ask: 'Which triad do the three new notes make?', answerType: 'choice', answer: triadName(newRoot, newQ), choices: nameC,
        hint: 'The letters still stack in thirds, so the root is still the bottom letter of the stack. Measure its 3rd (4 = major, 3 = minor) and 5th (7 = perfect, 6 = diminished, 8 = augmented).' },
    ],
    explanation: `${verb} ${fmt(old)} to **${fmt(moved)}**: the notes are now ${fmtList(after)}.\n\nThey still stack in thirds, so ${fmt(newRoot)} is the root. ${fmt(newRoot)} up to ${fmt(after[1])} is ${semis(s3)} and up to ${fmt(after[2])} is ${semis(s5)}, which makes it **${triadName(newRoot, newQ)}**.`,
    hints: [
      `Change only the ${part}, keeping its letter. The other two notes stay as they are.`,
      'Then name the new triad: find its root and measure the 3rd and 5th above it.',
    ],
    params: { multi: true, parts: { note: { kind: 'altered-note', root: fmt(root), quality: t.from, which: t.which, d: t.d }, name: { kind: 'altered-name', root: fmt(root), quality: t.from, which: t.which, d: t.d } } },
  };
}

const semis = (n) => (n === 1 ? '1 semitone' : `${n} semitones`);
// Semitones in an interval, from the root C (BUILD side): e.g. (7, 'minor') -> 10.
const semisOf = (num, quality) => (pc(noteAbove(note(0), num, quality)) + 12) % 12 || 12;

function genIdentifyExpert(rng) {
  const kind = rng.pick(['sev-inv', 'aug-inv', 'bass-back', 'sev-back']);

  if (kind === 'sev-back') {
    // Working backwards from the bass of an inverted seventh chord.
    const t = rng.pick(['dom7', 'maj7', 'min7']);
    const root = rng.pick(okRoots(COMMON, SEVENTH[t]));
    const chord = buildChord(root, SEVENTH[t]);
    const inv = rng.int(1, 3);
    const bass = chord[inv];
    const sym = sevName(root, t);
    const others = [1, 2, 3].filter((i) => i !== inv).map((i) => noteBelow(bass, ...SEVENTH[t][i - 1]));
    const cands = [bass, ...others, ...enharmonics(root), note(root.l, root.a + 1), note(root.l, root.a - 1)]
      .filter((m) => plain(m) && !sameNote(m, root)).map((m) => sevName(m, t));
    const choices = fourChoices(rng, sym, cands);
    if (!choices) return genIdentifyExpert(rng);
    const [bn, bq] = SEVENTH[t][inv - 1];
    const ivWords = `${art(`${bq} ${ordinal(bn)}`)} (${semis(semisOf(bn, bq))})`;
    return {
      prompt: `${cap(art(SEV_WORDS[t]))} chord is played in ${INV[inv]}, with ${fmt(bass)} in the bass. Which chord is it? ${SEV_HELP}`,
      answer: sym, answerType: 'choice', choices,
      explanation: `In ${INV[inv]} the bass is the ${MEMBER[inv]}, so ${fmt(bass)} is the ${MEMBER[inv]} of the chord.\n\nIn ${art(SEV_WORDS[t])} chord the ${MEMBER[inv]} is ${ivWords} above the root. Going down ${bn - 1} letter names from ${LETTERS[bass.l]} gives the root ${fmt(root)}.\n\nCheck: ${sym} is ${fmtList(chord)}. So the chord is **${sym}**.`,
      hints: [
        `In ${INV[inv]} the bass note is the ${MEMBER[inv]} of the chord, not the root.`,
        `So the root is ${bn} letter names below ${LETTERS[bass.l]} (count ${LETTERS[bass.l]} as ${bn}), and ${ivWords} below ${fmt(bass)}.`,
      ],
      params: { check: { kind: 'sev-back', bass: fmt(bass), inv, type: t } },
    };
  }

  if (kind === 'sev-inv') {
    const t = rng.pick(['dom7', 'maj7', 'min7']);
    const root = rng.pick(okRoots(COMMON, SEVENTH[t]));
    const chord = buildChord(root, SEVENTH[t]);
    const inv = rng.int(1, 3);
    const voiced = [...chord.slice(inv), ...chord.slice(0, inv)];
    const shown = fmtList(voiced);
    const ans = `${sevName(root, t)}, ${INV[inv]}`;
    const cands = [
      ...[0, 1, 2, 3].filter((i) => i !== inv).map((i) => `${sevName(root, t)}, ${INV[i]}`),
      `${sevName(voiced[0], t)}, root position`,
      ...Object.keys(SEVENTH).filter((x) => x !== t).map((x) => `${sevName(root, x)}, ${INV[inv]}`),
    ].filter(okName);
    const choices = fourChoices(rng, ans, cands);
    if (!choices) return genIdentifyExpert(rng);
    return {
      prompt: `These notes are played from the lowest up: ${shown}. Name the seventh chord and its position. ${SEV_HELP}`,
      answer: ans, answerType: 'choice', choices,
      explanation: `Rearrange into stacked thirds (every other letter): ${fmtList(chord)}. The root is ${fmt(root)}.\n\n${fmt(root)} to ${fmt(chord[1])} is a ${t === 'min7' ? 'minor' : 'major'} 3rd, to ${fmt(chord[2])} a perfect 5th and to ${fmt(chord[3])} a ${t === 'maj7' ? 'major' : 'minor'} 7th: ${SEV_RECIPE[t]}, so it is ${sevName(root, t)}.\n\nThe bass is ${fmt(voiced[0])}, the ${MEMBER[inv]}, so it is in ${INV[inv]}: **${ans}**.`,
      hints: [
        'Rearrange the four notes so the letters skip one each time (stacked thirds). The bottom note of that stack is the root.',
        'Measure from the root: major triad + minor 7th = 7, major triad + major 7th = maj7, minor triad + minor 7th = m7.',
        'Then the bass: root = root position, 3rd = 1st inversion, 5th = 2nd inversion, 7th = 3rd inversion.',
      ],
      params: { check: { kind: 'sev-identify', notes: shown } },
    };
  }

  if (kind === 'aug-inv') {
    // Augmented and diminished triads in inversion: the spelling, not the sound, finds the root.
    const q = rng.pick(['augmented', 'diminished']);
    const root = rng.pick(okRoots(COMMON, TRIAD[q]));
    const chord = buildChord(root, TRIAD[q]);
    const inv = rng.int(1, 2);
    const voiced = [...chord.slice(inv), ...chord.slice(0, inv)];
    const shown = fmtList(voiced);
    const rootC = fourChoices(rng, fmt(root), [...chord.filter((m) => !sameNote(m, root)), ...enharmonics(root), note(root.l, root.a + (root.a > 0 ? -1 : 1))].filter(plain).map(fmt));
    const invC = fourChoices(rng, INV[inv], INV.filter((x) => x !== INV[inv]));
    if (!rootC || !invC) return genIdentifyExpert(rng);
    return {
      prompt: `These notes form ${art(q)} triad, played from the lowest up: ${shown}.`,
      answerType: 'multi',
      parts: [
        { id: 'root', label: 'Root', ask: 'Which note is the root?', answerType: 'choice', answer: fmt(root), choices: rootC,
          hint: q === 'augmented'
            ? 'Every note of an augmented triad is a major 3rd (4 semitones) from the next, so the sound cannot tell you the root. The letters can: find the order in which they skip one letter each time.'
            : 'Find the order of the letters that skips one letter each time (stacked thirds). The bottom of that stack is the root.' },
        { id: 'position', label: 'Position', ask: 'Which position is it in?', answerType: 'choice', answer: INV[inv], choices: invC,
          hint: 'Compare the bass (lowest) note with the root you found: root in the bass = root position, 3rd = 1st inversion, 5th = 2nd inversion.' },
      ],
      explanation: `Stacked in thirds (every other letter) the notes are ${fmtList(chord)}, so the root is **${fmt(root)}**: ${fmt(root)} to ${fmt(chord[1])} is a ${q === 'augmented' ? 'major' : 'minor'} 3rd and ${fmt(root)} to ${fmt(chord[2])} ${q === 'augmented' ? 'an augmented' : 'a diminished'} 5th.\n\nThe bass, ${fmt(voiced[0])}, is the ${MEMBER[inv]}, so it is in **${INV[inv]}**.`,
      hints: ['Find the root from the letter names first; the position follows from it.'],
      params: { multi: true, parts: { root: { kind: 'identify-part', notes: shown, field: 'root' }, position: { kind: 'identify-part', notes: shown, field: 'position' } } },
    };
  }

  // bass-back: working backwards from the bass note of an inversion.
  const q = rng.pick(['major', 'minor', 'diminished']);
  const root = rng.pick(okRoots(COMMON, TRIAD[q]));
  const chord = buildChord(root, TRIAD[q]);
  const inv = rng.int(1, 2);
  const bass = chord[inv];
  const [oN, oQ] = TRIAD[q][2 - inv]; // the other member's interval: the classic mix-up
  const cands = [bass, noteBelow(bass, oN, oQ), ...enharmonics(root), note(root.l, root.a + 1), note(root.l, root.a - 1)]
    .filter((m) => plain(m) && !sameNote(m, root)).map((m) => triadName(m, q));
  const choices = fourChoices(rng, triadName(root, q), cands);
  if (!choices) return genIdentifyExpert(rng);
  return {
    prompt: `${cap(art(q))} triad is played in ${INV[inv]}, with ${fmt(bass)} in the bass. Which triad is it?`,
    answer: triadName(root, q), answerType: 'choice', choices,
    explanation: `In ${INV[inv]} the bass is the ${MEMBER[inv]}, so ${fmt(bass)} is the ${MEMBER[inv]} of the chord.\n\nIn ${art(q)} triad the ${MEMBER[inv]} is ${memberWords(q, inv)} above the root. Going down from ${fmt(bass)} (${inv === 1 ? 3 : 5} letter names) gives the root ${fmt(root)}.\n\nCheck: ${triadName(root, q)} is ${fmtList(chord)}; in ${INV[inv]} it is played ${fmtList([...chord.slice(inv), ...chord.slice(0, inv)])}. So it is **${triadName(root, q)}**.`,
    hints: [
      `In ${INV[inv]} the bass note is the ${MEMBER[inv]} of the chord, not the root.`,
      `So the root is ${inv === 1 ? 3 : 5} letter names below ${LETTERS[bass.l]}, and ${memberWords(q, inv)} below ${fmt(bass)}.`,
    ],
    params: { check: { kind: 'bass-back', bass: fmt(bass), inv, quality: q } },
  };
}

// Harmonic minor: the triad qualities on each degree (BUILD side).
const HM_QUALITY = ['minor', 'diminished', 'augmented', 'minor', 'major', 'major', 'diminished'];
const NAT_QUALITY = ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'];
const minorKeys = [];
for (let k = -6; k <= 6; k++) {
  const sc = scaleFromSignature(k, 'harmonic');
  if (sc.every(plain)) minorKeys.push({ k, scale: sc, natural: scaleFromSignature(k, 'natural') });
}
const triadOn = (scale, deg) => [scale[deg - 1], scale[(deg + 1) % 7], scale[(deg + 3) % 7]];
const DEG_INTERVAL = ['', 'a major 2nd', 'a major 3rd', 'a perfect 4th', 'a perfect 5th', 'a major 6th', 'a major 7th'];

function genInKeyExpert(rng) {
  const kind = rng.pick(['which-key', 'minor-key', 'inv-numeral']);

  if (kind === 'which-key') {
    // Working backwards: this chord is numeral N in which major key?
    const k = rng.int(-6, 6);
    const tonic = majorTonic(k);
    const scale = scaleFromSignature(k, 'major');
    const deg = rng.int(2, 7);
    const root = scale[deg - 1];
    const q = DEGREE_QUALITY[deg - 1];
    const chord = buildChord(root, TRIAD[q]);
    if (!chord.every(plain) || !plain(tonic)) return genInKeyExpert(rng);
    const name = triadName(root, q);
    const ans = `${fmt(tonic)} major`;
    // The same chord with a different numeral in other keys (the classic mix-ups), then near misses.
    const cands = [];
    for (let k2 = -7; k2 <= 7; k2++) {
      if (k2 === k) continue;
      const d2 = scaleFromSignature(k2, 'major').findIndex((m) => sameNote(m, root));
      if (d2 >= 0 && DEGREE_QUALITY[d2] === q) cands.push(`${fmt(majorTonic(k2))} major`);
    }
    cands.push(`${fmt(root)} major`, ...enharmonics(tonic).map((m) => `${fmt(m)} major`), `${fmt(note(tonic.l, tonic.a + 1))} major`, `${fmt(note(tonic.l, tonic.a - 1))} major`);
    const choices = fourChoices(rng, ans, cands.filter((c) => okName(c) && c !== ans));
    if (!choices) return genInKeyExpert(rng);
    return {
      prompt: `${name} is chord ${NUMERALS[deg - 1]} in which major key?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `${NUMERALS[deg - 1]} is the chord on the ${ordinal(deg)} note of the key, so ${fmt(root)} is note ${deg} of the scale.\n\nThe ${ordinal(deg)} note of a major scale is ${DEG_INTERVAL[deg - 1]} above the tonic. Going down ${deg - 1} letter names from ${LETTERS[root.l]} gives ${LETTERS[tonic.l]}, and the note that fits is ${fmt(tonic)}.\n\nCheck: ${fmt(tonic)} major is ${fmtList(scale)}; its ${NUMERALS[deg - 1]} chord is ${fmtList(chord)}. So the key is **${ans}**.`,
      hints: [
        `${NUMERALS[deg - 1]} means the chord is built on the ${ordinal(deg)} note of the key, so ${fmt(root)} is note ${deg} of the scale you want.`,
        `Count ${deg - 1} letter names down from ${LETTERS[root.l]} to find the tonic's letter. Then choose the accidental so that ${fmt(root)} is ${DEG_INTERVAL[deg - 1]} above the tonic.`,
      ],
      params: { check: { kind: 'key-of-chord', chord: name, deg } },
    };
  }

  if (kind === 'minor-key') {
    // Chords of a minor key from the harmonic minor scale (raised 7th).
    const key = rng.pick(minorKeys);
    const T = key.scale[0];
    const d1 = rng.pick([5, 7, 3, 6, 4, 2]);
    const d2 = rng.pick([3, 5, 7, 2, 1, 4, 6].filter((d) => d !== d1));
    const root1 = key.scale[d1 - 1];
    const q1 = HM_QUALITY[d1 - 1];
    const q2 = HM_QUALITY[d2 - 1];
    const ans = triadName(root1, q1);
    const natName = triadName(key.natural[d1 - 1], NAT_QUALITY[d1 - 1]);
    const cands = [natName, triadName(root1, q1 === 'major' ? 'minor' : 'major'), triadName(key.scale[d1 % 7], HM_QUALITY[d1 % 7]), triadName(key.scale[(d1 + 5) % 7], HM_QUALITY[(d1 + 5) % 7]), triadName(note(root1.l, root1.a + (root1.a > 0 ? -1 : 1)), q1)]
      .filter((s) => okName(s) && s !== ans);
    const nameC = fourChoices(rng, ans, cands);
    const qualC = fourChoices(rng, q2, QUAL_WORDS.filter((x) => x !== q2));
    if (!nameC || !qualC) return genInKeyExpert(rng);
    const stackWords = (d) => `notes ${d}, ${((d + 1) % 7) + 1} and ${((d + 3) % 7) + 1}`;
    return {
      prompt: `In ${fmt(T)} minor, chords are usually built from the harmonic minor scale: the natural minor with its 7th note raised a semitone. Think about the triads on degrees ${d1} and ${d2}.`,
      answerType: 'multi',
      parts: [
        { id: 'chord', label: `Degree ${d1}`, ask: `Which triad is built on degree ${d1} (the ${ordinal(d1)} note)?`, answerType: 'choice', answer: ans, choices: nameC,
          hint: `Stack ${stackWords(d1)} of the harmonic minor scale, then measure the 3rd and 5th from the bottom note.` },
        { id: 'quality', label: `Degree ${d2}`, ask: `What quality is the triad on degree ${d2}?`, answerType: 'choice', answer: q2, choices: qualC,
          hint: `Stack ${stackWords(d2)} of the scale. Major 3rd + perfect 5th = major; minor 3rd + perfect 5th = minor; minor 3rd + diminished 5th = diminished; major 3rd + augmented 5th = augmented.` },
      ],
      explanation: `${fmt(T)} minor has ${key.k === 0 ? 'no sharps or flats' : `the key signature of ${fmt(majorTonic(key.k))} major`}. Raising the 7th gives ${fmt(T)} harmonic minor: ${fmtList(key.scale)}.\n\n- Degree ${d1}: ${fmtList(triadOn(key.scale, d1))}, which is **${ans}**.\n- Degree ${d2}: ${fmtList(triadOn(key.scale, d2))}, which is **${q2}**.\n\nIn harmonic minor the triads are i, ii°, III+, iv, V, VI, vii°: the raised 7th makes V major, vii° diminished and III augmented.`,
      hints: [`Write out ${fmt(T)} harmonic minor first: its key signature, plus the 7th note raised by a semitone.`],
      params: { multi: true, parts: { chord: { kind: 'minor-chord', tonic: fmt(T), deg: d1 }, quality: { kind: 'minor-quality', tonic: fmt(T), deg: d2 } } },
    };
  }

  // inv-numeral: an inverted chord in a key -> numeral and position.
  const k = rng.int(-6, 6);
  const tonic = majorTonic(k);
  const scale = scaleFromSignature(k, 'major');
  const kname = `${fmt(tonic)} major`;
  const deg = rng.int(1, 7);
  const q = DEGREE_QUALITY[deg - 1];
  const chord = buildChord(scale[deg - 1], TRIAD[q]);
  if (!chord.every(plain)) return genInKeyExpert(rng);
  const inv = rng.int(1, 2);
  const voiced = [...chord.slice(inv), ...chord.slice(0, inv)];
  const shown = fmtList(voiced);
  const numeral = NUMERALS[deg - 1];
  const bassDeg = (deg - 1 + 2 * inv) % 7;
  const wrongCase = numeral === 'vii°' ? 'VII' : numeral === numeral.toUpperCase() ? numeral.toLowerCase() : numeral.toUpperCase();
  const numC = fourChoices(rng, numeral, [NUMERALS[bassDeg], wrongCase, NUMERALS[deg % 7], NUMERALS[(deg + 5) % 7]].filter((x) => x !== numeral));
  const invC = fourChoices(rng, INV[inv], INV.filter((x) => x !== INV[inv]));
  if (!numC || !invC) return genInKeyExpert(rng);
  return {
    prompt: `In ${kname}, these notes are played from the lowest up: ${shown}.`,
    answerType: 'multi',
    parts: [
      { id: 'numeral', label: 'Numeral', ask: 'Which Roman numeral is this chord?', answerType: 'choice', answer: numeral, choices: numC,
        hint: `The numeral comes from the root, not the bass. Find the root's position in the ${kname} scale. ${'Capitals (I, IV, V) are major, lower case (ii, iii, vi) minor, vii° diminished.'}` },
      { id: 'position', label: 'Position', ask: 'Which position is it in?', answerType: 'choice', answer: INV[inv], choices: invC,
        hint: 'Root in the bass = root position, 3rd = 1st inversion, 5th = 2nd inversion.' },
    ],
    explanation: `Stacked in thirds the notes are ${fmtList(chord)}, so the root is ${fmt(chord[0])}, not the bass ${fmt(voiced[0])}.\n\nThe ${kname} scale is ${fmtList(scale)}: ${fmt(chord[0])} is note ${deg}, and the chord is ${q}, so the numeral is **${numeral}**.\n\nThe bass, ${fmt(voiced[0])}, is the ${MEMBER[inv]}: **${INV[inv]}**.`,
    hints: ['The lowest note is not necessarily the root. Rearrange the notes into stacked thirds (every other letter) first.'],
    params: { multi: true, parts: { numeral: { kind: 'numeral-notes', tonic: fmt(tonic), notes: shown }, position: { kind: 'identify-part', notes: shown, field: 'position' } } },
  };
}

// Diatonic seventh chords of a major key, degrees 1-6 (vii is half-diminished, not used here).
const DEG7_TYPE = ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7'];

function genSeventhsExpert(rng) {
  const kind = rng.pick(['diatonic7', 'seventh-of', 'v7-key']);

  if (kind === 'diatonic7') {
    const k = rng.int(-6, 6);
    const tonic = majorTonic(k);
    const scale = scaleFromSignature(k, 'major');
    const kname = `${fmt(tonic)} major`;
    const deg = rng.int(1, 6);
    const t = DEG7_TYPE[deg - 1];
    const root = scale[deg - 1];
    const chord = buildChord(root, SEVENTH[t]);
    if (!chord.every(plain)) return genSeventhsExpert(rng);
    const sym = sevName(root, t);
    const notesC = fourChoices(rng, fmtList(chord), [...Object.keys(SEVENTH).filter((x) => x !== t).map((x) => buildChord(root, SEVENTH[x])), ...spellingDistractors(chord)]
      .filter((c) => c.every(plain)).map(fmtList));
    const symC = fourChoices(rng, sym, [...Object.keys(SEVENTH).filter((x) => x !== t).map((x) => sevName(root, x)), `${fmt(root)}dim7`, sevName(note(root.l, 0), t)]
      .filter((s) => s !== sym && /^[A-G][♯♭]?(7|maj7|m7|dim7)$/.test(s)));
    if (!notesC || !symC) return genSeventhsExpert(rng);
    const degs = [0, 2, 4, 6].map((i) => ((deg - 1 + i) % 7) + 1);
    return {
      prompt: `Build the seventh chord on degree ${deg} of ${kname} (the ${ordinal(deg)} note), using only notes of the scale. ${SEV_HELP}`,
      answerType: 'multi',
      parts: [
        { id: 'notes', label: 'Notes', ask: 'Which notes make the chord?', answerType: 'choice', answer: fmtList(chord), choices: notesC,
          hint: `Take scale notes ${degs.join(', ')}: every other note, keeping the key signature.` },
        { id: 'symbol', label: 'Symbol', ask: 'What is its chord symbol?', answerType: 'choice', answer: sym, choices: symC,
          hint: 'Measure from the root: major triad + minor 7th = 7, major triad + major 7th = maj7, minor triad + minor 7th = m7.' },
      ],
      explanation: `The ${kname} scale is ${fmtList(scale)}. Taking notes ${degs.join(', ')} gives **${fmtList(chord)}**.\n\nFrom ${fmt(root)}: ${SEV_RECIPE[t]}, so the symbol is **${sym}** (${SEV_WORDS[t]}).\n\nIn every major key the seventh chords run Imaj7, ii7, iii7, IVmaj7, V7, vi7 (m7 on ii, iii and vi).`,
      hints: [`Write out the ${kname} scale first.`],
      params: { multi: true, parts: { notes: { kind: 'diatonic7-notes', tonic: fmt(tonic), deg }, symbol: { kind: 'diatonic7-name', tonic: fmt(tonic), deg } } },
    };
  }

  if (kind === 'seventh-of') {
    // Working backwards: x is the 7th of which chord?
    const t = rng.pick(['dom7', 'maj7', 'min7']);
    const which = rng.pick([3, 3, 1, 2]);
    const root = rng.pick(okRoots(COMMON, SEVENTH[t]));
    const chord = buildChord(root, SEVENTH[t]);
    const x = chord[which];
    const sym = sevName(root, t);
    const others = [1, 2, 3].filter((i) => i !== which).map((i) => noteBelow(x, ...SEVENTH[t][i - 1]));
    const cands = [...others, noteBelow(x, 7, t === 'maj7' ? 'minor' : 'major'), x, ...enharmonics(root), note(root.l, root.a + 1), note(root.l, root.a - 1)]
      .filter((m) => plain(m) && !sameNote(m, root)).map((m) => sevName(m, t));
    const choices = fourChoices(rng, sym, cands);
    if (!choices) return genSeventhsExpert(rng);
    const [wn, wq] = SEVENTH[t][which - 1];
    const memWords = `${art(`${wq} ${ordinal(wn)}`)} (${semis(semisOf(wn, wq))})`;
    const part = MEMBER[which];
    const letterLine = which === 3
      ? `7 letter names up from the root wraps round to one letter below it, so the root's letter is ${LETTERS[root.l]}`
      : `the ${part} is ${wn} letter names above the root, so the root's letter is ${LETTERS[root.l]}`;
    return {
      prompt: `${fmt(x)} is the ${part} of which ${SEV_WORDS[t]} chord? ${SEV_HELP}`,
      answer: sym, answerType: 'choice', choices,
      explanation: `Work from ${fmt(x)} to the root.\n\n- Letter: ${letterLine}.\n- Size: in ${art(SEV_WORDS[t])} chord the ${part} is ${memWords} above the root. So the root is ${fmt(root)}.\n\nCheck: ${sym} is ${fmtList(chord)}. So the answer is **${sym}**.`,
      hints: [
        which === 3
          ? `The 7th is 7 letter names above the root, which is one letter below it. So the root uses the letter one above ${LETTERS[x.l]}.`
          : `The ${part} is ${wn} letter names above the root: count ${LETTERS[x.l]} as ${wn} and go down to 1 for the root's letter.`,
        `In ${art(SEV_WORDS[t])} chord the ${part} is ${memWords} above the root. Choose the accidental on the root letter that fits.`,
      ],
      params: { check: { kind: 'seventh-of', member: fmt(x), which, type: t } },
    };
  }

  // v7-key: from the V7 symbol, the key and its leading note.
  const k = rng.int(-6, 6);
  const minor = rng.next() < 0.4;
  const mode = minor ? 'minor' : 'major';
  // Minor keys: V7 comes from the harmonic minor (raised 7th), so it matches the parallel major's V7.
  const tonic = minor ? minorTonic(k) : majorTonic(k);
  const scale = scaleFromSignature(k, minor ? 'harmonic' : 'major');
  const root = scale[4];
  const chord = buildChord(root, SEVENTH.dom7);
  if (!chord.every(plain) || !scale.every(plain)) return genSeventhsExpert(rng);
  const sym = sevName(root, 'dom7');
  const ans = `${fmt(tonic)} ${mode}`;
  const keyC = fourChoices(rng, ans, [`${fmt(root)} ${mode}`, `${fmt(noteAbove(root, 5, 'perfect'))} ${mode}`, ...enharmonics(tonic).map((m) => `${fmt(m)} ${mode}`), `${fmt(note(tonic.l, tonic.a + 1))} ${mode}`, `${fmt(note(tonic.l, tonic.a - 1))} ${mode}`]
    .filter((c) => okName(c) && c !== ans));
  const lead = chord[1];
  const leadC = fourChoices(rng, fmt(lead), [chord[0], chord[2], chord[3], ...enharmonics(lead)].filter((m) => plain(m) && !sameNote(m, lead)).map(fmt));
  if (!keyC || !leadC) return genSeventhsExpert(rng);
  return {
    prompt: `${sym} is the V7 (dominant 7th) chord of a ${mode} key.${minor ? ' In a minor key, V7 uses the raised 7th of the harmonic minor.' : ''}`,
    answerType: 'multi',
    parts: [
      { id: 'key', label: 'Key', ask: `Which ${mode} key is it V7 in?`, answerType: 'choice', answer: ans, choices: keyC,
        hint: `V is built on the 5th note of the key, so the tonic is a perfect 5th below ${fmt(root)} (count ${LETTERS[root.l]} as 5 and go down to 1).` },
      { id: 'lead', label: 'Leading note', ask: `Which note of ${sym} is the leading note of that key (its 7th scale note)?`, answerType: 'choice', answer: fmt(lead), choices: leadC,
        hint: 'The leading note is the 7th note of the scale, a semitone below the tonic. Spell the chord, then find the note a semitone below your key\'s tonic.' },
    ],
    explanation: `${sym} is ${fmtList(chord)}. V is the 5th note of the key, so the tonic is a perfect 5th below ${fmt(root)}: **${ans}**.\n\nThe ${ans} scale${minor ? ' (harmonic minor)' : ''} is ${fmtList(scale)}; its 7th note (the leading note) is ${fmt(scale[6])}, which is the 3rd of ${sym}: **${fmt(lead)}**. In V7 the leading note pulls up to the tonic.`,
    hints: ['Find the key first; the leading note follows from it.'],
    params: { multi: true, parts: { key: { kind: 'v7-key', sym, mode }, lead: { kind: 'v7-lead', sym, mode } } },
  };
}

function genExpert(subtopic, rng) {
  switch (subtopic) {
    case 'triads': return genTriadsExpert(rng);
    case 'identify': return genIdentifyExpert(rng);
    case 'in-key': return genInKeyExpert(rng);
    case 'sevenths': return genSeventhsExpert(rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---------------------------------------------------------------- generate / verify

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === 'expert') return genExpert(subtopic, rng);
  if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  switch (subtopic) {
    case 'triads': return genTriads(difficulty, rng);
    case 'identify': return genIdentify(difficulty, rng);
    case 'in-key': return genInKey(difficulty, rng);
    case 'sevenths': return genSevenths(difficulty, rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---- CHECK side ----

// Chord definitions as interval names from the root (verification's own table).
const DEF = {
  major: [[3, 'major'], [5, 'perfect']],
  minor: [[3, 'minor'], [5, 'perfect']],
  diminished: [[3, 'minor'], [5, 'diminished']],
  augmented: [[3, 'major'], [5, 'augmented']],
  dom7: [[3, 'major'], [5, 'perfect'], [7, 'minor']],
  maj7: [[3, 'major'], [5, 'perfect'], [7, 'major']],
  min7: [[3, 'minor'], [5, 'perfect'], [7, 'minor']],
};

// Brute force: on the letter `num` names above root, try every accidental and keep the one
// that classifies as the wanted interval.
function toneAbove(root, num, quality) {
  for (let a = -2; a <= 2; a++) {
    const m = note(root.l + num - 1, a);
    const c = classify(root, m);
    if (c && c.num === num && c.quality === quality) return m;
  }
  return null;
}
const chordTones = (root, type) => [root, ...DEF[type].map(([n, q]) => toneAbove(root, n, q))];

function parseTriadName(s) {
  const m = /^(\S+) (major|minor|diminished|augmented)(?:, (root position|1st inversion|2nd inversion|3rd inversion))?$/.exec(String(s).trim());
  if (!m) return null;
  const root = parseNote(m[1]);
  return root ? { root, quality: m[2], inv: m[3] ? INV.indexOf(m[3]) : null } : null;
}
function parseSevName(s) {
  const m = /^([A-G][♯♭]?)(7|maj7|m7|dim7)$/.exec(String(s).trim());
  if (!m) return null;
  const type = { 7: 'dom7', maj7: 'maj7', m7: 'min7', dim7: 'dim7' }[m[2]];
  return { root: parseNote(m[1]), type };
}
const listEq = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => sameNote(x, b[i]));

// Major-key scale by step pattern, and the triad on a degree by taking every other scale note.
const keyScale = (tonicStr) => scaleByPattern(parseNote(tonicStr), 'major');
const stackOn = (scale, deg, n = 3) => Array.from({ length: n }, (_, i) => scale[(deg - 1 + 2 * i) % 7]);
const QUAL_OF = { major: 'major', minor: 'minor', diminished: 'diminished', augmented: 'augmented' };

function isRight(c, v) {
  const s = String(v ?? '').trim();
  switch (c.kind) {
    case 'triad-notes':
      return listEq(parseList(s), chordTones(parseNote(c.root), c.quality));
    case 'triad-member':
      return sameNote(parseNote(s), chordTones(parseNote(c.root), c.quality)[c.which]);
    case 'identify': {
      const id = identifyChord(parseList(c.notes));
      if (!id) return false;
      const want = parseTriadName(s);
      if (!want || !sameNote(want.root, id.root) || want.quality !== QUAL_OF[id.quality]) return false;
      return c.mode === 'name' ? want.inv === null && id.inversion === 0 : want.inv === id.inversion;
    }
    case 'identify-part': {
      const id = identifyChord(parseList(c.notes));
      if (!id) return false;
      if (c.field === 'root') return sameNote(parseNote(s), id.root);
      if (c.field === 'quality') return s === id.quality;
      return s === INV[id.inversion];
    }
    case 'bass': {
      const tones = chordTones(parseNote(c.root), c.quality);
      const m = parseNote(s);
      if (!m) return false;
      const rest = tones.filter((x) => !sameNote(x, m));
      if (rest.length !== 2) return false;
      const id = identifyChord([m, ...rest]);
      return !!id && id.inversion === c.inv && sameNote(id.root, parseNote(c.root)) && id.quality === c.quality;
    }
    case 'degree-quality': {
      const id = identifyChord(stackOn(keyScale('C'), c.deg));
      return !!id && s === id.quality;
    }
    case 'chord-on': {
      const id = identifyChord(stackOn(keyScale(c.tonic), c.deg));
      const want = parseTriadName(s);
      return !!id && !!want && want.inv === null && sameNote(want.root, id.root) && want.quality === id.quality;
    }
    case 'chord-notes':
      return listEq(parseList(s), stackOn(keyScale(c.tonic), c.deg));
    case 'numeral': {
      // Find the chord's root in the scale, then build the numeral from degree + quality.
      const want = parseTriadName(c.chord);
      const sc = keyScale(c.tonic);
      const deg = sc.findIndex((x) => sameNote(x, want.root)) + 1;
      if (!deg) return false;
      const id = identifyChord(stackOn(sc, deg));
      if (!id || id.quality !== want.quality) return false;
      const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'][deg - 1];
      const expect = id.quality === 'major' ? roman.toUpperCase() : id.quality === 'minor' ? roman : id.quality === 'diminished' ? `${roman}°` : null;
      return s === expect;
    }
    case 'sev-notes':
      return listEq(parseList(s), chordTones(parseNote(c.root), c.type));
    case 'sev-member':
      return sameNote(parseNote(s), chordTones(parseNote(c.root), c.type)[3]);
    case 'sev-name': {
      const id = identifyChord(parseList(c.notes));
      const want = parseSevName(s);
      return !!id && !!want && id.inversion === 0 && sameNote(want.root, id.root) && want.type === id.quality;
    }
    case 'v7': {
      const sc = keyScale(c.tonic);
      const id = identifyChord(parseList(s));
      return !!id && id.inversion === 0 && id.quality === 'dom7' && listEq(parseList(s), stackOn(sc, 5, 4));
    }
    case 'v7-member': {
      const chord = stackOn(keyScale(c.tonic), 5, 4);
      const id = identifyChord(chord);
      return !!id && id.quality === 'dom7' && sameNote(parseNote(s), chord[c.which]);
    }
    // ---- Expert kinds ----
    case 'triad-with': {
      const want = parseTriadName(s);
      return !!want && want.inv === null && want.quality === c.quality && sameNote(chordTones(want.root, c.quality)[c.which], parseNote(c.member));
    }
    case 'altered-note':
    case 'altered-name': {
      const tones = chordTones(parseNote(c.root), c.quality);
      if (!tones.every(Boolean)) return false;
      const t = tones[c.which];
      tones[c.which] = note(t.l, t.a + c.d);
      if (c.kind === 'altered-note') return sameNote(parseNote(s), tones[c.which]);
      const id = identifyChord(tones);
      const want = parseTriadName(s);
      return !!id && !!want && want.inv === null && sameNote(want.root, id.root) && want.quality === id.quality;
    }
    case 'sev-identify': {
      const m = /^(.+), (root position|1st inversion|2nd inversion|3rd inversion)$/.exec(s);
      const want = m && parseSevName(m[1]);
      const id = identifyChord(parseList(c.notes));
      return !!want && !!id && id.kind === 'seventh' && sameNote(want.root, id.root) && want.type === id.quality && INV.indexOf(m[2]) === id.inversion;
    }
    case 'bass-back': {
      const want = parseTriadName(s);
      return !!want && want.inv === null && want.quality === c.quality && sameNote(chordTones(want.root, c.quality)[c.inv], parseNote(c.bass));
    }
    case 'key-of-chord': {
      const m = /^(\S+) major$/.exec(s);
      if (!m || !parseNote(m[1])) return false;
      const sc = keyScale(m[1]);
      const id = identifyChord(stackOn(sc, c.deg));
      const want = parseTriadName(c.chord);
      return !!id && !!want && sameNote(id.root, want.root) && id.quality === want.quality;
    }
    case 'minor-chord':
    case 'minor-quality': {
      const id = identifyChord(stackOn(scaleByPattern(parseNote(c.tonic), 'harmonic'), c.deg));
      if (!id) return false;
      if (c.kind === 'minor-quality') return s === id.quality;
      const want = parseTriadName(s);
      return !!want && want.inv === null && sameNote(want.root, id.root) && want.quality === id.quality;
    }
    case 'numeral-notes': {
      const id = identifyChord(parseList(c.notes));
      if (!id) return false;
      const deg = keyScale(c.tonic).findIndex((x) => sameNote(x, id.root)) + 1;
      if (!deg) return false;
      const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'][deg - 1];
      const expect = id.quality === 'major' ? roman.toUpperCase() : id.quality === 'minor' ? roman : id.quality === 'diminished' ? `${roman}°` : null;
      return s === expect;
    }
    case 'diatonic7-notes':
      return listEq(parseList(s), stackOn(keyScale(c.tonic), c.deg, 4));
    case 'diatonic7-name': {
      const id = identifyChord(stackOn(keyScale(c.tonic), c.deg, 4));
      const want = parseSevName(s);
      return !!id && !!want && sameNote(want.root, id.root) && want.type === id.quality;
    }
    case 'seventh-of': {
      const want = parseSevName(s);
      return !!want && !!want.root && want.type === c.type && sameNote(chordTones(want.root, c.type)[c.which], parseNote(c.member));
    }
    case 'sev-back': {
      const want = parseSevName(s);
      if (!want || !want.root || want.type !== c.type) return false;
      const tones = chordTones(want.root, c.type);
      if (!tones.every(Boolean)) return false;
      const id = identifyChord([tones[c.inv], ...tones.filter((_, i) => i !== c.inv)]);
      return !!id && id.inversion === c.inv && sameNote(tones[c.inv], parseNote(c.bass));
    }
    case 'v7-key':
    case 'v7-lead': {
      // Brute force over every key: the one whose scale notes 5, 7, 2, 4 make this dominant 7th.
      const want = parseSevName(c.sym);
      const scaleOf = (t) => scaleByPattern(t, c.mode === 'minor' ? 'harmonic' : 'major');
      const keys = ALL_PLAIN.filter((t) => {
        const id = identifyChord(stackOn(scaleOf(t), 5, 4));
        return !!id && id.quality === 'dom7' && sameNote(id.root, want.root);
      });
      if (keys.length !== 1) return false;
      if (c.kind === 'v7-key') return s === `${fmt(keys[0])} ${c.mode}`;
      return sameNote(parseNote(s), scaleOf(keys[0])[6]);
    }
    default:
      return false;
  }
}

// Note blocks: distinct note tiles, the answer built from them (each used once, in order), and
// the notes re-derived by the CHECK side. Distractors are other spellings, so they never pass.
function checkTiles(c, q, value) {
  const vals = Array.isArray(q.tiles) ? q.tiles.map((t) => String(typeof t === 'string' ? t : t && t.value)) : [];
  if (vals.length < 2 || vals.length > 24 || new Set(vals).size !== vals.length || !vals.every((v) => parseNote(v))) return false;
  if (q.joiner !== ', ') return false;
  const used = String(value ?? '').split(', ');
  if (new Set(used).size !== used.length || !used.every((u) => vals.includes(u))) return false;
  return isRight(c, used.join(', '));
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
  if (question.answerType === 'tiles') return checkTiles(p.check, question, answer);
  return checkOne(p.check, question.answerType, answer, question.choices);
}
