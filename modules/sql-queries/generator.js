import { rawTable, lit, renderCond, renderItem, renderSql, runTree, genCond, aggOf, baseRows, CMP,
  SqlError, tokenize, parseQuery, execQuery, runQuery } from "../../js/lib/sql.js";

// SQL Queries generator. Uses only the seeded rng passed in by the engine.
// Each question builds small tables and a query as a tree, renders the query as SQL text, and
// computes the answer by running the tree (array filter / sort / map).
// verify() never sees the tree: it tokenizes and parses the rendered SQL text with its own
// loop-based executor (execSql, below) over the raw table rows,
// and checks the candidate against that result. So it also proves the shown query means what the
// answer says. Tables never contain NULLs; every numeric column has distinct values, so ORDER BY
// never ties; text is compared exactly; result-set options are listed alphabetically.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
const nearTie = (x) => Math.abs(Math.abs(x * 100) % 1 - 0.5) < 1e-6;
const alpha = (arr) => arr.map(String).sort().join(", ");
const ROUND = "Round to 2 decimal places.";

function fourDistinct(q) {
  return Array.isArray(q.choices) && q.choices.length === 4 && new Set(q.choices.map(String)).size === 4
    && q.choices.map(String).includes(String(q.answer));
}

// Four options: correct + 3 distinct wrong strings (null when not enough).
function choicesFrom(correct, candidates, rng) {
  const seen = new Set([correct]);
  const out = [];
  for (const c of candidates) {
    if (out.length >= 3 || typeof c !== "string" || !c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  if (out.length < 3) return null;
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

// ---------------------------------------------------------------------------------------------
// Themes (no reserved words as column names; no apostrophes in values)

const THEMES = [
  { table: "pets", key: "name", cat: "species", cats: ["Cat", "Dog", "Rabbit", "Parrot", "Hamster"],
    nums: [{ col: "age", lo: 1, hi: 16 }, { col: "weight_kg", lo: 1, hi: 45 }],
    names: ["Biscuit", "Luna", "Max", "Pepper", "Coco", "Milo", "Daisy", "Rocky", "Ziggy", "Bella", "Oscar", "Nala", "Pip", "Mango"] },
  { table: "books", key: "title", cat: "genre", cats: ["Mystery", "Fantasy", "Science", "History", "Poetry"],
    nums: [{ col: "pages", lo: 90, hi: 650 }, { col: "pub_year", lo: 1950, hi: 2024 }],
    names: ["Moonfall", "Iron Garden", "Quiet Sea", "Red Lantern", "Paper Moon", "Star Map", "Lost Key", "Blue River", "Night Train", "Glass Tower", "Silver Fox", "Hidden Path", "Cloud City", "Deep Woods"] },
  { table: "products", key: "item", cat: "category", cats: ["Toys", "Garden", "Kitchen", "Books", "Sports"],
    nums: [{ col: "price", lo: 2, hi: 99 }, { col: "stock", lo: 0, hi: 80 }],
    names: ["Kite", "Teapot", "Trowel", "Puzzle", "Frisbee", "Ladle", "Seed Pack", "Whisk", "Atlas", "Racket", "Watering Can", "Football", "Comic", "Skipping Rope"] },
  { table: "students", key: "name", cat: "house", cats: ["Red", "Blue", "Green", "Yellow"],
    nums: [{ col: "score", lo: 30, hi: 100 }, { col: "merits", lo: 0, hi: 40 }],
    names: ["Ava", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Hugo", "Isla", "Jay", "Kira", "Leo", "Maya", "Noah"] },
  { table: "games", key: "title", cat: "genre", cats: ["Puzzle", "Racing", "Sports", "Adventure", "Strategy"],
    nums: [{ col: "rating", lo: 10, hi: 99 }, { col: "price", lo: 0, hi: 60 }],
    names: ["Star Run", "Pixel Kart", "Block Town", "Sky Quest", "Goal Rush", "Maze Mind", "Tank Duel", "Ice Rally", "Castle Siege", "Word Drop", "Deep Dive", "Moon Base", "Jungle Jump", "Card Clash"] },
  { table: "athletes", key: "name", cat: "team", cats: ["Hawks", "Lions", "Owls", "Foxes"],
    nums: [{ col: "points", lo: 0, hi: 60 }, { col: "matches", lo: 1, hi: 30 }],
    names: ["Sam", "Priya", "Tom", "Zara", "Omar", "Lily", "Jack", "Mia", "Ravi", "Erin", "Theo", "Nina", "Kofi", "Rosa"] },
  { table: "songs", key: "title", cat: "style", cats: ["Pop", "Rock", "Jazz", "Folk"],
    nums: [{ col: "plays", lo: 10, hi: 999 }, { col: "length_s", lo: 120, hi: 400 }],
    names: ["Golden Hour", "Rainy Day", "Night Drive", "Paper Planes", "Blue Skies", "Slow Dance", "City Lights", "Wild Heart", "Echo", "Sunrise", "Old Road", "Ocean Song", "Fireflies", "Homeward"] },
];

const JOINS = [
  { L: "orders", lcols: ["order_id", "customer_id", "amount"], R: "customers", rcols: ["customer_id", "name"], labelInt: true, labelBase: 101,
    rnames: ["Ana", "Ben", "Cleo", "Dan", "Eve", "Femi"], numLo: 5, numHi: 120 },
  { L: "pets", lcols: ["pet_name", "owner_id", "age"], R: "owners", rcols: ["owner_id", "owner_name"],
    labels: ["Biscuit", "Luna", "Max", "Pepper", "Coco", "Milo", "Daisy", "Rocky"], rnames: ["Sara", "Tariq", "Uma", "Victor", "Wen", "Yusuf"], numLo: 1, numHi: 16 },
  { L: "students", lcols: ["name", "club_id", "score"], R: "clubs", rcols: ["club_id", "club_name"],
    labels: ["Ava", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Hugo"], rnames: ["Chess", "Drama", "Robotics", "Choir", "Art", "Coding"], numLo: 30, numHi: 100 },
  { L: "songs", lcols: ["title", "artist_id", "plays"], R: "artists", rcols: ["artist_id", "artist_name"],
    labels: ["Echo", "Sunrise", "Old Road", "Fireflies", "Homeward", "Blue Skies", "Slow Dance", "Wild Heart"], rnames: ["Nova", "The Kites", "Juno", "Red Moss", "Lumen", "Arlo"], numLo: 10, numHi: 999 },
];

// n distinct whole numbers in [lo, hi].
function distinctNums(rng, lo, hi, n) {
  const all = [];
  for (let v = lo; v <= hi; v++) all.push(v);
  return rng.shuffle(all).slice(0, n);
}

// One table: rows { key, cat, num1, num2 } with every chosen category used at least once.
function makeTable(rng, theme, n, nCats) {
  const names = rng.shuffle(theme.names).slice(0, n);
  const cats = rng.shuffle(theme.cats).slice(0, Math.min(nCats, theme.cats.length));
  const catCol = names.map((_, i) => (i < cats.length ? cats[i] : rng.pick(cats)));
  const shuffledCats = rng.shuffle(catCol);
  const n1 = distinctNums(rng, theme.nums[0].lo, theme.nums[0].hi, n);
  const n2 = distinctNums(rng, theme.nums[1].lo, theme.nums[1].hi, n);
  const cols = [theme.key, theme.cat, theme.nums[0].col, theme.nums[1].col];
  const rows = names.map((nm, i) => ({ [cols[0]]: nm, [cols[1]]: shuffledCats[i], [cols[2]]: n1[i], [cols[3]]: n2[i] }));
  return { name: theme.table, cols, rows, theme, cats };
}

function makeJoinTables(rng) {
  const J = rng.pick(JOINS);
  const nR = rng.int(3, 4);
  const keys = distinctNums(rng, 1, 9, nR).sort((a, b) => a - b);
  const rnames = rng.shuffle(J.rnames).slice(0, nR);
  const R = { name: J.R, cols: J.rcols, rows: keys.map((k, i) => ({ [J.rcols[0]]: k, [J.rcols[1]]: rnames[i] })) };
  const nL = rng.int(5, 7);
  const labels = J.labelInt ? Array.from({ length: nL }, (_, i) => J.labelBase + i) : rng.shuffle(J.labels).slice(0, nL);
  const missing = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => !keys.includes(k));
  const nums = distinctNums(rng, J.numLo, J.numHi, nL);
  const fks = labels.map(() => rng.pick(keys));
  // Usually one row points at a key that isn't in the right table (INNER JOIN drops it).
  if (rng.next() < 0.75) fks[rng.int(0, nL - 1)] = rng.pick(missing);
  const L = { name: J.L, cols: J.lcols, rows: labels.map((lb, i) => ({ [J.lcols[0]]: lb, [J.lcols[1]]: fks[i], [J.lcols[2]]: nums[i] })) };
  return { J, L, R };
}

const mdTable = (t) => `**${t.name}**\n\n| ${t.cols.join(" | ")} |\n| ${t.cols.map(() => "---").join(" | ")} |\n${t.rows.map((r) => `| ${t.cols.map((c) => r[c]).join(" | ")} |`).join("\n")}`;

// ---------------------------------------------------------------------------------------------
// Query trees: rendering and the generator-side evaluator


// ---------------------------------------------------------------------------------------------
// Prompt pieces

const NOTE = "The tables have no NULL (empty) values, and text matches exactly, including capitals.";
const NOTE_SET = "Options list the values in alphabetical order; without ORDER BY, the order of rows doesn't matter.";
const NOTE_AVG = "AVG gives the exact mean (it doesn't round down).";
const NOTE_LIMIT = "LIMIT works as in SQLite, MySQL and PostgreSQL.";
const NOTE_OFFSET = "LIMIT and OFFSET work as in SQLite, MySQL and PostgreSQL: OFFSET skips that many rows first.";
const NOTE_BETWEEN = "BETWEEN includes both end values.";

function buildPrompt(tables, sql, ask, notes) {
  return `${tables.map(mdTable).join("\n\n")}\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n${ask} ${[NOTE, ...notes].join(" ")}`;
}

// Short description of which rows pass, for explanations.
function passList(t, rows, show) {
  return rows.length ? rows.map((r) => `${r[t.cols[0]]} (${show.map((c) => `${c} ${r[c]}`).join(", ")})`).join("; ") : "none";
}

const condCols = (c, acc = new Set()) => {
  if (!c) return acc;
  if (c.col) acc.add(c.col);
  if (c.a) condCols(c.a, acc);
  if (c.b) condCols(c.b, acc);
  return acc;
};

// A random condition on one column of t.
function randCmp(rng, t, kinds = ["num", "num", "cat"]) {
  const kind = rng.pick(kinds);
  if (kind === "cat") {
    const v = rng.pick(t.cats);
    return { t: "cmp", col: t.cols[1], op: rng.next() < 0.75 ? "=" : "<>", v };
  }
  const col = rng.pick([t.cols[2], t.cols[3]]);
  const vals = t.rows.map((r) => r[col]);
  const op = rng.pick([">", "<", ">=", "<="]);
  const v = rng.next() < 0.6 ? rng.pick(vals) : rng.int(Math.min(...vals), Math.max(...vals));
  return { t: "cmp", col, op, v };
}

// Flip one comparison's strictness / direction or swap AND and OR: plausible mistakes.
const FLIP = { ">": ">=", ">=": ">", "<": "<=", "<=": "<", "=": "<>", "<>": "=" };
function mutations(c) {
  const out = [];
  if (!c) return out;
  if (c.t === "cmp") out.push({ ...c, op: FLIP[c.op] });
  const SWAP = { ">": "<", "<": ">", ">=": "<=", "<=": ">=" };
  if (c.t === "cmp" && SWAP[c.op]) out.push({ ...c, op: SWAP[c.op] });
  if (c.t === "between") { out.push({ t: "and", a: { t: "cmp", col: c.col, op: ">", v: c.lo }, b: { t: "cmp", col: c.col, op: "<", v: c.hi } }); }
  if (c.t === "and" || c.t === "or") {
    out.push({ ...c, t: c.t === "and" ? "or" : "and" });
    out.push(c.a, c.b);
    mutations(c.a).forEach((m) => out.push({ ...c, a: m }));
    mutations(c.b).forEach((m) => out.push({ ...c, b: m }));
  }
  if (c.t === "not") out.push(c.a);
  return out;
}

// Plausible wrong result sets (as alphabetical strings) for a WHERE query on t.
function wrongSets(rng, t, where, correctKeys) {
  const keysFor = (c) => t.rows.filter((r) => genCond(r, c, {})).map((r) => r[t.cols[0]]);
  const out = [];
  for (const m of mutations(where)) { const k = keysFor(m); if (k.length) out.push(alpha(k)); }
  const all = t.rows.map((r) => r[t.cols[0]]);
  const notIn = all.filter((k) => !correctKeys.includes(k));
  if (correctKeys.length > 1) out.push(alpha(correctKeys.slice(0, -1)));
  if (notIn.length) out.push(alpha([...correctKeys, rng.pick(notIn)]));
  if (notIn.length) out.push(alpha(notIn));
  if (correctKeys.length > 1 && notIn.length) out.push(alpha([...correctKeys.slice(1), rng.pick(notIn)]));
  return rng.shuffle(out);
}

// ---------------------------------------------------------------------------------------------
// Question builders

function finish({ tables, q, ask, notes = [], answerType, answer, choices, tolerance, explanation, hints, check, parts, tiles, joiner, useAll }) {
  const sql = renderSql(q);
  const base = {
    prompt: buildPrompt(tables, sql, ask ?? "Answer each part below.", notes),
    explanation,
    params: { sql, tables: Object.fromEntries(tables.map((t) => [t.name, rawTable(t)])), check },
  };
  if (parts) return { ...base, answerType: "multi", parts };
  if (answerType === "tiles") return { ...base, answerType, answer, tiles, joiner, useAll, hints };
  return { ...base, answerType, answer, ...(choices ? { choices } : {}), ...(answerType === "number" ? { tolerance: tolerance ?? 0 } : {}), hints };
}

function randomTheme(rng) { return rng.pick(THEMES); }

// ---- SELECT and WHERE

function genSelectWhere(difficulty, rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(difficulty === "easy" ? 4 : 5, difficulty === "easy" ? 6 : 8);
    const t = makeTable(rng, theme, n, rng.int(2, 4));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };

    if (difficulty === "easy") {
      const kind = rng.pick(["count", "count", "value", "who"]);
      if (kind === "value" || kind === "who") {
        const r = rng.pick(t.rows);
        if (kind === "value") {
          const col = rng.pick([N1, N2]);
          const q = { select: [{ col }], from: t.name, where: { t: "cmp", col: K, op: "=", v: r[K] } };
          return finish({
            tables: [t], q, check: { type: "cell", row: 0, col: 0, only: true },
            ask: "What value does this query return? Type the number.",
            answerType: "number", answer: r[col],
            explanation: `WHERE keeps only the row whose ${K} is ${r[K]}, and SELECT shows its ${col}.\n\n- Matching row: ${r[K]}\n- Its ${col}: **${r[col]}**`,
            hints: [`Find the row where ${K} is exactly '${r[K]}'.`, `Read the ${col} column in that row.`],
          });
        }
        const col = rng.pick([N1, N2]);
        const q = { select: [{ col: K }], from: t.name, where: { t: "cmp", col, op: "=", v: r[col] } };
        return finish({
          tables: [t], q, check: { type: "cell", row: 0, col: 0, only: true },
          ask: `Which ${K} does this query return? Type it.`,
          answerType: "text", answer: String(r[K]),
          explanation: `Only one row has ${col} = ${r[col]}, so the query returns its ${K}.\n\nAnswer: **${r[K]}**`,
          hints: [`Look down the ${col} column for the value ${r[col]}.`, `Read the ${K} in that row.`],
        });
      }
      const where = randCmp(rng, t);
      const res = t.rows.filter((r) => genCond(r, where, T));
      if (res.length < 1 || res.length >= n) continue;
      const q = { select: [{ col: K }], from: t.name, where };
      return finish({
        tables: [t], q, check: { type: "count" },
        ask: "How many rows does this query return?",
        answerType: "number", answer: res.length,
        explanation: `Check each row against \`${renderCond(where)}\`.\n\n- Rows that pass: ${passList(t, res, [where.col])}\n\nRows returned: **${res.length}**`,
        hints: [`Go through the rows one at a time and test \`${renderCond(where)}\`.`, where.op && where.op.includes("=") && where.op.length === 2 ? "Watch the boundary: >= and <= include the value itself." : "Watch the boundary: > and < leave out the value itself, and = needs an exact match."],
      });
    }

    let where;
    if (difficulty === "medium") {
      const form = rng.pick(["and", "or", "between", "and"]);
      if (form === "between") {
        const col = rng.pick([N1, N2]);
        const vals = t.rows.map((r) => r[col]).sort((a, b) => a - b);
        const i = rng.int(0, vals.length - 2), j = rng.int(i + 1, vals.length - 1);
        where = { t: "between", col, lo: rng.next() < 0.6 ? vals[i] : Math.max(0, vals[i] - 1) /* no negative literals: the taught grammar has none */, hi: rng.next() < 0.6 ? vals[j] : vals[j] + 1 };
      } else {
        const a = randCmp(rng, t, ["num", "cat"]);
        let b;
        do { b = randCmp(rng, t, ["num", "num", "cat"]); } while (b.col === a.col);
        where = { t: form, a, b };
      }
    } else {
      const a = randCmp(rng, t, ["num"]);
      let b, c;
      do { b = randCmp(rng, t, ["num", "cat"]); } while (b.col === a.col);
      do { c = randCmp(rng, t, ["cat", "num"]); } while (c.col === a.col || c.col === b.col);
      const form = rng.pick(["andOr", "orAnd", "not"]);
      where = form === "andOr" ? { t: "and", a: { t: "or", a, b }, b: c }
        : form === "orAnd" ? { t: "or", a: { t: "and", a, b }, b: c }
        : { t: "and", a: { t: "not", a }, b };
    }
    const res = t.rows.filter((r) => genCond(r, where, T));
    if (res.length < 1 || res.length >= n) continue;
    const keys = res.map((r) => r[K]);
    const shown = [...condCols(where)];
    const expl = `Test every row against the whole WHERE condition${where.t === "between" ? " (BETWEEN includes both ends)" : ""}.\n\n- Rows that pass: ${passList(t, res, shown)}`;
    const notes = where.t === "between" ? [NOTE_BETWEEN] : [];
    const hintsBase = [
      where.t === "between" ? `\`${renderCond(where)}\` means ${where.col} >= ${where.lo} AND ${where.col} <= ${where.hi}.` : "Work out each simple condition for a row first, then combine them: AND needs both true, OR needs at least one.",
      difficulty === "hard" ? "Do the part in brackets first. NOT flips true and false." : "Go row by row and keep a tick list of the rows that pass.",
    ];
    const q = { select: [{ col: K }], from: t.name, where };
    const asSet = rng.next() < 0.5;
    if (difficulty === "hard" && rng.next() < 0.5) {
      const ch = choicesFrom(alpha(keys), wrongSets(rng, t, where, keys), rng);
      if (!ch) continue;
      return withParts({ tables: [t], q, notes: [...notes, NOTE_SET], expl, res, keys, ch, K });
    }
    if (asSet) {
      const ch = choicesFrom(alpha(keys), wrongSets(rng, t, where, keys), rng);
      if (!ch) continue;
      return finish({
        tables: [t], q, notes: [...notes, NOTE_SET], check: { type: "set", col: 0 },
        ask: `Which ${K} values does this query return?`,
        answerType: "choice", ...ch,
        explanation: `${expl}\n\nAnswer: **${alpha(keys)}**`,
        hints: hintsBase,
      });
    }
    return finish({
      tables: [t], q, notes, check: { type: "count" },
      ask: "How many rows does this query return?",
      answerType: "number", answer: res.length,
      explanation: `${expl}\n\nRows returned: **${res.length}**`,
      hints: hintsBase,
    });
  }
}

// Multi-part SELECT/WHERE question (row count + which rows).
function withParts({ tables, q, notes, expl, res, keys, ch, K }) {
  const out = finish({
    tables, q, notes,
    check: { parts: { rows: { type: "count" }, which: { type: "set", col: 0 } } },
    parts: [
      { id: "rows", label: "Row count", ask: "How many rows does it return?", answerType: "number", answer: res.length, tolerance: 0,
        hint: "Test each row against the full condition, brackets first." },
      { id: "which", label: "Rows returned", ask: `Which ${K} values does it return?`, answerType: "choice", ...ch,
        hint: "Use your tick list from the first part; check the option has exactly those values." },
    ],
    explanation: `${expl}\n\n**Row count:** **${res.length}**\n\n**Rows returned:** **${alpha(keys)}**`,
  });
  return out;
}

// ---- ORDER BY and LIMIT

// "Which rows, in order?" is answered with blocks: one block per table row (its key value, in
// table order); the rows the query doesn't return are the distractors. Keys are distinct, so the
// answer has exactly one arrangement.
function orderAsk(K, k, n) {
  return `Which rows does this query return, in order? Build the answer from the ${K} blocks, first result row first.${k < n ? " Not every block is used." : ""}`;
}
function orderTiles(t, correct) {
  const keys = t.rows.map((r) => String(r[t.cols[0]]));
  return { answerType: "tiles", answer: correct, tiles: keys.slice(), joiner: ", ", useAll: correct.split(", ").length === keys.length };
}

function genOrderLimit(difficulty, rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(difficulty === "easy" ? 4 : 5, difficulty === "easy" ? 6 : 8);
    const t = makeTable(rng, theme, n, rng.int(2, 3));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };
    const col = rng.pick([N1, N2]);
    const dir = rng.pick(["ASC", "DESC"]);
    const other = dir === "ASC" ? "DESC" : "ASC";
    const sortedKeys = (c, d, rows = t.rows) => runTree({ select: [{ col: K }], from: t.name, orderBy: [{ col: c, dir: d }] }, { [t.name]: { ...t, rows } }).map((r) => r[0]);

    if (difficulty === "easy") {
      const kind = rng.pick(["top", "top", "first"]);
      const order = sortedKeys(col, dir);
      const q = kind === "top"
        ? { select: [{ col: K }], from: t.name, orderBy: [{ col, dir }], limit: 1 }
        : { select: [{ col: K }, { col }], from: t.name, orderBy: [{ col, dir }] };
      const correct = String(order[0]);
      const ch = choicesFrom(correct, [String(sortedKeys(col, other)[0]), String(order[1]), String(t.rows[0][K]), String(order[order.length - 1]), ...t.rows.map((r) => String(r[K]))], rng);
      if (!ch) continue;
      const top = t.rows.find((r) => r[K] === order[0]);
      return finish({
        tables: [t], q, notes: kind === "top" ? [NOTE_LIMIT] : [], check: { type: "cell", row: 0, col: 0 },
        ask: kind === "top" ? `Which ${K} does this query return?` : `Which ${K} is in the first row of the result?`,
        answerType: "choice", ...ch,
        explanation: `${dir} sorts ${dir === "ASC" ? "smallest" : "largest"} first, so the first row has the ${dir === "ASC" ? "smallest" : "largest"} ${col}.\n\n- ${dir === "ASC" ? "Smallest" : "Largest"} ${col}: ${top[col]}, in the row for ${top[K]}\n\nAnswer: **${correct}**`,
        hints: [`ASC means smallest first; DESC means largest first.`, `So look for the ${dir === "ASC" ? "smallest" : "largest"} value in the ${col} column.`],
      });
    }

    if (difficulty === "medium") {
      const kind = rng.pick(["list", "list", "filtered"]);
      if (kind === "filtered") {
        const cat = rng.pick(t.cats);
        const inCat = t.rows.filter((r) => r[C] === cat);
        if (inCat.length < 2) continue;
        const vals = inCat.map((r) => r[col]);
        const ans = dir === "DESC" ? Math.max(...vals) : Math.min(...vals);
        const overall = dir === "DESC" ? Math.max(...t.rows.map((r) => r[col])) : Math.min(...t.rows.map((r) => r[col]));
        if (overall === ans) continue; // make the WHERE matter
        const q = { select: [{ col }], from: t.name, where: { t: "cmp", col: C, op: "=", v: cat }, orderBy: [{ col, dir }], limit: 1 };
        return finish({
          tables: [t], q, notes: [NOTE_LIMIT], check: { type: "cell", row: 0, col: 0, only: true },
          ask: "What value does this query return? Type the number.",
          answerType: "number", answer: ans,
          explanation: `WHERE runs before ORDER BY and LIMIT, so only ${cat} rows are sorted.\n\n- ${cat} rows: ${passList(t, inCat, [col])}\n- ${dir === "DESC" ? "Largest" : "Smallest"} ${col} among them: **${ans}**`,
          hints: [`First keep only the rows where ${C} is '${cat}'.`, `Then take the ${dir === "DESC" ? "largest" : "smallest"} ${col} among those rows.`],
        });
      }
      const k = rng.int(2, Math.min(4, n - 1));
      const order = sortedKeys(col, dir).map(String);
      const correct = order.slice(0, k).join(", ");
      const cands = [
        sortedKeys(col, other).map(String).slice(0, k).join(", "),
        order.slice(0, k).reverse().join(", "),
        order.slice(0, k + 1).join(", "),
        order.slice(0, k - 1).join(", "),
        t.rows.slice(0, k).map((r) => String(r[K])).join(", "),
        order.slice(1, k + 1).join(", "),
      ];
      // choicesFrom still runs (it draws from the rng), so every seed keeps its table and answer;
      // the rows are now built from blocks.
      const ch = choicesFrom(correct, rng.shuffle(cands), rng);
      if (!ch) continue;
      const q = { select: [{ col: K }], from: t.name, orderBy: [{ col, dir }], limit: k };
      return finish({
        tables: [t], q, notes: [NOTE_LIMIT], check: { type: "list", col: 0 },
        ask: orderAsk(K, k, n),
        ...orderTiles(t, correct),
        explanation: `Sort by ${col} ${dir === "ASC" ? "smallest" : "largest"} first, then keep the first ${k}.\n\n- Sorted: ${order.join(", ")}\n- First ${k}: **${correct}**`,
        hints: [`Put the rows in order of ${col}, ${dir === "ASC" ? "smallest" : "largest"} first.`, `LIMIT ${k} keeps only the first ${k} of them, in that order.`],
      });
    }

    // hard
    const kind = rng.pick(["offset", "twokey", "multi"]);
    if (kind === "offset") {
      const k = rng.int(2, 3), off = rng.int(1, Math.max(1, n - k - 1));
      if (off + k > n) continue;
      const order = sortedKeys(col, dir).map(String);
      const correct = order.slice(off, off + k).join(", ");
      const cands = [
        order.slice(0, k).join(", "),
        order.slice(off + 1, off + 1 + k).join(", "),
        order.slice(off - 1 >= 0 ? off - 1 : 0, (off - 1 >= 0 ? off - 1 : 0) + k).join(", "),
        sortedKeys(col, other).map(String).slice(off, off + k).join(", "),
        order.slice(off, off + k).reverse().join(", "),
        order.slice(off, off + k + 1).join(", "),
      ];
      // choicesFrom still runs for its rng draws (see the medium list above).
      const ch = choicesFrom(correct, rng.shuffle(cands), rng);
      if (!ch) continue;
      const q = { select: [{ col: K }], from: t.name, orderBy: [{ col, dir }], limit: k, offset: off };
      return finish({
        tables: [t], q, notes: [NOTE_OFFSET], check: { type: "list", col: 0 },
        ask: orderAsk(K, k, n),
        ...orderTiles(t, correct),
        explanation: `Sort, skip ${off}, then take ${k}.\n\n- Sorted by ${col} ${dir}: ${order.join(", ")}\n- Skip the first ${off}, keep the next ${k}: **${correct}**`,
        hints: [`Sort all rows by ${col}, ${dir === "ASC" ? "smallest" : "largest"} first.`, `OFFSET ${off} skips the first ${off} sorted row${off === 1 ? "" : "s"}; LIMIT ${k} then keeps the next ${k}.`],
      });
    }
    if (kind === "twokey") {
      const d2 = rng.pick(["ASC", "DESC"]);
      const q = { select: [{ col: K }], from: t.name, orderBy: [{ col: C, dir: "ASC" }, { col, dir: d2 }] };
      const res = runTree(q, T).map((r) => String(r[0]));
      const pos = rng.int(2, n);
      // The answer must differ from ordering by the second key alone, so both keys matter.
      const alone = sortedKeys(col, d2).map(String);
      if (alone[pos - 1] === res[pos - 1]) continue;
      return finish({
        tables: [t], q, notes: ["Text sorts alphabetically (A to Z) with ASC."], check: { type: "cell", row: pos - 1, col: 0 },
        ask: `Which ${K} is in **row ${pos}** of the result (counting the first row as 1)? Type it.`,
        answerType: "text", answer: res[pos - 1],
        explanation: `Sort by ${C} A to Z first; within the same ${C}, sort by ${col} ${d2 === "ASC" ? "smallest" : "largest"} first.\n\n- Result order: ${res.map((x, i) => `${i + 1}. ${x}`).join(", ")}\n\nRow ${pos}: **${res[pos - 1]}**`,
        hints: [`The first ORDER BY column decides first: group the rows by ${C}, A to Z.`, `Only rows with the same ${C} are then ordered by ${col} (${d2 === "ASC" ? "smallest" : "largest"} first). Count down to row ${pos}.`],
      });
    }
    // multi: WHERE + ORDER BY + LIMIT, where the filter may leave fewer rows than the limit.
    const where = randCmp(rng, t, ["num", "cat"]);
    if (where.col === col) continue;
    const k = rng.int(2, 4);
    const q = { select: [{ col: K }], from: t.name, where, orderBy: [{ col, dir }], limit: k };
    const res = runTree(q, T).map((r) => String(r[0]));
    if (res.length < 1) continue;
    const allRows = t.rows.filter((r) => genCond(r, where, T));
    return finish({
      tables: [t], q, notes: [NOTE_LIMIT],
      check: { parts: { first: { type: "cell", row: 0, col: 0 }, rows: { type: "count" } } },
      parts: [
        { id: "first", label: "First row", ask: `Which ${K} is in the first row? Type it.`, answerType: "text", answer: res[0],
          hint: `Filter with WHERE first, then sort what's left by ${col} (${dir === "ASC" ? "smallest" : "largest"} first).` },
        { id: "rows", label: "Row count", ask: "How many rows does it return?", answerType: "number", answer: res.length, tolerance: 0,
          hint: `LIMIT ${k} is a maximum: if fewer rows pass the WHERE, you get fewer.` },
      ],
      explanation: `WHERE filters, ORDER BY sorts, then LIMIT cuts.\n\n- Rows passing \`${renderCond(where)}\`: ${passList(t, allRows, [...new Set([where.col, col])])}\n- Sorted by ${col} ${dir}, first ${k} at most: ${res.join(", ")}\n\n**First row:** **${res[0]}**\n\n**Row count:** **${res.length}**`,
    });
  }
}

// ---- Aggregates

function genAggregates(difficulty, rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(difficulty === "easy" ? 4 : 5, difficulty === "easy" ? 6 : 8);
    const t = makeTable(rng, theme, n, rng.int(2, 4));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };
    const col = rng.pick([N1, N2]);

    if (difficulty === "easy") {
      const kind = rng.pick(["count", "max", "min"]);
      const where = kind === "count" || rng.next() < 0.5 ? randCmp(rng, t) : null;
      const rows = where ? t.rows.filter((r) => genCond(r, where, T)) : t.rows;
      if (rows.length < 1 || (where && rows.length === n)) continue;
      const it = kind === "count" ? { agg: "COUNT", star: true } : { agg: kind.toUpperCase(), col };
      const ans = aggOf(it, rows);
      if (kind !== "count" && where && ans === aggOf(it, t.rows)) continue; // the WHERE must matter
      const q = { select: [it], from: t.name, where };
      return finish({
        tables: [t], q, check: { type: "cell", row: 0, col: 0, only: true },
        ask: "What number does this query return?",
        answerType: "number", answer: ans,
        explanation: `${where ? `First WHERE keeps: ${passList(t, rows, [...new Set([where.col, ...(it.col ? [it.col] : [])])])}.\n\n` : ""}- \`${renderItem(it)}\` ${kind === "count" ? "counts those rows" : `takes the ${kind === "max" ? "largest" : "smallest"} ${col}`}: **${ans}**`,
        hints: [where ? "Apply the WHERE first: only the rows that pass are used." : "There is no WHERE, so every row is used.", kind === "count" ? "`COUNT(*)` counts rows." : `${it.agg} picks the ${kind === "max" ? "largest" : "smallest"} value in the ${col} column.`],
      });
    }

    if (difficulty === "medium") {
      const kind = rng.pick(["sum", "avg", "avg", "distinct"]);
      if (kind === "distinct") {
        const where = rng.next() < 0.5 ? randCmp(rng, t, ["num"]) : null;
        const rows = where ? t.rows.filter((r) => genCond(r, where, T)) : t.rows;
        const it = { agg: "COUNT", distinct: true, col: C };
        const ans = aggOf(it, rows);
        if (rows.length < 2 || ans === rows.length) continue; // make DISTINCT matter
        const q = { select: [it], from: t.name, where };
        return finish({
          tables: [t], q, check: { type: "cell", row: 0, col: 0, only: true },
          ask: "What number does this query return?",
          answerType: "number", answer: ans,
          explanation: `${where ? `WHERE keeps ${rows.length} rows: ${passList(t, rows, [where.col, C])}.\n\n` : ""}- COUNT(DISTINCT ${C}) counts each different ${C} once: ${[...new Set(rows.map((r) => r[C]))].join(", ")}\n\nAnswer: **${ans}**`,
          hints: [where ? "Apply the WHERE first." : "Every row is used (no WHERE).", `DISTINCT counts each different ${C} only once, however many rows have it.`],
        });
      }
      const where = rng.next() < 0.7 ? randCmp(rng, t) : null;
      const rows = where ? t.rows.filter((r) => genCond(r, where, T)) : t.rows;
      if (rows.length < 2 || (where && rows.length === n)) continue;
      const it = { agg: kind.toUpperCase(), col };
      const exact = aggOf(it, rows);
      if (kind === "avg" && nearTie(exact)) continue;
      const q = { select: [it], from: t.name, where };
      const vals = rows.map((r) => r[col]);
      return finish({
        tables: [t], q, notes: kind === "avg" ? [NOTE_AVG, ROUND] : [], check: { type: "cell", row: 0, col: 0, only: true, round: kind === "avg" },
        ask: kind === "avg" ? "What number does this query return?" : "What number does this query return?",
        answerType: "number", answer: kind === "avg" ? round2(exact) : exact, tolerance: kind === "avg" ? 0.005 : 0,
        explanation: `${where ? `WHERE keeps: ${passList(t, rows, [...new Set([where.col, col])])}.\n\n` : ""}- Values: ${vals.join(" + ")} = ${vals.reduce((a, b) => a + b, 0)}${kind === "avg" ? `\n- ÷ ${vals.length} rows ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)}**` : `\n\nSUM: **${exact}**`}`,
        hints: [where ? "Apply the WHERE first: only the rows that pass are used." : "There is no WHERE, so every row is used.", kind === "avg" ? `AVG = (sum of ${col}) ÷ (number of rows used).` : `Add up the ${col} values of the rows used.`],
      });
    }

    // hard
    const kind = rng.pick(["multi", "multi", "sub", "subset"]);
    if (kind === "sub" || kind === "subset") {
      const op = rng.pick([">", "<"]);
      const where = { t: "sub", col, op, agg: "AVG", aggCol: col, from: t.name };
      const avg = aggOf({ agg: "AVG", col }, t.rows);
      const res = t.rows.filter((r) => genCond(r, where, T));
      if (res.length < 1 || res.length >= n || t.rows.some((r) => r[col] === avg)) continue;
      const q = { select: [{ col: K }], from: t.name, where };
      const keys = res.map((r) => r[K]);
      const expl = `The subquery runs first and gives the mean ${col} of the whole table.\n\n- AVG(${col}) = (${t.rows.map((r) => r[col]).join(" + ")}) ÷ ${n} ≈ ${num(avg)}\n- Rows with ${col} ${op} ${num(avg)}: ${passList(t, res, [col])}`;
      const hints = [`Work out the subquery first: the mean of every ${col} value.`, `Then keep the rows whose ${col} is ${op === ">" ? "above" : "below"} that mean.`];
      if (kind === "subset") {
        const wrong = [alpha(t.rows.filter((r) => !keys.includes(r[K])).map((r) => r[K])), ...wrongSets(rng, t, { t: "cmp", col, op, v: Math.round(avg) }, keys)];
        const ch = choicesFrom(alpha(keys), wrong, rng);
        if (!ch) continue;
        return finish({
          tables: [t], q, notes: [NOTE_AVG, NOTE_SET], check: { type: "set", col: 0 },
          ask: `Which ${K} values does this query return?`,
          answerType: "choice", ...ch,
          explanation: `${expl}\n\nAnswer: **${alpha(keys)}**`, hints,
        });
      }
      return finish({
        tables: [t], q, notes: [NOTE_AVG], check: { type: "count" },
        ask: "How many rows does this query return?",
        answerType: "number", answer: res.length,
        explanation: `${expl}\n\nRows returned: **${res.length}**`, hints,
      });
    }
    const where = randCmp(rng, t);
    const rows = t.rows.filter((r) => genCond(r, where, T));
    if (rows.length < 2 || rows.length === n) continue;
    const sum = aggOf({ agg: "SUM", col }, rows);
    const avg = sum / rows.length;
    if (nearTie(avg)) continue;
    const q = { select: [{ agg: "COUNT", star: true }, { agg: "SUM", col }, { agg: "AVG", col }], from: t.name, where };
    return finish({
      tables: [t], q, notes: [NOTE_AVG],
      check: { parts: { count: { type: "cell", row: 0, col: 0 }, sum: { type: "cell", row: 0, col: 1 }, avg: { type: "cell", row: 0, col: 2, round: true } } },
      parts: [
        { id: "count", label: "COUNT(*)", ask: "First column: how many rows are counted?", answerType: "number", answer: rows.length, tolerance: 0,
          hint: "Apply the WHERE first, then count the rows that pass." },
        { id: "sum", label: `SUM(${col})`, ask: "Second column: what is the sum?", answerType: "number", answer: sum, tolerance: 0,
          hint: `Add the ${col} values of those rows only.` },
        { id: "avg", label: `AVG(${col})`, ask: `Third column: what is the average? ${ROUND}`, answerType: "number", answer: round2(avg), tolerance: 0.005,
          hint: "Divide your sum by your count." },
      ],
      explanation: `All three use only the rows that pass the WHERE.\n\n- Rows: ${passList(t, rows, [...new Set([where.col, col])])}\n- COUNT(*) = ${rows.length}\n- SUM(${col}) = ${rows.map((r) => r[col]).join(" + ")} = ${sum}\n- AVG(${col}) = ${sum} ÷ ${rows.length} ≈ ${num(avg)}\n\n**COUNT(*):** **${rows.length}**\n\n**SUM(${col}):** **${sum}**\n\n**AVG(${col}):** **${round2(avg).toFixed(2)}**`,
    });
  }
}

