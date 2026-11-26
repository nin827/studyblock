// Accounting Theory generator. Uses only the seeded rng passed in by the engine.
// Subtopics: double-entry (transaction → Debit | Credit; Expert balances a ledger account), concepts
// (accruals/matching, prudence, consistency, going concern, business entity, materiality),
// classification (statement and category, the 12-month rule) and equation (effect on Assets |
// Liabilities | Equity; Expert runs three transactions). Conventions: goods bought go to Inventory,
// sales record revenue only (cost of sales is ignored), depreciation uses Accumulated depreciation.
// verify() never trusts the generator's dr/cr or effect tables: it derives them from each account's
// type and normal side (V_ACC) and the increase/decrease list on the transaction.

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

function checkDifficulty(d) {
  if (!["easy", "medium", "hard", "expert"].includes(d)) throw new Error(`unknown difficulty ${d}`);
}

const money = (n) => `$${n.toLocaleString("en-US")}`;

// ---------------------------------------------------------------------------------------------
// Transactions. dr/cr are the generator's own answer; `eff` lists the accounts that change and
// whether each goes up (+1) or down (−1). verify() derives debit and credit from `eff` and the
// account types, so the two tables check each other.

const TX = [
  // easy: cash only
  { id: "equipcash", lvl: 0, text: (a) => `paid ${money(a)} in cash for new equipment`, dr: "Equipment", cr: "Cash", eff: [["Equipment", 1], ["Cash", -1]], altDr: ["Inventory", "Cash", "Capital"], altCr: ["Equipment", "Trade payables", "Capital"] },
  { id: "salecash", lvl: 0, text: (a) => `sold goods for ${money(a)} in cash (ignore the cost of the goods sold)`, dr: "Cash", cr: "Sales revenue", eff: [["Cash", 1], ["Sales revenue", 1]], altDr: ["Sales revenue", "Trade receivables", "Inventory"], altCr: ["Cash", "Capital", "Trade payables"] },
  { id: "capital", lvl: 0, text: (a) => `received ${money(a)} of the owner's personal savings into the business bank account`, dr: "Cash", cr: "Capital", eff: [["Cash", 1], ["Capital", 1]], altDr: ["Capital", "Drawings", "Bank loan"], altCr: ["Cash", "Sales revenue", "Bank loan"] },
  { id: "rent", lvl: 0, text: (a) => `paid this month's rent of ${money(a)}`, dr: "Rent expense", cr: "Cash", eff: [["Rent expense", 1], ["Cash", -1]], altDr: ["Cash", "Capital", "Trade payables"], altCr: ["Rent expense", "Sales revenue", "Capital"] },
  { id: "wages", lvl: 0, text: (a) => `paid staff wages of ${money(a)}`, dr: "Wages expense", cr: "Cash", eff: [["Wages expense", 1], ["Cash", -1]], altDr: ["Cash", "Trade payables", "Drawings"], altCr: ["Wages expense", "Capital", "Trade payables"] },
  { id: "loan", lvl: 0, text: (a) => `took out a bank loan of ${money(a)}, paid into its bank account`, dr: "Cash", cr: "Bank loan", eff: [["Cash", 1], ["Bank loan", 1]], altDr: ["Bank loan", "Interest expense", "Capital"], altCr: ["Cash", "Capital", "Sales revenue"] },
  { id: "invcash", lvl: 0, text: (a) => `bought goods for resale for ${money(a)} in cash`, dr: "Inventory", cr: "Cash", eff: [["Inventory", 1], ["Cash", -1]], altDr: ["Cash", "Sales revenue", "Equipment"], altCr: ["Inventory", "Trade payables", "Sales revenue"] },
  { id: "elec", lvl: 0, text: (a) => `paid an electricity bill of ${money(a)}`, dr: "Electricity expense", cr: "Cash", eff: [["Electricity expense", 1], ["Cash", -1]], altDr: ["Cash", "Trade payables", "Equipment"], altCr: ["Electricity expense", "Trade payables", "Capital"] },
  { id: "intinc", lvl: 0, text: (a) => `received bank interest of ${money(a)}`, dr: "Cash", cr: "Interest income", eff: [["Cash", 1], ["Interest income", 1]], altDr: ["Interest income", "Interest expense", "Bank loan"], altCr: ["Cash", "Bank loan", "Capital"] },
  // medium: credit and settlements
  { id: "invcredit", lvl: 1, text: (a) => `bought goods for resale costing ${money(a)} on credit from a supplier`, dr: "Inventory", cr: "Trade payables", eff: [["Inventory", 1], ["Trade payables", 1]], altDr: ["Trade payables", "Trade receivables", "Cash"], altCr: ["Cash", "Trade receivables", "Inventory"] },
  { id: "salecredit", lvl: 1, text: (a) => `sold goods for ${money(a)} on credit to a customer (ignore the cost of the goods sold)`, dr: "Trade receivables", cr: "Sales revenue", eff: [["Trade receivables", 1], ["Sales revenue", 1]], altDr: ["Trade payables", "Cash", "Sales revenue"], altCr: ["Trade receivables", "Trade payables", "Cash"] },
  { id: "custpays", lvl: 1, text: (a) => `received ${money(a)} from a credit customer, settling what they owed`, dr: "Cash", cr: "Trade receivables", eff: [["Cash", 1], ["Trade receivables", -1]], altDr: ["Trade receivables", "Trade payables", "Sales revenue"], altCr: ["Sales revenue", "Trade payables", "Cash"] },
  { id: "paysupp", lvl: 1, text: (a) => `paid a supplier ${money(a)} that it owed for earlier credit purchases`, dr: "Trade payables", cr: "Cash", eff: [["Trade payables", -1], ["Cash", -1]], altDr: ["Inventory", "Trade receivables", "Cash"], altCr: ["Trade payables", "Inventory", "Trade receivables"] },
  { id: "repay", lvl: 1, text: (a) => `repaid ${money(a)} of its bank loan (no interest included)`, dr: "Bank loan", cr: "Cash", eff: [["Bank loan", -1], ["Cash", -1]], altDr: ["Interest expense", "Cash", "Capital"], altCr: ["Bank loan", "Interest income", "Capital"] },
  { id: "drawcash", lvl: 1, text: (a) => `paid the owner ${money(a)} from the business bank account for personal use`, dr: "Drawings", cr: "Cash", eff: [["Drawings", 1], ["Cash", -1]], altDr: ["Wages expense", "Cash", "Trade payables"], altCr: ["Drawings", "Capital", "Sales revenue"] },
  { id: "vancredit", lvl: 1, text: (a) => `bought a delivery van for ${money(a)} on credit from a car dealer`, dr: "Vehicles", cr: "Other payables", eff: [["Vehicles", 1], ["Other payables", 1]], altDr: ["Inventory", "Other payables", "Cash"], altCr: ["Cash", "Vehicles", "Trade receivables"] },
  { id: "intexp", lvl: 1, text: (a) => `paid ${money(a)} of interest on its bank loan`, dr: "Interest expense", cr: "Cash", eff: [["Interest expense", 1], ["Cash", -1]], altDr: ["Bank loan", "Interest income", "Cash"], altCr: ["Interest expense", "Bank loan", "Interest income"] },
  // hard: returns, write-offs, goods for own use, prepayments, depreciation, disposals at cost
  { id: "retout", lvl: 2, text: (a) => `returned faulty goods costing ${money(a)} to a supplier it had bought from on credit`, dr: "Trade payables", cr: "Inventory", eff: [["Trade payables", -1], ["Inventory", -1]], altDr: ["Inventory", "Trade receivables", "Cash"], altCr: ["Trade payables", "Cash", "Sales revenue"] },
  { id: "retin", lvl: 2, text: (a) => `accepted back goods sold for ${money(a)} on credit, returned by a customer (ignore the inventory coming back)`, dr: "Sales returns", cr: "Trade receivables", eff: [["Sales returns", 1], ["Trade receivables", -1]], altDr: ["Trade receivables", "Trade payables", "Cash"], altCr: ["Sales returns", "Trade payables", "Cash"] },
  { id: "baddebt", lvl: 2, text: (a) => `wrote off ${money(a)} owed by a credit customer who has gone out of business`, dr: "Irrecoverable debts", cr: "Trade receivables", eff: [["Irrecoverable debts", 1], ["Trade receivables", -1]], altDr: ["Trade receivables", "Cash", "Trade payables"], altCr: ["Irrecoverable debts", "Cash", "Trade payables"] },
  { id: "drawgoods", lvl: 2, text: (a) => `let the owner take goods costing ${money(a)} from inventory for personal use`, dr: "Drawings", cr: "Inventory", eff: [["Drawings", 1], ["Inventory", -1]], altDr: ["Inventory", "Wages expense", "Sales revenue"], altCr: ["Drawings", "Cash", "Sales revenue"] },
  { id: "prepay", lvl: 2, text: (a) => `paid ${money(a)} for next year's insurance cover in advance (recorded as a prepayment)`, dr: "Prepaid insurance", cr: "Cash", eff: [["Prepaid insurance", 1], ["Cash", -1]], altDr: ["Cash", "Trade payables", "Equipment"], altCr: ["Prepaid insurance", "Trade payables", "Capital"] },
  { id: "deprec", lvl: 2, text: (a) => `charged depreciation of ${money(a)} on its equipment for the year`, dr: "Depreciation expense", cr: "Accumulated depreciation", eff: [["Depreciation expense", 1], ["Accumulated depreciation", 1]], altDr: ["Accumulated depreciation", "Cash", "Equipment"], altCr: ["Depreciation expense", "Cash", "Capital"] },
  { id: "sellequip", lvl: 2, text: (a) => `sold unused equipment for ${money(a)} in cash, exactly what it cost (it had no depreciation)`, dr: "Cash", cr: "Equipment", eff: [["Cash", 1], ["Equipment", -1]], altDr: ["Equipment", "Inventory", "Sales revenue"], altCr: ["Sales revenue", "Inventory", "Cash"] },
];
const TX_BY = Object.fromEntries(TX.map((t) => [t.id, t]));
const LVL = { easy: 0, medium: 1, hard: 2 };

