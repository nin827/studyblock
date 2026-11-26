// Kinematics generator. Uses only the seeded rng passed in by the engine.
// Units: m, s, m/s, m/s². Easy/medium answers are whole numbers; hard answers are rounded to 2 decimals.

// Rounding half away from zero (round1 keeps given values like 2.3 + 1.1 from printing as 3.4000000000000004),
// answer strings (2 dp) and intermediate numbers (up to 4 dp) come from mathutil.
import { fmtAnswer as fmtAns, fmtNum, round1, round2 } from "../../js/lib/mathutil.js";
// Chart reading (Expert): the picture's own data is validated and its gridlines used in verify().
import { sanitizeVisual, visualAxes } from "../../js/lib/visual.js";
const num = (n) => fmtNum(n);

// Negative numbers in brackets when substituted into a formula.
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));

function intWithMinAbs(rng, lo, hi, minAbs) {
  let v;
  do {
    v = rng.int(lo, hi);
  } while (Math.abs(v) < minAbs);
  return v;
}

// Pre-filled calculator rows from the stated inputs: { u: 3, t: 5 } -> [{ label: "_u", value: 3 }, ...].
// skip lists inputs the prompt only states in words ("from rest" for u = 0).
const givenFrom = (values, skip = []) =>
  Object.entries(values)
    .filter(([k]) => !skip.includes(k))
    .map(([k, value]) => ({ label: `_${k}`, value }));

const WHO = ["A cyclist", "A runner", "A car", "A train", "A skateboarder", "A delivery drone", "A sprinter", "A bus"];

// Rough real-world limits per subject: [top speed m/s, largest |acceleration| m/s²].
const LIMITS = {
  "A cyclist": [20, 3], "A runner": [10, 4], "A car": [50, 8], "A train": [90, 2],
  "A skateboarder": [15, 3], "A delivery drone": [40, 10], "A sprinter": [12, 8], "A bus": [30, 2],
  "A racing car": [90, 12], "A rocket": [3000, 40],
};
// Used only when no subject in WHO fits the numbers.
const FALLBACK = ["A racing car", "A rocket"];

// Keep the drawn subject when the numbers suit it; otherwise the next subject in WHO that does,
// else a racing car or rocket, else a neutral "An object" (so a "runner" never does 200 m/s). No rng calls: the numbers drawn
// for each seed are unchanged, only the wording.
function realistic(prompt, who, speeds, accels) {
  const vMax = Math.max(0, ...speeds.filter(Number.isFinite).map(Math.abs));
  const aMax = Math.max(0, ...accels.filter(Number.isFinite).map(Math.abs));
  const fits = (w) => vMax <= LIMITS[w][0] && aMax <= LIMITS[w][1];
  const i = WHO.indexOf(who);
  const order = [...WHO.map((_, k) => WHO[(i + k) % WHO.length]), ...FALLBACK];
  const pick = order.find(fits) || "An object";
  return pick === who ? prompt : pick + prompt.slice(who.length);
}

// Final line of an explanation: "= **15 m/s**" or "≈ 14.2857 m/s, which rounds to **14.29 m/s**".
function result(exact, rounded, unit) {
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown} ${unit}**`;
  return `≈ ${exact.toFixed(4)} ${unit}, which rounds to **${shown} ${unit}**`;
}

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors; positive quantities get no negative options.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Turn a solved question into either a typed-number or a multiple-choice question.
function finish(base, exact, rounded, candidates, rng) {
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

// ---- Question visuals (ticket 026): built only from values already drawn, no rng calls ----
// Easy to Hard draw only quantities the prompt states, so no visual gives away the answer.

const clean = (x) => Math.round(x * 1e6) / 1e6; // no float noise in plotted values
const withVisual = (v) => (v ? { visual: v } : {});

// A straight line on a time axis through the given points (all stated values).
const lineGraph = (caption, name, yLabel, points, extra = {}) => ({
  kind: "line",
  caption,
  series: [{ name, points: points.map(([x, y]) => [clean(x), clean(y)]) }],
  xLabel: "Time (s)",
  yLabel,
  xMin: 0,
  showPoints: true,
  ...extra,
});

function genSpeed(difficulty, rng) {
  const rounded = difficulty === "hard";
  const unknown = rng.pick(["v", "d", "t"]);
  const who = rng.pick(WHO);
  let v, d, t;
  if (difficulty === "easy") {
    v = rng.int(2, 15);
    t = rng.int(2, 12);
    d = v * t;
  } else if (difficulty === "medium") {
    v = rng.int(4, 40);
    t = rng.int(11, 90);
    d = v * t;
  } else if (difficulty === "hard") {
    if (unknown === "d") {
      v = rng.int(35, 450) / 10;
      t = rng.int(5, 120);
    } else if (unknown === "v") {
      d = rng.int(100, 5000);
      t = rng.int(7, 200);
    } else {
      d = rng.int(100, 5000);
      v = rng.int(35, 450) / 10;
    }
  } else {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }

  const end = rounded ? " Round to 2 decimal places." : "";
  const thenRound = rounded ? " Then round to 2 decimal places." : "";
  let prompt, exact, unit, explanation, candidates, values, hints;
  if (unknown === "v") {
    exact = d / t;
    unit = "m/s";
    values = { d, t };
    prompt = `${who} covers ${num(d)} m in ${num(t)} s at a constant speed. What is its speed, in m/s?${end}`;
    explanation = `Use \`v = d / t\`.\n\n\`v = ${num(d)} / ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [d * t, t / d, d - t]; // multiplied, divided the wrong way, subtracted
    hints = [
      `You know the distance (${num(d)} m) and the time (${num(t)} s). Speed is distance divided by time: \`v = d / t\`.`,
      `Substitute: \`v = ${num(d)} / ${num(t)}\` (in the calculator: \`_d / _t\`).${thenRound}`,
    ];
  } else if (unknown === "d") {
    exact = v * t;
    unit = "m";
    values = { v, t };
    prompt = `${who} moves at a constant ${num(v)} m/s for ${num(t)} s. How far does it travel, in m?${end}`;
    explanation = `Rearrange \`v = d / t\` to \`d = v × t\`.\n\n\`d = ${num(v)} × ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [v / t, t / v, v + t];
    hints = [
      `You know the speed and the time and want the distance. Rearrange \`v = d / t\` to \`d = v × t\`.`,
      `Substitute: \`d = ${num(v)} × ${num(t)}\` (in the calculator: \`_v * _t\`).${thenRound}`,
    ];
  } else {
    exact = d / v;
    unit = "s";
    values = { d, v };
    prompt = `${who} moves at a constant ${num(v)} m/s. How long does it take to cover ${num(d)} m, in s?${end}`;
    explanation = `Rearrange \`v = d / t\` to \`t = d / v\`.\n\n\`t = ${num(d)} / ${num(v)}\` ${result(exact, rounded, unit)}`;
    candidates = [d * v, v / d, d - v];
    hints = [
      `You know the distance and the speed and want the time. Rearrange \`v = d / t\` to \`t = d / v\`.`,
      `Substitute: \`t = ${num(d)} / ${num(v)}\` (in the calculator: \`_d / _v\`).${thenRound}`,
    ];
  }

  prompt = realistic(prompt, who, [unknown === "v" ? exact : v], []);
  // Distance (m) and time (s) known: the distance-time line; speed and time known: the speed-time line.
  const visual =
    unknown === "v"
      ? lineGraph("Distance–time graph", "Distance", "Distance (m)", [[0, 0], [t, d]], { yMin: 0, showValues: true })
      : unknown === "d"
        ? lineGraph("Speed–time graph", "Speed", "Speed (m/s)", [[0, v], [t, v]], { yMin: 0, showValues: true })
        : undefined;
  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { formula: "speed", unknown, values, rounded },
    given: givenFrom(values),
    hints,
  };
  return { ...finish(base, exact, rounded, candidates, rng), ...withVisual(visual) };
}

