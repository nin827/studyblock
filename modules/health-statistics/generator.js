// Health Statistics generator: population-level epidemiology arithmetic. Uses only the seeded rng
// passed in by the engine. Every term is defined in the prompt, because textbook definitions vary.
// Percentages and rates are rounded to 1 decimal place (tolerance 0.05); ratios (relative risk,
// odds, odds ratio) and means to 2 decimal places (tolerance 0.005). Easy answers are whole.
// No named conditions, no treatments, nothing about individuals.

// ---------- number helpers ----------

// Round half away from zero to dp places; the 1e-9 nudge absorbs binary error.
const roundTo = (n, dp) => {
  const f = 10 ** dp;
  return (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
};
const tolOf = (dp) => (dp === 0 ? 0 : 0.5 / 10 ** dp);

// Answer/choice text: whole answers as-is, rounded answers with exactly dp decimals; never "-0".
function fmtAns(n, dp) {
  const r = roundTo(n, dp);
  const v = Object.is(r, -0) ? 0 : r;
  return dp > 0 ? v.toFixed(dp) : String(v);
}

// Intermediate values in explanations: shortest form, up to 4 decimals; never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// 12500 -> "12,500" (prompts only; answers are typed without separators).
const big = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// True when the exact value sits (almost) on a rounding half-step, so two answers would pass.
function onHalfStep(exact, dp) {
  if (dp === 0) return !Number.isInteger(roundTo(exact, 6));
  const s = Math.abs(exact) * 10 ** dp;
  return Math.abs(s - Math.floor(s) - 0.5) < 1e-6;
}

const DP_NOTE = { 0: " Give a whole number.", 1: " Round to 1 decimal place.", 2: " Round to 2 decimal places." };
const PCT_NOTE = (dp) => ` Give it as a percentage without the % sign${dp ? ", rounded to 1 decimal place" : " (a whole number)"}.`;

// Final line of an explanation: "= **12**" or "≈ 12.3333, which rounds to **12.3**".
function result(exact, dp, suffix = "") {
  const shown = fmtAns(exact, dp);
  if (dp === 0 || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${suffix}**`;
  return `≈ ${exact.toFixed(dp + 2)}${suffix}, which rounds to **${shown}${suffix}**`;
}

// 4 unique numeric choices: the correct one + 3 distractors from common mistakes, topped up with
// nearby values. Options that would also pass the tolerance are skipped.
function buildChoices(correct, candidates, dp, rng, bounds = {}) {
  const lo = bounds.lo ?? 0;
  const hi = bounds.hi ?? Infinity;
  const step = bounds.step ?? (dp === 0 ? 1 : dp === 1 ? 0.5 : 0.05);
  const correctStr = fmtAns(correct, dp);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v < lo || v > hi) return;
    if (dp === 0 && !Number.isInteger(roundTo(v, 6))) return;
    const s = fmtAns(v, dp);
    if (Math.abs(Number(s) - correct) <= tolOf(dp) + 1e-9) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 1000; k++) {
    tryAdd(correct + k * step);
    tryAdd(correct - k * step);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Typed number (65%) or multiple choice (35%).
function finish(base, exact, dp, candidates, rng, bounds) {
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, dp, rng, bounds);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: roundTo(exact, dp), answerType: "number", choices: undefined, tolerance: tolOf(dp) };
}

const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));

function checkDifficulty(d) {
  if (d !== "easy" && d !== "medium" && d !== "hard") throw new Error(`Unknown difficulty: ${d}`);
}

// Retry a builder until it returns a well-posed question (no half-step answers, no zero cells).
function retry(rng, build) {
  for (let i = 0; i < 200; i++) {
    const q = build();
    if (q) return q;
  }
  throw new Error("health-statistics: could not build a well-posed question");
}

const PLACES = ["a town", "a city", "a district", "a region", "an island community", "a county", "a rural area", "a coastal town"];
const MULT_WORD = { 100: "100", 1000: "1,000", 100000: "100,000" };

// ---------- Rates ----------

function genRates(difficulty, rng) {
  checkDifficulty(difficulty);
  const place = rng.pick(PLACES);
  const kinds = difficulty === "easy" ? ["prevalence", "incidence", "change"]
    : difficulty === "medium" ? ["prevalence", "incidence", "births", "expected"]
    : ["incidence", "change", "rate-change", "rate-multi"];
  const kind = rng.pick(kinds);

  if (kind === "prevalence") {
    return retry(rng, () => {
      let pop, cases, dp;
      if (difficulty === "easy") {
        const p = rng.int(2, 30);
        pop = 100 * rng.int(5, 200);
        cases = (pop * p) / 100;
        dp = 0;
      } else {
        pop = rng.int(20, 600) * 50;
        cases = rng.int(Math.ceil(pop * 0.005), Math.floor(pop * 0.25));
        dp = 1;
      }
      const exact = (cases / pop) * 100;
      if (onHalfStep(exact, dp)) return null;
      const prompt = `On one survey day, ${big(cases)} of the ${big(pop)} people in ${place} were living with a long-term condition. ` +
        `Prevalence is the share of the population that has the condition at that time: people with the condition ÷ population. What is the prevalence?${PCT_NOTE(dp)}`;
      const explanation = `Prevalence = people with the condition ÷ population, × 100 for a percentage.\n\n` +
        `\`_cases / _pop * 100\` = \`${cases} / ${pop} * 100\` ${result(exact, dp, "%")}`;
      const hints = [
        "Prevalence counts everyone who has the condition on that day, divided by the whole population.",
        `Here that is \`_cases / _pop\` = ${big(cases)} ÷ ${big(pop)}, which gives a proportion between 0 and 1.`,
        `Multiply the proportion by 100 to turn it into a percentage.${dp ? " Round to 1 decimal place." : ""}`,
      ];
      const base = { prompt, explanation, hints, given: givenRows([["_cases", cases], ["_pop", pop]]),
        params: { kind: "ratio", values: { num: cases, den: pop, mult: 100 }, dp } };
      return finish(base, exact, dp, [(pop / cases) * 100 / 100, (cases / pop) * 1000, cases / pop, ((pop - cases) / pop) * 100], rng, { hi: 100 });
    });
  }

  if (kind === "incidence") {
    return retry(rng, () => {
      let pop, cases, mult, dp;
      if (difficulty === "easy") {
        mult = 1000;
        const k = rng.int(2, 60);
        pop = 1000 * k;
        cases = k * rng.int(1, 20);
        dp = 0;
      } else {
        mult = rng.pick([1000, 100000]);
        pop = mult === 1000 ? rng.int(8, 400) * 250 : rng.int(40, 2000) * 1000;
        const perUnit = mult === 1000 ? rng.int(10, 400) / 10 : rng.int(50, 9000) / 10;
        cases = Math.max(1, Math.round((pop * perUnit) / mult) + rng.int(-3, 3));
        dp = 1;
      }
      const exact = (cases / pop) * mult;
      if (onHalfStep(exact, dp)) return null;
      const year = rng.int(2015, 2025);
      const M = MULT_WORD[mult];
      const prompt = `During ${year}, ${big(cases)} new cases of a condition were recorded in ${place} with a population of ${big(pop)}. ` +
        `Incidence = new cases in the year ÷ population × ${M}. What was the incidence per ${M} people per year?${DP_NOTE[dp]}`;
      const explanation = `Incidence counts *new* cases over a period, scaled to a standard population size.\n\n` +
        `\`_cases / _pop * ${mult}\` = \`${cases} / ${pop} * ${mult}\` ${result(exact, dp)} new cases per ${M} people per year.`;
      const hints = [
        `Divide the new cases by the population to get the proportion of people who became new cases (\`_cases / _pop\`).`,
        `The rate is "per ${M} people", so the last step multiplies that proportion by ${M}.${dp ? " Round to 1 decimal place." : ""}`,
      ];
      const wrongMult = mult === 1000 ? [exact * 100, exact / 10] : [exact / 100, exact * 10];
      const base = { prompt, explanation, hints, given: givenRows([["_cases", cases], ["_pop", pop]]),
        params: { kind: "ratio", values: { num: cases, den: pop, mult }, dp } };
      return finish(base, exact, dp, [...wrongMult, exact * 1.1, exact * 0.9], rng);
    });
  }

  if (kind === "births") {
    return retry(rng, () => {
      const pop = rng.int(40, 2000) * 500;
      const births = Math.round((pop * rng.int(60, 180)) / 10000) + rng.int(-5, 5);
      const exact = (births / pop) * 1000;
      if (onHalfStep(exact, 1) || births < 1) return null;
      const prompt = `In one year, ${place} with a mid-year population of ${big(pop)} recorded ${big(births)} live births. ` +
        `The crude birth rate = births in the year ÷ mid-year population × 1,000. What was the crude birth rate per 1,000 people?${DP_NOTE[1]}`;
      const explanation = `"Crude" means the whole population is used, with no adjustment for age.\n\n` +
        `\`_births / _pop * 1000\` = \`${births} / ${pop} * 1000\` ${result(exact, 1)} births per 1,000 people.`;
      const hints = [
        "A crude rate divides the count by the whole population, then scales it to a standard size.",
        `Work out \`_births / _pop\` (${big(births)} ÷ ${big(pop)}), then multiply by 1,000. Round to 1 decimal place.`,
      ];
      const base = { prompt, explanation, hints, given: givenRows([["_births", births], ["_pop", pop]]),
        params: { kind: "ratio", values: { num: births, den: pop, mult: 1000 }, dp: 1 } };
      return finish(base, exact, 1, [exact * 100, exact / 10, (pop / births) / 10, exact + 1], rng);
    });
  }

  if (kind === "expected") {
    return retry(rng, () => {
      const rate = rng.int(2, 60) / (rng.next() < 0.5 ? 1 : 2);
      const pop = rng.int(4, 300) * 1000;
      const exact = (rate * pop) / 1000;
      if (!Number.isInteger(roundTo(exact, 6))) return null;
      const prompt = `A condition has an incidence of ${num(rate)} new cases per 1,000 people per year. ${place[0].toUpperCase() + place.slice(1)} has ${big(pop)} people. ` +
        `If the rate stays the same, how many new cases would you expect there in one year?${DP_NOTE[0]}`;
      const explanation = `Reverse the rate: cases = rate × population ÷ 1,000.\n\n` +
        `\`_rate * _pop / 1000\` = \`${num(rate)} * ${pop} / 1000\` ${result(exact, 0)} new cases.`;
      const hints = [
        "The rate is per 1,000 people, so first find how many groups of 1,000 people there are.",
        `${big(pop)} ÷ 1,000 = ${num(pop / 1000)} groups. Each group is expected to have ${num(rate)} new cases.`,
      ];
      const base = { prompt, explanation, hints, given: givenRows([["_rate", rate], ["_pop", pop]]),
        params: { kind: "expected", values: { rate, pop, mult: 1000 }, dp: 0 } };
      return finish(base, exact, 0, [exact * 10, exact / 10, rate * pop / 100, pop / rate], rng);
    });
  }

  if (kind === "change") {
    // Percentage change in the number of cases between two years.
    return retry(rng, () => {
      let a, b, dp;
      if (difficulty === "easy") {
        a = rng.int(2, 40) * 20;
        const pct = rng.int(-9, 12) * 5;
        if (pct === 0) return null;
        b = (a * (100 + pct)) / 100;
        dp = 0;
      } else {
        a = rng.int(120, 3000);
        b = Math.round(a * (rng.int(50, 160) / 100));
        dp = 1;
      }
      if (a === b || !Number.isInteger(b)) return null;
      const exact = ((b - a) / a) * 100;
      if (onHalfStep(exact, dp)) return null;
      const y1 = rng.int(2012, 2022);
      const y2 = y1 + rng.int(1, 3);
      const prompt = `${place[0].toUpperCase() + place.slice(1)} recorded ${big(a)} new cases of a condition in ${y1} and ${big(b)} in ${y2}. ` +
        `What is the percentage change from ${y1} to ${y2}? Percentage change = (new - old) ÷ old × 100; use a minus sign for a decrease.${dp ? " Round to 1 decimal place." : " Give a whole number."}`;
      const explanation = `Compare the change with the *starting* (old) value.\n\n` +
        `Change: \`_new - _old\` = \`${b} - ${a}\` = ${num(b - a)}.\n\n` +
        `\`(_new - _old) / _old * 100\` = \`${num(b - a)} / ${a} * 100\` ${result(exact, dp, "%")}`;
      const hints = [
        `Start with the change: subtract the ${y1} count from the ${y2} count. A fall gives a negative change.`,
        `Divide the change by the old value, ${big(a)} (not by the new one), then multiply by 100.${dp ? " Round to 1 decimal place." : ""}`,
      ];
      const base = { prompt, explanation, hints, given: givenRows([["_old", a], ["_new", b]]),
        params: { kind: "change", values: { old: a, now: b }, dp } };
      return finish(base, exact, dp, [((b - a) / b) * 100, -exact, b - a, (b / a) * 100], rng, { lo: -Infinity });
    });
  }

  // Hard: rates in two years with different populations; change in the rate.
  return retry(rng, () => {
    const p1 = rng.int(50, 900) * 1000;
    const p2 = p1 + rng.int(-40, 80) * 1000;
    const c1 = rng.int(40, 2500);
    const c2 = Math.max(1, Math.round(c1 * rng.int(60, 150) / 100 * p2 / p1));
    if (p2 <= 0 || c1 === c2) return null;
    const r1 = (c1 / p1) * 100000;
    const r2 = (c2 / p2) * 100000;
    const ch = ((r2 - r1) / r1) * 100;
    if (onHalfStep(r1, 1) || onHalfStep(r2, 1) || onHalfStep(ch, 1) || Math.abs(ch) < 0.5) return null;
    const y1 = rng.int(2012, 2020);
    const y2 = y1 + rng.int(2, 5);
    const P = place[0].toUpperCase() + place.slice(1);
    const scen = `${P} had ${big(c1)} new cases of a condition in ${y1}, when its population was ${big(p1)}, and ${big(c2)} new cases in ${y2}, when its population was ${big(p2)}. ` +
      `Incidence rate = new cases ÷ population × 100,000.`;
    const g = givenRows([["_c1", c1], ["_p1", p1], ["_c2", c2], ["_p2", p2]]);
    const lines = `Rate in ${y1}: \`_r1 = _c1 / _p1 * 100000\` = \`${c1} / ${p1} * 100000\` ${result(r1, 1)}.\n\n` +
      `Rate in ${y2}: \`_r2 = _c2 / _p2 * 100000\` = \`${c2} / ${p2} * 100000\` ${result(r2, 1)}.\n\n` +
      `Change in the rate: \`(_r2 - _r1) / _r1 * 100\` (with the unrounded rates) ${result(ch, 1, "%")}`;
    const expl = `Because the population changed, compare *rates*, not raw counts.\n\n${lines}`;
    const pctAsk = `What is the percentage change in the incidence rate from ${y1} to ${y2}? Percentage change = (new - old) ÷ old × 100, using the unrounded rates; use a minus sign for a decrease. Round to 1 decimal place.`;

    if (kind === "rate-multi") {
      const parts = [
        { id: "rate1", label: `Rate in ${y1}`, ask: `What was the incidence rate per 100,000 people in ${y1}? Round to 1 decimal place.`,
          answerType: "number", answer: roundTo(r1, 1), tolerance: 0.05,
          hint: `Divide the ${y1} cases by the ${y1} population (\`_c1 / _p1\`), then multiply by 100,000.` },
        { id: "rate2", label: `Rate in ${y2}`, ask: `What was the incidence rate per 100,000 people in ${y2}? Round to 1 decimal place.`,
          answerType: "number", answer: roundTo(r2, 1), tolerance: 0.05,
          hint: `Same method with the ${y2} numbers: \`_c2 / _p2\`, then × 100,000.` },
        { id: "change", label: "Percentage change", ask: pctAsk.replace(/^What is/, "What was"),
          answerType: "number", answer: roundTo(ch, 1), tolerance: 0.05,
          hint: "Subtract the first rate from the second, divide by the first rate, then multiply by 100. Keep full precision until the end." },
      ];
      return {
        prompt: scen, answerType: "multi", parts, explanation: expl,
        hints: ["Work out each year's rate separately, each with its own population. Then compare the two rates."],
        given: g,
        params: { multi: true, values: { c1, p1, c2, p2 }, parts: [{ id: "rate1", kind: "rate1" }, { id: "rate2", kind: "rate2" }, { id: "change", kind: "rchange" }] },
      };
    }
    if (kind === "rate-change") {
      const prompt = `${scen} ${pctAsk}`;
      const hints = [
        "The population changed, so compare incidence rates rather than raw counts.",
        `Rate in each year: cases ÷ population × 100,000, so \`_c1 / _p1 * 100000\` and \`_c2 / _p2 * 100000\`.`,
        "Then take (new rate - old rate) ÷ old rate × 100. Keep full precision and round only at the end.",
      ];
      const base = { prompt, explanation: expl, hints, given: g, params: { kind: "rchange", values: { c1, p1, c2, p2 }, dp: 1 } };
      return finish(base, ch, 1, [((c2 - c1) / c1) * 100, ((r2 - r1) / r2) * 100, r2 - r1, -ch], rng, { lo: -Infinity });
    }
    // Hard "incidence": just one year's rate per 100,000 with large numbers.
    const prompt = `${P} recorded ${big(c2)} new cases of a condition in ${y2}, out of a population of ${big(p2)}. Incidence rate = new cases ÷ population × 100,000. ` +
      `What was the incidence rate per 100,000 people? Round to 1 decimal place.`;
    const explanation = `\`_cases / _pop * 100000\` = \`${c2} / ${p2} * 100000\` ${result(r2, 1)} new cases per 100,000 people per year.`;
    const hints = [
      "Divide the new cases by the population: that is the proportion of people who became new cases.",
      "Scale it to a population of 100,000 by multiplying by 100,000. Round to 1 decimal place.",
    ];
    const base = { prompt, explanation, hints, given: givenRows([["_cases", c2], ["_pop", p2]]),
      params: { kind: "ratio", values: { num: c2, den: p2, mult: 100000 }, dp: 1 } };
    return finish(base, r2, 1, [r2 / 100, r2 / 100000 * 1000, r2 * 10, r2 / 10], rng);
  });
}