const DE_HINTS = [
  "Find the two accounts that change, and whether each goes up or down.",
  "Assets, expenses and drawings go **up on the debit** side. Liabilities, capital and income go **up on the credit** side. A decrease goes on the opposite side.",
];

function amountFor(rng) {
  return rng.pick([rng.int(2, 99) * 10, rng.int(4, 60) * 50, rng.int(2, 40) * 100]);
}

// Wrong pairs: change the debit or the credit (never both). A pair naming one account on both sides
// is never offered as an option, but its block stays as a Build decoy.
function deCands(t) {
  return [...t.altDr.map((d) => [d, t.cr]), ...t.altCr.map((c) => [t.dr, c])].filter((c) => c[0] !== c[1]);
}
function deExtra(t) {
  return [...t.altDr.map((d) => ["Debit", d]), ...t.altCr.map((c) => ["Credit", c])];
}

function genDoubleEntry(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff !== "expert") {
    const pool = TX.filter((t) => t.lvl === LVL[diff]);
    const t = rng.pick(pool);
    const a = amountFor(rng);
    const up = t.eff.map(([acc, s]) => `${acc} ${s > 0 ? "increases" : "decreases"}`).join("; ");
    return {
      prompt: `${firm} ${t.text(a)}. Using **double entry**, which account is debited and which is credited?`,
      ...segChoice(["Debit", "Credit"], [t.dr, t.cr], deCands(t), rng, diff, deExtra(t)),
      explanation: `${up}.\n\n- Debit **${t.dr}** ${money(a)}\n- Credit **${t.cr}** ${money(a)}`,
      hints: DE_HINTS,
      params: { diff, kind: "de", tx: t.id, amount: a },
    };
  }
  // expert: post several transactions and find one account's balance
  const targets = ["Cash", "Trade receivables", "Trade payables"];
  const target = rng.pick(targets);
  const touching = TX.filter((t) => t.eff.some(([acc]) => acc === target));
  const steps = [];
  for (let i = 0; i < 4; i++) {
    const t = rng.pick(i < 2 ? touching : TX.filter((x) => x.lvl <= 2));
    steps.push({ tx: t.id, amount: amountFor(rng) });
  }
  const open = rng.int(0, 1) ? rng.int(5, 40) * 100 : 0;
  const assetLike = target !== "Trade payables";
  const posts = steps.filter((s) => TX_BY[s.tx].dr === target || TX_BY[s.tx].cr === target).length;
  let net = assetLike ? open : -open; // debit-positive
  for (const s of steps) {
    const t = TX_BY[s.tx];
    if (t.dr === target) net += s.amount;
    if (t.cr === target) net -= s.amount;
  }
  if (net === 0 || posts < 2) return genDoubleEntry("expert", rng);
  const openTxt = open ? `${target} starts the month with a **${assetLike ? "debit" : "credit"}** balance of ${money(open)}. ` : `${target} starts the month with a zero balance. `;
  const sideN = net > 0 ? "Debit" : "Credit";
  return {
    prompt: `${openTxt}During the month, ${firm}:\n\n${steps.map((s, i) => `${i + 1}. ${TX_BY[s.tx].text(s.amount)}`).join("\n")}\n\nPost the entries that affect **${target}** and balance the account.`,
    answerType: "multi",
    parts: [
      { id: "balance", label: "Balance", ask: `What is the closing balance of ${target}, as a positive amount (number only)?`, answerType: "number", answer: Math.abs(net), tolerance: 0, hint: `Only post transactions that touch ${target}. Debits on one side, credits on the other; the balance is the difference.` },
      { id: "side", label: "Side", ask: "Is it a debit or a credit balance?", answerType: "choice", answer: sideN, choices: ["Debit", "Credit"], hint: "The balance sits on the side with the bigger total." },
    ],
    explanation: `Entries in ${target}:\n\n${open ? `- Opening ${assetLike ? "debit" : "credit"} ${money(open)}\n` : ""}${steps.map((s) => {
      const t = TX_BY[s.tx];
      if (t.dr === target) return `- Debit ${money(s.amount)} (${t.text(s.amount)})`;
      if (t.cr === target) return `- Credit ${money(s.amount)} (${t.text(s.amount)})`;
      return `- No entry: ${t.text(s.amount)}`;
    }).join("\n")}\n\nNet: **${money(Math.abs(net))} ${sideN.toLowerCase()}** balance.`,
    params: { diff, kind: "ledger", target, open, assetLike, steps },
  };
}

