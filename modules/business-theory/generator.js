// Business theory generator. Uses only the seeded rng passed in by the engine.
// Subtopics: ownership, stakeholders, objectives, swot, pestle. Standard textbook frameworks only
// (forms of ownership, stakeholder analysis, SMART objectives, SWOT, PESTLE), fictional firms,
// and no country-specific law or tax: the ownership forms are the general textbook versions.
//
// Options that combine two or more facts are segmented choices: `choiceCols` names the columns,
// each choice is an array with one segment per column, and distractors differ from the answer in
// one or two segments, never all. `extraSegs` adds decoy blocks for Build mode (never the answer's
// value in that column, so the answer is the only correct set of blocks).
//
// params.kind tells verify() how to recheck. Classification answers are rechecked by finding the
// stated item in the grouped fact banks (an item filed under two groups fails) and applying the
// framework's rule (SWOT: internal/external × helpful/harmful; SMART: the stated growth rule);
// numbers are recomputed by a different route. All rng draws happen before any text is built.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const SEP = " | ";
const segsOf = (c) => (Array.isArray(c) ? c.map(String) : String(c).split(SEP));
const keyOf = (c) => segsOf(c).join(SEP);

const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const cash = (n) => (Number.isInteger(n) ? fmt(n) : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money = (n) => (n < 0 ? `−$${cash(-n)}` : `$${cash(n)}`);
const round2 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

function segChoices(rng, answer, opts, prefer, n, valid = () => true) {
  const cols = answer.length;
  const seen = new Set([answer.join(SEP)]);
  const out = [answer];
  const add = (c) => {
    if (out.length >= n) return;
    const d = c.filter((v, i) => v !== answer[i]).length;
    if (d < 1 || d >= cols || d > 2 || !valid(c)) return;
    const k = c.join(SEP);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  (prefer || []).forEach(add);
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

// A segmented choice question: 3 options at Easy, 5 above. `opts[i]` lists the values distractors
// may use in column i; `decoys[i]` adds Build-mode decoy blocks for column i.
const optionCount = (diff) => (diff === "easy" ? 3 : 5);
function segQ(rng, diff, prompt, cols, answer, opts, prefer, decoys, rest) {
  const choices = segChoices(rng, answer, opts, prefer, optionCount(diff), rest.valid);
  delete rest.valid;
  const extraSegs = [];
  cols.forEach((c, i) => {
    for (const v of new Set([...(opts[i] || []), ...((decoys && decoys[i]) || [])])) if (v !== answer[i]) extraSegs.push([c, v]);
  });
  return {
    prompt, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, ...rest,
    params: { ...rest.params, diff },
  };
}

function plainChoices(rng, answer, pool, n = 4) {
  const others = rng.shuffle(pool.filter((x) => x !== answer)).slice(0, n - 1);
  return rng.shuffle([answer, ...others]);
}
const plain = (prompt, answer, choices, rest) => ({ prompt, answerType: "choice", choices, answer, ...rest });

// Which group of a { group: [items] } bank lists this item? null unless exactly one does.
function groupOf(bank, item) {
  const hits = Object.keys(bank).filter((g) => bank[g].includes(item));
  return hits.length === 1 ? hits[0] : null;
}

function checkDifficulty(d, allowed) {
  if (!allowed.includes(d)) throw new Error(`Unknown difficulty: ${d}`);
}

const PEOPLE = ["Ana", "Ben", "Chloe", "Dev", "Ella", "Femi", "Grace", "Hugo", "Iris", "Jon", "Kemi", "Leo", "Maya", "Nico", "Omar", "Priya", "Sam", "Tara"];
const BIZ = ["a bike repair shop", "a bakery", "a web design studio", "a florist", "a café", "a dog-grooming salon", "a printing firm", "a yoga studio", "a toy shop", "a plumbing business"];
const FIRMS = ["Northwind", "Copperleaf", "Bluestone", "Maple & Co", "Silverline", "Redbrook", "Oakfield", "Harbourview"];

// ---------------------------------------------------------------------------------------------
// Forms of ownership

const FORMS = ["Sole trader", "Partnership", "Private limited company", "Public limited company"];
const OWNED = ["One person", "Two or more partners", "Shareholders"];
const LIAB = ["Unlimited", "Limited"];
const SHARES = ["No shares", "Shares sold privately", "Shares sold to the public"];
// The features of each form, as separate facts (verify() derives the row from these).
const FORM_FACTS = {
  "Sole trader": { owners: 1, limited: false, shares: "none" },
  Partnership: { owners: 2, limited: false, shares: "none" },
  "Private limited company": { owners: "shareholders", limited: true, shares: "private" },
  "Public limited company": { owners: "shareholders", limited: true, shares: "public" },
};
const rowOf = (f) => [
  f.owners === 1 ? "One person" : f.owners === 2 ? "Two or more partners" : "Shareholders",
  f.limited ? "Limited" : "Unlimited",
  f.shares === "none" ? "No shares" : f.shares === "private" ? "Shares sold privately" : "Shares sold to the public",
];

const FORM_DESC = {
  "Sole trader": [
    "{p1} owns and runs {biz} alone, keeps all of the profit, and could have to sell personal belongings to pay its debts.",
    "{p1} set up {biz} with no partners and no shares. Every decision is theirs, and so is every debt.",
  ],
  Partnership: [
    "{p1} and {p2} own {biz} together under an agreement that splits the profit between them; both are personally liable for all of its debts.",
    "{p1}, {p2} and a third friend share the ownership of {biz}. There are no shares, and each of them could lose personal savings if it fails.",
  ],
  "Private limited company": [
    "{biz} is owned by a few family members who hold its shares. Their liability is limited, and its shares cannot be offered to the general public.",
    "{p1} and {p2} each hold half of the shares in {biz}. They can lose only what they invested, and they choose who may buy shares.",
  ],
  "Public limited company": [
    "{biz} has thousands of shareholders, and anyone can buy its shares on a stock exchange. Shareholders can lose only what they invested.",
    "{biz} raised money by offering its shares to the general public. Its owners have limited liability.",
  ],
};
const OWN_HINTS = [
  "Check three things: how many owners there are, whether their liability is limited, and whether there are shares (and who can buy them).",
  "Sole traders and partners have unlimited liability. Company shareholders have limited liability; a public limited company can sell shares to anyone, a private one cannot.",
];

function genOwnership(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard", "expert"]);
  const [p1, p2, p3] = rng.shuffle(PEOPLE.slice()).slice(0, 3);
  const biz = rng.pick(BIZ);
  const vars = { p1, p2, biz };
  if (diff === "easy") {
    const form = rng.pick(FORMS);
    const d = rng.pick(FORM_DESC[form]);
    return plain(`${cap(fill(d, vars))} Which form of business ownership is this?`, form, rng.shuffle(FORMS.slice()),
      { explanation: `${FORM_WHY[form]} So it is a **${form.toLowerCase()}**.`, hints: OWN_HINTS, params: { kind: "ownEasy", desc: d } });
  }
  if (diff === "medium") {
    const form = rng.pick(FORMS);
    const ans = rowOf(FORM_FACTS[form]);
    const lead = form === "Sole trader" ? `${p1} sets up ${biz}` : `${p1} and ${p2} set up ${biz}`;
    const intro = rng.pick([`${lead} as a **${form.toLowerCase()}**.`, `${cap(biz)} is run as a **${form.toLowerCase()}**.`]);
    return segQ(rng, diff, `${intro} Which row describes this form of ownership?`,
      ["Owned by", "Owners' liability", "Shares"], ans, [OWNED, LIAB, SHARES], [], null,
      {
        explanation: `A ${form.toLowerCase()}: ${FORM_WHY[form]}\n\nSo: **${ans.join(" · ")}**.`,
        hints: OWN_HINTS, params: { kind: "ownMed", form },
      });
  }
  if (diff === "hard") {
    const kind = rng.pick(["split", "dps", "liab"]);
    if (kind === "split") {
      const three = rng.next() < 0.5;
      const ratio = three ? [rng.int(1, 5), rng.int(1, 5), rng.int(1, 5)] : [rng.int(1, 7), rng.int(1, 7)];
      const sum = ratio.reduce((a, b) => a + b, 0);
      const P = sum * rng.int(4, 40) * 1000;
      const who = rng.int(0, ratio.length - 1);
      const names = [p1, p2, p3].slice(0, ratio.length);
      const share = (P / sum) * ratio[who];
      return {
        prompt: `${names.join(three ? ", " : " and ").replace(/, ([^,]*)$/, " and $1")} run ${biz} as a partnership. Their agreement shares profit in the ratio ${ratio.join(" : ")}. This year's profit is ${money(P)}. How much does ${names[who]} receive, in dollars?`,
        answerType: "number", answer: share, tolerance: 0,
        explanation: `The ratio has ${ratio.join(" + ")} = ${sum} parts, so one part is ${money(P)} ÷ ${sum} = ${money(P / sum)}. ${names[who]} has ${ratio[who]} part${ratio[who] === 1 ? "" : "s"}: ${ratio[who]} × ${money(P / sum)} = **${money(share)}**.`,
        hints: ["Add the numbers in the ratio to get the total number of parts.", "Divide the profit by the total parts, then multiply by this partner's parts."],
        given: [{ label: "_profit", value: P }],
        params: { kind: "split", P, ratio, who },
      };
    }
    if (kind === "dps") {
      let X, d, N;
      do {
        X = rng.int(20, 900) * 1000; d = rng.pick([20, 25, 30, 40, 50, 60]); N = rng.pick([100000, 200000, 250000, 400000, 500000]);
      } while (Math.abs(round2((X * d) / 100 / N) - (X * d) / 100 / N) > 1e-9);
      const form = rng.pick(["private limited company", "public limited company"]);
      const dps = (X * d) / 100 / N;
      return {
        prompt: `${cap(biz)} is a ${form} with ${fmt(N)} shares. Its profit after tax is ${money(X)}, and it pays out ${d}% of that as dividends. What is the dividend per share, in dollars? Give the exact value.`,
        answerType: "number", answer: dps, tolerance: 0.005,
        explanation: `- Total dividends = ${d}% × ${money(X)} = ${money((X * d) / 100)}\n- Per share = ${money((X * d) / 100)} ÷ ${fmt(N)} = **${money(dps)}**`,
        hints: ["First find the total paid out as dividends, then share it equally across all the shares."],
        given: [{ label: "_profit", value: X }, { label: "_payout", value: d }, { label: "_shares", value: N }],
        params: { kind: "dps", X, d, N },
      };
    }
    const form = rng.pick(["Sole trader", "Private limited company"]);
    const D = rng.int(30, 200) * 1000, A = rng.int(5, Math.floor(D / 1000) - 5) * 1000;
    const I = rng.int(5, 50) * 1000;
    const pay = form === "Sole trader" ? D - A : 0;
    const setup = form === "Sole trader"
      ? `${p1} runs ${biz} as a sole trader and put ${money(I)} of savings into it.`
      : `${p1} is the only shareholder of ${biz}, a private limited company, and paid ${money(I)} for the shares.`;
    return {
      prompt: `${setup} The business fails owing ${money(D)}; selling all its assets raises ${money(A)}. How much more must ${p1} pay from personal money, beyond what was already put into the business? Answer in dollars (0 if nothing).`,
      answerType: "number", answer: pay, tolerance: 0,
      explanation: form === "Sole trader"
        ? `A sole trader has **unlimited liability**: the owner and the business are the same in law, so the unpaid debt is the owner's. Unpaid debt = ${money(D)} − ${money(A)} = **${money(pay)}**.`
        : `A company's shareholders have **limited liability**: they can lose only the ${money(I)} they paid for shares. The company's other ${money(D - A)} of debt is not ${p1}'s to pay, so the answer is **0**.`,
      hints: ["Decide first whether the owner's liability is limited or unlimited.", "With unlimited liability the owner pays whatever the assets don't cover; with limited liability the loss stops at the money invested."],
      given: [{ label: "_debts", value: D }, { label: "_assets", value: A }],
      params: { kind: "liab", form, D, A, I },
    };
  }
  // Expert: choose the form from stated needs, then do the matching profit calculation.
  const limited = rng.next() < 0.6;
  const pub = limited && rng.next() < 0.5;
  const names = [p1, p2, p3];
  const needs = [
    limited ? "They want to protect their homes and savings if the business fails." : "They are happy to be personally liable for its debts, and want the simplest set-up with no shares and no company paperwork.",
    limited ? (pub ? `They plan to raise $${rng.int(2, 9)} million by selling shares to the general public.` : "They want to choose exactly who can own a part of the business.") : "",
  ].filter(Boolean).join(" ");
  const form = !limited ? "Partnership" : pub ? "Public limited company" : "Private limited company";
  let calcAsk, calcVal, calcExpl, calcParams, given, tol = 0;
  if (form === "Partnership") {
    const ratio = [rng.int(1, 5), rng.int(1, 5), rng.int(1, 5)];
    const sum = ratio[0] + ratio[1] + ratio[2];
    const P = sum * rng.int(4, 40) * 1000;
    const who = rng.int(0, 2);
    calcVal = (P / sum) * ratio[who];
    calcAsk = `They will share a profit of ${money(P)} in the ratio ${ratio.join(" : ")} (${names.join(" : ")}). ${names[who]}'s share ($)`;
    calcExpl = `Profit per part = ${money(P)} ÷ ${sum} = ${money(P / sum)}; ${names[who]} gets ${ratio[who]} × ${money(P / sum)} = **${money(calcVal)}**.`;
    calcParams = { P, ratio, who };
    given = [{ label: "_profit", value: P }];
  } else if (form === "Private limited company") {
    const N = rng.pick([100, 200, 500, 1000]);
    const held = rng.int(1, N / 10 - 1) * 10;
    const Dv = N * rng.int(20, 200);
    calcVal = (Dv * held) / N;
    calcAsk = `${p1} will hold ${fmt(held)} of its ${fmt(N)} shares, and it plans to pay ${money(Dv)} in dividends this year. ${p1}'s dividend ($)`;
    calcExpl = `Dividend per share = ${money(Dv)} ÷ ${fmt(N)} = ${money(Dv / N)}; ${p1} gets ${fmt(held)} × ${money(Dv / N)} = **${money(calcVal)}**.`;
    calcParams = { N, held, Dv };
    given = [{ label: "_dividends", value: Dv }, { label: "_shares", value: N }, { label: "_held", value: held }];
  } else {
    let X, d, N;
    do {
      X = rng.int(200, 9000) * 1000; d = rng.pick([20, 25, 30, 40, 50]); N = rng.pick([1000000, 2000000, 2500000, 4000000, 5000000]);
    } while (Math.abs(round2((X * d) / 100 / N) - (X * d) / 100 / N) > 1e-9 || (X * d) / 100 / N < 0.01);
    calcVal = (X * d) / 100 / N;
    tol = 0.005;
    calcAsk = `It expects profit after tax of ${money(X)} and will pay out ${d}% as dividends across ${fmt(N)} shares. Dividend per share ($, exact)`;
    calcExpl = `Total dividends = ${d}% × ${money(X)} = ${money((X * d) / 100)}; per share = ${money((X * d) / 100)} ÷ ${fmt(N)} = **${money(calcVal)}**.`;
    calcParams = { X, d, N };
    given = [{ label: "_profit", value: X }, { label: "_payout", value: d }, { label: "_shares", value: N }];
  }
  return {
    prompt: `${p1}, ${p2} and ${p3} are starting ${biz} together. ${needs} Which form of ownership meets all of their needs, and what does the profit calculation give once it is set up that way?`,
    answerType: "multi",
    parts: [
      { id: "form", label: "Form", ask: "Form of ownership", answerType: "choice", answer: form, choices: rng.shuffle(FORMS.slice()), hint: "Several owners rules out a sole trader. Wanting limited liability means a company; selling shares to the public means a public one." },
      { id: "calc", label: "Calculation", ask: calcAsk, answerType: "number", answer: calcVal, tolerance: tol, hint: form === "Partnership" ? "Profit is shared by the ratio: divide by the total parts, then multiply." : "Work out the dividend for one share first." },
    ],
    explanation: `- Needs: ${limited ? "limited liability rules out a sole trader and a partnership" : "no shares and no company paperwork with several owners means a partnership"}${limited ? (pub ? ", and selling shares to the public needs a **public limited company**" : ", and choosing who owns shares means a **private limited company**") : ""}.\n- ${calcExpl}`,
    hints: OWN_HINTS,
    given,
    params: { kind: "ownExpert", limited, pub, calc: calcParams },
  };
}

const FORM_WHY = {
  "Sole trader": "One owner, who keeps all the profit and has unlimited liability; there are no shares.",
  Partnership: "Two or more partners share the profit by agreement and have unlimited liability; there are no shares.",
  "Private limited company": "Owned by shareholders with limited liability; shares can't be offered to the general public.",
  "Public limited company": "Owned by shareholders with limited liability; shares can be sold to anyone, for example on a stock exchange.",
};

// ---------------------------------------------------------------------------------------------
// Stakeholders

const INTERNAL = ["Employees", "Managers", "Shareholders"];
const EXTERNAL = ["Customers", "Suppliers", "Government", "Local community", "Lenders"];
const GROUPS = [...INTERNAL, ...EXTERNAL];
const INTEREST = {
  Employees: "Fair pay and job security",
  Managers: "Good salaries and the firm's growth",
  Shareholders: "Profit and dividends",
  Customers: "Good quality at a fair price",
  Suppliers: "Regular orders and prompt payment",
  Government: "Taxes paid and laws followed",
  "Local community": "Local jobs and little pollution",
  Lenders: "Loans repaid on time with interest",
};
const CONFLICTS = [
  { d: "replaces 40 checkout staff with self-service tills", gain: "Shareholders", lose: "Employees" },
  { d: "raises its prices by 15% while its costs stay the same", gain: "Shareholders", lose: "Customers" },
  { d: "builds a bigger, noisier factory next to a quiet housing estate", gain: "Shareholders", lose: "Local community" },
  { d: "makes its suppliers wait 90 days for payment instead of 30", gain: "Shareholders", lose: "Suppliers" },
  { d: "gives all staff a 10% pay rise without raising its prices", gain: "Employees", lose: "Shareholders" },
  { d: "moves production abroad to cut its wage bill", gain: "Shareholders", lose: "Employees" },
  { d: "switches to cheaper, lower-quality ingredients", gain: "Shareholders", lose: "Customers" },
  { d: "fits expensive filters to cut pollution from its factory", gain: "Local community", lose: "Shareholders" },
  { d: "cuts its prices to win market share, lowering its profit", gain: "Customers", lose: "Shareholders" },
  { d: "delays repaying a bank loan so it can pay a bigger dividend", gain: "Shareholders", lose: "Lenders" },
  { d: "ends a 20-year contract with a local supplier to buy more cheaply abroad", gain: "Shareholders", lose: "Suppliers" },
  { d: "uses legal loopholes to cut the tax it pays", gain: "Shareholders", lose: "Government" },
];
const STK_HINTS = [
  "Internal stakeholders are inside the business: employees, managers and owners (shareholders). Everyone else affected is external.",
  "Think about what each group wants most: pay, profit, quality and price, orders and payment, taxes, a clean and busy local area, or loans repaid.",
];

function genStakeholders(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard"]);
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    const kind = rng.pick(["internal", "external", "interest"]);
    if (kind === "interest") {
      const g = rng.pick(GROUPS);
      const ans = INTEREST[g];
      return plain(`Using stakeholder analysis, what do ${g === "Government" ? "the government" : g === "Local community" ? "the local community" : g.toLowerCase()} mainly want from ${firm} Ltd?`, ans, plainChoices(rng, ans, Object.values(INTEREST)),
        { explanation: `${g}: the main interest is **${ans.toLowerCase()}**.`, hints: [STK_HINTS[1]], params: { kind: "stkInterest", g } });
    }
    const inside = kind === "internal";
    const ans = rng.pick(inside ? INTERNAL : EXTERNAL);
    const others = rng.shuffle(inside ? EXTERNAL : INTERNAL).slice(0, 3);
    return plain(`Which of these is ${inside ? "an internal" : "an external"} stakeholder of ${firm} Ltd?`, ans, rng.shuffle([ans, ...others]),
      { explanation: `${ans} are ${inside ? "inside the business" : "outside the business but affected by it"}, so they are **${inside ? "internal" : "external"}**. ${inside ? "The others are all outside it." : "The others (employees, managers, shareholders) are all inside it."}`, hints: [STK_HINTS[0]], params: { kind: "stkWhich", inside, ans } });
  }
  if (diff === "medium") {
    const g = rng.pick(GROUPS);
    const type = INTERNAL.includes(g) ? "Internal" : "External";
    const ans = [type, INTEREST[g]];
    return segQ(rng, diff, `Using stakeholder analysis, is the following group an internal or external stakeholder of ${firm} Ltd, and what is its main interest? **${g}**`,
      ["Type", "Main interest"], ans, [["Internal", "External"], Object.values(INTEREST)], [], null,
      { explanation: `${g}: ${type === "Internal" ? "inside" : "outside"} the business, so an **${type.toLowerCase()}** stakeholder. Main interest: **${INTEREST[g].toLowerCase()}**.`, hints: STK_HINTS, params: { kind: "stkMed", g } });
  }
  const c = rng.pick(CONFLICTS);
  const ans = [c.gain, c.lose];
  return segQ(rng, diff, `${firm} plc ${c.d}. Using stakeholder analysis, which group is most likely to gain from this decision, and which is most likely to lose?`,
    ["Most likely to gain", "Most likely to lose"], ans, [GROUPS, GROUPS], [], null,
    {
      explanation: `${cap(c.d)}: **${c.gain.toLowerCase()}** gain (${INTEREST[c.gain].toLowerCase()}), while **${c.lose.toLowerCase()}** lose out (they want ${INTEREST[c.lose].toLowerCase()}). Decisions like this show how stakeholder objectives conflict.`,
      hints: ["Ask who gets more money, a better deal or a better place to live from the decision, and whose interests it works against.", "Lower costs or higher prices usually help shareholders through profit; more pay, lower prices or cleaner air cost the firm money."],
      params: { kind: "stkConflict", d: c.d },
      valid: (row) => row[0] !== row[1], // one group can't both gain and lose
    });
}

// ---------------------------------------------------------------------------------------------
// SMART objectives

const METRICS = ["sales", "revenue", "the number of online orders", "website visits", "the number of customers", "repeat bookings"];
// Objective templates, grouped by whether they are Measurable (M) and Time-bound (T).
const OBJ = {
  MT: ["Increase {m} by {n}% by the end of next year.", "Raise {m} by {n}% within the next 12 months.", "Grow {m} by {n}% before the end of the next financial year."],
  M: ["Increase {m} by {n}%.", "Raise {m} by {n}% over time.", "Grow {m} by {n}% when the market allows."],
  T: ["Increase {m} significantly by the end of next year.", "Make {m} much higher within the next 12 months.", "Improve {m} a lot before the end of the next financial year."],
  NONE: ["Improve {m} as much as possible.", "Do much better on {m}.", "Make {m} grow strongly."],
};
const RULE = (g) => `Last year ${"{m}"} grew by ${g}%. Treat a target as achievable only if it is no more than double last year's growth.`;
const SMART_EASY = ["Measurable", "Achievable", "Time-bound", "None: it is SMART"];
const SMART_HINTS = [
  "Measurable: does it give a number to check against? Time-bound: does it give a deadline?",
  "Achievable: compare the target growth with double last year's growth, as the question says. Without a number, you can't tell.",
];

function smartFacts(t, n, g) {
  const grp = groupOf(OBJ, t);
  if (!grp) return null;
  const M = grp === "MT" || grp === "M", T = grp === "MT" || grp === "T";
  return { M, T, A: M ? n <= 2 * g : null };
}

function genObjectives(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard"]);
  const firm = rng.pick(FIRMS);
  const m = rng.pick(METRICS);
  const g = rng.int(3, 15);
  if (diff !== "hard") {
    let grp, n;
    if (diff === "easy") {
      const fail = rng.pick(SMART_EASY);
      grp = fail === "Measurable" ? "T" : fail === "Time-bound" ? "M" : "MT";
      n = fail === "Achievable" ? 2 * g + rng.int(2, 20) : rng.int(2, 2 * g - 1);
    } else {
      grp = rng.pick(["MT", "M", "T", "NONE"]);
      n = rng.next() < 0.5 ? rng.int(2, 2 * g - 1) : 2 * g + rng.int(2, 20);
    }
    const t = rng.pick(OBJ[grp]);
    const obj = fill(t, { m, n });
    const f = smartFacts(t, n, g);
    const rule = fill(RULE(g), { m });
    const expl =
      `- Measurable: ${f.M ? `**yes**, it names a ${n}% target.` : "**no**, there is no number to check."}\n` +
      `- Achievable: ${f.A === null ? "**can't tell** without a number." : `double last year's ${g}% is ${2 * g}%, and ${n}% is ${f.A ? "within" : "more than"} that, so **${f.A ? "yes" : "no"}**.`}\n` +
      `- Time-bound: ${f.T ? "**yes**, it has a deadline." : "**no**, there is no deadline."}`;
    if (diff === "easy") {
      const ans = !f.M ? "Measurable" : !f.T ? "Time-bound" : !f.A ? "Achievable" : "None: it is SMART";
      return plain(`${firm}'s objective: *"${obj}"* ${rule} Which SMART criterion does it clearly fail? (Assume it is Specific and Relevant.)`, ans, rng.shuffle(SMART_EASY.slice()),
        { explanation: `${expl}\n\nSo the answer is **${ans}**.`, hints: SMART_HINTS, params: { kind: "smartEasy", t, n, g } });
    }
    const ans = [f.M ? "Yes" : "No", f.A === null ? "Can't tell" : f.A ? "Yes" : "No", f.T ? "Yes" : "No"];
    return segQ(rng, diff, `${firm}'s objective: *"${obj}"* ${rule} Using the SMART criteria, is it measurable, achievable and time-bound?`,
      ["Measurable", "Achievable", "Time-bound"], ans, [["Yes", "No"], ["Yes", "No", "Can't tell"], ["Yes", "No"]], [], null,
      { explanation: expl, hints: SMART_HINTS, params: { kind: "smartMed", t, n, g } });
  }
  // Hard: target value, achievability and whether it was met.
  const R = rng.int(20, 900) * 100;
  const ok = rng.next() < 0.6;
  const n = ok ? rng.int(2, 2 * g - 1) : 2 * g + rng.int(2, 15);
  const target = (R * (100 + n)) / 100;
  const met = rng.next() < 0.5;
  const step = rng.int(1, 40) * 10;
  const X = Math.round(met ? target + step : target - step);
  const unit = m === "revenue" ? "$" : "";
  const show = (v) => (unit ? money(v) : fmt(v));
  return {
    prompt: `${firm}'s objective: *"Increase ${m} by ${n}% by the end of next year."* This year ${m} ${m.startsWith("the number") || m === "revenue" ? "was" : "were"} ${show(R)}. Last year ${m} grew by ${g}%; treat a target as achievable only if it is no more than double last year's growth. By the deadline, ${m} reached ${show(X)}.`,
    answerType: "multi",
    parts: [
      { id: "target", label: "Target", ask: `Target figure for ${m}${unit ? " ($)" : ""}`, answerType: "number", answer: target, tolerance: 0, hint: `Target = this year's figure × (1 + ${n} ÷ 100).` },
      { id: "achievable", label: "Achievable", ask: "Was the target achievable by the rule?", answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint: "Compare the target growth with double last year's growth." },
      { id: "met", label: "Met", ask: "Was the objective met?", answerType: "choice", answer: met ? "Yes" : "No", choices: ["Yes", "No"], hint: "Compare the figure reached with the target." },
    ],
    explanation:
      `- Target = ${show(R)} × ${fmt((100 + n) / 100)} = **${show(target)}**\n` +
      `- Achievable: double ${g}% is ${2 * g}%, and ${n}% is ${ok ? "within" : "more than"} that, so **${ok ? "yes" : "no"}**.\n` +
      `- Met: ${show(X)} is ${met ? "above" : "below"} the target, so **${met ? "yes" : "no"}**.`,
    hints: ["A measurable, time-bound objective lets you work out exactly what counts as success and check it at the deadline."],
    given: [{ label: "_now", value: R }, { label: "_pct", value: n }],
    params: { kind: "smartHard", R, n, g, X },
  };
}

// ---------------------------------------------------------------------------------------------
// SWOT

const SWOT = ["Strength", "Weakness", "Opportunity", "Threat"];
const SWOT_BANK = {
  Strength: ["a well-known, trusted brand", "highly skilled and experienced staff", "a patent on its best-selling product", "lower production costs than its rivals", "a large base of loyal customers", "plenty of cash and no debt"],
  Weakness: ["old machinery that often breaks down", "high staff turnover", "a slow, hard-to-use website", "large debts with high interest payments", "a narrow product range", "a brand that few people recognise"],
  Opportunity: ["a major competitor closing down", "growing demand in its market", "a new trade deal opening an overseas market", "a government grant scheme for firms like it", "a new housing estate being built near its shop", "falling prices for the materials it uses"],
  Threat: ["a large new rival opening nearby", "rising prices for its raw materials", "a recession cutting customer spending", "stricter regulations that raise its costs", "fashion moving away from its products", "a rise in the interest rate on its loans"],
};
// The SWOT grid: inside or outside the firm, and helpful or harmful.
const swotOf = (internal, helpful) => (internal ? (helpful ? "Strength" : "Weakness") : helpful ? "Opportunity" : "Threat");
const SWOT_HINTS = [
  "Internal factors are things the firm has or does itself; external factors come from outside and the firm can't control them.",
  "Internal + helpful = Strength; internal + harmful = Weakness; external + helpful = Opportunity; external + harmful = Threat.",
];

function genSwot(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard"]);
  const firm = rng.pick(FIRMS);
  const n = diff === "hard" ? 3 : 1;
  const cats = diff === "hard" ? [rng.pick(SWOT), rng.pick(SWOT), rng.pick(SWOT)] : [rng.pick(SWOT)];
  const used = new Set();
  const facs = cats.map((c) => {
    let f;
    do f = rng.pick(SWOT_BANK[c]); while (used.has(f));
    used.add(f);
    return f;
  });
  const why = (c) => `${c === "Strength" || c === "Weakness" ? "internal (inside the firm)" : "external (outside its control)"} and ${c === "Strength" || c === "Opportunity" ? "helpful" : "harmful"}`;
  const explanation = facs.map((f, i) => `- ${cap(f)}: ${why(cats[i])}, so ${cats[i] === "Opportunity" ? "an" : "a"} **${cats[i]}**.`).join("\n");
  if (diff === "easy") {
    return plain(`${firm} is writing a SWOT analysis. Where does this factor belong? **${cap(facs[0])}**`, cats[0], rng.shuffle(SWOT.slice()),
      { explanation, hints: SWOT_HINTS, params: { kind: "swot", facs } });
  }
  if (diff === "medium") {
    const c = cats[0];
    const internal = c === "Strength" || c === "Weakness", helpful = c === "Strength" || c === "Opportunity";
    const ans = [internal ? "Internal" : "External", helpful ? "Helpful" : "Harmful", c];
    const flip = (v, a, b) => (v === a ? b : a);
    const prefer = rng.shuffle([
      [flip(ans[0], "Internal", "External"), ans[1], swotOf(!internal, helpful)],
      [ans[0], flip(ans[1], "Helpful", "Harmful"), swotOf(internal, !helpful)],
      [ans[0], ans[1], swotOf(!internal, !helpful)],
      [flip(ans[0], "Internal", "External"), ans[1], c],
    ]);
    return segQ(rng, diff, `${firm} is writing a SWOT analysis. Is this factor internal or external, helpful or harmful, and where does it go? **${cap(facs[0])}**`,
      ["Origin", "Effect", "SWOT"], ans, [["Internal", "External"], ["Helpful", "Harmful"], SWOT], prefer, null,
      { explanation, hints: SWOT_HINTS, params: { kind: "swotMed", facs } });
  }
  return segQ(rng, diff, `${firm} is writing a SWOT analysis. Where does each factor belong?\n\n1. ${cap(facs[0])}\n2. ${cap(facs[1])}\n3. ${cap(facs[2])}`,
    ["Factor 1", "Factor 2", "Factor 3"], cats, [SWOT, SWOT, SWOT], [], null,
    { explanation, hints: SWOT_HINTS, params: { kind: "swot", facs } });
}

// ---------------------------------------------------------------------------------------------
// PESTLE

const PESTLE = ["Political", "Economic", "Social", "Technological", "Legal", "Environmental"];
const PESTLE_BANK = {
  Political: ["a change of government after an election", "political unrest in a supplier's country", "a government decision to spend more on public transport", "a new government that is friendlier to business", "tension between two governments over trade", "the government's plan to sell the state postal service"],
  Economic: ["a rise in interest rates", "a recession that cuts consumer spending", "a fall in the exchange rate", "rising inflation", "falling unemployment", "higher fuel prices"],
  Social: ["an ageing population", "a growing trend towards healthy eating", "more people working from home", "changing fashions among teenagers", "growing interest in ethical products", "more people living alone"],
  Technological: ["faster mobile internet", "robots that automate packing", "the spread of contactless payments", "cheaper 3D printing", "AI tools that answer customer emails", "shopping apps on smartphones"],
  Legal: ["a new consumer protection law", "stricter data protection rules", "a law banning junk-food adverts aimed at children", "new health and safety regulations", "a new law on employment contracts", "a legal ban on single-use plastic bags"],
  Environmental: ["more frequent floods", "hotter, drier summers", "water shortages", "rising sea levels", "scarcer raw materials such as timber", "storms that damage crops"],
};
const PESTLE_WHY = {
  Political: "It comes from government decisions or political stability.",
  Economic: "It is about the wider economy: interest rates, prices, growth, jobs or exchange rates.",
  Social: "It is about people's lifestyles, attitudes and population.",
  Technological: "It is about new technology.",
  Legal: "It is a law or regulation that firms must obey.",
  Environmental: "It is about the natural environment, weather and climate.",
};
const PESTLE_HINTS = [
  "Political = government decisions and stability; Economic = the wider economy; Social = people and lifestyles; Technological = new technology; Legal = laws and regulations; Environmental = nature, weather and climate.",
  "If it is already a law, it is Legal; if it is a government choice that isn't a law, it is Political.",
];
// Expert: the same external change helps some firms and hurts others.
const PESTLE_CASES = [
  { f: "A new law bans single-use plastic cutlery", cat: "Legal", good: ["a maker of wooden cutlery", "a maker of reusable steel cutlery"], bad: ["a maker of plastic cutlery", "a factory that moulds plastic forks"] },
  { f: "Interest rates rise sharply", cat: "Economic", good: ["a firm with large cash savings earning interest", "a debt-free firm with money on deposit"], bad: ["a firm with a large variable-rate loan", "a builder that relies on cheap borrowing"] },
  { f: "Far more people now work from home", cat: "Social", good: ["a maker of home-office desks", "a video-call software firm"], bad: ["a city-centre sandwich bar that serves office workers", "a commuter bus company"] },
  { f: "Fast mobile internet reaches rural areas", cat: "Technological", good: ["a video-streaming service", "an online-only bank"], bad: ["a DVD rental shop in a rural town", "a village internet café"] },
  { f: "Summers become hotter and drier", cat: "Environmental", good: ["an ice-cream maker", "a seller of electric fans"], bad: ["a farm growing water-hungry crops", "a ski resort"] },
  { f: "The home currency falls sharply against other currencies", cat: "Economic", good: ["a firm that exports most of its goods", "a hotel that attracts many foreign tourists"], bad: ["a shop that imports all of its stock", "a firm that buys its fuel from abroad"] },
  { f: "The population is ageing", cat: "Social", good: ["a maker of mobility scooters", "a care-home operator"], bad: ["a maker of baby clothes", "a nightclub aimed at under-25s"] },
  { f: "The government decides to spend far more on new railways", cat: "Political", good: ["a firm that builds railway track", "a maker of train carriages"], bad: ["a long-distance coach company", "a domestic airline"] },
  { f: "Cheap driverless delivery robots go on sale", cat: "Technological", good: ["an online grocery firm", "a takeaway delivery app"], bad: ["an agency that supplies delivery drivers", "a courier firm with 500 van drivers"] },
  { f: "Coastal floods become much more frequent", cat: "Environmental", good: ["a firm that builds flood barriers", "a maker of water pumps"], bad: ["a hotel on a low-lying beach", "a seaside caravan park"] },
  { f: "A new law limits how much data apps may collect", cat: "Legal", good: ["a privacy software firm", "a data-protection consultancy"], bad: ["an app maker that sells users' data to advertisers", "a firm that sells personal data lists"] },
  { f: "A new government ends grants for home solar panels", cat: "Political", good: ["a gas boiler installer", "an oil heating supplier"], bad: ["a solar panel installer", "a maker of rooftop solar panels"] },
];

function genPestle(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard", "expert"]);
  const firm = rng.pick(FIRMS);
  if (diff === "expert") {
    const c = rng.pick(PESTLE_CASES);
    const order = rng.next() < 0.5;
    const good = rng.pick(c.good), bad = rng.pick(c.bad);
    const f1 = order ? good : bad, f2 = order ? bad : good;
    const OT = ["Opportunity", "Threat", "Strength", "Weakness"];
    const ans = [c.cat, order ? "Opportunity" : "Threat", order ? "Threat" : "Opportunity"];
    const prefer = [[c.cat, ans[2], ans[1]]];
    return segQ(rng, diff,
      `${c.f}.\n\n- **Firm 1** is ${f1}.\n- **Firm 2** is ${f2}.\n\nWhich PESTLE factor is this, and in each firm's SWOT analysis is it a strength, weakness, opportunity or threat?`,
      ["PESTLE factor", "For Firm 1", "For Firm 2"], ans, [PESTLE, OT, OT], prefer, null,
      {
        explanation: `- PESTLE: ${PESTLE_WHY[c.cat]} So it is **${c.cat}**.\n- It is outside both firms' control, so in SWOT it can only be an opportunity or a threat, never a strength or weakness.\n- It helps ${order ? f1 : f2}, so it is an **opportunity** for Firm ${order ? 1 : 2}, and harms ${order ? f2 : f1}, so it is a **threat** for Firm ${order ? 2 : 1}.`,
        hints: [PESTLE_HINTS[0], "A PESTLE factor is external, so in a SWOT it becomes an opportunity or a threat. Which one depends on whether it helps or harms that particular firm."],
        params: { kind: "pestleExpert", f: c.f, f1, f2 },
      });
  }
  const n = diff === "easy" ? 1 : diff === "medium" ? 2 : 3;
  const cats = rng.shuffle(PESTLE.slice()).slice(0, n);
  const facs = cats.map((c) => rng.pick(PESTLE_BANK[c]));
  const explanation = facs.map((f, i) => `- ${cap(f)}: **${cats[i]}**. ${PESTLE_WHY[cats[i]]}`).join("\n");
  if (diff === "easy") {
    return plain(`${firm} is carrying out a PESTLE analysis. Which category does this factor belong to? **${cap(facs[0])}**`, cats[0], plainChoices(rng, cats[0], PESTLE),
      { explanation, hints: PESTLE_HINTS, params: { kind: "pestle", facs } });
  }
  const list = facs.map((f, i) => `${i + 1}. ${cap(f)}`).join("\n");
  return segQ(rng, diff, `${firm} is carrying out a PESTLE analysis. Which category does each factor belong to?\n\n${list}`,
    facs.map((_, i) => `Factor ${i + 1}`), cats, facs.map(() => PESTLE), [], null,
    { explanation, hints: PESTLE_HINTS, params: { kind: "pestle", facs } });
}

// ---------------------------------------------------------------------------------------------
// Entry point

export function generate({ subtopic, difficulty, rng }) {
  switch (subtopic) {
    case "ownership": return genOwnership(difficulty, rng);
    case "stakeholders": return genStakeholders(difficulty, rng);
    case "objectives": return genObjectives(difficulty, rng);
    case "swot": return genSwot(difficulty, rng);
    case "pestle": return genPestle(difficulty, rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Verify: recompute the expected answer from the stated facts, then check the question's shape.

function expected(p) {
  switch (p.kind) {
    case "ownEasy": return groupOf(FORM_DESC, p.desc);
    case "ownMed": return FORM_FACTS[p.form] ? rowOf(FORM_FACTS[p.form]) : null;
    case "split": {
      // Cross-check: the shares of all partners add back up to the profit.
      const sum = p.ratio.reduce((a, b) => a + b, 0);
      const shares = p.ratio.map((r) => (p.P * r) / sum);
      if (Math.abs(shares.reduce((a, b) => a + b, 0) - p.P) > 1e-6) return null;
      return shares[p.who];
    }
    case "dps": return (p.X / p.N) * (p.d / 100);
    case "liab": return FORM_FACTS[p.form]?.limited ? 0 : Math.max(0, p.D - p.A);
    case "ownExpert": {
      // Pick the form whose facts meet the needs: several owners, liability, public shares.
      const fits = FORMS.filter((f) => {
        const x = FORM_FACTS[f];
        return x.owners !== 1 && x.limited === p.limited && (p.limited ? (x.shares === "public") === p.pub : x.shares === "none");
      });
      if (fits.length !== 1) return null;
      const c = p.calc;
      let calc;
      if (fits[0] === "Partnership") calc = (p.calc.P * c.ratio[c.who]) / c.ratio.reduce((a, b) => a + b, 0);
      else if (fits[0] === "Private limited company") calc = (c.Dv / c.N) * c.held;
      else calc = (c.X / c.N) * (c.d / 100);
      return { form: fits[0], calc };
    }
    case "stkInterest": return INTEREST[p.g] ?? null;
    case "stkWhich": return (p.inside ? INTERNAL : EXTERNAL).includes(p.ans) && !(p.inside ? EXTERNAL : INTERNAL).includes(p.ans) ? p.ans : null;
    case "stkMed": return GROUPS.includes(p.g) ? [EXTERNAL.includes(p.g) ? "External" : "Internal", INTEREST[p.g]] : null;
    case "stkConflict": {
      const hits = CONFLICTS.filter((c) => c.d === p.d);
      if (hits.length !== 1 || hits[0].gain === hits[0].lose || !GROUPS.includes(hits[0].gain) || !GROUPS.includes(hits[0].lose)) return null;
      return [hits[0].gain, hits[0].lose];
    }
    case "smartEasy":
    case "smartMed": {
      const f = smartFacts(p.t, p.n, p.g);
      if (!f || p.n === 2 * p.g) return null;
      if (p.kind === "smartMed") return [f.M ? "Yes" : "No", f.A === null ? "Can't tell" : f.A ? "Yes" : "No", f.T ? "Yes" : "No"];
      if (!f.M && !f.T) return null; // fails two criteria: no single answer
      if (!f.M) return "Measurable";
      if (!f.T) return f.A ? "Time-bound" : null;
      return f.A ? "None: it is SMART" : "Achievable";
    }
    case "smartHard": {
      const target = p.R + (p.R * p.n) / 100;
      if (p.X === target || p.n === 2 * p.g) return null;
      return { target, achievable: p.n * 1 <= p.g + p.g ? "Yes" : "No", met: p.X > target ? "Yes" : "No" };
    }
    case "swot":
    case "swotMed": {
      const c = p.facs.map((f) => groupOf(SWOT_BANK, f));
      if (c.includes(null) || new Set(p.facs).size !== p.facs.length) return null;
      if (p.kind === "swotMed") {
        const internal = c[0] === "Strength" || c[0] === "Weakness", helpful = c[0] === "Strength" || c[0] === "Opportunity";
        return [internal ? "Internal" : "External", helpful ? "Helpful" : "Harmful", swotOf(internal, helpful)];
      }
      return c.length === 1 ? c[0] : c;
    }
    case "pestle": {
      const c = p.facs.map((f) => groupOf(PESTLE_BANK, f));
      if (c.includes(null)) return null;
      return c.length === 1 ? c[0] : c;
    }
    case "pestleExpert": {
      const hits = PESTLE_CASES.filter((c) => c.f === p.f);
      if (hits.length !== 1) return null;
      const c = hits[0];
      const side = (x) => (c.good.includes(x) && !c.bad.includes(x) ? "Opportunity" : c.bad.includes(x) && !c.good.includes(x) ? "Threat" : null);
      const a = side(p.f1), b = side(p.f2);
      if (!a || !b || !PESTLE.includes(c.cat)) return null;
      return [c.cat, a, b];
    }
    default: return null;
  }
}

function checkPlainChoice(choices, want, answer) {
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 6) return false;
  const keys = choices.map(keyOf);
  if (new Set(keys).size !== keys.length) return false;
  if (keys.filter((k) => k === want).length !== 1) return false;
  return keyOf(answer) === want;
}

// Build mode: within a column no two blocks may read the same (ignoring case, spacing and the
// minus sign), so the only correct set of one block per column is the answer's; and there must be
// enough distractor blocks for the difficulty's range.
const BLOCK_MIN = { easy: 1, medium: 3, hard: 6, expert: 9 };
const normSeg = (v) => String(v).trim().toLowerCase().replace(/\s+/g, " ").replace(/−/g, "-");
function blocksOk(q, want, diff) {
  const cols = q.choiceCols;
  const perCol = cols.map(() => new Map());
  const add = (j, v) => {
    const k = normSeg(v);
    if (perCol[j].has(k) && perCol[j].get(k) !== v) return false;
    perCol[j].set(k, v);
    return true;
  };
  for (const c of q.choices) if (!segsOf(c).every((v, j) => add(j, v))) return false;
  const extra = q.extraSegs || [];
  if (!Array.isArray(extra)) return false;
  for (const e of extra) {
    const j = cols.indexOf(e[0]);
    if (j < 0 || typeof e[1] !== "string" || !e[1] || e[1].length > 40 || e[1].includes("|")) return false;
    if (normSeg(e[1]) === normSeg(want[j])) return false;
    if (!add(j, e[1])) return false;
  }
  const distractors = perCol.reduce((n, m, j) => n + [...m.keys()].filter((k) => k !== normSeg(want[j])).length, 0);
  return distractors >= (BLOCK_MIN[diff] ?? 3);
}

function checkSegChoice(q, p, want, answer) {
  const cols = q.choiceCols;
  if (!Array.isArray(cols) || cols.length !== want.length || cols.length < 2 || cols.length > 4) return false;
  if (cols.some((c) => typeof c !== "string" || !c || c.length > 24)) return false;
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length !== optionCount(p.diff)) return false;
  if (!blocksOk(q, want, p.diff)) return false;
  for (const c of ch) {
    const s = segsOf(c);
    if (s.length !== want.length || s.some((x) => !x || x.length > 40)) return false;
    if (s.filter((x, i) => x !== want[i]).length === want.length) return false;
  }
  return checkPlainChoice(ch, want.join(SEP), answer);
}

const numOk = (x, want, tol) => x !== "" && x !== null && Number.isFinite(Number(x)) && Math.abs(Number(x) - want) <= Math.max(tol, 1e-9);

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  const want = expected(p);
  if (want === null || want === undefined) return false;
  if (question.answerType === "multi") {
    const parts = question.parts;
    if (!Array.isArray(parts) || !answer || typeof answer !== "object") return false;
    if (parts.length !== Object.keys(want).length) return false;
    return parts.every((pt) => {
      if (!(pt.id in want)) return false;
      if (pt.answerType === "number") return numOk(answer[pt.id], want[pt.id], pt.tolerance || 0);
      if (pt.answerType === "choice") return checkPlainChoice(pt.choices, String(want[pt.id]), answer[pt.id]);
      return false;
    });
  }
  if (question.answerType === "number") return typeof want === "number" && numOk(answer, want, question.tolerance || 0);
  if (question.answerType !== "choice") return false;
  if (Array.isArray(want)) {
    if (p.kind === "stkConflict" && question.choices.some((c) => segsOf(c)[0] === segsOf(c)[1])) return false;
    return checkSegChoice(question, p, want, answer);
  }
  if (question.choiceCols !== undefined) return false;
  return checkPlainChoice(question.choices, want, answer);
}
