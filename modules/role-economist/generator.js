// Economist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Chained answers are computed from exact inputs; draws are redone when working from an earlier
// rounded answer would change a later one, and no answer sits on a rounding half-step.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   inflation-real      price index -> inflation % -> real wage -> better/worse off     (Macroeconomist)
//   growth-doubling     compound GDP -> GDP per person -> per-person growth -> doubling (Macroeconomist)
//   elasticity-revenue  midpoint elasticity -> revenue change -> pricing call           (Market Analyst)
//   tax-incidence       linear curves -> price after a tax -> revenue -> burden share   (Market Analyst)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? "" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-economist: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => `$${commas(n)}`;
const cf = (n) => (n === 1 ? "" : n);
const signed = (n) => (n > 0 ? `+${n}` : String(n));

function numPart(id, label, ask, val, dp, hint) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
function choicePart(id, label, ask, choices, ans, hint) {
  return { id, label, ask, answerType: "choice", answer: ans, choices, hint };
}
function segPart(id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- inflation-real ----------

function genInfl(rng, tier) {
  if (tier === "expert-plus") return genInflBack(rng);
  // Hard and Expert ask "better or worse off?": decide it once, before the redraw loop, so it stays about even.
  const wantBetter = tier === "hard" || tier === "expert" ? rng.next() < 0.5 : null;
  for (let i = 0; i < TRY; i++) {
    const I0 = rng.pick([100, 104, 108, 110, 112, 115, 120, 125, 130]);
    const I1 = I0 + rng.int(2, 14);
    const W0 = 500 * rng.int(40, 120);
    const gw = rng.int(1, 9);
    const W1 = (W0 * (100 + gw)) / 100;
    const infl = ((I1 - I0) / I0) * 100;
    const real0 = (W0 * 100) / I0, real1 = (W1 * 100) / I1;
    const rwc = (real1 / real0 - 1) * 100;
    if (nearHalf(infl, 1, 0.08) || nearHalf(rwc, 1, 0.08) || nearHalf(real1, 2, 0.08) || Math.abs(rwc) < 0.4) continue;
    // chain: working from real wages rounded to 2 dp must not change the rounded change
    if (roundTo((roundTo(real1, 2) / roundTo(real0, 2) - 1) * 100, 1) !== roundTo(rwc, 1)) continue;
    const better = real1 > real0;
    if (wantBetter !== null && better !== wantBetter) continue;
    const n = TIER_PARTS[tier];
    const verdict = choicePart("verdict", "Better or worse off?", "Are workers better or worse off in real terms in Year 1?", ["Better off", "Worse off"], better ? "Better off" : "Worse off", "Compare the real wage in Year 1 with the real wage in Year 0: did it rise or fall?");
    const pInfl = numPart("infl", "Inflation", "Inflation from Year 0 to Year 1 (%)", infl, 1, "Inflation % = (new index − old index) ÷ old index × 100. The index is 100-based, so it is a plain percentage change.");
    const pReal = numPart("real", "Real wage", "Real wage in Year 1 ($, in base-year prices)", real1, 2, `Real wage = nominal wage ÷ index × 100. Use the Year 1 wage and the Year 1 index (${I1}).`);
    const pRwc = numPart("rwc", "Real change", "Change in the real wage from Year 0 to Year 1 (%)", rwc, 1, `Work out the Year 0 real wage the same way (wage ÷ ${I0} × 100), then take the percentage change from it to the Year 1 real wage. Use the unrounded real wages.`);
    const all = tier === "medium" ? [pInfl, pReal] : tier === "hard" ? [pInfl, pRwc, verdict] : [pInfl, pReal, pRwc, verdict];
    const ex = [
      `**Inflation:** (${I1} − ${I0}) ÷ ${I0} × 100 = **${fixed(infl, 1)}%**.`,
      `**Real wage, Year 1:** ${money(W1)} ÷ ${I1} × 100 = **${fixed(real1, 2)}** (and Year 0: ${money(W0)} ÷ ${I0} × 100 = ${fixed(real0, 2)}).`,
      `**Real change:** (${fixed(real1, 2)} − ${fixed(real0, 2)}) ÷ ${fixed(real0, 2)} × 100 = **${fixed(rwc, 1)}%**.`,
      `**Verdict:** the real wage ${better ? "rose" : "fell"}, so workers are **${better ? "Better off" : "Worse off"}**.`,
    ];
    const text = (tier === "medium" ? [ex[0], ex[1]] : tier === "hard" ? [ex[0], ex[2], ex[3]] : ex).join("\n\n");
    return finish(
      `These figures are made up for practice. In Year 0 the consumer price index (CPI) was **${I0}** and the average wage was **${money(W0)}**. In Year 1 the CPI was **${I1}** and the average wage was **${money(W1)}** (a ${gw}% rise). Real wage = nominal wage ÷ CPI × 100, which is the wage in base-year prices.`,
      all.slice(0, n), text, "ec-infl", { tier, I0, I1, W0, W1 }, [["_i0", I0], ["_i1", I1], ["_w0", W0], ["_w1", W1]],
      ["Inflation comes from the two index values; real wages divide each wage by its own index.", "Compare real wages (not nominal ones) to decide who is better off."],
    );
  }
  return tooMany();
}

function genInflBack(rng) {
  const wantAbove = rng.next() < 0.5; // above or within the target, about evenly
  for (let i = 0; i < TRY; i++) {
    const I0 = rng.pick([80, 100, 120, 125, 160, 200, 250]);
    const I1 = I0 + rng.int(3, 18);
    const r = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]);
    const gRaw = ((100 + r) * I1) / I0 - 100; // must be exact to 1 dp
    if (gRaw < 1 || gRaw > 12 || Math.abs(gRaw * 10 - Math.round(gRaw * 10)) > 1e-9) continue;
    const g = roundTo(gRaw, 1); // drop float noise (6.599999… -> 6.6) before it is shown
    const W0 = 500 * rng.int(40, 100);
    const infl = ((I1 - I0) / I0) * 100;
    const T = rng.pick([2, 2.5, 3, 3.5, 4]);
    if (Math.abs(infl - T) < 0.4 || nearHalf(infl, 1, 0.05)) continue;
    const W1 = (W0 * (100 + g)) / 100;
    const real1 = (W1 * 100) / I1, real0 = (W0 * 100) / I0;
    if (nearHalf(real1, 2, 0.08)) continue;
    const higher = real1 > real0, above = infl > T;
    if (above !== wantAbove) continue;
    const parts = [
      numPart("cpi", "Year 1 CPI", "CPI in Year 1 (whole number)", I1, 0, `The real wage changed by ${signed(r)}% while the nominal wage rose by ${g}%, so prices rose by the ratio of the two growth factors. Apply that ratio to the Year 0 index of ${I0}.`),
      numPart("infl", "Inflation", "Inflation from Year 0 to Year 1 (%)", infl, 1, "Percentage change in the CPI from the Year 0 index to the index you just found."),
      numPart("real", "Real wage", "Real wage in Year 1 ($, in base-year prices)", real1, 2, "Real wage = nominal wage ÷ CPI × 100, using the Year 1 nominal wage (Year 0 wage plus the nominal rise) and the Year 1 CPI."),
      segPart("verdict", "Verdict", `Compared with Year 0, is the real wage higher or lower, and is inflation above the central bank's **${T}%** target, or within it (at or below ${T}%)?`, ["Real wage vs Year 0", "Inflation vs target"], ["Higher", "Lower"], ["Above target", "Within target"], [higher ? "Higher" : "Lower", above ? "Above target" : "Within target"],
        "Look at the sign of the real wage change you were given, and compare your inflation figure with the target."),
    ];
    const ex = [
      `**Year 1 CPI:** nominal factor ${fixed(1 + g / 100, 3)} ÷ real factor ${fixed(1 + r / 100, 2)} = price factor ${fixed(I1 / I0, 3)}; ${I0} × ${fixed(I1 / I0, 3)} = **${I1}**.`,
      `**Inflation:** (${I1} − ${I0}) ÷ ${I0} × 100 = **${fixed(infl, 1)}%**.`,
      `**Real wage:** Year 1 wage ${money(roundTo(W1, 2))} ÷ ${I1} × 100 = **${fixed(real1, 2)}** (Year 0: ${fixed(real0, 2)}).`,
      `**Verdict:** real wage **${higher ? "Higher" : "Lower"}**; inflation ${fixed(infl, 1)}% is ${above ? "above" : "within"} the ${T}% target, so **${above ? "Above target" : "Within target"}**.`,
    ].join("\n\n");
    return finish(
      `These figures are made up for practice. The consumer price index (CPI) was **${I0}** in Year 0. From Year 0 to Year 1 the average wage rose from **${money(W0)}** by **${g}%** in nominal terms, and the real wage changed by **${signed(r)}%**. Real wage = nominal wage ÷ CPI × 100.`,
      parts, ex, "ec-inflback", { tier: "expert-plus", I0, I1, W0, g, r, T }, [["_i0", I0], ["_w0", W0], ["_gw", g], ["_rw", r], ["_target", T]],
      ["Prices rise by the nominal growth factor divided by the real growth factor.", "Once you have the Year 1 index, everything else follows from the wage figures."],
    );
  }
  return tooMany();
}

