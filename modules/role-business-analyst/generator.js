// Business Analyst (role-only, Expert+). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario that chains skills from several subjects:
//   sales-review      SQL query text -> market growth -> relative share + Boston category -> strategy
//   statement-review  liquidity ratio -> gearing -> interpretation vs last year -> lender's decision
//   investment-case   payback (units x contribution) -> NPV -> sensitivity margin -> decision
//   campaign-pricing  segment sizing -> life-cycle stage -> skimming vs penetration -> launch plan
// Logic and wording are copied from the SQL Queries, Marketing, Finance Theory and Business Case
// generators (never imported). All rng draws happen before any text, hint or explanation is built,
// and a draw that would put an answer on a rounding half-step or next to a decision threshold is
// redrawn inside generate(), so a learner who carries a rounded earlier answer forward still gets
// the same later answer.
// verify() rechecks every part from params with its own arithmetic: SQL answers (and every
// accepted form) are tokenized, parsed and run by a separate mini SQL engine over the raw rows.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (n) => (n < 0 ? `−$${fmt(-n)}` : `$${fmt(n)}`);
const kmoney = (n) => `$${fmt(n)}k`;
const round1 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 10 + 1e-9) / 10;
const round2 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;
const signed1 = (n) => (n > 0 ? `+${n.toFixed(1)}%` : n < 0 ? `−${(-n).toFixed(1)}%` : "0.0%");
// x is not within 0.0001 of a rounding half-step at `dp` decimal places.
const safeAt = (x, dp) => Math.abs((Math.abs(x * 10 ** dp) % 1) - 0.5) > 1e-4;
const SEP = " | ";
const segsOf = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()) : String(v ?? "").split("|").map((s) => s.trim()));
const sameSegs = (a, b) => { const x = segsOf(a), y = segsOf(b); return x.length === y.length && x.every((s, i) => s === y[i]); };
const numOk = (cand, want, tol) => { const n = typeof cand === "number" ? cand : parseFloat(String(cand ?? "").replace(/−/g, "-").replace(/,/g, "")); return Number.isFinite(n) && Math.abs(n - want) <= tol + 1e-9; };
const part = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);

