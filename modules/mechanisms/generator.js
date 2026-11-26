// Mechanisms generator: levers, gears, pulleys and belt drives, torque and power.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Every rounded answer states its rounding; draws that land on a
// rounding half-step, or whose parts would change when worked from a rounded earlier part, are
// redrawn inside generate(). Conventions are stated in each prompt: gear ratio = driven teeth ÷
// driver teeth, g = 10 N/kg, ideal (no friction) unless an efficiency is given. verify()
// re-derives each answer by a different route (back-substitution, the moment or work balance,
// stage-by-stage speeds, or the power balance) from the numbers kept in `params`.

import { fmtNum, roundTo, isHalfStep } from "../../js/lib/mathutil.js";

const num = (n) => fmtNum(n, 4);
const rk = (x, k) => roundTo(x, k);
const isTie = (x, k) => isHalfStep(x, k, 1e-4);
const exactDp = (x, k) => Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6;
const EXACT = { fuzzyNumber: 0 };
const G = 10;
const CW = "Clockwise", ACW = "Anticlockwise";
const ROT = [CW, ACW];
const flip = (d) => (d === CW ? ACW : CW);
const TWO_PI = 2 * Math.PI;

// Redraw until `fn` returns a truthy draw.
function redraw(fn) {
  for (let i = 0; i < 20000; i++) {
    const r = fn();
    if (r) return r;
  }
  throw new Error("mechanisms: no valid draw");
}

// ---- verify-side helpers (local, independent of generation) -----------------------------
const toNum = (v) => (v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v));
const near = (x, t, tol = 1e-9) => Number.isFinite(x) && Math.abs(x - t) <= tol;
const isInt = (x) => Number.isFinite(x) && Number.isInteger(x);
// Direction after a number of meshes, turned one mesh at a time.
function turnThrough(start, meshes) {
  let cw = start === CW;
  for (let i = 0; i < meshes; i++) cw = !cw;
  return cw ? CW : ACW;
}

// ---- generate-side helpers ------------------------------------------------------------------
const partNum = (id, label, ask, answer, tol, hint, extra = {}) => ({ id, label, ask, answerType: "number", answer, tolerance: tol, hint, ...extra });
const partChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const MOTOR_RPM = [720, 960, 1200, 1440, 1450, 1500, 1800, 2880, 2900, 3000];
const TEETH = [10, 12, 15, 16, 18, 20, 24, 25, 30, 32, 36, 40, 45, 48, 50, 60, 72, 80];
// Reduction gear pairs [driver, driven] with tidy ratios.
const PAIRS = [[15, 45], [20, 50], [12, 36], [16, 40], [20, 60], [18, 54], [24, 48], [10, 40], [15, 60], [20, 30], [16, 48], [12, 30], [20, 80], [25, 50], [24, 36]];
const STD_MOTORS = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15];

// =====================================================================
// Levers
// =====================================================================
// [example, order along the lever, class]
const LEVER_EXAMPLES = [
  ["a see-saw", ["Load", "Pivot", "Effort"], 1],
  ["a crowbar prising up a rock", ["Load", "Pivot", "Effort"], 1],
  ["a pair of scissors", ["Load", "Pivot", "Effort"], 1],
  ["a wheelbarrow", ["Pivot", "Load", "Effort"], 2],
  ["a nutcracker", ["Pivot", "Load", "Effort"], 2],
  ["a bottle opener", ["Pivot", "Load", "Effort"], 2],
  ["a pair of tweezers", ["Pivot", "Effort", "Load"], 3],
  ["a fishing rod", ["Pivot", "Effort", "Load"], 3],
  ["your forearm holding a cup (the elbow is the pivot)", ["Pivot", "Effort", "Load"], 3],
];