// ---- GROUP BY and JOIN

function genGroupJoin(difficulty, rng) {
  for (;;) {
    if (difficulty === "hard" && rng.next() < 0.55) {
      const out = genJoin(rng);
      if (out) return out;
      continue;
    }
    const theme = randomTheme(rng);
    const n = rng.int(5, 8);
    const t = makeTable(rng, theme, n, rng.int(2, Math.min(4, theme.cats.length)));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };
    const col = rng.pick([N1, N2]);
    const groups = {};
    t.rows.forEach((r) => (groups[r[C]] ||= []).push(r));
    const gNames = Object.keys(groups);
    const groupLines = (show) => gNames.slice().sort().map((g) => `- ${g}: ${groups[g].map((r) => (show ? `${r[K]} (${r[show]})` : r[K])).join(", ")}`).join("\n");

    if (difficulty === "easy") {
      const kind = rng.pick(["rows", "count", "count"]);
      const q = { select: [{ col: C }, { agg: "COUNT", star: true }], from: t.name, groupBy: C };
      if (kind === "rows") {
        if (gNames.length === n) continue;
        return finish({
          tables: [t], q, check: { type: "count" },
          ask: "How many rows does this query return?",
          answerType: "number", answer: gNames.length,
          explanation: `GROUP BY makes one result row per different ${C}.\n\n${groupLines()}\n\nRows returned: **${gNames.length}**`,
          hints: [`GROUP BY ${C} puts rows with the same ${C} together.`, `Each group becomes one row, so count the different ${C} values.`],
        });
      }
      const g = rng.pick(gNames);
      return finish({
        tables: [t], q, check: { type: "group", key: g, col: 1 },
        ask: `What number appears next to **${g}** in the result?`,
        answerType: "number", answer: groups[g].length,
        explanation: `Each group's \`COUNT(*)\` is the number of rows in it.\n\n${groupLines()}\n\n${g}: **${groups[g].length}**`,
        hints: [`Find every row whose ${C} is ${g}.`, "`COUNT(*)` counts how many rows are in that group."],
      });
    }

    if (difficulty === "medium") {
      const kind = rng.pick(["value", "value", "best"]);
      const agg = rng.pick(kind === "best" ? ["SUM", "AVG"] : ["SUM", "AVG", "MAX", "MIN"]);
      const it = { agg, col };
      const q = { select: [{ col: C }, it], from: t.name, groupBy: C };
      const res = runTree(q, T);
      if (kind === "best") {
        if (gNames.length < 3) continue;
        const vals = res.map((r) => r[1]);
        const top = Math.max(...vals);
        if (vals.filter((v) => v === top).length !== 1) continue;
        const winner = res.find((r) => r[1] === top)[0];
        // Distractors: other groups present, then categories of the theme not in the table.
        const wrong = [...rng.shuffle(gNames.filter((g) => g !== winner)), ...rng.shuffle(theme.cats.filter((c) => !gNames.includes(c)))];
        // A plausible slip: the group with the single largest value.
        const maxRow = t.rows.reduce((a, b) => (b[col] > a[col] ? b : a));
        const ch = choicesFrom(winner, [maxRow[C], ...wrong], rng);
        if (!ch) continue;
        return finish({
          tables: [t], q, notes: agg === "AVG" ? [NOTE_AVG] : [], check: { type: "argmax", col: 1, absent: true },
          ask: `Which ${C} has the **largest** value in the second column of the result?`,
          answerType: "choice", ...ch,
          explanation: `Work out ${agg}(${col}) for each group.\n\n${res.slice().sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map((r) => `- ${r[0]}: ${num(r[1])}`).join("\n")}\n\nLargest: **${winner}**`,
          hints: [`Split the rows into groups by ${C}.`, `For each group work out ${agg === "SUM" ? `the total ${col}` : `the mean ${col} (total ÷ rows)`}, then compare.`],
        });
      }
      const g = rng.pick(gNames.filter((x) => groups[x].length >= 2).concat(gNames.filter((x) => groups[x].length >= 2).length ? [] : gNames));
      if (groups[g].length < 2) continue;
      const exact = res.find((r) => r[0] === g)[1];
      if (agg === "AVG" && nearTie(exact)) continue;
      const vals = groups[g].map((r) => r[col]);
      return finish({
        tables: [t], q, notes: agg === "AVG" ? [NOTE_AVG, ROUND] : [], check: { type: "group", key: g, col: 1, round: agg === "AVG" },
        ask: `What number appears next to **${g}** in the result?`,
        answerType: "number", answer: agg === "AVG" ? round2(exact) : exact, tolerance: agg === "AVG" ? 0.005 : 0,
        explanation: `Only the ${g} rows go into that group.\n\n- ${g} rows: ${passList(t, groups[g], [col])}\n- ${agg}: ${agg === "SUM" || agg === "AVG" ? `${vals.join(" + ")} = ${vals.reduce((a, b) => a + b, 0)}${agg === "AVG" ? ` ÷ ${vals.length} ≈ ${num(exact)}` : ""}` : `the ${agg === "MAX" ? "largest" : "smallest"} of ${vals.join(", ")}`}\n\n${g}: **${agg === "AVG" ? round2(exact).toFixed(2) : exact}**`,
        hints: [`Use only the rows where ${C} is ${g}.`, agg === "SUM" ? `Add their ${col} values.` : agg === "AVG" ? `Average their ${col} values: total ÷ number of rows.` : `Take the ${agg === "MAX" ? "largest" : "smallest"} ${col} among them.`],
      });
    }

    // hard: HAVING
    if (gNames.length < 3) continue;
    const useCount = rng.next() < 0.5;
    const hv = useCount
      ? { agg: "COUNT", star: true, op: rng.pick([">=", ">"]), v: rng.int(1, 2) }
      : { agg: "SUM", col, op: rng.pick([">", "<"]), v: 0 };
    if (!useCount) {
      const sums = gNames.map((g) => aggOf({ agg: "SUM", col }, groups[g])).sort((a, b) => a - b);
      const i = rng.int(0, sums.length - 2);
      hv.v = rng.next() < 0.5 ? sums[i] : Math.floor((sums[i] + sums[i + 1]) / 2);
    }
    const q = { select: [{ col: C }], from: t.name, groupBy: C, having: hv };
    const res = runTree(q, T).map((r) => String(r[0]));
    if (res.length < 1 || res.length === gNames.length) continue;
    const scoreOf = (g) => aggOf(hv, groups[g]);
    const expl = `Group by ${C}, work out \`${renderItem(hv)}\` per group, and keep groups where it is ${hv.op} ${hv.v}.\n\n${gNames.slice().sort().map((g) => `- ${g}: ${scoreOf(g)}${CMP[hv.op](scoreOf(g), hv.v) ? " (kept)" : ""}`).join("\n")}`;
    const hints = [`Split the rows into groups by ${C} and work out \`${renderItem(hv)}\` for each group.`, `HAVING filters whole groups: keep a group only if its value is ${hv.op} ${hv.v}.`];
    if (rng.next() < 0.5) {
      const flipped = { ...hv, op: FLIP[hv.op] };
      const keepWith = (h) => alpha(gNames.filter((g) => CMP[h.op](aggOf(h, groups[g]), h.v)));
      const wrong = [keepWith(flipped), alpha(gNames.filter((g) => !res.includes(g))), alpha(gNames),
        keepWith({ ...hv, op: hv.op.includes("=") ? hv.op[0] : hv.op + "=" }), alpha(res.slice(1)), alpha([...res, ...rng.shuffle(theme.cats.filter((c) => !res.includes(c))).slice(0, 1)])];
      const ch = choicesFrom(alpha(res), wrong, rng);
      if (!ch) continue;
      return finish({
        tables: [t], q, notes: [NOTE_SET], check: { type: "set", col: 0 },
        ask: `Which ${C} values does this query return?`,
        answerType: "choice", ...ch,
        explanation: `${expl}\n\nAnswer: **${alpha(res)}**`, hints,
      });
    }
    return finish({
      tables: [t], q, check: { type: "count" },
      ask: "How many rows does this query return?",
      answerType: "number", answer: res.length,
      explanation: `${expl}\n\nRows returned: **${res.length}**`, hints,
    });
  }
}