// The answer plus up to n − 1 distractors, each differing from it in 1–2 segments (never all).
// `prefer` candidates (the likeliest mistakes) are tried first, then random swaps.
function segChoices(rng, answer, opts, prefer = [], n = 5) {
  const cols = answer.length;
  const seen = new Set([answer.join(SEP)]);
  const out = [answer];
  const add = (c) => {
    if (out.length >= n) return;
    const d = c.filter((v, i) => v !== answer[i]).length;
    if (d < 1 || d >= cols || d > 2) return;
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

// A segmented choice part: `answer` and options are arrays, one segment per column.
function segPart(rng, { id, label, ask, cols, answer, opts, prefer, hint }) {
  const choices = segChoices(rng, answer, opts, prefer);
  const extraSegs = [];
  cols.forEach((c, i) => { for (const v of new Set(opts[i])) if (v !== answer[i]) extraSegs.push([c, v]); });
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, hint };
}

const FIRMS = ["Northwind Traders", "Harbour & Co", "Bluepeak Retail", "Lumen Goods", "Kestrel Group", "Maple Street Ltd", "Copperleaf Ltd", "Riverside Supplies", "Summit Brands", "Oakline Stores"];

// ---------------------------------------------------------------------------------------------
// Sales review: SQL -> market growth -> Boston matrix -> strategy

const THEMES = [
  { firm: "a grocery chain", cats: { Snacks: ["Crisp Bites", "Nut Mix", "Pretzel Twists"], Drinks: ["Cola Zero", "Iced Tea", "Sparkling Water"], Bakery: ["Sourdough Loaf", "Croissants", "Bagels"], Frozen: ["Pizza Bases", "Veg Mix", "Ice Lollies"] } },
  { firm: "an electronics brand", cats: { Audio: ["Earbuds", "Soundbar", "Headphones"], Wearables: ["Fitness Band", "Smartwatch", "Smart Ring"], Accessories: ["Phone Case", "Power Bank", "Charger"], Home: ["Smart Plug", "Doorbell Cam", "Hub"] } },
  { firm: "a homeware retailer", cats: { Kitchen: ["Kettle", "Toaster", "Blender"], Garden: ["Hose Reel", "Planter", "Lawn Lamp"], Bedding: ["Duvet", "Pillow Set", "Throw"], Lighting: ["Desk Lamp", "Floor Lamp", "Fairy Lights"] } },
  { firm: "a sports brand", cats: { Running: ["Trail Shoe", "Running Vest", "Water Belt"], Cycling: ["Bike Light", "Helmet", "Bike Lock"], Yoga: ["Yoga Mat", "Foam Block", "Yoga Strap"], Swim: ["Goggles", "Swim Cap", "Kickboard"] } },
];

const BCG = ["Star", "Cash cow", "Question mark", "Dog"];
const bcgOf = (highGrowth, highShare) => (highGrowth ? (highShare ? "Star" : "Question mark") : highShare ? "Cash cow" : "Dog");
const BCG_RULE = "Use the Boston matrix with high market growth meaning above 10% a year and high relative market share meaning above 1.";
const STRATEGY = {
  Star: "Hold: invest to keep its lead",
  "Cash cow": "Harvest: spend little, collect cash",
  "Question mark": "Build: invest to grow its share",
  Dog: "Divest: sell or drop it",
};
const STRATEGIES = BCG.map((c) => STRATEGY[c]);

// Distinct integers in [lo, hi].
function distinctInts(rng, lo, hi, n) {
  const out = new Set();
  while (out.size < n) out.add(rng.int(lo, hi));
  return [...out];
}

// The SQL tasks. Each pins one product (the first row the query returns).
// pick(rows, X) -> the query's rows in order (objects); the generator's own array logic.
const SQL_TASKS = {
  topInCat: {
    sql: (X) => `SELECT product, rev_2026 FROM sales WHERE category = '${X}' ORDER BY rev_2026 DESC`,
    alts: (X) => [],
    wrong: (X) => [
      `SELECT product, rev_2026 FROM sales WHERE category = '${X}' ORDER BY rev_2026 ASC`,
      "SELECT product, rev_2026 FROM sales ORDER BY rev_2026 DESC",
      `SELECT product, rev_2026 FROM sales WHERE category = '${X}' ORDER BY rev_2025 DESC`,
    ],
    pick: (rows, X) => rows.filter((r) => r.category === X).sort((a, b) => b.rev_2026 - a.rev_2026),
    task: (X) => `Write a query that shows \`product\` and \`rev_2026\` for the **${X}** category, highest \`rev_2026\` first. The product in its first row is the one under review.`,
    hint: "Filter with WHERE on `category`, then sort with ORDER BY `rev_2026` and the direction that puts the highest first.",
    cols: ["product", "rev_2026"],
  },
  smallGrower: {
    sql: () => "SELECT product, rev_2026 FROM sales WHERE rev_2026 > rev_2025 ORDER BY rev_2026 ASC",
    alts: () => [
      "SELECT product, rev_2026 FROM sales WHERE rev_2025 < rev_2026 ORDER BY rev_2026 ASC",
      "SELECT product, rev_2026 FROM sales WHERE rev_2026 > rev_2025 ORDER BY rev_2026",
      "SELECT product, rev_2026 FROM sales WHERE rev_2025 < rev_2026 ORDER BY rev_2026",
    ],
    wrong: () => [
      "SELECT product, rev_2026 FROM sales ORDER BY rev_2026 ASC",
      "SELECT product, rev_2026 FROM sales WHERE rev_2026 < rev_2025 ORDER BY rev_2026 ASC",
      "SELECT product, rev_2026 FROM sales WHERE rev_2026 > rev_2025 ORDER BY rev_2026 DESC",
    ],
    pick: (rows) => rows.filter((r) => r.rev_2026 > r.rev_2025).sort((a, b) => a.rev_2026 - b.rev_2026),
    task: () => "Write a query that shows `product` and `rev_2026` for the products whose `rev_2026` is more than their `rev_2025`, lowest `rev_2026` first. The product in its first row is the one under review.",
    hint: "A WHERE condition can compare two columns of the same row. Then sort by `rev_2026` so the lowest comes first.",
    cols: ["product", "rev_2026"],
  },
  fallerInCat: {
    sql: (X) => `SELECT product FROM sales WHERE category = '${X}' AND rev_2026 < rev_2025`,
    alts: (X) => [
      `SELECT product FROM sales WHERE category = '${X}' AND rev_2025 > rev_2026`,
      `SELECT product FROM sales WHERE rev_2026 < rev_2025 AND category = '${X}'`,
      `SELECT product FROM sales WHERE rev_2025 > rev_2026 AND category = '${X}'`,
    ],
    wrong: (X) => [
      "SELECT product FROM sales WHERE rev_2026 < rev_2025",
      `SELECT product FROM sales WHERE category = '${X}'`,
      `SELECT product FROM sales WHERE category = '${X}' AND rev_2026 > rev_2025`,
    ],
    pick: (rows, X) => rows.filter((r) => r.category === X && r.rev_2026 < r.rev_2025),
    task: (X) => `Write a query that shows \`product\` for the products in the **${X}** category whose \`rev_2026\` is less than their \`rev_2025\`. It returns one product: the one under review. Put the category condition first.`,
    hint: "Two conditions joined with AND: one on `category`, one comparing `rev_2026` with `rev_2025`.",
    cols: ["product"],
  },
  bestOutside: {
    sql: (X) => `SELECT product FROM sales WHERE category <> '${X}' ORDER BY rev_2025 DESC LIMIT 1`,
    alts: (X) => [`SELECT product FROM sales WHERE category != '${X}' ORDER BY rev_2025 DESC LIMIT 1`],
    wrong: (X) => [
      "SELECT product FROM sales ORDER BY rev_2025 DESC LIMIT 1",
      `SELECT product FROM sales WHERE category <> '${X}' ORDER BY rev_2026 DESC LIMIT 1`,
      `SELECT product FROM sales WHERE category = '${X}' ORDER BY rev_2025 DESC LIMIT 1`,
      `SELECT product FROM sales WHERE category <> '${X}' ORDER BY rev_2025 ASC LIMIT 1`,
    ],
    pick: (rows, X) => rows.filter((r) => r.category !== X).sort((a, b) => b.rev_2025 - a.rev_2025).slice(0, 1),
    task: (X) => `Write a query that shows \`product\` for the product **outside** the **${X}** category with the highest \`rev_2025\` (last year's best seller outside ${X}), using ORDER BY and LIMIT. That product is the one under review.`,
    hint: "Exclude the category with <>, sort by `rev_2025` from highest to lowest, and keep only one row.",
    cols: ["product"],
  },
};
const SQL_KINDS = Object.keys(SQL_TASKS);

const sqlNorm = (s) => String(s ?? "").replace(/−/g, "-").trim().replace(/\s+/g, " ").toLowerCase().replace(/\s*([:,])\s*/g, "$1");
const compactOps = (s) => s.replace(/ (<>|!=|<=|>=|=|<|>) /g, "$1");
function acceptsFor(answer, alts) {
  const seen = new Set([sqlNorm(answer)]);
  const out = [];
  const push = (s) => { const k = sqlNorm(s); if (out.length < 20 && !seen.has(k)) { seen.add(k); out.push(s); } };
  push(`${answer};`);
  push(compactOps(answer));
  push(`${compactOps(answer)};`);
  for (const a of alts) { push(a); push(`${a};`); }
  for (const a of alts) { push(compactOps(a)); push(`${compactOps(a)};`); }
  return out;
}

const sqlRules = (cat) => `Write it on one line, with keywords in capitals and the columns in the order given. Put text in single quotes, like '${cat}', with one space on each side of comparison signs such as = and >. Write ASC or DESC after the ORDER BY column. A semicolon at the end is optional.`;

function drawSales(rng) {
  for (let tries = 0; tries < 400; tries++) {
    const theme = rng.pick(THEMES);
    const cats = rng.shuffle(Object.keys(theme.cats)).slice(0, 3);
    const rows = [];
    for (const c of cats) for (const p of rng.shuffle(theme.cats[c]).slice(0, rng.int(2, 3))) rows.push({ product: p, category: c });
    const r25 = distinctInts(rng, 40, 400, rows.length), r26 = distinctInts(rng, 40, 400, rows.length);
    rows.forEach((r, i) => { r.rev_2025 = r25[i]; r.rev_2026 = r26[i]; });
    const order = rng.shuffle(rows.map((_, i) => i));
    const table = order.map((i) => rows[i]);
    const kind = rng.pick(SQL_KINDS);
    const X = rng.pick(cats);
    const highG = rng.next() < 0.5, highS = rng.next() < 0.5;
    const rShare = highS ? rng.int(115, 300) / 100 : rng.int(30, 85) / 100;
    const gPct = highG ? rng.int(108, 300) / 10 : rng.int(-50, 92) / 10;
    const sizes = Object.fromEntries(cats.map((c) => [c, rng.pick([4000, 5000, 6000, 8000])]));
    const growth = Object.fromEntries(cats.map((c) => [c, rng.int(-50, 300) / 10]));
    const otherRival = table.map(() => rng.int(30, 90) / 100);
    // Checks (no more rng below this line in this attempt).
    const T = SQL_TASKS[kind];
    const want = T.pick(table, X);
    if (!want.length || (kind === "fallerInCat" && want.length !== 1)) continue;
    if ((kind === "topInCat" || kind === "smallGrower") && want.length < 2) continue;
    const focus = want[0];
    const fc = focus.category;
    // Rival sales and market sizes for every category / row.
    table.forEach((r, i) => { r.rival_2026 = r === focus ? Math.round(r.rev_2026 / rShare) : Math.max(1, Math.round(r.rev_2026 / otherRival[i])); });
    const markets = cats.map((c) => {
      const s25 = sizes[c];
      const g = c === fc ? gPct : growth[c];
      return { category: c, size_2025: s25, size_2026: Math.round(s25 * (1 + g / 100)) };
    });
    const m = markets.find((x) => x.category === fc);
    const g = ((m.size_2026 - m.size_2025) / m.size_2025) * 100;
    const rs = focus.rev_2026 / focus.rival_2026;
    if (!safeAt(g, 1) || Math.abs(g - 10) < 0.5 || (g > 10) !== highG) continue;
    if (!safeAt(rs, 2) || Math.abs(rs - 1) < 0.05 || (rs > 1) !== highS) continue;
    // Every market must hold its products plus the focus product's rival.
    if (markets.some((mk) => table.filter((r) => r.category === mk.category).reduce((s, r) => s + r.rev_2026, 0) + (mk.category === fc ? focus.rival_2026 : 0) > 0.8 * Math.min(mk.size_2025, mk.size_2026))) continue;
    // Each plausible wrong query must not pin the same product list.
    const sqlRows = runSql(T.sql(X), { sales: tableRaw(table) });
    if (T.wrong(X).some((w) => sameResult(runSql(w, { sales: tableRaw(table) }), sqlRows))) continue;
    return { theme, table, markets, kind, X, focus, g, rs, highG, highS };
  }
  throw new Error("sales-review: could not draw a table");
}

const SALES_COLS = ["product", "category", "rev_2025", "rev_2026", "rival_2026"];
const tableRaw = (rows) => ({ cols: SALES_COLS.slice(), rows: rows.map((r) => SALES_COLS.map((c) => r[c])) });
const MARKET_COLS = ["category", "size_2025", "size_2026"];
const mdTable = (name, cols, rows) => `**${name}**\n\n| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;

function genSalesReview(rng) {
  const firmName = rng.pick(FIRMS);
  const d = drawSales(rng);
  const preferRs = [];
  const { table, markets, kind, X, focus, g, rs, highG, highS } = d;
  const T = SQL_TASKS[kind];
  const sql = T.sql(X);
  const accepts = acceptsFor(sql, T.alts(X));
  const m = markets.find((x) => x.category === focus.category);
  const g1 = round1(g);
  const rsTxt = rs.toFixed(2);
  const cat = bcgOf(highG, highS);
  const inv = (focus.rival_2026 / focus.rev_2026).toFixed(2);
  const mshare = ((focus.rev_2026 / m.size_2026) * 100).toFixed(2);
  const flipS = bcgOf(highG, !highS), flipG = bcgOf(!highG, highS);
  const rsOpts = [...new Set([rsTxt, inv, mshare, (focus.rev_2025 / focus.rival_2026).toFixed(2)])];
  preferRs.push([inv, cat], [rsTxt, flipS], [rsTxt, flipG], [mshare, cat]);
  const bcgPart = segPart(rng, {
    id: "bcg", label: "Boston matrix", ask: "The product's relative market share (2 decimal places) and its Boston matrix category?",
    cols: ["Relative share", "Boston category"], answer: [rsTxt, cat], opts: [rsOpts, BCG], prefer: preferRs,
    hint: "Relative market share = the product's 2026 sales ÷ its largest rival's 2026 sales (`rival_2026`). Then combine it with the market growth from the previous part.",
  });
  const recChoices = rng.shuffle(STRATEGIES.slice());
  const outputRows = runSql(sql, { sales: tableRaw(table) }).rows;
  const shownOut = outputRows.map((r) => `- ${r.join(" · ")}`).join("\n");
  const given = markets.flatMap((mk) => [
    { label: `_${mk.category.toLowerCase()}_25`, value: mk.size_2025 },
    { label: `_${mk.category.toLowerCase()}_26`, value: mk.size_2026 },
  ]);
  const prompt = `You are the business analyst at ${firmName}, ${d.theme.firm}. Revenue figures are in $ thousands; \`rival_2026\` is the largest rival's 2026 sales of a product like it, in the same market.\n\n${mdTable("sales", SALES_COLS, table.map((r) => SALES_COLS.map((c) => r[c])))}\n\n${mdTable("markets", MARKET_COLS, markets.map((r) => MARKET_COLS.map((c) => r[c])))}\n\n1. ${T.task(X)} ${sqlRules(X)}\n2. Work out how fast that product's market (its category in **markets**) grew from 2025 to 2026.\n3. Place the product in the Boston matrix. ${BCG_RULE}\n4. Recommend a strategy for it.`;
  return {
    prompt,
    answerType: "multi",
    parts: [
      { id: "sql", label: "Query", ask: "Your SQL query", answerType: "text", answer: sql, accepts, fuzzy: false, hint: T.hint },
      { id: "growth", label: "Market growth", ask: "Market growth from 2025 to 2026, in % (1 decimal place, negative if it shrank)", answerType: "number", answer: g1, tolerance: 0.05, hint: "Growth = (size_2026 − size_2025) ÷ size_2025 × 100, using the row for the product's own category." },
      bcgPart,
      { id: "rec", label: "Strategy", ask: "Which strategy fits the product?", answerType: "choice", answer: STRATEGY[cat], choices: recChoices, hint: "A firm uses its cash cows' cash to build question marks and hold stars, and it divests dogs." },
    ],
    explanation: `**1. Query.** \`${sql}\` returns:\n\n${shownOut}\n\nSo the product under review is **${focus.product}** (${focus.category}).\n\n**2. Market growth.** (${fmt(m.size_2026)} − ${fmt(m.size_2025)}) ÷ ${fmt(m.size_2025)} × 100 = **${g1.toFixed(1)}%**, which is ${highG ? "above" : "not above"} 10%, so growth is ${highG ? "high" : "low"}.\n\n**3. Boston matrix.** Relative share = ${focus.rev_2026} ÷ ${focus.rival_2026} = **${rsTxt}**, ${highS ? "above" : "below"} 1, so share is ${highS ? "high" : "low"}: a **${cat}**.\n\n**4. Strategy.** ${cat === "Star" ? "Stars lead a fast-growing market: keep investing to hold the lead" : cat === "Cash cow" ? "Cash cows lead a slow market: spend little and use their cash elsewhere" : cat === "Question mark" ? "Question marks sit in a fast-growing market without the lead: invest to build share (or drop them later if that fails)" : "Dogs have a small share of a slow market: sell or drop them"}. **${STRATEGY[cat]}**.\n\nWatch out: the product's own sales change (rev_2025 → rev_2026) is not the market's growth; the Boston matrix uses the market.`,
    given,
    params: { kind: "sales", task: kind, X, sales: tableRaw(table), markets: markets.map((r) => MARKET_COLS.map((c) => r[c])) },
  };
}