// ---------- Screening tests ----------

const SCREEN_MEASURES = {
  sensitivity: {
    name: "sensitivity", def: "Sensitivity is the share of people *with* the condition who test positive: TP ÷ (TP + FN).",
    calc: "_tp / (_tp + _fn) * 100", n: (t) => t.tp, d: (t) => t.tp + t.fn,
    hint1: "Sensitivity only looks at the people who *have* the condition: the first column of the table.",
  },
  specificity: {
    name: "specificity", def: "Specificity is the share of people *without* the condition who test negative: TN ÷ (TN + FP).",
    calc: "_tn / (_tn + _fp) * 100", n: (t) => t.tn, d: (t) => t.tn + t.fp,
    hint1: "Specificity only looks at the people who *don't have* the condition: the second column of the table.",
  },
  ppv: {
    name: "positive predictive value", def: "The positive predictive value (PPV) is the share of people who test positive who really have the condition: TP ÷ (TP + FP).",
    calc: "_tp / (_tp + _fp) * 100", n: (t) => t.tp, d: (t) => t.tp + t.fp,
    hint1: "The PPV only looks at the people who *tested positive*: the first row of the table.",
  },
  npv: {
    name: "negative predictive value", def: "The negative predictive value (NPV) is the share of people who test negative who really don't have the condition: TN ÷ (TN + FN).",
    calc: "_tn / (_tn + _fn) * 100", n: (t) => t.tn, d: (t) => t.tn + t.fn,
    hint1: "The NPV only looks at the people who *tested negative*: the second row of the table.",
  },
  fpr: {
    name: "false positive rate", def: "The false positive rate is the share of people *without* the condition who test positive: FP ÷ (FP + TN).",
    calc: "_fp / (_fp + _tn) * 100", n: (t) => t.fp, d: (t) => t.fp + t.tn,
    hint1: "The false positive rate only looks at the people who *don't have* the condition: the second column of the table.",
  },
};

