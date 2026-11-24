// Ratios, proportion and percentages generator. Uses only the seeded rng passed in by the engine.
// Pure-math flavoured on purpose: no prices, profit or interest (those live in business-math).
// Each question's params.fmt says how the answer is given:
//   "whole"  a whole number, tolerance 0
//   "exact"  an exact decimal (at most 4 places), tolerance 0
//   "2dp"    rounded to 2 decimals, tolerance 0.005 (exact values sitting on a half are regenerated)
//   "ratio"  text like "3:4" or "2:3:5" in simplest whole numbers, no spaces
// Explanations list every step as a labelled calculator row, e.g. `_part = _total / _parts` → 12.

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
  exact: " Give the exact answer.",
  "2dp": " Round to 2 decimal places.",
};
const PCT = " Answer as a number without the % sign.";
const SIGNED = " Use a negative number for a decrease.";
const RATIO_NOTE = " Give your answer in simplest form with whole numbers, like 3:4 (no spaces).";
const RATIO3_NOTE = " Give your answer in simplest form with whole numbers, like 2:3:5 (no spaces).";

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

// Guided-mode hints: built only from values already drawn (never from rng), and never the answer.
const RND = (fmt) => (fmt === "2dp" ? " Round to 2 decimal places only at the end." : "");

// The value shown on the last row: "**48 kg**" or "12.3456, which rounds to **12.35 kg**".
function final(exact, fmt, unit = "") {
  const shown = fmtAns(exact, fmt);
  const u = !unit ? "" : unit === "%" ? "%" : ` ${unit}`;
  if (fmt !== "2dp" || Math.abs(exact - Number(shown)) < 1e-9) return `**${shown}${u}**`;
  return `${show(Math.round(exact * 10000) / 10000)}${u}, which rounds to **${shown}${u}**`;
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const gcdAll = (arr) => arr.reduce((g, x) => gcd(g, x), 0);

// Is the value representable within its format? (Whole for "whole", ≤ 4 decimals for "exact".)
function fitsFormat(exact, fmt) {
  if (!Number.isFinite(exact)) return false;
  if (fmt === "whole") return Number.isInteger(clean(exact));
  if (fmt === "exact") return Math.abs(clean(exact) * 10000 - Math.round(clean(exact) * 10000)) < 1e-6;
  if (fmt === "2dp") return !isTie(exact);
  return true;
}

const TOL = (fmt) => (fmt === "2dp" ? 0.005 : 0);

// 4 unique numeric choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// No option other than the answer lies within the tolerance of the exact value.
function buildChoices(exact, candidates, fmt, rng, { allowNeg = false, step } = {}) {
  const correctStr = fmtAns(exact, fmt);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (!allowNeg && v <= 0) return;
    if (fmt === "whole" && !Number.isInteger(clean(v))) return;
    if (fmt === "exact" && !fitsFormat(v, "exact")) return;
    if (Math.abs(v) > 1e9) return;
    const s = fmtAns(v, fmt);
    if (Math.abs(Number(s) - exact) <= TOL(fmt) + 1e-6) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  const st = step ?? (fmt === "whole" ? 1 : Math.max(0.01, Math.abs(exact) >= 10 ? 1 : 0.1));
  for (let k = 1; out.length < 3 && k < 1000; k++) {
    tryAdd(exact + k * st);
    tryAdd(exact - k * st);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Turn a solved question into a typed-number or (about 35%) multiple-choice question.
// Returns null when the value does not suit its format, so generate() draws again.
function finish(base, exact, fmt, candidates, rng, opts) {
  if (!fitsFormat(exact, fmt)) return null;
  const q = { ...base, tolerance: TOL(fmt), params: { ...base.params, fmt } };
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, fmt, rng, opts);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: fmt === "2dp" ? round2(exact) : clean(exact), answerType: "number", choices: undefined };
}

// Ratio answers are text ("3:4"); distractors are strings from common mistakes.
function finishRatio(base, answer, candidates, rng) {
  const q = { ...base, tolerance: 0, params: { ...base.params, fmt: "ratio" } };
  if (rng.next() < 0.35) {
    const seen = new Set([answer]);
    const out = [];
    for (const c of candidates) {
      if (out.length >= 3) break;
      if (!/^\d+(:\d+){1,2}$/.test(c) || /(^|:)0(:|$)/.test(c) || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    const nums = answer.split(":").map(Number);
    for (let k = 1; out.length < 3 && k < 50; k++) {
      for (let i = 0; i < nums.length && out.length < 3; i++) {
        const alt = nums.slice();
        alt[i] += k;
        const s = alt.join(":");
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    return { ...q, prompt: base.prompt + " Choose the ratio in simplest form.", answer, answerType: "choice", choices: rng.shuffle([answer, ...out]) };
  }
  const note = answer.split(":").length === 3 ? RATIO3_NOTE : RATIO_NOTE;
  return { ...q, prompt: base.prompt + note, answer, answerType: "text", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// Two different coprime whole numbers in [lo, hi].
function coprimePair(rng, lo, hi) {
  let a, b;
  do {
    a = rng.int(lo, hi);
    b = rng.int(lo, hi);
  } while (a === b || gcd(a, b) !== 1);
  return [a, b];
}

const ratioStr = (arr) => arr.join(":");
function reduced(arr) {
  const g = gcdAll(arr) || 1;
  return arr.map((x) => x / g);
}

// ---------------------------------------------------------------------------------------------
// Ratios

const PAIRS = [
  ["red beads", "blue beads"],
  ["boys", "girls"],
  ["oak trees", "pine trees"],
  ["white tiles", "black tiles"],
  ["fiction books", "non-fiction books"],
];

const UNIT_PAIRS = [
  { small: "cm", big: "m", f: 100 },
  { small: "mm", big: "cm", f: 10 },
  { small: "g", big: "kg", f: 1000 },
  { small: "mL", big: "L", f: 1000 },
  { small: "minutes", big: "hours", f: 60 },
  { small: "seconds", big: "minutes", f: 60 },
];

function genRatios(difficulty, rng) {
  const kinds = {
    easy: ["simplify", "share", "part"],
    medium: ["simplify-units", "simplify-decimal", "share3", "map", "one-to-n"],
    hard: ["share-diff", "combine", "similar", "one-to-n", "share3"],
  }[difficulty];
  const kind = rng.pick(kinds);

  if (kind === "simplify") {
    const [a, b] = coprimePair(rng, 1, 12);
    const k = rng.int(2, 12);
    const x = a * k;
    const y = b * k;
    const f = [2, 3, 5].find((p) => k % p === 0 && k !== p);
    const base = {
      prompt: `Simplify the ratio \`${x}:${y}\`.`,
      explanation: [
        `Divide both numbers by their greatest common factor, ${k}.`,
        [given("_x", x), given("_y", y), fact("_g", k), row("_a", "_x / _g", a), row("_b", "_y / _g", b)].join("\n"),
        `So \`${x}:${y} = ${a}:${b}\`; the answer is **${a}:${b}**.`,
      ].join("\n\n"),
      params: { kind: "simplify", parts: [x, y] },
      hints: [
        `Find the greatest common factor of ${x} and ${y}: the biggest number that divides both exactly.`,
        `The greatest common factor is ${k}. Divide both parts by it: \`_x / ${k}\` and \`_y / ${k}\`, then write the results with a colon.`,
      ],
    };
    const cands = [`${b}:${a}`, f ? `${x / f}:${y / f}` : `${a}:${a + b}`, `${a}:${a + b}`, `${a + 1}:${b}`];
    return finishRatio(base, `${a}:${b}`, cands, rng);
  }

  if (kind === "simplify-units") {
    const U = rng.pick(UNIT_PAIRS);
    for (let t = 0; t < 200; t++) {
      const big = rng.int(1, 9);
      const small = U.f === 60 ? rng.int(2, 59) : U.f === 10 ? rng.int(2, 99) : rng.int(1, 19) * (U.f / 20);
      const y = big * U.f;
      if (small === y || gcd(small, y) === 1) continue;
      const [a, b] = reduced([small, y]);
      if (a > 200 || b > 200) continue;
      const base = {
        prompt: `Simplify the ratio ${small} ${U.small} : ${big} ${U.big}.`,
        explanation: [
          `Put both amounts in the same unit first: ${big} ${U.big} = ${y} ${U.small}.`,
          [given("_x", small), given("_big", big), row("_y", `_big * ${U.f}`, y), `- divide both by their greatest common factor, ${gcd(small, y)}`].join("\n"),
          `So the ratio is \`${small}:${y} = ${a}:${b}\`; the answer is **${a}:${b}**.`,
        ].join("\n\n"),
        params: { kind: "simplify", parts: [small, y] },
        hints: [
          `A ratio needs both amounts in the same unit. Change ${big} ${U.big} into ${U.small} (1 ${U.big.replace(/s$/, "")} = ${U.f} ${U.small}).`,
          `${big} ${U.big} = ${big} × ${U.f} = ${y} ${U.small}, so the ratio is \`${small}:${y}\`.`,
          `Now simplify \`${small}:${y}\`: divide both parts by their greatest common factor, ${gcd(small, y)}.`,
        ],
      };
      const [c, d] = reduced([small, big]);
      return finishRatio(base, `${a}:${b}`, [`${c}:${d}`, `${b}:${a}`, `${small}:${big}`, `${a}:${a + b}`], rng);
    }
    return null;
  }

  if (kind === "simplify-decimal") {
    const [a, b] = coprimePair(rng, 1, 12);
    const k = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]);
    const x = (a * k) / 10;
    const y = (b * k) / 10;
    if (Number.isInteger(x) && Number.isInteger(y)) return null;
    const base = {
      prompt: `Simplify the ratio \`${show(x)}:${show(y)}\`.`,
      explanation: [
        `Multiply both parts by 10 to clear the decimals, then divide by the greatest common factor.`,
        [given("_x", x), given("_y", y), row("_x10", "_x * 10", a * k), row("_y10", "_y * 10", b * k)].join("\n"),
        `Both are multiples of ${k}, so \`${a * k}:${b * k} = ${a}:${b}\`; the answer is **${a}:${b}**.`,
      ].join("\n\n"),
      params: { kind: "simplify", parts: [x, y] },
      hints: [
        `Clear the decimals first: multiply both parts by 10, which keeps the ratio the same.`,
        `\`${show(x)}:${show(y)}\` becomes \`${a * k}:${b * k}\`. Both numbers are multiples of ${k}: divide both by ${k}.`,
      ],
    };
    return finishRatio(base, `${a}:${b}`, [`${a * k}:${b * k}`, `${b}:${a}`, `${a}:${a + b}`, `${a + 1}:${b}`], rng);
  }

  if (kind === "combine") {
    let p, q, r, s;
    do {
      [p, q] = coprimePair(rng, 1, 9);
      [r, s] = coprimePair(rng, 1, 9);
    } while (q === r);
    const [A, B, C] = reduced([p * r, q * r, q * s]);
    const base = {
      prompt: `The ratio a:b is \`${p}:${q}\` and the ratio b:c is \`${r}:${s}\`. Find the ratio a:b:c.`,
      explanation: [
        `Make the b parts match: scale the first ratio by ${r} and the second by ${q}, so b = ${q * r} in both.`,
        [given("_p", p), given("_q", q), given("_r", r), given("_s", s), row("_a", "_p * _r", p * r), row("_b", "_q * _r", q * r), row("_c", "_q * _s", q * s)].join("\n"),
        `So a:b:c = \`${p * r}:${q * r}:${q * s}\`, which simplifies to **${A}:${B}:${C}**.`,
      ].join("\n\n"),
      params: { kind: "combine", p, q, r, s },
      hints: [
        `b appears in both ratios. Scale them so b is the same number in each.`,
        `b is ${q} in the first ratio and ${r} in the second. Multiply the first ratio by ${r} and the second by ${q}, so b = ${q * r} in both.`,
        `Now a = ${p} × ${r}, b = ${q * r} and c = ${q} × ${s}. Write them as a:b:c and simplify if all three share a factor.`,
      ],
    };
    return finishRatio(base, `${A}:${B}:${C}`, [`${p}:${q}:${s}`, `${p}:${q * r}:${s}`, `${C}:${B}:${A}`, `${p * r}:${q * s}:${q * r}`].map((t) => ratioStr(reduced(t.split(":").map(Number)))), rng);
  }

  if (kind === "share" || kind === "share3") {
    const three = kind === "share3";
    let parts;
    do {
      parts = three ? [rng.int(1, 9), rng.int(1, 9), rng.int(1, 9)] : coprimePair(rng, 1, 9);
    } while (gcdAll(parts) !== 1 || new Set(parts).size !== parts.length);
    const unit = three ? rng.int(3, difficulty === "hard" ? 60 : 25) : rng.int(2, 20);
    const P = parts.reduce((s, x) => s + x, 0);
    const total = unit * P;
    const want = rng.pick(["largest", "smallest"]);
    const pick = want === "largest" ? Math.max(...parts) : Math.min(...parts);
    const exact = unit * pick;
    const rs = ratioStr(parts);
    const base = {
      prompt: `Divide ${total} in the ratio \`${rs}\`. What is the ${want} share?${NOTE.whole}`,
      explanation: [
        `Add the parts, find the value of one part, then multiply.`,
        [given("_total", total), ...parts.map((x, i) => given(`_p${i + 1}`, x)), row("_parts", parts.map((_, i) => `_p${i + 1}`).join(" + "), P), row("_one", "_total / _parts", unit), row("_share", `_one * _p${parts.indexOf(pick) + 1}`, final(exact, "whole"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "share", parts, total, pick },
      hints: [
        `Add up the parts of the ratio: ${parts.join(" + ")} = ${P} parts in total.`,
        pick === 1
          ? `Find the value of one part: \`_one = _total / _parts\`, that is ${total} ÷ ${P}.`
          : `One part is worth ${total} ÷ ${P} = ${unit} (\`_one = _total / _parts\`).`,
        `The ${want} share is ${pick} part${pick === 1 ? "" : "s"}: multiply \`_one\` by ${pick}.`,
      ],
    };
    const other = want === "largest" ? Math.min(...parts) : Math.max(...parts);
    return finish(base, exact, "whole", [unit, total - exact, unit * other, total / parts.length, total * pick / 10], rng);
  }

  if (kind === "part") {
    const [a, b] = coprimePair(rng, 1, 9);
    const [x, y] = rng.pick(PAIRS);
    const unit = rng.int(2, 15);
    const known = a * unit;
    const askTotal = rng.next() < 0.4;
    const exact = askTotal ? unit * (a + b) : unit * b;
    const base = {
      prompt: `The ratio of ${x} to ${y} is \`${a}:${b}\`. There are ${known} ${x}. ${askTotal ? `How many ${x} and ${y} are there altogether?` : `How many ${y} are there?`}${NOTE.whole}`,
      explanation: [
        `${a} parts are ${known}, so one part is ${known} ÷ ${a}.`,
        [given("_a", a), given("_b", b), given("_known", known), row("_one", "_known / _a", unit), askTotal ? row("_total", "_one * (_a + _b)", final(exact, "whole")) : row("_other", "_one * _b", final(exact, "whole"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "part", a, b, known, askTotal },
      hints: [
        `The ${x} are ${a} part${a === 1 ? "" : "s"} of the ratio, and there are ${known} of them. Find what one part is worth.`,
        exact === unit
          ? `One part: \`_one = _known / _a\`, that is ${known} ÷ ${a}.`
          : `One part is ${known} ÷ ${a} = ${unit} (\`_one = _known / _a\`).`,
        askTotal
          ? `Altogether there are ${a} + ${b} = ${a + b} parts: multiply one part by ${a + b}.`
          : `The ${y} are ${b} part${b === 1 ? "" : "s"}: multiply one part by ${b}.`,
      ],
    };
    return finish(base, exact, "whole", askTotal ? [known + b, unit * b, known * b, known + unit * b + unit] : [known * b, known + b, (known * a) / b, unit * (a + b)], rng);
  }

  if (kind === "share-diff") {
    const [a, b] = coprimePair(rng, 1, 12);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const unit = rng.int(3, 40);
    const diff = unit * (hi - lo);
    const askTotal = rng.next() < 0.5;
    const exact = askTotal ? unit * (lo + hi) : unit * lo;
    const base = {
      prompt: `Two numbers are in the ratio \`${lo}:${hi}\`. The larger number is ${diff} more than the smaller one. ${askTotal ? "What is the sum of the two numbers?" : "What is the smaller number?"}${NOTE.whole}`,
      explanation: [
        `The difference is ${hi} - ${lo} = ${hi - lo} parts, so one part is ${diff} ÷ ${hi - lo}.`,
        [given("_lo", lo), given("_hi", hi), given("_diff", diff), row("_one", "_diff / (_hi - _lo)", unit), askTotal ? row("_sum", "_one * (_lo + _hi)", final(exact, "whole")) : row("_small", "_one * _lo", final(exact, "whole"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "share-diff", lo, hi, diff, askTotal },
      hints: [
        `The difference between the numbers is ${hi} - ${lo} = ${hi - lo} part${hi - lo === 1 ? "" : "s"} of the ratio, and that is worth ${diff}.`,
        exact === unit
          ? `One part: \`_one = _diff / (_hi - _lo)\`, that is ${diff} ÷ ${hi - lo}.`
          : `One part is ${diff} ÷ ${hi - lo} = ${unit} (\`_one = _diff / (_hi - _lo)\`).`,
        askTotal
          ? `The sum is ${lo} + ${hi} = ${lo + hi} parts: multiply one part by ${lo + hi}.`
          : `The smaller number is ${lo} part${lo === 1 ? "" : "s"}: multiply one part by ${lo}.`,
      ],
    };
    return finish(base, exact, "whole", [diff * lo, diff * (lo + hi), unit * hi, diff / (lo + hi) * lo, unit * (hi - lo)], rng);
  }

  if (kind === "map") {
    const scale = rng.pick([10000, 20000, 25000, 50000, 100000, 200000]);
    const toReal = rng.next() < 0.6;
    if (toReal) {
      const cm = rng.int(10, 200) / 10;
      const exact = (cm * scale) / 100000;
      const base = {
        prompt: `A map has a scale of \`1:${scale}\`. Two points are ${show(cm)} cm apart on the map. How far apart are they in real life, in km?${NOTE.exact}`,
        explanation: [
          `Multiply by the scale to get real centimetres, then divide by 100 000 (100 cm in a metre, 1000 m in a km).`,
          [given("_scale", scale), given("_map_cm", cm), row("_real_cm", "_map_cm * _scale", show(cm * scale)), row("_km", "_real_cm / 100000", final(exact, "exact", "km"))].join("\n"),
        ].join("\n\n"),
        params: { kind: "map", scale, cm, toReal },
        hints: [
          `A scale of \`1:${scale}\` means 1 cm on the map is ${scale} cm in real life.`,
          `Real distance in cm: \`_real_cm = _map_cm * _scale\` = ${show(cm)} × ${scale} = ${show(cm * scale)} cm.`,
          `Change cm to km by dividing by 100 000 (100 cm in a metre, 1000 m in a km).`,
        ],
      };
      return finish(base, exact, "exact", [exact * 10, exact / 10, (cm * scale) / 1000, (cm * scale) / 100], rng);
    }
    const km = rng.int(2, 60) * (scale / 20000) * rng.pick([0.5, 1, 1.5]);
    const exact = (km * 100000) / scale;
    if (!fitsFormat(km, "exact") || exact < 0.5 || exact > 50) return null;
    const base = {
      prompt: `A map has a scale of \`1:${scale}\`. Two towns are ${show(km)} km apart in real life. How far apart are they on the map, in cm?${NOTE.exact}`,
      explanation: [
        `Turn km into cm (× 100 000), then divide by the scale.`,
        [given("_scale", scale), given("_km", km), row("_real_cm", "_km * 100000", show(km * 100000)), row("_map_cm", "_real_cm / _scale", final(exact, "exact", "cm"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "map", scale, km, toReal },
      hints: [
        `Work in centimetres: a scale of \`1:${scale}\` means 1 cm on the map is ${scale} cm in real life.`,
        `${show(km)} km × 100 000 = ${show(km * 100000)} cm in real life (\`_real_cm = _km * 100000\`).`,
        `Divide the real distance in cm by the scale, ${scale}.`,
      ],
    };
    return finish(base, exact, "exact", [exact * 10, exact / 10, km * scale / 100000, exact * 100], rng);
  }

  if (kind === "one-to-n") {
    let a, b;
    do {
      a = rng.int(2, difficulty === "hard" ? 40 : 20);
      b = rng.int(a + 1, difficulty === "hard" ? 150 : 60);
    } while (b % a === 0);
    const flip = difficulty === "hard" && rng.next() < 0.5;
    const exact = flip ? a / b : b / a;
    const base = {
      prompt: flip
        ? `Write the ratio \`${a}:${b}\` in the form \`n:1\`. What is n?${NOTE["2dp"]}`
        : `Write the ratio \`${a}:${b}\` in the form \`1:n\`. What is n?${NOTE["2dp"]}`,
      explanation: flip
        ? `Divide both parts by ${b}, the second part.\n\n${[given("_a", a), given("_b", b), row("_n", "_a / _b", final(exact, "2dp"))].join("\n")}`
        : `Divide both parts by ${a}, the first part.\n\n${[given("_a", a), given("_b", b), row("_n", "_b / _a", final(exact, "2dp"))].join("\n")}`,
      params: { kind: "one-to-n", a, b, flip },
      hints: flip
        ? [`In \`n:1\` the second part is 1, so divide both parts by the second part, ${b}.`, `n = ${a} ÷ ${b} (\`_a / _b\`).${RND("2dp")}`]
        : [`In \`1:n\` the first part is 1, so divide both parts by the first part, ${a}.`, `n = ${b} ÷ ${a} (\`_b / _a\`).${RND("2dp")}`],
    };
    return finish(base, exact, "2dp", [1 / exact, b - a, exact + 1, a / (a + b), b / (a + b)], rng);
  }

  // similar shapes: area or volume scale factor
  const [a, b] = coprimePair(rng, 1, 7);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const vol = rng.next() < 0.4;
  const p = vol ? 3 : 2;
  const m = rng.int(1, vol ? 6 : 12);
  const smallQ = lo ** p * m;
  const bigQ = hi ** p * m;
  const up = rng.next() < 0.6;
  const what = vol ? "volume" : "area";
  const unit = vol ? "cm³" : "cm²";
  const exact = up ? bigQ : smallQ;
  const base = {
    prompt: `Two similar solids have lengths in the ratio \`${lo}:${hi}\`. The ${up ? "smaller" : "larger"} one has a${vol ? " volume" : " surface area"} of ${up ? smallQ : bigQ} ${unit}. What is the ${what === "area" ? "surface area" : "volume"} of the ${up ? "larger" : "smaller"} one, in ${unit}?${NOTE.whole}`,
    explanation: [
      `Lengths scale by ${hi}/${lo}, so ${vol ? "volumes" : "areas"} scale by (${hi}/${lo})^${p}.`,
      [given("_lo", lo), given("_hi", hi), given("_known", up ? smallQ : bigQ), row("_k", `(${up ? "_hi / _lo" : "_lo / _hi"})^${p}`, show(up ? (hi / lo) ** p : (lo / hi) ** p)), row("_answer", "_known * _k", final(exact, "whole", unit))].join("\n"),
    ].join("\n\n"),
    params: { kind: "similar", lo, hi, p, known: up ? smallQ : bigQ, up },
    hints: [
      `Lengths scale by ${hi}/${lo}. ${vol ? "Volumes scale by the length factor cubed" : "Areas scale by the length factor squared"}, not by the length factor itself.`,
      `Going from the ${up ? "smaller" : "larger"} solid to the ${up ? "larger" : "smaller"} one, the ${what} factor is \`(${up ? `${hi}/${lo}` : `${lo}/${hi}`})^${p}\` = ${show(up ? (hi / lo) ** p : (lo / hi) ** p)}.`,
      `Multiply the known ${what === "area" ? "surface area" : "volume"}, ${up ? smallQ : bigQ} ${unit}, by that factor.`,
    ],
  };
  const k1 = up ? hi / lo : lo / hi;
  const known = up ? smallQ : bigQ;
  return finish(base, exact, "whole", [known * k1, known * k1 ** (vol ? 2 : 3), known * k1 ** (vol ? 1 : 1) * 2, known + (hi - lo)], rng);
}

// ---------------------------------------------------------------------------------------------
// Proportion

const DIRECT = [
  { q: (n, v) => `${n} identical boxes weigh ${v} kg.`, ask: (n) => `How much do ${n} of these boxes weigh, in kg?`, unit: "kg", per: "kg per box" },
  { q: (n, v) => `A printer prints ${v} pages in ${n} minutes.`, ask: (n) => `At the same rate, how many pages does it print in ${n} minutes?`, unit: "pages", per: "pages per minute" },
  { q: (n, v) => `A cyclist riding at a steady speed covers ${v} km in ${n} hours.`, ask: (n) => `How far does the cyclist ride in ${n} hours, in km?`, unit: "km", per: "km per hour" },
  { q: (n, v) => `A tap fills ${v} litres in ${n} minutes.`, ask: (n) => `How many litres does it fill in ${n} minutes?`, unit: "litres", per: "litres per minute" },
  { q: (n, v) => `A recipe for ${n} people uses ${v} g of flour.`, ask: (n) => `How much flour is needed for ${n} people, in g?`, unit: "g", per: "g per person" },
];

const RATE = [
  { q: (n, v) => `A tap fills ${v} litres in ${n} minutes.`, ask: "What is its rate, in litres per minute?", unit: "litres per minute" },
  { q: (n, v) => `A car travels ${v} km on ${n} litres of fuel.`, ask: "How many km does it travel per litre?", unit: "km per litre" },
  { q: (n, v) => `A runner covers ${v} metres in ${n} seconds.`, ask: "What is the runner's average speed, in metres per second?", unit: "m/s" },
  { q: (n, v) => `A machine makes ${v} bolts in ${n} hours.`, ask: "How many bolts does it make per hour?", unit: "bolts per hour" },
];

const INVERSE = [
  { q: (n, t) => `${n} identical pumps empty a tank in ${t} hours.`, ask: (n) => `How long would ${n} of these pumps take, in hours?`, unit: "hours" },
  { q: (n, t) => `${n} workers, all working at the same rate, build a wall in ${t} days.`, ask: (n) => `How long would ${n} workers take, in days?`, unit: "days" },
  { q: (n, t) => `At a steady ${n} km/h, a journey takes ${t} hours.`, ask: (n) => `How long does the same journey take at ${n} km/h, in hours?`, unit: "hours" },
];

function genProportion(difficulty, rng) {
  const kinds = {
    easy: ["direct", "rate", "inverse"],
    medium: ["direct", "rate", "inverse"],
    hard: ["power", "power", "power-inv", "power-pct"],
  }[difficulty];
  const kind = rng.pick(kinds);
  const easy = difficulty === "easy";
  const fmt = easy ? "whole" : "2dp";

  if (kind === "direct") {
    const C = rng.pick(DIRECT);
    const n1 = rng.int(2, easy ? 9 : 15);
    let n2;
    do {
      n2 = rng.int(2, easy ? 12 : 30);
    } while (n2 === n1);
    const v1 = easy ? n1 * rng.int(2, 30) : rng.int(5, 500);
    const exact = (v1 * n2) / n1;
    const base = {
      prompt: `${C.q(n1, v1)} ${C.ask(n2)}${NOTE[fmt]}`,
      explanation: [
        `Find the amount for one, then scale up (direct proportion).`,
        [given("_n1", n1), given("_v1", v1), given("_n2", n2), row("_one", "_v1 / _n1", show(Math.round((v1 / n1) * 10000) / 10000)), row("_answer", "_one * _n2", final(exact, fmt, C.unit === "pages" ? "" : C.unit))].join("\n"),
      ].join("\n\n"),
      params: { kind: "direct", n1, v1, n2 },
      hints: [
        `This is direct proportion: twice as many means twice as much. Find the amount for one first.`,
        `For one: \`_one = _v1 / _n1\` = ${v1} ÷ ${n1} (${C.per}). Keep the unrounded value.`,
        `Multiply the amount for one by ${n2}.${RND(fmt)}`,
      ],
    };
    return finish(base, exact, fmt, [(v1 * n1) / n2, v1 + n2 - n1, v1 * n2, v1 / n1], rng);
  }

  if (kind === "rate") {
    const C = rng.pick(RATE);
    const n = rng.int(easy ? 2 : 3, easy ? 12 : 40);
    const v = easy ? n * rng.int(2, 40) : rng.int(20, 900);
    const exact = v / n;
    const base = {
      prompt: `${C.q(n, v)} ${C.ask}${NOTE[fmt]}`,
      explanation: `A rate is "per one": divide the amount by the number of units.\n\n${[given("_amount", v), given("_units", n), row("_rate", "_amount / _units", final(exact, fmt, C.unit))].join("\n")}`,
      params: { kind: "rate", n, v },
      hints: [
        `A rate is an amount "per one" unit, so divide the amount by the number of units (not the other way round).`,
        `Work out ${v} ÷ ${n} (\`_amount / _units\`).${RND(fmt)}`,
      ],
    };
    return finish(base, exact, fmt, [n / v, v * n, v - n, v / (n + 1)], rng);
  }

  if (kind === "inverse") {
    const C = rng.pick(INVERSE);
    let n1, n2, t1;
    for (;;) {
      n1 = rng.int(2, easy ? 12 : 20);
      n2 = rng.int(2, easy ? 12 : 20);
      t1 = rng.int(2, easy ? 30 : 60);
      if (C.unit === "hours" && C.q(1, 1).startsWith("At")) {
        n1 = rng.int(4, 12) * 10;
        n2 = rng.int(4, 12) * 10;
        t1 = rng.int(1, 8);
      }
      if (n1 === n2) continue;
      if (easy && (n1 * t1) % n2 !== 0) continue;
      break;
    }
    const exact = (n1 * t1) / n2;
    const base = {
      prompt: `${C.q(n1, t1)} ${C.ask(n2)}${NOTE[fmt]}`,
      explanation: [
        `This is inverse proportion: the product stays the same, so find the total "work", then share it.`,
        [given("_n1", n1), given("_t1", t1), given("_n2", n2), row("_work", "_n1 * _t1", n1 * t1), row("_t2", "_work / _n2", final(exact, fmt, C.unit))].join("\n"),
      ].join("\n\n"),
      params: { kind: "inverse", n1, t1, n2 },
      hints: [
        `This is inverse proportion: more ${C.q(1, 1).startsWith("At") ? "speed" : "of them"} means less time, so the product stays the same.`,
        `Total "work": \`_work = _n1 * _t1\` = ${n1} × ${t1} = ${n1 * t1}.`,
        `Share that between ${n2}: divide ${n1 * t1} by ${n2}.${RND(fmt)}`,
      ],
    };
    return finish(base, exact, fmt, [(t1 * n2) / n1, t1 + n1 - n2, n1 * t1, t1], rng);
  }

  if (kind === "power" || kind === "power-inv") {
    // y = k·x^p
    const law = rng.pick(
      kind === "power"
        ? [
            { p: 2, words: "directly proportional to x²" },
            { p: 3, words: "directly proportional to x³" },
            { p: 0.5, words: "directly proportional to √x" },
          ]
        : [
            { p: -1, words: "inversely proportional to x" },
            { p: -2, words: "inversely proportional to x²" },
          ]
    );
    const p = law.p;
    let x1, x2;
    if (p === 0.5) {
      x1 = rng.int(2, 12) ** 2;
      x2 = rng.int(2, 60);
    } else {
      x1 = rng.int(2, 10);
      x2 = rng.int(2, 15);
    }
    if (x1 === x2) return null;
    const k = rng.int(1, 9) * (p < 0 ? 10 : 1);
    const y1 = k * x1 ** p;
    if (!Number.isInteger(y1) && !fitsFormat(y1, "exact")) return null;
    const findX = p === 2 && rng.next() < 0.35;
    if (findX) {
      // y = k x², find positive x for a given y
      const y2 = rng.int(5, 400);
      const exact = Math.sqrt(y2 / k);
      const base = {
        prompt: `y is ${law.words}. When x = ${x1}, y = ${show(y1)}. Find the positive value of x when y = ${y2}.${NOTE["2dp"]}`,
        explanation: [
          `Write y = k·x², find k, then rearrange to x = √(y / k).`,
          [given("_x1", x1), given("_y1", y1), given("_y2", y2), row("_k", "_y1 / _x1^2", show(k)), row("_x", "sqrt(_y2 / _k)", final(exact, "2dp"))].join("\n"),
        ].join("\n\n"),
        params: { kind: "power-x", p, x1, y1, y2 },
        hints: [
          `Write y = k·x² and use the known pair to find k.`,
          `k = y ÷ x² = ${show(y1)} ÷ ${x1}² = ${show(k)}.`,
          `Rearrange to x = √(y / k) and put in y = ${y2}: \`sqrt(_y2 / _k)\`.${RND("2dp")}`,
        ],
      };
      return finish(base, exact, "2dp", [y2 / k, y2 / x1, Math.sqrt(y2 / x1), (y2 * x1) / y1], rng);
    }
    const exact = k * x2 ** p;
    const pw = p === 0.5 ? "sqrt(_x1)" : `_x1^${p < 0 ? -p : p}`;
    const pw2 = p === 0.5 ? "sqrt(_x2)" : `_x2^${p < 0 ? -p : p}`;
    const base = {
      prompt: `y is ${law.words}. When x = ${x1}, y = ${show(y1)}. Find y when x = ${x2}.${NOTE["2dp"]}`,
      explanation: [
        p < 0 ? `Write y = k / x${p === -2 ? "²" : ""}, find k from the known pair, then substitute.` : `Write y = k·x${p === 2 ? "²" : p === 3 ? "³" : "^0.5"}, find k from the known pair, then substitute.`,
        [given("_x1", x1), given("_y1", y1), given("_x2", x2), row("_k", p < 0 ? `_y1 * ${pw}` : `_y1 / ${pw}`, show(k)), row("_y", p < 0 ? `_k / ${pw2}` : `_k * ${pw2}`, final(exact, "2dp"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "power", p, x1, y1, x2 },
      hints: [
        p < 0
          ? `Write y = k / x${p === -2 ? "²" : ""} and use the known pair to find k.`
          : `Write y = k·x${p === 2 ? "²" : p === 3 ? "³" : "^0.5 (that is, k·√x)"} and use the known pair to find k.`,
        p < 0
          ? `k = y × x${p === -2 ? "²" : ""} = ${show(y1)} × ${x1}${p === -2 ? "²" : ""} = ${show(k)}.`
          : `k = y ÷ ${p === 0.5 ? "√x" : `x${p === 2 ? "²" : "³"}`} = ${show(y1)} ÷ ${p === 0.5 ? `√${x1}` : `${x1}${p === 2 ? "²" : "³"}`} = ${show(k)}.`,
        `Substitute x = ${x2}: \`${p < 0 ? `_k / ${pw2}` : `_k * ${pw2}`}\`.${RND("2dp")}`,
      ],
    };
    return finish(base, exact, "2dp", [(y1 * x2) / x1, (y1 * x1) / x2, k * x2 ** -p, y1 * (x2 / x1) ** (p * 2), k * x2], rng);
  }

  // power-pct: percentage change in y when x changes
  const law = rng.pick([
    { p: 2, words: "directly proportional to x²" },
    { p: 3, words: "directly proportional to x³" },
    { p: -1, words: "inversely proportional to x" },
    { p: -2, words: "inversely proportional to x²" },
  ]);
  const pct = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100]);
  const factor = (1 + pct / 100) ** law.p;
  const exact = Math.abs(factor - 1) * 100;
  const dir = factor > 1 ? "increase" : "decrease";
  const base = {
    prompt: `y is ${law.words}. x increases by ${pct}%. By what percentage does y ${dir}?${PCT}${NOTE["2dp"]}`,
    explanation: [
      `x is multiplied by ${show(1 + pct / 100)}, so y is multiplied by ${show(1 + pct / 100)}^${law.p}.`,
      [given("_pct", pct), row("_m", "1 + _pct / 100", show(1 + pct / 100)), row("_factor", `_m^${law.p < 0 ? `(${law.p})` : law.p}`, show(Math.round(factor * 1e6) / 1e6)), row("_change", factor > 1 ? "(_factor - 1) * 100" : "(1 - _factor) * 100", final(exact, "2dp", "%"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "power-pct", p: law.p, pct },
    hints: [
      `Work with multipliers, not with the percentage itself: x is multiplied by 1 + ${pct}/100 = ${show(1 + pct / 100)}.`,
      `y is ${law.words.replace(/ to x.*$/, "")} to x${law.p === 2 || law.p === -2 ? "²" : law.p === 3 ? "³" : ""}, so y is multiplied by \`${show(1 + pct / 100)}^${law.p < 0 ? `(${law.p})` : law.p}\`.`,
      `The percentage change is the gap between that factor and 1, times 100: \`${factor > 1 ? "(_factor - 1) * 100" : "(1 - _factor) * 100"}\`.${RND("2dp")}`,
    ],
  };
  return finish(base, exact, "2dp", [pct * Math.abs(law.p), pct, factor * 100, Math.abs((1 + pct / 100) ** -law.p - 1) * 100], rng);
}

// ---------------------------------------------------------------------------------------------
// Percentages

const GROW = [
  { q: (v) => `A town has a population of ${v}.`, noun: "population", subj: "the population of a town", unit: "" },
  { q: (v) => `A plant is ${v} cm tall.`, noun: "height", subj: "the height of a plant", unit: "cm" },
  { q: (v) => `A water tank holds ${v} litres.`, noun: "amount of water", subj: "the amount of water in a tank", unit: "litres" },
  { q: (v) => `A field has an area of ${v} m².`, noun: "area", subj: "the area of a field", unit: "m²" },
];

function genPercentages(difficulty, rng) {
  const kinds = {
    easy: ["of", "apply", "as-pct"],
    medium: ["of", "change", "multiplier", "as-pct"],
    hard: ["reverse", "successive", "repeated", "undo"],
  }[difficulty];
  const kind = rng.pick(kinds);
  const easy = difficulty === "easy";

  if (kind === "of") {
    const fmt = easy ? "whole" : "2dp";
    const p = easy ? rng.pick([1, 5, 10, 20, 25, 30, 40, 50, 60, 75, 90]) : rng.pick([rng.int(1, 99), rng.int(1, 99), rng.int(1, 40) + 0.5, rng.int(1, 30) / 10 + rng.int(0, 9)]);
    const N = easy ? rng.int(1, 40) * 20 : rng.int(15, 2000);
    const exact = (p * N) / 100;
    const base = {
      prompt: `What is ${show(p)}% of ${N}?${NOTE[fmt]}`,
      explanation: `Divide the percentage by 100 and multiply.\n\n${[given("_p", p), given("_n", N), row("_answer", "_p / 100 * _n", final(exact, fmt))].join("\n")}`,
      params: { kind: "of", p, N },
      hints: [
        `"Percent" means "out of 100": turn ${show(p)}% into a decimal by dividing by 100, which gives ${show(p / 100)}.`,
        `Multiply ${show(p / 100)} by ${N} (\`_p / 100 * _n\`).${RND(fmt)}`,
      ],
    };
    return finish(base, exact, fmt, [p * N / 10, N / p, N - exact, exact * 10, N + exact], rng);
  }

  if (kind === "apply") {
    const C = rng.pick(GROW);
    const p = rng.pick([5, 10, 20, 25, 30, 40, 50, 75]);
    const up = rng.next() < 0.5;
    const v = rng.int(1, 50) * 20;
    const exact = v * (1 + ((up ? 1 : -1) * p) / 100);
    const base = {
      prompt: `${C.q(v)} It ${up ? "increases" : "decreases"} by ${p}%. What is the new ${C.noun}${C.unit ? `, in ${C.unit}` : ""}?${NOTE.whole}`,
      explanation: `Multiply by ${up ? `1 + ${p}/100` : `1 - ${p}/100`}.\n\n${[given("_v", v), given("_p", p), row("_m", `1 ${up ? "+" : "-"} _p / 100`, show(1 + ((up ? 1 : -1) * p) / 100)), row("_new", "_v * _m", final(exact, "whole", C.unit))].join("\n")}`,
      params: { kind: "apply", v, p, up },
      hints: [
        `Use a multiplier: ${up ? "an increase" : "a decrease"} of ${p}% leaves ${up ? 100 + p : 100 - p}% of the original.`,
        `The multiplier is \`1 ${up ? "+" : "-"} ${p} / 100\` = ${show(1 + ((up ? 1 : -1) * p) / 100)}. Multiply ${v} by it.`,
      ],
    };
    return finish(base, exact, "whole", [(v * p) / 100, v * (1 - ((up ? 1 : -1) * p) / 100), v + (up ? p : -p), v * p], rng);
  }

  if (kind === "as-pct") {
    const fmt = easy ? "whole" : "2dp";
    let A, B;
    if (easy) {
      B = rng.pick([4, 5, 10, 20, 25, 50, 200, 40, 80, 500]);
      do {
        A = rng.int(1, B - 1);
      } while ((100 * A) % B !== 0);
      const m = rng.int(1, 4);
      if (B * m <= 1000) {
        A *= m;
        B *= m;
      }
    } else {
      B = rng.int(7, 400);
      A = rng.int(1, B - 1);
    }
    const exact = (100 * A) / B;
    const base = {
      prompt: `What is ${A} as a percentage of ${B}?${PCT}${NOTE[fmt]}`,
      explanation: `Divide the part by the whole, then multiply by 100.\n\n${[given("_part", A), given("_whole", B), row("_pct", "_part / _whole * 100", final(exact, fmt, "%"))].join("\n")}`,
      params: { kind: "as-pct", A, B },
      hints: [
        `Write it as a fraction, part over whole: ${A} / ${B}.`,
        `Divide ${A} by ${B}, then multiply by 100 (\`_part / _whole * 100\`).${RND(fmt)}`,
      ],
    };
    return finish(base, exact, fmt, [(100 * B) / A, A / B, 100 - exact, (A / B) * 10], rng);
  }

  if (kind === "change") {
    const C = rng.pick(GROW);
    const v1 = rng.int(20, 900);
    let v2;
    do {
      v2 = Math.max(1, Math.round(v1 * (0.4 + rng.next() * 1.4)));
    } while (v2 === v1);
    const exact = ((v2 - v1) / v1) * 100;
    const base = {
      prompt: `${C.q(v1)} Later the ${C.noun} is ${v2}${C.unit ? ` ${C.unit}` : ""}. What is the percentage change?${SIGNED}${PCT}${NOTE["2dp"]}`,
      explanation: `Percentage change = (new - old) ÷ old × 100.\n\n${[given("_old", v1), given("_new", v2), row("_change", "(_new - _old) / _old * 100", final(exact, "2dp", "%"))].join("\n")}`,
      params: { kind: "change", v1, v2 },
      hints: [
        `Percentage change = (new - old) ÷ old × 100. Always divide by the old value.`,
        `new - old = ${v2} - ${v1} = ${v2 - v1}.${v2 < v1 ? " It is negative, so this is a decrease." : ""}`,
        `Divide ${v2 - v1} by the old value, ${v1}, then multiply by 100.${RND("2dp")}`,
      ],
    };
    return finish(base, exact, "2dp", [((v2 - v1) / v2) * 100, -exact, v2 - v1, (v2 / v1) * 100], rng, { allowNeg: true });
  }

  if (kind === "multiplier") {
    const up = rng.next() < 0.5;
    const p = rng.pick([rng.int(1, 99), rng.int(1, 99), rng.int(1, 19) + 0.5]);
    const exact = 1 + ((up ? 1 : -1) * p) / 100;
    const base = {
      prompt: `What single number do you multiply a quantity by to ${up ? "increase" : "decrease"} it by ${show(p)}%? Give the exact decimal, like 1.2.`,
      explanation: `${up ? "Increasing" : "Decreasing"} by ${show(p)}% leaves ${up ? "100 + " : "100 - "}${show(p)} = ${show(exact * 100)}% of the original.\n\n${row("_m", `1 ${up ? "+" : "-"} ${show(p)} / 100`, final(exact, "exact"))}`,
      params: { kind: "multiplier", p, up },
      hints: [
        `Start from 100% of the quantity and ${up ? "add" : "take away"} ${show(p)}%.`,
        `Turn the resulting percentage into a decimal by dividing it by 100 (100% is 1).`,
      ],
    };
    return finish(base, exact, "exact", [1 - ((up ? 1 : -1) * p) / 100, p / 100, 1 + ((up ? 1 : -1) * p) / 10, p, (up ? 1 : -1) * p / 100 + 10], rng, { step: 0.01 });
  }

  if (kind === "reverse") {
    const C = rng.pick(GROW);
    const up = rng.next() < 0.5;
    const p = rng.pick([4, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 60]);
    let O, B;
    do {
      O = rng.int(20, 3000);
      B = (O * (100 + (up ? p : -p))) / 100;
    } while (!Number.isInteger(B));
    const base = {
      prompt: `After a ${p}% ${up ? "increase" : "decrease"}, ${C.subj} is ${B}${C.unit ? ` ${C.unit}` : ""}. What was it before the change?${NOTE.whole}`,
      explanation: [
        `The new value is ${up ? 100 + p : 100 - p}% of the original, so divide by ${show((100 + (up ? p : -p)) / 100)}. (Taking ${p}% of the new value is the classic mistake.)`,
        [given("_new", B), given("_p", p), row("_m", `1 ${up ? "+" : "-"} _p / 100`, show((100 + (up ? p : -p)) / 100)), row("_old", "_new / _m", final(O, "whole", C.unit))].join("\n"),
      ].join("\n\n"),
      params: { kind: "reverse", B, p, up },
      hints: [
        `${B} is the value *after* the change, so it is ${up ? 100 + p : 100 - p}% of the original. Don't take ${p}% of ${B}.`,
        `The multiplier was \`_m = 1 ${up ? "+" : "-"} _p / 100\` = ${show((100 + (up ? p : -p)) / 100)}.`,
        `Undo the multiplier: divide ${B} by ${show((100 + (up ? p : -p)) / 100)}.`,
      ],
    };
    return finish(base, O, "whole", [B * (1 - ((up ? 1 : -1) * p) / 100), B * (1 + ((up ? 1 : -1) * p) / 100), B - (up ? p : -p), (B * 100) / p], rng);
  }

  if (kind === "successive") {
    const p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50]);
    const q = rng.pick([5, 10, 15, 20, 25, 30, 40, 50]);
    const s1 = rng.next() < 0.6 ? 1 : -1;
    const s2 = rng.next() < 0.5 ? -1 : 1;
    const m = (1 + (s1 * p) / 100) * (1 + (s2 * q) / 100);
    const exact = (m - 1) * 100;
    if (Math.abs(exact) < 1e-9) return null;
    const w = (s) => (s > 0 ? "increased" : "decreased");
    const base = {
      prompt: `A quantity is ${w(s1)} by ${p}% and then ${w(s2)} by ${q}%. What is the overall percentage change?${SIGNED}${PCT}${NOTE["2dp"]}`,
      explanation: [
        `Multiply the two multipliers; don't add the percentages.`,
        [given("_p1", p), given("_p2", q), row("_m1", `1 ${s1 > 0 ? "+" : "-"} _p1 / 100`, show(1 + (s1 * p) / 100)), row("_m2", `1 ${s2 > 0 ? "+" : "-"} _p2 / 100`, show(1 + (s2 * q) / 100)), row("_change", "(_m1 * _m2 - 1) * 100", final(exact, "2dp", "%"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "successive", p: s1 * p, q: s2 * q },
      hints: [
        `Don't add the percentages. Turn each change into a multiplier and multiply them.`,
        `\`_m1\` = 1 ${s1 > 0 ? "+" : "-"} ${p}/100 = ${show(1 + (s1 * p) / 100)} and \`_m2\` = 1 ${s2 > 0 ? "+" : "-"} ${q}/100 = ${show(1 + (s2 * q) / 100)}.`,
        `Overall change = (\`_m1 * _m2\` - 1) × 100. A negative result is a decrease.${RND("2dp")}`,
      ],
    };
    return finish(base, exact, "2dp", [s1 * p + s2 * q, m * 100, -exact, s1 * p * s2 * q / 100], rng, { allowNeg: true });
  }

  if (kind === "repeated") {
    const grow = rng.next() < 0.5;
    const p = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
    const n = rng.int(2, 8);
    const v = rng.int(5, 200) * 10;
    const m = 1 + ((grow ? 1 : -1) * p) / 100;
    const exact = v * m ** n;
    const base = {
      prompt: grow
        ? `A bacteria colony covers ${v} mm² and its area grows by ${p}% each day. What area does it cover after ${n} days, in mm²?${NOTE["2dp"]}`
        : `A sample of ${v} g of a substance loses ${p}% of its mass each hour. What mass is left after ${n} hours, in g?${NOTE["2dp"]}`,
      explanation: [
        `Each step multiplies by ${show(m)}, so after ${n} steps multiply by ${show(m)}^${n}.`,
        [given("_start", v), given("_p", p), given("_n", n), row("_m", `1 ${grow ? "+" : "-"} _p / 100`, show(m)), row("_end", "_start * _m^_n", final(exact, "2dp", grow ? "mm²" : "g"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "repeated", v, p: grow ? p : -p, n },
      hints: [
        `Each ${grow ? "day" : "hour"} the amount is multiplied by the same number, so use a power rather than adding ${p}% ${n} times.`,
        `The multiplier is \`_m = 1 ${grow ? "+" : "-"} _p / 100\` = ${show(m)}.`,
        `After ${n} ${grow ? "days" : "hours"}: \`_start * _m^_n\` = ${v} × ${show(m)}^${n}.${RND("2dp")}`,
      ],
    };
    return finish(base, exact, "2dp", [v * (1 + ((grow ? 1 : -1) * p * n) / 100), v * m ** (n - 1), v * m ** (n + 1), v * m * n], rng);
  }

  // undo: what % decrease undoes a p% increase (or vice versa)
  const p = rng.pick([5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100]);
  const up = p >= 100 ? true : rng.next() < 0.6;
  const exact = up ? (p / (100 + p)) * 100 : (p / (100 - p)) * 100;
  const base = {
    prompt: up
      ? `A quantity is increased by ${p}%. By what percentage must the new value be decreased to get back to the original?${PCT}${NOTE["2dp"]}`
      : `A quantity is decreased by ${p}%. By what percentage must the new value be increased to get back to the original?${PCT}${NOTE["2dp"]}`,
    explanation: [
      `The change is the same amount, but it is a percentage of the new value, not the original.`,
      [given("_p", p), row("_new", up ? "100 + _p" : "100 - _p", up ? 100 + p : 100 - p), row("_undo", "_p / _new * 100", final(exact, "2dp", "%"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "undo", p, up },
    hints: [
      `The change back is the same amount, but it is a percentage of the *new* value, so it isn't ${p}%.`,
      `Pretend the original is 100. After the change it is ${up ? 100 + p : 100 - p}, and you need to change it by ${p} to get back.`,
      `Write ${p} as a percentage of ${up ? 100 + p : 100 - p}: \`_p / _new * 100\`.${RND("2dp")}`,
    ],
  };
  return finish(base, exact, "2dp", [p, p / 2, 100 - p, (p / 100) * (100 - p)], rng);
}

const GENS = { ratios: genRatios, proportion: genProportion, percentages: genPercentages };

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
// Independent check: rebuild the exact value by a different route (cross-multiplication,
// unit-rate vs. scale-factor, logs for powers) and compare within the format's tolerance.

function parseRatio(s) {
  const t = String(s ?? "").replace(/\s+/g, "");
  if (!/^\d+(:\d+){1,2}$/.test(t)) return null;
  const v = t.split(":").map(Number);
  return v.some((x) => x <= 0) ? null : v;
}
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function exactOf(p) {
  switch (p.kind) {
    case "share":
      return (p.total * p.pick) / p.parts.reduce((s, x) => s + x, 0);
    case "part":
      // known/a = other/b  ->  other = known·b/a
      return p.askTotal ? p.known + (p.known * p.b) / p.a : (p.known * p.b) / p.a;
    case "share-diff": {
      // smaller = lo·t, larger = hi·t, larger - smaller = diff
      const small = (p.diff * p.lo) / (p.hi - p.lo);
      return p.askTotal ? small + small + p.diff : small;
    }
    case "map":
      return p.toReal ? (p.cm / 100000) * p.scale : (p.km / p.scale) * 100000;
    case "one-to-n":
      return p.flip ? 1 / (p.b / p.a) : 1 / (p.a / p.b);
    case "similar":
      return p.up ? p.known / (p.lo / p.hi) ** p.p : p.known / (p.hi / p.lo) ** p.p;
    case "direct":
      return p.v1 * (p.n2 / p.n1);
    case "rate":
      return 1 / (p.n / p.v);
    case "inverse":
      return p.t1 / (p.n2 / p.n1);
    case "power":
      return p.y1 * Math.exp(p.p * Math.log(p.x2 / p.x1));
    case "power-x":
      return p.x1 * Math.exp(0.5 * Math.log(p.y2 / p.y1));
    case "power-pct":
      return Math.abs(Math.exp(p.p * Math.log((100 + p.pct) / 100)) - 1) * 100;
    case "of":
      return p.N / (100 / p.p);
    case "apply":
      return p.v + ((p.up ? 1 : -1) * p.v * p.p) / 100;
    case "as-pct":
      return p.A / (p.B / 100);
    case "change":
      return (p.v2 / p.v1 - 1) * 100;
    case "multiplier":
      return (100 + (p.up ? p.p : -p.p)) / 100;
    case "reverse":
      return (p.B * 100) / (100 + (p.up ? p.p : -p.p));
    case "successive": {
      const a = 100 + p.p;
      const b = 100 + p.q;
      return (a * b) / 100 - 100;
    }
    case "repeated": {
      let v = p.v;
      for (let i = 0; i < p.n; i++) v += (v * p.p) / 100;
      return v;
    }
    case "undo":
      // original 100 -> new value N; the undo is |100 - N| / N
      return p.up ? (p.p * 100) / (100 + p.p) : (p.p * 100) / (100 - p.p);
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

  if (p.fmt === "ratio") {
    const r = parseRatio(answer);
    if (!r || gcdAll(r) !== 1) return false;
    if (p.kind === "simplify") {
      if (r.length !== 2) return false;
      return close(r[0] * p.parts[1], r[1] * p.parts[0]);
    }
    if (p.kind === "combine") {
      if (r.length !== 3) return false;
      // a/b = p/q and b/c = r/s
      return r[0] * p.q === r[1] * p.p && r[1] * p.s === r[2] * p.r;
    }
    return false;
  }

  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  const exact = exactOf(p);
  if (!Number.isFinite(exact)) return false;
  if (p.fmt === "2dp") return Math.abs(x - exact) <= 0.005 + 1e-9;
  if (p.fmt === "whole" && !Number.isInteger(x)) return false;
  return close(x, exact);
}
