// Vectors & Movement generator (Game Dev). Uses only the seeded rng passed in by the engine.
// 2D maths with y-up axes, stated in every prompt where direction matters.
// Whole-number answers are exact; every other answer says "round to 2 decimal places" (±0.005).
// verify() never reuses the generating formula: it uses polar form (atan2 + cos/sin), simulation,
// closed forms for loops, or substitution back into the question.

// ---- Segmented (block-list) choices (ticket 019) ----
// Options are arrays with one segment per column (`choiceCols`); the engine joins them with " | ".
// verify() sees the raw arrays (or joined strings for stored questions). Easy has 3 options and the
// other levels 5; every wrong option differs from the right one in 1 to n−1 columns. `extraSegs` are
// Build-mode decoy blocks, and no combination of the available blocks other than the answer is right.
const SEG_OPTIONS = { easy: 3, medium: 5, hard: 5, expert: 5 };
const segsOf = (c) => (Array.isArray(c) ? c.map((s) => String(s).trim()) : String(c ?? "").split("|").map((s) => s.trim()));
const segKey = (c) => segsOf(c).join(" | ");
const segDiff = (a, b) => a.reduce((n, s, i) => n + (s !== b[i] ? 1 : 0), 0);
// Checks a segmented choice: shape, option count (`want`, when given), exactly one right option and it
// is `answer`, wrong options differ in 1..n−1 columns, and (build) exactly one right combination among
// every block on offer (the options' segments plus extraSegs).
function segOk(q, answer, isRight, want, build = true) {
  const cols = q && q.choiceCols;
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > 4 || !Array.isArray(q.choices)) return false;
  const n = cols.length;
  const opts = q.choices.map(segsOf);
  if ((want && opts.length !== want) || opts.length < 2 || opts.some((t) => t.length !== n || t.some((s) => !s))) return false;
  if (new Set(opts.map((t) => t.join(" | "))).size !== opts.length) return false;
  const right = opts.filter((t) => isRight(t));
  if (right.length !== 1) return false;
  const a = segsOf(answer);
  if (a.length !== n || segDiff(a, right[0]) !== 0) return false;
  if (opts.some((t) => t !== right[0] && (segDiff(t, right[0]) < 1 || segDiff(t, right[0]) >= n))) return false;
  if (!build) return true;
  const pools = cols.map((_, i) => new Set(opts.map((t) => t[i])));
  for (const e of Array.isArray(q.extraSegs) ? q.extraSegs : []) {
    const i = Array.isArray(e) ? (typeof e[0] === "number" ? e[0] : cols.indexOf(e[0])) : -1;
    if (i < 0 || i >= n || !String(e[1] ?? "").trim()) return false;
    pools[i].add(String(e[1]).trim());
  }
  let hits = 0;
  const walk = (i, acc) => {
    if (hits > 1) return;
    if (i === n) { if (isRight(acc)) hits++; return; }
    for (const v of pools[i]) walk(i + 1, [...acc, v]);
  };
  walk(0, []);
  return hits === 1;
}

// ---------- number helpers ----------

// Round half away from zero; the 1e-9 nudge absorbs binary error (2.525*100 = 252.4999...).
import { fmtAnswer as fmtAns, fmtNum, round2 } from "../../js/lib/mathutil.js";
const fix0 = (n) => (Object.is(n, -0) ? 0 : n);

// Shortest display form (up to 4 decimals); never "-0".
const num = (n) => fmtNum(n);
// Negative numbers in brackets inside a formula.
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));
const vec = (x, y) => `(${num(x)}, ${num(y)})`;

// Final value line: "= **5**" or "≈ 5.3852, which rounds to **5.39**".
function res(exact, rounded, unit = "") {
  const u = !unit ? "" : unit === "°" ? "°" : ` ${unit}`;
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${num(exact)}${u}, which rounds to **${shown}${u}**`;
}

const nz = (rng, lo, hi) => {
  let v;
  do v = rng.int(lo, hi);
  while (v === 0);
  return v;
};
const tenth = (rng, lo, hi) => rng.int(lo * 10, hi * 10) / 10; // one decimal place
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
// Angle in [0, 360).
const wrap360 = (a) => ((a % 360) + 360) % 360;

const END = " Round to 2 decimal places.";
const THEN = " Then round to 2 decimal places.";
const YUP = "Axes: +x is right and +y is up (many 2D engines draw +y down, but here y is up).";
const ANG = "Angles are measured from the +x axis, counter-clockwise, in degrees from 0 up to (not including) 360.";

const WHO = ["the player", "a spaceship", "an enemy drone", "a slime", "a knight", "a race car", "a bat", "a robot", "a fireball", "a hover bike"];
const UNIT = ["units", "px", "m"];

// ---------- question builders ----------

// 4 unique choices: the answer + 3 distractors from common mistakes, topped up with nearby values.
function buildChoices(correct, candidates, rounded, neg, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && !neg) return;
    if (!rounded && Number.isInteger(correct) && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  const step = rounded ? 0.5 : 1;
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k * step);
    tryAdd(correct - k * step);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// One-number question; with `candidates` it becomes multiple choice 30% of the time.
function single({ prompt, exact, rounded, explanation, hints, given, params, candidates, neg = false, rng }) {
  const base = {
    prompt,
    explanation,
    hints,
    given,
    tolerance: rounded ? 0.005 : 0,
    params: { ...params, rounded },
  };
  if (candidates && rng.next() < 0.3) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, neg, rng);
    return { ...base, answerType: "choice", answer, choices };
  }
  return { ...base, answerType: "number", answer: rounded ? round2(exact) : exact, choices: undefined };
}

function numPart(id, label, ask, exact, rounded, hint) {
  return { id, label, ask, answerType: "number", answer: rounded ? round2(exact) : exact, tolerance: rounded ? 0.005 : 0, hint };
}
function choicePart(id, label, ask, answer, choices, hint) {
  return { id, label, ask, answerType: "choice", answer, choices: choices.slice(), hint };
}
function multi({ prompt, parts, explanation, hints, given, params, rounded }) {
  return { prompt, answerType: "multi", parts, explanation, hints, given, params: { ...params, rounded } };
}

const giv = (obj) => Object.entries(obj).map(([k, value]) => ({ label: `_${k}`, value }));

// Pythagorean triples for whole-number lengths.
const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20], [20, 21, 29]];
function tripleVec(rng) {
  const [a, b, c] = rng.pick(TRIPLES);
  const swap = rng.next() < 0.5;
  const sx = rng.next() < 0.5 ? -1 : 1;
  const sy = rng.next() < 0.5 ? -1 : 1;
  return { x: sx * (swap ? b : a), y: sy * (swap ? a : b), len: c };
}

// ======================= Vectors =======================

function genVectors(d, rng) {
  const kind = rng.pick(
    { easy: ["add", "sub", "scale", "mag", "dot"], medium: ["steps", "mag", "dist", "dot", "norm"], hard: ["norm2", "facing", "setlen", "dist"] }[d],
  );
  const who = rng.pick(WHO);

  if (kind === "add" || kind === "sub" || kind === "steps") {
    const R = d === "easy" ? 9 : 15;
    let ax = rng.int(-R, R), ay = rng.int(-R, R), bx = nz(rng, -R, R), by = nz(rng, -R, R);
    let k, prompt, intro;
    if (kind === "add") {
      k = 1;
      prompt = `${YUP} ${who[0].toUpperCase() + who.slice(1)} moves with velocity v = ${vec(ax, ay)}, and a wind adds w = ${vec(bx, by)} (units per second). What is the combined velocity v + w?`;
      intro = "Add vectors component by component: x with x, y with y.";
    } else if (kind === "sub") {
      k = -1;
      prompt = `${YUP} A turret sits at A = ${vec(bx, by)} and its target is at B = ${vec(ax, ay)}. What is the vector from A to B, that is B − A?`;
      intro = "The vector from A to B is B − A: subtract A's components from B's.";
    } else {
      k = rng.int(2, 5);
      prompt = `${YUP} ${who[0].toUpperCase() + who.slice(1)} starts at p = ${vec(ax, ay)} and takes ${k} identical steps of s = ${vec(bx, by)}. Where does it end up, p + ${k}·s?`;
      intro = `Scale the step first (${k}·s), then add it to the start, component by component.`;
    }
    const rx = ax + k * bx, ry = ay + k * by;
    const op = k === 1 ? "+" : k === -1 ? "−" : `+ ${k} ×`;
    const g = kind === "sub" ? giv({ ax: bx, ay: by, bx: ax, by: ay }) : kind === "steps" ? giv({ px: ax, py: ay, sx: bx, sy: by, k }) : giv({ vx: ax, vy: ay, wx: bx, wy: by });
    const [X1, Y1, X2, Y2] = kind === "sub" ? ["_bx", "_by", "_ax", "_ay"] : kind === "steps" ? ["_px", "_py", "_sx", "_sy"] : ["_vx", "_vy", "_wx", "_wy"];
    const calcOp = k === 1 ? "+" : k === -1 ? "-" : "+ _k *";
    const xs = `${num(ax)} ${op} ${par(bx)}`;
    const ys = `${num(ay)} ${op} ${par(by)}`;
    const explanation =
      `${intro}\n\n` +
      `- x: \`${xs}\` ${res(rx, false)}\n` +
      `- y: \`${ys}\` ${res(ry, false)}\n\n` +
      `So the result is ${vec(rx, ry)}.`;
    return multi({
      prompt,
      parts: [
        numPart("x", "x component", "The x component of the result", rx, false, `x: \`${xs}\` (in the calculator: \`${X1} ${calcOp} ${X2}\`).`),
        numPart("y", "y component", "The y component of the result", ry, false, `y: \`${ys}\` (in the calculator: \`${Y1} ${calcOp} ${Y2}\`).`),
      ],
      explanation,
      hints: [intro],
      given: g,
      params: { kind: "lin", v: { ax, ay, bx, by, k } },
      rounded: false,
    });
  }

  if (kind === "scale") {
    const x = rng.int(-9, 9), y = nz(rng, -9, 9);
    const k = rng.pick([2, 3, 4, -1, -2, 0.5]);
    const xx = k === 0.5 && x % 2 ? x + 1 : x;
    const yy = k === 0.5 && y % 2 ? y + (y > 0 ? 1 : -1) : y;
    const rx = k * xx, ry = k * yy;
    const prompt = `${YUP} ${who[0].toUpperCase() + who.slice(1)} has velocity v = ${vec(xx, yy)}. A ${k === 0.5 ? "slow-down zone" : k < 0 ? "bounce" : "speed boost"} multiplies it by ${num(k)}. What is ${num(k)}·v?`;
    const intro = `Multiplying a vector by a number multiplies each component by it.${k < 0 ? " A negative number flips the direction." : ""}`;
    return multi({
      prompt,
      parts: [
        numPart("x", "x component", "The x component of the result", rx, false, `x: \`${num(k)} × ${par(xx)}\` (in the calculator: \`_k * _vx\`).`),
        numPart("y", "y component", "The y component of the result", ry, false, `y: \`${num(k)} × ${par(yy)}\` (in the calculator: \`_k * _vy\`).`),
      ],
      explanation: `${intro}\n\n- x: \`${num(k)} × ${par(xx)}\` ${res(rx, false)}\n- y: \`${num(k)} × ${par(yy)}\` ${res(ry, false)}\n\nSo ${num(k)}·v = ${vec(rx, ry)}.`,
      hints: [intro],
      given: giv({ vx: xx, vy: yy, k }),
      params: { kind: "scale", v: { x: xx, y: yy, k } },
      rounded: false,
    });
  }

  if (kind === "mag") {
    let x, y, exact, rounded;
    if (d === "easy") {
      ({ x, y } = tripleVec(rng));
      rounded = false;
    } else {
      do {
        x = rng.int(-15, 15);
        y = rng.int(-15, 15);
      } while (x === 0 || y === 0 || Number.isInteger(Math.sqrt(x * x + y * y)));
      rounded = true;
    }
    const sq = x * x + y * y;
    exact = Math.sqrt(sq);
    const prompt = `${who[0].toUpperCase() + who.slice(1)} moves with velocity v = ${vec(x, y)} units per second. What is its speed, the length |v| = √(x² + y²)?${rounded ? END : ""}`;
    return single({
      prompt,
      exact,
      rounded,
      explanation: `The length of a vector comes from Pythagoras: \`|v| = √(x² + y²)\`.\n\n\`|v| = √(${par(x)}² + ${par(y)}²) = √(${x * x} + ${y * y}) = √${sq}\` ${res(exact, rounded)}`,
      hints: [
        "Speed is the length of the velocity vector: `|v| = √(x² + y²)`. Squaring removes any minus signs.",
        `Square and add: \`${par(x)}² + ${par(y)}² = ${x * x} + ${y * y}\`, then take the square root (in the calculator: \`sqrt(_vx^2 + _vy^2)\`).${rounded ? THEN : ""}`,
      ],
      given: giv({ vx: x, vy: y }),
      params: { kind: "mag", v: { x, y } },
      candidates: [Math.abs(x) + Math.abs(y), sq, Math.sqrt(Math.abs(x) + Math.abs(y))],
      rng,
    });
  }

  if (kind === "dist") {
    let x1, y1, x2, y2;
    const hard = d === "hard";
    do {
      x1 = hard ? tenth(rng, -20, 20) : rng.int(-12, 12);
      y1 = hard ? tenth(rng, -20, 20) : rng.int(-12, 12);
      x2 = hard ? tenth(rng, -20, 20) : rng.int(-12, 12);
      y2 = hard ? tenth(rng, -20, 20) : rng.int(-12, 12);
    } while (Math.abs(x2 - x1) < 1 || Math.abs(y2 - y1) < 1);
    const dx = x2 - x1, dy = y2 - y1;
    const exact = Math.hypot(dx, dy);
    const prompt = `An enemy stands at E = ${vec(x1, y1)} and the player at P = ${vec(x2, y2)}. How far apart are they (the straight-line distance)?${END}`;
    return single({
      prompt,
      exact,
      rounded: true,
      explanation:
        `Find the difference vector P − E, then its length.\n\n` +
        `- \`dx = ${num(x2)} − ${par(x1)} = ${num(dx)}\`, \`dy = ${num(y2)} − ${par(y1)} = ${num(dy)}\`\n` +
        `- \`distance = √(dx² + dy²) = √(${par(dx)}² + ${par(dy)}²)\` ${res(exact, true)}`,
      hints: [
        "The distance is the length of the vector from E to P: subtract the coordinates, then use Pythagoras.",
        `\`dx = ${num(x2)} − ${par(x1)}\` and \`dy = ${num(y2)} − ${par(y1)}\` (in the calculator: \`_px - _ex\`, \`_py - _ey\`).`,
        `Then \`√(dx² + dy²)\` (in the calculator: \`sqrt((_px - _ex)^2 + (_py - _ey)^2)\`).${THEN}`,
      ],
      given: giv({ ex: x1, ey: y1, px: x2, py: y2 }),
      params: { kind: "dist", v: { x1, y1, x2, y2 } },
      candidates: [Math.abs(dx) + Math.abs(dy), Math.hypot(x1 + x2, y1 + y2), dx * dx + dy * dy],
      rng,
    });
  }

  if (kind === "dot") {
    const R = d === "easy" ? 6 : 12;
    const ax = rng.int(-R, R), ay = nz(rng, -R, R), bx = nz(rng, -R, R), by = rng.int(-R, R);
    const exact = ax * bx + ay * by;
    const prompt = `Work out the dot product a · b for a = ${vec(ax, ay)} and b = ${vec(bx, by)}.`;
    return single({
      prompt,
      exact,
      rounded: false,
      explanation: `The dot product multiplies matching components and adds: \`a · b = ax·bx + ay·by\`.\n\n\`a · b = ${par(ax)} × ${par(bx)} + ${par(ay)} × ${par(by)} = ${num(ax * bx)} + ${par(ay * by)}\` ${res(exact, false)}`,
      hints: [
        "Multiply x by x and y by y, then add the two products: `a · b = ax·bx + ay·by`. The result is a single number, not a vector.",
        `\`${par(ax)} × ${par(bx)} + ${par(ay)} × ${par(by)}\` (in the calculator: \`_ax * _bx + _ay * _by\`). Watch the signs.`,
      ],
      given: giv({ ax, ay, bx, by }),
      params: { kind: "dot", v: { ax, ay, bx, by } },
      candidates: [ax * by + ay * bx, ax * bx - ay * by, -exact],
      neg: true,
      rng,
    });
  }

  if (kind === "norm" || kind === "norm2" || kind === "setlen") {
    let x, y;
    do {
      x = rng.int(-15, 15);
      y = rng.int(-15, 15);
    } while (x === 0 || y === 0 || (kind === "norm" && Number.isInteger(Math.hypot(x, y))));
    const len = Math.hypot(x, y);
    const sq = x * x + y * y;
    if (kind === "norm") {
      const field = rng.pick(["x", "y"]);
      const c = field === "x" ? x : y;
      const exact = c / len;
      const L = field === "x" ? "_dx" : "_dy";
      const prompt = `${YUP} ${who[0].toUpperCase() + who.slice(1)} wants to move in the direction d = ${vec(x, y)}. Normalise d (make it length 1, keeping its direction). What is the ${field} component of the unit vector?${END}`;
      return single({
        prompt,
        exact,
        rounded: true,
        explanation:
          `Divide each component by the length.\n\n` +
          `- \`|d| = √(${par(x)}² + ${par(y)}²) = √${sq}\` ≈ ${num(len)}\n` +
          `- ${field}: \`${num(c)} / ${num(len)}\` ${res(exact, true)}`,
        hints: [
          "A unit vector has length 1. Divide each component by the vector's length `|d| = √(x² + y²)`.",
          `\`|d| = √(${par(x)}² + ${par(y)}²) = √${sq}\`. Then divide the ${field} component, ${num(c)}, by it (in the calculator: \`${L} / sqrt(_dx^2 + _dy^2)\`).${THEN}`,
        ],
        given: giv({ dx: x, dy: y }),
        params: { kind: "norm", field, v: { x, y } },
        candidates: [c / sq, c / (Math.abs(x) + Math.abs(y)), (field === "x" ? y : x) / len],
        neg: true,
        rng,
      });
    }
    const L = kind === "setlen" ? rng.int(3, 12) : 1;
    const rx = (L * x) / len, ry = (L * y) / len;
    const prompt =
      kind === "norm2"
        ? `${YUP} Normalise the aim vector d = ${vec(x, y)}: find the vector of length 1 pointing the same way. Give both components.${END}`
        : `${YUP} ${who[0].toUpperCase() + who.slice(1)} heads in the direction d = ${vec(x, y)} at a speed of ${L} units per second. What is its velocity vector? (Normalise d, then multiply by the speed.)${END}`;
    const mul = L === 1 ? "" : `${L} × `;
    const calc = (c) => (L === 1 ? `${c} / sqrt(_dx^2 + _dy^2)` : `_speed * ${c} / sqrt(_dx^2 + _dy^2)`);
    return multi({
      prompt,
      parts: [
        numPart("x", "x component", kind === "norm2" ? "x of the unit vector" : "x of the velocity", rx, true, `x: \`${mul}${par(x)} / √${sq}\` (in the calculator: \`${calc("_dx")}\`).${THEN}`),
        numPart("y", "y component", kind === "norm2" ? "y of the unit vector" : "y of the velocity", ry, true, `y: \`${mul}${par(y)} / √${sq}\` (in the calculator: \`${calc("_dy")}\`).${THEN}`),
      ],
      explanation:
        `First find the length, then divide each component by it${L === 1 ? "" : ` and multiply by the speed ${L}`}.\n\n` +
        `- \`|d| = √(${par(x)}² + ${par(y)}²) = √${sq}\` ≈ ${num(len)}\n` +
        `- x: \`${mul}${par(x)} / ${num(len)}\` ${res(rx, true)}\n` +
        `- y: \`${mul}${par(y)} / ${num(len)}\` ${res(ry, true)}`,
      hints: [`Find the length first: \`|d| = √(${par(x)}² + ${par(y)}²) = √${sq}\`.`],
      given: L === 1 ? giv({ dx: x, dy: y }) : giv({ dx: x, dy: y, speed: L }),
      params: { kind: "setlen", v: { x, y, L } },
      rounded: true,
    });
  }

  // facing (hard): dot product sign tells front / behind / side.
  const fx = rng.int(-5, 5);
  const fy = fx === 0 ? nz(rng, -5, 5) : rng.int(-5, 5);
  const gx = rng.int(-10, 10), gy = rng.int(-10, 10);
  let px, py;
  if (rng.next() < 0.2) {
    const m = nz(rng, -3, 3); // exactly to the side: along the perpendicular (-fy, fx)
    px = gx - m * fy;
    py = gy + m * fx;
  } else {
    do {
      px = rng.int(-12, 12);
      py = rng.int(-12, 12);
    } while ((px === gx && py === gy) || fx * (px - gx) + fy * (py - gy) === 0);
  }
  const dxp = px - gx, dyp = py - gy;
  const dot = fx * dxp + fy * dyp;
  const rel = dot > 0 ? REL[0] : dot < 0 ? REL[1] : REL[2];
  return multi({
    prompt: `${YUP} A guard at G = ${vec(gx, gy)} faces the direction f = ${vec(fx, fy)}. The player is at P = ${vec(px, py)}. Let d = P − G. Find f · d, then decide where the player is relative to the guard's facing.`,
    parts: [
      numPart("dot", "Dot product", "f · d", dot, false, `\`d = P − G = ${vec(dxp, dyp)}\`. Then \`f · d = ${par(fx)} × ${par(dxp)} + ${par(fy)} × ${par(dyp)}\` (in the calculator: \`_fx * (_px - _gx) + _fy * (_py - _gy)\`).`),
      { ...choicePart("rel", "Position", "Where is the player, and what is the sign of f · d?", segsOf(rel), oneOffChoices(segsOf(rel), REL_POS, REL_DOT), "Positive dot product: the angle between f and d is under 90°. Negative: over 90°. Zero: exactly 90°."), choiceCols: ["Position", "Dot"] },
    ],
    explanation:
      `The sign of the dot product tells you whether two directions point the same way.\n\n` +
      `- \`d = P − G = ${vec(dxp, dyp)}\`\n` +
      `- \`f · d = ${par(fx)} × ${par(dxp)} + ${par(fy)} × ${par(dyp)}\` ${res(dot, false)}\n` +
      `- ${dot > 0 ? "Positive, so the angle is under 90°" : dot < 0 ? "Negative, so the angle is over 90°" : "Zero, so the angle is exactly 90°"}: **${segsOf(rel)[0]}** (${segsOf(rel)[1]}).`,
    hints: ["Make the vector from the guard to the player first, d = P − G, then dot it with the facing direction."],
    given: giv({ gx, gy, fx, fy, px, py }),
    params: { kind: "facing", v: { gx, gy, fx, fy, px, py } },
    rounded: false,
  });
}