// ---------------------------------------------------------------------------------------------
// Accounting concepts

const CONCEPTS = ["Accruals (matching)", "Prudence", "Consistency", "Going concern", "Business entity", "Materiality"];
// right: the correct treatment; wrong: tempting treatments; mistake: the wrong one done, as a past action.
const SCEN = [
  { c: 0, sit: (f, a) => `${f}'s electricity bill of ${money(a)} for December arrives, and is paid, in January. The year ends on 31 December.`, right: "Expense it in December's year", wrong: ["Expense it next year, when paid", "Leave it out of the accounts"], mistake: (f, a) => `${f} left December's ${money(a)} electricity bill out of this year's accounts because it was paid in January.` },
  { c: 0, sit: (f, a) => `Staff at ${f} earned ${money(a)} of wages in the last week of the year, to be paid in the first week of next year.`, right: "Record the wages this year", wrong: ["Record the wages next year", "Record half in each year"], mistake: (f, a) => `${f} recorded ${money(a)} of wages earned this year as next year's expense, because they were paid next year.` },
  { c: 0, sit: (f, a) => `${f} bought a machine for ${money(a)}. It will help earn revenue for the next 5 years.`, right: "Spread its cost over 5 years", wrong: ["Expense it all this year", "Expense it in year 5"], mistake: (f, a) => `${f} charged the full ${money(a)} cost of a machine that will be used for 5 years as this year's expense.` },
  { c: 0, sit: (f, a) => `A tenant owes ${f} ${money(a)} of rent for the year's final month and will pay it next year.`, right: "Record the income this year", wrong: ["Record the income next year", "Never record the income"], mistake: (f, a) => `${f} left ${money(a)} of rent earned this year out of this year's income because the tenant pays next year.` },
  { c: 1, sit: (f, a) => `A customer who owes ${f} ${money(a)} has gone bankrupt and will not pay.`, right: "Write the debt off now", wrong: ["Keep it as a receivable", "Wait until next year to decide"], mistake: (f, a) => `${f} still shows ${money(a)} owed by a bankrupt customer as a receivable.` },
  { c: 1, sit: (f, a) => `Inventory at ${f} cost ${money(a)}, but is now damaged and can only be sold for much less.`, right: "Value it at the lower amount", wrong: ["Keep it at its original cost", "Value it at its normal price"], mistake: (f, a) => `${f} valued damaged inventory at its full cost of ${money(a)}, although it can only be sold for much less.` },
  { c: 1, sit: (f, a) => `${f} hopes to win a contract worth ${money(a)} next year, but nothing has been agreed.`, right: "Do not record the income", wrong: ["Record the income now", "Record half the income now"], mistake: (f, a) => `${f} included ${money(a)} of profit from a contract it only hopes to win next year.` },
  { c: 2, sit: (f) => `${f} has always depreciated its vans with the straight-line method. Nothing about how the vans are used has changed.`, right: "Keep using straight-line", wrong: ["Switch method to raise profit", "Pick a method each year"], mistake: (f) => `${f} switched van depreciation from straight-line to another method this year just to show a higher profit.` },
  { c: 2, sit: (f) => `${f} has always valued inventory using FIFO, and its business has not changed.`, right: "Keep valuing inventory by FIFO", wrong: ["Change the method every year", "Use whichever gives more profit"], mistake: (f) => `${f} changed its inventory valuation method this year only because the new one gave a higher profit.` },
  { c: 3, sit: (f) => `${f} is expected to keep trading normally for the foreseeable future.`, right: "Value assets at cost less depreciation", wrong: ["Value assets at forced-sale prices", "Value assets at zero"], mistake: (f) => `${f}, which expects to keep trading for many years, valued its machines at the price they would fetch in a quick forced sale.` },
  { c: 3, sit: (f) => `${f} will close next month, and all of its assets will be sold off.`, right: "Value assets at break-up value", wrong: ["Keep assets at cost less depreciation", "Value assets at their original cost"], mistake: (f) => `${f}, which closes next month, still values its assets at cost less depreciation instead of what they will sell for.` },
  { c: 4, sit: (f, a) => `The owner of ${f} pays ${money(a)} for a family holiday from the business bank account.`, right: "Record it as drawings", wrong: ["Record it as a business expense", "Leave it out of the accounts"], mistake: (f, a) => `${f} recorded the owner's ${money(a)} family holiday as a business expense.` },
  { c: 4, sit: (f, a) => `The owner of ${f} pays a ${money(a)} business supplier invoice from a personal bank account.`, right: "Record it as extra capital", wrong: ["Ignore it: not business money", "Record it as business income"], mistake: (f, a) => `${f} left out a ${money(a)} supplier invoice because the owner paid it from a personal account.` },
  { c: 5, sit: (f) => `${f} buys a $12 stapler that should last 10 years.`, right: "Expense it straight away", wrong: ["Depreciate it over 10 years", "Show it as a non-current asset"], mistake: (f) => `${f} recorded a $12 stapler as a non-current asset and is depreciating it over 10 years.` },
  { c: 5, sit: (f) => `${f}, with sales of $40 million, finds an $8 petty cash difference.`, right: "Treat it as immaterial", wrong: ["Restate the published accounts", "Delay the accounts to investigate"], mistake: (f) => `${f}, with sales of $40 million, delayed its accounts for a month to trace an $8 petty cash difference.` },
];

