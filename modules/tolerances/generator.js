// Tolerances & Fits generator: limits and tolerances, fits, tolerance stack-up, measurement error.
// Every size is drawn and computed in whole micrometres (integers), so no 0.1 + 0.2 style float
// error ever reaches an answer; answers are then µm / 1000, given in mm to 3 decimal places.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Rounded answers (RSS, percentages) state their rounding, and draws
// that land on a rounding half-step or on a decision boundary are redrawn inside generate().
// verify() re-derives each answer by a different route (substitution back into the limits, mid
// sizes, or the inverse relation) from the integers kept in `params`.

import { fmtNum, isHalfStep } from "../../js/lib/mathutil.js";

// ---- formatting (µm in, mm text out) --------------------------------------------------------
const mm = (um) => (um < 0 ? "−" : "") + (Math.abs(um) / 1000).toFixed(3);
const mm4 = (tenthUm) => (Math.abs(tenthUm) / 10000).toFixed(4); // tenths of a µm -> mm, 4 dp
const sg = (um) => (um < 0 ? `(${mm(um)})` : mm(um)); // signed value inside a sum
const dev = (um) => (um === 0 ? "0" : `${um > 0 ? "+" : "−"}${(Math.abs(um) / 1000).toFixed(3)}`);
const nomTxt = (um) => fmtNum(um / 1000, 3);
const v = (um) => um / 1000; // answer / given value in mm
const sizeDev = (N, es, ei) => `${nomTxt(N)} mm ${dev(es)} / ${dev(ei)}`;
const TOL = 1e-9;
const NOTE3 = "Give your answer in mm to 3 decimal places.";

const NOMS = [6, 8, 10, 12, 16, 20, 25, 30, 32, 40, 45, 50, 60, 75, 80, 100].map((x) => x * 1000);
const TOLS = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50];
const BANDS = [9, 11, 13, 16, 18, 19, 21, 22, 25, 27, 30, 33, 35, 39, 46, 54];
const EVEN_BANDS = [10, 12, 14, 16, 18, 20, 22, 24, 30, 36, 40, 46, 50, 54, 60];
const HOLE_T = [13, 16, 18, 21, 25, 30, 35, 39, 46];
const SHAFT_T = [8, 9, 11, 13, 16, 19, 21, 25];
const ITEMS = ["pin", "shaft", "spacer", "dowel", "bush", "piston rod", "bolt"];
const STACK = ["spacer", "washer", "bearing", "collar", "gear", "bush"];

function redraw(fn) {
  for (let i = 0; i < 5000; i++) {
    const r = fn();
    if (r) return r;
  }
  throw new Error("tolerances: no valid draw");
}
const partNum = (id, label, ask, um, hint) => ({ id, label, ask, answerType: "number", answer: v(um), tolerance: TOL, hint });
const partChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ---- verify-side helpers (local, independent of generation) --------------------------------
const toNum = (x) => (x === null || x === undefined || String(x).trim() === "" ? NaN : Number(String(x).replace(/−/g, "-")));
// A typed mm value as whole µm, or NaN if it is not a whole number of µm (more than 3 dp).
function toUm(x) {
  const n = toNum(x);
  if (!Number.isFinite(n)) return NaN;
  const u = n * 1000;
  return Math.abs(u - Math.round(u)) < 1e-6 ? Math.round(u) : NaN;
}
const exactDp = (x, k) => Number.isFinite(x) && Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6;