function genJoin(rng) {
  const { J, L, R } = makeJoinTables(rng);
  const T = { [L.name]: L, [R.name]: R };
  const [lab, fk, val] = J.lcols.map((c) => `${L.name}.${c}`);
  const [rk, rn] = J.rcols.map((c) => `${R.name}.${c}`);
  const join = { table: R.name, on: [fk, rk] };
  const matched = L.rows.filter((l) => R.rows.some((r) => r[J.rcols[0]] === l[J.lcols[1]]));
  const unmatched = L.rows.filter((l) => !matched.includes(l));
  const nameOf = (l) => R.rows.find((r) => r[J.rcols[0]] === l[J.lcols[1]])[J.rcols[1]];
  const matchLines = `${L.rows.map((l) => `- ${l[J.lcols[0]]}: ${J.lcols[1]} ${l[J.lcols[1]]} → ${matched.includes(l) ? nameOf(l) : "no match (dropped)"}`).join("\n")}`;
  const hint1 = `Match each ${L.name} row's ${J.lcols[1]} with the ${J.rcols[0]} in ${R.name}.`;
  const hint2 = "INNER JOIN keeps only rows that find a match; rows with no match disappear.";
  const kind = rng.pick(["count", "set", "groupcount", "sum", "multi"]);

  if (kind === "count") {
    if (!unmatched.length) return null;
    const q = { select: [{ col: lab }, { col: rn }], from: L.name, join };
    return finish({
      tables: [L, R], q, check: { type: "count" },
      ask: "How many rows does this query return?",
      answerType: "number", answer: matched.length,
      explanation: `Each ${L.name} row joins to the ${R.name} row with the same ${J.rcols[0]}.\n\n${matchLines}\n\nRows returned: **${matched.length}**`,
      hints: [hint1, hint2],
    });
  }
  const names = [...new Set(matched.map(nameOf))];
  if (!names.length) return null;
  const target = rng.pick(names);
  const forTarget = matched.filter((l) => nameOf(l) === target);
  if (kind === "set") {
    const q = { select: [{ col: lab }], from: L.name, join, where: { t: "cmp", col: rn, op: "=", v: target } };
    const keys = forTarget.map((l) => l[J.lcols[0]]);
    const others = matched.filter((l) => !forTarget.includes(l)).map((l) => l[J.lcols[0]]);
    const wrong = [alpha(matched.map((l) => l[J.lcols[0]])), alpha([...keys, ...unmatched.map((l) => l[J.lcols[0]])]),
      ...(others.length ? [alpha(others), alpha([...keys, others[0]])] : []), ...(keys.length > 1 ? [alpha(keys.slice(1))] : []),
      alpha(L.rows.filter((l) => l[J.lcols[1]] === R.rows.find((r) => r[J.rcols[1]] === target)[J.rcols[0]] + 1).map((l) => l[J.lcols[0]]))];
    const ch = choicesFrom(alpha(keys), wrong.filter((s) => s), rng);
    if (!ch) return null;
    return finish({
      tables: [L, R], q, notes: [NOTE_SET], check: { type: "set", col: 0 },
      ask: `Which ${J.lcols[0]} values does this query return?`,
      answerType: "choice", ...ch,
      explanation: `Join the tables, then keep rows where ${J.rcols[1]} is ${target}.\n\n${matchLines}\n\nAnswer: **${alpha(keys)}**`,
      hints: [hint1, `Then keep only the joined rows whose ${J.rcols[1]} is '${target}'.`],
    });
  }
  if (kind === "groupcount") {
    const q = { select: [{ col: rn }, { agg: "COUNT", star: true }], from: L.name, join, groupBy: rn };
    return finish({
      tables: [L, R], q, check: { type: "group", key: target, col: 1 },
      ask: `What number appears next to **${target}** in the result?`,
      answerType: "number", answer: forTarget.length,
      explanation: `Join, then group the joined rows by ${J.rcols[1]} and count each group.\n\n${matchLines}\n\n${target}: **${forTarget.length}**`,
      hints: [hint1, `Count the joined rows that belong to ${target}.`],
    });
  }
  if (kind === "sum") {
    const q = { select: [{ agg: "SUM", col: val }], from: L.name, join, where: { t: "cmp", col: rn, op: "=", v: target } };
    const sum = forTarget.reduce((a, l) => a + l[J.lcols[2]], 0);
    return finish({
      tables: [L, R], q, check: { type: "cell", row: 0, col: 0, only: true },
      ask: "What number does this query return?",
      answerType: "number", answer: sum,
      explanation: `Join, keep ${target}'s rows, then add their ${J.lcols[2]}.\n\n${matchLines}\n\n- ${target}: ${forTarget.map((l) => l[J.lcols[2]]).join(" + ")} = **${sum}**`,
      hints: [hint1, `Keep the joined rows for ${target} and add up their ${J.lcols[2]}.`],
    });
  }
  // multi: join row count + one group's count
  if (!unmatched.length) return null;
  const q = { select: [{ col: rn }, { agg: "COUNT", star: true }], from: L.name, join, groupBy: rn };
  const res = runTree(q, T);
  return finish({
    tables: [L, R], q,
    check: { parts: { rows: { type: "count" }, count: { type: "group", key: target, col: 1 } } },
    parts: [
      { id: "rows", label: "Result rows", ask: "How many rows does the query return?", answerType: "number", answer: res.length, tolerance: 0,
        hint: `After the join, each different ${J.rcols[1]} becomes one row.` },
      { id: "count", label: `Count for ${target}`, ask: `What number appears next to ${target}?`, answerType: "number", answer: forTarget.length, tolerance: 0,
        hint: `Count the ${L.name} rows that match ${target}.` },
    ],
    explanation: `Join first (unmatched rows drop out), then group by ${J.rcols[1]}.\n\n${matchLines}\n\n**Result rows:** **${res.length}**\n\n**Count for ${target}:** **${forTarget.length}**`,
  });
}

