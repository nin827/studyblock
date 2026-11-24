// Trigonometry generator. Uses only the seeded rng passed in by the engine.
// Degrees everywhere (the quiz calculator's sin/cos/tan also work in degrees).
// Each question's params.fmt says how the answer is given:
//   "2dp"    rounded to 2 decimals, tolerance 0.005 (exact values sitting on a half are regenerated)
//   "exact"  an exact decimal, tolerance 0
//   "whole"  a whole number, tolerance 0
//   "surd"   a choice between exact values like "√3/2" (exact-values subtopic only)
// Explanations list every step as a labelled calculator row, e.g. `_opp = _hyp * sin(_angle)` → 6.88.

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
    hints: angleHints(sides),
  };
  return finish(base, exact, "2dp", angleMistakes(sides, exact), rng, { max: 90 });
}

function genRightAngleWord(rng) {
  const kind = rng.pick(["ladder", "slope", "shadow", "isosceles", "rectangle"]);
  let sides, prompt, intro, unit;
  if (kind === "ladder") {
    const L = dec1(rng, 3, 12);
    const up = dec1(rng, L * 0.5, L - 0.2);
    sides = { o: up, h: L };
    unit = "m";
    prompt = `A ${show(L)} m ladder leans against a vertical wall and reaches ${show(up)} m up the wall. What angle does the ladder make with the level ground?`;
    intro = `The ladder is the hypotenuse and the wall height is opposite the angle at the ground.`;
  } else if (kind === "slope") {
    const run = rng.int(20, 400);
    const rise = dec1(rng, 1, Math.min(run * 0.6, 120));
    sides = { o: rise, a: run };
    unit = "m";
    prompt = `A straight road rises ${show(rise)} m over a horizontal distance of ${run} m. At what angle is the road inclined to the horizontal?`;
    intro = `The rise is opposite the angle and the horizontal distance is adjacent.`;
  } else if (kind === "shadow") {
    const h = dec1(rng, 1, 30);
    const s = dec1(rng, 1, 40);
    sides = { o: h, a: s };
    unit = "m";
    prompt = `A vertical pole ${show(h)} m tall casts a shadow ${show(s)} m long on level ground. What is the angle of elevation of the sun?`;
    intro = `The pole is opposite the angle at the tip of the shadow, and the shadow is adjacent.`;
  } else if (kind === "isosceles") {
    const s = rng.int(5, 40);
    const b = rng.int(2, 2 * s - 1);
    sides = { a: b / 2, h: s };
    unit = "cm";
    prompt = `An isosceles triangle has two equal sides of ${s} cm and a base of ${b} cm. Find the size of one of its base angles.`;
    intro = `Split the triangle down the middle into two right-angled triangles: the hypotenuse is ${s} cm and the side adjacent to the base angle is half the base, ${show(b / 2)} cm.`;
  } else {
    const l = rng.int(5, 60);
    const w = rng.int(2, l - 1);
    sides = { o: w, a: l };
    unit = "cm";
    prompt = `A rectangle is ${l} cm long and ${w} cm wide. Find the angle between a diagonal and one of the longer sides.`;
    intro = `The diagonal splits the rectangle into two right-angled triangles. At a corner on a long side, the width is opposite the angle and the length is adjacent.`;
  }
  const exact = rightAngle(sides);
  if (!(exact > 2 && exact < 88)) return null;
  const st = angleRow(sides);
  const base = {
    prompt: `${prompt}${DEG}${ROUND}`,
    explanation: [`${intro} Use ${st.word}.`, [...sideLines(sides, kind === "isosceles"),row("_theta", st.expr, final(exact, "2dp", "°"))].join("\n")].join("\n\n"),
    params: { kind: "angle", ...sides, unit },
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
    hints: [
      `Area = ½ × a × b × sin(C) needs an angle, so find one first with the cosine rule.`,
      `Call the sides a = ${a}, b = ${b}, c = ${c}. Angle C is opposite c: \`cos(C) = (a² + b² - c²) / (2ab)\` = (${a}² + ${b}² - ${c}²) ÷ (2 × ${a} × ${b}). Use acos and keep C unrounded (\`_angC\`).`,
      `Now \`0.5 * _a * _b * sin(_angC)\`.${LATE}`,
    ],
  };
  return finish(base, exact, "2dp", [a * b * sinD(C), 0.5 * a * b * cosC, 0.5 * a * b, 0.5 * a * c * sinD(C), (a * b * c) / 4 / 10], rng);
}

const GENS = { "exact-values": genExact, "right-sides": genRightSides, "right-angles": genRightAngles, "non-right": genNonRight };

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
