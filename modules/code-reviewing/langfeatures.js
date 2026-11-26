// Code Reviewing, "Language features": questions that exist only in the current language.
// Languages: Python, C#, C++, GDScript, Rust, JavaScript, TypeScript, Java and Go.
//
// Unlike the other subtopics, these snippets are NOT codelang programs: each family below is a
// hand-written template for ONE language (Python integer division, C# struct copies, C++ references,
// GDScript Array references, Rust ownership, …), parametrised by rng values. generate() picks a
// family among the current language's families for the level, so the same seed gives a different
// question in another language (by design; intro.md says so).
//
// Each family: { lang, diffs, make(rng, diff) → c, view(c, diff) → question parts, sim(c, diff, view) }.
//   make   draws every random value (names, numbers, variant, choice order, block seed).
//   view   renders the snippet and works out the answer directly from the plan (closed forms).
//   sim    recomputes the answer independently: small models of the language's semantics (a heap
//          of shared objects, a 32-bit/8-bit integer model, long division, Python slice rules, a
//          typed expression evaluator) or a line-by-line checker that READS THE RENDERED CODE and
//          applies the language rule (Rust moves/borrows, C# compile errors, C++ undefined
//          behaviour, GDScript static types). verify() compares the two.
// Hints are built from drawn values only (no rng calls).

import { fence, blocksFor, spacingVariants, textKey, decoyTokens, serialiseBlocks } from '../../js/lib/codelang.js';

// ---------------------------------------------------------------------------------------------
// helpers
const tk = s => '`' + s + '`';
const LINE = n => `Line ${n}`;
const COMPILES = 'It compiles and runs';
function names(rng, pools) {
  const used = new Set();
  return pools.map(p => { const n = rng.pick(p.filter(x => !used.has(x))); used.add(n); return n; });
}
const numbered = lines => {
  const w = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(w)} |${l ? ' ' + l : ''}`).join('\n');
};
const codeBlock = (L, lines) => '```' + fence(L) + '\n' + numbered(lines) + '\n```';
// answer first, then distinct wrong values; four of them in the drawn order (null if too few).
function arrange(answer, wrongs, ord) {
  const set = [answer];
  for (const w of wrongs) if (w !== undefined && w !== null && !set.includes(w)) set.push(w);
  if (set.length < 4) return null;
  const four = set.slice(0, 4);
  return ord.map(k => four[k]);
}
const lineChoices = (answerLine, others, extra = []) => {
  const ls = [...new Set([answerLine, ...others])].sort((a, b) => a - b).map(LINE);
  return [...ls, ...extra];
};
const randList = (rng, lo, hi, a, b) => Array.from({ length: rng.int(lo, hi) }, () => rng.int(a, b));
const pyList = xs => `[${xs.join(', ')}]`;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const indentAll = (lines, pad = '    ') => lines.map(l => (l ? pad + l : l));
// Wrap statements in each language's entry point.
const inMain = {
  cpp: body => ['int main() {', ...indentAll(body), '}'],
  rust: body => ['fn main() {', ...indentAll(body), '}'],
  gdscript: body => ['extends Node', '', 'func _ready() -> void:', ...indentAll(body)],
};

// ---- independent arithmetic for sims (counting, no Math.floor / %) ----
function divCount(a, b) { // b > 0: floor and trunc quotient by counting
  let f = 0;
  if (a >= 0) { while ((f + 1) * b <= a) f++; } else { while (f * b > a) f--; }
  const t = a < 0 && f * b !== a ? f + 1 : f;
  return { floor: f, trunc: t, modFloor: a - f * b, modTrunc: a - t * b };
}
function longDiv(a, b) { // exact decimal text of a / b (b > 0), or null if it does not terminate quickly
  const neg = a < 0, n = Math.abs(a);
  let q = 0; while ((q + 1) * b <= n) q++;
  let r = n - q * b, digits = '';
  for (let k = 0; r && k < 12; k++) { r *= 10; let d = 0; while ((d + 1) * b <= r) d++; digits += d; r -= d * b; }
  if (r) return null;
  const s = digits ? `${q}.${digits}` : `${q}`;
  return neg && s !== '0' ? '-' + s : s;
}
// Wrap an integer (BigInt) into a signed/unsigned range of `bits`.
function wrapBits(v, bits, signed) {
  const m = 1n << BigInt(bits);
  let r = ((v % m) + m) % m;
  if (signed && r >= m / 2n) r -= m;
  return r;
}

// ---- typed expression evaluator (Python / C# / C++ semantics) for typed-line checks ----
// Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/'|'//'|'%') unary)* ;
// unary := cast unary | atom ; atom := number | name | name '(' expr ')' | '(' expr ')'.
// Casts: (double) (int) and static_cast<double>(…); Python int(…), float(…), len(xs).
function evalTyped(src, env, mode) {
  const toks = [];
  const re = /\s*(static_cast<double>|\(double\)|\(int\)|\/\/|\d+\.\d+|\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/%()])/y;
  let m, at = 0;
  const s = src.trim();
  while (at < s.length) {
    re.lastIndex = at;
    m = re.exec(s);
    if (!m) throw new Error('bad token');
    toks.push(m[1]); at = re.lastIndex;
  }
  let i = 0;
  const peek = () => toks[i], eat = t => { if (toks[i] !== t) throw new Error('expected ' + t); i++; };
  const num = (t, v) => ({ t, v });
  const arith = (op, a, b) => {
    const dbl = a.t === 'd' || b.t === 'd';
    if (op === '+') return num(dbl ? 'd' : 'i', a.v + b.v);
    if (op === '-') return num(dbl ? 'd' : 'i', a.v - b.v);
    if (op === '*') return num(dbl ? 'd' : 'i', a.v * b.v);
    if (b.v === 0) throw new Error('division by zero');
    if (op === '/') {
      if (mode === 'py' || dbl) return num('d', a.v / b.v);
      return num('i', Math.trunc(a.v / b.v));
    }
    if (op === '//') {
      if (mode !== 'py') throw new Error('no //');
      return num(dbl ? 'd' : 'i', Math.floor(a.v / b.v));
    }
    if (op === '%') {
      if (dbl && mode !== 'py') throw new Error('% on double');
      const r = a.v - b.v * (mode === 'py' ? Math.floor(a.v / b.v) : Math.trunc(a.v / b.v));
      return num(dbl ? 'd' : 'i', r);
    }
    throw new Error('op');
  };
  const atom = () => {
    const t = toks[i++];
    if (t === undefined) throw new Error('end');
    if (t === '(') { const v = expr(); eat(')'); return v; }
    if (/^\d+\.\d+$/.test(t)) return num('d', parseFloat(t));
    if (/^\d+$/.test(t)) return num('i', parseInt(t, 10));
    if (t === 'static_cast<double>') { eat('('); const v = expr(); eat(')'); return num('d', v.v); }
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === '(') {
        eat('(');
        if (mode === 'py' && t === 'len') { const n = toks[i++]; eat(')'); if (!(('len:' + n) in env)) throw new Error('len'); return num('i', env['len:' + n]); }
        const v = expr(); eat(')');
        if (mode === 'py' && t === 'int') return num('i', Math.trunc(v.v));
        if (mode === 'py' && t === 'float') return num('d', v.v);
        throw new Error('unknown call ' + t);
      }
      if (!(t in env)) throw new Error('unknown name ' + t);
      return num('i', env[t]);
    }
    throw new Error('bad atom ' + t);
  };
  const unary = () => {
    const t = peek();
    if (t === '(double)') { i++; const v = unary(); return num('d', v.v); }
    if (t === '(int)') { i++; const v = unary(); return num('i', Math.trunc(v.v)); }
    return atom();
  };
  const term = () => {
    let v = unary();
    while (['*', '/', '//', '%'].includes(peek())) { const op = toks[i++]; v = arith(op, v, unary()); }
    return v;
  };
  const expr = () => {
    let v = term();
    while (['+', '-'].includes(peek())) { const op = toks[i++]; v = arith(op, v, term()); }
    return v;
  };
  const v = expr();
  if (i !== toks.length) throw new Error('trailing');
  return v;
}

// A tiny heap: lists/dicts/objects are shared by reference; values are copied.
function heap() {
  const objs = [];
  return {
    objs,
    alloc(v) { objs.push(v); return objs.length - 1; },
    get(id) { return objs[id]; },
  };
}

const F = {};

// The expected answer of a "which line fails" family from its checker's verdict { line, rule }
// (line 0 = no error found; -1 = a line the checker could not read).
function compileAnswer(r, diff, RULES) {
  if (!r || r.line < 0) return null;
  const line = r.line ? LINE(r.line) : COMPILES;
  return diff === 'expert' && r.line ? { line, rule: RULES[r.rule] } : line;
}

// =============================================================================================
// Division and remainder (Python, C#, C++, GDScript): int / int, casts, float literals, negatives.
// =============================================================================================
const DIV_OPS = {
  python: { m: ['/', '//', '%'], h: ['//', '%', 'int/', '/'] },
  csharp: { m: ['int', 'castFirst', 'castLate', 'lit', 'mod'], h: ['int', 'mod', 'castFirst', 'castLate'] },
  cpp: { m: ['int', 'castFirst', 'static', 'lit', 'mod'], h: ['int', 'mod', 'static', 'lit'] },
  gdscript: { m: ['int', 'float', 'lit', 'mod'], h: ['int', 'mod', 'posmod', 'float'] },
};
// which value each operator produces: D exact decimal, T truncated quotient, F floored quotient,
// M remainder with the sign of the left side, P remainder with the sign of the divisor
const DIV_KIND = {
  python: { '/': 'D', '//': 'F', '%': 'P', 'int/': 'T' },
  csharp: { int: 'T', castFirst: 'D', castLate: 'T', lit: 'D', mod: 'M' },
  cpp: { int: 'T', castFirst: 'D', static: 'D', lit: 'D', mod: 'M' },
  gdscript: { int: 'T', float: 'D', lit: 'D', mod: 'M', posmod: 'P' },
};
function divExpr(L, op, a, b, den) {
  return {
    python: { '/': `${a} / ${b}`, '//': `${a} // ${b}`, '%': `${a} % ${b}`, 'int/': `int(${a} / ${b})` },
    csharp: { int: `${a} / ${b}`, castFirst: `(double)${a} / ${b}`, castLate: `(double)(${a} / ${b})`, lit: `${a} / ${den}.0`, mod: `${a} % ${b}` },
    cpp: { int: `${a} / ${b}`, castFirst: `(double)${a} / ${b}`, static: `static_cast<double>(${a}) / ${b}`, lit: `${a} / ${den}.0`, mod: `${a} % ${b}` },
    gdscript: { int: `${a} / ${b}`, float: `float(${a}) / ${b}`, lit: `${a} / ${den}.0`, mod: `${a} % ${b}`, posmod: `posmod(${a}, ${b})` },
  }[L][op];
}
const DIV_RULE = {
  python: '`/` always gives a float in Python 3. `//` divides and rounds **down** (towards minus infinity), so `-17 // 4` is -5. `%` gives a remainder with the sign of the divisor, so `-17 % 4` is 3 (and `a == (a // b) * b + a % b` always holds). `int(x)` cuts the decimals off, towards zero.',
  csharp: '`int / int` is whole-number division that cuts towards zero, even when the result is stored in a `double`: the division happens first. Casting one side (`(double)a / b`) or using a `double` literal (`a / 4.0`) gives an exact answer; `(double)(a / b)` casts too late. `%` keeps the sign of the left side, so `-17 % 4` is -1. `Console.WriteLine` prints a whole-number `double` without `.0`.',
  cpp: '`int / int` is whole-number division that truncates towards zero (guaranteed since C++11), even when the result is stored in a `double`. Casting one side first (`(double)a / b` or `static_cast<double>(a) / b`) or a `double` literal (`a / 4.0`) gives an exact answer. `%` keeps the sign of the left side, so `-17 % 4` is -1. `std::cout` prints a whole-number `double` without `.0`.',
  gdscript: 'In GDScript `int / int` is whole-number division (the editor warns about it), truncating towards zero like C++. `float(a) / b` or a float literal (`a / 4.0`) gives an exact answer. `%` keeps the sign of the left side (`-17 % 4` is -1); `posmod(a, b)` always gives a result between 0 and b - 1.',
};
function divFamily(L) {
  return {
    lang: L, diffs: ['medium', 'hard'],
    make(rng, diff) {
      const [a, b] = names(rng, [['total', 'sweets', 'minutes', 'points', 'coins', 'pages'], ['people', 'groups', 'boxes', 'teams', 'days']]);
      const den = rng.pick([2, 4, 5, 8]);
      let num = rng.int(9, 59);
      if (num % den === 0) num++;
      if (diff !== 'medium') num = -num;
      const op = rng.pick(DIV_OPS[L][diff === 'medium' ? 'm' : 'h']);
      return { a, b, num, den, op, ord: rng.shuffle([0, 1, 2, 3]) };
    },
    view(c) {
      const { a, b, num, den, op } = c;
      const e = divExpr(L, op, a, b, den);
      const q = num / den;
      const val = { D: String(q), T: String(Math.trunc(q)), F: String(Math.floor(q)), M: String(num % den), P: String(((num % den) + den) % den) };
      const kind = DIV_KIND[L][op];
      const answer = val[kind];
      const wrongs = [val.D, val.T, val.F, val.M, val.P, `${Math.trunc(q)}.0`, String(Math.ceil(q)), String(-Math.abs(num % den))];
      const choices = arrange(answer, wrongs, c.ord);
      if (!choices) return null;
      const body = {
        python: [`${a} = ${num}`, `${b} = ${den}`, `result = ${e}`, 'print(result)'],
        csharp: [`int ${a} = ${num};`, `int ${b} = ${den};`, `double result = ${e};`, 'Console.WriteLine(result);'],
        cpp: inMain.cpp([`int ${a} = ${num};`, `int ${b} = ${den};`, `double result = ${e};`, 'std::cout << result << "\\n";']),
        gdscript: inMain.gdscript([`var ${a}: int = ${num}`, `var ${b}: int = ${den}`, `print(${e})`]),
      }[L];
      const note = L === 'csharp' ? ' (Assume .NET 6 or later with an English culture, so `.` is the decimal point.)' : '';
      const work = {
        D: `${num} / ${den} worked out exactly is ${val.D}`,
        T: `${num} / ${den} = ${val.D}, and cutting off the decimals (towards zero) gives ${val.T}`,
        F: `${num} / ${den} = ${val.D}, and rounding down (towards minus infinity) gives ${val.F}`,
        M: `${num} = ${val.T} × ${den} + (${val.M}): the remainder takes the sign of ${num}`,
        P: `${num} = ${val.F} × ${den} + ${val.P}: the remainder takes the sign of ${den}`,
      }[kind];
      return {
        code: body, ask: `What does this program print?${note}`, type: 'choice', answer: tk(answer), choices: choices.map(tk),
        explanation: `It prints **${answer}**: \`${e}\` with ${a} = ${num} and ${b} = ${den}: ${work}.\n\n${DIV_RULE[L]}`,
        hints: [
          `Look at the types first: ${a} and ${b} are whole numbers (${L === 'python' ? 'Python `int`' : '`int`'}). Is the expression \`${e}\` whole-number division, exact division, or a remainder?`,
          kind === 'D' ? `Exact division: work out ${num} ÷ ${den} as a decimal.`
            : kind === 'M' || kind === 'P' ? `A remainder. With a negative left side, check whose sign the result takes in ${L === 'python' ? 'Python' : L === 'gdscript' ? 'GDScript' : L === 'cpp' ? 'C++' : 'C#'}${op === 'posmod' ? ', and what `posmod` changes' : ''}.`
              : `Whole-number division. Work out ${num} ÷ ${den} as a decimal, then decide which way it is rounded: towards zero, or down.`,
        ],
      };
    },
    sim(c) {
      const d = divCount(c.num, c.den);
      const kind = { python: { '/': 'D', '//': 'F', '%': 'P', 'int/': 'T' }, csharp: { int: 'T', castFirst: 'D', castLate: 'T', lit: 'D', mod: 'M' },
        cpp: { int: 'T', castFirst: 'D', static: 'D', lit: 'D', mod: 'M' }, gdscript: { int: 'T', float: 'D', lit: 'D', mod: 'M', posmod: 'P' } }[L][c.op];
      let out = { D: longDiv(c.num, c.den), T: String(d.trunc), F: String(d.floor), M: String(d.modTrunc), P: String(d.modFloor) }[kind];
      // Python prints a whole float with ".0"; the others print a whole double without it.
      if (kind === 'D' && L === 'python' && !out.includes('.')) out += '.0';
      if (kind === 'D' && L === 'gdscript' && !out.includes('.')) return null; // never drawn (num % den != 0)
      return tk(out);
    },
  };
}
for (const L of ['python', 'csharp', 'cpp', 'gdscript']) F[`${L}-div`] = divFamily(L);

// =============================================================================================
// Python
// =============================================================================================
const PY_LISTS = ['scores', 'items', 'marks', 'values', 'prices', 'ages'];
const PY_OTHER = ['other', 'backup', 'saved', 'copy_of', 'second'];
const PY_COPY = { alias: x => x, slice: x => `${x}[:]`, list: x => `list(${x})`, copy: x => `${x}.copy()` };

// Aliasing: `b = a` shares one list; a[:] / list(a) / a.copy() make a new one.
F['python-alias'] = {
  lang: 'python', diffs: ['medium'],
  make(rng) {
    const [x, y] = names(rng, [PY_LISTS, PY_OTHER]);
    const vals = randList(rng, 3, 5, 1, 9);
    const how = rng.pick(['alias', 'alias', 'slice', 'list', 'copy']);
    const op = rng.pick(['append', 'set', 'iadd', 'rebind']);
    const v = rng.int(10, 20);
    const ask = op === 'set' ? rng.pick(['first', 'sum']) : rng.pick(['len', 'sum']);
    return { x, y, vals, how, op, v, ask };
  },
  view(c) {
    const { x, y, vals, how, op, v, ask } = c;
    const opLine = { append: `${y}.append(${v})`, set: `${y}[0] = ${v}`, iadd: `${y} += [${v}]`, rebind: `${y} = ${y} + [${v}]` }[op];
    const askText = { len: `len(${x})`, first: `${x}[0]`, sum: `sum(${x})` }[ask];
    const shared = how === 'alias', inPlace = op !== 'rebind';
    const after = vals.slice();
    if (shared && inPlace) { if (op === 'set') after[0] = v; else after.push(v); }
    const answer = { len: after.length, first: after[0], sum: sum(after) }[ask];
    const code = [`${x} = ${pyList(vals)}`, `${y} = ${PY_COPY[how](x)}`, opLine, `print(${askText})`];
    const why = shared
      ? `\`${y} = ${x}\` does not copy anything: both names refer to the **same** list. ` +
        (inPlace ? `\`${opLine}\` changes that list in place, so ${tk(x)} sees the change.` : `But \`${opLine}\` builds a **new** list and makes ${tk(y)} refer to it; ${tk(x)} still refers to the old, unchanged list.`)
      : `\`${PY_COPY[how](x)}\` makes a new list with the same items, so ${tk(x)} and ${tk(y)} are separate lists. Changing ${tk(y)} leaves ${tk(x)} as it was.`;
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. ${why} ${tk(x)} ends as ${tk(pyList(after))}.`,
      hints: [
        `Line 2 is the key line. Does \`${y} = ${PY_COPY[how](x)}\` make a second list, or a second name for the same list?`,
        `Then ask whether line 3 changes a list in place (\`append\`, \`[i] =\`, \`+=\` on a list) or builds a new list and rebinds the name (\`${y} = ${y} + …\`).`,
      ],
    };
  },
  sim(c) {
    const H = heap(), env = {};
    env[c.x] = H.alloc(c.vals.slice());
    env[c.y] = c.how === 'alias' ? env[c.x] : H.alloc(H.get(env[c.x]).slice());
    const ys = H.get(env[c.y]);
    if (c.op === 'append' || c.op === 'iadd') ys.push(c.v);
    else if (c.op === 'set') ys[0] = c.v;
    else env[c.y] = H.alloc([...ys, c.v]);
    const xs = H.get(env[c.x]);
    return c.ask === 'len' ? xs.length : c.ask === 'first' ? xs[0] : xs.reduce((a, b) => a + b, 0);
  },
};

// == compares contents; `is` compares identity (only on lists here: never small ints or strings).
F['python-identity'] = {
  lang: 'python', diffs: ['medium'],
  make(rng) {
    const [x, y] = names(rng, [PY_LISTS, PY_OTHER]);
    const vals = randList(rng, 2, 4, 1, 9);
    const how = rng.pick(['alias', 'alias', 'literal', 'slice', 'list', 'copy']);
    const mutate = rng.pick(['none', 'append', 'append']);
    const v = rng.int(10, 20);
    return { x, y, vals, how, mutate, v, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { x, y, vals, how, mutate, v } = c;
    const make = how === 'literal' ? pyList(vals) : PY_COPY[how](x);
    const code = [`${x} = ${pyList(vals)}`, `${y} = ${make}`, ...(mutate === 'append' ? [`${y}.append(${v})`] : []), `print(${x} == ${y}, ${x} is ${y})`];
    const same = how === 'alias', equal = same || mutate === 'none';
    const B = t => (t ? 'True' : 'False');
    const answer = `${B(equal)} ${B(same)}`;
    const choices = arrange(answer, ['True True', 'True False', 'False False', 'False True'], c.ord);
    return {
      code, ask: 'What does this program print?', type: 'choice', answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**. \`==\` compares the **contents** of two lists; \`is\` asks whether both names refer to the **same object**. ` +
        (same ? `\`${y} = ${x}\` gives the same list a second name, so \`is\` is True and the contents are always equal.`
          : `\`${y} = ${make}\` creates a new list, so \`is\` is False. ` + (mutate === 'append' ? `After \`${y}.append(${v})\` the contents differ too, so \`==\` is False.` : 'The contents are the same, so `==` is True.')) +
        '\n\nUse `==` to compare values. Avoid `is` for numbers and strings: whether two equal ints are the same object depends on the Python implementation.',
      hints: [
        `\`==\` checks whether the two lists hold the same items; \`is\` checks whether ${tk(x)} and ${tk(y)} are one and the same list object.`,
        `Does line 2 create a new list object or not?${mutate === 'append' ? ' Then check what the append does to each list.' : ''}`,
      ],
    };
  },
  sim(c) {
    const H = heap(), env = {};
    env[c.x] = H.alloc(c.vals.slice());
    env[c.y] = c.how === 'alias' ? env[c.x] : H.alloc(c.vals.slice());
    if (c.mutate === 'append') H.get(env[c.y]).push(c.v);
    const eq = JSON.stringify(H.get(env[c.x])) === JSON.stringify(H.get(env[c.y]));
    return tk(`${eq ? 'True' : 'False'} ${env[c.x] === env[c.y] ? 'True' : 'False'}`);
  },
};

// Slicing: start included, stop excluded, negative indices count from the end, steps.
const SLICE_M = ['a:b', ':b', 'a:', '-k:', ':-k'];
const SLICE_H = ['::2', '1::2', '::-1', 'b:a:-1', '-k:-1', 'a:b:2', '-k:', 'a:-1'];
function pySlice(xs, start, stop, step) { // Python's rules (None = null)
  const n = xs.length, out = [];
  const norm = (v, dflt, lo, hi) => {
    if (v === null) return dflt;
    let r = v < 0 ? v + n : v;
    return r < lo ? lo : r > hi ? hi : r;
  };
  if (step > 0) {
    const s = norm(start, 0, 0, n), e = norm(stop, n, 0, n);
    for (let i = s; i < e; i += step) out.push(xs[i]);
  } else {
    const s = norm(start, n - 1, -1, n - 1), e = norm(stop, -1, -1, n - 1);
    for (let i = s; i > e; i += step) out.push(xs[i]);
  }
  return out;
}
F['python-slice'] = {
  lang: 'python', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const name = rng.pick(['nums', 'values', 'scores', 'days', 'marks']);
    const n = rng.int(6, 8);
    const xs = rng.shuffle(Array.from({ length: 30 }, (_, i) => i + 1)).slice(0, n);
    const pat = rng.pick(diff === 'medium' ? SLICE_M : SLICE_H);
    const a = rng.int(1, n - 4), b = rng.int(a + 2, n - 1), k = rng.int(2, n - 3);
    return { name, xs, pat, a, b, k, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { name, xs, pat, a, b, k } = c, n = xs.length;
    const P = {
      'a:b': [`${a}:${b}`, () => xs.slice(a, b), [a, b, 1]],
      ':b': [`:${b}`, () => xs.slice(0, b), [null, b, 1]],
      'a:': [`${a}:`, () => xs.slice(a), [a, null, 1]],
      '-k:': [`-${k}:`, () => xs.slice(n - k), [-k, null, 1]],
      ':-k': [`:-${k}`, () => xs.slice(0, n - k), [null, -k, 1]],
      '::2': ['::2', () => xs.filter((_, i) => i % 2 === 0), [null, null, 2]],
      '1::2': ['1::2', () => xs.filter((_, i) => i % 2 === 1), [1, null, 2]],
      '::-1': ['::-1', () => xs.slice().reverse(), [null, null, -1]],
      'b:a:-1': [`${b}:${a}:-1`, () => xs.slice(a + 1, b + 1).reverse(), [b, a, -1]],
      '-k:-1': [`-${k}:-1`, () => xs.slice(n - k, n - 1), [-k, -1, 1]],
      'a:b:2': [`${a}:${b}:2`, () => xs.slice(a, b).filter((_, i) => i % 2 === 0), [a, b, 2]],
      'a:-1': [`${a}:-1`, () => xs.slice(a, n - 1), [a, -1, 1]],
    }[pat];
    const [text, f, [s, e, st]] = P;
    const ans = f();
    const sh = v => (v === null ? null : v + (v < 0 ? 0 : 0));
    const wrongs = [
      pySlice(xs, s, e === null ? null : (e === -1 && st > 0 ? null : e + (st > 0 ? 1 : -1)), st), // stop included
      pySlice(xs, s === null ? null : s + (st > 0 ? 1 : -1), e, st), // start skipped
      pySlice(xs, s === null ? (st > 0 ? 1 : null) : s - (st > 0 ? 1 : -1), e, st),
      ans.slice().reverse(),
      pySlice(xs, sh(s), e === null ? null : e - (st > 0 ? 1 : -1), st),
      st === 2 ? pySlice(xs, (s ?? 0) + 1, e, 2) : xs.slice(0, 2),
    ].map(pyList);
    const answer = pyList(ans);
    const choices = arrange(answer, wrongs, c.ord);
    if (!choices || ans.length === 0) return null;
    const idx = xs.map((v, i) => `${i}:${v}`).join(', ');
    return {
      code: [`${name} = ${pyList(xs)}`, `print(${name}[${text}])`], ask: 'What does this program print?', type: 'choice',
      answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**. Positions (index:value) are ${idx}. A slice \`[start:stop:step]\` starts **at** start and stops **before** stop; ` +
        'a negative index counts from the end (`-1` is the last item), a missing start or stop means "from the beginning" / "to the end" (the other way round with a negative step), and the step picks every n-th item.',
      hints: [
        `Number the positions of ${tk(name)}: the first item is index 0, and -1 is the last item (index ${n - 1}).`,
        `Read \`[${text}]\` as start : stop : step. The start is included, the stop is **not**.${st < 0 ? ' The step is negative, so it walks backwards.' : ''}`,
      ],
    };
  },
  sim(c) {
    const { xs, pat, a, b, k } = c;
    const args = { 'a:b': [a, b, 1], ':b': [null, b, 1], 'a:': [a, null, 1], '-k:': [-k, null, 1], ':-k': [null, -k, 1], '::2': [null, null, 2],
      '1::2': [1, null, 2], '::-1': [null, null, -1], 'b:a:-1': [b, a, -1], '-k:-1': [-k, -1, 1], 'a:b:2': [a, b, 2], 'a:-1': [a, -1, 1] }[pat];
    return tk(pyList(pySlice(xs, ...args)));
  },
};

// Mutable default argument: the default list is made once, when `def` runs, and shared by calls.
F['python-default'] = {
  lang: 'python', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, item, bag] = names(rng, [['add_item', 'remember', 'collect', 'log_value', 'keep'], ['item', 'value', 'x', 'entry'], ['bag', 'seen', 'store', 'history']]);
    const k = diff === 'expert' ? rng.int(3, 4) : rng.int(2, 3);
    const vars = ['first', 'second', 'third', 'fourth'].slice(0, k);
    let calls;
    for (let t = 0; t < 20; t++) {
      calls = vars.map(v => ({ v, val: rng.int(1, 9), explicit: rng.next() < 0.3 ? (diff === 'expert' ? randList(rng, 0, 2, 0, 5) : []) : null }));
      if (calls.filter(x => !x.explicit).length >= 2 && (diff !== 'expert' || calls.some(x => x.explicit))) break;
    }
    const asks = diff === 'expert' ? [rng.pick(calls.filter(x => !x.explicit)).v, rng.pick(calls.filter(x => x.explicit) .concat(calls.filter(x => !x.explicit))).v] : [rng.pick(calls).v];
    return { f, item, bag, calls, asks };
  },
  view(c, diff) {
    const { f, item, bag, calls, asks } = c;
    if (asks.length === 2 && asks[0] === asks[1]) return null;
    if (!calls || calls.filter(x => !x.explicit).length < 2) return null;
    const code = [`def ${f}(${item}, ${bag}=[]):`, `    ${bag}.append(${item})`, `    return ${bag}`, '',
      ...calls.map(x => `${x.v} = ${f}(${x.val}${x.explicit ? ', ' + pyList(x.explicit) : ''})`), ...asks.map(v => `print(len(${v}))`)];
    const nDefault = calls.filter(x => !x.explicit).length;
    const lenOf = v => { const x = calls.find(y => y.v === v); return x.explicit ? x.explicit.length + 1 : nDefault; };
    const why = `The default \`${bag}=[]\` is created **once**, when \`def\` runs, and every call that leaves out ${tk(bag)} appends to that same list. ` +
      `There are ${nDefault} such calls, so every variable that got the default list refers to one list of length ${nDefault} by the end. A call that passes its own list appends to that list instead.`;
    const fix = `The usual fix is \`${bag}=None\` and \`if ${bag} is None: ${bag} = []\` inside the function.`;
    if (diff === 'expert') {
      const parts = asks.map((v, j) => ({ id: j ? 'second' : 'first', label: j ? 'Second print' : 'First print', ask: `What does \`print(len(${v}))\` print?`, answerType: 'number', answer: lenOf(v), tolerance: 0,
        hint: calls.find(y => y.v === v).explicit ? `${tk(v)} came from a call that passed its own list. Start from that list's length.` : `${tk(v)} is the shared default list. Count every call that used the default, including later ones.` }));
      return { code, ask: 'What does each print show?', type: 'multi', parts, explanation: `It prints **${lenOf(asks[0])}** then **${lenOf(asks[1])}**. ${why}\n\n${fix}` };
    }
    const answer = lenOf(asks[0]);
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. ${why}\n\n${fix}`,
      hints: [`When is the default value \`[]\` created: on every call, or once, when the \`def\` line runs?`,
        'Variables that received the default list all refer to the same list object. Count the calls that leave the second argument out, including calls after the one you are asked about.'],
    };
  },
  sim(c) {
    const H = heap(), env = {};
    const dflt = H.alloc([]); // evaluated once, at definition time
    for (const x of c.calls) {
      const id = x.explicit ? H.alloc(x.explicit.slice()) : dflt;
      H.get(id).push(x.val);
      env[x.v] = id;
    }
    const out = c.asks.map(v => H.get(env[v]).length);
    return c.asks.length === 2 ? { first: out[0], second: out[1] } : out[0];
  },
};

// [[0] * w] * h repeats ONE inner list h times; a comprehension makes h separate lists.
F['python-grid'] = {
  lang: 'python', diffs: ['hard'],
  make(rng) {
    const name = rng.pick(['grid', 'rows', 'board', 'table']);
    const h = rng.int(2, 4), w = rng.int(2, 4);
    const build = rng.pick(['mult', 'mult', 'comp']);
    const r1 = rng.int(0, h - 1), c1 = rng.int(0, w - 1), v1 = rng.int(2, 9);
    const r2 = rng.int(0, h - 1), c2 = rng.int(0, w - 1), v2 = rng.int(2, 9);
    const rq = rng.int(0, h - 1);
    const ask = rng.pick(['sum', 'cell']);
    return { name, h, w, build, r1, c1, v1, r2, c2, v2, rq, ask };
  },
  view(c) {
    const { name, h, w, build, r1, c1, v1, r2, c2, v2, rq, ask } = c;
    const make = build === 'mult' ? `[[0] * ${w}] * ${h}` : `[[0] * ${w} for _ in range(${h})]`;
    const askText = ask === 'sum' ? `sum(${name}[${rq}])` : `${name}[${rq}][${c1}]`;
    // closed form: with one shared row, every row sees both writes
    const rowVals = r => {
      const row = Array(w).fill(0);
      if (build === 'mult' || r === r1) row[c1] = v1;
      if (build === 'mult' || r === r2) row[c2] += v2;
      return row;
    };
    const row = rowVals(rq);
    const answer = ask === 'sum' ? sum(row) : row[c1];
    const code = [`${name} = ${make}`, `${name}[${r1}][${c1}] = ${v1}`, `${name}[${r2}][${c2}] += ${v2}`, `print(${askText})`];
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. ` + (build === 'mult'
        ? `\`${make}\` puts the **same** inner list in the outer list ${h} times (\`*\` copies references, not lists), so a change through any row shows in every row. Row ${rq} is ${tk(pyList(row))}.`
        : `The comprehension runs \`[0] * ${w}\` once per row, so the ${h} rows are separate lists and a change to one row affects only that row. Row ${rq} is ${tk(pyList(row))}.`),
      hints: [
        `How many separate inner lists does line 1 create? \`*\` on a list repeats the references it holds; a comprehension builds a fresh list each time round.`,
        `Then apply lines 2 and 3 and write out row ${rq} before you work out \`${askText}\`.`,
      ],
    };
  },
  sim(c) {
    const H = heap();
    let outer;
    if (c.build === 'mult') { const inner = H.alloc(Array(c.w).fill(0)); outer = Array(c.h).fill(inner); } else outer = Array.from({ length: c.h }, () => H.alloc(Array(c.w).fill(0)));
    H.get(outer[c.r1])[c.c1] = c.v1;
    H.get(outer[c.r2])[c.c2] += c.v2;
    const row = H.get(outer[c.rq]);
    return c.ask === 'sum' ? row.reduce((a, b) => a + b, 0) : row[c.c1];
  },
};

