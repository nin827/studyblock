// Fluids & Hydraulics generator: flow rate and continuity, hydraulic cylinders and jacks, pump
// power and running costs, filling and draining tanks.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Every rounded answer states its rounding; draws that land on a
// rounding half-step, or whose later parts would change when worked from a rounded earlier part,
// are redrawn inside generate(). Constants are stated in each prompt that uses them: g = 9.81 N/kg,
// water 1000 kg/m³, 1 m³ = 1000 L, 1 bar = 100 000 Pa = 0.1 N/mm². verify() re-derives each answer
// by a different route (back-substitution into the inverse relation) from the numbers in `params`.

import { fmtNum, roundTo, isHalfStep } from "../../js/lib/mathutil.js";

const num = (n) => fmtNum(n, 4);
const rk = (x, k) => roundTo(x, k);
const isTie = (x, k) => isHalfStep(x, k, 1e-4);
const EXACT = { fuzzyNumber: 0 };
const G_TEXT = "Take g = 9.81 N/kg and the density of water as 1000 kg/m³.";
const money = (x) => `$${x.toFixed(2)}`;

// Redraw until `fn` returns a truthy draw.
function redraw(fn) {
  for (let i = 0; i < 5000; i++) {
    const r = fn();
    if (r) return r;
  }
  throw new Error("fluid-systems: no valid draw");
}
const partNum = (id, label, ask, answer, tol, hint, extra = {}) => ({ id, label, ask, answerType: "number", answer, tolerance: tol, hint, ...extra });
const circ = (d) => (Math.PI * d * d) / 4; // generate side: area of a circle from its diameter

// ---- verify-side helpers (local, independent of generation) -----------------------------
const toNum = (v) => (v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v));
const near = (x, t, tol = 1e-9) => Number.isFinite(x) && Math.abs(x - t) <= tol;
const exactDp = (x, k) => Number.isFinite(x) && Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6;
// A rounded answer x (k decimals) and a relation f(x) that should equal `target`: accept when the
// target lies between f(x - half step) and f(x + half step), f increasing or decreasing.
function brackets(x, k, f, target) {
  if (!exactDp(x, k)) return false;
  const h = 0.5 * 10 ** -k;
  const a = f(x - h), b = f(x + h);
  return Math.min(a, b) - 1e-9 <= target && target <= Math.max(a, b) + 1e-9;
}
const disc = (r) => Math.PI * r * r; // verify side: area of a circle from its radius

// =====================================================================
// Flow rate and continuity
// =====================================================================
const CHANNELS = ["a rectangular culvert", "an irrigation channel", "a square duct", "a drainage channel", "a mill race"];
const PIPES = [25, 32, 40, 50, 63, 75, 80, 100, 110, 125, 150, 200];
const STD_PIPES = [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];
const speedLabel = (f) => (f >= 1 ? `${num(f)} times the speed` : `1/${num(1 / f)} of the speed`);

