// Structures generator: moments, stress and strain, beams and reactions, factor of safety.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Every rounded answer states its rounding; draws that land on a
// rounding half-step, or whose parts would change when worked from a rounded earlier part, are
// redrawn inside generate(). Conventions are stated in each prompt: g, units, light or uniform
// beams, how the UDL and shear are read. verify() re-derives each answer by a different route
// (inverse relation, or equilibrium about another axis) from the numbers kept in `params`.

import { fmtNum, roundTo, isHalfStep } from "../../js/lib/mathutil.js";

const num = (n) => fmtNum(n, 4);
const numS = (n) => fmtNum(n, 7); // strains are small: keep more places
const rk = (x, k) => roundTo(x, k);
const isTie = (x, k) => isHalfStep(x, k, 1e-4);
const exactDp = (x, k) => Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6;
const EXACT = { fuzzyNumber: 0 };
const MAT = [["aluminium", 70], ["copper", 110], ["steel", 200], ["brass", 100]];

// Redraw until `fn` returns a truthy draw.
function redraw(fn) {
  for (let i = 0; i < 5000; i++) {
    const r = fn();
    if (r) return r;
  }
  throw new Error("structures: no valid draw");
}

// ---- verify-side helpers (local, independent of generation) -----------------------------
const toNum = (v) => (v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v));
const near = (x, t, tol = 1e-9) => Number.isFinite(x) && Math.abs(x - t) <= tol;
// x typed to k decimals and within half a step of the exact value t.
const nearDp = (x, t, k) => Number.isFinite(x) && exactDp(x, k) && Math.abs(x - t) <= 0.5 * 10 ** -k + 1e-9;
// Equilibrium of vertical forces and of moments about x = ref.
function equilibrium(loads, xa, xb, ra, rb, ref) {
  const down = loads.reduce((s, l) => s + l.P, 0);
  const mDown = loads.reduce((s, l) => s + l.P * (l.x - ref), 0);
  return Math.abs(ra + rb - down) < 1e-6 && Math.abs(ra * (xa - ref) + rb * (xb - ref) - mDown) < 1e-6;
}

// ---- generate-side helpers ------------------------------------------------------------------
// Reactions of a beam on supports at xa and xb, moments about A.
function reactions(loads, xa, xb) {
  const rb = loads.reduce((s, l) => s + (l.P * (l.x - xa)) / (xb - xa), 0);
  const total = loads.reduce((s, l) => s + l.P, 0);
  return { ra: total - rb, rb };
}
const listLoads = (items) => items.map((s) => `- ${s}`).join("\n");
const partNum = (id, label, ask, answer, tol, hint, extra = {}) => ({ id, label, ask, answerType: "number", answer, tolerance: tol, hint, ...extra });

