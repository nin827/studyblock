// Electrician role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact, or (where a rounded earlier answer is asked for)
// redrawn until working from the rounded value gives the same later answer. No answer sits on a
// rounding half-step, and verdict parts (Yes/No, Within/Over...) are decided first and then fitted.
// All figures and tables are made up (arithmetic practice only; nothing here is a wiring rule).
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   breaker-load   appliance loads -> total current -> smallest breaker from a list -> spare capacity   (Installation)
//   cable-drop     current -> cable from a stated table -> voltage drop -> % of supply -> limit         (Installation)
//   fault-finding  series/parallel resistance -> current -> p.d. / branch current; fault from a reading (Maintenance)
//   running-cost   kW x hours x price -> cost; motor efficiency, saving and payback                     (Maintenance)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-7;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-electrician: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
// Segmented part: all combinations of two small value lists (2 x 2), shuffled by the caller's rng.
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: shuffled(rng, choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

const SUPPLY = 230;
const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63];
const brkList = `**${BREAKERS.slice(0, -1).join(", ")} and ${BREAKERS[BREAKERS.length - 1]} A**`;
const smallestAtLeast = (x) => BREAKERS.find((b) => b >= x - 1e-9);
// five consecutive list sizes that include the answer, in a shuffled order
function breakerChoices(rng, ans) {
  const idx = BREAKERS.indexOf(ans);
  const start = Math.max(0, Math.min(BREAKERS.length - 5, idx - rng.int(0, 4)));
  return shuffled(rng, BREAKERS.slice(start, start + 5).map((b) => `${b} A`));
}
const breakerPart = (rng, id, ask, ans, hint) => ({ id, label: "Breaker", ask, answerType: "choice", answer: `${ans} A`, choices: breakerChoices(rng, ans), hint });
const listClear = (x, m) => BREAKERS.every((b) => Math.abs(x - b) > m); // x not close to a list size

const APPL = [
  ["kettle", [2000, 2200, 2400, 3000]], ["toaster", [800, 900, 1000, 1200]], ["oven", [2000, 2400, 2500, 3000]],
  ["microwave", [800, 1000, 1200, 1500]], ["dishwasher", [1800, 2000, 2200]], ["washing machine", [1800, 2000, 2200, 2400]],
  ["fan heater", [1000, 1500, 2000, 2500]], ["immersion heater", [2000, 3000]], ["tumble dryer", [2200, 2500, 2800]],
  ["hob ring", [1200, 1500, 1800, 2000]], ["extractor fan", [100, 150, 200]], ["food mixer", [400, 600, 800]],
  ["workshop grinder", [500, 750, 1000]], ["heat gun", [1500, 1800, 2000]], ["air compressor", [1100, 1500, 2200]],
];
function appliances(rng, n) {
  return rng.shuffle(APPL.slice()).slice(0, n).map(([name, ws]) => ({ name, w: rng.pick(ws) }));
}
const art = (n) => (/^[aeiou]/.test(n) ? "an" : "a");
const applText = (list) => list.map((a) => `${art(a.name)} ${a.name} (**${a.w} W**)`).join(", ").replace(/, ([^,]*)$/, " and $1");

// ---------- breaker-load ----------