function genFlow(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["q", "v", "conv"]);
    if (kind === "q" || kind === "v") {
      const ctx = rng.pick(CHANNELS);
      const A = rng.pick([0.01, 0.02, 0.025, 0.04, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2]);
      const v = 0.5 * rng.int(1, 8);
      const Q = rk(A * v, 4);
      if (kind === "q") {
        return {
          prompt: `Water fills ${ctx} with a cross-sectional area of **${num(A)} m²** and flows along it at an average speed of **${num(v)} m/s**. What is the flow rate, in m³/s?`,
          answerType: "number", answer: Q, tolerance: 0,
          given: [{ label: "_area", value: A }, { label: "_speed", value: v }],
          explanation: `Flow rate = area × speed: \`_area * _speed\` = ${num(A)} × ${num(v)} = **${num(Q)} m³/s**.`,
          hints: ["Flow rate = cross-sectional area × average speed (Q = A × v).", "m² × m/s gives m³/s."],
          params: { kind, A, v, Q },
        };
      }
      return {
        prompt: `Water fills ${ctx} with a cross-sectional area of **${num(A)} m²**. The flow rate is **${num(Q)} m³/s**. What is the average speed of the water, in m/s?`,
        answerType: "number", answer: v, tolerance: 0,
        given: [{ label: "_flow", value: Q }, { label: "_area", value: A }],
        explanation: `Q = A × v, so v = Q ÷ A: \`_flow / _area\` = ${num(Q)} / ${num(A)} = **${num(v)} m/s**.`,
        hints: ["Flow rate = area × speed (Q = A × v).", "Rearrange for the speed: divide the flow rate by the area."],
        params: { kind, A, v, Q },
      };
    }
    const dir = rng.pick(["ls-m3", "m3-ls", "min-s"]);
    if (dir === "ls-m3") {
      const QL = rng.int(2, 400);
      return {
        prompt: `A pump delivers **${QL} L/s** of water. Write this flow rate in m³/s. (1 m³ = 1000 L.)`,
        answerType: "number", answer: rk(QL / 1000, 3), tolerance: 0,
        given: [{ label: "_flow_ls", value: QL }],
        explanation: `1 m³ = 1000 L, so divide by 1000: \`_flow_ls / 1000\` = **${num(QL / 1000)} m³/s**.`,
        hints: ["A cubic metre holds 1000 litres.", "Going from litres to the bigger unit, m³, the number gets smaller: divide."],
        params: { kind, dir, QL },
      };
    }
    if (dir === "m3-ls") {
      const Qm = rk(0.005 * rng.int(1, 100), 3);
      return {
        prompt: `A river intake draws **${num(Qm)} m³/s** of water. Write this flow rate in L/s. (1 m³ = 1000 L.)`,
        answerType: "number", answer: rk(Qm * 1000, 0), tolerance: 0,
        given: [{ label: "_flow_m3s", value: Qm }],
        explanation: `1 m³ = 1000 L, so multiply by 1000: \`_flow_m3s * 1000\` = **${num(Qm * 1000)} L/s**.`,
        hints: ["A cubic metre holds 1000 litres.", "Going from m³ to the smaller unit, litres, the number gets bigger: multiply."],
        params: { kind, dir, Qm },
      };
    }
    const Lmin = 6 * rng.int(1, 150);
    return {
      prompt: `A garden hose delivers **${Lmin} L/min**. What is that in L/s?`,
      answerType: "number", answer: rk(Lmin / 60, 1), tolerance: 0,
      given: [{ label: "_flow_lmin", value: Lmin }],
      explanation: `There are 60 seconds in a minute: \`_flow_lmin / 60\` = **${num(Lmin / 60)} L/s**.`,
      hints: ["One minute is 60 seconds.", "Less water flows in one second than in one minute: divide."],
      params: { kind, dir, Lmin },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["pipe-q", "pipe-v", "ratio"]);
    if (kind === "pipe-q") {
      const v = redraw(() => {
        const d = rng.pick(PIPES), sp = rk(0.1 * rng.int(5, 30), 1);
        const Q = (Math.PI * d * d * sp) / 4000;
        return Q >= 0.1 && !isTie(Q, 2) ? { d, sp, Q: rk(Q, 2) } : null;
      });
      const { d, sp, Q } = v;
      return {
        prompt: `Water flows at an average speed of **${num(sp)} m/s** along a full round pipe with an internal diameter of **${d} mm**. What is the flow rate, in L/s? (1 m³ = 1000 L.) Round to 2 decimal places.`,
        answerType: "number", answer: Q, tolerance: 0.005,
        given: [{ label: "_d", value: d }, { label: "_speed", value: sp }],
        explanation: `Diameter = ${d} mm = ${num(d / 1000)} m, so area = π × ${num(d / 1000)}² ÷ 4 = ${fmtNum(circ(d) / 1e6, 7)} m². Q = A × v = \`pi * (_d / 1000)^2 / 4 * _speed * 1000\` ≈ **${num(Q)} L/s**.`,
        hints: ["Area of a round pipe = π × d² ÷ 4. Put the diameter in metres first (÷ 1000).", "Q = A × v gives m³/s; multiply by 1000 for L/s."],
        params: { kind, d, sp, Q },
      };
    }
    if (kind === "pipe-v") {
      const v = redraw(() => {
        const d = rng.pick(PIPES), QL = rk(0.5 * rng.int(1, 80), 1);
        const sp = (4000 * QL) / (Math.PI * d * d);
        return sp >= 0.3 && sp <= 4 && !isTie(sp, 2) ? { d, QL, sp: rk(sp, 2) } : null;
      });
      const { d, QL, sp } = v;
      return {
        prompt: `A full round pipe with an internal diameter of **${d} mm** carries **${num(QL)} L/s** of water. What is the average speed of the water, in m/s? (1 m³ = 1000 L.) Round to 2 decimal places.`,
        answerType: "number", answer: sp, tolerance: 0.005,
        given: [{ label: "_d", value: d }, { label: "_flow_ls", value: QL }],
        explanation: `Q = ${num(QL)} L/s = ${num(QL / 1000)} m³/s. Area = π × ${num(d / 1000)}² ÷ 4 = ${fmtNum(circ(d) / 1e6, 7)} m². v = Q ÷ A = \`_flow_ls / 1000 / (pi * (_d / 1000)^2 / 4)\` ≈ **${num(sp)} m/s**.`,
        hints: ["Put everything in metres and m³/s first: ÷ 1000 for both mm and L/s.", "Area = π × d² ÷ 4, then v = Q ÷ A."],
        params: { kind, d, QL, sp },
      };
    }
    // ratio: how speed changes when the diameter changes (continuity)
    const d2s = rng.pick([20, 25, 30, 40, 50]);
    const r = rng.pick([2, 3]);
    const narrow = rng.pick([true, false]);
    const d1 = narrow ? d2s * r : d2s, d2 = narrow ? d2s : d2s * r;
    const f = narrow ? r * r : 1 / (r * r);
    const lin = narrow ? r : 1 / r;
    const answer = speedLabel(f);
    const choices = rng.shuffle([speedLabel(f), speedLabel(lin), speedLabel(1 / f), speedLabel(1 / lin)]);
    return {
      prompt: `Water flows steadily through a full pipe whose internal diameter changes from **${d1} mm** to **${d2} mm**. The flow rate is the same in both sections. How does the water's speed in the ${d2} mm section compare with its speed in the ${d1} mm section?`,
      answerType: "choice", answer, choices,
      given: [{ label: "_d1", value: d1 }, { label: "_d2", value: d2 }],
      explanation: `Continuity: A1 × v1 = A2 × v2, so v2 ÷ v1 = A1 ÷ A2. Area goes with the diameter **squared**: (${d1} ÷ ${d2})² = ${num((d1 / d2) ** 2)}. So the speed becomes **${answer}**.`,
      hints: ["The same flow passes both sections: A1 × v1 = A2 × v2.", "Area depends on the diameter squared, so scaling the diameter by a factor scales the area by that factor squared."],
      params: { kind, d1, d2 },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["cont", "branch"]);
    if (kind === "cont") {
      const v = redraw(() => {
        const d1 = rng.pick([50, 63, 75, 80, 100, 125, 150]);
        const d2 = rng.pick(PIPES.filter((x) => x < d1 && x >= d1 / 3));
        const v1 = rk(0.1 * rng.int(5, 25), 1);
        const Q = (Math.PI * d1 * d1 * v1) / 4000, v2 = v1 * (d1 / d2) ** 2;
        if (v2 > 10 || isTie(Q, 2) || isTie(v2, 2)) return null;
        // Working v2 from the rounded Q must give the same answer.
        if (rk((4000 * rk(Q, 2)) / (Math.PI * d2 * d2), 2) !== rk(v2, 2)) return null;
        return { d1, d2, v1, Q: rk(Q, 2), v2: rk(v2, 2) };
      });
      const { d1, d2, v1, Q, v2 } = v;
      return {
        prompt: `A full water main with an internal diameter of **${d1} mm** carries water at **${num(v1)} m/s**. It then narrows to an internal diameter of **${d2} mm**. (1 m³ = 1000 L.)`,
        answerType: "multi",
        given: [{ label: "_d1", value: d1 }, { label: "_v1", value: v1 }, { label: "_d2", value: d2 }],
        parts: [
          partNum("flow", "Flow rate", "Flow rate in the main, in L/s (2 decimal places)", Q, 0.005, "Q = A × v in the wide section. Area = π × d² ÷ 4 with d in metres; × 1000 for L/s."),
          partNum("speed", "Speed", `Speed in the ${d2} mm section, in m/s (2 decimal places)`, v2, 0.005, "Continuity: A1 × v1 = A2 × v2, so v2 = v1 × (d1 ÷ d2)²."),
        ],
        explanation: `Flow rate: Q = π × ${num(d1 / 1000)}² ÷ 4 × ${num(v1)} = \`pi * (_d1 / 1000)^2 / 4 * _v1 * 1000\` ≈ **${num(Q)} L/s**.\n\nSpeed: the same flow passes the narrow section, so v2 = v1 × (d1 ÷ d2)² = \`_v1 * (_d1 / _d2)^2\` ≈ **${num(v2)} m/s**.`,
        params: { kind, d1, d2, v1, Q, v2 },
      };
    }
    const v = redraw(() => {
      const Qt = rng.int(10, 60), da = rng.pick([50, 63, 75, 80, 100]), va = rk(0.1 * rng.int(5, 20), 1);
      const db = rng.pick([40, 50, 63, 75, 80, 100]);
      const Qa = (Math.PI * da * da * va) / 4000, Qb = Qt - Qa;
      if (Qb < 1) return null;
      const vb = (4000 * Qb) / (Math.PI * db * db);
      if (vb < 0.2 || vb > 8 || isTie(Qb, 2) || isTie(vb, 2)) return null;
      if (rk((4000 * rk(Qb, 2)) / (Math.PI * db * db), 2) !== rk(vb, 2)) return null;
      return { Qt, da, va, db, Qa, Qb: rk(Qb, 2), vb: rk(vb, 2) };
    });
    const { Qt, da, va, db, Qa, Qb, vb } = v;
    return {
      prompt: `A full water main carrying **${Qt} L/s** splits into two branch pipes. Branch 1 has an internal diameter of **${da} mm**, and the water in it flows at **${num(va)} m/s**. Branch 2 has an internal diameter of **${db} mm**. (1 m³ = 1000 L.)`,
      answerType: "multi",
      given: [{ label: "_flow_ls", value: Qt }, { label: "_d1", value: da }, { label: "_v1", value: va }, { label: "_d2", value: db }],
      parts: [
        partNum("flow", "Branch 2", "Flow rate in branch 2, in L/s (2 decimal places)", Qb, 0.005, "Find branch 1's flow (Q = A × v, × 1000 for L/s). What goes in must come out: the rest goes along branch 2."),
        partNum("speed", "Speed", "Speed of the water in branch 2, in m/s (2 decimal places)", vb, 0.005, "v = Q ÷ A for branch 2, with Q in m³/s and the area in m²."),
      ],
      explanation: `Branch 1: Q1 = π × ${num(da / 1000)}² ÷ 4 × ${num(va)} × 1000 = \`pi * (_d1 / 1000)^2 / 4 * _v1 * 1000\` ≈ ${num(Qa)} L/s.\n\nBranch 2: Q2 = ${Qt} − ${num(Qa)} ≈ **${num(Qb)} L/s**.\n\nSpeed: v2 = Q2 ÷ A2 = ${fmtNum(Qb / 1000, 7)} / ${fmtNum(circ(db) / 1e6, 7)} ≈ **${num(vb)} m/s**.`,
      params: { kind, Qt, da, va, db, Qb, vb },
    };
  }

  // expert: size a pipe for a speed limit, or a nozzle for a jet speed
  const kind = rng.pick(["size", "nozzle"]);
  if (kind === "size") {
    const v = redraw(() => {
      const QL = rk(0.5 * rng.int(4, 120), 1), vmax = rng.pick([1, 1.2, 1.5, 2, 2.5, 3]);
      const dmin = Math.sqrt((4000 * QL) / (Math.PI * vmax));
      const i = STD_PIPES.findIndex((s) => s >= dmin);
      if (i < 1 || isTie(dmin, 1)) return null;
      if (STD_PIPES.some((s) => Math.abs(s - dmin) < 0.1)) return null; // the rounded d picks the same size
      const s = STD_PIPES[i];
      const sp = (4000 * QL) / (Math.PI * s * s);
      if (isTie(sp, 2)) return null;
      const lo = Math.max(0, i - 2);
      return { QL, vmax, dmin: rk(dmin, 1), s, sp: rk(sp, 2), sizes: STD_PIPES.slice(lo, lo + 5) };
    });
    const { QL, vmax, dmin, s, sp, sizes } = v;
    const labels = sizes.map((x) => `${x} mm`);
    return {
      prompt: `A pumped water line must carry **${num(QL)} L/s**. To limit noise and wear, the water speed must not exceed **${num(vmax)} m/s**. The stockist has pipes with internal diameters of ${sizes.join(", ")} mm. (1 m³ = 1000 L.)`,
      answerType: "multi",
      given: [{ label: "_flow_ls", value: QL }, { label: "_vmax", value: vmax }],
      parts: [
        partNum("dia", "Min diameter", "Smallest internal diameter that keeps the speed within the limit, in mm (1 decimal place)", dmin, 0.05, "At the limit, A = Q ÷ v_max (in m² with Q in m³/s). Then solve A = π × d² ÷ 4 for d, and convert to mm."),
        { id: "size", label: "Pipe", ask: "Which stocked pipe should be used?", answerType: "choice", answer: `${s} mm`, choices: rng.shuffle(labels), hint: "Take the smallest stocked pipe that is at least as wide as your minimum diameter. A narrower pipe makes the water faster." },
        partNum("speed", "Speed", "Actual water speed in that pipe, in m/s (2 decimal places)", sp, 0.005, "v = Q ÷ A with the chosen pipe's area. It should come out a little under the limit."),
      ],
      explanation: `Minimum area: A = Q ÷ v = ${num(QL / 1000)} / ${num(vmax)} = ${fmtNum(QL / 1000 / vmax, 7)} m². Diameter: d = √(4A ÷ π) = \`sqrt(4 * _flow_ls / 1000 / _vmax / pi) * 1000\` ≈ **${num(dmin)} mm**.\n\nThe smallest stocked pipe at least that wide is **${s} mm**.\n\nActual speed: v = ${num(QL / 1000)} / (π × ${num(s / 1000)}² ÷ 4) ≈ **${num(sp)} m/s**, within the ${num(vmax)} m/s limit.`,
      params: { kind, QL, vmax, dmin, s, sp, sizes },
    };
  }
  const v = redraw(() => {
    const D = rng.pick([19, 25, 32, 38, 50]), vh = rk(0.1 * rng.int(10, 30), 1), vj = rk(0.5 * rng.int(8, 50), 1);
    if (vj < 2 * vh) return null;
    const vol = rng.pick([10, 20, 50, 100, 200]);
    const Q = (Math.PI * D * D * vh) / 4000, dn = D * Math.sqrt(vh / vj), t = vol / Q;
    if (isTie(Q, 2) || isTie(dn, 1) || isTie(t, 1) || t > 600) return null;
    const Qr = rk(Q, 2);
    if (rk(vol / Qr, 1) !== rk(t, 1)) return null;
    if (rk(Math.sqrt((4000 * Qr) / (Math.PI * vj)), 1) !== rk(dn, 1)) return null;
    return { D, vh, vj, vol, Q: Qr, dn: rk(dn, 1), t: rk(t, 1) };
  });
  const { D, vh, vj, vol, Q, dn, t } = v;
  return {
    prompt: `A fire hose with an internal diameter of **${D} mm** carries water at **${num(vh)} m/s**. A nozzle on the end must make the jet leave at **${num(vj)} m/s**. The hose is used to fill a **${vol} L** tank. (1 m³ = 1000 L.)`,
    answerType: "multi",
    given: [{ label: "_d_hose", value: D }, { label: "_v_hose", value: vh }, { label: "_v_jet", value: vj }, { label: "_volume", value: vol }],
    parts: [
      partNum("flow", "Flow rate", "Flow rate through the hose, in L/s (2 decimal places)", Q, 0.005, "Q = A × v in the hose: area = π × d² ÷ 4 with d in metres, then × 1000 for L/s."),
      partNum("nozzle", "Nozzle", "Internal diameter of the nozzle exit, in mm (1 decimal place)", dn, 0.05, "The same flow leaves the nozzle: A_nozzle = Q ÷ v_jet. Or use d_nozzle = d_hose × √(v_hose ÷ v_jet)."),
      partNum("time", "Time", "Time to fill the tank, in seconds (1 decimal place)", t, 0.05, "Time = volume ÷ flow rate, with the volume in litres and Q in L/s."),
    ],
    explanation: `Flow: Q = π × ${num(D / 1000)}² ÷ 4 × ${num(vh)} × 1000 = \`pi * (_d_hose / 1000)^2 / 4 * _v_hose * 1000\` ≈ **${num(Q)} L/s**.\n\nNozzle: A × v is the same, so d_nozzle = d_hose × √(v_hose ÷ v_jet) = \`_d_hose * sqrt(_v_hose / _v_jet)\` ≈ **${num(dn)} mm**.\n\nTime: ${vol} / ${num(Q)} ≈ **${num(t)} s**.`,
    params: { kind, D, vh, vj, vol, Q, dn, t },
  };
}