// =====================================================================
// Moments
// =====================================================================
const EASY_TURNERS = [
  ["A spanner", "the nut", [0.2, 0.25, 0.3, 0.4], 2, 30],
  ["A wheel brace", "the wheel nut", [0.25, 0.3, 0.4, 0.5], 5, 40],
  ["A door", "its hinges", [0.5, 0.6, 0.75, 0.8, 0.9], 1, 10],
  ["A garden gate", "its hinges", [1, 1.2, 1.5, 2], 1, 10],
  ["A long lever", "its pivot", [1, 1.5, 2, 2.5, 3], 10, 50],
];
function genMoments(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["moment", "force", "dist"]);
    // Realistic sizes: [object, what it turns about, distances in m, force range in tens of N].
    const [what, piv, ds, fLo, fHi] = rng.pick(EASY_TURNERS);
    const d = rng.pick(ds);
    const F = 10 * rng.int(fLo, fHi);
    const M = rk(F * d, 2);
    if (kind === "moment") {
      return {
        prompt: `${what} is pushed with a force of **${F} N** at a perpendicular distance of **${num(d)} m** from ${piv}. What is the moment about ${piv}, in N·m?`,
        answerType: "number", answer: M, tolerance: 0,
        given: [{ label: "_force", value: F }, { label: "_distance", value: d }],
        explanation: `Moment = force × distance: \`_force * _distance\` = ${F} × ${num(d)} = **${num(M)} N·m**.`,
        hints: ["Moment = force × perpendicular distance from the pivot.", "N × m gives N·m."],
        params: { kind, F, d, M },
      };
    }
    if (kind === "force") {
      return {
        prompt: `${what} turns about ${piv} with a moment of **${num(M)} N·m**. The force acts at a perpendicular distance of **${num(d)} m** from ${piv}. What is the force, in N?`,
        answerType: "number", answer: F, tolerance: 0,
        given: [{ label: "_moment", value: M }, { label: "_distance", value: d }],
        explanation: `Force = moment ÷ distance: \`_moment / _distance\` = ${num(M)} / ${num(d)} = **${F} N**.`,
        hints: ["Moment = force × distance, so force = moment ÷ distance."],
        params: { kind, F, d, M },
      };
    }
    return {
      prompt: `${what} turns about ${piv} when a force of **${F} N** produces a moment of **${num(M)} N·m**. At what perpendicular distance from ${piv} does the force act, in m?`,
      answerType: "number", answer: d, tolerance: 0,
      given: [{ label: "_force", value: F }, { label: "_moment", value: M }],
      explanation: `Distance = moment ÷ force: \`_moment / _force\` = ${num(M)} / ${F} = **${num(d)} m**.`,
      hints: ["Moment = force × distance, so distance = moment ÷ force."],
      params: { kind, F, d, M },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["seesaw-dist", "seesaw-mass", "lever", "cm"]);
    if (kind === "seesaw-dist") {
      const { W1, d1, W2, d2 } = redraw(() => {
        const W1 = 50 * rng.int(4, 14), W2 = 50 * rng.int(4, 14), d1 = 0.5 * rng.int(2, 7);
        const d2 = (W1 * d1) / W2;
        return W1 !== W2 && exactDp(d2, 1) && d2 >= 0.5 && d2 <= 3.5 && d2 !== d1 ? { W1, d1, W2, d2: rk(d2, 1) } : null;
      });
      return {
        prompt: `A see-saw is balanced on a pivot at its centre. A girl weighing **${W1} N** sits **${num(d1)} m** from the pivot. A boy weighing **${W2} N** sits on the other side. How far from the pivot must he sit, in m?`,
        answerType: "number", answer: d2, tolerance: 0.05,
        given: [{ label: "_w1", value: W1 }, { label: "_d1", value: d1 }, { label: "_w2", value: W2 }],
        explanation: `Balance: clockwise moment = anticlockwise moment. ${W1} × ${num(d1)} = ${W2} × d, so d = \`_w1 * _d1 / _w2\` = **${num(d2)} m**.`,
        hints: ["Balanced means the two moments about the pivot are equal.", "Girl: weight × her distance. Boy: weight × the distance you want."],
        params: { kind, W1, d1, W2, d2 },
      };
    }
    if (kind === "seesaw-mass") {
      const { m1, d1, m2, d2 } = redraw(() => {
        const m1 = 5 * rng.int(4, 16), d1 = 0.5 * rng.int(2, 7), d2 = 0.5 * rng.int(2, 7);
        const m2 = (m1 * d1) / d2;
        return d1 !== d2 && Number.isInteger(m2) && m2 >= 15 && m2 <= 100 && m2 !== m1 ? { m1, d1, m2, d2 } : null;
      });
      return {
        prompt: `A see-saw is balanced on a pivot at its centre. A child of mass **${m1} kg** sits **${num(d1)} m** from the pivot. A second child sits **${num(d2)} m** from the pivot on the other side. What is the second child's mass, in kg?`,
        answerType: "number", answer: m2, tolerance: 0, ...EXACT,
        given: [{ label: "_m1", value: m1 }, { label: "_d1", value: d1 }, { label: "_d2", value: d2 }],
        explanation: `The weights are mass × g, and g is on both sides so it cancels: ${m1} × ${num(d1)} = m × ${num(d2)}, so m = \`_m1 * _d1 / _d2\` = **${m2} kg**.`,
        hints: ["Balanced: the two moments about the pivot are equal.", "Weight = mass × g on both sides, so you can work in kg directly."],
        params: { kind, m1, d1, m2, d2 },
      };
    }
    if (kind === "lever") {
      const { m, a, b, E } = redraw(() => {
        const m = 10 * rng.int(3, 20), a = 0.05 * rng.int(2, 10), b = 0.5 * rng.int(2, 6);
        const E = (m * 10 * a) / b;
        return exactDp(E, 0) && E >= 20 && E <= 400 ? { m, a: rk(a, 2), b, E: rk(E, 0) } : null;
      });
      return {
        prompt: `A long steel lever bar is used to lift a rock of mass **${m} kg**. The rock's weight acts **${num(a)} m** from the pivot (the fulcrum). The effort is applied on the other side of the pivot, **${num(b)} m** from it. Take g = 10 N/kg. What is the smallest effort that just lifts the rock, in N?`,
        answerType: "number", answer: E, tolerance: 0, ...EXACT,
        given: [{ label: "_mass", value: m }, { label: "_a", value: a }, { label: "_b", value: b }],
        explanation: `Weight = ${m} × 10 = ${m * 10} N. Moments about the pivot: E × ${num(b)} = ${m * 10} × ${num(a)}, so E = \`_mass * 10 * _a / _b\` = **${E} N**.`,
        hints: ["Turn the mass into a weight first: weight = mass × g.", "Just lifting means the effort's moment equals the rock's moment about the pivot."],
        params: { kind, m, a, b, E },
      };
    }
    const F = 5 * rng.int(1, 16), dcm = 5 * rng.int(1, 19);
    const M = (F * dcm) / 100;
    return {
      prompt: `A force of **${F} N** acts at a perpendicular distance of **${dcm} cm** from a pivot. What is its moment about the pivot, in N·m?`,
      answerType: "number", answer: rk(M, 2), tolerance: 0,
      given: [{ label: "_force", value: F }, { label: "_cm", value: dcm }],
      explanation: `${dcm} cm = ${num(dcm / 100)} m. Moment = \`_force * _cm / 100\` = ${F} × ${num(dcm / 100)} = **${num(M)} N·m**.`,
      hints: ["N·m needs the distance in metres: divide centimetres by 100.", "Then moment = force × distance."],
      params: { kind, F, dcm, M },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["three", "plank"]);
    if (kind === "three") {
      const ask = rng.pick(["F", "x"]);
      const v = redraw(() => {
        const W1 = 10 * rng.int(2, 20), W2 = 10 * rng.int(2, 20), d1 = rng.int(1, 3), d2 = d1 + rng.int(1, 3);
        const S = W1 * d1 + W2 * d2;
        if (ask === "F") {
          const x = rng.int(2, 8);
          return S % x === 0 && S / x >= 20 ? { W1, W2, d1, d2, x, F: S / x } : null;
        }
        const R = 10 * rng.int(3, 40), x = S / R;
        return exactDp(x, 1) && x >= 1 && x <= 8 ? { W1, W2, d1, d2, F: R, x: rk(x, 1) } : null;
      });
      const { W1, W2, d1, d2, x, F } = v;
      const base = `A light beam is pivoted at its centre. On the left, a load of **${W1} N** hangs **${d1} m** from the pivot and a load of **${W2} N** hangs **${d2} m** from the pivot.`;
      if (ask === "F") {
        return {
          prompt: `${base} A downward force F is applied on the right, **${x} m** from the pivot, and the beam balances. What is F, in N?`,
          answerType: "number", answer: F, tolerance: 0, ...EXACT,
          given: [{ label: "_w1", value: W1 }, { label: "_d1", value: d1 }, { label: "_w2", value: W2 }, { label: "_d2", value: d2 }, { label: "_x", value: x }],
          explanation: `Anticlockwise: \`_w1 * _d1 + _w2 * _d2\` = ${W1 * d1} + ${W2 * d2} = ${W1 * d1 + W2 * d2} N·m. Clockwise: F × ${x}. So F = ${W1 * d1 + W2 * d2} / ${x} = **${F} N**.`,
          hints: ["Add the moments of the two loads on the left.", "The beam balances when the right-hand moment equals that total."],
          params: { kind, ask, W1, W2, d1, d2, x, F },
        };
      }
      return {
        prompt: `${base} A load of **${F} N** hangs on the right and the beam balances. How far from the pivot does it hang, in m?`,
        answerType: "number", answer: x, tolerance: 0.05,
        given: [{ label: "_w1", value: W1 }, { label: "_d1", value: d1 }, { label: "_w2", value: W2 }, { label: "_d2", value: d2 }, { label: "_f", value: F }],
        explanation: `Anticlockwise: \`_w1 * _d1 + _w2 * _d2\` = ${W1 * d1} + ${W2 * d2} = ${W1 * d1 + W2 * d2} N·m. Clockwise: ${F} × x. So x = ${W1 * d1 + W2 * d2} / ${F} = **${num(x)} m**.`,
        hints: ["Add the moments of the two loads on the left.", "Set that equal to the right-hand load × its distance, and solve for the distance."],
        params: { kind, ask, W1, W2, d1, d2, x, F },
      };
    }
    const v = redraw(() => {
      const L = rng.pick([4, 5, 6, 8, 10]), p = 0.5 * rng.int(1, L - 1);
      if (!(p >= 0.5 && p < L / 2 - 0.4)) return null;
      const Wb = 10 * rng.int(2, 30), W = 50 * rng.int(2, 20);
      const F = (W * p - Wb * (L / 2 - p)) / (L - p);
      return F >= 5 && exactDp(F, 1) ? { L, p, Wb, W, F: rk(F, 1) } : null;
    });
    const { L, p, Wb, W, F } = v;
    return {
      prompt: `A uniform plank of length **${L} m** and weight **${Wb} N** is pivoted **${num(p)} m** from its left end. A load of **${W} N** hangs from the left end. A downward force F is applied at the right end to hold the plank level. What is F, in N? Give the answer to 1 decimal place.`,
      answerType: "number", answer: F, tolerance: 0.05,
      given: [{ label: "_len", value: L }, { label: "_wb", value: Wb }, { label: "_p", value: p }, { label: "_w", value: W }],
      explanation: `The plank's weight acts at its midpoint, ${L / 2} m from the left end, so ${num(L / 2 - p)} m to the right of the pivot. Anticlockwise: ${W} × ${num(p)} = ${num(W * p)} N·m. Clockwise: ${Wb} × ${num(L / 2 - p)} + F × ${num(L - p)}. So F = (${num(W * p)} − ${num(Wb * (L / 2 - p))}) / ${num(L - p)} = **${num(F)} N**.`,
      hints: ["The plank's own weight acts at its midpoint. Which side of the pivot is that on?", "Anticlockwise moment = load × distance to the pivot. Clockwise = the plank's weight moment + F × the distance to the right end.", `The right end is ${num(L - p)} m from the pivot.`],
      params: { kind, L, p, Wb, W, F },
    };
  }

  // expert: two unknown reactions, or a plank on the point of tipping
  const kind = rng.pick(["supports", "tip"]);
  if (kind === "supports") {
    const v = redraw(() => {
      const L = rng.pick([4, 5, 6, 8, 10]), b = rng.int(Math.ceil(L / 2), L), c = rng.int(1, L - 1);
      if (c === b || c === L / 2) return null;
      const Wb = 20 * rng.int(2, 20), P = 10 * rng.int(4, 40);
      const loads = [{ x: L / 2, P: Wb }, { x: c, P }];
      const { ra, rb } = reactions(loads, 0, b);
      return exactDp(rb, 1) && ra >= 10 && rb >= 10 ? { L, b, c, Wb, P, ra: rk(ra, 1), rb: rk(rb, 1) } : null;
    });
    const { L, b, c, Wb, P, ra, rb } = v;
    const over = L > b ? `, so it overhangs B by ${L - b} m` : ", so B is at its right end";
    return {
      prompt: `A uniform plank of length **${L} m** and weight **${Wb} N** rests on two supports. Support A is at its left end and support B is **${b} m** from A${over}. A person weighing **${P} N** stands **${c} m** from A. Find the reactions at A and B.`,
      answerType: "multi",
      given: [{ label: "_len", value: L }, { label: "_wb", value: Wb }, { label: "_b", value: b }, { label: "_p", value: P }, { label: "_c", value: c }],
      parts: [
        partNum("ra", "RA", "Reaction at A, in N", ra, 0.05, "Take moments about B, where RB has no moment, or use RA + RB = total weight once RB is known."),
        partNum("rb", "RB", "Reaction at B, in N", rb, 0.05, `Take moments about A: RB × ${b} = the plank's weight × ${L / 2} + the person's weight × ${c}.`),
      ],
      explanation: `Moments about A: RB × ${b} = ${Wb} × ${L / 2} + ${P} × ${c} = ${Wb * (L / 2) + P * c}, so RB = **${num(rb)} N**. Up = down: RA = ${Wb} + ${P} − ${num(rb)} = **${num(ra)} N**.`,
      params: { kind, L, b, c, Wb, P, ra, rb },
    };
  }
  const v = redraw(() => {
    const L = rng.pick([6, 8, 10, 12]), b = L / 2 + rng.int(1, L / 2 - 1);
    const Wb = 20 * rng.int(5, 30), W = 10 * rng.int(8, 40);
    const y = (Wb * (b - L / 2)) / W;
    return exactDp(y, 1) && y >= 0.2 && y < L - b - 0.1 ? { L, b, Wb, W, y: rk(y, 1) } : null;
  });
  const { L, b, Wb, W, y } = v;
  return {
    prompt: `A uniform plank of length **${L} m** and weight **${Wb} N** rests on supports A (at its left end) and B (**${b} m** from A), so it overhangs B by ${L - b} m. A person weighing **${W} N** walks out along the overhang. The plank is about to tip when the reaction at A falls to zero.`,
    answerType: "multi",
    given: [{ label: "_len", value: L }, { label: "_wb", value: Wb }, { label: "_b", value: b }, { label: "_w", value: W }],
    parts: [
      partNum("dist", "Distance", "How far beyond B can the person stand, in m, before the plank tips? Give 1 decimal place", y, 0.05, `Take moments about B with RA = 0. The plank's weight is ${num(b - L / 2)} m to the left of B.`),
      partNum("rb", "RB", "What is the reaction at B at that moment, in N?", Wb + W, 0, "With RA = 0, B carries everything.", EXACT),
    ],
    explanation: `Take moments about B with RA = 0. The plank's weight acts ${L / 2} m from A, so ${num(b - L / 2)} m to the left of B: ${Wb} × ${num(b - L / 2)} = ${W} × y, so y = ${num(Wb * (b - L / 2))} / ${W} = **${num(y)} m**. Then RB = ${Wb} + ${W} = **${Wb + W} N**.`,
    params: { kind, L, b, Wb, W, y },
  };
}