// ---------- elasticity-revenue ----------

const ELAS_RULE = "Use the midpoint method: a % change is the change ÷ the average of the two values, and elasticity is |% change in quantity ÷ % change in price|.";
const PRICE_RULE = "Rule: if demand is inelastic (elasticity below 1) raising the price lifts revenue; if it is elastic (above 1) cutting the price does.";

function genElas(rng, tier) {
  if (tier === "expert-plus") return genElasBack(rng);
  for (let i = 0; i < TRY; i++) {
    const P1 = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
    const d = rng.pick([-3, -2, -1, 1, 2, 3, 4]);
    const P2 = P1 + d;
    if (P2 < 2 || Math.abs(d) > P1 / 2) continue;
    const Q1 = rng.int(4, 30) * 50;
    const dqAbs = rng.int(2, 30) * 10;
    const Q2 = d > 0 ? Q1 - dqAbs : Q1 + dqAbs;
    if (Q2 < 50) continue;
    const E = (dqAbs * (P1 + P2)) / (Math.abs(d) * (Q1 + Q2));
    if (E < 0.25 || E > 3.5 || Math.abs(E - 1) < 0.15 || nearHalf(E, 2, 0.08)) continue;
    const R1 = P1 * Q1, R2 = P2 * Q2;
    const pct = ((R2 - R1) / R1) * 100;
    if (nearHalf(pct, 1, 0.08) || R2 === R1) continue;
    const elastic = E > 1;
    const n = TIER_PARTS[tier];
    const pE = numPart("elast", "Elasticity", "Price elasticity of demand (midpoint method)", E, 2, "Percentage change in quantity = ΔQ ÷ average Q; percentage change in price = ΔP ÷ average P. Divide the first by the second and drop the sign.");
    const pRev = numPart("rev", "Revenue change", "Change in weekly revenue ($, negative if it fell)", R2 - R1, 0, `Revenue = price × quantity, before (${money(P1)} × ${commas(Q1)}) and after. Subtract.`);
    const pPct = numPart("revpct", "Revenue change %", "Change in revenue (%)", pct, 1, "Revenue change ÷ the old revenue × 100.");
    const pKind = choicePart("kind", "Elastic or inelastic?", "Is demand elastic or inelastic over this range?", ["Elastic", "Inelastic"], elastic ? "Elastic" : "Inelastic", "Compare your elasticity with 1.");
    const pCall = choicePart("call", "Pricing call", "To lift revenue further, what should the firm do next?", ["Raise price", "Cut price"], elastic ? "Cut price" : "Raise price", "Use the stated rule: which side of 1 is the elasticity on?");
    const all = tier === "medium" ? [pE, pRev] : tier === "hard" ? [pE, pRev, pKind] : [pE, pRev, pPct, pCall];
    const ex = [
      `**Elasticity:** %ΔQ = ${commas(dqAbs)} ÷ ${fixed((Q1 + Q2) / 2, 1)} = ${fixed((dqAbs / ((Q1 + Q2) / 2)) * 100, 2)}%; %ΔP = ${Math.abs(d)} ÷ ${fixed((P1 + P2) / 2, 1)} = ${fixed((Math.abs(d) / ((P1 + P2) / 2)) * 100, 2)}%; ratio = **${fixed(E, 2)}**.`,
      `**Revenue:** ${money(P1)} × ${commas(Q1)} = ${money(R1)}; ${money(P2)} × ${commas(Q2)} = ${money(R2)}; change **${R2 - R1 > 0 ? "" : "−"}${money(Math.abs(R2 - R1))}**.`,
      `**Revenue %:** ${commas(R2 - R1)} ÷ ${commas(R1)} × 100 = **${fixed(pct, 1)}%**.`,
      `**Kind:** ${fixed(E, 2)} is ${elastic ? "above" : "below"} 1, so demand is **${elastic ? "Elastic" : "Inelastic"}**; the call is **${elastic ? "Cut price" : "Raise price"}**.`,
    ];
    const text = (tier === "medium" ? [ex[0], ex[1]] : tier === "hard" ? [ex[0], ex[1], ex[3]] : ex).join("\n\n");
    return finish(
      `These figures are made up for practice. A firm ${d > 0 ? "raised" : "cut"} the price of a product from **${money(P1)}** to **${money(P2)}**, and weekly sales went from **${commas(Q1)}** to **${commas(Q2)}** units. ${ELAS_RULE}${n >= 4 ? ` ${PRICE_RULE}` : ""}`,
      all.slice(0, n), text, "ec-elas", { tier, P1, P2, Q1, Q2 }, [["_p1", P1], ["_p2", P2], ["_q1", Q1], ["_q2", Q2]],
      ["Both percentage changes use the average of the two values as the base.", "Revenue is price times quantity, so work it out before and after."],
    );
  }
  return tooMany();
}