// Mutating a parameter (append, +=) vs rebinding it (xs = xs + [...]).
F['python-rebind'] = {
  lang: 'python', diffs: ['expert'],
  make(rng) {
    const [fm, fr] = names(rng, [['grow', 'attach', 'update', 'push_on'], ['extended', 'plus', 'with_value', 'joined']]);
    const mutOp = rng.pick(['append', 'iadd']);
    const order = rng.pick([['mut', 'rebind'], ['rebind', 'mut']]); // which function is defined first
    const first = { f: rng.pick(['m', 'r']), v: rng.int(1, 9) };
    const assign = { f: rng.pick(['m', 'r']), v: rng.int(1, 9) };
    const rest = Array.from({ length: rng.int(1, 2) }, () => ({ f: rng.pick(['m', 'r']), t: rng.pick(['nums', 'more']), v: rng.int(1, 9) }));
    const start = randList(rng, 1, 3, 1, 9);
    return { fm, fr, mutOp, order, first, assign, rest, start };
  },
  view(c) {
    const { fm, fr, mutOp, order, first, assign, rest, start } = c;
    const fn = f => (f === 'm' ? fm : fr);
    const defs = {
      mut: [`def ${fm}(xs, v):`, mutOp === 'append' ? '    xs.append(v)' : '    xs += [v]', '    return xs'],
      rebind: [`def ${fr}(xs, v):`, '    xs = xs + [v]', '    return xs'],
    };
    const code = [...defs[order[0]], '', ...defs[order[1]], '', `nums = ${pyList(start)}`, `${fn(first.f)}(nums, ${first.v})`,
      `more = ${fn(assign.f)}(nums, ${assign.v})`, ...rest.map(x => `${fn(x.f)}(${x.t}, ${x.v})`), 'print(len(nums))', 'print(len(more))'];
    // closed form: track list lengths and whether `more` is the same list as `nums`
    let nNums = start.length;
    if (first.f === 'm') nNums++;
    let same = assign.f === 'm', nMore;
    if (same) { nNums++; nMore = nNums; } else nMore = nNums + 1;
    for (const x of rest) {
      if (x.f !== 'm') continue;
      if (same) { nNums++; nMore++; } else if (x.t === 'nums') nNums++; else nMore++;
    }
    const parts = [
      { id: 'nums', label: 'First print', ask: 'What does `print(len(nums))` print?', answerType: 'number', answer: nNums, tolerance: 0,
        hint: `Only calls to \`${fm}\` change the list that is passed in. Count those that reach the list ${tk('nums')} refers to.` },
      { id: 'more', label: 'Second print', ask: 'What does `print(len(more))` print?', answerType: 'number', answer: nMore, tolerance: 0,
        hint: `Is \`more\` the same list as \`nums\`, or a new one? That depends on which function line ${code.indexOf(`more = ${fn(assign.f)}(nums, ${assign.v})`) + 1} calls.` },
    ];
    return {
      code, ask: 'What do the two prints show?', type: 'multi', parts,
      explanation: `It prints **${nNums}** then **${nMore}**. \`${fm}\` changes the caller's list **in place** (` + (mutOp === 'append' ? '`append`' : '`+=` on a list extends it in place') +
        `) and returns that same list. \`${fr}\` builds a **new** list with \`xs + [v]\` and rebinds only its local name; the caller's list is untouched, and the new list is lost unless the result is stored. ` +
        (same ? `So \`more\` is the very same list as \`nums\`, and every later change shows in both.` : `So \`more\` is a separate list, one item longer than \`nums\` was at that moment.`),
    };
  },
  sim(c) {
    const H = heap(), env = {};
    env.nums = H.alloc(c.start.slice());
    const call = (f, id, v) => {
      if (f === 'm') { H.get(id).push(v); return id; }
      return H.alloc([...H.get(id), v]);
    };
    call(c.first.f, env.nums, c.first.v);
    env.more = call(c.assign.f, env.nums, c.assign.v);
    for (const x of c.rest) call(x.f, env[x.t], x.v);
    return { nums: H.get(env.nums).length, more: H.get(env.more).length };
  },
};

// ---- typed lines (Type | Blocks) ----
// view() returns type 'text' with: answer (canonical line, no trailing mark), alts (other correct
// forms), trail (the optional trailing mark), bug (the buggy line), distractors (block sources),
// lineNo (the line to rewrite). The wrapper adds spacing variants and the blocks. sim() returns
// { ok(line) } that decides by running the candidate line through a semantic model.
const RW_EXTRA = { hard: [4, 6], expert: [6, 10] };
const drawBlocks = (rng, diff) => ({ extra: rng.int(...RW_EXTRA[diff]), seed: rng.int(1, 2147483646) });
const rewriteAsk = (diff, n, what) => (diff === 'expert'
  ? `One line has to change. Type the corrected version of that line${what ? ` so that ${what}` : ''}.`
  : `Line ${n} has to change. Type the corrected line ${n}${what ? ` so that ${what}` : ''}.`);
const stripMark = s => s.trim().replace(/\s*(?:;|:|\{)\s*$/, '').trim();

F['python-floor-line'] = {
  lang: 'python', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, xs, total, x] = names(rng, [['average_down', 'mean_floor', 'whole_average', 'fair_share'], ['xs', 'nums', 'values', 'scores'], ['total', 'acc', 'running'], ['x', 'v', 'n']]);
    let ex;
    do { ex = randList(rng, 3, 5, 1, 20); } while (sum(ex) % ex.length === 0);
    return { f, xs, total, x, ex, ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { f, xs, total, x, ex } = c;
    const bug = `return ${total} / len(${xs})`, answer = `return ${total} // len(${xs})`;
    const code = [`def ${f}(${xs}):`, `    ${total} = 0`, `    for ${x} in ${xs}:`, `        ${total} += ${x}`, `    ${bug}`, '', `print(${f}(${pyList(ex)}))`];
    const want = Math.floor(sum(ex) / ex.length);
    return {
      code, lead: `\`${f}\` should return the average of a list of non-negative whole numbers, **rounded down to a whole number**. For ${tk(pyList(ex))} it should print **${want}**, but it prints a decimal instead.`,
      ask: rewriteAsk(diff, 5), type: 'text', answer, alts: [`return int(${total} / len(${xs}))`], trail: '', bug, lineNo: 5,
      distractors: [bug, `return ${total} % len(${xs})`, `return len(${xs}) // ${total}`, `return ${total} // ${xs}`],
      explanation: `Line 5 should be \`${answer}\`. In Python 3, \`/\` always gives a float (${sum(ex)} / ${ex.length} = ${sum(ex) / ex.length}), even when both sides are ints. \`//\` is floor division: it rounds down and keeps an int, so it returns **${want}**. (\`int(${total} / len(${xs}))\` also works for non-negative totals, because \`int()\` cuts towards zero.)`,
      hints: ['Which operator in this function produces a decimal? In Python 3, `/` always returns a float.',
        'Python has a second division operator that rounds down and keeps the result an int.',
        'Change only the operator and keep the rest of the line the same.'],
    };
  },
  sim(c) {
    const tests = [c.ex, [4, 4, 5], [9, 2], [1, 2, 3, 4]];
    const re = new RegExp(`^return\\s+(.+)$`);
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m) return false;
        return tests.every(t => {
          try {
            const v = evalTyped(m[1], { [c.total]: t.reduce((a, b) => a + b, 0), ['len:' + c.xs]: t.length }, 'py');
            return v.t === 'i' && v.v === Math.floor(t.reduce((a, b) => a + b, 0) / t.length);
          } catch { return false; }
        });
      },
    };
  },
};

F['python-copy-line'] = {
  lang: 'python', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [x, y] = names(rng, [PY_LISTS, ['backup', 'saved', 'original', 'before']]);
    const vals = randList(rng, 3, 5, 1, 9);
    const op = rng.pick(['append', 'set', 'sort', 'clear']);
    const v = rng.int(10, 20);
    return { x, y, vals, op, v, ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { x, y, vals, op, v } = c;
    const opLine = { append: `${x}.append(${v})`, set: `${x}[0] = ${v}`, sort: `${x}.sort()`, clear: `${x}.clear()` }[op];
    const askText = op === 'append' || op === 'clear' ? `len(${y})` : `${y}[0]`;
    const want = askText.startsWith('len') ? vals.length : vals[0];
    const got = { append: vals.length + 1, clear: 0, set: v, sort: Math.min(...vals) }[op];
    if (want === got) return null;
    const bug = `${y} = ${x}`, answer = `${y} = ${x}.copy()`;
    const code = [`${x} = ${pyList(vals)}`, bug, opLine, `print(${askText})`];
    return {
      code, lead: `${tk(y)} should keep the list as it was before line 3, so this should print **${want}**. It prints **${got}** instead.`,
      ask: rewriteAsk(diff, 2, `${tk(y)} is a separate copy`), type: 'text', answer, alts: [`${y} = ${x}[:]`, `${y} = list(${x})`], trail: '', bug, lineNo: 2,
      distractors: [bug, `${y} = ${y}.copy()`, `${x} = ${y}.copy()`, `${y} == ${x}`, `${y} = ${x}.clear()`],
      explanation: `Line 2 should be \`${answer}\` (or \`${y} = ${x}[:]\` or \`${y} = list(${x})\`). \`${bug}\` copies nothing: it gives the same list a second name, so \`${opLine}\` changes the list that ${tk(y)} refers to as well. A copy is a new list with the same items, which line 3 does not touch.`,
      hints: [`After \`${bug}\`, how many list objects are there?`, 'Assignment never copies a list in Python. To get a second, independent list, ask the list for a copy.',
        'A list method, a slice that takes everything, or the `list(…)` constructor all build a new list.'],
    };
  },
  sim(c) {
    const forms = [
      [new RegExp(`^${c.y}\\s*=\\s*${c.x}\\s*\\.copy\\(\\s*\\)$`), 'copy'], [new RegExp(`^${c.y}\\s*=\\s*${c.x}\\s*\\[\\s*:\\s*\\]$`), 'copy'],
      [new RegExp(`^${c.y}\\s*=\\s*list\\(\\s*${c.x}\\s*\\)$`), 'copy'], [new RegExp(`^${c.y}\\s*=\\s*${c.x}$`), 'alias'],
    ];
    return {
      ok(line) {
        const f = forms.find(([re]) => re.test(stripMark(line)));
        if (!f) return false;
        const H = heap(), env = {};
        env[c.x] = H.alloc(c.vals.slice());
        env[c.y] = f[1] === 'alias' ? env[c.x] : H.alloc(H.get(env[c.x]).slice());
        const xs = H.get(env[c.x]);
        if (c.op === 'append') xs.push(c.v); else if (c.op === 'set') xs[0] = c.v; else if (c.op === 'sort') xs.sort((a, b) => a - b); else xs.length = 0;
        const ys = H.get(env[c.y]);
        const printed = c.op === 'append' || c.op === 'clear' ? ys.length : ys[0];
        return printed === (c.op === 'append' || c.op === 'clear' ? c.vals.length : c.vals[0]);
      },
    };
  },
};

// =============================================================================================
// C#
// =============================================================================================
// Strings are immutable: methods return a new string, which is lost unless it is assigned.
F['csharp-string'] = {
  lang: 'csharp', diffs: ['medium'],
  make(rng) {
    const [w, o] = names(rng, [['word', 'name', 'title', 'label'], ['saved', 'before', 'copy', 'old']]);
    const text = rng.pick(['cat', 'lamp', 'river', 'pixel', 'tiger', 'maple', 'cloud', 'stone', 'apple']);
    const op = rng.pick(['upper', 'upperAssign', 'replace', 'replaceAssign', 'copyAppend', 'copyAppend']);
    const from = rng.pick(text.split('').filter((ch, i, a) => a.indexOf(ch) === i));
    const to = rng.pick(['o', 'u', 'x', 'z'].filter(ch => !text.includes(ch)));
    const ask = rng.pick(['w', 'o']);
    return { w, o, text, op, from, to, ask, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { w, o, text, op, from, to } = c;
    const up = text.toUpperCase(), rep = text.split(from).join(to);
    let code, answer, why;
    if (op === 'copyAppend') {
      const askV = c.ask === 'w' ? w : o;
      code = [`string ${w} = "${text}";`, `string ${o} = ${w};`, `${w} += "s";`, `Console.WriteLine(${askV});`];
      answer = c.ask === 'w' ? text + 's' : text;
      why = `\`${w} += "s"\` cannot change the string "${text}": it builds a new string "${text}s" and makes ${tk(w)} refer to it. ${tk(o)} still refers to the old string.`;
    } else {
      const call = op.startsWith('upper') ? `${w}.ToUpper()` : `${w}.Replace("${from}", "${to}")`;
      const assign = op.endsWith('Assign');
      code = [`string ${w} = "${text}";`, assign ? `${w} = ${call};` : `${call};`, `Console.WriteLine(${w});`];
      const changed = op.startsWith('upper') ? up : rep;
      answer = assign ? changed : text;
      why = assign ? `\`${call}\` returns a new string ("${changed}"), and line 2 stores it back in ${tk(w)}.`
        : `\`${call}\` returns a new string ("${changed}"), but line 2 throws it away. Strings in C# are immutable, so ${tk(w)} itself never changes.`;
    }
    const choices = arrange(answer, [text, up, rep, text + 's', up + 's'], c.ord);
    return {
      code, ask: 'What does this program print?', type: 'choice', answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**. ${why}`,
      hints: ['A C# `string` can never be changed after it is created. Methods such as `ToUpper` and `Replace` return a **new** string.',
        'For each line, ask: is a new string stored in a variable, or is it thrown away? Which string does each variable refer to at the end?'],
    };
  },
  sim(c) {
    // values are immutable strings; a variable holds one; a call result counts only if assigned
    const env = {};
    env[c.w] = c.text;
    if (c.op === 'copyAppend') { env[c.o] = env[c.w]; env[c.w] = env[c.w] + 's'; return tk(env[c.ask === 'w' ? c.w : c.o]); }
    const result = c.op.startsWith('upper') ? env[c.w].toUpperCase() : env[c.w].replaceAll(c.from, c.to);
    if (c.op.endsWith('Assign')) env[c.w] = result;
    return tk(env[c.w]);
  },
};

const CS_TYPES = [['Point', 'X'], ['Counter', 'Value'], ['Cell', 'X'], ['Score', 'Points'], ['Slot', 'Count']];
const csTypeDecl = (kind, T, f) => ['', `${kind} ${T}`, '{', `    public int ${f};`, '}'];

// struct = value type (assignment copies it); class = reference type (assignment shares it).
F['csharp-struct'] = {
  lang: 'csharp', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const [T, f] = rng.pick(CS_TYPES);
    const kind = rng.pick(['struct', 'class']);
    if (diff === 'medium') {
      const [a, b] = names(rng, [['a', 'first', 'start', 'mine'], ['b', 'second', 'copy', 'other']]);
      return { T, f, kind, a, b, v0: rng.int(1, 9), v1: rng.int(10, 30), k: rng.int(2, 9), extra: rng.pick(['none', 'a', 'b']), ask: rng.pick(['a', 'a', 'b']) };
    }
    const [m, p] = names(rng, [['Change', 'Bump', 'Adjust', 'Update'], ['p', 'item', 'thing', 'box']]);
    const isRef = rng.pick([false, true]);
    const body = rng.pick([['add'], ['add'], ['reset', 'add'], ['add', 'reset']]);
    const calls = randList(rng, 1, 2, 1, 9);
    return { T, f, kind, m, p, isRef, body, calls, v0: rng.int(1, 9), r0: rng.pick([0, 100]) };
  },
  view(c, diff) {
    const { T, f, kind } = c, isStruct = kind === 'struct';
    if (diff === 'medium') {
      const { a, b, v0, v1, k, extra, ask } = c;
      const code = [`var ${a} = new ${T} { ${f} = ${v0} };`, `var ${b} = ${a};`, `${b}.${f} = ${v1};`,
        ...(extra === 'none' ? [] : [`${extra === 'a' ? a : b}.${f} += ${k};`]), `Console.WriteLine(${ask === 'a' ? a : b}.${f});`, ...csTypeDecl(kind, T, f)];
      let va = v0, vb = v0;
      if (isStruct) { vb = v1; if (extra === 'a') va += k; if (extra === 'b') vb += k; } else { va = vb = v1 + (extra === 'none' ? 0 : k); }
      const answer = ask === 'a' ? va : vb;
      return {
        code, ask: 'What does this program print?', type: 'number', answer,
        explanation: `It prints **${answer}**. ${T} is a **${kind}**. ` + (isStruct
          ? `A struct is a value type: \`var ${b} = ${a};\` copies all its fields, so ${tk(a)} and ${tk(b)} are two separate values and changing one never changes the other.`
          : `A class is a reference type: \`var ${b} = ${a};\` copies the reference, so ${tk(a)} and ${tk(b)} refer to the same object and a change through either name shows in both.`),
        hints: [`Look at the bottom: is ${tk(T)} declared as a \`struct\` or a \`class\`?`,
          `A struct assignment copies the value; a class assignment copies the reference. After line 2, are there one or two ${T} objects?`],
      };
    }
    const { m, p, isRef, body, calls, v0, r0 } = c;
    const r = isRef ? 'ref ' : '';
    const stmts = { add: `c.${f} += n;`, reset: `c = new ${T} { ${f} = ${r0} };` };
    const code = [`static void ${m}(${r}${T} c, int n)`, '{', ...body.map(s => '    ' + stmts[s]), '}', '',
      `var ${p} = new ${T} { ${f} = ${v0} };`, ...calls.map(n => `${m}(${r}${p}, ${n});`), `Console.WriteLine(${p}.${f});`, ...csTypeDecl(kind, T, f)];
    // closed form
    let val = v0;
    for (const n of calls) {
      if (isRef) { for (const s of body) val = s === 'add' ? val + n : r0; } else if (!isStruct) { if (body[0] === 'add') val += n; }
    }
    const answer = val;
    const why = isRef ? `\`ref\` passes the caller's variable itself, so \`c\` **is** ${tk(p)}: every change in \`${m}\`, including replacing it with a new ${T}, happens to ${tk(p)}.`
      : isStruct ? `A struct is passed **by value**: \`c\` is a copy, so nothing \`${m}\` does reaches ${tk(p)}.`
        : `A class is passed as a copy of the **reference**: \`c\` starts out pointing at the same object as ${tk(p)}, so \`c.${f} += n\` changes that object` +
          (body.includes('reset') ? `, but \`c = new ${T} …\` only points the local \`c\` at a new object; changes after that are lost.` : '.');
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. ${T} is a **${kind}**. ${why}`,
      hints: [`Check two things: is ${tk(T)} a \`struct\` or a \`class\`, and is the parameter passed with \`ref\`?`,
        'Without `ref`, the method gets a copy of the variable: a copy of the whole value for a struct, a copy of the reference for a class. Assigning a new object to the parameter never reaches the caller unless it is `ref`.'],
    };
  },
  sim(c, diff) {
    // heap model: class values live in the heap (variables hold ids); struct values live in variables
    const H = heap(), isStruct = c.kind === 'struct';
    const newObj = v => (isStruct ? { [c.f]: v } : H.alloc({ [c.f]: v }));
    const field = (vars, name) => (isStruct ? vars[name] : H.get(vars[name]));
    const copy = v => (isStruct ? { ...v } : v);
    if (diff === 'medium') {
      const vars = { A: newObj(c.v0) };
      vars.B = copy(vars.A);
      field(vars, 'B')[c.f] = c.v1;
      if (c.extra !== 'none') field(vars, c.extra === 'a' ? 'A' : 'B')[c.f] += c.k;
      return field(vars, c.ask === 'a' ? 'A' : 'B')[c.f];
    }
    const outer = { P: newObj(c.v0) };
    for (const n of c.calls) {
      const local = c.isRef ? outer : { C: copy(outer.P) };
      const key = c.isRef ? 'P' : 'C';
      for (const s of c.body) {
        if (s === 'add') field(local, key)[c.f] += n; else local[key] = newObj(c.r0);
      }
    }
    return field(outer, 'P')[c.f];
  },
};

// A List indexer returns a COPY of a struct element; an array element is the variable itself.
F['csharp-struct-list'] = {
  lang: 'csharp', diffs: ['expert'],
  make(rng) {
    const [T, f] = rng.pick(CS_TYPES);
    const [list, arr, item, slot] = names(rng, [['list', 'cells', 'items'], ['arr', 'grid', 'row'], ['item', 'first', 'got'], ['slot', 'entry', 'pick']]);
    return { T, f, list, arr, item, slot, kind: rng.pick(['struct', 'class']), a0: rng.int(1, 5), b0: rng.int(1, 5), v1: rng.int(10, 30), v2: rng.int(31, 60),
      writeBack: rng.pick([false, true]), arrForm: rng.pick(['copy', 'direct']) };
  },
  view(c) {
    const { T, f, list, arr, item, slot, kind, a0, b0, v1, v2, writeBack, arrForm } = c, isStruct = kind === 'struct';
    const code = [`var ${list} = new List<${T}> { new ${T} { ${f} = ${a0} } };`, `var ${arr} = new ${T}[] { new ${T} { ${f} = ${b0} } };`,
      `var ${item} = ${list}[0];`, `${item}.${f} = ${v1};`, ...(writeBack ? [`${list}[0] = ${item};`] : []),
      ...(arrForm === 'copy' ? [`var ${slot} = ${arr}[0];`, `${slot}.${f} = ${v2};`] : [`${arr}[0].${f} = ${v2};`]),
      `Console.WriteLine(${list}[0].${f});`, `Console.WriteLine(${arr}[0].${f});`, ...csTypeDecl(kind, T, f)];
    const lv = isStruct && !writeBack ? a0 : v1;
    const av = isStruct && arrForm === 'copy' ? b0 : v2;
    const parts = [
      { id: 'list', label: 'First line', ask: `What does \`Console.WriteLine(${list}[0].${f})\` print?`, answerType: 'number', answer: lv, tolerance: 0,
        hint: `\`var ${item} = ${list}[0];\` — for a ${kind}, is ${tk(item)} a copy or the same object?${writeBack ? ` Then line 5 stores ${tk(item)} back.` : ''}` },
      { id: 'arr', label: 'Second line', ask: `What does \`Console.WriteLine(${arr}[0].${f})\` print?`, answerType: 'number', answer: av, tolerance: 0,
        hint: arrForm === 'copy' ? `\`var ${slot} = ${arr}[0];\` copies what is in the array. What does that copy hold for a ${kind}?` : `\`${arr}[0].${f} = …\` writes straight into the array element. Is that the element itself?` },
    ];
    return {
      code, ask: 'What do the two lines print?', type: 'multi', parts,
      explanation: `It prints **${lv}** then **${av}**. ${T} is a **${kind}**. ` + (isStruct
        ? `Reading a struct out of a list or array (\`var x = ${list}[0];\`) copies it, so changing the copy leaves the element alone${writeBack ? ' until the copy is stored back with `' + list + '[0] = ' + item + ';`' : ''}. ` +
          `An **array** element is a variable, so \`${arr}[0].${f} = …\` changes the element in place. (The same line on a **List** would not compile, CS1612: the List indexer returns a copy.)`
        : 'With a class every variable and every element holds a reference to the same object, so a change through any of them is seen by all.'),
    };
  },
  sim(c) {
    const H = heap(), isStruct = c.kind === 'struct';
    const mk = v => (isStruct ? { [c.f]: v } : H.alloc({ [c.f]: v }));
    const deref = x => (isStruct ? x : H.get(x));
    const copy = x => (isStruct ? { ...x } : x);
    const list = [mk(c.a0)], arr = [mk(c.b0)];
    let item = copy(list[0]); // a List indexer returns the element (a copy for a struct)
    deref(item)[c.f] = c.v1;
    if (c.writeBack) list[0] = copy(item);
    if (c.arrForm === 'copy') { const slot = copy(arr[0]); deref(slot)[c.f] = c.v2; } else deref(arr[0])[c.f] = c.v2; // array element in place
    return { list: deref(list[0])[c.f], arr: deref(arr[0])[c.f] };
  },
};

// int overflow: unchecked (wraps) by default at run time; `checked` throws; constants are checked.
const INT_MAX = 2147483647;
F['csharp-overflow'] = {
  lang: 'csharp', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const v = rng.pick(['score', 'total', 'count', 'level']);
    const variant = rng.pick(diff === 'hard' ? ['plain', 'plain', 'checked', 'long'] : ['plain', 'checked', 'long', 'const', 'mul', 'mulChecked']);
    return { v, variant, d: rng.int(0, 4), n: rng.int(1, 9), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { v, variant, d, n } = c;
    const start = d ? `int.MaxValue - ${d}` : 'int.MaxValue';
    const s0 = INT_MAX - d;
    const THROW = 'It throws an `OverflowException`', NOCOMP = 'It does not compile';
    const wrap = x => ((x + 2 ** 31) % 2 ** 32 + 2 ** 32) % 2 ** 32 - 2 ** 31;
    let code, answer, math, why;
    if (variant === 'const') {
      code = [`int ${v} = int.MaxValue + ${n};`, `Console.WriteLine(${v});`];
      math = INT_MAX + n; answer = NOCOMP;
      why = '`int.MaxValue + ' + n + '` is a **constant expression**, and constant expressions are always checked: the compiler rejects it (CS0220, "The operation overflows at compile time in checked mode").';
    } else if (variant === 'mul' || variant === 'mulChecked') {
      const base = `int.MaxValue / 2 + ${d + 1}`, b0 = Math.trunc(INT_MAX / 2) + d + 1;
      math = b0 * 2;
      code = variant === 'mul' ? [`int ${v} = ${base};`, `${v} *= 2;`, `Console.WriteLine(${v});`]
        : [`int ${v} = ${base};`, 'checked', '{', `    ${v} *= 2;`, '}', `Console.WriteLine(${v});`];
      answer = variant === 'mul' ? String(wrap(math)) : THROW;
      why = `${tk(v)} starts at ${b0}, and doubling gives ${math}, which is more than \`int.MaxValue\` (${INT_MAX}). ` +
        (variant === 'mul' ? 'Arithmetic on variables is **unchecked** by default, so the result wraps around past `int.MinValue`.' : 'Inside a `checked` block an overflow throws `System.OverflowException` instead of wrapping.');
    } else {
      math = s0 + n;
      const over = math > INT_MAX;
      if (variant === 'long') {
        code = [`int ${v} = ${start};`, `long bigger = (long)${v} + ${n};`, 'Console.WriteLine(bigger);'];
        answer = String(math);
        why = `The cast makes the addition happen in \`long\` (64 bits), which easily holds ${math}: no overflow.`;
      } else if (variant === 'checked') {
        code = [`int ${v} = ${start};`, 'checked', '{', `    ${v} += ${n};`, '}', `Console.WriteLine(${v});`];
        answer = over ? THROW : String(math);
        why = over ? `${s0} + ${n} = ${math} is more than \`int.MaxValue\`, and inside \`checked\` an overflow throws \`System.OverflowException\`.` : `${s0} + ${n} fits in an \`int\`, so nothing overflows.`;
      } else {
        code = [`int ${v} = ${start};`, `${v} += ${n};`, `Console.WriteLine(${v});`];
        answer = String(over ? wrap(math) : math);
        why = over ? `${s0} + ${n} = ${math} does not fit in an \`int\` (max ${INT_MAX}). Arithmetic on variables is **unchecked** by default, so it wraps around: ${math} − 2³² = ${wrap(math)}.` : `${s0} + ${n} fits in an \`int\`, so nothing overflows.`;
      }
    }
    const fmt = s => (/^-?\d+$/.test(s) ? tk(s) : s);
    const choices = arrange(answer, [String(wrap(math)), String(math), THROW, NOCOMP, String(INT_MAX)], c.ord);
    return {
      code, ask: 'What happens when this runs? (Default project settings: no `<CheckForOverflowUnderflow>`.)', type: 'choice',
      answer: fmt(answer), choices: choices.map(fmt),
      explanation: `${fmt(answer)}. ${why}\n\n\`int\` is 32 bits: from ${-(2 ** 31)} to ${INT_MAX}.`,
      hints: ['`int.MaxValue` is 2147483647, the largest `int`. Work out the true result first and see whether it fits.',
        'C# checks overflow in three different ways: constant expressions are checked by the compiler, `checked` blocks throw at run time, and ordinary arithmetic on variables silently wraps around. Which case is this?'],
    };
  },
  sim(c) {
    const MAX = 2147483647n, MIN = -2147483648n, inInt = x => x >= MIN && x <= MAX;
    const THROW = 'It throws an `OverflowException`', NOCOMP = 'It does not compile';
    const fmt = s => (/^-?\d+$/.test(s) ? tk(s) : s);
    const n = BigInt(c.n), d = BigInt(c.d);
    if (c.variant === 'const') return fmt(inInt(MAX + n) ? String(MAX + n) : NOCOMP);
    if (c.variant === 'mul' || c.variant === 'mulChecked') {
      const x = (MAX / 2n + d + 1n) * 2n;
      return fmt(c.variant === 'mul' ? String(wrapBits(x, 32, true)) : inInt(x) ? String(x) : THROW);
    }
    const x = MAX - d + n;
    if (c.variant === 'long') return fmt(String(x));
    if (c.variant === 'checked') return fmt(inInt(x) ? String(x) : THROW);
    return fmt(String(wrapBits(x, 32, true)));
  },
};

// Which line does not compile? One group breaks a rule; the others are look-alikes that are fine.
const CS_RULES = {
  narrow: 'No implicit conversion from `double` to `int` (CS0266)',
  strIndex: 'Strings are immutable: `s[i]` is read-only (CS0200)',
  unassigned: 'A local variable must be assigned before it is read (CS0165)',
  constOverflow: 'A constant expression overflows `int` (CS0220)',
  listStruct: 'A struct read from a `List` indexer is a copy, so its field can\'t be set (CS1612)',
};
const CS_RULE_DECOYS = ['`var` can only be used for `int` values', 'A `char` can\'t be read from a `string`'];
F['csharp-compile'] = {
  lang: 'csharp', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const pool = diff === 'expert' ? ['narrow', 'strIndex', 'unassigned', 'constOverflow', 'listStruct'] : ['narrow', 'strIndex', 'unassigned', 'constOverflow'];
    const bad = rng.pick(pool);
    const goods = rng.shuffle(pool.filter(g => g !== bad)).slice(0, diff === 'expert' ? 3 : 2);
    const order = rng.shuffle([bad, ...goods]);
    const n = {
      t: rng.pick(['total', 'points', 'score']), h: rng.pick(['half', 'mid', 'share']), tv: rng.int(5, 40),
      s: rng.pick(['name', 'word', 'label']), ch: rng.pick(['first', 'initial', 'head']), word: rng.pick(['ann', 'bob', 'kim', 'lee', 'max']),
      cnt: rng.pick(['count', 'tally', 'hits']), k: rng.int(1, 9), big: rng.pick(['big', 'huge', 'limit']), cells: rng.pick(['cells', 'slots', 'tiles']), kx: rng.int(2, 9),
    };
    return { bad, order, n, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { bad, order, n } = c;
    const lines = [], suspects = [];
    let tail = [];
    for (const g of order) {
      const b = g === bad;
      const G = {
        narrow: [[`int ${n.t} = ${n.tv};`, b ? `int ${n.h} = ${n.t} / 2.0;` : `double ${n.h} = ${n.t} / 2.0;`], 1],
        strIndex: [[`string ${n.s} = "${n.word}";`, b ? `${n.s}[0] = '${n.word[0].toUpperCase()}';` : `char ${n.ch} = ${n.s}[0];`], 1],
        unassigned: [[b ? `int ${n.cnt};` : `int ${n.cnt} = 0;`, `${n.cnt} += ${n.k};`], 1],
        constOverflow: [[b ? `int ${n.big} = int.MaxValue + ${n.k};` : `long ${n.big} = int.MaxValue + ${n.k}L;`], 0],
        listStruct: [[`var ${n.cells} = new List<Cell> { new Cell { X = 1 } };`, b ? `${n.cells}[0].X = ${n.kx};` : `${n.cells}[0] = new Cell { X = ${n.kx} };`], 1],
      }[g];
      suspects.push(lines.length + G[1] + 1);
      lines.push(...G[0]);
      if (g === 'listStruct') tail = csTypeDecl('struct', 'Cell', 'X');
    }
    const code = [...lines, ...tail];
    const badLine = suspects[order.indexOf(bad)];
    let others = suspects.filter(x => x !== badLine);
    if (others.length < 3) others = [...others, ...[1, 2, 3, 4, 5].filter(x => x <= lines.length && x !== badLine && !others.includes(x))].slice(0, 3);
    const lc = lineChoices(badLine, others);
    const why = {
      narrow: `\`${n.t} / 2.0\` is a \`double\` (an \`int\` divided by a \`double\`), and C# never converts \`double\` to \`int\` implicitly because it could lose information. It needs a cast, \`(int)(${n.t} / 2.0)\`, or a \`double\` variable, as in a look-alike line.`,
      strIndex: `\`${n.s}[0]\` can be **read** (it gives a \`char\`), but C# strings are immutable, so the indexer is read-only and can't be assigned. Build a new string instead.`,
      unassigned: `\`int ${n.cnt};\` declares the variable without a value, and \`+=\` reads it first. C# refuses to read a local that is not definitely assigned.`,
      constOverflow: `\`int.MaxValue + ${n.k}\` is a constant expression, and constants are checked at compile time: it overflows \`int\`. With \`${n.k}L\` the sum is a \`long\` and fits.`,
      listStruct: `\`${n.cells}[0]\` calls the List indexer, which **returns a copy** of the struct. Setting a field on that temporary copy would be lost, so the compiler rejects it. Replace the whole element instead (\`${n.cells}[0] = new Cell { … }\`), as the look-alike does.`,
    }[bad];
    const expl = `Line ${badLine} does not compile: **${CS_RULES[bad]}**. ${why}\n\nThe other suspicious lines are fine.`;
    if (diff === 'expert') {
      const rules = arrange(CS_RULES[bad], [...Object.values(CS_RULES), ...CS_RULE_DECOYS], c.ord);
      return {
        code, ask: 'Exactly one line fails to compile. Which line, and which rule does it break?', type: 'multi', explanation: expl,
        parts: [
          { id: 'line', label: 'Line', ask: 'Which line fails to compile?', answerType: 'choice', answer: LINE(badLine), choices: lc, hint: 'Check each line that converts a type, writes into something, reads a variable or works out a constant. Ask: is this allowed exactly as written?' },
          { id: 'rule', label: 'Rule', ask: 'Which rule does it break?', answerType: 'choice', answer: CS_RULES[bad], choices: rules, hint: 'Name the rule for the line you picked. Compare it with its look-alike: what is different?' },
        ],
      };
    }
    return {
      code, ask: 'Exactly one line fails to compile. Which line?', type: 'choice', answer: LINE(badLine), choices: lc, explanation: expl,
      hints: ['Every line here is close to valid C#. Look for a line that changes a type, writes into a `string`, reads a variable before it has a value, or works out a constant that is too big.',
        'Compare each suspicious line with what C# allows: `double` → `int` needs a cast, strings can\'t be changed in place, locals must be assigned before use, and constant `int` maths is checked by the compiler.'],
    };
  },
  sim: (c, diff, v) => compileAnswer(F['csharp-compile'].check(c, diff, v), diff, CS_RULES),
  // A small C# checker over the rendered lines: declared types, definite assignment, implicit
  // conversions, constant folding, string indexer writes and struct-from-List writes.
  check(c, diff, v) {
    const lines = v.code, env = {}, structs = new Set();
    lines.forEach((l, i) => { const m = l.match(/^struct (\w+)$/); if (m) structs.add(m[1]); });
    const IMPLICIT = { int: ['int', 'long', 'double'], long: ['long', 'double'], double: ['double'], char: ['char', 'int', 'long', 'double'], string: ['string'] };
    const typeOf = e => { // → { type, k (BigInt constant) }
      e = e.trim();
      let m;
      if ((m = e.match(/^"[^"]*"$/))) return { type: 'string' };
      if ((m = e.match(/^'.'$/))) return { type: 'char' };
      if ((m = e.match(/^(\d+)L$/))) return { type: 'long', k: BigInt(m[1]) };
      if ((m = e.match(/^\d+\.\d+$/))) return { type: 'double' };
      if ((m = e.match(/^\d+$/))) return { type: 'int', k: BigInt(e) };
      if (e === 'int.MaxValue') return { type: 'int', k: 2147483647n };
      if ((m = e.match(/^new List<(\w+)> \{.*\}$/))) return { type: `List<${m[1]}>` };
      if ((m = e.match(/^new (\w+) \{.*\}$/))) return { type: m[1] };
      if ((m = e.match(/^(\w+)\[\d+\]$/))) { const t = env[m[1]]?.type; return { type: t === 'string' ? 'char' : (t || '').replace(/^List<(\w+)>$/, '$1'), read: m[1] }; }
      if ((m = e.match(/^(.+?) ([+/]) (.+)$/))) {
        const a = typeOf(m[1]), b = typeOf(m[3]);
        const rank = ['int', 'long', 'double'];
        const type = rank[Math.max(rank.indexOf(a.type === 'char' ? 'int' : a.type), rank.indexOf(b.type === 'char' ? 'int' : b.type))];
        const k = a.k !== undefined && b.k !== undefined ? (m[2] === '+' ? a.k + b.k : a.k / b.k) : undefined;
        return { type, k, reads: [a.read, b.read, ...(a.reads || []), ...(b.reads || [])].filter(Boolean) };
      }
      if ((m = e.match(/^\w+$/))) return { type: env[e]?.type, read: e };
      return { type: '?' };
    };
    const fail = (i, rule) => ({ line: i + 1, rule });
    const readsOk = t => [t.read, ...(t.reads || [])].filter(Boolean).every(n => env[n] && env[n].assigned);
    const overflow = t => t.type === 'int' && t.k !== undefined && (t.k > 2147483647n || t.k < -2147483648n);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^(struct|\{|\}|    public)/.test(l) || l === '') continue;
      let m;
      if ((m = l.match(/^(int|double|long|string|char|var) (\w+)(?: = (.+))?;$/))) {
        if (m[3] === undefined) { env[m[2]] = { type: m[1], assigned: false }; continue; }
        const t = typeOf(m[3]);
        if (!readsOk(t)) return fail(i, 'unassigned');
        if (overflow(t)) return fail(i, 'constOverflow');
        const declared = m[1] === 'var' ? t.type : m[1];
        if (!(IMPLICIT[t.type] || [t.type]).includes(declared)) return fail(i, 'narrow');
        env[m[2]] = { type: declared, assigned: true };
      } else if ((m = l.match(/^(\w+) \+= (.+);$/))) {
        if (!env[m[1]] || !env[m[1]].assigned) return fail(i, 'unassigned');
      } else if ((m = l.match(/^(\w+)\[\d+\]\.(\w+) = (.+);$/))) {
        const t = env[m[1]]?.type || '';
        const el = t.match(/^List<(\w+)>$/);
        if (el && structs.has(el[1])) return fail(i, 'listStruct');
      } else if ((m = l.match(/^(\w+)\[\d+\] = (.+);$/))) {
        if (env[m[1]]?.type === 'string') return fail(i, 'strIndex');
      } else return { line: -1, rule: 'unparsed' };
    }
    return { line: 0, rule: null };
  },
};

