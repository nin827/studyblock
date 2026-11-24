// Finance generator: depreciation, loans, and annuities/savings.
// Uses only the seeded rng passed in by the engine.
// params.fmt says how the answer is given:
//   "int" whole number, tolerance 0 (easy money answers, whole years)
//   "2dp" rounded to 2 decimals, tolerance 0.005
// Conventions (stated in every prompt that needs them): payments and deposits are made at the end of
// each period (ordinary annuity); a monthly rate is the annual rate ÷ 12; a loan's monthly payment is
// rounded to the cent before it is used for total interest or a remaining balance.
// Explanations list every step as a labelled calculator row, e.g. `_i = _rate / 100 / 12` → 0.004167.
// Business Math already covers simple and compound interest on a single sum, so it is not repeated here.

// Round half away from zero; the 1e-9 nudge absorbs binary error.
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Answer/choice formatter: whole numbers as-is, rounded answers with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

// Intermediate values: shortest form (up to `dp` decimals); never "-0".
function num(n, dp = 4) {
  const f = Math.pow(10, dp);
  const r = Math.round(n * f) / f;
  return String(Object.is(r, -0) ? 0 : r);
}

// Money inside calculator rows: "3300" for whole dollars, "4.50" otherwise.
function mv(n) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// Dollar amounts in prompts: "$240", "$12.50".
function cash(n) {
  const s = mv(Math.abs(n));
  return round2(n) < 0 ? `-$${s}` : `$${s}`;
}

const years = (t) => (t === 1 ? "1 year" : `${t} years`);
const DP2 = " Round to 2 decimal places.";
const WHOLE = " The answer is a whole number of dollars.";
const PCT_NOTE = " Answer as a percent, without the % sign.";
const toC = (d) => Math.round(d * 100); // dollars -> whole cents

// True when x is clearly away from a half cent, so exactly one 2-decimal answer is right.
function tieFree(x) {
  const c = Math.abs(x) * 100;
  const f = c - Math.floor(c);
  return Math.abs(f - 0.5) > 0.002;
}

// Calculator rows for the explanation (rendered as a markdown list).
const given = (label, v) => `- \`${label} = ${v}\``;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;

function dress(s, unit) {
  if (unit === "money") return `$${s}`;
  if (unit === "pct") return `${s}%`;
  return unit ? `${s} ${unit}` : s;
}

// The value shown on the last row: "**$1234**" or "1234.5678, which rounds to **$1234.57**".
function final(exact, fmt, unit) {
  const shown = fmtAns(exact, fmt === "2dp");
  if (fmt !== "2dp" || Math.abs(exact - Number(shown)) < 1e-9) return `**${dress(shown, unit)}**`;
  return `${num(exact)}, which rounds to **${dress(shown, unit)}**`;
}

const explain = (intro, lines) => `${intro}\n\n${lines.join("\n")}`;

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors; positive answers get no negative options.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    // A distractor a cent or two from the answer reads as a rounding trap, not a mistake.
    if (rounded && Math.abs(v - correct) < 0.05) return;
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
// Scenario data (generic only).

const ASSETS = [
  { biz: "A bakery", asset: "a deck oven" },
  { biz: "A print shop", asset: "a wide-format printer" },
  { biz: "A courier firm", asset: "a delivery van" },
  { biz: "A café", asset: "an espresso machine" },
  { biz: "A gym", asset: "a set of rowing machines" },
  { biz: "A dental clinic", asset: "an X-ray unit" },
  { biz: "A small farm", asset: "a compact tractor" },
  { biz: "A design studio", asset: "a batch of workstations" },
];

const PURPOSES = [
  "buy a car",
  "renovate a kitchen",
  "fit out a new shop",
  "consolidate debts",
  "buy equipment for a food truck",
  "pay for a home extension",
];

const BIG_PURPOSES = ["buy a home", "buy a small warehouse", "buy a shop building", "refinance a mortgage"];

const SAVERS = ["A saver", "A young worker", "A freelancer", "A small-business owner", "A parent", "A nurse"];

// ---------------------------------------------------------------------------------------------
// Depreciation