function verifyMoments(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "moment": return near(x / p.d, p.F);
    case "force": return near(x * p.d, p.M);
    case "dist": return near(x * p.F, p.M);
    case "seesaw-dist": return nearDp(x, (p.W1 * p.d1) / p.W2, 1) && Math.abs(p.W2 * x - p.W1 * p.d1) <= 0.05 * p.W2 + 1e-9;
    case "seesaw-mass": return near(x * p.d2, p.m1 * p.d1);
    case "lever": return near(x * p.b, p.m * 10 * p.a, 1e-6);
    case "cm": return nearDp(x, (p.F * p.dcm) / 100, 2) && near(x * 100, p.F * p.dcm, 1e-6);
    case "three":
      if (p.ask === "F") return near(x * p.x, p.W1 * p.d1 + p.W2 * p.d2, 1e-6);
      return Math.abs(p.F * x - (p.W1 * p.d1 + p.W2 * p.d2)) <= 0.05 * p.F + 1e-9 && exactDp(x, 1);
    case "plank": {
      const left = p.W * p.p;
      const right = p.Wb * (p.L / 2 - p.p) + x * (p.L - p.p);
      return exactDp(x, 1) && Math.abs(left - right) <= 0.05 * (p.L - p.p) + 1e-9;
    }
    case "supports": {
      const loads = [{ x: p.L / 2, P: p.Wb }, { x: p.c, P: p.P }];
      const ra = toNum(ans.ra), rb = toNum(ans.rb);
      return exactDp(ra, 1) && exactDp(rb, 1) && equilibrium(loads, 0, p.b, ra, rb, p.L);
    }
    case "tip": {
      const y = toNum(ans.dist), rb = toNum(ans.rb);
      // Moments about the left end with RA = 0.
      const ok = exactDp(y, 1) && Math.abs(p.Wb * (p.L / 2) + p.W * (p.b + y) - rb * p.b) <= 0.05 * p.W + 1e-9;
      return ok && near(rb, p.Wb + p.W, 1e-6);
    }
    default: return false;
  }
}

