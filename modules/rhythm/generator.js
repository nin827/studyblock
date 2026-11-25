// Rhythm generator. Uses only the seeded rng passed in by the engine.
//
// Note values are named in words (American names: whole, half, quarter, eighth, sixteenth;
// dotted = one and a half times as long). Unless a question says otherwise, a quarter note is
// one beat. Beat answers are typed as decimals (0.5, 1.5, 0.75).
//
// generate() works in beats (floating point, quarter = 1). verify() re-derives every answer in
// whole sixteenth-note "ticks" (integer arithmetic, quarter = 4 ticks), from a hand-written
// meter table, or by reversing the tempo formula, so the two never share a code path.

const DIFFS = ['easy', 'medium', 'hard'];

// ---- note values (generation side: beats) ----
const VALUES = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25,
  'dotted whole': 6, 'dotted half': 3, 'dotted quarter': 1.5, 'dotted eighth': 0.75,
};
const BASIC = ['whole', 'half', 'quarter', 'eighth'];
const DOTTED = ['dotted half', 'dotted quarter', 'dotted eighth'];
const plural = (name, n) => (n === 1 ? `${name} note` : `${name} notes`);
const aNote = (name) => `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name} note`;
const beatsWord = (b) => (b === 1 ? '1 beat' : `${num(b)} beats`);

function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const DP2 = ' Round to 2 decimal places.';
// True when x sits (almost) exactly halfway between two 2-decimal values (e.g. 0.625), where
// rounding is ambiguous; such questions are redrawn.
const tie = (x) => Math.abs(((x * 100) % 1) - 0.5) < 1e-6;
const DEC = ' Give your answer as a decimal if needed (for example 0.5).';

// 4 distinct options: answer + 3 usable candidates (seeded shuffle), shuffled. null if too few.
function fourChoices(rng, answer, candidates) {
  const out = [answer];
  for (const c of rng.shuffle(candidates)) {
    if (out.length >= 4) break;
    if (typeof c === 'string' && c && !out.includes(c)) out.push(c);
  }
  return out.length === 4 ? rng.shuffle(out) : null;
}

