// Code Reviewing generator: predict the output, find the bug, fix the bug, name the bug, and
// rewrite the buggy line (typed, with a Blocks alternative; see "rewrite the buggy line" below).
//
// Every snippet is a language-neutral codelang program. plan*() draws everything random (template,
// names, numbers, bug, example, tests, choice order) WITHOUT seeing `lang`; present*() then renders
// the plan in the user's language. So one seed gives the same program, bug and answers in every
// language; only spelling and line numbers (brace lines) differ.
//
// verify() rebuilds the programs from `meta`, re-renders them in `question.lang`, runs them with the
// codelang interpreter and compares against plain-JS reference functions (tpl.ref / predictRef),
// so every answer is recomputed independently of how generate() produced it.

import { S, E, program, render, run, lineAt, fence, ident, rangeText, renderExpr,
  blocksFor, serialiseBlocks, spacingVariants, textKey, decoyTokens } from '../../js/lib/codelang.js';

const V = E.var, B = E.bin, IX = E.index, LEN = E.len;
const MAX_STEPS = 3000;

// ---- name pools (all pass codelang's name rules) ----
const LISTS = ['nums', 'values', 'scores', 'items', 'marks', 'prices', 'ages', 'points', 'readings'];
const MAIN_LISTS = ['data', 'sample', 'batch', 'group', 'row', 'stock'];
const ACC = ['total', 'result', 'acc', 'running', 'subtotal'];
const COUNTS = ['count', 'hits', 'found', 'tally', 'matches'];
const ELEMS = ['x', 'v', 'item', 'num', 'value'];
const IDX = ['i', 'j', 'k', 'idx', 'pos'];
const THRESH = ['t', 'limit', 'cutoff', 'target', 'bound'];

// Distinct names, one from each pool, in order.
function names(rng, pools) {
  const used = new Set();
  return pools.map(p => {
    const n = rng.pick(p.filter(x => !used.has(x)));
    used.add(n);
    return n;
  });
}

function sel(v, slot, table) {
  const k = v[slot] || 'ok';
  const f = table[k];
  if (!f) throw new Error(`unknown variant ${slot}.${k}`);
  return f();
}

function exec(prog, entry, args) {
  try {
    const r = run(prog, { entry, args, maxSteps: MAX_STEPS });
    return r.timedOut ? { timedOut: true } : { ok: true, value: r.returned };
  } catch {
    return { threw: true };
  }
}

const listText = xs => `[${xs.join(', ')}]`;
const TOG = { '>': '>=', '>=': '>', '<': '<=', '<=': '<' };
const FLIP = { '>': '<', '<': '>', '>=': '<=', '<=': '>=' };
const OPWORD = { '>': 'greater than', '<': 'less than', '>=': 'greater than or equal to', '<=': 'less than or equal to' };
const cmpJS = (op, a, b) => (op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b);
const randList = (rng, lo, hi, a, b) => Array.from({ length: rng.int(lo, hi) }, () => rng.int(a, b));
const code = (n, L, kind) => '`' + ident(n, L, kind) + '`';

// ---- templates ----
// Each: make(rng, diff) → cfg; params(c); body(c, v) with fixed statement ids; slots(c) → { slotId:
// { variantKey: kind } } (wrong variants; kind 'other' = only used as a wrong fix option);
// input(c, rng) → args; ref(c, args) → the spec'd result (plain JS); desc(c, L); work(c, args).
const T = {};

T['sum-to'] = {
  make(rng, diff) {
    const kind = rng.pick(diff === 'easy' ? ['sum', 'squares'] : ['sum', 'squares', 'product']);
    const f = rng.pick({ sum: ['sum_to', 'add_up_to', 'total_to'], squares: ['sum_squares', 'square_total', 'squares_to'],
      product: ['factorial', 'product_to', 'multiply_to'] }[kind]);
    const [n, acc, i] = names(rng, [['n', 'm', 'last', 'upto'], ACC, IDX]);
    return { kind, f, n, acc, i };
  },
  params: c => [c.n],
  body(c, v) {
    const prod = c.kind === 'product', n = V(c.n);
    const term = c.kind === 'squares' ? B('*', V(c.i), V(c.i)) : V(c.i);
    const d = val => () => S.decl(c.acc, val, null, 'init');
    const init = sel(v, 'init', { ok: d(prod ? 1 : 0), start: d(prod ? 0 : 1), o2: d(2), o3: d(-1), o4: d(n) });
    const acc = sel(v, 'acc', {
      ok: () => S.augAssign(c.acc, prod ? '*' : '+', term, 'acc'),
      op: () => S.augAssign(c.acc, prod ? '+' : '-', term, 'acc'),
      op2: () => S.augAssign(c.acc, '*', term, 'acc'),
      assign: () => S.assign(c.acc, term, 'acc'),
      other: () => S.augAssign(c.acc, prod ? '*' : '+', n, 'acc'),
      other2: () => S.augAssign(c.acc, '+', 1, 'acc'),
    });
    const [a, b] = sel(v, 'loop', {
      ok: () => [1, B('+', n, 1)], short: () => [1, n], late: () => [2, B('+', n, 1)],
      long: () => [1, B('+', n, 2)], zero: () => [0, B('+', n, 1)], late2: () => [2, n],
    });
    const early = v.ret === 'early';
    return [init, S.forRange(c.i, a, b, 1, early ? [acc, S.return(V(c.acc), 'ret')] : [acc], 'loop'),
      S.return(V(c.acc), early ? 'ret_end' : 'ret')];
  },
  slots: c => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    loop: c.kind === 'product' ? { short: 'off-by-one', late: 'other', long: 'off-by-one', zero: 'off-by-one' }
      : { short: 'off-by-one', late: 'off-by-one', long: 'off-by-one', late2: 'other' },
    acc: c.kind === 'product' ? { op: 'operator', assign: 'assign', other: 'other', other2: 'other' }
      : { op: 'operator', op2: 'operator', assign: 'assign', other: 'other' },
    ret: { early: 'early' },
  }),
  input: (c, rng) => [c.kind === 'product' ? rng.int(3, 7) : rng.int(3, 9)],
  ref(c, [n]) {
    if (c.kind === 'sum') return (n * (n + 1)) / 2;
    if (c.kind === 'squares') return (n * (n + 1) * (2 * n + 1)) / 6;
    let p = 1;
    for (let k = n; k > 1; k--) p *= k;
    return p;
  },
  desc(c, L) {
    const n = code(c.n, L);
    return c.kind === 'sum' ? `1 + 2 + … + ${n}` : c.kind === 'squares' ? `1×1 + 2×2 + … + ${n}×${n}` : `1 × 2 × … × ${n}`;
  },
  work(c, [n]) {
    const ks = Array.from({ length: n }, (_, k) => k + 1);
    const s = c.kind === 'sum' ? ks.join(' + ') : c.kind === 'squares' ? ks.map(k => `${k}×${k}`).join(' + ') : ks.join(' × ');
    return `${s} = ${this.ref(c, [n])}`;
  },
};

T['power'] = {
  make(rng) {
    const [b, n, acc, i] = names(rng, [['factor', 'b', 'mult'], ['n', 'times', 'reps'], ['result', 'acc', 'answer'], IDX]);
    return { f: rng.pick(['power', 'raise_to', 'repeat_mult']), b, n, acc, i };
  },
  params: c => [c.b, c.n],
  body(c, v) {
    const n = V(c.n), b = V(c.b);
    const d = val => () => S.decl(c.acc, val, null, 'init');
    const init = sel(v, 'init', { ok: d(1), start: d(0), o2: d(2), o3: d(b), o4: d(n) });
    const [lo, hi] = sel(v, 'loop', { ok: () => [0, n], short: () => [1, n], short2: () => [0, B('-', n, 1)], long: () => [0, B('+', n, 1)], late: () => [2, n] });
    const acc = sel(v, 'acc', {
      ok: () => S.augAssign(c.acc, '*', b, 'acc'), op: () => S.augAssign(c.acc, '+', b, 'acc'),
      assign: () => S.assign(c.acc, b, 'acc'), other: () => S.augAssign(c.acc, '*', n, 'acc'),
      other2: () => S.augAssign(c.acc, '+', 1, 'acc'),
    });
    const early = v.ret === 'early';
    return [init, S.forRange(c.i, lo, hi, 1, early ? [acc, S.return(V(c.acc), 'ret')] : [acc], 'loop'),
      S.return(V(c.acc), early ? 'ret_end' : 'ret')];
  },
  slots: () => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    loop: { short: 'off-by-one', short2: 'off-by-one', long: 'off-by-one', late: 'other' },
    acc: { op: 'operator', assign: 'assign', other: 'other', other2: 'other' },
    ret: { early: 'early' },
  }),
  input: (c, rng) => [rng.int(2, 6), rng.int(2, 5)],
  ref: (c, [b, n]) => b ** n,
  desc: (c, L) => `${code(c.b, L)} multiplied by itself ${code(c.n, L)} times (${code(c.b, L)} to the power ${code(c.n, L)})`,
  work: (c, [b, n]) => `${Array(n).fill(b).join(' × ')} = ${b ** n}`,
};

T['sum-list'] = {
  make(rng) {
    const [xs, acc, x, i] = names(rng, [LISTS, ACC, ELEMS, IDX]);
    return { f: rng.pick(['sum_list', 'list_total', 'add_all']), xs, acc, x, i, indexed: rng.next() < 0.5 };
  },
  params: c => [{ name: c.xs, type: 'list' }],
  body(c, v) {
    const val = c.indexed ? IX(c.xs, V(c.i)) : V(c.x);
    const d = n => () => S.decl(c.acc, n, null, 'init');
    const init = sel(v, 'init', { ok: d(0), start: d(1), o2: d(2), o3: d(-1), o4: d(LEN(c.xs)) });
    const acc = sel(v, 'acc', {
      ok: () => S.augAssign(c.acc, '+', val, 'acc'), op: () => S.augAssign(c.acc, '-', val, 'acc'),
      assign: () => S.assign(c.acc, val, 'acc'), index: () => S.augAssign(c.acc, '+', IX(c.xs, 0), 'acc'),
      other: () => S.augAssign(c.acc, '+', 1, 'acc'), other2: () => S.augAssign(c.acc, '*', val, 'acc'),
    });
    const early = v.ret === 'early';
    const inner = early ? [acc, S.return(V(c.acc), 'ret')] : [acc];
    const loop = c.indexed
      ? (([a, b]) => S.forRange(c.i, a, b, 1, inner, 'loop'))(sel(v, 'loop', {
        ok: () => [0, LEN(c.xs)], skipfirst: () => [1, LEN(c.xs)], skiplast: () => [0, B('-', LEN(c.xs), 1)],
        late2: () => [2, LEN(c.xs)], short2: () => [1, B('-', LEN(c.xs), 1)],
      }))
      : S.forEach(c.x, c.xs, inner, 'loop');
    return [init, loop, S.return(V(c.acc), early ? 'ret_end' : 'ret')];
  },
  slots: c => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    acc: c.indexed ? { op: 'operator', assign: 'assign', index: 'index', other: 'other', other2: 'other' }
      : { op: 'operator', assign: 'assign', other: 'other', other2: 'other' },
    ...(c.indexed ? { loop: { skipfirst: 'off-by-one', skiplast: 'off-by-one', late2: 'other', short2: 'other' } } : {}),
    ret: { early: 'early' },
  }),
  input: (c, rng) => [randList(rng, 3, 6, 1, 20)],
  ref: (c, [xs]) => xs.reduce((a, b) => a + b, 0),
  desc: (c, L) => `the total of all the numbers in ${code(c.xs, L)}`,
  work: (c, [xs]) => `${xs.join(' + ')} = ${xs.reduce((a, b) => a + b, 0)}`,
};

T['count-if'] = {
  make(rng, diff) {
    const mode = diff === 'easy' ? 'count' : rng.pick(['count', 'sum']);
    const op = rng.pick(diff === 'easy' ? ['>', '<'] : ['>', '<', '>=', '<=']);
    const style = diff === 'easy' ? 'each' : rng.pick(['each', 'while']);
    const FN = {
      count: { '>': ['count_above', 'count_over', 'count_greater'], '<': ['count_below', 'count_under', 'count_less'], '>=': ['count_at_least'], '<=': ['count_at_most'] },
      sum: { '>': ['sum_above', 'total_over'], '<': ['sum_below', 'total_under'], '>=': ['sum_at_least'], '<=': ['sum_at_most'] },
    };
    const [xs, acc, x, t, i] = names(rng, [LISTS, mode === 'count' ? COUNTS : ACC, ELEMS, THRESH, IDX]);
    return { mode, op, style, f: rng.pick(FN[mode][op]), xs, acc, x, t, i };
  },
  params: c => [{ name: c.xs, type: 'list' }, c.t],
  body(c, v) {
    const W = c.style === 'while';
    const val = W ? IX(c.xs, V(c.i)) : V(c.x), t = V(c.t), op = c.op, cnt = c.mode === 'count';
    const d = n => () => S.decl(c.acc, n, null, 'init');
    const init = sel(v, 'init', { ok: d(0), start: d(1), o2: d(2), o3: d(-1), o4: d(LEN(c.xs)) });
    const cond = sel(v, 'cond', {
      ok: () => B(op, val, t), strict: () => B(TOG[op], val, t), flip: () => B(FLIP[op], val, t),
      flip2: () => B(FLIP[TOG[op]], val, t), swap: () => B(op, t, val),
    });
    const inc = sel(v, 'inc', {
      ok: () => S.augAssign(c.acc, '+', cnt ? 1 : val, 'inc'),
      assign: () => S.assign(c.acc, cnt ? 1 : val, 'inc'),
      op: () => S.augAssign(c.acc, '-', val, 'inc'),
      other: () => S.augAssign(c.acc, '+', cnt ? val : 1, 'inc'),
      other2: () => S.augAssign(c.acc, '+', 2, 'inc'),
      other3: () => S.augAssign(c.acc, '+', t, 'inc'),
    });
    const ifS = S.if(cond, [inc], [], null, 'cond');
    const early = v.ret === 'early' ? [S.return(V(c.acc), 'ret')] : [];
    const ret = S.return(V(c.acc), v.ret === 'early' ? 'ret_end' : 'ret');
    if (!W) return [init, S.forEach(c.x, c.xs, [ifS, ...early], 'loop'), ret];
    const di = n => () => S.decl(c.i, n, null, 'i0');
    const i0 = sel(v, 'i0', { ok: di(0), start: di(1), o2: di(2), o3: di(3), o4: di(LEN(c.xs)) });
    const i = V(c.i), n = LEN(c.xs);
    const wc = sel(v, 'loop', {
      ok: () => B('<', i, n), short: () => B('<', i, B('-', n, 1)), short2: () => B('<', i, B('-', n, 2)),
      plus: () => B('<', B('+', i, 1), n), gt: () => B('>', i, n),
    });
    const step = sel(v, 'step', {
      ok: () => S.augAssign(c.i, '+', 1, 'step'), wrongvar: () => S.augAssign(c.acc, '+', 1, 'step'),
      two: () => S.augAssign(c.i, '+', 2, 'step'), three: () => S.augAssign(c.i, '+', 3, 'step'),
      reset: () => S.assign(c.i, 1, 'step'),
    });
    return [init, i0, S.while(wc, [ifS, step, ...early], 'loop'), ret];
  },
  slots: c => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    cond: { strict: 'comparison', flip: 'comparison', flip2: 'comparison', swap: 'comparison' },
    inc: c.mode === 'count' ? { assign: 'assign', other: 'other', other2: 'other', other3: 'other' }
      : { assign: 'assign', op: 'operator', other: 'other', other2: 'other' },
    ...(c.style === 'while' ? {
      i0: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
      loop: { short: 'off-by-one', short2: 'other', plus: 'other', gt: 'other' },
      step: { wrongvar: 'infinite', two: 'other', three: 'other', reset: 'other' },
    } : {}),
    ret: { early: 'early' },
  }),
  input(c, rng) {
    const xs = randList(rng, 4, 7, 1, 20), t = rng.int(4, 16);
    if (rng.next() < 0.6) xs[rng.int(0, xs.length - 1)] = t;
    return [xs, t];
  },
  ref: (c, [xs, t]) => {
    const hit = xs.filter(x => cmpJS(c.op, x, t));
    return c.mode === 'count' ? hit.length : hit.reduce((a, b) => a + b, 0);
  },
  desc: (c, L) => (c.mode === 'count' ? 'how many numbers in ' : 'the total of the numbers in ') + `${code(c.xs, L)}${c.mode === 'count' ? '' : ' that'} are ${OPWORD[c.op]} ${code(c.t, L)}`,
  work(c, [xs, t]) {
    const hit = xs.filter(x => cmpJS(c.op, x, t));
    if (!hit.length) return `no number is ${OPWORD[c.op]} ${t}, so 0`;
    return `the numbers ${OPWORD[c.op]} ${t} are ${hit.join(', ')}, so ` +
      (c.mode === 'count' ? `${hit.length}` : `${hit.join(' + ')} = ${this.ref(c, [xs, t])}`);
  },
};

