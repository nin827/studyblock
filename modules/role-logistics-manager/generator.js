// Logistics Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (or a rounded earlier answer would not change a later one), no answer sits
// on a rounding half-step, and verdict parts are decided first and then fitted. All figures are made up,
// money is a generic $, and every rule (EOQ formula, safety-stock rule, duty basis, pallet layout, dock
// rates) is an exercise rule stated in each prompt, not a country's law.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   order-quantity  EOQ -> orders per year -> annual cost -> case-size rounding -> quantity discount verdict
//   safety-stock    average day -> safety stock (busiest - average) x (lead + slip) -> reorder point -> reorder?;
//                   expert-plus compares a cheaper slower supplier against its extra safety stock
//   landed-cost     duty + freight -> landed cost per unit -> cheaper supplier -> saving; expert-plus: duty on
//                   goods + freight, delay cost per day, two verdicts
//   pallet-dock     cartons per layer/pallet -> pallets -> trailers -> utilisation; expert-plus: dock throughput

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
const tooMany = () => { throw new Error("role-logistics-manager: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const moneyW = (n) => `$${commas(Math.round(n))}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const cdiv = (a, b) => Math.floor((a + b - 1) / b); // integer ceiling division
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; }; // not near a whole number
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const cents = (c) => c / 100;

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  const names = [a, b];
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, names), hint };
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

// ---------- order-quantity ----------

const ITEMS = ["carton sealing tape", "packing foam sheets", "pallet straps", "bubble wrap rolls", "shipping labels", "stretch film rolls", "corner protectors", "thermal printer ribbons"];
const S_LIST = [20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150];
const H_LIST = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const eoqRule = "EOQ = √(2 × yearly demand × cost per order ÷ holding cost per unit per year)";

