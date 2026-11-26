// Language-neutral code snippets for the code subjects (Code Writing, Code Reviewing).
// Pure, no DOM. A generator builds a program ONCE from the S/E constructors below, then renders it
// in the user's language (python, csharp, cpp, gdscript, rust, javascript, typescript, java, go) and
// runs it with the interpreter.
// The same seed gives the same logic and the same output in every language.
//
// ── API ───────────────────────────────────────────────────────────────────────────────────────
//   program(fns, main)                     → { k:'program', fns:[S.fn…], main:[stmt…] }
//   S.fn(name, params, body, returns='void', id)   params: 'n' (int) or { name, type }
//                                          param types 'int'|'str'|'bool'|'list'; returns those or 'void'
//   S.decl(name, value, type?, id)         declare + initialise (type inferred; give it for a blank value)
//   S.assign(name, value, id)    S.augAssign(name, op, value, id)   op: + - * / %
//   S.setIndex(name, index, value, id)     xs[i] = v          S.append(name, value, id)   xs.append(v)
//   S.if(cond, then, elifs=[], els=null, id)   elifs: [[cond, body], …] or [{ cond, body }, …]
//   S.forRange(var, start, end, step, body, id)   end exclusive; step = nonzero int literal (±)
//   S.forEach(var, listName, body, id)     S.while(cond, body, id)
//   S.return(value?, id)  S.print(value, id)  S.exprStmt(callExpr, id)  S.call(name, args, id)
//   S.break(id)  S.continue(id)  S.blank(id, text='____')   (a whole blank line)
//   E.int(n) E.str(s) E.bool(b) E.var(name) E.bin(op, a, b)  op: + - * / %  < <= > >= == !=
//   E.and(...xs) E.or(...xs) E.not(x) E.index(name, i) E.len(name) E.list([…]) E.call(name, args)
//   E.blank(text='__')                     a visible blank, e.g. `if __:`
//   Anywhere an expression is expected, a plain JS integer is accepted and wrapped with E.int.
//
//   check(program)                         validates the portability rules below; throws CodeLangError
//   render(program, lang, { lineNumbers }) → { code, lines, lineOf }  (lines = raw lines, no numbers;
//        lineOf: Map stmtId → 1-based displayed line. Extra keys: `<ifId>.elif0`, `.elif1`…, `<ifId>.else`,
//        and '#main' for the main header line where there is one. Statements without an id get
//        deterministic auto ids '#1', '#2'… in source order, identical in every language.)
//   lineAt(rendered, id)                   → that line's text, trimmed
//   renderExpr(expr, lang, { program, fn, types })   one expression, e.g. a condition for a choice
//   renderStmtLine(stmt, lang, { program, fn, types })  first displayed line of one statement
//        (types: { name: 'int'|'str'|'char'|'bool'|'list' }; program+fn (fn name, or omit for main)
//        lets it look up variable types, list params and Rust `mut`.)
//   codeBlock(program, lang, opts)         markdown fenced block of render(...).code
//   fence(lang)                            the fence tag      ident(name, lang, 'var'|'fn') displayed name
//   run(program, { entry, args, maxSteps=10000 }) → { output:[strings], returned, steps, timedOut }
//        entry: run that function with args (JS ints/strings/arrays) instead of main.
//        Runtime errors throw CodeLangError (err.output = lines printed so far).
//   langNotes(lang) / rangeText(lang)      wording for explanations (range, len, append, elif…)
//
// ── Snippet frame per language ────────────────────────────────────────────────────────────────
//   python   functions (def) then main statements at top level.
//   csharp   top-level statements (.NET 6+, implicit usings): `static` local functions first, then main
//            statements. Allman braces. Names: functions PascalCase, variables camelCase (see ident).
//   cpp      functions then `int main() { … }`. #includes (<iostream> <string> <vector>) are not shown.
//   gdscript `extends Node`, functions, then main statements in `func _ready() -> void:`. Typed vars.
//   rust     functions then `fn main() { … }`. i64, &[i64] params, Vec<i64>, &str, explicit `return`.
//   javascript  `function` declarations, then main statements at top level. `const` unless the name is
//            reassigned (or the program has a whole blank line), `let` otherwise; === / !==; for…of.
//            Numbers are doubles, so whole-number division is `Math.floor(a / b)` (also for `/=`).
//   typescript  as JavaScript, with typed params and return types (number, string, boolean, number[]),
//            and an annotation on a declaration whose value is a blank or an empty list.
//   java     a Java 25 compact source file: `static` methods, then `void main() { … }` (java.base is
//            imported implicitly). Typed locals; lists are List<Integer> (`new ArrayList<>(List.of(…))`,
//            get/set/add/size); strings use charAt/length() and equals() for == (two list items compared
//            with == / != unbox one side with `(int)`). camelCase names.
//   go       functions, then `func main() { … }` (package and imports not shown). `:=`, []int slices,
//            `xs = append(xs, v)`, len(), `for cond {` for while, `for _, x := range xs` (or `for range xs`
//            when the body never reads x), fmt.Println (a byte s[i] printed as string(s[i])). camelCase.
//   One blank line between functions and before main. Main is omitted when it is empty. 4-space indent.
//   Line numbers: right-aligned number + " | " on every line (blank lines too).
//
// ── Rules generators must respect (check() enforces them) ─────────────────────────────────────
//   Names snake_case /^[a-z][a-z0-9_]{0,23}$/, not a keyword/builtin in any language, not a function
//   name. Values: int (±2^31−1), str (printable ASCII without " ' \), char (= s[i]), bool, list of int.
//   Every variable is declared (S.decl) before use and lives in its block: not visible after the block
//   (loop vars neither); no redeclaring a visible name or a name used in an enclosing/nested block.
//   Functions see only their params and locals; they may call themselves or EARLIER functions only.
//   List params are read-only (no append/setIndex/assign); str params are not assigned.
//   A list variable is set only from E.list or a call (never copied from another list); a list
//   function returns a local list variable; a str function returns string literals; a non-void
//   function ends in return on every path (last stmt return, or if/else whose branches all do).
//   E.list only as a decl/assign value; list call arguments must be list variables; E.index/E.len take
//   a variable name. Print only int, str or char (never bool or list). < <= > >= only on ints;
//   == != on same types (a char may be compared with a one-char str literal: rendered 'a' in C#/C++/Rust).
//   No string concatenation. forRange: the body must not assign the loop var or anything the end
//   expression reads. forEach: the body must not change the list or the loop var. No return in main.
//   break/continue only inside loops.
//   Runtime (run throws): / or % with a negative operand or zero divisor, any value beyond ±2^31−1,
//   index < 0 or ≥ length, recursion deeper than 100, a blank. Infinite loops → timedOut: true.
//
// ── Example ───────────────────────────────────────────────────────────────────────────────────
//   import { S, E, program, render, run } from './codelang.js';
//   import { LANG_IDS } from './languages.js';
//   const p = program(
//     [S.fn('sum_list', [{ name: 'xs', type: 'list' }], [
//       S.decl('total', 0, null, 'init'),
//       S.forEach('x', 'xs', [S.augAssign('total', '+', E.var('x'), 'acc')]),
//       S.return(E.var('total'), 'ret'),
//     ], 'int')],
//     [S.decl('nums', E.list([3, 4, 5])), S.print(E.call('sum_list', [E.var('nums')]), 'out')]);
//   for (const lang of LANG_IDS) console.log(render(p, lang, { lineNumbers: true }).code);
//   run(p).output  // ['12']      render(p, 'rust').lineOf.get('acc')  // line of `total += x;`

import { LANGUAGES, isLang } from './languages.js';

export class CodeLangError extends Error {
  constructor(msg) { super(msg); this.name = 'CodeLangError'; }
}
const fail = m => { throw new CodeLangError(m); };
const INT_MAX = 2147483647;

// ── Constructors ──────────────────────────────────────────────────────────────────────────────
const ex = x => (typeof x === 'number' ? E.int(x) : x && typeof x === 'object' ? x : fail(`not an expression: ${x}`));
const nm = x => (typeof x === 'string' ? x : x && x.k === 'var' ? x.name : fail(`expected a variable name, got ${x}`));
const st = (o, id) => (id != null ? { ...o, id: String(id) } : o);
const BINOPS = ['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!='];
const CMP = new Set(['<', '<=', '>', '>=', '==', '!=']);
const TYPES = ['int', 'str', 'bool', 'list'];

