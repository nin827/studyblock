// Insurance Underwriter role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route (exact integer cents
// with BigInt for premiums, accumulating loss by loss, rebuilding scores from band labels). Inputs are drawn
// so every chained answer is exact (or the stated rounding rule makes it stable), no answer sits on a
// rounding half-step, and verdict parts are decided first and then fitted, clear of their thresholds.
// All figures are made up, money is a generic $, and every rating table, loading, discount, excess, limit,
// cap and score rule is an exercise rule stated in each prompt: no real insurer, product or law.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   premium       rating table -> rated premium; hard: loading, discount, minimum premium;
//                 expert: change on last year and a cap check; expert-plus: two risks, household discount,
//                 instalment surcharge, monthly payment against a budget
//   loss-ratio    expected claims cost and loss ratio; hard: combined ratio; expert: underwriting result and
//                 profit?; expert-plus: break-even premium (round up), rate rise, within the board's cap?
//   excess-limit  one loss: excess and limit; hard: three losses, count at limit; expert: co-insurance and the
//                 insurer's share; expert-plus: four losses, per-loss limit and annual aggregate limit
//   risk-scorecard points table -> score and decision; hard: area exposure; expert: write / refer / decline
//                 against an exposure cap; expert-plus: two proposals, order-dependent cap, who is written

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
const TRY = 40000;
const tooMany = () => { throw new Error("role-insurance-underwriter: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const neg = n < 0; const [a, b] = Math.abs(Number(n)).toFixed(2).split("."); return `${neg ? "−" : ""}$${commas(a)}.${b}`; };
const dollars = (n) => { const r = Math.round(n); return `${r < 0 ? "−" : ""}$${commas(Math.abs(r))}`; };
const YN = (b) => (b ? "Yes" : "No");
const sum = (a) => a.reduce((s, x) => s + x, 0);
const orList = (a) => a.join(", ").replace(/, ([^,]*)$/, " and $1");

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const yesNo = (id, label, ask, ok, hint) => choicePart(id, label, ask, YN(ok), ["Yes", "No"], hint);
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
const DECISIONS = ["Accept", "Refer", "Decline"];

// ---------- premium ----------

const AGE_T = { label: "Driver age", bands: ["under 25", "25 to 59", "60 and over"], facs: [[1.5, 1.6, 1.75, 2], [0.9, 1], [1.1, 1.2, 1.25]] };
const LOC_T = { label: "Where the car is kept", bands: ["city centre", "suburb", "rural area"], facs: [[1.25, 1.4, 1.5, 1.6], [1, 1.1], [0.8, 0.9]] };
const HIS_T = { label: "Claims in the last 3 years", bands: ["none", "1 claim", "2 or more claims"], facs: [[0.8, 0.85, 0.9], [1, 1.1], [1.4, 1.5, 1.6, 1.75]] };
const cents100 = (x) => Math.round(x * 100);

function drawRating(rng) {
  const tabs = [AGE_T, LOC_T, HIS_T].map((t) => ({ ...t, vals: t.facs.map((a) => rng.pick(a)) }));
  const picks = tabs.map(() => rng.int(0, 2));
  const age = [rng.int(18, 24), rng.int(25, 59), rng.int(60, 80)][picks[0]];
  const claims = [0, 1, rng.int(2, 4)][picks[2]];
  return { tabs, picks, age, claims, facs: tabs.map((t, i) => t.vals[picks[i]]) };
}
const ratingTable = (tabs) => {
  const rows = [];
  tabs.forEach((t) => t.bands.forEach((b, i) => rows.push(`| ${t.label} | ${b} | ×${f(t.vals[i])} |`)));
  return `| Rating factor | Band | Factor |\n|---|---|---|\n${rows.join("\n")}`;
};
const applicantText = (r, who = "The applicant") =>
  `${who} is aged **${r.age}**, keeps the car in a **${r.tabs[1].bands[r.picks[1]]}** and has made **${r.claims === 0 ? "no" : r.claims} claim${r.claims === 1 ? "" : "s"}** in the last 3 years.`;
const ratedOf = (base, r) => base * r.facs[0] * r.facs[1] * r.facs[2];

function genPremium(rng, tier) {
  const wantMin = rng.next() < 0.45, wantCap = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const base = rng.int(20, 90) * 10, r = drawRating(rng), rated = ratedOf(base, r);
    if (!isEx(rated, 2)) continue;
    const tab = `**Rating table for this exercise** (made-up). The base premium is **${dollars(base)}** a year; multiply it by the factor for each of the three bands that apply.\n\n${ratingTable(r.tabs)}`;
    const exRated = `**Rated premium:** ${dollars(base)} × ${f(r.facs[0])} × ${f(r.facs[1])} × ${f(r.facs[2])} = **${money(rated)}**.`;
    const pRated = numPart("rated", "Rated premium", "Premium after the three rating factors ($)", rated, 2, "Find the band for age, location and claims, then multiply the base premium by the three factors.");
    if (tier === "medium") {
      const d = rng.pick([5, 10, 15, 20]), disc = (rated * (100 - d)) / 100;
      if (!isEx(disc, 2)) continue;
      return finish(`${tab}\n\n${applicantText(r)} A **${d}%** multi-year discount is then taken off the rated premium. Round money to the cent.`,
        [pRated, numPart("final", "After discount", "Premium after the discount ($)", disc, 2, "Take the discount percentage off the rated premium.")],
        `${exRated}\n\n**After discount:** ${money(rated)} × (100 − ${d})% = **${money(disc)}**.`, "uw-pr1", { tier, base, facs: r.facs.map(cents100), d }, [["_base", base], ["_disc", d]],
        ["Pick one band from each group first; the factors multiply.", "The discount is a percentage of the rated premium."]);
    }
    const l = rng.pick([4, 5, 8, 10, 12]), d = rng.pick([5, 10, 15, 20]);
    const loaded = (rated * (100 + l)) / 100, fin0 = (loaded * (100 - d)) / 100;
    if (!isEx(loaded, 2) || !isEx(fin0, 2)) continue;
    const bindsMin = wantMin;
    const M = bindsMin ? Math.ceil((fin0 * (1.08 + rng.next() * 0.3)) / 5) * 5 : Math.round((fin0 * (0.55 + rng.next() * 0.33)) / 5) * 5;
    if (bindsMin ? M < fin0 * 1.06 : M > fin0 * 0.92 || M < 30) continue;
    const fin = Math.max(M, fin0);
    const rules = `An administration loading of **${l}%** is added to the rated premium, then a **${d}%** discount is taken off that loaded figure. No policy is sold for less than the minimum premium of **${dollars(M)}**. Round money to the cent.`;
    const exLoad = `**Loaded, then discounted:** ${money(rated)} × ${f(1 + l / 100)} × (100 − ${d})% = **${money(fin0)}**.`;
    const exFin = `**Minimum premium:** ${money(fin0)} is ${fin0 >= M ? "not below" : "below"} ${dollars(M)}, so the premium is **${money(fin)}**.`;
    const given = [["_base", base], ["_load", l], ["_disc", d], ["_min", M]];
    const pFin0 = numPart("loaded", "Loaded and discounted", "Premium after the loading and then the discount ($)", fin0, 2, "Add the loading percentage first, then take the discount off the larger figure.");
    const pFin = numPart("final", "Premium charged", "Premium charged once the minimum premium is applied ($)", fin, 2, "Compare the figure from the last part with the minimum; charge whichever is higher.");
    if (tier === "hard") {
      return finish(`${tab}\n\n${applicantText(r)} ${rules}`, [pRated, pFin0, pFin], `${exRated}\n\n${exLoad}\n\n${exFin}`,
        "uw-pr2", { tier, base, facs: r.facs.map(cents100), l, d, M }, given,
        ["Rated premium first, then loading, then discount, in that order.", "The minimum premium is a floor on the premium charged."]);
    }
    if (tier === "expert") {
      const up = rng.next() < 0.7, LY = Math.max(50, Math.round(fin * (up ? 1 / (1 + rng.int(3, 25) / 100) : 1 / (1 - rng.int(3, 15) / 100))));
      const chg = ((fin - LY) / LY) * 100, c = rng.pick([6, 8, 10, 12, 15, 20]);
      if (nearHalf(chg, 1, 0.08) || Math.abs(chg - c) < 1.5 || (chg <= c) !== wantCap) continue;
      const parts = [pRated, pFin,
        numPart("change", "Change on last year", "Change from last year's premium (%, negative if it fell)", chg, 1, "The new premium minus last year's, divided by last year's, as a percentage."),
        yesNo("within", "Within the cap?", `A renewal rise of more than **${c}%** has to go to a senior underwriter. Is this renewal within the ${c}% cap (a fall counts as within)?`, chg <= c, "Compare the percentage change with the cap; only a rise above it fails.")];
      return finish(`${tab}\n\n${applicantText(r, "The policyholder")} ${rules} Last year the policyholder paid **${dollars(LY)}**.`, parts,
        `${exRated}\n\n${exLoad}\n\n${exFin}\n\n**Change:** (${money(fin)} − ${dollars(LY)}) ÷ ${dollars(LY)} × 100 = **${f(roundTo(chg, 1))}%**.\n\n**Cap:** ${f(roundTo(chg, 1))}% is ${chg <= c ? "within" : "above"} ${c}%: **${YN(chg <= c)}**.`,
        "uw-pr3", { tier, base, facs: r.facs.map(cents100), l, d, M, LY, c }, [...given, ["_last", LY], ["_cap", c]],
        ["Rated, loaded, discounted and floored: the same chain as a plain quote.", "The change is measured against last year's premium, not the new one."]);
    }
    // expert-plus: two risks on one household policy with an instalment plan
    const r2 = drawRating(rng), rated2 = ratedOf(base, r2), loaded2 = (rated2 * (100 + l)) / 100;
    if (!isEx(rated2, 2) || !isEx(loaded2, 2) || (r2.facs.join() === r.facs.join())) continue;
    const loaded1 = loaded, s = rng.pick([4, 5, 6, 8]), hd = rng.pick([5, 8, 10, 12]);
    const annual = ((loaded1 + loaded2) * (100 - hd)) / 100, monthly = (annual * (100 + s)) / 100 / 12;
    if (nearHalf(monthly, 2, 0.12)) continue;
    const within = wantCap, Bm = Math.round(within ? monthly * (1.05 + rng.next() * 0.25) : monthly * (0.7 + rng.next() * 0.25));
    if (Bm < 20 || Math.abs(Bm - monthly) < 0.04 * monthly || (monthly <= Bm) !== within) continue;
    const parts = [
      numPart("cara", "First car", "Premium for the first car: rated, then with the loading ($)", loaded1, 2, "Multiply the base premium by the first car's three factors, then add the loading."),
      numPart("carb", "Second car", "Premium for the second car: rated, then with the loading ($)", loaded2, 2, "The same method with the second car's bands."),
      numPart("monthly", "Monthly payment", "Monthly payment for both cars together ($)", monthly, 2, "Add the two premiums, take off the household discount, add the instalment surcharge, then divide by 12."),
      yesNo("budget", "Within budget?", `The household can pay at most **${dollars(Bm)}** a month. Is the monthly payment within that (equal counts as within)?`, within, "Compare the monthly payment with the monthly budget."),
    ];
    return finish(`${tab}\n\n**Car 1:** ${applicantText(r, "the driver")} **Car 2:** ${applicantText(r2, "the driver")} Each car's premium is its rated premium plus an administration loading of **${l}%**. The two premiums are added and a **${hd}%** household discount is taken off the total. Paying monthly adds a **${s}%** instalment surcharge to that annual figure, and the result is split into 12 equal payments. Round the money parts to the cent.`,
      parts, `**Car 1:** ${dollars(base)} × ${f(r.facs[0])} × ${f(r.facs[1])} × ${f(r.facs[2])} × ${f(1 + l / 100)} = **${money(loaded1)}**.\n\n**Car 2:** ${dollars(base)} × ${f(r2.facs[0])} × ${f(r2.facs[1])} × ${f(r2.facs[2])} × ${f(1 + l / 100)} = **${money(loaded2)}**.\n\n**Monthly:** (${money(loaded1)} + ${money(loaded2)}) × (100 − ${hd})% × ${f(1 + s / 100)} ÷ 12 = **${money(monthly)}**.\n\n**Budget:** ${money(monthly)} is ${within ? "within" : "over"} ${dollars(Bm)}: **${YN(within)}**.`,
      "uw-pr4", { tier, base, facs1: r.facs.map(cents100), facs2: r2.facs.map(cents100), l, hd, s, Bm }, [["_base", base], ["_load", l], ["_hdisc", hd], ["_surch", s], ["_budget", Bm]],
      ["Price each car on its own bands before combining anything.", "Discount first, then the surcharge, then split into 12."]);
  }
  return tooMany();
}

// ---------- loss-ratio ----------

function genLoss(rng, tier) {
  const wantProfit = rng.next() < 0.5, wantCap = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const e = rng.pick([22, 25, 28, 30, 32, 35, 38, 40]);
    if (tier === "expert-plus") {
      const p = rng.pick([2, 2.5, 3, 4, 5, 6, 8, 10]), C = rng.int(5, 60) * 100, T = rng.pick([90, 92, 95]), perPol = (p * C) / 100;
      if (!isEx(perPol, 2) || perPol < 20) continue;
      const need = (perPol * 100) / (T - e), fr = need - Math.floor(need);
      if (fr < 0.12 || fr > 0.88) continue;
      const Nd = Math.ceil(need), P0 = Math.max(30, Math.round(Nd * (0.72 + rng.next() * 0.4)));
      const inc = ((Nd - P0) / P0) * 100, c = rng.pick([5, 8, 10, 12, 15, 20, 25]);
      if (nearHalf(inc, 1, 0.08) || Math.abs(inc - c) < 1.5 || (inc <= c) !== wantCap) continue;
      const parts = [
        numPart("claim", "Expected claim per policy", "Expected claims cost per policy per year ($)", perPol, 2, "The chance of a claim as a share of the average claim."),
        numPart("needed", "Break-even premium", "Premium per policy that just meets the target combined ratio ($, round up to the next whole dollar)", Nd, 0, "The target combined ratio less the expense ratio is the loss ratio you can afford; divide the expected claim by it and round up.", true),
        numPart("rise", "Rate rise needed", "Rise needed on the current premium, using the rounded-up premium (%, negative if it could fall)", inc, 1, "The needed premium minus the current one, divided by the current one, as a percentage."),
        yesNo("within", "Within the cap?", `The board allows a rate rise of at most **${c}%** without approval. Is the rise within that (a fall counts as within)?`, inc <= c, "Compare the percentage rise with the board's limit."),
      ];
      return finish(`A motor book has a **${f(p)}%** chance of a claim per policy per year, the average claim is **${dollars(C)}**, and the current premium is **${dollars(P0)}**. Expenses are **${e}%** of premiums (made-up figures). The target **combined ratio** is **${T}%**, where combined ratio = loss ratio + expense ratio, so the loss ratio must be no more than ${T} − ${e} = **${T - e}%** of the premium. Use the premium rounded up to a whole dollar for the rest.`,
        parts, `**Expected claim:** ${f(p)}% × ${dollars(C)} = **${money(perPol)}**.\n\n**Break-even premium:** ${money(perPol)} ÷ ${T - e}% = ${f(roundTo(need, 2))}, up to **${dollars(Nd)}**.\n\n**Rise:** (${dollars(Nd)} − ${dollars(P0)}) ÷ ${dollars(P0)} × 100 = **${f(roundTo(inc, 1))}%**.\n\n**Cap:** ${f(roundTo(inc, 1))}% is ${inc <= c ? "within" : "above"} ${c}%: **${YN(inc <= c)}**.`,
        "uw-lr4", { tier, p, C, e, T, P0, c }, [["_prob", p], ["_claim", C], ["_expense", e], ["_target", T], ["_premium", P0], ["_cap", c]],
        ["Work per policy: the expected claim is the chance times the average claim.", "The affordable loss ratio is the target minus the expense ratio; round the premium up before the rise."]);
    }
    const N = rng.int(8, 50) * 50, p = rng.pick([2, 2.5, 3, 4, 5, 6, 8, 10, 12]), cnt = (N * p) / 100;
    if (!isEx(cnt, 0)) continue;
    const C = rng.int(5, 60) * 100, P = rng.int(30, 200) * 5, prem = N * P, claims = cnt * C, lr = (claims / prem) * 100;
    if (lr < 35 || lr > 125 || nearHalf(lr, 1, 0.08)) continue;
    const comb = lr + e;
    const base = `A portfolio of **${commas(N)} policies**: each has a **${f(p)}%** chance of one claim in a year, so the expected number of claims is ${f(p)}% of ${commas(N)}. The average claim is **${dollars(C)}** and the average premium is **${dollars(P)}** (made-up figures). The **loss ratio** is expected claims cost ÷ premiums × 100.`;
    const given = [["_policies", N], ["_prob", p], ["_claim", C], ["_premium", P]];
    const exC = `**Claims cost:** ${f(p)}% × ${commas(N)} = ${cnt} claims, × ${dollars(C)} = **${dollars(claims)}**.`;
    const exL = `**Loss ratio:** ${dollars(claims)} ÷ (${commas(N)} × ${dollars(P)}) × 100 = **${f(roundTo(lr, 1))}%**.`;
    const pC = numPart("cost", "Expected claims cost", "Expected claims cost for the year ($, whole dollars)", claims, 0, "The expected number of claims times the average claim.");
    const pL = numPart("lossratio", "Loss ratio", "Loss ratio (%)", lr, 1, "Claims cost divided by the total premiums (policies times the average premium), as a percentage.");
    if (tier === "medium") return finish(base, [pC, pL], `${exC}\n\n${exL}`, "uw-lr1", { tier, N, p, C, P }, given,
      ["Expected claims first, then their cost.", "Total premiums = policies × average premium."]);
    const exCo = `**Combined ratio:** ${f(roundTo(lr, 1))}% + ${e}% = **${f(roundTo(comb, 1))}%**.`;
    const pCo = numPart("combined", "Combined ratio", "Combined ratio (%)", comb, 1, "Loss ratio plus the expense ratio.");
    const ruleE = ` Expenses are **${e}%** of premiums, and the **combined ratio** is the loss ratio plus the expense ratio.`;
    if (tier === "hard") return finish(base + ruleE, [pC, pL, pCo], `${exC}\n\n${exL}\n\n${exCo}`, "uw-lr2", { tier, N, p, C, P, e }, [...given, ["_expense", e]],
      ["Claims cost, then loss ratio, then add the expense ratio.", "Both ratios are percentages of premiums."]);
    // expert
    const expenses = (prem * e) / 100, result = prem - claims - expenses;
    if (!isEx(expenses, 0) || Math.abs(comb - 100) < 4 || (result > 0) !== wantProfit) continue;
    const parts = [pL, pCo,
      numPart("result", "Underwriting result", "Underwriting result: premiums − claims − expenses ($, whole dollars, negative if a loss)", result, 0, "Premiums less the expected claims cost less the expenses (a percentage of premiums)."),
      yesNo("profit", "Underwriting profit?", "Is the portfolio expected to make an underwriting profit (a result above zero)?", result > 0, "A combined ratio under 100% leaves a profit; check it against the result.")];
    return finish(base + ruleE, parts, `${exC}\n\n${exL}\n\n${exCo}\n\n**Result:** ${dollars(prem)} − ${dollars(claims)} − ${dollars(expenses)} = **${dollars(result)}**: **${YN(result > 0)}**.`,
      "uw-lr3", { tier, N, p, C, P, e }, [...given, ["_expense", e]],
      ["The two ratios first, as in a plain loss review.", "The result is in dollars: premiums less claims less expenses."]);
  }
  return tooMany();
}

