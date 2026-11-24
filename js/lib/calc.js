// Calculator engine: tokenizer, recursive-descent parser, evaluator and a small live "sheet".
// Pure module (no DOM). Never uses eval / new Function.
//
// Grammar (precedence low -> high):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/' | '%') unary)*
//   unary   := ('-' | '+') unary | power
//   power   := primary ('^' unary)?          right-associative; -2^2 = -(2^2)
//   primary := number | name | name '(' args ')' | '(' expr ')'
// Aliases: × -> *, ÷ -> /, − -> -. Trig works in degrees. `%` is modulo (JS sign rules).
// Names starting with "_" are row references (labels); bare names are only constants and functions,
// so `e` is always Euler's number and `_e` is a row.
// Graph mode: parse(src, { vars: ['x'] }) also accepts the bare name `x` as a variable node
// ({ k: 'var', name: 'x' }), evaluated with evaluate(ast, lookup, { x }). Without the option `x` stays
// "unknown function or constant: x", so sheet rows can't use it.

export const MAX_EXPR = 200;
export const MAX_ROWS = 30;
const MAX_DEPTH = 40;
export const LABEL_RE = /^_[A-Za-z0-9_]{1,23}$/;

export class CalcError extends Error {}
const fail = msg => { throw new CalcError(msg); };

const CONSTANTS = { pi: Math.PI, e: Math.E };
const TRIG = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan']);
const DEG = Math.PI / 180;

// Snap tiny floating-point noise off trig results (sin(30) -> 0.5 exactly).
const snap = x => (Math.abs(x) < 1e-15 ? 0 : Number(x.toPrecision(15)));

function roundTo(x, digits = 0) {
  if (!Number.isInteger(digits) || digits < -12 || digits > 12) fail('round: digits must be a whole number from -12 to 12');
  const m = Math.pow(10, digits);
  const s = Math.sign(x) || 1;
  return (s * Math.round(Math.abs(x) * m * (1 + Number.EPSILON))) / m;
}

function tanDeg(x) {
  const r = ((x % 180) + 180) % 180;
  if (r === 90) fail('tan is undefined at 90° + k·180°');
  return snap(Math.tan(x * DEG));
}

// name -> [minArgs, maxArgs, fn]
const FUNCTIONS = {
  sqrt: [1, 1, x => (x < 0 ? fail('sqrt of a negative number') : Math.sqrt(x))],
  abs: [1, 1, Math.abs],
  round: [1, 2, roundTo],
  floor: [1, 1, Math.floor],
  ceil: [1, 1, Math.ceil],
  min: [1, MAX_ROWS, Math.min],
  max: [1, MAX_ROWS, Math.max],
  log: [1, 1, x => (x <= 0 ? fail('log needs a positive number') : Math.log10(x))],
  ln: [1, 1, x => (x <= 0 ? fail('ln needs a positive number') : Math.log(x))],
  exp: [1, 1, Math.exp],
  sin: [1, 1, x => snap(Math.sin(x * DEG))],
  cos: [1, 1, x => snap(Math.cos(x * DEG))],
  tan: [1, 1, tanDeg],
  asin: [1, 1, x => (x < -1 || x > 1 ? fail('asin needs a value from -1 to 1') : snap(Math.asin(x) / DEG))],
  acos: [1, 1, x => (x < -1 || x > 1 ? fail('acos needs a value from -1 to 1') : snap(Math.acos(x) / DEG))],
  atan: [1, 1, x => snap(Math.atan(x) / DEG)],
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const isRowName = name => String(name).startsWith('_');

// A label typed without the leading underscore gets one ("speed" -> "_speed"). Empty stays empty.
export function normalizeLabel(label) {
  const s = String(label ?? '');
  return s && !s.startsWith('_') ? `_${s}` : s;
}

// Why a label is not acceptable, or '' when it is fine. `others` = labels of the other rows.
export function labelProblem(label, others = []) {
  const s = String(label ?? '');
  if (!s || s === '_') return 'name is empty';
  if (!LABEL_RE.test(s)) return 'use _ then letters, digits or _ (max 24 characters)';
  const low = s.toLowerCase();
  if (others.some(o => String(o ?? '').toLowerCase() === low)) return `${s} is already used`;
  return '';
}

// ---------- tokenizer ----------

const ALIASES = { '×': '*', '÷': '/', '−': '-' };
const OPS = '+-*/^%';

// Returns [{ t: 'num'|'name'|'op'|'(' | ')' | ',', v, start, end }].
// lenient: skip characters it doesn't understand instead of throwing (used by renameLabel).
export function tokenize(src, { lenient = false } = {}) {
  const s = String(src ?? '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const start = i;
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) {
        if (lenient) { i++; continue; }
        fail(`unexpected "${c}"`);
      }
      i += m[0].length;
      if (i < s.length && /[0-9.]/.test(s[i]) && !lenient) fail(`bad number "${s.slice(start, i + 1)}"`);
      out.push({ t: 'num', v: Number(m[0]), start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      i += m[0].length;
      out.push({ t: 'name', v: m[0], start, end: i });
      continue;
    }
    const op = ALIASES[c] || c;
    if (OPS.includes(op)) { out.push({ t: 'op', v: op, start, end: i + 1 }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c, v: c, start, end: i + 1 }); i++; continue; }
    if (lenient) { i++; continue; }
    fail(`unexpected "${c}"`);
  }
  return out;
}

