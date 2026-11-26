// Finance Theory generator. Uses only the seeded rng passed in by the engine.
// Subtopics: sources (internal/external × short/long term, ownership, choosing a source by a stated
// rule), risk-return (risk ladder, expected return and spread, a split portfolio), ratios (verdict
// and meaning of a ratio change, computing then interpreting, gross vs net margin diagnosis) and
// appraisal (payback, ARR, NPV: what each does, when to use it, a worked accept/reject decision,
// and conflicting rankings). Firms and people are made up; no country-specific law or tax.
// verify() rebuilds every answer from params with its own tables and arithmetic (payback by
// stepping month by month, NPV from its own discount table).

// Shared helpers

const segsOf = (c) => (Array.isArray(c) ? c.map(String) : String(c).split(" | "));
const keyOf = (t) => segsOf(t).join(" | ");
const diffCount = (a, b) => a.reduce((n, s, i) => n + (s !== b[i] ? 1 : 0), 0);

// A segmented choice: the right tuple plus wrong tuples that differ in 1..n-1 columns. Easy has
// exactly 3 options, other levels 5. `extraSegs` ([[column label, value]]) are Build-mode decoys:
// every value seen in the candidates (plus `extra`) that no option already shows in that column.
const OPTION_COUNT = { easy: 3, medium: 5, hard: 5, expert: 5 };
const MIN_DECOYS = { easy: 1, medium: 3, hard: 6, expert: 9 };
function segChoice(cols, correct, candidates, rng, diff, extra = []) {
  const n = cols.length;
  const want = OPTION_COUNT[diff];
  const seen = new Set([keyOf(correct)]);
  const wrong = [];
  for (const c of rng.shuffle(candidates)) {
    if (wrong.length >= want - 1) break;
    const d = c.length === n ? diffCount(c, correct) : 0;
    if (d < 1 || d >= n || seen.has(keyOf(c))) continue;
    seen.add(keyOf(c));
    wrong.push(c);
  }
  if (wrong.length !== want - 1) throw new Error("not enough segmented options");
  const shown = cols.map((_, i) => new Set([correct, ...wrong].map((t) => t[i])));
  const extraSegs = [];
  const add = (i, v) => { if (!shown[i].has(v)) { shown[i].add(v); extraSegs.push([cols[i], v]); } };
  for (const c of candidates) c.forEach((v, i) => add(i, v));
  for (const [col, v] of extra) add(cols.indexOf(col), v);
  return { answerType: "choice", choiceCols: cols, choices: rng.shuffle([correct, ...wrong]), answer: correct, extraSegs: extraSegs.slice(0, 14) };
}

function plainChoice(correct, candidates, rng, max = 4) {
  const wrong = rng.shuffle(candidates.filter((c) => c !== correct)).slice(0, max - 1);
  return { answerType: "choice", choices: rng.shuffle([correct, ...wrong]), answer: correct };
}

// Choice check shared by verify(): shape, distinct options, exactly one right, wrong options never
// differ in every column, and `answer` is that right option.
function choiceOk(q, answer, isRight) {
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length < 2 || ch.length > 6) return false;
  const tuples = ch.map(segsOf);
  const n = q.choiceCols ? q.choiceCols.length : 1;
  if (q.choiceCols && (n < 2 || n > 4)) return false;
  if (tuples.some((t) => t.length !== n)) return false;
  if (new Set(tuples.map((t) => t.join(" | "))).size !== tuples.length) return false;
  const right = tuples.filter((t) => isRight(t));
  if (right.length !== 1) return false;
  if (n > 1 && tuples.some((t) => diffCount(t, right[0]) === n)) return false;
  const a = segsOf(answer);
  if (a.length !== n || diffCount(a, right[0]) !== 0) return false;
  if (!q.choiceCols) return true;
  // Segmented: option count by level, enough Build decoys, and no other block combination right.
  const diff = q.params && q.params.diff;
  if (!OPTION_COUNT[diff] || tuples.length !== OPTION_COUNT[diff]) return false;
  const pools = q.choiceCols.map((_, i) => new Set(tuples.map((t) => t[i])));
  for (const [col, v] of Array.isArray(q.extraSegs) ? q.extraSegs : []) {
    const i = q.choiceCols.indexOf(col);
    if (i < 0 || typeof v !== "string" || !v) return false;
    pools[i].add(v);
  }
  const decoys = pools.reduce((s, p) => s + p.size - 1, 0);
  if (decoys < MIN_DECOYS[diff]) return false;
  let rightCombos = 0;
  const walk = (i, acc) => {
    if (i === n) { if (isRight(acc)) rightCombos++; return; }
    for (const v of pools[i]) walk(i + 1, [...acc, v]);
  };
  walk(0, []);
  return rightCombos === 1;
}

const eqT = (want) => (t) => t.length === want.length && diffCount(t, want) === 0;

const FIRMS = ["Brightway", "Northfield Food Co", "Kestrel Print", "Bluewater Tool Co", "Oakridge Hotel Group", "Pinecrest Freight", "Redfern Bakery", "Silverline Software", "Harbour Café Co", "Tallow & Wick", "Meadow Dairy", "Ironbridge Engineering"];
const PEOPLE = ["Ana", "Ben", "Chloe", "Dev", "Ella", "Femi", "Grace", "Hugo", "Isla", "Jon", "Kai", "Lena", "Max", "Nia", "Omar", "Priya"];

function checkDifficulty(d) {
  if (!["easy", "medium", "hard", "expert"].includes(d)) throw new Error(`unknown difficulty ${d}`);
}

const money = (n) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
const signed = (n) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US")}`;
const r1 = (x) => Math.round(x * 10 + 1e-9 * Math.sign(x)) / 10;
const r2 = (x) => Math.round(x * 100 + 1e-9 * Math.sign(x)) / 100;
// True when x sits (almost) exactly on a rounding half-step at `dp` decimals.
const onHalf = (x, dp) => { const s = Math.abs(x) * 10 ** dp; return Math.abs(s - Math.floor(s) - 0.5) < 1e-6; };
const art = (n) => (n === 80 || n === 8 || n === 18 || n === 11 ? "an" : "a");
const pctTxt = (x) => `${r1(x)}%`;

// ---------------------------------------------------------------------------------------------
// Sources of finance

