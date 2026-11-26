// Data Analyst role-only generator. Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario that chains skills from several subjects:
//   ab-test         conversion rates -> lift -> volume / probability -> ship decision   (percentages, probability)
//   kpi-review      KPI change % -> a segment's contribution -> required target         (percentages, ratios)
//   query-outliers  rows a WHERE clause returns -> mean / median -> outlier call        (SQL, statistics)
//   storage-cost    characters -> bytes -> compression -> monthly cost -> budget        (data representation)
// Tiers: medium 2 parts, hard 3, expert 4 (rounding stated), expert-plus 4 (multi-concept, working
// backwards, a judgement part). All rng draws happen before text is built; hints and explanations
// use only drawn values. Draws whose answer sits on a rounding half-step, or whose later answers
// would change when worked from an earlier rounded answer, are redrawn inside generate().
// verify() recomputes every part from params by a different route.

// ---------- helpers ----------
function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// n is not within `margin` (in units of the last place) of a rounding half-step at d places.
const safeAt = (n, d, margin = 0.05) => Math.abs((Math.abs(n) * 10 ** d) % 1 - 0.5) > margin;
// n is not within `margin` of a whole number.
const awayFromInt = (n, margin = 0.02) => Math.abs(n - Math.round(n)) > margin;
const fmt = (n, d = 4) => String(roundTo(n, d));
const fix = (n, d) => roundTo(n, d).toFixed(d);
const thou = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (n) => `$${thou(roundTo(n, 2))}`;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const SEP = " | ";
const segsOf = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()) : String(v ?? "").split("|").map((s) => s.trim()));
const sameSegs = (a, b) => { const x = segsOf(a), y = segsOf(b); return x.length === y.length && x.every((s, i) => s === y[i]); };
const numOf = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? parseFloat(v.replace(/−/g, "-").replace(/,/g, "")) : NaN);
const TOL = [0, 0.05, 0.005, 0.0005, 0.00005];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// The answer plus up to n - 1 distractors, each differing from it in 1 to (cols - 1) segments.
function segChoices(rng, answer, opts, n = 5) {
  const cols = answer.length;
  const seen = new Set([answer.join(SEP)]);
  const out = [answer];
  for (let g = 0; out.length < n && g < 400; g++) {
    const k = cols > 2 && rng.next() < 0.5 ? 2 : 1;
    const idx = rng.shuffle([...Array(cols).keys()]).slice(0, k);
    const c = answer.slice();
    for (const i of idx) {
      const alt = opts[i].filter((v) => v !== answer[i]);
      if (alt.length) c[i] = rng.pick(alt);
    }
    const dd = c.filter((v, i) => v !== answer[i]).length;
    const key = c.join(SEP);
    if (dd < 1 || dd >= cols || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return rng.shuffle(out);
}
function segPart(rng, { id, label, ask, cols, answer, opts, hint }) {
  const choices = segChoices(rng, answer, opts, cols.length > 2 ? 5 : 4);
  const extraSegs = [];
  cols.forEach((c, i) => { for (const v of new Set(opts[i])) if (v !== answer[i]) extraSegs.push([i, v]); });
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, hint };
}
const numPart = (id, label, ask, answer, dp, hint, whole = false) => ({
  id, label, ask, answerType: "number", answer: roundTo(answer, dp), tolerance: TOL[dp], hint, ...(whole ? { fuzzyNumber: 0 } : {}),
});
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices: choices.slice(), hint });

// Keep the parts a tier asks for, in the order of `ids`; explanation lines follow the same order.
function build(prompt, all, ids, ex, params, given, hints) {
  const parts = ids.map((id) => all.find((p) => p.id === id));
  return { prompt, answerType: "multi", parts, explanation: ids.map((id) => ex[id]).join("\n\n"), params, given: givenRows(given), hints };
}

// ---------- ab-test ----------
const EXPERIMENTS = [
  { what: "a shorter checkout form", unit: "visitors", goal: "complete a purchase", page: "checkout" },
  { what: "a new sign-up button colour", unit: "visitors", goal: "create an account", page: "landing page" },
  { what: "a redesigned pricing page", unit: "visitors", goal: "start a free trial", page: "pricing page" },
  { what: "a reminder e-mail subject line", unit: "recipients", goal: "click through", page: "newsletter" },
  { what: "a simpler search box", unit: "visitors", goal: "place an order", page: "shop" },
];