// ---------- excess-limit ----------

// one loss: the excess comes off first, the insurer pays c% of what is left, and never more than the limit
const payOne = (loss, E, c, L) => Math.min(L, (Math.max(0, loss - E) * c) / 100);
const LOSS_KINDS = ["under", "mid", "mid", "cap"];

function drawLoss(rng, E, L, c) {
  const kind = rng.pick(LOSS_KINDS);
  let x;
  if (kind === "under") x = E - rng.int(1, Math.max(1, Math.floor(E / 100))) * 50;
  else if (kind === "mid") x = E + Math.round(((L * (0.15 + rng.next() * 0.55)) * 100) / (c * 50)) * 50;
  else x = E + Math.round(((L * (1.15 + rng.next() * 0.9)) * 100) / (c * 50)) * 50;
  return Math.max(100, x);
}
const lossOk = (x, E, L, c) => {
  const share = (Math.max(0, x - E) * c) / 100;
  if (!isEx(share, 0)) return false;
  if (x <= E) return E - x >= 50;
  return Math.abs(share - L) >= Math.max(200, 0.05 * L) && x - E >= 100;
};

function genExcess(rng, tier) {
  const wantAgg = rng.next() < 0.5, wantThr = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const E = rng.pick([250, 500, 750, 1000, 1500]), L = rng.int(4, 24) * 1000;
    if (tier === "medium") {
      const x = drawLoss(rng, E, L, 100);
      if (!lossOk(x, E, L, 100)) continue;
      const ins = payOne(x, E, 100, L), pol = x - ins;
      return finish(`A policy has an **excess of ${dollars(E)}** and a **limit of ${dollars(L)}** per claim (made-up terms). The policyholder bears the first ${dollars(E)} of a loss, the insurer pays the rest up to the limit, and the policyholder bears anything above the limit. A loss of **${dollars(x)}** occurs. Give whole dollars.`,
        [numPart("insurer", "Insurer pays", "Amount the insurer pays ($, whole dollars)", ins, 0, "Take the excess off the loss (not below zero), then cap it at the limit."),
          numPart("holder", "Policyholder pays", "Amount the policyholder pays in total ($, whole dollars)", pol, 0, "The loss less what the insurer pays: the excess plus anything over the limit.")],
        `**Insurer:** ${dollars(x)} − ${dollars(E)} = ${dollars(Math.max(0, x - E))}, ${x - E > L ? `capped at the limit **${dollars(ins)}**` : x <= E ? "so nothing is payable: **$0**" : `within the limit: **${dollars(ins)}**`}.\n\n**Policyholder:** ${dollars(x)} − ${dollars(ins)} = **${dollars(pol)}**.`,
        "uw-ex1", { tier, x, E, L }, [["_loss", x], ["_excess", E], ["_limit", L]],
        ["Subtract the excess first; a loss smaller than the excess pays nothing.", "The insurer's payment cannot exceed the limit."]);
    }
    const n = tier === "expert-plus" ? 4 : 3;
    const c = tier === "hard" ? 100 : rng.pick([70, 75, 80, 85, 90]);
    const xs = Array.from({ length: n }, () => drawLoss(rng, E, L, c));
    if (new Set(xs).size < n || !xs.every((x) => lossOk(x, E, L, c))) continue;
    const paid = xs.map((x) => payOne(x, E, c, L)), preAgg = sum(paid), totalLoss = sum(xs);
    const capped = xs.filter((x) => (Math.max(0, x - E) * c) / 100 > L).length;
    const list = orList(xs.map((x) => `**${dollars(x)}**`));
    const termsBase = `**excess of ${dollars(E)}** and a **limit of ${dollars(L)}**`;
    if (tier === "hard") {
      if (capped < 1 || xs.filter((x) => x <= E).length > 1) continue;
      const pol = totalLoss - preAgg;
      return finish(`A policy has an ${termsBase} per loss (made-up terms), and each loss is a separate claim. The policyholder bears the first ${dollars(E)} of each loss, the insurer pays the rest up to the limit, and the policyholder bears anything above the limit. This year's losses were ${list}. Give whole dollars and a whole count.`,
        [numPart("insurer", "Insurer pays", "Total the insurer pays over the year ($, whole dollars)", preAgg, 0, "Work loss by loss: take off the excess, cap at the limit, then add up."),
          numPart("holder", "Policyholder pays", "Total the policyholder pays over the year ($, whole dollars)", pol, 0, "All the losses added, less what the insurer pays."),
          numPart("atlimit", "Losses at the limit", "Number of losses on which the insurer paid the full limit", capped, 0, "Count the losses where the amount after the excess was more than the limit.")],
        `${xs.map((x, q) => `**Loss ${q + 1}:** ${dollars(x)} → insurer **${dollars(paid[q])}**`).join("\n\n")}\n\n**Insurer total:** **${dollars(preAgg)}**. **Policyholder:** ${dollars(totalLoss)} − ${dollars(preAgg)} = **${dollars(pol)}**. **At the limit:** **${capped}**.`,
        "uw-ex2", { tier, xs, E, L }, [["_excess", E], ["_limit", L], ...xs.map((x, q) => [`_loss${q + 1}`, x])],
        ["The excess applies to every loss separately.", "A loss is 'at the limit' when what is left after the excess is more than the limit."]);
    }
    if (tier === "expert") {
      if (capped < 1 && rng.next() < 0.6) continue;
      const pol = totalLoss - preAgg, share = (preAgg / totalLoss) * 100, T = rng.pick([20, 25, 30, 35, 40, 45, 50]);
      const holdPct = 100 - share;
      if (nearHalf(share, 1, 0.08) || Math.abs(holdPct - T) < 3 || (holdPct > T) !== wantThr) continue;
      const parts = [
        numPart("insurer", "Insurer pays", "Total the insurer pays ($, whole dollars)", preAgg, 0, "Per loss: take off the excess, take the co-insurance percentage of what is left, cap at the limit; then add up."),
        numPart("holder", "Policyholder pays", "Total the policyholder pays ($, whole dollars)", pol, 0, "All the losses added, less what the insurer pays."),
        numPart("share", "Insurer's share", "Insurer's share of the total losses (%)", share, 1, "What the insurer pays divided by all the losses added, as a percentage."),
        yesNo("heavy", "Heavy share?", `Is the policyholder's share of the losses **more than ${T}%**?`, holdPct > T, "The policyholder's share is 100% less the insurer's share.")];
      return finish(`A policy has an ${termsBase} per loss and **${c}% co-insurance** (made-up terms). For each loss: take off the excess (not below zero), the insurer pays **${c}%** of what is left, and the insurer's payment on any one loss never exceeds the limit. This year's three losses were ${list}. Give whole dollars, and percentages to 1 decimal place.`,
        parts, `${xs.map((x, q) => `**Loss ${q + 1}:** (${dollars(x)} − ${dollars(E)}) × ${c}% → insurer **${dollars(paid[q])}**`).join("\n\n")}\n\n**Insurer:** **${dollars(preAgg)}**. **Policyholder:** ${dollars(totalLoss)} − ${dollars(preAgg)} = **${dollars(pol)}**.\n\n**Share:** ${dollars(preAgg)} ÷ ${dollars(totalLoss)} × 100 = **${f(roundTo(share, 1))}%**; the policyholder bears ${f(roundTo(holdPct, 1))}%: **${YN(holdPct > T)}**.`,
        "uw-ex3", { tier, xs, E, L, c, T }, [["_excess", E], ["_limit", L], ["_coins", c], ...xs.map((x, q) => [`_loss${q + 1}`, x])],
        ["Handle each loss separately: excess, then co-insurance, then the limit.", "Shares are measured against the total of all the losses."]);
    }
    // expert-plus: per-loss limit and an annual aggregate
    const A = wantAgg ? Math.round((preAgg * (0.6 + rng.next() * 0.28)) / 100) * 100 : Math.round((preAgg * (1.1 + rng.next() * 0.4)) / 100) * 100;
    if (Math.abs(A - preAgg) < 0.07 * preAgg || (A < preAgg) !== wantAgg || capped < 1) continue;
    const after = Math.min(A, preAgg), pol = totalLoss - after;
    const parts = [
      numPart("perloss", "Before the aggregate", "Total of the per-loss payments, before the annual aggregate limit ($, whole dollars)", preAgg, 0, "Per loss: take off the excess, take the co-insurance percentage, cap at the per-loss limit; then add up."),
      numPart("insurer", "Insurer pays", "Total the insurer actually pays over the year ($, whole dollars)", after, 0, "The insurer's payments for the year cannot add up to more than the aggregate limit."),
      numPart("holder", "Policyholder pays", "Total the policyholder pays over the year ($, whole dollars)", pol, 0, "All four losses added, less what the insurer actually pays."),
      numPart("atlimit", "Losses at the limit", "Number of losses where the per-loss limit cut the payment", capped, 0, "Count the losses where the co-insured amount was more than the per-loss limit.")];
    return finish(`A policy has an ${termsBase} per loss, **${c}% co-insurance**, and an **annual aggregate limit of ${dollars(A)}** on everything the insurer pays in the year (made-up terms). For each loss: take off the excess (not below zero), the insurer pays **${c}%** of what is left, capped at the per-loss limit. Then, across the year, the insurer's total is capped at the aggregate limit. This year's four losses were ${list}. Give whole dollars and a whole count.`,
      parts, `${xs.map((x, q) => `**Loss ${q + 1}:** (${dollars(x)} − ${dollars(E)}) × ${c}% → **${dollars(paid[q])}**`).join("\n\n")}\n\n**Before the aggregate:** **${dollars(preAgg)}**. **Aggregate cap:** min(${dollars(preAgg)}, ${dollars(A)}) = **${dollars(after)}**. **Policyholder:** ${dollars(totalLoss)} − ${dollars(after)} = **${dollars(pol)}**. **Cut by the per-loss limit:** **${capped}**.`,
      "uw-ex4", { tier, xs, E, L, c, A }, [["_excess", E], ["_limit", L], ["_coins", c], ["_agg", A], ...xs.map((x, q) => [`_loss${q + 1}`, x])],
      ["Per-loss rules first (excess, co-insurance, per-loss limit); the aggregate comes last.", "The aggregate only matters if the per-loss payments add up to more than it."]);
  }
  return tooMany();
}

