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

// ---------------------------------------------------------------------------------------------
// Expert: multi-step, multi-part questions (easy/medium/hard above are untouched).
// Each template draws all of its rng values first, then builds text. Expert questions carry their
// own `given` and `hints` (built from values already drawn, never calling the rng), so they skip
// withGiven/withHints. Every 2-decimal part is checked to sit clearly away from a half cent.

const xNum = (id, label, ask, exact, fmt, hint) => ({
  id, label, ask, answerType: "number",
  answer: fmt === "2dp" ? round2(exact) : exact,
  tolerance: fmt === "2dp" ? 0.005 : 0,
  hint,
});
const xGiven = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const xQ = (kind, values, prompt, parts, intro, lines, given, hints) => ({
  prompt, answerType: "multi", parts, explanation: explain(intro, lines), given, hints, params: { kind, values, fmt: "multi" },
});
const KEEP = " Keep full precision between steps and round each answer to 2 decimal places.";

// depreciation / expert 0: straight-line book value at the date of sale, then the gain or loss.
function xDisposal(rng) {
  const a = rng.pick(ASSETS);
  let C, S, n, k, X, book;
  for (let t = 0; t < 60; t++) {
    C = 100 * rng.int(30, 900);
    S = 100 * rng.int(0, Math.floor(C / 400));
    n = rng.int(4, 12);
    k = rng.int(2, n - 1);
    book = C - (k * (C - S)) / n;
    X = 50 * Math.max(1, Math.round((book * rng.int(60, 140)) / 100 / 50));
    if (tieFree(book) && Math.abs(X - book) >= 1) break;
  }
  const charge = (C - S) / n;
  const gain = X - book;
  const prompt =
    `${a.biz} bought ${a.asset} for ${cash(C)}, expecting to use it for ${years(n)} and then sell it for ${cash(S)} (its salvage value). ` +
    `It uses straight-line depreciation. After ${years(k)} it sells the asset early, for ${cash(X)}.${KEEP}`;
  const lines = [
    given("_cost", mv(C)), given("_salvage", mv(S)), given("_life", n), given("_used", k), given("_sale", mv(X)),
    step("_charge", "(_cost - _salvage) / _life", num(charge)),
    step("_book", "_cost - _charge * _used", final(book, "2dp", "money")),
    step("_gain", "_sale - _book", `${final(gain, "2dp", "money")}${gain < 0 ? " (a loss)" : " (a gain)"}`),
  ];
  return xQ("x-disposal", { C, S, n, k, X }, prompt, [
    xNum("book", "Book value", "Book value on the day it is sold, in dollars", book, "2dp",
      "Book value = cost minus the depreciation charged so far: the yearly charge times the years used."),
    xNum("gain", "Gain or loss", "Gain on disposal = sale price − book value, in dollars (negative for a loss)", gain, "2dp",
      "Compare the sale price with the book value, not with the original cost or the salvage value."),
  ], "Find the book value on the day of the sale, then compare it with the sale price.", lines,
  xGiven([["_cost", C], ["_salvage", S], ["_life", n], ["_used", k], ["_sale", X]]), [
    "First the yearly straight-line charge: `_charge = (_cost - _salvage) / _life`.",
    "The book value after the years used is `_cost - _charge * _used`.",
    "Gain or loss = sale price − book value. A sale below book value is a loss, so the answer is negative.",
  ]);
}

// depreciation / expert 1: work backwards from a reducing-balance book value to the cost.
function xRbBackwards(rng) {
  const a = rng.pick(ASSETS);
  let r, k, BV, cost;
  for (let t = 0; t < 60; t++) {
    const C0 = rng.int(500000, 8000000) / 100;
    r = rng.int(8, 40);
    k = rng.int(2, 7);
    BV = round2(C0 * Math.pow(1 - r / 100, k));
    cost = BV / Math.pow(1 - r / 100, k);
    if (tieFree(cost) && tieFree((cost * r) / 100)) break;
  }
  const f = 1 - r / 100;
  const dep = cost - BV;
  const first = (cost * r) / 100;
  const prompt =
    `${a.biz} depreciates ${a.asset} by the reducing-balance method at ${r}% a year (each year's charge is ${r}% of the book value at the start of that year). ` +
    `After ${years(k)} its book value is ${cash(BV)}.${KEEP}`;
  const lines = [
    given("_book", mv(BV)), given("_rate", num(r / 100)), given("_years", k),
    step("_cost", "_book / (1 - _rate)^_years", final(cost, "2dp", "money")),
    step("_dep", "_cost - _book", final(dep, "2dp", "money")),
    step("_first", "_cost * _rate", final(first, "2dp", "money")),
  ];
  return xQ("x-rbback", { r, k, BV }, prompt, [
    xNum("cost", "Original cost", "What did the asset cost, in dollars?", cost, "2dp",
      "Book value = cost × (1 - rate)^years. Rearrange: divide the book value by (1 - rate)^years."),
    xNum("dep", "Total depreciation", `Total depreciation charged over the ${years(k)}, in dollars`, dep, "2dp",
      "Everything the asset has lost: cost minus the book value now."),
    xNum("first", "Year 1 charge", "Depreciation charged in year 1, in dollars", first, "2dp",
      "In year 1 the book value at the start of the year is the cost itself."),
  ], "Undo the reducing balance to recover the cost, then work forwards again.", lines,
  xGiven([["_book", BV], ["_rate", r / 100], ["_years", k]]), [
    `Each year the book value is multiplied by (1 - rate) = ${num(f)}. Work backwards: divide instead of multiply.`,
    "`_cost = _book / (1 - _rate)^_years`. Don't subtract rate × years from the book value: that is a straight-line shortcut and is wrong here.",
    "Total depreciation is the cost minus today's book value; the year 1 charge is the rate times the cost.",
  ]);
}

