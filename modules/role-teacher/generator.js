import { formulaMass, massList } from "../../js/lib/chem.js";

// Teacher role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question shows a student's worked answer as numbered steps. The first wrong step is the only
// mistake; later steps follow correctly from the step above them, even when that step is wrong.
// Hints and explanations use only values already drawn (no rng calls); verify() recomputes the true
// answer from the stated problem with closed forms and re-derives the first wrong step itself.
//
// Subtopics (Examiner = marking to a scheme, Tutor = diagnosing):
//   mark-equations   linear equations: a(x + b) - d = e, d - ax = e, taxi fare          (Examiner)
//   mark-fractions   fractions of a quantity, successive percentages, ratio shares      (Examiner)
//   diagnose-data    mean from a frequency table, speed with units, percentage change   (Tutor)
//   diagnose-moles   moles to product mass, concentration to mass, mass to concentration (Tutor)
// Tiers: medium = step + final (2 parts); hard = step, fix, final (3); expert = + marks under a
// stated scheme (4); expert-plus = step, final, error type | next step (segmented), marks (4).

// ---------- helpers ----------

function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
const r6 = (n) => roundTo(n, 6);
const N = (v) => { const x = r6(v); return (x < 0 ? "−" : "") + String(Math.abs(x)); };
const terminates = (v, dp = 4) => Number.isFinite(v) && Math.abs(v - roundTo(v, dp)) < 1e-9;
const same = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
const decimals = (v) => { const s = String(r6(v)); return s.includes(".") ? s.split(".")[1].length : 0; };
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;
const TRY = 20000;
const tooMany = () => { throw new Error("role-teacher: no suitable draw"); };
const TIER_IDS = ["medium", "hard", "expert", "expert-plus"];

// Error types, how each is told apart, and the next teaching step it points to.
const TYPES = {
  slip: "Arithmetic slip",
  op: "Wrong operation",
  base: "Wrong base or divisor",
  unit: "Unit error",
  sign: "Sign error",
};
const NEXT = {
  slip: "Check each line by substituting back",
  op: "Revisit which operation each step needs",
  base: "Ask what the whole is before dividing",
  unit: "Convert units before calculating",
  sign: "Practise negatives on a number line",
};
const TYPE_KEY = "Error types: **Arithmetic slip** (right operation, wrong value), **Wrong operation** (the wrong kind of operation: multiplying instead of dividing, adding instead of multiplying, or the reverse), **Sign error** (a sign the wrong way round: adding instead of subtracting or the reverse, a dropped minus sign, or a difference taken the wrong way round), **Wrong base or divisor** (the wrong whole or the wrong count), **Unit error** (a wrong unit conversion).";

// A step: d = the operation described, f = value from the earlier lines (array), st = the line's
// displayed state, alt = a wrong operation { d, f, type } or null.
const S = (d, f, st, alt = null) => ({ d, f, st, alt });

// ---------- templates (each returns the problem, its steps and closed-form facts) ----------

const money = (v) => "$" + N(v);