function verifyFlow(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "q": return near(x / p.v, p.A, 1e-9);
    case "v": return near(x * p.A, p.Q, 1e-9);
    case "conv":
      if (p.dir === "ls-m3") return near(x * 1000, p.QL, 1e-6);
      if (p.dir === "m3-ls") return near(x / 1000, p.Qm, 1e-9);
      return near(x * 60, p.Lmin, 1e-6);
    case "pipe-q": return brackets(x, 2, (Q) => Q / 1000 / disc(p.d / 2000), p.sp);
    case "pipe-v": return brackets(x, 2, (s) => s * disc(p.d / 2000) * 1000, p.QL);
    case "ratio": {
      const m = /^(\d+(?:\.\d+)?) times the speed$/.exec(String(ans)) || null;
      const m2 = /^1\/(\d+(?:\.\d+)?) of the speed$/.exec(String(ans)) || null;
      const f = m ? Number(m[1]) : m2 ? 1 / Number(m2[1]) : NaN;
      // A1 v1 = A2 v2  =>  v2 / v1 = A1 / A2.
      return near(f, disc(p.d1 / 2) / disc(p.d2 / 2), 1e-9);
    }
    case "cont": {
      const Q = toNum(ans.flow), s = toNum(ans.speed);
      const qOk = brackets(Q, 2, (z) => z / 1000 / disc(p.d1 / 2000), p.v1);
      const sOk = brackets(s, 2, (z) => z * disc(p.d2 / 2000), p.v1 * disc(p.d1 / 2000));
      return qOk && sOk;
    }
    case "branch": {
      const Qb = toNum(ans.flow), vb = toNum(ans.speed);
      const Qa = p.va * disc(p.da / 2000) * 1000;
      const qOk = brackets(Qb, 2, (z) => z + Qa, p.Qt);
      const vOk = brackets(vb, 2, (z) => z * disc(p.db / 2000) * 1000 + Qa, p.Qt);
      return qOk && vOk;
    }
    case "size": {
      const dia = toNum(ans.dia), sp = toNum(ans.speed);
      const dOk = brackets(dia, 1, (d) => disc(d / 2000) * p.vmax * 1000, p.QL);
      const sizes = p.sizes.slice().sort((a, b) => a - b);
      const chosen = toNum(String(ans.size).replace(/ mm$/, ""));
      const fits = (d) => (p.QL / 1000) / disc(d / 2000) <= p.vmax + 1e-12;
      const i = sizes.indexOf(chosen);
      const sizeOk = i >= 0 && fits(chosen) && (i === 0 || !fits(sizes[i - 1]));
      const sOk = sizeOk && brackets(sp, 2, (z) => z * disc(chosen / 2000) * 1000, p.QL);
      return dOk && sizeOk && sOk;
    }
    case "nozzle": {
      const Q = toNum(ans.flow), dn = toNum(ans.nozzle), t = toNum(ans.time);
      const Qx = p.vh * disc(p.D / 2000) * 1000;
      const qOk = brackets(Q, 2, (z) => z, Qx);
      const nOk = brackets(dn, 1, (d) => disc(d / 2000) * p.vj * 1000, Qx);
      const tOk = brackets(t, 1, (z) => z * Qx, p.vol);
      return qOk && nOk && tOk;
    }
    default: return false;
  }
}

// =====================================================================
// Hydraulic presses and jacks
// =====================================================================
const JACKS = ["car jack", "workshop press", "trolley jack", "bottle jack", "vehicle lift"];
const BAR = "1 bar = 100 000 Pa = 0.1 N/mm²";
const BORES = [25, 32, 40, 50, 63, 80, 100, 125, 160, 200];
const RODS = [12, 16, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 80];

