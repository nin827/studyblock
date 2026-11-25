// Collision generator (Game Dev). Uses only the seeded rng passed in by the engine.
// One edge rule for the whole module, stated in every question it affects:
// touching (sharing only an edge, a corner or a single point) does NOT count as overlapping.
// verify() is independent of the generating formulas: brute-force sampling on a fine grid for boxes
// and tiles, unsquared vs squared distances for circles, and bisection for rays.

// ---------- number helpers ----------

const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const fix0 = (n) => (Object.is(n, -0) ? 0 : n);
function num(n) {
  return String(fix0(Math.round(n * 10000) / 10000));
}
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
function fmtAns(n, rounded) {
  const r = fix0(round2(n));
  return rounded ? r.toFixed(2) : String(r);
}
function res(exact, rounded, unit = "") {
  const u = unit ? ` ${unit}` : "";
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
const tenth = (rng, lo, hi) => rng.int(lo * 10, hi * 10) / 10;
const sq = (n) => n * n;

const END = " Round to 2 decimal places.";
const THEN = " Then round to 2 decimal places.";
const YUP = "Axes: +x is right and +y is up.";
const EDGE = "Rule: touching (sharing only an edge or a corner) does NOT count as overlapping; the shared area must be more than 0.";
const CEDGE = "Rule: touching (distance exactly equal to the limit) does NOT count as overlapping.";
const GRID = (s) =>
  `The map uses screen coordinates: x grows right and **y grows down**. Tiles are ${s} px squares; tile (col 0, row 0) is the top-left one, and tile (col, row) covers col×${s} ≤ x < (col+1)×${s} and row×${s} ≤ y < (row+1)×${s}, so a point exactly on a grid line belongs to the tile to its right or below it.`;

const YES = "Yes";
const NO = "No";
const REASONS = [
  "They overlap on both axes",
  "Their x ranges don't overlap",
  "Their y ranges don't overlap",
  "They only touch along an edge",
];
const PUSH = ["Push A left", "Push A right"];
const WALLS = ["Left wall (x = 0)", "Right wall", "Bottom wall (y = 0)", "Top wall"];

const NAMES = [
  ["the player", "a crate"],
  ["a bullet", "a wall block"],
  ["a coin", "the player"],
  ["an enemy", "a spike trap"],
  ["a door trigger", "the hero"],
  ["a falling rock", "a platform"],
];

// ---------- question builders ----------

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
function single({ prompt, exact, rounded, explanation, hints, given, params, candidates, neg = false, rng }) {
  const base = { prompt, explanation, hints, given, tolerance: rounded ? 0.005 : 0, params: { ...params, rounded } };
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

// ======================= Boxes =======================

// Two intervals with a chosen relation: "over" (positive overlap), "gap" or "touch".
function intervals(rel, rng, dec) {
  const v = (lo, hi) => (dec ? tenth(rng, lo, hi) : rng.int(lo, hi));
  const a1 = v(0, 12);
  const a2 = round1(a1 + v(2, 8));
  const w = v(2, 8);
  let b1;
  if (rel === "over") {
    // b1 strictly between a1 - w and a2 so the overlap is positive
    do b1 = round1(a1 - w + v(0, 16));
    while (!(b1 > a1 - w && b1 < a2));
  } else if (rel === "gap") {
    b1 = rng.next() < 0.5 ? round1(a2 + v(1, 4)) : round1(a1 - w - v(1, 4));
  } else {
    b1 = rng.next() < 0.5 ? a2 : round1(a1 - w);
  }
  return [a1, a2, b1, round1(b1 + w)];
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

const box = (x1, x2, y1, y2) => `x from ${num(x1)} to ${num(x2)}, y from ${num(y1)} to ${num(y2)}`;

function genBoxes(d, rng) {
  const kind = rng.pick({ easy: ["overlap", "overlap", "width"], medium: ["overlap", "area", "area3"], hard: ["pen", "pen", "area3"] }[d]);
  const dec = d === "hard";
  const [nA, nB] = rng.pick(NAMES);
  const NA = nA[0].toUpperCase() + nA.slice(1);

  if (kind === "overlap") {
    const kase = rng.pick(["over", "over", "xgap", "ygap", "touch"]);
    const touchAxis = rng.pick(["x", "y"]);
    const xr = kase === "xgap" ? "gap" : kase === "touch" && touchAxis === "x" ? "touch" : "over";
    const yr = kase === "ygap" ? "gap" : kase === "touch" && touchAxis === "y" ? "touch" : "over";
    const [ax1, ax2, bx1, bx2] = intervals(xr, rng, false);
    const [ay1, ay2, by1, by2] = intervals(yr, rng, false);
    const yes = kase === "over";
    const reason = REASONS[{ over: 0, xgap: 1, ygap: 2, touch: 3 }[kase]];
    const xs = `x: [${ax1}, ${ax2}] and [${bx1}, ${bx2}]`;
    const ys = `y: [${ay1}, ${ay2}] and [${by1}, ${by2}]`;
    const ovx = Math.min(ax2, bx2) - Math.max(ax1, bx1);
    const ovy = Math.min(ay2, by2) - Math.max(ay1, by1);
    const axisLine = (name, ov) => (ov > 0 ? `overlap by ${ov}` : ov === 0 ? "only touch (overlap 0)" : `are ${-ov} apart`);
    return multi({
      prompt: `${YUP} Box A (${nA}) covers ${box(ax1, ax2, ay1, ay2)}. Box B (${nB}) covers ${box(bx1, bx2, by1, by2)}. Do the boxes overlap? ${EDGE}`,
      parts: [
        choicePart("hit", "Overlap?", "Do they overlap?", yes ? YES : NO, [YES, NO], "Two boxes overlap only when their x ranges overlap AND their y ranges overlap, each by more than 0."),
        choicePart("why", "Reason", "Why?", reason, REASONS, `Compare one axis at a time: on each axis, overlap = smaller right/top edge − larger left/bottom edge. Positive means overlap, 0 means touching, negative means a gap.`),
      ],
      explanation:
        `Check each axis separately (overlap = min of the high ends − max of the low ends).\n\n` +
        `- ${xs}: \`min(${ax2}, ${bx2}) − max(${ax1}, ${bx1}) = ${ovx}\`, so they ${axisLine("x", ovx)}\n` +
        `- ${ys}: \`min(${ay2}, ${by2}) − max(${ay1}, ${by1}) = ${ovy}\`, so they ${axisLine("y", ovy)}\n\n` +
        `Answer: **${yes ? YES : NO}**, because **${reason.toLowerCase()}**.`,
      hints: [`Write the ranges side by side. ${xs}. ${ys}.`],
      given: giv({ ax1, ax2, ay1, ay2, bx1, bx2, by1, by2 }),
      params: { kind: "boxhit", v: { ax1, ax2, ay1, ay2, bx1, bx2, by1, by2, sc: 1 } },
      rounded: false,
    });
  }

  if (kind === "width") {
    const rel = rng.pick(["over", "over", "over", "gap", "touch"]);
    const [ax1, ax2, bx1, bx2] = intervals(rel, rng, false);
    const exact = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    return single({
      prompt: `${YUP} On the x axis, box A (${nA}) spans ${ax1} to ${ax2} and box B (${nB}) spans ${bx1} to ${bx2}. How wide is the overlap on x? Give 0 if they don't overlap. ${EDGE}`,
      exact,
      rounded: false,
      explanation:
        `The shared part runs from the larger left edge to the smaller right edge.\n\n` +
        `\`min(${ax2}, ${bx2}) − max(${ax1}, ${bx1}) = ${Math.min(ax2, bx2)} − ${Math.max(ax1, bx1)} = ${Math.min(ax2, bx2) - Math.max(ax1, bx1)}\`` +
        (Math.min(ax2, bx2) - Math.max(ax1, bx1) <= 0 ? `, which is not positive, so the overlap is **0**.` : `, so the overlap is **${exact}**.`),
      hints: [
        "The overlap starts at the larger of the two left edges and ends at the smaller of the two right edges.",
        `Larger left edge: max(${ax1}, ${bx1}). Smaller right edge: min(${ax2}, ${bx2}) (in the calculator: \`min(_ax2, _bx2) - max(_ax1, _bx1)\`). A result of 0 or less means no overlap.`,
      ],
      given: giv({ ax1, ax2, bx1, bx2 }),
      params: { kind: "boxw", v: { ax1, ax2, bx1, bx2, sc: 1 } },
      candidates: [Math.max(ax2, bx2) - Math.min(ax1, bx1), Math.abs(bx1 - ax1), ax2 - ax1 + (bx2 - bx1)],
      rng,
    });
  }

  if (kind === "area" || kind === "area3") {
    const sc = dec ? 10 : 1;
    const [ax1, ax2, bx1, bx2] = intervals("over", rng, dec);
    const [ay1, ay2, by1, by2] = intervals(kind === "area" && rng.next() < 0.2 ? rng.pick(["gap", "touch"]) : "over", rng, dec);
    const w = Math.max(0, round1(Math.min(ax2, bx2) - Math.max(ax1, bx1)));
    const h = Math.max(0, round1(Math.min(ay2, by2) - Math.max(ay1, by1)));
    const area = w * h;
    const rounded = dec;
    const g = giv({ ax1, ax2, ay1, ay2, bx1, bx2, by1, by2 });
    const params = { kind: "boxarea", v: { ax1, ax2, ay1, ay2, bx1, bx2, by1, by2, sc } };
    const wl = `\`min(${num(ax2)}, ${num(bx2)}) − max(${num(ax1)}, ${num(bx1)})\``;
    const hl = `\`min(${num(ay2)}, ${num(by2)}) − max(${num(ay1)}, ${num(by1)})\``;
    const expl =
      `The overlap of two boxes is itself a box. Find its width and height, then multiply.\n\n` +
      `- width: ${wl} = ${num(w)}\n- height: ${hl}${h > 0 ? ` = ${num(h)}` : ` = ${num(round1(Math.min(ay2, by2) - Math.max(ay1, by1)))}, which is not positive, so 0`}\n- area: \`${num(w)} × ${num(h)}\` ${res(area, rounded)}`;
    const prompt = `${YUP} Box A (${nA}) covers ${box(ax1, ax2, ay1, ay2)}. Box B (${nB}) covers ${box(bx1, bx2, by1, by2)}.`;
    if (kind === "area") {
      return single({
        prompt: `${prompt} What is the area of the region they share? Give 0 if they don't overlap. ${EDGE}`,
        exact: area,
        rounded,
        explanation: expl,
        hints: [
          "The shared region is a box: its width is the x overlap and its height is the y overlap.",
          `Width: ${wl}. Height: ${hl}. If either is 0 or less, there is no overlap. Otherwise multiply them (in the calculator: \`(min(_ax2, _bx2) - max(_ax1, _bx1)) * (min(_ay2, _by2) - max(_ay1, _by1))\`).`,
        ],
        given: g,
        params,
        candidates: [(ax2 - ax1) * (ay2 - ay1), w + h, (Math.max(ax2, bx2) - Math.min(ax1, bx1)) * (Math.max(ay2, by2) - Math.min(ay1, by1))],
        rng,
      });
    }
    return multi({
      prompt: `${prompt} Find the width, height and area of the region they share.${rounded ? END : ""} ${EDGE}`,
      parts: [
        numPart("w", "Width", "Overlap width (x)", w, rounded, `Width: ${wl} (in the calculator: \`min(_ax2, _bx2) - max(_ax1, _bx1)\`).`),
        numPart("h", "Height", "Overlap height (y)", h, rounded, `Height: ${hl} (in the calculator: \`min(_ay2, _by2) - max(_ay1, _by1)\`).`),
        numPart("area", "Area", "Overlap area", area, rounded, `Area = width × height. Use the two values you just found.${rounded ? THEN : ""}`),
      ],
      explanation: expl,
      hints: ["The shared region is a box: its width is the x overlap and its height is the y overlap."],
      given: g,
      params,
      rounded,
    });
  }

  // pen (hard): penetration depth on x and which way to push A out.
  let ax1, ax2, bx1, bx2, depth, dir;
  do {
    [ax1, ax2, bx1, bx2] = intervals("over", rng, true);
    const pushL = round1(ax2 - bx1); // move A left by this
    const pushR = round1(bx2 - ax1); // move A right by this
    depth = Math.min(pushL, pushR);
    dir = pushL < pushR ? PUSH[0] : PUSH[1];
    if (Math.abs(pushL - pushR) < 0.05) depth = -1;
  } while (depth <= 0);
  const [ay1, ay2, by1, by2] = intervals("over", rng, true);
  const pL = round1(ax2 - bx1), pR = round1(bx2 - ax1);
  return multi({
    prompt: `${YUP} Box A (${nA}) covers ${box(ax1, ax2, ay1, ay2)} and overlaps box B (${nB}), which covers ${box(bx1, bx2, by1, by2)}. The game resolves the collision on the x axis only, moving A the shortest distance so that the boxes just touch. ${EDGE} How far does A move, and which way?`,
    parts: [
      numPart("depth", "Depth", "Penetration depth on x", depth, true, `Moving A left must take its right edge back to B's left edge: \`${num(ax2)} − ${num(bx1)}\`. Moving it right must take its left edge to B's right edge: \`${num(bx2)} − ${num(ax1)}\`. The depth is the smaller one.`),
      choicePart("dir", "Direction", "Which way does A move?", dir, PUSH, "Push A the way that needs the smaller move."),
    ],
    explanation:
      `There are two ways out on x:\n\n` +
      `- left: A's right edge back to B's left edge, \`${num(ax2)} − ${num(bx1)} = ${num(pL)}\`\n` +
      `- right: A's left edge up to B's right edge, \`${num(bx2)} − ${num(ax1)} = ${num(pR)}\`\n\n` +
      `The smaller is ${num(depth)}, so the depth is **${fmtAns(depth, true)}** and the direction is is **${dir}**.`,
    hints: ["Penetration depth is the smallest move that separates the boxes. On x there are only two candidates: push A left or push A right."],
    given: giv({ ax1, ax2, bx1, bx2 }),
    params: { kind: "boxpen", v: { ax1, ax2, bx1, bx2, sc: 10 } },
    rounded: true,
  });
}

// ======================= Circles =======================

const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 6, 10], [4, 3, 5], [12, 5, 13], [9, 12, 15]];

function genCircles(d, rng) {
  const kind = rng.pick({ easy: ["point", "point", "sq"], medium: ["sq", "cc", "point"], hard: ["cc", "pen", "sq"] }[d]);
  const sgn = () => (rng.next() < 0.5 ? -1 : 1);

  if (kind === "point") {
    const cx = rng.int(-10, 10), cy = rng.int(-10, 10);
    const r = rng.int(3, d === "easy" ? 8 : 12);
    let px, py;
    if (rng.next() < 0.2) {
      const [a, b, c] = rng.pick(TRIPLES.filter((t) => t[2] <= 15));
      // exactly on the edge: radius = c
      px = cx + sgn() * a;
      py = cy + sgn() * b;
      return circlePoint(cx, cy, c, px, py, d);
    }
    do {
      px = cx + rng.int(-r - 4, r + 4);
      py = cy + rng.int(-r - 4, r + 4);
    } while (sq(px - cx) + sq(py - cy) === r * r);
    return circlePoint(cx, cy, r, px, py, d);
  }

  if (kind === "sq") {
    const x1 = rng.int(-12, 12), y1 = rng.int(-12, 12);
    let r1 = rng.int(1, 7), r2 = rng.int(1, 7), x2, y2;
    if (rng.next() < 0.2) {
      const [a, b, c] = rng.pick(TRIPLES);
      x2 = x1 + sgn() * a;
      y2 = y1 + sgn() * b;
      r1 = rng.int(1, c - 1);
      r2 = c - r1; // exactly touching
    } else {
      do {
        x2 = x1 + rng.int(-14, 14);
        y2 = y1 + rng.int(-14, 14);
      } while (sq(x2 - x1) + sq(y2 - y1) === sq(r1 + r2) || (x2 === x1 && y2 === y1));
    }
    const dx = x2 - x1, dy = y2 - y1;
    const dsq = dx * dx + dy * dy, rsq = sq(r1 + r2);
    const yes = dsq < rsq;
    return multi({
      prompt: `${YUP} Circle A has centre ${pt(x1, y1)} and radius ${r1}. Circle B has centre ${pt(x2, y2)} and radius ${r2}. Games avoid the square root by comparing squared values. Find the squared distance between the centres and the squared sum of the radii, then decide whether the circles overlap. ${CEDGE}`,
      parts: [
        numPart("dsq", "Distance²", "dx² + dy²", dsq, false, `\`dx = ${num(x2)} − ${par(x1)}\`, \`dy = ${num(y2)} − ${par(y1)}\`. Square each and add (in the calculator: \`(_bx - _ax)^2 + (_by - _ay)^2\`).`),
        numPart("rsq", "Radii²", "(r1 + r2)²", rsq, false, `Add the radii first, then square: \`(${r1} + ${r2})²\`. Not r1² + r2².`),
        choicePart("hit", "Overlap?", "Do they overlap?", yes ? YES : NO, [YES, NO], "They overlap when the squared distance is less than (r1 + r2)². Equal means they only touch."),
      ],
      explanation:
        `Two circles overlap when the distance between centres is less than r1 + r2. Both sides are positive, so squaring keeps the comparison the same.\n\n` +
        `- \`dx = ${num(dx)}\`, \`dy = ${num(dy)}\`, so \`dx² + dy² = ${dx * dx} + ${dy * dy}\` ${res(dsq, false)}\n` +
        `- \`(r1 + r2)² = (${r1} + ${r2})² = ${r1 + r2}²\` ${res(rsq, false)}\n` +
        `- ${dsq} ${dsq < rsq ? "<" : dsq === rsq ? "=" : ">"} ${rsq}: **${yes ? YES : NO}**${dsq === rsq ? " (they only touch)" : ""}.`,
      hints: ["Work out dx and dy first (B minus A), then square them. Compare with the radii sum, squared."],
      given: giv({ ax: x1, ay: y1, ra: r1, bx: x2, by: y2, rb: r2 }),
      params: { kind: "ccsq", v: { x1, y1, r1, x2, y2, r2 } },
      rounded: false,
    });
  }

  if (kind === "cc") {
    const dec = d === "hard";
    let x1, y1, x2, y2, r1, r2, dist;
    do {
      x1 = dec ? tenth(rng, -15, 15) : rng.int(-12, 12);
      y1 = dec ? tenth(rng, -15, 15) : rng.int(-12, 12);
      x2 = dec ? tenth(rng, -15, 15) : rng.int(-12, 12);
      y2 = dec ? tenth(rng, -15, 15) : rng.int(-12, 12);
      r1 = dec ? tenth(rng, 1, 8) : rng.int(1, 8);
      r2 = dec ? tenth(rng, 1, 8) : rng.int(1, 8);
      dist = Math.sqrt(sq(x2 - x1) + sq(y2 - y1));
    } while (Math.abs(dist - (r1 + r2)) < 0.1 || dist < 1 || dist > 2.5 * (r1 + r2));
    const rs = round1(r1 + r2);
    const yes = dist < rs;
    return multi({
      prompt: `${YUP} A ${rng.pick(["bullet", "ball", "planet", "bubble"])} is a circle with centre ${pt(x1, y1)} and radius ${num(r1)}. A ${rng.pick(["target", "bumper", "asteroid", "spike ball"])} is a circle with centre ${pt(x2, y2)} and radius ${num(r2)}. How far apart are the centres, and do the circles overlap?${END} ${CEDGE}`,
      parts: [
        numPart("dist", "Distance", "Distance between the centres", dist, true, `\`dx = ${num(x2)} − ${par(x1)}\`, \`dy = ${num(y2)} − ${par(y1)}\`, then \`√(dx² + dy²)\` (in the calculator: \`sqrt((_bx - _ax)^2 + (_by - _ay)^2)\`).${THEN}`),
        choicePart("hit", "Overlap?", "Do they overlap?", yes ? YES : NO, [YES, NO], `Compare the distance with r1 + r2 = \`${num(r1)} + ${num(r2)}\`. Less means overlap.`),
      ],
      explanation:
        `Circles overlap when the centre distance is less than the sum of the radii.\n\n` +
        `- \`dx = ${num(x2 - x1)}\`, \`dy = ${num(y2 - y1)}\`, distance \`= √(${par(round1(x2 - x1))}² + ${par(round1(y2 - y1))}²)\` ${res(dist, true)}\n` +
        `- \`r1 + r2 = ${num(r1)} + ${num(r2)} = ${num(rs)}\`\n` +
        `- ${num(dist)} ${yes ? "<" : ">"} ${num(rs)}: **${yes ? YES : NO}**.`,
      hints: ["Find the distance between the two centres with Pythagoras, then compare it with the two radii added together."],
      given: giv({ ax: x1, ay: y1, ra: r1, bx: x2, by: y2, rb: r2 }),
      params: { kind: "cc", v: { x1, y1, r1, x2, y2, r2 } },
      rounded: true,
    });
  }

  // pen (hard): how far the circles overlap along the line between centres.
  let x1, y1, x2, y2, r1, r2, dist;
  do {
    x1 = tenth(rng, -10, 10);
    y1 = tenth(rng, -10, 10);
    x2 = round1(x1 + tenth(rng, -8, 8));
    y2 = round1(y1 + tenth(rng, -8, 8));
    r1 = tenth(rng, 2, 8);
    r2 = tenth(rng, 2, 8);
    dist = Math.sqrt(sq(x2 - x1) + sq(y2 - y1));
  } while (dist < 1 || r1 + r2 - dist < 0.2);
  const depth = r1 + r2 - dist;
  return single({
    prompt: `${YUP} Two balls overlap. Ball A has centre ${pt(x1, y1)} and radius ${num(r1)}; ball B has centre ${pt(x2, y2)} and radius ${num(r2)}. The physics engine pushes them apart along the line between centres by the penetration depth (r1 + r2 − distance). What is that depth?${END}`,
    exact: depth,
    rounded: true,
    explanation:
      `Penetration depth = how much the radii sum exceeds the centre distance.\n\n` +
      `- \`dx = ${num(x2 - x1)}\`, \`dy = ${num(y2 - y1)}\`, distance \`= √(dx² + dy²)\` ≈ ${num(dist)}\n` +
      `- depth \`= ${num(r1)} + ${num(r2)} − ${num(dist)}\` ${res(depth, true)}`,
    hints: [
      `First find the centre distance: \`dx = ${num(x2)} − ${par(x1)}\`, \`dy = ${num(y2)} − ${par(y1)}\`, distance = \`√(dx² + dy²)\`.`,
      `Then subtract it from \`${num(r1)} + ${num(r2)}\` (in the calculator: \`_ra + _rb - sqrt((_bx - _ax)^2 + (_by - _ay)^2)\`).${THEN}`,
    ],
    given: giv({ ax: x1, ay: y1, ra: r1, bx: x2, by: y2, rb: r2 }),
    params: { kind: "cpen", v: { x1, y1, r1, x2, y2, r2 } },
    candidates: [dist - Math.abs(r1 - r2), r1 + r2 - (sq(x2 - x1) + sq(y2 - y1)), r1 + r2 - (Math.abs(x2 - x1) + Math.abs(y2 - y1))],
    rng,
  });
}

function circlePoint(cx, cy, r, px, py, d) {
  const dx = px - cx, dy = py - cy;
  const dsq = dx * dx + dy * dy;
  const inside = dsq < r * r;
  return multi({
    prompt: `${YUP} A ${["round pickup zone", "circular explosion", "sensor circle", "round trigger"][(cx + 20 + r) % 4]} has centre ${pt(cx, cy)} and radius ${r}. Is the point ${pt(px, py)} inside it? Find the squared distance from the centre first. Rule: a point exactly on the edge does NOT count as inside.`,
    parts: [
      numPart("dsq", "Distance²", "dx² + dy²", dsq, false, `\`dx = ${num(px)} − ${par(cx)}\`, \`dy = ${num(py)} − ${par(cy)}\`. Square each and add (in the calculator: \`(_px - _cx)^2 + (_py - _cy)^2\`).`),
      choicePart("in", "Inside?", "Is the point inside?", inside ? YES : NO, [YES, NO], `Compare with r² = ${r}². Inside means strictly less.`),
    ],
    explanation:
      `A point is inside a circle when its distance from the centre is less than the radius. Comparing squares avoids the square root.\n\n` +
      `- \`dx = ${num(dx)}\`, \`dy = ${num(dy)}\`, so \`dx² + dy² = ${dx * dx} + ${dy * dy}\` ${res(dsq, false)}\n` +
      `- \`r² = ${r}² = ${r * r}\`\n` +
      `- ${dsq} ${dsq < r * r ? "<" : dsq === r * r ? "=" : ">"} ${r * r}: **${inside ? YES : NO}**${dsq === r * r ? " (exactly on the edge)" : ""}.`,
    hints: ["Subtract the centre from the point to get dx and dy, then compare dx² + dy² with r²."],
    given: giv({ cx, cy, r, px, py }),
    params: { kind: "cpoint", v: { cx, cy, r, px, py } },
    rounded: false,
  });
}

// ======================= Rays & lines =======================

function genRays(d, rng) {
  const kind = rng.pick({ easy: ["time", "time", "hit"], medium: ["hit", "hit", "time"], hard: ["first", "first", "hit"] }[d]);
  const what = rng.pick(["A bullet", "A ball", "A laser bolt", "A puck", "A drone", "An arrow"]);

  if (kind === "time" || kind === "hit") {
    const vertical = rng.next() < 0.5; // wall x = W, else y = H
    const rounded = d === "hard";
    let p0, q0, vp, vq, t, wall;
    if (!rounded) {
      vp = nz(rng, -12, 12);
      t = kind === "time" && d === "easy" ? rng.int(1, 9) : rng.int(2, 16) / 2;
      p0 = rng.int(-20, 20);
      wall = p0 + vp * t;
      q0 = rng.int(-20, 20);
      vq = kind === "time" ? 0 : rng.int(-8, 8);
    } else {
      p0 = tenth(rng, -20, 20);
      vp = nz(rng, -90, 90) / 10;
      wall = round1(p0 + vp * rng.int(50, 600) / 100);
      if (Math.abs(wall - p0) < 0.5) wall = round1(p0 + vp * 2);
      t = (wall - p0) / vp;
      q0 = tenth(rng, -20, 20);
      vq = tenth(rng, -9, 9);
    }
    const [P, Q] = vertical ? ["x", "y"] : ["y", "x"];
    const x0 = vertical ? p0 : q0, y0 = vertical ? q0 : p0, vx = vertical ? vp : vq, vy = vertical ? vq : vp;
    const contact = q0 + vq * t;
    const exactNote = !rounded && !Number.isInteger(t) ? " Give exact values (they may end in .5)." : "";
    const setup = `${YUP} ${what} starts at ${pt(x0, y0)} and moves with constant velocity ${pt(vx, vy)} units per second. A ${vertical ? "vertical" : "horizontal"} wall lies along the line ${P} = ${num(wall)}.`;
    const g = giv({ x0, y0, vx, vy, wall });
    const tl = `\`t = (${num(wall)} − ${par(p0)}) / ${par(vp)}\``;
    const tcalc = `(_wall - _${P}0) / _v${P}`;
    const params = { kind: "ray", v: { x0, y0, vx, vy, wall, vertical } };
    if (kind === "time") {
      return single({
        prompt: `${setup} After how many seconds does it reach the wall?${rounded ? END : exactNote}`,
        exact: t,
        rounded,
        explanation: `Only the ${P} motion matters: it must travel from ${P} = ${num(p0)} to ${P} = ${num(wall)} at ${num(vp)} per second.\n\n${tl} ${res(t, rounded, "s")}`,
        hints: [
          `The wall is at ${P} = ${num(wall)}, so only the ${P} coordinate matters: \`${P}(t) = ${num(p0)} + ${par(vp)} × t\`.`,
          `Set it equal to ${num(wall)} and solve: ${tl} (in the calculator: \`${tcalc}\`).${rounded ? THEN : ""}`,
        ],
        given: g,
        params: { ...params, field: "t" },
        candidates: [wall / vp, (wall + p0) / vp, Math.abs(wall - p0) * Math.abs(vp)],
        rng,
      });
    }
    return multi({
      prompt: `${setup} When does it hit the wall, and at what ${Q} does it touch it?${rounded ? END : exactNote}`,
      parts: [
        numPart("t", "Time", "Time of impact (s)", t, rounded, `Solve \`${num(p0)} + ${par(vp)} × t = ${num(wall)}\`: ${tl} (in the calculator: \`${tcalc}\`).${rounded ? THEN : ""}`),
        numPart("c", "Contact", `${Q} at the contact point`, contact, rounded, `Put that t into the ${Q} motion: \`${Q} = ${num(q0)} + ${par(vq)} × t\` (in the calculator: \`_${Q}0 + _v${Q} * ${tcalc}\`).${rounded ? THEN : ""}`),
      ],
      explanation:
        `Use the ${P} motion to find when, then the ${Q} motion to find where.\n\n` +
        `- ${tl} ${res(t, rounded, "s")}\n` +
        `- \`${Q} = ${num(q0)} + ${par(vq)} × ${num(t)}\` ${res(contact, rounded)}`,
      hints: [`Write the position as a function of time: \`${P}(t) = ${num(p0)} + ${par(vp)} × t\` and \`${Q}(t) = ${num(q0)} + ${par(vq)} × t\`.`],
      given: g,
      params,
      rounded,
    });
  }

  // first (hard): inside a rectangular room, which wall is hit first, when, and where.
  const W = rng.int(20, 60), H = rng.int(15, 40);
  let x0, y0, vx, vy, tx, ty;
  do {
    x0 = tenth(rng, 2, W - 2);
    y0 = tenth(rng, 2, H - 2);
    vx = nz(rng, -120, 120) / 10;
    vy = nz(rng, -120, 120) / 10;
    tx = vx > 0 ? (W - x0) / vx : -x0 / vx;
    ty = vy > 0 ? (H - y0) / vy : -y0 / vy;
  } while (Math.abs(tx - ty) < 0.05 || Math.abs(vx) < 0.5 || Math.abs(vy) < 0.5);
  const xFirst = tx < ty;
  const t = Math.min(tx, ty);
  const labels = wallLabels(W, H);
  const wall = labels[xFirst ? (vx > 0 ? 1 : 0) : vy > 0 ? 3 : 2];
  const along = xFirst ? y0 + vy * t : x0 + vx * t;
  const alongName = xFirst ? "y" : "x";
  const wx = vx > 0 ? W : 0, wy = vy > 0 ? H : 0;
  return multi({
    prompt: `${YUP} A room has walls at x = 0 (left), x = ${W} (right), y = 0 (bottom) and y = ${H} (top). ${what} starts at ${pt(x0, y0)} with velocity ${pt(vx, vy)} units per second. Which wall does it hit first, when, and where along that wall?${END}`,
    parts: [
      choicePart("wall", "Wall", "First wall hit", wall, labels,`It moves ${vx > 0 ? "right" : "left"} and ${vy > 0 ? "up" : "down"}, so only the ${vx > 0 ? "right" : "left"} and ${vy > 0 ? "top" : "bottom"} walls can be hit. Work out the time to each: \`(${wx} − ${num(x0)}) / ${par(vx)}\` and \`(${wy} − ${num(y0)}) / ${par(vy)}\`. The smaller time wins.`),
      numPart("t", "Time", "Time of impact (s)", t, true, `Time to the x wall: \`(${wx} − ${num(x0)}) / ${par(vx)}\`. Time to the y wall: \`(${wy} − ${num(y0)}) / ${par(vy)}\`. Take the smaller.${THEN}`),
      numPart("c", "Contact", `The other coordinate (${alongName}) at impact`, along, true, `Put the impact time into the other coordinate's motion, for example \`${alongName} = ${alongName === "y" ? num(y0) : num(x0)} + ${par(alongName === "y" ? vy : vx)} × t\`.${THEN}`),
    ],
    explanation:
      `Only two walls are in its path. Find the time to each and take the earlier.\n\n` +
      `- x wall (x = ${wx}): \`(${wx} − ${num(x0)}) / ${par(vx)}\` ≈ ${num(tx)} s\n` +
      `- y wall (y = ${wy}): \`(${wy} − ${num(y0)}) / ${par(vy)}\` ≈ ${num(ty)} s\n` +
      `- First: **${wall}** at t ${res(t, true, "s")}\n` +
      `- \`${alongName} = ${alongName === "y" ? num(y0) : num(x0)} + ${par(alongName === "y" ? vy : vx)} × ${num(t)}\` ${res(along, true)}`,
    hints: ["Each wall is a line. The object reaches a line when its coordinate equals the wall's value; ignore walls it is moving away from."],
    given: giv({ x0, y0, vx, vy, W, H }),
    params: { kind: "room", v: { x0, y0, vx, vy, W, H } },
    rounded: true,
  });
}

// Wall labels with this room's sizes filled in.
const wallLabels = (W, H) => [WALLS[0], `Right wall (x = ${W})`, WALLS[2], `Top wall (y = ${H})`];

// ======================= Grids & tiles =======================

function genGrids(d, rng) {
  const kind = rng.pick({ easy: ["tile", "tile", "index"], medium: ["tile", "index", "unindex"], hard: ["cover", "cover", "unindex"] }[d]);
  const s = rng.pick(d === "easy" ? [8, 10, 16, 32] : [16, 24, 32, 48, 64]);

  if (kind === "tile") {
    const dec = d === "medium";
    let x = dec ? tenth(rng, 0, 600) : rng.int(0, 400);
    let y = dec ? tenth(rng, 0, 400) : rng.int(0, 300);
    if (rng.next() < 0.25) x = s * rng.int(1, 12); // exactly on a grid line
    const col = Math.floor(x / s), row = Math.floor(y / s);
    return multi({
      prompt: `${GRID(s)} Which tile contains the point ${pt(x, y)}?`,
      parts: [
        numPart("col", "Column", "col", col, false, `col = floor(x / ${s}) = floor(${num(x)} / ${s}) (in the calculator: \`floor(_x / _s)\`).`),
        numPart("row", "Row", "row", row, false, `row = floor(y / ${s}) = floor(${num(y)} / ${s}) (in the calculator: \`floor(_y / _s)\`).`),
      ],
      explanation:
        `Divide each coordinate by the tile size and round down.\n\n` +
        `- col: \`floor(${num(x)} / ${s}) = floor(${num(x / s)})\` ${res(col, false)}\n` +
        `- row: \`floor(${num(y)} / ${s}) = floor(${num(y / s)})\` ${res(row, false)}` +
        (x % s === 0 ? `\n\nx is exactly on a grid line, so it belongs to the tile on the right.` : ""),
      hints: ["Divide by the tile size and round down (floor). Numbering starts at 0."],
      given: giv({ x, y, s }),
      params: { kind: "tile", v: { x, y, s } },
      rounded: false,
    });
  }

  const Wt = rng.pick([8, 10, 12, 16, 20, 25, 32, 40]);
  const Ht = rng.int(6, 20);

  if (kind === "index") {
    const col = rng.int(0, Wt - 1), row = rng.int(0, Ht - 1);
    const fromPoint = d === "medium" && rng.next() < 0.5;
    const x = col * s + rng.int(0, s - 1), y = row * s + rng.int(0, s - 1);
    const exact = row * Wt + col;
    const map = `A tile map is ${Wt} tiles wide and ${Ht} tiles tall, stored row by row in one array: index = row × width + col, starting from 0 at the top-left tile.`;
    return single({
      prompt: fromPoint ? `${GRID(s)} ${map} What is the array index of the tile containing ${pt(x, y)}?` : `${map} What is the index of the tile at col ${col}, row ${row}?`,
      exact,
      rounded: false,
      explanation:
        (fromPoint ? `First find the tile: col = \`floor(${x} / ${s}) = ${col}\`, row = \`floor(${y} / ${s}) = ${row}\`.\n\n` : "") +
        `Every full row before this one holds ${Wt} tiles.\n\n\`index = ${row} × ${Wt} + ${col}\` ${res(exact, false)}`,
      hints: fromPoint
        ? [`Find the tile first: col = floor(${x} / ${s}), row = floor(${y} / ${s}).`, `Then index = row × ${Wt} + col (in the calculator: \`floor(_y / _s) * _width + floor(_x / _s)\`).`]
        : ["Count the tiles in all the full rows above, then move along this row.", `index = row × width + col = \`${row} × ${Wt} + ${col}\` (in the calculator: \`_row * _width + _col\`).`],
      given: fromPoint ? giv({ x, y, s, width: Wt }) : giv({ col, row, width: Wt }),
      params: { kind: "index", v: { col, row, Wt, Ht } },
      candidates: [col * Wt + row, row * Ht + col, row * Wt + col + 1],
      rng,
    });
  }

  if (kind === "unindex") {
    const idx = rng.int(Wt, Wt * Ht - 1);
    const col = idx % Wt, row = Math.floor(idx / Wt);
    return multi({
      prompt: `A tile map is ${Wt} tiles wide and stored row by row in one array, with index = row × width + col, starting from 0 at the top-left. Which tile is at index ${idx}?`,
      parts: [
        numPart("col", "Column", "col", col, false, `col is the remainder after dividing by the width: \`${idx} % ${Wt}\` (in the calculator: \`_index % _width\`).`),
        numPart("row", "Row", "row", row, false, `row is how many full rows fit: \`floor(${idx} / ${Wt})\` (in the calculator: \`floor(_index / _width)\`).`),
      ],
      explanation:
        `Undo index = row × width + col.\n\n` +
        `- row: \`floor(${idx} / ${Wt})\` ${res(row, false)}\n` +
        `- col: \`${idx} − ${row} × ${Wt} = ${idx} % ${Wt}\` ${res(col, false)}\n\n` +
        `Check: \`${row} × ${Wt} + ${col} = ${idx}\`.`,
      hints: ["Each full row holds `width` tiles. Divide by the width: the whole part is the row, the remainder is the column."],
      given: giv({ index: idx, width: Wt }),
      params: { kind: "unindex", v: { idx, Wt } },
      rounded: false,
    });
  }

  // cover (hard): how many tiles a box touches (positive area only).
  let x1, y1, x2, y2;
  do {
    x1 = rng.next() < 0.3 ? s * rng.int(0, 8) : tenth(rng, 0, 8 * s);
    y1 = rng.next() < 0.3 ? s * rng.int(0, 6) : tenth(rng, 0, 6 * s);
    x2 = rng.next() < 0.3 ? s * Math.ceil(x1 / s + rng.int(1, 3)) : round1(x1 + tenth(rng, 5, 3 * s));
    y2 = rng.next() < 0.3 ? s * Math.ceil(y1 / s + rng.int(1, 3)) : round1(y1 + tenth(rng, 5, 3 * s));
  } while (x2 - x1 < 1 || y2 - y1 < 1);
  const c1 = Math.floor(x1 / s), c2 = Math.ceil(x2 / s) - 1;
  const r1 = Math.floor(y1 / s), r2 = Math.ceil(y2 / s) - 1;
  const cols = c2 - c1 + 1, rows = r2 - r1 + 1;
  const onLine = (v) => Math.abs(v / s - Math.round(v / s)) < 1e-9;
  return multi({
    prompt: `${GRID(s)} A hitbox spans x from ${num(x1)} to ${num(x2)} and y from ${num(y1)} to ${num(y2)}. Which tiles does it touch? A tile only counts if the box covers part of its area: an edge lying exactly on a grid line does not reach into the next tile. How many columns, how many rows, and how many tiles in total?`,
    parts: [
      numPart("cols", "Columns", "Columns touched", cols, false, `First column: floor(${num(x1)} / ${s}). Last column: the tile holding the right edge, ceil(${num(x2)} / ${s}) − 1. Count them inclusively.`),
      numPart("rows", "Rows", "Rows touched", rows, false, `First row: floor(${num(y1)} / ${s}). Last row: ceil(${num(y2)} / ${s}) − 1. Count them inclusively.`),
      numPart("tiles", "Tiles", "Total tiles", cols * rows, false, "The touched tiles form a rectangle: multiply columns by rows."),
    ],
    explanation:
      `Find the first and last column and row the box reaches. For the far edges use ceil(edge / size) − 1, so an edge exactly on a grid line stays out of the next tile.\n\n` +
      `- columns: \`floor(${num(x1)} / ${s}) = ${c1}\` to \`ceil(${num(x2)} / ${s}) − 1 = ${c2}\`, so \`${c2} − ${c1} + 1\` ${res(cols, false)}${onLine(x2) ? " (the right edge is on a grid line)" : ""}\n` +
      `- rows: \`floor(${num(y1)} / ${s}) = ${r1}\` to \`ceil(${num(y2)} / ${s}) − 1 = ${r2}\`, so \`${r2} − ${r1} + 1\` ${res(rows, false)}${onLine(y2) ? " (the bottom edge is on a grid line)" : ""}\n` +
      `- total: \`${cols} × ${rows}\` ${res(cols * rows, false)}`,
    hints: ["Work out the range of columns from the x edges and the range of rows from the y edges, separately."],
    given: giv({ x1, x2, y1, y2, s }),
    params: { kind: "cover", v: { x1, x2, y1, y2, s } },
    rounded: false,
  });
}

// ======================= entry points =======================

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "boxes") return genBoxes(difficulty, rng);
  if (subtopic === "circles") return genCircles(difficulty, rng);
  if (subtopic === "rays") return genRays(difficulty, rng);
  if (subtopic === "grids") return genGrids(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------

function near(x, t, rounded, sens = 1) {
  if (x === "" || x === null || x === undefined || typeof x === "object" || typeof x === "boolean") return false;
  const n = Number(x);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
  return rounded ? Math.abs(n - t) <= 0.005 * sens + 1e-7 : Math.abs(n - t) < 1e-6;
}

// Brute force on a fine grid (coordinates scaled by sc to whole numbers): count the
// half-step sample points strictly inside both intervals; each one stands for 1/sc of overlap.
const S = (v, sc) => Math.round(v * sc);
function overlapCount(a1, a2, b1, b2, sc) {
  const lo = Math.min(S(a1, sc), S(b1, sc)), hi = Math.max(S(a2, sc), S(b2, sc));
  let n = 0;
  for (let k = lo; k < hi; k++) {
    const p = k + 0.5;
    if (p > S(a1, sc) && p < S(a2, sc) && p > S(b1, sc) && p < S(b2, sc)) n++;
  }
  return n;
}
// Do the closed intervals share at least one point (on the scaled whole-number grid)?
function sharePoint(a1, a2, b1, b2, sc) {
  for (let k = S(a1, sc); k <= S(a2, sc); k++) if (k >= S(b1, sc) && k <= S(b2, sc)) return true;
  return false;
}
function areaCount(v) {
  const { sc } = v;
  let n = 0;
  for (let i = S(v.ax1, sc); i < S(v.ax2, sc); i++) {
    const px = i + 0.5;
    if (!(px > S(v.bx1, sc) && px < S(v.bx2, sc))) continue;
    for (let j = S(v.ay1, sc); j < S(v.ay2, sc); j++) {
      const py = j + 0.5;
      if (py > S(v.by1, sc) && py < S(v.by2, sc)) n++;
    }
  }
  return n;
}

// Bisection for the time a coordinate p0 + v·t reaches `target` (independent of the division formula).
function bisectTime(p0, v, target) {
  const f = (t) => p0 + v * t - target;
  let lo = 0, hi = 1;
  if (f(lo) === 0) return 0;
  let guard = 0;
  while (Math.sign(f(hi)) === Math.sign(f(lo)) && guard++ < 60) hi *= 2;
  if (Math.sign(f(hi)) === Math.sign(f(lo))) return Infinity; // never reaches it
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Distance by projecting onto the vector's own direction (not √(dx² + dy²)).
const polarLen = (x, y) => {
  const th = Math.atan2(y, x);
  return x * Math.cos(th) + y * Math.sin(th);
};

const CHECK = {
  boxhit: (v, f, x) => {
    const xo = overlapCount(v.ax1, v.ax2, v.bx1, v.bx2, 1) > 0;
    const yo = overlapCount(v.ay1, v.ay2, v.by1, v.by2, 1) > 0;
    if (f === "hit") return String(x) === (areaCount(v) > 0 ? YES : NO);
    const xt = !xo && sharePoint(v.ax1, v.ax2, v.bx1, v.bx2, 1);
    const yt = !yo && sharePoint(v.ay1, v.ay2, v.by1, v.by2, 1);
    let want;
    if (xo && yo) want = REASONS[0];
    else if (!xo && !xt) want = REASONS[1];
    else if (!yo && !yt) want = REASONS[2];
    else want = REASONS[3];
    return String(x) === want;
  },
  boxw: (v, f, x) => near(x, overlapCount(v.ax1, v.ax2, v.bx1, v.bx2, v.sc) / v.sc, false),
  boxarea: (v, f, x, r) => {
    if (f === "w") return near(x, overlapCount(v.ax1, v.ax2, v.bx1, v.bx2, v.sc) / v.sc, r);
    if (f === "h") return near(x, overlapCount(v.ay1, v.ay2, v.by1, v.by2, v.sc) / v.sc, r);
    return near(x, areaCount(v) / (v.sc * v.sc), r);
  },
  // Try every shift (in tenths) outward from 0 until the x ranges no longer overlap.
  boxpen: (v, f, x, r) => {
    const sc = v.sc;
    const shifted = (s) => overlapCount(v.ax1 + s / sc, v.ax2 + s / sc, v.bx1, v.bx2, sc) > 0;
    let s = 0;
    while (shifted(s) && shifted(-s) && s < 10000) s++;
    const left = !shifted(-s), right = !shifted(s);
    if (left && right) return false; // tie: ill-posed
    if (f === "depth") return near(x, s / sc, r);
    return String(x) === (left ? PUSH[0] : PUSH[1]);
  },
  // Squared values by expanding (a − b)² = a² − 2ab + b²; overlap decided on unsquared distances.
  ccsq: (v, f, x) => {
    if (f === "dsq") return near(x, v.x2 * v.x2 - 2 * v.x1 * v.x2 + v.x1 * v.x1 + v.y2 * v.y2 - 2 * v.y1 * v.y2 + v.y1 * v.y1, false);
    if (f === "rsq") return near(x, v.r1 * v.r1 + 2 * v.r1 * v.r2 + v.r2 * v.r2, false);
    const dist = polarLen(v.x2 - v.x1, v.y2 - v.y1);
    const sum = v.r1 + v.r2;
    const yes = Math.abs(dist - sum) < 1e-9 ? false : dist < sum;
    return String(x) === (yes ? YES : NO);
  },
  cc: (v, f, x, r) => {
    const dist = polarLen(v.x2 - v.x1, v.y2 - v.y1);
    if (f === "dist") return near(x, dist, r);
    return String(x) === (dist < v.r1 + v.r2 ? YES : NO);
  },
  cpen: (v, f, x, r) => near(x, v.r1 + v.r2 - polarLen(v.x2 - v.x1, v.y2 - v.y1), r),
  cpoint: (v, f, x) => {
    const dx = v.px - v.cx, dy = v.py - v.cy;
    if (f === "dsq") return near(x, v.px * v.px - 2 * v.px * v.cx + v.cx * v.cx + v.py * v.py - 2 * v.py * v.cy + v.cy * v.cy, false);
    const dist = polarLen(dx, dy);
    const inside = Math.abs(dist - v.r) < 1e-9 ? false : dist < v.r;
    return String(x) === (inside ? YES : NO);
  },
  ray: (v, f, x, r) => {
    const t = v.vertical ? bisectTime(v.x0, v.vx, v.wall) : bisectTime(v.y0, v.vy, v.wall);
    if (!Number.isFinite(t)) return false;
    if (f === "t") return near(x, Math.round(t * 1e9) / 1e9, r);
    const c = v.vertical ? v.y0 + v.vy * t : v.x0 + v.vx * t;
    return near(x, Math.round(c * 1e9) / 1e9, r);
  },
  room: (v, f, x, r) => {
    const times = [bisectTime(v.x0, v.vx, 0), bisectTime(v.x0, v.vx, v.W), bisectTime(v.y0, v.vy, 0), bisectTime(v.y0, v.vy, v.H)];
    const pos = times.map((t) => (t > 1e-12 ? t : Infinity));
    const best = pos.indexOf(Math.min(...pos));
    const t = pos[best];
    if (f === "wall") return String(x) === wallLabels(v.W, v.H)[best];
    if (f === "t") return near(x, t, r);
    const c = best < 2 ? v.y0 + v.vy * t : v.x0 + v.vx * t;
    return near(x, c, r);
  },
  // Scan the tiles and test the point against each tile's half-open rectangle.
  tile: (v, f, x) => {
    for (let c = 0; c * v.s <= v.x; c++) {
      if (!(v.x >= c * v.s && v.x < (c + 1) * v.s)) continue;
      for (let rr = 0; rr * v.s <= v.y; rr++) {
        if (v.y >= rr * v.s && v.y < (rr + 1) * v.s) return near(x, f === "col" ? c : rr, false);
      }
    }
    return false;
  },
  // Walk the array in storage order and count.
  index: (v, f, x) => {
    let i = 0;
    for (let rr = 0; rr < v.Ht; rr++) for (let c = 0; c < v.Wt; c++, i++) if (rr === v.row && c === v.col) return near(x, i, false);
    return false;
  },
  unindex: (v, f, x) => {
    let i = 0;
    for (let rr = 0; ; rr++) for (let c = 0; c < v.Wt; c++, i++) if (i === v.idx) return near(x, f === "col" ? c : rr, false);
  },
  // Every tile: does the box cover part of its area? (strict inequalities on both axes)
  cover: (v, f, x) => {
    let cols = 0, rows = 0, tiles = 0;
    const maxC = Math.ceil(v.x2 / v.s) + 1, maxR = Math.ceil(v.y2 / v.s) + 1;
    const hitC = (c) => Math.min(v.x2, (c + 1) * v.s) - Math.max(v.x1, c * v.s) > 1e-9;
    const hitR = (rr) => Math.min(v.y2, (rr + 1) * v.s) - Math.max(v.y1, rr * v.s) > 1e-9;
    for (let c = 0; c <= maxC; c++) if (hitC(c)) cols++;
    for (let rr = 0; rr <= maxR; rr++) if (hitR(rr)) rows++;
    for (let c = 0; c <= maxC; c++) for (let rr = 0; rr <= maxR; rr++) if (hitC(c) && hitR(rr)) tiles++;
    return near(x, f === "cols" ? cols : f === "rows" ? rows : tiles, false);
  },
};

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
      if (part.answerType === "choice") {
        const ch = part.choices;
        if (!Array.isArray(ch) || new Set(ch).size !== ch.length || !ch.includes(String(val))) return false;
        if (ch.filter((c) => chk(p.v, part.id, c, rounded)).length !== 1) return false;
      } else if (typeof val !== "number" && typeof val !== "string") return false;
      if (!chk(p.v, part.id, val, rounded)) return false;
    }
    return true;
  }

  const field = p.field || "main";
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
    if (ch.filter((c) => chk(p.v, field, c, rounded)).length !== 1) return false;
  }
  return chk(p.v, field, answer, rounded);
}