const SRC = [
  { n: "Retained profit", io: "Internal", term: "Long term", own: false },
  { n: "Selling off excess inventory", io: "Internal", term: "Short term", own: false },
  { n: "Bank overdraft", io: "External", term: "Short term", own: false },
  { n: "Trade credit from suppliers", io: "External", term: "Short term", own: false },
  { n: "Debt factoring", io: "External", term: "Short term", own: false },
  { n: "Share issue", io: "External", term: "Long term", own: true },
  { n: "Venture capital", io: "External", term: "Long term", own: true },
  { n: "Long-term bank loan", io: "External", term: "Long term", own: false },
  { n: "Mortgage", io: "External", term: "Long term", own: false },
  { n: "Debentures (long-term bonds)", io: "External", term: "Long term", own: false },
];
const OWN = ["Gives up some ownership", "Owners keep full ownership"];
const SRC_HINTS = [
  "**Internal** finance comes from inside the business (its own profits or assets); **external** finance comes from outsiders (banks, suppliers, investors).",
  "**Short term** is for less than a year (day-to-day cash needs); **long term** is for more than a year (buying non-current assets, growth).",
];

// Hard: which source suits a stated need. Cases are decided by the rule in order:
// 1 need lasts weeks → overdraft; 2 enough retained profit → retained profit;
// 3 high gearing and owners open to new shareholders → share issue; 4 otherwise → long-term loan.
const SUIT = {
  short: ["Bank overdraft", "Need lasts only weeks"],
  retained: ["Retained profit", "Enough profit kept to pay"],
  shares: ["Share issue", "High gearing: avoid more debt"],
  loan: ["Long-term bank loan", "Low gearing, owners keep control"],
};

function genSources(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff === "easy" || diff === "medium") {
    const s = rng.pick(SRC);
    const own = OWN[s.own ? 0 : 1];
    const cols = diff === "easy" ? ["Source", "Term"] : ["Source", "Term", "Ownership"];
    const correct = diff === "easy" ? [s.io, s.term] : [s.io, s.term, own];
    const cands = [];
    for (const a of ["Internal", "External"]) for (const b of ["Short term", "Long term"]) for (const c of OWN) cands.push(diff === "easy" ? [a, b] : [a, b, c]);
    return {
      prompt: `${firm} is considering **${s.n.toLowerCase()}** as a source of finance. Classify it${diff === "medium" ? ", and say whether the owners give up any ownership" : ""}.`,
      ...segChoice(cols, correct, cands, rng, diff),
      explanation: `${s.n}: **${s.io.toLowerCase()}**, **${s.term.toLowerCase()}**${diff === "medium" ? `, and the owners **${s.own ? "give up some ownership" : "keep full ownership"}**` : ""}.`,
      hints: diff === "easy" ? SRC_HINTS : [...SRC_HINTS, "Only selling shares (or a stake to an investor) gives away ownership; lenders and suppliers do not become owners."],
      params: { diff, kind: diff === "easy" ? "src2" : "src3", src: s.n },
    };
  }
  // hard
  const c = rng.pick(["short", "retained", "shares", "loan"]);
  const need = rng.int(4, 60) * 1000;
  const weeks = rng.int(3, 10);
  const spare = c === "retained" ? need + rng.int(1, 20) * 1000 : rng.int(1, Math.max(1, need / 1000 - 1)) * 1000;
  const gearHigh = c === "shares" || c === "retained" ? true : c === "loan" ? false : rng.next() < 0.5;
  const open = c === "shares" || c === "retained" ? true : c === "loan" ? false : rng.next() < 0.5;
  const gearing = gearHigh ? rng.int(55, 75) : rng.int(10, 30);
  const what = c === "short" ? `**${money(need)} for ${weeks} weeks** to cover a gap between paying suppliers and being paid by customers` : `**${money(need)}** to buy new machinery that will last 10 years`;
  const sources = ["Bank overdraft", "Retained profit", "Share issue", "Long-term bank loan", "Debt factoring", "Venture capital"];
  const reasons = Object.values(SUIT).map((x) => x[1]).concat(["Quickest to arrange"]);
  const cands = [];
  for (const s of sources) for (const r of reasons) cands.push([s, r]);
  return {
    prompt: `${firm}, a private limited company, needs ${what}. It has **${money(spare)}** of retained profit available. Its gearing is **${gearing}%** (above 50% counts as high). The owners ${open ? "are happy to bring in new shareholders" : "want to keep full control of the company"}.\n\nUse this order: a need lasting weeks → overdraft; else enough retained profit → retained profit; else high gearing with owners open to new shareholders → share issue; else → long-term bank loan. Which source, and why?`,
    ...segChoice(["Best source", "Main reason"], SUIT[c], cands, rng, diff),
    explanation: `${c === "short" ? `The need lasts only ${weeks} weeks, so an **overdraft** fits.` : c === "retained" ? `It is long term, and ${money(spare)} of retained profit covers ${money(need)}: use **retained profit** (no interest, no new owners).` : c === "shares" ? `Long term, retained profit (${money(spare)}) is not enough, gearing is high at ${gearing}%, and the owners accept new shareholders: a **share issue**.` : `Long term, retained profit (${money(spare)}) is not enough, and gearing is only ${gearing}%, so the firm can borrow and the owners keep control: a **long-term bank loan**.`}`,
    hints: ["Go through the stated order one step at a time and stop at the first rule that applies.", "Compare the retained profit with the amount needed."],
    params: { diff, kind: "suit", need, weeks, spare, gearing, open, isShort: c === "short" },
  };
}

// ---------------------------------------------------------------------------------------------
// Risk and return

const LADDER = ["Bank savings account", "Government bonds", "Large-company bonds", "Shares in a large company", "Shares in a new start-up"];
const RISK_HINTS = ["The risk–return trade-off: investments with a higher expected return usually carry more risk.", "Rough order from safest to riskiest: savings account, government bonds, company bonds, large-company shares, start-up shares."];