function genBreaker(rng, tier) {
  const wantOk = rng.next() < 0.5; // verdict decided first (expert)
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium" || tier === "hard") {
      const list = appliances(rng, tier === "medium" ? rng.int(2, 3) : 3);
      const P = list.reduce((s, a) => s + a.w, 0), I = P / SUPPLY, B = smallestAtLeast(I);
      if (I < 3.5 || I > 48 || !B || !listClear(I, 0.15) || nearHalf(I, 1, 0.08)) continue;
      const given = [["_V", SUPPLY], ...list.map((a, k) => [`_P${k + 1}`, a.w])];
      const rule = `Breakers come in these ratings: ${brkList}. A breaker must be rated at or above the current it protects.`;
      const parts = [
        numPart("i", "Total current", `Total current when all run together at ${SUPPLY} V (A)`, I, 1, "Add the powers first. Current = total power ÷ voltage (P = V × I)."),
        breakerPart(rng, "brk", "Smallest breaker from the list that can protect the circuit", B, "Look for the first rating in the list that is at or above the current you found. A smaller one would trip."),
      ];
      let ex = `**Total current:** (${list.map((a) => a.w).join(" + ")}) ÷ ${SUPPLY} = ${P} ÷ ${SUPPLY} = **${roundTo(I, 1).toFixed(1)} A**.\n\n**Breaker:** the smallest rating at or above ${roundTo(I, 1).toFixed(1)} A is **${B} A**.`;
      const hints = ["Total power first, then divide by the voltage.", "Pick the first list rating that is not below the current."];
      if (tier === "hard") {
        parts.push(numPart("spare", "Spare capacity", "Spare capacity left on that breaker (A)", B - I, 1, "Spare capacity = breaker rating minus the load current."));
        ex += `\n\n**Spare capacity:** ${B} − ${roundTo(I, 1).toFixed(1)} = **${roundTo(B - I, 1).toFixed(1)} A**.`;
        hints.push("Spare capacity is the rating minus the current.");
      }
      return finish(`A circuit at **${SUPPLY} V** feeds ${applText(list)}, all running at the same time. ${rule}`,
        parts, ex, tier === "medium" ? "ele-brk1" : "ele-brk2", { tier, V: SUPPLY, ws: list.map((a) => a.w) }, given, hints);
    }
    if (tier === "expert") {
      const list = appliances(rng, 3), extra = appliances(rng, 1)[0];
      if (list.some((a) => a.name === extra.name)) continue;
      const P = list.reduce((s, a) => s + a.w, 0), I1 = P / SUPPLY, need = I1 / 0.8, B = smallestAtLeast(need);
      const I2 = (P + extra.w) / SUPPLY;
      if (I1 < 4 || I1 > 38 || !B || !listClear(need, 0.25) || nearHalf(I1, 1, 0.08) || nearHalf(I2, 1, 0.08)) continue;
      if (Math.abs(I2 - 0.8 * B) < 0.3) continue;
      const ok = I2 <= 0.8 * B;
      if (ok !== wantOk) continue;
      const parts = [
        numPart("i1", "Current now", `Total current of the existing loads at ${SUPPLY} V (A)`, I1, 1, "Add the three powers, then divide by the voltage."),
        breakerPart(rng, "brk", "Smallest breaker from the list, if the load may not exceed 80% of its rating", B, "The load current must be no more than 0.8 × rating, so the rating must be at least current ÷ 0.8. Take the first list size at or above that."),
        numPart("i2", "Current with the extra", `Total current once the extra ${extra.name} (${extra.w} W) is added (A)`, I2, 1, "New total power ÷ voltage."),
        yesNo("ok", "Still within 80%?", "Is the new current still no more than 80% of that breaker's rating?", ok, "Work out 0.8 × the breaker rating and compare it with the new current."),
      ];
      const ex = `**Current now:** ${P} ÷ ${SUPPLY} = **${roundTo(I1, 1).toFixed(1)} A**.\n\n**Breaker:** rating ≥ current ÷ 0.8 = ${P} ÷ ${SUPPLY} ÷ 0.8 = ${f(roundTo(need, 2))} A, so the smallest listed is **${B} A**.\n\n**With the extra:** (${P} + ${extra.w}) ÷ ${SUPPLY} = **${roundTo(I2, 1).toFixed(1)} A**.\n\n**Check:** 80% of ${B} A = ${f(0.8 * B)} A. ${roundTo(I2, 1).toFixed(1)} A is ${ok ? "no more than" : "more than"} that: **${YN(ok)}**.`;
      return finish(`A circuit at **${SUPPLY} V** feeds ${applText(list)}, all running together. Breakers come in these ratings: ${brkList}. The rule for this circuit: the load current may not exceed **80%** of the breaker rating. Later, ${art(extra.name)} ${extra.name} (**${extra.w} W**) is plugged into the same circuit.`,
        parts, ex, "ele-brk3", { tier, V: SUPPLY, ws: list.map((a) => a.w), ex: extra.w }, [["_V", SUPPLY], ...list.map((a, k) => [`_P${k + 1}`, a.w]), ["_Pextra", extra.w]],
        ["Current = power ÷ voltage; the 80% rule means rating ≥ current ÷ 0.8.", "Then recheck with the added load."]);
    }
    // expert-plus: capacity first, then how many heaters fit, then a two-column verdict on a plan
    const list = appliances(rng, rng.int(2, 3));
    const Pe = list.reduce((s, a) => s + a.w, 0), B = rng.pick([16, 20, 25, 32, 40]), hw = rng.pick([500, 750, 1000, 1200, 1500, 2000]);
    const maxP = 0.8 * B * SUPPLY, spare = maxP - Pe, ratio = spare / hw;
    if (spare < hw * 1.1 || ratio > 8 || Math.abs(ratio - Math.round(ratio)) < 0.08) continue;
    const fit = Math.floor(ratio);
    const wantB = rng.next() < 0.5, wantC = rng.next() < 0.5;
    const k = wantB ? Math.max(1, fit - rng.pick([0, 1])) : fit + rng.pick([1, 2]);
    if (k > fit !== !wantB) continue;
    const Iplan = (Pe + k * hw) / SUPPLY;
    const Ic = wantC ? Math.ceil(Iplan) + rng.pick([1, 2, 4, 6]) : Math.floor(Iplan) - rng.pick([1, 2, 3]);
    if (Ic < 6 || Math.abs(Ic - Iplan) < 0.9) continue;
    const bOk = k <= fit, cOk = Iplan <= Ic;
    const parts = [
      numPart("maxp", "Largest load", `Largest total power the ${B} A breaker allows under the 80% rule, at ${SUPPLY} V (W)`, maxP, 0, `Largest current = 0.8 × the rating. Then power = voltage × current.`, true),
      numPart("spare", "Spare power", "Spare power left after the existing appliances (W)", spare, 0, "Subtract the existing total power from the largest allowed load.", true),
      numPart("n", "Heaters that fit", `Whole ${hw} W heaters that can be added without breaking the rule (round down)`, fit, 0, "Divide the spare power by one heater's power and round down: a part-heater cannot be added."),
      segPart2(rng, "verdict", "Verdict", `The plan is to add **${k}** of these heaters. The cable on the circuit is rated **${Ic} A**. Judge the plan against the breaker rule and against the cable rating.`, ["Breaker (80% rule)", "Cable rating"], ["Within", "Over"], ["Within", "Exceeded"], [bOk ? "Within" : "Over", cOk ? "Within" : "Exceeded"],
        "Breaker: is the planned number of heaters no more than the number that fits? Cable: work out the planned total current and compare it with the cable's rating."),
    ];
    const ex = `**Largest load:** 0.8 × ${B} × ${SUPPLY} = **${commas(maxP)} W**.\n\n**Spare power:** ${commas(maxP)} − ${commas(Pe)} = **${commas(spare)} W**.\n\n**Heaters:** ${commas(spare)} ÷ ${hw} = ${f(roundTo(ratio, 2))}, round down to **${fit}**.\n\n**Verdict:** ${k} heater${k === 1 ? "" : "s"} ${k === 1 ? "is" : "are"} ${bOk ? "no more than" : "more than"} ${fit}: **${bOk ? "Within" : "Over"}** the breaker rule. The plan draws (${commas(Pe)} + ${k} × ${hw}) ÷ ${SUPPLY} = ${f(roundTo(Iplan, 2))} A, which is ${cOk ? "within" : "above"} the cable's ${Ic} A: **${cOk ? "Within" : "Exceeded"}**.`;
    return finish(`A circuit at **${SUPPLY} V** is protected by a **${B} A** breaker, and the load may not exceed **80%** of the rating. It already feeds ${applText(list)}. The owner wants to add **${hw} W** heaters.`,
      parts, ex, "ele-brk4", { tier, V: SUPPLY, B, ws: list.map((a) => a.w), hw, k, Ic }, [["_V", SUPPLY], ["_B", B], ["_hw", hw], ...list.map((a, j) => [`_P${j + 1}`, a.w])],
      ["Start from the breaker: the largest allowed load, then what is left.", "Two separate checks: the breaker rule and the cable."]);
  }
  return tooMany();
}