function genLevers(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["effort", "ma", "class"]);
    if (kind === "effort") {
      const { L, ai, bi, E } = redraw(() => {
        const L = 10 * rng.int(5, 60), ai = rng.int(1, 5), bi = rng.int(6, 20);
        const E = (L * ai) / bi;
        return Number.isInteger(E) && E >= 5 ? { L, ai, bi, E } : null;
      });
      const a = ai / 10, b = bi / 10;
      return {
        prompt: `A lever is used to lift a load of **${L} N**. The load is **${num(a)} m** from the pivot and the effort is applied **${num(b)} m** from the pivot, on the other side. Ignore friction and the weight of the lever. What effort just balances the load, in N?`,
        answerType: "number", answer: E, tolerance: 0,
        given: [{ label: "_load", value: L }, { label: "_a", value: a }, { label: "_b", value: b }],
        explanation: `Effort × effort distance = load × load distance: E × ${num(b)} = ${L} × ${num(a)}, so E = \`_load * _a / _b\` = ${num(L * a)} / ${num(b)} = **${E} N**.`,
        hints: ["Balance: effort × its distance from the pivot = load × its distance from the pivot.", "Work out the load's moment first, then divide it by the effort's distance."],
        params: { kind, L, a, b, E },
      };
    }
    if (kind === "ma") {
      const MA = rng.pick([1.5, 2, 2.5, 3, 4, 5, 6, 8]), E = 10 * rng.int(2, 30), L = MA * E;
      return {
        prompt: `A lever lifts a load of **${L} N** when an effort of **${E} N** is applied. What is its mechanical advantage (MA)?`,
        answerType: "number", answer: MA, tolerance: 0, ...EXACT,
        given: [{ label: "_load", value: L }, { label: "_effort", value: E }],
        explanation: `Mechanical advantage = load ÷ effort: \`_load / _effort\` = ${L} / ${E} = **${num(MA)}**. The lever multiplies the effort ${num(MA)} times.`,
        hints: ["Mechanical advantage = load ÷ effort.", "Both forces are in N, so MA has no units."],
        params: { kind, L, E, MA },
      };
    }
    const [what, order0, cls] = rng.pick(LEVER_EXAMPLES);
    const order = rng.next() < 0.5 ? order0.slice().reverse() : order0.slice();
    return {
      prompt: `In ${what}, the pivot, the load and the effort lie along the lever in this order: **${order.join(" – ")}**. Which class of lever is it?`,
      answerType: "choice", answer: `Class ${cls}`, choices: ["Class 1", "Class 2", "Class 3"],
      explanation: `The ${order[1].toLowerCase()} is in the middle. Pivot in the middle is class 1, load in the middle is class 2, effort in the middle is class 3, so ${what} is a **Class ${cls}** lever.`,
      hints: ["Look at which of the three sits in the middle.", "First class: pivot in the middle. Second class: load in the middle. Third class: effort in the middle."],
      params: { kind, order, cls },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["vr", "efficiency", "mass"]);
    if (kind === "vr") {
      const { a, b, h, de } = redraw(() => {
        const a = rng.int(10, 40), b = rng.int(40, 150), h = rng.int(2, 12);
        const de = (h * b) / a;
        return b >= 1.5 * a && !isTie(de, 1) ? { a, b, h, de: rk(de, 1) } : null;
      });
      return {
        prompt: `On a lever, the load is **${a} cm** from the pivot and the effort is applied **${b} cm** from the pivot. When the load rises **${h} cm**, how far does the effort end move, in cm? Round to 1 decimal place.`,
        answerType: "number", answer: de, tolerance: 0.05,
        given: [{ label: "_a", value: a }, { label: "_b", value: b }, { label: "_h", value: h }],
        explanation: `Both ends turn through the same angle, so the distances moved are in the ratio of the arms. Velocity ratio = \`_b / _a\` = ${b} / ${a} = ${num(b / a)}. Effort distance = \`_h * _b / _a\` = ${h} × ${num(b / a)} ≈ **${num(de)} cm**.`,
        hints: ["Both ends of the lever turn through the same angle, so the distance each end moves is proportional to its distance from the pivot.", "Velocity ratio = effort arm ÷ load arm. Multiply the load's rise by it."],
        params: { kind, a, b, h, de },
      };
    }
    if (kind === "efficiency") {
      const { VR, E, L, pct } = redraw(() => {
        const VR = rng.pick([2, 2.5, 3, 4, 5, 6]), E = 5 * rng.int(4, 40), L = 10 * rng.int(5, 100);
        const pct = (L / E / VR) * 100;
        return pct >= 50 && pct <= 95 && !isTie(pct, 1) ? { VR, E, L, pct: rk(pct, 1) } : null;
      });
      return {
        prompt: `A lever has a velocity ratio (VR) of **${num(VR)}**. Because of friction at the pivot, it needs an effort of **${E} N** to lift a load of **${L} N**. What is its efficiency, as a percentage? Round to 1 decimal place.`,
        answerType: "number", answer: pct, tolerance: 0.05,
        given: [{ label: "_load", value: L }, { label: "_effort", value: E }, { label: "_vr", value: VR }],
        explanation: `MA = \`_load / _effort\` = ${L} / ${E} = ${num(L / E)}. Efficiency = MA ÷ VR × 100 = \`_load / _effort / _vr * 100\` = ${num(L / E)} / ${num(VR)} × 100 ≈ **${num(pct)} %**.`,
        hints: ["First find the mechanical advantage: load ÷ effort.", "Efficiency = MA ÷ VR. Multiply by 100 for a percentage."],
        params: { kind, VR, E, L, pct },
      };
    }
    const { m, a, b, E } = redraw(() => {
      const m = rng.int(5, 80), a = rng.int(5, 40), b = rng.int(30, 150);
      const E = (m * G * a) / b;
      return b > a && exactDp(E, 1) && E >= 10 ? { m, a, b, E: rk(E, 1) } : null;
    });
    return {
      prompt: `A crowbar is used as a lever to lift one edge of a crate of mass **${m} kg**. The crate presses on the bar **${a} cm** from the pivot, and the effort is applied **${b} cm** from the pivot. Take g = 10 N/kg and ignore friction. What effort just lifts the crate's edge, in N? Give the answer to 1 decimal place if needed.`,
      answerType: "number", answer: E, tolerance: 0.05,
      given: [{ label: "_mass", value: m }, { label: "_a", value: a }, { label: "_b", value: b }],
      explanation: `Weight = ${m} × 10 = ${m * G} N. Moments about the pivot: E × ${b} = ${m * G} × ${a}, so E = \`_mass * 10 * _a / _b\` = ${m * G * a} / ${b} = **${num(E)} N**.`,
      hints: ["Turn the mass into a weight: weight = mass × g.", "Both distances are in cm, so they can stay in cm: effort × effort distance = weight × load distance."],
      params: { kind, m, a, b, E },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["real", "measure"]);
    if (kind === "real") {
      const { L, a, b, eta, E } = redraw(() => {
        const L = 10 * rng.int(10, 100), a = rng.int(5, 40), b = rng.int(40, 200), eta = rng.pick([60, 65, 70, 75, 80, 85, 90]);
        const E = (L * a) / (b * (eta / 100));
        return b >= 1.5 * a && E >= 5 && !isTie(E, 1) ? { L, a, b, eta, E: rk(E, 1) } : null;
      });
      return {
        prompt: `A lever lifts a load of **${L} N**. The load is **${a} cm** from the pivot and the effort is applied **${b} cm** from the pivot. Friction at the pivot makes the lever **${eta}%** efficient. What effort is actually needed, in N? Round to 1 decimal place.`,
        answerType: "number", answer: E, tolerance: 0.05,
        given: [{ label: "_load", value: L }, { label: "_a", value: a }, { label: "_b", value: b }, { label: "_eff", value: eta }],
        explanation: `Ideal effort (no friction) = \`_load * _a / _b\` = ${L} × ${a} / ${b} = ${num((L * a) / b)} N. Friction means more is needed: real effort = ideal ÷ efficiency = \`_load * _a / _b / (_eff / 100)\` = ${num((L * a) / b)} / ${num(eta / 100)} ≈ **${num(E)} N**.`,
        hints: ["Find the effort a perfect lever would need: effort × effort distance = load × load distance.", `Friction means more effort is needed: divide that ideal effort by the efficiency as a decimal (${eta}% = ${num(eta / 100)}).`],
        params: { kind, L, a, b, eta, E },
      };
    }
    const v = redraw(() => {
      const E = 5 * rng.int(4, 40), L = 10 * rng.int(5, 150), dl = rng.int(2, 10), de = rng.int(2 * dl, 60);
      const MA = L / E, VR = de / dl, pct = (MA / VR) * 100;
      if (!(exactDp(MA, 2) && exactDp(VR, 2))) return null;
      return pct >= 40 && pct <= 95 && !isTie(pct, 1) ? { E, L, dl, de, MA: rk(MA, 2), VR: rk(VR, 2), pct: rk(pct, 1) } : null;
    });
    const { E, L, dl, de, MA, VR, pct } = v;
    return {
      prompt: `In a test on a lever, an effort of **${E} N** lifts a load of **${L} N**. While the load rises **${dl} cm**, the effort end moves **${de} cm**.`,
      answerType: "multi",
      given: [{ label: "_effort", value: E }, { label: "_load", value: L }, { label: "_dl", value: dl }, { label: "_de", value: de }],
      parts: [
        partNum("ma", "MA", "Mechanical advantage (2 decimal places if needed)", MA, 0.005, "Mechanical advantage = load ÷ effort."),
        partNum("vr", "VR", "Velocity ratio (2 decimal places if needed)", VR, 0.005, "Velocity ratio = distance moved by the effort ÷ distance moved by the load, both in the same unit."),
        partNum("eff", "Efficiency", "Efficiency, as a % (1 decimal place)", pct, 0.05, "Efficiency = MA ÷ VR, × 100 for a percentage. It is also work out ÷ work in."),
      ],
      explanation: `MA = \`_load / _effort\` = ${L} / ${E} = **${num(MA)}**.\n\nVR = \`_de / _dl\` = ${de} / ${dl} = **${num(VR)}**.\n\nEfficiency = MA ÷ VR × 100 = ${num(MA)} / ${num(VR)} × 100 ≈ **${num(pct)} %**. (Check: work out ÷ work in = ${L} × ${dl} ÷ (${E} × ${de}) gives the same.)`,
      params: { kind, E, L, dl, de, MA, VR, pct },
    };
  }

  // expert: size a lever arm for a limited effort, or a compound lever
  const kind = rng.pick(["design", "compound"]);
  if (kind === "design") {
    const v = redraw(() => {
      const W = 10 * rng.int(20, 120), a = rng.int(5, 30), Emax = 10 * rng.int(10, 40), eta = rng.pick([70, 75, 80, 85, 90]);
      const b = (W * a) / ((eta / 100) * Emax);
      const frac = b - Math.floor(b);
      if (frac < 0.05 || frac > 0.95) return null;
      const bReq = Math.ceil(b);
      if (bReq < 20 || bReq > 250 || bReq < 1.2 * a) return null;
      const h = rng.int(2, 10);
      const move = (h * bReq) / a, Ereal = (W * a) / ((eta / 100) * bReq);
      return !isTie(move, 1) && !isTie(Ereal, 1) ? { W, a, Emax, eta, bReq, h, move: rk(move, 1), Ereal: rk(Ereal, 1) } : null;
    });
    const { W, a, Emax, eta, bReq, h, move, Ereal } = v;
    return {
      prompt: `A lever must lift a load of **${W} N** that sits **${a} cm** from the pivot. The operator can push with at most **${Emax} N**, and friction at the pivot makes the lever **${eta}%** efficient. The effort arm (from the pivot to where the effort is applied) is cut to a whole number of centimetres.`,
      answerType: "multi",
      given: [{ label: "_load", value: W }, { label: "_a", value: a }, { label: "_max_effort", value: Emax }, { label: "_eff", value: eta }],
      parts: [
        partNum("arm", "Effort arm", "Shortest effort arm that lets the operator lift the load, in whole cm (round up)", bReq, 0, "Real effort = load × load arm ÷ (effort arm × efficiency). Set it equal to the maximum effort and solve for the effort arm.", EXACT),
        partNum("move", "Movement", `With that arm, how far does the effort end move while the load rises ${h} cm? In cm, 1 decimal place`, move, 0.05, "Distances moved scale with distance from the pivot: multiply the load's rise by effort arm ÷ load arm."),
        partNum("effort", "Effort", "Effort actually needed with that arm, in N (1 decimal place)", Ereal, 0.05, "Find the ideal effort with your arm, then divide by the efficiency as a decimal. It should come out just under the maximum."),
      ],
      explanation: `Real effort = load × load arm ÷ (effort arm × efficiency). Setting it to ${Emax} N: effort arm = \`_load * _a / (_eff / 100 * _max_effort)\` = ${W * a} / (${num(eta / 100)} × ${Emax}) ≈ ${num((W * a) / ((eta / 100) * Emax))} cm. A shorter arm would need too much effort, so round **up**: **${bReq} cm**.\n\nMovement: ${h} × ${bReq} / ${a} ≈ **${num(move)} cm**.\n\nEffort with a ${bReq} cm arm: ${W * a} / (${num(eta / 100)} × ${bReq}) ≈ **${num(Ereal)} N**, which is within the ${Emax} N limit.`,
      params: { kind, W, a, Emax, eta, bReq, h, move, Ereal },
    };
  }
  const v = redraw(() => {
    const MA1 = rng.pick([2, 2.5, 3, 4, 5]), MA2 = rng.pick([1.5, 2, 2.5, 3, 4]);
    const a1 = rng.int(2, 6), a2 = rng.int(1, 4), E = rng.int(20, 150);
    const b1 = MA1 * a1, b2 = MA2 * a2, MA = MA1 * MA2, F = E * MA;
    return exactDp(F, 1) && exactDp(MA, 2) ? { MA1, MA2, a1, a2, b1, b2, E, MA: rk(MA, 2), F: rk(F, 1) } : null;
  });
  const { MA1, a1, a2, b1, b2, E, MA, F } = v;
  return {
    prompt: `Bolt cutters are a compound lever: the handles (lever 1) push on the jaws (lever 2). On lever 1, the hands push **${num(b1)} cm** from its pivot and it presses on lever 2 at a point **${a1} cm** from that pivot. Lever 2 is pushed **${num(b2)} cm** from its own pivot, and the jaws cut **${a2} cm** from it. Ignore friction. The hands squeeze with a force of **${E} N**.`,
    answerType: "multi",
    given: [{ label: "_b1", value: b1 }, { label: "_a1", value: a1 }, { label: "_b2", value: b2 }, { label: "_a2", value: a2 }, { label: "_effort", value: E }],
    parts: [
      partNum("ma1", "Lever 1", "Mechanical advantage of lever 1 (2 decimal places if needed)", MA1, 0.005, "For a lever without friction, MA = effort arm ÷ load arm."),
      partNum("ma", "Overall", "Overall mechanical advantage (2 decimal places if needed)", MA, 0.005, "Find lever 2's MA the same way. Levers in series multiply their MAs."),
      partNum("force", "Force", "Cutting force at the jaws, in N (1 decimal place if needed)", F, 0.05, "Cutting force = squeeze force × overall MA."),
    ],
    explanation: `Lever 1: MA = \`_b1 / _a1\` = ${num(b1)} / ${a1} = **${num(MA1)}**.\n\nLever 2: MA = ${num(b2)} / ${a2} = ${num(b2 / a2)}. Overall MA = ${num(MA1)} × ${num(b2 / a2)} = **${num(MA)}**.\n\nCutting force = \`_effort * _b1 / _a1 * _b2 / _a2\` = ${E} × ${num(MA)} = **${num(F)} N**.`,
    params: { kind, a1, a2, b1, b2, E, MA1, MA, F },
  };
}