function genEoq(rng, tier) {
  const wantTake = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const item = rng.pick(ITEMS);
    const S = rng.pick(S_LIST);
    if (tier === "expert-plus") {
      const P = rng.pick([8, 10, 12, 15, 16, 20, 24, 25, 30, 40, 50]), pct = rng.pick([20, 25, 30]);
      const x = rng.pick([1, 2, 3, 4, 5, 6, 8, 10]);
      const Q = 10 * rng.int(8, 60);
      const H = (pct * P) / 100;
      const D = (Q * Q * H) / (2 * S);
      if (!isEx(D, 6) || Math.abs(D - Math.round(D)) > 1e-7 || Math.round(D) % 10 !== 0 || D < 1000 || D > 40000) continue;
      const P2 = (P * (100 - x)) / 100, H2 = (pct * P2) / 100;
      const Q2 = Math.sqrt((2 * D * S) / H2);
      const M = 50 * Math.ceil((Q2 + 10) / 50) + 50 * rng.int(0, 10);
      if (M <= Q2 + 8 || M > 8 * Q || M > 6000) continue;
      const costA = D * P + (D * S) / Q + (Q * H) / 2;
      const costB = D * P2 + (D * S) / M + (M * H2) / 2;
      if (Math.abs(costA - costB) < 100 || nearHalf(costA, 0, 0.05) || nearHalf(costB, 0, 0.05)) continue;
      const take = costB < costA;
      if (take !== wantTake) continue;
      const parts = [
        numPart("eoq", "EOQ at full price", "Economic order quantity at the full price (units)", Q, 0, "Holding cost per unit is a percentage of the unit price. Work that out first, then use the stated EOQ formula."),
        numPart("costa", "Cost at full price", "Total yearly cost ordering that EOQ at the full price: purchases, ordering and holding ($)", costA, 0, "Purchases are yearly demand times the unit price. Add the cost of the orders placed and the cost of holding the average stock.", true),
        numPart("costb", "Cost with discount", `Total yearly cost ordering exactly ${commas(M)} units each time at the discounted price ($)`, costB, 0, "Use the discounted unit price for everything, including the holding cost, and the new order size for the number of orders and the average stock.", true),
        yesNo("take", "Take the discount?", "Is ordering at the discount threshold cheaper overall than ordering the full-price EOQ?", take, "Compare the two yearly totals: the cheaper one wins."),
      ];
      const ex = `**Holding cost:** ${pct}% of ${money(P)} = ${money(H)} per unit per year.\n\n**EOQ:** √(2 × ${commas(D)} × ${S} ÷ ${f(H)}) = √${commas(Q * Q)} = **${commas(Q)} units**.\n\n**Full price:** purchases ${commas(D)} × ${money(P)} = ${money(D * P)}; ordering ${commas(D)} ÷ ${commas(Q)} × ${S} = ${money((D * S) / Q)}; holding ${commas(Q)} ÷ 2 × ${f(H)} = ${money((Q * H) / 2)}. Total ${money(costA)}, about **${moneyW(costA)}**.\n\n**Discount:** the price is ${money(P)} less ${x}% = ${money(P2)}, so holding is ${money(H2)} per unit. Purchases ${money(D * P2)}; ordering ${commas(D)} ÷ ${commas(M)} × ${S} = ${money((D * S) / M)}; holding ${commas(M)} ÷ 2 × ${money(H2)} = ${money((M * H2) / 2)}. Total ${money(costB)}, about **${moneyW(costB)}**.\n\n**Verdict:** ${money(costB)} is ${take ? "less than" : "more than"} ${money(costA)}, so taking the discount is **${YN(take)}**.`;
      return finish(`A distribution centre buys **${item}** at **${money(P)}** a unit, **${commas(D)} units** a year, used steadily. Each order costs **${money(S)}** to place. Holding one unit for a year costs **${pct}%** of its unit price. ${eoqRule}. The supplier offers **${x}% off** the unit price on every unit if each order is for at least **${commas(M)} units**. Yearly total cost = purchases + ordering + holding, where holding is half the order size times the holding cost per unit.`,
        parts, ex, "lgm-eoq4", { tier, D, S, P, pct, x, M }, [["_D", D], ["_order", S], ["_price", P], ["_hold", pct], ["_disc", x], ["_min", M]],
        ["Holding cost first, then the order quantity.", "Two full yearly totals, one at each price and order size, then compare."]);
    }
    const H = rng.pick(H_LIST), Q = 10 * rng.int(4, 60);
    const D = (Q * Q * H) / (2 * S);
    if (Math.abs(D - Math.round(D)) > 1e-7 || Math.round(D) % 10 !== 0 || D < 400 || D > 25000) continue;
    const tc = Q * H; // at the EOQ ordering cost = holding cost = Q H / 2
    const ordC = (D * S) / Q, holdC = (Q * H) / 2;
    if (!isEx(ordC, 2) || !isEx(tc, 2)) continue;
    const base = `A warehouse uses **${commas(D)} units** of **${item}** a year, steadily. Each order costs **${money(S)}** to place, and holding one unit for a year costs **${money(H)}**. ${eoqRule}.`;
    const exEoq = `**EOQ:** √(2 × ${commas(D)} × ${S} ÷ ${f(H)}) = √${commas(Q * Q)} = **${commas(Q)} units**.`;
    const given = [["_D", D], ["_order", S], ["_hold", H]];
    const costTxt = `**Annual cost:** ordering ${commas(D)} ÷ ${commas(Q)} × ${S} = ${money(ordC)}; holding ${commas(Q)} ÷ 2 × ${f(H)} = ${money(holdC)}; total **${money(tc)}**.`;
    if (tier === "medium") {
      const parts = [
        numPart("eoq", "EOQ", "Economic order quantity (units)", Q, 0, "Multiply two, the yearly demand and the cost per order, divide by the holding cost, and take the square root."),
        numPart("tc", "Yearly cost", "Total yearly cost of ordering and holding at that order size ($)", tc, 2, "Orders a year = demand ÷ order size, each costing the order cost. Holding = half the order size times the holding cost per unit."),
      ];
      return finish(base, parts, `${exEoq}\n\n${costTxt}`, "lgm-eoq1", { tier, D, S, H }, given,
        ["Put the figures in the formula, then the square root.", "Ordering cost plus holding cost at that size."]);
    }
    if (tier === "hard") {
      const N = D / Q;
      if (!isEx(N, 1)) continue;
      const parts = [
        numPart("eoq", "EOQ", "Economic order quantity (units)", Q, 0, "Multiply two, the yearly demand and the cost per order, divide by the holding cost, and take the square root."),
        numPart("n", "Orders per year", "Orders placed per year at the EOQ", N, 1, "Yearly demand divided by the order size."),
        numPart("tc", "Yearly cost", "Total yearly cost of ordering and holding at the EOQ ($)", tc, 2, "Ordering cost = orders a year times the cost per order. Holding = half the order size times the holding cost per unit."),
      ];
      return finish(base, parts, `${exEoq}\n\n**Orders:** ${commas(D)} ÷ ${commas(Q)} = **${f(N)}** a year.\n\n${costTxt}`, "lgm-eoq2", { tier, D, S, H }, given,
        ["EOQ first, then how many orders that means.", "Add the ordering and holding costs."]);
    }
    // expert: the supplier ships whole cases, so the order is rounded up
    const c = rng.pick([12, 20, 24, 25, 40, 48, 50, 60]);
    if (!fracOk(Q / c)) continue;
    const Qb = cdiv(Q, c) * c;
    const tcb = (D * S) / Qb + (Qb * H) / 2;
    if (!isEx(tcb, 2) || Math.abs(tcb - tc) < 0.5) continue;
    const extra = tcb - tc;
    const parts = [
      numPart("eoq", "EOQ", "Economic order quantity (units)", Q, 0, "Multiply two, the yearly demand and the cost per order, divide by the holding cost, and take the square root."),
      numPart("size", "Order size in cases", `Order size when rounded up to a whole number of cases of ${c} (units)`, Qb, 0, "Divide the EOQ by the case size, round up to a whole case, and turn the cases back into units."),
      numPart("tcb", "Cost at that size", "Total yearly cost of ordering and holding at that rounded order size ($)", tcb, 2, "Same cost method as before, but with the rounded order size in both the number of orders and the average stock."),
      numPart("extra", "Extra cost", "How much more per year that costs than ordering the exact EOQ ($)", extra, 2, "Take the cost at the exact EOQ from the cost at the rounded size. Both costs divide exactly into cents here."),
    ];
    const ex = `${exEoq}\n\n**Cases:** ${commas(Q)} ÷ ${c} = ${f(roundTo(Q / c, 2))}, round up to ${cdiv(Q, c)} cases = **${commas(Qb)} units**.\n\n**Cost at that size:** ordering ${commas(D)} ÷ ${commas(Qb)} × ${S} = ${money((D * S) / Qb)}; holding ${commas(Qb)} ÷ 2 × ${f(H)} = ${money((Qb * H) / 2)}; total **${money(tcb)}**.\n\n**Extra:** at the exact EOQ the cost is ${money(tc)}, so ${money(tcb)} − ${money(tc)} = **${money(extra)}**.`;
    return finish(`${base} The supplier ships only whole cases of **${c} units**, so every order is rounded up to a whole number of cases.`,
      parts, ex, "lgm-eoq3", { tier, D, S, H, c }, [...given, ["_case", c]],
      ["Find the exact EOQ, then the next whole case at or above it.", "Cost the rounded size the same way, then compare with the cost at the exact EOQ."]);
  }
  return tooMany();
}

// ---------- safety-stock ----------