T['min-max'] = {
  make(rng) {
    const mode = rng.pick(['min', 'max']);
    const [xs, best, x, i] = names(rng, [LISTS, ['best', 'current', 'winner', 'pick'], ELEMS, IDX]);
    const f = rng.pick(mode === 'min' ? ['smallest', 'min_value', 'lowest'] : ['largest', 'max_value', 'highest']);
    return { mode, f, xs, best, x, i, style: rng.pick(['each', 'index']) };
  },
  params: c => [{ name: c.xs, type: 'list' }],
  body(c, v) {
    const idx = c.style === 'index', val = idx ? IX(c.xs, V(c.i)) : V(c.x), bst = V(c.best);
    const cmp = c.mode === 'min' ? '<' : '>';
    const d = e => () => S.decl(c.best, e, null, 'init');
    const init = sel(v, 'init', { ok: d(IX(c.xs, 0)), start: d(c.mode === 'min' ? 0 : 100), o2: d(LEN(c.xs)), o3: d(1), o4: d(IX(c.xs, 1)) });
    const cond = sel(v, 'cond', {
      ok: () => B(cmp, val, bst), flip: () => B(FLIP[cmp], val, bst), flipeq: () => B(TOG[FLIP[cmp]], val, bst),
      first: () => B(cmp, val, IX(c.xs, 0)), swap: () => B(cmp, bst, val),
    });
    const upd = sel(v, 'upd', {
      ok: () => S.assign(c.best, val, 'upd'), first: () => S.assign(c.best, IX(c.xs, 0), 'upd'),
      add: () => S.augAssign(c.best, '+', val, 'upd'), one: () => S.assign(c.best, 1, 'upd'),
      prev: () => S.assign(c.best, IX(c.xs, B('-', V(c.i), 1)), 'upd'),
    });
    const early = v.ret === 'early';
    const inner = [S.if(cond, [upd], [], null, 'cond'), ...(early ? [S.return(bst, 'ret')] : [])];
    const loop = idx
      ? (([a, b]) => S.forRange(c.i, a, b, 1, inner, 'loop'))(sel(v, 'loop', {
        ok: () => [1, LEN(c.xs)], short: () => [1, B('-', LEN(c.xs), 1)], late: () => [2, LEN(c.xs)],
        short2: () => [2, B('-', LEN(c.xs), 1)], late3: () => [3, LEN(c.xs)],
      }))
      : S.forEach(c.x, c.xs, inner, 'loop');
    return [init, loop, S.return(bst, early ? 'ret_end' : 'ret')];
  },
  slots: c => ({
    init: { start: 'start', o2: 'other', o3: 'other', ...(c.style === 'index' ? { o4: 'other' } : {}) },
    cond: { flip: 'comparison', flipeq: 'comparison', first: 'index', swap: 'comparison' },
    upd: c.style === 'index' ? { first: 'index', add: 'other', one: 'other', prev: 'index' } : { first: 'index', add: 'other', one: 'other' },
    ...(c.style === 'index' ? { loop: { short: 'off-by-one', late: 'off-by-one', short2: 'other', late3: 'other' } } : {}),
    ret: { early: 'early' },
  }),
  input: (c, rng) => [randList(rng, 4, 7, 2, 60)],
  ref: (c, [xs]) => (c.mode === 'min' ? Math.min(...xs) : Math.max(...xs)),
  desc: (c, L) => `the ${c.mode === 'min' ? 'smallest' : 'largest'} number in ${code(c.xs, L)}`,
  work: (c, [xs]) => `the ${c.mode === 'min' ? 'smallest' : 'largest'} of ${xs.join(', ')} is ${c.mode === 'min' ? Math.min(...xs) : Math.max(...xs)}`,
};

T['digit-sum'] = {
  make(rng) {
    const mode = rng.pick(['sum', 'count']);
    const [n, acc] = names(rng, [['n', 'num', 'number'], mode === 'sum' ? ACC : COUNTS]);
    return { mode, n, acc, f: rng.pick(mode === 'sum' ? ['digit_sum', 'sum_digits', 'add_digits'] : ['count_digits', 'digit_count', 'num_digits']) };
  },
  params: c => [c.n],
  body(c, v) {
    const n = V(c.n), sum = c.mode === 'sum';
    const d = e => () => S.decl(c.acc, e, null, 'init');
    const init = sel(v, 'init', { ok: d(0), start: d(1), o2: d(10), o3: d(-1), o4: d(n) });
    const wc = sel(v, 'loop', {
      ok: () => B('>', n, 0), nine: () => B('>', n, 9), ge: () => B('>=', n, 0), one: () => B('>', n, 1), ten: () => B('>=', n, 10),
    });
    const acc = sel(v, 'acc', sum ? {
      ok: () => S.augAssign(c.acc, '+', B('%', n, 10), 'acc'), op: () => S.augAssign(c.acc, '+', B('/', n, 10), 'acc'),
      assign: () => S.assign(c.acc, B('%', n, 10), 'acc'), other: () => S.augAssign(c.acc, '+', 1, 'acc'),
      other2: () => S.augAssign(c.acc, '+', n, 'acc'),
    } : {
      ok: () => S.augAssign(c.acc, '+', 1, 'acc'), assign: () => S.assign(c.acc, 1, 'acc'),
      op: () => S.augAssign(c.acc, '-', 1, 'acc'), other: () => S.augAssign(c.acc, '+', B('%', n, 10), 'acc'),
      other2: () => S.augAssign(c.acc, '+', 10, 'acc'),
    });
    const step = sel(v, 'step', {
      ok: () => S.augAssign(c.n, '/', 10, 'step'), mod: () => S.augAssign(c.n, '%', 10, 'step'),
      wrongvar: () => S.augAssign(c.acc, '/', 10, 'step'), hundred: () => S.augAssign(c.n, '/', 100, 'step'),
      minus: () => S.augAssign(c.n, '-', 1, 'step'),
    });
    const early = v.ret === 'early';
    return [init, S.while(wc, [acc, step, ...(early ? [S.return(V(c.acc), 'ret')] : [])], 'loop'),
      S.return(V(c.acc), early ? 'ret_end' : 'ret')];
  },
  slots: c => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    loop: { nine: 'off-by-one', ge: 'other', one: 'other', ten: 'other' },
    acc: c.mode === 'sum' ? { op: 'operator', assign: 'assign', other: 'other', other2: 'other' }
      : { assign: 'assign', op: 'operator', other: 'other', other2: 'other' },
    step: { mod: 'infinite', wrongvar: 'infinite', hundred: 'other', minus: 'other' },
    ret: { early: 'early' },
  }),
  input(c, rng) {
    const k = rng.int(3, 5);
    let s = String(rng.int(1, 9));
    for (let j = 1; j < k; j++) s += String(rng.int(0, 9));
    return [Number(s)];
  },
  ref: (c, [n]) => (c.mode === 'sum' ? String(n).split('').reduce((a, ch) => a + Number(ch), 0) : String(n).length),
  desc: (c, L) => (c.mode === 'sum' ? `the sum of the digits of ${code(c.n, L)}` : `the number of digits in ${code(c.n, L)}`),
  work: (c, [n]) => (c.mode === 'sum' ? `${String(n).split('').join(' + ')} = ${String(n).split('').reduce((a, ch) => a + Number(ch), 0)}`
    : `${n} has ${String(n).length} digits`),
};

T['sum-while'] = {
  make(rng) {
    const [n, acc, i] = names(rng, [['n', 'm', 'last', 'upto'], ACC, IDX]);
    const kind = rng.pick(['sum', 'squares']);
    return { kind, n, acc, i, f: rng.pick(kind === 'sum' ? ['sum_to', 'add_up_to', 'total_to'] : ['sum_squares', 'square_total', 'squares_to']) };
  },
  params: c => [c.n],
  body(c, v) {
    const n = V(c.n), i = V(c.i), term = c.kind === 'squares' ? B('*', i, i) : i;
    const d = e => () => S.decl(c.acc, e, null, 'init');
    const init = sel(v, 'init', { ok: d(0), start: d(1), o2: d(2), o3: d(-1), o4: d(n) });
    const di = e => () => S.decl(c.i, e, null, 'i0');
    const i0 = sel(v, 'i0', { ok: di(1), start: di(2), o2: di(3), o3: di(n), o4: di(B('+', n, 1)) });
    const wc = sel(v, 'loop', {
      ok: () => B('<=', i, n), lt: () => B('<', i, n), le1: () => B('<=', i, B('+', n, 1)),
      lt1: () => B('<', i, B('-', n, 1)), ge: () => B('>=', i, n),
    });
    const acc = sel(v, 'acc', {
      ok: () => S.augAssign(c.acc, '+', term, 'acc'), op: () => S.augAssign(c.acc, '-', term, 'acc'),
      assign: () => S.assign(c.acc, term, 'acc'), other: () => S.augAssign(c.acc, '+', 1, 'acc'),
      other2: () => S.augAssign(c.acc, '+', n, 'acc'),
    });
    const step = sel(v, 'step', {
      ok: () => S.augAssign(c.i, '+', 1, 'step'), wrongvar: () => S.augAssign(c.acc, '+', 1, 'step'),
      two: () => S.augAssign(c.i, '+', 2, 'step'), three: () => S.augAssign(c.i, '+', 3, 'step'),
      stay: () => S.assign(c.i, 1, 'step'),
    });
    const early = v.ret === 'early';
    return [init, i0, S.while(wc, [acc, step, ...(early ? [S.return(V(c.acc), 'ret')] : [])], 'loop'),
      S.return(V(c.acc), early ? 'ret_end' : 'ret')];
  },
  slots: () => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    i0: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    loop: { lt: 'off-by-one', le1: 'off-by-one', lt1: 'other', ge: 'other' },
    acc: { op: 'operator', assign: 'assign', other: 'other', other2: 'other' },
    step: { wrongvar: 'infinite', two: 'other', three: 'other', stay: 'other' },
    ret: { early: 'early' },
  }),
  input: (c, rng) => [rng.int(3, 9)],
  ref: (c, [n]) => (c.kind === 'sum' ? (n * (n + 1)) / 2 : (n * (n + 1) * (2 * n + 1)) / 6),
  desc: (c, L) => (c.kind === 'sum' ? `1 + 2 + … + ${code(c.n, L)}` : `1×1 + 2×2 + … + ${code(c.n, L)}×${code(c.n, L)}`),
  work: (c, [n]) => T['sum-to'].work({ kind: c.kind }, [n]),
};

T['find-index'] = {
  make(rng) {
    const [xs, t, i] = names(rng, [LISTS, THRESH, IDX]);
    return { f: rng.pick(['find_index', 'index_of', 'position_of']), xs, t, i };
  },
  params: c => [{ name: c.xs, type: 'list' }, c.t],
  body(c, v) {
    const i = V(c.i), t = V(c.t), n = LEN(c.xs), at = IX(c.xs, i);
    const di = e => () => S.decl(c.i, e, null, 'i0');
    const i0 = sel(v, 'i0', { ok: di(0), start: di(1), o2: di(2), o3: di(3), o4: di(n) });
    const wc = sel(v, 'loop', {
      ok: () => B('<', i, n), short: () => B('<', i, B('-', n, 1)), short2: () => B('<', i, B('-', n, 2)),
      plus: () => B('<', B('+', i, 1), n), gt: () => B('>', i, n),
    });
    const cond = sel(v, 'cond', {
      ok: () => B('==', at, t), ne: () => B('!=', at, t), gt: () => B('>', at, t), ge: () => B('>=', at, t), lt: () => B('<', at, t),
    });
    const found = sel(v, 'found', {
      ok: () => S.return(i, 'found'), plus: () => S.return(B('+', i, 1), 'found'), zero: () => S.return(0, 'found'),
      t: () => S.return(t, 'found'), one: () => S.return(1, 'found'),
    });
    const step = sel(v, 'step', {
      ok: () => S.augAssign(c.i, '+', 1, 'step'), two: () => S.augAssign(c.i, '+', 2, 'step'),
      three: () => S.augAssign(c.i, '+', 3, 'step'), stay: () => S.assign(c.i, 1, 'step'), back: () => S.assign(c.i, 0, 'step'),
    });
    return [i0, S.while(wc, [S.if(cond, [found], [], null, 'cond'), step], 'loop'), S.return(-1, 'ret')];
  },
  slots: () => ({
    i0: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    loop: { short: 'off-by-one', short2: 'other', plus: 'other', gt: 'other' },
    cond: { ne: 'comparison', gt: 'comparison', ge: 'comparison', lt: 'comparison' },
    found: { plus: 'off-by-one', zero: 'other', t: 'other', one: 'other' },
    step: { two: 'other', three: 'other', stay: 'other', back: 'other' },
  }),
  input(c, rng) {
    const pool = rng.shuffle(Array.from({ length: 30 }, (_, k) => k + 1));
    const xs = pool.slice(0, rng.int(4, 7));
    const t = rng.next() < 0.8 ? xs[rng.int(0, xs.length - 1)] : pool[10];
    return [xs, t];
  },
  ref: (c, [xs, t]) => xs.indexOf(t),
  desc: (c, L) => `the position (counting from 0) of ${code(c.t, L)} in ${code(c.xs, L)}, or -1 if it is not there`,
  work: (c, [xs, t]) => (xs.includes(t) ? `${t} is at position ${xs.indexOf(t)} (counting from 0)` : `${t} is not in the list, so -1`),
};

