// Farmer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (a rounded earlier answer never changes a later one), no answer sits on a
// rounding half-step, and yes/no or pick parts are decided first and then fitted. All figures are made up,
// money is a generic $, and every rate and rule (1 ha = 10 000 m2, trailer loads, bag sizes, grazing limits)
// is an exercise rule stated in each prompt, not agronomic advice.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   field-yield   area (ha) -> harvest (t) -> trailer loads (round up) -> income; expert: field plus a triangular
//                 headland; expert-plus: two fields, average yield, contract met?
//   inputs        seed or fertiliser rate -> total -> bags (round up) -> cost; expert-plus: sprayer tank loads,
//                 job time and a one-window verdict
//   livestock     daily ration -> total feed -> bales (round up) -> cost; expert-plus: usable grass, whole days,
//                 shortfall feed, stocking limit
//   gross-margin  output - variable costs; hard: whole field; expert: two crops, which wins; expert-plus: fixed
//                 costs, break-even yield and a price-fall verdict

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
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-farmer: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const HA_RULE = "1 ha = 10 000 m²";

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, [a, b]), hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- field-yield ----------

const CROPS = [
  { n: "wheat", y: [6, 10], p: [180, 260], cap: [8, 10, 12, 14] },
  { n: "barley", y: [5, 9], p: [150, 220], cap: [8, 10, 12] },
  { n: "maize", y: [8, 13], p: [140, 200], cap: [10, 12, 14, 16] },
  { n: "oilseed rape", y: [3, 5], p: [380, 480], cap: [6, 8, 10] },
  { n: "potatoes", y: [35, 55], p: [120, 200], cap: [20, 24, 30] },
  { n: "sugar beet", y: [60, 85], p: [35, 60], cap: [20, 24, 30] },
];
const drawYield = (rng, c) => rng.int(c.y[0] * 10, c.y[1] * 10) / 10;
const drawPrice = (rng, c) => 5 * rng.int(c.p[0] / 5, c.p[1] / 5);