function genRisk(diff, rng) {
  const person = rng.pick(PEOPLE);
  if (diff === "easy") {
    const i = rng.int(0, 3), j = rng.int(i + 1, 4);
    const pair = rng.shuffle([LADDER[i], LADDER[j]]);
    const cands = [];
    for (const a of pair) for (const b of pair) cands.push([a, b]);
    cands.push([LADDER[j], LADDER[i]]);
    return {
      prompt: `${person} is choosing between **${pair[0].toLowerCase()}** and **${pair[1].toLowerCase()}**. Using the **risk–return trade-off**, which is usually riskier, and which usually offers the higher expected return?`,
      ...segChoice(["Riskier", "Higher expected return"], [LADDER[j], LADDER[j]], cands, rng, diff),
      explanation: `**${LADDER[j]}** carries more risk, and investors expect a **higher return** to compensate for it.`,
      hints: RISK_HINTS,
      params: { diff, kind: "ladder", i, j },
    };
  }
  if (diff === "medium") {
    const gA = rng.int(4, 20), bA = rng.int(-10, 4), gB = rng.int(4, 20), bB = rng.int(-10, 4);
    const avgA = (gA + bA) / 2, avgB = (gB + bB) / 2;
    if (gA - bA === gB - bB || avgA === avgB) return genRisk(diff, rng);
    const risky = gA - bA > gB - bB ? "Fund A" : "Fund B";
    const vals = (g, b) => [pctTxt((g + b) / 2), pctTxt(g + b), pctTxt(g - b), pctTxt(g)];
    const cands = [];
    for (const a of vals(gA, bA)) for (const b of vals(gB, bB)) for (const r of ["Fund A", "Fund B"]) cands.push([a, b, r]);
    return {
      prompt: `${person} compares two funds. A good year and a bad year are equally likely.\n\n- **Fund A**: good year ${gA}%, bad year ${bA}%\n- **Fund B**: good year ${gB}%, bad year ${bB}%\n\nFind each fund's average (expected) return, and which fund is riskier (the wider range between good and bad years).`,
      ...segChoice(["Fund A average", "Fund B average", "Riskier fund"], [pctTxt(avgA), pctTxt(avgB), risky], cands, rng, diff),
      explanation: `- Fund A: (${gA} + ${bA}) ÷ 2 = **${pctTxt(avgA)}**, range ${gA - bA} points\n- Fund B: (${gB} + ${bB}) ÷ 2 = **${pctTxt(avgB)}**, range ${gB - bB} points\n- The wider range is **${risky}**, so it is riskier.`,
      hints: ["With two equally likely outcomes, the expected return is their average.", "Risk here is the spread: good-year return minus bad-year return."],
      given: [{ label: "_goodA", value: gA }, { label: "_badA", value: bA }, { label: "_goodB", value: gB }, { label: "_badB", value: bB }],
      params: { diff, kind: "avg", gA, bA, gB, bB },
    };
  }
  const p = rng.pick([20, 30, 40, 60, 70, 80]);
  const gA = rng.int(6, 25), bA = rng.int(-15, 3), gB = rng.int(6, 25), bB = rng.int(-15, 3);
  const eA = (p * gA + (100 - p) * bA) / 100, eB = (p * gB + (100 - p) * bB) / 100;
  if (bA === bB || r1(eA) === r1(eB) || onHalf(eA, 1) || onHalf(eB, 1)) return genRisk(diff, rng);
  if (diff === "hard") {
    const cautious = bA > bB ? "Fund A" : "Fund B";
    const vals = (g, b) => [pctTxt((p * g + (100 - p) * b) / 100), pctTxt((g + b) / 2), pctTxt(((100 - p) * g + p * b) / 100), pctTxt(g)];
    const cands = [];
    for (const a of vals(gA, bA)) for (const b of vals(gB, bB)) for (const r of ["Fund A", "Fund B"]) cands.push([a, b, r]);
    const want = [pctTxt(eA), pctTxt(eB), cautious];
    if (new Set(vals(gA, bA)).size < 4 || new Set(vals(gB, bB)).size < 4) return genRisk(diff, rng);
    return {
      prompt: `${person} compares two funds. There is ${art(p)} **${p}%** chance of a good year and ${art(100 - p)} **${100 - p}%** chance of a bad year.\n\n- **Fund A**: good year ${gA}%, bad year ${bA}%\n- **Fund B**: good year ${gB}%, bad year ${bB}%\n\nFind each fund's expected return (1 decimal place). A cautious investor picks the fund with the better **worst case**: which is that?`,
      ...segChoice(["Fund A expected", "Fund B expected", "Cautious choice"], want, cands, rng, diff),
      explanation: `- Fund A: ${p}% × ${gA} + ${100 - p}% × ${bA} = **${pctTxt(eA)}**\n- Fund B: ${p}% × ${gB} + ${100 - p}% × ${bB} = **${pctTxt(eB)}**\n- Worst cases: A ${bA}%, B ${bB}%, so the cautious choice is **${cautious}**.`,
      hints: ["Expected return = probability × good-year return + probability × bad-year return.", "The worst case is simply the bad-year return."],
      given: [{ label: "_p", value: p / 100 }, { label: "_goodA", value: gA }, { label: "_badA", value: bA }, { label: "_goodB", value: gB }, { label: "_badB", value: bB }],
      params: { diff, kind: "expected", p, gA, bA, gB, bB },
    };
  }
  // expert: diversification into a split portfolio
  const w = rng.pick([20, 25, 40, 50, 60, 75, 80]);
  const goodP = (w * gA + (100 - w) * gB) / 100, badP = (w * bA + (100 - w) * bB) / 100;
  const eP = (p * goodP + (100 - p) * badP) / 100;
  const floor = rng.int(-8, 2);
  if (onHalf(eP, 1) || onHalf(badP, 1) || Math.abs(badP - floor) < 0.5) return genRisk(diff, rng);
  return {
    prompt: `${person} puts **${w}%** of their savings in Fund A and **${100 - w}%** in Fund B. There is ${art(p)} **${p}%** chance of a good year and ${art(100 - p)} **${100 - p}%** chance of a bad year.\n\n- **Fund A**: good year ${gA}%, bad year ${bA}%\n- **Fund B**: good year ${gB}%, bad year ${bB}%\n\n${person} will not accept a bad-year return below **${floor}%**.`,
    answerType: "multi",
    parts: [
      { id: "expected", label: "Expected", ask: "Expected return of the portfolio, in % (1 decimal place)?", answerType: "number", answer: r1(eP), tolerance: 0.05, hint: "First find the portfolio's return in a good year and in a bad year (weighted by the split), then weight those by the probabilities." },
      { id: "worst", label: "Bad year", ask: "Portfolio return in a bad year, in % (1 decimal place)?", answerType: "number", answer: r1(badP), tolerance: 0.05, hint: "Weight each fund's bad-year return by the share of savings in it." },
      { id: "ok", label: "Acceptable", ask: `Is the bad-year return at least ${floor}%?`, answerType: "choice", answer: badP >= floor ? "Yes" : "No", choices: ["Yes", "No"], hint: "Compare your bad-year figure with the limit." },
    ],
    explanation: `- Good year: ${w}% × ${gA} + ${100 - w}% × ${gB} = ${r2(goodP)}%\n- Bad year: ${w}% × ${bA} + ${100 - w}% × ${bB} = **${r1(badP)}%**\n- Expected: ${p}% × ${r2(goodP)} + ${100 - p}% × ${r2(badP)} = **${r1(eP)}%**\n- ${r1(badP)}% is ${badP >= floor ? "at least" : "below"} ${floor}%: **${badP >= floor ? "Yes" : "No"}**. Spreading money across funds narrows the range of outcomes.`,
    given: [{ label: "_w", value: w / 100 }, { label: "_p", value: p / 100 }, { label: "_goodA", value: gA }, { label: "_badA", value: bA }, { label: "_goodB", value: gB }, { label: "_badB", value: bB }],
    params: { diff, kind: "portfolio", p, w, gA, bA, gB, bB, floor },
  };
}

