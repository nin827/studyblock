// Fractions generator. Uses only the seeded rng passed in by the engine.
// Fraction answers are text in simplest form: "3/4", "7/4", "-7/4", or a mixed number "2 1/3"
// (hard only, and the prompt says so). The engine compares text literally (trimmed, case-insensitive,
// whitespace collapsed), so every prompt spells out the exact format to type.
// Decimal and percent answers are numbers; rounded ones use 2 decimals (tolerance 0.005).

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Number answer/choice formatter: exact values in shortest form, rounded ones with 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const lcm = (a, b) => (a / gcd(a, b)) * b;

// Lowest terms with a positive denominator.
function reduce(n, d) {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  const rn = n / g;
  return [Object.is(rn, -0) ? 0 : rn, d / g];
}

// Canonical answer text. format: "fraction" (proper or improper, "-a/b" if negative) or "mixed" ("2 1/3").
function fmtFrac(n, d, format) {
  [n, d] = reduce(n, d);
  if (d === 1) return String(n);
  if (format === "mixed" && Math.abs(n) > d) {
    const w = Math.floor(Math.abs(n) / d);
    const r = Math.abs(n) - w * d;
    return `${n < 0 ? "-" : ""}${w} ${r}/${d}`;
  }
  return `${n}/${d}`;
}

// How an operand is shown in a prompt: "3/4", "(-3/4)", or a mixed number "2 1/3".
function showOp(n, d, asMixed) {
  if (asMixed && n > d && n % d !== 0) return fmtFrac(n, d, "mixed");
  return n < 0 ? `(${n}/${d})` : `${n}/${d}`;
}

const NOTE = {
  proper: " Give your answer as a fraction in simplest form, like 3/4 (no spaces around the slash).",
  improper:
    " Give your answer as a fraction in simplest form, like 3/4 or 7/4 (use an improper fraction, not a mixed number, if it is bigger than 1; no spaces around the slash).",
  signed:
    " Give your answer as a fraction in simplest form, like 7/4 or -7/4 (an improper fraction, not a mixed number, with a minus sign in front if it is negative; no spaces around the slash).",
  mixed: " Give your answer as a mixed number in simplest form, like 2 1/3 (the whole number, a space, then the fraction).",
  choice: " Choose the answer in simplest form.",
};

// "The greatest common factor of 12 and 16 is 4, so 12/16 = 3/4." or "already in simplest form".
function simplifyStep(n, d) {
  const g = gcd(n, d);
  const [rn, rd] = reduce(n, d);
  if (g <= 1 && d > 0) return `\`${n}/${d}\` is already in simplest form.`;
  if (rd === 1) return `\`${n}/${d} = ${rn}\`.`;
  return `The greatest common factor of ${Math.abs(n)} and ${Math.abs(d)} is ${g}, so \`${n}/${d} = ${rn}/${rd}\`.`;
}

// Extra line turning an improper fraction into a mixed number.
function mixedStep(n, d) {
  const [rn, rd] = reduce(n, d);
  const w = Math.floor(rn / rd);
  const r = rn - w * rd;
  return `As a mixed number: ${rn} ÷ ${rd} = ${w} remainder ${r}, so \`${rn}/${rd} = ${w} ${r}/${rd}\`.`;
}

// 4 unique fraction choices: the answer plus 3 distractors from common mistakes, deduped by value
// (an equivalent fraction never appears as a "wrong" option). Topped up with nearby fractions.
function fracChoices(N, D, format, candidates, rng) {
  const [an, ad] = reduce(N, D);
  const answer = fmtFrac(an, ad, format);
  const seenVals = [[an, ad]];
  const out = [];
  const tryAdd = ([n, d]) => {
    if (out.length >= 3 || !Number.isInteger(n) || !Number.isInteger(d) || d === 0) return;
    const [rn, rd] = reduce(n, d);
    if (rd === 1 || rn === 0) return; // whole numbers don't fit the fraction format
    if (an > 0 && rn < 0) return; // no negative options for a positive answer
    if (format === "mixed" && rn <= rd) return; // a mixed-number question only gets mixed options
    if (seenVals.some(([sn, sd]) => sn * rd === rn * sd)) return;
    seenVals.push([rn, rd]);
    out.push(fmtFrac(rn, rd, format));
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 200; k++) {
    for (const m of [1, 2, 3]) {
      tryAdd([an * m + k, ad * m]);
      tryAdd([an * m - k, ad * m]);
    }
  }
  return { answer, choices: rng.shuffle([answer, ...out]) };
}

