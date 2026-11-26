import { formulaMass, massList, ar } from "../../js/lib/chem.js";

// Settings this module states in its prompts.
const R_GAS = 8.31; // J/(mol K)
const MOLAR_VOLUME_RTP = 24; // dm3/mol at RTP

// Chemist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   yield-purity   moles -> theoretical mass -> % yield; empirical formula; purity from product (Analytical)
//   titration      titre -> moles -> concentration -> dilution; purity of impure NaOH       (Analytical)
//   gas-vessel     moles of gas -> RTP volume -> vessel pressure -> safe?; max safe charge  (Industrial)
//   batch-cost     scale-up with yield -> reactant needed -> batch cost -> profit; plan choice (Industrial)

// ---------- helpers ----------

// Round half away from zero to d places; the 1e-9 nudge absorbs binary error.
function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// True when n sits within `margin` (in units of the last place) of a rounding half-step.
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fmt = (n, d = 4) => String(roundTo(n, d));
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };

function numPart(id, label, ask, val, dp, hint) {
  return { id: id.toLowerCase(), label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
// Every key in `dps` must be stable: computing each stage from the rounded earlier answers
// rounds to the same value, and nothing sits on a rounding half-step.
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
const pick = (st, keys, dps) => Object.fromEntries(keys.map((k) => [k, dps[k]]));
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
const TRY = 20000;
const tooMany = () => { throw new Error("role-chemist: no suitable draw"); };

// Reactions for yield and batch work: reactant -> one named product, k mol product per mol reactant.
// Molar masses and the stated atomic masses come from the shared chemistry library.
const mm = (f) => formulaMass(f);
const reaction = (react, prod, k, eq, notes) => ({ react, Mr: mm(react), prod, Mp: mm(prod), k, eq, ar: massList(notes) });
const REACTIONS = [
  reaction("CaCO₃", "CaO", 1, "CaCO₃ → CaO + CO₂", ["CaCO3", "CaO"]),
  reaction("Mg", "MgO", 1, "2 Mg + O₂ → 2 MgO", ["Mg", "MgO"]),
  reaction("Fe₂O₃", "Fe", 2, "Fe₂O₃ + 3 CO → 2 Fe + 3 CO₂", ["Fe2O3", "Fe", "CO"]),
  reaction("N₂", "NH₃", 2, "N₂ + 3 H₂ → 2 NH₃", ["N2", "NH3"]),
  reaction("Zn", "ZnCl₂", 1, "Zn + 2 HCl → ZnCl₂ + H₂", ["Zn", "ZnCl2", "HCl"]),
  reaction("Na", "NaCl", 1, "2 Na + Cl₂ → 2 NaCl", ["Na", "NaCl"]),
  reaction("H₂", "H₂O", 1, "2 H₂ + O₂ → 2 H₂O", ["H2", "H2O"]),
];
const RIDX = REACTIONS.map((_, i) => i);
const molWord = (k) => (k === 1 ? "1 mol" : `${k} mol`);

// ---------- yield-purity ----------

// Y1: reactant mass -> moles -> theoretical product mass -> % yield -> acceptable?
function genYield(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ri = rng.pick(RIDX);
    const R = REACTIONS[ri];
    const q = rng.int(2, 60) / 20;
    const m = roundTo(q * R.Mr, 1);
    const y = rng.int(11, 19) * 5;
    const thr = rng.pick([70, 75, 80, 85]);
    const th0 = (m / R.Mr) * R.k * R.Mp;
    const actual = roundTo((th0 * y) / 100, 1);
    if (actual <= 0) continue;
    const st = (rd) => {
      const n = rd("n", m / R.Mr);
      const th = rd("th", n * R.k * R.Mp);
      const yp = rd("yp", (actual / th) * 100);
      return { n, th, yp };
    };
    const n = TIER_PARTS[tier];
    const keys = ["n", "th", "yp"].slice(0, Math.min(n, 3));
    const dps = { n: 2, th: 1, yp: 1 };
    if (!stableOk(st, pick(st, keys, dps))) continue;
    const r = st((k, v) => v);
    if (Math.abs(r.yp - thr) < 3) continue;
    const ok = r.yp >= thr;
    const all = [
      numPart("n", "Moles of reactant", `Amount of ${R.react} (mol)`, r.n, 2, `Moles = mass ÷ molar mass. The molar mass of ${R.react} is ${R.Mr} g/mol.`),
      numPart("th", "Theoretical mass", `Theoretical mass of ${R.prod} (g)`, r.th, 1, `Use the equation's mole ratio (1 mol ${R.react} gives ${R.k} mol ${R.prod}), then multiply by the molar mass of ${R.prod}.`),
      numPart("yp", "Percentage yield", "Percentage yield (%)", r.yp, 1, "Percentage yield = actual mass ÷ theoretical mass × 100."),
      yesNo("ok", "Acceptable?", `Does the run meet the minimum yield of ${thr}%?`, ok, "Compare your percentage yield with the minimum."),
    ].slice(0, n);
    const ex = [
      `**Moles:** ${m} ÷ ${R.Mr} = **${fixed(r.n, 2)} mol**.`,
      `**Theoretical mass:** ${fixed(r.n, 2)} × ${R.k} × ${R.Mp} = **${fixed(r.th, 1)} g**.`,
      `**Yield:** ${actual} ÷ ${fixed(r.th, 1)} × 100 = **${fixed(r.yp, 1)}%**.`,
      `**Check:** ${fixed(r.yp, 1)}% is ${ok ? "at least" : "below"} ${thr}%, so **${ok ? "Yes" : "No"}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `A chemist reacts **${m} g** of ${R.react}: ${R.eq}. Relative atomic masses: ${R.ar}.${n >= 3 ? ` The run collects **${actual} g** of ${R.prod}.` : ""}`,
      all, ex, "ch-yield", { ri, m, actual, thr, n }, [["_mass", m]].concat(n >= 3 ? [["_actual", actual]] : []),
      ["Work in moles: mass to moles, moles through the equation, moles back to mass.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// Y2: empirical formula of a metal oxide from percent composition.
// Cu is 64 here (stated in each prompt), unlike the library's 63.5.
const COMPS = [
  { f: "MgO", M: "Mg", A: ar("Mg"), a: 1, b: 1 }, { f: "CaO", M: "Ca", A: ar("Ca"), a: 1, b: 1 },
  { f: "CuO", M: "Cu", A: 64, a: 1, b: 1 }, { f: "Cu₂O", M: "Cu", A: 64, a: 2, b: 1 },
  { f: "ZnO", M: "Zn", A: ar("Zn"), a: 1, b: 1 }, { f: "Al₂O₃", M: "Al", A: ar("Al"), a: 2, b: 3 },
  { f: "FeO", M: "Fe", A: ar("Fe"), a: 1, b: 1 }, { f: "Fe₂O₃", M: "Fe", A: ar("Fe"), a: 2, b: 3 },
  { f: "Fe₃O₄", M: "Fe", A: ar("Fe"), a: 3, b: 4 }, { f: "Na₂O", M: "Na", A: ar("Na"), a: 2, b: 1 },
];
// Distractor formulas use the same metal with another metal : oxygen ratio.
const SUBS = { 2: "₂", 3: "₃", 4: "₄" };
const oxideOf = (M, a, b) => `${M}${a > 1 ? SUBS[a] : ""}O${b > 1 ? SUBS[b] : ""}`;
const RATIOS = [[1, 1], [2, 1], [1, 2], [2, 3], [3, 4], [3, 2]];
const compPct = (c) => roundTo((100 * c.a * c.A) / (c.a * c.A + 16 * c.b), 1);
function genEmpirical(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ci = rng.int(0, COMPS.length - 1);
    const c = COMPS[ci];
    const p = compPct(c);
    const same = COMPS.filter((x) => x.M === c.M);
    if (same.some((x) => x !== c && Math.abs(compPct(x) - p) < 3)) continue;
    const S = rng.pick([5, 8, 10, 12.5, 20, 25, 40, 50]);
    const X = roundTo((S * p) / 100, 2);
    // Same rng draw as before (so medium keeps its questions); it now only picks where to start in the ratio list.
    const order = rng.shuffle(COMPS.filter((x) => x.f !== c.f));
    const pool = RATIOS.filter(([a, b]) => a !== c.a || b !== c.b);
    const start = COMPS.indexOf(order[0]) % pool.length;
    const others = [0, 1, 2].map((j) => pool[(start + j) % pool.length]).map(([a, b]) => oxideOf(c.M, a, b));
    const st = (rd) => ({ nm: rd("nm", X / c.A), no: rd("no", (S - X) / 16), mr: rd("mr", c.a * c.A + 16 * c.b) });
    const dps = { nm: 3, no: 3, mr: 1 };
    const n = TIER_PARTS[tier];
    const keys = ["nm", "no", "mr"].slice(0, Math.min(n, 3));
    if (!stableOk(st, pick(st, keys, dps))) continue;
    const r = st((k, v) => v);
    const all = [
      numPart("nm", "Moles of metal", `Amount of ${c.M} in the sample (mol)`, r.nm, 3, `Moles = mass ÷ relative atomic mass. Here ${c.M} has a relative atomic mass of ${c.A}.`),
      numPart("no", "Moles of oxygen", "Amount of O in the sample (mol)", r.no, 3, "The oxygen is the rest of the sample: subtract the metal mass, then divide by 16."),
      { id: "formula", label: "Formula", ask: "Which is the empirical formula of the oxide?", answerType: "choice", answer: c.f, choices: rng.shuffle([c.f, ...others]), hint: "Divide both mole amounts by the smaller one and, if needed, multiply to get whole numbers. That gives the ratio of metal to oxygen atoms." },
      numPart("mr", "Formula mass", "Relative formula mass of the oxide", r.mr, 1, "Add the relative atomic masses of every atom in the formula you found."),
    ].slice(0, n);
    const ex = [
      `**Metal:** ${X} ÷ ${c.A} = **${fixed(r.nm, 3)} mol**.`,
      `**Oxygen:** (${S} − ${X}) ÷ 16 = **${fixed(r.no, 3)} mol**.`,
      `**Formula:** the ratio ${c.M} : O is about ${c.a} : ${c.b}, so **${c.f}**.`,
      `**Formula mass:** ${c.a} × ${c.A} + ${c.b} × 16 = **${fixed(r.mr, 1)}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `A **${S} g** sample of an oxide of ${c.M} contains **${X} g** of ${c.M}, and the rest is oxygen. Relative atomic masses: ${c.M} = ${c.A}, O = 16.`,
      all, ex, "ch-empirical", { ci, S, X, n }, [["_sample", S], ["_metal", X], ["_ar", c.A]],
      ["The oxygen mass is the sample mass minus the metal mass.", "Moles = mass ÷ relative atomic mass; the formula comes from the ratio of moles."],
    );
  }
  return tooMany();
}

// Y3 (expert+): impure sample converted completely; work back to the purity.
function genPurity(rng) {
  for (let i = 0; i < TRY; i++) {
    const ri = rng.pick(RIDX);
    const R = REACTIONS[ri];
    const ms = rng.int(20, 200) / 4;
    const pur = rng.next() < 0.5 ? rng.int(93, 99) : rng.int(70, 92); // about half the samples near the grades
    const mp = roundTo((((ms * pur) / 100) / R.Mr) * R.k * R.Mp, 2);
    const thr = rng.pick([90, 92, 95]);
    if (mp <= 0.5) continue;
    const st = (rd) => {
      const np = rd("np", mp / R.Mp);
      const mass = rd("mass", (np / R.k) * R.Mr);
      const pp = rd("pp", (mass / ms) * 100);
      return { np, mass, pp };
    };
    const dps = { np: 3, mass: 2, pp: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (r.pp > 99.5 || r.pp < 60 || Math.abs(r.pp - thr) < 2) continue;
    const ok = r.pp >= thr;
    const parts = [
      numPart("np", "Moles of product", `Amount of ${R.prod} formed (mol)`, r.np, 3, `Moles = mass ÷ molar mass; the molar mass of ${R.prod} is ${R.Mp} g/mol.`),
      numPart("mass", "Pure reactant", `Mass of pure ${R.react} that must have reacted (g)`, r.mass, 2, `Work backwards through the equation: ${R.k} mol ${R.prod} comes from 1 mol ${R.react}. Then multiply by the molar mass of ${R.react}.`),
      numPart("pp", "Purity", "Percentage purity of the sample (%)", r.pp, 1, "Purity = mass of pure reactant ÷ mass of the whole sample × 100."),
      yesNo("ok", "Meets grade?", `The supplier promises a purity of at least ${thr}%. Is the promise kept?`, ok, "Compare the purity you found with the promised value."),
    ];
    const ex = [
      `**Product:** ${mp} ÷ ${R.Mp} = **${fixed(r.np, 3)} mol**.`,
      `**Pure reactant:** ${fixed(r.np, 3)} ÷ ${R.k} × ${R.Mr} = **${fixed(r.mass, 2)} g**.`,
      `**Purity:** ${fixed(r.mass, 2)} ÷ ${ms} × 100 = **${fixed(r.pp, 1)}%**.`,
      `**Grade:** ${fixed(r.pp, 1)}% is ${ok ? "at least" : "below"} ${thr}%, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A **${ms} g** sample of impure ${R.react} is reacted completely (${R.eq}). The impurities do not react, and **${mp} g** of ${R.prod} is obtained. Relative atomic masses: ${R.ar}.`,
      parts, ex, "ch-purity", { ri, ms, mp, thr }, [["_sample", ms], ["_product", mp], ["_limit", thr]],
      ["Work backwards: the product tells you how much pure reactant there was.", "Only the pure reactant reacts, so compare its mass with the whole sample."],
    );
  }
  return tooMany();
}

// ---------- titration ----------

const ACIDS = [
  { name: "hydrochloric acid", f: "HCl", r: 1 }, { name: "nitric acid", f: "HNO₃", r: 1 },
  { name: "ethanoic acid", f: "CH₃COOH", r: 1 }, { name: "sulfuric acid", f: "H₂SO₄", r: 2 },
];

// T1: titre -> moles of NaOH (mmol) -> concentration of acid -> dilution -> within the label?
function genTitr(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const A = med ? rng.pick(ACIDS.filter((a) => a.r === 1)) : rng.pick(ACIDS);
    const cl = rng.pick([0.05, 0.1, 0.15, 0.2, 0.25, 0.4, 0.5]);
    const c = rng.pick([0.05, 0.1, 0.2, 0.25, 0.5]);
    const Va = rng.pick([20, 25]);
    const dev = rng.int(-50, 50) / 10;
    const V = roundTo((cl * (1 + dev / 100) * Va * A.r) / c, 1);
    if (V < 10 || V > 40) continue;
    const cd = rng.pick([0.01, 0.02, 0.025, 0.05]);
    const Vd = rng.pick([100, 200, 250, 500]);
    const st = (rd) => {
      const nb = rd("nb", c * V);
      const na = rd("na", nb / A.r);
      const ca = rd("ca", na / Va);
      const vd = rd("vd", (cd * Vd) / ca);
      return { nb, na, ca, vd };
    };
    const dps = { nb: 2, na: 2, ca: 3, vd: 1 };
    const n = TIER_PARTS[tier];
    const keys = tier === "medium" ? ["nb", "ca"] : tier === "hard" ? ["nb", "na", "ca"] : ["nb", "ca", "vd"];
    if (!stableOk(st, pick(st, keys, dps))) continue;
    const r = st((k, v) => v);
    const devAbs = (Math.abs(r.ca - cl) / cl) * 100;
    if (Math.abs(devAbs - 2) < 0.5) continue;
    if (tier === "expert" && (r.vd >= Vd || r.vd < 1)) continue;
    const ok = devAbs <= 2;
    // The label check must give the same verdict from the rounded concentration, with room to spare.
    const devRounded = (Math.abs(roundTo(r.ca, 3) - cl) / cl) * 100;
    if (tier === "expert" && ((devRounded <= 2) !== ok || Math.abs(devRounded - 2) < 0.3)) continue;
    const all = {
      nb: numPart("nb", "Moles of NaOH", `Amount of NaOH in the titre (mmol)`, r.nb, 2, "Millimoles = concentration (mol/dm³) × volume (cm³)."),
      na: numPart("na", "Moles of acid", `Amount of ${A.f} in the flask (mmol)`, r.na, 2, `1 mol of ${A.f} reacts with ${A.r} mol of NaOH, so divide the NaOH amount by ${A.r}.`),
      ca: numPart("ca", "Acid concentration", `Concentration of the ${A.f} (mol/dm³)`, r.ca, 3, `Concentration = millimoles of acid ÷ volume of acid in cm³ (mmol/cm³ equals mol/dm³). Remember the ${A.r}:1 ratio${A.r === 1 ? " is simply 1:1" : " of base to acid"}.`),
      vd: numPart("vd", "Dilution", `Volume of this acid needed to prepare ${Vd} cm³ of ${cd} mol/dm³ solution (cm³)`, r.vd, 1, "Dilution keeps the moles the same: c₁ × V₁ = c₂ × V₂. Solve for V₁."),
      ok: yesNo("ok", "Matches label?", `The bottle is labelled ${cl} mol/dm³. Is your concentration within 2% of the label?`, ok, "Find the difference between your value and the label as a percentage of the label."),
    };
    const parts = keys.concat(tier === "expert" ? ["ok"] : []).map((k) => all[k]);
    const ex = {
      nb: `**NaOH:** ${c} × ${V} = **${fixed(r.nb, 2)} mmol**.`,
      na: `**Acid:** ${fixed(r.nb, 2)} ÷ ${A.r} = **${fixed(r.na, 2)} mmol**.`,
      ca: `**Concentration:** ${fixed(r.na, 2)} ÷ ${Va} = **${fixed(r.ca, 3)} mol/dm³**.`,
      vd: `**Dilution:** V₁ = ${cd} × ${Vd} ÷ ${fixed(r.ca, 3)} = **${fixed(r.vd, 1)} cm³**.`,
      ok: `**Label:** the difference from ${cl} is ${fmt(devAbs, 1)}%, which is ${ok ? "within" : "more than"} 2%, so **${ok ? "Yes" : "No"}**.`,
    };
    const exList = keys.concat(tier === "expert" ? ["ok"] : []).map((k) => ex[k]);
    return finish(
      `In a titration, **${Va} cm³** of ${A.name} (${A.f}) is neutralised by **${V} cm³** of **${c} mol/dm³** sodium hydroxide. 1 mol of ${A.f} reacts with ${A.r} mol of NaOH.${tier === "expert" ? ` The acid is then diluted to ${Vd} cm³ at ${cd} mol/dm³.` : ""}`,
      parts, exList.join("\n\n"), "ch-titr", { acid: ACIDS.indexOf(A), c, V, Va, cl, cd, Vd, n, keys }, [["_c", c], ["_titre", V], ["_flask", Va]].concat(tier === "expert" ? [["_label", cl], ["_target", cd], ["_final", Vd]] : []),
      ["Titration works in moles: find the moles of the known solution first, then use the equation ratio.", "mol/dm³ × cm³ gives millimoles, which avoids tiny numbers."],
    );
  }
  return tooMany();
}

// T2 (expert+): impure NaOH made up to 250 cm³; a 25.0 cm³ portion is titrated -> purity.
function genTitrBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const A = rng.pick(ACIDS);
    const c = rng.pick([0.05, 0.1, 0.2, 0.25, 0.5]);
    const V = rng.int(150, 350) / 10;
    const pur = rng.next() < 0.5 ? rng.int(93, 99) : rng.int(70, 92); // about half the samples near the grades
    const massTrue = c * V * A.r * 0.4;
    const m = roundTo(massTrue / (pur / 100), 1);
    if (m < 1 || m > 15) continue;
    const thr = rng.pick([90, 93, 95]);
    const st = (rd) => {
      const na = rd("na", c * V);
      const mass = rd("mass", na * A.r * 10 * 0.04);
      const pp = rd("pp", (mass / m) * 100);
      return { na, mass, pp };
    };
    const dps = { na: 2, mass: 2, pp: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (r.pp > 99.5 || Math.abs(r.pp - thr) < 2) continue;
    const ok = r.pp >= thr;
    const parts = [
      numPart("na", "Moles of acid", `Amount of ${A.f} in the titre (mmol)`, r.na, 2, "Millimoles = concentration (mol/dm³) × volume (cm³)."),
      numPart("mass", "Mass of NaOH", "Mass of pure NaOH in the whole 250 cm³ solution (g)", r.mass, 2, `Use the ${A.r}:1 ratio to get the NaOH in the 25.0 cm³ portion. The whole solution holds 10 times as much. Then convert millimoles to grams with M = 40 g/mol (1 mmol = 0.040 g).`),
      numPart("pp", "Purity", "Percentage purity of the solid (%)", r.pp, 1, "Purity = mass of pure NaOH ÷ mass weighed out × 100."),
      yesNo("ok", "Meets grade?", `The grade requires at least ${thr}% NaOH. Does this batch qualify?`, ok, "Compare your purity with the grade."),
    ];
    const ex = [
      `**Acid:** ${c} × ${V} = **${fixed(r.na, 2)} mmol**.`,
      `**NaOH mass:** ${fixed(r.na, 2)} × ${A.r} = ${fmt(r.na * A.r, 2)} mmol in 25.0 cm³, so ×10 for 250 cm³, × 0.040 g/mmol = **${fixed(r.mass, 2)} g**.`,
      `**Purity:** ${fixed(r.mass, 2)} ÷ ${m} × 100 = **${fixed(r.pp, 1)}%**.`,
      `**Grade:** ${fixed(r.pp, 1)}% is ${ok ? "at least" : "below"} ${thr}%, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A technician dissolves **${m} g** of impure solid sodium hydroxide and makes the solution up to **250 cm³**. A **25.0 cm³** portion needs **${V} cm³** of **${c} mol/dm³** ${A.name} (${A.f}) to neutralise it. 1 mol of ${A.f} reacts with ${A.r} mol of NaOH. The impurities do not react. Relative atomic masses: Na = 23, O = 16, H = 1.`,
      parts, ex, "ch-titrback", { acid: ACIDS.indexOf(A), c, V, m, thr }, [["_mass", m], ["_c", c], ["_titre", V], ["_limit", thr]],
      ["Work backwards from the titre to the NaOH in the portion, then scale up to the whole solution.", "Only the pure NaOH reacts with the acid."],
    );
  }
  return tooMany();
}