// =============================================================================================
// verify(): tokenizer, parser and executor written independently of the tree code above.

const KW = new Set(["SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "BETWEEN", "ORDER", "BY", "ASC", "DESC", "LIMIT", "OFFSET",
  "GROUP", "HAVING", "INNER", "JOIN", "ON", "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT"]);
const AGGS = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);

function tokenizeCheck(sql) {
  const out = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") { i++; continue; }
    if (ch === "'") {
      const j = sql.indexOf("'", i + 1);
      if (j < 0) throw new Error("unterminated string");
      out.push({ k: "str", v: sql.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < sql.length && ((sql[j] >= "0" && sql[j] <= "9") || sql[j] === ".")) j++;
      out.push({ k: "num", v: parseFloat(sql.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_.]/.test(sql[j])) j++;
      const w = sql.slice(i, j);
      out.push(KW.has(w.toUpperCase()) ? { k: "kw", v: w.toUpperCase() } : { k: "id", v: w });
      i = j;
      continue;
    }
    const two = sql.substr(i, 2);
    if (two === "<>" || two === "<=" || two === ">=") { out.push({ k: "op", v: two }); i += 2; continue; }
    if (ch === "=" || ch === "<" || ch === ">") { out.push({ k: "op", v: ch }); i++; continue; }
    if ("(),;*".includes(ch)) { out.push({ k: "sym", v: ch }); i++; continue; }
    throw new Error("unexpected character " + ch);
  }
  return out;
}

function parseSql(sql) {
  const tk = tokenizeCheck(sql);
  let p = 0;
  const peek = () => tk[p];
  const isKw = (v) => tk[p] && tk[p].k === "kw" && tk[p].v === v;
  const isSym = (v) => tk[p] && tk[p].k === "sym" && tk[p].v === v;
  const need = (k, v) => {
    const t = tk[p];
    if (!t || t.k !== k || (v !== undefined && t.v !== v)) throw new Error(`expected ${v ?? k}`);
    p++;
    return t.v;
  };
  function item() {
    if (tk[p] && tk[p].k === "kw" && AGGS.has(tk[p].v)) {
      const fn = need("kw");
      need("sym", "(");
      let star = false, distinct = false, col = null;
      if (isSym("*")) { p++; star = true; } else { if (isKw("DISTINCT")) { p++; distinct = true; } col = need("id"); }
      need("sym", ")");
      return { fn, star, distinct, col };
    }
    return { col: need("id") };
  }
  function value() {
    const t = peek();
    if (t && t.k === "num") { p++; return { lit: t.v }; }
    if (t && t.k === "str") { p++; return { lit: t.v }; }
    if (isSym("(")) {
      p++;
      need("kw", "SELECT");
      const it = item();
      need("kw", "FROM");
      const from = need("id");
      need("sym", ")");
      return { sub: { it, from } };
    }
    throw new Error("expected a value");
  }
  function primary() {
    if (isKw("NOT")) { p++; return { not: primary() }; }
    if (isSym("(")) { p++; const c = orExpr(); need("sym", ")"); return c; }
    const col = need("id");
    if (isKw("BETWEEN")) { p++; const lo = value(); need("kw", "AND"); const hi = value(); return { col, between: [lo, hi] }; }
    const op = need("op");
    return { col, op, val: value() };
  }
  function andExpr() { let c = primary(); while (isKw("AND")) { p++; c = { and: [c, primary()] }; } return c; }
  function orExpr() { let c = andExpr(); while (isKw("OR")) { p++; c = { or: [c, andExpr()] }; } return c; }

  need("kw", "SELECT");
  const items = [item()];
  while (isSym(",")) { p++; items.push(item()); }
  need("kw", "FROM");
  const q = { items, from: need("id") };
  if (isKw("INNER")) { p++; need("kw", "JOIN"); q.join = need("id"); need("kw", "ON"); const a = need("id"); need("op", "="); q.on = [a, need("id")]; }
  if (isKw("WHERE")) { p++; q.where = orExpr(); }
  if (isKw("GROUP")) { p++; need("kw", "BY"); q.group = need("id"); if (isKw("HAVING")) { p++; const it = item(); const op = need("op"); q.having = { it, op, val: value() }; } }
  if (isKw("ORDER")) {
    p++; need("kw", "BY");
    q.order = [];
    do { if (isSym(",")) p++; const col = need("id"); let desc = false; if (isKw("ASC")) p++; else if (isKw("DESC")) { p++; desc = true; } q.order.push({ col, desc }); } while (isSym(","));
  }
  if (isKw("LIMIT")) { p++; q.limit = need("num"); if (isKw("OFFSET")) { p++; q.offset = need("num"); } }
  need("sym", ";");
  if (p !== tk.length) throw new Error("trailing tokens");
  return q;
}

// Rows become Maps from column name (qualified and, when unambiguous, bare) to value.
function tableEnv(tables, name) {
  const t = tables[name];
  if (!t) throw new Error("unknown table " + name);
  const rows = [];
  for (const raw of t.rows) {
    const m = new Map();
    for (let i = 0; i < t.cols.length; i++) { m.set(t.cols[i], raw[i]); m.set(name + "." + t.cols[i], raw[i]); }
    rows.push(m);
  }
  return rows;
}
function look(row, col) {
  if (!row.has(col)) throw new Error("unknown column " + col);
  return row.get(col);
}
function compare(a, op, b) {
  switch (op) {
    case "=": return a === b;
    case "<>": return a !== b;
    case "<": return a < b;
    case ">": return a > b;
    case "<=": return a <= b;
    case ">=": return a >= b;
  }
  throw new Error("bad operator");
}
function aggregate(it, rows) {
  if (it.fn === "COUNT") {
    if (it.star) return rows.length;
    const seen = [];
    for (const r of rows) { const v = look(r, it.col); if (!it.distinct || !seen.includes(v)) seen.push(v); }
    return seen.length;
  }
  let total = 0, best = null;
  for (const r of rows) {
    const v = look(r, it.col);
    total += v;
    if (best === null || (it.fn === "MIN" ? v < best : v > best)) best = v;
  }
  if (it.fn === "SUM") return total;
  if (it.fn === "AVG") return rows.length ? total / rows.length : NaN;
  return best;
}
function valueOf(v, tables) {
  if ("lit" in v) return v.lit;
  return aggregate(v.sub.it, tableEnv(tables, v.sub.from));
}
function test(row, c, tables) {
  if (c.not) return !test(row, c.not, tables);
  if (c.and) return test(row, c.and[0], tables) && test(row, c.and[1], tables);
  if (c.or) return test(row, c.or[0], tables) || test(row, c.or[1], tables);
  const x = look(row, c.col);
  if (c.between) return x >= valueOf(c.between[0], tables) && x <= valueOf(c.between[1], tables);
  return compare(x, c.op, valueOf(c.val, tables));
}

function execSql(sql, tables) {
  const q = parseSql(sql);
  let rows = tableEnv(tables, q.from);
  if (q.join) {
    const right = tableEnv(tables, q.join);
    const joined = [];
    for (const a of rows) for (const b of right) {
      const m = new Map();
      for (const [k, v] of a) if (k.includes(".")) m.set(k, v);
      for (const [k, v] of b) if (k.includes(".")) m.set(k, v);
      if (look(m, q.on[0]) === look(m, q.on[1])) joined.push(m);
    }
    rows = joined;
  }
  if (q.where) {
    const kept = [];
    for (const r of rows) if (test(r, q.where, tables)) kept.push(r);
    rows = kept;
  }
  let out = [];
  const hasAgg = q.items.some((it) => it.fn);
  if (q.group) {
    const keys = [];
    const buckets = [];
    for (const r of rows) {
      const k = look(r, q.group);
      let i = keys.indexOf(k);
      if (i < 0) { keys.push(k); buckets.push([]); i = keys.length - 1; }
      buckets[i].push(r);
    }
    for (let i = 0; i < keys.length; i++) {
      if (q.having && !compare(aggregate(q.having.it, buckets[i]), q.having.op, valueOf(q.having.val, tables))) continue;
      out.push(q.items.map((it) => (it.fn ? aggregate(it, buckets[i]) : look(buckets[i][0], it.col))));
    }
  } else if (hasAgg) {
    out.push(q.items.map((it) => aggregate(it, rows)));
  } else {
    if (q.order) {
      // Insertion sort on the ORDER BY keys.
      const sorted = [];
      for (const r of rows) {
        let i = 0;
        while (i < sorted.length) {
          let before = false, decided = false;
          for (const o of q.order) {
            const a = look(r, o.col), b = look(sorted[i], o.col);
            if (a === b) continue;
            before = o.desc ? a > b : a < b;
            decided = true;
            break;
          }
          if (decided && before) break;
          i++;
        }
        sorted.splice(i, 0, r);
      }
      rows = sorted;
    }
    for (const r of rows) out.push(q.items.map((it) => look(r, it.col)));
  }
  if (q.limit !== undefined) {
    const start = q.offset || 0;
    const cut = [];
    for (let i = start; i < out.length && cut.length < q.limit; i++) cut.push(out[i]);
    out = cut;
  }
  return out;
}


// Does `answer` match the result `res` for one check?
function valueMatches(v, answer, round) {
  if (typeof v === "number") {
    const x = Number(answer);
    if (answer === "" || !Number.isFinite(x)) return false;
    if (!round) return x === v;
    const ok = (y) => Math.abs(y - v) <= 0.005 * (1 + 1e-9);
    if (!ok(x)) return false;
    return !ok(Math.round((x - 0.01) * 100) / 100) && !ok(Math.round((x + 0.01) * 100) / 100);
  }
  return String(answer).trim().replace(/\s+/g, " ").toLowerCase() === String(v).toLowerCase();
}

function checkOne(res, c, answer) {
  if (c.type === "count") { const x = Number(answer); return Number.isInteger(x) && x === res.length; }
  if (c.type === "cell") {
    if (c.only && (res.length !== 1 || res[0].length !== 1)) return false;
    if (!res[c.row]) return false;
    return valueMatches(res[c.row][c.col], answer, c.round);
  }
  if (c.type === "group") {
    const hits = res.filter((r) => r[0] === c.key);
    return hits.length === 1 && valueMatches(hits[0][c.col], answer, c.round);
  }
  if (c.type === "set") {
    if (!res.length) return false;
    const vals = res.map((r) => String(r[c.col]));
    vals.sort();
    return vals.join(", ") === String(answer);
  }
  if (c.type === "list") return res.length > 0 && res.map((r) => String(r[c.col])).join(", ") === String(answer);
  if (c.type === "argmax") {
    let best = null, who = [];
    for (const r of res) {
      if (best === null || r[c.col] > best) { best = r[c.col]; who = [r[0]]; } else if (r[c.col] === best) who.push(r[0]);
    }
    return who.length === 1 && String(who[0]) === String(answer);
  }
  return false;
}

// For choice answers: exactly one option may pass, and it must be the candidate.
function checkChoice(res, c, choices, answer) {
  if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4) return false;
  const ok = choices.filter((ch) => checkOne(res, c, ch));
  return ok.length === 1 && ok[0] === String(answer);
}

// =============================================================================================


// Every exact number answer says so (no rng calls: wording only).
function stateWhole(q) {
  if (!q) return q;
  if (q.answerType === "number" && !q.tolerance && !/whole number/i.test(q.prompt)) q.prompt += " Type the whole number.";
  if (q.answerType === "multi") for (const p of q.parts || []) if (p.answerType === "number" && !p.tolerance && !/whole number/i.test(p.ask)) p.ask += " Type the whole number.";
  return q;
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "write-query") {
    if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
    return genWriteQuery(difficulty, rng);
  }
  if (difficulty === "expert") return stateWhole(genExpert(subtopic, rng));
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "select-where") return stateWhole(genSelectWhere(difficulty, rng));
  if (subtopic === "order-limit") return stateWhole(genOrderLimit(difficulty, rng));
  if (subtopic === "aggregates") return stateWhole(genAggregates(difficulty, rng));
  if (subtopic === "group-join") return stateWhole(genGroupJoin(difficulty, rng));
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: parse the shown SQL text, run it with the loop-based executor, compare.
export function verify(question, answer) {
  const p = question && question.params;
  if (p && p.kind === "wq") {
    try {
      return verifyWriteQuery(question, answer);
    } catch {
      return false;
    }
  }
  if (p && typeof p.kind === "string" && p.kind.startsWith("x-")) {
    if (answer === "" || answer === null || answer === undefined) return false;
    try {
      return verifyExpert(p, question, answer);
    } catch {
      return false;
    }
  }
  if (!p || typeof p.sql !== "string" || !p.tables) return false;
  if (answer === "" || answer === null || answer === undefined) return false;
  try {
    const res = execSql(p.sql, p.tables);
    if (question.answerType === "multi") {
      if (!p.check || !p.check.parts || typeof answer !== "object") return false;
      for (const part of question.parts) {
        const c = p.check.parts[part.id];
        if (!c) return false;
        const a = answer[part.id];
        if (a === "" || a === null || a === undefined) return false;
        if (part.answerType === "choice" ? !checkChoice(res, c, part.choices, a) : !checkOne(res, c, a)) return false;
      }
      return true;
    }
    if (!p.check) return false;
    if (question.answerType === "choice") return fourDistinct(question) && checkChoice(res, p.check, question.choices, answer);
    if (question.answerType === "tiles") {
      // One block per table row (key values, distinct, in table order); the answer is a list of them.
      const keys = p.tables[Object.keys(p.tables)[0]].rows.map((r) => String(r[0]));
      if (!Array.isArray(question.tiles) || question.tiles.map(String).join("|") !== keys.join("|") || new Set(keys).size !== keys.length) return false;
      return checkOne(res, p.check, String(answer).split(",").map((x) => x.trim()).join(", "));
    }
    return checkOne(res, p.check, answer);
  } catch {
    return false;
  }
}

// =============================================================================================
// Expert. A separate branch: generate() dispatches here before its difficulty check, so
// easy/medium/hard draws are unchanged. Questions built with finish() are verified by the usual
// path (parse the shown SQL, run execSql). Questions whose SQL has a gap or a hidden value carry
// params.kind "x-…" and are checked by verifyExpert, which fills the gap with each candidate and
// runs execSql on the result. Hints use only values already drawn.

// finish() keeps hints only on single questions; expert multi-part ones keep theirs too.
const finishX = (args) => ({ ...finish(args), hints: args.hints });
const NOTE_PREC = "Standard SQL operator precedence applies.";
const keysOf = (rows, K) => rows.map((r) => r[K]);

// ---- SELECT and WHERE / expert ----

// Working backwards: which numbers could replace the ? in the WHERE?
function xThreshold(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(6, 9);
    const t = makeTable(rng, theme, n, rng.int(2, 3));
    const [K, C, N1, N2] = t.cols;
    const col = rng.pick([N1, N2]);
    const cat = rng.pick(t.cats);
    const inCat = t.rows.filter((r) => r[C] === cat);
    if (inCat.length < 3) continue;
    const op = rng.pick([">", ">=", "<", "<="]);
    const v0 = rng.pick(inCat.map((r) => r[col]));
    const kept = inCat.filter((r) => CMP[op](r[col], v0));
    const out = inCat.filter((r) => !CMP[op](r[col], v0));
    if (!kept.length || !out.length) continue;
    const I = kept.map((r) => r[col]);
    const X = out.map((r) => r[col]);
    const [lo, hi] = op === ">" ? [Math.max(...X), Math.min(...I) - 1]
      : op === ">=" ? [Math.max(...X) + 1, Math.min(...I)]
        : op === "<" ? [Math.max(...I) + 1, Math.min(...X)]
          : [Math.max(...I), Math.min(...X) - 1];
    if (lo >= hi) continue;
    const sql = `SELECT ${K}\nFROM ${t.name}\nWHERE ${C} = '${cat}' AND ${col} ${op} ?;`;
    const keys = keysOf(kept, K);
    return {
      prompt: buildPrompt([t], sql, `The \`?\` stands for a whole number. The query returned exactly these rows: **${alpha(keys)}**.`, []),
      answerType: "multi",
      parts: [
        { id: "lo", label: "Smallest", ask: "What is the **smallest** whole number the `?` could be?", answerType: "number", answer: lo, tolerance: 0,
          hint: `Only ${cat} rows matter. ${op.includes(">") ? "Every returned row must pass the test, and every other " + cat + " row must fail it." : "Every returned row must pass, and every other " + cat + " row must fail."}` },
        { id: "hi", label: "Largest", ask: "What is the **largest** whole number the `?` could be?", answerType: "number", answer: hi, tolerance: 0,
          hint: `Watch the boundary: ${op === ">" || op === "<" ? `${op} leaves out the value itself` : `${op} includes the value itself`}.` },
      ],
      explanation: `Only rows with ${C} = '${cat}' can be returned:\n\n- Returned: ${passList(t, kept, [col])}\n- Not returned: ${passList(t, out, [col])}\n\nFor \`${col} ${op} ?\` the returned values (${I.join(", ")}) must pass and the others (${X.join(", ")}) must fail, so ? can be any whole number from **${lo}** to **${hi}**.`,
      params: { kind: "x-threshold", sql, tables: { [t.name]: rawTable(t) }, keys: alpha(keys), K },
      hints: [
        `Ignore rows whose ${C} isn't '${cat}': the AND removes them whatever ? is.`,
        `Split the ${cat} rows into returned and not returned, and list their ${col} values.`,
        "The ? must sit between the two groups. Try the values at the edges to see whether they still work.",
      ],
    };
  }
}

