// Software Engineer scenarios (role-only module, Expert+). Uses only the seeded rng passed in.
// Every question is one workplace scenario with 3-4 parts, each a different skill:
//   api-endpoint    SQL on a sample table -> index complexity -> binary-search probes -> transfer time
//   ledger-check    SQL SUM -> card fees rounded per payment -> float truncation bug -> the fix
//   hot-loop        trace a Python loop -> time and memory growth -> data size -> upload time
//   fx-payout       fee with a minimum -> currency conversion floored to the cent -> settlement date -> batch time
// Code is Python 3 only (stated in each prompt). Money is handled in whole cents. Parts that use an
// earlier answer are drawn so the rounded earlier answer gives the same later answer, and no answer
// sits on a rounding half-step (the generator redraws with the same rng until both hold).
// verify() recomputes each part another way: it re-reads the SQL text, simulates loops and binary
// search, runs the code options on the amounts, and walks the calendar day by day.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const nearTie2 = (x) => Math.abs(((Math.abs(x) * 100) % 1) - 0.5) < 1e-6;
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); // non-negative integers
const f2 = (n) => round2(n).toFixed(2);
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
// Cents (non-negative integer) as "1234.56" (calculator, SQL, Python) or "$1,234.56" (prose).
const dec = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const usd = (c) => `$${commas(Math.floor(c / 100))}.${String(c % 100).padStart(2, "0")}`;
const eur = (c) => `€${commas(Math.floor(c / 100))}.${String(c % 100).padStart(2, "0")}`;

const mdTable = (name, cols, rows) =>
  `**${name}**\n\n| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n` +
  rows.map((r) => `| ${cols.map((c) => r[c]).join(" | ")} |`).join("\n");

const given = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const row = (label, v) => `- \`${label} = ${v}\``;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;

const ROUND2 = " Round to 2 decimal places.";
const MBPS = "1 Mbps = 1,000,000 bits per second";

function distinctInts(rng, lo, hi, n) {
  const all = [];
  for (let v = lo; v <= hi; v++) all.push(v);
  return rng.shuffle(all).slice(0, n);
}

// Part builders. Number parts: dp 0 = whole number (tolerance 0), dp 2 = 2 decimals (0.005).
function numPart(id, label, ask, answer, dp, hint) {
  return { id, label, ask, answerType: "number", answer: dp ? round2(answer) : answer, tolerance: dp ? 0.005 : 0, hint };
}
function choicePart(id, label, ask, answer, choices, hint) {
  return { id, label, ask, answerType: "choice", answer, choices, hint };
}
function segPart(id, label, ask, cols, answer, choices, hint) {
  return { id, label, ask, answerType: "choice", choiceCols: cols, answer, choices, hint };
}

// verify helpers
const isNum = (v) => v !== null && v !== undefined && String(v).trim() !== "" && Number.isFinite(Number(v));
const sameInt = (v, want) => isNum(v) && Number(v) === want;
const same2dp = (v, exact) => isNum(v) && !nearTie2(exact) && Math.abs(Number(v) - round2(exact)) < 0.005 + 1e-9 && Math.abs(Number(v) - exact) < 0.005 + 1e-9;

// Segmented options: the answer plus 4 pairs that differ from it in exactly one column.
const ORDERS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)"];
function pairOptions(rng, answer, pool) {
  const wrong = [];
  for (const v of pool) {
    if (v !== answer[0]) wrong.push([v, answer[1]]);
    if (v !== answer[1]) wrong.push([answer[0], v]);
  }
  return rng.shuffle([answer, ...rng.shuffle(wrong).slice(0, 4)]);
}
const joinSeg = (a) => a.join(" | ");
function segOk(question, part, answer, want) {
  const p = question.parts && question.parts.find((x) => x.id === part);
  if (!p || !Array.isArray(p.choices) || p.choices.length !== 5) return false;
  const joined = p.choices.map((c) => (Array.isArray(c) ? joinSeg(c) : String(c)));
  if (new Set(joined).size !== 5 || !joined.includes(joinSeg(want))) return false;
  const a = Array.isArray(answer) ? joinSeg(answer) : String(answer ?? "").split("|").map((s) => s.trim()).join(" | ");
  return a === joinSeg(want);
}

// ---------------------------------------------------------------------------------------------
// Subtopic: api-endpoint (Backend)