// =====================================================================
// Stress and strain
// =====================================================================
function genStress(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["stress", "force", "strain", "ext"]);
    if (kind === "stress" || kind === "force") {
      const A = rng.pick([0.25, 0.5, 1, 2, 4]);
      const sigma = 5000 * rng.int(2, 30); // 10 to 150 kPa under a pad foundation
      const F = sigma * A;
      if (kind === "stress") {
        return {
          prompt: `A concrete pad foundation with a base area of **${num(A)} m²** carries a downward (compressive) load of **${F} N**. What is the stress (pressure) on the ground under it, in Pa (N/m²)?`,
          answerType: "number", answer: sigma, tolerance: 0,
          given: [{ label: "_force", value: F }, { label: "_area", value: A }],
          explanation: `Stress = force ÷ area: \`_force / _area\` = ${F} / ${num(A)} = **${sigma} Pa**.`,
          hints: ["Stress = force ÷ cross-sectional area.", "N ÷ m² gives Pa."],
          params: { kind, A, sigma, F },
        };
      }
      return {
        prompt: `A concrete pad foundation with a base area of **${num(A)} m²** puts a stress (pressure) of **${sigma} Pa** on the ground under it. What downward load does it carry, in N?`,
        answerType: "number", answer: F, tolerance: 0,
        given: [{ label: "_stress", value: sigma }, { label: "_area", value: A }],
        explanation: `Force = stress × area: \`_stress * _area\` = ${sigma} × ${num(A)} = **${F} N**.`,
        hints: ["Stress = force ÷ area, so force = stress × area."],
        params: { kind, A, sigma, F },
      };
    }
    if (kind === "strain") {
      const L = rng.pick([200, 250, 400, 500, 800, 1000, 2000]), dL = rng.int(1, 8);
      const eps = dL / L;
      return {
        prompt: `A wire of original length **${L} mm** stretches by **${dL} mm**. What is the strain? Give it as a decimal (no units).`,
        answerType: "number", answer: rk(eps, 6), tolerance: 1e-9,
        given: [{ label: "_ext", value: dL }, { label: "_len", value: L }],
        explanation: `Strain = extension ÷ original length: \`_ext / _len\` = ${dL} / ${L} = **${numS(eps)}**.`,
        hints: ["Strain = change in length ÷ original length.", "Both lengths are in mm, so the units cancel."],
        params: { kind, L, dL, eps },
      };
    }
    const L = rng.pick([200, 400, 500, 800, 1000, 1200, 2000]), eps = rng.pick([0.0005, 0.001, 0.0015, 0.002, 0.0025]);
    const dL = eps * L;
    return {
      prompt: `A rod of original length **${L} mm** is under a strain of **${eps}**. By how much does it extend, in mm?`,
      answerType: "number", answer: rk(dL, 3), tolerance: 1e-9,
      given: [{ label: "_strain", value: eps }, { label: "_len", value: L }],
      explanation: `Extension = strain × original length: \`_strain * _len\` = ${eps} × ${L} = **${num(dL)} mm**.`,
      hints: ["Strain = extension ÷ original length, so extension = strain × original length."],
      params: { kind, L, eps, dL },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["mpa", "area-m2", "rod-stress", "strain-pct"]);
    if (kind === "mpa") {
      const { F, A, sigma } = redraw(() => {
        const F = rng.int(5, 200), A = 25 * rng.int(4, 80);
        const sigma = (F * 1000) / A;
        return Number.isInteger(sigma) && sigma >= 10 && sigma <= 400 ? { F, A, sigma } : null;
      });
      return {
        prompt: `A tie bar with a cross-sectional area of **${A} mm²** carries a tensile force of **${F} kN**. What is the stress in it, in MPa (N/mm²)?`,
        answerType: "number", answer: sigma, tolerance: 0,
        given: [{ label: "_force_kn", value: F }, { label: "_area", value: A }],
        explanation: `${F} kN = ${F * 1000} N. Stress = \`_force_kn * 1000 / _area\` = ${F * 1000} / ${A} = **${sigma} MPa**.`,
        hints: ["Convert kN to N first: × 1000.", "N ÷ mm² gives N/mm², which is MPa."],
        params: { kind, F, A, sigma },
      };
    }
    if (kind === "area-m2") {
      const A = 5 * rng.int(4, 400);
      return {
        prompt: `A steel section has a cross-sectional area of **${A} mm²**. Write this area in m². (1 m² = 1 000 000 mm²; give it as a decimal.)`,
        answerType: "number", answer: rk(A / 1e6, 6), tolerance: 1e-9,
        given: [{ label: "_area_mm2", value: A }],
        explanation: `1 m² = 10⁶ mm², so divide by 1 000 000: \`_area_mm2 / 1000000\` = **${num(A / 1e6)} m²**.`,
        hints: ["1 m = 1000 mm, so 1 m² = 1000 × 1000 mm².", "Divide the mm² figure by that."],
        params: { kind, A },
      };
    }
    if (kind === "rod-stress") {
      const { d, F, sigma } = redraw(() => {
        const d = rng.int(8, 40), F = rng.int(5, 150);
        const sigma = (4000 * F) / (Math.PI * d * d);
        return sigma >= 20 && sigma <= 500 && !isTie(sigma, 1) ? { d, F, sigma: rk(sigma, 1) } : null;
      });
      return {
        prompt: `A solid round rod of diameter **${d} mm** carries a tensile force of **${F} kN**. What is the stress in it, in MPa? Round to 1 decimal place.`,
        answerType: "number", answer: sigma, tolerance: 0.05,
        given: [{ label: "_d", value: d }, { label: "_force_kn", value: F }],
        explanation: `Area = π × ${d}² ÷ 4 = \`pi * _d^2 / 4\` = ${num(Math.PI * d * d / 4)} mm². Stress = \`_force_kn * 1000 / (pi * _d^2 / 4)\` = ${F * 1000} / ${num(Math.PI * d * d / 4)} ≈ **${num(sigma)} MPa**.`,
        hints: ["A circle's area is π × d² ÷ 4. Keep the units in mm.", "Convert kN to N, then stress = force ÷ area in N/mm² (MPa)."],
        params: { kind, d, F, sigma },
      };
    }
    const { dL, L, pct } = redraw(() => {
      const dL = rng.int(1, 20), L = rng.int(1, 8);
      const pct = dL / (10 * L);
      return exactDp(pct, 3) && dL <= 3 * L ? { dL, L, pct: rk(pct, 3) } : null; // at most 0.3% strain
    });
    return {
      prompt: `A cable of original length **${L} m** stretches by **${dL} mm** under load. What is the strain, as a percentage? Round to 3 decimal places if needed.`,
      answerType: "number", answer: pct, tolerance: 0.0005,
      given: [{ label: "_ext_mm", value: dL }, { label: "_len_m", value: L }],
      explanation: `Put both lengths in mm: ${L} m = ${L * 1000} mm. Strain = ${dL} / ${L * 1000} = ${numS(dL / (L * 1000))}. As a percentage (× 100): \`_ext_mm / (_len_m * 1000) * 100\` = **${num(pct)} %**.`,
      hints: ["Use the same unit for both lengths: convert metres to mm (× 1000).", "Strain = extension ÷ original length; × 100 for a percentage."],
      params: { kind, dL, L, pct },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["E-find", "ext-find", "force-find"]);
    const [mat, E0] = rng.pick(MAT);
    if (kind === "E-find") {
      const v = redraw(() => {
        const F = rng.int(10, 120), A = 10 * rng.int(5, 60), L = 0.5 * rng.int(2, 8);
        const dL = (1000 * F * L) / (A * E0);
        return exactDp(dL, 2) && dL >= 0.1 && dL <= 5 ? { F, A, L, dL: rk(dL, 2) } : null;
      });
      const { F, A, L, dL } = v;
      return {
        prompt: `A test bar of an unknown metal, with cross-sectional area **${A} mm²** and length **${num(L)} m**, carries a tensile force of **${F} kN** and is measured to extend by **${num(dL)} mm**. What is the Young's modulus of the material, in GPa?`,
        answerType: "number", answer: E0, tolerance: 0,
        given: [{ label: "_force_kn", value: F }, { label: "_area", value: A }, { label: "_len_m", value: L }, { label: "_ext", value: dL }],
        explanation: `Stress = ${F * 1000} / ${A} = ${num((F * 1000) / A)} MPa. Strain = ${num(dL)} / ${L * 1000} = ${numS(dL / (L * 1000))}. E = stress ÷ strain = ${num((F * 1000) / A / (dL / (L * 1000)))} MPa = **${E0} GPa**.`,
        hints: ["Stress = F ÷ A, with F in N and A in mm² (so MPa).", "Strain = extension ÷ original length, both in mm.", "E = stress ÷ strain, then ÷ 1000 to turn MPa into GPa."],
        params: { kind, F, A, L, dL, E: E0 },
      };
    }
    if (kind === "ext-find") {
      const v = redraw(() => {
        const F = rng.int(10, 150), A = 10 * rng.int(5, 80), L = 0.5 * rng.int(2, 10);
        const dL = (1000 * F * L) / (A * E0);
        return dL >= 0.05 && dL <= 8 && !isTie(dL, 2) ? { F, A, L, dL: rk(dL, 2) } : null;
      });
      const { F, A, L, dL } = v;
      return {
        prompt: `A ${mat} bar (E = **${E0} GPa**) of cross-sectional area **${A} mm²** and length **${num(L)} m** carries a tensile force of **${F} kN**. By how much does it extend, in mm? Round to 2 decimal places.`,
        answerType: "number", answer: dL, tolerance: 0.005,
        given: [{ label: "_force_kn", value: F }, { label: "_area", value: A }, { label: "_len_m", value: L }, { label: "_e_gpa", value: E0 }],
        explanation: `Stress = \`_force_kn * 1000 / _area\` = ${num((F * 1000) / A)} MPa. Strain = stress ÷ E = ${num((F * 1000) / A)} / ${E0 * 1000} = ${numS((F * 1000) / A / (E0 * 1000))}. Extension = strain × ${L * 1000} mm ≈ **${num(dL)} mm**.`,
        hints: ["Find the stress first, in MPa.", "Strain = stress ÷ E, with E in MPa (GPa × 1000).", "Extension = strain × original length in mm."],
        params: { kind, F, A, L, dL, E: E0 },
      };
    }
    const v = redraw(() => {
      const A = 10 * rng.int(5, 80), L = 0.5 * rng.int(2, 10), dL = 0.05 * rng.int(4, 60);
      const F = (dL * E0 * A) / (1000 * L);
      return exactDp(F, 1) && F >= 1 ? { A, L, dL: rk(dL, 2), F: rk(F, 1) } : null;
    });
    const { A, L, dL, F } = v;
    return {
      prompt: `A ${mat} rod (E = **${E0} GPa**) of cross-sectional area **${A} mm²** and length **${num(L)} m** extends by **${num(dL)} mm**. What tensile force is it carrying, in kN? Give 1 decimal place.`,
      answerType: "number", answer: F, tolerance: 0.05,
      given: [{ label: "_area", value: A }, { label: "_len_m", value: L }, { label: "_ext", value: dL }, { label: "_e_gpa", value: E0 }],
      explanation: `Strain = ${num(dL)} / ${L * 1000} = ${numS(dL / (L * 1000))}. Stress = E × strain = ${E0 * 1000} × ${numS(dL / (L * 1000))} = ${num((E0 * 1000 * dL) / (L * 1000))} MPa. Force = stress × area = ${num((E0 * 1000 * dL) / (L * 1000))} × ${A} = ${num(F * 1000)} N = **${num(F)} kN**.`,
      hints: ["Strain = extension ÷ original length, both in mm.", "Stress = E × strain (E in MPa).", "Force = stress × area, then convert N to kN."],
      params: { kind, A, L, dL, F, E: E0 },
    };
  }

  // expert: size a rod for an allowed stress, or limits on stress and extension
  const kind = rng.pick(["design", "limits"]);
  const [mat, E] = rng.pick(MAT);
  if (kind === "design") {
    const v = redraw(() => {
      const sig = rng.pick([100, 120, 150, 160, 200, 250]), F = rng.int(10, 300), L = 0.5 * rng.int(2, 10);
      const A = (1000 * F) / sig;
      if (!Number.isInteger(A) || A < 100 || A > 3000) return null;
      const d = Math.sqrt((4 * A) / Math.PI), dL = (sig * L) / E;
      return !isTie(d, 1) && !isTie(dL, 2) && dL >= 0.05 ? { sig, F, L, A, d: rk(d, 1), dL: rk(dL, 2) } : null;
    });
    const { sig, F, L, A, d, dL } = v;
    return {
      prompt: `A solid round ${mat} rod (E = **${E} GPa**) must carry a tensile force of **${F} kN** without the stress exceeding **${sig} MPa**. The rod is **${num(L)} m** long.`,
      answerType: "multi",
      given: [{ label: "_force_kn", value: F }, { label: "_sigma", value: sig }, { label: "_len_m", value: L }, { label: "_e_gpa", value: E }],
      parts: [
        partNum("area", "Area", "Minimum cross-sectional area, in mm²", A, 0, "At the limit, stress = allowed stress = force ÷ area.", EXACT),
        partNum("dia", "Diameter", "Minimum diameter, in mm (1 decimal place)", d, 0.05, "Use area = π × d² ÷ 4 and solve for d."),
        partNum("ext", "Extension", "Extension of the rod at that stress, in mm (2 decimal places)", dL, 0.005, "Strain = stress ÷ E (E in MPa), then × the length in mm."),
      ],
      explanation: `Minimum area: A = F ÷ σ = \`_force_kn * 1000 / _sigma\` = ${F * 1000} / ${sig} = **${A} mm²**.\n\nDiameter: d = √(4A ÷ π) = √(4 × ${A} / π) ≈ **${num(d)} mm**.\n\nExtension: strain = ${sig} / ${E * 1000} = ${numS(sig / (E * 1000))}, so ΔL = strain × ${L * 1000} mm ≈ **${num(dL)} mm**. (It depends only on the stress, not on the area.)`,
      params: { kind, sig, F, L, A, d, dL, E },
    };
  }
  const v = redraw(() => {
    const d = rng.int(10, 30), L = 0.5 * rng.int(2, 8), sig = rng.pick([120, 150, 160, 200, 240]);
    const A = (Math.PI * d * d) / 4, dMax = 0.25 * rng.int(2, 12);
    const Fs = (sig * A) / 1000, Fe = (dMax * E * A) / (1000 * L);
    if (isTie(Fs, 1) || isTie(Fe, 1) || Fs < 1 || Fe < 1) return null;
    if (Math.abs(Fs - Fe) / Math.min(Fs, Fe) < 0.05) return null;
    return { d, L, sig, dMax, Fs: rk(Fs, 1), Fe: rk(Fe, 1), Fsafe: Math.min(rk(Fs, 1), rk(Fe, 1)) };
  });
  const { d, L, sig, dMax, Fs, Fe, Fsafe } = v;
  return {
    prompt: `A solid round ${mat} rod (E = **${E} GPa**) has a diameter of **${d} mm** and a length of **${num(L)} m**. Under tension the stress must not exceed **${sig} MPa**, and the extension must not exceed **${num(dMax)} mm**.`,
    answerType: "multi",
    given: [{ label: "_d", value: d }, { label: "_len_m", value: L }, { label: "_sigma", value: sig }, { label: "_max_ext", value: dMax }, { label: "_e_gpa", value: E }],
    parts: [
      partNum("stress", "Stress", "Largest force allowed by the stress limit, in kN (1 decimal place)", Fs, 0.05, "Force = allowed stress × area. Area = π × d² ÷ 4 in mm²."),
      partNum("ext", "Extension", "Largest force allowed by the extension limit, in kN (1 decimal place)", Fe, 0.05, "ΔL = F × L ÷ (A × E): rearrange for F, keeping E in MPa and L in mm."),
      partNum("safe", "Safe load", "Largest force the rod may carry, in kN (1 decimal place)", Fsafe, 0.05, "The rod must satisfy both limits: take the smaller force."),
    ],
    explanation: `Area = π × ${d}² ÷ 4 = ${num(Math.PI * d * d / 4)} mm².\n\nStress limit: F = ${sig} × ${num(Math.PI * d * d / 4)} / 1000 ≈ **${num(Fs)} kN**.\n\nExtension limit: F = ΔL × A × E ÷ L = ${num(dMax)} × ${num(Math.PI * d * d / 4)} × ${E * 1000} / ${L * 1000} / 1000 ≈ **${num(Fe)} kN**.\n\nBoth must hold, so the safe load is the smaller: **${num(Fsafe)} kN**.`,
    params: { kind, d, L, sig, dMax, E, Fs, Fe, Fsafe },
  };
}