F['csharp-avg-line'] = {
  lang: 'csharp', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, a, b] = names(rng, [['Average', 'Mean', 'PerPerson', 'Share'], ['total', 'sum', 'points'], ['count', 'n', 'people']]);
    const den = rng.pick([2, 4, 5, 8]);
    let num = rng.int(9, 59); if (num % den === 0) num++;
    return { f, a, b, num, den, ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { f, a, b, num, den } = c;
    const bug = `return ${a} / ${b}`, answer = `return (double)${a} / ${b}`;
    const code = [`static double ${f}(int ${a}, int ${b})`, '{', `    ${bug};`, '}', '', `Console.WriteLine(${f}(${num}, ${den}));`];
    return {
      code, lead: `\`${f}\` should return the exact average, so this should print **${num / den}**, but it prints **${Math.trunc(num / den)}**.`,
      ask: rewriteAsk(diff, 3), type: 'text', answer, trail: ';', bug, lineNo: 3,
      alts: [`return ${a} / (double)${b}`, `return (double)${a} / (double)${b}`, `return (double) ${a} / ${b}`, `return ${a} / (double) ${b}`, `return 1.0 * ${a} / ${b}`, `return ${a} * 1.0 / ${b}`],
      distractors: [bug, `return (int)${a} / ${b}`, `return (double)${b} / ${a}`, `return ${a} % ${b}`],
      explanation: `Line 3 should be \`${answer};\`. Both parameters are \`int\`, so \`${a} / ${b}\` is whole-number division (${num} / ${den} → ${Math.trunc(num / den)}). The return type \`double\` only converts that already-cut result. Casting one side to \`double\` **before** dividing makes it a \`double\` division: ${num / den}. (\`(double)(${a} / ${b})\` would cast too late.)`,
      hints: ['What type is `' + a + ' / ' + b + '` when both sides are `int`? The return type does not change how the division itself is done.',
        'Make one side of the division a `double` before the division happens.', 'A cast such as `(double)` applies to the value right after it.'],
    };
  },
  sim(c) {
    const tests = [[c.num, c.den], [7, 2], [9, 4], [21, 8]];
    return {
      ok(line) {
        const m = stripMark(line).match(/^return\s+(.+)$/);
        if (!m) return false;
        return tests.every(([x, y]) => { try { const v = evalTyped(m[1], { [c.a]: x, [c.b]: y }, 'cs'); return v.t === 'd' && v.v === x / y; } catch { return false; } });
      },
    };
  },
};

// =============================================================================================
// C++
// =============================================================================================
// Pass by value / by reference / by pointer.
F['cpp-ref'] = {
  lang: 'cpp', diffs: ['medium'],
  make(rng) {
    const fns = names(rng, [['boost', 'grow', 'raise_by', 'top_up', 'add_to'], ['boost', 'grow', 'raise_by', 'top_up', 'add_to']]);
    const kinds = rng.shuffle(['val', 'ref', 'ptr']).slice(0, 2);
    const v = rng.pick(['score', 'hp', 'coins', 'level']);
    let calls;
    do { calls = Array.from({ length: rng.int(2, 3) }, () => ({ f: rng.int(0, 1), n: rng.int(1, 9) })); } while (new Set(calls.map(x => x.f)).size < 2);
    return { fns, kinds, v, start: rng.int(1, 9), calls };
  },
  view(c) {
    const { fns, kinds, v, start, calls } = c;
    const def = (f, k) => [`void ${f}(${k === 'val' ? 'int x' : k === 'ref' ? 'int& x' : 'int* x'}, int n) {`, `    ${k === 'ptr' ? '*x' : 'x'} += n;`, '}'];
    const code = [...def(fns[0], kinds[0]), '', ...def(fns[1], kinds[1]), '',
      ...inMain.cpp([`int ${v} = ${start};`, ...calls.map(x => `${fns[x.f]}(${kinds[x.f] === 'ptr' ? '&' : ''}${v}, ${x.n});`), `std::cout << ${v} << "\\n";`])];
    const answer = start + sum(calls.filter(x => kinds[x.f] !== 'val').map(x => x.n));
    const desc = k => ({ val: 'takes `int x` **by value**: it gets a copy, so its change is lost', ref: 'takes `int& x`, a **reference**: `x` is another name for the caller\'s variable', ptr: 'takes `int* x`, a **pointer** to the caller\'s variable, and changes it through `*x`' }[k]);
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. \`${fns[0]}\` ${desc(kinds[0])}; \`${fns[1]}\` ${desc(kinds[1])}. Only the calls that can reach ${tk(v)} change it.`,
      hints: ['Ignore the function names: read each parameter type. `int x` is a copy, `int& x` is a reference, `int* x` is a pointer.',
        `Go through the calls in order and add only the amounts from the functions that change the caller's ${tk(v)}.`],
    };
  },
  sim(c) {
    const mem = [c.start]; // address 0 = the variable in main
    for (const x of c.calls) {
      const k = c.kinds[x.f];
      if (k === 'val') { const local = [mem[0]]; local[0] += x.n; } else if (k === 'ref') mem[0] += x.n; else { const p = 0; mem[p] += x.n; }
    }
    return mem[0];
  },
};

// Pointers: *p changes what p points at; p = &b moves the pointer.
F['cpp-ptr'] = {
  lang: 'cpp', diffs: ['hard'],
  make(rng) {
    const [a, b, p] = names(rng, [['a', 'left', 'first', 'x'], ['b', 'right', 'second', 'y'], ['p', 'ptr', 'cur']]);
    let ops;
    do { ops = Array.from({ length: rng.int(3, 4) }, () => ({ k: rng.pick(['set', 'add', 'add', 'switch', 'direct']), v: rng.int(1, 9), t: rng.int(0, 1) })); } while (!ops.some(o => o.k === 'switch') || ops[0].k === 'switch' || ops[ops.length - 1].k === 'switch');
    return { a, b, p, a0: rng.int(1, 9), b0: rng.int(10, 20), ops };
  },
  view(c) {
    const { a, b, p, a0, b0, ops } = c;
    const val = { a: a0, b: b0 };
    let at = 'a';
    const lines = [`int ${a} = ${a0};`, `int ${b} = ${b0};`, `int* ${p} = &${a};`];
    for (const o of ops) {
      if (o.k === 'set') { lines.push(`*${p} = ${o.v};`); val[at] = o.v; } else if (o.k === 'add') { lines.push(`*${p} += ${o.v};`); val[at] += o.v; } else if (o.k === 'switch') { at = at === 'a' ? 'b' : 'a'; lines.push(`${p} = &${at === 'a' ? a : b};`); } else { const t = o.t ? 'b' : 'a'; lines.push(`${t === 'a' ? a : b} += ${o.v};`); val[t] += o.v; }
    }
    lines.push(`std::cout << ${a} << " " << ${b} << "\\n";`);
    return {
      code: inMain.cpp(lines), ask: 'The program prints two numbers. What are they?', type: 'multi',
      parts: [
        { id: 'first', label: 'First number', ask: `What is printed for ${tk(a)}?`, answerType: 'number', answer: val.a, tolerance: 0, hint: `Keep a note of which variable ${tk(p)} points at after every line. \`*${p}\` changes that variable; \`${p} = &…\` only moves the pointer.` },
        { id: 'second', label: 'Second number', ask: `What is printed for ${tk(b)}?`, answerType: 'number', answer: val.b, tolerance: 0, hint: `${tk(b)} changes only while ${tk(p)} points at it, or when a line names ${tk(b)} directly.` },
      ],
      explanation: `It prints **${val.a} ${val.b}**. \`int* ${p} = &${a};\` stores the address of ${tk(a)}. \`*${p} = …\` and \`*${p} += …\` change the variable ${tk(p)} currently points at; \`${p} = &…\` changes **where** it points and leaves both values alone.`,
    };
  },
  sim(c) {
    const mem = [c.a0, c.b0];
    let p = 0;
    for (const o of c.ops) {
      if (o.k === 'set') mem[p] = o.v; else if (o.k === 'add') mem[p] += o.v; else if (o.k === 'switch') p = 1 - p; else mem[o.t] += o.v;
    }
    return { first: mem[0], second: mem[1] };
  },
};

// A reference can't be re-seated: `r = b;` copies b's value into what r refers to.
F['cpp-refalias'] = {
  lang: 'cpp', diffs: ['expert'],
  make(rng) {
    const [a, b, r] = names(rng, [['a', 'left', 'first'], ['b', 'right', 'second'], ['r', 'ref', 'alias']]);
    let ops;
    do { ops = Array.from({ length: rng.int(3, 4) }, () => ({ k: rng.pick(['rAssignB', 'rAdd', 'bAdd', 'bFromR', 'aAdd', 'ptrAdd']), v: rng.int(1, 9) })); }
    while (!ops.some(o => o.k === 'rAssignB') || ops.filter(o => o.k === 'ptrAdd').length > 1);
    return { a, b, r, a0: rng.int(1, 9), b0: rng.int(10, 20), ops };
  },
  view(c) {
    const { a, b, r, a0, b0, ops } = c;
    let va = a0, vb = b0;
    const lines = [`int ${a} = ${a0};`, `int ${b} = ${b0};`, `int& ${r} = ${a};`];
    let havePtr = false;
    for (const o of ops) {
      if (o.k === 'rAssignB') { lines.push(`${r} = ${b};`); va = vb; } else if (o.k === 'rAdd') { lines.push(`${r} += ${o.v};`); va += o.v; } else if (o.k === 'bAdd') { lines.push(`${b} += ${o.v};`); vb += o.v; } else if (o.k === 'bFromR') { lines.push(`${b} = ${r} + ${o.v};`); vb = va + o.v; } else if (o.k === 'aAdd') { lines.push(`${a} += ${o.v};`); va += o.v; } else {
        if (!havePtr) lines.push(`int* q = &${r};`);
        havePtr = true;
        lines.push(`*q += ${o.v};`); va += o.v;
      }
    }
    lines.push(`std::cout << ${a} << " " << ${b} << "\\n";`);
    return {
      code: inMain.cpp(lines), ask: 'The program prints two numbers. What are they?', type: 'multi',
      parts: [
        { id: 'first', label: 'First number', ask: `What is printed for ${tk(a)}?`, answerType: 'number', answer: va, tolerance: 0, hint: `\`int& ${r} = ${a};\` makes ${tk(r)} another name for ${tk(a)}, for good. Every line that changes ${tk(r)} changes ${tk(a)}.` },
        { id: 'second', label: 'Second number', ask: `What is printed for ${tk(b)}?`, answerType: 'number', answer: vb, tolerance: 0, hint: `Does \`${r} = ${b};\` make ${tk(r)} refer to ${tk(b)}, or copy ${tk(b)}'s value? Only lines that name ${tk(b)} on the left change it.` },
      ],
      explanation: `It prints **${va} ${vb}**. A reference is bound once, when it is declared: \`int& ${r} = ${a};\` makes ${tk(r)} an alias of ${tk(a)} for its whole life. \`${r} = ${b};\` does **not** re-seat it; it copies ${tk(b)}'s current value into ${tk(a)}. ` +
        (havePtr ? `\`&${r}\` is the address of ${tk(a)}, so \`*q\` changes ${tk(a)} too.` : ''),
    };
  },
  sim(c) {
    const mem = [c.a0, c.b0];
    const r = 0; // the reference is the address of a, fixed at its declaration
    let q = null;
    for (const o of c.ops) {
      if (o.k === 'rAssignB') mem[r] = mem[1]; else if (o.k === 'rAdd') mem[r] += o.v; else if (o.k === 'bAdd') mem[1] += o.v; else if (o.k === 'bFromR') mem[1] = mem[r] + o.v; else if (o.k === 'aAdd') mem[0] += o.v; else { if (q === null) q = r; mem[q] += o.v; }
    }
    return { first: mem[0], second: mem[1] };
  },
};

// Undefined behaviour: identify it (never predict its output).
const CPP_UB = {
  oob: 'Reads past the end of an array',
  uninit: 'Reads a variable that was never initialised',
  overflow: 'Signed integer overflow',
  divzero: 'Integer division by zero',
  dangling: 'Uses a pointer to a variable whose lifetime has ended',
};
const CPP_UB_DECOYS = ['Unsigned integer wrap-around', 'Integer division that drops the remainder'];
F['cpp-ub'] = {
  lang: 'cpp', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const pool = diff === 'expert' ? ['oob', 'uninit', 'overflow', 'divzero', 'dangling'] : ['oob', 'uninit', 'overflow', 'divzero'];
    const bad = rng.pick(pool);
    const goods = rng.shuffle(pool.filter(g => g !== bad)).slice(0, diff === 'expert' ? 3 : 2);
    const order = rng.shuffle([bad, ...goods]);
    const N = rng.int(3, 5);
    const n = {
      arr: rng.pick(['scores', 'data', 'temps']), last: rng.pick(['last', 'top', 'end_value']), N, vals: randList(rng, N, N, 1, 9),
      sum: rng.pick(['sum', 'total', 'acc']), k: rng.int(2, 9), big: rng.pick(['big', 'huge', 'counter']),
      parts: rng.pick(['parts', 'groups', 'slots']), each: rng.pick(['each', 'share', 'per']), tot: rng.int(12, 40),
      p: rng.pick(['p', 'ptr', 'where']), tmp: rng.pick(['temp', 'local', 'tmp']), seen: rng.pick(['seen', 'got', 'read']), kt: rng.int(2, 9),
    };
    return { bad, order, n, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { bad, order, n } = c;
    const lines = [], suspects = [];
    for (const g of order) {
      const b = g === bad;
      const G = {
        oob: [[`int ${n.arr}[${n.N}] = {${n.vals.join(', ')}};`, b ? `int ${n.last} = ${n.arr}[${n.N}];` : `int ${n.last} = ${n.arr}[${n.N} - 1];`], 1],
        uninit: [[b ? `int ${n.sum};` : `int ${n.sum} = 0;`, `${n.sum} += ${n.k};`], 1],
        overflow: [[b ? `int ${n.big} = 2147483647;` : `unsigned int ${n.big} = 4294967295u;`, `${n.big} += 1;`], 1],
        divzero: [[`int ${n.parts} = 0;`, b ? `int ${n.each} = ${n.tot} / ${n.parts};` : `int ${n.each} = ${n.tot} / (${n.parts} + 1);`], 1],
        dangling: b ? [[`int* ${n.p} = nullptr;`, '{', `    int ${n.tmp} = ${n.kt};`, `    ${n.p} = &${n.tmp};`, '}', `int ${n.seen} = *${n.p};`], 5]
          : [[`int ${n.tmp} = ${n.kt};`, `int* ${n.p} = &${n.tmp};`, `int ${n.seen} = *${n.p};`], 2],
      }[g];
      suspects.push(lines.length + G[1] + 2); // +1 for 1-based, +1 for `int main() {`
      lines.push(...G[0]);
    }
    const code = inMain.cpp(lines);
    const badLine = suspects[order.indexOf(bad)];
    let others = suspects.filter(x => x !== badLine);
    if (others.length < 3) others = [...others, ...Array.from({ length: lines.length }, (_, i) => i + 2).filter(x => x !== badLine && !others.includes(x) && !/^\s*[{}]?\s*$/.test(code[x - 1]))].slice(0, 3);
    const lc = lineChoices(badLine, others);
    const why = {
      oob: `\`${n.arr}\` has ${n.N} elements, at indexes 0 to ${n.N - 1}. Index ${n.N} is one past the end. C++ does not check array bounds: reading there is undefined behaviour, so the program might print rubbish, crash, or seem fine.`,
      uninit: `\`int ${n.sum};\` has no initial value (it is indeterminate), and \`+=\` reads it. Reading an uninitialised \`int\` is undefined behaviour; it is not 0.`,
      overflow: `\`${n.big}\` already holds the largest 32-bit \`int\`, so \`+= 1\` overflows. **Signed** overflow is undefined behaviour in C++ (the compiler may assume it never happens). Unsigned arithmetic, by contrast, is defined to wrap around.`,
      divzero: `\`${n.parts}\` is 0, so \`${n.tot} / ${n.parts}\` divides by zero: undefined behaviour (often a crash).`,
      dangling: `\`${n.tmp}\` lives only inside the \`{ … }\` block. After the \`}\` its lifetime has ended, so \`${n.p}\` dangles and \`*${n.p}\` is undefined behaviour, even if it happens to print ${n.kt}.`,
    }[bad];
    const OK = { oob: 'an index inside the array', uninit: 'a variable that starts at 0', overflow: 'unsigned wrap-around (defined)', divzero: 'a divisor that is never 0', dangling: 'a pointer to a variable that is still alive' };
    const lookalike = `The look-alike lines are fine: ${order.filter(g => g !== bad).map(g => OK[g]).join(', ')}.`;
    const expl = `Line ${badLine} has undefined behaviour: **${CPP_UB[bad]}**. ${why}\n\n${lookalike} Undefined behaviour is not a predictable result: never rely on what such a line "prints".`;
    if (diff === 'expert') {
      return {
        code, ask: 'Exactly one line has undefined behaviour. Which line, and what kind is it? (Assume a 32-bit `int`.)', type: 'multi', explanation: expl,
        parts: [
          { id: 'line', label: 'Line', ask: 'Which line has undefined behaviour?', answerType: 'choice', answer: LINE(badLine), choices: lc, hint: 'For each suspicious line, ask: is the index inside the array, does the variable have a value yet, does the result fit, can the divisor be 0, and is the pointed-to variable still alive?' },
          { id: 'rule', label: 'Kind', ask: 'What kind of undefined behaviour is it?', answerType: 'choice', answer: CPP_UB[bad], choices: arrange(CPP_UB[bad], [...Object.values(CPP_UB), ...CPP_UB_DECOYS], c.ord), hint: 'Name what goes wrong on the line you picked. Careful: unsigned wrap-around is defined behaviour.' },
        ],
      };
    }
    return {
      code, ask: 'Exactly one line has undefined behaviour. Which line? (Assume a 32-bit `int`.)', type: 'choice', answer: LINE(badLine), choices: lc, explanation: expl,
      hints: ['Undefined behaviour compiles, but C++ makes no promise about what happens. Look for reads outside an array, reads of variables with no value, signed `int` overflow and division by zero.',
        'Each suspicious line has a look-alike nearby that is fine. Compare them: what exactly is different?'],
    };
  },
  sim: (c, diff, v) => compileAnswer(F['cpp-ub'].check(c, diff, v), diff, { ...CPP_UB }),
  // A C++ checker over the rendered lines: array bounds, initialisation, int range, divisors and
  // pointer targets' lifetimes (block scopes).
  check(c, diff, v) {
    const lines = v.code, env = {}, scopes = [[]];
    const fail = (i, rule) => ({ line: i + 1, rule });
    const read = (e, i) => { // → { v: BigInt } or { ub }
      e = e.trim();
      let m;
      if ((m = e.match(/^(\d+)u?$/))) return { v: BigInt(m[1]) };
      if ((m = e.match(/^(\w+)\[(\w+)(?: - (\d+))?\]$/))) {
        const arr = env[m[1]], idx = BigInt(m[2]) - BigInt(m[3] || 0);
        if (!arr || idx < 0n || idx >= BigInt(arr.size)) return { ub: 'oob' };
        return { v: arr.vals[Number(idx)] };
      }
      if ((m = e.match(/^\*(\w+)$/))) { const t = env[m[1]]?.to; if (!t || !env[t] || !env[t].alive) return { ub: 'dangling' }; return read(t, i); }
      if ((m = e.match(/^(\d+) \/ \(?(\w+)(?: \+ (\d+)\))?$/))) {
        const d = read(m[2], i); if (d.ub) return d;
        const div = d.v + BigInt(m[3] || 0);
        if (div === 0n) return { ub: 'divzero' };
        return { v: BigInt(m[1]) / div };
      }
      if ((m = e.match(/^(\w+)$/))) { const x = env[m[1]]; if (!x || !x.alive) return { ub: 'dangling' }; if (!x.init) return { ub: 'uninit' }; return { v: x.v }; }
      return { ub: 'unparsed' };
    };
    for (let i = 1; i < lines.length - 1; i++) {
      const l = lines[i].trim();
      let m;
      if (l === '{') { scopes.push([]); continue; }
      if (l === '}') { for (const nm of scopes.pop()) env[nm].alive = false; continue; }
      if ((m = l.match(/^int (\w+)\[(\d+)\] = \{(.*)\};$/))) { env[m[1]] = { size: +m[2], vals: m[3].split(', ').map(BigInt), alive: true, init: true }; scopes[scopes.length - 1].push(m[1]); continue; }
      if ((m = l.match(/^int\* (\w+) = (nullptr|&(\w+));$/))) { env[m[1]] = { to: m[3] || null, alive: true, init: true }; scopes[scopes.length - 1].push(m[1]); continue; }
      if ((m = l.match(/^(\w+) = &(\w+);$/))) { env[m[1]].to = m[2]; continue; }
      if ((m = l.match(/^(unsigned int|int) (\w+)(?: = (.+))?;$/))) {
        let val = null;
        if (m[3] !== undefined) { const r = read(m[3], i); if (r.ub) return r.ub === 'unparsed' ? { line: -1 } : fail(i, r.ub); val = r.v; }
        env[m[2]] = { unsigned: m[1] === 'unsigned int', init: m[3] !== undefined, v: val, alive: true };
        scopes[scopes.length - 1].push(m[2]);
        continue;
      }
      if ((m = l.match(/^(\w+) \+= (\d+);$/))) {
        const x = env[m[1]];
        if (!x.init) return fail(i, 'uninit');
        const nv = x.v + BigInt(m[2]);
        if (x.unsigned) x.v = wrapBits(nv, 32, false); else if (nv > 2147483647n) return fail(i, 'overflow'); else x.v = nv;
        continue;
      }
      return { line: -1 };
    }
    return { line: 0 };
  },
};

F['cpp-ref-line'] = {
  lang: 'cpp', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, p, n, v] = names(rng, [['add_bonus', 'give_points', 'top_up', 'boost'], ['score', 'points', 'total'], ['bonus', 'extra', 'amount'], ['player', 'hp', 'coins']]);
    return { f, p, n, v, start: rng.int(5, 20), k: rng.int(2, 9), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { f, p, n, v, start, k } = c;
    const bug = `void ${f}(int ${p}, int ${n})`, answer = `void ${f}(int& ${p}, int ${n})`;
    const code = [`${bug} {`, `    ${p} += ${n};`, '}', '', ...inMain.cpp([`int ${v} = ${start};`, `${f}(${v}, ${k});`, `std::cout << ${v} << "\\n";`])];
    return {
      code, lead: `\`${f}\` should add to the caller's variable, so this should print **${start + k}**. It prints **${start}**.`,
      ask: rewriteAsk(diff, 1, `\`${f}\` changes the caller's variable (keep the call in \`main\` as it is)`), type: 'text', answer, trail: ' {', bug, lineNo: 1,
      alts: [`void ${f}(int &${p}, int ${n})`, `void ${f}(int & ${p}, int ${n})`],
      distractors: [bug, `void ${f}(int ${p}, int& ${n})`, `void ${f}(const int& ${p}, int ${n})`, `int ${f}(int ${p}, int ${n})`, `${f}(&${v}, ${k})`],
      explanation: `Line 1 should be \`${answer} {\`. \`int ${p}\` is passed **by value**: \`${f}\` changes its own copy, which disappears when it returns. \`int& ${p}\` is a **reference**, another name for the caller's ${tk(v)}, so \`${p} += ${n}\` changes ${tk(v)}. (A pointer, \`int* ${p}\`, would also need \`&${v}\` at the call and \`*${p}\` inside, so it doesn't fit without changing other lines; \`const int&\` can't be changed at all.)`,
      hints: [`How does ${tk(v)} reach \`${f}\`: as a copy, or as the variable itself?`, 'C++ passes by value unless the parameter type says otherwise.',
        'Add one symbol to the parameter type to make it a reference. The call doesn\'t change.'],
    };
  },
  sim(c) {
    const re = new RegExp(`^void\\s+${c.f}\\s*\\(\\s*(const\\s+)?int\\s*(&|\\*)?\\s*${c.p}\\s*,\\s*int\\s+${c.n}\\s*\\)$`);
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m) return false;
        if (m[1]) return false; // `p += n` on a const reference does not compile
        if (m[2] === '*') return false; // `f(v, k)` passes an int where an int* is needed: does not compile
        const mem = [c.start];
        if (m[2] === '&') mem[0] += c.k; else { const copy = [mem[0]]; copy[0] += c.k; }
        return mem[0] === c.start + c.k;
      },
    };
  },
};

F['cpp-avg-line'] = {
  lang: 'cpp', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, a, b] = names(rng, [['average', 'mean', 'per_person', 'share'], ['total', 'sum', 'points'], ['count', 'n', 'people']]);
    const den = rng.pick([2, 4, 5, 8]);
    let num = rng.int(9, 59); if (num % den === 0) num++;
    return { f, a, b, num, den, ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { f, a, b, num, den } = c;
    const bug = `return ${a} / ${b}`, answer = `return (double)${a} / ${b}`;
    const code = [`double ${f}(int ${a}, int ${b}) {`, `    ${bug};`, '}', '', ...inMain.cpp([`std::cout << ${f}(${num}, ${den}) << "\\n";`])];
    return {
      code, lead: `\`${f}\` should return the exact average, so this should print **${num / den}**, but it prints **${Math.trunc(num / den)}**.`,
      ask: rewriteAsk(diff, 2), type: 'text', answer, trail: ';', bug, lineNo: 2,
      alts: [`return ${a} / (double)${b}`, `return static_cast<double>(${a}) / ${b}`, `return ${a} / static_cast<double>(${b})`, `return (double)${a} / (double)${b}`, `return (double) ${a} / ${b}`, `return 1.0 * ${a} / ${b}`, `return ${a} * 1.0 / ${b}`],
      distractors: [bug, `return (int)${a} / ${b}`, `return (double)${b} / ${a}`, `return ${a} % ${b}`],
      explanation: `Line 2 should be \`${answer};\` (or \`static_cast<double>(${a}) / ${b}\`). With two \`int\`s, \`/\` is integer division and truncates (${num} / ${den} → ${Math.trunc(num / den)}); the \`double\` return type only converts the already-truncated result. Converting one side to \`double\` first makes it a floating-point division: ${num / den}.`,
      hints: ['What type is `' + a + ' / ' + b + '` when both sides are `int`? The return type does not change how the division is done.',
        'Make one side of the division a `double` before the division happens.', 'A C-style cast such as `(double)` applies to the value right after it.'],
    };
  },
  sim(c) {
    const tests = [[c.num, c.den], [7, 2], [9, 4], [21, 8]];
    return {
      ok(line) {
        const m = stripMark(line).match(/^return\s+(.+)$/);
        if (!m) return false;
        return tests.every(([x, y]) => { try { const v = evalTyped(m[1], { [c.a]: x, [c.b]: y }, 'cpp'); return v.t === 'd' && v.v === x / y; } catch { return false; } });
      },
    };
  },
};

// =============================================================================================
// GDScript (Godot 4)
// =============================================================================================
// Arrays and Dictionaries are shared by reference; ints are copied.
F['gdscript-ref'] = {
  lang: 'gdscript', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const [x, y] = names(rng, [['scores', 'items', 'marks', 'inventory'], ['other', 'backup', 'saved', 'list_b']]);
    const vals = randList(rng, 2, 4, 1, 9);
    const v = rng.int(10, 20);
    const container = rng.pick(['array', 'array', 'dict']);
    const key = rng.pick(['hp', 'gold', 'speed']);
    if (diff === 'medium') return { x, y, vals, v, container, key, how: rng.pick(['alias', 'alias', 'dup']), op: rng.pick(['add', 'set']) };
    const [f, amt] = names(rng, [['add_bonus', 'apply', 'reward', 'boost'], ['amount', 'bonus', 'extra']]);
    return { x, vals, v, container, key, f, amt, body: rng.pick([['change'], ['change', 'reset'], ['reset', 'change'], ['change']]), ask: rng.pick(['container', 'container', 'int']), k: rng.int(1, 9) };
  },
  view(c, diff) {
    const { x, vals, v, container, key } = c, isArr = container === 'array';
    const lit = isArr ? pyList(vals) : `{"${key}": ${vals[0]}}`;
    if (diff === 'medium') {
      const { y, how, op } = c;
      const opLine = isArr ? (op === 'add' ? `${y}.append(${v})` : `${y}[0] = ${v}`) : (op === 'add' ? `${y}["${key}"] += ${v}` : `${y}["${key}"] = ${v}`);
      const askText = isArr ? (op === 'add' ? `${x}.size()` : `${x}[0]`) : `${x}["${key}"]`;
      const shared = how === 'alias';
      const answer = !shared ? (isArr ? (op === 'add' ? vals.length : vals[0]) : vals[0]) : isArr ? (op === 'add' ? vals.length + 1 : v) : op === 'add' ? vals[0] + v : v;
      const code = inMain.gdscript([`var ${x} := ${lit}`, `var ${y} = ${how === 'alias' ? x : `${x}.duplicate()`}`, opLine, `print(${askText})`]);
      return {
        code, ask: 'What does this program print?', type: 'number', answer,
        explanation: `It prints **${answer}**. ${isArr ? 'Arrays' : 'Dictionaries'} in GDScript are passed and assigned **by reference**. ` +
          (shared ? `\`var ${y} = ${x}\` makes ${tk(y)} refer to the same ${isArr ? 'Array' : 'Dictionary'}, so the change through ${tk(y)} shows in ${tk(x)}.` : `\`${x}.duplicate()\` makes a new ${isArr ? 'Array' : 'Dictionary'}, so changing ${tk(y)} leaves ${tk(x)} alone.`),
        hints: [`Does line ${5} create a second ${isArr ? 'Array' : 'Dictionary'}, or a second name for the same one?`, 'In GDScript, Arrays and Dictionaries are reference types; `int`, `float` and `String` values are copied.'],
      };
    }
    const { f, amt, body, ask, k } = c;
    const change = isArr ? `list.append(${amt})` : `list["${key}"] += ${amt}`;
    const reset = isArr ? 'list = []' : `list = {"${key}": 0}`;
    const ptype = isArr ? 'Array' : 'Dictionary';
    const stmts = { change, reset };
    const code = [`extends Node`, '', `func ${f}(list: ${ptype}, ${amt}: int) -> void:`, ...body.map(s => '    ' + stmts[s]), `    ${amt} += 10`, '',
      'func _ready() -> void:', `    var ${x} := ${lit}`, `    var gift := ${k}`, `    ${f}(${x}, gift)`, ask === 'int' ? '    print(gift)' : `    print(${isArr ? `${x}.size()` : `${x}["${key}"]`})`];
    const reached = body[0] === 'change';
    const answer = ask === 'int' ? k : isArr ? vals.length + (reached ? 1 : 0) : vals[0] + (reached ? k : 0);
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. ` + (ask === 'int'
        ? `\`gift\` is an \`int\`, which is passed **by value**: \`${amt} += 10\` changes only the function's own copy.`
        : `The ${ptype} is passed **by reference**, so \`list\` starts out as the caller's ${tk(x)}. ` + (body.includes('reset')
          ? `\`${reset}\` only points the local \`list\` at a new, empty ${ptype}; ` + (reached ? 'the change made before it already reached the caller.' : 'the change after it goes to the new one, and the caller never sees it.')
          : `\`${change}\` changes the caller's ${ptype}.`)),
      hints: [`What is passed by reference here, and what is copied? ${ptype}s are shared; \`int\`s are copied.`,
        body.includes('reset') ? `Assigning a new ${ptype} to the parameter (\`${reset}\`) does not touch the caller's ${ptype}. What matters is which line comes first.` : 'Follow the call: which of the caller\'s variables can the function actually change?'],
    };
  },
  sim(c, diff) {
    const H = heap(), isArr = c.container === 'array';
    const mk = () => (isArr ? c.vals.slice() : { [c.key]: c.vals[0] });
    if (diff === 'medium') {
      const env = {};
      env.x = H.alloc(mk());
      env.y = c.how === 'alias' ? env.x : H.alloc(isArr ? H.get(env.x).slice() : { ...H.get(env.x) });
      const o = H.get(env.y);
      if (isArr) { if (c.op === 'add') o.push(c.v); else o[0] = c.v; } else if (c.op === 'add') o[c.key] += c.v; else o[c.key] = c.v;
      const X = H.get(env.x);
      return isArr ? (c.op === 'add' ? X.length : X[0]) : X[c.key];
    }
    const caller = { x: H.alloc(mk()), gift: c.k };
    const local = { list: caller.x, amt: caller.gift }; // reference copied; int copied
    for (const s of c.body) {
      if (s === 'reset') local.list = H.alloc(isArr ? [] : { [c.key]: 0 });
      else if (isArr) H.get(local.list).push(local.amt); else H.get(local.list)[c.key] += local.amt;
    }
    local.amt += 10;
    if (c.ask === 'int') return caller.gift;
    const X = H.get(caller.x);
    return isArr ? X.length : X[c.key];
  },
};

