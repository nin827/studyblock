// Coordinate Geometry generator. Uses only the seeded rng passed in by the engine.
// Answer formats:
//   whole numbers and exact decimals (midpoints like 2.5, areas like 12.5)  tolerance 0
//   lengths that aren't whole                                              rounded to 2 dp, tolerance 0.005
//   gradients and intercepts                                               text: a whole number or a fraction in simplest form ("-3/4")
//   points, exact surds, line equations, pairs of points                   multiple choice
// Lines in choices are written as y = mx + c when m and c are whole, otherwise as ax + by = c with whole
// a, b, c (a > 0, no common factor). A fractional gradient in a prompt is written like y = (3/4)x - 2.
// verify() never reuses generate()'s formulas: it substitutes points into a parsed equation, compares
// squared lengths, uses dot and cross products of normal vectors, tests equal distances, and checks areas
// with Heron's formula in whole numbers (16A² from the squared sides) instead of the shoelace formula.

// ---------------------------------------------------------------------------------------------
// Shared helpers (generation side)

const WHOLE = " Give a whole number.";
const DP2 = " Round to 2 decimal places.";
const FRAC = " Give a whole number or a fraction in simplest form, like 3/4 or -5/2 (no spaces, minus sign in front).";
const EXACT = " Give the exact value: a whole number or a decimal like 2.5.";

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// Reduced fraction [p, q] with q > 0.
function frac(p, q) {
  if (q < 0) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1;
  return [p / g + 0, q / g];
}
const fracStr = ([p, q]) => (q === 1 ? String(p) : `${p}/${q}`);
const isWhole = ([, q]) => q === 1;

// Numbers in text: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));
const pt = ([x, y]) => `(${num(x)}, ${num(y)})`;

// Retry a draw until ok() holds (only the rng passed in). Throws if it never does, so the engine redraws.
function draw(make, ok, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const v = make();
    if (ok(v)) return v;
  }
  throw new Error("draw failed");
}
const nz = (rng, lo, hi) => draw(() => rng.int(lo, hi), (v) => v !== 0);

// Line ax + by = c with whole a, b, c, no common factor, a > 0 (or a = 0 and b > 0).
function normLine(a, b, c) {
  const g = gcd(gcd(a, b), c) || 1;
  a /= g;
  b /= g;
  c /= g;
  if (a < 0 || (a === 0 && b < 0)) [a, b, c] = [-a, -b, -c];
  return { a: a + 0, b: b + 0, c: c + 0 };
}
const lineThrough = ([x1, y1], [x2, y2]) => normLine(y2 - y1, x1 - x2, (y2 - y1) * x1 + (x1 - x2) * y1);
// Line with gradient p/q through (x0, y0): p·x - q·y = p·x0 - q·y0.
const lineSlopePoint = ([p, q], [x0, y0]) => normLine(p, -q, p * x0 - q * y0);
const slopeOf = ({ a, b }) => frac(-a, b); // b ≠ 0
const yIntOf = ({ b, c }) => frac(c, b);

function term(k, v, first) {
  if (k === 0) return "";
  const abs = Math.abs(k);
  const body = (abs === 1 ? "" : String(abs)) + v;
  if (first) return k < 0 ? `-${body}` : body;
  return ` ${k < 0 ? "-" : "+"} ${body}`;
}
// "2x + 3y = 12", "x - 4y = -6", "y = 5"
function fmtGeneral({ a, b, c }) {
  const s = term(a, "x", true);
  return `${s}${term(b, "y", s === "")} = ${num(c)}`;
}
// "y = 2x - 3", "y = -x", "y = (3/4)x + 1/2", "y = -(2/5)x - 3"
function fmtSI([mp, mq], [kp, kq]) {
  let s = "y = ";
  if (mp !== 0) s += (mq === 1 ? (mp === 1 ? "" : mp === -1 ? "-" : String(mp)) : mp < 0 ? `-(${-mp}/${mq})` : `(${mp}/${mq})`) + "x";
  const kAbs = kq === 1 ? String(Math.abs(kp)) : `${Math.abs(kp)}/${kq}`;
  if (kp !== 0) s += mp === 0 ? `${kp < 0 ? "-" : ""}${kAbs}` : ` ${kp < 0 ? "-" : "+"} ${kAbs}`;
  else if (mp === 0) s += "0";
  return s;
}
// Show a line as y = mx + c when it isn't vertical, else in general form.
const fmtLine = (L) => (L.b !== 0 ? fmtSI(slopeOf(L), yIntOf(L)) : fmtGeneral(L));
// Choice form: y = mx + c when m and c are whole, else ax + by = c.
const fmtChoice = (L) => (L.b !== 0 && isWhole(slopeOf(L)) && isWhole(yIntOf(L)) ? fmtSI(slopeOf(L), yIntOf(L)) : fmtGeneral(L));
const onLineGen = (L, [x, y]) => L.a * x + L.b * y === L.c;

// True when `tok` appears in `text` as a standalone number. A hint that would name the answer (when the
// prompt doesn't already) is swapped for `alt`.
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasToken = (text, tok) => new RegExp(`(^|[^\\w.])${escRe(tok)}(?!\\w|\\.\\d)`).test(text);
const guard = (hint, alt, answer, prompt) => (hasToken(hint, String(answer)) && !hasToken(prompt, String(answer)) ? alt : hint);

const givenPts = (pts) => pts.flatMap(([x, y], i) => [{ label: `_x${i + 1}`, value: x }, { label: `_y${i + 1}`, value: y }]);

// 4 distinct choices from the answer and candidate strings (dropping ones equal to the answer).
function pickChoices(answer, cands, rng) {
  const seen = new Set([answer]);
  const out = [];
  for (const c of cands) if (out.length < 3 && c && !seen.has(c)) { seen.add(c); out.push(c); }
  if (out.length < 3) throw new Error("not enough distractors");
  return rng.shuffle([answer, ...out]);
}

// 4 distinct number choices (strings).
function numChoices(correct, cands, rng, fmt = num) {
  const ans = fmt(correct);
  const seen = new Set([ans]);
  const out = [];
  // Whole answers only get whole distractors; others at most 2 decimals (like 12.5 or 7.21).
  const tidy = (v) => (Number.isInteger(correct) ? Number.isInteger(v) : Math.abs(v * 100 - Math.round(v * 100)) < 1e-9);
  const add = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || (fmt === num && !tidy(v))) return;
    const s = fmt(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  cands.forEach(add);
  for (let k = 1; out.length < 3; k++) {
    add(correct + k);
    add(correct - k);
  }
  return { answer: ans, choices: rng.shuffle([ans, ...out]) };
}

function finishNum(base, correct, cands, rng, pChoice = 0.3, note = WHOLE, fmt = num) {
  if (rng.next() < pChoice) {
    const { answer, choices } = numChoices(correct, cands, rng, fmt);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: base.prompt + note, answer: correct, answerType: "number", tolerance: 0, choices: undefined };
}

const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const fmt2 = (n) => round2(n).toFixed(2);
const nearHalf = (n) => Math.abs(Math.abs(n * 100) % 1 - 0.5) < 1e-6;

// Largest square factor: n = s² × r with r square-free -> "s√r" (or "√r", or "s" if r = 1).
function surd(n) {
  let r = n;
  let s = 1;
  for (let k = 2; k * k <= r; k++) {
    while (r % (k * k) === 0) {
      r /= k * k;
      s *= k;
    }
  }
  if (r === 1) return String(s);
  return s === 1 ? `√${r}` : `${s}√${r}`;
}

const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20], [7, 24, 25], [20, 21, 29], [15, 20, 25]];

// ---------------------------------------------------------------------------------------------
// Points & distance

function qMidpoint(difficulty, rng) {
  const R = difficulty === "easy" ? 10 : 14;
  const [A, B] = draw(
    () => [[rng.int(-R, R), rng.int(-R, R)], [rng.int(-R, R), rng.int(-R, R)]],
    ([P, Q]) => (P[0] !== Q[0] || P[1] !== Q[1]) && Math.abs(P[0] - Q[0]) + Math.abs(P[1] - Q[1]) >= 4 &&
      (difficulty === "easy" ? (P[0] + Q[0]) % 2 === 0 && (P[1] + Q[1]) % 2 === 0 : (P[0] + Q[0]) % 2 !== 0 || (P[1] + Q[1]) % 2 !== 0)
  );
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const [nA, nB] = rng.pick([["A", "B"], ["P", "Q"], ["R", "S"]]);
  const lead = `${nA} = ${pt(A)} and ${nB} = ${pt(B)}.`;
  const explanation = `The midpoint is the average of the coordinates: \`((x1 + x2) / 2, (y1 + y2) / 2)\`.\n\n- x: (${num(A[0])} + ${par(B[0])}) / 2 = ${num(A[0] + B[0])} / 2 = ${num(M[0])}\n- y: (${num(A[1])} + ${par(B[1])}) / 2 = ${num(A[1] + B[1])} / 2 = ${num(M[1])}\n\nSo the midpoint is **${pt(M)}**.`;
  const given = givenPts([A, B]);
  if (rng.next() < 0.45) {
    const answer = pt(M);
    const choices = pickChoices(
      answer,
      [pt([(B[0] - A[0]) / 2, (B[1] - A[1]) / 2]), pt([M[1], M[0]]), pt([A[0] + B[0], A[1] + B[1]]), pt([M[0], -M[1]]), pt([-M[0], M[1]]), pt([(A[0] - B[0]) / 2, (A[1] - B[1]) / 2])],
      rng
    );
    return {
      prompt: `${lead} What is the midpoint of ${nA}${nB}?`, answer, answerType: "choice", choices, explanation, given,
      hints: [
        "The midpoint is halfway along in both directions: average the x-coordinates, then average the y-coordinates.",
        `Add the x-coordinates (${num(A[0])} + ${par(B[0])}) and halve; do the same with the y-coordinates (${num(A[1])} + ${par(B[1])}). In the calculator: \`(_x1 + _x2) / 2\`.`,
      ],
      params: { kind: "mid", A, B },
    };
  }
  const prompt = `${lead} Find the midpoint of ${nA}${nB}.`;
  const parts = [
    { id: "x", label: "x-coordinate", ask: `x-coordinate of the midpoint.${EXACT}`, answerType: "number", answer: M[0], tolerance: 0, hint: `Add the x-coordinates, ${num(A[0])} + ${par(B[0])}, then halve (\`(_x1 + _x2) / 2\`).` },
    { id: "y", label: "y-coordinate", ask: `y-coordinate of the midpoint.${EXACT}`, answerType: "number", answer: M[1], tolerance: 0, hint: `Add the y-coordinates, ${num(A[1])} + ${par(B[1])}, then halve (\`(_y1 + _y2) / 2\`).` },
  ];
  return {
    prompt, answerType: "multi", parts, explanation, given,
    hints: ["Average the coordinates: the midpoint is ((x1 + x2) / 2, (y1 + y2) / 2)."],
    params: { multi: true, parts: [{ id: "x", kind: "half", a: A[0], b: B[0] }, { id: "y", kind: "half", a: A[1], b: B[1] }] },
  };
}

