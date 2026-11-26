// Sequences and series generator. Uses only the seeded rng passed in by the engine.
// Arithmetic: u(n) = a + (n - 1)d. Geometric: u(n) = a·r^(n - 1).
// Each question's params.fmt says how the answer is given:
//   "whole"  a whole number (possibly negative), tolerance 0
//   "exact"  an exact decimal (at most 4 places), tolerance 0
//   "2dp"    rounded to 2 decimals, tolerance 0.005 (exact values sitting on a half are regenerated)
// Explanations list every step as a labelled calculator row, e.g. `_u20 = _a + (20 - 1) * _d` → 62.
// Infinite geometric sums appear only on hard.

// Round half away from zero (the 1e-9 nudge absorbs binary error, e.g. 2.525*100 = 252.4999...), the
// half-step test and the 2-dp answer string come from mathutil.
import { fmtAnswer, isHalfStep, round2 } from "../../js/lib/mathutil.js";

// Strip binary noise (0.1 * 3 = 0.30000000000000004) without changing a real value; never "-0".
function clean(n) {
  const r = Number(n.toFixed(6));
  return Object.is(r, -0) ? 0 : r;
}
const show = (n) => String(clean(n));

// True when the exact value sits (nearly) on a half at the 2nd decimal, e.g. 1.625.
const isTie = (x) => isHalfStep(x, 2, 1e-4);