function verifyLevers(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "effort": return near(x * p.b, p.L * p.a, 1e-6);
    case "ma": return near(x * p.E, p.L, 1e-9);
    case "class": {
      const mid = p.order[1];
      const c = mid === "Pivot" ? 1 : mid === "Load" ? 2 : mid === "Effort" ? 3 : 0;
      return ans === `Class ${c}`;
    }
    case "vr": return exactDp(x, 1) && Math.abs(x * p.a - p.h * p.b) <= 0.05 * p.a + 1e-9;
    case "efficiency": return exactDp(x, 1) && Math.abs((x / 100) * p.VR * p.E - p.L) <= (0.05 / 100) * p.VR * p.E + 1e-9;
    case "mass": return exactDp(x, 1) && Math.abs(x * p.b - p.m * 10 * p.a) <= 0.05 * p.b + 1e-9;
    case "real": return exactDp(x, 1) && Math.abs(x * (p.eta / 100) * p.b - p.L * p.a) <= 0.05 * (p.eta / 100) * p.b + 1e-9;
    case "measure": {
      const ma = toNum(ans.ma), vr = toNum(ans.vr), eff = toNum(ans.eff);
      const maOk = exactDp(ma, 2) && Math.abs(ma * p.E - p.L) <= 0.005 * p.E + 1e-9;
      const vrOk = exactDp(vr, 2) && Math.abs(vr * p.dl - p.de) <= 0.005 * p.dl + 1e-9;
      // Efficiency as work out ÷ work in.
      const effOk = exactDp(eff, 1) && Math.abs(eff - ((p.L * p.dl) / (p.E * p.de)) * 100) <= 0.05 + 1e-9;
      return maOk && vrOk && effOk;
    }
    case "design": {
      const arm = toNum(ans.arm), move = toNum(ans.move), eff = toNum(ans.effort);
      const enough = (b) => (p.W * p.a) / ((p.eta / 100) * b) <= p.Emax + 1e-9;
      const armOk = isInt(arm) && enough(arm) && !enough(arm - 1);
      const moveOk = exactDp(move, 1) && Math.abs(move * p.a - p.h * arm) <= 0.05 * p.a + 1e-9;
      const effOk = exactDp(eff, 1) && Math.abs(eff * (p.eta / 100) * arm - p.W * p.a) <= 0.05 * (p.eta / 100) * arm + 1e-9;
      return armOk && moveOk && effOk;
    }
    case "compound": {
      const ma1 = toNum(ans.ma1), ma = toNum(ans.ma), f = toNum(ans.force);
      // Force passed lever by lever (moments about each pivot).
      const f1 = (p.E * p.b1) / p.a1, f2 = (f1 * p.b2) / p.a2;
      const ma1Ok = exactDp(ma1, 2) && Math.abs(ma1 * p.a1 - p.b1) <= 0.005 * p.a1 + 1e-9;
      const maOk = exactDp(ma, 2) && Math.abs(ma * p.E - f2) <= 0.005 * p.E + 1e-9;
      const fOk = exactDp(f, 1) && near(f, f2, 0.05 + 1e-9);
      return ma1Ok && maOk && fOk;
    }
    default: return false;
  }
}

// =====================================================================
// Gears
// =====================================================================
const RATIO_CONV = "(driven teeth ÷ driver teeth)";

