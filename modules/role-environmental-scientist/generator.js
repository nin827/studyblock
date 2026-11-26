// Environmental Scientist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// a chained answer does not change when worked from an earlier rounded answer (redrawn inside generate),
// no answer sits on a rounding half-step, and verdict parts are decided first and then fitted well clear of
// their threshold. All figures are made up and every factor, limit and rule is an exercise rule stated in
// each prompt ("for this exercise"), not a regulation, a real place or advice.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   river-mixing     flow-weighted mixing at an outfall -> mixed concentration -> load -> limit verdict;
//                    expert-plus: two outfalls in sequence
//   carbon-footprint activity x emission factor -> total -> share -> cut vs target; expert-plus: offsets to close the gap
//   sampling-plan    mean, count above a guideline, sample size by a stated rule, cost; expert-plus: area-weighted zones
//   rainfall-runoff  area x rainfall x runoff coefficient -> volume -> capture -> days of supply, tanks, monthly storage

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-6;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? "" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 40000;
const tooMany = () => { throw new Error("role-environmental-scientist: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => `$${commas(Math.round(n))}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return fr > 0.1 && fr < 0.9; };
const stab = (exact, fromRounded, dp) => roundTo(exact, dp) === roundTo(fromRounded, dp);
const sumOf = (a) => a.reduce((s, x) => s + x, 0);

function numPart(id, label, ask, val, dp, hint) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function choicePart(rng, id, label, ask, options, answer, hint) {
  return { id, label, ask, answerType: "choice", answer, choices: shuffled(rng, options), hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- river-mixing ----------

const KG_DAY = 86.4; // 1 m3/s carrying 1 mg/L moves 86.4 kg a day
const POLLUTANTS = ["ammonia", "phosphate", "nitrate", "a dissolved metal", "a detergent residue", "suspended solids"];
const SITES = ["a lowland river", "a river below a market town", "a valley stream", "a river beside an industrial estate"];
const mixRule = "Assume the outfall mixes completely with the river. Mixed concentration = (river flow × river concentration + outfall flow × outfall concentration) ÷ (river flow + outfall flow).";
const loadRule = "1 m³/s of water carrying 1 mg/L moves 86.4 kg of the substance a day.";

function pickLimit(rng, val, exceeds) {
  const L = Math.round(val * rng.pick(exceeds ? [0.6, 0.7, 0.8, 0.85] : [1.15, 1.25, 1.4, 1.6]) * 10) / 10;
  if (L < 0.3 || Math.abs(val - L) < Math.max(0.1, 0.09 * val) || (val > L) !== exceeds) return null;
  return L;
}
const SITE_OPTS = ["Neither site", "After outfall 1 only", "After outfall 2 only", "Both sites"];

function genMix(rng, tier) {
  const wantYes = rng.next() < 0.5, wantPat = rng.pick(SITE_OPTS);
  for (let i = 0; i < TRY; i++) {
    const pol = rng.pick(POLLUTANTS), site = rng.pick(SITES);
    const Qr = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25, 30]), Cr = rng.int(2, 30) / 10;
    const Qe = rng.pick([0.2, 0.4, 0.5, 0.8, 1, 1.5, 2, 2.5, 3]), Ce = rng.int(8, 120);
    const Qm = Qr + Qe, Cm = (Qr * Cr + Qe * Ce) / Qm;
    if (Cm < 1.5 || Cm > 40 || nearHalf(Cm, 2, 0.06)) continue;
    const base = `${cap(site)} carries **${f(Qr)} m³/s** of water with **${f(Cr)} mg/L** of ${pol}. A treatment works discharges **${f(Qe)} m³/s** at **${f(Ce)} mg/L**. ${mixRule}`;
    const exMix = `**Mixed concentration:** (${f(Qr)} × ${f(Cr)} + ${f(Qe)} × ${f(Ce)}) ÷ (${f(Qr)} + ${f(Qe)}) = ${f(roundTo(Qr * Cr + Qe * Ce, 3))} ÷ ${f(Qm)} = **${f(roundTo(Cm, 2))} mg/L**.`;
    const pMix = numPart("mix", "Mixed concentration", "Concentration in the river just below the outfall (mg/L)", Cm, 2, "Weight each concentration by its flow: add (flow × concentration) for the river and the outfall, then divide by the combined flow.");
    const given = [["_qr", Qr], ["_cr", Cr], ["_qe", Qe], ["_ce", Ce]];
    if (tier === "medium") {
      if (!isEx(Qm, 1)) continue;
      const parts = [numPart("flow", "Combined flow", "Combined flow below the outfall (m³/s)", Qm, 1, "The river and the outfall flows add."), pMix];
      return finish(base, parts, `**Combined flow:** ${f(Qr)} + ${f(Qe)} = **${f(Qm)} m³/s**.\n\n${exMix}`, "env-mix1", { tier, Qr, Cr, Qe, Ce }, given,
        ["Add the flows, then weight the concentrations by flow.", "Total pollutant per second divided by total flow."]);
    }
    const loadO = Qe * Ce * KG_DAY;
    if (nearHalf(loadO, 0, 0.08)) continue;
    if (tier === "hard") {
      const L = pickLimit(rng, Cm, !wantYes);
      if (L === null) continue;
      const ok = Cm <= L;
      const parts = [pMix, numPart("load", "Outfall load", "Mass of the substance the outfall adds each day (kg/day)", loadO, 0, "Outfall flow times outfall concentration, then the stated 86.4 kg/day conversion."),
        yesNo("ok", "Within the limit?", `For this exercise the limit just below the outfall is **${f(L)} mg/L**. Is the mixed concentration at or below it?`, ok, "Compare the mixed concentration with the limit.")];
      return finish(`${base} ${loadRule}`, parts, `${exMix}\n\n**Outfall load:** ${f(Qe)} × ${f(Ce)} × 86.4 = **${f(roundTo(loadO, 0))} kg/day**.\n\n**Verdict:** ${f(roundTo(Cm, 2))} is ${ok ? "at or below" : "above"} ${f(L)}, so within the limit: **${YN(ok)}**.`,
        "env-mix2", { tier, Qr, Cr, Qe, Ce, L }, [...given, ["_limit", L]], ["Mixed concentration first; the load needs only the outfall's own flow and concentration.", "At or below the limit means within it."]);
    }
    if (tier === "expert") {
      const L = pickLimit(rng, Cm, !wantYes);
      if (L === null) continue;
      const ok = Cm <= L, loadR = Qr * Cr * KG_DAY;
      if (nearHalf(loadR, 0, 0.08) || loadR < 100) continue;
      const share = (loadO / (loadO + loadR)) * 100;
      const shareR = (roundTo(loadO, 0) / (roundTo(loadO, 0) + roundTo(loadR, 0))) * 100;
      if (nearHalf(share, 1, 0.1) || !stab(share, shareR, 1)) continue;
      const parts = [pMix, yesNo("ok", "Within the limit?", `For this exercise the limit just below the outfall is **${f(L)} mg/L**. Is the mixed concentration at or below it?`, ok, "Compare the mixed concentration with the limit."),
        numPart("rload", "River load", "Mass of the substance the river already carries each day (kg/day)", loadR, 0, "River flow times river concentration, then the stated 86.4 kg/day conversion."),
        numPart("share", "Outfall's share", "Percentage of the total daily load below the outfall that comes from the outfall", share, 1, "Outfall load divided by the sum of the river's load and the outfall's load.")];
      return finish(`${base} ${loadRule}`, parts, `${exMix}\n\n**Verdict:** ${f(roundTo(Cm, 2))} is ${ok ? "at or below" : "above"} ${f(L)}: **${YN(ok)}**.\n\n**River load:** ${f(Qr)} × ${f(Cr)} × 86.4 = **${f(roundTo(loadR, 0))} kg/day**; outfall load ${f(Qe)} × ${f(Ce)} × 86.4 = ${f(roundTo(loadO, 0))} kg/day.\n\n**Share:** ${f(roundTo(loadO, 0))} ÷ (${f(roundTo(loadO, 0))} + ${f(roundTo(loadR, 0))}) × 100 = **${f(roundTo(share, 1))}%**.`,
        "env-mix3", { tier, Qr, Cr, Qe, Ce, L }, [...given, ["_limit", L]], ["Mixed concentration, then the verdict.", "Both loads use the same conversion, so the share is also a share of the flow-weighted amounts."]);
    }
    // expert-plus: a second outfall further downstream
    const Q2 = rng.pick([0.3, 0.5, 0.8, 1, 1.5, 2]), Ce2 = rng.int(5, 90);
    const C1 = Cm, Q1 = Qm, Qt = Q1 + Q2, C2 = (Q1 * C1 + Q2 * Ce2) / Qt;
    const C2r = (Q1 * roundTo(C1, 2) + Q2 * Ce2) / Qt;
    if (nearHalf(C2, 2, 0.06) || !stab(C2, C2r, 2) || C2 < 1.2) continue;
    const loadT = (Qr * Cr + Qe * Ce + Q2 * Ce2) * KG_DAY;
    if (nearHalf(loadT, 0, 0.08)) continue;
    let L;
    const hi = Math.max(C1, C2), lo = Math.min(C1, C2);
    if (wantPat === "Both sites") L = Math.round(lo * 0.75 * 10) / 10;
    else if (wantPat === "Neither site") L = Math.round(hi * 1.3 * 10) / 10;
    else if (wantPat === "After outfall 1 only") { if (!(C1 > C2)) continue; L = Math.round(((C1 + C2) / 2) * 10) / 10; }
    else { if (!(C2 > C1)) continue; L = Math.round(((C1 + C2) / 2) * 10) / 10; }
    const e1 = C1 > L, e2 = C2 > L;
    const pat = e1 && e2 ? "Both sites" : e1 ? "After outfall 1 only" : e2 ? "After outfall 2 only" : "Neither site";
    if (pat !== wantPat || L < 0.3 || Math.abs(C1 - L) < Math.max(0.12, 0.08 * L) || Math.abs(C2 - L) < Math.max(0.12, 0.08 * L)) continue;
    const parts = [
      numPart("c1", "After outfall 1", "Concentration just below the first outfall (mg/L)", C1, 2, "Flow-weighted mix of the river and outfall 1."),
      numPart("c2", "After outfall 2", "Concentration just below the second outfall (mg/L)", C2, 2, "The water leaving the first mix is now the 'river' for outfall 2, with the combined flow."),
      numPart("load", "Total load", "Mass of the substance passing the second site each day (kg/day)", loadT, 0, "Add the three daily masses (river, outfall 1, outfall 2), each as flow × concentration × 86.4."),
      choicePart(rng, "sites", "Sites over the limit", `For this exercise the limit is **${f(L)} mg/L** at both sites (just below each outfall). Which sites exceed it?`, SITE_OPTS, pat, "Compare each mixed concentration with the limit; strictly above it exceeds."),
    ];
    const ex = `**After outfall 1:** (${f(Qr)} × ${f(Cr)} + ${f(Qe)} × ${f(Ce)}) ÷ ${f(Q1)} = **${f(roundTo(C1, 2))} mg/L**, flow ${f(Q1)} m³/s.\n\n**After outfall 2:** (${f(Q1)} × ${f(roundTo(C1, 2))} + ${f(Q2)} × ${f(Ce2)}) ÷ ${f(Qt)} = **${f(roundTo(C2, 2))} mg/L**.\n\n**Total load:** (${f(Qr)} × ${f(Cr)} + ${f(Qe)} × ${f(Ce)} + ${f(Q2)} × ${f(Ce2)}) × 86.4 = **${f(roundTo(loadT, 0))} kg/day**.\n\n**Limit ${f(L)} mg/L:** ${f(roundTo(C1, 2))} and ${f(roundTo(C2, 2))} give **${pat}**.`;
    return finish(`${cap(site)} carries **${f(Qr)} m³/s** with **${f(Cr)} mg/L** of ${pol}. Outfall 1 discharges **${f(Qe)} m³/s** at **${f(Ce)} mg/L**. Further downstream, outfall 2 discharges **${f(Q2)} m³/s** at **${f(Ce2)} mg/L**, after the first discharge has fully mixed. ${mixRule} ${loadRule}`,
      parts, ex, "env-mix4", { tier, Qr, Cr, Qe, Ce, Q2, Ce2, L }, [...given, ["_q2", Q2], ["_c2", Ce2], ["_limit", L]],
      ["Do the mix twice: the first result becomes the river for the second outfall.", "Loads simply add, because mass is conserved."]);
  }
  return tooMany();
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- carbon-footprint ----------

const SITES_CF = ["a school campus", "a food factory", "an office park", "a bus depot", "a distribution warehouse"];
const FE = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
const FV = [0.12, 0.15, 0.18, 0.2, 0.25, 0.3];
const FG = [1.9, 2.0, 2.1, 2.2];
const FE2 = [0.02, 0.04, 0.05, 0.06, 0.08, 0.1];
const cfRule = "Emissions = activity × emission factor, in kg CO₂e (carbon dioxide equivalent). 1 tonne = 1000 kg. The factors in this question are made up for this exercise.";

function genCarbon(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const site = rng.pick(SITES_CF);
    const kE = rng.int(20, 400), fe = rng.pick(FE), kV = rng.int(10, 200), fv = rng.pick(FV), kG = rng.int(2, 60), fg = rng.pick(FG);
    const E = kE * 1000, V = kV * 1000, G = kG * 1000;
    const tE = kE * fe, tV = kV * fv, tG = kG * fg; // tonnes, exact to 2 dp
    const act2 = `**${commas(E)} kWh** of electricity (**${f(fe)} kg CO₂e/kWh**) and **${commas(V)} km** driven by its vehicles (**${f(fv)} kg CO₂e/km**)`;
    const act3 = `${act2} and **${commas(G)} m³** of gas (**${f(fg)} kg CO₂e/m³**)`;
    const given2 = [["_kwh", E], ["_fe", fe], ["_km", V], ["_fv", fv]];
    const given3 = [...given2, ["_gas", G], ["_fg", fg]];
    const pE = numPart("elec", "Electricity", "Yearly emissions from electricity (tonnes CO₂e)", tE, 2, "Electricity use times its factor gives kg; divide by 1000 for tonnes.");
    if (tier === "medium") {
      const parts = [pE, numPart("total", "Total", "Total yearly emissions from electricity and vehicles (tonnes CO₂e)", tE + tV, 2, "Work out the vehicle emissions the same way, then add the two sources.")];
      return finish(`${cap(site)} uses ${act2} in a year. ${cfRule}`, parts, `**Electricity:** ${commas(E)} × ${f(fe)} = ${commas(Math.round(E * fe))} kg = **${f(roundTo(tE, 2))} t**.\n\n**Vehicles:** ${commas(V)} × ${f(fv)} = ${commas(Math.round(V * fv))} kg = ${f(roundTo(tV, 2))} t.\n\n**Total:** ${f(roundTo(tE, 2))} + ${f(roundTo(tV, 2))} = **${f(roundTo(tE + tV, 2))} t**.`,
        "env-cf1", { tier, E, fe, V, fv }, given2, ["Each source is activity × factor; convert kg to tonnes at the end.", "Add the two sources."]);
    }
    const T0 = tE + tV + tG;
    const exAll = `**Electricity:** ${commas(E)} × ${f(fe)} = **${f(roundTo(tE, 2))} t**. **Vehicles:** ${commas(V)} × ${f(fv)} = ${f(roundTo(tV, 2))} t. **Gas:** ${commas(G)} × ${f(fg)} = ${f(roundTo(tG, 2))} t.\n\n**Total:** **${f(roundTo(T0, 2))} t**.`;
    const pT = numPart("total", "Total", "Total yearly emissions from all three sources (tonnes CO₂e)", T0, 2, "Each source is activity × factor; convert to tonnes and add all three.");
    if (tier === "hard") {
      const share = (tE / T0) * 100;
      if (nearHalf(share, 1, 0.1) || share < 10 || share > 85) continue;
      const parts = [pE, pT, numPart("share", "Electricity's share", "Electricity's share of the total emissions (%)", share, 1, "Electricity's tonnes divided by the total tonnes, times 100.")];
      return finish(`${cap(site)} uses ${act3} in a year. ${cfRule}`, parts, `${exAll}\n\n**Share:** ${f(roundTo(tE, 2))} ÷ ${f(roundTo(T0, 2))} × 100 = **${f(roundTo(share, 1))}%**.`,
        "env-cf2", { tier, E, fe, V, fv, G, fg }, given3, ["Three sources, one total.", "The share compares one source with the total."]);
    }
    const fe2 = rng.pick(FE2);
    if (fe2 > fe - 0.06) continue;
    const t1 = kE * fe2 + tV + tG;
    if (tier === "expert") {
      const red = ((T0 - t1) / T0) * 100;
      if (nearHalf(red, 1, 0.1) || red < 3) continue;
      const x = Math.round(red + (wantYes ? -1 : 1) * rng.pick([2.5, 3.5, 5, 7]));
      if (x < 1 || (red >= x) !== wantYes || Math.abs(red - x) < 1.5) continue;
      const ok = red >= x;
      const parts = [pT, numPart("after", "After the switch", "Total yearly emissions once electricity comes from the green tariff (tonnes CO₂e)", t1, 2, "Only the electricity factor changes; vehicles and gas stay as they were."),
        numPart("red", "Reduction", "Reduction in total emissions from the switch (%)", red, 1, "The fall in the total divided by the original total, times 100."),
        yesNo("ok", "Meets the target?", `The target is a cut of at least **${x}%** from today's total. Does the switch alone meet it?`, ok, "Compare the reduction you found with the target.")];
      return finish(`${cap(site)} uses ${act3} in a year. It plans to switch its electricity to a green tariff with a factor of **${f(fe2)} kg CO₂e/kWh**. ${cfRule}`, parts,
        `${exAll}\n\n**After the switch:** electricity ${commas(E)} × ${f(fe2)} = ${f(roundTo(kE * fe2, 2))} t, so the total is ${f(roundTo(kE * fe2, 2))} + ${f(roundTo(tV, 2))} + ${f(roundTo(tG, 2))} = **${f(roundTo(t1, 2))} t**.\n\n**Reduction:** (${f(roundTo(T0, 2))} − ${f(roundTo(t1, 2))}) ÷ ${f(roundTo(T0, 2))} × 100 = **${f(roundTo(red, 1))}%**.\n\n**Target ${x}%:** ${f(roundTo(red, 1))}% is ${ok ? "at least" : "less than"} ${x}%: **${YN(ok)}**.`,
        "env-cf3", { tier, E, fe, fe2, V, fv, G, fg, x }, [...given3, ["_fe2", fe2]].slice(0, 8), ["Total now, then the total with the new electricity factor.", "Reduction as a percentage of the starting total."]);
    }
    // expert-plus: green tariff + fewer km + offsets for what is left
    const y = rng.pick([10, 20, 25, 40, 50]), x = rng.pick([20, 25, 30, 40, 50]), c = rng.pick([2, 5, 10, 20]), P = rng.pick([12, 15, 18, 20, 25, 30, 40]);
    const Vn = V * (1 - y / 100), t2 = kE * fe2 + (Vn * fv) / 1000 + tG, allowed = T0 * (1 - x / 100);
    if (!isEx(t2, 2) || !isEx(allowed, 2)) continue;
    const gap = t2 - allowed;
    if (gap < 1 || !fracOk(gap / c) || gap / c < 1.5 || gap / c > 60) continue;
    const credits = Math.ceil(gap / c);
    const parts = [numPart("new", "New total", "Yearly total after the green tariff and the reduced driving (tonnes CO₂e)", t2, 2, "Electricity uses the new factor, vehicles use the reduced distance, gas is unchanged."),
      numPart("gap", "Gap to target", "How many tonnes the new total is above the allowed total (tonnes CO₂e)", gap, 2, "Allowed total = today's total × (1 − the target %). Then take it from the new total."),
      numPart("credits", "Credits", `Offset credits needed, each covering ${c} tonnes (round up to a whole credit)`, credits, 0, "Divide the gap by the tonnes per credit and round up: a part-credit cannot be bought."),
      numPart("cost", "Offset cost", "Total cost of those credits ($)", credits * P, 0, "Whole credits times the price per credit.")];
    return finish(`${cap(site)} uses ${act3} in a year. It plans to switch its electricity to a green tariff (**${f(fe2)} kg CO₂e/kWh**) and to cut the distance driven by **${y}%**. Its target is a total at least **${x}% below today's total**. Any tonnes still above the target are covered by offset credits at **${money(P)}** each, each credit covering **${c} tonnes**. ${cfRule}`,
      parts, `${exAll}\n\n**New total:** electricity ${f(roundTo(kE * fe2, 2))} t + vehicles ${commas(Vn)} km × ${f(fv)} = ${f(roundTo((Vn * fv) / 1000, 2))} t + gas ${f(roundTo(tG, 2))} t = **${f(roundTo(t2, 2))} t**.\n\n**Allowed:** ${f(roundTo(T0, 2))} × (1 − ${x}%) = ${f(roundTo(allowed, 2))} t, so the gap is ${f(roundTo(t2, 2))} − ${f(roundTo(allowed, 2))} = **${f(roundTo(gap, 2))} t**.\n\n**Credits:** ${f(roundTo(gap, 2))} ÷ ${c} = ${f(roundTo(gap / c, 2))}, round up to **${credits}**; cost ${credits} × ${money(P)} = **${money(credits * P)}**.`,
      "env-cf4", { tier, E, fe, fe2, V, fv, G, fg, y, x, c, P }, [...given3, ["_fe2", fe2]].slice(0, 8), ["Find today's total first: it sets the allowed total.", "Credits come in whole units, so round the division up."]);
  }
  return tooMany();
}

// ---------- sampling-plan ----------

const SUBSTANCES = ["nitrate", "lead", "chloride", "phosphate", "zinc", "sulfate"];
const WATERS = ["a lake", "a borehole field", "a reservoir", "a stretch of river", "a pond system"];
const nRule = "Samples needed n = (2 × σ ÷ E)², rounded up to a whole sample, where σ is the spread of the readings (standard deviation) and E is the margin wanted.";

function drawReadings(rng) {
  const base = rng.pick([4, 5, 6, 8, 10, 12, 15]), spread = rng.pick([8, 12, 16, 20]);
  return Array.from({ length: 6 }, () => Math.round(base * 10 + rng.int(-spread, spread)) / 10);
}
const readText = (r) => r.map((v) => f(v)).join(", ");
const meanOf = (r) => sumOf(r) / r.length;
const sdOf = (r) => { const m = meanOf(r); return Math.sqrt(sumOf(r.map((x) => (x - m) ** 2)) / (r.length - 1)); };

function genSample(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const sub = rng.pick(SUBSTANCES), water = rng.pick(WATERS), r = drawReadings(rng);
    const m = meanOf(r);
    if (m < 2 || nearHalf(m, 2, 0.08)) continue;
    const pMean = numPart("mean", "Mean reading", "Mean of the six readings (mg/L)", m, 2, "Add the six readings and divide by six.");
    const exMean = `**Mean:** (${r.map(f).join(" + ")}) ÷ 6 = ${f(roundTo(sumOf(r), 1))} ÷ 6 = **${f(roundTo(m, 2))} mg/L**.`;
    const base = `Six readings of ${sub} at ${water}, in mg/L, were: ${readText(r)}.`;
    const givenR = r.map((v, k) => [`_r${k + 1}`, v]);
    if (tier === "medium") {
      const s = [...r].sort((a, b) => a - b), k = rng.int(1, 3);
      if (!(s[k + 1] > s[k])) continue;
      const G = Math.round((s[k] + 0.05) * 100) / 100, above = 6 - (k + 1);
      const parts = [pMean, numPart("above", "Readings above", "Number of readings above the guideline", above, 0, "Compare each reading with the guideline and count those greater than it.")];
      return finish(`${base} For this exercise the guideline is **${f(G)} mg/L**.`, parts, `${exMean}\n\n**Above ${f(G)}:** ${r.filter((v) => v > G).map(f).join(", ")}: **${above}** readings.`,
        "env-sp1", { tier, r, G }, [...givenR, ["_guide", G]], ["Mean first, then a reading-by-reading comparison.", "Strictly above the guideline counts."]);
    }
    const E = rng.pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5]);
    if (tier === "hard") {
      const sig = rng.pick([0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5]), rr = ((2 * sig) / E) ** 2;
      if (!fracOk(rr) || rr < 8 || rr > 400) continue;
      const n = Math.ceil(rr), F = rng.pick([200, 300, 500]), c = rng.pick([35, 40, 45, 60, 75, 80]);
      const parts = [pMean, numPart("n", "Samples needed", "Samples needed by the rule (round up to a whole sample)", n, 0, "Two times σ divided by E, squared, then round up."),
        numPart("cost", "Survey cost", "Cost of taking that many samples ($)", F + n * c, 0, "The fixed set-up fee plus the cost per sample times the number of samples.")];
      return finish(`${base} A repeat survey is planned. ${nRule} An earlier survey gave σ = **${f(sig)} mg/L** and the margin wanted is **E = ${f(E)} mg/L**. The survey costs a fixed **${money(F)}** plus **${money(c)}** per sample.`,
        parts, `${exMean}\n\n**Samples:** (2 × ${f(sig)} ÷ ${f(E)})² = ${f(roundTo(rr, 2))}, round up to **${n}**.\n\n**Cost:** ${money(F)} + ${n} × ${money(c)} = **${money(F + n * c)}**.`,
        "env-sp2", { tier, r, sig, E, F, c }, [...givenR, ["_sigma", sig]].slice(0, 8), ["Mean from the readings; sample size from σ and E.", "The cost does not depend on the readings."]);
    }
    const sd = sdOf(r);
    if (sd < 0.3 || nearHalf(sd, 2, 0.1)) continue;
    const rr = ((2 * sd) / E) ** 2, rr2 = ((2 * roundTo(sd, 2)) / E) ** 2;
    if (rr < 6 || rr > 300 || Math.ceil(rr) !== Math.ceil(rr2) || Math.abs(rr - Math.round(rr)) < 0.15 || Math.abs(rr2 - Math.round(rr2)) < 0.1) continue;
    const n = Math.ceil(rr);
    const pSd = numPart("sd", "Standard deviation", "Sample standard deviation of the six readings, dividing by n − 1 (mg/L)", sd, 2, "Find each reading's distance from the mean, square them, add, divide by 5, then take the square root.");
    const exSd = `**Spread:** squared distances from ${f(roundTo(m, 3))} add to ${f(roundTo(sumOf(r.map((x) => (x - m) ** 2)), 3))}; ÷ 5 = ${f(roundTo(sumOf(r.map((x) => (x - m) ** 2)) / 5, 3))}; square root = **${f(roundTo(sd, 2))} mg/L**.`;
    if (tier === "expert") {
      const G = Math.round((wantYes ? m * rng.pick([1.1, 1.2, 1.3]) : m * rng.pick([0.7, 0.8, 0.9])) * 10) / 10;
      if ((m <= G) !== wantYes || Math.abs(m - G) < Math.max(0.2, 0.07 * m)) continue;
      const parts = [pMean, pSd, numPart("n", "Samples needed", "Samples needed for a repeat survey, using this standard deviation as σ (round up to a whole sample)", n, 0, "Two times σ divided by E, squared, then round up."),
        yesNo("ok", "Mean within guideline?", `For this exercise the guideline is **${f(G)} mg/L**. Is the mean at or below it?`, m <= G, "Compare the mean with the guideline.")];
      return finish(`${base} ${nRule} Use the readings' own sample standard deviation as σ, with margin **E = ${f(E)} mg/L**.`, parts,
        `${exMean}\n\n${exSd}\n\n**Samples:** (2 × ${f(roundTo(sd, 2))} ÷ ${f(E)})² = ${f(roundTo(rr2, 2))}, round up to **${n}**.\n\n**Verdict:** ${f(roundTo(m, 2))} is ${m <= G ? "at or below" : "above"} ${f(G)}: **${YN(m <= G)}**.`,
        "env-sp3", { tier, r, E, G }, [...givenR, ["_E", E], ["_guide", G]].slice(0, 8), ["Mean, then spread around it.", "Put the spread into the sample-size rule."]);
    }
    // expert-plus: two zones weighted by area, plus samples still to take
    const aA = rng.int(3, 40), aB = rng.int(3, 40), mA = rng.int(30, 150) / 10, mB = rng.int(30, 150) / 10;
    if (Math.abs(mA - mB) < 1.5) continue;
    const wm = (aA * mA + aB * mB) / (aA + aB);
    if (nearHalf(wm, 2, 0.08)) continue;
    const G = Math.round((wantYes ? wm * rng.pick([1.1, 1.2, 1.3]) : wm * rng.pick([0.7, 0.8, 0.9])) * 10) / 10;
    if ((wm <= G) !== wantYes || Math.abs(wm - G) < Math.max(0.2, 0.07 * wm)) continue;
    const sig = rng.pick([0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5]), rz = ((2 * sig) / E) ** 2;
    if (!fracOk(rz) || rz < 15 || rz > 300) continue;
    const nn = Math.ceil(rz), k = rng.int(4, Math.max(5, Math.min(nn - 6, 40)));
    if (nn - k < 5) continue;
    const ex = nn - k, c = rng.pick([35, 40, 45, 60, 75, 80]);
    const parts = [numPart("wm", "Area-weighted mean", "Area-weighted mean concentration of the whole site (mg/L)", wm, 2, "Multiply each zone's mean by its area, add, and divide by the total area."),
      yesNo("ok", "Within guideline?", `For this exercise the guideline is **${f(G)} mg/L**. Is the area-weighted mean at or below it?`, wm <= G, "Compare the weighted mean with the guideline."),
      numPart("extra", "Samples still to take", "Further samples still needed (round the requirement up to a whole sample first)", ex, 0, "Work out n from σ and E, round up, then take off the samples already taken."),
      numPart("cost", "Cost of those", "Cost of the further samples ($)", ex * c, 0, "Samples still to take times the cost per sample.")];
    return finish(`${cap(water)} has two zones. **Zone A** covers **${aA} ha** with a mean of **${f(mA)} mg/L** of ${sub}; **Zone B** covers **${aB} ha** with a mean of **${f(mB)} mg/L**. ${nRule} Here σ = **${f(sig)} mg/L** and E = **${f(E)} mg/L**; **${k}** samples have been taken already, and each further sample costs **${money(c)}**.`,
      parts, `**Weighted mean:** (${aA} × ${f(mA)} + ${aB} × ${f(mB)}) ÷ ${aA + aB} = **${f(roundTo(wm, 2))} mg/L**.\n\n**Verdict:** ${f(roundTo(wm, 2))} is ${wm <= G ? "at or below" : "above"} ${f(G)}: **${YN(wm <= G)}**.\n\n**Samples:** (2 × ${f(sig)} ÷ ${f(E)})² = ${f(roundTo(rz, 2))}, round up to ${nn}; ${nn} − ${k} = **${ex}** more.\n\n**Cost:** ${ex} × ${money(c)} = **${money(ex * c)}**.`,
      "env-sp4", { tier, aA, aB, mA, mB, G, sig, E, k, c }, [["_aA", aA], ["_mA", mA], ["_aB", aB], ["_mB", mB], ["_sigma", sig], ["_E", E], ["_taken", k], ["_cost", c]],
      ["Weight by area, not by a plain average of the two zones.", "The sample-size rule gives the total; some are already done."]);
  }
  return tooMany();
}

