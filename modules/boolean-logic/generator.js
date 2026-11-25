// Boolean logic generator. Uses only the seeded rng passed in by the engine.
//
// Expressions are written with every inner binary operation in parentheses, so there is
// never a precedence question. NOT applies only to the variable or bracket right after it.

const GATES2 = ["AND", "OR", "XOR", "NAND", "NOR", "XNOR"];

// Gate truth, the "generate" way: boolean functions.
const GATE_FN = {
  AND: (xs) => xs.every(Boolean),
  OR: (xs) => xs.some(Boolean),
  XOR: (xs) => xs.reduce((a, b) => a !== Boolean(b), false),
  NAND: (xs) => !xs.every(Boolean),
  NOR: (xs) => !xs.some(Boolean),
  XNOR: (xs) => !xs.reduce((a, b) => a !== Boolean(b), false),
  NOT: (xs) => !xs[0],
};
const gate = (name, xs) => (GATE_FN[name](xs) ? 1 : 0);

const GATE_RULE = {
  AND: "AND gives 1 only when every input is 1.",
  OR: "OR gives 1 when at least one input is 1.",
  XOR: "XOR gives 1 when an odd number of inputs are 1 (for two inputs: when they differ).",
  NAND: "NAND is NOT AND: it gives 0 only when every input is 1.",
  NOR: "NOR is NOT OR: it gives 1 only when every input is 0.",
  XNOR: "XNOR is NOT XOR: for two inputs it gives 1 when they are the same.",
  NOT: "NOT flips its single input: 0 becomes 1 and 1 becomes 0.",
};

const VARS = ["A", "B", "C", "D"];
const fmtInputs = (names, vals) => names.map((n, i) => `${n} = ${vals[i]}`).join(", ");
const fmtRow = (names, vals) => names.map((n, i) => `${n}=${vals[i]}`).join(", ");

// All assignments of n inputs, as arrays of 0/1, in counting order.
function allRows(n) {
  const out = [];
  for (let m = 0; m < 2 ** n; m++) {
    const row = [];
    for (let i = n - 1; i >= 0; i--) row.push((m >> i) & 1);
    out.push(row);
  }
  return out;
}