// ---------------------------------------------------------------------------------------------
// Mini SQL engine (verify side): SELECT cols FROM t [WHERE a AND b …] [ORDER BY c [ASC|DESC]] [LIMIT n] [;]
// Comparisons: = <> != < > <= >=, between columns or a column and a literal. Identifiers ignore case.

const SQL_KW = new Set(["select", "from", "where", "and", "order", "by", "asc", "desc", "limit"]);
function sqlTokens(src) {
  const out = [];
  const re = /\s+|'([^']*)'|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<>|!=|<=|>=|=|<|>)|([,;*()])/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error("bad token");
    i = re.lastIndex;
    if (m[1] !== undefined) out.push({ k: "str", v: m[1] });
    else if (m[2] !== undefined) out.push({ k: "num", v: Number(m[2]) });
    else if (m[3] !== undefined) out.push({ k: SQL_KW.has(m[3].toLowerCase()) ? "kw" : "id", v: m[3].toLowerCase() });
    else if (m[4] !== undefined) out.push({ k: "op", v: m[4] === "!=" ? "<>" : m[4] });
    else if (m[5] !== undefined) out.push({ k: "sym", v: m[5] });
  }
  return out;
}
function sqlParse(src) {
  const t = sqlTokens(src);
  let i = 0;
  const peek = () => t[i];
  const kw = (w) => { if (t[i] && t[i].k === "kw" && t[i].v === w) { i++; return true; } return false; };
  const need = (w) => { if (!kw(w)) throw new Error(`expected ${w}`); };
  const id = () => { const x = t[i]; if (!x || x.k !== "id") throw new Error("expected a name"); i++; return x.v; };
  need("select");
  const cols = [id()];
  while (peek() && peek().k === "sym" && peek().v === ",") { i++; cols.push(id()); }
  need("from");
  const from = id();
  const where = [];
  if (kw("where")) {
    const opd = () => { const x = t[i++]; if (!x || !["id", "num", "str"].includes(x.k)) throw new Error("bad operand"); return x; };
    do {
      const a = opd();
      const op = t[i++];
      if (!op || op.k !== "op") throw new Error("expected comparison");
      where.push({ a, op: op.v, b: opd() });
    } while (kw("and"));
  }
  let order = null;
  if (kw("order")) { need("by"); order = { col: id(), desc: false }; if (kw("desc")) order.desc = true; else kw("asc"); }
  let limit = null;
  if (kw("limit")) { const x = t[i++]; if (!x || x.k !== "num" || !Number.isInteger(x.v)) throw new Error("bad limit"); limit = x.v; }
  if (peek() && peek().k === "sym" && peek().v === ";") i++;
  if (i !== t.length) throw new Error("unexpected text");
  return { cols, from, where, order, limit };
}
function runSql(src, tables) {
  const q = sqlParse(src);
  const tb = tables[q.from];
  if (!tb) throw new Error("no table");
  const ix = (c) => { const j = tb.cols.indexOf(c); if (j < 0) throw new Error(`no column ${c}`); return j; };
  const val = (row, o) => (o.k === "id" ? row[ix(o.v)] : o.v);
  const cmp = { "=": (x, y) => x === y, "<>": (x, y) => x !== y, "<": (x, y) => x < y, ">": (x, y) => x > y, "<=": (x, y) => x <= y, ">=": (x, y) => x >= y };
  let rows = [];
  for (const r of tb.rows) {
    let ok = true;
    for (const c of q.where) {
      const x = val(r, c.a), y = val(r, c.b);
      if (typeof x !== typeof y || !cmp[c.op](x, y)) { ok = false; break; }
    }
    if (ok) rows.push(r);
  }
  if (q.order) {
    const j = ix(q.order.col);
    rows = rows.map((r, k) => [r, k]).sort((p, s) => (p[0][j] < s[0][j] ? -1 : p[0][j] > s[0][j] ? 1 : p[1] - s[1]) * (q.order.desc ? -1 : 1)).map((p) => p[0]);
  }
  if (q.limit !== null) rows = rows.slice(0, q.limit);
  const js = q.cols.map(ix);
  return { ordered: !!q.order, rows: rows.map((r) => js.map((j) => r[j])) };
}
function sameResult(a, b) {
  if (!a || !b || a.rows.length !== b.rows.length) return false;
  const key = (r) => JSON.stringify(r);
  if (a.ordered && b.ordered) return a.rows.every((r, i) => key(r) === key(b.rows[i]));
  return a.rows.map(key).sort().join("\n") === b.rows.map(key).sort().join("\n");
}