// Position | Dot blocks for the facing question; REL[i] is a joined option (stored form).
const REL_POS = ["In front", "Behind", "Exactly to the side"];
const REL_DOT = ["dot > 0", "dot < 0", "dot = 0"];
const REL = REL_POS.map((x, i) => `${x} | ${REL_DOT[i]}`);
// The right [a, b] pair plus every pair that changes exactly one of them, in a fixed order (no rng).
function oneOffChoices(right, colA, colB) {
  const out = [];
  for (const a of colA) for (const b of colB) {
    const d = (a !== right[0]) + (b !== right[1]);
    if (d <= 1) out.push([a, b]);
  }
  return out;
}

// ======================= Movement =======================

function genMovement(d, rng) {
  const kind = rng.pick({ easy: ["pos", "perframe", "perframe"], medium: ["pos", "frames", "framedep", "euler"], hard: ["pos", "frames", "euler", "euler"] }[d]);
  const who = rng.pick(WHO);
  const Who = who[0].toUpperCase() + who.slice(1);

  if (kind === "pos") {
    let x0, y0, vx, vy, t;
    if (d === "easy") {
      x0 = rng.int(0, 20); y0 = rng.int(0, 20); vx = rng.int(-5, 8); vy = nz(rng, -5, 8); t = rng.int(2, 6);
    } else if (d === "medium") {
      x0 = rng.int(-30, 30); y0 = rng.int(-30, 30); vx = nz(rng, -12, 12); vy = nz(rng, -12, 12); t = rng.int(3, 15) / 2;
    } else {
      x0 = tenth(rng, -20, 20); y0 = tenth(rng, -20, 20); vx = tenth(rng, -9, 9); vy = tenth(rng, -9, 9); t = rng.int(105, 480) / 100;
      if (vx === 0) vx = 1.5;
      if (vy === 0) vy = -2.5;
    }
    const rounded = d === "hard";
    const rx = x0 + vx * t, ry = y0 + vy * t;
    const prompt = `${YUP} ${Who} starts at ${vec(x0, y0)} and moves at a constant velocity of ${vec(vx, vy)} units per second. Where is it after ${num(t)} seconds?${rounded ? END : Number.isInteger(t) ? "" : " Give exact values (they may end in .5)."}`;
    const intro = "Position = start + velocity × time, for x and y separately.";
    return multi({
      prompt,
      parts: [
        numPart("x", "x position", "x after the move", rx, rounded, `x: \`${num(x0)} + ${par(vx)} × ${num(t)}\` (in the calculator: \`_x0 + _vx * _t\`).${rounded ? THEN : ""}`),
        numPart("y", "y position", "y after the move", ry, rounded, `y: \`${num(y0)} + ${par(vy)} × ${num(t)}\` (in the calculator: \`_y0 + _vy * _t\`).${rounded ? THEN : ""}`),
      ],
      explanation: `${intro}\n\n- x: \`${num(x0)} + ${par(vx)} × ${num(t)}\` ${res(rx, rounded)}\n- y: \`${num(y0)} + ${par(vy)} × ${num(t)}\` ${res(ry, rounded)}`,
      hints: [intro + " Multiply before you add."],
      given: giv({ x0, y0, vx, vy, t }),
      params: { kind: "pos", v: { x0, y0, vx, vy, t } },
      rounded,
    });
  }

  if (kind === "perframe") {
    const fps = rng.pick(d === "easy" ? [30, 60, 120] : [30, 50, 60, 75, 120, 144]);
    let speed, rounded;
    if (d === "easy") {
      speed = fps * rng.int(1, 8);
      rounded = false;
    } else {
      do speed = rng.int(10, 90) * 10;
      while (speed % fps === 0);
      rounded = true;
    }
    const exact = speed / fps;
    return single({
      prompt: `${Who} moves at ${speed} px per second. The game runs at ${fps} frames per second and moves it by speed × delta time each frame, where delta time = 1 / ${fps} s. How many px does it move each frame?${rounded ? END : ""}`,
      exact,
      rounded,
      explanation: `Delta time is the length of one frame: \`dt = 1 / ${fps}\` s.\n\n\`distance per frame = ${speed} × 1 / ${fps}\` ${res(exact, rounded, "px")}`,
      hints: [
        "Frame-rate independent movement: each frame, move speed × delta time. Delta time is 1 / fps seconds.",
        `\`${speed} × (1 / ${fps})\`, which is the same as \`${speed} / ${fps}\` (in the calculator: \`_speed / _fps\`).${rounded ? THEN : ""}`,
      ],
      given: giv({ speed, fps }),
      params: { kind: "perframe", v: { speed, fps } },
      candidates: [speed * fps, fps / speed, speed / (fps / 2)],
      rng,
    });
  }

  if (kind === "frames") {
    const fps = rng.pick([30, 60, 120, 144]);
    const speed = rng.int(5, 60) * 10;
    let dist;
    do dist = rng.int(d === "hard" ? 101 : 20, d === "hard" ? 999 : 300);
    while (d === "medium" && (dist * fps) % speed === 0 && rng.next() < 0.5);
    const frames = Math.ceil((dist * fps) / speed - 1e-12);
    const exactDiv = (dist * fps) % speed === 0;
    return single({
      prompt: `${Who} moves at ${speed} px per second in a game running at ${fps} fps (each frame it moves ${speed} × 1/${fps} px). After how many frames has it moved at least ${dist} px? Give a whole number of frames.`,
      exact: frames,
      rounded: false,
      explanation:
        `Each frame covers \`${speed} / ${fps}\` ≈ ${num(speed / fps)} px.\n\n` +
        `\`frames = ${dist} / (${speed} / ${fps}) = ${dist} × ${fps} / ${speed}\` ≈ ${num((dist * fps) / speed)}\n\n` +
        (exactDiv ? `That is a whole number, so it reaches exactly ${dist} px on that frame: **${frames}** frames.` : `It needs a whole number of frames and must reach at least ${dist} px, so round up: **${frames}** frames.`),
      hints: [
        `Distance per frame is speed / fps = \`${speed} / ${fps}\` px.`,
        `Divide the distance by that: \`${dist} / (${speed} / ${fps})\` (in the calculator: \`_dist / (_speed / _fps)\`). A part frame doesn't exist, so think about which way to round.`,
      ],
      given: giv({ speed, fps, dist }),
      params: { kind: "frames", v: { speed, fps, dist } },
      candidates: [Math.floor((dist * fps) / speed), frames + 1, Math.round(dist / speed)],
      rng,
    });
  }

  if (kind === "framedep") {
    const k = rng.int(2, 9);
    const base = 60;
    const F = rng.pick([30, 75, 120, 144, 165, 240]);
    if (rng.next() < 0.5) {
      const exact = k * F;
      return single({
        prompt: `A bug: ${who} moves ${k} px every frame and ignores delta time. It was tuned at ${base} fps (${k * base} px/s). How many px per second does it move on a monitor running at ${F} fps?`,
        exact,
        rounded: false,
        explanation: `Without delta time, the distance per frame is fixed, so speed = px per frame × frames per second.\n\n\`${k} × ${F}\` ${res(exact, false, "px/s")}\n\nThat's why movement should be scaled by delta time.`,
        hints: [
          "Without delta time it moves the same px every frame, so more frames per second means more px per second.",
          `px per second = px per frame × fps: \`${k} × ${F}\` (in the calculator: \`_k * _fps\`).`,
        ],
        given: giv({ k, fps: F }),
        params: { kind: "fd-speed", v: { k, F } },
        candidates: [k * base, (k * base) / F, k + F],
        rng,
      });
    }
    const exact = (k * base) / F;
    const rounded = !Number.isInteger(round2(exact)) || Math.abs(exact - Math.round(exact)) > 1e-9;
    return single({
      prompt: `${Who} was tuned to move ${k} px per frame at ${base} fps. To keep the same speed in px per second at ${F} fps, how many px must it move each frame?${rounded ? END : ""}`,
      exact,
      rounded,
      explanation: `Keep px per second the same: \`${k} × ${base} = ${k * base}\` px/s.\n\nAt ${F} fps: \`${k * base} / ${F}\` ${res(exact, rounded, "px")}`,
      hints: [
        `First find the speed in px per second at ${base} fps: \`${k} × ${base}\`.`,
        `Spread that speed over ${F} frames: \`${k} × ${base} / ${F}\` (in the calculator: \`_k * _base / _fps\`).${rounded ? THEN : ""}`,
      ],
      given: giv({ k, base, fps: F }),
      params: { kind: "fd-step", v: { k, base, F } },
      candidates: [(k * F) / base, k * F, k],
      rng,
    });
  }

  // euler: semi-implicit Euler (velocity first, then position), simulated step by step.
  const dt = rng.pick(d === "medium" ? [0.5, 0.25, 0.1] : [0.1, 0.05, 0.2]);
  const n = d === "medium" ? rng.int(2, 4) : rng.int(4, 8);
  const a = d === "medium" ? nz(rng, -10, 10) : -rng.pick([9.8, 9.81, 10, 15, 20, 30]);
  const v0 = d === "medium" ? rng.int(-5, 10) : rng.int(2, 25);
  const p0 = d === "medium" ? rng.int(0, 20) : rng.int(0, 50);
  let v = v0, p = p0;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    v = v + a * dt;
    p = p + v * dt;
    rows.push(`| ${i} | ${num(v)} | ${num(p)} |`);
  }
  const setup =
    d === "medium"
      ? `An object on a line starts at position ${p0} with velocity ${v0} and constant acceleration ${a} (units/s²).`
      : `${YUP} A jumping ${rng.pick(["frog", "knight", "robot", "ball"])} starts at height y = ${p0} with upward velocity ${v0}, and gravity gives acceleration ${a} (units/s²).`;
  const rule = `The game updates every dt = ${num(dt)} s, and each step does first v = v + a·dt, then p = p + v·dt (using the new v).`;
  const table = `| Step | v | p |\n| --- | --- | --- |\n| 0 | ${num(v0)} | ${num(p0)} |\n${rows.join("\n")}`;
  const g = giv({ p0, v0, a, dt });
  const params = { kind: "euler", v: { p0, v0, a, dt, n } };
  const v1 = v0 + a * dt;
  const step1 = `Step 1: \`v = ${num(v0)} + ${par(a)} × ${num(dt)} = ${num(v1)}\`, then \`p = ${num(p0)} + ${par(v1)} × ${num(dt)} = ${num(p0 + v1 * dt)}\`.`;
  const expl = `Repeat the two updates ${n} times, always updating v before p.\n\n${table}\n\nAfter ${n} steps, v ${res(v, true)} and p ${res(p, true)}.`;
  if (d === "medium") {
    return single({
      prompt: `${setup} ${rule} What is its position after ${n} steps?${END}`,
      exact: p,
      rounded: true,
      explanation: expl,
      hints: [
        "Keep a small table of v and p. Each step: update v first, then use that new v to move p.",
        step1,
        `${n === 2 ? "Repeat for step 2" : `Repeat for steps 2 to ${n}`} (in the calculator: a row \`_v1 = _v0 + _a * _dt\`, then \`_p1 = _p0 + _v1 * _dt\`, and so on).${THEN}`,
      ],
      given: g,
      params,
    });
  }
  return multi({
    prompt: `${setup} ${rule} After ${n} steps, what are its velocity and its height?${END}`,
    parts: [
      numPart("v", "Velocity", `v after ${n} steps`, v, true, `Velocity changes by the same amount every step: \`${par(a)} × ${num(dt)}\`. Add that ${n} times to ${num(v0)}.${THEN}`),
      numPart("p", "Height", `y after ${n} steps`, p, true, `${step1} Keep going until step ${n}.${THEN}`),
    ],
    explanation: expl,
    hints: ["Keep a small table of v and p. Each step: update v first, then use that new v to move p."],
    given: g,
    params,
    rounded: true,
  });
}