// Numeric choices (decimals/percents): answer + 3 distractors, topped up with nearby values.
function numChoices(correct, candidates, rounded, step, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v <= 0) return;
    const s = fmtAns(v, rounded);
    if (Math.abs(Number(s) - correct) <= 0.005 + 1e-9) return; // would also count as correct (e.g. 0.87 when the exact value is 0.875)
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k * step);
    tryAdd(correct - k * step);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Finish a fraction-answer question: ~35% multiple choice, otherwise typed text.
function finishFrac(base, N, D, format, note, candidates, rng) {
  if (rng.next() < 0.35) {
    const { answer, choices } = fracChoices(N, D, format, candidates, rng);
    return { ...base, prompt: base.prompt + NOTE.choice, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: base.prompt + note, answer: fmtFrac(N, D, format), answerType: "text", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// A reduced fraction a/b with b in [bLo, bHi] and 0 < a < b.
function properFrac(rng, bLo, bHi) {
  const b = rng.int(bLo, bHi);
  let a;
  do {
    a = rng.int(1, b - 1);
  } while (gcd(a, b) !== 1);
  return [a, b];
}

function genSimplify(difficulty, rng) {
  checkDifficulty(difficulty);
  let a, b, k;
  if (difficulty === "easy") {
    [a, b] = properFrac(rng, 2, 10);
    k = rng.int(2, 6);
  } else if (difficulty === "medium") {
    [a, b] = properFrac(rng, 3, 15);
    k = rng.int(3, 12);
  } else {
    // Improper, shown as a mixed number in the answer.
    b = rng.int(2, 12);
    do {
      a = rng.int(b + 1, 5 * b);
    } while (gcd(a, b) !== 1);
    k = rng.int(2, 12);
  }
  const n = a * k;
  const d = b * k;
  const format = difficulty === "hard" ? "mixed" : "fraction";
  const prompt =
    difficulty === "hard" ? `Write \`${n}/${d}\` as a mixed number in simplest form.` : `Simplify \`${n}/${d}\`.`;
  const steps = [simplifyStep(n, d)];
  if (format === "mixed") steps.push(mixedStep(a, b));
  const base = { prompt, tolerance: 0, explanation: steps.join("\n\n"), params: { kind: "simplify", values: { n, d }, format } };
  const candidates = [
    [n / k, d], // divided only the top
    [b, a], // flipped it
    [a + 1, b], // slip by one
    [a, b + 1],
    [n - k, d - k], // subtracted instead of dividing
    format === "mixed" ? [a + b, b] : [a, b * 2],
  ];
  return finishFrac(base, a, b, format, format === "mixed" ? NOTE.mixed : NOTE.proper, candidates, rng);
}

function genAddSub(difficulty, rng) {
  checkDifficulty(difficulty);
  let a, b, c, d, op, note;
  for (;;) {
    op = rng.pick(["+", "-"]);
    if (difficulty === "easy") {
      b = rng.int(3, 12);
      d = b;
      a = rng.int(1, b - 1);
      c = rng.int(1, b - 1);
      if (op === "+" && a + c >= b) continue;
      if (op === "-" && a <= c) continue;
      note = NOTE.proper;
    } else if (difficulty === "medium") {
      [a, b] = properFrac(rng, 2, 10);
      [c, d] = properFrac(rng, 2, 10);
      if (b === d) continue;
      if (op === "-" && a * d < c * b) [a, b, c, d] = [c, d, a, b];
      note = NOTE.improper;
    } else {
      b = rng.int(2, 12);
      d = rng.int(2, 12);
      a = rng.int(-3 * b, 3 * b);
      c = rng.int(1, 3 * d);
      if (a === 0 || a % b === 0 || c % d === 0 || gcd(a, b) !== 1 || gcd(c, d) !== 1 || b === d) continue;
      note = NOTE.signed;
    }
    const s = op === "+" ? 1 : -1;
    const [rn, rd] = reduce(a * d + s * c * b, b * d);
    if (rn !== 0 && rd !== 1) break;
  }
  const s = op === "+" ? 1 : -1;
  const N = a * d + s * c * b;
  const D = b * d;
  const L = lcm(b, d);
  const top = (a * L) / b + (s * c * L) / d;

  const expr = `${showOp(a, b, false)} ${op} ${showOp(c, d, false)}`;
  const steps = [];
  if (b === d) {
    steps.push(`The denominators match, so ${op === "+" ? "add" : "subtract"} the numerators: \`${a} ${op} ${c} = ${top}\`, giving \`${top}/${L}\`.`);
  } else {
    steps.push(
      `The lowest common denominator of ${b} and ${d} is ${L}. Rewrite: \`${a}/${b} = ${(a * L) / b}/${L}\` and \`${c}/${d} = ${(c * L) / d}/${L}\`.`
    );
    steps.push(`${op === "+" ? "Add" : "Subtract"} the numerators: \`${(a * L) / b} ${op} ${(c * L) / d} = ${top}\`, giving \`${top}/${L}\`.`);
  }
  steps.push(simplifyStep(top, L) + ` The answer is **${fmtFrac(N, D, "fraction")}**.`);

  const base = {
    prompt: `Work out \`${expr}\`.`,
    tolerance: 0,
    explanation: steps.join("\n\n"),
    params: { kind: op === "+" ? "add" : "sub", values: { a, b, c, d }, format: "fraction" },
  };
  const candidates = [
    [a + s * c, b + d], // added tops and bottoms
    [a + s * c, b * d], // combined tops without rescaling
    [a * d - s * c * b, D], // wrong operation
    [-N, D], // sign slip
    [top + 1, L],
  ];
  return finishFrac(base, N, D, "fraction", note, candidates, rng);
}

function genMulDiv(difficulty, rng) {
  checkDifficulty(difficulty);
  let a, b, c, d, op, mixedOps;
  for (;;) {
    mixedOps = false;
    if (difficulty === "easy") {
      op = "×";
      [a, b] = properFrac(rng, 2, 9);
      [c, d] = properFrac(rng, 2, 9);
    } else if (difficulty === "medium") {
      op = rng.pick(["×", "÷"]);
      [a, b] = properFrac(rng, 2, 10);
      [c, d] = properFrac(rng, 2, 10);
    } else {
      op = rng.pick(["×", "÷"]);
      mixedOps = true;
      // First operand a mixed number; second a mixed number or a proper fraction.
      const [p, q] = properFrac(rng, 2, 9);
      b = q;
      a = rng.int(1, 4) * q + p;
      const [r, t] = properFrac(rng, 2, 9);
      d = t;
      c = rng.next() < 0.6 ? rng.int(1, 3) * t + r : r;
    }
    const [N0, D0] = op === "×" ? [a * c, b * d] : [a * d, b * c];
    const [rn, rd] = reduce(N0, D0);
    if (rd !== 1) break;
  }
  const [N, D] = op === "×" ? [a * c, b * d] : [a * d, b * c];
  const [rn, rd] = reduce(N, D);
  let format = "fraction";
  let note = difficulty === "easy" ? NOTE.proper : NOTE.improper;
  if (difficulty === "hard") {
    format = rn > rd ? "mixed" : "fraction";
    note = format === "mixed" ? NOTE.mixed : NOTE.proper;
  }

  const expr = `${showOp(a, b, mixedOps)} ${op} ${showOp(c, d, mixedOps)}`;
  const steps = [];
  if (mixedOps) {
    const parts = [];
    if (a > b) parts.push(`\`${showOp(a, b, true)} = ${a}/${b}\``);
    if (c > d) parts.push(`\`${showOp(c, d, true)} = ${c}/${d}\``);
    steps.push(`Write mixed numbers as improper fractions: ${parts.join(" and ")}.`);
  }
  if (op === "÷") {
    steps.push(`Dividing by \`${c}/${d}\` is the same as multiplying by its reciprocal \`${d}/${c}\`.`);
    steps.push(`Multiply tops and bottoms: \`${a}/${b} × ${d}/${c} = ${a * d}/${b * c}\`.`);
  } else {
    steps.push(`Multiply tops and bottoms: \`${a}/${b} × ${c}/${d} = ${a * c}/${b * d}\`.`);
  }
  steps.push(simplifyStep(N, D));
  if (format === "mixed") steps.push(mixedStep(N, D));
  steps.push(`The answer is **${fmtFrac(N, D, format)}**.`);

  const base = {
    prompt: `Work out \`${expr}\`.`,
    tolerance: 0,
    explanation: steps.join("\n\n"),
    params: { kind: op === "×" ? "mul" : "div", values: { a, b, c, d }, format },
  };
  const candidates =
    op === "×"
      ? [
          [a * d, b * c], // divided instead
          [a + c, b + d], // added tops and bottoms
          [a * c, b + d],
          [N + D, D], // one too many wholes
        ]
      : [
          [a * c, b * d], // forgot to flip
          [b * c, a * d], // flipped the wrong fraction
          [a * c, b * d * 2],
          [N + D, D],
        ];
  return finishFrac(base, N, D, format, note, candidates, rng);
}

// Exact decimal text for n/d when d divides a power of 10 (up to 4 places).
function exactDecimal(n, d) {
  for (let p = 0; p <= 4; p++) {
    const scale = 10 ** p;
    if ((n * scale) % d === 0) {
      const k = (n * scale) / d;
      return { k, places: p, text: (k / scale).toFixed(p) };
    }
  }
  return null;
}

function genCompare(difficulty, rng) {
  checkDifficulty(difficulty);
  // "order" is always multiple choice, so it is drawn less often to keep choices near a third overall.
  const kind = rng.pick(["to-decimal", "to-percent", "to-fraction", "order", "to-decimal", "to-percent", "to-fraction"]);

  if (kind === "order") {
    const want = difficulty === "easy" ? "largest" : rng.pick(["largest", "smallest"]);
    const [bLo, bHi] = difficulty === "easy" ? [2, 10] : difficulty === "medium" ? [3, 12] : [5, 20];
    const fracs = [];
    while (fracs.length < 4) {
      let n, d;
      if (difficulty === "hard") {
        d = rng.int(bLo, bHi);
        n = rng.int(1, 2 * d);
        if (gcd(n, d) !== 1 || n % d === 0) continue;
      } else {
        [n, d] = properFrac(rng, bLo, bHi);
      }
      if (fracs.some(([fn, fd]) => fn * d === n * fd)) continue;
      // Medium/hard: keep the four values close together (within 0.4 of the first).
      if (difficulty !== "easy" && fracs.length && Math.abs(n / d - fracs[0][0] / fracs[0][1]) > 0.4) continue;
      fracs.push([n, d]);
    }
    let best = 0;
    for (let i = 1; i < 4; i++) {
      const [bn, bd] = fracs[best];
      const [n, d] = fracs[i];
      if (want === "largest" ? n * bd > bn * d : n * bd < bn * d) best = i;
    }
    const strs = fracs.map(([n, d]) => `${n}/${d}`);
    const L = fracs.reduce((acc, [, d]) => lcm(acc, d), 1);
    const answer = strs[best];
    const explanation =
      L <= 120
        ? [
            `Put all four over the common denominator ${L}: ${fracs.map(([n, d]) => `\`${n}/${d} = ${(n * L) / d}/${L}\``).join(", ")}.`,
            `The ${want} numerator is ${(fracs[best][0] * L) / fracs[best][1]}, so the ${want} fraction is **${answer}**.`,
          ].join("\n\n")
        : [
            `Turn each fraction into a decimal: ${fracs.map(([n, d]) => `\`${n}/${d} ≈ ${(n / d).toFixed(4)}\``).join(", ")}.`,
            `The ${want} is **${answer}**.`,
          ].join("\n\n");
    return {
      prompt: `Which of these fractions is the ${want}?`,
      answer,
      answerType: "choice",
      choices: rng.shuffle(strs),
      tolerance: 0,
      explanation,
      params: { kind: "order", values: { fracs, want }, format: "fraction" },
    };
  }

  if (kind === "to-fraction") {
    // A decimal or percent to turn into a fraction in simplest form (always strictly between 0 and 1).
    let n, d, shown, given;
    if (difficulty === "easy") {
      d = rng.pick([2, 4, 5, 10, 20, 25]);
    } else if (difficulty === "medium") {
      d = rng.pick([4, 5, 8, 10, 20, 25, 40, 50]);
    } else {
      d = rng.pick([8, 16, 40, 80, 125, 200, 250]);
    }
    do {
      n = rng.int(1, d - 1);
    } while (gcd(n, d) !== 1);
    const asPercent = difficulty !== "easy" && rng.next() < 0.5;
    let scaleTop, scaleBottom, places;
    if (asPercent) {
      // percent p = 100·n/d, exact to at most 2 places for these denominators
      const ex = exactDecimal(100 * n, d);
      shown = `${ex.text}%`;
      given = { k: ex.k, scale: 100 * 10 ** ex.places };
      scaleTop = ex.text;
      scaleBottom = 100;
    } else {
      const ex = exactDecimal(n, d);
      shown = ex.text;
      given = { k: ex.k, scale: 10 ** ex.places };
      scaleTop = ex.k;
      scaleBottom = 10 ** ex.places;
      places = ex.places;
    }
    const steps = asPercent
      ? [
          `A percent is out of 100: \`${shown} = ${scaleTop}/100\`` +
            (given.scale !== 100 ? ` = \`${given.k}/${given.scale}\` (multiply top and bottom by ${given.scale / 100} to clear the decimal).` : "."),
          simplifyStep(given.k, given.scale),
        ]
      : [
          `${shown} has ${places} decimal place${places === 1 ? "" : "s"}, so \`${shown} = ${scaleTop}/${scaleBottom}\`.`,
          simplifyStep(given.k, given.scale),
        ];
    const base = {
      prompt: `Write ${shown} as a fraction.`,
      tolerance: 0,
      explanation: steps.join("\n\n"),
      params: { kind: "to-fraction", values: given, format: "fraction" },
    };
    const candidates = [
      [given.k, given.scale * 10], // one place too many
      [d, n + d],
      [n + 1, d],
      [n, d + 1],
    ];
    return finishFrac(base, n, d, "fraction", NOTE.proper, candidates, rng);
  }

  // to-decimal / to-percent: number answers.
  let n, d;
  if (difficulty === "easy") {
    d = rng.pick(kind === "to-percent" ? [2, 4, 5, 10, 20, 25, 50] : [2, 4, 5, 10, 20, 25]);
    do {
      n = rng.int(1, d - 1);
    } while (gcd(n, d) !== 1);
  } else if (difficulty === "medium") {
    [n, d] = properFrac(rng, 3, 12);
  } else {
    do {
      d = rng.int(3, 15);
      n = rng.int(1, 3 * d);
    } while (gcd(n, d) !== 1 || n % d === 0);
  }
  const rounded = difficulty !== "easy";
  const pct = kind === "to-percent";
  const exact = pct ? (100 * n) / d : n / d;
  const shownAns = fmtAns(exact, rounded);
  const isExact = Math.abs(exact - Number(shownAns)) < 1e-9;
  const tail = isExact ? `= **${shownAns}${pct ? "%" : ""}**` : `≈ ${exact.toFixed(4)}${pct ? "%" : ""}, which rounds to **${shownAns}${pct ? "%" : ""}**`;
  const explanation = pct
    ? `Multiply by 100 to get a percent: \`${n}/${d} × 100 = ${100 * n} ÷ ${d}\` ${tail}.`
    : `A fraction is a division: \`${n}/${d} = ${n} ÷ ${d}\` ${tail}.`;
  const round = rounded ? " Round to 2 decimal places." : " Give the exact value.";
  const prompt = pct
    ? `Write \`${n}/${d}\` as a percent. Answer as a number without the % sign, like 37.5.${round}`
    : `Write \`${n}/${d}\` as a decimal, like 0.75.${round}`;
  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { kind, values: { n, d }, rounded },
  };
  if (rng.next() < 0.35) {
    const candidates = pct
      ? [n / d, (100 * d) / n, (10 * n) / d, 100 - exact] // forgot ×100, flipped, ×10, complement
      : [d / n, Number(`${n}.${d}`), (10 * n) / d, n / (d + 1)]; // flipped, "3/4 = 3.4", ×10, off-by-one bottom
    const { answer, choices } = numChoices(exact, candidates, rounded, pct ? 5 : 0.05, rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "simplify") return genSimplify(difficulty, rng);
  if (subtopic === "add-subtract") return genAddSub(difficulty, rng);
  if (subtopic === "multiply-divide") return genMulDiv(difficulty, rng);
  if (subtopic === "compare-convert") return genCompare(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Parse "3/4", "-7/4", "2 1/3" or "5" into { form, n, d, w, r } (value n/d). null if unparseable.
function parseFrac(s) {
  const t = String(s ?? "").trim().replace(/\s+/g, " ").replace(/−/g, "-");
  let m = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(t);
  if (m) {
    const w = Number(m[2]);
    const r = Number(m[3]);
    const d = Number(m[4]);
    if (d === 0) return null;
    return { form: "mixed", n: (m[1] ? -1 : 1) * (w * d + r), d, w, r };
  }
  m = /^(-?\d+)\/(\d+)$/.exec(t);
  if (m) {
    const d = Number(m[2]);
    if (d === 0) return null;
    return { form: "fraction", n: Number(m[1]), d };
  }
  if (/^-?\d+$/.test(t)) return { form: "int", n: Number(t), d: 1 };
  return null;
}

// Is the parsed answer written in the required simplest form?
function inSimplestForm(f, format) {
  if (format === "mixed") return f.form === "mixed" && f.w >= 1 && f.r > 0 && f.r < f.d && gcd(f.r, f.d) === 1;
  return f.form === "fraction" && f.d > 1 && gcd(f.n, f.d) === 1;
}

// Independent check: rebuild the exact value from the original numbers by cross-multiplication
// (no shared reduce/lcm path), compare by cross-multiplying, and check the form.
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  if (answer === "" || answer === null || answer === undefined) return false;

  const k = p.values;
  if (p.kind === "to-decimal" || p.kind === "to-percent") {
    const x = Number(answer);
    if (!Number.isFinite(x) || !(k.d > 0)) return false;
    // x·d should equal n (or 100·n for a percent); a rounded x is off by at most 0.005·d.
    const residual = x * k.d - (p.kind === "to-percent" ? 100 * k.n : k.n);
    if (p.rounded) return Math.abs(residual) <= 0.005 * k.d + 1e-9;
    return Math.abs(residual) <= 1e-9;
  }

  let N, D;
  switch (p.kind) {
    case "simplify":
      [N, D] = [k.n, k.d];
      break;
    case "add":
      [N, D] = [k.a * k.d + k.c * k.b, k.b * k.d];
      break;
    case "sub":
      [N, D] = [k.a * k.d - k.c * k.b, k.b * k.d];
      break;
    case "mul":
      [N, D] = [k.a * k.c, k.b * k.d];
      break;
    case "div":
      [N, D] = [k.a * k.d, k.b * k.c];
      break;
    case "to-fraction":
      [N, D] = [k.k, k.scale];
      break;
    case "order": {
      if (!Array.isArray(k.fracs) || k.fracs.length !== 4) return false;
      // The answer must beat every other option strictly (no ties).
      const f = parseFrac(answer);
      if (!f || f.form !== "fraction") return false;
      const others = k.fracs.filter(([n, d]) => n * f.d !== f.n * d);
      if (others.length !== 3) return false;
      return others.every(([n, d]) => (k.want === "largest" ? f.n * d > n * f.d : f.n * d < n * f.d));
    }
    default:
      return false;
  }
  if (!Number.isInteger(N) || !Number.isInteger(D) || D === 0) return false;
  const f = parseFrac(answer);
  if (!f) return false;
  if (f.n * D !== N * f.d) return false;
  return inSimplestForm(f, p.format);
}