function genAccel(difficulty, rng) {
  const rounded = difficulty === "hard";
  const unknown = rng.pick(["a", "v", "u", "t"]);
  const who = rng.pick(WHO);
  let u, v, a, t;
  if (difficulty === "easy") {
    a = rng.int(1, 5);
    t = rng.int(1, 10);
    u = rng.int(0, 10);
    v = u + a * t;
  } else if (difficulty === "medium") {
    a = intWithMinAbs(rng, -6, 8, 1);
    t = rng.int(2, 15);
    u = a < 0 ? rng.int(-a * t, -a * t + 30) : rng.int(0, 30); // never ends below 0 m/s
    v = u + a * t;
  } else if (difficulty === "hard") {
    if (unknown === "a") {
      u = rng.int(0, 300) / 10;
      t = rng.int(15, 200) / 10;
      do {
        v = rng.int(0, 600) / 10;
      } while (v === u);
    } else if (unknown === "v") {
      u = rng.int(0, 300) / 10;
      a = rng.int(5, 60) / 10;
      t = rng.int(15, 200) / 10;
    } else if (unknown === "u") {
      a = rng.int(5, 60) / 10;
      t = rng.int(10, 80) / 10;
      v = round2(rng.int(5, 300) / 10 + a * t);
    } else {
      u = rng.int(0, 200) / 10;
      a = rng.int(5, 60) / 10;
      v = round1(u + rng.int(10, 400) / 10);
    }
  } else {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }

  const end = rounded ? " Round to 2 decimal places." : "";
  const accel = (x) => `a constant acceleration of ${num(x)} m/s²`;
  const thenRound = rounded ? " Then round to 2 decimal places." : "";
  let prompt, exact, unit, explanation, candidates, values, hints;
  if (unknown === "a") {
    exact = (v - u) / t;
    unit = "m/s²";
    values = { u, v, t };
    const verb = v >= u ? "speeds up" : "slows down";
    const hint = difficulty === "easy" ? "" : " (Slowing down gives a negative acceleration.)";
    prompt = `${who} ${verb} from ${num(u)} m/s to ${num(v)} m/s in ${num(t)} s. What is its acceleration, in m/s²?${hint}${end}`;
    explanation = `Use \`a = (v - u) / t\`.\n\n\`a = (${num(v)} - ${num(u)}) / ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [(v - u) * t, v / t, (v + u) / t]; // multiplied by t, ignored u, added u
    hints = [
      "Acceleration is the change in velocity divided by the time: `a = (v - u) / t`, with u the start and v the end velocity.",
      `Substitute: \`a = (${num(v)} - ${num(u)}) / ${num(t)}\` (in the calculator: \`(_v - _u) / _t\`).` +
        (v < u ? " The bracket is negative, because it slows down." : "") + thenRound,
    ];
  } else if (unknown === "v") {
    exact = u + a * t;
    unit = "m/s";
    values = { u, a, t };
    prompt = `${who} starts at ${num(u)} m/s and has ${accel(a)} for ${num(t)} s. What is its final velocity, in m/s?${end}`;
    explanation = `Use \`v = u + at\`.\n\n\`v = ${num(u)} + ${par(a)} × ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [u + a, a * t, u - a * t]; // forgot t, forgot u, wrong sign
    hints = [
      "The final velocity is the start velocity plus the speed gained: `v = u + at`.",
      `Substitute: \`v = ${num(u)} + ${par(a)} × ${num(t)}\` (in the calculator: \`_u + _a * _t\`). Multiply before you add.${thenRound}`,
    ];
  } else if (unknown === "u") {
    exact = v - a * t;
    unit = "m/s";
    values = { v, a, t };
    prompt = `${who} has ${accel(a)} for ${num(t)} s and ends at ${num(v)} m/s. What was its initial velocity, in m/s?${end}`;
    explanation = `Rearrange \`v = u + at\` to \`u = v - at\`.\n\n\`u = ${num(v)} - ${par(a)} × ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [v + a * t, v - a, a * t];
    hints = [
      "Start from `v = u + at` and take the speed gained away from the final velocity: `u = v - at`.",
      `Substitute: \`u = ${num(v)} - ${par(a)} × ${num(t)}\` (in the calculator: \`_v - _a * _t\`).${thenRound}`,
    ];
  } else {
    exact = (v - u) / a;
    unit = "s";
    values = { u, v, a };
    prompt = `${who} goes from ${num(u)} m/s to ${num(v)} m/s with ${accel(a)}. How long does this take, in s?${end}`;
    explanation = `Rearrange \`v = u + at\` to \`t = (v - u) / a\`.\n\n\`t = (${num(v)} - ${num(u)}) / ${par(a)}\` ${result(exact, rounded, unit)}`;
    candidates = [(v - u) * a, v / a, (v + u) / a];
    hints = [
      "Rearrange `v = u + at` for the time: `t = (v - u) / a`.",
      `Substitute: \`t = (${num(v)} - ${num(u)}) / ${par(a)}\` (in the calculator: \`(_v - _u) / _a\`).${thenRound}`,
    ];
  }

  prompt = realistic(
    prompt,
    who,
    [unknown === "u" ? exact : u, unknown === "v" ? exact : v],
    [unknown === "a" ? exact : a]
  );
  // Start and end velocity and the time are all stated when the acceleration is the unknown.
  const visual = unknown === "a" ? lineGraph("Velocity–time graph", "Velocity", "Velocity (m/s)", [[0, u], [t, v]], { showValues: true }) : undefined;
  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { formula: "accel", unknown, values, rounded },
    given: givenFrom(values),
    hints,
  };
  return { ...finish(base, exact, rounded, candidates, rng), ...withVisual(visual) };
}

