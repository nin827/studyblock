// Shared SQL knowledge for StudyBlock: render and run the small SQL the app teaches.
// Pure ES module: no DOM, no rng, no eval. Raw tables are { name: { cols: [..], rows: [[..], ..] } }
// (one array per row); the build side uses object-row tables { name, cols, rows: [{col: v}] }.
//
// 1. BUILD (used by generate)   lit, renderCond, renderItem, renderSql, runTree, genCond, aggOf, baseRows, CMP, rawTable
//      A generator describes a query as a tree ({ select, from, join, where, groupBy, having,
//      orderBy, limit, offset }); renderSql prints it as SQL text and runTree evaluates it.
//      Conditions: cmp, between, in, not, sub, and, or.
// 2. RUN (executor)             SqlError, tokenize, parseQuery, execQuery, runQuery
//      The engine for what "Write the query" teaches: SELECT [DISTINCT] cols | * | COUNT, SUM, AVG,
//      MIN, MAX [AS alias], FROM t [INNER JOIN u ON a = b], WHERE (AND/OR/NOT, comparisons, IN,
//      BETWEEN, LIKE), GROUP BY, HAVING, ORDER BY, LIMIT [OFFSET]. Keywords and names ignore case;
//      text compares exactly; no NULLs. Failures throw SqlError with a learner-readable message.
//      execQuery(src, tables) -> { columns, rows }; runQuery(tables, src) -> { columns, rows }
//      (<= 200 rows) or { error }, and never throws.
//
// Checks (verify, result comparison) stay in each module: they are written there on purpose, so
// verify never shares the executor that generate used.

// ---- 1. BUILD ----

// Object-row table -> raw rows.
export const rawTable = (t) => ({ cols: t.cols.slice(), rows: t.rows.map((r) => t.cols.map((c) => r[c])) });

export const lit = (v) => (typeof v === "number" ? String(v) : `'${v}'`);

export function renderCond(c, top = true) {
  let s;
  if (c.t === "cmp") s = `${c.col} ${c.op} ${lit(c.v)}`;
  else if (c.t === "between") s = `${c.col} BETWEEN ${c.lo} AND ${c.hi}`;
  else if (c.t === "in") s = `${c.col} IN (${c.vals.map(lit).join(", ")})`;
  else if (c.t === "not") return `NOT (${renderCond(c.a, true)})`;
  else if (c.t === "sub") s = `${c.col} ${c.op} (SELECT ${c.agg}(${c.aggCol}) FROM ${c.from})`;
  else s = `${renderCond(c.a, false)} ${c.t.toUpperCase()} ${renderCond(c.b, false)}`;
  return !top && (c.t === "and" || c.t === "or") ? `(${s})` : s;
}

export const renderItem = (it) => (it.agg ? `${it.agg}(${it.star ? "*" : `${it.distinct ? "DISTINCT " : ""}${it.col}`})` : it.col);

export function renderSql(q) {
  const lines = [`SELECT ${q.select.map(renderItem).join(", ")}`, `FROM ${q.from}`];
  if (q.join) lines.push(`INNER JOIN ${q.join.table} ON ${q.join.on[0]} = ${q.join.on[1]}`);
  if (q.where) lines.push(`WHERE ${renderCond(q.where)}`);
  if (q.groupBy) lines.push(`GROUP BY ${q.groupBy}`);
  if (q.having) lines.push(`HAVING ${renderItem(q.having)} ${q.having.op} ${q.having.v}`);
  if (q.orderBy) lines.push(`ORDER BY ${q.orderBy.map((o) => `${o.col} ${o.dir}`).join(", ")}`);
  if (q.limit !== undefined) lines.push(`LIMIT ${q.limit}${q.offset ? ` OFFSET ${q.offset}` : ""}`);
  return lines.join("\n") + ";";
}

export const CMP = { "=": (a, b) => a === b, "<>": (a, b) => a !== b, "<": (a, b) => a < b, ">": (a, b) => a > b, "<=": (a, b) => a <= b, ">=": (a, b) => a >= b };