// ---------------------------------------------------------------------------------------------
// Statement review: liquidity ratio -> gearing -> interpretation -> lender's decision

const LIQ = {
  current: { n: "Current ratio", f: "current assets ÷ current liabilities", good: "Better able to pay short-term debts", bad: "Less able to pay short-term debts", limits: [1.0, 1.2, 1.5] },
  acid: { n: "Acid test ratio", f: "(current assets − inventory) ÷ current liabilities", good: "Better able to pay without selling stock", bad: "Less able to pay without selling stock", limits: [0.7, 0.8, 1.0] },
};
const GEAR = { n: "Gearing", good: "Less reliance on borrowing", bad: "More reliance on borrowing" };
const DECISIONS = ["Approve: both tests met", "Decline: liquidity too low", "Decline: gearing too high", "Decline: both tests failed"];
const decisionOf = (liqOk, gearOk) => (liqOk && gearOk ? DECISIONS[0] : !liqOk && !gearOk ? DECISIONS[3] : !liqOk ? DECISIONS[1] : DECISIONS[2]);

function drawStatement(rng) {
  for (let tries = 0; tries < 400; tries++) {
    const lk = rng.pick(["current", "acid"]);
    const L = LIQ[lk];
    const limit = rng.pick(L.limits);
    const gLimit = rng.pick([40, 45, 50, 55]);
    const passL = rng.next() < 0.5, passG = rng.next() < 0.6;
    const cl = rng.int(20, 80) * 1000;
    const invPct = rng.int(20, 45), recPct = rng.int(30, 50);
    const target = lk === "current" ? (passL ? limit + rng.int(5, 50) / 100 : limit - rng.int(5, 35) / 100) : null;
    const acidTarget = lk === "acid" ? (passL ? limit + rng.int(5, 40) / 100 : limit - rng.int(5, 30) / 100) : null;
    const gTarget = passG ? gLimit - rng.int(3, 25) : gLimit + rng.int(3, 18);
    const equity = rng.int(80, 400) * 1000;
    const focus = rng.pick(["liq", "gear"]);
    const step = rng.pick([-1, 1]) * rng.int(2, 6);
    // Build the balance sheet (no rng below).
    let ca;
    if (lk === "current") ca = Math.round((cl * target) / 1000) * 1000;
    else ca = Math.round((cl * acidTarget) / (1 - invPct / 100) / 1000) * 1000;
    const inventory = Math.round((ca * invPct) / 100 / 1000) * 1000;
    const receivables = Math.round((ca * recPct) / 100 / 1000) * 1000;
    const cash = ca - inventory - receivables;
    if (cash < 0.05 * ca || inventory <= 0) continue;
    const ncl = Math.round((equity * gTarget) / (100 - gTarget) / 1000) * 1000;
    if (ncl <= 0) continue;
    const liq = lk === "current" ? ca / cl : (ca - inventory) / cl;
    const gear = (ncl / (ncl + equity)) * 100;
    if (!safeAt(liq, 2) || !safeAt(gear, 1) || liq > 1.95 || liq < 0.3) continue;
    if (Math.abs(liq - limit) < 0.03 || (liq >= limit) !== passL) continue;
    if (Math.abs(gear - gLimit) < 0.5 || (gear <= gLimit) !== passG || gear < 10 || gear > 75) continue;
    // Last year's figure for the ratio being interpreted.
    const last = focus === "liq" ? round2(round2(liq) + step * 0.05) : Math.round(gear) + step;
    if (focus === "liq" && (last < 0.3 || last > 1.95)) continue;
    if (focus === "gear" && (last < 5 || last > 85)) continue;
    return { lk, limit, gLimit, cl, inventory, receivables, cash, ncl, equity, liq, gear, focus, last };
  }
  throw new Error("statement-review: could not draw");
}