function fmtAns(n, fmt) {
  if (fmt !== "2dp") return show(n);
  return fmtAnswer(n, true);
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

// ---------------------------------------------------------------------------------------------
// Expert: multi-step, multi-part questions (easy/medium/hard above are untouched and never reach
// this code). Every template draws all of its rng values first, then builds text. Hints use only
// values already drawn (no rng) and never state a part's answer. Params use "x-" kinds, checked by
// verifyExpert (walking the sequence / adding terms one at a time / bisection).

const XNOTE = { whole: " (a whole number)", exact: " (exact)", "2dp": " (round to 2 decimal places)" };

// One number part; null when the value doesn't suit its format (the template is then redrawn).
function xpart(id, label, ask, exact, fmt, hint) {
  if (!fitsFormat(exact, fmt)) return null;
  return { id, label, ask: ask + XNOTE[fmt], answerType: "number", answer: fmt === "2dp" ? round2(exact) : clean(exact), tolerance: TOL(fmt), hint };
}
const xmulti = (base, parts) => (parts.some((p) => !p) ? null : { ...base, answerType: "multi", parts });
// "3x + 1", "x - 2", "-x", "2x"
const linX = (m, c) => `${m === 1 ? "" : m === -1 ? "-" : m}x${c === 0 ? "" : c > 0 ? ` + ${c}` : ` - ${-c}`}`;
const money = (v) => `£${Number.isInteger(v) ? v : v.toFixed(2)}`; // no thousands commas, so prompt values match the calculator rows

// arithmetic / expert 0: three consecutive terms written in x -> x, d and a later term.
function xArithAlg(rng) {
  const x = rng.int(-8, 9);
  const m1 = rng.int(1, 5);
  const m2 = rng.int(1, 6);
  const m3 = rng.int(1, 7);
  const c1 = rng.int(-12, 12);
  const c2 = rng.int(-12, 12);
  const n = rng.int(12, 40);
  const K = 2 * m2 - m1 - m3;
  if (Math.abs(K) < 2) return null; // K = ±1 would make the hint `Kx = R` state x
  const c3 = K * x + 2 * c2 - c1;
  if (Math.abs(c3) > 40) return null;
  const [t1, t2, t3] = [m1 * x + c1, m2 * x + c2, m3 * x + c3];
  const d = t2 - t1;
  if (d === 0) return null;
  const un = arithTerm(t1, d, n);
  const [e1, e2, e3] = [linX(m1, c1), linX(m2, c2), linX(m3, c3)];
  const R = c1 + c3 - 2 * c2;
  const explanation = [
    `Consecutive terms of an arithmetic sequence have equal differences: \`(${e2}) - (${e1}) = (${e3}) - (${e2})\`, which rearranges to \`2(${e2}) = (${e1}) + (${e3})\`.`,
    `Expand and collect: \`${linX(2 * m2, 2 * c2)} = ${linX(m1 + m3, c1 + c3)}\`, so \`${K}x = ${R}\` and **x = ${x}**.`,
    `The terms are ${t1}, ${t2}, ${t3}, so **d = ${d}**.`,
    row(`_u${n}`, `${par(t1)} + (${n} - 1) * ${par(d)}`, final(un, "whole")),
  ].join("\n\n");
  return xmulti(
    {
      prompt: `The expressions \`${e1}\`, \`${e2}\` and \`${e3}\` are the first three terms of an arithmetic sequence, in that order.`,
      explanation,
      params: { kind: "x-arith-alg", m1, c1, m2, c2, m3, c3, n },
      hints: [
        `In an arithmetic sequence the differences are equal: (2nd - 1st) = (3rd - 2nd). That rearranges to 2 × (2nd term) = 1st term + 3rd term.`,
        `Expand \`2(${e2}) = (${e1}) + (${e3})\` and collect the x terms on one side. You should reach \`${K}x = ${R}\`.`,
        `Once you have x, substitute it into all three expressions to get the actual terms, then use \`u(n) = a + (n - 1) × d\`.`,
      ],
    },
    [
      xpart("x", "x", "Value of x", x, "whole", `Solve \`${K}x = ${R}\`.`),
      xpart("d", "Difference", "Common difference d", d, "whole", `Substitute your x into \`${e1}\` and \`${e2}\`, then subtract the first from the second.`),
      xpart("term", `Term ${n}`, `The ${ordinal(n)} term`, un, "whole", `The first term a is the value of \`${e1}\`. Then \`a + (${n} - 1) × d\`.`),
    ],
  );
}

// arithmetic / expert 1: a term and a sum are known -> d, a and a later term (simultaneous equations).
function xArithTermSum(rng) {
  const a = rng.int(-15, 25);
  const d = nonZero(rng, -7, 9);
  const p = rng.int(3, 9);
  const n = rng.int(8, 30);
  const r = rng.int(31, 80);
  if (2 * (p - 1) === n - 1) return null; // the two equations would be the same
  const up = arithTerm(a, d, p);
  const S = (n * (2 * a + (n - 1) * d)) / 2;
  const ur = arithTerm(a, d, r);
  const half = 2 * S / n;
  const prompt = `In an arithmetic sequence, the ${ordinal(p)} term is ${up} and the sum of the first ${n} terms is ${S}.`;
  const explanation = [
    `Write two equations: \`a + ${p - 1}d = ${up}\` (the ${ordinal(p)} term) and \`${n}/2 × (2a + ${n - 1}d) = ${S}\` (the sum).`,
    `Divide the sum equation by ${n}/2: \`2a + ${n - 1}d = ${show(half)}\`. Double the term equation: \`2a + ${2 * (p - 1)}d = ${2 * up}\`.`,
    `Subtract to eliminate a: \`${n - 1 - 2 * (p - 1)}d = ${show(half - 2 * up)}\`, so **d = ${d}**.`,
    [given(`_u${p}`, up), given("_S", S), given("_n", n), row("_d", `(2 * _S / _n - 2 * _u${p}) / ((_n - 1) - 2 * (${p} - 1))`, d), row("_a", `_u${p} - (${p} - 1) * _d`, `**${a}**`), row(`_u${r}`, `_a + (${r} - 1) * _d`, final(ur, "whole"))].join("\n"),
  ].join("\n\n");
  return xmulti(
    {
      prompt,
      explanation,
      params: { kind: "x-arith-termsum", p, up, n, S, r },
      hints: [
        `Use both facts. The ${ordinal(p)} term gives \`a + (${p} - 1)d = ${up}\`; the sum gives \`${n}/2 × (2a + (${n} - 1)d) = ${S}\`.`,
        `Divide the sum equation by ${n}/2 so it reads \`2a + ${n - 1}d = …\`, and double the term equation so both start with 2a.`,
        `Subtract one from the other: the a terms cancel and leave one equation in d.`,
      ],
    },
    [
      xpart("d", "Difference", "Common difference d", d, "whole", "After eliminating a you have one equation in d only: divide."),
      xpart("a", "First term", "First term a", a, "whole", `Put d back into \`a + (${p} - 1)d = ${up}\`.`),
      xpart("term", `Term ${r}`, `The ${ordinal(r)} term`, ur, "whole", `Use \`u(n) = a + (n - 1) × d\` with n = ${r}.`),
    ],
  );
}

// arithmetic / expert 2: a decreasing sequence -> first negative term, its value, sum of the positive terms.
function xArithFirstNeg(rng) {
  const half = rng.next() < 0.35;
  const step = half ? rng.int(3, 15) / 2 : rng.int(2, 9); // |d|
  const k = rng.int(8, 40);
  const zero = rng.next() < 0.25;
  const eUnits = rng.int(1, Math.max(1, Math.round(step * 2) - 1)); // e in half-units, 0 < e < step
  const e = zero ? 0 : eUnits / 2;
  if (!zero && e >= step) return null;
  const a = k * step + e; // u(k + 1) = e >= 0, u(k + 2) = e - step < 0
  const d = -step;
  const n = k + 2;
  const val = e - step;
  const sumPos = ((k + 1) * (a + e)) / 2;
  const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
  const nReal = a / step + 1;
  const explanation = [
    `The sequence goes down by ${show(step)} each time, so d = ${show(d)}. Solve \`a + (n - 1) × d < 0\`.`,
    [given("_a", a), given("_u2", terms[1]), row("_d", "_u2 - _a", show(d)), row("_n", "_a / (0 - _d) + 1", show(Math.round(nReal * 10000) / 10000))].join("\n"),
    zero
      ? `So u(${n - 1}) = 0 exactly. Zero is not negative, so the first negative term is the next one: **n = ${n}**, with value ${final(val, "exact")}.`
      : `n must be a whole number greater than that, so **n = ${n}**: u(${n}) = ${final(val, "exact")} and u(${n - 1}) = ${show(e)} is still positive.`,
    `The positive terms are the first ${zero ? k : k + 1}${zero ? ` (the ${ordinal(k + 1)} term is 0 and adds nothing)` : ""}. Their sum is \`${k + 1} × (${show(a)} + ${show(e)}) / 2\` = ${final(sumPos, "exact")}.`,
  ].join("\n\n");
  return xmulti(
    {
      prompt: `The arithmetic sequence ${listTerms(terms)} continues. (0 counts as neither positive nor negative.)`,
      explanation,
      params: { kind: "x-arith-neg", a, d },
      hints: [
        `Find d = ${par(terms[1])} - ${par(a)} first (it is negative). A term is negative when \`a + (n - 1) × d < 0\`.`,
        `Solve it like an equation: n - 1 > ${show(a)} ÷ ${show(step)}. Then n is the next whole number above \`_a / (0 - _d) + 1\`; if that is already whole, that term is exactly 0, so go one further.`,
        `The positive terms are all the terms before the first negative one (leave out a term equal to 0). Add them with \`S = n × (first + last) / 2\`.`,
      ],
    },
    [
      xpart("n", "Position", "Which term is the first negative one? (n)", n, "whole", "Round up to the next whole number, and check the term before it is not negative."),
      xpart("value", "Its value", "The value of that term", val, "exact", "Substitute your n into `a + (n - 1) × d`."),
      xpart("sum", "Sum", "The sum of all the positive terms", sumPos, "exact", "Count the positive terms, find the last one, and use n × (first + last) ÷ 2."),
    ],
  );
}

// geometric / expert 0: x + a, x + b, x + c in geometric progression -> x, r and a later term.
const XGEO_R = [2, 3, -2, -3, 4, 1.5, 0.5, -0.5];
function xGeoAlg(rng) {
  const r = rng.pick(XGEO_R);
  let t1 = nonZero(rng, -9, 9);
  const x = rng.int(-12, 12);
  const n = rng.int(5, 8);
  if (!Number.isInteger(r)) t1 *= 4;
  const [t2, t3] = [t1 * r, t1 * r * r];
  const [a, b, c] = [t1 - x, t2 - x, t3 - x];
  if (new Set([a, b, c]).size < 3) return null;
  const K = 2 * b - a - c;
  const R = a * c - b * b;
  if (Math.abs(K) < 2) return null; // the hint `Kx = R` would state x
  const un = geoTerm(t1, r, n);
  if (Math.abs(un) > 1e6) return null;
  const [e1, e2, e3] = [linX(1, a), linX(1, b), linX(1, c)];
  const explanation = [
    `In a geometric sequence the ratios are equal: \`(${e2}) / (${e1}) = (${e3}) / (${e2})\`, so \`(${e2})² = (${e1})(${e3})\`.`,
    `Expand: the x² terms cancel, leaving \`${K}x = ${R}\`, so **x = ${x}**.`,
    `The terms are ${t1}, ${show(t2)}, ${show(t3)}, so **r = ${show(t2)} / ${par(t1)} = ${show(r)}**.`,
    row(`_u${n}`, `${par(t1)} * ${par(r)}^(${n} - 1)`, final(un, "exact")),
  ].join("\n\n");
  return xmulti(
    {
      prompt: `The expressions \`${e1}\`, \`${e2}\` and \`${e3}\` are the first three terms of a geometric sequence, in that order.`,
      explanation,
      params: { kind: "x-geo-alg", a, b, c, n },
      hints: [
        `In a geometric sequence, 2nd ÷ 1st = 3rd ÷ 2nd. Cross-multiply: \`(${e2})² = (${e1})(${e3})\`.`,
        `Expand both sides. The x² terms cancel, so the equation is linear: \`${K}x = ${R}\`.`,
        `Substitute x into the three expressions to get the actual terms. Divide the 2nd by the 1st for r, then use \`u(n) = a × r^(n - 1)\`.`,
      ],
    },
    [
      xpart("x", "x", "Value of x", x, "whole", `Solve \`${K}x = ${R}\`.`),
      xpart("r", "Ratio", "Common ratio r", r, "exact", `Substitute x into \`${e1}\` and \`${e2}\`, then divide the second by the first.`),
      xpart("term", `Term ${n}`, `The ${ordinal(n)} term`, un, "exact", `The first term is the value of \`${e1}\`; multiply it by r ${n - 1} times.`),
    ],
  );
}

// geometric / expert 1: two positive terms -> r, a, and the first term above a bound (logs).
function xGeoTwoBound(rng) {
  const r = rng.pick([2, 3, 4, 1.5, 2.5]);
  const p = rng.int(2, 4);
  const gap = rng.int(2, 3);
  const a = rng.int(1, 6) * (Number.isInteger(r) ? 1 : 64);
  const ahead = rng.int(2, 6);
  const frac = rng.int(1, 9) / 10;
  const q = p + gap;
  const up = geoTerm(a, r, p);
  const uq = geoTerm(a, r, q);
  const m = q + ahead;
  const lo = geoTerm(a, r, m - 1);
  const hi = geoTerm(a, r, m);
  const B = Math.floor(lo + frac * (hi - lo));
  if (!(B > lo && B < hi) || B > 1e8) return null;
  const nReal = Math.log(B / a) / Math.log(r) + 1;
  const explanation = [
    `From term ${p} to term ${q} you multiply by r ${gap} times, so \`r^${gap} = ${show(uq)} / ${show(up)}\`. The terms are positive, so r is positive.`,
    [given(`_u${p}`, up), given(`_u${q}`, uq), given("_B", B), row("_r", `(_u${q} / _u${p})^(1 / ${gap})`, `**${show(r)}**`), row("_a", `_u${p} / _r^(${p} - 1)`, `**${show(a)}**`), row("_n", "log(_B / _a) / log(_r) + 1", show(Math.round(nReal * 10000) / 10000))].join("\n"),
    `n must be the next whole number: **n = ${m}** (check: u(${m}) = ${show(hi)} > ${B}, u(${m - 1}) = ${show(lo)} is not).`,
  ].join("\n\n");
  return xmulti(
    {
      prompt: `In a geometric sequence all the terms are positive. The ${ordinal(p)} term is ${show(up)} and the ${ordinal(q)} term is ${show(uq)}. Which term is the first one greater than ${B}?`,
      explanation,
      params: { kind: "x-geo-bound", p, up, q, uq, B },
      hints: [
        `From the ${ordinal(p)} term to the ${ordinal(q)} term you multiply by r ${gap} times: \`r^${gap} = u${q} / u${p}\`. Take the ${gap === 2 ? "square" : "cube"} root.`,
        `Step back to the first term: divide the ${ordinal(p)} term by r ${p - 1} time${p === 2 ? "" : "s"}, \`_u${p} / _r^(${p} - 1)\`.`,
        `Solve \`a × r^(n - 1) > ${B}\` with logs: n - 1 > log(${B} ÷ a) ÷ log(r). Take the next whole number and check the terms either side.`,
      ],
    },
    [
      xpart("r", "Ratio", "Common ratio r", r, "exact", `Work out ${show(uq)} ÷ ${show(up)}, then take the ${gap === 2 ? "square" : "cube"} root.`),
      xpart("a", "First term", "First term a", a, "exact", `Divide the ${ordinal(p)} term by r^${p - 1}.`),
      xpart("n", "Position", `Which term is the first one greater than ${B}? (n)`, m, "whole", "Use `log(_B / _a) / log(_r) + 1` and round up."),
    ],
  );
}

const XGROW = [
  { what: "A car", start: "is bought for", per: "loses {p}% of its value each year", unit: "value", down: true, lo: 80, hi: 400 },
  { what: "A laptop", start: "costs", per: "loses {p}% of its value each year", unit: "value", down: true, lo: 6, hi: 25 },
  { what: "A savings account", start: "starts with", per: "earns {p}% compound interest at the end of each year", unit: "balance", down: false, lo: 10, hi: 200 },
  { what: "A house", start: "is valued at", per: "rises in value by {p}% each year", unit: "value", down: false, lo: 1200, hi: 4000 },
];
// geometric / expert 2: compound growth or decay -> value after k years, first year past a threshold.
function xGeoGrowth(rng) {
  const ctx = rng.pick(XGROW);
  const pct = rng.pick(ctx.down ? [5, 8, 10, 12, 15, 20, 25] : [2, 3, 4, 5, 6, 8, 10]);
  const V = rng.int(ctx.lo, ctx.hi) * 100;
  const k = rng.int(3, 9);
  const m = rng.int(4, ctx.down ? 15 : 25);
  const frac = rng.int(2, 8) / 10;
  const r = ctx.down ? 1 - pct / 100 : 1 + pct / 100;
  const vk = V * r ** k;
  const before = V * r ** (m - 1);
  const at = V * r ** m;
  const T = Math.round((before + frac * (at - before)) / 10) * 10;
  if (ctx.down ? !(T < before && T > at) : !(T > before && T < at)) return null;
  if (isTie(vk)) return null;
  const cmp = ctx.down ? "less than" : "more than";
  const per = ctx.per.replace("{p}", pct);
  const mReal = Math.log(T / V) / Math.log(r);
  const explanation = [
    `Each year multiplies the ${ctx.unit} by r = ${ctx.down ? `1 - ${pct}/100` : `1 + ${pct}/100`} = ${show(r)}. After t years it is \`V × r^t\` (the start is year 0, so the power is t, not t - 1).`,
    [given("_V", V), given("_pct", pct), given("_k", k), given("_T", T), row("_r", ctx.down ? "1 - _pct / 100" : "1 + _pct / 100", show(r)), row("_after", "_V * _r^_k", final(vk, "2dp")), row("_t", "log(_T / _V) / log(_r)", show(Math.round(mReal * 10000) / 10000))].join("\n"),
    `t must be a whole number of years past that, so **${m} years** (after ${m - 1} years the ${ctx.unit} is ${money(round2(before))}, after ${m} it is ${money(round2(at))}).`,
  ].join("\n\n");
  return xmulti(
    {
      prompt: `${ctx.what} ${ctx.start} ${money(V)} and ${per}.`,
      explanation,
      params: { kind: "x-geo-growth", V, pct, down: ctx.down, k, T },
      hints: [
        `Multiplying by the same number each year makes a geometric sequence. The multiplier is r = ${ctx.down ? `1 - ${pct}/100` : `1 + ${pct}/100`}.`,
        `After t years the ${ctx.unit} is \`_V * _r^t\`. Use the power t itself (the starting ${ctx.unit} is year 0).`,
        `For the threshold, solve \`_V × r^t ${ctx.down ? "<" : ">"} ${T}\` with logs: t = log(${T} ÷ ${V}) ÷ log(r), then round up to a whole year.${ctx.down ? " log(r) is negative, which flips the inequality." : ""}`,
      ],
    },
    [
      xpart("after", `After ${k} years`, `The ${ctx.unit} after ${k} years, in £`, vk, "2dp", `Work out \`_V * _r^${k}\`. Round only at the end.`),
      xpart("years", "Years", `After how many whole years is the ${ctx.unit} first ${cmp} ${money(T)}?`, m, "whole", "Use `log(_T / _V) / log(_r)` and round up. Check the year before too."),
    ],
  );
}

// series / expert 0: how many terms give a stated sum -> quadratic in n, reject the negative root.
function xSeriesFindN(rng) {
  const a = rng.int(-20, 30);
  const d = rng.int(1, 9);
  const n = rng.int(6, 40);
  const S = (n * (2 * a + (n - 1) * d)) / 2;
  if (S <= 0) return null; // then the other root of the quadratic is negative
  const l = arithTerm(a, d, n);
  const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
  const B = 2 * a - d;
  const other = (-B - Math.sqrt(B * B + 8 * d * S)) / (2 * d);
  const explanation = [
    `Set \`S(n) = n/2 × (2a + (n - 1)d)\` equal to ${S} and multiply by 2: \`n(${2 * a} + ${d}(n - 1)) = ${2 * S}\`, which is \`${d}n² ${B < 0 ? "-" : "+"} ${Math.abs(B)}n - ${2 * S} = 0\`.`,
    [given("_a", a), given("_u2", terms[1]), given("_S", S), row("_d", "_u2 - _a", d), row("_n", "(-(2*_a - _d) + sqrt((2*_a - _d)^2 + 8*_d*_S)) / (2*_d)", `**${n}**`)].join("\n"),
    `The other root is ${show(Math.round(other * 100) / 100)}, which is negative, so it is rejected: a number of terms can't be negative.`,
    `The last term added is \`a + (n - 1)d\` = ${par(a)} + ${n - 1} × ${d} = ${final(l, "whole")}.`,
  ].join("\n\n");
  return xmulti(
    {
      prompt: `How many terms of the arithmetic series ${terms.map(par).join(" + ")} + … must be added to make a total of ${S}?`,
      explanation,
      params: { kind: "x-series-n", a, d, S },
      hints: [
        `Set \`S(n) = n/2 × (2a + (n - 1)d)\` equal to ${S}, with a = ${a} and d = ${par(terms[1])} - ${par(a)} = ${d}.`,
        `Multiply out to get a quadratic in n: \`${d}n² ${B < 0 ? "-" : "+"} ${Math.abs(B)}n - ${2 * S} = 0\`.`,
        `Solve it (formula or factorising). n must be a positive whole number, so reject the negative root.`,
      ],
    },
    [
      xpart("n", "Terms", "Number of terms n", n, "whole", "Use the quadratic formula on the quadratic in n and keep the positive root."),
      xpart("last", "Last term", "The last term added", l, "whole", "The last term is the nth term: `a + (n - 1) × d`."),
    ],
  );
}

const XPAY = [
  { who: "Sam's salary", start: "starts at", unit: "£", per: "year", lo: 18, hi: 45, scale: 1000, step: 1000 },
  { who: "A shop's yearly sales", start: "are", unit: "£", per: "year", lo: 40, hi: 200, scale: 1000, step: 1000 },
  { who: "A runner's weekly distance", start: "is", unit: "km", per: "week", lo: 8, hi: 30, scale: 1, step: 10 },
];
// series / expert 1: amounts growing by a percentage -> amount in period n, total, first period the total passes T.
function xSeriesGrowth(rng) {
  const ctx = rng.pick(XPAY);
  const A = rng.int(ctx.lo, ctx.hi) * ctx.scale;
  const pct = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15]);
  const n = rng.int(5, 15);
  const m = rng.int(4, 20);
  const frac = rng.int(2, 8) / 10;
  const r = 1 + pct / 100;
  const un = A * r ** (n - 1);
  const Sn = (A * (r ** n - 1)) / (r - 1);
  const Sb = (A * (r ** (m - 1) - 1)) / (r - 1);
  const Sm = (A * (r ** m - 1)) / (r - 1);
  const T = Math.round((Sb + frac * (Sm - Sb)) / ctx.step) * ctx.step;
  if (!(T > Sb && T < Sm) || isTie(un) || isTie(Sn)) return null;
  const amt = (v) => (ctx.unit === "£" ? money(v) : `${show(v)} km`);
  const P = ctx.per;
  const mReal = Math.log(1 + (T * (r - 1)) / A) / Math.log(r);
  const explanation = [
    `The amounts form a geometric sequence with a = ${A} and r = 1 + ${pct}/100 = ${show(r)}.`,
    [given("_A", A), given("_pct", pct), given("_n", n), given("_T", T), row("_r", "1 + _pct / 100", show(r)), row("_un", "_A * _r^(_n - 1)", final(un, "2dp")), row("_Sn", "_A * (_r^_n - 1) / (_r - 1)", final(Sn, "2dp"))].join("\n"),
    `For the running total, solve \`A(r^m - 1)/(r - 1) > T\`: \`r^m > 1 + T(r - 1)/A\`, so m > \`log(1 + _T * (_r - 1) / _A) / log(_r)\` = ${show(Math.round(mReal * 10000) / 10000)}. The total first passes ${amt(T)} in ${P} **${m}**.`,
  ].join("\n\n");
  return xmulti(
    {
      prompt: `${ctx.who} ${ctx.start} ${amt(A)} in the first ${P} and rises by ${pct}% each ${P} after that.`,
      explanation,
      params: { kind: "x-series-growth", A, pct, n, T },
      hints: [
        `Each ${P} is the previous one times r = 1 + ${pct}/100, so the amounts are a geometric sequence starting at ${amt(A)}.`,
        `The amount in ${P} n is \`_A * _r^(n - 1)\`; the total of the first n ${P}s is \`_A * (_r^n - 1) / (_r - 1)\`.`,
        `For when the total passes ${amt(T)}, set the sum formula greater than ${T} and rearrange to \`r^m > 1 + T(r - 1)/A\`, then use logs and round up.`,
      ],
    },
    [
      xpart("amount", `${P[0].toUpperCase()}${P.slice(1)} ${n}`, `The amount in ${P} ${n}${ctx.unit === "£" ? ", in £" : ", in km"}`, un, "2dp", `The power is ${n} - 1, because the first ${P} has no rise yet.`),
      xpart("total", "Total", `The total over the first ${n} ${P}s${ctx.unit === "£" ? ", in £" : ", in km"}`, Sn, "2dp", "Use the geometric sum with the power n, not n - 1. Round only at the end."),
      xpart("passes", "Passes", `In which ${P} does the running total first pass ${amt(T)}?`, m, "whole", "Solve with logs, round up, and check the totals either side."),
    ],
  );
}