// ---------------------------------------------------------------------------------------------
// Ratio interpretation

// up: true when a rise is better. Ranges keep every reading uncontroversial (liquidity ratios stay
// below 2, where a rise is an improvement).
const RATIOS = [
  { n: "Gross profit margin", up: true, lo: 15, hi: 60, fmt: "pct", good: "More gross profit per $ of sales", bad: "Less gross profit per $ of sales" },
  { n: "Net profit margin", up: true, lo: 3, hi: 25, fmt: "pct", good: "More net profit per $ of sales", bad: "Less net profit per $ of sales" },
  { n: "Current ratio", up: true, lo: 0.6, hi: 1.9, fmt: "x", good: "Better able to pay short-term debts", bad: "Less able to pay short-term debts" },
  { n: "Acid test ratio", up: true, lo: 0.4, hi: 1.0, fmt: "x", good: "Better able to pay without selling stock", bad: "Less able to pay without selling stock" },
  { n: "Gearing", up: false, lo: 15, hi: 70, fmt: "pct", good: "Less reliance on borrowing", bad: "More reliance on borrowing" },
  { n: "Receivables days", up: false, lo: 20, hi: 75, fmt: "days", good: "Customers pay more quickly", bad: "Customers pay more slowly" },
  { n: "Inventory days", up: false, lo: 15, hi: 90, fmt: "days", good: "Stock sells more quickly", bad: "Stock sells more slowly" },
  { n: "Return on capital employed", up: true, lo: 5, hi: 30, fmt: "pct", good: "More profit per $ of capital", bad: "Less profit per $ of capital" },
];
const fmtR = (r, v) => (r.fmt === "pct" ? `${r1(v).toFixed(1)}%` : r.fmt === "x" ? `${r2(v).toFixed(2)}:1` : `${Math.round(v)} days`);
const VERDICT = ["Better", "Worse"];
const RATIO_HINTS = [
  "Higher margins and ROCE are better. For liquidity ratios (current, acid test) below about 2, higher is better.",
  "For gearing, receivables days and inventory days, lower is better: less debt, faster cash collection, faster-selling stock.",
];

function drawRatio(rng, r) {
  const step = r.fmt === "x" ? 0.05 : 1;
  const n = Math.round((r.hi - r.lo) / step);
  const a = rng.int(0, n), b0 = rng.int(0, n - 1);
  const b = b0 >= a ? b0 + 1 : b0;
  return [r.lo + a * step, r.lo + b * step].map((v) => (r.fmt === "x" ? r2(v) : v));
}