function genYield(rng, tier) {
  const wantMeet = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const c = rng.pick(CROPS), y = drawYield(rng, c), price = drawPrice(rng, c), cap = rng.pick(c.cap);
    const L = 10 * rng.int(20, 90), W = 10 * rng.int(10, 50);
    const a1 = (L * W) / 10000;
    const tripRule = `A trailer carries **${cap} tonnes** and a part-load still needs a whole trip.`;
    if (tier === "expert-plus") {
      const b = 20 * rng.int(5, 20), h = 20 * rng.int(5, 20);
      const a2 = (b * h) / 2 / 10000;
      const y2 = Math.round((y * rng.pick([0.7, 0.75, 0.8, 0.85])) * 10) / 10;
      if (a1 < 3 || a1 > 30 || a2 < 0.5) continue;
      const h1 = a1 * y, h2 = a2 * y2, total = h1 + h2;
      if (!isEx(h1, 2) || !isEx(h2, 2) || y2 < 1) continue;
      const A = a1 + a2, avg = total / A;
      if (nearHalf(avg, 2, 0.12)) continue;
      const loads = Math.ceil(total / cap - 1e-9);
      if (!fracOk(total / cap)) continue;
      const C = Math.round(total * rng.pick([0.9, 0.93, 0.95, 1.05, 1.07, 1.1]));
      const meet = total >= C;
      if (meet !== wantMeet || Math.abs(total - C) / C < 0.04) continue;
      const parts = [
        numPart("total", "Total harvest", "Total harvest from both fields (tonnes)", total, 2, "Work out each field's area in hectares first, then each field's harvest at its own yield, then add them."),
        numPart("avg", "Average yield", "Average yield over both fields together (tonnes per ha)", avg, 2, "Total harvest divided by total area, not the average of the two yields."),
        numPart("loads", "Trailer trips", "Trailer trips to move the whole harvest (round up)", loads, 0, "Total tonnes divided by the trailer's capacity, rounded up to whole trips.", true),
        yesNo("meet", "Contract met?", `Does the harvest reach the contract of **${commas(C)} tonnes**?`, meet, "Compare the total harvest with the contract amount; reaching it exactly counts as met."),
      ];
      const ex = `**Areas:** field 1 = ${L} × ${W} = ${commas(L * W)} m² = ${f(a1)} ha; field 2 = ½ × ${b} × ${h} = ${commas(b * h / 2)} m² = ${f(a2)} ha.\n\n**Total harvest:** ${f(a1)} × ${f(y)} + ${f(a2)} × ${f(y2)} = ${f(h1)} + ${f(h2)} = **${f(total)} t**.\n\n**Average yield:** ${f(total)} ÷ ${f(roundTo(A, 4))} ha = **${f(roundTo(avg, 2))} t/ha**.\n\n**Trips:** ${f(total)} ÷ ${cap} = ${f(roundTo(total / cap, 2))}, up to **${loads}**.\n\n**Contract:** ${f(total)} t is ${meet ? "at or above" : "below"} ${commas(C)} t: **${YN(meet)}**.`;
      return finish(`A farm grows **${c.n}** on two fields. Field 1 is a rectangle **${L} m by ${W} m** and yields **${f(y)} tonnes per ha**. Field 2 is a triangle with a base of **${b} m** and a height of **${h} m** and yields **${f(y2)} tonnes per ha**. ${HA_RULE}. ${tripRule} The buyer's contract is for **${commas(C)} tonnes**. All figures are made up.`,
        parts, ex, "fm-y4", { tier, L, W, y, y2, b, h, cap, C }, [["_length", L], ["_width", W], ["_base", b], ["_height", h], ["_yield1", y], ["_yield2", y2], ["_trailer", cap], ["_contract", C]],
        ["Two separate areas (a rectangle and a triangle), each turned into hectares.", "The average yield uses totals: tonnes ÷ hectares."]);
    }
    if (a1 < 3 || a1 > 40) continue;
    let area = a1, bits = "";
    let b = 0, h = 0;
    if (tier === "expert") {
      b = 20 * rng.int(5, 20); h = 20 * rng.int(5, 20);
      area = a1 + (b * h) / 2 / 10000;
      bits = ` At one end there is also a triangular headland with a base of **${b} m** and a height of **${h} m**, planted as part of the same crop.`;
      if (area > 45) continue;
    }
    const harvest = area * y;
    if (!isEx(harvest, 2)) continue;
    const exA = tier === "expert"
      ? `**Area:** ${L} × ${W} = ${commas(L * W)} m², plus ½ × ${b} × ${h} = ${commas(b * h / 2)} m²; total ${commas(L * W + b * h / 2)} m² = **${f(area)} ha**.`
      : `**Area:** ${L} × ${W} = ${commas(L * W)} m² = **${f(area)} ha**.`;
    const exH = `**Harvest:** ${f(area)} × ${f(y)} = **${f(roundTo(harvest, 2))} t**.`;
    const base = `A field of **${c.n}** is a rectangle **${L} m long and ${W} m wide**.${bits} ${HA_RULE}. The crop yields **${f(y)} tonnes per ha**. All figures are made up.`;
    const pA = numPart("area", "Field area", "Area of the whole crop (hectares)", area, 2, "Multiply the sides in metres to get square metres, then divide by 10 000 for hectares.");
    const pH = numPart("harvest", "Harvest", "Harvest from the field (tonnes)", harvest, 2, "Area in hectares times the yield per hectare.");
    const given = [["_length", L], ["_width", W], ...(tier === "expert" ? [["_base", b], ["_height", h]] : []), ["_yield", y]];
    if (tier === "medium") return finish(base, [pA, pH], `${exA}\n\n${exH}`, "fm-y1", { tier, L, W, y, b, h }, given,
      ["Square metres first, then hectares.", "Harvest = hectares × tonnes per hectare."]);
    if (!fracOk(harvest / cap)) continue;
    const loads = Math.ceil(harvest / cap - 1e-9);
    const exL = `**Trips:** ${f(roundTo(harvest, 2))} ÷ ${cap} = ${f(roundTo(harvest / cap, 2))}, up to **${loads}**.`;
    const pL = numPart("loads", "Trailer trips", "Trailer trips to carry the harvest (round up)", loads, 0, "Tonnes divided by the trailer's capacity, rounded up: a part-load still needs a trip.", true);
    if (tier === "hard") return finish(`${base} ${tripRule}`, [pA, pH, pL], `${exA}\n\n${exH}\n\n${exL}`, "fm-y2", { tier, L, W, y, cap, b, h }, [...given, ["_trailer", cap]],
      ["Area, then harvest, then trips.", "A part-load still needs a whole trip, so round up."]);
    const income = harvest * price;
    if (!isEx(income, 2)) continue;
    const pI = numPart("income", "Income", "Income if the whole harvest is sold ($)", income, 2, "Tonnes times the price per tonne.");
    return finish(`${base} ${tripRule} The crop sells at **$${price} per tonne**.`, [pA, pH, pL, pI], `${exA}\n\n${exH}\n\n${exL}\n\n**Income:** ${f(roundTo(harvest, 2))} × ${price} = **${money(income)}**.`,
      "fm-y3", { tier, L, W, y, cap, price, b, h }, [...given, ["_trailer", cap], ["_price", price]],
      ["The headland is a triangle: half base times height.", "Use the exact harvest tonnes for the income."]);
  }
  return tooMany();
}

// ---------- inputs (seed, fertiliser, spraying) ----------