const GOODS = ["bottled water", "printer paper", "cleaning wipes", "batteries", "plastic crates", "gloves", "tinned beans", "light bulbs"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const ssRule = (s) => `Safety stock = (highest daily demand − average daily demand) × (lead time + **${s}** extra day${s === 1 ? "" : "s"} for late deliveries). Reorder point = average daily demand × lead time + safety stock.`;
const tableText = (tab) => tab.map((v, k) => `${DAYS[k]} **${v}**`).join(", ");

function drawTable(rng) {
  const base = rng.pick([40, 50, 60, 80, 100, 120, 150, 200]);
  const spread = Math.max(8, Math.round(base * 0.25));
  const tab = Array.from({ length: 5 }, () => base + rng.int(-spread, spread));
  const sum = tab.reduce((s, x) => s + x, 0), mx = Math.max(...tab);
  const avgT = sum * 2, gapT = mx * 10 - avgT; // tenths
  return { tab, sum, mx, avgT, gapT };
}

function genSafety(rng, tier) {
  const wantYes = rng.next() < 0.5, wantCheap = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const good = rng.pick(GOODS), { tab, mx, avgT, gapT } = drawTable(rng);
    if (gapT < 40 || avgT < 200) continue;
    const L = rng.int(2, 8), s = rng.pick([1, 2]);
    const avg = avgT / 10;
    const given = [...tab.map((v, k) => [`_${DAYS[k].toLowerCase()}`, v]), ["_lead", L], ["_extra", s]];
    if (tier === "expert-plus") {
      const dL = rng.int(3, 9), LB = L + dL; // supplier A lead L, supplier B (cheaper, slower) lead LB
      const h = rng.pick([2, 2.5, 3, 4, 5, 6, 8, 10]), dlt = rng.pick([0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08]);
      const extraT = gapT * dL, extra = extraT / 10; // extra safety stock units (1 dp)
      const D = 25 * avgT; // 250 trading days x average day
      const xc = extra * h, sv = dlt * D;
      if (!isEx(xc, 2) || !isEx(sv, 2) || Math.abs(sv - xc) < Math.max(20, 0.1 * Math.max(sv, xc))) continue;
      const cheapOk = sv > xc;
      if (cheapOk !== wantCheap) continue;
      const fastLabel = rng.next() < 0.5 ? "A" : "B", slowLabel = fastLabel === "A" ? "B" : "A";
      const parts = [
        numPart("units", "Extra safety stock", `Extra units of safety stock the slower supplier (${slowLabel}) needs compared with the faster one (${fastLabel})`, extra, 1, "Safety stock grows with the lead time plus the extra days. Only the lead time differs, so the extra is the gap between the busiest and an average day times the extra lead days."),
        numPart("hold", "Extra holding cost", "Yearly cost of holding that extra safety stock ($)", xc, 2, "Extra units times the yearly holding cost per unit."),
        numPart("save", "Yearly saving", `Yearly saving from the slower supplier's lower unit price ($)`, sv, 2, "The price gap per unit times the yearly demand: the stated number of trading days times the average daily demand."),
        yesNo("ok", "Cheaper supplier better?", `Is the slower, cheaper supplier (${slowLabel}) the lower-cost choice once the extra safety stock is paid for?`, cheapOk, "Compare the yearly saving with the yearly cost of the extra safety stock."),
      ];
      const ex = `**Average day:** (${tab.join(" + ")}) ÷ 5 = ${f(avg)}; the busiest day is ${mx}, a gap of ${f(gapT / 10)}.\n\n**Extra safety stock:** supplier ${slowLabel} is ${dL} days slower, so ${f(gapT / 10)} × ${dL} = **${f(extra)} units**.\n\n**Holding the extra:** ${f(extra)} × ${money(h)} = **${money(xc)}**.\n\n**Saving:** 250 × ${f(avg)} = ${commas(D)} units a year; ${commas(D)} × ${money(dlt)} = **${money(sv)}**.\n\n**Verdict:** a saving of ${money(sv)} is ${cheapOk ? "more than" : "less than"} ${money(xc)}, so supplier ${slowLabel} is the lower-cost choice: **${YN(cheapOk)}**.`;
      const lf = L, ls = LB;
      return finish(`A store sells **${good}**. Daily demand over the last five days: ${tableText(tab)} units. Two suppliers deliver the same product. Supplier **${fastLabel}** has a lead time of **${lf} days**, and supplier **${slowLabel}** has a lead time of **${ls} days** but charges **${money(dlt)}** less per unit. ${ssRule(s)} The safety stock is computed separately for each supplier's lead time. Assume **250 trading days** a year, and holding one unit for a year costs **${money(h)}**.`,
        parts, ex, "lgm-ss4", { tier, tab, L, LB, s, h, dlt, slow: slowLabel }, [...tab.map((v, k) => [`_${DAYS[k].toLowerCase()}`, v]), ["_leadfast", lf], ["_leadslow", ls]],
        ["Only the lead times differ between the two suppliers.", "Set the yearly holding cost of the extra stock against the yearly saving on price."]);
    }
    const ssT = gapT * (L + s), ss = ssT / 10, dlT = avgT * L, ropT = dlT + ssT;
    if (ropT % 10 === 0) continue;
    const rop = Math.ceil(ropT / 10 - 1e-9);
    const prompt = `A store sells **${good}**. Daily demand over the last five days: ${tableText(tab)} units. The supplier's lead time is **${L} days**. ${ssRule(s)}`;
    const exAvg = `**Average day:** (${tab.join(" + ")}) ÷ 5 = **${f(avg)}** units. The busiest day is ${mx}, a gap of ${f(gapT / 10)}.`;
    const exSs = `**Safety stock:** ${f(gapT / 10)} × (${L} + ${s}) = **${f(ss)}** units.`;
    const exRop = `**Reorder point:** ${f(avg)} × ${L} + ${f(ss)} = ${f(ropT / 10)}, round up to **${rop}** units.`;
    const pAvg = numPart("avg", "Average day", "Average daily demand (units)", avg, 1, "Add the five days and divide by five.");
    const pSs = numPart("ss", "Safety stock", "Safety stock (units)", ss, 1, "Busiest day minus the average day, times the lead time plus the extra days.");
    if (tier === "medium") return finish(prompt, [pAvg, pSs], `${exAvg}\n\n${exSs}`, "lgm-ss1", { tier, tab, L, s }, given,
      ["Average first, then the gap to the busiest day.", "Lead time plus the extra days is the number of days to cover."]);
    const pRop = numPart("rop", "Reorder point", "Reorder point (round up to a whole unit)", rop, 0, "Demand expected during the lead time plus the safety stock. A part-unit cannot be ordered, so round up.");
    if (tier === "hard") return finish(prompt, [pAvg, pSs, pRop], `${exAvg}\n\n${exSs}\n\n${exRop}`, "lgm-ss2", { tier, tab, L, s }, given,
      ["Average, then safety stock, then demand during the lead time.", "The reorder point rounds up."]);
    // expert: reorder now?
    const gap = rng.int(3, 25), onHand = wantYes ? rop - gap : rop + gap;
    if (onHand < 1) continue;
    const yes = onHand <= rop;
    const parts = [pAvg, pSs, pRop, yesNo("now", "Reorder now?", `The shelf holds **${onHand} units** now. The rule is to reorder when stock on hand is at or below the reorder point. Should an order be placed today?`, yes, "Compare the units on hand with the reorder point you found.")];
    return finish(prompt, parts, `${exAvg}\n\n${exSs}\n\n${exRop}\n\n**Decision:** ${onHand} is ${yes ? "at or below" : "above"} ${rop}, so reorder now: **${YN(yes)}**.`,
      "lgm-ss3", { tier, tab, L, s, onHand }, [...given.slice(0, 7), ["_onhand", onHand]].slice(0, 8),
      ["Three steps to the reorder point, then one comparison.", "At or below the reorder point means order."]);
  }
  return tooMany();
}