const CUSTOMERS = ["Ava", "Ben", "Chen", "Dara", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jun", "Kai", "Lena", "Mo", "Nia"];
const STATUSES = ["paid", "shipped", "pending", "refunded"];
const NUM_OPS = [">", ">=", "<", "<="];
const LOOKUPS = [
  { key: "by-id", col: "id", what: "fetches one order by its `id`", ans: ["O(n)", "O(log n)"],
    why: "Without an index the database checks rows one by one until it finds the id (n in the worst case). A B-tree on `id` is a balanced search tree, so a lookup walks one path from the root: its height grows like log n." },
  { key: "min-total", col: "total", what: "finds the smallest `total` in the table", ans: ["O(n)", "O(log n)"],
    why: "Without an index every row must be read to be sure of the minimum. A B-tree on `total` keeps the keys sorted, so the smallest is at the end of the leftmost path: log n steps." },
  { key: "sorted", col: "total", what: "returns every row sorted by `total` (`ORDER BY total`)", ans: ["O(n log n)", "O(n)"],
    why: "Without an index the database must sort all n rows (n log n). A B-tree on `total` already holds them in order, so it just walks the index from start to end: n steps." },
];

function cmpNum(a, op, b) {
  return op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : a <= b;
}
function bitLength(n) {
  let b = 0;
  while (2 ** b <= n) b++;
  return b;
}

function genApi(rng) {
  for (let tries = 0; tries < 60; tries++) {
    const names = rng.shuffle(CUSTOMERS).slice(0, 8);
    const base = rng.int(11, 89) * 100;
    const totals = distinctInts(rng, 8, 480, 8);
    const statuses = names.map(() => rng.pick(STATUSES));
    const rows = names.map((nm, i) => ({ id: base + i + 1, customer: nm, status: statuses[i], total: totals[i] }));
    const sOp = rng.pick(["=", "=", "<>"]);
    const sVal = rng.pick(statuses);
    const nOp = rng.pick(NUM_OPS);
    const T = rng.next() < 0.5 ? rng.pick(totals) : rng.int(20, 460);
    const match = rows.filter((r) => (sOp === "=" ? r.status === sVal : r.status !== sVal) && cmpNum(r.total, nOp, T));
    const c = match.length;
    const look = rng.pick(LOOKUPS);
    const m = rng.int(50, 600) * 1000;
    const N = 8 * m;
    const B = rng.int(30, 120) * 4;
    const R = rng.pick([50, 100, 200, 250, 500, 1000]);
    if (c < 1 || c > 7) continue;
    const l2 = Math.log2(N);
    if (Math.abs(l2 - Math.round(l2)) < 0.02) continue; // keep clear of powers of two
    const probes = bitLength(N);
    const prodRows = c * m;
    const secs = (prodRows * B * 8) / (R * 1e6);
    if (nearTie2(secs) || secs < 0.05) continue;

    const sql = `SELECT * FROM orders\nWHERE status ${sOp} '${sVal}' AND total ${nOp} ${T};`;
    const cols = ["id", "customer", "status", "total"];
    const prompt =
      `You own the \`GET /orders\` endpoint of a shop's API, and it has become slow. Here is a sample of the \`orders\` table:\n\n` +
      `${mdTable("orders", cols, rows)}\n\nThe endpoint runs this query:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n` +
      `In production the table has **${commas(N)}** rows. Each returned row is sent to the app as a JSON object of **${B} bytes**, over a **${R} Mbps** link (${MBPS}). ` +
      `Text matches exactly, including capitals.`;
    const optCols = ["Without index", "With B-tree index"];
    const opts = pairOptions(rng, look.ans, ORDERS);
    const parts = [
      numPart("rows", "SQL", "How many rows does the query return on this sample?", c, 0,
        `Split the WHERE into its two tests (status ${sOp} '${sVal}', total ${nOp} ${T}) and tick each row that passes both. Watch whether the number test includes ${T} itself.`),
      segPart("growth", "Indexes", `The endpoint also ${look.what}. How does the work grow with n rows, without an index and with a B-tree index on \`${look.col}\`?`,
        optCols, look.ans, opts,
        "Without an index the database can only read the rows as they are stored. A B-tree keeps keys sorted in a balanced tree: one root-to-leaf path is about log n steps, and its leaves can be read in order."),
      numPart("probes", "Algorithms", `The index finds a key like a binary search over the ${commas(N)} sorted keys. In the worst case, how many keys does it compare against (one per halving step)?`, probes, 0,
        "Each comparison halves the keys still in play, and the search ends when one is left. Count the halvings: the worst case is ⌊log₂ n⌋ + 1 comparisons, and log₂ n = ln(n) ÷ ln(2)."),
      numPart("transfer", "Networking", `Assume the same share of rows match in production as in the sample. How many seconds does it take to send all the matching rows? Ignore latency and headers.${ROUND2}`, secs, 2,
        `Scale up your SQL answer: the sample has 8 rows and production has ${commas(N)}, so multiply the matches by ${commas(N)} ÷ 8. Then bytes × 8 gives bits, and bits ÷ (\`_mbps\` × 1,000,000) gives seconds.`),
    ];
    const pass = match.map((r) => `${r.id} (${r.status}, ${r.total})`).join("; ");
    const explanation =
      `**SQL.** A row must pass both tests: status ${sOp} '${sVal}' and total ${nOp} ${T}. Passing rows: ${pass}. So the query returns **${c}** rows.\n\n` +
      `**Indexes.** ${look.why} So the answer is **${look.ans[0]}** without an index and **${look.ans[1]}** with it.\n\n` +
      `**Algorithms.** 2^${probes - 1} = ${commas(2 ** (probes - 1))} ≤ ${commas(N)} < 2^${probes} = ${commas(2 ** probes)}, so ⌊log₂ n⌋ = ${probes - 1} and the worst case is **${probes}** comparisons (a full scan could need ${commas(N)}).\n\n` +
      `**Networking.** ${c} of 8 rows match, so production returns ${c} × ${commas(N)} ÷ 8 = ${commas(prodRows)} rows.\n\n` +
      [row("_n", N), row("_row_bytes", B), row("_mbps", R),
        step("_rows", `${c} * _n / 8`, commas(prodRows)),
        step("_bits", "_rows * _row_bytes * 8", commas(prodRows * B * 8)),
        step("_secs", "_bits / (_mbps * 1e6)", `${num(secs)}, which rounds to **${f2(secs)} s**`)].join("\n");
    return {
      prompt, answerType: "multi", parts, explanation,
      given: given([["_n", N], ["_row_bytes", B], ["_mbps", R]]),
      params: { kind: "api", sql, rows: rows.map((r) => ({ ...r })), look: look.key, N, B, R },
    };
  }
  throw new Error("api-endpoint: no draw");
}

// Independent reader for the rendered SQL: WHERE status <op> '<v>' AND total <op> <n>.
function countFromSql(sql, rows) {
  const m = /WHERE\s+status\s*(=|<>)\s*'([^']*)'\s+AND\s+total\s*(>=|<=|>|<)\s*(\d+)\s*;/.exec(sql);
  if (!m) return null;
  let n = 0;
  for (const r of rows) {
    const a = m[1] === "=" ? r.status === m[2] : r.status !== m[2];
    const t = Number(m[4]);
    let b;
    switch (m[3]) {
      case ">": b = r.total - t > 0; break;
      case ">=": b = !(r.total < t); break;
      case "<": b = t - r.total > 0; break;
      default: b = !(r.total > t);
    }
    if (a && b) n++;
  }
  return n;
}
const LOOKUP_TRUTH = { "by-id": ["O(n)", "O(log n)"], "min-total": ["O(n)", "O(log n)"], sorted: ["O(n log n)", "O(n)"] };

