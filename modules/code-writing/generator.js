// Code Writing generator: complete a short program so it does what the prompt asks.
// Every snippet is built ONCE as a language-neutral codelang program and rendered in the user's
// language. All rng draws happen before any rendering, so a seed gives the same logic and the same
// answer in every language. Answers are auto-checkable: a number for a blank, a choice of
// expression or line, or a two-part question (blank + output).
//
// How a question is checked:
//   - Number blanks: the template computes the expected output with plain JS arithmetic; generation
//     then runs the program with the answer substituted (codelang `run`) and scans nearby integers,
//     so exactly one value works ("exact"), or the answer is the smallest that works ("smallest").
//   - Choices: every option is substituted and run against the stated examples; only the correct
//     option passes, every distractor fails at least one shown example.
//   - verify() rebuilds the program from `meta` (template id + params) with the candidate answer
//     substituted and runs it again. It never trusts the stored answer.

import { S, E, program, render, lineAt, renderExpr, renderStmtLine, fence, ident, run, langNotes, rangeText } from '../../js/lib/codelang.js';
import { LANG_IDS } from '../../js/lib/languages.js';

const BLANK = '___';
const bl = () => E.blank(BLANK);
const V = E.var;
const tk = s => '`' + s + '`';
const MAX_STEPS = 4000;
const DIFFS = ['easy', 'medium', 'hard'];

// ── running ───────────────────────────────────────────────────────────────────────────────────

// Runs a program (or one function call); never throws. ok = finished without error or timeout.
function exec(prog, test = {}) {
  try {
    const r = run(prog, { maxSteps: MAX_STEPS, ...(test.entry ? { entry: test.entry, args: test.args } : {}) });
    return { ok: !r.timedOut, output: r.output, returned: r.returned };
  } catch (e) {
    return { ok: false, output: e && Array.isArray(e.output) ? e.output : [], returned: undefined, error: true };
  }
}

// spec: { tests: [{ entry, args, expect }] }  → every call returns `expect`
//       { out: [lines], prefix }               → printed lines equal `out` (prefix: the first lines)
function meets(prog, spec) {
  if (spec.tests) return spec.tests.every(t => { const r = exec(prog, t); return r.ok && r.returned === t.expect; });
  const r = exec(prog);
  if (spec.prefix) return r.output.length >= spec.out.length && spec.out.every((s, i) => r.output[i] === s);
  return r.ok && r.output.length === spec.out.length && spec.out.every((s, i) => r.output[i] === s);
}

const toInt = val => {
  const s = typeof val === 'number' ? val : typeof val === 'string' && val.trim() !== '' ? Number(val.trim()) : NaN;
  return Number.isInteger(s) ? s : null;
};

// Program builders, keyed by template id: (params, X) → program, where X is the expression or
// statement that fills the blank (E.blank for display, a value / option when checking).
const MAKE = {};

function buildWith(m, x) {
  try { return MAKE[m.t](m.p, x); } catch { return null; }
}
function blankHits(m, spec, n) {
  let x;
  try { x = E.int(n); } catch { return false; }
  const prog = buildWith(m, x);
  return !!prog && meets(prog, spec);
}

// ── verify ────────────────────────────────────────────────────────────────────────────────────

function partOk(m, part, choices, val) {
  if (part.kind === 'blank') {
    const n = toInt(val);
    if (n === null || !blankHits(m, part.spec, n)) return false;
    if (part.smallest) {
      if (n < part.floor || n - part.floor > 5000) return false;
      for (let x = part.floor; x < n; x++) if (blankHits(m, part.spec, x)) return false;
    }
    return true;
  }
  if (part.kind === 'output') {
    const n = toInt(val);
    if (n === null) return false;
    const prog = buildWith(m, E.int(m.solution));
    if (!prog) return false;
    const r = exec(prog);
    return r.ok && r.output[part.line] !== undefined && Number(r.output[part.line]) === n;
  }
  if (part.kind === 'choice') {
    const i = Array.isArray(choices) ? choices.indexOf(String(val)) : -1;
    if (i < 0 || !part.opts[i]) return false;
    const prog = buildWith(m, part.opts[i]);
    return !!prog && meets(prog, part.spec);
  }
  return false;
}

export function verify(question, answer) {
  const m = question && question.meta;
  if (!m || !MAKE[m.t]) return false;
  if (question.answerType === 'multi') {
    if (!answer || typeof answer !== 'object' || !Array.isArray(question.parts)) return false;
    return question.parts.every(p => m.parts[p.id] && partOk(m, m.parts[p.id], p.choices, answer[p.id]));
  }
  return partOk(m, m.main, question.choices, answer);
}

// ── building questions ────────────────────────────────────────────────────────────────────────

// Checks a number blank at generation time: the solution meets the spec and is the only value in
// [lo, hi] that does ("exact"), or the smallest from `floor` upward ("smallest").
function checkBlank(m, part, solution, lo, hi) {
  if (!blankHits(m, part.spec, solution)) throw new Error(`template ${m.t}: solution ${solution} fails`);
  if (part.smallest) {
    for (let x = part.floor; x < solution; x++) if (blankHits(m, part.spec, x)) throw new Error(`template ${m.t}: ${x} also works`);
  } else {
    for (let x = lo; x <= hi; x++) if (x !== solution && blankHits(m, part.spec, x)) throw new Error(`template ${m.t}: ${x} also works`);
  }
}

// Picks 3 distractors that fail the spec, and whose rendering differs from every other option in
// every language (decided without rng, so it is the same for every language). Returns options in
// shuffled order with the correct index.
function pickOptions(rng, m, correct, pool, spec, renderOpt) {
  const passes = o => { const p = buildWith(m, o); return !!p && meets(p, spec); };
  if (!passes(correct)) throw new Error(`template ${m.t}: correct option fails`);
  const shuffled = rng.shuffle(pool);
  const chosen = [correct];
  const keys = LANG_IDS.map(l => new Set([renderOpt(correct, l)]));
  for (const o of shuffled) {
    if (chosen.length === 4) break;
    if (passes(o)) continue;
    const r = LANG_IDS.map(l => renderOpt(o, l));
    if (r.some((s, i) => keys[i].has(s))) continue;
    r.forEach((s, i) => keys[i].add(s));
    chosen.push(o);
  }
  if (chosen.length < 4) throw new Error(`template ${m.t}: not enough distractors`);
  const opts = rng.shuffle(chosen);
  return { opts, correctIndex: opts.indexOf(correct) };
}

// A short reason why a wrong option fails: the first example it gets wrong.
function whyWrong(m, opt, spec, lang, show) {
  const prog = buildWith(m, opt);
  if (!prog) return 'does not work here';
  if (spec.tests) {
    for (const t of spec.tests) {
      const r = exec(prog, t);
      if (!r.ok) return `causes an error for ${tk(show(t))}`;
      if (r.returned !== t.expect) return `gives ${tk(fmtVal(r.returned))} for ${tk(show(t))}, not ${tk(fmtVal(t.expect))}`;
    }
    return 'does not match';
  }
  const r = exec(prog);
  if (!r.ok) return 'causes an error';
  return `prints ${r.output.join(', ') || 'nothing'} instead`;
}
const fmtVal = v => (typeof v === 'string' ? `"${v}"` : String(v));

function numberQ({ m, solution, smallest = false, floor = 0, lo, hi, spec, prompt, explanation, lang, hints }) {
  const part = { kind: 'blank', spec, smallest, floor };
  checkBlank(m, part, solution, lo, hi);
  return {
    prompt, answer: solution, answerType: 'number', tolerance: 0, explanation, lang,
    meta: { t: m.t, p: m.p, solution, lang, main: part },
    ...(hints ? { hints } : {}),
  };
}

function choiceQ({ rng, m, correct, pool, spec, renderOpt, prompt, explain, lang, hints }) {
  const { opts, correctIndex } = pickOptions(rng, m, correct, pool, spec, renderOpt);
  const choices = opts.map(o => tk(renderOpt(o, lang)));
  return {
    prompt, answer: choices[correctIndex], answerType: 'choice', choices, explanation: explain(opts, correctIndex), lang,
    meta: { t: m.t, p: m.p, lang, correctIndex, main: { kind: 'choice', spec, opts } },
    ...(hints ? { hints } : {}),
  };
}

// Two-part question: a number blank plus "what does line k print?".
function blankOutputQ({ m, solution, smallest = false, floor = 0, lo, hi, spec, outLine, outAnswer, prompt, askBlank, askOut, explanation, lang, hintBlank, hintOut }) {
  const blankPart = { kind: 'blank', spec: { ...spec, prefix: !!spec.out }, smallest, floor };
  checkBlank(m, blankPart, solution, lo, hi);
  const outPart = { kind: 'output', line: outLine };
  if (!partOk({ ...m, solution }, outPart, null, outAnswer)) throw new Error(`template ${m.t}: output part mismatch`);
  return {
    prompt, answerType: 'multi', explanation, lang,
    parts: [
      { id: 'blank', label: 'Blank', ask: askBlank, answerType: 'number', answer: solution, tolerance: 0, ...(hintBlank ? { hint: hintBlank } : {}) },
      { id: 'output', label: 'Output', ask: askOut, answerType: 'number', answer: outAnswer, tolerance: 0, ...(hintOut ? { hint: hintOut } : {}) },
    ],
    meta: { t: m.t, p: m.p, solution, lang, parts: { blank: blankPart, output: outPart } },
  };
}

// ── rendering helpers ─────────────────────────────────────────────────────────────────────────

const code = (prog, lang) => '```' + fence(lang) + '\n' + render(prog, lang).code + '\n```';
// Render with the real statement in place, then swap that one line for a blank. Keeps everything
// the statement implies (Rust `mut`, C++ list declarations) without giving the answer away.
function codeLineBlank(prog, lang, id) {
  const r = render(prog, lang);
  const n = r.lineOf.get(id);
  const lines = r.lines.slice();
  if (n) lines[n - 1] = lines[n - 1].match(/^\s*/)[0] + BLANK;
  return '```' + fence(lang) + '\n' + lines.join('\n') + '\n```';
}
const fnName = (name, lang) => ident(name, lang, 'fn');
const vn = (name, lang) => ident(name, lang);
const callText = (prog, fn, args, lang) => renderExpr(E.call(fn, args.map(a => (typeof a === 'string' ? E.str(a) : E.int(a)))), lang, { program: prog });
const intDivNote = lang => `${tk(langNotes(lang).intDiv)} between whole numbers is whole-number division: it drops the remainder. ${tk('%')} gives the remainder.`;
const prints = out => (out.length === 1 ? `prints ${tk(out[0])}` : `prints ${out.map(tk).join(', then ')}`);

// ── word lists (all pass codelang's name rules and are safe in every language) ─────────────────

const PAIRS = [['apples', 'pears'], ['coins', 'gems'], ['width', 'depth'], ['score', 'extra'], ['red', 'blue'],
  ['left', 'right'], ['cats', 'dogs'], ['wins', 'losses'], ['first', 'second'], ['price', 'tax'], ['hours', 'rate']];