function abDraw(rng, tier) {
  const ex = rng.pick(EXPERIMENTS);
  for (;;) {
    const n = rng.pick([500, 1000, 2000, 2500]);
    const rA = rng.int(20, 90) / 10;
    const cA = Math.round((n * rA) / 100);
    const dc = Math.round((n * rng.int(1, 18)) / 1000) * (rng.next() < 0.2 ? -1 : 1);
    const cB = cA + dc;
    if (dc === 0 || cB <= 0) continue;
    const rateA = (cA / n) * 100, rateB = (cB / n) * 100;
    const lift = roundTo(rateB - rateA, 2);
    const rel = ((cB - cA) / cA) * 100;
    const X = rng.pick([0.3, 0.5, 0.8, 1.0]);
    if (Math.abs(lift - X) < 0.005) continue;
    const V = rng.pick([20000, 50000, 80000, 100000]);
    const extra = roundTo((V * lift) / 100, 6);
    const E = Math.max(10, Math.round((extra * (0.6 + rng.next() * 0.9)) / 50) * 50);
    const m = rng.pick([20, 30, 40, 50]);
    const K = rng.pick([50, 80, 100, 120]);
    const pB = cB / n;
    const pAtLeast = 1 - (1 - pB) ** m;
    const needV = K / pB;
    const d = { ex, n, cA, cB, rateA, rateB, lift, rel, X, V, extra, E, m, K, pB, pAtLeast, needV };
    if (tier === "expert" && !(lift > 0)) continue;
    if (tier === "expert-plus") {
      if (extra === E || !safeAt(pAtLeast, 4, 0.1) || pAtLeast < 0.2 || pAtLeast > 0.97 || !awayFromInt(needV, 0.03)) continue;
      if (!(lift > 0) || extra < 30) continue;
    }
    return d;
  }
}

function genAb(rng, tier) {
  const d = abDraw(rng, tier);
  const { ex } = d;
  const rateBR = roundTo(d.rateB, 2);
  const liftOk = d.lift >= d.X;
  const lintro = `A team tests **${ex.what}** on the ${ex.page}. Each version was shown to **${thou(d.n)} ${ex.unit}**. Version A (current) had **${d.cA}** who ${ex.goal}; version B (new) had **${d.cB}**.`;
  const pts = d.X === 1 ? "point" : "points";
  const rule1 = `The team ships B only if its lift (B's rate minus A's rate) is **at least ${d.X} percentage ${pts}**.`;
  const plusRule = `Ship B only if **both** checks pass: the lift is at least **${d.X} ${pts}**, and B brings at least **${thou(d.E)} extra conversions a month** at **${thou(d.V)} ${ex.unit} a month**.`;
  const dec = liftOk ? "Ship B" : "Keep A";
  const passes = [liftOk ? "Passes" : "Fails", d.extra >= d.E ? "Passes" : "Fails"];
  const planAns = [passes[0], passes[1], passes[0] === "Passes" && passes[1] === "Passes" ? "Ship B" : "Keep A"];
  const all = [
    numPart("rateb", "Rate of B", "Version B's conversion rate (%), to 2 decimal places", rateBR, 2, `Rate = conversions ÷ ${ex.unit} × 100, using version B's counts.`),
    numPart("lift", "Lift", "Lift of B over A in percentage points, to 2 decimal places", d.lift, 2, "Work out each version's rate as a percentage, then subtract A's from B's. A fall is a negative lift."),
    numPart("extra", "Extra a month", `Extra conversions a month if B replaces A at ${thou(d.V)} ${ex.unit} a month (whole number)`, d.extra, 0, "Multiply the monthly volume by the lift, written as a fraction (points ÷ 100).", true),
    choicePart("decision", "Decision", "What does the rule say?", dec, ["Ship B", "Keep A"], "Compare the lift in points with the limit in the rule. 'At least' includes the limit itself."),
    numPart("prob", "Chance", `Probability that at least one of ${d.m} B-${ex.unit} converts, to 4 decimal places`, d.pAtLeast, 4, `Find the chance that none of ${d.m} converts, (1 − p)^${d.m} with B's rate as p, and subtract it from 1.`),
    numPart("need", "Volume needed", `${ex.unit[0].toUpperCase() + ex.unit.slice(1)} B needs to expect ${d.K} conversions (round up to a whole number)`, Math.ceil(d.needV), 0, `Work backwards: ${ex.unit} needed = conversions wanted ÷ B's rate (as a fraction). Round up, since only whole ${ex.unit} can be counted.`, true),
    segPart(rng, { id: "plan", label: "Plan", ask: "Judge each check, then the call", cols: ["Lift check", "Volume check", "Call"], answer: planAns,
      opts: [["Passes", "Fails"], ["Passes", "Fails"], ["Ship B", "Keep A"]], hint: "Judge the lift check and the volume check separately against their limits. The call is Ship B only if both pass." }),
  ];
  const exl = {
    rateb: `**Rate of B:** ${d.cB} ÷ ${thou(d.n)} × 100 = **${fix(rateBR, 2)}%**. (Rate of A: ${d.cA} ÷ ${thou(d.n)} × 100 = ${fix(d.rateA, 2)}%.)`,
    lift: `**Lift:** ${fix(d.rateB, 2)}% − ${fix(d.rateA, 2)}% = **${fix(d.lift, 2)} points**. In the calculator: \`(_cb - _ca) / _n * 100\`.`,
    extra: `**Extra a month:** ${thou(d.V)} × ${fix(d.lift, 2)} ÷ 100 = **${thou(d.extra)}** conversions.`,
    decision: `**Decision:** the lift ${fix(d.lift, 2)} is ${liftOk ? "at least" : "below"} ${d.X}, so **${dec}**.`,
    prob: `**Chance:** with p = ${d.cB} ÷ ${thou(d.n)} = ${fmt(d.pB, 4)}, none of ${d.m} converting is (1 − p)^${d.m} ≈ ${fix(1 - d.pAtLeast, 4)}, so at least one is 1 − that ≈ **${fix(d.pAtLeast, 4)}**.`,
    need: `**Volume needed:** ${d.K} ÷ ${fmt(d.pB, 4)} ≈ ${fix(d.needV, 2)}, rounded up to **${thou(Math.ceil(d.needV))}**.`,
    plan: `**Plan:** the lift check ${passes[0].toLowerCase()} (${fix(d.lift, 2)} vs ${d.X}); the volume check ${passes[1].toLowerCase()} (${thou(d.extra)} vs ${thou(d.E)}). **${planAns[2]}**.`,
  };
  const params = { kind: "ab", tier, n: d.n, cA: d.cA, cB: d.cB, X: d.X, V: d.V, E: d.E, m: d.m, K: d.K };
  const given = [["_n", d.n], ["_ca", d.cA], ["_cb", d.cB]];
  const hints = ["Turn counts into rates first; every later part builds on them.", "A percentage point is a difference between two percentages, not a percentage change."];
  if (tier === "medium") return build(`${lintro} ${rule1}`, all, ["lift", "decision"], exl, params, [...given, ["_x", d.X]], hints);
  if (tier === "hard") return build(`${lintro} ${rule1}`, all, ["rateb", "lift", "decision"], exl, params, [...given, ["_x", d.X]], hints);
  if (tier === "expert") return build(`${lintro} Rates are exact to 2 decimal places, so you can work from rounded rates. ${rule1} Monthly traffic is **${thou(d.V)} ${ex.unit}**.`, all, ["rateb", "lift", "extra", "decision"], exl, params, [...given, ["_x", d.X], ["_v", d.V]], hints);
  return build(`${lintro} Monthly traffic is **${thou(d.V)} ${ex.unit}**. ${plusRule} Probabilities are to 4 decimal places.\n\nAlso, the team wants to know how many ${ex.unit} version B would need in order to expect **${d.K}** conversions, and how likely it is that a random batch of **${d.m}** B-${ex.unit} contains at least one.`,
    all, ["lift", "prob", "need", "plan"], exl, params, [...given, ["_x", d.X], ["_v", d.V], ["_e", d.E], ["_k", d.K], ["_m", d.m]], hints);
}