function genRatios(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    const ri = rng.int(0, RATIOS.length - 1);
    const r = RATIOS[ri];
    const [v1, v2] = drawRatio(rng, r);
    const better = (v2 > v1) === r.up;
    const cands = [];
    for (const v of VERDICT) for (const x of [r.good, r.bad]) cands.push([v, x]);
    return {
      prompt: `${firm}'s **${r.n.toLowerCase()}** changed from **${fmtR(r, v1)}** last year to **${fmtR(r, v2)}** this year. Is this better or worse, and what does it mean?`,
      ...segChoice(["Verdict", "Meaning"], [better ? "Better" : "Worse", better ? r.good : r.bad], cands, rng, diff),
      explanation: `The ratio ${v2 > v1 ? "rose" : "fell"}. For ${r.n.toLowerCase()}, ${r.up ? "higher" : "lower"} is better, so this is **${better ? "better" : "worse"}**: ${(better ? r.good : r.bad).toLowerCase()}.`,
      hints: RATIO_HINTS,
      params: { diff, kind: "ratio", ri, v1, v2 },
    };
  }
  if (diff === "medium") {
    // Compute this year's ratio from figures, then interpret.
    const k = rng.pick(["gpm", "cur", "gear", "recv", "roce"]);
    let ri, v2, figs, wrongs, formula;
    if (k === "gpm") {
      ri = 0; const rev = rng.int(20, 90) * 1000, gp = Math.round(rev * rng.int(18, 55) / 100 / 100) * 100;
      v2 = (gp / rev) * 100; figs = `revenue ${money(rev)}, gross profit ${money(gp)}`; wrongs = [(rev / gp) * 100, ((rev - gp) / rev) * 100]; formula = `${money(gp)} ÷ ${money(rev)} × 100`;
    } else if (k === "cur") {
      ri = 2; const cl = rng.int(10, 60) * 1000, ca = Math.round(cl * rng.int(65, 190) / 100 / 1000) * 1000;
      v2 = ca / cl; figs = `current assets ${money(ca)}, current liabilities ${money(cl)}`; wrongs = [cl / ca, (ca - cl) / cl]; formula = `${money(ca)} ÷ ${money(cl)}`;
    } else if (k === "gear") {
      ri = 4; const ce = rng.int(50, 400) * 1000, ncl = Math.round(ce * rng.int(15, 70) / 100 / 1000) * 1000;
      v2 = (ncl / ce) * 100; figs = `non-current liabilities ${money(ncl)}, capital employed ${money(ce)}`; wrongs = [(ce / ncl) * 100, ((ce - ncl) / ce) * 100]; formula = `${money(ncl)} ÷ ${money(ce)} × 100`;
    } else if (k === "recv") {
      ri = 5; const rev = rng.int(100, 900) * 1000, rec = Math.round(rev * rng.int(20, 75) / 365 / 1000) * 1000;
      v2 = (rec / rev) * 365; figs = `credit sales ${money(rev)} for the year, trade receivables ${money(rec)}`; wrongs = [(rec / rev) * 100, (rev / rec)]; formula = `${money(rec)} ÷ ${money(rev)} × 365`;
    } else {
      ri = 7; const ce = rng.int(50, 400) * 1000, op = Math.round(ce * rng.int(5, 30) / 100 / 100) * 100;
      v2 = (op / ce) * 100; figs = `operating profit ${money(op)}, capital employed ${money(ce)}`; wrongs = [(ce / op), ((op / ce) * 100) / 2]; formula = `${money(op)} ÷ ${money(ce)} × 100`;
    }
    const r = RATIOS[ri];
    const shown = fmtR(r, v2);
    const dp = r.fmt === "pct" ? 1 : r.fmt === "x" ? 2 : 0;
    let v1 = r.fmt === "x" ? r2(v2 + rng.pick([-1, 1]) * rng.int(2, 6) * 0.05) : Math.round(v2) + rng.pick([-1, 1]) * rng.int(2, 9);
    if (v1 <= 0 || (r.fmt === "x" && v1 > 1.95) || onHalf(v2, dp) || fmtR(r, v1) === shown) return genRatios(diff, rng);
    const better = (v2 > v1) === r.up;
    const vals = [shown, ...wrongs.map((w) => fmtR(r, w)), fmtR(r, v1)];
    if (new Set(vals).size !== vals.length) return genRatios(diff, rng);
    const cands = [];
    for (const v of vals) for (const vv of VERDICT) for (const x of [r.good, r.bad]) cands.push([v, vv, x]);
    return {
      prompt: `Last year ${firm}'s **${r.n.toLowerCase()}** was **${fmtR(r, v1)}**. This year: ${figs}. Work out this year's ${r.n.toLowerCase()} (${r.fmt === "pct" ? "1 decimal place" : r.fmt === "x" ? "2 decimal places" : "whole days"}) and interpret the change.`,
      ...segChoice(["This year", "Verdict", "Meaning"], [shown, better ? "Better" : "Worse", better ? r.good : r.bad], cands, rng, diff),
      explanation: `- ${r.n}: ${formula} = **${shown}**\n- Last year ${fmtR(r, v1)}: it ${v2 > v1 ? "rose" : "fell"}, and ${r.up ? "higher" : "lower"} is better, so **${better ? "better" : "worse"}**: ${(better ? r.good : r.bad).toLowerCase()}.`,
      hints: [`${r.n} = ${k === "gpm" ? "gross profit ÷ revenue × 100" : k === "cur" ? "current assets ÷ current liabilities" : k === "gear" ? "non-current liabilities ÷ capital employed × 100" : k === "recv" ? "trade receivables ÷ credit sales × 365" : "operating profit ÷ capital employed × 100"}.`, ...RATIO_HINTS],
      params: { diff, kind: "ratiocalc", k, figs, v1, ri },
    };
  }
  // hard / expert: gross and net margins together → cause
  const gp1 = rng.int(25, 55), np1 = rng.int(5, Math.min(20, gp1 - 8));
  const c = rng.int(0, 3); // 0 overheads up, 1 overheads down, 2 cost of sales up / prices cut, 3 cheaper supplies / higher prices
  const d = rng.int(2, 6);
  const gp2 = c < 2 ? gp1 : c === 2 ? gp1 - d : gp1 + d;
  const np2 = c === 0 || c === 2 ? np1 - d : np1 + d;
  if (np2 <= 0) return genRatios(diff, rng);
  const CAUSES = ["Overheads rose relative to sales", "Overheads fell relative to sales", "Cost of sales rose or prices cut", "Cheaper supplies or higher prices"];
  const gv = gp2 === gp1 ? "Unchanged" : gp2 > gp1 ? "Better" : "Worse";
  const nv = np2 > np1 ? "Better" : "Worse";
  if (diff === "hard") {
    const cands = [];
    for (const a of ["Better", "Worse", "Unchanged"]) for (const b of ["Better", "Worse", "Unchanged"]) for (const x of CAUSES) cands.push([a, b, x]);
    return {
      prompt: `${firm}'s **gross profit margin** went from **${gp1}%** to **${gp2}%**, and its **net profit margin** from **${np1}%** to **${np2}%**. Judge each margin, and give the most likely cause.`,
      ...segChoice(["Gross margin", "Net margin", "Likely cause"], [gv, nv, CAUSES[c]], cands, rng, diff),
      explanation: `Gross margin: **${gv.toLowerCase()}**. Net margin: **${nv.toLowerCase()}**. ${c < 2 ? `The gross margin did not move, so the change happened **below gross profit**: overheads (expenses) ${c === 0 ? "rose" : "fell"} relative to sales.` : `Both margins moved by the same ${d} points, so the change happened **in gross profit**: ${c === 2 ? "cost of sales rose or prices were cut" : "supplies got cheaper or prices went up"}.`}`,
      hints: ["Gross profit = revenue − cost of sales. Net profit = gross profit − overheads (expenses).", "If only the net margin moves, look at overheads. If both move by the same amount, look at cost of sales or prices."],
      params: { diff, kind: "margins", gp1, gp2, np1, np2 },
    };
  }
  // expert: compute this year's margins from figures, then diagnose
  const rev = rng.int(10, 90) * 10000;
  const gpAmt = (rev * gp2) / 100, npAmt = (rev * np2) / 100;
  return {
    prompt: `Last year ${firm} had a gross profit margin of **${gp1}%** and a net profit margin of **${np1}%**. This year: revenue **${money(rev)}**, cost of sales **${money(rev - gpAmt)}**, overheads **${money(gpAmt - npAmt)}**.`,
    answerType: "multi",
    parts: [
      { id: "gpm", label: "Gross margin", ask: "This year's gross profit margin, in % (1 decimal place)?", answerType: "number", answer: r1(gp2), tolerance: 0.05, hint: "Gross profit = revenue − cost of sales; divide by revenue × 100." },
      { id: "npm", label: "Net margin", ask: "This year's net profit margin, in % (1 decimal place)?", answerType: "number", answer: r1(np2), tolerance: 0.05, hint: "Net profit = gross profit − overheads; divide by revenue × 100." },
      { id: "cause", label: "Cause", ask: "What is the most likely cause of the change?", answerType: "choice", answer: CAUSES[c], choices: CAUSES.slice(), hint: "Did the gross margin move? If not, the change is in the overheads." },
    ],
    explanation: `- Gross profit: ${money(rev)} − ${money(rev - gpAmt)} = ${money(gpAmt)}; margin **${gp2}%** (was ${gp1}%)\n- Net profit: ${money(gpAmt)} − ${money(gpAmt - npAmt)} = ${money(npAmt)}; margin **${np2}%** (was ${np1}%)\n- Cause: **${CAUSES[c].toLowerCase()}**.`,
    given: [{ label: "_revenue", value: rev }, { label: "_cos", value: rev - gpAmt }, { label: "_overheads", value: gpAmt - npAmt }],
    params: { diff, kind: "marginsx", gp1, np1, rev, cos: rev - gpAmt, oh: gpAmt - npAmt },
  };
}