// Two points whose distance is a whole number (a Pythagorean triple, any orientation).
function triplePoints(rng, R) {
  return draw(
    () => {
      const [p, q, h] = rng.pick(TRIPLES);
      const [dx, dy] = rng.next() < 0.5 ? [p, q] : [q, p];
      const sx = rng.pick([1, -1]), sy = rng.pick([1, -1]);
      const A = [rng.int(-R, R), rng.int(-R, R)];
      return { A, B: [A[0] + sx * dx, A[1] + sy * dy], h };
    },
    ({ B }) => Math.abs(B[0]) <= R + 12 && Math.abs(B[1]) <= R + 12
  );
}

function qDistanceWhole(rng) {
  const { A, B, h } = triplePoints(rng, 8);
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const prompt = rng.pick([
    `What is the distance between ${pt(A)} and ${pt(B)}?`,
    `A drone flies in a straight line from ${pt(A)} to ${pt(B)} on a grid marked in km. How far does it fly, in km?`,
    `Find the length of the line segment from ${pt(A)} to ${pt(B)}.`,
  ]);
  const explanation = `Use Pythagoras: \`d = √((x2 - x1)² + (y2 - y1)²)\`.\n\n- across: ${num(B[0])} − ${par(A[0])} = ${dx}\n- up: ${num(B[1])} − ${par(A[1])} = ${dy}\n\n\`d = √(${dx * dx} + ${dy * dy}) = √${h * h}\` = **${h}**.`;
  const hints = [
    "The segment is the hypotenuse of a right triangle: find how far across and how far up, then use Pythagoras.",
    `Across: ${num(B[0])} − ${par(A[0])}. Up: ${num(B[1])} − ${par(A[1])}. Square both, add, and take the square root (\`sqrt((_x2 - _x1)^2 + (_y2 - _y1)^2)\`).`,
  ];
  const base = { prompt, explanation, hints, given: givenPts([A, B]), params: { kind: "dist", A, B, rounded: false } };
  return finishNum(base, h, [Math.abs(dx) + Math.abs(dy), h * h, Math.abs(Math.abs(dx) - Math.abs(dy)), h + 1], rng, 0.3, WHOLE);
}

function nonSquarePoints(rng, R) {
  return draw(
    () => [[rng.int(-R, R), rng.int(-R, R)], [rng.int(-R, R), rng.int(-R, R)]],
    ([P, Q]) => {
      const d2 = (P[0] - Q[0]) ** 2 + (P[1] - Q[1]) ** 2;
      return P[0] !== Q[0] && P[1] !== Q[1] && !Number.isInteger(Math.sqrt(d2)) && !nearHalf(Math.sqrt(d2));
    }
  );
}