// depreciation / expert 2: compare straight-line and reducing balance, and find the crossover year.
function xCompare(rng) {
  const a = rng.pick(ASSETS);
  let C, n, r, k, y;
  for (let t = 0; t < 80; t++) {
    C = 100 * rng.int(50, 800);
    n = rng.int(4, 10);
    r = rng.int(15, 45);
    k = rng.int(2, n - 1);
    if (r / 100 <= 1.05 / n) continue;
    const ratio = (yy) => (Math.pow(1 - r / 100, yy - 1) * (r / 100) * n); // RB charge ÷ SL charge
    y = 1;
    while (ratio(y) >= 1) y++;
    const sl = C - (k * C) / n;
    if (y <= n && Math.abs(ratio(y) - 1) > 0.01 && Math.abs(ratio(y - 1) - 1) > 0.01 && tieFree(sl) && tieFree(C * Math.pow(1 - r / 100, k))) break;
  }
  const sl = C - (k * C) / n;
  const rb = C * Math.pow(1 - r / 100, k);
  const prompt =
    `${a.biz} buys ${a.asset} for ${cash(C)}, with a life of ${years(n)} and no salvage value. Its accountant compares two methods: ` +
    `straight-line (the same charge every year) and reducing balance at ${r}% a year (${r}% of the book value at the start of each year).` +
    ` Round money answers to 2 decimal places.`;
  const lines = [
    given("_cost", mv(C)), given("_life", n), given("_rate", num(r / 100)), given("_years", k),
    step("_sl_book", "_cost - _cost / _life * _years", final(sl, "2dp", "money")),
    step("_rb_book", "_cost * (1 - _rate)^_years", final(rb, "2dp", "money")),
    step("_sl_charge", "_cost / _life", num(C / n)),
    `- Reducing-balance charge in year y: \`_cost * (1 - _rate)^(y - 1) * _rate\`. It is first below the straight-line charge in year **${y}**.`,
  ];
  return xQ("x-compare", { C, n, r, k }, prompt, [
    xNum("sl", "Straight-line book", `Straight-line book value after ${years(k)}, in dollars`, sl, "2dp",
      "Straight-line charge = cost ÷ life (no salvage). Subtract it once for each year used."),
    xNum("rb", "Reducing-balance book", `Reducing-balance book value after ${years(k)}, in dollars`, rb, "2dp",
      "Multiply the cost by (1 - rate) once for each year."),
    xNum("year", "Crossover year", "In which year is the reducing-balance charge first smaller than the straight-line charge?", y, "int",
      "Work out the reducing-balance charge year by year (rate × book value at the start of the year) and compare each with cost ÷ life."),
  ], "Work out both book values, then compare the yearly charges.", lines,
  xGiven([["_cost", C], ["_life", n], ["_rate", r / 100], ["_years", k]]), [
    "Straight-line: the yearly charge is `_cost / _life`, the same every year.",
    "Reducing balance: book value after k years = `_cost * (1 - _rate)^k`, and the charge in year y = `_cost * (1 - _rate)^(y - 1) * _rate`.",
    "Reducing balance charges more at first and less later. Check the years in order, starting with the first, until its charge drops below the straight-line one.",
  ]);
}

const XLOAN_RULE =
  " Payments are made at the end of each month, with monthly rate i = annual rate ÷ 12 and payment = loan × i ÷ (1 - (1 + i)^-n). " +
  "Round the payment to the cent and use that rounded payment in every later step.";

function xLoanBase(rng, small) {
  return {
    P: small ? 1000 * rng.int(5, 200) : 1000 * rng.int(20, 500),
    rate: rng.int(250, 950) / 100,
    yrs: rng.pick(small ? [3, 4, 5, 7, 10, 15] : [5, 10, 15, 20, 25, 30]),
  };
}