function verifyApi(q, a) {
  const p = q.params;
  if (!Array.isArray(p.rows) || p.rows.length !== 8) return false;
  const c = countFromSql(p.sql, p.rows);
  if (c === null || c < 1 || !sameInt(a.rows, c)) return false;
  if (!LOOKUP_TRUTH[p.look] || !segOk(q, "growth", a.growth, LOOKUP_TRUTH[p.look])) return false;
  // Worst-case binary search: simulate the largest remaining half each time.
  let size = p.N, probes = 0;
  while (size > 0) { probes++; size = Math.floor(size / 2); }
  if (!sameInt(a.probes, probes)) return false;
  const mbits = (c * (p.N / 8) * p.B * 8) / 1e6;
  return same2dp(a.transfer, mbits / p.R);
}

// ---------------------------------------------------------------------------------------------
// Subtopic: ledger-check (Fintech)

const ACCOUNTS = ["AC-101", "AC-102", "AC-117", "AC-205", "AC-311", "AC-420"];
const KINDS = ["card", "card", "refund", "payout"];
// Replacement lines for the float bug, with what each does to the amounts (JS doubles = Python floats).
const FIXES = {
  ok: { code: "cents = sum(round(a * 100) for a in amounts)", run: (am) => am.reduce((s, a) => s + Math.round(a * 100), 0),
    why: "rounds each amount to whole cents first, then adds integers, which floats hold exactly" },
  round100: { code: "cents = round(total * 100)", run: (am, t) => Math.round(t * 100),
    why: "rounds to the nearest cent instead of cutting off: the float error is far smaller than half a cent" },
  halfUp: { code: "cents = int(total * 100 + 0.5)", run: (am, t) => Math.trunc(t * 100 + 0.5),
    why: "adds half a cent before cutting off, which rounds a positive total to the nearest cent" },
  old: { code: "cents = int(total * 100)", run: (am, t) => Math.trunc(t * 100) },
  intTotal: { code: "cents = int(total) * 100", run: (am, t) => Math.trunc(t) * 100 },
  itemTrunc: { code: "cents = sum(int(a * 100) for a in amounts)", run: (am) => am.reduce((s, a) => s + Math.trunc(a * 100), 0) },
  roundTotal: { code: "cents = round(total)", run: (am, t) => Math.round(t) },
  tenths: { code: "cents = int(total * 10) * 10", run: (am, t) => Math.trunc(t * 10) * 10 },
  sumInt: { code: "cents = sum(int(a) for a in amounts) * 100", run: (am) => am.reduce((s, a) => s + Math.trunc(a), 0) * 100 },
};
const GOOD_FIXES = ["ok", "round100", "halfUp"];
const tick = (s) => `\`${s}\``;