// ---------- parser ----------
// AST: { k: 'num', v } | { k: 'ref', name } | { k: 'const', name } | { k: 'call', name, args }
//    | { k: 'neg', a } | { k: 'bin', op, a, b } | { k: 'var', name }   (var only with opts.vars)

export function parse(src, { vars } = {}) {
  const s = String(src ?? '');
  const varSet = new Set((Array.isArray(vars) ? vars : []).map(v => String(v).toLowerCase()));
  if (s.length > MAX_EXPR) fail(`expression too long (max ${MAX_EXPR} characters)`);
  const toks = tokenize(s);
  if (!toks.length) fail('empty expression');
  let p = 0;
  let depth = 0;
  const peek = () => toks[p];
  const isOp = (tok, ops) => tok && tok.t === 'op' && ops.includes(tok.v);
  const describe = tok => (!tok ? 'end of expression' : tok.t === ',' ? '"," (no thousands separators: write 1000)' : `"${tok.v}"`);
  // Graph mode only: "2x" / "3(x+1)" / "x(x-1)" get a hint instead of a bare "unexpected".
  function implicitHint(at) {
    if (!varSet.size) return '';
    const prev = toks[at - 1];
    const tok = toks[at];
    if (!prev || !tok || (prev.t !== 'num' && prev.t !== ')' && prev.t !== 'name')) return '';
    if (tok.t !== 'name' && tok.t !== '(' && tok.t !== 'num') return '';
    return `missing * before ${describe(tok)} (write 2*x, not 2x)`;
  }

  function enter() { if (++depth > MAX_DEPTH) fail('expression is nested too deeply'); }

  function expr() {
    enter();
    let node = term();
    while (isOp(peek(), '+-')) { const op = toks[p++].v; node = { k: 'bin', op, a: node, b: term() }; }
    depth--;
    return node;
  }
  function term() {
    let node = unary();
    while (isOp(peek(), '*/%')) { const op = toks[p++].v; node = { k: 'bin', op, a: node, b: unary() }; }
    return node;
  }
  function unary() {
    if (isOp(peek(), '+-')) {
      const op = toks[p++].v;
      enter();
      const a = unary();
      depth--;
      return op === '-' ? { k: 'neg', a } : a;
    }
    return power();
  }
  function power() {
    const base = primary();
    if (isOp(peek(), '^')) {
      p++;
      enter();
      const exp = unary();
      depth--;
      return { k: 'bin', op: '^', a: base, b: exp };
    }
    return base;
  }
  function primary() {
    const tok = peek();
    if (!tok) fail('expression ends too early');
    if (tok.t === 'num') { p++; return { k: 'num', v: tok.v }; }
    if (tok.t === '(') {
      p++;
      const node = expr();
      if (!peek() || peek().t !== ')') fail(implicitHint(p) || 'missing ")"');
      p++;
      return node;
    }
    if (tok.t === 'name') {
      p++;
      if (isRowName(tok.v)) {
        if (peek() && peek().t === '(') fail(`${tok.v} is a value, not a function`);
        return { k: 'ref', name: tok.v };
      }
      const low = tok.v.toLowerCase();
      if (varSet.has(low) && !has(FUNCTIONS, low) && !has(CONSTANTS, low)) {
        return { k: 'var', name: low };
      }
      if (peek() && peek().t === '(') {
        if (!has(FUNCTIONS, low)) fail(`unknown function or constant: ${tok.v}`);
        p++;
        const args = [];
        if (peek() && peek().t === ')') { p++; }
        else {
          for (;;) {
            args.push(expr());
            const nx = peek();
            if (nx && nx.t === ',') { p++; continue; }
            if (nx && nx.t === ')') { p++; break; }
            fail(implicitHint(p) || `expected "," or ")" in ${low}(…)`);
          }
        }
        const [min, max] = FUNCTIONS[low];
        if (args.length < min || args.length > max) {
          const want = min === max ? `${min} argument${min === 1 ? '' : 's'}` : (max === MAX_ROWS ? `at least ${min}` : `${min} to ${max} arguments`);
          fail(`${low} takes ${want}, got ${args.length}`);
        }
        return { k: 'call', name: low, args };
      }
      if (has(FUNCTIONS, low)) fail(`${low} is a function: write ${low}(…)`);
      if (has(CONSTANTS, low)) return { k: 'const', name: low };
      fail(`unknown function or constant: ${tok.v}`);
    }
    fail(`unexpected ${describe(tok)}`);
  }

  const ast = expr();
  if (p < toks.length) fail(implicitHint(p) || `unexpected ${describe(toks[p])}`);
  return ast;
}