// 4 unique numeric choices (as strings) within [lo, hi]: correct + 3 distractors.
function buildNumChoices(correct, candidates, rng, lo, hi) {
  const seen = new Set([correct]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isInteger(v) || v < lo || v > hi || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k <= hi - lo + 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  if (out.length < 3) return null;
  const answer = String(correct);
  return { answer, choices: rng.shuffle([answer, ...out.map(String)]) };
}

// ---- guided-mode hints (built from values already drawn; never call rng here) ----

// The question each gate's rule boils down to, for "what is the output" hints.
const GATE_ASK = {
  AND: "Are all of them 1?",
  OR: "Is at least one of them 1?",
  XOR: "Is the number of 1s odd?",
  NAND: "Are all of them 1? NAND gives the opposite of AND.",
  NOR: "Is any of them 1? NOR gives the opposite of OR.",
  XNOR: "Are they the same? XNOR gives the opposite of XOR.",
};

function gateHints(name, names, vals) {
  if (name === "NOT") return [GATE_RULE.NOT, `The input is ${fmtInputs(names, vals)}. Flip it.`];
  const ones = vals.filter(Boolean).length;
  return [
    GATE_RULE[name],
    `The inputs are ${fmtInputs(names, vals)}, so ${ones} of the ${names.length} ${ones === 1 ? "is" : "are"} 1. ${GATE_ASK[name]}`,
  ];
}

function whichGateHints(g, rows, choices) {
  const shown = rows.map((r) => fmtRow(["A", "B"], r)).join(" and ");
  const out = gate(g, rows[0]);
  const wrong = choices.find((h) => h !== g && gate(h, rows[0]) !== out) || choices.find((h) => h !== g);
  const r = rows.find((x) => gate(wrong, x) !== gate(g, x)) || rows[0];
  return [
    `Test each option on ${rows.length === 1 ? "the given row" : "both given rows"} (${shown}): what would that gate output?`,
    `Rule out options that disagree. For example, ${wrong} gives ${gate(wrong, r)} for ${fmtRow(["A", "B"], r)}, which does not match, so it is out.`,
    "Check the remaining options the same way: only one of them matches every given row.",
  ];
}

// Evaluate the inner parts step by step, then stop at the outer operation without its result.
function evalHints(tree, names, vals) {
  const env = Object.fromEntries(names.map((n, i) => [n, vals[i]]));
  const steps = [];
  evalSteps(tree, env, steps);
  const inner = steps.slice(0, -1);
  const a = evalTree(tree.l, env);
  const b = evalTree(tree.r, env);
  const hints = [`Substitute ${fmtInputs(names, vals)} and work from the innermost brackets outwards. A NOT applies only to the letter or bracket right after it.`];
  if (inner.length > 2) hints.push(inner.slice(0, inner.length - 1).join("; "), inner[inner.length - 1]);
  else inner.forEach((s) => hints.push(s));
  hints.push(`Finally, the outer ${tree.o}: work out ${a} ${tree.o} ${b}. ${GATE_RULE[tree.o]}`);
  return hints.slice(0, 4);
}

function whichRowHints(tree, names, expr, target, answer, choices) {
  const wrong = choices.find((c) => c !== answer);
  const env = Object.fromEntries(wrong.split(", ").map((kv) => kv.split("=")).map(([k, x]) => [k, Number(x)]));
  return [
    `Try each option: substitute its values into \`${expr}\` and work from the innermost brackets outwards. You want the one that gives ${target}.`,
    `The outer operation is ${tree.o}. ${GATE_RULE[tree.o]} Think about what its two sides must be for a result of ${target}.`,
    `For example, ${wrong} gives ${evalTree(tree, env)}, so that option is out. Check the others the same way.`,
  ];
}

function countHints(tree, names, expr) {
  const total = 2 ** names.length;
  const rows = allRows(names.length).slice(0, 2);
  const first = rows
    .map((r) => `${fmtRow(names, r)} gives ${evalTree(tree, Object.fromEntries(names.map((n, i) => [n, r[i]])))}`)
    .join("; ");
  const outer = tree.t === "op" ? `The outer operation is ${tree.o}. ${GATE_RULE[tree.o]}` : "";
  return [
    `With ${names.length} inputs there are 2^${names.length} = ${total} rows. List them in counting order, starting from all 0s.`,
    ...(outer ? [outer] : []),
    `Evaluate \`${expr}\` for each row and tally the 1s. The first rows: ${first}. Carry on through all ${total} rows.`,
  ];
}

// ---- gates ----

function genGates(difficulty, rng) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);

  // Choice: "which gate gives this output?" Distractors disagree on at least one shown row,
  // so exactly one choice fits.
  if (rng.next() < 0.35) {
    const pool = difficulty === "easy" ? ["AND", "OR"] : GATES2;
    const g = rng.pick(pool);
    const rows = rng.shuffle(allRows(2)).slice(0, difficulty === "hard" ? 2 : 1);
    const fits = (h) => rows.every((r) => gate(h, r) === gate(g, r));
    const others = rng.shuffle(GATES2.filter((h) => h !== g && !fits(h))).slice(0, 3);
    if (others.length < 3) return genGates(difficulty, rng);
    const facts = rows.map((r) => `inputs ${fmtRow(["A", "B"], r)} give ${gate(g, r)}`);
    const prompt =
      rows.length === 1
        ? `A two-input gate gives output ${gate(g, rows[0])} when A = ${rows[0][0]} and B = ${rows[0][1]}. Which of these gates could it be?`
        : `A two-input gate: ${facts.join("; ")}. Which of these gates could it be?`;
    const lines = [
      ...[g, ...others].map((h) => `- ${h}: ${rows.map((r) => `${fmtRow(["A", "B"], r)} → ${gate(h, r)}`).join("; ")}`),
      `Only **${g}** matches. ${GATE_RULE[g]}`,
    ];
    const q = {
      prompt,
      answer: g,
      answerType: "choice",
      choices: rng.shuffle([g, ...others]),
      explanation: `Check each option:\n\n${lines.join("\n\n")}`,
      params: { kind: "which-gate", rows, outputs: rows.map((r) => gate(g, r)) },
    };
    return { ...q, hints: whichGateHints(g, rows, q.choices) };
  }

  let name, n;
  if (difficulty === "easy") {
    name = rng.pick(["AND", "OR", "NOT"]);
    n = name === "NOT" ? 1 : 2;
  } else if (difficulty === "medium") {
    name = rng.pick(["AND", "OR", "NOT", "XOR", "NAND", "NOR"]);
    n = name === "NOT" ? 1 : 2;
  } else {
    name = rng.pick(["AND", "OR", "XOR", "NAND", "NOR"]);
    n = 3;
  }
  const names = VARS.slice(0, n);
  const vals = names.map(() => rng.int(0, 1));
  const out = gate(name, vals);
  const desc = name === "NOT" ? "a NOT gate" : n === 3 ? `a three-input ${name} gate` : `an ${name} gate`.replace(/^an (?=[^AEIOUX])/, "a ");
  const ones = vals.filter(Boolean).length;
  const lines = [GATE_RULE[name]];
  if (n === 3) lines.push(`Here ${ones} of the 3 inputs ${ones === 1 ? "is" : "are"} 1.`);
  lines.push(`So the output is **${out}**.`);
  return {
    prompt: `What is the output of ${desc} with input${names.length === 1 ? "" : "s"} ${fmtInputs(names, vals)}? Answer 0 or 1.`,
    answer: out,
    answerType: "number",
    tolerance: 0,
    choices: undefined,
    explanation: lines.join("\n\n"),
    params: { kind: "gate", gate: name, inputs: vals },
    hints: gateHints(name, names, vals),
  };
}