function genElasBack(rng) {
  const wantInelastic = rng.next() < 0.5; // next move "Raise price" or "Cut price", about evenly
  for (let i = 0; i < TRY; i++) {
    const E10 = rng.pick([4, 5, 6, 8, 12, 15, 20, 25, 30]);
    const E = E10 / 10;
    if ((E < 1) !== wantInelastic) continue;
    const P1 = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
    const d = rng.pick([-3, -2, -1, 1, 2, 3, 4]);
    const P2 = P1 + d;
    if (P2 < 2 || Math.abs(d) > P1 / 2) continue;
    const S = P1 + P2;
    const Q1 = rng.int(4, 40) * 50;
    const num = Q1 * (10 * S - E10 * d), den = 10 * S + E10 * d;
    if (num % den !== 0) continue;
    const Q2 = num / den;
    if (Q2 < 50 || Q2 > 3 * Q1 || Q2 === Q1) continue;
    const R1 = P1 * Q1, R2 = P2 * Q2;
    const pct = ((R2 - R1) / R1) * 100;
    if (R2 === R1 || nearHalf(pct, 1, 0.08)) continue;
    const parts = [
      numPart("q2", "New quantity", "Weekly quantity sold after the price change (units)", Q2, 0, `Midpoint method: (Q₂ − Q₁) ÷ average Q = −E × (P₂ − P₁) ÷ average P, with E = ${E}. Solve for Q₂ (the price ${d > 0 ? "rose" : "fell"}, so quantity moves the other way).`),
      numPart("rev", "Revenue change", "Change in weekly revenue ($, negative if it fell)", R2 - R1, 0, "Revenue = price × quantity, before and after, using your new quantity."),
      numPart("revpct", "Revenue change %", "Change in revenue (%)", pct, 1, "Revenue change ÷ the old revenue × 100."),
      segPart("verdict", "Verdict", `What happened to revenue, and what should the firm do next to lift it further? ${PRICE_RULE}`, ["Revenue after change", "Next move"], ["Rises", "Falls"], ["Raise price", "Cut price"], [R2 > R1 ? "Rises" : "Falls", E < 1 ? "Raise price" : "Cut price"],
        "Revenue is compared before and after. The next move depends only on which side of 1 the given elasticity lies."),
    ];
    const ex = [
      `**New quantity:** average P = ${fixed(S / 2, 1)}, so %ΔP = ${d} ÷ ${fixed(S / 2, 1)}; %ΔQ = −${E} × that; solving gives Q₂ = **${commas(Q2)}**.`,
      `**Revenue:** ${money(P1)} × ${commas(Q1)} = ${money(R1)}; ${money(P2)} × ${commas(Q2)} = ${money(R2)}; change **${R2 - R1 > 0 ? "" : "−"}${money(Math.abs(R2 - R1))}**.`,
      `**Revenue %:** ${commas(R2 - R1)} ÷ ${commas(R1)} × 100 = **${fixed(pct, 1)}%**.`,
      `**Verdict:** revenue **${R2 > R1 ? "Rises" : "Falls"}**; elasticity ${E} is ${E < 1 ? "below" : "above"} 1 so the next move is **${E < 1 ? "Raise price" : "Cut price"}**.`,
    ].join("\n\n");
    return finish(
      `These figures are made up for practice. A firm ${d > 0 ? "raised" : "cut"} the price of a product from **${money(P1)}** to **${money(P2)}**. It sold **${commas(Q1)}** units a week before. Over this range the price elasticity of demand is **${E}** (midpoint method: a % change is the change ÷ the average of the two values).`,
      parts, ex, "ec-elasback", { tier: "expert-plus", P1, P2, Q1, E10 }, [["_p1", P1], ["_p2", P2], ["_q1", Q1], ["_e", E]],
      ["Write the midpoint equation with Q₂ unknown, then solve for it.", "Revenue is price times quantity."],
    );
  }
  return tooMany();
}