// =====================================================================
// Limits and tolerances
// =====================================================================
function genLimits(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["limit", "band", "inspec"]);
    const what = rng.pick(ITEMS);
    if (kind === "limit") {
      const N = rng.pick(NOMS), t = rng.pick(TOLS), ask = rng.pick(["upper", "lower"]);
      const up = ask === "upper";
      const ans = up ? N + t : N - t;
      return {
        prompt: `A ${what} is drawn as **${nomTxt(N)} ± ${mm(t)} mm**. What is its ${ask} limit of size, in mm? ${NOTE3}`,
        answerType: "number", answer: v(ans), tolerance: TOL,
        given: [{ label: "_nominal", value: v(N) }, { label: "_tol", value: v(t) }],
        explanation: `The ${ask} limit is the ${up ? "largest" : "smallest"} size allowed: \`_nominal ${up ? "+" : "-"} _tol\` = ${nomTxt(N)} ${up ? "+" : "−"} ${mm(t)} = **${mm(ans)} mm**.`,
        hints: ["± means the size may be that much above or below the nominal size.", `The ${ask} limit is the ${up ? "largest" : "smallest"} size the drawing allows.`],
        params: { kind, N, t, ask },
      };
    }
    if (kind === "band") {
      const N = rng.pick(NOMS), es = 5 * rng.int(-4, 6), T = rng.pick(BANDS);
      const U = N + es, L = U - T;
      return {
        prompt: `A drawing allows a ${what} to be any size from **${mm(L)} mm** to **${mm(U)} mm**. What is the tolerance (the width of the tolerance band), in mm? ${NOTE3}`,
        answerType: "number", answer: v(T), tolerance: TOL,
        given: [{ label: "_upper", value: v(U) }, { label: "_lower", value: v(L) }],
        explanation: `Tolerance = upper limit − lower limit: \`_upper - _lower\` = ${mm(U)} − ${mm(L)} = **${mm(T)} mm**.`,
        hints: ["The tolerance is how much the size is allowed to vary.", "Take the smaller limit away from the larger one."],
        params: { kind, U, L },
      };
    }
    const inside = rng.pick([true, false]);
    const { N, t, m } = redraw(() => {
      const N = rng.pick(NOMS), t = rng.pick(TOLS.filter((x) => x >= 8));
      const off = inside ? rng.int(-(t - 2), t - 2) : rng.pick([-1, 1]) * (t + rng.int(2, t));
      return off !== 0 ? { N, t, m: N + off } : null;
    });
    const choices = rng.shuffle(["In spec", "Out of spec"]);
    return {
      prompt: `A ${what} is drawn as **${nomTxt(N)} ± ${mm(t)} mm**. One is measured at **${mm(m)} mm**. Is it in spec? (A size exactly on a limit counts as in spec.)`,
      answerType: "choice", answer: inside ? "In spec" : "Out of spec", choices,
      given: [{ label: "_nominal", value: v(N) }, { label: "_tol", value: v(t) }, { label: "_measured", value: v(m) }],
      explanation: `Limits: \`_nominal - _tol\` = ${mm(N - t)} mm and \`_nominal + _tol\` = ${mm(N + t)} mm. ${mm(m)} mm is ${inside ? "between them" : m > N ? "above the upper limit" : "below the lower limit"}, so it is **${inside ? "in spec" : "out of spec"}**.`,
      hints: ["Work out the upper and lower limits first.", "A part is in spec if its size lies between the two limits."],
      params: { kind, N, t, m },
    };
  }

  if (d === "medium") {
    const kind = rng.pick(["asym", "type", "mean"]);
    const what = rng.pick(ITEMS);
    if (kind === "asym") {
      const { N, es, ei } = redraw(() => {
        const N = rng.pick(NOMS), es = 5 * rng.int(-4, 8), T = rng.pick(BANDS), ei = es - T;
        return es !== -ei ? { N, es, ei } : null;
      });
      const U = N + es, L = N + ei;
      return {
        prompt: `A ${what} is drawn as **${sizeDev(N, es, ei)}** (nominal size, then the upper and lower deviations). Find its limits of size and its tolerance. Give each value in mm to 3 decimal places.`,
        answerType: "multi",
        given: [{ label: "_nominal", value: v(N) }, { label: "_upper_dev", value: v(es) }, { label: "_lower_dev", value: v(ei) }],
        parts: [
          partNum("upper", "Upper limit", "Upper limit of size, in mm", U, "Add the upper deviation to the nominal size, keeping its sign."),
          partNum("lower", "Lower limit", "Lower limit of size, in mm", L, "Add the lower deviation to the nominal size, keeping its sign."),
          partNum("band", "Tolerance", "Tolerance (width of the band), in mm", es - ei, "Tolerance = upper limit − lower limit, or upper deviation − lower deviation."),
        ],
        explanation: `Upper limit = \`_nominal + _upper_dev\` = ${nomTxt(N)} + ${sg(es)} = **${mm(U)} mm**.\n\nLower limit = \`_nominal + _lower_dev\` = ${nomTxt(N)} + ${sg(ei)} = **${mm(L)} mm**.\n\nTolerance = \`_upper_dev - _lower_dev\` = ${mm(es)} − ${sg(ei)} = **${mm(es - ei)} mm**.`,
        params: { kind, N, es, ei },
      };
    }
    if (kind === "type") {
      const bi = rng.pick([true, false]);
      const { N, es, ei } = redraw(() => {
        const N = rng.pick(NOMS), es = 5 * rng.int(-8, 10), T = rng.pick(BANDS), ei = es - T;
        return (es > 0 && ei < 0) === bi ? { N, es, ei } : null;
      });
      const choices = rng.shuffle(["Unilateral", "Bilateral"]);
      return {
        prompt: `A ${what} is drawn as **${sizeDev(N, es, ei)}** (nominal size, then the upper and lower deviations). Is this a unilateral or a bilateral tolerance?`,
        answerType: "choice", answer: bi ? "Bilateral" : "Unilateral", choices,
        explanation: `The limits are ${mm(N + ei)} mm and ${mm(N + es)} mm. ${bi ? `The nominal size ${nomTxt(N)} mm lies between them: the band spreads on both sides of it, so the tolerance is **bilateral**.` : `The whole band lies on one side of the nominal size ${nomTxt(N)} mm${es === 0 || ei === 0 ? " (one deviation is zero)" : ""}, so the tolerance is **unilateral**.`}`,
        hints: ["Look at the signs of the two deviations.", "Bilateral: the band spreads on both sides of the nominal size. Unilateral: the band sits on one side only (a deviation of 0 counts as that side)."],
        params: { kind, N, es, ei },
      };
    }
    const { L, T } = redraw(() => {
      const N = rng.pick(NOMS), T = rng.pick(EVEN_BANDS), L = N + 5 * rng.int(-8, 4);
      return { L, T };
    });
    const U = L + T, mid = L + T / 2;
    return {
      prompt: `A ${what} has limits of size **${mm(L)} mm** and **${mm(U)} mm**. Rewrite this as a mean size ± an equal tolerance either side. Give each value in mm to 3 decimal places.`,
      answerType: "multi",
      given: [{ label: "_upper", value: v(U) }, { label: "_lower", value: v(L) }],
      parts: [
        partNum("mean", "Mean size", "Mean size (halfway between the limits), in mm", mid, "Add the two limits and halve the result."),
        partNum("pm", "±", "The ± tolerance, in mm", T / 2, "The ± value is half the width of the band, upper − lower."),
      ],
      explanation: `Mean size = \`(_upper + _lower) / 2\` = (${mm(U)} + ${mm(L)}) ÷ 2 = **${mm(mid)} mm**.\n\nThe band is ${mm(U)} − ${mm(L)} = ${mm(T)} mm wide, so the tolerance is ± \`(_upper - _lower) / 2\` = **${mm(T / 2)} mm**.\n\nSo the part is ${mm(mid)} ± ${mm(T / 2)} mm.`,
      params: { kind, L, U },
    };
  }

  if (d === "hard") {
    const kind = rng.pick(["batch", "devs"]);
    if (kind === "batch") {
      const r = redraw(() => {
        const N = rng.pick(NOMS), es = 5 * rng.int(-4, 6), T = rng.pick(BANDS.filter((x) => x >= 13)), ei = es - T;
        const L = N + ei, U = N + es;
        const sizes = [];
        for (let i = 0; i < 6; i++) sizes.push(L + rng.int(Math.round(-0.6 * T), Math.round(1.6 * T)));
        if (rng.next() < 0.5) sizes[rng.int(0, 5)] = rng.pick([L, U]);
        if (new Set(sizes).size !== 6) return null;
        const n = sizes.filter((m) => m >= L && m <= U).length;
        return n >= 1 && n <= 5 ? { N, es, ei, L, U, sizes, n } : null;
      });
      const { N, es, ei, L, U, sizes, n } = r;
      const what = rng.pick(ITEMS);
      return {
        prompt: `A ${what} is drawn as **${sizeDev(N, es, ei)}**. Six of them are measured:\n\n${sizes.map((m) => `- ${mm(m)} mm`).join("\n")}\n\nHow many of these six are in spec? A size exactly on a limit counts as in spec.`,
        answerType: "number", answer: n, tolerance: 0,
        given: [{ label: "_nominal", value: v(N) }, { label: "_upper_dev", value: v(es) }, { label: "_lower_dev", value: v(ei) }],
        explanation: `Limits: \`_nominal + _lower_dev\` = ${mm(L)} mm and \`_nominal + _upper_dev\` = ${mm(U)} mm.\n\n${sizes.map((m) => `- ${mm(m)}: ${m < L ? "below the lower limit ✗" : m > U ? "above the upper limit ✗" : m === L || m === U ? "on a limit, in spec ✓" : "in spec ✓"}`).join("\n")}\n\nSo **${n}** are in spec.`,
        hints: ["Turn the deviations into an upper and a lower limit first.", "Check each size against both limits. Watch the third decimal place."],
        params: { kind, N, es, ei, sizes },
      };
    }
    const { N, es, ei } = redraw(() => {
      const N = rng.pick(NOMS), es = 5 * rng.int(-6, 10), T = rng.pick(BANDS), ei = es - T;
      return es !== 0 && ei !== 0 ? { N, es, ei } : null;
    });
    const U = N + es, L = N + ei;
    const what = rng.pick(ITEMS);
    return {
      prompt: `A ${what} must measure between **${mm(L)} mm** and **${mm(U)} mm**. The drawing will show it as the nominal size **${nomTxt(N)} mm** with an upper and a lower deviation. Find both deviations. Give each in mm to 3 decimal places, with a minus sign if it is negative.`,
      answerType: "multi",
      given: [{ label: "_upper", value: v(U) }, { label: "_lower", value: v(L) }, { label: "_nominal", value: v(N) }],
      parts: [
        partNum("es", "Upper deviation", "Upper deviation, in mm", es, "Upper deviation = upper limit − nominal size. It is negative if the upper limit is below the nominal size."),
        partNum("ei", "Lower deviation", "Lower deviation, in mm", ei, "Lower deviation = lower limit − nominal size. It is negative if the lower limit is below the nominal size."),
      ],
      explanation: `Upper deviation = \`_upper - _nominal\` = ${mm(U)} − ${nomTxt(N)} = **${dev(es)} mm**.\n\nLower deviation = \`_lower - _nominal\` = ${mm(L)} − ${nomTxt(N)} = **${dev(ei)} mm**.\n\nSo the drawing reads ${sizeDev(N, es, ei)}.`,
      params: { kind, N, es, ei },
    };
  }

  // expert: centre a machine on the band and size its scatter, or rework an oversize shaft
  const kind = rng.pick(["setting", "rework"]);
  if (kind === "setting") {
    const ok = rng.pick([true, false]);
    const r = redraw(() => {
      const N = rng.pick(NOMS), T = rng.pick(EVEN_BANDS.filter((x) => x >= 16)), es = 5 * rng.int(-6, 8), ei = es - T;
      const half = T / 2, s = rng.int(2, half - 2), k = rng.int(-half, half);
      if (k === 0 || Math.abs(k) + s === half) return null;
      return (Math.abs(k) + s < half) === ok ? { N, T, es, ei, s, S: N + ei + half + k } : null;
    });
    const { N, T, es, ei, s, S } = r;
    const L = N + ei, U = N + es, mid = L + T / 2;
    return {
      prompt: `A lathe turns a shaft that is drawn as **Ø${sizeDev(N, es, ei)}**. Whatever diameter the lathe is set to, the parts it makes scatter by up to a fixed amount either side of that setting. Give sizes in mm to 3 decimal places.`,
      answerType: "multi",
      given: [{ label: "_nominal", value: v(N) }, { label: "_upper_dev", value: v(es) }, { label: "_lower_dev", value: v(ei) }, { label: "_setting", value: v(S) }, { label: "_scatter", value: v(s) }],
      parts: [
        partNum("set", "Best setting", "Which diameter should the lathe be set to, to give the most room either side? In mm", mid, "Work out both limits, then take the point halfway between them."),
        partNum("scatter", "Max scatter", "What is the largest ± scatter that still keeps every shaft in spec when set there? In mm", T / 2, "From the middle of the band, how far is it to either limit?"),
        partChoice("ok", "Check", `The lathe is actually set to ${mm(S)} mm with a scatter of ±${mm(s)} mm. Will every shaft be in spec?`, ok ? "Yes" : "No", rng.shuffle(["Yes", "No"]), "Find the smallest and largest shaft it can make (setting − scatter and setting + scatter) and compare them with the limits."),
      ],
      explanation: `Limits: ${nomTxt(N)} + ${sg(ei)} = ${mm(L)} mm and ${nomTxt(N)} + ${sg(es)} = ${mm(U)} mm.\n\nBest setting = halfway: (${mm(L)} + ${mm(U)}) ÷ 2 = **${mm(mid)} mm**.\n\nFrom there each limit is ${mm(T)} ÷ 2 = **${mm(T / 2)} mm** away, so that is the largest scatter allowed.\n\nSet at ${mm(S)} mm, it makes \`_setting - _scatter\` = ${mm(S - s)} mm to \`_setting + _scatter\` = ${mm(S + s)} mm. ${ok ? `Both are inside ${mm(L)} to ${mm(U)}: **Yes**.` : `${S - s < L ? `${mm(S - s)} is below the lower limit` : `${mm(S + s)} is above the upper limit`}: **No**.`}`,
      params: { kind, N, es, ei, S, s },
    };
  }
  const r = redraw(() => {
    const N = rng.pick(NOMS), T = rng.pick(BANDS), es = 5 * rng.int(-6, 4), ei = es - T;
    const U = N + es, L = N + ei, D = U + rng.int(3, 80);
    const cut2 = 2 * D - U - L; // twice the cut on the diameter
    return cut2 % 4 === 0 ? { N, es, ei, D, cut: cut2 / 2 } : null;
  });
  const { N, es, ei, D, cut } = r;
  const L = N + ei, U = N + es;
  return {
    prompt: `A shaft is drawn as **Ø${sizeDev(N, es, ei)}**. One shaft measures **${mm(D)} mm**, which is oversize. It will be turned down so that its diameter lands exactly in the middle of the tolerance band. Give sizes in mm to 3 decimal places.`,
    answerType: "multi",
    given: [{ label: "_nominal", value: v(N) }, { label: "_upper_dev", value: v(es) }, { label: "_lower_dev", value: v(ei) }, { label: "_measured", value: v(D) }],
    parts: [
      partNum("dia", "On diameter", "How much must come off the diameter? In mm", cut, "Find the middle of the band (halfway between the limits), then subtract it from the measured diameter."),
      partNum("depth", "Depth of cut", "Turning removes metal from all round, so what depth of cut (on the radius) is that? In mm", cut / 2, "A cut of depth d takes d off each side, so the diameter shrinks by 2 × d."),
    ],
    explanation: `Limits: ${mm(L)} mm to ${mm(U)} mm, so the middle is (${mm(L)} + ${mm(U)}) ÷ 2 = ${mm((L + U) / 2)} mm.\n\nTake off the diameter: \`_measured - (2 * _nominal + _upper_dev + _lower_dev) / 2\` = ${mm(D)} − ${mm((L + U) / 2)} = **${mm(cut)} mm**.\n\nThe depth of cut is half that, because the tool cuts both sides of the diameter: ${mm(cut)} ÷ 2 = **${mm(cut / 2)} mm**.`,
    params: { kind, N, es, ei, D },
  };
}