export function aggOf(it, rows) {
  if (it.agg === "COUNT") return it.star ? rows.length : it.distinct ? new Set(rows.map((r) => r[it.col])).size : rows.length;
  const vals = rows.map((r) => r[it.col]);
  if (it.agg === "SUM") return vals.reduce((a, b) => a + b, 0);
  if (it.agg === "AVG") return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (it.agg === "MIN") return Math.min(...vals);
  if (it.agg === "MAX") return Math.max(...vals);
  return NaN;
}

export function genCond(row, c, T) {
  if (c.t === "cmp") return CMP[c.op](row[c.col], c.v);
  if (c.t === "in") return c.vals.includes(row[c.col]);
  if (c.t === "between") return row[c.col] >= c.lo && row[c.col] <= c.hi;
  if (c.t === "and") return genCond(row, c.a, T) && genCond(row, c.b, T);
  if (c.t === "or") return genCond(row, c.a, T) || genCond(row, c.b, T);
  if (c.t === "not") return !genCond(row, c.a, T);
  if (c.t === "sub") return CMP[c.op](row[c.col], aggOf({ agg: c.agg, col: c.aggCol }, T[c.from].rows));
  return false;
}

// Rows of the FROM (and JOIN) as objects; join rows use qualified "table.col" keys.
export function baseRows(q, T) {
  if (!q.join) return T[q.from].rows.map((r) => ({ ...r }));
  const L = T[q.from], R = T[q.join.table];
  const out = [];
  L.rows.forEach((l) => R.rows.forEach((r) => {
    const o = {};
    L.cols.forEach((c) => { o[`${L.name}.${c}`] = l[c]; });
    R.cols.forEach((c) => { o[`${R.name}.${c}`] = r[c]; });
    if (o[q.join.on[0]] === o[q.join.on[1]]) out.push(o);
  }));
  return out;
}