const XINF_R = [[1, 4], [1, 5], [2, 5], [1, 3], [3, 4], [4, 5], [3, 5], [2, 3], [1, 10], [9, 10], [3, 10], [7, 10]];
// series / expert 2: sum to infinity and the 2nd term -> r (one of two roots), a, and a partial sum.
function xSeriesInfReverse(rng) {
  const [rn, rd] = rng.pick(XINF_R);
  const k = rng.int(1, 8);
  const n = rng.int(4, 8);
  const r = rn / rd;
  const S = k * rd * rd;
  const a = k * rd * (rd - rn);
  const u2 = k * rn * (rd - rn);
  const Sn = (a * (1 - r ** n)) / (1 - r);
  if (isTie(Sn) || isTie(r)) return null;
  const big = r > 0.5;
  const other = 1 - r;
  const explanation = [
    `Two facts: \`S = a / (1 - r)\`, so a = ${S}(1 - r), and the 2nd term is \`a × r = ${u2}\`.`,
    `Substitute: \`${S}r(1 - r) = ${u2}\`, i.e. \`${S}r² - ${S}r + ${u2} = 0\`. Its roots add to 1: r = ${show(Math.round(r * 10000) / 10000)} or r = ${show(Math.round(other * 10000) / 10000)}. The question says r ${big ? "> 0.5" : "< 0.5"}, so **r = ${rn}/${rd} ≈ ${fmtAns(r, "2dp")}**.`,
    [given("_S", S), given("_u2", u2), given("_n", n), row("_r", `${rn} / ${rd}`, show(Math.round(r * 10000) / 10000)), row("_a", "_S * (1 - _r)", `**${a}**`), row("_Sn", "_a * (1 - _r^_n) / (1 - _r)", final(Sn, "2dp"))].join("\n"),
  ].join("\n\n");
  return xmulti(
    {
      prompt: `An infinite geometric series has sum to infinity ${S}, and its 2nd term is ${u2}. Its common ratio r is ${big ? "greater" : "less"} than 0.5.`,
      explanation,
      params: { kind: "x-series-inf", S, u2, n, big },
      hints: [
        `Use both facts: \`S = a / (1 - r)\` gives a = ${S}(1 - r), and the 2nd term is \`a × r\`.`,
        `Substitute a: \`${S} × r × (1 - r) = ${u2}\`. Rearranged, that is the quadratic \`${S}r² - ${S}r + ${u2} = 0\`.`,
        `It has two roots, which add up to 1. Keep the one that is ${big ? "greater" : "less"} than 0.5, then find a = ${S}(1 - r).`,
      ],
    },
    [
      xpart("r", "Ratio", "Common ratio r", r, "2dp", "Solve the quadratic in r (the formula works) and pick the allowed root."),
      xpart("a", "First term", "First term a", a, "exact", `a = ${S} × (1 - r). Use r as an exact fraction, not the rounded decimal.`),
      xpart("sum", `First ${n} terms`, `Sum of the first ${n} terms`, Sn, "2dp", "Use `a × (1 - r^n) / (1 - r)` with the exact r. Round only at the end."),
    ],
  );
}