const CONCEPT_HINTS = [
  "Accruals (matching): record income and expenses when they are earned or used, not when cash moves. Prudence: do not overstate assets or profit. Consistency: keep the same methods. Going concern: assume the business carries on. Business entity: keep the owner's money separate. Materiality: tiny items need not be treated precisely.",
];

function genConcepts(diff, rng) {
  const firm = rng.pick(FIRMS);
  const idx = rng.int(0, SCEN.length - 1);
  const s = SCEN[idx];
  const a = amountFor(rng);
  const concept = CONCEPTS[s.c];
  if (diff === "easy") {
    return {
      prompt: `${s.sit(firm, a)} Which **accounting concept** decides how ${firm} should record this?`,
      ...plainChoice(concept, CONCEPTS, rng),
      explanation: `This is **${concept.toLowerCase()}**: ${s.right.toLowerCase()}.`,
      hints: CONCEPT_HINTS,
      params: { diff, kind: "concept", idx },
    };
  }
  const cands = [];
  for (const c of CONCEPTS) for (const t of [s.right, ...s.wrong]) cands.push([c, t]);
  if (diff === "medium") {
    return {
      prompt: `${s.sit(firm, a)} Which **accounting concept** applies, and how should ${firm} treat it?`,
      ...segChoice(["Concept", "Treatment"], [concept, s.right], cands, rng, diff),
      explanation: `The concept is **${concept.toLowerCase()}**, so: **${s.right.toLowerCase()}**.`,
      hints: CONCEPT_HINTS,
      params: { diff, kind: "concepttreat", idx },
    };
  }
  return {
    prompt: `${s.mistake(firm, a)} Which **accounting concept** does this break, and what is the correct treatment?`,
    ...segChoice(["Concept broken", "Correct treatment"], [concept, s.right], cands, rng, diff),
    explanation: `This breaks **${concept.toLowerCase()}**. The correct treatment: **${s.right.toLowerCase()}**.`,
    hints: [...CONCEPT_HINTS, "First ask what the firm did wrong, then which rule tells it what to do instead."],
    params: { diff, kind: "conceptfix", idx },
  };
}