// ---------- risk-scorecard ----------

const SC = [
  { label: "Building age", bands: ["under 10 years", "10 to 29 years", "30 years or more"], pts: [[0], [1, 2], [3, 4]] },
  { label: "Construction", bands: ["brick or concrete", "mixed", "timber frame"], pts: [[0], [1], [2, 3]] },
  { label: "Claims in the last 5 years", bands: ["none", "1 claim", "2 or more claims"], pts: [[0], [2, 3], [5, 6]] },
  { label: "Fire protection", bands: ["sprinklers fitted", "alarm only", "none"], pts: [[-2, -1], [0, 1], [2, 3]] },
];
const AREAS = ["Harbour Quarter", "Mill Lane", "Northgate", "Riverside", "Old Market", "Southfield"];

function drawCard(rng) { return SC.map((t) => ({ ...t, vals: t.pts.map((a) => rng.pick(a)) })); }
function drawApplicant(rng, card) {
  const picks = card.map(() => rng.int(0, 2));
  const age = [rng.int(2, 9), rng.int(10, 29), rng.int(30, 80)][picks[0]];
  const claims = [0, 1, rng.int(2, 4)][picks[2]];
  return { picks, age, claims, score: sum(card.map((t, i) => t.vals[picks[i]])) };
}
const cardTable = (card) => `| Factor | Band | Points |\n|---|---|---|\n${card.map((t) => t.bands.map((b, i) => `| ${t.label} | ${b} | ${t.vals[i]} |`).join("\n")).join("\n")}`;
const propText = (card, a, who = "The premises") =>
  `${who}: building **${a.age} years** old, **${card[1].bands[a.picks[1]]}** construction, **${a.claims === 0 ? "no" : a.claims} claim${a.claims === 1 ? "" : "s"}** in the last 5 years, fire protection: **${card[3].bands[a.picks[3]]}**.`;