function genGears(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["ratio", "speed", "direction"]);
    if (kind === "ratio") {
      const { T1, T2, R } = redraw(() => {
        const T1 = rng.pick([10, 12, 15, 16, 20, 24, 25, 30]), R = rng.pick([1.5, 2, 2.5, 3, 4, 5]);
        const T2 = T1 * R;
        return Number.isInteger(T2) && T2 <= 120 ? { T1, T2, R } : null;
      });
      return {
        prompt: `A driver gear with **${T1} teeth** meshes with a driven gear with **${T2} teeth**. What is the gear ratio ${RATIO_CONV}? Give it as a single number, such as 2.5.`,
        answerType: "number", answer: R, tolerance: 0, ...EXACT,
        given: [{ label: "_driver", value: T1 }, { label: "_driven", value: T2 }],
        explanation: `Gear ratio = driven teeth ÷ driver teeth = \`_driven / _driver\` = ${T2} / ${T1} = **${num(R)}**, often written ${num(R)} : 1. The driven gear turns ${num(R)} times slower than the driver.`,
        hints: ["Gear ratio = teeth on the driven gear ÷ teeth on the driver gear.", "A ratio above 1 means the output turns slower (and with more torque)."],
        params: { kind, T1, T2, R },
      };
    }
    if (kind === "speed") {
      const { N1, T1, T2, N2 } = redraw(() => {
        const N1 = rng.pick(MOTOR_RPM), T1 = rng.pick(TEETH), T2 = rng.pick(TEETH);
        const N2 = (N1 * T1) / T2;
        return T1 !== T2 && Number.isInteger(N2) ? { N1, T1, T2, N2 } : null;
      });
      return {
        prompt: `A driver gear with **${T1} teeth** turns at **${N1} rpm** and meshes with a driven gear with **${T2} teeth**. What is the speed of the driven gear, in rpm?`,
        answerType: "number", answer: N2, tolerance: 0,
        given: [{ label: "_n1", value: N1 }, { label: "_t1", value: T1 }, { label: "_t2", value: T2 }],
        explanation: `The same number of teeth pass the meshing point on both gears: ${T1} × ${N1} = ${T2} × N₂, so N₂ = \`_n1 * _t1 / _t2\` = ${N1 * T1} / ${T2} = **${N2} rpm**.`,
        hints: ["Teeth × speed is the same for two meshing gears.", "So driven speed = driver speed × driver teeth ÷ driven teeth. A bigger driven gear turns slower."],
        params: { kind, N1, T1, T2, N2 },
      };
    }
    const n = rng.int(2, 6), start = rng.pick(ROT);
    const ans = (n - 1) % 2 === 1 ? flip(start) : start;
    return {
      prompt: `**${n} gears** are in a row, each meshing with the next. The first gear turns **${start.toLowerCase()}**. Which way does the last gear (gear ${n}) turn?`,
      answerType: "choice", answer: ans, choices: ROT.slice(),
      explanation: `Each mesh reverses the direction. From gear 1 to gear ${n} there are ${n - 1} meshes, ${(n - 1) % 2 === 1 ? "an odd number, so the last gear turns the opposite way" : "an even number, so the last gear turns the same way"}: **${ans}**.`,
      hints: ["When one gear drives another, the second turns the opposite way.", `Count the meshes between gear 1 and gear ${n}.`],
      params: { kind, n, start },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["teeth", "idler", "torque"]);
    if (kind === "teeth") {
      const { N1, T1, N2, T2 } = redraw(() => {
        const N1 = rng.pick(MOTOR_RPM), T1 = rng.pick([10, 12, 15, 16, 18, 20, 24, 25, 30]), T2 = rng.int(12, 120);
        const N2 = (N1 * T1) / T2;
        return T2 !== T1 && Number.isInteger(N2) ? { N1, T1, N2, T2 } : null;
      });
      return {
        prompt: `A motor turns a **${T1}-tooth** driver gear at **${N1} rpm**. The driven gear must turn at **${N2} rpm**. How many teeth must the driven gear have?`,
        answerType: "number", answer: T2, tolerance: 0, ...EXACT,
        given: [{ label: "_n1", value: N1 }, { label: "_t1", value: T1 }, { label: "_n2", value: N2 }],
        explanation: `Teeth × speed is the same on both gears: ${T1} × ${N1} = T × ${N2}, so T = \`_t1 * _n1 / _n2\` = ${T1 * N1} / ${N2} = **${T2} teeth**.`,
        hints: ["For meshing gears, driver teeth × driver speed = driven teeth × driven speed.", "Rearrange for the driven teeth."],
        params: { kind, N1, T1, N2, T2 },
      };
    }
    if (kind === "idler") {
      const v = redraw(() => {
        const N1 = rng.pick(MOTOR_RPM), T1 = rng.pick(TEETH), T2 = rng.pick(TEETH), k = rng.int(1, 2);
        const idlers = [rng.pick(TEETH), rng.pick(TEETH)].slice(0, k);
        const N2 = (N1 * T1) / T2;
        return T1 !== T2 && Number.isInteger(N2) && !idlers.includes(T1) && !idlers.includes(T2) ? { N1, T1, T2, idlers, N2 } : null;
      });
      const { N1, T1, T2, idlers, N2 } = v;
      const start = rng.pick(ROT);
      const k = idlers.length;
      const dir = (k + 1) % 2 === 1 ? flip(start) : start;
      const idText = k === 1 ? `an idler gear with **${idlers[0]} teeth**` : `two idler gears in a row, with **${idlers[0]}** and **${idlers[1]} teeth**`;
      return {
        prompt: `A driver gear with **${T1} teeth** turns **${start.toLowerCase()}** at **${N1} rpm**. It drives ${idText}, which drive${k === 1 ? "s" : ""} an output gear with **${T2} teeth**. All the gears are in a single row, each meshing with the next.`,
        answerType: "multi",
        given: [{ label: "_n1", value: N1 }, { label: "_t1", value: T1 }, { label: "_t2", value: T2 }],
        parts: [
          partNum("speed", "Speed", "Speed of the output gear, in rpm", N2, 0, "An idler changes nothing about the overall ratio: only the first and last gears' teeth matter."),
          partChoice("dir", "Direction", "Which way does the output gear turn?", dir, ROT.slice(), `Each mesh reverses the direction. Count the meshes from the driver to the output gear through ${k === 1 ? "the idler" : "both idlers"}.`),
        ],
        explanation: `Speed: the idler${k === 1 ? "" : "s"} cancel out of the ratio, so N = \`_n1 * _t1 / _t2\` = ${N1} × ${T1} / ${T2} = **${N2} rpm**.\n\nDirection: there are ${k + 1} meshes, ${(k + 1) % 2 === 1 ? "an odd number, so the output turns the opposite way to the driver" : "an even number, so the output turns the same way as the driver"}: **${dir}**.`,
        params: { kind, N1, T1, T2, idlers, N2, start },
      };
    }
    const { Tin, T1, T2, Tout } = redraw(() => {
      const Tin = rng.int(2, 60), T1 = rng.pick(TEETH), T2 = rng.pick(TEETH);
      const Tout = (Tin * T2) / T1;
      return T2 > T1 && exactDp(Tout, 1) ? { Tin, T1, T2, Tout: rk(Tout, 1) } : null;
    });
    return {
      prompt: `A motor applies a torque of **${Tin} N·m** to a driver gear with **${T1} teeth**, which meshes with a driven gear with **${T2} teeth**. Ignoring friction, what torque does the driven gear's shaft deliver, in N·m? Give the answer to 1 decimal place if needed.`,
      answerType: "number", answer: Tout, tolerance: 0.05,
      given: [{ label: "_torque_in", value: Tin }, { label: "_t1", value: T1 }, { label: "_t2", value: T2 }],
      explanation: `Gear ratio = ${T2} / ${T1} = ${num(T2 / T1)}. The driven gear turns slower by that factor, so (with no losses) its torque is larger by the same factor: \`_torque_in * _t2 / _t1\` = ${Tin} × ${num(T2 / T1)} = **${num(Tout)} N·m**.`,
      hints: ["Find the gear ratio: driven teeth ÷ driver teeth.", "With no losses, power in = power out, so torque goes up by the same factor as speed goes down."],
      params: { kind, Tin, T1, T2, Tout },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["compound", "eff"]);
    if (kind === "compound") {
      const v = redraw(() => {
        const [TA, TB] = rng.pick(PAIRS), [TC, TD] = rng.pick(PAIRS), N1 = rng.pick(MOTOR_RPM);
        const R = (TB / TA) * (TD / TC), N = N1 / R;
        return exactDp(R, 2) && !isTie(N, 1) ? { TA, TB, TC, TD, N1, R: rk(R, 2), N: rk(N, 1) } : null;
      });
      const { TA, TB, TC, TD, N1, R, N } = v;
      return {
        prompt: `A compound gear train: a motor turns gear A (**${TA} teeth**) at **${N1} rpm**. A meshes with gear B (**${TB} teeth**). Gear C (**${TC} teeth**) is fixed to the same shaft as B, so it turns with B, and C meshes with the output gear D (**${TD} teeth**).`,
        answerType: "multi",
        given: [{ label: "_n1", value: N1 }, { label: "_ta", value: TA }, { label: "_tb", value: TB }, { label: "_tc", value: TC }, { label: "_td", value: TD }],
        parts: [
          partNum("ratio", "Ratio", `Overall gear ratio, motor speed ÷ output speed (2 decimal places if needed)`, R, 0.005, "Find each stage's ratio (driven teeth ÷ driver teeth) and multiply them."),
          partNum("speed", "Speed", "Speed of the output gear D, in rpm (1 decimal place)", N, 0.05, "Output speed = motor speed ÷ overall ratio."),
        ],
        explanation: `Stage 1: ${TB} / ${TA} = ${num(TB / TA)}. Stage 2: ${TD} / ${TC} = ${num(TD / TC)}. Overall ratio = \`_tb / _ta * _td / _tc\` = **${num(R)}**.\n\nOutput speed = ${N1} / ${num(R)} ≈ **${num(N)} rpm**.`,
        params: { kind, TA, TB, TC, TD, N1, R, N },
      };
    }
    const v = redraw(() => {
      const N1 = rng.pick(MOTOR_RPM), T1 = rng.pick(TEETH), T2 = rng.pick(TEETH), Tin = rng.int(3, 50), eta = rng.pick([90, 92, 94, 95, 96, 97, 98]);
      const N2 = (N1 * T1) / T2, Tout = Tin * (T2 / T1) * (eta / 100);
      return T2 > T1 && Number.isInteger(N2) && !isTie(Tout, 1) ? { N1, T1, T2, Tin, eta, N2, Tout: rk(Tout, 1) } : null;
    });
    const { N1, T1, T2, Tin, eta, N2, Tout } = v;
    return {
      prompt: `A motor drives a gear with **${T1} teeth** at **${N1} rpm** with a torque of **${Tin} N·m**. It meshes with an output gear with **${T2} teeth**. The gear pair is **${eta}%** efficient (some power is lost to friction).`,
      answerType: "multi",
      given: [{ label: "_n1", value: N1 }, { label: "_t1", value: T1 }, { label: "_t2", value: T2 }, { label: "_torque_in", value: Tin }, { label: "_eff", value: eta }],
      parts: [
        partNum("speed", "Speed", "Output speed, in rpm", N2, 0, "Friction does not change the speed: teeth × speed is the same on both gears."),
        partNum("torque", "Torque", "Output torque, in N·m (1 decimal place)", Tout, 0.05, "Ideal output torque = input torque × gear ratio. Friction reduces it: multiply by the efficiency as a decimal."),
      ],
      explanation: `Speed: \`_n1 * _t1 / _t2\` = ${N1} × ${T1} / ${T2} = **${N2} rpm** (losses do not change speed).\n\nTorque: ratio = ${T2} / ${T1} = ${num(T2 / T1)}. Output torque = \`_torque_in * _t2 / _t1 * _eff / 100\` = ${Tin} × ${num(T2 / T1)} × ${num(eta / 100)} ≈ **${num(Tout)} N·m**.`,
      params: { kind, N1, T1, T2, Tin, eta, N2, Tout },
    };
  }

  // expert: choose a gear pair for a target speed, or design the second stage of a train
  const kind = rng.pick(["choose", "design"]);
  if (kind === "choose") {
    const v = redraw(() => {
      const R = rng.pick([1.5, 2, 2.5, 3, 4, 5, 6]), N1 = rng.pick(MOTOR_RPM), a = rng.pick([12, 15, 16, 18, 20, 24, 25, 30]);
      const N2 = N1 / R, b = a * R;
      if (!Number.isInteger(N2) || !Number.isInteger(b) || b > 120) return null;
      const R2 = rng.pick([1.5, 2, 2.5, 3, 4, 5, 6].filter((r) => r !== R)), a3 = rng.pick([12, 15, 16, 18, 20, 24, 25, 30].filter((t) => t !== a));
      const R3 = rng.pick([1.5, 2, 2.5, 3, 4, 5, 6].filter((r) => r !== R));
      const pairs = [[a, b], [b, a], [a, a * R2], [a3, a3 * R3]];
      if (pairs.some(([x, y]) => !Number.isInteger(y) || y > 150)) return null;
      const labels = pairs.map(([x, y]) => `${x} teeth → ${y} teeth`);
      if (new Set(labels).size !== 4) return null;
      const Tm = rng.int(2, 30), eta = rng.pick([90, 92, 94, 95, 96, 97, 98]);
      const Tout = Tm * R * (eta / 100);
      return !isTie(Tout, 1) ? { R, N1, N2, a, b, labels, Tm, eta, Tout: rk(Tout, 1) } : null;
    });
    const { R, N1, N2, labels, Tm, eta, Tout } = v;
    return {
      prompt: `A motor runs at **${N1} rpm** with a torque of **${Tm} N·m**. A machine shaft must turn at **${N2} rpm**, driven through one pair of meshing gears: the motor gear drives the shaft gear. The gear pair is **${eta}%** efficient.`,
      answerType: "multi",
      given: [{ label: "_n1", value: N1 }, { label: "_n2", value: N2 }, { label: "_torque_in", value: Tm }, { label: "_eff", value: eta }],
      parts: [
        partNum("ratio", "Ratio", `Gear ratio needed ${RATIO_CONV}, 2 decimal places if needed`, R, 0.005, "The ratio is also input speed ÷ output speed."),
        partChoice("pair", "Gear pair", "Which pair gives that speed? (motor gear → shaft gear)", labels[0], rng.shuffle(labels), "Check each pair: driven teeth ÷ driver teeth must equal the ratio you found. Watch the order: the first number is the motor gear."),
        partNum("torque", "Torque", "Torque at the machine shaft, in N·m (1 decimal place)", Tout, 0.05, "Output torque = motor torque × ratio × efficiency (as a decimal)."),
      ],
      explanation: `Ratio = input speed ÷ output speed = \`_n1 / _n2\` = ${N1} / ${N2} = **${num(R)}**.\n\nThe pair with driven ÷ driver = ${num(R)} is **${labels[0]}**. (Swapping the gears would speed the shaft up instead.)\n\nTorque = \`_torque_in * _n1 / _n2 * _eff / 100\` = ${Tm} × ${num(R)} × ${num(eta / 100)} ≈ **${num(Tout)} N·m**.`,
      params: { kind, R, N1, N2, Tm, eta, Tout },
    };
  }
  const v = redraw(() => {
    const N1 = rng.pick(MOTOR_RPM), [TA, TB] = rng.pick(PAIRS), TC = rng.pick([12, 15, 16, 18, 20, 24, 25]);
    const NB = (N1 * TA) / TB;
    if (!Number.isInteger(NB)) return null;
    const TD = rng.int(TC + 6, 100), Nout = (NB * TC) / TD;
    return Number.isInteger(Nout) && Nout >= 20 ? { N1, TA, TB, TC, NB, TD, Nout } : null;
  });
  const { N1, TA, TB, TC, NB, TD, Nout } = v;
  const idler = rng.pick([false, true]);
  const meshes = idler ? 3 : 2;
  const dir = meshes % 2 === 1 ? ACW : CW;
  return {
    prompt: `A motor turning **clockwise** at **${N1} rpm** drives gear A (**${TA} teeth**), which meshes with gear B (**${TB} teeth**). Gear C (**${TC} teeth**) is fixed to the same shaft as B and drives the output gear D${idler ? " through an idler gear between C and D" : ", meshing with it directly"}. The output must turn at **${Nout} rpm**. You choose the number of teeth on D.`,
    answerType: "multi",
    given: [{ label: "_n1", value: N1 }, { label: "_ta", value: TA }, { label: "_tb", value: TB }, { label: "_tc", value: TC }, { label: "_n_out", value: Nout }],
    parts: [
      partNum("nb", "Shaft speed", "Speed of the B–C shaft, in rpm", NB, 0, "Stage 1 alone: speed of B = motor speed × teeth on A ÷ teeth on B.", EXACT),
      partNum("td", "Teeth on D", "Number of teeth gear D needs", TD, 0, "C turns at the shaft speed. Use teeth × speed being equal for C and D, and solve for D's teeth.", EXACT),
      partChoice("dir", "Direction", "Which way does the output gear D turn?", dir, ROT.slice(), `Gears on one shaft turn the same way; each mesh reverses. Count the meshes from A to D${idler ? ", including both meshes through the idler" : ""}.`),
    ],
    explanation: `Shaft speed: \`_n1 * _ta / _tb\` = ${N1} × ${TA} / ${TB} = **${NB} rpm**. C turns at this speed too.\n\nTeeth on D: ${TC} × ${NB} = T × ${Nout}, so T = \`_tc * _n1 * _ta / _tb / _n_out\` = ${TC * NB} / ${Nout} = **${TD} teeth**.${idler ? " (The idler does not change the speed.)" : ""}\n\nDirection: A → B reverses (anticlockwise), C turns with B, then ${idler ? "C → idler → D is two more reversals" : "C → D reverses once more"}. That is ${meshes} meshes in all, so D turns **${dir.toLowerCase()}**.`,
    params: { kind, N1, TA, TB, TC, NB, TD, Nout, idler },
  };
}