// ---------- landed-cost ----------

const PRODUCTS = ["ceramic mugs", "phone cases", "steel brackets", "garden gloves", "LED lamps", "yoga mats", "water bottles", "storage boxes"];
const P_LIST = [2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8, 9, 10, 12, 15, 18, 20, 24, 25, 30];
const D_LIST = [3, 5, 8, 10, 12, 15];
const dutyRule = (cif) => (cif ? "Import duty is charged as a percentage of the goods value **plus freight**." : "Import duty is charged as a percentage of the goods value only (not freight).");

// All money in whole cents so every division is exact. Offer: Pc = FOB cents per unit, d = duty %, F = freight dollars.
function landedC(Q, Pc, d, F, cif) {
  const base = cif ? Q * Pc + F * 100 : Q * Pc;
  const duty = (base * d) / 100;
  return { duty, total: Q * Pc + F * 100 + duty };
}
function drawOffer(rng, Q, cif, near) {
  const Pc = near ? Math.round((near * rng.pick([0.82, 0.88, 0.92, 0.97, 1.03, 1.08, 1.14, 1.2])) / 5) * 5 : Math.round(rng.pick(P_LIST) * 100);
  const d = rng.pick(D_LIST), F = 25 * rng.int(4, 100);
  const { duty, total } = landedC(Q, Pc, d, F, cif);
  if (!Number.isInteger(duty) || !Number.isInteger(total) || total % Q !== 0) return null;
  return { Pc, d, F, duty, total, per: total / Q };
}