// for loops: range(a, b, s) stops before b; `for i in n` counts 0 … n-1.
F['gdscript-range'] = {
  lang: 'gdscript', diffs: ['medium'],
  make(rng) {
    const form = rng.pick(['range3', 'range2', 'down', 'int', 'range1']);
    const a = rng.int(0, 5), s = rng.int(2, 4), b = a + s * rng.int(2, 5) + rng.int(0, s - 1);
    const n = rng.int(3, 7);
    const what = rng.pick(['sum', 'sum', 'count']);
    const [t, i] = names(rng, [['total', 'acc', 'result'], ['i', 'n', 'step']]);
    return { form, a, b, s, n, what, t, i };
  },
  view(c) {
    const { form, a, b, s, n, what, t, i } = c;
    const head = { range3: `range(${a}, ${b}, ${s})`, range2: `range(${a}, ${b})`, down: `range(${b}, ${a}, -${s})`, int: `${n}`, range1: `range(${n})` }[form];
    // closed forms (arithmetic series)
    let first, step, count;
    if (form === 'range3') { first = a; step = s; count = Math.ceil((b - a) / s); } else if (form === 'range2') { first = a; step = 1; count = b - a; } else if (form === 'down') { first = b; step = -s; count = Math.ceil((b - a) / s); } else { first = 0; step = 1; count = n; }
    const last = first + step * (count - 1);
    const answer = what === 'count' ? count : (count * (first + last)) / 2;
    const code = inMain.gdscript([`var ${t} := 0`, `for ${i} in ${head}:`, `    ${t} += ${what === 'count' ? 1 : i}`, `print(${t})`]);
    return {
      code, ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. \`for ${i} in ${head}\` gives ${tk(i)} = ${Array.from({ length: count }, (_, k) => first + step * k).join(', ')}. ` +
        '`range(a, b, s)` starts at a and stops **before** b (with a negative step it counts down and stops before b); `for i in n` with a number counts 0, 1, …, n - 1.',
      hints: [`List the values ${tk(i)} takes. Where does \`${head}\` start, what does it count by, and where does it stop?`,
        'The end value is never included. Then ' + (what === 'count' ? 'count how many values there are.' : 'add them all up.')],
    };
  },
  sim(c) {
    const vals = [];
    const loop = (a, b, s) => { if (s > 0) for (let x = a; x < b; x += s) vals.push(x); else for (let x = a; x > b; x += s) vals.push(x); };
    if (c.form === 'range3') loop(c.a, c.b, c.s); else if (c.form === 'range2') loop(c.a, c.b, 1); else if (c.form === 'down') loop(c.b, c.a, -c.s); else loop(0, c.n, 1);
    return c.what === 'count' ? vals.length : vals.reduce((x, y) => x + y, 0);
  },
};

// Static typing: `: int` and `:=` fix a variable's type; an untyped `var` can change type.
const GD_RULES = {
  annot: 'A variable declared with a type (`: int`) can only hold that type',
  infer: '`:=` fixes the variable\'s type from its first value',
};
const GD_RULE_DECOYS = ['An untyped `var` can\'t change type later', 'An `int` can\'t be stored in a `float` variable', 'A `String` can\'t be reassigned once set'];
F['gdscript-typed'] = {
  lang: 'gdscript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const bad = rng.pick(['annot', 'infer']);
    const goods = rng.shuffle(['annotOk', 'inferOk', 'untyped', 'floatOk'].filter(g => !g.startsWith(bad))).slice(0, diff === 'expert' ? 3 : 2);
    const order = rng.shuffle([bad, ...goods]);
    const n = {
      lives: rng.pick(['lives', 'health', 'ammo']), lv: rng.int(2, 9), title: rng.pick(['title', 'label', 'player']), word: rng.pick(['Level', 'Hero', 'Start']),
      any: rng.pick(['anything', 'value', 'slot']), av: rng.int(2, 9), speed: rng.pick(['speed', 'scale', 'gravity']), sv: rng.pick(['2.5', '0.5', '1.5']), k: rng.int(2, 9),
    };
    return { bad, order, n, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { bad, order, n } = c;
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const lines = [], suspects = [];
    for (const g of order) {
      const G = {
        annot: [`var ${n.lives}: int = ${n.lv}`, `${n.lives} = "${words[n.k]}"`],
        annotOk: [`var ${n.lives}: int = ${n.lv}`, `${n.lives} = ${n.k}`],
        infer: [`var ${n.title} := "${n.word}"`, `${n.title} = ${n.k}`],
        inferOk: [`var ${n.title} := "${n.word}"`, `${n.title} = "${n.word} ${n.k}"`],
        untyped: [`var ${n.any} = ${n.av}`, `${n.any} = "${words[n.av]}"`],
        floatOk: [`var ${n.speed}: float = ${n.sv}`, `${n.speed} = ${n.k}`],
      }[g];
      suspects.push(lines.length + 2 + 3); // second line of the group; 3 lines of frame before the body
      lines.push(...G);
    }
    const code = inMain.gdscript(lines);
    const badLine = suspects[order.indexOf(bad)];
    let others = suspects.filter(x => x !== badLine);
    if (others.length < 3) others = [...others, ...lines.map((_, j) => j + 4).filter(x => !suspects.includes(x))].slice(0, 3);
    const lc = lineChoices(badLine, others);
    const why = bad === 'annot'
      ? `\`${n.lives}\` is declared \`: int\`, so it can only hold an \`int\`. Assigning a \`String\` is an error the editor reports before the game runs ("Cannot assign a value of type String to variable ${n.lives} with specified type int").`
      : `\`var ${n.title} := "${n.word}"\` **infers** the type \`String\` from the first value and fixes it, exactly as if it were written \`: String\`. Assigning an \`int\` is then an error.`;
    const OK = { annotOk: 'a typed `int` variable given another `int`', inferOk: 'an inferred `String` given another `String`', untyped: 'an untyped `var` (no `:`) can hold any type and may change type', floatOk: 'an `int` can be stored in a `float` variable (it is converted)' };
    const expl = `Line ${badLine} is an error: **${bad === 'annot' ? GD_RULES.annot : GD_RULES.infer}**. ${why}\n\nThe look-alikes are fine: ${order.filter(g => g !== bad).map(g => OK[g]).join('; ')}.`;
    if (diff === 'expert') {
      return {
        code, ask: 'Exactly one line is an error. Which line, and which rule does it break?', type: 'multi', explanation: expl,
        parts: [
          { id: 'line', label: 'Line', ask: 'Which line is an error?', answerType: 'choice', answer: LINE(badLine), choices: lc, hint: 'For each variable, decide its type from its declaration: `: Type`, `:=` (type taken from the first value) or plain `var` (no fixed type). Then check every later assignment.' },
          { id: 'rule', label: 'Rule', ask: 'Which rule does it break?', answerType: 'choice', answer: GD_RULES[bad], choices: arrange(GD_RULES[bad], [...Object.values(GD_RULES), ...GD_RULE_DECOYS], c.ord), hint: 'How was that variable declared: with an explicit type, or with `:=`?' },
        ],
      };
    }
    return {
      code, ask: 'Exactly one line is an error. Which line?', type: 'choice', answer: LINE(badLine), choices: lc, explanation: expl,
      hints: ['Work out each variable\'s type from its declaration: `var x: int = …` and `var x := …` both fix a type; `var x = …` does not.',
        'Then check each later assignment: does the new value have the variable\'s type (or an `int` going into a `float`)?'],
    };
  },
  sim: (c, diff, v) => compileAnswer(F['gdscript-typed'].check(c, diff, v), diff, GD_RULES),
  // A GDScript static type checker over the rendered lines.
  check(c, diff, v) {
    const env = {};
    const typeOf = e => (/^".*"$/.test(e) ? 'String' : /^-?\d+$/.test(e) ? 'int' : /^-?\d+\.\d+$/.test(e) ? 'float' : '?');
    const lines = v.code;
    for (let i = 3; i < lines.length; i++) {
      const l = lines[i].trim();
      let m;
      if ((m = l.match(/^var (\w+)(?:: (\w+) =| :=| =) (.+)$/))) {
        const t = typeOf(m[3]);
        if (m[2] && m[2] !== t && !(m[2] === 'float' && t === 'int')) return { line: i + 1, rule: 'annot' };
        env[m[1]] = { type: m[2] || (l.includes(':=') ? t : null), how: m[2] ? 'annot' : l.includes(':=') ? 'infer' : null };
      } else if ((m = l.match(/^(\w+) = (.+)$/))) {
        const x = env[m[1]], t = typeOf(m[2]);
        if (x.type && x.type !== t && !(x.type === 'float' && t === 'int')) return { line: i + 1, rule: x.how };
      } else return { line: -1 };
    }
    return { line: 0 };
  },
};

F['gdscript-dup-line'] = {
  lang: 'gdscript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [x, y] = names(rng, [['scores', 'items', 'stats', 'loot'], ['backup', 'saved', 'before', 'original']]);
    const container = rng.pick(['array', 'array', 'dict']);
    return { x, y, container, vals: randList(rng, 2, 4, 1, 9), key: rng.pick(['hp', 'gold', 'speed']), v: rng.int(10, 20), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { x, y, container, vals, key, v } = c, isArr = container === 'array';
    const lit = isArr ? pyList(vals) : `{"${key}": ${vals[0]}}`;
    const bug = `var ${y} = ${x}`, answer = `var ${y} = ${x}.duplicate()`;
    const opLine = isArr ? `${x}.append(${v})` : `${x}["${key}"] = ${v}`;
    const askText = isArr ? `${y}.size()` : `${y}["${key}"]`;
    const want = isArr ? vals.length : vals[0], got = isArr ? vals.length + 1 : v;
    const code = inMain.gdscript([`var ${x} := ${lit}`, bug, opLine, `print(${askText})`]);
    return {
      code, lead: `${tk(y)} should keep the ${isArr ? 'Array' : 'Dictionary'} as it was before line 6, so this should print **${want}**. It prints **${got}** instead.`,
      ask: rewriteAsk(diff, 5, `${tk(y)} is a separate copy`), type: 'text', answer, trail: '', bug, lineNo: 5,
      alts: [`var ${y} := ${x}.duplicate()`, `var ${y}: ${isArr ? 'Array' : 'Dictionary'} = ${x}.duplicate()`, `var ${y} = ${x}.duplicate(true)`, `var ${y} := ${x}.duplicate(true)`],
      distractors: [bug, `var ${x} = ${y}.duplicate()`, `var ${y} = ${y}.duplicate()`, `var ${y} = ${x}.copy()`, `var ${y} == ${x}`],
      explanation: `Line 5 should be \`${answer}\`. ${isArr ? 'Arrays' : 'Dictionaries'} are reference types: \`${bug}\` gives the same ${isArr ? 'Array' : 'Dictionary'} a second name, so line 6 changes what ${tk(y)} sees too. \`duplicate()\` returns a new copy (shallow; \`duplicate(true)\` copies nested containers too).`,
      hints: [`After \`${bug}\`, how many ${isArr ? 'Arrays' : 'Dictionaries'} exist?`, 'Assignment never copies an Array or Dictionary in GDScript. Ask the container itself for a copy.',
        'The method is the same for Arrays and Dictionaries; GDScript calls it duplicating.'],
    };
  },
  sim(c) {
    const isArr = c.container === 'array';
    const re = new RegExp(`^var\\s+${c.y}\\s*(?::=|:\\s*(Array|Dictionary)\\s*=|=)\\s*${c.x}(\\.duplicate\\(\\s*(?:true|false)?\\s*\\))?$`);
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m) return false;
        if (m[1] && m[1] !== (isArr ? 'Array' : 'Dictionary')) return false;
        const H = heap(), env = {};
        env.x = H.alloc(isArr ? c.vals.slice() : { [c.key]: c.vals[0] });
        env.y = m[2] ? H.alloc(isArr ? H.get(env.x).slice() : { ...H.get(env.x) }) : env.x;
        if (isArr) H.get(env.x).push(c.v); else H.get(env.x)[c.key] = c.v;
        const Y = H.get(env.y);
        return isArr ? Y.length === c.vals.length : Y[c.key] === c.vals[0];
      },
    };
  },
};

// duplicate() is shallow: nested Arrays are still shared; duplicate(true) is deep.
F['gdscript-deep'] = {
  lang: 'gdscript', diffs: ['expert'],
  make(rng) {
    const [g, s, d] = names(rng, [['grid', 'rows', 'groups'], ['copy_a', 'twin', 'mirror'], ['copy_b', 'clone', 'snapshot']]);
    const inner = [randList(rng, 1, 3, 1, 9), randList(rng, 1, 3, 1, 9)];
    const ops = Array.from({ length: 3 }, () => ({ t: rng.pick(['g', 's', 'd']), k: rng.pick(['inner', 'inner', 'outer']), i: rng.int(0, 1), v: rng.int(1, 9) }));
    const asks = rng.shuffle([['g', 0], ['g', 1], ['s', 0], ['d', 1], ['g', -1], ['s', -1]]).slice(0, 2);
    return { g, s, d, inner, ops, asks };
  },
  view(c) {
    const { g, s, d, inner, ops, asks } = c;
    const nm = { g, s, d };
    const lines = [`var ${g} := [${inner.map(pyList).join(', ')}]`, `var ${s} := ${g}.duplicate()`, `var ${d} := ${g}.duplicate(true)`,
      ...ops.map(o => (o.k === 'inner' ? `${nm[o.t]}[${o.i}].append(${o.v})` : `${nm[o.t]}.append([${o.v}])`))];
    const askText = ([t, i]) => (i < 0 ? `${nm[t]}.size()` : `${nm[t]}[${i}].size()`);
    lines.push(...asks.map(a => `print(${askText(a)})`));
    // closed form: g and s share the two original inner arrays; d has its own copies
    const sz = { g: [inner[0].length, inner[1].length], d: [inner[0].length, inner[1].length] };
    const outer = { g: 2, s: 2, d: 2 };
    for (const o of ops) {
      if (o.k === 'outer') outer[o.t]++;
      else if (o.t === 'd') sz.d[o.i]++; else sz.g[o.i]++;
    }
    const val = ([t, i]) => (i < 0 ? outer[t] : t === 'd' ? sz.d[i] : sz.g[i]);
    const parts = asks.map((a, j) => ({ id: j ? 'second' : 'first', label: j ? 'Second print' : 'First print', ask: `What does \`print(${askText(a)})\` show?`, answerType: 'number', answer: val(a), tolerance: 0,
      hint: a[1] < 0 ? `The outer Arrays are separate after \`duplicate()\`: count only the \`.append([…])\` lines on ${tk(nm[a[0]])} itself.` : `Which inner Arrays are shared? \`duplicate()\` copies the outer Array but keeps the same inner Arrays; \`duplicate(true)\` copies them too.` }));
    return {
      code: inMain.gdscript(lines), ask: 'What do the two prints show?', type: 'multi', parts,
      explanation: `It prints **${val(asks[0])}** then **${val(asks[1])}**. \`${g}.duplicate()\` is a **shallow** copy: ${tk(s)} is a new outer Array, but its elements are the **same** inner Arrays as in ${tk(g)}, so appending to \`${s}[i]\` or \`${g}[i]\` changes both. \`duplicate(true)\` is a **deep** copy: ${tk(d)} has its own inner Arrays. Appending a new element to an outer Array changes only that outer Array.`,
    };
  },
  sim(c) {
    const H = heap();
    const inners = c.inner.map(xs => H.alloc(xs.slice()));
    const env = { g: H.alloc(inners.slice()) };
    env.s = H.alloc(H.get(env.g).slice()); // shallow: same inner ids
    env.d = H.alloc(H.get(env.g).map(id => H.alloc(H.get(id).slice()))); // deep
    for (const o of c.ops) {
      const outer = H.get(env[o.t]);
      if (o.k === 'outer') outer.push(H.alloc([o.v])); else H.get(outer[o.i]).push(o.v);
    }
    const val = ([t, i]) => (i < 0 ? H.get(env[t]).length : H.get(H.get(env[t])[i]).length);
    return { first: val(c.asks[0]), second: val(c.asks[1]) };
  },
};

// =============================================================================================
// Rust
// =============================================================================================
// Shadowing: `let x = …` makes a new variable; an inner block's shadow ends at its `}`.
F['rust-shadow'] = {
  lang: 'rust', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const x = rng.pick(['x', 'n', 'level', 'size', 'score']);
    let ops;
    do { ops = Array.from({ length: rng.int(2, 3) }, () => ({ k: rng.pick(['mul', 'add', 'block']), v: rng.int(2, 5) })); }
    while (ops.filter(o => o.k === 'block').length !== (diff === 'hard' ? 1 : ops.some(o => o.k === 'block') ? 1 : 0) || ops[ops.length - 1].k === 'block' && diff === 'medium' && false);
    return { x, v0: rng.int(1, 9), ops };
  },
  view(c, diff) {
    const { x, v0, ops } = c;
    const body = [`let ${x} = ${v0};`];
    let val = v0, inner = null;
    for (const o of ops) {
      if (o.k === 'mul') { body.push(`let ${x} = ${x} * ${o.v};`); val *= o.v; } else if (o.k === 'add') { body.push(`let ${x} = ${x} + ${o.v};`); val += o.v; } else {
        body.push('{', `    let ${x} = ${x} + ${o.v};`, `    println!("{}", ${x});`, '}');
        inner = val + o.v;
      }
    }
    body.push(`println!("{}", ${x});`);
    const code = inMain.rust(body);
    const rule = `Each \`let ${x} = …\` makes a **new** variable that shadows the old one (it can use the old value on its right-hand side). A shadow made inside \`{ … }\` lasts only until that block's \`}\`; after it, the outer ${tk(x)} is visible again, unchanged.`;
    if (inner !== null && diff === 'hard') {
      return {
        code, ask: 'The program prints two numbers. What are they?', type: 'multi', explanation: `It prints **${inner}** then **${val}**. ${rule}`,
        parts: [
          { id: 'first', label: 'First number', ask: 'What is printed first (inside the block)?', answerType: 'number', answer: inner, tolerance: 0, hint: `Work down from \`let ${x} = ${v0};\`, updating ${tk(x)} at every \`let\` until the \`println!\` inside the block.` },
          { id: 'second', label: 'Second number', ask: 'What is printed last?', answerType: 'number', answer: val, tolerance: 0, hint: `The \`let\` inside \`{ … }\` stops existing at the \`}\`. Which ${tk(x)} is visible after the block?` },
        ],
      };
    }
    return {
      code, ask: inner !== null ? 'What is the **last** number this program prints?' : 'What does this program print?', type: 'number', answer: val,
      explanation: `It prints ${inner !== null ? `${inner} and then ` : ''}**${val}**. ${rule}`,
      hints: [`Write down the value of ${tk(x)} after every \`let\`. Each one uses the value just before it.`,
        inner !== null ? 'A `let` inside `{ … }` only shadows until the closing `}`. After it, the outer value is back.' : 'The variable is never changed in place (there is no `mut`): each `let` makes a new one.'],
    };
  },
  sim(c, diff) {
    const scopes = [{}];
    const look = () => { for (let i = scopes.length - 1; i >= 0; i--) if (c.x in scopes[i]) return scopes[i][c.x]; return undefined; };
    const out = [];
    scopes[0][c.x] = c.v0;
    for (const o of c.ops) {
      if (o.k === 'mul') scopes[scopes.length - 1][c.x] = look() * o.v;
      else if (o.k === 'add') scopes[scopes.length - 1][c.x] = look() + o.v;
      else { scopes.push({}); scopes[scopes.length - 1][c.x] = look() + o.v; out.push(look()); scopes.pop(); }
    }
    out.push(look());
    return out.length === 2 && diff === 'hard' ? { first: out[0], second: out[1] } : out[out.length - 1];
  },
};

// Move semantics: `let b = a;` and passing by value move a String / Vec; i64 is Copy.
const RS_TYPES = {
  String: { names: ['name', 'word', 'label', 'title'], init: rng => `String::from("${rng.pick(['hello', 'pixel', 'moon', 'river', 'rust'])}")`, param: 'String', use: a => `${a}.len()`, ret: 'usize', body: p => `${p}.len()` },
  Vec: { names: ['list', 'scores', 'items', 'data'], init: rng => `vec![${randList(rng, 2, 4, 1, 9).join(', ')}]`, param: 'Vec<i32>', use: a => `${a}.len()`, ret: 'usize', body: p => `${p}.len()` },
  i32: { names: ['count', 'score', 'level', 'total'], init: rng => String(rng.int(2, 99)), param: 'i32', use: a => a, ret: 'i32', body: p => `${p} * 2` },
};
F['rust-move'] = {
  lang: 'rust', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const type = rng.pick(['String', 'String', 'Vec', 'Vec', 'i32']);
    const T = RS_TYPES[type];
    const [a, other, f] = names(rng, [T.names, ['other', 'moved', 'copy', 'second'], ['take', 'consume', 'use_up', 'measure']]);
    const how = rng.pick(diff === 'medium' ? ['let', 'let', 'take', 'borrow', 'clone'] : ['let', 'take', 'take', 'borrow', 'clone', 'letBack']);
    return { type, a, other, f, how, init: T.init(rng), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { type, a, other, f, how, init } = c, T = RS_TYPES[type];
    const isCopy = type === 'i32';
    const fnLines = how === 'take' || how === 'borrow'
      ? [`fn ${f}(v: ${how === 'borrow' ? '&' : ''}${T.param}) -> ${T.ret} {`, `    ${how === 'borrow' && type === 'i32' ? '*v * 2' : T.body('v')}`, '}', ''] : [];
    const body = [`let ${a} = ${init};`];
    if (how === 'let') body.push(`let ${other} = ${a};`, `println!("{}", ${T.use(other)});`);
    if (how === 'letBack') body.push(`let ${other} = ${a};`, `let ${a} = ${other};`);
    if (how === 'clone') body.push(`let ${other} = ${a}.clone();`, `println!("{}", ${T.use(other)});`);
    if (how === 'take') body.push(`let n = ${f}(${a});`, 'println!("{}", n);');
    if (how === 'borrow') body.push(`let n = ${f}(&${a});`, 'println!("{}", n);');
    body.push(`println!("{}", ${T.use(a)});`);
    const code = [...fnLines, ...inMain.rust(body)];
    const off = fnLines.length + 1; // line of `fn main() {`
    const declLine = off + 1, transferLine = off + 2, useLine = off + body.length;
    const moves = !isCopy && (how === 'let' || how === 'take');
    const answer = moves ? LINE(useLine) : COMPILES;
    const choices = [LINE(declLine), LINE(transferLine), LINE(useLine), COMPILES];
    const why = moves
      ? `${type === 'String' ? '`String`' : '`Vec`'} owns heap data, so ${how === 'let' ? `\`let ${other} = ${a};\`` : `passing ${tk(a)} by value to \`${f}\``} **moves** ownership out of ${tk(a)}. Using ${tk(a)} afterwards is rejected: error E0382, "borrow of moved value: \`${a}\`". Fix: \`${a}.clone()\`, or pass \`&${a}\` to a function that takes a reference.`
      : isCopy ? `\`i32\` is a \`Copy\` type: assigning or passing it copies the value, so ${tk(a)} stays usable.`
        : how === 'clone' ? `\`.clone()\` makes a separate copy, so ${tk(a)} keeps ownership of its own value.`
          : how === 'borrow' ? `\`&${a}\` only **borrows** ${tk(a)}; ownership stays with ${tk(a)}.`
            : `\`let ${other} = ${a};\` moves the value into ${tk(other)}, but \`let ${a} = ${other};\` moves it back into a **new** variable called ${tk(a)} (shadowing), so the last line uses a valid value.`;
    return {
      code, ask: 'Does this compile? If not, which line does the compiler reject?', type: 'choice', answer, choices,
      explanation: `${answer}. ${why}`,
      hints: [`What type is ${tk(a)}? \`String\` and \`Vec\` own their data and are **moved** by assignment and by-value calls; integers are \`Copy\`.`,
        `Follow ${tk(a)}: after each line, does ${tk(a)} still own a value? Using a variable after its value has moved out is a compile error.`],
    };
  },
  // A small Rust ownership checker over the rendered lines (moves, Copy types, borrows, clones).
  sim(c, diff, v) {
    const lines = v.code, fns = {}, vars = {};
    for (const l of lines) { const m = l.match(/^fn (\w+)\(\w+: (&?)[\w<>]+\)/); if (m) fns[m[1]] = { byRef: m[2] === '&' }; }
    const start = lines.indexOf('fn main() {');
    const isCopyInit = e => /^\d+$/.test(e);
    for (let i = start + 1; i < lines.length - 1; i++) {
      const l = lines[i].trim();
      let m;
      const useOf = name => { if (vars[name] && vars[name].moved) return true; return false; };
      if ((m = l.match(/^let (\w+) = (.+);$/))) {
        const e = m[2];
        let mm;
        if ((mm = e.match(/^(\w+)\.clone\(\)$/))) { if (useOf(mm[1])) return LINE(i + 1); vars[m[1]] = { copy: vars[mm[1]].copy, moved: false }; continue; }
        if ((mm = e.match(/^(\w+)\((&?)(\w+)\)$/))) { if (useOf(mm[3])) return LINE(i + 1); if (!mm[2] && !fns[mm[1]].byRef && !vars[mm[3]].copy) vars[mm[3]].moved = true; if (mm[2] && !fns[mm[1]].byRef) return null; vars[m[1]] = { copy: true, moved: false }; continue; }
        if ((mm = e.match(/^([A-Za-z_]\w*)$/))) { if (useOf(mm[1])) return LINE(i + 1); const src = vars[mm[1]]; vars[m[1]] = { copy: src.copy, moved: false }; if (!src.copy && mm[1] !== m[1]) src.moved = true; continue; }
        vars[m[1]] = { copy: isCopyInit(e), moved: false };
        continue;
      }
      if ((m = l.match(/^println!\("\{\}", (\w+)(?:\.len\(\))?\);$/))) { if (useOf(m[1])) return LINE(i + 1); continue; }
      return null;
    }
    return COMPILES;
  },
};

// .clone() makes an independent copy: changing the clone leaves the original alone.
F['rust-clone'] = {
  lang: 'rust', diffs: ['medium'],
  make(rng) {
    const type = rng.pick(['Vec', 'Vec', 'String']);
    const [a, b] = names(rng, [type === 'Vec' ? ['scores', 'items', 'list'] : ['name', 'word', 'greeting'], ['copy', 'other', 'extra', 'more']]);
    const how = rng.pick(['clone', 'clone', 'move']);
    const ask = how === 'move' ? 'b' : rng.pick(['a', 'a', 'b']);
    const vals = randList(rng, 2, 4, 1, 9), word = rng.pick(['hi', 'moon', 'cat', 'rust']), adds = randList(rng, 1, 2, 1, 9), suffix = rng.pick(['!', 'ss', 'xyz']);
    return { type, a, b, how, ask, vals, word, adds, suffix };
  },
  view(c) {
    const { type, a, b, how, ask, vals, word, adds, suffix } = c, isVec = type === 'Vec';
    const body = [`let ${a} = ${isVec ? `vec![${vals.join(', ')}]` : `String::from("${word}")`};`, `let mut ${b} = ${a}${how === 'clone' ? '.clone()' : ''};`,
      ...(isVec ? adds.map(x => `${b}.push(${x});`) : [`${b}.push_str("${suffix}");`]), `println!("{}", ${ask === 'a' ? a : b}.len());`];
    const base = isVec ? vals.length : word.length, grow = isVec ? adds.length : suffix.length;
    const answer = ask === 'a' ? base : base + grow;
    return {
      code: inMain.rust(body), ask: 'What does this program print?', type: 'number', answer,
      explanation: `It prints **${answer}**. ` + (how === 'clone'
        ? `\`${a}.clone()\` makes a deep, independent copy, so ${tk(b)} can grow while ${tk(a)} keeps its ${base} ${isVec ? 'items' : 'bytes'}.`
        : `\`let mut ${b} = ${a};\` **moves** the ${isVec ? 'vector' : 'string'} into ${tk(b)} (no copy is made), and ${tk(b)} is declared \`mut\`, so it can grow. ${tk(a)} can't be used any more.`) +
        (isVec ? '' : ' `len()` on a `String` counts bytes, which is the number of characters for plain ASCII text.'),
      hints: [`Does line 3 copy the ${isVec ? 'vector' : 'string'} or move it?`, `Count the ${isVec ? 'items' : 'characters'} in ${tk(ask === 'a' ? a : b)} after all the \`${isVec ? 'push' : 'push_str'}\` calls.`],
    };
  },
  sim(c) {
    const H = heap(), isVec = c.type === 'Vec';
    const env = { a: H.alloc(isVec ? c.vals.slice() : c.word.split('')) };
    env.b = c.how === 'clone' ? H.alloc(H.get(env.a).slice()) : env.a;
    if (c.how === 'move') env.a = null;
    if (isVec) for (const x of c.adds) H.get(env.b).push(x); else H.get(env.b).push(...c.suffix.split(''));
    return H.get(env[c.ask]).length;
  },
};

// Borrowing rules: many & or one &mut; mut needed to change; NLL (a borrow ends at its last use).
const RS_RULES = {
  shared: 'Can\'t borrow as mutable while an immutable borrow is still in use (E0502)',
  twoMut: 'Only one mutable borrow (`&mut`) at a time (E0499)',
  immutVec: 'Can\'t borrow as mutable: the variable isn\'t declared `mut` (E0596)',
  assignTwice: 'Can\'t assign twice to an immutable variable (E0384)',
};
const RS_RULE_DECOYS = ['Use of a moved value (E0382)', 'Shadowing a variable with `let` is not allowed'];
F['rust-borrow'] = {
  lang: 'rust', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const pool = ['shared', 'twoMut', 'immutVec', 'assignTwice'];
    const scen = rng.pick(pool);
    const isBad = diff === 'expert' ? true : rng.next() < 0.75;
    const extra = rng.shuffle(pool.filter(g => g !== scen)).slice(0, diff === 'expert' ? 2 : 1);
    const order = rng.shuffle([scen, ...extra]);
    const n = {
      v: rng.pick(['v', 'nums', 'list']), first: rng.pick(['first', 'head', 'top']), vals: randList(rng, 2, 4, 1, 9), k: rng.int(1, 9),
      s: rng.pick(['s', 'text', 'msg']), a: rng.pick(['a', 'r1', 'one']), b: rng.pick(['b', 'r2', 'two']), w: rng.pick(['hi', 'yo', 'ok']),
      bag: rng.pick(['bag', 'stack', 'queue']), t: rng.pick(['total', 'count', 'sum']), t0: rng.int(1, 9),
    };
    return { scen, isBad, order, n, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { scen, isBad, order, n } = c;
    const lines = [], suspects = [];
    for (const g of order) {
      const b = g === scen && isBad;
      const G = {
        shared: b ? [[`let mut ${n.v} = vec![${n.vals.join(', ')}];`, `let ${n.first} = &${n.v}[0];`, `${n.v}.push(${n.k});`, `println!("{}", ${n.first});`], 2]
          : [[`let mut ${n.v} = vec![${n.vals.join(', ')}];`, `let ${n.first} = &${n.v}[0];`, `println!("{}", ${n.first});`, `${n.v}.push(${n.k});`], 3],
        twoMut: b ? [[`let mut ${n.s} = String::from("${n.w}");`, `let ${n.a} = &mut ${n.s};`, `let ${n.b} = &mut ${n.s};`, `${n.a}.push_str("!");`, `${n.b}.push_str("?");`, `println!("{}", ${n.s});`], 2]
          : [[`let mut ${n.s} = String::from("${n.w}");`, `let ${n.a} = &mut ${n.s};`, `${n.a}.push_str("!");`, `let ${n.b} = &mut ${n.s};`, `${n.b}.push_str("?");`, `println!("{}", ${n.s});`], 3],
        immutVec: [[`let ${b ? '' : 'mut '}${n.bag} = vec![${n.vals.join(', ')}];`, `${n.bag}.push(${n.k});`, `println!("{}", ${n.bag}.len());`], 1],
        assignTwice: [[`let ${n.t} = ${n.t0};`, b ? `${n.t} += ${n.k};` : `let ${n.t} = ${n.t} + ${n.k};`, `println!("{}", ${n.t});`], 1],
      }[g];
      suspects.push(lines.length + G[1] + 2); // 1-based, after `fn main() {`
      lines.push(...G[0]);
    }
    const code = inMain.rust(lines);
    const badLine = isBad ? suspects[order.indexOf(scen)] : 0;
    const answer = isBad ? LINE(badLine) : COMPILES;
    const why = {
      shared: `\`${n.first}\` is an immutable borrow of ${tk(n.v)}, and it is still used later (\`println!\`). \`${n.v}.push(…)\` needs a mutable borrow, which can't exist at the same time: pushing could reallocate the vector and leave \`${n.first}\` dangling.`,
      twoMut: `\`${n.a}\` is a mutable borrow of ${tk(n.s)} that is used again later, so a second \`&mut ${n.s}\` can't be taken while it is alive.`,
      immutVec: `\`${n.bag}\` is declared without \`mut\`, and \`push\` needs to change it.`,
      assignTwice: `\`${n.t}\` is declared without \`mut\`, so \`+=\` can't change it. (\`let ${n.t} = ${n.t} + ${n.k};\` would be fine: that makes a new, shadowing variable.)`,
    };
    const OK = { shared: 'pushing after the last use of a `&` borrow is fine, because a borrow ends at its **last use** (non-lexical lifetimes)', twoMut: 'a second `&mut` is fine once the first one is no longer used', immutVec: 'a vector declared `let mut` can be pushed to', assignTwice: '`let x = x + 1;` makes a new, shadowing variable instead of assigning' };
    const okNote = `The look-alikes compile: ${order.filter(g => !(g === scen && isBad)).map(g => OK[g]).join('; ')}.`;
    const expl = isBad ? `Line ${badLine} is rejected: **${RS_RULES[scen]}**. ${why[scen]}\n\n${okNote}` : `${COMPILES}. ${okNote}`;
    let others = suspects.filter(x => x !== badLine);
    if (diff === 'expert') {
      const lc = lineChoices(badLine, [...others, ...lines.map((_, j) => j + 2).filter(x => x !== badLine && !others.includes(x))].slice(0, 3));
      return {
        code, ask: 'This program does not compile. Which line does the compiler reject, and which rule does it break?', type: 'multi', explanation: expl,
        parts: [
          { id: 'line', label: 'Line', ask: 'Which line is rejected?', answerType: 'choice', answer, choices: lc, hint: 'For every borrow (`&` or `&mut`), find its last use. While it is alive, is there a conflicting borrow or change? Also check which variables are `mut`.' },
          { id: 'rule', label: 'Rule', ask: 'Which rule does it break?', answerType: 'choice', answer: RS_RULES[scen], choices: arrange(RS_RULES[scen], [...Object.values(RS_RULES), ...RS_RULE_DECOYS], c.ord), hint: 'Is the problem a borrow that is still alive, two `&mut` at once, or a missing `mut`?' },
        ],
      };
    }
    const three = [...new Set([...(isBad ? [badLine] : []), ...suspects.filter(x => x !== badLine), ...lines.map((_, j) => j + 2)])].slice(0, 3);
    const lc = [...three.sort((x, y) => x - y).map(LINE), COMPILES];
    return {
      code, ask: 'Does this compile? If not, which line does the compiler reject?', type: 'choice', answer, choices: lc, explanation: expl,
      hints: ['Mark every borrow: `&x` (shared) or `&mut x` (mutable), and find the **last line that uses it**. A borrow is alive only until then.',
        'While a shared borrow is alive, the owner can\'t be changed; while a `&mut` is alive, nothing else may borrow it. Changing a variable also needs `mut` on its `let`.'],
    };
  },
  sim: (c, diff, v) => compileAnswer(F['rust-borrow'].check(c, diff, v), diff, RS_RULES),
  // A small borrow checker over the rendered lines, with non-lexical lifetimes (a borrow is alive
  // until the last line that names its holder).
  check(c, diff, v) {
    const lines = v.code.map(l => l.trim());
    const vars = {}, borrows = [];
    const usedAfter = (name, i) => lines.slice(i + 1).some(l => new RegExp(`\\b${name}\\b`).test(l));
    const live = (of, i) => borrows.filter(b => b.of === of && usedAfter(b.holder, i));
    const fail = (i, rule) => ({ line: i + 1, rule });
    for (let i = 1; i < lines.length - 1; i++) {
      const l = lines[i];
      let m;
      if ((m = l.match(/^let (mut )?(\w+) = &(mut )?(\w+)(?:\[\d+\])?;$/))) {
        const of = m[4], lv = live(of, i);
        if (m[3]) {
          if (!vars[of].mut) return fail(i, 'immutVec');
          if (lv.some(b => b.mut)) return fail(i, 'twoMut');
          if (lv.length) return fail(i, 'shared');
        } else if (lv.some(b => b.mut)) return fail(i, 'shared');
        borrows.push({ holder: m[2], of, mut: !!m[3] });
        vars[m[2]] = { mut: !!m[1], ref: true };
      } else if ((m = l.match(/^let (mut )?(\w+) = (.+);$/))) {
        vars[m[2]] = { mut: !!m[1] }; // a new variable (shadowing replaces the old one)
      } else if ((m = l.match(/^(\w+)\.(push|push_str)\(.*\);$/))) {
        const x = vars[m[1]];
        if (x.ref) continue; // through a &mut holder
        if (!x.mut) return fail(i, 'immutVec');
        const lv = live(m[1], i);
        if (lv.some(b => b.mut)) return fail(i, 'twoMut');
        if (lv.length) return fail(i, 'shared');
      } else if ((m = l.match(/^(\w+) \+= \d+;$/))) {
        if (!vars[m[1]].mut) return fail(i, 'assignTwice');
      } else if ((m = l.match(/^println!\("\{\}", (\w+)(?:\.len\(\))?\);$/))) {
        if (vars[m[1]] && !vars[m[1]].ref && live(m[1], i).some(b => b.mut)) return fail(i, 'shared');
      } else return { line: -1 };
    }
    return { line: 0 };
  },
};