function genHydraulics(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["ma", "travel", "force-bar"]);
    if (kind === "ma") {
      const dev = rng.pick(JACKS);
      const a1 = rng.pick([2, 4, 5, 8, 10, 12, 15, 20]), k = rng.int(5, 40), a2 = a1 * k;
      return {
        prompt: `A ${dev} has a small (effort) piston of area **${a1} cm²** and a large (load) piston of area **${a2} cm²**. Ignoring friction, what is its mechanical advantage (load ÷ effort)?`,
        answerType: "number", answer: k, tolerance: 0,
        given: [{ label: "_a_small", value: a1 }, { label: "_a_large", value: a2 }],
        explanation: `The pressure is the same on both pistons, so the force grows in the same ratio as the area. MA = \`_a_large / _a_small\` = ${a2} / ${a1} = **${k}**.`,
        hints: ["Pascal's principle: the same pressure acts on both pistons, so F1 ÷ A1 = F2 ÷ A2.", "So load ÷ effort = large area ÷ small area."],
        params: { kind, a1, a2, k },
      };
    }
    if (kind === "travel") {
      const dev = rng.pick(JACKS);
      const v = redraw(() => {
        const a1 = rng.pick([2, 4, 5, 8, 10]), k = rng.int(5, 40), s = rng.int(4, 20);
        const rise = (10 * s) / k;
        return Math.abs(rise * 10 - Math.round(rise * 10)) < 1e-9 ? { a1, k, s, rise: rk(rise, 1) } : null;
      });
      const { a1, k, s, rise } = v;
      const a2 = a1 * k;
      return {
        prompt: `In a ${dev}, the small piston (area **${a1} cm²**) is pushed down **${s} cm**. The large piston has an area of **${a2} cm²**. The oil cannot be squashed. How far does the large piston rise, in mm?`,
        answerType: "number", answer: rise, tolerance: 0,
        given: [{ label: "_a_small", value: a1 }, { label: "_stroke_cm", value: s }, { label: "_a_large", value: a2 }],
        explanation: `The volume of oil pushed out of the small cylinder goes into the large one: ${a1} × ${s} = ${a1 * s} cm³. Rise = ${a1 * s} / ${a2} = ${num(rise / 10)} cm = \`_a_small * _stroke_cm / _a_large * 10\` = **${num(rise)} mm**.`,
        hints: ["The oil's volume does not change: area × distance is the same for both pistons.", "Find the volume moved in cm³, divide by the large area, then convert cm to mm (× 10)."],
        params: { kind, a1, a2, s, rise },
      };
    }
    const A = rng.pick([5, 10, 12.5, 20, 25, 40, 50, 80, 100]), pb = rng.pick([20, 50, 80, 100, 120, 150, 200]);
    const F = rk((pb * A) / 100, 3);
    return {
      prompt: `A hydraulic cylinder has a piston area of **${num(A)} cm²**. The oil pressure is **${pb} bar**. What force does the piston push with, in kN? (1 bar = 100 000 Pa and 1 cm² = 0.0001 m².)`,
      answerType: "number", answer: F, tolerance: 0,
      given: [{ label: "_area_cm2", value: A }, { label: "_bar", value: pb }],
      explanation: `p = ${pb} × 100 000 = ${pb * 1e5} Pa and A = ${num(A)} / 10 000 = ${num(A / 1e4)} m². F = p × A = \`_bar * 100000 * _area_cm2 / 10000\` = ${num(F * 1000)} N = **${num(F)} kN**.`,
      hints: ["Force = pressure × area, with the pressure in Pa and the area in m².", "Convert bar to Pa (× 100 000) and cm² to m² (÷ 10 000); N ÷ 1000 gives kN."],
      params: { kind, A, pb, F },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["bore-force", "pressure-needed", "strokes"]);
    if (kind === "bore-force") {
      const v = redraw(() => {
        const D = rng.pick([32, 40, 50, 63, 80, 100, 125]), pb = rng.pick([50, 70, 100, 120, 140, 160, 200]);
        const F = (pb * 0.1 * circ(D)) / 1000;
        return !isTie(F, 1) ? { D, pb, F: rk(F, 1) } : null;
      });
      const { D, pb, F } = v;
      return {
        prompt: `A hydraulic cylinder has a bore (piston diameter) of **${D} mm** and works at **${pb} bar**. What force does it push out with, in kN? (${BAR}.) Round to 1 decimal place.`,
        answerType: "number", answer: F, tolerance: 0.05,
        given: [{ label: "_bore", value: D }, { label: "_bar", value: pb }],
        explanation: `p = ${pb} × 0.1 = ${num(pb * 0.1)} N/mm². Piston area = π × ${D}² ÷ 4 = ${num(circ(D))} mm². F = p × A = \`_bar * 0.1 * pi * _bore^2 / 4 / 1000\` ≈ **${num(F)} kN**.`,
        hints: ["Convert the pressure to N/mm² (× 0.1) so it matches an area in mm².", "Piston area = π × d² ÷ 4. Force = pressure × area, then N ÷ 1000 for kN."],
        params: { kind, D, pb, F },
      };
    }
    if (kind === "pressure-needed") {
      const v = redraw(() => {
        const D = rng.pick([40, 50, 63, 80, 100, 125]), W = rng.int(5, 150);
        const pb = (W * 1000) / (0.1 * circ(D));
        return pb >= 20 && pb <= 250 && !isTie(pb, 1) ? { D, W, pb: rk(pb, 1) } : null;
      });
      const { D, W, pb } = v;
      return {
        prompt: `A press cylinder with a bore of **${D} mm** must push with a force of **${W} kN**. What oil pressure does it need, in bar? (${BAR}.) Round to 1 decimal place.`,
        answerType: "number", answer: pb, tolerance: 0.05,
        given: [{ label: "_bore", value: D }, { label: "_force_kn", value: W }],
        explanation: `Area = π × ${D}² ÷ 4 = ${num(circ(D))} mm². p = F ÷ A = ${W * 1000} / ${num(circ(D))} = ${num(pb * 0.1)} N/mm². In bar: \`_force_kn * 1000 / (pi * _bore^2 / 4) / 0.1\` ≈ **${num(pb)} bar**.`,
        hints: ["Pressure = force ÷ area. Use N and mm² to get N/mm².", "Each 0.1 N/mm² is 1 bar, so divide N/mm² by 0.1."],
        params: { kind, D, W, pb },
      };
    }
    const dev = rng.pick(JACKS);
    const v = redraw(() => {
      const a1 = rng.pick([2, 3, 4, 5, 6]), a2 = rng.pick([40, 50, 60, 75, 80, 100, 120]), s = rng.int(3, 10), h = rng.int(5, 30);
      const r = (h * a2) / (a1 * s);
      const n = Math.ceil(r - 1e-9);
      return Math.abs(r - Math.round(r)) > 0.05 && n >= 3 && n <= 200 ? { a1, a2, s, h, n } : null;
    });
    const { a1, a2, s, h, n } = v;
    return {
      prompt: `A ${dev} has a pump piston of area **${a1} cm²** and a load piston of area **${a2} cm²**. Each pump stroke pushes the pump piston **${s} cm**. How many full strokes are needed to raise the load by at least **${h} cm**?`,
      answerType: "number", answer: n, tolerance: 0, ...EXACT,
      given: [{ label: "_a_pump", value: a1 }, { label: "_a_load", value: a2 }, { label: "_stroke_cm", value: s }, { label: "_rise_cm", value: h }],
      explanation: `Oil needed: ${a2} × ${h} = ${a2 * h} cm³. Each stroke moves ${a1} × ${s} = ${a1 * s} cm³. Strokes = \`_a_load * _rise_cm / (_a_pump * _stroke_cm)\` = ${num((a2 * h) / (a1 * s))}, so round **up** to **${n}**.`,
      hints: ["Find the volume of oil the load piston needs: its area × the rise.", "Each stroke delivers the pump piston's area × its stroke. Divide, then round up: a part stroke does not finish the lift."],
      params: { kind, a1, a2, s, h, n },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["annulus", "lever"]);
    if (kind === "annulus") {
      const v = redraw(() => {
        const D = rng.pick([40, 50, 63, 80, 100, 125]);
        const d = rng.pick(RODS.filter((r) => r >= 0.35 * D && r <= 0.7 * D));
        const pb = rng.pick([70, 100, 120, 140, 160, 200]);
        const Fe = (pb * 0.1 * circ(D)) / 1000, Fr = (pb * 0.1 * (circ(D) - circ(d))) / 1000;
        return !isTie(Fe, 1) && !isTie(Fr, 1) ? { D, d, pb, Fe: rk(Fe, 1), Fr: rk(Fr, 1) } : null;
      });
      const { D, d, pb, Fe, Fr } = v;
      return {
        prompt: `A double-acting hydraulic cylinder has a bore of **${D} mm** and a piston rod of diameter **${d} mm**. It is supplied at **${pb} bar** on whichever side is driving. (${BAR}.)`,
        answerType: "multi",
        given: [{ label: "_bore", value: D }, { label: "_rod", value: d }, { label: "_bar", value: pb }],
        parts: [
          partNum("extend", "Extend", "Force when extending (oil on the full piston face), in kN (1 decimal place)", Fe, 0.05, "Extending, the oil pushes on the whole piston: area = π × bore² ÷ 4. Force = pressure (N/mm²) × area."),
          partNum("retract", "Retract", "Force when retracting (oil on the rod side), in kN (1 decimal place)", Fr, 0.05, "Retracting, the rod takes up part of the piston face: the oil acts on the ring (annulus) = π × (bore² − rod²) ÷ 4."),
        ],
        explanation: `p = ${pb} × 0.1 = ${num(pb * 0.1)} N/mm².\n\nExtend: A = π × ${D}² ÷ 4 = ${num(circ(D))} mm², so F = \`_bar * 0.1 * pi * _bore^2 / 4 / 1000\` ≈ **${num(Fe)} kN**.\n\nRetract: annulus = π × (${D}² − ${d}²) ÷ 4 = ${num(circ(D) - circ(d))} mm², so F = \`_bar * 0.1 * pi * (_bore^2 - _rod^2) / 4 / 1000\` ≈ **${num(Fr)} kN**. The cylinder pulls back with less force than it pushes.`,
        params: { kind, D, d, pb, Fe, Fr },
      };
    }
    const v = redraw(() => {
      const L1 = rng.pick([300, 400, 450, 500, 600]), L2 = rng.pick([25, 30, 40, 50, 60, 75]);
      if (L1 % L2 !== 0) return null;
      const r = L1 / L2;
      if (r < 5 || r > 16) return null;
      const E = 10 * rng.int(10, 40), d1 = rng.pick([10, 12, 15, 16, 20]), d2 = rng.pick([40, 50, 60, 63, 70, 80]);
      const s = rng.pick([20, 25, 30, 40]), h = 10 * rng.int(2, 15);
      const Fp = E * r, W = (Fp * (d2 / d1) ** 2) / 1000;
      const ratio = (h * d2 * d2) / (s * d1 * d1);
      const n = Math.ceil(ratio - 1e-9);
      if (isTie(W, 1) || Math.abs(ratio - Math.round(ratio)) < 0.05 || n > 150 || n < 3) return null;
      return { L1, L2, E, d1, d2, s, h, Fp, W: rk(W, 1), n };
    });
    const { L1, L2, E, d1, d2, s, h, Fp, W, n } = v;
    return {
      prompt: `A bottle jack is worked by a handle. The effort of **${E} N** is applied **${L1} mm** from the handle's pivot, and the pump plunger is linked to the handle **${L2} mm** from the pivot. The pump plunger has a diameter of **${d1} mm** and the ram (load piston) a diameter of **${d2} mm**. Each stroke moves the plunger **${s} mm**. Ignore friction.`,
      answerType: "multi",
      given: [{ label: "_effort", value: E }, { label: "_l_handle", value: L1 }, { label: "_l_plunger", value: L2 }, { label: "_d_plunger", value: d1 }, { label: "_d_ram", value: d2 }, { label: "_stroke", value: s }, { label: "_lift", value: h }],
      parts: [
        partNum("plunger", "Plunger", "Force on the pump plunger, in N", Fp, 0, "Moments about the handle's pivot: effort × its distance = plunger force × its distance.", EXACT),
        partNum("load", "Load", "Load the ram can lift, in kN (1 decimal place)", W, 0.05, "Same pressure in both cylinders, so the force scales with the area: × (ram diameter ÷ plunger diameter)²."),
        partNum("strokes", "Strokes", `Full strokes needed to lift the load at least ${h} mm`, n, 0, "Oil needed = ram area × lift; oil per stroke = plunger area × stroke. Divide and round up.", EXACT),
      ],
      explanation: `Handle: F = \`_effort * _l_handle / _l_plunger\` = ${E} × ${L1} / ${L2} = **${Fp} N**.\n\nRam: the force scales with the area, so W = ${Fp} × (${d2} / ${d1})² = \`_effort * _l_handle / _l_plunger * (_d_ram / _d_plunger)^2 / 1000\` ≈ **${num(W)} kN**.\n\nStrokes: ${h} × ${d2}² / (${s} × ${d1}²) = ${num((h * d2 * d2) / (s * d1 * d1))}, so round **up** to **${n}** (π ÷ 4 cancels).`,
      params: { kind, L1, L2, E, d1, d2, s, h, Fp, W, n },
    };
  }

  // expert: size a bore for a load, or cylinder speeds from the pump flow
  const kind = rng.pick(["bore-size", "speed"]);
  if (kind === "bore-size") {
    const v = redraw(() => {
      const W = rng.int(5, 150), pb = rng.pick([70, 100, 140, 160, 200]), eff = rng.pick([85, 90, 95]);
      const A = (W * 1000) / ((eff / 100) * 0.1 * pb);
      const Dmin = Math.sqrt((4 * A) / Math.PI);
      const i = BORES.findIndex((b) => b >= Dmin);
      if (i < 1 || isTie(Dmin, 1) || BORES.some((b) => Math.abs(b - Dmin) < 0.1)) return null;
      const B = BORES[i];
      const pn = (W * 1000) / ((eff / 100) * 0.1 * circ(B));
      if (isTie(pn, 1)) return null;
      const lo = Math.max(0, i - 2);
      return { W, pb, eff, Dmin: rk(Dmin, 1), B, pn: rk(pn, 1), sizes: BORES.slice(lo, lo + 5) };
    });
    const { W, pb, eff, Dmin, B, pn, sizes } = v;
    return {
      prompt: `A press must push with **${W} kN**. The power unit supplies up to **${pb} bar**, and friction in the cylinder means only **${eff}%** of the pressure force reaches the load. Standard bores in the catalogue are ${sizes.join(", ")} mm. (${BAR}.)`,
      answerType: "multi",
      given: [{ label: "_force_kn", value: W }, { label: "_bar", value: pb }, { label: "_eff", value: eff }],
      parts: [
        partNum("dia", "Min bore", "Smallest bore that can do the job, in mm (1 decimal place)", Dmin, 0.05, `The piston must make ${W} kN ÷ ${eff / 100} before friction. Area = that force (in N) ÷ pressure (in N/mm²); then d = √(4A ÷ π).`),
        { id: "bore", label: "Bore", ask: "Which standard bore should be chosen?", answerType: "choice", answer: `${B} mm`, choices: rng.shuffle(sizes.map((x) => `${x} mm`)), hint: "Take the smallest catalogue bore at least as big as your minimum: a smaller one cannot reach the force." },
        partNum("pressure", "Pressure", "Pressure actually needed with that bore, in bar (1 decimal place)", pn, 0.05, "Work backwards with the chosen bore: pressure = (load ÷ efficiency) ÷ area, then N/mm² ÷ 0.1 for bar."),
      ],
      explanation: `Force needed before friction: ${W} / ${eff / 100} = ${num(W / (eff / 100))} kN. At ${pb} bar = ${num(pb * 0.1)} N/mm², the area is ${num((W * 1000) / (eff / 100))} / ${num(pb * 0.1)} = ${num((W * 1000) / ((eff / 100) * 0.1 * pb))} mm², so d = \`sqrt(4 * _force_kn * 1000 / (_eff / 100) / (_bar * 0.1) / pi)\` ≈ **${num(Dmin)} mm**.\n\nThe smallest catalogue bore at least that size is **${B} mm**.\n\nWith ${B} mm: area = ${num(circ(B))} mm², so p = ${num((W * 1000) / (eff / 100))} / ${num(circ(B))} = ${num(pn * 0.1)} N/mm² ≈ **${num(pn)} bar**, under the ${pb} bar available.`,
      params: { kind, W, pb, eff, Dmin, B, pn, sizes },
    };
  }
  const v = redraw(() => {
    const D = rng.pick([40, 50, 63, 80, 100]);
    const d = rng.pick(RODS.filter((r) => r >= 0.4 * D && r <= 0.7 * D));
    const Q = rng.int(4, 60), S = rng.pick([200, 250, 300, 400, 500, 600]);
    const flow = (Q * 1e6) / 60; // mm³/s
    const ve = flow / circ(D), vr = flow / (circ(D) - circ(d));
    if (ve < 10 || vr > 600 || isTie(ve, 1) || isTie(vr, 1)) return null;
    const T = S / ve + S / vr;
    if (isTie(T, 1) || rk(S / rk(ve, 1) + S / rk(vr, 1), 1) !== rk(T, 1)) return null;
    return { D, d, Q, S, ve: rk(ve, 1), vr: rk(vr, 1), T: rk(T, 1) };
  });
  const { D, d, Q, S, ve, vr, T } = v;
  return {
    prompt: `A pump delivers **${Q} L/min** of oil to a double-acting cylinder with a bore of **${D} mm**, a rod diameter of **${d} mm** and a stroke of **${S} mm**. Ignore leakage. (1 L = 1 000 000 mm³.)`,
    answerType: "multi",
    given: [{ label: "_flow_lmin", value: Q }, { label: "_bore", value: D }, { label: "_rod", value: d }, { label: "_stroke", value: S }],
    parts: [
      partNum("extend", "Extend", "Extending speed, in mm/s (1 decimal place)", ve, 0.05, "Speed = flow ÷ area. Convert L/min to mm³/s (× 1 000 000 ÷ 60); extending, the oil fills the full bore area."),
      partNum("retract", "Retract", "Retracting speed, in mm/s (1 decimal place)", vr, 0.05, "Retracting, the oil fills only the ring around the rod: π × (bore² − rod²) ÷ 4. A smaller area means a faster piston."),
      partNum("cycle", "Cycle", "Time for one full out-and-back cycle, in s (1 decimal place)", T, 0.05, "Time = stroke ÷ speed for each direction; add them."),
    ],
    explanation: `Flow = ${Q} × 1 000 000 / 60 = ${num((Q * 1e6) / 60)} mm³/s.\n\nExtend: area ${num(circ(D))} mm², so v = \`_flow_lmin * 1000000 / 60 / (pi * _bore^2 / 4)\` ≈ **${num(ve)} mm/s**.\n\nRetract: annulus ${num(circ(D) - circ(d))} mm², so v = \`_flow_lmin * 1000000 / 60 / (pi * (_bore^2 - _rod^2) / 4)\` ≈ **${num(vr)} mm/s**.\n\nCycle: ${S} / ${num(ve)} + ${S} / ${num(vr)} ≈ **${num(T)} s**.`,
    params: { kind, D, d, Q, S, ve, vr, T },
  };
}