const RESULTS = ['result', 'total', 'answer', 'value', 'outcome'];
const LISTS = ['nums', 'scores', 'prices', 'ages', 'points', 'marks', 'values'];
const COUNTERS = ['count', 'total', 'tally', 'steps'];
const THEMES = [
  { par: 'age', yes: 'adult', no: 'child', lo: 12, hi: 30 },
  { par: 'temp', yes: 'hot', no: 'cold', lo: 15, hi: 35 },
  { par: 'score', yes: 'pass', no: 'fail', lo: 30, hi: 80 },
  { par: 'speed', yes: 'fast', no: 'slow', lo: 20, hi: 90 },
  { par: 'n', yes: 'big', no: 'small', lo: 5, hi: 60 },
  { par: 'height', yes: 'tall', no: 'short', lo: 100, hi: 190 },
  { par: 'level', yes: 'expert', no: 'novice', lo: 3, hi: 20 },
];
const CLASSIFY = ['classify', 'label_for', 'rate', 'sort_into', 'describe', 'grade'];

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Expressions
// ═════════════════════════════════════════════════════════════════════════════════════════════

// a = A; b = ___; r = a OP b; print(r)
MAKE.exprBlank = (p, X) => program([], [
  S.decl(p.a, p.A), S.decl(p.b, X, 'int'),
  S.decl(p.r, E.bin(p.op, V(p.a), V(p.b))), S.print(V(p.r)),
]);
function exprBlankEasy(rng, lang) {
  const [a, b] = rng.pick(PAIRS), r = rng.pick(RESULTS), op = rng.pick(['+', '-', '*']);
  const ans = op === '*' ? rng.int(2, 12) : rng.int(2, 25);
  const A = op === '-' ? ans + rng.int(1, 40) : op === '*' ? rng.int(2, 12) : rng.int(2, 40);
  const out = op === '+' ? A + ans : op === '-' ? A - ans : A * ans;
  const p = { a, b, r, A, op };
  const m = { t: 'exprBlank', p };
  return numberQ({ m, solution: ans, lo: -60, hi: 200, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(MAKE.exprBlank(p, bl()), lang)}`,
    explanation: `${tk(vn(r, lang))} is ${tk(`${vn(a, lang)} ${op} ${vn(b, lang)}`)}, so ${A} ${op} ${tk(BLANK)} must be ${out}: ${A} ${op} ${ans} = ${out}. The blank is **${ans}**.`,
    hints: [
      `The blank is the value of ${tk(vn(b, lang))}. The program prints ${tk(vn(r, lang))}, which is ${tk(`${vn(a, lang)} ${op} ${vn(b, lang)}`)}, and ${tk(vn(a, lang))} is ${A}.`,
      `So ${A} ${op === '*' ? '×' : op === '-' ? '−' : '+'} ${tk(BLANK)} = ${out}. ` +
        (op === '+' ? `Which number added to ${A} gives ${out}? Undo the addition: ${out} − ${A}.`
          : op === '-' ? `What do you take away from ${A} to land on ${out}? Work out ${A} − ${out}.`
            : `What do you multiply ${A} by to get ${out}? Work out ${out} ÷ ${A}.`),
    ] });
}

// Two operators: precedence matters. Shapes: a + b * X, (a + X) * b, a * X - b
MAKE.exprPrec = (p, X) => {
  const a = V(p.a), b = V(p.b);
  const e = p.shape === 0 ? E.bin('+', a, E.bin('*', b, X)) : p.shape === 1 ? E.bin('*', E.bin('+', a, X), b) : E.bin('-', E.bin('*', a, X), b);
  return program([], [S.decl(p.a, p.A), S.decl(p.b, p.B), S.print(e)]);
};
function exprPrec(rng, lang) {
  const [a, b] = rng.pick(PAIRS), shape = rng.int(0, 2);
  const A = rng.int(2, 12), B = rng.int(2, 9), ans = rng.int(2, 12);
  const out = shape === 0 ? A + B * ans : shape === 1 ? (A + ans) * B : A * ans - B;
  const p = { a, b, A, B, shape };
  const m = { t: 'exprPrec', p };
  const line = renderExpr(MAKE.exprPrec(p, E.int(ans)).main[2].value, lang, { program: MAKE.exprPrec(p, E.int(ans)) });
  const rule = shape === 1 ? 'The brackets are worked out first' : 'Multiplication happens before addition and subtraction';
  return numberQ({ m, solution: ans, lo: -60, hi: 200, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(MAKE.exprPrec(p, bl()), lang)}`,
    explanation: `${rule}. With ${tk(vn(a, lang))} = ${A} and ${tk(vn(b, lang))} = ${B}, ${tk(line)} gives ${out}, so the blank is **${ans}**.`,
    hints: [
      `Put in the values: ${tk(vn(a, lang))} = ${A} and ${tk(vn(b, lang))} = ${B}. ${rule}.`,
      shape === 0 ? `${A} + ${B} × ${tk(BLANK)} = ${out}. Take ${A} off first: ${B} × ${tk(BLANK)} must be ${out - A}. Then divide by ${B}.`
        : shape === 1 ? `(${A} + ${tk(BLANK)}) × ${B} = ${out}. Undo the × ${B} first: ${A} + ${tk(BLANK)} must be ${out / B}. Then take ${A} away.`
          : `${A} × ${tk(BLANK)} − ${B} = ${out}. Add ${B} back first: ${A} × ${tk(BLANK)} must be ${out + B}. Then divide by ${A}.`,
    ] });
}

// print((X) / d) or print(a + X / d): smallest value
MAKE.exprDiv = (p, X) => program([], [
  S.decl(p.d, p.D),
  S.print(p.shape === 0 ? E.bin('/', X, V(p.d)) : E.bin('+', V(p.a), E.bin('/', X, V(p.d)))),
]);
// Shape 1 also declares `a` in front.
MAKE.exprDivA = (p, X) => { const base = MAKE.exprDiv(p, X); return p.shape === 1 ? program([], [S.decl(p.a, p.A), ...base.main]) : base; };
function exprDiv(rng, lang) {
  const shape = rng.int(0, 1), [a, d] = rng.pick([['base', 'parts'], ['start', 'groups'], ['offset', 'teams'], ['bonus', 'boxes']]);
  const D = rng.int(2, 9), q = rng.int(2, 12), A = rng.int(1, 20);
  const ans = q * D, out = shape === 0 ? q : A + q;
  const p = { a, d, D, A, shape };
  const make = MAKE.exprDivA;
  const m = { t: 'exprDivA', p };
  return numberQ({ m, solution: ans, smallest: true, floor: 0, spec: { out: [String(out)] }, lang,
    prompt: `What is the **smallest** whole number (0 or more) that can fill the blank ${tk(BLANK)} so that this program prints ${tk(out)}?\n\n${code(make(p, bl()), lang)}`,
    explanation: `${intDivNote(lang)} ${tk(`${BLANK} ${langNotes(lang).intDiv} ${vn(d, lang)}`)} must be ${q}, and the smallest number that gives ${q} when divided by ${D} is ${q} × ${D} = **${ans}** (values up to ${ans + D - 1} give ${q} too).`,
    hints: [
      intDivNote(lang),
      shape === 0 ? `The program prints ${tk(`${BLANK} ${langNotes(lang).intDiv} ${vn(d, lang)}`)} with ${tk(vn(d, lang))} = ${D}, so ${tk(BLANK)} divided by ${D}, rounded down, must be ${q}.`
        : `${tk(vn(a, lang))} is ${A}, so ${tk(`${BLANK} ${langNotes(lang).intDiv} ${vn(d, lang)}`)} must be ${out} − ${A} = ${q}, with ${tk(vn(d, lang))} = ${D}.`,
      `Several numbers give ${q} when divided by ${D} and rounded down. You want the lowest one: the first number that ${D} goes into exactly ${q} times.`,
    ] });
}