// ---------- tax-incidence ----------

function genTax(rng, tier) {
  if (tier === "expert-plus") return genTaxBack(rng);
  for (let i = 0; i < TRY; i++) {
    const b = rng.int(1, 5), s = rng.int(1, 5);
    if (b === s) continue;
    const t = rng.int(1, 10);
    if ((s * t * 100) % (b + s) !== 0 || (b * s * t) % (b + s) !== 0) continue;
    const Ps = rng.int(5, 20);
    const Qs = s * Ps + rng.int(5, 40);
    const A = Qs + b * Ps, c = Qs - s * Ps;
    const dP = (s * t) / (b + s), dQ = (b * s * t) / (b + s);
    const Pb = Ps + dP, Qt = Qs - dQ;
    if (Qt < 3 || nearHalf((s / (b + s)) * 100, 1, 0.05)) continue;
    const share = (s / (b + s)) * 100;
    const rev = t * Qt;
    const n = TIER_PARTS[tier];
    const pP = numPart("pbuy", "Buyers' price", "Price buyers pay after the tax ($)", Pb, 2, `Buyers pay P and sellers keep P − ${t}. Set demand equal to supply with sellers' price P − ${t}, and solve for P.`);
    const pQ = numPart("qty", "Quantity", "Quantity traded after the tax (units)", Qt, 0, "Put the new buyers' price into the demand curve.");
    const pR = numPart("rev", "Tax revenue", "Tax revenue ($)", rev, 0, `Revenue = tax per unit × quantity traded after the tax (${money(t)} per unit).`);
    const pS = numPart("share", "Buyers' share", "Share of the tax borne by buyers (%)", share, 1, "Buyers' burden = (new price they pay − old price) ÷ the tax per unit × 100.");
    const all = tier === "medium" ? [pP, pQ] : tier === "hard" ? [pP, pQ, pR] : [pP, pQ, pR, pS];
    const ex = [
      `**Buyers' price:** demand ${A} − ${b}P = supply ${c} + ${s}(P − ${t}); so ${A - c + s * t} = ${b + s}P and P = **${fixed(Pb, 2)}** (before the tax it was ${Ps}).`,
      `**Quantity:** ${A} − ${b} × ${fixed(Pb, 2)} = **${Qt}**.`,
      `**Tax revenue:** ${t} × ${Qt} = **${money(rev)}**.`,
      `**Buyers' share:** (${fixed(Pb, 2)} − ${Ps}) ÷ ${t} × 100 = **${fixed(share, 1)}%**.`,
    ];
    const text = (tier === "medium" ? [ex[0], ex[1]] : tier === "hard" ? [ex[0], ex[1], ex[2]] : ex).join("\n\n");
    return finish(
      `These figures are made up for practice. A market has demand **Qd = ${A} − ${cf(b)}P** and supply **Qs = ${c} + ${cf(s)}P** (P in $, quantities in units). The government puts a tax of **${money(t)} per unit** on sellers, so buyers pay P and sellers keep P − ${t}. Before the tax the market cleared at P = ${Ps}.`,
      all.slice(0, n), text, "ec-tax", { tier, A, b, c, s, t, Ps }, [["_tax", t], ["_pold", Ps]],
      ["The tax moves the supply curve: sellers supply Qs at the price they keep, P − tax.", "After the tax, one price (what buyers pay) clears the market."],
    );
  }
  return tooMany();
}

function genTaxBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const b = rng.int(1, 5), s = rng.int(1, 5);
    if (b === s) continue;
    const t = rng.int(2, 10);
    if ((s * t * 100) % (b + s) !== 0 || (b * s * t) % (b + s) !== 0) continue;
    const Ps = rng.int(8, 25);
    const Qs = s * Ps + rng.int(5, 40);
    const A = Qs + b * Ps;
    const dP = (s * t) / (b + s), dQ = (b * s * t) / (b + s);
    const share = (dP / t) * 100;
    if (Qs - dQ < 3 || nearHalf(share, 1, 0.05) || Ps + dP - t < 1) continue;
    const Pb = Ps + dP, Pnet = Pb - t, Qt = Qs - dQ;
    const consumers = b < s; // buyers bear more when demand is the less responsive side
    const parts = [
      numPart("pbuy", "Buyers' price", "Price buyers pay after the tax ($)", Pb, 2, `Demand has slope ${b}, so the fall in quantity ÷ ${b} is the rise in the price buyers pay. Add it to the old price.`),
      numPart("pnet", "Sellers' price", "Price sellers keep per unit after the tax ($)", Pnet, 2, "Sellers keep what buyers pay minus the tax."),
      numPart("share", "Buyers' share", "Share of the tax borne by buyers (%)", share, 1, "Rise in the price buyers pay ÷ the tax per unit × 100."),
      segPart("verdict", "Who bears more", `Who bears the bigger share of the tax, and which side of the market is less responsive to price?`, ["Bigger share borne by", "Less responsive side"], ["Buyers", "Sellers"], ["Demand", "Supply"], [consumers ? "Buyers" : "Sellers", consumers ? "Demand" : "Supply"],
        "Compare the buyers' share with 50%. The side that bears more is the side whose quantity reacts less to price."),
    ];
    const ex = [
      `**Buyers' price:** quantity fell by ${Qs} − ${Qt} = ${dQ}; ${dQ} ÷ ${b} = ${fixed(dP, 2)}; ${Ps} + ${fixed(dP, 2)} = **${fixed(Pb, 2)}**.`,
      `**Sellers' price:** ${fixed(Pb, 2)} − ${t} = **${fixed(Pnet, 2)}**.`,
      `**Buyers' share:** ${fixed(dP, 2)} ÷ ${t} × 100 = **${fixed(share, 1)}%**; sellers bear the other ${fixed(100 - share, 1)}%.`,
      `**Verdict:** ${consumers ? "buyers" : "sellers"} bear more, so the less responsive side is **${consumers ? "Demand" : "Supply"}**.`,
    ].join("\n\n");
    return finish(
      `These figures are made up for practice. Demand in a market is **Qd = ${A} − ${cf(b)}P** (P in $). Supply is not known. Before a tax the price was **${money(Ps)}** and **${commas(Qs)} units** traded. After a tax of **${money(t)} per unit** on sellers, **${commas(Qt)} units** trade. Buyers pay P and sellers keep P − ${t}.`,
      parts, ex, "ec-taxback", { tier: "expert-plus", A, b, Ps, Qs, Qt, t }, [["_pold", Ps], ["_qold", Qs], ["_qnew", Qt], ["_tax", t], ["_slope", b]],
      ["Use the demand curve only: the fall in quantity tells you how far the buyers' price moved.", "The tax is shared between what buyers pay extra and what sellers give up."],
    );
  }
  return tooMany();
}