export const E = {
  int: v => (Number.isInteger(v) && Math.abs(v) <= INT_MAX ? { k: 'int', v } : fail(`bad int literal: ${v}`)),
  str: v => (typeof v === 'string' && /^[ -~]*$/.test(v) && !/["'\\]/.test(v) ? { k: 'str', v }
    : fail(`string literals must be printable ASCII without quotes or backslashes: ${v}`)),
  bool: v => ({ k: 'bool', v: !!v }),
  var: name => ({ k: 'var', name }),
  bin: (op, a, b) => (BINOPS.includes(op) ? { k: 'bin', op, a: ex(a), b: ex(b) } : fail(`unknown operator: ${op}`)),
  and: (...xs) => ({ k: 'and', xs: xs.map(ex) }),
  or: (...xs) => ({ k: 'or', xs: xs.map(ex) }),
  not: x => ({ k: 'not', x: ex(x) }),
  index: (list, i) => ({ k: 'index', name: nm(list), i: ex(i) }),
  len: list => ({ k: 'len', name: nm(list) }),
  list: (items = []) => ({ k: 'list', items: items.map(ex) }),
  call: (name, args = []) => ({ k: 'call', name, args: args.map(ex) }),
  blank: (text = '__') => ({ k: 'blank', text }),
};

const body = b => (Array.isArray(b) ? b : fail('a body must be an array of statements'));
export const S = {
  fn: (name, params = [], b, returns = 'void', id) => st({ k: 'fn', name, body: body(b), returns,
    params: params.map(p => (typeof p === 'string' ? { name: p, type: 'int' } : { name: p.name, type: p.type || 'int' })) }, id),
  decl: (name, value, type, id) => st({ k: 'decl', name, value: ex(value), type: type || null }, id),
  assign: (name, value, id) => st({ k: 'assign', name, value: ex(value) }, id),
  augAssign: (name, op, value, id) => ('+-*/%'.includes(op) && op.length === 1
    ? st({ k: 'augAssign', name, op, value: ex(value) }, id) : fail(`bad compound operator: ${op}`)),
  setIndex: (name, index, value, id) => st({ k: 'setIndex', name: nm(name), i: ex(index), value: ex(value) }, id),
  append: (name, value, id) => st({ k: 'append', name: nm(name), value: ex(value) }, id),
  if: (cond, then, elifs = [], els = null, id) => st({ k: 'if', cond: ex(cond), then: body(then),
    elifs: elifs.map(a => (Array.isArray(a) ? { cond: ex(a[0]), body: body(a[1]) } : { cond: ex(a.cond), body: body(a.body) })),
    els: els ? body(els) : null }, id),
  forRange: (v, start, end, step, b, id) => (Number.isInteger(step) && step !== 0
    ? st({ k: 'forRange', v, start: ex(start), end: ex(end), step, body: body(b) }, id)
    : fail('forRange step must be a nonzero integer literal')),
  forEach: (v, list, b, id) => st({ k: 'forEach', v, list: nm(list), body: body(b) }, id),
  while: (cond, b, id) => st({ k: 'while', cond: ex(cond), body: body(b) }, id),
  return: (value, id) => st({ k: 'return', value: value == null ? null : ex(value) }, id),
  print: (value, id) => st({ k: 'print', value: ex(value) }, id),
  exprStmt: (value, id) => st({ k: 'exprStmt', value: ex(value) }, id),
  call: (name, args, id) => st({ k: 'exprStmt', value: E.call(name, args) }, id),
  break: id => st({ k: 'break' }, id),
  continue: id => st({ k: 'continue' }, id),
  blank: (id, text = '____') => st({ k: 'blank', text }, id),
};
export const program = (fns = [], main = []) => ({ k: 'program', fns, main });

// ── Names ─────────────────────────────────────────────────────────────────────────────────────
const RESERVED = new Set(`and or not xor in is if elif else for foreach while do loop break continue return
  pass def func fn let mut var const static class struct enum trait impl match switch case default when
  true false none null nil self this super base new delete int char str string bool float double long
  short byte list len sum min max abs print range main ready extends signal export onready tool
  await yield async lambda global nonlocal import from as with try catch except finally raise throw assert
  del type typeof sizeof nameof ref out params use mod crate pub where unsafe move dyn box vec auto void
  unsigned signed namespace using template typename operator virtual override abstract public private
  protected internal sealed readonly volatile extern goto checked fixed lock event object decimal dynamic
  record init add remove get set free show hide name owner preload breakpoint class_name std cout
  endl console i64 usize bitand bitor compl not_eq and_eq or_eq xor_eq macro union final priv become
  inline register friend explicit implicit stackalloc unchecked`.split(/\s+/));
const validName = n => (typeof n === 'string' && /^[a-z][a-z0-9_]{0,23}$/.test(n) && !RESERVED.has(n)
  ? n : fail(`invalid or reserved name: ${n}`));

/** Name as displayed: C# functions PascalCase; C#, JavaScript, TypeScript, Java and Go variables
 *  (and their functions, except C#) camelCase; snake_case in Python, GDScript, C++ and Rust. */
const CAMEL = new Set(['csharp', 'javascript', 'typescript', 'java', 'go']);
export function ident(name, lang, kind = 'var') {
  if (!CAMEL.has(lang)) return name;
  const w = name.split('_').filter(Boolean), cap = s => s[0].toUpperCase() + s.slice(1);
  return kind === 'fn' && lang === 'csharp' ? w.map(cap).join('') : w[0] + w.slice(1).map(cap).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────────────────────
const ok = (t, want) => t === 'any' || t === want;
// look(name) → { type, param } | null ; fns: Map name → fn ; rhs: position allows a list literal / void call
function typeOf(e, look, fns, rhs = false) {
  const need = n => look(n) || fail(`unknown variable: ${n}`);
  switch (e.k) {
    case 'int': return 'int';
    case 'str': return 'str';
    case 'bool': return 'bool';
    case 'blank': return 'any';
    case 'var': return need(e.name).type;
    case 'len': { const t = need(e.name).type; if (!['list', 'str', 'any'].includes(t)) fail(`len of a ${t}: ${e.name}`); return 'int'; }
    case 'index': {
      const t = need(e.name).type;
      if (!ok(typeOf(e.i, look, fns), 'int')) fail('an index must be an int');
      return t === 'list' ? 'int' : t === 'str' ? 'char' : t === 'any' ? 'any' : fail(`cannot index a ${t}: ${e.name}`);
    }
    case 'list':
      if (!rhs) fail('a list literal can only be the value of a declaration or assignment');
      e.items.forEach(x => ok(typeOf(x, look, fns), 'int') || fail('list items must be ints'));
      return 'list';
    case 'call': {
      const f = fns.get(e.name) || fail(`unknown or later function: ${e.name}`);
      if (e.args.length !== f.params.length) fail(`${e.name} takes ${f.params.length} argument(s)`);
      e.args.forEach((a, i) => {
        const p = f.params[i];
        if (p.type === 'list' && a.k !== 'var' && a.k !== 'blank') fail('list arguments must be list variables');
        if (!ok(typeOf(a, look, fns), p.type)) fail(`argument ${p.name} of ${e.name} must be ${p.type}`);
      });
      if (f.returns === 'void' && !rhs) fail(`${e.name} returns nothing`);
      return f.returns;
    }
    case 'not': if (!ok(typeOf(e.x, look, fns), 'bool')) fail('not needs a condition'); return 'bool';
    case 'and': case 'or':
      e.xs.forEach(x => ok(typeOf(x, look, fns), 'bool') || fail(`${e.k} needs conditions`)); return 'bool';
    case 'bin': {
      const a = typeOf(e.a, look, fns), b = typeOf(e.b, look, fns);
      if (!CMP.has(e.op)) { if (!ok(a, 'int') || !ok(b, 'int')) fail(`${e.op} needs ints (no string concatenation)`); return 'int'; }
      if (e.op !== '==' && e.op !== '!=') { if (!ok(a, 'int') || !ok(b, 'int')) fail(`${e.op} compares ints only`); return 'bool'; }
      if (a === 'any' || b === 'any' || charStr(a, e.b) || charStr(b, e.a)) return 'bool';
      if (a !== b || a === 'list' || a === 'void') fail(`cannot compare ${a} with ${b}`);
      return 'bool';
    }
    default: return fail(`unknown expression: ${e.k}`);
  }
}
const charStr = (t, other) => t === 'char' && other.k === 'str' && other.v.length === 1;

const assigned = (stmts, set = new Set()) => {
  for (const s of stmts) {
    if (['assign', 'augAssign', 'setIndex', 'append'].includes(s.k)) set.add(s.name);
    for (const b of [s.then, s.body, s.els, ...(s.elifs || []).map(a => a.body)]) if (b) assigned(b, set);
  }
  return set;
};
const varsIn = (e, set = new Set()) => {
  if (e.k === 'var' || e.k === 'len' || e.k === 'index') set.add(e.name);
  for (const c of [e.a, e.b, e.x, e.i, ...(e.xs || []), ...(e.args || []), ...(e.items || [])]) if (c) varsIn(c, set);
  return set;
};
const returnsAlways = b => {
  const s = b[b.length - 1];
  return !!s && (s.k === 'return' || (s.k === 'if' && !!s.els && returnsAlways(s.then) && returnsAlways(s.els) && s.elifs.every(a => returnsAlways(a.body))));
};

// ── check ─────────────────────────────────────────────────────────────────────────────────────
export function check(prog) {
  if (!prog || prog.k !== 'program') fail('not a program');
  const all = new Map(), ids = new Set();
  for (const f of prog.fns) {
    if (f.k !== 'fn') fail('program.fns must hold S.fn nodes');
    if (all.has(validName(f.name))) fail(`duplicate function: ${f.name}`);
    if (![...TYPES, 'void'].includes(f.returns)) fail(`bad return type: ${f.returns}`);
    f.params.forEach(p => TYPES.includes(p.type) || fail(`bad param type: ${p.type}`));
    all.set(f.name, f);
  }
  const seen = new Map();
  const walkFn = (stmts, params, fn) => {
    const root = { vars: new Map(), desc: new Set(), parent: null }, loops = [];
    const look = n => { for (let s = sc; s; s = s.parent) if (s.vars.has(n)) return s.vars.get(n); return null; };
    let sc = root;
    const declare = (n, info) => {
      validName(n);
      if (all.has(n)) fail(`${n} is a function name`);
      if (look(n) || sc.desc.has(n)) fail(`${n} is already declared in an enclosing or nested block`);
      sc.vars.set(n, info);
      for (let s = sc.parent; s; s = s.parent) s.desc.add(n);
    };
    const T = (e, rhs) => typeOf(e, look, seen, rhs);
    const writable = n => {
      const v = look(n) || fail(`unknown variable: ${n}`);
      if (v.param && (v.type === 'list' || v.type === 'str')) fail(`${n} is a ${v.type} parameter and cannot be changed`);
      if (loops.some(l => l.has(n))) fail(`${n} cannot change inside this loop (loop variable, range end or iterated list)`);
      return v;
    };
    const listValue = e => (e.k === 'list' || e.k === 'call' || e.k === 'blank' ? 0 : fail('a list variable is set only from a list literal or a call'));
    const blockOf = (b, pre = {}, frozen) => {
      sc = { vars: new Map(), desc: new Set(), parent: sc };
      for (const [n, t] of Object.entries(pre)) declare(n, { type: t });
      if (frozen) loops.push(frozen);
      b.forEach(stmt);
      if (frozen) loops.pop();
      sc = sc.parent;
    };
    const stmt = s => {
      if (s.id != null) { if (ids.has(s.id)) fail(`duplicate statement id: ${s.id}`); ids.add(s.id); }
      switch (s.k) {
        case 'decl': {
          let t = T(s.value, true);
          if (s.type) {
            if (![...TYPES, 'char'].includes(s.type)) fail(`bad type: ${s.type}`);
            if (!ok(t, s.type)) fail(`${s.name}: value is ${t}, not ${s.type}`);
            t = s.type;
          }
          if (t === 'any') t = 'int';
          if (t === 'void') fail('cannot store the result of a void function');
          if (t === 'list') listValue(s.value);
          return declare(s.name, { type: t });
        }
        case 'assign': {
          const v = writable(s.name), t = T(s.value, true);
          if (!ok(t, v.type)) fail(`${s.name} is ${v.type}, value is ${t}`);
          if (v.type === 'list') listValue(s.value);
          return;
        }
        case 'augAssign':
          if (!ok(writable(s.name).type, 'int') || !ok(T(s.value), 'int')) fail(`${s.op}= needs ints`); return;
        case 'setIndex': case 'append':
          if (writable(s.name).type !== 'list') fail(`${s.name} is not a list`);
          if (s.k === 'setIndex' && !ok(T(s.i), 'int')) fail('an index must be an int');
          if (!ok(T(s.value), 'int')) fail('lists hold ints'); return;
        case 'if':
          [s.cond, ...s.elifs.map(a => a.cond)].forEach(c => ok(T(c), 'bool') || fail('an if condition must be a condition'));
          blockOf(s.then); s.elifs.forEach(a => blockOf(a.body)); if (s.els) blockOf(s.els); return;
        case 'while':
          if (!ok(T(s.cond), 'bool')) fail('a while condition must be a condition');
          return blockOf(s.body, {}, new Set());
        case 'forRange':
          if (!ok(T(s.start), 'int') || !ok(T(s.end), 'int')) fail('range bounds must be ints');
          return blockOf(s.body, { [s.v]: 'int' }, new Set([s.v, ...varsIn(s.end)]));
        case 'forEach':
          if ((look(s.list) || fail(`unknown variable: ${s.list}`)).type !== 'list') fail(`${s.list} is not a list`);
          return blockOf(s.body, { [s.v]: 'int' }, new Set([s.v, s.list]));
        case 'return': {
          if (!fn) fail('return is only allowed inside a function');
          if (fn.returns === 'void') { if (s.value) fail(`${fn.name} returns nothing`); return; }
          if (!s.value || !ok(T(s.value), fn.returns)) fail(`${fn.name} must return a ${fn.returns}`);
          if (fn.returns === 'str' && !['str', 'blank'].includes(s.value.k)) fail('a str function returns string literals');
          if (fn.returns === 'list' && s.value.k !== 'blank' && (s.value.k !== 'var' || look(s.value.name).param)) fail('a list function returns a local list variable');
          return;
        }
        case 'print': if (!['int', 'str', 'char', 'any'].includes(T(s.value))) fail('print only ints, strings or chars'); return;
        case 'exprStmt': if (s.value.k !== 'call' && s.value.k !== 'blank') fail('an expression statement must be a call'); T(s.value, true); return;
        case 'break': case 'continue': if (!loops.length) fail(`${s.k} outside a loop`); return;
        case 'blank': return;
        default: fail(`unknown statement: ${s.k}`);
      }
    };
    for (const p of params) declare(p.name, { type: p.type, param: true });
    if (new Set(params.map(p => p.name)).size !== params.length) fail('duplicate parameter');
    stmts.forEach(stmt);
    if (fn && fn.returns !== 'void' && !returnsAlways(stmts)) fail(`${fn.name} must end in return on every path`);
  };
  for (const f of prog.fns) {
    if (f.id != null) { if (ids.has(f.id)) fail(`duplicate statement id: ${f.id}`); ids.add(f.id); }
    seen.set(f.name, f);
    walkFn(f.body, f.params, f);
  }
  walkFn(prog.main, [], null);
  return true;
}

// ── Rendering ─────────────────────────────────────────────────────────────────────────────────
const PYL = l => l === 'python' || l === 'gdscript';
const BRACE = l => !PYL(l);
const JSL = l => l === 'javascript' || l === 'typescript';
const SEMI = l => BRACE(l) && l !== 'go';
// Languages whose if/while conditions sit in brackets.
const PAREN = new Set(['csharp', 'cpp', 'java', 'javascript', 'typescript']);
const P = { or: 1, and: 2, not: 3, cmp: 4, add: 6, mul: 7, cast: 7.5, neg: 8, atom: 10 };
const TY = {
  csharp: { int: 'int', str: 'string', char: 'char', bool: 'bool', list: 'List<int>', void: 'void' },
  cpp: { int: 'int', str: 'std::string', char: 'char', bool: 'bool', list: 'std::vector<int>', void: 'void' },
  gdscript: { int: 'int', str: 'String', char: 'String', bool: 'bool', list: 'Array[int]', void: 'void' },
  rust: { int: 'i64', str: "&'static str", bool: 'bool', list: 'Vec<i64>' },
  typescript: { int: 'number', str: 'string', char: 'string', bool: 'boolean', list: 'number[]', void: 'void' },
  java: { int: 'int', str: 'String', char: 'char', bool: 'boolean', list: 'List<Integer>', void: 'void' },
  go: { int: 'int', str: 'string', char: 'byte', bool: 'bool', list: '[]int' },
};
const PARAM = {
  cpp: { list: 'const std::vector<int>&', str: 'const std::string&' },
  rust: { int: 'i64', str: '&str', bool: 'bool', list: '&[i64]' },
};

function ctx(lang, prog) {
  if (!isLang(lang)) fail(`unknown language: ${lang}`);
  const c = { lang, fns: new Map((prog?.fns || []).map(f => [f.name, f])), lines: [], lineOf: new Map(),
    depth: 0, frames: [new Map()], mut: new Set(), rebound: new Set(), blankStmt: false, auto: 0, fallback: null };
  c.look = n => { for (let i = c.frames.length - 1; i >= 0; i--) if (c.frames[i].has(n)) return c.frames[i].get(n); return c.fallback ? c.fallback(n) : null; };
  return c;
}
const emit = (c, text, id) => { c.lines.push(text ? '    '.repeat(c.depth) + text : ''); if (id != null) c.lineOf.set(id, c.lines.length); };
const tOf = (c, e) => { try { return typeOf(e, c.look, c.fns, true); } catch { return 'any'; } };
const atom = t => ({ t, p: P.atom });
const wrap = r => (r.p >= P.atom ? r.t : `(${r.t})`);

// bare: 'print' | 'rhs' | 'cmp0' | 'loopEnd' — contexts where C++ size()/Rust len() need no cast
function rx(c, e, bare) {
  const L = c.lang, py = PYL(L);
  switch (e.k) {
    case 'int': return { t: String(e.v), p: e.v < 0 ? P.neg : P.atom };
    case 'str': return atom(`"${e.v}"`);
    case 'bool': return atom(L === 'python' ? (e.v ? 'True' : 'False') : String(e.v));
    case 'blank': return atom(e.text);
    case 'var': return atom(ident(e.name, L));
    case 'len': {
      const n = ident(e.name, L), str = c.look(e.name)?.type === 'str';
      if (JSL(L)) return atom(`${n}.length`);
      if (L === 'java') return atom(`${n}.${str ? 'length' : 'size'}()`);
      if (L === 'go') return atom(`len(${n})`);
      if (L === 'python') return atom(`len(${n})`);
      if (L === 'gdscript') return atom(`${n}.${str ? 'length' : 'size'}()`);
      if (L === 'csharp') return atom(`${n}.${str ? 'Length' : 'Count'}`);
      if (L === 'cpp') { const t = `${n}.${str ? 'length' : 'size'}()`; return bare ? atom(t) : { t: `(int)${t}`, p: P.neg }; }
      return bare === 'print' || bare === 'cmp0' ? atom(`${n}.len()`) : { t: `${n}.len() as i64`, p: P.cast };
    }
    case 'index': {
      const n = ident(e.name, L);
      if (L === 'java') return atom(`${n}.${c.look(e.name)?.type === 'str' ? 'charAt' : 'get'}(${rx(c, e.i).t})`);
      if (L !== 'rust') return atom(`${n}[${rx(c, e.i).t}]`);
      const i = rsIdx(c, e.i);
      return c.look(e.name)?.type === 'str' ? { t: `${n}.as_bytes()[${i}] as char`, p: P.cast } : atom(`${n}[${i}]`);
    }
    case 'call': {
      const f = c.fns.get(e.name);
      const args = e.args.map((a, i) => (L === 'rust' && f?.params[i]?.type === 'list' && a.k === 'var' && !c.look(a.name)?.param
        ? `&${ident(a.name, L)}` : rx(c, a, 'rhs').t));
      return atom(`${ident(e.name, L, 'fn')}(${args.join(', ')})`);
    }
    case 'list': {
      const xs = e.items.map(x => rx(c, x).t).join(', ');
      if (py || JSL(L)) return atom(`[${xs}]`);
      if (L === 'java') return atom(xs ? `new ArrayList<>(List.of(${xs}))` : 'new ArrayList<>()');
      if (L === 'go') return atom(`[]int{${xs}}`);
      if (L === 'csharp') return atom(xs ? `new List<int> { ${xs} }` : 'new List<int>()');
      if (L === 'cpp') return atom(`{${xs}}`);
      return atom(xs ? `vec![${xs}]` : 'Vec::new()');
    }
    case 'not': { const x = wrap(rx(c, e.x)); return py ? { t: `not ${x}`, p: P.not } : { t: `!${x}`, p: P.neg }; }
    case 'and': case 'or': {
      const p = P[e.k], op = py ? e.k : e.k === 'and' ? '&&' : '||';
      return { p, t: e.xs.map(x => { const r = rx(c, x); return r.p < p || ((x.k === 'and' || x.k === 'or') && x.k !== e.k) ? `(${r.t})` : r.t; }).join(` ${op} `) };
    }
    case 'bin': {
      const op = e.op, cmp = CMP.has(op), p = cmp ? P.cmp : '+-'.includes(op) ? P.add : P.mul;
      const eq = op === '==' || op === '!=';
      // Java: strings compare with equals() (== compares references).
      if (L === 'java' && eq && tOf(c, e.a) === 'str' && tOf(c, e.b) === 'str') {
        const t = `${wrap(rx(c, e.a))}.equals(${rx(c, e.b, 'rhs').t})`;
        return op === '==' ? atom(t) : { t: `!${t}`, p: P.neg };
      }
      // Java: two List<Integer> items are boxed Integers, so one is unboxed with (int) before == / !=.
      const listItem = x => x.k === 'index' && c.look(x.name)?.type === 'list';
      const unbox = L === 'java' && eq && listItem(e.a) && listItem(e.b);
      const asChar = x => !py && !JSL(L) && eq && x.k === 'str' && x.v.length === 1 && tOf(c, x === e.a ? e.b : e.a) === 'char';
      const side = (x, right) => {
        if (asChar(x)) return `'${x.v}'`;
        if (unbox && !right) return `(int)${rx(c, x).t}`;
        const other = right ? e.a : e.b;
        const r = rx(c, x, cmp && other.k === 'int' && other.v >= 0 ? 'cmp0' : undefined);
        const w = cmp ? r.p <= P.cmp || (L === 'rust' && !right && (op === '<' || op === '<=') && / as \w+$/.test(r.t))
          : right ? r.p <= p || (x.k === 'int' && x.v < 0) : r.p < p;
        return w ? `(${r.t})` : r.t;
      };
      const t = `${side(e.a, false)} ${L === 'python' && op === '/' ? '//' : JSL(L) && eq ? op + '=' : op} ${side(e.b, true)}`;
      // JavaScript numbers are doubles: whole-number division is Math.floor(a / b) (operands are never negative).
      if (JSL(L) && op === '/') return atom(`Math.floor(${t})`);
      return { t, p };
    }
    default: return fail(`unknown expression: ${e.k}`);
  }
}
// Rust index as usize: literals and len() stay usize; anything else gets `as usize`.
function rsIdx(c, e) {
  if (e.k === 'int' && e.v >= 0) return String(e.v);
  if (e.k === 'len') return `${e.name}.len()`;
  if (e.k === 'bin' && '+-'.includes(e.op) && e.a.k === 'len' && e.b.k === 'int' && e.b.v >= 0) return `${e.a.name}.len() ${e.op} ${e.b.v}`;
  return `${wrap(rx(c, e))} as usize`;
}

const cond = (c, e) => { const t = rx(c, e).t; return PAREN.has(c.lang) ? `(${t})` : t; };
function open(c, header, id) {
  if (c.lang === 'csharp') { emit(c, header, id); emit(c, '{'); } else emit(c, header + (BRACE(c.lang) ? ' {' : ':'), id);
}
const close = c => BRACE(c.lang) && emit(c, '}');
function block(c, stmts, pre = {}) {
  c.frames.push(new Map(Object.entries(pre).map(([n, t]) => [n, { type: t }])));
  c.depth++;
  if (!stmts.length && PYL(c.lang)) emit(c, 'pass');
  stmts.forEach(s => stmt(c, s));
  c.depth--; c.frames.pop();
}

function rangeHeader(c, s) {
  const L = c.lang, v = ident(s.v, L), k = Math.abs(s.step), up = s.step > 0;
  const a = rx(c, s.start).t, b = rx(c, s.end, up && s.start.k === 'int' && s.start.v >= 0 ? 'loopEnd' : undefined).t;
  if (PYL(L)) {
    const args = s.step === 1 ? (s.start.k === 'int' && s.start.v === 0 ? [b] : [a, b]) : [a, b, s.step];
    return `for ${v} in range(${args.join(', ')})`;
  }
  if (L !== 'rust') {
    const inc = k === 1 ? `${v}${up ? '++' : '--'}` : `${v} ${up ? '+=' : '-='} ${k}`;
    if (L === 'go') return `for ${v} := ${a}; ${v} ${up ? '<' : '>'} ${b}; ${inc}`;
    return `for (${JSL(L) ? 'let' : 'int'} ${v} = ${a}; ${v} ${up ? '<' : '>'} ${b}; ${inc})`;
  }
  if (up) return k === 1 ? `for ${v} in ${a}..${b}` : `for ${v} in (${a}..${b}).step_by(${k})`;
  const lo = s.end.k === 'int' ? String(s.end.v + 1) : `${b} + 1`;
  return `for ${v} in (${lo}..=${a}).rev()${k === 1 ? '' : `.step_by(${k})`}`;
}

function stmt(c, s) {
  const L = c.lang, id = s.id ?? `#${++c.auto}`, semi = SEMI(L) ? ';' : '';
  const X = (e, bare) => rx(c, e, bare).t, n = s.name != null ? ident(s.name, L) : '';
  switch (s.k) {
    case 'decl': {
      let t = s.type || tOf(c, s.value); if (t === 'any') t = 'int';
      c.frames[c.frames.length - 1].set(s.name, { type: t });
      const v = X(s.value, 'rhs'), emptyList = s.value.k === 'list' && !s.value.items.length;
      if (JSL(L)) {
        // const unless the name is reassigned later (or a whole blank line might reassign it)
        const kw = c.rebound.has(s.name) || c.blankStmt ? 'let' : 'const';
        const ann = L === 'typescript' && (emptyList || s.value.k === 'blank') ? `: ${TY.typescript[t]}` : '';
        return emit(c, `${kw} ${n}${ann} = ${v};`, id);
      }
      if (L === 'java') return emit(c, `${TY.java[t]} ${n} = ${v};`, id);
      if (L === 'go') return emit(c, `${n} := ${emptyList ? '[]int{}' : v}`, id);
      const text = L === 'python' ? `${n} = ${v}`
        : L === 'gdscript' ? `var ${n}: ${TY.gdscript[t]} = ${v}`
        : L === 'rust' ? `let ${c.mut.has(s.name) ? 'mut ' : ''}${n}${emptyList ? ': Vec<i64>' : ''} = ${v};`
        : L === 'cpp' && emptyList ? `std::vector<int> ${n};`
        : `${TY[L][t]} ${n} = ${v};`;
      return emit(c, text, id);
    }
    case 'assign': return emit(c, `${n} = ${X(s.value, 'rhs')}${semi}`, id);
    case 'augAssign':
      if (JSL(L) && s.op === '/') return emit(c, `${n} = ${X(E.bin('/', E.var(s.name), s.value))};`, id);
      return emit(c, `${n} ${L === 'python' && s.op === '/' ? '//' : s.op}= ${X(s.value, 'rhs')}${semi}`, id);
    case 'setIndex':
      if (L === 'java') return emit(c, `${n}.set(${X(s.i)}, ${X(s.value, 'rhs')});`, id);
      return emit(c, `${n}[${L === 'rust' ? rsIdx(c, s.i) : X(s.i)}] = ${X(s.value, 'rhs')}${semi}`, id);
    case 'append': {
      if (L === 'go') return emit(c, `${n} = append(${n}, ${X(s.value, 'rhs')})`, id);
      const m = { python: 'append', gdscript: 'append', csharp: 'Add', cpp: 'push_back', rust: 'push',
        javascript: 'push', typescript: 'push', java: 'add' }[L];
      return emit(c, `${n}.${m}(${X(s.value, 'rhs')})${semi}`, id);
    }
    case 'print': {
      const r = rx(c, s.value, 'print');
      if (JSL(L)) return emit(c, `console.log(${r.t});`, id);
      if (L === 'java') return emit(c, `System.out.println(${r.t});`, id);
      // Go: s[i] is a byte, printed as a number unless turned back into a string
      if (L === 'go') return emit(c, `fmt.Println(${tOf(c, s.value) === 'char' ? `string(${r.t})` : r.t})`, id);
      const text = PYL(L) ? `print(${r.t})` : L === 'csharp' ? `Console.WriteLine(${r.t});`
        : L === 'cpp' ? `std::cout << ${s.value.k === 'bin' ? `(${r.t})` : r.t} << "\\n";` : `println!("{}", ${r.t});`;
      return emit(c, text, id);
    }
    case 'return': return emit(c, s.value ? `return ${X(s.value, 'rhs')}${semi}` : `return${semi}`, id);
    case 'exprStmt': return emit(c, s.value.k === 'blank' ? X(s.value) : `${X(s.value, 'rhs')}${semi}`, id);
    case 'break': case 'continue': return emit(c, `${s.k}${semi}`, id);
    case 'blank': return emit(c, s.text, id);
    case 'if': {
      open(c, `if ${cond(c, s.cond)}`, id); block(c, s.then);
      const arms = [...s.elifs.map((a, i) => [a.cond, a.body, `${id}.elif${i}`]), ...(s.els ? [[null, s.els, `${id}.else`]] : [])];
      for (const [cnd, b, key] of arms) {
        const head = cnd ? `${PYL(L) ? 'elif' : 'else if'} ${cond(c, cnd)}` : 'else';
        if (PYL(L)) emit(c, `${head}:`, key);
        else if (L === 'csharp') { emit(c, '}'); emit(c, head, key); emit(c, '{'); }
        else emit(c, `} ${head} {`, key);
        block(c, b);
      }
      return close(c);
    }
    case 'while': open(c, `${L === 'go' ? 'for' : 'while'} ${cond(c, s.cond)}`, id); block(c, s.body); return close(c);
    case 'forRange': open(c, rangeHeader(c, s), id); block(c, s.body, { [s.v]: 'int' }); return close(c);
    case 'forEach': {
      const v = ident(s.v, L), xs = ident(s.list, L);
      const head = PYL(L) ? `for ${v} in ${xs}` : L === 'csharp' ? `foreach (int ${v} in ${xs})`
        : L === 'cpp' || L === 'java' ? `for (int ${v} : ${xs})` : JSL(L) ? `for (const ${v} of ${xs})`
        // Go rejects an unused loop variable, so a body that never reads it gets `for range xs`.
        : L === 'go' ? (readsVar(s.body, s.v) ? `for _, ${v} := range ${xs}` : `for range ${xs}`)
        : `for &${v} in ${c.look(s.list)?.param ? '' : '&'}${xs}`;
      open(c, head, id); block(c, s.body, { [s.v]: 'int' }); return close(c);
    }
    default: fail(`unknown statement: ${s.k}`);
  }
}

// Does any statement in `stmts` (nested blocks too) read variable `n`?
const readsVar = (stmts, n) => stmts.some(s =>
  [s.value, s.cond, s.i, s.start, s.end, ...(s.elifs || []).map(a => a.cond)].some(e => e && varsIn(e).has(n))
  || [s.then, s.body, s.els, ...(s.elifs || []).map(a => a.body)].some(b => b && readsVar(b, n)));
// Names reassigned by assign/augAssign (JS const vs let), and whether a whole blank line could do it.
const rebound = (stmts, set = new Set()) => {
  for (const s of stmts) {
    if (s.k === 'assign' || s.k === 'augAssign') set.add(s.name);
    for (const b of [s.then, s.body, s.els, ...(s.elifs || []).map(a => a.body)]) if (b) rebound(b, set);
  }
  return set;
};
const hasBlankStmt = stmts => stmts.some(s => s.k === 'blank' || (s.k === 'exprStmt' && s.value.k === 'blank')
  || [s.then, s.body, s.els, ...(s.elifs || []).map(a => a.body)].some(b => b && hasBlankStmt(b)));
const setScope = (c, stmts) => { c.mut = assigned(stmts); c.rebound = rebound(stmts); c.blankStmt = hasBlankStmt(stmts); };

function fnHeader(c, f) {
  const L = c.lang, name = ident(f.name, L, 'fn'), r = f.returns;
  const ps = f.params.map(p => {
    const pn = ident(p.name, L);
    if (L === 'javascript') return pn;
    if (L === 'typescript') return `${pn}: ${TY.typescript[p.type]}`;
    if (L === 'go') return `${pn} ${TY.go[p.type]}`;
    if (L === 'python') return pn;
    if (L === 'gdscript') return `${pn}: ${TY.gdscript[p.type]}`;
    if (L === 'rust') return `${c.mut.has(p.name) ? 'mut ' : ''}${pn}: ${PARAM.rust[p.type]}`;
    return `${(L === 'cpp' && PARAM.cpp[p.type]) || TY[L][p.type]} ${pn}`;
  }).join(', ');
  if (L === 'javascript') return `function ${name}(${ps})`;
  if (L === 'typescript') return `function ${name}(${ps}): ${TY.typescript[r]}`;
  if (L === 'java') return `static ${TY.java[r]} ${name}(${ps})`;
  if (L === 'go') return `func ${name}(${ps})${r === 'void' ? '' : ` ${TY.go[r]}`}`;
  if (L === 'python') return `def ${name}(${ps})`;
  if (L === 'gdscript') return `func ${name}(${ps}) -> ${TY.gdscript[r]}`;
  if (L === 'csharp') return `static ${TY.csharp[r]} ${name}(${ps})`;
  if (L === 'cpp') return `${TY.cpp[r]} ${name}(${ps})`;
  return `fn ${name}(${ps})${r === 'void' ? '' : ` -> ${TY.rust[r]}`}`;
}

export function render(prog, lang, opts = {}) {
  check(prog);
  const c = ctx(lang, prog), L = lang;
  if (L === 'gdscript') { emit(c, 'extends Node'); emit(c, ''); }
  prog.fns.forEach((f, i) => {
    setScope(c, f.body);
    c.frames = [new Map(f.params.map(p => [p.name, { type: p.type, param: true }]))];
    const fid = f.id ?? `#${++c.auto}`;
    open(c, fnHeader(c, f), fid);
    c.depth++; if (!f.body.length && PYL(L)) emit(c, 'pass'); f.body.forEach(s => stmt(c, s)); c.depth--;
    close(c);
    if (i < prog.fns.length - 1 || prog.main.length) emit(c, '');
  });
  if (prog.main.length) {
    setScope(c, prog.main); c.frames = [new Map()];
    const head = { gdscript: 'func _ready() -> void', cpp: 'int main()', rust: 'fn main()', java: 'void main()', go: 'func main()' }[L];
    if (head) { if (L === 'gdscript') emit(c, head + ':', '#main'); else open(c, head, '#main'); c.depth++; }
    prog.main.forEach(s => stmt(c, s));
    if (head) { c.depth--; close(c); }
  }
  const w = String(c.lines.length).length;
  const code = opts.lineNumbers
    ? c.lines.map((l, i) => `${String(i + 1).padStart(w)} |${l ? ' ' + l : ''}`).join('\n') : c.lines.join('\n');
  return { code, lines: c.lines.slice(), lineOf: c.lineOf };
}

export const lineAt = (rendered, id) => {
  const n = rendered.lineOf.get(id);
  return n ? rendered.lines[n - 1].trim() : '';
};
export const fence = lang => (LANGUAGES.find(l => l.id === lang) || fail(`unknown language: ${lang}`)).fence;
export const codeBlock = (prog, lang, opts = {}) => '```' + fence(lang) + '\n' + render(prog, lang, opts).code + '\n```';

// Context (variable types, list params, Rust mut) for one-off expressions/lines.
function looseCtx(lang, opts = {}) {
  const c = ctx(lang, opts.program), known = new Map();
  if (opts.program) {
    const f = opts.fn ? opts.program.fns.find(x => x.name === opts.fn) : null;
    const b = f ? f.body : opts.program.main;
    f?.params.forEach(p => known.set(p.name, { type: p.type, param: true }));
    const walk = stmts => stmts.forEach(s => {
      if (s.k === 'decl' && !known.has(s.name)) {
        const t = s.type || typeOf(s.value, n => known.get(n) || { type: 'any' }, c.fns, true);
        known.set(s.name, { type: t === 'any' ? 'int' : t });
      }
      if (s.k === 'forRange' || s.k === 'forEach') known.set(s.v, { type: 'int' });
      for (const x of [s.then, s.body, s.els, ...(s.elifs || []).map(a => a.body)]) if (x) walk(x);
    });
    walk(b); setScope(c, b);
  }
  for (const [k, t] of Object.entries(opts.types || {})) known.set(k, typeof t === 'string' ? { type: t } : t);
  c.fallback = n => known.get(n) || { type: 'any' };
  return c;
}
export const renderExpr = (expr, lang, opts = {}) => rx(looseCtx(lang, opts), ex(expr)).t;
export function renderStmtLine(s, lang, opts = {}) {
  const c = looseCtx(lang, opts);
  stmt(c, s);
  return c.lines[0].trim();
}

// ── Interpreter ───────────────────────────────────────────────────────────────────────────────
class Scope {
  constructor(parent) { this.vars = new Map(); this.parent = parent; }
  find(n) { for (let s = this; s; s = s.parent) if (s.vars.has(n)) return s; return fail(`unknown variable: ${n}`); }
  get(n) { return this.find(n).vars.get(n); }
  set(n, v) { this.find(n).vars.set(n, v); }
}
const BRK = { k: 'break' }, CNT = { k: 'continue' };

export function run(prog, { entry, args = [], maxSteps = 10000 } = {}) {
  check(prog);
  const fns = new Map(prog.fns.map(f => [f.name, f])), output = [], TIMEOUT = {};
  let steps = 0, depth = 0;
  const tick = () => { if (++steps > maxSteps) throw TIMEOUT; };
  const num = v => (Math.abs(v) <= INT_MAX ? v : fail(`integer overflow: ${v} is beyond ±${INT_MAX}`));
  const arith = (op, a, b) => {
    if ((op === '/' || op === '%') && b === 0) fail('division by zero');
    if ((op === '/' || op === '%') && (a < 0 || b < 0)) fail(`${op} with a negative operand differs between languages`);
    switch (op) {
      case '+': return num(a + b);
      case '-': return num(a - b);
      case '*': return num(a * b) || 0;
      case '/': return Math.trunc(a / b);
      default: return a % b;
    }
  };
  const at = (xs, i) => (i >= 0 && i < xs.length ? i : fail(`index ${i} out of range (length ${xs.length})`));
  const ev = (e, env) => {
    switch (e.k) {
      case 'int': case 'str': case 'bool': return e.v;
      case 'blank': return fail('cannot run code with a blank');
      case 'var': return env.get(e.name);
      case 'len': return env.get(e.name).length;
      case 'index': { const xs = env.get(e.name); return xs[at(xs, ev(e.i, env))]; }
      case 'list': return e.items.map(x => ev(x, env));
      case 'call': return call(fns.get(e.name), e.args.map(a => ev(a, env)));
      case 'not': return !ev(e.x, env);
      case 'and': return e.xs.every(x => ev(x, env));
      case 'or': return e.xs.some(x => ev(x, env));
      case 'bin': {
        const a = ev(e.a, env), b = ev(e.b, env);
        switch (e.op) {
          case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
          case '==': return a === b; case '!=': return a !== b;
          default: return arith(e.op, a, b);
        }
      }
    }
    return fail(`unknown expression: ${e.k}`);
  };
  const call = (f, argv) => {
    if (++depth > 100) fail('recursion too deep');
    const env = new Scope(null);
    f.params.forEach((p, i) => env.vars.set(p.name, argv[i]));
    const sig = execBlock(f.body, env);
    depth--;
    return sig && sig.k === 'return' ? sig.v : undefined;
  };
  const loopSig = sig => (sig === BRK ? 'break' : sig === CNT || !sig ? null : sig);
  const execBlock = (stmts, parent, pre) => {
    const env = new Scope(parent);
    if (pre) env.vars.set(pre[0], pre[1]);
    for (const s of stmts) { const sig = exec(s, env); if (sig) return sig; }
    return null;
  };
  const exec = (s, env) => {
    tick();
    switch (s.k) {
      case 'decl': env.vars.set(s.name, ev(s.value, env)); return null;
      case 'assign': env.set(s.name, ev(s.value, env)); return null;
      case 'augAssign': env.set(s.name, arith(s.op, env.get(s.name), ev(s.value, env))); return null;
      case 'setIndex': { const xs = env.get(s.name); xs[at(xs, ev(s.i, env))] = ev(s.value, env); return null; }
      case 'append': env.get(s.name).push(ev(s.value, env)); return null;
      case 'print': output.push(String(ev(s.value, env))); return null;
      case 'exprStmt': ev(s.value, env); return null;
      case 'return': return { k: 'return', v: s.value ? ev(s.value, env) : undefined };
      case 'break': return BRK;
      case 'continue': return CNT;
      case 'blank': return fail('cannot run code with a blank');
      case 'if': {
        if (ev(s.cond, env)) return execBlock(s.then, env);
        for (const a of s.elifs) if (ev(a.cond, env)) return execBlock(a.body, env);
        return s.els ? execBlock(s.els, env) : null;
      }
      case 'while':
        while (ev(s.cond, env)) {
          tick();
          const r = loopSig(execBlock(s.body, env));
          if (r === 'break') break; if (r) return r;
        }
        return null;
      case 'forRange': {
        const a = ev(s.start, env), b = ev(s.end, env);
        for (let i = a; s.step > 0 ? i < b : i > b; i = num(i + s.step)) {
          tick();
          const r = loopSig(execBlock(s.body, env, [s.v, i]));
          if (r === 'break') break; if (r) return r;
        }
        return null;
      }
      case 'forEach': {
        const xs = env.get(s.list);
        for (let j = 0; j < xs.length; j++) {
          tick();
          const r = loopSig(execBlock(s.body, env, [s.v, xs[j]]));
          if (r === 'break') break; if (r) return r;
        }
        return null;
      }
    }
    return fail(`unknown statement: ${s.k}`);
  };
  let returned, timedOut = false;
  try {
    if (entry != null) {
      const f = fns.get(entry) || fail(`unknown function: ${entry}`);
      if (args.length !== f.params.length) fail(`${entry} takes ${f.params.length} argument(s)`);
      returned = call(f, args.map(a => (Array.isArray(a) ? a.slice() : a)));
    } else execBlock(prog.main, null);
  } catch (err) {
    if (err === TIMEOUT) timedOut = true;
    else { if (err instanceof CodeLangError) err.output = output.slice(); throw err; }
  }
  return { output, returned, steps, timedOut };
}

// ── Blocks (tiles) for one line of code ────────────────────────────────────────────────────────
// Turns ONE rendered line or expression (any language) into answer blocks for a "type it or build it"
// question. Blocks are joined by single spaces; a call `f(…)`, an index `xs[…]` and a C-style
// keyword header `for (…)` / `if (…)` / `while (…)` become slot tiles that hold their inner blocks
// (`{ value, label, slot: { open, close, sep } }`); a bare bracket group `(a + b)` is a slot tile with
// value "(", open "" and close ")". `,` `;` and a `:` with no space before it stick to the block
// before them ("1," in `range(1, n + 1)`); only a call with a slot block before a comma
// (`f(xs[0], y)`) uses sep ", " instead, which needs every argument to be one block. A C++ `(int)`
// or `(double)` cast, a C# `!` and a Rust `&` stick to the following block; a C++ reference
// `int& x` keeps the `&` on the type block (`int&`). Lines that do not fit this shape
// (a comma after a slot inside mixed arguments, nesting deeper than 3) give null, so a generator
// can redraw.
//   lineTree(text)                → [item…] | null   item: { v } or { v, open, close, sep, kids:[item…] }
//   serialiseTree(items, joiner=' ')   back to text (lineTree(t) serialises to exactly t, or is null)
//   blocksFor(text, { distractors=[texts], count=0, seed=1 }) → { tiles, solution, joiner:' ', useAll:false } | null
//        tiles shuffled with `seed`; up to `count` extra blocks (all different) taken in order from the
//        distractor texts' blocks that the answer does not already use; solution = tree of tile indices.
//   decoyTokens(text, lang?)      spare one-block distractors: sibling operators, numbers ± 1 (comparisons
//        use === / !== for javascript/typescript, or when the line already does)
//   JavaScript `===`/`!==` and Go `:=` are single operator blocks; a Java `(int)` cast sticks to the next
//   block like C++'s. Go and other brace headers ending in `{` give null (strip the `{` first).
//   serialiseBlocks(tiles, solution, joiner=' ')  the text a solution tree builds (null if malformed)
//   textKey(text)                 the engine's text normalisation (for accepts lists)
//   spacingVariants(text)         the line with every subset of `a + b` operator gaps written as `a+b`
//        (all subsets for up to 4 operators, else spaced + fully compact + one-at-a-time), spaced first.

const LX_OPS = ['===', '!==', '..=', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '//', '->', '<', '>', '+', '-', '*', '/', '%', '='];
const LX_WORD = /^(?:\((?:int|double)\))?[&!]?(?:-?[A-Za-z0-9_]+(?:(?:\.\.=?|\.|::)[A-Za-z0-9_]+)*(?:\(\))?(?:\+\+|--)?(?:&(?= ))?|"[^"]*"|'[^']*')/;
const KW_SLOT = new Set(['for', 'if', 'while', 'foreach']);

function lexLine(text) {
  const toks = [];
  let i = 0, sp = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ') { sp = true; i++; continue; }
    const rest = text.slice(i);
    let m = rest.match(LX_WORD);
    // A leading '-' is only a negative literal when it is glued to a digit (binary minus is spaced).
    if (m && m[0].startsWith('-') && !/^-\d/.test(m[0])) m = null;
    if (m) { toks.push({ k: 'w', t: m[0], sp }); i += m[0].length; sp = false; continue; }
    // Go's short declaration `:=` is one operator block.
    if (rest.startsWith(':=')) { toks.push({ k: 'w', t: ':=', sp }); i += 2; sp = false; continue; }
    if ('()[],;:{}'.includes(ch)) { toks.push({ k: ch, t: ch, sp }); i++; sp = false; continue; }
    const op = LX_OPS.find(o => rest.startsWith(o));
    if (!op) return null;
    toks.push({ k: 'w', t: op, sp }); i += op.length; sp = false;
  }
  return toks;
}

export function lineTree(text) {
  if (typeof text !== 'string' || !text.trim() || /\s{2}|^\s|\s$/.test(text)) return null;
  const toks = lexLine(text);
  if (!toks) return null;
  let i = 0;
  const glue = (items, t) => {
    const prev = items[items.length - 1];
    if (!prev || prev.kids) return false;
    prev.v += t; return true;
  };
  // Parses until `closer`; returns items, with ',' markers when `args` (inside a call's brackets).
  const seq = (closer, args) => {
    const items = [];
    while (i < toks.length) {
      const t = toks[i];
      if (t.k === closer) { i++; return items; }
      if (t.k === '(') {
        // A bare bracket group, e.g. Rust `xs[(i - 1) as usize]`: a slot tile "(" whose open text is empty.
        i++;
        const kids = seq(')', false);
        if (!kids || !kids.length) return null;
        items.push({ v: '(', open: '', close: ')', sep: ' ', kids });
        continue;
      }
      if (t.k === ')' || t.k === ']' || t.k === '{' || t.k === '}' || t.k === '[') return null;
      if (t.k === ',' || t.k === ';' || (t.k === ':' && !t.sp)) {
        if (t.sp) return null;
        i++;
        if (args && t.k === ',') { items.push({ comma: true }); continue; }
        if (!glue(items, t.t)) return null;
        continue;
      }
      if (t.k === ':') { items.push({ v: ':' }); i++; continue; }
      i++;
      const nx = toks[i];
      if (nx && (nx.k === '(' || nx.k === '[') && (!nx.sp || (nx.k === '(' && KW_SLOT.has(t.t)))) {
        const kw = nx.sp;
        i++;
        const kids = seq(nx.k === '(' ? ')' : ']', nx.k === '(' && !kw);
        if (!kids) return null;
        const slot = settle(kids);
        if (!slot) return null;
        items.push({ v: t.t, open: kw ? ' (' : nx.k, close: nx.k === '(' ? ')' : ']', sep: slot.sep, kids: slot.kids });
        continue;
      }
      items.push({ v: t.t });
    }
    return closer ? null : items;
  };
  // Decide how a slot's children are separated: commas stick to the block before them ("1,") and the
  // children are space-separated; only when a comma follows a slot block (which cannot take it) and
  // every argument is a single block, the slot uses sep ", " instead.
  const settle = kids => {
    if (!kids.some(k => k.comma)) return kids.length ? { sep: ' ', kids } : null;
    const out = [];
    let glued = true;
    for (const k of kids) if (k.comma ? !glue(out, ',') : !out.push(k)) { glued = false; break; }
    if (glued) return { sep: ' ', kids: out };
    const groups = [[]];
    kids.forEach(k => (k.comma ? groups.push([]) : groups[groups.length - 1].push(k)));
    if (groups.every(g => g.length === 1)) return { sep: ', ', kids: groups.map(g => g[0]) };
    return null;
  };
  const items = seq(null, false);
  if (!items || !items.length) return null;
  const depth = xs => Math.max(0, ...xs.map(x => (x.kids ? 1 + depth(x.kids) : 0)));
  if (depth(items) > 3) return null;
  return serialiseTree(items) === text ? items : null;
}

export const serialiseTree = (items, joiner = ' ') =>
  items.map(x => (x.kids ? x.v + x.open + serialiseTree(x.kids, x.sep) + x.close : x.v)).join(joiner);

const tileOf = x => (x.kids
  ? { value: x.v, label: `${x.v}${x.open}…${x.close}`, slot: { open: x.open, close: x.close, sep: x.sep } }
  : { value: x.v, label: x.v });
const tileKey = t => JSON.stringify([t.value, t.slot ? [t.slot.open, t.slot.close, t.slot.sep] : null]);
const flatTiles = (items, out = []) => { for (const x of items) { out.push(tileOf(x)); if (x.kids) flatTiles(x.kids, out); } return out; };

// Fisher-Yates with a local mulberry32, so the order depends only on `seed`.
function seededShuffle(arr, seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function blocksFor(text, { distractors = [], count = 0, seed = 1 } = {}) {
  const items = lineTree(text);
  if (!items) return null;
  // Number every answer block in tree order.
  const real = [];
  const number = xs => xs.map(x => { const n = real.push(tileOf(x)) - 1; return x.kids ? { t: n, kids: number(x.kids) } : n; });
  const tree = number(items);
  const have = new Map();
  real.forEach(t => have.set(tileKey(t), (have.get(tileKey(t)) || 0) + 1));
  const extra = [], taken = new Set(), looks = new Map(real.map(t => [t.label, tileKey(t)]));
  for (const d of distractors) {
    if (extra.length >= count) break;
    const di = lineTree(d);
    if (!di) continue;
    const need = new Map();
    for (const t of flatTiles(di)) {
      const k = tileKey(t);
      need.set(k, (need.get(k) || 0) + 1);
      // (a block that looks like another one but serialises differently would be a trap: skip it)
      if (looks.has(t.label) && looks.get(t.label) !== k) continue;
      if (need.get(k) > (have.get(k) || 0) && extra.length < count && !taken.has(k)) { extra.push(t); taken.add(k); looks.set(t.label, k); have.set(k, (have.get(k) || 0) + 1); }
    }
  }
  const all = [...real, ...extra];
  if (all.length < 2 || all.length > 24) return null;
  const order = seededShuffle(all.map((_, k) => k), seed); // order[pos] = original index
  const pos = new Map(order.map((orig, p) => [orig, p]));
  const remap = xs => xs.map(x => (typeof x === 'number' ? pos.get(x) : { t: pos.get(x.t), kids: remap(x.kids) }));
  return { tiles: order.map(k => all[k]), solution: remap(tree), joiner: ' ', useAll: false };
}

// Extra single blocks for a line when its wrong versions run out: the other operators of each
// operator's family and each whole number ± 1. In a fixed order (no rng).
const OP_FAMILIES = [['+', '-', '*', '/', '%'], ['//', '+', '-', '*', '%'], ['<', '<=', '>', '>=', '==', '!='], ['=', '+=', '-=', '*=', '/=', '%='], ['&&', '||'], ['and', 'or']]; // first family holding the operator wins
// JavaScript/TypeScript compare with === and !== (lang given, or the line already uses them).
const JS_FAMILIES = [OP_FAMILIES[0], OP_FAMILIES[1], ['<', '<=', '>', '>=', '===', '!=='], ...OP_FAMILIES.slice(3)];
export function decoyTokens(text, lang) {
  const items = lineTree(text) || [];
  const out = [];
  const fams = JSL(lang) || /===|!==/.test(String(text)) ? JS_FAMILIES : OP_FAMILIES;
  const walk = xs => xs.forEach(x => {
    if (x.kids) return walk(x.kids);
    const fam = fams.find(f => f.includes(x.v));
    if (fam) out.push(...fam.filter(o => o !== x.v));
    const n = /^-?\d+[,;:]?$/.test(x.v) ? parseInt(x.v, 10) : NaN;
    if (Number.isInteger(n)) out.push(String(n + 1), ...(n > 0 ? [String(n - 1)] : []));
  });
  walk(items);
  return [...new Set(out)];
}

export function serialiseBlocks(tiles, solution, joiner = ' ') {
  if (!Array.isArray(tiles) || !Array.isArray(solution)) return null;
  const used = new Set();
  const ser = (xs, sep, depth) => {
    if (depth > 4) return null;
    const parts = [];
    for (const x of xs) {
      const n = typeof x === 'number' ? x : x && typeof x === 'object' ? x.t : NaN;
      const t = tiles[n];
      if (!t || used.has(n)) return null;
      used.add(n);
      if (typeof x === 'number') { parts.push(t.value); continue; }
      if (!t.slot || !Array.isArray(x.kids)) return null;
      const inner = ser(x.kids, t.slot.sep ?? ', ', depth + 1);
      if (inner === null) return null;
      parts.push(t.value + t.slot.open + inner + t.slot.close);
    }
    return parts.join(sep);
  };
  return ser(solution, joiner, 1);
}

// The engine's text rule (− as -, trim, collapse spaces, no spaces around ':', ', ' after commas,
// case-insensitive), for building and checking `accepts` lists.
export const textKey = s => String(s ?? '').replace(/−/g, '-').trim().replace(/\s+/g, ' ').replace(/ ?: ?/g, ':').replace(/ ?, ?/g, ', ').toLowerCase();

const GAP = /(?<=\S) (===|!==|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|%=|\/\/|[-+*\/%<>=]) (?=\S)/g;
export function spacingVariants(text) {
  const hits = [...String(text).matchAll(GAP)];
  const k = hits.length;
  const build = mask => {
    let out = '', at = 0;
    hits.forEach((h, j) => { out += text.slice(at, h.index); out += (mask >> j) & 1 ? h[1] : h[0]; at = h.index + h[0].length; });
    return out + text.slice(at);
  };
  const full = (1 << k) - 1;
  const masks = k <= 4 ? Array.from({ length: full + 1 }, (_, m) => m) : hits.map((_, j) => 1 << j);
  // spaced first, then fully compact, then the mixes
  const ordered = [0, ...(k ? [full] : []), ...masks.filter(m => m !== 0 && m !== full)];
  return [...new Set(ordered.map(build))];
}

// ── Language notes for explanations ───────────────────────────────────────────────────────────
const NOTES = {
  python: { range: 'range(a, b) counts from a up to b, stopping before b', len: 'len(xs)', append: 'xs.append(x)',
    print: 'print(x)', and: 'and', or: 'or', not: 'not', elseIf: 'elif', intDiv: '//', equals: '==' },
  csharp: { range: 'for (int i = a; i < b; i++) counts from a up to b, stopping before b', len: 'xs.Count (s.Length for a string)',
    append: 'xs.Add(x)', print: 'Console.WriteLine(x)', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '==' },
  cpp: { range: 'for (int i = a; i < b; i++) counts from a up to b, stopping before b', len: 'xs.size() (s.length() for a string)',
    append: 'xs.push_back(x)', print: 'std::cout << x', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '==' },
  gdscript: { range: 'range(a, b) counts from a up to b, stopping before b', len: 'xs.size() (s.length() for a String)',
    append: 'xs.append(x)', print: 'print(x)', and: 'and', or: 'or', not: 'not', elseIf: 'elif', intDiv: '/', equals: '==' },
  rust: { range: 'a..b counts from a up to b, stopping before b (a..=b would include b)', len: 'xs.len()',
    append: 'xs.push(x)', print: 'println!("{}", x)', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '==' },
  javascript: { range: 'for (let i = a; i < b; i++) counts from a up to b, stopping before b', len: 'xs.length (s.length for a string too)',
    append: 'xs.push(x)', print: 'console.log(x)', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '===' },
  typescript: { range: 'for (let i = a; i < b; i++) counts from a up to b, stopping before b', len: 'xs.length (s.length for a string too)',
    append: 'xs.push(x)', print: 'console.log(x)', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '===' },
  java: { range: 'for (int i = a; i < b; i++) counts from a up to b, stopping before b', len: 'xs.size() (s.length() for a String)',
    append: 'xs.add(x)', print: 'System.out.println(x)', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '==' },
  go: { range: 'for i := a; i < b; i++ counts from a up to b, stopping before b', len: 'len(xs)',
    append: 'xs = append(xs, x)', print: 'fmt.Println(x)', and: '&&', or: '||', not: '!', elseIf: 'else if', intDiv: '/', equals: '==' },
};
export const langNotes = lang => NOTES[lang] || fail(`unknown language: ${lang}`);
export const rangeText = lang => langNotes(lang).range;