// AND binds tighter than OR, with no brackets to help.
function xPrecedence(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(6, 8);
    const t = makeTable(rng, theme, n, rng.int(2, 4));
    const [K] = t.cols;
    const a = randCmp(rng, t, ["cat", "num"]);
    let b, c;
    do b = randCmp(rng, t, ["num", "cat"]); while (b.col === a.col);
    do c = randCmp(rng, t, ["num", "cat"]); while (c.col === b.col);
    const right = { t: "or", a, b: { t: "and", a: b, b: c } };
    const wrongTree = { t: "and", a: { t: "or", a, b }, b: c };
    const res = t.rows.filter((r) => genCond(r, right, {}));
    const naive = t.rows.filter((r) => genCond(r, wrongTree, {}));
    if (res.length < 1 || res.length >= n || alpha(keysOf(res, K)) === alpha(keysOf(naive, K))) continue;
    const keys = keysOf(res, K);
    const wrong = [alpha(keysOf(naive, K)), ...wrongSets(rng, t, right, keys)].filter((s) => s);
    const ch = choicesFrom(alpha(keys), wrong, rng);
    if (!ch) continue;
    const sql = `SELECT ${K}\nFROM ${t.name}\nWHERE ${renderCond(a)} OR ${renderCond(b)} AND ${renderCond(c)};`;
    const pass = (cond, r) => (genCond(r, cond, {}) ? "T" : "F");
    return {
      prompt: buildPrompt([t], sql, "Answer both parts.", [NOTE_PREC, NOTE_SET]),
      answerType: "multi",
      parts: [
        { id: "rows", label: "Row count", ask: "How many rows does it return?", answerType: "number", answer: res.length, tolerance: 0,
          hint: "In SQL, AND is worked out before OR, just like × before + in maths." },
        { id: "which", label: "Rows returned", ask: `Which ${K} values does it return?`, answerType: "choice", ...ch,
          hint: `Read it as \`${renderCond(a)} OR (${renderCond(b)} AND ${renderCond(c)})\`.` },
      ],
      explanation: `AND binds tighter than OR, so the condition means \`${renderCond(a)} OR (${renderCond(b)} AND ${renderCond(c)})\`.\n\n${t.rows.map((r) => `- ${r[K]}: ${pass(a, r)} OR (${pass(b, r)} AND ${pass(c, r)}) → ${genCond(r, right, {}) ? "**kept**" : "dropped"}`).join("\n")}\n\n**${res.length}** rows: **${alpha(keys)}**. (Reading it left to right, as \`(… OR …) AND …\`, would wrongly give ${alpha(keysOf(naive, K)) || "no rows"}.)`,
      params: { kind: "x-plain", sql, tables: { [t.name]: rawTable(t) }, check: { parts: { rows: { type: "count" }, which: { type: "set", col: 0 } } } },
      hints: [
        "There are no brackets, so precedence decides: AND before OR.",
        `Add the brackets yourself: \`${renderCond(a)} OR (${renderCond(b)} AND ${renderCond(c)})\`.`,
        "For each row, work out the bracket (both parts true?), then OR it with the first test.",
      ],
    };
  }
}

// ---- ORDER BY and LIMIT / expert ----

function xPagination(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(8, 11);
    const t = makeTable(rng, theme, n, rng.int(2, 3));
    const [K, , N1, N2] = t.cols;
    const col = rng.pick([N1, N2]);
    const dir = rng.pick(["ASC", "DESC"]);
    const k = rng.int(2, 4);
    const page = rng.int(2, 3);
    if ((page - 1) * k >= n) continue;
    const base = `SELECT ${K}, ${col}\nFROM ${t.name}\nORDER BY ${col} ${dir}`;
    const order = runTree({ select: [{ col: K }], from: t.name, orderBy: [{ col, dir }] }, { [t.name]: t }).map((r) => String(r[0]));
    const pageRows = order.slice((page - 1) * k, page * k);
    const right = `LIMIT ${k} OFFSET ${(page - 1) * k}`;
    const cands = [`LIMIT ${k} OFFSET ${page * k}`, `LIMIT ${k} OFFSET ${page - 1}`, `LIMIT ${page * k} OFFSET ${k}`, `LIMIT ${k} OFFSET ${(page - 2) * k}`, `LIMIT ${(page - 1) * k} OFFSET ${k}`];
    const pageOf = (cl) => { const m = /LIMIT (\d+) OFFSET (\d+)/.exec(cl); return order.slice(+m[2], +m[2] + +m[1]).join(","); };
    const wrong = rng.shuffle(cands).filter((c) => c !== right && pageOf(c) !== pageRows.join(","));
    const ch = choicesFrom(right, wrong, rng);
    if (!ch) continue;
    return {
      prompt: `${mdTable(t)}\n\nAn app shows this query's results **${k} rows per page**, pages numbered from 1:\n\n\`\`\`sql\n${base}\n\`\`\`\n\n${NOTE} ${NOTE_OFFSET}`,
      answerType: "multi",
      parts: [
        { id: "clause", label: "Clause", ask: `Which clause, added to the end, gives **page ${page}**?`, answerType: "choice", ...ch,
          hint: `Page ${page} skips the rows of the ${page - 1} page${page === 2 ? "" : "s"} before it.` },
        { id: "first", label: "First row", ask: `Which ${K} is the first row on page ${page}? Type it.`, answerType: "text", answer: pageRows[0],
          hint: `Sort all rows by ${col} (${dir === "ASC" ? "smallest" : "largest"} first) and count past the earlier pages.` },
      ],
      explanation: `Page p starts after (p − 1) × ${k} rows, so page ${page} is **${right}**.\n\n- Sorted: ${order.join(", ")}\n- Skip ${(page - 1) * k}, take ${k}: ${pageRows.join(", ")}\n\nFirst row on page ${page}: **${pageRows[0]}**.`,
      params: { kind: "x-page", base, tables: { [t.name]: rawTable(t) }, k, page },
      hints: [
        `LIMIT sets the page size (${k}); OFFSET says how many rows to skip first.`,
        `Rows skipped before page ${page} = (${page} − 1) × ${k}.`,
      ],
    };
  }
}

function xOrderBack(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(5, 7);
    const t = makeTable(rng, theme, n, 2);
    const [K, C, N1, N2] = t.cols;
    const col = rng.pick([N1, N2]);
    const d1 = rng.pick(["ASC", "DESC"]);
    const d2 = rng.pick(["ASC", "DESC"]);
    const T = { [t.name]: t };
    const run = (ob) => runTree({ select: [{ col: K }], from: t.name, orderBy: ob }, T).map((r) => String(r[0])).join(", ");
    const want = run([{ col: C, dir: d1 }, { col, dir: d2 }]);
    const flip = (d) => (d === "ASC" ? "DESC" : "ASC");
    const cl = (ob) => ob.map((o) => `${o.col} ${o.dir}`).join(", ");
    const right = cl([{ col: C, dir: d1 }, { col, dir: d2 }]);
    const cands = [
      [{ col: C, dir: d1 }, { col, dir: flip(d2) }],
      [{ col: C, dir: flip(d1) }, { col, dir: d2 }],
      [{ col, dir: d2 }, { col: C, dir: d1 }],
      [{ col, dir: d2 }],
      [{ col: C, dir: flip(d1) }, { col, dir: flip(d2) }],
    ].filter((ob) => run(ob) !== want).map(cl);
    const ch = choicesFrom(right, rng.shuffle(cands), rng);
    if (!ch) continue;
    const shown = want.split(", ");
    const sql = `SELECT ${K}\nFROM ${t.name}\nORDER BY ?;`;
    return {
      prompt: buildPrompt([t], sql, `The query returned the rows in this order: **${want}**. Which ORDER BY list replaces the \`?\`?`, ["Text sorts alphabetically (A to Z) with ASC."]),
      answer: ch.answer,
      answerType: "choice",
      choices: ch.choices,
      explanation: `In the result, rows with the same ${C} are together, ${d1 === "ASC" ? "A to Z" : "Z to A"}: the first key is **${C} ${d1}**. Inside each ${C}, ${col} goes ${d2 === "ASC" ? "up" : "down"}: the second key is **${col} ${d2}**.\n\n${shown.map((k2, i) => { const r = t.rows.find((x) => String(x[K]) === k2); return `${i + 1}. ${k2} (${r[C]}, ${r[col]})`; }).join("\n")}\n\nAnswer: **${right}**.`,
      params: { kind: "x-orderback", tables: { [t.name]: rawTable(t) }, K, from: t.name, want },
      hints: [
        `Look up each returned row's ${C} and ${col}.`,
        `Are rows with the same ${C} next to each other? Then ${C} is the first sort key; check whether it runs A to Z or Z to A.`,
        `Within each ${C}, does ${col} go up or down? Then test the options against the full order.`,
      ],
    };
  }
}

function xOrderCombo(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(7, 9);
    const t = makeTable(rng, theme, n, rng.int(2, 3));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };
    const col = rng.pick([N1, N2]);
    const other = col === N1 ? N2 : N1;
    const where = randCmp(rng, t, ["num"]);
    if (where.col !== other) continue;
    const d1 = rng.pick(["ASC", "DESC"]);
    const d2 = rng.pick(["ASC", "DESC"]);
    const k = rng.int(2, 4);
    const off = rng.int(1, 3);
    const q = { select: [{ col: K }], from: t.name, where, orderBy: [{ col: C, dir: d1 }, { col, dir: d2 }], limit: k, offset: off };
    const res = runTree(q, T).map((r) => String(r[0]));
    const passing = t.rows.filter((r) => genCond(r, where, T));
    if (res.length < 1) continue;
    const sorted = runTree({ ...q, limit: undefined, offset: undefined }, T).map((r) => String(r[0]));
    return finishX({
      tables: [t], q, notes: [NOTE_OFFSET, "Text sorts alphabetically (A to Z) with ASC."],
      check: { parts: { rows: { type: "count" }, last: { type: "cell", row: res.length - 1, col: 0 } } },
      parts: [
        { id: "rows", label: "Row count", ask: "How many rows does it return?", answerType: "number", answer: res.length, tolerance: 0,
          hint: `After WHERE, skip ${off} sorted row${off === 1 ? "" : "s"}; LIMIT ${k} is a maximum, so you may get fewer.` },
        { id: "last", label: "Last row", ask: `Which ${K} is in the **last** row of the result? Type it.`, answerType: "text", answer: res[res.length - 1],
          hint: `Sort by ${C} first, then by ${col} inside each ${C}.` },
      ],
      explanation: `WHERE, then ORDER BY, then OFFSET and LIMIT.\n\n- Rows passing \`${renderCond(where)}\`: ${passList(t, passing, [C, col])}\n- Sorted (${C} ${d1}, then ${col} ${d2}): ${sorted.join(", ")}\n- Skip ${off}, keep at most ${k}: ${res.join(", ")}\n\n**Row count:** **${res.length}**\n\n**Last row:** **${res[res.length - 1]}**`,
      hints: ["The order of work is WHERE → ORDER BY → OFFSET → LIMIT.", `Two sort keys: ${C} decides first; ${col} only breaks ties within the same ${C}.`],
    });
  }
}

// ---- Aggregates / expert ----

function xHiddenAvg(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(5, 8);
    const t = makeTable(rng, theme, n, rng.int(2, 3));
    const [K, C, N1, N2] = t.cols;
    const col = rng.pick([N1, N2]);
    const cat = rng.pick(t.cats);
    const inCat = t.rows.filter((r) => r[C] === cat);
    if (![2, 4, 5].includes(inCat.length) && !(inCat.length === 3 && rng.next() < 0.3)) continue;
    const avg = aggOf({ agg: "AVG", col }, inCat);
    if (Math.round(avg * 100) / 100 !== avg) continue; // shown exactly
    const hid = rng.pick(inCat);
    const missing = hid[col];
    const total = aggOf({ agg: "SUM", col }, t.rows);
    const shownT = { ...t, rows: t.rows.map((r) => (r === hid ? { ...r, [col]: "?" } : r)) };
    const sql = `SELECT AVG(${col})\nFROM ${t.name}\nWHERE ${C} = '${cat}';`;
    const others = inCat.filter((r) => r !== hid).map((r) => r[col]);
    return {
      prompt: buildPrompt([shownT], sql, `One value is hidden as **?**. This query returns exactly **${num(avg)}**.`, [NOTE_AVG]),
      answerType: "multi",
      parts: [
        { id: "missing", label: "Hidden value", ask: "What is the hidden value?", answerType: "number", answer: missing, tolerance: 0,
          hint: `AVG = sum ÷ count over the ${cat} rows, so their sum is ${num(avg)} × ${inCat.length}.` },
        { id: "sum", label: `SUM(${col})`, ask: `With the hidden value filled in, what would \`SELECT SUM(${col}) FROM ${t.name};\` return?`, answerType: "number", answer: total, tolerance: 0,
          hint: `No WHERE this time: add the ${col} of every row, including the one you found.` },
      ],
      explanation: `- ${cat} rows: ${inCat.length}, so their total is ${num(avg)} × ${inCat.length} = ${num(avg * inCat.length)}.\n- The visible ${cat} values add to ${others.reduce((s, x) => s + x, 0)}${others.length ? ` (${others.join(" + ")})` : ""}, so ? = ${num(avg * inCat.length)} − ${others.reduce((s, x) => s + x, 0)} = **${missing}**.\n- SUM over the whole table: ${t.rows.map((r) => r[col]).join(" + ")} = **${total}**.`,
      params: { kind: "x-hidden", tables: { [t.name]: rawTable(shownT) }, name: t.name, col, avg, sumSql: `SELECT SUM(${col})\nFROM ${t.name};`, sql },
      hints: [
        "Work backwards: an average times the number of rows gives their total.",
        `Count the ${cat} rows, multiply by ${num(avg)}, then take away the ${cat} values you can see.`,
      ],
    };
  }
}

function xSubAgg(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(6, 8);
    const t = makeTable(rng, theme, n, rng.int(2, 3));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };
    const [a, b] = rng.shuffle([N1, N2]);
    const op = rng.pick([">", "<"]);
    const where = { t: "sub", col: a, op, agg: "AVG", aggCol: a, from: t.name };
    const avg = aggOf({ agg: "AVG", col: a }, t.rows);
    if (t.rows.some((r) => r[a] === avg)) continue;
    const rows = t.rows.filter((r) => genCond(r, where, T));
    const dist = new Set(rows.map((r) => r[C])).size;
    if (rows.length < 2 || rows.length === n || dist === rows.length) continue;
    const ext = op === ">" ? "MIN" : "MAX";
    const q = { select: [{ agg: "COUNT", star: true }, { agg: "COUNT", distinct: true, col: C }, { agg: ext, col: b }], from: t.name, where };
    const res = runTree(q, T)[0];
    return finishX({
      tables: [t], q, notes: [NOTE_AVG],
      check: { parts: { count: { type: "cell", row: 0, col: 0 }, dist: { type: "cell", row: 0, col: 1 }, ext: { type: "cell", row: 0, col: 2 } } },
      parts: [
        { id: "count", label: "COUNT(*)", ask: "First column", answerType: "number", answer: res[0], tolerance: 0,
          hint: `The subquery is the mean ${a} of the whole table. Count the rows ${op === ">" ? "above" : "below"} it.` },
        { id: "dist", label: `COUNT(DISTINCT ${C})`, ask: "Second column", answerType: "number", answer: res[1], tolerance: 0,
          hint: `Among those rows, count each different ${C} once.` },
        { id: "ext", label: `${ext}(${b})`, ask: "Third column", answerType: "number", answer: res[2], tolerance: 0,
          hint: `Among those rows, take the ${ext === "MIN" ? "smallest" : "largest"} ${b}. Note it's a different column from the one in WHERE.` },
      ],
      explanation: `- Subquery: AVG(${a}) = (${t.rows.map((r) => r[a]).join(" + ")}) ÷ ${n} ≈ ${num(avg)}\n- Rows with ${a} ${op} ${num(avg)}: ${passList(t, rows, [a, C, b])}\n\n**COUNT(*):** **${res[0]}**\n\n**COUNT(DISTINCT ${C}):** **${res[1]}**\n\n**${ext}(${b}):** **${res[2]}**`,
      hints: ["Run the subquery first: it gives one number for the whole table.", "All three columns then use only the rows that passed the WHERE."],
    });
  }
}

// ---- GROUP BY and JOIN / expert ----