// ---- expression trees ----

const v = (n) => ({ t: "var", n });
const not = (x) => ({ t: "not", x });
const op = (o, l, r) => ({ t: "op", o, l, r });

function render(node, top = true) {
  if (node.t === "var") return node.n;
  if (node.t === "not") return `NOT ${render(node.x, false)}`;
  const s = `${render(node.l, false)} ${node.o} ${render(node.r, false)}`;
  return top ? s : `(${s})`;
}

function evalTree(node, env) {
  if (node.t === "var") return env[node.n];
  if (node.t === "not") return evalTree(node.x, env) ? 0 : 1;
  return gate(node.o, [evalTree(node.l, env), evalTree(node.r, env)]);
}

// Random tree with `k` binary operators over the given leaf names (in order).
function buildTree(rng, leaves, ops, k) {
  if (k === 0) return v(leaves.shift());
  const left = rng.int(0, k - 1);
  const l = buildTree(rng, leaves, ops, left);
  const r = buildTree(rng, leaves, ops, k - 1 - left);
  return op(rng.pick(ops), l, r);
}

// Put NOT on `count` random non-root nodes that aren't already negated.
function addNots(rng, tree, count) {
  for (let c = 0; c < count; c++) {
    const spots = [];
    (function walk(node, parent, key) {
      if (node.t === "not") return; // never NOT NOT
      if (parent) spots.push({ parent, key });
      if (node.t === "op") {
        walk(node.l, node, "l");
        walk(node.r, node, "r");
      }
    })(tree, null, null);
    if (!spots.length) return tree;
    const { parent, key } = rng.pick(spots);
    parent[key] = not(parent[key]);
  }
  return tree;
}

const SPEC = {
  easy: { vars: 2, ops: ["AND", "OR"], k: 1, nots: [0, 1] },
  medium: { vars: 3, ops: ["AND", "OR", "XOR"], k: 2, nots: [0, 1] },
  hard: { vars: [3, 4], ops: ["AND", "OR", "XOR", "NAND", "NOR"], k: 3, nots: [0, 1] },
};

