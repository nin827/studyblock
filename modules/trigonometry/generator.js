// Trigonometry generator. Uses only the seeded rng passed in by the engine.
// Degrees everywhere (the quiz calculator's sin/cos/tan also work in degrees).
// Each question's params.fmt says how the answer is given:
//   "2dp"    rounded to 2 decimals, tolerance 0.005 (exact values sitting on a half are regenerated)
//   "exact"  an exact decimal, tolerance 0
//   "whole"  a whole number, tolerance 0
//   "surd"   a choice between exact values like "√3/2" (exact-values subtopic only)
// Explanations list every step as a labelled calculator row, e.g. `_opp = _hyp * sin(_angle)` → 6.88.

// Round half away from zero (the 1e-9 nudge absorbs binary error, e.g. 2.525*100 = 252.4999...), the
// half-step test and the 2-dp answer string come from mathutil.
import { fmtAnswer, isHalfStep, round2 } from "../../js/lib/mathutil.js";
import { sanitizeVisual } from "../../js/lib/visual.js";

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

const RAD = Math.PI / 180;
const sinD = (x) => Math.sin(x * RAD);
const cosD = (x) => Math.cos(x * RAD);
const tanD = (x) => Math.tan(x * RAD);
const asinD = (x) => Math.asin(x) / RAD;
const acosD = (x) => Math.acos(Math.max(-1, Math.min(1, x))) / RAD;
const atanD = (x) => Math.atan(x) / RAD;

const ROUND = " Round to 2 decimal places.";
const DEG = " Answer in degrees, as a number without the ° sign.";
const UNROUNDED = " Keep unrounded values in your working.";
const LATE = " Round to 2 decimal places only at the end."; // guided-mode hints

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
const mid = (n) => show(Math.round(n * 10000) / 10000); // intermediate value, up to 4 decimals

// ---- Question visuals (ticket 026): data only, built from values already drawn (no rng). ----
const ulab = (v, unit) => `${show(v)}${unit ? ` ${unit}` : ""}`;
const dlab = (v) => `${show(v)}°`;
const NO3 = () => [{ label: null }, { label: null }, { label: null }];

// A triangle is drawn to scale only when it is not a sliver: its height on the longest side is at
// least 25% of that side. Otherwise the picture is schematic ("Not drawn to scale").
function fatEnough(L) {
  const [a, b, c] = L;
  const s = (a + b + c) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  const m = Math.max(a, b, c);
  return (2 * area) / m / m >= 0.25;
}

// Right triangle, right angle at B (bottom left), the angle theta at C (bottom right):
// adj = BC (bottom), hyp = CA (slope), opp = AB (left). Labels are strings or null; lengths = true sizes.
function rightVis({ opp, adj, hyp, theta, lengths, caption, force = false }) {
  const v = {
    kind: "triangle",
    vertices: NO3(),
    sides: [{ label: adj }, { label: hyp }, { label: opp }],
    angles: [{ label: null }, { label: null, right: true }, { label: theta }],
    toScale: false,
  };
  const L = [lengths.adj, lengths.hyp, lengths.opp];
  if (force || fatEnough(L)) {
    v.lengths = L;
    v.toScale = true;
  }
  if (caption) v.caption = caption;
  return v;
}

// A side from the side you have (the question's `have`/`want` words): the wanted one shows "?".
function sideVis(have, g, theta, want, unit, caption) {
  const L = { opp: rightSide(have, g, theta, "opp"), adj: rightSide(have, g, theta, "adj"), hyp: rightSide(have, g, theta, "hyp") };
  const lab = (k) => (k === want ? "?" : k === have ? ulab(g, unit) : null);
  return rightVis({ opp: lab("opp"), adj: lab("adj"), hyp: lab("hyp"), theta: dlab(theta), lengths: L, caption });
}

// An angle from two sides (sides = { o, a, h }, any two); the angle shows thetaLabel.
function angVis(s, unit, thetaLabel, hypName = null, caption) {
  const o = s.o !== undefined ? s.o : Math.sqrt(s.h * s.h - s.a * s.a);
  const a = s.a !== undefined ? s.a : Math.sqrt(s.h * s.h - s.o * s.o);
  const h = s.h !== undefined ? s.h : Math.hypot(o, a);
  return rightVis({
    opp: s.o !== undefined ? ulab(s.o, unit) : null,
    adj: s.a !== undefined ? ulab(s.a, unit) : null,
    hyp: s.h !== undefined ? ulab(s.h, unit) : hypName,
    theta: thetaLabel,
    lengths: { adj: a, hyp: h, opp: o },
    caption,
  });
}

// Isosceles triangle: equal sides s, base b, the two base angles unknown.
function isoVis(s, b) {
  const L = [b, s, s];
  const v = {
    kind: "triangle",
    vertices: NO3(),
    sides: [{ label: ulab(b, "cm") }, { label: ulab(s, "cm") }, { label: ulab(s, "cm") }],
    angles: [{ label: null }, { label: "?" }, { label: "?" }],
    toScale: false,
  };
  if (fatEnough(L)) {
    v.lengths = L;
    v.toScale = true;
  }
  return v;
}

// General triangle ABC: side labels { a, b, c } (a = BC, b = CA, c = AB), angle labels { A, B, C },
// lengths [a, b, c]. `named` puts A, B, C on the corners.
function triVis(sl, al, L, named = true, caption) {
  const v = {
    kind: "triangle",
    vertices: named ? [{ label: "A" }, { label: "B" }, { label: "C" }] : NO3(),
    sides: [{ label: sl.a ?? null }, { label: sl.b ?? null }, { label: sl.c ?? null }],
    angles: [{ label: al.A ?? null }, { label: al.B ?? null }, { label: al.C ?? null }],
    toScale: false,
  };
  if (fatEnough(L)) {
    v.lengths = L;
    v.toScale = true;
  }
  if (caption) v.caption = caption;
  return v;
}

// The value shown on the last row: "**6.88 cm**" or "6.8829 cm, which rounds to **6.88 cm**".
function final(exact, fmt, unit = "") {
  const shown = fmtAns(exact, fmt);
  const u = !unit ? "" : unit === "°" ? "°" : ` ${unit}`;
  if (fmt !== "2dp" || Math.abs(exact - Number(shown)) < 1e-9) return `**${shown}${u}**`;
  return `${mid(exact)}${u}, which rounds to **${shown}${u}**`;
}

function fitsFormat(exact, fmt) {
  if (!Number.isFinite(exact)) return false;
  if (fmt === "whole") return Number.isInteger(clean(exact));
  if (fmt === "exact") return Math.abs(clean(exact) * 10000 - Math.round(clean(exact) * 10000)) < 1e-6;
  if (fmt === "2dp") return !isTie(exact);
  return true;
}

const TOL = (fmt) => (fmt === "2dp" ? 0.005 : 0);