function verifyLimits(q, ans) {
  const p = q.params;
  switch (p.kind) {
    case "limit": {
      const x = toUm(ans);
      return p.ask === "upper" ? x - p.t === p.N : x + p.t === p.N;
    }
    case "band": { const x = toUm(ans); return x > 0 && p.L + x === p.U; }
    case "inspec": return ans === (Math.abs(p.m - p.N) <= p.t ? "In spec" : "Out of spec");
    case "asym": {
      const U = toUm(ans.upper), L = toUm(ans.lower), b = toUm(ans.band);
      return U - p.es === p.N && L - p.ei === p.N && U - b === L;
    }
    case "type": {
      const U = p.N + p.es, L = p.N + p.ei;
      return ans === (L < p.N && p.N < U ? "Bilateral" : "Unilateral");
    }
    case "mean": {
      const m = toUm(ans.mean), t = toUm(ans.pm);
      return m - t === p.L && m + t === p.U;
    }
    case "batch": {
      // In spec when |2m − (U + L)| ≤ U − L (distance from the mid size within half the band).
      const U = p.N + p.es, L = p.N + p.ei;
      const n = p.sizes.filter((m) => Math.abs(2 * m - (U + L)) <= U - L).length;
      return Number.isInteger(toNum(ans)) && toNum(ans) === n;
    }
    case "devs": return p.N + toUm(ans.es) === p.N + p.es && p.N + toUm(ans.ei) === p.N + p.ei && toUm(ans.es) - toUm(ans.ei) > 0;
    case "setting": {
      const set = toUm(ans.set), sc = toUm(ans.scatter);
      // Every part in spec when the whole scatter range S ± s sits inside the limits.
      const fits = p.S - p.s >= p.N + p.ei && p.S + p.s <= p.N + p.es;
      return 2 * set === 2 * p.N + p.es + p.ei && 2 * sc === p.es - p.ei && ans.ok === (fits ? "Yes" : "No");
    }
    case "rework": {
      const c = toUm(ans.dia), dep = toUm(ans.depth);
      const left = p.D - c; // diameter after turning must be the mid size
      return 2 * left === 2 * p.N + p.es + p.ei && p.D - 2 * dep === left;
    }
    default: return false;
  }
}

// =====================================================================
// Fits
// =====================================================================
const FIT_CHOICES = ["Clearance fit", "Transition fit", "Interference fit"];
// Hole-basis fit (hole N +Th / 0) of a given class, with strict (never touching) limits.
function drawFit(cls, rng) {
  return redraw(() => {
    const N = rng.pick(NOMS), Th = rng.pick(HOLE_T), Ts = rng.pick(SHAFT_T);
    let es;
    if (cls === "clearance") es = -5 * rng.int(1, 12);
    else if (cls === "interference") es = Th + Ts + rng.int(2, 30);
    else es = rng.int(1, Th + Ts - 1);
    const ei = es - Ts;
    const f = { N, Th, es, ei, Hmax: N + Th, Hmin: N, Smax: N + es, Smin: N + ei };
    if (cls === "transition" && !(f.Smax > f.Hmin && f.Smin < f.Hmax)) return null;
    return f;
  });
}
const fitLimits = (f) => `Hole: **${mm(f.Hmin)} mm to ${mm(f.Hmax)} mm**. Shaft: **${mm(f.Smin)} mm to ${mm(f.Smax)} mm**.`;
const fitDevs = (f) => `Hole: **Ø${sizeDev(f.N, f.Th, 0)}**. Shaft: **Ø${sizeDev(f.N, f.es, f.ei)}**.`;
const fitGiven = (f) => [{ label: "_hole_max", value: v(f.Hmax) }, { label: "_hole_min", value: v(f.Hmin) }, { label: "_shaft_max", value: v(f.Smax) }, { label: "_shaft_min", value: v(f.Smin) }];
const devGiven = (f) => [{ label: "_nominal", value: v(f.N) }, { label: "_hole_dev", value: v(f.Th) }, { label: "_shaft_upper", value: v(f.es) }, { label: "_shaft_lower", value: v(f.ei) }];
const clsName = (cls) => `${cls[0].toUpperCase()}${cls.slice(1)} fit`;
// Class from the limits by overlap (verify side).
function classOf(Hmax, Hmin, Smax, Smin) {
  if (Smax < Hmin || Smax === Hmin) return "Clearance fit";
  if (Smin > Hmax || Smin === Hmax) return "Interference fit";
  return "Transition fit";
}
function whyClass(f, cls) {
  if (cls === "clearance") return `The largest shaft (${mm(f.Smax)}) is smaller than the smallest hole (${mm(f.Hmin)}), so there is always a gap: a **clearance fit**.`;
  if (cls === "interference") return `The smallest shaft (${mm(f.Smin)}) is bigger than the largest hole (${mm(f.Hmax)}), so it is always tight: an **interference fit**.`;
  return `The size ranges overlap: the largest shaft (${mm(f.Smax)}) is bigger than the smallest hole (${mm(f.Hmin)}), but the smallest shaft (${mm(f.Smin)}) is smaller than the largest hole (${mm(f.Hmax)}). Some pairs are loose and some tight: a **transition fit**.`;
}