T['increases'] = {
  make(rng) {
    const op = rng.pick(['>', '<']);
    const [xs, acc, i] = names(rng, [LISTS, COUNTS, IDX]);
    return { op, xs, acc, i, f: rng.pick(op === '>' ? ['count_rises', 'count_increases'] : ['count_drops', 'count_falls']) };
  },
  params: c => [{ name: c.xs, type: 'list' }],
  body(c, v) {
    const i = V(c.i), n = LEN(c.xs), cur = IX(c.xs, i), prev = IX(c.xs, B('-', i, 1));
    const d = e => () => S.decl(c.acc, e, null, 'init');
    const init = sel(v, 'init', { ok: d(0), start: d(1), o2: d(2), o3: d(-1), o4: d(n) });
    const [a, b] = sel(v, 'loop', {
      ok: () => [1, n], late: () => [2, n], short: () => [1, B('-', n, 1)], late3: () => [3, n], short2: () => [2, B('-', n, 1)],
    });
    const cond = sel(v, 'cond', {
      ok: () => B(c.op, cur, prev), eq: () => B(TOG[c.op], cur, prev), flip: () => B(FLIP[c.op], cur, prev),
      first: () => B(c.op, cur, IX(c.xs, 0)), swap: () => B(c.op, prev, cur),
    });
    const inc = sel(v, 'inc', {
      ok: () => S.augAssign(c.acc, '+', 1, 'inc'), assign: () => S.assign(c.acc, 1, 'inc'),
      two: () => S.augAssign(c.acc, '+', 2, 'inc'), val: () => S.augAssign(c.acc, '+', cur, 'inc'),
      sub: () => S.augAssign(c.acc, '-', 1, 'inc'),
    });
    const early = v.ret === 'early';
    return [init, S.forRange(c.i, a, b, 1, [S.if(cond, [inc], [], null, 'cond'), ...(early ? [S.return(V(c.acc), 'ret')] : [])], 'loop'),
      S.return(V(c.acc), early ? 'ret_end' : 'ret')];
  },
  slots: () => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    loop: { late: 'off-by-one', short: 'off-by-one', late3: 'other', short2: 'other' },
    cond: { eq: 'comparison', flip: 'comparison', first: 'index', swap: 'comparison' },
    inc: { assign: 'assign', two: 'other', val: 'other', sub: 'operator' },
    ret: { early: 'early' },
  }),
  input(c, rng) {
    const xs = randList(rng, 5, 8, 1, 20);
    if (rng.next() < 0.5) { const k = rng.int(1, xs.length - 1); xs[k] = xs[k - 1]; }
    return [xs];
  },
  ref(c, [xs]) {
    let k = 0;
    xs.forEach((x, j) => { if (j > 0 && cmpJS(c.op, x, xs[j - 1])) k++; });
    return k;
  },
  desc: (c, L) => `how many times a number in ${code(c.xs, L)} is ${c.op === '>' ? 'bigger' : 'smaller'} than the number just before it`,
  work(c, [xs]) {
    const steps = xs.slice(1).map((x, j) => [xs[j], x]).filter(([p, x]) => cmpJS(c.op, x, p));
    return steps.length ? `${steps.map(([p, x]) => `${p} → ${x}`).join(', ')}: ${steps.length}` : 'no step qualifies, so 0';
  },
};

// Expert only: nested loops over pairs. count = 0; for i in 0..len: for j in i+1..len: if xs[i] + xs[j] == t: count += 1
T['pair-count'] = {
  make(rng) {
    const [xs, acc, t, i, j] = names(rng, [LISTS, COUNTS, THRESH, ['i', 'a', 'p'], ['j', 'b', 'q']]);
    return { f: rng.pick(['count_pairs', 'pair_count', 'pairs_to']), xs, acc, t, i, j };
  },
  params: c => [{ name: c.xs, type: 'list' }, c.t],
  body(c, v) {
    const i = V(c.i), j = V(c.j), n = LEN(c.xs), t = V(c.t);
    const d = e => () => S.decl(c.acc, e, null, 'init');
    const init = sel(v, 'init', { ok: d(0), start: d(1), o2: d(2), o3: d(-1), o4: d(n) });
    const [a, b] = sel(v, 'outer', { ok: () => [0, n], late: () => [1, n], short: () => [0, B('-', n, 2)], eq: () => [0, B('-', n, 1)], late2: () => [2, n] });
    const js = sel(v, 'inner', { ok: () => B('+', i, 1), self: () => i, zero: () => 0, skip: () => B('+', i, 2), one: () => 1 });
    const cond = sel(v, 'cond', {
      ok: () => B('==', B('+', IX(c.xs, i), IX(c.xs, j)), t), same: () => B('==', B('+', IX(c.xs, i), IX(c.xs, i)), t),
      ge: () => B('>=', B('+', IX(c.xs, i), IX(c.xs, j)), t), minus: () => B('==', B('-', IX(c.xs, j), IX(c.xs, i)), t),
      first: () => B('==', B('+', IX(c.xs, 0), IX(c.xs, j)), t),
    });
    const inc = sel(v, 'inc', {
      ok: () => S.augAssign(c.acc, '+', 1, 'inc'), assign: () => S.assign(c.acc, 1, 'inc'), two: () => S.augAssign(c.acc, '+', 2, 'inc'),
      val: () => S.augAssign(c.acc, '+', IX(c.xs, i), 'inc'), sub: () => S.augAssign(c.acc, '-', 1, 'inc'),
    });
    return [init, S.forRange(c.i, a, b, 1, [S.forRange(c.j, js, n, 1, [S.if(cond, [inc], [], null, 'cond')], 'inner')], 'outer'),
      S.return(V(c.acc), 'ret')];
  },
  slots: () => ({
    init: { start: 'start', o2: 'other', o3: 'other', o4: 'other' },
    outer: { late: 'off-by-one', short: 'off-by-one', eq: 'other', late2: 'other' },
    inner: { self: 'off-by-one', zero: 'other', skip: 'off-by-one', one: 'other' },
    cond: { same: 'index', ge: 'comparison', minus: 'operator', first: 'index' },
    inc: { assign: 'assign', two: 'other', val: 'other', sub: 'operator' },
  }),
  input(c, rng) {
    const xs = randList(rng, 5, 7, 1, 9);
    const a = rng.int(0, xs.length - 2), b = rng.int(a + 1, xs.length - 1);
    return [xs, xs[a] + xs[b]];
  },
  ref(c, [xs, t]) {
    let k = 0;
    for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) if (xs[a] + xs[b] === t) k++;
    return k;
  },
  desc: (c, L) => `how many pairs of positions ${code(c.i, L)} < ${code(c.j, L)} in ${code(c.xs, L)} have numbers that add up to ${code(c.t, L)} (each pair counted once)`,
  work(c, [xs, t]) {
    const ps = [];
    for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) if (xs[a] + xs[b] === t) ps.push(`${xs[a]} + ${xs[b]}`);
    return ps.length ? `the pairs adding to ${t} are ${ps.join(', ')}, so ${ps.length}` : `no pair adds to ${t}, so 0`;
  },
};

const fnProg = (tpl, c, v = {}) => program([S.fn(c.f, tpl.params(c).map(p => (typeof p === 'string' ? p : p)), tpl.body(c, v), 'int', 'fn')], []);
// Meaning key of a variant: comparisons written in one orientation (`t > x` is `x < t`) and `not (a < b)`
// as `a >= b`, so two fix options that say the same thing (or a "fix" that only restates the bug) can be told apart.
const CMPS = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '==', '!=': '!=' };
const NEGS = { '<': '>=', '>=': '<', '>': '<=', '<=': '>', '==': '!=', '!=': '==' };
function canon(e) {
  if (Array.isArray(e)) return e.map(canon);
  if (!e || typeof e !== 'object') return e;
  if (e.k === 'not' && e.x && e.x.k === 'bin' && NEGS[e.x.op]) return canon({ ...e.x, op: NEGS[e.x.op] });
  if (e.k === 'not' && e.x && e.x.k === 'not') return canon(e.x.x);
  const o = {};
  for (const [k, v] of Object.entries(e)) o[k] = canon(v);
  if (o.k === 'bin' && CMPS[o.op] && JSON.stringify(o.a) > JSON.stringify(o.b)) return { ...o, op: CMPS[o.op], a: o.b, b: o.a };
  return o;
}
const meaningKey = (tpl, c, v) => JSON.stringify(canon(fnProg(tpl, c, v)));
const paramNames = (tpl, c) => tpl.params(c).map(p => (typeof p === 'string' ? p : p.name));

// Statement ids of a function body, in source order.
function stmtIds(stmts, out = []) {
  for (const s of stmts) {
    if (s.id != null) out.push(s.id);
    for (const b of [s.then, s.body, s.els, ...(s.elifs || []).map(a => a.body)]) if (b) stmtIds(b, out);
  }
  return out;
}

// ---- bug categories ----
const CAT = {
  'off-by-one': 'Off-by-one error', infinite: 'Infinite loop', comparison: 'Wrong comparison', start: 'Wrong starting value',
  early: 'Returns too early', operator: 'Wrong operator', index: 'Wrong index', assign: 'Overwrites instead of adding',
};
const CAT_KINDS = Object.keys(CAT);
// Categories that could also describe a bug of this kind; never offered as distractors for it.
// Symmetric pairs: e.g. `>` flipped to `<` is a wrong comparison but also "a wrong operator";
// `n %= 10` (infinite loop) is also a wrong operator; `i = 1` (start) also reads the wrong index.
const CONFUSE_PAIRS = [['off-by-one', 'comparison'], ['off-by-one', 'index'], ['off-by-one', 'start'], ['operator', 'assign'],
  ['operator', 'comparison'], ['operator', 'infinite'], ['index', 'comparison'], ['index', 'start']];
const typeOk = (kind, other) => other !== kind
  && !CONFUSE_PAIRS.some(([a, b]) => (a === kind && b === other) || (b === kind && a === other));

const WHY = {
  'off-by-one': (L, range) => `The loop covers one value too many or too few.${range ? ` Remember: ${rangeText(L)}.` : ''}`,
  comparison: () => 'The comparison is wrong, so the test picks the wrong values.',
  operator: () => 'It uses the wrong arithmetic operator.',
  start: () => 'The variable starts with the wrong value, so the result is off from the very first step.',
  assign: () => 'Plain `=` replaces the value each time instead of adding to it, so only the last step counts.',
  index: () => 'It reads the wrong position in the list.',
  infinite: () => 'The variable in the loop condition never moves towards the end, so the condition stays true and the loop never stops.',
  early: () => 'The `return` is inside the loop, so the function stops during the first pass instead of after the whole loop.',
};

// ---- bug plans (no lang) ----
const BUG_POOL = {
  easy: ['sum-to', 'power', 'sum-list', 'count-if'],
  medium: ['sum-to', 'sum-list', 'count-if', 'min-max', 'digit-sum', 'sum-while', 'find-index'],
  hard: ['count-if', 'min-max', 'digit-sum', 'sum-while', 'find-index', 'increases', 'power'],
};

// Does this run count as "wrong" (fails the spec) without crashing?
const fails = (r, want) => r.timedOut || (r.ok && r.value !== want);

function planBug(rng, diff, { needFix, pool, dedupe = false }) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const tplId = rng.pick(pool || BUG_POOL[diff]);
    const tpl = T[tplId];
    const c = tpl.make(rng, diff);
    const slots = tpl.slots(c);
    const bugs = [];
    for (const [slot, alts] of Object.entries(slots)) {
      for (const [key, kind] of Object.entries(alts)) {
        if (kind === 'other' || (needFix && kind === 'early')) continue;
        bugs.push({ slot, key, kind });
      }
    }
    if (!bugs.length) continue;
    const kinds = [...new Set(bugs.map(b => b.kind))];
    const kind = rng.pick(kinds);
    const bug = rng.pick(bugs.filter(b => b.kind === kind));
    const good = fnProg(tpl, c), bad = fnProg(tpl, c, { [bug.slot]: bug.key });
    // Example: the correct code meets the spec and the bug shows (a wrong value, or a timeout for
    // the infinite-loop kind only).
    let ex = null, actual = null;
    for (let t = 0; t < 30 && !ex; t++) {
      const a = tpl.input(c, rng), want = tpl.ref(c, a);
      const g = exec(good, c.f, a);
      if (!g.ok || g.value !== want) continue;
      const r = exec(bad, c.f, a);
      if (kind === 'infinite' ? r.timedOut : (r.ok && r.value !== want)) { ex = a; actual = r.ok ? r.value : null; }
    }
    if (!ex) continue;
    const tests = [ex];
    for (let t = 0; t < 6; t++) tests.push(tpl.input(c, rng));
    if (!tests.every(a => { const g = exec(good, c.f, a); return g.ok && g.value === tpl.ref(c, a); })) continue;
    // Fix options: other variants of the same slot that never crash and fail at least one test.
    let fixKeys = null;
    const fixable = kind !== 'early';
    if (fixable) {
      const usable = Object.keys(slots[bug.slot]).filter(k => k !== bug.key && slots[bug.slot][k] !== 'early').filter(k => {
        const p = fnProg(tpl, c, { [bug.slot]: k });
        const rs = tests.map(a => exec(p, c.f, a));
        return !rs.some(r => r.threw) && rs.some((r, j) => fails(r, tpl.ref(c, tests[j])));
      });
      if (!dedupe) {
        // Fix options aren't offered as choices here; keep the original draws so these questions never change.
        if (usable.length >= 3) fixKeys = rng.shuffle(['ok', ...rng.shuffle(usable).slice(0, 3)]);
      } else {
        // Skip a fix option that means the same as the correct line or one already picked (`x > c` vs `c < x`).
        const seen = new Set([meaningKey(tpl, c)]), picked = [];
        for (const k of usable.length >= 3 ? rng.shuffle(usable) : []) {
          if (picked.length === 3) break;
          const key = meaningKey(tpl, c, { [bug.slot]: k });
          if (!seen.has(key)) { seen.add(key); picked.push(k); }
        }
        if (picked.length === 3) fixKeys = rng.shuffle(['ok', ...picked]);
      }
      if (!fixKeys && needFix) continue;
    }
    const others = stmtIds(bad.fns[0].body).filter(id => id !== bug.slot);
    if (others.length < 3) continue;
    const lineIds = rng.shuffle([bug.slot, ...rng.shuffle(others).slice(0, 3)]);
    const typeKinds = rng.shuffle([kind, ...rng.shuffle(CAT_KINDS.filter(k => typeOk(kind, k))).slice(0, 3)]);
    return { tpl: tplId, c, slot: bug.slot, key: bug.key, kind, ex, want: tpl.ref(c, ex), actual, tests, fixKeys, lineIds, typeKinds };
  }
  throw new Error('could not plan a bug question');
}