function genLanded(rng, tier) {
  const wantA = rng.next() < 0.5, pattern = rng.pick(["FF", "SS", "SF"]);
  for (let i = 0; i < TRY; i++) {
    const prod = rng.pick(PRODUCTS), Q = 100 * rng.int(2, 40);
    if (tier === "medium") {
      const a = drawOffer(rng, Q, false, 0);
      if (!a || a.per < 150) continue;
      const parts = [
        numPart("duty", "Import duty", "Import duty payable on the order ($)", a.duty / 100, 2, "Duty is a percentage of the goods value: unit price times the number of units, times the duty rate."),
        numPart("per", "Landed cost per unit", "Landed cost per unit: goods, duty and freight together ($)", a.per / 100, 2, "Add the goods value, the duty and the freight, then divide by the number of units."),
      ];
      const ex = `**Goods:** ${commas(Q)} × ${money(cents(a.Pc))} = ${money(cents(Q * a.Pc))}.\n\n**Duty:** ${a.d}% of ${money(cents(Q * a.Pc))} = **${money(cents(a.duty))}**.\n\n**Landed cost:** ${money(cents(Q * a.Pc))} + ${money(cents(a.duty))} + ${money(a.F)} freight = ${money(cents(a.total))}, and ÷ ${commas(Q)} = **${money(cents(a.per))}** per unit.`;
      return finish(`A retailer imports **${commas(Q)} ${prod}** at **${money(cents(a.Pc))}** each. Freight for the whole order is **${money(a.F)}**. Duty is **${a.d}%**. ${dutyRule(false)} Landed cost is everything paid to get the goods to the warehouse.`,
        parts, ex, "lgm-lnd1", { tier, Q, Pc: a.Pc, d: a.d, F: a.F }, [["_units", Q], ["_price", cents(a.Pc)], ["_duty", a.d], ["_freight", a.F]],
        ["Duty first, from the goods value.", "Everything paid, divided by the units."]);
    }
    if (tier === "hard" || tier === "expert") {
      const a = drawOffer(rng, Q, false, 0);
      if (!a) continue;
      const b = drawOffer(rng, Q, false, a.Pc);
      if (!b) continue;
      const gap = Math.abs(a.per - b.per);
      if (gap < 5 || gap > 0.15 * Math.min(a.per, b.per) || a.per < 150 || b.per < 150) continue;
      const aWins = a.per < b.per;
      if (aWins !== wantA) continue;
      const win = aWins ? "Supplier A" : "Supplier B", lo = Math.min(a.per, b.per);
      const exA = `**Supplier A:** goods ${money(cents(Q * a.Pc))}, duty ${a.d}% = ${money(cents(a.duty))}, freight ${money(a.F)}: total ${money(cents(a.total))}, ÷ ${commas(Q)} = **${money(cents(a.per))}** per unit.`;
      const exB = `**Supplier B:** goods ${money(cents(Q * b.Pc))}, duty ${b.d}% = ${money(cents(b.duty))}, freight ${money(b.F)}: total ${money(cents(b.total))}, ÷ ${commas(Q)} = **${money(cents(b.per))}** per unit.`;
      const parts = [
        numPart("a", "Landed cost A", "Landed cost per unit from supplier A ($)", a.per / 100, 2, "Goods value plus duty on the goods value plus freight, divided by the units."),
        numPart("b", "Landed cost B", "Landed cost per unit from supplier B ($)", b.per / 100, 2, "Same method for supplier B: its own price, its own duty rate, its own freight."),
        pickPart(rng, "win", "Cheaper supplier", "Which supplier has the lower landed cost per unit?", "Supplier A", "Supplier B", win, "Compare the two landed costs per unit, not the unit prices."),
      ];
      const given = [["_units", Q], ["_priceA", cents(a.Pc)], ["_dutyA", a.d], ["_freightA", a.F], ["_priceB", cents(b.Pc)], ["_dutyB", b.d], ["_freightB", b.F]];
      let ex = `${exA}\n\n${exB}\n\n**Cheaper:** ${win}, by ${money(cents(gap))} a unit.`;
      let kind = "lgm-lnd2";
      if (tier === "expert") {
        parts.push(numPart("save", "Saving on the order", "Total saved on the whole order by using the cheaper supplier ($)", (gap * Q) / 100, 2, "The gap between the two landed costs per unit, times the units."));
        ex += `\n\n**Saving:** ${money(cents(gap))} × ${commas(Q)} = **${money(cents(gap * Q))}**.`;
        kind = "lgm-lnd3";
      }
      return finish(`A retailer wants **${commas(Q)} ${prod}** and has two offers. **Supplier A:** **${money(cents(a.Pc))}** each, freight **${money(a.F)}** for the order, duty **${a.d}%**. **Supplier B:** **${money(cents(b.Pc))}** each, freight **${money(b.F)}**, duty **${b.d}%**. ${dutyRule(false)}`,
        parts, ex, kind, { tier, Q, A: [a.Pc, a.d, a.F], B: [b.Pc, b.d, b.F] }, given,
        ["Work out each offer in full before comparing.", tier === "expert" ? "The saving is the gap per unit times the order size." : "Landed cost includes duty and freight, so the cheaper price may not win."]);
    }
    // expert-plus: duty on goods + freight (CIF), a delay cost per day, and two verdicts
    const fastIsA = rng.next() < 0.5, F_ = fastIsA ? "A" : "B", S_ = fastIsA ? "B" : "A";
    const offA = drawOffer(rng, Q, true, 0);
    if (!offA) continue;
    const offB = drawOffer(rng, Q, true, offA.Pc);
    if (!offB) continue;
    const fast = fastIsA ? offA : offB, slow = fastIsA ? offB : offA;
    const Lf = rng.int(3, 10), Ls = Lf + rng.int(10, 35), c = rng.pick([1, 2, 3, 5]);
    const adjF = fast.per + c * Lf, adjS = slow.per + c * Ls;
    const landedFastWins = fast.per < slow.per, adjFastWins = adjF < adjS;
    const pat = landedFastWins && adjFastWins ? "FF" : !landedFastWins && !adjFastWins ? "SS" : !landedFastWins && adjFastWins ? "SF" : "FS";
    if (pat !== pattern || Math.abs(fast.per - slow.per) < 3 || Math.abs(adjF - adjS) < 3 || offA.per < 150 || offB.per < 150) continue;
    if (Math.abs(fast.per - slow.per) > 0.2 * Math.min(fast.per, slow.per)) continue;
    const lw = landedFastWins ? `Supplier ${F_}` : `Supplier ${S_}`, aw = adjFastWins ? `Supplier ${F_}` : `Supplier ${S_}`;
    const names = ["Supplier A", "Supplier B"];
    const parts = [
      numPart("a", "Landed cost A", "Landed cost per unit from supplier A, with duty on goods plus freight ($)", offA.per / 100, 2, "Duty is charged on the goods value plus the freight. Add goods, freight and duty, then divide by the units."),
      numPart("b", "Landed cost B", "Landed cost per unit from supplier B, with duty on goods plus freight ($)", offB.per / 100, 2, "Same method for supplier B."),
      numPart("adj", "Delay-adjusted cost", `Delay-adjusted cost per unit for the slower supplier (${S_}) ($)`, (slow.per + c * Ls) / 100, 2, "Landed cost per unit plus the delay cost per unit for each day of its lead time."),
      segPart2(rng, "verdict", "Verdicts", "Which supplier is cheaper per unit on landed cost alone, and which is cheaper once the delay cost is added to both?",
        ["Landed cost", "With delay cost"], names, names, [lw, aw], "Compare the two landed costs first, then add the delay cost for each supplier's own lead time and compare again."),
    ];
    const mk = (nm, o, L) => `**Supplier ${nm}:** goods ${money(cents(Q * o.Pc))} + freight ${money(o.F)} = ${money(cents(Q * o.Pc + o.F * 100))}; duty ${o.d}% of that = ${money(cents(o.duty))}; total ${money(cents(o.total))}, ÷ ${commas(Q)} = **${money(cents(o.per))}** per unit. With ${L} days at ${money(cents(c))}: ${money(cents(o.per + c * L))}.`;
    const ex = `${mk("A", offA, fastIsA ? Lf : Ls)}\n\n${mk("B", offB, fastIsA ? Ls : Lf)}\n\n**Verdicts:** landed cost alone favours **${lw}**; with the delay cost it is **${aw}**.`;
    const given = [["_units", Q], ["_priceA", cents(offA.Pc)], ["_dutyA", offA.d], ["_freightA", offA.F], ["_priceB", cents(offB.Pc)], ["_dutyB", offB.d], ["_freightB", offB.F], ["_delay", cents(c)]];
    return finish(`A retailer wants **${commas(Q)} ${prod}**. **Supplier A:** **${money(cents(offA.Pc))}** each, freight **${money(offA.F)}**, duty **${offA.d}%**, lead time **${fastIsA ? Lf : Ls} days**. **Supplier B:** **${money(cents(offB.Pc))}** each, freight **${money(offB.F)}**, duty **${offB.d}%**, lead time **${fastIsA ? Ls : Lf} days**. ${dutyRule(true)} For this exercise, every day of lead time adds **${money(cents(c))}** per unit for tied-up money and lost sales.`,
      parts, ex, "lgm-lnd4", { tier, Q, A: [offA.Pc, offA.d, offA.F], B: [offB.Pc, offB.d, offB.F], LA: fastIsA ? Lf : Ls, LB: fastIsA ? Ls : Lf, c, slow: S_ }, given,
      ["Duty covers goods and freight together this time.", "Add the delay cost for each supplier's own lead time before the second comparison."]);
  }
  return tooMany();
}