function genStatementReview(rng) {
  const firm = rng.pick(FIRMS);
  const d = drawStatement(rng);
  const L = LIQ[d.lk];
  const liq2 = round2(d.liq), gear1 = round1(d.gear);
  const isLiq = d.focus === "liq";
  const now = isLiq ? liq2 : gear1;
  const rose = now > d.last;
  const better = isLiq ? rose : !rose;
  const R = isLiq ? L : GEAR;
  const lastTxt = isLiq ? `${d.last.toFixed(2)}:1` : `${d.last.toFixed(1)}%`;
  const interp = segPart(rng, {
    id: "interp", label: "Interpretation", ask: `Compared with last year's ${R.n.toLowerCase()} of ${lastTxt}: which way did it move, is that better or worse, and what does it mean?`,
    cols: ["Direction", "Verdict", "Meaning"], answer: [rose ? "Rose" : "Fell", better ? "Better" : "Worse", better ? R.good : R.bad],
    opts: [["Rose", "Fell"], ["Better", "Worse"], [R.good, R.bad]],
    prefer: [[rose ? "Fell" : "Rose", better ? "Worse" : "Better", better ? R.good : R.bad], [rose ? "Rose" : "Fell", better ? "Worse" : "Better", better ? R.bad : R.good], [rose ? "Rose" : "Fell", better ? "Better" : "Worse", better ? R.bad : R.good]],
    hint: isLiq ? "For liquidity ratios below about 2, higher is better." : "For gearing, lower is better: less of the long-term capital is borrowed.",
  });
  const decChoices = rng.shuffle(DECISIONS.slice());
  const liqOk = d.liq >= d.limit, gearOk = d.gear <= d.gLimit;
  const dec = decisionOf(liqOk, gearOk);
  const ca = d.inventory + d.receivables + d.cash;
  const liqWork = d.lk === "current" ? `(${fmt(d.inventory)} + ${fmt(d.receivables)} + ${fmt(d.cash)}) ÷ ${fmt(d.cl)} = ${fmt(ca)} ÷ ${fmt(d.cl)}` : `(${fmt(d.receivables)} + ${fmt(d.cash)}) ÷ ${fmt(d.cl)}`;
  const lines = [["Inventory", d.inventory], ["Trade receivables", d.receivables], ["Cash", d.cash], ["Current liabilities", d.cl], ["Non-current liabilities (loans)", d.ncl], ["Equity", d.equity]];
  return {
    prompt: `${firm} has asked its bank for a loan, and you are reviewing its year-end balance sheet:\n\n| Item | Amount |\n| --- | --- |\n${lines.map(([n, v]) => `| ${n} | ${money(v)} |`).join("\n")}\n\nThe bank lends only if the **${L.n.toLowerCase()}** is at least **${d.limit.toFixed(2)}** and **gearing** is at most **${d.gLimit}%**, where gearing = non-current liabilities ÷ (non-current liabilities + equity) × 100. Last year the ${R.n.toLowerCase()} was ${lastTxt}.`,
    answerType: "multi",
    parts: [
      { id: "liq", label: L.n, ask: `This year's ${L.n.toLowerCase()} (2 decimal places; if it is x:1, answer x)`, answerType: "number", answer: liq2, tolerance: 0.005, hint: `${L.n} = ${L.f}. Current assets here are inventory + trade receivables + cash.` },
      { id: "gearing", label: "Gearing", ask: "Gearing, in % (1 decimal place)", answerType: "number", answer: gear1, tolerance: 0.05, hint: "Capital employed = non-current liabilities + equity. Divide the loans by it and multiply by 100." },
      interp,
      { id: "decision", label: "Decision", ask: "The bank's decision, with the reason", answerType: "choice", answer: dec, choices: decChoices, hint: "Check each test against the bank's limits separately: liquidity must reach its minimum, and gearing must not go over its maximum." },
    ],
    explanation: `1. ${L.n} = ${liqWork} = **${liq2.toFixed(2)}**${d.lk === "acid" ? " (inventory is left out because it may be slow to sell)" : ""}.\n2. Gearing = ${fmt(d.ncl)} ÷ (${fmt(d.ncl)} + ${fmt(d.equity)}) × 100 = **${gear1.toFixed(1)}%**.\n3. The ${R.n.toLowerCase()} ${rose ? "rose" : "fell"} from ${lastTxt} to ${isLiq ? `${liq2.toFixed(2)}:1` : `${gear1.toFixed(1)}%`}. ${isLiq ? "Higher is better here" : "Lower is better for gearing"}, so it is **${better ? "better" : "worse"}**: ${(better ? R.good : R.bad).toLowerCase()}.\n4. ${L.n} ${liq2.toFixed(2)} is ${liqOk ? "at least" : "below"} ${d.limit.toFixed(2)}, and gearing ${gear1.toFixed(1)}% is ${gearOk ? "within" : "above"} ${d.gLimit}%: **${dec}**.`,
    given: [{ label: "_inventory", value: d.inventory }, { label: "_receivables", value: d.receivables }, { label: "_cash", value: d.cash }, { label: "_cur_liab", value: d.cl }, { label: "_loans", value: d.ncl }, { label: "_equity", value: d.equity }],
    params: { kind: "statement", lk: d.lk, limit: d.limit, gLimit: d.gLimit, inv: d.inventory, rec: d.receivables, cash: d.cash, cl: d.cl, ncl: d.ncl, eq: d.equity, focus: d.focus, last: d.last },
  };
}

// ---------------------------------------------------------------------------------------------
// Investment case: payback -> NPV -> sensitivity -> decision

const DF = { 8: [0.926, 0.857, 0.794, 0.735, 0.681], 10: [0.909, 0.826, 0.751, 0.683, 0.621], 12: [0.893, 0.797, 0.712, 0.636, 0.567] };
const INV_DEC = ["Accept: passes all three tests", "Reject: payback too slow", "Reject: NPV not positive", "Reject: too sensitive to sales"];
const PROJECTS = ["a new packaging line", "a second delivery van fleet", "an online ordering system", "a self-service kiosk roll-out", "a new product range", "an automated warehouse picker"];