function verifyHydraulics(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  const press = (bar) => bar / 10; // bar -> N/mm²
  switch (p.kind) {
    case "ma": return near(x * p.a1, p.a2, 1e-9);
    case "travel": return near((x / 10) * p.a2, p.s * p.a1, 1e-6);
    case "force-bar": return near((x * 1000) / (p.A / 1e4), p.pb * 1e5, 1e-3);
    case "bore-force": return brackets(x, 1, (F) => (F * 1000) / disc(p.D / 2) / 0.1, p.pb);
    case "pressure-needed": return brackets(x, 1, (b) => press(b) * disc(p.D / 2) / 1000, p.W);
    case "strokes": return Number.isInteger(x) && x * p.a1 * p.s >= p.a2 * p.h && (x - 1) * p.a1 * p.s < p.a2 * p.h;
    case "annulus": {
      const fe = toNum(ans.extend), fr = toNum(ans.retract);
      const eOk = brackets(fe, 1, (F) => (F * 1000) / disc(p.D / 2), press(p.pb));
      const rOk = brackets(fr, 1, (F) => (F * 1000) / (disc(p.D / 2) - disc(p.d / 2)), press(p.pb));
      return eOk && rOk;
    }
    case "lever": {
      const fp = toNum(ans.plunger), w = toNum(ans.load), n = toNum(ans.strokes);
      const fOk = near(fp * p.L2, p.E * p.L1, 1e-6);
      // Equal pressure: W / A_ram = F_plunger / A_plunger.
      const wOk = brackets(w, 1, (z) => (z * 1000) / disc(p.d2 / 2), (p.E * p.L1) / p.L2 / disc(p.d1 / 2));
      const vol = (k) => k * disc(p.d1 / 2) * p.s;
      const nOk = Number.isInteger(n) && vol(n) >= disc(p.d2 / 2) * p.h - 1e-9 && vol(n - 1) < disc(p.d2 / 2) * p.h;
      return fOk && wOk && nOk;
    }
    case "bore-size": {
      const dia = toNum(ans.dia), pn = toNum(ans.pressure);
      const force = (d, bar) => (p.eff / 100) * press(bar) * disc(d / 2); // N delivered to the load
      const dOk = brackets(dia, 1, (d) => force(d, p.pb), p.W * 1000);
      const sizes = p.sizes.slice().sort((a, b) => a - b);
      const B = toNum(String(ans.bore).replace(/ mm$/, ""));
      const i = sizes.indexOf(B);
      const ok = (d) => force(d, p.pb) >= p.W * 1000 - 1e-9;
      const bOk = i >= 0 && ok(B) && (i === 0 || !ok(sizes[i - 1]));
      const pOk = bOk && brackets(pn, 1, (bar) => force(B, bar), p.W * 1000);
      return dOk && bOk && pOk;
    }
    case "speed": {
      const ve = toNum(ans.extend), vr = toNum(ans.retract), T = toNum(ans.cycle);
      const lpm = (v, area) => (v * area * 60) / 1e6; // mm/s over an area in mm² -> L/min
      const Af = disc(p.D / 2), Ar = Af - disc(p.d / 2);
      const eOk = brackets(ve, 1, (v) => lpm(v, Af), p.Q);
      const rOk = brackets(vr, 1, (v) => lpm(v, Ar), p.Q);
      // Cycle time by volume: oil to fill each side ÷ flow.
      const t = ((Af + Ar) * p.S * 60) / (p.Q * 1e6);
      const tOk = exactDp(T, 1) && Math.abs(T - t) <= 0.05 + 1e-9;
      return eOk && rOk && tOk;
    }
    default: return false;
  }
}

// =====================================================================
// Pumps and power
// =====================================================================
const PUMP_USES = ["a borehole pump", "a building's booster pump", "a farm irrigation pump", "a sump pump", "a fountain pump", "a fire pump"];
const hydW = (QL, H) => 9.81 * QL * H; // generate side: ρ g Q H in W with Q in L/s (1 L of water = 1 kg)