// loans / expert 0: pay the loan off early; balance and the interest saved.
function xPayoff(rng) {
  let P, rate, yrs, n, i, M, Mr, k, bal;
  for (let t = 0; t < 60; t++) {
    ({ P, rate, yrs } = xLoanBase(rng, false));
    n = 12 * yrs;
    i = rate / 1200;
    M = payment(P, i, n);
    Mr = round2(M);
    k = rng.int(12, n - 12);
    const g = Math.pow(1 + i, k);
    bal = P * g - (Mr * (g - 1)) / i;
    if (tieFree(M) && tieFree(bal)) break;
  }
  const purpose = rng.pick(P >= 100000 ? BIG_PURPOSES : PURPOSES);
  const saved = Mr * (n - k) - bal;
  const prompt =
    `A borrower takes out a ${cash(P)} loan to ${purpose} at ${num(rate)}% a year over ${years(yrs)} (${n} monthly payments).${XLOAN_RULE} ` +
    `Right after payment number ${k}, the borrower pays off everything still owed in one go.`;
  const lines = [
    given("_loan", mv(P)), given("_rate", num(rate)), given("_years", yrs), given("_k", k),
    step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", n),
    step("_payment", "round(_loan * _i / (1 - (1 + _i)^(-_n)), 2)", mv(Mr)),
    step("_balance", "_loan * (1 + _i)^_k - _payment * ((1 + _i)^_k - 1) / _i", final(bal, "2dp", "money")),
    step("_saved", "_payment * (_n - _k) - _balance", final(saved, "2dp", "money")),
  ];
  return xQ("x-payoff", { P, rate, yrs, k }, prompt, [
    xNum("balance", "Payoff amount", `How much is owed right after payment ${k}, in dollars?`, bal, "2dp",
      "Use the balance formula with the rounded payment: interest keeps building, so it is not loan − k × payment."),
    xNum("saved", "Interest saved", "How much interest does paying off early save, compared with making every remaining scheduled payment, in dollars?", saved, "2dp",
      "The remaining scheduled payments add up to payment × (n − k). Paying off early costs only the balance; the difference is interest saved."),
  ], "Find the rounded payment, the balance after k payments, then compare with the payments that are no longer needed.", lines,
  xGiven([["_loan", P], ["_rate", rate], ["_years", yrs], ["_k", k]]), [
    "Set up `_i = _rate / 100 / 12` and `_n = _years * 12`, then the payment, rounded with `round(…, 2)`.",
    "Balance after k payments: `_loan * (1 + _i)^_k - _payment * ((1 + _i)^_k - 1) / _i`.",
    "Without the payoff the borrower would still make n − k payments. Their total minus the payoff amount is the interest saved.",
  ]);
}

// loans / expert 1: work backwards from a monthly budget to the biggest affordable loan.
function xAfford(rng) {
  let Mb, rate, yrs, n, i, PV;
  for (let t = 0; t < 60; t++) {
    Mb = 25 * rng.int(8, 160);
    rate = rng.int(250, 950) / 100;
    yrs = rng.pick([3, 4, 5, 7, 10, 15, 20, 25, 30]);
    n = 12 * yrs;
    i = rate / 1200;
    PV = Mb * pvFactor(i, n);
    if (tieFree(PV)) break;
  }
  const who = rng.pick(SAVERS);
  const interest = Mb * n - PV;
  const prompt =
    `${who} can afford ${cash(Mb)} a month and is offered a loan at ${num(rate)}% a year over ${years(yrs)} (${n} monthly payments, ` +
    `made at the end of each month, with monthly rate = annual rate ÷ 12).${KEEP}`;
  const lines = [
    given("_budget", mv(Mb)), given("_rate", num(rate)), given("_years", yrs),
    step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", n),
    step("_loan", "_budget * (1 - (1 + _i)^(-_n)) / _i", final(PV, "2dp", "money")),
    step("_interest", "_budget * _n - _loan", final(interest, "2dp", "money")),
  ];
  return xQ("x-afford", { Mb, rate, yrs }, prompt, [
    xNum("loan", "Largest loan", "What is the largest loan the budget can repay, in dollars?", PV, "2dp",
      "The loan is the present value of the payments: payment × (1 - (1 + i)^-n) ÷ i."),
    xNum("interest", "Total interest", "How much interest would that loan cost in total, in dollars?", interest, "2dp",
      "Total interest = everything paid (budget × number of payments) minus the amount borrowed."),
  ], "The payment formula run backwards: the loan is the present value of the monthly payments.", lines,
  xGiven([["_budget", Mb], ["_rate", rate], ["_years", yrs]]), [
    "Here the payment is known and the loan is not. Rearrange payment = loan × i ÷ (1 - (1 + i)^-n) for the loan.",
    "`_loan = _budget * (1 - (1 + _i)^(-_n)) / _i`, with `_i = _rate / 100 / 12` and `_n = _years * 12`.",
    "Then compare what is paid in total with what was borrowed.",
  ]);
}