// Result rows as arrays, in output order.
export function runTree(q, T) {
  let rows = baseRows(q, T);
  if (q.where) rows = rows.filter((r) => genCond(r, q.where, T));
  let out;
  if (q.groupBy) {
    const groups = new Map();
    rows.forEach((r) => { const k = r[q.groupBy]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    out = [];
    for (const [k, g] of groups) {
      if (q.having && !CMP[q.having.op](aggOf(q.having, g), q.having.v)) continue;
      out.push(q.select.map((it) => (it.agg ? aggOf(it, g) : k)));
    }
  } else if (q.select.some((it) => it.agg)) {
    out = [q.select.map((it) => aggOf(it, rows))];
  } else {
    if (q.orderBy) {
      rows = rows.slice().sort((a, b) => {
        for (const o of q.orderBy) {
          const x = a[o.col], y = b[o.col];
          if (x !== y) return (x < y ? -1 : 1) * (o.dir === "DESC" ? -1 : 1);
        }
        return 0;
      });
    }
    out = rows.map((r) => q.select.map((it) => r[it.col]));
  }
  if (q.limit !== undefined) out = out.slice(q.offset || 0, (q.offset || 0) + q.limit);
  return out;
}

// ---- 2. RUN ----

export class SqlError extends Error {}
const sqlFail = (m) => { throw new SqlError(m); };
const R_KW = new Set(["SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE", "ORDER", "BY", "ASC", "DESC", "LIMIT",
  "OFFSET", "GROUP", "HAVING", "INNER", "JOIN", "ON", "AS", "DISTINCT", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "NULL", "IS", "USING"]);
const R_FN = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);
const CLAUSE_WORDS = new Set(["SELECT", "FROM", "WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "JOIN", "INNER", "ON"]);
const ORDER_MSG = "clauses go in the order SELECT, FROM, JOIN … ON, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT";

export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "'" || ch === "‘" || ch === "’") {
      let j = i + 1, v = "";
      for (;;) {
        if (j >= src.length) sqlFail("a text value is missing its closing quote '");
        const c = src[j];
        if (c === "'" || c === "‘" || c === "’") {
          if (src[j + 1] === "'") { v += "'"; j += 2; continue; }
          break;
        }
        v += c;
        j++;
      }
      out.push({ k: "str", v, text: src.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (ch === '"' || ch === "“" || ch === "”") sqlFail("put text in single quotes, like 'Dog' (double quotes mean a column name)");
    const prev = out[out.length - 1];
    const negOk = ch === "-" && /[0-9.]/.test(src[i + 1] || "") && (!prev || prev.k === "op" || prev.k === "kw" || (prev.k === "sym" && prev.v !== ")"));
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || "")) || negOk || ch === "−") {
      let j = i + (ch === "-" || ch === "−" ? 1 : 0);
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = Number(text.replace("−", "-"));
      if (!Number.isFinite(v) || /\..*\./.test(text)) sqlFail(`"${text}" isn't a number`);
      if (/[A-Za-z_]/.test(src[j] || "")) sqlFail(`"${text}${src[j]}…" isn't a number or a name`);
      out.push({ k: "num", v, text });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      if (src[j] === "." && /[A-Za-z_*]/.test(src[j + 1] || "")) {
        j++;
        if (src[j] === "*") j++;
        else while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      }
      const w = src.slice(i, j);
      const up = w.toUpperCase();
      if (R_KW.has(up)) out.push({ k: "kw", v: up, text: w });
      else if (R_FN.has(up)) out.push({ k: "fn", v: up, text: w });
      else out.push({ k: "id", v: w, text: w });
      i = j;
      continue;
    }
    const two = src.substr(i, 2);
    if (two === "<>" || two === "!=" || two === "<=" || two === ">=") { out.push({ k: "op", v: two === "!=" ? "<>" : two, text: two }); i += 2; continue; }
    if (two === "==") sqlFail("SQL uses a single = to compare");
    if (ch === "=" || ch === "<" || ch === ">") { out.push({ k: "op", v: ch, text: ch }); i++; continue; }
    if (ch === "≠") { out.push({ k: "op", v: "<>", text: ch }); i++; continue; }
    if (ch === "≤" || ch === "≥") { out.push({ k: "op", v: ch === "≤" ? "<=" : ">=", text: ch }); i++; continue; }
    if ("(),;*".includes(ch)) { out.push({ k: "sym", v: ch, text: ch }); i++; continue; }
    sqlFail(`unexpected character "${ch}"`);
  }
  return out;
}