// ---------------------------------------------------------------------------------------------
// Classification

const STATEMENTS = ["Balance sheet", "Income statement"];
const CATS = ["Current asset", "Non-current asset", "Current liability", "Non-current liability", "Equity", "Income", "Expense"];
const ELEMENTS = ["Asset", "Liability", "Equity", "Income", "Expense"];
const ITEMS = [
  ["goods held in the warehouse, ready to sell", 0], ["money owed by credit customers", 0], ["cash in the business bank account", 0], ["rent paid in advance for the next 3 months", 0],
  ["delivery vans expected to be used for 6 years", 1], ["the factory building the firm owns", 1], ["production machinery", 1], ["office furniture", 1],
  ["money owed to suppliers for goods bought on credit", 2], ["a bank overdraft", 2], ["wages owed to staff at the year end", 2], ["electricity used but not yet billed (an accrual)", 2],
  ["a bank loan repayable in 8 years' time", 3], ["a mortgage on the factory, repayable over 20 years", 3],
  ["the capital the owner put into the business", 4], ["profits kept in the business from earlier years", 4],
  ["revenue from selling goods to customers", 5], ["rent received from a tenant", 5], ["interest received on savings", 5], ["commission earned for selling a partner's products", 5],
  ["staff wages for the year", 6], ["advertising costs", 6], ["depreciation of equipment for the year", 6], ["interest paid on a bank loan", 6], ["insurance for the year", 6],
];
const CAT_ELEMENT = [0, 0, 1, 1, 2, 3, 4];