function genMotion(difficulty, rng) {
  if (difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`motion-equations has no "${difficulty}" level`);
  }
  const rounded = difficulty === "hard";
  const kind = rng.pick(rounded ? ["s1", "a1", "v2", "s2"] : ["s1", "a1", "u1", "v2", "s2", "a2"]);
  const who = rng.pick(WHO);
  let u, a, t, s, v;
  if (!rounded) {
    // a is even, so s = ut + ½at² is a whole number; v² = u² + 2as then holds with whole v.
    u = rng.int(0, 15);
    a = 2 * rng.int(1, 5);
    t = rng.int(1, 10);
    s = u * t + (a * t * t) / 2;
    v = u + a * t;
  } else if (kind === "s1") {
    u = rng.int(0, 200) / 10;
    a = rng.int(5, 100) / 10;
    t = rng.int(10, 100) / 10;
  } else if (kind === "a1") {
    u = rng.int(0, 200) / 10;
    t = rng.int(10, 100) / 10;
    const a0 = rng.int(5, 100) / 10;
    s = round1(u * t + 0.5 * a0 * t * t); // shown to 1 decimal; the answer is computed from the shown s
  } else if (kind === "v2") {
    u = rng.int(0, 200) / 10;
    a = rng.int(5, 100) / 10;
    s = rng.int(10, 2000) / 10;
  } else {
    u = rng.int(0, 200) / 10;
    a = rng.int(5, 100) / 10;
    v = round1(u + rng.int(10, 300) / 10);
  }

  const end = rounded ? " Round to 2 decimal places." : "";
  const start = u === 0 ? "starts from rest" : `starts at ${num(u)} m/s`;
  const from = u === 0 ? "from rest" : `from ${num(u)} m/s`;
  let prompt, exact, unit, explanation, candidates, values, formula, unknown, hints;
  // Guided-mode hints: u = 0 has no calculator row ("from rest"), so write 0 in its place.
  const U = u === 0 ? "0" : "_u";
  const rest = u === 0 ? " Starting from rest means u = 0." : "";
  const thenRound = rounded ? " Then round to 2 decimal places." : "";

  if (kind === "s1") {
    formula = "displacement";
    unknown = "s";
    exact = u * t + 0.5 * a * t * t;
    unit = "m";
    values = { u, a, t };
    prompt = `${who} ${start} and accelerates uniformly at ${num(a)} m/s² for ${num(t)} s. How far does it travel, in m?${end}`;
    explanation =
      `Use \`s = ut + ½at²\`.\n\n` +
      `\`s = ${num(u)} × ${num(t)} + ½ × ${num(a)} × ${num(t)}² = ${num(u * t)} + ${num(0.5 * a * t * t)}\` ${result(exact, rounded, unit)}`;
    candidates = [u * t + a * t * t, u * t, (u + a * t) * t]; // forgot the ½, ignored a, used final speed
    hints = [
      `You know u, a and t and want the distance, so use the equation without v: \`s = ut + ½at²\`.${rest}`,
      `Substitute: \`s = ${num(u)} × ${num(t)} + ½ × ${num(a)} × ${num(t)}²\` (in the calculator: \`${U} * _t + 0.5 * _a * _t^2\`). Square t before multiplying.${thenRound}`,
    ];
  } else if (kind === "a1") {
    formula = "displacement";
    unknown = "a";
    exact = (2 * (s - u * t)) / (t * t);
    unit = "m/s²";
    values = { s, u, t };
    prompt = `${who} ${start} and covers ${num(s)} m in ${num(t)} s with uniform acceleration. What is its acceleration, in m/s²?${end}`;
    explanation =
      `Rearrange \`s = ut + ½at²\` to \`a = 2(s - ut) / t²\`.\n\n` +
      `\`a = 2 × (${num(s)} - ${num(u)} × ${num(t)}) / ${num(t)}²\` ${result(exact, rounded, unit)}`;
    candidates = [(s - u * t) / (t * t), (2 * s) / (t * t), (2 * (s - u * t)) / t]; // forgot the ½, ignored u, t not squared
    hints = [
      `You know s, u and t, so start from \`s = ut + ½at²\` and rearrange for a: \`a = 2(s - ut) / t²\`.${rest}`,
      `Substitute: \`a = 2 × (${num(s)} - ${num(u)} × ${num(t)}) / ${num(t)}²\` (in the calculator: \`2 * (_s - ${U} * _t) / _t^2\`).${thenRound}`,
    ];
  } else if (kind === "u1") {
    formula = "displacement";
    unknown = "u";
    exact = (s - 0.5 * a * t * t) / t;
    unit = "m/s";
    values = { s, a, t };
    prompt = `${who} accelerates uniformly at ${num(a)} m/s² and covers ${num(s)} m in ${num(t)} s. What was its initial velocity, in m/s?${end}`;
    explanation =
      `Rearrange \`s = ut + ½at²\` to \`u = (s - ½at²) / t\`.\n\n` +
      `\`u = (${num(s)} - ½ × ${num(a)} × ${num(t)}²) / ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [(s - a * t * t) / t, s / t, s - 0.5 * a * t * t]; // forgot the ½, ignored a, forgot to divide by t
    hints = [
      "You know s, a and t, so start from `s = ut + ½at²` and rearrange for u: `u = (s - ½at²) / t`.",
      `Substitute: \`u = (${num(s)} - ½ × ${num(a)} × ${num(t)}²) / ${num(t)}\` (in the calculator: \`(_s - 0.5 * _a * _t^2) / _t\`).`,
    ];
  } else if (kind === "v2") {
    formula = "vsquared";
    unknown = "v";
    const vSq = u * u + 2 * a * s;
    exact = Math.sqrt(vSq);
    unit = "m/s";
    values = { u, a, s };
    prompt = `${who} ${start} and accelerates uniformly at ${num(a)} m/s² over ${num(s)} m. What is its final velocity, in m/s?${end}`;
    explanation =
      `Use \`v² = u² + 2as\`, so \`v = √(u² + 2as)\`.\n\n` +
      `\`v = √(${num(u)}² + 2 × ${num(a)} × ${num(s)}) = √${num(vSq)}\` ${result(exact, rounded, unit)}`;
    candidates = [Math.sqrt(u * u + a * s), Math.sqrt(2 * a * s), vSq]; // forgot the 2, ignored u, forgot the root
    hints = [
      `There is no time given, so use \`v² = u² + 2as\`.${rest}`,
      `Substitute: \`v² = ${num(u)}² + 2 × ${num(a)} × ${num(s)}\`, then take the square root (in the calculator: \`sqrt(${U}^2 + 2 * _a * _s)\`).${thenRound}`,
    ];
  } else if (kind === "s2") {
    formula = "vsquared";
    unknown = "s";
    exact = (v * v - u * u) / (2 * a);
    unit = "m";
    values = { u, v, a };
    prompt = `${who} accelerates uniformly ${from} to ${num(v)} m/s at ${num(a)} m/s². How far does it travel, in m?${end}`;
    explanation =
      `Rearrange \`v² = u² + 2as\` to \`s = (v² - u²) / 2a\`.\n\n` +
      `\`s = (${num(v)}² - ${num(u)}²) / (2 × ${num(a)})\` ${result(exact, rounded, unit)}`;
    candidates = [(v * v - u * u) / a, (v * v + u * u) / (2 * a), (v - u) / (2 * a)]; // forgot the 2, sign slip, no squares
    hints = [
      `There is no time given, so use \`v² = u² + 2as\` and rearrange for s: \`s = (v² - u²) / 2a\`.${rest}`,
      `Substitute: \`s = (${num(v)}² - ${num(u)}²) / (2 × ${num(a)})\` (in the calculator: \`(_v^2 - ${U}^2) / (2 * _a)\`).${thenRound}`,
    ];
  } else {
    formula = "vsquared";
    unknown = "a";
    exact = (v * v - u * u) / (2 * s);
    unit = "m/s²";
    values = { u, v, s };
    prompt = `${who} accelerates uniformly ${from} to ${num(v)} m/s over ${num(s)} m. What is its acceleration, in m/s²?${end}`;
    explanation =
      `Rearrange \`v² = u² + 2as\` to \`a = (v² - u²) / 2s\`.\n\n` +
      `\`a = (${num(v)}² - ${num(u)}²) / (2 × ${num(s)})\` ${result(exact, rounded, unit)}`;
    candidates = [(v * v - u * u) / s, (v * v + u * u) / (2 * s), (v - u) / (2 * s)];
    hints = [
      `There is no time given, so use \`v² = u² + 2as\` and rearrange for a: \`a = (v² - u²) / 2s\`.${rest}`,
      `Substitute: \`a = (${num(v)}² - ${num(u)}²) / (2 × ${num(s)})\` (in the calculator: \`(_v^2 - ${U}^2) / (2 * _s)\`).${thenRound}`,
    ];
  }

  {
    const U = unknown === "u" ? exact : u;
    const A = unknown === "a" ? exact : a;
    const V = unknown === "v" ? exact : v !== undefined ? v : U + A * t;
    prompt = realistic(prompt, who, [U, V], [A]);
  }
  // u, a and t are stated when the distance is the unknown: the graph's area is that distance.
  // Values are not printed, so the final velocity (a working step) isn't given away.
  const visual = kind === "s1" ? lineGraph("Velocity–time graph", "Velocity", "Velocity (m/s)", [[0, u], [t, u + a * t]]) : undefined;
  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { formula, unknown, values, rounded },
    given: givenFrom(values, u === 0 ? ["u"] : []), // u = 0 is stated as "from rest"
    hints,
  };
  return { ...finish(base, exact, rounded, candidates, rng), ...withVisual(visual) };
}

// ---------------------------------------------------------------------------------------------
// Expert level: a separate branch. generate() sends "expert" here before any other code runs, so
// easy/medium/hard draw exactly the same rng values as before. Expert questions are multi-part,
// state the rounding on every part, and keep their inputs in params.v with params.kind "x-…".
// verify() recomputes the true values a different way (bisection on the original relation,
// suvat instead of graph areas, positions instead of formulas) and compares each part.
// Hint code never calls rng.

// Round half away from zero to dp decimals; never "-0".
function xr(n, dp) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// Display form for stated values and working: up to 4 decimals.
const xs = (n) => String(xr(n, 4));
// True when n sits within 2% of a unit of a rounding tie at dp decimals.
function xTie(n, dp) {
  const f = Math.abs(n) * 10 ** dp;
  return Math.abs(f - Math.floor(f) - 0.5) < 0.02;
}
const xDpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);

// A rounded numeric part (accepted within half a unit of the stated precision).
const xNum = (id, label, ask, exact, dp, hint) => ({
  id, label, ask: `${ask}, ${xDpWord(dp)}`, answerType: "number", answer: xr(exact, dp), tolerance: 0.5 * 10 ** -dp, hint, _exact: exact, _dp: dp,
});

// Assemble a multi-part question. Returns null (regenerate) on a rounding tie, a zero or
// non-finite answer, a given value equal to an answer, or NaN/undefined in the text.
// "a 8 kg" -> "an 8 kg" (eight, eleven, eighteen, eighty... start with a vowel sound).
function xArticles(text) {
  return text.replace(/\b([Aa]n?) (\d+)/g, (all, art, digits) => {
    const vowel = digits[0] === "8" || (digits.length % 3 === 2 && /^1[18]/.test(digits));
    return `${art[0] === "A" ? (vowel ? "An" : "A") : vowel ? "an" : "a"} ${digits}`;
  });
}

function xMulti({ kind, v, prompt, parts, steps, given, hints }) {
  prompt = xArticles(prompt);
  const dp = {};
  const out = [];
  for (const p of parts) {
    const { _exact, _dp, ...part } = p;
    part.id = part.id.toLowerCase(); // ids must match ^[a-z0-9-]+$
    if (part.answerType === "number") {
      if (!Number.isFinite(_exact) || part.answer === 0) return null;
      if (_dp === null ? !Number.isInteger(_exact) : xTie(_exact, _dp)) return null;
      if (given.some(([, g]) => Math.abs(g - part.answer) < 1e-9)) return null;
      dp[part.id] = _dp;
    } else {
      if (!part.choices.includes(part.answer) || new Set(part.choices).size !== part.choices.length) return null;
      dp[part.id] = "choice";
    }
    out.push(part);
  }
  const text = [prompt, ...steps, ...hints, ...out.map((p) => `${p.ask} ${p.hint} ${p.answer}`)].join(" ");
  if (/NaN|undefined|Infinity/.test(text)) return null;
  return {
    prompt,
    answerType: "multi",
    parts: out,
    explanation: steps.join("\n\n"),
    params: { kind, v, dp },
    given: given.map(([label, value]) => ({ label, value })),
    hints,
  };
}

// Attach a visual (built lazily from values already in scope) to a question, or pass null through.
const withExpertVisual = (q, makeVisual) => (q ? { ...q, visual: makeVisual() } : q);

// Bisection: a root of f between lo and hi (f must change sign), else NaN.
function xRoot(f, lo, hi) {
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || Math.sign(fa) === Math.sign(fb)) return NaN;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