export function parseQuery(src) {
  const tk = tokenize(src);
  let p = 0;
  const t = () => tk[p];
  const near = () => (t() ? ` near "${t().text}"` : " at the end");
  const isKw = (v) => t() && t().k === "kw" && t().v === v;
  const isSym = (v) => t() && t().k === "sym" && t().v === v;
  const needKw = (v, what) => { if (!isKw(v)) sqlFail(`expected ${what || v}${near()}`); p++; };
  const needSym = (v, what) => { if (!isSym(v)) sqlFail(`expected ${what || `"${v}"`}${near()}`); p++; };
  const colName = (what = "a column name") => {
    const x = t();
    if (x && x.k === "id") { p++; return { col: x.v }; }
    if (x && x.k === "kw") sqlFail(`expected ${what}${near()}${CLAUSE_WORDS.has(x.v) ? ` (${x.v} is a keyword)` : ""}`);
    if (x && x.k === "str") sqlFail(`expected ${what} but found the text ${x.text}; column names don't take quotes`);
    sqlFail(`expected ${what}${near()}`);
  };
  const fnCall = () => {
    const fn = t().v;
    p++;
    needSym("(", `"(" after ${fn}`);
    let star = false, distinct = false, col = null;
    if (isSym("*")) {
      if (fn !== "COUNT") sqlFail(`${fn}(*) isn't allowed: only COUNT(*) counts rows; give ${fn} a column`);
      p++;
      star = true;
    } else {
      if (isKw("DISTINCT")) { p++; distinct = true; }
      col = colName("a column inside the brackets").col;
    }
    needSym(")", `")" to close ${fn}(`);
    return { fn, star, distinct, col };
  };
  const operand = () => {
    const x = t();
    if (!x) sqlFail("the condition stops too early");
    if (x.k === "num" || x.k === "str") { p++; return { lit: x.v }; }
    if (x.k === "fn") return { agg: fnCall() };
    if (x.k === "kw" && x.v === "NULL") sqlFail("these tables have no NULL values");
    return colName("a column name, a number or 'text'");
  };
  const literal = () => {
    const x = t();
    if (x && (x.k === "num" || x.k === "str")) { p++; return x.v; }
    sqlFail(`expected a number or 'text'${near()}`);
  };
  function primary() {
    if (isKw("NOT")) { p++; return { not: primary() }; }
    if (isSym("(")) { p++; const c = orExpr(); needSym(")", '")" to close the bracket'); return c; }
    const left = operand();
    let neg = false;
    if (isKw("NOT")) { p++; neg = true; if (!isKw("IN") && !isKw("LIKE") && !isKw("BETWEEN")) sqlFail(`expected IN, LIKE or BETWEEN after NOT${near()}`); }
    let c;
    if (isKw("IN")) {
      p++;
      needSym("(", '"(" after IN');
      const vals = [literal()];
      while (isSym(",")) { p++; vals.push(literal()); }
      needSym(")", '")" to close the IN list');
      c = { left, inVals: vals };
    } else if (isKw("BETWEEN")) {
      p++;
      const lo = operand();
      needKw("AND", "AND in BETWEEN … AND …");
      c = { left, between: [lo, operand()] };
    } else if (isKw("LIKE")) {
      p++;
      const x = t();
      if (!x || x.k !== "str") sqlFail(`LIKE needs a 'text pattern'${near()}`);
      p++;
      c = { left, like: x.v };
    } else if (isKw("IS")) {
      sqlFail("these tables have no NULL values, so IS NULL isn't needed");
    } else if (t() && t().k === "op") {
      const op = t().v;
      p++;
      c = { left, op, right: operand() };
    } else {
      sqlFail(`expected a comparison such as =, >, IN or BETWEEN${near()}`);
    }
    return neg ? { not: c } : c;
  }
  function andExpr() { let c = primary(); while (isKw("AND")) { p++; c = { and: [c, primary()] }; } return c; }
  function orExpr() { let c = andExpr(); while (isKw("OR")) { p++; c = { or: [c, andExpr()] }; } return c; }

  if (!tk.length) sqlFail("type a query first");
  needKw("SELECT", "SELECT at the start");
  const q = { items: [], distinct: false };
  if (isKw("DISTINCT")) { p++; q.distinct = true; }
  if (isSym("*")) { p++; q.star = true; }
  else {
    do {
      if (isSym(",")) p++;
      const x = t();
      let it;
      if (x && x.k === "fn") it = { agg: fnCall() };
      else if (x && x.k === "id" && /\.\*$/.test(x.v)) sqlFail("write SELECT * or name the columns");
      else it = colName();
      if (isKw("AS")) { p++; it.alias = colName("a name after AS").col; }
      q.items.push(it);
    } while (isSym(","));
  }
  if (t() && t().k === "id") sqlFail(`missing comma before "${t().text}"`);
  needKw("FROM", "FROM after the column list");
  const ft = t();
  if (!ft || ft.k !== "id") sqlFail(`expected a table name after FROM${near()}`);
  q.from = ft.v;
  p++;
  if (isKw("LEFT") || isKw("RIGHT") || isKw("FULL") || isKw("OUTER") || isKw("CROSS")) sqlFail(`${t().text.toUpperCase()} JOIN isn't covered here: use INNER JOIN`);
  if (isKw("INNER") || isKw("JOIN")) {
    if (isKw("INNER")) { p++; needKw("JOIN", "JOIN after INNER"); } else p++;
    const jt = t();
    if (!jt || jt.k !== "id") sqlFail(`expected a table name after JOIN${near()}`);
    q.join = jt.v;
    p++;
    if (isKw("USING")) sqlFail("write the join as ON a.col = b.col");
    needKw("ON", "ON after the joined table");
    const a = colName("a column after ON").col;
    if (!t() || t().k !== "op" || t().v !== "=") sqlFail(`expected = between the two ON columns${near()}`);
    p++;
    q.on = [a, colName("a column after =").col];
  }
  if (isKw("WHERE")) { p++; q.where = orExpr(); }
  if (isKw("GROUP")) {
    p++;
    needKw("BY", "BY after GROUP");
    q.group = [colName().col];
    while (isSym(",")) { p++; q.group.push(colName().col); }
  }
  if (isKw("HAVING")) { p++; q.having = orExpr(); }
  if (isKw("ORDER")) {
    p++;
    needKw("BY", "BY after ORDER");
    q.order = [];
    do {
      if (isSym(",")) p++;
      const x = t();
      let e;
      if (x && x.k === "num") { p++; e = { pos: x.v }; }
      else if (x && x.k === "fn") e = { agg: fnCall() };
      else e = colName("a column after ORDER BY");
      let desc = false;
      if (isKw("ASC")) p++;
      else if (isKw("DESC")) { p++; desc = true; }
      q.order.push({ e, desc });
    } while (isSym(","));
  }
  if (isKw("LIMIT")) {
    p++;
    const x = t();
    if (!x || x.k !== "num" || !Number.isInteger(x.v) || x.v < 0) sqlFail(`LIMIT needs a whole number${near()}`);
    p++;
    q.limit = x.v;
    if (isKw("OFFSET")) {
      p++;
      const y = t();
      if (!y || y.k !== "num" || !Number.isInteger(y.v) || y.v < 0) sqlFail(`OFFSET needs a whole number${near()}`);
      p++;
      q.offset = y.v;
    }
  }
  if (isSym(";")) p++;
  if (p < tk.length) {
    const x = t();
    if (x.k === "kw" && CLAUSE_WORDS.has(x.v)) sqlFail(`"${x.text}" is in the wrong place: ${ORDER_MSG}`);
    if (x.k === "sym" && x.v === ";") sqlFail("only one query, please: there's text after the semicolon");
    sqlFail(`unexpected "${x.text}"`);
  }
  return q;
}