// ---------- pallet-dock ----------

const CARTONS = ["kettles", "tinned tomatoes", "paper reams", "breakfast cereal", "floor tiles", "sauce bottles", "toys", "tool kits"];
const PAL_L = 120, PAL_W = 100;

function drawCarton(rng) {
  const l = rng.pick([30, 35, 40, 45, 50, 55, 60]), w = rng.pick([20, 25, 30, 35, 40, 45, 50]), h = rng.pick([15, 20, 25, 30, 35]);
  const Hm = rng.pick([120, 130, 140, 150, 160]);
  const perLayer = Math.floor(PAL_L / l) * Math.floor(PAL_W / w), layers = Math.floor(Hm / h);
  if (perLayer < 4 || layers < 2 || (PAL_L % l === 0 && PAL_W % w === 0 && Hm % h === 0)) return null;
  return { l, w, h, Hm, perLayer, layers, pp: perLayer * layers };
}
const palletRule = (c) => `A pallet is **${PAL_L} cm × ${PAL_W} cm** and can be stacked up to **${c.Hm} cm** high (the pallet's own height is already allowed for). Cartons all stay the same way up and the same way round, with their length along the ${PAL_L} cm side and their width along the ${PAL_W} cm side, with no gaps and no overhang. Only whole cartons fit.`;