function genFits(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["maxc", "minc", "class"]);
    if (kind === "class") {
      const cls = rng.pick(["clearance", "transition", "interference"]);
      const f = drawFit(cls, rng);
      return {
        prompt: `A hole and a shaft are made to these limits. ${fitLimits(f)} What kind of fit is this?`,
        answerType: "choice", answer: clsName(cls), choices: rng.shuffle(FIT_CHOICES),
        explanation: whyClass(f, cls),
        hints: ["Compare the largest shaft with the smallest hole, and the smallest shaft with the largest hole.", "Always a gap → clearance. Always tight → interference. Sometimes either → transition."],
        params: { kind, ...f },
      };
    }
    const f = drawFit("clearance", rng);
    const isMax = kind === "maxc";
    const ans = isMax ? f.Hmax - f.Smin : f.Hmin - f.Smax;
    return {
      prompt: `A shaft runs in a hole with a clearance fit. ${fitLimits(f)} What is the ${isMax ? "largest" : "smallest"} clearance (gap between hole and shaft diameters), in mm? ${NOTE3}`,
      answerType: "number", answer: v(ans), tolerance: TOL,
      given: fitGiven(f),
      explanation: isMax
        ? `The largest gap is the biggest hole with the smallest shaft: \`_hole_max - _shaft_min\` = ${mm(f.Hmax)} − ${mm(f.Smin)} = **${mm(ans)} mm**.`
        : `The smallest gap is the smallest hole with the biggest shaft: \`_hole_min - _shaft_max\` = ${mm(f.Hmin)} − ${mm(f.Smax)} = **${mm(ans)} mm**.`,
      hints: ["Clearance = hole diameter − shaft diameter.", isMax ? "For the largest gap, which hole and which shaft would you pick?" : "For the smallest gap, which hole and which shaft would you pick?"],
      params: { kind, ...f },
    };
  }

  if (d === "medium") {
    const kind = rng.pick(["devs", "press"]);
    if (kind === "devs") {
      const cls = rng.pick(["clearance", "transition", "interference"]);
      const f = drawFit(cls, rng);
      const maxc = f.Hmax - f.Smin, minc = f.Hmin - f.Smax;
      return {
        prompt: `A hole and a shaft are drawn as follows. ${fitDevs(f)} Find the largest and smallest clearance, and say what kind of fit this is. Give clearances in mm to 3 decimal places. Use a negative number when the "clearance" is really an interference.`,
        answerType: "multi",
        given: devGiven(f),
        parts: [
          partNum("maxc", "Max clearance", "Largest clearance (largest hole − smallest shaft), in mm", maxc, "Turn both sets of deviations into limits first, then take largest hole − smallest shaft."),
          partNum("minc", "Min clearance", "Smallest clearance (smallest hole − largest shaft), in mm", minc, "Smallest hole − largest shaft. A negative result means the parts overlap (interference)."),
          partChoice("cls", "Fit", "What kind of fit is this?", clsName(cls), rng.shuffle(FIT_CHOICES), "Look at the signs of your two clearances: both positive, both negative, or one of each?"),
        ],
        explanation: `Hole: ${mm(f.Hmin)} to ${mm(f.Hmax)} mm. Shaft: \`_nominal + _shaft_lower\` = ${mm(f.Smin)} to \`_nominal + _shaft_upper\` = ${mm(f.Smax)} mm.\n\nLargest clearance = ${mm(f.Hmax)} − ${mm(f.Smin)} = **${mm(maxc)} mm**.\n\nSmallest clearance = ${mm(f.Hmin)} − ${mm(f.Smax)} = **${mm(minc)} mm**.\n\n${whyClass(f, cls)}`,
        params: { kind, ...f },
      };
    }
    const f = drawFit("interference", rng);
    const maxi = f.Smax - f.Hmin, mini = f.Smin - f.Hmax;
    return {
      prompt: `A bush is pressed into a housing with an interference fit. ${fitDevs(f)} Find the largest and smallest interference (how much the shaft is bigger than the hole). Give each in mm to 3 decimal places.`,
      answerType: "multi",
      given: devGiven(f),
      parts: [
        partNum("maxi", "Max interference", "Largest interference, in mm", maxi, "Turn the deviations into limits. The tightest pair is the biggest shaft in the smallest hole."),
        partNum("mini", "Min interference", "Smallest interference, in mm", mini, "The loosest pair is the smallest shaft in the biggest hole."),
      ],
      explanation: `Hole: ${mm(f.Hmin)} to ${mm(f.Hmax)} mm. Shaft: ${mm(f.Smin)} to ${mm(f.Smax)} mm.\n\nLargest interference = largest shaft − smallest hole = ${mm(f.Smax)} − ${mm(f.Hmin)} = **${mm(maxi)} mm**. The nominal size cancels, so this is just \`_shaft_upper\`.\n\nSmallest interference = smallest shaft − largest hole = ${mm(f.Smin)} − ${mm(f.Hmax)} = **${mm(mini)} mm**, or \`_shaft_lower - _hole_dev\`.`,
      params: { kind, ...f },
    };
  }

  if (d === "hard") {
    const kind = rng.pick(["mean", "pair"]);
    if (kind === "mean") {
      const f = redraw(() => {
        const g = drawFit("transition", rng);
        return (g.Hmax + g.Hmin - g.Smax - g.Smin) % 2 === 0 && g.Hmax + g.Hmin !== g.Smax + g.Smin ? g : null;
      });
      const maxc = f.Hmax - f.Smin, maxi = f.Smax - f.Hmin, mean = (maxc - maxi) / 2;
      return {
        prompt: `A hole and a shaft form a transition fit. ${fitDevs(f)} Find the largest clearance, the largest interference and the mean clearance (hole and shaft both at their mid sizes). Give each in mm to 3 decimal places. Use a negative number if the mean clearance is really an interference.`,
        answerType: "multi",
        given: devGiven(f),
        parts: [
          partNum("maxc", "Max clearance", "Largest clearance, in mm", maxc, "Largest hole − smallest shaft."),
          partNum("maxi", "Max interference", "Largest interference, in mm", maxi, "Largest shaft − smallest hole."),
          partNum("mean", "Mean clearance", "Mean clearance (mid hole − mid shaft), in mm", mean, "Mid size = halfway between the limits. Or: average the largest clearance and the smallest clearance (which is minus the largest interference)."),
        ],
        explanation: `Hole: ${mm(f.Hmin)} to ${mm(f.Hmax)} mm. Shaft: ${mm(f.Smin)} to ${mm(f.Smax)} mm.\n\nLargest clearance = ${mm(f.Hmax)} − ${mm(f.Smin)} = **${mm(maxc)} mm**.\n\nLargest interference = ${mm(f.Smax)} − ${mm(f.Hmin)} = **${mm(maxi)} mm**.\n\nMean clearance = (${mm(maxc)} + ${sg(-maxi)}) ÷ 2 = **${mm(mean)} mm**${mean > 0 ? ": on average the pairs are slightly loose" : ": on average the pairs are slightly tight"}.`,
        params: { kind, ...f },
      };
    }
    const cls = rng.pick(["clearance", "transition", "interference"]);
    const f = drawFit(cls, rng);
    const hIn = rng.pick([true, true, false]), sIn = rng.pick([true, true, false]);
    const h = hIn ? rng.int(f.Hmin + 1, f.Hmax - 1) : rng.pick([f.Hmin - rng.int(1, 12), f.Hmax + rng.int(1, 12)]);
    const s = sIn ? rng.int(f.Smin + 1, f.Smax - 1) : rng.pick([f.Smin - rng.int(1, 12), f.Smax + rng.int(1, 12)]);
    const SPEC = ["Both are in spec", "Only the hole is in spec", "Only the shaft is in spec", "Neither is in spec"];
    const specAns = hIn && sIn ? SPEC[0] : hIn ? SPEC[1] : sIn ? SPEC[2] : SPEC[3];
    return {
      prompt: `A hole and a shaft are made to these limits. ${fitLimits(f)} One hole measures **${mm(h)} mm** and one shaft measures **${mm(s)} mm**. Give sizes in mm to 3 decimal places. Use a negative number for an interference.`,
      answerType: "multi",
      given: [{ label: "_hole", value: v(h) }, { label: "_shaft", value: v(s) }],
      parts: [
        partNum("clr", "Clearance", "Clearance of this pair (hole − shaft), in mm", h - s, "Clearance = the measured hole − the measured shaft. Keep the sign."),
        partChoice("spec", "In spec", "Which of the two parts are within their limits?", specAns, rng.shuffle(SPEC), "Check each measured size against its own limits."),
      ],
      explanation: `Clearance of this pair = \`_hole - _shaft\` = ${mm(h)} − ${mm(s)} = **${mm(h - s)} mm**${h - s < 0 ? " (an interference)" : ""}.\n\nHole ${mm(h)}: ${hIn ? "within" : "outside"} ${mm(f.Hmin)} to ${mm(f.Hmax)}. Shaft ${mm(s)}: ${sIn ? "within" : "outside"} ${mm(f.Smin)} to ${mm(f.Smax)}. So: **${specAns}**.`,
      params: { kind, ...f, h, s },
    };
  }

  // expert: design the shaft limits for a clearance range or an interference range
  const kind = rng.pick(["design-clr", "design-press"]);
  const N = rng.pick(NOMS), Th = rng.pick(HOLE_T), Ts = rng.pick(SHAFT_T);
  const Hmin = N, Hmax = N + Th;
  if (kind === "design-clr") {
    const cmin = 5 * rng.int(1, 10), cmax = cmin + Th + Ts;
    const Smax = Hmin - cmin, Smin = Hmax - cmax;
    return {
      prompt: `A hole is made to **Ø${sizeDev(N, Th, 0)}**. The shaft that runs in it must always have a clearance of at least **${mm(cmin)} mm** and never more than **${mm(cmax)} mm**. Find the shaft limits that give it the largest possible tolerance. Give each in mm to 3 decimal places.`,
      answerType: "multi",
      given: [{ label: "_hole_min", value: v(Hmin) }, { label: "_hole_max", value: v(Hmax) }, { label: "_cmin", value: v(cmin) }, { label: "_cmax", value: v(cmax) }],
      parts: [
        partNum("smax", "Shaft max", "Shaft upper limit, in mm", Smax, "The smallest clearance happens with the smallest hole and the largest shaft. Set that clearance to the minimum allowed."),
        partNum("smin", "Shaft min", "Shaft lower limit, in mm", Smin, "The largest clearance happens with the largest hole and the smallest shaft. Set that clearance to the maximum allowed."),
        partNum("tol", "Shaft tolerance", "The shaft tolerance this leaves, in mm", Smax - Smin, "Shaft tolerance = its upper limit − its lower limit. Check: it is the clearance range minus the hole tolerance."),
      ],
      explanation: `Hole limits: ${mm(Hmin)} to ${mm(Hmax)} mm.\n\nSmallest clearance = smallest hole − largest shaft, so the largest shaft = \`_hole_min - _cmin\` = ${mm(Hmin)} − ${mm(cmin)} = **${mm(Smax)} mm**.\n\nLargest clearance = largest hole − smallest shaft, so the smallest shaft = \`_hole_max - _cmax\` = ${mm(Hmax)} − ${mm(cmax)} = **${mm(Smin)} mm**.\n\nShaft tolerance = ${mm(Smax)} − ${mm(Smin)} = **${mm(Smax - Smin)} mm**. Check: clearance range ${mm(cmax - cmin)} − hole tolerance ${mm(Th)} = ${mm(Smax - Smin)}.`,
      params: { kind, N, Th, cmin, cmax },
    };
  }
  const imin = rng.int(5, 30), imax = imin + Th + Ts;
  const Smin = Hmax + imin, Smax = Hmin + imax;
  return {
    prompt: `A housing bore is made to **Ø${sizeDev(N, Th, 0)}**. A pin pressed into it must always have an interference of at least **${mm(imin)} mm** (so it never works loose) and never more than **${mm(imax)} mm** (so the housing does not crack). Find the pin limits that give it the largest possible tolerance. Give each in mm to 3 decimal places.`,
    answerType: "multi",
    given: [{ label: "_hole_min", value: v(Hmin) }, { label: "_hole_max", value: v(Hmax) }, { label: "_imin", value: v(imin) }, { label: "_imax", value: v(imax) }],
    parts: [
      partNum("smin", "Pin min", "Pin lower limit, in mm", Smin, "The loosest pair is the smallest pin in the largest bore. It must still have the minimum interference."),
      partNum("smax", "Pin max", "Pin upper limit, in mm", Smax, "The tightest pair is the largest pin in the smallest bore. It must not exceed the maximum interference."),
      partNum("tol", "Pin tolerance", "The pin tolerance this leaves, in mm", Smax - Smin, "Pin tolerance = its upper limit − its lower limit. Check: it is the interference range minus the bore tolerance."),
    ],
    explanation: `Bore limits: ${mm(Hmin)} to ${mm(Hmax)} mm.\n\nSmallest pin = largest bore + minimum interference: \`_hole_max + _imin\` = ${mm(Hmax)} + ${mm(imin)} = **${mm(Smin)} mm**.\n\nLargest pin = smallest bore + maximum interference: \`_hole_min + _imax\` = ${mm(Hmin)} + ${mm(imax)} = **${mm(Smax)} mm**.\n\nPin tolerance = ${mm(Smax)} − ${mm(Smin)} = **${mm(Smax - Smin)} mm**. Check: interference range ${mm(imax - imin)} − bore tolerance ${mm(Th)} = ${mm(Smax - Smin)}.`,
    params: { kind, N, Th, imin, imax },
  };
}

function verifyFits(q, ans) {
  const p = q.params;
  switch (p.kind) {
    case "class": return ans === classOf(p.Hmax, p.Hmin, p.Smax, p.Smin);
    case "maxc": return p.Smin + toUm(ans) === p.Hmax;
    case "minc": return p.Smax + toUm(ans) === p.Hmin;
    case "devs":
      return p.Smin + toUm(ans.maxc) === p.Hmax && p.Smax + toUm(ans.minc) === p.Hmin
        && ans.cls === classOf(p.Hmax, p.Hmin, p.Smax, p.Smin);
    case "press": return p.Hmin + toUm(ans.maxi) === p.Smax && p.Hmax + toUm(ans.mini) === p.Smin;
    case "mean": {
      const m = toUm(ans.mean);
      // Mid hole − mid shaft, doubled to stay in whole µm.
      return p.Smin + toUm(ans.maxc) === p.Hmax && p.Hmin + toUm(ans.maxi) === p.Smax
        && 2 * m === (p.Hmax + p.Hmin) - (p.Smax + p.Smin);
    }
    case "pair": {
      const hIn = p.h >= p.Hmin && p.h <= p.Hmax, sIn = p.s >= p.Smin && p.s <= p.Smax;
      const want = hIn ? (sIn ? "Both are in spec" : "Only the hole is in spec") : sIn ? "Only the shaft is in spec" : "Neither is in spec";
      return p.s + toUm(ans.clr) === p.h && ans.spec === want;
    }
    case "design-clr": {
      const smax = toUm(ans.smax), smin = toUm(ans.smin), tol = toUm(ans.tol);
      return p.N - smax === p.cmin && p.N + p.Th - smin === p.cmax && tol === p.cmax - p.cmin - p.Th;
    }
    case "design-press": {
      const smax = toUm(ans.smax), smin = toUm(ans.smin), tol = toUm(ans.tol);
      return smin - (p.N + p.Th) === p.imin && smax - p.N === p.imax && tol === p.imax - p.imin - p.Th;
    }
    default: return false;
  }
}

