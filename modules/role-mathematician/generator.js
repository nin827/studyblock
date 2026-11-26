// Mathematician role-only generator (Expert+). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subjects. Hints and explanations use only
// values already drawn (no rng calls), and verify() rechecks every part by another route.
//
// Subtopics:
//   quality-control    statistics -> probability model -> decision            (Statistician)
//   claims-pricing     life table / claim model -> expected loss -> discounting (Actuary)
//   growth-model       exponential model -> logarithms -> rate of change        (both)
//   check-derivation   find the one wrong step in a worked derivation           (role only)

// ---------- small helpers ----------

// Round half away from zero to d places; the 1e-9 nudge absorbs binary error.
function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// True when n sits within `margin` (in units of the last place) of a rounding half-step.
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fmt = (n, d = 4) => String(roundTo(n, d));
const fmtFixed = (n, d) => roundTo(n, d).toFixed(d);
const money = (n) => `$${roundTo(n, 2) % 1 === 0 ? String(roundTo(n, 2)) : roundTo(n, 2).toFixed(2)}`;
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const STEP_LABELS = ["Step 1", "Step 2", "Step 3", "Step 4"];

// ---------- quality-control (Statistician) ----------

const QC_CONTEXTS = [
  { what: "cereal boxes", qty: "fill weight", unit: "g", base: [480, 520], line: "packing line" },
  { what: "steel bolts", qty: "length", unit: "mm", base: [60, 140], line: "lathe" },
  { what: "phone batteries", qty: "charge capacity", unit: "mAh", base: [2950, 3050], line: "cell line" },
  { what: "bottles of juice", qty: "volume", unit: "ml", base: [740, 760], line: "filling machine" },
  { what: "loaves of bread", qty: "weight", unit: "g", base: [790, 810], line: "bakery line" },
];

// Template A: sample -> mean -> population SD -> z-score of a new reading -> flag decision.
function genQcSpread(rng) {
  const ctx = rng.pick(QC_CONTEXTS);
  for (;;) {
    const n = rng.pick([5, 8, 10]);
    const base = rng.int(ctx.base[0], ctx.base[1]);
    const devs = [];
    for (let i = 0; i < n; i++) devs.push(rng.int(-7, 7));
    const data = devs.map((d) => base + d);
    const offset = rng.int(5, 16) * (rng.next() < 0.5 ? -1 : 1);
    const reading = base + offset;
    const S = sum(data);
    // The mean must be exact to 1 dp (it is for n = 5 and 10; n = 8 needs S a multiple of 4).
    if (Math.abs(roundTo(S / n, 1) * n - S) > 1e-9) continue;
    const mean = S / n;
    const sd = Math.sqrt(sum(data.map((x) => (x - mean) ** 2)) / n);
    if (sd < 1.5) continue;
    if (nearHalf(sd, 2)) continue;
    const z = (reading - mean) / sd;
    if (nearHalf(z, 2)) continue;
    // Chaining rule: z from the rounded SD must round the same.
    if (roundTo((reading - mean) / roundTo(sd, 2), 2) !== roundTo(z, 2)) continue;
    if (Math.abs(Math.abs(z) - 2) < 0.08 || Math.abs(roundTo(z, 2)) === 2) continue;
    const flag = Math.abs(z) > 2;
    const decision = flag ? "Flag for inspection" : "Within normal variation";
    const sqDevs = data.map((x) => roundTo((x - mean) ** 2, 4));
    const prompt = [
      `You are the statistician for a ${ctx.line} making ${ctx.what}. A sample of ${n} ${ctx.what} has these ${ctx.qty}s (${ctx.unit}):`,
      `\`${data.join(", ")}\``,
      `A new ${ctx.qty.split(" ").pop()} reading of **${reading} ${ctx.unit}** comes in. The team treats the sample as the whole population (divide by n) and flags any reading whose z-score is bigger than 2 in size (|z| > 2).`,
    ].join("\n\n");
    const explanation = [
      `**Mean:** the values add to ${S}, and ${S} ÷ ${n} = **${fmt(mean, 1)} ${ctx.unit}**.`,
      `**Standard deviation:** the squared deviations from ${fmt(mean, 1)} are ${sqDevs.join(", ")}. They add to ${fmt(sum(data.map((x) => (x - mean) ** 2)), 4)}; divide by ${n} and take the square root: √${fmt(sum(data.map((x) => (x - mean) ** 2)) / n, 4)} ≈ **${fmtFixed(sd, 2)} ${ctx.unit}**.`,
      `**z-score:** (${reading} − ${fmt(mean, 1)}) ÷ ${fmtFixed(sd, 2)} ≈ **${fmtFixed(z, 2)}**. In the calculator, with rows _mean and _sd for your earlier answers: \`(_new - _mean) / _sd\`.`,
      `**Decision:** |z| = ${fmtFixed(Math.abs(z), 2)} is ${flag ? "more" : "less"} than 2, so **${decision}**.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: [
        { id: "mean", label: "Mean", ask: `Mean ${ctx.qty} (${ctx.unit}), to 1 decimal place`, answerType: "number", answer: roundTo(mean, 1), tolerance: 0.05,
          hint: `Add all ${n} values, then divide by ${n}.` },
        { id: "sd", label: "Std dev", ask: `Population standard deviation (${ctx.unit}), to 2 decimal places`, answerType: "number", answer: roundTo(sd, 2), tolerance: 0.005,
          hint: `Square each value's distance from the mean, add them up, divide by ${n}, then take the square root.` },
        { id: "z", label: "z-score", ask: "z-score of the new reading, to 2 decimal places", answerType: "number", answer: roundTo(z, 2), tolerance: 0.005,
          hint: "z = (reading − mean) ÷ standard deviation. A reading below the mean gives a negative z." },
        { id: "decision", label: "Decision", ask: "What should the team do with the new reading?", answerType: "choice", answer: decision, choices: ["Flag for inspection", "Within normal variation"],
          hint: "Compare the size of z (ignore its sign) with 2." },
      ],
      explanation,
      params: { kind: "qc-spread", data, reading },
      given: givenRows([["_new", reading], ["_n", n]]),
      hints: [
        "Work in order: the mean first, then the spread around it, then how far the new reading sits from the mean in standard deviations.",
        "Population standard deviation: √( Σ(x − mean)² ÷ n ).",
      ],
    };
  }
}

// Template B: inspection counts -> defect rate -> binomial probability -> expected count -> decision.
const QC_BATCH = [
  { what: "circuit boards", fault: "faulty" },
  { what: "glass jars", fault: "cracked" },
  { what: "LED bulbs", fault: "dead" },
  { what: "printed labels", fault: "misprinted" },
];