function qDistanceRounded(rng) {
  const [A, B] = nonSquarePoints(rng, 12);
  const dx = B[0] - A[0], dy = B[1] - A[1], d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
  const prompt = `What is the distance between ${pt(A)} and ${pt(B)}?`;
  const explanation = `Use \`d = √((x2 - x1)² + (y2 - y1)²)\`.\n\n- across: ${dx}, up: ${dy}\n\n\`d = √(${dx * dx} + ${dy * dy}) = √${d2}\` ≈ ${d.toFixed(4)}, which rounds to **${fmt2(d)}**.`;
  const hints = [
    "Find how far across and how far up, then use Pythagoras.",
    `Across: ${dx}. Up: ${dy}. Square both, add, take the square root, then round (\`sqrt((_x2 - _x1)^2 + (_y2 - _y1)^2)\`).`,
  ];
  const base = { prompt, explanation, hints, given: givenPts([A, B]), params: { kind: "dist", A, B, rounded: true } };
  if (rng.next() < 0.3) {
    const { answer, choices } = numChoices(round2(d), [Math.abs(dx) + Math.abs(dy), Math.sqrt(Math.abs(dx * dx - dy * dy)), Math.sqrt(dx * dx + Math.abs(dy)), Math.sqrt(Math.abs(dx) + Math.abs(dy))], rng, fmt2);
    return { ...base, prompt: prompt + DP2, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: prompt + DP2, answer: round2(d), answerType: "number", tolerance: 0.005 };
}

function qSurd(rng) {
  const wantSimplify = rng.next() < 0.7;
  const [A, B] = draw(() => nonSquarePoints(rng, 10), ([P, Q]) => {
    const sd = surd((P[0] - Q[0]) ** 2 + (P[1] - Q[1]) ** 2);
    return sd.includes("√") && (!wantSimplify || /^\d+√/.test(sd));
  });
  const dx = B[0] - A[0], dy = B[1] - A[1], d2 = dx * dx + dy * dy;
  const answer = surd(d2);
  const radicands = [Math.abs(dx) + Math.abs(dy), Math.abs(dx * dx - dy * dy), 2 * d2, d2 + 2 * Math.abs(dx * dy), dx * dx + Math.abs(dy), Math.abs(dx) + dy * dy, Math.abs(dx * dy), d2 * 4, d2 * 3, d2 * 5];
  // Also the "swapped" simplification: s√r written as r√s.
  const m = answer.match(/^(\d+)√(\d+)$/);
  const cands = radicands.filter((r) => r > 1 && r !== d2).map(surd);
  if (m) cands.unshift(surd(Number(m[2]) ** 2 * Number(m[1])));
  const choices = pickChoices(answer, cands.filter((c) => c.includes("√")), rng);
  const prompt = `What is the exact distance between ${pt(A)} and ${pt(B)}? Choose the simplified surd.`;
  const sq = answer.match(/^(\d*)√/);
  const explanation = `\`d = √((x2 - x1)² + (y2 - y1)²) = √(${dx * dx} + ${dy * dy}) = √${d2}\`.\n\nSimplify by taking out the largest square factor: ${sq && sq[1] ? `${d2} = ${Number(sq[1]) ** 2} × ${d2 / Number(sq[1]) ** 2}, so √${d2} = ` : `${d2} has no square factor, so it stays as `}**${answer}**.`;
  const hints = [
    "Find how far across and how far up, square both and add. Keep it as a square root.",
    `Under the root you get ${par(dx)}² + ${par(dy)}². Work that out, then look for the largest square number (4, 9, 16, 25, ...) that divides it and take its root outside.`,
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, given: givenPts([A, B]), params: { kind: "surd", d2: d2 } };
}

function qMissingEnd(rng) {
  const [A, B] = draw(
    () => [[rng.int(-10, 10), rng.int(-10, 10)], [rng.int(-12, 12), rng.int(-12, 12)]],
    ([P, Q]) => (P[0] + Q[0]) % 2 === 0 && (P[1] + Q[1]) % 2 === 0 && (P[0] !== Q[0] || P[1] !== Q[1])
  );
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const prompt = `M = ${pt(M)} is the midpoint of AB, and A = ${pt(A)}. Find the coordinates of B.`;
  const explanation = `M is halfway, so B is as far beyond M as M is beyond A: \`B = 2M - A\`.\n\n- x: 2 × ${par(M[0])} − ${par(A[0])} = ${num(B[0])}\n- y: 2 × ${par(M[1])} − ${par(A[1])} = ${num(B[1])}\n\nSo **B = ${pt(B)}**.`;
  const parts = [
    { id: "x", label: "x-coordinate", ask: `x-coordinate of B.${WHOLE}`, answerType: "number", answer: B[0], tolerance: 0, hint: guard(`From A to M, x changes by ${num(M[0] - A[0])}. Change it by the same again from M (\`2 * _x2 - _x1\`).`, "Find how much x changes from A to M, then change it by the same amount again from M (`2 * _x2 - _x1`).", B[0], prompt) },
    { id: "y", label: "y-coordinate", ask: `y-coordinate of B.${WHOLE}`, answerType: "number", answer: B[1], tolerance: 0, hint: guard(`From A to M, y changes by ${num(M[1] - A[1])}. Change it by the same again from M (\`2 * _y2 - _y1\`).`, "Find how much y changes from A to M, then change it by the same amount again from M (`2 * _y2 - _y1`).", B[1], prompt) },
  ];
  return {
    prompt, answerType: "multi", parts, explanation, given: givenPts([A, M]),
    hints: ["The step from A to M is the same as the step from M to B. (The calculator lists A first as _x1, _y1 and M as _x2, _y2.)"],
    params: { multi: true, parts: [{ id: "x", kind: "endPart", a: A[0], m: M[0] }, { id: "y", kind: "endPart", a: A[1], m: M[1] }] },
  };
}

const RIGHT_LABELS = ["Right angle at A", "Right angle at B", "Right angle at C", "No right angle"];

function qRightAngle(rng) {
  const right = rng.next() < 0.75;
  let pts, at;
  if (right) {
    at = rng.int(0, 2);
    pts = draw(
      () => {
        const V = [rng.int(-6, 6), rng.int(-6, 6)];
        const u = [nz(rng, -5, 5), rng.int(-5, 5)];
        const t = rng.pick([1, 2, -1, -2]);
        const v = [-u[1] * t, u[0] * t];
        const P = [V[0] + u[0], V[1] + u[1]], Q = [V[0] + v[0], V[1] + v[1]];
        const out = [null, null, null];
        out[at] = V;
        out[(at + 1) % 3] = P;
        out[(at + 2) % 3] = Q;
        return out;
      },
      (p) => p.every(([x, y]) => Math.abs(x) <= 12 && Math.abs(y) <= 12)
    );
  } else {
    at = 3;
    pts = draw(
      () => [0, 1, 2].map(() => [rng.int(-8, 8), rng.int(-8, 8)]),
      (p) => {
        const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
        if (Math.abs(cross) < 6) return false;
        for (let i = 0; i < 3; i++) {
          const V = p[i], P = p[(i + 1) % 3], Q = p[(i + 2) % 3];
          const dot = (P[0] - V[0]) * (Q[0] - V[0]) + (P[1] - V[1]) * (Q[1] - V[1]);
          if (Math.abs(dot) < 3) return false; // keep it clearly not right-angled
        }
        return true;
      }
    );
  }
  const names = ["A", "B", "C"];
  const sq = (P, Q) => (P[0] - Q[0]) ** 2 + (P[1] - Q[1]) ** 2;
  const s = [sq(pts[1], pts[2]), sq(pts[0], pts[2]), sq(pts[0], pts[1])]; // side opposite A, B, C
  const prompt = `Triangle ABC has A = ${pt(pts[0])}, B = ${pt(pts[1])} and C = ${pt(pts[2])}. Does it have a right angle, and if so where?`;
  const explanation =
    `Compare the squared side lengths (Pythagoras works backwards: the angle opposite the longest side is 90° exactly when the other two squares add up to it).\n\n` +
    `- BC² = ${s[0]}\n- AC² = ${s[1]}\n- AB² = ${s[2]}\n\n` +
    (right
      ? `${[0, 1, 2].filter((i) => i !== at).map((i) => s[i]).join(" + ")} = ${s[at]}, so the right angle is opposite the longest side, at **${names[at]}**.`
      : `The two smaller squares add up to ${[...s].sort((a, b) => a - b).slice(0, 2).reduce((a, b) => a + b, 0)}, not ${Math.max(...s)}, so there is **no right angle**.`);
  const hints = [
    "Work out the squared length of each side, (x2 - x1)² + (y2 - y1)², without square roots.",
    `The squares are BC² = ${s[0]}, AC² = ${s[1]} and AB² = ${s[2]}. Does the biggest equal the sum of the other two? The right angle would be opposite the biggest.`,
  ];
  return {
    prompt, answer: RIGHT_LABELS[at], answerType: "choice", choices: RIGHT_LABELS.slice(), explanation, hints,
    given: givenPts(pts), params: { kind: "right", pts },
  };
}

function qFindK(rng) {
  const { A, B, h } = draw(() => triplePoints(rng, 8), ({ A: P, B: Q }) => Q[0] > P[0]);
  const prompt = `The point (k, ${num(B[1])}) is ${h} units from ${pt(A)}, and k > ${num(A[0])}. What is k?`;
  const dy = B[1] - A[1];
  const explanation = `Use Pythagoras with the vertical step ${dy}: \`(k - ${par(A[0])})² + ${par(dy)}² = ${h}²\`.\n\nSo (k − ${par(A[0])})² = ${h * h} − ${dy * dy} = ${h * h - dy * dy}, and k − ${par(A[0])} = ${B[0] - A[0]} (positive, because k > ${num(A[0])}).\n\nSo k = **${B[0]}**.`;
  const hints = [
    `Write the distance with Pythagoras: (k − ${par(A[0])})² + (${num(B[1])} − ${par(A[1])})² = ${h}².`,
    guard(`The vertical step is ${dy}, so (k − ${par(A[0])})² = ${h}² − ${par(dy)}². Take the positive square root, then add ${par(A[0])}.`,
      `Subtract the square of the vertical step from ${h}², take the positive square root, then add ${par(A[0])}.`, B[0], prompt),
  ];
  const base = { prompt, explanation, hints, given: [{ label: "_x1", value: A[0] }, { label: "_y1", value: A[1] }, { label: "_y2", value: B[1] }, { label: "_d", value: h }], params: { kind: "findK", x1: A[0], y1: A[1], y2: B[1], d: h } };
  return finishNum(base, B[0], [A[0] - (B[0] - A[0]), B[0] - A[0], A[0] + h, B[0] + 1], rng, 0.3, WHOLE);
}

function qPointsMulti(rng) {
  const [A, B] = draw(() => nonSquarePoints(rng, 12), ([P, Q]) => (P[0] + Q[0]) % 2 !== 0 || (P[1] + Q[1]) % 2 !== 0);
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const dx = B[0] - A[0], dy = B[1] - A[1], d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
  const prompt = `A = ${pt(A)} and B = ${pt(B)}.`;
  const explanation = `**Midpoint:** average the coordinates: ((${num(A[0])} + ${par(B[0])}) / 2, (${num(A[1])} + ${par(B[1])}) / 2) = **${pt(M)}**.\n\n**Length:** across ${dx}, up ${dy}, so AB = √(${dx * dx} + ${dy * dy}) = √${d2} ≈ ${d.toFixed(4)}, which rounds to **${fmt2(d)}**.`;
  const parts = [
    { id: "mx", label: "Midpoint x", ask: `x-coordinate of the midpoint of AB.${EXACT}`, answerType: "number", answer: M[0], tolerance: 0, hint: "Add the two x-coordinates and halve (`(_x1 + _x2) / 2`)." },
    { id: "my", label: "Midpoint y", ask: `y-coordinate of the midpoint of AB.${EXACT}`, answerType: "number", answer: M[1], tolerance: 0, hint: "Add the two y-coordinates and halve (`(_y1 + _y2) / 2`)." },
    { id: "len", label: "Length", ask: `Length of AB.${DP2}`, answerType: "number", answer: round2(d), tolerance: 0.005, hint: `Across ${dx}, up ${dy}: square, add, square root (\`sqrt((_x2 - _x1)^2 + (_y2 - _y1)^2)\`), then round.` },
  ];
  return {
    prompt, answerType: "multi", parts, explanation, given: givenPts([A, B]),
    hints: ["The midpoint averages the coordinates; the length comes from Pythagoras on the across and up steps."],
    params: { multi: true, parts: [{ id: "mx", kind: "half", a: A[0], b: B[0] }, { id: "my", kind: "half", a: A[1], b: B[1] }, { id: "len", kind: "dist", A, B, rounded: true }] },
  };
}

function qPerimeter(rng) {
  const pts = draw(
    () => [0, 1, 2].map(() => [rng.int(-8, 8), rng.int(-8, 8)]),
    (p) => {
      const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      const per = [0, 1, 2].reduce((s, i) => s + Math.hypot(p[(i + 1) % 3][0] - p[i][0], p[(i + 1) % 3][1] - p[i][1]), 0);
      return Math.abs(cross) >= 6 && !nearHalf(per);
    }
  );
  const sides = [[0, 1], [1, 2], [2, 0]].map(([i, j]) => {
    const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
    return { name: "ABC"[i] + "ABC"[j], d2: dx * dx + dy * dy };
  });
  const per = sides.reduce((s, x) => s + Math.sqrt(x.d2), 0);
  const prompt = `Find the perimeter of the triangle with vertices A = ${pt(pts[0])}, B = ${pt(pts[1])} and C = ${pt(pts[2])}.${DP2}`;
  const explanation = `Find each side with Pythagoras, then add them, rounding only at the end.\n\n${sides.map((x) => `- ${x.name} = √${x.d2} ≈ ${Math.sqrt(x.d2).toFixed(4)}`).join("\n")}\n\nPerimeter ≈ ${per.toFixed(4)}, which rounds to **${fmt2(per)}**.`;
  const hints = [
    "The perimeter is AB + BC + CA. Find each length with Pythagoras.",
    `The squared lengths are AB² = ${sides[0].d2}, BC² = ${sides[1].d2} and CA² = ${sides[2].d2}. Take each square root, add, and round at the end.`,
  ];
  return { prompt, answer: round2(per), answerType: "number", tolerance: 0.005, explanation, hints, given: givenPts(pts), params: { kind: "perim", pts } };
}

function genPoints(difficulty, rng) {
  const kind = rng.pick(
    { easy: ["mid", "mid", "distWhole", "distWhole"], medium: ["mid", "distRound", "surd", "surd", "end"], hard: ["right", "right", "findK", "multi", "multi", "perim"] }[difficulty]
  );
  if (kind === "mid") return qMidpoint(difficulty, rng);
  if (kind === "distWhole") return qDistanceWhole(rng);
  if (kind === "distRound") return qDistanceRounded(rng);
  if (kind === "surd") return qSurd(rng);
  if (kind === "end") return qMissingEnd(rng);
  if (kind === "right") return qRightAngle(rng);
  if (kind === "findK") return qFindK(rng);
  if (kind === "multi") return qPointsMulti(rng);
  return qPerimeter(rng);
}

// ---------------------------------------------------------------------------------------------
// Gradient & lines

function twoPoints(rng, R, ok) {
  return draw(() => [[rng.int(-R, R), rng.int(-R, R)], [rng.int(-R, R), rng.int(-R, R)]], ([P, Q]) => P[0] !== Q[0] && ok(P, Q));
}

function gradExplain(A, B) {
  const dy = B[1] - A[1], dx = B[0] - A[0];
  const m = frac(dy, dx);
  return `Gradient = rise ÷ run = \`(y2 - y1) / (x2 - x1)\`.\n\n(${num(B[1])} − ${par(A[1])}) / (${num(B[0])} − ${par(A[0])}) = ${dy} / ${par(dx)}${gcd(dy, dx) > 1 || dx < 0 ? ` = **${fracStr(m)}**` : ` = **${fracStr(m)}**`}.`;
}

function qGradient(difficulty, rng) {
  const whole = difficulty === "easy";
  const [A, B] = whole
    ? draw(() => {
        const A0 = [rng.int(-8, 8), rng.int(-8, 8)];
        const dx = nz(rng, -5, 5), m = rng.int(-5, 5);
        return [A0, [A0[0] + dx, A0[1] + m * dx]];
      }, ([, Q]) => Math.abs(Q[1]) <= 25)
    : twoPoints(rng, 10, (P, Q) => !isWhole(frac(Q[1] - P[1], Q[0] - P[0])));
  const m = frac(B[1] - A[1], B[0] - A[0]);
  const prompt = rng.pick([
    `What is the gradient of the line through ${pt(A)} and ${pt(B)}?`,
    `A straight road on a map grid runs from ${pt(A)} to ${pt(B)}. What is its gradient?`,
    `Find the gradient (slope) of the line segment joining ${pt(A)} and ${pt(B)}.`,
  ]);
  const dy = B[1] - A[1], dx = B[0] - A[0];
  const hints = [
    "Gradient = change in y ÷ change in x, taking both changes in the same direction (from the first point to the second).",
    `Change in y: ${num(B[1])} − ${par(A[1])}. Change in x: ${num(B[0])} − ${par(A[0])}. Divide${whole ? "" : " and simplify the fraction"} (\`(_y2 - _y1) / (_x2 - _x1)\`).`,
  ];
  const base = { prompt, explanation: gradExplain(A, B), hints, given: givenPts([A, B]), params: { kind: "grad", A, B } };
  if (whole) return finishNum(base, m[0], [dx === 0 ? 1 : -m[0], dy === 0 ? 2 : m[0] === 0 ? 1 : Math.round(dx / dy) || 3, dy, -dy], rng, 0.3, WHOLE);
  const wrong = [fracStr(frac(dx, dy)), fracStr(frac(-dy, dx)), fracStr(frac(dy + dx, dx))];
  if (rng.next() < 0.3) {
    const answer = fracStr(m);
    return { ...base, prompt: base.prompt + " Choose the simplest form.", answer, answerType: "choice", choices: pickChoices(answer, [...wrong, fracStr(frac(dy, -dx - 1 || 1)), fracStr(frac(2 * dy, dx + (dx > 0 ? 1 : -1)))], rng) };
  }
  return { ...base, prompt: base.prompt + FRAC, answer: fracStr(m), answerType: "text" };
}

function qRearrange(difficulty, rng) {
  const what = rng.pick(["m", "c"]);
  let L, shown, prompt;
  if (difficulty === "easy") {
    // ky = ax + b with k dividing both, so m and c are whole.
    const k = rng.int(2, 6), m = nz(rng, -6, 6), c = nz(rng, -9, 9);
    shown = `${k}y = ${term(k * m, "x", true)}${c * k < 0 ? ` - ${-c * k}` : ` + ${c * k}`}`;
    L = normLine(-k * m, k, k * c);
  } else {
    L = draw(() => normLine(nz(rng, -9, 9), nz(rng, -9, 9), rng.int(-20, 20)), (l) => Math.abs(l.b) > 1 && !isWhole(what === "m" ? slopeOf(l) : yIntOf(l)) && l.c !== 0);
    shown = fmtGeneral(L);
  }
  const ans = what === "m" ? slopeOf(L) : yIntOf(L);
  prompt = `What is the ${what === "m" ? "gradient" : "y-intercept"} of the line \`${shown}\`?`;
  const si = fmtSI(slopeOf(L), yIntOf(L));
  const explanation = `Rearrange into the form \`y = mx + c\`: \`${si}\`.\n\nThe ${what === "m" ? "gradient m (the number in front of x)" : "y-intercept c (the constant term)"} is **${fracStr(ans)}**.`;
  const hints = [
    "Rearrange so y is on its own: y = mx + c. Then m is the gradient and c is the y-intercept.",
    difficulty === "easy"
      ? `Divide every term by the number in front of y.`
      : `Move the x-term to the other side (change its sign), then divide everything by ${L.b}.`,
  ];
  const base = { prompt, explanation, hints, params: { kind: "coef", L, what } };
  if (difficulty === "easy") return finishNum(base, ans[0], [what === "m" ? -ans[0] : ans[0] * 2, what === "m" ? L.c / L.b * (L.b) : -ans[0], ans[0] * L.b, ans[0] + 1], rng, 0.3, WHOLE);
  return { ...base, prompt: prompt + FRAC, answer: fracStr(ans), answerType: "text" };
}

function qYAt(rng) {
  const m = nz(rng, -6, 6), c = rng.int(-10, 10), x0 = nz(rng, -8, 8);
  const L = lineSlopePoint([m, 1], [0, c]);
  const findY = rng.next() < 0.6;
  let prompt, explanation, ans, hints, params;
  if (findY) {
    ans = m * x0 + c;
    prompt = `The line \`${fmtSI([m, 1], [c, 1])}\` passes through the point (${x0}, y). What is y?`;
    explanation = `Substitute x = ${x0}: y = ${m} × ${par(x0)} ${c < 0 ? "−" : "+"} ${Math.abs(c)} = ${m * x0} ${c < 0 ? "−" : "+"} ${Math.abs(c)} = **${ans}**.`;
    hints = ["Substitute the x-value into the equation.", guard(`Work out ${m} × ${par(x0)} first, then ${c < 0 ? "subtract" : "add"} ${Math.abs(c)} (\`_m * _x + _c\`).`, "Multiply the gradient by the x-value first, then add the intercept (`_m * _x + _c`).", ans, prompt)];
    params = { kind: "yAt", L, x0 };
  } else {
    const xa = x0;
    const y0 = m * xa + c;
    ans = xa;
    prompt = `The line \`${fmtSI([m, 1], [c, 1])}\` passes through the point (x, ${y0}). What is x?`;
    explanation = `Substitute y = ${y0}: ${y0} = ${m}x ${c < 0 ? "−" : "+"} ${Math.abs(c)}, so ${m}x = ${y0 - c}, and x = ${y0 - c} ÷ ${par(m)} = **${ans}**.`;
    hints = ["Substitute the y-value and solve for x.", guard(`${c < 0 ? "Add" : "Subtract"} ${Math.abs(c)} on both sides, then divide by ${m} (\`(_y - _c) / _m\`).`, "Take the intercept away from both sides, then divide by the gradient (`(_y - _c) / _m`).", ans, prompt)];
    params = { kind: "xAt", L, y0 };
  }
  const given = findY ? [{ label: "_m", value: m }, { label: "_c", value: c }, { label: "_x", value: x0 }] : [{ label: "_m", value: m }, { label: "_c", value: c }, { label: "_y", value: m * x0 + c }];
  const base = { prompt, explanation, hints, given, params };
  return finishNum(base, ans, [findY ? m * x0 - c : (m * x0 + c + c) / m, findY ? m + x0 + c : -ans, findY ? -ans : ans * m, ans + 2], rng, 0.3, WHOLE);
}

function qEquationTwo(rng) {
  const [A, B] = twoPoints(rng, 8, (P, Q) => {
    const m = frac(Q[1] - P[1], Q[0] - P[0]);
    return isWhole(m) && m[0] !== 0 && Math.abs(m[0]) <= 6 && P[0] !== 0;
  });
  const L = lineThrough(A, B);
  const m = slopeOf(L)[0], c = yIntOf(L)[0];
  const answer = fmtSI([m, 1], [c, 1]);
  const cands = [
    fmtSI([m, 1], [A[1] + m * A[0], 1]), // sign slip working out c
    fmtSI([-m, 1], [c, 1]), // gradient sign
    fmtSI([m, 1], [A[1], 1]), // used y1 as the intercept
    fmtSI([c === 0 ? m + 1 : c, 1], [m, 1]), // swapped m and c
    fmtSI([m, 1], [-c, 1]),
  ].filter((s) => !(onLineGen(lineFromSI(s), A) && onLineGen(lineFromSI(s), B)));
  const choices = pickChoices(answer, cands, rng);
  const prompt = `Which is the equation of the line through ${pt(A)} and ${pt(B)}?`;
  const explanation = `${gradExplain(A, B)}\n\nThen substitute ${pt(A)} into y = ${m}x + c: ${num(A[1])} = ${m} × ${par(A[0])} + c, so c = ${num(A[1])} − ${par(m * A[0])} = ${c}.\n\nThe line is **${answer}**.`;
  const hints = [
    "Find the gradient first: (y2 − y1) ÷ (x2 − x1).",
    `Then put one of the points into y = mx + c and solve for c, for example ${num(A[1])} = m × ${par(A[0])} + c.`,
    "Check your answer: both points must fit the equation.",
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, given: givenPts([A, B]), params: { kind: "eq", pts: [A, B] } };
}

// "y = 2x - 3" (whole m and c only) -> { a, b, c } (generation helper for filtering distractors).
function lineFromSI(s) {
  const L = parseLine(s);
  return L ? normLine(L.a, L.b, L.c) : { a: 0, b: 0, c: 1 };
}

function qEquationGeneral(rng) {
  const [A, B] = twoPoints(rng, 9, (P, Q) => {
    const m = frac(Q[1] - P[1], Q[0] - P[0]);
    return !isWhole(m) && m[0] !== 0 && lineThrough(P, Q).c !== 0;
  });
  const L = lineThrough(A, B);
  const answer = fmtGeneral(L);
  const through = (a, b) => fmtGeneral(normLine(a, b, a * A[0] + b * A[1]));
  const cands = [
    through(L.b, L.a), // swapped coefficients, through A
    fmtGeneral(normLine(L.a, L.b, -L.c)),
    through(L.a, -L.b), // sign slip on the gradient
    fmtGeneral(normLine(L.a, L.b, L.a * B[1] + L.b * B[0])), // x and y swapped when substituting
    through(-L.b, L.a),
  ].filter((s) => {
    const l = parseLine(s);
    return !(l && Math.abs(l.a * A[0] + l.b * A[1] - l.c) < 1e-9 && Math.abs(l.a * B[0] + l.b * B[1] - l.c) < 1e-9);
  });
  const choices = pickChoices(answer, cands, rng);
  const m = slopeOf(L);
  const prompt = `Which is the equation of the line through ${pt(A)} and ${pt(B)}, written as ax + by = c with whole numbers?`;
  const explanation = `${gradExplain(A, B)}\n\nUse \`y - y1 = m(x - x1)\` with ${pt(A)}: y − ${par(A[1])} = ${fracStr(m)}(x − ${par(A[0])}).\n\nMultiply by ${m[1]} to clear the fraction and collect the terms: **${answer}**.\n\nCheck: ${L.a} × ${par(B[0])} + ${par(L.b)} × ${par(B[1])} = ${L.c}, so B fits too.`;
  const hints = [
    "Find the gradient as a fraction, then use y − y1 = m(x − x1).",
    `The gradient is (${num(B[1])} − ${par(A[1])}) / (${num(B[0])} − ${par(A[0])}). Multiply through by its denominator to clear the fraction, then move the x and y terms to one side.`,
    "Quick check: substitute both points into each option. Only one works for both.",
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, given: givenPts([A, B]), params: { kind: "eq", pts: [A, B] } };
}

function qLineMulti(rng) {
  const [A, B] = twoPoints(rng, 9, (P, Q) => !isWhole(frac(Q[1] - P[1], Q[0] - P[0])) && Q[1] !== P[1] && !isWhole(yIntOf(lineThrough(P, Q))));
  const L = lineThrough(A, B);
  const m = slopeOf(L), c = yIntOf(L);
  const prompt = `A line passes through ${pt(A)} and ${pt(B)}. Write its equation as y = mx + c.`;
  const explanation = `${gradExplain(A, B)}\n\nSubstitute ${pt(A)}: c = y − mx = ${num(A[1])} − ${fracStr(m)} × ${par(A[0])} = **${fracStr(c)}**.\n\nSo the line is \`${fmtSI(m, c)}\`.`;
  const parts = [
    { id: "m", label: "Gradient", ask: `The gradient m.${FRAC}`, answerType: "text", answer: fracStr(m), hint: `Change in y over change in x: (${num(B[1])} − ${par(A[1])}) / (${num(B[0])} − ${par(A[0])}), then simplify.` },
    { id: "c", label: "y-intercept", ask: `The y-intercept c.${FRAC}`, answerType: "text", answer: fracStr(c), hint: `Put ${pt(A)} into y = mx + c: c = ${num(A[1])} − m × ${par(A[0])}. Use a common denominator.` },
  ];
  return {
    prompt, answerType: "multi", parts, explanation, given: givenPts([A, B]),
    hints: ["Find the gradient first, then substitute one point to find c."],
    params: { multi: true, parts: [{ id: "m", kind: "coef", L, what: "m" }, { id: "c", kind: "coef", L, what: "c" }] },
  };
}

function qXIntercept(rng) {
  const [A, B] = twoPoints(rng, 9, (P, Q) => Q[1] !== P[1] && !isWhole(frac(lineThrough(P, Q).c, lineThrough(P, Q).a)) && lineThrough(P, Q).c !== 0);
  const L = lineThrough(A, B);
  const xi = frac(L.c, L.a);
  const prompt = `Where does the line through ${pt(A)} and ${pt(B)} cross the x-axis? Give the x-coordinate.${FRAC}`;
  const explanation = `The line through the points is \`${fmtGeneral(L)}\` (gradient ${fracStr(slopeOf(L))}, then substitute a point and clear fractions).\n\nOn the x-axis y = 0, so ${L.a}x = ${L.c} and x = **${fracStr(xi)}**.`;
  const hints = [
    "Find the equation of the line first, then set y = 0.",
    `The gradient is (${num(B[1])} − ${par(A[1])}) / (${num(B[0])} − ${par(A[0])}). Write y − ${par(A[1])} = m(x − ${par(A[0])}), put y = 0 and solve for x.`,
  ];
  return { prompt, answer: fracStr(xi), answerType: "text", explanation, hints, given: givenPts([A, B]), params: { kind: "coef", L, what: "x" } };
}

function genGradient(difficulty, rng) {
  const kind = rng.pick(
    { easy: ["grad", "grad", "rearr", "yAt", "yAt"], medium: ["grad", "rearr", "eq", "eq", "yAt"], hard: ["eqGen", "eqGen", "multi", "multi", "xInt", "grad"] }[difficulty]
  );
  if (kind === "grad") return qGradient(difficulty, rng);
  if (kind === "rearr") return qRearrange(difficulty, rng);
  if (kind === "yAt") return qYAt(rng);
  if (kind === "eq") return qEquationTwo(rng);
  if (kind === "eqGen") return qEquationGeneral(rng);
  if (kind === "multi") return qLineMulti(rng);
  return qXIntercept(rng);
}

// ---------------------------------------------------------------------------------------------
// Parallel & perpendicular

const REL_LABELS = { par: "Parallel", perp: "Perpendicular", neither: "Neither", same: "The same line" };
const REL_CHOICES = ["Parallel", "Perpendicular", "Neither", "The same line"];

// A gradient: whole (easy) or a simple fraction.
function drawSlope(rng, simple) {
  if (simple || rng.next() < 0.4) return [nz(rng, -5, 5), 1];
  return draw(() => frac(nz(rng, -6, 6), rng.int(2, 6)), (m) => m[1] > 1);
}
const perpOf = ([p, q]) => frac(-q, p);

function qClassify(difficulty, rng) {
  const rel = rng.pick(difficulty === "easy" ? ["par", "perp", "perp", "neither"] : ["par", "perp", "neither", "same"]);
  const m1 = drawSlope(rng, false);
  let m2;
  if (rel === "par" || rel === "same") m2 = m1;
  else if (rel === "perp") m2 = perpOf(m1);
  else m2 = draw(() => drawSlope(rng, false), (m) => !(m[0] === m1[0] && m[1] === m1[1]) && m[0] * m1[0] !== -m[1] * m1[1] && !(m[0] === -m1[0] && m[1] === m1[1]) && !(m[0] === m1[1] && m[1] === m1[0]));
  const c1 = rng.int(-8, 8);
  const c2 = rel === "same" ? c1 : draw(() => rng.int(-8, 8), (v) => v !== c1);
  const L1 = lineSlopePoint(m1, [0, c1]);
  const L2 = lineSlopePoint(m2, [0, c2]);
  // Medium: show at least one line in ax + by = c form (scaled, so "same line" isn't obvious).
  const show1 = fmtSI(m1, [c1, 1]);
  let show2 = fmtSI(m2, [c2, 1]);
  if (difficulty !== "easy") {
    const k = rng.pick([1, 2, 3, -1, -2]);
    show2 = fmtGeneral({ a: L2.a * k, b: L2.b * k, c: L2.c * k });
  }
  const prompt = `How are the lines \`${show1}\` and \`${show2}\` related?`;
  const s2 = slopeOf(L2);
  const rule = rel === "par" ? `The gradients are equal and the intercepts differ, so the lines are **parallel**.`
    : rel === "same" ? `The gradients and the intercepts are both equal, so this is **the same line** written two ways.`
    : rel === "perp" ? `${fracStr(m1)} × ${fracStr(s2)} = −1, so the lines are **perpendicular**.`
    : `The gradients are different and don't multiply to −1, so the answer is **neither**.`;
  const explanation = `Compare the gradients${difficulty !== "easy" ? " (rearrange the second line into y = mx + c first)" : ""}.\n\n- first line: m = ${fracStr(m1)}\n- second line: \`${fmtSI(s2, yIntOf(L2))}\`, so m = ${fracStr(s2)}\n\n${rule}`;
  const hints = [
    "Get both gradients. Equal gradients mean parallel (or the same line if the intercepts match too); gradients that multiply to −1 mean perpendicular.",
    difficulty === "easy" ? `The first gradient is ${fracStr(m1)}. Read off the second and compare.` : `Rearrange \`${show2}\` into y = mx + c to read its gradient and intercept.`,
  ];
  return { prompt, answer: REL_LABELS[rel], answerType: "choice", choices: REL_CHOICES.slice(), explanation, hints, params: { kind: "rel", L1, L2 } };
}

function qPerpGradient(difficulty, rng) {
  const m = difficulty === "easy" ? drawSlope(rng, true) : drawSlope(rng, false);
  const p = perpOf(m);
  const useGeneral = difficulty !== "easy";
  const L = lineSlopePoint(m, [0, rng.int(-6, 6)]);
  const shown = useGeneral ? fmtGeneral(L) : fmtSI(m, yIntOf(L));
  const prompt = `What is the gradient of a line perpendicular to \`${shown}\`?${FRAC}`;
  const explanation = `${useGeneral ? `Rearrange: \`${fmtSI(m, yIntOf(L))}\`, so the` : "The"} gradient of the given line is ${fracStr(m)}.\n\nPerpendicular gradients multiply to −1, so flip the fraction and change the sign: **${fracStr(p)}**.`;
  const hints = [
    `Find the gradient of the given line${useGeneral ? " by rearranging it into y = mx + c" : ""}.`,
    "Perpendicular gradients multiply to −1: take the negative reciprocal (flip the fraction and change its sign).",
  ];
  const base = { prompt, explanation, hints, params: { kind: "slopeRel", L, rel: "perp" } };
  if (rng.next() < 0.3) {
    const answer = fracStr(p);
    return { ...base, prompt: prompt.replace(FRAC, ""), answer, answerType: "choice", choices: pickChoices(answer, [fracStr(m), fracStr(frac(m[1], m[0])), fracStr(frac(-m[0], m[1])), fracStr(frac(-2 * m[1], m[0])), fracStr(frac(-m[1], 2 * m[0])), fracStr(frac(m[1] + 1, m[0]))], rng) };
  }
  return { ...base, answer: fracStr(p), answerType: "text" };
}

function qParallelGradient(rng) {
  const L = draw(() => normLine(nz(rng, -9, 9), nz(rng, -9, 9), rng.int(-15, 15)), (l) => Math.abs(l.b) > 1);
  const m = slopeOf(L);
  const prompt = `Line N is parallel to \`${fmtGeneral(L)}\`. What is the gradient of N?${FRAC}`;
  const explanation = `Parallel lines have the same gradient. Rearrange: \`${fmtSI(m, yIntOf(L))}\`, so the gradient is **${fracStr(m)}**.`;
  const hints = ["Parallel lines have equal gradients, so you only need the gradient of the given line.", `Move the x-term across and divide by ${L.b} to get y on its own.`];
  return { prompt, answer: fracStr(m), answerType: "text", explanation, hints, params: { kind: "slopeRel", L, rel: "par" } };
}