// Integer overflow: a panic in debug builds; wrapping_/saturating_/checked_ say what to do.
F['rust-overflow'] = {
  lang: 'rust', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const op = rng.pick(['add', 'add', 'sub']);
    const method = diff === 'hard' ? 'plain' : rng.pick(['plain', 'wrapping', 'saturating', 'checked', 'checked']);
    const over = rng.next() < 0.75;
    let a, b;
    if (op === 'add') { a = rng.int(100, 250); b = over ? rng.int(256 - a, 255 - Math.floor(a / 2)) : rng.int(1, 255 - a); }
    else { a = rng.int(5, 120); b = over ? rng.int(a + 1, a + 100) : rng.int(1, a); }
    return { f: rng.pick(['combine', 'mix', 'merge', 'apply']), op, method, a, b, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { f, op, method, a, b } = c;
    const verb = op === 'add' ? 'add' : 'subtract';
    const expr = method === 'plain' ? `x ${op === 'add' ? '+' : '-'} y` : `x.${method}_${op}(y)`;
    const ret = method === 'checked' ? 'Option<u8>' : 'u8';
    const fmt = method === 'checked' ? '{:?}' : '{}';
    const code = [`fn ${f}(x: u8, y: u8) -> ${ret} {`, `    ${expr}`, '}', '', ...inMain.rust([`let result = ${f}(${a}, ${b});`, `println!("${fmt}", result);`])];
    const math = op === 'add' ? a + b : a - b;
    const fits = math >= 0 && math <= 255;
    const wrapped = ((math % 256) + 256) % 256, sat = math > 255 ? 255 : math < 0 ? 0 : math;
    const PANIC = `It panics: "attempt to ${verb} with overflow"`, NOCOMP = 'It does not compile';
    const answer = method === 'plain' ? (fits ? tk(String(math)) : PANIC) : method === 'wrapping' ? tk(String(wrapped)) : method === 'saturating' ? tk(String(sat)) : tk(fits ? `Some(${math})` : 'None');
    const choices = arrange(answer, [PANIC, tk(String(wrapped)), tk(String(math)), tk(String(sat)), NOCOMP, tk('None')], c.ord);
    if (!choices) return null;
    const how = {
      plain: fits ? `${a} ${op === 'add' ? '+' : '-'} ${b} = ${math} fits in a \`u8\` (0 to 255), so nothing overflows.` : `${a} ${op === 'add' ? '+' : '-'} ${b} = ${math} does not fit in a \`u8\` (0 to 255). In a **debug** build Rust checks integer overflow and panics. (A release build wraps around instead, giving ${wrapped}, unless overflow checks are turned on.)`,
      wrapping: `\`wrapping_${op}\` always wraps around modulo 256: ${math} → ${wrapped}, in debug and release alike.`,
      saturating: `\`saturating_${op}\` clamps the result to the type's range: ${math} → ${sat}.`,
      checked: `\`checked_${op}\` returns \`Some(result)\` when it fits and \`None\` when it would overflow; \`{:?}\` prints the \`Option\`. ${a} ${op === 'add' ? '+' : '-'} ${b} = ${math}${fits ? ' fits' : ' does not fit in a `u8`'}.`,
    }[method];
    return {
      code, ask: 'This is built and run in **debug** mode (`cargo run`). What happens?', type: 'choice', answer, choices,
      explanation: `${answer}. ${how}`,
      hints: ['A `u8` is an unsigned 8-bit integer: no negatives, and 8 bits for the largest value. Work out the true result first and see whether it fits.',
        method === 'plain' ? 'Plain `+` and `-` on integers are checked for overflow in debug builds. What does Rust do when the check fails?' : `What does \`${method}_${op}\` promise to do when the result does not fit?`],
    };
  },
  sim(c) {
    const r = BigInt(c.a) + (c.op === 'add' ? 1n : -1n) * BigInt(c.b);
    const fits = r >= 0n && r <= 255n;
    if (c.method === 'plain') return fits ? tk(String(r)) : `It panics: "attempt to ${c.op === 'add' ? 'add' : 'subtract'} with overflow"`;
    if (c.method === 'wrapping') return tk(String(wrapBits(r, 8, false)));
    if (c.method === 'saturating') return tk(String(r > 255n ? 255n : r < 0n ? 0n : r));
    return tk(fits ? `Some(${r})` : 'None');
  },
};

F['rust-clone-line'] = {
  lang: 'rust', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const type = rng.pick(['Vec', 'String']);
    const [x, y] = names(rng, [type === 'Vec' ? ['scores', 'items', 'list'] : ['name', 'word', 'title'], ['backup', 'saved', 'copy', 'spare']]);
    return { type, x, y, vals: randList(rng, 2, 4, 1, 9), word: rng.pick(['hello', 'moon', 'pixel']), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { type, x, y, vals, word } = c, isVec = type === 'Vec';
    const bug = `let ${y} = ${x}`, answer = `let ${y} = ${x}.clone()`;
    const code = inMain.rust([`let ${x} = ${isVec ? `vec![${vals.join(', ')}]` : `String::from("${word}")`};`, `${bug};`, `println!("{} {}", ${x}.len(), ${y}.len());`]);
    const lead = diff === 'expert' ? `This program should print the length of ${tk(x)} and of its copy ${tk(y)}, but it does not compile.`
      : `Line 4 fails to compile: error E0382, "borrow of moved value: \`${x}\`".`;
    return {
      code, lead, ask: rewriteAsk(diff, 3, `${tk(y)} is its own copy and both can be used`), type: 'text', answer, trail: ';', bug, lineNo: 3,
      alts: isVec ? [`let ${y} = ${x}.to_vec()`, `let ${y}: Vec<i32> = ${x}.clone()`] : [`let ${y} = ${x}.to_string()`, `let ${y} = ${x}.to_owned()`, `let ${y}: String = ${x}.clone()`],
      distractors: [bug, `let ${y} = &${x}`, `let mut ${y} = ${x}`, `let ${x} = ${y}.clone()`, `let ${y} = ${x}.len()`],
      explanation: `Line 3 should be \`${answer};\`. A ${isVec ? '`Vec`' : '`String`'} owns its heap data, so \`${bug};\` **moves** that ownership into ${tk(y)}, and ${tk(x)} can't be used afterwards. \`.clone()\` makes a deep copy, so each variable owns its own data. (\`&${x}\` would compile too, but it borrows instead of copying.)`,
      hints: ['Which variable owns the data after line 3? Rust moves a `String` or `Vec` on assignment.', 'To keep both, make a real copy of the data instead of moving it.',
        'The method that copies a value is named after cloning.'],
    };
  },
  sim(c) {
    const isVec = c.type === 'Vec';
    const re = new RegExp(`^let\\s+(mut\\s+)?${c.y}(?:\\s*:\\s*([\\w<>]+))?\\s*=\\s*(&)?${c.x}(?:\\.(\\w+)\\(\\))?$`);
    const own = isVec ? ['clone', 'to_vec'] : ['clone', 'to_string', 'to_owned'];
    return {
      ok(line) {
        const m = stripMark(line).replace(/\s+/g, ' ').match(re);
        if (!m) return false;
        if (m[3]) return false; // a borrow, not a copy
        if (m[2] && m[2] !== (isVec ? 'Vec<i32>' : 'String')) return false;
        if (!m[4]) return false; // a move: line 4 then uses a moved value
        return own.includes(m[4]);
      },
    };
  },
};

F['rust-mut-line'] = {
  lang: 'rust', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const kind = rng.pick(['vec', 'int', 'string']);
    const name = rng.pick({ vec: ['scores', 'items', 'queue'], int: ['count', 'total', 'steps'], string: ['name', 'log', 'text'] }[kind]);
    return { kind, name, a: rng.int(1, 9), b: rng.int(1, 9), w: rng.pick(['ab', 'go', 'hi']), w2: rng.pick(['cd', 'ne', 'ya']), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { kind, name, a, b, w, w2 } = c;
    const init = { vec: 'Vec::new()', int: '0', string: `String::from("${w}")` }[kind];
    const bug = `let ${name} = ${init}`, answer = `let mut ${name} = ${init}`;
    const changes = { vec: [`${name}.push(${a});`, `${name}.push(${b});`], int: [`${name} += ${a};`, `${name} += ${b};`], string: [`${name}.push_str("${w2}");`] }[kind];
    const show = kind === 'int' ? name : `${name}.len()`;
    const code = inMain.rust([`${bug};`, ...changes, `println!("{}", ${show});`]);
    const err = kind === 'int' ? `error E0384, "cannot assign twice to immutable variable \`${name}\`"` : `error E0596, "cannot borrow \`${name}\` as mutable, as it is not declared as mutable"`;
    const lead = diff === 'expert' ? 'This program does not compile.' : `Line 3 fails to compile: ${err}.`;
    const alts = { vec: [`let mut ${name}: Vec<i32> = Vec::new()`, `let mut ${name}: Vec<i64> = Vec::new()`, `let mut ${name} = vec![]`], int: [`let mut ${name}: i32 = 0`, `let mut ${name}: i64 = 0`, `let mut ${name}: u32 = 0`], string: [`let mut ${name}: String = String::from("${w}")`, `let mut ${name} = "${w}".to_string()`] }[kind];
    return {
      code, lead, ask: rewriteAsk(diff, 2, 'the program compiles'), type: 'text', answer, trail: ';', bug, lineNo: 2, alts,
      distractors: [bug, `let ${name} = &mut ${init}`, `let mut ${name} = ${kind === 'int' ? '1' : init}`, `mut ${name} = ${init}`, `let ${name}: mut = ${init}`],
      explanation: `Line 2 should be \`${answer};\`. Rust variables are **immutable by default**: ${kind === 'int' ? '`+=` assigns a new value' : `\`${kind === 'vec' ? 'push' : 'push_str'}\` needs a mutable borrow`}, which is only allowed when the variable is declared with \`let mut\`.`,
      hints: ['Read the error: which variable is the compiler unhappy about, and what is the program trying to do to it?', 'In Rust a variable can only be changed if its `let` says so.', 'Add one keyword to the declaration.'],
    };
  },
  sim(c) {
    const init = { vec: ['Vec::new()', 'vec![]'], int: ['0'], string: [`String::from("${c.w}")`, `"${c.w}".to_string()`, `String::from("${c.w}")`] }[c.kind];
    const types = { vec: ['Vec<i32>', 'Vec<i64>'], int: ['i32', 'i64', 'u32'], string: ['String'] }[c.kind];
    const re = new RegExp(`^let\\s+(mut\\s+)?${c.name}(?:\\s*:\\s*([\\w<>]+))?\\s*=\\s*(.+)$`);
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m || !m[1]) return false; // without mut the later change does not compile
        if (m[2] && !types.includes(m[2])) return false;
        if (!init.includes(m[3].replace(/\s+/g, ''))) return init.includes(m[3].trim());
        // the program then runs: the final value printed
        return true;
      },
    };
  },
};

// =============================================================================================
// JavaScript, TypeScript, Java and Go (ticket 027 phase 2)
// =============================================================================================
// Each prompt states its assumptions (NOTE). The sims of the JavaScript and TypeScript families run
// the drawn values through the host engine's own operators (`==`, `+`, `??`, …: the language itself,
// no eval), while view() works the answer out from a closed form or a hand-written rule.
inMain.java = body => ['void main() {', ...indentAll(body), '}'];
inMain.go = body => ['func main() {', ...indentAll(body), '}'];
const NOTE = {
  javascript: 'Assume the code runs as an ES module (so in strict mode) in Node.js 20 or a modern browser.',
  typescript: 'Assume `tsc` with `"strict": true`, and that the compiled JavaScript runs in Node.js 20.',
  java: 'Assume Java 25: a compact source file with `void main()` and no class around it. `int` is 32 bits.',
  go: 'Assume Go 1.22 or later. `package main` and the imports are not shown.',
};
const askPrint = L => `What does this program print? ${NOTE[L]}`;
const REF_ERR = 'It throws a `ReferenceError`', TYPE_ERR = 'It throws a `TypeError`', NO_COMPILE = 'It does not compile';
const fmtAns = s => (/^It /.test(s) || /^Not guaranteed/.test(s) ? s : tk(s));

// ---- JavaScript ----
const JS_VALS = {
  zero: ['0', 0], one: ['1', 1], five: ['5', 5], empty: ['""', ''], szero: ['"0"', '0'], sfive: ['"5"', '5'], spaced: ['" 5 "', ' 5 '],
  sone: ['"1"', '1'], abc: ['"abc"', 'abc'], t: ['true', true], f: ['false', false], nul: ['null', null], und: ['undefined', undefined], nan: ['NaN', NaN],
};
const jsType = x => (x === null ? 'null' : typeof x);
// ToNumber for the strings used here: blank → 0, whole-number text → that number, anything else → NaN.
const jsToNum = s => { const t = s.trim(); return t === '' ? 0 : /^-?\d+$/.test(t) ? parseInt(t, 10) : NaN; };
// The spec's IsLooselyEqual steps, for these primitive values only.
function looseEq(x, y) {
  const tx = jsType(x), ty = jsType(y), nullish = t => t === 'null' || t === 'undefined';
  if (tx === ty) return strictEq(x, y);
  if (nullish(tx) || nullish(ty)) return nullish(tx) && nullish(ty);
  if (tx === 'boolean') return looseEq(x ? 1 : 0, y);
  if (ty === 'boolean') return looseEq(x, y ? 1 : 0);
  if (tx === 'string') return looseEq(jsToNum(x), y);
  if (ty === 'string') return looseEq(x, jsToNum(y));
  return false;
}
// IsStrictlyEqual: same type and same value; NaN equals nothing.
function strictEq(x, y) {
  if (jsType(x) !== jsType(y)) return false;
  if (typeof x === 'number') return !Number.isNaN(x) && !Number.isNaN(y) && Object.is(x + 0, y + 0);
  return Object.is(x, y);
}
const looseWhy = (as, bs, x, y) => {
  const tx = jsType(x), ty = jsType(y);
  if (tx === ty) return typeof x === 'number' && Number.isNaN(x) ? '`NaN` is not equal to anything, not even itself, with either operator.' : `Both sides are the same type (${tx}), so \`==\` converts nothing and agrees with \`===\`.`;
  if (['null', 'undefined'].includes(tx) || ['null', 'undefined'].includes(ty)) return '`null` and `undefined` are loosely equal to each other and to nothing else: `==` never converts them to a number.';
  if (tx === 'boolean' || ty === 'boolean') return `\`==\` turns a boolean into a number first (\`true\` → 1, \`false\` → 0), then compares again${tx === 'string' || ty === 'string' ? ', turning the string into a number too' : ''}.`;
  const s = tx === 'string' ? as : bs, v = tx === 'string' ? x : y;
  return `Between a string and a number, \`==\` turns the string into a number: ${tk(s)} becomes ${String(jsToNum(v))}.`;
};
const JS_EQ_PAIRS = [['sfive', 'five'], ['szero', 'zero'], ['empty', 'zero'], ['nul', 'und'], ['nul', 'zero'], ['und', 'zero'], ['spaced', 'five'],
  ['one', 't'], ['sone', 't'], ['nan', 'nan'], ['abc', 'nan'], ['szero', 'f'], ['empty', 'f'], ['five', 'five'], ['sfive', 'sfive']];
F['javascript-equality'] = {
  lang: 'javascript', diffs: ['medium'],
  make(rng) {
    const [a, b] = names(rng, [['a', 'left', 'input', 'first'], ['b', 'right', 'stored', 'second']]);
    const pair = rng.pick(JS_EQ_PAIRS);
    return { a, b, pair: rng.next() < 0.5 ? pair : [pair[1], pair[0]], ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { a, b } = c, [A, B] = c.pair.map(k => JS_VALS[k]);
    const loose = looseEq(A[1], B[1]), strict = strictEq(A[1], B[1]);
    const answer = `${loose} ${strict}`;
    const choices = arrange(answer, ['true true', 'true false', 'false false', 'false true'], c.ord);
    return {
      code: [`const ${a} = ${A[0]};`, `const ${b} = ${B[0]};`, `console.log(${a} == ${b}, ${a} === ${b});`],
      ask: askPrint('javascript'), type: 'choice', answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**. \`===\` (strict equality) is true only when both sides have the same type and the same value. ${looseWhy(A[0], B[0], A[1], B[1])} So \`==\` gives **${loose}**.\n\nUse \`===\` and \`!==\` unless you really want the conversions.`,
      hints: ['`===` never converts: different types are never strictly equal.', '`==` converts first: a string or a boolean becomes a number, but `null` and `undefined` only equal each other. `NaN` equals nothing.'],
    };
  },
  sim(c) {
    const [x, y] = c.pair.map(k => JS_VALS[k][1]);
    return tk(`${x == y} ${x === y}`); // eslint-disable-line eqeqeq
  },
};

F['javascript-loose-count'] = {
  lang: 'javascript', diffs: ['hard'],
  make(rng) {
    const target = rng.pick(['zero', 'empty', 'nul', 'f', 'szero', 'one']);
    const pool = Object.keys(JS_VALS).filter(k => k !== target && k !== 'spaced');
    const items = rng.shuffle(pool).slice(0, rng.int(5, 6));
    const [xs, v, hits] = names(rng, [['values', 'inputs', 'cells', 'entries'], ['v', 'item', 'x'], ['hits', 'count', 'matches']]);
    return { target, items, op: rng.pick(['==', '==', '===']), xs, v, hits };
  },
  view(c) {
    const { target, items, op, xs, v, hits } = c, T = JS_VALS[target];
    const count = f => items.filter(k => f(JS_VALS[k][1], T[1])).length;
    const nl = count(looseEq), ns = count(strictEq);
    if (nl === ns) return null;
    const answer = op === '==' ? nl : ns;
    const matched = items.filter(k => (op === '==' ? looseEq : strictEq)(JS_VALS[k][1], T[1])).map(k => tk(JS_VALS[k][0]));
    return {
      code: [`const ${xs} = [${items.map(k => JS_VALS[k][0]).join(', ')}];`, `let ${hits} = 0;`, `for (const ${v} of ${xs}) {`, `    if (${v} ${op} ${T[0]}) {`, `        ${hits}++;`, '    }', '}', `console.log(${hits});`],
      ask: askPrint('javascript'), type: 'number', answer,
      explanation: `It prints **${answer}**: ${matched.length ? matched.join(', ') : 'nothing'} ${matched.length === 1 ? 'matches' : 'match'} \`${v} ${op} ${T[0]}\`. ` +
        (op === '==' ? `\`==\` converts before comparing: strings and booleans become numbers (\`""\` → 0, \`"0"\` → 0, \`false\` → 0, \`true\` → 1), while \`null\` and \`undefined\` equal only each other and \`NaN\` equals nothing. With \`===\` the count would be ${ns}.`
          : `\`===\` converts nothing, so only a value of the same type and value counts. With \`==\` the count would be ${nl}.`),
      hints: [`Go through the list one value at a time and decide whether \`${v} ${op} ${T[0]}\` is true.`,
        op === '==' ? '`==` turns a string or boolean into a number before comparing it with a number; `null` and `undefined` are equal only to each other; `NaN` equals nothing.' : '`===` is only true for the same type and the same value.'],
    };
  },
  sim(c) {
    const t = JS_VALS[c.target][1];
    // eslint-disable-next-line eqeqeq
    return c.items.filter(k => (c.op === '==' ? JS_VALS[k][1] == t : JS_VALS[k][1] === t)).length;
  },
};

// var hoisting, let/const temporal dead zone, block scope, function declarations.
const JS_HOIST = { medium: ['varBefore', 'letBefore', 'varBlock', 'letBlock'], hard: ['letBefore', 'varBlock', 'letBlock', 'fnDecl', 'fnArrow', 'varFn', 'shadowTdz'] };
function hoistProg(c) {
  const { variant: w, x, n, f, V, W, k } = c;
  const log = { k: 'log', name: x }, call = { k: 'call', name: f, arg: V };
  return {
    varBefore: [log, { k: 'decl', kind: 'var', name: x, v: V }],
    letBefore: [log, { k: 'decl', kind: 'let', name: x, v: V }],
    varBlock: [{ k: 'decl', kind: 'const', name: n, v: W }, { k: 'if', name: n, body: [{ k: 'decl', kind: 'var', name: x, v: V }] }, log],
    letBlock: [{ k: 'decl', kind: 'const', name: n, v: W }, { k: 'if', name: n, body: [{ k: 'decl', kind: 'let', name: x, v: V }] }, log],
    fnDecl: [call, { k: 'fnDecl', name: f, mult: k }],
    fnArrow: [call, { k: 'decl', kind: 'const', name: f, fn: k }],
    varFn: [call, { k: 'decl', kind: 'var', name: f, fn: k }],
    shadowTdz: [{ k: 'decl', kind: 'let', name: x, v: W }, { k: 'block', body: [log, { k: 'decl', kind: 'let', name: x, v: V }] }],
  }[w];
}
function hoistLines(stmts) {
  const out = [];
  const emit = (s, pad) => {
    if (s.k === 'log') out.push(`${pad}console.log(${s.name});`);
    else if (s.k === 'call') out.push(`${pad}console.log(${s.name}(${s.arg}));`);
    else if (s.k === 'fnDecl') out.push(`${pad}function ${s.name}(n) {`, `${pad}    return n * ${s.mult};`, `${pad}}`);
    else if (s.k === 'decl' && s.fn !== undefined) {
      if (s.kind === 'var') out.push(`${pad}var ${s.name} = function (n) {`, `${pad}    return n * ${s.fn};`, `${pad}};`);
      else out.push(`${pad}const ${s.name} = n => n * ${s.fn};`);
    } else if (s.k === 'decl') out.push(`${pad}${s.kind} ${s.name} = ${s.v};`);
    else if (s.k === 'if' || s.k === 'block') {
      out.push(s.k === 'if' ? `${pad}if (${s.name} > 0) {` : `${pad}{`);
      s.body.forEach(b => emit(b, pad + '    '));
      out.push(`${pad}}`);
    }
  };
  stmts.forEach(s => emit(s, ''));
  return out;
}
// A small scope model: var (and function declarations) hoisted to the top scope, let/const in a
// temporal dead zone from the start of their block until their declaration runs.
function hoistRun(stmts) {
  const top = { vars: new Map(), up: null };
  const hoistVars = body => body.forEach(s => {
    if (s.k === 'decl' && s.kind === 'var' && !top.vars.has(s.name)) top.vars.set(s.name, { init: true, v: undefined });
    if (s.body) hoistVars(s.body);
  });
  const enter = (sc, body) => body.forEach(s => {
    if (s.k === 'decl' && s.kind !== 'var') sc.vars.set(s.name, { init: false });
    if (s.k === 'fnDecl') sc.vars.set(s.name, { init: true, v: { fn: s.mult } });
  });
  const find = (sc, n) => { for (let s = sc; s; s = s.up) if (s.vars.has(n)) return s.vars.get(n); return null; };
  const read = (sc, n) => { const b = find(sc, n); if (!b || !b.init) throw new Error('ReferenceError'); return b.v; };
  const out = [];
  const exec = (sc, body) => body.forEach(s => {
    if (s.k === 'log') { const v = read(sc, s.name); out.push(v === undefined ? 'undefined' : String(v)); }
    else if (s.k === 'call') { const v = read(sc, s.name); if (!v || v.fn === undefined) throw new Error('TypeError'); out.push(String(s.arg * v.fn)); }
    else if (s.k === 'decl') { const b = s.kind === 'var' ? top.vars.get(s.name) : sc.vars.get(s.name); b.init = true; b.v = s.fn !== undefined ? { fn: s.fn } : s.v; }
    else if (s.k === 'if' || s.k === 'block') {
      if (s.k === 'if' && !(read(sc, s.name) > 0)) return;
      const inner = { vars: new Map(), up: sc };
      enter(inner, s.body); exec(inner, s.body);
    }
  });
  hoistVars(stmts); enter(top, stmts);
  try { exec(top, stmts); } catch (e) { return e.message === 'ReferenceError' ? REF_ERR : e.message === 'TypeError' ? TYPE_ERR : null; }
  return out.length === 1 ? tk(out[0]) : null;
}
F['javascript-hoist'] = {
  lang: 'javascript', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const [x, n, f] = names(rng, [['level', 'total', 'score', 'size'], ['count', 'limit', 'items'], ['double', 'scale', 'boost', 'grow']]);
    return { variant: rng.pick(JS_HOIST[diff]), x, n, f, V: rng.int(2, 9), W: rng.int(10, 20), k: rng.int(2, 5), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { variant: w, x, f, V, W, k } = c;
    const answer = { varBefore: 'undefined', letBefore: REF_ERR, varBlock: String(V), letBlock: REF_ERR, fnDecl: String(V * k), fnArrow: REF_ERR, varFn: TYPE_ERR, shadowTdz: REF_ERR }[w];
    const wrongs = ['undefined', REF_ERR, TYPE_ERR, String(V), String(W), String(V * k), 'null'];
    const choices = arrange(answer, wrongs, c.ord);
    if (!choices) return null;
    const why = {
      varBefore: `\`var ${x}\` is **hoisted**: the variable exists (holding \`undefined\`) from the start of the scope, and only the \`= ${V}\` part waits until its line runs.`,
      letBefore: `\`let ${x}\` is hoisted too, but it stays in the **temporal dead zone** until its declaration runs, so reading it earlier throws \`ReferenceError: Cannot access '${x}' before initialization\`.`,
      varBlock: `\`var\` ignores blocks: \`var ${x}\` inside the \`if\` belongs to the whole scope, so it still holds ${V} after the \`}\`.`,
      letBlock: `\`let\` is block-scoped: \`${x}\` exists only inside the \`if\` block, so after the \`}\` there is no \`${x}\` at all: \`ReferenceError: ${x} is not defined\`.`,
      fnDecl: `A function **declaration** is hoisted with its body, so \`${f}\` can be called before the line that defines it: ${V} × ${k} = ${V * k}.`,
      fnArrow: `\`const ${f} = …\` is in the temporal dead zone until that line runs, so calling \`${f}\` earlier throws a \`ReferenceError\`. Only function declarations are hoisted with their body.`,
      varFn: `\`var ${f}\` is hoisted but holds \`undefined\` until the assignment runs, so \`${f}(${V})\` throws \`TypeError: ${f} is not a function\`.`,
      shadowTdz: `The inner block declares its own \`let ${x}\`, which shadows the outer one for the **whole** block. Before its declaration line it is in the temporal dead zone, so \`console.log(${x})\` throws a \`ReferenceError\` instead of printing the outer ${W}.`,
    }[w];
    return {
      code: hoistLines(hoistProg(c)), ask: askPrint('javascript'), type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `${fmtAns(answer)}. ${why}`,
      hints: ['Ask what exists when each line runs. `var` and function declarations are set up before any code runs; `let` and `const` exist from the start of their block but can\'t be read before their line.',
        '`var` belongs to the whole function or file; `let` and `const` belong to the block `{ … }` they are written in.'],
    };
  },
  sim: c => hoistRun(hoistProg(c)),
};

// `this` depends on how a function is called. Class bodies are always strict, so a method called
// without an object gets `this === undefined`.
const JS_THIS = { hard: ['method', 'detached', 'bound', 'arrowWrap', 'mapDetached', 'mapArrow'], expert: ['cbFunction', 'cbFunction', 'cbArrow', 'cbThisArg', 'cbFor', 'detached'] };
F['javascript-this'] = {
  lang: 'javascript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [K, o] = names(rng, [['Counter', 'Tally', 'Meter', 'Score'], ['c', 'counter', 'meter', 'tally']]);
    return { variant: rng.pick(JS_THIS[diff]), K, o, S: rng.int(2, 9), n: rng.int(2, 9), xs: randList(rng, 2, 3, 1, 9), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { variant: w, K, o, S, n, xs } = c;
    const expert = w.startsWith('cb');
    const cls = [`class ${K} {`, '    constructor(start) {', '        this.count = start;', '    }', '',
      ...(expert ? [
        '    addAll(xs) {',
        ...{
          cbFunction: ['        xs.forEach(function (x) {', '            this.count += x;', '        });'],
          cbArrow: ['        xs.forEach((x) => {', '            this.count += x;', '        });'],
          cbThisArg: ['        xs.forEach(function (x) {', '            this.count += x;', '        }, this);'],
          cbFor: ['        for (const x of xs) {', '            this.count += x;', '        }'],
        }[w],
        '        return this.count;', '    }',
      ] : ['    add(n) {', '        this.count += n;', '        return this.count;', '    }']),
      '}', '', `const ${o} = new ${K}(${S});`];
    const calls = {
      method: [`console.log(${o}.add(${n}));`],
      detached: ['const add = ' + o + '.add;', `console.log(add(${n}));`],
      bound: [`const add = ${o}.add.bind(${o});`, `console.log(add(${n}));`],
      arrowWrap: [`const add = (n) => ${o}.add(n);`, `console.log(add(${n}));`],
      mapDetached: [`const results = [${n}].map(${o}.add);`, 'console.log(results[0]);'],
      mapArrow: [`const results = [${n}].map((n) => ${o}.add(n));`, 'console.log(results[0]);'],
    };
    const code = [...cls, ...(expert ? [`console.log(${o}.addAll([${xs.join(', ')}]));`] : calls[w])];
    const ok = expert ? S + sum(xs) : S + n;
    const fails = ['detached', 'mapDetached', 'cbFunction'].includes(w);
    const answer = fails ? TYPE_ERR : String(ok);
    const choices = arrange(answer, [String(ok), TYPE_ERR, String(S), String(expert ? sum(xs) : n), REF_ERR, 'undefined'], c.ord);
    const why = {
      method: `\`${o}.add(${n})\` is called **on** \`${o}\`, so inside \`add\`, \`this\` is \`${o}\`.`,
      detached: `\`const add = ${o}.add;\` copies the function without the object. Calling \`add(${n})\` on its own gives \`this === undefined\` (class code is always in strict mode), so \`this.count\` throws \`TypeError: Cannot read properties of undefined\`.`,
      bound: `\`.bind(${o})\` makes a function whose \`this\` is always \`${o}\`, however it is called.`,
      arrowWrap: `The arrow function calls \`${o}.add(n)\` on the object, so \`this\` is \`${o}\`.`,
      mapDetached: `\`map\` calls \`${o}.add\` as a plain function, without the object, so \`this\` is \`undefined\` and \`this.count\` throws a \`TypeError\`.`,
      mapArrow: `The arrow callback calls \`${o}.add(n)\` on the object, so \`this\` is \`${o}\`.`,
      cbFunction: `\`forEach\` calls the \`function (x) { … }\` callback as a plain function, so inside it \`this\` is \`undefined\` (class code is strict): \`this.count\` throws a \`TypeError\`. Only the method itself gets \`this\` = \`${o}\`.`,
      cbArrow: `An arrow function has no \`this\` of its own: it uses the \`this\` of \`addAll\`, which is \`${o}\`.`,
      cbThisArg: `The second argument of \`forEach\` (\`this\`) is used as \`this\` inside the callback, so the callback updates \`${o}\`.`,
      cbFor: `A \`for…of\` loop is not a separate function, so \`this\` is still \`${o}\`.`,
    }[w];
    return {
      code, ask: askPrint('javascript'), type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `${fmtAns(answer)}. ${why}${fails ? '' : ` It returns ${S} + ${expert ? xs.join(' + ') : n} = ${ok}.`}`,
      hints: ['`this` is decided by how a function is **called**: `obj.method()` sets it to `obj`; calling the same function on its own leaves it `undefined` in strict code.',
        expert ? 'A `function` callback gets its own `this` (from whoever calls it); an arrow function and a loop body keep the method\'s `this`.' : '`.bind(obj)` fixes `this`; an arrow function that calls `obj.method()` keeps the object.'],
    };
  },
  sim(c) {
    // receivers: a method value remembers no object; bind fixes one; a plain call passes undefined
    const obj = { count: c.S };
    const add = (self, n) => { if (!self) throw new Error('TypeError'); self.count += n; return self.count; };
    const method = { kind: 'method' };
    const call = (fv, n, recv) => (fv.kind === 'bound' ? add(fv.target, n) : fv.kind === 'arrow' ? fv.body(n) : add(recv, n));
    try {
      if (c.variant.startsWith('cb')) {
        const self = obj; // this inside addAll (called as obj.addAll)
        const cb = { cbFunction: { kind: 'function' }, cbArrow: { kind: 'arrow' }, cbThisArg: { kind: 'function', thisArg: self }, cbFor: { kind: 'loop' } }[c.variant];
        for (const x of c.xs) add(cb.kind === 'function' ? cb.thisArg : self, x);
        return tk(String(self.count));
      }
      const r = {
        method: () => call(method, c.n, obj),
        detached: () => call(method, c.n, undefined),
        bound: () => call({ kind: 'bound', target: obj }, c.n),
        arrowWrap: () => call({ kind: 'arrow', body: n => call(method, n, obj) }, c.n),
        mapDetached: () => [c.n].map(n => call(method, n, undefined))[0],
        mapArrow: () => [c.n].map(n => call({ kind: 'arrow', body: m => call(method, m, obj) }, n))[0],
      }[c.variant]();
      return tk(String(r));
    } catch { return TYPE_ERR; }
  },
};

// Array.prototype.sort() compares as strings unless given a compare function.
function sortWith(xs, cmp) { // insertion sort (stable), used by the sims
  const out = xs.slice();
  for (let i = 1; i < out.length; i++) { const v = out[i]; let j = i - 1; while (j >= 0 && cmp(out[j], v) > 0) { out[j + 1] = out[j]; j--; } out[j + 1] = v; }
  return out;
}
const lexCmp = (a, b) => { const s = String(a), t = String(b); for (let i = 0; i < Math.min(s.length, t.length); i++) { if (s.charCodeAt(i) !== t.charCodeAt(i)) return s.charCodeAt(i) - t.charCodeAt(i); } return s.length - t.length; };
const mixedNums = (rng, n) => {
  const xs = [rng.int(1, 9), rng.int(10, 99), rng.int(10, 99), rng.int(100, 999), rng.int(1, 9), rng.int(10, 99)].slice(0, n);
  return rng.shuffle([...new Set(xs)]);
};
F['javascript-sort'] = {
  lang: 'javascript', diffs: ['medium'],
  make(rng) {
    const [xs] = names(rng, [['xs', 'nums', 'scores', 'sizes', 'ages']]);
    return { xs, vals: mixedNums(rng, rng.int(4, 5)), mode: rng.pick(['default', 'default', 'asc', 'desc']), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { xs, vals, mode } = c;
    const lexi = [...vals].sort(), asc = [...vals].sort((a, b) => a - b), desc = [...asc].reverse();
    if (lexi.join() === asc.join()) return null;
    const J = a => a.join(' ');
    const answer = J({ default: lexi, asc, desc }[mode]);
    const choices = arrange(answer, [J(lexi), J(asc), J(desc), J(vals), J([...lexi].reverse())], c.ord);
    const call = { default: `${xs}.sort();`, asc: `${xs}.sort((a, b) => a - b);`, desc: `${xs}.sort((a, b) => b - a);` }[mode];
    return {
      code: [`const ${xs} = [${vals.join(', ')}];`, call, `console.log(${xs}.join(" "));`], ask: askPrint('javascript'), type: 'choice', answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**. ` + (mode === 'default'
        ? 'With no compare function, `sort()` turns the items into **strings** and sorts them in dictionary order, character by character: "1" < "10" < "100" < "2". So numbers with more digits are not necessarily later.'
        : `\`(a, b) => ${mode === 'asc' ? 'a - b' : 'b - a'}\` compares the numbers as numbers: a negative result puts \`a\` first, so this sorts from ${mode === 'asc' ? 'smallest to largest' : 'largest to smallest'}.`) +
        ' (`sort` also changes the array in place, which is why `const` is fine here.)',
      hints: [mode === 'default' ? 'Look at the call: is there a compare function? Without one, `sort()` compares the items as text.' : 'The compare function returns a negative number when `a` should come first.',
        mode === 'default' ? 'Write each number as text and sort them like words in a dictionary, first character first.' : 'Work out the order the numbers end up in.'],
    };
  },
  sim(c) {
    const cmp = { default: lexCmp, asc: (a, b) => a - b, desc: (a, b) => b - a }[c.mode];
    return tk(sortWith(c.vals, cmp).join(' '));
  },
};

F['javascript-sort-line'] = {
  lang: 'javascript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const dir = diff === 'expert' ? rng.pick(['asc', 'desc']) : 'asc';
    const [f, xs] = names(rng, [dir === 'asc' ? ['sortScores', 'smallestFirst', 'ascending', 'inOrder'] : ['largestFirst', 'descending', 'topFirst', 'highToLow'], ['nums', 'scores', 'values', 'list']]);
    return { dir, f, xs, ex: mixedNums(rng, rng.int(4, 5)), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { dir, f, xs, ex } = c;
    const asc = dir === 'asc', body = asc ? 'a - b' : 'b - a';
    const want = sortWith(ex, asc ? (a, b) => a - b : (a, b) => b - a).join(' '), got = sortWith(ex, lexCmp).join(' ');
    if (want === got) return null;
    const bug = `${xs}.sort()`, answer = `${xs}.sort((a, b) => ${body})`;
    return {
      code: [`function ${f}(${xs}) {`, `    ${bug};`, `    return ${xs};`, '}', '', `console.log(${f}([${ex.join(', ')}]).join(" "));`],
      lead: `\`${f}\` should sort the numbers from ${asc ? 'smallest to largest' : 'largest to smallest'}, so this should print **${want}**. It prints **${got}** instead.`,
      ask: rewriteAsk(diff, 2), type: 'text', answer, trail: ';', bug, lineNo: 2,
      alts: [`${xs}.sort((x, y) => ${asc ? 'x - y' : 'y - x'})`, `${xs}.sort(function (a, b) { return ${body}; })`],
      distractors: [bug, `${xs}.sort((a, b) => ${asc ? 'b - a' : 'a - b'})`, `${xs}.sort((a, b) => a > b)`, `${xs}.reverse()`, `${xs}.sort(a - b)`],
      explanation: `Line 2 should be \`${answer};\`. Without a compare function, \`sort()\` turns the numbers into strings and sorts them in dictionary order (${got}). \`(a, b) => ${body}\` compares them as numbers: a negative result puts \`a\` first, so it sorts from ${asc ? 'smallest to largest' : 'largest to smallest'}. (A compare function that returns \`true\`/\`false\`, such as \`a > b\`, is not a valid comparator.)`,
      hints: ['What does `sort()` do with numbers when it is given no compare function?', 'Give `sort` a compare function `(a, b) => …` that returns a negative number when `a` should come first.',
        `For ${asc ? 'smallest first' : 'largest first'}, subtract in the right order.`],
    };
  },
  sim(c) {
    const X = c.xs, asc = c.dir === 'asc';
    const tests = [c.ex, [100, 25, 3, 7], [9, 81, 18, 1, 200]];
    const arrow = new RegExp(`^${X}\\s*\\.sort\\(\\s*\\(\\s*(\\w+)\\s*,\\s*(\\w+)\\s*\\)\\s*=>\\s*(\\w+)\\s*-\\s*(\\w+)\\s*\\)$`);
    const fn = new RegExp(`^${X}\\s*\\.sort\\(\\s*function\\s*\\(\\s*(\\w+)\\s*,\\s*(\\w+)\\s*\\)\\s*\\{\\s*return\\s+(\\w+)\\s*-\\s*(\\w+)\\s*;?\\s*\\}\\s*\\)$`);
    const plain = new RegExp(`^${X}\\s*\\.sort\\(\\s*\\)$`);
    return {
      ok(line) {
        const s = stripMark(line);
        let cmp = null;
        if (plain.test(s)) cmp = lexCmp;
        const m = s.match(arrow) || s.match(fn);
        if (m) {
          const [, p, q, u, v] = m;
          if (p === q || p === X || q === X) return false;
          if (u === p && v === q) cmp = (a, b) => a - b; else if (u === q && v === p) cmp = (a, b) => b - a; else return false;
        }
        if (!cmp) return false;
        return tests.every(t => {
          const got = sortWith(t, cmp);
          // sorted the required way: every neighbour pair in order
          return got.every((x, i) => i === 0 || (asc ? got[i - 1] <= x : got[i - 1] >= x));
        });
      },
    };
  },
};

// `==` converts; a check that should only accept one exact value needs `===`.
const JS_STRICT = [
  { fn: 'isZero', lit: '0', target: 'zero', ins: ['empty', 'szero', 'f'], what: 'the number 0' },
  { fn: 'isEmpty', lit: '""', target: 'empty', ins: ['zero', 'f'], what: 'the empty string `""`' },
  { fn: 'isOne', lit: '1', target: 'one', ins: ['t', 'sone'], what: 'the number 1' },
];
F['javascript-strict-line'] = {
  lang: 'javascript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const s = rng.pick(JS_STRICT);
    const [p] = names(rng, [['value', 'input', 'x', 'v']]);
    return { s: JS_STRICT.indexOf(s), p, input: rng.pick(s.ins), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const s = JS_STRICT[c.s], { p } = c, I = JS_VALS[c.input];
    const bug = `return ${p} == ${s.lit}`, answer = `return ${p} === ${s.lit}`;
    return {
      code: [`function ${s.fn}(${p}) {`, `    ${bug};`, '}', '', `console.log(${s.fn}(${I[0]}));`],
      lead: `\`${s.fn}\` should be \`true\` only for ${s.what}, so \`${s.fn}(${I[0]})\` should print **false**. It prints **true**.`,
      ask: rewriteAsk(diff, 2), type: 'text', answer, trail: ';', bug, lineNo: 2,
      alts: [`return ${s.lit} === ${p}`],
      distractors: [bug, `return ${p} = ${s.lit}`, `return ${p} !== ${s.lit}`, `return ${p} != ${s.lit}`, s.lit === '""' ? `return ${p} === 0` : `return ${p} === "${s.lit}"`],
      explanation: `Line 2 should be \`${answer};\`. \`==\` converts before comparing, so ${tk(I[0])} == ${tk(s.lit)} is \`true\`${typeof I[1] === 'boolean' ? ` (\`${I[0]}\` becomes ${I[1] ? 1 : 0})` : typeof I[1] === 'string' ? ` (the string becomes the number ${jsToNum(I[1])})` : ' (the number is compared with the string turned into a number)'}. \`===\` compares type and value with no conversion, so only ${s.what} passes.`,
      hints: ['Which values does `==` treat as equal to the literal? It converts strings and booleans to numbers first.', 'JavaScript has an equality operator that never converts.', 'Change only the operator.'],
    };
  },
  sim(c) {
    const s = JS_STRICT[c.s], T = JS_VALS[s.target][1];
    const re = /^return\s+(.+?)\s*(===|!==|==|!=)\s*(.+)$/;
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m) return false;
        const [, l, op, r] = m;
        if (!((l === c.p && r === s.lit) || (r === c.p && l === s.lit))) return false;
        // every value: true exactly for the target value itself (same type, same value)
        return Object.values(JS_VALS).every(([, v]) => {
          // eslint-disable-next-line eqeqeq
          const got = op === '===' ? v === T : op === '!==' ? v !== T : op === '==' ? v == T : v != T;
          return got === (jsType(v) === jsType(T) && Object.is(v, T));
        });
      },
    };
  },
};