function drawInvestment(rng) {
  const want = rng.int(0, 3); // which decision this question aims for (balance)
  for (let tries = 0; tries < 1000; tries++) {
    const c = rng.int(6, 30);
    const units = Array.from({ length: 5 }, () => rng.int(10, 60) * 100);
    const k = rng.int(1, 4), m = rng.pick([0, 3, 6, 9]);
    const rate = rng.pick([8, 10, 12]);
    const T = rng.int(2, 4);
    const S = rng.pick([5, 8, 10, 12, 15]);
    // No rng below.
    const flows = units.map((u) => u * c);
    const I = flows.slice(0, k).reduce((a, b) => a + b, 0) + (flows[k] * m) / 12;
    const pb = 12 * k + m;
    const df = DF[rate];
    const pv = flows.reduce((s, f, i) => s + f * df[i], 0);
    const npvX = pv - I;
    if (!safeAt(npvX, 0) || Math.abs(npvX) < 500) continue;
    const npv = Math.round(npvX);
    const margin = (npvX / pv) * 100;
    const marginR = (npv / pv) * 100; // from the rounded NPV
    if (!safeAt(margin, 1) || round1(margin) !== round1(marginR)) continue;
    if (pb === 12 * T || Math.abs(margin - S) < 0.5) continue;
    const dec = pb > 12 * T ? 1 : npv <= 0 ? 2 : margin < S ? 3 : 0;
    if (dec !== want && tries < 900) continue;
    return { c, units, flows, I, k, m, pb, rate, df, T, S, pv, npv, margin, dec };
  }
  throw new Error("investment-case: could not draw");
}

function genInvestmentCase(rng) {
  const firm = rng.pick(FIRMS);
  const proj = rng.pick(PROJECTS);
  const d = drawInvestment(rng);
  const decChoices = rng.shuffle(INV_DEC.slice());
  const m1 = round1(d.margin);
  const cum = [];
  d.flows.reduce((s, f) => { cum.push(s + f); return s + f; }, 0);
  const pbTxt = `${Math.floor(d.pb / 12)} year${Math.floor(d.pb / 12) === 1 ? "" : "s"}${d.pb % 12 ? ` ${d.pb % 12} months` : ""}`;
  const left = d.I - (d.k ? cum[d.k - 1] : 0);
  return {
    prompt: `${firm} is considering ${proj}. It costs **${money(d.I)}** today and earns a contribution of **${money(d.c)} per unit** on the extra units it sells:\n\n| Year | 1 | 2 | 3 | 4 | 5 |\n| --- | --- | --- | --- | --- | --- |\n| Extra units | ${d.units.map(fmt).join(" | ")} |\n| Discount factor at ${d.rate}% | ${d.df.join(" | ")} |\n\nEach year's net cash inflow is its units × the contribution per unit, received evenly through the year. The board accepts only if (1) payback is within **${d.T} years**, (2) the NPV is positive, and (3) inflows could fall by at least **${d.S}%** before the NPV reaches zero. If a project fails, give the first test it fails, in that order.`,
    answerType: "multi",
    parts: [
      { id: "payback", label: "Payback", ask: "Payback period, in months", answerType: "number", answer: d.pb, tolerance: 0, hint: "Work out each year's inflow (units × contribution), add them up until they cover the cost, and for the last part-year use months = amount still needed ÷ that year's inflow × 12." },
      { id: "npv", label: "NPV", ask: "NPV, to the nearest $ (negative if it loses value)", answerType: "number", answer: d.npv, tolerance: 0.5, hint: "Multiply each year's inflow by its discount factor, add them up, then subtract the cost paid today (which is not discounted)." },
      { id: "margin", label: "Sensitivity", ask: "By what % could every year's inflow fall before the NPV reaches zero? (1 decimal place; negative if the NPV is already negative)", answerType: "number", answer: m1, tolerance: 0.05, hint: "If every inflow falls by x%, the present value of the inflows falls by x% too. So x = NPV ÷ present value of the inflows × 100." },
      { id: "decision", label: "Decision", ask: "The board's decision", answerType: "choice", answer: INV_DEC[d.dec], choices: decChoices, hint: "Apply the three tests in the order given and stop at the first one that fails." },
    ],
    explanation: `- Inflows: ${d.units.map((u, i) => `year ${i + 1}: ${fmt(u)} × ${d.c} = ${fmt(d.flows[i])}`).join("; ")}.\n- Payback: ${d.k ? `after ${d.k} year${d.k === 1 ? "" : "s"} ${fmt(cum[d.k - 1])} is back, leaving ${fmt(left)}; ` : ""}${fmt(left)} ÷ ${fmt(d.flows[d.k])} × 12 = ${d.m} months, so payback = **${d.pb} months** (${pbTxt}).\n- Present value of inflows: ${d.flows.map((f, i) => `${f} × ${d.df[i]}`).join(" + ")} = ${fmt(round2(d.pv))}. NPV = ${fmt(round2(d.pv))} − ${fmt(d.I)} = **${fmt(d.npv)}**.\n- Sensitivity: ${fmt(d.npv)} ÷ ${fmt(round2(d.pv))} × 100 = **${m1.toFixed(1)}%**.\n- Tests: payback ${d.pb} months ${d.pb <= 12 * d.T ? "is within" : "is over"} ${12 * d.T} months; NPV is ${d.npv > 0 ? "positive" : "not positive"}; the margin ${m1.toFixed(1)}% is ${d.margin >= d.S ? "at least" : "below"} ${d.S}%. **${INV_DEC[d.dec]}**.`,
    given: [{ label: "_cost", value: d.I }, { label: "_contrib", value: d.c }, ...d.units.map((u, i) => ({ label: `_u${i + 1}`, value: u }))],
    params: { kind: "invest", I: d.I, c: d.c, units: d.units, rate: d.rate, T: d.T, S: d.S },
  };
}

// ---------------------------------------------------------------------------------------------
// Campaign pricing: segment size -> life-cycle stage -> skimming vs penetration -> launch plan

const PLC = ["Introduction", "Growth", "Maturity", "Decline"];
const PLC_RULE = "Use these rules: **Introduction** = sales rising but a loss; **Growth** = sales up 15% or more with a profit; **Maturity** = sales within 5% of last year with a profit; **Decline** = sales down 5% or more.";
function plcStage(last, now, profit) {
  const pct = (now / last - 1) * 100;
  if (pct <= -5) return "Decline";
  if (profit < 0) return pct > 0 ? "Introduction" : null;
  if (pct >= 15) return "Growth";
  if (pct > -5 && pct < 5) return "Maturity";
  return null;
}
const PLANS = ["Price skimming", "Penetration pricing", "Don't launch"];
const LAUNCHES = [
  { item: "smart water bottle", cat: "smart drinkware", who: "adults aged 18–34", keen: "go to a gym at least weekly" },
  { item: "plant-based protein bar", cat: "plant-based snacks", who: "adults aged 25–44", keen: "buy vegan food every month" },
  { item: "e-bike conversion kit", cat: "e-bike kits", who: "adults aged 25–54", keen: "cycle to work" },
  { item: "language-learning headset", cat: "learning gadgets", who: "students aged 16–24", keen: "study a second language" },
  { item: "pet activity tracker", cat: "pet tech", who: "households with pets", keen: "own a dog", unit: "households" },
  { item: "refillable cleaning kit", cat: "eco cleaning products", who: "households that shop online", keen: "already buy eco brands", unit: "households" },
];