function verifyGears(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "ratio": return near(x * p.T1, p.T2, 1e-9);
    case "speed": return near(x * p.T2, p.N1 * p.T1, 1e-6);
    case "direction": return ans === turnThrough(p.start, p.n - 1);
    case "teeth": return isInt(x) && near(x * p.N2, p.N1 * p.T1, 1e-6);
    case "idler": {
      // Pass the speed gear by gear, through each idler.
      const teeth = [p.T1, ...p.idlers, p.T2];
      let n = p.N1;
      for (let i = 1; i < teeth.length; i++) n = (n * teeth[i - 1]) / teeth[i];
      return near(toNum(ans.speed), n, 1e-6) && ans.dir === turnThrough(p.start, teeth.length - 1);
    }
    case "torque": return exactDp(x, 1) && near(x * p.T1, p.Tin * p.T2, 1e-6);
    case "compound": {
      const r = toNum(ans.ratio), s = toNum(ans.speed);
      const nB = (p.N1 * p.TA) / p.TB, nD = (nB * p.TC) / p.TD;
      const rOk = exactDp(r, 2) && Math.abs(r * nD - p.N1) <= 0.005 * nD + 1e-9;
      return rOk && exactDp(s, 1) && near(s, nD, 0.05 + 1e-9);
    }
    case "eff": {
      const s = toNum(ans.speed), t = toNum(ans.torque);
      // Power balance: output power = efficiency × input power (torque × rpm, the 2π/60 cancels).
      const sOk = near(s * p.T2, p.N1 * p.T1, 1e-6);
      const tOk = exactDp(t, 1) && Math.abs(t * p.N2 - (p.eta / 100) * p.Tin * p.N1) <= 0.05 * p.N2 + 1e-9;
      return sOk && tOk;
    }
    case "choose": {
      const r = toNum(ans.ratio), t = toNum(ans.torque);
      const m = /^(\d+) teeth → (\d+) teeth$/.exec(String(ans.pair));
      if (!m) return false;
      const out = (p.N1 * Number(m[1])) / Number(m[2]);
      const rOk = exactDp(r, 2) && Math.abs(r * p.N2 - p.N1) <= 0.005 * p.N2 + 1e-9;
      const tOk = exactDp(t, 1) && Math.abs(t * p.N2 - (p.eta / 100) * p.Tm * p.N1) <= 0.05 * p.N2 + 1e-9;
      return rOk && near(out, p.N2, 1e-6) && tOk;
    }
    case "design": {
      const nb = toNum(ans.nb), td = toNum(ans.td);
      const nbOk = near(nb * p.TB, p.N1 * p.TA, 1e-6);
      const tdOk = isInt(td) && near((nb * p.TC) / td, p.Nout, 1e-6);
      return nbOk && tdOk && ans.dir === turnThrough(CW, p.idler ? 3 : 2);
    }
    default: return false;
  }
}

// =====================================================================
// Pulleys and belt drives
// =====================================================================
const PULLEY_D = [50, 60, 75, 80, 100, 120, 125, 150, 160, 200, 240, 250, 300];
const IDEAL_PULLEY = "Ignore friction and the weight of the pulleys.";

function genPulleys(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["effort", "rope", "belt"]);
    if (kind === "effort") {
      const n = rng.int(2, 6), E = 10 * rng.int(2, 30), W = n * E;
      return {
        prompt: `A pulley system has **${n} sections of rope** supporting the moving pulley block. ${IDEAL_PULLEY} What effort is needed to lift a load of **${W} N**, in N?`,
        answerType: "number", answer: E, tolerance: 0,
        given: [{ label: "_load", value: W }, { label: "_n", value: n }],
        explanation: `The ${n} supporting sections share the load equally, so MA = ${n}. Effort = \`_load / _n\` = ${W} / ${n} = **${E} N**.`,
        hints: ["In an ideal pulley system, the load is shared equally between the rope sections holding up the moving block.", "So MA = the number of supporting sections, and effort = load ÷ MA."],
        params: { kind, n, W, E },
      };
    }
    if (kind === "rope") {
      const n = rng.int(2, 6), h = 5 * rng.int(2, 30), pulled = n * h;
      return {
        prompt: `A pulley system has **${n} sections of rope** supporting the moving pulley block. To raise the load by **${h} cm**, how much rope must be pulled through, in cm?`,
        answerType: "number", answer: pulled, tolerance: 0,
        given: [{ label: "_n", value: n }, { label: "_h", value: h }],
        explanation: `Each of the ${n} supporting sections must shorten by ${h} cm, so the velocity ratio is ${n}: rope pulled = \`_n * _h\` = **${pulled} cm**.`,
        hints: ["When the block rises, every supporting rope section gets shorter by that same amount.", "So velocity ratio = number of supporting sections. Multiply the rise by it."],
        params: { kind, n, h, pulled },
      };
    }
    const { N1, D1, D2, N2 } = redraw(() => {
      const N1 = rng.pick(MOTOR_RPM), D1 = rng.pick(PULLEY_D), D2 = rng.pick(PULLEY_D);
      const N2 = (N1 * D1) / D2;
      return D1 !== D2 && Number.isInteger(N2) ? { N1, D1, D2, N2 } : null;
    });
    return {
      prompt: `In a belt drive, the driver pulley has a diameter of **${D1} mm** and turns at **${N1} rpm**. The driven pulley has a diameter of **${D2} mm**. The belt does not slip. What is the speed of the driven pulley, in rpm?`,
      answerType: "number", answer: N2, tolerance: 0,
      given: [{ label: "_n1", value: N1 }, { label: "_d1", value: D1 }, { label: "_d2", value: D2 }],
      explanation: `The belt moves at one speed over both pulleys, so diameter × speed is the same: ${D1} × ${N1} = ${D2} × N₂, so N₂ = \`_n1 * _d1 / _d2\` = **${N2} rpm**.`,
      hints: ["The belt runs at the same speed round both pulleys, so diameter × rpm is the same for both.", "A bigger driven pulley turns slower."],
      params: { kind, N1, D1, D2, N2 },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["eff", "real-effort", "diameter"]);
    if (kind === "eff") {
      const { n, W, E, pct } = redraw(() => {
        const n = rng.int(2, 6), W = 20 * rng.int(5, 60), E = 5 * rng.int(4, 80);
        const pct = (W / (E * n)) * 100;
        return pct >= 50 && pct <= 95 && !isTie(pct, 1) ? { n, W, E, pct: rk(pct, 1) } : null;
      });
      return {
        prompt: `A pulley system has **${n} sections of rope** supporting the load. Because of friction and the weight of the moving block, an effort of **${E} N** is needed to lift a load of **${W} N**. What is the efficiency of the system, as a percentage? Round to 1 decimal place.`,
        answerType: "number", answer: pct, tolerance: 0.05,
        given: [{ label: "_load", value: W }, { label: "_effort", value: E }, { label: "_n", value: n }],
        explanation: `MA = \`_load / _effort\` = ${W} / ${E} = ${num(W / E)}. VR = number of supporting sections = ${n}. Efficiency = MA ÷ VR × 100 = \`_load / _effort / _n * 100\` ≈ **${num(pct)} %**.`,
        hints: ["Velocity ratio = the number of supporting rope sections.", "Mechanical advantage = load ÷ effort. Efficiency = MA ÷ VR × 100."],
        params: { kind, n, W, E, pct },
      };
    }
    if (kind === "real-effort") {
      const { m, n, eta, E } = redraw(() => {
        const m = 5 * rng.int(4, 60), n = rng.int(2, 6), eta = rng.pick([60, 65, 70, 75, 80, 85, 90]);
        const E = (m * G) / (n * (eta / 100));
        return !isTie(E, 1) ? { m, n, eta, E: rk(E, 1) } : null;
      });
      return {
        prompt: `A block and tackle with **${n} supporting rope sections** is **${eta}%** efficient. What effort is needed to lift a mass of **${m} kg**, in N? Take g = 10 N/kg. Round to 1 decimal place.`,
        answerType: "number", answer: E, tolerance: 0.05,
        given: [{ label: "_mass", value: m }, { label: "_n", value: n }, { label: "_eff", value: eta }],
        explanation: `Load = ${m} × 10 = ${m * G} N. Ideal effort = ${m * G} / ${n} = ${num((m * G) / n)} N. Real effort = \`_mass * 10 / _n / (_eff / 100)\` = ${num((m * G) / n)} / ${num(eta / 100)} ≈ **${num(E)} N**.`,
        hints: ["Turn the mass into a weight first (× g).", "Ideal effort = load ÷ number of supporting sections.", "Friction means more effort: divide by the efficiency as a decimal."],
        params: { kind, m, n, eta, E },
      };
    }
    const { N1, D1, N2, D2 } = redraw(() => {
      const N1 = rng.pick(MOTOR_RPM), D1 = rng.pick([60, 75, 80, 100, 120, 150]), D2 = 5 * rng.int(10, 80);
      const N2 = (N1 * D1) / D2;
      return D2 !== D1 && Number.isInteger(N2) ? { N1, D1, N2, D2 } : null;
    });
    return {
      prompt: `A motor turns at **${N1} rpm** with a **${D1} mm** pulley on its shaft. A belt drives a pulley on a machine that must turn at **${N2} rpm**. The belt does not slip. What diameter must the machine's pulley have, in mm?`,
      answerType: "number", answer: D2, tolerance: 0, ...EXACT,
      given: [{ label: "_n1", value: N1 }, { label: "_d1", value: D1 }, { label: "_n2", value: N2 }],
      explanation: `Diameter × speed is the same on both pulleys: ${D1} × ${N1} = D × ${N2}, so D = \`_d1 * _n1 / _n2\` = ${D1 * N1} / ${N2} = **${D2} mm**.`,
      hints: ["The belt speed is the same at both pulleys, so diameter × rpm is the same for both.", "Rearrange for the machine pulley's diameter."],
      params: { kind, N1, D1, N2, D2 },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["system", "belt-speed"]);
    if (kind === "system") {
      const v = redraw(() => {
        const m = 5 * rng.int(4, 60), n = rng.int(2, 6), E = 5 * rng.int(4, 100), hh = rng.int(1, 8);
        const W = m * G, MA = W / E, pct = (MA / n) * 100;
        if (!exactDp(MA, 2) || MA >= n) return null;
        return pct >= 50 && pct <= 95 && !isTie(pct, 1) ? { m, n, E, h: hh / 2, W, MA: rk(MA, 2), pct: rk(pct, 1) } : null;
      });
      const { m, n, E, h, W, MA, pct } = v;
      const pulled = n * h;
      return {
        prompt: `A pulley system with **${n} supporting rope sections** lifts a mass of **${m} kg** through **${num(h)} m**. The effort needed is **${E} N**. Take g = 10 N/kg.`,
        answerType: "multi",
        given: [{ label: "_mass", value: m }, { label: "_n", value: n }, { label: "_effort", value: E }, { label: "_h", value: h }],
        parts: [
          partNum("ma", "MA", "Mechanical advantage (2 decimal places if needed)", MA, 0.005, "Turn the mass into a weight, then MA = load ÷ effort."),
          partNum("rope", "Rope pulled", "Length of rope pulled through, in m", pulled, 0.005, "Each supporting section shortens by the height the load rises."),
          partNum("eff", "Efficiency", "Efficiency, as a % (1 decimal place)", pct, 0.05, "Efficiency = work out ÷ work in = (load × height) ÷ (effort × rope pulled), × 100."),
        ],
        explanation: `Load = ${m} × 10 = ${W} N. MA = \`_mass * 10 / _effort\` = ${W} / ${E} = **${num(MA)}**.\n\nRope pulled = \`_n * _h\` = ${n} × ${num(h)} = **${num(pulled)} m**.\n\nEfficiency = (${W} × ${num(h)}) ÷ (${E} × ${num(pulled)}) × 100 = MA ÷ VR × 100 = ${num(MA)} / ${n} × 100 ≈ **${num(pct)} %**.`,
        params: { kind, m, n, E, h, W, MA, pct, pulled },
      };
    }
    const v = redraw(() => {
      const N1 = rng.pick(MOTOR_RPM), D1 = rng.pick(PULLEY_D), D2 = rng.pick(PULLEY_D);
      const N2 = (N1 * D1) / D2, vb = (Math.PI * D1 * N1) / 60000;
      return D1 !== D2 && Number.isInteger(N2) && !isTie(vb, 2) ? { N1, D1, D2, N2, vb: rk(vb, 2) } : null;
    });
    const { N1, D1, D2, N2, vb } = v;
    return {
      prompt: `A belt drive has a **${D1} mm** driver pulley turning at **${N1} rpm** and a **${D2} mm** driven pulley. The belt does not slip.`,
      answerType: "multi",
      given: [{ label: "_n1", value: N1 }, { label: "_d1", value: D1 }, { label: "_d2", value: D2 }],
      parts: [
        partNum("speed", "Driven speed", "Speed of the driven pulley, in rpm", N2, 0, "Diameter × rpm is the same for both pulleys."),
        partNum("belt", "Belt speed", "Linear speed of the belt, in m/s (2 decimal places)", vb, 0.005, "Each turn moves the belt one circumference, π × D. Use D in metres and turns per second (rpm ÷ 60)."),
      ],
      explanation: `Driven speed = \`_n1 * _d1 / _d2\` = ${N1} × ${D1} / ${D2} = **${N2} rpm**.\n\nBelt speed = π × D × N ÷ 60 with D in m: \`pi * _d1 / 1000 * _n1 / 60\` = π × ${num(D1 / 1000)} × ${N1} / 60 ≈ **${num(vb)} m/s**. (The driven pulley gives the same: π × ${num(D2 / 1000)} × ${N2} / 60.)`,
      params: { kind, N1, D1, D2, N2, vb },
    };
  }

  // expert: fewest rope sections for a limited effort, or design a belt drive within a belt speed limit
  const kind = rng.pick(["min-ropes", "belt-design"]);
  if (kind === "min-ropes") {
    const v = redraw(() => {
      const m = 10 * rng.int(5, 80), Emax = 10 * rng.int(15, 60), eta = rng.pick([70, 75, 80, 85, 90]);
      const W = m * G, raw = W / ((eta / 100) * Emax);
      const frac = raw - Math.floor(raw);
      if (frac < 0.05 || frac > 0.95) return null;
      const n = Math.ceil(raw);
      if (n < 2 || n > 8) return null;
      const h = rng.int(1, 8) / 2, E = W / (n * (eta / 100));
      return !isTie(E, 1) ? { m, Emax, eta, W, n, h, E: rk(E, 1) } : null;
    });
    const { m, Emax, eta, W, n, h, E } = v;
    return {
      prompt: `A mass of **${m} kg** must be lifted with a pulley system by a worker who can pull with at most **${Emax} N**. The system is **${eta}%** efficient, whatever the number of pulleys. Take g = 10 N/kg.`,
      answerType: "multi",
      given: [{ label: "_mass", value: m }, { label: "_max_effort", value: Emax }, { label: "_eff", value: eta }],
      parts: [
        partNum("n", "Rope sections", "Fewest supporting rope sections that will do", n, 0, "Real effort = load ÷ (sections × efficiency). Find the sections that make it equal to the maximum, then round up.", EXACT),
        partNum("rope", "Rope pulled", `With that many sections, how much rope must be pulled to raise the load ${num(h)} m? In m`, n * h, 0.005, "Every supporting section shortens by the height the load rises."),
        partNum("effort", "Effort", "Effort actually needed with that many sections, in N (1 decimal place)", E, 0.05, "Ideal effort = load ÷ sections. Divide by the efficiency as a decimal."),
      ],
      explanation: `Load = ${m} × 10 = ${W} N. Sections needed: \`_mass * 10 / (_eff / 100 * _max_effort)\` = ${W} / (${num(eta / 100)} × ${Emax}) ≈ ${num(W / ((eta / 100) * Emax))}. A part of a rope section is impossible and fewer would need too much effort, so round **up**: **${n} sections**.\n\nRope pulled = ${n} × ${num(h)} = **${num(n * h)} m**.\n\nEffort = ${W} / (${n} × ${num(eta / 100)}) ≈ **${num(E)} N**, within the ${Emax} N limit.`,
      params: { kind, m, Emax, eta, W, n, h, E },
    };
  }
  const v = redraw(() => {
    const N1 = rng.pick(MOTOR_RPM), D1 = rng.pick([60, 75, 80, 100, 120, 150, 160, 200]), D2 = 5 * rng.int(10, 100);
    const N2 = (N1 * D1) / D2;
    if (D2 === D1 || !Number.isInteger(N2)) return null;
    const vb = (Math.PI * D1 * N1) / 60000, Vmax = rng.pick([5, 8, 10, 12, 15, 20, 25, 30]);
    return Math.abs(vb - Vmax) >= 0.3 && Math.abs(vb - Vmax) <= 8 && !isTie(vb, 2) ? { N1, D1, D2, N2, vb: rk(vb, 2), Vmax } : null;
  });
  const { N1, D1, D2, N2, vb, Vmax } = v;
  const ok = vb <= Vmax ? "Yes" : "No";
  return {
    prompt: `A motor turns at **${N1} rpm** with a **${D1} mm** pulley. A belt must drive a machine shaft at **${N2} rpm**. The belt chosen is rated for a speed of at most **${Vmax} m/s**. The belt does not slip.`,
    answerType: "multi",
    given: [{ label: "_n1", value: N1 }, { label: "_d1", value: D1 }, { label: "_n2", value: N2 }, { label: "_v_max", value: Vmax }],
    parts: [
      partNum("d2", "Pulley", "Diameter of the machine's pulley, in mm", D2, 0, "Diameter × rpm is the same for both pulleys: solve for the machine pulley.", EXACT),
      partNum("belt", "Belt speed", "Speed of the belt, in m/s (2 decimal places)", vb, 0.005, "Belt speed = π × D (in m) × rpm ÷ 60, using either pulley."),
      partChoice("ok", "Within rating", "Is the belt within its speed rating?", ok, ["Yes", "No"], `Compare your belt speed with the ${Vmax} m/s rating.`),
    ],
    explanation: `Pulley: \`_d1 * _n1 / _n2\` = ${D1 * N1} / ${N2} = **${D2} mm**.\n\nBelt speed = \`pi * _d1 / 1000 * _n1 / 60\` = π × ${num(D1 / 1000)} × ${N1} / 60 ≈ **${num(vb)} m/s**.\n\n${num(vb)} m/s is ${ok === "Yes" ? "within" : "above"} the ${Vmax} m/s rating: **${ok}**.`,
    params: { kind, N1, D1, D2, N2, vb, Vmax },
  };
}

