// Retail Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact, or (where a rounded earlier answer is asked for)
// the later parts do not use it. No answer sits on a rounding half-step, and verdict parts are decided
// first and then fitted (about 50/50). All figures are made up (practice only); money is a generic $.
// Conventions: markup = profit / cost; margin = profit / selling price; stock figures are at cost;
// shrinkage = opening + purchases - sales - counted closing stock; stock turn = sales / average stock.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   footfall-staffing  visitors x conversion x basket -> sales -> staff by a sales-per-staff-hour rule   (Store)
//   markup-margin      cost, markup, price, margin; target margin; supplier rise                         (Merch)
//   deal-compare       3 for 2 / x% off / half-price multi-buys -> best deal for a basket                (Merch)
//   stock-shrinkage    opening + purchases - sales - closing -> shrinkage %, stock turn, tolerance       (Store, Merch)

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
const tooMany = () => { throw new Error("role-retail-manager: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const moneyW = (n) => (isEx(n, 0) ? `$${commas(Math.round(n))}` : money(n)); // whole dollars without .00
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const pct1 = (n) => roundTo(n, 1).toFixed(1);

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
const pickOne = (rng, id, label, ask, options, ans, hint) => ({ id, label, ask, answerType: "choice", answer: ans, choices: shuffled(rng, options), hint });
// Segmented part: all combinations of two small value lists (2 x 2), shuffled by the caller's rng.
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: shuffled(rng, choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
const art = (n) => (/^[aeiou]/.test(n) ? "an" : "a");
const An = (n) => (art(n) === "an" ? "An" : "A");

// ---------- footfall-staffing ----------

const SHOPS = ["clothing shop", "bookshop", "garden centre", "shoe shop", "homeware shop", "toy shop", "pet shop", "electronics shop", "sports shop", "gift shop"];
const CONVS = [5, 8, 10, 12, 15, 18, 20, 25, 30, 35];
const drawBasket = (rng) => rng.int(18, 95) + rng.pick([0, 0, 0.5]);
const ruleText = (R) => `The staffing rule: each member of staff may be rostered for at most **${money(R)}** of sales per hour, so the store needs enough staff that sales per hour ÷ staff does not go above that.`;

function genStaff(rng, tier) {
  const wantOk = rng.next() < 0.5; // rota verdict decided first (expert-plus)
  for (let i = 0; i < TRY; i++) {
    const shop = rng.pick(SHOPS), c = rng.pick(CONVS), B = drawBasket(rng);
    const H = rng.pick([8, 9, 10, 12]), R = rng.pick([150, 200, 250, 300, 400]);
    if (tier === "expert-plus") {
      const t = rng.int(40, 200), T = roundTo(t * B, 2), vis = (t * 100) / c;
      if (!Number.isInteger(vis) && Math.abs(vis - Math.round(vis)) < 0.1) continue;
      const need = Math.ceil(vis);
      const ratio = T / (H * R), staff = Math.ceil(ratio);
      if (staff < 2 || staff > 14 || Math.abs(ratio - Math.round(ratio)) < 0.1) continue;
      const k = wantOk ? staff + rng.pick([0, 1, 2]) : staff - rng.pick([1, 2]);
      if (k < 1) continue;
      const ok = k >= staff;
      const parts = [
        numPart("t", "Purchases needed", "Number of purchases (transactions) needed to reach the target", t, 0, "Sales target ÷ average basket gives the number of purchases."),
        numPart("vis", "Visitors needed", "Number of visitors needed to get that many purchases (round up)", need, 0, "Purchases = visitors × conversion rate, so visitors = purchases ÷ (conversion ÷ 100). Round up: a part-visitor does not count."),
        numPart("staff", "Staff needed", "Smallest number of staff the rule allows for the day's sales (round up)", staff, 0, "Sales per hour = target ÷ opening hours. Divide by the most one person may be rostered for, and round up."),
        yesNo("ok", "Rota enough?", `The manager has rostered **${k}** staff for the day. Does the rota meet the rule?`, ok, "Compare the rota with the smallest number the rule allows."),
      ];
      const sph = T / H;
      const ex = `**Purchases:** ${money(T)} ÷ ${money(B)} = **${t}**.\n\n**Visitors:** ${t} ÷ ${c / 100} = ${Number.isInteger(vis) ? `**${need}** (a whole number, so no rounding is needed)` : `${f(roundTo(vis, 2))}, round up to **${need}**`}.\n\n**Staff:** sales per hour = ${money(T)} ÷ ${H} = ${money(sph)}; ${money(sph)} ÷ ${money(R)} = ${f(roundTo(sph / R, 2))}, round up to **${staff}**.\n\n**Rota:** ${k} is ${ok ? "at least" : "fewer than"} ${staff}: **${YN(ok)}**.`;
      return finish(`${An(shop)} ${shop} sets a sales target of **${money(T)}** for a day. The average basket is **${money(B)}** and **${c}%** of visitors buy something (the conversion rate). The store is open **${H} hours**. ${ruleText(R)}`,
        parts, ex, "ret-ff4", { tier, T, B, c, H, R, k }, [["_target", T], ["_basket", B], ["_conv", c], ["_hours", H], ["_rule", R], ["_rota", k]],
        ["Work backwards from the sales target to purchases, then visitors.", "The staffing check uses the sales per hour, not the visitors."]);
    }
    const F = rng.int(20, 150) * 10, t = (F * c) / 100;
    if (!Number.isInteger(t)) continue;
    const sales = roundTo(t * B, 2);
    const given = [["_visitors", F], ["_conv", c], ["_basket", B]];
    const parts = [numPart("t", "Purchases", "Number of purchases (transactions) in the day", t, 0, "Purchases = visitors × conversion rate ÷ 100.")];
    let ex = `**Purchases:** ${F} × ${c} ÷ 100 = **${t}**.`;
    let kind = "ret-ff1", extra = {};
    const hints = ["Conversion rate is the share of visitors who buy."];
    if (tier === "medium") {
      parts.push(numPart("sales", "Sales", "Total sales for the day ($)", sales, 2, "Sales = purchases × average basket."));
      ex += `\n\n**Sales:** ${t} × ${money(B)} = **${money(sales)}**.`;
      hints.push("Sales are purchases times the basket.");
      return finish(`${An(shop)} ${shop} has **${F}** visitors in a day. **${c}%** of them buy something (the conversion rate), and the average basket is **${money(B)}**.`, parts, ex, kind, { tier, F, c, B }, given, hints);
    }
    const sph = sales / H, r = sph / R, staff = Math.ceil(r);
    if (r < 1.2 || r > 10 || Math.abs(r - Math.round(r)) < 0.1 || nearHalf(sph, 2, 0.08)) continue;
    given.push(["_hours", H], ["_rule", R]);
    if (tier === "hard") {
      parts.push(numPart("sph", "Sales per hour", `Sales per opening hour ($)`, sph, 2, "Total sales ÷ opening hours. Total sales = purchases × basket."));
      parts.push(numPart("staff", "Staff needed", "Smallest number of staff the rule allows (round up)", staff, 0, "Sales per hour ÷ the most one person may be rostered for; round up, because you cannot roster part of a person."));
      ex += `\n\n**Sales per hour:** ${t} × ${money(B)} ÷ ${H} = ${money(sales)} ÷ ${H} = **${money(sph)}**.\n\n**Staff:** ${money(sph)} ÷ ${money(R)} = ${f(roundTo(r, 2))}, round up to **${staff}**.`;
      hints.push("Total sales first, then divide by the hours.", "Divide by the rule's limit and round up.");
      return finish(`${An(shop)} ${shop} has **${F}** visitors in a day, open **${H} hours**. **${c}%** of visitors buy something (the conversion rate) and the average basket is **${money(B)}**. ${ruleText(R)}`, parts, ex, "ret-ff2", { tier, F, c, B, H, R }, given, hints);
    }
    // expert: purchases, sales, staff, labour cost as a % of sales
    const w = rng.int(12, 24), lab = (staff * H * w * 100) / sales;
    if (lab > 45 || nearHalf(lab, 1, 0.08)) continue;
    given.push(["_wage", w]);
    parts.push(numPart("sales", "Sales", "Total sales for the day ($)", sales, 2, "Sales = purchases × average basket."));
    parts.push(numPart("staff", "Staff needed", "Smallest number of staff the rule allows (round up)", staff, 0, "Sales per hour = sales ÷ opening hours. Divide by the most one person may be rostered for and round up."));
    parts.push(numPart("lab", "Labour cost %", "Staff pay for the day as a percentage of sales (%)", lab, 1, "Pay = staff × hours × hourly wage. Divide by the day's sales and multiply by 100."));
    ex += `\n\n**Sales:** ${t} × ${money(B)} = **${money(sales)}**.\n\n**Staff:** sales per hour = ${money(sales)} ÷ ${H} = ${money(sph)}; ${money(sph)} ÷ ${money(R)} = ${f(roundTo(r, 2))}, round up to **${staff}**.\n\n**Labour cost:** ${staff} × ${H} × ${money(w)} = ${money(staff * H * w)}; ${money(staff * H * w)} ÷ ${money(sales)} × 100 = **${pct1(lab)}%**.`;
    return finish(`${An(shop)} ${shop} has **${F}** visitors in a day, open **${H} hours**. **${c}%** of visitors buy something (the conversion rate) and the average basket is **${money(B)}**. ${ruleText(R)} Staff are paid **${money(w)}** an hour.`,
      parts, ex, "ret-ff3", { tier, F, c, B, H, R, w }, given,
      ["Purchases, then sales, then the staff the rule needs.", "Pay uses the whole number of staff you found."]);
  }
  return tooMany();
}

// ---------- markup-margin ----------

const GOODS = ["jacket", "lamp", "backpack", "toaster", "rug", "kettle", "desk chair", "coat", "blender", "board game", "cushion", "suitcase", "mirror", "clock", "umbrella"];
const MARKUPS = [20, 25, 40, 50, 60, 75, 100];
const MARGINS = [20, 25, 40, 50, 60];
const defs = "Markup is profit as a percentage of the **cost**; margin is profit as a percentage of the **selling price**.";

function genMargin(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const good = rng.pick(GOODS);
    if (tier === "medium" || tier === "hard") {
      const C = rng.int(12, 120), m = rng.pick(MARKUPS), P = (C * (100 + m)) / 100, mg = ((P - C) / P) * 100;
      if (!isEx(P, 2) || nearHalf(mg, 1, 0.08)) continue;
      const parts = [
        numPart("price", "Selling price", "Selling price ($)", P, 2, "Selling price = cost × (1 + markup ÷ 100)."),
        numPart("margin", "Margin", "Margin on the selling price (%)", mg, 1, "Profit = price minus cost. Margin = profit ÷ selling price × 100 (not ÷ cost)."),
      ];
      let ex = `**Selling price:** ${money(C)} × ${f(1 + m / 100)} = **${money(P)}**.\n\n**Margin:** profit = ${money(P)} − ${money(C)} = ${money(P - C)}; ${money(P - C)} ÷ ${money(P)} × 100 = **${pct1(mg)}%**.`;
      const hints = ["Add the markup to the cost first.", "Margin uses the selling price as its base."];
      const given = [["_cost", C], ["_markup", m]];
      let kind = "ret-mm1", n = 0;
      if (tier === "hard") {
        n = rng.int(5, 40);
        parts.push(numPart("profit", "Profit", `Total profit on selling ${n} of them ($)`, n * (P - C), 2, "Profit on one = price minus cost. Multiply by the number sold."));
        ex += `\n\n**Profit:** ${n} × ${money(P - C)} = **${money(n * (P - C))}**.`;
        hints.push("Profit per item times the number sold.");
        given.push(["_n", n]);
        kind = "ret-mm2";
      }
      return finish(`A shop buys ${art(good)} **${good}** for **${money(C)}** and adds a markup of **${m}%**${tier === "hard" ? `, then sells ${n} of them` : ""}. ${defs}`, parts, ex, kind, { tier, C, m, n }, given, hints);
    }
    const g = rng.pick(MARGINS), C = rng.int(8, 120), P = (C * 100) / (100 - g);
    if (!isEx(P, 2)) continue;
    if (tier === "expert") {
      const mk = ((P - C) / C) * 100, pr = P - C, F = rng.int(10, 60) * 50, units = F / pr;
      if (nearHalf(mk, 1, 0.08) || units < 3 || units > 400 || (!Number.isInteger(units) && Math.abs(units - Math.round(units)) < 0.1)) continue;
      const u = Math.ceil(units);
      const parts = [
        numPart("price", "Selling price", "Selling price needed ($)", P, 2, "Cost is the share of the price left after the margin: price = cost ÷ (1 − margin ÷ 100)."),
        numPart("markup", "Markup", "The same profit as a markup on cost (%)", mk, 1, "Markup = profit ÷ cost × 100, using the price you found."),
        numPart("profit", "Profit per item", "Profit on one item ($)", pr, 2, "Profit = selling price minus cost."),
        numPart("units", "Items to cover costs", `Items that must be sold in a week to cover fixed costs of ${moneyW(F)} (round up)`, u, 0, "Fixed costs ÷ profit per item; round up, because a part-sale does not cover the last dollars."),
      ];
      const ex = `**Selling price:** margin ${g}% means cost is ${100 - g}% of the price, so ${money(C)} ÷ ${f((100 - g) / 100)} = **${money(P)}**.\n\n**Markup:** (${money(P)} − ${money(C)}) ÷ ${money(C)} × 100 = **${pct1(mk)}%**.\n\n**Profit per item:** ${money(P)} − ${money(C)} = **${money(pr)}**.\n\n**Items:** ${moneyW(F)} ÷ ${money(pr)} = ${f(roundTo(units, 2))}, round up to **${u}**.`;
      return finish(`A shop wants a margin of **${g}%** on ${art(good)} **${good}** that costs it **${money(C)}**. ${defs} The item must also cover **${moneyW(F)}** of fixed costs each week.`,
        parts, ex, "ret-mm3", { tier, C, g, F }, [["_cost", C], ["_margin", g], ["_fixed", F]],
        ["The margin is a share of the price, so the cost is the rest of the price.", "Markup and profit both come from the price and the cost."]);
    }
    // expert-plus: work back from price and margin to cost, markup, new margin after a supplier rise, then a policy verdict
    const r = rng.pick([5, 10, 15, 20]), C2 = (C * (100 + r)) / 100;
    if (!isEx(C2, 2) || C2 >= P) continue;
    const mk = ((P - C) / C) * 100, mg2 = ((P - C2) / P) * 100;
    if (nearHalf(mk, 1, 0.08) || nearHalf(mg2, 1, 0.08) || mg2 < 4) continue;
    const M = wantOk ? Math.floor(mg2) - rng.int(1, 3) : Math.ceil(mg2) + rng.int(1, 3);
    if (M < 3 || Math.abs(mg2 - M) < 0.8) continue;
    const ok = mg2 >= M;
    const parts = [
      numPart("cost", "Cost", "What the item cost the shop ($)", C, 2, "Margin is a share of the selling price, so cost = price × (1 − margin ÷ 100)."),
      numPart("markup", "Markup", "The markup on cost (%)", mk, 1, "Profit ÷ cost × 100, with the cost you found."),
      numPart("margin2", "New margin", `Margin on the selling price after the supplier raises the cost by ${r}% and the price stays the same (%)`, mg2, 1, "New cost = old cost × (1 + rise ÷ 100). New profit ÷ the (unchanged) selling price × 100."),
      yesNo("ok", "Keeps the minimum?", `Shop policy: every line must keep a margin of at least **${M}%**. Does this one still?`, ok, "Compare the new margin with the policy figure."),
    ];
    const ex = `**Cost:** ${money(P)} × ${f((100 - g) / 100)} = **${money(C)}**.\n\n**Markup:** (${money(P)} − ${money(C)}) ÷ ${money(C)} × 100 = **${pct1(mk)}%**.\n\n**New margin:** new cost = ${money(C)} × ${f(1 + r / 100)} = ${money(C2)}; (${money(P)} − ${money(C2)}) ÷ ${money(P)} × 100 = **${pct1(mg2)}%**.\n\n**Policy:** ${pct1(mg2)}% is ${ok ? "at least" : "below"} ${M}%: **${YN(ok)}**.`;
    return finish(`A shop sells ${art(good)} **${good}** at **${money(P)}**, which gives it a margin of **${g}%**. ${defs} The supplier now raises its price to the shop by **${r}%**, and the shop keeps the selling price the same.`,
      parts, ex, "ret-mm4", { tier, P, g, r, M }, [["_price", P], ["_margin", g], ["_rise", r], ["_min", M]],
      ["Cost is whatever share of the price the margin does not cover.", "Recompute the margin with the higher cost, then compare."]);
  }
  return tooMany();
}

// ---------- deal-compare ----------

const mgDef = "Margin is profit as a percentage of the amount the shopper pays.";
const DTYPES = ["3for2", "pct", "half3", "half2", "pair"];
function mkDeal(rng, t, pc) {
  if (t === "pct") return { t, x: rng.pick([20, 25, 30, 35, 40]) };
  if (t === "pair") return { t, y: Math.round(2 * pc * rng.pick([0.75, 0.8, 0.85, 0.9])) };
  return { t };
}
const dealText = (d) =>
  d.t === "3for2" ? "**3 for 2**: for every 3 items, pay for 2"
    : d.t === "pct" ? `**${d.x}% off** every item`
    : d.t === "half3" ? "**buy 2, get the 3rd half price** (items are grouped in threes; any left over pay full price)"
    : d.t === "half2" ? "**buy 1, get the 2nd half price** (items are grouped in twos; an odd one left over pays full price)"
    : `**any 2 for ${money(d.y / 100)}** (an odd one left over pays full price)`;
// worked total for the explanation (values already drawn)
function dealWork(d, n, pc) {
  const p = pc / 100, tot = money(dealCents(d, n, pc) / 100), g3 = Math.floor(n / 3), g2 = Math.floor(n / 2);
  const pl = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  if (d.t === "3for2") return `${pl(g3, "item")} free, ${n - g3} paid for: ${n - g3} × ${money(p)} = **${tot}**`;
  if (d.t === "pct") return `${n} × ${money(p)} × ${f((100 - d.x) / 100)} = **${tot}**`;
  if (d.t === "half3") return `${pl(g3, "item")} at half price (${money(p / 2)}) and ${n - g3} at ${money(p)}: ${g3} × ${money(p / 2)} + ${n - g3} × ${money(p)} = **${tot}**`;
  if (d.t === "half2") return `${pl(g2, "item")} at half price (${money(p / 2)}) and ${n - g2} at ${money(p)}: ${g2} × ${money(p / 2)} + ${n - g2} × ${money(p)} = **${tot}**`;
  return `${pl(g2, "pair")} at ${money(d.y / 100)}${n % 2 ? ` and 1 left over at ${money(p)}` : ""}: ${g2} × ${money(d.y / 100)}${n % 2 ? ` + ${money(p)}` : ""} = **${tot}**`;
}
const dealShort = (d) => (d.t === "3for2" ? "3 for 2" : d.t === "pct" ? `${d.x}% off` : d.t === "half3" ? "buy 2 get the 3rd half price" : d.t === "half2" ? "buy 1 get the 2nd half price" : `2 for ${money(d.y / 100)}`);
// closed forms in cents (null if not a whole number of cents)
function dealCents(d, n, pc) {
  const g3 = Math.floor(n / 3), g2 = Math.floor(n / 2);
  const v = d.t === "3for2" ? (n - g3) * pc : d.t === "pct" ? (n * pc * (100 - d.x)) / 100
    : d.t === "half3" ? (g3 * 5 * pc) / 2 + (n % 3) * pc : d.t === "half2" ? (g2 * 3 * pc) / 2 + (n % 2) * pc : g2 * d.y + (n % 2) * pc;
  return Number.isInteger(v) ? v : null;
}
const dealLines = (ds) => ds.map((d, k) => `\n- Deal ${"ABC"[k]}: ${dealText(d)}`).join("");

function dealSetup(rng, nDeals, tier) {
  const wantIdx = rng.int(0, nDeals - 1); // which labelled deal is cheapest, decided first
  for (let i = 0; i < TRY; i++) {
    const n = rng.int(4, 9), pc = rng.int(4, 60) * 100 + rng.pick([0, 0, 50]);
    const ds = shuffled(rng, DTYPES).slice(0, nDeals).map((t) => mkDeal(rng, t, pc));
    const tot = ds.map((d) => dealCents(d, n, pc));
    if (tot.some((v) => v === null)) continue;
    const order = tot.map((v, k) => [v, k]).sort((a, b) => a[0] - b[0]);
    if (order[1][0] - order[0][0] < 0.04 * order[0][0]) continue;
    const best = order[0][1];
    [ds[best], ds[wantIdx]] = [ds[wantIdx], ds[best]];
    return { n, pc, ds, tot: ds.map((d) => dealCents(d, n, pc)), best: wantIdx };
  }
  return tooMany();
}

function genDeal(rng, tier) {
  const good = rng.pick(GOODS);
  if (tier === "medium") {
    const { n, pc, ds, tot, best } = dealSetup(rng, 2, tier);
    const p = pc / 100, A = tot[0] / 100, B = tot[1] / 100;
    const parts = [
      numPart("ta", "Deal A total", "Total cost of the basket under Deal A ($)", A, 2, "Work out how many items are paid for in full and how many get the reduced price, then add."),
      pickOne(rng, "best", "Cheaper deal", "Which deal is cheaper for this basket?", ["Deal A", "Deal B"], `Deal ${"AB"[best]}`, "Find the total under the other deal too, and compare the two totals."),
    ];
    const ex = `**Deal A (${dealShort(ds[0])}):** ${dealWork(ds[0], n, pc)}.\n\n**Deal B (${dealShort(ds[1])}):** ${dealWork(ds[1], n, pc)}.\n\n**Cheaper:** ${money(Math.min(A, B))} is less than ${money(Math.max(A, B))}, so **Deal ${"AB"[best]}**.`;
    return finish(`A shopper buys **${n}** ${good}s at **${money(p)}** each. The shop offers two deals (the shopper may use only one):${dealLines(ds)}`, parts, ex, "ret-deal1", { tier, n, pc, ds }, [["_n", n], ["_price", p]],
      ["Price each deal for the whole basket.", "Compare the two totals."]);
  }
  const { n, pc, ds, tot, best } = dealSetup(rng, 3, tier);
  const p = pc / 100, T = tot.map((v) => v / 100);
  const names = ["Deal A", "Deal B", "Deal C"];
  const choice = (hint) => pickOne(rng, "best", "Best deal", "Which deal gives the lowest total for this basket?", names, names[best], hint);
  const baseEx = `**Deal A (${dealShort(ds[0])}):** ${dealWork(ds[0], n, pc)}.\n\n**Deal B (${dealShort(ds[1])}):** ${dealWork(ds[1], n, pc)}.\n\n**Deal C (${dealShort(ds[2])}):** ${dealWork(ds[2], n, pc)}.\n\n**Best:** the lowest total is ${money(T[best])}, **${names[best]}**.`;
  const prompt = `A shopper buys **${n}** ${good}s at **${money(p)}** each. The shop offers three deals (the shopper may use only one):${dealLines(ds)}`;
  const given = [["_n", n], ["_price", p]];
  const hintsBase = ["Price each deal for the whole basket.", "Compare the three totals."];
  const hintA = "Work out how many items are paid for in full and how many get the reduced price, then add.";
  if (tier === "hard") {
    const parts = [numPart("ta", "Deal A total", "Total cost under Deal A ($)", T[0], 2, hintA), numPart("tb", "Deal B total", "Total cost under Deal B ($)", T[1], 2, hintA), choice("You have two totals; price the third deal as well and compare all three.")];
    return finish(prompt, parts, baseEx, "ret-deal2", { tier, n, pc, ds }, given, hintsBase);
  }
  if (tier === "expert") {
    const k = rng.pick([0.4, 0.45, 0.5, 0.55, 0.6]), cc = Math.round(pc * k), cost = (cc * n) / 100;
    const mg = ((T[best] - cost) / T[best]) * 100;
    if (T[best] <= cost * 1.05 || nearHalf(mg, 1, 0.08)) return genDeal(rng, tier); // rng advanced, still deterministic
    const parts = [numPart("ta", "Deal A total", "Total cost under Deal A ($)", T[0], 2, hintA), numPart("tb", "Deal B total", "Total cost under Deal B ($)", T[1], 2, hintA), choice("Price the third deal too, then take the lowest."),
      numPart("margin", "Store margin", `The shop's margin on the sale if the shopper takes the best deal (%)`, mg, 1, "Profit = amount paid minus what the items cost the shop. Margin = profit ÷ amount paid × 100.")];
    const ex = `${baseEx}\n\n**Margin:** the items cost the shop ${n} × ${money(cc / 100)} = ${money(cost)}; profit = ${money(T[best])} − ${money(cost)} = ${money(T[best] - cost)}; ${money(T[best] - cost)} ÷ ${money(T[best])} × 100 = **${pct1(mg)}%**.`;
    return finish(`${prompt}\n\nEach item costs the shop **${money(cc / 100)}**. ${mgDef}`, parts, ex, "ret-deal3", { tier, n, pc, ds, cc }, [...given, ["_cost", cc / 100]],
      ["Three totals, then the lowest.", "Margin uses the amount the shopper pays for the best deal."]);
  }
  // expert-plus: the shopper paid T under "3 for 2": find the unit price, effective discount, the saving, and a two-column verdict
  return genDealPlus(rng, good);
}

function genDealPlus(rng, good) {
  const wantCheap32 = rng.next() < 0.5, wantMeets = rng.next() < 0.5;
  // The rival discount is 25% or 30%, picked before the basket so that, for each, either deal is
  // cheaper about half the time (a 20% or 35% rival would give the verdict away). The basket size is
  // then picked from those whose 3 for 2 saving (free / n) is at least 3 points above or below it.
  const x = rng.pick([25, 30]);
  const sizes = [4, 5, 6, 7, 8, 9, 10].filter((k) => { const e = (Math.floor(k / 3) / k) * 100; return Math.abs(e - x) >= 3 && (e > x) === wantCheap32; });
  for (let i = 0; i < TRY; i++) {
    const n = rng.pick(sizes), free = Math.floor(n / 3), paid = n - free, pc = rng.int(4, 60) * 100 + rng.pick([0, 0, 50]);
    const eff = (free / n) * 100;
    const T32 = paid * pc, Tx = (n * pc * (100 - x)) / 100;
    if (!Number.isInteger(Tx)) continue;
    const cheap = Math.min(T32, Tx), other = Math.max(T32, Tx);
    const cc = Math.round(pc * rng.pick([0.5, 0.55, 0.6, 0.65, 0.7])), cost = cc * n;
    const mg = ((cheap - cost) / cheap) * 100;
    if (mg < 5 || nearHalf(eff, 1, 0.08)) continue;
    const M = wantMeets ? Math.floor(mg) - rng.int(2, 4) : Math.ceil(mg) + rng.int(2, 4);
    if (M < 3 || Math.abs(mg - M) < 1.5) continue;
    const meets = mg >= M, label32 = "3 for 2", labelX = `${x}% off`;
    const T = T32 / 100;
    const ans = [wantCheap32 ? label32 : labelX, meets ? "Yes" : "No"];
    const parts = [
      numPart("p", "Price each", "Price of one item before any deal ($)", pc / 100, 2, "The shopper paid for all but the free items. Total paid ÷ items paid for = price of one."),
      numPart("eff", "Effective discount", `The 3 for 2 deal's saving as a percentage of the full price of all ${n} items (%)`, eff, 1, "Full price = items × price. Free items ÷ items bought × 100 is the same thing."),
      numPart("save", "Difference", `Difference between the two totals if the shopper had taken the ${x}% off deal instead ($)`, (other - cheap) / 100, 2, `Find the total for ${n} items with ${x}% off, then subtract the smaller total from the larger.`),
      segPart2(rng, "verdict", "Verdict", `Which deal is cheaper for this basket, and does the shop still make its minimum margin of **${M}%** on the sale if the shopper takes that cheaper deal?`, ["Cheaper deal", "Meets minimum margin?"], [label32, labelX], ["Yes", "No"], ans,
        "Take the smaller of the two totals. Margin = (amount paid − what the items cost the shop) ÷ amount paid × 100; compare that with the minimum."),
    ];
    const ex = `**Price each:** ${n} items with every 3rd free means ${paid} are paid for, so ${money(T)} ÷ ${paid} = **${money(pc / 100)}**.\n\n**Effective discount:** ${free} free of ${n} = ${free} ÷ ${n} × 100 = **${pct1(eff)}%**.\n\n**Difference:** ${x}% off gives ${n} × ${money(pc / 100)} × ${f((100 - x) / 100)} = ${money(Tx / 100)}; 3 for 2 gives ${money(T32 / 100)}; the difference is **${money(Math.abs(T32 - Tx) / 100)}**.\n\n**Verdict:** the cheaper deal is **${ans[0]}** (${money(cheap / 100)}). The items cost the shop ${n} × ${money(cc / 100)} = ${money(cost / 100)}, so margin = (${money(cheap / 100)} − ${money(cost / 100)}) ÷ ${money(cheap / 100)} × 100 = ${pct1(mg)}%, which is ${meets ? "at least" : "below"} ${M}%: **${ans[1]}**.`;
    return finish(`A shopper bought **${n}** ${good}s under a deal of **3 for 2** (for every 3 items, pay for 2) and paid **${money(T)}**. The shop's other deal that week was **${x}% off** every item (only one deal may be used). Each item costs the shop **${money(cc / 100)}**. ${mgDef}`,
      parts, ex, "ret-deal4", { tier: "expert-plus", n, T: T32, x, cc, M }, [["_paid", T], ["_n", n], ["_x", x], ["_cost", cc / 100], ["_min", M]],
      ["Work back from the total paid to the price of one item.", "Compare the two deals as totals, then test the margin on the cheaper one."]);
  }
  return tooMany();
}

// ---------- stock-shrinkage ----------

const stkDefs = "All figures, sales included, are **at cost**. Shrinkage is stock that has disappeared without a sale (theft, damage, errors): opening stock + purchases − sales − the stock counted at the end.";

function genStock(rng, tier) {
  const wantW = rng.next() < 0.5, wantT = rng.next() < 0.5, wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "expert-plus") {
      // a year's figures, so a stock turn of 1.5 to 12 is realistic
      const S = rng.int(20, 90) * 10000, pc = rng.int(5, 40) / 10, s = (S * pc) / 100;
      if (!isEx(s, 0)) continue;
      const O = rng.int(10, 60) * 10000, P = rng.int(15, 90) * 10000, C = O + P - S - s;
      if (C < 0.2 * S || C > 1.2 * S) continue;
      const turn = S / ((O + C) / 2);
      if (turn < 1.5 || turn > 12 || nearHalf(turn, 1, 0.08)) continue;
      const tol = wantW ? roundTo(pc + 0.3 + rng.int(0, 8) / 10, 1) : roundTo(pc - 0.3 - rng.int(0, 8) / 10, 1);
      const tt = wantT ? roundTo(turn - 0.5 - rng.int(0, 10) / 10, 1) : roundTo(turn + 0.5 + rng.int(0, 10) / 10, 1);
      if (tol < 0.3 || tt < 0.5) continue;
      const within = pc <= tol, met = turn >= tt;
      const ans = [within ? "Within" : "Over", met ? "Met" : "Missed"];
      const parts = [
        numPart("shr", "Shrinkage", "Stock lost to shrinkage ($)", s, 0, "Shrinkage % is a share of sales, so shrinkage = sales × % ÷ 100.", true),
        numPart("close", "Closing stock", "Stock the count at the end of the year found ($)", C, 0, "Opening stock + purchases − sales − shrinkage = what the count found.", true),
        numPart("turn", "Stock turn", "Stock turn for the period (sales ÷ average stock)", turn, 1, "Average stock = (opening + the counted closing stock) ÷ 2. Then sales ÷ average."),
        segPart2(rng, "verdict", "Verdict", `The tolerance for shrinkage is **${f(tol)}%** of sales and the stock-turn target is **${f(tt)}**. Judge this period against each.`, ["Shrinkage vs tolerance", "Stock turn vs target"], ["Within", "Over"], ["Met", "Missed"], ans,
          "Shrinkage % (given) against its tolerance: at or under is Within. Your stock turn against the target: at or above is Met."),
      ];
      const ex = `**Shrinkage:** ${moneyW(S)} × ${pc} ÷ 100 = **${moneyW(s)}**.\n\n**Closing stock:** ${moneyW(O)} + ${moneyW(P)} − ${moneyW(S)} − ${moneyW(s)} = **${moneyW(C)}**.\n\n**Stock turn:** average stock = (${moneyW(O)} + ${moneyW(C)}) ÷ 2 = ${moneyW((O + C) / 2)}; ${moneyW(S)} ÷ ${moneyW((O + C) / 2)} = **${pct1(turn)}**.\n\n**Verdict:** ${pc}% is ${within ? "no more than" : "above"} ${f(tol)}%: **${ans[0]}**. ${pct1(turn)} is ${met ? "at least" : "below"} ${f(tt)}: **${ans[1]}**.`;
      return finish(`In a year a shop had opening stock of **${moneyW(O)}** and bought **${moneyW(P)}** more. Sales were **${moneyW(S)}**, and shrinkage was **${pc}%** of sales. ${stkDefs} Stock turn is sales ÷ average stock, where average stock = (opening + closing) ÷ 2.`,
        parts, ex, "ret-stk4", { tier, O, P, S, pc, tol, tt }, [["_open", O], ["_bought", P], ["_sales", S], ["_shrink", pc], ["_tol", tol], ["_target", tt]],
        ["Shrinkage % of sales gives the dollars lost, then the closing stock.", "Two separate checks: shrinkage against its tolerance, stock turn against its target."]);
    }
    const O = rng.int(20, 90) * 100, P = rng.int(10, 60) * 100, S = rng.int(30, 140) * 100, s = rng.int(2, 24) * 10;
    const exp = O + P - S, C = exp - s;
    if (exp < 1500 || C < 800) continue;
    const pc = (s / S) * 100;
    if (nearHalf(pc, 1, 0.08)) continue;
    const given = [["_open", O], ["_bought", P], ["_sales", S], ["_count", C]];
    const common = `In a quarter (three months) a shop had opening stock of **${moneyW(O)}** and bought **${moneyW(P)}** more. Sales were **${moneyW(S)}**, and the stock count at the end found **${moneyW(C)}**. ${stkDefs}`;
    const parts = [], hints = [];
    let ex = "";
    if (tier === "hard") {
      parts.push(numPart("exp", "Expected stock", "Stock the shop should have left if nothing went missing ($)", exp, 0, "Opening stock plus purchases, minus sales.", true));
      ex += `**Expected closing stock:** ${moneyW(O)} + ${moneyW(P)} − ${moneyW(S)} = **${moneyW(exp)}**.\n\n`;
      hints.push("Start with what should be left.");
    }
    parts.push(numPart("shr", "Shrinkage", "Shrinkage for the quarter ($)", s, 0, "Shrinkage = opening + purchases − sales − counted stock.", true));
    parts.push(numPart("pct", "Shrinkage %", "Shrinkage as a percentage of sales (%)", pc, 1, "Shrinkage ÷ sales × 100."));
    ex += `**Shrinkage:** ${moneyW(O)} + ${moneyW(P)} − ${moneyW(S)} − ${moneyW(C)} = **${moneyW(s)}**.\n\n**Shrinkage %:** ${moneyW(s)} ÷ ${moneyW(S)} × 100 = **${pct1(pc)}%**.`;
    hints.push("The gap between expected and counted stock is the shrinkage.", "Divide by sales, not by stock.");
    if (tier === "medium" || tier === "hard") {
      return finish(common, parts, ex, tier === "medium" ? "ret-stk1" : "ret-stk2", { tier, O, P, S, C }, given, hints);
    }
    // expert: shrinkage, %, stock turn, tolerance verdict
    const turn = S / ((O + C) / 2), tol = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
    // a quarter's turn of 1.2 to 4 (about 5 to 16 a year) keeps the figures realistic
    if (turn < 1.2 || turn > 4 || nearHalf(turn, 1, 0.08) || Math.abs(pc - tol) < 0.4 || (pc <= tol) !== wantOk) continue;
    const ok = pc <= tol;
    parts.push(numPart("turn", "Stock turn", "Stock turn for the quarter (sales ÷ average stock)", turn, 1, "Average stock = (opening + counted closing stock) ÷ 2. Then sales ÷ average stock."));
    parts.push(yesNo("ok", "Within tolerance?", `The shop tolerates shrinkage of up to **${f(tol)}%** of sales. Is this quarter within it?`, ok, "Compare your shrinkage percentage with the stated tolerance."));
    ex += `\n\n**Stock turn:** average stock = (${moneyW(O)} + ${moneyW(C)}) ÷ 2 = ${moneyW((O + C) / 2)}; ${moneyW(S)} ÷ ${moneyW((O + C) / 2)} = **${pct1(turn)}**.\n\n**Tolerance:** ${pct1(pc)}% is ${ok ? "no more than" : "more than"} ${f(tol)}%: **${YN(ok)}**.`;
    return finish(`${common} Stock turn is sales ÷ average stock, where average stock = (opening + closing) ÷ 2.`, parts, ex, "ret-stk3", { tier, O, P, S, C, tol }, [...given, ["_tol", tol]],
      ["Shrinkage, then as a share of sales.", "Stock turn uses the average of opening and counted closing stock."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "footfall-staffing") return genStaff(rng, difficulty);
  if (subtopic === "markup-margin") return genMargin(rng, difficulty);
  if (subtopic === "deal-compare") return genDeal(rng, difficulty);
  if (subtopic === "stock-shrinkage") return genStock(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (visitors by repeated rounds of
// staff rota, deals priced item by item, cost found by subtracting the margin share, stock by running
// balance). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const up = (x) => { let k = Math.floor(x); while (k < x - 1e-9) k++; return k; }; // ceiling without Math.ceil
const staffFor = (perHour, R) => { let k = 1; while (k * R < perHour - 1e-9) k++; return k; };
// price a basket item by item (cents); item i is 1-based
function basketCents(d, n, pc) {
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    if (d.t === "3for2") sum += i % 3 === 0 ? 0 : pc;
    else if (d.t === "pct") sum += (pc * (100 - d.x)) / 100;
    else if (d.t === "half3") sum += i % 3 === 0 ? pc / 2 : pc;
    else if (d.t === "half2") sum += i % 2 === 0 ? pc / 2 : pc;
    else sum += i % 2 === 0 ? d.y - pc : pc;
  }
  return sum;
}
const bestOf = (cents) => { let b = 0; cents.forEach((v, k) => { if (v < cents[b]) b = k; }); return b; };

const ALT = {
  "ret-ff1": (p) => { const t = (p.F / 100) * p.c; return { t, sales: t * p.B }; },
  "ret-ff2": (p) => { const t = (p.F / 100) * p.c, sales = t * p.B, sph = sales / p.H; return { t, sph, staff: staffFor(sph, p.R) }; },
  "ret-ff3": (p) => {
    const t = (p.F / 100) * p.c, sales = t * p.B, st = staffFor(sales / p.H, p.R);
    return { t, sales, staff: st, lab: (st * p.H * p.w) / (sales / 100) };
  },
  "ret-ff4": (p) => {
    const t = Math.round(p.T / p.B), st = staffFor(p.T / p.H, p.R);
    return { t, vis: up(t / (p.c / 100)), staff: st, ok: YN(p.k >= st) };
  },
  "ret-mm1": (p) => { const P = p.C + (p.C * p.m) / 100; return { price: P, margin: 100 - (p.C / P) * 100 }; },
  "ret-mm2": (p) => { const P = p.C + (p.C * p.m) / 100; return { price: P, margin: 100 - (p.C / P) * 100, profit: (P - p.C) * p.n }; },
  "ret-mm3": (p) => {
    const P = p.C / (1 - p.g / 100), pr = P - p.C;
    return { price: P, markup: (pr / p.C) * 100, profit: pr, units: up(p.F / pr) };
  },
  "ret-mm4": (p) => {
    const C = p.P - (p.P * p.g) / 100, C2 = C * (1 + p.r / 100), m2 = ((p.P - C2) / p.P) * 100;
    return { cost: C, markup: (p.P / C - 1) * 100, margin2: m2, ok: YN(m2 >= p.M) };
  },
  "ret-deal1": (p) => {
    const t = p.ds.map((d) => basketCents(d, p.n, p.pc) / 100);
    return { ta: t[0], best: `Deal ${"AB"[bestOf(t)]}` };
  },
  "ret-deal2": (p) => {
    const t = p.ds.map((d) => basketCents(d, p.n, p.pc) / 100);
    return { ta: t[0], tb: t[1], best: `Deal ${"ABC"[bestOf(t)]}` };
  },
  "ret-deal3": (p) => {
    const t = p.ds.map((d) => basketCents(d, p.n, p.pc) / 100), b = bestOf(t);
    return { ta: t[0], tb: t[1], best: `Deal ${"ABC"[b]}`, margin: 100 - ((p.cc * p.n) / 100 / t[b]) * 100 };
  },
  "ret-deal4": (p) => {
    const free = (p.n - (p.n % 3)) / 3, paid = p.n - free, pc = p.T / paid;
    const a = p.T, b = basketCents({ t: "pct", x: p.x }, p.n, pc), cheap32 = a < b, c = Math.min(a, b);
    const mg = 100 - ((p.cc * p.n) / c) * 100;
    return { p: pc / 100, eff: (free * 100) / p.n, save: Math.abs(a - b) / 100, verdict: `${cheap32 ? "3 for 2" : `${p.x}% off`} | ${YN(mg >= p.M)}` };
  },
  "ret-stk1": (p) => { const bal = p.O + p.P - p.S, s = bal - p.C; return { shr: s, pct: (s / p.S) * 100 }; },
  "ret-stk2": (p) => { const bal = p.O + p.P - p.S, s = bal - p.C; return { exp: bal, shr: s, pct: (s / p.S) * 100 }; },
  "ret-stk3": (p) => {
    const s = p.O + p.P - p.S - p.C, pc = (s / p.S) * 100;
    return { shr: s, pct: pc, turn: p.S / ((p.O + p.C) / 2), ok: YN(pc <= p.tol) };
  },
  "ret-stk4": (p) => {
    const s = (p.pc / 100) * p.S, C = p.O + p.P - p.S - s, turn = p.S / ((p.O + C) / 2);
    return { shr: s, close: C, turn, verdict: `${p.pc <= p.tol ? "Within" : "Over"} | ${turn >= p.tt ? "Met" : "Missed"}` };
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