function genQcBinomial(rng) {
  const ctx = rng.pick(QC_BATCH);
  for (;;) {
    const batches = 5;
    const size = 50; // 250 items inspected, so the rate is exact to 3 dp
    const counts = [];
    for (let i = 0; i < batches; i++) counts.push(rng.int(0, 5));
    const total = sum(counts);
    const m = rng.pick([10, 12, 15, 20]);
    const order = rng.pick([500, 1000, 1500, 2000, 2500]);
    if (total < 2 || total > 20) continue;
    const p = total / (batches * size);
    const pAccept = (1 - p) ** m + m * p * (1 - p) ** (m - 1);
    if (nearHalf(pAccept, 4)) continue;
    if (Math.abs(pAccept - 0.9) < 0.003) continue;
    const meets = pAccept >= 0.9;
    const expected = order * p;
    const decision = meets ? "Yes" : "No";
    const prompt = [
      `You are the statistician checking ${ctx.what}. Quality control inspected ${batches} batches of ${size}; the numbers ${ctx.fault} were:`,
      `| Batch | 1 | 2 | 3 | 4 | 5 |\n| --- | --- | --- | --- | --- | --- |\n| ${ctx.fault[0].toUpperCase() + ctx.fault.slice(1)} | ${counts.join(" | ")} |`,
      `Model each item as ${ctx.fault} independently with probability p, estimated from all the items inspected. ${ctx.what[0].toUpperCase() + ctx.what.slice(1)} are sold in boxes of ${m}, and a customer accepts a box with **at most 1** ${ctx.fault} item. The customer wants at least 90% of boxes accepted.`,
    ].join("\n\n");
    const explanation = [
      `**Rate:** ${total} ${ctx.fault} out of ${batches * size} inspected, so p = ${total} ÷ ${batches * size} = **${fmt(p, 3)}**.`,
      `**Box accepted:** P(0) + P(1) = (1 − p)^${m} + ${m} × p × (1 − p)^${m - 1} = ${fmt((1 - p) ** m, 4)} + ${fmt(m * p * (1 - p) ** (m - 1), 4)} ≈ **${fmtFixed(pAccept, 4)}**. In the calculator, with a row _p = ${fmt(p, 3)}: \`(1-_p)^_m + _m*_p*(1-_p)^(_m-1)\`.`,
      `**Expected count:** ${order} × ${fmt(p, 3)} = **${fmt(expected, 1)}** ${ctx.fault} items in an order of ${order}.`,
      `**Decision:** ${fmtFixed(pAccept, 4)} is ${meets ? "at least" : "below"} 0.9, so the target is ${meets ? "met" : "not met"}: **${decision}**.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: [
        { id: "rate", label: "Rate", ask: "Estimated p, as a decimal", answerType: "number", answer: roundTo(p, 3), tolerance: 0.0000001,
          hint: `Add the ${ctx.fault} counts and divide by the total number inspected, ${batches} × ${size}.` },
        { id: "accept", label: "P(accept)", ask: `Probability a box of ${m} is accepted, to 4 decimal places`, answerType: "number", answer: roundTo(pAccept, 4), tolerance: 0.00005,
          hint: `This is a binomial model with n = ${m}: add P(exactly 0) and P(exactly 1).` },
        { id: "expected", label: "Expected", ask: `Expected number ${ctx.fault} in an order of ${order}`, answerType: "number", answer: roundTo(expected, 1), tolerance: 0.05,
          hint: "Expected count = number of items × probability for one item." },
        { id: "decision", label: "Decision", ask: "Is the customer's 90% target met?", answerType: "choice", answer: decision, choices: ["Yes", "No"],
          hint: "Compare your acceptance probability with 0.9." },
      ],
      explanation,
      params: { kind: "qc-binom", counts, size, m, order },
      given: givenRows([["_m", m], ["_order", order]]),
      hints: [
        "First estimate p from the data, then use it as the probability in a binomial model.",
        "Binomial: P(X = k) = C(n, k) × p^k × (1 − p)^(n − k).",
      ],
    };
  }
}

// ---------- claims-pricing (Actuary) ----------

// Template A: life table -> survival probability -> expected deaths -> EPV of term cover -> loaded premium.
function genLifeTable(rng) {
  for (;;) {
    const age = rng.int(40, 70);
    const l0 = 100000;
    const qBase = 0.004 + (age - 40) * 0.0006;
    const ds = [];
    let l = l0;
    const ls = [l0];
    for (let k = 0; k < 3; k++) {
      const q = qBase * (1 + 0.1 * k) * (0.8 + 0.4 * rng.next());
      const d = Math.round(l * q);
      ds.push(d);
      l -= d;
      ls.push(l);
    }
    const i = rng.pick([2, 3, 4, 5, 6]);
    const benefit = rng.pick([50000, 100000, 150000, 200000, 250000]);
    const load = rng.pick([10, 15, 20, 25, 30]);
    const pool = rng.pick([1000, 2000, 4000, 5000]);
    const v = 1 / (1 + i / 100);
    const surv = ls[3] / l0;
    const exp2 = (pool * ds[1]) / l0;
    const epv = benefit * (ds[0] * v + ds[1] * v ** 2 + ds[2] * v ** 3) / l0;
    const gross = epv * (1 + load / 100);
    if (nearHalf(surv, 4) || nearHalf(exp2, 1) || nearHalf(epv, 0) || nearHalf(gross, 0)) continue;
    // Chaining rule: loading the rounded EPV must give the same premium.
    if (roundTo(roundTo(epv, 0) * (1 + load / 100), 0) !== roundTo(gross, 0)) continue;
    const prompt = [
      `You are the actuary pricing a **3-year term life policy** for applicants aged ${age}. It pays **$${benefit}** at the end of the year of death, if death happens within 3 years. Use this extract from the life table (lₓ = number alive at exact age x):`,
      `| Age x | ${age} | ${age + 1} | ${age + 2} | ${age + 3} |\n| --- | --- | --- | --- | --- |\n| lₓ | ${ls.join(" | ")} |`,
      `Interest is ${i}% a year (discount each payment back to the start), and the company adds a ${load}% loading for expenses and profit.`,
    ].join("\n\n");
    const vtxt = `v = 1 ÷ ${fmt(1 + i / 100, 2)}`;
    const explanation = [
      `**Survival:** ${ls[3]} ÷ ${l0} = **${fmtFixed(surv, 4)}**.`,
      `**Deaths each year:** ${ds.join(", ")} (differences between neighbouring lₓ). In year 2, ${ds[1]} of ${l0} die, so among ${pool} applicants the expected number is ${pool} × ${ds[1]} ÷ ${l0} = **${fmt(exp2, 1)}**.`,
      `**Expected present value:** with ${vtxt}, EPV = ${benefit} × (${ds[0]}v + ${ds[1]}v² + ${ds[2]}v³) ÷ ${l0} ≈ **$${fmt(epv, 0)}**. In the calculator: \`_B*((_l0-_l1)/(1+_i)+(_l1-_l2)/(1+_i)^2+(_l2-_l3)/(1+_i)^3)/_l0\`.`,
      `**Premium:** ${fmt(epv, 0)} × ${fmt(1 + load / 100, 2)} ≈ **$${fmt(gross, 0)}**.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: [
        { id: "survive", label: "Survival", ask: `Probability an applicant aged ${age} survives 3 years, to 4 decimal places`, answerType: "number", answer: roundTo(surv, 4), tolerance: 0.00005,
          hint: `Survival probability = number alive at age ${age + 3} ÷ number alive at age ${age}.` },
        { id: "deaths", label: "Year 2", ask: `Expected deaths in the second year among ${pool} applicants aged ${age}, to 1 decimal place`, answerType: "number", answer: roundTo(exp2, 1), tolerance: 0.05,
          hint: `Deaths in year 2 come from the drop between ages ${age + 1} and ${age + 2}; scale from ${l0} people to ${pool}.` },
        { id: "epv", label: "EPV", ask: "Expected present value of the benefit per policy ($, nearest dollar)", answerType: "number", answer: roundTo(epv, 0), tolerance: 0.5,
          hint: "For each year: benefit × probability of dying in that year × v^(year), where v = 1 ÷ (1 + i). Add the three years." },
        { id: "premium", label: "Premium", ask: "Single premium including the loading ($, nearest dollar)", answerType: "number", answer: roundTo(gross, 0), tolerance: 0.5,
          hint: `Increase the expected present value by ${load}%.` },
      ],
      explanation,
      params: { kind: "act-life", ls, i, benefit, load, pool },
      given: givenRows([["_l0", ls[0]], ["_l1", ls[1]], ["_l2", ls[2]], ["_l3", ls[3]], ["_B", benefit], ["_i", i / 100], ["_load", load / 100], ["_pool", pool]]),
      hints: [
        "Deaths in a year = lₓ at the start of that year − lₓ at the end. Divide by the starting group to get a probability.",
        "Discount a payment made at the end of year k by dividing by (1 + i)^k.",
      ],
    };
  }
}

const CLAIM_LINES = [
  { what: "home contents", unit: "policy" },
  { what: "travel", unit: "policy" },
  { what: "pet health", unit: "policy" },
  { what: "bicycle", unit: "policy" },
];

// Template B: claim frequency + severity table -> expected loss -> P(at least one claim) -> PV of losses.
function genClaims(rng) {
  const line = rng.pick(CLAIM_LINES);
  for (;;) {
    const p = rng.int(2, 12) / 100;
    const amounts = [rng.int(2, 9) * 100, rng.int(10, 30) * 100, rng.int(5, 20) * 1000];
    const probSets = [[0.6, 0.3, 0.1], [0.7, 0.2, 0.1], [0.5, 0.4, 0.1], [0.75, 0.2, 0.05], [0.8, 0.15, 0.05]];
    const probs = rng.pick(probSets);
    const m = rng.pick([10, 20, 25, 40, 50]);
    const years = rng.int(3, 6);
    const i = rng.pick([2, 3, 4, 5]);
    const sev = roundTo(sum(amounts.map((a, k) => a * probs[k])), 2);
    const loss = roundTo(p * sev, 2);
    const atLeast = 1 - (1 - p) ** m;
    let ann = 0;
    for (let k = 1; k <= years; k++) ann += (1 + i / 100) ** -k;
    const pv = loss * ann;
    if (nearHalf(atLeast, 4) || nearHalf(pv, 0) || nearHalf(p * sev, 2)) continue;
    // Chaining rule: the PV from the unrounded expected loss rounds the same.
    if (roundTo(p * sev * ann, 0) !== roundTo(pv, 0)) continue;
    const prompt = [
      `You are the actuary for a ${line.what} insurer. Each ${line.unit} has a **${fmt(p * 100, 0)}%** chance of one claim in a year (never more than one), and claims are independent. When a claim happens, its size follows this table:`,
      `| Claim size | $${amounts[0]} | $${amounts[1]} | $${amounts[2]} |\n| --- | --- | --- | --- |\n| Probability | ${probs.join(" | ")} |`,
      `A small business buys cover for **${m}** items, each its own ${line.unit}. Losses are paid at the end of each year, and the company discounts at **${i}%** a year.`,
    ].join("\n\n");
    const explanation = [
      `**Average claim:** ${amounts.map((a, k) => `${a} × ${probs[k]}`).join(" + ")} = **$${fmt(sev, 2)}**.`,
      `**Expected yearly loss per ${line.unit}:** ${fmt(p, 2)} × ${fmt(sev, 2)} = **$${fmt(loss, 2)}**.`,
      `**At least one claim among ${m}:** 1 − (1 − ${fmt(p, 2)})^${m} = 1 − ${fmt((1 - p) ** m, 4)} ≈ **${fmtFixed(atLeast, 4)}**.`,
      `**Present value for one ${line.unit} over ${years} years:** ${fmt(loss, 2)} × (v + v² + … + v^${years}) with v = 1 ÷ ${fmt(1 + i / 100, 2)}; the bracket is ${fmt(ann, 4)}, so PV ≈ **$${fmt(pv, 0)}**.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: [
        { id: "severity", label: "Avg claim", ask: "Expected size of a claim, given a claim happens ($)", answerType: "number", answer: sev, tolerance: 0.005,
          hint: "Multiply each claim size by its probability and add." },
        { id: "loss", label: "Exp. loss", ask: `Expected loss per ${line.unit} per year ($, to the cent)`, answerType: "number", answer: loss, tolerance: 0.005,
          hint: "Expected loss = probability of a claim × expected size of a claim." },
        { id: "atleast", label: "P(≥ 1 claim)", ask: `Probability of at least one claim among the ${m} items in a year, to 4 decimal places`, answerType: "number", answer: roundTo(atLeast, 4), tolerance: 0.00005,
          hint: "Use the complement: 1 − P(no claims at all), and P(no claims) multiplies the chance of no claim for each item." },
        { id: "pv", label: "PV", ask: `Present value of one ${line.unit}'s expected losses over ${years} years ($, nearest dollar)`, answerType: "number", answer: roundTo(pv, 0), tolerance: 0.5,
          hint: `Discount each year's expected loss by (1 + ${i / 100})^k for year k, then add the ${years} years.` },
      ],
      explanation,
      params: { kind: "act-claims", p, amounts, probs, m, years, i },
      given: givenRows([["_p", p], ["_a1", amounts[0]], ["_a2", amounts[1]], ["_a3", amounts[2]], ["_m", m], ["_i", i / 100], ["_n", years]]),
      hints: [
        "Split the cost into how often claims happen (frequency) and how big they are (severity).",
        "Expected loss = frequency × average severity; then discount each year's expected loss back to today.",
      ],
    };
  }
}

// ---------- growth-model (both) ----------

const GROWTH_CONTEXTS = [
  { what: "A town's population", unit: "people", noun: "population" },
  { what: "A streaming app's monthly users", unit: "users", noun: "user count" },
  { what: "A bacteria culture", unit: "cells (thousands)", noun: "culture" },
  { what: "A seabird colony", unit: "birds", noun: "colony" },
];