function qThroughPoint(rng) {
  const rel = rng.pick(["par", "perp"]);
  // The new gradient m is whole; the given line has gradient m (parallel) or -1/m (perpendicular).
  const m = nz(rng, -5, 5);
  const given = rel === "par" ? [m, 1] : perpOf([m, 1]);
  const L0 = lineSlopePoint(given, [rng.int(-4, 4), rng.int(-6, 6)]);
  const P = [nz(rng, -6, 6), rng.int(-8, 8)];
  const c = P[1] - m * P[0];
  const answer = fmtSI([m, 1], [c, 1]);
  const ok = (s) => {
    const l = lineFromSI(s);
    if (!onLineGen(l, P)) return false;
    return rel === "par" ? l.a * L0.b - L0.a * l.b === 0 : l.a * L0.a + l.b * L0.b === 0;
  };
  const cands = [
    fmtSI([m, 1], [P[1] + m * P[0], 1]),
    fmtSI([m, 1], [-c, 1]),
    rel === "perp" && isWhole(given) ? fmtSI(given, [P[1] - given[0] * P[0], 1]) : fmtSI([-m, 1], [P[1] + m * P[0], 1]),
    fmtSI([-m, 1], [c, 1]),
    fmtSI([m, 1], [P[1], 1]),
  ].filter((s) => !ok(s));
  const choices = pickChoices(answer, cands, rng);
  const shown = rng.next() < 0.5 ? fmtGeneral(L0) : fmtLine(L0);
  const prompt = `Which line passes through ${pt(P)} and is ${rel === "par" ? "parallel" : "perpendicular"} to \`${shown}\`?`;
  const explanation = `The given line has gradient ${fracStr(given)}. ${rel === "par" ? "A parallel line has the same gradient" : "A perpendicular line has the negative reciprocal gradient"}: m = ${m}.\n\nSubstitute ${pt(P)} into y = ${m}x + c: c = ${num(P[1])} − ${m} × ${par(P[0])} = ${c}.\n\nSo the line is **${answer}**.`;
  const hints = [
    `Find the gradient of the given line, then ${rel === "par" ? "keep it the same" : "take its negative reciprocal"}.`,
    `Use that gradient and the point ${pt(P)} in y = mx + c to find c: c = ${num(P[1])} − m × ${par(P[0])}.`,
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, given: [{ label: "_x1", value: P[0] }, { label: "_y1", value: P[1] }], params: { kind: "through", L0, P, rel } };
}