function verifyStress(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "stress": return near(x * p.A, p.F);
    case "force": return near(x / p.A, p.sigma);
    case "strain": return near(x * p.L, p.dL, 1e-9 * p.L);
    case "ext": return near(x / p.L, p.eps, 1e-9);
    case "mpa": return near(x * p.A, p.F * 1000, 1e-6);
    case "area-m2": return near(x * 1e6, p.A, 1e-6);
    case "rod-stress": {
      const A = (Math.PI * p.d ** 2) / 4;
      return exactDp(x, 1) && Math.abs(x * A - p.F * 1000) <= 0.05 * A + 1e-6;
    }
    case "strain-pct": return exactDp(x, 3) && Math.abs((x / 100) * p.L * 1000 - p.dL) <= (0.0005 / 100) * p.L * 1000 + 1e-9;
    case "E-find": return near(x, (p.F * 1000 * p.L * 1000) / (p.A * p.dL) / 1000, 1e-6);
    case "ext-find": return exactDp(x, 2) && Math.abs((p.F * 1000 * p.L * 1000) / (p.A * p.E * 1000) - x) <= 0.005 + 1e-9;
    case "force-find": return exactDp(x, 1) && Math.abs(((p.dL / (p.L * 1000)) * p.E * 1000 * p.A) / 1000 - x) <= 0.05 + 1e-9;
    case "design": {
      const area = toNum(ans.area), dia = toNum(ans.dia), ext = toNum(ans.ext);
      const aOk = near(p.F * 1000 / area, p.sig, 1e-6);
      const dOk = exactDp(dia, 1) && (Math.PI * (dia - 0.05) ** 2) / 4 <= p.A + 1e-9 && p.A <= (Math.PI * (dia + 0.05) ** 2) / 4 + 1e-9;
      const eOk = exactDp(ext, 2) && Math.abs(ext - (p.sig / (p.E * 1000)) * p.L * 1000) <= 0.005 + 1e-9;
      return aOk && dOk && eOk;
    }
    case "limits": {
      const A = (Math.PI * p.d ** 2) / 4;
      const s = toNum(ans.stress), e = toNum(ans.ext), f = toNum(ans.safe);
      const sOk = exactDp(s, 1) && Math.abs((s * 1000) / A - p.sig) <= (0.05 * 1000) / A + 1e-9;
      // Extension at the force e must equal the limit, within the rounding of e.
      const ext = (F) => (F * 1000 * p.L * 1000) / (A * p.E * 1000);
      const eOk = exactDp(e, 1) && Math.abs(ext(e) - p.dMax) <= ext(0.05) + 1e-9;
      const fOk = exactDp(f, 1) && near(f, Math.min(s, e));
      return sOk && eOk && fOk;
    }
    default: return false;
  }
}

// =====================================================================
// Beams and reactions
// =====================================================================
const BEAM_INTRO = "A light beam AB (its own weight is ignored) rests on a support at A and a support at B.";