function genLedger(rng) {
  for (let tries = 0; tries < 200; tries++) {
    const accts = rng.shuffle(ACCOUNTS).slice(0, rng.int(2, 3));
    const acct = accts[0];
    const base = rng.int(20, 97) * 100;
    const rows = [];
    for (let i = 0; i < 8; i++) {
      rows.push({ id: base + i + 1, account: rng.pick(accts), kind: rng.pick(KINDS), amountC: rng.int(150, 25000) });
    }
    const bp = rng.pick([140, 175, 190, 215, 250, 290, 320]);
    const fixedC = rng.pick([10, 15, 20, 25, 30]);
    const match = rows.filter((r) => r.account === acct && r.kind === "card");
    if (match.length < 3 || match.length > 5) continue;
    if (match.some((r) => Math.abs(((r.amountC * bp) % 10000) - 5000) <= 1)) continue; // fee half-cent ties
    const trueC = match.reduce((s, r) => s + r.amountC, 0);
    const amounts = match.map((r) => parseFloat(dec(r.amountC)));
    let t = 0.0;
    for (const a of amounts) t += a;
    const clean = parseFloat(dec(trueC));
    if (t === clean) continue; // the float error must show in print(total)
    const cents = Math.trunc(t * 100);
    if ((t < clean) !== (cents < trueC) || Math.abs(cents - trueC) > 1) continue; // printed value must explain int()
    const okId = rng.pick(GOOD_FIXES);
    if (FIXES[okId].run(amounts, t) !== trueC) continue;
    const wrongIds = Object.keys(FIXES).filter((k) => !GOOD_FIXES.includes(k) && FIXES[k].run(amounts, t) !== trueC);
    if (wrongIds.length < 3) continue;
    const pickWrong = rng.shuffle(wrongIds).slice(0, 3);
    const choiceIds = rng.shuffle([okId, ...pickWrong]);
    const feeC = match.reduce((s, r) => s + Math.round((r.amountC * bp) / 10000) + fixedC, 0);

    const shown = rows.map((r) => ({ id: r.id, account: r.account, kind: r.kind, amount: dec(r.amountC) }));
    const sql = `SELECT SUM(amount) FROM payments\nWHERE account = '${acct}' AND kind = 'card';`;
    const code =
      `total = 0.0\nfor a in amounts:   # the matched amounts as floats, in table order\n    total += a\n` +
      `print(total)        # prints ${String(t)}\ncents = int(total * 100)`;
    const pct = num(bp / 100);
    const prompt =
      `You're on the payments team. Finance wants the card total for account **${acct}** checked against the bank. A sample of the \`payments\` table:\n\n` +
      `${mdTable("payments", ["id", "account", "kind", "amount"], shown)}\n\nThe report runs:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n` +
      `The card processor charges **${pct}% + ${usd(fixedC)}** per card payment, and each payment's fee is rounded to the nearest cent (halves round up).\n\n` +
      `The old report code, in Python 3 (\`int()\` drops everything after the point; \`round()\` with one argument gives the nearest whole number):\n\n\`\`\`python\n${code}\n\`\`\``;
    const choices = choiceIds.map((k) => tick(FIXES[k].code));
    const parts = [
      numPart("total", "SQL", `What does the query return, in dollars?${ROUND2}`, trueC / 100, 2,
        `Keep only rows where account is '${acct}' and kind is 'card', then add their amounts. Add in cents if you can: it avoids the very error this ticket is about.`),
      numPart("fees", "Fees", `What are the total processor fees on those payments, in dollars?${ROUND2}`, feeC / 100, 2,
        `Work out each payment's fee on its own: amount × ${pct} ÷ 100, rounded to the cent, plus ${usd(fixedC)}. Then add the fees up. Rounding the total once can give a different answer.`),
      numPart("cents", "Floats", "What whole number does the old code store in `cents`?", cents, 0,
        "Compare the printed `total` with your SQL answer: is it a hair above or below? Multiplying by 100 keeps that tiny error, and `int()` cuts towards zero rather than rounding."),
      choicePart("fix", "Fix", "Which replacement for the last line gives the exact total in cents for these amounts?", tick(FIXES[okId].code), choices,
        "Truncating is the bug: a total a hair below the true value loses a whole cent. A correct line rounds to the nearest cent somewhere, and works in cents, not dollars or tenths."),
    ];
    const lines = match.map((r) => {
      const raw = (r.amountC * bp) / 10000;
      return `- ${usd(r.amountC)}: ${dec(r.amountC)} × ${pct}% = ${num(raw / 100)} → ${usd(Math.round(raw))}, + ${usd(fixedC)} = ${usd(Math.round(raw) + fixedC)}`;
    });
    const wrongNotes = pickWrong.map((k) => `${tick(FIXES[k].code)} gives ${commas(FIXES[k].run(amounts, t))}`).join("; ");
    const explanation =
      `**SQL.** Rows for ${acct} with kind 'card': ${match.map((r) => usd(r.amountC)).join(" + ")} = **${usd(trueC)}** (${commas(trueC)} cents).\n\n` +
      `**Fees.** Each fee is rounded on its own, then added:\n\n${lines.join("\n")}\n\nTotal fees: **${usd(feeC)}**.\n\n` +
      `**Floats.** Binary floats can't hold most cent values exactly, so the running total prints as ${String(t)}, a hair ${t < clean ? "below" : "above"} ${dec(trueC)}. ` +
      `× 100 gives about ${num(t * 100)}${t < clean ? " (just under the whole number)" : ""}, and \`int()\` cuts off the fraction: **${commas(cents)}**` +
      `${cents === trueC ? ", which happens to be right this time, but only by luck." : `, one cent short of ${commas(trueC)}.`}\n\n` +
      `**Fix.** ${tick(FIXES[okId].code)} ${FIXES[okId].why}, so it gives ${commas(trueC)}. The others are wrong here: ${wrongNotes}.`;
    return {
      prompt, answerType: "multi", parts, explanation,
      given: given([["_fee_pct", bp / 100], ["_fixed_fee", fixedC / 100]]),
      params: { kind: "ledger", sql, rows: shown.map((r) => ({ ...r })), bp, fixedC, printed: String(t), choiceIds },
    };
  }
  throw new Error("ledger-check: no draw");
}