// ---------------------------------------------------------------------------------------------
// Investment appraisal

const METHODS = ["Payback", "ARR", "NPV"];
const TVM = { Payback: "No", ARR: "No", NPV: "Yes" };
const M_DESC = {
  Payback: ["measures how long it takes for the project's cash inflows to repay the money invested", "counts the years until cumulative net cash flow reaches zero"],
  ARR: ["expresses average yearly profit as a percentage of the investment", "compares the average annual return with a target percentage"],
  NPV: ["discounts every future cash flow to today's value and subtracts the investment", "adds up discounted cash flows using a chosen discount rate"],
};
const STRENGTH = { Payback: "Quick and easy to understand", ARR: "Uses profit over the whole life", NPV: "Allows for time value of money" };
const WEAKNESS = { Payback: "Ignores cash after payback", ARR: "Ignores when returns arrive", NPV: "Needs an estimated discount rate" };
const PRIORITY = {
  Payback: ["Cash is tight, so the owners care most about getting their money back quickly.", "The market changes fast, so the managers want to know how soon the risk is over."],
  ARR: ["The board sets a target: every project must earn an average yearly return of at least 15% on the money invested.", "The owners want a single percentage to compare with the return on their other investments."],
  NPV: ["The project lasts 15 years, so the managers want to allow for money received later being worth less.", "The firm wants to know how much value, in today's money, the project adds."],
};
const APP_HINTS = ["Payback = time to get the investment back. ARR = average yearly profit ÷ investment × 100. NPV = discounted cash flows − investment.", "Only NPV (of these three) allows for the time value of money."];

const DF = { 8: [0.926, 0.857, 0.794, 0.735, 0.681], 10: [0.909, 0.826, 0.751, 0.683, 0.621], 12: [0.893, 0.797, 0.712, 0.636, 0.567] };

function paybackMonths(I, flows) {
  let left = I;
  for (let y = 0; y < flows.length; y++) {
    if (flows[y] >= left) return y * 12 + (left / flows[y]) * 12;
    left -= flows[y];
  }
  return null;
}
const pbTxt = (m) => {
  const y = Math.floor(m / 12), mo = Math.round(m - y * 12);
  return `${y} year${y === 1 ? "" : "s"}${mo ? ` ${mo} months` : ""}`;
};
const npvOf = (I, flows, df) => Math.round(flows.reduce((s, f, i) => s + f * df[i], 0) - I);

function project(rng) {
  const flows = Array.from({ length: 5 }, () => rng.int(2, 10) * 4000);
  const k = rng.int(1, 3); // payback falls in year k+1
  const m = rng.pick([0, 3, 6, 9]);
  const I = flows.slice(0, k).reduce((a, b) => a + b, 0) + (flows[k] * m) / 12;
  return { flows, I };
}