// ---- bug presentation (lang) ----
function sig(tpl, c, L) {
  return '`' + `${ident(c.f, L, 'fn')}(${paramNames(tpl, c).map(n => ident(n, L)).join(', ')})` + '`';
}
function exampleText(tpl, c, args, L) {
  const ps = paramNames(tpl, c);
  if (args.every(a => !Array.isArray(a))) return '`' + `${ident(c.f, L, 'fn')}(${args.join(', ')})` + '`';
  return `${sig(tpl, c, L)} with ${ps.map((p, j) => `${code(p, L)} = ${Array.isArray(args[j]) ? listText(args[j]) : args[j]}`).join(' and ')}`;
}

// Everything a bug question shows, derived from the plan + lang (used by generate and verify).
function bugView(p, L) {
  const tpl = T[p.tpl], c = p.c;
  const bad = fnProg(tpl, c, { [p.slot]: p.key }), good = fnProg(tpl, c);
  const R = render(bad, L, { lineNumbers: true }), Rg = render(good, L);
  const lineChoice = id => `Line ${R.lineOf.get(id)}`;
  const fixText = k => '`' + lineAt(render(fnProg(tpl, c, k === 'ok' ? {} : { [p.slot]: k }), L), p.slot) + '`';
  return {
    tpl, c, bad, good, R, Rg,
    bugLine: R.lineOf.get(p.slot),
    lineChoices: p.lineIds.map(lineChoice),
    fixChoices: p.fixKeys ? p.fixKeys.map(fixText) : null,
    typeChoices: p.typeKinds.map(k => CAT[k]),
  };
}

function presentBug(p, sub, diff, L) {
  const w = bugView(p, L), { tpl, c } = w;
  const codeBlock = '```' + fence(L) + '\n' + w.R.code + '\n```';
  const spec = `${sig(tpl, c, L)} should return ${tpl.desc(c, L)}. For example, ${exampleText(tpl, c, p.ex, L)} should return **${p.want}**.`;
  const badText = lineAt(w.R, p.slot);
  const fixText = p.kind === 'early' ? null : lineAt(w.Rg, p.slot);
  const isRange = w.bad.fns[0].body.some(s => s.id === p.slot && s.k === 'forRange');
  const expl = [
    `The bug is on line ${w.bugLine}: \`${badText}\`.` + (fixText ? ` It should be \`${fixText}\`.` : ' The `return` belongs after the loop.'),
    WHY[p.kind](L, isRange),
    `For the example the function should return **${p.want}** (${tpl.work(c, p.ex)}). ` +
      (p.kind === 'infinite' ? 'The buggy version never finishes.' : `The buggy version returns **${p.actual}** instead.`),
    `Bug type: **${CAT[p.kind]}**.`,
  ].join('\n\n');

  const lineQ = { answer: `Line ${w.bugLine}`, choices: w.lineChoices };
  const fixQ = w.fixChoices ? { answer: '`' + fixText + '`', choices: w.fixChoices } : null;
  const typeQ = { answer: CAT[p.kind], choices: w.typeChoices };
  const finite = p.kind !== 'infinite';
  const part = {
    line: () => ({ id: 'line', label: 'Bug line', ask: 'Which line has the bug?', answerType: 'choice', ...lineQ }),
    fix: () => ({ id: 'fix', label: 'Fix', ask: 'Which line should replace it?', answerType: 'choice', ...fixQ }),
    actual: () => ({ id: 'actual', label: 'Actual result', ask: 'What does the buggy version return for the example?', answerType: 'number', answer: p.actual, tolerance: 0 }),
    type: () => ({ id: 'type', label: 'Bug type', ask: 'What kind of bug is it?', answerType: 'choice', ...typeQ }),
  };
  const base = { lang: L, explanation: expl };
  let meta = { mode: 'bug', ...p };
  const H = bugHints(p, w, L);

  if (diff === 'hard') {
    const ids = sub === 'find-the-bug' ? ['line', finite ? 'actual' : 'type']
      : sub === 'fix-the-bug' ? ['line', 'fix', ...(finite ? ['actual'] : [])]
      : ['type', finite ? 'actual' : 'line'];
    meta = { ...meta, ask: 'multi', parts: ids };
    return { ...base, prompt: `${spec}\n\n${codeBlock}\n\nThis version has one bug. Answer each part.`, answerType: 'multi', parts: ids.map(id => ({ ...part[id](), hint: H.part[id] })), meta };
  }
  let ask, q;
  if (sub === 'find-the-bug') { ask = 'line'; q = `${spec}\n\n${codeBlock}\n\nOne line has a bug. Which line is it?`; }
  else if (sub === 'fix-the-bug') {
    ask = 'fix';
    q = diff === 'easy'
      ? `${spec}\n\n${codeBlock}\n\nLine ${w.bugLine} has a bug. Which line should replace it?`
      : `${spec}\n\n${codeBlock}\n\nOne line has a bug. Which replacement line fixes the function?`;
  } else if (finite && p.askActual) { ask = 'actual'; q = `${spec}\n\n${codeBlock}\n\nThis version has a bug. What does it actually return for the example?`; }
  else { ask = 'type'; q = `${spec}\n\n${codeBlock}\n\nThis version has a bug. What kind of bug is it?`; }
  meta = { ...meta, ask };
  const one = part[ask]();
  const hints = ask === 'fix' && diff === 'easy' ? H.fixGiven : H[ask];
  return { ...base, prompt: q, answerType: one.answerType, answer: one.answer, choices: one.choices, tolerance: one.tolerance, meta, hints };
}

// ---- guided-mode hints (built from the plan and its rendering; never draw from rng) ----

// Variables worth writing down while tracing each template.
function trackNames(tplId, c) {
  switch (tplId) {
    case 'sum-to': case 'power': case 'sum-while': case 'increases': return [c.acc, c.i];
    case 'sum-list': return [c.acc, c.indexed ? c.i : c.x];
    case 'count-if': return c.style === 'while' ? [c.acc, c.i] : [c.acc, c.x];
    case 'min-max': return [c.best, c.style === 'index' ? c.i : c.x];
    case 'digit-sum': return [c.acc, c.n];
    case 'find-index': return [c.i];
    case 'pair-count': return [c.acc, c.i, c.j];
    default: return [];
  }
}
const nameList = (ns, L) => ns.map(n => code(n, L)).join(' and ');
// A loop reminder that fits the function's loop, whatever the bug is.
function loopNote(fnBody, L) {
  if (fnBody.some(s => s.k === 'forRange')) return ` Remember: ${rangeText(L)}.`;
  if (fnBody.some(s => s.k === 'while')) return ' A `while` loop checks its condition before every pass, so check it on the last pass too.';
  return '';
}
const CHECKLIST = 'Ask what is different from correct code: a starting value, how far the loop runs, a comparison, ' +
  'an arithmetic operator, `=` where it should add on, which list position is read, where the `return` sits, ' +
  'or whether the loop variable ever moves.';

function bugHints(p, w, L) {
  const { tpl, c } = w;
  const body = w.bad.fns[0].body;
  const ex = exampleText(tpl, c, p.ex, L);
  const specH = `Read the spec first: ${sig(tpl, c, L)} should return ${tpl.desc(c, L)}. For the example, ${ex}, that is **${p.want}** (${tpl.work(c, p.ex)}).`;
  const vars = trackNames(p.tpl, c);
  const traceH = `Trace the code with the example input, line by line. Write down ${nameList(vars, L)} after every line that changes them.${loopNote(body, L)}`;
  const findH = 'The first line where your trace stops matching what the spec needs is the bug. Check the starting values, the first and last pass of the loop, the condition and the update line.';
  const tryFix = `Put each replacement in place of the buggy line and rerun the example: the right one returns ${p.want}, and it must also work for any other input, not just this one.`;
  const runH = `Run the code exactly as it is written, bug included, not as it should work. Trace ${ex}, writing down ${nameList(vars, L)} as they change, until it returns.${loopNote(body, L)}`;
  return {
    line: [specH, traceH, findH],
    fix: [specH, traceH, `Once you have found the wrong line, compare it with what the spec needs. ${tryFix}`],
    fixGiven: [specH, `Line ${w.bugLine} is \`${lineAt(w.R, p.slot)}\`. Work out what it does on each pass and compare that with what the spec needs.`, tryFix],
    actual: [specH, runH],
    type: [specH, `${traceH} Find the line where it goes wrong first.`, CHECKLIST],
    part: {
      line: `${traceH} The first line where your trace stops matching what the spec needs is the bug.`,
      fix: `${tryFix}`,
      actual: runH,
      type: `Find the wrong line first, then name the mistake. ${CHECKLIST}`,
    },
  };
}

function predictHints(m, L) {
  if (m.form === 'call') {
    const tpl = T[m.tpl], c = m.c;
    const body = fnProg(tpl, c).fns[0].body;
    const vars = trackNames(m.tpl, c);
    const callH = (a, j = 0) => `Trace ${exampleText(tpl, c, a, L)}${a.some(Array.isArray) ? ` (the program passes ${code(m.listNames[j], L)})` : ''}: write down ${nameList(vars, L)} after every line that changes them.${loopNote(body, L)}`;
    const what = `${sig(tpl, c, L)} works out ${tpl.desc(c, L)}. The program prints what the call returns.`;
    if (m.ask === 'two') return { part: { first: `${callH(m.calls[0])} The first line printed is what this call returns.`, second: `${callH(m.calls[1], 1)} The second line printed is what this call returns.` } };
    return { hints: [what, callH(m.calls[0])] };
  }
  const c = m.c;
  if (m.form === 'loop') {
    const i = code(c.i, L);
    const range = c.down ? `${i} starts at ${c.b} and counts down by ${c.s}, stopping before it reaches ${c.a}.`
      : `${i} starts at ${c.a} and counts up by ${c.s}, stopping before ${c.b}. Remember: ${rangeText(L)}.`;
    const each = `Each pass prints ${i}${c.m === 1 ? '' : ` × ${c.m}`}${c.add ? ` + ${c.add}` : ''}.`;
    if (m.ask === 'count-last') {
      return { part: {
        count: `${range} List the values of ${i} and count them: one line is printed per value.`,
        last: `${each} Use the last value of ${i} from your list.`,
      } };
    }
    return { hints: [range, `List the values of ${i} first. ${each}`,
      m.ask === 'total' ? 'Work out every printed number, then add them all up.' : 'The last line comes from the last value of ' + i + '.'] };
  }
  if (m.form === 'arith') {
    return { hints: [`Track ${code(c.a, L)} and ${code(c.b, L)} line by line. Each line changes only the variable on its left.`,
      `They start at ${code(c.a, L)} = ${c.va} and ${code(c.b, L)} = ${c.vb}. A line that uses both reads their current values, not the starting ones. At the end, print shows ${code(c.out === 'a' ? c.a : c.b, L)}.`] };
  }
  if (m.form === 'grow') {
    const x = code(c.x, L), i = code(c.i, L);
    return { hints: [`${x} starts at ${c.x0}. The loop runs ${c.k} times, with ${i} = 0, 1, …, ${c.k - 1} (${rangeText(L)}).`,
      `Each pass sets ${x} to ${x} × ${c.m} + ${i}, using the current ${x}. First pass: ${c.x0} × ${c.m} + 0 = ${c.x0 * c.m}. Keep going for the other passes.`] };
  }
  if (m.form === 'collatz') {
    const n = code(c.n, L);
    return { part: {
      first: `Start at ${n} = ${c.v}. Even: halve it. Odd: 3 × ${n} + 1. Write each new value until you reach 1, then count the moves (not the values).`,
      second: `${code(c.peak, L)} keeps the highest value seen, starting with ${c.v} itself. Look for the biggest number in your list of values.`,
    } };
  }
  // nested
  const i = code(c.i, L), j = code(c.j, L);
  const pairs = `${i} takes the values 1 to ${c.a}; for each ${i}, ${j} takes ${i} up to ${c.b} (the loop ends are one past these, because ${rangeText(L)}). List every pair (${i}, ${j}).`;
  return { part: {
    first: `${pairs} Count the pairs where (${i} + ${j}) % ${c.k} is 0.`,
    second: `Use the same pairs and add up ${i} × ${j} for every one of them.`,
  } };
}

// ---- predict-output plans (no lang) ----
const PREDICT_POOL = {
  easy: ['sum-to', 'power', 'sum-list', 'count-if'],
  medium: ['sum-to', 'count-if', 'min-max', 'digit-sum', 'sum-while', 'find-index'],
  hard: ['count-if', 'min-max', 'digit-sum', 'sum-while', 'find-index', 'increases', 'power', 'sum-list'],
};

// Main-only programs: build(c) → program; predictRef(meta) recomputes the printed lines in plain JS.
const P = {};