function randomExpr(difficulty, rng) {
  const s = SPEC[difficulty];
  if (!s) throw new Error(`Unknown difficulty: ${difficulty}`);
  const nv = Array.isArray(s.vars) ? rng.int(s.vars[0], s.vars[1]) : s.vars;
  const names = VARS.slice(0, nv);
  // Every variable appears at least once; extra leaves reuse random variables.
  const leaves = names.slice();
  while (leaves.length < s.k + 1) leaves.push(rng.pick(names));
  const tree = addNots(rng, buildTree(rng, rng.shuffle(leaves), s.ops, s.k), rng.int(s.nots[0], s.nots[1]));
  return { tree, names, expr: render(tree) };
}

// Post-order evaluation steps for the explanation.
function evalSteps(node, env, out) {
  if (node.t === "var") return env[node.n];
  if (node.t === "not") {
    const x = evalSteps(node.x, env, out);
    const r = x ? 0 : 1;
    out.push(`\`${render(node, false)}\` = NOT ${x} = ${r}`);
    return r;
  }
  const a = evalSteps(node.l, env, out);
  const b = evalSteps(node.r, env, out);
  const r = gate(node.o, [a, b]);
  out.push(`\`${render(node, true)}\` = ${a} ${node.o} ${b} = ${r}`);
  return r;
}

function countTrue(tree, names) {
  let c = 0;
  for (const row of allRows(names.length)) {
    const env = Object.fromEntries(names.map((n, i) => [n, row[i]]));
    c += evalTree(tree, env);
  }
  return c;
}

// ---- expressions ----

function genExpressions(difficulty, rng) {
  const { tree, names, expr } = randomExpr(difficulty, rng);

  if (rng.next() < 0.35) {
    // Choice: which input row makes the expression equal to a target value?
    const rows = allRows(names.length).map((r) => ({
      r,
      out: evalTree(tree, Object.fromEntries(names.map((n, i) => [n, r[i]]))),
    }));
    const ones = rows.filter((x) => x.out === 1);
    const zeros = rows.filter((x) => x.out === 0);
    let target = null;
    if (ones.length >= 1 && zeros.length >= 3) target = 1;
    else if (zeros.length >= 1 && ones.length >= 3) target = 0;
    if (target !== null) {
      const good = rng.pick(target === 1 ? ones : zeros);
      const bad = rng.shuffle(target === 1 ? zeros : ones).slice(0, 3);
      const answer = fmtRow(names, good.r);
      const steps = [];
      evalSteps(tree, Object.fromEntries(names.map((n, i) => [n, good.r[i]])), steps);
      const lines = [
        `Try each option. For ${answer}:\n\n${steps.map((s) => `- ${s}`).join("\n")}`,
        `The other options give ${1 - target}: ${bad.map((b) => fmtRow(names, b.r)).join("; ")}.`,
        `So the answer is **${answer}**.`,
      ];
      const q = {
        prompt: `Which input makes \`${expr}\` equal to ${target}?`,
        answer,
        answerType: "choice",
        choices: rng.shuffle([answer, ...bad.map((b) => fmtRow(names, b.r))]),
        explanation: lines.join("\n\n"),
        params: { kind: "which-row", expr, names, target },
      };
      return { ...q, hints: whichRowHints(tree, names, expr, target, answer, q.choices) };
    }
  }

  const vals = names.map(() => rng.int(0, 1));
  const env = Object.fromEntries(names.map((n, i) => [n, vals[i]]));
  const steps = [];
  const out = evalSteps(tree, env, steps);
  return {
    prompt: `Evaluate \`${expr}\` for ${fmtInputs(names, vals)}. Answer 0 or 1.`,
    answer: out,
    answerType: "number",
    tolerance: 0,
    choices: undefined,
    explanation: `Work from the innermost part outwards:\n\n${steps.map((s) => `- ${s}`).join("\n")}\n\nSo the value is **${out}**.`,
    params: { kind: "eval", expr, names, inputs: vals },
    hints: evalHints(tree, names, vals),
  };
}

// ---- truth tables ----

const ROWS_N = { easy: [1, 4], medium: [3, 6], hard: [5, 10] };