// "a dotted quarter, an eighth and a half note"
// Repeated values are grouped: ["quarter", "eighth", "quarter"] -> "2 quarter notes and an eighth note".
function listNotes(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  const parts = [...counts].map(([n, k]) => (k === 1 ? aNote(n) : `${k} ${plural(n, k)}`));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
const valueTable = 'whole = 4, half = 2, quarter = 1, eighth = ½, sixteenth = ¼ of a beat';
const dotRule = 'A dot adds half the note\'s value again, so a dotted note lasts one and a half times as long.';

// ---------------------------------------------------------------- Note values

function genValues(difficulty, rng) {
  const kind = rng.pick({ easy: ['beats', 'equal', 'which'], medium: ['beats', 'equal', 'which', 'sum'], hard: ['sum', 'equal', 'multi'] }[difficulty]);
  const pool = difficulty === 'easy' ? [...BASIC, 'sixteenth'] : difficulty === 'medium' ? [...BASIC, 'sixteenth', ...DOTTED] : [...BASIC, 'sixteenth', ...DOTTED, 'dotted whole'];

  if (kind === 'beats') {
    const name = rng.pick(difficulty === 'easy' ? BASIC : [...DOTTED, ...DOTTED, 'sixteenth']);
    const b = VALUES[name];
    const dotted = name.startsWith('dotted');
    const base = dotted ? name.replace('dotted ', '') : name;
    return {
      prompt: `In 4/4 time, with a quarter note as one beat, how many beats does ${aNote(name)} last?${b < 1 || dotted ? DEC : ''}`,
      answer: b, answerType: 'number', tolerance: 0,
      explanation: `Each note value is half the one before: ${valueTable}.${dotted ? `\n\n${dotRule} ${aNote(base)} lasts ${beatsWord(VALUES[base])}, so the dotted one lasts ${num(VALUES[base])} + ${num(VALUES[base] / 2)} = **${num(b)}** beats.` : `\n\nSo ${aNote(name)} lasts **${num(b)}** ${b === 1 ? 'beat' : 'beats'}.`}`,
      hints: dotted
        ? [`Start with the plain ${base} note: how many beats is it, if a quarter note is one beat?`, `${dotRule} Add half of the plain value.`]
        : ['A whole note fills a 4/4 bar: 4 beats. Each smaller value is half the one above it: whole, half, quarter, eighth, sixteenth.', `Halve your way down from the whole note to the ${name} note.`],
      params: { check: { kind: 'ticks-ratio', top: name, bottom: 'quarter' } },
    };
  }

  if (kind === 'equal') {
    // How many small notes last as long as one big note? (whole-number answers only)
    let big, small;
    do {
      big = rng.pick(pool);
      small = rng.pick(difficulty === 'easy' ? ['quarter', 'eighth', 'sixteenth', 'half'] : ['eighth', 'sixteenth', 'quarter', 'dotted eighth']);
    } while (VALUES[big] <= VALUES[small] || !Number.isInteger(VALUES[big] / VALUES[small]) || VALUES[big] / VALUES[small] > 24);
    const ans = VALUES[big] / VALUES[small];
    return {
      prompt: `How many ${plural(small, 2)} last as long as one ${big} note?`,
      answer: ans, answerType: 'number', tolerance: 0,
      explanation: `With a quarter note as one beat, ${aNote(big)} lasts ${beatsWord(VALUES[big])} and ${aNote(small)} lasts ${beatsWord(VALUES[small])}.\n\n${num(VALUES[big])} ÷ ${num(VALUES[small])} = **${ans}**.`,
      hints: [
        `Turn both into beats, with a quarter note as one beat. Each plain value is half the one above it: whole, half, quarter, eighth, sixteenth.${big.startsWith('dotted') || small.startsWith('dotted') ? ` ${dotRule}` : ''}`,
        `Then divide the ${big} note's beats by the ${small} note's beats.`,
      ],
      params: { check: { kind: 'ticks-ratio', top: big, bottom: small } },
    };
  }

  if (kind === 'which') {
    const name = rng.pick(difficulty === 'easy' ? BASIC : [...BASIC, ...DOTTED]);
    const b = VALUES[name];
    const others = Object.keys(VALUES).filter((n) => VALUES[n] !== b && (difficulty !== 'easy' || !n.startsWith('dotted')) && n !== 'dotted whole');
    // Plausible slips first: the dotted/undotted partner and the neighbours.
    const near = others.filter((n) => Math.abs(Math.log2(VALUES[n] / b)) <= 1.01);
    const choices = fourChoices(rng, `${name} note`, (near.length >= 3 ? near : others).map((n) => `${n} note`));
    if (!choices) return genValues(difficulty, rng);
    return {
      prompt: `With a quarter note as one beat, which note lasts ${b === 1 ? 'exactly 1 beat' : `${num(b)} beats`}?`,
      answer: `${name} note`, answerType: 'choice', choices,
      explanation: `${valueTable}.${name.startsWith('dotted') ? ` ${dotRule}` : ''}\n\nSo the note that lasts ${beatsWord(b)} is the **${name} note**.`,
      hints: [
        'Start from the longest plain value, which fills a 4/4 bar (4 beats); each smaller value is half the one above it.',
        name.startsWith('dotted') || b === 3 || b === 1.5 || b === 0.75 ? dotRule : 'Work out how many beats each option lasts and compare.',
      ],
      params: { check: { kind: 'which-note', beats: b } },
    };
  }

  // sum (and the hard multi version)
  const n = difficulty === 'medium' ? rng.int(2, 3) : rng.int(3, 4);
  const names = Array.from({ length: n }, () => rng.pick(pool));
  const total = names.reduce((s, x) => s + VALUES[x], 0);
  const lines = names.map((x) => `- ${x}: ${num(VALUES[x])}`).join('\n');
  if (kind === 'sum') {
    return {
      prompt: `In 4/4 time, with a quarter note as one beat, how many beats do ${listNotes(names)} last altogether?${DEC}`,
      answer: total, answerType: 'number', tolerance: 0,
      explanation: `Change each note into beats, then add:\n\n${lines}\n\nTotal: ${names.map((x) => num(VALUES[x])).join(' + ')} = **${num(total)}** ${total === 1 ? 'beat' : 'beats'}.`,
      hints: [
        `Change each note into beats: ${valueTable}.${names.some((x) => x.startsWith('dotted')) ? ` ${dotRule}` : ''}`,
        'Add the beats together.',
      ],
      params: { check: { kind: 'sum-beats', names } },
    };
  }
  const six = total * 4;
  return {
    prompt: `In 4/4 time, with a quarter note as one beat, a rhythm is ${listNotes(names)}.`,
    answerType: 'multi',
    parts: [
      { id: 'beats', label: 'Beats', ask: `How many beats does it last altogether?${DEC}`, answerType: 'number', answer: total, tolerance: 0,
        hint: `Change each note into beats (${valueTable}), then add them. ${dotRule}` },
      { id: 'sixteenths', label: 'Sixteenths', ask: 'How many sixteenth notes would last as long as the whole rhythm?', answerType: 'number', answer: six, tolerance: 0,
        hint: 'A sixteenth note is a quarter of a beat, so there are four sixteenths in every beat.' },
    ],
    explanation: `**Beats:**\n\n${lines}\n\nTotal: ${names.map((x) => num(VALUES[x])).join(' + ')} = **${num(total)}** ${total === 1 ? 'beat' : 'beats'}.\n\n**Sixteenths:** there are 4 sixteenths in a beat, so ${num(total)} × 4 = **${six}**.`,
    hints: ['Work out the total beats first; the second part follows from it.'],
    params: { multi: true, parts: { beats: { kind: 'sum-beats', names }, sixteenths: { kind: 'sum-ticks', names } } },
  };
}

// ---------------------------------------------------------------- Time signatures

const GROUP = { 2: 'duple', 3: 'triple', 4: 'quadruple' };
const CATS = ['simple duple', 'simple triple', 'simple quadruple', 'compound duple', 'compound triple', 'compound quadruple'];
// Generation rule: top 6, 9 or 12 is compound (beats = top / 3), anything else simple.
function meterInfo([top, bottom]) {
  const compound = top % 3 === 0 && top > 3;
  const beats = compound ? top / 3 : top;
  return { compound, beats, cat: `${compound ? 'compound' : 'simple'} ${GROUP[beats]}` };
}
const sig = ([t, b]) => `${t}/${b}`;
const UNIT = { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' };
const BAR_BEATS = ([t, b]) => (t * 4) / b; // length of a bar in quarter-note beats

function genMeters(difficulty, rng) {
  const SIMPLE = [[2, 4], [3, 4], [4, 4]];
  const MORE = [[2, 4], [3, 4], [4, 4], [2, 2], [3, 8], [3, 2], [6, 8], [9, 8], [12, 8]];
  const COMP = [[6, 8], [9, 8], [12, 8], [6, 4]];
  const kind = rng.pick({ easy: ['beats', 'fill', 'which'], medium: ['classify', 'fill', 'main-beats', 'beats'], hard: ['classify', 'complete', 'multi', 'fill'] }[difficulty]);

  if (kind === 'beats') {
    const m = rng.pick(difficulty === 'easy' ? SIMPLE.concat([[5, 4]]) : [[2, 2], [3, 2], [3, 8], [4, 8], [4, 2], [2, 8]]);
    const unit = UNIT[m[1]];
    return {
      prompt: `How many ${unit}-note beats are in one bar of ${sig(m)}?`,
      answer: m[0], answerType: 'number', tolerance: 0,
      explanation: `In a simple time signature the bottom number names the beat (${m[1]} = ${unit} note) and the top number says how many there are in a bar.\n\nSo ${sig(m)} has **${m[0]}** ${unit}-note beats.`,
      hints: ['In simple time, the bottom number says which note gets the beat (4 = quarter, 2 = half, 8 = eighth).', 'The top number then says how many of those beats are in each bar.'],
      params: { check: { kind: 'count-in-bar', sig: sig(m), unit } },
    };
  }

  if (kind === 'which') {
    const m = rng.pick(SIMPLE);
    const ans = sig(m);
    const cands = ['2/4', '3/4', '4/4', '5/4', '3/8', '2/2', '3/2'].filter((x) => x !== ans && !(x.split('/')[0] === String(m[0]) && x.endsWith('/4')));
    const choices = fourChoices(rng, ans, cands);
    return {
      prompt: `Which time signature has ${m[0]} quarter-note beats in every bar?`,
      answer: ans, answerType: 'choice', choices,
      explanation: `The bottom number 4 means the beat is a quarter note; the top number counts the beats.\n\nSo ${m[0]} quarter-note beats is **${ans}**.`,
      hints: ['The bottom number names the beat: 4 means a quarter note, 8 an eighth note, 2 a half note.', 'The top number is how many of those beats fit in each bar.'],
      params: { check: { kind: 'which-sig', beats: m[0], unit: 4 } },
    };
  }

  if (kind === 'fill') {
    const m = rng.pick(difficulty === 'easy' ? SIMPLE : difficulty === 'medium' ? MORE : [...COMP, [3, 2], [2, 2], [12, 8]]);
    const units = difficulty === 'easy' ? ['eighth', 'quarter', 'sixteenth'] : difficulty === 'medium' ? ['eighth', 'sixteenth', 'quarter'] : ['dotted quarter', 'sixteenth', 'eighth', 'dotted half'];
    let unit, ans;
    for (let t = 0; t < 20; t++) {
      unit = rng.pick(units);
      ans = BAR_BEATS(m) / VALUES[unit];
      if (Number.isInteger(ans) && ans >= 2 && ans <= 48) break;
      ans = null;
    }
    if (!ans) return genMeters(difficulty, rng);
    return {
      prompt: `How many ${plural(unit, 2)} fill exactly one bar of ${sig(m)}?`,
      answer: ans, answerType: 'number', tolerance: 0,
      explanation: `A bar of ${sig(m)} holds ${m[0]} ${UNIT[m[1]]} notes, which is ${beatsWord(BAR_BEATS(m))} if a quarter note is one beat.\n\n${aNote(unit).replace(/^a/, 'A')} lasts ${beatsWord(VALUES[unit])}, so ${num(BAR_BEATS(m))} ÷ ${num(VALUES[unit])} = **${ans}**.`,
      hints: [
        `The time signature says each bar holds ${m[0]} ${plural(UNIT[m[1]], m[0])}. Turn that into quarter-note beats.`,
        `Then divide by the length of ${aNote(unit)} in quarter-note beats.${unit.startsWith('dotted') ? ` ${dotRule}` : ''}`,
      ],
      params: { check: { kind: 'fill', sig: sig(m), unit } },
    };
  }

  if (kind === 'main-beats') {
    const m = rng.pick(COMP);
    const info = meterInfo(m);
    return {
      prompt: `${sig(m)} is a compound time signature. How many main beats (felt pulses) are in each bar?`,
      answer: info.beats, answerType: 'number', tolerance: 0,
      explanation: `In compound time each main beat is a dotted note that splits into three. ${sig(m)} has ${m[0]} ${plural(UNIT[m[1]], m[0])} per bar, grouped in threes: ${m[0]} ÷ 3 = **${info.beats}** main beats (each a dotted ${UNIT[m[1] / 2]} note).`,
      hints: [`In compound time the ${UNIT[m[1]]} notes are grouped in threes, and each group is one main beat.`, `There are ${m[0]} ${UNIT[m[1]]} notes in a bar. How many groups of three is that?`],
      params: { check: { kind: 'main-beats', sig: sig(m) } },
    };
  }

  if (kind === 'classify' || kind === 'multi') {
    const m = rng.pick(difficulty === 'medium' ? MORE : [...MORE, [6, 4], [4, 2], [12, 16]]);
    const info = meterInfo(m);
    const same = CATS.filter((c) => c !== info.cat);
    const swap = `${info.compound ? 'simple' : 'compound'} ${info.compound ? GROUP[m[0]] || 'duple' : GROUP[m[0] / 3 | 0] || GROUP[m[0]] || 'duple'}`;
    const choices = fourChoices(rng, info.cat, [swap, ...same]);
    if (!choices) return genMeters(difficulty, rng);
    const why = info.compound
      ? `The top number ${m[0]} is 6, 9 or 12, so it is compound: the ${UNIT[m[1]]} notes are grouped in threes, giving ${m[0]} ÷ 3 = ${info.beats} main beats.`
      : `The top number ${m[0]} is not 6, 9 or 12, so it is simple: each beat splits into two, and there are ${m[0]} beats.`;
    const hint1 = 'If the top number is 6, 9 or 12, the time is compound (beats split into three); otherwise it is simple (beats split into two).';
    const hint2 = 'Duple means 2 main beats per bar, triple 3, quadruple 4. In compound time, divide the top number by 3 to get the main beats.';
    if (kind === 'classify') {
      return {
        prompt: `How would you describe the time signature ${sig(m)}?`,
        answer: info.cat, answerType: 'choice', choices,
        explanation: `${why}\n\n${info.beats} main beats is ${GROUP[info.beats]}, so ${sig(m)} is **${info.cat}**.`,
        hints: [hint1, hint2],
        params: { check: { kind: 'classify', sig: sig(m) } },
      };
    }
    const unit = UNIT[m[1]];
    return {
      prompt: `Look at the time signature ${sig(m)}.`,
      answerType: 'multi',
      parts: [
        { id: 'type', label: 'Type', ask: 'How would you describe it?', answerType: 'choice', answer: info.cat, choices, hint: `${hint1} ${hint2}` },
        { id: 'count', label: `${unit[0].toUpperCase()}${unit.slice(1)} notes`, ask: `How many ${plural(unit, 2)} fill one bar?`, answerType: 'number', answer: m[0], tolerance: 0,
          hint: `The bottom number ${m[1]} stands for ${aNote(unit)}. The top number counts them.` },
      ],
      explanation: `**Type:** ${why} So it is **${info.cat}**.\n\n**${unit[0].toUpperCase()}${unit.slice(1)} notes:** the bottom number ${m[1]} means ${aNote(unit)} and the top number counts them: **${m[0]}** per bar.`,
      hints: ['Read the two numbers separately: the bottom one names a note value, the top one counts them.'],
      params: { multi: true, parts: { type: { kind: 'classify', sig: sig(m) }, count: { kind: 'count-in-bar', sig: sig(m), unit } } },
    };
  }

  // complete: which group of notes fills exactly one bar?
  const m = rng.pick([[3, 4], [4, 4], [6, 8], [2, 4], [9, 8], [12, 8]]);
  const target = BAR_BEATS(m);
  const opts = ['half', 'quarter', 'eighth', 'dotted half', 'dotted quarter', 'dotted eighth', 'sixteenth'];
  const groupOf = (want, tries) => {
    for (let t = 0; t < tries; t++) {
      const k = rng.int(2, 4);
      const g = Array.from({ length: k }, () => rng.pick(opts));
      const s = g.reduce((a, x) => a + VALUES[x], 0);
      if (want(s)) return g;
    }
    return null;
  };
  const right = groupOf((s) => Math.abs(s - target) < 1e-9, 200);
  const wrongs = [];
  for (let i = 0; i < 12 && wrongs.length < 6; i++) {
    const g = groupOf((s) => Math.abs(s - target) >= 0.25 && Math.abs(s - target) <= 1.5, 50);
    if (g) wrongs.push(g);
  }
  if (!right) return genMeters(difficulty, rng);
  const fmtG = (g) => g.map((x) => x).join(' + ');
  const choices = fourChoices(rng, fmtG(right), wrongs.map(fmtG));
  if (!choices) return genMeters(difficulty, rng);
  return {
    prompt: `Which of these fills exactly one bar of ${sig(m)}?`,
    answer: fmtG(right), answerType: 'choice', choices,
    explanation: `A bar of ${sig(m)} holds ${m[0]} ${plural(UNIT[m[1]], m[0])}, which is ${beatsWord(target)} in quarter-note beats.\n\n${right.map((x) => `${x} = ${num(VALUES[x])}`).join(', ')}: total ${num(target)}, so the answer is **${fmtG(right)}**.`,
    hints: [
      `First find the length of one bar of ${sig(m)} in quarter-note beats (an eighth note is half a beat).`,
      `Then add up each option: ${valueTable}. ${dotRule}`,
    ],
    params: { check: { kind: 'fills-bar', sig: sig(m) } },
  };
}

// ---------------------------------------------------------------- Counting bars

function genBars(difficulty, rng) {
  const kind = rng.pick({ easy: ['bars', 'left'], medium: ['bars', 'left', 'left'], hard: ['left', 'multi', 'bars'] }[difficulty]);
  const meters = { easy: [[4, 4], [3, 4], [2, 4]], medium: [[3, 4], [4, 4], [2, 4], [6, 8]], hard: [[6, 8], [9, 8], [3, 4], [5, 4], [12, 8]] }[difficulty];
  const m = rng.pick(meters);
  const bar = BAR_BEATS(m);
  const pool = { easy: ['half', 'quarter', 'whole'], medium: ['half', 'quarter', 'eighth', 'dotted half', 'dotted quarter'], hard: ['quarter', 'eighth', 'dotted quarter', 'dotted half', 'sixteenth', 'dotted eighth'] }[difficulty];
  const barHint = m[1] === 8
    ? `A bar of ${sig(m)} holds ${m[0]} eighth notes, which is ${num(bar)} quarter-note beats.`
    : `A bar of ${sig(m)} holds ${m[0]} quarter-note beats.`;

  if (kind === 'bars' || kind === 'multi') {
    // Two note values, counts chosen so the total is a whole number of bars (or bars + leftover for multi).
    for (let t = 0; t < 60; t++) {
      const [a, b] = rng.shuffle(pool.filter((x) => VALUES[x] <= bar)).slice(0, 2);
      if (!a || !b) break;
      const na = rng.int(2, 12), nb = rng.int(1, 12);
      const total = na * VALUES[a] + nb * VALUES[b];
      const bars = total / bar;
      if (kind === 'bars' && (!Number.isInteger(bars) || bars < 2 || bars > 16)) continue;
      const full = Math.floor(bars + 1e-9);
      const left = round2(total - full * bar);
      if (kind === 'multi' && (left <= 0 || full < 1)) continue;
      const given = [{ label: `_n_${a.replace(' ', '_')}`, value: na }, { label: `_n_${b.replace(' ', '_')}`, value: nb }];
      const [la, lb] = [given[0].label, given[1].label];
      const steps = `- \`_total = ${la} * ${num(VALUES[a])} + ${lb} * ${num(VALUES[b])}\` → ${num(total)} beats\n- \`_bar = ${num(bar)}\` (one bar of ${sig(m)}, in beats)`;
      const prompt = `A melody in ${sig(m)} uses ${na} ${plural(a, na)} and ${nb} ${plural(b, nb)}, with a quarter note as one beat.`;
      if (kind === 'bars') {
        return {
          prompt: `${prompt} How many bars does it fill exactly?`,
          answer: bars, answerType: 'number', tolerance: 0,
          explanation: `Find the total length, then divide by one bar.\n\n${steps}\n- \`_total / _bar\` → **${bars}** bars`,
          given,
          hints: [
            `Change each note into beats: ${valueTable}.${a.startsWith('dotted') || b.startsWith('dotted') ? ` ${dotRule}` : ''}`,
            `Total length = ${na} × (${a} beats) + ${nb} × (${b} beats).`,
            `${barHint} Divide the total by that.`,
          ],
          params: { check: { kind: 'bars', sig: sig(m), notes: [[a, na], [b, nb]] } },
        };
      }
      return {
        prompt,
        answerType: 'multi',
        parts: [
          { id: 'bars', label: 'Full bars', ask: 'How many complete bars does it fill?', answerType: 'number', answer: full, tolerance: 0,
            hint: `Add up the beats (${na} × ${a}, ${nb} × ${b}), then see how many whole bars of ${num(bar)} beats fit.` },
          { id: 'left', label: 'Beats left over', ask: `How many quarter-note beats are left over after those bars?${DEC}`, answerType: 'number', answer: left, tolerance: 0,
            hint: 'Take the beats used by the complete bars away from the total.' },
        ],
        explanation: `${steps}\n- \`_total / _bar\` → ${num(bars)}, so **${full}** complete bars\n- \`_total - ${full} * _bar\` → **${num(left)}** ${left === 1 ? 'beat' : 'beats'} left over`,
        given,
        hints: [barHint],
        params: { multi: true, parts: { bars: { kind: 'full-bars', sig: sig(m), notes: [[a, na], [b, nb]] }, left: { kind: 'leftover', sig: sig(m), notes: [[a, na], [b, nb]] } } },
      };
    }
    return genBars(difficulty, rng);
  }

  // left: notes already in one bar; how much is still missing?
  for (let t = 0; t < 60; t++) {
    const k = difficulty === 'easy' ? rng.int(1, 2) : rng.int(2, 3);
    const names = Array.from({ length: k }, () => rng.pick(pool));
    const used = names.reduce((s, x) => s + VALUES[x], 0);
    const left = bar - used;
    if (left <= 0 || (difficulty === 'easy' && !Number.isInteger(left))) continue;
    const inEighths = m[1] === 8;
    const ans = inEighths ? left * 2 : left;
    if (!Number.isInteger(ans * 4)) continue;
    if (inEighths && !Number.isInteger(ans)) continue;
    const unitWord = inEighths ? 'eighth notes' : 'quarter-note beats';
    return {
      prompt: `A bar of ${sig(m)} already has ${listNotes(names)}. How many ${unitWord} are still needed to complete the bar?${inEighths ? '' : DEC}`,
      answer: ans, answerType: 'number', tolerance: 0,
      explanation: `${barHint}\n\nUsed so far: ${names.map((x) => num(VALUES[x])).join(' + ')} = ${num(used)} ${used === 1 ? 'beat' : 'beats'}.\n\nLeft: ${num(bar)} − ${num(used)} = ${num(left)} ${left === 1 ? 'beat' : 'beats'}${inEighths ? `, which is ${num(left)} × 2 = **${num(ans)}** ${ans === 1 ? 'eighth note' : 'eighth notes'}` : `, so **${num(ans)}**`}.`,
      hints: [
        barHint,
        `Add up the notes already in the bar, in quarter-note beats.${names.some((x) => x.startsWith('dotted')) ? ` ${dotRule}` : ''}`,
        inEighths ? 'Subtract, then turn the gap into eighth notes (two per beat).' : 'Subtract what is used from the full bar.',
      ],
      params: { check: { kind: 'left', sig: sig(m), names, unit: inEighths ? 'eighth' : 'quarter' } },
    };
  }
  return genBars(difficulty, rng);
}

// ---------------------------------------------------------------- Tempo

const PIECES = ['A march', 'A waltz', 'A pop song', 'A ballad', 'A drum groove', 'A piano study', 'A folk dance', 'A film cue', 'A hymn', 'A jazz tune'];

function genTempo(difficulty, rng) {
  const kind = rng.pick({ easy: ['spb', 'dur-beats', 'beats-in'], medium: ['spb', 'dur-bars', 'beats-in'], hard: ['bpm', 'dur-bars', 'multi'] }[difficulty]);
  const piece = rng.pick(PIECES);

  if (kind === 'spb') {
    const bpm = difficulty === 'easy' ? rng.pick([30, 60, 120, 240, 40, 80, 100, 150, 75, 48]) : rng.int(50, 180);
    const exact = 60 / bpm;
    const rounded = !Number.isInteger(exact * 100);
    if (rounded && tie(exact)) return genTempo(difficulty, rng);
    const ans = rounded ? round2(exact) : exact;
    if (difficulty === 'easy' && rounded) return genTempo(difficulty, rng);
    return {
      prompt: `${piece} is played at ${bpm} BPM (beats per minute). How many seconds does each beat last?${rounded ? DP2 : DEC}`,
      answer: ans, answerType: 'number', tolerance: rounded ? 0.005 : 0,
      explanation: `A minute has 60 seconds, shared equally among ${bpm} beats.\n\n- \`_spb = 60 / _bpm\` → ${rounded ? `${exact.toFixed(4)}, which rounds to **${ans.toFixed(2)}**` : `**${num(ans)}**`} seconds per beat`,
      given: [{ label: '_bpm', value: bpm }],
      hints: [`BPM means beats per minute: ${bpm} beats every 60 seconds.`, 'Divide the 60 seconds by the number of beats.'],
      params: { check: { kind: 'spb', bpm, tol: rounded ? 0.005 : 0 } },
    };
  }

  if (kind === 'dur-beats') {
    const bpm = rng.pick([60, 120, 90, 80, 100, 150, 75]);
    const secs = rng.int(4, 40);
    const beats = (bpm * secs) / 60;
    if (!Number.isInteger(beats)) return genTempo(difficulty, rng);
    return {
      prompt: `${piece} is played at ${bpm} BPM. How many seconds do ${beats} beats last?`,
      answer: secs, answerType: 'number', tolerance: 0,
      explanation: `Each beat lasts 60 ÷ ${bpm} seconds.\n\n- \`_spb = 60 / _bpm\` → ${num(60 / bpm)} s\n- \`_beats * _spb\` → **${secs}** seconds`,
      given: [{ label: '_bpm', value: bpm }, { label: '_beats', value: beats }],
      hints: [`One beat lasts 60 ÷ ${bpm} seconds.`, `Multiply that by the ${beats} beats.`],
      params: { check: { kind: 'duration', bpm, beats, tol: 0 } },
    };
  }

  if (kind === 'beats-in') {
    const bpm = difficulty === 'easy' ? rng.pick([60, 120, 90, 80, 100]) : rng.int(56, 176);
    const secs = rng.int(5, 90);
    const beats = (bpm * secs) / 60;
    if (!Number.isInteger(beats)) return genTempo(difficulty, rng);
    return {
      prompt: `At ${bpm} BPM, how many beats are played in ${secs} seconds?`,
      answer: beats, answerType: 'number', tolerance: 0,
      explanation: `${bpm} beats per minute is ${num(bpm / 60)} ${bpm === 60 ? 'beat' : 'beats'} per second.\n\n- \`_bpm * _seconds / 60\` → **${beats}** beats`,
      given: [{ label: '_bpm', value: bpm }, { label: '_seconds', value: secs }],
      hints: [`${bpm} beats take 60 seconds. How many beats is that per second?`, `Multiply by the ${secs} seconds.`],
      params: { check: { kind: 'beats-in', bpm, secs } },
    };
  }

  const m = rng.pick([[4, 4], [3, 4], [2, 4], [6, 8]]);
  // In 6/8 the tempo counts dotted-quarter beats: 2 per bar.
  const beatsPerBar = m[1] === 8 ? m[0] / 3 : m[0];
  const beatNote = m[1] === 8 ? 'dotted-quarter' : 'quarter-note';
  const bars = rng.pick([8, 12, 16, 24, 32, 48, 64]);
  const totalBeats = bars * beatsPerBar;
  const meterNote = m[1] === 8 ? ` In ${sig(m)} the tempo counts ${beatsPerBar} dotted-quarter beats per bar.` : '';

  if (kind === 'dur-bars') {
    const bpm = rng.int(60, 160);
    const exact = (totalBeats * 60) / bpm;
    const rounded = difficulty === 'hard';
    if (!rounded && !Number.isInteger(exact)) return genTempo(difficulty, rng);
    if (rounded && (Number.isInteger(exact * 100) || tie(exact))) return genTempo(difficulty, rng);
    const ans = rounded ? round2(exact) : exact;
    return {
      prompt: `${piece} in ${sig(m)} is ${bars} bars long and played at ${bpm} BPM (${beatNote} beats).${meterNote} How many seconds does it last?${rounded ? DP2 : ''}`,
      answer: ans, answerType: 'number', tolerance: rounded ? 0.005 : 0,
      explanation: `Count the beats, then turn them into seconds.\n\n- \`_beats = _bars * _beats_per_bar\` → ${totalBeats}\n- \`_seconds = _beats * 60 / _bpm\` → ${rounded ? `${exact.toFixed(4)}, which rounds to **${ans.toFixed(2)}**` : `**${ans}**`} seconds`,
      given: [{ label: '_bars', value: bars }, { label: '_beats_per_bar', value: beatsPerBar }, { label: '_bpm', value: bpm }],
      hints: [
        `Total beats = bars × beats per bar (${beatsPerBar} in ${sig(m)}).`,
        `Each beat lasts 60 ÷ ${bpm} seconds. Multiply the total beats by that.${rounded ? ' Round only at the end.' : ''}`,
      ],
      params: { check: { kind: 'duration', bpm, beats: totalBeats, tol: rounded ? 0.005 : 0 } },
    };
  }

  if (kind === 'bpm') {
    for (let t = 0; t < 40; t++) {
      const bpm = rng.int(60, 160);
      const secs = (totalBeats * 60) / bpm;
      if (!Number.isInteger(secs)) continue;
      const mins = Math.floor(secs / 60), rest = secs % 60;
      const said = mins ? `${mins} minute${mins > 1 ? 's' : ''}${rest ? ` ${rest} seconds` : ''} (${secs} seconds)` : `${secs} seconds`;
      return {
        prompt: `${piece} in ${sig(m)} is ${bars} bars long and lasts exactly ${said}.${meterNote} What is its tempo in BPM (${beatNote} beats per minute)?`,
        answer: bpm, answerType: 'number', tolerance: 0,
        explanation: `- \`_beats = _bars * _beats_per_bar\` → ${totalBeats}\n- \`_bpm = _beats / _seconds * 60\` → **${bpm}** BPM`,
        given: [{ label: '_bars', value: bars }, { label: '_beats_per_bar', value: beatsPerBar }, { label: '_seconds', value: secs }],
        hints: [
          `Count the beats first: ${bars} bars × ${beatsPerBar} beats per bar.`,
          `That many beats take ${secs} seconds. Beats per minute = beats ÷ seconds × 60.`,
        ],
        params: { check: { kind: 'bpm', beats: totalBeats, secs } },
      };
    }
    return genTempo(difficulty, rng);
  }

  // hard multi: seconds per beat, then the whole piece.
  const bpm = rng.int(62, 158);
  if (Number.isInteger((60 / bpm) * 100) || tie(60 / bpm)) return genTempo(difficulty, rng);
  const spb = 60 / bpm;
  const total = totalBeats * spb;
  if (tie(total)) return genTempo(difficulty, rng);
  return {
    prompt: `${piece} in ${sig(m)} is ${bars} bars long and played at ${bpm} BPM (${beatNote} beats).${meterNote}`,
    answerType: 'multi',
    parts: [
      { id: 'spb', label: 'One beat', ask: `How many seconds does one beat last?${DP2}`, answerType: 'number', answer: round2(spb), tolerance: 0.005,
        hint: `BPM is beats per minute: divide the 60 seconds by ${bpm}.` },
      { id: 'total', label: 'Whole piece', ask: `How many seconds does the whole piece last? Use the unrounded beat length.${DP2}`, answerType: 'number', answer: round2(total), tolerance: 0.005,
        hint: `Total beats = ${bars} bars × ${beatsPerBar} beats. Multiply by the exact length of one beat (60 ÷ ${bpm}), and round only at the end.` },
    ],
    explanation: `- \`_spb = 60 / _bpm\` → ${spb.toFixed(4)}, which rounds to **${round2(spb).toFixed(2)}** seconds\n- \`_beats = _bars * _beats_per_bar\` → ${totalBeats}\n- \`_beats * _spb\` → ${total.toFixed(4)}, which rounds to **${round2(total).toFixed(2)}** seconds`,
    given: [{ label: '_bars', value: bars }, { label: '_beats_per_bar', value: beatsPerBar }, { label: '_bpm', value: bpm }],
    hints: ['Work out one beat first, then the number of beats in the piece.'],
    params: { multi: true, parts: { spb: { kind: 'spb', bpm, tol: 0.005 }, total: { kind: 'duration', bpm, beats: totalBeats, tol: 0.005 } } },
  };
}

// ---------------------------------------------------------------- generate / verify

export function generate({ subtopic, difficulty, rng }) {
  if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  switch (subtopic) {
    case 'note-values': return genValues(difficulty, rng);
    case 'time-signatures': return genMeters(difficulty, rng);
    case 'counting-bars': return genBars(difficulty, rng);
    case 'tempo': return genTempo(difficulty, rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---- CHECK side: integer sixteenth-note ticks (quarter note = 4 ticks) ----

const TICKS = { whole: 16, half: 8, quarter: 4, eighth: 2, sixteenth: 1 };
function ticksOf(name) {
  const dotted = name.startsWith('dotted ');
  const base = TICKS[dotted ? name.slice(7) : name];
  if (base === undefined) return NaN;
  return dotted ? base + base / 2 : base;
}
// Bar length in ticks: top × (ticks of the note the bottom number names).
const NOTE_OF_BOTTOM = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' };
function barTicks(sigStr) {
  const [t, b] = sigStr.split('/').map(Number);
  return t * ticksOf(NOTE_OF_BOTTOM[b]);
}
// Meter categories, written out by hand.
const METER_TABLE = {
  '2/4': 'simple duple', '2/2': 'simple duple', '3/4': 'simple triple', '3/8': 'simple triple', '3/2': 'simple triple',
  '4/4': 'simple quadruple', '4/2': 'simple quadruple', '5/4': null,
  '6/8': 'compound duple', '6/4': 'compound duple', '9/8': 'compound triple', '12/8': 'compound quadruple', '12/16': 'compound quadruple',
};
const MAIN_BEATS = { 'compound duple': 2, 'compound triple': 3, 'compound quadruple': 4 };
const isNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
const near = (v, x, tol) => isNum(v) && Math.abs(Number(v) - x) <= tol + 1e-9;

function isRight(c, v) {
  const s = String(v ?? '').trim();
  switch (c.kind) {
    case 'ticks-ratio': return near(v, ticksOf(c.top) / ticksOf(c.bottom), 0);
    case 'which-note': {
      const m = /^(.+) note$/.exec(s);
      return !!m && ticksOf(m[1]) === c.beats * 4;
    }
    case 'sum-beats': return near(v, c.names.reduce((a, x) => a + ticksOf(x), 0) / 4, 0);
    case 'sum-ticks': return near(v, c.names.reduce((a, x) => a + ticksOf(x), 0), 0);
    case 'count-in-bar': return near(v, barTicks(c.sig) / ticksOf(c.unit), 0);
    case 'which-sig': {
      const m = /^(\d+)\/(\d+)$/.exec(s);
      return !!m && Number(m[2]) === c.unit && Number(m[1]) === c.beats;
    }
    case 'fill': return near(v, barTicks(c.sig) / ticksOf(c.unit), 0);
    case 'main-beats': return near(v, MAIN_BEATS[METER_TABLE[c.sig]], 0);
    case 'classify': return METER_TABLE[c.sig] !== undefined && s === METER_TABLE[c.sig];
    case 'fills-bar': {
      const parts = s.split(' + ');
      const tot = parts.reduce((a, x) => a + ticksOf(x), 0);
      return parts.every((x) => Number.isFinite(ticksOf(x))) && tot === barTicks(c.sig);
    }
    case 'bars': {
      const tot = c.notes.reduce((a, [x, n]) => a + n * ticksOf(x), 0);
      // Reverse check: the answer's bars hold exactly the notes.
      return isNum(v) && Number.isInteger(Number(v)) && Number(v) * barTicks(c.sig) === tot;
    }
    case 'full-bars': {
      const tot = c.notes.reduce((a, [x, n]) => a + n * ticksOf(x), 0);
      const b = barTicks(c.sig);
      return isNum(v) && Number.isInteger(Number(v)) && Number(v) * b <= tot && (Number(v) + 1) * b > tot;
    }
    case 'leftover': {
      const tot = c.notes.reduce((a, [x, n]) => a + n * ticksOf(x), 0);
      return near(v, (tot % barTicks(c.sig)) / 4, 0);
    }
    case 'left': {
      const used = c.names.reduce((a, x) => a + ticksOf(x), 0);
      return near(v, (barTicks(c.sig) - used) / ticksOf(c.unit), 0);
    }
    // Tempo: reverse the formula from the answer.
    case 'spb': return isNum(v) && Math.abs(Number(v) * c.bpm - 60) <= c.tol * c.bpm + 1e-9;
    case 'duration': return isNum(v) && Math.abs((Number(v) * c.bpm) / 60 - c.beats) <= (c.tol * c.bpm) / 60 + 1e-9;
    case 'beats-in': return isNum(v) && Math.abs((Number(v) / c.bpm) * 60 - c.secs) <= 1e-9;
    case 'bpm': return isNum(v) && Number(v) > 0 && Math.abs((c.beats / Number(v)) * 60 - c.secs) <= 1e-9;
    default: return false;
  }
}

function checkOne(c, type, value, choices) {
  if (type === 'choice') {
    if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4) return false;
    if (!choices.includes(String(value))) return false;
    const right = choices.filter((x) => isRight(c, x));
    return right.length === 1 && right[0] === String(value);
  }
  if (!isNum(value)) return false;
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
