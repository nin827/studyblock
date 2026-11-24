// Sequences and series generator. Uses only the seeded rng passed in by the engine.
// Arithmetic: u(n) = a + (n - 1)d. Geometric: u(n) = a·r^(n - 1).
// Each question's params.fmt says how the answer is given:
//   "whole"  a whole number (possibly negative), tolerance 0
//   "exact"  an exact decimal (at most 4 places), tolerance 0
//   "2dp"    rounded to 2 decimals, tolerance 0.005 (exact values sitting on a half are regenerated)
// Explanations list every step as a labelled calculator row, e.g. `_u20 = _a + (20 - 1) * _d` → 62.
// Infinite geometric sums appear only on hard.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Strip binary noise (0.1 * 3 = 0.30000000000000004) without changing a real value; never "-0".
function clean(n) {
  const r = Number(n.toFixed(6));
  return Object.is(r, -0) ? 0 : r;
}
const show = (n) => String(clean(n));

// True when the exact value sits (nearly) on a half at the 2nd decimal, e.g. 1.625.
const isTie = (x) => Math.abs(((Math.abs(x) * 100) % 1) - 0.5) < 1e-4;

function fmtAns(n, fmt) {
  if (fmt !== "2dp") return show(n);
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

const NOTE = {
  whole: " Give a whole number.",
  exact: " Give the exact answer as a whole number or decimal.",
  "2dp": " Round to 2 decimal places.",
};

// Prompt numbers collected while a question is built, offered to the calculator as `given` rows.
// `given()` rows are numbers stated in the prompt; `fact()` rows (derived values) are shown but not offered.
let GIVEN = null;
const given = (label, v) => {
  if (GIVEN) GIVEN.push({ label, value: clean(v) });
  return `- \`${label} = ${show(v)}\``;
};
const fact = (label, v) => `- \`${label} = ${show(v)}\``;

const GIVEN_LABEL = /^_[A-Za-z0-9_]{1,23}$/;
const BOILERPLATE = /Round to 2 decimal places\.?|like \d+(:\d+)+|like 1\.2|like 37\.5/g;

// Does the number appear in the prompt as written (not as part of a longer number)?
function inPrompt(prompt, v) {
  const s = show(v);
  const esc = s.split(".").join("[.]"); // show() gives only digits, "-" and "."
  const before = v < 0 ? "(^|[^0-9.])" : "(^|[^0-9.-])";
  return new RegExp(before + esc + "(?![0-9]|[.][0-9])").test(prompt.replace(BOILERPLATE, " "));
}

// Attach `given` (1–8 rows) when the prompt states two or more of the labelled numbers.
// Never includes a value equal to the answer.
function attachGiven(q) {
  const seen = new Set();
  const list = [];
  for (const g of GIVEN || []) {
    const key = g.label.toLowerCase();
    if (!GIVEN_LABEL.test(g.label) || seen.has(key) || !Number.isFinite(g.value)) continue;
    if (!inPrompt(q.prompt, g.value)) continue;
    seen.add(key);
    list.push(g);
  }
  if (list.length < 2) return q;
  const ans = Number(q.answer);
  const tol = Math.max(q.tolerance || 0, 1e-9);
  const keep = list.filter((g) => !(Number.isFinite(ans) && Math.abs(g.value - ans) <= tol)).slice(0, 8);
  return keep.length ? { ...q, given: keep } : q;
}
const row = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;
const par = (v) => (v < 0 ? `(${show(v)})` : show(v)); // a negative value inside an expression

// The value shown on the last row: "**62**" or "12.3456, which rounds to **12.35**".
function final(exact, fmt) {
  const shown = fmtAns(exact, fmt);
  if (fmt !== "2dp" || Math.abs(exact - Number(shown)) < 1e-9) return `**${shown}**`;
  return `${show(Math.round(exact * 10000) / 10000)}, which rounds to **${shown}**`;
}

function fitsFormat(exact, fmt) {
  if (!Number.isFinite(exact) || Math.abs(exact) > 1e7) return false;
  if (fmt === "whole") return Number.isInteger(clean(exact));
  if (fmt === "exact") return Math.abs(clean(exact) * 10000 - Math.round(clean(exact) * 10000)) < 1e-6;
  if (fmt === "2dp") return !isTie(exact);
  return true;
}

const TOL = (fmt) => (fmt === "2dp" ? 0.005 : 0);

// 4 unique numeric choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// No option other than the answer lies within the tolerance of the exact value.
function buildChoices(exact, candidates, fmt, rng, { positive = false, step } = {}) {
  const correctStr = fmtAns(exact, fmt);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || Math.abs(v) > 1e9) return;
    if (positive && v <= 0) return;
    if (fmt === "whole" && !Number.isInteger(clean(v))) return;
    if (fmt === "exact" && !fitsFormat(v, "exact")) return;
    const s = fmtAns(v, fmt);
    if (Math.abs(Number(s) - exact) <= TOL(fmt) + 1e-6) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  const st = step ?? (fmt === "whole" ? 1 : Math.abs(exact) >= 10 ? 1 : 0.1);
  for (let k = 1; out.length < 3 && k < 1000; k++) {
    tryAdd(exact + k * st);
    tryAdd(exact - k * st);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Typed number or (about 35%) multiple choice. Returns null when the value does not suit its format.
function finish(base, exact, fmt, candidates, rng, opts) {
  if (!fitsFormat(exact, fmt)) return null;
  const q = { ...base, prompt: base.prompt + NOTE[fmt], tolerance: TOL(fmt), params: { ...base.params, fmt } };
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, fmt, rng, opts);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: fmt === "2dp" ? round2(exact) : clean(exact), answerType: "number", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

const nonZero = (rng, lo, hi) => {
  let v;
  do {
    v = rng.int(lo, hi);
  } while (v === 0);
  return v;
};

const listTerms = (terms) => `${terms.map(show).join(", ")}, …`;
const arithTerm = (a, d, n) => a + (n - 1) * d;
const geoTerm = (a, r, n) => a * r ** (n - 1);
const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${s}`;
};

// ---------------------------------------------------------------------------------------------
// Arithmetic sequences

function genArithmetic(difficulty, rng) {
  const kinds = {
    easy: ["next", "nth", "formula-term"],
    medium: ["nth", "find-n", "formula-b", "nth-dec"],
    hard: ["two-terms", "first-over", "find-n", "two-terms-d"],
  }[difficulty];
  const kind = rng.pick(kinds);

  if (kind === "next") {
    const a = rng.int(-10, 30);
    const d = nonZero(rng, -9, 12);
    const k = rng.int(4, 5);
    const terms = Array.from({ length: k }, (_, i) => arithTerm(a, d, i + 1));
    const exact = arithTerm(a, d, k + 1);
    const base = {
      prompt: `What is the next term of the arithmetic sequence ${listTerms(terms)}?`,
      explanation: `The terms go up by the same amount each time.\n\n${[given("_u1", terms[0]), given("_u2", terms[1]), given("_last", terms[k - 1]), row("_d", "_u2 - _u1", d), row("_next", "_last + _d", final(exact, "whole"))].join("\n")}`,
      params: { kind: "term", a, d, n: k + 1 },
      hints: [
        `In an arithmetic sequence you add the same amount, the common difference d, every time.`,
        `d = ${par(terms[1])} - ${par(terms[0])} = ${d}. Check it works between the other terms too.`,
        `Add d to the last term shown: ${par(terms[k - 1])} + ${par(d)}.`,
      ],
    };
    return finish(base, exact, "whole", [terms[k - 1] - d, exact + d, terms[k - 1] + 2 * d, terms[k - 1] * 2 - terms[0]], rng);
  }

  if (kind === "nth" || kind === "nth-dec") {
    const dec = kind === "nth-dec";
    const a = dec ? rng.int(-40, 40) / 2 : rng.int(-20, 40);
    const d = dec ? nonZero(rng, -15, 15) / rng.pick([2, 4, 10]) : nonZero(rng, difficulty === "easy" ? 1 : -12, 12);
    const n = rng.int(difficulty === "easy" ? 8 : 15, difficulty === "easy" ? 30 : 120);
    const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
    const exact = arithTerm(a, d, n);
    const fmt = dec ? "exact" : "whole";
    const base = {
      prompt: `In the arithmetic sequence ${listTerms(terms)}, what is the ${ordinal(n)} term?`,
      explanation: `Use \`u(n) = a + (n - 1) × d\`.\n\n${[given("_a", a), given("_u2", terms[1]), given("_n", n), row("_d", "_u2 - _a", show(d)), row(`_u${n}`, "_a + (_n - 1) * _d", final(exact, fmt))].join("\n")}`,
      params: { kind: "term", a, d, n },
      hints: [
        `Use \`u(n) = a + (n - 1) × d\`: the first term a = ${show(a)}, and d is the common difference.`,
        `d = ${par(terms[1])} - ${par(terms[0])} = ${show(d)}.`,
        `For the ${ordinal(n)} term, add d ${n - 1} times (n - 1, not n): \`_a + (_n - 1) * _d\` = ${show(a)} + ${n - 1} × ${par(d)}.`,
      ],
    };
    return finish(base, exact, fmt, [a + n * d, n * d, a + (n - 2) * d, a * n + d], rng, { step: dec ? Math.abs(d) : 1 });
  }

  if (kind === "formula-term") {
    const p = nonZero(rng, -6, 9);
    const q = rng.int(-15, 15);
    const n = rng.int(5, 40);
    const exact = p * n + q;
    const formula = `${p === 1 ? "" : p === -1 ? "-" : p}n${q === 0 ? "" : q > 0 ? ` + ${q}` : ` - ${-q}`}`;
    const base = {
      prompt: `The nth term of a sequence is \`${formula}\`. What is the ${ordinal(n)} term?`,
      explanation: `Substitute n = ${n}.\n\n${row(`_u${n}`, `${p} * ${n} + ${par(q)}`, final(exact, "whole"))}`,
      params: { kind: "term", a: p + q, d: p, n },
      hints: [
        `The nth term formula gives any term directly: replace n with ${n}.`,
        `Work out ${p} × ${n} first (multiplication before addition), then ${q < 0 ? `subtract ${-q}` : q === 0 ? "there is nothing to add" : `add ${q}`}.`,
      ],
    };
    return finish(base, exact, "whole", [p * (n + q), p + n + q, p * n - q, p * (n - 1) + q], rng);
  }

  if (kind === "formula-b") {
    const a = rng.int(-20, 30);
    const d = nonZero(rng, -9, 12);
    const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
    const askD = rng.next() < 0.3;
    const exact = askD ? d : a - d;
    const base = {
      prompt: `The nth term of ${listTerms(terms)} can be written as \`pn + q\`. What is the value of ${askD ? "p" : "q"}?`,
      explanation: `p is the common difference; q is the "zeroth term", one difference before the first term.\n\n${[given("_a", a), given("_u2", terms[1]), row("_p", "_u2 - _a", d), row("_q", "_a - _p", a - d)].join("\n")}\n\nSo the nth term is \`${d}n ${a - d < 0 ? "-" : "+"} ${Math.abs(a - d)}\`; the answer is ${final(exact, "whole")}.`,
      params: { kind: askD ? "pn-p" : "pn-q", a, d },
      hints: askD
        ? [
            `In \`pn + q\`, p is the common difference: the amount added each time.`,
            `Subtract any term from the one after it, for example ${par(terms[1])} - ${par(terms[0])}.`,
          ]
        : [
            `In \`pn + q\`, p is the common difference and q is the "zeroth term": one step before the first term.`,
            `The common difference is ${par(terms[1])} - ${par(terms[0])} = ${d}.`,
            `Step back once from the first term: ${par(a)} - ${par(d)}.`,
          ],
    };
    return finish(base, exact, "whole", askD ? [-d, a, a - d, terms[1]] : [a, a + d, d - a, -(a - d)], rng);
  }

  if (kind === "find-n") {
    const a = rng.int(-30, 40);
    const d = nonZero(rng, difficulty === "hard" ? -15 : 2, 15);
    const n = rng.int(12, difficulty === "hard" ? 300 : 150);
    const target = arithTerm(a, d, n);
    const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
    const base = {
      prompt: `In the arithmetic sequence ${listTerms(terms)}, the nth term is ${target}. What is n?`,
      explanation: `Solve \`a + (n - 1) × d = ${target}\` for n.\n\n${[given("_a", a), given("_u2", terms[1]), given("_target", target), row("_d", "_u2 - _a", d), row("_n", "(_target - _a) / _d + 1", final(n, "whole"))].join("\n")}`,
      params: { kind: "find-n", a, d, target },
      hints: [
        `Set the nth term formula equal to ${target}: \`a + (n - 1) × d = ${target}\`, then solve for n.`,
        `Here a = ${a} and d = ${par(terms[1])} - ${par(a)} = ${d}.`,
        `n - 1 = (${target} - ${par(a)}) ÷ ${par(d)}. Remember to add 1 at the end.`,
      ],
    };
    return finish(base, n, "whole", [n - 1, n + 1, target / d, (target - a) / d + 2], rng, { positive: true });
  }

  if (kind === "two-terms" || kind === "two-terms-d") {
    const a = rng.int(-30, 40);
    const d = nonZero(rng, -12, 12) / rng.pick([1, 1, 2]);
    let p, q;
    do {
      p = rng.int(2, 15);
      q = rng.int(4, 25);
    } while (q <= p + 1);
    const up = arithTerm(a, d, p);
    const uq = arithTerm(a, d, q);
    const askD = kind === "two-terms-d";
    const r = rng.int(q + 2, 60);
    const exact = askD ? d : arithTerm(a, d, r);
    const lines = [given(`_u${p}`, up), given(`_u${q}`, uq), row("_d", `(_u${q} - _u${p}) / (${q} - ${p})`, show(d))];
    if (!askD) lines.push(row(`_u${r}`, `_u${q} + (${r} - ${q}) * _d`, final(exact, "exact")));
    const base = {
      prompt: askD
        ? `In an arithmetic sequence, the ${ordinal(p)} term is ${show(up)} and the ${ordinal(q)} term is ${show(uq)}. What is the common difference?`
        : `In an arithmetic sequence, the ${ordinal(p)} term is ${show(up)} and the ${ordinal(q)} term is ${show(uq)}. What is the ${ordinal(r)} term?`,
      explanation: `The gap from term ${p} to term ${q} is ${q - p} differences.\n\n${lines.join("\n")}${askD ? `\n\nThe common difference is ${final(exact, "exact")}.` : ""}`,
      params: askD ? { kind: "two-d", p, up, q, uq } : { kind: "two-term", p, up, q, uq, r },
      hints: askD
        ? [
            `From the ${ordinal(p)} term to the ${ordinal(q)} term you add d ${q - p} times (${q} - ${p}).`,
            `Divide the change in value by the number of steps: (${par(uq)} - ${par(up)}) ÷ ${q - p}.`,
          ]
        : [
            `From the ${ordinal(p)} term to the ${ordinal(q)} term you add d ${q - p} times, so find d first.`,
            `d = (${par(uq)} - ${par(up)}) ÷ ${q - p} = ${show(d)}.`,
            `From the ${ordinal(q)} term to the ${ordinal(r)} term is ${r - q} more steps: \`_u${q} + (${r} - ${q}) * _d\`.`,
          ],
    };
    const cands = askD ? [(uq - up) / (q - p + 1), uq - up, -d, (uq - up) / (q - p - 1)] : [uq + (r - q + 1) * d, uq + (r - q - 1) * d, up + (r - 1) * d, a + r * d];
    return finish(base, exact, "exact", cands, rng, { step: askD ? 0.5 : Math.abs(d) });
  }

  // first-over: the first term greater than a bound
  const a = rng.int(-20, 30);
  const d = rng.int(2, 13);
  const bound = rng.int(150, 2500);
  const exact = Math.floor((bound - a) / d) + 1 + 1; // first n with a + (n-1)d > bound
  const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
  if ((bound - a) % d === 0) return null; // avoid a term exactly on the bound
  const base = {
    prompt: `In the arithmetic sequence ${listTerms(terms)}, the nth term is the first one greater than ${bound}. What is n?`,
    explanation: [
      `Solve \`a + (n - 1) × d > ${bound}\`, then take the next whole number.`,
      [given("_a", a), given("_u2", terms[1]), given("_bound", bound), row("_d", "_u2 - _a", d), row("_n", "(_bound - _a) / _d + 1", show(Math.round(((bound - a) / d + 1) * 10000) / 10000))].join("\n"),
      `n must be a whole number above that, so n = ${final(exact, "whole")} (check: \`u(${exact}) = ${arithTerm(a, d, exact)}\`, \`u(${exact - 1}) = ${arithTerm(a, d, exact - 1)}\`).`,
    ].join("\n\n"),
    params: { kind: "first-over", a, d, bound },
    hints: [
      `Solve \`a + (n - 1) × d > ${bound}\` as if it were an equation, then round up to the next whole number.`,
      `Here a = ${a} and d = ${d}, so n - 1 > (${bound} - ${par(a)}) ÷ ${d}.`,
      `Work out \`(_bound - _a) / _d + 1\`; it won't be whole, so take the next whole number above it. Check that term really is above ${bound} and the one before isn't.`,
    ],
  };
  return finish(base, exact, "whole", [exact - 1, exact + 1, Math.round(bound / d), arithTerm(a, d, exact)], rng, { positive: true });
}