// Closures in loops: one shared `var` binding vs a fresh `let` binding per iteration.
F['javascript-closure-loop'] = {
  lang: 'javascript', diffs: ['expert'],
  make(rng) {
    const [arr, i] = names(rng, [['getters', 'fns', 'makers', 'readers'], ['i', 'k', 'step']]);
    return { arr, i, variant: rng.pick(['varHead', 'varHead', 'letHead', 'letOutside', 'varConst']), N: rng.int(3, 4), K: rng.int(1, 4), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { arr, i, variant: w, N, K } = c;
    const mul = v => (K === 1 ? v : `${v} * ${K}`);
    const head = { varHead: `for (var ${i} = 0; ${i} < ${N}; ${i}++) {`, letHead: `for (let ${i} = 0; ${i} < ${N}; ${i}++) {`, letOutside: `for (${i} = 0; ${i} < ${N}; ${i}++) {`, varConst: `for (var ${i} = 0; ${i} < ${N}; ${i}++) {` }[w];
    const body = w === 'varConst' ? ['    const j = ' + i + ';', `    ${arr}.push(() => ${mul('j')});`] : [`    ${arr}.push(() => ${mul(i)});`];
    const code = [`const ${arr} = [];`, ...(w === 'letOutside' ? [`let ${i};`] : []), head, ...body, '}', `console.log(${arr}.map((g) => g()).join(" "));`];
    const range = Array.from({ length: N }, (_, j) => j);
    const per = range.map(j => j * K).join(' '), shared = range.map(() => N * K).join(' ');
    const answer = ['letHead', 'varConst'].includes(w) ? per : shared;
    const choices = arrange(answer, [per, shared, range.map(j => (j + 1) * K).join(' '), range.map(() => (N - 1) * K).join(' ')], c.ord);
    const why = {
      varHead: `\`var ${i}\` is **one** variable for the whole loop. Every arrow function reads that same \`${i}\` when it is called, after the loop has finished, when \`${i}\` is ${N}.`,
      letOutside: `\`let ${i};\` is declared **outside** the loop, so there is only one \`${i}\`, shared by every arrow function. When they are called, the loop has finished and \`${i}\` is ${N}.`,
      letHead: `A \`let\` in the \`for\` header gets a **fresh copy for every pass**, so each arrow function keeps the value of \`${i}\` from its own pass.`,
      varConst: `\`${i}\` is one shared \`var\`, but \`const j = ${i};\` creates a new \`j\` on every pass (it is block-scoped), so each arrow function keeps its own \`j\`.`,
    }[w];
    return {
      code, ask: askPrint('javascript'), type: 'choice', answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**. ${why}`,
      hints: ['The arrow functions run after the loop has finished. What value does each one read at that moment?', 'A `let` declared in the `for (…)` header is a new variable on each pass; a `var`, or a `let` declared before the loop, is a single variable.'],
    };
  },
  sim(c) {
    // bindings as objects; a closure keeps a reference to the binding it saw
    const fns = [];
    const perIter = c.variant === 'letHead';
    let b = { v: 0 };
    while (b.v < c.N) {
      if (c.variant === 'varConst') { const j = { v: b.v }; fns.push(() => j.v * c.K); } else { const cur = b; fns.push(() => cur.v * c.K); }
      if (perIter) b = { v: b.v }; // CreatePerIterationEnvironment copies before the increment
      b.v++;
    }
    return tk(fns.map(f => f()).join(' '));
  },
};

// ---- TypeScript ----
const TS_NOTE_BOTH = NOTE.typescript;
const tsConv = (conv, src) => ({ as: `${src} as number`, Number: `Number(${src})`, unary: `+${src}`, parseInt: `parseInt(${src}, 10)` }[conv]);
F['typescript-cast'] = {
  lang: 'typescript', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const [d, fld, v] = names(rng, [['data', 'payload', 'row', 'body'], ['qty', 'count', 'age', 'size'], ['n', 'amount', 'value', 'num']]);
    return { d, fld, v, sv: rng.int(2, 19), k: rng.int(2, 9), conv: rng.pick(diff === 'medium' ? ['as', 'as', 'Number', 'unary'] : ['as', 'as', 'Number', 'parseInt', 'unary']),
      op: diff === 'medium' ? '+' : rng.pick(['+', '+', '*', '-']), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { d, fld, v, sv, k, conv, op } = c;
    const num = op === '+' ? sv + k : op === '*' ? sv * k : sv - k;
    const answer = conv === 'as' && op === '+' ? `${sv}${k}` : String(num);
    const choices = arrange(answer, [`${sv}${k}`, String(num), NO_COMPILE, 'NaN', String(sv + k)], c.ord);
    const code = [`const ${d}: any = JSON.parse('{"${fld}": "${sv}"}');`, `const ${v} = ${tsConv(conv, `${d}.${fld}`)};`, `console.log(${v} ${op} ${k});`];
    const why = conv === 'as'
      ? `\`as number\` only changes what the **compiler** believes: types are erased when TypeScript compiles to JavaScript, so at run time \`${v}\` is still the string "${sv}". ` +
        (op === '+' ? `\`+\` with a string joins text: "${sv}" + ${k} is "${sv}${k}".` : `\`${op}\` has no string meaning, so JavaScript converts "${sv}" to a number anyway: ${num}.`)
      : `\`${tsConv(conv, `${d}.${fld}`)}\` really converts the string "${sv}" to the number ${sv} at run time, so the arithmetic is ${sv} ${op} ${k} = ${num}.`;
    return {
      code, ask: askPrint('typescript'), type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `It prints **${answer}**. ${why} It compiles: \`JSON.parse\` returns \`any\`, and \`any\` may be used as anything.`,
      hints: ['What is the value of the field at run time: a number or a string? Look at the JSON text.', 'Does the second line actually convert anything when the program runs, or does it only tell the compiler what to believe?'],
    };
  },
  sim(c) {
    const raw = String(c.sv);
    const v = { as: raw, Number: Number(raw), unary: +raw, parseInt: parseInt(raw, 10) }[c.conv];
    const r = c.op === '+' ? v + c.k : c.op === '*' ? v * c.k : v - c.k;
    return fmtAns(String(r));
  },
};

F['typescript-any'] = {
  lang: 'typescript', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const [f, xs, acc, p] = names(rng, [['total', 'sumAll', 'addUp'], ['xs', 'nums', 'items'], ['sum', 'acc', 'running'], ['parsed', 'values', 'input']]);
    const vals = randList(rng, 3, 4, 1, 9);
    const strs = new Set();
    if (diff === 'medium') strs.add(rng.int(1, vals.length - 1));
    else { strs.add(rng.int(0, vals.length - 1)); if (rng.next() < 0.4) strs.add(rng.int(0, vals.length - 1)); }
    return { f, xs, acc, p, vals, strs: [...strs].sort(), fixed: diff === 'hard' && rng.next() < 0.2, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { f, xs, acc, p, vals, strs, fixed } = c;
    const json = `[${vals.map((v, i) => (strs.includes(i) ? `"${v}"` : String(v))).join(', ')}]`;
    // closed form: numbers add until the first string; from then on everything is joined as text
    let text = null, total = 0;
    vals.forEach((v, i) => { if (text === null && (fixed || !strs.includes(i))) total += v; else text = (text === null ? String(total) : text) + String(v); });
    const answer = text === null ? String(total) : text;
    const plain = vals.join('');
    const choices = arrange(answer, [answer, String(sum(vals)), NO_COMPILE, plain, `0${plain}`, 'NaN'], c.ord);
    return {
      code: [`function ${f}(${xs}: number[]): number {`, `    let ${acc} = 0;`, `    for (const x of ${xs}) {`, `        ${acc} += x;`, '    }', `    return ${acc};`, '}', '',
        `const ${p}: number[] = JSON.parse('${json}')${fixed ? '.map(Number)' : ''};`, `console.log(${f}(${p}));`],
      ask: askPrint('typescript'), type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `It prints **${answer}**. ` + (fixed ? `\`.map(Number)\` really turns every item into a number, so the sum is ${vals.join(' + ')} = ${sum(vals)}.`
        : `\`JSON.parse\` returns \`any\`, so the compiler accepts it as a \`number[]\` without checking. At run time the array still holds the string${strs.length > 1 ? 's' : ''} ${strs.map(i => `"${vals[i]}"`).join(' and ')}. ` +
          `\`${acc} += x\` adds numbers until it meets a string; from then on \`+\` joins text, so the result is the string "${answer}" even though the function says it returns a \`number\`.`),
      hints: ['Does the compiler check what `JSON.parse` returns? What type is it?', 'Look at the JSON text: which items are strings? Trace `+=` item by item: number + number adds, but anything + string joins text.'],
    };
  },
  sim(c) {
    const items = c.vals.map((v, i) => (!c.fixed && c.strs.includes(i) ? String(v) : v));
    let acc = 0;
    for (const x of items) acc += x;
    return fmtAns(String(acc));
  },
};

F['typescript-optional'] = {
  lang: 'typescript', diffs: ['medium', 'expert'],
  make(rng, diff) {
    const [T, p, nm] = names(rng, [['Player', 'Member', 'Entry', 'Card'], ['p', 'player', 'item'], ['kim', 'ann', 'raj', 'lee']]);
    return { T, p, nm, S: rng.int(10, 20), D: rng.int(2, 9), B: rng.int(1, 9),
      present: rng.pick(diff === 'medium' ? ['missing', 'missing', 'value'] : ['zero', 'zero', 'missing', 'value']), op: rng.pick(['??', '||', '!']), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { T, p, nm, S, D, B, present, op } = c;
    const lit = present === 'missing' ? `{ name: "${nm}" }` : `{ name: "${nm}", bonus: ${present === 'zero' ? 0 : B} }`;
    const head = [`interface ${T} {`, '    name: string;', '    bonus?: number;', '}', '', `const ${p}: ${T} = ${lit};`];
    const bonus = present === 'missing' ? undefined : present === 'zero' ? 0 : B;
    if (diff === 'expert') {
      const a = S + (bonus === undefined ? D : bonus), b = S + (bonus === undefined || bonus === 0 ? D : bonus);
      return {
        code: [...head, `const a = ${S} + (${p}.bonus ?? ${D});`, `const b = ${S} + (${p}.bonus || ${D});`, 'console.log(a);', 'console.log(b);'],
        ask: `What do the two lines print? ${NOTE.typescript}`, type: 'multi',
        parts: [
          { id: 'a', label: 'First line', ask: 'What does `console.log(a)` print?', answerType: 'number', answer: a, tolerance: 0, hint: '`x ?? d` uses `d` only when `x` is `null` or `undefined`.' },
          { id: 'b', label: 'Second line', ask: 'What does `console.log(b)` print?', answerType: 'number', answer: b, tolerance: 0, hint: '`x || d` uses `d` whenever `x` is falsy: `undefined`, `null`, `0`, `""`, `NaN` or `false`.' },
        ],
        explanation: `It prints **${a}** then **${b}**. \`bonus?: number\` means the property may be missing (\`undefined\`). ${present === 'missing' ? 'Here it is missing, so both `??` and `||` fall back to ' + D + '.' : present === 'zero' ? `Here it is **0**. \`??\` falls back only for \`null\`/\`undefined\`, so it keeps 0; \`||\` falls back for any falsy value, and 0 is falsy, so it uses ${D}.` : `Here it is ${B}, which is neither missing nor falsy, so both keep it.`}`,
      };
    }
    const expr = { '??': `(${p}.bonus ?? ${D})`, '||': `(${p}.bonus || ${D})`, '!': `${p}.bonus!` }[op];
    const val = bonus === undefined ? (op === '!' ? NaN : S + D) : S + bonus;
    const answer = String(val);
    const choices = arrange(answer, [String(S + D), 'NaN', String(S), NO_COMPILE, String(S + B), 'undefined'], c.ord);
    return {
      code: [...head, `const total = ${S} + ${expr};`, 'console.log(total);'], ask: askPrint('typescript'), type: 'choice', answer: tk(answer), choices: choices.map(fmtAns),
      explanation: `It prints **${answer}**. ` + (op === '!'
        ? `\`${p}.bonus!\` is a **non-null assertion**: it tells the compiler "trust me, this is not undefined" and compiles, but it checks nothing at run time. ${bonus === undefined ? `The property is missing, so ${S} + undefined is \`NaN\`.` : `Here bonus is ${bonus}, so ${S} + ${bonus} = ${val}.`}`
        : `\`bonus?: number\` may be \`undefined\`. ${bonus === undefined ? `It is missing here, so \`${op}\` falls back to ${D}: ${S} + ${D} = ${val}.` : `Here it is ${bonus}, so \`${op}\` keeps it: ${S} + ${bonus} = ${val}.`} (Without \`${op} ${D}\`, strict mode would reject \`${S} + ${p}.bonus\`: it is possibly \`undefined\`.)`),
      hints: ['Is `bonus` set in the object literal? A missing optional property reads as `undefined`.', op === '!' ? 'The `!` after an expression only silences the compiler. What is a number plus `undefined` in JavaScript?' : `When does \`${op}\` use the value on its right?`],
    };
  },
  sim(c, diff) {
    const obj = c.present === 'missing' ? {} : { bonus: c.present === 'zero' ? 0 : c.B };
    if (diff === 'expert') return { a: c.S + (obj.bonus ?? c.D), b: c.S + (obj.bonus || c.D) };
    const v = c.op === '??' ? (obj.bonus ?? c.D) : c.op === '||' ? (obj.bonus || c.D) : obj.bonus;
    return tk(String(c.S + v));
  },
};

// Which line does tsc (strict) reject? One group breaks a rule; the others are look-alikes that compile.
const TS_RULES = {
  possiblyUndef: 'An optional property may be `undefined` (TS18048)',
  assign: 'A `string` can\'t be assigned to a `number` (TS2322)',
  castLiteral: '`as` can\'t convert between unrelated types (TS2352)',
  constAssign: 'A `const` can\'t be assigned again (TS2588)',
  missingProp: 'A required property is missing (TS2741)',
};
const TS_RULE_DECOYS = ['An `any` value can\'t be used in arithmetic', '`as unknown as` is not allowed'];
const TS_HEAD = ['interface Stats {', '    score: number;', '    bonus?: number;', '}', ''];
F['typescript-compile'] = {
  lang: 'typescript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const pool = diff === 'expert' ? ['possiblyUndef', 'assign', 'castLiteral', 'constAssign', 'missingProp'] : ['possiblyUndef', 'assign', 'castLiteral', 'constAssign'];
    const bad = rng.pick(pool);
    const goods = rng.shuffle(pool.filter(g => g !== bad)).slice(0, diff === 'expert' ? 3 : 2);
    const n = {
      t: rng.pick(['stats', 'mine', 'today']), sum: rng.pick(['sum', 'points', 'result']), s1: rng.int(3, 9),
      cnt: rng.pick(['count', 'tally', 'hits']), k: rng.int(2, 9), q: rng.pick(['n', 'qty', 'size']), k2: rng.int(2, 9),
      lim: rng.pick(['limit', 'cap', 'maxLevel']), k3: rng.int(2, 8), s2: rng.pick(['other', 'theirs', 'best']), k4: rng.int(2, 9),
    };
    return { bad, order: rng.shuffle([bad, ...goods]), n, ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { bad, order, n } = c;
    const lines = [...TS_HEAD], suspects = [];
    for (const g of order) {
      const b = g === bad;
      const G = {
        possiblyUndef: [[`const ${n.t}: Stats = { score: ${n.s1} };`, b ? `const ${n.sum} = ${n.t}.score + ${n.t}.bonus;` : `const ${n.sum} = ${n.t}.score + (${n.t}.bonus ?? 0);`], 1],
        assign: [[b ? `let ${n.cnt}: number = "${n.k}";` : `let ${n.cnt}: number = Number("${n.k}");`], 0],
        castLiteral: [[b ? `const ${n.q} = "${n.k2}" as number;` : `const ${n.q} = "${n.k2}" as unknown as number;`], 0],
        constAssign: [[b ? `const ${n.lim} = ${n.k3};` : `let ${n.lim} = ${n.k3};`, `${n.lim} = ${n.k3 + 1};`], 1],
        missingProp: [[b ? `const ${n.s2}: Stats = { bonus: ${n.k4} };` : `const ${n.s2}: Stats = { score: ${n.k4} };`], 0],
      }[g];
      suspects.push(lines.length + G[1] + 1);
      lines.push(...G[0]);
    }
    const badLine = suspects[order.indexOf(bad)];
    let others = suspects.filter(x => x !== badLine);
    if (others.length < 3) others = [...others, ...[6, 7, 8, 9, 10].filter(x => x <= lines.length && x !== badLine && !others.includes(x))].slice(0, 3);
    const lc = lineChoices(badLine, others);
    const why = {
      possiblyUndef: `\`bonus?: number\` means \`${n.t}.bonus\` has the type \`number | undefined\`, and strict mode refuses arithmetic on a value that may be \`undefined\` ("'${n.t}.bonus' is possibly 'undefined'"). The look-alike gives a fallback with \`?? 0\`.`,
      assign: `The variable is declared \`number\` but the value is a \`string\` literal. TypeScript never converts it; \`Number("${n.k}")\` does, at run time.`,
      castLiteral: `\`as\` doesn't convert values, it only asserts a type, and the compiler refuses an assertion between two types that don't overlap, such as \`string\` and \`number\` ("Conversion of type 'string' to type 'number' may be a mistake"). Going through \`unknown\` (\`as unknown as number\`) silences it, but still converts nothing.`,
      constAssign: `\`const\` means the name can never be assigned again ("Cannot assign to '${n.lim}' because it is a constant"). The look-alike uses \`let\`.`,
      missingProp: `An object literal typed \`Stats\` must have every required property: \`score\` is required (only \`bonus\` has a \`?\`), so \`{ bonus: ${n.k4} }\` is rejected ("Property 'score' is missing").`,
    }[bad];
    const expl = `Line ${badLine} does not compile: **${TS_RULES[bad]}**. ${why}\n\nThe other suspicious lines compile.`;
    const ask = `Exactly one line fails to compile. ${NOTE.typescript}`;
    if (diff === 'expert') {
      const rules = arrange(TS_RULES[bad], [...Object.values(TS_RULES), ...TS_RULE_DECOYS], c.ord);
      return {
        code: lines, ask: `${ask} Which line, and which rule does it break?`, type: 'multi', explanation: expl,
        parts: [
          { id: 'line', label: 'Line', ask: 'Which line fails to compile?', answerType: 'choice', answer: LINE(badLine), choices: lc, hint: 'Check each line that mixes types, uses an optional property, asserts a type with `as`, reassigns a name or builds a `Stats` object.' },
          { id: 'rule', label: 'Rule', ask: 'Which rule does it break?', answerType: 'choice', answer: TS_RULES[bad], choices: rules, hint: 'Compare the line you picked with its look-alike: what is different?' },
        ],
      };
    }
    return {
      code: lines, ask: `${ask} Which line?`, type: 'choice', answer: LINE(badLine), choices: lc, explanation: expl,
      hints: ['Each suspicious line has a look-alike that compiles. Look for an optional property used in arithmetic, a `string` stored in a `number`, an `as` between unrelated types, or a `const` assigned again.',
        '`?` on a property makes its type include `undefined`; `as` never converts a value; `const` can\'t be reassigned.'],
    };
  },
  sim: (c, diff, v) => compileAnswer(F['typescript-compile'].check(c, diff, v), diff, TS_RULES),
  // A small strict-mode checker over the rendered lines: interface properties, declared types,
  // optional properties in arithmetic, `as` assertions on literals, const reassignment, object literals.
  check(c, diff, v) {
    const lines = v.code, props = {}, env = {};
    let inIface = null;
    const typeOf = e => {
      e = e.trim();
      let m;
      if (/^-?\d+$/.test(e)) return 'number';
      if (/^"[^"]*"$/.test(e)) return 'string';
      if (/^Number\(.*\)$/.test(e)) return 'number';
      if (/^"[^"]*" as unknown as number$/.test(e)) return 'number';
      if (/^"[^"]*" as number$/.test(e)) return { err: 'castLiteral' };
      if ((m = e.match(/^\((.+) \?\? (.+)\)$/))) { const a = typeOf(m[1]); return a.err ? a : 'number'; }
      if ((m = e.match(/^(\w+)\.(\w+)$/))) { const p = props[env[m[1]]?.type]?.[m[2]]; return p ? (p.optional ? 'number|undefined' : p.type) : '?'; }
      if ((m = e.match(/^(.+) \+ (.+)$/))) {
        const a = typeOf(m[1]), b = typeOf(m[2]);
        if (a.err) return a; if (b.err) return b;
        if (a === 'number|undefined' || b === 'number|undefined') return { err: 'possiblyUndef' };
        return a === 'number' && b === 'number' ? 'number' : '?';
      }
      if ((m = e.match(/^\{ (.*) \}$/))) return { obj: m[1].split(', ').map(kv => kv.split(': ')[0]) };
      return '?';
    };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let m;
      if ((m = l.match(/^interface (\w+) \{$/))) { inIface = m[1]; props[inIface] = {}; continue; }
      if (inIface) { if (l === '}') { inIface = null; continue; } const p = l.match(/^ {4}(\w+)(\?)?: (\w+);$/); if (!p) return { line: -1 }; props[inIface][p[1]] = { optional: !!p[2], type: p[3] }; continue; }
      if (l === '') continue;
      if ((m = l.match(/^(const|let) (\w+)(?:: (\w+))? = (.+);$/))) {
        const t = typeOf(m[4]);
        if (t.err) return { line: i + 1, rule: t.err };
        if (m[3] && props[m[3]]) {
          if (!t.obj) return { line: -1 };
          const missing = Object.entries(props[m[3]]).some(([k, p]) => !p.optional && !t.obj.includes(k));
          if (missing) return { line: i + 1, rule: 'missingProp' };
        } else if (m[3] && t !== m[3]) return { line: i + 1, rule: 'assign' };
        env[m[2]] = { kind: m[1], type: m[3] || t };
      } else if ((m = l.match(/^(\w+) = (.+);$/))) {
        if (!env[m[1]]) return { line: -1 };
        if (env[m[1]].kind === 'const') return { line: i + 1, rule: 'constAssign' };
      } else return { line: -1 };
    }
    return { line: 0, rule: null };
  },
};

F['typescript-cast-line'] = {
  lang: 'typescript', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [d, fld, v] = names(rng, [['data', 'payload', 'row', 'body'], ['qty', 'count', 'age', 'size'], ['n', 'amount', 'value', 'num']]);
    return { d, fld, v, sv: rng.int(2, 19), k: rng.int(2, 9), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { d, fld, v, sv, k } = c, src = `${d}.${fld}`;
    const bug = `const ${v} = ${src} as number`, answer = `const ${v} = Number(${src})`;
    return {
      code: [`const ${d}: any = JSON.parse('{"${fld}": "${sv}"}');`, `${bug};`, `console.log(${v} + ${k});`],
      lead: `This should print **${sv + k}** (${sv} + ${k}), but it prints **${sv}${k}**. ${NOTE.typescript}`,
      ask: rewriteAsk(diff, 2, `${tk(v)} really holds a number`), type: 'text', answer, trail: ';', bug, lineNo: 2,
      alts: [`const ${v} = parseInt(${src}, 10)`, `const ${v}: number = Number(${src})`, `const ${v} = +${src}`, `const ${v} = parseFloat(${src})`, `const ${v} = parseInt(${src})`],
      distractors: [bug, `const ${v} = ${src} as string`, `const ${v}: number = ${src}`, `const ${v} = String(${src})`, `const ${v} = Number(${d})`],
      explanation: `Line 2 should be \`${answer};\`. \`as number\` is only a promise to the compiler: TypeScript's types are erased when it compiles, so at run time \`${v}\` is still the string "${sv}", and \`+\` joins it with ${k}. \`Number(…)\` (or \`parseInt(…, 10)\`, or unary \`+\`) converts the string when the program runs.`,
      hints: ['What is the value of the field at run time? Look at the JSON text.', 'Does `as number` change the value, or only what the compiler believes?', 'Use a function that turns a string into a number when the program runs.'],
    };
  },
  sim(c) {
    const src = `${c.d}\\s*\\.\\s*${c.fld}`;
    const re = new RegExp(`^const\\s+${c.v}(?:\\s*:\\s*(\\w+))?\\s*=\\s*(.+)$`);
    const forms = [
      [new RegExp(`^Number\\(\\s*${src}\\s*\\)$`), s => Number(s), 'number'], [new RegExp(`^parseInt\\(\\s*${src}\\s*(?:,\\s*10\\s*)?\\)$`), s => parseInt(s, 10), 'number'],
      [new RegExp(`^parseFloat\\(\\s*${src}\\s*\\)$`), s => parseFloat(s), 'number'], [new RegExp(`^\\+\\s*${src}$`), s => +s, 'number'],
      [new RegExp(`^${src}\\s+as\\s+number$`), s => s, 'number'], [new RegExp(`^${src}\\s+as\\s+string$`), s => s, 'string'],
      [new RegExp(`^String\\(\\s*${src}\\s*\\)$`), s => String(s), 'string'], [new RegExp(`^${src}$`), s => s, 'any'],
    ];
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m) return false;
        const f = forms.find(([r]) => r.test(m[2].trim()));
        if (!f) return false;
        if (m[1] && !(m[1] === f[2] || f[2] === 'any')) return false; // e.g. `: number = String(…)` does not compile
        // run it: the value read from JSON is a string; the program must print the numeric sum
        return ['7', '12', '30', String(c.sv)].every(s => { const v = f[1](s); const out = v + c.k; return typeof out === 'number' && out === Number(s) + c.k; });
      },
    };
  },
};