// Check every part against the independently recomputed truth { partId: number | string }.
function xVerify(question, answer, truthFns) {
  const p = question.params;
  const fn = truthFns[p.kind];
  if (!fn || !p.v || !p.dp) return false;
  if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
  let truth;
  try {
    truth = fn(p.v);
  } catch {
    return false;
  }
  if (truth) truth = Object.fromEntries(Object.entries(truth).map(([k, x]) => [k.toLowerCase(), x]));
  if (!truth || Object.keys(truth).length !== question.parts.length) return false;
  for (const part of question.parts) {
    if (!(part.id in truth)) return false;
    const want = truth[part.id];
    const got = answer[part.id];
    if (typeof want === "string") {
      const ch = part.choices;
      if (!Array.isArray(ch) || new Set(ch).size !== ch.length || !ch.includes(String(got)) || String(got) !== want) return false;
      continue;
    }
    if (got === "" || got === null || got === undefined || typeof got === "boolean" || typeof got === "object") return false;
    const x = Number(got);
    if (!Number.isFinite(x) || !Number.isFinite(want)) return false;
    const dp = p.dp[part.id];
    if (dp === null) {
      if (Math.abs(x - want) > 1e-9 * Math.max(1, Math.abs(want))) return false;
    } else if (typeof dp !== "number" || Math.abs(x - want) > 0.5 * 10 ** -dp + 1e-9) return false;
  }
  return true;
}

// Retry a template until it returns a question (deterministic: only the rng passed in).
function xTry(make, rng) {
  for (let i = 0; i < 80; i++) {
    const q = make(rng);
    if (q) return q;
  }
  throw new Error("Expert: could not generate a question");
}

const X_UNROUNDED = "Use unrounded values from earlier parts.";
// Travellers with a realistic steady speed range, in tenths of a m/s.
const X_TRAVELLERS = [
  { who: "A runner", lo: 25, hi: 60 },
  { who: "A cyclist", lo: 40, hi: 120 },
  { who: "A rower", lo: 20, hi: 50 },
  { who: "A horse rider", lo: 30, hi: 90 },
  { who: "A kayaker", lo: 15, hi: 45 },
  { who: "A walker", lo: 10, hi: 22 },
];

// speed / expert: two legs at different speeds; the average speed is not the mean of the speeds.
function xLegs(rng) {
  const P = rng.pick(X_TRAVELLERS);
  const d1 = rng.int(8, 60) * 50;
  const d2 = rng.int(8, 60) * 50;
  const v1 = rng.int(P.lo, P.hi) / 10;
  let v2;
  do v2 = rng.int(P.lo, P.hi) / 10;
  while (Math.abs(v2 - v1) < 0.5);
  const t1 = d1 / v1;
  const t2 = d2 / v2;
  const T = t1 + t2;
  const V = (d1 + d2) / T;
  return xMulti({
    kind: "x-legs",
    v: { d1, v1, d2, v2 },
    prompt: `${P.who} covers ${d1} m at a steady ${xs(v1)} m/s, then another ${d2} m at a steady ${xs(v2)} m/s. ${X_UNROUNDED}`,
    parts: [
      xNum("time", "Total time", "Total time for both legs, in s", T, 1, "Find the time for each leg with `t = d / v`, then add them."),
      xNum("avg", "Average speed", "Average speed for the whole trip, in m/s", V, 2, "Average speed = total distance ÷ total time."),
    ],
    steps: [
      `Each leg has its own time, \`t = d / v\`: \`_t1 = _d1 / _v1\` → ${xs(t1)} s and \`_t2 = _d2 / _v2\` → ${xs(t2)} s.`,
      `Total time: \`_T = _t1 + _t2\` → ${xs(T)} s, which rounds to **${xr(T, 1)} s**.`,
      `Average speed = total distance ÷ total time: \`(_d1 + _d2) / _T\` → ${xs(V)}, which rounds to **${xr(V, 2)} m/s**.`,
      `Watch out: the mean of the two speeds, (${xs(v1)} + ${xs(v2)}) / 2 = ${xs((v1 + v2) / 2)} m/s, is wrong, because more time is spent at the slower speed.`,
    ],
    given: [["_d1", d1], ["_v1", v1], ["_d2", d2], ["_v2", v2]],
    hints: [
      "Average speed is total distance ÷ total time. It is not the mean of the two speeds.",
      "Work out the time for each leg separately with `t = d / v` (in the calculator: `_d1 / _v1` and `_d2 / _v2`).",
      "Add the two times, then divide the total distance `_d1 + _d2` by that total time.",
    ],
  });
}

// speed / expert: work backwards from a target average speed to the speed needed on the rest.
function xTarget(rng) {
  const P = rng.pick(X_TRAVELLERS);
  const V = rng.int(P.lo + 6, P.hi) / 10;
  const D = rng.int(10, 80) * 100;
  const d1 = D * rng.pick([0.2, 0.25, 0.4, 0.5, 0.6]);
  const v1 = rng.int(P.lo, Math.round(V * 10) - 3) / 10;
  const t1 = Math.round(d1 / v1);
  const T = D / V;
  const left = T - t1;
  if (!(left > 1)) return null;
  const v2 = (D - d1) / left;
  if (v2 > 2 * V) return null;
  return xMulti({
    kind: "x-target",
    v: { D, V, d1, t1 },
    prompt: `${P.who} wants to cover ${D} m at an average speed of ${xs(V)} m/s. The first ${d1} m take ${t1} s. ${X_UNROUNDED}`,
    parts: [
      xNum("left", "Time left", "Time left for the rest of the distance, in s", left, 1, "The whole trip may take total distance ÷ target average speed. Subtract the time already used."),
      xNum("speed", "Speed needed", "Steady speed needed for the rest, in m/s", v2, 2, "Divide the distance still to go by the time left."),
    ],
    steps: [
      `At an average of ${xs(V)} m/s the whole ${D} m may take \`_T = _D / _V\` → ${xs(T)} s.`,
      `Time left: \`_left = _T - _t1\` → ${xs(left)}, which rounds to **${xr(left, 1)} s**.`,
      `Distance left: \`_D - _d1\` → ${D - d1} m. Speed needed: \`(_D - _d1) / _left\` → ${xs(v2)}, which rounds to **${xr(v2, 2)} m/s**.`,
    ],
    given: [["_D", D], ["_V", V], ["_d1", d1], ["_t1", t1]],
    hints: [
      "Work backwards from the target: the average speed fixes the total time allowed for the whole distance.",
      "Total time allowed = `_D / _V`. Take away the time already used, `_t1`.",
      "The rest of the distance is `_D - _d1`; divide it by the time left.",
    ],
  });
}

const X_CHASERS = [
  ["A bus", "a car", "stop"],
  ["A cyclist", "a moped", "junction"],
  ["A lorry", "a motorbike", "depot"],
  ["A tractor", "a van", "farm gate"],
];

// speed / expert: catch-up (same direction, later start) or meeting (towards each other, later start).
function xChase(rng) {
  if (rng.next() < 0.5) {
    const [A, B, place] = rng.pick(X_CHASERS);
    const vA = rng.int(40, 160) / 10;
    const vB = vA + rng.int(20, 120) / 10;
    const t0 = rng.int(10, 120);
    const t = (vA * t0) / (vB - vA);
    const d = vB * t;
    return xMulti({
      kind: "x-chase",
      v: { vA, vB, t0 },
      prompt: `${A} leaves a ${place} at a steady ${xs(vA)} m/s. ${t0} s later, ${B} leaves the same ${place} along the same road at a steady ${xs(vB)} m/s. ${X_UNROUNDED}`,
      parts: [
        xNum("time", "Catch-up time", `Time from when ${B} leaves until it catches up, in s`, t, 2, `When they meet, both have travelled the same distance from the ${place}.`),
        xNum("dist", "Distance", `Distance from the ${place} where it catches up, in m`, d, 1, `Use the catch-up time with ${B}'s speed.`),
      ],
      steps: [
        `Let t be the time after ${B} leaves. ${A} has then been moving for t + ${t0} s.`,
        `Same distance: \`${xs(vA)}(t + ${t0}) = ${xs(vB)}t\`, so \`(${xs(vB)} - ${xs(vA)})t = ${xs(vA)} × ${t0}\`.`,
        `\`_t = _vA * _t0 / (_vB - _vA)\` → ${xs(t)}, which rounds to **${xr(t, 2)} s**.`,
        `Distance: \`_vB * _t\` → ${xs(d)}, which rounds to **${xr(d, 1)} m**.`,
      ],
      given: [["_vA", vA], ["_vB", vB], ["_t0", t0]],
      hints: [
        `Call the time after ${B} leaves t. ${A} has been moving for t + ${t0} s by then.`,
        "They meet when their distances from the start are equal: write each distance as speed × its own time and set them equal.",
        "Expand the bracket, collect the t terms on one side and solve for t.",
      ],
    });
  }
  const v1 = rng.int(30, 90) / 10;
  const v2 = rng.int(30, 90) / 10;
  const D = rng.int(10, 60) * 100;
  const t0 = rng.int(10, 200);
  if (v1 * t0 >= 0.7 * D) return null;
  const t = (D - v1 * t0) / (v1 + v2);
  const x = v1 * (t + t0);
  return xMulti({
    kind: "x-meet",
    v: { D, v1, v2, t0 },
    prompt: `Two cyclists, A and B, are ${D} m apart on a straight path and ride towards each other. A sets off at a steady ${xs(v1)} m/s; B sets off ${t0} s later at a steady ${xs(v2)} m/s. ${X_UNROUNDED}`,
    parts: [
      xNum("time", "Meeting time", "Time from when B sets off until they meet, in s", t, 2, "Before B starts, A closes part of the gap alone. After that the gap closes at the sum of the two speeds."),
      xNum("dist", "Distance", "Distance from A's start to the meeting point, in m", x, 1, "A rides for B's time plus the head start."),
    ],
    steps: [
      `In the first ${t0} s only A moves: \`_v1 * _t0\` → ${xs(v1 * t0)} m, leaving a gap of \`_D - _v1 * _t0\` → ${xs(D - v1 * t0)} m.`,
      `Moving towards each other, the gap closes at \`_v1 + _v2\` → ${xs(v1 + v2)} m/s.`,
      `\`_t = (_D - _v1 * _t0) / (_v1 + _v2)\` → ${xs(t)}, which rounds to **${xr(t, 2)} s**.`,
      `A has ridden for t + ${t0} s: \`_v1 * (_t + _t0)\` → ${xs(x)}, which rounds to **${xr(x, 1)} m**.`,
    ],
    given: [["_D", D], ["_v1", v1], ["_v2", v2], ["_t0", t0]],
    hints: [
      "Split the motion in two: the head start, when only A moves, then the time when both move.",
      "During the head start A covers `_v1 * _t0`. The rest of the gap closes at the combined speed `_v1 + _v2`.",
      "Divide the remaining gap by the combined speed for the time. For the distance, remember A has also been riding during the head start.",
    ],
  });
}