// ---------- kpi-review ----------
const SEG_SETS = [
  { firm: "a clothing retailer", kpi: "revenue", segs: ["Online", "Stores", "Wholesale"], unit: "$k" },
  { firm: "a software company", kpi: "monthly recurring revenue", segs: ["Starter", "Team", "Enterprise"], unit: "$k" },
  { firm: "a coffee chain", kpi: "sales", segs: ["Dine-in", "Takeaway", "Delivery"], unit: "$k" },
  { firm: "a gym group", kpi: "membership income", segs: ["Standard", "Premium", "Corporate"], unit: "$k" },
  { firm: "a food producer", kpi: "revenue", segs: ["Snacks", "Drinks", "Frozen"], unit: "$k" },
];

function kpiDraw(rng, tier) {
  const set = rng.pick(SEG_SETS);
  for (;;) {
    const prev = [0, 1, 2].map(() => rng.int(5, 20) * 20);
    const curr = prev.map((p) => p + rng.int(-4, 7) * 10);
    if (curr.some((c) => c <= 0)) continue;
    const delta = curr.map((c, i) => c - prev[i]);
    if (new Set(delta).size < 3) continue;
    const T0 = sum(prev), T1 = sum(curr);
    const chg = ((T1 - T0) / T0) * 100;
    const i = rng.int(0, 2);
    const contrib = (delta[i] / T0) * 100;
    const share = (curr[i] / T1) * 100;
    const G = rng.pick([2, 3, 4, 5, 6, 8]);
    const g = rng.pick([4, 5, 10]);
    const K = T1 * (1 + g / 100);
    const need = K - (T1 - curr[i]);
    const hi = delta.indexOf(Math.max(...delta)), lo = delta.indexOf(Math.min(...delta));
    const ok = safeAt(chg, 1) && safeAt(contrib, 1) && safeAt(share, 1) && Math.abs(chg - G) > 0.1 && Math.abs(chg) > 0.3 && Math.abs(contrib) > 0.3;
    if (!ok) continue;
    if (tier === "expert-plus" && (!Number.isInteger(roundTo(K, 6)) || need <= 0)) continue;
    // "Added the most" / "largest contributor" needs at least one segment that rose.
    if ((tier === "hard" || tier === "expert-plus") && Math.max(...delta) <= 0) continue;
    return { set, prev, curr, delta, T0, T1, chg, i, contrib, share, G, g, K, need, hi, lo };
  }
}