// A1: a(x + b) - d = e
function tEq1(rng) {
  const a = rng.int(2, 6), b = rng.int(1, 9), d = rng.int(2, 20), t = rng.int(1, 9);
  const e = a * (t + b) - d;
  return {
    kind: "eq1", p: { a, b, d, e },
    problem: `A student solves \`${a}(x + ${b}) − ${d} = ${N(e)}\`.`,
    steps: [
      S(`Add ${d} to both sides`, () => e + d, (v) => `${a}(x + ${b}) = ${N(v)}`, { d: `Subtract ${d} from both sides`, f: () => e - d, st: (v) => `${a}(x + ${b}) = ${N(v)}`, type: "sign" }),
      S(`Divide both sides by ${a}`, (v) => v[0] / a, (v) => `x + ${b} = ${N(v)}`, { d: `Multiply both sides by ${a}`, f: (v) => v[0] * a, st: (v) => `x + ${b} = ${N(v)}`, type: "op" }),
      S(`Subtract ${b} from both sides`, (v) => v[1] - b, (v) => `x = ${N(v)}`, { d: `Add ${b} to both sides`, f: (v) => v[1] + b, st: (v) => `x = ${N(v)}`, type: "sign" }),
    ],
    truth: t, finalAsk: "Correct value of x",
    finalHint: "Solve the equation yourself, then check it by substituting back into the original.",
    given: [["_a", a], ["_b", b], ["_d", d], ["_e", e]],
  };
}
// A2: d - a x = e
function tEq2(rng) {
  const a = rng.int(2, 9), d = rng.int(10, 40), t = rng.int(1, 9);
  const e = d - a * t;
  return {
    kind: "eq2", p: { a, d, e },
    problem: `A student solves \`${d} − ${a}x = ${e < 0 ? "−" + (-e) : e}\`.`,
    steps: [
      S(`Subtract ${d} from both sides`, () => e - d, (v) => `−${a}x = ${N(v)}`, { d: `Add ${d} to both sides`, f: () => e + d, st: (v) => `−${a}x = ${N(v)}`, type: "sign" }),
      S(`Divide both sides by −${a}`, (v) => v[0] / -a, (v) => `x = ${N(v)}`, { d: `Divide both sides by ${a}`, f: (v) => v[0] / a, st: (v) => `x = ${N(v)}`, type: "sign" }),
    ],
    truth: t, finalAsk: "Correct value of x",
    finalHint: "Isolate the x term, mind the sign of its coefficient, then substitute back to check.",
    given: [["_d", d], ["_a", a], ["_e", e]],
  };
}
// A3: taxi fare, return distance
function tTaxi(rng) {
  const f = rng.int(2, 8), r = rng.int(2, 6), k = rng.int(3, 20);
  const T = f + r * k;
  return {
    kind: "taxi", p: { f, r, T },
    problem: `A taxi charges a fixed fee of ${money(f)} plus ${money(r)} per km. A one-way fare is ${money(T)}. A student works out the total distance of a **round trip** (there and back by the same route).`,
    steps: [
      S(`Subtract the fixed fee ${money(f)} from the fare`, () => T - f, (v) => `${T} − ${f} = ${N(v)}`, { d: `Add the fixed fee ${money(f)} to the fare`, f: () => T + f, st: (v) => `${T} + ${f} = ${N(v)}`, type: "sign" }),
      S(`Divide by the rate ${money(r)} per km`, (v) => v[0] / r, (v, sh) => `${N(sh[0])} ÷ ${r} = ${N(v)}`, { d: `Multiply by the rate ${money(r)} per km`, f: (v) => v[0] * r, st: (v, sh) => `${N(sh[0])} × ${r} = ${N(v)}`, type: "op" }),
      S("Double the one-way distance for the round trip", (v) => 2 * v[1], (v, sh) => `2 × ${N(sh[1])} = ${N(v)}`, { d: "Halve the one-way distance for the round trip", f: (v) => v[1] / 2, st: (v, sh) => `${N(sh[1])} ÷ 2 = ${N(v)}`, type: "op" }),
    ],
    truth: (2 * k), finalAsk: "Round-trip distance (km)",
    finalHint: "Fare minus fixed fee is the distance charge; divide by the rate, then double.",
    given: [["_fee", f], ["_rate", r], ["_fare", T]],
  };
}
// B1: two fractions of N
const FR_PAIRS = [[4, 6], [6, 9], [4, 10], [6, 8], [10, 15], [8, 12], [6, 10], [9, 12]];
function tFr1(rng) {
  const [b, d] = rng.pick(FR_PAIRS);
  const L = lcm(b, d);
  const a = rng.int(1, b - 1), c = rng.int(1, d - 1), m = rng.int(1, 8);
  const Nn = L * m;
  if (a * d + c * b > b * d) return null; // the two pours must fit in the tank
  return {
    kind: "fr1", p: { a, b, c, d, L, Nn },
    problem: `An empty tank holds ${Nn} litres when full. Water is poured in: first \`${a}/${b}\` of the tank's capacity, then \`${c}/${d}\` of it. A student writes both fractions over the common denominator ${L}, then finds the litres in the tank.`,
    steps: [
      S(`Write ${a}/${b} as a fraction over ${L}`, () => (a * L) / b, (v) => `${a}/${b} = ${N(v)}/${L}`, { d: `Divide ${L} by ${b}, then add the numerator ${a}`, f: () => L / b + a, st: (v) => `${L} ÷ ${b} + ${a} = ${N(v)}`, type: "op" }),
      S(`Write ${c}/${d} as a fraction over ${L}`, () => (c * L) / d, (v) => `${c}/${d} = ${N(v)}/${L}`, { d: `Divide ${L} by ${d}, then add the numerator ${c}`, f: () => L / d + c, st: (v) => `${L} ÷ ${d} + ${c} = ${N(v)}`, type: "op" }),
      S(`Add the numerators and take that fraction of ${Nn} litres`, (v) => (Nn * (v[0] + v[1])) / L, (v, sh) => `${Nn} × (${N(sh[0])} + ${N(sh[1])}) ÷ ${L} = ${N(v)}`, { d: `Add the numerators, multiply by ${Nn} litres and divide by ${b} × ${d} = ${b * d}`, f: (v) => (Nn * (v[0] + v[1])) / (b * d), st: (v, sh) => `${Nn} × (${N(sh[0])} + ${N(sh[1])}) ÷ ${b * d} = ${N(v)}`, type: "base" }),
    ],
    truth: Nn * (a / b + c / d), finalAsk: "Litres in the tank",
    finalHint: `Convert each fraction to ${L}ths, add them, then take that fraction of the tank.`,
    given: [["_a", a], ["_b", b], ["_c", c], ["_d", d], ["_L", L], ["_tank", Nn]],
  };
}
// B2: increase then decrease by percentages
function tPc1(rng) {
  const P = rng.pick([80, 100, 120, 140, 160, 180, 200, 240, 300, 400]);
  const r = rng.pick([10, 20, 25, 30, 40, 50]), s = rng.pick([10, 20, 25, 30, 40, 50]);
  return {
    kind: "pc1", p: { P, r, s },
    problem: `A price of ${money(P)} is increased by ${r}%, and the new price is then reduced by ${s}%. A student finds the overall change in price.`,
    steps: [
      S(`Increase the price by ${r}%`, () => (P * (100 + r)) / 100, (v) => `${P} × ${(100 + r) / 100} = ${N(v)}`, { d: `Add ${r} to the price`, f: () => P + r, st: (v) => `${P} + ${r} = ${N(v)}`, type: "op" }),
      S(`Reduce that new price by ${s}%`, (v) => (v[0] * (100 - s)) / 100, (v, sh) => `${N(sh[0])} × ${(100 - s) / 100} = ${N(v)}`, { d: `Reduce the original price ${money(P)} by ${s}%`, f: () => (P * (100 - s)) / 100, st: (v) => `${P} × ${(100 - s) / 100} = ${N(v)}`, type: "base" }),
      S("Overall change: final price minus original price", (v) => v[1] - P, (v, sh) => `${N(sh[1])} − ${P} = ${N(v)}`, { d: "Overall change: original price minus final price", f: (v) => P - v[1], st: (v, sh) => `${P} − ${N(sh[1])} = ${N(v)}`, type: "sign" }),
    ],
    truth: (P * (100 + r) * (100 - s)) / 10000 - P, finalAsk: "Overall change in price ($, negative for a fall)",
    finalHint: "Apply the second percentage to the price after the first change, not to the original.",
    given: [["_price", P], ["_up", r], ["_down", s]],
  };
}
// B3: ratio share
function tRa1(rng) {
  const a = rng.int(1, 6), b = rng.int(1, 6), c = rng.int(1, 6);
  const S0 = a + b + c, u = rng.int(2, 20);
  const T = S0 * u, mx = Math.max(a, b, c), mn = Math.min(a, b, c);
  const top2 = a + b + c - mn;
  return {
    kind: "ra1", p: { T, a, b, c },
    problem: `${money(T)} is shared in the ratio ${a} : ${b} : ${c}. A student finds the **largest** share.`,
    steps: [
      S("Add the ratio numbers to get the number of parts", () => S0, (v) => `${a} + ${b} + ${c} = ${N(v)}`, { d: "Add the two largest ratio numbers", f: () => top2, st: (v) => `${[a, b, c].sort((p, q) => q - p).slice(0, 2).join(" + ")} = ${N(v)}`, type: "base" }),
      S(`Divide ${money(T)} by the number of parts`, (v) => T / v[0], (v, sh) => `${T} ÷ ${N(sh[0])} = ${N(v)}`, { d: `Divide ${money(T)} by 3, the number of ratio terms`, f: () => T / 3, st: (v) => `${T} ÷ 3 = ${N(v)}`, type: "base" }),
      S("Multiply the value of one part by the largest ratio number", (v) => v[1] * mx, (v, sh) => `${N(sh[1])} × ${mx} = ${N(v)}`, { d: "Divide the value of one part by the largest ratio number", f: (v) => v[1] / mx, st: (v, sh) => `${N(sh[1])} ÷ ${mx} = ${N(v)}`, type: "op" }),
    ],
    truth: u * mx, finalAsk: "The largest share ($)",
    finalHint: "Work out what one part is worth, then scale it to the biggest ratio number.",
    given: [["_total", T], ["_a", a], ["_b", b], ["_c", c]],
  };
}
// C1: mean from a frequency table
function tMe1(rng) {
  const k = 4;
  const start = rng.int(0, 4);
  const xs = [start];
  for (let i = 1; i < k; i++) xs.push(xs[i - 1] + rng.int(1, 2)); // distinct, increasing values
  const fs = xs.map(() => rng.int(2, 9));
  const n = sum(fs), tot = sum(xs.map((x, i) => x * fs[i]));
  return {
    kind: "me1", p: { xs, fs },
    problem: `A survey asked how many books each student read last month. Values \`x = ${xs.join(", ")}\` had frequencies \`f = ${fs.join(", ")}\`. A student finds the mean.`,
    steps: [
      S("Add the frequencies to get the number of students", () => n, (v) => `${fs.join(" + ")} = ${N(v)}`, { d: `Count the rows in the table (${k})`, f: () => k, st: (v) => `${N(v)} rows counted`, type: "base" }),
      S("Add up frequency × value for each row", () => tot, (v) => `${xs.map((x, i) => `${fs[i]}×${x}`).join(" + ")} = ${N(v)}`, { d: "Add up frequency + value for each row", f: () => n + sum(xs), st: (v) => `${fs.map((fq, i) => `${fq}+${xs[i]}`).join(" + ")} = ${N(v)}`, type: "op" }),
      S("Mean = total ÷ number of students", (v) => v[1] / v[0], (v, sh) => `${N(sh[1])} ÷ ${N(sh[0])} = ${N(v)}`, { d: `Mean = total ÷ number of rows (${k})`, f: (v) => v[1] / k, st: (v, sh) => `${N(sh[1])} ÷ ${k} = ${N(v)}`, type: "base" }),
    ],
    truth: tot / n, finalAsk: "Correct mean number of books",
    finalHint: "Multiply each value by its frequency, add, then divide by the total frequency.",
    given: [["_f1", fs[0]], ["_f2", fs[1]], ["_f3", fs[2]], ["_f4", fs[3]], ["_x1", xs[0]], ["_x2", xs[1]], ["_x3", xs[2]], ["_x4", xs[3]]],
  };
}
// C2: speed in km/h from metres and minutes
function tSp1(rng) {
  const T = rng.pick([6, 12, 15, 24, 30, 36, 45]);
  const s = rng.int(8, 36);
  const D = (1000 * s * T) / 60;
  if (!Number.isInteger(D)) return null;
  return {
    kind: "sp1", p: { D, T },
    problem: `A cyclist rides ${D} metres in ${T} minutes. A student finds the speed in **km/h**.`,
    steps: [
      S("Convert the distance to kilometres (÷ 1000)", () => D / 1000, (v) => `${D} ÷ 1000 = ${N(v)} km`, { d: "Convert the distance to kilometres (÷ 100)", f: () => D / 100, st: (v) => `${D} ÷ 100 = ${N(v)} km`, type: "unit" }),
      S("Convert the time to hours (÷ 60)", () => T / 60, (v) => `${T} ÷ 60 = ${N(v)} h`, { d: "Convert the time to hours (÷ 100)", f: () => T / 100, st: (v) => `${T} ÷ 100 = ${N(v)} h`, type: "unit" }),
      S("Speed = distance ÷ time", (v) => v[0] / v[1], (v, sh) => `${N(sh[0])} ÷ ${N(sh[1])} = ${N(v)} km/h`, { d: "Speed = distance × time", f: (v) => v[0] * v[1], st: (v, sh) => `${N(sh[0])} × ${N(sh[1])} = ${N(v)} km/h`, type: "op" }),
    ],
    truth: s, finalAsk: "Correct speed (km/h)",
    finalHint: "Put distance in km and time in hours before dividing.",
    given: [["_metres", D], ["_mins", T]],
  };
}
// C3: percentage change
function tPc2(rng) {
  const x = rng.pick([20, 25, 40, 50, 80, 125, 200, 250]);
  const pct = rng.pick([-40, -30, -25, -20, -15, -10, -5, 5, 10, 15, 20, 25, 30, 40, 50]);
  const y = (x * (100 + pct)) / 100;
  if (!Number.isInteger(y) || y < 1) return null;
  return {
    kind: "pc2", p: { x, y },
    problem: `A shop sold ${x} items on Monday and ${y} on Tuesday. A student finds the percentage change from Monday to Tuesday.`,
    steps: [
      S("Change = Tuesday − Monday", () => y - x, (v) => `${y} − ${x} = ${N(v)}`, { d: "Change = Monday − Tuesday", f: () => x - y, st: (v) => `${x} − ${y} = ${N(v)}`, type: "sign" }),
      S("Divide the change by Monday's value", (v) => v[0] / x, (v, sh) => `${N(sh[0])} ÷ ${x} = ${N(v)}`, { d: "Divide the change by Tuesday's value", f: (v) => v[0] / y, st: (v, sh) => `${N(sh[0])} ÷ ${y} = ${N(v)}`, type: "base" }),
      S("Multiply by 100 to get a percentage", (v) => v[1] * 100, (v, sh) => `${N(sh[1])} × 100 = ${N(v)}%`),
    ],
    truth: ((y - x) / x) * 100, finalAsk: "Percentage change (%, negative for a fall)",
    finalHint: "Percentage change is the change divided by the starting value, times 100.",
    given: [["_mon", x], ["_tue", y]],
  };
}
// D: mole templates
const REACTIONS = [
  { react: "CaCO3", prod: "CaO", k: 1, eq: "CaCO₃ → CaO + CO₂", nr: "CaCO₃", np: "CaO" },
  { react: "Mg", prod: "MgO", k: 1, eq: "2 Mg + O₂ → 2 MgO", nr: "Mg", np: "MgO" },
  { react: "Fe2O3", prod: "Fe", k: 2, eq: "Fe₂O₃ + 3 CO → 2 Fe + 3 CO₂", nr: "Fe₂O₃", np: "Fe" },
  { react: "N2", prod: "NH3", k: 2, eq: "N₂ + 3 H₂ → 2 NH₃", nr: "N₂", np: "NH₃" },
];
function tMo1(rng) {
  const R = rng.pick(REACTIONS);
  const Mr = formulaMass(R.react), Mp = formulaMass(R.prod);
  const q = rng.int(2, 40) / 20;
  const m = r6(q * Mr);
  return {
    kind: "mo1", p: { react: R.react, prod: R.prod, k: R.k, m },
    problem: `${m} g of ${R.nr} reacts: ${R.eq}. Relative atomic masses: ${massList([R.react, R.prod])}. A student finds the mass of ${R.np} formed, assuming the reaction goes to completion.`,
    steps: [
      S(`Moles of ${R.nr} = mass ÷ molar mass (${Mr})`, () => m / Mr, (v) => `${m} ÷ ${Mr} = ${N(v)} mol`, { d: `Moles of ${R.nr} = mass × molar mass (${Mr})`, f: () => m * Mr, st: (v) => `${m} × ${Mr} = ${N(v)} mol`, type: "op" }),
      S(`Moles of ${R.np} = ${R.k} × moles of ${R.nr} (from the equation)`, (v) => R.k * v[0], (v, sh) => `${R.k} × ${N(sh[0])} = ${N(v)} mol`, R.k === 1 ? null : { d: `Moles of ${R.np} = moles of ${R.nr} ÷ ${R.k}`, f: (v) => v[0] / R.k, st: (v, sh) => `${N(sh[0])} ÷ ${R.k} = ${N(v)} mol`, type: "op" }),
      S(`Mass of ${R.np} = moles × molar mass (${Mp})`, (v) => v[1] * Mp, (v, sh) => `${N(sh[1])} × ${Mp} = ${N(v)} g`, { d: `Mass of ${R.np} = moles ÷ molar mass (${Mp})`, f: (v) => v[1] / Mp, st: (v, sh) => `${N(sh[1])} ÷ ${Mp} = ${N(v)} g`, type: "op" }),
    ],
    truth: (m / Mr) * R.k * Mp, finalAsk: `Correct mass of ${R.np} (g)`,
    finalHint: "Mass to moles, moles through the equation's ratio, then moles back to mass.",
    given: [["_mass", m], ["_Mr", Mr], ["_Mp", Mp], ["_ratio", R.k]],
  };
}
const SOLUTES = [["NaOH", "NaOH"], ["KOH", "KOH"], ["NaCl", "NaCl"], ["HCl", "HCl"]];
function tMo2(rng) {
  const [f, name] = rng.pick(SOLUTES);
  const Mr = formulaMass(f);
  const c = rng.pick([0.1, 0.2, 0.25, 0.5, 1, 2]), V = rng.pick([20, 25, 40, 50, 100, 200, 250, 500]);
  return {
    kind: "mo2", p: { f, c, V },
    problem: `A solution of ${name} has concentration ${c} mol/dm³. A student finds the mass of ${name} in ${V} cm³ of it. Relative atomic masses: ${massList([f])}.`,
    steps: [
      S("Convert the volume to dm³ (÷ 1000)", () => V / 1000, (v) => `${V} ÷ 1000 = ${N(v)} dm³`, { d: "Convert the volume to dm³ (÷ 100)", f: () => V / 100, st: (v) => `${V} ÷ 100 = ${N(v)} dm³`, type: "unit" }),
      S("Moles = concentration × volume (dm³)", (v) => c * v[0], (v, sh) => `${c} × ${N(sh[0])} = ${N(v)} mol`, { d: "Moles = concentration ÷ volume (dm³)", f: (v) => c / v[0], st: (v, sh) => `${c} ÷ ${N(sh[0])} = ${N(v)} mol`, type: "op" }),
      S(`Mass = moles × molar mass (${Mr})`, (v) => v[1] * Mr, (v, sh) => `${N(sh[1])} × ${Mr} = ${N(v)} g`, { d: `Mass = moles ÷ molar mass (${Mr})`, f: (v) => v[1] / Mr, st: (v, sh) => `${N(sh[1])} ÷ ${Mr} = ${N(v)} g`, type: "op" }),
    ],
    truth: c * (V / 1000) * Mr, finalAsk: `Correct mass of ${name} (g)`,
    finalHint: "Volume in dm³ first, then moles = c × V, then mass = moles × molar mass.",
    given: [["_c", c], ["_V", V], ["_Mr", Mr]],
  };
}
function tMo3(rng) {
  const [f, name] = rng.pick(SOLUTES);
  const Mr = formulaMass(f);
  const q = rng.pick([0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5]), V = rng.pick([50, 100, 250, 500]);
  const m = r6(q * Mr);
  return {
    kind: "mo3", p: { f, m, V },
    problem: `${m} g of ${name} is dissolved to make ${V} cm³ of solution. A student finds its concentration in mol/dm³. Relative atomic masses: ${massList([f])}.`,
    steps: [
      S(`Moles = mass ÷ molar mass (${Mr})`, () => m / Mr, (v) => `${m} ÷ ${Mr} = ${N(v)} mol`, { d: `Moles = mass × molar mass (${Mr})`, f: () => m * Mr, st: (v) => `${m} × ${Mr} = ${N(v)} mol`, type: "op" }),
      S("Convert the volume to dm³ (÷ 1000)", () => V / 1000, (v) => `${V} ÷ 1000 = ${N(v)} dm³`, { d: "Convert the volume to dm³ (÷ 100)", f: () => V / 100, st: (v) => `${V} ÷ 100 = ${N(v)} dm³`, type: "unit" }),
      S("Concentration = moles ÷ volume (dm³)", (v) => v[0] / v[1], (v, sh) => `${N(sh[0])} ÷ ${N(sh[1])} = ${N(v)} mol/dm³`, { d: "Concentration = moles × volume (dm³)", f: (v) => v[0] * v[1], st: (v, sh) => `${N(sh[0])} × ${N(sh[1])} = ${N(v)} mol/dm³`, type: "op" }),
    ],
    truth: m / Mr / (V / 1000), finalAsk: "Correct concentration (mol/dm³)",
    finalHint: "Find the moles, put the volume in dm³, then divide moles by volume.",
    given: [["_mass", m], ["_Mr", Mr], ["_V", V]],
  };
}