const X_PHASE_WHO = ["A tram", "A train", "A metro train", "An electric car", "A funicular car"];

// acceleration / expert: speed up, cruise, brake; top speed, braking time, distance from the v-t graph.
function xPhases(rng) {
  const who = rng.pick(X_PHASE_WHO);
  const a1 = rng.int(5, 30) / 10;
  const t1 = rng.int(4, Math.min(30, Math.floor(30 / a1)));
  const tc = rng.pick([0, rng.int(5, 60)]);
  const a2 = rng.int(8, 40) / 10;
  const v = a1 * t1;
  const t2 = v / a2;
  const s = 0.5 * v * t1 + v * tc + 0.5 * v * t2;
  const cruise = tc ? `, travels at that speed for ${tc} s,` : "";
  return xMulti({
    kind: "x-phases",
    v: { a1, t1, tc, a2 },
    prompt: `${who} starts from rest and accelerates uniformly at ${xs(a1)} m/s² for ${t1} s${cruise} then brakes uniformly at ${xs(a2)} m/s² until it stops. ${X_UNROUNDED}`,
    parts: [
      xNum("top", "Top speed", "Top speed, in m/s", v, 2, "From rest, the speed gained is acceleration × time."),
      xNum("brake", "Braking time", "Time taken to brake to a stop, in s", t2, 2, "Braking removes the top speed at the braking rate: time = speed lost ÷ deceleration."),
      xNum("dist", "Total distance", "Total distance travelled, in m", s, 1, "Sketch the velocity-time graph: the distance is the area under it."),
    ],
    steps: [
      `Top speed: \`_v = _a1 * _t1\` → ${xs(v)}, so **${xr(v, 2)} m/s**.`,
      `Braking time: \`_t2 = _v / _a2\` → ${xs(t2)}, which rounds to **${xr(t2, 2)} s**.`,
      `Distance = area under the velocity-time graph: \`0.5 * _v * _t1${tc ? " + _v * _tc" : ""} + 0.5 * _v * _t2\` → ${xs(s)}, which rounds to **${xr(s, 1)} m**.`,
    ],
    given: tc ? [["_a1", a1], ["_t1", t1], ["_tc", tc], ["_a2", a2]] : [["_a1", a1], ["_t1", t1], ["_a2", a2]],
    hints: [
      `There are ${tc ? "three" : "two"} stages. Handle each one with \`v = u + at\`, then sketch the velocity-time graph.`,
      "The speed at the end of the first stage is the start speed for braking. Braking ends at 0 m/s.",
      "The distance is the area under the velocity-time graph: a triangle for each speed change" + (tc ? " and a rectangle for the steady part." : "."),
    ],
  });
}

// acceleration / expert: two velocity readings; work back to a and u, then forward to a target.
function xReadings(rng) {
  const tA = rng.int(1, 6);
  const tB = tA + rng.int(2, 8);
  let a;
  do a = rng.int(-30, 40) / 10;
  while (Math.abs(a) < 0.5);
  const u = rng.int(a < 0 ? 100 : 0, 200) / 10;
  const vA = xr(u + a * tA, 2);
  const vB = xr(u + a * tB, 2);
  if (vB <= 0.5) return null;
  const V = a > 0 ? xr(vB + rng.int(5, 100) / 10, 1) : 0;
  const tV = (V - u) / a;
  const ask = a > 0 ? `Time at which it reaches ${xs(V)} m/s, in s` : "Time at which it comes to rest, in s";
  return withExpertVisual(xMulti({
    kind: "x-readings",
    v: { tA, vA, tB, vB, V },
    prompt: `A trolley moves in a straight line with constant acceleration. A data logger records ${xs(vA)} m/s at t = ${tA} s and ${xs(vB)} m/s at t = ${tB} s. ${X_UNROUNDED}`,
    parts: [
      xNum("a", "Acceleration", "Acceleration, in m/s² (negative if slowing)", a, 2, "Acceleration = change in velocity ÷ time between the readings."),
      xNum("u", "Velocity at t = 0", "Velocity at t = 0, in m/s", u, 2, "Work backwards from the first reading: take away the speed gained before it."),
      xNum("t", "Time", ask, tV, 2, "Use `v = u + at` with the velocity at t = 0 and solve for t."),
    ],
    steps: [
      `\`_a = (_vB - _vA) / (_tB - _tA)\` → ${xs(a)}, so **${xr(a, 2)} m/s²**.`,
      `Back to t = 0: \`_u = _vA - _a * _tA\` → ${xs(u)}, so **${xr(u, 2)} m/s**.`,
      `\`v = u + at\` gives \`t = (${a > 0 ? "_V" : "0"} - _u) / _a\` → ${xs(tV)}, which rounds to **${xr(tV, 2)} s**.`,
    ],
    given: a > 0 ? [["_tA", tA], ["_vA", vA], ["_tB", tB], ["_vB", vB], ["_V", V]] : [["_tA", tA], ["_vA", vA], ["_tB", tB], ["_vB", vB]],
    hints: [
      "Both readings lie on one straight velocity-time line. Its gradient is the acceleration.",
      "The velocity at t = 0 is not the first reading: the trolley was already accelerating for `_tA` seconds before it.",
      `Then use \`v = u + at\` with ${a > 0 ? "v = `_V`" : "v = 0"} and rearrange for t.`,
    ],
  }), () =>
    // The two logged readings (both stated in the prompt). Nothing is omitted: they are arbitrary
    // two-decimal values that cannot sit on gridlines, and every part asks for 2 decimal places.
    lineGraph("Data logger readings", "Logged velocity", "Velocity (m/s)", [[tA, vA], [tB, vB]], { showValues: true }));
}

// acceleration / expert: km/h conversion, acceleration and a braking stage.
function xKmh(rng) {
  const X = rng.int(30, 130);
  const t = rng.int(40, 150) / 10;
  const b = rng.int(40, 90) / 10;
  const v = X / 3.6;
  const a = v / t;
  if (a > 8) return null;
  const tb = v / b;
  const sb = (v * v) / (2 * b);
  return xMulti({
    kind: "x-kmh",
    v: { X, t, b },
    prompt: `A car accelerates uniformly from rest to ${X} km/h in ${xs(t)} s. Later it brakes from ${X} km/h to rest with a deceleration of ${xs(b)} m/s². ${X_UNROUNDED}`,
    parts: [
      xNum("a", "Acceleration", "Acceleration while speeding up, in m/s²", a, 2, "Convert the speed to m/s first: divide km/h by 3.6."),
      xNum("tb", "Braking time", "Time taken to brake to rest, in s", tb, 2, "Time = speed lost ÷ deceleration, with the speed in m/s."),
      xNum("sb", "Braking distance", "Distance covered while braking, in m", sb, 1, "No time is needed if you use `v² = u² + 2as` with v = 0."),
    ],
    steps: [
      `Convert: \`_v = _X / 3.6\` → ${xs(v)} m/s (1 km/h = 1000 m ÷ 3600 s).`,
      `\`_a = _v / _t\` → ${xs(a)}, which rounds to **${xr(a, 2)} m/s²**.`,
      `Braking time: \`_v / _b\` → ${xs(tb)}, which rounds to **${xr(tb, 2)} s**.`,
      `Braking distance from \`0 = u² - 2bs\`: \`_v^2 / (2 * _b)\` → ${xs(sb)}, which rounds to **${xr(sb, 1)} m**.`,
    ],
    given: [["_X", X], ["_t", t], ["_b", b]],
    hints: [
      "Everything must be in m/s and s. Divide the km/h speed by 3.6 first.",
      "Speeding up from rest: a = v ÷ t. Braking to rest: t = v ÷ deceleration.",
      "For the braking distance use `v² = u² + 2as` with final speed 0 and a negative acceleration.",
    ],
  });
}