function genKpi(rng, tier) {
  const d = kpiDraw(rng, tier);
  const { set } = d;
  const name = set.segs[d.i];
  const rowTable = `| Segment | Last quarter (${set.unit}) | This quarter (${set.unit}) |\n| --- | --- | --- |\n${set.segs.map((s, k) => `| ${s} | ${d.prev[k]} | ${d.curr[k]} |`).join("\n")}`;
  const intro = `You review the quarterly report of ${set.firm}. Its ${set.kpi} by segment:\n\n${rowTable}`;
  const met = d.chg >= d.G;
  const growthTxt = `${d.chg >= 0 ? "" : "−"}${fix(Math.abs(d.chg), 1)}%`;
  const rank = [set.segs[d.hi], set.segs[d.lo], met ? "Yes" : "No"];
  const all = [
    numPart("growth", "Total change", "Change in total " + set.kpi + " (%), to 1 decimal place (negative for a fall)", d.chg, 1, "Total change % = (this quarter's total − last quarter's total) ÷ last quarter's total × 100. Add the segments first."),
    numPart("contrib", "Contribution", `${name}'s contribution to the total change, in percentage points (to 1 decimal place)`, d.contrib, 1, `A segment's contribution = that segment's own change in ${set.unit} ÷ last quarter's **total** (not its own last quarter) × 100.`),
    choicePart("driver", "Biggest driver", "Which segment added the most to the total?", set.segs[d.hi], set.segs, "Compare each segment's change in money, this quarter minus last quarter. The biggest rise wins, not the biggest total."),
    numPart("share", "Share now", `${name}'s share of this quarter's total (%), to 1 decimal place`, d.share, 1, "Share = the segment's figure this quarter ÷ this quarter's total × 100."),
    choicePart("met", "Target met?", `The target is growth of at least ${d.G}%. Was it met?`, met ? "Yes" : "No", ["Yes", "No"], "Compare the total change % you found with the target. 'At least' includes the target itself."),
    numPart("need", "Needed", `${name} ${set.kpi} needed next quarter (${set.unit}) for total growth of ${d.g}%, other segments flat`, d.need, 0, `Work backwards: the target total is this quarter's total × (1 + ${d.g}/100). Subtract what the other two segments already bring in.`, true),
    segPart(rng, { id: "rank", label: "Ranking", ask: "Name the largest and smallest contributors, then judge the target", cols: ["Largest", "Smallest", `Target ${d.G}% met?`], answer: rank,
      opts: [set.segs, set.segs, ["Yes", "No"]], hint: "Rank the segments by their change in money, this quarter minus last. Then compare the total change % with the target." }),
  ];
  const ex = {
    growth: `**Total change:** the totals are ${d.T0} and ${d.T1}, so (${d.T1} − ${d.T0}) ÷ ${d.T0} × 100 = **${growthTxt}**.`,
    contrib: `**Contribution:** ${name} went from ${d.prev[d.i]} to ${d.curr[d.i]}, a change of ${d.delta[d.i]}. ${d.delta[d.i]} ÷ ${d.T0} × 100 = **${fix(d.contrib, 1)} points**. In the calculator: \`_chg / _t0 * 100\`.`,
    driver: `**Biggest driver:** the changes are ${set.segs.map((s, k) => `${s} ${d.delta[k] > 0 ? "+" : ""}${d.delta[k]}`).join(", ")}, so **${set.segs[d.hi]}**.`,
    share: `**Share now:** ${d.curr[d.i]} ÷ ${d.T1} × 100 = **${fix(d.share, 1)}%**.`,
    met: `**Target:** ${growthTxt} is ${met ? "at least" : "below"} ${d.G}%, so **${met ? "Yes" : "No"}**.`,
    need: `**Needed:** the target total is ${d.T1} × ${1 + d.g / 100} = ${thou(d.K)}. The other segments bring ${d.T1 - d.curr[d.i]}, so ${name} must reach ${thou(d.K)} − ${d.T1 - d.curr[d.i]} = **${thou(d.need)}**.`,
    rank: `**Ranking:** largest ${rank[0]}, smallest ${rank[1]}. Growth ${growthTxt} vs target ${d.G}%: **${rank[2]}**.`,
  };
  const params = { kind: "kpi", tier, names: set.segs, prev: d.prev, curr: d.curr, i: d.i, G: d.G, g: d.g };
  const given = [["_t0", d.T0], ["_t1", d.T1], ["_chg", d.delta[d.i]]];
  const hints = ["Add the segments to get totals before comparing anything.", "A percentage point difference compares two percentages; a percentage change compares two amounts."];
  if (tier === "medium") return build(`${intro}\n\nGive each answer to 1 decimal place.`, all, ["growth", "contrib"], ex, params, given, hints);
  if (tier === "hard") return build(`${intro}\n\nGive percentages to 1 decimal place.`, all, ["growth", "contrib", "driver"], ex, params, given, hints);
  if (tier === "expert") return build(`${intro}\n\nThe target is total growth of **at least ${d.G}%**. Percentages are to 1 decimal place; work each from the table, not from a rounded answer.`, all, ["growth", "contrib", "share", "met"], ex, params, [...given, ["_g", d.G]], hints);
  return build(`${intro}\n\nThe target was total growth of **at least ${d.G}%**. For next quarter, management wants total ${set.kpi} to grow by **${d.g}%** on this quarter, with the two segments other than **${name}** staying exactly flat. Percentages are to 1 decimal place.`, all, ["growth", "contrib", "need", "rank"], ex, params, [...given, ["_g", d.G], ["_gn", d.g]], hints);
}

// ---------- query-outliers ----------
const TABLES = [
  { table: "orders", col: "amount", noun: "order", unit: "$", regions: ["North", "South", "East"] },
  { table: "refunds", col: "amount", noun: "refund", unit: "$", regions: ["North", "South", "East"] },
  { table: "deliveries", col: "minutes", noun: "delivery", unit: "min", regions: ["North", "South", "East"] },
  { table: "calls", col: "seconds", noun: "call", unit: "s", regions: ["North", "South", "East"] },
];