const decide = (s, A, R) => (s <= A ? "Accept" : s <= R ? "Refer" : "Decline");
const cardMargin = (s, A, R) => Math.abs(s - A) >= 1 && Math.abs(s - (A + 1)) >= 1 && Math.abs(s - R) >= 1 && Math.abs(s - (R + 1)) >= 1;
const rulesTxt = (A, R) => `Score rules: a total of **${A} or less is Accept**, **${A + 1} to ${R} is Refer** (to a senior underwriter) and **${R + 1} or more is Decline**.`;

function genScore(rng, tier) {
  const wantFinal = rng.pick(["write", "refer-cap", "refer-score", "decline"]), wantOut = rng.pick(["Both", "Only A", "Only B", "Neither"]);
  const wantDec = rng.pick(DECISIONS);
  for (let i = 0; i < TRY; i++) {
    const card = drawCard(rng), A = rng.int(3, 6), R = A + rng.int(3, 5), area = rng.pick(AREAS);
    const tab = `**Scorecard for this exercise** (made-up points):\n\n${cardTable(card)}\n\n${rulesTxt(A, R)}`;
    if (tier === "expert-plus") {
      const a = drawApplicant(rng, card), b = drawApplicant(rng, card);
      if (a.picks.join() === b.picks.join() || !cardMargin(a.score, A, R) || !cardMargin(b.score, A, R)) continue;
      const SA = rng.int(2, 12) * 25000, SB = rng.int(2, 12) * 25000, X = rng.int(10, 60) * 50000, K = Math.round((X + SA + SB) * (0.75 + rng.next() * 0.6) / 50000) * 50000;
      if ([X + SA, X + SB, X + SA + SB].some((v) => Math.abs(v - K) < 0.04 * K)) continue;
      const okA = a.score <= A && X + SA <= K, okB = b.score <= A && X + (okA ? SA : 0) + SB <= K;
      const out = okA && okB ? "Both" : okA ? "Only A" : okB ? "Only B" : "Neither";
      if (out !== wantOut) continue;
      const parts = [
        numPart("scorea", "Score A", "Total score for proposal A (points)", a.score, 0, "Read off the points for each of A's four bands and add them."),
        numPart("scoreb", "Score B", "Total score for proposal B (points)", b.score, 0, "The same method with B's bands."),
        numPart("exposure", "Exposure if both", "Exposure in the area if both proposals were written ($, whole dollars)", X + SA + SB, 0, "The exposure already held plus both sums insured."),
        choicePart("written", "Written", "Which proposals are written, taking A first and then B?", out, ["Both", "Only A", "Only B", "Neither"], "A proposal is written only if it scores Accept and the exposure after adding it stays within the cap; a proposal that is not written adds nothing.")];
      return finish(`${tab}\n\nBoth proposals are in **${area}**, where the company already holds **${dollars(X)}** of exposure (sums insured). The area cap is **${dollars(K)}**. A proposal is **written** only if its score says Accept **and** the area exposure after adding its sum insured is no more than the cap; proposals are taken in order, A then B, and one that is not written adds nothing.\n\n**A** (sum insured ${dollars(SA)}): ${propText(card, a, "premises")}\n\n**B** (sum insured ${dollars(SB)}): ${propText(card, b, "premises")}`,
        parts, `**Score A:** ${card.map((t, q) => t.vals[a.picks[q]]).join(" + ")} = **${a.score}** (${decide(a.score, A, R)}). **Score B:** ${card.map((t, q) => t.vals[b.picks[q]]).join(" + ")} = **${b.score}** (${decide(b.score, A, R)}).\n\n**Exposure if both:** ${dollars(X)} + ${dollars(SA)} + ${dollars(SB)} = **${dollars(X + SA + SB)}**.\n\n**A:** ${a.score <= A ? `Accept; ${dollars(X + SA)} ${X + SA <= K ? "fits" : "exceeds"} ${dollars(K)}` : "not Accept"} → ${okA ? "written" : "not written"}. **B:** ${b.score <= A ? `Accept; ${dollars(X + (okA ? SA : 0) + SB)} ${X + (okA ? SA : 0) + SB <= K ? "fits" : "exceeds"} ${dollars(K)}` : "not Accept"} → ${okB ? "written" : "not written"}: **${out}**.`,
        "uw-sc4", { tier, card: card.map((t) => ({ label: t.label, bands: t.bands, vals: t.vals })), pa: a.picks, pb: b.picks, A, R, SA, SB, X, K }, [["_accept", A], ["_refer", R], ["_exposure", X], ["_cap", K], ["_suma", SA], ["_sumb", SB]],
        ["Score each proposal on its own, then think about the cap in order.", "If A is not written it adds nothing to the exposure B is tested against."]);
    }
    const a = drawApplicant(rng, card);
    if (!cardMargin(a.score, A, R)) continue;
    const dec = decide(a.score, A, R), exA = `**Score:** ${card.map((t, q) => t.vals[a.picks[q]]).join(" + ")} = **${a.score}**, which is **${dec}**.`;
    const pS = numPart("score", "Score", "Total score (points)", a.score, 0, "Read off the points for each of the four bands and add them.");
    const pD = choicePart("decision", "Scorecard decision", "What does the scorecard say?", dec, DECISIONS, "Compare the total with the Accept and Refer limits.");
    const given0 = [["_accept", A], ["_refer", R]];
    if (tier === "medium") {
      if (dec !== wantDec) continue;
      return finish(`${tab}\n\n${propText(card, a)}`, [pS, pD], exA, "uw-sc1", { tier, card: card.map((t) => ({ label: t.label, bands: t.bands, vals: t.vals })), pa: a.picks, A, R }, given0,
        ["One band per factor; add the points.", "Check the total against the limits in the stated order."]);
    }
    const S = rng.int(2, 16) * 25000, X = rng.int(10, 60) * 50000, K = Math.round((X + S) * (0.8 + rng.next() * 0.45) / 50000) * 50000;
    const exposure = X + S, exE = `**Exposure:** ${dollars(X)} + ${dollars(S)} = **${dollars(exposure)}**.`;
    const pX = numPart("exposure", "Area exposure", `Exposure in ${area} if this risk were written ($, whole dollars)`, exposure, 0, "The exposure already held plus this risk's sum insured.");
    if (tier === "hard") {
      if (dec !== wantDec) continue;
      return finish(`${tab}\n\n${propText(card, a)} Its sum insured is **${dollars(S)}** and the company already holds **${dollars(X)}** of exposure in ${area}.`,
        [pS, pD, pX], `${exA}\n\n${exE}`, "uw-sc2", { tier, card: card.map((t) => ({ label: t.label, bands: t.bands, vals: t.vals })), pa: a.picks, A, R, S, X }, [...given0, ["_suminsured", S], ["_exposure", X]],
        ["Score and decision first; the exposure is separate arithmetic.", "Exposure after writing = what is held now + this sum insured."]);
    }
    // expert: final action with a cap
    if (Math.abs(exposure - K) < 0.06 * K) continue;
    const fin = dec === "Decline" ? "Decline" : dec === "Refer" ? "Refer" : exposure <= K ? "Write" : "Refer";
    const want = wantFinal === "write" ? (dec === "Accept" && exposure <= K) : wantFinal === "refer-cap" ? (dec === "Accept" && exposure > K) : wantFinal === "refer-score" ? dec === "Refer" : dec === "Decline";
    if (!want) continue;
    const parts = [pS, pD, pX, choicePart("action", "Final action", "What happens to the proposal?", fin, ["Write", "Refer", "Decline"], "Decline stays declined and Refer stays a referral; only an Accept can be written, and only if the exposure fits under the cap, otherwise it is referred.")];
    return finish(`${tab}\n\n${propText(card, a)} Its sum insured is **${dollars(S)}**. The company already holds **${dollars(X)}** of exposure in ${area}, and the area cap is **${dollars(K)}**. Action rules: a Decline score means **Decline**; a Refer score means **Refer**; an Accept score means **Write** if the exposure after adding this risk is no more than the cap, and otherwise **Refer**.`,
      parts, `${exA}\n\n${exE}\n\n**Action:** score ${dec}${dec === "Accept" ? `, exposure ${dollars(exposure)} ${exposure <= K ? "within" : "over"} the ${dollars(K)} cap` : ""}: **${fin}**.`,
      "uw-sc3", { tier, card: card.map((t) => ({ label: t.label, bands: t.bands, vals: t.vals })), pa: a.picks, A, R, S, X, K }, [...given0, ["_suminsured", S], ["_exposure", X], ["_cap", K]],
      ["Score and scorecard decision first.", "Only an Accept can be written, and only if it fits under the cap."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "premium") return genPremium(rng, difficulty);
  if (subtopic === "loss-ratio") return genLoss(rng, difficulty);
  if (subtopic === "excess-limit") return genExcess(rng, difficulty);
  if (subtopic === "risk-scorecard") return genScore(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Premiums are rebuilt in exact integer cents (BigInt), losses are walked one at a time with a running
// aggregate, scores are looked up by band label, exposures are added up one proposal at a time.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

// exact cents: round-half-up of num/den (BigInt) to an integer
const B = (x) => BigInt(x);
const ratCents = (n, d) => Number((n * 2n + d) / (d * 2n));
const prodB = (...xs) => xs.reduce((s, x) => s * B(x), 1n);
// rated premium numerator over 10^4 for cents: base * f1*f2*f3 (each in hundredths) * 100 / 10^6 = base*F/10^4
const ratedCents = (base, fs) => ratCents(prodB(base, ...fs), 10000n);
const loadedDiscCents = (base, fs, l, d) => ratCents(prodB(base, ...fs, 100 + l, 100 - d), 100000000n);
const loadedCents = (base, fs, l) => ratCents(prodB(base, ...fs, 100 + l), 1000000n);

function walkLosses(xs, E, c, L, agg) {
  let run = 0, ins = 0, hit = 0;
  for (const x of xs) {
    const afterExcess = x > E ? x - E : 0, co = (afterExcess * c) / 100;
    if (co > L) hit++;
    const p = co > L ? L : co;
    ins += p;
    run += p;
  }
  const after = agg === undefined ? ins : (run > agg ? agg : run);
  return { pre: ins, after, hit, loss: xs.reduce((s, x) => s + x, 0) };
}
const scoreByLabel = (card, picks) => card.reduce((s, t, i) => s + t.vals[t.bands.indexOf(t.bands[picks[i]])], 0);
const decideAlt = (s, A, R) => (s > R ? "Decline" : s > A ? "Refer" : "Accept");

const ALT = {
  "uw-pr1": (p) => { const r = ratedCents(p.base, p.facs); return { rated: r / 100, final: ratCents(prodB(p.base, ...p.facs, 100 - p.d), 1000000n) / 100 }; },
  "uw-pr2": (p) => {
    const r = ratedCents(p.base, p.facs), x = loadedDiscCents(p.base, p.facs, p.l, p.d);
    return { rated: r / 100, loaded: x / 100, final: Math.max(x, p.M * 100) / 100 };
  },
  "uw-pr3": (p) => {
    const r = ratedCents(p.base, p.facs), x = loadedDiscCents(p.base, p.facs, p.l, p.d), fin = Math.max(x, p.M * 100);
    return { rated: r / 100, final: fin / 100, change: ((fin - p.LY * 100) / (p.LY * 100)) * 100, within: YN(fin <= p.LY * (100 + p.c)) };
  },
  "uw-pr4": (p) => {
    const a = loadedCents(p.base, p.facs1, p.l), b = loadedCents(p.base, p.facs2, p.l);
    const monthly = ratCents(prodB(a + b, 100 - p.hd, 100 + p.s), 10000n * 12n);
    return { cara: a / 100, carb: b / 100, monthly: monthly / 100, budget: YN(monthly <= p.Bm * 100) };
  },
  "uw-lr1": (p) => { const c = Math.round((p.N * p.p) / 100) * p.C; return { cost: c, lossratio: (c * 100) / (p.N * p.P) }; },
  "uw-lr2": (p) => { const c = Math.round((p.N * p.p) / 100) * p.C, lr = (c * 100) / (p.N * p.P); return { cost: c, lossratio: lr, combined: lr + p.e }; },
  "uw-lr3": (p) => {
    const c = Math.round((p.N * p.p) / 100) * p.C, prem = p.N * p.P, lr = (c * 100) / prem;
    const res = prem * (1 - p.e / 100) - c;
    return { lossratio: lr, combined: lr + p.e, result: res, profit: YN(res > 1e-9) };
  },
  "uw-lr4": (p) => {
    const per = (p.p * p.C) / 100;
    let need = 1; while (need * (p.T - p.e) < per * 100 - 1e-9) need++;
    const inc = ((need - p.P0) * 100) / p.P0;
    return { claim: per, needed: need, rise: inc, within: YN(need * 100 <= p.P0 * (100 + p.c) + 1e-9) };
  },
  "uw-ex1": (p) => { const w = walkLosses([p.x], p.E, 100, p.L); return { insurer: w.pre, holder: w.loss - w.pre }; },
  "uw-ex2": (p) => { const w = walkLosses(p.xs, p.E, 100, p.L); return { insurer: w.pre, holder: w.loss - w.pre, atlimit: w.hit }; },
  "uw-ex3": (p) => {
    const w = walkLosses(p.xs, p.E, p.c, p.L), holder = w.loss - w.pre;
    return { insurer: w.pre, holder, share: (w.pre * 100) / w.loss, heavy: YN(holder * 100 > p.T * w.loss) };
  },
  "uw-ex4": (p) => { const w = walkLosses(p.xs, p.E, p.c, p.L, p.A); return { perloss: w.pre, insurer: w.after, holder: w.loss - w.after, atlimit: w.hit }; },
  "uw-sc1": (p) => { const s = scoreByLabel(p.card, p.pa); return { score: s, decision: decideAlt(s, p.A, p.R) }; },
  "uw-sc2": (p) => { const s = scoreByLabel(p.card, p.pa); return { score: s, decision: decideAlt(s, p.A, p.R), exposure: p.X + p.S }; },
  "uw-sc3": (p) => {
    const s = scoreByLabel(p.card, p.pa), d = decideAlt(s, p.A, p.R), e = p.X + p.S;
    return { score: s, decision: d, exposure: e, action: d === "Accept" ? (e > p.K ? "Refer" : "Write") : d };
  },
  "uw-sc4": (p) => {
    const sa = scoreByLabel(p.card, p.pa), sb = scoreByLabel(p.card, p.pb);
    let held = p.X; const w = [];
    for (const [s, S] of [[sa, p.SA], [sb, p.SB]]) {
      const ok = decideAlt(s, p.A, p.R) === "Accept" && held + S <= p.K;
      w.push(ok); if (ok) held += S;
    }
    return { scorea: sa, scoreb: sb, exposure: p.X + p.SA + p.SB, written: w[0] && w[1] ? "Both" : w[0] ? "Only A" : w[1] ? "Only B" : "Neither" };
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
