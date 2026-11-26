// Marketing Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (or a rounded earlier answer would not change a later one), no answer sits
// on a rounding half-step, and verdict parts are decided first and then fitted. All figures are made up,
// money is a generic $, and every rule (funnel stages, CAC, LTV, the 3:1 rule, ROAS, break-even ROAS, the
// diminishing-return rule, promotion options) is an exercise rule stated in each prompt, not marketing advice.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   funnel       impressions -> clicks -> trials -> paying customers -> cost per customer; expert-plus works
//                backwards from a customer goal (round up at each stage) to impressions and a budget verdict
//   cac-payback  CAC -> payback months -> LTV:CAC -> 3:1 verdict; expert-plus: two channels, blended CAC,
//                LTV from monthly churn, ratio, lower-CAC channel + rule verdict
//   roas-budget  ROAS -> profit after ad spend; two channels -> better one -> revenue after a budget shift;
//                expert-plus: break-even ROAS, above/below per channel, shift with a diminishing-return rule
//   promo-profit sale price -> new unit margin -> units needed to keep profit -> forecast verdict;
//                expert-plus: discount versus free gift compared on total profit

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-marketing-manager: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const neg = n < 0; const [a, b] = Math.abs(Number(n)).toFixed(2).split("."); return `${neg ? "−" : ""}$${commas(a)}.${b}`; };
const moneyW = (n) => `${n < 0 ? "−" : ""}$${commas(Math.abs(Math.round(n)))}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const cdiv = (a, b) => Math.floor((a + b - 1) / b); // integer ceiling division
const cents = (c) => c / 100;

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, [a, b]), hint };
}
// Segmented part: all combinations of two small value lists (2 x 2), shuffled by the caller's rng.
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: shuffled(rng, choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- funnel ----------

const OFFERS = ["a language-learning app", "a meal-kit subscription", "an online course", "a fitness app", "a budgeting app", "a note-taking tool", "a music-lesson platform", "a photo-printing service"];
const CTR_T = [10, 15, 20, 25, 30, 40, 50]; // click-through rate in tenths of a percent
const S_LIST = [8, 10, 12, 15, 20, 25, 30, 40];
const B_LIST = [5, 10, 15, 20, 25, 30, 40, 50];
const ctrTxt = (t) => f(t / 10);

function genFunnel(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const offer = rng.pick(OFFERS), ctrT = rng.pick(CTR_T), s = rng.pick(S_LIST), b = rng.pick(B_LIST);
    if (tier === "expert-plus") {
      const G = 10 * rng.int(2, 60), m = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
      const sg = cdiv(G * 100, b), cl = cdiv(sg * 100, s), im = cdiv(cl * 1000, ctrT);
      if (im > 3000000 || im < 20000) continue;
      if (sg * b === G * 100 && cl * s === sg * 100 && im * ctrT === cl * 1000) continue; // at least one stage must round up
      const costK = im * m; // cost in $ x 1000
      const cost = costK / 1000;
      const Bd = 50 * Math.round((cost * rng.pick([0.8, 0.85, 0.9, 1.1, 1.15, 1.2, 1.3])) / 50);
      if (Bd < 100 || Math.abs(Bd - cost) / cost < 0.08) continue;
      const ok = costK <= Bd * 1000;
      if (ok !== wantYes) continue;
      const parts = [
        numPart("trials", "Trials needed", "Free trials needed to reach the goal (round up)", sg, 0, "Work back from the goal: customers = trials × the share that pay. Divide the goal by that share and round up to a whole trial.", true),
        numPart("clicks", "Clicks needed", "Clicks needed to produce those trials (round up)", cl, 0, "Same step one stage earlier: trials = clicks × the share that start a trial. Use the whole number of trials from the first part.", true),
        numPart("views", "Ad views needed", "Ad views needed to produce those clicks (round up)", im, 0, "Clicks = views × the click-through rate. Divide the clicks by the rate and round up to a whole view.", true),
        yesNo("fits", "Within budget?", `The ad platform charges **${money(m)}** per 1,000 ad views. Does the cost of those views stay within the **${moneyW(Bd)}** budget?`, ok, "Cost = views ÷ 1,000 × the price per 1,000 views. Compare it with the budget."),
      ];
      const ex = `**Trials:** ${G} ÷ ${b}% = ${f(G * 100 / b)}, round up to **${commas(sg)}**.\n\n**Clicks:** ${commas(sg)} ÷ ${s}% = ${f(sg * 100 / s)}, round up to **${commas(cl)}**.\n\n**Ad views:** ${commas(cl)} ÷ ${ctrTxt(ctrT)}% = ${f(cl * 100 / (ctrT / 10))}, round up to **${commas(im)}**.\n\n**Cost:** ${commas(im)} ÷ 1,000 × ${money(m)} = ${money(cost)}, which is ${ok ? "within" : "over"} the ${moneyW(Bd)} budget: **${YN(ok)}**.`;
      return finish(`A campaign for **${offer}** wants **${commas(G)} paying customers**. From past campaigns, **${ctrTxt(ctrT)}%** of ad views become a click, **${s}%** of clicks start a free trial, and **${b}%** of free trials become paying customers. Counts are whole people, so work backwards one stage at a time and **round up at every stage**, using the whole number from the stage before.`,
        parts, ex, "mkm-fun4", { tier, G, ctrT, s, b, m, Bd }, [["_goal", G], ["_ctr", ctrT / 10], ["_trial", s], ["_paid", b], ["_cpm", m], ["_budget", Bd]],
        ["Start from the goal and move one stage back at a time.", "Each stage rounds up before you use it in the next stage."]);
    }
    const I = 1000 * rng.int(20, 500);
    const clicks = (I * ctrT) / 1000, trials = (clicks * s) / 100, buyers = (trials * b) / 100;
    if (![clicks, trials, buyers].every(Number.isInteger) || clicks < 300 || buyers < 10) continue;
    const base = `An ad campaign for **${offer}** is shown **${commas(I)} times**. **${ctrTxt(ctrT)}%** of views become a click, **${s}%** of clicks start a free trial, and **${b}%** of free trials become paying customers. Every stage is a whole number of people.`;
    const exC = `**Clicks:** ${commas(I)} × ${ctrTxt(ctrT)}% = **${commas(clicks)}**.`;
    const exT = `**Trials:** ${commas(clicks)} × ${s}% = **${commas(trials)}**.`;
    const exB = `**Paying customers:** ${commas(trials)} × ${b}% = **${commas(buyers)}**.`;
    const pC = numPart("clicks", "Clicks", "Clicks on the ads", clicks, 0, "Ad views times the click-through rate.", true);
    const pT = numPart("trials", "Free trials", "Free trials started", trials, 0, "Clicks times the share of clicks that start a trial.", true);
    const given = [["_views", I], ["_ctr", ctrT / 10], ["_trial", s], ["_paid", b]];
    const pr = { tier, I, ctrT, s, b };
    if (tier === "medium") return finish(base, [pC, pT], `${exC}\n\n${exT}`, "mkm-fun1", pr, given, ["One stage at a time: views to clicks first.", "Then use the clicks for the next stage."]);
    const pB = numPart("buyers", "Paying customers", "Paying customers won", buyers, 0, "Free trials times the share of trials that become paying customers.", true);
    if (tier === "hard") return finish(base, [pC, pT, pB], `${exC}\n\n${exT}\n\n${exB}`, "mkm-fun2", pr, given, ["Three stages in a row, each from the one before.", "Percentages become decimals when you multiply."]);
    const B = 50 * rng.int(20, 400), cpc = B / buyers;
    if (cpc < 4 || cpc > 600 || nearHalf(cpc, 2, 0.05)) continue;
    const pCost = numPart("cost", "Cost per customer", "Campaign cost per paying customer ($)", cpc, 2, "Divide the whole campaign cost by the number of paying customers.");
    return finish(`${base} The campaign cost **${moneyW(B)}** in total.`, [pC, pT, pB, pCost],
      `${exC}\n\n${exT}\n\n${exB}\n\n**Cost per customer:** ${moneyW(B)} ÷ ${commas(buyers)} = ${money(cpc)}, about **${money(roundTo(cpc, 2))}**.`,
      "mkm-fun3", { ...pr, B }, [...given, ["_cost", B]], ["Work through the three stages to the paying customers.", "Then spread the whole cost over them."]);
  }
  return tooMany();
}

// ---------- cac-payback ----------

const CAC_PRODUCTS = ["a meal-kit subscription", "a language-learning app", "a fitness app", "an online magazine", "a cloud storage service", "a pet-food subscription"];
const M_LIST = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75];
const CH_NAMES = [["search ads", "social ads"], ["email campaigns", "video ads"], ["influencer posts", "display ads"], ["podcast ads", "search ads"]];
const RULE3 = "The rule for this exercise: acquisition is healthy when LTV is at least **3 times** the CAC.";

function genCac(rng, tier) {
  const wantYes = rng.next() < 0.5, wantA = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const prod = rng.pick(CAC_PRODUCTS), m = rng.pick(M_LIST);
    if (tier === "expert-plus") {
      const [nmA, nmB] = rng.pick(CH_NAMES);
      const Nt = rng.pick([20, 25, 40, 50, 100, 200]), NA = rng.int(Math.ceil(Nt * 0.2), Math.floor(Nt * 0.8)), NB = Nt - NA;
      const cA = 25 * rng.int(40, 800), cB = 25 * rng.int(40, 800);
      if (Math.abs(cA - cB) < 0.15 * Math.min(cA, cB)) continue;
      const tot = NA * cA + NB * cB;
      if (tot % Nt !== 0) continue;
      const bc = tot / Nt; // blended CAC in cents
      const ch = rng.pick([2, 4, 5, 8, 10, 20, 25]);
      if ((m * 100) % ch !== 0) continue;
      const ltv = (m * 100) / ch;
      const ratio = (ltv * 100) / bc;
      if (ratio < 0.8 || ratio > 12 || Math.abs(ratio - 3) < 0.35 || nearHalf(ratio, 2, 0.05)) continue;
      const lowA = cA < cB, yes = ratio >= 3;
      if (yes !== wantYes || lowA !== wantA) continue;
      const SA = (NA * cA) / 100, SB = (NB * cB) / 100;
      const lowName = lowA ? "Channel A" : "Channel B";
      const parts = [
        numPart("blend", "Blended CAC", "Blended CAC across both channels: total spend ÷ total new customers ($)", bc / 100, 2, "Add the two spends, add the two customer counts, then divide. Do not average the two channel CACs."),
        numPart("ltv", "Lifetime value", "LTV of one customer ($)", ltv, 2, "The average stay in months is one over the monthly churn rate (as a decimal). Multiply that by the monthly margin."),
        numPart("ratio", "LTV : CAC", "LTV ÷ blended CAC, as a ratio", ratio, 2, "Divide the lifetime value by the blended CAC from the first part."),
        segPart2(rng, "verdict", "Verdicts", "Which channel has the lower CAC on its own, and does the blended result meet the rule?",
          ["Lower-CAC channel", "Meets 3:1 (blended)"], ["Channel A", "Channel B"], ["Yes", "No"], [lowName, YN(yes)], "Find each channel's own CAC (spend ÷ customers) and compare. Then compare the ratio with the rule."),
      ];
      const ex = `**Blended CAC:** (${money(SA)} + ${money(SB)}) ÷ (${NA} + ${NB}) = ${money(SA + SB)} ÷ ${Nt} = **${money(bc / 100)}**.\n\n**LTV:** the average stay is 1 ÷ ${ch}% = ${f(100 / ch)} months, so ${money(m)} × ${f(100 / ch)} = **${money(ltv)}**.\n\n**Ratio:** ${money(ltv)} ÷ ${money(bc / 100)} = ${f(roundTo(ratio, 4))}, about **${roundTo(ratio, 2)}**.\n\n**Verdicts:** channel CACs are ${money(cA / 100)} (A) and ${money(cB / 100)} (B), so **${lowName}** is lower. ${roundTo(ratio, 2)} is ${yes ? "at least" : "below"} 3, so the rule is met: **${YN(yes)}**.`;
      return finish(`A company selling **${prod}** won **${NA}** new customers from **${nmA}** (Channel A) for **${money(SA)}** and **${NB}** from **${nmB}** (Channel B) for **${money(SB)}**. Each customer brings **${money(m)}** of gross margin a month, and **${ch}%** of customers leave each month, so the average customer stays 1 ÷ churn months. LTV = monthly margin × months stayed. ${RULE3} Blended CAC pools both channels.`,
        parts, ex, "mkm-cac4", { tier, NA, NB, cA, cB, m, ch }, [["_spendA", SA], ["_custA", NA], ["_spendB", SB], ["_custB", NB], ["_margin", m], ["_churn", ch]],
        ["Pool the two channels before you divide.", "Churn gives the average stay; the stay gives the LTV."]);
    }
    const cc = 25 * rng.int(40, 1600), N = rng.int(30, 800), S = (N * cc) / 100;
    const mo = cc / 100 / m;
    if (mo < 2 || mo > 30 || nearHalf(mo, 1, 0.05) || S < 1000 || S > 400000) continue;
    const base = `A company selling **${prod}** spent **${money(S)}** on marketing last quarter and won **${commas(N)} new customers**. Each customer brings **${money(m)}** of gross margin a month. Count only that quarter's spend and customers.`;
    const exCac = `**CAC:** ${money(S)} ÷ ${commas(N)} = **${money(cc / 100)}**.`;
    const exPb = `**Payback:** ${money(cc / 100)} ÷ ${money(m)} = ${f(roundTo(mo, 3))}, about **${roundTo(mo, 1)} months**.`;
    const pCac = numPart("cac", "CAC", "Customer acquisition cost (CAC): spend ÷ new customers ($)", cc / 100, 2, "Divide the marketing spend by the number of new customers it won.");
    const pPb = numPart("payback", "Payback period", "Payback period: CAC ÷ monthly margin per customer (months)", mo, 1, "How many months of margin does it take to earn back one customer's CAC?");
    const given = [["_spend", S], ["_new", N], ["_margin", m]];
    if (tier === "medium") return finish(base, [pCac, pPb], `${exCac}\n\n${exPb}`, "mkm-cac1", { tier, S, N, m }, given, ["CAC first, then months of margin.", "Payback is a count of months."]);
    const L = rng.pick([12, 18, 24, 30, 36]), ratio = (m * L * 100) / cc;
    if (ratio < 0.8 || ratio > 12 || nearHalf(ratio, 2, 0.05)) continue;
    const ltvTxt = `LTV = monthly margin × months stayed, and on average a customer stays **${L} months**.`;
    const pRat = numPart("ratio", "LTV : CAC", "LTV ÷ CAC, as a ratio", ratio, 2, "First the lifetime value (margin times months stayed), then divide by the CAC.");
    const exRat = `**LTV:** ${money(m)} × ${L} = ${money(m * L)}. **Ratio:** ${money(m * L)} ÷ ${money(cc / 100)} = ${f(roundTo(ratio, 4))}, about **${roundTo(ratio, 2)}**.`;
    if (tier === "hard") return finish(`${base} ${ltvTxt}`, [pCac, pPb, pRat], `${exCac}\n\n${exPb}\n\n${exRat}`, "mkm-cac2", { tier, S, N, m, L }, [...given, ["_months", L]],
      ["CAC and payback as before, then the lifetime value.", "The ratio compares what a customer earns with what they cost."]);
    if (Math.abs(ratio - 3) < 0.35) continue;
    const yes = ratio >= 3;
    if (yes !== wantYes) continue;
    const pOk = yesNo("ok", "Healthy?", "Does the ratio meet the rule?", yes, "Compare the ratio with the threshold in the rule.");
    return finish(`${base} ${ltvTxt} ${RULE3}`, [pCac, pPb, pRat, pOk], `${exCac}\n\n${exPb}\n\n${exRat}\n\n**Rule:** ${roundTo(ratio, 2)} is ${yes ? "at least" : "below"} 3, so **${YN(yes)}**.`,
      "mkm-cac3", { tier, S, N, m, L }, [...given, ["_months", L]], ["CAC, payback, then the ratio.", "Healthy means at least the multiple the rule states."]);
  }
  return tooMany();
}