// ---------- growth-doubling ----------

function genGrowth(rng, tier) {
  if (tier === "expert-plus") return genGrowthBack(rng);
  for (let i = 0; i < TRY; i++) {
    const g = rng.pick([2, 3, 4, 5, 6, 7]);
    const n = rng.pick([0.5, 1, 1.5, 2]);
    if (n >= g) continue;
    const t = rng.pick([4, 5, 6, 8, 10]);
    const G0 = 50 * rng.int(8, 30);
    const N0 = rng.int(20, 90);
    const Gt = G0 * (1 + g / 100) ** t, Nt = N0 * (1 + n / 100) ** t;
    const pc = Gt / Nt;
    const pcg = ((1 + g / 100) / (1 + n / 100) - 1) * 100;
    const dbl = Math.LN2 / Math.log(1 + g / 100);
    const r70 = 70 / g;
    if (nearHalf(Gt, 1, 0.08) || nearHalf(Nt, 1, 0.08) || nearHalf(pc, 2, 0.08) || nearHalf(pcg, 2, 0.08) || nearHalf(dbl, 1, 0.08) || nearHalf(r70, 1, 0.08)) continue;
    if (roundTo(roundTo(Gt, 1) / roundTo(Nt, 1), 2) !== roundTo(pc, 2)) continue;
    const k = TIER_PARTS[tier];
    const pG = numPart("gdp", "GDP later", `GDP after ${t} years ($ billion)`, Gt, 1, `Compound growth: start × (1 + rate)^years, with a rate of ${g}% (a factor of ${1 + g / 100}) over ${t} years.`);
    const pPop = numPart("pop", "Population later", `Population after ${t} years (millions)`, Nt, 1, `Same method with the population: start × (1 + ${n}%)^${t}.`);
    const pPc = numPart("pc", "GDP per person", `GDP per person after ${t} years ($ thousand)`, pc, 2, "GDP ($ billion) ÷ population (millions) gives $ thousand per person. Use your GDP and population figures for that year.");
    const pPcg = numPart("pcg", "Per-person growth", "Annual growth rate of GDP per person (%)", pcg, 2, "Per-person growth factor = GDP growth factor ÷ population growth factor. Subtract 1 and turn it into a percentage.");
    const pD70 = numPart("d70", "Doubling (rule of 70)", "Years for GDP to double by the rule of 70", r70, 1, "Rule of 70: doubling time ≈ 70 ÷ the growth rate in %.");
    const pDx = numPart("dbl", "Doubling (exact)", "Years for GDP to double, exactly (ln 2 ÷ ln(1 + rate))", dbl, 1, "Use natural logs of 2 and of the growth factor.");
    const all = tier === "medium" ? [pG, pD70] : tier === "hard" ? [pG, pPop, pPc] : [pG, pPc, pPcg, pDx];
    const ex = [
      `**GDP:** ${commas(G0)} × ${1 + g / 100}^${t} = **${fixed(Gt, 1)}** $ billion.`,
      `**Population:** ${N0} × ${1 + n / 100}^${t} = **${fixed(Nt, 1)}** million.`,
      `**GDP per person:** ${fixed(Gt, 1)} ÷ ${fixed(Nt, 1)} = **${fixed(pc, 2)}** $ thousand.`,
      `**Per-person growth:** ${fixed(1 + g / 100, 3)} ÷ ${fixed(1 + n / 100, 3)} − 1 = **${fixed(pcg, 2)}%** a year.`,
      `**Rule of 70:** 70 ÷ ${g} = **${fixed(r70, 1)}** years.`,
      `**Exact doubling:** ln 2 ÷ ln ${1 + g / 100} = **${fixed(dbl, 1)}** years.`,
    ];
    const text = (tier === "medium" ? [ex[0], ex[4]] : tier === "hard" ? [ex[0], ex[1], ex[2]] : [ex[0], ex[2], ex[3], ex[5]].map((x) => x)).join("\n\n");
    const popText = tier === "expert" ? ` The population is **${N0} million** and grows at **${n}%** a year.` : tier === "hard" ? ` The population is **${N0} million** and grows at **${n}%** a year.` : "";
    return finish(
      `These figures are made up for practice. An economy has GDP of **${money(G0)} billion** and grows at **${g}%** a year. Look at the economy after **${t} years**.${popText}${tier === "medium" ? " The rule of 70 says doubling time ≈ 70 ÷ the growth rate in %." : ""}`,
      all.slice(0, k), text, "ec-growth", { tier, g, n, t, G0, N0 }, [["_gdp0", G0], ["_g", g]].concat(tier === "medium" ? [] : [["_pop0", N0], ["_n", n]]),
      ["Growth compounds: multiply by the growth factor once for each year.", "Per-person figures divide GDP by population for the same year."],
    );
  }
  return tooMany();
}

function genGrowthBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const g = rng.pick([2, 3, 4, 5, 6, 7]);
    const n = rng.pick([1, 2, 3, 4, 5, 6]);
    if (n === g) continue;
    const t = rng.pick([5, 6, 8, 10]);
    const G0 = 50 * rng.int(8, 30);
    const Gt = roundTo(G0 * (1 + g / 100) ** t, 1);
    const gi = ((Gt / G0) ** (1 / t) - 1) * 100;
    if (Math.abs(gi - g) > 0.01) continue;
    const dbl = Math.LN2 / Math.log(1 + gi / 100);
    const dblNice = Math.LN2 / Math.log(1 + g / 100);
    const G2 = (Gt * Gt) / G0;
    const G2nice = G0 * (1 + g / 100) ** (2 * t);
    if (nearHalf(dbl, 1, 0.1) || nearHalf(dblNice, 1, 0.1) || roundTo(dbl, 1) !== roundTo(dblNice, 1)) continue;
    if (nearHalf(G2, 1, 0.1) || roundTo(G2, 1) !== roundTo(G2nice, 1)) continue;
    const rising = g > n;
    const parts = [
      numPart("rate", "Growth rate", "Average annual GDP growth rate (%)", g, 1, `Rate = (final ÷ start)^(1/${t}) − 1. Divide the two GDP figures, take the ${t}th root, subtract 1.`),
      numPart("dbl", "Doubling time", "Years for GDP to double at this rate (ln 2 ÷ ln(1 + rate))", dbl, 1, "Use natural logs of 2 and of the growth factor you just found."),
      numPart("gdp2", "GDP later", `GDP after another ${t} years at the same rate ($ billion)`, G2, 1, `Multiply the later GDP by the same growth factor ${t} more times.`),
      segPart("verdict", "Living standards", `Is GDP per person rising or falling, and how does GDP growth compare with population growth?`, ["GDP per person", "GDP growth vs population"], ["Rising", "Falling"], ["Faster", "Slower"], [rising ? "Rising" : "Falling", rising ? "Faster" : "Slower"],
        "GDP per person rises when GDP grows faster than the population."),
    ];
    const ex = [
      `**Growth rate:** (${fixed(Gt, 1)} ÷ ${commas(G0)})^(1/${t}) − 1 = **${fixed(g, 1)}%**.`,
      `**Doubling:** ln 2 ÷ ln ${fixed(1 + g / 100, 2)} = **${fixed(dbl, 1)}** years.`,
      `**GDP later:** ${fixed(Gt, 1)} × ${fixed(1 + g / 100, 2)}^${t} = **${fixed(G2, 1)}** $ billion.`,
      `**Verdict:** GDP grows at ${g}% against ${n}% for the population, so GDP per person is **${rising ? "Rising" : "Falling"}** and GDP growth is **${rising ? "Faster" : "Slower"}**.`,
    ].join("\n\n");
    return finish(
      `These figures are made up for practice. An economy's GDP was **${money(G0)} billion** and, ${t} years later, **${money(Gt)} billion**. Growth was steady every year. The population grows at **${n}%** a year.`,
      parts, ex, "ec-growthback", { tier: "expert-plus", G0, Gt, t, n }, [["_gdp0", G0], ["_gdpt", Gt], ["_years", t], ["_n", n]],
      ["Steady growth means GDP is multiplied by the same factor every year.", "Use the rate you find in the later parts too."],
    );
  }
  return tooMany();
}