// series / expert 3: the sum of a block of terms (from term m to term M), as a list or in sigma form.
function xSeriesBlock(rng) {
  const sigma = rng.next() < 0.5;
  const a = rng.int(-20, 30);
  const d = nonZero(rng, -8, 12);
  const m = rng.int(5, 20);
  const M = m + rng.int(8, 30);
  const p = d; // sigma form: u(k) = p k + q
  const q = a - d;
  const count = M - m + 1;
  const first = arithTerm(a, d, m);
  const last = arithTerm(a, d, M);
  const sum = (count * (first + last)) / 2;
  const terms = [1, 2, 3, 4].map((i) => arithTerm(a, d, i));
  const expr = `${p === 1 ? "" : p === -1 ? "-" : p}k${q === 0 ? "" : q > 0 ? ` + ${q}` : ` - ${-q}`}`;
  const prompt = sigma
    ? `Find the sum of \`${expr}\` for every whole number k from ${m} to ${M} (that is, Σ from k = ${m} to ${M} of \`${expr}\`).`
    : `The arithmetic sequence ${listTerms(terms)} continues. Find the sum of the ${ordinal(m)} to the ${ordinal(M)} terms, inclusive.`;
  const lines = sigma
    ? [given("_m", m), given("_M", M), row("_count", "_M - _m + 1", count), row("_first", `${p} * _m + ${par(q)}`, first), row("_last", `${p} * _M + ${par(q)}`, last), row("_S", "_count * (_first + _last) / 2", final(sum, "whole"))]
    : [given("_a", a), given("_u2", terms[1]), given("_m", m), given("_M", M), row("_d", "_u2 - _a", d), row("_count", "_M - _m + 1", count), row("_first", "_a + (_m - 1) * _d", first), row("_last", "_a + (_M - 1) * _d", last), row("_S", "_count * (_first + _last) / 2", final(sum, "whole"))];
  const explanation = [
    sigma
      ? `Each value of k gives one term, and the terms go up by ${p} each time: an arithmetic series. Count the terms, find the first and last, then use \`S = count × (first + last) / 2\`.`
      : "Count the terms in the block, find its first and last terms, then use `S = count × (first + last) / 2`. (Or work out S(M) - S(m - 1).)",
    lines.join("\n"),
  ].join("\n\n");
  return xmulti(
    {
      prompt,
      explanation,
      params: { kind: "x-series-block", a, d, m, M },
      hints: [
        sigma
          ? `Substitute k = ${m}, ${m + 1}, ${m + 2}: the terms go up by the same amount each time, so this is an arithmetic series.`
          : `The block starts at the ${ordinal(m)} term, not the 1st. Find d = ${par(terms[1])} - ${par(a)} first.`,
        `The number of terms from ${m} to ${M} inclusive is ${M} - ${m} + 1 (both ends count).`,
        sigma
          ? `The first term uses k = ${m} and the last uses k = ${M}. Then \`S = count × (first + last) / 2\`.`
          : `First term of the block: \`a + (${m} - 1)d\`; last: \`a + (${M} - 1)d\`. Then \`S = count × (first + last) / 2\`.`,
      ],
    },
    [
      xpart("count", "Terms", "How many terms are added?", count, "whole", "Subtract the positions and add 1."),
      xpart("sum", "Sum", "The sum", sum, "whole", "Use count × (first + last) ÷ 2."),
    ],
  );
}