// ---------- cable-drop ----------

const CABLES = [[1.5, 17, 29], [2.5, 23, 18], [4, 31, 11], [6, 40, 7.3], [10, 54, 4.4], [16, 72, 2.8]]; // mm2, A, mV/A/m
const cableTable = `| Cable size | Current rating | Voltage drop |\n|---|---|---|\n${CABLES.map(([s, a, m]) => `| ${s} mm² | ${a} A | ${m} mV/A/m |`).join("\n")}`;
const cableNote = `Use this made-up table. A cable can be used only if its current rating is at least the load current. Voltage drop (V) = mV/A/m × current (A) × run length (m) ÷ 1000.\n\n${cableTable}`;
const cabName = (s) => `${s} mm²`;
function cableChoices(rng, size) {
  const idx = CABLES.findIndex((c) => c[0] === size);
  const start = Math.max(0, Math.min(CABLES.length - 5, idx - rng.int(0, 4)));
  return shuffled(rng, CABLES.slice(start, start + 5).map((c) => cabName(c[0])));
}
const cablePart = (rng, ask, size, hint) => ({ id: "cab", label: "Cable", ask, answerType: "choice", answer: cabName(size), choices: cableChoices(rng, size), hint });
const smallestCable = (I) => CABLES.find((c) => c[1] >= I);