// x = A; y = B; print(___)  → choose the operator
MAKE.exprOp = (p, X) => program([], [S.decl(p.x, p.A), S.decl(p.y, p.B), S.print(X)]);
function exprOpChoice(rng, lang, difficulty) {
  const [x, y] = rng.pick(PAIRS);
  const A = rng.int(11, 40), B = rng.int(3, 9);
  const ops = ['+', '-', '*', '/', '%'];
  const op = difficulty === 'easy' ? rng.pick(['+', '-', '*']) : rng.pick(['/', '%']);
  const val = { '+': A + B, '-': A - B, '*': A * B, '/': Math.floor(A / B), '%': A % B }[op];
  const p = { x, y, A, B };
  const m = { t: 'exprOp', p };
  const mk = o => E.bin(o, V(x), V(y));
  const prog = MAKE.exprOp(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog });
  return choiceQ({ rng, m, lang, correct: mk(op), pool: ops.filter(o => o !== op).map(mk), spec: { out: [String(val)] }, renderOpt,
    prompt: `Which expression fills the blank ${tk(BLANK)} so that this program prints ${tk(val)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `${tk(renderOpt(opts[ci], lang))} with ${A} and ${B} gives ${val}.${op === '/' || op === '%' ? ' ' + intDivNote(lang) : ''} ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { out: [String(val)] }, lang)}.`).join(' '),
    hints: [
      `Put the values into each option: ${tk(vn(x, lang))} is ${A} and ${tk(vn(y, lang))} is ${B}. Only one option gives ${val}.`,
      difficulty === 'easy' ? 'Work out each one in turn: add, subtract, multiply… and compare with the number the program should print.'
        : `${intDivNote(lang)} Work out both for ${A} and ${B}: how many whole times does ${B} go into ${A}, and what is left over?`,
    ] });
}

// a, b, c; print(___) → which compound expression (precedence)
MAKE.exprCompound = (p, X) => program([], [S.decl(p.a, p.A), S.decl(p.b, p.B), S.decl(p.c, p.C), S.print(X)]);
function exprCompound(rng, lang) {
  const [a, b, c] = rng.pick([['a', 'b', 'c'], ['x', 'y', 'z'], ['red', 'green', 'blue'], ['cats', 'dogs', 'birds'], ['low', 'mid', 'top']]);
  const A = rng.int(2, 12), B = rng.int(2, 12), C = rng.int(2, 7);
  const [va, vb, vc] = [V(a), V(b), V(c)];
  const shapes = [
    E.bin('+', va, E.bin('*', vb, vc)), E.bin('*', E.bin('+', va, vb), vc), E.bin('+', E.bin('*', va, vb), vc),
    E.bin('*', va, E.bin('+', vb, vc)), E.bin('/', E.bin('+', va, vb), vc), E.bin('+', va, E.bin('/', vb, vc)),
    E.bin('%', E.bin('+', va, vb), vc), E.bin('+', va, E.bin('%', vb, vc)), E.bin('-', E.bin('*', va, vc), vb),
  ];
  const js = [A + B * C, (A + B) * C, A * B + C, A * (B + C), Math.floor((A + B) / C), A + Math.floor(B / C), (A + B) % C, A + (B % C), A * C - B];
  const k = rng.int(0, shapes.length - 1);
  const p = { a, b, c, A, B, C };
  const m = { t: 'exprCompound', p };
  const prog = MAKE.exprCompound(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog });
  const spec = { out: [String(js[k])] };
  return choiceQ({ rng, m, lang, correct: shapes[k], pool: shapes.filter((_, i) => i !== k), spec, renderOpt,
    prompt: `Which expression fills the blank ${tk(BLANK)} so that this program prints ${tk(js[k])}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `Brackets first, then ${tk('*')}, ${tk(langNotes(lang).intDiv)} and ${tk('%')}, then ${tk('+')} and ${tk('-')}, left to right. ` +
      `${tk(renderOpt(opts[ci], lang))} gives ${js[k]}. ` + opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, spec, lang)}.`).join(' '),
    hints: [
      `Put the values into each option: ${tk(vn(a, lang))} = ${A}, ${tk(vn(b, lang))} = ${B}, ${tk(vn(c, lang))} = ${C}. Only one gives ${js[k]}.`,
      `Order matters: brackets first, then ${tk('*')}, ${tk(langNotes(lang).intDiv)} and ${tk('%')}, then ${tk('+')} and ${tk('-')}. ${intDivNote(lang)}`,
    ] });
}

// Two-part: total = A; total += ___; print(total); <update>; print(total)
MAKE.exprMulti = (p, X) => {
  const t = p.t, upd = p.upd === 0 ? S.assign(t, E.bin('%', E.bin('*', V(t), p.K), p.M))
    : p.upd === 1 ? S.augAssign(t, '/', p.K) : S.assign(t, E.bin('+', E.bin('%', V(t), p.M), p.K));
  return program([], [S.decl(t, p.A), S.augAssign(t, p.sign, X), S.print(V(t)), { ...upd, id: 'upd' }, S.print(V(t))]);
};
function exprMulti(rng, lang) {
  const t = rng.pick(['total', 'score', 'coins', 'points', 'level']), sign = rng.pick(['+', '-']), upd = rng.int(0, 2);
  const ans = rng.int(3, 30), A = sign === '-' ? ans + rng.int(5, 40) : rng.int(5, 40);
  const K = upd === 1 ? rng.int(2, 6) : rng.int(2, 9), M = rng.int(5, 12);
  const t1 = sign === '+' ? A + ans : A - ans;
  const t2 = upd === 0 ? (t1 * K) % M : upd === 1 ? Math.floor(t1 / K) : (t1 % M) + K;
  const p = { t, sign, upd, A, K, M };
  const m = { t: 'exprMulti', p };
  const prog = MAKE.exprMulti(p, bl());
  const updLine = lineAt(render(prog, lang), 'upd');
  return blankOutputQ({ m, solution: ans, lo: -80, hi: 200, spec: { out: [String(t1)] }, outLine: 1, outAnswer: t2, lang,
    prompt: `The first line this program prints is ${tk(t1)}.\n\n${code(prog, lang)}`,
    askBlank: `Which whole number fills the blank ${tk(BLANK)}?`,
    askOut: 'What does the second line print?',
    explanation: `${A} ${sign} **${ans}** = ${t1}, so the first line is ${t1}. Then ${tk(updLine)} makes it **${t2}**. ${intDivNote(lang)}`,
    hintBlank: `${tk(vn(t, lang))} starts at ${A}, and the blank is ${sign === '+' ? 'added to' : 'taken away from'} it before the first print. ` +
      `So ${A} ${sign === '+' ? '+' : '−'} ${tk(BLANK)} = ${t1}: ${sign === '+' ? `work out ${t1} − ${A}` : `work out ${A} − ${t1}`}.`,
    hintOut: `Start from ${t1} (the first line) and apply ${tk(updLine)}: ` +
      (upd === 0 ? `multiply by ${K}, then take the remainder after dividing by ${M}.`
        : upd === 1 ? `divide by ${K} and drop the remainder.`
          : `take the remainder after dividing by ${M}, then add ${K}.`) + ` ${intDivNote(lang)}` });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Conditionals
// ═════════════════════════════════════════════════════════════════════════════════════════════

const CMP_WORDS = { '>=': 'at least', '>': 'more than', '<=': 'at most', '<': 'less than', '==': 'exactly' };
const cmpJs = (op, a, b) => ({ '>=': a >= b, '>': a > b, '<=': a <= b, '<': a < b, '==': a === b, '!=': a !== b }[op]);

// def f(par): if ___: return A; return B
MAKE.condStr = (p, X) => program([S.fn(p.fn, [p.par], [
  S.if(X, [S.return(E.str(p.yes))]), S.return(E.str(p.no)),
], 'str')], []);
const showCall = (prog, fn, lang) => t => callText(prog, fn, t.args, lang);
const examplesText = (prog, fn, tests, lang) => tests.map(t => `${tk(callText(prog, fn, t.args, lang))} → ${tk(fmtVal(t.expect))}`).join(', ');

function condCmpChoice(rng, lang) {
  const th = rng.pick(THEMES), fn = rng.pick(CLASSIFY), op = rng.pick(['>=', '>', '<=', '<', '==']);
  const K = rng.int(th.lo, th.hi);
  const up = op === '>=' || op === '>' || op === '==';
  const yes = up ? th.yes : th.no, no = up ? th.no : th.yes;
  const p = { fn, par: th.par, yes, no };
  const m = { t: 'condStr', p };
  const prog = MAKE.condStr(p, bl());
  const tests = [K - 1, K, K + 1].map(n => ({ entry: fn, args: [n], expect: cmpJs(op, n, K) ? yes : no }));
  const mk = o => E.bin(o, V(th.par), K);
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn });
  const P = tk(vn(th.par, lang));
  return choiceQ({ rng, m, lang, correct: mk(op), pool: ['>=', '>', '<=', '<', '==', '!='].filter(o => o !== op).map(mk), spec: { tests }, renderOpt,
    prompt: `${tk(fnName(fn, lang))} should return ${tk(`"${yes}"`)} when ${P} is ${CMP_WORDS[op]} ${K}, and ${tk(`"${no}"`)} otherwise. ` +
      `For example: ${examplesText(prog, fn, tests, lang)}. Which condition fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `"${CMP_WORDS[op]} ${K}" is ${tk(renderOpt(opts[ci], lang))}. ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, fn, lang))}.`).join(' '),
    hints: [
      `The condition must be true exactly when the function should return ${tk(`"${yes}"`)}. Test each option with the three examples: ${P} = ${K - 1}, ${K} and ${K + 1}.`,
      `The deciding case is ${P} = ${K} itself: the examples say it returns ${tk(`"${tests[1].expect}"`)}. ${tk('>=')} and ${tk('<=')} include the number; ${tk('>')} and ${tk('<')} do not.`,
    ] });
}

// def f(par): if par OP ___: return A; return B   → threshold number
MAKE.condThresh = (p, X) => program([S.fn(p.fn, [p.par], [
  S.if(E.bin(p.op, V(p.par), X), [S.return(E.str(p.yes))]), S.return(E.str(p.no)),
], 'str')], []);
function condThreshold(rng, lang, difficulty) {
  const th = rng.pick(THEMES), fn = rng.pick(CLASSIFY);
  const up = difficulty === 'easy' ? true : rng.next() < 0.5;
  const op = up ? rng.pick(['>=', '>']) : rng.pick(['<=', '<']);
  const word = up ? rng.pick(['>=', '>']) : rng.pick(['<=', '<']);
  const K = rng.int(th.lo, th.hi);
  const yes = up ? th.yes : th.no, no = up ? th.no : th.yes;
  // yes ⇔ par `word` K. The code compares par `op` t.
  const edge = word === '>=' ? K : word === '>' ? K + 1 : word === '<=' ? K : K - 1; // smallest/largest "yes" value
  const ans = op === '>=' || op === '<=' ? edge : op === '>' ? edge - 1 : edge + 1;
  const p = { fn, par: th.par, op, yes, no };
  const m = { t: 'condThresh', p };
  const prog = MAKE.condThresh(p, bl());
  const tests = [K - 2, K - 1, K, K + 1, K + 2].map(n => ({ entry: fn, args: [n], expect: cmpJs(word, n, K) ? yes : no }));
  const P = tk(vn(th.par, lang));
  const line = renderExpr(E.bin(op, V(th.par), ans), lang, { program: prog, fn });
  return numberQ({ m, solution: ans, lo: K - 30, hi: K + 30, spec: { tests }, lang,
    prompt: `${tk(fnName(fn, lang))} should return ${tk(`"${yes}"`)} when ${P} is ${CMP_WORDS[word]} ${K}, and ${tk(`"${no}"`)} otherwise. Which whole number fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explanation: `"${CMP_WORDS[word]} ${K}" means the ${up ? 'first' : 'last'} ${tk(`"${yes}"`)} value is ${edge}. Reading the code's ${tk(op)}, ${tk(line)} is true for exactly those values, so the blank is **${ans}**. Watch the difference between ${tk(op.length === 2 ? op : op + '=')} (includes the number) and ${tk(op[0])} (does not).`,
    hints: [
      `"${CMP_WORDS[word]} ${K}" decides which values of ${P} return ${tk(`"${yes}"`)}. Check ${K} itself, then the numbers just below and just above it.`,
      `Find the ${up ? 'first (smallest)' : 'last (largest)'} value of ${P} that should return ${tk(`"${yes}"`)}.`,
      `The code tests ${tk(renderExpr(E.bin(op, V(th.par), bl()), lang, { program: prog, fn }))}. ${op.length === 2 ? `${tk(op)} includes the number in the blank, so the blank is that value itself.` : `${tk(op)} does not include the number in the blank, so the blank must be one step ${up ? 'below' : 'above'} that value.`}`,
    ] });
}

