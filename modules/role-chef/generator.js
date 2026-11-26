// Chef role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact (or a rounded earlier answer would not change a
// later one), no answer sits on a rounding half-step, and verdict parts (Yes/No, Within/Over...) are
// decided first and then fitted. All figures are made up; kitchen rules (yield, hold time, waste
// tolerance, target margins) are exercise rules stated in each prompt, not food-safety law.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   recipe-scaling  scale a recipe -> yield % -> packs (round up) -> stock cover and order verdict  (Head Chef)
//   service-timing  prep/cook/rest times -> parallel tracks -> latest start; batches and hold rule  (Head Chef)
//   dish-cost       ingredient costs -> cost per portion -> GP % -> price for a target GP %          (Kitchen Manager)
//   stock-waste     opening + deliveries - closing -> usage, theoretical usage, waste %, allowance    (Kitchen Manager)

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
const tooMany = () => { throw new Error("role-chef: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const cdiv = (a, b) => Math.floor((a + b - 1) / b); // integer ceiling division
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; }; // not near a whole number
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const br = (n) => (n < 0 ? `(${n})` : String(n)); // bracket negatives in explanations

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
function timePart(id, label, ask, mins, hint) {
  const t = hhmm(mins);
  const accepts = [];
  if (t.startsWith("0")) accepts.push(t.slice(1));
  accepts.push(t.replace(":", "."));
  return { id, label, ask: `${ask} (24-hour, HH:MM)`, answerType: "text", answer: t, accepts, fuzzy: false, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- recipe-scaling ----------

const DISHES = [
  ["beef stew", "beef"], ["chicken curry", "chicken thighs"], ["vegetable soup", "carrots"], ["mushroom risotto", "mushrooms"],
  ["fish pie", "white fish"], ["lamb tagine", "lamb shoulder"], ["tomato sauce", "tomatoes"], ["shepherd's pie", "minced lamb"],
  ["potato gratin", "potatoes"], ["leek and potato soup", "leeks"],
];
const YIELDS = [50, 60, 65, 70, 75, 80, 85, 90];
const yieldRule = (y) => `Only **${y}%** of the weight bought is usable after trimming (a rule for this exercise).`;

function genScale(rng, tier) {
  const wantEnough = rng.next() < 0.5, wantBudget = rng.next() < 0.5; // verdicts decided first (expert-plus)
  for (let i = 0; i < TRY; i++) {
    const [dish, ing] = rng.pick(DISHES);
    const q = rng.pick([60, 80, 100, 120, 125, 150, 160, 200, 250]); // usable grams per portion
    const N = rng.pick([4, 5, 6, 8, 10]);
    const S = rng.pick([500, 750, 1000, 1500, 2000, 2500]);
    const Q = q * N;
    if (tier === "expert-plus") {
      const y = rng.pick(YIELDS), B = rng.int(3, 8), C = rng.pick([30, 40, 45, 50, 60, 70, 75, 80, 90, 100, 120]);
      const usable = (B * S * y) / 100, rawNeed = (C * q * 100) / y;
      if (!isEx(usable, 0) || !isEx(rawNeed, 0)) continue;
      const ports = usable / q;
      if (!fracOk(ports) || Math.floor(ports) >= C) continue;
      const shortfall = rawNeed - B * S, k0 = shortfall / S;
      if (shortfall <= 0 || !fracOk(k0) || k0 > 12) continue;
      const k0c = Math.ceil(k0), enough = wantEnough;
      const k = enough ? k0c + rng.pick([0, 1, 2]) : k0c - rng.pick([1, 2]);
      if (k < 1) continue;
      const pp = rng.pick([3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 9, 10, 12]);
      const cost = k * pp;
      const bud = wantBudget ? Math.ceil(cost) + rng.pick([0, 5, 10, 15, 20]) : Math.floor(cost) - rng.pick([1, 5, 10]);
      if (bud < 5 || Math.abs(bud - cost) < 0.9 || bud >= 400) continue;
      const within = cost <= bud;
      if (within !== wantBudget) continue;
      const ports0 = Math.floor(ports);
      const parts = [
        numPart("usable", "Usable weight", `Usable ${ing} in stock (g)`, usable, 0, "Weight in stock = packs × pack size. Only the yield percentage of it is usable.", true),
        numPart("ports", "Portions possible", "Whole portions the usable stock makes (round down)", ports0, 0, "Divide the usable weight by the grams in one portion and round down: a part-portion cannot be served."),
        numPart("packs", "Packs to order", `Extra packs needed to cover all ${C} covers (round up)`, k0c, 0, "Work out the raw weight all the covers need (usable need ÷ yield), take away the stock, and divide what is missing by the pack size. Round up to whole packs."),
        segPart2(rng, "verdict", "Verdict", `A colleague proposes ordering **${k}** extra pack${k === 1 ? "" : "s"} at **${money(pp)}** each, with **$${bud}** to spend on the order. With those packs added to the stock, is there enough ${ing} for all the covers, and is the order within budget?`,
          ["Stock", "Budget"], ["Enough", "Short"], ["Within", "Over"], [enough ? "Enough" : "Short", within ? "Within" : "Over"],
          "Stock: compare the proposed packs with the number you worked out. Budget: packs × price against the amount to spend."),
      ];
      const ex = `**Usable:** ${B} × ${S} = ${commas(B * S)} g in stock, and ${y}% of it is usable: ${commas(B * S)} × ${y} ÷ 100 = **${commas(usable)} g**.\n\n**Portions:** ${commas(usable)} ÷ ${q} = ${f(roundTo(ports, 2))}, round down to **${ports0}**.\n\n**Packs:** ${C} covers × ${q} g = ${commas(C * q)} g usable, so the raw weight needed is ${commas(C * q)} × 100 ÷ ${y} = ${commas(rawNeed)} g. Missing: ${commas(rawNeed)} − ${commas(B * S)} = ${commas(shortfall)} g, and ${commas(shortfall)} ÷ ${S} = ${f(roundTo(k0, 2))}, round up to **${k0c}** packs.\n\n**Verdict:** ${k} pack${k === 1 ? " is" : "s are"} ${enough ? "at least" : "fewer than"} ${k0c}, so the stock is **${enough ? "Enough" : "Short"}**. The order costs ${k} × ${money(pp)} = ${money(cost)}, which is ${within ? "no more than" : "more than"} $${bud}: **${within ? "Within" : "Over"}** budget.`;
      return finish(`The kitchen has **${B} packs** of ${ing} in stock, each **${S} g**, for a booking of **${C} covers** of ${dish}. The recipe uses **${Q} g** of usable ${ing} for **${N} portions**. ${yieldRule(y)}`,
        parts, ex, "chf-scl4", { tier, B, S, y, q, C, k, pp, bud }, [["_B", B], ["_S", S], ["_y", y], ["_C", C], ["_k", k], ["_price", pp], ["_budget", bud]],
        ["Stock first: packs × size, then the usable share.", "Then work from the covers back to the raw weight needed, and judge the proposal."]);
    }
    const M = rng.pick([20, 24, 25, 30, 36, 40, 45, 48, 50, 60, 75, 80, 100]);
    const need = q * M; // grams of usable ingredient for M portions (= Q x M / N)
    if (tier === "medium") {
      const r = need / S;
      if (!fracOk(r) || r > 14) continue;
      const packs = Math.ceil(r);
      const parts = [
        numPart("need", "Amount needed", `${cap(ing)} needed for ${M} portions (g)`, need, 0, "One portion uses recipe weight ÷ recipe portions. Multiply by the portions you are making.", true),
        numPart("packs", "Packs to buy", "Packs to buy (round up to whole packs)", packs, 0, "Divide the weight needed by the pack size, then round up: a part-pack cannot be bought."),
      ];
      const ex = `**Needed:** ${Q} ÷ ${N} = ${q} g a portion, and ${q} × ${M} = **${commas(need)} g**.\n\n**Packs:** ${commas(need)} ÷ ${S} = ${f(roundTo(r, 2))}, round up to **${packs}** packs.`;
      return finish(`A recipe for **${N} portions** of ${dish} uses **${Q} g** of ${ing}. The kitchen is making **${M} portions**. The ${ing} comes in packs of **${S} g**.`,
        parts, ex, "chf-scl1", { tier, Q, N, M, S }, [["_Q", Q], ["_N", N], ["_M", M], ["_S", S]],
        ["Scale by the number of portions: weight per portion first.", "Round the pack count up."]);
    }
    const y = rng.pick(YIELDS), raw = (need * 100) / y;
    if (!isEx(raw, 0)) continue;
    const r = raw / S;
    if (tier === "hard") {
      if (!fracOk(r) || r > 16) continue;
      const packs = Math.ceil(r);
      const parts = [
        numPart("need", "Amount needed", `Usable ${ing} needed for ${M} portions (g)`, need, 0, "Weight per portion, times the portions being made.", true),
        numPart("raw", "Weight to buy", `Raw ${ing} to buy so that much is usable (g)`, raw, 0, "Only the yield percentage of what you buy is usable, so raw weight = usable weight ÷ yield (as a fraction).", true),
        numPart("packs", "Packs to buy", "Packs to buy (round up to whole packs)", packs, 0, "Divide the raw weight by the pack size and round up."),
      ];
      const ex = `**Needed:** ${Q} ÷ ${N} = ${q} g a portion; ${q} × ${M} = **${commas(need)} g** usable.\n\n**To buy:** ${commas(need)} ÷ ${y / 100} = **${commas(raw)} g** raw.\n\n**Packs:** ${commas(raw)} ÷ ${S} = ${f(roundTo(r, 2))}, round up to **${packs}** packs.`;
      return finish(`A recipe for **${N} portions** of ${dish} uses **${Q} g** of usable ${ing}. The kitchen is making **${M} portions**. ${yieldRule(y)} The ${ing} comes in packs of **${S} g**.`,
        parts, ex, "chf-scl2", { tier, Q, N, M, y, S }, [["_Q", Q], ["_N", N], ["_M", M], ["_y", y], ["_S", S]],
        ["Scale the recipe first, then allow for the yield.", "The pack count rounds up."]);
    }
    // expert: also a whole-item ingredient (eggs), rounded up
    const e = rng.pick([2, 3, 5, 7]);
    const eggsRaw = (e * M) / N;
    if (!fracOk(eggsRaw) || eggsRaw > 60 || !fracOk(r) || r > 16) continue;
    const eggs = Math.ceil(eggsRaw), packs = Math.ceil(r);
    const parts = [
      numPart("need", "Amount needed", `Usable ${ing} needed for ${M} portions (g)`, need, 0, "Weight per portion, times the portions being made.", true),
      numPart("eggs", "Eggs", "Eggs needed for the larger batch (round up to a whole egg)", eggs, 0, "Scale the egg count by M ÷ N, then round up: an egg cannot be split."),
      numPart("raw", "Weight to buy", `Raw ${ing} to buy so that much is usable (g)`, raw, 0, "Raw weight = usable weight ÷ yield (as a fraction).", true),
      numPart("packs", "Packs to buy", "Packs to buy (round up to whole packs)", packs, 0, "Divide the raw weight by the pack size and round up."),
    ];
    const ex = `**Needed:** ${Q} ÷ ${N} = ${q} g a portion; ${q} × ${M} = **${commas(need)} g** usable.\n\n**Eggs:** ${e} × ${M} ÷ ${N} = ${f(roundTo(eggsRaw, 2))}, round up to **${eggs}**.\n\n**To buy:** ${commas(need)} ÷ ${y / 100} = **${commas(raw)} g** raw.\n\n**Packs:** ${commas(raw)} ÷ ${S} = ${f(roundTo(r, 2))}, round up to **${packs}** packs.`;
    return finish(`A recipe for **${N} portions** of ${dish} uses **${Q} g** of usable ${ing} and **${e} eggs**. The kitchen is making **${M} portions**. ${yieldRule(y)} The ${ing} comes in packs of **${S} g**.`,
      parts, ex, "chf-scl3", { tier, Q, N, M, y, S, e }, [["_Q", Q], ["_N", N], ["_M", M], ["_e", e], ["_y", y], ["_S", S]],
      ["Scale both ingredients by M ÷ N. Eggs are whole items.", "Weight to buy allows for the yield; then packs round up."]);
  }
  return tooMany();
}

// ---------- service-timing ----------

const MAINS = [["roast chicken", "roast"], ["braised beef", "braise"], ["baked salmon", "bake"], ["lamb shoulder", "roast"], ["pork belly", "roast"]];
const SIDES = [["gravy", "simmer"], ["potato gratin", "bake"], ["red cabbage", "braise"], ["tomato sauce", "simmer"], ["roast vegetables", "roast"], ["onion jam", "simmer"]];
const svcTime = (rng) => 60 * rng.int(12, 20) + 5 * rng.int(0, 11);
const stepText = (steps) => steps.map(([l, m]) => `${l} **${m} min**`).join(", ").replace(/, ([^,]*)$/, " and $1");

function genTiming(rng, tier) {
  const wantOk = rng.next() < 0.5, wantHold = rng.next() < 0.5, wantStart = rng.next() < 0.5;
  // expert: which item is the critical (longest) track, decided first so it is not nearly always the main
  const wantCrit = tier === "expert" ? rng.int(0, 2) : 0;
  for (let i = 0; i < TRY; i++) {
    const T = svcTime(rng);
    const [mname, mverb] = rng.pick(MAINS);
    const mainSteps = [["prep", 5 * rng.int(3, 8)], [mverb, 5 * rng.int(9, 30)], ["rest", 5 * rng.int(2, 6)]];
    const mt = mainSteps.reduce((s, x) => s + x[1], 0);
    if (tier === "medium") {
      const parts = [
        { ...numPart("total", "Total time", "Total time from starting prep to the dish being ready (min)", mt, 0, "Add the three stages: prep, cooking and resting. They happen one after another."), },
        timePart("start", "Latest start", "Latest time to start prep so the dish is ready at service", T - mt, "Count back from the service time by the total you found."),
      ];
      const ex = `**Total:** ${mainSteps.map((x) => x[1]).join(" + ")} = **${mt} min**.\n\n**Latest start:** ${hhmm(T)} − ${mt} min = **${hhmm(T - mt)}**.`;
      return finish(`The **${mname}** must be ready on the pass at **${hhmm(T)}**. The stages follow one another: ${stepText(mainSteps)}. The oven is already hot.`,
        parts, ex, "chf-tim1", { tier, T, mt, steps: mainSteps.map((x) => x[1]) }, mainSteps.map((x, k) => [`_s${k + 1}`, x[1]]),
        ["Add the stage lengths, then subtract from the service time.", "Hours and minutes: borrow 60 minutes when needed."]);
    }
    if (tier === "hard") {
      const [sname, sverb] = rng.pick(SIDES);
      const sideSteps = [["prep", 5 * rng.int(2, 6)], [sverb, 5 * rng.int(4, 24)]];
      const st = sideSteps.reduce((s, x) => s + x[1], 0);
      const pl = rng.pick([5, 10, 15]);
      if (Math.abs(st - mt) < 10) continue;
      const longest = Math.max(mt, st);
      const parts = [
        numPart("ta", "Main track", `Total time for the ${mname} (min)`, mt, 0, "Add its prep, cooking and resting."),
        numPart("tb", "Side track", `Total time for the ${sname} (min)`, st, 0, "Add its prep and cooking."),
        timePart("start", "Latest start", "Latest time to start the whole job so both are ready and plated by service", T - pl - longest, "The two tracks run side by side, so the longer one sets the start. Count back from service by the plating time as well."),
      ];
      const ex = `**${cap(mname)}:** ${mainSteps.map((x) => x[1]).join(" + ")} = **${mt} min**.\n\n**${cap(sname)}:** ${sideSteps.map((x) => x[1]).join(" + ")} = **${st} min**.\n\n**Latest start:** the longer track is ${longest} min, so both are ready at ${hhmm(T)} − ${pl} min = ${hhmm(T - pl)}, and the job starts at ${hhmm(T - pl)} − ${longest} min = **${hhmm(T - pl - longest)}**.`;
      return finish(`Service is at **${hhmm(T)}**. The **${mname}** takes ${stepText(mainSteps)}, one after another. The **${sname}** is made at the same time and takes ${stepText(sideSteps)}. Once both are ready, plating takes **${pl} min** before service.`,
        parts, ex, "chf-tim2", { tier, T, pl, a: mainSteps.map((x) => x[1]), b: sideSteps.map((x) => x[1]) }, [["_plate", pl], ...mainSteps.map((x, k) => [`_m${k + 1}`, x[1]]), ...sideSteps.map((x, k) => [`_k${k + 1}`, x[1]])].slice(0, 8),
        ["Totals first, one per track.", "Parallel tracks: the longest one decides when to begin."]);
    }
    if (tier === "expert") {
      const sides = rng.shuffle(SIDES.slice()).slice(0, 2);
      const t2 = [["prep", 5 * rng.int(2, 6)], [sides[0][1], 5 * rng.int(4, 24)]], t3 = [["prep", 5 * rng.int(2, 5)], [sides[1][1], 5 * rng.int(4, 24)]];
      const tracks = [[mname, mainSteps], [sides[0][0], t2], [sides[1][0], t3]];
      const tot = tracks.map((t) => t[1].reduce((s, x) => s + x[1], 0));
      const sorted = tot.slice().sort((a, b) => b - a);
      if (sorted[0] - sorted[1] < 10 || sorted[1] - sorted[2] < 10 || tot[wantCrit] !== sorted[0]) continue;
      const iMax = tot.indexOf(sorted[0]), iMin = tot.indexOf(sorted[2]);
      const pl = rng.pick([5, 10, 15, 20]);
      const names = tracks.map((t) => t[0]);
      const parts = [
        { id: "crit", label: "Critical track", ask: "Which track takes longest, and so sets the start time?", answerType: "choice", answer: names[iMax], choices: shuffled(rng, names), hint: "Add up each track's stages. The longest total is the critical track." },
        numPart("ct", "Its total", "Total time of that longest track (min)", sorted[0], 0, "Add all its stages."),
        timePart("start", "Latest start", `Latest time to start the longest track so everything is plated by service`, T - pl - sorted[0], "Count back from service by the plating time and then by the longest track."),
        timePart("short", "Shortest track start", "Latest time to start the shortest track so it is ready exactly when the others are", T - pl - sorted[2], "All tracks must finish at the same moment, so count back from that moment by the shortest total."),
      ];
      const ex = `**Totals:** ${tracks.map((t, k) => `${t[0]} ${t[1].map((x) => x[1]).join(" + ")} = ${tot[k]} min`).join("; ")}.\n\n**Critical track:** the longest is the **${names[iMax]}** at **${sorted[0]} min**.\n\n**Latest start:** everything is ready at ${hhmm(T)} − ${pl} min = ${hhmm(T - pl)}, so the start is ${hhmm(T - pl)} − ${sorted[0]} min = **${hhmm(T - pl - sorted[0])}**.\n\n**Shortest track:** the ${names[iMin]} takes ${sorted[2]} min, so it starts at ${hhmm(T - pl)} − ${sorted[2]} min = **${hhmm(T - pl - sorted[2])}**.`;
      return finish(`Service is at **${hhmm(T)}**. Three items are made at the same time. The **${tracks[0][0]}** takes ${stepText(mainSteps)}. The **${tracks[1][0]}** takes ${stepText(t2)}. The **${tracks[2][0]}** takes ${stepText(t3)}. Each item's stages run one after another. When all three are ready, plating takes **${pl} min** before service.`,
        parts, ex, "chf-tim3", { tier, T, pl, names, tr: tracks.map((t) => t[1].map((x) => x[1])) },
        [["_plate", pl], ...tracks.flatMap((t, j) => t[1].map((x, k) => [`_t${j + 1}s${k + 1}`, x[1]]))].slice(0, 8),
        ["Three totals, one per item.", "The longest total decides the start; the shortest total decides when to begin that item."]);
    }
    // expert-plus: cooking in oven batches, working back from service, with a hold-time rule
    const P = rng.pick([24, 30, 36, 40, 45, 48, 54, 60, 72, 80, 90]), c = rng.pick([6, 8, 10, 12, 15, 16, 20, 24]);
    const rr = P / c;
    if (!fracOk(rr) || rr > 8 || rr < 2) continue;
    const n = Math.ceil(rr), b = rng.pick([20, 25, 30, 35, 40, 45]), pl = rng.pick([10, 15, 20]);
    const oven = n * b, s = T - pl - oven, hold = (n - 1) * b + pl;
    if (s < 6 * 60) continue;
    const H = wantHold ? hold + rng.pick([5, 10, 15]) : hold - rng.pick([5, 10, 15]);
    const Rr = wantStart ? s - rng.pick([5, 10, 15, 20]) : s + rng.pick([5, 10, 15, 20]);
    const onTime = Rr <= s, within = hold <= H;
    if (onTime !== wantStart || within !== wantHold || H < 10) continue;
    const parts = [
      numPart("n", "Batches", `Oven batches needed for ${P} portions (round up)`, n, 0, "Divide the portions by the tray capacity and round up: a part-tray is still a batch."),
      timePart("start", "Latest start", "Latest time to put the first batch in so the last batch is out exactly when plating must begin", s, "Oven time = batches × bake time. Count back from service by the plating time and then by the oven time."),
      numPart("hold", "Hold time", "Minutes the first batch waits from coming out of the oven until service", hold, 0, "The first batch is out after one bake. Service is later by the other batches plus the plating time."),
      segPart2(rng, "verdict", "Verdict", `The cook plans to load the first batch at **${hhmm(Rr)}**. Is that start on time, and, with the first batch loaded at the latest start you found, does it stay within the hold limit of **${H} min**?`,
        ["Start", "Hold rule"], ["On time", "Late"], ["Within", "Over"], [onTime ? "On time" : "Late", within ? "Within" : "Over"],
        "Start: compare the planned load time with the latest start. Hold rule: compare the first batch's wait with the stated limit."),
    ];
    const ex = `**Batches:** ${P} ÷ ${c} = ${f(roundTo(rr, 2))}, round up to **${n}**.\n\n**Latest start:** the oven runs ${n} × ${b} = ${oven} min, and plating takes ${pl} min, so ${hhmm(T)} − ${pl} − ${oven} min = **${hhmm(s)}**.\n\n**Hold:** the first batch is out at ${hhmm(s + b)} and service is ${hhmm(T)}: ${(n - 1)} × ${b} + ${pl} = **${hold} min**.\n\n**Verdict:** ${hhmm(Rr)} is ${onTime ? "no later than" : "after"} ${hhmm(s)}: **${onTime ? "On time" : "Late"}**. ${hold} min is ${within ? "no more than" : "more than"} ${H} min: **${within ? "Within" : "Over"}**.`;
    return finish(`Service for **${P} covers** is at **${hhmm(T)}**. A tray holds **${c} portions** and bakes for **${b} min**; trays go in one after another with no gap. After the last tray comes out, plating takes **${pl} min** before service. For this exercise, food may wait after baking for at most **${H} min** before service.`,
      parts, ex, "chf-tim4", { tier, T, P, c, b, pl, H, R: Rr }, [["_P", P], ["_c", c], ["_b", b], ["_plate", pl], ["_H", H]],
      ["Batches first; everything else follows from the oven time.", "Two separate checks: the start time and the hold limit."]);
  }
  return tooMany();
}

// ---------- dish-cost ----------

const INGR = [
  ["beef", [9, 10, 11, 12, 14]], ["chicken thighs", [5, 6, 7, 8]], ["rice", [2, 2.5, 3]], ["onions", [1.5, 2, 2.5]], ["carrots", [1, 1.5, 2]],
  ["potatoes", [1, 1.5, 2]], ["mushrooms", [4, 5, 6, 7]], ["flour", [1, 1.5, 2]], ["butter", [7, 8, 9]], ["hard cheese", [10, 12, 14]], ["tomatoes", [2.5, 3, 3.5, 4]],
];
const ingrText = (list) => list.map((x) => `**${x.g} g** of ${x.name} at **$${x.p.toFixed(2)} per kg**`).join(", ").replace(/, ([^,]*)$/, " and $1");
const DISH_NAMES = ["the casserole of the day", "the pie of the day", "the traybake of the day", "the stew of the day", "the bake of the day"];

function genDish(rng, tier) {
  const wantA = rng.next() < 0.5, wantB = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const dish = rng.pick(DISH_NAMES), N = rng.pick([4, 5, 6, 8, 10, 12, 20, 25]);
    if (tier === "expert-plus") {
      const G = rng.pick([60, 65, 70, 75]), P = rng.int(8, 24);
      const maxPer = (P * (100 - G)) / 100, maxBatch = maxPer * N;
      const main = INGR[rng.int(0, 1)], m = rng.pick([500, 1000, 1500, 2000, 2500, 3000]);
      const X = rng.pick([2, 3, 4, 5, 6, 8, 10, 12]) + rng.pick([0, 0.5]);
      const maxPpk = ((maxBatch - X) * 1000) / m;
      if (!isEx(maxPer, 2) || !isEx(maxBatch, 2) || !isEx(maxPpk, 2) || maxPpk < 3 || maxPpk > 20 || maxBatch - X < 1) continue;
      const da = rng.pick([0.5, 1, 1.5, 2]), db = rng.pick([0.5, 1, 1.5, 2]);
      const qa = wantA ? maxPpk - da : maxPpk + da, qb = wantB ? maxPpk - db : maxPpk + db;
      if (qa < 1 || qb < 1 || Math.abs(qa - qb) < 0.1) continue;
      const oa = qa <= maxPpk, ob = qb <= maxPpk;
      const parts = [
        numPart("maxp", "Cost per portion", "Largest food cost per portion that still meets the target ($)", maxPer, 2, "Gross profit % is the share of the price that is not food cost, so the food cost may be (100 − target)% of the price."),
        numPart("maxb", "Batch cost", `Largest total food cost for the batch of ${N} portions ($)`, maxBatch, 2, "Multiply the largest cost per portion by the number of portions."),
        numPart("ppk", "Price per kg", `Largest price per kg that can be paid for the ${main[0]} ($)`, maxPpk, 2, "Take the other ingredients' cost off the batch limit, then turn what is left into a price per kg for the weight used."),
        segPart2(rng, "verdict", "Verdict", `Two suppliers quote for the ${main[0]}: **A** at **${money(qa)} per kg** and **B** at **${money(qb)} per kg**. Is each within the largest price you found?`,
          ["Supplier A", "Supplier B"], ["Within", "Over"], ["Within", "Over"], [oa ? "Within" : "Over", ob ? "Within" : "Over"],
          "Compare each quote with the largest price per kg. They are separate checks."),
      ];
      const ex = `**Cost per portion:** food cost may be (100 − ${G})% of ${money(P)}: ${P} × ${(100 - G) / 100} = **${money(maxPer)}**.\n\n**Batch:** ${money(maxPer)} × ${N} = **${money(maxBatch)}**.\n\n**Price per kg:** ${money(maxBatch)} − ${money(X)} = ${money(maxBatch - X)} for ${m} g of ${main[0]}, so ${money(maxBatch - X)} ÷ ${m / 1000} kg = **${money(maxPpk)} per kg**.\n\n**Verdict:** A at ${money(qa)} is ${oa ? "no more than" : "more than"} ${money(maxPpk)}: **${oa ? "Within" : "Over"}**. B at ${money(qb)} is ${ob ? "no more than" : "more than"} ${money(maxPpk)}: **${ob ? "Within" : "Over"}**.`;
      return finish(`A batch of ${dish} makes **${N} portions** and sells at **${money(P)}** a portion. The target is a gross profit of **${G}%** on the selling price (gross profit % = (price − food cost) ÷ price × 100). The batch uses **${m} g** of ${main[0]}, and the other ingredients cost **${money(X)}** for the batch.`,
        parts, ex, "chf-cst4", { tier, N, G, P, m, X, qa, qb }, [["_N", N], ["_G", G], ["_P", P], ["_m", m], ["_other", X], ["_qA", qa], ["_qB", qb]],
        ["Work from the price down to the food cost allowed.", "Then split the batch limit between the main ingredient and the rest."]);
    }
    const list = rng.shuffle(INGR.slice()).slice(0, rng.int(3, 4)).map(([name, ps]) => ({ name, p: rng.pick(ps), g: rng.pick([200, 300, 400, 500, 600, 800, 1000, 1200, 1500]) }));
    const total = list.reduce((s, x) => s + (x.p * x.g) / 1000, 0); // sum of price x kg
    const batch = Math.round(total * 100) / 100, per = batch / N;
    if (!isEx(total, 2) || !isEx(per, 2) || per < 0.8 || per > 6) continue;
    const given = [["_N", N], ...list.map((x, k) => [`_g${k + 1}`, x.g]), ...list.map((x, k) => [`_p${k + 1}`, x.p])].slice(0, 8);
    const lines = list.map((x) => `${x.g} × ${x.p.toFixed(2)} ÷ 1000 = ${money((x.g * x.p) / 1000)}`).join("; ");
    const parts = [
      numPart("batch", "Batch cost", "Total food cost of the batch ($)", batch, 2, "Each ingredient costs price per kg × kilograms used (grams ÷ 1000). Add them up."),
      numPart("per", "Cost per portion", `Food cost per portion (${N} portions) ($)`, per, 2, "Divide the batch cost by the number of portions."),
    ];
    let ex = `**Batch cost:** ${lines}; total **${money(batch)}**.\n\n**Per portion:** ${money(batch)} ÷ ${N} = **${money(per)}**.`;
    const hints = ["Cost each ingredient on its own, then add.", "Batch cost ÷ portions."];
    const intro = `A batch of ${dish} makes **${N} portions** and uses ${ingrText(list)}.`;
    let kind = "chf-cst1", extra = {};
    if (tier === "medium") return finish(intro, parts, ex, kind, { tier, N, list: list.map((x) => [x.g, x.p]) }, given, hints);
    const P = rng.int(7, 26) + rng.pick([0, 0.5]);
    const gp = ((P - per) / P) * 100;
    if (gp < 50 || gp > 82 || nearHalf(gp, 1, 0.1)) continue;
    parts.push(numPart("gp", "Gross profit %", `Gross profit percentage at a menu price of ${money(P)} (%)`, gp, 1, "Gross profit % = (price − food cost) ÷ price × 100, using the food cost per portion."));
    ex += `\n\n**Gross profit:** (${P.toFixed(2)} − ${per.toFixed(2)}) ÷ ${P.toFixed(2)} × 100 = **${roundTo(gp, 1).toFixed(1)}%**.`;
    hints.push("Profit per portion over the price, times 100.");
    kind = "chf-cst2"; extra = { P };
    const given2 = [...given.slice(0, 7), ["_price", P]];
    if (tier === "hard") return finish(`${intro} It is sold at **${money(P)}** a portion. Gross profit % = (price − food cost) ÷ price × 100.`, parts, ex, kind, { tier, N, list: list.map((x) => [x.g, x.p]), ...extra }, given2, hints);
    // expert
    const G = rng.pick([60, 65, 70, 75]);
    const price = per / (1 - G / 100), units = price / 0.05;
    if (Math.abs(units - Math.round(units)) < 0.04) continue;
    const priceR = Math.ceil(units) * 0.05;
    parts.push(numPart("target", "Price for target", `Lowest menu price that reaches a ${G}% gross profit, rounded up to the next 5 cents ($)`, priceR, 2, "Food cost is (100 − target)% of the price, so price = food cost per portion ÷ (1 − target as a fraction). Round up to a multiple of 5 cents."));
    ex += `\n\n**Target price:** food cost is ${100 - G}% of the price: ${per.toFixed(2)} ÷ ${(100 - G) / 100} = ${f(roundTo(price, 3))}, rounded up to the next 5 cents: **${money(priceR)}**.`;
    hints.push("Reverse the percentage: price = cost ÷ (1 − target).");
    return finish(`${intro} It is sold at **${money(P)}** a portion. Gross profit % = (price − food cost) ÷ price × 100. The target gross profit for a new menu is **${G}%**.`, parts, ex, "chf-cst3", { tier, N, list: list.map((x) => [x.g, x.p]), P, G }, [...given.slice(0, 6), ["_price", P], ["_G", G]], hints);
  }
  return tooMany();
}

// ---------- stock-waste ----------

const STOCK_ITEMS = ["flour", "rice", "potatoes", "onions", "carrots", "chicken thighs", "beef", "butter"];
const PRICES = { flour: [1, 1.5, 2], rice: [2, 2.5, 3], potatoes: [1, 1.5, 2], onions: [1.5, 2, 2.5], carrots: [1, 1.5, 2], "chicken thighs": [5, 6, 7, 8], beef: [9, 10, 12, 14], butter: [7, 8, 9] };

function genStock(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const item = rng.pick(STOCK_ITEMS), price = rng.pick(PRICES[item]);
    const O = rng.int(6, 60) / 2, Dl = rng.int(20, 160) / 2, C = rng.int(4, 50) / 2;
    const U = O + Dl - C, P = rng.pick([40, 50, 60, 70, 80, 100, 120, 150, 200, 250]), g = rng.pick([100, 120, 150, 160, 200, 250, 300]);
    const T = (P * g) / 1000;
    const stockLine = `opening stock **${f(O)} kg**, deliveries **${f(Dl)} kg** and closing stock **${f(C)} kg**`;
    const base = [["_open", O], ["_deliv", Dl], ["_close", C]];
    if (tier === "medium") {
      if (!isEx(U, 1) || U < 4 || !isEx(U * price, 2)) continue;
      const cost = U * price;
      const parts = [
        numPart("used", "Stock used", `${cap(item)} used during the week (kg)`, U, 1, "Used = opening stock + deliveries − closing stock.") ,
        numPart("cost", "Cost of stock used", "Cost of the stock used ($)", cost, 2, "Kilograms used × price per kg."),
      ];
      const ex = `**Used:** ${f(O)} + ${f(Dl)} − ${f(C)} = **${f(U)} kg**.\n\n**Cost:** ${f(U)} × ${price.toFixed(2)} = **${money(cost)}**.`;
      return finish(`A kitchen counts its ${item} for the week: ${stockLine}. ${cap(item)} costs **$${price.toFixed(2)} per kg**.`, parts, ex, "chf-stk1", { tier, O, Dl, C, price }, [...base, ["_price", price]],
        ["Stock that came in minus stock left is what was used.", "Cost = kg × price per kg."]);
    }
    if (!isEx(U, 1) || !isEx(T, 1) || U < 6 || T <= 0.5 || T >= U) continue;
    const wasteKg = U - T, wp = (wasteKg / U) * 100;
    if (wp < 3 || wp > 30 || nearHalf(wp, 1, 0.1)) continue;
    if (tier === "hard") {
      const parts = [
        numPart("used", "Stock used", `${cap(item)} used during the week (kg)`, U, 1, "Used = opening stock + deliveries − closing stock."),
        numPart("theory", "Theoretical use", "Weight the portions sold should have used (kg)", T, 1, "Portions sold × grams per portion, then grams to kilograms (÷ 1000)."),
        numPart("wp", "Waste %", "Waste as a percentage of the stock used (%)", wp, 1, "Waste = used − theoretical. Waste % = waste ÷ used × 100."),
      ];
      const ex = `**Used:** ${f(O)} + ${f(Dl)} − ${f(C)} = **${f(U)} kg**.\n\n**Theoretical:** ${P} × ${g} ÷ 1000 = **${f(T)} kg**.\n\n**Waste:** ${f(U)} − ${f(T)} = ${f(roundTo(wasteKg, 1))} kg, so ${f(roundTo(wasteKg, 1))} ÷ ${f(U)} × 100 = **${roundTo(wp, 1).toFixed(1)}%**.`;
      return finish(`A kitchen counts its ${item} for the week: ${stockLine}. It sold **${P} portions**, each meant to use **${g} g** of ${item}.`, parts, ex, "chf-stk2", { tier, O, Dl, C, P, g }, [...base, ["_P", P], ["_g", g]],
        ["Stock used first, then what the sales should have used.", "The gap between them is the waste; compare it with the stock used."]);
    }
    if (tier === "expert") {
      if (!isEx(wasteKg * price, 2)) continue;
      const wc = wasteKg * price;
      const parts = [
        numPart("used", "Stock used", `${cap(item)} used during the week (kg)`, U, 1, "Used = opening stock + deliveries − closing stock."),
        numPart("waste", "Waste weight", "Weight wasted: used minus what the portions sold should have used (kg)", wasteKg, 1, "Theoretical use = portions × grams ÷ 1000. Waste = used − theoretical."),
        numPart("wp", "Waste %", "Waste as a percentage of the stock used (%)", wp, 1, "Waste ÷ used × 100."),
        numPart("wc", "Cost of waste", "Cost of the wasted stock ($)", wc, 2, "Waste in kilograms × price per kg."),
      ];
      const ex = `**Used:** ${f(O)} + ${f(Dl)} − ${f(C)} = **${f(U)} kg**.\n\n**Waste:** theoretical ${P} × ${g} ÷ 1000 = ${f(T)} kg, so ${f(U)} − ${f(T)} = **${f(roundTo(wasteKg, 1))} kg**.\n\n**Waste %:** ${f(roundTo(wasteKg, 1))} ÷ ${f(U)} × 100 = **${roundTo(wp, 1).toFixed(1)}%**.\n\n**Cost:** ${f(roundTo(wasteKg, 1))} × ${price.toFixed(2)} = **${money(wc)}**.`;
      return finish(`A kitchen counts its ${item} for the week: ${stockLine}. It sold **${P} portions**, each meant to use **${g} g** of ${item}. ${cap(item)} costs **$${price.toFixed(2)} per kg**.`, parts, ex, "chf-stk3", { tier, O, Dl, C, P, g, price }, [...base, ["_P", P], ["_g", g], ["_price", price]],
        ["Used, then theoretical, then the difference.", "Percentage and cost both start from the waste weight."]);
    }
    // expert-plus: allowed usage for a stated waste tolerance, the largest delivery, and a verdict
    const w = rng.pick([5, 8, 10, 12, 15, 20]);
    const Umax = (T * 100) / (100 - w), Dmax = Umax - O + C;
    if (!isEx(Umax, 1) || Dmax < 3) continue;
    const dd = rng.pick([1, 1.5, 2, 2.5, 3]);
    const D2 = wantOk ? Dmax - dd : Dmax + dd;
    if (D2 < 1 || !isEx(D2, 1)) continue;
    const U2 = O + D2 - C, ok = U2 <= Umax + 1e-9;
    if (ok !== wantOk || Math.abs(U2 - Umax) < 0.9) continue;
    const parts = [
      numPart("theory", "Theoretical use", "Weight the portions sold should have used (kg)", T, 1, "Portions sold × grams per portion, then grams to kilograms."),
      numPart("umax", "Most allowed", "Most stock the kitchen may use if waste is at most the stated tolerance (kg)", Umax, 1, "Waste ≤ w% of the stock used means the theoretical use is at least (100 − w)% of it. So used ≤ theoretical ÷ (1 − w as a fraction)."),
      numPart("dmax", "Largest delivery", "Largest delivery that would have kept usage within that limit (kg)", Dmax, 1, "Used = opening + deliveries − closing. Make deliveries the subject, with used at its limit."),
      yesNo("ok", "Within tolerance?", `The week's actual delivery was **${f(D2)} kg**. Was the stock used within the tolerance?`, ok, "Work out the stock actually used from the counts and compare it with the most allowed, or compare the delivery with the largest delivery."),
    ];
    const ex = `**Theoretical:** ${P} × ${g} ÷ 1000 = **${f(T)} kg**.\n\n**Most allowed:** ${f(T)} ÷ (1 − ${w / 100}) = **${f(roundTo(Umax, 1))} kg**.\n\n**Largest delivery:** ${f(roundTo(Umax, 1))} − ${f(O)} + ${f(C)} = **${f(roundTo(Dmax, 1))} kg**.\n\n**Check:** the actual delivery of ${f(D2)} kg is ${ok ? "no more than" : "more than"} ${f(roundTo(Dmax, 1))} kg (the stock used was ${f(roundTo(U2, 1))} kg against ${f(roundTo(Umax, 1))} kg): **${YN(ok)}**.`;
    return finish(`A kitchen sold **${P} portions** of a dish in a week, each meant to use **${g} g** of ${item}. The opening stock was **${f(O)} kg** and the closing stock **${f(C)} kg**. For this exercise, waste (stock used minus the weight the portions should have used) may be at most **${w}%** of the stock used.`,
      parts, ex, "chf-stk4", { tier, O, C, P, g, w, D: D2 }, [["_open", O], ["_close", C], ["_P", P], ["_g", g], ["_w", w], ["_deliv", D2]],
      ["Start with what the sales should have used.", "Then turn the waste tolerance into a limit on usage, and the limit into a delivery."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "recipe-scaling") return genScale(rng, difficulty);
  if (subtopic === "service-timing") return genTiming(rng, difficulty);
  if (subtopic === "dish-cost") return genDish(rng, difficulty);
  if (subtopic === "stock-waste") return genStock(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (scaling by a ratio of
// portions, packs by repeated addition, yield by scanning for the raw weight, clock times in
// minutes past midnight, cost by per-gram prices, waste % from the used/theoretical ratio).
// Numbers are compared with the rounded truth; choices exact; times by value.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const packsFor = (g, S) => { let k = 0; while (k * S < g - 1e-9) k++; return k; }; // repeated addition
const TIME = (m) => ({ t: m });
const timeOk = (cand, mins) => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(cand).trim().replace(/\s+/g, ""));
  return !!m && Number(m[1]) * 60 + Number(m[2]) === mins;
};

const ALT = {
  "chf-scl1": (p) => { const need = (p.Q / p.N) * p.M; return { need, packs: packsFor(need, p.S) }; },
  "chf-scl2": (p) => { const need = p.Q * (p.M / p.N), raw = need / (p.y / 100); return { need, raw, packs: packsFor(raw, p.S) }; },
  "chf-scl3": (p) => { const need = p.Q * (p.M / p.N), raw = need / (p.y / 100); return { need, eggs: Math.ceil((p.e * p.M) / p.N - 1e-9), raw, packs: packsFor(raw, p.S) }; },
  "chf-scl4": (p) => {
    const usable = p.B * p.S * (p.y / 100), perCover = p.q / (p.y / 100);
    let covered = 0; while ((covered + 1) * p.q <= usable + 1e-9) covered++;
    const rawNeed = p.C * perCover, k0 = packsFor(rawNeed - p.B * p.S, p.S);
    return { usable, ports: covered, packs: k0, verdict: `${p.k >= k0 ? "Enough" : "Short"} | ${p.k * p.pp <= p.bud ? "Within" : "Over"}` };
  },
  "chf-tim1": (p) => { const t = sum(p.steps); return { total: t, start: TIME(p.T - t) }; },
  "chf-tim2": (p) => { const a = sum(p.a), b = sum(p.b); return { ta: a, tb: b, start: TIME(p.T - p.pl - Math.max(a, b)) }; },
  "chf-tim3": (p) => {
    const t = p.tr.map(sum), hi = Math.max(...t), lo = Math.min(...t);
    return { crit: p.names[t.indexOf(hi)], ct: hi, start: TIME(p.T - p.pl - hi), short: TIME(p.T - p.pl - lo) };
  },
  "chf-tim4": (p) => {
    const n = packsFor(p.P, p.c), oven = n * p.b, s = p.T - p.pl - oven, hold = p.T - (s + p.b);
    return { n, start: TIME(s), hold, verdict: `${p.R <= s ? "On time" : "Late"} | ${hold <= p.H ? "Within" : "Over"}` };
  },
  "chf-cst1": (p) => { const batch = sum(p.list.map(([g, pr]) => g * (pr / 1000))); return { batch, per: batch / p.N }; },
  "chf-cst2": (p) => { const batch = sum(p.list.map(([g, pr]) => g * (pr / 1000))), per = batch / p.N; return { batch, per, gp: 100 - (per / p.P) * 100 }; },
  "chf-cst3": (p) => {
    const batch = sum(p.list.map(([g, pr]) => g * (pr / 1000))), per = batch / p.N;
    let cents = 5; while (100 - (per / (cents / 100)) * 100 < p.G - 1e-9) cents += 5; // lowest 5-cent price reaching the target
    return { batch, per, gp: 100 - (per / p.P) * 100, target: cents / 100 };
  },
  "chf-cst4": (p) => {
    const maxPer = (p.P * (100 - p.G)) / 100, maxB = maxPer * p.N, ppk = ((maxB - p.X) / p.m) * 1000;
    return { maxp: maxPer, maxb: maxB, ppk, verdict: `${p.qa <= ppk + 1e-9 ? "Within" : "Over"} | ${p.qb <= ppk + 1e-9 ? "Within" : "Over"}` };
  },
  "chf-stk1": (p) => { const U = p.O + p.Dl - p.C; return { used: U, cost: U * p.price }; },
  "chf-stk2": (p) => { const U = p.O + p.Dl - p.C, T = (p.P * p.g) / 1000; return { used: U, theory: T, wp: 100 - (T / U) * 100 }; },
  "chf-stk3": (p) => { const U = p.O + p.Dl - p.C, T = (p.P * p.g) / 1000, W = U - T; return { used: U, waste: W, wp: (W / U) * 100, wc: W * p.price }; },
  "chf-stk4": (p) => {
    const T = (p.P * p.g) / 1000, Umax = T / (1 - p.w / 100), Dmax = Umax + p.C - p.O;
    return { theory: T, umax: Umax, dmax: Dmax, ok: YN(p.O + p.D - p.C <= Umax + 1e-9) };
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
    } else if (typeof tv === "object") {
      if (!timeOk(partStr(answer, part.id), tv.t)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