function qBisector(rng) {
  const [A, B] = draw(
    () => [[rng.int(-8, 8), rng.int(-8, 8)], [rng.int(-8, 8), rng.int(-8, 8)]],
    ([P, Q]) => (P[0] + Q[0]) % 2 === 0 && (P[1] + Q[1]) % 2 === 0 && P[0] !== Q[0] && P[1] !== Q[1]
  );
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = normLine(dx, dy, dx * M[0] + dy * M[1]);
  const answer = fmtGeneral(L);
  const cands = [
    fmtGeneral(normLine(dy, -dx, dy * M[0] - dx * M[1])), // through M along AB
    fmtGeneral(normLine(dx, dy, dx * A[0] + dy * A[1])), // perpendicular, but through A
    fmtGeneral(normLine(dx, -dy, dx * M[0] - dy * M[1])), // sign slip
    fmtGeneral(normLine(dx, dy, dx * (dx / 2) + dy * (dy / 2) || 1)), // half the differences used as the midpoint
    fmtGeneral(normLine(dx, dy, dx * B[0] + dy * B[1])),
  ];
  const choices = pickChoices(answer, cands, rng);
  const m = frac(dy, dx);
  const prompt = `A = ${pt(A)} and B = ${pt(B)}. Which is the equation of the perpendicular bisector of AB?`;
  const explanation = `The perpendicular bisector goes through the midpoint of AB at right angles to it.\n\n- midpoint M = ${pt(M)}\n- gradient of AB = ${dy} / ${par(dx)} = ${fracStr(m)}, so the bisector's gradient is ${fracStr(perpOf(m))}\n\nThrough M with that gradient, and cleared of fractions: **${answer}**.`;
  const hints = [
    "You need two things: the midpoint of AB, and a gradient perpendicular to AB.",
    `The midpoint is ${pt(M)}. AB has gradient ${fracStr(m)}, so use its negative reciprocal. Then check which option M fits.`,
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, given: givenPts([A, B]), params: { kind: "bisector", A, B } };
}