function genInputs(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "expert-plus") {
      const ha = rng.int(60, 600) / 10, V = rng.pick([100, 150, 200, 250]), Tk = rng.pick([600, 800, 1000, 1200, 1500, 2000]);
      const Wd = rng.pick([6, 10, 12, 15, 20]), r = rng.pick([10, 15, 20, 30]), Hw = rng.int(2, 8);
      const vol = ha * V;
      if (!isEx(vol, 0) || !fracOk(vol / Tk)) continue;
      const loads = Math.ceil(vol / Tk - 1e-9);
      const t = (ha / Wd) * 60 + (loads - 1) * r;
      if (!isEx(t, 0)) continue;
      const win = Hw * 60;
      if (Math.abs(t - win) < 15 || Math.abs(t - win) / win < 0.06) continue;
      const ok = t <= win;
      if (ok !== wantOk) continue;
      const parts = [
        numPart("vol", "Spray mix", "Total spray mix needed (litres)", vol, 0, "Hectares times litres per hectare.", true),
        numPart("loads", "Tank loads", "Tank loads needed (round up)", loads, 0, "Total litres divided by the tank size, rounded up: a part-tank is still a load.", true),
        numPart("time", "Job time", "Time to finish the whole job (minutes)", t, 0, "Spraying time is hectares divided by hectares per hour, in minutes; add the refill stops, one fewer than the loads.", true),
        yesNo("ok", "Done in the window?", `Is the job finished within the **${Hw}-hour** spraying window?`, ok, "Compare the job time with the window in minutes; finishing exactly on time counts as yes."),
      ];
      const ex = `**Mix:** ${f(ha)} × ${V} = **${commas(vol)} L**.\n\n**Loads:** ${commas(vol)} ÷ ${commas(Tk)} = ${f(roundTo(vol / Tk, 2))}, up to **${loads}**.\n\n**Time:** spraying ${f(ha)} ÷ ${Wd} × 60 = ${f((ha / Wd) * 60)} min, plus ${loads - 1} refill stops × ${r} min = **${f(t)} min**.\n\n**Window:** ${Hw} × 60 = ${win} min; ${f(t)} min is ${ok ? "within" : "over"} it: **${YN(ok)}**.`;
      return finish(`A sprayer must treat a crop over **${f(ha)} ha** at **${V} litres of spray mix per ha**. The tank holds **${commas(Tk)} litres**. The sprayer covers **${Wd} ha per hour** while working, and each refill stop between tanks takes **${r} minutes** (none after the last tank). The spraying window is **${Hw} hours**. Rates are made up for this exercise.`,
        parts, ex, "fm-i5", { tier, ha, V, Tk, Wd, r, Hw }, [["_area", ha], ["_rate", V], ["_tank", Tk], ["_speed", Wd], ["_refill", r], ["_window", Hw]],
        ["Litres first, then how many tanks that is.", "Refill stops happen between tanks: one fewer than the number of loads."]);
    }
    const variant = rng.next() < 0.5 ? "fert" : "seed";
    const ha = rng.int(40, 600) / 10;
    let rate, base, exR, pR, given, hintsAll, rateHint;
    if (variant === "fert") {
      const N = rng.pick([20, 25, 40, 50]), T = 10 * rng.int(5, 18);
      rate = (T * 100) / N;
      if (!isEx(rate, 0)) continue;
      base = `A farmer spreads fertiliser on **${f(ha)} ha**. The target is **${T} kg of nitrogen per ha** (a rate set for this exercise), and the fertiliser is **${N}% nitrogen** by weight.`;
      exR = `**Product rate:** ${T} ÷ ${f(N / 100)} = **${f(rate)} kg/ha**.`;
      pR = numPart("rate", "Product rate", "Fertiliser to spread per hectare (kg)", rate, 0, "Only part of each kilogram is nitrogen, so divide the nitrogen target by that fraction.", true);
      given = [["_area", ha], ["_target", T], ["_npct", N]];
      hintsAll = ["Turn the nitrogen share into a fraction and divide the target by it.", "Then scale up by the number of hectares."];
      rateHint = { T, N };
    } else {
      const sm = rng.pick([250, 300, 350, 400]), tgw = rng.pick([35, 40, 45, 50]);
      if ((sm * tgw) % 100 !== 0) continue;
      rate = (sm * tgw) / 100;
      base = `A farmer drills seed on **${f(ha)} ha**. The target is **${sm} seeds per m²**, and **1000 seeds weigh ${tgw} g**. ${HA_RULE}.`;
      exR = `**Seed rate:** ${sm} seeds/m² × 10 000 m² = ${commas(sm * 10000)} seeds per ha; × ${tgw} g per 1000 seeds = ${commas(sm * 10 * tgw)} g = **${f(rate)} kg/ha**.`;
      pR = numPart("rate", "Seed rate", "Seed to sow per hectare (kg)", rate, 0, "Seeds per hectare is seeds per m² times 10 000; each 1000 seeds weigh the stated number of grams, then change grams to kilograms.", true);
      given = [["_area", ha], ["_seeds", sm], ["_tgw", tgw]];
      hintsAll = ["Seeds per m² become seeds per hectare, then grams, then kilograms.", "Then scale up by the number of hectares."];
      rateHint = { sm, tgw };
    }
    const total = rate * ha;
    if (!isEx(total, 0)) continue;
    const pT = numPart("total", "Total needed", `Total ${variant === "fert" ? "fertiliser" : "seed"} for the whole field (kg)`, total, 0, "Rate per hectare times the number of hectares.", true);
    const exT = `**Total:** ${f(rate)} × ${f(ha)} = **${commas(total)} kg**.`;
    const vName = variant === "fert" ? "fertiliser" : "seed";
    if (tier === "medium") return finish(base, [pR, pT], `${exR}\n\n${exT}`, "fm-i1", { tier, variant, ha, ...rateHint }, given, hintsAll);
    const B = rng.pick([25, 50, 500]);
    if (!fracOk(total / B)) continue;
    const bags = Math.ceil(total / B - 1e-9);
    const pB = numPart("bags", "Bags", `Bags of ${vName} to order (round up)`, bags, 0, "Total kilograms divided by the bag size, rounded up: only whole bags are sold.", true);
    const exB = `**Bags:** ${commas(total)} ÷ ${B} = ${f(roundTo(total / B, 2))}, up to **${bags}**.`;
    const bagTxt = `${cap1(vName)} is sold in **${B} kg bags**, whole bags only.`;
    if (tier === "hard") return finish(`${base} ${bagTxt}`, [pR, pT, pB], `${exR}\n\n${exT}\n\n${exB}`, "fm-i2", { tier, variant, ha, B, ...rateHint }, [...given, ["_bag", B]],
      ["Rate per hectare, then the whole field, then bags.", "Whole bags only, so round up."]);
    const price = roundTo(B * rng.pick([0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2]), 2);
    const cost = bags * price;
    if (!isEx(cost, 2)) continue;
    const pC = numPart("cost", "Cost", "Cost of the bags ordered ($)", cost, 2, "The number of whole bags times the price of one bag.");
    return finish(`${base} ${bagTxt} A bag costs **${money(price)}**.`, [pR, pT, pB, pC], `${exR}\n\n${exT}\n\n${exB}\n\n**Cost:** ${bags} × ${money(price)} = **${money(cost)}**.`,
      "fm-i3", { tier, variant, ha, B, price, ...rateHint }, [...given, ["_bag", B], ["_price", price]],
      ["Pay for the whole bags, not the exact kilograms.", "Use the rounded-up bag count for the cost."]);
  }
  return tooMany();
}