function table2x2(t) {
  return `| | Has the condition | Doesn't have it |\n| --- | --- | --- |\n` +
    `| **Tests positive** | ${big(t.tp)} | ${big(t.fp)} |\n| **Tests negative** | ${big(t.fn)} | ${big(t.tn)} |`;
}
const TABLE_KEY = "In the table, TP = true positives (top left), FP = false positives (top right), FN = false negatives (bottom left) and TN = true negatives (bottom right).";

function screenMeasure(t, key, dp, rng, intro) {
  const m = SCREEN_MEASURES[key];
  const n = m.n(t), d = m.d(t);
  const exact = (n / d) * 100;
  if (onHalfStep(exact, dp)) return null;
  const prompt = `${intro}\n\n${table2x2(t)}\n\n${m.def} What is the ${m.name}?${PCT_NOTE(dp)}`;
  const explanation = `${TABLE_KEY}\n\n${m.def}\n\n\`${m.calc}\` = \`${n} / ${d} * 100\` ${result(exact, dp, "%")}`;
  const hints = [
    m.hint1,
    `The denominator is ${m.calc.split(" * ")[0].replace(/^_\w+ \/ /, "")} = ${big(d)} people.`,
    `Divide ${big(n)} by ${big(d)} and multiply by 100.${dp ? " Round to 1 decimal place." : ""}`,
  ];
  // Common mix-ups: the other measures from the same table.
  const others = Object.keys(SCREEN_MEASURES).filter((k) => k !== key)
    .map((k) => (SCREEN_MEASURES[k].n(t) / SCREEN_MEASURES[k].d(t)) * 100);
  const base = { prompt, explanation, hints, given: givenRows([["_tp", t.tp], ["_fp", t.fp], ["_fn", t.fn], ["_tn", t.tn]]),
    params: { kind: key, values: { ...t }, dp } };
  return finish(base, exact, dp, [...rng.shuffle(others), (n / (t.tp + t.fp + t.fn + t.tn)) * 100], rng, { hi: 100 });
}