function condRangeChoice(rng, lang) {
  const th = rng.pick(THEMES), fn = rng.pick(CLASSIFY), inside = rng.next() < 0.5;
  const L = rng.int(th.lo, th.hi), H = L + rng.int(3, 15);
  const P = V(th.par), ge = (o, k) => E.bin(o, P, k);
  const yes = th.yes, no = th.no;
  const correct = inside ? E.and(ge('>=', L), ge('<=', H)) : E.or(ge('<', L), ge('>', H));
  const pool = inside
    ? [E.and(ge('>', L), ge('<=', H)), E.and(ge('>=', L), ge('<', H)), E.or(ge('>=', L), ge('<=', H)), E.and(ge('>', L), ge('<', H)), E.and(ge('<=', L), ge('>=', H)), E.or(ge('<', L), ge('>', H))]
    : [E.and(ge('<', L), ge('>', H)), E.or(ge('<=', L), ge('>', H)), E.or(ge('<', L), ge('>=', H)), E.or(ge('>', L), ge('<', H)), E.and(ge('>=', L), ge('<=', H))];
  const p = { fn, par: th.par, yes, no };
  const m = { t: 'condStr', p };
  const prog = MAKE.condStr(p, bl());
  const tests = [L - 1, L, H, H + 1].map(n => ({ entry: fn, args: [n], expect: (n >= L && n <= H) === inside ? yes : no }));
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn });
  const Pn = tk(vn(th.par, lang)), notes = langNotes(lang);
  const want = inside ? `from ${L} to ${H} (both included)` : `below ${L} or above ${H}`;
  return choiceQ({ rng, m, lang, correct, pool, spec: { tests }, renderOpt,
    prompt: `${tk(fnName(fn, lang))} should return ${tk(`"${yes}"`)} when ${Pn} is ${want}, and ${tk(`"${no}"`)} otherwise. ` +
      `For example: ${examplesText(prog, fn, tests, lang)}. Which condition fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `${inside ? `Both checks must hold, so join them with ${tk(notes.and)}` : `Either check is enough, so join them with ${tk(notes.or)}`}: ${tk(renderOpt(opts[ci], lang))}. ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, fn, lang))}.`).join(' '),
    hints: [
      `Decide how the two checks combine. ${tk(notes.and)} needs both to be true (inside a range); ${tk(notes.or)} needs only one (outside it).`,
      `Then check the edges, where most options go wrong: ${Pn} = ${L - 1}, ${L}, ${H} and ${H + 1} should give ${tests.map(t => tk(`"${t.expect}"`)).join(', ')}.`,
    ] });
}

function condDivChoice(rng, lang) {
  const fn = rng.pick(['classify', 'label_for', 'sort_into', 'check_num']), par = rng.pick(['n', 'num', 'count', 'amount']);
  const k = rng.int(2, 7);
  const [yes, no] = k === 2 ? ['even', 'odd'] : rng.pick([['yes', 'no'], ['fits', 'left over'], ['match', 'miss']]);
  const P = V(par);
  const correct = E.bin('==', E.bin('%', P, k), 0);
  const pool = [E.bin('==', E.bin('%', P, k), 1), E.bin('==', E.bin('/', P, k), 0), E.bin('==', E.bin('%', k, P), 0),
    E.bin('!=', E.bin('%', P, k), 0), E.bin('==', E.bin('/', P, k), 1), E.bin('>', E.bin('%', P, k), 0)];
  const p = { fn, par, yes, no };
  const m = { t: 'condStr', p };
  const prog = MAKE.condStr(p, bl());
  const xs = [...new Set([k, 2 * k, 2 * k + 1, k + 1, rng.int(3, 6) * k])].slice(0, 4).sort((a, b) => a - b);
  const tests = xs.map(n => ({ entry: fn, args: [n], expect: n % k === 0 ? yes : no }));
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn });
  const spec = k === 2 ? 'an even number' : `a multiple of ${k}`;
  return choiceQ({ rng, m, lang, correct, pool, spec: { tests }, renderOpt,
    prompt: `${tk(fnName(fn, lang))} should return ${tk(`"${yes}"`)} when ${tk(vn(par, lang))} is ${spec}, and ${tk(`"${no}"`)} otherwise. ` +
      `For example: ${examplesText(prog, fn, tests, lang)}. Which condition fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `A number is ${spec} when dividing it by ${k} leaves remainder 0: ${tk(renderOpt(opts[ci], lang))}. ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, fn, lang))}.`).join(' '),
    hints: [
      `A number is ${spec} when ${k} goes into it exactly, with nothing left over. ${intDivNote(lang)}`,
      `Test each option on the examples, e.g. ${tk(vn(par, lang))} = ${xs[0]} should give ${tk(`"${tests[0].expect}"`)} and ${tk(vn(par, lang))} = ${xs[xs.length - 1]} should give ${tk(`"${tests[tests.length - 1].expect}"`)}.`,
    ] });
}

function condHardChoice(rng, lang) {
  const th = rng.pick(THEMES), fn = rng.pick(CLASSIFY), kind = rng.int(0, 1);
  const L = rng.int(th.lo, th.hi), H = L + rng.int(4, 15), M = rng.int(L + 1, H - 1);
  const P = V(th.par), c = (o, k) => E.bin(o, P, k);
  let correct, pool, tests, want;
  const yes = th.yes, no = th.no;
  if (kind === 0) {
    correct = E.or(c('<', L), c('>=', H));
    pool = [E.and(c('<', L), c('>=', H)), E.or(c('<=', L), c('>=', H)), E.or(c('<', L), c('>', H)), E.or(c('>', L), c('<', H)),
      E.or(E.not(c('<', L)), c('>=', H)), E.and(c('>=', L), c('<', H))];
    tests = [L - 1, L, H - 1, H].map(n => ({ entry: fn, args: [n], expect: n < L || n >= H ? yes : no }));
    want = `less than ${L}, or ${H} or more`;
  } else {
    correct = E.and(c('>=', L), c('<=', H), c('!=', M));
    pool = [E.or(E.and(c('>=', L), c('<=', H)), c('!=', M)), E.and(c('>=', L), E.or(c('<=', H), c('!=', M))),
      E.and(c('>', L), c('<', H), c('!=', M)), E.and(c('>=', L), c('<=', H), c('==', M)), E.or(c('>=', L), E.and(c('<=', H), c('!=', M))),
      E.and(c('>=', L), c('<=', H), E.not(c('!=', M)))];
    tests = [L - 1, L, M, H, H + 1].map(n => ({ entry: fn, args: [n], expect: n >= L && n <= H && n !== M ? yes : no }));
    want = `from ${L} to ${H} (both included), except exactly ${M}`;
  }
  const p = { fn, par: th.par, yes, no };
  const m = { t: 'condStr', p };
  const prog = MAKE.condStr(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn });
  const notes = langNotes(lang);
  return choiceQ({ rng, m, lang, correct, pool, spec: { tests }, renderOpt,
    prompt: `${tk(fnName(fn, lang))} should return ${tk(`"${yes}"`)} when ${tk(vn(th.par, lang))} is ${want}, and ${tk(`"${no}"`)} otherwise. ` +
      `For example: ${examplesText(prog, fn, tests, lang)}. Which condition fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `${tk(renderOpt(opts[ci], lang))} matches every example. ${tk(notes.and)} is checked before ${tk(notes.or)}, so brackets change the meaning. ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, fn, lang))}.`).join(' '),
    hints: [
      kind === 0 ? `There are two separate ways to get ${tk(`"${yes}"`)}, so the checks are joined with ${tk(notes.or)}. Look at each edge: is ${L} included? Is ${H}?`
        : `Three things must all be true: at least ${L}, at most ${H}, and not ${M}. Things that must all hold are joined with ${tk(notes.and)}.`,
      `${tk(notes.and)} is worked out before ${tk(notes.or)}, so brackets can change the meaning. Test each option on the examples: ${tests.map(t => `${t.args[0]} → ${tk(`"${t.expect}"`)}`).join(', ')}.`,
    ] });
}

// Two-part: if/elif/else points, blank threshold + total output.
MAKE.condElif = (p, X) => {
  const P = V(p.par);
  const f = S.fn(p.fn, [p.par], [
    S.if(E.bin('>=', P, p.A), [S.return(3)], [[E.bin(p.op, P, X), [S.return(2)]]], [S.return(1)]),
  ], 'int');
  const calls = p.vals.map(x => E.call(p.fn, [x]));
  return program([f], [S.decl(p.t, E.bin('+', E.bin('+', calls[0], calls[1]), calls[2])), S.print(V(p.t))]);
};
function condElif(rng, lang) {
  const th = rng.pick(THEMES), fn = rng.pick(['points_for', 'stars_for', 'grade', 'rank_of']), op = rng.pick(['>=', '>']);
  const B = rng.int(th.lo, th.hi), A = B + rng.int(4, 20), t = rng.pick(['total', 'tally', 'sum_all']);
  const vals = [rng.int(Math.max(0, B - 10), B - 1), rng.int(B, A - 1), rng.int(Math.max(0, B - 10), A + 10)];
  const pts = x => (x >= A ? 3 : x >= B ? 2 : 1);
  const total = vals.reduce((s, x) => s + pts(x), 0);
  const ans = op === '>=' ? B : B - 1;
  const p = { fn, par: th.par, op, A, vals, t };
  const m = { t: 'condElif', p };
  const prog = MAKE.condElif(p, bl());
  const tests = [B - 2, B - 1, B, B + 1, A - 1, A].map(n => ({ entry: fn, args: [n], expect: pts(n) }));
  const P = tk(vn(th.par, lang));
  return blankOutputQ({ m, solution: ans, lo: B - 30, hi: B + 30, spec: { tests }, outLine: 0, outAnswer: total, lang,
    prompt: `${tk(fnName(fn, lang))} should return 3 when ${P} is ${A} or more, 2 when ${P} is from ${B} to ${A - 1}, and 1 when ${P} is below ${B}.\n\n${code(prog, lang)}`,
    askBlank: `Which whole number fills the blank ${tk(BLANK)}?`,
    askOut: 'With the blank filled in correctly, what does the program print?',
    explanation: `The ${tk(langNotes(lang).elseIf)} branch must start at ${B}; with ${tk(op)} that is ${tk(renderExpr(E.bin(op, V(th.par), ans), lang, { program: prog, fn }))}, so the blank is **${ans}**. ` +
      `The calls give ${vals.map(pts).join(' + ')} = **${total}**.`,
    hintBlank: `The first check already handles ${A} and more. The ${tk(langNotes(lang).elseIf)} line must be true from ${B} upward but false for anything below ${B}. ` +
      (op === '>=' ? `${tk('>=')} includes the number in the blank, so the blank is where 2 points start.` : `${tk('>')} does not include the number in the blank, so the blank sits one below where 2 points start.`),
    hintOut: `Score each call with the rule (3 for ${A} or more, 2 for ${B} to ${A - 1}, 1 below ${B}): ${vals.map(v => tk(callText(prog, fn, [v], lang))).join(', ')}. Then add the three results.` });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Loops
// ═════════════════════════════════════════════════════════════════════════════════════════════

// t = 0; for i in range(S, ___) or range(___, E): t += i | t += K; print(t)
MAKE.loopRange = (p, X) => program([], [
  S.decl(p.t, 0),
  S.forRange(p.i, p.blankEnd ? p.S : X, p.blankEnd ? X : p.E, 1, [S.augAssign(p.t, '+', p.addI ? V(p.i) : E.int(p.K))]),
  S.print(V(p.t)),
]);
function loopRange(rng, lang) {
  const t = rng.pick(COUNTERS), i = rng.pick(['i', 'k', 'n']), blankEnd = rng.next() < 0.6, addI = rng.next() < 0.5;
  const St = rng.int(1, 6), K = rng.int(2, 9), len = rng.int(2, 8);
  const En = St + len, ans = blankEnd ? En : St;
  const out = addI ? (St + En - 1) * len / 2 : K * len;
  const p = { t, i, S: St, E: En, K, blankEnd, addI };
  const m = { t: 'loopRange', p };
  const prog = MAKE.loopRange(p, bl());
  const lo = blankEnd ? St - 10 : -10, hi = blankEnd ? En + 40 : En + 10;
  return numberQ({ m, solution: ans, lo, hi, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(prog, lang)}`,
    explanation: `A range loop stops before its end value: ${rangeText(lang)}. ` +
      `With the blank as **${ans}**, ${tk(vn(i, lang))} takes ${len} values from ${St} to ${En - 1}, and ${addI ? `${St} + … + ${En - 1}` : `${len} × ${K}`} = ${out}.`,
    hints: [
      `The blank is the loop's ${blankEnd ? 'end' : 'start'} value. Remember: ${rangeText(lang)}.`,
      addI
        ? (blankEnd ? `Each pass adds ${tk(vn(i, lang))} to ${tk(vn(t, lang))}. Add ${St} + ${St + 1} + ${St + 2} + … and stop when the total reaches ${out}.`
          : `Each pass adds ${tk(vn(i, lang))} to ${tk(vn(t, lang))}, and the last value is ${En - 1}. Add ${En - 1} + ${En - 2} + … backwards until the total reaches ${out}.`)
        : `Each pass adds ${K}, so the loop must run ${out} ÷ ${K} times.`,
      blankEnd ? `The end value is one more than the last value of ${tk(vn(i, lang))} that was used, because the range stops before its end.`
        : addI ? `The start is the first value of ${tk(vn(i, lang))} that is used: the last (smallest) number you added.`
          : `The start is the first value of ${tk(vn(i, lang))} that is used: ${En} minus the number of passes.`,
    ] });
}