function verifyLedger(q, a) {
  const p = q.params;
  const m = /WHERE\s+account\s*=\s*'([^']+)'\s+AND\s+kind\s*=\s*'card'\s*;/.exec(p.sql);
  if (!m || !Array.isArray(p.rows)) return false;
  const match = p.rows.filter((r) => r.account === m[1] && r.kind === "card");
  if (match.length < 3) return false;
  // Cents from the amount text by string surgery (not by multiplying a float).
  const centsOf = (s) => { const [d, c] = String(s).split("."); return Number(d) * 100 + Number(c); };
  const trueC = match.reduce((s, r) => s + centsOf(r.amount), 0);
  if (!same2dp(a.total, trueC / 100)) return false;
  // Fees: half-up rounding by integer division on the remainder.
  let fee = 0;
  for (const r of match) {
    const x = centsOf(r.amount) * p.bp;
    const q0 = Math.floor(x / 10000), rem = x - q0 * 10000;
    if (rem === 5000) return false;
    fee += q0 + (rem > 5000 ? 1 : 0) + p.fixedC;
  }
  if (!same2dp(a.fees, fee / 100)) return false;
  // Re-run the float loop and int() from the amount strings.
  const amounts = match.map((r) => Number(r.amount));
  let t = 0;
  amounts.forEach((v) => { t = t + v; });
  if (String(t) !== p.printed) return false;
  const cents = t * 100 < 0 ? Math.ceil(t * 100) : Math.floor(t * 100);
  if (!sameInt(a.cents, cents)) return false;
  // Exactly one shown option gives the true cents.
  const fix = q.parts && q.parts.find((x) => x.id === "fix");
  if (!fix || !Array.isArray(fix.choices) || fix.choices.length !== 4 || new Set(fix.choices).size !== 4) return false;
  const passing = p.choiceIds.filter((k) => FIXES[k] && FIXES[k].run(amounts, t) === trueC);
  if (passing.length !== 1) return false;
  const want = tick(FIXES[passing[0]].code);
  return fix.choices.includes(want) && String(a.fix) === want;
}

// ---------------------------------------------------------------------------------------------
// Subtopic: hot-loop (Backend and Fintech)

// hot(n): runs of the # hot line; recs(n): pairs appended; sim(n): [hot, recs] by running the loop.
const LOOPS = [
  { key: "square", code: ["for i in range(n):", "    for j in range(n):", "        out.append((i, j))      # hot"], time: "O(n²)", mem: "O(n²)",
    hot: (n) => n * n, recs: (n) => n * n, quad: true,
    why: "The inner loop runs n times for each of the n values of i, and every run appends a pair." },
  { key: "triangle", code: ["for i in range(n):", "    for j in range(i + 1, n):", "        out.append((i, j))      # hot"], time: "O(n²)", mem: "O(n²)",
    hot: (n) => (n * (n - 1)) / 2, recs: (n) => (n * (n - 1)) / 2, quad: true,
    why: "j runs from i + 1, so the inner loop runs n − 1, n − 2, …, 0 times: n(n − 1)/2 in all. Halving n² doesn't change its growth." },
  { key: "doubling", code: ["for i in range(n):", "    j = 1", "    while j < n:", "        j *= 2                  # hot", "    out.append((i, j))"], time: "O(n log n)", mem: "O(n)",
    hot: (n) => n * Math.ceil(Math.log2(n)), recs: (n) => n, quad: false,
    why: "j doubles from 1 until it reaches n, which takes ⌈log₂ n⌉ steps, for each of the n values of i. Only one pair is appended per i." },
  { key: "inner-sum", code: ["for i in range(n):", "    total = 0", "    for j in range(n):", "        total += i * j          # hot", "    out.append((i, total))"], time: "O(n²)", mem: "O(n)",
    hot: (n) => n * n, recs: (n) => n, quad: false,
    why: "The inner loop runs n times for each i (n² steps), but it only updates one number. One pair is appended per i, so `out` grows like n." },
  { key: "three", code: ["for i in range(n):", "    for j in range(3):", "        out.append((i, j))      # hot"], time: "O(n)", mem: "O(n)",
    hot: (n) => 3 * n, recs: (n) => 3 * n, quad: false,
    why: "The inner loop always runs 3 times, a constant, so the work is 3n: constants drop out of Big-O." },
  { key: "evens", code: ["for i in range(n):", "    if i % 2 == 0:", "        out.append((i, i * i))  # hot"], time: "O(n)", mem: "O(n)",
    hot: (n) => Math.ceil(n / 2), recs: (n) => Math.ceil(n / 2), quad: false,
    why: "The loop runs n times and appends on every other one, so the work and the list are both about n/2." },
];
const RECS = [
  { desc: "two 32-bit integers", bits: [32, 32] },
  { desc: "two 64-bit integers", bits: [64, 64] },
  { desc: "a 32-bit integer followed by a 64-bit integer", bits: [32, 64] },
  { desc: "two 16-bit integers", bits: [16, 16] },
];
const JOBS = [
  "a nightly job that pairs up customer records",
  "a fraud-check job that compares transactions",
  "a report job that builds a lookup table",
  "a sync job that prepares rows for a partner",
];