function drawCampaign(rng) {
  const stage = rng.pick(PLC);
  for (let tries = 0; tries < 400; tries++) {
    const pop = rng.int(12, 48) * 10000;
    const a = rng.int(20, 45), b = rng.int(10, 40);
    const ts = rng.int(1, 4) * 5, tp = rng.int(3, 8) * 5;
    const v = rng.int(8, 30);
    const ps = v + rng.int(20, 60), pp = v + rng.int(4, 18);
    const L = rng.pick([20000, 25000, 50000, 100000]);
    const pct = stage === "Introduction" ? rng.int(20, 120) : stage === "Growth" ? rng.int(16, 60) : stage === "Maturity" ? rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]) : -rng.int(6, 35);
    const noise = stage === "Maturity" ? 0 : rng.pick([-100, 0, 100]);
    const profit = (stage === "Introduction" ? -rng.int(5, 80) : stage === "Decline" ? rng.pick([-1, 1]) * rng.int(5, 60) : rng.int(10, 200)) * 1000;
    // No rng below.
    const seg = (pop / 10000) * a * b;
    if ((seg * ts) % 100 !== 0 || (seg * tp) % 100 !== 0) continue;
    const T = L + Math.round((L * pct) / 100 / 100) * 100 + noise;
    const ch = ((T - L) / L) * 100;
    if (plcStage(L, T, profit) !== stage || !safeAt(ch, 1)) continue;
    // A rounded sales change must not cross a stage boundary.
    if ([-5, 5, 15].some((x) => Math.abs(ch - x) < 0.1)) continue;
    const uS = (seg * ts) / 100, uP = (seg * tp) / 100;
    const diff = uS * (ps - v) - uP * (pp - v);
    if (Math.abs(diff) < 1000) continue;
    return { stage, pop, a, b, seg, ts, tp, v, ps, pp, L, T, ch, profit, uS, uP, diff };
  }
  throw new Error("campaign-pricing: could not draw");
}