const medianOf = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

function qDraw(rng, tier) {
  const T = rng.pick(TABLES);
  for (;;) {
    const rows = 12;
    const region = rng.pick(T.regions);
    const plus = tier === "expert-plus";
    const regs = Array.from({ length: rows }, () => rng.pick(T.regions));
    const vals = Array.from({ length: rows }, () => rng.int(15, 60));
    const thr = plus ? vals[rng.int(0, rows - 1)] : rng.int(14, 30) + (rng.next() < 0.5 ? 0.5 : 0);
    const hit = (k) => (plus ? regs[k] !== region : regs[k] === region) && (plus ? vals[k] >= thr : vals[k] > thr);
    let idx = vals.map((_, k) => k).filter(hit);
    if (idx.length >= 4 && rng.next() < 0.5) { vals[rng.pick(idx)] = rng.int(150, 260); idx = vals.map((_, k) => k).filter(hit); }
    // The threshold row must still pass (>= keeps it) and still be one of the drawn values.
    const out = idx.map((k) => vals[k]);
    if (out.length < 4 || out.length > 9) continue;
    const mean = sum(out) / out.length;
    const med = medianOf(out);
    const max = Math.max(...out);
    if (out.filter((v) => v === max).length > 1) continue;
    const rest = out.slice().sort((a, b) => a - b).slice(0, -1);
    const trimmed = sum(rest) / rest.length;
    const factor = 2;
    if (max === factor * med || !safeAt(mean, 1) || !safeAt(trimmed, 1)) continue;
    // plus: the >= row (value == thr) must change the count when the sign is > (the trap is real).
    if (plus && !vals.some((v, k) => v === thr && regs[k] !== region)) continue;
    const outlier = max > factor * med;
    if (tier === "expert-plus" && !(Math.abs(max - factor * med) > 3)) continue;
    return { T, region, regs, vals, thr, idx, out, mean, med, max, trimmed, factor, outlier, plus };
  }
}

function genQuery(rng, tier) {
  const d = qDraw(rng, tier);
  const { T } = d;
  const where = d.plus ? `region <> '${d.region}' AND ${T.col} >= ${d.thr}` : `region = '${d.region}' AND ${T.col} > ${d.thr}`;
  const query = `SELECT ${T.col} FROM ${T.table} WHERE ${where}`;
  const tbl = `| id | region | ${T.col} |\n| --- | --- | --- |\n${d.vals.map((v, k) => `| ${k + 1} | ${d.regs[k]} | ${v} |`).join("\n")}`;
  const intro = `The \`${T.table}\` table holds ${d.vals.length} rows:\n\n${tbl}\n\nYou run this query:\n\n\`${query}\``;
  const rule = `A value is an **outlier** if it is more than **${d.factor} times the median** of the returned values.`;
  const fmtM = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const callAns = [d.outlier ? "An outlier" : "Not an outlier", d.outlier ? "Median" : "Mean"];
  const all = [
    numPart("rows", "Rows", "How many rows does the query return?", d.out.length, 0, "Go row by row and keep only those that satisfy **every** condition joined by AND. Check whether the comparison includes the limit itself.", true),
    numPart("mean", "Mean", `Mean of the returned ${T.col} values, to 1 decimal place`, d.mean, 1, "Add up the returned values and divide by how many rows came back."),
    numPart("median", "Median", `Median of the returned ${T.col} values, to 1 decimal place`, d.med, 1, "Sort the returned values. The median is the middle one, or the mean of the middle two when the count is even."),
    choicePart("outlier", "Outlier?", `Is the largest returned ${T.col} an outlier?`, d.outlier ? "Yes" : "No", ["Yes", "No"], `Compare the largest returned value with ${d.factor} × the median. 'More than' excludes equal.`),
    numPart("trimmed", "Trimmed mean", `Mean of the returned values once the largest one is removed, to 1 decimal place`, d.trimmed, 1, "Remove only the single largest returned value, then average what is left (one fewer row)."),
    segPart(rng, { id: "call", label: "Call", ask: "Judge the largest value, then pick the better summary", cols: ["Largest value", "Better summary"], answer: callAns,
      opts: [["An outlier", "Not an outlier"], ["Mean", "Median"]], hint: "Apply the outlier rule to the largest value. A summary that one extreme value drags around is worse than one that ignores it." }),
  ];
  const listed = d.out.join(", ");
  const ex = {
    rows: `**Rows:** the rows that pass \`${where}\` are ids ${d.idx.map((k) => k + 1).join(", ")}: **${d.out.length}** rows, with ${T.col} ${listed}.`,
    mean: `**Mean:** ${sum(d.out)} ÷ ${d.out.length} = **${fix(d.mean, 1)}**. In the calculator: \`_sum / _count\`.`,
    median: `**Median:** sorted, ${d.out.slice().sort((a, b) => a - b).join(", ")}; the middle ${d.out.length % 2 ? "value is" : "pair averages to"} **${fmtM(d.med)}**.`,
    outlier: `**Outlier:** ${d.max} against ${d.factor} × ${fmtM(d.med)} = ${fmtM(d.factor * d.med)}, so **${d.outlier ? "Yes" : "No"}**.`,
    trimmed: `**Trimmed mean:** without ${d.max} the values add to ${sum(d.out) - d.max} over ${d.out.length - 1} rows: **${fix(d.trimmed, 1)}**.`,
    call: `**Call:** the largest value is **${callAns[0].toLowerCase()}** (${d.max} vs ${fmtM(d.factor * d.med)}), so the better summary is the **${callAns[1].toLowerCase()}**.`,
  };
  const params = { kind: "query", tier, regions: d.regs, vals: d.vals, region: d.region, thr: d.thr, plus: d.plus, factor: d.factor, col: T.col };
  const given = [["_t", d.thr], ["_f", d.factor]];
  const hints = ["Work out which rows come back before any statistics.", "Write the returned values down in a list first; every later part uses that list."];
  if (tier === "medium") return build(`${intro}\n\nGive the mean to 1 decimal place.`, all, ["rows", "mean"], ex, params, given, hints);
  if (tier === "hard") return build(`${intro}\n\n${rule} Give the mean to 1 decimal place.`, all, ["rows", "mean", "outlier"], ex, params, given, hints);
  if (tier === "expert") return build(`${intro}\n\n${rule} Give means and medians to 1 decimal place.`, all, ["rows", "mean", "median", "outlier"], ex, params, given, hints);
  return build(`${intro}\n\n${rule} Report means to 1 decimal place. The team reports the **median** when the largest value is an outlier, and the **mean** otherwise.`, all, ["rows", "mean", "trimmed", "call"], ex, params, given, hints);
}