function genBeams(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["mid", "offset"]);
    if (kind === "mid") {
      const L = rng.int(3, 12), P = 2 * rng.int(2, 40);
      return {
        prompt: `${BEAM_INTRO} The span AB is **${L} m**. A single load of **${P} kN** acts at the midpoint of the beam. What is the reaction at A, in kN?`,
        answerType: "number", answer: P / 2, tolerance: 0,
        given: [{ label: "_p", value: P }, { label: "_span", value: L }],
        explanation: `The load is at the middle, so the two supports share it equally: RA = RB = \`_p / 2\` = **${P / 2} kN**.`,
        hints: ["Where is the load: is it nearer one support?", "Total downward load = RA + RB."],
        params: { kind, L, P, a: L / 2, ask: "ra" },
      };
    }
    const v = redraw(() => {
      const L = rng.pick([4, 5, 6, 8, 10]), a = rng.int(1, L - 1), P = 5 * rng.int(2, 30);
      return L / 2 !== a && Number.isInteger((P * a) / L) && Number.isInteger(P - (P * a) / L) ? { L, a, P } : null;
    });
    const { L, a, P } = v;
    const ask = rng.pick(["ra", "rb"]);
    const rb = (P * a) / L, ra = P - rb;
    const ans = ask === "rb" ? rb : ra;
    return {
      prompt: `${BEAM_INTRO} The span AB is **${L} m**. A load of **${P} kN** acts **${a} m** from A. What is the reaction at ${ask === "rb" ? "B" : "A"}, in kN?`,
      answerType: "number", answer: ans, tolerance: 0, ...EXACT,
      given: [{ label: "_p", value: P }, { label: "_a", value: a }, { label: "_span", value: L }],
      explanation: ask === "rb"
        ? `Moments about A: RB × ${L} = ${P} × ${a}, so RB = \`_p * _a / _span\` = **${rb} kN**.`
        : `Moments about B: RA × ${L} = ${P} × ${L - a} (the load is ${L - a} m from B), so RA = **${ra} kN**. (Check: RA + RB = ${ra} + ${rb} = ${P} kN.)`,
      hints: ask === "rb"
        ? ["Take moments about A: the reaction at A then has no moment.", "RB × span = load × its distance from A."]
        : ["Take moments about B: the reaction at B then has no moment.", "RA × span = load × its distance from B."],
      params: { kind, L, a, P, ask },
    };
  }

  if (difficulty === "medium") {
    const ask = rng.pick(["ra", "rb"]);
    const v = redraw(() => {
      const L = rng.pick([6, 8, 10, 12]), x1 = rng.int(1, L - 2), x2 = rng.int(x1 + 1, L - 1);
      const P1 = 5 * rng.int(2, 16), P2 = 5 * rng.int(2, 16);
      const { ra, rb } = reactions([{ x: x1, P: P1 }, { x: x2, P: P2 }], 0, L);
      return exactDp(ra, 1) && exactDp(rb, 1) && ra > 0 && rb > 0 ? { L, x1, x2, P1, P2, ra: rk(ra, 1), rb: rk(rb, 1) } : null;
    });
    const { L, x1, x2, P1, P2, ra, rb } = v;
    const ans = ask === "rb" ? rb : ra;
    return {
      prompt: `${BEAM_INTRO} The span AB is **${L} m**. It carries a load of **${P1} kN** at **${x1} m** from A and a load of **${P2} kN** at **${x2} m** from A. What is the reaction at ${ask === "rb" ? "B" : "A"}, in kN?`,
      answerType: "number", answer: ans, tolerance: 0.05,
      given: [{ label: "_p1", value: P1 }, { label: "_x1", value: x1 }, { label: "_p2", value: P2 }, { label: "_x2", value: x2 }, { label: "_span", value: L }],
      explanation: ask === "rb"
        ? `Moments about A: RB × ${L} = ${P1} × ${x1} + ${P2} × ${x2} = ${P1 * x1 + P2 * x2}, so RB = **${num(rb)} kN**. (Check: RA = ${P1 + P2} − ${num(rb)} = ${num(ra)} kN.)`
        : `Moments about B: RA × ${L} = ${P1} × ${L - x1} + ${P2} × ${L - x2} = ${P1 * (L - x1) + P2 * (L - x2)}, so RA = **${num(ra)} kN**. (Check: RB = ${P1 + P2} − ${num(ra)} = ${num(rb)} kN.)`,
      hints: [ask === "rb" ? "Take moments about A so that RA drops out." : "Take moments about B so that RB drops out.", "Add the moments of both loads about that support, then divide by the span.", "Check with RA + RB = total load."],
      params: { kind: "two", L, x1, x2, P1, P2, ask, ra, rb },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["three", "overhang"]);
    if (kind === "three") {
      const v = redraw(() => {
        const L = rng.pick([8, 10, 12]);
        const xs = [rng.int(1, L - 1), rng.int(1, L - 1), rng.int(1, L - 1)].sort((a, b) => a - b);
        if (new Set(xs).size !== 3) return null;
        const Ps = [0, 0, 0].map(() => 5 * rng.int(2, 12));
        const loads = xs.map((x, i) => ({ x, P: Ps[i] }));
        const { ra, rb } = reactions(loads, 0, L);
        return exactDp(ra, 1) && exactDp(rb, 1) && ra > 0 && rb > 0 ? { L, loads, ra: rk(ra, 1), rb: rk(rb, 1) } : null;
      });
      const { L, loads, ra, rb } = v;
      const total = loads.reduce((s, l) => s + l.P, 0);
      return {
        prompt: `${BEAM_INTRO} The span AB is **${L} m**, and it carries three loads:\n\n${listLoads(loads.map((l) => `**${l.P} kN** at **${l.x} m** from A`))}\n\nFind the reactions at A and B.`,
        answerType: "multi",
        given: [{ label: "_span", value: L }, ...loads.map((l, i) => ({ label: `_p${i + 1}`, value: l.P })), ...loads.map((l, i) => ({ label: `_x${i + 1}`, value: l.x }))],
        parts: [
          partNum("ra", "RA", "Reaction at A, in kN", ra, 0.05, "Take moments about B: RA × span = the sum of load × its distance from B."),
          partNum("rb", "RB", "Reaction at B, in kN", rb, 0.05, "Take moments about A: RB × span = the sum of load × its distance from A."),
        ],
        explanation: `Moments about A: RB × ${L} = ${loads.map((l) => `${l.P} × ${l.x}`).join(" + ")} = ${loads.reduce((s, l) => s + l.P * l.x, 0)}, so RB = **${num(rb)} kN**.\n\nUp = down: RA = ${total} − ${num(rb)} = **${num(ra)} kN**.`,
        params: { kind, L, loads, ra, rb },
      };
    }
    const v = redraw(() => {
      const b = rng.pick([4, 5, 6, 8]), o = rng.int(1, 3), x1 = rng.int(1, b - 1);
      const P1 = 10 * rng.int(2, 15), P2 = 5 * rng.int(2, 12);
      const loads = [{ x: x1, P: P1 }, { x: b + o, P: P2 }];
      const { ra, rb } = reactions(loads, 0, b);
      return exactDp(ra, 1) && exactDp(rb, 1) && ra >= 2 && rb > 0 ? { b, o, x1, P1, P2, loads, ra: rk(ra, 1), rb: rk(rb, 1) } : null;
    });
    const { b, o, x1, P1, P2, loads, ra, rb } = v;
    return {
      prompt: `A light beam (its own weight is ignored) rests on a support at A and a support at B, **${b} m** apart. The beam extends **${o} m** beyond B. A load of **${P1} kN** acts **${x1} m** from A, and a load of **${P2} kN** hangs from the far end, beyond B. Find the reactions at A and B.`,
      answerType: "multi",
      given: [{ label: "_b", value: b }, { label: "_o", value: o }, { label: "_p1", value: P1 }, { label: "_x1", value: x1 }, { label: "_p2", value: P2 }],
      parts: [
        partNum("ra", "RA", "Reaction at A, in kN", ra, 0.05, "Use up = down once RB is known, or take moments about B: the end load is on one side of B and the first load on the other."),
        partNum("rb", "RB", "Reaction at B, in kN", rb, 0.05, `Take moments about A. The end load is ${b + o} m from A, not ${o} m: distances are measured from A.`),
      ],
      explanation: `Moments about A: RB × ${b} = ${P1} × ${x1} + ${P2} × ${b + o} = ${P1 * x1 + P2 * (b + o)}, so RB = **${num(rb)} kN**.\n\nUp = down: RA = ${P1 + P2} − ${num(rb)} = **${num(ra)} kN**.`,
      params: { kind, b, o, x1, P1, P2, loads, ra, rb },
    };
  }

  // expert: UDL as a resultant + a point load; reactions and the shear at a section
  const v = redraw(() => {
    const L = rng.pick([6, 8, 10, 12]);
    const full = rng.pick([true, false]);
    const s = full ? 0 : rng.int(1, L - 3), e = full ? L : rng.int(s + 2, L - 1);
    const w = rng.int(2, 10), c = rng.int(1, L - 1), P = 5 * rng.int(2, 14), xs = rng.int(1, L - 1);
    if (c === s || c === e || xs === c || xs === s || xs === e) return null;
    const udl = { x: (s + e) / 2, P: w * (e - s) };
    const loads = [udl, { x: c, P }];
    const { ra, rb } = reactions(loads, 0, L);
    if (!(exactDp(ra, 1) && exactDp(rb, 1) && ra >= 2 && rb >= 2)) return null;
    const left = Math.max(0, Math.min(xs, e) - s);
    const V = ra - w * left - (c < xs ? P : 0);
    return exactDp(V, 1) ? { L, full, s, e, w, c, P, xs, ra: rk(ra, 1), rb: rk(rb, 1), V: rk(V, 1) } : null;
  });
  const { L, full, s, e, w, c, P, xs, ra, rb, V } = v;
  const udlText = full ? `a UDL of **${w} kN/m** over the whole span` : `a UDL of **${w} kN/m** from **${s} m** to **${e} m** from A`;
  const left = Math.max(0, Math.min(xs, e) - s);
  return {
    prompt: `A light beam AB (its own weight is ignored) has a span of **${L} m**, with a support at each end. It carries ${udlText}, and a point load of **${P} kN** at **${c} m** from A. Treat the UDL as one force (w × its length) acting at the middle of its length.\n\nFind the reactions and the shear force at the section **${xs} m** from A (shear = the sum of the vertical forces to the left of the section, upward positive).`,
    answerType: "multi",
    given: [{ label: "_span", value: L }, { label: "_w", value: w }, { label: "_p", value: P }, { label: "_c", value: c }, { label: "_xs", value: xs }],
    parts: [
      partNum("ra", "RA", "Reaction at A, in kN", ra, 0.05, "Replace the UDL by its resultant, then take moments about B."),
      partNum("rb", "RB", "Reaction at B, in kN", rb, 0.05, "Take moments about A: the UDL resultant acts at the midpoint of its length."),
      partNum("shear", "Shear", `Shear force at ${xs} m from A, in kN (negative if downward)`, V, 0.05, "Start with RA, then subtract the loads to the left of the section. Only the part of a UDL to the left counts."),
    ],
    explanation: `UDL resultant = ${w} × ${e - s} = ${w * (e - s)} kN at ${num((s + e) / 2)} m from A.\n\nMoments about A: RB × ${L} = ${w * (e - s)} × ${num((s + e) / 2)} + ${P} × ${c} = ${num(w * (e - s) * ((s + e) / 2) + P * c)}, so RB = **${num(rb)} kN**. Then RA = ${w * (e - s) + P} − ${num(rb)} = **${num(ra)} kN**.\n\nShear at ${xs} m: RA − (UDL to the left: ${w} × ${num(left)} = ${num(w * left)})${c < xs ? ` − ${P} (the point load is to the left)` : ""} = **${num(V)} kN**.`,
    params: { kind: "udl", L, full, s, e, w, c, P, xs, ra, rb, V },
  };
}

function verifyBeams(q, ans) {
  const p = q.params;
  if (p.kind === "mid" || p.kind === "offset" || p.kind === "two") {
    const loads = p.kind === "two" ? [{ x: p.x1, P: p.P1 }, { x: p.x2, P: p.P2 }] : [{ x: p.a, P: p.P }];
    const total = loads.reduce((s, l) => s + l.P, 0);
    const x = toNum(ans);
    if (!Number.isFinite(x)) return false;
    const [ra, rb] = p.ask === "ra" ? [x, total - x] : [total - x, x];
    if (p.kind === "two" && !exactDp(x, 1)) return false;
    return equilibrium(loads, 0, p.L, ra, rb, p.L);
  }
  if (p.kind === "three") {
    const ra = toNum(ans.ra), rb = toNum(ans.rb);
    return exactDp(ra, 1) && exactDp(rb, 1) && equilibrium(p.loads, 0, p.L, ra, rb, p.L);
  }
  if (p.kind === "overhang") {
    const ra = toNum(ans.ra), rb = toNum(ans.rb);
    return exactDp(ra, 1) && exactDp(rb, 1) && equilibrium(p.loads, 0, p.b, ra, rb, p.b + p.o);
  }
  if (p.kind === "udl") {
    const ra = toNum(ans.ra), rb = toNum(ans.rb), V = toNum(ans.shear);
    const loads = [{ x: (p.s + p.e) / 2, P: p.w * (p.e - p.s) }, { x: p.c, P: p.P }];
    if (!(exactDp(ra, 1) && exactDp(rb, 1) && equilibrium(loads, 0, p.L, ra, rb, p.L))) return false;
    // Shear read from the right: V = -(RB - the downward loads to the right of the section).
    const right = p.w * Math.max(0, p.e - Math.max(p.xs, p.s)) + (p.c > p.xs ? p.P : 0);
    return exactDp(V, 1) && near(V, -(rb - right), 0.05);
  }
  return false;
}

// =====================================================================
// Factor of safety
// =====================================================================
const PARTS = ["steel cable", "tie rod", "hanger bar", "bolt", "support strut"];