function qFindKLine(rng) {
  const rel = rng.pick(["par", "perp"]);
  const L2 = draw(() => normLine(nz(rng, -7, 7), nz(rng, -7, 7), rng.int(-12, 12)), (l) => Math.abs(l.b) > 1 && Math.abs(l.a) > 1);
  const c1 = nz(rng, -9, 9);
  // y = kx + c1 has gradient k.
  const k = rel === "par" ? slopeOf(L2) : perpOf(slopeOf(L2));
  const prompt = `For what value of k is the line \`y = kx ${c1 < 0 ? "-" : "+"} ${Math.abs(c1)}\` ${rel === "par" ? "parallel" : "perpendicular"} to \`${fmtGeneral(L2)}\`?${FRAC}`;
  const explanation = `Rearrange \`${fmtGeneral(L2)}\`: \`${fmtSI(slopeOf(L2), yIntOf(L2))}\`, so its gradient is ${fracStr(slopeOf(L2))}.\n\nThe gradient of y = kx ${c1 < 0 ? "-" : "+"} ${Math.abs(c1)} is k, so ${rel === "par" ? "k must equal it" : "k must be its negative reciprocal"}: k = **${fracStr(k)}**.`;
  const hints = [
    `The line y = kx ${c1 < 0 ? "-" : "+"} ${Math.abs(c1)} has gradient k. Find the gradient of the other line by getting y on its own.`,
    rel === "par" ? "Parallel lines have equal gradients." : "Perpendicular gradients multiply to −1: flip the fraction and change its sign.",
  ];
  return { prompt, answer: fracStr(k), answerType: "text", explanation, hints, params: { kind: "kLine", L2, rel } };
}

function qPerpMulti(rng) {
  const L0 = draw(() => normLine(nz(rng, -7, 7), nz(rng, -7, 7), rng.int(-12, 12)), (l) => Math.abs(l.a) > 1);
  const mPerp = perpOf(slopeOf(L0));
  const P = draw(() => [nz(rng, -6, 6), rng.int(-8, 8)], ([x, y]) => !isWhole(frac(y * mPerp[1] - mPerp[0] * x, mPerp[1])) || isWhole(mPerp));
  const N = lineSlopePoint(mPerp, P);
  const c = yIntOf(N);
  const prompt = `Line N is perpendicular to \`${fmtGeneral(L0)}\` and passes through ${pt(P)}. Write N as y = mx + c.`;
  const explanation = `Rearrange \`${fmtGeneral(L0)}\`: gradient ${fracStr(slopeOf(L0))}. The perpendicular gradient is its negative reciprocal, **${fracStr(mPerp)}**.\n\nSubstitute ${pt(P)}: c = ${num(P[1])} − ${fracStr(mPerp)} × ${par(P[0])} = **${fracStr(c)}**.\n\nSo N is \`${fmtSI(mPerp, c)}\`.`;
  const parts = [
    { id: "m", label: "Gradient", ask: `The gradient of N.${FRAC}`, answerType: "text", answer: fracStr(mPerp), hint: `Get y on its own in \`${fmtGeneral(L0)}\` to read its gradient, then take the negative reciprocal.` },
    { id: "c", label: "y-intercept", ask: `The y-intercept of N.${FRAC}`, answerType: "text", answer: fracStr(c), hint: `Substitute ${pt(P)} into y = mx + c with N's gradient: c = ${num(P[1])} − m × ${par(P[0])}.` },
  ];
  return {
    prompt, answerType: "multi", parts, explanation, given: [{ label: "_x1", value: P[0] }, { label: "_y1", value: P[1] }],
    hints: ["Find N's gradient from the given line first; then use the point to find c."],
    params: { multi: true, parts: [{ id: "m", kind: "slopeRel", L: L0, rel: "perp" }, { id: "c", kind: "perpC", L0, P }] },
  };
}

function genParallel(difficulty, rng) {
  const kind = rng.pick(
    { easy: ["rel", "rel", "perpGrad", "perpGrad"], medium: ["rel", "perpGrad", "parGrad", "through", "through"], hard: ["bisector", "bisector", "findK", "multi", "multi", "through"] }[difficulty]
  );
  if (kind === "rel") return qClassify(difficulty, rng);
  if (kind === "perpGrad") return qPerpGradient(difficulty, rng);
  if (kind === "parGrad") return qParallelGradient(rng);
  if (kind === "through") return qThroughPoint(rng);
  if (kind === "bisector") return qBisector(rng);
  if (kind === "findK") return qFindKLine(rng);
  return qPerpMulti(rng);
}

// ---------------------------------------------------------------------------------------------
// Intersections