function xJoinHaving(rng) {
  for (;;) {
    const { J, L, R } = makeJoinTables(rng);
    const T = { [L.name]: L, [R.name]: R };
    const [, fk, val] = J.lcols.map((c) => `${L.name}.${c}`);
    const [rk, rn] = J.rcols.map((c) => `${R.name}.${c}`);
    const join = { table: R.name, on: [fk, rk] };
    const base = baseRows({ from: L.name, join }, T);
    const groups = {};
    base.forEach((r) => (groups[r[rn]] ||= []).push(r));
    const names = Object.keys(groups);
    if (names.length < 3) continue;
    const sums = names.map((g) => aggOf({ agg: "SUM", col: val }, groups[g])).sort((x, y) => x - y);
    const i = rng.int(0, sums.length - 2);
    const v = rng.next() < 0.5 ? sums[i] : Math.floor((sums[i] + sums[i + 1]) / 2);
    const hv = { agg: "SUM", col: val, op: rng.pick([">", ">="]), v };
    const q = { select: [{ col: rn }, { agg: "COUNT", star: true }], from: L.name, join, groupBy: rn, having: hv };
    const res = runTree(q, T);
    const kept = res.map((r) => String(r[0]));
    if (!kept.length || kept.length === names.length) continue;
    const keepWith = (h) => alpha(names.filter((g) => CMP[h.op](aggOf(h, groups[g]), h.v)));
    const allR = R.rows.map((r) => r[J.rcols[1]]);
    const wrong = [keepWith({ ...hv, op: FLIP[hv.op] }), alpha(names.filter((g) => !kept.includes(g))), alpha(names), alpha([...kept, ...allR.filter((x) => !names.includes(x)).slice(0, 1)]), alpha(kept.slice(1))];
    const ch = choicesFrom(alpha(kept), wrong.filter((s) => s), rng);
    if (!ch) continue;
    return finishX({
      tables: [L, R], q, notes: [NOTE_SET],
      check: { parts: { rows: { type: "count" }, which: { type: "set", col: 0 } } },
      parts: [
        { id: "rows", label: "Row count", ask: "How many rows does it return?", answerType: "number", answer: kept.length, tolerance: 0,
          hint: "JOIN first (rows with no match disappear), then group, then HAVING keeps or drops whole groups." },
        { id: "which", label: "Groups kept", ask: `Which ${J.rcols[1]} values does it return?`, answerType: "choice", ...ch,
          hint: `For each ${J.rcols[1]}, add the ${J.lcols[2]} of its joined rows and compare with ${v}.` },
      ],
      explanation: `Join, group by ${J.rcols[1]}, then keep groups where SUM(${J.lcols[2]}) ${hv.op} ${v}.\n\n${names.slice().sort().map((g) => `- ${g}: ${groups[g].map((r) => r[val]).join(" + ")} = ${aggOf(hv, groups[g])}${CMP[hv.op](aggOf(hv, groups[g]), v) ? " (kept)" : ""}`).join("\n")}${allR.some((x) => !names.includes(x)) ? `\n- ${allR.filter((x) => !names.includes(x)).join(", ")}: no matching ${L.name} rows, so no group at all` : ""}\n\n**Row count:** **${kept.length}**\n\n**Groups kept:** **${alpha(kept)}**`,
      hints: [
        `Match each ${L.name} row's ${J.lcols[1]} with ${R.name}.${J.rcols[0]}; unmatched rows drop out.`,
        "A name with no matching rows makes no group, so it can never appear in the result.",
        `HAVING SUM(${J.lcols[2]}) ${hv.op} ${v} is tested on each group's total, not on single rows.`,
      ],
    });
  }
}

function xWhereGroup(rng) {
  for (;;) {
    const theme = randomTheme(rng);
    const n = rng.int(7, 9);
    const t = makeTable(rng, theme, n, rng.int(2, 4));
    const [K, C, N1, N2] = t.cols;
    const T = { [t.name]: t };
    const [a, b] = rng.shuffle([N1, N2]);
    const vals = t.rows.map((r) => r[b]).sort((x, y) => x - y);
    const where = { t: "cmp", col: b, op: rng.pick([">", "<"]), v: vals[rng.int(1, vals.length - 2)] };
    const q = { select: [{ col: C }, { agg: "AVG", col: a }], from: t.name, where, groupBy: C, having: { agg: "COUNT", star: true, op: ">=", v: 2 } };
    const res = runTree(q, T);
    if (res.length < 1) continue;
    const passing = t.rows.filter((r) => genCond(r, where, T));
    const pg = {};
    passing.forEach((r) => (pg[r[C]] ||= []).push(r));
    const dropped = Object.keys(pg).filter((g) => pg[g].length < 2);
    if (!dropped.length && rng.next() < 0.6) continue;
    const pick = rng.pick(res);
    if (nearTie(pick[1])) continue;
    return finishX({
      tables: [t], q, notes: [NOTE_AVG],
      check: { parts: { rows: { type: "count" }, val: { type: "group", key: pick[0], col: 1, round: true } } },
      parts: [
        { id: "rows", label: "Row count", ask: "How many rows does it return?", answerType: "number", answer: res.length, tolerance: 0,
          hint: "WHERE removes rows before grouping; HAVING then removes whole groups with fewer than 2 rows." },
        { id: "val", label: `AVG for ${pick[0]}`, ask: `What number appears next to **${pick[0]}**? Round to 2 decimal places.`, answerType: "number", answer: round2(pick[1]), tolerance: 0.005,
          hint: `Average the ${a} of the ${pick[0]} rows that passed the WHERE only.` },
      ],
      explanation: `WHERE first, then GROUP BY, then HAVING.\n\n- Rows passing \`${renderCond(where)}\`: ${passList(t, passing, [C, a])}\n${Object.keys(pg).sort().map((g) => `- ${g}: ${pg[g].length} row${pg[g].length === 1 ? "" : "s"}${pg[g].length >= 2 ? `, AVG(${a}) = (${pg[g].map((r) => r[a]).join(" + ")}) ÷ ${pg[g].length} ≈ ${num(aggOf({ agg: "AVG", col: a }, pg[g]))}` : " → dropped by HAVING"}`).join("\n")}\n\n**Row count:** **${res.length}**\n\n**AVG for ${pick[0]}:** **${round2(pick[1]).toFixed(2)}**`,
      hints: ["WHERE filters rows; HAVING filters groups. Do them in that order.", `Group the surviving rows by ${C} and count each group before averaging.`],
    });
  }
}

function xJoinSub(rng) {
  for (;;) {
    const { J, L, R } = makeJoinTables(rng);
    const T = { [L.name]: L, [R.name]: R };
    const [, fk, val] = J.lcols.map((c) => `${L.name}.${c}`);
    const [rk, rn] = J.rcols.map((c) => `${R.name}.${c}`);
    const join = { table: R.name, on: [fk, rk] };
    const avg = aggOf({ agg: "AVG", col: J.lcols[2] }, L.rows);
    if (L.rows.some((r) => r[J.lcols[2]] === avg)) continue;
    const where = { t: "sub", col: val, op: rng.pick([">", "<"]), agg: "AVG", aggCol: J.lcols[2], from: L.name };
    const q = { select: [{ col: rn }, { agg: "COUNT", star: true }], from: L.name, join, where, groupBy: rn };
    const res = runTree(q, T);
    if (res.length < 2) continue;
    const target = rng.pick(res);
    const joined = baseRows({ from: L.name, join }, T);
    return finishX({
      tables: [L, R], q, notes: [NOTE_AVG],
      check: { parts: { rows: { type: "count" }, count: { type: "group", key: target[0], col: 1 } } },
      parts: [
        { id: "rows", label: "Result rows", ask: "How many rows does the query return?", answerType: "number", answer: res.length, tolerance: 0,
          hint: `The subquery averages ${J.lcols[2]} over the **whole** ${L.name} table, including rows that won't join.` },
        { id: "count", label: `Count for ${target[0]}`, ask: `What number appears next to ${target[0]}?`, answerType: "number", answer: target[1], tolerance: 0,
          hint: `Count ${target[0]}'s joined rows whose ${J.lcols[2]} passes the WHERE.` },
      ],
      explanation: `- Subquery: AVG(${J.lcols[2]}) over all ${L.rows.length} ${L.name} rows = ${num(avg)}\n- Joined rows passing \`${renderCond(where)}\`: ${joined.filter((r) => genCond(r, where, T)).map((r) => `${r[`${L.name}.${J.lcols[0]}`]} (${r[rn]}, ${r[val]})`).join("; ")}\n\nGrouped by ${J.rcols[1]}: ${res.map((r) => `${r[0]} ${r[1]}`).join(", ")}.\n\n**Result rows:** **${res.length}**\n\n**Count for ${target[0]}:** **${target[1]}**`,
      hints: ["Order of work: subquery → JOIN → WHERE → GROUP BY.", `Unmatched ${L.name} rows still count in the subquery's average, but they never reach the result.`],
    });
  }
}

function genExpert(subtopic, rng) {
  const t = rng.int(0, 2);
  if (subtopic === "select-where") return rng.next() < 0.5 ? xThreshold(rng) : xPrecedence(rng);
  if (subtopic === "order-limit") return t === 0 ? xPagination(rng) : t === 1 ? xOrderBack(rng) : xOrderCombo(rng);
  if (subtopic === "aggregates") return rng.next() < 0.5 ? xHiddenAvg(rng) : xSubAgg(rng);
  if (subtopic === "group-join") return t === 0 ? xJoinHaving(rng) : t === 1 ? xWhereGroup(rng) : xJoinSub(rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---- expert verification: fill the gap, run execSql ----

const xget = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);
const sameSet = (res, keys) => res.map((r) => String(r[0])).sort().join(", ") === keys;

function verifyExpert(p, question, answer) {
  if (p.kind === "x-plain") {
    const res = execSql(p.sql, p.tables);
    for (const part of question.parts) {
      const c = p.check.parts[part.id];
      const a = xget(answer, part.id);
      if (!c || a === "" || a === null || a === undefined) return false;
      if (part.answerType === "choice" ? !checkChoice(res, c, part.choices, a) : !checkOne(res, c, a)) return false;
    }
    return true;
  }
  if (p.kind === "x-threshold") {
    // Scan whole numbers well past every value in the table; the fits must form one run.
    const all = Object.values(p.tables)[0].rows.flat().filter((x) => typeof x === "number");
    const fits = [];
    // The tokenizer has no negative numbers; every value is at least 0, so start no lower than 0.
    const L = Math.max(0, Math.min(...all) - 5);
    for (let v = L; v <= Math.max(...all) + 5; v++) {
      if (sameSet(execSql(p.sql.replace("?", String(v)), p.tables), p.keys)) fits.push(v);
    }
    if (!fits.length || fits[fits.length - 1] - fits[0] + 1 !== fits.length) return false;
    if ((L > 0 && fits[0] === L) || fits[fits.length - 1] === Math.max(...all) + 5) return false;
    const lo = Number(xget(answer, "lo")), hi = Number(xget(answer, "hi"));
    return String(xget(answer, "lo") ?? "").trim() !== "" && lo === fits[0] && hi === fits[fits.length - 1];
  }
  if (p.kind === "x-page") {
    const full = execSql(`${p.base};`, p.tables).map((r) => String(r[0]));
    const want = full.slice((p.page - 1) * p.k, p.page * p.k);
    const part = question.parts.find((x) => x.id === "clause");
    const ch = part && part.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    const ok = ch.filter((c) => execSql(`${p.base}\n${c};`, p.tables).map((r) => String(r[0])).join(",") === want.join(","));
    if (ok.length !== 1 || ok[0] !== String(xget(answer, "clause"))) return false;
    return String(xget(answer, "first") ?? "").trim().toLowerCase() === String(want[0]).toLowerCase();
  }
  if (p.kind === "x-orderback") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    const ok = ch.filter((c) => execSql(`SELECT ${p.K}\nFROM ${p.from}\nORDER BY ${c};`, p.tables).map((r) => String(r[0])).join(", ") === p.want);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "x-hidden") {
    const x = Number(xget(answer, "missing"));
    if (!Number.isInteger(x) || String(xget(answer, "missing") ?? "").trim() === "") return false;
    const t = p.tables[p.name];
    const ci = t.cols.indexOf(p.col);
    const filled = { [p.name]: { cols: t.cols, rows: t.rows.map((r) => r.map((v, i) => (i === ci && v === "?" ? x : v))) } };
    const vals = filled[p.name].rows.map((r) => r[ci]);
    if (new Set(vals).size !== vals.length) return false;
    const avg = execSql(p.sql, filled)[0][0];
    if (Math.abs(avg - p.avg) > 1e-9) return false;
    return Number(xget(answer, "sum")) === execSql(p.sumSql, filled)[0][0] && String(xget(answer, "sum") ?? "").trim() !== "";
  }
  return false;
}

// =============================================================================================
// Write the query (write-query). The learner writes SQL for a task over a shown table: typed text,
// or built from blocks (SELECT …, COUNT(…), IN (…) are blocks with a slot for other blocks).
// The task is built as a query tree; the generator works out the intended result with runTree on
// that tree. verify() runs the expected answer and every accepted form with the separate run
// engine below (its own tokenizer, parser and evaluator) and compares, checks that each plausible
// wrong query gives a different result, and checks that the blocks solution serialises to the
// answer. The same run engine powers run(): learners can test their query's output.

const DIFFS = ["easy", "medium", "hard", "expert"];
const WQ_DISTRACTORS = { easy: [0, 1], medium: [2, 3], hard: [4, 6], expert: [6, 10] };
const OP_WORDS = { ">": "more than", "<": "less than", ">=": "at least", "<=": "at most", "=": "is", "<>": "is not" };
const SIDE = { ">": "<", "<": ">", ">=": "<=", "<=": ">=", "=": "=", "<>": "<>" };
const AGG_WORDS = { SUM: "total", AVG: "average", MAX: "highest", MIN: "lowest" };

// One-line SQL for a write-query tree (no semicolon).
function wqSql(q) {
  const out = [`SELECT ${q.star ? "*" : q.select.map(renderItem).join(", ")}`, `FROM ${q.from}`];
  if (q.join) out.push(`INNER JOIN ${q.join.table} ON ${q.join.on[0]} = ${q.join.on[1]}`);
  if (q.where) out.push(`WHERE ${renderCond(q.where)}`);
  if (q.groupBy) out.push(`GROUP BY ${q.groupBy}`);
  if (q.having) out.push(`HAVING ${renderItem(q.having)} ${q.having.op} ${q.having.v}`);
  if (q.orderBy) out.push(`ORDER BY ${q.orderBy.map((o) => `${o.col} ${o.dir}`).join(", ")}`);
  if (q.limit !== undefined) out.push(`LIMIT ${q.limit}`);
  return out.join(" ");
}

// Intended result rows (arrays), via the generator-side evaluator.
function wqWant(q, T) {
  if (!q.star) return runTree(q, T);
  const t = T[q.from];
  return runTree({ ...q, star: false, select: t.cols.map((col) => ({ col })) }, T);
}