// ---------- gas-vessel ----------

const gasReaction = (react, gas, k, eq, notes) => ({ react, Mr: mm(react), gas, k, eq, ar: massList(notes) });
const GASR = [
  gasReaction("CaCO₃", "CO₂", 1, "CaCO₃ → CaO + CO₂", ["CaCO3"]),
  gasReaction("Zn", "H₂", 1, "Zn + 2 HCl → ZnCl₂ + H₂", ["Zn"]),
  gasReaction("Mg", "H₂", 1, "Mg + 2 HCl → MgCl₂ + H₂", ["Mg"]),
  gasReaction("H₂O₂", "O₂", 0.5, "2 H₂O₂ → 2 H₂O + O₂", ["H2O2"]),
  gasReaction("KClO₃", "O₂", 1.5, "2 KClO₃ → 2 KCl + 3 O₂", ["KClO3"]),
];
const GRIDX = GASR.map((_, i) => i);
const CONST_TXT = `Take 1 mol of gas = ${MOLAR_VOLUME_RTP} dm³ at room temperature and pressure (RTP), R = ${R_GAS} J/(mol·K), and use P V = n R T with P in kPa and V in dm³.`;

// G1: reactant -> moles of gas -> volume at RTP -> pressure in a rigid vessel -> heated, still safe?
function genGas(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const gi = rng.pick(GRIDX);
    const R = GASR[gi];
    const q = rng.int(2, 50) / 20;
    const m = roundTo(q * R.Mr, 1);
    const Vv = rng.pick([2, 4, 5, 8, 10, 20, 25, 40, 50]);
    const T1 = rng.pick([290, 300, 310]);
    const T2 = T1 + rng.pick([100, 150, 200, 250]);
    const Pmax = rng.pick([300, 500, 800, 1000, 1500, 2000]);
    const st = (rd) => {
      const n = rd("n", (m / R.Mr) * R.k);
      const V = rd("V", n * MOLAR_VOLUME_RTP);
      const P1 = rd("P1", (n * R_GAS * T1) / Vv);
      const P2 = rd("P2", (n * R_GAS * T2) / Vv);
      return { n, V, P1, P2 };
    };
    const dps = { n: 2, V: 1, P1: 0, P2: 0 };
    const n = TIER_PARTS[tier];
    const keys = tier === "medium" ? ["n", "V"] : tier === "hard" ? ["n", "V", "P1"] : ["n", "P1", "P2"];
    if (!stableOk(st, pick(st, keys, dps))) continue;
    const r = st((k, v) => v);
    if (tier !== "medium" && (r.P1 < 40 || r.P1 > 3000)) continue;
    if (tier === "expert" && Math.abs(r.P2 / Pmax - 1) < 0.08) continue;
    const ok = r.P2 <= Pmax;
    const all = {
      n: numPart("n", "Moles of gas", `Amount of ${R.gas} released (mol)`, r.n, 2, `First the moles of ${R.react} (mass ÷ ${R.Mr}), then the equation: 1 mol ${R.react} gives ${R.k} mol ${R.gas}.`),
      V: numPart("V", "Volume at RTP", `Volume of ${R.gas} at RTP (dm³)`, r.V, 1, "At RTP 1 mol of gas occupies 24 dm³."),
      P1: numPart("P1", "Pressure", `Pressure of the gas in the ${Vv} dm³ vessel at ${T1} K (kPa)`, r.P1, 0, "P = n R T ÷ V, with R = 8.31, T in kelvin and V in dm³; the answer comes out in kPa."),
      P2: numPart("P2", "Heated pressure", `Pressure after the vessel is heated to ${T2} K (kPa)`, r.P2, 0, "The vessel is rigid and the amount of gas is unchanged, so use P = n R T ÷ V at the new temperature (pressure rises in proportion to T)."),
      ok: yesNo("ok", "Safe?", `The vessel is rated for ${Pmax} kPa. Is it safe at ${T2} K?`, ok, "Compare the heated pressure with the rating."),
    };
    const exs = {
      n: `**Moles of gas:** ${m} ÷ ${R.Mr} × ${R.k} = **${fixed(r.n, 2)} mol**.`,
      V: `**Volume at RTP:** ${fixed(r.n, 2)} × 24 = **${fixed(r.V, 1)} dm³**.`,
      P1: `**Pressure:** ${fixed(r.n, 2)} × 8.31 × ${T1} ÷ ${Vv} = **${fixed(r.P1, 0)} kPa**.`,
      P2: `**Heated:** ${fixed(r.n, 2)} × 8.31 × ${T2} ÷ ${Vv} = **${fixed(r.P2, 0)} kPa**.`,
      ok: `**Safety:** ${fixed(r.P2, 0)} kPa is ${ok ? "within" : "above"} the ${Pmax} kPa rating, so **${ok ? "Yes" : "No"}**.`,
    };
    const ks = keys.concat(tier === "expert" ? ["ok"] : []);
    const vessel = tier === "medium" ? "" : ` The gas is collected in a sealed rigid vessel of **${Vv} dm³** at **${T1} K**.${tier === "expert" ? ` It is later heated to **${T2} K**.` : ""}`;
    return finish(
      `A chemist reacts **${m} g** of ${R.react}: ${R.eq}, which releases ${R.gas}. Relative atomic masses: ${R.ar}. ${CONST_TXT}${vessel}`,
      ks.map((k) => all[k]), ks.map((k) => exs[k]).join("\n\n"), "ch-gas", { gi, m, Vv, T1, T2, Pmax, n, keys }, [["_mass", m]].concat(tier === "medium" ? [] : [["_vessel", Vv], ["_temp", T1]]).concat(tier === "expert" ? [["_temp2", T2], ["_rating", Pmax]] : []),
      ["Moles of gas come from the moles of reactant and the equation's ratio.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// G2 (expert+): vessel rating -> maximum moles -> maximum safe charge -> planned charge as % of limit -> verdict.
function genGasBack(rng) {
  const cols = ["Planned charge", "Spare capacity"];
  const choices = [["Within the limit", "10% or more spare"], ["Within the limit", "Under 10% spare"], ["Over the limit", "10% or more spare"], ["Over the limit", "Under 10% spare"]];
  for (let i = 0; i < TRY; i++) {
    const gi = rng.pick(GRIDX);
    const R = GASR[gi];
    const Vv = rng.pick([5, 8, 10, 20, 25, 40, 50]);
    const Pmax = rng.pick([500, 800, 1000, 1500, 2000]);
    const Tm = rng.pick([300, 320, 350, 400]);
    const mm0 = ((Pmax * Vv) / (R_GAS * Tm) / R.k) * R.Mr;
    const mp = Math.round(mm0 * rng.pick([0.6, 0.7, 0.8, 0.88, 0.95, 1.05, 1.15, 1.3]));
    const st = (rd) => {
      const nm = rd("nm", (Pmax * Vv) / (R_GAS * Tm));
      const mm = rd("mm", (nm / R.k) * R.Mr);
      const pl = rd("pl", (mp / mm) * 100);
      return { nm, mm, pl };
    };
    const dps = { nm: 2, mm: 0, pl: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (mm0 < 20 || Math.abs(r.pl - 100) < 3 || Math.abs(r.pl - 90) < 3) continue;
    const over = r.pl > 100;
    const spareOk = r.pl <= 90;
    const ans = [over ? "Over the limit" : "Within the limit", spareOk ? "10% or more spare" : "Under 10% spare"];
    const parts = [
      numPart("nm", "Maximum moles", `Greatest amount of gas the vessel can hold at ${Pmax} kPa and ${Tm} K (mol)`, r.nm, 2, "Rearrange P V = n R T to n = P V ÷ (R T), with V in dm³ and P in kPa."),
      numPart("mm", "Maximum charge", `Greatest mass of ${R.react} that may be reacted (g)`, r.mm, 0, `Work backwards: 1 mol ${R.react} gives ${R.k} mol ${R.gas}, so moles of reactant = moles of gas ÷ ${R.k}. Then multiply by ${R.Mr} g/mol.`),
      numPart("pl", "Planned charge", `The planned charge as a percentage of the maximum (%)`, r.pl, 0, "Planned mass ÷ maximum mass × 100."),
      { id: "verdict", label: "Verdict", ask: "Is the planned charge within the limit, and does it leave at least 10% spare capacity?", answerType: "choice", choiceCols: cols, choices, answer: ans, hint: "Over the limit means more than 100% of the maximum. 10% spare means the charge is at most 90% of the maximum." },
    ];
    const ex = [
      `**Maximum moles:** ${Pmax} × ${Vv} ÷ (8.31 × ${Tm}) = **${fixed(r.nm, 2)} mol**.`,
      `**Maximum charge:** ${fixed(r.nm, 2)} ÷ ${R.k} × ${R.Mr} = **${fixed(r.mm, 0)} g**.`,
      `**Planned charge:** ${mp} ÷ ${fixed(r.mm, 0)} × 100 = **${fixed(r.pl, 0)}%**.`,
      `**Verdict:** ${fixed(r.pl, 0)}% is ${over ? "over" : "within"} the limit and ${spareOk ? "leaves at least" : "leaves under"} 10% spare: **${ans.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `A sealed rigid vessel of **${Vv} dm³** is rated for at most **${Pmax} kPa** at **${Tm} K**. It will be used to collect ${R.gas} from ${R.react}: ${R.eq}. The plan is to react **${mp} g** of ${R.react}. Relative atomic masses: ${R.ar}. ${CONST_TXT}`,
      parts, ex, "ch-gasback", { gi, Vv, Pmax, Tm, mp }, [["_vessel", Vv], ["_rating", Pmax], ["_temp", Tm], ["_plan", mp]],
      ["Work backwards from the rating to the most gas the vessel can hold, then to the reactant that makes it.", "Treat the rating as a hard limit at the stated temperature."],
    );
  }
  return tooMany();
}

// ---------- batch-cost ----------

// B1: product target -> theoretical product -> reactant needed -> batch cost -> cost per kg -> profit?
function genBatch(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ri = rng.pick(RIDX);
    const R = REACTIONS[ri];
    const T = rng.pick([100, 200, 250, 400, 500, 800, 1000]);
    const y = rng.int(12, 19) * 5;
    const p = rng.int(5, 60) / 10;
    const F = rng.pick([200, 500, 800, 1000, 1500, 2000]);
    const f = (R.k * R.Mp) / R.Mr; // kg product per kg reactant at 100% yield
    const cost0 = (T / (y / 100) / f * p + F) / T;
    const s = roundTo(cost0 * (1 + rng.pick([-0.35, -0.2, -0.12, 0.12, 0.25, 0.4])), 1);
    if (s < 0.3) continue;
    const st = (rd) => {
      const th = rd("th", T / (y / 100));
      const re = rd("re", th / f);
      const bc = rd("bc", re * p + F);
      const ck = rd("ck", bc / T);
      return { th, re, bc, ck };
    };
    const dps = { th: 1, re: 1, bc: 0, ck: 2 };
    const n = TIER_PARTS[tier];
    const keys = tier === "medium" ? ["th", "re"] : tier === "hard" ? ["th", "re", "bc"] : ["re", "bc", "ck"];
    if (!stableOk(st, pick(st, keys, dps))) continue;
    const r = st((k, v) => v);
    if (Math.abs(r.ck - s) / s < 0.07) continue;
    const ok = s > r.ck;
    const all = {
      th: numPart("th", "Theoretical product", `Theoretical mass of ${R.prod} that must be made to deliver ${T} kg (kg)`, r.th, 1, `Only ${y}% of the theoretical amount is actually obtained, so divide the target by the yield as a fraction.`),
      re: numPart("re", "Reactant needed", `Mass of ${R.react} to charge (kg)`, r.re, 1, `Use molar masses: 1 kmol ${R.react} (${R.Mr} kg) gives ${R.k} kmol ${R.prod} (${fmt(R.k * R.Mp, 1)} kg). Find the theoretical product needed first (target ÷ yield), then scale.`),
      bc: numPart("bc", "Batch cost", `Total cost of one batch, reactant plus fixed cost ($)`, r.bc, 0, `Cost = mass of reactant × price per kg + the fixed cost of $${F}.`),
      ck: numPart("ck", "Cost per kg", `Cost per kg of ${R.prod} delivered ($)`, r.ck, 2, `Divide the batch cost by the ${T} kg actually delivered.`),
      ok: yesNo("ok", "Profitable?", `The product sells at $${s}/kg. Does each kg sell for more than it costs to make?`, ok, "Compare the selling price with your cost per kg."),
    };
    const exs = {
      th: `**Theoretical product:** ${T} ÷ ${fmt(y / 100, 2)} = **${fixed(r.th, 1)} kg**.`,
      re: `**Reactant:** ${fixed(r.th, 1)} × ${R.Mr} ÷ (${R.k} × ${R.Mp}) = **${fixed(r.re, 1)} kg**.`,
      bc: `**Batch cost:** ${fixed(r.re, 1)} × ${p} + ${F} = **$${fixed(r.bc, 0)}**.`,
      ck: `**Cost per kg:** ${fixed(r.bc, 0)} ÷ ${T} = **$${fixed(r.ck, 2)}**.`,
      ok: `**Profit:** $${s} is ${ok ? "more" : "less"} than $${fixed(r.ck, 2)}, so **${ok ? "Yes" : "No"}**.`,
    };
    const ks = keys.concat(tier === "expert" ? ["ok"] : []);
    const fixedTxt = tier === "medium" ? "" : ` Each batch also has a fixed cost of **$${F}** (labour and energy).`;
    return finish(
      `A plant must deliver **${T} kg** of ${R.prod} per batch from ${R.eq}. The process has a yield of **${y}%**. The reactant ${R.react} costs **$${p} per kg**.${fixedTxt}${tier === "expert" ? ` The product is sold for $${s}/kg.` : ""} Relative atomic masses: ${R.ar}.`,
      ks.map((k) => all[k]), ks.map((k) => exs[k]).join("\n\n"), "ch-batch", { ri, T, y, p, F, s, n, keys }, [["_target", T], ["_yield", y], ["_price", p]].concat(tier === "medium" ? [] : [["_fixed", F]]).concat(tier === "expert" ? [["_sell", s]] : []),
      ["Work backwards from what must be delivered: the yield tells you how much to make in theory.", "Use molar masses to turn a mass of product into a mass of reactant."],
    );
  }
  return tooMany();
}

// B2 (expert+): budget -> reactant bought -> product made -> cost per kg -> which plan is cheaper?
function genBatchBack(rng) {
  const cols = ["Cheaper plan", "Below the selling price"];
  const choices = [["Plan A", "Yes"], ["Plan A", "No"], ["Plan B", "Yes"], ["Plan B", "No"]];
  for (let i = 0; i < TRY; i++) {
    const ri = rng.pick(RIDX);
    const R = REACTIONS[ri];
    const f = (R.k * R.Mp) / R.Mr;
    const pA = rng.int(8, 50) / 10;
    const B = rng.pick([1000, 2000, 2500, 4000, 5000, 8000]);
    const yA = rng.int(12, 19) * 5;
    const pB = roundTo(pA * rng.pick([0.6, 0.75, 1.3, 1.5]), 1);
    const yB = rng.int(12, 19) * 5;
    const cA = pA / (f * (yA / 100));
    const cB = pB / (f * (yB / 100));
    if (Math.abs(cA - cB) / Math.min(cA, cB) < 0.1 || pB < 0.3) continue;
    const cheaper = Math.min(cA, cB);
    const s = roundTo(cheaper * rng.pick([0.8, 0.9, 1.1, 1.25]), 1);
    if (Math.abs(s - cheaper) / cheaper < 0.07) continue;
    const st = (rd) => {
      const re = rd("re", B / pA);
      const pr = rd("pr", re * f * (yA / 100));
      const ck = rd("ck", B / pr);
      return { re, pr, ck };
    };
    const dps = { re: 1, pr: 1, ck: 2 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const planA = cA < cB;
    const below = s > cheaper;
    const ans = [planA ? "Plan A" : "Plan B", below ? "Yes" : "No"];
    const parts = [
      numPart("re", "Reactant bought", `Mass of ${R.react} the budget buys under Plan A (kg)`, r.re, 1, "Mass = budget ÷ price per kg."),
      numPart("pr", "Product made", `Mass of ${R.prod} actually obtained under Plan A (kg)`, r.pr, 1, `First the theoretical product from the reactant (1 kmol ${R.react} = ${R.Mr} kg gives ${R.k} kmol ${R.prod} = ${fmt(R.k * R.Mp, 1)} kg), then apply the ${yA}% yield.`),
      numPart("ck", "Cost per kg", `Cost per kg of ${R.prod} under Plan A ($)`, r.ck, 2, "Divide the money spent on reactant by the product obtained."),
      { id: "plan", label: "Better plan", ask: `Plan B buys ${R.react} at $${pB}/kg but its yield is ${yB}%. Which plan gives the cheaper ${R.prod} per kg (reactant cost only), and is that cost below the selling price of $${s}/kg?`, answerType: "choice", choiceCols: cols, choices, answer: ans, hint: "Find the reactant cost per kg of product for each plan: price ÷ (theoretical kg of product per kg of reactant × yield). Then compare the smaller one with the selling price." },
    ];
    const ex = [
      `**Reactant:** ${B} ÷ ${pA} = **${fixed(r.re, 1)} kg**.`,
      `**Product:** ${fixed(r.re, 1)} × ${fmt(f, 4)} × ${fmt(yA / 100, 2)} = **${fixed(r.pr, 1)} kg**.`,
      `**Cost per kg (Plan A):** ${B} ÷ ${fixed(r.pr, 1)} = **$${fixed(r.ck, 2)}**.`,
      `**Plans:** Plan A costs $${fmt(cA, 2)} per kg, Plan B costs $${pB} ÷ (${fmt(f, 4)} × ${fmt(yB / 100, 2)}) = $${fmt(cB, 2)} per kg. The cheaper is ${ans[0]} at $${fmt(cheaper, 2)}, which is ${below ? "below" : "above"} $${s}: **${ans.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `Plan A: a plant spends a budget of **$${B}** on ${R.react} at **$${pA} per kg**, converting it by ${R.eq} with a yield of **${yA}%**. The product sells for **$${s} per kg**. Relative atomic masses: ${R.ar}.`,
      parts, ex, "ch-batchback", { ri, B, pA, yA, pB, yB, s }, [["_budget", B], ["_priceA", pA], ["_yieldA", yA], ["_priceB", pB], ["_yieldB", yB], ["_sell", s]],
      ["Work forwards from the budget to the reactant bought, then the product obtained.", "Compare plans by cost per kg of product, not by price per kg of reactant."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  const coin = rng.next() < 0.5;
  if (subtopic === "yield-purity") return plus ? genPurity(rng) : coin ? genYield(rng, difficulty) : genEmpirical(rng, difficulty);
  if (subtopic === "titration") return plus ? genTitrBack(rng) : genTitr(rng, difficulty);
  if (subtopic === "gas-vessel") return plus ? genGasBack(rng) : genGas(rng, difficulty);
  if (subtopic === "batch-cost") return plus ? genBatchBack(rng) : genBatch(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route where one exists. A number
// must be within its rounding tolerance of the true value; a choice must match exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");

// Independent molar mass for verify: sum "Symbol count" tokens straight from the formula text.
function checkMass(text) {
  const f = text.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
  let t = 0;
  for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) t += ar(m[1]) * (m[2] === "" ? 1 : Number(m[2]));
  return t;
}

const ALT = {
  "ch-yield": (p) => {
    const R = REACTIONS[p.ri];
    const th = (p.m * R.k * checkMass(R.prod)) / checkMass(R.react); // direct mass ratio
    return { n: p.m / checkMass(R.react), th, yp: (p.actual / th) * 100, ok: YN(p.actual / th >= p.thr / 100) };
  },
  "ch-empirical": (p) => {
    const c = COMPS[p.ci];
    // identify the oxide of the same metal whose composition is closest to the stated percentage
    const best = COMPS.filter((x) => x.M === c.M).sort((x, y) => Math.abs(compPct(x) - (100 * p.X) / p.S) - Math.abs(compPct(y) - (100 * p.X) / p.S))[0];
    return { nm: p.X / c.A, no: (p.S - p.X) / 16, formula: best.f, mr: best.a * best.A + 16 * best.b };
  },
  "ch-purity": (p) => {
    const R = REACTIONS[p.ri];
    const mass = (p.mp * checkMass(R.react)) / (R.k * checkMass(R.prod));
    return { np: p.mp / checkMass(R.prod), mass, pp: (mass / p.ms) * 100, ok: YN(mass / p.ms >= p.thr / 100) };
  },
  "ch-titr": (p) => {
    const A = ACIDS[p.acid];
    const nb = p.c * p.V;
    const ca = nb / A.r / p.Va;
    return { nb, na: nb / A.r, ca, vd: (p.cd * p.Vd) / ca, ok: YN(Math.abs(ca - p.cl) / p.cl <= 0.02) };
  },
  "ch-titrback": (p) => {
    const A = ACIDS[p.acid];
    const mass = ((p.c * p.V * A.r * 250) / 25 / 1000) * 40;
    return { na: p.c * p.V, mass, pp: (mass / p.m) * 100, ok: YN(mass / p.m >= p.thr / 100) };
  },
  "ch-gas": (p) => {
    const R = GASR[p.gi];
    const n = p.m / checkMass(R.react) * R.k;
    return { n, V: (n * MOLAR_VOLUME_RTP), P1: (n * R_GAS * p.T1) / p.Vv, P2: ((n * R_GAS * p.T1) / p.Vv) * (p.T2 / p.T1), ok: YN((n * R_GAS * p.T2) / p.Vv <= p.Pmax) };
  },
  "ch-gasback": (p) => {
    const R = GASR[p.gi];
    const nm = (p.Pmax * p.Vv) / (R_GAS * p.Tm);
    const mm = (nm * checkMass(R.react)) / R.k;
    const pl = (p.mp / mm) * 100;
    return { nm, mm, pl, verdict: `${pl > 100 ? "Over the limit" : "Within the limit"} | ${pl <= 90 ? "10% or more spare" : "Under 10% spare"}` };
  },
  "ch-batch": (p) => {
    const R = REACTIONS[p.ri];
    const re = (p.T * checkMass(R.react)) / (R.k * checkMass(R.prod) * (p.y / 100)); // single-step route
    const bc = re * p.p + p.F;
    return { th: p.T / (p.y / 100), re, bc, ck: bc / p.T, ok: YN(p.s > bc / p.T) };
  },
  "ch-batchback": (p) => {
    const R = REACTIONS[p.ri];
    const re = p.B / p.pA;
    const pr = (re * R.k * checkMass(R.prod) * (p.yA / 100)) / checkMass(R.react);
    const cA = p.B / pr;
    const cB = p.pB / ((R.k * checkMass(R.prod) * (p.yB / 100)) / checkMass(R.react));
    return { re, pr, ck: cA, plan: `${cA < cB ? "Plan A" : "Plan B"} | ${p.s > Math.min(cA, cB) ? "Yes" : "No"}` };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = Object.fromEntries(Object.entries(alt(p)).map(([k, v]) => [k.toLowerCase(), v])); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      if (p.dps[part.id] === undefined || !near(partNum(answer, part.id), tv, tolOf(p.dps[part.id]))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
