// Business math generator. Uses only the seeded rng passed in by the engine.
// Easy answers are whole numbers; medium/hard answers are rounded to 2 decimals (tolerance 0.005).
// Percent answers are typed as plain numbers, without the % sign.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Answer/choice formatter: whole numbers as-is, rounded answers with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

// Given values and intermediate steps: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// Dollar amounts: "$240" for whole dollars, "$12.50" otherwise.
function cash(n) {
  const r = round2(n);
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

const years = (t) => (t === 1 ? "1 year" : `${t} years`);
const PCT_NOTE = " Answer as a number without the % sign.";

// Final line of an explanation, e.g. "= **$36**" or "≈ 25.3731%, which rounds to **25.37%**".
function result(exact, rounded, unit) {
  const show = (s) => (unit === "money" ? `$${s}` : `${s}%`);
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${show(shown)}**`;
  return `≈ ${show(exact.toFixed(4))}, which rounds to **${show(shown)}**`;
}

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

// Turn a solved question into either a typed-number or a multiple-choice question.
function finish(base, exact, rounded, candidates, rng) {
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

function genPercent(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty !== "easy";
  const kind = rng.pick(rounded ? ["of", "change", "original"] : ["of", "change"]);
  const end = rounded ? " Round to 2 decimal places." : "";
  let prompt, exact, unit, explanation, candidates, values;

  if (kind === "of") {
    let p, N;
    if (difficulty === "easy") {
      p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75]);
      N = 20 * rng.int(1, 30); // p is a multiple of 5 and N of 20, so p% of N is whole
    } else if (difficulty === "medium") {
      p = rng.int(1, 99);
      N = rng.int(20, 2000);
    } else {
      p = rng.int(1, 999) / 10;
      N = rng.int(1000, 99999) / 100;
    }
    exact = (p * N) / 100;
    unit = "money";
    values = { p, N };
    prompt = `What is ${num(p)}% of ${cash(N)}? Give your answer in dollars.${end}`;
    explanation =
      `Turn the percent into a decimal and multiply.\n\n` +
      `\`${num(p)} / 100 × ${num(N)}\` ${result(exact, rounded, unit)}`;
    candidates = [p * N, N + exact, N - exact]; // forgot to divide by 100, gave the increased total, gave what is left
  } else if (kind === "change") {
    let A, B;
    if (difficulty === "easy") {
      A = 20 * rng.int(1, 25);
      const p = rng.pick([10, 20, 25, 50, 75, 100, -10, -20, -25, -50, -75]);
      B = A + (A * p) / 100; // whole, since A is a multiple of 20 and p of 5
    } else if (difficulty === "medium") {
      A = rng.int(20, 500);
      do {
        B = rng.int(20, 500);
      } while (B === A);
    } else {
      A = rng.int(1000, 99999) / 100;
      do {
        B = rng.int(1000, 99999) / 100;
      } while (B === A);
    }
    exact = ((B - A) * 100) / A;
    unit = "pct";
    values = { A, B };
    prompt = `A price changes from ${cash(A)} to ${cash(B)}. What is the percent change? Use a negative number for a decrease.${PCT_NOTE}${end}`;
    explanation =
      `Percent change = (new - old) / old × 100.\n\n` +
      `\`(${num(B)} - ${num(A)}) / ${num(A)} × 100 = ${num(B - A)} / ${num(A)} × 100\` ${result(exact, rounded, unit)}`;
    candidates = [((B - A) * 100) / B, B - A, -exact]; // divided by the new price, dollar change, sign flipped
  } else {
    // Reverse percentage (medium/hard): find the price before the change.
    const up = rng.next() < 0.5;
    let p, A0;
    if (difficulty === "medium") {
      p = rng.int(5, 50);
      A0 = rng.int(20, 500);
    } else {
      p = rng.int(50, 600) / 10;
      A0 = rng.int(1000, 99999) / 100;
    }
    const f = up ? 1 + p / 100 : 1 - p / 100;
    const B = round2(A0 * f);
    exact = B / f;
    unit = "money";
    values = { p: up ? p : -p, B };
    prompt = `After a ${num(p)}% ${up ? "increase" : "decrease"}, a price is ${cash(B)}. What was the original price, in dollars?${end}`;
    explanation =
      `The new price is ${num(f * 100)}% of the original, so divide by ${num(f)} (not ${up ? "subtract" : "add"} ${num(p)}% of the new price).\n\n` +
      `\`${num(B)} / ${num(f)}\` ${result(exact, rounded, unit)}`;
    candidates = [B * (2 - f), B * f, up ? B - p : B + p]; // applied the opposite percent to the new price, applied it again, used % as dollars
  }

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { kind, values, rounded },
  };
  return finish(base, exact, rounded, candidates, rng);
}