// ---------------------------------------------------------------------------------------------
// Geometric sequences

function genGeometric(difficulty, rng) {
  const kinds = {
    easy: ["next", "ratio", "nth"],
    medium: ["nth", "ratio-dec", "find-n", "next-neg"],
    hard: ["two-terms", "growth", "first-over", "two-terms-a"],
  }[difficulty];
  const kind = rng.pick(kinds);

  if (kind === "next" || kind === "next-neg") {
    let a, r;
    if (kind === "next") {
      r = rng.pick([2, 3, 4, 5, 10, 0.5]);
      a = r === 0.5 ? rng.int(1, 9) * 32 : rng.int(1, 12);
    } else {
      r = rng.pick([-2, -3, -0.5, 1.5, 0.2]);
      a = r === -0.5 ? nonZero(rng, -9, 9) * 16 : r === 1.5 ? rng.int(1, 9) * 16 : r === 0.2 ? rng.int(1, 9) * 625 : nonZero(rng, -9, 9);
    }
    const k = 4;
    const terms = [1, 2, 3, 4].map((i) => geoTerm(a, r, i));
    const exact = geoTerm(a, r, k + 1);
    const fmt = kind === "next" ? "whole" : "exact";
    const base = {
      prompt: `What is the next term of the geometric sequence ${listTerms(terms)}?`,
      explanation: `Each term is the previous one times the common ratio.\n\n${[given("_u1", terms[0]), given("_u2", terms[1]), given("_last", terms[3]), row("_r", "_u2 / _u1", show(r)), row("_next", "_last * _r", final(exact, fmt))].join("\n")}`,
      params: { kind: "term", a, r, n: k + 1 },
      hints: [
        `In a geometric sequence you multiply by the same number, the common ratio r, every time.`,
        `r = ${par(terms[1])} ÷ ${par(terms[0])} = ${show(r)}.${r < 0 ? " A negative ratio makes the signs alternate." : ""}`,
        `Multiply the last term shown by r: ${par(terms[3])} × ${par(r)}.`,
      ],
    };
    return finish(base, exact, fmt, [terms[3] + (terms[3] - terms[2]), terms[3] * r * r, -exact, terms[3] + r], rng);
  }

  if (kind === "ratio" || kind === "ratio-dec") {
    const r = kind === "ratio" ? rng.pick([2, 3, 4, 5, 6, 10]) : rng.pick([0.5, 1.5, 2.5, 0.25, 0.2, 1.2, -2, -3, -0.5, 0.75]);
    const a = kind === "ratio" ? rng.int(1, 15) : rng.int(1, 9) * 64;
    const terms = [1, 2, 3, 4].map((i) => geoTerm(a, r, i));
    if (terms.some((t) => !fitsFormat(t, "exact"))) return null;
    const fmt = kind === "ratio" ? "whole" : "exact";
    const base = {
      prompt: `What is the common ratio of the geometric sequence ${listTerms(terms)}?`,
      explanation: `Divide any term by the one before it.\n\n${[given("_u1", terms[0]), given("_u2", terms[1]), row("_r", "_u2 / _u1", final(r, fmt))].join("\n")}`,
      params: { kind: "ratio", terms },
      hints: [
        `The common ratio is what you multiply by each time, so divide, don't subtract.`,
        `Divide a term by the one before it, for example ${par(terms[1])} ÷ ${par(terms[0])}. Check it gives the same for the next pair.`,
      ],
    };
    return finish(base, r, fmt, [terms[1] - terms[0], 1 / r, -r, terms[0] / terms[2]], rng, { step: fmt === "whole" ? 1 : 0.5 });
  }

  if (kind === "nth") {
    const easy = difficulty === "easy";
    const r = easy ? rng.pick([2, 3, 10]) : rng.pick([2, 3, -2, 0.5, 1.5, 4]);
    const n = r === 10 ? rng.int(5, 7) : r === 2 || r === -2 ? rng.int(6, easy ? 10 : 14) : r === 0.5 ? rng.int(5, 9) : rng.int(5, 8);
    const a = r === 0.5 ? rng.int(1, 5) * 2 ** (n - 1) : r === 1.5 ? rng.int(1, 3) * 2 ** (n - 1) : nonZero(rng, easy ? 1 : -9, 9);
    const exact = geoTerm(a, r, n);
    const terms = [1, 2, 3].map((i) => geoTerm(a, r, i));
    const fmt = Number.isInteger(r) ? "whole" : "exact";
    if (Math.abs(exact) > 5e6) return null;
    const base = {
      prompt: `In the geometric sequence ${listTerms(terms)}, what is the ${ordinal(n)} term?`,
      explanation: `Use \`u(n) = a × r^(n - 1)\`.\n\n${[given("_a", a), given("_u2", terms[1]), given("_n", n), row("_r", "_u2 / _a", show(r)), row(`_u${n}`, "_a * _r^(_n - 1)", final(exact, fmt))].join("\n")}`,
      params: { kind: "term", a, r, n },
      hints: [
        `Use \`u(n) = a × r^(n - 1)\`: the first term a = ${a}, and r is the common ratio.`,
        `r = ${par(terms[1])} ÷ ${par(terms[0])} = ${show(r)}.`,
        `For the ${ordinal(n)} term the power is n - 1 = ${n - 1}: \`_a * _r^(_n - 1)\` = ${a} × ${par(r)}^${n - 1}.`,
      ],
    };
    return finish(base, exact, fmt, [a * r ** n, a * r ** (n - 2), a * r * (n - 1), a + (n - 1) * r], rng);
  }

  if (kind === "find-n") {
    const r = rng.pick([2, 3, 4, 5]);
    const a = rng.int(1, 9);
    const n = r === 2 ? rng.int(6, 16) : r === 3 ? rng.int(5, 10) : rng.int(4, 8);
    const target = geoTerm(a, r, n);
    const terms = [1, 2, 3].map((i) => geoTerm(a, r, i));
    const base = {
      prompt: `In the geometric sequence ${listTerms(terms)}, the nth term is ${target}. What is n?`,
      explanation: `Divide by the first term to see which power of the ratio you need.\n\n${[given("_a", a), given("_u2", terms[1]), given("_target", target), row("_r", "_u2 / _a", show(r)), row("_power", "_target / _a", `${target / a} = ${r}^${n - 1}`)].join("\n")}\n\nSo n - 1 = ${n - 1} and n = ${final(n, "whole")}.`,
      params: { kind: "geo-find-n", a, r, target },
      hints: [
        `Set \`a × r^(n - 1) = ${target}\` and find which power of r you need.`,
        `a = ${a} and r = ${terms[1]} ÷ ${a} = ${r}. Divide: ${target} ÷ ${a} = ${target / a}.`,
        `Write ${target / a} as a power of ${r} (keep multiplying by ${r} and count). That power is n - 1, so add 1.`,
      ],
    };
    return finish(base, n, "whole", [n - 1, n + 1, target / (a * r), Math.round(target / a / r)], rng, { positive: true });
  }

  if (kind === "two-terms" || kind === "two-terms-a") {
    // u(p) and u(q) with an odd gap (so the ratio's sign is determined), or r > 0 stated.
    const r = rng.pick([2, 3, -2, 0.5, 1.5, -3, 4]);
    let p, q;
    do {
      p = rng.int(1, 5);
      q = p + rng.pick([1, 2, 3]);
    } while (q > 7);
    const gap = q - p;
    let a = nonZero(rng, -9, 9);
    if (r === 0.5) a *= 64;
    if (r === 1.5) a *= 64;
    const up = geoTerm(a, r, p);
    const uq = geoTerm(a, r, q);
    if (!fitsFormat(up, "exact") || !fitsFormat(uq, "exact")) return null;
    const statePos = gap % 2 === 0;
    if (statePos && r < 0) return null; // the ratio's sign would be ambiguous
    const askA = kind === "two-terms-a";
    const exact = askA ? a : r;
    const pos = statePos ? " The common ratio is positive." : "";
    const lines = [given(`_u${p}`, up), given(`_u${q}`, uq), row("_r", gap === 1 ? `_u${q} / _u${p}` : `(_u${q} / _u${p})^(1 / ${gap})`, show(r))];
    if (gap > 1 && (uq / up) < 0) lines[2] = row("_r", `0 - abs(_u${q} / _u${p})^(1 / ${gap})`, show(r));
    if (askA) lines.push(row("_a", `_u${p} / _r^(${p} - 1)`, final(a, "exact")));
    const base = {
      prompt: askA
        ? `In a geometric sequence, the ${ordinal(p)} term is ${show(up)} and the ${ordinal(q)} term is ${show(uq)}.${pos} What is the first term?`
        : `In a geometric sequence, the ${ordinal(p)} term is ${show(up)} and the ${ordinal(q)} term is ${show(uq)}.${pos} What is the common ratio?`,
      explanation: `Going from term ${p} to term ${q} multiplies by the ratio ${gap} time${gap === 1 ? "" : "s"}, so \`r^${gap} = u${q} / u${p}\`.\n\n${lines.join("\n")}${askA ? "" : `\n\nThe common ratio is ${final(r, "exact")}.`}`,
      params: askA ? { kind: "geo-two-a", p, up, q, uq } : { kind: "geo-two-r", p, up, q, uq },
      hints: [
        `From the ${ordinal(p)} term to the ${ordinal(q)} term you multiply by r ${gap} time${gap === 1 ? "" : "s"}, so \`r^${gap} = u${q} / u${p}\`.`,
        gap === 1
          ? `Divide: ${par(uq)} ÷ ${par(up)}.${askA ? " That is r." : ""}`
          : `Work out ${par(uq)} ÷ ${par(up)}, then take the ${gap === 2 ? "square" : "cube"} root${statePos ? " (r is positive)" : " (a cube root keeps the sign)"}.`,
        ...(askA ? [`Step back from the ${ordinal(p)} term to the 1st: divide by r ${p - 1} time${p - 1 === 1 ? "" : "s"}, \`_u${p} / _r^(${p} - 1)\`.`] : []),
      ],
    };
    if (askA && p === 1) return null; // the first term would be given
    const cands = askA ? [up / r ** p, up * r, a * r, -a] : [uq / up, (uq - up) / gap, -r, 1 / r];
    return finish(base, exact, "exact", cands, rng, { step: 0.5 });
  }

  if (kind === "growth") {
    const up = rng.next() < 0.6;
    const pct = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15]);
    const r = up ? 1 + pct / 100 : 1 - pct / 100;
    const a = rng.int(10, 500);
    const n = rng.int(5, 20);
    const exact = geoTerm(a, r, n);
    const terms = [1, 2, 3].map((i) => geoTerm(a, r, i));
    const base = {
      prompt: `A geometric sequence has first term ${a} and common ratio ${show(r)} (it begins ${listTerms(terms.map((t) => Math.round(t * 10000) / 10000))}). What is its ${ordinal(n)} term?`,
      explanation: `Use \`u(n) = a × r^(n - 1)\`.\n\n${[given("_a", a), given("_r", r), row(`_u${n}`, `_a * _r^(${n} - 1)`, final(exact, "2dp"))].join("\n")}`,
      params: { kind: "term", a, r, n },
      hints: [
        `Use \`u(n) = a × r^(n - 1)\` with a = ${a} and r = ${show(r)}.`,
        `For the ${ordinal(n)} term the power is ${n} - 1 = ${n - 1}: \`_a * _r^(${n} - 1)\` = ${a} × ${show(r)}^${n - 1}. Round to 2 decimal places only at the end.`,
      ],
    };
    return finish(base, exact, "2dp", [a * r ** n, a * r ** (n - 2), a * (1 + (r - 1) * (n - 1)), a * r * n], rng);
  }

  // first-over: the first term of a growing geometric sequence above a bound
  const r = rng.pick([2, 3, 1.5, 1.2, 1.1, 1.25]);
  const a = rng.int(2, 20);
  const bound = rng.int(500, 50000);
  let n = 1;
  while (geoTerm(a, r, n) <= bound) n++;
  if (Math.abs(geoTerm(a, r, n - 1) - bound) < 1e-6 * bound || Math.abs(geoTerm(a, r, n) - bound) < 1e-6 * bound) return null;
  const terms = [1, 2, 3].map((i) => geoTerm(a, r, i));
  const base = {
    prompt: `In the geometric sequence ${listTerms(terms)}, the nth term is the first one greater than ${bound}. What is n?`,
    explanation: [
      `Solve \`a × r^(n - 1) > ${bound}\` using logs, then take the next whole number.`,
      [given("_a", a), given("_u2", terms[1]), given("_bound", bound), row("_r", "_u2 / _a", show(r)), row("_n", "log(_bound / _a) / log(_r) + 1", show(Math.round((Math.log(bound / a) / Math.log(r) + 1) * 10000) / 10000))].join("\n"),
      `So n = ${final(n, "whole")} (check: \`u(${n}) ≈ ${show(Math.round(geoTerm(a, r, n) * 100) / 100)}\`, \`u(${n - 1}) ≈ ${show(Math.round(geoTerm(a, r, n - 1) * 100) / 100)}\`).`,
    ].join("\n\n"),
    params: { kind: "geo-first-over", a, r, bound },
    hints: [
      `Solve \`a × r^(n - 1) > ${bound}\`. Logs bring the power down, or you can keep multiplying by r and count.`,
      `Here a = ${a} and r = ${show(terms[1])} ÷ ${a} = ${show(r)}.`,
      `Work out \`log(_bound / _a) / log(_r) + 1\`, then take the next whole number above it. Check that term is above ${bound} and the one before isn't.`,
    ],
  };
  return finish(base, n, "whole", [n - 1, n + 1, Math.round(bound / a / r), n + 2], rng, { positive: true });
}