// ---------- livestock ----------

const HERDS = [
  { n: "cattle", H: [20, 150], r: [8, 20, 0.5], B: [400, 500, 600], i: [10, 14, 0.5], Hp: [15, 80], L: [1.5, 2, 2.5, 3, 3.5, 4] },
  { n: "sheep", H: [80, 400], r: [1.5, 3.5, 0.1], B: [20, 25, 30], i: [1.5, 2.5, 0.5], Hp: [60, 300], L: [8, 10, 12, 14, 16, 18] },
];
const drawStep = (rng, [lo, hi, st]) => roundTo(lo + st * rng.int(0, Math.round((hi - lo) / st)), 2);

function genLivestock(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const g = rng.pick(HERDS);
    if (tier === "expert-plus") {
      const H = rng.int(g.Hp[0], g.Hp[1]), P = rng.int(30, 300) / 10, c = 100 * rng.int(18, 32), u = rng.pick([50, 60, 70, 75, 80]);
      const inT = drawStep(rng, g.i), L = rng.pick(g.L);
      const usable = (P * c * u) / 100, daily = H * inT;
      if (!isEx(usable, 0) || !isEx(daily, 0) || !fracOk(usable / daily) || usable / daily < 3) continue;
      const days = Math.floor(usable / daily + 1e-9);
      const N = days + rng.int(3, 30), short = daily * N - usable;
      const rate = H / P;
      if (Math.abs(rate - L) / L < 0.08) continue;
      const ok = rate <= L;
      if (ok !== wantOk) continue;
      const parts = [
        numPart("usable", "Usable grass", "Grass the animals can use from the paddock (kg of dry matter)", usable, 0, "Hectares times the cover per hectare, then only the stated share of that is usable.", true),
        numPart("days", "Days of grazing", "Whole days the usable grass lasts (round down)", days, 0, "Usable grass divided by the herd's daily intake; count only complete days.", true),
        numPart("short", "Feed to buy", `Extra feed needed to cover all ${N} days (kg of dry matter)`, short, 0, "The herd's intake over all the days, minus the usable grass.", true),
        yesNo("ok", "Within the limit?", `Is the stocking rate within the limit of **${f(L)} ${g.n} per ha**?`, ok, "Animals divided by hectares, compared with the limit; exactly at the limit is within."),
      ];
      const ex = `**Usable grass:** ${f(P)} × ${commas(c)} × ${u}% = **${commas(usable)} kg**.\n\n**Daily intake:** ${H} × ${f(inT)} = ${commas(daily)} kg, so ${commas(usable)} ÷ ${commas(daily)} = ${f(roundTo(usable / daily, 2))}: **${days} full days**.\n\n**Extra feed:** ${commas(daily)} × ${N} = ${commas(daily * N)} kg needed, minus ${commas(usable)} kg = **${commas(short)} kg**.\n\n**Stocking rate:** ${H} ÷ ${f(P)} = ${f(roundTo(rate, 2))} per ha, ${ok ? "within" : "over"} ${f(L)}: **${YN(ok)}**.`;
      return finish(`A paddock of **${f(P)} ha** holds **${H} ${g.n}**. It has **${commas(c)} kg of dry matter of grass per ha**, but only **${u}%** of it is usable. Each animal eats **${f(inT)} kg of dry matter per day**. The farmer plans for **${N} days** and buys feed for any shortfall. The stocking limit for this exercise is **${f(L)} ${g.n} per ha**. All figures are made up.`,
        parts, ex, "fm-l5", { tier, H, P, c, u, inT, N, L, n: g.n }, [["_head", H], ["_area", P], ["_cover", c], ["_usable", u], ["_intake", inT], ["_days", N], ["_limit", L]],
        ["Usable grass is a share of the total cover.", "Whole days only: a part-day is not a full day of grazing."]);
    }
    const H = rng.int(g.H[0], g.H[1]), r = drawStep(rng, g.r), D = 5 * rng.int(4, 24);
    const daily = H * r;
    if (!isEx(daily, 0)) continue;
    const total = daily * D;
    const base = `A farmer feeds **${H} ${g.n}**. Each animal eats **${f(r)} kg of feed per day**. The feeding period is **${D} days**. All figures are made up.`;
    const pD = numPart("daily", "Daily feed", "Feed the whole herd eats in a day (kg)", daily, 0, "Number of animals times each animal's daily ration.", true);
    const exD = `**Daily feed:** ${H} × ${f(r)} = **${commas(daily)} kg**.`;
    if (tier === "medium") {
      const tn = total / 1000;
      if (!isEx(tn, 2)) continue;
      return finish(`${base} 1 tonne = 1000 kg.`, [pD, numPart("tonnes", "Total feed", `Feed needed for all ${D} days (tonnes)`, tn, 2, "Daily feed times the days, then divide by 1000 to change kilograms to tonnes.")],
        `${exD}\n\n**Total:** ${commas(daily)} × ${D} = ${commas(total)} kg = **${f(tn)} t**.`, "fm-l1", { tier, H, r, D }, [["_head", H], ["_ration", r], ["_days", D]],
        ["The daily total first, then all the days.", "Kilograms to tonnes: divide by 1000."]);
    }
    const B = rng.pick(g.B);
    if (!fracOk(total / B)) continue;
    const bales = Math.ceil(total / B - 1e-9);
    const pT = numPart("total", "Total feed", `Feed needed for all ${D} days (kg)`, total, 0, "Daily feed times the number of days.", true);
    const pB = numPart("bales", "Bales", "Bales to have in store (round up)", bales, 0, "Total kilograms divided by the bale weight, rounded up: only whole bales are bought.", true);
    const exT = `**Total:** ${commas(daily)} × ${D} = **${commas(total)} kg**.`;
    const exB = `**Bales:** ${commas(total)} ÷ ${B} = ${f(roundTo(total / B, 2))}, up to **${bales}**.`;
    const baleTxt = `A bale weighs **${B} kg** and only whole bales are bought.`;
    const given = [["_head", H], ["_ration", r], ["_days", D], ["_bale", B]];
    if (tier === "hard") return finish(`${base} ${baleTxt}`, [pD, pT, pB], `${exD}\n\n${exT}\n\n${exB}`, "fm-l2", { tier, H, r, D, B }, given,
      ["Daily, then the whole period, then bales.", "Round the bales up."]);
    const q = rng.pick([0.1, 0.12, 0.15, 0.18, 0.2, 0.25]), price = roundTo(B * q, 2), cost = bales * price;
    if (!isEx(cost, 2)) continue;
    const pC = numPart("cost", "Cost", "Cost of the bales bought ($)", cost, 2, "Whole bales times the price of one bale.");
    return finish(`${base} ${baleTxt} A bale costs **${money(price)}**.`, [pD, pT, pB, pC], `${exD}\n\n${exT}\n\n${exB}\n\n**Cost:** ${bales} × ${money(price)} = **${money(cost)}**.`,
      "fm-l3", { tier, H, r, D, B, price }, [...given, ["_price", price]],
      ["You pay for whole bales, not exact kilograms.", "Use the rounded-up bale count for the cost."]);
  }
  return tooMany();
}