// ======================= Interpolation =======================

function genInterp(d, rng) {
  const kind = rng.pick({ easy: ["lerp", "lerp", "findt"], medium: ["lerp", "findt", "lerp2d", "smooth"], hard: ["smooth", "smoothframes", "remap", "lerp2d"] }[d]);
  const LERP = "lerp(a, b, t) = a + (b − a) × t";

  if (kind === "lerp" || kind === "findt") {
    let a, b, t, rounded;
    if (d === "easy") {
      const q = rng.pick([4, 10]);
      t = rng.int(1, q - 1) / q;
      a = rng.int(0, 60);
      b = a + nz(rng, -6, 10) * q;
      rounded = false;
    } else {
      a = rng.int(-50, 50);
      do b = rng.int(-80, 120);
      while (Math.abs(b - a) < 7);
      t = rng.int(5, 95) / 100;
      rounded = true;
    }
    const thing = rng.pick([
      ["A health bar animates", "health"],
      ["A camera zooms", "zoom level"],
      ["A door slides", "x position"],
      ["A light fades", "brightness"],
      ["A platform moves", "x position"],
    ]);
    const value = a + (b - a) * t;
    if (kind === "lerp") {
      return single({
        prompt: `${thing[0]} from a = ${num(a)} to b = ${num(b)} using ${LERP}. What is the ${thing[1]} at t = ${num(t)}?${rounded ? END : ""}`,
        exact: value,
        rounded,
        explanation: `Use \`${LERP}\`.\n\n\`${num(a)} + (${num(b)} − ${par(a)}) × ${num(t)} = ${num(a)} + ${par(b - a)} × ${num(t)}\` ${res(value, rounded)}`,
        hints: [
          `Lerp starts at a and goes a fraction t of the way to b: \`${LERP}\`.`,
          `\`b − a = ${num(b)} − ${par(a)} = ${num(b - a)}\`. Multiply by ${num(t)}, then add a (in the calculator: \`_a + (_b - _a) * _t\`).${rounded ? THEN : ""}`,
        ],
        given: giv({ a, b, t }),
        params: { kind: "lerp", v: { a, b, t } },
        candidates: [(b - a) * t, b * t, a + b * t],
        neg: a < 0 || b < 0,
        rng,
      });
    }
    // findt: inverse lerp
    const shown = d === "easy" ? value : round2(value);
    const exact = d === "easy" ? t : (shown - a) / (b - a);
    rounded = true;
    return single({
      prompt: `${thing[0]} from a = ${num(a)} to b = ${num(b)} using ${LERP}. At what t is the ${thing[1]} ${num(shown)}? (This is the inverse lerp.)${END}`,
      exact,
      rounded,
      explanation: `Inverse lerp solves for t: \`t = (value − a) / (b − a)\`.\n\n\`t = (${num(shown)} − ${par(a)}) / (${num(b)} − ${par(a)}) = ${num(shown - a)} / ${par(b - a)}\` ${res(exact, rounded)}`,
      hints: [
        "Inverse lerp asks how far along from a to b the value is: `t = (value − a) / (b − a)`.",
        `Top: \`${num(shown)} − ${par(a)}\`. Bottom: \`${num(b)} − ${par(a)}\` (in the calculator: \`(_value - _a) / (_b - _a)\`).${rounded ? THEN : ""}`,
      ],
      given: giv({ a, b, value: shown }),
      params: { kind: "findt", v: { a, b, value: shown } },
      candidates: [shown / b, (shown - a) / b, (b - shown) / (b - a)],
      rng,
    });
  }

  if (kind === "lerp2d") {
    const ax = rng.int(-20, 20), ay = rng.int(-20, 20);
    let bx, by;
    do {
      bx = rng.int(-30, 30);
      by = rng.int(-30, 30);
    } while (bx === ax || by === ay);
    const rounded = d === "hard";
    const t = rounded ? rng.int(5, 95) / 100 : rng.pick([0.25, 0.5, 0.75, 0.2, 0.4, 0.6, 0.8]);
    const rx = ax + (bx - ax) * t, ry = ay + (by - ay) * t;
    return multi({
      prompt: `${YUP} A camera glides from A = ${vec(ax, ay)} to B = ${vec(bx, by)}, using ${LERP} on each coordinate. Where is it at t = ${num(t)}?${rounded ? END : " Give exact decimals."}`,
      parts: [
        numPart("x", "x", "x at that t", rx, rounded, `x: \`${num(ax)} + (${num(bx)} − ${par(ax)}) × ${num(t)}\` (in the calculator: \`_ax + (_bx - _ax) * _t\`).${rounded ? THEN : ""}`),
        numPart("y", "y", "y at that t", ry, rounded, `y: \`${num(ay)} + (${num(by)} − ${par(ay)}) × ${num(t)}\` (in the calculator: \`_ay + (_by - _ay) * _t\`).${rounded ? THEN : ""}`),
      ],
      explanation: `Lerp each coordinate separately with the same t.\n\n- x: \`${num(ax)} + ${par(bx - ax)} × ${num(t)}\` ${res(rx, rounded)}\n- y: \`${num(ay)} + ${par(by - ay)} × ${num(t)}\` ${res(ry, rounded)}`,
      hints: ["A 2D lerp is two ordinary lerps, one for x and one for y, with the same t."],
      given: giv({ ax, ay, bx, by, t }),
      params: { kind: "lerp2d", v: { ax, ay, bx, by, t } },
      rounded,
    });
  }

  if (kind === "smooth" || kind === "smoothframes") {
    const f = d === "medium" ? 0.5 : rng.pick([0.1, 0.15, 0.2, 0.25, 0.3]);
    const x0 = d === "medium" ? 8 * rng.int(0, 10) : rng.int(0, 50);
    let target;
    do target = d === "medium" ? 8 * rng.int(0, 25) : rng.int(0, 200);
    while (Math.abs(target - x0) < 16);
    const desc = `A smooth-follow camera starts at x = ${x0} and chases a target at x = ${target}. Every frame it moves ${num(f * 100)}% of the remaining gap: x = x + (target − x) × ${num(f)}.`;
    const gap0 = target - x0;
    if (kind === "smooth") {
      const n = d === "medium" ? rng.int(2, 3) : rng.int(3, 6);
      let x = x0;
      const rows = [];
      for (let i = 1; i <= n; i++) {
        x = x + (target - x) * f;
        rows.push(`| ${i} | ${num(x)} | ${num(target - x)} |`);
      }
      const x1 = x0 + gap0 * f;
      return single({
        prompt: `${desc} Where is the camera after ${n} frames?${END}`,
        exact: x,
        rounded: true,
        explanation: `Apply the rule once per frame.\n\n| Frame | x | gap left |\n| --- | --- | --- |\n| 0 | ${x0} | ${num(gap0)} |\n${rows.join("\n")}\n\nShortcut: the gap shrinks by a factor ${num(1 - f)} each frame, so \`x = target − (target − x0) × ${num(1 - f)}^${n}\` ${res(x, true)}`,
        hints: [
          `Each frame closes ${num(f * 100)}% of the gap, so ${num((1 - f) * 100)}% of the gap is left.`,
          `Frame 1: \`${x0} + (${target} − ${x0}) × ${num(f)} = ${num(x1)}\`.`,
          `Repeat ${n} times, or use the shortcut \`target − (target − x0) × ${num(1 - f)}^${n}\` (in the calculator: \`_target - (_target - _x0) * (1 - _f)^_n\`).${THEN}`,
        ],
        given: giv({ x0, target, f, n }),
        params: { kind: "smooth", v: { x0, target, f, n } },
        candidates: [x0 + gap0 * f * n, target - gap0 * Math.pow(f, n), x0 + gap0 * Math.pow(f, n)],
        neg: false,
        rng,
      });
    }
    // smoothframes: first frame where the gap is at most `close`.
    const G = Math.abs(gap0);
    let close;
    let frames;
    do {
      close = rng.int(1, 8);
      frames = Math.ceil(Math.log(close / G) / Math.log(1 - f));
    } while (frames < 3 || frames > 40 || [frames - 1, frames, frames + 1].some((k) => Math.abs(G * Math.pow(1 - f, k) - close) < 1e-4));
    return single({
      prompt: `${desc} After how many frames is the camera within ${close} unit${close === 1 ? "" : "s"} of the target (gap ≤ ${close}) for the first time?`,
      exact: frames,
      rounded: false,
      explanation:
        `The gap starts at ${G} and is multiplied by ${num(1 - f)} every frame, so after n frames it is \`${G} × ${num(1 - f)}^n\`.\n\n` +
        `Solve \`${G} × ${num(1 - f)}^n ≤ ${close}\`: \`n ≥ ln(${close} / ${G}) / ln(${num(1 - f)})\` ≈ ${num(Math.log(close / G) / Math.log(1 - f))}\n\n` +
        `Round up to a whole frame: **${frames}**. Check: after ${frames - 1} frames the gap is about ${num(G * Math.pow(1 - f, frames - 1))}, after ${frames} it is about ${num(G * Math.pow(1 - f, frames))}.`,
      hints: [
        `The gap starts at |${target} − ${x0}| = ${G} and keeps ${num((1 - f) * 100)}% of itself each frame: after n frames it is \`${G} × ${num(1 - f)}^n\`.`,
        `Find the smallest whole n with \`${G} × ${num(1 - f)}^n ≤ ${close}\`. Use logs: \`n ≥ ln(${close} / ${G}) / ln(${num(1 - f)})\` (in the calculator: \`ln(_close / _gap) / ln(1 - _f)\`), then round up.`,
      ],
      given: giv({ gap: G, f, close }),
      params: { kind: "smoothframes", v: { G, f, close } },
      candidates: [frames - 1, frames + 1, Math.round(G / (G * f))],
      rng,
    });
  }

  // remap (hard): inverse lerp, then lerp into another range.
  const inLo = 0, inHi = rng.pick([80, 120, 150, 250, 500]);
  const val = rng.int(1, inHi - 1);
  const outLo = rng.pick([0, 0, 10, 20]);
  const outHi = outLo + rng.pick([150, 200, 240, 300, 320]);
  const t = (val - inLo) / (inHi - inLo);
  const exact = outLo + (outHi - outLo) * t;
  return single({
    prompt: `A player has ${val} of ${inHi} health. The health bar is drawn from x = ${outLo} px (empty) to x = ${outHi} px (full). Remap the health into the bar: at what x px does the bar end?${END}`,
    exact,
    rounded: true,
    explanation:
      `Remapping is an inverse lerp followed by a lerp.\n\n` +
      `- Inverse lerp: \`t = (${val} − ${inLo}) / (${inHi} − ${inLo})\` ≈ ${num(t)}\n` +
      `- Lerp: \`x = ${outLo} + (${outHi} − ${outLo}) × t\` ${res(exact, true, "px")}`,
    hints: [
      "Remap = find how far along the first range the value is (inverse lerp), then go that far along the second range (lerp).",
      `\`t = ${val} / ${inHi}\`. Then \`x = ${outLo} + (${outHi} − ${outLo}) × t\` (in the calculator: \`_lo + (_hi - _lo) * _hp / _max\`).${THEN}`,
    ],
    given: giv({ hp: val, max: inHi, lo: outLo, hi: outHi }),
    params: { kind: "remap", v: { val, inLo, inHi, outLo, outHi } },
    candidates: [(outHi - outLo) * t, outHi * t, val, outLo + (outHi - outLo) * (1 - t)],
    rng,
  });
}

