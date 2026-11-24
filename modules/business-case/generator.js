// Business case generator: short scenarios that take 2-4 calculation steps.
// Uses only the seeded rng passed in by the engine.
// Each question's params.fmt says how the answer is given:
//   "int"    whole number, tolerance 0 (easy answers, and units rounded up to whole items)
//   "2dp"    rounded to 2 decimals, tolerance 0.005
//   "choice" a named option ("Option A", "Supplier B", "Same profit", ...)
// Explanations list every step as a labelled calculator row, e.g. `_margin = _price - _unit_cost` → 3.30.
// Money is handled in whole cents where it matters, so ceil() never trips over binary error.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Answer/choice formatter: whole numbers as-is, rounded answers with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

// Intermediate values: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// Money inside calculator rows: "3300" for whole dollars, "4.50" otherwise (no $, no commas).
function mv(n) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// Dollar amounts in prompts: "$240", "$12.50", "-$3.75".
function cash(n) {
  const s = mv(Math.abs(n));
  return round2(n) < 0 ? `-$${s}` : `$${s}`;
}

const toC = (d) => Math.round(d * 100); // dollars -> whole cents
const years = (t) => (t === 1 ? "1 year" : `${t} years`);
const PCT_NOTE = " Answer as a number without the % sign.";
const DP2 = " Round to 2 decimal places.";
const RATIO_NOTE = " If the ratio is x:1, answer with x.";

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b); // positive integers only

// True when fixed/margin (in cents) is safely away from a whole number, so ceil() is not
// sensitive to the tiny binary error a calculator makes with decimal prices.
function fracOk(fixedC, marginC) {
  const f = (fixedC % marginC) / marginC;
  return f >= 0.02 && f <= 0.98;
}

// Calculator rows for the explanation (rendered as a markdown list).
const given = (label, v) => `- \`${label} = ${v}\``;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;

function dress(s, unit) {
  if (unit === "money") return s.startsWith("-") ? `-$${s.slice(1)}` : `$${s}`;
  if (unit === "pct") return `${s}%`;
  return unit ? `${s} ${unit}` : s;
}

// The value shown on the last row: "**1100 cups**" or "1234.5678, which rounds to **$1234.57**".
function final(exact, fmt, unit) {
  const shown = fmtAns(exact, fmt === "2dp");
  if (fmt !== "2dp" || Math.abs(exact - Number(shown)) < 1e-9) return `**${dress(shown, unit)}**`;
  return `${num(exact)}, which rounds to **${dress(shown, unit)}**`;
}

