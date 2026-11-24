// Kinematics generator. Uses only the seeded rng passed in by the engine.
// Units: m, s, m/s, m/s². Easy/medium answers are whole numbers; hard answers are rounded to 2 decimals.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
// One decimal place, so given values like 2.3 + 1.1 never print as 3.4000000000000004.
const round1 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 10 + 1e-9)) / 10;

// Answer/choice formatter: whole numbers as-is, rounded answers with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

// Given values and intermediate steps: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// Negative numbers in brackets when substituted into a formula.
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));

function intWithMinAbs(rng, lo, hi, minAbs) {
  let v;
  do {
    v = rng.int(lo, hi);
  } while (Math.abs(v) < minAbs);
  return v;
}

const WHO = ["A cyclist", "A runner", "A car", "A train", "A skateboarder", "A delivery drone", "A sprinter", "A bus"];

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
  let prompt, exact, unit, explanation, candidates, values;
  if (unknown === "v") {
    exact = d / t;
    unit = "m/s";
    values = { d, t };
    prompt = `${who} covers ${num(d)} m in ${num(t)} s at a constant speed. What is its speed, in m/s?${end}`;
    explanation = `Use \`v = d / t\`.\n\n\`v = ${num(d)} / ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [d * t, t / d, d - t]; // multiplied, divided the wrong way, subtracted
  } else if (unknown === "d") {
    exact = v * t;
    unit = "m";
    values = { v, t };
    prompt = `${who} moves at a constant ${num(v)} m/s for ${num(t)} s. How far does it travel, in m?${end}`;
    explanation = `Rearrange \`v = d / t\` to \`d = v × t\`.\n\n\`d = ${num(v)} × ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [v / t, t / v, v + t];
  } else {
    exact = d / v;
    unit = "s";
    values = { d, v };
    prompt = `${who} moves at a constant ${num(v)} m/s. How long does it take to cover ${num(d)} m, in s?${end}`;
    explanation = `Rearrange \`v = d / t\` to \`t = d / v\`.\n\n\`t = ${num(d)} / ${num(v)}\` ${result(exact, rounded, unit)}`;
    candidates = [d * v, v / d, d - v];
  }

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { formula: "speed", unknown, values, rounded },
  };
  return finish(base, exact, rounded, candidates, rng);
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
  let prompt, exact, unit, explanation, candidates, values;
  if (unknown === "a") {
    exact = (v - u) / t;
    unit = "m/s²";
    values = { u, v, t };
    const verb = v >= u ? "speeds up" : "slows down";
    const hint = difficulty === "easy" ? "" : " (Slowing down gives a negative acceleration.)";
    prompt = `${who} ${verb} from ${num(u)} m/s to ${num(v)} m/s in ${num(t)} s. What is its acceleration, in m/s²?${hint}${end}`;
    explanation = `Use \`a = (v - u) / t\`.\n\n\`a = (${num(v)} - ${num(u)}) / ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [(v - u) * t, v / t, (v + u) / t]; // multiplied by t, ignored u, added u
  } else if (unknown === "v") {
    exact = u + a * t;
    unit = "m/s";
    values = { u, a, t };
    prompt = `${who} starts at ${num(u)} m/s and has ${accel(a)} for ${num(t)} s. What is its final velocity, in m/s?${end}`;
    explanation = `Use \`v = u + at\`.\n\n\`v = ${num(u)} + ${par(a)} × ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [u + a, a * t, u - a * t]; // forgot t, forgot u, wrong sign
  } else if (unknown === "u") {
    exact = v - a * t;
    unit = "m/s";
    values = { v, a, t };
    prompt = `${who} has ${accel(a)} for ${num(t)} s and ends at ${num(v)} m/s. What was its initial velocity, in m/s?${end}`;
    explanation = `Rearrange \`v = u + at\` to \`u = v - at\`.\n\n\`u = ${num(v)} - ${par(a)} × ${num(t)}\` ${result(exact, rounded, unit)}`;
    candidates = [v + a * t, v - a, a * t];
  } else {
    exact = (v - u) / a;
    unit = "s";
    values = { u, v, a };
    prompt = `${who} goes from ${num(u)} m/s to ${num(v)} m/s with ${accel(a)}. How long does this take, in s?${end}`;
    explanation = `Rearrange \`v = u + at\` to \`t = (v - u) / a\`.\n\n\`t = (${num(v)} - ${num(u)}) / ${par(a)}\` ${result(exact, rounded, unit)}`;
    candidates = [(v - u) * a, v / a, (v + u) / a];
  }

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { formula: "accel", unknown, values, rounded },
  };
  return finish(base, exact, rounded, candidates, rng);
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
  let prompt, exact, unit, explanation, candidates, values, formula, unknown;

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
  }

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { formula, unknown, values, rounded },
  };
  return finish(base, exact, rounded, candidates, rng);
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "speed") return genSpeed(difficulty, rng);
  if (subtopic === "acceleration") return genAccel(difficulty, rng);
  if (subtopic === "motion-equations") return genMotion(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: substitute the answer back into the formula and look at the residual.
// For rounded answers the allowed residual is 0.005 × (how strongly the formula reacts to the unknown).
export function verify(question, answer) {
  const p = question && question.params;
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