function genPump(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["hyd", "pq", "eff"]);
    if (kind === "hyd") {
      const use = rng.pick(PUMP_USES);
      const v = redraw(() => {
        const Q = rk(0.005 * rng.int(1, 20), 3), H = rng.int(2, 40);
        const P = 9810 * Q * H;
        return !isTie(P, 0) ? { Q, H, P: rk(P, 0) } : null;
      });
      const { Q, H, P } = v;
      return {
        prompt: `${use[0].toUpperCase() + use.slice(1)} lifts **${num(Q)} m³/s** of water through a height (head) of **${H} m**. What is the hydraulic power given to the water, in W? ${G_TEXT} Round to the nearest watt.`,
        answerType: "number", answer: P, tolerance: 0.5,
        given: [{ label: "_flow_m3s", value: Q }, { label: "_head", value: H }],
        explanation: `Hydraulic power = ρ × g × Q × H = \`1000 * 9.81 * _flow_m3s * _head\` = 1000 × 9.81 × ${num(Q)} × ${H} ≈ **${P} W**.`,
        hints: ["Hydraulic power = density × g × flow rate × head (P = ρgQH).", "With ρ in kg/m³, Q in m³/s and H in m, the answer is in watts."],
        params: { kind, Q, H, P },
      };
    }
    if (kind === "pq") {
      const pk = 10 * rng.int(5, 50), QL = rng.int(1, 40);
      return {
        prompt: `A pump raises the pressure of water by **${pk} kPa** while delivering **${QL} L/s**. What hydraulic power does it give the water, in W? (Power = pressure rise × flow rate; kPa × L/s gives W.)`,
        answerType: "number", answer: pk * QL, tolerance: 0,
        given: [{ label: "_kpa", value: pk }, { label: "_flow_ls", value: QL }],
        explanation: `P = p × Q = \`_kpa * _flow_ls\` = ${pk} × ${QL} = **${pk * QL} W**. (1000 Pa × 0.001 m³/s = 1 W.)`,
        hints: ["Hydraulic power = pressure rise × flow rate.", "kPa × L/s is already in watts: the 1000s cancel."],
        params: { kind, pk, QL },
      };
    }
    const Pin = 100 * rng.int(5, 60), eff = 5 * rng.int(8, 18);
    const Pout = (Pin * eff) / 100;
    return {
      prompt: `A pump's electric motor takes in **${Pin} W**, and the pump gives **${Pout} W** of hydraulic power to the water. What is the efficiency of the pump set, in %?`,
      answerType: "number", answer: eff, tolerance: 0,
      given: [{ label: "_p_out", value: Pout }, { label: "_p_in", value: Pin }],
      explanation: `Efficiency = useful power out ÷ power in × 100 = \`_p_out / _p_in * 100\` = **${eff}%**.`,
      hints: ["Efficiency = useful output power ÷ input power.", "Multiply by 100 for a percentage."],
      params: { kind, Pin, Pout, eff },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["kw", "input", "pq-bar"]);
    if (kind === "kw") {
      const use = rng.pick(PUMP_USES);
      const v = redraw(() => {
        const QL = rng.int(2, 80), H = rng.int(5, 60);
        const P = hydW(QL, H) / 1000;
        return !isTie(P, 2) ? { QL, H, P: rk(P, 2) } : null;
      });
      const { QL, H, P } = v;
      return {
        prompt: `${use[0].toUpperCase() + use.slice(1)} delivers **${QL} L/s** of water against a head of **${H} m**. What is the hydraulic power, in kW? ${G_TEXT} (1 m³ = 1000 L.) Round to 2 decimal places.`,
        answerType: "number", answer: P, tolerance: 0.005,
        given: [{ label: "_flow_ls", value: QL }, { label: "_head", value: H }],
        explanation: `Q = ${QL} L/s = ${num(QL / 1000)} m³/s. P = ρgQH = 1000 × 9.81 × ${num(QL / 1000)} × ${H} = ${num(hydW(QL, H))} W, so \`9.81 * _flow_ls * _head / 1000\` ≈ **${num(P)} kW**.`,
        hints: ["Convert the flow to m³/s first (÷ 1000).", "P = ρ × g × Q × H gives watts; ÷ 1000 for kW."],
        params: { kind, QL, H, P },
      };
    }
    if (kind === "input") {
      const v = redraw(() => {
        const Ph = rk(0.1 * rng.int(10, 300), 1), eff = 5 * rng.int(11, 18);
        const Pin = Ph / (eff / 100);
        return !isTie(Pin, 2) ? { Ph, eff, Pin: rk(Pin, 2) } : null;
      });
      const { Ph, eff, Pin } = v;
      return {
        prompt: `A pump must give **${num(Ph)} kW** of hydraulic power to the water. The pump is **${eff}%** efficient. What shaft power must its motor supply, in kW? Round to 2 decimal places.`,
        answerType: "number", answer: Pin, tolerance: 0.005,
        given: [{ label: "_p_hyd", value: Ph }, { label: "_eff", value: eff }],
        explanation: `Efficiency = output ÷ input, so input = output ÷ efficiency = \`_p_hyd / (_eff / 100)\` = ${num(Ph)} / ${num(eff / 100)} ≈ **${num(Pin)} kW**.`,
        hints: ["Efficiency = output ÷ input, so input = output ÷ efficiency.", "Write the efficiency as a decimal first. The input must come out bigger than the output."],
        params: { kind, Ph, eff, Pin },
      };
    }
    const v = redraw(() => {
      const pb = rng.pick([20, 40, 60, 80, 100, 120, 150, 180, 200, 250]), Qm = rng.int(5, 120);
      const P = (pb * Qm) / 600;
      return P >= 0.1 && !isTie(P, 2) ? { pb, Qm, P: rk(P, 2) } : null;
    });
    const { pb, Qm, P } = v;
    return {
      prompt: `A hydraulic power pack's pump delivers **${Qm} L/min** of oil at **${pb} bar**. What hydraulic power is that, in kW? (Power = pressure × flow rate; 1 bar = 100 000 Pa, 1 L = 0.001 m³.) Round to 2 decimal places.`,
      answerType: "number", answer: P, tolerance: 0.005,
      given: [{ label: "_bar", value: pb }, { label: "_flow_lmin", value: Qm }],
      explanation: `p = ${pb} × 100 000 = ${pb * 1e5} Pa. Q = ${Qm} / 60 / 1000 = ${fmtNum(Qm / 60000, 7)} m³/s. P = p × Q = \`_bar * 100000 * _flow_lmin / 60000 / 1000\` ≈ **${num(P)} kW**.`,
      hints: ["Put the pressure in Pa and the flow in m³/s: L/min ÷ 60 ÷ 1000.", "P = p × Q gives watts; ÷ 1000 for kW."],
      params: { kind, pb, Qm, P },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["chain", "overall"]);
    if (kind === "chain") {
      const use = rng.pick(PUMP_USES);
      const v = redraw(() => {
        const QL = rng.int(5, 60), H = rng.int(10, 80), eff = 5 * rng.int(12, 17), hrs = rng.pick([4, 6, 8, 10, 12, 24]);
        const price = rk(0.01 * rng.int(10, 40), 2);
        const Ph = hydW(QL, H) / 1000, Pin = Ph / (eff / 100), cost = Pin * hrs * price;
        if (isTie(Ph, 2) || isTie(Pin, 2) || isTie(cost, 2)) return null;
        if (rk(rk(Ph, 2) / (eff / 100), 2) !== rk(Pin, 2)) return null;
        if (rk(rk(Pin, 2) * hrs * price, 2) !== rk(cost, 2)) return null;
        return { QL, H, eff, hrs, price, Ph: rk(Ph, 2), Pin: rk(Pin, 2), cost: rk(cost, 2) };
      });
      const { QL, H, eff, hrs, price, Ph, Pin, cost } = v;
      return {
        prompt: `${use[0].toUpperCase() + use.slice(1)} delivers **${QL} L/s** of water against a head of **${H} m**. The pump is **${eff}%** efficient, and its motor runs for **${hrs} hours** a day on electricity costing **${money(price)} per kWh**. ${G_TEXT} (1 m³ = 1000 L.) Ignore motor losses.`,
        answerType: "multi",
        given: [{ label: "_flow_ls", value: QL }, { label: "_head", value: H }, { label: "_eff", value: eff }, { label: "_hours", value: hrs }, { label: "_price", value: price }],
        parts: [
          partNum("hyd", "Hydraulic", "Hydraulic power, in kW (2 decimal places)", Ph, 0.005, "P = ρ × g × Q × H, with Q in m³/s; ÷ 1000 for kW."),
          partNum("input", "Input", "Power the pump takes in, in kW (2 decimal places)", Pin, 0.005, "Input = hydraulic power ÷ efficiency (as a decimal)."),
          partNum("cost", "Daily cost", "Electricity cost per day, in $ (2 decimal places)", cost, 0.005, "Energy in kWh = input power in kW × hours. Then × the price per kWh."),
        ],
        explanation: `Hydraulic power: \`9.81 * _flow_ls * _head / 1000\` = 9.81 × ${QL} × ${H} / 1000 ≈ **${num(Ph)} kW**.\n\nInput: ${num(Ph)} / ${num(eff / 100)} ≈ **${num(Pin)} kW**.\n\nCost: ${num(Pin)} kW × ${hrs} h = ${num(Pin * hrs)} kWh, × ${money(price)} ≈ **${money(cost)}** per day.`,
        params: { kind, QL, H, eff, hrs, price, Ph, Pin, cost },
      };
    }
    const v = redraw(() => {
      const Pe = rk(0.5 * rng.int(4, 60), 1), em = rng.pick([85, 88, 90, 92, 95]), ep = 5 * rng.int(11, 17);
      const ov = (em * ep) / 100, Ph = (Pe * ov) / 100;
      if (isTie(ov, 1) || isTie(Ph, 2)) return null;
      if (rk((Pe * rk(ov, 1)) / 100, 2) !== rk(Ph, 2)) return null;
      return { Pe, em, ep, ov: rk(ov, 1), Ph: rk(Ph, 2) };
    });
    const { Pe, em, ep, ov, Ph } = v;
    return {
      prompt: `A pump set takes **${num(Pe)} kW** of electrical power. The motor is **${em}%** efficient and the pump is **${ep}%** efficient.`,
      answerType: "multi",
      given: [{ label: "_p_elec", value: Pe }, { label: "_eff_motor", value: em }, { label: "_eff_pump", value: ep }],
      parts: [
        partNum("overall", "Overall", "Overall efficiency of the pump set, in % (1 decimal place)", ov, 0.05, "The pump only gets what the motor passes on: multiply the two efficiencies as decimals."),
        partNum("hyd", "Hydraulic", "Hydraulic power delivered to the water, in kW (2 decimal places)", Ph, 0.005, "Output = electrical input × overall efficiency (as a decimal)."),
      ],
      explanation: `Overall efficiency = \`_eff_motor / 100 * _eff_pump / 100 * 100\` = ${num(em / 100)} × ${num(ep / 100)} × 100 ≈ **${num(ov)}%**.\n\nHydraulic power = ${num(Pe)} × ${num((em * ep) / 10000)} ≈ **${num(Ph)} kW**. (Motor shaft: ${num((Pe * em) / 100)} kW, then the pump keeps ${ep}% of that.)`,
      params: { kind, Pe, em, ep, ov, Ph },
    };
  }

  // expert: work back from a motor rating, or compare two pumps' running costs
  const kind = rng.pick(["max-flow", "compare"]);
  if (kind === "max-flow") {
    const v = redraw(() => {
      const Pm = rng.pick([1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15]), eff = 5 * rng.int(11, 17), H = rng.int(10, 60), V = 10 * rng.int(2, 30);
      const Ph = (Pm * eff) / 100, Q = (Ph * 1000) / (9.81 * H), t = (V * 1000) / Q / 60;
      if (isTie(Ph, 2) || isTie(Q, 1) || isTie(t, 1) || t > 600) return null;
      const Qr = rk((rk(Ph, 2) * 1000) / (9.81 * H), 1);
      if (Qr !== rk(Q, 1) || rk((V * 1000) / Qr / 60, 1) !== rk(t, 1)) return null;
      return { Pm, eff, H, V, Ph: rk(Ph, 2), Q: rk(Q, 1), t: rk(t, 1) };
    });
    const { Pm, eff, H, V, Ph, Q, t } = v;
    return {
      prompt: `A **${num(Pm)} kW** motor drives a pump that is **${eff}%** efficient. The pump lifts water from a well through a head of **${H} m** into a **${V} m³** storage tank. The motor works at its full rating. ${G_TEXT} (1 m³ = 1000 L.)`,
      answerType: "multi",
      given: [{ label: "_p_motor", value: Pm }, { label: "_eff", value: eff }, { label: "_head", value: H }, { label: "_volume", value: V }],
      parts: [
        partNum("hyd", "Hydraulic", "Hydraulic power available, in kW (2 decimal places)", Ph, 0.005, "Hydraulic power = motor power × pump efficiency (as a decimal)."),
        partNum("flow", "Flow rate", "Largest flow rate the pump can give, in L/s (1 decimal place)", Q, 0.05, "Rearrange P = ρgQH for Q, with P in W. Q comes out in m³/s; × 1000 for L/s."),
        partNum("time", "Time", "Time to fill the tank at that flow, in minutes (1 decimal place)", t, 0.05, "Volume in litres ÷ flow in L/s gives seconds; ÷ 60 for minutes."),
      ],
      explanation: `Hydraulic power: ${num(Pm)} × ${num(eff / 100)} ≈ **${num(Ph)} kW**.\n\nFlow: Q = P ÷ (ρgH) = \`_p_motor * _eff / 100 * 1000 / (1000 * 9.81 * _head) * 1000\` ≈ **${num(Q)} L/s**.\n\nTime: ${V} m³ = ${V * 1000} L, and ${V * 1000} / ${num(Q)} / 60 ≈ **${num(t)} min**.`,
      params: { kind, Pm, eff, H, V, Ph, Q, t },
    };
  }
  const v = redraw(() => {
    const QL = rng.int(5, 50), H = rng.int(10, 60), eA = 5 * rng.int(11, 14), eB = eA + 5 * rng.int(1, 4);
    const hours = rng.pick([1000, 2000, 3000, 4000, 6000, 8000]), price = rk(0.01 * rng.int(10, 35), 2), extra = 100 * rng.int(3, 60);
    const Ph = hydW(QL, H) / 1000, PA = Ph / (eA / 100), PB = Ph / (eB / 100);
    const save = (PA - PB) * hours * price, pay = extra / save;
    if (save < 50 || pay < 0.3 || pay > 15 || isTie(PA, 2) || isTie(PB, 2) || isTie(save, 0) || isTie(pay, 1)) return null;
    // Worked from rounded input powers, and from the rounded saving, the answers must not change.
    if (rk((rk(PA, 2) - rk(PB, 2)) * hours * price, 0) !== rk(save, 0)) return null;
    if (rk(extra / rk(save, 0), 1) !== rk(pay, 1)) return null;
    return { QL, H, eA, eB, hours, price, extra, PA: rk(PA, 2), save: rk(save, 0), pay: rk(pay, 1) };
  });
  const { QL, H, eA, eB, hours, price, extra, PA, save, pay } = v;
  return {
    prompt: `A pump must deliver **${QL} L/s** against a head of **${H} m** for **${hours} hours** a year. Pump A is **${eA}%** efficient. Pump B is **${eB}%** efficient but costs **$${extra}** more to buy. Electricity costs **${money(price)} per kWh**. ${G_TEXT} (1 m³ = 1000 L.) Ignore motor losses.`,
    answerType: "multi",
    given: [{ label: "_flow_ls", value: QL }, { label: "_head", value: H }, { label: "_eff_a", value: eA }, { label: "_eff_b", value: eB }, { label: "_hours", value: hours }, { label: "_price", value: price }, { label: "_extra", value: extra }],
    parts: [
      partNum("input", "Pump A", "Input power of pump A, in kW (2 decimal places)", PA, 0.005, "Find the hydraulic power ρgQH first; both pumps give the water the same. Input = hydraulic power ÷ efficiency."),
      partNum("saving", "Saving", "Yearly electricity saving with pump B, in $ (to the nearest dollar)", save, 0.5, "Find pump B's input power the same way. Saving = (A's input − B's input) × hours × price."),
      partNum("payback", "Payback", "Payback time for pump B's extra price, in years (1 decimal place)", pay, 0.05, "Payback = extra purchase cost ÷ yearly saving."),
    ],
    explanation: `Hydraulic power: \`9.81 * _flow_ls * _head / 1000\` = ${num(hydKW(QL, H))} kW for both pumps.\n\nPump A: ${num(hydKW(QL, H))} / ${num(eA / 100)} ≈ **${num(PA)} kW**. Pump B: ${num(hydKW(QL, H))} / ${num(eB / 100)} ≈ ${num(hydKW(QL, H) / (eB / 100))} kW.\n\nSaving: (${num(hydKW(QL, H) / (eA / 100))} − ${num(hydKW(QL, H) / (eB / 100))}) × ${hours} × ${money(price)} ≈ **$${save}** a year.\n\nPayback: ${extra} / ${save} ≈ **${num(pay)} years**.`,
    params: { kind, QL, H, eA, eB, hours, price, extra, PA, save, pay },
  };
}
const hydKW = (QL, H) => hydW(QL, H) / 1000;