function verifyPulleys(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "effort": return near(x * p.n, p.W, 1e-9);
    case "rope": return near(x / p.n, p.h, 1e-9);
    case "belt": return near(x * p.D2, p.N1 * p.D1, 1e-6);
    // Work balance: efficiency × effort × rope pulled = load × rise (per unit rise).
    case "eff": return exactDp(x, 1) && Math.abs((x / 100) * p.E * p.n - p.W) <= (0.05 / 100) * p.E * p.n + 1e-9;
    case "real-effort": return exactDp(x, 1) && Math.abs(x * p.n * (p.eta / 100) - p.m * 10) <= 0.05 * p.n * (p.eta / 100) + 1e-9;
    case "diameter": return isInt(x) && near(x * p.N2, p.N1 * p.D1, 1e-6);
    case "system": {
      const ma = toNum(ans.ma), rope = toNum(ans.rope), eff = toNum(ans.eff);
      const maOk = exactDp(ma, 2) && Math.abs(ma * p.E - p.m * 10) <= 0.005 * p.E + 1e-9;
      const ropeOk = near(rope / p.n, p.h, 1e-9);
      const effOk = exactDp(eff, 1) && Math.abs(eff - ((p.m * 10 * p.h) / (p.E * rope)) * 100) <= 0.05 + 1e-9;
      return maOk && ropeOk && effOk;
    }
    case "belt-speed":
    case "belt-design": {
      // Belt speed checked at the driven pulley (same belt, other pulley).
      const s = p.kind === "belt-speed" ? toNum(ans.speed) : p.N2;
      const d2 = p.kind === "belt-speed" ? p.D2 : toNum(ans.d2);
      const b = toNum(ans.belt);
      const sOk = near(s * d2, p.N1 * p.D1, 1e-6);
      const vb = (Math.PI * (d2 / 1000) * s) / 60;
      const bOk = exactDp(b, 2) && near(b, vb, 0.005 + 1e-9);
      if (p.kind === "belt-speed") return sOk && bOk;
      return isInt(d2) && sOk && bOk && ans.ok === (vb <= p.Vmax ? "Yes" : "No");
    }
    case "min-ropes": {
      const n = toNum(ans.n), rope = toNum(ans.rope), e = toNum(ans.effort);
      const enough = (k) => (p.m * 10) / (k * (p.eta / 100)) <= p.Emax + 1e-9;
      const nOk = isInt(n) && enough(n) && !enough(n - 1);
      const ropeOk = near(rope, n * p.h, 1e-9);
      const eOk = exactDp(e, 1) && Math.abs(e * n * (p.eta / 100) - p.m * 10) <= 0.05 * n * (p.eta / 100) + 1e-9;
      return nOk && ropeOk && eOk;
    }
    default: return false;
  }
}

// =====================================================================
// Torque and power
// =====================================================================
const STAGES = ["a flexible coupling", "a belt drive", "a gearbox", "a chain drive", "the output shaft bearings"];

