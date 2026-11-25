// Chords generator. Uses only the seeded rng passed in by the engine.
//
// Chords are spelled from letter names (stacked thirds), so the D major triad is D, F♯, A and
// never D, G♭, A. Spelled notes are always multiple choice (the app's text check can't tell
// "F#" from "F♯"). No double sharps or flats appear anywhere.
//
// generate() builds chords with pitch-class arithmetic and key-signature tables (BUILD side of
// js/lib/music.js). verify() re-derives every answer from params.check with the CHECK side:
// brute-force search for chord tones by interval classification, step-pattern scales and
// identifyChord (which finds the root by letter distances).

import {
  LETTERS, note, fmt, fmtList, parseNote, parseList, plain, sameNote, pc,
  TRIAD, SEVENTH, buildChord, noteAbove, majorTonic, scaleFromSignature,
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
      prompt: `Which notes make the ${name} triad?`,
      answer: fmtList(chord), answerType: 'choice', choices,
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
      prompt: `Which notes make chord ${numeral} in ${kname}?`,
      answer: fmtList(chord), answerType: 'choice', choices: notesC,
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
    const listC = fourChoices(rng, fmtList(chord), [
      buildChord(root, SEVENTH.maj7), buildChord(root, SEVENTH.min7), buildChord(tonic, SEVENTH.dom7), buildChord(scale[3], SEVENTH.dom7), ...spellingDistractors(chord),
    ].filter((c) => c.every(plain)).map(fmtList));
    if (!listC) return genSevenths(difficulty, rng);
    if (kind === 'v7') {
      return {
        prompt: `Which notes make the V7 chord in ${kname}?`,
        answer: fmtList(chord), answerType: 'choice', choices: listC,
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
      prompt: `Which notes make ${sym} (${fmt(root)} ${SEV_WORDS[t]})?`,
      answer: fmtList(chord), answerType: 'choice', choices,
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

// ---------------------------------------------------------------- generate / verify

export function generate({ subtopic, difficulty, rng }) {
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