// ---------- gross-margin ----------

const MCROPS = [
  { n: "wheat", y: [6, 10], p: [180, 260], v: 0.4 },
  { n: "barley", y: [5, 9], p: [150, 220], v: 0.4 },
  { n: "maize", y: [8, 13], p: [140, 200], v: 0.45 },
  { n: "oilseed rape", y: [3, 5], p: [380, 480], v: 0.45 },
  { n: "potatoes", y: [35, 55], p: [120, 200], v: 0.55 },
];
const round5 = (x) => 5 * Math.round(x / 5);

function genMargin(rng, tier) {
  const wantA = rng.next() < 0.5, wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const c = rng.pick(MCROPS), y = drawYield(rng, c), p = drawPrice(rng, c);
    const out = y * p;
    const vShare = c.v + rng.pick([-0.1, -0.05, 0, 0.05, 0.1]);
    const vcTot = round5(out * vShare);
    if (vcTot < 60) continue;
    if (tier === "medium" || tier === "hard") {
      const seed = round5(vcTot * rng.pick([0.2, 0.25, 0.3])), fert = round5(vcTot * rng.pick([0.4, 0.45, 0.5]));
      const spray = vcTot - seed - fert;
      if (spray < 20 || !isEx(out, 2)) continue;
      const vc = seed + fert + spray, gm = out - vc;
      if (gm < 0.15 * out) continue;
      const pO = numPart("output", "Output per ha", "Output (sales) per hectare ($)", out, 2, "Yield in tonnes per hectare times the price per tonne.");
      const pG = numPart("gm", "Gross margin per ha", "Gross margin per hectare ($)", gm, 2, "Output minus all the variable costs: seed, fertiliser and spray.");
      const base = `A farmer grows **${c.n}** with a yield of **${f(y)} tonnes per ha**, sold at **$${p} per tonne**. Variable costs per ha are **${money(seed)}** for seed, **${money(fert)}** for fertiliser and **${money(spray)}** for spray. Gross margin = output − variable costs. All figures are made up.`;
      const exO = `**Output:** ${f(y)} × ${p} = **${money(out)}** per ha.`;
      const exG = `**Variable costs:** ${seed} + ${fert} + ${spray} = ${money(vc)}; **gross margin:** ${money(out)} − ${money(vc)} = **${money(gm)}** per ha.`;
      const given = [["_yield", y], ["_price", p], ["_seed", seed], ["_fert", fert], ["_spray", spray]];
      if (tier === "medium") return finish(base, [pO, pG], `${exO}\n\n${exG}`, "fm-g1", { tier, y, p, seed, fert, spray }, given,
        ["Sales per hectare first.", "Add the three costs, then subtract."]);
      const A = rng.int(50, 800) / 10, tot = gm * A;
      if (!isEx(tot, 2)) continue;
      const pT = numPart("total", "Field total", "Gross margin for the whole field ($)", tot, 2, "Gross margin per hectare times the hectares grown.");
      return finish(`${base} The field is **${f(A)} ha**.`, [pO, pG, pT], `${exO}\n\n${exG}\n\n**Whole field:** ${money(gm)} × ${f(A)} = **${money(tot)}**.`, "fm-g2", { tier, y, p, seed, fert, spray, A }, [...given, ["_area", A]],
        ["Per hectare first, then the whole field.", "The margin per hectare is the same on every hectare."]);
    }
    if (tier === "expert") {
      const c2 = rng.pick(MCROPS.filter((k) => k.n !== c.n)), y2 = drawYield(rng, c2), p2 = drawPrice(rng, c2);
      const out2 = y2 * p2, vc2 = round5(out2 * (c2.v + rng.pick([-0.1, -0.05, 0, 0.05, 0.1])));
      if (vc2 < 60 || !isEx(out, 2) || !isEx(out2, 2)) continue;
      const gA = out - vcTot, gB = out2 - vc2;
      if (gA < 50 || gB < 50 || Math.abs(gA - gB) < 40 || Math.abs(gA - gB) / Math.max(gA, gB) < 0.1) continue;
      if ((gA > gB) !== wantA) continue;
      const A = rng.int(50, 800) / 10, win = gA > gB ? c.n : c2.n, extra = Math.abs(gA - gB) * A;
      if (!isEx(extra, 2)) continue;
      const parts = [
        numPart("gma", `Margin: ${c.n}`, `Gross margin per hectare of ${c.n} ($)`, gA, 2, "Yield times price gives the output; take off the variable costs."),
        numPart("gmb", `Margin: ${c2.n}`, `Gross margin per hectare of ${c2.n} ($)`, gB, 2, "The same steps for the second crop with its own figures."),
        pickPart(rng, "better", "Better crop", "Which crop earns the higher gross margin per hectare?", c.n, c2.n, win, "Compare the two margins per hectare, not the outputs."),
        numPart("extra", "Extra income", `Extra gross margin over the whole field from growing the better crop ($)`, extra, 2, "The difference between the two margins per hectare, times the hectares."),
      ];
      const ex = `**${cap1(c.n)}:** ${f(y)} × ${p} = ${money(out)}; minus ${money(vcTot)} = **${money(gA)}** per ha.\n\n**${cap1(c2.n)}:** ${f(y2)} × ${p2} = ${money(out2)}; minus ${money(vc2)} = **${money(gB)}** per ha.\n\n**Better:** **${win}**.\n\n**Extra:** (${money(Math.max(gA, gB))} − ${money(Math.min(gA, gB))}) × ${f(A)} = **${money(extra)}**.`;
      return finish(`A farmer can grow either **${c.n}** or **${c2.n}** on a field of **${f(A)} ha**. ${cap1(c.n)}: **${f(y)} tonnes per ha** at **$${p} per tonne**, variable costs **${money(vcTot)} per ha**. ${cap1(c2.n)}: **${f(y2)} tonnes per ha** at **$${p2} per tonne**, variable costs **${money(vc2)} per ha**. Gross margin = output − variable costs. All figures are made up.`,
        parts, ex, "fm-g3", { tier, n1: c.n, n2: c2.n, y, p, vc: vcTot, y2, p2, vc2, A }, [["_yield1", y], ["_price1", p], ["_cost1", vcTot], ["_yield2", y2], ["_price2", p2], ["_cost2", vc2], ["_area", A]],
        ["Work out each crop's margin per hectare separately.", "The extra is the gap between the margins, times the area."]);
    }
    // expert-plus: fixed costs, break-even yield, price-fall verdict
    const A = rng.int(10, 80), F = 500 * rng.int(2, 24), x = rng.pick([5, 10, 15, 20]);
    if (!isEx(out, 2)) continue;
    const gm = out - vcTot, net = gm * A - F;
    if (gm < 0.12 * out || net < 0.08 * out * A) continue;
    const bey = (vcTot * A + F) / (p * A);
    if (nearHalf(bey, 2, 0.12)) continue;
    const net2 = (out * (1 - x / 100) - vcTot) * A - F;
    if (Math.abs(net2) < 0.05 * out * A) continue;
    const still = net2 > 0;
    if (still !== wantYes) continue;
    const parts = [
      numPart("gm", "Gross margin per ha", "Gross margin per hectare at the expected yield ($)", gm, 2, "Yield times price gives the output; take off the variable costs per hectare."),
      numPart("net", "Net profit", "Net profit for the farm after the fixed costs ($)", net, 2, "Gross margin per hectare times the hectares, then take off the fixed costs."),
      numPart("bey", "Break-even yield", "Yield per hectare that just covers all the costs (tonnes per ha)", bey, 2, "All costs (variable on every hectare plus the fixed costs) divided by the hectares, then by the price per tonne."),
      yesNo("ok", "Profit after a price fall?", `If the price fell by **${x}%** with everything else unchanged, would the farm still make a profit?`, still, "Work out the new price and the new profit; a profit above zero is a yes."),
    ];
    const ex = `**Gross margin:** ${f(y)} × ${p} = ${money(out)}; minus ${money(vcTot)} = **${money(gm)}** per ha.\n\n**Net profit:** ${money(gm)} × ${A} = ${money(gm * A)}; minus ${money(F)} = **${money(net)}**.\n\n**Break-even:** (${money(vcTot)} × ${A} + ${money(F)}) ÷ ${A} = ${money(vcTot + F / A)} per ha of cost; ÷ $${p} = **${f(roundTo(bey, 2))} t/ha**.\n\n**Price fall:** the price becomes $${f(roundTo(p * (1 - x / 100), 4))}; profit = (${f(roundTo(y * p * (1 - x / 100), 2))} − ${vcTot}) × ${A} − ${F} = ${money(net2)}: **${YN(still)}**.`;
    return finish(`A farm grows **${c.n}** on **${A} ha**. The expected yield is **${f(y)} tonnes per ha**, sold at **$${p} per tonne**. Variable costs are **${money(vcTot)} per ha**, and fixed costs for the whole farm (rent and machinery) are **${money(F)}**. Gross margin = output − variable costs; net profit = total gross margin − fixed costs. All figures are made up.`,
      parts, ex, "fm-g4", { tier, y, p, vc: vcTot, A, F, x }, [["_yield", y], ["_price", p], ["_varcost", vcTot], ["_area", A], ["_fixed", F], ["_fall", x]],
      ["Per hectare first; then the fixed costs come off once, for the whole farm.", "Break-even: all costs divided by the hectares gives cost per hectare; divide by the price for the yield."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "field-yield") return genYield(rng, difficulty);
  if (subtopic === "inputs") return genInputs(rng, difficulty);
  if (subtopic === "livestock") return genLivestock(rng, difficulty);
  if (subtopic === "gross-margin") return genMargin(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (area in hectometres, trips and bags by
// adding one at a time, seed rate from seeds per hectare, whole days by counting, break-even by search over
// yield steps). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const stepCeil = (x, per) => { let k = 1; while (k * per < x - 1e-9) k++; return k; };
const stepFloor = (x, per) => { let k = 0; while ((k + 1) * per <= x + 1e-9) k++; return k; };
const hm = (a, b) => (a / 100) * (b / 100); // metres to hectometres: hm × hm = ha

const ALT = {
  "fm-y1": (p) => { const a = hm(p.L, p.W) + (p.b ? hm(p.b, p.h) / 2 : 0); return { area: a, harvest: (a * p.y * 1000) / 1000 }; },
  "fm-y2": (p) => { const a = hm(p.L, p.W) + (p.b ? hm(p.b, p.h) / 2 : 0), t = a * p.y; return { area: a, harvest: t, loads: stepCeil(t, p.cap) }; },
  "fm-y3": (p) => { const a = hm(p.L, p.W) + (p.b ? hm(p.b, p.h) / 2 : 0), t = a * p.y; return { area: a, harvest: t, loads: stepCeil(t, p.cap), income: t * p.price }; },
  "fm-y4": (p) => {
    const a1 = hm(p.L, p.W), a2 = hm(p.b, p.h) / 2, t = a1 * p.y + a2 * p.y2;
    return { total: t, avg: t / (a1 + a2), loads: stepCeil(t, p.cap), meet: YN(t >= p.C) };
  },
  "fm-i1": (p) => { const r = rateOf(p); return { rate: r, total: r * p.ha }; },
  "fm-i2": (p) => { const r = rateOf(p), t = r * p.ha; return { rate: r, total: t, bags: stepCeil(t, p.B) }; },
  "fm-i3": (p) => { const r = rateOf(p), t = r * p.ha, b = stepCeil(t, p.B); return { rate: r, total: t, bags: b, cost: b * p.price }; },
  "fm-i5": (p) => {
    const vol = p.V * p.ha, loads = stepCeil(vol, p.Tk), mins = (p.ha * 60) / p.Wd + (loads - 1) * p.r;
    return { vol, loads, time: mins, ok: YN(mins / 60 <= p.Hw) };
  },
  "fm-l1": (p) => ({ daily: p.r * p.H, tonnes: (p.H * p.r * p.D) / 1000 }),
  "fm-l2": (p) => { const t = p.H * p.r * p.D; return { daily: p.H * p.r, total: t, bales: stepCeil(t, p.B) }; },
  "fm-l3": (p) => { const t = p.H * p.r * p.D, b = stepCeil(t, p.B); return { daily: p.H * p.r, total: t, bales: b, cost: b * p.price }; },
  "fm-l5": (p) => {
    const usable = p.P * ((p.c * p.u) / 100), daily = p.H * p.inT;
    return { usable, days: stepFloor(usable, daily), short: Math.max(0, p.N * daily - usable), ok: YN(p.P * p.L >= p.H) };
  },
  "fm-g1": (p) => { const o = p.y * p.p; return { output: o, gm: o - p.seed - p.fert - p.spray }; },
  "fm-g2": (p) => { const o = p.y * p.p, g = o - p.seed - p.fert - p.spray; return { output: o, gm: g, total: p.A * g }; },
  "fm-g3": (p) => {
    const a = p.y * p.p - p.vc, b = p.y2 * p.p2 - p.vc2;
    return { gma: a, gmb: b, better: a > b ? p.n1 : p.n2, extra: p.A * Math.abs(a - b) };
  },
  "fm-g4": (p) => {
    const gm = p.y * p.p - p.vc, net = p.A * gm - p.F;
    let y = 0; while (p.p * y * p.A < p.vc * p.A + p.F - 1e-9) y += 0.001; // search the yield that covers all costs
    const cut = p.p - (p.p * p.x) / 100;
    return { gm, net, bey: y, ok: YN(p.A * (p.y * cut - p.vc) - p.F > 0) };
  },
};
function rateOf(p) {
  if (p.variant === "fert") return p.T / (p.N / 100);
  return (p.sm * 10000 * (p.tgw / 1000)) / 1000; // seeds per ha, grams, kilograms
}

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
      const tol = tolOf(dp);
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tol)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
