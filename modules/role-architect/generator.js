// Architect role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route
// (integer millimetres, loops instead of formulas, rebuilt tables).
// Inputs are chosen so every chained answer is exact (or a rounded value is never fed forward), and a
// rounded earlier answer never changes a later one. Verdict parts are decided first, then the numbers
// are drawn to fit, so Yes/No and segmented verdicts stay about even.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   plan-scale       drawing mm at 1:n -> real size -> area -> cost (+ contingency, budget verdict)   (both)
//   stair-rule       storey height -> risers (round up) -> riser height -> going -> 2R + G rule       (Building)
//   daylight-glazing window areas vs floor area -> % -> stated minimum / maximum; windows needed       (Building)
//   ramp-access      rise -> ramp length at 1 in N -> flights -> landings -> site length                (Landscape)
//   planting-paving  plot - patio -> planted area -> plants -> trays; slabs (round up) -> cost         (Landscape)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? "" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-architect: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => `$${commas(n)}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const fix1 = (x) => roundTo(x, 1).toFixed(1);

function numPart(id, label, ask, val, dp, hint, fuzzyZero = dp === 0) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (fuzzyZero) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
// Segmented part: all four combinations of two facts, shuffled with the question's own rng.
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: rng.shuffle(choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- plan-scale ----------

const PLAN_VARIANTS = [
  { thing: "room", article: "A", surface: "floor finish", wl: [3, 8], ww: [2.5, 6], rates: [45, 60, 80, 95, 120, 150] },
  { thing: "terrace", article: "A", surface: "paving", wl: [4, 12], ww: [3, 8], rates: [55, 70, 85, 110, 130] },
];

function genPlan(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  const want = rng.next() < 0.5; // expert: within budget?
  const combo = rng.int(0, 3); // expert-plus verdict combination
  for (let i = 0; i < TRY; i++) {
    const v = rng.pick(PLAN_VARIANTS);
    const n = plus ? rng.pick([50, 100]) : rng.pick([50, 100, 200]);
    const r = rng.pick(v.rates);
    const c = rng.pick([5, 10, 15, 20]);
    const sc = `**1 : ${n}**`;
    if (!plus) {
      const l2 = rng.int(v.wl[0] * 2, v.wl[1] * 2), w2 = rng.int(v.ww[0] * 2, v.ww[1] * 2);
      const l = l2 / 2, w = w2 / 2;
      const L = (l * 1000) / n, W = (w * 1000) / n;
      if (!Number.isInteger(L) || !Number.isInteger(W) || L > 280 || W > 280 || l2 === w2) continue;
      if ((l2 * w2) % 2 !== 0) continue; // area exact to 1 decimal place
      const area = (l2 * w2) / 4;
      if ((l2 * w2 * r) % 4 !== 0) continue; // whole-dollar cost
      const cost = area * r;
      const longer = Math.max(l, w);
      const given = [["_L", L], ["_W", W], ["_scale", n], ["_rate", r]];
      const base = `${v.article} ${v.thing} is drawn on a plan at scale ${sc}. On the drawing it measures **${L} mm × ${W} mm**. The ${v.surface} costs **${money(r)} per m²**.`;
      const exLen = `**Real length:** the longer side is ${Math.max(L, W)} mm on the plan, × ${n} = ${commas(Math.max(L, W) * n)} mm = **${longer} m**.`;
      const exArea = `**Area:** ${L} mm × ${n} = ${commas(L * n)} mm = ${l} m, and ${W} mm × ${n} = ${commas(W * n)} mm = ${w} m, so area = ${l} × ${w} = **${fix1(area)} m²**.`;
      const exCost = `**Cost:** ${fix1(area)} × ${r} = **${money(cost)}**.`;
      const areaPart = numPart("area", "Floor area", `Real area of the ${v.thing} (m²)`, area, 1, `Each drawing length is multiplied by ${n} to get the real length (then 1 000 mm = 1 m). Multiply the two real lengths.`, false);
      const costPart = numPart("cost", "Cost", `Cost of the ${v.surface} ($, whole dollars)`, cost, 0, `Cost = real area × the rate of ${money(r)} per m².`);
      if (med) {
        return finish(base, [areaPart, costPart], [exArea, exCost].join("\n\n"), "arc-plan", { tier, n, L, W, r }, given,
          ["Drawing lengths become real lengths by multiplying by the scale number.", "Area first, then the cost."]);
      }
      if (tier === "hard") {
        const parts = [numPart("len", "Longer side", `Real length of the longer side (m)`, longer, 1, `Take the longer drawing length and multiply by ${n}; convert mm to m (1 000 mm = 1 m).`, false), areaPart, costPart];
        return finish(base, parts, [exLen, exArea, exCost].join("\n\n"), "arc-plan", { tier, n, L, W, r }, given,
          ["Real length = drawing length × scale number.", "Then area, then cost."]);
      }
      // expert: contingency and a budget verdict
      if ((cost * (100 + c)) % 100 !== 0) continue;
      const cost2 = (cost * (100 + c)) / 100;
      const base0 = Math.round(cost2 / 100) * 100;
      const delta = rng.pick([0, 100, 200, 300]);
      const B = want ? base0 + delta : base0 - delta;
      if (B <= 0 || (want ? B - cost2 < 20 : cost2 - B < 20)) continue;
      const parts = [
        areaPart, costPart,
        numPart("total", "With contingency", `Cost including the ${c}% contingency ($, whole dollars)`, cost2, 0, `Add ${c}% to the cost: multiply the cost by ${(100 + c) / 100}.`),
        yesNo("budget", "Within budget?", `The budget for the ${v.surface} is **${money(B)}**. Is the cost including contingency within the budget?`, cost2 <= B, "Compare the cost including contingency with the budget."),
      ];
      const ex = [exArea, exCost,
        `**With contingency:** ${money(commas(cost))} × ${(100 + c) / 100} = **${money(commas(cost2))}**.`,
        `**Within budget?** ${money(commas(cost2))} is ${cost2 <= B ? "no more than" : "more than"} ${money(commas(B))}: **${cost2 <= B ? "Yes" : "No"}**.`].join("\n\n");
      return finish(`${base} A contingency of **${c}%** is added to the ${v.surface} cost.`, parts, ex, "arc-plan", { tier, n, L, W, r, c, B }, given.concat([["_cont", c], ["_budget", B]]),
        ["Real area from the drawing and the scale first.", "The contingency is a percentage added on top of the cost."]);
    }
    // expert-plus: backwards from the budget
    const w = rng.pick([3, 4, 5]);
    const lm2 = rng.int(8, 20); // longest affordable length in half metres
    if ((w * lm2 * r * (100 + c)) % 200 !== 0) continue;
    const lmax = lm2 / 2, amax = w * lmax;
    const B = (w * lm2 * r * (100 + c)) / 200;
    const drawn = (lmax * 1000) / n;
    if (!Number.isInteger(drawn)) continue;
    // the proposal: decide each fact first
    const budgetOK = (combo & 1) === 1, drawOK = (combo & 2) === 2;
    const k = rng.int(1, 3);
    const lp2 = budgetOK ? lm2 - k : lm2 + k;
    if (lp2 < 6) continue;
    const lp = lp2 / 2;
    const P = (lp * 1000) / n;
    const dl = rng.pick([10, 20, 30]);
    const S = drawOK ? P + dl : P - dl;
    if (S < 100 || S > 400 || !Number.isInteger(P)) continue;
    const parts = [
      numPart("area", "Largest area", `Largest ${v.thing} area the budget allows (m²)`, amax, 1, `The budget includes ${c}% contingency, so the cost of the ${v.surface} itself is the budget ÷ ${(100 + c) / 100}. Then divide by the rate of ${money(r)} per m².`, false),
      numPart("length", "Longest length", `Longest length at a width of ${w} m (m)`, lmax, 1, `Length = area ÷ width, with the width fixed at ${w} m.`, false),
      numPart("drawn", "On the plan", `Length of that ${v.thing} on a 1 : ${n} plan (mm)`, drawn, 0, `Plan length = real length ÷ the scale number, in mm (1 m = 1 000 mm).`),
      segPart2(rng, "verdict", "Verdict", `The designer proposes a ${v.thing} **${lp} m** long and **${w} m** wide, to be drawn on a sheet with room for a drawing **${S} mm** long. Is the proposal within budget, and does its drawing fit?`,
        ["Budget", "Drawing"], ["Within", "Over"], ["Fits", "Too long"], [budgetOK ? "Within" : "Over", drawOK ? "Fits" : "Too long"],
        "Compare the proposed length with the longest length the budget allows. Then work out the proposal's length on the plan and compare it with the space on the sheet."),
    ];
    const ex = [
      `**Largest area:** the ${v.surface} budget of ${money(commas(B))} includes ${c}% contingency, so it pays for ${money(commas(B))} ÷ ${(100 + c) / 100} of work; at ${money(r)} per m² that is **${fix1(amax)} m²**.`,
      `**Longest length:** ${fix1(amax)} ÷ ${w} = **${fix1(lmax)} m**.`,
      `**On the plan:** ${fix1(lmax)} m = ${commas(lmax * 1000)} mm, ÷ ${n} = **${drawn} mm**.`,
      `**Verdict:** ${lp} m is ${budgetOK ? "no longer than" : "longer than"} ${fix1(lmax)} m: **${budgetOK ? "Within" : "Over"}** budget. Its plan length is ${commas(lp * 1000)} ÷ ${n} = ${P} mm, ${drawOK ? "no more than" : "more than"} ${S} mm: **${drawOK ? "Fits" : "Too long"}**.`,
    ].join("\n\n");
    return finish(
      `${v.article} ${v.thing} is to be ${w} m wide. The client's budget for the ${v.surface} is **${money(commas(B))}**, and this **includes a ${c}% contingency**. The ${v.surface} costs **${money(r)} per m²**. The plan is drawn at scale ${sc}.`,
      parts, ex, "arc-planback", { tier, n, r, c, B, w, lp2, S }, [["_budget", B], ["_rate", r], ["_width", w], ["_scale", n]],
      ["Take the contingency out of the budget first, then work back to area and length.", "The verdict compares the proposal with the two limits."],
    );
  }
  return tooMany();
}

// ---------- stair-rule ----------

const COMFORT = [600, 650];
const COMFORT_RULE = `A stair is **comfortable** if 2R + G is between **${COMFORT[0]} mm and ${COMFORT[1]} mm**, where R is the riser height and G is the going (tread depth).`;
const STAIR_RULE = "All risers in a flight are equal, and the flight has one tread fewer than risers (the top of the flight is the upper floor).";
const comfortable = (R, G) => 2 * R + G > COMFORT[0] && 2 * R + G < COMFORT[1];

function genStair(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  const want = rng.next() < 0.5; // expert: comfortable?
  const combo = rng.int(0, 3); // expert-plus: (comfort, pitch)
  for (let i = 0; i < TRY; i++) {
    const N = rng.int(12, 18);
    const R = rng.int(150, 190); // riser height, whole mm
    const H = N * R;
    if (H < 2400 || H > 3300) continue;
    const Rmax = rng.pick([170, 175, 180, 185, 190, 200]);
    // ceil(H / Rmax) must be N, and not an exact division (so the rounding up matters)
    if (R >= Rmax || Rmax * (N - 1) >= H) continue;
    const given0 = [["_H", H], ["_Rmax", Rmax]];
    const exN = `**Risers:** ${commas(H)} ÷ ${Rmax} = ${(H / Rmax).toFixed(2)}, which rounds **up** to **${N}** risers.`;
    const exR = `**Riser height:** ${commas(H)} ÷ ${N} = **${R} mm**.`;
    const nPart = numPart("risers", "Risers", `Fewest equal risers that keep each riser at most ${Rmax} mm (whole number)`, N, 0, `Divide the floor-to-floor height by the largest allowed riser, then round **up**: rounding down would make the risers too tall.`);
    const rPart = numPart("riser", "Riser height", "Height of each riser (mm)", R, 0, "Divide the floor-to-floor height by the number of risers.");
    if (med) {
      return finish(
        `${STAIR_RULE} A stair must rise **${commas(H)} mm** from one floor to the next. Each riser may be **at most ${Rmax} mm**.`,
        [nPart, rPart], [exN, exR].join("\n\n"), "arc-stair", { tier, H, Rmax }, given0,
        ["The number of risers must be a whole number.", "Then share the height equally."]);
    }
    if (!plus) {
      const G = rng.pick([220, 230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 330]);
      if (tier === "hard") {
        return finish(
          `${STAIR_RULE} A stair must rise **${commas(H)} mm** between floors. Each riser may be **at most ${Rmax} mm**, and each tread has a going of **${G} mm**.`,
          [nPart, rPart, numPart("run", "Total going", "Horizontal length of the flight: all the goings together (mm)", (N - 1) * G, 0, `There is one tread fewer than risers. Multiply the number of treads by the going of ${G} mm.`)],
          [exN, exR, `**Total going:** ${N} risers means ${N - 1} treads, ${N - 1} × ${G} = **${commas((N - 1) * G)} mm**.`].join("\n\n"),
          "arc-stair", { tier, H, Rmax, G }, given0.concat([["_G", G]]),
          ["Risers first (round up), then the riser height.", "Treads = risers − 1."]);
      }
      // expert: comfort verdict, decided first
      if (comfortable(R, G) !== want) continue;
      if ([2 * R + G - COMFORT[0], 2 * R + G - COMFORT[1]].some((d) => Math.abs(d) < 5)) continue;
      const parts = [
        nPart, rPart,
        numPart("sum", "2R + G", `Value of 2R + G (mm)`, 2 * R + G, 0, `Double the riser height you found, then add the going of ${G} mm.`),
        yesNo("comfort", "Comfortable?", `${COMFORT_RULE} Is this stair comfortable?`, want, "Compare 2R + G with both ends of the stated range."),
      ];
      const ex = [exN, exR, `**2R + G:** 2 × ${R} + ${G} = **${2 * R + G} mm**.`,
        `**Comfortable?** ${2 * R + G} mm is ${want ? "between" : "outside"} ${COMFORT[0]} and ${COMFORT[1]} mm: **${want ? "Yes" : "No"}**.`].join("\n\n");
      return finish(
        `${STAIR_RULE} A stair must rise **${commas(H)} mm** between floors. Each riser may be **at most ${Rmax} mm**, and each tread has a going of **${G} mm**.`,
        parts, ex, "arc-stair", { tier, H, Rmax, G }, given0.concat([["_G", G]]),
        ["Whole risers first, then the riser height.", "2R + G uses the riser height and the going."]);
    }
    // expert-plus: working backwards from the available run
    const G = rng.int(20, 35) * 10;
    const run = (N - 1) * G;
    const P = rng.pick([30, 32, 34, 36, 38, 40]);
    const angle = (Math.atan(R / G) * 180) / Math.PI;
    if (nearHalf(angle, 1, 0.1) || Math.abs(angle - P) < 0.3) continue;
    const cOK = comfortable(R, G), pOK = angle <= P;
    if (Math.abs(2 * R + G - COMFORT[0]) < 5 || Math.abs(2 * R + G - COMFORT[1]) < 5) continue;
    if ((combo & 1) !== (cOK ? 1 : 0) || (combo & 2) !== (pOK ? 2 : 0)) continue;
    const parts = [
      nPart,
      numPart("going", "Going", `Going of each tread so that the flight uses all ${commas(run)} mm of run (mm)`, G, 0, `The run is shared equally between the treads, and there is one tread fewer than risers.`),
      numPart("pitch", "Pitch", "Pitch: the angle of the stair line above the horizontal (degrees)", angle, 1, "The stair line rises by one riser over one going: tan(pitch) = riser ÷ going. Use the riser height from the risers you found, then the inverse tangent.", false),
      segPart2(rng, "verdict", "Verdict", `${COMFORT_RULE} The pitch must be **at most ${P}°**. Judge this stair.`, ["Comfort rule", "Pitch limit"], ["Meets", "Fails"], ["Within", "Over"],
        [cOK ? "Meets" : "Fails", pOK ? "Within" : "Over"], "Work out 2R + G and compare it with the range. Compare the pitch you found with the limit."),
    ];
    const ex = [exN, `**Going:** ${commas(run)} ÷ ${N - 1} treads = **${G} mm**.`,
      `**Pitch:** the riser height is ${commas(H)} ÷ ${N} = ${R} mm, so pitch = tan⁻¹(${R} ÷ ${G}) = **${fix1(angle)}°**.`,
      `**Verdict:** 2 × ${R} + ${G} = ${2 * R + G} mm, ${cOK ? "inside" : "outside"} ${COMFORT[0]}–${COMFORT[1]} mm: **${cOK ? "Meets" : "Fails"}**. ${fix1(angle)}° is ${pOK ? "no more than" : "more than"} ${P}°: **${pOK ? "Within" : "Over"}**.`].join("\n\n");
    return finish(
      `${STAIR_RULE} A stair must rise **${commas(H)} mm** between floors, with each riser **at most ${Rmax} mm**. The space available allows a total going (horizontal run) of **${commas(run)} mm**.`,
      parts, ex, "arc-stairback", { tier, H, Rmax, run, P }, [["_H", H], ["_Rmax", Rmax], ["_run", run]],
      ["Risers first (round up), then the going from the run.", "Pitch and the comfort sum both use the riser height and the going."]);
  }
  return tooMany();
}

// ---------- daylight-glazing ----------

const WIN_W = [6, 9, 12, 15, 18]; // widths in 0.1 m
const WIN_H = [12, 15, 18, 21]; // heights in 0.1 m
const PIER = 0.6;

function genDaylight(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  const want = rng.next() < 0.5; // hard: meets the minimum?
  const band = rng.int(0, 2); // expert: 0 too little, 1 within, 2 too much
  const combo = rng.int(0, 3); // expert-plus: (daylight, wall)
  for (let i = 0; i < TRY; i++) {
    const ww = rng.pick(WIN_W), wh = rng.pick(WIN_H);
    const a100 = ww * wh; // window area in 0.01 m2
    if (a100 % 10 !== 0) continue;
    const a = a100 / 100;
    const winTxt = `**${ww / 10} m × ${wh / 10} m**`;
    let n, l2, w2, F100, L, W;
    const scaleN = rng.pick([50, 100]);
    if (plus) {
      L = rng.int(6, 14) * 10; // plan mm
      W = rng.int(5, 12) * 10;
      const l = (L * scaleN) / 1000, w = (W * scaleN) / 1000;
      l2 = l * 2; w2 = w * 2;
      if (!Number.isInteger(l2) || !Number.isInteger(w2) || l2 < 7 || w2 < 6 || l2 < w2) continue;
    } else {
      l2 = rng.int(6, 16); w2 = rng.int(5, 12);
      if (l2 < w2) continue;
    }
    F100 = 25 * l2 * w2;
    if (F100 % 10 !== 0) continue; // floor area exact to 1 decimal place
    const F = F100 / 100;
    const l = l2 / 2, w = w2 / 2;
    if (!plus) {
      n = rng.int(1, 4);
      const G100 = n * a100;
      if ((1000 * G100) % F100 !== 0) continue; // percentage exact to 1 decimal place
      const G = G100 / 100;
      const pct = (100 * G100) / F100;
      if (pct < 4 || pct > 40) continue;
      const room = `A room is **${l} m × ${w} m** and has **${n} window${n > 1 ? "s" : ""}**${n > 1 ? ", each" : ". The window is"} ${winTxt}.`;
      const given = [["_n", n], ["_win_w", ww / 10], ["_win_h", wh / 10], ["_floor", F]];
      const gPart = numPart("glazing", "Glazing area", "Total window area (m²)", G, 1, `Area of one window = width × height; multiply by the number of windows.`, false);
      const pPart = numPart("pct", "Glazing ratio", "Window area as a percentage of the floor area (%)", pct, 1, "Divide the total window area by the floor area, then multiply by 100.", false);
      const exG = `**Window area:** ${ww / 10} × ${wh / 10} = ${a.toFixed(2).replace(/0$/, "")} m² each; × ${n} = **${fix1(G)} m²**.`;
      const exP = `**Glazing ratio:** floor area = ${l} × ${w} = ${fix1(F)} m²; ${fix1(G)} ÷ ${fix1(F)} × 100 = **${fix1(pct)}%**.`;
      if (med) {
        return finish(room, [gPart, pPart], [exG, exP].join("\n\n"), "arc-day", { tier, l2, w2, ww, wh, n }, given,
          ["Total window area first.", "The ratio is window area ÷ floor area."]);
      }
      if (tier === "hard") {
        const p = rng.pick([8, 10, 12, 15, 20]);
        if (pct === p || pct >= p !== want) continue;
        const parts = [gPart, pPart, yesNo("meets", "Meets minimum?", `The rule for this exercise is that glazing must be **at least ${p}%** of the floor area. Does the room meet it?`, pct >= p, "Compare the ratio you found with the stated minimum.")];
        return finish(room, parts, [exG, exP, `**Meets the minimum?** ${fix1(pct)}% is ${pct >= p ? "at least" : "less than"} ${p}%: **${pct >= p ? "Yes" : "No"}**.`].join("\n\n"), "arc-day",
          { tier, l2, w2, ww, wh, n, p }, given.concat([["_min", p]]), ["Area, then ratio, then compare with the rule.", "The minimum is inclusive: exactly the minimum meets it."]);
      }
      // expert: min and max band, and the most windows allowed
      const p = rng.pick([8, 10, 12]), q = rng.pick([20, 25, 30]);
      const state = pct < p ? 0 : pct > q ? 2 : 1;
      if (pct === p || pct === q || state !== band) continue;
      if ((q * F100) % (100 * a100) === 0) continue; // the maximum is never met exactly
      const most = Math.floor((q * F100) / (100 * a100));
      if (most < 1) continue;
      const labels = ["Too little glazing", "Within the range", "Too much glazing"];
      const parts = [gPart, pPart,
        { id: "band", label: "Range check", ask: `For this exercise glazing must be **at least ${p}%** and **at most ${q}%** of the floor area. Where does this room fall?`, answerType: "choice", answer: labels[state], choices: shuffled(rng, labels), hint: "Compare the ratio with both ends of the range." },
        numPart("most", "Most windows", `Most windows of this size the room could have without passing ${q}% (whole number)`, most, 0, `The largest total window area allowed is ${q}% of the floor area. Divide it by the area of one window and round **down**.`)];
      const ex = [exG, exP, `**Range check:** ${fix1(pct)}% is ${state === 0 ? `below ${p}%` : state === 2 ? `above ${q}%` : `between ${p}% and ${q}%`}: **${labels[state]}**.`,
        `**Most windows:** the limit is ${q}% of ${fix1(F)} m² = ${(q * F100 / 10000).toFixed(2).replace(/0$/, "")} m²; ÷ ${(a100 / 100).toFixed(2).replace(/0$/, "")} m² per window = ${((q * F100) / (100 * a100)).toFixed(2)}, rounded **down** to **${most}**.`].join("\n\n");
      return finish(room, parts, ex, "arc-day", { tier, l2, w2, ww, wh, n, p, q }, given.concat([["_min", p], ["_max", q]]),
        ["Area and ratio first.", "A whole number of windows: round down so the limit is not passed."]);
    }
    // expert-plus: floor from a plan at scale, windows needed, wall check
    const p = rng.pick([8, 10, 12, 15, 20]);
    const req100 = (p * F100) / 100;
    if (!Number.isInteger(req100) || req100 % 10 !== 0) continue;
    if (req100 % a100 === 0) continue; // so the rounding up matters
    const need = Math.ceil(req100 / a100);
    if (need < 2 || need > 6) continue;
    const dayOK = (combo & 1) === 1, wallOK = (combo & 2) === 2;
    const cands = dayOK ? [need, need + 1] : [need - 1];
    const k = rng.pick(cands);
    if (k < 1) continue;
    const fits = k * ww + (k + 1) * (PIER * 10) <= 5 * l2; // wall in 0.1 m
    if (fits !== wallOK) continue;
    const parts = [
      numPart("floor", "Floor area", `Real floor area of the room (m²)`, F, 1, `Multiply each plan length by ${scaleN} (and divide by 1 000 for metres), then multiply the two real lengths.`, false),
      numPart("req", "Glazing needed", `Smallest window area allowed by the rule (m²)`, req100 / 100, 1, `The rule asks for at least ${p}% of the floor area: multiply the floor area by ${p} ÷ 100.`, false),
      numPart("count", "Windows needed", `Fewest windows of this size that meet the rule (whole number)`, need, 0, `Divide the smallest area allowed by the area of one window and round **up**.`),
      segPart2(rng, "verdict", "Verdict", `The designer fits **${k} window${k > 1 ? "s" : ""}** along the longer wall. Windows need **${PIER} m** of solid wall at each end and between neighbours, so k windows need k × width + (k + 1) × ${PIER} m. Does the plan meet the glazing rule, and does it fit the wall?`,
        ["Daylight", "Wall"], ["Meets", "Short"], ["Fits", "Too long"], [dayOK ? "Meets" : "Short", wallOK ? "Fits" : "Too long"],
        "Compare the number of windows with the number needed. For the wall, work out the length needed for that many windows and piers, and compare it with the wall length."),
    ];
    const lenNeed = (k * ww + (k + 1) * 6) / 10;
    const ex = [
      `**Floor area:** ${L} mm × ${scaleN} = ${commas(L * scaleN)} mm = ${l} m; ${W} mm × ${scaleN} = ${commas(W * scaleN)} mm = ${w} m; area = ${l} × ${w} = **${fix1(F)} m²**.`,
      `**Glazing needed:** ${p}% × ${fix1(F)} = **${fix1(req100 / 100)} m²**.`,
      `**Windows needed:** one window is ${(a100 / 100).toFixed(2).replace(/0$/, "")} m²; ${fix1(req100 / 100)} ÷ ${(a100 / 100).toFixed(2).replace(/0$/, "")} = ${(req100 / a100).toFixed(2)}, rounded **up** to **${need}**.`,
      `**Verdict:** ${k} window${k > 1 ? "s" : ""} is ${dayOK ? "enough" : "not enough"} (${need} needed): **${dayOK ? "Meets" : "Short"}**. The wall needs ${k} × ${ww / 10} + ${k + 1} × ${PIER} = ${lenNeed.toFixed(1)} m against a ${l} m wall: **${wallOK ? "Fits" : "Too long"}**.`,
    ].join("\n\n");
    return finish(
      `A room is drawn on a plan at scale **1 : ${scaleN}**. On the drawing it measures **${L} mm × ${W} mm**. For this exercise the glazing must be **at least ${p}%** of the floor area. Each window is ${winTxt}.`,
      parts, ex, "arc-dayback", { tier, scaleN, L, W, p, ww, wh, k }, [["_L", L], ["_W", W], ["_scale", scaleN], ["_min", p], ["_win_w", ww / 10], ["_win_h", wh / 10]],
      ["Real floor area first, then the area the rule asks for, then windows.", "The wall check uses the longer real length."],
    );
  }
  return tooMany();
}

// ---------- ramp-access ----------

function genRamp(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  const want = rng.next() < 0.5; // expert: fits the site?
  const combo = rng.int(0, 3); // expert-plus: (reaches, fits)
  for (let i = 0; i < TRY; i++) {
    const N = rng.pick([12, 15, 20]);
    const Lg10 = rng.pick([12, 15]); // landing length in 0.1 m
    const gradeTxt = `The ramp may be at most **1 in ${N}** (1 m of rise needs ${N} m of run).`;
    if (!plus) {
      const F = rng.pick([6, 8, 10]);
      const rise = rng.int(12, 48) * 25; // 300..1200 mm
      if ((rise * N) % 100 !== 0) continue; // run exact to 1 decimal place
      const run10 = (rise * N) / 100; // run in 0.1 m
      const run = run10 / 10;
      const flights = Math.ceil(run10 / (F * 10));
      if (run10 % (F * 10) === 0) continue;
      if (!med && flights < 2) continue;
      if (med && flights < 1) continue;
      const total10 = run10 + (flights - 1) * Lg10;
      const total = total10 / 10;
      const rule = `${gradeTxt} A flight may be **at most ${F} m** long, and flights are separated by a level landing **${Lg10 / 10} m** long. Use the horizontal length for the ramp.`;
      const given = [["_rise", rise], ["_N", N], ["_flight", F]];
      const runPart = numPart("run", "Ramp length", "Shortest length of ramp (m)", run, 1, `Run = rise × N. Change the rise from mm to m (1 000 mm = 1 m) before you multiply, or divide by 1 000 afterwards.`, false);
      const flPart = numPart("flights", "Flights", `Fewest flights, each at most ${F} m (whole number)`, flights, 0, `Divide the ramp length by the longest allowed flight and round **up**.`);
      const exRun = `**Ramp length:** ${commas(rise)} mm = ${rise / 1000} m of rise, × ${N} = **${fix1(run)} m**.`;
      const exFl = `**Flights:** ${fix1(run)} ÷ ${F} = ${(run / F).toFixed(2)}, rounded **up** to **${flights}**.`;
      const exTot = `**Total length:** ${flights} flights make ${flights - 1} landing${flights > 2 ? "s" : ""}; ${fix1(run)} + ${flights - 1} × ${Lg10 / 10} = **${fix1(total)} m**.`;
      if (med) {
        return finish(`A ramp must climb **${commas(rise)} mm**. ${rule}`, [runPart, flPart], [exRun, exFl].join("\n\n"), "arc-ramp",
          { tier, rise, N, F, Lg10 }, given, ["Length from the rise and the gradient first.", "Flights are whole numbers: round up."]);
      }
      const totPart = numPart("total", "Total length", "Total length of the ramp including the landings between flights (m)", total, 1, `Landings go between flights only, so there is one fewer landing than flights. Add them to the ramp length.`, false);
      if (tier === "hard") {
        return finish(`A ramp must climb **${commas(rise)} mm**. ${rule}`, [runPart, flPart, totPart], [exRun, exFl, exTot].join("\n\n"), "arc-ramp",
          { tier, rise, N, F, Lg10 }, given.concat([["_landing", Lg10 / 10]]), ["Ramp length, then flights, then add the landings.", "Landings = flights − 1."]);
      }
      // expert: site length verdict
      const base = Math.round(total);
      const delta = rng.pick([0, 1, 2, 3]);
      const S10 = (want ? base + delta : base - delta) * 10 + rng.pick([0, 5]);
      if (want ? S10 - total10 < 3 : total10 - S10 < 3) continue;
      const S = S10 / 10;
      const parts = [runPart, flPart, totPart, yesNo("fits", "Fits the site?", `The straight strip available on site is **${fix1(S)} m** long. Does the ramp fit?`, total10 <= S10, "Compare the total length with the length of the strip.")];
      const ex = [exRun, exFl, exTot, `**Fits the site?** ${fix1(total)} m is ${total10 <= S10 ? "no more than" : "more than"} ${fix1(S)} m: **${total10 <= S10 ? "Yes" : "No"}**.`].join("\n\n");
      return finish(`A ramp must climb **${commas(rise)} mm**. ${rule}`, parts, ex, "arc-ramp", { tier, rise, N, F, Lg10, S10 }, given.concat([["_landing", Lg10 / 10]]),
        ["Length, flights, then landings.", "Compare the total with the strip, not the ramp length alone."]);
    }
    // expert-plus: how much rise fits a strip
    const F = rng.pick([6, 9]);
    const rpf = (F * 1000) / N;
    if (!Number.isInteger(rpf) || rpf % 50 !== 0) continue;
    const kfit = rng.int(1, 4);
    const e10 = rng.int(3, F * 10 + Lg10 - 3);
    const S10 = kfit * F * 10 + (kfit - 1) * Lg10 + e10;
    if (S10 > 450) continue;
    const S = S10 / 10;
    // integer check of how many flights fit
    let kk = 0;
    while ((kk + 1) * F * 10 + kk * Lg10 <= S10) kk++;
    if (kk !== kfit) continue;
    const maxRise = kfit * rpf;
    const fitOK = (combo & 1) === 1, reachOK = (combo & 2) === 2;
    const kp = fitOK ? rng.int(1, kfit) : kfit + rng.int(1, 2);
    const off = rng.pick([50, 100, 150, 200]);
    const Rq = reachOK ? kp * rpf - off : kp * rpf + off;
    if (Rq <= 0) continue;
    const parts = [
      numPart("perflight", "Rise per flight", `Rise gained by one full ${F} m flight (mm)`, rpf, 0, `One flight is ${F} m long at 1 in ${N}: rise = run ÷ N, then convert metres to millimetres.`),
      numPart("fit", "Flights that fit", `Most full flights that fit in the strip (whole number)`, kfit, 0, `k flights need k × ${F} m of ramp plus (k − 1) landings of ${Lg10 / 10} m. Find the largest k that does not pass the strip length.`),
      numPart("maxrise", "Most rise", "Greatest rise the strip can give (mm)", maxRise, 0, "Multiply the number of flights that fit by the rise of one flight."),
      segPart2(rng, "verdict", "Verdict", `The client needs a rise of **${commas(Rq)} mm**. The designer proposes **${kp} flight${kp > 1 ? "s" : ""}**. Does the proposal reach the upper level, and does it fit the strip?`,
        ["Level reached", "Strip"], ["Reaches", "Falls short"], ["Fits", "Too long"], [reachOK ? "Reaches" : "Falls short", fitOK ? "Fits" : "Too long"],
        "Multiply the proposed flights by the rise per flight and compare with the rise needed. For the strip, compare the proposed number of flights with the number that fit."),
    ];
    const ex = [
      `**Rise per flight:** ${F} ÷ ${N} = ${(F / N).toFixed(3).replace(/0+$/, "")} m = **${rpf} mm**.`,
      `**Flights that fit:** ${kfit} flight${kfit > 1 ? "s" : ""} need ${kfit} × ${F} + ${kfit - 1} × ${Lg10 / 10} = ${fix1(kfit * F + ((kfit - 1) * Lg10) / 10)} m, within ${fix1(S)} m; ${kfit + 1} would need ${fix1((kfit + 1) * F + (kfit * Lg10) / 10)} m, which is too long: **${kfit}**.`,
      `**Most rise:** ${kfit} × ${rpf} = **${commas(maxRise)} mm**.`,
      `**Verdict:** ${kp} × ${rpf} = ${commas(kp * rpf)} mm is ${reachOK ? "at least" : "less than"} ${commas(Rq)} mm: **${reachOK ? "Reaches" : "Falls short"}**. ${kp} flight${kp > 1 ? "s" : ""} ${fitOK ? "fit" : "do not fit"} (${kfit} fit): **${fitOK ? "Fits" : "Too long"}**.`,
    ].join("\n\n");
    return finish(
      `${gradeTxt} Every flight is **exactly ${F} m** long, and flights are separated by a level landing **${Lg10 / 10} m** long. A straight strip **${fix1(S)} m** long is available for the ramp (use horizontal lengths).`,
      parts, ex, "arc-rampback", { tier, N, F, Lg10, S10, kp, Rq }, [["_N", N], ["_flight", F], ["_landing", Lg10 / 10], ["_strip", S]],
      ["The rise of one flight follows from its length and the gradient.", "Flights and landings both use up the strip."],
    );
  }
  return tooMany();
}

// ---------- planting-paving ----------

function genPlant(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  const cover = rng.int(0, 2); // expert-plus: 0 whole, 1 more than half, 2 half or less
  for (let i = 0; i < TRY; i++) {
    const pl = rng.int(8, 24), pw = rng.int(6, 16);
    const a = rng.int(3, 6), b = rng.int(3, 6);
    if (pl < pw || a * b * 100 > pl * pw * 40) continue;
    const planted = pl * pw - a * b;
    const d = rng.pick([4, 5, 6, 8, 10]);
    const t = rng.pick([6, 8, 10, 12, 15, 20]);
    const s = rng.pick([450, 600]);
    const trayP = rng.pick([14, 16, 18, 20, 24]), slabP = rng.pick([4, 5, 6, 7, 8]);
    const plants = planted * d;
    const na = Math.ceil((a * 1000) / s), nb = Math.ceil((b * 1000) / s);
    const slabs = na * nb;
    if ((a * 1000) % s === 0 && (b * 1000) % s === 0) continue;
    const site = `A garden is **${pl} m × ${pw} m**. A rectangular patio of **${a} m × ${b} m** is paved and the rest of the garden is planted.`;
    const given = [["_plot_l", pl], ["_plot_w", pw], ["_patio_a", a], ["_patio_b", b], ["_density", d]];
    const areaPart = numPart("planted", "Planted area", "Area to be planted (m²)", planted, 0, "Garden area minus patio area.");
    const exArea = `**Planted area:** ${pl} × ${pw} − ${a} × ${b} = ${pl * pw} − ${a * b} = **${planted} m²**.`;
    const exPlants = `**Plants:** ${planted} × ${d} = **${plants}**.`;
    const trays = Math.ceil(plants / t);
    if (!plus) {
      const dens = `The bed is planted at **${d} plants per m²**.`;
      const plPart = numPart("plants", "Plants", "Number of plants needed", plants, 0, `Planted area × ${d} plants per m².`);
      if (med) {
        return finish(`${site} ${dens}`, [areaPart, plPart], [exArea, exPlants].join("\n\n"), "arc-plant", { tier, pl, pw, a, b, d }, given,
          ["Subtract the patio from the whole garden.", "Then multiply by the density."]);
      }
      if (plants % t === 0) continue;
      const trPart = numPart("trays", "Trays", `Trays needed if plants are sold in trays of ${t} (whole number)`, trays, 0, `Divide the number of plants by ${t} and round **up**: part trays cannot be bought.`);
      const exTr = `**Trays:** ${plants} ÷ ${t} = ${(plants / t).toFixed(2)}, rounded **up** to **${trays}**.`;
      if (tier === "hard") {
        return finish(`${site} ${dens} Plants are sold in trays of **${t}**.`, [areaPart, plPart, trPart], [exArea, exPlants, exTr].join("\n\n"), "arc-plant",
          { tier, pl, pw, a, b, d, t }, given.concat([["_tray", t]]), ["Planted area, then plants, then trays.", "Trays are whole numbers: round up."]);
      }
      const slabTxt = `The patio is paved with **${s} mm × ${s} mm** slabs, laid in a grid from one corner; cut slabs count as whole slabs and offcuts are not reused.`;
      const cost = trays * trayP + slabs * slabP;
      const parts = [areaPart, trPart,
        numPart("slabs", "Slabs", "Number of slabs for the patio (whole number)", slabs, 0, `Count the slabs along each side of the patio (side in mm ÷ ${s}, rounded **up**: a cut slab is a whole slab), then multiply the two counts.`),
        numPart("cost", "Total cost", "Total cost of the trays and the slabs ($)", cost, 0, `Trays × ${money(trayP)} plus slabs × ${money(slabP)}.`)];
      const ex = [exArea, exPlants, exTr,
        `**Slabs:** along the ${a} m side, ${commas(a * 1000)} ÷ ${s} = ${(a * 1000 / s).toFixed(2)}${(a * 1000) % s ? `, rounded **up** to ${na}` : ""}; along the ${b} m side, ${commas(b * 1000)} ÷ ${s} = ${(b * 1000 / s).toFixed(2)}${(b * 1000) % s ? `, rounded **up** to ${nb}` : ""}. Slabs = ${na} × ${nb} = **${slabs}** (dividing the area alone would give too few, because cut pieces are not reused).`,
        `**Total cost:** ${trays} × ${trayP} + ${slabs} × ${slabP} = ${trays * trayP} + ${slabs * slabP} = **${money(commas(cost))}**.`].join("\n\n");
      return finish(`${site} ${dens} Plants are sold in trays of **${t}** at **${money(trayP)}** a tray. ${slabTxt} Slabs cost **${money(slabP)}** each.`,
        parts, ex, "arc-plant", { tier, pl, pw, a, b, d, t, s, trayP, slabP }, given.concat([["_tray", t], ["_tray_cost", trayP], ["_slab_cost", slabP]]),
        ["Planted area, then plants, then trays: round up the trays.", "The slabs also round up. Then price both."]);
    }
    // expert-plus: how much of the bed can the budget plant
    if (plants % t === 0) continue;
    const pcost = slabs * slabP;
    let T;
    if (cover === 0) T = trays + rng.int(0, 2);
    else if (cover === 1) {
      const lo = Math.floor(plants / (2 * t)) + 1;
      if (trays - 1 < lo) continue;
      T = rng.int(lo, trays - 1);
    } else {
      const hi = Math.ceil(plants / (2 * t)) - 1;
      if (hi < 1) continue;
      T = rng.int(1, hi);
    }
    const covered = cover === 0 ? T * t >= plants : cover === 1 ? 2 * T * t > plants && T * t < plants : 2 * T * t <= plants;
    if (!covered) continue;
    const B = pcost + T * trayP + rng.int(0, trayP - 1);
    const labels = ["All of it", "More than half, but not all", "Half or less"];
    const parts = [
      numPart("slabs", "Slabs", "Number of slabs for the patio (whole number)", slabs, 0, `Count the slabs along each side of the patio (side in mm ÷ ${s}, rounded **up**: a cut slab is a whole slab), then multiply the two counts.`),
      numPart("paving", "Paving cost", "Cost of the paving ($)", pcost, 0, `Slabs × ${money(slabP)} each.`),
      numPart("trays", "Trays affordable", "Most trays the money left can buy (whole number)", T, 0, `Take the paving cost off the budget, divide by the price of a tray and round **down**.`),
      { id: "cover", label: "Coverage", ask: `The planted area needs **${plants} plants**. How much of it can the trays you bought plant?`, answerType: "choice", answer: labels[cover], choices: shuffled(rng, labels), hint: `Each tray holds ${t} plants. Compare the plants the trays give with the plants the whole bed needs, and with half of that.` },
    ];
    parts[3].ask = `The garden needs **${plants}** plants in all (area to plant × density). How much of the planted area can the trays you bought cover?`;
    const ex = [
      `**Slabs:** along the ${a} m side, ${commas(a * 1000)} ÷ ${s} = ${(a * 1000 / s).toFixed(2)}${(a * 1000) % s ? `, rounded **up** to ${na}` : ""}; along the ${b} m side, ${commas(b * 1000)} ÷ ${s} = ${(b * 1000 / s).toFixed(2)}${(b * 1000) % s ? `, rounded **up** to ${nb}` : ""}. Slabs = ${na} × ${nb} = **${slabs}** (dividing the area alone would give too few, because cut pieces are not reused).`,
      `**Paving cost:** ${slabs} × ${slabP} = **${money(commas(pcost))}**.`,
      `**Trays affordable:** ${commas(B)} − ${commas(pcost)} = ${commas(B - pcost)}; ÷ ${trayP} = ${((B - pcost) / trayP).toFixed(2)}, rounded **down** to **${T}**.`,
      `**Coverage:** the planted area is ${pl} × ${pw} − ${a * b} = ${planted} m², needing ${planted} × ${d} = ${plants} plants. ${T} trays give ${T} × ${t} = ${T * t} plants: **${labels[cover]}**.`,
    ].join("\n\n");
    return finish(
      `A garden is **${pl} m × ${pw} m**. A patio of **${a} m × ${b} m** is paved with **${s} mm × ${s} mm** slabs laid in a grid from one corner (cut slabs count as whole slabs; offcuts are not reused) at **${money(slabP)}** each. The rest is planted at **${d} plants per m²**, sold in trays of **${t}** at **${money(trayP)}** a tray. The total budget for paving and plants is **${money(commas(B))}**, and the paving is bought first.`,
      parts, ex, "arc-plantback", { tier, pl, pw, a, b, d, t, s, trayP, slabP, B }, given.concat([["_budget", B], ["_tray", t], ["_tray_cost", trayP], ["_slab_cost", slabP]]).slice(0, 8),
      ["The patio decides the paving cost; what is left buys the trays.", "Whole trays only: round down what you can afford."],
    );
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "plan-scale") return genPlan(rng, difficulty);
  if (subtopic === "stair-rule") return genStair(rng, difficulty);
  if (subtopic === "daylight-glazing") return genDaylight(rng, difficulty);
  if (subtopic === "ramp-access") return genRamp(rng, difficulty);
  if (subtopic === "planting-paving") return genPlant(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (integer millimetres,
// counting loops, rebuilt tables). Numbers must be within tolerance; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");
const ceilDiv = (x, y) => Math.floor((x + y - 1) / y);
const floorDiv = (x, y) => Math.floor(x / y);
// Slabs in a grid: count along each side with a loop (a part slab is a whole slab), then multiply.
const slabGrid = (am, bm, s) => {
  let na = 0, nb = 0;
  while (na * s < am * 1000) na++;
  while (nb * s < bm * 1000) nb++;
  return na * nb;
};

const ALT = {
  "arc-plan": (p) => {
    const rl = p.L * p.n, rw = p.W * p.n; // real mm
    const areaMM2 = rl * rw;
    const area = areaMM2 / 1e6;
    const out = { len: Math.max(rl, rw) / 1000, area, cost: (areaMM2 * p.r) / 1e6 };
    if (p.c !== undefined) {
      out.total = (areaMM2 * p.r * (100 + p.c)) / 1e8;
      out.budget = YN(areaMM2 * p.r * (100 + p.c) <= p.B * 1e8);
    }
    return out;
  },
  "arc-planback": (p) => {
    // work in cents of a metre-square: area = B / (r x (100 + c) / 100)
    const area = (p.B * 100) / (p.r * (100 + p.c));
    const okBudget = p.lp2 * p.w * p.r * (100 + p.c) <= 200 * p.B;
    const lmax = area / p.w;
    return {
      area, length: lmax, drawn: (lmax * 1000) / p.n,
      verdict: `${okBudget ? "Within" : "Over"} | ${(p.lp2 * 500) / p.n <= p.S ? "Fits" : "Too long"}`,
    };
  },
  "arc-stair": (p) => {
    let N = 1;
    while (p.H / N > p.Rmax) N++; // fewest equal risers
    const R = p.H / N;
    const out = { risers: N, riser: R };
    if (p.G !== undefined) {
      out.run = (N - 1) * p.G;
      out.sum = 2 * R + p.G;
      out.comfort = YN(out.sum > COMFORT[0] && out.sum < COMFORT[1]);
    }
    return out;
  },
  "arc-stairback": (p) => {
    let N = 1;
    while (p.H / N > p.Rmax) N++;
    const R = p.H / N, G = p.run / (N - 1);
    const sum = 2 * R + G;
    const deg = Math.atan2(R, G) * (180 / Math.PI);
    return { risers: N, going: G, pitch: deg, verdict: `${sum > COMFORT[0] && sum < COMFORT[1] ? "Meets" : "Fails"} | ${deg <= p.P ? "Within" : "Over"}` };
  },
  "arc-day": (p) => {
    const F100 = 25 * p.l2 * p.w2, a100 = p.ww * p.wh;
    let G100 = 0;
    for (let i = 0; i < p.n; i++) G100 += a100; // add windows one by one
    const out = { glazing: G100 / 100, pct: (G100 / F100) * 100 };
    if (p.p !== undefined) {
      out.meets = YN(G100 * 100 >= p.p * F100);
      if (p.q !== undefined) {
        const state = G100 * 100 < p.p * F100 ? "Too little glazing" : G100 * 100 > p.q * F100 ? "Too much glazing" : "Within the range";
        let m = 0;
        while ((m + 1) * a100 * 100 <= p.q * F100) m++;
        out.band = state;
        out.most = m;
      }
    }
    return out;
  },
  "arc-dayback": (p) => {
    const lmm = Math.max(p.L, p.W) * p.scaleN, smm = Math.min(p.L, p.W) * p.scaleN; // real mm
    const F = (lmm * smm) / 1e6;
    const req = (F * p.p) / 100;
    const aw = (p.ww * p.wh) / 100;
    let need = 0;
    while (need * aw < req - 1e-9) need++;
    const wallM = lmm / 1000;
    const lenNeed = (p.k * p.ww) / 10 + (p.k + 1) * PIER;
    return { floor: F, req, count: need, verdict: `${p.k >= need ? "Meets" : "Short"} | ${lenNeed <= wallM + 1e-9 ? "Fits" : "Too long"}` };
  },
  "arc-ramp": (p) => {
    const run10 = (p.rise * p.N) / 100;
    let flights = 0;
    while (flights * p.F * 10 < run10) flights++;
    const total10 = run10 + (flights - 1) * p.Lg10;
    const out = { run: run10 / 10, flights, total: total10 / 10 };
    if (p.S10 !== undefined) out.fits = YN(total10 <= p.S10);
    return out;
  },
  "arc-rampback": (p) => {
    const rpf = (p.F * 1000) / p.N;
    let k = 0;
    while ((k + 1) * p.F * 10 + k * p.Lg10 <= p.S10) k++;
    const fitsStrip = p.kp * p.F * 10 + (p.kp - 1) * p.Lg10 <= p.S10;
    return { perflight: rpf, fit: k, maxrise: k * rpf, verdict: `${p.kp * rpf >= p.Rq ? "Reaches" : "Falls short"} | ${fitsStrip ? "Fits" : "Too long"}` };
  },
  "arc-plant": (p) => {
    const planted = p.pl * p.pw - p.a * p.b;
    const plants = planted * p.d;
    const out = { planted, plants };
    if (p.t !== undefined) {
      let trays = 0;
      while (trays * p.t < plants) trays++;
      out.trays = trays;
      if (p.s !== undefined) {
        const slabs = slabGrid(p.a, p.b, p.s);
        out.slabs = slabs;
        out.cost = trays * p.trayP + slabs * p.slabP;
      }
    }
    return out;
  },
  "arc-plantback": (p) => {
    const slabs = slabGrid(p.a, p.b, p.s);
    const paving = slabs * p.slabP;
    const T = floorDiv(p.B - paving, p.trayP);
    const need = (p.pl * p.pw - p.a * p.b) * p.d;
    const got = T * p.t;
    const cover = got >= need ? "All of it" : got * 2 > need ? "More than half, but not all" : "Half or less";
    return { slabs, paving, trays: T, cover };
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
      if (!near(partNum(answer, part.id), tv, tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