// loans / expert 2: split one payment into interest and principal.
function xSplit(rng) {
  let P, rate, yrs, n, i, M, Mr, k, before, intK;
  for (let t = 0; t < 60; t++) {
    ({ P, rate, yrs } = xLoanBase(rng, false));
    n = 12 * yrs;
    i = rate / 1200;
    M = payment(P, i, n);
    Mr = round2(M);
    k = rng.int(2, n - 1);
    const g = Math.pow(1 + i, k - 1);
    before = P * g - (Mr * (g - 1)) / i;
    intK = before * i;
    if (tieFree(M) && tieFree(intK)) break;
  }
  const purpose = rng.pick(P >= 100000 ? BIG_PURPOSES : PURPOSES);
  const intR = round2(intK);
  const prin = Mr - intR;
  const prompt =
    `A borrower takes out a ${cash(P)} loan to ${purpose} at ${num(rate)}% a year over ${years(yrs)} (${n} monthly payments).${XLOAN_RULE} ` +
    `Each payment first covers that month's interest (the balance before the payment × i, rounded to the cent); the rest repays principal. Look at payment number ${k}.`;
  const lines = [
    given("_loan", mv(P)), given("_rate", num(rate)), given("_years", yrs), given("_k", k),
    step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", n),
    step("_payment", "round(_loan * _i / (1 - (1 + _i)^(-_n)), 2)", final(M, "2dp", "money")),
    step("_before", "_loan * (1 + _i)^(_k - 1) - _payment * ((1 + _i)^(_k - 1) - 1) / _i", num(before)),
    step("_interest", "round(_before * _i, 2)", final(intK, "2dp", "money")),
    step("_principal", "_payment - _interest", final(prin, "2dp", "money")),
  ];
  return xQ("x-split", { P, rate, yrs, k }, prompt, [
    xNum("payment", "Payment", "Monthly payment, in dollars (2 decimal places)", M, "2dp",
      "Use the payment formula with the monthly rate and the number of months."),
    xNum("interest", "Interest part", `Interest part of payment ${k}, in dollars`, intK, "2dp",
      `You need the balance after payment ${k - 1} (the balance before payment ${k}); multiply it by i and round.`),
    xNum("principal", "Principal part", `Principal repaid by payment ${k}, in dollars`, prin, "2dp",
      "Principal = the rounded payment minus the rounded interest part."),
  ], "Find the payment, the balance just before the payment, then split the payment.", lines,
  xGiven([["_loan", P], ["_rate", rate], ["_years", yrs], ["_k", k]]), [
    "Payment: `round(_loan * _i / (1 - (1 + _i)^(-_n)), 2)` with `_i = _rate / 100 / 12` and `_n = _years * 12`.",
    "The balance before payment k is the balance after k − 1 payments: use the balance formula with k − 1 in place of k.",
    "Interest part = that balance × i, rounded to the cent. Whatever is left of the payment repays principal.",
  ]);
}

// loans / expert 3: overpaying every month; how many payments until the loan is cleared.
function xExtra(rng) {
  let P, rate, yrs, n, i, M, Mr, E, pay, N, Nx;
  for (let t = 0; t < 80; t++) {
    ({ P, rate, yrs } = xLoanBase(rng, true));
    n = 12 * yrs;
    i = rate / 1200;
    M = payment(P, i, n);
    Mr = round2(M);
    E = 25 * rng.int(1, 20);
    pay = Mr + E;
    Nx = -Math.log(1 - (P * i) / pay) / Math.log(1 + i);
    N = Math.ceil(Nx);
    const fr = Nx - Math.floor(Nx);
    if (tieFree(M) && fr > 0.02 && fr < 0.98 && N < n) break;
  }
  const purpose = rng.pick(PURPOSES);
  const prompt =
    `A borrower takes out a ${cash(P)} loan to ${purpose} at ${num(rate)}% a year over ${years(yrs)} (${n} monthly payments).${XLOAN_RULE} ` +
    `The borrower decides to pay ${cash(E)} more than the scheduled payment every month, from the first payment on. The last payment may be smaller, just enough to clear the loan.`;
  const lines = [
    given("_loan", mv(P)), given("_rate", num(rate)), given("_years", yrs), given("_extra", mv(E)),
    step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", n),
    step("_payment", "round(_loan * _i / (1 - (1 + _i)^(-_n)), 2)", final(M, "2dp", "money")),
    step("_pay", "_payment + _extra", mv(pay)),
    step("_months", "-ln(1 - _loan * _i / _pay) / ln(1 + _i)", num(Nx)),
    `- Round up (the last, smaller payment still counts): **${N} payments**, instead of ${n}.`,
  ];
  return xQ("x-extra", { P, rate, yrs, E }, prompt, [
    xNum("payment", "Scheduled payment", "Scheduled monthly payment, in dollars (2 decimal places)", M, "2dp",
      "Use the payment formula with the monthly rate and the number of months."),
    xNum("months", "Payments", "How many payments (including the last, smaller one) does it take to clear the loan?", N, "int",
      "Solve loan = pay × (1 - (1 + i)^-m) ÷ i for m with logarithms, then round up."),
  ], "Find the scheduled payment, add the extra, then solve the payment formula for the number of months.", lines,
  xGiven([["_loan", P], ["_rate", rate], ["_years", yrs], ["_extra", E]]), [
    "First the scheduled payment, rounded to the cent. The new monthly payment is that plus the extra.",
    "Rearranging the payment formula for the number of payments m gives `m = -ln(1 - _loan * _i / _pay) / ln(1 + _i)`.",
    "m will not be a whole number: the part-month is the final, smaller payment, so round up.",
  ]);
}