// ---------------------------------------------------------------------------------------------
// Series

function genSeries(difficulty, rng) {
  const kinds = {
    easy: ["arith-sum", "geo-sum"],
    medium: ["arith-sum", "geo-sum", "arith-sum-last", "natural"],
    hard: ["infinite", "infinite", "infinite-r", "geo-sum", "arith-sum-two"],
  }[difficulty];
  const kind = rng.pick(kinds);
  const easy = difficulty === "easy";

  if (kind === "arith-sum" || kind === "arith-sum-last") {
    const a = easy ? rng.int(1, 12) : rng.int(-20, 40);
    const d = easy ? rng.int(1, 6) : nonZero(rng, -8, 12);
    const n = easy ? rng.int(4, 8) : rng.int(10, 60);
    const l = arithTerm(a, d, n);
    const exact = (n * (a + l)) / 2;
    const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
    const withLast = kind === "arith-sum-last";
    const base = {
      prompt: withLast
        ? `Find the sum of the arithmetic series ${terms.map(par).join(" + ")} + … + ${par(l)}.`
        : `The arithmetic sequence ${listTerms(terms)} continues. Find the sum of its first ${n} terms.`,
      explanation: withLast
        ? `First find how many terms there are, then use \`S = n × (first + last) / 2\`.\n\n${[given("_a", a), given("_u2", terms[1]), given("_l", l), row("_d", "_u2 - _a", d), row("_n", "(_l - _a) / _d + 1", n), row("_S", "_n * (_a + _l) / 2", final(exact, "whole"))].join("\n")}`
        : `Use \`S(n) = n / 2 × (2a + (n - 1) × d)\`.\n\n${[given("_a", a), given("_u2", terms[1]), given("_n", n), row("_d", "_u2 - _a", d), row("_S", "_n / 2 * (2 * _a + (_n - 1) * _d)", final(exact, "whole"))].join("\n")}`,
      params: withLast ? { kind: "arith-sum-last", a, d, l } : { kind: "arith-sum", a, d, n },
      hints: withLast
        ? [
            `First count the terms, then use \`S = n × (first + last) / 2\`.`,
            `d = ${par(terms[1])} - ${par(a)} = ${d}. The number of terms is (last - first) ÷ d + 1 = (${par(l)} - ${par(a)}) ÷ ${par(d)} + 1 = ${n}.`,
            `Now \`_n * (_a + _l) / 2\` = ${n} × (${par(a)} + ${par(l)}) ÷ 2.`,
          ]
        : [
            `Use \`S(n) = n / 2 × (2a + (n - 1) × d)\`, with a = ${a} and n = ${n}.`,
            `d = ${par(terms[1])} - ${par(a)} = ${d}.`,
            `Substitute: ${n} / 2 × (2 × ${par(a)} + ${n - 1} × ${par(d)}). Work out the brackets first.`,
          ],
    };
    return finish(base, exact, "whole", [n * (a + l), l, (n * (a + l + d)) / 2, ((n - 1) * (a + l - d)) / 2, n * a + n * d], rng);
  }

  if (kind === "natural") {
    const lo = rng.pick([1, 1, rng.int(2, 50)]);
    const n = rng.int(20, 200);
    const hi = lo + n - 1;
    const exact = (n * (lo + hi)) / 2;
    const base = {
      prompt: `What is the sum of all the whole numbers from ${lo} to ${hi}, inclusive?`,
      explanation: `This is an arithmetic series with difference 1.\n\n${[given("_first", lo), given("_last", hi), row("_n", "_last - _first + 1", n), row("_S", "_n * (_first + _last) / 2", final(exact, "whole"))].join("\n")}`,
      params: { kind: "arith-sum", a: lo, d: 1, n },
      hints: [
        `This is an arithmetic series with first term ${lo}, last term ${hi} and difference 1.`,
        `Count the numbers: ${hi} - ${lo} + 1 = ${n} (don't forget the +1, both ends are included).`,
        `Use \`S = n × (first + last) / 2\` = ${n} × (${lo} + ${hi}) ÷ 2.`,
      ],
    };
    return finish(base, exact, "whole", [(hi * (hi + 1)) / 2, n * (lo + hi), ((n - 1) * (lo + hi)) / 2, (hi * (lo + hi)) / 2], rng);
  }

  if (kind === "geo-sum") {
    let a, r, n, fmt;
    if (easy) {
      r = rng.pick([2, 3]);
      a = rng.int(1, 9);
      n = rng.int(4, r === 2 ? 7 : 5);
      fmt = "whole";
    } else if (difficulty === "medium") {
      r = rng.pick([2, 3, -2, 0.5, 4]);
      n = rng.int(5, r === 4 ? 7 : 10);
      a = r === 0.5 ? rng.int(1, 5) * 2 ** (n - 1) : nonZero(rng, 1, 12);
      fmt = "whole";
    } else {
      r = rng.pick([1.1, 1.2, 1.05, 0.9, 0.8, 1.5, -0.5, 0.75]);
      n = rng.int(6, 20);
      a = rng.int(2, 300);
      fmt = "2dp";
    }
    const exact = (a * (r ** n - 1)) / (r - 1);
    const terms = [1, 2, 3].map((i) => geoTerm(a, r, i));
    const base = {
      prompt: `The geometric sequence ${listTerms(terms)} continues. Find the sum of its first ${n} terms.`,
      explanation: `Use \`S(n) = a × (r^n - 1) / (r - 1)\`.\n\n${[given("_a", a), given("_u2", terms[1]), given("_n", n), row("_r", "_u2 / _a", show(r)), row("_S", "_a * (_r^_n - 1) / (_r - 1)", final(exact, fmt))].join("\n")}`,
      params: { kind: "geo-sum", a, r, n },
      hints: [
        `Use \`S(n) = a × (r^n - 1) / (r - 1)\`, with a = ${a} and n = ${n}.`,
        `r = ${par(terms[1])} ÷ ${a} = ${show(r)}.`,
        `Substitute: ${a} × (${par(r)}^${n} - 1) ÷ (${par(r)} - 1). The power is n = ${n} here, not n - 1.${fmt === "2dp" ? " Round to 2 decimal places only at the end." : ""}`,
      ],
    };
    return finish(base, exact, fmt, [(a * (r ** (n - 1) - 1)) / (r - 1), (a * (r ** (n + 1) - 1)) / (r - 1), geoTerm(a, r, n), a * r ** n, n * a * r], rng);
  }

  if (kind === "arith-sum-two") {
    // hard: given u(p) and u(q), sum of the first n terms
    const a = rng.int(-20, 30);
    const d = nonZero(rng, -9, 12);
    const p = rng.int(2, 6);
    const q = rng.int(p + 2, 15);
    const n = rng.int(q + 2, 50);
    const up = arithTerm(a, d, p);
    const uq = arithTerm(a, d, q);
    const exact = (n * (2 * a + (n - 1) * d)) / 2;
    const base = {
      prompt: `In an arithmetic sequence, the ${ordinal(p)} term is ${up} and the ${ordinal(q)} term is ${uq}. What is the sum of the first ${n} terms?`,
      explanation: `Find d and a first, then use \`S(n) = n / 2 × (2a + (n - 1) × d)\`.\n\n${[given(`_u${p}`, up), given(`_u${q}`, uq), row("_d", `(_u${q} - _u${p}) / (${q} - ${p})`, d), row("_a", `_u${p} - (${p} - 1) * _d`, a), given("_n", n), row("_S", "_n / 2 * (2 * _a + (_n - 1) * _d)", final(exact, "whole"))].join("\n")}`,
      params: { kind: "arith-sum-two", p, up, q, uq, n },
      hints: [
        `Find d and the first term a, then use \`S(n) = n / 2 × (2a + (n - 1) × d)\`.`,
        `d = (${par(uq)} - ${par(up)}) ÷ (${q} - ${p}) = ${d}. Step back from the ${ordinal(p)} term: a = ${par(up)} - ${p - 1} × ${par(d)} = ${a}.`,
        `Substitute n = ${n}: ${n} / 2 × (2 × ${par(a)} + ${n - 1} × ${par(d)}).`,
      ],
    };
    return finish(base, exact, "whole", [n * (a + arithTerm(a, d, n)), (n * (up + arithTerm(a, d, n))) / 2, ((n - 1) * (2 * a + (n - 2) * d)) / 2, (n * (2 * a + n * d)) / 2], rng);
  }

  // Infinite geometric series (hard only).
  const R = [
    [1, 2], [-1, 2], [1, 3], [2, 3], [-1, 3], [1, 4], [3, 4], [-1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [-2, 5], [1, 10], [9, 10], [-2, 3],
  ];
  const [rn, rd] = rng.pick(R);
  const r = rn / rd;
  const a = nonZero(rng, -40, 60);
  const S = a / (1 - r);
  const fmt = fitsFormat(S, "exact") && Math.abs(S * 100 - Math.round(S * 100)) < 1e-6 ? "exact" : "2dp";
  if (kind === "infinite-r") {
    // given a and S∞, find r
    if (fmt !== "exact" || Math.abs(S) > 1000) return null;
    const exact = r;
    const base = {
      prompt: `An infinite geometric series has first term ${a} and sum to infinity ${show(S)}. What is its common ratio?`,
      explanation: `From \`S = a / (1 - r)\`, \`r = 1 - a / S\`.\n\n${[given("_a", a), given("_S", S), row("_r", "1 - _a / _S", final(exact, "2dp"))].join("\n")}`,
      params: { kind: "inf-r", a, S },
      hints: [
        `Start from the sum to infinity: \`S = a / (1 - r)\`.`,
        `Rearrange for r: 1 - r = a / S, so \`r = 1 - a / S\`.`,
        `Substitute a = ${a} and S = ${show(S)}: 1 - ${a} ÷ ${par(S)}.`,
      ],
    };
    return finish(base, exact, "2dp", [a / S, 1 + a / S, S / a, -r], rng, { step: 0.05 });
  }
  const terms = [1, 2, 3, 4].map((i) => geoTerm(a, r, i));
  const shownTerms = terms.map((t) => (fitsFormat(t, "exact") ? par(t) : null));
  if (shownTerms.some((t) => t === null)) {
    // a fraction-heavy start: describe it by a and r instead
    const base = {
      prompt: `An infinite geometric series has first term ${a} and common ratio ${rn}/${rd}. What is its sum to infinity?`,
      explanation: `Because |r| < 1, the sum converges to \`S = a / (1 - r)\`.\n\n${[given("_a", a), row("_r", `${rn} / ${rd}`, show(Math.round(r * 10000) / 10000)), row("_S", "_a / (1 - _r)", final(S, fmt))].join("\n")}`,
      params: { kind: "inf-sum", a, rn, rd },
      hints: [
        `Because the ratio is between -1 and 1, the terms shrink and the sum converges to \`S = a / (1 - r)\`.`,
        `Substitute a = ${a} and r = ${rn}/${rd}: ${a} ÷ (1 - ${rn < 0 ? `(${rn}/${rd})` : `${rn}/${rd}`}). Keep r as a fraction or full decimal.${fmt === "2dp" ? " Round to 2 decimal places only at the end." : ""}`,
      ],
    };
    return finish(base, S, fmt, [a / (1 + r), (a * r) / (1 - r), a / r, a * (1 - r), a + a * r], rng, { step: fmt === "exact" ? 0.5 : 1 });
  }
  const base = {
    prompt: `Find the sum to infinity of the geometric series ${shownTerms.join(" + ")} + …`,
    explanation: `The ratio is ${rn}/${rd}; because |r| < 1, the sum converges to \`S = a / (1 - r)\`.\n\n${[given("_a", a), given("_u2", terms[1]), row("_r", "_u2 / _a", show(Math.round(r * 10000) / 10000)), row("_S", "_a / (1 - _r)", final(S, fmt))].join("\n")}`,
    params: { kind: "inf-sum", a, rn, rd },
    hints: [
      `Find the common ratio: r = ${par(terms[1])} ÷ ${par(a)} = ${rn}/${rd}.`,
      `Since -1 < r < 1, the sum to infinity exists: \`S = a / (1 - r)\`.`,
      `Substitute a = ${a}: ${a} ÷ (1 - ${rn < 0 ? `(${rn}/${rd})` : `${rn}/${rd}`}).${fmt === "2dp" ? " Round to 2 decimal places only at the end." : ""}`,
    ],
  };
  return finish(base, S, fmt, [a / (1 + r), (a * r) / (1 - r), a / r, a * (1 - r), a + a * r], rng, { step: fmt === "exact" ? 0.5 : 1 });
}

const GENS = { arithmetic: genArithmetic, geometric: genGeometric, series: genSeries };

export function generate({ subtopic, difficulty, rng }) {
  const fn = GENS[subtopic];
  if (!fn) throw new Error(`Unknown subtopic: ${subtopic}`);
  checkDifficulty(difficulty);
  for (let t = 0; t < 200; t++) {
    GIVEN = [];
    const q = fn(difficulty, rng);
    if (q) {
      const out = attachGiven(q);
      GIVEN = null;
      return out;
    }
  }
  GIVEN = null;
  throw new Error(`Could not build a ${subtopic}/${difficulty} question`);
}

// ---------------------------------------------------------------------------------------------
// Independent check: rebuild the value by brute force (walking the sequence term by term,
// adding terms one at a time, partial sums for the infinite series) instead of closed formulas.

function walkArith(a, d, n) {
  let u = a;
  for (let i = 1; i < n; i++) u += d;
  return u;
}
function walkGeo(a, r, n) {
  let u = a;
  for (let i = 1; i < n; i++) u *= r;
  return u;
}

function exactOf(p) {
  switch (p.kind) {
    case "term":
      return p.r !== undefined ? walkGeo(p.a, p.r, p.n) : walkArith(p.a, p.d, p.n);
    case "pn-p":
      return p.d;
    case "pn-q":
      return p.a - p.d;
    case "find-n": {
      let u = p.a;
      for (let n = 1; n <= 100000; n++, u += p.d) if (Math.abs(u - p.target) < 1e-9) return n;
      return NaN;
    }
    case "first-over": {
      let u = p.a;
      for (let n = 1; n <= 100000; n++, u += p.d) if (u > p.bound) return n;
      return NaN;
    }
    case "two-d":
      return (p.uq - p.up) / (p.q - p.p);
    case "two-term":
      return walkArith(p.uq, (p.uq - p.up) / (p.q - p.p), p.r - p.q + 1);
    case "ratio": {
      const rs = [p.terms[1] / p.terms[0], p.terms[2] / p.terms[1], p.terms[3] / p.terms[2]];
      return rs.every((x) => Math.abs(x - rs[0]) < 1e-9) ? rs[0] : NaN;
    }
    case "geo-find-n": {
      let u = p.a;
      for (let n = 1; n <= 200; n++, u *= p.r) if (Math.abs(u - p.target) < 1e-9) return n;
      return NaN;
    }
    case "geo-two-r": {
      const ratio = p.uq / p.up;
      const g = p.q - p.p;
      return Math.sign(ratio) * Math.abs(ratio) ** (1 / g);
    }
    case "geo-two-a": {
      const ratio = p.uq / p.up;
      const g = p.q - p.p;
      const r = Math.sign(ratio) * Math.abs(ratio) ** (1 / g);
      let u = p.up;
      for (let i = p.p; i > 1; i--) u /= r;
      return u;
    }
    case "geo-first-over": {
      let u = p.a;
      for (let n = 1; n <= 10000; n++, u *= p.r) if (u > p.bound) return n;
      return NaN;
    }
    case "arith-sum": {
      let s = 0;
      for (let i = 0, u = p.a; i < p.n; i++, u += p.d) s += u;
      return s;
    }
    case "arith-sum-last": {
      let s = 0;
      let u = p.a;
      for (let i = 0; i < 100000; i++, u += p.d) {
        s += u;
        if (u === p.l) return s;
      }
      return NaN;
    }
    case "arith-sum-two": {
      const d = (p.uq - p.up) / (p.q - p.p);
      const a = p.up - (p.p - 1) * d;
      let s = 0;
      for (let i = 0, u = a; i < p.n; i++, u += d) s += u;
      return s;
    }
    case "geo-sum": {
      let s = 0;
      for (let i = 0, u = p.a; i < p.n; i++, u *= p.r) s += u;
      return s;
    }
    case "inf-sum": {
      // partial sums converge; 2000 terms of |r| ≤ 0.9 leave an error far below 1e-9
      const r = p.rn / p.rd;
      let s = 0;
      for (let i = 0, u = p.a; i < 2000; i++, u *= r) s += u;
      return s;
    }
    case "inf-r":
      return (p.S - p.a) / p.S;
    default:
      return NaN;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.kind) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  const exact = exactOf(p);
  if (!Number.isFinite(exact)) return false;
  if (p.fmt === "2dp") return Math.abs(x - exact) <= 0.005 + 1e-9;
  if (p.fmt === "whole" && !Number.isInteger(x)) return false;
  return Math.abs(x - exact) <= 1e-9 * Math.max(1, Math.abs(exact));
}