const SCREEN_INTROS = [
  "A screening test was tried on a group of volunteers, and the results were compared with a definitive check.",
  "A new screening test was evaluated in a study. Each person's result was compared with whether they really had the condition.",
  "Researchers checked how well a screening test works by comparing its results with a reference method.",
];

function genScreening(difficulty, rng) {
  checkDifficulty(difficulty);
  if (difficulty === "easy") {
    return retry(rng, () => {
      const D = rng.pick([20, 40, 50, 100, 200]);
      const H = rng.pick([100, 200, 400, 500, 1000]);
      const sens = rng.int(14, 19) * 5;
      const spec = rng.int(16, 19) * 5;
      const tp = (D * sens) / 100, tn = (H * spec) / 100;
      if (!Number.isInteger(tp) || !Number.isInteger(tn)) return null;
      const t = { tp, fn: D - tp, tn, fp: H - tn };
      if (t.fn < 1 || t.fp < 1) return null;
      return screenMeasure(t, rng.pick(["sensitivity", "specificity", "fpr"]), 0, rng, rng.pick(SCREEN_INTROS));
    });
  }
  if (difficulty === "medium") {
    return retry(rng, () => {
      const D = rng.int(30, 400), H = rng.int(200, 3000);
      const tp = Math.round(D * rng.int(60, 98) / 100);
      const tn = Math.round(H * rng.int(70, 99) / 100);
      const t = { tp, fn: D - tp, tn, fp: H - tn };
      if (Object.values(t).some((v) => v < 1)) return null;
      return screenMeasure(t, rng.pick(Object.keys(SCREEN_MEASURES)), 1, rng, rng.pick(SCREEN_INTROS));
    });
  }
  // Hard: build the table from N, prevalence, sensitivity and specificity.
  return retry(rng, () => {
    const N = rng.pick([1000, 2000, 5000, 10000, 20000, 50000]);
    const prev = rng.pick([1, 2, 4, 5, 8, 10, 15, 20]);
    const sens = rng.pick([70, 75, 80, 85, 90, 95, 98]);
    const spec = rng.pick([80, 85, 90, 92, 95, 98, 99]);
    const D = (N * prev) / 100, H = N - D;
    const tp = (D * sens) / 100, tn = (H * spec) / 100;
    if (![D, tp, tn].every(Number.isInteger)) return null;
    const fn = D - tp, fp = H - tn;
    if (fn < 1 || fp < 1 || tp < 1) return null;
    const ppv = (tp / (tp + fp)) * 100;
    if (onHalfStep(ppv, 1)) return null;
    const scen = `A screening test has a sensitivity of ${sens}% (it is positive for ${sens}% of people who have the condition) and a specificity of ${spec}% ` +
      `(it is negative for ${spec}% of people who don't). It is used on ${big(N)} people, of whom ${prev}% have the condition.`;
    const g = givenRows([["_n", N], ["_prev", prev], ["_sens", sens], ["_spec", spec]]);
    const steps = `Have the condition: \`_d = _n * _prev / 100\` = ${big(D)}; don't: \`_h = _n - _d\` = ${big(H)}.\n\n` +
      `True positives: \`_tp = _d * _sens / 100\` = ${big(tp)}. False negatives: ${big(D)} - ${big(tp)} = ${big(fn)}.\n\n` +
      `True negatives: \`_tn = _h * _spec / 100\` = ${big(tn)}. False positives: \`_fp = _h - _tn\` = ${big(fp)}.\n\n` +
      `| | Has the condition | Doesn't have it |\n| --- | --- | --- |\n| **Tests positive** | ${big(tp)} | ${big(fp)} |\n| **Tests negative** | ${big(fn)} | ${big(tn)} |`;
    const ppvLine = `PPV = TP ÷ all positives: \`_tp / (_tp + _fp) * 100\` = \`${tp} / ${tp + fp} * 100\` ${result(ppv, 1, "%")}`;
    const kind = rng.pick(["multi", "multi", "ppv", "fp", "positives"]);
    const hint1 = `Split the ${big(N)} people first: ${prev}% have the condition and the rest don't.`;

    if (kind === "multi") {
      const parts = [
        { id: "tp", label: "True positives", ask: "How many people have the condition and test positive? Give a whole number.",
          answerType: "number", answer: tp, tolerance: 0,
          hint: `People with the condition: \`_n * _prev / 100\` = ${big(D)}. The sensitivity says what share of them test positive.` },
        { id: "fp", label: "False positives", ask: "How many people don't have the condition but test positive? Give a whole number.",
          answerType: "number", answer: fp, tolerance: 0,
          hint: `${big(H)} people don't have the condition. The specificity is the share of them who test negative; the rest test positive.` },
        { id: "ppv", label: "Positive predictive value", ask: "Of everyone who tests positive, what percentage really have the condition (the PPV)? Give it as a percentage without the % sign, rounded to 1 decimal place.",
          answerType: "number", answer: roundTo(ppv, 1), tolerance: 0.05,
          hint: "Everyone who tests positive = true positives + false positives. Divide the true positives by that total and multiply by 100." },
      ];
      return {
        prompt: scen, answerType: "multi", parts,
        explanation: `Build the 2×2 table from the percentages.\n\n${steps}\n\n${ppvLine}`,
        hints: [hint1], given: g,
        params: { multi: true, values: { N, prev, sens, spec }, parts: [{ id: "tp", kind: "tp" }, { id: "fp", kind: "fp" }, { id: "ppv", kind: "bayes" }] },
      };
    }
    if (kind === "ppv") {
      const prompt = `${scen} Of everyone who tests positive, what percentage really have the condition (the positive predictive value)?${PCT_NOTE(1)}`;
      const hints = [hint1, `Then find the true positives (${sens}% of those with the condition) and the false positives (${100 - spec}% of those without it).`,
        "PPV = true positives ÷ (true positives + false positives) × 100. Round to 1 decimal place."];
      const base = { prompt, explanation: `Build the 2×2 table from the percentages.\n\n${steps}\n\n${ppvLine}`, hints, given: g,
        params: { kind: "bayes", values: { N, prev, sens, spec }, dp: 1 } };
      return finish(base, ppv, 1, [sens, (tn / (tn + fn)) * 100, prev, 100 - spec, (tp / N) * 100], rng, { hi: 100 });
    }
    if (kind === "fp") {
      const prompt = `${scen} How many people would get a false positive result (test positive without having the condition)?${DP_NOTE[0]}`;
      const hints = [hint1, `Of the ${big(H)} people without the condition, ${spec}% test negative. The false positives are the rest.`];
      const base = { prompt, explanation: `Build the table from the percentages.\n\n${steps}\n\nSo **${big(fp)}** people get a false positive.`, hints, given: g,
        params: { kind: "fp", values: { N, prev, sens, spec }, dp: 0 } };
      return finish(base, fp, 0, [(N * (100 - spec)) / 100, fn, tn, tp], rng);
    }
    const pos = tp + fp;
    const prompt = `${scen} How many people in total would test positive?${DP_NOTE[0]}`;
    const hints = [hint1, "Positive results come from two groups: people with the condition who test positive, and people without it who test positive anyway.",
      `True positives are ${sens}% of those with the condition; false positives are ${100 - spec}% of those without it. Add the two counts.`];
    const base = { prompt, explanation: `Build the table from the percentages.\n\n${steps}\n\nAll positives: \`_tp + _fp\` = ${big(tp)} + ${big(fp)} = **${big(pos)}**.`, hints, given: g,
      params: { kind: "positives", values: { N, prev, sens, spec }, dp: 0 } };
    return finish(base, pos, 0, [tp, fp, D, tp + fn], rng);
  });
}