// annuities-savings / expert 0: save, then draw an income from the pot.
function xRetire(rng) {
  let D, r, y1, y2, i, FV, W;
  for (let t = 0; t < 60; t++) {
    D = 25 * rng.int(4, 60);
    r = rng.int(20, 80) / 10;
    y1 = rng.int(10, 40);
    y2 = rng.int(10, 30);
    i = r / 1200;
    FV = D * fvFactor(i, 12 * y1);
    W = FV / pvFactor(i, 12 * y2);
    if (tieFree(FV) && tieFree(W)) break;
  }
  const who = rng.pick(SAVERS);
  const prompt =
    `${who} saves ${cash(D)} at the end of every month for ${years(y1)} in an account paying ${num(r)}% a year, compounded monthly ` +
    `(monthly rate = annual rate ÷ 12). Then the deposits stop and the pot pays out the same amount at the end of every month for ${years(y2)}, ` +
    `still earning the same rate, until the last payment empties it.${KEEP}`;
  const lines = [
    given("_deposit", mv(D)), given("_rate", num(r)), given("_save_years", y1), given("_pay_years", y2),
    step("_i", "_rate / 100 / 12", num(i, 6)),
    step("_pot", "_deposit * ((1 + _i)^(_save_years * 12) - 1) / _i", final(FV, "2dp", "money")),
    step("_income", "_pot * _i / (1 - (1 + _i)^(-_pay_years * 12))", final(W, "2dp", "money")),
  ];
  return xQ("x-retire", { D, r, y1, y2 }, prompt, [
    xNum("pot", "Pot", "How much is in the account right after the last deposit, in dollars?", FV, "2dp",
      "Future value of the monthly deposits: deposit × ((1 + i)^n - 1) ÷ i, with n = saving years × 12."),
    xNum("income", "Monthly income", "How much can it pay out each month, in dollars?", W, "2dp",
      "The pot is now a present value. Use the unrounded pot in the payment formula over the payout months."),
  ], "Two phases: grow the deposits into a pot, then turn the pot into a stream of equal payments.", lines,
  xGiven([["_deposit", D], ["_rate", r], ["_save_years", y1], ["_pay_years", y2]]), [
    "Phase 1 is a future value of regular deposits; phase 2 is a loan-style payment out of a lump sum.",
    "`_i = _rate / 100 / 12`. The pot is `_deposit * ((1 + _i)^(_save_years * 12) - 1) / _i`.",
    "For the payout, the pot plays the part of the loan: `_pot * _i / (1 - (1 + _i)^(-_pay_years * 12))`.",
  ]);
}

// annuities-savings / expert 1: the cost of starting late.
function xDelay(rng) {
  let G, r, Y, k, i, A, B, extra;
  for (let t = 0; t < 60; t++) {
    G = 1000 * rng.int(10, 300);
    r = rng.int(20, 90) / 10;
    Y = rng.int(10, 40);
    k = rng.int(2, Math.min(15, Y - 3));
    i = r / 1200;
    A = G / fvFactor(i, 12 * Y);
    B = G / fvFactor(i, 12 * (Y - k));
    extra = B * 12 * (Y - k) - A * 12 * Y;
    if (tieFree(A) && tieFree(B) && tieFree(extra)) break;
  }
  const prompt =
    `Two friends each want ${cash(G)} in ${years(Y)}. Both save the same amount at the end of every month in accounts paying ${num(r)}% a year, compounded monthly ` +
    `(monthly rate = annual rate ÷ 12). Saver A starts now. Saver B waits ${years(k)} before the first deposit, but must reach the same total on the same date.${KEEP}`;
  const lines = [
    given("_goal", mv(G)), given("_rate", num(r)), given("_years", Y), given("_wait", k),
    step("_i", "_rate / 100 / 12", num(i, 6)),
    step("_a", "_goal * _i / ((1 + _i)^(_years * 12) - 1)", final(A, "2dp", "money")),
    step("_b", "_goal * _i / ((1 + _i)^((_years - _wait) * 12) - 1)", final(B, "2dp", "money")),
    step("_extra", "_b * (_years - _wait) * 12 - _a * _years * 12", final(extra, "2dp", "money")),
  ];
  return xQ("x-delay", { G, r, Y, k }, prompt, [
    xNum("a", "Saver A", "Saver A's monthly deposit, in dollars", A, "2dp",
      "Deposit for a goal: goal × i ÷ ((1 + i)^n - 1), with n = all the months."),
    xNum("b", "Saver B", "Saver B's monthly deposit, in dollars", B, "2dp",
      "Same formula, but B has fewer months to save."),
    xNum("extra", "Extra paid in", "How much more does B pay in altogether than A, using the unrounded deposits, in dollars?", extra, "2dp",
      "Total paid in = monthly deposit × number of deposits. Subtract A's total from B's."),
  ], "Same goal and rate, different number of months: compare the deposits and what each saver pays in.", lines,
  xGiven([["_goal", G], ["_rate", r], ["_years", Y], ["_wait", k]]), [
    "Both use deposit = goal × i ÷ ((1 + i)^n - 1); only n changes. A saves for all the months, B for (years − wait) × 12 months.",
    "`_i = _rate / 100 / 12`. B's n is `(_years - _wait) * 12`.",
    "B pays more each month and in total, because B's money has less time to earn interest. Multiply each deposit by its number of months.",
  ]);
}