// ======================= Angles & direction =======================

function genAngles(d, rng) {
  const kind = rng.pick({ easy: ["axis", "rot", "rot"], medium: ["angle", "rot", "heading"], hard: ["heading2", "screen", "turn", "angle"] }[d]);

  if (kind === "axis") {
    const k = rng.int(1, 9);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const i = rng.int(0, 7);
    const x = dirs[i][0] * k, y = dirs[i][1] * k;
    const exact = i * 45;
    return single({
      prompt: `${YUP} ${ANG} What angle does the vector ${vec(x, y)} point at?`,
      exact,
      rounded: false,
      explanation: `Sketch it: x is ${x > 0 ? "positive (right)" : x < 0 ? "negative (left)" : "zero"} and y is ${y > 0 ? "positive (up)" : y < 0 ? "negative (down)" : "zero"}.\n\nGoing counter-clockwise from +x (0°): up is 90°, left is 180°, down is 270°, and equal x and y sizes sit halfway between, on a multiple of 45°. So the angle is **${exact}°**.`,
      hints: [
        "0° points right (+x), and angles grow counter-clockwise: a quarter turn takes right to up, a half turn takes it to left.",
        `Here x is ${x > 0 ? "positive" : x < 0 ? "negative" : "zero"} and y is ${y > 0 ? "positive" : y < 0 ? "negative" : "zero"}. When x and y have the same size the vector sits exactly halfway between two of the main directions.`,
      ],
      given: giv({ x, y }),
      params: { kind: "angle", v: { x, y } },
      candidates: [wrap360(360 - exact), wrap360(exact + 180), wrap360(exact + 90)],
      rng,
    });
  }

  if (kind === "rot") {
    const R = d === "easy" ? 9 : 20;
    const x = nz(rng, -R, R), y = nz(rng, -R, R);
    const type = d === "easy" ? rng.pick(["ccw", "180"]) : rng.pick(["cw", "ccw", "270"]);
    let rx, ry, rule, words;
    if (type === "ccw") { rx = -y; ry = x; rule = "(x, y) → (−y, x)"; words = "90° counter-clockwise (a left turn)"; }
    else if (type === "cw") { rx = y; ry = -x; rule = "(x, y) → (y, −x)"; words = "90° clockwise (a right turn)"; }
    else if (type === "270") { rx = y; ry = -x; rule = "270° counter-clockwise is the same as 90° clockwise: (x, y) → (y, −x)"; words = "270° counter-clockwise"; }
    else { rx = -x; ry = -y; rule = "(x, y) → (−x, −y)"; words = "180°"; }
    const intro = `Rotating by ${words} follows a fixed rule: ${rule}.`;
    return multi({
      prompt: `${YUP} ${rng.pick(["A turret's aim", "A character's facing", "A wind direction", "A bullet's velocity"])} is ${vec(x, y)}. Rotate it by ${words}. What is the new vector?`,
      parts: [
        numPart("x", "x component", "x after rotating", fix0(rx), false, type === "180" ? `Both components flip sign. New x is minus the old x, ${num(x)}.` : `Swap the components, then flip one sign. Starting from x = ${num(x)}, y = ${num(y)}, the new x comes from the old ${type === "ccw" ? "y, negated" : "y"}.`),
        numPart("y", "y component", "y after rotating", fix0(ry), false, type === "180" ? `New y is minus the old y, ${num(y)}.` : `The new y comes from the old ${type === "ccw" ? "x" : "x, negated"}.`),
      ],
      explanation: `${intro}\n\nWith x = ${num(x)} and y = ${num(y)} the result is ${vec(rx, ry)}.\n\nCheck: ${type === "180" ? "it points the opposite way, with the same length" : `the dot product with the original is \`${par(x)} × ${par(rx)} + ${par(y)} × ${par(ry)} = 0\`, so the two are at right angles`}.`,
      hints: ["Draw it: a 90° counter-clockwise turn takes right (+x) to up (+y), and up to left. A 180° turn points the opposite way."],
      given: giv({ x, y }),
      params: { kind: "rot", v: { x, y, type } },
      rounded: false,
    });
  }

  // angle helpers for the rest
  const atanExpl = (x, y, a) =>
    `Use \`angle = atan2(y, x)\`, then add 360° if it comes out negative.\n\n` +
    `- \`atan(|y| / |x|) = atan(${num(Math.abs(y))} / ${num(Math.abs(x))})\` ≈ ${num(deg(Math.atan(Math.abs(y) / Math.abs(x))))}°, the angle to the nearest x axis\n` +
    `- The vector is in the ${quadrant(x, y)} quarter (x ${x > 0 ? "> 0" : "< 0"}, y ${y > 0 ? "> 0" : "< 0"}), so ${quadRule(x, y)}\n` +
    `- angle ${res(a, true, "°")}`;

  if (kind === "angle") {
    let x, y;
    do {
      x = nz(rng, -15, 15);
      y = nz(rng, -15, 15);
    } while (Math.abs(x) === Math.abs(y));
    const a = wrap360(deg(Math.atan2(y, x)));
    if (round2(a) >= 360) return genAngles(d, rng);
    const base = deg(Math.atan(Math.abs(y) / Math.abs(x)));
    return single({
      prompt: `${YUP} ${ANG} What angle does the vector ${vec(x, y)} point at?${END}`,
      exact: a,
      rounded: true,
      explanation: atanExpl(x, y, a),
      hints: [
        `Find the angle to the x axis first: \`atan(|y| / |x|) = atan(${num(Math.abs(y))} / ${num(Math.abs(x))})\` (in the calculator: \`atan(abs(_y) / abs(_x))\`).`,
        `The vector is in the ${quadrant(x, y)} quarter, so ${quadRule(x, y)}${THEN}`,
      ],
      given: giv({ x, y }),
      params: { kind: "angle", v: { x, y } },
      candidates: [base, wrap360(360 - a), wrap360(a + 180)],
      rng,
    });
  }

  if (kind === "heading" || kind === "heading2") {
    let ax, ay, bx, by;
    do {
      ax = rng.int(-20, 20); ay = rng.int(-20, 20); bx = rng.int(-20, 20); by = rng.int(-20, 20);
    } while (ax === bx || ay === by || Math.abs(bx - ax) === Math.abs(by - ay));
    const dx = bx - ax, dy = by - ay;
    const a = wrap360(deg(Math.atan2(dy, dx)));
    if (round2(a) >= 360) return genAngles(d, rng);
    const dist = Math.hypot(dx, dy);
    const setup = `${YUP} ${ANG} A tower at T = ${vec(ax, ay)} tracks an enemy at E = ${vec(bx, by)}.`;
    const h1 = `The direction from T to E is \`E − T = ${vec(dx, dy)}\`.`;
    if (kind === "heading") {
      return single({
        prompt: `${setup} What heading must the tower aim at to point straight at the enemy?${END}`,
        exact: a,
        rounded: true,
        explanation: `First make the direction vector \`E − T = ${vec(dx, dy)}\`.\n\n` + atanExpl(dx, dy, a),
        hints: [
          h1,
          `Angle to the x axis: \`atan(${num(Math.abs(dy))} / ${num(Math.abs(dx))})\`. The vector is in the ${quadrant(dx, dy)} quarter, so ${quadRule(dx, dy)}${THEN}`,
        ],
        given: giv({ tx: ax, ty: ay, ex: bx, ey: by }),
        params: { kind: "angle", v: { x: dx, y: dy } },
        candidates: [wrap360(deg(Math.atan2(by, bx))), wrap360(a + 180), deg(Math.atan(Math.abs(dy) / Math.abs(dx)))],
        rng,
      });
    }
    return multi({
      prompt: `${setup} What heading points at the enemy, and how far away is it?${END}`,
      parts: [
        numPart("angle", "Heading", "Heading in degrees", a, true, `Angle to the x axis: \`atan(${num(Math.abs(dy))} / ${num(Math.abs(dx))})\`. The vector is in the ${quadrant(dx, dy)} quarter, so ${quadRule(dx, dy)}${THEN}`),
        numPart("dist", "Distance", "Distance from T to E", dist, true, `Distance = \`√(${par(dx)}² + ${par(dy)}²)\` (in the calculator: \`sqrt((_ex - _tx)^2 + (_ey - _ty)^2)\`).${THEN}`),
      ],
      explanation: `First make the direction vector \`E − T = ${vec(dx, dy)}\`.\n\n${atanExpl(dx, dy, a)}\n- distance \`= √(${par(dx)}² + ${par(dy)}²)\` ${res(dist, true)}`,
      hints: [h1],
      given: giv({ tx: ax, ty: ay, ex: bx, ey: by }),
      params: { kind: "heading", v: { dx, dy } },
      rounded: true,
    });
  }

  if (kind === "screen") {
    let sx, sy;
    do {
      sx = nz(rng, -15, 15);
      sy = nz(rng, -15, 15);
    } while (Math.abs(sx) === Math.abs(sy));
    const x = sx, y = -sy;
    const a = wrap360(deg(Math.atan2(y, x)));
    if (round2(a) >= 360) return genAngles(d, rng);
    const wrong = wrap360(deg(Math.atan2(sy, sx)));
    return single({
      prompt: `A sprite engine uses screen coordinates, where +x is right and **+y is down**. A sprite moves by ${vec(sx, sy)} in screen coordinates. Convert to y-up axes (+y up), then give its angle measured from +x counter-clockwise, from 0 up to (not including) 360 degrees.${END}`,
      exact: a,
      rounded: true,
      explanation: `Flip the sign of y to go from y-down to y-up: ${vec(sx, sy)} becomes ${vec(x, y)}.\n\n` + atanExpl(x, y, a),
      hints: [
        `Screen y grows downward, so a y-up vector has the opposite y: ${vec(sx, sy)} becomes ${vec(x, y)}.`,
        `Angle to the x axis: \`atan(${num(Math.abs(y))} / ${num(Math.abs(x))})\`. In y-up axes the vector is in the ${quadrant(x, y)} quarter, so ${quadRule(x, y)}${THEN}`,
      ],
      given: giv({ sx, sy }),
      params: { kind: "angle", v: { x, y } },
      candidates: [wrong, wrap360(a + 180), deg(Math.atan(Math.abs(y) / Math.abs(x)))],
      rng,
    });
  }

  // turn (hard): signed smallest turn from a facing angle to a target heading.
  const facing = rng.int(0, 71) * 5;
  let dx, dy, hdg, turn;
  do {
    dx = nz(rng, -15, 15);
    dy = nz(rng, -15, 15);
    hdg = wrap360(deg(Math.atan2(dy, dx)));
    turn = ((hdg - facing + 540) % 360) - 180;
  } while (Math.abs(Math.abs(turn) - 180) < 1 || Math.abs(turn) < 1 || round2(hdg) >= 360);
  return single({
    prompt: `${YUP} ${ANG} A ship faces ${facing}°. Its target is in the direction ${vec(dx, dy)}. What is the smallest turn that points it at the target? Give a counter-clockwise (left) turn as positive and a clockwise (right) turn as negative, between −180 and 180.${END}`,
    exact: turn,
    rounded: true,
    explanation:
      `Find the target heading, then the difference, wrapped into −180 to 180.\n\n` +
      `- Target heading: \`atan2(${num(dy)}, ${num(dx)})\` ≈ ${num(hdg)}° (between 0 and 360)\n` +
      `- \`${num(hdg)} − ${facing}\` = ${num(hdg - facing)}°` +
      (Math.abs(hdg - facing - turn) > 1e-9 ? `, which is more than half a turn, so ${hdg - facing > 0 ? "subtract" : "add"} 360°` : "") +
      `\n- turn ${res(turn, true, "°")}`,
    hints: [
      `First find the heading of ${vec(dx, dy)}: \`atan(${num(Math.abs(dy))} / ${num(Math.abs(dx))})\` gives the angle to the x axis; the vector is in the ${quadrant(dx, dy)} quarter, so ${quadRule(dx, dy)}`,
      `Subtract the facing: heading − ${facing}. If the result is above 180, subtract 360; if it is below −180, add 360.${THEN}`,
    ],
    given: giv({ dx, dy, facing }),
    params: { kind: "turn", v: { dx, dy, facing } },
    candidates: [hdg - facing, -turn, hdg],
    neg: true,
    rng,
  });
}

function quadrant(x, y) {
  if (x > 0 && y > 0) return "top-right";
  if (x < 0 && y > 0) return "top-left";
  if (x < 0 && y < 0) return "bottom-left";
  return "bottom-right";
}
function quadRule(x, y) {
  if (x > 0 && y > 0) return "the angle is that value as it is.";
  if (x < 0 && y > 0) return "the angle is 180° minus that value.";
  if (x < 0 && y < 0) return "the angle is 180° plus that value.";
  return "the angle is 360° minus that value.";
}

// ======================= Expert =======================
// Multi-step problems that combine two or more ideas (easy/medium/hard above are untouched).
// Every template draws all of its rng values first; hints and explanations only use values
// already drawn (no rng calls). Every params.kind starts with "x-" and has its own CHECK below.

// Turn | Rotation blocks for the turret question; LR[i] is a joined option (stored form). The third
// values are decoys only (the turret always turns 10° to 170°).
const LR_TURN = ["Left", "Right", "No turn"];
const LR_ROT = ["Counter-clockwise", "Clockwise", "Neither"];
const LR = [`${LR_TURN[0]} | ${LR_ROT[0]}`, `${LR_TURN[1]} | ${LR_ROT[1]}`];
const YN = ["Yes", "No"];
const dot2 = (ax, ay, bx, by) => ax * bx + ay * by;
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);
// "3t² − 5t + 2" style signed terms for explanations.
const sgn = (n) => (n < 0 ? `− ${num(-n)}` : `+ ${num(n)}`);

// vectors / expert 0: mirror bounce off a sloped wall (dot product + scaling).
function xReflect(rng) {
  const NORMALS = [[1, 1], [1, 2], [2, 1], [-1, 2], [2, -1], [1, 3], [3, 1], [-1, 1], [1, -2], [3, -4], [4, 3], [-2, 3]];
  const who = rng.pick(["ball", "bullet", "puck", "laser bolt", "bouncing slime"]);
  let vx, vy, nx, ny;
  do {
    [nx, ny] = rng.pick(NORMALS);
    vx = nz(rng, -12, 12);
    vy = nz(rng, -12, 12);
  } while (dot2(vx, vy, nx, ny) === 0);
  if (dot2(vx, vy, nx, ny) > 0) { nx = -nx; ny = -ny; } // the normal points back out of the wall
  const dn = dot2(vx, vy, nx, ny), nn = nx * nx + ny * ny;
  const k = (2 * dn) / nn;
  const rx = vx - k * nx, ry = vy - k * ny;
  const calc = (c) => `_v${c} - 2 * (_vx*_nx + _vy*_ny) / (_nx^2 + _ny^2) * _n${c}`;
  return multi({
    prompt: `${YUP} A ${who} moving with velocity v = ${vec(vx, vy)} hits a straight, sloped wall and bounces off like a mirror, losing no speed. The wall's normal (a vector at right angles to the wall, pointing out of it towards the ${who}) is n = ${vec(nx, ny)}; it is not length 1. In a mirror bounce the part of v along n flips and the part along the wall stays. What is the velocity after the bounce?${END}`,
    parts: [
      numPart("x", "x component", "x of the new velocity", rx, true, `x: \`${calc("x")}\`.${THEN}`),
      numPart("y", "y component", "y of the new velocity", ry, true, `y: \`${calc("y")}\`.${THEN}`),
    ],
    explanation:
      `Remove the part of v along n twice (once to cancel it, once to flip it): \`r = v − 2 × (v·n / n·n) × n\`.\n\n` +
      `- \`v · n = ${par(vx)} × ${par(nx)} + ${par(vy)} × ${par(ny)} = ${dn}\`\n` +
      `- \`n · n = ${par(nx)}² + ${par(ny)}² = ${nn}\`\n` +
      `- \`2 × ${par(dn)} / ${nn}\` ≈ ${num(k)}\n` +
      `- x: \`${num(vx)} − ${par(k)} × ${par(nx)}\` ${res(rx, true)}\n` +
      `- y: \`${num(vy)} − ${par(k)} × ${par(ny)}\` ${res(ry, true)}\n\n` +
      `Check: the speed is unchanged, |r| = |v| ≈ ${num(Math.hypot(vx, vy))}.`,
    hints: [
      "A mirror bounce keeps the part of v along the wall and flips the part along the normal: `r = v − 2 × (v·n / n·n) × n`. n need not be length 1, because you divide by n·n.",
      `Here \`v · n = ${dn}\` and \`n · n = ${nn}\`. Work out 2 × (v·n) / (n·n), then subtract that many n's from v, component by component.`,
    ],
    given: giv({ vx, vy, nx, ny }),
    params: { kind: "x-reflect", v: { vx, vy, nx, ny } },
    rounded: true,
  });
}

// vectors / expert 1: closest point on a patrol segment (projection, then clamp at the ends).
function xClosest(rng) {
  let ax, ay, bx, by, px, py, abx, aby, apx, apy, ab2, tRaw;
  do {
    ax = rng.int(-15, 15); ay = rng.int(-15, 15);
    bx = rng.int(-15, 15); by = rng.int(-15, 15);
    px = rng.int(Math.min(ax, bx) - 6, Math.max(ax, bx) + 6);
    py = rng.int(Math.min(ay, by) - 6, Math.max(ay, by) + 6);
    abx = bx - ax; aby = by - ay; apx = px - ax; apy = py - ay;
    ab2 = abx * abx + aby * aby;
    tRaw = ab2 ? dot2(apx, apy, abx, aby) / ab2 : 0;
  } while (ab2 < 36 || abx * apy - aby * apx === 0 || Math.abs(tRaw) < 0.03 || Math.abs(tRaw - 1) < 0.03);
  const t = Math.min(1, Math.max(0, tRaw));
  const cx = ax + t * abx, cy = ay + t * aby;
  const dist = Math.hypot(px - cx, py - cy);
  const apab = dot2(apx, apy, abx, aby);
  const clampLine =
    tRaw < 0 ? `That is below 0, so the closest point is past the end A: clamp to **t = 0** (C = A).`
      : tRaw > 1 ? `That is above 1, so the closest point is past the end B: clamp to **t = 1** (C = B).`
        : `That is between 0 and 1, so the closest point is inside the path: t ${res(t, true)}.`;
  return multi({
    prompt: `${YUP} A guard patrols the straight path from A = ${vec(ax, ay)} to B = ${vec(bx, by)}; points on it are A + t·(B − A) with t from 0 (at A) to 1 (at B). The player stands at P = ${vec(px, py)}. Which t gives the point C on the path closest to the player, and how far is the player from the path?${END}`,
    parts: [
      numPart("t", "t", "t of the closest point (0 to 1)", t, true, "Project AP onto AB, then clamp the result into 0 to 1."),
      numPart("dist", "Distance", "Distance from P to the path", dist, true, `Find C = A + t·(B − A) with the clamped t, then the length of P − C.${THEN}`),
    ],
    explanation:
      `Project P onto the line through A and B, then keep the result on the segment.\n\n` +
      `- \`AB = B − A = ${vec(abx, aby)}\`, \`AP = P − A = ${vec(apx, apy)}\`\n` +
      `- \`t = (AP · AB) / (AB · AB) = ${apab} / ${ab2}\` ≈ ${num(tRaw)}\n` +
      `- ${clampLine}\n` +
      `- \`C = A + t·AB\` = ${vec(cx, cy)}\n` +
      `- distance \`= √((${num(px)} − ${par(cx)})² + (${num(py)} − ${par(cy)})²)\` ${res(dist, true)}`,
    hints: [
      "The closest point on the whole line is the projection: `t = (AP · AB) / (AB · AB)`, with AB = B − A and AP = P − A.",
      `Here AB = ${vec(abx, aby)} and AP = ${vec(apx, apy)}. The path stops at A and B, so if t comes out below 0 or above 1, clamp it to the nearer end.`,
      "Then C = A + t·AB, and the distance is the length of P − C (Pythagoras).",
    ],
    given: giv({ ax, ay, bx, by, px, py }),
    params: { kind: "x-closest", v: { ax, ay, bx, by, px, py } },
    rounded: true,
  });
}

// vectors / expert 2: working backwards, choose k so a + k·b is perpendicular to c.
function xPerp(rng) {
  let ax, ay, bx, by, cx, cy, ac, bc, k, wx, wy;
  do {
    ax = rng.int(-10, 10); ay = rng.int(-10, 10);
    bx = nz(rng, -8, 8); by = rng.int(-8, 8);
    cx = nz(rng, -8, 8); cy = nz(rng, -8, 8);
    ac = dot2(ax, ay, cx, cy);
    bc = dot2(bx, by, cx, cy);
    k = bc ? -ac / bc : 0;
    wx = ax + k * bx; wy = ay + k * by;
  } while (Math.abs(bc) < 3 || ac === 0 || Math.abs(k) > 12 || Math.hypot(wx, wy) < 0.5);
  const len = Math.hypot(wx, wy);
  return multi({
    prompt: `${YUP} A drone flies with velocity a = ${vec(ax, ay)}. Its side thruster can add any multiple k of the thrust vector b = ${vec(bx, by)} (k may be negative). A security beam runs along the direction c = ${vec(cx, cy)}. For which k is the new velocity a + k·b at right angles to the beam? Then, using the unrounded k, what is the drone's new speed |a + k·b|?${END}`,
    parts: [
      numPart("k", "k", "The value of k", k, true, "At right angles means the dot product with c is 0. Expand (a + k·b)·c and solve for k."),
      numPart("speed", "Speed", "New speed |a + k·b|", len, true, `Build a + k·b component by component with the unrounded k, then take its length.${THEN}`),
    ],
    explanation:
      `Perpendicular vectors have a dot product of 0, and the dot product splits over addition: \`(a + k·b)·c = a·c + k(b·c)\`.\n\n` +
      `- \`a · c = ${par(ax)} × ${par(cx)} + ${par(ay)} × ${par(cy)} = ${ac}\`\n` +
      `- \`b · c = ${par(bx)} × ${par(cx)} + ${par(by)} × ${par(cy)} = ${bc}\`\n` +
      `- \`${ac} + k × ${par(bc)} = 0\`, so \`k = −(${ac}) / ${par(bc)}\` ${res(k, true)}\n` +
      `- \`a + k·b\` ≈ ${vec(wx, wy)}\n` +
      `- speed \`= √(${par(wx)}² + ${par(wy)}²)\` ${res(len, true)}`,
    hints: [
      "Two vectors are at right angles when their dot product is 0. So you need `(a + k·b) · c = 0`.",
      "The dot product splits over addition: `(a + k·b)·c = a·c + k × (b·c)`. Work out a·c and b·c as plain numbers.",
      "Solve the linear equation for k (in the calculator: `-(_ax*_cx + _ay*_cy) / (_bx*_cx + _by*_cy)`), then find a + k·b and its length.",
    ],
    given: giv({ ax, ay, bx, by, cx, cy }),
    params: { kind: "x-perp", v: { ax, ay, bx, by, cx, cy } },
    rounded: true,
  });
}

// movement / expert 0: intercept a moving target (vectors + a quadratic in time).
function xIntercept(rng) {
  let tx, ty, ex, ey, ux, uy, s, dx, dy;
  do {
    tx = rng.int(-10, 10); ty = rng.int(-10, 10);
    ex = rng.int(-20, 20); ey = rng.int(-20, 20);
    ux = rng.int(-6, 6); uy = rng.int(-6, 6);
    s = rng.int(8, 20);
    dx = ex - tx; dy = ey - ty;
  } while (Math.hypot(dx, dy) < 8 || (ux === 0 && uy === 0) || s <= Math.hypot(ux, uy) + 1);
  const A = ux * ux + uy * uy - s * s, B = 2 * dot2(dx, dy, ux, uy), C = dx * dx + dy * dy;
  const disc = B * B - 4 * A * C;
  const t = (-B - Math.sqrt(disc)) / (2 * A); // A < 0 and C > 0: this is the one positive root
  const hx = ex + ux * t, hy = ey + uy * t;
  return multi({
    prompt: `${YUP} A turret at T = ${vec(tx, ty)} fires bullets that fly in a straight line at ${s} units per second. An enemy at E = ${vec(ex, ey)} moves with constant velocity u = ${vec(ux, uy)} units per second. The turret fires now, aiming where the enemy will be. After how many seconds does the bullet hit, and where?${END}`,
    parts: [
      numPart("t", "Time", "Seconds until the hit", t, true, "Only one root of the quadratic in t is positive: that is the time."),
      numPart("x", "Hit x", "x of the hit point", hx, true, `x = E's x + u's x × t (use the unrounded t).${THEN}`),
      numPart("y", "Hit y", "y of the hit point", hy, true, `y = E's y + u's y × t (use the unrounded t).${THEN}`),
    ],
    explanation:
      `After t seconds the enemy is at E + u·t and the bullet has flown s·t, so a hit needs \`|d + u·t| = s·t\` with d = E − T.\n\n` +
      `- \`d = E − T = ${vec(dx, dy)}\`\n` +
      `- Square both sides: \`(u·u − s²)t² + 2(d·u)t + d·d = 0\`, here \`${A}t² ${sgn(B)}t ${sgn(C)} = 0\`\n` +
      `- \`t = (−B − √(B² − 4AC)) / (2A)\`; A is negative, so this is the positive root: t ${res(t, true)} s\n` +
      `- hit x: \`${num(ex)} + ${par(ux)} × t\` ${res(hx, true)}\n` +
      `- hit y: \`${num(ey)} + ${par(uy)} × t\` ${res(hy, true)}`,
    hints: [
      "After t seconds the enemy is at E + u·t, and the bullet has flown s·t units. It hits when the distance from T to the enemy equals s·t.",
      `With d = E − T = ${vec(dx, dy)}, square both sides: \`|d + u·t|² = (s·t)²\` expands to \`(u·u − s²)t² + 2(d·u)t + d·d = 0\`.`,
      `Here \`u·u − s² = ${A}\`, \`2(d·u) = ${B}\` and \`d·d = ${C}\`. Use the quadratic formula (calculator rows _A, _B, _C help), keep the positive root, then put t into E + u·t.`,
    ],
    given: giv({ tx, ty, ex, ey, ux, uy, s }),
    params: { kind: "x-intercept", v: { tx, ty, ex, ey, ux, uy, s } },
    rounded: true,
  });
}

// movement / expert 1: accelerate to a top speed, then cruise (two phases, one worked backwards).
function xDash(rng) {
  const who = rng.pick(WHO);
  const a = rng.int(4, 20);
  const vmax = rng.int(6, 30);
  const t1 = vmax / a;
  const d1 = (vmax * vmax) / (2 * a);
  const T = Math.ceil(t1 * 2) / 2 + rng.int(1, 8) / 2;
  const D = Math.ceil(d1) + rng.int(3, 60);
  const distT = d1 + vmax * (T - t1);
  const tD = t1 + (D - d1) / vmax;
  return multi({
    prompt: `${cap1(who)} dashes in a straight line. It starts at rest, speeds up at ${a} units/s² until it reaches its top speed of ${vmax} units per second, then keeps that speed. How long does it take to reach top speed, how far has it gone after ${num(T)} seconds, and how long does it take to cover ${D} units?${END}`,
    parts: [
      numPart("t1", "Time to top speed", "Seconds to reach top speed", t1, true, `Speed = acceleration × time, so time = top speed ÷ acceleration.${THEN}`),
      numPart("dist", `After ${num(T)} s`, `Distance after ${num(T)} seconds`, distT, true, `Speed-up distance, plus top speed × the time left after reaching top speed.${THEN}`),
      numPart("time", `${D} units`, `Seconds to cover ${D} units`, tD, true, `Subtract the speed-up distance from ${D}, divide what is left by the top speed, and add the speed-up time.${THEN}`),
    ],
    explanation:
      `Split the dash into a speed-up phase and a constant-speed phase.\n\n` +
      `- Time to top speed: \`t1 = ${vmax} / ${a}\` ${res(t1, true, "s")}\n` +
      `- Distance while speeding up (the triangle under the speed–time graph): \`${vmax}² / (2 × ${a})\` ≈ ${num(d1)}\n` +
      `- After ${num(T)} s: \`${num(d1)} + ${vmax} × (${num(T)} − ${num(t1)})\` ${res(distT, true)}\n` +
      `- ${D} is more than ${num(d1)}, so it is reached while cruising: \`${num(t1)} + (${D} − ${num(d1)}) / ${vmax}\` ${res(tD, true, "s")}`,
    hints: [
      "Split the motion into two phases: speeding up (speed = acceleration × time) until top speed, then constant speed.",
      "The distance covered while speeding up is the area of the triangle under the speed–time graph: ½ × time × top speed, which is `_vmax^2 / (2 * _a)`.",
      `After that the distance grows by ${vmax} units every second. Compare ${D} with the speed-up distance first to see which phase it ends in.`,
    ],
    given: giv({ a, vmax, T, D }),
    params: { kind: "x-dash", v: { a, vmax, T, D } },
    rounded: true,
  });
}

// movement / expert 2: semi-implicit Euler jump, peak and landing step (edge: "0 or below").
function xLand(rng) {
  let dt, a, v0, p0, ys, vs;
  do {
    dt = rng.pick([0.05, 0.1, 0.2, 0.25]);
    a = -rng.pick([9.8, 10, 15, 20, 30]);
    v0 = rng.int(4, 20);
    p0 = rng.int(0, 10);
    let v = v0, p = p0;
    ys = [p0]; vs = [v0];
    while ((p > 0 || ys.length === 1) && ys.length < 200) {
      v = v + a * dt;
      p = p + v * dt;
      ys.push(p); vs.push(v);
    }
  } while (ys.length > 120 || ys.slice(1).some((y) => Math.abs(y) < 1e-6));
  const L = ys.length - 1;
  let peakStep = 0;
  ys.forEach((y, i) => { if (y > ys[peakStep]) peakStep = i; });
  const peak = ys[peakStep];
  const thing = rng.pick(["frog", "knight", "robot", "ball", "rabbit"]);
  const show = [...new Set([0, peakStep - 1, peakStep, peakStep + 1, L - 1, L].filter((i) => i >= 0 && i <= L))].sort((x, y) => x - y);
  const rows = [];
  show.forEach((i, j) => {
    if (j > 0 && i - show[j - 1] > 1) rows.push("| … | … | … |");
    rows.push(`| ${i} | ${num(vs[i])} | ${num(ys[i])} |`);
  });
  return multi({
    prompt: `${YUP} A jumping ${thing} starts at height y = ${p0} with upward velocity ${v0}, and gravity gives acceleration ${a} (units/s²). The game updates every dt = ${num(dt)} s, and each step does first v = v + a·dt, then y = y + v·dt (using the new v). What is the highest y it reaches (counting the start and the end of every step), and on which step does y first reach 0 or below, so it lands?${END} Give the landing step as a whole number.`,
    parts: [
      numPart("peak", "Peak height", "Highest y", peak, true, `v drops by ${num(-a * dt)} each step. y rises while the new v is positive, so the peak is at the last step where v is still above 0.${THEN}`),
      numPart("land", "Landing step", "Step where y first reaches 0 or below", L, false, "Use y after n steps = y0 + n·v0·dt + a·dt²·n(n + 1)/2 and try whole numbers until it is 0 or below."),
    ],
    explanation:
      `After n steps \`v = ${v0} ${sgn(a * dt)} × n\` and, adding up the steps, \`y = ${p0} + n × ${num(v0 * dt)} ${sgn(a * dt * dt / 2)} × n(n + 1)\`.\n\n` +
      `| Step | v | y |\n| --- | --- | --- |\n${rows.join("\n")}\n\n` +
      `- Highest point: step ${peakStep}, y ${res(peak, true)}\n` +
      `- Landing: y first reaches 0 or below on step **${L}**.\n\n` +
      `(The smooth physics formula v0²/(2g) gives a slightly different peak: a game's step-by-step update is not exact.)`,
    hints: [
      `Each step changes v by a·dt = ${num(a * dt)}. y keeps rising while the new v is positive.`,
      `Adding up the steps: after n steps \`v = v0 + n·a·dt\` and \`y = y0 + n·v0·dt + a·dt²·n(n + 1)/2\` (in the calculator: \`_y0 + _n*_v0*_dt + _a*_dt^2*_n*(_n+1)/2\` with a row _n).`,
      "The peak is at the last step with v above 0. For the landing, find the first whole n where y is 0 or below: try values near where it changes sign.",
    ],
    given: giv({ y0: p0, v0, a, dt }),
    params: { kind: "x-land", v: { p0, v0, a, dt } },
    rounded: true,
  });
}

// interpolation / expert 0: frame-rate independent smoothing (powers, then working backwards).
function xFpsDamp(rng) {
  const F1 = rng.pick([30, 60]);
  const F2 = rng.pick([50, 75, 90, 120, 144, 165, 240]);
  let f, G;
  do {
    f = rng.int(2, 20);
    G = rng.int(20, 500);
  } while (G * (1 - f / 100) ** F1 < 0.5);
  const r1 = 1 - f / 100;
  const keep = r1 ** F1;
  const r2 = r1 ** (F1 / F2);
  const pct2 = (1 - r2) * 100;
  const gap = G * keep;
  return multi({
    prompt: `A smooth-follow camera was tuned for a game running at ${F1} fps: every frame it closes ${f}% of the remaining gap to its target (x = x + (target − x) × ${num(f / 100)}). The game now runs at ${F2} fps, so the fraction per frame must change to keep the same feel: after each whole second the gap must shrink by the same factor as before. What percentage of the gap should it close each frame at ${F2} fps (without the % sign)? And if the gap starts at ${G} units and the target stays still, how big is the gap after 1 second?${END}`,
    parts: [
      numPart("pct", `% per frame at ${F2} fps`, `Percentage closed per frame at ${F2} fps`, pct2, true, `Find r with r^${F2} = ${num(r1)}^${F1}; the percentage closed is (1 − r) × 100.${THEN}`),
      numPart("gap", "Gap after 1 s", "Gap after 1 second", gap, true, `Start gap × the one-second factor, which is the same at both frame rates.${THEN}`),
    ],
    explanation:
      `Each frame keeps a fixed fraction of the gap, so over a second the fractions multiply.\n\n` +
      `- At ${F1} fps one second keeps \`${num(r1)}^${F1}\` ≈ ${keep.toPrecision(6)} of the gap\n` +
      `- At ${F2} fps you need a per-frame factor r with \`r^${F2}\` equal to that, so \`r = ${num(r1)}^(${F1}/${F2})\` ≈ ${r2.toFixed(6)}\n` +
      `- Closed per frame: \`(1 − r) × 100\` ${res(pct2, true, "%")}\n` +
      `- Gap after 1 s: \`${G} × ${num(r1)}^${F1}\` ${res(gap, true)}`,
    hints: [
      `Per frame the gap keeps ${100 - f}% of itself, so after one second at ${F1} fps it keeps \`${num(r1)}^${F1}\` of itself.`,
      `At ${F2} fps a second has ${F2} frames. You need a per-frame factor r with \`r^${F2} = ${num(r1)}^${F1}\`, so \`r = ${num(r1)}^(${F1}/${F2})\` (in the calculator: \`(1 - _f/100)^(_fps1/_fps2)\`).`,
      "The fraction closed per frame is 1 − r (times 100 for a percentage). The gap after a second is the start gap times the one-second factor.",
    ],
    given: giv({ f, fps1: F1, fps2: F2, gap: G }),
    params: { kind: "x-fpsdamp", v: { f, F1, F2, G } },
    rounded: true,
  });
}

// interpolation / expert 1: quadratic Bézier by repeated lerp, plus its heading (lerp + angles).
function xBezier(rng) {
  let x0, y0, x1, y1, x2, y2, t, q0x, q0y, q1x, q1y, tx, ty, h;
  do {
    x0 = rng.int(-20, 20); y0 = rng.int(-20, 20);
    x1 = rng.int(-20, 20); y1 = rng.int(-20, 20);
    x2 = rng.int(-20, 20); y2 = rng.int(-20, 20);
    t = rng.int(5, 95) / 100;
    q0x = x0 + (x1 - x0) * t; q0y = y0 + (y1 - y0) * t;
    q1x = x1 + (x2 - x1) * t; q1y = y1 + (y2 - y1) * t;
    tx = q1x - q0x; ty = q1y - q0y;
    h = wrap360(deg(Math.atan2(ty, tx)));
  } while (Math.abs(tx) < 0.01 || Math.abs(ty) < 0.01 || h < 0.01 || h > 359.99);
  const bx = q0x + (q1x - q0x) * t, by = q0y + (q1y - q0y) * t;
  const base = deg(Math.atan(Math.abs(ty) / Math.abs(tx)));
  return multi({
    prompt: `${YUP} ${ANG} A homing missile follows a quadratic Bézier curve with control points P0 = ${vec(x0, y0)}, P1 = ${vec(x1, y1)} and P2 = ${vec(x2, y2)}. Its position at parameter t comes from lerping twice: Q0 = lerp(P0, P1, t) and Q1 = lerp(P1, P2, t), then B = lerp(Q0, Q1, t). At that moment it flies in the direction from Q0 to Q1. At t = ${num(t)}, where is the missile, and what heading is it flying at?${END}`,
    parts: [
      numPart("x", "x", "x of the missile", bx, true, `Lerp the x values: Q0's x, Q1's x, then between those.${THEN}`),
      numPart("y", "y", "y of the missile", by, true, `Same for y, with the same t.${THEN}`),
      numPart("heading", "Heading", "Heading in degrees", h, true, `Angle of Q1 − Q0: atan(|dy| / |dx|), then fix it for the quarter the vector is in.${THEN}`),
    ],
    explanation:
      `De Casteljau's method: three lerps with the same t.\n\n` +
      `- \`Q0 = lerp(P0, P1, ${num(t)})\` = ${vec(q0x, q0y)}\n` +
      `- \`Q1 = lerp(P1, P2, ${num(t)})\` = ${vec(q1x, q1y)}\n` +
      `- x: \`${num(q0x)} + (${num(q1x)} − ${par(q0x)}) × ${num(t)}\` ${res(bx, true)}\n` +
      `- y: \`${num(q0y)} + (${num(q1y)} − ${par(q0y)}) × ${num(t)}\` ${res(by, true)}\n` +
      `- direction \`Q1 − Q0\` = ${vec(tx, ty)}; \`atan(${num(Math.abs(ty))} / ${num(Math.abs(tx))})\` ≈ ${num(base)}°, and it is in the ${quadrant(tx, ty)} quarter, so ${quadRule(tx, ty)}\n` +
      `- heading ${res(h, true, "°")}`,
    hints: [
      "Lerp twice: P0→P1 and P1→P2 with the same t give Q0 and Q1. Then lerp from Q0 to Q1 with that t again.",
      `Q0's x is \`${num(x0)} + (${num(x1)} − ${par(x0)}) × ${num(t)}\` (in the calculator: \`_x0 + (_x1 - _x0) * _t\`). Do the same for y and for Q1.`,
      "The heading is the angle of the vector Q1 − Q0: find atan(|dy| / |dx|), then adjust it for the quarter the vector points into.",
    ],
    given: giv({ x0, y0, x1, y1, x2, y2, t }),
    params: { kind: "x-bezier", v: { x0, y0, x1, y1, x2, y2, t } },
    rounded: true,
  });
}

// interpolation / expert 2: clamp + smoothstep + lerp (edge case: time outside the animation).
function xEase(rng) {
  const thing = rng.pick(["A pause menu slides", "A door slides", "A camera pans", "A platform glides", "A health bar's end moves"]);
  const start = rng.int(0, 10) * 100;
  const dur = rng.pick([400, 500, 600, 800, 1000, 1200, 1500]);
  const mode = rng.next();
  let time;
  if (mode < 0.1 && start >= 100) time = start - rng.int(10, 90);
  else if (mode < 0.2) time = start + dur + rng.int(10, 300);
  else time = start + Math.round((dur * rng.int(5, 95)) / 100);
  const a = rng.int(-100, 100);
  let b;
  do b = rng.int(-100, 200);
  while (Math.abs(b - a) < 20);
  const tRaw = (time - start) / dur;
  const t = Math.min(1, Math.max(0, tRaw));
  const s = t * t * (3 - 2 * t);
  const x = a + (b - a) * s;
  const clampLine =
    tRaw < 0 ? "That is below 0 (the animation hasn't started), so clamp to **t = 0**."
      : tRaw > 1 ? "That is above 1 (the animation has finished), so clamp to **t = 1**."
        : "That is between 0 and 1, so no clamping is needed.";
  return multi({
    prompt: `${thing} from x = ${a} to x = ${b}. The animation starts at ${start} ms and lasts ${dur} ms. Each frame the game computes t = clamp((time − start) / duration, 0, 1), eases it with smoothstep s = t² × (3 − 2t), then sets x = lerp(${a}, ${b}, s). At time = ${time} ms, what are s and x?${END} For x, use the unrounded s.`,
    parts: [
      numPart("s", "Eased s", "The eased value s", s, true, `First t = (${time} − ${start}) / ${dur}, clamped into 0 to 1; then s = t² × (3 − 2t).${THEN}`),
      numPart("x", "x", "x at that time", x, true, `x = a + (b − a) × s (in the calculator: \`_a + (_b - _a) * _s\` with a row _s).${THEN}`),
    ],
    explanation:
      `Three steps: progress, ease, lerp.\n\n` +
      `- \`t = (${time} − ${start}) / ${dur}\` ≈ ${num(tRaw)}. ${clampLine}\n` +
      `- \`s = ${num(t)}² × (3 − 2 × ${num(t)})\` ${res(s, true)}\n` +
      `- \`x = ${a} + (${b} − ${par(a)}) × s\` ${res(x, true)}`,
    hints: [
      "Work in three steps: how far through the animation you are (t), the eased value (s), then the lerp.",
      `\`t = (${time} − ${start}) / ${dur}\`. Clamp means: if t is below 0 use 0, and if it is above 1 use 1.`,
      "Then `s = t² × (3 − 2t)` and `x = a + (b − a) × s`.",
    ],
    given: giv({ a, b, start, dur, time }),
    params: { kind: "x-ease", v: { a, b, start, dur, time } },
    rounded: true,
  });
}

// angles / expert 0: rotate by any angle (rotation formulas + the new heading).
function xRotate(rng) {
  let x, y, th, ccw, phi, rx, ry, h;
  do {
    x = nz(rng, -12, 12);
    y = nz(rng, -12, 12);
    th = rng.int(1, 71) * 5;
    ccw = rng.next() < 0.5;
    phi = ccw ? th : -th;
    rx = x * Math.cos(rad(phi)) - y * Math.sin(rad(phi));
    ry = x * Math.sin(rad(phi)) + y * Math.cos(rad(phi));
    h = wrap360(deg(Math.atan2(ry, rx)));
  } while (th % 90 === 0 || h < 0.01 || h > 359.99);
  const h0 = wrap360(deg(Math.atan2(y, x)));
  const what = rng.pick(["A turret's aim vector", "A spaceship's velocity", "A sword swing's direction", "A camera's forward vector"]);
  return multi({
    prompt: `${YUP} ${ANG} ${what} is ${vec(x, y)}. It rotates by ${th}° ${ccw ? "counter-clockwise (left)" : "clockwise (right)"}. What is the new vector, and what angle does it point at?${END}`,
    parts: [
      numPart("x", "x component", "x after rotating", rx, true, `x' = x·cos φ − y·sin φ with φ = ${phi}° (in the calculator: \`_x * cos(_phi) - _y * sin(_phi)\`).${THEN}`),
      numPart("y", "y component", "y after rotating", ry, true, `y' = x·sin φ + y·cos φ (in the calculator: \`_x * sin(_phi) + _y * cos(_phi)\`).${THEN}`),
      numPart("angle", "Angle", "Angle of the new vector", h, true, `The old angle plus φ, wrapped into 0 to 360.${THEN}`),
    ],
    explanation:
      `Rotate counter-clockwise by φ with \`x' = x·cos φ − y·sin φ\`, \`y' = x·sin φ + y·cos φ\`. A clockwise turn uses a negative φ, so φ = ${phi}°.\n\n` +
      `- \`cos(${phi}°)\` ≈ ${num(Math.cos(rad(phi)))}, \`sin(${phi}°)\` ≈ ${num(Math.sin(rad(phi)))}\n` +
      `- x': \`${par(x)} × cos φ − ${par(y)} × sin φ\` ${res(rx, true)}\n` +
      `- y': \`${par(x)} × sin φ + ${par(y)} × cos φ\` ${res(ry, true)}\n` +
      `- The old vector points at about ${num(h0)}°; add ${phi}° and wrap into 0 to 360: angle ${res(h, true, "°")}`,
    hints: [
      "Rotating counter-clockwise by an angle φ: `x' = x·cos φ − y·sin φ` and `y' = x·sin φ + y·cos φ`. A clockwise turn is a negative φ.",
      `Here φ = ${phi}°. The calculator's cos and sin work in degrees.`,
      "For the angle, either use atan on the new vector (fixing the quarter), or find the old vector's angle and add φ, wrapping into 0 to 360.",
    ],
    given: giv({ x, y, phi }),
    params: { kind: "x-rotate", v: { x, y, phi } },
    rounded: true,
  });
}

// angles / expert 1: turn towards a target at a limited turn rate (shortest way, wrap-around).
function xTurnRate(rng) {
  let facing, dx, dy, rate, hdg, turn, time, t1;
  do {
    facing = rng.int(0, 71) * 5;
    dx = nz(rng, -15, 15);
    dy = nz(rng, -15, 15);
    rate = rng.pick([30, 45, 60, 90, 120, 180]);
    t1 = rng.int(1, 16) / 4;
    hdg = wrap360(deg(Math.atan2(dy, dx)));
    turn = ((hdg - facing + 540) % 360) - 180;
    time = Math.abs(turn) / rate;
  } while (Math.abs(turn) < 10 || Math.abs(turn) > 170 || t1 >= time - 0.05);
  const left = turn > 0;
  const h1 = wrap360(facing + (left ? 1 : -1) * rate * t1);
  return multi({
    prompt: `${YUP} ${ANG} A tank turret faces ${facing}°. Its target is in the direction ${vec(dx, dy)}. The turret turns at ${rate}° per second and always takes the shorter way round. Which way does it turn, how long does it take to face the target, and what heading does it face ${num(t1)} s after it starts turning?${END}`,
    parts: [
      { ...choicePart("dir", "Direction", "Which way does it turn?", segsOf(left ? LR[0] : LR[1]), oneOffChoices(segsOf(left ? LR[0] : LR[1]), LR_TURN, LR_ROT), "Wrap (target heading − facing) into −180 to 180: positive is a left turn, negative a right turn."), choiceCols: ["Turn", "Rotation"] },
      numPart("time", "Time", "Seconds to face the target", time, true, `Size of the turn (ignore its sign) ÷ ${rate}.${THEN}`),
      numPart("heading", `After ${num(t1)} s`, `Heading after ${num(t1)} s`, h1, true, `It has turned ${rate} × ${num(t1)} degrees from ${facing}° in its turning direction; wrap into 0 to 360.`),
    ],
    explanation:
      `Find the target heading, the signed turn, then the time.\n\n` +
      `- Target heading: \`atan2(${dy}, ${dx})\` ≈ ${num(hdg)}°\n` +
      `- \`${num(hdg)} − ${facing}\` = ${num(hdg - facing)}°` +
      (Math.abs(hdg - facing - turn) > 1e-9 ? `, more than half a turn, so ${hdg - facing > 0 ? "subtract" : "add"} 360°` : "") +
      `: turn ≈ ${num(turn)}°, so it turns **${left ? "left (counter-clockwise)" : "right (clockwise)"}**\n` +
      `- Time: \`${num(Math.abs(turn))} / ${rate}\` ${res(time, true, "s")}\n` +
      `- After ${num(t1)} s: \`${facing} ${left ? "+" : "−"} ${rate} × ${num(t1)}\` = ${num(facing + (left ? 1 : -1) * rate * t1)}°, wrapped into 0 to 360 ${res(h1, true, "°")}`,
    hints: [
      `First find the target's heading: \`atan(${Math.abs(dy)} / ${Math.abs(dx)})\` is the angle to the x axis, and the vector is in the ${quadrant(dx, dy)} quarter, so ${quadRule(dx, dy)}`,
      `Subtract the facing (${facing}°) and wrap the difference into −180 to 180. Positive means turning left (counter-clockwise), negative means right.`,
      `Time = size of the turn ÷ ${rate}. For the heading after ${num(t1)} s, move ${rate} × ${num(t1)} degrees from ${facing}° in the turning direction, and wrap below 0 or at 360 and above.`,
    ],
    given: giv({ dx, dy, facing, rate, t1 }),
    params: { kind: "x-turnrate", v: { dx, dy, facing, rate, t1 } },
    rounded: true,
  });
}

// angles / expert 2: field-of-view cone check (angle between directions + range + a decision).
function xFov(rng) {
  let gx, gy, facing, W, R, px, py, ddx, ddy, hp, ang, dist;
  do {
    gx = rng.int(-10, 10); gy = rng.int(-10, 10);
    facing = rng.int(0, 71) * 5;
    W = rng.pick([60, 90, 100, 120, 140]);
    R = rng.int(6, 15);
    if (rng.next() < 0.6) {
      const off = rng.int(-(W / 2 + 25), W / 2 + 25);
      const r = rng.int(3, R + 4);
      px = gx + Math.round(r * Math.cos(rad(facing + off)));
      py = gy + Math.round(r * Math.sin(rad(facing + off)));
    } else {
      px = gx + rng.int(-15, 15);
      py = gy + rng.int(-15, 15);
    }
    px = fix0(px); py = fix0(py);
    ddx = px - gx; ddy = py - gy;
    hp = wrap360(deg(Math.atan2(ddy, ddx)));
    ang = Math.abs(((hp - facing + 540) % 360) - 180);
    dist = Math.hypot(ddx, ddy);
  } while ((ddx === 0 && ddy === 0) || Math.abs(ang - W / 2) < 1 || Math.abs(dist - R) < 0.2);
  const inCone = ang <= W / 2, inRange = dist <= R;
  const seen = inCone && inRange ? YN[0] : YN[1];
  return multi({
    prompt: `${YUP} ${ANG} A guard at G = ${vec(gx, gy)} faces ${facing}°. It sees anything inside a cone ${W}° wide (up to ${W / 2}° either side of its facing) and at most ${R} units away. The player is at P = ${vec(px, py)}. What is the angle between the guard's facing and the direction to the player (0 to 180), how far away is the player, and can the guard see them?${END}`,
    parts: [
      numPart("angle", "Angle", "Angle from the facing (0 to 180)", ang, true, "Heading of P − G minus the facing, wrapped into −180 to 180, then drop the sign."),
      numPart("dist", "Distance", "Distance to the player", dist, true, `Length of P − G (Pythagoras).${THEN}`),
      choicePart("seen", "Seen?", "Can the guard see the player?", seen, YN, `Both must hold: angle ≤ ${W / 2}° and distance ≤ ${R}.`),
    ],
    explanation:
      `Make the vector from the guard to the player, then compare its direction and length with the view cone.\n\n` +
      `- \`d = P − G = ${vec(ddx, ddy)}\`, heading ≈ ${num(hp)}°\n` +
      `- Angle from the facing: \`${num(hp)} − ${facing}\` wrapped into −180 to 180, without the sign ${res(ang, true, "°")}\n` +
      `- Distance: \`√(${par(ddx)}² + ${par(ddy)}²)\` ${res(dist, true)}\n` +
      `- ${inCone ? `${num(round2(ang))}° ≤ ${W / 2}°: inside the cone` : `${num(round2(ang))}° > ${W / 2}°: outside the cone`}; ${inRange ? `${num(round2(dist))} ≤ ${R}: in range` : `${num(round2(dist))} > ${R}: out of range`}. So **${seen}**.`,
    hints: [
      "Make the vector from the guard to the player, d = P − G, and find its heading (atan, then fix the quarter).",
      `The angle between two headings is their difference wrapped into −180 to 180, without the sign. (Or use the dot product: cos(angle) = f·d / |d| with f = (cos ${facing}°, sin ${facing}°).)`,
      `The guard sees the player only if both checks pass: angle ≤ ${W / 2}° and distance ≤ ${R}.`,
    ],
    given: giv({ gx, gy, px, py, facing, range: R }),
    params: { kind: "x-fov", v: { gx, gy, px, py, facing, W, R } },
    rounded: true,
  });
}

const EXPERT = {
  vectors: [xReflect, xClosest, xPerp],
  movement: [xIntercept, xDash, xLand],
  interpolation: [xFpsDamp, xBezier, xEase],
  angles: [xRotate, xTurnRate, xFov],
};

function genExpert(subtopic, rng) {
  const list = EXPERT[subtopic];
  if (!list) throw new Error(`Unknown subtopic: ${subtopic}`);
  return list[rng.int(0, list.length - 1)](rng);
}

// ======================= entry points =======================

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "vectors") return genVectors(difficulty, rng);
  if (subtopic === "movement") return genMovement(difficulty, rng);
  if (subtopic === "interpolation") return genInterp(difficulty, rng);
  if (subtopic === "angles") return genAngles(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------

// Number check: rounded answers within 0.005 × sens of the independent value, others exact.
function near(x, t, rounded, sens = 1) {
  if (x === "" || x === null || x === undefined || typeof x === "object" || typeof x === "boolean") return false;
  const n = Number(x);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
  return rounded ? Math.abs(n - t) <= 0.005 * sens + 1e-7 : Math.abs(n - t) < 1e-6;
}

// Polar form: length via projection onto the vector's own direction, not √(x² + y²).
const polarLen = (x, y) => {
  const th = Math.atan2(y, x);
  return x * Math.cos(th) + y * Math.sin(th);
};
// Angle in [0, 360) via acos (a different route from atan2).
const acosAngle = (x, y) => {
  const L = polarLen(x, y);
  const a = deg(Math.acos(Math.max(-1, Math.min(1, x / L))));
  return y >= 0 ? a : 360 - a;
};

// Each checker gets the stored values, the field being answered and the candidate answer.
const CHECK = {
  // a + k·b, checked in polar form: k·|b|·(cos θb, sin θb).
  lin: (v, f, x, r) => {
    const L = polarLen(v.bx, v.by), th = Math.atan2(v.by, v.bx);
    return near(x, f === "x" ? v.ax + v.k * L * Math.cos(th) : v.ay + v.k * L * Math.sin(th), r);
  },
  scale: (v, f, x, r) => {
    // reverse: the answer divided by k must give back the original component
    const n = Number(x);
    if (!Number.isFinite(n) || typeof x === "object" || x === "" || x === null) return false;
    return near(n / v.k, f === "x" ? v.x : v.y, r, 1 / Math.abs(v.k));
  },
  mag: (v, f, x, r) => near(x, polarLen(v.x, v.y), r),
  dist: (v, f, x, r) => near(x, polarLen(v.x2 - v.x1, v.y2 - v.y1), r),
  dot: (v, f, x, r) => {
    const t = polarLen(v.ax, v.ay) * polarLen(v.bx, v.by) * Math.cos(Math.atan2(v.ay, v.ax) - Math.atan2(v.by, v.bx));
    return near(x, Math.round(t * 1e6) / 1e6, r);
  },
  norm: (v, f, x, r) => {
    const th = Math.atan2(v.y, v.x);
    return near(x, f === "x" ? Math.cos(th) : Math.sin(th), r);
  },
  setlen: (v, f, x, r) => {
    const th = Math.atan2(v.y, v.x);
    return near(x, v.L * (f === "x" ? Math.cos(th) : Math.sin(th)), r);
  },
  facing: (v, f, x) => {
    const dx = v.px - v.gx, dy = v.py - v.gy;
    let diff = Math.abs(deg(Math.atan2(v.fy, v.fx) - Math.atan2(dy, dx)));
    if (diff > 180) diff = 360 - diff;
    if (f === "dot") {
      const t = polarLen(v.fx, v.fy) * polarLen(dx, dy) * Math.cos(rad(diff));
      return near(x, Math.round(t * 1e6) / 1e6, false);
    }
    const want = Math.abs(diff - 90) < 1e-7 ? REL[2] : diff < 90 ? REL[0] : REL[1];
    return segKey(x) === want;
  },
  // Simulation with many small steps instead of start + v·t.
  pos: (v, f, x, r) => {
    const N = 1000;
    let p = f === "x" ? v.x0 : v.y0;
    const vel = f === "x" ? v.vx : v.vy;
    for (let i = 0; i < N; i++) p += vel * (v.t / N);
    return near(x, Math.round(p * 1e6) / 1e6, r);
  },
  // Reverse: one second of frames at this step must add up to the speed.
  perframe: (v, f, x, r) => {
    const n = Number(x);
    if (typeof x === "object" || x === "" || x === null || !Number.isFinite(n)) return false;
    let sum = 0;
    for (let i = 0; i < v.fps; i++) sum += n;
    return near(sum, v.speed, r, v.fps);
  },
  // Simulation in whole numbers: after n frames the distance is n·speed/fps; find the first n ≥ dist.
  frames: (v, f, x) => {
    let n = 0;
    while (n * v.speed < v.dist * v.fps) n++;
    return near(x, n, false);
  },
  "fd-speed": (v, f, x) => {
    let sum = 0;
    for (let i = 0; i < v.F; i++) sum += v.k; // one second of frames
    return near(x, sum, false);
  },
  "fd-step": (v, f, x, r) => {
    const n = Number(x);
    if (typeof x === "object" || x === "" || x === null || !Number.isFinite(n)) return false;
    return near(n * v.F, v.k * v.base, r, v.F); // same px per second
  },
  // Closed form of semi-implicit Euler (the generator simulates step by step).
  euler: (v, f, x, r) => {
    const { p0, v0, a, dt, n } = v;
    const vn = v0 + n * a * dt;
    const pn = p0 + n * v0 * dt + (a * dt * dt * n * (n + 1)) / 2;
    return near(x, f === "v" ? vn : pn, r);
  },
  // (1 − t)·a + t·b form.
  lerp: (v, f, x, r) => near(x, (1 - v.t) * v.a + v.t * v.b, r),
  // Substitution: lerp(a, b, answer) must land on the value.
  findt: (v, f, x, r) => {
    const n = Number(x);
    if (typeof x === "object" || x === "" || x === null || !Number.isFinite(n)) return false;
    const back = (1 - n) * v.a + n * v.b;
    return r ? Math.abs(back - v.value) <= 0.005 * Math.abs(v.b - v.a) + 1e-7 : Math.abs(back - v.value) < 1e-6;
  },
  lerp2d: (v, f, x, r) => near(x, f === "x" ? (1 - v.t) * v.ax + v.t * v.bx : (1 - v.t) * v.ay + v.t * v.by, r),
  // Closed form (the generator iterates frame by frame).
  smooth: (v, f, x, r) => near(x, v.target - (v.target - v.x0) * Math.pow(1 - v.f, v.n), r),
  // Simulation (the generator uses logs).
  smoothframes: (v, f, x) => {
    let gap = v.G, n = 0;
    while (gap > v.close && n < 1000) {
      gap -= gap * v.f;
      n++;
    }
    return near(x, n, false);
  },
  // Substitution: map the answer back into the health range.
  remap: (v, f, x, r) => {
    const n = Number(x);
    if (typeof x === "object" || x === "" || x === null || !Number.isFinite(n)) return false;
    const back = v.inLo + ((n - v.outLo) / (v.outHi - v.outLo)) * (v.inHi - v.inLo);
    return Math.abs(back - v.val) <= (0.005 * (v.inHi - v.inLo)) / (v.outHi - v.outLo) + 1e-7;
  },
  angle: (v, f, x, r) => near(x, acosAngle(v.x, v.y), r),
  heading: (v, f, x, r) => (f === "angle" ? near(x, acosAngle(v.dx, v.dy), r) : near(x, polarLen(v.dx, v.dy), r)),
  // Rotation: right angle (dot 0), the right turning direction (cross sign) and the same length.
  rot: (v, f, x, r, all) => {
    const own = all || {};
    const rx = f === "x" ? Number(x) : Number(own.x);
    const ry = f === "y" ? Number(x) : Number(own.y);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || typeof x === "object" || x === "" || x === null) return false;
    // Field-by-field check with the other field derived from the same rules.
    const L2 = v.x * v.x + v.y * v.y;
    if (v.type === "180") return f === "x" ? Math.abs(Number(x) + v.x) < 1e-9 : Math.abs(Number(x) + v.y) < 1e-9;
    const cross = v.x * ry - v.y * rx; // > 0: counter-clockwise
    const dot = v.x * rx + v.y * ry;
    const wantCross = v.type === "ccw" ? L2 : -L2;
    return Math.abs(dot) < 1e-9 && Math.abs(cross - wantCross) < 1e-9 && Math.abs(rx * rx + ry * ry - L2) < 1e-9;
  },
  // Rotating the facing by the answer must point along the target direction.
  turn: (v, f, x, r) => {
    const n = Number(x);
    if (typeof x === "object" || x === "" || x === null || !Number.isFinite(n) || n <= -180 || n > 180) return false;
    const want = acosAngle(v.dx, v.dy);
    let diff = Math.abs(wrap360(v.facing + n) - want);
    if (diff > 180) diff = 360 - diff;
    return r ? diff <= 0.005 + 1e-7 : diff < 1e-6;
  },

  // ---- Expert checkers: none reuses its generator's formula ----

  // Mirror bounce in polar form: reflecting direction θ across a wall at angle α gives 2α − θ.
  "x-reflect": (v, f, x) => {
    const L = polarLen(v.vx, v.vy);
    const wall = Math.atan2(v.ny, v.nx) + Math.PI / 2;
    const out = 2 * wall - Math.atan2(v.vy, v.vx);
    return near(x, f === "x" ? L * Math.cos(out) : L * Math.sin(out), true);
  },
  // Ternary search for the smallest distance over t in [0, 1] (no projection formula).
  "x-closest": (v, f, x) => {
    const d2 = (t) => {
      const cx = v.ax + t * (v.bx - v.ax) - v.px, cy = v.ay + t * (v.by - v.ay) - v.py;
      return cx * cx + cy * cy;
    };
    let lo = 0, hi = 1;
    for (let i = 0; i < 200; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (d2(m1) <= d2(m2)) hi = m2;
      else lo = m1;
    }
    const t = (lo + hi) / 2;
    return near(x, f === "t" ? t : Math.sqrt(d2(t)), true);
  },
  // Bisection on the (linear) dot product, then the length in polar form.
  "x-perp": (v, f, x) => {
    const g = (k) => (v.ax + k * v.bx) * v.cx + (v.ay + k * v.by) * v.cy;
    let lo = -1000, hi = 1000;
    const up = g(hi) > g(lo);
    for (let i = 0; i < 100; i++) {
      const m = (lo + hi) / 2;
      if (g(m) > 0 === up) hi = m;
      else lo = m;
    }
    const k = (lo + hi) / 2;
    return near(x, f === "k" ? k : polarLen(v.ax + k * v.bx, v.ay + k * v.by), true);
  },
  // Bisection on "distance to the enemy minus bullet distance" (strictly decreasing since s > |u|).
  "x-intercept": (v, f, x) => {
    const g = (t) => polarLen(v.ex - v.tx + v.ux * t, v.ey - v.ty + v.uy * t) - v.s * t;
    let lo = 0, hi = 1000;
    for (let i = 0; i < 100; i++) {
      const m = (lo + hi) / 2;
      if (g(m) > 0) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    return near(x, f === "t" ? t : f === "x" ? v.ex + v.ux * t : v.ey + v.uy * t, true);
  },
  // Time to top speed by substitution; distances and times by a fine step-by-step simulation.
  "x-dash": (v, f, x) => {
    if (f === "t1") {
      const n = Number(x);
      if (typeof x === "object" || x === "" || x === null || !Number.isFinite(n)) return false;
      return Math.abs(n * v.a - v.vmax) <= 0.005 * v.a + 1e-7;
    }
    const h = 2e-4;
    let t = 0, p = 0, vel = 0;
    if (f === "dist") {
      const steps = Math.round(v.T / h);
      for (let i = 0; i < steps; i++) {
        const nv = Math.min(v.vmax, vel + v.a * h);
        p += ((vel + nv) / 2) * h;
        vel = nv;
      }
      return near(x, p, true);
    }
    while (t < 1000) {
      const nv = Math.min(v.vmax, vel + v.a * h);
      const np = p + ((vel + nv) / 2) * h;
      if (np >= v.D) { t += (h * (v.D - p)) / (np - p); break; }
      p = np; vel = nv; t += h;
    }
    return near(x, t, true);
  },
  // Closed form of the semi-implicit Euler steps (the generator simulates).
  "x-land": (v, f, x) => {
    const y = (n) => v.p0 + n * v.v0 * v.dt + (v.a * v.dt * v.dt * n * (n + 1)) / 2;
    let n = 1;
    while (y(n) > 0 && n < 10000) n++;
    if (f === "land") return near(x, n, false);
    let best = -Infinity;
    for (let k = 0; k <= n; k++) best = Math.max(best, y(k));
    return near(x, best, true);
  },
  // Frame-by-frame simulation; the new fraction by bisection (the generator uses powers).
  "x-fpsdamp": (v, f, x) => {
    const run = (frames, frac) => {
      let g = 1;
      for (let i = 0; i < frames; i++) g -= g * frac;
      return g;
    };
    const keep = run(v.F1, v.f / 100);
    if (f === "gap") return near(x, v.G * keep, true);
    let lo = 0, hi = 1;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      if (run(v.F2, m) > keep) lo = m;
      else hi = m;
    }
    return near(x, (100 * (lo + hi)) / 2, true);
  },
  // Bernstein form and its derivative (the generator lerps), heading via acos.
  "x-bezier": (v, f, x) => {
    const t = v.t, u = 1 - t;
    if (f === "x") return near(x, u * u * v.x0 + 2 * t * u * v.x1 + t * t * v.x2, true);
    if (f === "y") return near(x, u * u * v.y0 + 2 * t * u * v.y1 + t * t * v.y2, true);
    const dx = 2 * (u * (v.x1 - v.x0) + t * (v.x2 - v.x1));
    const dy = 2 * (u * (v.y1 - v.y0) + t * (v.y2 - v.y1));
    return circNear(x, acosAngle(dx, dy));
  },
  // Branch clamp and the expanded smoothstep t + t(1 − t)(2t − 1), lerp as (1 − s)a + s·b.
  "x-ease": (v, f, x) => {
    let t = (v.time - v.start) / v.dur;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const s = t + t * (1 - t) * (2 * t - 1);
    return near(x, f === "s" ? s : (1 - s) * v.a + s * v.b, true);
  },
  // Polar form: same length, angle + φ.
  "x-rotate": (v, f, x) => {
    const L = polarLen(v.x, v.y);
    const a = Math.atan2(v.y, v.x) + rad(v.phi);
    const nx = L * Math.cos(a), ny = L * Math.sin(a);
    if (f === "x") return near(x, nx, true);
    if (f === "y") return near(x, ny, true);
    return circNear(x, acosAngle(nx, ny));
  },
  // Cross product for the side, acos of the dot product for the size, a rotated unit vector for the heading.
  "x-turnrate": (v, f, x) => {
    const fx = Math.cos(rad(v.facing)), fy = Math.sin(rad(v.facing));
    const L = polarLen(v.dx, v.dy);
    const left = fx * v.dy - fy * v.dx > 0;
    if (f === "dir") return segKey(x) === (left ? LR[0] : LR[1]);
    const ang = deg(Math.acos(Math.max(-1, Math.min(1, (fx * v.dx + fy * v.dy) / L))));
    if (f === "time") return near(x, ang / v.rate, true);
    const r = rad((left ? 1 : -1) * v.rate * v.t1);
    return circNear(x, acosAngle(fx * Math.cos(r) - fy * Math.sin(r), fx * Math.sin(r) + fy * Math.cos(r)));
  },
  // Dot product with the facing unit vector (the generator subtracts headings).
  "x-fov": (v, f, x) => {
    const dx = v.px - v.gx, dy = v.py - v.gy;
    const L = polarLen(dx, dy);
    const ang = deg(Math.acos(Math.max(-1, Math.min(1, (Math.cos(rad(v.facing)) * dx + Math.sin(rad(v.facing)) * dy) / L))));
    if (f === "angle") return near(x, ang, true);
    if (f === "dist") return near(x, L, true);
    return String(x) === (ang <= v.W / 2 && L <= v.R ? YN[0] : YN[1]);
  },
};