P.arith = {
  plan(rng) {
    const [a, b] = rng.pick([['a', 'b'], ['x', 'y'], ['width', 'height'], ['left', 'right'], ['first', 'second'], ['apples', 'pears']]);
    const ops = Array.from({ length: rng.int(3, 4) }, () => ({ t: rng.pick(['a', 'b']), kind: rng.pick(['add', 'sub', 'mul', 'sum', 'diff']), k: rng.int(2, 5) }));
    return { a, b, va: rng.int(1, 9), vb: rng.int(1, 9), ops, out: rng.pick(['a', 'b']) };
  },
  build(c) {
    const nm = w => (w === 'a' ? c.a : c.b);
    const st = [S.decl(c.a, c.va), S.decl(c.b, c.vb)];
    for (const o of c.ops) {
      const t = nm(o.t);
      if (o.kind === 'add') st.push(S.augAssign(t, '+', o.k));
      else if (o.kind === 'sub') st.push(S.augAssign(t, '-', o.k));
      else if (o.kind === 'mul') st.push(S.augAssign(t, '*', o.k));
      else if (o.kind === 'sum') st.push(S.assign(t, B('+', V(c.a), V(c.b))));
      else st.push(S.assign(t, B('-', V(c.a), V(c.b))));
    }
    st.push(S.print(V(nm(c.out))));
    return program([], st);
  },
  ref(c) {
    const env = { a: c.va, b: c.vb }, steps = [];
    for (const o of c.ops) {
      const t = o.t;
      env[t] = o.kind === 'add' ? env[t] + o.k : o.kind === 'sub' ? env[t] - o.k : o.kind === 'mul' ? env[t] * o.k
        : o.kind === 'sum' ? env.a + env.b : env.a - env.b;
      steps.push(`${o.t === 'a' ? c.a : c.b} = ${env[t]}`);
    }
    return { lines: [env[c.out]], steps };
  },
};

P.loop = {
  plan(rng) {
    const s = rng.int(1, 3), a = rng.int(0, 4), b = a + s * rng.int(2, 5) + rng.int(0, s - 1);
    return { i: rng.pick(IDX), a, b, s, down: rng.next() < 0.35, m: rng.int(1, 4), add: rng.int(0, 5) };
  },
  build(c) {
    const i = V(c.i);
    let e = c.m === 1 ? i : B('*', i, c.m);
    if (c.add) e = B('+', e, c.add);
    return program([], [c.down ? S.forRange(c.i, c.b, c.a, -c.s, [S.print(e)]) : S.forRange(c.i, c.a, c.b, c.s, [S.print(e)])]);
  },
  ref(c) {
    const is = [];
    if (c.down) for (let i = c.b; i > c.a; i -= c.s) is.push(i);
    else for (let i = c.a; i < c.b; i += c.s) is.push(i);
    return { lines: is.map(i => i * c.m + c.add), is };
  },
};

P.grow = {
  plan(rng) {
    const [x, i] = names(rng, [['x', 'value', 'size', 'level'], IDX]);
    return { x, i, x0: rng.int(1, 4), k: rng.int(3, 5), m: rng.int(2, 3) };
  },
  build(c) {
    return program([], [S.decl(c.x, c.x0), S.forRange(c.i, 0, c.k, 1, [S.assign(c.x, B('+', B('*', V(c.x), c.m), V(c.i)))]), S.print(V(c.x))]);
  },
  ref(c) {
    let x = c.x0;
    const steps = [];
    for (let i = 0; i < c.k; i++) { x = x * c.m + i; steps.push(x); }
    return { lines: [x], steps };
  },
};

P.collatz = {
  plan(rng) {
    const [n, steps, peak] = names(rng, [['n', 'num', 'value'], ['steps', 'moves', 'count'], ['peak', 'highest', 'biggest']]);
    return { n, steps, peak, v: rng.pick([3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 22, 24, 26]) };
  },
  build(c) {
    const n = V(c.n);
    return program([], [
      S.decl(c.n, c.v), S.decl(c.steps, 0), S.decl(c.peak, c.v),
      S.while(B('!=', n, 1), [
        S.if(B('==', B('%', n, 2), 0), [S.assign(c.n, B('/', n, 2))], [], [S.assign(c.n, B('+', B('*', 3, n), 1))]),
        S.if(B('>', n, V(c.peak)), [S.assign(c.peak, n)]),
        S.augAssign(c.steps, '+', 1),
      ]),
      S.print(V(c.steps)), S.print(V(c.peak)),
    ]);
  },
  ref(c) {
    let n = c.v, steps = 0, peak = c.v;
    const seq = [n];
    while (n !== 1) { n = n % 2 === 0 ? n / 2 : 3 * n + 1; peak = Math.max(peak, n); steps++; seq.push(n); }
    return { lines: [steps, peak], seq };
  },
};

P.nested = {
  plan(rng) {
    const [count, total, i, j] = names(rng, [COUNTS, ACC, ['i', 'row'], ['j', 'col']]);
    return { count, total, i, j, a: rng.int(2, 4), b: rng.int(3, 5), k: rng.int(2, 3) };
  },
  build(c) {
    const i = V(c.i), j = V(c.j);
    return program([], [
      S.decl(c.count, 0), S.decl(c.total, 0),
      S.forRange(c.i, 1, c.a + 1, 1, [
        S.forRange(c.j, i, c.b + 1, 1, [
          S.if(B('==', B('%', B('+', i, j), c.k), 0), [S.augAssign(c.count, '+', 1)]),
          S.augAssign(c.total, '+', B('*', i, j)),
        ]),
      ]),
      S.print(V(c.count)), S.print(V(c.total)),
    ]);
  },
  ref(c) {
    let count = 0, total = 0;
    const pairs = [];
    for (let i = 1; i <= c.a; i++) for (let j = i; j <= c.b; j++) { pairs.push([i, j]); if ((i + j) % c.k === 0) count++; total += i * j; }
    return { lines: [count, total], pairs };
  },
};

function callProgram(tpl, c, calls, listNames) {
  const fn = fnProg(tpl, c).fns[0];
  const main = [];
  calls.forEach((args, j) => {
    const argE = args.map(a => (Array.isArray(a) ? V(listNames[j]) : a));
    args.forEach(a => { if (Array.isArray(a)) main.push(S.decl(listNames[j], E.list(a))); });
    main.push(S.print(E.call(c.f, argE)));
  });
  return program([fn], main);
}

function predictProgram(m) {
  return m.form === 'call' ? callProgram(T[m.tpl], m.c, m.calls, m.listNames) : P[m.form].build(m.c);
}
// Independent expected output lines (plain JS, no interpreter).
function predictRef(m) {
  if (m.form === 'call') return m.calls.map(a => T[m.tpl].ref(m.c, a));
  return P[m.form].ref(m.c).lines;
}
function runLines(prog) {
  try {
    const r = run(prog, { maxSteps: MAX_STEPS });
    return r.timedOut ? null : r.output;
  } catch { return null; }
}

function planPredict(rng, diff) {
  for (let attempt = 0; attempt < 40; attempt++) {
    let m;
    const useP = rng.next() < (diff === 'easy' ? 0.35 : 0.4);
    if (useP) {
      const form = rng.pick(diff === 'easy' ? ['arith'] : diff === 'medium' ? ['loop', 'grow'] : ['loop', 'collatz', 'nested']);
      m = { form, c: P[form].plan(rng) };
      if (form === 'loop') m.ask = diff === 'hard' ? 'count-last' : rng.pick(['last', 'total']);
      else m.ask = diff === 'hard' ? 'two' : 'one';
    } else {
      const tplId = rng.pick(PREDICT_POOL[diff]), tpl = T[tplId];
      const c = tpl.make(rng, diff === 'hard' ? 'medium' : diff);
      const n = diff === 'hard' ? 2 : 1;
      const calls = Array.from({ length: n }, () => tpl.input(c, rng));
      const listNames = rng.shuffle(MAIN_LISTS).slice(0, n);
      m = { form: 'call', tpl: tplId, c, calls, listNames, ask: n === 2 ? 'two' : 'one' };
      if (n === 2 && tpl.ref(c, calls[0]) === tpl.ref(c, calls[1])) continue;
    }
    const want = predictRef(m), out = runLines(predictProgram(m));
    if (!out || out.length !== want.length || out.some((s, j) => s !== String(want[j]))) continue;
    if (m.form === 'loop' && (want.length < 2 || want.length > 7)) continue;
    return m;
  }
  throw new Error('could not plan a predict question');
}

function predictAnswers(m) {
  const lines = predictRef(m);
  if (m.ask === 'last') return { one: lines[lines.length - 1] };
  if (m.ask === 'total') return { one: lines.reduce((a, b) => a + b, 0) };
  if (m.ask === 'count-last') return { count: lines.length, last: lines[lines.length - 1] };
  if (m.ask === 'two') return { first: lines[0], second: lines[1] };
  return { one: lines[0] };
}