function genLoop(rng) {
  for (let tries = 0; tries < 80; tries++) {
    const L = rng.pick(LOOPS);
    const job = rng.pick(JOBS);
    const small = L.key === "doubling" ? rng.int(5, 20) : L.quad || L.key === "inner-sum" ? rng.int(5, 9) : rng.int(5, 12);
    const N = L.quad ? rng.int(20, 300) * 50 : rng.int(20, 300) * 10000;
    const rec = rng.pick(RECS);
    const R = rng.pick([20, 50, 100, 200, 500, 1000]);
    const recBytes = (rec.bits[0] + rec.bits[1]) / 8;
    const bytes = L.recs(N) * recBytes;
    const mb = bytes / 1e6;
    const secs = (mb * 8) / R;
    if (nearTie2(mb) || nearTie2(secs) || round2(secs) < 0.05) continue;
    if (f2((round2(mb) * 8) / R) !== f2(secs) || nearTie2((round2(mb) * 8) / R)) continue; // chaining from the rounded size
    const hot = L.hot(small);
    const code = ["out = []", ...L.code].join("\n");
    const prompt =
      `You're profiling ${job}. Its core is this Python 3 code (\`range(a, b)\` counts from a up to b − 1, and \`range(n)\` from 0 up to n − 1):\n\n` +
      `\`\`\`python\n${code}\n\`\`\`\n\n` +
      `In production **n = ${commas(N)}**. The job stores each pair in \`out\` as **${rec.desc}** (no other overhead), then uploads those bytes over a **${R} Mbps** link (${MBPS}; 1 MB = 1,000,000 bytes).`;
    const opts = pairOptions(rng, [L.time, L.mem], ["O(log n)", "O(n)", "O(n log n)", "O(n²)"]);
    const parts = [
      numPart("runs", "Trace", `How many times does the line marked \`# hot\` run when n = ${small}?`, hot, 0,
        "Trace it by hand: for each value of i, count how many times the hot line runs, then add the counts up. A small table of i against runs helps."),
      segPart("growth", "Big-O", "As n grows, how do the running time and the size of `out` grow?", ["Time", "Memory of out"], [L.time, L.mem], opts,
        "Time follows the total number of loop steps; memory follows how many pairs end up in `out`. Drop constant factors and smaller terms."),
      numPart("size", "Data size", `How many megabytes do the pairs in \`out\` take in production?${ROUND2}`, mb, 2,
        "Bytes per pair = total bits ÷ 8. Count the pairs for the production n with the same rule you used in your trace, multiply, then divide by 1,000,000."),
      numPart("upload", "Networking", `How many seconds does the upload take? Use your size answer and ignore protocol overhead.${ROUND2}`, secs, 2,
        "Megabytes × 8 gives megabits; divide by the link speed in Mbps to get seconds."),
    ];
    const recExpr = L.key === "square" ? "_n * _n" : L.key === "triangle" ? "_n * (_n - 1) / 2" : L.key === "three" ? "3 * _n" : L.key === "evens" ? "ceil(_n / 2)" : "_n";
    const smallHow = L.key === "triangle" ? `${Array.from({ length: small }, (_, i) => small - 1 - i).join(" + ")} = ${hot}`
      : L.key === "doubling" ? `j goes 1 → 2 → … until it reaches ${small}: ${Math.ceil(Math.log2(small))} doublings, × ${small} values of i = ${hot}`
      : L.key === "evens" ? `i = ${Array.from({ length: Math.ceil(small / 2) }, (_, k) => 2 * k).join(", ")}: ${hot} runs`
      : L.key === "three" ? `3 × ${small} = ${hot}` : `${small} × ${small} = ${hot}`;
    const explanation =
      `**Trace.** For n = ${small}: ${smallHow}, so the hot line runs **${hot}** times.\n\n` +
      `**Big-O.** ${L.why} Time **${L.time}**, memory of \`out\` **${L.mem}**.\n\n` +
      `**Data size.** One pair is ${rec.bits[0]} + ${rec.bits[1]} = ${rec.bits[0] + rec.bits[1]} bits = ${recBytes} bytes.\n\n` +
      [row("_n", N), row("_pair_bytes", recBytes), row("_mbps", R),
        step("_pairs", recExpr, commas(L.recs(N))),
        step("_mb", "_pairs * _pair_bytes / 1e6", `${num(mb)}${Math.abs(mb - round2(mb)) > 1e-9 ? `, which rounds to **${f2(mb)} MB**` : ` → **${f2(mb)} MB**`}`),
        step("_secs", "_mb * 8 / _mbps", `${num(secs)}, which rounds to **${f2(secs)} s**`)].join("\n") +
      `\n\n**Networking.** Megabytes × 8 = megabits, and megabits ÷ Mbps = seconds.`;
    return {
      prompt, answerType: "multi", parts, explanation,
      given: given([["_n", N], ["_mbps", R]]),
      params: { kind: "loop", loop: L.key, small, N, bits: rec.bits.slice(), R },
    };
  }
  throw new Error("hot-loop: no draw");
}

// Run the loop shapes for real: [hot-line runs, pairs appended].
function simLoop(key, n) {
  let hot = 0, recs = 0;
  for (let i = 0; i < n; i++) {
    if (key === "square") { for (let j = 0; j < n; j++) { hot++; recs++; } }
    else if (key === "triangle") { for (let j = i + 1; j < n; j++) { hot++; recs++; } }
    else if (key === "doubling") { let j = 1; while (j < n) { j *= 2; hot++; } recs++; }
    else if (key === "inner-sum") { for (let j = 0; j < n; j++) hot++; recs++; }
    else if (key === "three") { for (let j = 0; j < 3; j++) { hot++; recs++; } }
    else if (key === "evens") { if (i % 2 === 0) { hot++; recs++; } }
    else return null;
  }
  return [hot, recs];
}
// Classify growth from a doubling experiment (n = 200 -> 400).
function growthOf(a, b) {
  const r = b / a;
  return r < 2.1 ? "O(n)" : r < 3 ? "O(n log n)" : r < 5 ? "O(n²)" : "?";
}
// Pairs at production size, summed per outer iteration (closed form per i).
function pairsAt(key, n) {
  if (key === "square") return n * n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += key === "triangle" ? n - 1 - i : key === "three" ? 3 : key === "evens" ? (i % 2 === 0 ? 1 : 0) : 1;
  }
  return s;
}