// annuities-savings / expert 2: deposits at the start vs the end of each month (annuity due).
function xDue(rng) {
  let D, r, yrs, i, n, end, due;
  for (let t = 0; t < 60; t++) {
    D = 25 * rng.int(2, 40);
    r = rng.int(10, 90) / 10;
    yrs = rng.int(2, 30);
    n = 12 * yrs;
    i = r / 1200;
    end = D * fvFactor(i, n);
    due = end * (1 + i);
    if (tieFree(end) && tieFree(due)) break;
  }
  const who = rng.pick(SAVERS);
  const prompt =
    `${who} puts ${cash(D)} a month into an account paying ${num(r)}% a year, compounded monthly (monthly rate = annual rate ÷ 12), for ${years(yrs)} (${n} deposits). ` +
    `Compare depositing at the **end** of each month with depositing at the **start** of each month. In both cases, measure the balance at the end of the last month.${KEEP}`;
  const lines = [
    given("_deposit", mv(D)), given("_rate", num(r)), given("_years", yrs),
    step("_i", "_rate / 100 / 12", num(i, 6)), step("_n", "_years * 12", n),
    step("_end", "_deposit * ((1 + _i)^_n - 1) / _i", final(end, "2dp", "money")),
    step("_start", "_end * (1 + _i)", final(due, "2dp", "money")),
  ];
  return xQ("x-due", { D, r, yrs }, prompt, [
    xNum("end", "End of month", "Balance with deposits at the end of each month, in dollars", end, "2dp",
      "This is the ordinary future value of regular deposits."),
    xNum("start", "Start of month", "Balance with deposits at the start of each month, in dollars", due, "2dp",
      "Each deposit now earns one extra month of interest."),
  ], "The usual formula assumes end-of-month deposits; moving every deposit a month earlier adds one month's interest to all of them.", lines,
  xGiven([["_deposit", D], ["_rate", r], ["_years", yrs]]), [
    "End of month: `_deposit * ((1 + _i)^_n - 1) / _i`, with `_i = _rate / 100 / 12` and `_n = _years * 12`.",
    "Start of month: every deposit is in the account one month longer than before, so every deposit's value is multiplied by (1 + i).",
  ]);
}

// annuities-savings / expert 3: how long a fund lasts, and what is left.
function xDrawdown(rng) {
  let F, r, W, i, N, left;
  for (let t = 0; t < 80; t++) {
    F = 1000 * rng.int(20, 500);
    r = rng.int(20, 80) / 10;
    i = r / 100;
    W = 100 * rng.int(Math.ceil((F * i * 1.2) / 100), Math.ceil((F * i * 4) / 100));
    N = Math.floor(drawYears(F, i, W));
    left = F * Math.pow(1 + i, N) - W * fvFactor(i, N);
    if (N >= 3 && N <= 60 && left >= 1 && W - left * (1 + i) >= 1 && tieFree(left)) break;
  }
  const who = rng.pick(["A retired teacher", "A charity", "A scholarship fund", "A family trust", "A retired builder"]);
  const prompt =
    `${who} has ${cash(F)} invested at ${num(r)}% a year, compounded yearly, and takes out ${cash(W)} at the end of every year, ` +
    `as long as there is enough for a full withdrawal.`;
  const lines = [
    given("_fund", mv(F)), given("_rate", num(r)), given("_draw", mv(W)),
    step("_i", "_rate / 100", num(i)),
    step("_n_exact", "-ln(1 - _fund * _i / _draw) / ln(1 + _i)", num(drawYears(F, i, W))),
    `- Round down for full withdrawals: **${N}**.`,
    step("_left", `_fund * (1 + _i)^${N} - _draw * ((1 + _i)^${N} - 1) / _i`, final(left, "2dp", "money")),
  ];
  return xQ("x-drawdown", { F, r, W }, prompt, [
    xNum("count", "Full withdrawals", "How many full withdrawals can it make?", N, "int",
      "Solve fund = withdrawal × (1 - (1 + i)^-n) ÷ i for n with logarithms, then round down."),
    xNum("left", "Left over", "How much is left right after the last full withdrawal, in dollars? Round to 2 decimal places.", left, "2dp",
      "Use the balance formula: fund grown for n years minus the withdrawals grown to the same date."),
  ], "Solve for the number of years the fund lasts, then find the remainder after the last full withdrawal.", lines,
  xGiven([["_fund", F], ["_rate", r], ["_draw", W]]), [
    "This is a loan in reverse: the fund is the present value of the withdrawals. Rearranging gives `n = -ln(1 - _fund * _i / _draw) / ln(1 + _i)`.",
    "n won't be whole. Only whole withdrawals count, so round it down.",
    "The leftover is the fund grown for that many years minus the withdrawals' future value: `_fund * (1 + _i)^n - _draw * ((1 + _i)^n - 1) / _i`.",
  ]);
}
const drawYears = (F, i, W) => -Math.log(1 - (F * i) / W) / Math.log(1 + i);