// ---------- Risk ----------

const RISK_INTROS = [
  ["A study followed", "people who were exposed to a factor", "people who were not", "developed an outcome during the study"],
  ["A cohort study tracked", "people in an exposed group", "people in an unexposed group", "developed the outcome being studied"],
  ["Researchers followed", "people who had a certain exposure", "people without it", "had the outcome by the end of follow-up"],
];

function riskTable(a, b, c, d) {
  return `| | Outcome | No outcome | Total |\n| --- | --- | --- | --- |\n` +
    `| **Exposed** | ${big(a)} (a) | ${big(b)} (b) | ${big(a + b)} |\n| **Unexposed** | ${big(c)} (c) | ${big(d)} (d) | ${big(c + d)} |`;
}

function genRisk(difficulty, rng) {
  checkDifficulty(difficulty);
  const [verb, exp, unexp, out] = rng.pick(RISK_INTROS);
  const RISK_DEF = "Risk = people with the outcome ÷ everyone in that group.";
  const ODDS_DEF = "Odds = people with the outcome ÷ people without it.";
  return retry(rng, () => {
    let nE, nU, a, c, kind, dp;
    if (difficulty === "easy") {
      nE = rng.pick([100, 200, 400, 500]);
      nU = rng.pick([100, 200, 400, 500]);
      const pE = rng.int(2, 40), pU = rng.int(1, 30);
      if (pE === pU) return null;
      a = (nE * pE) / 100; c = (nU * pU) / 100;
      kind = rng.pick(["riskE", "riskU", "rd"]);
      dp = 0;
    } else {
      nE = rng.int(80, 2000); nU = rng.int(80, 2000);
      a = Math.round(nE * rng.int(3, 45) / 100); c = Math.round(nU * rng.int(2, 35) / 100);
      kind = difficulty === "medium" ? rng.pick(["rr", "rr", "rd", "oddsE", "oddsU"]) : rng.pick(["or", "or", "multi", "multi", "rr"]);
      dp = kind === "rd" ? 1 : 2;
    }
    const b = nE - a, d = nU - c;
    if (![a, b, c, d].every((v) => Number.isInteger(v) && v >= 1) || a / nE === c / nU) return null;
    const rE = a / nE, rU = c / nU;
    const RR = rE / rU, OR = (a / b) / (c / d), RD = (rE - rU) * 100;
    const intro = `${verb} ${big(nE)} ${exp} and ${big(nU)} ${unexp}, and counted who ${out}:\n\n${riskTable(a, b, c, d)}`;
    const g = givenRows([["_a", a], ["_b", b], ["_c", c], ["_d", d]]);
    const riskLines = `Risk in the exposed group: \`_a / (_a + _b)\` = \`${a} / ${nE}\` = ${num(rE)}.\n\nRisk in the unexposed group: \`_c / (_c + _d)\` = \`${c} / ${nU}\` = ${num(rU)}.`;

    if (kind === "multi") {
      if (onHalfStep(RR, 2) || onHalfStep(OR, 2)) return null;
      const parts = [
        { id: "rr", label: "Relative risk", ask: "What is the relative risk (risk in the exposed group ÷ risk in the unexposed group)? Round to 2 decimal places.",
          answerType: "number", answer: roundTo(RR, 2), tolerance: 0.005,
          hint: "Each group's risk is its outcome count ÷ its own total (a ÷ (a + b) and c ÷ (c + d)). Then divide exposed by unexposed." },
        { id: "or", label: "Odds ratio", ask: "What is the odds ratio (odds in the exposed group ÷ odds in the unexposed group)? Round to 2 decimal places.",
          answerType: "number", answer: roundTo(OR, 2), tolerance: 0.005,
          hint: "Odds use the *No outcome* column as the denominator: a ÷ b for the exposed group and c ÷ d for the unexposed group. Then divide." },
      ];
      return {
        prompt: `${intro}\n\n${RISK_DEF} ${ODDS_DEF}`, answerType: "multi", parts,
        explanation: `${riskLines}\n\nRelative risk: \`(_a / (_a + _b)) / (_c / (_c + _d))\` ${result(RR, 2)}.\n\n` +
          `Odds: exposed \`_a / _b\` = ${num(a / b)}, unexposed \`_c / _d\` = ${num(c / d)}.\n\nOdds ratio: \`(_a / _b) / (_c / _d)\` ${result(OR, 2)}.` +
          `\n\nThe odds ratio is always further from 1 than the relative risk; the two are close only when the outcome is rare.`,
        hints: ["Risk divides by the whole group; odds divide by the people *without* the outcome. Keep the exposed group on top in both ratios."],
        given: g,
        params: { multi: true, values: { a, b, c, d }, parts: [{ id: "rr", kind: "rr" }, { id: "or", kind: "or" }] },
      };
    }

    let exact, ask, explanation, hints, cands, bounds = {};
    if (kind === "riskE" || kind === "riskU") {
      const E = kind === "riskE";
      exact = (E ? rE : rU) * 100;
      ask = `${RISK_DEF} What was the risk in the ${E ? "exposed" : "unexposed"} group?${PCT_NOTE(0)}`;
      explanation = `${RISK_DEF}\n\n\`${E ? "_a / (_a + _b)" : "_c / (_c + _d)"} * 100\` = \`${E ? a : c} / ${E ? nE : nU} * 100\` ${result(exact, 0, "%")}`;
      hints = [`Use only the ${E ? "Exposed" : "Unexposed"} row, and divide by that row's total, not by everyone in the study.`,
        `That is ${big(E ? a : c)} ÷ ${big(E ? nE : nU)}. Multiply by 100 for a percentage.`];
      cands = [((E ? a / b : c / d)) * 100, ((E ? a : c) / (nE + nU)) * 100, (E ? rU : rE) * 100];
      bounds = { hi: 100 };
    } else if (kind === "rd") {
      exact = RD;
      ask = `${RISK_DEF} The risk difference is the risk in the exposed group minus the risk in the unexposed group. What is the risk difference, in percentage points? Use a minus sign if the exposed group's risk is lower.${dp ? " Round to 1 decimal place." : " Give a whole number."}`;
      explanation = `${riskLines}\n\nAs percentages: ${num(rE * 100)}% and ${num(rU * 100)}%.\n\nRisk difference: ${num(rE * 100)} - ${num(rU * 100)} ${result(exact, dp)} percentage points.`;
      hints = ["Work out each group's risk as a percentage: outcome count ÷ that group's total × 100.",
        `Exposed: \`_a / (_a + _b) * 100\`; unexposed: \`_c / (_c + _d) * 100\`. Then subtract unexposed from exposed.`];
      cands = [-RD, (rE / rU) * 100, ((a - c) / (nE + nU)) * 100, (a / b - c / d) * 100];
      bounds = { lo: -Infinity, hi: 100 };
    } else if (kind === "rr") {
      exact = RR;
      ask = `${RISK_DEF} The relative risk is the risk in the exposed group ÷ the risk in the unexposed group. What is the relative risk?${DP_NOTE[2]}`;
      explanation = `${riskLines}\n\nRelative risk: \`(_a / (_a + _b)) / (_c / (_c + _d))\` = \`${num(rE)} / ${num(rU)}\` ${result(exact, 2)}.`;
      hints = ["Find each group's risk first, dividing by that group's own total (the Total column).",
        `Exposed risk = ${big(a)} ÷ ${big(nE)}; unexposed risk = ${big(c)} ÷ ${big(nU)}. Then divide the exposed risk by the unexposed risk.`];
      cands = [OR, 1 / RR, a / c, (rE - rU) * 10];
    } else if (kind === "or") {
      exact = OR;
      ask = `${ODDS_DEF} The odds ratio is the odds in the exposed group ÷ the odds in the unexposed group. What is the odds ratio?${DP_NOTE[2]}`;
      explanation = `Odds in the exposed group: \`_a / _b\` = \`${a} / ${b}\` = ${num(a / b)}.\n\nOdds in the unexposed group: \`_c / _d\` = \`${c} / ${d}\` = ${num(c / d)}.\n\n` +
        `Odds ratio: \`(_a / _b) / (_c / _d)\` ${result(exact, 2)}. (Shortcut: \`(_a * _d) / (_b * _c)\`.)`;
      hints = ["Odds divide the people *with* the outcome by the people *without* it, inside one group (not by the group total).",
        `Exposed odds = ${big(a)} ÷ ${big(b)}; unexposed odds = ${big(c)} ÷ ${big(d)}. Divide the first by the second.`];
      cands = [RR, 1 / OR, (a * c) / (b * d), a / c];
    } else {
      const E = kind === "oddsE";
      exact = E ? a / b : c / d;
      ask = `${ODDS_DEF} What are the odds of the outcome in the ${E ? "exposed" : "unexposed"} group?${DP_NOTE[2]}`;
      explanation = `${ODDS_DEF}\n\n\`${E ? "_a / _b" : "_c / _d"}\` = \`${E ? a : c} / ${E ? b : d}\` ${result(exact, 2)}.`;
      hints = [`Stay in the ${E ? "Exposed" : "Unexposed"} row. Odds compare the two cells in that row with each other, not with the total.`,
        `Divide the *Outcome* count by the *No outcome* count.`];
      cands = [E ? rE : rU, E ? b / a : d / c, E ? c / d : a / b];
    }
    if (onHalfStep(exact, dp)) return null;
    const base = { prompt: `${intro}\n\n${ask}`, explanation, hints, given: g, params: { kind, values: { a, b, c, d }, dp } };
    return finish(base, exact, dp, cands, rng, bounds);
  });
}