function presentPredict(m, L) {
  const prog = predictProgram(m);
  const R = render(prog, L, { lineNumbers: true });
  const codeBlock = '```' + fence(L) + '\n' + R.code + '\n```';
  const ans = predictAnswers(m), lines = predictRef(m);
  let expl;
  if (m.form === 'call') {
    const tpl = T[m.tpl];
    expl = m.calls.map((a, j) => `${sig(tpl, m.c, L)} returns ${tpl.desc(m.c, L)}. ${exampleText(tpl, m.c, a, L).replace(/^`/, 'For `')}: ${tpl.work(m.c, a)}, so it prints **${lines[j]}**.`).join('\n\n');
  } else if (m.form === 'loop') {
    const r = P.loop.ref(m.c);
    expl = `${code(m.c.i, L)} takes the values ${r.is.join(', ')}. Each line prints ${code(m.c.i, L)}${m.c.m === 1 ? '' : ` × ${m.c.m}`}${m.c.add ? ` + ${m.c.add}` : ''}: ${lines.join(', ')}.`;
    if (m.ask === 'total') expl += ` The total is ${lines.join(' + ')} = **${ans.one}**.`;
    else if (m.ask === 'last') expl += ` The last line is **${ans.one}**.`;
    else expl += ` That is **${ans.count}** lines, and the last is **${ans.last}**.`;
  } else if (m.form === 'arith') {
    expl = `Track the values line by line: ${P.arith.ref(m.c).steps.join(', ')}. It prints **${ans.one}**.`;
  } else if (m.form === 'grow') {
    expl = `${code(m.c.x, L)} starts at ${m.c.x0}; each pass sets it to ${code(m.c.x, L)} × ${m.c.m} + ${code(m.c.i, L)}: ${P.grow.ref(m.c).steps.join(', ')}. It prints **${ans.one}**.`;
  } else if (m.form === 'collatz') {
    expl = `The values go ${P.collatz.ref(m.c).seq.join(' → ')}. That is **${lines[0]}** steps, and the highest value is **${lines[1]}**.`;
  } else {
    expl = `The inner loop runs over the pairs ${P.nested.ref(m.c).pairs.map(([i, j]) => `(${i}, ${j})`).join(', ')}. **${lines[0]}** of them have a sum divisible by ${m.c.k}, and the products add up to **${lines[1]}**.`;
  }
  const meta = { mode: 'predict', ...m };
  const H = predictHints(m, L);
  const num = (id, label, ask, answer) => ({ id, label, ask, answerType: 'number', answer, tolerance: 0, hint: H.part[id] });
  if (m.ask === 'two') {
    return { lang: L, prompt: `${codeBlock}\n\nThis program prints two lines. What are they?`, answerType: 'multi',
      parts: [num('first', 'First output', 'What is the first line printed?', ans.first), num('second', 'Second output', 'What is the second line printed?', ans.second)],
      explanation: expl, meta };
  }
  if (m.ask === 'count-last') {
    return { lang: L, prompt: `${codeBlock}\n\nAnswer both parts about what this program prints.`, answerType: 'multi',
      parts: [num('count', 'Lines printed', 'How many lines does it print?', ans.count), num('last', 'Last line', 'What is the last line it prints?', ans.last)],
      explanation: expl, meta };
  }
  const q = m.ask === 'last' ? 'What is the last line this program prints?' : m.ask === 'total' ? 'What is the total of all the numbers this program prints?' : 'What does this program print?';
  return { lang: L, prompt: `${codeBlock}\n\n${q}`, answerType: 'number', answer: ans.one, tolerance: 0, explanation: expl, meta, hints: H.hints };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Expert. Only reached from difficulty 'expert', so easy/medium/hard draw exactly as before.
//   predict-output: longer programs that keep state across many steps (Euclid's loop, a bubble-sort
//                   pass that swaps list items, a running best with resets, nested pair loops).
//   find-the-bug / bug-types: TWO bugs on different lines; each one matters on its own.
//   fix-the-bug: one bug, three examples, and at least one tempting fix that repairs the first
//                example but breaks another.
// ════════════════════════════════════════════════════════════════════════════════════════════════

P.gcd = {
  plan(rng) {
    const [a, b] = rng.pick([['a', 'b'], ['big', 'small'], ['x', 'y'], ['left', 'right']]);
    const [steps, keep] = names(rng, [['steps', 'moves', 'rounds'], ['tmp', 'old', 'keep']]);
    const g = rng.int(2, 12), p = rng.int(3, 15);
    let q = rng.int(2, 14);
    if (q === p) q = p - 1;
    return { a, b, steps, keep, va: g * p, vb: g * q };
  },
  build(c) {
    return program([], [
      S.decl(c.a, c.va), S.decl(c.b, c.vb), S.decl(c.steps, 0),
      S.while(B('!=', V(c.b), 0), [S.decl(c.keep, V(c.b)), S.assign(c.b, B('%', V(c.a), V(c.b))), S.assign(c.a, V(c.keep)), S.augAssign(c.steps, '+', 1)]),
      S.print(V(c.a)), S.print(V(c.steps)),
    ]);
  },
  ref(c) {
    let a = c.va, b = c.vb, steps = 0;
    const seq = [[a, b]];
    while (b !== 0) { const k = b; b = a % b; a = k; steps++; seq.push([a, b]); }
    return { lines: [a, steps], seq };
  },
};

P.bubble = {
  plan(rng) {
    const [xs, n, swaps, keep] = names(rng, [['xs', 'nums', 'cards', 'heights'], ['n', 'size', 'count'], ['swaps', 'moves', 'flips'], ['tmp', 'held', 'spare']]);
    const [i, j] = rng.pick([['i', 'j'], ['p', 'k'], ['pass_no', 'pos']]);
    const items = Array.from({ length: rng.int(5, 6) }, () => rng.int(1, 30));
    const ks = rng.shuffle(Array.from({ length: items.length }, (_, k) => k)).slice(0, 2).sort((x, y) => x - y);
    return { xs, n, swaps, keep, i, j, items, passes: rng.int(1, 2), k1: ks[0], k2: ks[1] };
  },
  build(c) {
    const j = V(c.j), j1 = B('+', j, 1);
    return program([], [
      S.decl(c.xs, E.list(c.items)), S.decl(c.n, LEN(c.xs)), S.decl(c.swaps, 0),
      S.forRange(c.i, 0, c.passes, 1, [S.forRange(c.j, 0, B('-', B('-', V(c.n), 1), V(c.i)), 1, [
        S.if(B('>', IX(c.xs, j), IX(c.xs, j1)), [
          S.decl(c.keep, IX(c.xs, j)), S.setIndex(c.xs, j, IX(c.xs, j1)), S.setIndex(c.xs, j1, V(c.keep)), S.augAssign(c.swaps, '+', 1),
        ]),
      ])]),
      S.print(V(c.swaps)), S.print(IX(c.xs, c.k1)), S.print(IX(c.xs, c.k2)),
    ]);
  },
  ref(c) {
    const xs = c.items.slice(), after = [];
    let swaps = 0;
    for (let i = 0; i < c.passes; i++) {
      for (let j = 0; j < xs.length - 1 - i; j++) if (xs[j] > xs[j + 1]) { const k = xs[j]; xs[j] = xs[j + 1]; xs[j + 1] = k; swaps++; }
      after.push(xs.slice());
    }
    return { lines: [swaps, xs[c.k1], xs[c.k2]], after };
  },
};

P.kadane = {
  plan(rng) {
    const [xs, best, run, x] = names(rng, [['xs', 'gains', 'changes', 'steps'], ['best', 'record', 'top'], ['run', 'current', 'streak'], ELEMS]);
    const items = Array.from({ length: rng.int(6, 8) }, () => rng.int(-9, 9));
    items[rng.int(0, 2)] = -rng.int(3, 9);
    items[rng.int(3, items.length - 1)] = -rng.int(3, 9);
    return { xs, best, run, x, items };
  },
  build(c) {
    return program([], [
      S.decl(c.xs, E.list(c.items)), S.decl(c.best, 0), S.decl(c.run, 0),
      S.forEach(c.x, c.xs, [
        S.augAssign(c.run, '+', V(c.x)),
        S.if(B('<', V(c.run), 0), [S.assign(c.run, 0)]),
        S.if(B('>', V(c.run), V(c.best)), [S.assign(c.best, V(c.run))]),
      ]),
      S.print(V(c.best)), S.print(V(c.run)),
    ]);
  },
  ref(c) {
    let best = 0, run = 0;
    const trace = [];
    for (const x of c.items) { run += x; if (run < 0) run = 0; if (run > best) best = run; trace.push(run); }
    return { lines: [best, run], trace };
  },
};

const X_PREDICT_TPLS = ['pair-count', 'increases', 'min-max', 'find-index', 'count-if'];
function planPredictX(rng) {
  for (let attempt = 0; attempt < 40; attempt++) {
    let m;
    if (rng.next() < 0.6) {
      const form = rng.pick(['gcd', 'bubble', 'kadane']);
      m = { form, c: P[form].plan(rng), ask: form === 'bubble' ? 'three' : 'two' };
    } else {
      const tplId = rng.pick(X_PREDICT_TPLS), tpl = T[tplId], c = tpl.make(rng, 'hard');
      const calls = [tpl.input(c, rng), tpl.input(c, rng)];
      m = { form: 'call', tpl: tplId, c, calls, listNames: rng.shuffle(MAIN_LISTS).slice(0, 2), ask: 'two' };
      if (tpl.ref(c, calls[0]) === tpl.ref(c, calls[1])) continue;
    }
    const want = predictRef(m), out = runLines(predictProgram(m));
    if (!out || out.length !== want.length || out.some((s, j) => s !== String(want[j]))) continue;
    if (m.form === 'bubble' && want[0] === 0) continue;
    return m;
  }
  throw new Error('could not plan an expert predict question');
}

function presentPredictX(m, L) {
  const prog = predictProgram(m);
  const R = render(prog, L, { lineNumbers: true });
  const codeBlock = '```' + fence(L) + '\n' + R.code + '\n```';
  const lines = predictRef(m), c = m.c;
  let expl, hint;
  if (m.form === 'call') {
    const tpl = T[m.tpl];
    expl = m.calls.map((a, j) => `${exampleText(tpl, c, a, L).replace(/^`/, 'For `')}: ${tpl.work(c, a)}, so it prints **${lines[j]}**.`).join('\n\n');
    expl = `${sig(tpl, c, L)} returns ${tpl.desc(c, L)}.\n\n${expl}`;
    const vars = trackNames(m.tpl, c), body = fnProg(tpl, c).fns[0].body;
    const callH = (a, j) => `Trace ${exampleText(tpl, c, a, L)}${a.some(Array.isArray) ? ` (the program passes ${code(m.listNames[j], L)})` : ''}: write down ${nameList(vars, L)} every time they change.${loopNote(body, L)}`;
    hint = { first: `${callH(m.calls[0], 0)} The first line is what this call returns.`, second: `${callH(m.calls[1], 1)} The second call starts from scratch: nothing carries over from the first.` };
  } else if (m.form === 'gcd') {
    const r = P.gcd.ref(c), A = code(c.a, L), Bn = code(c.b, L);
    expl = `Each pass sets ${Bn} to the remainder of ${A} ÷ ${Bn}, and ${A} to the old ${Bn}. (${A}, ${Bn}) goes ${r.seq.map(([x, y]) => `(${x}, ${y})`).join(' → ')}. ` +
      `The loop stops when ${Bn} is 0, so it prints ${A} = **${lines[0]}** and then **${lines[1]}** passes. (This is Euclid's method: the result is the greatest common divisor.)`;
    hint = {
      first: `${code(c.keep, L)} holds the old ${Bn} so it is not lost. Each pass: new ${Bn} = ${A} % ${Bn}, new ${A} = old ${Bn}. Write (${A}, ${Bn}) after every pass until ${Bn} is 0; the first line is ${A} then.`,
      second: `${code(c.steps, L)} goes up once per pass. Count the passes in your table (not the rows: the first row is before any pass).`,
    };
  } else if (m.form === 'bubble') {
    const r = P.bubble.ref(c), X = code(c.xs, L);
    expl = `Each pass walks along the list and swaps neighbours that are in the wrong order (left bigger than right). ${X} starts as ${listText(c.items)}. ` +
      r.after.map((a, k) => `After pass ${k + 1}: ${listText(a)}.`).join(' ') + ` There were **${lines[0]}** swaps; ${X}[${c.k1}] is **${lines[1]}** and ${X}[${c.k2}] is **${lines[2]}**.`;
    hint = {
      first: `The outer loop runs ${c.passes} time${c.passes === 1 ? '' : 's'}. In each pass ${code(c.j, L)} goes from 0 up to ${code(c.n, L)} − 2 − ${code(c.i, L)}, comparing positions ${code(c.j, L)} and ${code(c.j, L)} + 1, and swaps them when the left one is bigger. Write the list out again after every swap, and count the swaps.`,
      second: `The swaps change the list itself. Use your list after the last pass, counting positions from 0: read position ${c.k1}.`,
      third: `Same final list: read position ${c.k2}, counting from 0.`,
    };
  } else {
    const r = P.kadane.ref(c), Rn = code(c.run, L), Bn = code(c.best, L);
    expl = `${Rn} adds each number, but drops back to 0 whenever it goes negative; ${Bn} keeps the highest ${Rn} seen. ` +
      `After each number ${Rn} is ${r.trace.join(', ')}. So ${Bn} is **${lines[0]}** and the final ${Rn} is **${lines[1]}**.`;
    hint = {
      first: `Make two columns, ${Rn} and ${Bn}. For each number: add it to ${Rn}; if ${Rn} is now below 0, set it to 0; then if ${Rn} beats ${Bn}, copy it into ${Bn}. The first line is ${Bn} at the end.`,
      second: `The second line is ${Rn} after the last number, with any reset to 0 already applied.`,
    };
  }
  const num = (id, label, ask, answer) => ({ id, label, ask, answerType: 'number', answer, tolerance: 0, hint: hint[id] });
  const parts = m.ask === 'three'
    ? [num('first', 'First output', 'What is the first line printed?', lines[0]), num('second', 'Second output', 'What is the second line printed?', lines[1]), num('third', 'Third output', 'What is the third line printed?', lines[2])]
    : [num('first', 'First output', 'What is the first line printed?', lines[0]), num('second', 'Second output', 'What is the second line printed?', lines[1])];
  return { lang: L, prompt: `${codeBlock}\n\nThis program prints ${parts.length} lines. What are they?`, answerType: 'multi', parts, explanation: expl, meta: { mode: 'predict', ...m } };
}

// ---- expert bug plans ----
const X_BUG_POOL = ['pair-count', 'pair-count', 'count-if', 'min-max', 'sum-while', 'find-index', 'increases', 'digit-sum'];
const realBugs = slots => {
  const out = [];
  for (const [slot, alts] of Object.entries(slots)) {
    for (const [key, kind] of Object.entries(alts)) if (!['other', 'early', 'infinite'].includes(kind)) out.push({ slot, key, kind });
  }
  return out;
};
const passesAll = (tpl, c, prog, tests) => tests.every(a => { const r = exec(prog, c.f, a); return r.ok && r.value === tpl.ref(c, a); });
const kindPair = ks => ks.slice().sort((x, y) => CAT_KINDS.indexOf(x) - CAT_KINDS.indexOf(y));

// Two bugs on different lines. sub 'bug-types' also needs two different, clearly separate kinds.
function planTwoBugs(rng, sub) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const tplId = rng.pick(X_BUG_POOL), tpl = T[tplId], c = tpl.make(rng, 'hard');
    const bugs = realBugs(tpl.slots(c));
    if (!bugs.length) continue;
    const b1 = rng.pick(bugs);
    const rest = bugs.filter(b => b.slot !== b1.slot && (sub !== 'bug-types' || (b.kind !== b1.kind && typeOk(b1.kind, b.kind))));
    if (!rest.length) continue;
    const b2 = rng.pick(rest);
    const good = fnProg(tpl, c), bad = fnProg(tpl, c, { [b1.slot]: b1.key, [b2.slot]: b2.key });
    let ex = null, actual = null;
    for (let t = 0; t < 30 && !ex; t++) {
      const a = tpl.input(c, rng), want = tpl.ref(c, a);
      const g = exec(good, c.f, a);
      if (!g.ok || g.value !== want) continue;
      const r = exec(bad, c.f, a);
      if (r.ok && r.value !== want) { ex = a; actual = r.value; }
    }
    if (!ex) continue;
    const tests = [ex];
    for (let t = 0; t < 6; t++) tests.push(tpl.input(c, rng));
    if (!passesAll(tpl, c, good, tests)) continue;
    // Each bug matters on its own: fixing just one of them still fails a test.
    if (passesAll(tpl, c, fnProg(tpl, c, { [b1.slot]: b1.key }), tests) || passesAll(tpl, c, fnProg(tpl, c, { [b2.slot]: b2.key }), tests)) continue;
    const order = stmtIds(bad.fns[0].body);
    const pair = (x, y) => [x, y].sort((u, v) => order.indexOf(u) - order.indexOf(v));
    const others = order.filter(id => id !== b1.slot && id !== b2.slot);
    if (others.length < 3) continue;
    const [o0, o1, o2] = rng.shuffle(others).slice(0, 3);
    const linePairs = rng.shuffle([pair(b1.slot, b2.slot), pair(b1.slot, o0), pair(b2.slot, o1), pair(o1, o2)]);
    let typePairs = null;
    if (sub === 'bug-types') {
      const xs = rng.shuffle(CAT_KINDS.filter(k => typeOk(b1.kind, k) && typeOk(b2.kind, k)));
      if (xs.length < 2) continue;
      typePairs = rng.shuffle([kindPair([b1.kind, b2.kind]), kindPair([b1.kind, xs[0]]), kindPair([b2.kind, xs[1]]), kindPair([xs[0], xs[1]])]);
    }
    const two = [b1, b2].sort((u, v) => order.indexOf(u.slot) - order.indexOf(v.slot));
    return { tpl: tplId, c, bugs: two, ex, want: tpl.ref(c, ex), actual, tests, linePairs, typePairs };
  }
  throw new Error('could not plan a two-bug question');
}

// One bug, three shown examples; the fix options include at least one trap that repairs the
// first example but breaks another one.
function planFixTrap(rng) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const tplId = rng.pick(X_BUG_POOL), tpl = T[tplId], c = tpl.make(rng, 'hard'), slots = tpl.slots(c);
    const bugs = realBugs(slots);
    if (!bugs.length) continue;
    const bug = rng.pick(bugs);
    const good = fnProg(tpl, c), bad = fnProg(tpl, c, { [bug.slot]: bug.key });
    const shown = [];
    for (let t = 0; t < 40 && shown.length < 3; t++) {
      const a = tpl.input(c, rng), want = tpl.ref(c, a);
      const g = exec(good, c.f, a);
      if (!g.ok || g.value !== want || shown.some(s => tpl.ref(c, s) === want)) continue;
      if (!shown.length) { const r = exec(bad, c.f, a); if (!(r.ok && r.value !== want)) continue; }
      shown.push(a);
    }
    if (shown.length < 3) continue;
    const tests = [...shown];
    for (let t = 0; t < 4; t++) tests.push(tpl.input(c, rng));
    if (!passesAll(tpl, c, good, tests)) continue;
    const traps = [], plain = [];
    const seen = new Set([meaningKey(tpl, c)]);
    for (const k of Object.keys(slots[bug.slot])) {
      if (k === bug.key || slots[bug.slot][k] === 'early') continue;
      // Skip a variant that means the same as the correct line or one already kept (`x > c` vs `c < x`).
      const key = meaningKey(tpl, c, { [bug.slot]: k });
      if (seen.has(key)) continue;
      seen.add(key);
      const p = fnProg(tpl, c, { [bug.slot]: k });
      const rs = shown.map(a => exec(p, c.f, a));
      if (rs.some(r => r.threw)) continue;
      const okAt = rs.map((r, j) => r.ok && r.value === tpl.ref(c, shown[j]));
      if (okAt.every(Boolean)) continue;
      (okAt[0] ? traps : plain).push(k);
    }
    if (!traps.length || traps.length + plain.length < 3) continue;
    const tr = rng.shuffle(traps), t2 = tr.slice(0, 2);
    const wrong = [...t2, ...rng.shuffle(plain).slice(0, 3 - t2.length)];
    if (wrong.length < 3) { wrong.push(...tr.slice(2, 2 + 3 - wrong.length)); t2.push(...wrong.filter(k => traps.includes(k) && !t2.includes(k))); }
    if (wrong.length !== 3) continue;
    const fixKeys = rng.shuffle(['ok', ...wrong]);
    const others = stmtIds(bad.fns[0].body).filter(id => id !== bug.slot);
    if (others.length < 3) continue;
    const lineIds = rng.shuffle([bug.slot, ...rng.shuffle(others).slice(0, 3)]);
    const ex = shown[0];
    return { tpl: tplId, c, slot: bug.slot, key: bug.key, kind: bug.kind, ex, want: tpl.ref(c, ex), actual: exec(bad, c.f, ex).value, shown, tests, fixKeys, lineIds, traps: t2 };
  }
  throw new Error('could not plan a fix-trap question');
}