// ---------- roas-budget ----------

const AD_PAIRS = [["search ads", "social ads"], ["video ads", "email promotions"], ["influencer posts", "display ads"], ["podcast ads", "search ads"]];
const MARGINS = [20, 25, 30, 40, 50, 60];

function genRoas(rng, tier) {
  const wantA = rng.next() < 0.5, wantPat = rng.pick(["AA", "AB", "BA", "BB"]);
  for (let i = 0; i < TRY; i++) {
    const [nA, nB] = rng.pick(AD_PAIRS), roasDef = "Return on ad spend (ROAS) = revenue from the ads ÷ money spent on them.";
    if (tier === "medium") {
      const S = 100 * rng.int(5, 100), R = 10 * rng.int(Math.ceil((1.2 * S) / 10), Math.floor((7 * S) / 10));
      const mg = rng.pick(MARGINS), roas = R / S, prof = (R * mg) / 100 - S;
      if (nearHalf(roas, 2, 0.05) || Math.abs(prof) < 100) continue;
      const parts = [
        numPart("roas", "ROAS", "ROAS of the campaign", roas, 2, "Divide the revenue by the money spent on ads."),
        numPart("prof", "Profit after ads", "Gross profit after ad spend (negative if a loss) ($)", prof, 2, "Gross profit = revenue × the margin share, then take away the ad spend."),
      ];
      return finish(`A shop ran **${nA}** for a month, spending **${moneyW(S)}** and bringing in **${moneyW(R)}** of sales revenue. Its gross margin is **${mg}%** of revenue. ${roasDef}`,
        parts, `**ROAS:** ${moneyW(R)} ÷ ${moneyW(S)} = ${f(roundTo(roas, 4))}, about **${roundTo(roas, 2)}**.\n\n**Profit:** ${moneyW(R)} × ${mg}% = ${money(R * mg / 100)}; less ${moneyW(S)} = **${money(prof)}**.`,
        "mkm-roas1", { tier, S, R, mg }, [["_spend", S], ["_rev", R], ["_margin", mg]], ["Revenue over spend for the ratio.", "Margin applies to revenue, not to spend."]);
    }
    if (tier === "hard") {
      const SA = 100 * rng.int(5, 100), SB = 100 * rng.int(5, 100);
      const RA = 10 * rng.int(Math.ceil((1.2 * SA) / 10), Math.floor((7 * SA) / 10)), RB = 10 * rng.int(Math.ceil((1.2 * SB) / 10), Math.floor((7 * SB) / 10));
      const rA = RA / SA, rB = RB / SB;
      if (Math.abs(rA - rB) < 0.15 || nearHalf(rA, 2, 0.05) || nearHalf(rB, 2, 0.05) || (rA > rB) !== wantA) continue;
      const win = rA > rB ? nA : nB;
      const parts = [
        numPart("a", `ROAS ${nA}`, `ROAS of ${nA}`, rA, 2, "Revenue divided by spend for this channel."),
        numPart("b", `ROAS ${nB}`, `ROAS of ${nB}`, rB, 2, "Same method for the other channel."),
        pickPart(rng, "best", "Better channel", "Which channel returns more per dollar of ad spend?", nA, nB, win, "The higher ROAS wins, not the higher revenue."),
      ];
      return finish(`One month, a shop spent **${moneyW(SA)}** on **${nA}** (revenue **${moneyW(RA)}**) and **${moneyW(SB)}** on **${nB}** (revenue **${moneyW(RB)}**). ${roasDef}`,
        parts, `**${cap(nA)}:** ${moneyW(RA)} ÷ ${moneyW(SA)} = **${roundTo(rA, 2)}**.\n\n**${cap(nB)}:** ${moneyW(RB)} ÷ ${moneyW(SB)} = **${roundTo(rB, 2)}**.\n\n**Better:** **${win}**, with the higher ROAS.`,
        "mkm-roas2", { tier, nA, nB, SA, RA, SB, RB }, [["_spendA", SA], ["_revA", RA], ["_spendB", SB], ["_revB", RB]], ["Each channel gets its own ratio.", "Bigger revenue is not the same as better return per dollar."]);
    }
    // expert and expert-plus use exact one-decimal ROAS values so later parts do not depend on rounding
    const SA = 100 * rng.int(20, 100), SB = 100 * rng.int(20, 100), tA = rng.int(12, 60), tB = rng.int(12, 60);
    const RA = (SA * tA) / 10, RB = (SB * tB) / 10, rA = tA / 10, rB = tB / 10;
    if (Math.abs(tA - tB) < 5) continue;
    const aBetter = tA > tB, Sw = aBetter ? SB : SA, rw = aBetter ? rB : rA, rb = aBetter ? rA : rB;
    const bestName = aBetter ? nA : nB, worstName = aBetter ? nB : nA;
    if (tier === "expert") {
      if (aBetter !== wantA) continue;
      const M = 100 * rng.int(2, Math.floor((Sw * 0.5) / 100));
      if (M < 200) continue;
      const newTot = RA + RB + M * (rb - rw), gain = M * (rb - rw);
      if (!Number.isInteger(newTot)) continue;
      const parts = [
        numPart("a", `ROAS ${nA}`, `ROAS of ${nA}`, rA, 2, "Revenue divided by spend for this channel."),
        numPart("b", `ROAS ${nB}`, `ROAS of ${nB}`, rB, 2, "Same method for the other channel."),
        pickPart(rng, "best", "Better channel", "Which channel returns more per dollar of ad spend?", nA, nB, bestName, "The higher ROAS wins."),
        numPart("tot", "Revenue after the move", "Total revenue from both channels after the move ($)", newTot, 0, "The channel that loses budget loses revenue at its own ROAS; the other gains revenue at its own ROAS. Start from today's total.", true),
      ];
      const ex = `**ROAS:** ${nA} ${moneyW(RA)} ÷ ${moneyW(SA)} = **${f(rA)}**; ${nB} ${moneyW(RB)} ÷ ${moneyW(SB)} = **${f(rB)}**.\n\n**Better:** **${bestName}**.\n\n**After the move:** moving ${moneyW(M)} from ${worstName} loses ${moneyW(M)} × ${f(rw)} = ${moneyW(M * rw)} and adds ${moneyW(M)} × ${f(rb)} = ${moneyW(M * rb)} at ${bestName}. Total ${moneyW(RA + RB)} + ${moneyW(M * rb)} − ${moneyW(M * rw)} = **${moneyW(newTot)}**.`;
      return finish(`One month, a shop spent **${moneyW(SA)}** on **${nA}** (revenue **${moneyW(RA)}**) and **${moneyW(SB)}** on **${nB}** (revenue **${moneyW(RB)}**). ${roasDef} Next month it moves **${moneyW(M)}** of ad spend from the weaker channel to the stronger one. For this exercise, each channel keeps its own ROAS on every dollar, so revenue changes in proportion.`,
        parts, ex, "mkm-roas3", { tier, nA, nB, SA, RA, SB, RB, M }, [["_spendA", SA], ["_revA", RA], ["_spendB", SB], ["_revB", RB], ["_move", M]],
        ["ROAS first, then compare.", "Revenue lost at one ROAS, revenue gained at the other."]);
    }
    // expert-plus: break-even ROAS, above/below per channel, a shift with a diminishing-return rule
    const mg = rng.pick([20, 25, 40, 50]), be = 100 / mg;
    if (Math.abs(rA - be) < 0.3 || Math.abs(rB - be) < 0.3) continue;
    const pat = `${rA > be ? "A" : "B"}${rB > be ? "A" : "B"}`; // A = above, B = below
    if (pat !== wantPat) continue;
    const M = 100 * rng.int(3, Math.floor((Sw * 0.5) / 100));
    if (M < 300) continue;
    const K = 100 * rng.int(1, M / 100 - 1), rx = rng.pick([10, 12, 15, 20]) / 10;
    const delta = -M * rw + K * rb + (M - K) * rx;
    const newTot = RA + RB + delta, dProf = (delta * mg) / 100;
    if (!Number.isInteger(delta) || !Number.isInteger(dProf) || Math.abs(dProf) < 50 || rx >= rb) continue;
    const ab = (x) => (x > be ? "Above" : "Below");
    const parts = [
      numPart("be", "Break-even ROAS", "Break-even ROAS: the ROAS at which gross profit just covers the ad spend", be, 2, "Break-even when revenue × margin share = spend, so ROAS = 1 ÷ the margin share."),
      segPart2(rng, "side", "Above or below", "Is each channel's ROAS above or below break-even?", [cap(nA), cap(nB)], ["Above", "Below"], ["Above", "Below"], [ab(rA), ab(rB)], "Work out each ROAS (revenue ÷ spend) and compare it with the break-even ROAS."),
      numPart("tot", "Revenue after the move", "Total revenue from both channels after the move ($)", newTot, 0, "The weaker channel loses revenue at its ROAS. The stronger one earns its ROAS only on the first part of the moved money, and the lower stated rate on the rest.", true),
      numPart("dprof", "Change in gross profit", "Change in gross profit from the move (negative if lower) ($)", dProf, 0, "Total ad spend does not change, so only the change in revenue matters. Take the margin share of that change.", true),
    ];
    const ex = `**Break-even:** 1 ÷ ${mg}% = **${f(be)}**.\n\n**Sides:** ${nA} ROAS ${f(rA)} is ${ab(rA).toLowerCase()} ${f(be)}; ${nB} ROAS ${f(rB)} is ${ab(rB).toLowerCase()}.\n\n**After the move:** ${worstName} loses ${moneyW(M)} × ${f(rw)} = ${moneyW(M * rw)}. ${cap(bestName)} gains ${moneyW(K)} × ${f(rb)} = ${moneyW(K * rb)} on the first ${moneyW(K)} and ${moneyW(M - K)} × ${f(rx)} = ${moneyW((M - K) * rx)} on the rest. Change in revenue ${moneyW(delta)}, so the total is ${moneyW(RA + RB)} + (${moneyW(delta)}) = **${moneyW(newTot)}**.\n\n**Profit change:** ${moneyW(delta)} × ${mg}% = **${moneyW(dProf)}**.`;
    return finish(`One month, a shop spent **${moneyW(SA)}** on **${nA}** (revenue **${moneyW(RA)}**) and **${moneyW(SB)}** on **${nB}** (revenue **${moneyW(RB)}**). ${roasDef} Its gross margin is **${mg}%** of revenue. Next month it moves **${moneyW(M)}** of ad spend from the weaker channel (by ROAS) to the stronger one. The weaker channel loses revenue at its own ROAS. The stronger channel earns its own ROAS on the first **${moneyW(K)}** moved, but only a ROAS of **${f(rx)}** on every dollar beyond that (diminishing returns). Total ad spend stays the same.`,
      parts, ex, "mkm-roas4", { tier, nA, nB, SA, RA, SB, RB, M, K, rxT: Math.round(rx * 10), mg }, [["_spendA", SA], ["_revA", RA], ["_spendB", SB], ["_revB", RB], ["_move", M], ["_first", K], ["_rate", rx], ["_margin", mg]],
      ["Break-even is where margin on revenue equals the spend.", "Split the moved money into the part at full ROAS and the part at the lower rate."]);
  }
  return tooMany();
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- promo-profit ----------

const GOODS2 = ["trail shoes", "coffee grinders", "backpacks", "desk lamps", "yoga mats", "water bottles", "board games", "headphones"];

function genPromo(rng, tier) {
  const wantYes = rng.next() < 0.5, wantA = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const item = rng.pick(GOODS2);
    const Pc = 100 * rng.int(8, 120) + rng.pick([0, 50]);
    const Cc = 5 * Math.round((Pc * rng.pick([0.35, 0.4, 0.45, 0.5, 0.55, 0.6])) / 5);
    const d = rng.pick([5, 10, 15, 20, 25, 30]);
    if ((Pc * (100 - d)) % 100 !== 0) continue;
    const Sc = (Pc * (100 - d)) / 100, m0 = Pc - Cc, m1 = Sc - Cc;
    if (m1 < 100 || m1 < 0.25 * m0) continue;
    const N0 = 100 * rng.int(2, 40);
    const base = `A shop sells **${item}** for **${money(cents(Pc))}** each; each one costs the shop **${money(cents(Cc))}**. It sells **${commas(N0)}** a month at that price.`;
    const given = [["_price", cents(Pc)], ["_cost", cents(Cc)], ["_off", d], ["_units", N0]];
    const pSale = numPart("sale", "Sale price", "Sale price with the discount ($)", cents(Sc), 2, "Take the discount percentage off the price: multiply the price by the share left after the discount.");
    const pMar = numPart("margin", "Margin per unit", "Profit per unit at the sale price ($)", cents(m1), 2, "Sale price minus what each unit costs the shop.");
    const exSale = `**Sale price:** ${money(cents(Pc))} × (100 − ${d})% = **${money(cents(Sc))}**.`;
    const exMar = `**Margin per unit:** ${money(cents(Sc))} − ${money(cents(Cc))} = **${money(cents(m1))}** (it was ${money(cents(m0))}).`;
    if (tier === "medium") return finish(`${base} It is considering **${d}% off**.`, [pSale, pMar], `${exSale}\n\n${exMar}`, "mkm-pro1", { tier, Pc, Cc, d }, given,
      ["The new price first.", "Profit per unit is price less cost."]);
    if (tier === "hard" || tier === "expert") {
      const need = cdiv(N0 * m0, m1);
      if (need > 3 * N0 || need <= N0) continue;
      const pNeed = numPart("need", "Units needed", "Units a month needed at the sale price to earn at least today's profit (round up)", need, 0, "Today's profit is units times today's margin per unit. Divide it by the new margin per unit and round up to a whole unit.", true);
      const exNeed = `**Today's profit:** ${commas(N0)} × ${money(cents(m0))} = ${money(cents(N0 * m0))}. **Units needed:** ${money(cents(N0 * m0))} ÷ ${money(cents(m1))} = ${f(roundTo((N0 * m0) / m1, 3))}, round up to **${commas(need)}**.`;
      if (tier === "hard") return finish(`${base} It is considering **${d}% off**.`, [pSale, pMar, pNeed], `${exSale}\n\n${exMar}\n\n${exNeed}`, "mkm-pro2", { tier, Pc, Cc, d, N0 }, given,
        ["Price, then margin, then the profit to match.", "Whole units: round up so the profit is at least matched."]);
      const gap = Math.max(5, Math.round(need * rng.pick([0.04, 0.06, 0.1, 0.15])));
      const F = wantYes ? need + gap : need - gap;
      if (F < 1) continue;
      const yes = F * m1 >= N0 * m0;
      const pOk = yesNo("ok", "Keeps profit?", `The shop forecasts **${commas(F)} units** a month at the sale price. Would profit be at least today's?`, yes, "Compare the forecast with the units needed.");
      return finish(`${base} It is considering **${d}% off**.`, [pSale, pMar, pNeed, pOk], `${exSale}\n\n${exMar}\n\n${exNeed}\n\n**Forecast:** ${commas(F)} is ${yes ? "at least" : "fewer than"} ${commas(need)}, so **${YN(yes)}**.`,
        "mkm-pro3", { tier, Pc, Cc, d, N0, F }, [...given, ["_forecast", F]], ["Three steps to the units needed, then one comparison.", "At or above the units needed keeps the profit."]);
    }
    // expert-plus: discount versus a free gift, compared on total profit
    const gc = 5 * rng.int(10, 400);
    if (gc > 0.6 * m0 || gc < 0.1 * m0) continue;
    const pA = 5 * rng.int(4, 18), pB = 5 * rng.int(1, 10);
    const UA = (N0 * (100 + pA)) / 100, UB = (N0 * (100 + pB)) / 100;
    const mB = m0 - gc, profA = UA * m1, profB = UB * mB;
    if (mB < 100 || Math.abs(profA - profB) < Math.max(10000, 0.03 * Math.max(profA, profB)) || (profA > profB) !== wantA) continue;
    const bestProf = Math.max(profA, profB), gain = bestProf - N0 * m0;
    if (Math.abs(gain) < 5000) continue;
    const win = profA > profB ? "Discount" : "Free gift";
    const parts = [
      numPart("ma", "Margin: discount", "Profit per unit under the discount ($)", cents(m1), 2, "Discounted price minus cost."),
      numPart("mb", "Margin: gift", "Profit per unit under the free gift, which keeps the full price ($)", cents(mB), 2, "Full price minus cost minus what the gift costs per unit sold."),
      pickPart(rng, "best", "Better option", "Which option earns more total profit at its forecast sales?", "Discount", "Free gift", win, "Total profit = forecast units × profit per unit, for each option."),
      numPart("gain", "Versus today", "Total profit of the better option minus today's profit (negative if lower) ($)", cents(gain), 2, "Today's profit is today's units times today's margin per unit. Compare the better option's total with it."),
    ];
    const ex = `**Discount:** ${money(cents(Pc))} × (100 − ${d})% = ${money(cents(Sc))}; less ${money(cents(Cc))} = **${money(cents(m1))}** a unit. Forecast ${commas(UA)} units, total ${money(cents(profA))}.\n\n**Free gift:** ${money(cents(Pc))} − ${money(cents(Cc))} − ${money(cents(gc))} = **${money(cents(mB))}** a unit. Forecast ${commas(UB)} units, total ${money(cents(profB))}.\n\n**Better:** **${win}**.\n\n**Today:** ${commas(N0)} × ${money(cents(m0))} = ${money(cents(N0 * m0))}, so the better option is ${money(cents(bestProf))} − ${money(cents(N0 * m0))} = **${money(cents(gain))}**.`;
    return finish(`${base} It is comparing two promotions for next month. **Discount:** **${d}% off**, forecast sales **${pA}% higher** (${commas(UA)} units). **Free gift:** the price stays the same, each unit sold comes with a gift costing the shop **${money(cents(gc))}**, forecast sales **${pB}% higher** (${commas(UB)} units).`,
      parts, ex, "mkm-pro4", { tier, Pc, Cc, d, N0, gc, UA, UB }, [...given, ["_gift", cents(gc)], ["_unitsA", UA], ["_unitsB", UB]],
      ["Each option has its own margin per unit and its own units.", "The gain is measured against what the shop earns today."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "funnel") return genFunnel(rng, difficulty);
  if (subtopic === "cac-payback") return genCac(rng, difficulty);
  if (subtopic === "roas-budget") return genRoas(rng, difficulty);
  if (subtopic === "promo-profit") return genPromo(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Funnel stages are checked by whole-person floors and by binary search for the smallest stage size that
// reaches the target; CAC and payback by cents per customer and a month-by-month running total; ROAS by
// per-dollar revenue; promotions by comparing total profit directly and scanning units upward.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

// smallest x whose stage yields at least `target` people, with `rate` per `per` (floor of x*rate/per)
function smallestStage(target, rate, per) {
  let lo = 0, hi = Math.max(1, cdiv(target * per, rate) + 5);
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (Math.floor((mid * rate) / per) >= target) hi = mid; else lo = mid + 1; }
  return lo;
}
function paybackByMonths(cac, m) { let mo = 0; while ((mo + 1) * m < cac - 1e-9) mo += 1; return { whole: mo + 1, exact: mo + (cac - mo * m) / m }; } // full months, then the part month
const smallestUnits = (needProfit, perUnit) => { let u = Math.max(0, Math.floor(needProfit / perUnit) - 3); while (u * perUnit < needProfit) u++; return u; };

const ALT = {
  "mkm-fun1": (p) => { const c = Math.floor((p.I * p.ctrT) / 1000), t = Math.floor((c * p.s) / 100); return { clicks: c, trials: t }; },
  "mkm-fun2": (p) => { const c = Math.floor((p.I * p.ctrT) / 1000), t = Math.floor((c * p.s) / 100), b = Math.floor((t * p.b) / 100); return { clicks: c, trials: t, buyers: b }; },
  "mkm-fun3": (p) => { const c = Math.floor((p.I * p.ctrT) / 1000), t = Math.floor((c * p.s) / 100), b = Math.floor((t * p.b) / 100); return { clicks: c, trials: t, buyers: b, cost: p.B / b }; },
  "mkm-fun4": (p) => {
    const tr = smallestStage(p.G, p.b, 100), cl = smallestStage(tr, p.s, 100), im = smallestStage(cl, p.ctrT, 1000);
    return { trials: tr, clicks: cl, views: im, fits: YN((im / 1000) * p.m <= p.Bd + 1e-9) };
  },
  "mkm-cac1": (p) => { const c = (p.S * 100) / p.N / 100; return { cac: c, payback: paybackByMonths(c, p.m).exact }; },
  "mkm-cac2": (p) => { const c = (p.S * 100) / p.N / 100; let ltv = 0; for (let k = 0; k < p.L; k++) ltv += p.m; return { cac: c, payback: paybackByMonths(c, p.m).exact, ratio: ltv / c }; },
  "mkm-cac3": (p) => { const c = (p.S * 100) / p.N / 100; let ltv = 0; for (let k = 0; k < p.L; k++) ltv += p.m; return { cac: c, payback: paybackByMonths(c, p.m).exact, ratio: ltv / c, ok: YN(ltv >= 3 * c - 1e-9) }; },
  "mkm-cac4": (p) => {
    const SA = (p.NA * p.cA) / 100, SB = (p.NB * p.cB) / 100, bc = (SA + SB) / (p.NA + p.NB), ltv = p.m / (p.ch / 100);
    return { blend: bc, ltv, ratio: ltv / bc, verdict: `${p.cA / 100 < p.cB / 100 ? "Channel A" : "Channel B"} | ${ltv >= 3 * bc - 1e-9 ? "Yes" : "No"}` };
  },
  "mkm-roas1": (p) => ({ roas: p.R / p.S, prof: p.R * (p.mg / 100) - p.S }),
  "mkm-roas2": (p) => ({ a: p.RA / p.SA, b: p.RB / p.SB, best: p.RA / p.SA > p.RB / p.SB ? p.nA : p.nB }),
  "mkm-roas3": (p) => {
    const ra = p.RA / p.SA, rb = p.RB / p.SB, aWins = ra > rb, hi = aWins ? ra : rb, lo = aWins ? rb : ra;
    return { a: ra, b: rb, best: aWins ? p.nA : p.nB, tot: p.RA + p.RB + p.M * hi - p.M * lo };
  },
  "mkm-roas4": (p) => {
    const ra = p.RA / p.SA, rb = p.RB / p.SB, aWins = ra > rb, hi = aWins ? ra : rb, lo = aWins ? rb : ra, rx = p.rxT / 10;
    const be = 1 / (p.mg / 100), gained = p.K * hi + (p.M - p.K) * rx, lost = p.M * lo, tot = p.RA + p.RB + gained - lost;
    return { be, side: `${ra > be ? "Above" : "Below"} | ${rb > be ? "Above" : "Below"}`, tot, dprof: (tot - p.RA - p.RB) * (p.mg / 100) };
  },
  "mkm-pro1": (p) => { const sale = p.Pc - (p.Pc * p.d) / 100; return { sale: sale / 100, margin: (sale - p.Cc) / 100 }; },
  "mkm-pro2": (p) => {
    const sale = p.Pc - (p.Pc * p.d) / 100, mar = sale - p.Cc;
    return { sale: sale / 100, margin: mar / 100, need: smallestUnits(p.N0 * (p.Pc - p.Cc), mar) };
  },
  "mkm-pro3": (p) => {
    const sale = p.Pc - (p.Pc * p.d) / 100, mar = sale - p.Cc, need = smallestUnits(p.N0 * (p.Pc - p.Cc), mar);
    return { sale: sale / 100, margin: mar / 100, need, ok: YN(p.F * mar >= p.N0 * (p.Pc - p.Cc)) };
  },
  "mkm-pro4": (p) => {
    const sale = p.Pc - (p.Pc * p.d) / 100, mA = sale - p.Cc, mB = p.Pc - p.Cc - p.gc, tA = p.UA * mA, tB = p.UB * mB;
    return { ma: mA / 100, mb: mB / 100, best: tA > tB ? "Discount" : "Free gift", gain: (Math.max(tA, tB) - p.N0 * (p.Pc - p.Cc)) / 100 };
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
    if (tv === undefined || tv === null || (typeof tv === "number" && !Number.isFinite(tv))) return false;
    if (part.answerType === "number") {
      const dp = dpOf(part);
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