function genPower(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["rads", "power", "torque"]);
    if (kind === "rads") {
      const { N, w } = redraw(() => {
        const N = rng.pick([60, 90, 120, 150, 300, 450, 600, 750, 900, 1000, 1200, 1440, 1500, 1800, 2400, 2880, 3000]);
        const w = (TWO_PI * N) / 60;
        return !isTie(w, 2) ? { N, w: rk(w, 2) } : null;
      });
      return {
        prompt: `A shaft turns at **${N} rpm**. What is its angular speed, in rad/s? Round to 2 decimal places.`,
        answerType: "number", answer: w, tolerance: 0.005,
        given: [{ label: "_rpm", value: N }],
        explanation: `One revolution is 2π radians and one minute is 60 s: ω = \`2 * pi * _rpm / 60\` = 2π × ${N} / 60 ≈ **${num(w)} rad/s**.`,
        hints: ["One revolution = 2π radians.", "rpm counts revolutions per minute: divide by 60 for per second."],
        params: { kind, N, w },
      };
    }
    const T = rng.int(2, 80), w = rng.int(10, 300), P = T * w;
    if (kind === "power") {
      return {
        prompt: `A shaft transmits a torque of **${T} N·m** while turning at **${w} rad/s**. What power does it transmit, in W?`,
        answerType: "number", answer: P, tolerance: 0,
        given: [{ label: "_torque", value: T }, { label: "_omega", value: w }],
        explanation: `Power = torque × angular speed: P = \`_torque * _omega\` = ${T} × ${w} = **${P} W**.`,
        hints: ["Power = torque × angular speed (P = Tω).", "N·m × rad/s gives W."],
        params: { kind, T, w, P },
      };
    }
    return {
      prompt: `A shaft transmits **${P} W** while turning at **${w} rad/s**. What torque does it carry, in N·m?`,
      answerType: "number", answer: T, tolerance: 0,
      given: [{ label: "_power", value: P }, { label: "_omega", value: w }],
      explanation: `P = Tω, so T = \`_power / _omega\` = ${P} / ${w} = **${T} N·m**.`,
      hints: ["Power = torque × angular speed. Rearrange for the torque."],
      params: { kind, T, w, P },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["power-rpm", "torque-rpm", "out-power"]);
    if (kind === "power-rpm") {
      const { T, N, P } = redraw(() => {
        const T = rng.int(5, 400), N = rng.pick([60, 120, 300, 480, 600, 720, 960, 1200, 1440, 1500, 2880]);
        const P = (T * TWO_PI * N) / 60 / 1000;
        return P >= 0.2 && P <= 200 && !isTie(P, 2) ? { T, N, P: rk(P, 2) } : null;
      });
      return {
        prompt: `A shaft carries a torque of **${T} N·m** at **${N} rpm**. What power does it transmit, in kW? Round to 2 decimal places.`,
        answerType: "number", answer: P, tolerance: 0.005,
        given: [{ label: "_torque", value: T }, { label: "_rpm", value: N }],
        explanation: `ω = 2π × ${N} / 60 ≈ ${num((TWO_PI * N) / 60)} rad/s. P = Tω = \`_torque * 2 * pi * _rpm / 60 / 1000\` ≈ ${num((T * TWO_PI * N) / 60)} W ≈ **${num(P)} kW**.`,
        hints: ["Turn rpm into rad/s first: × 2π ÷ 60.", "P = torque × ω gives watts; divide by 1000 for kW."],
        params: { kind, T, N, P },
      };
    }
    if (kind === "torque-rpm") {
      const { P, N, T } = redraw(() => {
        const P = rng.pick(STD_MOTORS), N = rng.pick([720, 960, 1440, 1450, 2880, 2900]);
        const T = (P * 1000 * 60) / (TWO_PI * N);
        return !isTie(T, 2) ? { P, N, T: rk(T, 2) } : null;
      });
      return {
        prompt: `An electric motor is rated at **${num(P)} kW** at **${N} rpm**. What torque does it give at full power, in N·m? Round to 2 decimal places.`,
        answerType: "number", answer: T, tolerance: 0.005,
        given: [{ label: "_power_kw", value: P }, { label: "_rpm", value: N }],
        explanation: `ω = 2π × ${N} / 60 ≈ ${num((TWO_PI * N) / 60)} rad/s. T = P ÷ ω = \`_power_kw * 1000 / (2 * pi * _rpm / 60)\` = ${num(P * 1000)} / ${num((TWO_PI * N) / 60)} ≈ **${num(T)} N·m**.`,
        hints: ["Convert kW to W, and rpm to rad/s (× 2π ÷ 60).", "P = Tω, so T = P ÷ ω."],
        params: { kind, P, N, T },
      };
    }
    const { Pin, eta, out, lost } = redraw(() => {
      const Pin = rng.int(2, 60) / 2, eta = rng.int(70, 98);
      const out = (Pin * eta) / 100;
      return exactDp(out, 2) ? { Pin, eta, out: rk(out, 2), lost: rk(Pin - out, 2) } : null;
    });
    return {
      prompt: `A gearbox takes in **${num(Pin)} kW** and is **${eta}%** efficient.`,
      answerType: "multi",
      given: [{ label: "_power_in", value: Pin }, { label: "_eff", value: eta }],
      parts: [
        partNum("out", "Output", "Output power, in kW (2 decimal places if needed)", out, 0.005, "Output power = input power × efficiency (as a decimal)."),
        partNum("lost", "Lost", "Power lost (as heat and noise), in kW (2 decimal places if needed)", lost, 0.005, "What goes in either comes out or is lost."),
      ],
      explanation: `Output = \`_power_in * _eff / 100\` = ${num(Pin)} × ${num(eta / 100)} = **${num(out)} kW**.\n\nLost = ${num(Pin)} − ${num(out)} = **${num(lost)} kW**.`,
      params: { kind, Pin, eta, out, lost },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["stages", "gearbox"]);
    if (kind === "stages") {
      const v = redraw(() => {
        const k = rng.int(2, 3);
        const names = rng.shuffle(STAGES).slice(0, k);
        const etas = names.map(() => rng.int(85, 99));
        const Pin = rng.int(4, 60) / 2;
        const overall = etas.reduce((a, e) => a * (e / 100), 1) * 100;
        if (!exactDp(overall, 2)) return null;
        const out = (Pin * overall) / 100;
        if (isTie(out, 2)) return null;
        const lost = Pin - out;
        return rk(lost, 2) === rk(Pin - rk(out, 2), 2) ? { names, etas, Pin, overall: rk(overall, 2), out: rk(out, 2), lost: rk(lost, 2) } : null;
      });
      const { names, etas, Pin, overall, out, lost } = v;
      const list = names.map((nm, i) => `- ${nm}: **${etas[i]}%**`).join("\n");
      return {
        prompt: `A motor delivers **${num(Pin)} kW** into a drive that passes through these stages in turn, with these efficiencies:\n\n${list}\n\nFind the overall efficiency and the power that reaches the machine.`,
        answerType: "multi",
        given: [{ label: "_power_in", value: Pin }, ...etas.map((e, i) => ({ label: `_eff${i + 1}`, value: e }))],
        parts: [
          partNum("overall", "Overall", "Overall efficiency, as a % (2 decimal places if needed)", overall, 0.005, "Efficiencies in series multiply: turn each into a decimal and multiply them."),
          partNum("out", "Output", "Power reaching the machine, in kW (2 decimal places)", out, 0.005, "Output power = input power × overall efficiency."),
          partNum("lost", "Lost", "Total power lost, in kW (2 decimal places)", lost, 0.005, "Lost = input − output."),
        ],
        explanation: `Overall efficiency = ${etas.map((e) => num(e / 100)).join(" × ")} = ${num(overall / 100)}, so **${num(overall)} %**. (Not the sum or average of the losses.)\n\nOutput = ${num(Pin)} × ${num(overall / 100)} ≈ **${num(out)} kW**.\n\nLost = ${num(Pin)} − ${num(out)} = **${num(lost)} kW**.`,
        params: { kind, etas, Pin, overall, out, lost },
      };
    }
    const v = redraw(() => {
      const P = rng.pick([1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11]), N1 = rng.pick([720, 960, 1440, 1450, 2880, 2900]);
      const R = rng.pick([4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30]), eta = rng.pick([85, 88, 90, 92, 94, 95, 96]);
      const Nout = N1 / R, Pout = (P * eta) / 100;
      if (!Number.isInteger(Nout) || !exactDp(Pout, 2)) return null;
      const Tout = (Pout * 1000 * 60) / (TWO_PI * Nout);
      return !isTie(Tout, 1) ? { P, N1, R, eta, Nout, Pout: rk(Pout, 2), Tout: rk(Tout, 1) } : null;
    });
    const { P, N1, R, eta, Nout, Pout, Tout } = v;
    return {
      prompt: `A motor delivering **${num(P)} kW** at **${N1} rpm** drives a reduction gearbox with a ratio of **${R} : 1** (input speed ÷ output speed). The gearbox is **${eta}%** efficient.`,
      answerType: "multi",
      given: [{ label: "_power_kw", value: P }, { label: "_rpm", value: N1 }, { label: "_ratio", value: R }, { label: "_eff", value: eta }],
      parts: [
        partNum("speed", "Speed", "Output speed, in rpm", Nout, 0, "Output speed = input speed ÷ ratio."),
        partNum("power", "Power", "Output power, in kW (2 decimal places if needed)", Pout, 0.005, "Output power = input power × efficiency."),
        partNum("torque", "Torque", "Output torque, in N·m (1 decimal place)", Tout, 0.05, "T = P ÷ ω: output power in W, and output speed in rad/s (× 2π ÷ 60)."),
      ],
      explanation: `Output speed = \`_rpm / _ratio\` = ${N1} / ${R} = **${Nout} rpm**.\n\nOutput power = \`_power_kw * _eff / 100\` = ${num(P)} × ${num(eta / 100)} = **${num(Pout)} kW**.\n\nω = 2π × ${Nout} / 60 ≈ ${num((TWO_PI * Nout) / 60)} rad/s. Torque = ${num(Pout * 1000)} / ${num((TWO_PI * Nout) / 60)} ≈ **${num(Tout)} N·m**.`,
      params: { kind, P, N1, R, eta, Nout, Pout, Tout },
    };
  }

  // expert: size a motor for a load, or follow a motor through a belt and a gear pair
  const kind = rng.pick(["sizing", "chain"]);
  if (kind === "sizing") {
    const v = redraw(() => {
      const Tout = 10 * rng.int(5, 150), Nout = rng.int(10, 200), R = rng.pick([5, 8, 10, 12, 15, 20, 25, 30]), eta = rng.pick([80, 85, 88, 90, 92, 95]);
      const Nm = Nout * R;
      if (Nm < 600 || Nm > 3000) return null;
      const Pin = (Tout * TWO_PI * Nout) / 60 / (eta / 100) / 1000;
      if (Pin < 0.3 || Pin > 14.5 || isTie(Pin, 2)) return null;
      const k = STD_MOTORS.findIndex((s) => s >= Pin);
      if (k < 1 || STD_MOTORS[k] / Pin < 1.02 || Pin / STD_MOTORS[k - 1] < 1.02) return null;
      return { Tout, Nout, R, eta, Nm, Pin: rk(Pin, 2), k };
    });
    const { Tout, Nout, R, eta, Nm, Pin, k } = v;
    const start = Math.max(0, Math.min(STD_MOTORS.length - 4, k - 1 - (Nout % 2)));
    const opts = STD_MOTORS.slice(start, start + 4).map((s) => `${num(s)} kW`);
    const pick = `${num(STD_MOTORS[k])} kW`;
    return {
      prompt: `A conveyor drum needs a torque of **${Tout} N·m** at **${Nout} rpm**. It is driven by an electric motor through a gearbox with a ratio of **${R} : 1** (motor speed ÷ drum speed), which is **${eta}%** efficient. Motors come in these standard sizes: **${opts.join(", ")}**.`,
      answerType: "multi",
      given: [{ label: "_torque", value: Tout }, { label: "_rpm", value: Nout }, { label: "_ratio", value: R }, { label: "_eff", value: eta }],
      parts: [
        partNum("speed", "Motor speed", "Motor speed needed, in rpm", Nm, 0, "The motor turns faster than the drum by the gearbox ratio."),
        partNum("power", "Power", "Motor power needed, in kW (2 decimal places)", Pin, 0.005, "Power at the drum = T × ω (ω in rad/s). The motor must also cover the gearbox losses: divide by the efficiency."),
        partChoice("motor", "Motor", "Smallest standard motor that is enough", pick, opts, "Take the first standard size at or above the power you found, never one below."),
      ],
      explanation: `Motor speed = \`_rpm * _ratio\` = ${Nout} × ${R} = **${Nm} rpm**.\n\nPower at the drum = \`_torque * 2 * pi * _rpm / 60\` ≈ ${num((Tout * TWO_PI * Nout) / 60)} W. Motor power = that ÷ ${num(eta / 100)} ≈ ${num((Tout * TWO_PI * Nout) / 60 / (eta / 100))} W ≈ **${num(Pin)} kW**.\n\nThe smallest standard size at or above it is **${pick}**.`,
      params: { kind, Tout, Nout, R, eta, Nm, Pin },
    };
  }
  const v = redraw(() => {
    const N1 = rng.pick(MOTOR_RPM), Tm = rng.int(5, 40);
    const D1 = rng.pick([80, 100, 120, 150]), rb = rng.pick([1.5, 2, 2.5, 3]), D2 = D1 * rb;
    const T1 = rng.pick([12, 15, 16, 20, 24, 25]), rg = rng.pick([2, 2.5, 3, 4, 5]), T2 = T1 * rg;
    if (!Number.isInteger(D2) || !Number.isInteger(T2)) return null;
    const etaB = rng.pick([94, 95, 96, 97, 98]), etaG = rng.pick([90, 92, 94, 95, 96, 97]);
    const Nout = N1 / (rb * rg), Tout = Tm * rb * rg * (etaB / 100) * (etaG / 100), eff = (etaB * etaG) / 100;
    return !isTie(Nout, 1) && !isTie(Tout, 1) ? { N1, Tm, D1, D2, T1, T2, etaB, etaG, Nout: rk(Nout, 1), Tout: rk(Tout, 1), eff: rk(eff, 2) } : null;
  });
  const { N1, Tm, D1, D2, T1, T2, etaB, etaG, Nout, Tout, eff } = v;
  return {
    prompt: `A motor gives **${Tm} N·m** at **${N1} rpm**. It drives a belt from a **${D1} mm** pulley to a **${D2} mm** pulley (belt drive **${etaB}%** efficient, no slip). The large pulley's shaft carries a **${T1}-tooth** gear that meshes with a **${T2}-tooth** gear on the output shaft (gear pair **${etaG}%** efficient).`,
    answerType: "multi",
    given: [{ label: "_n1", value: N1 }, { label: "_torque_in", value: Tm }, { label: "_d1", value: D1 }, { label: "_d2", value: D2 }, { label: "_t1", value: T1 }, { label: "_t2", value: T2 }, { label: "_eff_belt", value: etaB }, { label: "_eff_gear", value: etaG }],
    parts: [
      partNum("speed", "Speed", "Output shaft speed, in rpm (1 decimal place)", Nout, 0.05, "Divide the motor speed by each stage's ratio in turn: D₂ ÷ D₁ for the belt, then teeth ratio for the gears."),
      partNum("torque", "Torque", "Output shaft torque, in N·m (1 decimal place)", Tout, 0.05, "Torque is multiplied by each stage's ratio and by each stage's efficiency."),
      partNum("eff", "Efficiency", "Overall efficiency, as a % (2 decimal places if needed)", eff, 0.005, "Efficiencies in series multiply."),
    ],
    explanation: `Belt ratio = ${D2} / ${D1} = ${num(D2 / D1)}; gear ratio = ${T2} / ${T1} = ${num(T2 / T1)}; overall ratio = ${num((D2 / D1) * (T2 / T1))}.\n\nSpeed = \`_n1 * _d1 / _d2 * _t1 / _t2\` = ${N1} / ${num((D2 / D1) * (T2 / T1))} ≈ **${num(Nout)} rpm**.\n\nTorque = \`_torque_in * _d2 / _d1 * _t2 / _t1 * _eff_belt / 100 * _eff_gear / 100\` = ${Tm} × ${num((D2 / D1) * (T2 / T1))} × ${num(etaB / 100)} × ${num(etaG / 100)} ≈ **${num(Tout)} N·m**.\n\nOverall efficiency = ${num(etaB / 100)} × ${num(etaG / 100)} = ${num(eff / 100)} = **${num(eff)} %**.`,
    params: { kind, N1, Tm, D1, D2, T1, T2, etaB, etaG, Nout, Tout, eff },
  };
}