// Template A: two readings -> growth rate -> time to target with logs -> instantaneous rate.
function genGrowthDiscrete(rng) {
  const ctx = rng.pick(GROWTH_CONTEXTS);
  for (;;) {
    const pct = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25]);
    const r = 1 + pct / 100;
    const P0 = rng.int(4, 90) * 100;
    const P2 = P0 * r * r;
    if (Math.abs(P2 - Math.round(P2)) > 1e-6) continue;
    const mult = rng.pick([2, 2.5, 3, 4, 5]);
    const T = P0 * mult;
    const t = Math.log(T / P0) / Math.log(r);
    const at = rng.int(3, 8);
    const rate = P0 * r ** at * Math.log(r);
    if (nearHalf(t, 1) || nearHalf(rate, 0)) continue;
    const prompt = [
      `${ctx.what} is modelled as growing by the same percentage each year, \`P(t) = P₀ × rᵗ\` with t in years. It was **${P0}** ${ctx.unit} at t = 0 and **${Math.round(P2)}** ${ctx.unit} two years later.`,
      `Planners need to know when the ${ctx.noun} reaches **${T}** and how fast it is growing at t = ${at}.`,
    ].join("\n\n");
    const explanation = [
      `**Growth rate:** r² = ${Math.round(P2)} ÷ ${P0} = ${fmt(r * r, 4)}, so r = √${fmt(r * r, 4)} = ${fmt(r, 2)}: growth of **${pct}%** a year.`,
      `**Time to ${T}:** ${P0} × ${fmt(r, 2)}ᵗ = ${T}, so ${fmt(r, 2)}ᵗ = ${fmt(mult, 1)} and t = ln ${fmt(mult, 1)} ÷ ln ${fmt(r, 2)} ≈ **${fmtFixed(t, 1)} years**.`,
      `**Rate at t = ${at}:** dP/dt = P₀ × rᵗ × ln r = ${P0} × ${fmt(r, 2)}^${at} × ${fmt(Math.log(r), 4)} ≈ **${fmt(rate, 0)}** ${ctx.unit} per year. In the calculator, with a row _r = ${fmt(r, 2)}: \`_P0*_r^${at}*ln(_r)\`.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: [
        { id: "growth", label: "Growth", ask: "Yearly growth rate (%)", answerType: "number", answer: pct, tolerance: 0,
          hint: "Divide the later reading by the first to get r², take the square root, and turn r into a percentage increase." },
        { id: "time", label: "Time", ask: `Years until the ${ctx.noun} reaches ${T}, to 1 decimal place`, answerType: "number", answer: roundTo(t, 1), tolerance: 0.05,
          hint: "Divide both sides by P₀, then take logarithms: t = log(target ÷ P₀) ÷ log r." },
        { id: "rate", label: "Rate", ask: `Rate of growth at t = ${at} (${ctx.unit} per year, nearest whole number)`, answerType: "number", answer: roundTo(rate, 0), tolerance: 0.5,
          hint: "The derivative of rᵗ is rᵗ × ln r, so dP/dt = P₀ × rᵗ × ln r." },
      ],
      explanation,
      params: { kind: "grow-disc", P0, P2: Math.round(P2), T, at },
      given: givenRows([["_P0", P0], ["_P2", Math.round(P2)], ["_target", T]]),
      hints: [
        "Use the two readings to pin down r first; everything else follows from P₀ and r.",
        "Logarithms bring the unknown power down: log(rᵗ) = t × log r.",
      ],
    };
  }
}

const DECAY_CONTEXTS = [
  { what: "A radioactive tracer sample", unit: "MBq", qty: "activity", tunit: "hours", half: [4, 30] },
  { what: "A lab's isotope source", unit: "g", qty: "mass", tunit: "years", half: [5, 40] },
  { what: "A forest's stock of a slowly decaying pollutant", unit: "kg", qty: "amount", tunit: "years", half: [3, 20] },
];

// Template B: half-life -> continuous rate k -> amount at a time -> time to a fraction -> rate of decay.
function genDecay(rng) {
  const ctx = rng.pick(DECAY_CONTEXTS);
  for (;;) {
    const h = rng.int(ctx.half[0], ctx.half[1]);
    const A0 = rng.int(20, 500) * 2;
    const T = rng.int(2, 3 * h);
    const F = rng.pick([5, 10, 15, 20, 25, 30, 40]);
    const k = Math.log(2) / h;
    const kr = roundTo(k, 4);
    const amt = A0 * Math.exp(-k * T);
    const tF = Math.log(100 / F) / k;
    const rate = k * amt;
    if (nearHalf(k, 4) || nearHalf(amt, 1) || nearHalf(tF, 1) || nearHalf(rate, 2)) continue;
    // Chaining rule: working from the rounded k gives the same rounded answers.
    if (roundTo(Math.log(100 / F) / kr, 1) !== roundTo(tF, 1)) continue;
    if (roundTo(kr * A0 * Math.exp(-kr * T), 2) !== roundTo(rate, 2)) continue;
    if (roundTo(A0 * Math.exp(-kr * T), 1) !== roundTo(amt, 1)) continue;
    if (rate < 0.05) continue;
    const prompt = [
      `${ctx.what} starts with a ${ctx.qty} of **${A0} ${ctx.unit}** and has a half-life of **${h} ${ctx.tunit}**. Model it as \`A(t) = A₀ e^(−kt)\` with t in ${ctx.tunit}.`,
    ].join("\n\n");
    const explanation = [
      `**Decay constant:** half-life means e^(−k × ${h}) = ½, so k = ln 2 ÷ ${h} ≈ **${fmtFixed(k, 4)}** per ${ctx.tunit.replace(/s$/, "")}.`,
      `**After ${T} ${ctx.tunit}:** ${A0} × e^(−${fmtFixed(k, 4)} × ${T}) ≈ **${fmtFixed(amt, 1)} ${ctx.unit}** (check: ${A0} × ½^(${T}/${h}) gives the same).`,
      `**Down to ${F}%:** e^(−kt) = ${F / 100}, so t = ln(100 ÷ ${F}) ÷ k ≈ **${fmtFixed(tF, 1)} ${ctx.tunit}**.`,
      `**Rate of decay at t = ${T}:** dA/dt = −kA, so the ${ctx.qty} falls at k × A(${T}) ≈ **${fmtFixed(rate, 2)} ${ctx.unit}** per ${ctx.tunit.replace(/s$/, "")}.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: [
        { id: "k", label: "k", ask: "Decay constant k, to 4 decimal places", answerType: "number", answer: kr, tolerance: 0.00005,
          hint: "Set A(half-life) = ½ A₀ and solve for k with natural logs." },
        { id: "amount", label: "Amount", ask: `${ctx.qty[0].toUpperCase() + ctx.qty.slice(1)} after ${T} ${ctx.tunit} (${ctx.unit}), to 1 decimal place`, answerType: "number", answer: roundTo(amt, 1), tolerance: 0.05,
          hint: `Substitute t = ${T} into A₀ e^(−kt), or use A₀ × ½^(t ÷ half-life).` },
        { id: "time", label: "Time", ask: `${ctx.tunit[0].toUpperCase() + ctx.tunit.slice(1)} until only ${F}% is left, to 1 decimal place`, answerType: "number", answer: roundTo(tF, 1), tolerance: 0.05,
          hint: `Solve e^(−kt) = ${F / 100}: take ln of both sides.` },
        { id: "rate", label: "Rate", ask: `Rate of decrease at t = ${T} (${ctx.unit} per ${ctx.tunit.replace(/s$/, "")}), to 2 decimal places, as a positive number`, answerType: "number", answer: roundTo(rate, 2), tolerance: 0.005,
          hint: "Differentiate A₀ e^(−kt): the rate is −k × A(t). Give its size." },
      ],
      explanation,
      params: { kind: "grow-decay", A0, h, T, F },
      given: givenRows([["_A0", A0], ["_h", h], ["_t", T], ["_F", F / 100]]),
      hints: [
        "Find k from the half-life first; every later part uses it.",
        "ln and e undo each other: if e^(−kt) = c then −kt = ln c.",
      ],
    };
  }
}

// ---------- check-derivation (role only) ----------
// A colleague's derivation with exactly one wrong line; later lines follow correctly from it.

function stepParts(nSteps, wrong, fixValue, finalValue, finalAsk, stepHint, fixHint, finalHint, fixTol = 0, finalTol = 0) {
  return [
    { id: "step", label: "Wrong step", ask: "Which step contains the mistake?", answerType: "choice", answer: STEP_LABELS[wrong], choices: STEP_LABELS.slice(0, nSteps),
      hint: stepHint },
    { id: "fix", label: "Corrected", ask: "What should the number at the end of that step be?", answerType: "number", answer: fixValue, tolerance: fixTol,
      hint: fixHint },
    { id: "final", label: "Answer", ask: finalAsk, answerType: "number", answer: finalValue, tolerance: finalTol,
      hint: finalHint },
  ];
}

const lineFmt = (label, desc, expr) => `**${label}.** ${desc}: \`${expr}\``;

// Linear equation with a fraction: a(x − b)/c + d = e.
function genDerivLinear(rng) {
  for (;;) {
    const a = rng.int(2, 6);
    const c = rng.int(2, 5);
    const b = rng.int(1, 9);
    const t = rng.int(1, 6);
    const d = rng.int(2, 20);
    const wrong = rng.int(0, 3);
    if (a === c) continue;
    const x = b + c * t;
    const N1 = a * t;
    const e = N1 + d;
    const correct = [e - d, c * (e - d), (c * (e - d)) / a, (c * (e - d)) / a + b];
    // The colleague's lines: correct up to `wrong`, one slip there, then correct working from it.
    const shown = [];
    let prev = null;
    for (let k = 0; k < 4; k++) {
      const right = k === 0 ? e - d : k === 1 ? c * prev : k === 2 ? prev / a : prev + b;
      let v = right;
      if (k === wrong) {
        if (k === 0) v = e + d;          // added d instead of subtracting
        else if (k === 1) v = c * prev + a; // multiplication slip
        else if (k === 2) v = prev - a;   // subtracted a instead of dividing
        else v = prev - b;                // sign slip
      }
      shown.push(v);
      prev = v;
    }
    if (shown.some((v) => !Number.isInteger(v))) continue;
    if (shown[wrong] === correct[wrong]) continue;
    const eq = `${a}(x − ${b})/${c} + ${d} = ${e}`;
    const lines = [
      lineFmt("Step 1", `Subtract ${d} from both sides`, `${a}(x − ${b})/${c} = ${shown[0]}`),
      lineFmt("Step 2", `Multiply both sides by ${c}`, `${a}(x − ${b}) = ${shown[1]}`),
      lineFmt("Step 3", `Divide both sides by ${a}`, `x − ${b} = ${shown[2]}`),
      lineFmt("Step 4", `Add ${b} to both sides`, `x = ${shown[3]}`),
    ];
    const prompt = [
      `You are reviewing a colleague's derivation before it goes into a report. It solves \`${eq}\`. Exactly one step has a mistake; every other step follows correctly from the line before it.`,
      lines.join("\n\n"),
    ].join("\n\n");
    const explanation = [
      `Redo each step from the line before it: ${d} subtracted from ${e} is ${correct[0]}; × ${c} gives ${correct[1]}; ÷ ${a} gives ${correct[2]}; + ${b} gives ${correct[3]}.`,
      `The first line that doesn't follow is **Step ${wrong + 1}**: it should be **${correct[wrong]}**, not ${shown[wrong]}.`,
      `Carrying on correctly gives **x = ${x}**. Check: ${a}(${x} − ${b})/${c} + ${d} = ${a * (x - b) / c + d}.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: stepParts(4, wrong, correct[wrong], x, "Correct value of x",
        "Check each line against the one before it, not against the original equation. Later lines can be right given a wrong earlier line.",
        "Redo only that step, starting from the line above it (which is correct).",
        "Finish the derivation correctly, then substitute your x back into the original equation."),
      explanation,
      params: { kind: "der-linear", a, b, c, d, e, shown },
      given: givenRows([["_a", a], ["_b", b], ["_c", c], ["_d", d], ["_e", e]]),
      hints: [
        "Work through the steps in order and redo each one yourself.",
        "Only one step is wrong. The steps after it may look odd but are consistent with it.",
      ],
    };
  }
}

// Tangent to y = ax² + bx + c at x = p: gradient, point, intercept.
function genDerivTangent(rng) {
  for (;;) {
    const a = rng.int(2, 5);
    const b = rng.int(-6, 6);
    const c = rng.int(-9, 9);
    const p = rng.pick([-3, -2, -1, 1, 3, 4]);
    const wrong = rng.int(0, 2);
    const m = 2 * a * p + b;
    const yp = a * p * p + b * p + c;
    if (m === 0) continue;
    const correct = [m, yp, yp - m * p];
    const shown = [];
    shown[0] = wrong === 0 ? a * p + b : m;                         // forgot the 2 from differentiating
    shown[1] = wrong === 1 ? a * 2 * p + b * p + c : yp;            // squared p as 2p
    shown[2] = wrong === 2 ? shown[1] + shown[0] * p : shown[1] - shown[0] * p; // sign slip
    if (shown[wrong] === correct[wrong] || shown[0] === 0) continue;
    const curve = `y = ${a}x²${b === 0 ? "" : b > 0 ? ` + ${b}x` : ` − ${-b}x`}${c === 0 ? "" : c > 0 ? ` + ${c}` : ` − ${-c}`}`;
    const neg = (n) => (n < 0 ? `(${n})` : String(n));
    const lines = [
      lineFmt("Step 1", `Gradient: dy/dx = ${2 * a}x${b === 0 ? "" : b > 0 ? ` + ${b}` : ` − ${-b}`}, at x = ${p}`, `m = ${shown[0]}`),
      lineFmt("Step 2", `Point on the curve at x = ${p}`, `y = ${shown[1]}`),
      lineFmt("Step 3", `Intercept from y = mx + q through the point`, `q = ${shown[2]}`),
    ];
    const prompt = [
      `You are checking a derivation in a colleague's notes: the tangent to \`${curve}\` at x = ${p}, written as \`y = mx + q\`. Exactly one step has a mistake; every other step follows correctly from the lines before it.`,
      lines.join("\n\n"),
    ].join("\n\n");
    const explanation = [
      `Step 1: dy/dx = ${2 * a}x + ${neg(b)}, so at x = ${p}: m = ${2 * a} × ${neg(p)} + ${neg(b)} = ${m}.`,
      `Step 2: y = ${a} × ${neg(p)}² + ${neg(b)} × ${neg(p)} + ${neg(c)} = ${yp}.`,
      `Step 3: q = y − m × x = ${yp} − ${neg(m)} × ${neg(p)} = ${correct[2]}.`,
      `So the wrong line is **Step ${wrong + 1}**, which should be **${correct[wrong]}** (not ${shown[wrong]}), and the tangent is \`y = ${m}x + ${neg(correct[2])}\`: **q = ${correct[2]}**.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: stepParts(3, wrong, correct[wrong], correct[2], "Correct y-intercept q of the tangent",
        "Redo each line yourself: the derivative, then the curve's height, then the intercept.",
        "Redo only that step, using the earlier lines (which are correct).",
        "The tangent passes through (p, y) with gradient m, so q = y − m × p."),
      explanation,
      params: { kind: "der-tangent", a, b, c, p, shown },
      given: givenRows([["_a", a], ["_b", b], ["_c", c], ["_p", p]]),
      hints: [
        "The power rule: the derivative of ax² is 2ax, and of bx is b.",
        "Square p before multiplying by a; watch negative signs.",
      ],
    };
  }
}

// Mean and variance of a small data set via Σx and Σx².
function genDerivVariance(rng) {
  for (;;) {
    const n = rng.pick([5, 10]);
    const M = rng.int(12, 40);
    const devs = [];
    for (let k = 0; k < n - 1; k++) devs.push(rng.int(-6, 6));
    const last = -sum(devs);
    devs.push(last);
    const SS = sum(devs.map((d) => d * d));
    const errSign = rng.next() < 0.5 ? 1 : -1;
    const wrong = rng.int(0, 3);
    if (Math.abs(last) > 7 || SS % n !== 0 || SS === 0) continue;
    const data = devs.map((d) => M + d);
    const S = sum(data);
    const Q = sum(data.map((x) => x * x));
    const correct = [S, S / n, Q, Q / n - (S / n) ** 2];
    const shown = [];
    shown[0] = wrong === 0 ? S + 10 * errSign : S;                 // adding slip
    shown[1] = wrong === 1 ? shown[0] / n + errSign : shown[0] / n; // division slip
    shown[2] = wrong === 2 ? Q + 10 * errSign : Q;                 // adding slip
    shown[3] = wrong === 3 ? shown[2] / n - shown[1] : shown[2] / n - shown[1] ** 2; // forgot to square the mean
    if (shown.some((v) => !Number.isInteger(v))) continue;
    if (shown[wrong] === correct[wrong]) continue;
    const lines = [
      lineFmt("Step 1", "Add the values", `Σx = ${shown[0]}`),
      lineFmt("Step 2", `Divide by n = ${n}`, `mean = ${shown[1]}`),
      lineFmt("Step 3", "Add the squares of the values", `Σx² = ${shown[2]}`),
      lineFmt("Step 4", "Variance = Σx² ÷ n − mean²", `variance = ${shown[3]}`),
    ];
    const prompt = [
      `You are checking a colleague's summary statistics before publication. The data are \`${data.join(", ")}\`, and the variance uses the population formula (divide by n). Exactly one step has a mistake; every other step follows correctly from the lines before it.`,
      lines.join("\n\n"),
    ].join("\n\n");
    const explanation = [
      `Σx = ${S}, so the mean is ${S} ÷ ${n} = ${S / n}. Σx² = ${Q}, so the variance is ${Q} ÷ ${n} − ${S / n}² = ${Q / n} − ${(S / n) ** 2} = ${correct[3]}.`,
      `The first line that doesn't follow is **Step ${wrong + 1}**: it should be **${correct[wrong]}**, not ${shown[wrong]}.`,
      `Check another way: the squared distances from the mean add to ${SS}, and ${SS} ÷ ${n} = **${correct[3]}**.`,
    ].join("\n\n");
    return {
      prompt,
      answerType: "multi",
      parts: stepParts(4, wrong, correct[wrong], correct[3], "Correct variance",
        "Redo each line from the data and the lines above it. In the calculator, type the sums directly.",
        "Redo only that step, using the earlier lines (which are correct).",
        "Variance = Σx² ÷ n − mean², or the average squared distance from the mean."),
      explanation,
      params: { kind: "der-var", data, shown },
      given: givenRows([["_n", n]]),
      hints: [
        "Recompute Σx and Σx² from the data yourself, then compare.",
        "In Step 4 the mean must be squared before it is subtracted.",
      ],
    };
  }
}

// ---------- scenario tiers below Expert+ ----------
// Role levels Easy / Medium / Hard draw these as mixed questions:
//   medium  2 parts, simple numbers, one obvious chain
//   hard    3 parts
//   expert  3–4 parts, lighter than Expert+
// Each has its own params.kind ("…-t" with a tier), so Expert+ questions are unchanged per seed.

const TIER_IDS = ["medium", "hard", "expert"];
const FLAG = ["Flag for inspection", "Within normal variation"];

function genQcTier(rng, tier) {
  if (rng.next() < 0.5) {
    const ctx = rng.pick(QC_CONTEXTS);
    for (;;) {
      const n = tier === "medium" || tier === "expert" ? 5 : rng.pick([5, 10]);
      const base = rng.int(ctx.base[0], ctx.base[1]);
      const data = Array.from({ length: n }, () => base + rng.int(-7, 7));
      const reading = base + rng.int(5, 16) * (rng.next() < 0.5 ? -1 : 1);
      const statedSd = rng.int(20, 80) / 10;
      const S = sum(data);
      const mean = S / n;
      const sdPop = Math.sqrt(sum(data.map((x) => (x - mean) ** 2)) / n);
      const sd = tier === "medium" ? statedSd : sdPop;
      const z = (reading - mean) / sd;
      if (tier !== "medium" && (sd < 1.5 || nearHalf(sd, 2))) continue;
      if (tier !== "hard" && (nearHalf(z, 2) || roundTo((reading - mean) / roundTo(sd, 2), 2) !== roundTo(z, 2))) continue;
      if (tier === "hard" && (Math.abs(Math.abs(z) - 2) < 0.08 || (Math.abs(reading - mean) > 2 * roundTo(sd, 2)) !== (Math.abs(z) > 2))) continue;
      const decision = Math.abs(z) > 2 ? FLAG[0] : FLAG[1];
      const parts = [
        { id: "mean", label: "Mean", ask: `Mean ${ctx.qty} (${ctx.unit}), to 1 decimal place`, answerType: "number", answer: roundTo(mean, 1), tolerance: 0.05, hint: `Add all ${n} values, then divide by ${n}.` },
      ];
      if (tier !== "medium") parts.push({ id: "sd", label: "Std dev", ask: `Population standard deviation (${ctx.unit}), to 2 decimal places`, answerType: "number", answer: roundTo(sd, 2), tolerance: 0.005, hint: `Square each value's distance from the mean, add them up, divide by ${n}, then take the square root.` });
      if (tier !== "hard") parts.push({ id: "z", label: "z-score", ask: "z-score of the new reading, to 2 decimal places", answerType: "number", answer: roundTo(z, 2), tolerance: 0.005, hint: "z = (reading − mean) ÷ standard deviation. A reading below the mean gives a negative z." });
      if (tier === "hard") parts.push({ id: "decision", label: "Decision", ask: "What should the team do with the new reading?", answerType: "choice", answer: decision, choices: FLAG.slice(), hint: "Work out how far the reading is from the mean, and compare that with twice the standard deviation." });
      const rule = tier === "hard" ? " The team treats the sample as the whole population (divide by n) and flags any reading more than 2 standard deviations from the mean." : tier === "expert" ? " The team treats the sample as the whole population (divide by n)." : ` From long-run records, the standard deviation is **${fmt(sd, 1)} ${ctx.unit}**.`;
      const ex = [`**Mean:** the values add to ${S}, and ${S} ÷ ${n} = **${fmt(mean, 1)} ${ctx.unit}**.`];
      if (tier !== "medium") ex.push(`**Standard deviation:** the squared deviations from ${fmt(mean, 1)} add to ${fmt(sum(data.map((x) => (x - mean) ** 2)), 4)}; divide by ${n} and take the square root: **${fmtFixed(sd, 2)} ${ctx.unit}**.`);
      if (tier !== "hard") ex.push(`**z-score:** (${reading} − ${fmt(mean, 1)}) ÷ ${tier === "medium" ? fmt(sd, 1) : fmtFixed(sd, 2)} ≈ **${fmtFixed(z, 2)}**.`);
      if (tier === "hard") ex.push(`**Decision:** the reading is ${fmt(Math.abs(reading - mean), 1)} ${ctx.unit} from the mean, and 2 × ${fmtFixed(sd, 2)} = ${fmtFixed(2 * sd, 2)}, so **${decision}**.`);
      return {
        prompt: `You are the statistician for a ${ctx.line} making ${ctx.what}. A sample of ${n} ${ctx.what} has these ${ctx.qty}s (${ctx.unit}):\n\n\`${data.join(", ")}\`\n\nA new ${ctx.qty.split(" ").pop()} reading of **${reading} ${ctx.unit}** comes in.${rule}`,
        answerType: "multi", parts, explanation: ex.join("\n\n"),
        params: { kind: "qc-spread-t", tier, data, reading, ...(tier === "medium" ? { sd } : {}) },
        given: givenRows(tier === "medium" ? [["_new", reading], ["_n", n], ["_sd", sd]] : [["_new", reading], ["_n", n]]),
      };
    }
  }
  const ctx = rng.pick(QC_BATCH);
  for (;;) {
    const batches = tier === "medium" ? 4 : 5;
    const size = 50;
    const counts = Array.from({ length: batches }, () => rng.int(0, 5));
    const m = rng.pick([10, 12, 15, 20]);
    const order = rng.pick([500, 1000, 1500, 2000, 2500]);
    const total = sum(counts);
    if (total < 2 || total > 20) continue;
    const N = batches * size;
    const p = total / N;
    const expected = order * p;
    const p0 = (1 - p) ** m;
    const pAcc = p0 + m * p * (1 - p) ** (m - 1);
    if (tier === "hard" && nearHalf(p0, 4)) continue;
    if (tier === "expert" && (nearHalf(pAcc, 4) || Math.abs(pAcc - 0.9) < 0.003)) continue;
    const parts = [{ id: "rate", label: "Rate", ask: "Estimated p, as a decimal (exact)", answerType: "number", answer: roundTo(p, 3), tolerance: 0.0000001, hint: `Add the ${ctx.fault} counts and divide by the total number inspected, ${batches} × ${size}.` }];
    if (tier === "hard") parts.push({ id: "none", label: "P(0 in box)", ask: `Probability a box of ${m} has no ${ctx.fault} items, to 4 decimal places`, answerType: "number", answer: roundTo(p0, 4), tolerance: 0.00005, hint: `Each item is fine with probability 1 − p, independently, so multiply that ${m} times.` });
    if (tier === "expert") parts.push({ id: "accept", label: "P(accept)", ask: `Probability a box of ${m} is accepted, to 4 decimal places`, answerType: "number", answer: roundTo(pAcc, 4), tolerance: 0.00005, hint: `This is a binomial model with n = ${m}: add P(exactly 0) and P(exactly 1).` });
    if (tier !== "expert") parts.push({ id: "expected", label: "Expected", ask: `Expected number ${ctx.fault} in an order of ${order}, to 1 decimal place`, answerType: "number", answer: roundTo(expected, 1), tolerance: 0.05, hint: "Expected count = number of items × probability for one item." });
    if (tier === "expert") parts.push({ id: "decision", label: "Decision", ask: "Is the customer's 90% target met?", answerType: "choice", answer: pAcc >= 0.9 ? "Yes" : "No", choices: ["Yes", "No"], hint: "Compare your acceptance probability with 0.9." });
    const ex = [`**Rate:** ${total} ${ctx.fault} out of ${N} inspected, so p = ${total} ÷ ${N} = **${fmt(p, 3)}**.`];
    if (tier === "hard") ex.push(`**No ${ctx.fault} items in a box:** (1 − ${fmt(p, 3)})^${m} ≈ **${fmtFixed(p0, 4)}**.`);
    if (tier === "expert") ex.push(`**Box accepted:** (1 − p)^${m} + ${m} × p × (1 − p)^${m - 1} = ${fmt(p0, 4)} + ${fmt(pAcc - p0, 4)} ≈ **${fmtFixed(pAcc, 4)}**.`, `**Decision:** ${fmtFixed(pAcc, 4)} is ${pAcc >= 0.9 ? "at least" : "below"} 0.9: **${pAcc >= 0.9 ? "Yes" : "No"}**.`);
    else ex.push(`**Expected count:** ${order} × ${fmt(p, 3)} = **${fmt(expected, 1)}**.`);
    const tail = tier === "expert" ? ` They are sold in boxes of ${m}, and a customer accepts a box with **at most 1** ${ctx.fault} item. The customer wants at least 90% of boxes accepted.`
      : tier === "hard" ? ` They are sold in boxes of ${m}, and the next order is for ${order} items.` : ` The next order is for ${order} items.`;
    return {
      prompt: `You are the statistician checking ${ctx.what}. Quality control inspected ${batches} batches of ${size}; the numbers ${ctx.fault} were:\n\n| Batch | ${counts.map((_, i) => i + 1).join(" | ")} |\n| ${["---", ...counts.map(() => "---")].join(" | ")} |\n| ${ctx.fault[0].toUpperCase() + ctx.fault.slice(1)} | ${counts.join(" | ")} |\n\nModel each item as ${ctx.fault} independently with probability p, estimated from all the items inspected.${tail}`,
      answerType: "multi", parts, explanation: ex.join("\n\n"),
      params: { kind: "qc-binom-t", tier, counts, size, m, order },
      // Only figures the prompt states (box size at hard/expert, order size at medium/hard); the items inspected are worked out from the table.
      given: givenRows([...(tier === "medium" ? [] : [["_m", m]]), ...(tier === "expert" ? [] : [["_order", order]])]),
    };
  }
}

function genClaimsTier(rng, tier) {
  if (tier === "expert" && rng.next() < 0.5) {
    for (;;) {
      const age = rng.int(40, 70);
      const l0 = 100000;
      const qBase = 0.004 + (age - 40) * 0.0006;
      const ls = [l0];
      const ds = [];
      for (let k = 0; k < 3; k++) { const d = Math.round(ls[k] * qBase * (1 + 0.1 * k) * (0.8 + 0.4 * rng.next())); ds.push(d); ls.push(ls[k] - d); }
      const i = rng.pick([2, 3, 4, 5, 6]);
      const benefit = rng.pick([50000, 100000, 150000, 200000, 250000]);
      const pool = rng.pick([1000, 2000, 4000, 5000]);
      const v = 1 / (1 + i / 100);
      const surv = ls[3] / l0;
      const exp2 = (pool * ds[1]) / l0;
      const epv = (benefit * (ds[0] * v + ds[1] * v ** 2 + ds[2] * v ** 3)) / l0;
      if (nearHalf(surv, 4) || nearHalf(exp2, 1) || nearHalf(epv, 0)) continue;
      return {
        prompt: `You are the actuary pricing a **3-year term life policy** for applicants aged ${age}. It pays **$${benefit}** at the end of the year of death, if death happens within 3 years. Use this extract from the life table (lₓ = number alive at exact age x):\n\n| Age x | ${age} | ${age + 1} | ${age + 2} | ${age + 3} |\n| --- | --- | --- | --- | --- |\n| lₓ | ${ls.join(" | ")} |\n\nInterest is ${i}% a year: discount each payment back to the start.`,
        answerType: "multi",
        parts: [
          { id: "survive", label: "Survival", ask: `Probability an applicant aged ${age} survives 3 years, to 4 decimal places`, answerType: "number", answer: roundTo(surv, 4), tolerance: 0.00005, hint: `Survival probability = number alive at age ${age + 3} ÷ number alive at age ${age}.` },
          { id: "deaths", label: "Year 2", ask: `Expected deaths in the second year among ${pool} applicants aged ${age}, to 1 decimal place`, answerType: "number", answer: roundTo(exp2, 1), tolerance: 0.05, hint: `Deaths in year 2 come from the drop between ages ${age + 1} and ${age + 2}; scale from ${l0} people to ${pool}.` },
          { id: "epv", label: "EPV", ask: "Expected present value of the benefit per policy ($, nearest dollar)", answerType: "number", answer: roundTo(epv, 0), tolerance: 0.5, hint: "For each year: benefit × probability of dying in that year × v^(year), where v = 1 ÷ (1 + i). Add the three years." },
        ],
        explanation: [
          `**Survival:** ${ls[3]} ÷ ${l0} = **${fmtFixed(surv, 4)}**.`,
          `**Year 2:** deaths each year are ${ds.join(", ")}. Among ${pool} applicants: ${pool} × ${ds[1]} ÷ ${l0} = **${fmt(exp2, 1)}**.`,
          `**EPV:** with v = 1 ÷ ${fmt(1 + i / 100, 2)}, ${benefit} × (${ds[0]}v + ${ds[1]}v² + ${ds[2]}v³) ÷ ${l0} ≈ **$${fmt(epv, 0)}**.`,
        ].join("\n\n"),
        params: { kind: "act-life-t", tier, ls, i, benefit, pool },
        given: givenRows([["_l0", ls[0]], ["_l1", ls[1]], ["_l2", ls[2]], ["_l3", ls[3]], ["_B", benefit], ["_i", i / 100], ["_pool", pool]]),
      };
    }
  }
  const line = rng.pick(CLAIM_LINES);
  for (;;) {
    const p = rng.int(2, 12) / 100;
    const two = tier === "medium";
    const amounts = two ? [rng.int(2, 9) * 100, rng.int(10, 40) * 100] : [rng.int(2, 9) * 100, rng.int(10, 30) * 100, rng.int(5, 20) * 1000];
    const probs = two ? rng.pick([[0.8, 0.2], [0.75, 0.25], [0.6, 0.4], [0.9, 0.1], [0.5, 0.5]]) : rng.pick([[0.6, 0.3, 0.1], [0.7, 0.2, 0.1], [0.5, 0.4, 0.1], [0.75, 0.2, 0.05], [0.8, 0.15, 0.05]]);
    const m = rng.pick([10, 20, 25, 40, 50]);
    const years = rng.int(2, 4);
    const i = rng.pick([2, 3, 4, 5]);
    const sev = roundTo(sum(amounts.map((a, k) => a * probs[k])), 2);
    const lossX = p * sev;
    const loss = roundTo(lossX, 2);
    const atLeast = 1 - (1 - p) ** m;
    let ann = 0;
    for (let k = 1; k <= years; k++) ann += (1 + i / 100) ** -k;
    const pv = loss * ann;
    if (nearHalf(lossX, 2)) continue;
    if (tier === "hard" && nearHalf(atLeast, 4)) continue;
    if (tier === "expert" && (nearHalf(pv, 0) || roundTo(lossX * ann, 0) !== roundTo(pv, 0))) continue;
    const parts = [
      { id: "severity", label: "Avg claim", ask: "Expected size of a claim, given a claim happens ($, to the cent)", answerType: "number", answer: sev, tolerance: 0.005, hint: "Multiply each claim size by its probability and add." },
      { id: "loss", label: "Exp. loss", ask: `Expected loss per ${line.unit} per year ($, to the cent)`, answerType: "number", answer: loss, tolerance: 0.005, hint: "Expected loss = probability of a claim × expected size of a claim." },
    ];
    if (tier === "hard") parts.push({ id: "atleast", label: "P(≥ 1 claim)", ask: `Probability of at least one claim among the ${m} items in a year, to 4 decimal places`, answerType: "number", answer: roundTo(atLeast, 4), tolerance: 0.00005, hint: "Use the complement: 1 − P(no claims at all), and P(no claims) multiplies the chance of no claim for each item." });
    if (tier === "expert") parts.push({ id: "pv", label: "PV", ask: `Present value of one ${line.unit}'s expected losses over ${years} years ($, nearest dollar)`, answerType: "number", answer: roundTo(pv, 0), tolerance: 0.5, hint: `Discount each year's expected loss by (1 + ${i / 100})^k for year k, then add the ${years} years.` });
    const ex = [`**Average claim:** ${amounts.map((a, k) => `${a} × ${probs[k]}`).join(" + ")} = **$${fmt(sev, 2)}**.`, `**Expected loss:** ${fmt(p, 2)} × ${fmt(sev, 2)} = **$${fmt(loss, 2)}**.`];
    if (tier === "hard") ex.push(`**At least one claim among ${m}:** 1 − (1 − ${fmt(p, 2)})^${m} ≈ **${fmtFixed(atLeast, 4)}**.`);
    if (tier === "expert") ex.push(`**Present value:** ${fmt(loss, 2)} × (v + … + v^${years}) with v = 1 ÷ ${fmt(1 + i / 100, 2)}; the bracket is ${fmt(ann, 4)}, so PV ≈ **$${fmt(pv, 0)}**.`);
    const tail = tier === "hard" ? `\n\nA small business buys cover for **${m}** items, each its own ${line.unit}.` : tier === "expert" ? `\n\nLosses are paid at the end of each year, and the company discounts at **${i}%** a year.` : "";
    const g = [["_p", p], ...amounts.map((a, k) => [`_a${k + 1}`, a])];
    if (tier === "hard") g.push(["_m", m]);
    if (tier === "expert") g.push(["_i", i / 100], ["_n", years]);
    return {
      prompt: `You are the actuary for a ${line.what} insurer. Each ${line.unit} has a **${fmt(p * 100, 0)}%** chance of one claim in a year (never more than one), and claims are independent. When a claim happens, its size follows this table:\n\n| Claim size | ${amounts.map((a) => `$${a}`).join(" | ")} |\n| ${["---", ...amounts.map(() => "---")].join(" | ")} |\n| Probability | ${probs.join(" | ")} |${tail}`,
      answerType: "multi", parts, explanation: ex.join("\n\n"),
      params: { kind: "act-claims-t", tier, p, amounts, probs, m, years, i },
      given: givenRows(g),
    };
  }
}

function genGrowthTier(rng, tier) {
  if (tier !== "medium" && rng.next() < 0.5) {
    const ctx = rng.pick(DECAY_CONTEXTS);
    for (;;) {
      const h = rng.int(ctx.half[0], ctx.half[1]);
      const A0 = rng.int(20, 500) * 2;
      const T = rng.int(2, 3 * h);
      const F = rng.pick([5, 10, 15, 20, 25, 30, 40]);
      const k = Math.log(2) / h;
      const kr = roundTo(k, 4);
      const amt = A0 * Math.exp(-k * T);
      const tF = Math.log(100 / F) / k;
      const rate = k * amt;
      if (nearHalf(k, 4) || nearHalf(amt, 1) || roundTo(A0 * Math.exp(-kr * T), 1) !== roundTo(amt, 1)) continue;
      if (tier === "hard" && (nearHalf(tF, 1) || roundTo(Math.log(100 / F) / kr, 1) !== roundTo(tF, 1))) continue;
      if (tier === "expert" && (nearHalf(rate, 2) || roundTo(kr * A0 * Math.exp(-kr * T), 2) !== roundTo(rate, 2) || rate < 0.05)) continue;
      const tu = ctx.tunit.replace(/s$/, "");
      const parts = [
        { id: "k", label: "k", ask: "Decay constant k, to 4 decimal places", answerType: "number", answer: kr, tolerance: 0.00005, hint: "Set A(half-life) = ½ A₀ and solve for k with natural logs." },
        { id: "amount", label: "Amount", ask: `${ctx.qty[0].toUpperCase() + ctx.qty.slice(1)} after ${T} ${ctx.tunit} (${ctx.unit}), to 1 decimal place`, answerType: "number", answer: roundTo(amt, 1), tolerance: 0.05, hint: `Substitute t = ${T} into A₀ e^(−kt), or use A₀ × ½^(t ÷ half-life).` },
        tier === "hard"
          ? { id: "time", label: "Time", ask: `${ctx.tunit[0].toUpperCase() + ctx.tunit.slice(1)} until only ${F}% is left, to 1 decimal place`, answerType: "number", answer: roundTo(tF, 1), tolerance: 0.05, hint: `Solve e^(−kt) = ${F / 100}: take ln of both sides.` }
          : { id: "rate", label: "Rate", ask: `Rate of decrease at t = ${T} (${ctx.unit} per ${tu}), to 2 decimal places, as a positive number`, answerType: "number", answer: roundTo(rate, 2), tolerance: 0.005, hint: "Differentiate A₀ e^(−kt): the rate is −k × A(t). Give its size." },
      ];
      return {
        prompt: `${ctx.what} starts with a ${ctx.qty} of **${A0} ${ctx.unit}** and has a half-life of **${h} ${ctx.tunit}**. Model it as \`A(t) = A₀ e^(−kt)\` with t in ${ctx.tunit}.`,
        answerType: "multi", parts,
        explanation: [
          `**Decay constant:** e^(−k × ${h}) = ½, so k = ln 2 ÷ ${h} ≈ **${fmtFixed(k, 4)}** per ${tu}.`,
          `**After ${T} ${ctx.tunit}:** ${A0} × e^(−${fmtFixed(k, 4)} × ${T}) ≈ **${fmtFixed(amt, 1)} ${ctx.unit}**.`,
          tier === "hard" ? `**Down to ${F}%:** t = ln(100 ÷ ${F}) ÷ k ≈ **${fmtFixed(tF, 1)} ${ctx.tunit}**.` : `**Rate of decay:** dA/dt = −kA, so it falls at k × A(${T}) ≈ **${fmtFixed(rate, 2)} ${ctx.unit}** per ${tu}.`,
        ].join("\n\n"),
        params: { kind: "grow-decay-t", tier, A0, h, T, F },
        // F is stated only in the hard "time" part, so it is pre-filled only there.
        given: givenRows([["_A0", A0], ["_h", h], ["_t", T], ...(tier === "hard" ? [["_F", F / 100]] : [])]),
      };
    }
  }
  const ctx = rng.pick(GROWTH_CONTEXTS);
  for (;;) {
    const pct = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25]);
    const r = 1 + pct / 100;
    const P0 = rng.int(4, 90) * 100;
    const mult = rng.pick([2, 2.5, 3, 4, 5]);
    const at = rng.int(3, 8);
    const twoYears = tier === "hard";
    const Pk = twoYears ? P0 * r * r : P0 * r;
    if (Math.abs(Pk - Math.round(Pk)) > 1e-6) continue;
    const T = P0 * mult;
    const t = Math.log(mult) / Math.log(r);
    const val = P0 * r ** at;
    const rate = val * Math.log(r);
    if (tier === "medium" && nearHalf(val, 0)) continue;
    if (tier !== "medium" && nearHalf(t, 1)) continue;
    if (tier === "hard" && nearHalf(val, 0)) continue;
    if (tier === "expert" && nearHalf(rate, 0)) continue;
    const gap = twoYears ? "two years" : "one year";
    const parts = [{ id: "growth", label: "Growth", ask: "Yearly growth rate (%, a whole number)", answerType: "number", answer: pct, tolerance: 0,
      hint: twoYears ? "Divide the later reading by the first to get r², take the square root, and turn r into a percentage increase." : "Divide the later reading by the first to get r, then turn r into a percentage increase." }];
    if (tier !== "medium") parts.push({ id: "time", label: "Time", ask: `Years until the ${ctx.noun} reaches ${T}, to 1 decimal place`, answerType: "number", answer: roundTo(t, 1), tolerance: 0.05, hint: "Divide both sides by P₀, then take logarithms: t = log(target ÷ P₀) ÷ log r." });
    if (tier !== "expert") parts.push({ id: "value", label: "Forecast", ask: `Predicted ${ctx.noun} at t = ${at} (${ctx.unit}, nearest whole number)`, answerType: "number", answer: roundTo(val, 0), tolerance: 0.5, hint: `Substitute t = ${at} into P₀ × rᵗ.` });
    else parts.push({ id: "rate", label: "Rate", ask: `Rate of growth at t = ${at} (${ctx.unit} per year, nearest whole number)`, answerType: "number", answer: roundTo(rate, 0), tolerance: 0.5, hint: "The derivative of rᵗ is rᵗ × ln r, so dP/dt = P₀ × rᵗ × ln r." });
    const ex = [`**Growth rate:** ${twoYears ? `r² = ${Math.round(Pk)} ÷ ${P0} = ${fmt(r * r, 4)}, so r = ${fmt(r, 2)}` : `r = ${Math.round(Pk)} ÷ ${P0} = ${fmt(r, 2)}`}: growth of **${pct}%** a year.`];
    if (tier !== "medium") ex.push(`**Time to ${T}:** ${fmt(r, 2)}ᵗ = ${fmt(mult, 1)}, so t = ln ${fmt(mult, 1)} ÷ ln ${fmt(r, 2)} ≈ **${fmtFixed(t, 1)} years**.`);
    if (tier !== "expert") ex.push(`**Forecast:** ${P0} × ${fmt(r, 2)}^${at} ≈ **${fmt(val, 0)}** ${ctx.unit}.`);
    else ex.push(`**Rate at t = ${at}:** dP/dt = ${P0} × ${fmt(r, 2)}^${at} × ln ${fmt(r, 2)} ≈ **${fmt(rate, 0)}** ${ctx.unit} per year.`);
    const ask = tier === "medium" ? `Planners need a forecast for t = ${at}.` : tier === "hard" ? `Planners need to know when the ${ctx.noun} reaches **${T}**, and a forecast for t = ${at}.` : `Planners need to know when the ${ctx.noun} reaches **${T}** and how fast it is growing at t = ${at}.`;
    return {
      prompt: `${ctx.what} is modelled as growing by the same percentage each year, \`P(t) = P₀ × rᵗ\` with t in years. It was **${P0}** ${ctx.unit} at t = 0 and **${Math.round(Pk)}** ${ctx.unit} ${gap} later.\n\n${ask}`,
      answerType: "multi", parts, explanation: ex.join("\n\n"),
      params: { kind: "grow-disc-t", tier, P0, Pk: Math.round(Pk), gap: twoYears ? 2 : 1, T, at },
      given: givenRows(tier === "medium" ? [["_P0", P0], [twoYears ? "_P2" : "_P1", Math.round(Pk)]] : [["_P0", P0], [twoYears ? "_P2" : "_P1", Math.round(Pk)], ["_target", T]]),
    };
  }
}