function genTruthTables(difficulty, rng) {
  if (!ROWS_N[difficulty]) throw new Error(`Unknown difficulty: ${difficulty}`);
  const asChoice = rng.next() < 0.35;

  if (rng.next() < 0.3) {
    const [lo, hi] = ROWS_N[difficulty];
    const n = rng.int(lo, hi);
    const rows = 2 ** n;
    const prompt = `A truth table lists every combination of ${n} input${n === 1 ? "" : "s"}. How many rows does it have, not counting the header?`;
    const explanation = `Each input can be 0 or 1, so every extra input doubles the number of combinations: 2${n === 1 ? "" : ` × 2`.repeat(n - 1)} = 2^${n} = **${rows}**.`;
    const params = { kind: "rows", n };
    const hints = [
      "Each input can be 0 or 1, so every extra input doubles the number of combinations.",
      `Start from 1 row and double it once for every input${n === 1 ? "" : ` (${n} times in all)`}.`,
    ];
    if (asChoice) {
      const c = buildNumChoices(rows, [2 * n, n * n, rows - 1, rows * 2, rows / 2, n], rng, 1, Infinity);
      if (c) return { prompt, ...c, answerType: "choice", explanation, params, hints };
    }
    return { prompt, answer: rows, answerType: "number", tolerance: 0, choices: undefined, explanation, params, hints };
  }

  let tree, names, expr;
  if (difficulty === "easy" && rng.next() < 0.5) {
    // A single two-input gate.
    const g = rng.pick(GATES2);
    names = ["A", "B"];
    tree = op(g, v("A"), v("B"));
    expr = render(tree);
  } else {
    ({ tree, names, expr } = randomExpr(difficulty, rng));
  }
  const total = 2 ** names.length;
  const count = countTrue(tree, names);

  // Show the full table on easy/medium; summarise the 1-rows on hard (16 rows is long).
  const rowsList = allRows(names.length).map((r) => {
    const out = evalTree(tree, Object.fromEntries(names.map((n, i) => [n, r[i]])));
    return { r, out };
  });
  let table;
  if (names.length <= 3) {
    table = [
      `| ${names.join(" | ")} | out |`,
      `| ${names.map(() => "---").join(" | ")} | --- |`,
      ...rowsList.map(({ r, out }) => `| ${r.join(" | ")} | ${out} |`),
    ].join("\n");
  } else {
    const hits = rowsList.filter((x) => x.out === 1).map((x) => fmtRow(names, x.r));
    table = hits.length ? `Rows that give 1:\n\n${hits.map((h) => `- ${h}`).join("\n")}` : "No row gives 1.";
  }
  const explanation = `There are ${names.length} inputs (${names.join(", ")}), so 2^${names.length} = ${total} rows. Evaluate each one:\n\n${table}\n\nCount the 1s: **${count}**.`;
  const prompt = `In the truth table of \`${expr}\` (inputs ${names.join(", ")}; ${total} rows), how many rows give 1?`;
  const params = { kind: "count-true", expr, names };
  const hints = countHints(tree, names, expr);
  if (asChoice) {
    const c = buildNumChoices(count, [total - count, total, count + 1, count - 1, count * 2], rng, 0, total);
    if (c) return { prompt, ...c, answerType: "choice", explanation, params, hints };
  }
  return { prompt, answer: count, answerType: "number", tolerance: 0, choices: undefined, explanation, params, hints };
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "gates") return genGates(difficulty, rng);
  if (subtopic === "expressions") return genExpressions(difficulty, rng);
  if (subtopic === "truth-tables") return genTruthTables(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---- independent check: parse the expression text and count/evaluate again ----

// Gate truth, the "verify" way: by counting ones.
function gateByCount(name, xs) {
  const ones = xs.filter((x) => x === 1).length;
  const n = xs.length;
  switch (name) {
    case "AND": return ones === n ? 1 : 0;
    case "OR": return ones > 0 ? 1 : 0;
    case "XOR": return ones % 2;
    case "NAND": return ones === n ? 0 : 1;
    case "NOR": return ones === 0 ? 1 : 0;
    case "XNOR": return 1 - (ones % 2);
    case "NOT": return n === 1 ? 1 - ones : NaN;
    default: return NaN;
  }
}

const BIN_OPS = new Set(["AND", "OR", "XOR", "NAND", "NOR", "XNOR"]);

// Recursive-descent parser: expr := unary (OP unary)*, unary := NOT unary | ( expr ) | VAR.
// Returns a function env -> 0/1, or null on a syntax error.
function parseExpr(text) {
  const tokens = String(text).match(/\(|\)|[A-Za-z]+/g);
  if (!tokens || tokens.join("") !== String(text).replace(/\s+/g, "")) return null;
  let i = 0;
  function unary() {
    const t = tokens[i];
    if (t === "NOT") {
      i++;
      const x = unary();
      return x && ((env) => 1 - x(env));
    }
    if (t === "(") {
      i++;
      const e = expr();
      if (!e || tokens[i] !== ")") return null;
      i++;
      return e;
    }
    if (/^[A-D]$/.test(t || "")) {
      i++;
      return (env) => (env[t] === 1 ? 1 : env[t] === 0 ? 0 : NaN);
    }
    return null;
  }
  function expr() {
    let left = unary();
    if (!left) return null;
    while (BIN_OPS.has(tokens[i])) {
      const o = tokens[i++];
      const right = unary();
      if (!right) return null;
      const l = left;
      left = (env) => gateByCount(o, [l(env), right(env)]);
    }
    return left;
  }
  const f = expr();
  return f && i === tokens.length ? f : null;
}

// Count 1-rows by walking assignments from all-ones downwards (a different order than generate).
function countByParse(f, names) {
  let c = 0;
  for (let m = 2 ** names.length - 1; m >= 0; m--) {
    const env = {};
    names.forEach((n, i) => (env[n] = (m >> i) & 1));
    const r = f(env);
    if (r !== 0 && r !== 1) return NaN;
    c += r;
  }
  return c;
}

// Parse "A=1, B=0" into an env over exactly `names`.
function parseRow(s, names) {
  const parts = String(s).split(",").map((x) => x.trim());
  if (parts.length !== names.length) return null;
  const env = {};
  for (let i = 0; i < parts.length; i++) {
    const m = /^([A-D])=([01])$/.exec(parts[i]);
    if (!m || m[1] !== names[i]) return null;
    env[m[1]] = Number(m[2]);
  }
  return env;
}

function isBit(x) {
  return x === 0 || x === 1 || x === "0" || x === "1";
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  const isChoice = question.answerType === "choice";
  if (isChoice) {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (p.kind === "gate") {
    if (!isBit(answer)) return false;
    return Number(answer) === gateByCount(p.gate, p.inputs);
  }

  if (p.kind === "which-gate") {
    // Exactly one choice may agree with every shown row, and it must be the answer.
    const fits = (g) => p.rows.every((r, k) => gateByCount(g, r) === p.outputs[k]);
    const matching = question.choices.filter(fits);
    return matching.length === 1 && matching[0] === String(answer);
  }

  if (p.kind === "rows") {
    let rows = 1;
    for (let k = 0; k < p.n; k++) rows += rows; // doubling, not 2 ** n
    if (isChoice && question.choices.filter((c) => Number(c) === rows).length !== 1) return false;
    return Number(answer) === rows && String(answer).trim() !== "";
  }

  const f = parseExpr(p.expr);
  if (!f || !Array.isArray(p.names)) return false;

  if (p.kind === "eval") {
    if (!isBit(answer)) return false;
    const env = Object.fromEntries(p.names.map((n, i) => [n, p.inputs[i]]));
    return Number(answer) === f(env);
  }

  if (p.kind === "count-true") {
    const c = countByParse(f, p.names);
    if (isChoice && question.choices.filter((x) => Number(x) === c).length !== 1) return false;
    return String(answer).trim() !== "" && Number(answer) === c;
  }

  if (p.kind === "which-row") {
    if (!isChoice) return false;
    const matching = question.choices.filter((c) => {
      const env = parseRow(c, p.names);
      return env && f(env) === p.target;
    });
    // Every choice must parse; exactly one may hit the target.
    if (!question.choices.every((c) => parseRow(c, p.names))) return false;
    return matching.length === 1 && matching[0] === String(answer);
  }

  return false;
}