function genAppraisal(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    const m = rng.pick(METHODS);
    const di = rng.int(0, 1);
    const cands = [];
    for (const x of METHODS) for (const t of ["Yes", "No"]) cands.push([x, t]);
    return {
      prompt: `${firm} uses an investment appraisal method that ${M_DESC[m][di]}. Which method is it, and does it allow for the **time value of money**?`,
      ...segChoice(["Method", "Time value of money"], [m, TVM[m]], cands, rng, diff),
      explanation: `This is **${m}**, which ${TVM[m] === "Yes" ? "**does** allow for the time value of money (it discounts future cash)" : "does **not** allow for the time value of money"}.`,
      hints: APP_HINTS,
      params: { diff, kind: "method", m, di },
    };
  }
  if (diff === "medium") {
    const m = rng.pick(METHODS);
    const pi = rng.int(0, 1);
    const cands = [];
    for (const x of METHODS) for (const s of METHODS) for (const w of METHODS) cands.push([x, STRENGTH[s], WEAKNESS[w]]);
    return {
      prompt: `${firm} is choosing how to appraise a new project. ${PRIORITY[m][pi]} Which appraisal method suits this best, with its main strength and weakness?`,
      ...segChoice(["Method", "Strength", "Weakness"], [m, STRENGTH[m], WEAKNESS[m]], cands, rng, diff),
      explanation: `**${m}** fits. Strength: ${STRENGTH[m].toLowerCase()}. Weakness: ${WEAKNESS[m].toLowerCase()}.`,
      hints: APP_HINTS,
      params: { diff, kind: "priority", m, pi },
    };
  }
  const rate = rng.pick([8, 10, 12]);
  const df = DF[rate];
  if (diff === "hard") {
    const { flows, I } = project(rng);
    const pb = paybackMonths(I, flows);
    const npv = npvOf(I, flows, df);
    const target = rng.int(2, 4);
    if (Math.abs(npv) < I * 0.04 || pb === target * 12) return genAppraisal(diff, rng);
    const accept = pb <= target * 12 && npv > 0;
    const undisc = flows.reduce((a, b) => a + b, 0) - I;
    const pbs = [pbTxt(pb), pbTxt(pb + 12), pb >= 24 ? pbTxt(pb - 12) : pbTxt(pb + 24), pbTxt(pb % 12 === 6 ? pb + 3 : pb + 6)];
    const npvs = [signed(npv), signed(undisc), signed(-npv), signed(npv + I)];
    if (new Set(pbs).size < 4 || new Set(npvs).size < 4) return genAppraisal(diff, rng);
    const cands = [];
    for (const a of pbs) for (const b of npvs) for (const c of ["Accept", "Reject"]) cands.push([a, b, c]);
    return {
      prompt: `${firm} is appraising a machine costing **${money(I)}**. Net cash inflows (years 1–5): ${flows.map(money).join(", ")}, received evenly through each year. Discount factors at ${rate}%: ${df.join(", ")}.\n\nThe firm accepts a project only if the **payback** is within **${target} years** and the **NPV** is positive. Find the payback, the NPV (nearest $) and the decision.`,
      ...segChoice(["Payback", "NPV", "Decision"], [pbTxt(pb), signed(npv), accept ? "Accept" : "Reject"], cands, rng, diff),
      explanation: `- Payback: cumulative inflows reach ${money(I)} after **${pbTxt(pb)}**\n- NPV: ${flows.map((f, i) => `${f} × ${df[i]}`).join(" + ")} − ${I} = **${signed(npv)}**\n- ${pb <= target * 12 ? "Payback is within" : "Payback is outside"} ${target} years and the NPV is ${npv > 0 ? "positive" : "negative"}: **${accept ? "Accept" : "Reject"}**`,
      hints: ["Payback: add the inflows year by year until they cover the cost; for part of a year, months = amount still needed ÷ that year's inflow × 12.", "NPV: multiply each year's inflow by its discount factor, add them up, then subtract the cost."],
      given: [{ label: "_cost", value: I }, ...flows.map((f, i) => ({ label: `_y${i + 1}`, value: f }))],
      params: { diff, kind: "appraise", I, flows, rate, target },
    };
  }
  // expert: two projects ranked differently by payback and NPV
  const A = project(rng), B = project(rng);
  B.I = A.I;
  const pbA = paybackMonths(A.I, A.flows), pbB = paybackMonths(B.I, B.flows);
  const nA = npvOf(A.I, A.flows, df), nB = npvOf(B.I, B.flows, df);
  if (pbA === null || pbB === null || !(pbA < pbB) || !(nB > nA + 500) || nB <= 0) return genAppraisal(diff, rng);
  return {
    prompt: `${firm} can afford only one of two projects, each costing **${money(A.I)}**. Net cash inflows for years 1–5 (received evenly):\n\n- **Project A**: ${A.flows.map(money).join(", ")}\n- **Project B**: ${B.flows.map(money).join(", ")}\n\nDiscount factors at ${rate}%: ${df.join(", ")}.`,
    answerType: "multi",
    parts: [
      { id: "payback", label: "Payback", ask: "Which project does the payback method prefer?", answerType: "choice", answer: "Project A", choices: ["Project A", "Project B"], hint: "Find how long each project takes to repay its cost; shorter is preferred." },
      { id: "npvb", label: "NPV of B", ask: "What is Project B's NPV, to the nearest $?", answerType: "number", answer: nB, tolerance: 0.5, hint: "Multiply each of B's inflows by the discount factor for that year, add them, and subtract the cost." },
      { id: "choose", label: "Decision", ask: "Which project adds the most value for the owners?", answerType: "choice", answer: "Project B", choices: ["Project A", "Project B"], hint: "Compare the NPVs: the higher NPV adds more value in today's money." },
    ],
    explanation: `- Payback: A **${pbTxt(pbA)}**, B ${pbTxt(pbB)}, so payback prefers **Project A**\n- NPV of A: ${signed(nA)}; NPV of B: ${B.flows.map((f, i) => `${f} × ${df[i]}`).join(" + ")} − ${B.I} = **${signed(nB)}**\n- NPV allows for the time value of money and all cash flows, so **Project B** adds the most value.`,
    given: [{ label: "_cost", value: A.I }],
    params: { diff, kind: "rank", I: A.I, a: A.flows, b: B.flows, rate },
  };
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  checkDifficulty(difficulty);
  switch (subtopic) {
    case "sources": if (difficulty === "expert") break; return genSources(difficulty, rng);
    case "risk-return": return genRisk(difficulty, rng);
    case "ratios": return genRatios(difficulty, rng);
    case "appraisal": return genAppraisal(difficulty, rng);
  }
  throw new Error(`unknown subtopic/difficulty ${subtopic}/${difficulty}`);
}

// ---------------------------------------------------------------------------------------------
// verify(): own tables and arithmetic

const V_SRC = {
  internal: ["Retained profit", "Selling off excess inventory"],
  short: ["Selling off excess inventory", "Bank overdraft", "Trade credit from suppliers", "Debt factoring"],
  equity: ["Share issue", "Venture capital"],
};
const V_BETTER_UP = { "Gross profit margin": true, "Net profit margin": true, "Current ratio": true, "Acid test ratio": true, Gearing: false, "Receivables days": false, "Inventory days": false, "Return on capital employed": true };

// Payback by stepping through each month of even cash flow.
function vPayback(I, flows) {
  let cum = 0;
  for (let y = 0; y < flows.length; y++) {
    for (let mo = 1; mo <= 12; mo++) {
      cum += flows[y] / 12;
      if (cum >= I - 1e-6) return { y, mo, exact: Math.abs(cum - I) < 1e-6 };
    }
  }
  return null;
}
function vPbTxt(pb) {
  const total = pb.y * 12 + pb.mo;
  const y = Math.floor(total / 12), mo = total % 12;
  return `${y} year${y === 1 ? "" : "s"}${mo ? ` ${mo} months` : ""}`;
}
const V_DF = { 8: [0.926, 0.857, 0.794, 0.735, 0.681], 10: [0.909, 0.826, 0.751, 0.683, 0.621], 12: [0.893, 0.797, 0.712, 0.636, 0.567] };
function vNpv(I, flows, rate) {
  let s = -I;
  flows.forEach((f, i) => { s += Math.round(f * V_DF[rate][i] * 1000) / 1000; });
  return Math.round(s);
}
const vMoney = (n) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US")}`;
const vPct = (x) => `${Math.round(x * 10) / 10}%`;