// n = S; count = 0; while n < LIM: n += ___; count += 1; print(count); print(n)
MAKE.whileStep = (p, X) => program([], [
  S.decl(p.n, p.S), S.decl(p.c, 0),
  S.while(E.bin('<', V(p.n), p.LIM), [S.augAssign(p.n, '+', X), S.augAssign(p.c, '+', 1)]),
  S.print(V(p.c)), S.print(V(p.n)),
]);
function whileStep(rng, lang) {
  const n = rng.pick(['pos', 'dist', 'height', 'money', 'fuel']), c = rng.pick(['count', 'moves', 'turns', 'rounds']);
  const St = rng.int(0, 10), step = rng.int(2, 9), T = rng.int(2, 7);
  const LIM = St + (T - 1) * step + rng.int(1, step);
  const final = St + T * step;
  const p = { n, c, S: St, LIM };
  const m = { t: 'whileStep', p };
  const prog = MAKE.whileStep(p, bl());
  return numberQ({ m, solution: step, lo: -10, hi: 60, spec: { out: [String(T), String(final)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(T)} and then ${tk(final)}.\n\n${code(prog, lang)}`,
    explanation: `The loop ran ${T} times and ${tk(vn(n, lang))} went from ${St} to ${final}, so each pass added (${final} − ${St}) ÷ ${T} = **${step}**. ` +
      `After ${T - 1} passes it was ${St + (T - 1) * step}, still below ${LIM}, so the loop ran once more.`,
    hints: [
      `The first line is ${tk(vn(c, lang))}: the loop body ran ${T} times. The second is the final ${tk(vn(n, lang))}.`,
      `${tk(vn(n, lang))} went from ${St} to ${final} in ${T} equal steps, so each step adds (${final} − ${St}) ÷ ${T}.`,
    ] });
}

// count multiples: for i in range(1, N): if i % ___ == 0: count += 1
MAKE.loopMultiples = (p, X) => program([], [
  S.decl(p.c, 0),
  S.forRange(p.i, 1, p.N, 1, [S.if(E.bin('==', E.bin('%', V(p.i), X), 0), [S.augAssign(p.c, '+', p.add ? V(p.i) : E.int(1))])]),
  S.print(V(p.c)),
]);
function loopMultiples(rng, lang) {
  const c = rng.pick(COUNTERS), i = rng.pick(['i', 'k', 'n']), add = rng.next() < 0.5;
  const k = rng.int(2, 9), N = rng.int(15, 45);
  const cnt = Math.floor((N - 1) / k), out = add ? k * cnt * (cnt + 1) / 2 : cnt;
  const p = { c, i, N, add };
  const m = { t: 'loopMultiples', p };
  const prog = MAKE.loopMultiples(p, bl());
  const mult = Array.from({ length: cnt }, (_, j) => (j + 1) * k);
  return numberQ({ m, solution: k, lo: -5, hi: N + 5, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(prog, lang)}`,
    explanation: `${tk(vn(i, lang))} runs from 1 to ${N - 1} (${rangeText(lang)}). The multiples of **${k}** in that range are ${mult.join(', ')}, ` +
      `${add ? `which add up to ${out}` : `which is ${cnt} of them`}. No other divisor gives ${out}.`,
    hints: [
      `${tk(vn(i, lang))} runs from 1 to ${N - 1} (${rangeText(lang)}). ${tk(`${vn(i, lang)} % ${BLANK} == 0`)} is true when ${tk(vn(i, lang))} is a multiple of the blank.`,
      add ? `The program adds up every multiple of the blank below ${N} and gets ${out}. Try small numbers: what do the multiples of 2 below ${N} add up to? Of 3?`
        : `The program counts the multiples of the blank below ${N} and gets ${out}. For a number d, there are ${N - 1} ÷ d of them (rounded down). Try d = 2, 3, 4, …`,
    ] });
}

// for i in range(S, ___, K): total += i   → smallest end
MAKE.loopStepEnd = (p, X) => program([], [
  S.decl(p.t, 0), S.forRange(p.i, p.S, X, p.K, [S.augAssign(p.t, '+', V(p.i))]), S.print(V(p.t)),
]);
function loopStepEnd(rng, lang) {
  const t = rng.pick(COUNTERS), i = rng.pick(['i', 'k', 'n']);
  const St = rng.int(1, 6), K = rng.int(2, 5), cnt = rng.int(2, 6);
  const last = St + (cnt - 1) * K, ans = last + 1;
  const vals = Array.from({ length: cnt }, (_, j) => St + j * K), out = vals.reduce((a, b) => a + b, 0);
  const p = { t, i, S: St, K };
  const m = { t: 'loopStepEnd', p };
  return numberQ({ m, solution: ans, smallest: true, floor: 0, spec: { out: [String(out)] }, lang,
    prompt: `What is the **smallest** whole number (0 or more) that can fill the blank ${tk(BLANK)} so that this program prints ${tk(out)}?\n\n${code(MAKE.loopStepEnd(p, bl()), lang)}`,
    explanation: `${tk(vn(i, lang))} counts up by ${K}: ${vals.join(', ')} add up to ${out}. The range stops before its end (${rangeText(lang)}), so the end must be more than ${last}; the smallest is **${ans}**.`,
    hints: [
      `${tk(vn(i, lang))} starts at ${St} and goes up by ${K} each pass: ${St}, ${St + K}, ${St + 2 * K}, … Add them up until the total is ${out}.`,
      `The loop must stop right after the last value you added. ${rangeText(lang)}, so the end must be bigger than that value. Which is the smallest such end?`,
    ] });
}

// Two-part: while n < ___: n = n * F (or n += F); steps += 1; print(steps); print(n)
MAKE.whileLimit = (p, X) => program([], [
  S.decl(p.n, p.S), S.decl(p.s, 0),
  S.while(E.bin('<', V(p.n), X), [p.mul ? S.assign(p.n, E.bin('*', V(p.n), p.F)) : S.augAssign(p.n, '+', p.F), S.augAssign(p.s, '+', 1)]),
  S.print(V(p.s)), S.print(V(p.n)),
]);
function whileLimit(rng, lang) {
  const n = rng.pick(['area', 'cells', 'money', 'value', 'power']), s = rng.pick(['steps', 'rounds', 'days', 'turns']);
  const mul = rng.next() < 0.6, F = mul ? rng.int(2, 3) : rng.int(3, 12), St = mul ? rng.int(1, 5) : rng.int(0, 10), T = rng.int(2, mul ? 5 : 6);
  const seq = [St];
  for (let j = 0; j < T; j++) seq.push(mul ? seq[j] * F : seq[j] + F);
  const ans = seq[T - 1] + 1, final = seq[T];
  const p = { n, s, S: St, F, mul };
  const m = { t: 'whileLimit', p };
  const prog = MAKE.whileLimit(p, bl());
  return blankOutputQ({ m, solution: ans, smallest: true, floor: 0, spec: { out: [String(T)] }, outLine: 1, outAnswer: final, lang,
    prompt: `The first line this program prints is ${tk(T)}.\n\n${code(prog, lang)}`,
    askBlank: `What is the smallest whole number (0 or more) that can fill the blank ${tk(BLANK)}?`,
    askOut: 'What does the second line print?',
    explanation: `${tk(vn(n, lang))} goes ${seq.join(' → ')}. For exactly ${T} passes the loop must still run at ${seq[T - 1]} and stop at ${final}, ` +
      `so the limit must be more than ${seq[T - 1]}: the smallest is **${ans}**. The second line prints **${final}**.`,
    hintBlank: `The first line says the loop body ran ${T} times. ${tk(vn(n, lang))} starts at ${St} and each pass ${mul ? `multiplies it by ${F}` : `adds ${F}`}: ` +
      `${seq.slice(0, T).join(' → ')} → … The condition ${tk(`${vn(n, lang)} < ${BLANK}`)} must still be true when ${tk(vn(n, lang))} is ${seq[T - 1]}, and false after the next pass.`,
    hintOut: `The second line prints ${tk(vn(n, lang))} after the loop. Before the last pass it was ${seq[T - 1]}; apply one more pass (${mul ? `× ${F}` : `+ ${F}`}).` });
}

// nested loops count
MAKE.nested = (p, X) => {
  const inner = p.shape === 0 ? S.forRange(p.j, 0, X, 1, [S.augAssign(p.c, '+', 1)])
    : p.shape === 1 ? S.forRange(p.j, V(p.i), X, 1, [S.augAssign(p.c, '+', 1)])
      : S.forRange(p.j, 0, V(p.i), 1, [S.augAssign(p.c, '+', 1)]);
  return program([], [S.decl(p.c, 0), S.forRange(p.i, 0, p.shape === 2 ? X : p.A, 1, [inner]), S.print(V(p.c))]);
};
function nested(rng, lang) {
  const c = rng.pick(['count', 'pairs', 'cells', 'tally']), [i, j] = rng.pick([['i', 'j'], ['row', 'col'], ['x', 'y'], ['a', 'b']]);
  const shape = rng.int(0, 2), A = rng.int(2, 6);
  let ans, out, how;
  if (shape === 0) { ans = rng.int(2, 9); out = A * ans; how = `The outer loop runs ${A} times and the inner loop **${ans}** times each: ${A} × ${ans} = ${out}.`; }
  else if (shape === 1) {
    ans = rng.int(A, A + 6);
    const runs = Array.from({ length: A }, (_, k) => Math.max(0, ans - k));
    out = runs.reduce((x, y) => x + y, 0);
    how = `The inner loop starts at the outer variable, so it runs ${runs.join(' + ')} = ${out} times when the end is **${ans}**.`;
  } else {
    ans = rng.int(3, 9);
    const runs = Array.from({ length: ans }, (_, k) => k);
    out = runs.reduce((x, y) => x + y, 0);
    how = `The inner loop runs ${tk(vn(i, lang))} times on each pass: ${runs.join(' + ')} = ${out} when the outer end is **${ans}**.`;
  }
  const p = { c, i, j, shape, A };
  const m = { t: 'nested', p };
  return numberQ({ m, solution: ans, lo: -5, hi: 60, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(MAKE.nested(p, bl()), lang)}`,
    explanation: `${how} (${rangeText(lang)}.)`,
    hints: [
      `Count how many times ${tk(`${vn(c, lang)} += 1`)} runs in total: that is ${out}. Remember: ${rangeText(lang)}.`,
      shape === 0 ? `The outer loop runs ${A} times (${tk(vn(i, lang))} = 0 to ${A - 1}), and the inner loop runs the same number of times on every pass. So ${A} × (inner passes) = ${out}.`
        : shape === 1 ? `The outer loop runs ${A} times (${tk(vn(i, lang))} = 0 to ${A - 1}). The inner loop starts at ${tk(vn(i, lang))}, so it runs one time fewer on each pass. For an end E it runs E + (E − 1) + … (${A} terms); try values of E until the sum is ${out}.`
          : `The inner loop runs ${tk(vn(i, lang))} times on each pass: 0, then 1, then 2, … Add 0 + 1 + 2 + 3 + … and count how many passes it takes to reach ${out}.`,
    ] });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Lists and strings
// ═════════════════════════════════════════════════════════════════════════════════════════════

function distinctInts(rng, n, lo, hi) {
  const out = [];
  while (out.length < n) { const x = rng.int(lo, hi); if (!out.includes(x)) out.push(x); }
  return out;
}

// xs = [...]; pos = ___; print(xs[pos])   /   word = "..."; pos = ___; print(word[pos])
MAKE.indexPick = (p, X) => program([], [
  S.decl(p.xs, p.word ? E.str(p.word) : E.list(p.items)), S.decl(p.pos, X, 'int'), S.print(E.index(p.xs, V(p.pos))),
]);
const WORDS = ['planet', 'garden', 'rocket', 'silver', 'window', 'market', 'castle', 'pencil', 'island', 'jungle', 'forest', 'bridge', 'candle', 'orange', 'blanket', 'monkey', 'tunnel', 'dragon'];
function indexPick(rng, lang) {
  const word = rng.next() < 0.45;
  const pos = rng.pick(['pos', 'idx', 'spot', 'slot']);
  let p, ans, out, extra;
  if (word) {
    const w = rng.pick(WORDS), uniq = [...w].map((ch, k) => k).filter(k => w.indexOf(w[k]) === w.lastIndexOf(w[k]));
    ans = rng.pick(uniq); out = w[ans];
    p = { xs: rng.pick(['word', 'text', 'label']), word: w, pos };
    extra = `${tk(`"${w}"`)} has ${w.length} letters at positions 0 to ${w.length - 1}; ${tk(out)} is at position **${ans}**.`;
  } else {
    const items = distinctInts(rng, rng.int(4, 7), 1, 99);
    ans = rng.int(0, items.length - 1); out = items[ans];
    p = { xs: rng.pick(LISTS), items, pos };
    extra = `Counting from 0, ${out} is at position **${ans}**.`;
  }
  const m = { t: 'indexPick', p };
  return numberQ({ m, solution: ans, lo: -10, hi: 30, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(MAKE.indexPick(p, bl()), lang)}`,
    explanation: `Positions (indexes) start at 0, not 1. ${extra}`,
    hints: [
      `Positions (indexes) start at 0: the first ${word ? 'letter' : 'item'} is at position 0, the second at 1, and so on.`,
      word ? `Find ${tk(out)} in ${tk(`"${p.word}"`)} and count how many letters come before it. That count is its position.`
        : `Find ${out} in the list and count how many items come before it. That count is its position.`,
    ] });
}