// =====================================================================
// Tolerance stack-up
// =====================================================================
const LETTERS = ["A", "B", "C", "D", "E", "F"];
function drawStack(n, rng, tols = [10, 20, 25, 30, 40, 50, 100]) {
  const out = [], names = rng.shuffle(STACK);
  for (let i = 0; i < n; i++) out.push({ name: LETTERS[i], what: names[i], L: 1000 * rng.int(3, 30) + rng.pick([0, 250, 500]), t: rng.pick(tols) });
  return out;
}
const stackList = (parts) => parts.map((p) => `- ${p.name}: ${p.what}, **${mm(p.L)} ± ${mm(p.t)} mm**`).join("\n");
const stackGiven = (parts) => parts.flatMap((p) => [{ label: `_${p.name.toLowerCase()}`, value: v(p.L) }, { label: `_t${p.name.toLowerCase()}`, value: v(p.t) }]);

function genStack(d, rng) {
  const nomTxt = mm; // stack lengths always show 3 decimals
  if (d === "easy") {
    const kind = rng.pick(["tol", "maxlen", "minlen"]);
    const parts = drawStack(kind === "tol" ? 3 : rng.int(2, 3), rng);
    const SL = sum(parts.map((p) => p.L)), ST = sum(parts.map((p) => p.t));
    if (kind === "tol") {
      return {
        prompt: `Three parts are stacked end to end on a shaft:\n\n${stackList(parts)}\n\nIn the worst case, what is the tolerance (the ± value) on the total length? ${NOTE3}`,
        answerType: "number", answer: v(ST), tolerance: TOL,
        given: parts.map((p) => ({ label: `_t${p.name.toLowerCase()}`, value: v(p.t) })),
        explanation: `Worst case, every part is at the same extreme, so the tolerances add: \`${parts.map((p) => `_t${p.name.toLowerCase()}`).join(" + ")}\` = ${parts.map((p) => mm(p.t)).join(" + ")} = **± ${mm(ST)} mm**.`,
        hints: ["In the worst case all the parts are at their largest at the same time (or all at their smallest).", "So the individual tolerances add up."],
        params: { kind, parts },
      };
    }
    const big = kind === "maxlen";
    const ans = big ? SL + ST : SL - ST;
    return {
      prompt: `${parts.length === 2 ? "Two" : "Three"} parts are stacked end to end:\n\n${stackList(parts)}\n\nWhat is the ${big ? "longest" : "shortest"} the stack can be, in mm? ${NOTE3}`,
      answerType: "number", answer: v(ans), tolerance: TOL,
      given: stackGiven(parts),
      explanation: `Every part at its ${big ? "largest" : "smallest"}: ${parts.map((p) => `${nomTxt(p.L)} ${big ? "+" : "−"} ${mm(p.t)}`).join(", ")}. Add them: ${parts.map((p) => mm(big ? p.L + p.t : p.L - p.t)).join(" + ")} = **${mm(ans)} mm**.`,
      hints: [`Find each part's ${big ? "upper" : "lower"} limit.`, "Add those limits together."],
      params: { kind, parts },
    };
  }

  if (d === "medium") {
    const kind = rng.pick(["gap", "tolsum"]);
    if (kind === "tolsum") {
      const parts = drawStack(rng.int(4, 5), rng);
      const SL = sum(parts.map((p) => p.L)), ST = sum(parts.map((p) => p.t));
      return {
        prompt: `${parts.length === 4 ? "Four" : "Five"} parts are stacked end to end:\n\n${stackList(parts)}\n\nFind the nominal total length and its worst-case tolerance. Give each in mm to 3 decimal places.`,
        answerType: "multi",
        given: stackGiven(parts).slice(0, 8),
        parts: [
          partNum("nom", "Nominal", "Nominal total length, in mm", SL, "Add the nominal lengths."),
          partNum("tol", "±", "Worst-case tolerance (the ± value) on the total, in mm", ST, "Worst case, the tolerances add up."),
        ],
        explanation: `Nominal total = ${parts.map((p) => nomTxt(p.L)).join(" + ")} = **${mm(SL)} mm**.\n\nWorst-case tolerance = ${parts.map((p) => mm(p.t)).join(" + ")} = **± ${mm(ST)} mm**.\n\nSo the stack is ${mm(SL)} ± ${mm(ST)} mm: from ${mm(SL - ST)} to ${mm(SL + ST)} mm.`,
        params: { kind, parts },
      };
    }
    const r = redraw(() => {
      const parts = drawStack(rng.int(2, 3), rng);
      const SL = sum(parts.map((p) => p.L)), ST = sum(parts.map((p) => p.t));
      const th = rng.pick([20, 25, 50, 100]), g0 = 50 * rng.int(2, 16);
      return g0 - th - ST >= 20 ? { parts, H: SL + g0, th, g0, ST } : null;
    });
    const { parts, H, th, g0, ST } = r;
    return {
      prompt: `A housing **${nomTxt(H)} ± ${mm(th)} mm** long holds these parts end to end:\n\n${stackList(parts)}\n\nThe gap is the housing length minus the stack. Find the nominal, largest and smallest gap. Give each in mm to 3 decimal places.`,
      answerType: "multi",
      given: [{ label: "_housing", value: v(H) }, { label: "_th", value: v(th) }, ...stackGiven(parts)].slice(0, 8),
      parts: [
        partNum("nom", "Nominal gap", "Nominal gap, in mm", g0, "Housing nominal − the sum of the parts' nominal lengths."),
        partNum("max", "Max gap", "Largest gap, in mm", g0 + th + ST, "Largest gap: the longest housing with every part at its shortest."),
        partNum("min", "Min gap", "Smallest gap, in mm", g0 - th - ST, "Smallest gap: the shortest housing with every part at its longest."),
      ],
      explanation: `Nominal gap = ${nomTxt(H)} − (${parts.map((p) => nomTxt(p.L)).join(" + ")}) = **${mm(g0)} mm**.\n\nAll the tolerances add: ${mm(th)} + ${parts.map((p) => mm(p.t)).join(" + ")} = ${mm(th + ST)} mm.\n\nLargest gap = ${mm(g0)} + ${mm(th + ST)} = **${mm(g0 + th + ST)} mm**. Smallest gap = ${mm(g0)} − ${mm(th + ST)} = **${mm(g0 - th - ST)} mm**.`,
      params: { kind, parts, H, th },
    };
  }

  if (d === "hard") {
    const kind = rng.pick(["fitcheck", "asym"]);
    if (kind === "fitcheck") {
      const fits = rng.pick([true, false]);
      const r = redraw(() => {
        const parts = drawStack(3, rng);
        const SL = sum(parts.map((p) => p.L)), ST = sum(parts.map((p) => p.t));
        const th = rng.pick([20, 25, 50, 100]), g0 = 10 * rng.int(2, 30);
        const gmin = g0 - th - ST;
        return gmin !== 0 && Math.abs(gmin) >= 5 && (gmin > 0) === fits ? { parts, H: SL + g0, th, g0, ST } : null;
      });
      const { parts, H, th, g0, ST } = r;
      const gmin = g0 - th - ST, gmax = g0 + th + ST;
      return {
        prompt: `Three parts must fit end to end inside a housing **${nomTxt(H)} ± ${mm(th)} mm** long:\n\n${stackList(parts)}\n\nWork out the worst-case gap left at the end. Give gaps in mm to 3 decimal places. Use a negative number if the parts would not fit.`,
        answerType: "multi",
        given: [{ label: "_housing", value: v(H) }, { label: "_th", value: v(th) }, ...stackGiven(parts)].slice(0, 8),
        parts: [
          partNum("min", "Min gap", "Smallest gap, in mm", gmin, "Shortest housing, longest parts: (housing − its tolerance) − the sum of (each length + its tolerance)."),
          partNum("max", "Max gap", "Largest gap, in mm", gmax, "Longest housing, shortest parts."),
          partChoice("fit", "Always fits", "Will the parts always fit in the housing?", fits ? "Yes" : "No", rng.shuffle(["Yes", "No"]), "They always fit only if even the smallest gap is at least zero."),
        ],
        explanation: `Nominal gap = ${nomTxt(H)} − (${parts.map((p) => nomTxt(p.L)).join(" + ")}) = ${mm(g0)} mm. Worst-case tolerances add: ${mm(th)} + ${parts.map((p) => mm(p.t)).join(" + ")} = ${mm(th + ST)} mm.\n\nSmallest gap = ${mm(g0)} − ${mm(th + ST)} = **${mm(gmin)} mm**. Largest gap = ${mm(g0)} + ${mm(th + ST)} = **${mm(gmax)} mm**.\n\n${fits ? "The smallest gap is still positive, so the parts **always fit**: **Yes**." : "The smallest gap is negative: with an unlucky set of parts they would not go in. **No**."}`,
        params: { kind, parts, H, th },
      };
    }
    // Unequal deviations: a shaft shoulder length A carries two parts B and C; gap = A − B − C.
    const r = redraw(() => {
      const mk = () => { const T = rng.pick([20, 30, 40, 50, 60, 80, 100]); const es = 10 * rng.int(-3, 8); return { es, ei: es - T }; };
      const B = { L: 1000 * rng.int(5, 25) + rng.pick([0, 500]), ...mk() }, C = { L: 1000 * rng.int(5, 25) + rng.pick([0, 500]), ...mk() };
      const g0 = 100 * rng.int(2, 8);
      const A = { L: B.L + C.L + g0, ...mk() };
      const gmin = (A.L + A.ei) - (B.L + B.es) - (C.L + C.es);
      if (A.es === -A.ei || B.es === -B.ei || C.es === -C.ei) return null;
      return gmin > 0 ? { A, B, C } : null;
    });
    const { A, B, C } = r;
    const gmax = (A.L + A.es) - (B.L + B.ei) - (C.L + C.ei), gmin = (A.L + A.ei) - (B.L + B.es) - (C.L + C.es);
    const what = rng.pick(STACK), what2 = rng.pick(STACK.filter((w) => w !== what));
    return {
      prompt: `A shaft has a shoulder-to-groove length A of **${sizeDev(A.L, A.es, A.ei)}**. Along it sit a ${what} B of **${sizeDev(B.L, B.es, B.ei)}** and a ${what2} C of **${sizeDev(C.L, C.es, C.ei)}**. The end gap is A − B − C. Find the largest and smallest gap. Give each in mm to 3 decimal places.`,
      answerType: "multi",
      given: [{ label: "_a_max", value: v(A.L + A.es) }, { label: "_a_min", value: v(A.L + A.ei) }, { label: "_b_max", value: v(B.L + B.es) }, { label: "_b_min", value: v(B.L + B.ei) }, { label: "_c_max", value: v(C.L + C.es) }, { label: "_c_min", value: v(C.L + C.ei) }],
      parts: [
        partNum("max", "Max gap", "Largest gap, in mm", gmax, "Turn each size into its limits. Largest gap: A at its largest, B and C at their smallest."),
        partNum("min", "Min gap", "Smallest gap, in mm", gmin, "Smallest gap: A at its smallest, B and C at their largest."),
      ],
      explanation: `Limits: A ${mm(A.L + A.ei)} to ${mm(A.L + A.es)}, B ${mm(B.L + B.ei)} to ${mm(B.L + B.es)}, C ${mm(C.L + C.ei)} to ${mm(C.L + C.es)} mm.\n\nLargest gap = \`_a_max - _b_min - _c_min\` = ${mm(A.L + A.es)} − ${mm(B.L + B.ei)} − ${mm(C.L + C.ei)} = **${mm(gmax)} mm**.\n\nSmallest gap = \`_a_min - _b_max - _c_max\` = ${mm(A.L + A.ei)} − ${mm(B.L + B.es)} − ${mm(C.L + C.es)} = **${mm(gmin)} mm**.`,
      params: { kind, A, B, C },
    };
  }

  // expert: RSS against worst case, or a tolerance budget for one part
  const kind = rng.pick(["rss", "budget"]);
  if (kind === "rss") {
    const verdict = rng.pick(["both", "rss", "neither"]);
    const r = redraw(() => {
      const n = rng.int(4, 6);
      const ts = [];
      for (let i = 0; i < n; i++) ts.push(rng.pick([10, 15, 20, 25, 30, 40, 50]));
      const S2 = sum(ts.map((t) => t * t)), rss = Math.sqrt(S2), wc = sum(ts);
      if (isHalfStep(rss, 0, 1e-6) || wc - rss < 8) return null;
      let G;
      if (verdict === "both") G = wc + rng.int(2, 20);
      else if (verdict === "rss") G = rng.int(Math.ceil(rss) + 2, wc - 2);
      else G = rng.int(Math.max(5, Math.floor(rss) - 25), Math.floor(rss) - 2);
      return G > 0 ? { ts, S2, wc, rssUm: Math.round(rss), G } : null;
    });
    const { ts, wc, rssUm, G } = r;
    const parts = ts.map((t, i) => ({ name: LETTERS[i], t }));
    const VERDICTS = { both: "Both methods", rss: "Only the RSS method", neither: "Neither method" };
    return {
      prompt: `A stack of ${ts.length} parts has these tolerances: ${parts.map((p) => `${p.name} ± ${mm(p.t)}`).join(", ")} mm. The overall length must stay within **± ${mm(G)} mm** of nominal. Compare the worst-case and root-sum-square (RSS) estimates of the stack tolerance. Give tolerances in mm to 3 decimal places.`,
      answerType: "multi",
      given: parts.map((p) => ({ label: `_t${p.name.toLowerCase()}`, value: v(p.t) })),
      parts: [
        partNum("wc", "Worst case", "Worst-case stack tolerance (the ± value), in mm", wc, "Worst case: add the tolerances."),
        { ...partNum("rss", "RSS", "RSS stack tolerance (the ± value), in mm, rounded to 3 decimal places", rssUm, "RSS: square each tolerance, add the squares, then take the square root."), tolerance: 0.0005 },
        partChoice("ok", "Meets spec", `Which method says the stack stays within ± ${mm(G)} mm?`, VERDICTS[verdict], rng.shuffle(Object.values(VERDICTS)), `Compare each of your two answers with ${mm(G)} mm. The RSS figure is never bigger than the worst case.`),
      ],
      explanation: `Worst case = ${ts.map((t) => mm(t)).join(" + ")} = **± ${mm(wc)} mm**.\n\nRSS = \`sqrt(${parts.map((p) => `_t${p.name.toLowerCase()}^2`).join(" + ")})\` = √(${ts.map((t) => `${mm(t)}²`).join(" + ")}) ≈ **± ${mm(rssUm)} mm**.\n\nThe limit is ± ${mm(G)} mm: ${verdict === "both" ? "even the worst case is inside it, so **both methods** say it passes." : verdict === "rss" ? "the RSS figure is inside it but the worst case is not, so **only the RSS method** says it passes (most stacks, not every one)." : "even the RSS figure is too big, so **neither method** says it passes."}`,
      params: { kind, ts, G, verdict },
    };
  }
  const r = redraw(() => {
    const parts = drawStack(3, rng, [10, 20, 25, 30, 40, 50]);
    const th = rng.pick([20, 25, 30, 50]), g0 = 50 * rng.int(3, 12), gmin = 10 * rng.int(1, 10);
    const known = parts[0].t + parts[1].t;
    const tc = g0 - th - known - gmin;
    return tc >= 5 && tc <= 200 ? { parts, H: sum(parts.map((p) => p.L)) + g0, th, g0, gmin, tc } : null;
  });
  const { parts, H, th, g0, gmin, tc } = r;
  const [A, B, C] = parts;
  return {
    prompt: `A housing **${nomTxt(H)} ± ${mm(th)} mm** long holds three parts end to end: ${A.what} A **${nomTxt(A.L)} ± ${mm(A.t)} mm**, ${B.what} B **${nomTxt(B.L)} ± ${mm(B.t)} mm** and ${C.what} C, nominal **${nomTxt(C.L)} mm**, whose tolerance is still to be chosen. In the worst case the end gap must never be less than **${mm(gmin)} mm**. Give each value in mm to 3 decimal places.`,
    answerType: "multi",
    given: [{ label: "_housing", value: v(H) }, { label: "_th", value: v(th) }, { label: "_a", value: v(A.L) }, { label: "_ta", value: v(A.t) }, { label: "_b", value: v(B.L) }, { label: "_tb", value: v(B.t) }, { label: "_c", value: v(C.L) }, { label: "_gmin", value: v(gmin) }],
    parts: [
      partNum("nom", "Nominal gap", "Nominal gap, in mm", g0, "Housing nominal − the three nominal lengths."),
      partNum("tc", "Tolerance on C", "Largest ± tolerance you can allow on C, in mm", tc, "The smallest gap is the nominal gap minus every tolerance. Set that equal to the minimum gap and solve for C's tolerance."),
      partNum("max", "Max gap", "With that tolerance on C, the largest gap, in mm", g0 + th + A.t + B.t + tc, "Largest gap: the nominal gap plus every tolerance, including C's."),
    ],
    explanation: `Nominal gap = \`_housing - _a - _b - _c\` = ${nomTxt(H)} − ${nomTxt(A.L)} − ${nomTxt(B.L)} − ${nomTxt(C.L)} = **${mm(g0)} mm**.\n\nWorst-case smallest gap = ${mm(g0)} − ${mm(th)} − ${mm(A.t)} − ${mm(B.t)} − t = ${mm(gmin)}, so t = \`_housing - _a - _b - _c - _th - _ta - _tb - _gmin\` = **${mm(tc)} mm**.\n\nLargest gap = ${mm(g0)} + ${mm(th)} + ${mm(A.t)} + ${mm(B.t)} + ${mm(tc)} = **${mm(g0 + th + A.t + B.t + tc)} mm**.`,
    params: { kind, parts, H, th, gmin },
  };
}