// Run SQL text against tables { name: { cols, rows: [[…]] } }. Throws SqlError with a message.
export function execQuery(src, tables) {
  const q = parseQuery(src);
  const findTable = (name) => {
    const key = Object.keys(tables).find((k) => k.toLowerCase() === name.toLowerCase());
    if (!key) sqlFail(`unknown table: ${name} (this question has ${Object.keys(tables).join(" and ")})`);
    return key;
  };
  const used = [findTable(q.from)];
  if (q.join) {
    used.push(findTable(q.join));
    if (used[0] === used[1]) sqlFail("joining a table to itself isn't covered here");
  }
  // Schema: lowercase name → slot; bare names only when they belong to one table.
  const schema = new Map();
  const cols = [];
  used.forEach((tn) => tables[tn].cols.forEach((c, ci) => {
    const slot = { tn, ci, name: q.join ? `${tn}.${c}` : c };
    cols.push(slot);
    schema.set(`${tn}.${c}`.toLowerCase(), slot);
    const bare = c.toLowerCase();
    schema.set(bare, schema.has(bare) ? "ambiguous" : slot);
  }));
  const resolve = (name) => {
    const s = schema.get(name.toLowerCase());
    if (s === "ambiguous") sqlFail(`ambiguous column: ${name} is in both tables, so write it as table.${name}`);
    if (!s) {
      const dot = name.indexOf(".");
      if (dot > 0 && !used.some((tn) => tn.toLowerCase() === name.slice(0, dot).toLowerCase())) sqlFail(`unknown table in ${name}: ${name.slice(0, dot)} isn't in FROM or JOIN`);
      sqlFail(`unknown column: ${name}`);
    }
    return s;
  };
  // Source rows: arrays per table (one table, or joined pairs).
  let rows = tables[used[0]].rows.map((r) => [r]);
  if (q.join) {
    const a = resolve(q.on[0]), b = resolve(q.on[1]);
    if (a.tn === b.tn) sqlFail("ON must compare a column from each table");
    const right = tables[used[1]].rows;
    const out = [];
    for (const l of rows) for (const r of right) {
      const pair = [l[0], r];
      if (cellOf(pair, a) === cellOf(pair, b)) out.push(pair);
    }
    rows = out;
  }
  function cellOf(row, slot) { return row[used.indexOf(slot.tn)][slot.ci]; }
  const val = (row, name) => cellOf(row, resolve(name));

  // Validate every column name now, so errors show even when no rows match.
  const checkCond = (c, aggOk) => {
    if (!c) return;
    if (c.not) return checkCond(c.not, aggOk);
    if (c.and || c.or) return (c.and || c.or).forEach((x) => checkCond(x, aggOk));
    [c.left, c.right, ...(c.between || [])].forEach((o) => {
      if (!o) return;
      if (o.agg) { if (!aggOk) sqlFail("COUNT, SUM, AVG, MIN and MAX can't go in WHERE: test them in HAVING, after GROUP BY"); if (o.agg.col) resolve(o.agg.col); }
      else if (o.col) resolve(o.col);
    });
  };
  checkCond(q.where, false);
  checkCond(q.having, true);
  q.items.forEach((it) => { if (it.agg) { if (it.agg.col) resolve(it.agg.col); } else resolve(it.col); });
  (q.group || []).forEach(resolve);

  const numCheck = (fn, name) => {
    const s = resolve(name);
    if (fn === "SUM" || fn === "AVG") if (tables[s.tn].rows.some((r) => typeof r[s.ci] !== "number")) sqlFail(`${fn} needs a number column, but ${name} holds text`);
  };
  const agg = (a, grp) => {
    if (a.fn === "COUNT") {
      if (a.star) return grp.length;
      const vs = grp.map((r) => val(r, a.col));
      return a.distinct ? new Set(vs).size : vs.length;
    }
    numCheck(a.fn, a.col);
    let vs = grp.map((r) => val(r, a.col));
    if (a.distinct) vs = [...new Set(vs)];
    if (!vs.length) return null;
    if (a.fn === "SUM") return vs.reduce((x, y) => x + y, 0);
    if (a.fn === "AVG") return vs.reduce((x, y) => x + y, 0) / vs.length;
    return vs.reduce((x, y) => ((a.fn === "MIN" ? y < x : y > x) ? y : x));
  };
  const cmp = (x, op, y) => {
    if (x === null || y === null) return false;
    if (typeof x !== typeof y) sqlFail(`can't compare ${typeof x === "number" ? x : `'${x}'`} with ${typeof y === "number" ? y : `'${y}'`}: one is text and one is a number (text needs quotes, numbers don't)`);
    return CMP[op](x, y);
  };
  const likeRe = (pat) => new RegExp(`^${[...pat].map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("")}$`, "is");
  // ctx: { row } for plain rows, { grp } for groups (aggregates allowed).
  const opVal = (o, ctx) => {
    if ("lit" in o) return o.lit;
    if (o.agg) return agg(o.agg, ctx.grp);
    if (ctx.grp) {
      if (!groupKeys.includes(resolve(o.col))) sqlFail(`${o.col} must be in GROUP BY or inside COUNT, SUM, AVG, MIN or MAX`);
      return ctx.grp.length ? val(ctx.grp[0], o.col) : null;
    }
    return val(ctx.row, o.col);
  };
  const test = (c, ctx) => {
    if (c.not) return !test(c.not, ctx);
    if (c.and) return test(c.and[0], ctx) && test(c.and[1], ctx);
    if (c.or) return test(c.or[0], ctx) || test(c.or[1], ctx);
    const x = opVal(c.left, ctx);
    if (c.inVals) return c.inVals.some((v) => cmp(x, "=", v));
    if (c.between) return cmp(x, ">=", opVal(c.between[0], ctx)) && cmp(x, "<=", opVal(c.between[1], ctx));
    if (c.like !== undefined) {
      if (typeof x !== "string") sqlFail("LIKE works on text columns");
      return likeRe(c.like).test(x);
    }
    return cmp(x, c.op, opVal(c.right, ctx));
  };

  if (q.where) rows = rows.filter((row) => test(q.where, { row }));
  const grouped = !!q.group || !!q.having || q.items.some((it) => it.agg);
  const groupKeys = (q.group || []).map(resolve);
  const label = (it) => it.alias || (it.agg ? `${it.agg.fn}(${it.agg.star ? "*" : `${it.agg.distinct ? "DISTINCT " : ""}${it.agg.col}`})` : it.col);
  const columns = q.star ? cols.map((s) => s.name) : q.items.map(label);
  let out = []; // { cells, ctx }
  if (grouped) {
    if (q.star) sqlFail("SELECT * can't be used with GROUP BY or COUNT, SUM, AVG, MIN, MAX: name the columns");
    const groups = [];
    if (q.group) {
      const index = new Map();
      for (const row of rows) {
        const key = JSON.stringify(groupKeys.map((s) => cellOf(row, s)));
        if (!index.has(key)) { index.set(key, groups.length); groups.push([]); }
        groups[index.get(key)].push(row);
      }
    } else groups.push(rows);
    for (const grp of groups) {
      const ctx = { grp };
      if (q.having && !test(q.having, ctx)) continue;
      out.push({ cells: q.items.map((it) => opVal(it.agg ? it : { col: it.col }, ctx)), ctx });
    }
  } else {
    out = rows.map((row) => ({ cells: q.star ? cols.map((s) => cellOf(row, s)) : q.items.map((it) => val(row, it.col)), ctx: { row } }));
  }
  if (q.order) {
    const keyOf = (o, r) => {
      if (o.e.pos !== undefined) {
        if (o.e.pos < 1 || o.e.pos > columns.length) sqlFail(`ORDER BY ${o.e.pos} is past the last column`);
        return r.cells[o.e.pos - 1];
      }
      if (o.e.col && !q.star) {
        const ai = q.items.findIndex((it) => it.alias && it.alias.toLowerCase() === o.e.col.toLowerCase());
        if (ai >= 0) return r.cells[ai];
      }
      return opVal(o.e, r.ctx);
    };
    const keyed = out.map((r, i) => ({ r, i, k: q.order.map((o) => keyOf(o, r)) }));
    keyed.sort((a, b) => {
      for (let j = 0; j < q.order.length; j++) {
        const x = a.k[j], y = b.k[j];
        if (x === y) continue;
        if (typeof x !== typeof y) return 0;
        return (x < y ? -1 : 1) * (q.order[j].desc ? -1 : 1);
      }
      return a.i - b.i;
    });
    out = keyed.map((x) => x.r);
  }
  let res = out.map((r) => r.cells);
  if (q.distinct) {
    const seen = new Set();
    res = res.filter((r) => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (q.limit !== undefined || q.offset !== undefined) res = res.slice(q.offset || 0, (q.offset || 0) + (q.limit ?? res.length));
  return { columns, rows: res };
}

// Learners test their query: { columns, rows } (at most 200 rows) or { error }. Never throws.
export function runQuery(tables, src) {
  try {
    if (!tables || typeof tables !== "object") return { error: "This question has no table data to run against." };
    src = typeof src === "string" ? src : "";
    if (!src.trim()) return { error: "Type a query first." };
    if (src.length > 2000) return { error: "That query is too long (2000 characters at most)." };
    const r = execQuery(src, tables);
    const fix = (v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 10000) / 10000 : v);
    return { columns: r.columns.map(String), rows: r.rows.slice(0, 200).map((row) => row.map((v) => (v === undefined ? null : fix(v)))) };
  } catch (e) {
    return { error: e instanceof SqlError ? e.message.charAt(0).toUpperCase() + e.message.slice(1) : "Couldn't run that query." };
  }
}