// def f(xs: list) -> int: return ___
MAKE.listFn = (p, X) => program([S.fn(p.fn, [{ name: p.xs, type: 'list' }], [S.return(X)], 'int')], []);
const LIST_GOALS = [
  { fn: 'first_item', words: 'the first item', at: xs => xs[0] },
  { fn: 'second_item', words: 'the second item', at: xs => xs[1] },
  { fn: 'last_item', words: 'the last item', at: xs => xs[xs.length - 1] },
  { fn: 'next_to_last', words: 'the second-to-last item', at: xs => xs[xs.length - 2] },
  { fn: 'item_count', words: 'how many items there are', at: xs => xs.length },
];
function listFnChoice(rng, lang) {
  const g = rng.int(0, LIST_GOALS.length - 1), goal = LIST_GOALS[g], xs = rng.pick(['xs', 'nums', 'items', 'values']);
  const L = E.len(xs);
  const exprs = [E.index(xs, 0), E.index(xs, 1), E.index(xs, E.bin('-', L, 1)), E.index(xs, E.bin('-', L, 2)), L,
    E.index(xs, L), E.index(xs, 2), E.bin('-', L, 1)];
  const correct = exprs[g];
  const lists = [distinctInts(rng, rng.int(3, 4), 10, 99), distinctInts(rng, rng.int(5, 6), 10, 99)];
  const tests = lists.map(a => ({ entry: goal.fn, args: [a], expect: goal.at(a) }));
  const p = { fn: goal.fn, xs };
  const m = { t: 'listFn', p };
  const prog = MAKE.listFn(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn: goal.fn });
  const show = t => `a list holding ${t.args[0].join(', ')}`;
  return choiceQ({ rng, m, lang, correct, pool: exprs.filter((_, i) => i !== g), spec: { tests }, renderOpt,
    prompt: `${tk(fnName(goal.fn, lang))} should return ${goal.words} of any list ${tk(vn(xs, lang))} (lists have at least 3 items). ` +
      `For example, it returns ${tests[0].expect} for a list holding ${lists[0].join(', ')}, and ${tests[1].expect} for ${lists[1].join(', ')}. Which expression fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `Indexes run from 0 to length − 1 (length is ${tk(renderExpr(E.len(xs), lang, { program: prog, fn: goal.fn }))}). ${tk(renderOpt(opts[ci], lang))} works for every length. ` +
      opts.filter((_, i) => i !== ci).map(o => {
        const pr = buildWith(m, o), bad = tests.find(t => { const r = exec(pr, t); return !r.ok || r.returned !== t.expect; });
        const r = exec(pr, bad);
        return `${tk(renderOpt(o, lang))} ${r.ok ? `gives ${r.returned}` : 'goes past the end'} for ${show(bad)}.`;
      }).join(' '),
    hints: [
      `Indexes run from 0 to length − 1, so the first item is at 0 and the last is at length − 1. In this language the length of a list is written like ${tk(langNotes(lang).len.split(' (')[0].replace('xs', 'list'))}.`,
      `The answer must work for lists of any length, so test each option on both examples: ${lists[0].length} items (${lists[0].join(', ')}) and ${lists[1].length} items (${lists[1].join(', ')}). An option that only fits one length is wrong.`,
    ] });
}

// xs = []; for i in range(1, N+1): <blank append>; for x in xs: print(x)
MAKE.appendLine = (p, st) => program([], [
  S.decl(p.xs, E.list([])),
  S.forRange(p.i, 1, p.N + 1, 1, [{ ...st, id: 'fill' }]),
  S.forEach('x', p.xs, [S.print(V('x'))]),
]);
function appendLine(rng, lang) {
  const xs = rng.pick(LISTS), i = rng.pick(['i', 'k', 'n']), N = rng.int(3, 5), K = rng.int(2, 9);
  const I = V(i);
  const fams = [
    { e: E.bin('*', I, K), f: j => j * K }, { e: E.bin('+', I, K), f: j => j + K }, { e: E.int(K), f: () => K },
    { e: I, f: j => j }, { e: E.bin('*', I, I), f: j => j * j }, { e: E.bin('-', I, 1), f: j => j - 1 },
    { e: E.bin('+', E.bin('*', I, 2), 1), f: j => 2 * j + 1 }, { e: E.bin('*', I, 10), f: j => j * 10 },
  ];
  const g = rng.pick([0, 1, 4, 6, 7]);
  const out = Array.from({ length: N }, (_, j) => String(fams[g].f(j + 1)));
  const mk = e => S.append(xs, e);
  const p = { xs, i, N };
  const m = { t: 'appendLine', p };
  const full = MAKE.appendLine(p, mk(fams[g].e));
  const renderOpt = (o, l) => renderStmtLine(o, l, { program: full });
  const spec = { out };
  return choiceQ({ rng, m, lang, correct: mk(fams[g].e), pool: fams.filter((_, j) => j !== g).map(f => mk(f.e)), spec, renderOpt,
    prompt: `This program should print ${out.join(', ')} (one per line). Which line fills the blank ${tk(BLANK)}?\n\n${codeLineBlank(full, lang, 'fill')}`,
    explain: (opts, ci) => `${tk(vn(i, lang))} takes the values 1 to ${N} (${rangeText(lang)}), and ${tk(renderOpt(opts[ci], lang))} adds ${out.join(', ')}. ` +
      opts.filter((_, j) => j !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, spec, lang)}.`).join(' '),
    hints: [
      `${tk(vn(i, lang))} takes the values 1 to ${N} (${rangeText(lang)}), and each pass adds one number to ${tk(vn(xs, lang))}.`,
      `When ${tk(vn(i, lang))} is 1 the line must add ${out[0]}; when it is 2, ${out[1]}; when it is 3, ${out[2]}. Put those values into each option.`,
    ] });
}

// Two-part: total/count over range(___, len(xs))
MAKE.suffixSum = (p, X) => program([], [
  S.decl(p.xs, E.list(p.items)), S.decl(p.t, 0), S.decl(p.c, 0),
  S.forRange(p.i, X, E.len(p.xs), 1, [S.augAssign(p.t, '+', E.index(p.xs, V(p.i))), S.augAssign(p.c, '+', 1)]),
  S.print(V(p.t)), S.print(V(p.c)),
]);
function suffixSum(rng, lang) {
  const xs = rng.pick(LISTS), t = rng.pick(['total', 'sum_all', 'tally']), c = rng.pick(['count', 'used', 'taken']), i = rng.pick(['i', 'k', 'pos']);
  const items = Array.from({ length: rng.int(5, 7) }, () => rng.int(1, 30));
  const ans = rng.int(1, items.length - 2), used = items.slice(ans);
  const total = used.reduce((a, b) => a + b, 0);
  const p = { xs, t, c, i, items };
  const m = { t: 'suffixSum', p };
  return blankOutputQ({ m, solution: ans, lo: -5, hi: 20, spec: { out: [String(total)] }, outLine: 1, outAnswer: used.length, lang,
    prompt: `The first line this program prints is ${tk(total)}.\n\n${code(MAKE.suffixSum(p, bl()), lang)}`,
    askBlank: `Which whole number fills the blank ${tk(BLANK)}?`,
    askOut: 'What does the second line print?',
    explanation: `Starting at position **${ans}** adds ${used.join(' + ')} = ${total} (positions start at 0, and the loop stops before ${tk(renderExpr(E.len(xs), lang, { program: MAKE.suffixSum(p, bl()) }))}). That is ${used.length} items, so the second line is **${used.length}**.`,
    hintBlank: `The loop adds every item from position ${tk(BLANK)} up to the end of ${tk(vn(xs, lang))} (positions start at 0, and ${rangeText(lang)}). ` +
      `Add the items from the end backwards: ${items[items.length - 1]} + ${items[items.length - 2]} + … until the total is ${total}. The blank is the position of the last item you added.`,
    hintOut: `${tk(vn(c, lang))} goes up by 1 for each item the loop adds. The list has ${items.length} items; count the positions from the blank up to the last one.` });
}