function expected(p) {
  switch (p.kind) {
    case "src2":
    case "src3": {
      const t = [V_SRC.internal.includes(p.src) ? "Internal" : "External", V_SRC.short.includes(p.src) ? "Short term" : "Long term"];
      if (p.kind === "src3") t.push(V_SRC.equity.includes(p.src) ? "Gives up some ownership" : "Owners keep full ownership");
      return t;
    }
    case "suit": {
      if (p.isShort) return ["Bank overdraft", "Need lasts only weeks"];
      if (p.spare >= p.need) return ["Retained profit", "Enough profit kept to pay"];
      if (p.gearing > 50 && p.open) return ["Share issue", "High gearing: avoid more debt"];
      if (p.gearing <= 50 && !p.open) return ["Long-term bank loan", "Low gearing, owners keep control"];
      return null; // a mixed case would make the reason wording untrue
    }
    case "ladder": return [LADDER[p.j], LADDER[p.j]].every(Boolean) && p.j > p.i ? [LADDER[p.j], LADDER[p.j]] : null;
    case "avg": {
      if (p.gA - p.bA === p.gB - p.bB) return null;
      return [vPct((p.gA + p.bA) / 2), vPct((p.gB + p.bB) / 2), p.gA - p.bA > p.gB - p.bB ? "Fund A" : "Fund B"];
    }
    case "expected": {
      if (p.bA === p.bB) return null;
      const e = (g, b) => (g * p.p + b * (100 - p.p)) / 100;
      return [vPct(e(p.gA, p.bA)), vPct(e(p.gB, p.bB)), p.bA > p.bB ? "Fund A" : "Fund B"];
    }
    case "ratio": {
      const r = RATIOS[p.ri];
      const good = (p.v2 > p.v1) === V_BETTER_UP[r.n];
      return [good ? "Better" : "Worse", good ? r.good : r.bad];
    }
    case "ratiocalc": {
      const r = RATIOS[p.ri];
      const nums = (p.figs.match(/\$[\d,]+/g) || []).map((s) => Number(s.slice(1).replace(/,/g, "")));
      if (nums.length !== 2) return null;
      const [x, y] = nums;
      const v = { gpm: (y / x) * 100, cur: x / y, gear: (x / y) * 100, recv: (y / x) * 365, roce: (x / y) * 100 }[p.k];
      const shown = r.fmt === "pct" ? `${(Math.round(v * 10) / 10).toFixed(1)}%` : r.fmt === "x" ? `${(Math.round(v * 100) / 100).toFixed(2)}:1` : `${Math.round(v)} days`;
      const good = (v > p.v1) === V_BETTER_UP[r.n];
      return [shown, good ? "Better" : "Worse", good ? r.good : r.bad];
    }
    case "margins": {
      const judge = (a, b) => (a === b ? "Unchanged" : b > a ? "Better" : "Worse");
      const dg = p.gp2 - p.gp1, dn = p.np2 - p.np1;
      let cause = null;
      if (dg === 0 && dn < 0) cause = "Overheads rose relative to sales";
      else if (dg === 0 && dn > 0) cause = "Overheads fell relative to sales";
      else if (dg < 0 && dn === dg) cause = "Cost of sales rose or prices cut";
      else if (dg > 0 && dn === dg) cause = "Cheaper supplies or higher prices";
      return cause ? [judge(p.gp1, p.gp2), judge(p.np1, p.np2), cause] : null;
    }
    case "method": return [p.m, p.m === "NPV" ? "Yes" : "No"];
    case "priority": return [p.m, { Payback: "Quick and easy to understand", ARR: "Uses profit over the whole life", NPV: "Allows for time value of money" }[p.m], { Payback: "Ignores cash after payback", ARR: "Ignores when returns arrive", NPV: "Needs an estimated discount rate" }[p.m]];
    case "appraise": {
      const pb = vPayback(p.I, p.flows);
      if (!pb) return null;
      const npv = vNpv(p.I, p.flows, p.rate);
      const months = pb.y * 12 + pb.mo;
      return [vPbTxt(pb), vMoney(npv), months <= p.target * 12 && npv > 0 ? "Accept" : "Reject"];
    }
    default: return null;
  }
}

function numNear(a, b, tol) {
  const n = typeof a === "number" ? a : Number(String(a).trim());
  return Number.isFinite(n) && Math.abs(n - b) <= tol + 1e-9;
}

function multiExpected(p) {
  if (p.kind === "portfolio") {
    // Outcome by outcome: each scenario's portfolio return, then weight by probability.
    const good = (p.gA * p.w + p.gB * (100 - p.w)) / 100;
    const bad = (p.bA * p.w + p.bB * (100 - p.w)) / 100;
    const e = good * (p.p / 100) + bad * (1 - p.p / 100);
    return { expected: [e, 1], worst: [bad, 1], ok: bad >= p.floor ? "Yes" : "No" };
  }
  if (p.kind === "marginsx") {
    const gp = ((p.rev - p.cos) / p.rev) * 100;
    const np = ((p.rev - p.cos - p.oh) / p.rev) * 100;
    const m = expected({ kind: "margins", gp1: p.gp1, gp2: Math.round(gp * 1e6) / 1e6, np1: p.np1, np2: Math.round(np * 1e6) / 1e6 });
    if (!m) return null;
    return { gpm: [gp, 1], npm: [np, 1], cause: m[2] };
  }
  if (p.kind === "rank") {
    const pa = vPayback(p.I, p.a), pb = vPayback(p.I, p.b);
    if (!pa || !pb) return null;
    const ma = pa.y * 12 + pa.mo, mb = pb.y * 12 + pb.mo;
    if (ma === mb) return null;
    const na = vNpv(p.I, p.a, p.rate), nb = vNpv(p.I, p.b, p.rate);
    if (na === nb) return null;
    return { payback: ma < mb ? "Project A" : "Project B", npvb: [nb, 0], choose: nb > na ? "Project B" : "Project A" };
  }
  return null;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (question.answerType === "multi") {
    const exp = multiExpected(p);
    const parts = question.parts;
    if (!exp || !Array.isArray(parts) || !answer || typeof answer !== "object") return false;
    if (parts.length !== Object.keys(exp).length) return false;
    return parts.every((pt) => {
      if (!(pt.id in exp)) return false;
      const want = exp[pt.id];
      if (pt.answerType === "choice") return Array.isArray(pt.choices) && pt.choices.filter((c) => c === want).length === 1 && answer[pt.id] === want;
      const [v, dp] = want;
      if (dp > 0 && onHalf(v, dp)) return false;
      return numNear(answer[pt.id], Math.round(v * 10 ** dp) / 10 ** dp, dp > 0 ? 0.5 / 10 ** dp : 0.5);
    });
  }
  if (question.answerType === "choice") {
    const want = expected(p);
    if (!want) return false;
    if (question.choiceCols && question.choiceCols.length !== want.length) return false;
    return choiceOk(question, answer, eqT(want));
  }
  return false;
}