// motion-equations / expert: stopping distance (forward), or the highest safe speed (backwards).
function xStop(rng) {
  const tr = rng.int(5, 15) / 10;
  const b = rng.int(50, 90) / 10;
  if (rng.next() < 0.5) {
    const X = rng.int(30, 120);
    const v = X / 3.6;
    const think = v * tr;
    const brake = (v * v) / (2 * b);
    return xMulti({
      kind: "x-stop",
      v: { X, tr, b },
      prompt: `A driver travelling at ${X} km/h sees a hazard. Their reaction time is ${xs(tr)} s, then the car brakes uniformly at ${xs(b)} m/s². ${X_UNROUNDED}`,
      parts: [
        xNum("think", "Thinking distance", "Distance travelled during the reaction time, in m", think, 2, "During the reaction time the car does not slow down: distance = speed × time, with the speed in m/s."),
        xNum("brake", "Braking distance", "Braking distance, in m", brake, 2, "Use `v² = u² + 2as` with v = 0."),
        xNum("total", "Stopping distance", "Total stopping distance, in m", think + brake, 1, "Stopping distance = thinking distance + braking distance."),
      ],
      steps: [
        `Convert: \`_v = _X / 3.6\` → ${xs(v)} m/s.`,
        `Thinking distance (steady speed): \`_v * _tr\` → ${xs(think)}, which rounds to **${xr(think, 2)} m**.`,
        `Braking distance: \`_v^2 / (2 * _b)\` → ${xs(brake)}, which rounds to **${xr(brake, 2)} m**.`,
        `Total: ${xs(think)} + ${xs(brake)} = ${xs(think + brake)}, which rounds to **${xr(think + brake, 1)} m**.`,
      ],
      given: [["_X", X], ["_tr", tr], ["_b", b]],
      hints: [
        "Convert the speed to m/s (divide by 3.6). The stop has two stages: reacting at a steady speed, then braking.",
        "Thinking distance = speed × reaction time. Braking distance comes from `v² = u² + 2as` with v = 0.",
      ],
    });
  }
  const D = rng.int(25, 120);
  // u·tr + u²/(2b) = D  ->  u = b(-tr + √(tr² + 2D/b))
  const u = b * (-tr + Math.sqrt(tr * tr + (2 * D) / b));
  const kmh = u * 3.6;
  return xMulti({
    kind: "x-stopback",
    v: { D, tr, b },
    prompt: `A driver sees a hazard ${D} m ahead. Their reaction time is ${xs(tr)} s and the car can brake at ${xs(b)} m/s². What is the highest speed at which the car can still stop in time? ${X_UNROUNDED}`,
    parts: [
      xNum("u", "Speed in m/s", "Highest speed, in m/s", u, 2, "Write thinking distance + braking distance in terms of the unknown speed u and set the total equal to the gap."),
      xNum("kmh", "Speed in km/h", "The same speed in km/h", kmh, 1, "Multiply m/s by 3.6."),
    ],
    steps: [
      `Stopping distance for speed u: \`u × ${xs(tr)} + u² / (2 × ${xs(b)})\`. Set it equal to ${D} m: \`u²/${xs(2 * b)} + ${xs(tr)}u - ${D} = 0\`.`,
      `Multiply by 2b and use the quadratic formula, keeping the positive root: \`_u = _b * (-_tr + sqrt(_tr^2 + 2 * _D / _b))\` → ${xs(u)}, which rounds to **${xr(u, 2)} m/s**.`,
      `In km/h: \`_u * 3.6\` → ${xs(kmh)}, which rounds to **${xr(kmh, 1)} km/h**.`,
    ],
    given: [["_D", D], ["_tr", tr], ["_b", b]],
    hints: [
      "Work backwards. For an unknown speed u, the thinking distance is `u × _tr` and the braking distance is `u² ÷ (2 × _b)`.",
      "Their sum must equal the distance to the hazard, which gives a quadratic in u.",
      "Solve it with the quadratic formula and keep the positive root (a speed can't be negative).",
    ],
  });
}

// motion-equations / expert: thrown upwards from a cliff top; the time needs the later root.
function xCliff(rng) {
  const u = rng.int(20, 250) / 10;
  const H = rng.int(50, 800) / 10;
  const g = 9.8;
  const top = H + (u * u) / (2 * g);
  const vImp = Math.sqrt(u * u + 2 * g * H);
  const t = (u + vImp) / g;
  const thing = rng.pick(["A stone", "A ball", "A pebble", "A tennis ball", "A small rock"]);
  return xMulti({
    kind: "x-cliff",
    v: { u, H },
    prompt: `${thing} is thrown straight up at ${xs(u)} m/s from the top of a cliff ${xs(H)} m above the beach. It misses the cliff on the way down. Take g = 9.8 m/s² and ignore air resistance. ${X_UNROUNDED}`,
    parts: [
      xNum("top", "Highest point", "Greatest height above the beach, in m", top, 2, "At the highest point the velocity is 0. Remember to add the cliff height."),
      xNum("time", "Time to land", "Time from the throw until it hits the beach, in s", t, 2, "Take up as positive: the displacement to the beach is negative. Solve the quadratic and keep the positive time."),
      xNum("speed", "Impact speed", "Speed just before it hits the beach, in m/s", vImp, 2, "Use `v² = u² + 2as` over the whole flight, with s = the drop to the beach and a = g downwards."),
    ],
    steps: [
      `Rise above the cliff: \`_u^2 / (2 * 9.8)\` → ${xs((u * u) / (2 * g))} m, so the highest point is \`_H + _u^2 / (2 * 9.8)\` → ${xs(top)}, which rounds to **${xr(top, 2)} m**.`,
      `Up is positive, so the displacement to the beach is s = -${xs(H)}: \`-${xs(H)} = ${xs(u)}t - 4.9t²\`, i.e. \`4.9t² - ${xs(u)}t - ${xs(H)} = 0\`.`,
      `Quadratic formula, positive root: \`(_u + sqrt(_u^2 + 2 * 9.8 * _H)) / 9.8\` → ${xs(t)}, which rounds to **${xr(t, 2)} s**. The negative root is before the throw.`,
      `Speed: \`v² = u² + 2gH\`, \`sqrt(_u^2 + 2 * 9.8 * _H)\` → ${xs(vImp)}, which rounds to **${xr(vImp, 2)} m/s**.`,
    ],
    given: [["_u", u], ["_H", H]],
    hints: [
      "Choose up as positive, so a = -9.8 m/s² for the whole flight, and the beach is at displacement -H.",
      "For the highest point, set v = 0 in `v² = u² + 2as`, then add the cliff height.",
      "For the time, `s = ut + ½at²` gives a quadratic in t. One root is negative: reject it.",
    ],
  });
}