function generateExpert(subtopic, rng) {
  if (subtopic === "depreciation") return [xDisposal, xRbBackwards, xCompare][rng.int(0, 2)](rng);
  if (subtopic === "loans") return [xPayoff, xAfford, xSplit, xExtra][rng.int(0, 3)](rng);
  if (subtopic === "annuities-savings") return [xRetire, xDelay, xDue, xDrawdown][rng.int(0, 3)](rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
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
  if (difficulty === "expert") return generateExpert(subtopic, rng);
  return withHints(withGiven(generateRaw(subtopic, difficulty, rng)));
}

// ---------------------------------------------------------------------------------------------
// Guided-mode hints, read from the explanation's calculator rows after the question is built (so
// they never touch the rng and use the same `_labels` as the given values):
//   1. the method, plus a "watch out" for the classic mistake;
//   2. the values from the question as calculator rows;
//   3. any intermediate rows with their values;
//   4. the final row's expression only, without its value.

const TIPS = {
  "sl-charge": "Watch out: take the salvage value off the cost before dividing by the life.",
  "sl-book": "Watch out: the book value is what is left, not the depreciation charged so far.",
  "rb-book": "Watch out: the rate applies to the shrinking book value each year, not to the original cost.",
  "rb-charge": "Watch out: this year's charge uses the book value at the start of the year, so the power is one less than the year number.",
  "rb-rate": "Watch out: the total fall divided by the years is a straight-line rate, which is wrong here.",
  payment: "Watch out: use the monthly rate (÷ 12) and the number of months, not years.",
  "interest-given": "No payment formula needed: everything paid back minus what was borrowed.",
  "total-interest": "Watch out: round the payment to the cent before you multiply it by the number of payments.",
  balance: "Watch out: use the rounded payment, and remember interest keeps building, so payments don't come straight off the loan.",
  fv: "Deposits are made at the end of each period, so the last deposit earns no interest.",
  pv: "Watch out: each payment is discounted back to today, so the answer is less than payment × number of payments.",
  "years-to-goal": "Watch out: round up, because the balance only grows at each year end.",
  "deposit-for-goal": "Watch out: the interest does part of the work, so the deposit is less than goal ÷ months.",
  "fv-lump": "Grow the opening balance and the monthly deposits separately, then add them.",
};

const ROW = /^- `(_[A-Za-z0-9_]+) = ([^`]+)`(.*)$/;

function rowHints(explanation, tip, finishNote, answer, tol) {
  const blocks = String(explanation || "").split("\n\n");
  const intro = blocks[0];
  const rows = [];
  for (const line of blocks.slice(1).join("\n").split("\n")) {
    const m = line.match(ROW);
    if (!m) continue;
    const rest = m[3].trim();
    rows.push(rest.startsWith("→") ? { label: m[1], expr: m[2], shown: rest.slice(1).trim() } : { label: m[1], text: line.slice(2) });
  }
  const last = rows[rows.length - 1];
  if (!last || last.expr === undefined) return null;
  const givens = rows.filter((r) => r.expr === undefined);
  const mids = rows.slice(0, -1).filter((r) => r.expr !== undefined);
  const out = [`${intro}${tip ? ` ${tip}` : ""}`];
  if (givens.length) out.push(`Put the values from the question into calculator rows:\n\n${givens.map((r) => `- ${r.text}`).join("\n")}`);
  // An intermediate value that matches the answer (e.g. charge = book value when the salvage is $0
  // and one year is left) is listed without its value.
  const leaks = (s) => Number.isFinite(answer) && (String(s).match(/-?\d+(?:\.\d+)?/g) || []).some((x) => Math.abs(Number(x) - answer) <= tol + 1e-9);
  if (mids.length) out.push(`Then work out:\n\n${mids.map((r) => `- \`${r.label} = ${r.expr}\`${leaks(r.shown) ? "" : ` → ${r.shown}`}`).join("\n")}`);
  out.push(`Finally work out \`${last.label} = ${last.expr}\`.${finishNote}`);
  return out;
}