const TEMPLATES = {
  "mark-equations": [tEq1, tEq2, tTaxi],
  "mark-fractions": [tFr1, tPc1, tRa1],
  "diagnose-data": [tMe1, tSp1, tPc2],
  "diagnose-moles": [tMo1, tMo2, tMo3],
};

// ---------- composing a question ----------

// Right value of every step when each is computed from the earlier lines as written.
function chain(steps, shown) {
  return steps.map((s, k) => s.f(shown.slice(0, k)));
}
const tolFor = (v) => 0;
function numPart(id, label, ask, val, hint) {
  const x = r6(val);
  const note = Number.isInteger(x) ? "whole number" : "exact value, no rounding needed";
  return { id, label, ask: `${ask} (${note})`, answerType: "number", answer: x, tolerance: tolFor(x), hint };
}
const slipOf = (rng, v) => {
  const g = 10 ** -decimals(v);
  for (let i = 0; i < 20; i++) {
    const nv = r6(v + rng.pick([-10, -2, -1, 1, 2, 10]) * g);
    if (nv !== v && nv !== -v && (v <= 0 || nv > 0)) return nv;
  }
  return r6(v + g);
};

function compose(rng, tier, subtopic) {
  const list = TEMPLATES[subtopic];
  if (!list) throw new Error(`Unknown subtopic: ${subtopic}`);
  for (let i = 0; i < TRY; i++) {
    const T = rng.pick(list)(rng);
    if (!T) continue;
    const n = T.steps.length;
    // True chain: every line from the true earlier lines, matching the closed form.
    const truthVals = [];
    for (let k = 0; k < n; k++) truthVals.push(T.steps[k].f(truthVals));
    if (!same(truthVals[n - 1], T.truth) || !truthVals.every((v) => terminates(v) && Math.abs(v) < 1e6 && v !== 0)) continue;
    // Where the mistake happens, and what kind it is.
    const variants = T.steps.flatMap((s, k) => [{ k, type: "slip" }, ...(s.alt ? [{ k, type: s.alt.type, alt: s.alt }] : [])]);
    // Expert+ grades the error type, so it leans away from slips (otherwise the most common answer).
    let V;
    if (tier === "expert-plus") {
      const alts = variants.filter((x) => x.type !== "slip");
      V = alts.length && rng.next() < 0.7 ? rng.pick(alts) : rng.pick(variants.filter((x) => x.type === "slip"));
    } else V = rng.pick(variants);
    const w = V.k;
    const delta = V.type === "slip" ? slipOf(rng, truthVals[w]) : null;
    const shown = [];
    const descs = [];
    for (let k = 0; k < n; k++) {
      const right = T.steps[k].f(shown);
      let v = right;
      let d = T.steps[k].d;
      if (k === w) {
        if (V.alt) { v = V.alt.f(shown); d = V.alt.d; } else v = delta;
      }
      shown.push(r6(v));
      descs.push(d);
    }
    if (!shown.every((v) => terminates(v) && Number.isFinite(v) && Math.abs(v) < 1e6)) continue;
    const rights = chain(T.steps, shown).map(r6);
    if (same(rights[w], shown[w])) continue;
    if (same(shown[n - 1], T.truth)) continue;
    if (shown.some((v, k) => k !== w && !same(v, rights[k]))) continue;
    if (shown.some((v) => v === 0)) continue;
    const typeKey = V.type;
    // Marks.
    const wts = T.steps.map(() => rng.int(1, 2));
    const fa = rng.int(1, 2);
    const ma = T.steps.map(() => rng.int(1, 2));
    const aa = T.steps.map(() => rng.int(1, 2));
    const ft = rng.next() < 0.5;
    let marks, total, scheme;
    if (tier === "expert") {
      total = sum(wts) + fa;
      marks = ft ? sum(wts) - wts[w] : sum(wts.slice(0, w));
      scheme = `**Mark scheme:** ${T.steps.map((_, k) => `Step ${k + 1} is worth ${wts[k]} mark${wts[k] > 1 ? "s" : ""}`).join(", ")}; the final answer is worth ${fa} mark${fa > 1 ? "s" : ""} (${total} in all). ` +
        (ft ? "**Follow-through is allowed:** a line earns its marks if it follows correctly from the line above it, even when that line is wrong. The final answer earns its marks only if it is correct."
            : "**No follow-through:** a wrong line earns nothing, and neither does any line after it. The final answer earns its marks only if it is correct.");
    } else if (tier === "expert-plus") {
      total = sum(ma) + sum(aa) + 1;
      marks = sum(ma) + sum(aa) - aa[w] - (typeKey === "slip" ? 0 : ma[w]);
      scheme = `**Mark scheme:** each line is marked for its method (M) and its value (A): ${T.steps.map((_, k) => `Step ${k + 1} M${ma[k]} A${aa[k]}`).join(", ")}, plus B1 for a correct final answer (${total} in all). ` +
        "**Follow-through is allowed:** a later line earns its marks if it follows correctly from the line above it, even when that line is wrong. A line whose method is right but whose value is wrong (an arithmetic slip) keeps its M marks and loses its A marks. A line with any other kind of error loses both.";
    }
    return { T, w, shown, descs, rights, truthVals, typeKey, wts, fa, ma, aa, ft, marks, total, scheme };
  }
  return tooMany();
}