// ---------- storage-cost ----------
const STORES = [
  { data: "customer messages", rec: "message" },
  { data: "product reviews", rec: "review" },
  { data: "support tickets", rec: "ticket" },
  { data: "log entries", rec: "entry" },
  { data: "survey answers", rec: "answer" },
];

function stDraw(rng, tier) {
  const s = rng.pick(STORES);
  for (;;) {
    const recM = rng.int(50, 900);
    const L = rng.pick([40, 50, 80, 100, 125, 200]);
    const bpc = rng.pick([1, 2]);
    const head = rng.pick([0, 20, 50]);
    const direct = tier === "medium" || tier === "hard";
    const recBytes = direct ? rng.pick([200, 250, 400, 500, 800]) : L * bpc + head;
    const raw = (recM * recBytes) / 1000;
    const P = rng.pick([20, 30, 40, 50, 60, 75]);
    const comp = raw * (1 - P / 100);
    const price = rng.pick([0.02, 0.03, 0.04, 0.05, 0.08]);
    const costRaw = raw * price;
    const cost = comp * price;
    const g = rng.pick([20, 25, 50]);
    const cost12 = comp * (1 + g / 100) * price;
    const B = Math.max(1, Math.round((cost * (0.6 + rng.next() * 0.9)) * 2) / 2);
    const perM = (recBytes * (1 - P / 100)) / 1000;
    const maxRec = B / (price * perM);
    if (!safeAt(comp, 2) || !safeAt(cost, 2) || !safeAt(costRaw, 2) || !safeAt(cost12, 2)) continue;
    if (roundTo(roundTo(comp, 2) * price, 2) !== roundTo(cost, 2)) continue;
    if (Math.abs(cost - B) < 0.02 || Math.abs(cost12 - B) < 0.02) continue;
    if (tier === "expert-plus" && (!awayFromInt(maxRec, 0.03) || maxRec < 2)) continue;
    if (tier === "hard" && roundTo(roundTo(raw, 3) * price, 2) !== roundTo(costRaw, 2)) continue;
    return { s, recM, L, bpc, head, recBytes, raw, P, comp, price, costRaw, cost, g, cost12, B, maxRec };
  }
}