// 4 unique numeric choices: correct + 3 positive distractors from common mistakes, topped up
// with nearby values. No option other than the answer lies within the tolerance of the exact value.
function buildChoices(exact, candidates, fmt, rng, { max = Infinity, step } = {}) {
  const correctStr = fmtAns(exact, fmt);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v <= 0 || v >= max || v > 1e7) return;
    if (fmt === "whole" && !Number.isInteger(clean(v))) return;
    const s = fmtAns(v, fmt);
    if (Math.abs(Number(s) - exact) <= TOL(fmt) + 1e-6) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  const st = step ?? (fmt === "whole" ? 1 : exact >= 10 ? 1 : 0.1);
  for (let k = 1; out.length < 3 && k < 1000; k++) {
    tryAdd(exact + k * st);
    tryAdd(exact - k * st);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Typed number or (about 35%) multiple choice. Returns null when the value does not suit its format.
function finish(base, exact, fmt, candidates, rng, opts) {
  if (!fitsFormat(exact, fmt)) return null;
  const q = { ...base, tolerance: TOL(fmt), params: { ...base.params, fmt } };
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

const dec1 = (rng, lo, hi) => rng.int(lo * 10, hi * 10) / 10; // one decimal place

// ---------------------------------------------------------------------------------------------
// Exact values (easy only)

// Exact values written as text, with their numeric values (from the table, not from Math.sin).
const SURD = {
  "0": 0,
  "1/2": 0.5,
  "√2/2": Math.SQRT2 / 2,
  "√3/2": Math.sqrt(3) / 2,
  "1": 1,
  "√3/3": Math.sqrt(3) / 3,
  "√3": Math.sqrt(3),
  "√2": Math.SQRT2,
  "2": 2,
};
const TABLE = {
  sin: { 0: "0", 30: "1/2", 45: "√2/2", 60: "√3/2", 90: "1" },
  cos: { 0: "1", 30: "√3/2", 45: "√2/2", 60: "1/2", 90: "0" },
  tan: { 0: "0", 30: "√3/3", 45: "1", 60: "√3" },
};
const FN = { sin: sinD, cos: cosD, tan: tanD };

// Rational-valued terms for "work out" questions: [text, calculator text, value].
const TERMS = [
  ["sin(30°)", "sin(30)", 0.5],
  ["cos(60°)", "cos(60)", 0.5],
  ["tan(45°)", "tan(45)", 1],
  ["sin(90°)", "sin(90)", 1],
  ["cos(0°)", "cos(0)", 1],
  ["sin(45°)²", "sin(45)^2", 0.5],
  ["cos(45°)²", "cos(45)^2", 0.5],
  ["sin(60°)²", "sin(60)^2", 0.75],
  ["cos(30°)²", "cos(30)^2", 0.75],
  ["sin(30°)²", "sin(30)^2", 0.25],
  ["cos(60°)²", "cos(60)^2", 0.25],
  ["tan(60°)²", "tan(60)^2", 3],
];

function genExact(difficulty, rng) {
  if (difficulty !== "easy") throw new Error(`exact-values has no "${difficulty}" level`);
  const kind = rng.pick(["value", "angle", "work-out"]);

  if (kind === "value") {
    // Always multiple choice (exact surds can't be typed easily); a third of the cell.
    const f = rng.pick(["sin", "cos", "tan"]);
    const angle = Number(rng.pick(Object.keys(TABLE[f])));
    const answer = TABLE[f][angle];
    const v = SURD[answer];
    const pool = rng.shuffle(Object.keys(SURD).filter((s) => Math.abs(SURD[s] - v) > 1e-9));
    // Prefer the classic mix-ups first: the other function's value and the neighbouring angles.
    const other = f === "sin" ? TABLE.cos[angle] : f === "cos" ? TABLE.sin[angle] : TABLE.sin[angle];
    const near = [TABLE[f][angle === 30 ? 60 : 30], TABLE[f][45]].filter(Boolean);
    const picks = [];
    for (const s of [other, ...near, ...pool]) {
      if (picks.length >= 3) break;
      if (s === undefined || s === answer || picks.includes(s) || Math.abs(SURD[s] - v) <= 1e-9) continue;
      picks.push(s);
    }
    const why = {
      sin: "In the 30-60-90 triangle with sides 1, √3, 2 and the 45-45-90 triangle with sides 1, 1, √2: sin = opposite / hypotenuse.",
      cos: "In the 30-60-90 triangle with sides 1, √3, 2 and the 45-45-90 triangle with sides 1, 1, √2: cos = adjacent / hypotenuse.",
      tan: "In the 30-60-90 triangle with sides 1, √3, 2 and the 45-45-90 triangle with sides 1, 1, √2: tan = opposite / adjacent.",
    }[f];
    const ratioWords = { sin: "opposite / hypotenuse", cos: "adjacent / hypotenuse", tan: "opposite / adjacent" }[f];
    const tri = angle === 45 ? "the half-square triangle with sides 1, 1, √2" : angle === 0 || angle === 90 ? "a point on the unit circle at that angle: cos is its x-coordinate and sin its y-coordinate" : "the half-equilateral triangle with sides 1, √3, 2 (the shortest side is opposite the smallest angle)";
    return {
      hints: [
        `${f} = ${ratioWords}.`,
        `Picture ${tri}, and read off ${f}(${angle}°) from it.`,
        `Rule out choices that can't be right: sin and cos are never more than 1, and from 0° to 90° sin and tan get bigger as the angle grows while cos gets smaller.`,
      ],
      prompt: `What is the exact value of ${f}(${angle}°)?`,
      explanation: `${why}\n\nSo \`${f}(${angle}°) = ${answer}\` (about ${mid(v)}); the answer is **${answer}**. Check it with the calculator: \`${f}(${angle})\` → ${mid(v)}.`,
      answer,
      answerType: "choice",
      choices: rng.shuffle([answer, ...picks]),
      tolerance: 0,
      params: { kind: "value", f, angle, fmt: "surd" },
    };
  }

  if (kind === "angle") {
    const f = rng.pick(["sin", "cos", "tan"]);
    const angle = Number(rng.pick(Object.keys(TABLE[f])));
    const val = TABLE[f][angle];
    const inv = { sin: "asin", cos: "acos", tan: "atan" }[f];
    const valCalc = val.replace(/√(\d)/g, "sqrt($1)");
    return {
      hints: [
        `${val} is one of the exact values, so θ is one of the special angles: 0°, 30°, 45°, 60° or 90°.`,
        `Think of the half-square triangle (sides 1, 1, √2) and the half-equilateral triangle (sides 1, √3, 2), where ${f} = ${{ sin: "opposite / hypotenuse", cos: "adjacent / hypotenuse", tan: "opposite / adjacent" }[f]}. Which angle gives ${f} = ${val}?`,
        `You can check with the calculator: \`${inv}(${valCalc})\`.`,
      ],
      prompt: `Find the angle θ, with 0° ≤ θ ≤ 90°, for which \`${f}(θ) = ${val}\`.${DEG} Give a whole number.`,
      explanation: `This is one of the exact values: \`${f}(${angle}°) = ${val}\`, so θ = **${angle}**.\n\nCheck with the calculator: \`${inv}(${valCalc})\` → ${angle}.`,
      answer: angle,
      answerType: "number",
      choices: undefined,
      tolerance: 0,
      params: { kind: "inv-exact", f, val, fmt: "whole" },
    };
  }

  // work-out: k1·T1 ± k2·T2 with rational values
  let t1, t2;
  do {
    t1 = rng.pick(TERMS);
    t2 = rng.pick(TERMS);
  } while (t1 === t2);
  const k1 = rng.int(1, 8);
  const k2 = rng.int(1, 8);
  const sign = rng.next() < 0.7 ? 1 : -1;
  const exact = k1 * t1[2] + sign * k2 * t2[2];
  const co = (k) => (k === 1 ? "" : `${k} × `);
  const coC = (k) => (k === 1 ? "" : `${k} * `);
  const op = sign > 0 ? "+" : "-";
  return {
    hints: [
      `Replace each trig part with its exact value from the table, then do the arithmetic.${t1[0].endsWith("²") || t2[0].endsWith("²") ? " A squared term like sin(45°)² means square the value." : ""}`,
      `\`${t1[0]} = ${show(t1[2])}\` and \`${t2[0]} = ${show(t2[2])}\`.`,
      `Now work out \`${k1} × ${show(t1[2])} ${op} ${k2} × ${show(t2[2])}\`, multiplying before you ${sign > 0 ? "add" : "subtract"}.`,
    ],
    prompt: `Using exact values, work out \`${co(k1)}${t1[0]} ${op} ${co(k2)}${t2[0]}\`. Give the exact answer as a whole number or decimal.`,
    explanation: [
      `Replace each part with its exact value: \`${t1[0]} = ${show(t1[2])}\` and \`${t2[0]} = ${show(t2[2])}\`.`,
      `\`${k1} × ${show(t1[2])} ${op} ${k2} × ${show(t2[2])} = ${show(k1 * t1[2])} ${op} ${show(k2 * t2[2])}\` = **${show(exact)}**.`,
      `Check with the calculator: \`${coC(k1)}${t1[1]} ${op} ${coC(k2)}${t2[1]}\` → ${show(exact)}.`,
    ].join("\n\n"),
    answer: clean(exact),
    answerType: "number",
    choices: undefined,
    tolerance: 0,
    params: { kind: "work-out", k1, c1: t1[1], k2: sign * k2, c2: t2[1], fmt: "exact" },
  };
}

// ---------------------------------------------------------------------------------------------
// Right-angled triangles: sides

const SIDE_NAME = { hyp: "hypotenuse", opp: "opposite", adj: "adjacent" };

// The side you want from the side you have, for an acute angle θ.
function rightSide(have, g, theta, want) {
  const s = sinD(theta);
  const c = cosD(theta);
  const t = tanD(theta);
  const hyp = have === "hyp" ? g : have === "opp" ? g / s : g / c;
  if (want === "hyp") return hyp;
  if (want === "opp") return have === "adj" ? g * t : hyp * s;
  return have === "opp" ? g / t : hyp * c;
}

// Calculator row + ratio name for one step.
function sideStep(have, want) {
  const pair = [have, want].sort().join("-");
  const ratio = pair === "hyp-opp" ? "sin" : pair === "adj-hyp" ? "cos" : "tan";
  const v = (s) => `_${s}`;
  let expr;
  if (ratio === "sin") expr = want === "opp" ? `${v("hyp")} * sin(_angle)` : `${v("opp")} / sin(_angle)`;
  else if (ratio === "cos") expr = want === "adj" ? `${v("hyp")} * cos(_angle)` : `${v("adj")} / cos(_angle)`;
  else expr = want === "opp" ? `${v("adj")} * tan(_angle)` : `${v("opp")} / tan(_angle)`;
  const word = { sin: "SOH: sin = opposite / hypotenuse", cos: "CAH: cos = adjacent / hypotenuse", tan: "TOA: tan = opposite / adjacent" }[ratio];
  return { ratio, expr, word };
}

// Common mistakes for a side: wrong ratio, multiply/divide swapped, calculator in radians.
function sideMistakes(have, g, theta, want) {
  const s = sinD(theta);
  const c = cosD(theta);
  const t = tanD(theta);
  return [
    g * s, g * c, g * t, g / s, g / c, g / t,
    g * Math.abs(Math.sin(theta)), g / Math.abs(Math.cos(theta)), // radians mode
    rightSide(have, g, 90 - theta, want), // used the other acute angle
  ];
}

function genRightSides(difficulty, rng) {
  const easy = difficulty === "easy";
  if (difficulty === "hard" && rng.next() < 0.7) return genRightSideWord(rng);
  const combos = easy
    ? [["hyp", "opp"], ["hyp", "adj"], ["adj", "opp"]]
    : [["opp", "hyp"], ["adj", "hyp"], ["opp", "adj"], ["hyp", "opp"], ["hyp", "adj"], ["adj", "opp"]];
  const [have, want] = rng.pick(combos);
  const theta = difficulty === "hard" ? dec1(rng, 10, 80) : rng.int(difficulty === "easy" ? 15 : 8, difficulty === "easy" ? 75 : 82);
  const g = easy ? rng.int(3, 30) : dec1(rng, 2, 60);
  const exact = rightSide(have, g, theta, want);
  if (exact > 1000 || exact < 0.5) return null;
  const st = sideStep(have, want);
  const base = {
    prompt: `In a right-angled triangle, one of the acute angles is ${show(theta)}°. The ${have === "hyp" ? "hypotenuse" : `side ${have === "opp" ? "opposite" : "adjacent to"} this angle`} is ${show(g)} cm. How long is the ${want === "hyp" ? "hypotenuse" : `side ${want === "opp" ? "opposite" : "adjacent to"} the ${show(theta)}° angle`}, in cm?${ROUND}`,
    explanation: [
      `You know the ${SIDE_NAME[have]} and want the ${SIDE_NAME[want]}, so use ${st.word}.`,
      [given("_angle", theta), given(`_${have}`, g), row(`_${want}`, st.expr, final(exact, "2dp", "cm"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "side", have, g, theta, want },
    visual: sideVis(have, g, theta, want, "cm"),
    hints: [
      `Label the sides from the ${show(theta)}° angle: you know the ${SIDE_NAME[have]} (${show(g)} cm) and want the ${SIDE_NAME[want]}.`,
      `The ${SIDE_NAME[have]} and ${SIDE_NAME[want]} go together in ${st.word}.`,
      `Rearrange it for the side you want: \`_${want} = ${st.expr}\`. ${st.expr.includes(" / ") ? "The unknown is on the bottom of the ratio, so you divide." : "The unknown is on the top of the ratio, so you multiply."}${LATE}`,
    ],
  };
  return finish(base, exact, "2dp", sideMistakes(have, g, theta, want), rng);
}

function genRightSideWord(rng) {
  const kind = rng.pick(["ladder-up", "ladder-foot", "elevation", "depression", "two-angles"]);
  if (kind === "ladder-up" || kind === "ladder-foot") {
    const L = dec1(rng, 3, 12);
    const theta = dec1(rng, 50, 80);
    const up = kind === "ladder-up";
    const exact = up ? L * sinD(theta) : L * cosD(theta);
    const base = {
      prompt: `A ladder leans against a vertical wall. The ladder is ${show(L)} m long and makes an angle of ${show(theta)}° with the level ground. ${up ? "How high up the wall does the ladder reach" : "How far is the foot of the ladder from the wall"}, in m?${ROUND}`,
      explanation: [
        `The ladder is the hypotenuse; the angle is at the ground, so the wall height is opposite it and the ground distance is adjacent.`,
        [given("_angle", theta), given("_hyp", L), row(up ? "_opp" : "_adj", up ? "_hyp * sin(_angle)" : "_hyp * cos(_angle)", final(exact, "2dp", "m"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "side", have: "hyp", g: L, theta, want: up ? "opp" : "adj" },
      visual: sideVis("hyp", L, theta, up ? "opp" : "adj", "m", "A ladder against a wall"),
      hints: [
        `Sketch it: the ladder is the hypotenuse, ${show(L)} m, and the ${show(theta)}° angle is at the ground.`,
        up
          ? `The height up the wall is opposite that angle, so use SOH: sin = opposite / hypotenuse.`
          : `The distance from the wall is adjacent to that angle, so use CAH: cos = adjacent / hypotenuse.`,
        `Multiply: \`_hyp * ${up ? "sin" : "cos"}(_angle)\` = ${show(L)} × ${up ? "sin" : "cos"}(${show(theta)}).${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", sideMistakes("hyp", L, theta, up ? "opp" : "adj"), rng);
  }
  if (kind === "elevation") {
    const d = rng.int(10, 120);
    const theta = dec1(rng, 15, 70);
    const eye = dec1(rng, 1.4, 1.9);
    const exact = d * tanD(theta) + eye;
    const base = {
      prompt: `You stand on level ground ${d} m from the foot of a tower. The angle of elevation of the top of the tower is ${show(theta)}°, measured from your eyes, which are ${show(eye)} m above the ground. How tall is the tower, in m?${UNROUNDED}${ROUND}`,
      explanation: [
        `The right-angled triangle runs from your eyes: adjacent = ${d} m, opposite = the part of the tower above eye level. Add your eye height at the end.`,
        [given("_angle", theta), given("_adj", d), given("_eye", eye), row("_opp", "_adj * tan(_angle)", mid(d * tanD(theta))), row("_height", "_opp + _eye", final(exact, "2dp", "m"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "elevation", d, theta, eye },
      visual: rightVis({ opp: "above eye", adj: ulab(d, "m"), hyp: null, theta: dlab(theta), lengths: { adj: d, opp: d * tanD(theta), hyp: d / cosD(theta) }, caption: "From your eyes to the top of the tower" }),
      hints: [
        `The right-angled triangle starts at your eyes, not the ground: the ${d} m is adjacent to the ${show(theta)}° angle, and the opposite side is the part of the tower above eye level.`,
        `Opposite and adjacent go with TOA: \`_opp = _adj * tan(_angle)\` = ${d} × tan(${show(theta)}).`,
        `Don't forget your eyes are ${show(eye)} m above the ground: add that to the opposite side.${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", [d * tanD(theta), d * sinD(theta) + eye, d / tanD(theta) + eye, d * Math.abs(Math.tan(theta)) + eye, d * tanD(theta) - eye], rng);
  }
  if (kind === "depression") {
    const H = rng.int(20, 200);
    const theta = dec1(rng, 8, 60);
    const exact = H / tanD(theta);
    const base = {
      prompt: `From the top of a vertical cliff ${H} m high, the angle of depression of a boat on the sea is ${show(theta)}°. How far is the boat from the foot of the cliff, in m?${ROUND}`,
      explanation: [
        `The angle of depression from the top equals the angle of elevation from the boat (alternate angles). The cliff is opposite that angle and the distance is adjacent.`,
        [given("_angle", theta), given("_opp", H), row("_adj", "_opp / tan(_angle)", final(exact, "2dp", "m"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "side", have: "opp", g: H, theta, want: "adj" },
      visual: sideVis("opp", H, theta, "adj", "m", "The angle is at the boat"),
      hints: [
        `The angle of depression from the cliff top equals the angle of elevation from the boat (alternate angles), so the angle at the boat is ${show(theta)}°.`,
        `From that angle, the cliff (${H} m) is opposite and the distance you want is adjacent: use TOA, tan = opposite / adjacent.`,
        `The unknown is on the bottom, so divide: \`_opp / tan(_angle)\` = ${H} ÷ tan(${show(theta)}).${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", sideMistakes("opp", H, theta, "adj"), rng);
  }
  // two-angles: two observers in line with the foot of a tower
  const h = rng.int(20, 150);
  const a1 = dec1(rng, 15, 40);
  const a2 = dec1(rng, a1 + 8, 75);
  const far = h / tanD(a1);
  const near = h / tanD(a2);
  const exact = far - near;
  const base = {
    prompt: `A tower ${h} m tall stands on level ground. Two points P and Q are in a straight line with its foot, on the same side. From P the angle of elevation of the top is ${show(a1)}°, and from Q it is ${show(a2)}°. How far apart are P and Q, in m?${UNROUNDED}${ROUND}`,
    explanation: [
      `Find each point's distance from the foot with tan, then subtract. The smaller angle belongs to the point further away.`,
      [given("_h", h), given("_a1", a1), given("_a2", a2), row("_far", "_h / tan(_a1)", mid(far)), row("_near", "_h / tan(_a2)", mid(near)), row("_PQ", "_far - _near", final(exact, "2dp", "m"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "two-angles", h, a1, a2 },
    hints: [
      `Each point makes its own right-angled triangle with the tower: the height ${h} m is opposite the angle, and the distance to the foot is adjacent.`,
      `The smaller angle, ${show(a1)}°, belongs to the point further away. Its distance is \`_far = _h / tan(_a1)\`; the nearer one is \`_near = _h / tan(_a2)\`.`,
      `The distance PQ is the difference of those two distances: \`_far - _near\`. Keep both unrounded.${LATE}`,
    ],
  };
  return finish(base, exact, "2dp", [far, near, h * tanD(a2) - h * tanD(a1), far + near, h / tanD(a2 - a1)], rng);
}

// ---------------------------------------------------------------------------------------------
// Right-angled triangles: angles

// Angle θ from two known sides (o = opposite, a = adjacent, h = hypotenuse).
function rightAngle(sides) {
  if (sides.o !== undefined && sides.h !== undefined) return asinD(sides.o / sides.h);
  if (sides.a !== undefined && sides.h !== undefined) return acosD(sides.a / sides.h);
  return atanD(sides.o / sides.a);
}

function angleRow(sides) {
  if (sides.o !== undefined && sides.h !== undefined) return { expr: "asin(_opp / _hyp)", word: "SOH: sin(θ) = opposite / hypotenuse", ratio: sides.o / sides.h };
  if (sides.a !== undefined && sides.h !== undefined) return { expr: "acos(_adj / _hyp)", word: "CAH: cos(θ) = adjacent / hypotenuse", ratio: sides.a / sides.h };
  return { expr: "atan(_opp / _adj)", word: "TOA: tan(θ) = opposite / adjacent", ratio: sides.o / sides.a };
}

function angleMistakes(sides, exact) {
  const { ratio } = angleRow(sides);
  const out = [90 - exact];
  if (ratio <= 1) out.push(asinD(ratio), acosD(ratio));
  out.push(atanD(ratio), Math.atan(ratio), Math.asin(Math.min(1, ratio))); // the last two: calculator left in radians
  if (sides.o !== undefined && sides.a !== undefined) out.push(atanD(sides.a / sides.o));
  return out;
}

// Guided-mode hints for an angle from two sides (no rng; never the angle itself).
function angleHints(sides, lead) {
  const st = angleRow(sides);
  const known = [];
  if (sides.o !== undefined) known.push(`opposite = ${show(sides.o)}`);
  if (sides.a !== undefined) known.push(`adjacent = ${show(sides.a)}`);
  if (sides.h !== undefined) known.push(`hypotenuse = ${show(sides.h)}`);
  const inv = st.expr.slice(0, 4);
  const frac = sides.h !== undefined ? `${show(sides.o ?? sides.a)} / ${show(sides.h)}` : `${show(sides.o)} / ${show(sides.a)}`;
  return [
    lead || `Label the sides from θ: you know the ${known.map((k) => k.split(" =")[0]).join(" and the ")}.`,
    `With ${known.join(" and ")}, use ${st.word}.`,
    `Work out the ratio ${frac}, then use the inverse function ${inv} to turn it into an angle: \`${st.expr}\`. Make sure you get degrees.${LATE}`,
  ];
}

function sideLines(sides, halfBase = false) {
  const lines = [];
  if (sides.o !== undefined) lines.push(given("_opp", sides.o));
  if (sides.a !== undefined && halfBase) lines.push(given("_base", sides.a * 2), row("_adj", "_base / 2", show(sides.a)));
  else if (sides.a !== undefined) lines.push(given("_adj", sides.a));
  if (sides.h !== undefined) lines.push(given("_hyp", sides.h));
  return lines;
}

function genRightAngles(difficulty, rng) {
  if (difficulty === "hard" && rng.next() < 0.7) return genRightAngleWord(rng);
  const easy = difficulty === "easy";
  const pair = rng.pick(["oh", "ah", "oa"]);
  const v = () => (easy ? rng.int(2, 25) : dec1(rng, 1, 50));
  let sides;
  if (pair === "oa") sides = { o: v(), a: v() };
  else {
    const h = v();
    const leg = easy ? rng.int(1, h - 1) : dec1(rng, 0.5, h - 0.3);
    if (!(leg > 0 && leg < h)) return null;
    sides = pair === "oh" ? { o: leg, h } : { a: leg, h };
  }
  const exact = rightAngle(sides);
  if (!(exact > 3 && exact < 87)) return null;
  const st = angleRow(sides);
  const desc = [];
  if (sides.o !== undefined) desc.push(`the side opposite angle θ is ${show(sides.o)} cm`);
  if (sides.a !== undefined) desc.push(`the side adjacent to angle θ is ${show(sides.a)} cm`);
  if (sides.h !== undefined) desc.push(`the hypotenuse is ${show(sides.h)} cm`);
  const base = {
    prompt: `In a right-angled triangle, ${desc.join(" and ")}. Find the acute angle θ.${DEG}${ROUND}`,
    explanation: [`Use ${st.word}, then the inverse function.`, [...sideLines(sides), row("_theta", st.expr, final(exact, "2dp", "°"))].join("\n")].join("\n\n"),
    params: { kind: "angle", ...sides },
    visual: angVis(sides, "cm", "θ"),
    hints: angleHints(sides),
  };
  return finish(base, exact, "2dp", angleMistakes(sides, exact), rng, { max: 90 });
}

function genRightAngleWord(rng) {
  const kind = rng.pick(["ladder", "slope", "shadow", "isosceles", "rectangle"]);
  let sides, prompt, intro, unit, vis;
  if (kind === "ladder") {
    const L = dec1(rng, 3, 12);
    const up = dec1(rng, L * 0.5, L - 0.2);
    sides = { o: up, h: L };
    unit = "m";
    prompt = `A ${show(L)} m ladder leans against a vertical wall and reaches ${show(up)} m up the wall. What angle does the ladder make with the level ground?`;
    intro = `The ladder is the hypotenuse and the wall height is opposite the angle at the ground.`;
    vis = angVis(sides, "m", "?", null, "A ladder against a wall");
  } else if (kind === "slope") {
    const run = rng.int(20, 400);
    const rise = dec1(rng, 1, Math.min(run * 0.6, 120));
    sides = { o: rise, a: run };
    unit = "m";
    prompt = `A straight road rises ${show(rise)} m over a horizontal distance of ${run} m. At what angle is the road inclined to the horizontal?`;
    intro = `The rise is opposite the angle and the horizontal distance is adjacent.`;
    vis = angVis(sides, "m", "?", "road");
  } else if (kind === "shadow") {
    const h = dec1(rng, 1, 30);
    const s = dec1(rng, 1, 40);
    sides = { o: h, a: s };
    unit = "m";
    prompt = `A vertical pole ${show(h)} m tall casts a shadow ${show(s)} m long on level ground. What is the angle of elevation of the sun?`;
    intro = `The pole is opposite the angle at the tip of the shadow, and the shadow is adjacent.`;
    vis = angVis(sides, "m", "?", "sun's ray");
  } else if (kind === "isosceles") {
    const s = rng.int(5, 40);
    const b = rng.int(2, 2 * s - 1);
    sides = { a: b / 2, h: s };
    unit = "cm";
    prompt = `An isosceles triangle has two equal sides of ${s} cm and a base of ${b} cm. Find the size of one of its base angles.`;
    intro = `Split the triangle down the middle into two right-angled triangles: the hypotenuse is ${s} cm and the side adjacent to the base angle is half the base, ${show(b / 2)} cm.`;
    vis = isoVis(s, b);
  } else {
    const l = rng.int(5, 60);
    const w = rng.int(2, l - 1);
    sides = { o: w, a: l };
    unit = "cm";
    prompt = `A rectangle is ${l} cm long and ${w} cm wide. Find the angle between a diagonal and one of the longer sides.`;
    intro = `The diagonal splits the rectangle into two right-angled triangles. At a corner on a long side, the width is opposite the angle and the length is adjacent.`;
    vis = angVis(sides, "cm", "?", "diagonal", "Half of the rectangle");
  }
  const exact = rightAngle(sides);
  if (!(exact > 2 && exact < 88)) return null;
  const st = angleRow(sides);
  const base = {
    prompt: `${prompt}${DEG}${ROUND}`,
    explanation: [`${intro} Use ${st.word}.`, [...sideLines(sides, kind === "isosceles"),row("_theta", st.expr, final(exact, "2dp", "°"))].join("\n")].join("\n\n"),
    params: { kind: "angle", ...sides, unit },
    visual: vis,
    hints: angleHints(sides, intro),
  };
  return finish(base, exact, "2dp", angleMistakes(sides, exact), rng, { max: 180 });
}

// ---------------------------------------------------------------------------------------------
// Non-right triangles: sine rule, cosine rule, area (medium/hard)

function genNonRight(difficulty, rng) {
  if (difficulty === "easy") throw new Error(`non-right has no "easy" level`);
  const kinds = difficulty === "medium" ? ["sine-side", "cos-side", "area"] : ["sine-angle", "cos-angle", "sine-side-asa", "cos-side", "area-sss"];
  const kind = rng.pick(kinds);
  const hard = difficulty === "hard";

  if (kind === "sine-side" || kind === "sine-side-asa") {
    // Angles A and B with side a (opposite A); find b. ASA variant: side c between them, find a.
    const A = hard ? dec1(rng, 20, 110) : rng.int(25, 110);
    const B = hard ? dec1(rng, 15, 150 - A) : rng.int(20, 150 - A);
    if (Math.abs(A - B) < 3 || A + B > 165) return null;
    const C = 180 - A - B;
    if (kind === "sine-side") {
      const a = hard ? dec1(rng, 3, 40) : rng.int(4, 40);
      const exact = (a * sinD(B)) / sinD(A);
      const base = {
        prompt: `In triangle ABC, angle A = ${show(A)}°, angle B = ${show(B)}° and side a = BC = ${show(a)} cm. Find side b = AC, in cm.${ROUND}`,
        explanation: [
          `Use the sine rule: \`a / sin(A) = b / sin(B)\`, so \`b = a × sin(B) / sin(A)\`.`,
          [given("_angA", A), given("_angB", B), given("_a", a), row("_b", "_a * sin(_angB) / sin(_angA)", final(exact, "2dp", "cm"))].join("\n"),
        ].join("\n\n"),
        params: { kind: "sine-side", A, B, a },
        visual: triVis({ a: ulab(a, "cm"), b: "?" }, { A: dlab(A), B: dlab(B) }, [a, exact, (a * sinD(C)) / sinD(A)]),
        hints: [
          `You have two angles and a side opposite one of them, so use the sine rule. Side a is opposite angle A, and b is opposite B.`,
          `Write \`a / sin(A) = b / sin(B)\` and rearrange: \`b = a × sin(B) / sin(A)\`.`,
          `Substitute: ${show(a)} × sin(${show(B)}) ÷ sin(${show(A)}).${LATE}`,
        ],
      };
      return finish(base, exact, "2dp", [(a * sinD(A)) / sinD(B), a * sinD(B), (a * sinD(C)) / sinD(A), (a * Math.abs(Math.sin(B))) / Math.abs(Math.sin(A)), (a * B) / A], rng);
    }
    const c = dec1(rng, 3, 40);
    const exact = (c * sinD(A)) / sinD(C);
    const base = {
      prompt: `In triangle ABC, angle A = ${show(A)}°, angle B = ${show(B)}° and side c = AB = ${show(c)} cm. Find side a = BC, in cm.${UNROUNDED}${ROUND}`,
      explanation: [
        `First find angle C (angles add up to 180°), then use the sine rule \`a / sin(A) = c / sin(C)\`.`,
        [given("_angA", A), given("_angB", B), given("_c", c), row("_angC", "180 - _angA - _angB", show(C)), row("_a", "_c * sin(_angA) / sin(_angC)", final(exact, "2dp", "cm"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "sine-asa", A, B, c },
      visual: triVis({ a: "?", c: ulab(c, "cm") }, { A: dlab(A), B: dlab(B) }, [exact, (c * sinD(B)) / sinD(C), c]),
      hints: [
        `Side c is opposite angle C, which you don't know yet. Angles in a triangle add up to 180°.`,
        `C = 180 - ${show(A)} - ${show(B)} = ${show(C)}°.`,
        `Now use the sine rule \`a / sin(A) = c / sin(C)\`: a = ${show(c)} × sin(${show(A)}) ÷ sin(${show(C)}).${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", [(c * sinD(A)) / sinD(B), (c * sinD(C)) / sinD(A), (c * sinD(B)) / sinD(C), c * sinD(A)], rng);
  }

  if (kind === "sine-angle") {
    // Given a, b and A with a > b, so B (opposite the shorter side) is acute and unique.
    const A = dec1(rng, 30, 120);
    const a = dec1(rng, 6, 40);
    const b = dec1(rng, 2, a - 1);
    const s = (b * sinD(A)) / a;
    if (!(s > 0 && s < 1)) return null;
    const exact = asinD(s);
    if (exact < 3) return null;
    const base = {
      prompt: `In triangle ABC, angle A = ${show(A)}°, side a = BC = ${show(a)} cm and side b = AC = ${show(b)} cm. Find angle B. (B is acute, because b is shorter than a.)${DEG}${ROUND}`,
      explanation: [
        `Use the sine rule for angles: \`sin(B) / b = sin(A) / a\`, so \`sin(B) = b × sin(A) / a\`.`,
        [given("_angA", A), given("_a", a), given("_b", b), row("_sinB", "_b * sin(_angA) / _a", mid(s)), row("_angB", "asin(_sinB)", final(exact, "2dp", "°"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "sine-angle", A, a, b },
      visual: triVis({ a: ulab(a, "cm"), b: ulab(b, "cm") }, { A: dlab(A), B: "?" }, [a, b, (a * sinD(180 - A - exact)) / sinD(A)]),
      hints: [
        `You know a side-and-angle pair (a and A) and side b, so use the sine rule with the sines on top: \`sin(B) / b = sin(A) / a\`.`,
        `Rearrange: \`sin(B) = b × sin(A) / a\` = ${show(b)} × sin(${show(A)}) ÷ ${show(a)}. Keep it unrounded (\`_sinB\`).`,
        `Turn the sine back into an angle with asin: \`asin(_sinB)\`. B is acute, so that's the one you want.${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", [180 - exact, asinD(Math.min(1, (a * sinD(A)) / b) || 0.5), acosD(s), (b * A) / a, 180 - A - exact], rng, { max: 180 });
  }

  if (kind === "cos-side") {
    const A = hard ? dec1(rng, 20, 150) : rng.int(25, 140);
    const b = hard ? dec1(rng, 3, 40) : rng.int(3, 30);
    const c = hard ? dec1(rng, 3, 40) : rng.int(3, 30);
    const a2 = b * b + c * c - 2 * b * c * cosD(A);
    const exact = Math.sqrt(a2);
    const base = {
      prompt: `In triangle ABC, side b = AC = ${show(b)} cm, side c = AB = ${show(c)} cm and the angle between them is A = ${show(A)}°. Find side a = BC, in cm.${ROUND}`,
      explanation: [
        `Two sides and the angle between them: use the cosine rule \`a² = b² + c² - 2bc × cos(A)\`.`,
        [given("_angA", A), given("_b", b), given("_c", c), row("_a", "sqrt(_b^2 + _c^2 - 2 * _b * _c * cos(_angA))", final(exact, "2dp", "cm"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "cos-side", A, b, c },
      visual: triVis({ a: "?", b: ulab(b, "cm"), c: ulab(c, "cm") }, { A: dlab(A) }, [exact, b, c]),
      hints: [
        `You have two sides and the angle between them, so use the cosine rule: \`a² = b² + c² - 2bc × cos(A)\`.`,
        `Substitute: a² = ${show(b)}² + ${show(c)}² - 2 × ${show(b)} × ${show(c)} × cos(${show(A)}).${A > 90 ? " cos of an obtuse angle is negative, so this term adds on." : ""}`,
        `That gives a², not a: take the square root, \`sqrt(_b^2 + _c^2 - 2 * _b * _c * cos(_angA))\`.${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", [a2, Math.sqrt(b * b + c * c + 2 * b * c * cosD(A)), Math.sqrt(b * b + c * c), Math.sqrt(Math.abs(b * b + c * c - 2 * b * c * Math.cos(A))), Math.sqrt(Math.abs(b * b + c * c - b * c * cosD(A)))], rng);
  }

  if (kind === "cos-angle") {
    let a, b, c;
    do {
      a = rng.int(3, 25);
      b = rng.int(3, 25);
      c = rng.int(3, 25);
    } while (a + b <= c + 1 || a + c <= b + 1 || b + c <= a + 1);
    const which = rng.pick(["largest", "A"]);
    let lab = "A";
    let opp = a;
    let s1 = b;
    let s2 = c;
    if (which === "largest") {
      const m = Math.max(a, b, c);
      if ([a, b, c].filter((x) => x === m).length > 1) return null;
      if (m === b) [lab, opp, s1, s2] = ["B", b, a, c];
      else if (m === c) [lab, opp, s1, s2] = ["C", c, a, b];
    }
    const cosX = (s1 * s1 + s2 * s2 - opp * opp) / (2 * s1 * s2);
    const exact = acosD(cosX);
    const L = lab.toLowerCase();
    const others = ["a", "b", "c"].filter((x) => x !== L);
    const base = {
      prompt: `A triangle ABC has sides a = BC = ${a} cm, b = AC = ${b} cm and c = AB = ${c} cm. Find angle ${lab}${which === "largest" ? " (the largest angle)" : ""}.${DEG}${ROUND}`,
      explanation: [
        `Three sides: rearrange the cosine rule to \`cos(${lab}) = (${others[0]}² + ${others[1]}² - ${L}²) / (2${others[0]}${others[1]})\`. ${lab} is opposite side ${L}.`,
        [given(`_${L}`, opp), given(`_${others[0]}`, s1), given(`_${others[1]}`, s2), row(`_cos${lab}`, `(_${others[0]}^2 + _${others[1]}^2 - _${L}^2) / (2 * _${others[0]} * _${others[1]})`, mid(cosX)), row(`_ang${lab}`, `acos(_cos${lab})`, final(exact, "2dp", "°"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "cos-angle", a, b, c, lab },
      visual: triVis({ a: ulab(a, "cm"), b: ulab(b, "cm"), c: ulab(c, "cm") }, { [lab]: "?" }, [a, b, c]),
      hints: [
        `Three sides and no angles: use the cosine rule rearranged for an angle. ${which === "largest" ? `The largest angle is opposite the longest side, ${L} = ${opp} cm.` : `Angle A is opposite side a = ${a} cm.`}`,
        `\`cos(${lab}) = (${others[0]}² + ${others[1]}² - ${L}²) / (2${others[0]}${others[1]})\`: the side opposite ${lab} is the one you subtract.`,
        `Substitute: cos(${lab}) = (${s1}² + ${s2}² - ${opp}²) ÷ (2 × ${s1} × ${s2}). Then use acos to get the angle.${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", [180 - exact, 90 - exact, acosD(-cosX), acosD((s1 * s1 + s2 * s2 + opp * opp) / (2 * s1 * s2)), asinD(Math.min(1, Math.abs(cosX)))], rng, { max: 180 });
  }

  if (kind === "area") {
    const C = rng.int(20, 160);
    const a = rng.int(3, 30);
    const b = rng.int(3, 30);
    const exact = 0.5 * a * b * sinD(C);
    const base = {
      prompt: `In triangle ABC, side a = BC = ${a} cm, side b = AC = ${b} cm and the angle between them is C = ${C}°. Find the area of the triangle, in cm².${ROUND}`,
      explanation: [
        `Area = ½ × a × b × sin(C), with C the angle between sides a and b.`,
        [given("_a", a), given("_b", b), given("_angC", C), row("_area", "0.5 * _a * _b * sin(_angC)", final(exact, "2dp", "cm²"))].join("\n"),
      ].join("\n\n"),
      params: { kind: "area", a, b, C },
      visual: triVis({ a: ulab(a, "cm"), b: ulab(b, "cm") }, { C: dlab(C) }, [a, b, Math.sqrt(a * a + b * b - 2 * a * b * cosD(C))]),
      hints: [
        `With two sides and the angle between them, use area = ½ × a × b × sin(C), not ½ × base × height.`,
        `Substitute: 0.5 × ${a} × ${b} × sin(${C}).${C > 90 ? ` sin of an obtuse angle is still positive.` : ""}${LATE}`,
      ],
    };
    return finish(base, exact, "2dp", [a * b * sinD(C), 0.5 * a * b * cosD(C), 0.5 * a * b, 0.5 * a * b * Math.abs(Math.sin(C))], rng);
  }

  // area-sss (hard): three sides -> angle by the cosine rule -> area
  let a, b, c;
  do {
    a = rng.int(4, 30);
    b = rng.int(4, 30);
    c = rng.int(4, 30);
  } while (a + b <= c + 1 || a + c <= b + 1 || b + c <= a + 1);
  const cosC = (a * a + b * b - c * c) / (2 * a * b);
  const C = acosD(cosC);
  const exact = 0.5 * a * b * sinD(C);
  const base = {
    prompt: `A triangle has sides of ${a} cm, ${b} cm and ${c} cm. Find its area, in cm².${UNROUNDED}${ROUND}`,
    explanation: [
      `Find one angle with the cosine rule (here C, opposite the ${c} cm side), then use area = ½ × a × b × sin(C).`,
      [given("_a", a), given("_b", b), given("_c", c), row("_angC", "acos((_a^2 + _b^2 - _c^2) / (2 * _a * _b))", mid(C)), row("_area", "0.5 * _a * _b * sin(_angC)", final(exact, "2dp", "cm²"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "area-sss", a, b, c },
    visual: triVis({ a: ulab(a, "cm"), b: ulab(b, "cm"), c: ulab(c, "cm") }, {}, [a, b, c], false),
    hints: [
      `Area = ½ × a × b × sin(C) needs an angle, so find one first with the cosine rule.`,
      `Call the sides a = ${a}, b = ${b}, c = ${c}. Angle C is opposite c: \`cos(C) = (a² + b² - c²) / (2ab)\` = (${a}² + ${b}² - ${c}²) ÷ (2 × ${a} × ${b}). Use acos and keep C unrounded (\`_angC\`).`,
      `Now \`0.5 * _a * _b * sin(_angC)\`.${LATE}`,
    ],
  };
  return finish(base, exact, "2dp", [a * b * sinD(C), 0.5 * a * b * cosC, 0.5 * a * b, 0.5 * a * c * sinD(C), (a * b * c) / 4 / 10], rng);
}

// ---------------------------------------------------------------------------------------------
// Expert: multi-step, multi-part problems (easy/medium/hard above are untouched).
// Every template draws all of its rng values first, then builds text. Hints use only values
// already drawn (no rng) and stop one step short of each answer. All answers: 2 decimal places.

const pad3 = (b) => String(b).padStart(3, "0"); // bearings are whole degrees, written 065°
const mod360 = (x) => ((x % 360) + 360) % 360;
const okDp = (...xs) => xs.every((x) => Number.isFinite(x) && x > 0 && !isTie(x));
const BEARINGS = " Bearings are measured clockwise from north, from 0 up to (not including) 360.";
let XB = null; // bearing values written as 065° in the prompt (inPrompt can't see them)

// Expert bearings are answered to the nearest whole degree (ticket 015). The exact bearing stays at
// least 0.02° from a half degree and never rounds to 0 or 360, so the rounding is never in doubt.
const BEAR_ROUND = " Round the distance to 2 decimal places and the bearing to the nearest whole degree.";
const LATE_DEG = " Round the bearing to the nearest whole degree only at the end.";
const okBearing = (b) => Number.isFinite(b) && b >= 0.5 && b < 359.5 && Math.abs((b % 1) - 0.5) >= 0.02;
function partBearing(id, label, ask, exact, hint) {
  return { id, label, ask: `${ask} (degrees, to the nearest whole degree)`, answerType: "number", answer: Math.round(exact), tolerance: 0, hint };
}
const finalDeg = (exact) => `${mid(exact)}°, which rounds to **${Math.round(exact)}°**`;

function part2(id, label, ask, exact, unit, hint) {
  const u = unit === "°" ? " (degrees)" : unit ? ` (${unit})` : "";
  return { id, label, ask: `${ask}${u}`, answerType: "number", answer: round2(exact), tolerance: 0.005, hint };
}

// Like attachGiven, for multi-part questions: no given value may equal any part's answer.
function attachGivenExpert(q) {
  const seen = new Set();
  const list = [];
  for (const g of GIVEN || []) {
    const key = g.label.toLowerCase();
    if (!GIVEN_LABEL.test(g.label) || seen.has(key) || !Number.isFinite(g.value)) continue;
    const shown = inPrompt(q.prompt, g.value) || ((XB || []).includes(g.value) && q.prompt.includes(`${pad3(g.value)}°`));
    if (!shown) continue;
    if (q.parts.some((p) => Math.abs(g.value - p.answer) <= 0.005 + 1e-9)) continue;
    seen.add(key);
    list.push(g);
  }
  return list.length >= 2 ? { ...q, given: list.slice(0, 8) } : q;
}

// right-sides / expert 0: two angles of elevation from points a known distance apart.
const TALL = [
  { thing: "vertical mast", top: "the top of the mast" },
  { thing: "tall tree", top: "the top of the tree" },
  { thing: "lighthouse", top: "the top of the lighthouse" },
  { thing: "church tower", top: "the top of the tower" },
];
function xElevTwo(rng) {
  const obj = rng.pick(TALL);
  const d = rng.int(15, 150);
  const a1 = dec1(rng, 12, 40);
  const a2 = dec1(rng, a1 + 10, 70);
  const t1 = tanD(a1);
  const t2 = tanD(a2);
  const x = (d * t1) / (t2 - t1);
  const h = x * t2;
  if (!okDp(x, h)) return null;
  return {
    prompt: `From a point P on level ground, the angle of elevation of ${obj.top} of a ${obj.thing} is ${show(a1)}°. You walk ${d} m in a straight line towards its foot, to a point Q, and the angle of elevation is now ${show(a2)}°.${UNROUNDED}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("dist", "Distance", "Distance from Q to the foot", x, "m", `Write the height two ways, \`h = x × tan(${show(a2)})\` and \`h = (x + ${d}) × tan(${show(a1)})\`, and solve for x.`),
      part2("height", "Height", `Height of the ${obj.thing.replace(/^(vertical|tall|church) /, "")}`, h, "m", `Once you have x unrounded, the height is opposite the ${show(a2)}° angle at Q: multiply x by tan(${show(a2)}).`),
    ],
    explanation: [
      `Let x be the distance from Q to the foot and h the height. Triangle Q-foot-top gives \`h = x × tan(a2)\`; triangle P-foot-top gives \`h = (x + d) × tan(a1)\`.`,
      `Set them equal: \`x × (tan(a2) - tan(a1)) = d × tan(a1)\`, so \`x = d × tan(a1) / (tan(a2) - tan(a1))\`.`,
      [given("_d", d), given("_a1", a1), given("_a2", a2), row("_x", "_d * tan(_a1) / (tan(_a2) - tan(_a1))", final(x, "2dp", "m")), row("_h", "_x * tan(_a2)", final(h, "2dp", "m"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-elev2", d, a1, a2 },
    hints: [
      `Call the distance from Q to the foot x, and the height h. Both points make a right-angled triangle with the same height: from Q, \`h = x × tan(${show(a2)})\`; from P, which is ${d} m further away, \`h = (x + ${d}) × tan(${show(a1)})\`.`,
      `Set the two expressions for h equal and collect the x terms: \`x × (tan(${show(a2)}) - tan(${show(a1)})) = ${d} × tan(${show(a1)})\`.`,
      `Divide to get x (\`_x\`), keep it unrounded, then multiply by tan(${show(a2)}) for the height.${LATE}`,
    ],
  };
}

// right-sides / expert 1: altitude splits a triangle into two right triangles that share AD.
function xAltitude(rng) {
  const c = dec1(rng, 4, 30);
  const B = dec1(rng, 25, 80);
  const C = dec1(rng, 25, 80);
  const AD = c * sinD(B);
  const BD = c * cosD(B);
  const DC = AD / tanD(C);
  const BC = BD + DC;
  if (!okDp(AD, BC) || Math.abs(B - C) < 2) return null;
  return {
    prompt: `In triangle ABC, AB = ${show(c)} cm, angle B = ${show(B)}° and angle C = ${show(C)}°. D is the point on BC where AD is perpendicular to BC.${UNROUNDED}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("ad", "AD", "Length of AD", AD, "cm", `In triangle ABD (right angle at D), AB is the hypotenuse and AD is opposite angle B.`),
      part2("bc", "BC", "Length of BC", BC, "cm", `BC = BD + DC. Find BD in triangle ABD and DC in triangle ADC, which shares the side AD.`),
    ],
    explanation: [
      `AD splits the triangle into two right-angled triangles that share AD. Work through ABD first (you know its hypotenuse), then ADC.`,
      [given("_c", c), given("_angB", B), given("_angC", C), row("_AD", "_c * sin(_angB)", final(AD, "2dp", "cm")), row("_BD", "_c * cos(_angB)", mid(BD)), row("_DC", "_AD / tan(_angC)", mid(DC)), row("_BC", "_BD + _DC", final(BC, "2dp", "cm"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-alt", c, B, C },
    visual: triVis({ a: "?", c: ulab(c, "cm") }, { B: dlab(B), C: dlab(C) }, [BC, (c * sinD(B)) / sinD(C), c], true, "D is the foot of the perpendicular from A to BC"),
    hints: [
      `Sketch it: AD splits ABC into two right-angled triangles, ABD and ADC, with the right angles at D. They share the side AD.`,
      `In ABD the hypotenuse is AB = ${show(c)} cm: \`_AD = _c * sin(_angB)\` and \`_BD = _c * cos(_angB)\`.`,
      `In ADC, AD is opposite the ${show(C)}° angle and DC is adjacent, so \`_DC = _AD / tan(_angC)\`. Then add BD and DC, all unrounded.${LATE}`,
    ],
  };
}

// right-sides / expert 2: flagpole at a corner of a rectangular field (Pythagoras, then tan).
function xPoleField(rng) {
  const l = rng.int(20, 120);
  const w = rng.int(10, l - 5);
  const theta = dec1(rng, 8, 40);
  const AC = Math.sqrt(l * l + w * w);
  const h = AC * tanD(theta);
  const phi = atanD(h / w);
  if (!okDp(AC, h, phi) || phi >= 89) return null;
  return {
    prompt: `A rectangular field ABCD has AB = ${l} m and BC = ${w} m. A vertical flagpole stands at corner A. From corner C, the angle of elevation of the top of the pole is ${show(theta)}°.${UNROUNDED}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("ac", "AC", "Length of the diagonal AC", AC, "m", `The diagonal AC is the hypotenuse of the right-angled triangle ABC: use Pythagoras.`),
      part2("height", "Pole", "Height of the flagpole", h, "m", `In the vertical triangle A-C-top, the ground distance AC is adjacent to the ${show(theta)}° angle and the pole is opposite.`),
      part2("angle", "From D", "Angle of elevation of the top of the pole from corner D", phi, "°", `D is ${w} m from A (AD = BC). Opposite = the pole, adjacent = ${w} m: use atan.`),
    ],
    explanation: [
      `Two right-angled triangles: ABC on the ground (gives the diagonal), then a vertical one standing on AC (gives the height). From D, the ground distance is AD = BC = ${w} m.`,
      [given("_l", l), given("_w", w), given("_theta", theta), row("_AC", "sqrt(_l^2 + _w^2)", final(AC, "2dp", "m")), row("_h", "_AC * tan(_theta)", final(h, "2dp", "m")), row("_phi", "atan(_h / _w)", final(phi, "2dp", "°"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-pole", l, w, theta },
    visual: {
      kind: "shape", shape: "rectangle", dims: { width: l, height: w }, labels: { width: `AB = ${l} m`, height: `BC = ${w} m` },
      toScale: Math.max(l, w) / Math.min(l, w) <= 4, caption: "The field ABCD from above; the pole stands at A",
    },
    hints: [
      `Start on the ground: in triangle ABC the right angle is at B, so \`_AC = sqrt(_l^2 + _w^2)\`.`,
      `Now the vertical triangle with the pole: AC is adjacent to the ${show(theta)}° angle and the pole is opposite, so use TOA: \`_h = _AC * tan(_theta)\`.`,
      `From D, the pole is opposite the angle and AD = ${w} m is adjacent: \`atan(_h / _w)\`, with _h unrounded.${LATE}`,
    ],
  };
}

// right-angles / expert 0: angles of a cuboid's space diagonal.
function xCuboid(rng) {
  const l = rng.int(4, 30);
  const w = rng.int(2, l);
  const h = rng.int(2, 25);
  const AC = Math.sqrt(l * l + w * w);
  const base = atanD(h / AC);
  const AG = Math.sqrt(AC * AC + h * h);
  const edge = acosD(l / AG);
  if (!okDp(AC, base, edge) || Number.isInteger(clean(AC))) return null;
  return {
    prompt: `A cuboid ABCDEFGH has a rectangular base ABCD with AB = ${l} cm and BC = ${w} cm, and vertical edges AE, BF, CG and DH of ${h} cm. G is directly above C.${UNROUNDED}${DEG}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("ac", "AC", "Length of the base diagonal AC", AC, "cm", `Triangle ABC is right-angled at B.`),
      part2("base", "With base", "Angle between the space diagonal AG and the base ABCD", base, "°", `The angle with the base is angle GAC, in the right-angled triangle ACG (right angle at C). CG is opposite it, AC adjacent.`),
      part2("edge", "With AB", "Angle between AG and the edge AB", edge, "°", `In triangle ABG the right angle is at B, AB is adjacent to the angle at A and AG is the hypotenuse. Find AG with Pythagoras first.`),
    ],
    explanation: [
      `Find a right-angled triangle for each angle. The angle with the base sits in triangle ACG (right angle at C). The angle with AB sits in triangle ABG (right angle at B, because BG lies in the face BCGF, which is perpendicular to AB).`,
      [given("_l", l), given("_w", w), given("_h", h), row("_AC", "sqrt(_l^2 + _w^2)", final(AC, "2dp", "cm")), row("_base", "atan(_h / _AC)", final(base, "2dp", "°")), row("_AG", "sqrt(_AC^2 + _h^2)", mid(AG)), row("_edge", "acos(_l / _AG)", final(edge, "2dp", "°"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-cuboid", l, w, h },
    visual: {
      kind: "shape", shape: "cuboid", dims: { length: l, width: w, height: h }, labels: { length: `AB = ${l} cm`, width: `BC = ${w} cm`, height: `AE = ${h} cm` },
      toScale: Math.max(l, w, h) / Math.min(l, w, h) <= 4, caption: "ABCD is the base; G is directly above C",
    },
    hints: [
      `Start on the base: \`_AC = sqrt(_l^2 + _w^2)\`.`,
      `The space diagonal AG, the base diagonal AC and the edge CG = ${h} cm form a right-angled triangle with the right angle at C. The angle with the base is at A: CG is opposite, AC adjacent.`,
      `For the angle with AB, use triangle ABG: \`_AG = sqrt(_AC^2 + _h^2)\` is the hypotenuse and AB = ${l} cm is adjacent, so use acos.${LATE}`,
    ],
  };
}

// right-angles / expert 1: two legs at right angles; distance and bearing back to the start.
function xBearingBack(rng) {
  const who = rng.pick(["A hiker", "A cyclist", "A drone", "A boat"]);
  const b1 = rng.int(1, 359);
  const right = rng.next() < 0.5;
  const a = dec1(rng, 1.5, 20);
  const b = dec1(rng, 1.5, 20);
  const dist = Math.sqrt(a * a + b * b);
  const alpha = atanD(b / a);
  const out = mod360(b1 + (right ? alpha : -alpha));
  const back = mod360(out + 180);
  if (!okDp(dist) || !okBearing(back) || Math.abs(a - b) < 0.3) return null;
  XB.push(b1);
  return {
    prompt: `${who} travels ${show(a)} km from a start point S on a bearing of ${pad3(b1)}°, then turns 90° to the ${right ? "right" : "left"} and travels ${show(b)} km in a straight line to a point E.${BEARINGS}${UNROUNDED}${BEAR_ROUND}`,
    answerType: "multi",
    parts: [
      part2("dist", "Distance", "Straight-line distance from E back to S", dist, "km", `The two legs meet at a right angle, so the distance back is the hypotenuse.`),
      partBearing("bearing", "Bearing", "Bearing of S from E", back, `First find the bearing of E from S, then add or subtract 180° so the result lies from 0 to 360.`),
    ],
    explanation: [
      `S, the turning point T and E form a right-angled triangle with the right angle at T. The angle at S between the first leg and SE is \`atan(b / a)\`.`,
      `Turning ${right ? "right" : "left"} puts E ${right ? "clockwise" : "anticlockwise"} of the first bearing, so the bearing of E from S is ${pad3(b1)} ${right ? "+" : "-"} that angle. The bearing back is that plus or minus 180°.`,
      [given("_a", a), given("_b", b), given("_bear1", b1), row("_dist", "sqrt(_a^2 + _b^2)", final(dist, "2dp", "km")), row("_alpha", "atan(_b / _a)", mid(alpha)), row("_out", `_bear1 ${right ? "+" : "-"} _alpha`, mid(out) + (Math.abs(out - (b1 + (right ? alpha : -alpha))) > 1e-9 ? " (after wrapping into 0 to 360)" : "")), row("_back", "_out ± 180", finalDeg(back))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-bearing", b1, right, a, b },
    visual: {
      ...triVis({ a: ulab(b, "km"), b: "?", c: ulab(a, "km") }, {}, [b, dist, a], true, "S to the turning point, then on to E"),
      vertices: [{ label: "S" }, { label: null }, { label: "E" }],
      angles: [{ label: null }, { label: null, right: true }, { label: null }],
    },
    hints: [
      `Sketch it with a north line at S. The two legs meet at a right angle at the turning point, so S, the turning point and E make a right-angled triangle with legs ${show(a)} km and ${show(b)} km.`,
      `The distance SE is the hypotenuse. The angle at S between the first leg and SE is \`atan(_b / _a)\`: the second leg is opposite it.`,
      `Turning ${right ? "right" : "left"} means E is ${right ? "clockwise" : "anticlockwise"} from the ${pad3(b1)}° line, so ${right ? "add" : "subtract"} that angle to get the bearing of E from S. The bearing back is that ± 180°, kept between 0 and 360.${LATE_DEG}`,
    ],
  };
}

// right-angles / expert 2: a ladder's foot is pushed towards the wall.
function xLadderMove(rng) {
  const L = dec1(rng, 4, 12);
  const up = dec1(rng, L * 0.55, L - 0.4);
  const foot = Math.sqrt(L * L - up * up);
  const d = dec1(rng, 0.2, Math.max(0.2, foot * 0.6));
  const foot2 = foot - d;
  if (!(foot2 > 0.2)) return null;
  const ang1 = acosD(foot / L);
  const ang2 = acosD(foot2 / L);
  const up2 = Math.sqrt(L * L - foot2 * foot2);
  const rise = up2 - up;
  if (!okDp(ang1, ang2, rise) || ang2 >= 89) return null;
  return {
    prompt: `A ${show(L)} m ladder leans against a vertical wall and reaches ${show(up)} m up the wall. Its foot is then pushed ${show(d)} m closer to the wall.${UNROUNDED}${DEG}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("before", "Before", "Angle between the ladder and the ground before it moves", ang1, "°", `The ladder is the hypotenuse and the height up the wall is opposite the angle at the ground.`),
      part2("after", "After", "Angle between the ladder and the ground after it moves", ang2, "°", `Find the original distance from the wall with Pythagoras, subtract ${show(d)} m, then use cos = adjacent / hypotenuse.`),
      part2("rise", "Rise", "How much higher up the wall the top now reaches", rise, "m", `New height: Pythagoras with the new foot distance. Then subtract the old height.`),
    ],
    explanation: [
      `The ladder length stays ${show(L)} m. Find the foot's distance from the wall, move it, and redo the triangle.`,
      [given("_L", L), given("_up", up), given("_d", d), row("_ang1", "asin(_up / _L)", final(ang1, "2dp", "°")), row("_foot", "sqrt(_L^2 - _up^2)", mid(foot)), row("_foot2", "_foot - _d", mid(foot2)), row("_ang2", "acos(_foot2 / _L)", final(ang2, "2dp", "°")), row("_rise", "sqrt(_L^2 - _foot2^2) - _up", final(rise, "2dp", "m"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-ladder", L, up, d },
    // The foot's distance from the wall is left off on purpose (it is a step of the working, not in the
    // prompt, given rows or hints); the triangle is drawn to scale so it can be estimated.
    visual: rightVis({ opp: ulab(up, "m"), adj: null, hyp: ulab(L, "m"), theta: "?", lengths: { adj: foot, opp: up, hyp: L }, caption: "Before the foot is pushed closer", force: true }),
    hints: [
      `Before: the ladder (${show(L)} m) is the hypotenuse and the height ${show(up)} m is opposite the angle at the ground, so use asin.`,
      `The foot's distance from the wall is \`_foot = sqrt(_L^2 - _up^2)\`. After the push it is \`_foot - _d\`, and the ladder is still ${show(L)} m long.`,
      `After: \`acos(_foot2 / _L)\` for the angle, and \`sqrt(_L^2 - _foot2^2)\` for the new height. Subtract the old height for the rise.${LATE}`,
    ],
  };
}

// non-right / expert 0: the ambiguous case of the sine rule.
function xAmbiguous(rng) {
  const A = dec1(rng, 20, 65);
  const b = dec1(rng, 6, 35);
  const a = dec1(rng, b * sinD(A) + 0.3, b - 0.3);
  const s = (b * sinD(A)) / a;
  if (!(s > 0 && s < 1)) return null;
  const B1 = asinD(s);
  const B2 = 180 - B1;
  const C2 = 180 - A - B2;
  const c2 = (a * sinD(C2)) / sinD(A);
  if (B1 > 84 || C2 < 3 || !okDp(B1, B2, c2)) return null;
  return {
    prompt: `In triangle ABC, angle A = ${show(A)}°, side a = BC = ${show(a)} cm and side b = AC = ${show(b)} cm. Two different triangles fit these measurements.${UNROUNDED}${DEG}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("acute", "Acute B", "Angle B in the triangle where B is acute", B1, "°", `Sine rule for an angle: sin(B) = b × sin(A) / a, then asin.`),
      part2("obtuse", "Obtuse B", "Angle B in the triangle where B is obtuse", B2, "°", `sin(180° - x) = sin(x), so the other angle with the same sine is 180° minus the acute one.`),
      part2("c", "Side c", "Side c = AB in the triangle where B is obtuse", c2, "cm", `In the obtuse case, find C = 180 - A - B first, then use the sine rule again: c = a × sin(C) / sin(A).`),
    ],
    explanation: [
      `Side a is shorter than b but longer than b × sin(A), so the swinging side a can meet the base line in two places: the ambiguous case.`,
      [given("_angA", A), given("_a", a), given("_b", b), row("_sinB", "_b * sin(_angA) / _a", mid(s)), row("_B1", "asin(_sinB)", final(B1, "2dp", "°")), row("_B2", "180 - _B1", final(B2, "2dp", "°")), row("_C2", "180 - _angA - _B2", mid(C2)), row("_c2", "_a * sin(_C2) / sin(_angA)", final(c2, "2dp", "cm"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-ambig", A, a, b },
    hints: [
      `You know a side and its opposite angle (a and A), plus side b, so use the sine rule for B: \`sin(B) = b × sin(A) / a\` = ${show(b)} × sin(${show(A)}) ÷ ${show(a)}.`,
      `asin gives only the acute angle. Because sin(180° - x) = sin(x), the obtuse angle 180° - B also has that sine, and it still fits: A + (180° - B) is less than 180°.`,
      `For the obtuse triangle, the third angle is C = 180 - A - (obtuse B). Then \`c = a × sin(C) / sin(A)\`, with everything unrounded.${LATE}`,
    ],
  };
}

// non-right / expert 1: cosine rule -> angle -> perpendicular height.
function xChain(rng) {
  const b = dec1(rng, 3, 30);
  const c = dec1(rng, 3, 30);
  const A = dec1(rng, 25, 150);
  const a = Math.sqrt(b * b + c * c - 2 * b * c * cosD(A));
  const B = acosD((a * a + c * c - b * b) / (2 * a * c));
  const area = 0.5 * b * c * sinD(A);
  const ht = (2 * area) / a;
  if (!okDp(a, B, ht) || Math.abs(b - c) < 0.5) return null;
  return {
    prompt: `In triangle ABC, side b = AC = ${show(b)} cm, side c = AB = ${show(c)} cm and angle A = ${show(A)}°.${UNROUNDED}${ROUND}`,
    answerType: "multi",
    parts: [
      part2("a", "Side a", "Side a = BC", a, "cm", `Two sides and the angle between them: cosine rule.`),
      part2("angb", "Angle B", "Angle B", B, "°", `Three sides are now known: \`cos(B) = (a² + c² - b²) / (2ac)\`, then acos. This works even if B is obtuse.`),
      part2("height", "Height", "Perpendicular distance from A to the line BC", ht, "cm", `Area = ½ × b × c × sin(A), and also area = ½ × BC × height. Rearrange for the height.`),
    ],
    explanation: [
      `Cosine rule for a, the rearranged cosine rule for B (safer than the sine rule, which can't tell an obtuse angle from its acute partner), then the area two ways.`,
      [given("_b", b), given("_c", c), given("_angA", A), row("_a", "sqrt(_b^2 + _c^2 - 2 * _b * _c * cos(_angA))", final(a, "2dp", "cm")), row("_angB", "acos((_a^2 + _c^2 - _b^2) / (2 * _a * _c))", final(B, "2dp", "°")), row("_area", "0.5 * _b * _c * sin(_angA)", mid(area)), row("_ht", "2 * _area / _a", final(ht, "2dp", "cm"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-chain", b, c, A },
    visual: triVis({ a: "?", b: ulab(b, "cm"), c: ulab(c, "cm") }, { A: dlab(A) }, [a, b, c]),
    hints: [
      `Start with the cosine rule: \`_a = sqrt(_b^2 + _c^2 - 2 * _b * _c * cos(_angA))\`. Keep it unrounded.`,
      `For angle B use the cosine rule rearranged: \`cos(B) = (a² + c² - b²) / (2ac)\`. The side you subtract, b, is the one opposite B.`,
      `The height from A meets BC at a right angle, so area = ½ × a × height. Work out the area from \`0.5 * _b * _c * sin(_angA)\`, then divide 2 × area by _a.${LATE}`,
    ],
  };
}

// non-right / expert 2: two legs on bearings that don't meet at a right angle (cosine rule).
function xBearingCos(rng) {
  const who = rng.pick(["A ship", "A yacht", "A plane", "A ferry"]);
  const b1 = rng.int(1, 359);
  const t = rng.int(25, 155);
  const right = rng.next() < 0.5;
  const d1 = dec1(rng, 5, 60);
  const d2 = dec1(rng, 5, 60);
  const b2 = mod360(b1 + (right ? t : -t));
  const Bang = 180 - t;
  const AC = Math.sqrt(d1 * d1 + d2 * d2 - 2 * d1 * d2 * cosD(Bang));
  const angA = acosD((d1 * d1 + AC * AC - d2 * d2) / (2 * d1 * AC));
  const bear = mod360(b1 + (right ? angA : -angA));
  // Working from PR rounded to 2 decimal places must give the same whole-degree bearing.
  const angA2 = acosD((d1 * d1 + round2(AC) ** 2 - d2 * d2) / (2 * d1 * round2(AC)));
  const bear2 = mod360(b1 + (right ? angA2 : -angA2));
  if (b2 === 0 || !okDp(AC) || !okBearing(bear) || Math.round(bear2) !== Math.round(bear)) return null;
  XB.push(b1, b2);
  return {
    prompt: `${who} leaves port P and travels ${show(d1)} km on a bearing of ${pad3(b1)}° to a point Q. It then changes course and travels ${show(d2)} km on a bearing of ${pad3(b2)}° to a point R.${BEARINGS}${UNROUNDED}${BEAR_ROUND}`,
    answerType: "multi",
    parts: [
      part2("dist", "Distance", "Distance PR", AC, "km", `Find the angle inside the triangle at Q from the change of course, then use the cosine rule.`),
      partBearing("bearing", "Bearing", "Bearing of R from P", bear, `Find the angle QPR with the cosine rule rearranged, then add it to or subtract it from ${pad3(b1)}°.`),
    ],
    explanation: [
      `The course changes by ${t}° (${right ? "clockwise" : "anticlockwise"}), so the angle inside triangle PQR at Q is 180° - ${t}° = ${Bang}°.`,
      `Cosine rule for PR, then the rearranged cosine rule for the angle at P. R is ${right ? "clockwise" : "anticlockwise"} of the first course, so ${right ? "add" : "subtract"} that angle${right ? " to" : " from"} ${pad3(b1)}°.`,
      [given("_d1", d1), given("_d2", d2), given("_bear1", b1), given("_bear2", b2), fact("_angQ", Bang), row("_PR", "sqrt(_d1^2 + _d2^2 - 2 * _d1 * _d2 * cos(_angQ))", final(AC, "2dp", "km")), row("_angP", "acos((_d1^2 + _PR^2 - _d2^2) / (2 * _d1 * _PR))", mid(angA)), row("_bear", `_bear1 ${right ? "+" : "-"} _angP`, finalDeg(bear) + (Math.abs(bear - (b1 + (right ? angA : -angA))) > 1e-9 ? " (after wrapping into 0 to 360)" : ""))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-bearcos", b1, b2, d1, d2 },
    visual: {
      ...triVis({ a: ulab(d2, "km"), b: "?", c: ulab(d1, "km") }, {}, [d2, AC, d1], true, "Q is where the course changes"),
      vertices: [{ label: "P" }, { label: "Q" }, { label: "R" }],
    },
    hints: [
      `Sketch it with a north line at P and at Q. The course turns from ${pad3(b1)}° to ${pad3(b2)}°, a change of ${t}°, so the angle inside the triangle at Q is 180° - ${t}°.`,
      `Cosine rule for PR: \`PR² = d1² + d2² - 2 × d1 × d2 × cos(Q)\`. Keep PR unrounded (\`_PR\`).`,
      `Angle at P: \`cos(P) = (d1² + PR² - d2²) / (2 × d1 × PR)\`. R lies ${right ? "clockwise" : "anticlockwise"} of the first course, so ${right ? "add P to" : "subtract P from"} ${pad3(b1)}° (wrap into 0 to 360 if needed).${LATE_DEG}`,
    ],
  };
}

// ---- Expert "read it off the picture" templates (ticket 026): the angle is left off on purpose ----
// The triangle is drawn to scale from the true angle (a multiple of 5°). The learner picks the closest of
// four options at least 15° apart, then works out lengths from that angle. The angle, and the lengths that
// depend on it, never appear in the prompt, the given rows, the hints or the part asks: `leaks()` redraws
// the question if any of them would.
const estOptions = (rng, ang, lo, hi) => {
  const ks = [0, 1, 2, 3].filter((k) => ang - 15 * k >= lo && ang - 15 * k + 45 <= hi);
  if (!ks.length) return null;
  const s = ang - 15 * ks[rng.int(0, ks.length - 1)];
  return rng.shuffle([0, 1, 2, 3].map((i) => `${s + 15 * i}°`));
};
const textOfQ = (q) => [q.prompt, ...(q.hints || []), ...q.parts.flatMap((p) => [p.ask, p.hint, p.label])].join("\n");
const leaks = (q, omitted) => omitted.some((v) => inPrompt(textOfQ(q), v) || inPrompt(textOfQ(q), round2(v)));

// right-angles / expert: right triangle with the hypotenuse labelled; estimate θ, then both legs.
function xEstRight(rng) {
  const H = rng.int(8, 60);
  const theta = 5 * rng.int(4, 14);
  const opts = estOptions(rng, theta, 10, 80);
  if (!opts) return null;
  const opp = H * sinD(theta);
  const adj = H * cosD(theta);
  if (!okDp(opp, adj)) return null;
  const q = {
    prompt: `A right-angled triangle is drawn to scale. Its hypotenuse is ${H} cm. The angle θ is not given: estimate it from the diagram, then use that angle.${UNROUNDED}${ROUND}`,
    answerType: "multi",
    parts: [
      { id: "angle", label: "Angle θ", ask: "Which of these is closest to θ, judging from the diagram?", answerType: "choice", answer: `${theta}°`, choices: opts, hint: "θ is the angle at the bottom right. Compare it with the right-angle corner and with half of a right angle, then rule options out by eye." },
      part2("opp", "Opposite", "Length of the side opposite θ, using the angle you chose", opp, "cm", "The hypotenuse is known and θ is chosen: opposite = hypotenuse × sin(θ)."),
      part2("adj", "Adjacent", "Length of the side adjacent to θ, using the angle you chose", adj, "cm", "Adjacent = hypotenuse × cos(θ)."),
    ],
    explanation: [
      `Measuring the picture against a right angle gives θ = **${theta}°** (the triangle was drawn from that angle).`,
      [fact("_theta", theta), given("_H", H), row("_opp", "_H * sin(_theta)", final(opp, "2dp", "cm")), row("_adj", "_H * cos(_theta)", final(adj, "2dp", "cm"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-estR", H },
    visual: rightVis({ opp: null, adj: null, hyp: ulab(H, "cm"), theta: "θ", lengths: { adj, hyp: H, opp }, force: true }),
    hints: [
      "The hypotenuse is the side opposite the right angle. Estimate θ first: compare it with the right-angle corner, and with half of one.",
      "Once you have chosen θ, the side opposite it comes from sine and the side next to it from cosine, both with the hypotenuse.",
      `Use your chosen angle in the calculator and keep the values unrounded.${LATE}`,
    ],
  };
  return leaks(q, [theta, opp, adj]) ? null : q;
}

// non-right / expert: triangle ABC with BC and CA labelled; estimate angle C, then AB and the area.
function xEstGeneral(rng) {
  const a = rng.int(6, 30);
  const b = rng.int(6, 30);
  const C = 5 * rng.int(8, 24);
  const opts = estOptions(rng, C, 20, 160);
  if (!opts || Math.max(a, b) / Math.min(a, b) > 2.5) return null;
  const c = Math.sqrt(a * a + b * b - 2 * a * b * cosD(C));
  const area = 0.5 * a * b * sinD(C);
  if (!okDp(c, area) || !fatEnough([a, b, c])) return null;
  const q = {
    prompt: `In triangle ABC, BC = ${a} cm and CA = ${b} cm. The triangle is drawn to scale, but angle C is not given: estimate it from the diagram, then use that angle.${UNROUNDED}${ROUND}`,
    answerType: "multi",
    parts: [
      { id: "angle", label: "Angle C", ask: "Which of these is closest to angle C, judging from the diagram?", answerType: "choice", answer: `${C}°`, choices: opts, hint: "Angle C is between the two sides you know. Compare it with a right angle and with half of one, then rule options out by eye." },
      part2("ab", "AB", "Length of AB, using the angle you chose", c, "cm", "AB is opposite angle C: use the cosine rule with BC, CA and C."),
      part2("area", "Area", "Area of the triangle, using the angle you chose", area, "cm²", "Area = ½ × BC × CA × sin(C)."),
    ],
    explanation: [
      `Comparing angle C with a right angle gives **${C}°** (the triangle was drawn from that angle).`,
      [fact("_angC", C), given("_a", a), given("_b", b), row("_AB", "sqrt(_a^2 + _b^2 - 2 * _a * _b * cos(_angC))", final(c, "2dp", "cm")), row("_area", "0.5 * _a * _b * sin(_angC)", final(area, "2dp", "cm²"))].join("\n"),
    ].join("\n\n"),
    params: { kind: "x-estG", a, b },
    visual: triVis({ a: ulab(a, "cm"), b: ulab(b, "cm") }, { C: "?" }, [a, b, c], true),
    hints: [
      "Estimate angle C first: it sits between the two sides you are given. Compare it with a right angle, and with half of one.",
      "With C chosen, the cosine rule gives the side opposite it: AB² = BC² + CA² - 2 × BC × CA × cos(C).",
      `For the area use two sides and the angle between them. Keep values unrounded.${LATE}`,
    ],
  };
  return leaks(q, [C, c, area]) ? null : q;
}

const XGENS = {
  "right-sides": [xElevTwo, xAltitude, xPoleField],
  "right-angles": [xCuboid, xBearingBack, xLadderMove, xEstRight],
  "non-right": [xAmbiguous, xChain, xBearingCos, xEstGeneral],
};

function genExpert(subtopic, rng) {
  const list = XGENS[subtopic];
  if (!list) throw new Error(`Subtopic ${subtopic} has no expert level`);
  for (let t = 0; t < 200; t++) {
    GIVEN = [];
    XB = [];
    const q = list[rng.int(0, list.length - 1)](rng);
    if (q) {
      const out = attachGivenExpert(q);
      GIVEN = null;
      XB = null;
      return out;
    }
  }
  GIVEN = null;
  XB = null;
  throw new Error(`Could not build a ${subtopic}/expert question`);
}

const GENS = { "exact-values": genExact, "right-sides": genRightSides, "right-angles": genRightAngles, "non-right": genNonRight };

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
// Independent check: rebuild the value by another route — co-function identities for right
// triangles, atan2 instead of asin/acos/atan, coordinates and Heron's formula for general triangles.

function rightSideAlt(have, g, theta, want) {
  const phi = 90 - theta; // the other acute angle: sin θ = cos φ, tan θ = 1 / tan φ
  let opp, adj, hyp;
  if (have === "hyp") [hyp, opp, adj] = [g, g * cosD(phi), g * sinD(phi)];
  else if (have === "opp") [opp, hyp, adj] = [g, g / cosD(phi), g * tanD(phi)];
  else [adj, hyp, opp] = [g, g / sinD(phi), g / tanD(phi)];
  return { opp, adj, hyp }[want];
}

function angleAlt(p) {
  let o = p.o;
  let a = p.a;
  if (o === undefined) o = Math.sqrt(p.h * p.h - a * a);
  if (a === undefined) a = Math.sqrt(p.h * p.h - o * o);
  return Math.atan2(o, a) / RAD;
}

// Vertices B = (0,0), C = (a,0); A from the side lengths c = AB, b = AC.
function vertexA(a, b, c) {
  const x = (a * a + c * c - b * b) / (2 * a);
  return [x, Math.sqrt(Math.max(0, c * c - x * x))];
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const heron = (a, b, c) => {
  const s = (a + b + c) / 2;
  return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
};
function angleAtA(a, b, c) {
  const A = vertexA(a, b, c);
  const v1 = [-A[0], -A[1]];
  const v2 = [a - A[0], -A[1]];
  return Math.atan2(Math.abs(v1[0] * v2[1] - v1[1] * v2[0]), v1[0] * v2[0] + v1[1] * v2[1]) / RAD;
}

function exactOf(p) {
  switch (p.kind) {
    case "work-out": {
      const ev = (s) => {
        const m = /^(sin|cos|tan)\((\d+)\)(\^2)?$/.exec(s);
        if (!m) return NaN;
        const v = FN[m[1]](Number(m[2]));
        return m[3] ? v * v : v;
      };
      return p.k1 * ev(p.c1) + p.k2 * ev(p.c2);
    }
    case "side":
      return rightSideAlt(p.have, p.g, p.theta, p.want);
    case "elevation":
      return p.d / tanD(90 - p.theta) + p.eye;
    case "two-angles":
      return p.h * (tanD(90 - p.a1) - tanD(90 - p.a2));
    case "angle":
      return angleAlt(p);
    case "sine-side":
    case "sine-asa": {
      // Place B = (0,0), C = (a,0) and intersect the rays from B and C.
      const C = 180 - p.A - p.B;
      if (p.kind === "sine-side") {
        const tB = Math.tan(p.B * RAD);
        const tC = Math.tan(C * RAD);
        const x = (p.a * tC) / (tB + tC);
        return dist([x, x * tB], [p.a, 0]); // b = AC
      }
      // c = AB known: A = (c cos B, c sin B); the ray from C meets the x-axis at angle C.
      const A = [p.c * cosD(p.B), p.c * sinD(p.B)];
      return A[0] + A[1] / tanD(C); // a = BC
    }
    case "sine-angle": {
      // Cosine rule for c: c² - 2bc·cos A + b² - a² = 0, positive root; then the angle at B.
      const k = p.b * cosD(p.A);
      const c = k + Math.sqrt(k * k - p.b * p.b + p.a * p.a);
      return angleAtA(p.b, p.a, c); // the angle opposite side b, measured with b in the "a" slot
    }
    case "cos-side": {
      const Apt = [p.c, 0];
      const Cpt = [p.b * cosD(p.A), p.b * sinD(p.A)];
      return dist(Apt, Cpt);
    }
    case "cos-angle": {
      const { a, b, c } = p;
      if (p.lab === "A") return angleAtA(a, b, c);
      if (p.lab === "B") return angleAtA(b, a, c);
      return angleAtA(c, a, b);
    }
    case "area": {
      // third side from coordinates, then Heron's formula
      const c = dist([p.a, 0], [p.b * cosD(p.C), p.b * sinD(p.C)]);
      return heron(p.a, p.b, c);
    }
    case "area-sss":
      return heron(p.a, p.b, p.c);
    default:
      return NaN;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.kind) return false;
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, answer, question);

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  if (answer === "" || answer === null || answer === undefined) return false;

  if (p.kind === "value") {
    // The chosen exact value must equal the function at that angle.
    const s = String(answer);
    if (!(s in SURD)) return false;
    if (p.f === "tan" && p.angle === 90) return false;
    return Math.abs(SURD[s] - FN[p.f](p.angle)) < 1e-9;
  }

  const x = Number(answer);
  if (!Number.isFinite(x)) return false;

  if (p.kind === "inv-exact") {
    // exact-values "angle": a whole number of degrees in [0, 90] with f(x) = the value
    if (!Number.isInteger(x) || x < 0 || x > 90) return false;
    if (p.f === "tan" && x === 90) return false;
    const target = Number(Object.prototype.hasOwnProperty.call(SURD, p.val) ? SURD[p.val] : NaN);
    return Math.abs(FN[p.f](x) - target) < 1e-9;
  }

  const exact = exactOf(p);
  if (!Number.isFinite(exact)) return false;
  if (p.fmt === "2dp") return Math.abs(x - exact) <= 0.005 + 1e-9;
  return Math.abs(x - exact) <= 1e-9 * Math.max(1, Math.abs(exact));
}

// ---- Expert verification: rebuild each figure by another route (coordinates, vectors, the
// sine rule instead of tan, atan2 instead of asin/acos) and compare every part.

const angleBetween = (u, v) => {
  const dot = u.reduce((s, x, i) => s + x * v[i], 0);
  const cr = u.length === 2 ? Math.abs(u[0] * v[1] - u[1] * v[0])
    : Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  return Math.atan2(cr, dot) / RAD;
};
// Bearing of the vector (east, north), clockwise from north.
const bearingOf = (e, n) => mod360(Math.atan2(e, n) / RAD);
const step = (bear, d) => [d * Math.sin(bear * RAD), d * Math.cos(bear * RAD)];

function expertExact(p) {
  switch (p.kind) {
    case "x-elev2": {
      // Triangle P-Q-top: angle at top = a2 - a1; sine rule gives Q-top.
      const qt = (p.d * Math.sin(p.a1 * RAD)) / Math.sin((p.a2 - p.a1) * RAD);
      return { dist: qt * Math.cos(p.a2 * RAD), height: qt * Math.sin(p.a2 * RAD) };
    }
    case "x-alt": {
      // Sine rule for BC, then place B = (0,0), C = (BC,0) and intersect the rays from B and C.
      const A = 180 - p.B - p.C;
      const bc = (p.c * Math.sin(A * RAD)) / Math.sin(p.C * RAD);
      const tB = Math.tan(p.B * RAD);
      const tC = Math.tan(p.C * RAD);
      const x = (bc * tC) / (tB + tC);
      return { ad: x * tB, bc };
    }
    case "x-pole": {
      const ac = Math.hypot(p.l, p.w);
      const h = ac / Math.tan((90 - p.theta) * RAD);
      // Pole top at (0,0,h); D at (0,w,0): angle between D->top and the ground.
      return { ac, height: h, angle: angleBetween([0, -p.w, h], [0, -p.w, 0]) };
    }
    case "x-cuboid": {
      const g = [p.l, p.w, p.h];
      return { ac: Math.hypot(p.l, p.w), base: angleBetween(g, [p.l, p.w, 0]), edge: angleBetween(g, [1, 0, 0]) };
    }
    case "x-bearing": {
      const s1 = step(p.b1, p.a);
      const s2 = step(p.b1 + (p.right ? 90 : -90), p.b);
      const e = s1[0] + s2[0];
      const n = s1[1] + s2[1];
      return { dist: Math.hypot(e, n), bearing: bearingOf(-e, -n) };
    }
    case "x-ladder": {
      const f1 = Math.sqrt(p.L * p.L - p.up * p.up);
      const f2 = f1 - p.d;
      const h2 = Math.sqrt(p.L * p.L - f2 * f2);
      return { before: Math.atan2(p.up, f1) / RAD, after: Math.atan2(h2, f2) / RAD, rise: h2 - p.up };
    }
    case "x-ambig": {
      // A = (0,0), C = (b,0), B = t(cos A, sin A) with |BC| = a: t² - 2bt·cos A + b² - a² = 0.
      const k = p.b * Math.cos(p.A * RAD);
      const disc = k * k - p.b * p.b + p.a * p.a;
      if (!(disc > 0)) return null;
      const out = [k - Math.sqrt(disc), k + Math.sqrt(disc)].map((t) => {
        const B = [t * Math.cos(p.A * RAD), t * Math.sin(p.A * RAD)];
        return { t, ang: angleBetween([-B[0], -B[1]], [p.b - B[0], -B[1]]) };
      });
      if (!(out[0].t > 0)) return null;
      // The shorter AB gives the obtuse angle at B.
      return { acute: out[1].ang, obtuse: out[0].ang, c: out[0].t };
    }
    case "x-chain": {
      const A = [0, 0];
      const B = [p.c, 0];
      const C = [p.b * Math.cos(p.A * RAD), p.b * Math.sin(p.A * RAD)];
      const bc = [C[0] - B[0], C[1] - B[1]];
      const len = Math.hypot(bc[0], bc[1]);
      const height = Math.abs(bc[0] * (A[1] - B[1]) - bc[1] * (A[0] - B[0])) / len;
      return { a: len, angb: angleBetween([A[0] - B[0], A[1] - B[1]], bc), height };
    }
    case "x-bearcos": {
      const s1 = step(p.b1, p.d1);
      const s2 = step(p.b2, p.d2);
      const e = s1[0] + s2[0];
      const n = s1[1] + s2[1];
      return { dist: Math.hypot(e, n), bearing: bearingOf(e, n) };
    }
    default:
      return null;
  }
}

// The estimate templates: the angle is drawn from the visual itself (lengths -> atan2 / cosine rule), so the
// check does not trust the generator's params. The chosen option must be the closest one to the drawn angle.
function verifyEst(p, answer, question) {
  const v = sanitizeVisual(question && question.visual);
  if (!v || v.kind !== "triangle" || !v.toScale || !v.lengths) return false;
  const choices = ((question.parts || []).find((x) => x.id === "angle") || {}).choices;
  if (!Array.isArray(choices) || choices.length !== 4) return false;
  const opts = choices.map((s) => (/^(\d+)°$/.exec(String(s)) || [])[1]).map(Number);
  if (opts.some((n) => !Number.isFinite(n)) || new Set(opts).size !== 4) return false;
  const sorted = [...opts].sort((x, y) => x - y);
  if (sorted.some((n, i) => i && n - sorted[i - 1] < 12)) return false;
  const m = /^(\d+)°$/.exec(String(answer.angle));
  if (!m) return false;
  const chosen = Number(m[1]);
  const L = v.lengths;
  let drawn;
  if (p.kind === "x-estR") {
    if (!v.angles[1].right || Math.abs(L[1] - p.H) > 1e-9) return false;
    drawn = Math.atan2(L[2], L[0]) / RAD; // angle at C: opposite AB over adjacent BC
  } else {
    if (Math.abs(L[0] - p.a) > 1e-9 || Math.abs(L[1] - p.b) > 1e-9) return false;
    drawn = Math.acos((L[0] * L[0] + L[1] * L[1] - L[2] * L[2]) / (2 * L[0] * L[1])) / RAD;
  }
  if (!opts.includes(chosen) || Math.abs(chosen - drawn) > 0.01) return false;
  if (opts.some((o) => o !== chosen && Math.abs(o - drawn) <= Math.abs(chosen - drawn))) return false;
  const near = (id, truth) => answer[id] !== "" && Number.isFinite(Number(answer[id])) && Math.abs(Number(answer[id]) - truth) <= 0.005 + 1e-9;
  if (p.kind === "x-estR") {
    const t = Math.tan(chosen * RAD);
    return near("opp", (L[1] * t) / Math.sqrt(1 + t * t)) && near("adj", L[1] / Math.sqrt(1 + t * t));
  }
  const ab = Math.sqrt(L[0] * L[0] + L[1] * L[1] - 2 * L[0] * L[1] * Math.cos(chosen * RAD));
  return near("ab", ab) && near("area", heron(L[0], L[1], ab));
}

function verifyExpert(p, answer, question) {
  if (!answer || typeof answer !== "object") return false;
  if (p.kind === "x-estR" || p.kind === "x-estG") return verifyEst(p, answer, question);
  const ex = expertExact(p);
  if (!ex) return false;
  for (const [id, v] of Object.entries(ex)) {
    const raw = answer[id];
    if (raw === "" || raw === null || raw === undefined || typeof raw === "boolean") return false;
    const x = Number(raw);
    if (!Number.isFinite(x) || !Number.isFinite(v)) return false;
    // Bearings are whole degrees: the integer within half a degree of the exact bearing.
    if (id === "bearing" && (p.kind === "x-bearing" || p.kind === "x-bearcos")) {
      if (!Number.isInteger(x) || Math.abs(x - v) > 0.5) return false;
    } else if (Math.abs(x - v) > 0.005 + 1e-9) return false;
  }
  return true;
}