function verifyPower(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "rads": return exactDp(x, 2) && Math.abs((x * 60) / TWO_PI - p.N) <= (0.005 * 60) / TWO_PI + 1e-9;
    case "power": return near(x / p.w, p.T, 1e-9);
    case "torque": return near(x * p.w, p.P, 1e-9);
    case "power-rpm": return exactDp(x, 2) && Math.abs(x * 1000 * 60 - p.T * TWO_PI * p.N) <= 0.005 * 1000 * 60 + 1e-6;
    case "torque-rpm": return exactDp(x, 2) && Math.abs((x * TWO_PI * p.N) / 60 - p.P * 1000) <= (0.005 * TWO_PI * p.N) / 60 + 1e-6;
    case "out-power": {
      const out = toNum(ans.out), lost = toNum(ans.lost);
      return near(out + lost, p.Pin, 1e-9) && near(out / p.Pin, p.eta / 100, 1e-9);
    }
    case "stages": {
      // Pass the power through the stages one at a time.
      let P = p.Pin;
      for (const e of p.etas) P -= P * (1 - e / 100);
      const o = toNum(ans.overall), out = toNum(ans.out), lost = toNum(ans.lost);
      const oOk = exactDp(o, 2) && near(o, (P / p.Pin) * 100, 0.005 + 1e-9);
      const outOk = exactDp(out, 2) && near(out, P, 0.005 + 1e-9);
      const lostOk = exactDp(lost, 2) && near(lost + P, p.Pin, 0.005 + 1e-9);
      return oOk && outOk && lostOk;
    }
    case "gearbox": {
      const s = toNum(ans.speed), pw = toNum(ans.power), t = toNum(ans.torque);
      // Torque route: input torque × ratio × efficiency.
      const Tin = (p.P * 1000) / ((TWO_PI * p.N1) / 60);
      const sOk = near(s * p.R, p.N1, 1e-9);
      const pOk = near(pw, (p.P * p.eta) / 100, 0.005 + 1e-9) && exactDp(pw, 2);
      const tOk = exactDp(t, 1) && near(t, Tin * p.R * (p.eta / 100), 0.05 + 1e-9);
      return sOk && pOk && tOk;
    }
    case "sizing": {
      const s = toNum(ans.speed), pw = toNum(ans.power);
      // Motor-side route: motor torque = drum torque ÷ (ratio × efficiency), power = Tm × ωm.
      const Tm = p.Tout / (p.R * (p.eta / 100));
      const need = (Tm * TWO_PI * s) / 60 / 1000;
      const sOk = near(s / p.R, p.Nout, 1e-9);
      const pOk = exactDp(pw, 2) && near(pw, need, 0.005 + 1e-9);
      const m = /^([\d.]+) kW$/.exec(String(ans.motor));
      if (!m) return false;
      const size = Number(m[1]), i = STD_MOTORS.indexOf(size);
      const mOk = i >= 0 && size >= need && (i === 0 || STD_MOTORS[i - 1] < need);
      return sOk && pOk && mOk;
    }
    case "chain": {
      const s = toNum(ans.speed), t = toNum(ans.torque), e = toNum(ans.eff);
      // Speed stage by stage; torque from the power balance at the output.
      const nMid = (p.N1 * p.D1) / p.D2, nOut = (nMid * p.T1) / p.T2;
      const Pout = ((p.Tm * TWO_PI * p.N1) / 60) * (p.etaB / 100) * (p.etaG / 100);
      const tOut = Pout / ((TWO_PI * nOut) / 60);
      const sOk = exactDp(s, 1) && near(s, nOut, 0.05 + 1e-9);
      const tOk = exactDp(t, 1) && near(t, tOut, 0.05 + 1e-9);
      const eOk = exactDp(e, 2) && near(e, (Pout / ((p.Tm * TWO_PI * p.N1) / 60)) * 100, 0.005 + 1e-9);
      return sOk && tOk && eOk;
    }
    default: return false;
  }
}

// =====================================================================

const SUBTOPICS = { levers: genLevers, gears: genGears, pulleys: genPulleys, "power-transmission": genPower };
const VERIFIERS = { levers: verifyLevers, gears: verifyGears, pulleys: verifyPulleys, "power-transmission": verifyPower };

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