function genStorage(rng, tier) {
  const d = stDraw(rng, tier);
  const { s } = d;
  const direct = tier === "medium" || tier === "hard";
  const enc = d.bpc === 1 ? "1 byte per character (ASCII)" : "2 bytes per character (UTF-16)";
  const sizeTxt = direct
    ? `each ${s.rec} takes **${d.recBytes} bytes**`
    : `each ${s.rec} is **${d.L} characters** stored at ${enc}, plus **${d.head} bytes** of header`;
  const intro = `You plan storage for **${d.recM} million ${s.data}**: ${sizeTxt}. Use 1 GB = 1,000 MB = 1,000,000 KB = 1,000,000,000 bytes. Storage costs **$${d.price} per GB per month**.`;
  const comp = `Compression cuts the size by **${d.P}%**.`;
  const budget = `The monthly budget is **${money(d.B)}**.`;
  const within = d.cost <= d.B;
  const fitsNow = d.cost <= d.B, fits12 = d.cost12 <= d.B;
  const planAns = [fitsNow ? "Yes" : "No", fits12 ? "Yes" : "No"];
  const all = [
    numPart("rec", "Record size", `Bytes per ${s.rec}`, d.recBytes, 0, `Characters × bytes per character, then add the header bytes.`, true),
    numPart("raw", "Raw size", "Uncompressed size in GB, to 3 decimal places", d.raw, 3, `Records × bytes per record gives bytes; ${d.recM} million is ${d.recM} × 1,000,000. Then convert bytes to GB.`),
    numPart("costraw", "Raw cost", "Monthly cost of the uncompressed data ($), to 2 decimal places", d.costRaw, 2, "Size in GB × price per GB per month."),
    numPart("comp", "Compressed", "Compressed size in GB, to 2 decimal places", d.comp, 2, `Compressed size = raw size × (1 − ${d.P}/100).`),
    numPart("cost", "Monthly cost", "Monthly cost of the compressed data ($), to 2 decimal places", d.cost, 2, "Compressed size in GB × price per GB per month."),
    choicePart("fits", "Within budget?", "Is the compressed monthly cost within the budget?", within ? "Within budget" : "Over budget", ["Within budget", "Over budget"], "Compare the monthly cost with the budget. Equal counts as within budget."),
    numPart("maxrec", "Most records", `Most millions of ${s.data} that fit the budget when compressed (round down to a whole number)`, Math.floor(d.maxRec), 0, "Work backwards: budget ÷ price gives GB; divide by the compressed GB that one million records take. Round down.", true),
    segPart(rng, { id: "plan", label: "Plan", ask: "Does it fit the budget now, and after a year of growth?", cols: ["Fits now", `Fits after ${d.g}% growth`], answer: planAns,
      opts: [["Yes", "No"], ["Yes", "No"]], hint: "Cost scales with size, so compute the cost today and the cost with the size multiplied by the growth factor; compare each with the budget." }),
  ];
  const ex = {
    rec: `**Record size:** ${d.L} × ${d.bpc} + ${d.head} = **${d.recBytes} bytes**.`,
    raw: `**Raw size:** ${d.recM} × 1,000,000 × ${d.recBytes} = ${thou(d.recM * 1e6 * d.recBytes)} bytes = **${fix(d.raw, 3)} GB**.`,
    costraw: `**Raw cost:** ${fix(d.raw, 3)} × ${d.price} = **${money(d.costRaw)}** a month.`,
    comp: `**Compressed:** ${fix(d.raw, 3)} × ${1 - d.P / 100} = **${fix(d.comp, 2)} GB**.`,
    cost: `**Monthly cost:** ${fix(d.comp, 2)} × ${d.price} = **${money(d.cost)}**.`,
    fits: `**Budget:** ${money(d.cost)} is ${within ? "at or under" : "over"} ${money(d.B)}: **${within ? "Within budget" : "Over budget"}**.`,
    maxrec: `**Most records:** ${money(d.B)} ÷ $${d.price} = ${fix(d.B / d.price, 2)} GB. One million records compress to ${fmt(d.recBytes * (1 - d.P / 100) / 1000, 4)} GB, so ${fix(d.B / d.price, 2)} ÷ ${fmt(d.recBytes * (1 - d.P / 100) / 1000, 4)} ≈ ${fix(d.maxRec, 2)}, rounded down to **${Math.floor(d.maxRec)} million**.`,
    plan: `**Plan:** now ${money(d.cost)} vs ${money(d.B)}: **${planAns[0]}**. After ${d.g}% growth the cost is ${money(d.cost12)}: **${planAns[1]}**.`,
  };
  const params = { kind: "storage", tier, recM: d.recM, recBytes: d.recBytes, L: d.L, bpc: d.bpc, head: d.head, P: d.P, price: d.price, B: d.B, g: d.g };
  const given = direct ? [["_rec", d.recBytes], ["_m", d.recM], ["_p", d.price]] : [["_chars", d.L], ["_bpc", d.bpc], ["_head", d.head], ["_m", d.recM], ["_p", d.price]];
  const hints = ["Bytes first, then gigabytes: a million records of a few hundred bytes is a few hundred megabytes.", "Compression 'cuts by P%' means the size becomes (100 − P)% of what it was."];
  if (tier === "medium") return build(`${intro} Give answers to the stated decimals.`, all, ["raw", "costraw"], ex, params, given, hints);
  if (tier === "hard") return build(`${intro} ${comp} Give answers to the stated decimals.`, all, ["raw", "comp", "cost"], ex, params, [...given, ["_pc", d.P]], hints);
  if (tier === "expert") return build(`${intro} ${comp} ${budget} Work each answer from the figures given, not from a rounded earlier answer.`, all, ["rec", "comp", "cost", "fits"], ex, params, [...given, ["_pc", d.P], ["_b", d.B]], hints);
  return build(`${intro} ${comp} ${budget} Data grows by **${d.g}%** over the next year, and the compressed size grows with it at the same price.`, all, ["comp", "cost", "maxrec", "plan"], ex, params, [...given, ["_pc", d.P], ["_b", d.B], ["_gr", d.g]], hints);
}

// ---------- entry points ----------
const GENS = { "ab-test": genAb, "kpi-review": genKpi, "query-outliers": genQuery, "storage-cost": genStorage };
const TIERS = ["medium", "hard", "expert", "expert-plus"];