function withHints(q) {
  const p = q.params || {};
  const note = p.fmt === "2dp" ? " Round to 2 decimal places." : p.kind === "years-to-goal" ? " The answer is a whole number of years." : " The answer is a whole number of dollars.";
  const hints = rowHints(q.explanation, TIPS[p.kind], note, Number(q.answer), q.tolerance || 0);
  return hints && hints.length ? { ...q, hints } : q;
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
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(question, answer);
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

// ---------------------------------------------------------------------------------------------
// Expert verification: every part is rebuilt period by period (loops, no closed forms) or
// substituted back into its defining relation. 2-decimal parts must be within 0.005 of the
// rebuilt value (scaled by sensitivity where the part is solved for); whole-number parts exact.

function verifyExpert(question, answer) {
  const p = question.params;
  const k = p.values;
  const parts = question.parts;
  if (question.answerType !== "multi" || !Array.isArray(parts) || !answer || typeof answer !== "object") return false;
  const val = (id) => {
    const v = answer[id];
    if (v === "" || v === null || v === undefined || typeof v === "boolean") return NaN;
    return Number(v);
  };
  const close = (x, ref) => Number.isFinite(x) && Number.isFinite(ref) && Math.abs(x - ref) <= 0.005 + 1e-6;
  const res = (r, sens) => Number.isFinite(r) && Math.abs(r) <= 0.005 * Math.abs(sens) + 1e-6;
  const whole = (x, ref) => Number.isInteger(x) && x === ref;
  const ids = parts.map((pt) => pt.id).join(",");
  const loanPay = (P, rate, yrs) => {
    const M = P / discountSum(rate / 1200, 12 * yrs);
    return tieFree(M) ? round2(M) : NaN;
  };
  const balanceAfter = (P, i, pay, m) => {
    let b = P;
    for (let t = 0; t < m; t++) b = b * (1 + i) - pay;
    return b;
  };

  switch (p.kind) {
    case "x-disposal": {
      if (ids !== "book,gain") return false;
      const bookRes = (b) => (k.C - b) * k.n - k.k * (k.C - k.S); // (cost - book) × life = years × (cost - salvage)
      return res(bookRes(val("book")), k.n) && res(bookRes(k.X - val("gain")), k.n);
    }
    case "x-rbback": {
      if (ids !== "cost,dep,first") return false;
      const fwd = (c) => { let v = c; for (let t = 0; t < k.k; t++) v -= (v * k.r) / 100; return v - k.BV; };
      const sens = Math.pow(1 - k.r / 100, k.k);
      return res(fwd(val("cost")), sens) && res(fwd(k.BV + val("dep")), sens) && res(fwd((val("first") * 100) / k.r), (sens * 100) / k.r);
    }
    case "x-compare": {
      if (ids !== "sl,rb,year") return false;
      let v = k.C;
      for (let t = 0; t < k.k; t++) v -= (v * k.r) / 100;
      let year = 0;
      let w = k.C;
      for (let y = 1; y <= 200; y++) {
        const ch = (w * k.r) / 100;
        if (ch * k.n < k.C) { year = y; break; }
        w -= ch;
      }
      return res((k.C - val("sl")) * k.n - k.k * k.C, k.n) && close(val("rb"), v) && whole(val("year"), year);
    }
    case "x-payoff": {
      if (ids !== "balance,saved") return false;
      const i = k.rate / 1200;
      const n = 12 * k.yrs;
      const Mr = loanPay(k.P, k.rate, k.yrs);
      const b = balanceAfter(k.P, i, Mr, k.k);
      let rest = 0;
      for (let t = k.k; t < n; t++) rest += Mr;
      return close(val("balance"), b) && close(val("saved"), rest - b);
    }
    case "x-afford": {
      if (ids !== "loan,interest") return false;
      const i = k.rate / 1200;
      const n = 12 * k.yrs;
      const grow = Math.pow(1 + i, n);
      const left = (L) => balanceAfter(L, i, k.Mb, n); // must end at 0
      return res(left(val("loan")), grow) && res(left(k.Mb * n - val("interest")), grow);
    }
    case "x-split": {
      if (ids !== "payment,interest,principal") return false;
      const i = k.rate / 1200;
      const Mr = loanPay(k.P, k.rate, k.yrs);
      const before = balanceAfter(k.P, i, Mr, k.k - 1);
      const intExact = before * i;
      if (!tieFree(intExact)) return false;
      const intR = round2(intExact);
      return close(val("payment"), Mr) && close(val("interest"), intExact) && close(val("principal"), Mr - intR);
    }
    case "x-extra": {
      if (ids !== "payment,months") return false;
      const i = k.rate / 1200;
      const Mr = loanPay(k.P, k.rate, k.yrs);
      const pay = Mr + k.E;
      let b = k.P;
      let m = 0;
      while (b > 1e-9 && m < 1000) { b = b * (1 + i) - pay; m++; }
      return close(val("payment"), Mr) && whole(val("months"), m);
    }
    case "x-retire": {
      if (ids !== "pot,income") return false;
      const i = k.r / 1200;
      const pot = growDeposits(0, k.D, i, 12 * k.y1);
      const S = growDeposits(0, 1, i, 12 * k.y2);
      return close(val("pot"), pot) && res(balanceAfter(pot, i, val("income"), 12 * k.y2), S);
    }
    case "x-delay": {
      if (ids !== "a,b,extra") return false;
      const i = k.r / 1200;
      const SA = growDeposits(0, 1, i, 12 * k.Y);
      const SB = growDeposits(0, 1, i, 12 * (k.Y - k.k));
      let tot = 0;
      for (let t = 0; t < 12 * (k.Y - k.k); t++) tot += k.G / SB;
      for (let t = 0; t < 12 * k.Y; t++) tot -= k.G / SA;
      return res(val("a") * SA - k.G, SA) && res(val("b") * SB - k.G, SB) && close(val("extra"), tot);
    }
    case "x-due": {
      if (ids !== "end,start") return false;
      const i = k.r / 1200;
      let e = 0;
      let s = 0;
      for (let t = 0; t < 12 * k.yrs; t++) { e = e * (1 + i) + k.D; s = (s + k.D) * (1 + i); }
      return close(val("end"), e) && close(val("start"), s);
    }
    case "x-drawdown": {
      if (ids !== "count,left") return false;
      const i = k.r / 100;
      let b = k.F;
      let c = 0;
      while (b * (1 + i) >= k.W && c < 1000) { b = b * (1 + i) - k.W; c++; }
      return whole(val("count"), c) && close(val("left"), b);
    }
    default:
      return false;
  }
}