function genFos(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["fos", "working", "ultimate"]);
    const { f, sw, su } = redraw(() => {
      const f = rng.pick([2, 2.5, 3, 4, 5, 6]), sw = 10 * rng.int(5, 40), su = f * sw;
      return su <= 900 ? { f, sw, su } : null; // failure stresses of common structural metals
    });
    const what = rng.pick(PARTS);
    if (kind === "fos") {
      return {
        prompt: `A ${what} fails at a stress of **${su} MPa** (its failure stress). In use, the working stress in it is **${sw} MPa**. What is the factor of safety?`,
        answerType: "number", answer: f, tolerance: 0,
        given: [{ label: "_failure", value: su }, { label: "_working", value: sw }],
        explanation: `Factor of safety = failure stress ÷ working stress: \`_failure / _working\` = ${su} / ${sw} = **${num(f)}**.`,
        hints: ["Factor of safety = failure stress ÷ working stress.", "Both stresses are already in MPa."],
        params: { kind, f, sw, su },
      };
    }
    if (kind === "working") {
      return {
        prompt: `A ${what} fails at a stress of **${su} MPa**. It is designed with a factor of safety of **${num(f)}**. What is the working stress, in MPa?`,
        answerType: "number", answer: sw, tolerance: 0,
        given: [{ label: "_failure", value: su }, { label: "_fos", value: f }],
        explanation: `Working stress = failure stress ÷ factor of safety: \`_failure / _fos\` = ${su} / ${num(f)} = **${sw} MPa**.`,
        hints: ["Factor of safety = failure stress ÷ working stress. Rearrange for the working stress."],
        params: { kind, f, sw, su },
      };
    }
    return {
      prompt: `A ${what} has a working stress of **${sw} MPa** and is designed with a factor of safety of **${num(f)}**. At what stress does it fail, in MPa?`,
      answerType: "number", answer: su, tolerance: 0,
      given: [{ label: "_working", value: sw }, { label: "_fos", value: f }],
      explanation: `Failure stress = working stress × factor of safety: \`_working * _fos\` = ${sw} × ${num(f)} = **${su} MPa**.`,
      hints: ["Factor of safety = failure stress ÷ working stress. Rearrange for the failure stress."],
      params: { kind, f, sw, su },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["fos-load", "safe-load", "cables"]);
    if (kind === "fos-load") {
      const f = rng.pick([1.5, 2, 2.5, 3, 4, 5, 6]), W = 2 * rng.int(3, 50), B = f * W;
      return {
        prompt: `A lifting chain breaks under a load of **${B} kN**. The load it is used to carry is **${W} kN**. What is the factor of safety?`,
        answerType: "number", answer: f, tolerance: 0,
        given: [{ label: "_breaking", value: B }, { label: "_working", value: W }],
        explanation: `Factor of safety = failure load ÷ working load: \`_breaking / _working\` = ${B} / ${W} = **${num(f)}**.`,
        hints: ["The same ratio works for loads: factor of safety = failure load ÷ working load."],
        params: { kind, f, W, B },
      };
    }
    if (kind === "safe-load") {
      const v = redraw(() => {
        const su = rng.pick([250, 300, 400, 450, 500, 600]), A = 10 * rng.int(5, 80), f = rng.pick([2, 2.5, 3, 4, 5]);
        const P = (su * A) / (f * 1000);
        return exactDp(P, 1) && P >= 1 ? { su, A, f, P: rk(P, 1) } : null;
      });
      const { su, A, f, P } = v;
      return {
        prompt: `A rod with a cross-sectional area of **${A} mm²** is made of a material that fails at **${su} MPa**. A factor of safety of **${num(f)}** is required. What is the largest safe tensile load, in kN? Give 1 decimal place.`,
        answerType: "number", answer: P, tolerance: 0.05,
        given: [{ label: "_failure", value: su }, { label: "_area", value: A }, { label: "_fos", value: f }],
        explanation: `Working stress = ${su} / ${num(f)} = ${num(su / f)} MPa. Safe load = working stress × area = \`_failure / _fos * _area\` = ${num((su / f) * A)} N = **${num(P)} kN**.`,
        hints: ["First find the working (allowed) stress: failure stress ÷ factor of safety.", "Then load = stress × area, in N because MPa × mm² = N. Convert to kN."],
        params: { kind, su, A, f, P },
      };
    }
    const v = redraw(() => {
      const B = 10 * rng.int(2, 12), W = 10 * rng.int(5, 40), f = rng.pick([2, 2.5, 3, 4, 5]);
      const r = (W * f) / B;
      const n = Math.ceil(r);
      return !Number.isInteger(r) && n >= 2 && n <= 14 ? { B, W, f, n } : null;
    });
    const { B, W, f, n } = v;
    return {
      prompt: `A platform load of **${W} kN** is hung from identical cables. Each cable breaks at **${B} kN**, and a factor of safety of **${num(f)}** is required for the whole load. How many cables are needed at least?`,
      answerType: "number", answer: n, tolerance: 0, ...EXACT,
      given: [{ label: "_load", value: W }, { label: "_breaking", value: B }, { label: "_fos", value: f }],
      explanation: `The cables together must break at ${W} × ${num(f)} = ${num(W * f)} kN. Each gives ${B} kN: ${num(W * f)} / ${B} = ${num((W * f) / B)}, so round **up** to **${n} cables**.`,
      hints: ["The total breaking load needed is the working load × the factor of safety.", "Divide by one cable's breaking load, then round up: you cannot use part of a cable."],
      params: { kind, B, W, f, n },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["check", "hang"]);
    if (kind === "check") {
      const meet = rng.pick([true, false]);
      const v = redraw(() => {
        const su = rng.pick([250, 300, 400, 450, 500, 600]), F = rng.int(5, 300), A = 10 * rng.int(5, 200);
        const sw = (F * 1000) / A;
        if (!Number.isInteger(sw) || sw < 20 || sw > 400) return null;
        const f = su / sw, req = rng.pick([1.5, 2, 2.5, 3]);
        if (isTie(f, 2) || Math.abs(f - req) < 0.1 || f < 0.5) return null;
        return f >= req === meet ? { su, F, A, sw, f: rk(f, 2), req } : null;
      });
      const { su, F, A, sw, f, req } = v;
      return {
        prompt: `A tie bar with a cross-sectional area of **${A} mm²** carries a tensile force of **${F} kN**. The material fails at **${su} MPa**, and the design rule requires a factor of safety of at least **${num(req)}**.`,
        answerType: "multi",
        given: [{ label: "_area", value: A }, { label: "_force_kn", value: F }, { label: "_failure", value: su }, { label: "_req", value: req }],
        parts: [
          partNum("stress", "Stress", "Working stress, in MPa", sw, 0, "Stress = force ÷ area, with the force in N.", EXACT),
          partNum("fos", "FoS", "Factor of safety (2 decimal places)", f, 0.005, "Factor of safety = failure stress ÷ working stress."),
          { id: "ok", label: "Meets rule", ask: "Does the bar meet the required factor of safety?", answerType: "choice", answer: meet ? "Yes" : "No", choices: rng.shuffle(["Yes", "No"]), hint: `Compare the factor of safety you found with ${num(req)}.` },
        ],
        explanation: `Working stress = \`_force_kn * 1000 / _area\` = ${F * 1000} / ${A} = **${sw} MPa**.\n\nFactor of safety = ${su} / ${sw} ≈ **${num(f)}**.\n\n${num(f)} is ${meet ? "at least" : "less than"} the required ${num(req)}: **${meet ? "Yes" : "No"}**.`,
        params: { kind, su, F, A, sw, f, req, meet },
      };
    }
    const v = redraw(() => {
      const su = rng.pick([250, 300, 400, 450, 500]), A = 10 * rng.int(10, 120), f = rng.pick([2, 2.5, 3, 4, 5, 6]), g = rng.pick([10, 9.81]);
      const m = (su * A) / (f * g);
      const frac = m - Math.floor(m);
      return m >= 20 && frac > 0.05 && frac < 0.95 ? { su, A, f, g, m: Math.floor(m) } : null;
    });
    const { su, A, f, g, m } = v;
    return {
      prompt: `A hanger rod has a cross-sectional area of **${A} mm²** and fails at a stress of **${su} MPa**. It must keep a factor of safety of at least **${num(f)}** when a mass hangs from it. Take g = **${g} N/kg**. What is the greatest mass it may carry, in whole kg? Round **down**.`,
      answerType: "number", answer: m, tolerance: 0, ...EXACT,
      given: [{ label: "_failure", value: su }, { label: "_area", value: A }, { label: "_fos", value: f }, { label: "_g", value: g }],
      explanation: `Failure load = ${su} × ${A} = ${su * A} N. Safe load = ${su * A} / ${num(f)} = ${num((su * A) / f)} N. Mass = load ÷ g = \`_failure * _area / _fos / _g\` = ${num((su * A) / f)} / ${g} ≈ ${num((su * A) / (f * g))} kg, so the greatest whole mass is **${m} kg**.`,
      hints: ["Failure load = failure stress × area (MPa × mm² = N).", "Divide by the factor of safety to get the safe load.", "Mass = load ÷ g. Round down: rounding up would break the rule."],
      params: { kind, su, A, f, g, m },
    };
  }

  // expert: choose the smallest standard section, or size shared bolts
  const kind = rng.pick(["choose", "bolts"]);
  if (kind === "choose") {
    const tables = [[10, 12, 16, 20, 25], [12, 16, 20, 25, 32], [8, 10, 12, 16, 20], [16, 20, 25, 32, 40]];
    const ds = rng.pick(tables), area = (d) => (Math.PI * d * d) / 4;
    const idx = rng.int(0, ds.length - 1);
    const v = redraw(() => {
      const su = rng.pick([250, 300, 400, 500, 600]), f = rng.pick([2, 2.5, 3, 4]), F = rng.int(5, 400);
      const Areq = (1000 * F * f) / su;
      const k = ds.findIndex((d) => area(d) >= Areq);
      if (k !== idx) return null;
      if (area(ds[k]) / Areq < 1.03 || (k > 0 && area(ds[k - 1]) / Areq > 0.97)) return null;
      const fos = (su * area(ds[k])) / (1000 * F);
      return !isTie(Areq, 1) && !isTie(fos, 2) ? { su, f, F, Areq: rk(Areq, 1), fos: rk(fos, 2), dSel: ds[k] } : null;
    });
    const { su, f, F, Areq, fos, dSel } = v;
    const labels = ds.map((d) => `${d} mm`);
    return {
      prompt: `A tie must carry a tensile force of **${F} kN** with a factor of safety of at least **${num(f)}**. The material fails at **${su} MPa**. Solid round bars are stocked in these diameters: **${ds.join(", ")} mm**. Choose the smallest bar that meets the factor of safety.`,
      answerType: "multi",
      given: [{ label: "_force_kn", value: F }, { label: "_fos", value: f }, { label: "_failure", value: su }],
      parts: [
        partNum("area", "Min area", "Minimum area for the required factor of safety, in mm² (1 decimal place)", Areq, 0.05, "Working stress = failure stress ÷ factor of safety. Area = force ÷ working stress."),
        { id: "size", label: "Bar", ask: "Smallest stocked diameter that is enough", answerType: "choice", answer: `${dSel} mm`, choices: rng.shuffle(labels), hint: "Find each bar's area (π × d² ÷ 4) and take the first one at least as big as the minimum area." },
        partNum("fos", "FoS", "Factor of safety that bar gives (2 decimal places)", fos, 0.005, "Working stress = force ÷ the chosen bar's area. Factor of safety = failure stress ÷ working stress."),
      ],
      explanation: `Working stress allowed = ${su} / ${num(f)} = ${num(su / f)} MPa. Minimum area = \`_force_kn * 1000 * _fos / _failure\` = ${F * 1000} / ${num(su / f)} ≈ **${num(Areq)} mm²**.\n\nAreas: ${ds.map((d) => `${d} mm → ${num(rk(area(d), 1))} mm²`).join(", ")}. The smallest that is large enough is **${dSel} mm**.\n\nIts working stress is ${F * 1000} / ${num(area(dSel))} ≈ ${num(F * 1000 / area(dSel))} MPa, so FoS = ${su} / ${num(F * 1000 / area(dSel))} ≈ **${num(fos)}**, a little above ${num(f)}.`,
      params: { kind, su, f, F, ds, Areq, fos, dSel },
    };
  }
  const v = redraw(() => {
    const n = rng.int(2, 6), F = n * rng.int(5, 60), su = rng.pick([250, 300, 400, 500, 600]), f = rng.pick([2, 2.5, 3, 4]);
    const per = F / n, A = (1000 * per * f) / su;
    if (!(exactDp(per, 1) && exactDp(A, 1)) || A < 30 || A > 2500) return null;
    const d = Math.sqrt((4 * A) / Math.PI), frac = d - Math.floor(d);
    return frac > 0.04 && frac < 0.96 ? { n, F, su, f, per: rk(per, 1), A: rk(A, 1), dMin: Math.ceil(d) } : null;
  });
  const { n, F, su, f, per, A, dMin } = v;
  return {
    prompt: `A load of **${F} kN** is shared equally by **${n} identical solid round rods** in tension. The rod material fails at **${su} MPa**, and a factor of safety of at least **${num(f)}** is required. Rods are available in whole-millimetre diameters.`,
    answerType: "multi",
    given: [{ label: "_force_kn", value: F }, { label: "_n", value: n }, { label: "_failure", value: su }, { label: "_fos", value: f }],
    parts: [
      partNum("load", "Per rod", "Load on each rod, in kN (1 decimal place)", per, 0.05, "Share the total load equally between the rods."),
      partNum("area", "Min area", "Minimum area of each rod, in mm² (1 decimal place)", A, 0.05, "Allowed stress = failure stress ÷ factor of safety; area = load per rod ÷ allowed stress."),
      partNum("dia", "Diameter", "Smallest whole-mm diameter that is enough, in mm", dMin, 0, "Solve π × d² ÷ 4 = the minimum area for d, then round up to the next whole millimetre.", EXACT),
    ],
    explanation: `Load per rod = ${F} / ${n} = **${num(per)} kN**.\n\nAllowed stress = ${su} / ${num(f)} = ${num(su / f)} MPa. Minimum area = \`_force_kn * 1000 / _n * _fos / _failure\` = ${num(per * 1000)} / ${num(su / f)} = **${num(A)} mm²**.\n\nd = √(4 × ${num(A)} / π) ≈ ${num(Math.sqrt((4 * A) / Math.PI))} mm, and rounding **up** gives **${dMin} mm**.`,
    params: { kind, n, F, su, f, per, A, dMin },
  };
}