// def count_of(word: str) -> int: count letters, choose the condition
MAKE.countLetter = (p, X) => program([S.fn(p.fn, [{ name: p.w, type: 'str' }], [
  S.decl(p.c, 0),
  S.forRange(p.i, 0, E.len(p.w), 1, [S.if(X, [S.augAssign(p.c, '+', 1)])]),
  S.return(V(p.c)),
], 'int')], []);
const LETTER_WORDS = {
  a: ['banana', 'papaya', 'salad', 'alpaca', 'canal', 'cabbage', 'panama', 'drama', 'lava', 'apart'],
  e: ['freeze', 'between', 'sleeve', 'beetle', 'eleven', 'cheese', 'needle', 'teeth', 'level'],
  o: ['potato', 'tomato', 'cocoa', 'robot', 'motor', 'photo', 'rodeo', 'voodoo', 'hollow'],
  s: ['grass', 'mess', 'stress', 'stars', 'class', 'snakes', 'sense', 'assist'],
};
function countLetter(rng, lang) {
  const ch = rng.pick(Object.keys(LETTER_WORDS)), ws = rng.shuffle(LETTER_WORDS[ch]).slice(0, 2);
  const fn = rng.pick(['count_of', 'letter_count', 'how_many']), w = rng.pick(['word', 'text']), c = rng.pick(['count', 'found', 'hits']), i = rng.pick(['i', 'k', 'pos']);
  const W = w, I = V(i), at = x => E.index(W, x);
  const correct = E.bin('==', at(I), E.str(ch));
  const pool = [E.bin('!=', at(I), E.str(ch)), E.bin('==', at(0), E.str(ch)), E.bin('==', at(E.bin('+', I, 1)), E.str(ch)),
    E.bin('==', at(E.bin('-', E.len(W), 1)), E.str(ch)), E.bin('==', at(I), at(0))];
  const tests = ws.map(x => ({ entry: fn, args: [x], expect: [...x].filter(y => y === ch).length }));
  const p = { fn, w, c, i };
  const m = { t: 'countLetter', p };
  const prog = MAKE.countLetter(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn });
  return choiceQ({ rng, m, lang, correct, pool, spec: { tests }, renderOpt,
    prompt: `${tk(fnName(fn, lang))} should return how many times the letter ${tk(ch)} appears in ${tk(vn(w, lang))}. ` +
      `For example: ${examplesText(prog, fn, tests, lang)}. Which condition fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `The loop visits every position ${tk(vn(i, lang))}, so the check must look at the letter at that position: ${tk(renderOpt(opts[ci], lang))}. ` +
      opts.filter((_, j) => j !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, fn, lang))}.`).join(' '),
    hints: [
      `The loop visits every position ${tk(vn(i, lang))} of ${tk(vn(w, lang))}, from 0 to length − 1. The condition decides whether that pass counts.`,
      `${tk(`"${ws[0]}"`)} has the letter ${tk(ch)} ${tests[0].expect} times. For each option, ask which positions of that word it is true at, and count them.`,
    ] });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Functions
// ═════════════════════════════════════════════════════════════════════════════════════════════

// def f(n): return n OP ___ ; print(f(A))
MAKE.fnConst = (p, X) => program([S.fn(p.fn, [p.par], [S.return(p.fee ? E.bin('+', E.bin('*', V(p.par), X), p.fee) : E.bin(p.op, V(p.par), X))], 'int')],
  [S.print(E.call(p.fn, [p.A]))]);
function fnConst(rng, lang, difficulty) {
  const [fn, par] = rng.pick([['bonus_for', 'n'], ['cost_of', 'items'], ['score_of', 'hits'], ['price_for', 'count'], ['fee_for', 'days'], ['points_for', 'wins']]);
  const med = difficulty !== 'easy';
  const op = rng.pick(['*', '+']), A = rng.int(2, 12), ans = rng.int(2, 15), fee = med ? rng.int(1, 20) : 0;
  const out = med ? A * ans + fee : op === '*' ? A * ans : A + ans;
  const p = { fn, par, op, A, fee };
  const m = { t: 'fnConst', p };
  const prog = MAKE.fnConst(p, bl());
  return numberQ({ m, solution: ans, lo: -60, hi: 200, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(prog, lang)}`,
    explanation: `The call passes ${A} as ${tk(vn(par, lang))}. ${med ? `${A} × ${tk(BLANK)} + ${fee} = ${out}, so ${A} × ${tk(BLANK)} = ${out - fee}` : `${A} ${op === '*' ? '×' : '+'} ${tk(BLANK)} = ${out}`}, and the blank is **${ans}**.`,
    hints: [
      `The program prints ${tk(callText(prog, fn, [A], lang))}, so inside the function ${tk(vn(par, lang))} is ${A}.`,
      med ? `So ${A} × ${tk(BLANK)} + ${fee} = ${out}. Take away the ${fee} first: ${A} × ${tk(BLANK)} must be ${out - fee}. Then divide by ${A}.`
        : op === '*' ? `So ${A} × ${tk(BLANK)} = ${out}. Work out ${out} ÷ ${A}.` : `So ${A} + ${tk(BLANK)} = ${out}. Work out ${out} − ${A}.`,
    ] });
}

// def f(n): total = 0; for i in range(0, n): total += ___; return total; print(f(A))
MAKE.fnLoopConst = (p, X) => program([S.fn(p.fn, [p.par], [
  S.decl(p.t, p.start), S.forRange(p.i, 0, V(p.par), 1, [S.augAssign(p.t, '+', X)]), S.return(V(p.t)),
], 'int')], [S.print(E.call(p.fn, [p.A]))]);
function fnLoopConst(rng, lang) {
  const [fn, par] = rng.pick([['cost_of', 'tickets'], ['pay_for', 'hours'], ['score_of', 'levels'], ['seats_for', 'rows']]);
  const t = rng.pick(['total', 'sum_all', 'amount']), i = rng.pick(['i', 'k']);
  const start = rng.pick([0, 0, rng.int(1, 20)]), A = rng.int(2, 9), ans = rng.int(2, 15), out = start + A * ans;
  const p = { fn, par, t, i, start, A };
  const m = { t: 'fnLoopConst', p };
  return numberQ({ m, solution: ans, lo: -60, hi: 200, spec: { out: [String(out)] }, lang,
    prompt: `Fill in the blank ${tk(BLANK)} with a whole number so that this program prints ${tk(out)}.\n\n${code(MAKE.fnLoopConst(p, bl()), lang)}`,
    explanation: `The loop body runs ${A} times (once for each value from 0 to ${A - 1}). ${start} + ${A} × ${tk(BLANK)} = ${out}, so the blank is **${ans}**.`,
    hints: [
      `The call passes ${A} as ${tk(vn(par, lang))}, so the loop runs ${A} times (${rangeText(lang)}). ${tk(vn(t, lang))} starts at ${start}.`,
      `So ${start} + ${A} × ${tk(BLANK)} = ${out}.${start ? ` Take away the ${start} first: ${A} × ${tk(BLANK)} must be ${out - start}.` : ''} Then divide by ${A}.`,
    ] });
}

// def f(par) -> int: return ___  (one parameter)
MAKE.fnRet = (p, X) => program([S.fn(p.fn, p.params, [S.return(X)], 'int')], []);
function fnReturnChoice(rng, lang) {
  const par = rng.pick(['n', 'x', 'num', 'amount']), P = V(par);
  const fams = [
    { fn: 'twice', words: `twice ${tk(par)}`, e: E.bin('*', P, 2), f: n => n * 2 },
    { fn: 'triple', words: `three times ${tk(par)}`, e: E.bin('*', P, 3), f: n => n * 3 },
    { fn: 'square', words: `${tk(par)} multiplied by itself`, e: E.bin('*', P, P), f: n => n * n },
    { fn: 'half', words: `half of ${tk(par)}, rounded down`, e: E.bin('/', P, 2), f: n => Math.floor(n / 2) },
    { fn: 'next_up', words: `one more than ${tk(par)}`, e: E.bin('+', P, 1), f: n => n + 1 },
    { fn: 'one_less', words: `one less than ${tk(par)}`, e: E.bin('-', P, 1), f: n => n - 1 },
    { fn: 'parity', words: `the remainder when ${tk(par)} is divided by 2`, e: E.bin('%', P, 2), f: n => n % 2 },
  ];
  const extra = [E.bin('+', P, 2), E.bin('+', P, P), E.bin('-', P, 2), E.bin('/', P, 3), E.bin('*', P, 10)];
  const g = rng.int(0, fams.length - 1), goal = fams[g];
  const [a, b] = distinctInts(rng, 2, 3, 15);
  const tests = [a, b].map(n => ({ entry: goal.fn, args: [n], expect: goal.f(n) }));
  const p = { fn: goal.fn, params: [par] };
  const m = { t: 'fnRet', p };
  const prog = MAKE.fnRet(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn: goal.fn });
  const words = goal.words.replace(new RegExp('`' + par + '`', 'g'), tk(vn(par, lang)));
  return choiceQ({ rng, m, lang, correct: goal.e, pool: [...fams.filter((_, i) => i !== g).map(f => f.e), ...extra], spec: { tests }, renderOpt,
    prompt: `${tk(fnName(goal.fn, lang))} should return ${words}. For example: ${examplesText(prog, goal.fn, tests, lang)}. Which expression fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `${tk(renderOpt(opts[ci], lang))} gives ${tests.map(t => t.expect).join(' and ')}.${goal.fn === 'half' || goal.fn === 'parity' ? ' ' + intDivNote(lang) : ''} ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, goal.fn, lang))}.`).join(' '),
    hints: [
      `Put each example into every option: with ${tk(vn(par, lang))} = ${a} the function must return ${tests[0].expect}, and with ${tk(vn(par, lang))} = ${b} it must return ${tests[1].expect}.`,
      `An option has to match both examples, not just one. ${intDivNote(lang)}`,
    ] });
}