function verifyPump(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  // Hydraulic power from the head by a separate route: weight of water lifted per second × height.
  const liftW = (QL, H) => QL * 9.81 * H; // (QL kg/s × 9.81 N/kg) N/s × m
  switch (p.kind) {
    case "hyd": return Number.isInteger(x) && brackets(x, 0, (P) => P / (1000 * 9.81 * p.Q), p.H);
    case "pq": return near(x / p.QL, p.pk, 1e-9);
    case "eff": return near((x / 100) * p.Pin, p.Pout, 1e-9);
    case "kw": return brackets(x, 2, (P) => (P * 1000) / (9.81 * p.QL), p.H);
    case "input": return brackets(x, 2, (P) => P * (p.eff / 100), p.Ph);
    case "pq-bar": return brackets(x, 2, (P) => (P * 1000) / ((p.Qm / 60000) * 1e5), p.pb);
    case "chain": {
      const h = toNum(ans.hyd), i = toNum(ans.input), c = toNum(ans.cost);
      const ex = liftW(p.QL, p.H) / 1000;
      const hOk = brackets(h, 2, (z) => z, ex);
      const iOk = brackets(i, 2, (z) => z * (p.eff / 100), ex);
      const cOk = brackets(c, 2, (z) => z / (p.hrs * p.price), ex / (p.eff / 100));
      return hOk && iOk && cOk;
    }
    case "overall": {
      const o = toNum(ans.overall), h = toNum(ans.hyd);
      const oOk = brackets(o, 1, (z) => z, p.em * p.ep / 100);
      // Step by step: motor shaft power, then the pump's share.
      const hOk = brackets(h, 2, (z) => z, ((p.Pe * p.em) / 100) * (p.ep / 100));
      return oOk && hOk;
    }
    case "max-flow": {
      const h = toNum(ans.hyd), Q = toNum(ans.flow), t = toNum(ans.time);
      const P = p.Pm * (p.eff / 100);
      const hOk = brackets(h, 2, (z) => z, P);
      const qOk = brackets(Q, 1, (z) => liftW(z, p.H) / 1000, P);
      const tOk = brackets(t, 1, (z) => z * 60 * ((P * 1000) / liftW(1, p.H)), p.V * 1000);
      return hOk && qOk && tOk;
    }
    case "compare": {
      const a = toNum(ans.input), s = toNum(ans.saving), y = toNum(ans.payback);
      const W = liftW(p.QL, p.H) / 1000;
      const aOk = brackets(a, 2, (z) => z * (p.eA / 100), W);
      // Energy route: yearly hydraulic energy × (1/ηA − 1/ηB) × price.
      const sv = W * p.hours * (100 / p.eA - 100 / p.eB) * p.price;
      const sOk = Number.isInteger(s) && Math.abs(s - sv) <= 0.5 + 1e-9;
      const yOk = brackets(y, 1, (z) => z * sv, p.extra);
      return aOk && sOk && yOk;
    }
    default: return false;
  }
}

// =====================================================================
// Tanks: filling and draining
// =====================================================================
const TANK_USES = ["rainwater tank", "header tank", "fish tank", "water storage tank", "cattle trough", "fire-fighting tank"];

function genTanks(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["box", "fill", "depth"]);
    if (kind === "box") {
      const use = rng.pick(TANK_USES);
      const L = 0.5 * rng.int(2, 8), W = 0.5 * rng.int(1, 6), H = 0.5 * rng.int(1, 4);
      const V = rk(L * W * H * 1000, 0);
      return {
        prompt: `A box-shaped ${use} is **${num(L)} m** long, **${num(W)} m** wide and **${num(H)} m** deep inside. How many litres does it hold when full? (1 m³ = 1000 L.)`,
        answerType: "number", answer: V, tolerance: 0,
        given: [{ label: "_length", value: L }, { label: "_width", value: W }, { label: "_depth", value: H }],
        explanation: `Volume = length × width × depth = ${num(L * W * H)} m³, and \`_length * _width * _depth * 1000\` = **${V} L**.`,
        hints: ["Volume of a box = length × width × depth.", "That gives m³; each m³ holds 1000 litres."],
        params: { kind, L, W, H, V },
      };
    }
    if (kind === "fill") {
      const use = rng.pick(TANK_USES);
      const Q = rng.int(5, 60), t = rng.int(5, 90), V = Q * t;
      return {
        prompt: `A **${V} L** ${use} is filled from empty by a hose delivering **${Q} L/min**. How many minutes does it take to fill?`,
        answerType: "number", answer: t, tolerance: 0,
        given: [{ label: "_volume", value: V }, { label: "_flow_lmin", value: Q }],
        explanation: `Time = volume ÷ flow rate = \`_volume / _flow_lmin\` = ${V} / ${Q} = **${t} min**.`,
        hints: ["Time = volume ÷ flow rate.", "Litres ÷ litres per minute gives minutes."],
        params: { kind, Q, t, V },
      };
    }
    const L = 0.5 * rng.int(2, 6), W = 0.5 * rng.int(2, 4), h = rng.int(5, 90);
    const V = rk(L * W * h * 10, 1);
    return {
      prompt: `A box-shaped tank has a base **${num(L)} m** by **${num(W)} m**. It holds **${num(V)} L** of water. How deep is the water, in cm? (1 m³ = 1000 L.)`,
      answerType: "number", answer: h, tolerance: 0,
      given: [{ label: "_length", value: L }, { label: "_width", value: W }, { label: "_volume", value: V }],
      explanation: `Volume = ${num(V)} / 1000 = ${num(V / 1000)} m³. Depth = volume ÷ base area = \`_volume / 1000 / (_length * _width) * 100\` = ${num(h / 100)} m = **${h} cm**.`,
      hints: ["Convert litres to m³ (÷ 1000).", "Depth = volume ÷ base area gives metres; × 100 for cm."],
      params: { kind, L, W, V, h },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["cyl", "net"]);
    if (kind === "cyl") {
      const use = rng.pick(TANK_USES);
      const v = redraw(() => {
        const D = rng.pick([0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3]), H = rk(0.1 * rng.int(5, 30), 1);
        const V = circ(D) * H * 1000;
        return !isTie(V, 0) ? { D, H, V: rk(V, 0) } : null;
      });
      const { D, H, V } = v;
      return {
        prompt: `A round ${use} has an internal diameter of **${num(D)} m** and holds water to a depth of **${num(H)} m**. How many litres of water does it hold? (1 m³ = 1000 L.) Round to the nearest litre.`,
        answerType: "number", answer: V, tolerance: 0.5,
        given: [{ label: "_d", value: D }, { label: "_depth", value: H }],
        explanation: `Base area = π × ${num(D)}² ÷ 4 = ${num(circ(D))} m². Volume = area × depth = \`pi * _d^2 / 4 * _depth * 1000\` ≈ **${V} L**.`,
        hints: ["Volume of a cylinder = base area × height, with base area = π × d² ÷ 4 (or π × r²).", "m³ × 1000 gives litres."],
        params: { kind, D, H, V },
      };
    }
    const use = rng.pick(TANK_USES);
    const v = redraw(() => {
      const V = 100 * rng.int(5, 100), Qin = rng.int(20, 80), Qout = rng.int(5, 60);
      if (Qout > Qin - 5) return null;
      const t = V / (Qin - Qout);
      return !isTie(t, 1) && t <= 600 ? { V, Qin, Qout, t: rk(t, 1) } : null;
    });
    const { V, Qin, Qout, t } = v;
    return {
      prompt: `A **${V} L** ${use} starts empty. It is filled at **${Qin} L/min**, but a leaking valve lets **${Qout} L/min** out at the same time. How long does it take to fill, in minutes? Round to 1 decimal place.`,
      answerType: "number", answer: t, tolerance: 0.05,
      given: [{ label: "_volume", value: V }, { label: "_q_in", value: Qin }, { label: "_q_out", value: Qout }],
      explanation: `Net filling rate = ${Qin} − ${Qout} = ${Qin - Qout} L/min. Time = \`_volume / (_q_in - _q_out)\` = ${V} / ${Qin - Qout} ≈ **${num(t)} min**.`,
      hints: ["Find the net rate: what comes in minus what leaks out.", "Time = volume ÷ net rate."],
      params: { kind, V, Qin, Qout, t },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["rise", "updown"]);
    if (kind === "rise") {
      const v = redraw(() => {
        const L = 0.5 * rng.int(2, 8), W = 0.5 * rng.int(2, 6), Qin = rk(0.5 * rng.int(2, 30), 1), Qout = rk(0.5 * rng.int(0, 20), 1);
        if (Qout >= Qin - 0.5) return null;
        const h1 = 10 * rng.int(1, 8), h2 = h1 + 10 * rng.int(2, 10);
        const rate = (6 * (Qin - Qout)) / (L * W); // cm/min
        const t = (h2 - h1) / rate;
        if (rate < 0.2 || isTie(rate, 2) || isTie(t, 1) || t > 600) return null;
        if (rk((h2 - h1) / rk(rate, 2), 1) !== rk(t, 1)) return null;
        return { L, W, Qin, Qout, h1, h2, rate: rk(rate, 2), t: rk(t, 1) };
      });
      const { L, W, Qin, Qout, h1, h2, rate, t } = v;
      return {
        prompt: `A box-shaped tank has a base **${num(L)} m** by **${num(W)} m**. Water flows in at **${num(Qin)} L/s** while **${num(Qout)} L/s** is drawn off. The water is now **${h1} cm** deep. (1 m³ = 1000 L.)`,
        answerType: "multi",
        given: [{ label: "_length", value: L }, { label: "_width", value: W }, { label: "_q_in", value: Qin }, { label: "_q_out", value: Qout }, { label: "_h1", value: h1 }, { label: "_h2", value: h2 }],
        parts: [
          partNum("rate", "Rise rate", "Rate at which the level rises, in cm/min (2 decimal places)", rate, 0.005, "Net flow in m³/s ÷ base area gives the rise in m/s. Then × 100 for cm and × 60 for per minute."),
          partNum("time", "Time", `Time for the level to reach ${h2} cm, in minutes (1 decimal place)`, t, 0.05, "Time = the rise still needed ÷ the rate of rise."),
        ],
        explanation: `Net flow = ${num(Qin)} − ${num(Qout)} = ${num(Qin - Qout)} L/s = ${num((Qin - Qout) / 1000)} m³/s. Base area = ${num(L * W)} m². Rise rate = \`(_q_in - _q_out) / 1000 / (_length * _width) * 100 * 60\` ≈ **${num(rate)} cm/min**.\n\nTime: (${h2} − ${h1}) / ${num(rate)} ≈ **${num(t)} min**.`,
        params: { kind, L, W, Qin, Qout, h1, h2, rate, t },
      };
    }
    const v = redraw(() => {
      const D = rng.pick([0.8, 1, 1.2, 1.5, 2, 2.5]), Qin = 5 * rng.int(2, 30), Qout = 5 * rng.int(2, 30), tm = rng.int(5, 60);
      if (Qin === Qout) return null;
      const dh = (Math.abs(Qin - Qout) * tm) / 1000 / circ(D) * 100; // cm
      return dh >= 0.5 && dh <= 150 && !isTie(dh, 1) ? { D, Qin, Qout, tm, dh: rk(dh, 1) } : null;
    });
    const { D, Qin, Qout, tm, dh } = v;
    const dir = Qin > Qout ? "Rises" : "Falls";
    return {
      prompt: `A round tank has an internal diameter of **${num(D)} m**. Water flows in at **${Qin} L/min** and out at **${Qout} L/min**, both steady, for **${tm} minutes**. The tank neither overflows nor runs dry. (1 m³ = 1000 L.)`,
      answerType: "multi",
      given: [{ label: "_d", value: D }, { label: "_q_in", value: Qin }, { label: "_q_out", value: Qout }, { label: "_minutes", value: tm }],
      parts: [
        { id: "dir", label: "Level", ask: "What happens to the water level?", answerType: "choice", answer: dir, choices: rng.shuffle(["Rises", "Falls", "Stays the same"]), hint: "Compare the flow in with the flow out." },
        partNum("change", "Change", "By how much does the level change, in cm (1 decimal place)?", dh, 0.05, "Volume gained or lost = the difference in flows × time. Divide by the base area (π × d² ÷ 4) for the change in depth."),
      ],
      explanation: `Net flow = ${Qin} − ${Qout} = ${Qin - Qout} L/min, so the level **${dir.toLowerCase()}**. Volume change = ${Math.abs(Qin - Qout)} × ${tm} = ${Math.abs(Qin - Qout) * tm} L = ${num((Math.abs(Qin - Qout) * tm) / 1000)} m³. Base area = π × ${num(D)}² ÷ 4 = ${num(circ(D))} m². Change = \`abs(_q_in - _q_out) * _minutes / 1000 / (pi * _d^2 / 4) * 100\` ≈ **${num(dh)} cm**.`,
      params: { kind, D, Qin, Qout, tm, dh },
    };
  }

  // expert: size the pump flow for a fill deadline, or work back to the inflow that delays a low-level alarm
  const kind = rng.pick(["pump-fill", "alarm"]);
  if (kind === "pump-fill") {
    const v = redraw(() => {
      const D = rng.pick([1.5, 2, 2.5, 3, 4, 5]), h1 = rk(0.1 * rng.int(2, 15), 1), h2 = rk(h1 + 0.1 * rng.int(5, 25), 1);
      const T = rng.pick([20, 30, 40, 45, 60, 90, 120]), Qout = rk(0.5 * rng.int(0, 10), 1), H = rng.int(5, 30);
      const V = circ(D) * (h2 - h1), Q = (V * 1000) / (T * 60) + Qout, P = hydW(Q, H) / 1000;
      if (isTie(V, 2) || isTie(Q, 2) || isTie(P, 2)) return null;
      const Qr = rk((rk(V, 2) * 1000) / (T * 60) + Qout, 2);
      if (Qr !== rk(Q, 2) || rk(hydW(Qr, H) / 1000, 2) !== rk(P, 2)) return null;
      return { D, h1, h2, T, Qout, H, V: rk(V, 2), Q: rk(Q, 2), P: rk(P, 2) };
    });
    const { D, h1, h2, T, Qout, H, V, Q, P } = v;
    const draw = Qout > 0 ? `, while the building keeps drawing off **${num(Qout)} L/s**` : ", with nothing drawn off meanwhile";
    return {
      prompt: `A round water tank has an internal diameter of **${num(D)} m**. Its level must be raised from **${num(h1)} m** to **${num(h2)} m** in **${T} minutes**${draw}. The filling pump lifts water through a head of **${H} m**. ${G_TEXT} (1 m³ = 1000 L.)`,
      answerType: "multi",
      given: [{ label: "_d", value: D }, { label: "_h1", value: h1 }, { label: "_h2", value: h2 }, { label: "_minutes", value: T }, { label: "_q_out", value: Qout }, { label: "_head", value: H }],
      parts: [
        partNum("volume", "Volume", "Volume of water to add, in m³ (2 decimal places)", V, 0.005, "Base area (π × d² ÷ 4) × the rise in level."),
        partNum("flow", "Pump flow", "Pump flow rate needed, in L/s (2 decimal places)", Q, 0.005, "Litres to add ÷ seconds available, plus whatever is drawn off at the same time."),
        partNum("power", "Power", "Hydraulic power of the pump, in kW (2 decimal places)", P, 0.005, "P = ρ × g × Q × H with Q in m³/s; ÷ 1000 for kW."),
      ],
      explanation: `Volume: π × ${num(D)}² ÷ 4 × (${num(h2)} − ${num(h1)}) = \`pi * _d^2 / 4 * (_h2 - _h1)\` ≈ **${num(V)} m³**.\n\nFlow: ${num(V * 1000)} L in ${T * 60} s is ${num((V * 1000) / (T * 60))} L/s, plus ${num(Qout)} L/s drawn off ≈ **${num(Q)} L/s**.\n\nPower: 9.81 × ${num(Q)} × ${H} / 1000 ≈ **${num(P)} kW**.`,
      params: { kind, D, h1, h2, T, Qout, H, V, Q, P },
    };
  }
  const v = redraw(() => {
    const L = rng.int(2, 6), W = rng.int(2, 5), h0 = rk(0.1 * rng.int(15, 30), 1), hmin = rk(0.1 * rng.int(3, 10), 1);
    const Qout = rk(0.5 * rng.int(8, 40), 1), Qin = rk(0.5 * rng.int(0, 10), 1);
    if (Qin >= Qout - 2) return null;
    const rate = (6 * (Qout - Qin)) / (L * W); // cm/min
    const t = ((h0 - hmin) * 100) / rate;
    const T2 = rk(t * rng.pick([1.5, 2, 2.5, 3]), 0);
    const need = Qout - ((h0 - hmin) * L * W * 1000) / (T2 * 60);
    if (rate < 0.2 || t > 600 || isTie(rate, 2) || isTie(t, 1) || isTie(need, 2) || need <= Qin + 0.1) return null;
    if (rk(((h0 - hmin) * 100) / rk(rate, 2), 1) !== rk(t, 1)) return null;
    return { L, W, h0, hmin, Qout, Qin, rate: rk(rate, 2), t: rk(t, 1), T2, need: rk(need, 2) };
  });
  const { L, W, h0, hmin, Qout, Qin, rate, t, T2, need } = v;
  const inText = Qin > 0 ? `while a supply pipe tops it up at only **${num(Qin)} L/s**` : "and the supply is shut off";
  return {
    prompt: `A box-shaped tank has a base **${L} m** by **${W} m** and is filled to **${num(h0)} m**. A demand draws **${num(Qout)} L/s** from it, ${inText}. A low-level alarm sounds when the water falls to **${num(hmin)} m**. (1 m³ = 1000 L.)`,
    answerType: "multi",
    given: [{ label: "_length", value: L }, { label: "_width", value: W }, { label: "_h0", value: h0 }, { label: "_h_alarm", value: hmin }, { label: "_q_out", value: Qout }, { label: "_q_in", value: Qin }, { label: "_t_target", value: T2 }],
    parts: [
      partNum("rate", "Fall rate", "Rate at which the level falls, in cm/min (2 decimal places)", rate, 0.005, "Net flow out in m³/s ÷ base area gives m/s; × 100 × 60 for cm/min."),
      partNum("time", "Alarm", "Time until the alarm sounds, in minutes (1 decimal place)", t, 0.05, "The level has to fall from the start depth to the alarm depth: drop ÷ rate of fall."),
      partNum("inflow", "Inflow", `Supply flow needed so the alarm sounds no sooner than ${T2} minutes, in L/s (2 decimal places)`, need, 0.005, `Work backwards: the volume between the two levels may drain over ${T2} minutes, so the net outflow is at most that volume ÷ the time. The supply must make up the rest of the demand.`),
    ],
    explanation: `Net outflow = ${num(Qout)} − ${num(Qin)} = ${num(Qout - Qin)} L/s. Base area = ${L * W} m². Fall rate = \`(_q_out - _q_in) / 1000 / (_length * _width) * 100 * 60\` ≈ **${num(rate)} cm/min**.\n\nAlarm: the level falls ${num((h0 - hmin) * 100)} cm, so t = ${num((h0 - hmin) * 100)} / ${num(rate)} ≈ **${num(t)} min**.\n\nBackwards: the ${num((h0 - hmin) * L * W)} m³ between the levels may drain over ${T2} × 60 = ${T2 * 60} s, a net outflow of ${num(((h0 - hmin) * L * W * 1000) / (T2 * 60))} L/s. Supply = ${num(Qout)} − that = \`_q_out - (_h0 - _h_alarm) * _length * _width * 1000 / (_t_target * 60)\` ≈ **${num(need)} L/s**.`,
    params: { kind, L, W, h0, hmin, Qout, Qin, rate, t, T2, need },
  };
}