// motion-equations / expert: a police car from rest (maybe after a delay) catches a speeding car.
function xPolice(rng) {
  const v = rng.int(150, 300) / 10;
  const td = rng.pick([0, rng.int(5, 40) / 10]);
  const a = rng.int(20, 60) / 10;
  const s = (v + Math.sqrt(v * v + 2 * a * v * td)) / a; // time the police car accelerates
  const T = td + s;
  const vp = a * s;
  if (vp > 75) return null;
  const start = td ? `${xs(td)} s later the police car sets off` : "At that instant the police car sets off";
  return xMulti({
    kind: "x-police",
    v: { v, td, a },
    prompt: `A car speeding at a steady ${xs(v)} m/s passes a parked police car. ${start} from rest, accelerating uniformly at ${xs(a)} m/s² until it draws level. ${X_UNROUNDED}`,
    parts: [
      xNum("time", "Time", "Time from when the car passes until the police car draws level, in s", T, 2, "Both have covered the same distance when they draw level. The speeding car has been moving for the whole time." + (td ? " The police car moves for less time." : "")),
      xNum("dist", "Distance", "Distance from the parking spot, in m", v * T, 1, "Use the speeding car: steady speed × total time."),
      xNum("speed", "Police speed", "Speed of the police car as it draws level, in m/s", vp, 2, "From rest, v = a × (time the police car has been accelerating)."),
    ],
    steps: td
      ? [
          `Let s be the police car's driving time; the speeding car has then moved for s + ${xs(td)} s. Equal distances: \`½ × ${xs(a)} × s² = ${xs(v)}(s + ${xs(td)})\`.`,
          `Quadratic formula, positive root: \`_s = (_v + sqrt(_v^2 + 2 * _a * _v * _td)) / _a\` → ${xs(s)} s, so the total time is \`_T = _td + _s\` → ${xs(T)}, which rounds to **${xr(T, 2)} s**.`,
          `Distance: \`_v * _T\` → ${xs(v * T)}, which rounds to **${xr(v * T, 1)} m**.`,
          `Police speed: \`_a * _s\` → ${xs(vp)}, which rounds to **${xr(vp, 2)} m/s**.`,
        ]
      : [
          `Equal distances after time t: \`½ × ${xs(a)} × t² = ${xs(v)}t\`, so t = 0 (the pass) or t = 2v / a.`,
          `\`_T = 2 * _v / _a\` → ${xs(T)}, which rounds to **${xr(T, 2)} s**.`,
          `Distance: \`_v * _T\` → ${xs(v * T)}, which rounds to **${xr(v * T, 1)} m**.`,
          `Police speed: \`_a * _T\` → ${xs(vp)}, which rounds to **${xr(vp, 2)} m/s**: exactly twice the speeding car's speed.`,
        ],
    given: td ? [["_v", v], ["_td", td], ["_a", a]] : [["_v", v], ["_a", a]],
    hints: [
      "Write the distance of each car from the parking spot as a function of time: steady speed for one, `½at²` from rest for the other.",
      td ? "The police car starts late, so its driving time is shorter than the speeding car's by the delay." : "Both cars start timing at the same moment.",
      "Set the distances equal and solve. Ignore the solution that is before the police car moves.",
    ],
  });
}

// ---- Expert: graphs whose values are NOT written on the picture (read off the gridlines) ----
//
// The learner reads corner points from a velocity-time or distance-time graph. Every corner sits
// exactly on a gridline intersection (times are whole multiples of the x step, values of the y
// step), the axes, tick numbers and labels always show, and showValues is false: no read value
// appears in the prompt, the part asks, the hints or the alt text (the axes end one step above the
// data, so the axis range doesn't give the end values away). The explanation states them.
// verify() takes the corner points from the drawn visual, checks they sit on its ticks and equal
// the generator's data, and recomputes the answers from the picture (trapezium areas and
// gradients), not from the generator's stage formulas.

// A line graph with no value labels; axes end one step above the data.
const readGraph = (caption, name, yLabel, pts, tStep, vStep) => {
  const tEnd = Math.max(...pts.map((p) => p[0]));
  const yTop = Math.max(...pts.map((p) => p[1]));
  return lineGraph(caption, name, yLabel, pts, {
    xMax: tEnd + tStep, yMin: 0, yMax: yTop + vStep, xStep: tStep, yStep: vStep, showValues: false,
  });
};

const READ_VT_CTX = [
  { who: "A cyclist", vs: [1, 2], ts: [2, 5] },
  { who: "A car", vs: [5], ts: [2, 5] },
  { who: "A train", vs: [5, 10], ts: [5, 10] },
  { who: "A tram", vs: [2, 5], ts: [5, 10] },
];

// acceleration / expert: read a velocity-time graph (change speed, cruise, brake to rest).
function xReadVt(rng) {
  const C = rng.pick(READ_VT_CTX);
  const vStep = rng.pick(C.vs);
  const tStep = rng.pick(C.ts);
  const fromRest = rng.next() < 0.5;
  const kTop = rng.int(2, 6);
  const kStart = fromRest ? 0 : rng.int(1, kTop);
  const na = rng.int(1, 2);
  const nb = rng.int(1, 2);
  const nc = rng.int(1, 2);
  if (kStart === kTop) return null; // no first-section acceleration to read
  const u = kStart * vStep;
  const top = kTop * vStep;
  const t1 = na * tStep;
  const t2 = (na + nb) * tStep;
  const t3 = (na + nb + nc) * tStep;
  const a1 = (top - u) / t1;
  const a3 = -top / (nc * tStep);
  if (Math.abs(a1) > 4 || Math.abs(a3) > 4) return null;
  const dist = 0.5 * (u + top) * t1 + top * (nb * tStep) + 0.5 * top * (nc * tStep);
  const avg = dist / t3;
  const pts = [[0, u], [t1, top], [t2, top], [t3, 0]];
  const q = xMulti({
    kind: "x-readvt",
    v: { pts },
    prompt: `${C.who} moves in a straight line. Its velocity–time graph is shown, made of straight-line sections. Read the values from the graph.`,
    parts: [
      xNum("a1", "First section", "Acceleration in the first section, in m/s² (negative if slowing)", a1, 2, "Read the time and velocity at both ends of the first section. Acceleration = change in velocity ÷ change in time."),
      xNum("a3", "Last section", "Acceleration in the last section, in m/s² (negative if slowing)", a3, 2, "The last section ends at rest. Use the same gradient idea: change in velocity ÷ change in time."),
      xNum("dist", "Distance", "Total distance travelled, in m", dist, 1, "The distance is the area under the graph. Split it into trapeziums and a rectangle."),
      xNum("avg", "Average speed", "Average speed over the whole journey, in m/s", avg, 2, "Average speed = total distance ÷ total time. Read the end time from the graph."),
    ],
    steps: [
      `Read from the graph: (0, ${u}), (${t1}, ${top}), (${t2}, ${top}), (${t3}, 0), with time in s and velocity in m/s.`,
      `First section: \`(${top} - ${u}) / ${t1}\` → ${xs(a1)}, so **${xr(a1, 2)} m/s²**. Last section: \`(0 - ${top}) / ${t3 - t2}\` → ${xs(a3)}, so **${xr(a3, 2)} m/s²**.`,
      `Distance = area under the graph: \`0.5 * (${u} + ${top}) * ${t1} + ${top} * ${t2 - t1} + 0.5 * ${top} * ${t3 - t2}\` = **${xr(dist, 1)} m**.`,
      `Average speed = \`${xs(dist)} / ${t3}\` → ${xs(avg)}, which rounds to **${xr(avg, 2)} m/s**.`,
    ],
    given: [],
    hints: [
      "Find the corners of the graph, where the line changes direction. At each one, read the time along the bottom and the velocity up the side; every corner sits on a gridline crossing.",
      "Acceleration is the gradient of a section: change in velocity ÷ change in time. A section sloping downwards means slowing down, so the acceleration is negative.",
      "The distance is the area under the graph. For the average speed, divide that distance by the total time.",
    ],
  });
  return q ? { ...q, visual: readGraph("Velocity–time graph", "Velocity", "Velocity (m/s)", pts, tStep, vStep) } : q;
}

// speed / expert: read a distance-time graph (out, stopped, on again); speeds, time stopped, average.
function xReadDt(rng) {
  const tStep = rng.pick([5, 10, 20]);
  const dStep = rng.pick([10, 20, 50, 100]);
  const na = rng.int(1, 2);
  const nb = rng.int(1, 2);
  const nc = rng.int(1, 2);
  const kd1 = rng.int(1, 3);
  const kd2 = rng.int(1, 3);
  const t1 = na * tStep;
  const t2 = (na + nb) * tStep;
  const t3 = (na + nb + nc) * tStep;
  const d1 = kd1 * dStep;
  const d3 = (kd1 + kd2) * dStep;
  const v1 = d1 / t1;
  const v3 = (d3 - d1) / (nc * tStep);
  const avg = d3 / t3;
  if (v1 === v3 || Math.max(v1, v3) > 15 || Math.min(v1, v3) < 0.5) return null;
  const top = Math.max(v1, v3);
  const who = top <= 2.5 ? "A walker" : top <= 7 ? "A runner" : "A cyclist";
  const pts = [[0, 0], [t1, d1], [t2, d1], [t3, d3]];
  const stop = t2 - t1;
  const q = xMulti({
    kind: "x-readdt",
    v: { pts },
    prompt: `${who} travels along a straight path. The distance–time graph is shown, made of straight-line sections. Read the values from the graph.`,
    parts: [
      { id: "stop", label: "Stopped", ask: "Time spent stopped, in s", answerType: "number", answer: stop, tolerance: 0,
        hint: "A flat section of a distance–time graph means no distance is covered. Read the times at its two ends.", _exact: stop, _dp: null },
      xNum("v1", "First section", "Speed in the first section, in m/s", v1, 2, "Speed is the gradient of a distance–time graph: distance moved ÷ time taken, for that section."),
      xNum("v3", "Last section", "Speed in the last section, in m/s", v3, 2, "Use the distance moved in the last section only, not the distance from the start."),
      xNum("avg", "Average speed", "Average speed over the whole journey, in m/s", avg, 2, "Total distance ÷ total time, with the stop included in the time."),
    ],
    steps: [
      `Read from the graph: (0, 0), (${t1}, ${d1}), (${t2}, ${d1}), (${t3}, ${d3}), with time in s and distance in m.`,
      `Stopped: the flat section runs from ${t1} s to ${t2} s, so **${stop} s**.`,
      `First section: \`${d1} / ${t1}\` → ${xs(v1)}, so **${xr(v1, 2)} m/s**. Last section: \`(${d3} - ${d1}) / ${t3 - t2}\` → ${xs(v3)}, so **${xr(v3, 2)} m/s**.`,
      `Average speed = \`${d3} / ${t3}\` → ${xs(avg)}, which rounds to **${xr(avg, 2)} m/s**.`,
    ],
    given: [],
    hints: [
      "Find the corners of the graph, where the line changes direction. At each one, read the time along the bottom and the distance up the side; every corner sits on a gridline crossing.",
      "Speed is the gradient of a section: distance moved ÷ time taken. A flat section is a stop.",
      "For the average speed use the total distance and the total time from start to finish, including the stop.",
    ],
  });
  return q ? { ...q, visual: readGraph("Distance–time graph", "Distance", "Distance (m)", pts, tStep, dStep) } : q;
}