function genDerivTier(rng, tier) {
  if (tier === "medium") {
    for (;;) {
      const a = rng.int(2, 9), x = rng.int(-6, 12), b = rng.int(1, 20), wrong = rng.int(0, 1);
      const c = a * x + b;
      const s0 = wrong === 0 ? c - b + a : c - b;
      const s1 = wrong === 1 ? s0 - a : s0 / a;
      if (!Number.isInteger(s1) || s1 === x) continue;
      const lines = [lineFmt("Step 1", `Subtract ${b} from both sides`, `${a}x = ${s0}`), lineFmt("Step 2", `Divide both sides by ${a}`, `x = ${s1}`)];
      return {
        prompt: `You are reviewing a colleague's working before it goes into a report. It solves \`${a}x + ${b} = ${c}\`. Exactly one step has a mistake; the other step follows correctly from the line before it.\n\n${lines.join("\n\n")}`,
        answerType: "multi",
        parts: [
          { id: "step", label: "Wrong step", ask: "Which step contains the mistake?", answerType: "choice", answer: STEP_LABELS[wrong], choices: STEP_LABELS.slice(0, 2), hint: "Redo each step from the line before it and compare." },
          { id: "final", label: "Answer", ask: "Correct value of x (a whole number)", answerType: "number", answer: x, tolerance: 0, hint: "Solve the equation yourself, then substitute your x back in to check." },
        ],
        explanation: `${c} − ${b} = ${c - b}, so Step 1 should read ${a}x = ${c - b}; then ÷ ${a} gives x = ${x}. The first line that doesn't follow is **Step ${wrong + 1}**, and the answer is **x = ${x}**. Check: ${a} × ${x} + ${b} = ${c}.`,
        params: { kind: "der-lin2-t", tier, a, b, c, shown: [s0, s1] },
        given: givenRows([["_a", a], ["_b", b], ["_c", c]]),
      };
    }
  }
  if (tier === "hard") {
    for (;;) {
      const a = rng.int(2, 7), b = rng.int(1, 9), t = rng.int(-5, 8), d = rng.int(2, 20), wrong = rng.int(0, 2);
      const e = a * t + d;
      const x = t + b;
      const correct = [e - d, (e - d) / a, (e - d) / a + b];
      const shown = [];
      shown[0] = wrong === 0 ? e - d + a : e - d;
      shown[1] = wrong === 1 ? shown[0] - a : shown[0] / a;
      shown[2] = wrong === 2 ? shown[1] - b : shown[1] + b;
      if (shown.some((v) => !Number.isInteger(v)) || shown[wrong] === correct[wrong]) continue;
      const lines = [lineFmt("Step 1", `Subtract ${d} from both sides`, `${a}(x − ${b}) = ${shown[0]}`), lineFmt("Step 2", `Divide both sides by ${a}`, `x − ${b} = ${shown[1]}`), lineFmt("Step 3", `Add ${b} to both sides`, `x = ${shown[2]}`)];
      return {
        prompt: `You are reviewing a colleague's derivation before it goes into a report. It solves \`${a}(x − ${b}) + ${d} = ${e}\`. Exactly one step has a mistake; every other step follows correctly from the line before it.\n\n${lines.join("\n\n")}`,
        answerType: "multi",
        parts: stepParts(3, wrong, correct[wrong], x, "Correct value of x (a whole number)",
          "Check each line against the one before it, not against the original equation.",
          "Redo only that step, starting from the line above it (which is correct). Give a whole number.",
          "Finish the derivation correctly, then substitute your x back into the original equation."),
        explanation: `Redo each step: ${e} − ${d} = ${correct[0]}; ÷ ${a} gives ${correct[1]}; + ${b} gives ${correct[2]}. The first line that doesn't follow is **Step ${wrong + 1}**: it should be **${correct[wrong]}**, not ${shown[wrong]}. So **x = ${x}**. Check: ${a}(${x} − ${b}) + ${d} = ${e}.`,
        params: { kind: "der-lin3-t", tier, a, b, d, e, shown },
        given: givenRows([["_a", a], ["_b", b], ["_d", d], ["_e", e]]),
      };
    }
  }
  for (;;) {
    const x1 = rng.int(-5, 5), dx = rng.int(1, 6), m = rng.int(-5, 6), y1 = rng.int(-12, 12), x3 = rng.int(-8, 10), wrong = rng.int(0, 2);
    const x2 = x1 + dx, y2 = y1 + m * dx;
    if (m === 0 || x3 === x1 || x3 === x2 || x1 === 0) continue;
    const q = y1 - m * x1;
    const correct = [m, q, m * x3 + q];
    const shown = [];
    shown[0] = wrong === 0 ? (y2 - y1) / (x1 - x2) : m;
    shown[1] = wrong === 1 ? y1 + shown[0] * x1 : y1 - shown[0] * x1;
    shown[2] = wrong === 2 ? shown[0] * x3 - shown[1] : shown[0] * x3 + shown[1];
    if (shown[wrong] === correct[wrong]) continue;
    const neg = (n) => (n < 0 ? `(${n})` : String(n));
    const lines = [
      lineFmt("Step 1", `Gradient through (${x1}, ${y1}) and (${x2}, ${y2})`, `m = ${shown[0]}`),
      lineFmt("Step 2", `Intercept from y = mx + q through (${x1}, ${y1})`, `q = ${shown[1]}`),
      lineFmt("Step 3", `Value of y at x = ${x3}`, `y = ${shown[2]}`),
    ];
    return {
      prompt: `You are checking a colleague's notes. They fit the straight line \`y = mx + q\` through the points (${x1}, ${y1}) and (${x2}, ${y2}), then use it to predict y at x = ${x3}. Exactly one step has a mistake; every other step follows correctly from the lines before it.\n\n${lines.join("\n\n")}`,
      answerType: "multi",
      parts: stepParts(3, wrong, correct[wrong], correct[2], `Correct value of y at x = ${x3} (a whole number)`,
        "Redo each line yourself: the gradient, then the intercept, then the prediction.",
        "Redo only that step, using the earlier lines (which are correct). Give a whole number.",
        "Use the correct gradient and intercept: y = m × x + q."),
      explanation: [
        `Step 1: m = (${y2} − ${neg(y1)}) ÷ (${x2} − ${neg(x1)}) = ${m * dx} ÷ ${dx} = ${m}.`,
        `Step 2: q = y − m × x = ${y1} − ${neg(m)} × ${neg(x1)} = ${q}.`,
        `Step 3: y = ${neg(m)} × ${neg(x3)} + ${neg(q)} = ${correct[2]}.`,
        `So the wrong line is **Step ${wrong + 1}**, which should be **${correct[wrong]}** (not ${shown[wrong]}), and the prediction is **y = ${correct[2]}**.`,
      ].join("\n\n"),
      params: { kind: "der-line-t", tier, x1, y1, x2, y2, x3, shown },
      given: givenRows([["_x1", x1], ["_y1", y1], ["_x2", x2], ["_y2", y2], ["_x3", x3]]),
    };
  }
}

