// Electrical Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   power-circuit   resistor network -> current -> power -> fuse and cable            (Power Engineer)
//   battery-energy  mAh -> Wh -> runtime -> cost of charging; sizing a pack            (Power Engineer)
//   register-flags  hex -> binary -> flags -> logic output; mask operations            (Embedded Engineer)
//   sensor-data     sample rate and bits -> storage, upload time; ADC steps and codes  (Embedded Engineer)

// ---------- helpers ----------

// Round half away from zero to d places; the 1e-9 nudge absorbs binary error.
import { roundTo } from "../../js/lib/mathutil.js";
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
const FUSES = [3, 5, 10, 13, 20, 30];
const CABLES = [6, 10, 16, 25, 32, 40];
const TRY = 30000;
const tooMany = () => { throw new Error("role-electrical-engineer: no suitable draw"); };

function numPart(id, label, ask, val, dp, hint, exact) {
  // An ask that already states its whole-number rule in brackets gets no "to the nearest ..." suffix.
  const said = dp === 0 && /\([^)]*whole[^)]*\)$/.test(ask);
  const p = { id: id.toLowerCase(), label, ask: said ? ask : `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
  if (exact) p.fuzzyNumber = 0;
  return p;
}
// Every key in `dps` must be stable: computing each stage from the rounded earlier answers
// rounds to the same value, and nothing sits on a rounding half-step.
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
const hexOf = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const binOf = (n) => n.toString(2).padStart(8, "0");
const binAccepts = (n) => { const b = binOf(n); return [...new Set([`${b.slice(0, 4)} ${b.slice(4)}`, b.replace(/^0+(?=.)/, ""), `0b${b}`])].filter((x) => x !== b); };
const hexAccepts = (n) => { const h = hexOf(n); return [...new Set([`0x${h}`, h.replace(/^0+(?=.)/, ""), `0x${h.replace(/^0+(?=.)/, "")}`])].filter((x) => x !== h); };
const popcount = (n) => { let c = 0; for (let i = 0; i < 8; i++) if ((n >> i) & 1) c++; return c; };

// Build `n` distinct segmented options (answer included) that differ from the answer in 1..cols-1 columns.
// Ticket 022 (mixed distances): at least one wrong option differs in 2+ columns (both columns allowed with two),
// none in every column with 3+, and the answer's value is not the strict majority in every column; redrawn
// with the same rng until the rule holds. `valid` keeps every option a sensible combination.
function segMixOk(set, answer) {
  const cols = answer.length, key = answer.join(" | ");
  const wrong = set.filter((r) => r.join(" | ") !== key);
  const dist = wrong.map((r) => r.reduce((d, v, i) => d + (v !== answer[i] ? 1 : 0), 0));
  if (!dist.some((d) => d >= 2)) return false;
  if (cols >= 3 && dist.some((d) => d >= cols)) return false;
  const strict = (j) => { const m = set.filter((r) => r[j] === answer[j]).length; return set.every((r) => r[j] === answer[j] || set.filter((x) => x[j] === r[j]).length < m); };
  return !answer.every((_, j) => strict(j));
}
function segOptions(rng, answer, opts, n, valid = () => true) {
  const cols = answer.length, maxD = cols === 2 ? 2 : cols - 1;
  const alts = (i) => opts[i].filter((v) => v !== answer[i]);
  let best = [answer];
  for (let attempt = 0; attempt < 300; attempt++) {
    const seen = new Set([answer.join(" | ")]);
    const out = [answer];
    const add = (c) => {
      if (out.length >= n) return;
      const d = c.filter((v, i) => v !== answer[i]).length;
      if (d < 1 || d > maxD || !valid(c)) return;
      const k = c.join(" | ");
      if (seen.has(k)) return;
      seen.add(k); out.push(c);
    };
    const mk = (idx) => { const c = answer.slice(); for (const i of idx) { const a = alts(i); if (a.length) c[i] = rng.pick(a); } return c; };
    add(mk(rng.shuffle([...Array(cols).keys()]).slice(0, 2)));
    for (let g = 0; out.length < n && g < 400; g++) add(mk(rng.shuffle([...Array(cols).keys()]).slice(0, 1 + (rng.next() < 0.5 ? 1 : 0))));
    if (out.length > best.length) best = out;
    if (out.length >= n && segMixOk(out, answer)) return rng.shuffle(out);
  }
  return rng.shuffle(best);
}
function segPart(rng, { id, label, ask, cols, answer, opts, hint, n, valid }) {
  const choices = segOptions(rng, answer, opts, n, valid);
  const extraSegs = [];
  cols.forEach((c, i) => { for (const v of new Set(opts[i])) if (v !== answer[i]) extraSegs.push([i, v]); });
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, hint };
}
const pickRating = (list, x) => list.find((f) => f > x);
const farFrom = (list, x) => list.every((f) => Math.abs(x / f - 1) > 0.04);

// ---------- power-circuit ----------

const parallel = (a, b) => (a * b) / (a + b);

// C1: a resistor network on a supply. medium: two resistors; hard+: R1 in series with R2 || R3.
function genNet(rng, tier) {
  // Expert aims for a fuse drawn once, so the answer is not nearly always the smallest rating.
  const wantFuse = tier === "expert" ? rng.pick([3, 5, 10, 13, 20]) : 0;
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const V = rng.pick([6, 9, 12, 24, 48, 120, 230]);
    const R1 = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 30]);
    const R2 = rng.pick([6, 10, 12, 15, 20, 30, 40, 60, 100]);
    const R3 = rng.pick([6, 10, 12, 15, 20, 30, 40, 60, 100]);
    const ser = med ? rng.next() < 0.5 : false;
    const dev = rng.pick(["heater", "lamp bank", "soldering station", "test rig", "charger"]);
    const st = (rd) => {
      const Rt = rd("Rt", med ? (ser ? R1 + R2 : parallel(R1, R2)) : R1 + parallel(R2, R3));
      const I = rd("I", V / Rt);
      const P = rd("P", V * I);
      return { Rt, I, P };
    };
    const n = TIER_PARTS[tier];
    const use = tier === "expert" ? { Rt: 2, I: 2, P: 0 } : med ? { Rt: 2, I: 2 } : { Rt: 2, I: 2, P: 1 };
    const dps = { Rt: 2, I: 2, P: tier === "expert" ? 0 : 1 };
    if (!stableOk(st, use)) continue;
    const r = st((k, v) => v);
    if (r.I < 0.3 || r.I > 28 || r.P > 2500) continue;
    const exp = tier === "expert";
    if (exp && !farFrom(FUSES, r.I)) continue;
    if (exp && pickRating(FUSES, r.I) !== wantFuse && i < TRY - 1000) continue;
    const parts = [
      numPart("Rt", "Total resistance", "Total resistance of the network (Ω)", r.Rt, 2, med ? (ser ? "Resistors in series simply add." : "For two resistors in parallel, 1/R = 1/R₁ + 1/R₂ (or product ÷ sum).") : "Combine the parallel pair first (1/R = 1/R₂ + 1/R₃), then add the series resistor."),
      numPart("I", "Supply current", "Current drawn from the supply (A)", r.I, 2, "Ohm's law on the whole network: I = V ÷ total resistance."),
      numPart("P", "Power", exp ? "Power drawn from the supply (W)" : "Power drawn from the supply (W)", r.P, dps.P, "Power = V × I (or V² ÷ R)."),
    ];
    if (exp) {
      const fuse = pickRating(FUSES, r.I);
      parts.push({ id: "fuse", label: "Fuse", ask: "Which fuse should protect the circuit?", answerType: "choice", answer: `${fuse} A`, choices: FUSES.map((f) => `${f} A`), hint: "The fuse must carry the normal current without blowing, so choose the smallest rating above the circuit current." });
    }
    const net = med ? `two resistors, **${R1} Ω** and **${R2} Ω**, wired in **${ser ? "series" : "parallel"}**` : `a **${R1} Ω** resistor in series with a parallel pair of **${R2} Ω** and **${R3} Ω**`;
    const ex = [
      med ? (ser ? `**Total resistance:** ${R1} + ${R2} = **${fixed(r.Rt, 2)} Ω**.` : `**Total resistance:** ${R1} × ${R2} ÷ (${R1} + ${R2}) = **${fixed(r.Rt, 2)} Ω**.`) : `**Total resistance:** the pair gives ${R2} × ${R3} ÷ (${R2} + ${R3}) = ${fmt(parallel(R2, R3), 3)} Ω, plus ${R1} Ω gives **${fixed(r.Rt, 2)} Ω**.`,
      `**Current:** I = V ÷ R = ${V} ÷ ${fixed(r.Rt, 2)} = **${fixed(r.I, 2)} A**.`,
      `**Power:** P = V × I = ${V} × ${fixed(r.I, 2)} = **${fixed(r.P, dps.P)} W**.`,
      exp ? `**Fuse:** the circuit draws ${fixed(r.I, 2)} A, so the smallest rating above it from the list is **${pickRating(FUSES, r.I)} A**.` : "",
    ].slice(0, n).join("\n\n");
    return finish(
      `A ${dev} is modelled as ${net}, connected across a **${V} V** supply.${exp ? ` Fuses come in these ratings: ${FUSES.join(", ")} A.` : ""}`,
      parts.slice(0, n), ex, "ec-net", { med, ser, V, R1, R2, R3, n, exp }, [["_volts", V], ["_r1", R1], ["_r2", R2]].concat(med ? [] : [["_r3", R3]]),
      ["Find the total resistance first; the current and power follow from it.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// C2 (expert+): work backwards from the rated power to an unknown resistor, then fuse and cable.
function genBack(rng) {
  // Aim for a fuse drawn once, so the answer is not nearly always the smallest pair.
  const wantFuse = rng.pick([3, 5, 10, 13, 20]);
  for (let i = 0; i < TRY; i++) {
    const V = rng.pick([12, 24, 48, 120, 230]);
    const R1 = rng.int(2, 20);
    const R2 = rng.pick([10, 12, 15, 20, 24, 30, 40, 60]);
    const target = R1 + R2 * (0.2 + 0.6 * (rng.int(0, 100) / 100));
    const P = Math.round((V * V) / target / 5) * 5;
    if (P < 10) continue;
    const st = (rd) => {
      const Rt = rd("Rt", (V * V) / P);
      const R3 = rd("R3", 1 / (1 / (Rt - R1) - 1 / R2));
      const I = rd("I", P / V);
      return { Rt, R3, I };
    };
    const dps = { Rt: 2, R3: 1, I: 2 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const Rp = r.Rt - R1;
    if (Rp <= 0.5 || Rp > R2 * 0.85 || r.R3 < 3 || r.R3 > 400 || r.I < 0.4 || r.I > 28 || !farFrom(FUSES, r.I)) continue;
    if (pickRating(FUSES, r.I) !== wantFuse && i < TRY - 1000) continue;
    const fuse = pickRating(FUSES, r.I);
    const cable = CABLES.find((c) => c >= fuse);
    const cols = ["Fuse", "Cable rating"];
    const opts = [FUSES.slice(0, 5).map((f) => `${f} A`), CABLES.slice(0, 5).map((c) => `${c} A`)];
    const answer = [`${fuse} A`, `${cable} A`];
    const parts = [
      numPart("Rt", "Total resistance", "Total resistance the supply sees (Ω)", r.Rt, 2, "The rated power and the supply voltage fix the total resistance: P = V² ÷ R."),
      numPart("R3", "Unknown resistor", "Value of the unknown resistor R₃ (Ω)", r.R3, 1, "Subtract R₁ from the total to get the parallel block, then solve 1/R_block = 1/R₂ + 1/R₃ for R₃."),
      numPart("I", "Current", "Supply current (A)", r.I, 2, "Rated power = V × I, so I = P ÷ V."),
      segPart(rng, { id: "fuse", label: "Fuse and cable", ask: "Choose the fuse and the cable", cols, answer, opts, n: 5, valid: (c) => parseInt(c[1], 10) >= parseInt(c[0], 10), hint: "Fuse: smallest rating above the current. Cable: smallest rating that is at least the fuse rating." }),
    ];
    const ex = [
      `**Total resistance:** P = V² ÷ R, so R = ${V}² ÷ ${P} = **${fixed(r.Rt, 2)} Ω**.`,
      `**Unknown resistor:** the parallel block is ${fixed(r.Rt, 2)} − ${R1} = ${fmt(Rp, 3)} Ω. From 1/R₃ = 1/${fmt(Rp, 3)} − 1/${R2}, R₃ = **${fixed(r.R3, 1)} Ω**.`,
      `**Current:** I = P ÷ V = ${P} ÷ ${V} = **${fixed(r.I, 2)} A**.`,
      `**Fuse and cable:** the smallest fuse above ${fixed(r.I, 2)} A is **${fuse} A**, and the smallest cable rated at least that is **${cable} A**.`,
    ].join("\n\n");
    return finish(
      `A heater is built from a **${R1} Ω** element in series with a parallel pair: a **${R2} Ω** element and an unknown element R₃. On a **${V} V** supply the whole heater is rated at **${P} W**. Fuses come in ${FUSES.join(", ")} A; cable is rated ${CABLES.join(", ")} A, and the cable must be rated at least the fuse.`,
      parts, ex, "ec-back", { V, R1, R2, P }, [["_volts", V], ["_power", P], ["_r1", R1], ["_r2", R2]],
      ["Work backwards: the rated power gives the total resistance, and the total gives the unknown resistor.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// ---------- battery-energy ----------

// B1: capacity in mAh -> Wh -> usable Wh -> runtime -> cost of charging.
function genBattery(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const V = rng.pick([3.7, 7.4, 11.1, 12, 14.8, 24]);
    const C = rng.pick([1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000]);
    const P = rng.pick([0.5, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]);
    const D = tier === "medium" ? 100 : rng.pick([70, 75, 80, 85, 90]);
    const eff = rng.pick([80, 85, 90]);
    const tariff = rng.pick([0.2, 0.25, 0.3, 0.35, 0.4, 0.5]);
    const dev = rng.pick(["drone", "data logger", "handheld scanner", "robot base", "portable speaker", "e-bike light"]);
    const st = (rd) => {
      const Wh = rd("Wh", (V * C) / 1000);
      const use = rd("use", Wh * (D / 100));
      const T = rd("T", use / P);
      const cost = rd("cost", ((Wh / 1000 / (eff / 100)) * 100) * tariff);
      return { Wh, use, T, cost };
    };
    const n = TIER_PARTS[tier];
    const all = { Wh: 2, use: 2, T: 1, cost: 2 };
    const keys = (med ? ["Wh", "T"] : ["Wh", "use", "T", "cost"].slice(0, n));
    const dps = Object.fromEntries(keys.map((k) => [k, all[k]]));
    const stm = med ? (rd) => { const Wh = rd("Wh", (V * C) / 1000); return { Wh, T: rd("T", Wh / P) }; } : st;
    if (!stableOk(stm, dps)) continue;
    const r = stm((k, v) => v);
    if (r.T < 0.5 || r.T > 400) continue;
    const parts = {
      Wh: numPart("Wh", "Stored energy", "Energy stored in the battery (Wh)", r.Wh, 2, "Energy in Wh = voltage × capacity in Ah, so convert mAh to Ah first (÷ 1000)."),
      use: numPart("use", "Usable energy", `Usable energy at ${D}% depth of discharge (Wh)`, r.use, 2, "Only the stated percentage of the stored energy may be used."),
      T: numPart("T", "Runtime", `Runtime at the stated load (h)`, med ? r.T : r.T, 1, med ? "Runtime = energy ÷ power." : "Runtime = usable energy ÷ power."),
      cost: numPart("cost", "Charging cost", "Cost of 100 charges, each putting the full stored energy back in (currency units)", r.cost, 2, "Mains energy for one charge = stored energy ÷ charger efficiency. Convert Wh to kWh, multiply by the tariff, then by 100."),
    };
    const pl = med ? ["Wh", "T"] : ["Wh", "use", "T", "cost"].slice(0, n);
    const ex = [
      `**Stored energy:** ${V} V × ${C} ÷ 1000 Ah = **${fixed(r.Wh, 2)} Wh**.`,
      !med ? `**Usable energy:** ${fixed(r.Wh, 2)} × ${D}% = **${fixed(r.use, 2)} Wh**.` : "",
      `**Runtime:** ${fixed(med ? r.Wh : r.use, 2)} Wh ÷ ${P} W = **${fixed(r.T, 1)} h**.`,
      !med && n === 4 ? `**Cost:** one charge draws ${fixed(r.Wh, 2)} ÷ 1000 ÷ ${eff / 100} kWh from the mains; × 100 charges × ${tariff} = **${fixed(r.cost, 2)}**.` : "",
    ].filter(Boolean).join("\n\n");
    const extra = med ? "" : ` Only **${D}%** of the stored energy may be used.`;
    const costTxt = n === 4 ? ` The charger is **${eff}%** efficient and mains energy costs **${tariff} per kWh**.` : "";
    return finish(
      `A ${dev} runs from a **${V} V**, **${C} mAh** battery and draws a steady **${P} W**.${extra}${costTxt}`,
      pl.map((k) => parts[k]), ex, "ec-batt", { V, C, P, D, eff, tariff, n, med }, [["_volts", V], ["_cap", C], ["_power", P]].concat(med ? [] : [["_dod", D]]).concat(n === 4 ? [["_eff", eff], ["_tariff", tariff]] : []),
      ["Work in watt-hours: convert the capacity to amp-hours, then to energy.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// B2 (expert+): size a pack backwards from a runtime requirement, then judge an offered pack.
function genPack(rng) {
  for (let i = 0; i < TRY; i++) {
    const s = rng.pick([2, 3, 4]);
    const cellV = 3.7;
    const cellC = rng.pick([2000, 2200, 2500, 3000, 3400]);
    const P = rng.pick([6, 8, 10, 12, 15, 18, 20, 24]);
    const T = rng.pick([4, 5, 6, 8, 10, 12]);
    const D = rng.pick([75, 80, 85, 90]);
    const offeredP = rng.int(1, 6);
    const V = roundTo(cellV * s, 1);
    const st = (rd) => {
      const Wh = rd("Wh", (P * T) / (D / 100));
      const cap = rd("cap", (Wh / V) * 1000);
      return { Wh, cap, strings: cap / cellC };
    };
    const dps = { Wh: 1, cap: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const frac = r.strings - Math.floor(r.strings);
    if (r.strings > 6 || frac < 0.1 || frac > 0.9) continue;
    const strings = Math.ceil(r.strings);
    const supply = offeredP * cellC;
    if (Math.abs(supply / r.cap - 1) < 0.08) continue;
    const meets = supply >= r.cap;
    const parts = [
      numPart("Wh", "Energy needed", "Energy the pack must store (Wh)", r.Wh, 1, "The load energy is power × time, but only part of the pack may be used, so divide by the usable fraction."),
      numPart("cap", "Capacity", `Capacity needed at the pack voltage (mAh)`, r.cap, 0, "Capacity in Ah = energy ÷ pack voltage; multiply by 1000 for mAh.", true),
      numPart("strings", "Parallel strings", "Number of parallel strings of cells needed (round up to a whole number)", strings, 0, "Each string adds one cell's capacity. Divide the capacity needed by one cell's capacity and round up.", true),
      yesNo("ok", "Offered pack", `A supplier offers the same ${s}-cell series pack with ${offeredP} parallel string${offeredP > 1 ? "s" : ""}. Does it meet the requirement?`, meets, "Its capacity is the number of strings times the cell capacity. Compare it with the capacity you found."),
    ];
    parts[2].answer = strings;
    const ex = [
      `**Energy needed:** ${P} W × ${T} h ÷ ${D / 100} = **${fixed(r.Wh, 1)} Wh**.`,
      `**Capacity:** the pack voltage is ${s} × ${cellV} = ${V} V, so ${fixed(r.Wh, 1)} ÷ ${V} × 1000 = **${fixed(r.cap, 0)} mAh**.`,
      `**Strings:** ${fixed(r.cap, 0)} ÷ ${cellC} = ${fmt(r.strings, 2)}, rounded up gives **${strings}**.`,
      `**Offered pack:** ${offeredP} × ${cellC} = ${supply} mAh, which is ${meets ? "at least" : "below"} ${fixed(r.cap, 0)} mAh, so **${meets ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A field sensor must run for **${T} h** at a steady **${P} W**, and only **${D}%** of a battery's stored energy may be used. The pack is built from **${cellV} V**, **${cellC} mAh** cells: **${s}** in series, with the series strings then paralleled for capacity.`,
      parts, ex, "ec-pack", { s, cellV, cellC, P, T, D, offeredP, V }, [["_power", P], ["_hours", T], ["_dod", D], ["_cellv", cellV], ["_cellmah", cellC]],
      ["Work backwards from the runtime: energy needed, then capacity, then how many cells in parallel.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// ---------- register-flags ----------

const FLAG_NAMES = ["READY", "ERROR", "BUSY", "FULL", "EMPTY", "IRQ", "PARITY", "LOCK", "ENABLE", "TIMEOUT"];
function flagTable(rng) {
  const names = rng.shuffle(FLAG_NAMES.slice()).slice(0, 8); // names[i] is bit i
  return names;
}
const tableMd = (names) => `| Bit | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| Flag | ${names.slice().reverse().join(" | ")} |`;
const bitOf = (n, k) => (n >> k) & 1;

// R1: a status register read as hex.
function genStatus(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const val = rng.int(17, 254);
    const names = flagTable(rng);
    const a = rng.int(0, 7);
    let b = rng.int(0, 7);
    if (b === a) b = (a + 3) % 8;
    const exp = tier === "expert";
    if (exp && (bitOf(val, a) + bitOf(val, b) === 0 || popcount(val) < 2)) continue;
    const reg = rng.pick(["status", "control", "interrupt", "UART status"]);
    const dec = val;
    const bits = popcount(val);
    const parts = [];
    if (med) {
      parts.push({ id: "dec", label: "Decimal", ask: "The register value in decimal", answerType: "number", answer: dec, tolerance: 0, fuzzyNumber: 0, hint: "Hex digits are worth 16 and 1: value = 16 × (first digit) + (second digit), with A=10 … F=15." });
      parts.push({ id: "ones", label: "Bits set", ask: "How many of the 8 bits are 1", answerType: "number", answer: bits, tolerance: 0, fuzzyNumber: 0, hint: "Write each hex digit as four bits and count the ones." });
    } else {
      parts.push({ id: "bin", label: "Binary", ask: "The register as 8 binary digits", answerType: "text", answer: binOf(val), accepts: binAccepts(val), fuzzy: false, hint: "Each hex digit becomes exactly four bits: 8 = 1000, 4 = 0100, 2 = 0010, 1 = 0001; add them." });
      if (tier === "hard") {
        parts.push({ id: "ones", label: "Bits set", ask: "How many of the 8 bits are 1", answerType: "number", answer: bits, tolerance: 0, fuzzyNumber: 0, hint: "Count the ones in your binary number." });
        parts.push(yesNo("flag", `${names[a]} flag`, `Is the ${names[a]} flag (bit ${a}) set?`, !!bitOf(val, a), `Find bit ${a} counting from the right, starting at bit 0.`));
      } else {
        parts.push({ id: "dec", label: "Decimal", ask: "The register value in decimal", answerType: "number", answer: dec, tolerance: 0, fuzzyNumber: 0, hint: "Value = 16 × (first hex digit) + (second hex digit), with A=10 … F=15." });
        const cols = [`${names[a]} (bit ${a})`, `${names[b]} (bit ${b})`];
        const opts = [["Set", "Clear"], ["Set", "Clear"]];
        const ans = [bitOf(val, a) ? "Set" : "Clear", bitOf(val, b) ? "Set" : "Clear"];
        parts.push(segPart(rng, { id: "flags", label: "Flags", ask: `State of the ${names[a]} and ${names[b]} flags`, cols, answer: ans, opts, n: 4, hint: "Read each named bit from your binary number, counting from the right (bit 0)." }));
        const out = bitOf(val, a) === 1 && bitOf(val, b) === 0;
        parts.push(yesNo("out", "Output line", `The output line is ${names[a]} AND NOT ${names[b]}. Is it high (1)?`, out, "Substitute the two flag values: 1 AND NOT 0 is 1; every other combination is 0."));
      }
    }
    const n = TIER_PARTS[tier];
    const ex = [
      med ? `**Decimal:** 0x${hexOf(val)} = ${parseInt(hexOf(val)[0], 16)} × 16 + ${parseInt(hexOf(val)[1], 16)} = **${dec}**.` : `**Binary:** ${hexOf(val)[0]} = ${binOf(val).slice(0, 4)} and ${hexOf(val)[1]} = ${binOf(val).slice(4)}, so **${binOf(val)}**.`,
      med ? `**Bits set:** ${binOf(val)} has **${bits}** ones.` : tier === "hard" ? `**Bits set:** **${bits}** ones.` : `**Decimal:** ${parseInt(hexOf(val)[0], 16)} × 16 + ${parseInt(hexOf(val)[1], 16)} = **${dec}**.`,
      tier === "hard" ? `**${names[a]}:** bit ${a} of ${binOf(val)} is ${bitOf(val, a)}, so **${bitOf(val, a) ? "Yes" : "No"}**.` : `**Flags:** bit ${a} is ${bitOf(val, a)} (${bitOf(val, a) ? "Set" : "Clear"}) and bit ${b} is ${bitOf(val, b)} (${bitOf(val, b) ? "Set" : "Clear"}).`,
      `**Output:** ${names[a]} AND NOT ${names[b]} = ${bitOf(val, a)} AND NOT ${bitOf(val, b)} = **${bitOf(val, a) && !bitOf(val, b) ? "Yes" : "No"}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `A microcontroller's **${reg}** register reads **0x${hexOf(val)}**. Its bits are numbered from 0 at the right, and the flags are:\n\n${tableMd(names)}`,
      parts.slice(0, n), ex, "ec-status", { val, names, a, b, tier, n }, [],
      ["Convert the hex value to bits first; every later answer reads from the bits.", "Bits are numbered from 0 at the right-hand end."],
    );
  }
  return tooMany();
}

// R2 (expert+): mask operations on a register, hex text answers.
function genMask(rng) {
  for (let i = 0; i < TRY; i++) {
    const old = rng.int(1, 254);
    const names = flagTable(rng);
    const tmpl = rng.next() < 0.5 ? "clear" : "undo";
    if (tmpl === "clear") {
      const ks = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
      const clr = ks.slice(0, 2);
      const set = ks.slice(2, 4);
      if (!clr.some((k) => bitOf(old, k)) || set.every((k) => bitOf(old, k))) continue;
      const clrMask = clr.reduce((m, k) => m | (1 << k), 0);
      const setMask = set.reduce((m, k) => m | (1 << k), 0);
      const andMask = 255 - clrMask;
      const mid = old & andMask;
      const fin = mid | setMask;
      const pk = ks[4];
      const out = bitOf(fin, set[0]) === 1 && bitOf(fin, clr[0]) === 0;
      const parts = [
        { id: "andmask", label: "AND mask", ask: "The hex mask to AND with the register so that the cleared flags become 0 and all others stay (2 hex digits)", answerType: "text", answer: hexOf(andMask), accepts: hexAccepts(andMask), fuzzy: false, hint: "A mask for clearing has 0 in each flag to clear and 1 everywhere else; write its 8 bits, then convert to hex." },
        { id: "mid", label: "After clearing", ask: "Register after the AND (2 hex digits)", answerType: "text", answer: hexOf(mid), accepts: hexAccepts(mid), fuzzy: false, hint: "Write the old value in binary and AND it with the mask bit by bit: 1 AND 1 = 1, anything else 0." },
        { id: "final", label: "After setting", ask: "Register after the OR (2 hex digits)", answerType: "text", answer: hexOf(fin), accepts: hexAccepts(fin), fuzzy: false, hint: "OR with a mask that has 1 in each flag to set: 1 OR anything = 1, 0 OR 0 = 0." },
        yesNo("out", "Output line", `The output line is ${names[set[0]]} AND NOT ${names[clr[0]]}. Is it high (1) in the final register?`, out, "Read the two flags from the final register's bits; the output is high only for 1 AND NOT 0."),
      ];
      const ex = [
        `**AND mask:** clear bits ${clr.join(" and ")}: 1111 1111 with those bits 0 is ${binOf(andMask)} = **${hexOf(andMask)}**.`,
        `**After clearing:** ${binOf(old)} AND ${binOf(andMask)} = ${binOf(mid)} = **${hexOf(mid)}**.`,
        `**After setting:** ${binOf(mid)} OR ${binOf(setMask)} = ${binOf(fin)} = **${hexOf(fin)}**.`,
        `**Output:** ${names[set[0]]} is ${bitOf(fin, set[0])} and ${names[clr[0]]} is ${bitOf(fin, clr[0])}, so **${out ? "Yes" : "No"}**.`,
      ].join("\n\n");
      void pk;
      return finish(
        `A control register holds **0x${hexOf(old)}**. Firmware must clear the **${names[clr[0]]}** (bit ${clr[0]}) and **${names[clr[1]]}** (bit ${clr[1]}) flags with an AND, then set **${names[set[0]]}** (bit ${set[0]}) and **${names[set[1]]}** (bit ${set[1]}) with an OR. Bits are numbered from 0 at the right.\n\n${tableMd(names)}`,
        parts, ex, "ec-mask", { tmpl, old, clr, set, names }, [["_old", old]],
        ["Do the AND first, then the OR, one bit column at a time.", "Write each value as 8 bits before applying the mask."],
      );
    }
    const mask = rng.int(1, 254);
    if (popcount(mask) < 2 || mask === old) continue;
    const now = old ^ mask;
    const a = rng.int(0, 7);
    const b = (a + rng.int(1, 7)) % 8;
    const cols = [`${names[a]} (bit ${a})`, `${names[b]} (bit ${b})`];
    const opts = [["Set", "Clear"], ["Set", "Clear"]];
    const ans = [bitOf(old, a) ? "Set" : "Clear", bitOf(old, b) ? "Set" : "Clear"];
    const changed = popcount(mask);
    const parts = [
      { id: "before", label: "Before", ask: "The register before the XOR (2 hex digits)", answerType: "text", answer: hexOf(old), accepts: hexAccepts(old), fuzzy: false, hint: "XOR undoes itself: applying the same mask again restores the original. XOR the current value with the mask bit by bit." },
      { id: "bin", label: "Binary", ask: "The register before the XOR, as 8 binary digits", answerType: "text", answer: binOf(old), accepts: binAccepts(old), fuzzy: false, hint: "Each hex digit becomes four bits." },
      segPart(rng, { id: "flags", label: "Earlier flags", ask: `State of the ${names[a]} and ${names[b]} flags before the XOR`, cols, answer: ans, opts, n: 4, hint: "Read the named bits from the earlier value's binary form, counting from the right." }),
      { id: "toggled", label: "Bits toggled", ask: "How many bits the XOR toggled", answerType: "number", answer: changed, tolerance: 0, fuzzyNumber: 0, hint: "A bit toggles exactly where the mask has a 1." },
    ];
    const ex = [
      `**Before:** XOR is its own inverse, so ${binOf(now)} XOR ${binOf(mask)} = ${binOf(old)} = **${hexOf(old)}**.`,
      `**Binary:** **${binOf(old)}**.`,
      `**Flags:** bit ${a} is ${bitOf(old, a)} and bit ${b} is ${bitOf(old, b)}, so **${ans[0]}** and **${ans[1]}**.`,
      `**Toggled:** the mask ${binOf(mask)} has **${changed}** ones.`,
    ].join("\n\n");
    return finish(
      `Firmware toggled bits of a status register by XOR-ing it with the mask **0x${hexOf(mask)}**. The register now reads **0x${hexOf(now)}**. Bits are numbered from 0 at the right.\n\n${tableMd(names)}`,
      parts, ex, "ec-xor", { tmpl, old, mask, now, a, b }, [["_now", now], ["_mask", mask]],
      ["Work backwards: XOR with the same mask again undoes the change.", "Write each value as 8 bits before applying the mask."],
    );
  }
  return tooMany();
}

// ---------- sensor-data ----------

// S1: logging sensor data: bits per second, storage, time to fill, upload time.
function genLogger(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const rate = rng.pick([50, 80, 100, 160, 200, 250, 400, 500, 800, 1000, 1600, 2000]);
    const bits = rng.pick([8, 10, 12, 16, 24]);
    const mins = rng.pick([1, 2, 3, 5, 6, 10, 12, 15, 20, 30]);
    const cap = rng.pick([2, 4, 8, 16, 32]);
    const link = rng.pick([50, 100, 250, 500, 1000]);
    const ovh = rng.pick([10, 20, 25]);
    const sensor = rng.pick(["vibration sensor", "strain gauge", "microphone", "current clamp", "thermocouple array", "accelerometer", "load cell"]);
    const st = (rd) => {
      const kbps = rd("kbps", (rate * bits) / 1000);
      const kB = rd("kB", (kbps * 60 * mins) / 8);
      const MBd = rd("MBd", (kbps * 86400) / 8 / 1000);
      const days = rd("days", (cap * 1000) / MBd);
      const up = rd("up", (MBd * 8000) / (link * (1 - ovh / 100)) / 3600);
      const MBh = rd("MBh", (kbps * 3600) / 8 / 1000);
      const hrs = rd("hrs", (cap * 1000) / MBh);
      return { kbps, kB, MBd, days, up, MBh, hrs };
    };
    const dpsAll = { kbps: 2, kB: 1, MBd: 0, days: 1, up: 1, MBh: 1, hrs: 1 };
    const pl = med ? ["kbps", "kB"] : tier === "hard" ? ["kbps", "MBh", "hrs"] : ["kbps", "MBd", "days", "up"];
    const dps = Object.fromEntries(pl.map((k) => [k, dpsAll[k]]));
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (r.kB < 5 || (!med && (r.days < 0.5 || r.days > 400 || r.up < 0.1 || r.up > 80 || r.hrs < 0.5))) continue;
    const defs = {
      kbps: numPart("kbps", "Data rate", "Raw data rate (kbit/s)", r.kbps, 2, "Bits per second = samples per second × bits per sample; divide by 1000 for kbit/s."),
      kB: numPart("kB", "Storage", `Data in ${mins} minute${mins > 1 ? "s" : ""} (kB, 1 kB = 1000 bytes)`, r.kB, 1, "Multiply the data rate by the seconds, then divide by 8 to get bytes."),
      MBh: numPart("MBh", "Per hour", "Data per hour (MB, 1 MB = 10⁶ bytes)", r.MBh, 1, "kbit/s × 3600 s gives kilobits; ÷ 8 gives kilobytes; ÷ 1000 gives megabytes."),
      hrs: numPart("hrs", "Time to fill", `Hours until a ${cap} GB card is full (1 GB = 1000 MB)`, r.hrs, 1, "Divide the card's size in MB by the data per hour."),
      MBd: numPart("MBd", "Per day", "Data per day (MB, 1 MB = 10⁶ bytes)", r.MBd, 0, "kbit/s × 86 400 s, then ÷ 8 for kB and ÷ 1000 for MB.", true),
      days: numPart("days", "Time to fill", `Days until a ${cap} GB card is full (1 GB = 1000 MB)`, r.days, 1, "Divide the card's size in MB by the data per day."),
      up: numPart("up", "Upload time", "Hours to upload one day's data", r.up, 1, `Only ${100 - ovh}% of the link carries data. Daily megabytes × 8 000 gives kilobits; divide by the usable kbit/s, then by 3600.`),
    };
    const ex = {
      kbps: `**Data rate:** ${rate} × ${bits} ÷ 1000 = **${fixed(r.kbps, 2)} kbit/s**.`,
      kB: `**Storage:** ${fixed(r.kbps, 2)} × ${60 * mins} s ÷ 8 = **${fixed(r.kB, 1)} kB**.`,
      MBh: `**Per hour:** ${fixed(r.kbps, 2)} × 3600 ÷ 8 ÷ 1000 = **${fixed(r.MBh, 1)} MB**.`,
      hrs: `**Time to fill:** ${cap * 1000} MB ÷ ${fixed(r.MBh, 1)} MB/h = **${fixed(r.hrs, 1)} h**.`,
      MBd: `**Per day:** ${fixed(r.kbps, 2)} × 86 400 ÷ 8 ÷ 1000 = **${fixed(r.MBd, 0)} MB**.`,
      days: `**Time to fill:** ${cap * 1000} MB ÷ ${fixed(r.MBd, 0)} MB/day = **${fixed(r.days, 1)} days**.`,
      up: `**Upload:** ${fixed(r.MBd, 0)} MB × 8000 ÷ (${link} × ${(100 - ovh) / 100}) ÷ 3600 = **${fixed(r.up, 1)} h**.`,
    };
    const sd = tier === "expert" ? ` The card holds ${cap} GB. A day's data is uploaded over a ${link} kbit/s link, of which ${ovh}% is lost to protocol overhead.` : tier === "hard" ? ` The logger writes to a ${cap} GB card.` : "";
    return finish(
      `A **${sensor}** is sampled **${rate} times per second**, and each sample is stored as **${bits} bits**.${sd}`,
      pl.map((k) => defs[k]), pl.map((k) => ex[k]).join("\n\n"), "ec-log", { rate, bits, mins, cap, link, ovh, tier }, [["_rate", rate], ["_bits", bits]].concat(med ? [["_mins", mins]] : [["_cap", cap]]).concat(tier === "expert" ? [["_link", link], ["_ovh", ovh]] : []),
      ["Start with the raw bits per second, then scale to the time or size asked.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// S2: an ADC: levels, step size, voltage of a code, bits needed, code of a voltage.
function genAdc(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const n = rng.pick([8, 10, 12]);
    const Vref = rng.pick([2.5, 3.3, 5]);
    const code = rng.int(20, 2 ** n - 20);
    const target = rng.pick([0.5, 1, 2, 5]);
    const Vin = rng.int(100, Math.round(Vref * 1000 - 100)) / 1000;
    const nodeName = rng.pick(["pressure sensor", "light sensor", "temperature probe", "battery monitor", "strain gauge"]);
    const st = (rd) => {
      const lev = rd("lev", 2 ** n);
      const step = rd("step", (Vref * 1000) / lev);
      const V = rd("V", (code * step) / 1000);
      const cd = rd("cd", (Vin * 1000) / step);
      return { lev, step, V, cd };
    };
    const need = Math.log2((Vref * 1000) / target);
    if (!med && tier === "expert" && Math.abs(need - Math.round(need)) < 0.1) continue;
    const pl = med ? ["lev", "step"] : tier === "hard" ? ["lev", "step", "V"] : ["step", "V", "bits", "cd"];
    const dpsAll = { lev: 0, step: 2, V: 3, cd: 0 };
    const dps = Object.fromEntries(pl.filter((k) => k !== "bits").map((k) => [k, dpsAll[k]]));
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const bitsNeeded = Math.ceil(need);
    const defs = {
      lev: numPart("lev", "Levels", `Number of levels the ${n}-bit converter can output`, r.lev, 0, "n bits give 2ⁿ different codes.", true),
      step: numPart("step", "Step size", "Size of one step (mV)", r.step, 2, "One step is the reference voltage divided by the number of levels; use millivolts."),
      V: numPart("V", "Voltage", `Input voltage when the code reads ${code} (V)`, r.V, 3, "Voltage = code × step size (convert mV back to V)."),
      bits: numPart("bits", "Bits needed", `Smallest number of bits for a step of at most ${target} mV (a whole number)`, bitsNeeded, 0, "Need 2ⁿ ≥ reference in mV ÷ target step. Take log₂ and round up.", true),
      cd: numPart("cd", "Code", `Code the converter outputs for an input of ${Vin} V (nearest whole code)`, r.cd, 0, "Code = input voltage ÷ step size (same units), rounded to the nearest whole number.", true),
    };
    const ex = {
      lev: `**Levels:** 2^${n} = **${r.lev}**.`,
      step: `**Step size:** ${Vref * 1000} mV ÷ ${r.lev} = **${fixed(r.step, 2)} mV**.`,
      V: `**Voltage:** ${code} × ${fixed(r.step, 2)} mV = ${fmt(code * r.step, 1)} mV = **${fixed(r.V, 3)} V**.`,
      bits: `**Bits needed:** ${Vref * 1000} ÷ ${target} = ${fmt((Vref * 1000) / target, 1)}, log₂ of that is ${fmt(need, 2)}, rounded up gives **${bitsNeeded}**.`,
      cd: `**Code:** ${Vin * 1000} mV ÷ ${fixed(r.step, 2)} mV = **${fixed(r.cd, 0)}**.`,
    };
    const lead = med ? `A ${nodeName} feeds ${n === 8 || n === 11 || n === 18 ? "an" : "a"} **${n}-bit** analogue-to-digital converter whose reference voltage is **${Vref} V**.` : `A ${nodeName} feeds ${n === 8 || n === 11 || n === 18 ? "an" : "a"} **${n}-bit** analogue-to-digital converter with a **${Vref} V** reference. Code 0 means 0 V and the full range is divided equally into 2ⁿ steps.`;
    const extra = tier === "expert" ? ` The design needs steps of at most **${target} mV**, and the sensor currently reads **${Vin} V**.` : "";
    const given = [["_bits", n], ["_vref", Vref]].concat(tier === "hard" ? [["_code", code]] : tier === "expert" ? [["_target", target], ["_vin", Vin]] : []);
    if (tier === "expert") given.push(["_code", code]);
    const exPrompt = tier === "expert" ? ` One reading gave code **${code}**.` : tier === "hard" ? ` One reading gave code **${code}**.` : "";
    return finish(
      `${lead}${exPrompt}${extra}`,
      pl.map((k) => defs[k]), pl.map((k) => ex[k]).join("\n\n"), "ec-adc", { n, Vref, code, target, Vin, tier }, given,
      ["The converter splits the reference voltage into 2ⁿ equal steps; everything follows from the step size.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// S3 (expert+): work backwards from a storage budget to the sample rate, then judge a design.
function genBudget(rng) {
  for (let i = 0; i < TRY; i++) {
    const cap = rng.pick([4, 8, 16, 32, 64]);
    const days = rng.pick([7, 14, 30, 60]);
    const bits = rng.pick([8, 12, 16, 24]);
    const ratio = rng.pick([1.5, 2, 2.5, 4]);
    const f = rng.pick([20, 50, 100, 200, 400, 500]);
    const st = (rd) => {
      const per = rd("per", (cap * 1000) / days);
      const raw = rd("raw", per * ratio);
      const hz = rd("hz", (raw * 1e6 * 8) / (86400 * bits));
      return { per, raw, hz };
    };
    const dps = { per: 1, raw: 0, hz: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const prop = rng.pick([1.2, 1.5, 2.2, 2.5, 3, 4, 5, 8]) * f;
    const R = roundTo(prop, 0);
    if (r.hz < 5 || r.hz > 20000 || Math.abs(R / (2 * f) - 1) < 0.05 || Math.abs(R / r.hz - 1) < 0.05) continue;
    const nyq = R >= 2 * f;
    const fits = R <= r.hz;
    const cols = ["Meets Nyquist", "Fits the card"];
    const opts = [["Yes", "No"], ["Yes", "No"]];
    const answer = [nyq ? "Yes" : "No", fits ? "Yes" : "No"];
    const parts = [
      numPart("per", "Daily budget", `Compressed data allowed per day (MB, 1 MB = 10⁶ bytes, 1 GB = 1000 MB)`, r.per, 1, "Divide the card's size in MB by the number of days."),
      numPart("raw", "Raw budget", "Raw (uncompressed) data per day that this allows (MB)", r.raw, 0, "Compression divides the size by the ratio, so the raw amount is the daily budget times the ratio.", true),
      numPart("hz", "Max sample rate", "Highest sample rate the budget allows (Hz)", r.hz, 1, "Raw bits per day = rate × bits per sample × 86 400 s. Convert the raw megabytes to bits and solve for the rate."),
      segPart(rng, { id: "design", label: "Design check", ask: `A design samples at ${R} Hz. Check both rules`, cols, answer, opts, n: 4, hint: "Nyquist: the rate must be at least twice the highest signal frequency. Storage: the rate must not exceed the maximum from the budget." }),
    ];
    const ex = [
      `**Daily budget:** ${cap * 1000} MB ÷ ${days} days = **${fixed(r.per, 1)} MB**.`,
      `**Raw budget:** ${fixed(r.per, 1)} × ${ratio} = **${fixed(r.raw, 0)} MB**.`,
      `**Max rate:** ${fixed(r.raw, 0)} × 10⁶ × 8 ÷ (86 400 × ${bits}) = **${fixed(r.hz, 1)} Hz**.`,
      `**Design check:** Nyquist needs at least 2 × ${f} = ${2 * f} Hz, and ${R} Hz is ${nyq ? "enough" : "too low"}. Storage allows up to ${fixed(r.hz, 1)} Hz, and ${R} Hz is ${fits ? "within" : "above"} that. So **${answer.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `A remote logger must record for **${days} days** on a **${cap} GB** card. Each sample is **${bits} bits**, and the data is compressed to **1/${ratio}** of its raw size before it is written. The signal being measured has a highest frequency of **${f} Hz**. Nyquist rule: the sample rate must be at least twice that frequency.`,
      parts, ex, "ec-budget", { cap, days, bits, ratio, f, R }, [["_cap", cap], ["_days", days], ["_bits", bits], ["_ratio", ratio], ["_fmax", f]],
      ["Work backwards from the card: daily budget, raw size, then the rate that fills it exactly.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// ---------- entry points ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  const coin = rng.next() < 0.5;
  if (subtopic === "power-circuit") return plus ? genBack(rng) : genNet(rng, difficulty);
  if (subtopic === "battery-energy") return plus ? genPack(rng) : genBattery(rng, difficulty);
  if (subtopic === "register-flags") return plus ? genMask(rng) : genStatus(rng, difficulty);
  if (subtopic === "sensor-data") return plus ? genBudget(rng) : coin ? genLogger(rng, difficulty) : genAdc(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route where one exists. A number
// must be within its rounding tolerance of the true value; a choice or text answer must match exactly
// (text answers are read as numbers in their base, so spacing, prefix and case do not matter).

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");
const inv = (...rs) => 1 / rs.reduce((s, x) => s + 1 / x, 0);
const bitsSet = (v) => v.toString(2).split("").filter((c) => c === "1").length;
const SB = (v, k) => (v & (1 << k) ? "Set" : "Clear");
// Truth for a text part: { base, v } compared as a number in that base.
const T = (base, v) => ({ base, v });
function textMatches(cand, t) {
  let s = String(cand).trim().replace(/\s+/g, "");
  if (t.base === 16) { s = s.replace(/^0x/i, ""); if (!/^[0-9a-f]{1,2}$/i.test(s)) return false; return parseInt(s, 16) === t.v; }
  s = s.replace(/^0b/i, "");
  if (!/^[01]{1,8}$/.test(s)) return false;
  return parseInt(s, 2) === t.v;
}

const ALT = {
  "ec-net": (p) => {
    const Rt = p.med ? (p.ser ? p.R1 + p.R2 : inv(p.R1, p.R2)) : p.R1 + inv(p.R2, p.R3);
    const I = p.V / Rt;
    const out = { Rt, I, P: I * I * Rt };
    if (p.exp) out.fuse = `${FUSES.find((f) => f > I)} A`;
    return out;
  },
  "ec-back": (p) => {
    const Rt = (p.V / (p.P / p.V)); // V ÷ I
    const g3 = 1 / (Rt - p.R1) - 1 / p.R2;
    const I = p.P / p.V;
    const fuse = FUSES.find((f) => f > I);
    return { Rt, R3: 1 / g3, I, fuse: `${fuse} A | ${CABLES.find((c) => c >= fuse)} A` };
  },
  "ec-batt": (p) => {
    const Wh = (p.C / 1000) * p.V;
    const use = Wh * (p.med ? 1 : p.D / 100);
    return { Wh, use, T: use / p.P, cost: (Wh / (p.eff / 100) / 1000) * p.tariff * 100 };
  },
  "ec-pack": (p) => {
    const Wh = p.P * p.T / (p.D / 100);
    const cap = (Wh * 1000) / p.V;
    const strings = Math.ceil(cap / p.cellC - 1e-9);
    return { Wh, cap, strings, ok: YN(p.offeredP * p.cellC >= cap) };
  },
  "ec-status": (p) => {
    const val = parseInt(binOf(p.val), 2);
    const out = {
      dec: val, ones: bitsSet(val), bin: T(2, val),
      flag: YN(((val >> p.a) & 1) === 1),
      flags: `${SB(val, p.a)} | ${SB(val, p.b)}`,
      out: YN(!!(val & (1 << p.a)) && !(val & (1 << p.b))),
    };
    return out;
  },
  "ec-mask": (p) => {
    const clrMask = p.clr.reduce((m, k) => m | (1 << k), 0);
    const setMask = p.set.reduce((m, k) => m | (1 << k), 0);
    const andMask = ~clrMask & 255;
    const mid = p.old & andMask;
    const fin = mid | setMask;
    return { andmask: T(16, andMask), mid: T(16, mid), final: T(16, fin), out: YN(!!(fin & (1 << p.set[0])) && !(fin & (1 << p.clr[0]))) };
  },
  "ec-xor": (p) => {
    const before = p.now ^ p.mask;
    return { before: T(16, before), bin: T(2, before), flags: `${SB(before, p.a)} | ${SB(before, p.b)}`, toggled: bitsSet(p.mask) };
  },
  "ec-log": (p) => {
    const bps = p.rate * p.bits;
    const bytesMin = (bps * 60 * p.mins) / 8;
    const bytesDay = (bps * 86400) / 8;
    return {
      kbps: bps / 1000, kB: bytesMin / 1000, MBh: (bps * 3600) / 8 / 1e6, hrs: (p.cap * 1e9) / ((bps * 3600) / 8),
      MBd: bytesDay / 1e6, days: (p.cap * 1e9) / bytesDay, up: ((bytesDay * 8) / (p.link * 1000 * (1 - p.ovh / 100))) / 3600,
    };
  },
  "ec-adc": (p) => {
    const lev = Math.pow(2, p.n);
    const stepV = p.Vref / lev;
    return { lev, step: stepV * 1000, V: p.code * stepV, bits: Math.ceil(Math.log((p.Vref * 1000) / p.target) / Math.LN2 - 1e-9), cd: p.Vin / stepV };
  },
  "ec-budget": (p) => {
    const per = (p.cap * 1e9) / p.days / 1e6;
    const raw = per * p.ratio;
    const hz = (raw * 1e6 * 8) / p.bits / 86400;
    return { per, raw, hz, design: `${YN(p.R >= 2 * p.f)} | ${YN(p.R <= hz)}` };
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
      const dp = p.dps[part.id];
      const tol = dp === undefined ? 0 : tolOf(dp);
      if (!near(partNum(answer, part.id), tv, tol)) return false;
    } else if (typeof tv === "object") {
      if (!textMatches(partStr(answer, part.id), tv)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