function genCable(rng, tier) {
  const wantOk = rng.next() < 0.5, wantBind = rng.next() < 0.5; // verdict / binding test decided first
  // expert-plus: the colleague's verdict row is decided first too (only that tier draws these)
  const wantR = tier === "expert-plus" ? rng.next() < 0.5 : true, wantD = tier === "expert-plus" ? rng.next() < 0.5 : true;
  // OK | Over needs the drop limit to bind; Too small | Within needs it not to bind
  const bindX = wantR && !wantD ? true : !wantR && wantD ? false : wantBind;
  for (let i = 0; i < TRY; i++) {
    const I = rng.int(8, 66), L = rng.int(4, 70);
    if (tier !== "expert-plus") {
      const c = smallestCable(I);
      if (!c || c[1] === I) continue;
      const drop = (c[2] * I * L) / 1000;
      if (drop < 0.3 || nearHalf(drop, 2, 0.08)) continue;
      const dropR = roundTo(drop, 2);
      const given = [["_I", I], ["_L", L], ["_V", SUPPLY]];
      const parts = [
        cablePart(rng, "Smallest cable from the table that can carry the current", c[0], "Go down the table from the smallest size and take the first whose current rating is at least the load current."),
        numPart("drop", "Voltage drop", "Voltage drop along the run with that cable (V)", drop, 2, "Voltage drop = mV/A/m × current × length ÷ 1000, using the mV/A/m figure of the cable you chose."),
      ];
      let ex = `**Cable:** the first rating at or above ${I} A is ${c[1]} A, the **${cabName(c[0])}** cable.\n\n**Voltage drop:** ${c[2]} × ${I} × ${L} ÷ 1000 = **${dropR.toFixed(2)} V**.`;
      const hints = ["Choose by current rating first, then use that cable's mV/A/m.", "Divide by 1000 to turn millivolts into volts."];
      let kind = "ele-cab1", extra = {};
      if (tier !== "medium") {
        const pct = (drop / SUPPLY) * 100, pctR = (dropR / SUPPLY) * 100;
        if (roundTo(pct, 1) !== roundTo(pctR, 1) || nearHalf(pct, 1, 0.1)) continue;
        parts.push(numPart("pct", "Percentage of supply", `Voltage drop as a percentage of the ${SUPPLY} V supply (%)`, pct, 1, "Percentage = drop ÷ supply voltage × 100."));
        ex += `\n\n**Percentage:** ${dropR.toFixed(2)} ÷ ${SUPPLY} × 100 = **${roundTo(pct, 1).toFixed(1)}%**.`;
        hints.push("Drop divided by the supply, times 100.");
        kind = "ele-cab2";
        if (tier === "expert") {
          const lim = rng.pick([3, 4, 5]);
          if (Math.abs(pct - lim) < 0.25) continue;
          const ok = pct <= lim;
          if (ok !== wantOk) continue;
          parts.push(yesNo("ok", "Within the limit?", `The limit for this circuit is **${lim}%** of the supply. Is the drop within it?`, ok, "Compare the percentage you found with the stated limit."));
          ex += `\n\n**Limit:** ${roundTo(pct, 1).toFixed(1)}% is ${ok ? "no more than" : "more than"} ${lim}%: **${YN(ok)}**.`;
          hints.push("Compare with the stated limit.");
          kind = "ele-cab3"; extra = { lim }; given.push(["_lim", lim]);
        }
      }
      return finish(`A **${SUPPLY} V** supply feeds a load of **${I} A** through a cable run of **${L} m**. ${cableNote}`,
        parts, ex, kind, { tier, V: SUPPLY, I, L, ...extra }, given, hints);
    }
    // expert-plus: limit -> largest allowed drop -> largest mV/A/m -> cable that meets both -> judge another cable
    const lim = rng.pick([3, 4, 5]), maxDrop = (lim * SUPPLY) / 100;
    if (L * I < 150) continue;
    const maxMv = (maxDrop * 1000) / (I * L), maxMvR = roundTo(maxMv, 1);
    if (nearHalf(maxMv, 1, 0.1) || CABLES.some((c) => Math.abs(c[2] - maxMv) < 0.25 || Math.abs(c[2] - maxMvR) < 0.2)) continue;
    const ans = CABLES.find((c) => c[1] >= I && c[2] <= maxMv);
    if (!ans || CABLES.some((c) => c[1] === I) || (smallestCable(I) !== ans) !== bindX) continue;
    const fits = CABLES.filter((c) => (c[1] >= I) === wantR && (c[2] <= maxMv) === wantD);
    if (!fits.length) continue;
    const pc = rng.pick(fits);
    const ratingOk = pc[1] >= I, dropOk = pc[2] <= maxMv;
    const parts = [
      numPart("maxd", "Largest drop", `Largest voltage drop the ${lim}% limit allows on the ${SUPPLY} V supply (V)`, maxDrop, 1, "Limit percentage × supply voltage ÷ 100."),
      numPart("maxmv", "Largest mV/A/m", "Largest mV/A/m figure a cable may have for this run (mV/A/m)", maxMv, 1, "Work backwards from drop = mV/A/m × I × L ÷ 1000: make mV/A/m the subject, using the largest allowed drop."),
      cablePart(rng, "Smallest cable from the table that meets both the current rating and the drop limit", ans[0], "A cable must carry the current and also have an mV/A/m figure no larger than the maximum. Take the first size that passes both."),
      segPart2(rng, "verdict", "Check another cable", `A colleague suggests the **${cabName(pc[0])}** cable instead. Judge it on its current rating and on its voltage drop.`, ["Rating", "Voltage drop"], ["OK", "Too small"], ["Within", "Over"], [ratingOk ? "OK" : "Too small", dropOk ? "Within" : "Over"],
        "Rating: is the cable's current rating at least the load current? Drop: is its mV/A/m no more than the largest figure you found?"),
    ];
    const ex = `**Largest drop:** ${lim} ÷ 100 × ${SUPPLY} = **${f(maxDrop)} V**.\n\n**Largest mV/A/m:** ${f(maxDrop)} × 1000 ÷ (${I} × ${L}) = **${roundTo(maxMv, 1).toFixed(1)} mV/A/m**.\n\n**Cable:** it needs a rating of at least ${I} A and no more than ${roundTo(maxMv, 1).toFixed(1)} mV/A/m. The smallest that passes both is **${cabName(ans[0])}**.\n\n**Colleague's ${cabName(pc[0])}:** rating ${pc[1]} A is ${ratingOk ? "enough" : "too small"} for ${I} A (**${ratingOk ? "OK" : "Too small"}**); ${pc[2]} mV/A/m is ${dropOk ? "no more than" : "more than"} ${roundTo(maxMv, 1).toFixed(1)} (**${dropOk ? "Within" : "Over"}**).`;
    return finish(`A **${SUPPLY} V** supply feeds a **${I} A** load through a cable run of **${L} m**. The voltage drop may not exceed **${lim}%** of the supply. ${cableNote}`,
      parts, ex, "ele-cab4", { tier, V: SUPPLY, I, L, lim, pc: pc[0] }, [["_I", I], ["_L", L], ["_V", SUPPLY], ["_lim", lim]],
      ["Percentage limit to volts first, then work backwards to mV/A/m.", "Both conditions must hold for a cable to pass."]);
  }
  return tooMany();
}

// ---------- fault-finding ----------

const SUPPLIES = [6, 9, 12, 24, 48, 110, 230];
const RS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 50, 60, 75, 90, 100];
const PAR = [4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60, 90];
const par = (a, b) => (a * b) / (a + b);
const parOK = (a, b) => (a * b) % (a + b) === 0;
const FAULTS = ["R2 open-circuit", "R3 open-circuit", "R1 shorted out", "Short across R2 and R3"];