// ---- Java ----
// int overflow: always wraps silently (constants too); Math.addExact/multiplyExact throw; a long
// addition only helps when it happens in long.
const JAVA_OVF = { medium: ['plain', 'plain', 'long', 'const'], hard: ['plain', 'longLate', 'long', 'exact'], expert: ['mul', 'mulExact', 'longLate', 'const', 'abs'] };
F['java-overflow'] = {
  lang: 'java', diffs: ['medium', 'hard', 'expert'],
  make(rng, diff) {
    return { v: rng.pick(['score', 'total', 'count', 'level']), variant: rng.pick(JAVA_OVF[diff]), d: rng.int(0, 4), n: rng.int(1, 9), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { v, variant: w, d, n } = c;
    const MAXS = 'Integer.MAX_VALUE', start = d ? `${MAXS} - ${d}` : MAXS, s0 = INT_MAX - d;
    const THROW = 'It throws an `ArithmeticException`';
    const wrap = x => ((x + 2 ** 31) % 2 ** 32 + 2 ** 32) % 2 ** 32 - 2 ** 31;
    let body, math, answer, why;
    if (w === 'abs') {
      body = [`int ${v} = Integer.MIN_VALUE;`, `System.out.println(Math.abs(${v}));`];
      math = 2 ** 31; answer = String(-(2 ** 31));
      why = `The true answer, 2147483648, is one more than \`Integer.MAX_VALUE\`, so it doesn't fit: \`Math.abs(Integer.MIN_VALUE)\` wraps around and returns \`Integer.MIN_VALUE\` itself, still negative. (\`Math.absExact\` would throw instead.)`;
    } else if (w === 'mul' || w === 'mulExact') {
      const b0 = Math.trunc(INT_MAX / 2) + d + 1;
      math = b0 * 2;
      body = [`int ${v} = ${MAXS} / 2 + ${d + 1};`, w === 'mul' ? `${v} *= 2;` : `${v} = Math.multiplyExact(${v}, 2);`, `System.out.println(${v});`];
      answer = w === 'mul' ? String(wrap(math)) : THROW;
      why = `${tk(v)} starts at ${b0}, and doubling gives ${math}, more than \`Integer.MAX_VALUE\` (${INT_MAX}). ` + (w === 'mul' ? 'Java `int` arithmetic never checks: the result silently wraps around past `Integer.MIN_VALUE`.' : '`Math.multiplyExact` checks the result and throws `ArithmeticException: integer overflow`.');
    } else if (w === 'const') {
      math = INT_MAX + n;
      body = [`int ${v} = ${MAXS} + ${n};`, `System.out.println(${v});`];
      answer = String(wrap(math));
      why = `Unlike C#, Java doesn't reject an overflowing constant: \`${MAXS} + ${n}\` compiles and wraps around like any other \`int\` sum, giving ${wrap(math)}.`;
    } else {
      math = s0 + n;
      const over = math > INT_MAX;
      if (w === 'long' || w === 'longLate') {
        body = [`int ${v} = ${start};`, w === 'long' ? `long bigger = (long) ${v} + ${n};` : `long bigger = ${v} + ${n};`, 'System.out.println(bigger);'];
        answer = w === 'long' || !over ? String(math) : String(wrap(math));
        why = w === 'long' ? `The cast turns ${tk(v)} into a \`long\` first, so the addition happens in 64 bits and gives ${math}.`
          : over ? `\`${v} + ${n}\` is worked out in \`int\` **before** it is stored in the \`long\`, so it has already wrapped around to ${wrap(math)}. Cast first: \`(long) ${v} + ${n}\`.` : `${s0} + ${n} fits in an \`int\`, so nothing overflows.`;
      } else if (w === 'exact') {
        body = [`int ${v} = ${start};`, `${v} = Math.addExact(${v}, ${n});`, `System.out.println(${v});`];
        answer = over ? THROW : String(math);
        why = over ? `${s0} + ${n} = ${math} is more than \`Integer.MAX_VALUE\`, and \`Math.addExact\` throws \`ArithmeticException\` instead of wrapping.` : `${s0} + ${n} fits in an \`int\`, so \`Math.addExact\` just returns it.`;
      } else {
        body = [`int ${v} = ${start};`, `${v} += ${n};`, `System.out.println(${v});`];
        answer = String(over ? wrap(math) : math);
        why = over ? `${s0} + ${n} = ${math} doesn't fit in an \`int\` (max ${INT_MAX}). Java wraps around silently: ${math} − 2³² = ${wrap(math)}.` : `${s0} + ${n} fits in an \`int\`, so nothing overflows.`;
      }
    }
    const choices = arrange(answer, [String(wrap(math)), String(math), THROW, NO_COMPILE, String(INT_MAX)], c.ord);
    if (!choices) return null;
    return {
      code: inMain.java(body), ask: `What happens when this runs? ${NOTE.java}`, type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `${fmtAns(answer)}. ${why}\n\n\`int\` is 32 bits: from ${-(2 ** 31)} to ${INT_MAX}.`,
      hints: ['`Integer.MAX_VALUE` is 2147483647. Work out the true result first and see whether it fits in an `int`.', 'Plain `int` arithmetic in Java wraps around silently, even for constants. Only the `Math.…Exact` methods throw, and a `long` only helps if the sum is worked out in `long`.'],
    };
  },
  sim(c) {
    const MAX = 2147483647n, MIN = -2147483648n, inInt = x => x >= MIN && x <= MAX;
    const THROW = 'It throws an `ArithmeticException`', n = BigInt(c.n), d = BigInt(c.d);
    const w32 = x => String(wrapBits(x, 32, true));
    switch (c.variant) {
      case 'abs': return fmtAns(w32(-MIN));
      case 'mul': return fmtAns(w32((MAX / 2n + d + 1n) * 2n));
      case 'mulExact': { const x = (MAX / 2n + d + 1n) * 2n; return fmtAns(inInt(x) ? String(x) : THROW); }
      case 'const': return fmtAns(w32(MAX + n));
      case 'long': return fmtAns(String(MAX - d + n));
      case 'longLate': return fmtAns(w32(MAX - d + n)); // int sum first, then widened
      case 'exact': { const x = MAX - d + n; return fmtAns(inInt(x) ? String(x) : THROW); }
      default: return fmtAns(w32(MAX - d + n));
    }
  },
};

// == on references: string literals are interned, `new String` and run-time concatenation make new
// objects; boxing caches only -128..127 for certain (outside it, == is not guaranteed either way).
const JAVA_EQ = { medium: ['litlit', 'newlit', 'smallInt', 'mixed', 'equalsNew'], hard: ['newlit', 'concat', 'constConcat', 'bigInt', 'intLong', 'smallInt'], expert: ['concat', 'constConcat', 'bigInt', 'intLong', 'bigEquals', 'intLongEquals'] };
const JAVA_UNSPEC = 'Not guaranteed: it may print `true` or `false`';
F['java-equals'] = {
  lang: 'java', diffs: ['medium', 'hard', 'expert'],
  make(rng, diff) {
    const [a, b] = rng.pick([['a', 'b'], ['first', 'second'], ['saved', 'typed']]), p = rng.pick(['part', 'head', 'start']);
    const w1 = rng.pick(['sun', 'map', 'key', 'top', 'ice']), w2 = rng.pick(['day', 'set', 'box', 'row', 'cap']);
    return { variant: rng.pick(JAVA_EQ[diff]), a, b, p, w1, w2, small: rng.int(1, 120), big: rng.int(200, 999), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  plan(c) { // what each line declares (shared by view and sim)
    const { variant: w, w1, w2, small, big } = c, W = w1 + w2;
    const k = ['bigInt', 'bigEquals', 'intLong', 'intLongEquals'].includes(w) ? big : small;
    return {
      litlit: { A: ['String', 'lit', W], B: ['String', 'lit', W], cmp: '==' },
      newlit: { A: ['String', 'lit', W], B: ['String', 'new', W], cmp: '==' },
      equalsNew: { A: ['String', 'lit', W], B: ['String', 'new', W], cmp: 'equals' },
      concat: { A: ['String', 'lit', W], P: ['String', 'lit', w1], B: ['String', 'concatVar', w2], cmp: '==' },
      constConcat: { A: ['String', 'lit', W], B: ['String', 'concatLit', [w1, w2]], cmp: '==' },
      smallInt: { A: ['Integer', 'box', k], B: ['Integer', 'box', k], cmp: '==' },
      bigInt: { A: ['Integer', 'box', k], B: ['Integer', 'box', k], cmp: '==' },
      bigEquals: { A: ['Integer', 'box', k], B: ['Integer', 'box', k], cmp: 'equals' },
      mixed: { A: ['int', 'prim', k], B: ['Integer', 'box', k], cmp: '==' },
      intLong: { A: ['Integer', 'box', k], B: ['Long', 'box', k], cmp: '==' },
      intLongEquals: { A: ['Integer', 'box', k], B: ['Long', 'box', k], cmp: 'equals' },
    }[w];
  },
  view(c) {
    const { variant: w, a, b, p } = c, pl = this.plan(c);
    const decl = (name, [t, how, val]) => `${t} ${name} = ${how === 'lit' ? `"${val}"` : how === 'new' ? `new String("${val}")` : how === 'concatVar' ? `${p} + "${val}"` : how === 'concatLit' ? `"${val[0]}" + "${val[1]}"` : t === 'Long' ? `${val}L` : val};`;
    const body = [decl(a, pl.A), ...(pl.P ? [decl(p, pl.P)] : []), decl(b, pl.B), `System.out.println(${pl.cmp === '==' ? `${a} == ${b}` : `${a}.equals(${b})`});`];
    const answer = { litlit: 'true', newlit: 'false', equalsNew: 'true', concat: 'false', constConcat: 'true', smallInt: 'true', bigInt: JAVA_UNSPEC, bigEquals: 'true', mixed: 'true', intLong: NO_COMPILE, intLongEquals: 'false' }[w];
    const choices = arrange(answer, ['true', 'false', JAVA_UNSPEC, NO_COMPILE], c.ord);
    const k = pl.A[2];
    const why = {
      litlit: 'Both are the same string **literal**, and Java interns literals: both names refer to one shared `String` object, so `==` (same object?) is `true`. Still, compare strings with `equals`.',
      newlit: '`new String(…)` always creates a **new** object. `==` on objects asks "same object?", not "same text?", so it is `false` even though the text matches. Use `equals` to compare text.',
      equalsNew: '`equals` compares the **text**, so a `new String` with the same characters is equal: `true`. (`==` would be `false`: two different objects.)',
      concat: `\`${p} + "${c.w2}"\` is worked out at run time (\`${p}\` is a variable, not a constant), and run-time concatenation creates a **new** \`String\` object. So \`==\` is \`false\` although the text is the same.`,
      constConcat: '`"' + c.w1 + '" + "' + c.w2 + '"` is a **constant expression**, joined by the compiler into the literal "' + c.w1 + c.w2 + '", which is interned like any literal. So both names refer to the same object: `true`. (Fragile: change one side to a variable and it becomes `false`.)',
      smallInt: `Autoboxing uses \`Integer.valueOf\`, which is guaranteed to return cached objects for -128 to 127. ${k} is in that range, so both names refer to the same object: \`true\`. Use \`equals\` anyway.`,
      bigInt: `${k} is outside -128 to 127, the only range the language guarantees to cache. Whether \`Integer.valueOf(${k})\` returns the same object twice depends on the JVM (with default settings it usually doesn't), so \`==\` here is not guaranteed. Compare boxed numbers with \`equals\`, or unbox them.`,
      bigEquals: `\`equals\` compares the **values** of the two \`Integer\` objects, so it is \`true\` whatever the cache does.`,
      mixed: `One side is a primitive \`int\`, so \`==\` **unboxes** the \`Integer\` and compares numbers: ${k} == ${k} is \`true\` (whatever the size).`,
      intLong: '`Integer` and `Long` are unrelated classes, so `==` between them is a compile error ("incomparable types: Integer and Long").',
      intLongEquals: '`Integer.equals` is only true for another `Integer` with the same value. A `Long` is a different class, so it is `false` even though both hold the same number.',
    }[w];
    return {
      code: inMain.java(body), ask: askPrint('java'), type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `${fmtAns(answer)}. ${why}`,
      hints: ['On objects (`String`, `Integer`, `Long`), `==` asks whether both names refer to the **same object**; `equals` compares the contents. On a primitive like `int`, `==` compares numbers.',
        'Literals and compile-time constants are shared; `new` and run-time concatenation make new objects; boxing is only guaranteed to share -128 to 127.'],
    };
  },
  sim(c) {
    // an object model: references have a class and an identity; `maybe` = identity not guaranteed
    const pool = new Map();
    let fresh = 0;
    const intern = s => { if (!pool.has(s)) pool.set(s, `s${fresh++}`); return pool.get(s); };
    const env = {};
    const make = ([t, how, val]) => {
      if (how === 'prim') return { prim: true, val };
      if (how === 'lit') return { cls: 'String', id: intern(val), val };
      if (how === 'new') return { cls: 'String', id: `n${fresh++}`, val };
      if (how === 'concatLit') return { cls: 'String', id: intern(val[0] + val[1]), val: val[0] + val[1] }; // folded by the compiler
      if (how === 'concatVar') return { cls: 'String', id: `n${fresh++}`, val: env.P.val + val }; // built at run time
      const cached = val >= -128 && val <= 127;
      return { cls: t, id: cached ? `${t}${val}` : `b${fresh++}`, maybe: !cached, val };
    };
    const pl = F['java-equals'].plan(c);
    env.A = make(pl.A); if (pl.P) env.P = make(pl.P); env.B = make(pl.B);
    const { A, B } = env;
    let out;
    if (pl.cmp === 'equals') out = String(A.cls === B.cls && A.val === B.val);
    else if (A.prim || B.prim) out = String(A.val === B.val); // unboxing: numbers compared
    else if (A.cls !== B.cls) out = NO_COMPILE;
    else if (A.id === B.id) out = 'true';
    else out = A.maybe && B.maybe && A.val === B.val ? JAVA_UNSPEC : 'false';
    return fmtAns(out);
  },
};

// int / int, casts, and negative operands (Math.floorDiv / floorMod); a double prints with ".0".
const JAVA_DIV = { medium: ['int', 'castFirst', 'castLate', 'lit', 'mod'], hard: ['int', 'mod', 'floorDiv', 'floorMod', 'castFirst'] };
F['java-intdiv'] = {
  lang: 'java', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const [a, b] = names(rng, [['total', 'sweets', 'minutes', 'points', 'coins'], ['people', 'groups', 'boxes', 'teams']]);
    const den = rng.pick([2, 4, 5, 8]);
    let num = rng.int(9, 59); if (num % den === 0) num++;
    if (diff === 'hard') num = -num;
    return { a, b, num, den, op: rng.pick(JAVA_DIV[diff]), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { a, b, num, den, op } = c;
    const e = { int: `${a} / ${b}`, castFirst: `(double) ${a} / ${b}`, castLate: `(double) (${a} / ${b})`, lit: `${a} / ${den}.0`, mod: `${a} % ${b}`, floorDiv: `Math.floorDiv(${a}, ${b})`, floorMod: `Math.floorMod(${a}, ${b})` }[op];
    const q = num / den, T = Math.trunc(q), Fl = Math.floor(q), M = num % den, P = ((num % den) + den) % den;
    const d = x => `${x}.0`;
    const kind = { int: 'T', castFirst: 'D', castLate: 'T', lit: 'D', mod: 'M', floorDiv: 'F', floorMod: 'P' }[op];
    const answer = { D: String(q), T: d(T), F: d(Fl), M: d(M), P: d(P) }[kind];
    const choices = arrange(answer, [String(q), d(T), d(Fl), d(M), d(P), String(T), String(Math.ceil(q)) + '.0'], c.ord);
    const work = {
      D: `${num} / ${den} worked out exactly is ${q}`,
      T: `${num} / ${den} = ${q}, and \`int\` division cuts off the decimals (towards zero): ${T}`,
      F: `\`Math.floorDiv\` rounds **down** (towards minus infinity): ${q} → ${Fl}`,
      M: `${num} = ${T} × ${den} + (${M}): \`%\` takes the sign of the left side`,
      P: `\`Math.floorMod\` gives a result with the sign of the divisor: ${num} = ${Fl} × ${den} + ${P}`,
    }[kind];
    return {
      code: inMain.java([`int ${a} = ${num};`, `int ${b} = ${den};`, `double result = ${e};`, 'System.out.println(result);']),
      ask: askPrint('java'), type: 'choice', answer: tk(answer), choices: choices.map(tk),
      explanation: `It prints **${answer}**: ${work}. The result is stored in a \`double\`, and \`println\` always prints a \`double\` with a decimal point (${kind === 'D' ? 'here the value has decimals anyway' : `so ${answer}, not ${answer.replace(/\.0$/, '')}`}).\n\n` +
        '`int / int` is whole-number division even when the result goes into a `double`: the division happens first. Cast one side **before** dividing (`(double) a / b`) or use a `double` literal (`a / 4.0`); `(double) (a / b)` casts too late.',
      hints: [`Both variables are \`int\`. Is \`${e}\` whole-number division, exact division, or a remainder?`, 'The value ends up in a `double`. How does Java print a `double` that holds a whole number?'],
    };
  },
  sim(c) {
    const d = divCount(c.num, c.den);
    const kind = { int: 'T', castFirst: 'D', castLate: 'T', lit: 'D', mod: 'M', floorDiv: 'F', floorMod: 'P' }[c.op];
    const v = { D: longDiv(c.num, c.den), T: String(d.trunc), F: String(d.floor), M: String(d.modTrunc), P: String(d.modFloor) }[kind];
    return tk(v.includes('.') ? v : `${v}.0`); // Double.toString keeps ".0" on a whole value
  },
};

// char arithmetic: char + int is an int; a String on the left joins text; += narrows back to char.
const JAVA_CHAR = { medium: ['plus', 'cast', 'strFirst', 'strLast'], hard: ['plus', 'cast', 'strFirst', 'two', 'inc', 'plusEq', 'assignPlus'] };
F['java-char'] = {
  lang: 'java', diffs: ['medium', 'hard'],
  make(rng, diff) {
    const ch = String.fromCharCode(rng.int(97, 116)), ch2 = String.fromCharCode(rng.int(97, 116));
    return { variant: rng.pick(JAVA_CHAR[diff]), v: rng.pick(['c', 'letter', 'initial', 'ch']), ch, ch2, k: rng.int(1, 5), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  // the printed expression as tokens, or a statement form
  form(c) {
    const { variant: w, v, ch2, k } = c;
    return {
      plus: { expr: [v, '+', k] }, cast: { expr: ['(char)', '(', v, '+', k, ')'] }, strFirst: { expr: ['""', '+', v, '+', k] },
      strLast: { expr: [v, '+', k, '+', '""'] }, two: { expr: [v, '+', `'${ch2}'`] },
      inc: { stmt: `${v}++;`, expr: [v] }, plusEq: { stmt: `${v} += ${k};`, expr: [v] }, assignPlus: { stmt: `${v} = ${v} + ${k};`, expr: [v] },
    }[w];
  },
  view(c) {
    const { variant: w, v, ch, ch2, k } = c, f = this.form(c);
    const code = ch.charCodeAt(0), shifted = String.fromCharCode(code + k);
    const answer = { plus: String(code + k), cast: shifted, strFirst: `${ch}${k}`, strLast: String(code + k), two: String(code + ch2.charCodeAt(0)), inc: String.fromCharCode(code + 1), plusEq: shifted, assignPlus: NO_COMPILE }[w];
    const wrongs = [String(code + k), shifted, `${ch}${k}`, NO_COMPILE, String(code), `${ch}${ch2}`, String.fromCharCode(code + 1)];
    const choices = arrange(answer, wrongs, c.ord);
    const body = [`char ${v} = '${ch}';`, ...(f.stmt ? [f.stmt] : []), `System.out.println(${f.expr.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace('(char)(', '(char) (')});`];
    const why = {
      plus: `A \`char\` is a number (its character code: '${ch}' is ${code}). \`char + int\` is an \`int\`, so it prints ${code} + ${k} = ${code + k}, not a letter.`,
      cast: `\`${v} + ${k}\` is the \`int\` ${code + k}; the \`(char)\` cast turns that code back into a character: '${shifted}'.`,
      strFirst: `\`+\` works left to right. \`"" + ${v}\` is a \`String\` ("${ch}"), and String + anything joins text, so it gives "${ch}${k}".`,
      strLast: `\`+\` works left to right: \`${v} + ${k}\` is worked out first as numbers (${code} + ${k} = ${code + k}), and only then joined with "".`,
      two: `Two \`char\`s added are added as numbers: ${code} + ${ch2.charCodeAt(0)} = ${code + ch2.charCodeAt(0)}. Use a \`String\` to join them.`,
      inc: `\`${v}++\` moves the \`char\` itself to the next code, so it is still a \`char\` and prints '${String.fromCharCode(code + 1)}'.`,
      plusEq: `A compound assignment like \`${v} += ${k}\` includes a hidden cast back to \`char\`, so it compiles and ${tk(v)} becomes '${shifted}'.`,
      assignPlus: `\`${v} + ${k}\` is an \`int\`, and Java won't store an \`int\` expression in a \`char\` without a cast ("possible lossy conversion from int to char"). \`${v} += ${k}\` or \`(char) (${v} + ${k})\` would compile.`,
    }[w];
    return {
      code: inMain.java(body), ask: askPrint('java'), type: 'choice', answer: fmtAns(answer), choices: choices.map(fmtAns),
      explanation: `${fmtAns(answer)}. ${why}`,
      hints: [`A \`char\` holds a character code ('a' is 97). What type is the result of each \`+\`?`, '`+` goes left to right: number + number adds; as soon as a `String` is involved it joins text. `println` prints an `int` as digits and a `char` as a letter.'],
    };
  },
  sim(c) {
    // typed evaluation: values are { t: 'char'|'int'|'String', v }
    const f = F['java-char'].form(c);
    let x = { t: 'char', v: c.ch.charCodeAt(0) };
    if (f.stmt) {
      if (c.variant === 'inc') x = { t: 'char', v: x.v + 1 };
      else if (c.variant === 'plusEq') x = { t: 'char', v: (x.v + c.k) & 0xffff }; // implicit narrowing cast
      else return NO_COMPILE; // int expression into a char variable needs a cast
    }
    const atom = tok => (tok === c.v ? x : tok === '""' ? { t: 'String', v: '' } : /^'.'$/.test(tok) ? { t: 'char', v: tok.charCodeAt(1) } : { t: 'int', v: tok });
    const show = y => (y.t === 'char' ? String.fromCharCode(y.v) : String(y.v));
    const add = (p, q) => (p.t === 'String' || q.t === 'String' ? { t: 'String', v: show(p) + show(q) } : { t: 'int', v: p.v + q.v });
    let toks = f.expr.slice(), cast = false;
    if (toks[0] === '(char)') { cast = true; toks = toks.slice(2, -1); }
    let acc = atom(toks[0]);
    for (let i = 1; i < toks.length; i += 2) acc = add(acc, atom(toks[i + 1]));
    if (cast) acc = { t: 'char', v: acc.v & 0xffff };
    return fmtAns(show(acc));
  },
};

F['java-avg-line'] = {
  lang: 'java', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, a, b] = names(rng, [['average', 'mean', 'perPerson', 'share'], ['total', 'sum', 'points'], ['count', 'n', 'people']]);
    const den = rng.pick([2, 4, 5, 8]);
    let num = rng.int(9, 59); if (num % den === 0) num++;
    return { f, a, b, num, den, ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { f, a, b, num, den } = c;
    const bug = `return ${a} / ${b}`, answer = `return (double)${a} / ${b}`;
    return {
      code: [`static double ${f}(int ${a}, int ${b}) {`, `    ${bug};`, '}', '', ...inMain.java([`System.out.println(${f}(${num}, ${den}));`])],
      lead: `\`${f}\` should return the exact average, so this should print **${num / den}**, but it prints **${Math.trunc(num / den)}.0**. ${NOTE.java}`,
      ask: rewriteAsk(diff, 2), type: 'text', answer, trail: ';', bug, lineNo: 2,
      alts: [`return (double) ${a} / ${b}`, `return ${a} / (double) ${b}`, `return ${a} / (double)${b}`, `return (double)${a} / (double)${b}`, `return 1.0 * ${a} / ${b}`, `return ${a} * 1.0 / ${b}`],
      distractors: [bug, `return (int)${a} / ${b}`, `return (double)${b} / ${a}`, `return ${a} % ${b}`, `return (double)(${a} / ${b})`],
      explanation: `Line 2 should be \`${answer};\`. Both parameters are \`int\`, so \`${a} / ${b}\` is whole-number division (${num} / ${den} → ${Math.trunc(num / den)}); the \`double\` return type only turns that already-cut result into ${Math.trunc(num / den)}.0. Casting one side to \`double\` **before** dividing makes it a \`double\` division: ${num / den}. (\`(double) (${a} / ${b})\` would cast too late.)`,
      hints: [`What type is \`${a} / ${b}\` when both sides are \`int\`? The return type doesn't change how the division is done.`, 'Make one side of the division a `double` before the division happens.', 'A cast such as `(double)` applies to the value right after it.'],
    };
  },
  sim(c) {
    const tests = [[c.num, c.den], [7, 2], [9, 4], [21, 8]];
    return {
      ok(line) {
        const m = stripMark(line).match(/^return\s+(.+)$/);
        if (!m) return false;
        const src = m[1].replace(/\(double\)\s*/g, '(double)').replace(/\(int\)\s*/g, '(int)');
        return tests.every(([x, y]) => { try { const v = evalTyped(src, { [c.a]: x, [c.b]: y }, 'cs'); return v.t === 'd' && v.v === x / y; } catch { return false; } });
      },
    };
  },
};

F['java-equals-line'] = {
  lang: 'java', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [f, [x, y], s, t] = names(rng, [['sameCode', 'matches', 'isSame', 'sameName'], [['a', 'b'], ['x', 'y'], ['first', 'second']], ['saved', 'stored', 'expected'], ['typed', 'entered', 'given']]);
    const w = rng.pick(['ab12', 'kim', 'tiger', 'k9x', 'blue']);
    return { f, x, y, s, t, w, how: rng.pick(['new', 'concat']), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { f, x, y, s, t, w, how } = c;
    const bug = `return ${x} == ${y}`, answer = `return ${x}.equals(${y})`;
    const second = how === 'new' ? `String ${t} = new String("${w}");` : `String ${t} = ${s}.substring(0, 1) + "${w.slice(1)}";`;
    return {
      code: [`static boolean ${f}(String ${x}, String ${y}) {`, `    ${bug};`, '}', '', ...inMain.java([`String ${s} = "${w}";`, second, `System.out.println(${f}(${s}, ${t}));`])],
      lead: `\`${f}\` should be \`true\` when the two strings have the same text, so this should print **true**. It prints **false**. ${NOTE.java}`,
      ask: rewriteAsk(diff, 2, 'it compares the text'), type: 'text', answer, trail: ';', bug, lineNo: 2,
      alts: [`return ${y}.equals(${x})`, `return Objects.equals(${x}, ${y})`, `return ${x}.compareTo(${y}) == 0`],
      distractors: [bug, `return ${x} = ${y}`, `return ${x}.equals(${x})`, `return ${x} != ${y}`, `return ${x}.length() == ${y}.length()`],
      explanation: `Line 2 should be \`${answer};\`. On objects, \`==\` asks whether both names refer to the **same object**. ${how === 'new' ? '`new String(…)` always makes a new object' : 'Joining strings at run time makes a new object'}, so \`${s} == ${t}\` is \`false\` even though the text matches. \`equals\` compares the characters.`,
      hints: ['What does `==` compare when both sides are `String` objects?', `Are \`${s}\` and \`${t}\` the same object? ${how === 'new' ? '`new` always creates one.' : 'Run-time concatenation creates one.'}`, '`String` has a method that compares the text.'],
    };
  },
  sim(c) {
    // strings as { id, text }: tests cover equal text in different objects, the same object, and different text
    const tests = [[{ id: 1, text: c.w }, { id: 2, text: c.w }, true], [{ id: 1, text: c.w }, { id: 1, text: c.w }, true], [{ id: 1, text: c.w }, { id: 3, text: c.w + 'z' }, false], [{ id: 4, text: 'ab' }, { id: 5, text: 'ba' }, false]];
    const P = `(${c.x}|${c.y})`;
    const forms = [
      [new RegExp(`^${P}\\s*==\\s*${P}$`), (p, q) => p.id === q.id], [new RegExp(`^${P}\\s*!=\\s*${P}$`), (p, q) => p.id !== q.id],
      [new RegExp(`^${P}\\.equals\\(\\s*${P}\\s*\\)$`), (p, q) => p.text === q.text], [new RegExp(`^Objects\\.equals\\(\\s*${P}\\s*,\\s*${P}\\s*\\)$`), (p, q) => p.text === q.text],
      [new RegExp(`^${P}\\.compareTo\\(\\s*${P}\\s*\\)\\s*==\\s*0$`), (p, q) => p.text === q.text],
    ];
    return {
      ok(line) {
        const m = stripMark(line).match(/^return\s+(.+)$/);
        if (!m) return false;
        for (const [re, fn] of forms) {
          const r = m[1].trim().match(re);
          if (!r) continue;
          if (r[1] === r[2]) return false; // compares a parameter with itself
          return tests.every(([p, q, want]) => { const args = { [c.x]: p, [c.y]: q }; return fn(args[r[1]], args[r[2]]) === want; });
        }
        return false;
      },
    };
  },
};

// ---- Go ----
const goList = xs => `[${xs.join(' ')}]`;
// Slices share a backing array. append reuses it while the capacity allows and makes a new one
// otherwise (only known capacities are used: a literal, make with a capacity, or a slice of those).
const GO_SLICE = { medium: ['literal', 'make', 'sub'], hard: ['subAppend', 'fullSlice', 'make', 'literal'], expert: ['x13', 'x133', 'x02', 'x2', 'x13two'] };
F['go-slice'] = {
  lang: 'go', diffs: ['medium', 'hard', 'expert'],
  make(rng, diff) {
    const [a, b] = names(rng, [['a', 'base', 'orig', 'nums'], ['b', 'view', 'more', 'part']]);
    return { variant: rng.pick(GO_SLICE[diff]), a, b, vals: Array.from({ length: 4 }, () => rng.int(1, 9)), w: rng.int(10, 30), z: rng.int(31, 60), ord: rng.shuffle([0, 1, 2, 3]), ord2: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c, diff) {
    const { variant: w, a, b, vals, w: W, z: Z } = c;
    const v3 = vals.slice(0, 3);
    if (diff === 'expert') {
      // b := a[lo:hi(:max)], append 1 or 2 values, then b[0] = W; print a and b
      const spec = { x13: [1, 3, null, 1], x133: [1, 3, 3, 1], x02: [0, 2, null, 1], x2: [2, 4, null, 1], x13two: [1, 3, null, 2] }[w];
      const [lo, hi, max, k] = spec;
      const cap = (max ?? 4) - lo, len = hi - lo;
      const shared = len + k <= cap;
      const adds = k === 1 ? [Z] : [Z, Z + 1];
      const A = vals.slice(), Bv = A.slice(lo, hi).concat(adds);
      if (shared) { adds.forEach((x, j) => { A[hi + j] = x; }); A[lo] = W; }
      Bv[0] = W;
      const sliceTxt = `${a}[${lo || ''}:${hi === 4 ? '' : hi}${max ? `:${max}` : ''}]`;
      const code = inMain.go([`${a} := []int{${vals.join(', ')}}`, `${b} := ${sliceTxt}`, `${b} = append(${b}, ${adds.join(', ')})`, `${b}[0] = ${W}`, `fmt.Println(${a})`, `fmt.Println(${b})`]);
      const unshared = vals.slice(); const sharedA = vals.slice(); adds.forEach((x, j) => { if (hi + j < 4) sharedA[hi + j] = x; }); sharedA[lo] = W;
      const aCh = arrange(goList(A), [goList(unshared), goList(sharedA), goList(vals.map((x, j) => (j === lo ? W : x))), goList([...vals.slice(0, hi), ...adds].slice(0, 4)), goList([...vals, ...adds]), goList(vals.map((x, j) => (j === 0 ? W : x)))], c.ord);
      const bCh = arrange(goList(Bv), [goList(vals.slice(lo, hi).concat(adds)), goList(vals.slice(lo, hi)), goList([W, ...vals.slice(lo + 1, hi)]), goList([W, ...adds]), goList([...vals.slice(lo, hi), W])], c.ord2);
      if (!aCh || !bCh) return null;
      return {
        code, ask: `What do the two lines print? ${NOTE.go}`, type: 'multi',
        parts: [
          { id: 'a', label: 'First line', ask: `What does \`fmt.Println(${a})\` print?`, answerType: 'choice', answer: tk(goList(A)), choices: aCh.map(tk), hint: `\`${sliceTxt}\` shares ${tk(a)}'s array. Its capacity runs to ${max ? `index ${max} (the third number)` : 'the end of the array'}. Does the append fit in that capacity?` },
          { id: 'b', label: 'Second line', ask: `What does \`fmt.Println(${b})\` print?`, answerType: 'choice', answer: tk(goList(Bv)), choices: bCh.map(tk), hint: `${tk(b)} holds the ${len} sliced values plus what was appended; then its first item is set to ${W}.` },
        ],
        explanation: `It prints **${goList(A)}** then **${goList(Bv)}**. \`${sliceTxt}\` has length ${len} and capacity ${cap} (${max ? 'the third index caps it' : `from index ${lo} to the end of the array`}). ` +
          (shared ? `Appending ${k} value${k > 1 ? 's' : ''} fits in that capacity, so \`append\` writes **into ${tk(a)}'s array** (overwriting what was there), and \`${b}[0] = ${W}\` changes ${tk(a)}[${lo}] too.`
            : `Appending ${k} value${k > 1 ? 's' : ''} does not fit, so \`append\` copies everything to a **new** array; after that ${tk(b)} and ${tk(a)} are separate and \`${b}[0] = ${W}\` leaves ${tk(a)} alone.`),
      };
    }
    let code, answer, why, wrongs, ask;
    if (w === 'literal' || w === 'make') {
      const decl = w === 'literal' ? [`${a} := []int{${v3.join(', ')}}`] : [`${a} := make([]int, 3, 5)`, `${a}[0] = ${v3[0]}`];
      code = inMain.go([...decl, `${b} := append(${a}, ${Z})`, `${b}[0] = ${W}`, `fmt.Println(${a}[0], ${b}[0])`]);
      const shared = w === 'make';
      answer = `${shared ? W : v3[0]} ${W}`;
      wrongs = [`${v3[0]} ${W}`, `${W} ${W}`, `${v3[0]} ${v3[0]}`, `${W} ${v3[0]}`];
      why = shared ? `\`make([]int, 3, 5)\` has length 3 but capacity 5, so \`append\` has room: it writes the new value into the **same** array and returns a slice of it. ${tk(a)} and ${tk(b)} share their first item, so \`${b}[0] = ${W}\` changes both.`
        : `A slice literal has capacity equal to its length (3), so \`append\` has no room: it copies the items to a **new** array. ${tk(b)} is separate from ${tk(a)}, so \`${b}[0] = ${W}\` leaves ${tk(a)}[0] as ${v3[0]}.`;
      ask = askPrint('go');
    } else if (w === 'sub') {
      code = inMain.go([`${a} := []int{${vals.join(', ')}}`, `${b} := ${a}[1:3]`, `${b}[0] = ${W}`, `fmt.Println(${a})`]);
      const A = vals.slice(); A[1] = W;
      answer = goList(A);
      wrongs = [goList(vals), goList(A), goList([W, ...vals.slice(1)]), goList([vals[0], vals[1], W, vals[3]])];
      why = `\`${a}[1:3]\` doesn't copy: ${tk(b)} is a window onto ${tk(a)}'s array starting at index 1. So \`${b}[0]\` **is** \`${a}[1]\`.`;
      ask = askPrint('go');
    } else {
      // subAppend: b := a[:2] has capacity 4, so append overwrites a[2]; fullSlice: a[:2:2] caps it at 2
      const full = w === 'fullSlice';
      code = inMain.go([`${a} := []int{${vals.join(', ')}}`, `${b} := ${a}[:2${full ? ':2' : ''}]`, `${b} = append(${b}, ${Z})`, `fmt.Println(${a})`]);
      const A = vals.slice(); if (!full) A[2] = Z;
      answer = goList(A);
      wrongs = [goList(vals), goList([...vals.slice(0, 2), Z, vals[3]]), goList([...vals, Z]), goList([...vals.slice(0, 2), Z])];
      why = full ? `\`${a}[:2:2]\` is a full slice expression: the third number caps the capacity at 2, so \`append\` has no room and copies to a new array. ${tk(a)} is unchanged.`
        : `\`${a}[:2]\` has length 2 but capacity 4 (up to the end of ${tk(a)}'s array). \`append\` has room, so it writes ${Z} into that array at index 2, **overwriting** \`${a}[2]\`.`;
      ask = askPrint('go');
    }
    const choices = arrange(answer, wrongs, c.ord);
    if (!choices) return null;
    return {
      code, ask, type: 'choice', answer: tk(answer), choices: choices.map(tk), explanation: `It prints **${answer}**. ${why}`,
      hints: ['A slice is a view onto an array: a start, a length and a capacity. Slicing and assigning a slice never copy the items.', '`append` writes into the same array when the capacity has room, and copies to a new array when it doesn\'t. What is the capacity here?'],
    };
  },
  sim(c, diff) {
    // backing-array model: a slice is { arr, off, len, cap }
    const mk = xs => ({ arr: xs.slice(), off: 0, len: xs.length, cap: xs.length });
    const slice = (s, lo, hi, max) => ({ arr: s.arr, off: s.off + lo, len: hi - lo, cap: (max ?? s.cap) - lo });
    const append = (s, xs) => {
      if (s.len + xs.length <= s.cap) { xs.forEach((x, j) => { s.arr[s.off + s.len + j] = x; }); return { ...s, len: s.len + xs.length }; }
      const arr = [...s.arr.slice(s.off, s.off + s.len), ...xs];
      return { arr, off: 0, len: arr.length, cap: arr.length }; // (a new array; its exact capacity is never printed)
    };
    const set = (s, i, v) => { s.arr[s.off + i] = v; };
    const get = (s, i) => s.arr[s.off + i];
    const show = s => goList(s.arr.slice(s.off, s.off + s.len));
    const { vals, w: W, z: Z } = c;
    if (diff === 'expert') {
      const [lo, hi, max, k] = { x13: [1, 3, null, 1], x133: [1, 3, 3, 1], x02: [0, 2, null, 1], x2: [2, 4, null, 1], x13two: [1, 3, null, 2] }[c.variant];
      const A = mk(vals);
      let B = slice(A, lo, hi, max ?? undefined);
      B = append(B, k === 1 ? [Z] : [Z, Z + 1]);
      set(B, 0, W);
      return { a: tk(show(A)), b: tk(show(B)) };
    }
    if (c.variant === 'literal' || c.variant === 'make') {
      const A = c.variant === 'literal' ? mk(vals.slice(0, 3)) : { arr: [vals[0], 0, 0, 0, 0], off: 0, len: 3, cap: 5 };
      const B = append(A, [Z]); set(B, 0, W);
      return tk(`${get(A, 0)} ${get(B, 0)}`);
    }
    const A = mk(vals);
    if (c.variant === 'sub') { const B = slice(A, 1, 3); set(B, 0, W); return tk(show(A)); }
    append(slice(A, 0, 2, c.variant === 'fullSlice' ? 2 : undefined), [Z]);
    return tk(show(A));
  },
};

// Zero values: a missing map key reads as 0, a declared struct starts with zero fields.
F['go-zero'] = {
  lang: 'go', diffs: ['medium'],
  make(rng) {
    const words = rng.shuffle(['red', 'blue', 'green', 'gold', 'pink']).slice(0, 3);
    const list = Array.from({ length: rng.int(4, 6) }, () => rng.pick(words));
    const missing = rng.pick(['grey', 'teal', 'plum']);
    return { variant: rng.pick(['map', 'map', 'struct', 'counter']), words, list, ask: rng.next() < 0.5 ? missing : rng.pick(list),
      m: rng.pick(['counts', 'seen', 'tally']), T: rng.pick(['Point', 'Pos', 'Cell']), p: rng.pick(['p', 'pos', 'cell']), k: rng.int(2, 9), j: rng.int(2, 9) };
  },
  view(c) {
    const { variant: w, list, ask, m, T, p, k, j } = c;
    if (w === 'struct') {
      return {
        code: [`type ${T} struct {`, '    X, Y int', '}', '', ...inMain.go([`var ${p} ${T}`, `${p}.X += ${k}`, `fmt.Println(${p}.Y*10 + ${p}.X)`])],
        ask: askPrint('go'), type: 'number', answer: k,
        explanation: `It prints **${k}**. \`var ${p} ${T}\` gives a struct whose fields hold their **zero values**: X and Y are both 0. \`${p}.X += ${k}\` makes X ${k}; Y stays 0, so 0 × 10 + ${k} = ${k}.`,
        hints: ['What does a variable declared with `var` and no value hold in Go?', 'Every field of a new struct starts at its zero value: 0 for numbers.'],
      };
    }
    if (w === 'counter') {
      return {
        code: inMain.go([`var total int`, `for i := 1; i <= ${j}; i++ {`, `    total += i * ${k}`, '}', 'fmt.Println(total)']),
        ask: askPrint('go'), type: 'number', answer: k * (j * (j + 1)) / 2,
        explanation: `It prints **${k * (j * (j + 1)) / 2}**. \`var total int\` starts at the zero value 0, then adds ${k} × (1 + 2 + … + ${j}).`,
        hints: ['`var total int` with no value starts at 0.', `Add up ${k} × i for i from 1 to ${j}.`],
      };
    }
    const n = list.filter(x => x === ask).length;
    return {
      code: inMain.go([`words := []string{${list.map(x => `"${x}"`).join(', ')}}`, `${m} := map[string]int{}`, 'for _, w := range words {', `    ${m}[w]++`, '}', `fmt.Println(${m}["${ask}"])`]),
      ask: askPrint('go'), type: 'number', answer: n,
      explanation: `It prints **${n}**. ${n ? `"${ask}" appears ${n} time${n > 1 ? 's' : ''} in the list. Each \`${m}[w]++\` reads the current count (0 the first time: a missing key reads as the zero value) and adds 1.` : `"${ask}" never appears, so it is not in the map. Reading a missing key doesn't fail in Go: it gives the zero value of the map's value type, 0.`}`,
      hints: [`Count how many times "${ask}" appears in the list. If it never appears, what does reading a key that is not in a Go map give you?`, 'A missing key reads as the zero value of the map\'s value type, which is also why `m[w]++` works the first time.'],
    };
  },
  sim(c) {
    if (c.variant === 'struct') { const p = { X: 0, Y: 0 }; p.X += c.k; return p.Y * 10 + p.X; }
    if (c.variant === 'counter') { let t = 0; for (let i = 1; i <= c.j; i++) t += i * c.k; return t; }
    const m = new Map();
    for (const w of c.list) m.set(w, (m.get(w) ?? 0) + 1);
    return m.has(c.ask) ? m.get(c.ask) : 0;
  },
};

// := in an inner block declares a NEW variable that shadows the outer one.
const GO_SHADOW = { medium: ['ifDecl', 'ifAssign', 'ifDecl', 'ifFalse'], hard: ['loopDecl', 'loopAssign', 'ifDecl', 'ifAssign'], expert: ['multiBlock', 'multiSame'] };
F['go-shadow'] = {
  lang: 'go', diffs: ['medium', 'hard', 'expert'],
  make(rng, diff) {
    const [x, lim] = names(rng, [['count', 'total', 'level', 'score'], ['limit', 'bound', 'cutoff']]);
    return { variant: rng.pick(GO_SHADOW[diff]), x, lim, A: rng.int(1, 9), K: rng.int(10, 20), L: rng.int(3, 9), xs: randList(rng, 3, 4, 1, 9), E: rng.int(2, 6) };
  },
  // statements for the scope model (and the renderer)
  prog(c) {
    const { variant: w, x, lim, A, K, L, xs, E } = c;
    const V = n => ({ v: n }), N = n => ({ n }), ADD = (p, q) => ({ add: [p, q] });
    const ifBody = decl => [{ k: decl ? 'decl' : 'assign', names: [x], vals: [ADD(V(x), N(K))] }, { k: 'print', e: V(x) }];
    return {
      ifDecl: [{ k: 'decl', names: [x], vals: [N(A)] }, { k: 'decl', names: [lim], vals: [N(L)] }, { k: 'if', cond: [lim, '>', 2], body: ifBody(true) }, { k: 'print', e: V(x) }],
      ifFalse: [{ k: 'decl', names: [x], vals: [N(A)] }, { k: 'decl', names: [lim], vals: [N(L)] }, { k: 'if', cond: [lim, '>', 10], body: ifBody(false) }, { k: 'print', e: V(x) }],
      ifAssign: [{ k: 'decl', names: [x], vals: [N(A)] }, { k: 'decl', names: [lim], vals: [N(L)] }, { k: 'if', cond: [lim, '>', 2], body: ifBody(false) }, { k: 'print', e: V(x) }],
      loopDecl: [{ k: 'decl', names: [x], vals: [N(0)] }, { k: 'range', list: xs, v: 'v', body: [{ k: 'decl', names: [x], vals: [ADD(V(x), V('v'))] }, { k: 'print', e: V(x) }] }, { k: 'print', e: V(x) }],
      loopAssign: [{ k: 'decl', names: [x], vals: [N(0)] }, { k: 'range', list: xs, v: 'v', body: [{ k: 'assign', names: [x], vals: [ADD(V(x), V('v'))] }, { k: 'print', e: V(x) }] }, { k: 'print', e: V(x) }],
      multiBlock: [{ k: 'decl', names: [x], vals: [N(A)] }, { k: 'if', cond: [x, '>', 0], body: [{ k: 'decl', names: [x, 'extra'], vals: [N(K), N(E)] }, { k: 'print', e: ADD(V(x), V('extra')) }] }, { k: 'print', e: V(x) }],
      multiSame: [{ k: 'decl', names: [x], vals: [N(A)] }, { k: 'decl', names: [x, 'extra'], vals: [N(K), N(E)] }, { k: 'print', e: ADD(V(x), V('extra')) }, { k: 'print', e: V(x) }],
    }[w];
  },
  lines(stmts) {
    const ex = e => (e.v !== undefined ? e.v : e.n !== undefined ? String(e.n) : `${ex(e.add[0])} + ${ex(e.add[1])}`);
    const out = [];
    const emit = (s, pad) => {
      if (s.k === 'decl' || s.k === 'assign') out.push(`${pad}${s.names.join(', ')} ${s.k === 'decl' ? ':=' : '='} ${s.vals.map(ex).join(', ')}`);
      else if (s.k === 'print') out.push(`${pad}fmt.Println(${ex(s.e)})`);
      else if (s.k === 'if') { out.push(`${pad}if ${s.cond.join(' ')} {`); s.body.forEach(b => emit(b, pad + '    ')); out.push(`${pad}}`); }
      else if (s.k === 'range') { out.push(`${pad}for _, ${s.v} := range []int{${s.list.join(', ')}} {`); s.body.forEach(b => emit(b, pad + '    ')); out.push(`${pad}}`); }
    };
    stmts.forEach(s => emit(s, ''));
    return inMain.go(out);
  },
  view(c, diff) {
    const { variant: w, x, A, K, L, xs, E } = c;
    const code = this.lines(this.prog(c));
    if (diff === 'expert') {
      const same = w === 'multiSame';
      const inner = K + E, outer = same ? K : A;
      return {
        code, ask: `What do the two lines print? ${NOTE.go}`, type: 'multi',
        parts: [
          { id: 'first', label: 'First line', ask: `What does the first \`fmt.Println\` print?`, answerType: 'number', answer: inner, tolerance: 0, hint: `Inside that block, ${tk(x)} and \`extra\` hold the values just given to them.` },
          { id: 'second', label: 'Second line', ask: `What does the last \`fmt.Println(${x})\` print?`, answerType: 'number', answer: outer, tolerance: 0, hint: `Does \`${x}, extra := …\` change the existing ${tk(x)} or declare a new one? It depends on whether ${tk(x)} was declared in the **same** block.` },
        ],
        explanation: `It prints **${inner}** then **${outer}**. \`:=\` with several names needs at least one new name; any name **already declared in the same block** is simply assigned. ` +
          (same ? `Here \`${x}, extra :=\` is in the same block as \`${x} := ${A}\`, so it assigns ${K} to that ${tk(x)} and only \`extra\` is new.`
            : `Here it is inside the \`if\` block, where ${tk(x)} has not been declared yet, so \`:=\` declares a **new** ${tk(x)} (and \`extra\`) that shadows the outer one. The outer ${tk(x)} stays ${A}.`),
      };
    }
    const loop = w.startsWith('loop'), decl = w === 'ifDecl' || w === 'loopDecl', ran = w !== 'ifFalse';
    const answer = loop ? (decl ? 0 : sum(xs)) : (ran && !decl ? A + K : A);
    const why = loop
      ? (decl ? `Inside the loop, \`${x} := ${x} + v\` declares a **new** ${tk(x)} on every pass. Its right-hand side reads the outer ${tk(x)} (still 0), and the new variable disappears at the end of the pass. The outer ${tk(x)} is never changed, so the last line prints 0.`
        : `\`${x} = ${x} + v\` assigns to the outer ${tk(x)}, so it collects ${xs.join(' + ')} = ${sum(xs)}.`)
      : !ran ? `The condition is false (${L} is not more than 10), so the block never runs and ${tk(x)} keeps ${A}.`
        : decl ? `\`${x} := ${x} + ${K}\` inside the \`if\` declares a **new** ${tk(x)} that shadows the outer one until the \`}\`. (Its right-hand side still reads the outer ${tk(x)}, so the inner line prints ${A + K}.) After the block the outer ${tk(x)} is back in view, unchanged: ${A}.`
          : `\`${x} = ${x} + ${K}\` (with \`=\`) assigns to the outer ${tk(x)}, so it becomes ${A + K}.`;
    return {
      code, ask: `What does the **last** line print? ${NOTE.go}`, type: 'number', answer,
      explanation: `It prints **${answer}**. ${why}`,
      hints: ['Compare `:=` and `=`: `:=` declares a new variable in the current block; `=` assigns to the one that already exists.', 'A variable declared inside `{ … }` disappears at the closing brace. Which variable does the last line read?'],
    };
  },
  sim(c, diff) {
    // scope model: := assigns names already declared in THIS block and declares the rest; = finds the nearest
    const out = [];
    const find = (sc, n) => { for (let s = sc; s; s = s.up) if (s.vars.has(n)) return s; throw new Error('undefined ' + n); };
    const ev = (sc, e) => (e.n !== undefined ? e.n : e.v !== undefined ? find(sc, e.v).vars.get(e.v) : ev(sc, e.add[0]) + ev(sc, e.add[1]));
    const run = (sc, body) => body.forEach(s => {
      if (s.k === 'decl' || s.k === 'assign') {
        const vals = s.vals.map(e => ev(sc, e)); // right-hand side first
        s.names.forEach((n, j) => { const home = s.k === 'decl' ? sc : find(sc, n); home.vars.set(n, vals[j]); });
      } else if (s.k === 'print') out.push(ev(sc, s.e));
      else if (s.k === 'if') { const [n, , lim] = s.cond; if (find(sc, n).vars.get(n) > lim) run({ vars: new Map(), up: sc }, s.body); }
      else if (s.k === 'range') for (const v of s.list) run({ vars: new Map([[s.v, v]]), up: sc }, s.body);
    });
    run({ vars: new Map(), up: null }, F['go-shadow'].prog(c));
    if (diff === 'expert') return { first: out[0], second: out[out.length - 1] };
    return out[out.length - 1];
  },
};

// for _, p := range copies each element; Go 1.22 gives each loop pass its own variable.
const GO_RANGE = { hard: ['copy', 'copy', 'index', 'pointer', 'ptrSlice'], expert: ['closureHead', 'closureOuter', 'copy', 'ptrSlice', 'closureHead'] };
F['go-range-copy'] = {
  lang: 'go', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [T, list] = rng.pick([['Player', 'players'], ['Item', 'items'], ['Team', 'teams']]);
    return { variant: rng.pick(GO_RANGE[diff]), T, list, s0: rng.int(1, 9), s1: rng.int(1, 9), bonus: rng.int(2, 9), N: rng.int(3, 4), K: rng.int(2, 5), ord: rng.shuffle([0, 1, 2, 3]) };
  },
  view(c) {
    const { variant: w, T, list, s0, s1, bonus, N, K } = c;
    if (w.startsWith('closure')) {
      const head = w === 'closureHead' ? [`for i := 0; i < ${N}; i++ {`] : ['i := 0', `for i < ${N} {`];
      const step = w === 'closureHead' ? [] : ['    i++'];
      const code = inMain.go(['var funcs []func() int', ...head, `    funcs = append(funcs, func() int { return i * ${K} })`, ...step, '}', 'total := 0', 'for _, f := range funcs {', '    total += f()', '}', 'fmt.Println(total)']);
      const per = K * (N * (N - 1)) / 2, shared = N * N * K;
      const answer = w === 'closureHead' ? per : shared;
      return {
        code, ask: askPrint('go'), type: 'number', answer,
        explanation: `It prints **${answer}**. ` + (w === 'closureHead'
          ? `Since Go 1.22, a variable declared in a \`for\` header is a **new variable on every pass**, so each function keeps its own \`i\` (0, 1, …, ${N - 1}): ${K} × (${Array.from({ length: N }, (_, j) => j).join(' + ')}) = ${per}. (Before Go 1.22 all of them shared one \`i\` and this printed ${shared}.)`
          : `Here \`i\` is declared **before** the loop, so there is only one \`i\`, shared by every function. They run after the loop, when \`i\` is ${N}: ${N} × ${N} × ${K} = ${shared}.`),
        hints: ['The functions run after the loop has finished. Which `i` does each one read: its own, or one shared variable?', 'Since Go 1.22, `for i := …; …; …` gives every pass its own `i`; a variable declared before the loop is shared.'],
      };
    }
    const decl = [`type ${T} struct {`, '    Name  string', '    Score int', '}', ''];
    const lit = `{"ann", ${s0}}, {"bob", ${s1}}`;
    const loops = {
      copy: [`for _, p := range ${list} {`, `    p.Score += ${bonus}`, '    fmt.Println(p.Name, p.Score)', '}'],
      index: [`for i := range ${list} {`, `    ${list}[i].Score += ${bonus}`, `    fmt.Println(${list}[i].Name, ${list}[i].Score)`, '}'],
      pointer: [`for i := range ${list} {`, `    p := &${list}[i]`, `    p.Score += ${bonus}`, '    fmt.Println(p.Name, p.Score)', '}'],
      ptrSlice: [`for _, p := range ${list} {`, `    p.Score += ${bonus}`, '    fmt.Println(p.Name, p.Score)', '}'],
    }[w];
    const code = [...decl, ...inMain.go([`${list} := []${w === 'ptrSlice' ? '*' : ''}${T}{${lit}}`, ...loops, `fmt.Println(${list}[0].Score)`])];
    const changes = w !== 'copy';
    const answer = changes ? s0 + bonus : s0;
    return {
      code, ask: `What does the **last** line print? ${NOTE.go}`, type: 'number', answer,
      explanation: `It prints **${answer}**. ` + {
        copy: `\`for _, p := range ${list}\` gives \`p\` a **copy** of each struct. \`p.Score += ${bonus}\` changes the copy (the line inside the loop prints the raised score), but the slice keeps the original, so \`${list}[0].Score\` is still ${s0}.`,
        index: `\`${list}[i].Score += ${bonus}\` writes straight into the slice's element, so it changes: ${s0} + ${bonus} = ${answer}.`,
        pointer: `\`p := &${list}[i]\` is a pointer to the element itself, so \`p.Score += ${bonus}\` changes the slice: ${s0} + ${bonus} = ${answer}.`,
        ptrSlice: `The slice holds **pointers** (\`[]*${T}\`). Ranging copies each pointer, but a copied pointer still points at the same struct, so the change shows: ${s0} + ${bonus} = ${answer}.`,
      }[w],
      hints: ['In `for _, p := range xs`, is `p` the element itself or a copy of it?', 'Writing through the slice (`xs[i].Score`) or through a pointer changes the element; changing a copy doesn\'t.'],
    };
  },
  sim(c) {
    if (c.variant.startsWith('closure')) {
      const fns = [];
      if (c.variant === 'closureHead') { for (let b = { v: 0 }; b.v < c.N; b = { v: b.v + 1 }) { const cur = b; fns.push(() => cur.v * c.K); } } // a fresh i per pass (Go 1.22)
      else { const b = { v: 0 }; while (b.v < c.N) { fns.push(() => b.v * c.K); b.v++; } }
      return fns.reduce((t, f) => t + f(), 0);
    }
    // structs are values (copied on assignment); a pointer slice holds references
    const structs = [{ Score: c.s0 }, { Score: c.s1 }];
    const slice = c.variant === 'ptrSlice' ? structs : structs.map(s => ({ ...s }));
    for (let i = 0; i < slice.length; i++) {
      const p = c.variant === 'copy' ? { ...slice[i] } : slice[i]; // copy: range value; index/pointer/ptrSlice: the element itself
      p.Score += c.bonus;
    }
    return slice[0].Score;
  },
};