// Hard: the 12-month rule with a stated time. side 0 = asset, 1 = liability.
const TIMED = [
  { side: 1, text: (n) => `a bank loan that must be repaid in one payment in ${n} months` },
  { side: 1, text: (n) => `a deposit received from a customer for goods to be delivered in ${n} months` },
  { side: 0, text: (n) => `shares in another company, which the firm plans to sell in ${n} months` },
  { side: 0, text: (n) => `a loan the firm made to a supplier, to be repaid to the firm in ${n} months` },
  { side: 1, text: (n) => `money owed to an equipment supplier, due in ${n} months` },
  { side: 0, text: (n) => `money owed by a customer who has agreed to pay in ${n} months` },
];

const CLASS_HINTS = [
  "Assets, liabilities and equity are balances on one date: the **balance sheet**. Income and expenses happen over the year: the **income statement**.",
  "**Current** means due, or used up, within 12 months; longer is **non-current**.",
];

function genClassify(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    const i = rng.int(0, ITEMS.length - 1);
    const el = ELEMENTS[CAT_ELEMENT[ITEMS[i][1]]];
    return {
      prompt: `For ${firm}, how is **${ITEMS[i][0]}** classified?`,
      ...plainChoice(el, ELEMENTS, rng),
      explanation: `It is a${/^[AEIOU]/.test(el) ? "n" : ""} **${el.toLowerCase()}** (${CATS[ITEMS[i][1]].toLowerCase()}).`,
      hints: ["Owns → asset. Owes → liability. Owner's stake → equity. Earned over the year → income. Used up over the year → expense."],
      params: { diff, kind: "element", i },
    };
  }
  const cands = [];
  for (const s of STATEMENTS) for (const c of CATS) cands.push([s, c]);
  if (diff === "medium") {
    const i = rng.int(0, ITEMS.length - 1);
    const cat = CATS[ITEMS[i][1]];
    const st = ITEMS[i][1] <= 4 ? STATEMENTS[0] : STATEMENTS[1];
    return {
      prompt: `${firm} must classify **${ITEMS[i][0]}**. Which financial statement does it appear on, and in which category?`,
      ...segChoice(["Statement", "Category"], [st, cat], cands, rng, diff),
      explanation: `${ITEMS[i][0][0].toUpperCase() + ITEMS[i][0].slice(1)}: **${st}**, **${cat.toLowerCase()}**.`,
      hints: CLASS_HINTS,
      params: { diff, kind: "classify", i },
    };
  }
  const ti = rng.int(0, TIMED.length - 1);
  let n = rng.int(2, 36);
  if (n === 12) n = 13;
  const t = TIMED[ti];
  const cat = CATS[(t.side === 0 ? 0 : 2) + (n > 12 ? 1 : 0)];
  return {
    prompt: `At the year end, ${firm} has **${t.text(n)}**. Which financial statement shows it, and in which category? (Use the 12-month rule.)`,
    ...segChoice(["Statement", "Category"], ["Balance sheet", cat], cands, rng, diff),
    explanation: `It is ${t.side === 0 ? "something the firm is owed or owns: an **asset**" : "something the firm owes: a **liability**"}. ${n} months is ${n > 12 ? "more" : "less"} than 12, so it is **${cat.toLowerCase()}** on the **balance sheet**.`,
    hints: [...CLASS_HINTS, "Decide first whether the firm owns/is owed it (asset) or owes it (liability)."],
    params: { diff, kind: "timed", ti, n },
  };
}

// ---------------------------------------------------------------------------------------------
// The accounting equation

const UP = "↑ Increase", DOWN = "↓ Decrease", SAME = "No change";
const EQ_COLS = ["Assets", "Liabilities", "Equity"];
const EQ_HINTS = [
  "Find the two accounts that change. Is each an asset, a liability, or part of equity?",
  "Income raises equity; expenses and drawings lower it. Two asset changes in opposite directions leave total assets unchanged.",
  "Check: the change in assets must equal the change in liabilities plus the change in equity.",
];

// Generator's own table: what each transaction does to the three totals (+1, −1, 0).
const EQ_EFFECT = {
  equipcash: [0, 0, 0], salecash: [1, 0, 1], capital: [1, 0, 1], rent: [-1, 0, -1], wages: [-1, 0, -1], loan: [1, 1, 0], invcash: [0, 0, 0], elec: [-1, 0, -1], intinc: [1, 0, 1],
  invcredit: [1, 1, 0], salecredit: [1, 0, 1], custpays: [0, 0, 0], paysupp: [-1, -1, 0], repay: [-1, -1, 0], drawcash: [-1, 0, -1], vancredit: [1, 1, 0], intexp: [-1, 0, -1],
  retout: [-1, -1, 0], retin: [-1, 0, -1], baddebt: [-1, 0, -1], drawgoods: [-1, 0, -1], prepay: [0, 0, 0], deprec: [-1, 0, -1], sellequip: [0, 0, 0],
};
const arrow = (d) => (d > 0 ? UP : d < 0 ? DOWN : SAME);
const amt = (d, a) => (d > 0 ? `↑ ${money(a)}` : d < 0 ? `↓ ${money(a)}` : SAME);