// Comparing result sets: in order when the query has ORDER BY, else as a multiset.
const cellEq = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);
const rowEq = (a, b) => a.length === b.length && a.every((v, i) => cellEq(v, b[i]));
function sameRows(a, b, ordered) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  if (ordered) return a.every((r, i) => rowEq(r, b[i]));
  const left = b.slice();
  for (const r of a) {
    const i = left.findIndex((x) => rowEq(r, x));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

// The quiz's text rules (minus sign, trim, spaces, case, spaces around : and ,).
const textNorm = (s) => String(s ?? "").replace(/−/g, "-").trim().replace(/\s+/g, " ").toLowerCase().replace(/\s*([:,])\s*/g, "$1");
// No spaces around comparison signs (a common, equally correct way to type them).
const compactOps = (s) => s.replace(/ (<>|!=|<=|>=|=|<|>) /g, "$1");

// ---- blocks ----

const slotTile = (value, open, close, sep = ", ") => ({ value, label: `${value}${open.trim() ? open.trim() : " "}…${close}`, slot: { open, close, sep } });
const SELECT_TILE = () => ({ value: "SELECT", label: "SELECT …", slot: { open: " ", close: "", sep: ", " } });
const fnTile = (fn) => slotTile(fn, "(", ")");
const IN_TILE = () => ({ value: "IN", label: "IN (…)", slot: { open: " (", close: ")", sep: ", " } });
const plain = (v) => ({ value: String(v), label: String(v) });

// Solution as a tree of tile objects: a tile, or { tile, kids: [...] } for a slot tile.
function itemNode(it) {
  if (!it.agg) return plain(it.col);
  return { tile: fnTile(it.agg), kids: [plain(it.star ? "*" : it.col)] };
}
function condNodes(c) {
  if (c.t === "cmp") return [plain(c.col), plain(c.op), plain(lit(c.v))];
  if (c.t === "and") return [...condNodes(c.a), plain("AND"), ...condNodes(c.b)];
  if (c.t === "in") return [plain(c.col), { tile: IN_TILE(), kids: c.vals.map((v) => plain(lit(v))) }];
  throw new Error("unsupported condition");
}
function solutionNodes(q) {
  const out = [{ tile: SELECT_TILE(), kids: q.star ? [plain("*")] : q.select.map(itemNode) }, plain("FROM"), plain(q.from)];
  if (q.join) out.push(plain("INNER JOIN"), plain(q.join.table), plain("ON"), plain(q.join.on[0]), plain("="), plain(q.join.on[1]));
  if (q.where) out.push(plain("WHERE"), ...condNodes(q.where));
  if (q.groupBy) out.push(plain("GROUP BY"), plain(q.groupBy));
  if (q.having) out.push(plain("HAVING"), itemNode(q.having), plain(q.having.op), plain(q.having.v));
  if (q.orderBy) for (const o of q.orderBy) out.push(plain("ORDER BY"), plain(o.col), plain(o.dir));
  if (q.limit !== undefined) out.push(plain("LIMIT"), plain(q.limit));
  return out;
}

// Flatten the solution tree and distractors into tiles (shuffled) + a solution of tile indices.
function buildBlocks(nodes, distractors, rng) {
  const tiles = [];
  const add = (tile) => { tiles.push(tile); return tiles.length - 1; };
  const walk = (n) => (n.tile ? { t: add(n.tile), kids: n.kids.map(walk) } : add(n));
  const sol = nodes.map(walk);
  distractors.forEach(add);
  const perm = rng.shuffle(tiles.map((_, i) => i)); // perm[newPos] = old index
  const where = [];
  perm.forEach((old, pos) => { where[old] = pos; });
  const remap = (n) => (typeof n === "number" ? where[n] : { t: where[n.t], kids: n.kids.map(remap) });
  return { tiles: perm.map((i) => tiles[i]), joiner: " ", useAll: false, solution: sol.map(remap) };
}

// Serialise a blocks solution (contract: plain → value; slot → value + open + kids + close).
function serialiseBlocks(b) {
  const used = new Set();
  const node = (n, depth) => {
    if (depth > 3) throw new Error("too deep");
    const i = typeof n === "number" ? n : n && n.t;
    if (!Number.isInteger(i) || i < 0 || i >= b.tiles.length || used.has(i)) throw new Error("bad index");
    used.add(i);
    const tile = b.tiles[i];
    if (typeof n === "number") return String(tile.value);
    if (!tile.slot || !Array.isArray(n.kids)) throw new Error("kids under a plain tile");
    return tile.value + tile.slot.open + n.kids.map((k) => node(k, depth + 1)).join(tile.slot.sep ?? ", ") + tile.slot.close;
  };
  const s = b.solution.map((n) => node(n, 1)).join(b.joiner);
  return { s, used };
}

// Pick `count` distinct distractor tiles from a pool (skipping values the solution already uses).
function pickDistractors(pool, solValues, difficulty, maxTiles, rng) {
  const [lo, hi] = WQ_DISTRACTORS[difficulty];
  const seen = new Set(solValues);
  const uniq = [];
  for (const t of pool) {
    const key = t.value + (t.slot ? "(" : "");
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }
  const want = Math.min(rng.int(lo, hi), maxTiles);
  if (uniq.length < lo || want < lo) return null;
  return rng.shuffle(uniq).slice(0, Math.min(want, uniq.length));
}
const solKeys = (nodes) => {
  const out = [];
  const walk = (n) => { if (n.tile) { out.push(n.tile.value + "("); n.kids.forEach(walk); } else out.push(n.value); };
  nodes.forEach(walk);
  return out;
};

// ---- accepted equivalents ----

function acceptsFor(answer, alts) {
  const base = textNorm(answer);
  const seen = new Set([base]);
  const out = [];
  const push = (s) => { const k = textNorm(s); if (out.length < 20 && !seen.has(k)) { seen.add(k); out.push(s); } };
  push(`${answer};`);
  push(compactOps(answer));
  push(`${compactOps(answer)};`);
  for (const a of alts) { push(a); push(`${a};`); }
  for (const a of alts) { push(compactOps(a)); push(`${compactOps(a)};`); }
  return out;
}

// ---- task wording ----

const C = (c) => `\`${c}\``;
function condWords(c) {
  if (c.t === "cmp") return `${C(c.col)} ${c.op === "=" || c.op === "<>" ? OP_WORDS[c.op] : `is ${OP_WORDS[c.op]}`} ${lit(c.v)}`;
  if (c.t === "and") return `${condWords(c.a)} and ${condWords(c.b)}`;
  if (c.t === "in") return `${C(c.col)} is ${c.vals.slice(0, -1).map(lit).join(", ")} or ${lit(c.vals[c.vals.length - 1])}`;
  return "";
}
const itemWords = (it) => (it.agg === "COUNT" ? "the number of rows" : it.agg ? `the ${AGG_WORDS[it.agg]} ${C(it.col)}` : C(it.col));
const listWords = (arr) => (arr.length === 1 ? arr[0] : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`);

function formRules(q, extra) {
  const rules = [
    "Write it on one line, with keywords in capitals and the columns in the order given.",
    "Put text in single quotes, like 'Dog', with one space on each side of comparison signs such as = and >.",
  ];
  if (q.select.some((it) => it.agg) || q.having) rules.push("No spaces inside brackets: COUNT(*), SUM(price).");
  rules.push(...extra);
  rules.push("A semicolon at the end is optional.");
  return rules.join(" ");
}

// ---- the generator ----

function numCmp(rng, t, col) {
  const vals = t.rows.map((r) => r[col]);
  return { t: "cmp", col, op: rng.pick([">", "<", ">=", "<="]), v: rng.pick(vals) };
}
function catCmp(rng, t, ops = ["=", "=", "<>"]) {
  return { t: "cmp", col: t.cols[1], op: rng.pick(ops), v: rng.pick(t.cats) };
}
const mutateCmp = (c, op) => ({ ...c, op });

function genWriteQuery(difficulty, rng) {
  for (let tries = 0; tries < 200; tries++) {
    const q0 = wqBuild(difficulty, rng);
    if (!q0) continue;
    const { q, T, tables, task, extraRules, pool, wrongTrees, alts, hints, notes } = q0;
    const want = wqWant(q, T);
    const ordered = !!q.orderBy;
    if (!want.length) continue;
    // Every plausible wrong query must give a different result, so the task pins one answer.
    if (wrongTrees.some((w) => sameRows(wqWant(w, T), want, ordered && !!w.orderBy))) continue;
    const answer = wqSql(q);
    const nodes = solutionNodes(q);
    const nSol = solKeys(nodes).length;
    const dis = pickDistractors(pool, solKeys(nodes), difficulty, 24 - nSol, rng);
    if (!dis) continue;
    const blocks = buildBlocks(nodes, dis, rng);
    const accepts = acceptsFor(answer, alts.filter((a) => textNorm(a) !== textNorm(answer)));
    const raw = Object.fromEntries(tables.map((t) => [t.name, rawTable(t)]));
    const shown = want.slice(0, 8).map((r) => r.map((v) => (typeof v === "number" ? num(v) : v)).join(" · "));
    return {
      prompt: `${tables.map(mdTable).join("\n\n")}\n\n${task}\n\n${formRules(q, extraRules)}${notes ? ` ${notes}` : ""}`,
      answerType: "text",
      answer,
      accepts,
      blocks,
      runnable: true,
      gradeByOutput: true,
      meta: { tables: raw },
      explanation: `${wqExplain(q)}\n\nAnswer: \`${answer}\`\n\nIt returns ${want.length} row${want.length === 1 ? "" : "s"}${ordered ? ", in this order" : ""}:\n\n${shown.map((x) => `- ${x}`).join("\n")}${want.length > 8 ? "\n- …" : ""}`,
      hints,
      params: { kind: "wq", tables: raw, want, ordered, wrong: wrongTrees.map(wqSql), diff: difficulty },
    };
  }
  throw new Error("write-query: could not build a question");
}

function wqExplain(q) {
  const lines = [`- \`SELECT ${q.star ? "*" : q.select.map(renderItem).join(", ")}\` picks ${q.star ? "every column" : "the columns asked for, in order"}.`, `- \`FROM ${q.from}\` names the table.`];
  if (q.join) lines.push(`- \`INNER JOIN ${q.join.table} ON ${q.join.on[0]} = ${q.join.on[1]}\` pairs rows whose keys match and drops rows with no match.`);
  if (q.where) lines.push(`- \`WHERE ${renderCond(q.where)}\` keeps only the rows asked for.`);
  if (q.groupBy) lines.push(`- \`GROUP BY ${q.groupBy}\` makes one row per ${q.groupBy}.`);
  if (q.having) lines.push(`- \`HAVING ${renderItem(q.having)} ${q.having.op} ${q.having.v}\` keeps only the groups that pass (WHERE can't test an aggregate).`);
  if (q.orderBy) lines.push(`- \`ORDER BY ${q.orderBy[0].col} ${q.orderBy[0].dir}\` sorts ${q.orderBy[0].dir === "ASC" ? "smallest" : "largest"} first.`);
  if (q.limit !== undefined) lines.push(`- \`LIMIT ${q.limit}\` keeps the first ${q.limit} rows.`);
  return `Build it clause by clause, in SQL's order:\n\n${lines.join("\n")}`;
}

const HINT_ORDER = "Clauses go in this order: SELECT, FROM, JOIN … ON, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.";

// Returns the tree and everything around it, or null to redraw.
function wqBuild(difficulty, rng) {
  const theme = randomTheme(rng);
  const nRange = { easy: [4, 5], medium: [5, 7], hard: [6, 8], expert: [6, 9] }[difficulty];

  if (difficulty === "expert" && rng.next() < 0.3) return wqJoin(rng);

  const t = makeTable(rng, theme, rng.int(nRange[0], nRange[1]), rng.int(2, 3));
  const [K, Ccol, N1, N2] = t.cols;
  const T = { [t.name]: t };
  const tn = `**${t.name}**`;
  const otherCat = (v) => t.theme.cats.find((c) => c !== v);

  if (difficulty === "easy") {
    const form = rng.pick(["one", "two", "two", "three", "star"]);
    if (form === "star") {
      const q = { star: true, select: [], from: t.name };
      return {
        q, T, tables: [t],
        task: `Write a query that shows **every column** of every row in ${tn}.`,
        extraRules: [], pool: [plain(K), plain(N1), plain("WHERE")], wrongTrees: [],
        alts: [`SELECT ${t.cols.join(", ")} FROM ${t.name}`],
        hints: ["Every query starts with SELECT (what to show) and FROM (which table).", "There is a one-character shorthand for \"every column\"."],
      };
    }
    const nCols = form === "one" ? 1 : form === "two" ? 2 : 3;
    const cols = rng.shuffle(t.cols).slice(0, nCols);
    const q = { select: cols.map((col) => ({ col })), from: t.name };
    const unused = t.cols.filter((c) => !cols.includes(c));
    const wrong = nCols > 1 ? [{ ...q, select: cols.slice().reverse().map((col) => ({ col })) }] : [{ ...q, select: [{ col: unused[0] }] }];
    return {
      q, T, tables: [t],
      task: `Write a query that shows ${listWords(cols.map(C))} of every row in ${tn}${nCols > 1 ? ", in that column order" : ""}.`,
      extraRules: [], pool: unused.map(plain), wrongTrees: wrong, alts: [],
      hints: ["Every query starts with SELECT (what to show) and FROM (which table).", nCols > 1 ? "Separate the column names with commas, in the order the task lists them." : "Only one column is asked for."],
    };
  }

  if (difficulty === "medium") {
    const nCols = rng.int(1, 2);
    const cols = nCols === 1 ? [K] : [K, rng.pick([N1, N2, Ccol])];
    const both = rng.next() < 0.4;
    const numCol = rng.pick([N1, N2]);
    const a = rng.next() < 0.6 ? numCmp(rng, t, numCol) : catCmp(rng, t);
    let where = a;
    if (both) {
      const b = a.col === Ccol ? numCmp(rng, t, numCol) : catCmp(rng, t, ["=", "<>"]);
      where = { t: "and", a, b };
    }
    const q = { select: cols.map((col) => ({ col })), from: t.name, where };
    const cmps = both ? [where.a, where.b] : [where];
    const wrongTrees = [];
    const pool = [];
    const alts = [];
    const flipAt = (i) => (both
      ? { ...q, where: { ...where, a: i === 0 ? mutateCmp(where.a, FLIP[where.a.op]) : where.a, b: i === 1 ? mutateCmp(where.b, FLIP[where.b.op]) : where.b } }
      : { ...q, where: mutateCmp(where, FLIP[where.op]) });
    cmps.forEach((c, i) => {
      const wrongOp = FLIP[c.op];
      wrongTrees.push(flipAt(i));
      pool.push(plain(wrongOp));
      if (c.v !== undefined && typeof c.v === "number") {
        pool.push(plain({ ">": "<", "<": ">", ">=": "<=", "<=": ">=" }[c.op]));
        pool.push(plain(c.col === N1 ? N2 : N1));
      } else {
        pool.push(plain(lit(otherCat(c.v))), plain(String(c.v)));
      }
    });
    if (both) pool.push(plain("OR"));
    pool.push(plain(t.cols.find((c) => !cols.includes(c) && !cmps.some((x) => x.col === c)) || "ORDER BY"));
    // Equivalents: the number on the left, != for <>, the AND parts swapped.
    const s = wqSql(q);
    for (const c of cmps) {
      const frag = renderCond(c);
      if (typeof c.v === "number") alts.push(s.replace(frag, `${c.v} ${SIDE[c.op]} ${c.col}`));
      if (c.op === "<>") alts.push(s.replace(frag, `${c.col} != ${lit(c.v)}`));
    }
    if (both) alts.push(s.replace(renderCond(where), `${renderCond(where.b)} AND ${renderCond(where.a)}`));
    const res = runTree(q, T);
    if (res.length < 1 || res.length >= t.rows.length) return null;
    return {
      q, T, tables: [t],
      task: `Write a query that shows ${listWords(cols.map(C))} of every row in ${tn} where ${condWords(where)}.`,
      extraRules: [`Use <> for "is not".${both ? " Join the two conditions with AND, in the order given." : ""}`],
      pool, wrongTrees, alts,
      hints: [
        "SELECT and FROM come first; the condition goes after WHERE.",
        "\"more than\" is >, \"less than\" is <, \"at least\" includes the value itself (>=), and \"at most\" too (<=).",
        both ? "Both conditions must hold, so join them with AND." : "Text values need single quotes; numbers don't.",
      ],
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["order", "top", "agg", "agg"]);
    const col = rng.pick([N1, N2]);
    if (kind === "order" || kind === "top") {
      const dir = rng.pick(["ASC", "DESC"]);
      const other = dir === "ASC" ? "DESC" : "ASC";
      const hiLo = dir === "DESC" ? "highest to lowest" : "lowest to highest";
      if (kind === "order") {
        const filt = rng.next() < 0.5 ? catCmp(rng, t, ["="]) : null;
        const q = { select: [{ col: K }, { col }], from: t.name, ...(filt ? { where: filt } : {}), orderBy: [{ col, dir }] };
        const wrongTrees = [{ ...q, orderBy: [{ col, dir: other }] }];
        if (filt) wrongTrees.push({ ...q, where: mutateCmp(filt, "<>") });
        const s = wqSql(q);
        const alts = dir === "ASC" ? [s.replace(" ASC", "")] : [];
        if (filt && runTree(q, T).length < 2) return null;
        return {
          q, T, tables: [t],
          task: `Write a query that shows ${C(K)} and ${C(col)} of every row in ${tn}${filt ? ` where ${condWords(filt)}` : ""}, sorted by ${C(col)} from ${hiLo}.`,
          extraRules: ["Write ASC or DESC after the ORDER BY column."],
          pool: [plain(other), plain(col === N1 ? N2 : N1), plain("GROUP BY"), plain("LIMIT"), plain(K === "name" ? "title" : "name"), plain("HAVING"), ...(filt ? [plain("<>"), plain(lit(otherCat(filt.v)))] : [plain("WHERE")])],
          wrongTrees, alts,
          hints: [HINT_ORDER, "ORDER BY sorts: ASC is smallest first, DESC is largest first."],
        };
      }
      const k = rng.int(2, Math.min(4, t.rows.length - 2));
      const q = { select: [{ col: K }], from: t.name, orderBy: [{ col, dir }], limit: k };
      const s = wqSql(q);
      return {
        q, T, tables: [t],
        task: `Write a query that shows ${C(K)} for the ${k} rows of ${tn} with the ${dir === "DESC" ? "highest" : "lowest"} ${C(col)}, ${dir === "DESC" ? "highest" : "lowest"} first.`,
        extraRules: ["Write ASC or DESC after the ORDER BY column."],
        pool: [plain(other), plain(col === N1 ? N2 : N1), plain(k + 1), plain(k - 1 >= 1 ? k - 1 : k + 2), plain("WHERE"), plain("GROUP BY"), fnTile("MAX")],
        wrongTrees: [{ ...q, orderBy: [{ col, dir: other }] }, { ...q, limit: k + 1 }],
        alts: dir === "ASC" ? [s.replace(" ASC", "")] : [],
        hints: [HINT_ORDER, "Sort first with ORDER BY, then LIMIT keeps only the top rows."],
      };
    }
    // aggregate
    const agg = rng.pick(["COUNT", "SUM", "AVG", "MAX", "MIN"]);
    const where = agg === "COUNT" || rng.next() < 0.6 ? (rng.next() < 0.5 ? numCmp(rng, t, rng.pick([N1, N2])) : catCmp(rng, t)) : null;
    if (where && where.col === col && agg !== "COUNT") return null;
    const it = agg === "COUNT" ? { agg, star: true } : { agg, col };
    const q = { select: [it], from: t.name, ...(where ? { where } : {}) };
    const rows = where ? t.rows.filter((r) => genCond(r, where, T)) : t.rows;
    if (!rows.length || (where && rows.length === t.rows.length)) return null;
    if (agg !== "COUNT" && rows.length < 2) return null;
    const others = ["SUM", "AVG", "MAX", "MIN", "COUNT"].filter((a) => a !== agg);
    const wrongTrees = [];
    if (agg !== "COUNT") for (const a of ["SUM", "AVG", "MAX", "MIN"].filter((x) => x !== agg)) wrongTrees.push({ ...q, select: [{ agg: a, col }] });
    if (where) wrongTrees.push({ ...q, where: mutateCmp(where, FLIP[where.op]) });
    if (agg !== "COUNT") wrongTrees.push({ ...q, select: [{ agg, col: col === N1 ? N2 : N1 }] });
    const s = wqSql(q);
    const alts = [];
    if (where && typeof where.v === "number") alts.push(s.replace(renderCond(where), `${where.v} ${SIDE[where.op]} ${where.col}`));
    if (where && where.op === "<>") alts.push(s.replace(renderCond(where), `${where.col} != ${lit(where.v)}`));
    const what = agg === "COUNT" ? "the number of rows" : `the ${AGG_WORDS[agg]} ${C(col)}`;
    return {
      q, T, tables: [t],
      task: `Write a query that returns ${what} in ${tn}${where ? ` where ${condWords(where)}` : ""}, as a single number.${agg === "COUNT" ? " Count rows with `*`." : ""}`,
      extraRules: where ? ['Use <> for "is not".'] : [],
      pool: [...others.slice(0, 3).map(fnTile), plain("*"), plain(col === N1 ? N2 : N1), plain(col), plain("GROUP BY"), plain("HAVING"), ...(where ? [plain(FLIP[where.op])] : [plain("WHERE")])],
      wrongTrees, alts,
      hints: [
        "An aggregate function goes in the SELECT list and turns many rows into one value.",
        "COUNT counts rows, SUM adds, AVG takes the mean, MAX and MIN pick the largest and smallest.",
        where ? "The WHERE filter runs before the aggregate." : "There is no filter: every row is used.",
      ],
      notes: agg === "AVG" ? NOTE_AVG : "",
    };
  }

  // expert (single table): GROUP BY [HAVING], or IN.
  const kind = rng.pick(["group", "having", "having", "in"]);
  if (kind === "in") {
    const vals = rng.shuffle(t.cats).slice(0, 2);
    if (t.cats.length < 3) return null;
    const col = rng.pick([N1, N2]);
    const dir = rng.pick(["ASC", "DESC"]);
    const where = { t: "in", col: Ccol, vals };
    const q = { select: [{ col: K }, { col }], from: t.name, where, orderBy: [{ col, dir }] };
    const rest = t.cats.find((c) => !vals.includes(c));
    const s = wqSql(q);
    const frag = renderCond(where);
    const alts = [
      s.replace(frag, `${Ccol} IN (${lit(vals[1])}, ${lit(vals[0])})`),
      s.replace(frag, `(${Ccol} = ${lit(vals[0])} OR ${Ccol} = ${lit(vals[1])})`),
      s.replace(frag, `${Ccol} = ${lit(vals[0])} OR ${Ccol} = ${lit(vals[1])}`),
      ...(dir === "ASC" ? [s.replace(" ASC", "")] : []),
    ];
    return {
      q, T, tables: [t],
      task: `Write a query that shows ${C(K)} and ${C(col)} of every row in ${tn} whose ${condWords(where)}, sorted by ${C(col)} from ${dir === "DESC" ? "highest to lowest" : "lowest to highest"}.`,
      extraRules: ["Use IN with the values in the order given, and write ASC or DESC after the ORDER BY column."],
      pool: [plain("="), plain("OR"), plain(lit(rest)), plain(dir === "ASC" ? "DESC" : "ASC"), plain(col === N1 ? N2 : N1), plain("GROUP BY"), plain("HAVING"), plain("LIMIT"), plain("AND"), fnTile("COUNT"), plain(String(vals[0]))],
      wrongTrees: [{ ...q, where: { t: "in", col: Ccol, vals: [vals[0], rest] } }, { ...q, orderBy: [{ col, dir: dir === "ASC" ? "DESC" : "ASC" }] }],
      alts,
      hints: [HINT_ORDER, "`col IN (a, b)` is true when col equals any value in the list.", "The filter goes in WHERE, before ORDER BY."],
    };
  }
  const agg = rng.pick(["COUNT", "SUM", "MAX", "MIN"]);
  const col = rng.pick([N1, N2]);
  const it = agg === "COUNT" ? { agg, star: true } : { agg, col };
  const q = { select: [{ col: Ccol }, it], from: t.name, groupBy: Ccol };
  const groups = new Map();
  t.rows.forEach((r) => groups.set(r[Ccol], [...(groups.get(r[Ccol]) || []), r]));
  if (groups.size < 2) return null;
  const wrongTrees = [];
  if (agg !== "COUNT") wrongTrees.push(...["SUM", "MAX", "MIN"].filter((a) => a !== agg).map((a) => ({ ...q, select: [{ col: Ccol }, { agg: a, col }] })));
  else wrongTrees.push({ ...q, select: [{ col: Ccol }, { agg: "SUM", col }] });
  let hv = null;
  if (kind === "having") {
    const vals = [...groups.values()].map((g) => aggOf(it, g));
    const op = rng.pick([">", ">=", "<", "<="]);
    const v = rng.pick(vals);
    const pass = vals.filter((x) => CMP[op](x, v)).length;
    if (pass < 1 || pass >= vals.length) return null;
    hv = { ...it, op, v };
    q.having = hv;
    wrongTrees.push({ ...q, having: { ...hv, op: FLIP[op] } });
  }
  const s = wqSql(q);
  const alts = hv ? [s.replace(`${renderItem(hv)} ${hv.op} ${hv.v}`, `${hv.v} ${SIDE[hv.op]} ${renderItem(hv)}`)] : [];
  const testWords = hv ? ` Only include groups where ${itemWords(it)} is ${OP_WORDS[hv.op]} ${hv.v}.` : "";
  return {
    q, T, tables: [t],
    task: `For each ${C(Ccol)} in ${tn}, write a query that shows ${C(Ccol)} and ${itemWords(it)} for that ${C(Ccol)}.${testWords}${agg === "COUNT" ? " Count rows with `*`." : ""}`,
    extraRules: [],
    pool: [plain("WHERE"), plain(hv ? "ORDER BY" : "HAVING"), ...["COUNT", "SUM", "AVG", "MAX", "MIN"].filter((a) => a !== agg).map(fnTile), plain(K), plain(col === N1 ? N2 : N1), plain("*"), plain(col), plain("DISTINCT"), ...(hv ? [plain(FLIP[hv.op]), plain(hv.v + 1)] : [plain("LIMIT")])],
    wrongTrees, alts,
    hints: [
      HINT_ORDER,
      `GROUP BY ${"`"}col${"`"} makes one result row per different value; the aggregate is worked out per group.`,
      hv ? "A test on an aggregate can't go in WHERE (that runs before grouping): it goes in HAVING, after GROUP BY." : "The grouped column also goes in the SELECT list, before the aggregate.",
    ],
  };
}