function verifyLoop(q, a) {
  const p = q.params;
  const s = simLoop(p.loop, p.small);
  if (!s || !sameInt(a.runs, s[0])) return false;
  const lo = simLoop(p.loop, 200), hi = simLoop(p.loop, 400);
  const want = [growthOf(lo[0] + 200, hi[0] + 400), growthOf(lo[1], hi[1])];
  if (want.includes("?") || !segOk(q, "growth", a.growth, want)) return false;
  const bytes = pairsAt(p.loop, p.N) * (p.bits[0] + p.bits[1]) / 8;
  const mb = bytes / 1e6;
  if (!same2dp(a.size, mb)) return false;
  // Seconds from the learner's own (rounded) size must agree with the exact value.
  return same2dp(a.upload, (bytes * 8) / (p.R * 1e6)) && same2dp(a.upload, (Number(a.size) * 8) / p.R);
}

// ---------------------------------------------------------------------------------------------
// Subtopic: fx-payout (Fintech)

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PAYEES = ["a supplier in Lisbon", "a freelancer in Berlin", "a hotel in Rome", "a studio in Dublin", "a shop in Vienna", "a school in Madrid"];
const dayMs = 86400000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const fromMs = (ms) => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() }; };
const fmtDay = (x) => `${x.d} ${MONTHS[x.m - 1]} ${x.y}`;
const hhmm = (h, mi) => `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;

function genFx(rng) {
  for (let tries = 0; tries < 80; tries++) {
    const amountC = rng.int(300, 9000) * 100 + rng.int(0, 99);
    const bp = rng.pick([50, 75, 90, 120, 150]);
    const minC = rng.pick([500, 750, 1000, 1500, 2500]);
    const rate = rng.int(6000, 15000); // euros per dollar × 10,000
    const day0 = utc(2026, 1, 1) + rng.int(0, 729) * dayMs;
    const hour = rng.int(7, 21);
    const minute = rng.int(0, 11) * 5;
    const k = rng.int(1, 3);
    const payee = rng.pick(PAYEES);
    const N = rng.int(150, 5000);
    const conc = rng.pick([4, 8, 10, 16, 25, 32, 50]);
    const ms = rng.int(8, 60) * 10;

    const pctX = amountC * bp; // fee in cents × 10,000
    const pctRem = pctX % 10000;
    if (Math.abs(pctRem - 5000) <= 1) continue;
    const pctC = Math.floor(pctX / 10000) + (pctRem > 5000 ? 1 : 0);
    const feeC = Math.max(minC, pctC);
    const x = (amountC - feeC) * rate; // euro cents × 10,000
    const rem = x % 10000;
    if (rem <= 5 || rem >= 9995) continue; // keep clear of whole cents, so calculator floats floor the same way
    const outC = Math.floor(x / 10000);

    const sub = fromMs(day0);
    const late = hour >= 16;
    let cur = day0;
    const isBiz = (ms0) => { const w = fromMs(ms0).w; return w !== 0 && w !== 6; };
    if (late || !isBiz(cur)) { do cur += dayMs; while (!isBiz(cur)); }
    const start = fromMs(cur);
    for (let i = 0; i < k; i++) { do cur += dayMs; while (!isBiz(cur)); }
    const settle = fromMs(cur);
    const batches = Math.ceil(N / conc);
    const secs = (batches * ms) / 1000;

    const pct = num(bp / 100);
    const rateTxt = (rate / 10000).toFixed(4);
    const prompt =
      `You're building the payout service for a marketplace. A customer pays **${usd(amountC)}** to ${payee}, who is paid in euros.\n\n` +
      `- Fee: **${pct}%** of the dollar amount, rounded to the nearest cent (halves round up), but never less than **${usd(minC)}**. It is taken from the dollars before conversion.\n` +
      `- Rate: **$1 = €${rateTxt}** (a made-up rate). The converted amount is **rounded down** to the whole euro cent.\n` +
      `- Timing: the payment was submitted on **${WEEKDAYS[sub.w]} ${fmtDay(sub)} at ${hhmm(hour, minute)}**. Payments submitted at 16:00 or later, or on a weekend, start on the next business day. Funds arrive **${k} business day${k > 1 ? "s" : ""}** after the start day (T+${k}). Business days are Monday to Friday; ignore public holidays.\n` +
      `- Batch: tonight the service sends **${commas(N)}** payouts to the bank's API, **${conc}** requests at a time. Each group takes **${ms} ms**, and the next group starts when it ends.`;
    const parts = [
      numPart("fee", "Fee", `What is the fee, in dollars?${ROUND2}`, feeC / 100, 2,
        `Work out ${pct}% of the amount and round it to the cent, then compare it with the minimum fee: the fee is the larger of the two.`),
      numPart("received", "Conversion", `How many euros does the payee receive?${ROUND2}`, outC / 100, 2,
        "Take your fee off the dollar amount first, then multiply by the rate. Round **down** to the cent (drop the extra digits), not to the nearest cent."),
      { id: "arrives", label: "Settlement", ask: "On what date do the funds arrive?", answerType: "date", precision: "day", answer: fmtDay(settle),
        hint: "First find the start day: the same day only if it is a weekday and before 16:00, otherwise the next weekday. Then count forward that many weekdays, skipping Saturdays and Sundays." },
      numPart("batch", "Throughput", "How many seconds does tonight's batch take? Ignore everything but the request time.", secs, 2,
        `Groups needed = ${commas(N)} ÷ ${conc}, rounded **up** (a part-full last group still takes a full ${ms} ms). Multiply by the time per group and convert ms to seconds.`),
    ];
    const pctRaw = pctX / 10000;
    const startWhy = late ? `it was submitted at ${hhmm(hour, minute)}, after the 16:00 cut-off` : !isBiz(day0) ? "it was submitted on a weekend" : "it was submitted on a weekday before 16:00";
    const explanation =
      `**Fee.** ${pct}% of ${usd(amountC)} = ${num(pctRaw / 100)}, which rounds to ${usd(pctC)}. ` +
      `${pctC >= minC ? `That is at least the ${usd(minC)} minimum, so the fee is **${usd(feeC)}**.` : `That is below the ${usd(minC)} minimum, so the fee is **${usd(feeC)}**.`}\n\n` +
      [row("_amount", dec(amountC)), row("_rate", rateTxt),
        step("_net", `_amount - ${dec(feeC)}`, dec(amountC - feeC)),
        step("_eur", "_net * _rate", `${num((amountC - feeC) * rate / 1e6)}`),
        step("_received", "floor(_eur * 100) / 100", `**${eur(outC)}**`)].join("\n") +
      `\n\n**Conversion.** Rounding down keeps ${eur(outC)}; rounding to the nearest cent would ${rem >= 5000 ? "add a cent" : "give the same here, but it's not the rule"}.\n\n` +
      `**Settlement.** The start day is ${WEEKDAYS[start.w]} ${fmtDay(start)}, because ${startWhy}. Counting ${k} business day${k > 1 ? "s" : ""} forward gives **${WEEKDAYS[settle.w]} ${fmtDay(settle)}**.\n\n` +
      `**Throughput.** ${commas(N)} ÷ ${conc} = ${num(N / conc)}, rounded up to ${commas(batches)} groups. ${commas(batches)} × ${ms} ms = ${commas(batches * ms)} ms = **${f2(secs)} s**.`;
    return {
      prompt, answerType: "multi", parts, explanation,
      given: given([["_amount", amountC / 100], ["_fee_pct", bp / 100], ["_min_fee", minC / 100], ["_rate", rate / 10000], ["_payouts", N], ["_concurrency", conc], ["_group_ms", ms]]),
      params: { kind: "fx", amountC, bp, minC, rate, sub: [sub.y, sub.m, sub.d], hour, minute, k, N, conc, ms },
    };
  }
  throw new Error("fx-payout: no draw");
}