function verifyTanks(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "box": return near(x / 1000 / (p.L * p.W), p.H, 1e-9);
    case "fill": return near(x * p.Q, p.V, 1e-9);
    case "depth": return near((x / 100) * p.L * p.W * 1000, p.V, 1e-6);
    case "cyl": return Number.isInteger(x) && brackets(x, 0, (V) => V / 1000 / disc(p.D / 2), p.H);
    case "net": return brackets(x, 1, (t) => t * (p.Qin - p.Qout), p.V);
    case "rise": {
      const r = toNum(ans.rate), t = toNum(ans.time);
      const A = p.L * p.W;
      // Level rise in cm/min -> volume per second in L.
      const rOk = brackets(r, 2, (z) => ((z / 100) * A * 1000) / 60, p.Qin - p.Qout);
      const tOk = brackets(t, 1, (z) => ((((p.Qin - p.Qout) * z * 60) / 1000 / A) * 100), p.h2 - p.h1);
      return rOk && tOk;
    }
    case "updown": {
      const want = p.Qin > p.Qout ? "Rises" : "Falls";
      const c = toNum(ans.change);
      const cOk = brackets(c, 1, (z) => ((z / 100) * disc(p.D / 2) * 1000) / p.tm, Math.abs(p.Qin - p.Qout));
      return ans.dir === want && cOk;
    }
    case "pump-fill": {
      const V = toNum(ans.volume), Q = toNum(ans.flow), P = toNum(ans.power);
      const vx = disc(p.D / 2) * (p.h2 - p.h1);
      const vOk = brackets(V, 2, (z) => z, vx);
      // Flow: over T minutes, (Q − draw-off) fills the volume.
      const qx = (vx * 1000) / (p.T * 60) + p.Qout;
      const qOk = brackets(Q, 2, (z) => ((z - p.Qout) * p.T * 60) / 1000, vx);
      const pOk = brackets(P, 2, (z) => (z * 1000) / (1000 * 9.81 * p.H) * 1000, qx);
      return vOk && qOk && pOk;
    }
    case "alarm": {
      const r = toNum(ans.rate), t = toNum(ans.time), s = toNum(ans.inflow);
      const A = p.L * p.W;
      const rOk = brackets(r, 2, (z) => ((z / 100) * A * 1000) / 60, p.Qout - p.Qin);
      const tOk = brackets(t, 1, (z) => (((p.Qout - p.Qin) * z * 60) / 1000 / A) * 100, (p.h0 - p.hmin) * 100);
      // With supply s, the level takes exactly T2 minutes to fall to the alarm.
      const sOk = brackets(s, 2, (z) => ((((p.Qout - z) * p.T2 * 60) / 1000 / A)), p.h0 - p.hmin);
      return rOk && tOk && sOk;
    }
    default: return false;
  }
}

// =====================================================================

const SUBTOPICS = { "flow-rate": genFlow, hydraulics: genHydraulics, "pump-power": genPump, tanks: genTanks };
const VERIFIERS = { "flow-rate": verifyFlow, hydraulics: verifyHydraulics, "pump-power": verifyPump, tanks: verifyTanks };

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