function qAxis(rng) {
  const axis = rng.pick(["x", "y"]);
  const general = rng.next() < 0.5;
  let L, ans;
  if (general) {
    L = draw(() => {
      const a = nz(rng, -6, 6), b = nz(rng, -6, 6), xi = nz(rng, -6, 6), yi = nz(rng, -6, 6);
      return { a, b, c: axis === "x" ? a * xi : b * yi, xi, yi };
    }, (l) => gcd(gcd(l.a, l.b), l.c) === 1 && l.c !== 0);
    ans = axis === "x" ? L.c / L.a : L.c / L.b;
    L = { a: L.a, b: L.b, c: L.c };
  } else {
    const m = nz(rng, -5, 5), xi = nz(rng, -8, 8);
    const c = axis === "x" ? -m * xi : rng.int(-10, 10) || 3;
    L = lineSlopePoint([m, 1], [0, c]);
    ans = axis === "x" ? xi : c;
  }
  const shown = general ? fmtGeneral(L) : fmtLine(L);
  const pChoice = rng.next() < 0.35;
  const point = axis === "x" ? [ans, 0] : [0, ans];
  const prompt = pChoice
    ? `At which point does \`${shown}\` cross the ${axis}-axis?`
    : `Where does \`${shown}\` cross the ${axis}-axis? Give the ${axis}-coordinate of that point.`;
  const explanation = `On the ${axis}-axis, ${axis === "x" ? "y" : "x"} = 0. Substitute it into \`${shown}\` and solve: ${axis} = **${num(ans)}**, so the point is ${pt(point)}.`;
  const hints = [
    `Every point on the ${axis}-axis has ${axis === "x" ? "y" : "x"} = 0.`,
    `Put ${axis === "x" ? "y" : "x"} = 0 into \`${shown}\` and solve for ${axis}.`,
  ];
  const given = general
    ? [{ label: "_a", value: L.a }, { label: "_b", value: L.b }, { label: "_c", value: L.c }]
    : [{ label: "_m", value: slopeOf(L)[0] }, { label: "_c", value: yIntOf(L)[0] }];
  const base = { prompt, explanation, hints, given, params: { kind: pChoice ? "axisPt" : "axisVal", L, axis } };
  if (pChoice) {
    const answer = pt(point);
    const sw = axis === "x" ? [0, ans] : [ans, 0];
    const other = axis === "x" ? [0, L.b !== 0 ? L.c / L.b : 1] : [L.a !== 0 ? L.c / L.a : 1, 0];
    const whole = (P) => Number.isInteger(P[0]) && Number.isInteger(P[1]);
    const choices = pickChoices(answer, [pt(sw), whole(other) ? pt(other) : null, pt([-point[0], -point[1]]), pt([point[0] + (axis === "x" ? 1 : 0), point[1] + (axis === "y" ? 1 : 0)]), pt([point[0] * 2, point[1] * 2])], rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: prompt + WHOLE, answer: ans, answerType: "number", tolerance: 0 };
}

function twoLinesThrough(rng, P) {
  const m1 = nz(rng, -4, 4);
  const m2 = draw(() => nz(rng, -4, 4), (v) => v !== m1);
  const L1 = lineSlopePoint([m1, 1], P);
  const L2 = draw(() => {
    const l = lineSlopePoint([m2, 1], P);
    const k = rng.pick([1, 2, -1]);
    return { a: l.a * k, b: l.b * k, c: l.c * k };
  }, () => true);
  return { L1, L2, m1, m2 };
}

function qTwoLines(difficulty, rng) {
  const P = [rng.int(-7, 7), rng.int(-9, 9)];
  const { L1, L2 } = twoLinesThrough(rng, P);
  const s1 = fmtLine(L1);
  const s2 = difficulty === "easy" ? fmtLine(normLine(L2.a, L2.b, L2.c)) : fmtGeneral(L2);
  const lead = `Where do the lines \`${s1}\` and \`${s2}\` meet?`;
  const m1 = slopeOf(L1)[0], c1 = yIntOf(L1)[0];
  const explanation = `Substitute \`${s1}\` into the second equation and solve for x, then put x back in.\n\nThis gives x = ${P[0]}, and y = ${m1} × ${par(P[0])} ${c1 < 0 ? "−" : "+"} ${Math.abs(c1)} = ${P[1]}.\n\nThe lines meet at **${pt(P)}**. Check: ${L2.a} × ${par(P[0])} + ${par(L2.b)} × ${par(P[1])} = ${L2.c}.`;
  const hints = [
    "At the meeting point both equations are true, so replace y in one equation with the expression from the other.",
    `Put y = ${fmtLine(L1).slice(4)} into \`${s2}\`, collect the x-terms and solve. Then find y.`,
  ];
  const L2n = normLine(L2.a, L2.b, L2.c);
  const given = [{ label: "_m1", value: m1 }, { label: "_c1", value: c1 }].concat(
    difficulty === "easy"
      ? [{ label: "_m2", value: slopeOf(L2n)[0] }, { label: "_c2", value: yIntOf(L2n)[0] }]
      : [{ label: "_a", value: L2.a }, { label: "_b", value: L2.b }, { label: "_c", value: L2.c }]
  );
  if (rng.next() < 0.45) {
    const answer = pt(P);
    const choices = pickChoices(answer, [pt([P[1], P[0]]), pt([-P[0], P[1]]), pt([P[0], -P[1]]), pt([P[0] + 1, P[1] + m1]), pt([0, c1])], rng);
    return { prompt: lead, answer, answerType: "choice", choices, explanation, hints, given, params: { kind: "meetPt", L1, L2 } };
  }
  const parts = [
    { id: "x", label: "x-coordinate", ask: `x-coordinate of the meeting point.${WHOLE}`, answerType: "number", answer: P[0], tolerance: 0, hint: "Substitute one equation into the other so only x is left, then solve." },
    { id: "y", label: "y-coordinate", ask: `y-coordinate of the meeting point.${WHOLE}`, answerType: "number", answer: P[1], tolerance: 0, hint: `Put your x into \`${s1}\`.` },
  ];
  return {
    prompt: lead, answerType: "multi", parts, explanation, hints: [hints[0]], given,
    params: { multi: true, parts: [{ id: "x", kind: "meetX", L1, L2 }, { id: "y", kind: "meetY", L1, L2 }] },
  };
}

// Lattice points on x² + y² = r2.
function latticeCircle(r2) {
  const out = [];
  const r = Math.floor(Math.sqrt(r2));
  for (let x = -r; x <= r; x++) {
    const y2 = r2 - x * x;
    const y = Math.round(Math.sqrt(y2));
    if (y * y === y2) {
      out.push([x, y]);
      if (y !== 0) out.push([x, -y]);
    }
  }
  return out;
}
const R2S = [25, 50, 65, 85, 100, 169, 130, 145];
const pairStr = (P, Q) => (P[0] < Q[0] ? `${pt(P)} and ${pt(Q)}` : `${pt(Q)} and ${pt(P)}`);

function qCircle(rng) {
  const r2 = rng.pick(R2S);
  const lat = latticeCircle(r2);
  const [P, Q] = draw(() => rng.shuffle(lat).slice(0, 2), ([p, q]) => p[0] !== q[0] && Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 2);
  const L = lineThrough(P, Q);
  const answer = pairStr(P, Q);
  const onL = (X) => onLineGen(L, X);
  const cands = [
    pairStr([-P[0], -P[1]], [-Q[0], -Q[1]]),
    pairStr([P[1], P[0]], [Q[1], Q[0]]),
    pairStr([P[0], -P[1]], [Q[0], -Q[1]]),
    pairStr(P, [Q[0], -Q[1]]),
    pairStr([-P[0], P[1]], Q),
  ];
  // Other pairs of lattice points on the same circle (all on the circle, not both on the line).
  for (let i = 0; i < lat.length; i++) for (let j = i + 1; j < lat.length; j++) cands.push(pairStr(lat[i], lat[j]));
  const good = cands.filter((s) => {
    const pts = s.match(/-?\d+/g).map(Number);
    return !(onL([pts[0], pts[1]]) && onL([pts[2], pts[3]])) && pts[0] !== pts[2];
  });
  const choices = pickChoices(answer, good, rng);
  const shown = fmtLine(L);
  const prompt = `The line \`${shown}\` meets the circle \`x² + y² = ${r2}\` at two points. Which pair is it? (Each pair lists the point with the smaller x first.)`;
  const explanation = `Substitute the line into the circle and solve the quadratic, or test each option: both points must satisfy both equations.\n\n- ${pt(P)}: ${P[0] * P[0]} + ${P[1] * P[1]} = ${r2} ✓, and it lies on the line ✓\n- ${pt(Q)}: ${Q[0] * Q[0]} + ${Q[1] * Q[1]} = ${r2} ✓, and it lies on the line ✓\n\nSo the line meets the circle at **${answer}**.`;
  const hints = [
    "A meeting point lies on both the line and the circle, so it must satisfy both equations.",
    `Substitute the line into x² + y² = ${r2} and solve, or check each option: every point must give x² + y² = ${r2} AND fit \`${shown}\`.`,
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, params: { kind: "circle", r2, L } };
}

function qArea(rng) {
  const pts = draw(
    () => [0, 1, 2].map(() => [rng.int(-8, 8), rng.int(-8, 8)]),
    (p) => Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])) >= 6
  );
  const [[x1, y1], [x2, y2], [x3, y3]] = pts;
  const s = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
  const area = Math.abs(s) / 2;
  const prompt = rng.pick([
    `Find the area of the triangle with vertices ${pt(pts[0])}, ${pt(pts[1])} and ${pt(pts[2])}.`,
    `A triangular garden has corners at ${pt(pts[0])}, ${pt(pts[1])} and ${pt(pts[2])} on a grid marked in metres. What is its area, in m²?`,
  ]);
  const explanation = `Use the shoelace formula: \`Area = |x1(y2 - y3) + x2(y3 - y1) + x3(y1 - y2)| / 2\`.\n\n= |${x1} × ${par(y2 - y3)} + ${x2} × ${par(y3 - y1)} + ${x3} × ${par(y1 - y2)}| / 2 = |${s}| / 2 = **${num(area)}**.`;
  const hints = [
    "Use the shoelace formula: Area = |x1(y2 − y3) + x2(y3 − y1) + x3(y1 − y2)| ÷ 2. (Or draw a box round the triangle and subtract the corner triangles.)",
    `In the calculator: \`abs(_x1 * (_y2 - _y3) + _x2 * (_y3 - _y1) + _x3 * (_y1 - _y2)) / 2\`. Don't forget to halve.`,
  ];
  const base = { prompt, explanation, hints, given: givenPts(pts), params: { kind: "area", pts } };
  return finishNum(base, area, [Math.abs(s), area + 0.5, area * 2 + 1, Math.abs(s) / 4], rng, 0.25, EXACT);
}

function qAxesMulti(rng) {
  const { L, xi, yi } = draw(
    () => {
      const xi = nz(rng, -9, 9), yi = nz(rng, -9, 9);
      const L = normLine(yi, xi, xi * yi); // x/xi + y/yi = 1
      return { L, xi, yi };
    },
    ({ L }) => L.a !== 1 || L.b !== 1
  );
  const area = Math.abs(xi * yi) / 2;
  const prompt = `The line \`${fmtGeneral(L)}\` and the two axes make a triangle.`;
  const explanation = `- x-axis (y = 0): ${L.a}x = ${L.c}, so x = **${xi}**.\n- y-axis (x = 0): ${L.b}y = ${L.c}, so y = **${yi}**.\n\nThe triangle has a right angle at the origin, with legs ${Math.abs(xi)} and ${Math.abs(yi)}, so its area is ${Math.abs(xi)} × ${Math.abs(yi)} ÷ 2 = **${num(area)}**.`;
  const parts = [
    { id: "xi", label: "x-intercept", ask: `x-coordinate where the line crosses the x-axis.${WHOLE}`, answerType: "number", answer: xi, tolerance: 0, hint: "Set y = 0 and solve for x." },
    { id: "yi", label: "y-intercept", ask: `y-coordinate where the line crosses the y-axis.${WHOLE}`, answerType: "number", answer: yi, tolerance: 0, hint: "Set x = 0 and solve for y." },
    { id: "area", label: "Area", ask: `Area of the triangle.${EXACT}`, answerType: "number", answer: area, tolerance: 0, hint: "It's a right triangle at the origin: half of base × height, using the sizes (ignore minus signs) of the two intercepts." },
  ];
  return {
    prompt, answerType: "multi", parts, explanation, given: [{ label: "_a", value: L.a }, { label: "_b", value: L.b }, { label: "_c", value: L.c }],
    hints: ["The triangle's corners are the origin and the two points where the line crosses the axes."],
    params: { multi: true, parts: [{ id: "xi", kind: "axisVal", L, axis: "x" }, { id: "yi", kind: "axisVal", L, axis: "y" }, { id: "area", kind: "axesArea", L }] },
  };
}