function verifyStack(q, ans) {
  const p = q.params;
  const ps = p.parts;
  switch (p.kind) {
    case "tol": {
      // Max stack − nominal stack.
      const x = toUm(ans);
      return sum(ps.map((s) => s.L + s.t)) - sum(ps.map((s) => s.L)) === x;
    }
    case "maxlen": { const x = toUm(ans); return ps.reduce((r, s) => r - (s.L + s.t), x) === 0; }
    case "minlen": { const x = toUm(ans); return ps.reduce((r, s) => r - (s.L - s.t), x) === 0; }
    case "tolsum": {
      const nom = toUm(ans.nom), tol = toUm(ans.tol);
      return nom + tol === sum(ps.map((s) => s.L + s.t)) && nom - tol === sum(ps.map((s) => s.L - s.t));
    }
    case "gap": case "fitcheck": {
      const gmin = (p.H - p.th) - sum(ps.map((s) => s.L + s.t));
      const gmax = (p.H + p.th) - sum(ps.map((s) => s.L - s.t));
      if (toUm(ans.min) !== gmin || toUm(ans.max) !== gmax) return false;
      if (p.kind === "gap") return 2 * toUm(ans.nom) === gmin + gmax;
      return ans.fit === (gmin >= 0 ? "Yes" : "No");
    }
    case "asym": {
      const { A, B, C } = p;
      // Nominal gap ± the spread of each deviation, built from deviations rather than limits.
      const g0 = A.L - B.L - C.L;
      return toUm(ans.max) === g0 + A.es - B.ei - C.ei && toUm(ans.min) === g0 + A.ei - B.es - C.es;
    }
    case "rss": {
      const wc = toUm(ans.wc), r = toUm(ans.rss);
      const S2 = sum(p.ts.map((t) => t * t));
      // r is the rounded root when (r − ½)² ≤ S2 ≤ (r + ½)², i.e. (2r − 1)² ≤ 4·S2 ≤ (2r + 1)².
      const rOk = Number.isInteger(r) && (2 * r - 1) ** 2 <= 4 * S2 && 4 * S2 <= (2 * r + 1) ** 2;
      const wcOk = wc === sum(p.ts);
      const want = wc <= p.G ? "Both methods" : S2 <= p.G * p.G ? "Only the RSS method" : "Neither method";
      return wcOk && rOk && ans.ok === want;
    }
    case "budget": {
      const t = toUm(ans.tc), nom = toUm(ans.nom), gmax = toUm(ans.max);
      const [A, B, C] = ps;
      const smallest = (p.H - p.th) - (A.L + A.t) - (B.L + B.t) - (C.L + t);
      const largest = (p.H + p.th) - (A.L - A.t) - (B.L - B.t) - (C.L - t);
      return t > 0 && smallest === p.gmin && largest === gmax && nom === p.H - A.L - B.L - C.L;
    }
    default: return false;
  }
}