const XGENS = {
  arithmetic: [xArithAlg, xArithTermSum, xArithFirstNeg],
  geometric: [xGeoAlg, xGeoTwoBound, xGeoGrowth],
  series: [xSeriesFindN, xSeriesGrowth, xSeriesInfReverse, xSeriesBlock],
};

function genExpert(subtopic, rng) {
  const list = XGENS[subtopic];
  if (!list) throw new Error(`Unknown subtopic: ${subtopic}`);
  for (let t = 0; t < 200; t++) {
    GIVEN = [];
    const q = rng.pick(list)(rng);
    if (q) {
      const out = attachGiven(q);
      GIVEN = null;
      return out;
    }
  }
  GIVEN = null;
  throw new Error(`Could not build a ${subtopic}/expert question`);
}

const GENS = { arithmetic: genArithmetic, geometric: genGeometric, series: genSeries };

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
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
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, question, answer);

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

// ---------------------------------------------------------------------------------------------
// Expert verification. Each kind rebuilds every part's value without the generator's formulas:
// integer scans for unknowns, walking the sequence one term at a time, adding terms one by one,
// and bisection for ratios. Then each candidate part is compared in its own format.

const xnum = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));

// Root of f on [lo, hi] (f changes sign there) by bisection.
function bisect(f, lo, hi) {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

// The only integer in [-500, 500] that satisfies ok(x), or NaN (none, or more than one).
function onlyInt(ok) {
  let found = NaN;
  let count = 0;
  for (let x = -500; x <= 500; x++) if (ok(x)) {
    found = x;
    count++;
  }
  return count === 1 ? found : NaN;
}

function expertExpected(p) {
  switch (p.kind) {
    case "x-arith-alg": {
      const e = (m, c, x) => m * x + c;
      const x = onlyInt((t) => e(p.m2, p.c2, t) - e(p.m1, p.c1, t) === e(p.m3, p.c3, t) - e(p.m2, p.c2, t));
      if (!Number.isFinite(x)) return null;
      const t1 = e(p.m1, p.c1, x);
      const d = e(p.m2, p.c2, x) - t1;
      return { x: [x, "whole"], d: [d, "whole"], term: [walkArith(t1, d, p.n), "whole"] };
    }
    case "x-arith-termsum": {
      const ds = [];
      for (let d = -60; d <= 60; d++) {
        const a = p.up - (p.p - 1) * d;
        let s = 0;
        for (let i = 0, u = a; i < p.n; i++, u += d) s += u;
        if (s === p.S) ds.push(d);
      }
      if (ds.length !== 1) return null;
      const d = ds[0];
      let a = p.up;
      for (let i = p.p; i > 1; i--) a -= d;
      return { d: [d, "whole"], a: [a, "whole"], term: [walkArith(a, d, p.r), "whole"] };
    }
    case "x-arith-neg": {
      if (!(p.d < 0) || !(p.a > 0)) return null;
      let u = p.a;
      let s = 0;
      for (let n = 1; n <= 100000; n++, u += p.d) {
        if (u < 0) return { n: [n, "whole"], value: [u, "exact"], sum: [s, "exact"] };
        if (u > 0) s += u;
      }
      return null;
    }
    case "x-geo-alg": {
      const x = onlyInt((t) => t + p.a !== 0 && t + p.b !== 0 && (t + p.b) * (t + p.b) === (t + p.a) * (t + p.c));
      if (!Number.isFinite(x)) return null;
      const r = (x + p.b) / (x + p.a);
      if (Math.abs((x + p.c) / (x + p.b) - r) > 1e-12) return null;
      return { x: [x, "whole"], r: [r, "exact"], term: [walkGeo(x + p.a, r, p.n), "exact"] };
    }
    case "x-geo-bound": {
      const gap = p.q - p.p;
      if (!(p.up > 0 && p.uq > p.up)) return null;
      const r = bisect((t) => p.up * t ** gap - p.uq, 1, 100);
      let a = p.up;
      for (let i = p.p; i > 1; i--) a /= r;
      let u = a;
      let n = 1;
      while (u <= p.B && n < 10000) {
        u *= r;
        n++;
      }
      return { r: [r, "exact"], a: [a, "exact"], n: [n, "whole"] };
    }
    case "x-geo-growth": {
      const f = p.down ? 1 - p.pct / 100 : 1 + p.pct / 100;
      let v = p.V;
      let after = NaN;
      let years = NaN;
      for (let t = 1; t <= 1000; t++) {
        v *= f;
        if (t === p.k) after = v;
        if (Number.isNaN(years) && (p.down ? v < p.T : v > p.T)) years = t;
        if (t >= p.k && !Number.isNaN(years)) break;
      }
      return { after: [after, "2dp"], years: [years, "whole"] };
    }
    case "x-series-n": {
      let s = 0;
      let u = p.a;
      for (let n = 1; n <= 10000; n++, u += p.d) {
        s += u;
        if (s === p.S) return { n: [n, "whole"], last: [u, "whole"] };
      }
      return null;
    }
    case "x-series-growth": {
      const f = 1 + p.pct / 100;
      let u = p.A;
      let s = 0;
      let amount = NaN;
      let total = NaN;
      let passes = NaN;
      for (let m = 1; m <= 1000; m++, u *= f) {
        s += u;
        if (m === p.n) {
          amount = u;
          total = s;
        }
        if (Number.isNaN(passes) && s > p.T) passes = m;
        if (m >= p.n && !Number.isNaN(passes)) break;
      }
      return { amount: [amount, "2dp"], total: [total, "2dp"], passes: [passes, "whole"] };
    }
    case "x-series-inf": {
      if (!(p.S > 0 && p.u2 > 0 && p.u2 < p.S / 4)) return null;
      const f = (t) => p.S * t * (1 - t) - p.u2;
      const r = p.big ? bisect(f, 0.5, 1) : bisect(f, 0, 0.5);
      const a = p.S * (1 - r);
      let s = 0;
      for (let i = 0, u = a; i < p.n; i++, u *= r) s += u;
      return { r: [r, "2dp"], a: [a, "exact"], sum: [s, "2dp"] };
    }
    case "x-series-block": {
      let u = p.a;
      let s = 0;
      let count = 0;
      for (let k = 1; k <= p.M; k++, u += p.d) if (k >= p.m) {
        s += u;
        count++;
      }
      return { count: [count, "whole"], sum: [s, "whole"] };
    }
    default:
      return null;
  }
}

function verifyExpert(p, question, answer) {
  if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
  const want = expertExpected(p);
  if (!want) return false;
  const ids = Object.keys(want);
  if (question.parts.length !== ids.length || !question.parts.every((pt) => ids.includes(pt.id))) return false;
  return ids.every((id) => {
    const [v, fmt] = want[id];
    const x = xnum(answer[id]);
    if (!Number.isFinite(x) || !Number.isFinite(v)) return false;
    if (fmt === "2dp") return Math.abs(x - v) <= 0.005 + 1e-9;
    if (fmt === "whole") return Number.isInteger(x) && x === Math.round(v) && Math.abs(v - x) < 1e-9;
    return Math.abs(x - v) <= 1e-9 * Math.max(1, Math.abs(v));
  });
}