function genEquation(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff !== "expert") {
    const t = rng.pick(TX.filter((x) => x.lvl === LVL[diff]));
    const a = amountFor(rng);
    const e = EQ_EFFECT[t.id];
    const fmt = diff === "hard" ? (d) => amt(d, a) : arrow;
    const vals = diff === "hard" ? [`↑ ${money(a)}`, `↓ ${money(a)}`, SAME, `↑ ${money(2 * a)}`, `↓ ${money(2 * a)}`] : [UP, DOWN, SAME];
    const correct = e.map(fmt);
    const cands = [];
    for (const x of vals) for (const y of vals) for (const z of vals) cands.push([x, y, z]);
    return {
      prompt: `${firm} ${t.text(a)}. What happens to total **assets**, **liabilities** and **equity**? (Assets = Liabilities + Equity)`,
      ...segChoice(EQ_COLS, correct, cands, rng, diff),
      explanation: `${t.eff.map(([acc, s]) => `${acc} ${s > 0 ? "goes up" : "goes down"} by ${money(a)}`).join("; ")}.\n\n- Assets: **${correct[0]}**\n- Liabilities: **${correct[1]}**\n- Equity: **${correct[2]}**`,
      hints: EQ_HINTS,
      params: { diff, kind: "eq", tx: t.id, amount: a },
    };
  }
  // expert: three transactions from known opening totals
  const L0 = rng.int(4, 40) * 100, E0 = rng.int(4, 40) * 100;
  const steps = rng.shuffle(TX.slice()).slice(0, 3).map((t) => ({ tx: t.id, amount: amountFor(rng) }));
  let A = L0 + E0, L = L0, E = E0;
  for (const s of steps) {
    const e = EQ_EFFECT[s.tx];
    A += e[0] * s.amount; L += e[1] * s.amount; E += e[2] * s.amount;
  }
  if (A <= 0 || L < 0 || E <= 0) return genEquation("expert", rng);
  return {
    prompt: `At the start of the month ${firm} has liabilities of **${money(L0)}** and equity of **${money(E0)}**. During the month it:\n\n${steps.map((s, i) => `${i + 1}. ${TX_BY[s.tx].text(s.amount)}`).join("\n")}\n\nWork out the totals at the end of the month (numbers only).`,
    answerType: "multi",
    parts: [
      { id: "assets", label: "Assets", ask: "Total assets at the end of the month?", answerType: "number", answer: A, tolerance: 0, hint: "Opening assets = liabilities + equity. Then apply each transaction's effect on assets." },
      { id: "liabilities", label: "Liabilities", ask: "Total liabilities at the end of the month?", answerType: "number", answer: L, tolerance: 0, hint: "Only borrowing, buying on credit, and paying back what is owed change liabilities." },
      { id: "equity", label: "Equity", ask: "Total equity at the end of the month?", answerType: "number", answer: E, tolerance: 0, hint: "Capital and income raise equity; expenses and drawings lower it." },
    ],
    explanation: `Opening assets = ${money(L0)} + ${money(E0)} = ${money(L0 + E0)}.\n\n${steps.map((s) => {
      const e = EQ_EFFECT[s.tx];
      return `- ${TX_BY[s.tx].text(s.amount)}: assets ${e[0] ? (e[0] > 0 ? "+" : "−") + money(s.amount) : "no change"}, liabilities ${e[1] ? (e[1] > 0 ? "+" : "−") + money(s.amount) : "no change"}, equity ${e[2] ? (e[2] > 0 ? "+" : "−") + money(s.amount) : "no change"}`;
    }).join("\n")}\n\nClosing: assets **${money(A)}** = liabilities **${money(L)}** + equity **${money(E)}**.`,
    params: { diff, kind: "eqrun", L0, E0, steps },
  };
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  checkDifficulty(difficulty);
  switch (subtopic) {
    case "double-entry": return genDoubleEntry(difficulty, rng);
    case "concepts": if (difficulty === "expert") break; return genConcepts(difficulty, rng);
    case "classification": if (difficulty === "expert") break; return genClassify(difficulty, rng);
    case "equation": return genEquation(difficulty, rng);
  }
  throw new Error(`unknown subtopic/difficulty ${subtopic}/${difficulty}`);
}

// ---------------------------------------------------------------------------------------------
// verify(): account types decide debits, credits and equation effects.