// =====================================================================
// Measurement error
// =====================================================================
// [name, resolution in µm]
const HALF_TOOLS = [["steel rule", 500], ["vernier caliper", 20], ["micrometer", 10], ["dial indicator", 2]];

function genMeasure(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["abs", "half", "zero"]);
    if (kind === "abs") {
      const { G, m } = redraw(() => {
        const G = 1000 * rng.pick([5, 10, 15, 20, 25, 30, 50, 75, 100]) + rng.pick([0, 0, 500]);
        const e = rng.int(-40, 40);
        return e !== 0 ? { G, m: G + e } : null;
      });
      return {
        prompt: `A gauge block that is exactly **${mm(G)} mm** long is measured as **${mm(m)} mm**. What is the absolute error (the size of the difference), in mm? ${NOTE3}`,
        answerType: "number", answer: v(Math.abs(m - G)), tolerance: TOL,
        given: [{ label: "_true", value: v(G) }, { label: "_measured", value: v(m) }],
        explanation: `Absolute error = |measured − true| = \`abs(_measured - _true)\` = |${mm(m)} − ${mm(G)}| = **${mm(Math.abs(m - G))} mm**. The reading is ${m > G ? "too big" : "too small"}.`,
        hints: ["Absolute error is the difference between the measured value and the true value.", "Give its size only: no minus sign."],
        params: { kind, G, m },
      };
    }
    if (kind === "half") {
      const [tool, r] = rng.pick(HALF_TOOLS);
      return {
        prompt: `A ${tool} reads to **${mm(r)} mm** (its smallest division). Taking the reading uncertainty as half a division, what is the uncertainty (the ± value), in mm? ${NOTE3}`,
        answerType: "number", answer: v(r / 2), tolerance: TOL,
        given: [{ label: "_resolution", value: v(r) }],
        explanation: `Half a division: \`_resolution / 2\` = ${mm(r)} ÷ 2 = **± ${mm(r / 2)} mm**.`,
        hints: ["The true size could be up to half a division either side of the reading."],
        params: { kind, r },
      };
    }
    const { z, R } = redraw(() => {
      const z = rng.int(-8, 8), R = 1000 * rng.int(3, 24) + 10 * rng.int(0, 99);
      return z !== 0 ? { z, R } : null;
    });
    return {
      prompt: `With its jaws closed, a micrometer reads **${mm(z)} mm** instead of 0 (a zero error). It then reads **${mm(R)} mm** on a part. What is the corrected size, in mm? ${NOTE3}`,
      answerType: "number", answer: v(R - z), tolerance: TOL,
      given: [{ label: "_zero_error", value: v(z) }, { label: "_reading", value: v(R) }],
      explanation: `Every reading is off by the zero error, so subtract it: \`_reading - _zero_error\` = ${mm(R)} − ${sg(z)} = **${mm(R - z)} mm**.`,
      hints: ["A zero error is added to every reading the instrument makes.", z > 0 ? "The micrometer reads too high, so the real size is smaller than the reading." : "The micrometer reads too low, so the real size is bigger than the reading."],
      params: { kind, z, R },
    };
  }

  if (d === "medium") {
    const kind = rng.pick(["pct", "range", "offset"]);
    if (kind === "pct") {
      const { G, m, pct } = redraw(() => {
        const G = 1000 * rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 40, 50]), e = rng.int(-60, 60);
        if (e === 0) return null;
        const pct = (Math.abs(e) / G) * 100;
        return !isHalfStep(pct, 3, 1e-6) && pct >= 0.01 ? { G, m: G + e, pct } : null;
      });
      const ans = Math.round(pct * 1000) / 1000;
      return {
        prompt: `A gauge block that is exactly **${mm(G)} mm** long is measured as **${mm(m)} mm**. What is the percentage error? Round to 3 decimal places. Type the number without the % sign.`,
        answerType: "number", answer: ans, tolerance: 0.0005,
        given: [{ label: "_true", value: v(G) }, { label: "_measured", value: v(m) }],
        explanation: `Absolute error = |${mm(m)} − ${mm(G)}| = ${mm(Math.abs(m - G))} mm. Percentage error = \`abs(_measured - _true) / _true * 100\` = ${mm(Math.abs(m - G))} ÷ ${mm(G)} × 100 ≈ **${fmtNum(ans, 3)} %**.`,
        hints: ["Find the absolute error first: the size of measured − true.", "Divide it by the true value and multiply by 100."],
        params: { kind, G, m },
      };
    }
    if (kind === "range") {
      const [tool, r] = rng.pick(HALF_TOOLS.slice(1));
      const R = 1000 * rng.int(4, 60) + r * rng.int(0, Math.floor(999 / r));
      return {
        prompt: `A ${tool} that reads to **${mm(r)} mm** shows **${mm(R)} mm**. Taking the uncertainty as half a division, between which two sizes does the true size lie? Give each in mm to 3 decimal places.`,
        answerType: "multi",
        given: [{ label: "_reading", value: v(R) }, { label: "_resolution", value: v(r) }],
        parts: [
          partNum("lo", "Smallest", "Smallest possible true size, in mm", R - r / 2, "Half a division is the resolution ÷ 2. Take it off the reading."),
          partNum("hi", "Largest", "Largest possible true size, in mm", R + r / 2, "Add half a division to the reading."),
        ],
        explanation: `Half a division = \`_resolution / 2\` = ${mm(r / 2)} mm. So the true size is ${mm(R)} ± ${mm(r / 2)}: from **${mm(R - r / 2)} mm** to **${mm(R + r / 2)} mm**.`,
        params: { kind, R, r },
      };
    }
    const r = redraw(() => {
      const G = 1000 * rng.pick([10, 20, 25, 30, 50, 75, 100]), off = rng.int(-15, 15);
      const R = G + 1000 * rng.int(-6, 6) + rng.int(-300, 300);
      return off !== 0 && R !== G ? { G, Gr: G + off, off, R } : null;
    });
    const { G, Gr, off, R } = r;
    return {
      prompt: `To check a digital height gauge, it is used to measure a **${mm(G)} mm** gauge block and reads **${mm(Gr)} mm**. It then measures a part as **${mm(R)} mm**. Assume the same offset applies to every reading. Give each value in mm to 3 decimal places, with a minus sign if the offset is negative.`,
      answerType: "multi",
      given: [{ label: "_block", value: v(G) }, { label: "_block_read", value: v(Gr) }, { label: "_reading", value: v(R) }],
      parts: [
        partNum("off", "Offset", "Offset of the gauge (reading − true), in mm", off, "Offset = what it read on the gauge block − the block's true size."),
        partNum("size", "Corrected size", "Corrected size of the part, in mm", R - off, "Take the offset away from the part reading (minus a negative offset adds)."),
      ],
      explanation: `Offset = \`_block_read - _block\` = ${mm(Gr)} − ${mm(G)} = **${dev(off)} mm** (it reads ${off > 0 ? "high" : "low"}).\n\nCorrected size = \`_reading - (_block_read - _block)\` = ${mm(R)} − ${sg(off)} = **${mm(R - off)} mm**.`,
      params: { kind, G, Gr, R },
    };
  }

  if (d === "hard") {
    const kind = rng.pick(["pctunc", "repeat"]);
    if (kind === "pctunc") {
      const r0 = redraw(() => {
        const [tool, r] = rng.pick(HALF_TOOLS.slice(1));
        const R = 1000 * rng.int(1, 30) + r * rng.int(0, Math.floor(999 / r));
        if (R < 1000) return null;
        const pct = (r / 2 / R) * 100;
        return !isHalfStep(pct, 3, 1e-6) && pct >= 0.005 ? { tool, r, R, pct } : null;
      });
      const { tool, r, R, pct } = r0;
      const ans = Math.round(pct * 1000) / 1000;
      return {
        prompt: `A wire is measured with a ${tool} that reads to **${mm(r)} mm**, giving **${mm(R)} mm**. Take the uncertainty as half a division.`,
        answerType: "multi",
        given: [{ label: "_reading", value: v(R) }, { label: "_resolution", value: v(r) }],
        parts: [
          partNum("abs", "Uncertainty", "Absolute uncertainty (the ± value), in mm to 3 decimal places", r / 2, "Half a division = resolution ÷ 2."),
          { id: "pct", label: "% uncertainty", ask: "Percentage uncertainty, to 3 decimal places (without the % sign)", answerType: "number", answer: ans, tolerance: 0.0005, hint: "Divide the absolute uncertainty by the reading, then × 100." },
        ],
        explanation: `Absolute uncertainty = \`_resolution / 2\` = **± ${mm(r / 2)} mm**.\n\nPercentage uncertainty = \`_resolution / 2 / _reading * 100\` = ${mm(r / 2)} ÷ ${mm(R)} × 100 ≈ **${fmtNum(ans, 3)} %**. A small part measured with a coarse tool gives a large percentage uncertainty.`,
        params: { kind, r, R },
      };
    }
    const r0 = redraw(() => {
      const base = 1000 * rng.int(5, 50) + 10 * rng.int(0, 99);
      const rs = [];
      for (let i = 0; i < 5; i++) rs.push(base + rng.int(-12, 12));
      const lo = Math.min(...rs), hi = Math.max(...rs);
      return sum(rs) % 5 === 0 && (hi - lo) % 2 === 0 && hi > lo ? { rs, mean: sum(rs) / 5, spread: (hi - lo) / 2 } : null;
    });
    const { rs, mean, spread } = r0;
    return {
      prompt: `The same part is measured five times with a micrometer:\n\n${rs.map((x) => mm(x)).join(" mm, ")} mm\n\nReport the result as the mean ± half the range of the readings. Give each in mm to 3 decimal places.`,
      answerType: "multi",
      given: rs.map((x, i) => ({ label: `_r${i + 1}`, value: v(x) })),
      parts: [
        partNum("mean", "Mean", "Mean of the five readings, in mm", mean, "Add the five readings and divide by 5."),
        partNum("pm", "±", "Half the range (largest − smallest, ÷ 2), in mm", spread, "Find the largest and smallest readings, take the difference and halve it."),
      ],
      explanation: `Mean = \`(_r1 + _r2 + _r3 + _r4 + _r5) / 5\` = ${mm(sum(rs))} ÷ 5 = **${mm(mean)} mm**.\n\nRange = ${mm(Math.max(...rs))} − ${mm(Math.min(...rs))} = ${mm(2 * spread)} mm, so half the range is **± ${mm(spread)} mm**.\n\nResult: ${mm(mean)} ± ${mm(spread)} mm.`,
      params: { kind, rs },
    };
  }

  // expert: calibrate then decide with uncertainty, or pick an instrument by the 10:1 rule
  const kind = rng.pick(["decide", "choose"]);
  if (kind === "decide") {
    const DEC = ["Certainly in spec", "Certainly out of spec", "Cannot be sure"];
    const outcome = rng.pick(DEC);
    const r0 = redraw(() => {
      const N = rng.pick(NOMS), t = rng.pick([10, 15, 20, 25, 30, 40]);
      const [tool, res] = rng.pick([["micrometer", 10], ["dial indicator", 2], ["vernier caliper", 20]]);
      const u = res / 2;
      const G = 1000 * rng.pick([10, 20, 25, 50]), off = rng.int(-12, 12);
      if (off === 0) return null;
      const c = N + rng.int(-(t + 2 * u + 10), t + 2 * u + 10); // corrected size
      const L = N - t, U = N + t;
      if ([L - u, L + u, U - u, U + u].includes(c)) return null;
      const res2 = c - u > L && c + u < U ? DEC[0] : c + u < L || c - u > U ? DEC[1] : DEC[2];
      return res2 === outcome ? { N, t, tool, res, u, G, off, c } : null;
    });
    const { N, t, tool, res, u, G, off, c } = r0;
    const R = c + off, Gr = G + off;
    return {
      prompt: `A shaft is specified as **Ø${nomTxt(N)} ± ${mm(t)} mm**. A ${tool} (reading to ${mm(res)} mm, so ± ${mm(u)} mm uncertainty) reads a **${mm(G)} mm** gauge block as **${mm(Gr)} mm**, then reads the shaft as **${mm(R)} mm**. Give sizes in mm to 3 decimal places, with a minus sign if the offset is negative.`,
      answerType: "multi",
      given: [{ label: "_nominal", value: v(N) }, { label: "_tol", value: v(t) }, { label: "_block", value: v(G) }, { label: "_block_read", value: v(Gr) }, { label: "_reading", value: v(R) }, { label: "_unc", value: v(u) }],
      parts: [
        partNum("off", "Offset", "Offset of the instrument (reading − true), in mm", off, "Offset = gauge-block reading − its true size."),
        partNum("size", "Corrected size", "Corrected shaft size, in mm", c, "Take the offset away from the shaft reading."),
        partChoice("dec", "Decision", "Allowing for the ± uncertainty, what can you say?", outcome, rng.shuffle(DEC), "The true size could be anywhere in corrected size ± uncertainty. Is that whole range inside the limits, wholly outside, or across a limit?"),
      ],
      explanation: `Offset = \`_block_read - _block\` = ${mm(Gr)} − ${mm(G)} = **${dev(off)} mm**.\n\nCorrected size = \`_reading - (_block_read - _block)\` = ${mm(R)} − ${sg(off)} = **${mm(c)} mm**.\n\nWith ± ${mm(u)} mm the true size is between ${mm(c - u)} and ${mm(c + u)} mm. The limits are ${mm(N - t)} to ${mm(N + t)} mm, so: **${outcome}**.`,
      params: { kind, N, t, u, G, Gr, R },
    };
  }
  // Tools by resolution; uncertainty = half a division, in tenths of a µm.
  const TOOLS = [["Steel rule (0.5 mm)", 2500], ["Vernier caliper (0.02 mm)", 100], ["Micrometer (0.01 mm)", 50], ["Dial indicator (0.002 mm)", 10], ["Digital micrometer (0.001 mm)", 5]];
  const k = rng.int(0, TOOLS.length - 1);
  // Tolerance band T in µm: T/10 µm = T tenths of a µm, strictly between the chosen tool's
  // half-division and the next coarser tool's.
  const ranges = [[2600, 4000], [110, 400], [51, 99], [11, 49], [6, 9]];
  const T = k === 0 ? 100 * rng.int(26, 40) : k === 1 ? 10 * rng.int(11, 40) : rng.int(ranges[k][0], ranges[k][1]);
  const N = rng.pick(NOMS), ei = -5 * rng.int(0, Math.floor(T / 10));
  const L = N + ei, U = L + T;
  return {
    prompt: `A part must measure between **${mm(L)} mm** and **${mm(U)} mm**. The workshop rule is that an instrument's uncertainty (half its smallest division) must be no more than one tenth of the tolerance band. The cheapest instruments are the coarsest ones, and these are available: ${TOOLS.map((x) => x[0]).join(", ")}.`,
    answerType: "multi",
    given: [{ label: "_upper", value: v(U) }, { label: "_lower", value: v(L) }],
    parts: [
      { id: "umax", label: "Max uncertainty", ask: "Largest uncertainty the rule allows, in mm to 4 decimal places", answerType: "number", answer: T / 10000, tolerance: TOL, hint: "Tolerance band = upper − lower limit. The rule allows one tenth of it." },
      partChoice("tool", "Instrument", "Which is the coarsest instrument that meets the rule?", TOOLS[k][0], TOOLS.map((x) => x[0]), "Halve each instrument's division and keep only those at or below your maximum. Of those, pick the coarsest."),
    ],
    explanation: `Tolerance band = \`_upper - _lower\` = ${mm(U)} − ${mm(L)} = ${mm(T)} mm. One tenth of it is \`(_upper - _lower) / 10\` = **${mm4(T)} mm**.\n\nHalf a division: ${TOOLS.map((x) => `${x[0].replace(/ \(.*/, "")} ${mm4(x[1])}`).join(", ")} mm.\n\nThe coarsest one at or below ${mm4(T)} mm is the **${TOOLS[k][0]}**.`,
    params: { kind, L, U },
  };
}