// Choice options for the diagnosis part: error type | next step.
function diagOptions(rng, typeKey) {
  const answer = [TYPES[typeKey], NEXT[typeKey]];
  // Ticket 022: every option is a coherent pair (a type with its own next step), so no value repeats, the
  // wrong options differ from the answer in both columns, and nothing gives the answer away by counting or fit.
  const others = Object.keys(TYPES).filter((t) => t !== typeKey);
  const opts = [answer, ...others.map((t) => [TYPES[t], NEXT[t]])];
  return { answer, choices: rng.shuffle(opts) };
}

// A line with a wrong operation shows the student's working for that operation (its alt.st).
function altLine(T, s, d, v, shown) {
  return d === s.d ? s.st(v, shown) : s.alt.st(v, shown);
}

function build(rng, subtopic, tier) {
  const C = compose(rng, tier, subtopic);
  const { T, w, shown, descs, rights, truthVals, typeKey } = C;
  const n = T.steps.length;
  const stepLabels = T.steps.map((_, k) => `Step ${k + 1}`);
  const shownLines = T.steps.map((s, k) => `**Step ${k + 1}.** ${descs[k]}: \`${altLine(T, s, descs[k], shown[k], shown)}\``);
  const intro = `${T.problem} The student's working is below. The first wrong step is the only mistake: every later step follows correctly from the step above it, even when that step is wrong.`;
  const body = shownLines.join("\n\n");
  const extra = [];
  if (tier === "expert-plus") extra.push(TYPE_KEY);
  if (C.scheme) extra.push(C.scheme);
  const prompt = [intro, body, ...extra].join("\n\n");

  const parts = [{
    id: "step", label: "First wrong step", ask: "Which step contains the first mistake?", answerType: "choice",
    answer: stepLabels[w], choices: stepLabels,
    hint: "Redo each line from the line above it, as the student wrote it. The first line that does not follow is the mistake.",
  }];
  const fix = numPart("fix", "Corrected value", "What should the value at the end of that step be?", rights[w],
    "Redo only that step, starting from the line above it (which is right).");
  const fin = numPart("final", "Right answer", T.finalAsk, T.truth, T.finalHint);
  const marksPart = numPart("marks", "Marks awarded", `Marks awarded to this student, out of ${C.total}`, C.marks,
    tier === "expert"
      ? (C.ft ? "Follow-through is allowed, so only the wrong line loses its marks, and the final answer earns nothing." : "With no follow-through, the wrong line and every later line earn nothing.")
      : "Decide whether the mistake is a slip or another kind of error first: that tells you which marks the wrong line keeps. Later lines follow through.");
  let diag = null;
  if (tier === "expert-plus") {
    const { answer, choices } = diagOptions(rng, typeKey);
    diag = {
      id: "diag", label: "Diagnosis", ask: "What kind of error is it, and what should the student practise next?", answerType: "choice",
      choiceCols: ["Error type", "Next step"], choices, answer,
      hint: "Compare the operation the student wrote with the one the line needed, and check whether the value matches what they wrote.",
    };
  }
  if (tier === "medium") parts.push(fin);
  else if (tier === "hard") parts.push(fix, fin);
  else if (tier === "expert") parts.push(fix, fin, marksPart);
  else parts.push(fin, diag, marksPart);

  const exp = [];
  exp.push(`Redo each line from the line above it: ${rights.map((v, k) => `Step ${k + 1} should be ${N(v)}${k === w ? "" : " (it is)"}`).join("; ")}.`);
  exp.push(`The first line that does not follow is **Step ${w + 1}**: it should be **${N(rights[w])}**, not ${N(shown[w])}. ${typeKey === "slip" ? "The method is right but the value is wrong, so it is an arithmetic slip." : `The student wrote "${descs[w]}" instead of "${T.steps[w].d}": ${TYPES[typeKey].toLowerCase()}.`}`);
  exp.push(`Carrying on correctly gives the right answer, **${N(T.truth)}**.`);
  if (tier === "expert") exp.push(`Marks: ${C.ft ? `follow-through gives every line its marks except Step ${w + 1}, and the final answer is wrong: ${sum(C.wts)} − ${C.wts[w]} = **${C.marks}** out of ${C.total}.` : `no follow-through: only the lines before Step ${w + 1} count, ${C.wts.slice(0, w).join(" + ") || "0"} = **${C.marks}** out of ${C.total}.`}`);
  if (tier === "expert-plus") {
    exp.push(`Diagnosis: **${TYPES[typeKey]}**, so the next step is "${NEXT[typeKey]}".`);
    exp.push(`Marks: every line earns M + A (${sum(C.ma) + sum(C.aa)} in all) except Step ${w + 1}, which ${typeKey === "slip" ? `keeps its M${C.ma[w]} and loses A${C.aa[w]}` : `loses M${C.ma[w]} and A${C.aa[w]}`}; B1 is lost. ${sum(C.ma) + sum(C.aa)} − ${typeKey === "slip" ? C.aa[w] : C.ma[w] + C.aa[w]} = **${C.marks}** out of ${C.total}.`);
  }

  const dps = {};
  return {
    prompt,
    answerType: "multi",
    parts,
    explanation: exp.join("\n\n"),
    params: {
      kind: T.kind, tier, p: T.p, shown, descs, rightDescs: T.steps.map((s) => s.d), w, typeKey,
      wts: C.wts, fa: C.fa, ma: C.ma, aa: C.aa, ft: C.ft, total: C.total, dps,
    },
    given: givenRows(T.given),
    hints: [
      "Work through the steps in order and redo each one yourself from the line above.",
      "Only one line is wrong. Lines after it look odd but are consistent with it.",
    ],
  };
}
export function generate({ subtopic, difficulty, rng }) {
  if (!TIER_IDS.includes(difficulty)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  return build(rng, subtopic, difficulty);
}

// ---------- independent verification ----------
// Closed forms, written separately from the step functions above. `follow(k, s)` is the value line k
// must have given the lines s[0..k-1] as the student wrote them; `truth` is the right final answer.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (a, id) => (a && typeof a === "object" ? num(a[id]) : NaN);
const partStr = (a, id) => {
  const v = a && typeof a === "object" ? a[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const nearV = (c, t) => Number.isFinite(c) && Math.abs(c - t) <= 1e-7 * Math.max(1, Math.abs(t));

function model(p) {
  const q = p.p;
  switch (p.kind) {
    case "eq1": return { follow: (k, s) => [q.e + q.d, s[0] / q.a, s[1] - q.b][k], truth: (q.e + q.d) / q.a - q.b };
    case "eq2": return { follow: (k, s) => [q.e - q.d, -s[0] / q.a][k], truth: (q.d - q.e) / q.a };
    case "taxi": return { follow: (k, s) => [q.T - q.f, s[0] / q.r, s[1] + s[1]][k], truth: (2 * (q.T - q.f)) / q.r };
    case "fr1": return { follow: (k, s) => [(q.a * q.L) / q.b, (q.c * q.L) / q.d, (q.Nn / q.L) * (s[0] + s[1])][k], truth: q.Nn * (q.a / q.b + q.c / q.d) };
    case "pc1": return { follow: (k, s) => [(q.P * (100 + q.r)) / 100, s[0] * (1 - q.s / 100), s[1] - q.P][k], truth: q.P * (1 + q.r / 100) * (1 - q.s / 100) - q.P };
    case "ra1": return { follow: (k, s) => [q.a + q.b + q.c, q.T / s[0], s[1] * Math.max(q.a, q.b, q.c)][k], truth: (q.T / (q.a + q.b + q.c)) * Math.max(q.a, q.b, q.c) };
    case "me1": {
      const nn = sum(q.fs), tt = q.xs.reduce((a, x, i) => a + x * q.fs[i], 0);
      return { follow: (k, s) => [nn, tt, s[1] / s[0]][k], truth: tt / nn };
    }
    case "sp1": return { follow: (k, s) => [q.D / 1000, q.T / 60, s[0] / s[1]][k], truth: (q.D / 1000) / (q.T / 60) };
    case "pc2": return { follow: (k, s) => [q.y - q.x, s[0] / q.x, s[1] * 100][k], truth: (100 * (q.y - q.x)) / q.x };
    case "mo1": {
      const Mr = formulaMass(q.react), Mp = formulaMass(q.prod);
      return { follow: (k, s) => [q.m / Mr, q.k * s[0], s[1] * Mp][k], truth: (q.m * q.k * Mp) / Mr };
    }
    case "mo2": {
      const Mr = formulaMass(q.f);
      return { follow: (k, s) => [q.V / 1000, q.c * s[0], s[1] * Mr][k], truth: (q.c * q.V * Mr) / 1000 };
    }
    case "mo3": {
      const Mr = formulaMass(q.f);
      return { follow: (k, s) => [q.m / Mr, q.V / 1000, s[0] / s[1]][k], truth: (q.m / Mr) * (1000 / q.V) };
    }
    default: return null;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !Array.isArray(p.shown)) return false;
  const parts = question.parts;
  if (!Array.isArray(parts)) return false;
  const M = model(p);
  if (!M) return false;
  const s = p.shown;
  const n = s.length;
  // The first wrong line, found again from the lines as written.
  const bad = [];
  for (let k = 0; k < n; k++) if (!nearV(s[k], M.follow(k, s))) bad.push(k);
  if (bad.length !== 1 || bad[0] !== p.w || nearV(s[n - 1], M.truth)) return false;
  const w = bad[0];
  const has = (id) => parts.some((x) => x.id === id);
  const stepPart = parts.find((x) => x.id === "step");
  if (!stepPart || stepPart.choices.filter((c) => c === `Step ${w + 1}`).length !== 1 || partStr(answer, "step") !== `Step ${w + 1}`) return false;
  if (!nearV(partNum(answer, "final"), M.truth)) return false;
  if (has("fix") && !nearV(partNum(answer, "fix"), M.follow(w, s))) return false;
  // Error type: a slip keeps the stated operation; any other error changed it.
  const slip = p.descs[w] === p.rightDescs[w];
  if (slip !== (p.typeKey === "slip")) return false;
  if (has("diag")) {
    const want = `${TYPES[p.typeKey]} | ${NEXT[p.typeKey]}`;
    if (partStr(answer, "diag") !== want) return false;
  }
  if (has("marks")) {
    let m;
    if (p.tier === "expert") m = p.ft ? p.wts.reduce((a, x, k) => a + (k === w ? 0 : x), 0) : p.wts.slice(0, w).reduce((a, x) => a + x, 0);
    else m = s.reduce((a, _, k) => a + (k === w ? (slip ? p.ma[k] : 0) : p.ma[k] + p.aa[k]), 0);
    if (partNum(answer, "marks") !== m) return false;
  }
  return true;
}