const TIER_GENS = { "quality-control": genQcTier, "claims-pricing": genClaimsTier, "growth-model": genGrowthTier, "check-derivation": genDerivTier };

// Tier verification: recomputed another way (E[x²] − mean², pmf with C(m, k), running-product
// discounting, halving form of decay, central differences, substitution into the original problem).
// Tier checks compare with the rounded truth, as the quiz does; times are found by bisection.
const nearR = (cand, truth, d) => Number.isFinite(cand) && Math.abs(cand - roundTo(truth, d)) <= 0.5 * 10 ** -d + 1e-9;
function bisect(f) {
  let lo = 0, hi = 1000;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function verifyTier(question, p, answer) {
  const has = (id) => question.parts.some((x) => x.id === id);
  const choiceOk = (id, want) => { const pt = question.parts.find((x) => x.id === id); return !!pt && pt.choices.filter((c) => c === want).length === 1 && partStr(answer, id) === want; };
  if (p.kind === "qc-spread-t") {
    const n = p.data.length;
    const mean = sum(p.data) / n;
    const sd = p.tier === "medium" ? p.sd : Math.sqrt(sum(p.data.map((x) => x * x)) / n - mean * mean);
    if (!nearR(partNum(answer, "mean"), mean, 1)) return false;
    if (p.tier !== "medium" && !nearR(partNum(answer, "sd"), sd, 2)) return false;
    if (p.tier !== "hard") return nearR(partNum(answer, "z"), (p.reading - mean) / sd, 2);
    return choiceOk("decision", Math.abs(p.reading - mean) > 2 * sd ? FLAG[0] : FLAG[1]);
  }
  if (p.kind === "qc-binom-t") {
    const N = p.counts.length * p.size;
    const rate = sum(p.counts) / N;
    if (!near(partNum(answer, "rate"), rate, 1e-7)) return false;
    if (p.tier === "hard" && !nearR(partNum(answer, "none"), choose(p.m, 0) * (1 - rate) ** p.m, 4)) return false;
    if (p.tier === "expert") {
      let acc = 0;
      for (let k = 0; k <= 1; k++) acc += choose(p.m, k) * rate ** k * (1 - rate) ** (p.m - k);
      return nearR(partNum(answer, "accept"), acc, 4) && choiceOk("decision", acc >= 0.9 ? "Yes" : "No");
    }
    return nearR(partNum(answer, "expected"), (p.order * sum(p.counts)) / N, 1);
  }
  if (p.kind === "act-life-t") {
    const [l0, l1, l2, l3] = p.ls;
    if (!(l0 > l1 && l1 > l2 && l2 > l3 && l3 > 0)) return false;
    let disc = 1, epv = 0;
    for (let k = 0; k < 3; k++) { disc /= 1 + p.i / 100; epv += p.benefit * ((p.ls[k] - p.ls[k + 1]) / l0) * disc; }
    return nearR(partNum(answer, "survive"), 1 - (l0 - l3) / l0, 4) && nearR(partNum(answer, "deaths"), (p.pool * (l1 - l2)) / l0, 1) && nearR(partNum(answer, "epv"), epv, 0);
  }
  if (p.kind === "act-claims-t") {
    if (Math.abs(sum(p.probs) - 1) > 1e-9) return false;
    let sev = 0;
    p.probs.forEach((pr, k) => { sev += pr * p.amounts[k]; });
    const loss = sev * p.p;
    if (!nearR(partNum(answer, "severity"), sev, 2) || !nearR(partNum(answer, "loss"), loss, 2)) return false;
    if (p.tier === "hard") { let none = 1; for (let k = 0; k < p.m; k++) none *= 1 - p.p; return nearR(partNum(answer, "atleast"), 1 - none, 4); }
    if (p.tier === "expert") { const i = p.i / 100; return nearR(partNum(answer, "pv"), (roundTo(loss, 2) * (1 - (1 + i) ** -p.years)) / i, 0); }
    return !has("atleast") && !has("pv");
  }
  if (p.kind === "grow-disc-t") {
    const g = partNum(answer, "growth");
    if (!Number.isInteger(g) || g <= 0) return false;
    const r = 1 + g / 100;
    if (Math.abs(p.P0 * r ** p.gap - p.Pk) > 1e-6) return false;
    const P = (s) => p.P0 * Math.exp(s * Math.log(r));
    if (p.tier !== "medium" && !nearR(partNum(answer, "time"), bisect((s) => P(s) - p.T), 1)) return false;
    if (p.tier !== "expert") return nearR(partNum(answer, "value"), P(p.at), 0);
    const h = 1e-5;
    return nearR(partNum(answer, "rate"), (P(p.at + h) - P(p.at - h)) / (2 * h), 0);
  }
  if (p.kind === "grow-decay-t") {
    if (!nearR(partNum(answer, "k"), -Math.log(0.5) / p.h, 4)) return false;
    const A = (s) => p.A0 * 0.5 ** (s / p.h);
    if (!nearR(partNum(answer, "amount"), A(p.T), 1)) return false;
    if (p.tier === "hard") return nearR(partNum(answer, "time"), bisect((s) => (p.A0 * p.F) / 100 - A(s)), 1);
    const h = 1e-6;
    return nearR(partNum(answer, "rate"), -(A(p.T + h) - A(p.T - h)) / (2 * h), 2);
  }
  const s = p.shown;
  let expect, finalOk;
  const fin = partNum(answer, "final");
  if (p.kind === "der-lin2-t") {
    expect = [p.c - p.b, s[0] / p.a];
    finalOk = Number.isInteger(fin) && p.a * fin + p.b === p.c;
  } else if (p.kind === "der-lin3-t") {
    expect = [p.e - p.d, s[0] / p.a, s[1] + p.b];
    finalOk = Number.isInteger(fin) && p.a * (fin - p.b) + p.d === p.e;
  } else if (p.kind === "der-line-t") {
    expect = [(p.y2 - p.y1) / (p.x2 - p.x1), p.y1 - s[0] * p.x1, s[0] * p.x3 + s[1]];
    // Two-point form: y = y1 + (y2 − y1)(x3 − x1)/(x2 − x1).
    finalOk = Math.abs(fin - (p.y1 + ((p.y2 - p.y1) * (p.x3 - p.x1)) / (p.x2 - p.x1))) < 1e-9;
  } else return false;
  const bad = [];
  for (let k = 0; k < s.length; k++) if (Math.abs(s[k] - expect[k]) > 1e-9) bad.push(k);
  if (bad.length !== 1 || !finalOk) return false;
  const w = bad[0];
  if (!choiceOk("step", STEP_LABELS[w])) return false;
  return p.kind === "der-lin2-t" ? !has("fix") : partNum(answer, "fix") === expect[w];
}

// ---------- dispatch ----------

export function generate({ subtopic, difficulty, rng }) {
  if (TIER_IDS.includes(difficulty)) {
    const t = TIER_GENS[subtopic];
    if (!t) throw new Error(`Unknown subtopic: ${subtopic}`);
    return t(rng, difficulty);
  }
  if (difficulty !== "expert-plus") throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "quality-control") return rng.next() < 0.5 ? genQcSpread(rng) : genQcBinomial(rng);
  if (subtopic === "claims-pricing") return rng.next() < 0.5 ? genLifeTable(rng) : genClaims(rng);
  if (subtopic === "growth-model") return rng.next() < 0.5 ? genGrowthDiscrete(rng) : genDecay(rng);
  if (subtopic === "check-derivation") {
    const t = rng.int(0, 2);
    if (t === 0) return genDerivLinear(rng);
    if (t === 1) return genDerivTangent(rng);
    return genDerivVariance(rng);
  }
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route where one exists,
// and the candidate must round to it (or match it exactly).

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => (answer && typeof answer === "object" && answer[id] !== undefined ? String(answer[id]) : "");
// The candidate is within tol of the true value and the true value is not on a half-step.
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

// n choose k by multiplication (not factorials).
function choose(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  const parts = question.parts;
  if (!Array.isArray(parts)) return false;

  if (p.kind === "qc-spread") {
    const n = p.data.length;
    const mean = sum(p.data) / n;
    // Variance by E[x²] − mean² (the generator used the average squared deviation).
    const variance = sum(p.data.map((x) => x * x)) / n - mean * mean;
    const sd = Math.sqrt(variance);
    const z = (p.reading - mean) / sd;
    const want = Math.abs(z) > 2 ? "Flag for inspection" : "Within normal variation";
    return near(partNum(answer, "mean"), mean, 0.05)
      && near(partNum(answer, "sd"), sd, 0.005)
      && near(partNum(answer, "z"), z, 0.005)
      && partStr(answer, "decision") === want;
  }
  if (p.kind === "qc-binom") {
    const N = p.counts.length * p.size;
    const rate = sum(p.counts) / N;
    // P(X ≤ 1) via the binomial pmf with C(m, k).
    let acc = 0;
    for (let k = 0; k <= 1; k++) acc += choose(p.m, k) * rate ** k * (1 - rate) ** (p.m - k);
    const want = acc >= 0.9 ? "Yes" : "No";
    return near(partNum(answer, "rate"), rate, 1e-7)
      && near(partNum(answer, "accept"), acc, 0.00005)
      && near(partNum(answer, "expected"), p.order * rate, 0.05)
      && partStr(answer, "decision") === want;
  }
  if (p.kind === "act-life") {
    const [l0, l1, l2, l3] = p.ls;
    if (!(l0 > l1 && l1 > l2 && l2 > l3 && l3 > 0)) return false;
    // EPV by building the discount factors as a running product.
    let disc = 1;
    let epv = 0;
    for (let k = 0; k < 3; k++) {
      disc /= 1 + p.i / 100;
      epv += p.benefit * ((p.ls[k] - p.ls[k + 1]) / l0) * disc;
    }
    const gross = epv + epv * (p.load / 100);
    return near(partNum(answer, "survive"), 1 - (l0 - l3) / l0, 0.00005)
      && near(partNum(answer, "deaths"), p.pool * (l1 - l2) / l0, 0.05)
      && near(partNum(answer, "epv"), epv, 0.5)
      && near(partNum(answer, "premium"), gross, 0.5);
  }
  if (p.kind === "act-claims") {
    if (Math.abs(sum(p.probs) - 1) > 1e-9) return false;
    let sev = 0;
    for (let k = 0; k < 3; k++) sev += p.probs[k] * p.amounts[k];
    const loss = sev * p.p;
    // Probability of no claims by repeated multiplication; PV via the annuity formula.
    let none = 1;
    for (let k = 0; k < p.m; k++) none *= 1 - p.p;
    const i = p.i / 100;
    const ann = (1 - (1 + i) ** -p.years) / i;
    return near(partNum(answer, "severity"), sev, 0.005)
      && near(partNum(answer, "loss"), loss, 0.005)
      && near(partNum(answer, "atleast"), 1 - none, 0.00005)
      && near(partNum(answer, "pv"), roundTo(loss, 2) * ann, 0.5);
  }
  if (p.kind === "grow-disc") {
    const g = partNum(answer, "growth");
    if (!Number.isInteger(g) || g <= 0) return false;
    const r = 1 + g / 100;
    // The candidate rate must reproduce the second reading exactly.
    if (Math.abs(p.P0 * r * r - p.P2) > 1e-6) return false;
    const t = partNum(answer, "time");
    // P(t) must straddle the target within ±0.05 years of the candidate.
    const P = (s) => p.P0 * r ** s;
    const timeOk = Number.isFinite(t) && P(t - 0.05) < p.T && P(t + 0.05) > p.T;
    // Rate by a central difference.
    const h = 1e-5;
    const rate = (P(p.at + h) - P(p.at - h)) / (2 * h);
    return timeOk && near(partNum(answer, "rate"), rate, 0.5 + 1e-3);
  }
  if (p.kind === "grow-decay") {
    const k = partNum(answer, "k");
    const kTrue = -Math.log(0.5) / p.h;
    if (!near(k, kTrue, 0.00005)) return false;
    // Amount by halving: A0 × 0.5^(t/h).
    const A = (s) => p.A0 * 0.5 ** (s / p.h);
    const t = partNum(answer, "time");
    const timeOk = Number.isFinite(t) && A(t - 0.05) > p.A0 * p.F / 100 && A(t + 0.05) < p.A0 * p.F / 100;
    const h = 1e-6;
    const rate = -(A(p.T + h) - A(p.T - h)) / (2 * h);
    return near(partNum(answer, "amount"), A(p.T), 0.05) && timeOk && near(partNum(answer, "rate"), rate, 0.005 + 1e-6);
  }
  if (p.kind && p.kind.endsWith("-t")) { try { return verifyTier(question, p, answer); } catch { return false; } }
  if (p.kind && p.kind.startsWith("der-")) return verifyDerivation(p, answer);
  return false;
}

// For a derivation: each step's expected value from the lines shown before it; exactly one
// line must disagree, and the final answer must satisfy the original problem.
function verifyDerivation(p, answer) {
  const s = p.shown;
  let expect;
  let finalOk;
  const fin = partNum(answer, "final");
  if (p.kind === "der-linear") {
    expect = [p.e - p.d, p.c * s[0], s[1] / p.a, s[2] + p.b];
    finalOk = Number.isInteger(fin) && p.a * (fin - p.b) === p.c * (p.e - p.d);
  } else if (p.kind === "der-tangent") {
    expect = [2 * p.a * p.p + p.b, p.a * p.p * p.p + p.b * p.p + p.c, s[1] - s[0] * p.p];
    // Tangent intercept identity for y = ax² + bx + c at x = p: q = c − a p².
    finalOk = fin === p.c - p.a * p.p * p.p;
  } else if (p.kind === "der-var") {
    const n = p.data.length;
    expect = [sum(p.data), s[0] / n, sum(p.data.map((x) => x * x)), s[2] / n - s[1] * s[1]];
    const mean = sum(p.data) / n;
    finalOk = Math.abs(fin - sum(p.data.map((x) => (x - mean) ** 2)) / n) < 1e-9;
  } else return false;
  const bad = [];
  for (let k = 0; k < s.length; k++) if (Math.abs(s[k] - expect[k]) > 1e-9) bad.push(k);
  if (bad.length !== 1) return false;
  const w = bad[0];
  return partStr(answer, "step") === STEP_LABELS[w] && partNum(answer, "fix") === expect[w] && finalOk;
}