// Expert JOIN: two tables, qualified column names.
function wqJoin(rng) {
  const { J, L, R } = makeJoinTables(rng);
  const T = { [L.name]: L, [R.name]: R };
  const [lab, fk, val] = J.lcols.map((c) => `${L.name}.${c}`);
  const [rk, rn] = J.rcols.map((c) => `${R.name}.${c}`);
  const join = { table: R.name, on: [fk, rk] };
  const vals = L.rows.map((r) => r[J.lcols[2]]);
  const withWhere = rng.next() < 0.5;
  const where = withWhere ? { t: "cmp", col: val, op: rng.pick([">", "<", ">=", "<="]), v: rng.pick(vals) } : null;
  const q = { select: [{ col: lab }, { col: rn }], from: L.name, join, ...(where ? { where } : {}) };
  const res = runTree(q, T);
  const all = runTree({ ...q, where: undefined }, T);
  if (res.length < 1 || (where && res.length === all.length)) return null;
  if (!where && all.length === L.rows.length) return null; // let the JOIN drop a row
  const s = wqSql(q);
  const swapped = s.replace(`ON ${fk} = ${rk}`, `ON ${rk} = ${fk}`);
  const alts = [swapped, s.replace("INNER JOIN", "JOIN"), swapped.replace("INNER JOIN", "JOIN")];
  if (where) alts.push(s.replace(renderCond(where), `${where.v} ${SIDE[where.op]} ${where.col}`));
  const wrongTrees = [{ ...q, select: [{ col: lab }, { col: fk }] }];
  if (where) wrongTrees.push({ ...q, where: mutateCmp(where, FLIP[where.op]) });
  return {
    q, T, tables: [L, R],
    task: `Write a query that shows ${C(lab)} and ${C(rn)} for every **${L.name}** row that has a matching **${R.name}** row (matching ${C(fk)} with ${C(rk)})${where ? `, where ${condWords(where)}` : ""}.`,
    extraRules: [`Write INNER JOIN, put the table name in front of every column (like ${val}), and in ON put the ${L.name} column first.`],
    pool: [plain("LEFT JOIN"), plain("WHERE"), plain(fk), plain(rk), plain(val), plain(`${L.name}.${J.rcols[1]}`), plain(R.name === "customers" ? "orders.name" : `${R.name}.${J.lcols[0]}`), plain("GROUP BY"), plain("USING"), plain("AND"), ...(where ? [plain(FLIP[where.op])] : [plain("ORDER BY")])],
    wrongTrees, alts,
    hints: [
      HINT_ORDER,
      `The JOIN goes straight after FROM ${L.name}: name the other table, then ON and the two key columns that must be equal.`,
      "With two tables, write every column as table.column so the database knows which table you mean.",
    ],
  };
}

// ---- verify for write-query ----

function verifyWriteQuery(question, answer) {
  const p = question.params;
  if (typeof question.answer !== "string" || typeof answer !== "string" || !answer.trim()) return false;
  if (!question.runnable || !question.meta || !question.meta.tables) return false;
  // Blocks: valid tree, serialises to the answer, distractor count fits the level.
  const b = question.blocks;
  if (!b || !Array.isArray(b.tiles) || b.tiles.length < 2 || b.tiles.length > 24) return false;
  const { s, used } = serialiseBlocks(b);
  if (s !== question.answer) return false;
  const [lo, hi] = WQ_DISTRACTORS[p.diff];
  const extra = b.tiles.length - used.size;
  if (extra < lo || extra > hi) return false;
  // The answer and every accepted form run to the intended result.
  const acc = Array.isArray(question.accepts) ? question.accepts : [];
  if (acc.length > 20) return false;
  const forms = [question.answer, ...acc];
  if (new Set(forms.map(textNorm)).size !== forms.length) return false;
  for (const f of forms) {
    const r = execQuery(f, p.tables);
    if (!sameRows(r.rows, p.want, p.ordered)) return false;
  }
  // Each plausible wrong query runs to something else (or fails).
  for (const w of p.wrong) {
    let r = null;
    try { r = execQuery(w, p.tables); } catch { r = null; }
    if (r && sameRows(r.rows, p.want, p.ordered)) return false;
  }
  return forms.map(textNorm).includes(textNorm(answer));
}

// Learners test their query: { columns, rows } (at most 200 rows) or { error }. Never throws.
// The engine itself lives in js/lib/sql.js.
export function run(question, answerString) {
  if (!question || question.runnable !== true) return { error: "This question can't be run." };
  return runQuery((question.meta && question.meta.tables) || (question.params && question.params.tables), answerString);
}

// =============================================================================================
// grade(): output grading for write-query (engine hook; called only when the text and accepts
// check fails and the question has gradeByOutput). A query counts when it runs to the intended
// result (in order only when the task asks for an order), uses no literal value that the task
// didn't state (the literals in the expected answer), and still matches the expected query on
// reshuffled copies of the tables, so a query that only fits this table by coincidence fails.
// Returns { correct, note } or null (not a write-query question). Never throws.

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const litText = (v) => (typeof v === "number" ? String(v) : `'${v}'`);

// Literal values used in a parsed query (parseQuery tree), with what they're for.
function queryLiterals(q) {
  const out = [];
  const opd = (o) => { if (o && "lit" in o) out.push({ v: o.lit }); };
  const cond = (c) => {
    if (!c) return;
    if (c.not) return cond(c.not);
    if (c.and || c.or) return (c.and || c.or).forEach(cond);
    opd(c.left);
    opd(c.right);
    (c.between || []).forEach(opd);
    (c.inVals || []).forEach((v) => out.push({ v }));
    if (c.like !== undefined) out.push({ v: c.like, like: true });
  };
  cond(q.where);
  cond(q.having);
  if (q.limit !== undefined) out.push({ v: q.limit, limit: true });
  if (q.offset !== undefined && q.offset !== 0) out.push({ v: q.offset });
  return out;
}

// Deterministic table variants: rows reversed; non-key columns rotated against each other (each
// alone, and all together by different steps), so columns stop lining up as they did; and each
// number column shifted so that each number the task gives sits at its quarter marks, so a
// condition on the wrong column or with the wrong sign stops matching. Rotations keep each
// column's values and shifts keep their spacing, so no new ties appear. Join key columns (*_id)
// are never shifted.
function tableVariants(tables, givenNums) {
  const names = Object.keys(tables);
  const longest = Math.max(...names.map((n) => tables[n].rows.length));
  const make = (shiftOf, rev, add = () => 0) => Object.fromEntries(names.map((n) => {
    const src = rev ? tables[n].rows.slice().reverse() : tables[n].rows;
    const len = src.length;
    return [n, { cols: tables[n].cols.slice(), rows: src.map((r, i) => r.map((v, j) => {
      const x = j === 0 || !len ? v : src[(i + shiftOf(j)) % len][j];
      return typeof x === "number" ? x + add(n, j) : x;
    })) }];
  }));
  const out = [make(() => 0, true)];
  for (let k = 1; k < longest; k++) {
    out.push(make((j) => j * k, false), make((j) => j * k, true));
    for (let c = 1; c < 4; c++) out.push(make((j) => (j === c ? k : 0), false));
  }
  for (const n of names) {
    const t = tables[n];
    t.cols.forEach((col, j) => {
      if (j === 0 || /_id$/i.test(col) || !t.rows.length || !t.rows.every((r) => typeof r[j] === "number")) return;
      const vals = t.rows.map((r) => r[j]).sort((a, b) => a - b);
      const marks = [...new Set([1, 2, 3].map((q) => vals[Math.floor((vals.length * q) / 4)]))];
      for (const L of givenNums) for (const m of marks) {
        const add = (tn, jj) => (tn === n && jj === j ? L - m : 0);
        out.push(make(() => 0, false, add), make((jj) => jj, false, add));
      }
    });
  }
  return out;
}

function mismatchNote(got, want, ordered) {
  const head = "Your query runs, but its result isn't what the task asks for:";
  const gc = got[0] ? got[0].length : 0, wc = want[0] ? want[0].length : 0;
  if (got.length && want.length && gc !== wc) return `${head} it shows ${plural(gc, "column")}, and the task asks for ${wc}.`;
  if (got.length !== want.length) return `${head} it returns ${plural(got.length, "row")}, and the task's result has ${want.length}.`;
  if (ordered && sameRows(got, want, false)) return `${head} the rows are right, but not in the order the task asks for.`;
  return `${head} some of the values are different.`;
}

export function grade(question, answerString) {
  try {
    if (!question || question.answerType !== "text" || question.runnable !== true || typeof question.answer !== "string") return null;
    const p = question.params;
    if (p && p.kind !== undefined && p.kind !== "wq") return null;
    const tables = (question.meta && question.meta.tables) || (p && p.tables);
    if (!tables || typeof tables !== "object") return null;
    const src = typeof answerString === "string" ? answerString : "";
    if (!src.trim()) return { correct: false, note: "Type a query first." };
    if (src.length > 2000) return { correct: false, note: "That query is too long (2000 characters at most)." };
    const ordered = p && typeof p.ordered === "boolean" ? p.ordered : /\bORDER\s+BY\b/i.test(question.answer);
    let parsed, got;
    try {
      parsed = parseQuery(src);
      got = execQuery(src, tables).rows;
    } catch (e) {
      const m = e instanceof SqlError ? e.message : "it couldn't be read";
      return { correct: false, note: `Your query didn't run: ${m}.` };
    }
    const want = p && Array.isArray(p.want) ? p.want : execQuery(question.answer, tables).rows;
    if (!sameRows(got, want, ordered)) return { correct: false, note: mismatchNote(got, want, ordered) };
    // Hard-coded values: every literal must be one the task states (those in the expected answer).
    const given = tokenize(question.answer).filter((x) => x.k === "num" || x.k === "str").map((x) => x.v);
    const givenLimit = parseQuery(question.answer).limit;
    const isGiven = (l) => (l.limit ? l.v === givenLimit : given.some((g) => (typeof g === "number"
      ? typeof l.v === "number" && Math.abs(g - l.v) < 1e-9
      : typeof l.v === "string" && (l.like ? g.toLowerCase() === l.v.toLowerCase() : g === l.v))));
    const extra = [];
    for (const l of queryLiterals(parsed)) if (!isGiven(l) && !extra.some((x) => x.v === l.v && !x.limit === !l.limit)) extra.push(l);
    if (extra.length) {
      const vals = extra.filter((l) => !l.limit).map((l) => litText(l.v));
      const list = vals.length === 1 ? vals[0] : `${vals.slice(0, -1).join(", ")} or ${vals[vals.length - 1]}`;
      const lim = extra.find((l) => l.limit);
      const parts = [];
      if (vals.length) parts.push(`the task didn't give ${list}, so write the condition it describes instead`);
      if (lim) parts.push(`the task doesn't ask for a limit, so leave out LIMIT ${lim.v}`);
      return { correct: false, note: `Hard-coded values: ${parts.join("; and ")}. The output matches this table, but not because the query does what the task asks.` };
    }
    // Coincidence check: same result as the expected query on reshuffled tables.
    for (const v of tableVariants(tables, given.filter((x) => typeof x === "number"))) {
      const ref = execQuery(question.answer, v).rows;
      let mine = null;
      try { mine = execQuery(src, v).rows; } catch { mine = null; }
      if (!mine || !sameRows(mine, ref, ordered)) {
        return { correct: false, note: "The output matches this table only by coincidence: with the same values reshuffled between rows it gives a different result. Check that each condition uses the column and comparison the task describes." };
      }
    }
    return { correct: true, note: "Output matches the expected result." };
  } catch {
    return null;
  }
}