function verifyMeasure(q, ans) {
  const p = q.params;
  switch (p.kind) {
    case "abs": { const x = toUm(ans); return x > 0 && (p.G + x === p.m || p.G - x === p.m); }
    case "half": { const x = toUm(ans); return 2 * x === p.r; }
    case "zero": { const x = toUm(ans); return x + p.z === p.R; }
    case "pct": {
      const x = toNum(ans);
      // x% of the true length is the error: |x/100 · G − |m − G|| within the rounding of x.
      return exactDp(x, 3) && Math.abs((x / 100) * p.G - Math.abs(p.m - p.G)) <= (0.0005 / 100) * p.G + 1e-9;
    }
    case "range": {
      const lo = toUm(ans.lo), hi = toUm(ans.hi);
      return lo + hi === 2 * p.R && hi - lo === p.r;
    }
    case "offset": {
      const off = toUm(ans.off), size = toUm(ans.size);
      return p.G + off === p.Gr && size + off === p.R;
    }
    case "pctunc": {
      const a = toUm(ans.abs), x = toNum(ans.pct);
      return 2 * a === p.r && exactDp(x, 3) && Math.abs((x / 100) * p.R - p.r / 2) <= (0.0005 / 100) * p.R + 1e-9;
    }
    case "repeat": {
      const mean = toUm(ans.mean), pm = toUm(ans.pm);
      const sorted = [...p.rs].sort((a, b) => a - b);
      // Deviations from the mean sum to zero; half-range from the sorted ends.
      return sum(p.rs.map((x) => x - mean)) === 0 && 2 * pm === sorted[4] - sorted[0];
    }
    case "decide": {
      const off = toUm(ans.off), c = toUm(ans.size);
      if (p.Gr - off !== p.G || p.R - off !== c) return false;
      const lo = c - p.u, hi = c + p.u, L = p.N - p.t, U = p.N + p.t;
      const want = lo >= L && hi <= U ? "Certainly in spec" : hi < L || lo > U ? "Certainly out of spec" : "Cannot be sure";
      return ans.dec === want;
    }
    case "choose": {
      const x = toNum(ans.umax);
      const T = p.U - p.L; // µm
      // x mm × 10 = T/1000 mm  ->  x · 10000 = T
      if (!exactDp(x, 4) || Math.abs(x * 10000 - T) > 1e-6) return false;
      const res = { "Steel rule (0.5 mm)": 500, "Vernier caliper (0.02 mm)": 20, "Micrometer (0.01 mm)": 10, "Dial indicator (0.002 mm)": 2, "Digital micrometer (0.001 mm)": 1 };
      const okTools = Object.entries(res).filter(([, r]) => (r / 2) * 10 <= T); // half-division ≤ T/10 µm
      if (!okTools.length) return false;
      const coarsest = okTools.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      return ans.tool === coarsest;
    }
    default: return false;
  }
}

// =====================================================================

const SUBTOPICS = { limits: genLimits, fits: genFits, "stack-up": genStack, measurement: genMeasure };
const VERIFIERS = { limits: verifyLimits, fits: verifyFits, "stack-up": verifyStack, measurement: verifyMeasure };

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