const explain = (intro, lines) => `${intro}\n\n${lines.join("\n")}`;

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors; positive quantities get no negative options.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Turn a solved numeric question into either a typed-number or a multiple-choice question.
function finish(base, exact, fmt, candidates, rng) {
  const rounded = fmt === "2dp";
  const q = { ...base, tolerance: rounded ? 0.005 : 0 };
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Multi-part questions (answerType "multi"): one scenario, a calculation part or two, and usually a
// Recommendation that follows a rule stated in the prompt, so there is exactly one right answer.
// params.parts lists how verify() rechecks each part: { id, kind, fmt } for numbers (same checks as
// single questions) or { id, rec } for a recommendation, which verify() recomputes from the values.

const YES = "Yes";
const NO = "No";
const INVEST = "Invest";
const PASS = "Don't invest";
const HEALTHY = "Healthy";
const UNHEALTHY = "Not healthy";
const HEALTHY_MIN = 3; // LTV:CAC rule used in unit-economics recommendations
const REC_CHOICES = { demand: [YES, NO], invest: [INVEST, PASS], health: [HEALTHY, UNHEALTHY] };

function numPart(id, label, ask, exact, fmt) {
  const rounded = fmt === "2dp";
  return { id, label, ask, answerType: "number", answer: rounded ? round2(exact) : exact, tolerance: rounded ? 0.005 : 0 };
}

function recPart(ask, answer, choices) {
  return { id: "rec", label: "Recommendation", ask, answerType: "choice", answer, choices: choices.slice() };
}

function multiQuestion(prompt, parts, specs, explanation, params) {
  return { prompt, answerType: "multi", parts, explanation, params: { ...params, multi: true, parts: specs } };
}

// A whole number `delta` away from n (never equal), on the side picked by `above`.
function awayFrom(n, rng, minGap) {
  const delta = Math.max(minGap, Math.round((n * rng.int(8, 30)) / 100));
  const above = rng.next() < 0.5 || n - delta < 1;
  return above ? n + delta : n - delta;
}

// Break-even as two parts: units + revenue, or units/revenue + "is expected demand enough?".
function breakEvenMulti({ s, kind, scen, ask, exact, fmt, unit, lines, intro, values, beUnits, rng }) {
  const roundUp = ` Round up to whole ${s.units}.`;
  const v = { ...values };
  const L = lines.slice();
  let prompt = scen;
  let parts, specs, tail = "";

  if (kind === "revenue") {
    parts = [
      numPart("units", "Break-even units", `How many ${s.units} must it sell each month to break even?${roundUp}`, beUnits, "int"),
      numPart("revenue", "Break-even revenue", `What monthly revenue is that, in dollars? Multiply the rounded-up quantity by the price.${DP2}`, exact, "2dp"),
    ];
    specs = [{ id: "units", kind: "units", fmt: "int" }, { id: "revenue", kind: "revenue", fmt: "2dp" }];
  } else if (kind === "units" && v.C !== undefined && rng.next() < 0.5) {
    // Easy: units, then the revenue at that quantity (whole dollars).
    const rev = exact * v.P;
    L.push(step("_revenue", "_units * _price", final(rev, "int", "money")));
    parts = [
      numPart("units", "Break-even units", ask, exact, "int"),
      numPart("revenue", "Break-even revenue", "What monthly revenue is that, in dollars? Multiply the break-even quantity by the price.", rev, "int"),
    ];
    specs = [{ id: "units", kind: "units", fmt: "int" }, { id: "revenue", kind: "revenue", fmt: "int" }];
  } else if (kind === "revenue-ratio") {
    const S = 100 * awayFrom(Math.round(exact / 100), rng, 1); // expected sales, whole hundreds, ≥ $50 away
    const enough = S >= exact;
    v.S = S;
    prompt += ` The owner expects sales of ${cash(S)} a month. Sales are enough if they are at least the break-even revenue.`;
    L.push(given("_expected", mv(S)));
    tail = `\n\n\`_expected\` (${cash(S)}) is ${enough ? "at least" : "below"} \`_be_revenue\` (${cash(exact)}), so the answer is **${enough ? YES : NO}**.`;
    parts = [
      numPart("revenue", "Break-even revenue", ask, exact, "int"),
      recPart(`Are the expected sales of ${cash(S)} enough to break even?`, enough ? YES : NO, REC_CHOICES.demand),
    ];
    specs = [{ id: "revenue", kind, fmt: "int" }, { id: "rec", rec: "demand-revenue" }];
  } else {
    // units / target-units / price-change: the quantity, then whether expected demand reaches it.
    const target = kind === "target-units";
    const D = awayFrom(exact, rng, 3);
    const enough = D >= exact;
    v.D = D;
    const goal = target ? "the quantity needed for the target profit" : "the break-even quantity";
    prompt +=
      ` The owner expects to sell ${D} ${s.units} a month${kind === "price-change" ? " at the new price" : ""}. ` +
      `Demand is enough if it is at least ${goal}.`;
    L.push(given("_demand", D));
    tail = `\n\n\`_demand\` (${D}) is ${enough ? "at least" : "below"} \`_units\` (${exact}), so the answer is **${enough ? YES : NO}**.`;
    parts = [
      numPart("units", target ? "Target units" : "Break-even units", ask, exact, "int"),
      recPart(
        `Is the expected demand of ${D} ${s.units} enough to ${target ? "reach the profit target" : "break even"}?`,
        enough ? YES : NO,
        REC_CHOICES.demand
      ),
    ];
    specs = [{ id: "units", kind, fmt: "int" }, { id: "rec", rec: "demand-units" }];
  }
  return multiQuestion(prompt, parts, specs, explain(intro, L) + tail, { kind, values: v, fmt });
}

// A multiple of `step` (cents) inside [lo, hi] dollars.
function priceC(rng, range, stepC) {
  const lo = Math.ceil((range[0] * 100) / stepC);
  const hi = Math.max(lo, Math.floor((range[1] * 100) / stepC));
  return stepC * rng.int(lo, hi);
}

// ---------------------------------------------------------------------------------------------
// Scenario data (generic small businesses only).

const SHOPS = [
  { biz: "A small café", sells: "coffee", unit: "cup", units: "cups", price: [3, 6], vol: [600, 3000],
    parts: [["coffee beans and milk", "_ingredients"], ["a cup and lid", "_packaging"]] },
  { biz: "A neighborhood bakery", sells: "sourdough loaves", unit: "loaf", units: "loaves", price: [5, 9], vol: [400, 2000],
    parts: [["flour and other ingredients", "_ingredients"], ["oven energy", "_energy"]] },
  { biz: "A bike repair shop", sells: "tune-ups", unit: "tune-up", units: "tune-ups", price: [45, 90], vol: [60, 300],
    parts: [["parts", "_parts"], ["mechanic time", "_labor"]] },
  { biz: "A print shop", sells: "custom posters", unit: "poster", units: "posters", price: [12, 30], vol: [150, 900],
    parts: [["paper and ink", "_materials"], ["a shipping tube", "_packaging"]] },
  { biz: "A food truck", sells: "lunch bowls", unit: "bowl", units: "bowls", price: [9, 15], vol: [400, 2000],
    parts: [["ingredients", "_ingredients"], ["a takeaway box", "_packaging"]] },
  { biz: "A candle workshop", sells: "hand-poured candles", unit: "candle", units: "candles", price: [18, 36], vol: [100, 800],
    parts: [["wax and wick", "_materials"], ["a glass jar", "_jar"]] },
  { biz: "A self-service car wash", sells: "washes", unit: "wash", units: "washes", price: [10, 20], vol: [300, 1500],
    parts: [["water and soap", "_supplies"], ["electricity", "_energy"]] },
  { biz: "A smoothie bar", sells: "smoothies", unit: "smoothie", units: "smoothies", price: [5, 9], vol: [500, 2500],
    parts: [["fruit and yogurt", "_ingredients"], ["a cup and straw", "_packaging"]] },
];

const CUSTOMER_BIZ = [
  "An online plant shop",
  "A coffee-bean subscription service",
  "A meal-kit startup",
  "A pet-supply web store",
  "A dog-grooming salon",
  "An online stationery shop",
];

const SAAS = [
  "A SaaS startup selling scheduling software",
  "A small SaaS company with an invoicing app",
  "A project-management SaaS startup",
  "A website-builder SaaS startup",
];

const PROJECTS = [
  { biz: "A bakery", asset: "a second deck oven" },
  { biz: "A print shop", asset: "a wide-format printer" },
  { biz: "A café", asset: "a new espresso machine" },
  { biz: "A bike shop", asset: "a fleet of rental e-bikes" },
  { biz: "A car wash", asset: "a water-recycling system" },
  { biz: "A food-truck business", asset: "a second truck" },
  { biz: "A yoga studio", asset: "rooftop solar panels" },
];

// Make-or-buy: things a small business could produce itself or order in.
const MAKE = [
  { biz: "A print shop", need: "branded tote bags for a client order", unit: "bag", units: "bags", vol: [200, 2000], buy: [3, 9] },
  { biz: "A café", need: "croissants for the month", unit: "croissant", units: "croissants", vol: [600, 3000], buy: [2, 4] },
  { biz: "A bakery", need: "pie crusts for the holiday season", unit: "crust", units: "crusts", vol: [300, 2000], buy: [2, 5] },
  { biz: "A bike shop", need: "custom wheel sets for a racing club", unit: "wheel set", units: "wheel sets", vol: [20, 120], buy: [90, 220] },
  { biz: "A candle workshop", need: "packs of wax melts for a gift-shop order", unit: "pack", units: "packs", vol: [200, 1500], buy: [2, 6] },
];

// Two suppliers for the same input.
const SUPPLY = [
  { biz: "A bakery", item: "sacks of flour", unit: "sack", vol: [40, 300], price: [18, 40] },
  { biz: "A café", item: "bags of coffee beans", unit: "bag", vol: [30, 200], price: [12, 30] },
  { biz: "A print shop", item: "reams of paper", unit: "ream", vol: [100, 800], price: [4, 12] },
  { biz: "A smoothie bar", item: "cases of frozen fruit", unit: "case", vol: [20, 150], price: [25, 60] },
  { biz: "A bike shop", item: "inner tubes", unit: "tube", vol: [100, 600], price: [3, 9] },
];

// ---------------------------------------------------------------------------------------------
// Break-even

function genBreakEven(difficulty, rng) {
  checkDifficulty(difficulty);
  const s = rng.pick(SHOPS);
  const kind = rng.pick(
    difficulty === "easy"
      ? ["units", "revenue-ratio"]
      : difficulty === "medium"
        ? ["units", "revenue"]
        : ["target-units", "price-change", "target-revenue"]
  );
  const roundUp = ` Round up to whole ${s.units}.`;
  const vol = () => rng.int(s.vol[0], s.vol[1]);
  // Decided up front so a seed always gives the same question.
  const wantMulti = rng.next() < 0.6;
  let scen, ask, exact, fmt, unit, lines, intro, candidates, values, beUnits;

  if (difficulty === "easy" && kind === "units") {
    const P = rng.int(s.price[0], s.price[1]);
    const m = rng.int(Math.max(1, Math.ceil(P * 0.3)), Math.max(1, Math.floor(P * 0.7)));
    const C = P - m;
    const N = 10 * rng.int(Math.ceil(s.vol[0] / 10), Math.floor(s.vol[1] / 10));
    const F = m * N; // whole-dollar margin into whole-dollar fixed costs: exact
    exact = N;
    fmt = "int";
    unit = s.units;
    values = { P, C, F };
    scen =
      `${s.biz} sells ${s.sells} for ${cash(P)} per ${s.unit}. Each ${s.unit} costs ${cash(C)} in variable costs, ` +
      `and fixed costs are ${cash(F)} per month.`;
    ask = `How many ${s.units} must it sell each month to break even?${roundUp}`;
    intro = "Each unit sold covers its own cost and leaves the contribution margin toward fixed costs. Break-even units = fixed costs ÷ margin, rounded up.";
    lines = [
      given("_price", mv(P)),
      given("_unit_cost", mv(C)),
      given("_fixed", mv(F)),
      step("_margin", "_price - _unit_cost", mv(m)),
      step("_units", "ceil(_fixed / _margin)", final(N, fmt, unit)),
    ];
    candidates = [Math.ceil(F / P), N - 1, Math.ceil(F / C)]; // used the price, rounded down, used the cost
  } else if (kind === "revenue-ratio") {
    const r = rng.pick([20, 25, 40, 50]);
    const F = 500 * rng.int(2, 30);
    exact = (F * 100) / r; // whole: 50000 is divisible by each r
    fmt = "int";
    unit = "money";
    values = { F, r };
    scen =
      `${s.biz} has a contribution margin ratio of ${r}%: each $1 of sales leaves $${(r / 100).toFixed(2)} after variable costs. ` +
      `Its fixed costs are ${cash(F)} per month.`;
    ask = "What monthly revenue, in dollars, does it need to break even?";
    intro = "Break-even revenue = fixed costs ÷ contribution margin ratio (as a decimal).";
    lines = [
      given("_fixed", mv(F)),
      step("_cm_ratio", `${r} / 100`, num(r / 100)),
      step("_be_revenue", "_fixed / _cm_ratio", final(exact, fmt, unit)),
    ];
    candidates = [(F * r) / 100, F / (1 - r / 100), F + (F * r) / 100]; // multiplied, used the cost ratio, added
  } else if (kind === "units" || kind === "target-units") {
    // Medium: two variable-cost parts. Hard: plus a target profit.
    const target = kind === "target-units";
    const stepC = target ? 5 : 10;
    let Pc, a, b, F, T, mC;
    for (let i = 0; i < 200; i++) {
      Pc = priceC(rng, s.price, stepC);
      const Cc = stepC * rng.int(Math.max(2, Math.ceil((Pc * 0.25) / stepC)), Math.max(2, Math.floor((Pc * 0.6) / stepC)));
      a = stepC * rng.int(1, Cc / stepC - 1);
      b = Cc - a;
      mC = Pc - Cc;
      F = Math.max(100, Math.round((mC * vol()) / 100) + rng.int(-40, 40));
      T = target ? 50 * rng.int(Math.max(1, Math.round(F / 250)), Math.max(2, Math.round(F / 60))) : 0;
      if (mC > 0 && fracOk((F + T) * 100, mC)) break;
    }
    const N = ceilDiv((F + T) * 100, mC);
    const [pa, pb] = s.parts;
    exact = N;
    fmt = "int";
    unit = s.units;
    values = { P: Pc / 100, costs: [a / 100, b / 100], F, T };
    scen =
      `${s.biz} sells ${s.sells} for ${cash(Pc / 100)} per ${s.unit}. Variable costs per ${s.unit} are ${cash(a / 100)} for ${pa[0]} ` +
      `and ${cash(b / 100)} for ${pb[0]}. Fixed costs are ${cash(F)} per month.` +
      (target ? ` The owner wants a profit of ${cash(T)} per month after fixed costs.` : "");
    ask =
      (target
        ? `How many ${s.units} must it sell each month to reach that profit?`
        : `How many ${s.units} must it sell each month to break even?`) + roundUp;
    intro = target
      ? "To earn a target profit, the margin has to cover fixed costs plus the target. Units = (fixed + target) ÷ margin, rounded up so the target is reached."
      : "Add the variable costs, find the margin per unit, then divide fixed costs by it. Round up: one unit short is still a loss.";
    lines = [given("_price", mv(Pc / 100)), given(pa[1], mv(a / 100)), given(pb[1], mv(b / 100)), given("_fixed", mv(F))];
    if (target) lines.push(given("_target", mv(T)));
    lines.push(
      step("_unit_cost", `${pa[1]} + ${pb[1]}`, mv((a + b) / 100)),
      step("_margin", "_price - _unit_cost", mv(mC / 100)),
      step("_units", target ? "ceil((_fixed + _target) / _margin)" : "ceil(_fixed / _margin)", final(N, fmt, unit))
    );
    candidates = [N - 1, target ? ceilDiv(F * 100, mC) : Math.ceil((F * 100) / Pc), target ? ceilDiv(T * 100, mC) : ceilDiv(F * 100, Pc - a)];
  } else if (kind === "revenue") {
    // Medium: rounded-up units times the price.
    let Pc, Cc, F, mC;
    for (let i = 0; i < 200; i++) {
      Pc = priceC(rng, s.price, 10);
      Cc = 10 * rng.int(Math.max(1, Math.ceil((Pc * 0.25) / 10)), Math.max(1, Math.floor((Pc * 0.6) / 10)));
      mC = Pc - Cc;
      F = Math.max(100, Math.round((mC * vol()) / 100) + rng.int(-40, 40));
      if (mC > 0 && fracOk(F * 100, mC)) break;
    }
    const N = ceilDiv(F * 100, mC);
    exact = (N * Pc) / 100;
    fmt = "2dp";
    unit = "money";
    values = { P: Pc / 100, C: Cc / 100, F };
    scen =
      `${s.biz} sells ${s.sells} for ${cash(Pc / 100)} per ${s.unit}. Each ${s.unit} costs ${cash(Cc / 100)} in variable costs, ` +
      `and fixed costs are ${cash(F)} per month.`;
    ask =
      `What monthly revenue does it need to break even, in dollars? ` +
      `First round the break-even quantity up to whole ${s.units}, then multiply by the price.${DP2}`;
    beUnits = N;
    intro = "Find the break-even quantity (rounded up to whole units), then turn it into revenue.";
    lines = [
      given("_price", mv(Pc / 100)),
      given("_unit_cost", mv(Cc / 100)),
      given("_fixed", mv(F)),
      step("_margin", "_price - _unit_cost", mv(mC / 100)),
      step("_units", "ceil(_fixed / _margin)", `${N} ${s.units}`),
      step("_revenue", "_units * _price", final(exact, fmt, unit)),
    ];
    candidates = [(F * Pc) / mC, ((N - 1) * Pc) / 100, (N * Cc) / 100]; // no rounding up, rounded down, used the cost
  } else if (kind === "price-change") {
    // Hard: the price moves by a percentage; find the new break-even quantity.
    let Pc, u, P2c, Cc, F, mC;
    for (let i = 0; i < 200; i++) {
      Pc = priceC(rng, s.price, 20);
      u = rng.pick([5, 10, 15, 20, 25]) * (rng.next() < 0.5 ? 1 : -1);
      P2c = (Pc * (100 + u)) / 100; // whole cents: Pc is a multiple of 20 and u of 5
      const low = Math.min(Pc, P2c);
      Cc = 10 * rng.int(Math.max(1, Math.ceil((low * 0.25) / 10)), Math.max(1, Math.floor((low * 0.55) / 10)));
      mC = P2c - Cc;
      F = Math.max(100, Math.round((mC * vol()) / 100) + rng.int(-40, 40));
      if (mC > 0 && Pc - Cc > 0 && fracOk(F * 100, mC)) break;
    }
    const N = ceilDiv(F * 100, mC);
    const up = u > 0;
    exact = N;
    fmt = "int";
    unit = s.units;
    values = { P: Pc / 100, u, C: Cc / 100, F };
    scen =
      `${s.biz} sells ${s.sells} for ${cash(Pc / 100)} per ${s.unit}. Each ${s.unit} costs ${cash(Cc / 100)} in variable costs, ` +
      `and fixed costs are ${cash(F)} per month. The owner plans to ${up ? "raise" : "cut"} the price by ${Math.abs(u)}%, ` +
      `with costs unchanged.`;
    ask = `What will the new monthly break-even quantity be?${roundUp}`;
    intro = `Apply the price ${up ? "rise" : "cut"} first, then find the new margin and break-even quantity.`;
    lines = [
      given("_price", mv(Pc / 100)),
      given("_change", num(Math.abs(u) / 100)),
      given("_unit_cost", mv(Cc / 100)),
      given("_fixed", mv(F)),
      step("_new_price", `_price * (1 ${up ? "+" : "-"} _change)`, mv(P2c / 100)),
      step("_margin", "_new_price - _unit_cost", mv(mC / 100)),
      step("_units", "ceil(_fixed / _margin)", final(N, fmt, unit)),
    ];
    const P3c = (Pc * (100 - u)) / 100;
    candidates = [ceilDiv(F * 100, Pc - Cc), N - 1, P3c - Cc > 0 ? Math.ceil((F * 100) / (P3c - Cc)) : NaN]; // old price, rounded down, wrong direction
  } else {
    // Hard: revenue for a target profit via the contribution margin ratio.
    const Pc = rng.int(s.price[0] * 100, s.price[1] * 100);
    const Cc = rng.int(Math.ceil(Pc * 0.3), Math.floor(Pc * 0.6));
    const mC = Pc - Cc;
    const F = Math.max(100, Math.round((mC * vol()) / 100) + rng.int(-40, 40));
    const T = 50 * rng.int(Math.max(1, Math.round(F / 250)), Math.max(2, Math.round(F / 60)));
    exact = ((F + T) * Pc) / mC;
    fmt = "2dp";
    unit = "money";
    values = { P: Pc / 100, C: Cc / 100, F, T };
    scen =
      `${s.biz} sells ${s.sells} for ${cash(Pc / 100)} per ${s.unit}, and each ${s.unit} costs ${cash(Cc / 100)} in variable costs. ` +
      `Fixed costs are ${cash(F)} per month, and the owner wants a monthly profit of ${cash(T)}.`;
    ask =
      `What monthly revenue, in dollars, reaches that profit? Use revenue = (fixed costs + target profit) ÷ contribution margin ratio, without rounding to whole ${s.units}.${DP2}`;
    intro = "The contribution margin ratio is the share of each sales dollar left after variable costs. Divide what must be covered by that share.";
    lines = [
      given("_price", mv(Pc / 100)),
      given("_unit_cost", mv(Cc / 100)),
      given("_fixed", mv(F)),
      given("_target", mv(T)),
      step("_margin", "_price - _unit_cost", mv(mC / 100)),
      step("_cm_ratio", "_margin / _price", num(mC / Pc)),
      step("_revenue", "(_fixed + _target) / _cm_ratio", final(exact, fmt, unit)),
    ];
    candidates = [(F * Pc) / mC, ((F + T) * Pc) / Cc, ((F + T) * mC) / Pc]; // forgot the target, used the cost ratio, multiplied
  }

  if (wantMulti && kind !== "target-revenue") {
    return breakEvenMulti({ s, kind, scen, ask, exact, fmt, unit, lines, intro, values, beUnits, rng });
  }
  const base = { prompt: `${scen} ${ask}`, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Unit economics

function genUnitEconomics(difficulty, rng) {
  checkDifficulty(difficulty);
  // About half are multi-part (LTV + LTV:CAC + Recommendation, or LTV + max CAC).
  const wantMulti = rng.next() < 0.5;
  const kind = wantMulti
    ? (difficulty === "hard" ? rng.pick(["churn-ratio", "churn-ratio", "max-cac"]) : "ltv-cac")
    : rng.pick(difficulty === "hard" ? ["churn-ltv", "churn-ratio", "max-cac"] : ["cm-ratio", "ltv", "ltv-cac"]);
  // Keep multi-part ratios clearly away from the healthy threshold, so rounding never flips it.
  const clearOfRule = (ratio) => !wantMulti || Math.abs(ratio - HEALTHY_MIN) >= 0.05;
  let prompt, scen, ask, exact, fmt, unit, lines, intro, candidates, values, ltvExact, ltvFmt;

  if (kind === "cm-ratio") {
    const s = rng.pick(SHOPS);
    let P, costs;
    if (difficulty === "easy") {
      const r = rng.pick([20, 25, 40, 50, 60, 75, 80]);
      const stepD = r % 20 === 0 ? 5 : 4; // makes price × r / 100 whole
      const lo = Math.ceil(s.price[0] / stepD);
      P = stepD * rng.int(lo, Math.max(lo, Math.floor(s.price[1] / stepD)));
      costs = [P - (P * r) / 100];
      fmt = "int";
    } else {
      const Pc = priceC(rng, s.price, 10);
      const Cc = 5 * rng.int(Math.ceil((Pc * 0.25) / 5), Math.floor((Pc * 0.65) / 5));
      const a = 5 * rng.int(1, Cc / 5 - 1);
      P = Pc / 100;
      costs = [a / 100, (Cc - a) / 100];
      fmt = "2dp";
    }
    const C = costs.reduce((x, y) => x + y, 0);
    const m = P - C;
    exact = (m * 100) / P;
    unit = "pct";
    values = { P, costs };
    const end = fmt === "2dp" ? DP2 : "";
    const [pa, pb] = s.parts;
    prompt =
      `${s.biz} sells ${s.sells} for ${cash(P)} per ${s.unit}. ` +
      (costs.length === 1
        ? `The variable cost of each ${s.unit} is ${cash(C)}. `
        : `Variable costs per ${s.unit} are ${cash(costs[0])} for ${pa[0]} and ${cash(costs[1])} for ${pb[0]}. `) +
      `What is its contribution margin ratio (the margin per ${s.unit} as a percent of the price)?${PCT_NOTE}${end}`;
    intro = "Contribution margin = price - variable cost. The ratio expresses it as a percent of the price.";
    lines = [given("_price", mv(P))];
    if (costs.length === 1) lines.push(given("_unit_cost", mv(C)));
    else lines.push(given(pa[1], mv(costs[0])), given(pb[1], mv(costs[1])), step("_unit_cost", `${pa[1]} + ${pb[1]}`, mv(C)));
    lines.push(step("_margin", "_price - _unit_cost", mv(m)), step("_cm_ratio", "_margin * 100 / _price", final(exact, fmt, unit)));
    candidates = [(m * 100) / C, (C * 100) / P, m]; // markup on cost, cost ratio, margin in dollars
  } else if (kind === "ltv") {
    const biz = rng.pick(CUSTOMER_BIZ);
    const k = rng.int(2, 12);
    const y = rng.int(difficulty === "easy" ? 1 : 2, difficulty === "easy" ? 5 : 6);
    if (difficulty === "easy") {
      const X = 5 * rng.int(1, 10);
      exact = X * k * y;
      fmt = "int";
      values = { X, k, y };
      prompt =
        `${biz}'s typical customer places ${k} orders a year and stays for ${years(y)}. Each order earns ${cash(X)} of gross profit. ` +
        `What is the customer lifetime value (LTV) in gross profit, in dollars?`;
      intro = "LTV = gross profit per order × orders per year × years as a customer.";
      lines = [
        given("_order_profit", mv(X)),
        given("_orders", k),
        given("_years", y),
        step("_yearly_profit", "_order_profit * _orders", mv(X * k)),
        step("_ltv", "_yearly_profit * _years", final(exact, fmt, "money")),
      ];
      candidates = [X * k, X * y, X * (k + y)]; // one year only, forgot orders, added
    } else {
      const Ac = rng.int(2000, 9000);
      const g = rng.int(20, 60);
      const A = Ac / 100;
      exact = (Ac * k * y * g) / 10000;
      fmt = "2dp";
      values = { A, k, y, g };
      prompt =
        `${biz}'s average order is ${cash(A)} and its gross margin is ${g}%. A typical customer orders ${k} times a year for ${years(y)}. ` +
        `What is the customer lifetime value in gross profit, in dollars?${DP2}`;
      intro = "Lifetime revenue first, then keep only the gross-margin share of it.";
      lines = [
        given("_order_value", mv(A)),
        given("_orders", k),
        given("_years", y),
        given("_gm", g),
        step("_yearly_revenue", "_order_value * _orders", mv(A * k)),
        step("_lifetime_rev", "_yearly_revenue * _years", mv(A * k * y)),
        step("_ltv", "_lifetime_rev * _gm / 100", final(exact, fmt, "money")),
      ];
      candidates = [(Ac * k * y) / 100, (Ac * k * g) / 10000, (Ac * k * y * (100 - g)) / 10000]; // revenue, one year, cost share
    }
    unit = "money";
  } else if (kind === "ltv-cac") {
    const biz = rng.pick(CUSTOMER_BIZ);
    if (difficulty === "easy") {
      const Y = 10 * rng.int(3, 30);
      const y = rng.int(2, 5);
      const ltv = Y * y;
      const r = rng.pick([2, 3, 4, 5, 6].filter((d) => ltv % d === 0)); // 2 and 5 always divide ltv
      const CAC = ltv / r;
      exact = r;
      fmt = "int";
      values = { Y, y, CAC };
      ltvExact = ltv;
      ltvFmt = "int";
      scen =
        `${biz} earns ${cash(Y)} of gross profit per customer each year, and customers stay ${years(y)} on average. ` +
        `Winning a new customer costs ${cash(CAC)} in marketing (the CAC).`;
      ask = `What is the LTV:CAC ratio?${RATIO_NOTE}`;
      prompt = `${scen} ${ask}`;
      intro = "LTV:CAC compares what a customer is worth with what it cost to win them. Find LTV, then divide by CAC.";
      lines = [
        given("_yearly_profit", mv(Y)),
        given("_years", y),
        given("_cac", mv(CAC)),
        step("_ltv", "_yearly_profit * _years", wantMulti ? final(ltv, "int", "money") : mv(ltv)),
        step("_ratio", "_ltv / _cac", final(exact, fmt, "")),
      ];
      candidates = [Y / CAC, CAC / ltv, ltv - CAC]; // one year, upside down, difference
    } else {
      const Xc = rng.int(500, 4000);
      const k = rng.int(2, 12);
      const y = rng.int(2, 5);
      let CAC;
      for (let i = 0; i < 50; i++) {
        CAC = Math.max(20, Math.round((Xc * k * y) / rng.int(80, 600))); // keeps the ratio roughly 0.8-6
        if (clearOfRule((Xc * k * y) / (100 * CAC))) break;
      }
      const X = Xc / 100;
      exact = (Xc * k * y) / (100 * CAC);
      fmt = "2dp";
      values = { X, k, y, CAC };
      ltvExact = (Xc * k * y) / 100;
      ltvFmt = "2dp";
      scen =
        `${biz} makes ${cash(X)} of gross profit per order. A typical customer orders ${k} times a year and stays ${years(y)}, ` +
        `and acquiring a customer costs ${cash(CAC)}.`;
      ask = `What is the LTV:CAC ratio?${RATIO_NOTE}${DP2}`;
      prompt = `${scen} ${ask}`;
      intro = "Build LTV from profit per order, then compare it with the acquisition cost.";
      lines = [
        given("_order_profit", mv(X)),
        given("_orders", k),
        given("_years", y),
        given("_cac", mv(CAC)),
        step("_yearly_profit", "_order_profit * _orders", mv(X * k)),
        step("_ltv", "_yearly_profit * _years", wantMulti ? final(ltvExact, "2dp", "money") : mv(X * k * y)),
        step("_ratio", "_ltv / _cac", final(exact, fmt, "")),
      ];
      candidates = [(Xc * k) / (100 * CAC), (100 * CAC) / (Xc * k * y), (Xc * y) / (100 * CAC)]; // one year, upside down, forgot orders
    }
    unit = "";
  } else {
    // Hard: subscription with monthly churn; lifetime = 1 / churn.
    const biz = rng.pick(SAAS);
    const fee = rng.int(15, 149) + 0.99;
    const g = rng.int(60, 90);
    const c = rng.int(15, 80) / 10;
    const ltv = (fee * g) / c;
    values = { fee, g, c };
    fmt = "2dp";
    prompt =
      `${biz} charges ${cash(fee)} per customer per month at a ${g}% gross margin. Each month ${num(c)}% of customers cancel ` +
      `(monthly churn), so the average customer stays 1 ÷ churn months.`;
    intro = "Average lifetime = 1 ÷ churn rate. LTV = monthly gross profit × lifetime in months.";
    lines = [
      given("_fee", mv(fee)),
      given("_gm", g),
      given("_churn", num(c)),
      step("_lifetime", "1 / (_churn / 100)", `${num(100 / c)} months`),
      step("_monthly_profit", "_fee * _gm / 100", num((fee * g) / 100)),
    ];
    if (kind === "churn-ltv") {
      exact = ltv;
      unit = "money";
      prompt += ` What is the lifetime value (LTV) of a customer in gross profit, in dollars?${DP2}`;
      lines.push(step("_ltv", "_monthly_profit * _lifetime", final(exact, fmt, unit)));
      candidates = [(fee * 100) / c, (fee * g * c) / 10000, ltv * 12]; // forgot the margin, multiplied by churn, ×12
    } else if (kind === "churn-ratio") {
      let CAC;
      for (let i = 0; i < 50; i++) {
        CAC = Math.max(50, Math.round((ltv * 10) / rng.int(8, 60))); // keeps the ratio roughly 0.8-6
        if (clearOfRule(ltv / CAC)) break;
      }
      values.CAC = CAC;
      exact = ltv / CAC;
      unit = "";
      scen = `${prompt} It spends ${cash(CAC)} to acquire each customer.`;
      ask = `What is the LTV:CAC ratio?${RATIO_NOTE}${DP2}`;
      prompt = `${scen} ${ask}`;
      lines.splice(3, 0, given("_cac", mv(CAC)));
      lines.push(
        step("_ltv", "_monthly_profit * _lifetime", wantMulti ? final(ltv, "2dp", "money") : num(ltv)),
        step("_ratio", "_ltv / _cac", final(exact, fmt, unit))
      );
      candidates = [(fee * 100) / c / CAC, CAC / ltv, (fee * g) / 100 / CAC]; // forgot the margin, upside down, one month only
    } else {
      const t = rng.pick([3, 4, 5]);
      values.t = t;
      exact = ltv / t;
      unit = "money";
      scen = `${prompt} Its investors want an LTV:CAC ratio of at least ${t}:1.`;
      ask = `What is the most it can spend to acquire one customer, in dollars?${DP2}`;
      prompt = `${scen} ${ask}`;
      lines.splice(3, 0, given("_target", t));
      lines.push(
        step("_ltv", "_monthly_profit * _lifetime", wantMulti ? final(ltv, "2dp", "money") : num(ltv)),
        step("_max_cac", "_ltv / _target", final(exact, fmt, unit))
      );
      candidates = [ltv * t, (fee * 100) / c / t, ltv]; // multiplied, forgot the margin, LTV itself
    }
  }

  if (wantMulti) {
    const churn = kind !== "ltv-cac";
    if (churn) {
      ltvExact = (values.fee * values.g) / values.c;
      ltvFmt = "2dp";
    }
    const parts = [
      numPart("ltv", "LTV", `What is the customer lifetime value (LTV) in gross profit, in dollars?${ltvFmt === "2dp" ? DP2 : ""}`, ltvExact, ltvFmt),
    ];
    const specs = [{ id: "ltv", kind: churn ? "churn-ltv" : "ltv-total", fmt: ltvFmt }];
    let mPrompt = scen;
    let tail = "";
    const L = lines.slice();
    if (kind === "max-cac") {
      parts.push(numPart("max-cac", "Max CAC", ask, exact, fmt));
      specs.push({ id: "max-cac", kind, fmt });
    } else {
      const healthy = exact >= HEALTHY_MIN - 1e-9;
      parts.push(numPart("ratio", "LTV:CAC", ask, exact, fmt));
      parts.push(recPart("Are its unit economics healthy?", healthy ? HEALTHY : UNHEALTHY, REC_CHOICES.health));
      specs.push({ id: "ratio", kind, fmt }, { id: "rec", rec: "health" });
      mPrompt += ` It treats its unit economics as healthy if LTV:CAC is at least ${HEALTHY_MIN}:1.`;
      L.push(given("_healthy_min", HEALTHY_MIN));
      tail =
        `\n\n\`_ratio\` (${fmtAns(exact, fmt === "2dp")}) is ${healthy ? "at least" : "below"} \`_healthy_min\` (${HEALTHY_MIN}), ` +
        `so the answer is **${healthy ? HEALTHY : UNHEALTHY}**.`;
    }
    return multiQuestion(mPrompt, parts, specs, explain(intro, L) + tail, { kind, values, fmt });
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Investment

function genInvestment(difficulty, rng) {
  checkDifficulty(difficulty);
  const p = rng.pick(PROJECTS);
  const kind = rng.pick(difficulty === "easy" ? ["roi", "payback"] : ["roi", "payback", "npv"]);
  // About half are multi-part: the figure plus an invest / don't-invest Recommendation by a stated rule.
  const wantMulti = rng.next() < 0.5;
  let scen, ask, exact, fmt, unit, lines, intro, candidates, values;

  if (kind === "roi" && difficulty === "easy") {
    const cost = 1000 * rng.int(2, 20);
    const roi = 5 * rng.int(2, 30);
    const ret = (cost * (100 + roi)) / 100;
    exact = roi;
    fmt = "int";
    unit = "pct";
    values = { costs: [cost], yearly: ret, years: 1, resale: 0 };
    scen =
      `${p.biz} spends ${cash(cost)} on ${p.asset}. Over the next few years the investment is expected to bring in ${cash(ret)} of extra profit in total.`;
    ask = `What is the return on investment (ROI)? Use ROI = (extra profit - cost) ÷ cost × 100.${PCT_NOTE}`;
    intro = "ROI measures the net gain as a percent of what was spent.";
    lines = [
      given("_cost", mv(cost)),
      given("_return", mv(ret)),
      step("_gain", "_return - _cost", mv(ret - cost)),
      step("_roi", "_gain * 100 / _cost", final(exact, fmt, unit)),
    ];
    candidates = [(ret * 100) / cost, ((ret - cost) * 100) / ret, ret - cost]; // forgot to subtract the cost, divided by the return, gain in dollars
  } else if (kind === "roi") {
    let price, install, yearly, resale;
    const y = rng.int(2, 5);
    if (difficulty === "medium") {
      price = 100 * rng.int(20, 400);
      install = 50 * rng.int(4, 40);
      yearly = 10 * Math.round(((price + install) * rng.int(110, 250)) / 100 / y / 10);
      resale = 0;
    } else {
      price = rng.int(200000, 4000000) / 100;
      install = rng.int(20000, 300000) / 100;
      resale = Math.round(price * rng.int(5, 25)) / 100;
      yearly = Math.round((price + install - resale) * rng.int(110, 220) / y) / 100;
    }
    const totalCost = price + install;
    const totalRet = yearly * y + resale;
    exact = ((totalRet - totalCost) * 100) / totalCost;
    fmt = "2dp";
    unit = "pct";
    values = { costs: [price, install], yearly, years: y, resale };
    scen =
      `${p.biz} buys ${p.asset} for ${cash(price)}, plus ${cash(install)} to install it. It expects ${cash(yearly)} of extra profit a year for ${years(y)}` +
      (resale > 0 ? `, and then to sell it for ${cash(resale)}` : "") +
      ".";
    ask = `What is the ROI over that period? Use ROI = (total return - total cost) ÷ total cost × 100.${PCT_NOTE}${DP2}`;
    intro = "Add up everything spent and everything earned back, then compare the net gain with the total cost.";
    lines = [given("_price", mv(price)), given("_install", mv(install)), given("_yearly", mv(yearly)), given("_years", y)];
    if (resale > 0) lines.push(given("_resale", mv(resale)));
    lines.push(
      step("_total_cost", "_price + _install", mv(totalCost)),
      step("_total_return", resale > 0 ? "_yearly * _years + _resale" : "_yearly * _years", mv(totalRet)),
      step("_roi", "(_total_return - _total_cost) * 100 / _total_cost", final(exact, fmt, unit))
    );
    candidates = [
      ((totalRet - price) * 100) / price, // forgot installation
      ((totalRet - totalCost) * 100) / totalRet, // divided by the return
      ((yearly - totalCost) * 100) / totalCost, // only one year
    ];
  } else if (kind === "payback") {
    if (difficulty === "easy") {
      const net = 500 * rng.int(2, 16);
      const Y = rng.int(2, 8);
      const cost = net * Y;
      const upkeep = 100 * rng.int(2, 15);
      const extra = net + upkeep;
      exact = Y;
      fmt = "int";
      values = { cost, inflow: extra, monthly: false, upkeep };
      scen = `${p.biz} spends ${cash(cost)} on ${p.asset}. It adds ${cash(extra)} of profit a year but costs ${cash(upkeep)} a year to maintain.`;
      ask = "How many years will it take to earn back the cost? Assume the yearly amounts stay the same.";
      intro = "Payback period = cost ÷ net cash coming in each year.";
      lines = [
        given("_cost", mv(cost)),
        given("_profit", mv(extra)),
        given("_upkeep", mv(upkeep)),
        step("_net", "_profit - _upkeep", mv(net)),
        step("_payback", "_cost / _net", final(exact, fmt, "years")),
      ];
      candidates = [cost / extra, cost / (extra + upkeep), Y + 1]; // ignored upkeep, added upkeep, one too many
    } else {
      let M, U, cost;
      if (difficulty === "medium") {
        M = 10 * rng.int(20, 300);
        U = 50 * rng.int(4, Math.max(4, Math.floor((M * 6) / 50)));
        const net = 12 * M - U;
        cost = 100 * Math.max(1, Math.round((net * rng.int(150, 700)) / 10000));
      } else {
        const Mc = rng.int(15000, 300000);
        const Uc = rng.int(20000, Math.max(20000, Mc * 6));
        const netC = 12 * Mc - Uc;
        M = Mc / 100;
        U = Uc / 100;
        cost = Math.round((netC * rng.int(150, 700)) / 100) / 100;
      }
      const yearly = 12 * M;
      const net = yearly - U;
      exact = cost / net;
      fmt = "2dp";
      values = { cost, inflow: M, monthly: true, upkeep: U };
      scen = `${p.biz} spends ${cash(cost)} on ${p.asset}. It adds ${cash(M)} of profit a month and costs ${cash(U)} a year to maintain.`;
      ask = `How many years will it take to earn back the cost? Assume the profit comes in evenly through the year.${DP2}`;
      intro = "Work in years: turn the monthly profit into a yearly one, take off upkeep, then divide the cost by the net.";
      lines = [
        given("_cost", mv(cost)),
        given("_monthly", mv(M)),
        given("_upkeep", mv(U)),
        step("_yearly", "_monthly * 12", mv(yearly)),
        step("_net", "_yearly - _upkeep", mv(net)),
        step("_payback", "_cost / _net", final(exact, fmt, "years")),
      ];
      candidates = [cost / yearly, cost / (M - U), cost / net * 12]; // ignored upkeep, mixed months and years, answered in months
    }
    unit = "years";
  } else {
    // NPV: medium 2 cash flows, hard 3. Cost at year 0, flows at the end of each year.
    const n = difficulty === "medium" ? 2 : 3;
    let cost, r, flows, f, pvs;
    // A multi-part NPV keeps at least $1 away from zero, so the invest rule is never decided by rounding.
    for (let tries = 0; tries < 50; tries++) {
      flows = [];
      if (difficulty === "medium") {
        cost = 1000 * rng.int(10, 80);
        r = rng.int(5, 12);
        for (let i = 0; i < n; i++) flows.push(100 * Math.round((cost * rng.int(40, 75)) / 10000));
      } else {
        cost = rng.int(20000, 150000);
        r = rng.int(40, 150) / 10;
        for (let i = 0; i < n; i++) flows.push(rng.int(Math.round(cost * 0.25), Math.round(cost * 0.55)));
      }
      f = 1 + r / 100;
      pvs = flows.map((cf, i) => cf / Math.pow(f, i + 1));
      exact = pvs.reduce((a, b) => a + b, 0) - cost;
      if (!wantMulti || Math.abs(exact) >= 1) break;
    }
    fmt = "2dp";
    unit = "money";
    values = { cost, r, flows };
    const flowText =
      n === 2
        ? `${cash(flows[0])} at the end of year 1 and ${cash(flows[1])} at the end of year 2`
        : `${cash(flows[0])}, ${cash(flows[1])} and ${cash(flows[2])} at the end of years 1, 2 and 3`;
    scen = `${p.biz} is considering ${p.asset}, which costs ${cash(cost)} today. It is expected to bring in ${flowText}.`;
    ask =
      `Using a ${num(r)}% discount rate, what is the net present value (NPV), in dollars? The cost is paid now and is not discounted.` +
      `${DP2} Use a negative number if the NPV is negative.`;
    intro = "Discount each cash flow back to today by (1 + rate)^year, add them up, and subtract the cost.";
    lines = [given("_cost", mv(cost))];
    flows.forEach((cf, i) => lines.push(given(`_cf${i + 1}`, mv(cf))));
    lines.push(given("_rate", num(r / 100)));
    flows.forEach((cf, i) =>
      lines.push(step(`_pv${i + 1}`, i === 0 ? "_cf1 / (1 + _rate)" : `_cf${i + 1} / (1 + _rate)^${i + 1}`, num(pvs[i])))
    );
    lines.push(step("_npv", `${flows.map((_, i) => `_pv${i + 1}`).join(" + ")} - _cost`, final(exact, fmt, unit)));
    const sum = flows.reduce((a, b) => a + b, 0);
    candidates = [sum - cost, exact + cost, sum / f - cost]; // no discounting, forgot the cost, discounted one year only
  }

  if (wantMulti) return investmentMulti({ kind, scen, ask, exact, fmt, lines, intro, values, rng });
  const base = { prompt: `${scen} ${ask}`, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// Investment as two parts: the figure, then Invest / Don't invest by the rule in the prompt.
function investmentMulti({ kind, scen, ask, exact, fmt, lines, intro, values, rng }) {
  const v = { ...values };
  const L = lines.slice();
  let rule, invest, why;
  const shown = fmtAns(exact, fmt === "2dp");
  if (kind === "npv") {
    invest = exact > 0;
    rule = "The owner invests only if the NPV is positive.";
    why = `\`_npv\` (${dress(shown, "money")}) is ${invest ? "positive" : "not positive"}`;
  } else if (kind === "roi") {
    // A hurdle rate in whole 5% steps, at least 1 point away from the ROI.
    let H;
    for (let i = 0; i < 20; i++) {
      H = 5 * Math.max(1, Math.round((exact + (rng.next() < 0.5 ? -1 : 1) * rng.int(3, 20)) / 5));
      if (Math.abs(exact - H) >= 1) break;
    }
    if (Math.abs(exact - H) < 1) H += 5;
    v.hurdle = H;
    invest = exact >= H;
    rule = `The owner invests only if the ROI is at least ${H}%.`;
    L.push(given("_hurdle", H));
    why = `\`_roi\` (${shown}%) is ${invest ? "at least" : "below"} \`_hurdle\` (${H}%)`;
  } else {
    // payback: a whole-year limit, at least 0.1 years away from the payback period.
    let T;
    for (let i = 0; i < 20; i++) {
      T = Math.max(1, Math.round(exact) + rng.pick([-2, -1, 1, 2]));
      if (Math.abs(exact - T) >= 0.1) break;
    }
    if (Math.abs(exact - T) < 0.1) T += 1;
    v.maxYears = T;
    invest = exact <= T;
    rule = `The owner invests only if the payback period is at most ${years(T)}.`;
    L.push(given("_max_years", T));
    why = `\`_payback\` (${shown} years) is ${invest ? "within" : "over"} \`_max_years\` (${T})`;
  }
  const label = kind === "npv" ? "NPV" : kind === "roi" ? "ROI" : "Payback period";
  const parts = [
    numPart(kind, label, ask, exact, fmt),
    recPart("Should it invest?", invest ? INVEST : PASS, REC_CHOICES.invest),
  ];
  const specs = [{ id: kind, kind, fmt }, { id: "rec", rec: `invest-${kind}` }];
  const tail = `\n\n${why}, so the answer is **${invest ? INVEST : PASS}**.`;
  return multiQuestion(`${scen} ${rule}`, parts, specs, explain(intro, L) + tail, { kind, values: v, fmt });
}

// ---------------------------------------------------------------------------------------------
// Pricing decisions: compare two options, as "which is better" (choice) or "by how much" (number).

const SAME = "Same profit";
const LABELS = {
  "price-ab": ["Option A", "Option B"],
  "price-raise": ["Keep the current price", "Raise the price"],
  "make-buy": ["Make in-house", "Buy from the supplier"],
  suppliers: ["Supplier A", "Supplier B"],
};

// Profit of each option, in cents, relative to a shared baseline (revenue that is the same either way cancels out).
function optionProfitsC(kind, v) {
  if (kind === "price-ab") {
    const C = toC(v.C);
    return [toC(v.PA) * v.QA - C * v.QA, toC(v.PB) * v.QB - C * v.QB];
  }
  if (kind === "price-raise") {
    const P = toC(v.P);
    const C = toC(v.C);
    const P2 = Math.round((P * (100 + v.up)) / 100);
    const Q2 = Math.round((v.Q * (100 - v.drop)) / 100);
    return [P * v.Q - C * v.Q, P2 * Q2 - C * Q2];
  }
  if (kind === "make-buy") {
    const unitBuy = Math.round((toC(v.L) * (100 - v.d)) / 100);
    return [-(toC(v.S) + toC(v.v) * v.Q), -(unitBuy * v.Q + toC(v.ship))];
  }
  if (kind === "suppliers") {
    const unitB = Math.round((toC(v.L) * (100 - v.d)) / 100);
    return [-(toC(v.a) * v.Q + toC(v.s)), -(unitB * v.Q)];
  }
  return null;
}

function genPricing(difficulty, rng) {
  checkDifficulty(difficulty);
  const hard = difficulty === "hard";
  const kind = rng.pick(hard ? ["price-raise", "make-buy", "suppliers"] : ["price-ab", "make-buy", "suppliers"]);
  // Half multi-part (Calculation + Recommendation), a quarter each "which option" and "by how much".
  const r0 = rng.next();
  const mode = r0 < 0.5 ? "multi" : r0 < 0.75 ? "which" : "diff";
  // A real tie now and then, so "Same profit" is a live option (not for the percentage price rise).
  const tie = mode !== "diff" && kind !== "price-raise" && rng.next() < 0.15;
  const fmt = mode === "which" ? "choice" : difficulty === "easy" ? "int" : "2dp";
  const [labelA, labelB] = LABELS[kind];
  let prompt, intro, lines, values, rowA, rowB;

  if (kind === "price-ab") {
    const s = rng.pick(SHOPS);
    const stepC = difficulty === "easy" ? 100 : tie ? 50 : 10;
    const PA = priceC(rng, s.price, stepC);
    const mA = stepC * rng.int(Math.max(1, Math.ceil((PA * 0.3) / stepC)), Math.max(1, Math.floor((PA * 0.6) / stepC)));
    const C = PA - mA;
    const dB = stepC * rng.int(1, Math.max(1, Math.round((PA * 0.3) / stepC)));
    const PB = PA + dB;
    const mB = mA + dB;
    let QA, QB;
    if (tie) {
      const g = gcd(mA, mB);
      const qa = mB / g;
      const t = Math.max(1, Math.round(rng.int(s.vol[0], s.vol[1]) / qa));
      QA = qa * t;
      QB = (mA / g) * t;
    } else {
      QA = 10 * rng.int(Math.ceil(s.vol[0] / 10), Math.floor(s.vol[1] / 10));
      const minGap = difficulty === "easy" ? 1000 : 100;
      for (let i = 0; i < 50; i++) {
        QB = 10 * rng.int(Math.max(1, Math.round((QA * 0.5) / 10)), Math.max(1, Math.round((QA * 0.95) / 10)));
        if (Math.abs(mA * QA - mB * QB) >= minGap) break;
      }
      while (mA * QA === mB * QB) QB -= 10;
    }
    values = { C: C / 100, PA: PA / 100, QA, PB: PB / 100, QB };
    prompt =
      `${s.biz} is choosing a price for its ${s.sells}. Each ${s.unit} costs ${cash(C / 100)} in variable costs. ` +
      `Option A: charge ${cash(PA / 100)} and expect to sell ${QA} ${s.units} a month. ` +
      `Option B: charge ${cash(PB / 100)} and expect to sell ${QB} ${s.units} a month. Fixed costs are the same either way.`;
    intro = "Fixed costs cancel out, so compare the total contribution: (price - variable cost) × quantity.";
    lines = [
      given("_unit_cost", mv(C / 100)),
      given("_price_a", mv(PA / 100)),
      given("_qty_a", QA),
      given("_price_b", mv(PB / 100)),
      given("_qty_b", QB),
    ];
    rowA = ["_profit_a", "(_price_a - _unit_cost) * _qty_a"];
    rowB = ["_profit_b", "(_price_b - _unit_cost) * _qty_b"];
  } else if (kind === "price-raise") {
    // Hard: raise the price by u% and lose d% of sales.
    const s = rng.pick(SHOPS);
    let P, C, Q, up, drop;
    for (let i = 0; i < 50; i++) {
      P = priceC(rng, s.price, 20);
      C = 10 * rng.int(Math.max(1, Math.ceil((P * 0.3) / 10)), Math.max(1, Math.floor((P * 0.6) / 10)));
      Q = 20 * rng.int(Math.ceil(s.vol[0] / 20), Math.floor(s.vol[1] / 20));
      up = rng.pick([5, 10, 15, 20, 25]);
      drop = rng.pick([5, 10, 15, 20, 25, 30, 35, 40]);
      const [a, b] = optionProfitsC("price-raise", { P: P / 100, C: C / 100, Q, up, drop });
      if (Math.abs(a - b) >= 100) break;
    }
    values = { P: P / 100, C: C / 100, Q, up, drop };
    prompt =
      `${s.biz} sells ${Q} ${s.units} a month at ${cash(P / 100)} each, and each ${s.unit} costs ${cash(C / 100)} in variable costs. ` +
      `It could raise the price by ${up}%, but expects sales to fall by ${drop}%. Fixed costs stay the same.`;
    intro = "Fixed costs cancel out, so compare the contribution now with the contribution after the change.";
    lines = [
      given("_price", mv(P / 100)),
      given("_unit_cost", mv(C / 100)),
      given("_qty", Q),
      given("_raise", num(up / 100)),
      given("_drop", num(drop / 100)),
      step("_new_price", "_price * (1 + _raise)", mv((P * (100 + up)) / 10000)),
    ];
    rowA = ["_profit_now", "(_price - _unit_cost) * _qty"];
    rowB = ["_profit_new", "(_new_price - _unit_cost) * _qty * (1 - _drop)"];
  } else if (kind === "make-buy") {
    const m = rng.pick(MAKE);
    const Q = 10 * rng.int(Math.ceil(m.vol[0] / 10), Math.floor(m.vol[1] / 10));
    let L, d, v, unitBuy, ship;
    if (difficulty === "easy") {
      L = rng.int(m.buy[0], m.buy[1]) * 100;
      v = 100 * rng.int(Math.max(1, Math.ceil((L * 0.3) / 100)), L / 100 - 1);
      d = 0;
      ship = 0;
    } else if (difficulty === "medium") {
      L = priceC(rng, m.buy, 5);
      v = 5 * rng.int(Math.max(1, Math.ceil((L * 0.3) / 5)), Math.max(1, Math.floor((L * 0.75) / 5)));
      d = 0;
      ship = 0;
    } else {
      L = priceC(rng, m.buy, 20);
      d = rng.pick([5, 10, 15, 20, 25, 30]);
      v = rng.int(Math.ceil(L * 0.3), Math.floor(L * 0.6));
      ship = 100 * rng.int(20, 200);
    }
    unitBuy = (L * (100 - d)) / 100; // whole cents
    const tieS = (unitBuy - v) * Q + ship; // setup cost that makes both options cost the same
    let S;
    if (tie) S = tieS;
    else {
      const f = rng.next() < 0.5 ? rng.int(50, 85) : rng.int(115, 160);
      S = difficulty === "easy" ? 100 * Math.max(1, Math.round((tieS * f) / 10000)) : difficulty === "medium" ? 1000 * Math.max(1, Math.round((tieS * f) / 100000)) : Math.max(100, Math.round((tieS * f) / 10000) * 100 + rng.int(0, 99) * 100);
      if (S === tieS) S += difficulty === "easy" ? 100 : 1000;
    }
    values = { Q, S: S / 100, v: v / 100, L: L / 100, d, ship: ship / 100 };
    const buyText =
      d > 0
        ? `An outside supplier lists them at ${cash(L / 100)} each, gives a ${d}% discount on an order this size, and charges ${cash(ship / 100)} for shipping.`
        : `An outside supplier charges ${cash(L / 100)} per ${m.unit}.`;
    prompt =
      `${m.biz} needs ${Q} ${m.need}. Making them in-house means a one-off setup cost of ${cash(S / 100)} plus ${cash(v / 100)} per ${m.unit} ` +
      `in materials and labor. ${buyText} The ${m.units} bring in the same revenue either way.`;
    intro = "Revenue is the same either way, so the cheaper option gives the higher profit.";
    lines = [given("_qty", Q), given("_setup", mv(S / 100)), given("_var", mv(v / 100))];
    if (d > 0) {
      lines.push(
        given("_list", mv(L / 100)),
        given("_discount", num(d / 100)),
        given("_shipping", mv(ship / 100)),
        step("_unit_buy", "_list * (1 - _discount)", mv(unitBuy / 100))
      );
      rowB = ["_buy", "_unit_buy * _qty + _shipping"];
    } else {
      lines.push(given("_unit_buy", mv(L / 100)));
      rowB = ["_buy", "_unit_buy * _qty"];
    }
    rowA = ["_make", "_setup + _var * _qty"];
  } else {
    const sp = rng.pick(SUPPLY);
    const Q = 5 * rng.int(Math.ceil(sp.vol[0] / 5), Math.floor(sp.vol[1] / 5));
    let a, L, d;
    if (difficulty === "easy") {
      a = 100 * rng.int(sp.price[0], sp.price[1]);
      L = a + 100 * rng.int(1, 3);
      d = 0;
    } else if (difficulty === "medium") {
      a = priceC(rng, sp.price, 5);
      L = a + 5 * rng.int(2, Math.max(2, Math.round((a * 0.15) / 5)));
      d = 0;
    } else {
      d = rng.pick([5, 10, 15, 20]);
      a = rng.int(sp.price[0] * 100, sp.price[1] * 100);
      // list price so that B's discounted price lands a little above A's
      L = 20 * Math.ceil((a * (1 + rng.int(2, 15) / 100) * 100) / (100 - d) / 20);
    }
    const unitB = (L * (100 - d)) / 100;
    const tieFee = (unitB - a) * Q; // delivery fee that makes both cost the same
    let fee;
    if (tie) fee = tieFee;
    else {
      const f = rng.next() < 0.5 ? rng.int(40, 85) : rng.int(115, 170);
      fee = difficulty === "easy" ? 1000 * Math.max(1, Math.round((tieFee * f) / 100000)) : difficulty === "medium" ? 500 * Math.max(1, Math.round((tieFee * f) / 50000)) : Math.max(100, Math.round((tieFee * f) / 100));
      if (fee === tieFee) fee += 500;
    }
    values = { Q, a: a / 100, s: fee / 100, L: L / 100, d };
    const bText = d > 0 ? `lists them at ${cash(L / 100)} per ${sp.unit} with a ${d}% discount` : `charges ${cash(L / 100)} per ${sp.unit}`;
    prompt =
      `${sp.biz} needs ${Q} ${sp.item} this month. Supplier A charges ${cash(a / 100)} per ${sp.unit} plus a ${cash(fee / 100)} delivery fee. ` +
      `Supplier B ${bText} and delivers for free. Quality is the same, so revenue is unchanged.`;
    intro = "Revenue is the same either way, so the supplier with the lower total cost gives the higher profit.";
    lines = [given("_qty", Q), given("_price_a", mv(a / 100)), given("_fee_a", mv(fee / 100))];
    if (d > 0) {
      lines.push(given("_list_b", mv(L / 100)), given("_discount", num(d / 100)), step("_price_b", "_list_b * (1 - _discount)", mv(unitB / 100)));
    } else {
      lines.push(given("_price_b", mv(L / 100)));
    }
    rowA = ["_cost_a", "_price_a * _qty + _fee_a"];
    rowB = ["_cost_b", "_price_b * _qty"];
  }

  const [gA, gB] = optionProfitsC(kind, values);
  const isCost = kind === "make-buy" || kind === "suppliers";
  lines.push(step(rowA[0], rowA[1], mv(Math.abs(gA) / 100)), step(rowB[0], rowB[1], mv(Math.abs(gB) / 100)));
  const diffC = Math.abs(gA - gB);
  const params = { kind, mode, values, fmt };

  if (mode === "multi") {
    const answer = gA > gB ? labelA : gB > gA ? labelB : SAME;
    const exactDiff = diffC / 100;
    lines.push(step("_diff", `abs(${rowA[0]} - ${rowB[0]})`, final(exactDiff, fmt, "money")));
    const better =
      gA === gB
        ? `\`${rowA[0]}\` and \`${rowB[0]}\` are equal, so the difference is 0 and the answer is **${SAME}**.`
        : `\`${gA > gB ? rowA[0] : rowB[0]}\` is ${isCost ? "lower" : "higher"}, so the answer is **${answer}**.`;
    const parts = [
      numPart(
        "calc",
        "Calculation",
        `How much more profit, in dollars, does the better option make? Enter 0 if they are equal.${fmt === "2dp" ? DP2 : ""}`,
        exactDiff,
        fmt
      ),
      recPart("Which option should it choose?", answer, rng.shuffle([labelA, labelB, SAME])),
    ];
    const specs = [{ id: "calc", kind, fmt }, { id: "rec", rec: "pricing" }];
    return multiQuestion(
      `${prompt} The owner chooses the option with the higher profit, or "${SAME}" if both give the same profit.`,
      parts,
      specs,
      explain(intro, lines) + `\n\n${better}`,
      params
    );
  }

  if (mode === "which") {
    const answer = gA > gB ? labelA : gB > gA ? labelB : SAME;
    const better =
      gA === gB
        ? `\`${rowA[0]}\` and \`${rowB[0]}\` are equal, so the answer is **${SAME}**.`
        : `\`${gA > gB ? rowA[0] : rowB[0]}\` is ${isCost ? "lower" : "higher"}, so the answer is **${answer}**.`;
    return {
      prompt: `${prompt} Which option gives the higher profit?`,
      answer,
      answerType: "choice",
      choices: rng.shuffle([labelA, labelB, SAME]),
      tolerance: 0,
      explanation: explain(intro, lines) + `\n\n${better}`,
      params,
    };
  }

  const exact = diffC / 100;
  const end = fmt === "2dp" ? DP2 : "";
  lines.push(step("_diff", `abs(${rowA[0]} - ${rowB[0]})`, final(exact, fmt, "money")));
  return {
    prompt: `${prompt} How much more profit, in dollars, does the better option make?${end}`,
    answer: fmt === "2dp" ? round2(exact) : exact,
    answerType: "number",
    choices: undefined,
    tolerance: fmt === "2dp" ? 0.005 : 0,
    explanation: explain(intro, lines),
    params,
  };
}

// ---------------------------------------------------------------------------------------------
// Inventory: reorder point, ordering vs holding cost, EOQ.

// True when x is clearly away from a half cent, so exactly one 2-decimal answer is right.
function tieFree(x) {
  const c = Math.abs(x) * 100;
  const f = c - Math.floor(c);
  return Math.abs(f - 0.5) > 0.002;
}

const SMALLER = "Order smaller batches";
const LARGER = "Order larger batches";
const KEEP = "Keep the current size";
const SWITCH = "Switch to the EOQ";
const HIRE = "Hire";
const NO_HIRE = "Don't hire";
// Recommendation choices for the inventory and hiring subtopics, keyed by params.parts[].rec.
const NEW_REC_CHOICES = {
  "reorder-now": [YES, NO],
  "batch-size": [SMALLER, LARGER],
  "eoq-keep": [KEEP, SWITCH],
  "eoq-switch": [KEEP, SWITCH],
  hire: [HIRE, NO_HIRE],
};

const STOCK = [
  { biz: "A café", item: "bags of coffee beans", unit: "bag", units: "bags" },
  { biz: "A bike shop", item: "inner tubes", unit: "tube", units: "tubes" },
  { biz: "A hardware store", item: "boxes of screws", unit: "box", units: "boxes" },
  { biz: "A pet-supply store", item: "sacks of dog food", unit: "sack", units: "sacks" },
  { biz: "A print shop", item: "reams of paper", unit: "ream", units: "reams" },
  { biz: "A garden center", item: "bags of potting soil", unit: "bag", units: "bags" },
];

// Reorder point = ceil(demand × (lead days + safety days) ÷ days) + safety units, in whole numbers.
// Easy has whole daily demand (W = 1); medium spreads annual demand over working days; hard uses
// weekly demand and a safety stock given in days of demand.
const ropOf = (k) => ceilDiv(k.A * (k.L + k.sd), k.W) + k.ss;
// EOQ rounded to the nearest whole unit.
const eoqOf = (k) => Math.round(Math.sqrt((2 * k.D * k.S) / k.H));
const invCost = (k, Q) => (k.D * k.S) / Q + (Q * k.H) / 2;

function genInventory(difficulty, rng) {
  checkDifficulty(difficulty);
  const s = rng.pick(STOCK);
  const kind = rng.pick(difficulty === "easy" ? ["reorder-point", "inv-costs"] : difficulty === "medium" ? ["reorder-point", "eoq"] : ["reorder-point", "eoq-cost"]);
  // Decided up front so a seed always gives the same question; about 60% multi-part.
  const wantMulti = rng.next() < 0.6;
  let scen, ask, exact, fmt, unit, lines, intro, candidates, values;

  if (kind === "reorder-point") {
    let A, W, L, ss, sd;
    for (let t = 0; t < 50; t++) {
      if (difficulty === "easy") {
        A = rng.int(3, 40);
        W = 1;
        L = rng.int(2, 10);
        ss = 5 * rng.int(0, 20);
        sd = 0;
      } else if (difficulty === "medium") {
        A = rng.int(800, 20000);
        W = rng.pick([250, 300, 360]);
        L = rng.int(3, 14);
        ss = 5 * rng.int(2, 40);
        sd = 0;
      } else {
        A = rng.int(20, 400);
        W = rng.pick([5, 6, 7]);
        L = rng.int(3, 12);
        ss = 0;
        sd = rng.int(2, 7);
      }
      // Keep demand × days clear of a whole number, so a calculator's ceil() never trips over binary
      // error (10.2 × 3 = 30.599999…, but 0.1 × 30 can land just above 3). Easy demand is whole.
      const rem = (A * (L + sd)) % W;
      if (W === 1 || (rem / W >= 0.02 && rem / W <= 0.98)) break;
    }
    values = { A, W, L, ss, sd };
    exact = ropOf(values);
    fmt = "int";
    unit = s.units;
    const lead = `A new order takes ${L} days to arrive`;
    if (difficulty === "easy") {
      scen = `${s.biz} uses about ${A} ${s.item} a day. ${lead}, and it keeps a safety stock of ${ss} ${s.units}.`;
      ask = `What is its reorder point, the stock level at which it should place a new order? Use reorder point = daily demand × lead time + safety stock.`;
      intro = "During the lead time the shop keeps selling, so it must order while it still has enough to cover that demand plus the safety stock.";
      lines = [given("_daily", A), given("_lead", L), given("_safety", ss), step("_rop", "_daily * _lead + _safety", final(exact, fmt, unit))];
      candidates = [A * L, A * L + ss + A, A + ss]; // forgot safety stock, one day too many, forgot the lead time
    } else if (difficulty === "medium") {
      scen =
        `${s.biz} sells ${A} ${s.item} a year and is open ${W} days a year. ${lead}, and it keeps a safety stock of ${ss} ${s.units}.`;
      ask = `What is its reorder point? Use daily demand = yearly demand ÷ ${W}, and round the reorder point up to whole ${s.units}.`;
      intro = "Turn yearly demand into daily demand, cover the lead time, add the safety stock, and round up so you never order too late.";
      lines = [
        given("_yearly", A),
        given("_days", W),
        given("_lead", L),
        given("_safety", ss),
        step("_daily", "_yearly / _days", num(A / W)),
        step("_rop", "ceil(_daily * _lead) + _safety", final(exact, fmt, unit)),
      ];
      candidates = [Math.ceil((A * L) / W), exact - 1, Math.ceil((A * L) / 365) + ss]; // forgot safety stock, rounded down, used 365 days
    } else {
      scen =
        `${s.biz} sells about ${A} ${s.item} a week and is open ${W} days a week. ${lead}, and it keeps a safety stock ` +
        `equal to ${sd} days of demand.`;
      ask = `What is its reorder point? Round up to whole ${s.units} at the end.`;
      intro = "Daily demand = weekly demand ÷ open days. The order must cover the lead time plus the safety days; round up at the end.";
      lines = [
        given("_weekly", A),
        given("_open_days", W),
        given("_lead", L),
        given("_safety_days", sd),
        step("_daily", "_weekly / _open_days", num(A / W)),
        step("_rop", "ceil(_daily * (_lead + _safety_days))", final(exact, fmt, unit)),
      ];
      candidates = [Math.ceil((A * L) / W), exact - 1, Math.ceil((A * (L + sd)) / 7)]; // forgot safety stock, rounded down, used 7 days
    }

    if (wantMulti) {
      // Stock on hand at least 10% (and 3 units) away from the reorder point.
      const delta = Math.max(3, Math.round((exact * rng.int(10, 35)) / 100));
      const onHand = rng.next() < 0.5 || exact - delta < 1 ? exact + delta : exact - delta;
      const reorder = onHand <= exact;
      const v = { ...values, onHand };
      const L2 = [...lines, given("_on_hand", onHand)];
      const tail = `\n\n\`_on_hand\` (${onHand}) is ${reorder ? "at or below" : "above"} \`_rop\` (${exact}), so the answer is **${reorder ? YES : NO}**.`;
      const parts = [
        numPart("rop", "Reorder point", ask, exact, "int"),
        recPart("Should it place an order now?", reorder ? YES : NO, NEW_REC_CHOICES["reorder-now"]),
      ];
      const specs = [{ id: "rop", kind, fmt }, { id: "rec", rec: "reorder-now" }];
      const prompt = `${scen} It has ${onHand} ${s.units} on hand now, and it orders as soon as stock is at or below the reorder point.`;
      return multiQuestion(prompt, parts, specs, explain(intro, L2) + tail, { kind, values: v, fmt });
    }
  } else if (kind === "inv-costs") {
    // Easy: yearly ordering cost = orders × cost per order; holding = average stock (Q/2) × cost per unit.
    // Which cost should come out higher is picked first, so both recommendations are equally common.
    const holdHigher = rng.next() < 0.5;
    let Q, m, S, H;
    for (let t = 0; t < 80; t++) {
      Q = 10 * rng.int(5, 60);
      m = rng.int(4, 40);
      S = 5 * rng.int(4, 40);
      H = rng.int(1, 12);
      const o = m * S;
      const h = (Q * H) / 2;
      if (Math.abs(o - h) >= 0.1 * Math.max(o, h) && h > o === holdHigher) break;
    }
    const D = Q * m;
    const order = m * S;
    const hold = (Q * H) / 2;
    values = { D, Q, S, H };
    fmt = "int";
    unit = "money";
    scen =
      `${s.biz} sells ${D} ${s.item} a year and orders ${Q} at a time. Each order costs ${cash(S)} to place, and holding one ${s.unit} ` +
      `in stock for a year costs ${cash(H)}. Average stock is half the order size.`;
    intro = "Ordering cost = orders per year × cost per order. Holding cost = average stock (order size ÷ 2) × holding cost per unit.";
    lines = [
      given("_demand", D),
      given("_order_size", Q),
      given("_order_cost", mv(S)),
      given("_holding", mv(H)),
      step("_orders", "_demand / _order_size", m),
      step("_ordering", "_orders * _order_cost", mv(order)),
      step("_holding_total", "_order_size / 2 * _holding", mv(hold)),
    ];
    if (wantMulti) {
      const smaller = hold > order;
      const tail =
        `\n\n\`_holding_total\` (${cash(hold)}) is ${smaller ? "higher" : "lower"} than \`_ordering\` (${cash(order)}), ` +
        `so the answer is **${smaller ? SMALLER : LARGER}**.`;
      const parts = [
        numPart("ordering", "Ordering cost", "What is the yearly ordering cost, in dollars?", order, "int"),
        numPart("holding", "Holding cost", "What is the yearly holding cost, in dollars?", hold, "int"),
        recPart("Which way should it change its order size?", smaller ? SMALLER : LARGER, NEW_REC_CHOICES["batch-size"]),
      ];
      const specs = [
        { id: "ordering", kind: "order-cost", fmt },
        { id: "holding", kind: "hold-cost", fmt },
        { id: "rec", rec: "batch-size" },
      ];
      const prompt =
        `${scen} If the yearly holding cost is higher than the yearly ordering cost, the manager orders smaller batches; otherwise, larger batches.`;
      return multiQuestion(prompt, parts, specs, explain(intro, lines) + tail, { kind, values, fmt });
    }
    exact = order + hold;
    ask = "What is the total yearly ordering and holding cost, in dollars?";
    lines.push(step("_total", "_ordering + _holding_total", final(exact, fmt, unit)));
    candidates = [order + Q * H, D * S + hold, order]; // forgot ÷ 2, forgot ÷ order size, ordering only
    values = { ...values, total: true };
  } else {
    // EOQ = sqrt(2DS/H), rounded to the nearest whole unit (kept clear of x.5).
    const hard = kind === "eoq-cost";
    let D, S, H, E;
    for (let t = 0; t < 80; t++) {
      D = rng.int(500, 20000);
      S = hard ? rng.int(2000, 25000) / 100 : 5 * rng.int(4, 40);
      H = hard ? rng.int(150, 2500) / 100 : 0.5 * rng.int(2, 40);
      E = Math.sqrt((2 * D * S) / H);
      const f = E - Math.floor(E);
      if (E >= 40 && Math.abs(f - 0.5) >= 0.05 && (!hard || tieFree(invCost({ D, S, H }, Math.round(E))))) break;
    }
    const Q = Math.round(E);
    values = { D, S, H };
    fmt = "int";
    unit = s.units;
    scen =
      `${s.biz} sells ${D} ${s.item} a year. Each order costs ${cash(S)} to place, and holding one ${s.unit} in stock for a year costs ${cash(H)}.`;
    ask = `What is its economic order quantity (EOQ)? Use EOQ = √(2 × yearly demand × order cost ÷ holding cost), rounded to the nearest whole ${s.unit}.`;
    intro = "The EOQ balances ordering cost (fewer, bigger orders) against holding cost (less stock on the shelf).";
    lines = [
      given("_demand", D),
      given("_order_cost", mv(S)),
      given("_holding", mv(H)),
      step("_eoq_exact", "sqrt(2 * _demand * _order_cost / _holding)", num(E)),
      step("_eoq", "round(_eoq_exact)", final(Q, "int", unit)),
    ];
    candidates = [Math.round(Math.sqrt((D * S) / H)), Math.round(Math.sqrt((2 * D * H) / S)), Math.round(Math.sqrt(2 * D * S) / H)]; // forgot 2, swapped costs, divided outside the root
    exact = Q;

    if (!hard && wantMulti) {
      // Current order size either within 5% of the EOQ or 18-45% away; the rule's line is 10%.
      const near = rng.next() < 0.5;
      const sign = rng.next() < 0.5 ? -1 : 1;
      const N = Math.round(E * (1 + (sign * (near ? rng.int(0, 5) : rng.int(18, 45))) / 100));
      const keep = Math.abs(N / E - 1) <= 0.1;
      const v = { ...values, N };
      const L2 = [...lines, given("_current", N), step("_gap", "abs(_current / _eoq - 1) * 100", `${(Math.abs(N / Q - 1) * 100).toFixed(1)}%`)];
      const tail = `\n\n\`_current\` (${N}) is ${keep ? "within" : "more than"} 10% ${keep ? "of" : "away from"} the EOQ (${Q}), so the answer is **${keep ? KEEP : SWITCH}**.`;
      const parts = [
        numPart("eoq", "EOQ", ask, Q, "int"),
        recPart(`Should it keep ordering ${N} at a time?`, keep ? KEEP : SWITCH, NEW_REC_CHOICES["eoq-keep"]),
      ];
      const specs = [{ id: "eoq", kind: "eoq", fmt }, { id: "rec", rec: "eoq-keep" }];
      const prompt = `${scen} It now orders ${N} at a time. It keeps that order size if it is within 10% of the EOQ; otherwise it switches to the EOQ.`;
      return multiQuestion(prompt, parts, specs, explain(intro, L2) + tail, { kind, values: v, fmt });
    }

    if (hard) {
      const cost = invCost(values, Q);
      if (wantMulti) {
        // Current order size N and a savings bar T, with the actual saving well clear of T.
        // The outcome is picked first, then a bar from the list that gives it with room to spare.
        const wantSwitch = rng.next() < 0.5;
        let N, T, save;
        for (let t = 0; t < 80; t++) {
          const sign = rng.next() < 0.5 ? -1 : 1;
          N = Math.max(5, Math.round(Q * (1 + (sign * rng.int(15, 70)) / 100)));
          save = invCost(values, N) - cost;
          const ok = [25, 50, 100, 150, 200, 300, 500, 800].filter(
            (b) => Math.abs(save - b) >= Math.max(10, 0.2 * b) && save >= b === wantSwitch
          );
          T = ok.length ? rng.pick(ok) : 100;
          if (ok.length) break;
        }
        const sw = save >= T;
        const v = { ...values, N, T };
        const L2 = [
          ...lines,
          step("_cost_eoq", "_demand / _eoq * _order_cost + _eoq / 2 * _holding", final(cost, "2dp", "money")),
          given("_current", N),
          given("_min_saving", T),
          step("_cost_now", "_demand / _current * _order_cost + _current / 2 * _holding", mv(invCost(values, N))),
          step("_saving", "_cost_now - _cost_eoq", mv(save)),
        ];
        const tail = `\n\n\`_saving\` (${cash(save)}) is ${sw ? "at least" : "less than"} \`_min_saving\` (${cash(T)}), so the answer is **${sw ? SWITCH : KEEP}**.`;
        const parts = [
          numPart("eoq", "EOQ", ask, Q, "int"),
          numPart(
            "cost",
            "Cost at EOQ",
            `What is the total yearly ordering and holding cost if it orders the EOQ (rounded) each time? Use (demand ÷ EOQ) × order cost + (EOQ ÷ 2) × holding cost.${DP2}`,
            cost,
            "2dp"
          ),
          recPart("Should it switch to the EOQ?", sw ? SWITCH : KEEP, NEW_REC_CHOICES["eoq-switch"]),
        ];
        const specs = [{ id: "eoq", kind: "eoq", fmt: "int" }, { id: "cost", kind: "eoq-cost", fmt: "2dp" }, { id: "rec", rec: "eoq-switch" }];
        const prompt =
          `${scen} It now orders ${N} at a time. It switches to the EOQ (rounded) only if that cuts its total yearly ordering and holding cost by at least ${cash(T)}.`;
        return multiQuestion(prompt, parts, specs, explain(intro, L2) + tail, { kind, values: v, fmt: "int" });
      }
      // Single hard question: the yearly cost at the rounded EOQ.
      exact = cost;
      fmt = "2dp";
      unit = "money";
      ask =
        `First find the EOQ = √(2 × yearly demand × order cost ÷ holding cost), rounded to the nearest whole ${s.unit}. ` +
        `What is the total yearly ordering and holding cost when it orders that amount each time?${DP2}`;
      lines.push(step("_cost_eoq", "_demand / _eoq * _order_cost + _eoq / 2 * _holding", final(cost, fmt, unit)));
      candidates = [(D * S) / Q + Q * H, (D * S) / Q, (Q * H) / 2]; // forgot ÷ 2, ordering only, holding only
    }
  }

  const base = { prompt: `${scen} ${ask}`, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Hiring: full monthly cost of a hire vs the gross profit it brings in.

const ROLES = [
  { biz: "A café", role: "a barista" },
  { biz: "A bike shop", role: "a second mechanic" },
  { biz: "A print shop", role: "a designer" },
  { biz: "An online plant shop", role: "a marketing assistant" },
  { biz: "A SaaS startup", role: "a salesperson" },
  { biz: "A bakery", role: "an early-morning baker" },
  { biz: "A dog-grooming salon", role: "a groomer" },
];

// Monthly cost of a hire = salary × (1 + overhead%) ÷ 12.
const hireCostOf = (k) => (k.salary * (100 + k.o)) / 1200;

function genHiring(difficulty, rng) {
  checkDifficulty(difficulty);
  const r = rng.pick(ROLES);
  const kind = difficulty === "easy" ? "hire-cost" : difficulty === "medium" ? "hire-net" : "hire-payback";
  const wantMulti = rng.next() < 0.6;
  let salary, o, R, g, F, cost, contrib, net, months, exact, fmt, unit, candidates, ask;

  for (let t = 0; t < 80; t++) {
    if (kind === "hire-cost") {
      salary = 1200 * rng.int(20, 80);
      o = rng.pick([10, 20, 25, 30, 40]);
    } else {
      salary = kind === "hire-net" ? 500 * rng.int(50, 180) : rng.int(30000, 95000);
      o = rng.int(12, 40);
    }
    cost = hireCostOf({ salary, o });
    if (kind === "hire-cost") break;
    g = rng.int(kind === "hire-net" ? 25 : 30, kind === "hire-net" ? 70 : 75);
    // Gross profit the hire brings in: 60-160% of the cost (medium), 110-200% (hard), never near 100%.
    const ratio = kind === "hire-net" ? rng.int(60, 160) / 100 : rng.int(110, 200) / 100;
    R = kind === "hire-net" ? 100 * Math.max(1, Math.round((cost * ratio * 100) / g / 100)) : Math.max(100, Math.round((cost * ratio * 100) / g));
    contrib = (R * g) / 100;
    net = contrib - cost;
    if (!tieFree(cost) || !tieFree(net) || Math.abs(net) < 0.05 * cost) continue;
    if (kind === "hire-net") break;
    F = 100 * rng.int(10, 150);
    const x = F / net;
    const f = x - Math.floor(x);
    if (net > 0 && x <= 36 && f >= 0.03 && f <= 0.97) break;
  }
  const values = { salary, o };
  const lines = [given("_salary", mv(salary)), given("_overhead", o), step("_cost", "_salary * (1 + _overhead / 100) / 12", kind === "hire-cost" ? mv(cost) : num(cost))];
  let scen =
    `${r.biz} is thinking of hiring ${r.role} on a salary of ${cash(salary)} a year. Taxes, benefits and other overheads add ${o}% on top of the salary.`;
  let intro = "The full cost of a hire is the salary plus overheads, spread over 12 months.";

  if (kind === "hire-cost") {
    exact = cost;
    fmt = "int";
    unit = "money";
    ask = "What is the full monthly cost of the hire, in dollars?";
    lines[2] = step("_cost", "_salary * (1 + _overhead / 100) / 12", final(cost, fmt, unit));
    candidates = [salary / 12, (salary * (100 + o)) / 100, salary / 12 + o]; // no overhead, yearly cost, added the % as dollars
    if (wantMulti) {
      // Extra monthly gross profit, in $50 steps, 10-40% away from the cost.
      let G;
      for (let t = 0; t < 20; t++) {
        const sign = rng.next() < 0.5 ? -1 : 1;
        G = 50 * Math.round((cost * (1 + (sign * rng.int(10, 40)) / 100)) / 50);
        if (G > 0 && Math.abs(G - cost) >= 0.08 * cost) break;
      }
      const hire = G >= cost;
      const v = { ...values, G };
      const L2 = [...lines, given("_extra_profit", mv(G))];
      const tail = `\n\n\`_extra_profit\` (${cash(G)}) is ${hire ? "at least" : "below"} \`_cost\` (${cash(cost)}), so the answer is **${hire ? HIRE : NO_HIRE}**.`;
      const parts = [
        numPart("cost", "Monthly cost", ask, cost, "int"),
        recPart("Should it hire?", hire ? HIRE : NO_HIRE, NEW_REC_CHOICES.hire),
      ];
      const specs = [{ id: "cost", kind: "hire-cost", fmt: "int" }, { id: "rec", rec: "hire" }];
      const prompt =
        `${scen} The owner expects the hire to bring in ${cash(G)} of extra gross profit a month, and hires only if that is at least the hire's full monthly cost.`;
      return multiQuestion(prompt, parts, specs, explain(intro, L2) + tail, { kind, values: v, fmt });
    }
  } else {
    values.R = R;
    values.g = g;
    scen += ` The extra work should bring in ${cash(R)} of sales a month at a ${g}% gross margin.`;
    lines.push(
      given("_extra_sales", mv(R)),
      given("_margin", g),
      step("_extra_profit", "_extra_sales * _margin / 100", mv(contrib)),
      step("_net", "_extra_profit - _cost", kind === "hire-net" ? final(net, "2dp", "money") : num(net))
    );
    lines[2] = step("_cost", "_salary * (1 + _overhead / 100) / 12", final(cost, "2dp", "money"));
    const costAsk = `What is the full monthly cost of the hire, in dollars?${DP2}`;

    if (kind === "hire-net") {
      intro = "Compare the gross profit the hire brings in with their full monthly cost; the difference is the net monthly gain.";
      exact = net;
      fmt = "2dp";
      unit = "money";
      ask = `What is the net monthly gain from the hire (extra gross profit minus full monthly cost), in dollars? Use a negative number if it loses money.${DP2}`;
      candidates = [R - cost, contrib - salary / 12, cost - contrib]; // ignored the margin, ignored overheads, sign flipped
      if (wantMulti) {
        const hire = net > 0;
        const tail = `\n\n\`_net\` (${cash(net)}) is ${hire ? "positive" : "negative"}, so the answer is **${hire ? HIRE : NO_HIRE}**.`;
        const parts = [
          numPart("cost", "Monthly cost", costAsk, cost, "2dp"),
          numPart("net", "Net monthly gain", ask, net, "2dp"),
          recPart("Should it hire?", hire ? HIRE : NO_HIRE, NEW_REC_CHOICES.hire),
        ];
        const specs = [{ id: "cost", kind: "hire-cost", fmt: "2dp" }, { id: "net", kind: "hire-net", fmt: "2dp" }, { id: "rec", rec: "hire" }];
        const prompt = `${scen} The owner hires only if the net monthly gain is positive.`;
        return multiQuestion(prompt, parts, specs, explain(intro, lines) + tail, { kind, values, fmt });
      }
    } else {
      values.F = F;
      months = Math.ceil(F / net);
      scen += ` Recruiting and training cost ${cash(F)} up front.`;
      intro = "The net monthly gain (extra gross profit minus full monthly cost) pays back the up-front cost. Round up: the cost is only covered at a month end.";
      lines.push(given("_upfront", mv(F)), step("_payback", "ceil(_upfront / _net)", final(months, "int", "months")));
      exact = months;
      fmt = "int";
      unit = "months";
      ask = "How many months will the net monthly gain take to pay back the up-front cost? Round up to whole months.";
      candidates = [
        Math.ceil(F / contrib), // ignored the salary
        contrib - salary / 12 > 0 ? Math.ceil(F / (contrib - salary / 12)) : NaN, // ignored overheads
        months - 1, // rounded down
      ];
      if (wantMulti) {
        // A whole-month limit at least 0.3 months away from the exact payback.
        const x = F / net;
        let T;
        for (let t = 0; t < 20; t++) {
          T = Math.max(1, Math.round(x) + rng.pick([-3, -2, -1, 1, 2, 3]));
          if (Math.abs(x - T) >= 0.3) break;
        }
        if (Math.abs(x - T) < 0.3) T += 2;
        const hire = x <= T;
        const v = { ...values, T };
        const L2 = [...lines, given("_max_months", T)];
        const tail = `\n\n\`_payback\` (${months} months) is ${hire ? "within" : "over"} \`_max_months\` (${T}), so the answer is **${hire ? HIRE : NO_HIRE}**.`;
        const parts = [
          numPart("cost", "Monthly cost", costAsk, cost, "2dp"),
          numPart("months", "Payback", ask, months, "int"),
          recPart("Should it hire?", hire ? HIRE : NO_HIRE, NEW_REC_CHOICES.hire),
        ];
        const specs = [{ id: "cost", kind: "hire-cost", fmt: "2dp" }, { id: "months", kind: "hire-payback", fmt: "int" }, { id: "rec", rec: "hire" }];
        const prompt = `${scen} The owner hires only if the up-front cost is paid back within ${T} months.`;
        return multiQuestion(prompt, parts, specs, explain(intro, L2) + tail, { kind, values: v, fmt });
      }
    }
  }

  const base = { prompt: `${scen} ${ask}`, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// Given values for the calculator: the explanation's given rows (`- \`_price = 4.50\``, no "→"),
// which are exactly the numbers stated in the prompt, under the same labels. Read after the question
// is built, so it never touches the rng. Max 8, unique ignoring case; omitted when there are none.
const GIVEN_ROW = /^- `(_[A-Za-z0-9_]{1,23}) = (-?\d+(?:\.\d+)?)`$/gm;
function withGiven(q) {
  const out = [];
  const seen = new Set();
  for (const m of String(q.explanation || "").matchAll(GIVEN_ROW)) {
    const key = m[1].toLowerCase();
    const value = Number(m[2]);
    if (seen.has(key) || !Number.isFinite(value) || out.length >= 8) continue;
    seen.add(key);
    out.push({ label: m[1], value });
  }
  return out.length ? { ...q, given: out } : q;
}

function generateRaw(subtopic, difficulty, rng) {
  if (subtopic === "break-even") return genBreakEven(difficulty, rng);
  if (subtopic === "unit-economics") return genUnitEconomics(difficulty, rng);
  if (subtopic === "investment") return genInvestment(difficulty, rng);
  if (subtopic === "pricing-decision") return genPricing(difficulty, rng);
  if (subtopic === "inventory") return genInventory(difficulty, rng);
  if (subtopic === "hiring") return genHiring(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------
// Guided-mode hints. Built after the question is finished, from its explanation rows and params,
// so they never touch the rng and never change anything else on the question. Hints show each
// formula with this question's given numbers filled in, but never a computed result, and a
// Recommendation hint says what to compare, never which choice wins.

const HINT_STEP_ROW = /^- `(_[A-Za-z0-9_]{1,23}) = ([^`]+)` → /;
const HINT_GIVEN_ROW = /^- `(_[A-Za-z0-9_]{1,23}) = (-?\d+(?:\.\d+)?)`$/;
const LABEL_TOKEN = /_[A-Za-z0-9_]+/g;

// Given values (label -> text as shown) and calculation steps (label -> formula), in order.
function readRows(explanation) {
  const given = new Map();
  const steps = new Map();
  for (const line of String(explanation || "").split("\n")) {
    let m = HINT_GIVEN_ROW.exec(line);
    if (m) {
      if (!given.has(m[1])) given.set(m[1], m[2]);
      continue;
    }
    m = HINT_STEP_ROW.exec(line);
    if (m && !steps.has(m[1])) steps.set(m[1], m[2]);
  }
  return { given, steps };
}

// Steps needed to compute `label`, in explanation order, leaving out those in `done`.
function stepsFor(label, rows, done) {
  const need = new Set();
  (function walk(l) {
    if (need.has(l) || done.has(l) || !rows.steps.has(l)) return;
    need.add(l);
    for (const t of rows.steps.get(l).match(LABEL_TOKEN) || []) walk(t);
  })(label);
  return [...rows.steps.keys()].filter((l) => need.has(l));
}

// "Work out `_margin = _price - _unit_cost`, here `4.50 - 1.20`." (no result shown)
function stepSentence(label, rows) {
  const expr = rows.steps.get(label);
  const filled = expr.replace(LABEL_TOKEN, (t) => (rows.given.has(t) ? rows.given.get(t) : t));
  let s = `Work out \`${label} = ${expr}\`${filled !== expr ? `, here \`${filled}\`` : ""}.`;
  if (expr.includes("ceil(")) s += " Round up to a whole number.";
  else if (expr.includes("round(")) s += " Round to the nearest whole number.";
  return s;
}

// Up to `k` hints from the step sentences: the last step stays on its own.
function groupSteps(sentences, k) {
  if (sentences.length <= k) return sentences.slice();
  const head = sentences.slice(0, -1);
  const out = [];
  const size = Math.ceil(head.length / (k - 1));
  for (let i = 0; i < head.length; i += size) out.push(head.slice(i, i + size).join(" "));
  return [...out, sentences[sentences.length - 1]];
}

// The calculator row each multi-part answer ends on.
function partTarget(id, rows) {
  const map = {
    units: "_units", ltv: "_ltv", ratio: "_ratio", "max-cac": "_max_cac", roi: "_roi", payback: "_payback",
    npv: "_npv", calc: "_diff", rop: "_rop", ordering: "_ordering", holding: "_holding_total", eoq: "_eoq",
    net: "_net", months: "_payback",
  };
  if (id === "revenue") return rows.steps.has("_revenue") ? "_revenue" : "_be_revenue";
  if (id === "cost") return rows.steps.has("_cost_eoq") ? "_cost_eoq" : "_cost";
  return map[id];
}

const money = (s) => (s === undefined ? "" : `$${s}`);

// What a Recommendation compares, by params.parts[].rec. `ans(id)` names an earlier part's answer.
function recSentence(rec, q, rows, ans) {
  const g = (l) => rows.given.get(l);
  const kind = q.params.kind;
  switch (rec) {
    case "demand-units":
      return `Compare \`_demand\` (${g("_demand")}) with ${ans("units")}: demand is enough only if it is at least that many.`;
    case "demand-revenue":
      return `Compare \`_expected\` (${money(g("_expected"))}) with ${ans("revenue")}: sales are enough only if they are at least that much.`;
    case "health":
      return `Compare ${ans("ratio")} with \`_healthy_min\` (${g("_healthy_min")}): the rule asks for a ratio of at least ${g("_healthy_min")}:1.`;
    case "invest-npv":
      return `Look at the sign of ${ans("npv")}: the owner invests only if it is above zero.`;
    case "invest-roi":
      return `Compare ${ans("roi")} with \`_hurdle\` (${g("_hurdle")}%): the owner needs the ROI to be at least that.`;
    case "invest-payback":
      return `Compare ${ans("payback")} with \`_max_years\` (${g("_max_years")}): the cost must be earned back in at most that many years.`;
    case "pricing": {
      const [a, b] = (rows.steps.get("_diff") || "").match(LABEL_TOKEN) || [];
      const isCost = kind === "make-buy" || kind === "suppliers";
      return isCost
        ? `Revenue is the same either way, so compare the totals \`${a}\` and \`${b}\`: the lower cost gives the higher profit. If the two totals are equal, the options tie.`
        : `Fixed costs cancel out, so compare \`${a}\` and \`${b}\`: the higher contribution is the better option. If the two totals are equal, the options tie.`;
    }
    case "reorder-now":
      return `Compare \`_on_hand\` (${g("_on_hand")}) with ${ans("rop")}: it orders as soon as stock is at or below that level.`;
    case "batch-size":
      return `Compare ${ans("holding")} with ${ans("ordering")}, then apply the rule in the scenario: the direction depends on which of the two is higher.`;
    case "eoq-keep":
      return `Compare \`_gap\` with the 10% line in the rule: is \`_current\` (${g("_current")}) within 10% of the EOQ?`;
    case "eoq-switch":
      return `Compare \`_saving\` with \`_min_saving\` (${money(g("_min_saving"))}): it switches only if the saving is at least that.`;
    case "hire":
      if (kind === "hire-cost") {
        return `Compare \`_extra_profit\` (${money(g("_extra_profit"))}) with ${ans("cost")}: the extra profit must be at least the full monthly cost.`;
      }
      if (kind === "hire-net") return `Look at the sign of ${ans("net")}: the owner needs a gain above zero.`;
      return `Compare ${ans("months")} with \`_max_months\` (${g("_max_months")}): the up-front cost must be paid back within that many months.`;
    default:
      return "";
  }
}

function withHints(q) {
  const p = q && q.params;
  if (!p) return q;
  const rows = readRows(q.explanation);
  const intro = String(q.explanation || "").split("\n\n")[0].trim();

  if (q.answerType !== "multi") {
    const sentences = [...rows.steps.keys()].map((l) => stepSentence(l, rows));
    let compare = "";
    if (p.mode === "which") {
      const isCost = p.kind === "make-buy" || p.kind === "suppliers";
      const [a, b] = [...rows.steps.keys()].slice(-2);
      compare = isCost
        ? `Revenue is the same either way, so compare \`${a}\` and \`${b}\`: the lower total cost gives the higher profit. Equal totals mean neither option wins.`
        : `Fixed costs cancel out, so compare \`${a}\` and \`${b}\`: the higher contribution gives the higher profit. Equal totals mean neither option wins.`;
    }
    const grouped = groupSteps(sentences, compare ? 2 : 3);
    if (q.answerType === "number" && q.tolerance > 0 && grouped.length) grouped[grouped.length - 1] += " Round the result to 2 decimal places.";
    const hints = [intro, ...grouped, ...(compare ? [compare] : [])].filter(Boolean);
    return hints.length ? { ...q, hints } : q;
  }

  // Multi-part: the shared idea as a question hint, then each part's own formulas or comparison.
  const done = new Set();
  const labelOf = {};
  const parts = q.parts.map((part) => {
    const ans = (id) => (labelOf[id] ? `your *${labelOf[id].label}* answer (\`${labelOf[id].row}\`)` : "the value above");
    // "`_units` is your *Break-even units* answer." for earlier answers these steps build on.
    const notes = (ls) =>
      Object.values(labelOf)
        .filter((x) => ls.some((l) => (rows.steps.get(l).match(LABEL_TOKEN) || []).includes(x.row)))
        .map((x) => `\`${x.row}\` is your *${x.label}* answer.`);
    let hint;
    if (part.answerType === "choice") {
      const spec = (p.parts || []).find((s) => s.id === part.id) || {};
      const ls = [...rows.steps.keys()].filter((l) => !done.has(l));
      hint = [...ls.map((l) => stepSentence(l, rows)), ...notes(ls), recSentence(spec.rec, q, rows, ans)].filter(Boolean).join(" ");
    } else {
      const target = partTarget(part.id, rows);
      const ls = target ? stepsFor(target, rows, done) : [];
      hint = [...ls.map((l) => stepSentence(l, rows)), ...notes(ls)].join(" ");
      if (part.tolerance > 0) hint += " Round to 2 decimal places.";
      ls.forEach((l) => done.add(l));
      if (target) {
        done.add(target);
        labelOf[part.id] = { label: part.label, row: target };
      }
    }
    return hint ? { ...part, hint } : part;
  });
  return { ...q, ...(intro ? { hints: [intro] } : {}), parts };
}

export function generate({ subtopic, difficulty, rng }) {
  return withHints(withGiven(generateRaw(subtopic, difficulty, rng)));
}

// ---------------------------------------------------------------------------------------------
// Independent check. Break-even units are checked by plugging them back in (enough units cover
// the costs, one fewer does not), in whole cents. Other answers are substituted back into the
// defining relation and the residual is compared with 0.005 × (how strongly it reacts to the
// answer). NPV is rebuilt by discounting backwards year by year. Option questions recompute
// both profits from revenue and total cost.
//
// Multi-part questions: `answer` is { [partId]: value }. Every number part goes through the same
// checks as a single question, and every Recommendation is recomputed from the scenario values
// (never from the submitted calculation), with a guard band around its threshold.
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false; // regenerate from the seed to get params back
  const k = p.values;

  if (question.answerType === "multi" || p.multi) return verifyMulti(question, answer);

  if (p.fmt === "choice") {
    const labels = LABELS[p.kind];
    const ch = question.choices;
    if (!labels || !Array.isArray(ch) || ch.length !== 3 || new Set(ch).size !== 3) return false;
    if (!ch.includes(labels[0]) || !ch.includes(labels[1]) || !ch.includes(SAME)) return false;
    const g = optionProfitsC(p.kind, k);
    if (!g || !g.every(Number.isFinite)) return false;
    const expected = g[0] > g[1] ? labels[0] : g[1] > g[0] ? labels[1] : SAME;
    return String(answer) === expected;
  }

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (p.fmt === "2dp" && !wellPosed2dp(p.kind, k, question.answer)) return false;
  return verifyValue(p.kind, p.fmt, k, answer);
}

// A 2-decimal question is only well posed when exactly one 2-decimal answer passes: if the exact
// value sits on a half cent, both neighbours would, so reject it (the engine regenerates).
function wellPosed2dp(kind, k, own) {
  const a = Number(own);
  if (!Number.isFinite(a)) return false;
  for (const d of [-0.01, 0.01]) {
    if (verifyValue(kind, "2dp", k, Math.round((a + d) * 100) / 100)) return false;
  }
  return true;
}

function verifyMulti(question, answer) {
  const p = question.params;
  const k = p.values;
  const parts = question.parts;
  const specs = p.parts;
  if (question.answerType !== "multi" || !p.multi || !Array.isArray(parts) || !Array.isArray(specs)) return false;
  if (parts.length < 2 || parts.length > 4 || parts.length !== specs.length) return false;
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
  if (Object.keys(answer).length !== parts.length) return false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const spec = specs[i];
    if (!part || !spec || part.id !== spec.id || !Object.prototype.hasOwnProperty.call(answer, spec.id)) return false;
    const value = answer[spec.id];
    if (spec.rec) {
      if (part.answerType !== "choice" || !recOk(spec.rec, p.kind, k, part.choices, value)) return false;
    } else {
      if (part.answerType !== "number" || !verifyValue(spec.kind, spec.fmt, k, value)) return false;
      if (spec.fmt === "2dp" && !wellPosed2dp(spec.kind, k, part.answer)) return false;
    }
  }
  return true;
}

// The one right Recommendation, recomputed from the values; null inside a guard band where
// rounding could blur the rule (the generator never produces those).
function recExpected(rec, kind, k) {
  switch (rec) {
    case "pricing": {
      const g = optionProfitsC(kind, k);
      if (!g || !g.every(Number.isFinite)) return null;
      const labels = LABELS[kind];
      return g[0] > g[1] ? labels[0] : g[1] > g[0] ? labels[1] : SAME;
    }
    case "demand-units": {
      // Expected demand D covers the need iff D × margin ≥ fixed (+ target), in whole cents.
      let marginC, needC;
      if (kind === "price-change") {
        marginC = Math.round((toC(k.P) * (100 + k.u)) / 100) - toC(k.C);
        needC = toC(k.F);
      } else {
        const costC = k.costs ? k.costs.reduce((s, c) => s + toC(c), 0) : toC(k.C);
        marginC = toC(k.P) - costC;
        needC = toC(k.F) + (kind === "target-units" ? toC(k.T) : 0);
      }
      if (!(marginC > 0 && needC > 0 && Number.isInteger(k.D) && k.D > 0)) return null;
      return k.D * marginC >= needC ? YES : NO;
    }
    case "demand-revenue": {
      // Sales S break even iff S × r% ≥ F.
      if (!(k.S > 0 && k.r > 0)) return null;
      const diff = k.S * k.r - 100 * k.F;
      if (Math.abs(diff) < 1e-6 * k.r) return YES;
      return diff > 0 ? YES : NO;
    }
    case "invest-npv": {
      const f = 1 + k.r / 100;
      if (!(f > 0) || !Array.isArray(k.flows)) return null;
      let v = 0;
      for (let i = k.flows.length - 1; i >= 0; i--) v = (v + k.flows[i]) / f;
      const npv = v - k.cost;
      if (Math.abs(npv) < 0.5) return null;
      return npv > 0 ? INVEST : PASS;
    }
    case "invest-roi": {
      const cost = k.costs.reduce((s, c) => s + c, 0);
      if (!(cost > 0) || !Number.isFinite(k.hurdle)) return null;
      const gainPct = ((k.yearly * k.years + k.resale - cost) * 100) / cost;
      if (Math.abs(gainPct - k.hurdle) < 0.5) return null;
      return gainPct >= k.hurdle ? INVEST : PASS;
    }
    case "invest-payback": {
      const net = (k.monthly ? k.inflow * 12 : k.inflow) - k.upkeep;
      if (!(net > 0) || !Number.isFinite(k.maxYears)) return null;
      // payback ≤ limit ⇔ cost ≤ limit × net
      const slack = k.maxYears * net - k.cost;
      if (Math.abs(slack) < 0.05 * net) return null;
      return slack > 0 ? INVEST : PASS;
    }
    case "health": {
      let ltv, cac;
      if (kind === "ltv-cac") {
        ltv = k.Y !== undefined ? k.Y * k.y : k.X * k.k * k.y;
        cac = k.CAC;
      } else {
        if (!(k.c > 0)) return null;
        ltv = (k.fee * k.g) / k.c;
        cac = k.CAC;
      }
      if (!(cac > 0) || !Number.isFinite(ltv)) return null;
      const ratio = ltv / cac;
      const gap = ratio - HEALTHY_MIN;
      if (Math.abs(gap) <= 1e-9) return HEALTHY; // exactly the threshold: "at least" includes it
      if (Math.abs(gap) < 0.02) return null;
      return gap > 0 ? HEALTHY : UNHEALTHY;
    }
    case "reorder-now": {
      if (!(k.W > 0 && Number.isInteger(k.onHand))) return null;
      return k.onHand <= ropOf(k) ? YES : NO;
    }
    case "batch-size": {
      if (!(k.Q > 0)) return null;
      const order = (k.D * k.S) / k.Q;
      const hold = (k.Q * k.H) / 2;
      if (Math.abs(order - hold) < 0.05 * Math.max(order, hold)) return null;
      return hold > order ? SMALLER : LARGER;
    }
    case "eoq-keep": {
      if (!(k.H > 0 && k.N > 0)) return null;
      const gap = Math.abs(k.N / Math.sqrt((2 * k.D * k.S) / k.H) - 1);
      if (Math.abs(gap - 0.1) < 0.02) return null;
      return gap <= 0.1 ? KEEP : SWITCH;
    }
    case "eoq-switch": {
      if (!(k.H > 0 && k.N > 0 && k.T > 0)) return null;
      const save = invCost(k, k.N) - invCost(k, eoqOf(k));
      if (Math.abs(save - k.T) < 1) return null;
      return save >= k.T ? SWITCH : KEEP;
    }
    case "hire": {
      // Rebuilt in whole cents where possible: cost × 1200 = salary × (100 + overhead).
      const cost = hireCostOf(k);
      if (!(cost > 0)) return null;
      if (kind === "hire-cost") {
        if (Math.abs(k.G - cost) < 0.01 * cost) return null;
        return k.G >= cost ? HIRE : NO_HIRE;
      }
      const net = (k.R * k.g) / 100 - cost;
      if (kind === "hire-net") {
        if (Math.abs(net) < 0.5) return null;
        return net > 0 ? HIRE : NO_HIRE;
      }
      if (kind === "hire-payback") {
        if (!(net > 0 && k.T > 0)) return null;
        const x = k.F / net;
        if (Math.abs(x - k.T) < 0.1) return null;
        return x <= k.T ? HIRE : NO_HIRE;
      }
      return null;
    }
    default:
      return null;
  }
}

function recOk(rec, kind, k, choices, value) {
  const want =
    NEW_REC_CHOICES[rec] ? NEW_REC_CHOICES[rec]
    : rec === "pricing" ? (LABELS[kind] ? [...LABELS[kind], SAME] : null)
      : rec === "health" ? REC_CHOICES.health
        : rec.startsWith("invest-") ? REC_CHOICES.invest
          : REC_CHOICES.demand;
  if (!want || !Array.isArray(choices) || choices.length !== want.length) return false;
  if (new Set(choices).size !== want.length || !want.every((c) => choices.includes(c))) return false;
  const expected = recExpected(rec, kind, k);
  return expected !== null && String(value) === expected;
}

// Checks one numeric answer for a question kind (shared by single questions and multi parts).
function verifyValue(kind, fmt, k, answer) {
  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;

  // Smallest whole number of units whose margin covers `needC`: x covers it, x - 1 does not.
  const coversExactly = (marginC, needC) =>
    marginC > 0 && needC > 0 && Number.isInteger(x) && x * marginC >= needC && (x - 1) * marginC < needC;

  let residual, sens;
  switch (kind) {
    case "units": {
      const costC = k.costs ? k.costs.reduce((s, c) => s + toC(c), 0) : toC(k.C);
      return coversExactly(toC(k.P) - costC, toC(k.F));
    }
    case "target-units": {
      const costC = k.costs.reduce((s, c) => s + toC(c), 0);
      return coversExactly(toC(k.P) - costC, toC(k.F) + toC(k.T));
    }
    case "price-change": {
      const newPriceC = Math.round((toC(k.P) * (100 + k.u)) / 100);
      return coversExactly(newPriceC - toC(k.C), toC(k.F));
    }
    case "revenue": {
      // x must be a whole number of units times the price, and those units must just break even.
      const P = toC(k.P);
      if (!(P > 0)) return false;
      const units = Math.round((x * 100) / P);
      if (Math.abs(x * 100 - units * P) > 0.5 + 1e-6) return false;
      const mC = P - toC(k.C);
      return mC > 0 && units * mC >= toC(k.F) && (units - 1) * mC < toC(k.F);
    }
    case "revenue-ratio": // x × r% = F
      residual = x * k.r - 100 * k.F;
      sens = k.r;
      break;
    case "target-revenue": {
      // contribution earned on revenue x is x × margin / price; it must cover fixed + target
      const P = toC(k.P);
      const mC = P - toC(k.C);
      if (!(P > 0 && mC > 0)) return false;
      residual = x * mC - (k.F + k.T) * P;
      sens = mC;
      break;
    }
    case "cm-ratio": {
      // price × (1 - x/100) = variable cost
      const C = k.costs.reduce((s, c) => s + c, 0);
      if (!(k.P > 0)) return false;
      residual = k.P * (100 - x) - 100 * C;
      sens = k.P;
      break;
    }
    case "ltv":
      if (!(k.k > 0 && k.y > 0)) return false;
      if (k.g === undefined) {
        residual = x / (k.k * k.y) - k.X; // back to profit per order
        sens = 1 / (k.k * k.y);
      } else {
        residual = (x * 100) / (k.k * k.y) - k.A * k.g; // back to margin on one order
        sens = 100 / (k.k * k.y);
      }
      break;
    case "ltv-total": // LTV part of an LTV:CAC multi-part question, rebuilt from its inputs
      residual = x - (k.Y !== undefined ? k.Y * k.y : k.X * k.k * k.y);
      sens = 1;
      break;
    case "ltv-cac": {
      const ltv = k.Y !== undefined ? k.Y * k.y : k.X * k.k * k.y;
      if (!(k.CAC > 0)) return false;
      residual = x * k.CAC - ltv;
      sens = k.CAC;
      break;
    }
    case "churn-ltv": // LTV × churn = monthly fee × margin
      if (!(k.c > 0)) return false;
      residual = x * k.c - k.fee * k.g;
      sens = k.c;
      break;
    case "churn-ratio":
      if (!(k.c > 0 && k.CAC > 0)) return false;
      residual = x * k.CAC * k.c - k.fee * k.g;
      sens = k.CAC * k.c;
      break;
    case "max-cac":
      if (!(k.c > 0 && k.t > 0)) return false;
      residual = x * k.t * k.c - k.fee * k.g;
      sens = k.t * k.c;
      break;
    case "roi": {
      // total cost × (1 + x/100) = total return
      const cost = k.costs.reduce((s, c) => s + c, 0);
      if (!(cost > 0)) return false;
      residual = cost * (100 + x) - 100 * (k.yearly * k.years + k.resale);
      sens = cost;
      break;
    }
    case "payback": {
      // x years of net inflow repay the cost
      const net = (k.monthly ? k.inflow * 12 : k.inflow) - k.upkeep;
      if (!(net > 0)) return false;
      residual = x * net - k.cost;
      sens = net;
      break;
    }
    case "npv": {
      // Horner: ((cf3 / f + cf2) / f + cf1) / f - cost
      const f = 1 + k.r / 100;
      if (!(f > 0) || !Array.isArray(k.flows)) return false;
      let v = 0;
      for (let i = k.flows.length - 1; i >= 0; i--) v = (v + k.flows[i]) / f;
      residual = x - (v - k.cost);
      sens = 1;
      break;
    }
    case "reorder-point": {
      // x - safety stock is the smallest whole number covering demand over lead + safety days
      if (!(k.W > 0) || !Number.isInteger(x)) return false;
      const need = k.A * (k.L + k.sd);
      const q = x - k.ss;
      return q >= 0 && q * k.W >= need && (q - 1) * k.W < need;
    }
    case "order-cost": // ordering cost × order size = demand × cost per order
      residual = x * k.Q - k.D * k.S;
      sens = k.Q;
      break;
    case "hold-cost": // holding cost × 2 = order size × holding cost per unit
      residual = x * 2 - k.Q * k.H;
      sens = 2;
      break;
    case "inv-costs":
      if (!(k.Q > 0)) return false;
      residual = x * k.Q - (k.D * k.S + (k.Q * k.Q * k.H) / 2);
      sens = k.Q;
      break;
    case "eoq": {
      // nearest whole unit: (x - 0.5)^2 < 2DS/H < (x + 0.5)^2
      if (!(k.H > 0) || !Number.isInteger(x) || x < 1) return false;
      const v = (2 * k.D * k.S) / k.H;
      return (x - 0.5) * (x - 0.5) < v && v < (x + 0.5) * (x + 0.5);
    }
    case "eoq-cost": {
      // cost at the rounded EOQ, with the EOQ found by search rather than sqrt
      if (!(k.H > 0 && k.D > 0 && k.S > 0)) return false;
      const v = (2 * k.D * k.S) / k.H;
      let Q = 1;
      while ((Q + 0.5) * (Q + 0.5) < v) Q++;
      residual = x * Q - (k.D * k.S + (Q * Q * k.H) / 2);
      sens = Q;
      break;
    }
    case "hire-cost": // monthly cost × 1200 = salary × (100 + overhead %)
      residual = x * 1200 - k.salary * (100 + k.o);
      sens = 1200;
      break;
    case "hire-net": // (net + cost) × 100 = sales × margin
      residual = (x + (k.salary * (100 + k.o)) / 1200) * 100 - k.R * k.g;
      sens = 100;
      break;
    case "hire-payback": {
      // whole months: x months of net gain cover the up-front cost, x - 1 do not
      const net = (k.R * k.g) / 100 - (k.salary * (100 + k.o)) / 1200;
      if (!(net > 0) || !Number.isInteger(x)) return false;
      return x * net >= k.F && (x - 1) * net < k.F;
    }
    case "price-ab":
    case "price-raise":
    case "make-buy":
    case "suppliers": {
      const g = optionProfitsC(kind, k);
      if (!g || !g.every(Number.isFinite)) return false;
      residual = x * 100 - Math.abs(g[0] - g[1]);
      sens = 100;
      break;
    }
    default:
      return false;
  }
  if (!Number.isFinite(residual)) return false;
  if (fmt === "2dp") return Math.abs(residual) <= 0.005 * sens + 1e-6;
  return Number.isInteger(x) && Math.abs(residual) <= 1e-6 * Math.max(1, sens);
}