function genDepreciation(difficulty, rng) {
  checkDifficulty(difficulty);
  const a = rng.pick(ASSETS);
  const kind = rng.pick(
    difficulty === "easy"
      ? ["sl-charge", "sl-book"]
      : difficulty === "medium"
        ? ["sl-charge", "sl-book", "rb-book"]
        : ["rb-book", "rb-rate", "rb-charge"]
  );
  const easy = difficulty === "easy";
  let prompt, exact, fmt, unit, lines, intro, candidates, values;

  if (kind === "sl-charge" || kind === "sl-book") {
    let C, S, n, k;
    for (let t = 0; t < 50; t++) {
      n = rng.int(easy ? 3 : 3, easy ? 10 : 12);
      k = rng.int(1, n - 1);
      if (easy) {
        const A = 100 * rng.int(3, 60);
        S = 100 * rng.int(0, 30);
        C = S + A * n;
      } else {
        C = rng.int(300000, 6000000) / 100;
        S = rng.next() < 0.2 ? 0 : toC((C * rng.int(5, 25)) / 100) / 100;
      }
      const charge = (C - S) / n;
      exact = kind === "sl-charge" ? charge : C - k * charge;
      if (easy || tieFree(exact)) break;
    }
    const charge = (C - S) / n;
    fmt = easy ? "int" : "2dp";
    unit = "money";
    values = kind === "sl-charge" ? { C, S, n } : { C, S, n, k };
    const sale = S > 0 ? `and then sell it for ${cash(S)} (its salvage value)` : "and then scrap it for nothing (a salvage value of $0)";
    prompt = `${a.biz} buys ${a.asset} for ${cash(C)}. It expects to use it for ${years(n)} ${sale}, and uses straight-line depreciation.`;
    intro = "Straight-line depreciation spreads the cost minus the salvage value evenly over the useful life.";
    lines = [given("_cost", mv(C)), given("_salvage", mv(S)), given("_life", n)];
    if (kind === "sl-charge") {
      prompt += ` What is the yearly depreciation charge, in dollars?${easy ? WHOLE : DP2}`;
      lines.push(step("_charge", "(_cost - _salvage) / _life", final(exact, fmt, unit)));
      candidates = [C / n, (C + S) / n, C - S]; // ignored salvage, added salvage, forgot to divide
    } else {
      prompt += ` What is its book value after ${years(k)}, in dollars?${easy ? WHOLE : DP2}`;
      lines.push(
        given("_used", k),
        step("_charge", "(_cost - _salvage) / _life", easy ? mv(charge) : num(charge)),
        step("_book", "_cost - _charge * _used", final(exact, fmt, unit))
      );
      candidates = [C - charge, C - (k * C) / n, k * charge]; // one year only, ignored salvage, depreciation not book value
    }
  } else if (kind === "rb-book" || kind === "rb-charge") {
    let C, r, k;
    for (let t = 0; t < 50; t++) {
      if (difficulty === "medium") {
        C = 500 * rng.int(4, 100);
        r = rng.pick([10, 15, 20, 25, 30, 40]);
        k = rng.int(2, 5);
      } else {
        C = rng.int(500000, 8000000) / 100;
        r = rng.int(8, 45);
        k = rng.int(kind === "rb-charge" ? 2 : 3, kind === "rb-charge" ? 6 : 8);
      }
      const f = 1 - r / 100;
      exact = kind === "rb-book" ? C * Math.pow(f, k) : C * Math.pow(f, k - 1) * (r / 100);
      if (tieFree(exact)) break;
    }
    const f = 1 - r / 100;
    fmt = "2dp";
    unit = "money";
    values = { C, r, k };
    prompt =
      `${a.biz} buys ${a.asset} for ${cash(C)} and depreciates it by the reducing-balance method at ${r}% a year: ` +
      `each year's charge is ${r}% of the book value at the start of that year.`;
    lines = [given("_cost", mv(C)), given("_rate", num(r / 100))];
    if (kind === "rb-book") {
      prompt += ` What is its book value after ${years(k)}, in dollars?${DP2}`;
      intro = "Each year the book value is multiplied by (1 - rate), so after n years it is cost × (1 - rate)^n.";
      lines.push(given("_years", k), step("_book", "_cost * (1 - _rate)^_years", final(exact, fmt, unit)));
      candidates = [C * (1 - (r * k) / 100), C * Math.pow(f, k - 1), C - exact]; // straight-line on cost, a year short, depreciation not book value
    } else {
      prompt += ` How much depreciation is charged in year ${k}, in dollars?${DP2}`;
      intro = `The charge for year ${k} is the rate times the book value at the start of year ${k}, which is cost × (1 - rate)^${k - 1}.`;
      lines.push(
        given("_year", k),
        step("_start_book", "_cost * (1 - _rate)^(_year - 1)", num(C * Math.pow(f, k - 1))),
        step("_charge", "_start_book * _rate", final(exact, fmt, unit))
      );
      candidates = [(C * r) / 100, C * Math.pow(f, k) * (r / 100), C * Math.pow(f, k - 1)]; // first year's charge, a year late, book value not charge
    }
  } else {
    // rb-rate (hard): find the reducing-balance rate from the cost and a later book value.
    let C, BV, k;
    for (let t = 0; t < 50; t++) {
      C = 100 * rng.int(50, 800);
      const r0 = rng.int(80, 400) / 10;
      k = rng.int(2, 6);
      BV = round2(C * Math.pow(1 - r0 / 100, k));
      exact = (1 - Math.pow(BV / C, 1 / k)) * 100;
      if (tieFree(exact)) break;
    }
    fmt = "2dp";
    unit = "pct";
    values = { C, BV, k };
    prompt =
      `${a.biz} bought ${a.asset} for ${cash(C)} and depreciates it by the reducing-balance method, taking the same percentage ` +
      `of the remaining book value each year. After ${years(k)} its book value is ${cash(BV)}. What yearly rate is it using?${PCT_NOTE}${DP2}`;
    intro = "Book value = cost × (1 - rate)^years, so rate = 1 - (book value ÷ cost)^(1 / years).";
    lines = [
      given("_cost", mv(C)),
      given("_book", mv(BV)),
      given("_years", k),
      step("_keep", "(_book / _cost)^(1 / _years)", num(Math.pow(BV / C, 1 / k), 6)),
      step("_rate", "(1 - _keep) * 100", final(exact, fmt, unit)),
    ];
    candidates = [((1 - BV / C) * 100) / k, Math.pow(BV / C, 1 / k) * 100, (1 - BV / C) * 100]; // straight-line average, forgot 1 -, total fall
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Loans (amortising, monthly payments at the end of each month)

const LOAN_RULE =
  " Payments are made at the end of each month. Use the monthly rate i = annual rate ÷ 12, n = the number of monthly payments, " +
  "and payment = loan × i ÷ (1 - (1 + i)^-n).";

function payment(P, i, n) {
  return (P * i) / (1 - Math.pow(1 + i, -n));
}

function genLoans(difficulty, rng) {
  checkDifficulty(difficulty);
  const kind = rng.pick(
    difficulty === "easy"
      ? ["payment", "interest-given"]
      : difficulty === "medium"
        ? ["payment", "total-interest"]
        : ["balance", "balance", "total-interest"]
  );

  let P, rate, yrs, n, i, M, Mr, k, exact;
  for (let t = 0; t < 50; t++) {
    if (difficulty === "easy") {
      P = 1000 * rng.int(2, 30);
      rate = rng.int(3, 12);
      yrs = rng.int(1, 5);
    } else if (difficulty === "medium") {
      P = 500 * rng.int(10, 600);
      rate = 0.25 * rng.int(8, 36);
      yrs = rng.pick([3, 4, 5, 7, 10, 15, 20, 25, 30]);
    } else {
      P = 1000 * rng.int(20, 600);
      rate = rng.int(250, 950) / 100;
      yrs = rng.pick([5, 10, 15, 20, 25, 30]);
    }
    n = 12 * yrs;
    i = rate / 1200;
    M = payment(P, i, n);
    Mr = round2(M);
    k = rng.int(6, n - 6);
    if (kind === "payment") exact = M;
    else if (kind === "balance") exact = P * Math.pow(1 + i, k) - (Mr * (Math.pow(1 + i, k) - 1)) / i;
    else exact = (toC(Mr) * n - toC(P)) / 100;
    if (tieFree(M) && tieFree(exact) && exact > 0) break;
  }
  // Drawn after the numbers so it can match the size of the loan.
  const purpose = rng.pick(P >= 100000 ? BIG_PURPOSES : PURPOSES);
  const fmt = "2dp";
  const unit = "money";
  const values = { P, rate, yrs };
  const months = `${n} monthly payments`;
  let prompt = `A borrower takes out a ${cash(P)} loan to ${purpose} at ${num(rate)}% a year, repaid over ${years(yrs)} (${months}).`;
  let intro, candidates;
  const lines = [given("_loan", mv(P)), given("_rate", num(rate)), given("_years", yrs)];
  const rateRows = [step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", n)];

  if (kind === "payment") {
    prompt += `${LOAN_RULE} What is the monthly payment, in dollars?${DP2}`;
    intro = "Convert the annual rate to a monthly one and the term to months, then apply the payment formula.";
    lines.push(...rateRows, step("_payment", "_loan * _i / (1 - (1 + _i)^(-_n))", final(exact, fmt, unit)));
    candidates = [
      payment(P, rate / 100, n), // forgot ÷ 12
      (P + (P * rate * yrs) / 100) / n, // simple interest spread over the months
      payment(P, i, yrs), // years used as the number of payments
    ];
  } else if (kind === "interest-given") {
    values.M = Mr;
    prompt =
      `A borrower takes out a ${cash(P)} loan to ${purpose} at ${num(rate)}% a year, and repays it with ${months} of ${cash(Mr)}. ` +
      `How much interest is paid over the life of the loan (all payments minus the amount borrowed), in dollars?${DP2}`;
    intro = "Total interest = what you pay back in total minus what you borrowed.";
    lines.splice(1, 2, given("_payment", mv(Mr)), given("_n", n));
    lines.push(step("_paid", "_payment * _n", mv(Mr * n)), step("_interest", "_paid - _loan", final(exact, fmt, unit)));
    candidates = [Mr * n, (P * rate * yrs) / 100, exact / yrs]; // total paid, simple interest, per year
  } else if (kind === "total-interest") {
    prompt += `${LOAN_RULE} Round the payment to the cent, then find the total interest paid over the life of the loan, in dollars.${DP2}`;
    intro = "Find the monthly payment and round it to the cent. Total interest = payment × number of payments - loan.";
    lines.push(
      ...rateRows,
      step("_payment", "round(_loan * _i / (1 - (1 + _i)^(-_n)), 2)", mv(Mr)),
      step("_interest", "_payment * _n - _loan", final(exact, fmt, unit))
    );
    candidates = [
      payment(P, rate / 100, n) * n - P, // forgot ÷ 12
      (P * rate * yrs) / 100, // simple interest
      Mr * n, // total paid, not interest
    ];
  } else {
    values.k = k;
    prompt +=
      `${LOAN_RULE} Round the payment to the cent and use that rounded payment. How much is still owed right after payment number ${k}, in dollars?${DP2}`;
    intro =
      "The balance grows with interest and shrinks by each payment: balance = loan × (1 + i)^k - payment × ((1 + i)^k - 1) ÷ i.";
    lines.push(
      given("_k", k),
      ...rateRows,
      step("_payment", "round(_loan * _i / (1 - (1 + _i)^(-_n)), 2)", mv(Mr)),
      step("_balance", "_loan * (1 + _i)^_k - _payment * ((1 + _i)^_k - 1) / _i", final(exact, fmt, unit))
    );
    candidates = [
      P - k * Mr, // payments taken straight off the loan, ignoring interest
      P * (1 - k / n), // straight-line repayment
      Mr * (n - k), // the remaining payments added up
    ];
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Annuities and savings (deposits/withdrawals at the end of each period)

const fvFactor = (i, n) => (Math.pow(1 + i, n) - 1) / i;
const pvFactor = (i, n) => (1 - Math.pow(1 + i, -n)) / i;

function genAnnuities(difficulty, rng) {
  checkDifficulty(difficulty);
  const kind = rng.pick(
    difficulty === "hard" ? ["years-to-goal", "deposit-for-goal", "fv-lump"] : ["fv", "pv"]
  );
  const who = rng.pick(SAVERS);
  const fmt = kind === "years-to-goal" ? "int" : "2dp";
  let prompt, exact, unit, lines, intro, candidates, values;

  if (kind === "fv" || kind === "pv") {
    const monthly = difficulty === "medium";
    const m = monthly ? 12 : 1;
    let D, r, yrs, i, nP;
    for (let t = 0; t < 50; t++) {
      if (monthly) {
        D = kind === "fv" ? 25 * rng.int(2, 40) : 50 * rng.int(4, 60);
        r = 0.25 * rng.int(4, 32);
        yrs = rng.int(2, kind === "fv" ? 30 : 25);
      } else {
        D = 100 * rng.int(5, 60);
        r = rng.int(2, 8);
        yrs = rng.int(2, 6);
      }
      nP = m * yrs;
      i = r / 100 / m;
      exact = D * (kind === "fv" ? fvFactor(i, nP) : pvFactor(i, nP));
      if (tieFree(exact)) break;
    }
    unit = "money";
    values = { D, r, m, n: nP };
    const per = monthly ? "month" : "year";
    const comp = monthly ? "compounded monthly (monthly rate = annual rate ÷ 12)" : "compounded yearly";
    lines = [given(kind === "fv" ? "_deposit" : "_payout", mv(D)), given("_rate", num(r))];
    if (monthly) lines.push(given("_years", yrs), step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", nP));
    else lines.push(given("_n", nP), step("_i", "_rate / 100", num(i)));
    const wrongI = monthly ? r / 100 : null;
    if (kind === "fv") {
      prompt =
        `${who} deposits ${cash(D)} at the end of every ${per} into an account paying ${num(r)}% a year, ${comp}. ` +
        `How much is in the account right after the last deposit, ${years(yrs)} from now, in dollars?${DP2}`;
      intro = "Future value of regular deposits: FV = deposit × ((1 + i)^n - 1) ÷ i, with i the rate per period and n the number of deposits.";
      lines.push(step("_fv", "_deposit * ((1 + _i)^_n - 1) / _i", final(exact, fmt, unit)));
      candidates = [
        D * nP, // no interest
        exact * (1 + i), // deposits at the start of each period
        monthly ? D * fvFactor(wrongI, nP) : D * nP + D * i * ((nP * (nP - 1)) / 2), // forgot ÷ 12, or simple interest
      ];
    } else {
      prompt = monthly
        ? `${who} wants to withdraw ${cash(D)} at the end of every month for ${years(yrs)} from a fund earning ${num(r)}% a year, ${comp}. ` +
          `How much must be in the fund today so that the last withdrawal empties it, in dollars?${DP2}`
        : `A scholarship fund must pay ${cash(D)} at the end of each year for ${years(yrs)}. It earns ${num(r)}% a year, ${comp}. ` +
          `How much must be in the fund today so that the last payment empties it, in dollars?${DP2}`;
      intro = "Present value of an annuity: PV = payment × (1 - (1 + i)^-n) ÷ i, the sum of every payment discounted back to today.";
      lines.push(step("_pv", "_payout * (1 - (1 + _i)^(-_n)) / _i", final(exact, fmt, unit)));
      candidates = [
        D * nP, // no discounting
        exact * (1 + i), // payments at the start of each period
        monthly ? D * pvFactor(wrongI, nP) : (D * nP) / Math.pow(1 + i, nP), // forgot ÷ 12, or discounted everything from the end
      ];
    }
  } else if (kind === "years-to-goal") {
    // Hard: yearly deposits; smallest whole number of years whose balance reaches the goal.
    let D, r, G, N, i;
    for (let t = 0; t < 80; t++) {
      D = 100 * rng.int(10, 120);
      r = rng.int(20, 90) / 10;
      N = rng.int(4, 25);
      i = r / 100;
      const lo = D * fvFactor(i, N - 1);
      const hi = D * fvFactor(i, N);
      G = 100 * Math.round((lo + (rng.int(10, 90) / 100) * (hi - lo)) / 100);
      const gap = hi - lo;
      if (G - lo >= 0.05 * gap && hi - G >= 0.05 * gap) break;
    }
    exact = N;
    unit = "years";
    values = { D, r, G };
    prompt =
      `${who} deposits ${cash(D)} at the end of every year into an account paying ${num(r)}% a year, compounded yearly, ` +
      `and wants to reach ${cash(G)}. After how many years will the balance first reach the goal? Round up to a whole number of years.`;
    intro =
      "Set FV = deposit × ((1 + i)^n - 1) ÷ i equal to the goal and solve for n: n = ln(1 + goal × i ÷ deposit) ÷ ln(1 + i). Round up, since the goal is only reached at a year end.";
    const nExact = Math.log(1 + (G * i) / D) / Math.log(1 + i);
    lines = [
      given("_deposit", mv(D)),
      given("_rate", num(r)),
      given("_goal", mv(G)),
      step("_i", "_rate / 100", num(i)),
      step("_n_exact", "ln(1 + _goal * _i / _deposit) / ln(1 + _i)", num(nExact)),
      step("_years", "ceil(_n_exact)", final(exact, fmt, unit)),
    ];
    candidates = [Math.ceil(G / D), N - 1, N + 1]; // no interest, rounded down, one too many
  } else if (kind === "deposit-for-goal") {
    let G, r, yrs, i, nP;
    for (let t = 0; t < 50; t++) {
      G = 1000 * rng.int(5, 200);
      r = rng.int(10, 90) / 10;
      yrs = rng.int(3, 30);
      nP = 12 * yrs;
      i = r / 1200;
      exact = G / fvFactor(i, nP);
      if (tieFree(exact)) break;
    }
    unit = "money";
    values = { G, r, n: nP };
    prompt =
      `${who} wants ${cash(G)} in ${years(yrs)} and will save the same amount at the end of every month in an account paying ` +
      `${num(r)}% a year, compounded monthly (monthly rate = annual rate ÷ 12). How much must be deposited each month, in dollars?${DP2}`;
    intro = "Rearrange FV = deposit × ((1 + i)^n - 1) ÷ i: deposit = goal × i ÷ ((1 + i)^n - 1).";
    lines = [
      given("_goal", mv(G)),
      given("_rate", num(r)),
      given("_years", yrs),
      step("_i", "_rate / 100 / 12", num(i, 6)),
      step("_n", "_years * 12", nP),
      step("_deposit", "_goal * _i / ((1 + _i)^_n - 1)", final(exact, fmt, unit)),
    ];
    candidates = [
      G / nP, // no interest
      exact / (1 + i), // deposits at the start of each month
      G / fvFactor(r / 100, nP), // forgot ÷ 12
    ];
  } else {
    // fv-lump: a starting balance plus monthly deposits.
    let L, D, r, yrs, i, nP, g;
    for (let t = 0; t < 50; t++) {
      L = 100 * rng.int(10, 500);
      D = 25 * rng.int(2, 40);
      r = rng.int(10, 90) / 10;
      yrs = rng.int(2, 25);
      nP = 12 * yrs;
      i = r / 1200;
      g = Math.pow(1 + i, nP);
      exact = L * g + D * fvFactor(i, nP);
      if (tieFree(exact)) break;
    }
    unit = "money";
    values = { L, D, r, n: nP };
    prompt =
      `${who} opens a savings account with ${cash(L)} and adds ${cash(D)} at the end of every month. The account pays ${num(r)}% a year, ` +
      `compounded monthly (monthly rate = annual rate ÷ 12). How much is in it right after the last deposit, ${years(yrs)} from now, in dollars?${DP2}`;
    intro = "Grow the opening balance and the stream of deposits separately, then add them: L × (1 + i)^n + deposit × ((1 + i)^n - 1) ÷ i.";
    lines = [
      given("_start", mv(L)),
      given("_deposit", mv(D)),
      given("_rate", num(r)),
      given("_years", yrs),
      step("_i", "_rate / 100 / 12", num(i, 6)),
      step("_n", "_years * 12", nP),
      step("_lump", "_start * (1 + _i)^_n", num(L * g)),
      step("_stream", "_deposit * ((1 + _i)^_n - 1) / _i", num(D * fvFactor(i, nP))),
      step("_total", "_lump + _stream", final(exact, fmt, unit)),
    ];
    candidates = [
      L + D * fvFactor(i, nP), // opening balance left out of the growth
      L + D * nP, // no interest
      L * Math.pow(1 + r / 100, nP) + D * fvFactor(r / 100, nP), // forgot ÷ 12
    ];
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind, values, fmt } };
  return finish(base, exact, fmt, candidates, rng);
}

// Given values for the calculator: the explanation's given rows (`- \`_loan = 25000\``, no "→"),
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
  if (subtopic === "depreciation") return genDepreciation(difficulty, rng);
  if (subtopic === "loans") return genLoans(difficulty, rng);
  if (subtopic === "annuities-savings") return genAnnuities(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

export function generate({ subtopic, difficulty, rng }) {
  return withGiven(generateRaw(subtopic, difficulty, rng));
}

// ---------------------------------------------------------------------------------------------
// Independent check. Each answer is checked by a different route from the one that produced it:
// balances and annuities are rebuilt period by period in a loop (no closed forms), payments and
// rates are substituted back into their defining relation, and whole-number answers (years to a
// goal) must reach the target while one fewer must not. Residuals are compared with
// 0.005 × (how strongly they react to the answer). A 2-decimal question whose exact value sits on a
// half cent is rejected (both neighbours would pass), so the engine regenerates.

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false; // regenerate from the seed to get params back
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  if (p.fmt === "2dp" && !wellPosed2dp(p.kind, p.values, question.answer)) return false;
  return verifyValue(p.kind, p.fmt, p.values, answer);
}

function wellPosed2dp(kind, k, own) {
  const a = Number(own);
  if (!Number.isFinite(a)) return false;
  for (const d of [-0.01, 0.01]) {
    if (verifyValue(kind, "2dp", k, Math.round((a + d) * 100) / 100)) return false;
  }
  return true;
}

// Loop helpers (deliberately not the closed forms the generator uses).
function growDeposits(start, deposit, i, periods) {
  let b = start;
  for (let t = 0; t < periods; t++) b = b * (1 + i) + deposit;
  return b;
}
function discountSum(i, periods) {
  let v = 0;
  let d = 1;
  for (let t = 0; t < periods; t++) {
    d /= 1 + i;
    v += d;
  }
  return v;
}

function verifyValue(kind, fmt, k, answer) {
  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  let residual, sens;

  switch (kind) {
    case "sl-charge": // charge × life = cost - salvage
      if (!(k.n > 0)) return false;
      residual = x * k.n - (k.C - k.S);
      sens = k.n;
      break;
    case "sl-book": // (cost - book) × life = years used × (cost - salvage)
      if (!(k.n > 0)) return false;
      residual = (k.C - x) * k.n - k.k * (k.C - k.S);
      sens = k.n;
      break;
    case "rb-book":
    case "rb-charge": {
      let v = k.C;
      let charge = 0;
      for (let t = 0; t < k.k; t++) {
        charge = (v * k.r) / 100;
        v -= charge;
      }
      residual = x - (kind === "rb-book" ? v : charge);
      sens = 1;
      break;
    }
    case "rb-rate": {
      // cost × (1 - x)^years = book value
      const f = 1 - x / 100;
      if (!(f > 0 && k.C > 0 && k.k > 0)) return false;
      residual = k.C * Math.pow(f, k.k) - k.BV;
      sens = (k.C * k.k * Math.pow(f, k.k - 1)) / 100;
      break;
    }
    case "payment": {
      // payment × (sum of monthly discount factors) = loan
      const A = discountSum(k.rate / 1200, 12 * k.yrs);
      residual = x * A - k.P;
      sens = A;
      break;
    }
    case "interest-given":
      residual = x - (k.M * 12 * k.yrs - k.P);
      sens = 1;
      break;
    case "total-interest":
    case "balance": {
      const i = k.rate / 1200;
      const n = 12 * k.yrs;
      const M = k.P / discountSum(i, n);
      if (!tieFree(M)) return false;
      const Mr = round2(M);
      if (kind === "total-interest") {
        residual = x - (Mr * n - k.P);
      } else {
        let b = k.P;
        for (let t = 0; t < k.k; t++) b = b * (1 + i) - Mr;
        residual = x - b;
      }
      sens = 1;
      break;
    }
    case "fv":
      residual = x - growDeposits(0, k.D, k.r / 100 / k.m, k.n);
      sens = 1;
      break;
    case "pv":
      residual = x - k.D * discountSum(k.r / 100 / k.m, k.n);
      sens = 1;
      break;
    case "fv-lump":
      residual = x - growDeposits(k.L, k.D, k.r / 1200, k.n);
      sens = 1;
      break;
    case "deposit-for-goal": {
      const S = growDeposits(0, 1, k.r / 1200, k.n);
      residual = x * S - k.G;
      sens = S;
      break;
    }
    case "years-to-goal": {
      if (!Number.isInteger(x) || x < 1 || x > 200) return false;
      const i = k.r / 100;
      const before = growDeposits(0, k.D, i, x - 1);
      const after = before * (1 + i) + k.D;
      return after >= k.G && before < k.G;
    }
    default:
      return false;
  }
  if (!Number.isFinite(residual)) return false;
  if (fmt === "2dp") return Math.abs(residual) <= 0.005 * sens + 1e-6;
  return Number.isInteger(x) && Math.abs(residual) <= 1e-6 * Math.max(1, sens);
}