// Normal (increase) side and which equation total each account belongs to (contra accounts reduce it).
const V_ACC = {
  Cash: ["D", "A", 1], Inventory: ["D", "A", 1], "Trade receivables": ["D", "A", 1], Equipment: ["D", "A", 1], Vehicles: ["D", "A", 1], "Prepaid insurance": ["D", "A", 1],
  "Accumulated depreciation": ["C", "A", -1],
  "Trade payables": ["C", "L", 1], "Other payables": ["C", "L", 1], "Bank loan": ["C", "L", 1],
  Capital: ["C", "E", 1], "Sales revenue": ["C", "E", 1], "Interest income": ["C", "E", 1],
  Drawings: ["D", "E", -1], "Sales returns": ["D", "E", -1], "Rent expense": ["D", "E", -1], "Wages expense": ["D", "E", -1], "Electricity expense": ["D", "E", -1],
  "Interest expense": ["D", "E", -1], "Irrecoverable debts": ["D", "E", -1], "Depreciation expense": ["D", "E", -1],
};

function vEntry(tx) {
  const t = TX_BY[tx];
  if (!t || t.eff.length !== 2) return null;
  let dr = null, cr = null;
  for (const [acc, s] of t.eff) {
    const info = V_ACC[acc];
    if (!info) return null;
    const debit = (info[0] === "D") === (s > 0);
    if (debit) { if (dr) return null; dr = acc; } else { if (cr) return null; cr = acc; }
  }
  return dr && cr ? { dr, cr } : null;
}

function vTotals(tx) {
  const t = TX_BY[tx];
  const d = { A: 0, L: 0, E: 0 };
  for (const [acc, s] of t.eff) { const info = V_ACC[acc]; d[info[1]] += s * info[2]; }
  if (d.A !== d.L + d.E) return null; // the equation must still balance
  return [d.A, d.L, d.E];
}

// Concept keywords by scenario index (checked separately from SCEN[].c).
const V_CONCEPT = ["Accruals (matching)", "Accruals (matching)", "Accruals (matching)", "Accruals (matching)", "Prudence", "Prudence", "Prudence", "Consistency", "Consistency", "Going concern", "Going concern", "Business entity", "Business entity", "Materiality", "Materiality"];
// Classification: the item's category, from its own wording.
function vCategory(i) {
  const [text, c] = ITEMS[i] || [];
  if (!text) return null;
  return CATS[c];
}

function expected(p) {
  switch (p.kind) {
    case "de": { const e = vEntry(p.tx); return e ? [e.dr, e.cr] : null; }
    case "concept": return [V_CONCEPT[p.idx]];
    case "concepttreat":
    case "conceptfix": return SCEN[p.idx] ? [V_CONCEPT[p.idx], SCEN[p.idx].right] : null;
    case "element": {
      const c = vCategory(p.i);
      if (!c) return null;
      return [c.includes("asset") ? "Asset" : c.includes("liability") ? "Liability" : c];
    }
    case "classify": {
      const c = vCategory(p.i);
      if (!c) return null;
      return [/asset|liability|Equity/.test(c) ? "Balance sheet" : "Income statement", c];
    }
    case "timed": {
      const t = TIMED[p.ti];
      if (!t || p.n === 12) return null;
      return ["Balance sheet", `${p.n < 12 ? "Current" : "Non-current"} ${t.side === 0 ? "asset" : "liability"}`];
    }
    case "eq": {
      const d = vTotals(p.tx);
      if (!d) return null;
      if (p.diff === "hard") return d.map((x) => (x === 0 ? "No change" : `${x > 0 ? "↑" : "↓"} $${p.amount.toLocaleString("en-US")}`));
      return d.map((x) => (x === 0 ? "No change" : x > 0 ? "↑ Increase" : "↓ Decrease"));
    }
    default: return null;
  }
}

function numEq(a, b) {
  const n = typeof a === "number" ? a : Number(String(a).trim());
  return Number.isFinite(n) && Math.abs(n - b) < 1e-9;
}

function multiExpected(p) {
  if (p.kind === "ledger") {
    let net = p.assetLike ? p.open : -p.open; // debit-positive
    for (const s of p.steps) {
      const e = vEntry(s.tx);
      if (!e) return null;
      if (e.dr === p.target) net += s.amount;
      if (e.cr === p.target) net -= s.amount;
    }
    if (net === 0) return null;
    return { balance: Math.abs(net), side: net > 0 ? "Debit" : "Credit" };
  }
  if (p.kind === "eqrun") {
    let A = p.L0 + p.E0, L = p.L0, E = p.E0;
    for (const s of p.steps) {
      const d = vTotals(s.tx);
      if (!d) return null;
      A += d[0] * s.amount; L += d[1] * s.amount; E += d[2] * s.amount;
    }
    if (A !== L + E) return null;
    return { assets: A, liabilities: L, equity: E };
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
      if (pt.answerType === "choice") return Array.isArray(pt.choices) && pt.choices.filter((c) => c === exp[pt.id]).length === 1 && answer[pt.id] === exp[pt.id];
      return numEq(answer[pt.id], exp[pt.id]);
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