F['go-append-line'] = {
  lang: 'go', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [xs] = names(rng, [['scores', 'ids', 'sizes', 'queue']]);
    return { xs, vals: randList(rng, 2, 4, 1, 9), v: rng.int(10, 30), show: rng.pick(['len', 'last']), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { xs, vals, v, show } = c;
    const bug = `append(${xs}, ${v})`, answer = `${xs} = append(${xs}, ${v})`;
    const want = show === 'len' ? vals.length + 1 : v;
    const printed = show === 'len' ? `len(${xs})` : `${xs}[len(${xs})-1]`;
    return {
      code: inMain.go([`${xs} := []int{${vals.join(', ')}}`, bug, `fmt.Println(${printed})`]),
      lead: diff === 'expert' ? `This program does not compile. With the fix it should print **${want}**. ${NOTE.go}`
        : `Line 3 fails to compile: \`${bug} (value of type []int) is not used\`. With the fix it should print **${want}**. ${NOTE.go}`,
      ask: rewriteAsk(diff, 3, 'the program compiles'), type: 'text', answer, trail: '', bug, lineNo: 3,
      alts: [],
      distractors: [bug, `${xs} := append(${xs}, ${v})`, `append(&${xs}, ${v})`, `${xs}.append(${v})`, `${xs} = append(${v}, ${xs})`],
      explanation: `Line 3 should be \`${answer}\`. \`append\` doesn't change the slice you pass in: it **returns** a new slice header (and may even copy the items to a new array), so its result must be stored, and Go rejects a call whose result is thrown away. \`:=\` would not work here: \`${xs}\` already exists in this block, so there would be no new variable on the left.`,
      hints: ['Read the error: the value `append` returns is not used.', '`append` returns the longer slice; it can\'t change the variable you passed in.', `Store the result back in ${tk(xs)}, with the assignment operator that doesn't declare a new variable.`],
    };
  },
  sim(c) {
    const re = /^(\w+)\s*(:=|=)\s*append\(\s*(\w+)\s*,\s*(-?\d+)\s*\)$/;
    return {
      ok(line) {
        const m = stripMark(line).match(re);
        if (!m) return false;
        if (m[2] === ':=') return false; // no new variable on the left side of :=
        if (m[1] !== c.xs || m[3] !== c.xs || Number(m[4]) !== c.v) return false;
        const after = [...c.vals, Number(m[4])];
        return (c.show === 'len' ? after.length : after[after.length - 1]) === (c.show === 'len' ? c.vals.length + 1 : c.v);
      },
    };
  },
};

F['go-copy-line'] = {
  lang: 'go', diffs: ['hard', 'expert'],
  make(rng, diff) {
    const [a, b] = names(rng, [['original', 'scores', 'stock', 'levels'], ['backup', 'saved', 'before', 'snapshot']]);
    return { a, b, vals: randList(rng, 3, 4, 1, 9), op: rng.pick(['set', 'set', 'sort']), w: rng.int(50, 99), ...drawBlocks(rng, diff) };
  },
  view(c, diff) {
    const { a, b, vals, op, w } = c;
    const got = op === 'set' ? w : Math.min(...vals);
    if (got === vals[0]) return null;
    const bug = `${b} := ${a}`, answer = `${b} := slices.Clone(${a})`;
    const opLine = op === 'set' ? `${a}[0] = ${w}` : `slices.Sort(${a})`;
    return {
      code: inMain.go([`${a} := []int{${vals.join(', ')}}`, bug, opLine, `fmt.Println(${b}[0])`]),
      lead: `${tk(b)} should keep the values as they were before line 4, so this should print **${vals[0]}**. It prints **${got}**. ${NOTE.go}`,
      ask: rewriteAsk(diff, 3, `${tk(b)} is a separate copy`), type: 'text', answer, trail: '', bug, lineNo: 3,
      alts: [`${b} := append([]int{}, ${a}...)`, `${b} := append([]int(nil), ${a}...)`, `${b} := append([]int{}, ${a}[:]...)`],
      distractors: [bug, `${b} := ${a}[:]`, `${b} := &${a}`, `${b} = slices.Clone(${a})`, `${b} := slices.Clone(${b})`],
      explanation: `Line 3 should be \`${answer}\`. Assigning a slice copies only the slice header (pointer, length, capacity), so \`${bug}\` makes both names view the **same** array, and \`${opLine}\` changes what ${tk(b)} sees. \`slices.Clone\` (Go 1.21+) copies the items into a new array. (\`${a}[:]\` is still the same array.)`,
      hints: [`After \`${bug}\`, how many arrays hold the numbers?`, 'Assigning or re-slicing a slice never copies its items.', 'The `slices` package has a function that returns a copy.'],
    };
  },
  sim(c) {
    const A = c.a, B = c.b;
    const forms = [
      [new RegExp(`^${B}\\s*:=\\s*slices\\.Clone\\(\\s*${A}\\s*\\)$`), 'copy'], [new RegExp(`^${B}\\s*:=\\s*append\\(\\s*\\[\\]int(?:\\{\\}|\\(nil\\))\\s*,\\s*${A}(?:\\[:\\])?\\.\\.\\.\\s*\\)$`), 'copy'],
      [new RegExp(`^${B}\\s*:=\\s*${A}(?:\\[\\s*0?\\s*:\\s*\\])?$`), 'alias'],
    ];
    return {
      ok(line) {
        const f = forms.find(([re]) => re.test(stripMark(line)));
        if (!f) return false;
        // backing arrays: an alias shares the array, a copy gets its own
        const arr = c.vals.slice();
        const back = f[1] === 'alias' ? arr : arr.slice();
        if (c.op === 'set') arr[0] = c.w; else arr.sort((x, y) => x - y);
        return back[0] === c.vals[0];
      },
    };
  },
};

// =============================================================================================
// generate / verify
// =============================================================================================
const LEVELS = ['medium', 'hard', 'expert'];
const NEW_LANGS = ['javascript', 'typescript', 'java', 'go'];
for (const id of Object.keys(F)) F[id].id = id;
export const familiesFor = (lang, diff) => Object.keys(F).filter(id => F[id].lang === lang && F[id].diffs.includes(diff));

// Accepted forms of a typed line: the answer and each alternative, with and without the trailing
// mark, with compact spacing around operators.
function acceptsFor(v) {
  const keys = new Set([textKey(v.answer)]), out = [];
  const add = t => { const k = textKey(t); if (t && !keys.has(k) && out.length < 20) { keys.add(k); out.push(t); } };
  const forms = [v.answer, ...(v.alts || [])];
  for (const f of forms) { add(f); if (v.trail) add(f + v.trail); }
  for (const f of forms) spacingVariants(f).slice(1).forEach(add);
  return out;
}

// One question from a family's view (null if the view is unusable).
function assemble(fam, c, diff, L) {
  const v = fam.view(c, diff);
  if (!v) return null;
  const prompt = [v.lead, codeBlock(L, v.code), v.ask].filter(Boolean).join('\n\n');
  const meta = { mode: 'lang', fam: fam.id, diff, c };
  const base = { prompt, lang: L, explanation: v.explanation, meta };
  if (v.type === 'multi') return { q: { ...base, answerType: 'multi', parts: v.parts }, v };
  if (v.type === 'text') {
    // (JavaScript, TypeScript, Java and Go read their lines with codelang's extended lexer)
    const ext = NEW_LANGS.includes(L);
    const decoys = ext ? decoyTokens(v.answer, L, { ext }) : decoyTokens(v.answer);
    const blocks = blocksFor(v.answer, { distractors: [...v.distractors, ...decoys], count: c.extra, seed: c.seed, ...(ext ? { ext } : {}) });
    if (!blocks) return null;
    const note = v.trail ? ` The \`${v.trail.trim()}\` at the end is optional.` : '';
    return { q: { ...base, prompt: prompt + `${note} Spaces around operators are optional.`, answerType: 'text', answer: v.answer, accepts: acceptsFor(v), blocks, hints: v.hints }, v };
  }
  return { q: { ...base, answerType: v.type, answer: v.answer, ...(v.type === 'choice' ? { choices: v.choices } : { tolerance: 0 }), hints: v.hints }, v };
}

export function generateLangFeature({ difficulty, rng, lang }) {
  if (!LEVELS.includes(difficulty)) throw new Error(`Language features has no ${difficulty} level`);
  const fams = familiesFor(lang, difficulty);
  if (!fams.length) throw new Error(`no language-feature questions for ${lang}`);
  const id = rng.pick(fams);
  for (let t = 0; t < 40; t++) {
    const c = F[id].make(rng, difficulty);
    let r = null;
    try { r = assemble(F[id], c, difficulty, lang); } catch { r = null; }
    if (r) return r.q;
  }
  throw new Error(`could not build a ${id} question`);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function verifyLangFeature(q, answer) {
  const m = q.meta, fam = F[m.fam];
  if (!fam || fam.lang !== q.lang || !fam.diffs.includes(m.diff)) return false;
  // Rebuild from the plan: the shown question must be exactly what the plan renders.
  const r = assemble(fam, m.c, m.diff, q.lang);
  if (!r || r.q.prompt !== q.prompt || r.q.answerType !== q.answerType) return false;
  const want = fam.sim(m.c, m.diff, r.v);
  if (want === null || want === undefined) return false;
  if (q.answerType === 'multi') {
    if (!Array.isArray(q.parts) || !same(q.parts.map(p => [p.id, p.answer, p.choices]), r.q.parts.map(p => [p.id, p.answer, p.choices]))) return false;
    const given = answer && typeof answer === 'object' ? answer : {};
    return q.parts.every(p => {
      const w = want[p.id];
      if (w === undefined || p.answer !== w) return false;
      if (p.answerType === 'choice') return Array.isArray(p.choices) && p.choices.length === 4 && new Set(p.choices).size === 4 && p.choices.filter(x => x === w).length === 1 && String(given[p.id]) === w;
      return typeof w === 'number' && String(given[p.id] ?? '').trim() !== '' && Number(given[p.id]) === w;
    });
  }
  if (q.answerType === 'choice') {
    if (!same(q.choices, r.q.choices) || q.answer !== r.q.answer || q.answer !== want) return false;
    return q.choices.length === 4 && new Set(q.choices).size === 4 && q.choices.includes(want) && String(answer) === want;
  }
  if (q.answerType === 'number') {
    return q.answer === r.q.answer && q.answer === want && String(answer ?? '').trim() !== '' && Number(answer) === want;
  }
  if (q.answerType === 'text') {
    // every accepted form (and the answer) must pass the semantic check; the buggy line must not
    if (q.answer !== r.q.answer || !same(q.accepts, r.q.accepts) || !want.ok(q.answer) || want.ok(r.v.bug)) return false;
    if (!q.accepts.every(a => want.ok(a))) return false;
    const b = q.blocks;
    if (!b || !Array.isArray(b.tiles) || b.tiles.length < 2 || b.tiles.length > 24 || serialiseBlocks(b.tiles, b.solution, b.joiner ?? ' ') !== q.answer) return false;
    // the buggy line sits on the line the question names
    if (r.v.code[r.v.lineNo - 1].trim() !== r.v.bug + (r.v.trail || '').replace(/^ \{$/, ' {')) return false;
    const ok = new Set([q.answer, ...q.accepts].map(textKey));
    return typeof answer === 'string' && ok.has(textKey(answer));
  }
  return false;
}