function genCampaignPricing(rng) {
  const firm = rng.pick(FIRMS);
  const x = rng.pick(LAUNCHES);
  const d = drawCampaign(rng);
  const ch1 = round1(d.ch);
  const others = rng.shuffle(PLC.filter((s) => s !== d.stage));
  const wrongCh = round1(((d.T - d.L) / d.T) * 100);
  const chOpts = [...new Set([signed1(ch1), signed1(wrongCh), signed1(-ch1), signed1(round1((d.T / d.L) * 100))])];
  const stagePart = segPart(rng, {
    id: "stage", label: "Life cycle", ask: "The category's sales change (1 decimal place) and its life-cycle stage",
    cols: ["Sales change", "Stage"], answer: [signed1(ch1), d.stage], opts: [chOpts, PLC],
    prefer: [[signed1(wrongCh), d.stage], [signed1(ch1), others[0]], [signed1(ch1), others[1]], [signed1(ch1), others[2]]],
    hint: "Sales change = (this year − last year) ÷ last year × 100. Then check profit: a loss with rising sales is Introduction; with a profit, the size of the change decides.",
  });
  const planChoices = rng.shuffle(PLANS.slice());
  const plan = d.stage === "Decline" ? PLANS[2] : d.stage === "Introduction" ? (d.diff > 0 ? PLANS[0] : PLANS[1]) : PLANS[1];
  const profitTxt = d.profit < 0 ? `a loss of ${money(-d.profit)}` : `a profit of ${money(d.profit)}`;
  const cS = d.uS * (d.ps - d.v), cP = d.uP * (d.pp - d.v);
  return {
    prompt: `${firm} plans to launch a **${x.item}** in a region of **${fmt(d.pop)}** ${x.unit || "people"}. Research says **${d.a}%** of them are ${x.who}, and **${d.b}%** of those ${x.keen}: that group is the target segment.\n\nAcross all firms, ${x.cat} sold ${fmt(d.L)} units last year and ${fmt(d.T)} units this year, and the category as a whole made ${profitTxt}. ${PLC_RULE}\n\nEach unit costs ${money(d.v)} to make. Two launch prices for year 1:\n\n- **Plan S (skimming):** ${money(d.ps)}, bought by **${d.ts}%** of the segment.\n- **Plan P (penetration):** ${money(d.pp)}, bought by **${d.tp}%** of the segment.\n\nThe team's rule: in a **Decline** category, don't launch. In **Growth** or **Maturity**, rivals would undercut a high price, so use penetration pricing. In **Introduction**, pick the plan with the higher year-1 contribution.`,
    answerType: "multi",
    parts: [
      { id: "segment", label: "Segment size", ask: "How many people (or households) are in the target segment?", answerType: "number", answer: d.seg, tolerance: 0, hint: "Take the percentages one after the other: the whole region × the first share, then × the share of those." },
      stagePart,
      { id: "gap", label: "Contribution gap", ask: "Plan S's year-1 contribution minus Plan P's, in $ (negative if Plan P earns more)", answerType: "number", answer: d.diff, tolerance: 0, hint: "For each plan: buyers = segment × take-up %, and contribution = buyers × (price − unit cost). Then subtract P from S." },
      { id: "plan", label: "Launch plan", ask: "What should the team do?", answerType: "choice", answer: plan, choices: planChoices, hint: "Use the stage from the life-cycle part first; only an Introduction category is decided by the contribution gap." },
    ],
    explanation: `1. Segment = ${fmt(d.pop)} × ${d.a}% × ${d.b}% = **${fmt(d.seg)}**.\n2. Sales change = (${fmt(d.T)} − ${fmt(d.L)}) ÷ ${fmt(d.L)} × 100 = **${signed1(ch1)}**, with ${profitTxt}, so the category is in **${d.stage}**.\n3. Plan S: ${fmt(d.seg)} × ${d.ts}% = ${fmt(d.uS)} buyers × (${d.ps} − ${d.v}) = ${money(cS)}. Plan P: ${fmt(d.seg)} × ${d.tp}% = ${fmt(d.uP)} buyers × (${d.pp} − ${d.v}) = ${money(cP)}. Gap = **${money(d.diff)}**.\n4. ${d.stage === "Decline" ? "The category is in decline, so the rule says don't launch, whatever the contribution." : d.stage === "Introduction" ? `The category is new, so the higher contribution decides: ${d.diff > 0 ? "Plan S" : "Plan P"} earns more.` : `In ${d.stage}, rivals would undercut a skimming price, so the rule says penetration pricing, whatever the gap.`} **${plan}**.`,
    given: [{ label: "_pop", value: d.pop }, { label: "_share1", value: d.a / 100 }, { label: "_share2", value: d.b / 100 }, { label: "_last", value: d.L }, { label: "_now", value: d.T }, { label: "_unit_cost", value: d.v }, { label: "_price_s", value: d.ps }, { label: "_price_p", value: d.pp }],
    params: { kind: "campaign", pop: d.pop, a: d.a, b: d.b, ts: d.ts, tp: d.tp, v: d.v, ps: d.ps, pp: d.pp, L: d.L, T: d.T, profit: d.profit },
  };
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, rng }) {
  switch (subtopic) {
    case "sales-review": return genSalesReview(rng);
    case "statement-review": return genStatementReview(rng);
    case "investment-case": return genInvestmentCase(rng);
    case "campaign-pricing": return genCampaignPricing(rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---------------------------------------------------------------------------------------------
// verify: every part rebuilt from params with its own arithmetic.

function partOf(question, id) {
  return (question.parts || []).find((p) => p.id === id);
}
// A choice part's own option list must hold the expected answer exactly once.
function choiceHas(p, want) {
  if (!p || !Array.isArray(p.choices)) return false;
  return p.choices.filter((c) => sameSegs(c, want)).length === 1;
}

function verifySales(q, answer) {
  const p = q.params;
  const tables = { sales: p.sales };
  const sqlP = partOf(q, "sql");
  if (!sqlP) return false;
  const forms = [sqlP.answer, ...(sqlP.accepts || [])];
  if (forms.length > 21 || new Set(forms.map(sqlNorm)).size !== forms.length) return false;
  let res;
  try { res = forms.map((f) => runSql(f, tables)); } catch { return false; }
  if (!res.every((r) => sameResult(r, res[0]) && r.ordered === res[0].ordered) || !res[0].rows.length) return false;
  const cand = part(answer, "sql");
  if (typeof cand !== "string" || !forms.map(sqlNorm).includes(sqlNorm(cand))) return false;
  // The product under review: first row's product (first selected column is product).
  const colsSel = sqlParse(sqlP.answer).cols;
  if (colsSel[0] !== "product") return false;
  if (!res[0].ordered && res[0].rows.length !== 1) return false;
  const product = res[0].rows[0][0];
  const row = p.sales.rows.find((r) => r[0] === product);
  const mk = p.markets.find((r) => r[0] === row[1]);
  const growth = (mk[2] / mk[1]) * 100 - 100;
  if (!numOk(part(answer, "growth"), round1(growth), 0.05)) return false;
  const share = row[3] / row[4];
  const cat = growth > 10 ? (share > 1 ? "Star" : "Question mark") : share > 1 ? "Cash cow" : "Dog";
  const bcgWant = [(Math.round(share * 100 + 1e-9) / 100).toFixed(2), cat];
  if (!choiceHas(partOf(q, "bcg"), bcgWant) || !sameSegs(part(answer, "bcg"), bcgWant)) return false;
  const recWant = { Star: "Hold", "Cash cow": "Harvest", "Question mark": "Build", Dog: "Divest" }[cat];
  const rec = String(part(answer, "rec") ?? "");
  if (!choiceHas(partOf(q, "rec"), STRATEGY[cat]) || !rec.startsWith(`${recWant}:`) || rec !== STRATEGY[cat]) return false;
  return true;
}

function verifyStatement(q, answer) {
  const p = q.params;
  const ca = p.inv + p.rec + p.cash;
  const liq = p.lk === "current" ? ca / p.cl : (p.rec + p.cash) / p.cl;
  const gear = 100 * p.ncl / (p.eq + p.ncl);
  if (!numOk(part(answer, "liq"), Math.round(liq * 100 + 1e-9) / 100, 0.005)) return false;
  if (!numOk(part(answer, "gearing"), Math.round(gear * 10 + 1e-9) / 10, 0.05)) return false;
  const now = p.focus === "liq" ? Math.round(liq * 100) / 100 : Math.round(gear * 10) / 10;
  const up = now > p.last;
  if (now === p.last) return false;
  const good = p.focus === "liq" ? up : !up;
  const meaning = p.focus === "liq" ? (good ? LIQ[p.lk].good : LIQ[p.lk].bad) : good ? GEAR.good : GEAR.bad;
  const want = [up ? "Rose" : "Fell", good ? "Better" : "Worse", meaning];
  if (!choiceHas(partOf(q, "interp"), want) || !sameSegs(part(answer, "interp"), want)) return false;
  const lOk = liq >= p.limit, gOk = gear <= p.gLimit;
  const dec = lOk ? (gOk ? "Approve: both tests met" : "Decline: gearing too high") : gOk ? "Decline: liquidity too low" : "Decline: both tests failed";
  return choiceHas(partOf(q, "decision"), dec) && part(answer, "decision") === dec;
}

function verifyInvest(q, answer) {
  const p = q.params;
  const df = DF[p.rate];
  // Payback by stepping month by month through even inflows.
  let got = 0, months = null;
  for (let y = 0; y < 5 && months === null; y++) {
    const perMonth = (p.units[y] * p.c) / 12;
    for (let mo = 1; mo <= 12; mo++) if (got + perMonth * mo >= p.I - 1e-6) { months = y * 12 + mo; break; }
    got += perMonth * 12;
  }
  if (months === null || !numOk(part(answer, "payback"), months, 0)) return false;
  let pv = 0;
  for (let y = 0; y < 5; y++) pv += df[y] * p.units[y] * p.c;
  const npv = pv - p.I;
  if (!numOk(part(answer, "npv"), Math.round(npv), 0.5)) return false;
  const margin = (npv / pv) * 100;
  if (!numOk(part(answer, "margin"), Math.sign(margin) * Math.round(Math.abs(margin) * 10 + 1e-9) / 10, 0.05)) return false;
  const dec = months > 12 * p.T ? "Reject: payback too slow" : !(npv > 0) ? "Reject: NPV not positive" : margin < p.S ? "Reject: too sensitive to sales" : "Accept: passes all three tests";
  return choiceHas(partOf(q, "decision"), dec) && part(answer, "decision") === dec;
}

function verifyCampaign(q, answer) {
  const p = q.params;
  const seg = Math.round((p.pop * p.a * p.b) / 10000);
  if (!numOk(part(answer, "segment"), seg, 0)) return false;
  const change = (p.T - p.L) * 100 / p.L;
  let stage = null;
  if (change <= -5) stage = "Decline";
  else if (p.profit < 0 && change > 0) stage = "Introduction";
  else if (p.profit >= 0 && change >= 15) stage = "Growth";
  else if (p.profit >= 0 && Math.abs(change) < 5) stage = "Maturity";
  if (!stage) return false;
  const r = Math.round(Math.abs(change) * 10 + 1e-9) / 10;
  const chTxt = change > 0 ? `+${r.toFixed(1)}%` : `−${r.toFixed(1)}%`;
  const want = [chTxt, stage];
  if (!choiceHas(partOf(q, "stage"), want) || !sameSegs(part(answer, "stage"), want)) return false;
  const gap = (seg * p.ts / 100) * (p.ps - p.v) - (seg * p.tp / 100) * (p.pp - p.v);
  if (!numOk(part(answer, "gap"), gap, 0)) return false;
  const plan = stage === "Decline" ? "Don't launch" : stage !== "Introduction" ? "Penetration pricing" : gap > 0 ? "Price skimming" : "Penetration pricing";
  return choiceHas(partOf(q, "plan"), plan) && part(answer, "plan") === plan;
}

export function verify(question, answer) {
  try {
    const p = question && question.params;
    if (!p || question.answerType !== "multi" || !answer || typeof answer !== "object") return false;
    switch (p.kind) {
      case "sales": return verifySales(question, answer);
      case "statement": return verifyStatement(question, answer);
      case "invest": return verifyInvest(question, answer);
      case "campaign": return verifyCampaign(question, answer);
      default: return false;
    }
  } catch {
    return false;
  }
}