export function generate({ subtopic, difficulty, rng }) {
  const g = GENS[subtopic];
  if (!g) throw new Error(`Unknown subtopic: ${subtopic}`);
  if (!TIERS.includes(difficulty)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  return g(rng, difficulty);
}

// ---------- independent verification ----------
// Every truth is recomputed from params by a different route; numbers are compared with the
// rounded truth at the part's own tolerance, choices and segments must match exactly.
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
  const T = truths(p);
  if (!T) return false;
  for (const part of question.parts) {
    const t = T[part.id];
    if (!t) return false;
    const cand = answer[part.id];
    if (t.n !== undefined) {
      const c = numOf(cand);
      if (!Number.isFinite(c) || Math.abs(c - roundTo(t.n, t.dp)) > TOL[t.dp] + 1e-9) return false;
      if (part.tolerance !== undefined && Math.abs(part.tolerance - TOL[t.dp]) > 1e-12) return false;
    } else if (t.segs) {
      if (!sameSegs(cand, t.segs)) return false;
    } else if (String(cand ?? "") !== t.s) return false;
  }
  return true;
}

function truths(p) {
  if (p.kind === "ab") {
    // Rates via integer arithmetic in basis points, then compared to the stated rule.
    const bpA = Math.round((p.cA * 10000) / p.n), bpB = Math.round((p.cB * 10000) / p.n);
    const liftBp = bpB - bpA;
    const extra = (p.V * liftBp) / 10000;
    const pB = p.cB / p.n;
    const okLift = liftBp >= Math.round(p.X * 100), okVol = extra >= p.E;
    return {
      rateb: { n: bpB / 100, dp: 2 }, lift: { n: liftBp / 100, dp: 2 }, extra: { n: extra, dp: 0 },
      decision: { s: okLift ? "Ship B" : "Keep A" },
      prob: { n: 1 - Math.exp(p.m * Math.log1p(-pB)), dp: 4 },
      need: { n: Math.ceil((p.K * p.n) / p.cB), dp: 0 },
      plan: { segs: [okLift ? "Passes" : "Fails", okVol ? "Passes" : "Fails", okLift && okVol ? "Ship B" : "Keep A"] },
    };
  }
  if (p.kind === "kpi") {
    const T0 = p.prev.reduce((a, b) => a + b, 0), T1 = p.curr.reduce((a, b) => a + b, 0);
    const delta = p.curr.map((c, k) => c - p.prev[k]);
    const chg = (T1 / T0 - 1) * 100;
    const hi = delta.indexOf(Math.max(...delta)), lo = delta.indexOf(Math.min(...delta));
    const ok = Math.round(chg * 1e6) >= p.G * 1e6;
    return {
      growth: { n: chg, dp: 1 }, contrib: { n: (delta[p.i] * 100) / T0, dp: 1 },
      driver: { s: p.names[hi] }, share: { n: (p.curr[p.i] * 100) / T1, dp: 1 },
      met: { s: ok ? "Yes" : "No" },
      need: { n: (T1 * (100 + p.g)) / 100 - (T1 - p.curr[p.i]), dp: 0 },
      rank: { segs: [p.names[hi], p.names[lo], ok ? "Yes" : "No"] },
    };
  }
  if (p.kind === "query") {
    const out = [];
    p.vals.forEach((v, k) => {
      const reg = p.regions[k];
      const pass = p.plus ? reg !== p.region && v >= p.thr : reg === p.region && v > p.thr;
      if (pass) out.push(v);
    });
    if (!out.length) return null;
    const s = out.slice().sort((a, b) => a - b);
    const mid = s.length >> 1;
    const med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    const mx = s[s.length - 1];
    const rest = s.slice(0, -1);
    const outl = mx > p.factor * med;
    return {
      rows: { n: out.length, dp: 0 }, mean: { n: out.reduce((a, b) => a + b, 0) / out.length, dp: 1 }, median: { n: med, dp: 1 },
      outlier: { s: outl ? "Yes" : "No" },
      trimmed: { n: rest.reduce((a, b) => a + b, 0) / rest.length, dp: 1 },
      call: { segs: [outl ? "An outlier" : "Not an outlier", outl ? "Median" : "Mean"] },
    };
  }
  if (p.kind === "storage") {
    const bytes = p.recM * 1e6 * p.recBytes;
    const gb = bytes / 1e9;
    if (!p.tier || (p.tier !== "medium" && p.tier !== "hard" && p.recBytes !== p.L * p.bpc + p.head)) return null;
    const comp = gb - (gb * p.P) / 100;
    const cost = comp * p.price;
    const perMillionGB = (1e6 * p.recBytes * (100 - p.P)) / 100 / 1e9;
    const fitsNow = cost <= p.B, fits12 = cost * (1 + p.g / 100) <= p.B;
    return {
      rec: { n: p.L * p.bpc + p.head, dp: 0 }, raw: { n: gb, dp: 3 }, costraw: { n: gb * p.price, dp: 2 },
      comp: { n: comp, dp: 2 }, cost: { n: cost, dp: 2 },
      fits: { s: fitsNow ? "Within budget" : "Over budget" },
      maxrec: { n: Math.floor(p.B / p.price / perMillionGB + 1e-9), dp: 0 },
      plan: { segs: [fitsNow ? "Yes" : "No", fits12 ? "Yes" : "No"] },
    };
  }
  return null;
}