// ---------- rainfall-runoff ----------

const AREAS = ["a school site", "a new housing estate", "a market garden", "a small depot", "a sports ground"];
const rainRule = "1 hectare = 10 000 m², and 1 mm of rain on 1 m² is 1 litre. Runoff volume = catchment area × rainfall depth × runoff coefficient (the share of the rain that runs off).";

function genRain(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const place = rng.pick(AREAS);
    if (tier === "medium" || tier === "hard") {
      const A = rng.int(2, 40), mm = 5 * rng.int(2, 18), C = rng.int(2, 18) * 0.05;
      const V = A * 10 * mm * C;
      if (!isEx(V, 0) || V < 60 || V > 20000) continue;
      const given = [["_area", A], ["_rain", mm], ["_coeff", +C.toFixed(2)]];
      const pV = numPart("vol", "Runoff volume", "Runoff volume from the storm (m³)", V, 0, "Area in hectares × 10 gives m³ per mm of rain; times the depth in mm; times the coefficient.");
      const exV = `**Runoff:** ${A} ha × 10 = ${A * 10} m³ per mm; × ${mm} mm × ${f(+C.toFixed(2))} = **${commas(Math.round(V))} m³**.`;
      if (tier === "medium") {
        const K = Math.round((V * rng.pick([0.6, 0.75, 1.25, 1.5, 2])) / 50) * 50;
        const pct = (V / K) * 100;
        if (K < 100 || nearHalf(pct, 1, 0.1)) continue;
        const parts = [pV, numPart("pct", "Pond filled", "Percentage of the pond's capacity the runoff would fill (may be over 100 if it would overflow)", pct, 1, "Runoff volume divided by the capacity, times 100.")];
        return finish(`${cap(place)} has a catchment of **${A} ha** with a runoff coefficient of **${f(+C.toFixed(2))}**. A storm drops **${mm} mm** of rain. ${rainRule} A holding pond has a capacity of **${commas(K)} m³**.`,
          parts, `${exV}\n\n**Pond:** ${commas(Math.round(V))} ÷ ${commas(K)} × 100 = **${f(roundTo(pct, 1))}%**.`, "env-rr1", { tier, A, mm, C, K }, [...given, ["_pond", K]], ["Find the volume first.", "Compare it with the pond's capacity."]);
      }
      const eta = rng.pick([50, 60, 70, 80, 90]), cap2 = (V * eta) / 100;
      if (!isEx(cap2, 1)) continue;
      const u = rng.pick([2, 2.5, 4, 5, 8, 10]), days = Math.floor(cap2 / u);
      if (!fracOk(cap2 / u) || days < 2 || days > 400) continue;
      const parts = [pV, numPart("kept", "Captured volume", "Volume the tanks capture (m³)", cap2, 1, "The share captured (as a percentage) of the runoff volume."),
        numPart("days", "Days of supply", "Whole days the captured water lasts (round down to a whole day)", days, 0, "Captured volume divided by the daily use, counting only whole days.")];
      return finish(`${cap(place)} has a catchment of **${A} ha** with a runoff coefficient of **${f(+C.toFixed(2))}**. A storm drops **${mm} mm** of rain. ${rainRule} The tanks capture **${eta}%** of the runoff, and the site uses **${f(u)} m³** of water a day.`,
        parts, `${exV}\n\n**Captured:** ${commas(Math.round(V))} × ${eta}% = **${f(roundTo(cap2, 1))} m³**.\n\n**Days:** ${f(roundTo(cap2, 1))} ÷ ${f(u)} = ${f(roundTo(cap2 / u, 2))}, so **${days}** whole days.`,
        "env-rr2", { tier, A, mm, C, eta, u }, [...given, ["_capture", eta], ["_use", u]], ["Volume, then the captured share.", "Whole days only: part of a day is dropped."]);
    }
    if (tier === "expert") {
      const a1 = 100 * rng.int(2, 40), a2 = 100 * rng.int(2, 60), mm = 5 * rng.int(4, 18);
      const C1 = rng.pick([0.85, 0.9, 0.95]), C2 = rng.pick([0.6, 0.7, 0.75, 0.8]);
      const v1 = (a1 * mm * C1) / 1000, v2 = (a2 * mm * C2) / 1000;
      if (!isEx(v1, 1) || !isEx(v2, 1)) continue;
      const T = rng.pick([10, 15, 20, 25, 30, 40, 50]), tot = v1 + v2, need = Math.ceil(tot / T);
      if (!fracOk(tot / T) || need < 2 || need > 40) continue;
      const K = wantYes ? need + rng.int(0, 3) : need - rng.int(1, 3);
      if (K < 1 || (K >= need) !== wantYes) continue;
      const parts = [numPart("roof", "Roof runoff", "Runoff from the roofs (m³)", v1, 1, "Area × depth in metres × coefficient: 1 mm over 1 m² is 1 litre, so divide m²·mm by 1000 for m³."),
        numPart("paved", "Paving runoff", "Runoff from the paved areas (m³)", v2, 1, "Same method with the paving's area and coefficient."),
        numPart("tanks", "Tanks needed", "Tanks needed to hold all of it (round up to whole tanks)", need, 0, "Add the two volumes, divide by one tank's capacity, round up."),
        yesNo("ok", "Is the store enough?", `The site already has **${K} tank${K === 1 ? "" : "s"}**. Can it hold all the runoff from this storm?`, K >= need, "Compare the tanks you have with the tanks needed.")];
      return finish(`${cap(place)} has **${commas(a1)} m²** of roofs (runoff coefficient **${f(C1)}**) and **${commas(a2)} m²** of paving (coefficient **${f(C2)}**). A storm drops **${mm} mm**. 1 mm of rain on 1 m² is 1 litre, so 1000 m²·mm = 1 m³. Each storage tank holds **${T} m³**.`,
        parts, `**Roofs:** ${commas(a1)} × ${mm} × ${f(C1)} ÷ 1000 = **${f(roundTo(v1, 1))} m³**. **Paving:** ${commas(a2)} × ${mm} × ${f(C2)} ÷ 1000 = **${f(roundTo(v2, 1))} m³**.\n\n**Tanks:** (${f(roundTo(v1, 1))} + ${f(roundTo(v2, 1))}) ÷ ${T} = ${f(roundTo(tot / T, 2))}, round up to **${need}**.\n\n**Enough?** ${K} ${K >= need ? "is at least" : "is fewer than"} ${need}: **${YN(K >= need)}**.`,
        "env-rr3", { tier, a1, a2, mm, C1, C2, T, K }, [["_roof", a1], ["_paved", a2], ["_rain", mm], ["_c1", C1], ["_c2", C2], ["_tank", T], ["_have", K]],
        ["Two surfaces, two volumes, each with its own coefficient.", "Tanks come whole: round the division up."]);
    }
    // expert-plus: four months of harvest vs demand
    const a = 100 * rng.int(2, 30), k = rng.pick([0.6, 0.7, 0.8, 0.9]), d = rng.int(3, 40);
    const rain = Array.from({ length: 4 }, () => 10 * rng.int(0, 15));
    const H = rain.map((mm) => (a * mm * k) / 1000);
    if (!H.every((h) => isEx(h, 1))) continue;
    let run = 0, low = 0;
    for (const h of H) { run += h - d; low = Math.min(low, run); }
    const storage = -low, totH = sumOf(H), pct = (totH / (4 * d)) * 100, wet = Math.max(...H);
    if (storage < 2 || totH < 2 || pct > 150 || nearHalf(pct, 1, 0.1)) continue;
    const parts = [numPart("wet", "Wettest month", "Water harvested in the wettest month (m³)", wet, 1, "Roof area × rainfall in metres × the capture factor: m²·mm ÷ 1000 gives m³."),
      numPart("total", "Total harvested", "Water harvested over the four months (m³)", totH, 1, "Work out each month the same way and add them."),
      numPart("pct", "Demand met", "Percentage of the four months' demand met by the harvest", pct, 1, "Total harvest divided by (4 × monthly demand), times 100."),
      numPart("store", "Storage needed", "Storage the tank must provide: the lowest the running total of (harvest − demand) reaches below zero (m³)", storage, 1, "Month by month, add (harvest − demand) to a running total that starts at 0; the deepest dip is the storage.")];
    const runs = []; { let rr = 0; for (const h of H) { rr += h - d; runs.push(f(roundTo(rr, 1)).replace("-", "−")); } }
    return finish(`A roof of **${commas(a)} m²** feeds a tank and captures **${Math.round(k * 100)}%** of the rain that falls on it. Rainfall over four months is **${rain.join(", ")} mm**. The building uses **${d} m³** of water each month. 1 mm of rain on 1 m² is 1 litre, so 1000 m²·mm = 1 m³.`,
      parts, `**Monthly harvest:** ${H.map((h) => f(roundTo(h, 1))).join(", ")} m³; the wettest is **${f(roundTo(wet, 1))} m³** and the total is **${f(roundTo(totH, 1))} m³**.\n\n**Demand met:** ${f(roundTo(totH, 1))} ÷ ${4 * d} × 100 = **${f(roundTo(pct, 1))}%**.\n\n**Running total of harvest − demand:** ${runs.join(", ")} m³; the lowest is ${f(roundTo(low, 1)).replace("-", "−")}, so storage **${f(roundTo(storage, 1))} m³**.`,
      "env-rr4", { tier, a, k, d, rain }, [["_roof", a], ["_k", k], ["_use", d], ["_m1", rain[0]], ["_m2", rain[1]], ["_m3", rain[2]], ["_m4", rain[3]]],
      ["One harvest figure per month.", "The running total can dip, then recover; the lowest point matters."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "river-mixing") return genMix(rng, difficulty);
  if (subtopic === "carbon-footprint") return genCarbon(rng, difficulty);
  if (subtopic === "sampling-plan") return genSample(rng, difficulty);
  if (subtopic === "rainfall-runoff") return genRain(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (flow fractions and g/s loads for
// mixing, per-unit kg totals and a credit-counting loop for carbon, a sqrt-based sample-size search and a
// computational-formula SD for sampling, litres and month-by-month loops for rainfall). Numbers are
// compared with the rounded truth; choices exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

const mixFrac = (Qa, Ca, Qb, Cb) => { const fa = Qa / (Qa + Qb); return fa * Ca + (1 - fa) * Cb; }; // by flow fraction
const gps = (Q, C) => (Q * 1000 * C * 86400) / 1e6; // L/s x mg/L -> mg/s -> kg/day
const sdAlt = (r) => { const n = r.length, s = sumOf(r), q = sumOf(r.map((x) => x * x)); return Math.sqrt((q - (s * s) / n) / (n - 1)); };
const minSamples = (sig, E) => { let n = 1; while (E * Math.sqrt(n) < 2 * sig - 1e-9) n++; return n; };
const credits = (gap, c) => { let k = 0; while (k * c < gap - 1e-9) k++; return k; };

const ALT = {
  "env-mix1": (p) => ({ flow: p.Qr + p.Qe, mix: mixFrac(p.Qe, p.Ce, p.Qr, p.Cr) }),
  "env-mix2": (p) => { const m = mixFrac(p.Qe, p.Ce, p.Qr, p.Cr); return { mix: m, load: gps(p.Qe, p.Ce), ok: YN(m <= p.L) }; },
  "env-mix3": (p) => {
    const m = mixFrac(p.Qe, p.Ce, p.Qr, p.Cr), lr = gps(p.Qr, p.Cr), lo = gps(p.Qe, p.Ce);
    return { mix: m, ok: YN(m <= p.L), rload: lr, share: (lo / (lo + lr)) * 100 };
  },
  "env-mix4": (p) => {
    const c1 = mixFrac(p.Qe, p.Ce, p.Qr, p.Cr), q1 = p.Qr + p.Qe, c2 = mixFrac(p.Q2, p.Ce2, q1, c1);
    const e1 = c1 > p.L, e2 = c2 > p.L;
    return { c1, c2, load: gps(p.Qr, p.Cr) + gps(p.Qe, p.Ce) + gps(p.Q2, p.Ce2), sites: e1 && e2 ? "Both sites" : e1 ? "After outfall 1 only" : e2 ? "After outfall 2 only" : "Neither site" };
  },
  "env-cf1": (p) => { const e = (p.E * p.fe) / 1000, v = (p.V * p.fv) / 1000; return { elec: e, total: e + v }; },
  "env-cf2": (p) => {
    const kg = [p.E * p.fe, p.V * p.fv, p.G * p.fg], tot = sumOf(kg);
    return { elec: kg[0] / 1000, total: tot / 1000, share: (kg[0] / tot) * 100 };
  },
  "env-cf3": (p) => {
    const t0 = (p.E * p.fe + p.V * p.fv + p.G * p.fg) / 1000, t1 = (p.E * p.fe2 + p.V * p.fv + p.G * p.fg) / 1000;
    const red = (1 - t1 / t0) * 100;
    return { total: t0, after: t1, red, ok: YN(red >= p.x) };
  },
  "env-cf4": (p) => {
    const t0 = (p.E * p.fe + p.V * p.fv + p.G * p.fg) / 1000, t2 = (p.E * p.fe2 + p.V * (1 - p.y / 100) * p.fv + p.G * p.fg) / 1000;
    const gap = t2 - 0.01 * (100 - p.x) * t0, k = credits(gap, p.c);
    return { new: t2, gap, credits: k, cost: k * p.P };
  },
  "env-sp1": (p) => { let c = 0, s = 0; for (const v of p.r) { s += v; if (v > p.G) c++; } return { mean: s / p.r.length, above: c }; },
  "env-sp2": (p) => { const n = minSamples(p.sig, p.E); return { mean: sumOf(p.r) / 6, n, cost: p.F + n * p.c }; },
  "env-sp3": (p) => { const m = sumOf(p.r) / 6; return { mean: m, sd: sdAlt(p.r), n: minSamples(sdAlt(p.r), p.E), ok: YN(m <= p.G) }; },
  "env-sp4": (p) => {
    const wm = (p.aA * p.mA + p.aB * p.mB) / (p.aA + p.aB), n = minSamples(p.sig, p.E), ex = n - p.k;
    return { wm, ok: YN(wm <= p.G), extra: ex, cost: ex * p.c };
  },
  "env-rr1": (p) => { const v = (p.A * 10000 * (p.mm / 1000) * p.C); return { vol: v, pct: (v / p.K) * 100 }; },
  "env-rr2": (p) => {
    const v = p.A * 10000 * (p.mm / 1000) * p.C, kept = v * (p.eta / 100); let d = 0;
    while ((d + 1) * p.u <= kept + 1e-9) d++;
    return { vol: v, kept, days: d };
  },
  "env-rr3": (p) => {
    const v1 = (p.a1 * (p.mm / 1000)) * p.C1, v2 = (p.a2 * (p.mm / 1000)) * p.C2; let t = 0;
    while (t * p.T < v1 + v2 - 1e-9) t++;
    return { roof: v1, paved: v2, tanks: t, ok: YN(p.K >= t) };
  },
  "env-rr4": (p) => {
    const H = p.rain.map((mm) => p.a * (mm / 1000) * p.k); let lvl = 0, low = 0;
    for (const h of H) { lvl += h; lvl -= p.d; if (lvl < low) low = lvl; }
    const tot = sumOf(H);
    return { wet: Math.max(...H), total: tot, pct: (tot / (p.d * 4)) * 100, store: -low };
  },
};

const dpOf = (part) => (part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2)));

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined || tv === null) return false;
    if (part.answerType === "number") {
      const dp = dpOf(part);
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