function genFault(rng, tier) {
  const fi = rng.int(0, 3); // which fault (expert-plus) is decided first
  for (let i = 0; i < TRY; i++) {
    const V = rng.pick(SUPPLIES);
    if (tier === "medium") {
      const a = rng.pick(RS), b = rng.pick(RS), Rt = a + b, I = V / Rt;
      if (!isEx(I, 2) || I < 0.05 || I > 12) continue;
      const parts = [
        numPart("rt", "Total resistance", "Total resistance of the circuit (Ω)", Rt, 0, "In series the resistances simply add.", true),
        numPart("i", "Current", "Current drawn from the supply (A)", I, 2, "Ohm's law: current = voltage ÷ total resistance."),
      ];
      const ex = `**Total resistance:** ${a} + ${b} = **${Rt} Ω**.\n\n**Current:** ${V} ÷ ${Rt} = **${roundTo(I, 2).toFixed(2)} A**.`;
      return finish(`Two resistors, **R1 = ${a} Ω** and **R2 = ${b} Ω**, are connected in series across a **${V} V** supply.`,
        parts, ex, "ele-flt1", { tier, V, a, b }, [["_V", V], ["_R1", a], ["_R2", b]],
        ["Series resistances add up.", "Then V = I × R, rearranged for I."]);
    }
    const a = rng.pick(PAR), b = rng.pick(PAR);
    if (!parOK(a, b)) continue;
    const r1 = rng.pick(RS), Rp = par(a, b), Rt = r1 + Rp, I = V / Rt;
    if (tier === "hard" || tier === "expert") {
      if (!isEx(I, 2) || I < 0.05 || I > 12) continue;
      const desc = `A resistor **R1 = ${r1} Ω** is in series with a parallel pair, **R2 = ${a} Ω** and **R3 = ${b} Ω**, across a **${V} V** supply.`;
      const given = [["_V", V], ["_R1", r1], ["_R2", a], ["_R3", b]];
      const rtPart = numPart("rt", "Total resistance", "Total resistance of the circuit (Ω)", Rt, 0, "First combine the parallel pair (product ÷ sum, or add the reciprocals), then add R1 in series.", true);
      const iPart = numPart("i", "Current", "Current drawn from the supply (A)", I, 2, "Ohm's law with the total resistance: I = V ÷ R.");
      if (tier === "hard") {
        const P1 = I * I * r1;
        if (nearHalf(P1, 2, 0.1) || P1 < 0.1) continue;
        const parts = [rtPart, iPart, numPart("p1", "Power in R1", "Power dissipated in R1 (W)", P1, 2, "The whole supply current flows through R1, so P = I² × R, or I × (I × R1).")];
        const ex = `**Parallel pair:** ${a} × ${b} ÷ (${a} + ${b}) = ${f(Rp)} Ω, so total = ${r1} + ${f(Rp)} = **${f(Rt)} Ω**.\n\n**Current:** ${V} ÷ ${f(Rt)} = **${roundTo(I, 2).toFixed(2)} A**.\n\n**Power in R1:** ${roundTo(I, 2).toFixed(2)}² × ${r1} = **${roundTo(P1, 2).toFixed(2)} W**.`;
        return finish(desc, parts, ex, "ele-flt2", { tier, V, a, b, r1 }, given, ["Parallel pair first, then add R1.", "R1 carries the full supply current."]);
      }
      const Vp = I * Rp, I2 = Vp / a;
      if (!isEx(Vp, 2) || nearHalf(I2, 2, 0.1) || I2 < 0.03) continue;
      const parts = [
        rtPart, iPart,
        numPart("vp", "P.d. across the pair", "Potential difference across the parallel pair (V)", Vp, 2, "The pair is a single resistance in the series chain: p.d. = I × (resistance of the pair)."),
        numPart("i2", "Current in R2", "Current in the R2 branch (A)", I2, 2, "Both branches of the pair have the same p.d., so current in R2 = pair p.d. ÷ R2."),
      ];
      const ex = `**Parallel pair:** ${a} × ${b} ÷ (${a} + ${b}) = ${f(Rp)} Ω; total = ${r1} + ${f(Rp)} = **${f(Rt)} Ω**.\n\n**Current:** ${V} ÷ ${f(Rt)} = **${roundTo(I, 2).toFixed(2)} A**.\n\n**P.d. across the pair:** ${roundTo(I, 2).toFixed(2)} × ${f(Rp)} = **${roundTo(Vp, 2).toFixed(2)} V**.\n\n**Current in R2:** ${roundTo(Vp, 2).toFixed(2)} ÷ ${a} = **${roundTo(I2, 2).toFixed(2)} A**.`;
      return finish(desc, parts, ex, "ele-flt3", { tier, V, a, b, r1 }, given, ["Total resistance, then the supply current.", "The same p.d. is across each branch of the pair."]);
    }
    // expert-plus: a measured current points to one fault
    if (a === b || r1 === Rp) continue;
    const faultRt = [r1 + b, r1 + a, Rp, r1]; // matches FAULTS order
    const Rf = faultRt[fi], If = V / Rf;
    if (!isEx(If, 2) || If < 0.05 || If > 25 || Math.abs(If - I) < 0.05) continue;
    if (!isEx(If * V, 2) || nearHalf(I, 2, 0.1)) continue;
    const parts = [
      numPart("ih", "Healthy current", "Current the healthy circuit should draw (A)", I, 2, "Parallel pair first, then add R1 in series; then I = V ÷ R."),
      numPart("rm", "Measured resistance", "Total resistance the measured current implies (Ω)", Rf, 0, "Rearrange Ohm's law: R = V ÷ I, using the measured current.", true),
      { id: "fault", label: "Fault", ask: "Which single fault explains the measured current?", answerType: "choice", answer: FAULTS[fi], choices: shuffled(rng, FAULTS), hint: "For each fault, work out the total resistance it would leave, and match it to the implied resistance. An open-circuit branch leaves only the other branch; a short removes the shorted part." },
      numPart("pw", "Power drawn", "Power now drawn from the supply with that fault (W)", If * V, 2, "Power = supply voltage × current drawn."),
    ];
    const ex = `**Healthy current:** the pair is ${a} × ${b} ÷ (${a} + ${b}) = ${f(Rp)} Ω, total ${f(Rt)} Ω, so I = ${V} ÷ ${f(Rt)} = **${roundTo(I, 2).toFixed(2)} A**.\n\n**Measured resistance:** ${V} ÷ ${f(If)} = **${f(Rf)} Ω**.\n\n**Fault:** R2 open leaves R1 + R3 = ${r1 + b} Ω; R3 open leaves R1 + R2 = ${r1 + a} Ω; R1 shorted leaves the pair, ${f(Rp)} Ω; a short across the pair leaves R1 = ${r1} Ω. Only **${FAULTS[fi]}** gives ${f(Rf)} Ω.\n\n**Power:** ${V} × ${f(If)} = **${roundTo(If * V, 2).toFixed(2)} W**.`;
    return finish(`A resistor **R1 = ${r1} Ω** is in series with a parallel pair, **R2 = ${a} Ω** and **R3 = ${b} Ω**, across a **${V} V** supply. After a fault, an ammeter in the supply lead reads **${f(If)} A**. Only one fault has occurred.`,
      parts, ex, "ele-flt4", { tier, V, a, b, r1, If }, [["_V", V], ["_R1", r1], ["_R2", a], ["_R3", b], ["_Im", If]],
      ["Healthy first, then see what the reading says about resistance.", "Four candidate faults, four different total resistances."]);
  }
  return tooMany();
}