function verifyFos(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "fos": return near(p.su / x, p.sw, 1e-9);
    case "working": return near(x * p.f, p.su, 1e-9);
    case "ultimate": return near(x / p.f, p.sw, 1e-9);
    case "fos-load": return near(p.W * x, p.B, 1e-9);
    case "safe-load": return exactDp(x, 1) && Math.abs(((x * 1000) / p.A) * p.f - p.su) <= ((0.05 * 1000) / p.A) * p.f + 1e-9;
    case "cables": return Number.isInteger(x) && (x * p.B) / p.W >= p.f - 1e-9 && ((x - 1) * p.B) / p.W < p.f - 1e-9;
    case "check": {
      const s = toNum(ans.stress), f = toNum(ans.fos);
      const sOk = near(s * p.A, p.F * 1000, 1e-6);
      const fOk = exactDp(f, 2) && Math.abs(p.su / s - f) <= 0.005 + 1e-9;
      const meets = p.su / s >= p.req - 1e-9;
      return sOk && fOk && ans.ok === (meets ? "Yes" : "No");
    }
    case "hang": return Number.isInteger(x) && x * p.g * p.f <= p.su * p.A + 1e-9 && (x + 1) * p.g * p.f > p.su * p.A + 1e-9;
    case "choose": {
      const area = toNum(ans.area), fos = toNum(ans.fos);
      const aOk = exactDp(area, 1) && Math.abs((p.su / p.f) * area - 1000 * p.F) <= (p.su / p.f) * 0.05 + 1e-9;
      // The chosen bar must pass, and the next size down must fail.
      const d = toNum(String(ans.size).replace(/ mm$/, ""));
      const A = (k) => (Math.PI * k * k) / 4;
      const i = p.ds.indexOf(d);
      const strength = (k) => (p.su * A(k)) / (1000 * p.F);
      const sizeOk = i >= 0 && strength(d) >= p.f && (i === 0 || strength(p.ds[i - 1]) < p.f);
      const fOk = sizeOk && exactDp(fos, 2) && Math.abs(strength(d) - fos) <= 0.005 + 1e-9;
      return aOk && sizeOk && fOk;
    }
    case "bolts": {
      const load = toNum(ans.load), area = toNum(ans.area), dia = toNum(ans.dia);
      const lOk = exactDp(load, 1) && near(load * p.n, p.F, 0.05 * p.n + 1e-9);
      const aOk = exactDp(area, 1) && Math.abs((p.su / p.f) * area - p.F * 1000 / p.n) <= (p.su / p.f) * 0.05 + 1e-9;
      const strong = (d) => (p.su * Math.PI * d * d) / 4 / (1000 * (p.F / p.n)) >= p.f - 1e-9;
      return lOk && aOk && Number.isInteger(dia) && strong(dia) && !strong(dia - 1);
    }
    default: return false;
  }
}

// =====================================================================

const SUBTOPICS = { moments: genMoments, "stress-strain": genStress, beams: genBeams, "factor-of-safety": genFos };
const VERIFIERS = { moments: verifyMoments, "stress-strain": verifyStress, beams: verifyBeams, "factor-of-safety": verifyFos };

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard", "expert"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const make = SUBTOPICS[subtopic];
  if (!make) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = make(difficulty, rng);
  q.params.sub = subtopic;
  return q;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || answer === undefined || answer === null || answer === "") return false;
  if (question.answerType === "choice" && !question.choices.includes(String(answer))) return false;
  if (question.answerType === "multi" && (typeof answer !== "object" || answer === null)) return false;
  try {
    const fn = VERIFIERS[p.sub];
    return fn ? fn(question, answer) === true : false;
  } catch {
    return false;
  }
}