// ---------- Averages and spread ----------

const MEASUREMENTS = [
  { what: "resting heart rates", unit: "beats per minute", who: "volunteers", lo: 52, hi: 96 },
  { what: "heights", unit: "cm", who: "adults in a survey", lo: 152, hi: 194 },
  { what: "daily step counts, in thousands of steps", unit: "thousand steps", who: "participants in a walking study", lo: 3, hi: 16 },
  { what: "minutes of exercise on one day", unit: "minutes", who: "students", lo: 0, hi: 90 },
  { what: "reaction times", unit: "milliseconds", who: "volunteers in a lab test", lo: 180, hi: 340 },
  { what: "hours of sleep on one night, to the nearest hour", unit: "hours", who: "survey respondents", lo: 4, hi: 10 },
];

const sorted = (arr) => arr.slice().sort((x, y) => x - y);
const sum = (arr) => arr.reduce((s, x) => s + x, 0);
const list = (arr) => arr.join(", ");
const ord = (k) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"}`;
function medianOf(s) {
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function quartiles(s) {
  const half = Math.floor(s.length / 2);
  const lower = s.slice(0, half), upper = s.slice(s.length - half);
  return { lower, upper, q1: medianOf(lower), q3: medianOf(upper) };
}

function genAverages(difficulty, rng) {
  checkDifficulty(difficulty);
  const m = rng.pick(MEASUREMENTS);
  const easy = difficulty === "easy", hard = difficulty === "hard";
  const kinds = easy ? ["mean", "median", "range"] : hard ? ["mean", "iqr", "iqr", "multi", "multi"] : ["mean", "median", "median", "range"];
  const kind = rng.pick(kinds);
  return retry(rng, () => {
    let n = easy ? rng.int(5, 7) : hard ? rng.int(8, 12) : rng.int(6, 10);
    if (easy && kind === "median" && n % 2 === 0) n += 1;
    const data = [];
    for (let i = 0; i < n; i++) data.push(rng.int(m.lo, m.hi));
    if (easy && kind === "mean") {
      const partial = sum(data.slice(0, n - 1));
      const opts = [];
      for (let v = m.lo; v <= m.hi; v++) if ((partial + v) % n === 0) opts.push(v);
      if (!opts.length) return null;
      data[n - 1] = rng.pick(opts);
    }
    const s = sorted(data);
    const shown = easy ? s : data;
    const intro = `The ${m.what} of ${n} ${m.who} were${easy ? " (already in order)" : ""}: ${list(shown)} (${m.unit}).`;
    const meanV = sum(data) / n, medV = medianOf(s), rangeV = s[n - 1] - s[0];
    const sortStep = easy ? "" : `Sort the values: ${list(s)}.\n\n`;
    const medianExpl = n % 2
      ? `There are ${n} values, so the median is the middle one, value number ${(n + 1) / 2}: **${num(medV)}**.`
      : `There are ${n} values, so the median is halfway between values ${n / 2} and ${n / 2 + 1}: \`(${s[n / 2 - 1]} + ${s[n / 2]}) / 2\` ${result(medV, 2)}.`;
    const meanExpl = `Mean = sum ÷ count.\n\nSum: ${sum(data)}.\n\n\`${sum(data)} / ${n}\` ${result(meanV, easy ? 0 : 2)}`;
    const ROUND_IF = " Round to 2 decimal places if it is not a whole number.";

    if (kind === "multi") {
      if (onHalfStep(meanV, 2)) return null;
      const parts = [
        { id: "mean", label: "Mean", ask: `What is the mean?${ROUND_IF}`, answerType: "number", answer: roundTo(meanV, 2), tolerance: 0.005,
          hint: `Add all ${n} values, then divide the total by ${n}.` },
        { id: "median", label: "Median", ask: `What is the median?${ROUND_IF}`, answerType: "number", answer: roundTo(medV, 2), tolerance: 0.005,
          hint: n % 2 ? `Sort the values; with ${n} values the median is the ${ord((n + 1) / 2)} one.` : `Sort the values; with ${n} values the median is halfway between the ${ord(n / 2)} and ${ord(n / 2 + 1)} ones.` },
      ];
      return {
        prompt: intro, answerType: "multi", parts,
        explanation: `${meanExpl}\n\n${sortStep}${medianExpl}`,
        hints: ["The mean uses every value; the median only needs the values in order."],
        params: { multi: true, values: { data }, parts: [{ id: "mean", kind: "mean" }, { id: "median", kind: "median" }] },
      };
    }
    let exact, dp, ask, explanation, hints, cands, bounds = {};
    if (kind === "mean") {
      exact = meanV; dp = easy ? 0 : 2;
      ask = `What is the mean?${easy ? DP_NOTE[0] : ROUND_IF}`;
      explanation = meanExpl;
      hints = [`Mean = sum of the values ÷ how many there are. There are ${n} values.`, `Add them all up, then divide the total by ${n}.${easy ? "" : " Round to 2 decimal places if needed."}`];
      cands = [medV, sum(data) / (n - 1), sum(data) / (n + 1), rangeV];
      if (!easy && onHalfStep(exact, 2)) return null;
    } else if (kind === "median") {
      exact = medV; dp = easy ? 0 : 2;
      ask = `What is the median?${easy ? DP_NOTE[0] : ROUND_IF}`;
      explanation = sortStep + medianExpl;
      hints = [easy ? "The median is the middle value of the sorted list. This list is already in order." : `Sort all ${n} values from smallest to largest first.`,
        n % 2 ? `There are ${n} values (odd), so the median is the ${ord((n + 1) / 2)} value.` : `There are ${n} values (even): go halfway between the ${ord(n / 2)} and ${ord(n / 2 + 1)} values.`];
      cands = [data[Math.floor(n / 2)], meanV, s[Math.floor(n / 2)] + 1, (s[0] + s[n - 1]) / 2];
    } else if (kind === "range") {
      exact = rangeV; dp = 0;
      ask = `What is the range (largest value - smallest value)?${DP_NOTE[0]}`;
      explanation = `${sortStep}Range = largest - smallest = \`${s[n - 1]} - ${s[0]}\` = **${rangeV}**.`;
      hints = ["The range measures spread: the gap between the largest and the smallest value.", easy ? "The list is sorted, so look at the two ends." : "Find the largest and smallest values anywhere in the list (not the first and last ones shown)."];
      cands = [data[n - 1] - data[0], s[n - 1], medV, s[n - 2] - s[1]];
    } else {
      const { lower, upper, q1, q3 } = quartiles(s);
      exact = q3 - q1; dp = 2;
      ask = `What is the interquartile range (IQR = Q3 - Q1)? Find Q1 and Q3 as the medians of the lower and upper halves of the sorted data; when there is an odd number of values, leave the middle value out of both halves.${ROUND_IF}`;
      explanation = `${sortStep}${n % 2 ? `There are ${n} values, so leave out the middle one (${s[(n - 1) / 2]}).` : `There are ${n} values, so split them into two halves of ${n / 2}.`} ` +
        `Lower half: ${list(lower)}. Upper half: ${list(upper)}.\n\nQ1 = ${num(q1)}, Q3 = ${num(q3)}.\n\nIQR = \`${num(q3)} - ${num(q1)}\` ${result(exact, 2)}`;
      hints = [`Sort the ${n} values first.`, n % 2 ? `With ${n} values, leave out the middle one and split the rest into two halves of ${(n - 1) / 2}.` : `Split the sorted list into two halves of ${n / 2}.`,
        "Q1 is the median of the lower half and Q3 the median of the upper half. Then subtract Q1 from Q3."];
      cands = [rangeV, q3, medianOf(upper) - medianOf(s), (q3 - q1) / 2];
      bounds = { step: 0.5 };
    }
    const base = { prompt: `${intro} ${ask}`, explanation, hints, tolerance: tolOf(dp), params: { kind, values: { data }, dp } };
    return finish(base, exact, dp, cands, rng, bounds);
  });
}

// ---------- entry points ----------

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "rates") return genRates(difficulty, rng);
  if (subtopic === "screening-tests") return genScreening(difficulty, rng);
  if (subtopic === "risk") return genRisk(difficulty, rng);
  if (subtopic === "averages-spread") return genAverages(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each check takes a different route from generation: reverse residuals, Bayes' rule instead of
// table counts, cross-multiplied ratios, complements, and counting instead of sorting.

// k-th smallest (0-based) by counting, without sorting.
function kth(data, k) {
  for (const v of data) {
    const below = data.filter((x) => x < v).length;
    const equal = data.filter((x) => x === v).length;
    if (below <= k && k < below + equal) return v;
  }
  return NaN;
}
function medianByCount(data) {
  const n = data.length;
  return n % 2 ? kth(data, (n - 1) / 2) : (kth(data, n / 2 - 1) + kth(data, n / 2)) / 2;
}

// Exact value of a quantity by the independent route, or NaN.
function independent(kind, v) {
  switch (kind) {
    case "ratio": return 100 * v.mult * (1 - (v.den - v.num) / v.den) / 100; // complement of the "without" share
    case "expected": return (v.pop / v.mult) * v.rate;
    case "change": return (v.now / v.old - 1) * 100;
    case "rate1": return (v.c1 * 100000) / v.p1;
    case "rate2": return (v.c2 * 100000) / v.p2;
    case "rchange": return ((v.c2 * v.p1) / (v.c1 * v.p2) - 1) * 100;
    case "sensitivity": return 100 - (v.fn / (v.tp + v.fn)) * 100;
    case "specificity": return 100 - (v.fp / (v.fp + v.tn)) * 100;
    case "fpr": return 100 - (v.tn / (v.fp + v.tn)) * 100;
    case "ppv": return 100 - (v.fp / (v.tp + v.fp)) * 100;
    case "npv": return 100 - (v.fn / (v.tn + v.fn)) * 100;
    case "bayes": { // Bayes' rule from the rates, not the table counts
      const p = v.prev / 100, se = v.sens / 100, sp = v.spec / 100;
      return (100 * se * p) / (se * p + (1 - sp) * (1 - p));
    }
    case "tp": return v.N * (v.prev * v.sens) / 10000;
    case "fp": return v.N * (1 - v.prev / 100) * (1 - v.spec / 100);
    case "positives": return v.N * ((v.prev / 100) * (v.sens / 100) + (1 - v.prev / 100) * (1 - v.spec / 100));
    case "riskE": return (100 * v.a) / (v.a + v.b);
    case "riskU": return (100 * v.c) / (v.c + v.d);
    case "rd": return (100 * (v.a * v.d - v.b * v.c)) / ((v.a + v.b) * (v.c + v.d));
    case "rr": return (v.a * (v.c + v.d)) / (v.c * (v.a + v.b));
    case "or": return (v.a * v.d) / (v.b * v.c);
    case "oddsE": return v.a / v.b;
    case "oddsU": return v.c / v.d;
    case "mean": { // the deviations from the mean sum to zero: solve for it from the first value
      const d0 = v.data.reduce((s, x) => s + (x - v.data[0]), 0);
      return v.data[0] + d0 / v.data.length;
    }
    case "median": return medianByCount(v.data);
    case "range": return Math.max(...v.data) - Math.min(...v.data);
    case "iqr": {
      const n = v.data.length, h = Math.floor(n / 2);
      const q = (from) => (h % 2 ? kth(v.data, from + (h - 1) / 2) : (kth(v.data, from + h / 2 - 1) + kth(v.data, from + h / 2)) / 2);
      return q(n - h) - q(0);
    }
    default: return NaN;
  }
}

function checkValue(kind, values, dp, ans) {
  if (ans === "" || ans === null || ans === undefined) return false;
  const x = Number(ans);
  const exact = independent(kind, values);
  if (!Number.isFinite(x) || !Number.isFinite(exact)) return false;
  if (onHalfStep(exact, dp)) return false; // two rounded answers would pass: not well posed
  return Math.abs(x - exact) <= tolOf(dp) + 1e-9;
}

const PART_DP = { rate1: 1, rate2: 1, rchange: 1, tp: 0, fp: 0, bayes: 1, rr: 2, or: 2, mean: 2, median: 2 };

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false; // regenerate from the seed to get params back
  if (question.answerType === "multi" || p.multi) {
    if (!answer || typeof answer !== "object" || !Array.isArray(p.parts)) return false;
    return p.parts.every((spec) => checkValue(spec.kind, p.values, PART_DP[spec.kind], answer[spec.id]));
  }
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
    // Exactly one option may pass.
    if (ch.filter((c) => checkValue(p.kind, p.values, p.dp, c)).length !== 1) return false;
  }
  return checkValue(p.kind, p.values, p.dp, answer);
}
