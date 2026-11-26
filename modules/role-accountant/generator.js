// Accountant (role-only). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario that chains skills from several subjects:
//   transaction-review  journal (Debit | Credit) -> effect on current assets/liabilities -> ratio -> covenant
//   audit-review        receivable days -> current ratio -> red flags -> audit response (E+: early sale)
//   asset-review        straight-line / reducing balance -> carrying value -> profit -> method or disposal
//   break-even-review   break-even units -> margin of safety / target profit -> decision (E+: special order)
//   budget-variance     flexed budget -> price/volume/cost variances -> favourable/adverse -> investigate by a stated % (E+: back from a variance)
// Tiers: medium 2 parts, hard 3, expert 4 (3 at transaction-review hard is also 3), expert-plus 4.
// Logic is copied from the Accounting Terms/Theory, Finance and Business Case generators (never imported).
// All rng draws happen before any text, hint or explanation is built. Draws that would put an answer on a
// rounding half-step or next to a decision threshold are redrawn inside generate(), so a learner who
// carries a rounded earlier answer forward still gets the same later answer.
// Conventions: goods bought go to Inventory, a sale records revenue only (ignore cost of goods sold),
// depreciation builds up in Accumulated depreciation. No country-specific law or tax.
// verify() rebuilds every part from params with its own arithmetic (journals are derived from account
// types and normal sides, not from the generator's table).

// ---------------------------------------------------------------------------------------------
// Shared helpers