function genExpert(subtopic, rng) {
  const pick = (list) => list[rng.int(0, list.length - 1)];
  if (subtopic === "speed") return xTry(pick([xLegs, xTarget, xChase, xReadDt]), rng);
  if (subtopic === "acceleration") return xTry(pick([xPhases, xReadings, xKmh, xReadVt]), rng);
  if (subtopic === "motion-equations") return xTry(pick([xStop, xCliff, xPolice]), rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent truth for verify: bisection on the original (un-rearranged) relations, or a different
// route to the same quantity (suvat instead of graph areas, positions instead of formulas).
const X_TRUTH = {
  "x-legs": ({ d1, v1, d2, v2 }) => {
    const T = xRoot((t) => t * v1 * v2 - (d1 * v2 + d2 * v1), 0, 1e7);
    return { time: T, avg: xRoot((V) => V * T - (d1 + d2), 0, 1e4) };
  },
  "x-target": ({ D, V, d1, t1 }) => {
    const left = xRoot((x) => V * (x + t1) - D, -1e6, 1e7);
    return { left, speed: xRoot((w) => w * left - (D - d1), 0, 1e4) };
  },
  "x-chase": ({ vA, vB, t0 }) => {
    const t = xRoot((x) => vB * x - vA * (x + t0), 0, 1e7);
    return { time: t, dist: vA * (t + t0) };
  },
  "x-meet": ({ D, v1, v2, t0 }) => {
    const t = xRoot((x) => v1 * (x + t0) + v2 * x - D, 0, 1e7);
    return { time: t, dist: D - v2 * t };
  },
  "x-phases": ({ a1, t1, tc, a2 }) => {
    const v = xRoot((w) => w - a1 * t1, 0, 1e4);
    const tb = xRoot((t) => v - a2 * t, 0, 1e4);
    return { top: v, brake: tb, dist: 0.5 * a1 * t1 * t1 + v * tc + (v * v) / (2 * a2) };
  },
  "x-readings": ({ tA, vA, tB, vB, V }) => {
    const a = (vB - vA) / (tB - tA);
    const u = (vA * tB - vB * tA) / (tB - tA);
    return { a, u, t: xRoot((t) => u + a * t - V, tB, 1e6) };
  },
  "x-kmh": ({ X, t, b }) => {
    const v = (X * 1000) / 3600;
    return { a: v / t, tb: xRoot((x) => v - b * x, 0, 1e4), sb: v * (v / b) - 0.5 * b * (v / b) ** 2 };
  },
  "x-stop": ({ X, tr, b }) => {
    const v = (X * 1000) / 3600;
    const tb = v / b;
    const brake = v * tb - 0.5 * b * tb * tb;
    return { think: v * tr, brake, total: v * tr + brake };
  },
  "x-stopback": ({ D, tr, b }) => {
    const u = xRoot((x) => x * tr + (x * x) / (2 * b) - D, 0, 1e4);
    return { u, kmh: (u * 3600) / 1000 };
  },
  "x-cliff": ({ u, H }) => {
    const g = 9.8;
    const y = (t) => H + u * t - 0.5 * g * t * t;
    const tTop = u / g;
    const t = xRoot(y, tTop, 1e4);
    return { top: y(tTop), time: t, speed: Math.abs(u - g * t) };
  },
  "x-police": ({ v, td, a }) => {
    const T = xRoot((x) => 0.5 * a * (x - td) ** 2 - v * x, td + 1e-9, 1e5);
    return { time: T, dist: v * T, speed: a * (T - td) };
  },
};

// Picture-based truth for the chart-reading templates: the corner points come from the drawn
// visual itself (checked to sit on its gridlines), never from the generator's stage values.
const slope = (p, q) => (q[1] - p[1]) / (q[0] - p[0]);
const READ_TRUTH = {
  "x-readvt": (pts) => {
    let area = 0;
    for (let i = 0; i + 1 < pts.length; i++) area += ((pts[i + 1][0] - pts[i][0]) * (pts[i][1] + pts[i + 1][1])) / 2;
    const T = pts[pts.length - 1][0] - pts[0][0];
    return { a1: slope(pts[0], pts[1]), a3: slope(pts[pts.length - 2], pts[pts.length - 1]), dist: area, avg: area / T };
  },
  "x-readdt": (pts) => {
    let stop = 0;
    for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1][1] === pts[i][1]) stop += pts[i + 1][0] - pts[i][0];
    const T = pts[pts.length - 1][0] - pts[0][0];
    return { stop, v1: slope(pts[0], pts[1]), v3: slope(pts[pts.length - 2], pts[pts.length - 1]), avg: (pts[pts.length - 1][1] - pts[0][1]) / T };
  },
};

function xVerifyRead(question, answer) {
  const p = question.params;
  const vis = sanitizeVisual(question.visual);
  if (!vis || vis.kind !== "line" || vis.series.length !== 1 || vis.showValues !== false) return false;
  const pts = vis.series[0].points;
  const ax = visualAxes(vis);
  const on = (ticks, x) => ticks.some((t) => Math.abs(t - x) < 1e-9 * Math.max(1, Math.abs(x)));
  // every read value sits exactly on a gridline crossing
  if (!pts.every(([x, y]) => on(ax.x.ticks, x) && on(ax.y.ticks, y))) return false;
  const want = p.v && p.v.pts;
  if (!Array.isArray(want) || want.length !== pts.length || want.some((q, i) => q[0] !== pts[i][0] || q[1] !== pts[i][1])) return false;
  if (!pts.every((q, i) => i === 0 || q[0] > pts[i - 1][0])) return false;
  return xVerify(question, answer, { [p.kind]: () => READ_TRUTH[p.kind](pts) });
}

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "speed") return genSpeed(difficulty, rng);
  if (subtopic === "acceleration") return genAccel(difficulty, rng);
  if (subtopic === "motion-equations") return genMotion(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: substitute the answer back into the formula and look at the residual.
// For rounded answers the allowed residual is 0.005 × (how strongly the formula reacts to the unknown).
export function verify(question, answer) {
  const p = question && question.params;
  if (p && (p.kind === "x-readvt" || p.kind === "x-readdt")) return xVerifyRead(question, answer);
  if (p && typeof p.kind === "string" && p.kind.startsWith("x-")) return xVerify(question, answer, X_TRUTH);
  if (!p || !p.values) return false; // regenerate from the seed to get params back

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;

  const { formula, unknown, rounded } = p;
  const k = { ...p.values, [unknown]: x };
  let residual, sens;
  switch (formula) {
    case "speed": // d = v·t
      if (!(k.t > 0) || !(k.v > 0) || !(k.d > 0)) return false;
      residual = k.v * k.t - k.d;
      sens = unknown === "v" ? k.t : unknown === "t" ? k.v : 1;
      break;
    case "accel": // v = u + a·t
      if (!(k.t > 0)) return false;
      residual = k.u + k.a * k.t - k.v;
      sens = unknown === "a" ? k.t : unknown === "t" ? Math.abs(k.a) : 1;
      break;
    case "displacement": // s = u·t + ½·a·t²
      if (!(k.t > 0)) return false;
      residual = k.u * k.t + 0.5 * k.a * k.t * k.t - k.s;
      sens = unknown === "a" ? (k.t * k.t) / 2 : unknown === "u" ? k.t : 1;
      break;
    case "vsquared": // v² = u² + 2·a·s
      if (unknown === "v" && x < 0) return false;
      residual = k.u * k.u + 2 * k.a * k.s - k.v * k.v;
      sens = unknown === "v" ? 2 * Math.abs(x) + 0.01 : unknown === "s" ? 2 * Math.abs(k.a) : 2 * Math.abs(k.s);
      break;
    default:
      return false;
  }
  if (!Number.isFinite(residual) || sens === 0) return false;
  if (rounded) return Math.abs(residual) <= 0.005 * sens + 1e-6;
  return Number.isInteger(x) && Math.abs(residual) <= 1e-9;
}