// Everything an expert bug question shows (used by generate and verify).
function bugViewX(p, L) {
  const tpl = T[p.tpl], c = p.c;
  const vars = p.bugs ? Object.fromEntries(p.bugs.map(b => [b.slot, b.key])) : { [p.slot]: p.key };
  const bad = fnProg(tpl, c, vars), good = fnProg(tpl, c);
  const R = render(bad, L, { lineNumbers: true }), Rg = render(good, L);
  const ln = id => R.lineOf.get(id);
  const pairText = ([x, y]) => `Lines ${ln(x)} and ${ln(y)}`;
  const fixText = k => '`' + lineAt(render(fnProg(tpl, c, k === 'ok' ? {} : { [p.slot]: k }), L), p.slot) + '`';
  return {
    tpl, c, bad, good, R, Rg, ln,
    lineChoices: p.linePairs ? p.linePairs.map(pairText) : p.lineIds.map(id => `Line ${ln(id)}`),
    typeChoices: p.typePairs ? p.typePairs.map(ks => ks.map(k => CAT[k]).join(' + ')) : null,
    fixChoices: p.fixKeys ? p.fixKeys.map(fixText) : null,
    pairText,
  };
}

function presentTwoBugs(p, sub, L) {
  const w = bugViewX(p, L), { tpl, c } = w;
  const codeBlock = '```' + fence(L) + '\n' + w.R.code + '\n```';
  const spec = `${sig(tpl, c, L)} should return ${tpl.desc(c, L)}. For example, ${exampleText(tpl, c, p.ex, L)} should return **${p.want}**.`;
  const [b1, b2] = p.bugs;
  const linesAns = w.pairText([b1.slot, b2.slot]);
  const typesAns = kindPair([b1.kind, b2.kind]).map(k => CAT[k]).join(' + ');
  const isRange = slot => w.bad.fns[0].body.some(function f(s) { return (s.id === slot && s.k === 'forRange') || (s.body || []).some(f); });
  const one = b => `Line ${w.ln(b.slot)}: \`${lineAt(w.R, b.slot)}\` should be \`${lineAt(w.Rg, b.slot)}\`. ${WHY[b.kind](L, isRange(b.slot))} (**${CAT[b.kind]}**)`;
  const expl = [
    'There are two bugs.', one(b1), one(b2),
    `For the example the function should return **${p.want}** (${tpl.work(c, p.ex)}). With both bugs it returns **${p.actual}**. Fixing only one of the two lines is not enough: some input still comes out wrong.`,
  ].join('\n\n');
  const vars = trackNames(p.tpl, c), body = w.bad.fns[0].body;
  const specH = `Work out the right answer first: for ${exampleText(tpl, c, p.ex, L)} it is ${p.want}.`;
  const part = {
    lines: () => ({ id: 'lines', label: 'Bug lines', ask: 'Which two lines have bugs?', answerType: 'choice', answer: linesAns, choices: w.lineChoices,
      hint: `${specH} Then check every line against the spec on its own: the starting values, the first and last pass of each loop, the condition and the update. Two separate lines are wrong; finding one does not mean the other line is fine.` }),
    actual: () => ({ id: 'actual', label: 'Actual result', ask: 'What does this buggy version return for the example?', answerType: 'number', answer: p.actual, tolerance: 0,
      hint: `Run the code exactly as written, both bugs included. Trace ${exampleText(tpl, c, p.ex, L)} and write down ${nameList(vars, L)} as they change.${loopNote(body, L)}` }),
    types: () => ({ id: 'types', label: 'Bug types', ask: 'Which two kinds of bug are they?', answerType: 'choice', answer: typesAns, choices: w.typeChoices,
      hint: `Find both wrong lines first, then name each mistake separately. ${CHECKLIST}` }),
  };
  const ids = sub === 'bug-types' ? ['lines', 'types'] : ['lines', 'actual'];
  return { lang: L, explanation: expl, prompt: `${spec}\n\n${codeBlock}\n\nThis version has **two** bugs, on different lines. Answer each part.`,
    answerType: 'multi', parts: ids.map(id => part[id]()), meta: { mode: 'bug2', ask: 'multi', parts: ids, ...p } };
}

function presentFixTrap(p, L) {
  const w = bugViewX(p, L), { tpl, c } = w;
  const codeBlock = '```' + fence(L) + '\n' + w.R.code + '\n```';
  const exs = p.shown.map(a => `${exampleText(tpl, c, a, L)} should return **${tpl.ref(c, a)}**`);
  const spec = `${sig(tpl, c, L)} should return ${tpl.desc(c, L)}. For example, ${exs.slice(0, -1).join('; ')}; and ${exs[exs.length - 1]}.`;
  const bugLine = w.ln(p.slot), fixAns = '`' + lineAt(w.Rg, p.slot) + '`';
  const trapWhy = p.traps.map(k => {
    const prog = fnProg(tpl, c, { [p.slot]: k });
    const j = p.shown.findIndex(a => { const r = exec(prog, c.f, a); return !(r.ok && r.value === tpl.ref(c, a)); });
    const r = exec(prog, c.f, p.shown[j]);
    return `${w.fixChoices[p.fixKeys.indexOf(k)]} fixes the first example but returns ${r.ok ? r.value : 'nothing'} for ${exampleText(tpl, c, p.shown[j], L)}, which should be ${tpl.ref(c, p.shown[j])}.`;
  });
  const isRange = w.bad.fns[0].body.some(function f(s) { return (s.id === p.slot && s.k === 'forRange') || (s.body || []).some(f); });
  const expl = [
    `The bug is on line ${bugLine}: \`${lineAt(w.R, p.slot)}\`. It should be ${fixAns}.`,
    WHY[p.kind](L, isRange),
    `For the first example the buggy version returns **${p.actual}** instead of **${p.want}**.`,
    `A fix has to work for every example, not just the first: ${trapWhy.join(' ')}`,
  ].join('\n\n');
  const vars = trackNames(p.tpl, c);
  return { lang: L, explanation: expl, prompt: `${spec}\n\n${codeBlock}\n\nThis version has one bug. Answer each part.`, answerType: 'multi',
    parts: [
      { id: 'line', label: 'Bug line', ask: 'Which line has the bug?', answerType: 'choice', answer: `Line ${bugLine}`, choices: w.lineChoices,
        hint: `Trace the first example, ${exampleText(tpl, c, p.ex, L)}, writing down ${nameList(vars, L)} as they change. The first line where the trace stops matching the spec is the bug.` },
      { id: 'fix', label: 'Fix', ask: 'Which replacement line makes the function right for all three examples?', answerType: 'choice', answer: fixAns, choices: w.fixChoices,
        hint: `Several replacements may fix the first example. Put each one in and run all three examples; the right fix also has to make sense for any input, not just these.` },
    ],
    meta: { mode: 'fix2', ask: 'multi', parts: ['line', 'fix'], ...p } };
}

function generateExpert(subtopic, rng, L) {
  if (subtopic === 'predict-output') return presentPredictX(planPredictX(rng), L);
  if (subtopic === 'fix-the-bug') return presentFixTrap(planFixTrap(rng), L);
  return presentTwoBugs(planTwoBugs(rng, subtopic), subtopic, L);
}

// Verify an expert bug question from its plan: rebuild, re-render, re-run against the plain-JS refs.
function verifyBugX(q, m, answer) {
  const L = q.lang, tpl = T[m.tpl], c = m.c;
  if (!tpl || q.answerType !== 'multi' || !Array.isArray(q.parts) || q.parts.map(p => p.id).join() !== m.parts.join()) return false;
  const slots = tpl.slots(c);
  const bugs = m.mode === 'bug2' ? m.bugs : [{ slot: m.slot, key: m.key, kind: m.kind }];
  if (!Array.isArray(bugs) || !bugs.length || new Set(bugs.map(b => b.slot)).size !== bugs.length) return false;
  if (bugs.some(b => slots[b.slot]?.[b.key] !== b.kind || ['other', 'early', 'infinite'].includes(b.kind))) return false;
  const want = a => tpl.ref(c, a);
  if (!m.tests.length || JSON.stringify(m.tests[0]) !== JSON.stringify(m.ex) || want(m.ex) !== m.want) return false;
  const good = fnProg(tpl, c);
  if (!passesAll(tpl, c, good, m.tests)) return false;
  const bad = fnProg(tpl, c, Object.fromEntries(bugs.map(b => [b.slot, b.key])));
  const rb = exec(bad, c.f, m.ex);
  if (!(rb.ok && rb.value !== m.want)) return false;
  if (m.mode === 'bug2' && bugs.some(b => passesAll(tpl, c, fnProg(tpl, c, { [b.slot]: b.key }), m.tests))) return false;
  const w = bugViewX(m, L);
  // Exactly the bug lines differ from the correct version (ignoring Rust `mut`).
  if (w.R.lines.length !== w.Rg.lines.length) return false;
  const norm = l => l.replace(/\bmut /g, '');
  const diff = w.R.lines.map((l, j) => (norm(l) !== norm(w.Rg.lines[j]) ? j + 1 : 0)).filter(Boolean);
  const bugLines = bugs.map(b => w.ln(b.slot)).sort((x, y) => x - y);
  if (diff.join() !== bugLines.join()) return false;
  const expect = {
    line: () => [`Line ${bugLines[0]}`, w.lineChoices],
    lines: () => [`Lines ${bugLines[0]} and ${bugLines[1]}`, w.lineChoices],
    actual: () => [rb.value, null],
    types: () => {
      const right = kindPair(bugs.map(b => b.kind));
      // Every other option names at least one kind that describes neither bug.
      const okPairs = m.typePairs.every(ks => ks.join() === right.join() || ks.some(k => bugs.every(b => typeOk(b.kind, k))));
      return okPairs ? [right.map(k => CAT[k]).join(' + '), w.typeChoices] : [NaN, null];
    },
    fix: () => {
      if (new Set(w.fixChoices).size !== 4) return [NaN, null];
      const pass = m.fixKeys.filter(k => passesAll(tpl, c, fnProg(tpl, c, k === 'ok' ? {} : { [m.slot]: k }), m.tests));
      return pass.length === 1 ? [w.fixChoices[m.fixKeys.indexOf(pass[0])], w.fixChoices] : [NaN, null];
    },
  };
  const a = answer && typeof answer === 'object' ? answer : {};
  return q.parts.every(p => {
    const [ans, choices] = expect[p.id]();
    if (choices) return choiceSetOk(choices, ans) && JSON.stringify(p.choices) === JSON.stringify(choices) && String(a[p.id]) === ans;
    return typeof ans === 'number' && Number.isFinite(ans) && String(a[p.id] ?? '').trim() !== '' && Number(a[p.id]) === ans;
  });
}