function genInterest(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty !== "easy";
  const kind = rng.pick(
    difficulty === "easy"
      ? ["simple-interest", "simple-total"]
      : difficulty === "medium"
        ? ["simple-interest", "simple-total", "simple-rate", "compound-total"]
        : ["simple-rate", "compound-total", "compound-interest"]
  );
  const end = rounded ? " Round to 2 decimal places." : "";
  let P, r, t;
  if (difficulty === "easy") {
    P = 100 * rng.int(1, 50); // a multiple of 100 keeps simple interest whole
    r = rng.int(1, 10);
    t = rng.int(1, 5);
  } else if (difficulty === "medium") {
    P = 50 * rng.int(10, 400);
    r = rng.int(2, 12);
    t = rng.int(2, 10);
  } else {
    P = rng.int(100000, 5000000) / 100;
    r = rng.int(10, 150) / 10;
    t = rng.int(2, 30);
  }
  const simpleI = (P * r * t) / 100;
  const growth = 1 + r / 100;
  const compoundA = P * Math.pow(growth, t);

  let prompt, exact, unit, explanation, candidates, values;
  if (kind === "simple-interest") {
    exact = simpleI;
    unit = "money";
    values = { P, r, t };
    prompt = `${cash(P)} is invested at ${num(r)}% simple interest per year for ${years(t)}. How much interest does it earn, in dollars?${end}`;
    explanation =
      `Simple interest: \`I = P × r × t\`, with r as a decimal.\n\n` +
      `\`I = ${num(P)} × ${num(r)} / 100 × ${t}\` ${result(exact, rounded, unit)}`;
    candidates = [P * r * t, (P * r) / 100, P + simpleI]; // forgot /100, only one year, gave the total
  } else if (kind === "simple-total") {
    exact = P + simpleI;
    unit = "money";
    values = { P, r, t };
    prompt = `${cash(P)} is invested at ${num(r)}% simple interest per year for ${years(t)}. What is the total amount (principal plus interest) at the end, in dollars?${end}`;
    explanation =
      `Simple interest: \`I = P × r × t = ${num(P)} × ${num(r)} / 100 × ${t} = ${num(simpleI)}\`.\n\n` +
      `Total: \`A = P + I = ${num(P)} + ${num(simpleI)}\` ${result(exact, rounded, unit)}`;
    candidates = [simpleI, compoundA, P + (P * r) / 100]; // interest only, compounded by mistake, only one year
  } else if (kind === "simple-rate") {
    const I = round2(simpleI);
    exact = (100 * I) / (P * t);
    unit = "pct";
    values = { P, t, I };
    prompt = `${cash(P)} is invested at simple interest for ${years(t)} and earns ${cash(I)} in interest. What is the annual interest rate?${PCT_NOTE}${end}`;
    explanation =
      `Rearrange \`I = P × r × t\` to \`r = I / (P × t)\`, then multiply by 100 for a percent.\n\n` +
      `\`${num(I)} / (${num(P)} × ${t}) × 100\` ${result(exact, rounded, unit)}`;
    candidates = [(100 * I) / P, I / (P * t), (100 * I * t) / P]; // forgot the time, forgot ×100, multiplied by t
  } else if (kind === "compound-total") {
    exact = compoundA;
    unit = "money";
    values = { P, r, t };
    prompt = `${cash(P)} is invested at ${num(r)}% per year, compounded annually, for ${years(t)}. What is the total amount at the end, in dollars?${end}`;
    explanation =
      `Compound interest: \`A = P × (1 + r)^t\`, with r as a decimal.\n\n` +
      `\`A = ${num(P)} × ${num(growth)}^${t}\` ${result(exact, rounded, unit)}`;
    candidates = [P + simpleI, compoundA - P, P * Math.pow(growth, t - 1)]; // simple interest instead, interest only, one year short
  } else {
    exact = compoundA - P;
    unit = "money";
    values = { P, r, t };
    prompt = `${cash(P)} is invested at ${num(r)}% per year, compounded annually, for ${years(t)}. How much interest does it earn in total, in dollars?${end}`;
    explanation =
      `First the final amount: \`A = P × (1 + r)^t = ${num(P)} × ${num(growth)}^${t} ≈ ${compoundA.toFixed(4)}\`.\n\n` +
      `Then the interest: \`I = A - P = ${compoundA.toFixed(4)} - ${num(P)}\` ${result(exact, rounded, unit)}`;
    candidates = [simpleI, compoundA, P * Math.pow(growth, t - 1) - P]; // simple interest instead, total instead of interest, one year short
  }

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { kind, values, rounded },
  };
  return finish(base, exact, rounded, candidates, rng);
}