// Two parameters
function fn2Choice(rng, lang) {
  const kind = rng.int(0, 3);
  const [fn, a, b, words, f] = [
    ['area_of', 'w', 'h', 'the area of a rectangle that is `w` wide and `h` high', (x, y) => x * y],
    ['perimeter_of', 'w', 'h', 'the distance all the way round a rectangle that is `w` wide and `h` high', (x, y) => 2 * (x + y)],
    ['average_of', 'a', 'b', 'the average of `a` and `b`, rounded down', (x, y) => Math.floor((x + y) / 2)],
    ['change_from', 'paid', 'cost', 'the change from `paid` after spending `cost`, times 2', (x, y) => (x - y) * 2],
  ][kind];
  const A = V(a), B = V(b);
  const all = [E.bin('*', A, B), E.bin('*', 2, E.bin('+', A, B)), E.bin('/', E.bin('+', A, B), 2), E.bin('*', E.bin('-', A, B), 2),
    E.bin('+', E.bin('*', 2, A), B), E.bin('+', A, E.bin('*', B, 2)), E.bin('+', A, E.bin('/', B, 2)), E.bin('+', A, B),
    E.bin('-', A, E.bin('*', B, 2)), E.bin('*', E.bin('*', A, B), 2)];
  const correct = all[kind];
  const pairs = kind === 3 ? [[rng.int(20, 50), rng.int(3, 15)], [rng.int(20, 50), rng.int(3, 15)]] : [distinctInts(rng, 2, 3, 12), distinctInts(rng, 2, 3, 12)];
  const tests = pairs.map(([x, y]) => ({ entry: fn, args: [x, y], expect: f(x, y) }));
  const p = { fn, params: [a, b] };
  const m = { t: 'fnRet', p };
  const prog = MAKE.fnRet(p, bl());
  const renderOpt = (o, l) => renderExpr(o, l, { program: prog, fn });
  const w = words.replace(/`(\w+)`/g, (_, x) => tk(vn(x, lang)));
  return choiceQ({ rng, m, lang, correct, pool: all.filter((_, i) => i !== kind), spec: { tests }, renderOpt,
    prompt: `${tk(fnName(fn, lang))} should return ${w}. For example: ${examplesText(prog, fn, tests, lang)}. Which expression fills the blank ${tk(BLANK)}?\n\n${code(prog, lang)}`,
    explain: (opts, ci) => `${tk(renderOpt(opts[ci], lang))} gives ${tests.map(t => t.expect).join(' and ')}. Remember: brackets first, then ${tk('*')} and ${tk(langNotes(lang).intDiv)}, then ${tk('+')} and ${tk('-')}. ` +
      opts.filter((_, i) => i !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(prog, fn, lang))}.`).join(' '),
    hints: [
      `Say the rule in words first, then look for the option that does the same steps in the same order. Brackets come first, then ${tk('*')} and ${tk(langNotes(lang).intDiv)}, then ${tk('+')} and ${tk('-')}.`,
      `Check each option with the first example: ${tk(vn(a, lang))} = ${pairs[0][0]} and ${tk(vn(b, lang))} = ${pairs[0][1]} must give ${tests[0].expect}. Then confirm with the second example.`,
    ] });
}

// Two-part: def scale(n): return n * K; def score(n): return scale(n) + ___; print(score(A)); print(score(B))
MAKE.fnChain = (p, X) => program([
  S.fn(p.f1, [p.par], [S.return(E.bin('*', V(p.par), p.K))], 'int'),
  S.fn(p.f2, [p.par], [S.return(E.bin(p.op, E.call(p.f1, [V(p.par)]), X))], 'int'),
], [S.print(E.call(p.f2, [p.A])), S.print(E.call(p.f2, [p.B]))]);
function fnChain(rng, lang) {
  const f1 = rng.pick(['scale', 'times_k', 'base_of']), f2 = rng.pick(['score_of', 'total_of', 'points_of', 'price_of']), par = rng.pick(['n', 'x', 'qty']);
  const op = rng.pick(['+', '-']), K = rng.int(2, 6), [A, B] = distinctInts(rng, 2, 2, 12), ans = rng.int(2, 20);
  const t1 = op === '+' ? A * K + ans : A * K - ans, t2 = op === '+' ? B * K + ans : B * K - ans;
  const p = { f1, f2, par, op, K, A, B };
  const m = { t: 'fnChain', p };
  const prog = MAKE.fnChain(p, bl());
  return blankOutputQ({ m, solution: ans, lo: -80, hi: 200, spec: { out: [String(t1)] }, outLine: 1, outAnswer: t2, lang,
    prompt: `The first line this program prints is ${tk(t1)}.\n\n${code(prog, lang)}`,
    askBlank: `Which whole number fills the blank ${tk(BLANK)}?`,
    askOut: 'What does the second line print?',
    explanation: `${tk(callText(prog, f1, [A], lang))} returns ${A * K}, and ${A * K} ${op} **${ans}** = ${t1}. ` +
      `Then ${tk(callText(prog, f2, [B], lang))} is ${B * K} ${op} ${ans} = **${t2}**.`,
    hintBlank: `Follow the first call, ${tk(callText(prog, f2, [A], lang))}: it calls ${tk(callText(prog, f1, [A], lang))}, which returns ${A} × ${K} = ${A * K}. ` +
      `Then ${A * K} ${op === '+' ? '+' : '−'} ${tk(BLANK)} = ${t1}.`,
    hintOut: `The second call is ${tk(callText(prog, f2, [B], lang))}: ${tk(callText(prog, f1, [B], lang))} returns ${B} × ${K} = ${B * K}. Then ${op === '+' ? 'add' : 'subtract'} the same blank value as before.` });
}

// def f(n): total = INIT; for i in range(1, n + 1): ____; return total
MAKE.fnBody = (p, st) => program([S.fn(p.fn, [p.par], [
  S.decl(p.t, p.init), S.forRange(p.i, 1, E.bin('+', V(p.par), 1), 1, [{ ...st, id: 'fill' }]), S.return(V(p.t)),
], 'int')], []);
function fnBodyLine(rng, lang) {
  const par = rng.pick(['n', 'top', 'last']), t = rng.pick(['total', 'result', 'acc']), i = rng.pick(['i', 'k']);
  const T = t, I = V(i);
  const goals = [
    { fn: 'sum_to', init: 0, words: `the sum 1 + 2 + … + ${tk(par)}`, st: S.augAssign(T, '+', I), f: n => n * (n + 1) / 2 },
    { fn: 'product_to', init: 1, words: `the product 1 × 2 × … × ${tk(par)}`, st: S.augAssign(T, '*', I), f: n => { let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; } },
    { fn: 'squares_to', init: 0, words: `the sum of the squares 1×1 + 2×2 + … + ${tk(par)}×${tk(par)}`, st: S.augAssign(T, '+', E.bin('*', I, I)), f: n => n * (n + 1) * (2 * n + 1) / 6 },
    { fn: 'doubles_to', init: 0, words: `the sum 2 + 4 + … + 2×${tk(par)}`, st: S.augAssign(T, '+', E.bin('*', I, 2)), f: n => n * (n + 1) },
  ];
  const g = rng.int(0, goals.length - 1), goal = goals[g];
  const pool = [...goals.filter((_, k) => k !== g).map(x => x.st), S.augAssign(T, '+', 1), S.assign(T, I), S.augAssign(T, '+', V(par)), S.assign(T, E.bin('+', V(T), 1))];
  const [a, b] = distinctInts(rng, 2, 3, 6);
  const tests = [a, b].map(n => ({ entry: goal.fn, args: [n], expect: goal.f(n) }));
  const p = { fn: goal.fn, par, t, i, init: goal.init };
  const m = { t: 'fnBody', p };
  const full = MAKE.fnBody(p, goal.st);
  const renderOpt = (o, l) => renderStmtLine(o, l, { program: full, fn: goal.fn });
  const words = goal.words.replace(new RegExp('`' + par + '`', 'g'), tk(vn(par, lang)));
  return choiceQ({ rng, m, lang, correct: goal.st, pool, spec: { tests }, renderOpt,
    prompt: `${tk(fnName(goal.fn, lang))} should return ${words}. For example: ${examplesText(full, goal.fn, tests, lang)}. Which line fills the blank ${tk(BLANK)}?\n\n${codeLineBlank(full, lang, 'fill')}`,
    explain: (opts, ci) => `${tk(vn(i, lang))} runs from 1 to ${tk(vn(par, lang))} (the end is ${tk(vn(par, lang))} + 1 because ${rangeText(lang)}), and ${tk(vn(t, lang))} starts at ${goal.init}. ${tk(renderOpt(opts[ci], lang))} builds the right result. ` +
      opts.filter((_, k) => k !== ci).map(o => `${tk(renderOpt(o, lang))} ${whyWrong(m, o, { tests }, lang, showCall(full, goal.fn, lang))}.`).join(' '),
    hints: [
      `${tk(vn(i, lang))} runs from 1 to ${tk(vn(par, lang))} (the end is ${tk(vn(par, lang))} + 1 because ${rangeText(lang)}), and ${tk(vn(t, lang))} starts at ${goal.init}.`,
      `Trace ${tk(callText(full, goal.fn, [a], lang))}, which should return ${tests[0].expect}: for each option, write down ${tk(vn(t, lang))} after ${tk(vn(i, lang))} = 1, 2, 3, … and see which one ends on ${tests[0].expect}.`,
    ] });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Dispatch
// ═════════════════════════════════════════════════════════════════════════════════════════════

const CELLS = {
  expressions: {
    easy: [exprBlankEasy, (r, l) => exprOpChoice(r, l, 'easy')],
    medium: [exprPrec, exprDiv, (r, l) => exprOpChoice(r, l, 'medium')],
    hard: [exprMulti, exprCompound],
  },
  conditionals: {
    easy: [condCmpChoice, (r, l) => condThreshold(r, l, 'easy')],
    medium: [condRangeChoice, condDivChoice, (r, l) => condThreshold(r, l, 'medium')],
    hard: [condElif, condHardChoice],
  },
  loops: {
    easy: [loopRange],
    medium: [whileStep, loopMultiples, loopStepEnd],
    hard: [whileLimit, nested],
  },
  'lists-strings': {
    easy: [indexPick],
    medium: [listFnChoice, appendLine],
    hard: [suffixSum, countLetter],
  },
  functions: {
    easy: [(r, l) => fnConst(r, l, 'easy'), fnReturnChoice],
    medium: [(r, l) => fnConst(r, l, 'medium'), fnLoopConst, fn2Choice],
    hard: [fnChain, fnBodyLine],
  },
};

export function generate({ subtopic, difficulty, rng, lang = 'python' }) {
  const cell = CELLS[subtopic];
  if (!cell) throw new Error(`Unknown subtopic: ${subtopic}`);
  if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const makers = cell[difficulty];
  let last;
  // Retries continue the same rng stream, so a seed still means the same question in every language.
  for (let tries = 0; tries < 40; tries++) {
    const make = rng.pick(makers);
    try { return make(rng, lang); } catch (e) { last = e; }
  }
  throw last || new Error('could not generate a question');
}