// Day of week by Sakamoto's method (0 = Sunday), month lengths by rule: no Date object.
function dow(y, m, d) {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (m < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
}
function monthLen(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}
function nextDay([y, m, d]) {
  if (d < monthLen(y, m)) return [y, m, d + 1];
  return m < 12 ? [y, m + 1, 1] : [y + 1, 1, 1];
}

function verifyFx(q, a) {
  const p = q.params;
  // Fee: percent by exact rational comparison, then the minimum.
  const exact = (p.amountC * p.bp) / 10000;
  const lo = Math.floor(exact);
  const pctC = exact - lo >= 0.5 ? lo + 1 : lo;
  const feeC = pctC < p.minC ? p.minC : pctC;
  if (!same2dp(a.fee, feeC / 100)) return false;
  // Received: integer long division of (net cents × rate) by 10,000.
  const prod = (p.amountC - feeC) * p.rate;
  const outC = (prod - (prod % 10000)) / 10000;
  if (!isNum(a.received) || Math.round(Number(a.received) * 100) !== outC || Math.abs(Number(a.received) * 100 - outC) > 1e-6) return false;
  // Settlement date: walk the calendar.
  let cur = p.sub.slice();
  const biz = (c) => { const w = dow(c[0], c[1], c[2]); return w >= 1 && w <= 5; };
  if (p.hour >= 16 || !biz(cur)) { do cur = nextDay(cur); while (!biz(cur)); }
  for (let i = 0; i < p.k; i++) { do cur = nextDay(cur); while (!biz(cur)); }
  const want = `${cur[2]} ${MONTHS[cur[1] - 1]} ${cur[0]}`;
  if (String(a.arrives ?? "").trim() !== want) return false;
  // Batch: count groups by repeated subtraction.
  let left = p.N, groups = 0;
  while (left > 0) { left -= p.conc; groups++; }
  return same2dp(a.batch, (groups * p.ms) / 1000);
}

// ---------------------------------------------------------------------------------------------
// Entry points

const GENS = { "api-endpoint": genApi, "ledger-check": genLedger, "hot-loop": genLoop, "fx-payout": genFx };

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty !== "expert-plus") throw new Error(`Unknown difficulty: ${difficulty}`);
  const g = GENS[subtopic];
  if (!g) throw new Error(`Unknown subtopic: ${subtopic}`);
  return g(rng);
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  try {
    if (p.kind === "api") return verifyApi(question, answer);
    if (p.kind === "ledger") return verifyLedger(question, answer);
    if (p.kind === "loop") return verifyLoop(question, answer);
    if (p.kind === "fx") return verifyFx(question, answer);
  } catch (e) {
    return false;
  }
  return false;
}