const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (n) => (n < 0 ? `−$${fmt(-n)}` : `$${fmt(n)}`);
const r2 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;
const r1 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 10 + 1e-9) / 10;
// x is not within 0.0001 of a rounding half-step at `dp` decimal places.
const safeAt = (x, dp) => Math.abs((Math.abs(x * 10 ** dp) % 1) - 0.5) > 1e-4;
const SEP = " | ";
const segsOf = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()) : String(v ?? "").split("|").map((s) => s.trim()));
const sameSegs = (a, b) => { const x = segsOf(a), y = segsOf(b); return x.length === y.length && x.every((s, i) => s === y[i]); };
const numOk = (cand, want, tol) => { const n = typeof cand === "number" ? cand : parseFloat(String(cand ?? "").replace(/−/g, "-").replace(/,/g, "")); return Number.isFinite(n) && Math.abs(n - want) <= tol + 1e-9; };
const part = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);
const partOf = (q, id) => (q.parts || []).find((p) => p.id === id);
const plainChoiceOk = (q, id, want, cand) => { const p = partOf(q, id); return !!p && Array.isArray(p.choices) && p.choices.filter((c) => c === want).length === 1 && cand === want; };
const segChoiceOk = (q, id, want, cand) => { const p = partOf(q, id); return !!p && Array.isArray(p.choices) && p.choices.filter((c) => sameSegs(c, want)).length === 1 && sameSegs(cand, want); };
const FIRMS = ["Northwind Traders", "Harbour & Co", "Bluepeak Retail", "Lumen Goods", "Kestrel Group", "Maple Street Ltd", "Copperleaf Ltd", "Riverside Supplies", "Summit Brands", "Oakline Stores"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// The answer plus up to n − 1 distractors, each differing from it in 1..cols−1 segments.
function segChoices(rng, answer, opts, prefer = [], n = 5, distinct = false) {
  const cols = answer.length;
  const seen = new Set([answer.join(SEP)]);
  const out = [answer];
  const add = (c) => {
    if (out.length >= n) return;
    const d = c.filter((v, i) => v !== answer[i]).length;
    if (d < 1 || d >= cols) return;
    if (distinct && new Set(c).size < cols) return; // e.g. a journal never debits and credits one account
    const k = c.join(SEP);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  prefer.forEach(add);
  for (let g = 0; out.length < n && g < 400; g++) {
    const k = cols > 2 && rng.next() < 0.5 ? 2 : 1;
    const idx = rng.shuffle([...Array(cols).keys()]).slice(0, k);
    const c = answer.slice();
    for (const i of idx) {
      const alt = opts[i].filter((v) => v !== answer[i]);
      if (alt.length) c[i] = rng.pick(alt);
    }
    add(c);
  }
  return rng.shuffle(out);
}
function segPart(rng, { id, label, ask, cols, answer, opts, prefer, hint, n, distinct }) {
  const choices = segChoices(rng, answer, opts, prefer, n, distinct);
  const extraSegs = [];
  cols.forEach((c, i) => { for (const v of new Set(opts[i])) if (v !== answer[i]) extraSegs.push([c, v]); });
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, hint };
}
const choicePart = (rng, { id, label, ask, options, answer, hint }) => ({ id, label, ask, answerType: "choice", answer, choices: rng.shuffle(options.slice()), hint });
const numPart = ({ id, label, ask, answer, tolerance = 0, hint }) => ({ id, label, ask, answerType: "number", answer, tolerance, hint });

// ---------------------------------------------------------------------------------------------
// Journals: each transaction lists the accounts it changes and the direction; generation reads dr/cr
// from the table, verify() derives them from account types.

const ACC_POOL = ["Inventory", "Trade payables", "Cash", "Trade receivables", "Sales revenue", "Equipment", "Short-term loan", "Capital"];
const TYPE = { Inventory: "A", Cash: "A", "Trade receivables": "A", Equipment: "A", "Trade payables": "L", "Short-term loan": "L", Capital: "E", "Sales revenue": "R" };
const CURRENT_A = new Set(["Inventory", "Cash", "Trade receivables"]);
const CURRENT_L = new Set(["Trade payables", "Short-term loan"]);
const TX = {
  capital: { dr: "Cash", cr: "Capital", text: (a) => `the owner paid ${money(a)} into the business bank account as capital`, eff: [["Cash", 1], ["Capital", 1]] },
  equipcash: { dr: "Equipment", cr: "Cash", text: (a) => `bought equipment for ${money(a)}, paid in cash`, eff: [["Equipment", 1], ["Cash", -1]] },
  invcredit: { dr: "Inventory", cr: "Trade payables", text: (a) => `bought goods for resale costing ${money(a)} on credit from a supplier`, eff: [["Inventory", 1], ["Trade payables", 1]] },
  salecredit: { dr: "Trade receivables", cr: "Sales revenue", text: (a) => `sold goods for ${money(a)} on credit to a customer (ignore the cost of the goods sold)`, eff: [["Trade receivables", 1], ["Sales revenue", 1]] },
  shortloan: { dr: "Cash", cr: "Short-term loan", text: (a) => `took out a bank loan of ${money(a)}, repayable within 6 months`, eff: [["Cash", 1], ["Short-term loan", 1]] },
  paysupp: { dr: "Trade payables", cr: "Cash", text: (a) => `paid a supplier ${money(a)} in cash, settling a trade payable`, eff: [["Trade payables", -1], ["Cash", -1]] },
  custpays: { dr: "Cash", cr: "Trade receivables", text: (a) => `received ${money(a)} from a credit customer, settling what they owed`, eff: [["Cash", 1], ["Trade receivables", -1]] },
};
const TX_IDS = Object.keys(TX);
// Debit side derived from types: an asset debits when it rises, a claim (liability/capital/revenue) when it falls.
const debitOf = (eff) => eff.filter(([acc, dir]) => (TYPE[acc] === "A" ? dir > 0 : dir < 0)).map(([acc]) => acc);
const creditOf = (eff) => eff.filter(([acc, dir]) => (TYPE[acc] === "A" ? dir < 0 : dir > 0)).map(([acc]) => acc);
const dCA = (eff, a) => eff.reduce((s, [acc, dir]) => s + (CURRENT_A.has(acc) ? dir * a : 0), 0);
const dCL = (eff, a) => eff.reduce((s, [acc, dir]) => s + (CURRENT_L.has(acc) ? dir * a : 0), 0);
const dca = (id, a) => TX[id].eff.reduce((s, [acc, dir]) => s + (CURRENT_A.has(acc) ? dir * a : 0), 0);
const dcl = (id, a) => TX[id].eff.reduce((s, [acc, dir]) => s + (CURRENT_L.has(acc) ? dir * a : 0), 0);

function journalPart(rng, id, tx) {
  const t = TX[tx];
  const other = (x) => ACC_POOL.filter((a) => a !== x && a !== t.dr && a !== t.cr);
  const prefer = [[t.dr, rng.pick(other(t.cr))], [rng.pick(other(t.dr)), t.cr]];
  return segPart(rng, {
    id, label: "Journal", ask: "Record the transaction: pick the account to debit and the account to credit",
    cols: ["Debit", "Credit"], answer: [t.dr, t.cr], opts: [ACC_POOL, ACC_POOL], prefer, distinct: true,
    hint: "A debit increases an asset and decreases a liability or capital; a credit does the opposite. Say which two accounts the transaction changes and in which direction, then match each to a side.",
  });
}

// ---------------------------------------------------------------------------------------------
// transaction-review

const RATIO_RULES = [1.0, 1.2, 1.5, 2.0];

function genTransaction(rng, tier) {
  const firm = rng.pick(FIRMS);
  if (tier === "expert-plus") return genTransactionPlus(rng, firm);
  const pool = tier === "medium" ? ["capital", "equipcash", "invcredit", "salecredit", "shortloan"] : TX_IDS;
  const want = rng.int(0, 1);
  for (let tries = 0; tries < 1000; tries++) {
    const tx = rng.pick(pool);
    const a = rng.int(2, 24) * 500;
    const CA = rng.int(20, 90) * 1000;
    const CL = rng.int(12, 60) * 1000;
    const R = rng.pick(RATIO_RULES);
    // No rng below in this attempt.
    const caAfter = CA + dca(tx, a), clAfter = CL + dcl(tx, a);
    if (caAfter <= 0 || clAfter <= 0) continue;
    if (tier === "medium") {
      if (dca(tx, a) === 0) continue;
      return buildTransaction(rng, { firm, tier, tx, a, CA, CL, R, caAfter, clAfter });
    }
    if (dca(tx, a) === 0 && dcl(tx, a) === 0) continue;
    const ratio = caAfter / clAfter;
    if (!safeAt(ratio, 2) || Math.abs(ratio - R) < 0.03 || ratio < 0.3 || ratio > 4) continue;
    const ok = ratio >= R ? 1 : 0;
    if (ok !== want && tries < 900) continue;
    return buildTransaction(rng, { firm, tier, tx, a, CA, CL, R, caAfter, clAfter });
  }
  throw new Error("transaction-review: could not draw");
}

function buildTransaction(rng, d) {
  const { firm, tier, tx, a, CA, CL, R, caAfter, clAfter } = d;
  const ratio = caAfter / clAfter, ratio2 = r2(ratio);
  const wcChange = dca(tx, a) - dcl(tx, a);
  const parts = [journalPart(rng, "journal", tx)];
  const ok = ratio >= R;
  const decision = ok ? "Compliant" : "Breach";
  const hintCA = "Current assets are cash, inventory and trade receivables. Add or subtract the amount only if the account moved by the transaction is one of those.";
  const hintRatio = "Current ratio = current assets ÷ current liabilities, both after the transaction. Current liabilities are trade payables and loans due within 12 months.";
  const hintCov = "Compare your unrounded ratio with the lender's limit. \"At least\" means a ratio equal to the limit passes.";
  if (tier === "medium") parts.push(numPart({ id: "ca", label: "Current assets", ask: "Current assets after the transaction, in $", answer: caAfter, hint: hintCA }));
  else {
    parts.push(numPart({ id: "ratio", label: "Current ratio", ask: "Current ratio after the transaction (2 decimal places)", answer: ratio2, tolerance: 0.005, hint: hintRatio }));
    if (tier === "expert") parts.push(numPart({ id: "wc", label: "Working capital", ask: "Change in working capital (current assets − current liabilities), in $ (negative if it falls)", answer: wcChange, hint: "Work out the change in current assets and the change in current liabilities from the journal, then subtract." }));
    parts.push(choicePart(rng, { id: "covenant", label: "Covenant", ask: "Is the loan covenant met after the transaction?", options: ["Compliant", "Breach"], answer: decision, hint: hintCov }));
  }
  const covTxt = tier === "medium" ? "" : ` The bank's covenant requires a current ratio of **at least ${R.toFixed(1)}**.`;
  const lines = [`- Journal: Dr ${TX[tx].dr}, Cr ${TX[tx].cr} (${TX[tx].text(a)}).`, `- Current assets: ${fmt(CA)} ${dca(tx, a) >= 0 ? "+" : "−"} ${fmt(Math.abs(dca(tx, a)))} = **${fmt(caAfter)}**; current liabilities: ${fmt(CL)} ${dcl(tx, a) >= 0 ? "+" : "−"} ${fmt(Math.abs(dcl(tx, a)))} = ${fmt(clAfter)}.`];
  if (tier !== "medium") lines.push(`- Current ratio = ${fmt(caAfter)} ÷ ${fmt(clAfter)} = **${ratio2.toFixed(2)}**.`);
  if (tier === "expert") lines.push(`- Working capital changes by ${fmt(dca(tx, a))} − ${fmt(dcl(tx, a))} = **${fmt(wcChange)}**.`);
  if (tier !== "medium") lines.push(`- Covenant: ${ratio2.toFixed(2)} is ${ok ? "at least" : "below"} ${R.toFixed(1)}: **${decision}**.`);
  return {
    prompt: `${firm} has current assets of **${money(CA)}** and current liabilities of **${money(CL)}**. It then ${TX[tx].text(a)}.${covTxt}`,
    answerType: "multi", parts, explanation: lines.join("\n"),
    given: [{ label: "_ca", value: CA }, { label: "_cl", value: CL }, { label: "_amount", value: a }],
    params: { kind: "transaction", tier, tx, a, CA, CL, R },
  };
}

function genTransactionPlus(rng, firm) {
  const Cs = [1.2, 1.25, 1.4, 1.5, 1.6];
  for (let tries = 0; tries < 2000; tries++) {
    const C = rng.pick(Cs);
    const CL = rng.int(8, 40) * 1000;
    const X = rng.int(3, 20) * 1000;
    const Y = rng.int(2, 24) * 1000;
    const wantBreach = rng.int(0, 1);
    // No rng below in this attempt.
    const CA = C * CL + X * (C - 1);
    if (!Number.isInteger(Math.round(CA * 1e6) / 1e6) || Math.abs(Y - X) < 2000) continue;
    if (!safeAt((CA + Y) / (CL + Y), 2)) continue;
    if ((Y > X ? 1 : 0) !== wantBreach && tries < 1500) continue;
    const ratioY = (CA + Y) / (CL + Y), ratioY2 = r2(ratioY);
    const breach = Y > X;
    const ans = [breach ? "Breach" : "Compliant", "Compliant"];
    const parts = [
      numPart({ id: "ratio", label: "Current ratio", ask: "Current ratio if the planned purchase is made on credit (2 decimal places)", answer: ratioY2, tolerance: 0.005, hint: "A credit purchase of inventory adds the same amount to current assets (inventory) and to current liabilities (trade payables). Divide the new totals." }),
      numPart({ id: "maxbuy", label: "Largest purchase", ask: "The largest credit purchase of inventory the covenant allows, in $", answer: X, hint: "Let the purchase be x. The ratio stays at least the limit while (current assets + x) ÷ (current liabilities + x) ≥ limit. Solve the boundary for x." }),
      journalPart(rng, "journal", "invcredit"),
      segPart(rng, { id: "flags", label: "Covenant", ask: "Covenant result if the planned purchase is made on credit, and if it is paid in cash instead", cols: ["On credit", "In cash"], answer: ans, opts: [["Compliant", "Breach"], ["Compliant", "Breach"]], prefer: [], hint: "A cash purchase swaps one current asset for another, so the ratio stays where it started. For the credit purchase, compare the planned purchase with the largest purchase you found.", n: 3 }),
    ];
    return {
      prompt: `${firm} has current assets of **${money(CA)}** and current liabilities of **${money(CL)}**. Its bank requires a current ratio of **at least ${C}** at all times. The manager plans to buy goods for resale (**${money(Y)}** in all) from a supplier, either on credit or in cash.`,
      answerType: "multi", parts,
      explanation: `- On credit: current assets ${fmt(CA)} + ${fmt(Y)} = ${fmt(CA + Y)}; current liabilities ${fmt(CL)} + ${fmt(Y)} = ${fmt(CL + Y)}; ratio = **${ratioY2.toFixed(2)}**.\n- Largest purchase x: (${fmt(CA)} + x) ÷ (${fmt(CL)} + x) = ${C}, so x = (${fmt(CA)} − ${C} × ${fmt(CL)}) ÷ (${C} − 1) = **${fmt(X)}**.\n- Journal: Dr Inventory, Cr Trade payables.\n- ${fmt(Y)} is ${breach ? "more" : "less"} than ${fmt(X)}, so the credit purchase is **${ans[0]}**. Paying cash leaves the ratio at ${fmt(CA)} ÷ ${fmt(CL)} = ${r2(CA / CL).toFixed(2)}, which is at least ${C}: **Compliant**.`,
      given: [{ label: "_ca", value: CA }, { label: "_cl", value: CL }, { label: "_limit", value: C }, { label: "_buy", value: Y }],
      params: { kind: "transaction-plus", CA, CL, C, Y },
    };
  }
  throw new Error("transaction-review: could not draw expert-plus");
}

function verifyTransaction(q, answer) {
  const p = q.params;
  const t = TX[p.tx];
  if (!t) return false;
  const debit = debitOf(t.eff), credit = creditOf(t.eff);
  if (debit.length !== 1 || credit.length !== 1) return false;
  if (!segChoiceOk(q, "journal", [debit[0], credit[0]], part(answer, "journal"))) return false;
  const ca = p.CA + dCA(t.eff, p.a), cl = p.CL + dCL(t.eff, p.a);
  if (p.tier === "medium") return numOk(part(answer, "ca"), ca, 0);
  const ratio = ca / cl;
  if (!numOk(part(answer, "ratio"), r2(ratio), 0.005)) return false;
  if (p.tier === "expert" && !numOk(part(answer, "wc"), (ca - cl) - (p.CA - p.CL), 0)) return false;
  return plainChoiceOk(q, "covenant", ratio >= p.R ? "Compliant" : "Breach", part(answer, "covenant"));
}

function verifyTransactionPlus(q, answer) {
  const p = q.params;
  if (!numOk(part(answer, "ratio"), r2((p.CA + p.Y) / (p.CL + p.Y)), 0.005)) return false;
  // Largest x with (CA + x)/(CL + x) >= C: x <= (CA - C*CL)/(C - 1).
  const x = (p.CA - p.C * p.CL) / (p.C - 1);
  if (!numOk(part(answer, "maxbuy"), Math.round(x), 0)) return false;
  const inv = TX.invcredit.eff;
  if (!segChoiceOk(q, "journal", [debitOf(inv)[0], creditOf(inv)[0]], part(answer, "journal"))) return false;
  const credit = (p.CA + p.Y) / (p.CL + p.Y) >= p.C ? "Compliant" : "Breach";
  const cash = p.CA / p.CL >= p.C ? "Compliant" : "Breach";
  return segChoiceOk(q, "flags", [credit, cash], part(answer, "flags"));
}

// ---------------------------------------------------------------------------------------------
// audit-review: receivable days, current ratio, red flags, response; Expert+: an early sale

const FLAG = ["Red flag", "Normal"];
const RESPONSES = ["Routine procedures only", "Confirm balances with customers and test cut-off", "Review the cash-flow forecast for going concern", "Both: confirmations and a going-concern review"];
const BOTH4 = ["Neither", "Receivables only", "Liquidity only", "Both"];

function genAudit(rng, tier) {
  const firm = rng.pick(FIRMS);
  if (tier === "expert-plus") return genAuditPlus(rng, firm);
  for (let tries = 0; tries < 2000; tries++) {
    const s = rng.int(4, 40) * 50;          // sales per day
    const d = rng.int(30, 75);
    const d0 = rng.int(28, 60);
    const K = rng.pick([8, 10, 12]);
    const Q = rng.pick([1.0, 1.2]);
    const CL = rng.int(20, 90) * 1000;
    const CA = rng.int(18, 130) * 1000;
    const wantR = rng.int(0, 1), wantL = rng.int(0, 1);
    // No rng below in this attempt.
    const ratio = CA / CL;
    if (Math.abs(d - d0) === K || !safeAt(ratio, 2) || Math.abs(ratio - Q) < 0.04) continue;
    const rf = d - d0 > K, lf = ratio < Q;
    if (tries < 1800 && (+rf !== wantR || (tier !== "medium" && +lf !== wantL))) continue;
    return buildAudit(rng, { firm, tier, s, d, d0, K, Q, CL, CA, rf, lf });
  }
  throw new Error("audit-review: could not draw");
}

function buildAudit(rng, d) {
  const { firm, tier, s, d: days, d0, K, Q, CL, CA, rf, lf } = d;
  const rev = 365 * s, rec = days * s, ratio = CA / CL, ratio2 = r2(ratio);
  const parts = [numPart({ id: "days", label: "Receivable days", ask: "Receivable days this year (a whole number)", answer: days, hint: "Receivable days = trade receivables ÷ revenue × 365. Use this year's revenue and this year's closing receivables." })];
  const flagTxt = (f) => (f ? "Red flag" : "Normal");
  if (tier === "medium") parts.push(choicePart(rng, { id: "flag", label: "Receivables flag", ask: "Is the receivables figure a red flag?", options: FLAG, answer: flagTxt(rf), hint: `Find how many days receivable days rose since last year and compare with the ${K}-day limit: it must rise by more than ${K}.` }));
  else {
    parts.push(numPart({ id: "ratio", label: "Current ratio", ask: "Current ratio (2 decimal places)", answer: ratio2, tolerance: 0.005, hint: "Current ratio = current assets ÷ current liabilities." }));
    if (tier === "hard") {
      const ans = rf && lf ? "Both" : rf ? "Receivables only" : lf ? "Liquidity only" : "Neither";
      parts.push(choicePart(rng, { id: "flags", label: "Red flags", ask: "Which warning limits are breached?", options: BOTH4, answer: ans, hint: "Test each limit on its own: receivable days up by more than the stated days, and a current ratio below the stated figure." }));
    } else {
      parts.push(segPart(rng, { id: "flags", label: "Red flags", ask: "Mark each area", cols: ["Receivables", "Liquidity"], answer: [flagTxt(rf), flagTxt(lf)], opts: [FLAG, FLAG], prefer: [], n: 3, hint: "Receivable days must have risen by more than the limit for a flag; the current ratio must be below the stated figure." }));
      const resp = rf && lf ? RESPONSES[3] : rf ? RESPONSES[1] : lf ? RESPONSES[2] : RESPONSES[0];
      parts.push(choicePart(rng, { id: "response", label: "Audit response", ask: "The most suitable audit response", options: RESPONSES, answer: resp, hint: "A receivables flag points to customer confirmations and a cut-off test; a liquidity flag points to the cash-flow forecast. Match the response to the flags you found." }));
    }
  }
  const lim = tier === "medium" ? `Receivable days rising by **more than ${K} days** on last year is a red flag.` : `Two warning limits apply: receivable days rising by **more than ${K} days** on last year is a red flag, and a current ratio **below ${Q.toFixed(1)}** is a going-concern warning.`;
  const bal = tier === "medium" ? "" : ` Current assets are **${money(CA)}** and current liabilities **${money(CL)}**.`;
  const lines = [`- Receivable days: ${fmt(rec)} ÷ ${fmt(rev)} × 365 = **${days}** (last year ${d0}, a change of ${days - d0 >= 0 ? "+" : "−"}${Math.abs(days - d0)}; limit ${K}) so the receivables figure is a ${flagTxt(rf).toLowerCase()}.`];
  if (tier !== "medium") {
    lines.push(`- Current ratio: ${fmt(CA)} ÷ ${fmt(CL)} = **${ratio2.toFixed(2)}**, which is ${lf ? "below" : "at least"} ${Q.toFixed(1)}: ${flagTxt(lf).toLowerCase()}.`);
    if (tier === "hard") lines.push(`- Breached: **${rf && lf ? "Both" : rf ? "Receivables only" : lf ? "Liquidity only" : "Neither"}**.`);
    else lines.push(`- Response: **${rf && lf ? RESPONSES[3] : rf ? RESPONSES[1] : lf ? RESPONSES[2] : RESPONSES[0]}**.`);
  }
  return {
    prompt: `The auditors of ${firm} are reviewing its year-end figures. Revenue was **${money(rev)}** and closing trade receivables **${money(rec)}**. Last year's receivable days were **${d0}**. ${lim}${bal}`,
    answerType: "multi", parts, explanation: lines.join("\n"),
    given: [{ label: "_rev", value: rev }, { label: "_rec", value: rec }, ...(tier === "medium" ? [] : [{ label: "_ca", value: CA }, { label: "_cl", value: CL }])],
    params: { kind: "audit", tier, rev, rec, d0, K, Q, CA, CL },
  };
}

function genAuditPlus(rng, firm) {
  for (let tries = 0; tries < 3000; tries++) {
    const s = rng.int(8, 40) * 50;
    const d = rng.int(40, 80);
    const X = rng.int(2, 12) * 1000;
    const P = rng.int(12, 60) * 1000;
    const M = rng.pick([5, 8, 10, 15]);
    const wantMat = rng.int(0, 1);
    // No rng below in this attempt.
    const rev = 365 * s, rec = d * s;
    if (rec - X <= 0 || rev - X <= 0 || X >= P) continue;
    const days2 = ((rec - X) / (rev - X)) * 365;
    const share = (X / P) * 100;
    if (!safeAt(days2, 1) || Math.abs(share - M) < 1) continue;
    if ((share > M ? 1 : 0) !== wantMat && tries < 2500) continue;
    const material = share > M;
    const MAT = ["Material: correct the accounts", "Not material: no adjustment needed", "Cannot tell without the cost of sales"];
    const matAns = material ? MAT[0] : MAT[1];
    const days1 = r1(days2);
    const parts = [
      journalPartCustom(rng),
      numPart({ id: "profit", label: "Profit", ask: "Profit after the correction, in $", answer: P - X, hint: "The sale never happened in this year: revenue and profit both fall by its value (ignore the cost of the goods)." }),
      choicePart(rng, { id: "material", label: "Materiality", ask: "Is the error material under the stated rule?", options: MAT, answer: matAns, hint: `Express the overstatement of profit as a % of the reported profit and compare it with ${M}%.` }),
      numPart({ id: "days", label: "Corrected days", ask: "Receivable days after the correction (1 decimal place)", answer: days1, tolerance: 0.05, hint: "Take the sale off both revenue and trade receivables, then redo receivables ÷ revenue × 365." }),
    ];
    return {
      prompt: `While testing year-end cut-off for ${firm}, the auditors find a sale of **${money(X)}** recorded in December, but the goods were only shipped in January. Reported figures: revenue **${money(rev)}**, closing trade receivables **${money(rec)}**, profit **${money(P)}**. An error is **material** if it overstates profit by **more than ${M}%** of reported profit. Ignore the cost of the goods sold.`,
      answerType: "multi", parts,
      explanation: `- Reversing entry: Dr Sales revenue, Cr Trade receivables (${fmt(X)}).\n- Profit after correction: ${fmt(P)} − ${fmt(X)} = **${fmt(P - X)}**.\n- Overstatement: ${fmt(X)} ÷ ${fmt(P)} × 100 = ${r2(share)}%, which is ${material ? "above" : "within"} ${M}%: **${matAns}**.\n- Corrected receivable days: (${fmt(rec)} − ${fmt(X)}) ÷ (${fmt(rev)} − ${fmt(X)}) × 365 = **${days1.toFixed(1)}**.`,
      given: [{ label: "_rev", value: rev }, { label: "_rec", value: rec }, { label: "_profit", value: P }, { label: "_error", value: X }],
      params: { kind: "audit-plus", rev, rec, P, X, M },
    };
  }
  throw new Error("audit-review: could not draw expert-plus");
}

function journalPartCustom(rng) {
  // Reversal of a sale recorded too early: Dr Sales revenue, Cr Trade receivables.
  const dr = "Sales revenue", cr = "Trade receivables";
  const other = (x) => ACC_POOL.filter((a) => a !== x && a !== dr && a !== cr);
  return segPart(rng, {
    id: "journal", label: "Correcting entry", ask: "Record the correcting entry that reverses the early sale",
    cols: ["Debit", "Credit"], answer: [dr, cr], opts: [ACC_POOL, ACC_POOL], prefer: [[dr, rng.pick(other(cr))], [rng.pick(other(dr)), cr]], distinct: true,
    hint: "First write down the entry that recorded the credit sale. A correcting entry undoes it by putting the same two accounts on the opposite sides.",
  });
}

function verifyAudit(q, answer) {
  const p = q.params;
  const days = (p.rec * 365) / p.rev;
  if (!numOk(part(answer, "days"), Math.round(days), 0)) return false;
  const rf = Math.round(days) - p.d0 > p.K;
  if (p.tier === "medium") return plainChoiceOk(q, "flag", rf ? "Red flag" : "Normal", part(answer, "flag"));
  const ratio = p.CA / p.CL;
  if (!numOk(part(answer, "ratio"), r2(ratio), 0.005)) return false;
  const lf = ratio < p.Q;
  if (p.tier === "hard") return plainChoiceOk(q, "flags", rf && lf ? "Both" : rf ? "Receivables only" : lf ? "Liquidity only" : "Neither", part(answer, "flags"));
  if (!segChoiceOk(q, "flags", [rf ? "Red flag" : "Normal", lf ? "Red flag" : "Normal"], part(answer, "flags"))) return false;
  const resp = rf && lf ? RESPONSES[3] : rf ? RESPONSES[1] : lf ? RESPONSES[2] : RESPONSES[0];
  return plainChoiceOk(q, "response", resp, part(answer, "response"));
}

function verifyAuditPlus(q, answer) {
  const p = q.params;
  if (!segChoiceOk(q, "journal", ["Sales revenue", "Trade receivables"], part(answer, "journal"))) return false;
  if (!numOk(part(answer, "profit"), p.P - p.X, 0)) return false;
  const material = p.X * 100 > p.M * p.P;
  if (!plainChoiceOk(q, "material", material ? "Material: correct the accounts" : "Not material: no adjustment needed", part(answer, "material"))) return false;
  return numOk(part(answer, "days"), r1(((p.rec - p.X) * 365) / (p.rev - p.X)), 0.05);
}

// ---------------------------------------------------------------------------------------------
// asset-review: depreciation, carrying value, profit, method choice / disposal

const ASSETS = ["a delivery van", "a packing machine", "a server room", "a printing press", "a set of shop fittings", "a forklift truck", "a CNC router", "a refrigerated display unit"];
const DISP = ["Gain on disposal: added to profit", "Loss on disposal: deducted from profit", "No gain or loss: profit unchanged"];

function genAsset(rng, tier) {
  const firm = rng.pick(FIRMS), asset = rng.pick(ASSETS);
  if (tier === "expert") return genAssetRB(rng, firm, asset);
  if (tier === "expert-plus") return genAssetDisposal(rng, firm, asset);
  const L = rng.pick([4, 5, 8, 10]);
  const D = rng.int(2, 12) * 500;
  const res = rng.int(0, 6) * 1000;
  const cost = res + D * L;
  const n = rng.int(1, L - 1);
  const P = rng.int(4, 20) * 1000 + D;
  const cv = cost - D * n;
  const parts = [
    numPart({ id: "dep", label: "Depreciation", ask: "Annual straight-line depreciation, in $", answer: D, hint: "Straight-line charge = (cost − residual value) ÷ useful life in years." }),
    numPart({ id: "cv", label: "Carrying value", ask: `Carrying value at the end of year ${n}, in $`, answer: cv, hint: `After ${plural(n, "year")} the accumulated depreciation is ${n} times the yearly charge. Carrying value = cost − accumulated depreciation.` }),
  ];
  if (tier === "hard") parts.push(numPart({ id: "profit", label: "Profit", ask: `Profit for year ${n} after depreciation, in $`, answer: P - D, hint: "Profit after depreciation = profit before depreciation − the year's depreciation charge." }));
  return {
    prompt: `${firm} bought ${asset} for **${money(cost)}**. It expects to use it for **${L} years** and then sell it for **${money(res)}**, and depreciates it on the **straight-line** method. It has now been held for **${n} year${n === 1 ? "" : "s"}**.${tier === "hard" ? ` Profit before depreciation for year ${n} is **${money(P)}**.` : ""}`,
    answerType: "multi", parts,
    explanation: `- Depreciation: (${fmt(cost)} − ${fmt(res)}) ÷ ${L} = **${fmt(D)}** a year.\n- Accumulated depreciation after ${plural(n, "year")}: ${n} × ${fmt(D)} = ${fmt(D * n)}. Carrying value = ${fmt(cost)} − ${fmt(D * n)} = **${fmt(cv)}**.${tier === "hard" ? `\n- Profit after depreciation: ${fmt(P)} − ${fmt(D)} = **${fmt(P - D)}**.` : ""}`,
    given: [{ label: "_cost", value: cost }, { label: "_resid", value: res }, { label: "_life", value: L }, ...(tier === "hard" ? [{ label: "_profit", value: P }] : [])],
    params: { kind: "asset", tier, cost, res, L, n, P },
  };
}

function genAssetRB(rng, firm, asset) {
  for (let tries = 0; tries < 1000; tries++) {
    const cost = rng.int(2, 12) * 10000;
    const rate = rng.pick([20, 25, 40]);
    const L = rng.pick([4, 5, 8, 10]);
    const P = rng.int(10, 40) * 1000;
    const wantRB = rng.int(0, 1);
    // No rng below in this attempt.
    const d1 = (cost * rate) / 100, d2 = ((cost - d1) * rate) / 100;
    const sl = cost / L;
    if (!Number.isInteger(d1) || !Number.isInteger(d2) || !Number.isInteger(sl) || sl === d2 || P <= Math.max(d2, sl)) continue;
    const best = sl < d2 ? "Straight-line" : "Reducing balance"; // lower year 2 charge = higher year 2 profit
    if ((best === "Reducing balance" ? 1 : 0) !== wantRB && tries < 900) continue;
    const cv = cost - d1 - d2;
    const parts = [
      numPart({ id: "dep2", label: "Year 2 charge", ask: "Reducing-balance depreciation for year 2, in $ (nearest $)", answer: d2, hint: "Year 1's charge is the rate × cost. Year 2's charge is the rate × the carrying value at the start of year 2." }),
      numPart({ id: "cv", label: "Carrying value", ask: "Carrying value at the end of year 2, in $ (nearest $)", answer: cv, hint: "Carrying value = cost − the year 1 charge − the year 2 charge." }),
      numPart({ id: "profit", label: "Year 2 profit", ask: "Year 2 profit under reducing balance, in $", answer: P - d2, hint: "Profit after depreciation = profit before depreciation − the year 2 charge." }),
      choicePart(rng, { id: "method", label: "Method", ask: "Which method gives the higher year 2 profit?", options: ["Straight-line", "Reducing balance"], answer: best, hint: `Work out the year 2 charge under straight-line (cost ÷ ${L}) and compare it with your reducing-balance charge. The lower charge leaves the higher profit.` }),
    ];
    return {
      prompt: `${firm} bought ${asset} for **${money(cost)}**. It is considering **reducing-balance** depreciation at **${rate}% a year** of the carrying value at the start of each year (no residual value, round to the nearest $), or **straight-line** over **${L} years** with no residual value. Profit before depreciation in year 2 is **${money(P)}**.`,
      answerType: "multi", parts,
      explanation: `- Year 1: ${rate}% × ${fmt(cost)} = ${fmt(d1)}. Year 2: ${rate}% × (${fmt(cost)} − ${fmt(d1)}) = **${fmt(d2)}**.\n- Carrying value after year 2: ${fmt(cost)} − ${fmt(d1)} − ${fmt(d2)} = **${fmt(cv)}**.\n- Year 2 profit: ${fmt(P)} − ${fmt(d2)} = **${fmt(P - d2)}**.\n- Straight-line charge: ${fmt(cost)} ÷ ${L} = ${fmt(sl)}, which is ${sl < d2 ? "lower" : "higher"} than ${fmt(d2)}, so **${best}** gives the higher year 2 profit.`,
      given: [{ label: "_cost", value: cost }, { label: "_rate", value: rate }, { label: "_life", value: L }, { label: "_profit", value: P }],
      params: { kind: "asset-rb", cost, rate, L, P },
    };
  }
  throw new Error("asset-review: could not draw expert");
}

function genAssetDisposal(rng, firm, asset) {
  for (let tries = 0; tries < 1000; tries++) {
    const L = rng.pick([4, 5, 8, 10]);
    const D = rng.int(2, 12) * 500;
    const res = rng.int(0, 6) * 1000;
    const n = rng.int(2, L - 1);
    const P = rng.int(8, 40) * 1000;
    const delta = rng.int(1, 12) * 500 * (rng.int(0, 1) ? 1 : -1);
    const zero = rng.int(0, 9) === 0;
    // No rng below in this attempt.
    const cost = res + D * L, cv = cost - D * n;
    const proceeds = zero ? cv : cv + delta;
    if (proceeds <= 0 || P <= D + 12000) continue;
    const gl = proceeds - cv;
    const profit = P - D + gl;
    const treat = gl > 0 ? DISP[0] : gl < 0 ? DISP[1] : DISP[2];
    const parts = [
      numPart({ id: "life", label: "Useful life", ask: "The asset's useful life in years", answer: L, hint: "The yearly straight-line charge is (cost − residual value) ÷ life, so life = (cost − residual value) ÷ yearly charge." }),
      numPart({ id: "gl", label: "Gain or loss", ask: "Gain or loss on disposal, in $ (negative for a loss)", answer: gl, hint: `Find the carrying value after ${plural(n, "year")} of straight-line depreciation (cost − ${n} × the yearly charge), then compare the proceeds with it.` }),
      numPart({ id: "profit", label: "Year profit", ask: `Profit for year ${n} after depreciation and the disposal, in $ (negative for a loss)`, answer: profit, hint: "Start from profit before depreciation, deduct the year's depreciation charge, then add a gain or deduct a loss on disposal." }),
      choicePart(rng, { id: "treat", label: "Treatment", ask: "How is the disposal result treated in the income statement?", options: DISP, answer: treat, hint: "A disposal gain is income and a loss is an expense. Proceeds above the carrying value give a gain; below it, a loss." }),
    ];
    return {
      prompt: `${firm} bought ${asset} for **${money(cost)}** and depreciates it **straight-line** to a residual value of **${money(res)}**, which is **${money(D)} a year**. At the end of year ${n}, after that year's charge, it sold the asset for **${money(proceeds)}**. Profit for year ${n} before depreciation and before the disposal result is **${money(P)}**.`,
      answerType: "multi", parts,
      explanation: `- Life: (${fmt(cost)} − ${fmt(res)}) ÷ ${fmt(D)} = **${L} years**.\n- Carrying value after ${plural(n, "year")}: ${fmt(cost)} − ${n} × ${fmt(D)} = ${fmt(cv)}. Result on disposal: ${fmt(proceeds)} − ${fmt(cv)} = **${fmt(gl)}**.\n- Profit: ${fmt(P)} − ${fmt(D)} ${gl >= 0 ? "+" : "−"} ${fmt(Math.abs(gl))} = **${fmt(profit)}**.\n- Treatment: **${treat}**.`,
      given: [{ label: "_cost", value: cost }, { label: "_resid", value: res }, { label: "_charge", value: D }, { label: "_proceeds", value: proceeds }, { label: "_profit", value: P }],
      params: { kind: "asset-disposal", cost, res, D, n, proceeds, P },
    };
  }
  throw new Error("asset-review: could not draw expert-plus");
}

function verifyAsset(q, answer) {
  const p = q.params;
  const D = (p.cost - p.res) / p.L;
  if (!numOk(part(answer, "dep"), D, 0)) return false;
  // Carrying value by stepping year by year.
  let cv = p.cost;
  for (let y = 0; y < p.n; y++) cv -= D;
  if (!numOk(part(answer, "cv"), cv, 0)) return false;
  return p.tier !== "hard" || numOk(part(answer, "profit"), p.P - D, 0);
}

function verifyAssetRB(q, answer) {
  const p = q.params;
  let cv = p.cost, d = 0;
  for (let y = 1; y <= 2; y++) { d = Math.round((cv * p.rate) / 100); cv -= d; }
  if (!numOk(part(answer, "dep2"), d, 0) || !numOk(part(answer, "cv"), cv, 0) || !numOk(part(answer, "profit"), p.P - d, 0)) return false;
  const sl = p.cost / p.L;
  // Compare the two year 2 profits directly.
  const profitSL = p.P - sl, profitRB = p.P - d;
  return plainChoiceOk(q, "method", profitSL > profitRB ? "Straight-line" : "Reducing balance", part(answer, "method"));
}

function verifyAssetDisposal(q, answer) {
  const p = q.params;
  const life = (p.cost - p.res) / p.D;
  if (!numOk(part(answer, "life"), life, 0)) return false;
  let cv = p.cost;
  for (let y = 0; y < p.n; y++) cv -= p.D;
  const gl = p.proceeds - cv;
  if (!numOk(part(answer, "gl"), gl, 0) || !numOk(part(answer, "profit"), p.P - p.D + gl, 0)) return false;
  return plainChoiceOk(q, "treat", gl > 0 ? DISP[0] : gl < 0 ? DISP[1] : DISP[2], part(answer, "treat"));
}

// ---------------------------------------------------------------------------------------------
// break-even-review

const PRODUCTS = ["a new range of mugs", "a garden-tool line", "a subscription box", "a batch of phone cases", "a line of notebooks", "a set of cycling jerseys", "a gourmet sauce range"];

function genBreakEven(rng, tier) {
  const firm = rng.pick(FIRMS), prod = rng.pick(PRODUCTS);
  if (tier === "expert-plus") return genBreakEvenPlus(rng, firm, prod);
  // The decision to aim for is drawn once, so the outcomes are balanced (medium draws nothing here).
  const target = tier === "hard" ? rng.int(0, 1) * 2 : tier === "expert" ? rng.int(0, 2) : 0;
  for (let tries = 0; tries < 3000; tries++) {
    const v = rng.int(4, 30);
    const c = rng.int(3, 20);
    const p = v + c;
    const b = rng.int(4, 30) * 100;
    const B = b + rng.int(2, 30) * 100;
    const M = rng.pick([10, 15, 20, 25]);
    const t = rng.int(1, 12) * 100;
    rng.int(0, 2); // was a per-attempt target; still drawn so medium keeps its questions
    // No rng below in this attempt.
    const F = c * b;
    const mos = ((B - b) / B) * 100;
    if (tier === "medium") return buildBreakEven(rng, { firm, prod, tier, p, v, c, b, B, M, t: 0, F, mos });
    if (!safeAt(mos, 1) || Math.abs(mos - M) < 1) continue;
    let dec = 0;
    if (tier === "expert") {
      const tu = b + t;
      dec = B < tu ? 1 : mos < M ? 2 : 0;
    } else dec = mos < M ? 2 : 0;
    if (tier === "hard" && dec === 1) continue;
    if (dec !== target && tries < 2500) continue;
    return buildBreakEven(rng, { firm, prod, tier, p, v, c, b, B, M, t, F, mos });
  }
  throw new Error("break-even-review: could not draw");
}

function buildBreakEven(rng, d) {
  const { firm, prod, tier, p, v, c, b, B, M, t, F, mos } = d;
  const mos1 = r1(mos);
  const T = t * c;
  const tu = b + t;
  const parts = [numPart({ id: "be", label: "Break-even", ask: "Break-even sales in units", answer: b, hint: "Break-even units = fixed costs ÷ contribution per unit, where contribution = selling price − variable cost per unit." })];
  if (tier === "medium") parts.push(numPart({ id: "mos", label: "Margin of safety", ask: "Margin of safety in units", answer: B - b, hint: "Margin of safety (units) = budgeted units − break-even units." }));
  else {
    if (tier === "expert") parts.push(numPart({ id: "target", label: "Target profit", ask: "Units that must be sold to earn the target profit", answer: tu, hint: "Units for a target profit = (fixed costs + target profit) ÷ contribution per unit." }));
    parts.push(numPart({ id: "mospct", label: "Margin of safety", ask: "Margin of safety as a % of budgeted units (1 decimal place)", answer: mos1, tolerance: 0.05, hint: "Margin of safety % = (budgeted units − break-even units) ÷ budgeted units × 100." }));
    if (tier === "hard") parts.push(choicePart(rng, { id: "decision", label: "Decision", ask: "The board's decision", options: ["Launch: margin of safety is large enough", "Do not launch: margin of safety too thin"], answer: mos >= M ? "Launch: margin of safety is large enough" : "Do not launch: margin of safety too thin", hint: `Compare your unrounded margin of safety with ${M}%. "At least" means equal passes.` }));
    else parts.push(choicePart(rng, { id: "decision", label: "Decision", ask: "The board's decision (apply the tests in order)", options: ["Launch: both tests met", "Reject: target profit not reached", "Reject: margin of safety too thin"], answer: B < tu ? "Reject: target profit not reached" : mos < M ? "Reject: margin of safety too thin" : "Launch: both tests met", hint: "Test 1: budgeted units reach the units needed for the target profit. Test 2: the margin of safety is at least the stated %. Stop at the first test that fails." }));
  }
  const rule = tier === "medium" ? "" : tier === "hard" ? ` The board launches only if the margin of safety is **at least ${M}%**.` : ` The board launches only if (1) budgeted units reach the target profit and (2) the margin of safety is **at least ${M}%**. If a project fails, give the first test it fails.`;
  const tgt = tier === "expert" ? ` It wants a profit of **${money(T)}**.` : "";
  const lines = [`- Contribution per unit: ${p} − ${v} = ${c}. Break-even: ${fmt(F)} ÷ ${c} = **${fmt(b)} units**.`];
  if (tier === "medium") lines.push(`- Margin of safety: ${fmt(B)} − ${fmt(b)} = **${fmt(B - b)} units**.`);
  else {
    if (tier === "expert") lines.push(`- Target profit units: (${fmt(F)} + ${fmt(T)}) ÷ ${c} = **${fmt(tu)}**.`);
    lines.push(`- Margin of safety: (${fmt(B)} − ${fmt(b)}) ÷ ${fmt(B)} × 100 = **${mos1.toFixed(1)}%**.`);
    lines.push(tier === "hard" ? `- ${mos1.toFixed(1)}% is ${mos >= M ? "at least" : "below"} ${M}%.` : `- Budget ${fmt(B)} ${B >= tu ? "reaches" : "falls short of"} ${fmt(tu)}; margin ${mos1.toFixed(1)}% is ${mos >= M ? "at least" : "below"} ${M}%.`);
  }
  return {
    prompt: `${firm} is planning ${prod}. It sells at **${money(p)} a unit** with variable costs of **${money(v)} a unit** and fixed costs of **${money(F)}**. Budgeted sales are **${fmt(B)} units**.${tgt}${rule}`,
    answerType: "multi", parts, explanation: lines.join("\n"),
    given: [{ label: "_price", value: p }, { label: "_var", value: v }, { label: "_fixed", value: F }, { label: "_budget", value: B }, ...(tier === "expert" ? [{ label: "_target", value: T }] : [])],
    params: { kind: "breakeven", tier, p, v, F, B, M, T },
  };
}

function genBreakEvenPlus(rng, firm, prod) {
  for (let tries = 0; tries < 3000; tries++) {
    const v = rng.int(5, 30), c = rng.int(4, 18), p = v + c;
    const b = rng.int(4, 25) * 100;
    const B = b + rng.int(3, 25) * 100;
    const q = rng.int(2, 10) * 100;
    const E = rng.int(3, 30) * 100;
    const s = v + rng.int(1, Math.max(1, c + 1));
    const wantAcc = rng.int(0, 1);
    // No rng below in this attempt.
    if (s >= p + 1) continue;
    const F = c * b;
    const profitB = c * (B - b);
    const incr = q * (s - v) - E;
    if (incr === 0) continue;
    const accept = incr > 0;
    if ((accept ? 1 : 0) !== wantAcc && tries < 2500) continue;
    const full = F / B + v;
    const OPT = ["Accept: adds to profit", "Reject: lowers profit", "Reject: price is below the average full cost per unit"];
    const ans = accept ? OPT[0] : OPT[1];
    const parts = [
      numPart({ id: "fixed", label: "Fixed costs", ask: "The fixed costs, in $", answer: F, hint: "Budgeted profit = budgeted units × contribution per unit − fixed costs. Rearrange for fixed costs." }),
      numPart({ id: "be", label: "Break-even", ask: "Break-even sales in units", answer: b, hint: "Break-even units = fixed costs ÷ contribution per unit." }),
      numPart({ id: "order", label: "Special order", ask: "Change in profit if the special order is accepted, in $ (negative if profit falls)", answer: incr, hint: "With spare capacity and no new fixed costs, only the order's own contribution counts: units × (order price − variable cost), less any one-off cost." }),
      choicePart(rng, { id: "decision", label: "Decision", ask: "Should the special order be accepted?", options: OPT, answer: ans, hint: "Decide on the change in profit alone. The average full cost per unit includes fixed costs that do not change." }),
    ];
    return {
      prompt: `${firm} budgets to sell **${fmt(B)} units** of ${prod} at **${money(p)}** with variable costs of **${money(v)} a unit**, giving a budgeted profit of **${money(profitB)}**. A customer offers to buy **${fmt(q)} extra units** at **${money(s)}** each, which the firm can supply from spare capacity. The order needs a one-off delivery cost of **${money(E)}**, and no other costs change.`,
      answerType: "multi", parts,
      explanation: `- Contribution per unit: ${p} − ${v} = ${c}. Fixed costs: ${fmt(B)} × ${c} − ${fmt(profitB)} = **${fmt(F)}**.\n- Break-even: ${fmt(F)} ÷ ${c} = **${fmt(b)} units**.\n- Special order: ${fmt(q)} × (${s} − ${v}) − ${fmt(E)} = **${fmt(incr)}**.\n- The average full cost per unit is ${fmt(F)} ÷ ${fmt(B)} + ${v} = ${r2(full)}, but fixed costs do not change, so ignore it: **${ans}**.`,
      given: [{ label: "_price", value: p }, { label: "_var", value: v }, { label: "_budget", value: B }, { label: "_profit", value: profitB }, { label: "_oqty", value: q }, { label: "_oprice", value: s }, { label: "_oneoff", value: E }],
      params: { kind: "breakeven-plus", p, v, B, profitB, q, s, E },
    };
  }
  throw new Error("break-even-review: could not draw expert-plus");
}

function verifyBreakEven(q, answer) {
  const x = q.params;
  const c = x.p - x.v;
  const be = x.F / c;
  if (!numOk(part(answer, "be"), be, 0)) return false;
  if (x.tier === "medium") return numOk(part(answer, "mos"), x.B - be, 0);
  const mos = ((x.B - be) / x.B) * 100;
  if (!numOk(part(answer, "mospct"), r1(mos), 0.05)) return false;
  if (x.tier === "hard") return plainChoiceOk(q, "decision", mos >= x.M ? "Launch: margin of safety is large enough" : "Do not launch: margin of safety too thin", part(answer, "decision"));
  const tu = (x.F + x.T) / c;
  if (!numOk(part(answer, "target"), tu, 0)) return false;
  return plainChoiceOk(q, "decision", x.B < tu ? "Reject: target profit not reached" : mos < x.M ? "Reject: margin of safety too thin" : "Launch: both tests met", part(answer, "decision"));
}

function verifyBreakEvenPlus(q, answer) {
  const x = q.params;
  const c = x.p - x.v;
  const F = x.B * c - x.profitB;
  if (!numOk(part(answer, "fixed"), F, 0) || !numOk(part(answer, "be"), F / c, 0)) return false;
  const incr = x.q * x.s - x.q * x.v - x.E;
  if (!numOk(part(answer, "order"), incr, 0)) return false;
  return plainChoiceOk(q, "decision", incr > 0 ? "Accept: adds to profit" : "Reject: lowers profit", part(answer, "decision"));
}

// ---------------------------------------------------------------------------------------------
// budget-variance
// Convention (stated in every prompt): a variance that raises profit is favourable, one that lowers it is adverse;
// the sales volume variance is valued at the budgeted contribution per unit. All figures are whole dollars.

const FA = ["Favourable", "Adverse"];
const IG = ["Investigate", "Ignore"];
const faOf = (x) => (x >= 0 ? "Favourable" : "Adverse");
const sgn = (x) => (x > 0 ? 1 : -1);
const signed = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + fmt(Math.abs(x));
const SIGN_RULE = "A variance that raises profit is favourable and one that lowers it is adverse.";

function genBudgetVariance(rng, tier) {
  const firm = rng.pick(FIRMS), prod = rng.pick(PRODUCTS);
  if (tier === "expert-plus") return genBudgetPlus(rng, firm, prod);
  // Expert aims for a decision drawn once, so both outcomes are common (medium and hard draw nothing here).
  const target = tier === "expert" ? rng.int(0, 1) : 0;
  for (let tries = 0; tries < 3000; tries++) {
    const B = rng.int(4, 20) * 100;
    const p = rng.int(12, 40);
    const v = rng.int(4, p - 4);
    const sA = rng.pick([-1, 1]), sP = rng.pick([-1, 1]), sC = rng.pick([-1, 1]);
    const A = B + sA * rng.int(1, 8) * 50;
    const pa = p + sP * rng.int(1, 4);
    const va = v + sC * rng.int(1, 3);
    const k = rng.pick([30, 40, 50, 60]);
    const dF = rng.int(1, 6) * 100 * rng.pick([-1, 1]);
    const M = rng.pick([10, 15, 20, 30]);
    rng.int(0, 1); // was a per-attempt target; still drawn so medium and hard keep their questions
    // No rng below in this attempt.
    if (A <= 0 || pa <= v || va <= 0 || va >= pa) continue;
    if (tier === "medium") return buildBudgetMedium(rng, { firm, prod, B, p, v, A, pa });
    if (tier === "hard") return buildBudgetHard(rng, { firm, prod, B, p, v, A, pa, va });
    const F = Math.round((B * (p - v) * k) / 100 / 100) * 100;
    const Fa = F + dF;
    if (F <= 0 || Fa <= 0) continue;
    const bp = B * (p - v) - F;
    if (bp <= 0) continue;
    const tv = A * (pa - v) - Fa - bp;
    if (tv === 0) continue;
    const pct = (Math.abs(tv) / bp) * 100;
    if (Math.abs(pct - M) < 1) continue;
    const inv = pct >= M ? 1 : 0;
    if (inv !== target && tries < 2500) continue;
    return buildBudgetExpert(rng, { firm, prod, B, p, v, A, pa, F, Fa, M, bp, tv });
  }
  throw new Error("budget-variance: could not draw");
}

function amountOpts(correct, d, A, B) {
  const c = [correct, B * d, d, Math.abs(A - B) * d, A * (d + 1), d > 1 ? A * (d - 1) : A * (d + 2), B * (d + 1), A * d * 2];
  const out = [];
  for (const x of c) if (x > 0 && !out.includes(x)) out.push(x);
  for (let k = 1; out.length < 6; k++) { const x = correct + 100 * k; if (!out.includes(x)) out.push(x); }
  return out.map(money);
}

function buildBudgetMedium(rng, d) {
  const { firm, prod, B, p, v, A, pa } = d;
  const dp = pa - p;
  const flexRev = A * p, pv = dp * A;
  const parts = [
    numPart({ id: "flexrev", label: "Flexed budget", ask: "Flexed budget sales revenue, in $ (budgeted price × actual units)", answer: flexRev, hint: "Flex the budget to the actual volume: keep the budgeted selling price and multiply by the units actually sold." }),
    segPart(rng, { id: "pricevar", label: "Price variance", ask: "The sales price variance: its size and whether it is favourable or adverse", cols: ["Variance", "Direction"], answer: [money(Math.abs(pv)), faOf(pv)], opts: [amountOpts(Math.abs(pv), Math.abs(dp), A, B), FA], hint: "Sales price variance = (actual price − budgeted price) × actual units. Selling above the budgeted price raises profit." }),
  ];
  return {
    prompt: `${firm} budgeted to sell **${fmt(B)} units** of ${prod} at **${money(p)}** each, with variable costs of **${money(v)} a unit**. It actually sold **${fmt(A)} units** at **${money(pa)}** each, and variable cost per unit was as budgeted. ${SIGN_RULE}`,
    answerType: "multi", parts,
    explanation: `- Flexed budget revenue: ${fmt(A)} × ${p} = **${money(flexRev)}**.\n- Actual revenue: ${fmt(A)} × ${pa} = ${money(A * pa)}, so the price variance is ${money(A * pa)} − ${money(flexRev)} = ${money(Math.abs(pv))}, **${faOf(pv).toLowerCase()}** (${dp > 0 ? "sold above" : "sold below"} the budgeted price).`,
    given: [{ label: "_budunits", value: B }, { label: "_bprice", value: p }, { label: "_actunits", value: A }, { label: "_aprice", value: pa }],
    params: { kind: "budget-medium", B, p, v, A, pa },
  };
}

function buildBudgetHard(rng, d) {
  const { firm, prod, B, p, v, A, pa, va } = d;
  const pv = (pa - p) * A, vv = (A - B) * (p - v), cv = (v - va) * A;
  const parts = [
    numPart({ id: "pricevar", label: "Price variance", ask: "Sales price variance, in $ (positive if favourable, negative if adverse)", answer: pv, hint: "Sales price variance = (actual price − budgeted price) × actual units." }),
    numPart({ id: "volvar", label: "Volume variance", ask: "Sales volume variance, in $ (positive if favourable, negative if adverse)", answer: vv, hint: "Sales volume variance = (actual units − budgeted units) × budgeted contribution per unit, where contribution = budgeted price − budgeted variable cost." }),
    segPart(rng, { id: "directions", label: "Directions", ask: "For each variance, favourable or adverse (the variable cost variance is on the actual units)", cols: ["Price", "Volume", "Variable cost"], answer: [faOf(pv), faOf(vv), faOf(cv)], opts: [FA, FA, FA], hint: "Price and volume signs are in your answers. For variable cost, compare actual cost per unit with the budgeted cost per unit: spending less per unit raises profit." }),
  ];
  return {
    prompt: `${firm} budgeted to sell **${fmt(B)} units** of ${prod} at **${money(p)}** each with variable costs of **${money(v)} a unit**. Actually it sold **${fmt(A)} units** at **${money(pa)}** each, and variable cost was **${money(va)} a unit**. ${SIGN_RULE} The volume variance is valued at the budgeted contribution per unit.`,
    answerType: "multi", parts,
    explanation: `- Price: (${pa} − ${p}) × ${fmt(A)} = **${signed(pv)}**, ${faOf(pv).toLowerCase()}.\n- Volume: (${fmt(A)} − ${fmt(B)}) × (${p} − ${v}) = **${signed(vv)}**, ${faOf(vv).toLowerCase()}.\n- Variable cost: (${v} − ${va}) × ${fmt(A)} = ${signed(cv)}, **${faOf(cv).toLowerCase()}**.`,
    given: [{ label: "_budunits", value: B }, { label: "_bprice", value: p }, { label: "_bvar", value: v }, { label: "_actunits", value: A }, { label: "_aprice", value: pa }, { label: "_avar", value: va }],
    params: { kind: "budget-hard", B, p, v, A, pa, va },
  };
}

function buildBudgetExpert(rng, d) {
  const { firm, prod, B, p, v, A, pa, F, Fa, M, bp, tv } = d;
  const flex = A * (p - v) - F, pv = (pa - p) * A;
  const pct = (Math.abs(tv) / bp) * 100;
  const OPT = ["Investigate: the variance is large enough", "No investigation needed"];
  const parts = [
    numPart({ id: "flexprofit", label: "Flexed budget", ask: "Flexed budget profit at the actual units, in $", answer: flex, hint: "Flexed budget profit = actual units × budgeted contribution per unit − budgeted fixed costs." }),
    numPart({ id: "pricevar", label: "Price variance", ask: "Sales price variance, in $ (positive if favourable, negative if adverse)", answer: pv, hint: "Sales price variance = (actual price − budgeted price) × actual units." }),
    numPart({ id: "totalvar", label: "Total variance", ask: "Total profit variance: actual profit − original budgeted profit, in $ (positive if favourable)", answer: tv, hint: "Actual profit = actual units × (actual price − budgeted variable cost) − actual fixed costs. Budgeted profit = budgeted units × budgeted contribution − budgeted fixed costs." }),
    choicePart(rng, { id: "decision", label: "Decision", ask: "Does the total variance need investigating?", options: OPT, answer: pct >= M ? OPT[0] : OPT[1], hint: `Compare the size of the total variance, as a % of budgeted profit, with ${M}%. "At least" means equal passes. Use unrounded figures.` }),
  ];
  return {
    prompt: `${firm} budgeted to sell **${fmt(B)} units** of ${prod} at **${money(p)}** each, with variable costs of **${money(v)} a unit** and fixed costs of **${money(F)}**. It actually sold **${fmt(A)} units** at **${money(pa)}** each. Variable cost per unit was as budgeted, and fixed costs were **${money(Fa)}**. ${SIGN_RULE} Management investigates any total profit variance whose size is **at least ${M}%** of budgeted profit, favourable or adverse.`,
    answerType: "multi", parts,
    explanation: `- Flexed budget profit: ${fmt(A)} × (${p} − ${v}) − ${fmt(F)} = **${money(flex)}**.\n- Price variance: (${pa} − ${p}) × ${fmt(A)} = **${signed(pv)}**.\n- Budgeted profit: ${fmt(B)} × ${p - v} − ${fmt(F)} = ${money(bp)}. Actual profit: ${fmt(A)} × (${pa} − ${v}) − ${fmt(Fa)} = ${money(A * (pa - v) - Fa)}. Total variance = **${signed(tv)}**.\n- ${fmt(Math.abs(tv))} ÷ ${fmt(bp)} = ${r1(pct).toFixed(1)}% is ${pct >= M ? "at least" : "below"} ${M}%: **${pct >= M ? OPT[0] : OPT[1]}**.`,
    given: [{ label: "_budunits", value: B }, { label: "_bprice", value: p }, { label: "_bvar", value: v }, { label: "_bfixed", value: F }, { label: "_actunits", value: A }, { label: "_aprice", value: pa }, { label: "_afixed", value: Fa }],
    params: { kind: "budget-expert", B, p, v, F, A, pa, Fa, M },
  };
}

function genBudgetPlus(rng, firm, prod) {
  for (let tries = 0; tries < 4000; tries++) {
    const B = rng.int(4, 20) * 100;
    const p = rng.int(12, 40);
    const v = rng.int(4, p - 4);
    const A = B + rng.pick([-1, 1]) * rng.int(1, 8) * 50;
    const pa = p + rng.pick([-1, 1]) * rng.int(1, 4);
    const va = v + rng.pick([-1, 1]) * rng.int(1, 3);
    const M = rng.pick([3, 5, 8, 10]);
    const want = rng.int(1, 2);
    // No rng below in this attempt.
    if (A <= 0 || pa <= v || va <= 0 || va >= pa) continue;
    const pcts = [(Math.abs(pa - p) / p) * 100, (Math.abs(A - B) / B) * 100, (Math.abs(v - va) / v) * 100];
    if (pcts.some((x) => Math.abs(x - M) < 1)) continue;
    const flags = pcts.map((x) => x >= M);
    if (flags.filter(Boolean).length !== want && tries < 3500) continue;
    const vv = (A - B) * (p - v), pv = (pa - p) * A, cv = (v - va) * A;
    const parts = [
      numPart({ id: "units", label: "Actual units", ask: "The actual units sold", answer: A, hint: "The volume variance = (actual units − budgeted units) × budgeted contribution per unit. Work backwards: divide by the contribution, then add to or take from the budgeted units, using the sign (favourable means more units)." }),
      numPart({ id: "pricevar", label: "Price variance", ask: "Sales price variance, in $ (positive if favourable, negative if adverse)", answer: pv, hint: "Sales price variance = (actual price − budgeted price) × the actual units you found." }),
      numPart({ id: "costvar", label: "Cost variance", ask: "Variable cost variance, in $ (positive if favourable, negative if adverse)", answer: cv, hint: "Variable cost variance = (budgeted cost per unit − actual cost per unit) × actual units." }),
      segPart(rng, { id: "review", label: "Review", ask: "For each variance, investigate or ignore", cols: ["Price", "Volume", "Variable cost"], answer: flags.map((f) => IG[f ? 0 : 1]), opts: [IG, IG, IG], hint: `Express each variance as a % of its budget figure and compare with ${M}%. "At least" means equal passes. Price: budgeted price × actual units. Volume: budgeted contribution on the budgeted units. Cost: budgeted cost per unit × actual units.` }),
    ];
    return {
      prompt: `${firm} budgeted to sell **${fmt(B)} units** of ${prod} at **${money(p)}** each with variable costs of **${money(v)} a unit**. The sales volume variance was **${money(Math.abs(vv))} ${faOf(vv).toLowerCase()}** (valued at the budgeted contribution per unit). Actual price was **${money(pa)}** and actual variable cost was **${money(va)} a unit**. ${SIGN_RULE} Management investigates any variance whose size is **at least ${M}%** of its budget figure: price against flexed budget revenue (budgeted price × actual units), volume against budgeted contribution, and variable cost against flexed budget variable cost (budgeted cost × actual units).`,
      answerType: "multi", parts,
      explanation: `- Contribution per unit: ${p} − ${v} = ${p - v}. Units difference: ${fmt(Math.abs(vv))} ÷ ${p - v} = ${fmt(Math.abs(A - B))}, so actual units = ${fmt(B)} ${A > B ? "+" : "−"} ${fmt(Math.abs(A - B))} = **${fmt(A)}**.\n- Price: (${pa} − ${p}) × ${fmt(A)} = **${signed(pv)}**.\n- Variable cost: (${v} − ${va}) × ${fmt(A)} = **${signed(cv)}**.\n- Price ${r1(pcts[0]).toFixed(1)}%, volume ${r1(pcts[1]).toFixed(1)}%, cost ${r1(pcts[2]).toFixed(1)}% against ${M}%: **${flags.map((f, i) => ["price", "volume", "variable cost"][i] + " " + (f ? "investigate" : "ignore")).join(", ")}**.`,
      given: [{ label: "_budunits", value: B }, { label: "_bprice", value: p }, { label: "_bvar", value: v }, { label: "_volvar", value: Math.abs(vv) }, { label: "_aprice", value: pa }, { label: "_avar", value: va }],
      params: { kind: "budget-plus", B, p, v, vvAbs: Math.abs(vv), vvSign: sgn(vv), pa, va, M },
    };
  }
  throw new Error("budget-variance: could not draw expert-plus");
}

function verifyBudgetMedium(q, answer) {
  const x = q.params;
  if (!numOk(part(answer, "flexrev"), x.A * x.p, 0)) return false;
  const pv = (x.pa - x.p) * x.A;
  return segChoiceOk(q, "pricevar", [money(Math.abs(pv)), pv >= 0 ? "Favourable" : "Adverse"], part(answer, "pricevar"));
}

function verifyBudgetHard(q, answer) {
  const x = q.params;
  const pv = x.A * x.pa - x.A * x.p, vv = x.A * (x.p - x.v) - x.B * (x.p - x.v), cv = x.A * x.v - x.A * x.va;
  if (!numOk(part(answer, "pricevar"), pv, 0) || !numOk(part(answer, "volvar"), vv, 0)) return false;
  return segChoiceOk(q, "directions", [pv >= 0 ? "Favourable" : "Adverse", vv >= 0 ? "Favourable" : "Adverse", cv >= 0 ? "Favourable" : "Adverse"], part(answer, "directions"));
}

function verifyBudgetExpert(q, answer) {
  const x = q.params;
  const flex = x.A * x.p - x.A * x.v - x.F;
  const actual = x.A * x.pa - x.A * x.v - x.Fa, budget = x.B * x.p - x.B * x.v - x.F;
  if (!numOk(part(answer, "flexprofit"), flex, 0)) return false;
  if (!numOk(part(answer, "pricevar"), x.A * x.pa - x.A * x.p, 0)) return false;
  if (!numOk(part(answer, "totalvar"), actual - budget, 0)) return false;
  const big = Math.abs(actual - budget) * 100 >= x.M * budget;
  return plainChoiceOk(q, "decision", big ? "Investigate: the variance is large enough" : "No investigation needed", part(answer, "decision"));
}

function verifyBudgetPlus(q, answer) {
  const x = q.params;
  const c = x.p - x.v;
  const A = x.B + (x.vvSign * x.vvAbs) / c;
  if (!numOk(part(answer, "units"), A, 0)) return false;
  if (!numOk(part(answer, "pricevar"), A * x.pa - A * x.p, 0)) return false;
  if (!numOk(part(answer, "costvar"), A * x.v - A * x.va, 0)) return false;
  const big = [Math.abs(x.pa - x.p) * A * 100 >= x.M * (A * x.p), x.vvAbs * 100 >= x.M * (x.B * c), Math.abs(x.v - x.va) * A * 100 >= x.M * (A * x.v)];
  return segChoiceOk(q, "review", big.map((b) => (b ? "Investigate" : "Ignore")), part(answer, "review"));
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  const tier = ["medium", "hard", "expert", "expert-plus"].includes(difficulty) ? difficulty : "expert-plus";
  switch (subtopic) {
    case "transaction-review": return genTransaction(rng, tier);
    case "audit-review": return genAudit(rng, tier);
    case "asset-review": return genAsset(rng, tier);
    case "break-even-review": return genBreakEven(rng, tier);
    case "budget-variance": return genBudgetVariance(rng, tier);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

export function verify(question, answer) {
  try {
    const p = question && question.params;
    if (!p || question.answerType !== "multi" || !answer || typeof answer !== "object") return false;
    switch (p.kind) {
      case "transaction": return verifyTransaction(question, answer);
      case "transaction-plus": return verifyTransactionPlus(question, answer);
      case "audit": return verifyAudit(question, answer);
      case "audit-plus": return verifyAuditPlus(question, answer);
      case "asset": return verifyAsset(question, answer);
      case "asset-rb": return verifyAssetRB(question, answer);
      case "asset-disposal": return verifyAssetDisposal(question, answer);
      case "breakeven": return verifyBreakEven(question, answer);
      case "breakeven-plus": return verifyBreakEvenPlus(question, answer);
      case "budget-medium": return verifyBudgetMedium(question, answer);
      case "budget-hard": return verifyBudgetHard(question, answer);
      case "budget-expert": return verifyBudgetExpert(question, answer);
      case "budget-plus": return verifyBudgetPlus(question, answer);
      default: return false;
    }
  } catch {
    return false;
  }
}