// ---------- running-cost ----------

const PRICES = [0.12, 0.15, 0.18, 0.2, 0.22, 0.25, 0.28, 0.3];
const OUTPUTS = [1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11];
const EFFS = [70, 75, 80, 85, 90, 92, 95];
const DEV = ["workshop heater", "fan heater", "immersion heater", "tumble dryer", "air compressor", "dehumidifier", "kiln"];

function genCost(rng, tier) {
  const wantOk = rng.next() < 0.5; // verdict decided first (expert-plus)
  for (let i = 0; i < TRY; i++) {
    const p = rng.pick(PRICES);
    if (tier === "medium") {
      const kw = rng.pick([0.5, 0.75, 1, 1.2, 1.5, 1.8, 2, 2.4, 3, 3.6]), h = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]), d = rng.pick([3, 4, 5, 6, 7]);
      const dev = rng.pick(DEV), E = kw * h * d, cost = E * p;
      if (!isEx(E, 1) || E < 2 || nearHalf(cost, 2, 0.1) || cost < 0.5) continue;
      const parts = [
        numPart("e", "Energy per week", "Energy used in a week (kWh)", E, 1, "Energy (kWh) = power (kW) × hours per day × days."),
        numPart("c", "Cost per week", "Cost of that energy for the week ($)", cost, 2, "Cost = energy in kWh × price per kWh."),
      ];
      const ex = `**Energy:** ${kw} × ${h} × ${d} = **${roundTo(E, 1).toFixed(1)} kWh**.\n\n**Cost:** ${roundTo(E, 1).toFixed(1)} × ${p.toFixed(2)} = **${money(roundTo(cost, 2))}**.`;
      return finish(`A ${dev} is rated **${kw} kW**. It runs for **${h} h** a day on **${d} days** a week. Electricity costs **$${p.toFixed(2)} per kWh**.`,
        parts, ex, "ele-run1", { tier, kw, h, d, p }, [["_kW", kw], ["_h", h], ["_days", d], ["_price", p]],
        ["kW × hours gives kWh for one day; then multiply by the days.", "Then multiply the kWh by the price."]);
    }
    const out = rng.pick(OUTPUTS), eff = rng.pick(EFFS), h = rng.pick([4, 6, 8, 10, 12, 16, 20, 24]), d = rng.pick([200, 220, 250, 300, 312, 340, 365]);
    const pin = (out * 100) / eff, E = pin * h * d;
    if (tier === "hard") {
      if (!isEx(pin, 2) || !isEx(E, 0)) continue;
      const cost = E * p;
      const parts = [
        numPart("pin", "Input power", "Electrical input power of the motor (kW)", pin, 2, "Efficiency = output ÷ input, so input = output ÷ efficiency (as a fraction)."),
        numPart("e", "Energy per year", "Energy used in a year (kWh)", E, 0, "Input power × hours per day × days per year.", true),
        numPart("c", "Cost per year", "Running cost for the year ($)", cost, 2, "Energy in kWh × price per kWh."),
      ];
      const ex = `**Input power:** ${out} ÷ ${eff / 100} = **${roundTo(pin, 2).toFixed(2)} kW**.\n\n**Energy:** ${roundTo(pin, 2).toFixed(2)} × ${h} × ${d} = **${commas(E)} kWh**.\n\n**Cost:** ${commas(E)} × ${p.toFixed(2)} = **${money(cost)}**.`;
      return finish(`A motor delivers **${out} kW** of mechanical output at **${eff}%** efficiency. It runs **${h} h** a day for **${d} days** a year. Electricity costs **$${p.toFixed(2)} per kWh**.`,
        parts, ex, "ele-run2", { tier, out, eff, h, d, p }, [["_out", out], ["_eff", eff], ["_h", h], ["_days", d], ["_price", p]],
        ["The motor draws more than it delivers: divide by the efficiency.", "Then scale up to a year and apply the price."]);
    }
    // expert and expert-plus compare an old and a new motor
    const eff2 = rng.pick(EFFS);
    if (eff2 <= eff + 4) continue;
    const pin2 = (out * 100) / eff2, dP = pin - pin2;
    if (!isEx(pin, 2) || !isEx(pin2, 2)) continue;
    if (tier === "expert") {
      const dE = dP * h * d;
      if (!isEx(dE, 0) || dE < 100) continue;
      const S = dE * p, extraC = rng.pick([150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500]);
      const pay = extraC / S;
      if (nearHalf(pay, 1, 0.12) || pay > 25 || pay < 0.2) continue;
      const parts = [
        numPart("pin1", "Old input power", "Input power of the old motor (kW)", pin, 2, "Input = output ÷ efficiency, with efficiency as a fraction."),
        numPart("pin2", "New input power", "Input power of the new motor (kW)", pin2, 2, "The same working: output ÷ the new efficiency."),
        numPart("s", "Saving per year", "Money saved per year by the new motor ($)", S, 2, "Power saved (kW) × hours per year × price per kWh."),
        numPart("pay", "Payback", "Payback time of the extra purchase cost (years)", pay, 1, "Payback = extra cost ÷ saving per year."),
      ];
      const ex = `**Old input:** ${out} ÷ ${eff / 100} = **${roundTo(pin, 2).toFixed(2)} kW**.\n\n**New input:** ${out} ÷ ${eff2 / 100} = **${roundTo(pin2, 2).toFixed(2)} kW**.\n\n**Saving:** (${roundTo(pin, 2).toFixed(2)} − ${roundTo(pin2, 2).toFixed(2)}) × ${h} × ${d} × ${p.toFixed(2)} = ${commas(dE)} kWh × ${p.toFixed(2)} = **${money(S)}**.\n\n**Payback:** ${extraC} ÷ ${S.toFixed(2)} = **${roundTo(pay, 1).toFixed(1)} years**.`;
      return finish(`An old motor and a new motor both deliver **${out} kW** of mechanical output, at **${eff}%** and **${eff2}%** efficiency. They run **${h} h** a day for **${d} days** a year. Electricity costs **$${p.toFixed(2)} per kWh**. The new motor costs **$${extraC}** more than the old one.`,
        parts, ex, "ele-run3", { tier, out, eff, eff2, h, d, p, extraC }, [["_out", out], ["_eff1", eff], ["_eff2", eff2], ["_h", h], ["_days", d], ["_price", p], ["_extra", extraC]],
        ["Each motor's input is its output divided by its efficiency.", "The saving comes from the difference in input power."]);
    }
    // expert-plus: given the saving, work back to the running hours, then judge the payback
    const hy = rng.pick([1000, 1500, 2000, 2400, 3000, 3500, 4000, 5000, 6000, 7000, 8000]);
    const kWhS = dP * hy;
    if (!isEx(kWhS, 0) || kWhS < 200) continue;
    const S = kWhS * p, extraC = rng.pick([200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500]);
    const pay = extraC / S, lim = rng.pick([1, 2, 3, 4, 5]);
    if (nearHalf(pay, 1, 0.12) || pay < 0.3 || pay > 12 || Math.abs(pay - lim) < 0.3) continue;
    const ok = pay <= lim;
    if (ok !== wantOk) continue;
    const parts = [
      numPart("kwh", "Energy saved", "Energy the new motor saves per year (kWh)", kWhS, 0, "The saving in money ÷ the price per kWh gives the energy saved.", true),
      numPart("hrs", "Running hours", "Hours the motors run per year (h)", hy, 0, "Energy saved = power saved (old input minus new input, in kW) × hours. Make hours the subject.", true),
      numPart("pay", "Payback", "Payback time of the extra cost (years)", pay, 1, "Payback = extra cost ÷ saving per year."),
      yesNo("ok", "Pays back in time?", `The shop only buys it if the payback is no more than **${lim} year${lim === 1 ? "" : "s"}**. Does it qualify?`, ok, "Compare your payback time with the stated limit."),
    ];
    const ex = `**Energy saved:** ${S.toFixed(2)} ÷ ${p.toFixed(2)} = **${commas(kWhS)} kWh**.\n\n**Running hours:** power saved = ${roundTo(pin, 2).toFixed(2)} − ${roundTo(pin2, 2).toFixed(2)} = ${roundTo(dP, 2).toFixed(2)} kW, so hours = ${commas(kWhS)} ÷ ${roundTo(dP, 2).toFixed(2)} = **${commas(hy)} h**.\n\n**Payback:** ${extraC} ÷ ${S.toFixed(2)} = **${roundTo(pay, 1).toFixed(1)} years**.\n\n**Qualifies?** ${roundTo(pay, 1).toFixed(1)} is ${ok ? "no more than" : "more than"} ${lim}: **${YN(ok)}**.`;
    return finish(`An old motor draws **${roundTo(pin, 2).toFixed(2)} kW** of electrical input and a new motor doing the same job draws **${roundTo(pin2, 2).toFixed(2)} kW**. Switching saves **${money(S)}** a year at **$${p.toFixed(2)} per kWh**. The new motor costs **$${extraC}** more than the old one.`,
      parts, ex, "ele-run4", { tier, pin, pin2, p, S: +S.toFixed(2), extraC, lim }, [["_Pold", roundTo(pin, 2)], ["_Pnew", roundTo(pin2, 2)], ["_save", +S.toFixed(2)], ["_price", p], ["_extra", extraC], ["_lim", lim]],
      ["Money saved to energy saved first, using the price.", "Then work backwards from energy to hours, and on to the payback."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "breaker-load") return genBreaker(rng, difficulty);
  if (subtopic === "cable-drop") return genCable(rng, difficulty);
  if (subtopic === "fault-finding") return genFault(rng, difficulty);
  if (subtopic === "running-cost") return genCost(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (current per appliance
// summed, breaker found by scanning down from the top, cable chosen by scanning the table,
// resistance by adding conductances, costs by cost-per-day, hours by dividing energy).
// Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const brkScan = (x) => { let best = null; for (let k = BREAKERS.length - 1; k >= 0; k--) if (BREAKERS[k] >= x - 1e-9) best = BREAKERS[k]; return best; };
const cabScan = (I, mv = Infinity) => { let best = null; for (let k = CABLES.length - 1; k >= 0; k--) if (CABLES[k][1] >= I && CABLES[k][2] <= mv) best = CABLES[k]; return best; };
const sumCurrents = (ws, V) => ws.reduce((s, w) => s + w / V, 0);
const cond = (...rs) => 1 / rs.reduce((s, r) => s + 1 / r, 0); // parallel resistance via conductances

const ALT = {
  "ele-brk1": (p) => { const I = sumCurrents(p.ws, p.V); return { i: I, brk: `${brkScan(I)} A` }; },
  "ele-brk2": (p) => { const I = sumCurrents(p.ws, p.V), B = brkScan(I); return { i: I, brk: `${B} A`, spare: B - I }; },
  "ele-brk3": (p) => {
    const I1 = sumCurrents(p.ws, p.V), B = brkScan(I1 * 1.25), I2 = I1 + p.ex / p.V;
    return { i1: I1, brk: `${B} A`, i2: I2, ok: YN(I2 * 100 <= 80 * B) };
  },
  "ele-brk4": (p) => {
    const Pe = p.ws.reduce((s, w) => s + w, 0), Imax = (80 * p.B) / 100, maxP = Imax * p.V, spare = maxP - Pe;
    let n = 0; while ((n + 1) * p.hw <= spare) n++;
    const Ip = sumCurrents([...p.ws, ...Array(p.k).fill(p.hw)], p.V);
    return { maxp: maxP, spare, n, verdict: `${p.k <= n ? "Within" : "Over"} | ${Ip <= p.Ic ? "Within" : "Exceeded"}` };
  },
  "ele-cab1": (p) => { const c = cabScan(p.I); return { cab: `${c[0]} mm²`, drop: (c[2] / 1000) * p.I * p.L }; },
  "ele-cab2": (p) => { const c = cabScan(p.I), d = (c[2] / 1000) * p.I * p.L; return { cab: `${c[0]} mm²`, drop: d, pct: (d / p.V) * 100 }; },
  "ele-cab3": (p) => { const c = cabScan(p.I), d = (c[2] / 1000) * p.I * p.L, pct = (d / p.V) * 100; return { cab: `${c[0]} mm²`, drop: d, pct, ok: YN(pct <= p.lim) }; },
  "ele-cab4": (p) => {
    const maxD = (p.V * p.lim) / 100, maxMv = maxD / (p.I * p.L) * 1000, c = cabScan(p.I, maxMv), q = CABLES.find((x) => x[0] === p.pc);
    return { maxd: maxD, maxmv: maxMv, cab: `${c[0]} mm²`, verdict: `${q[1] >= p.I ? "OK" : "Too small"} | ${q[2] <= maxMv ? "Within" : "Over"}` };
  },
  "ele-flt1": (p) => { const Rt = p.a + p.b; return { rt: Rt, i: p.V / Rt }; },
  "ele-flt2": (p) => { const Rt = p.r1 + cond(p.a, p.b), I = p.V / Rt; return { rt: Rt, i: I, p1: (p.V - I * cond(p.a, p.b)) * I }; }, // p.d. across R1 times I
  "ele-flt3": (p) => {
    const Rp = cond(p.a, p.b), Rt = p.r1 + Rp, I = p.V / Rt, Vp = p.V - I * p.r1; // p.d. as supply minus drop across R1
    return { rt: Rt, i: I, vp: Vp, i2: Vp / p.a };
  },
  "ele-flt4": (p) => {
    const Rp = cond(p.a, p.b), Rm = p.V / p.If;
    const cands = [p.r1 + p.b, p.r1 + p.a, Rp, p.r1];
    const hit = cands.findIndex((r) => Math.abs(r - Rm) < 1e-6);
    return { ih: p.V / (p.r1 + Rp), rm: Rm, fault: FAULTS[hit], pw: p.If * p.V };
  },
  "ele-run1": (p) => { const day = p.kw * p.h; const E = day * p.d; return { e: E, c: day * p.p * p.d }; },
  "ele-run2": (p) => { const pin = p.out / (p.eff / 100), perDay = pin * p.h; const E = perDay * p.d; return { pin, e: E, c: perDay * p.d * p.p }; },
  "ele-run3": (p) => {
    const a = p.out / (p.eff / 100), b = p.out / (p.eff2 / 100), S = (a * p.h * p.p - b * p.h * p.p) * p.d;
    return { pin1: a, pin2: b, s: S, pay: p.extraC / S };
  },
  "ele-run4": (p) => {
    const kwh = p.S / p.p, dP = p.pin - p.pin2, hrs = kwh / dP, pay = p.extraC / p.S;
    return { kwh, hrs, pay, ok: YN(pay <= p.lim) };
  },
};

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
      const dp = part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2));
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