// ---------- entry points ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "inflation-real") return genInfl(rng, difficulty);
  if (subtopic === "elasticity-revenue") return genElas(rng, difficulty);
  if (subtopic === "tax-incidence") return genTax(rng, difficulty);
  if (subtopic === "growth-doubling") return genGrowth(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (real wages from both
// wages, midpoint equation by search, equilibrium from the curves, growth by repeated multiplication).

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const compound = (start, ratePct, years) => { let x = start; for (let k = 0; k < years; k++) x *= 1 + ratePct / 100; return x; };

const ALT = {
  "ec-infl": (p) => {
    const infl = (p.I1 / p.I0 - 1) * 100;
    const real0 = p.W0 / (p.I0 / 100), real1 = p.W1 / (p.I1 / 100);
    return { infl, real: real1, rwc: ((real1 - real0) / real0) * 100, verdict: real1 > real0 ? "Better off" : "Worse off" };
  },
  "ec-inflback": (p) => {
    const i1 = (p.I0 * (1 + p.g / 100)) / (1 + p.r / 100);
    const infl = (i1 / p.I0 - 1) * 100;
    const real1 = (p.W0 * (1 + p.g / 100)) / (i1 / 100);
    return { cpi: i1, infl, real: real1, verdict: `${p.r > 0 ? "Higher" : "Lower"} | ${infl > p.T ? "Above target" : "Within target"}` };
  },
  "ec-elas": (p) => {
    const pm = (p.P1 + p.P2) / 2, qm = (p.Q1 + p.Q2) / 2;
    const E = Math.abs(((p.Q2 - p.Q1) / qm) / ((p.P2 - p.P1) / pm));
    const dr = p.P2 * p.Q2 - p.P1 * p.Q1;
    return { elast: E, rev: dr, revpct: (dr / (p.P1 * p.Q1)) * 100, kind: E > 1 ? "Elastic" : "Inelastic", call: E > 1 ? "Cut price" : "Raise price" };
  },
  "ec-elasback": (p) => {
    const E = p.E10 / 10, pm = (p.P1 + p.P2) / 2;
    let q2 = NaN;
    for (let q = 1; q <= 6 * p.Q1; q++) {
      if (Math.abs((q - p.Q1) / ((q + p.Q1) / 2) + (E * (p.P2 - p.P1)) / pm) < 1e-9) { q2 = q; break; }
    }
    const dr = p.P2 * q2 - p.P1 * p.Q1;
    return { q2, rev: dr, revpct: (dr / (p.P1 * p.Q1)) * 100, verdict: `${dr > 0 ? "Rises" : "Falls"} | ${E < 1 ? "Raise price" : "Cut price"}` };
  },
  "ec-tax": (p) => {
    const pb = (p.A - p.c + p.s * p.t) / (p.b + p.s);
    const q = p.A - p.b * pb;
    return { pbuy: pb, qty: q, rev: p.t * q, share: ((pb - p.Ps) / p.t) * 100 };
  },
  "ec-taxback": (p) => {
    const dp = (p.Qs - p.Qt) / p.b, pb = p.Ps + dp;
    const bigBuyers = dp / p.t > 0.5;
    return { pbuy: pb, pnet: pb - p.t, share: (dp / p.t) * 100, verdict: `${bigBuyers ? "Buyers" : "Sellers"} | ${bigBuyers ? "Demand" : "Supply"}` };
  },
  "ec-growth": (p) => {
    const gt = compound(p.G0, p.g, p.t), nt = compound(p.N0, p.n, p.t);
    let yrs = 0, x = 1;
    while (x < 2) { x *= 1 + p.g / 100; yrs++; }
    const exact = yrs - 1 + (Math.log(2) - Math.log(x / (1 + p.g / 100))) / Math.log(1 + p.g / 100);
    return { gdp: gt, pop: nt, pc: gt / nt, pcg: (((1 + p.g / 100) / (1 + p.n / 100)) - 1) * 100, d70: 70 / p.g, dbl: exact };
  },
  "ec-growthback": (p) => {
    const g = (Math.exp(Math.log(p.Gt / p.G0) / p.t) - 1) * 100;
    let x = 1, yrs = 0;
    while (x < 2) { x *= 1 + g / 100; yrs++; }
    const dbl = yrs - 1 + (Math.log(2) - Math.log(x / (1 + g / 100))) / Math.log(1 + g / 100);
    const gdp2 = compound(p.Gt, g, p.t);
    const rising = g > p.n;
    return { rate: g, dbl, gdp2, verdict: `${rising ? "Rising" : "Falling"} | ${rising ? "Faster" : "Slower"}` };
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
    if (tv === undefined) return false;
    if (part.answerType === "number") {
      const dp = part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2));
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