function genMargins(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty !== "easy";
  const easy = difficulty === "easy";
  const kind = rng.pick(difficulty === "hard" ? ["price", "markup", "margin", "target"] : ["price", "markup", "margin"]);
  const end = rounded ? " Round to 2 decimal places." : "";
  const MARKUPS = [10, 20, 25, 30, 40, 50, 60, 75, 100];
  const MARGINS = [10, 20, 25, 30, 40, 50, 60, 75];
  let prompt, exact, unit, explanation, candidates, values;

  if (kind === "price") {
    let C, m;
    if (easy) {
      C = 20 * rng.int(1, 25); // with m a multiple of 5 the price is whole
      m = rng.pick(MARKUPS);
    } else if (difficulty === "medium") {
      C = rng.int(10, 500);
      m = rng.int(5, 80);
    } else {
      C = rng.int(500, 50000) / 100;
      m = rng.int(50, 1500) / 10;
    }
    exact = (C * (100 + m)) / 100;
    unit = "money";
    values = { C, m };
    prompt = `An item costs ${cash(C)}. The seller adds a ${num(m)}% markup on cost. What is the selling price, in dollars?${end}`;
    explanation =
      `Selling price = cost × (1 + markup), with the markup as a decimal.\n\n` +
      `\`${num(C)} × (1 + ${num(m)} / 100) = ${num(C)} × ${num(1 + m / 100)}\` ${result(exact, rounded, unit)}`;
    candidates = [m < 100 ? C / (1 - m / 100) : NaN, (C * m) / 100, C + m]; // treated it as a margin, markup amount only, % as dollars
  } else if (kind === "markup" || kind === "margin") {
    let C, S;
    if (easy && kind === "markup") {
      C = 20 * rng.int(1, 25);
      S = (C * (100 + rng.pick(MARKUPS))) / 100;
    } else if (easy) {
      S = 20 * rng.int(1, 25);
      C = S - (S * rng.pick(MARGINS)) / 100;
    } else if (difficulty === "medium") {
      C = rng.int(10, 500);
      S = C + rng.int(1, C);
    } else {
      const cents = rng.int(500, 50000);
      C = cents / 100;
      S = (cents + rng.int(1, cents)) / 100;
    }
    values = { C, S };
    unit = "pct";
    const markupPct = ((S - C) * 100) / C;
    const marginPct = ((S - C) * 100) / S;
    if (kind === "markup") {
      exact = markupPct;
      const hint = easy ? " (Markup is profit as a percent of cost.)" : "";
      prompt = `An item costs ${cash(C)} and sells for ${cash(S)}. What is the markup percentage?${hint}${PCT_NOTE}${end}`;
      explanation =
        `Markup = profit / cost × 100.\n\n` +
        `\`(${num(S)} - ${num(C)}) / ${num(C)} × 100 = ${num(S - C)} / ${num(C)} × 100\` ${result(exact, rounded, unit)}`;
      candidates = [marginPct, S - C, (S * 100) / C]; // gave the margin, profit in dollars, price as % of cost
    } else {
      exact = marginPct;
      const hint = easy ? " (Margin is profit as a percent of the selling price.)" : "";
      prompt = `An item costs ${cash(C)} and sells for ${cash(S)}. What is the profit margin percentage?${hint}${PCT_NOTE}${end}`;
      explanation =
        `Margin = profit / selling price × 100.\n\n` +
        `\`(${num(S)} - ${num(C)}) / ${num(S)} × 100 = ${num(S - C)} / ${num(S)} × 100\` ${result(exact, rounded, unit)}`;
      candidates = [markupPct, S - C, (C * 100) / S]; // gave the markup, profit in dollars, cost as % of price
    }
  } else {
    // Hard only: price needed for a target margin.
    const C = rng.int(500, 50000) / 100;
    const g = rng.int(10, 60);
    exact = (C * 100) / (100 - g);
    unit = "money";
    values = { C, g };
    prompt = `An item costs ${cash(C)}. What selling price gives a ${g}% profit margin, in dollars?${end}`;
    explanation =
      `Margin is measured on the selling price, so cost = price × (1 - margin) and price = cost / (1 - margin).\n\n` +
      `\`${num(C)} / (1 - ${g} / 100) = ${num(C)} / ${num(1 - g / 100)}\` ${result(exact, rounded, unit)}`;
    candidates = [(C * (100 + g)) / 100, (C * (100 - g)) / 100, C + g]; // used it as a markup, subtracted, % as dollars
  }

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation,
    params: { kind, values, rounded },
  };
  return finish(base, exact, rounded, candidates, rng);
}