// Row names (lower-case) referenced by an AST.
export function refsOf(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.k === 'ref') out.add(ast.name.toLowerCase());
  else if (ast.k === 'neg') refsOf(ast.a, out);
  else if (ast.k === 'bin') { refsOf(ast.a, out); refsOf(ast.b, out); }
  else if (ast.k === 'call') ast.args.forEach(a => refsOf(a, out));
  return out;
}

function usesTrig(ast) {
  if (!ast) return false;
  if (ast.k === 'call') return TRIG.has(ast.name) || ast.args.some(usesTrig);
  if (ast.k === 'neg') return usesTrig(ast.a);
  if (ast.k === 'bin') return usesTrig(ast.a) || usesTrig(ast.b);
  return false;
}

const finite = (x, what = 'result') => (Number.isFinite(x) ? x : fail(`${what} is not a finite number`));

// lookup(nameLowerCase) -> number. vars: { name: number } for 'var' nodes (graph mode).
// Throws CalcError on any problem.
export function evaluate(ast, lookup = () => undefined, vars) {
  switch (ast.k) {
    case 'num': return finite(ast.v, 'number');
    case 'const': return CONSTANTS[ast.name];
    case 'var': {
      const v = vars && has(vars, ast.name) ? vars[ast.name] : undefined;
      if (typeof v === 'number') return finite(v, ast.name);
      return fail(`unknown function or constant: ${ast.name}`);
    }
    case 'ref': {
      const v = lookup(ast.name.toLowerCase());
      if (v !== undefined) return v;
      return fail(`unknown value: ${ast.name}`);
    }
    case 'neg': return -evaluate(ast.a, lookup, vars);
    case 'call': {
      const args = ast.args.map(a => evaluate(a, lookup, vars));
      return finite(FUNCTIONS[ast.name][2](...args));
    }
    case 'bin': {
      const a = evaluate(ast.a, lookup, vars);
      const b = evaluate(ast.b, lookup, vars);
      switch (ast.op) {
        case '+': return finite(a + b);
        case '-': return finite(a - b);
        case '*': return finite(a * b);
        case '/': return b === 0 ? fail('division by zero') : finite(a / b);
        case '%': return b === 0 ? fail('modulo by zero') : finite(a % b);
        case '^': return finite(Math.pow(a, b));
      }
    }
  }
  return fail('cannot evaluate');
}

// Convenience: parse + evaluate a single expression with no rows.
export function calc(src) {
  return evaluate(parse(src));
}

// ---------- formatting ----------

// At most 10 significant digits, no trailing zeros, "-0" shown as "0". Throws on non-finite input.
export function formatValue(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new CalcError('not a finite number');
  if (n === 0) return '0';
  const r = Number(n.toPrecision(10));
  return r === 0 ? '0' : String(r);
}

// ---------- sheet ----------

/*
 * rows: [{ label, expr }]. Returns one entry per row:
 *   { value: number }            evaluated
 *   { value: null }              blank expression
 *   { error: string }            problem (cycle, unknown name, syntax, …)
 * plus `deg: true` when the row (directly) uses trig functions.
 * Rows are evaluated in dependency order; only rows affected by a problem fail.
 */