function genPallet(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const item = rng.pick(CARTONS);
    if (tier === "expert-plus") {
      const T = rng.int(6, 30), p = rng.pick([12, 16, 18, 20, 22, 24, 26, 28]), Dd = rng.int(2, 8), r = rng.pick([4, 5, 6, 8, 10, 12]), H = rng.pick([6, 7, 8, 10]);
      const total = T * p, hours = total / (Dd * r), need = total / (r * H);
      if (!fracOk(need) || need > 12 || nearHalf(hours, 1, 0.1)) continue;
      const needC = Math.ceil(need);
      const K = wantYes ? needC + rng.pick([0, 1]) : needC - rng.pick([1, 2]);
      if (K < 1) continue;
      const ok = K >= needC;
      if (ok !== wantYes) continue;
      const parts = [
        numPart("total", "Total pallets", "Total pallets arriving", total, 0, "Trucks times pallets on each truck."),
        numPart("hours", "Hours with current doors", "Hours the current doors need to unload everything", hours, 1, "Total pallets divided by the pallets per hour that all the doors manage together."),
        numPart("doors", "Doors needed", "Fewest doors that finish within the shift (round up)", needC, 0, "Total pallets divided by what one door unloads in the whole shift. A part-door cannot be opened, so round up."),
        yesNo("ok", "Proposal enough?", `The planner proposes using **${K} door${K === 1 ? "" : "s"}**. Will all the pallets be unloaded within the shift?`, ok, "Compare the proposed number of doors with the fewest doors that finish in time."),
      ];
      const ex = `**Total:** ${T} × ${p} = **${commas(total)} pallets**.\n\n**Hours:** ${Dd} doors × ${r} pallets an hour = ${Dd * r} pallets an hour, so ${commas(total)} ÷ ${Dd * r} = ${f(roundTo(hours, 2))}, about **${roundTo(hours, 1).toFixed(1)} h**.\n\n**Doors needed:** one door unloads ${r} × ${H} = ${r * H} pallets in the shift, so ${commas(total)} ÷ ${r * H} = ${f(roundTo(need, 2))}, round up to **${needC}** doors.\n\n**Proposal:** ${K} door${K === 1 ? " is" : "s are"} ${ok ? "at least" : "fewer than"} ${needC}: **${YN(ok)}**.`;
      return finish(`A cross-dock receives **${T} trucks** of **${item}**, each carrying **${p} pallets**. Each dock door unloads **${r} pallets an hour** without a break, and the site currently opens **${Dd} doors**. All pallets must be unloaded within a shift of **${H} hours**; the trucks are waiting and all doors start together.`,
        parts, ex, "lgm-pal4", { tier, T, p, D: Dd, r, H, K }, [["_trucks", T], ["_perTruck", p], ["_doors", Dd], ["_rate", r], ["_shift", H], ["_proposed", K]],
        ["Total first, then the speed of all the doors together.", "Doors needed come from the whole shift, not the hours you just found."]);
    }
    const cr = drawCarton(rng);
    if (!cr) continue;
    const pp = cr.pp, prompt0 = `Cartons of **${item}** measure **${cr.l} × ${cr.w} × ${cr.h} cm** (length × width × height). ${palletRule(cr)}`;
    const givenC = [["_cl", cr.l], ["_cw", cr.w], ["_ch", cr.h], ["_maxh", cr.Hm]];
    const exLayer = `**Per layer:** ${PAL_L} ÷ ${cr.l} = ${f(roundTo(PAL_L / cr.l, 2))}, so ${Math.floor(PAL_L / cr.l)} along the length; ${PAL_W} ÷ ${cr.w} = ${f(roundTo(PAL_W / cr.w, 2))}, so ${Math.floor(PAL_W / cr.w)} across; ${Math.floor(PAL_L / cr.l)} × ${Math.floor(PAL_W / cr.w)} = **${cr.perLayer}** cartons.`;
    const exPal = `**Per pallet:** ${cr.Hm} ÷ ${cr.h} = ${f(roundTo(cr.Hm / cr.h, 2))}, so ${cr.layers} layers; ${cr.perLayer} × ${cr.layers} = **${pp}** cartons.`;
    const pLayer = numPart("layer", "Cartons per layer", "Cartons in one layer (whole cartons)", cr.perLayer, 0, "How many fit along each side of the pallet, rounded down: multiply the two counts.");
    const pPal = numPart("pal", "Cartons per pallet", "Cartons on a full pallet", pp, 0, "Layers fit up to the height limit, rounded down. Multiply the layers by the cartons in a layer.");
    if (tier === "medium") {
      const N = rng.int(2 * pp, 14 * pp);
      if (!fracOk(N / pp)) continue;
      const pals = Math.ceil(N / pp);
      const parts = [pPal, numPart("pals", "Pallets needed", `Pallets needed for an order of ${commas(N)} cartons (round up)`, pals, 0, "Divide the cartons ordered by the cartons per pallet, and round up: a part-pallet still takes a pallet.")];
      return finish(`${prompt0} An order is **${commas(N)} cartons**.`, parts, `${exLayer}\n\n${exPal}\n\n**Pallets:** ${commas(N)} ÷ ${pp} = ${f(roundTo(N / pp, 2))}, round up to **${pals}**.`, "lgm-pal1", { tier, ...dimOf(cr), N }, [...givenC, ["_cartons", N]],
        ["Work out the cartons on a pallet first.", "Pallets round up."]);
    }
    if (tier === "hard") {
      const N = rng.int(2 * pp, 14 * pp);
      if (!fracOk(N / pp)) continue;
      const pals = Math.ceil(N / pp);
      const parts = [pLayer, pPal, numPart("pals", "Pallets needed", `Pallets needed for an order of ${commas(N)} cartons (round up)`, pals, 0, "Divide the cartons ordered by the cartons per pallet, and round up.")];
      return finish(`${prompt0} An order is **${commas(N)} cartons**.`, parts, `${exLayer}\n\n${exPal}\n\n**Pallets:** ${commas(N)} ÷ ${pp} = ${f(roundTo(N / pp, 2))}, round up to **${pals}**.`, "lgm-pal2", { tier, ...dimOf(cr), N }, [...givenC, ["_cartons", N]],
        ["Layer, then pallet, then the order.", "Pallets round up."]);
    }
    // expert: trailers and utilisation
    const capT = rng.pick([20, 24, 26, 28, 30]), np = rng.int(capT + 2, 4 * capT);
    const extra = rng.int(1, pp - 1), N = (np - 1) * pp + extra;
    if (!fracOk(N / pp) || Math.ceil(N / pp) !== np || !fracOk(np / capT)) continue;
    const trailers = Math.ceil(np / capT), util = (np / (trailers * capT)) * 100;
    if (nearHalf(util, 1, 0.1)) continue;
    const parts = [pPal,
      numPart("pals", "Pallets needed", `Pallets needed for ${commas(N)} cartons (round up)`, np, 0, "Cartons ordered divided by cartons per pallet, rounded up."),
      numPart("trailers", "Trailers", `Trailers needed if each takes ${capT} pallets (round up)`, trailers, 0, "Pallets divided by the pallets one trailer takes, rounded up."),
      numPart("util", "Space used", "Share of the trailers' pallet spaces that is filled (%)", util, 1, "Pallets divided by the total spaces on all the trailers, as a percentage."),
    ];
    return finish(`${prompt0} An order is **${commas(N)} cartons**, shipped on trailers that each take **${capT} pallets**.`, parts,
      `${exLayer}\n\n${exPal}\n\n**Pallets:** ${commas(N)} ÷ ${pp} = ${f(roundTo(N / pp, 2))}, round up to **${np}**.\n\n**Trailers:** ${np} ÷ ${capT} = ${f(roundTo(np / capT, 2))}, round up to **${trailers}**.\n\n**Space used:** ${np} ÷ (${trailers} × ${capT}) × 100 = **${roundTo(util, 1).toFixed(1)}%**.`,
      "lgm-pal3", { tier, ...dimOf(cr), N, capT }, [...givenC, ["_cartons", N], ["_spaces", capT]],
      ["Cartons per pallet, pallets, then trailers.", "Space used compares pallets with the spaces you pay for."]);
  }
  return tooMany();
}
const dimOf = (c) => ({ l: c.l, w: c.w, h: c.h, Hm: c.Hm });

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "order-quantity") return genEoq(rng, difficulty);
  if (subtopic === "safety-stock") return genSafety(rng, difficulty);
  if (subtopic === "landed-cost") return genLanded(rng, difficulty);
  if (subtopic === "pallet-dock") return genPallet(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (EOQ found by scanning whole order
// sizes for the cheapest total cost, safety stock from the largest deviation, landed cost from a per-unit
// build-up, pallets by counting what fits, doors by trying one more door at a time). Numbers are compared
// with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const sum = (a) => a.reduce((s, x) => s + x, 0);

function scanEoq(D, S, H) { // cheapest whole order size by trying them all
  let best = 1, bc = Infinity;
  for (let q = 1; q <= 6000; q++) { const c = (D / q) * S + (q / 2) * H; if (c < bc - 1e-12) { bc = c; best = q; } }
  return { q: best, tc: bc };
}
const fitCount = (len, size) => { let n = 0, used = 0; while (used + size <= len) { used += size; n++; } return n; };
const upTo = (target, unit) => { let k = 0; while (k * unit < target - 1e-9) k++; return k; };
const perUnitLanded = (Q, Pc, d, F, cif) => {
  const g = Pc / 100, fr = F / Q;
  return cif ? (g + fr) * (1 + d / 100) : g * (1 + d / 100) + fr;
};
const SS = (p) => { // shared safety-stock numbers, from the largest deviation
  const avg = sum(p.tab) / p.tab.length, dev = Math.max(...p.tab.map((x) => x - avg));
  return { avg, dev };
};

const ALT = {
  "lgm-eoq1": (p) => { const s = scanEoq(p.D, p.S, p.H); return { eoq: s.q, tc: s.tc }; },
  "lgm-eoq2": (p) => { const s = scanEoq(p.D, p.S, p.H); return { eoq: s.q, n: p.D / s.q, tc: s.tc }; },
  "lgm-eoq3": (p) => {
    const s = scanEoq(p.D, p.S, p.H), size = upTo(s.q, p.c) * p.c, tcb = (p.D / size) * p.S + (size / 2) * p.H;
    return { eoq: s.q, size, tcb, extra: tcb - s.tc };
  },
  "lgm-eoq4": (p) => {
    const H = (p.pct / 100) * p.P, s = scanEoq(p.D, p.S, H), P2 = p.P * (1 - p.x / 100), H2 = (p.pct / 100) * P2;
    const a = p.D * p.P + s.tc, b = p.D * P2 + (p.D / p.M) * p.S + (p.M / 2) * H2;
    return { eoq: s.q, costa: a, costb: b, take: YN(b < a) };
  },
  "lgm-ss1": (p) => { const { avg, dev } = SS(p); return { avg, ss: dev * (p.L + p.s) }; },
  "lgm-ss2": (p) => { const { avg, dev } = SS(p), ss = dev * (p.L + p.s); return { avg, ss, rop: Math.ceil(avg * p.L + ss - 1e-6) }; },
  "lgm-ss3": (p) => { const { avg, dev } = SS(p), ss = dev * (p.L + p.s), rop = Math.ceil(avg * p.L + ss - 1e-6); return { avg, ss, rop, now: YN(p.onHand <= avg * p.L + ss) }; },
  "lgm-ss4": (p) => {
    const { avg, dev } = SS(p), units = dev * (p.LB - p.L), D = 250 * avg, hold = units * p.h, save = p.dlt * D;
    return { units, hold, save, ok: YN(save > hold) };
  },
  "lgm-lnd1": (p) => ({ duty: (p.Q * (p.Pc / 100) * p.d) / 100, per: perUnitLanded(p.Q, p.Pc, p.d, p.F, false) }),
  "lgm-lnd2": (p) => {
    const a = perUnitLanded(p.Q, ...p.A, false), b = perUnitLanded(p.Q, ...p.B, false);
    return { a, b, win: a < b ? "Supplier A" : "Supplier B" };
  },
  "lgm-lnd3": (p) => {
    const a = perUnitLanded(p.Q, ...p.A, false), b = perUnitLanded(p.Q, ...p.B, false);
    return { a, b, win: a < b ? "Supplier A" : "Supplier B", save: Math.abs(a - b) * p.Q };
  },
  "lgm-lnd4": (p) => {
    const a = perUnitLanded(p.Q, ...p.A, true), b = perUnitLanded(p.Q, ...p.B, true);
    const adjA = a + (p.c / 100) * p.LA, adjB = b + (p.c / 100) * p.LB;
    return { a, b, adj: p.slow === "A" ? adjA : adjB, verdict: `${a < b ? "Supplier A" : "Supplier B"} | ${adjA < adjB ? "Supplier A" : "Supplier B"}` };
  },
  "lgm-pal1": (p) => { const c = palletCount(p); return { pal: c.pp, pals: upTo(p.N, c.pp) }; },
  "lgm-pal2": (p) => { const c = palletCount(p); return { layer: c.layer, pal: c.pp, pals: upTo(p.N, c.pp) }; },
  "lgm-pal3": (p) => {
    const c = palletCount(p), np = upTo(p.N, c.pp), tr = upTo(np, p.capT);
    return { pal: c.pp, pals: np, trailers: tr, util: (np * 100) / (tr * p.capT) };
  },
  "lgm-pal4": (p) => {
    const total = p.T * p.p; let k = 1; while (k * p.r * p.H < total - 1e-9) k++;
    return { total, hours: total / (p.D * p.r), doors: k, ok: YN(p.K >= k) };
  },
};
function palletCount(p) {
  const layer = fitCount(PAL_L, p.l) * fitCount(PAL_W, p.w), layers = fitCount(p.Hm, p.h);
  return { layer, pp: layer * layers };
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
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