// Angles in degrees compared around the circle (so 0 and 359.999… are 0.001 apart).
function circNear(x, truth) {
  if (x === "" || x === null || x === undefined || typeof x === "object" || typeof x === "boolean") return false;
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0 || n >= 360) return false;
  let d = Math.abs(n - truth) % 360;
  if (d > 180) d = 360 - d;
  return d <= 0.005 + 1e-7;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.v) return false; // regenerate from the seed to get params back
  const chk = CHECK[p.kind];
  if (!chk) return false;
  const rounded = !!p.rounded;

  if (question.answerType === "multi") {
    const parts = question.parts;
    if (!Array.isArray(parts) || parts.length < 2 || parts.length > 4) return false;
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
    if (Object.keys(answer).length !== parts.length) return false;
    for (const part of parts) {
      if (!part || !Object.prototype.hasOwnProperty.call(answer, part.id)) return false;
      const val = answer[part.id];
      if (part.answerType === "choice" && part.choiceCols) {
        // Segmented part (Choose only): 5 options, one right, the others one column off.
        if (!segOk(part, val, (t) => chk(p.v, part.id, t.join(" | "), rounded, answer) === true, 5, false)) return false;
        continue;
      }
      if (part.answerType === "choice") {
        const ch = part.choices;
        if (!Array.isArray(ch) || new Set(ch).size !== ch.length || !ch.includes(String(val))) return false;
        if (ch.filter((c) => chk(p.v, part.id, c, rounded, answer)).length !== 1) return false;
      } else if (typeof val !== "number" && typeof val !== "string") return false;
      if (!chk(p.v, part.id, val, rounded, answer)) return false;
    }
    return true;
  }

  const field = p.field || "main";
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
    if (ch.filter((c) => chk(p.v, field, c, rounded)).length !== 1) return false; // exactly one right option
  }
  return chk(p.v, field, answer, rounded);
}