export function evaluateSheet(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const n = list.length;
  const out = new Array(n);
  const byName = new Map(); // lower label -> index (first valid owner)
  const parsed = new Array(n);

  for (let i = 0; i < n; i++) {
    const row = list[i] || {};
    const label = String(row.label ?? '');
    const expr = String(row.expr ?? '');
    if (i >= MAX_ROWS) { out[i] = { error: `too many rows (max ${MAX_ROWS})` }; continue; }
    const prevLabels = [...byName.keys()];
    const lp = labelProblem(label, prevLabels);
    if (lp) { out[i] = { error: `invalid name: ${lp}` }; continue; }
    byName.set(label.toLowerCase(), i);
    if (!expr.trim()) { out[i] = { value: null }; continue; }
    try {
      const ast = parse(expr);
      parsed[i] = { ast, refs: refsOf(ast), deg: usesTrig(ast) };
    } catch (e) {
      out[i] = { error: e instanceof CalcError ? e.message : 'could not read expression' };
    }
  }

  const state = new Array(n).fill(0); // 0 new, 1 visiting, 2 done
  const stack = [];
  const labelOf = i => String(list[i].label);

  function visit(i) {
    if (state[i] === 2) return;
    if (state[i] === 1) {
      // Cycle: every member gets the path starting from itself.
      const cyc = stack.slice(stack.indexOf(i));
      cyc.forEach((m, k) => {
        const path = cyc.slice(k).concat(cyc.slice(0, k), [m]).map(labelOf).join(' → ');
        out[m] = { error: `circular reference: ${path}` };
        state[m] = 2;
      });
      return;
    }
    if (out[i] || !parsed[i]) { state[i] = 2; return; }
    state[i] = 1;
    stack.push(i);
    for (const name of parsed[i].refs) {
      const j = byName.get(name);
      if (j !== undefined) visit(j);
    }
    stack.pop();
    if (state[i] === 2) return; // marked as part of a cycle while visiting dependencies
    state[i] = 2;
    const lookup = name => {
      const j = byName.get(name);
      if (j === undefined) return undefined;
      const r = out[j];
      if (!r) fail(`cannot evaluate ${labelOf(j)}`);
      if (r.error) fail(`${labelOf(j)} has an error`);
      if (r.value === null) fail(`${labelOf(j)} is empty`);
      return r.value;
    };
    try {
      const v = evaluate(parsed[i].ast, lookup);
      out[i] = { value: v };
    } catch (e) {
      out[i] = { error: e instanceof CalcError ? e.message : 'could not evaluate' };
    }
    if (parsed[i].deg) out[i].deg = true;
  }

  for (let i = 0; i < n; i++) visit(i);
  return out;
}

// Lookup over an evaluated sheet, with the same rules as inside evaluateSheet: the first row with a
// valid label owns it; unknown names give undefined ("unknown value: _x"); blank and failing rows
// throw "_a is empty" / "_a has an error". `results` = evaluateSheet(rows).
export function sheetLookup(rows, results) {
  const list = Array.isArray(rows) ? rows : [];
  const byName = new Map();
  for (let i = 0; i < list.length && i < MAX_ROWS; i++) {
    const label = String(list[i]?.label ?? '');
    if (labelProblem(label, [...byName.keys()])) continue;
    byName.set(label.toLowerCase(), i);
  }
  return name => {
    const j = byName.get(String(name).toLowerCase());
    if (j === undefined) return undefined;
    const label = String(list[j].label);
    const r = results && results[j];
    if (!r || r.error) fail(`${label} has an error`);
    if (r.value === null || r.value === undefined) fail(`${label} is empty`);
    return r.value;
  };
}

// Next free suggested label: _a, _b, _c, …, then _a1, _b1, …
export function nextLabel(rows) {
  const used = new Set((Array.isArray(rows) ? rows : []).map(r => String(r?.label ?? '').toLowerCase()));
  for (let round = 0; round < 100; round++) {
    for (let c = 97; c <= 122; c++) {
      const name = '_' + String.fromCharCode(c) + (round ? String(round) : '');
      if (!used.has(name)) return name;
    }
  }
  return `_r${Date.now() % 100000}`;
}

// Renames a row label and rewrites whole-token references in the other rows' expressions
// (case-insensitive, whole name tokens only).
// Returns a new rows array; rows are shallow-copied.
export function renameLabel(rows, oldName, newName) {
  const oldLow = String(oldName ?? '').toLowerCase();
  const nn = String(newName ?? '');
  return (Array.isArray(rows) ? rows : []).map(r => {
    const row = { ...r };
    if (String(row.label ?? '').toLowerCase() === oldLow) row.label = nn;
    const expr = String(row.expr ?? '');
    if (!oldLow || !expr) return row;
    let toks;
    try { toks = tokenize(expr, { lenient: true }); } catch { return row; }
    let res = '';
    let last = 0;
    toks.forEach(t => {
      if (t.t !== 'name' || t.v.toLowerCase() !== oldLow) return;
      res += expr.slice(last, t.start) + nn;
      last = t.end;
    });
    row.expr = res + expr.slice(last);
    return row;
  });
}