// ---- rewrite the buggy line (typed, or built from blocks) ----
// Uses planBug (fixable bugs only). The answer is the correct line as rendered, without its trailing
// `:` / `;` / `{`. `accepts` holds genuine equivalents: the line with its trailing mark, other
// spacing around operators, flipped comparisons / swapped operands (each equivalent line is put back
// into the function and must pass every test), `total = total + x` for `total += x`, `i <= n` for
// `i < n + 1` in a C-style loop header, `a..=n` for `a..n + 1` in Rust, and C++ without `(int)`.
// Blocks come from the same line; extra blocks are the buggy line's blocks first, then the blocks of
// the other wrong fixes for that line.
const RW_EXTRA = { easy: [0, 1], medium: [2, 3], hard: [4, 6], expert: [6, 10] };
const trailOf = line => (line.match(/(?: \{|:|;)$/) || [''])[0];
const stripTrail = line => line.slice(0, line.length - trailOf(line).length);

function replaceStmt(stmts, id, s) {
  return stmts.map(x => {
    if (x.id === id) return { ...s, id };
    const y = { ...x };
    for (const k of ['then', 'body', 'els']) if (x[k]) y[k] = replaceStmt(x[k], id, s);
    if (x.elifs) y.elifs = x.elifs.map(a => ({ ...a, body: replaceStmt(a.body, id, s) }));
    return y;
  });
}
function findStmt(stmts, id) {
  for (const x of stmts) {
    if (x.id === id) return x;
    for (const b of [x.then, x.body, x.els, ...(x.elifs || []).map(a => a.body)]) { const r = b && findStmt(b, id); if (r) return r; }
  }
  return null;
}
const withStmt = (good, s, id) => program([{ ...good.fns[0], body: replaceStmt(good.fns[0].body, id, s) }], []);

// Equivalent versions of one expression: flipped comparisons, swapped + / * operands, reordered
// and/or parts. (No bound shifting: a fixed line should read like the original.)
function exprVariants(e) {
  const out = [e];
  if (!e || typeof e !== 'object') return out;
  if (e.k === 'bin') {
    for (const a of exprVariants(e.a)) for (const b of exprVariants(e.b)) {
      if (a !== e.a || b !== e.b) out.push({ ...e, a, b });
      if (FLIP[e.op] || e.op === '==' || e.op === '!=') out.push({ ...e, op: FLIP[e.op] || e.op, a: b, b: a });
      if (e.op === '+' || e.op === '*') out.push({ ...e, a: b, b: a });
    }
  } else if ((e.k === 'and' || e.k === 'or') && e.xs.length === 2) {
    for (const a of exprVariants(e.xs[0])) for (const b of exprVariants(e.xs[1])) {
      if (a !== e.xs[0] || b !== e.xs[1]) out.push({ ...e, xs: [a, b] });
      out.push({ ...e, xs: [b, a] });
    }
  }
  return out.slice(0, 64);
}
function stmtVariants(s) {
  const out = [];
  for (const k of ['cond', 'value', 'end', 'start', 'i']) {
    if (!s[k] || typeof s[k] !== 'object') continue;
    for (const v of exprVariants(s[k]).slice(1)) out.push({ ...s, [k]: v });
  }
  if (s.k === 'augAssign') out.push({ k: 'assign', name: s.name, value: B(s.op, V(s.name), s.value) });
  return out;
}

// Everything about a rewrite question in one language, from the plan alone.
function rewriteView(p, L) {
  const tpl = T[p.tpl], c = p.c;
  const good = fnProg(tpl, c), bad = fnProg(tpl, c, { [p.slot]: p.key });
  const R = render(bad, L, { lineNumbers: true }), Rg = render(good, L);
  const fullLine = lineAt(Rg, p.slot), answer = stripTrail(fullLine), trail = trailOf(fullLine);
  const lineOfStmt = s => stripTrail(lineAt(render(withStmt(good, s, p.slot), L), p.slot));
  const okStmt = s => passesAll(tpl, c, withStmt(good, s, p.slot), p.tests);
  const goodStmt = findStmt(good.fns[0].body, p.slot);
  // equivalent lines (checked by running)
  const sems = [];
  for (const s of stmtVariants(goodStmt)) {
    try { if (okStmt(s)) sems.push(lineOfStmt(s)); } catch { /* not a valid program */ }
  }
  const cand = [...spacingVariants(answer).slice(1, 2)];
  if (trail) cand.push(answer + trail);
  for (const t of sems) cand.push(t, spacingVariants(t)[1] ?? t);
  if (goodStmt.k === 'forRange' && goodStmt.step === 1 && goodStmt.end.k === 'bin' && goodStmt.end.op === '+' && goodStmt.end.b.k === 'int' && goodStmt.end.b.v === 1) {
    const endText = renderExpr(goodStmt.end, L, { program: good, fn: c.f });
    const less = renderExpr(goodStmt.end.a, L, { program: good, fn: c.f });
    if (L === 'rust' && answer.endsWith(`..${endText}`)) cand.push(answer.slice(0, -endText.length - 2) + `..=${less}`);
    if (['csharp', 'cpp'].includes(L) && answer.includes(` < ${endText};`)) cand.push(answer.replace(` < ${endText};`, ` <= ${less};`));
  }
  if (L === 'cpp' && answer.includes('(int)')) cand.push(answer.replace(/\(int\)/g, ''));
  cand.push(...spacingVariants(answer).slice(2));
  const keys = new Set([textKey(answer)]), accepts = [];
  for (const t of cand) {
    const k = textKey(t);
    if (!t || keys.has(k) || accepts.length >= 20) continue;
    keys.add(k); accepts.push(t);
  }
  const badLine = stripTrail(lineAt(R, p.slot));
  const wrongLines = [badLine, ...(p.fixKeys || []).filter(k => k !== 'ok' && k !== p.key)
    .map(k => stripTrail(lineAt(render(fnProg(tpl, c, { [p.slot]: k }), L), p.slot)))];
  // Spare blocks when the wrong lines run out: the slot's other variants, sibling operators and
  // numbers, then the function's own names.
  const others = Object.keys(tpl.slots(c)[p.slot] || {}).filter(k => k !== p.key && !(p.fixKeys || []).includes(k))
    .map(k => { try { return stripTrail(lineAt(render(fnProg(tpl, c, { [p.slot]: k }), L), p.slot)); } catch { return ''; } }).filter(Boolean);
  const names = [...paramNames(tpl, c), ...trackNames(p.tpl, c)].map(n => ident(n, L));
  const blocks = blocksFor(answer, { distractors: [...wrongLines, ...others, ...decoyTokens(answer), ...names], count: p.extra, seed: p.seed });
  return { tpl, c, good, bad, R, Rg, answer, trail, accepts, badLine, wrongLines, blocks, bugLine: R.lineOf.get(p.slot) };
}

const solSize = xs => xs.reduce((n, x) => n + (typeof x === 'number' ? 1 : 1 + solSize(x.kids)), 0);
function rewriteOk(v, p) {
  if (!v.blocks || serialiseBlocks(v.blocks.tiles, v.blocks.solution) !== v.answer) return false;
  const real = solSize(v.blocks.solution);
  if (real < 2 || v.blocks.tiles.length - real !== p.extra) return false;
  const ok = new Set([v.answer, ...v.accepts].map(textKey));
  return !v.wrongLines.some(w => ok.has(textKey(w)) || spacingVariants(w).some(x => ok.has(textKey(x))));
}

const TRAIL_NOTE = {
  python: 'The `:` at the end is optional.', gdscript: 'The `:` at the end is optional.',
  csharp: 'The `;` at the end is optional.', cpp: 'The `;` or `{` at the end is optional.', rust: 'The `;` or `{` at the end is optional.',
};

function planRewrite(rng, diff) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const p = diff === 'expert' ? planBug(rng, 'hard', { needFix: true, pool: X_BUG_POOL }) : planBug(rng, diff, { needFix: true });
    const [lo, hi] = RW_EXTRA[diff];
    p.extra = rng.int(lo, hi);
    p.seed = rng.int(1, 2147483646);
    if (p.kind === 'early') continue;
    if (['python', 'csharp', 'cpp', 'gdscript', 'rust'].every(L => { try { return rewriteOk(rewriteView(p, L), p); } catch { return false; } })) return p;
  }
  throw new Error('could not plan a rewrite question');
}

function presentRewrite(p, diff, L) {
  const v = rewriteView(p, L), { tpl, c } = v;
  const codeBlock = '```' + fence(L) + '\n' + v.R.code + '\n```';
  const spec = `${sig(tpl, c, L)} should return ${tpl.desc(c, L)}. For example, ${exampleText(tpl, c, p.ex, L)} should return **${p.want}**.`;
  const given = diff === 'easy' || diff === 'medium';
  const isRange = v.bad.fns[0].body.some(s => s.id === p.slot && s.k === 'forRange') || findStmt(v.bad.fns[0].body, p.slot)?.k === 'forRange';
  const ask = given ? `Line ${v.bugLine} has a bug. Type the corrected line.` : 'One line has a bug. Type the corrected version of that line.';
  const H = bugHints(p, bugView(p, L), L);
  const hints = given
    ? [H.line[0], `Line ${v.bugLine} is \`${v.badLine}\`. Work out what it does on each pass and compare that with what the spec needs.`,
      'Change only the part that is wrong and keep the rest of the line as it is. Then trace the example again with your line in place.']
    : [H.line[0], H.line[1], 'The first line where your trace stops matching the spec is the one to rewrite. Change only the part that is wrong and keep the rest of the line as it is.'];
  return {
    prompt: `${spec}\n\n${codeBlock}\n\n${ask} ${TRAIL_NOTE[L]} Spaces around operators are optional.`,
    answerType: 'text', answer: v.answer, accepts: v.accepts, blocks: v.blocks, lang: L,
    explanation: [
      `The bug is on line ${v.bugLine}: \`${v.badLine}\`. It should be \`${v.answer}\`.`,
      WHY[p.kind](L, isRange),
      `For the example the function should return **${p.want}** (${tpl.work(c, p.ex)}). ` +
        (p.kind === 'infinite' ? 'The buggy version never finishes.' : `The buggy version returns **${p.actual}** instead.`),
    ].join('\n\n'),
    hints,
    meta: { mode: 'rewrite', diff, ...p },
  };
}

// verify: re-check the plan (as for the other bug questions), recompute the line, its accepted forms
// (each one run in place of the bug) and the blocks, then compare.
function verifyRewrite(q, m, answer) {
  const L = q.lang, tpl = T[m.tpl], c = m.c;
  if (!tpl || tpl.slots(c)[m.slot]?.[m.key] !== m.kind || ['other', 'early'].includes(m.kind)) return false;
  const good = fnProg(tpl, c), bad = fnProg(tpl, c, { [m.slot]: m.key });
  if (!m.tests.length || JSON.stringify(m.tests[0]) !== JSON.stringify(m.ex) || tpl.ref(c, m.ex) !== m.want) return false;
  if (!passesAll(tpl, c, good, m.tests)) return false;
  const rb = exec(bad, c.f, m.ex);
  if (m.kind === 'infinite' ? !rb.timedOut : !(rb.ok && rb.value !== m.want)) return false;
  const v = rewriteView(m, L);
  if (!rewriteOk(v, m) || v.answer !== q.answer) return false;
  // Only the bug line differs between the buggy and the fixed program (ignoring Rust `mut`).
  const norm = l => l.replace(/\bmut /g, '');
  if (v.R.lines.length !== v.Rg.lines.length) return false;
  const diff = v.R.lines.map((l, j) => (norm(l) !== norm(v.Rg.lines[j]) ? j + 1 : 0)).filter(Boolean);
  if (diff.length !== 1 || diff[0] !== v.bugLine) return false;
  const b = q.blocks;
  if (!b || !Array.isArray(b.tiles) || b.tiles.length < 2 || b.tiles.length > 24) return false;
  if (serialiseBlocks(b.tiles, b.solution, b.joiner ?? ' ') !== q.answer) return false;
  const ok = new Set([v.answer, ...v.accepts].map(textKey));
  return typeof answer === 'string' && ok.has(textKey(answer));
}

// ---- generate ----
const SUBS = ['predict-output', 'find-the-bug', 'fix-the-bug', 'bug-types', 'rewrite-line'];

export function generate({ subtopic, difficulty, rng, lang = 'python' }) {
  if (!SUBS.includes(subtopic)) throw new Error(`Unknown subtopic: ${subtopic}`);
  if (subtopic === 'rewrite-line') {
    if (!['easy', 'medium', 'hard', 'expert'].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
    return presentRewrite(planRewrite(rng, difficulty), difficulty, lang);
  }
  if (difficulty === 'expert') return generateExpert(subtopic, rng, lang);
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === 'predict-output') return presentPredict(planPredict(rng, difficulty), lang);
  const p = planBug(rng, difficulty, { needFix: subtopic === 'fix-the-bug', dedupe: subtopic === 'fix-the-bug' });
  p.askActual = subtopic === 'bug-types' && difficulty !== 'hard' && rng.next() < 0.4;
  return presentBug(p, subtopic, difficulty, lang);
}

// ---- verify: rebuild, re-render, re-run, compare with the plain-JS references ----
const choiceSetOk = (choices, answer) => Array.isArray(choices) && choices.length === 4 && new Set(choices).size === 4 && choices.includes(answer);

function verifyBug(q, m, answerOf) {
  const L = q.lang, tpl = T[m.tpl], c = m.c;
  if (!tpl || tpl.slots(c)[m.slot]?.[m.key] !== m.kind || m.kind === 'other') return false;
  const want = a => tpl.ref(c, a);
  const good = fnProg(tpl, c), bad = fnProg(tpl, c, { [m.slot]: m.key });
  // The fixed program meets the spec on every test; the example is one of them.
  if (!m.tests.length || JSON.stringify(m.tests[0]) !== JSON.stringify(m.ex) || want(m.ex) !== m.want) return false;
  if (!m.tests.every(a => { const r = exec(good, c.f, a); return r.ok && r.value === want(a); })) return false;
  // The bug is observable on the example.
  const rb = exec(bad, c.f, m.ex);
  if (m.kind === 'infinite' ? !rb.timedOut : !(rb.ok && rb.value !== m.want)) return false;
  const w = bugView(m, L);
  const n = w.R.lineOf.get(m.slot);
  if (!n) return false;
  // The changed line is the only rendered difference (when the line count is the same).
  if (m.kind !== 'early') {
    if (w.R.lines.length !== w.Rg.lines.length) return false;
    // (Rust: `mut` disappears from a `let` or parameter when the bug stops it changing; ignore that.)
    const norm = l => l.replace(/\bmut /g, '');
    const diff = w.R.lines.map((l, j) => (norm(l) !== norm(w.Rg.lines[j]) ? j + 1 : 0)).filter(Boolean);
    if (diff.length !== 1 || diff[0] !== n) return false;
  }
  const expect = {
    line: () => [`Line ${n}`, w.lineChoices],
    type: () => [CAT[m.kind], w.typeChoices],
    actual: () => [m.kind === 'infinite' ? NaN : rb.value, null],
    fix: () => {
      if (!w.fixChoices || m.kind === 'early') return [NaN, null];
      if (new Set(w.fixChoices).size !== 4) return [NaN, null];
      const pass = m.fixKeys.filter(k => {
        const p = fnProg(tpl, c, k === 'ok' ? {} : { [m.slot]: k });
        return m.tests.every(a => { const r = exec(p, c.f, a); return r.ok && r.value === want(a); });
      });
      if (pass.length !== 1) return [NaN, null];
      return [w.fixChoices[m.fixKeys.indexOf(pass[0])], w.fixChoices];
    },
  };
  // Distractor categories must not also describe the bug.
  if (!m.typeKinds.includes(m.kind) || m.typeKinds.some(k => k !== m.kind && !typeOk(m.kind, k))) return false;
  const check = (id, shown, given) => {
    const [ans, choices] = expect[id]();
    if (choices) return choiceSetOk(choices, ans) && JSON.stringify(shown.choices) === JSON.stringify(choices) && String(given) === ans;
    return typeof ans === 'number' && Number.isFinite(ans) && String(given ?? '').trim() !== '' && Number(given) === ans;
  };
  if (m.ask === 'multi') {
    if (q.answerType !== 'multi' || !Array.isArray(q.parts) || q.parts.map(p => p.id).join() !== m.parts.join()) return false;
    const a = answerOf && typeof answerOf === 'object' ? answerOf : {};
    return q.parts.every(p => check(p.id, p, a[p.id]));
  }
  return check(m.ask, q, answerOf);
}

function verifyPredict(q, m, answer) {
  const want = predictRef(m), out = runLines(predictProgram(m));
  if (!out || out.length !== want.length || out.some((s, j) => s !== String(want[j]))) return false;
  const nums = out.map(Number);
  let exp;
  if (m.ask === 'last') exp = { one: nums[nums.length - 1] };
  else if (m.ask === 'total') exp = { one: nums.reduce((a, b) => a + b, 0) };
  else if (m.ask === 'count-last') exp = { count: out.length, last: nums[nums.length - 1] };
  else if (m.ask === 'two') exp = { first: nums[0], second: nums[1] };
  else if (m.ask === 'three') exp = { first: nums[0], second: nums[1], third: nums[2] };
  else exp = { one: nums[0] };
  const eq = (given, e) => String(given ?? '').trim() !== '' && Number(given) === e;
  if ('one' in exp) return q.answerType === 'number' && eq(answer, exp.one);
  const a = answer && typeof answer === 'object' ? answer : {};
  return q.answerType === 'multi' && Object.keys(exp).length === q.parts.length && Object.entries(exp).every(([k, e]) => eq(a[k], e));
}

export function verify(question, answer) {
  try {
    const m = question && question.meta;
    if (!m || typeof question.lang !== 'string') return false;
    if (m.mode === 'predict') return verifyPredict(question, m, answer);
    if (m.mode === 'bug') return verifyBug(question, m, answer);
    if (m.mode === 'bug2' || m.mode === 'fix2') return verifyBugX(question, m, answer);
    if (m.mode === 'rewrite') return verifyRewrite(question, m, answer);
    return false;
  } catch {
    return false;
  }
}