// Given values for the calculator: the numbers stated in the prompt, as they are written there
// (percentages as the plain percent number, e.g. 15 for "15%"). Built from params after the question
// is made, so it never touches the rng.
function givenFor(kind, k) {
  switch (kind) {
    case "of":
      return [["_percent", k.p], ["_amount", k.N]];
    case "change":
      return [["_old", k.A], ["_new", k.B]];
    case "original":
      return [["_percent", Math.abs(k.p)], ["_new_price", k.B]];
    case "simple-interest":
    case "simple-total":
    case "compound-total":
    case "compound-interest":
      return [["_principal", k.P], ["_rate", k.r], ["_years", k.t]];
    case "simple-rate":
      return [["_principal", k.P], ["_years", k.t], ["_interest", k.I]];
    case "price":
      return [["_cost", k.C], ["_markup", k.m]];
    case "markup":
    case "margin":
      return [["_cost", k.C], ["_price", k.S]];
    case "target":
      return [["_cost", k.C], ["_margin", k.g]];
    default:
      return [];
  }
}

function withGiven(q) {
  const p = q.params || {};
  const given = givenFor(p.kind, p.values || {})
    .filter(([, value]) => Number.isFinite(value))
    .map(([label, value]) => ({ label, value }));
  return given.length ? { ...q, given } : q;
}

function generateRaw(subtopic, difficulty, rng) {
  if (subtopic === "percentages") return genPercent(difficulty, rng);
  if (subtopic === "interest") return genInterest(difficulty, rng);
  if (subtopic === "margins") return genMargins(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

export function generate({ subtopic, difficulty, rng }) {
  return withGiven(generateRaw(subtopic, difficulty, rng));
}

// Independent check: work backwards from the answer (reverse the percent, re-apply the rate,
// rebuild compound growth year by year) and look at the residual. For rounded answers the
// allowed residual is 0.005 × (how strongly the check reacts to the answer).
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false; // regenerate from the seed to get params back

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;

  const k = p.values;
  let residual, sens;
  switch (p.kind) {
    case "of": // x is p% of N  <=>  100·x = p·N
      residual = x * 100 - k.p * k.N;
      sens = 100;
      break;
    case "change": // applying x% to the old price gives the new one
      if (!(k.A > 0)) return false;
      residual = k.A + (k.A * x) / 100 - k.B;
      sens = k.A / 100;
      break;
    case "original": {
      // applying the change to x gives the shown price
      const f = 1 + k.p / 100;
      if (!(f > 0)) return false;
      residual = x * f - k.B;
      sens = f;
      break;
    }
    case "simple-interest": // 100·I = P·r·t
      residual = x * 100 - k.P * k.r * k.t;
      sens = 100;
      break;
    case "simple-total": // 100·(A - P) = P·r·t
      residual = (x - k.P) * 100 - k.P * k.r * k.t;
      sens = 100;
      break;
    case "simple-rate": // P·r·t = 100·I
      if (!(k.P > 0 && k.t > 0)) return false;
      residual = k.P * x * k.t - 100 * k.I;
      sens = k.P * k.t;
      break;
    case "compound-total":
    case "compound-interest": {
      if (!Number.isInteger(k.t) || k.t < 1 || k.t > 100) return false;
      let amt = k.P;
      for (let y = 0; y < k.t; y++) amt += (amt * k.r) / 100; // year by year, no Math.pow
      residual = x - (p.kind === "compound-total" ? amt : amt - k.P);
      sens = 1;
      break;
    }
    case "price": // 100·(S - C) = C·m
      residual = (x - k.C) * 100 - k.C * k.m;
      sens = 100;
      break;
    case "markup": // C·(1 + x/100) = S
      if (!(k.C > 0)) return false;
      residual = k.C * (100 + x) - 100 * k.S;
      sens = k.C;
      break;
    case "margin": // S·(1 - x/100) = C
      if (!(k.S > 0)) return false;
      residual = k.S * (100 - x) - 100 * k.C;
      sens = k.S;
      break;
    case "target": // x·(1 - g/100) = C
      if (!(k.g < 100)) return false;
      residual = x * (100 - k.g) - 100 * k.C;
      sens = 100 - k.g;
      break;
    default:
      return false;
  }
  if (!Number.isFinite(residual)) return false;
  if (p.rounded) return Math.abs(residual) <= 0.005 * sens + 1e-6;
  return Number.isInteger(x) && Math.abs(residual) <= 1e-9;
}