function genIntersections(difficulty, rng) {
  const kind = rng.pick(
    { easy: ["axis", "axis", "axis", "two"], medium: ["two", "two", "two", "axis"], hard: ["circle", "circle", "area", "area", "axes", "axes"] }[difficulty]
  );
  if (kind === "axis") return qAxis(rng);
  if (kind === "two") return qTwoLines(difficulty, rng);
  if (kind === "circle") return qCircle(rng);
  if (kind === "area") return qArea(rng);
  return qAxesMulti(rng);
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "points-distance") return genPoints(difficulty, rng);
  if (subtopic === "gradient-lines") return genGradient(difficulty, rng);
  if (subtopic === "parallel-perpendicular") return genParallel(difficulty, rng);
  if (subtopic === "intersections") return genIntersections(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------
// Independent check

// One side of an equation: "-(3/4)x + 2y - 5" -> { x, y, k }.
function parseSide(str) {
  const s = String(str).replace(/\s+/g, "");
  if (!s) return null;
  const out = { x: 0, y: 0, k: 0 };
  const re = /([+-]?)(\((\d+)\/(\d+)\)|\d+(?:\/\d+)?)?([xy]?)/y;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || m[0] === "" || (!m[2] && !m[5])) return null;
    if (pos > 0 && !m[1]) return null; // terms after the first need a sign
    let val = 1;
    if (m[3]) val = Number(m[3]) / Number(m[4]);
    else if (m[2]) {
      const [n, d] = m[2].split("/");
      val = Number(n) / (d ? Number(d) : 1);
    }
    out[m[5] || "k"] += (m[1] === "-" ? -1 : 1) * val;
    pos = re.lastIndex;
  }
  return out;
}
// "y = 2x - 3" or "2x + 3y = 12" -> { a, b, c } meaning ax + by = c.
function parseLine(str) {
  const sides = String(str).split("=");
  if (sides.length !== 2) return null;
  const L = parseSide(sides[0]), R = parseSide(sides[1]);
  if (!L || !R) return null;
  return { a: L.x - R.x, b: L.y - R.y, c: R.k - L.k };
}
const fits = (l, [x, y]) => Math.abs(l.a * x + l.b * y - l.c) < 1e-9;
const parsePt = (s) => {
  const m = String(s).match(/^\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
// Text answer: a whole number or a fraction in simplest form ("-3/4"; never "6/8", "3/1" or "3/-4").
function parseFracAnswer(v) {
  const m = String(v ?? "").trim().match(/^(-?)(\d+)(?:\/(\d+))?$/);
  if (!m) return null;
  const n = Number(m[2]), d = m[3] ? Number(m[3]) : 1;
  if (d === 0 || (m[3] && d === 1) || gcd(n, d) !== 1 || (m[1] && n === 0)) return null;
  return [m[1] ? -n : n, d];
}
const sqd = (P, Q) => (P[0] - Q[0]) ** 2 + (P[1] - Q[1]) ** 2;
const numVal = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
// A line's direction vector (b, -a) and the relations between two lines via their normals (a, b).
const parallelN = (l1, l2) => Math.abs(l1.a * l2.b - l2.a * l1.b) < 1e-9;
const perpN = (l1, l2) => Math.abs(l1.a * l2.a + l1.b * l2.b) < 1e-9;
// Candidate gradient p/q as a line normal: y = (p/q)x -> p·x - q·y = 0.
const slopeLine = ([p, q]) => ({ a: p, b: -q, c: 0 });

function okValue(p, v) {
  switch (p.kind) {
    case "mid": {
      const M = parsePt(v);
      if (!M) return false;
      const ab = sqd(p.A, p.B);
      return 4 * sqd(p.A, M) === ab && 4 * sqd(M, p.B) === ab; // equal halves of AB
    }
    case "half": { const x = numVal(v); return Number.isFinite(x) && x - p.a === p.b - x; }
    case "endPart": { const x = numVal(v); return Number.isFinite(x) && x - p.m === p.m - p.a; }
    case "dist": {
      const x = numVal(v);
      if (!(x > 0)) return false;
      const d2 = sqd(p.A, p.B);
      if (!p.rounded) return Number.isInteger(x) && x * x === d2;
      return (x - 0.005) ** 2 <= d2 && d2 <= (x + 0.005) ** 2;
    }
    case "surd": {
      const m = String(v).match(/^(\d*)√(\d+)$/) || String(v).match(/^(\d+)()$/);
      if (!m) return false;
      const s = m[1] ? Number(m[1]) : 1, r = m[2] ? Number(m[2]) : 1;
      for (let k = 2; k * k <= r; k++) if (r % (k * k) === 0) return false; // must be fully simplified
      return s * s * r === p.d2;
    }
    case "right": {
      const pts = p.pts;
      const at = [0, 1, 2].filter((i) => {
        const V = pts[i], P = pts[(i + 1) % 3], Q = pts[(i + 2) % 3];
        return (P[0] - V[0]) * (Q[0] - V[0]) + (P[1] - V[1]) * (Q[1] - V[1]) === 0; // dot product
      });
      const truth = at.length === 1 ? RIGHT_LABELS[at[0]] : at.length === 0 ? RIGHT_LABELS[3] : null;
      return truth !== null && String(v) === truth;
    }
    case "findK": {
      const x = numVal(v);
      return Number.isInteger(x) && x > p.x1 && (x - p.x1) ** 2 + (p.y2 - p.y1) ** 2 === p.d * p.d;
    }
    case "perim": {
      const x = numVal(v);
      if (!Number.isFinite(x)) return false;
      const per = [0, 1, 2].reduce((s, i) => s + Math.hypot(p.pts[(i + 1) % 3][0] - p.pts[i][0], p.pts[(i + 1) % 3][1] - p.pts[i][1]), 0);
      return Math.abs(x - per) <= 0.005 + 1e-9;
    }
    case "grad": {
      const f = parseFracAnswer(v);
      if (!f) return false;
      // Both points on y = (p/q)x + k for one k: q·(y2 - y1) = p·(x2 - x1).
      return f[1] * (p.B[1] - p.A[1]) === f[0] * (p.B[0] - p.A[0]);
    }
    case "coef": {
      const f = parseFracAnswer(v);
      if (!f) return false;
      const { a, b, c } = p.L;
      if (p.what === "m") return fits(slopeLine(f), [b, -a]) && b !== 0; // direction (b, -a) has slope f
      if (p.what === "c") return b !== 0 && Math.abs(b * f[0] - c * f[1]) < 1e-9; // (0, f) is on the line
      return a !== 0 && Math.abs(a * f[0] - c * f[1]) < 1e-9; // (f, 0) is on the line
    }
    case "yAt": { const y = numVal(v); return Number.isFinite(y) && fits(p.L, [p.x0, y]); }
    case "xAt": { const x = numVal(v); return Number.isFinite(x) && fits(p.L, [x, p.y0]); }
    case "eq": {
      const l = parseLine(v);
      return !!l && (l.a !== 0 || l.b !== 0) && p.pts.every((P) => fits(l, P));
    }
    case "rel": {
      const { L1, L2 } = p;
      const par = parallelN(L1, L2);
      const same = par && Math.abs(L1.a * L2.c - L2.a * L1.c) < 1e-9 && Math.abs(L1.b * L2.c - L2.b * L1.c) < 1e-9;
      const truth = same ? REL_LABELS.same : par ? REL_LABELS.par : perpN(L1, L2) ? REL_LABELS.perp : REL_LABELS.neither;
      return String(v) === truth;
    }
    case "slopeRel": {
      const f = parseFracAnswer(v);
      if (!f) return false;
      const l = slopeLine(f);
      return p.rel === "par" ? parallelN(l, p.L) : perpN(l, p.L);
    }
    case "through": {
      const l = parseLine(v);
      if (!l || (l.a === 0 && l.b === 0) || !fits(l, p.P)) return false;
      return p.rel === "par" ? parallelN(l, p.L0) : perpN(l, p.L0);
    }
    case "bisector": {
      const l = parseLine(v);
      if (!l || (l.a === 0 && l.b === 0)) return false;
      // Two points on the candidate line must each be equally far from A and B.
      const on = l.b !== 0 ? [[0, l.c / l.b], [1, (l.c - l.a) / l.b]] : [[l.c / l.a, 0], [l.c / l.a, 1]];
      return on.every((X) => Math.abs(sqd(X, p.A) - sqd(X, p.B)) < 1e-9);
    }
    case "kLine": {
      const f = parseFracAnswer(v);
      if (!f) return false;
      const l = slopeLine(f); // y = kx + c1 has the same direction as y = kx
      return p.rel === "par" ? parallelN(l, p.L2) : perpN(l, p.L2);
    }
    case "perpC": {
      const f = parseFracAnswer(v);
      if (!f) return false;
      // N passes through P and (0, f), and is perpendicular to L0.
      const [x0, y0] = p.P;
      const dir = [x0, y0 - f[0] / f[1]]; // from (0, f) to P
      // Perpendicular to L0 means running along L0's normal (a, b).
      return x0 !== 0 && Math.abs(dir[0] * p.L0.b - dir[1] * p.L0.a) < 1e-9;
    }
    case "axisVal": {
      const x = numVal(v);
      if (!Number.isFinite(x)) return false;
      return fits(p.L, p.axis === "x" ? [x, 0] : [0, x]);
    }
    case "axisPt": {
      const P = parsePt(v);
      return !!P && fits(p.L, P) && (p.axis === "x" ? P[1] === 0 : P[0] === 0);
    }
    case "meetPt": {
      const P = parsePt(v);
      return !!P && fits(p.L1, P) && fits(p.L2, P);
    }
    case "meetX": {
      const x = numVal(v);
      if (!Number.isFinite(x)) return false;
      const ly = p.L1.b !== 0 ? p.L1 : p.L2, other = ly === p.L1 ? p.L2 : p.L1;
      return fits(other, [x, (ly.c - ly.a * x) / ly.b]);
    }
    case "meetY": {
      const y = numVal(v);
      if (!Number.isFinite(y)) return false;
      const lx = p.L1.a !== 0 ? p.L1 : p.L2, other = lx === p.L1 ? p.L2 : p.L1;
      return fits(other, [(lx.c - lx.b * y) / lx.a, y]);
    }
    case "circle": {
      const nums = String(v).match(/^\((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)$/);
      if (!nums) return false;
      const P = [Number(nums[1]), Number(nums[2])], Q = [Number(nums[3]), Number(nums[4])];
      if (P[0] === Q[0] && P[1] === Q[1]) return false;
      return [P, Q].every((X) => X[0] * X[0] + X[1] * X[1] === p.r2 && fits(p.L, X));
    }
    case "area": {
      const x = numVal(v);
      if (!(x > 0)) return false;
      // Heron's formula in whole numbers: 16·A² = 2(a²b² + b²c² + c²a²) - (a⁴ + b⁴ + c⁴), with a², b², c² the squared sides.
      const [A, B, C] = p.pts;
      const a2 = sqd(B, C), b2 = sqd(A, C), c2 = sqd(A, B);
      const s16 = 2 * (a2 * b2 + b2 * c2 + c2 * a2) - (a2 * a2 + b2 * b2 + c2 * c2);
      return Math.abs(16 * x * x - s16) < 1e-6;
    }
    case "axesArea": {
      const x = numVal(v);
      if (!(x > 0)) return false;
      // Count it as half the rectangle spanned by the two crossing points.
      const xi = p.L.c / p.L.a, yi = p.L.c / p.L.b;
      return Math.abs(2 * x - Math.abs(xi) * Math.abs(yi)) < 1e-9;
    }
    default:
      return false;
  }
}

function checkOne(spec, answer, answerType, choices) {
  if (answer === "" || answer === null || answer === undefined) return false;
  if (answerType === "choice") {
    if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices.map(String)).size !== 4) return false;
    if (!choices.map(String).includes(String(answer))) return false;
    if (choices.filter((c) => okValue(spec, c)).length !== 1) return false;
  }
  return okValue(spec, answer);
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false; // regenerate from the seed to get params back
  if (p.multi) {
    if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
    if (p.parts.length !== question.parts.length) return false;
    return p.parts.every((spec) => {
      const part = question.parts.find((x) => x.id === spec.id);
      return part && checkOne(spec, answer[spec.id], part.answerType, part.choices);
    });
  }
  return checkOne(p, answer, question.answerType, question.choices);
}
