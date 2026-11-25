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
  if (difficulty === "expert") return genExpert(subtopic, rng);
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
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, question, answer);
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

// =====================================================================================
// Expert. A separate branch (generate dispatches to it before anything else), so easy/medium/hard
// draws are unchanged. Hints are built from values already drawn (no rng calls). Params kinds
// start with "x-" and are checked by verifyExpert, which re-derives everything with the
// text parser (parseExpr) and counting gates (gateByCount).
// No calculator `given` here: every input is a 0/1 bit, not a quantity.

const bt = (s) => "`" + s + "`";
const unbt = (s) => String(s).replace(/^`|`$/g, "");
const COMPLEMENT = { AND: "NAND", NAND: "AND", OR: "NOR", NOR: "OR", XOR: "XNOR", XNOR: "XOR" };

// Run a list of wires [{ n, g, a, b }] on an env of inputs; returns every wire's value.
function runWires(wires, env) {
  const val = { ...env };
  for (const w of wires) val[w.n] = gate(w.g, [val[w.a], val[w.b]]);
  return val;
}
const wireText = (w) => `${w.n} = ${w.a} ${w.g} ${w.b}`;
const cloneTree = (t) => JSON.parse(JSON.stringify(t));
const envOf = (names, r) => Object.fromEntries(names.map((n, i) => [n, r[i]]));
const tableOf = (tree, names) => allRows(names.length).map((r) => evalTree(tree, envOf(names, r)));

// ---- gates / expert ----

const WIRE_NAMES = ["P", "Q", "R", "S"];

// A circuit built only from NAND (or only NOR) gates that behaves like one ordinary gate.
function xUniversal(rng) {
  for (;;) {
    const g = rng.pick(["NAND", "NOR"]);
    const k = rng.int(3, 4);
    const wires = [];
    const pool = ["A", "B"];
    for (let i = 0; i < k; i++) {
      const n = i === k - 1 ? "OUT" : WIRE_NAMES[i];
      const ab = [rng.pick(pool), rng.pick(pool)].sort();
      wires.push({ n, g, a: ab[0], b: ab[1] });
      pool.push(n);
    }
    const used = new Set(wires.flatMap((w) => [w.a, w.b]));
    if (!["A", "B", ...wires.slice(0, -1).map((w) => w.n)].every((x) => used.has(x))) continue;
    const rows = allRows(2);
    const vals = rows.map((r) => runWires(wires, { A: r[0], B: r[1] }));
    const out = vals.map((x) => x.OUT);
    const match = GATES2.find((h) => rows.every((r, i) => gate(h, r) === out[i]));
    if (!match) continue;
    const others = rng.shuffle(GATES2.filter((h) => h !== match && h !== COMPLEMENT[match])).slice(0, 2);
    const choices = rng.shuffle([match, COMPLEMENT[match], ...others]);
    const cols = ["A", "B", ...wires.map((w) => w.n)];
    const table = [
      `| ${cols.join(" | ")} |`,
      `| ${cols.map(() => "---").join(" | ")} |`,
      ...vals.map((x) => `| ${cols.map((c) => x[c]).join(" | ")} |`),
    ].join("\n");
    const notes = wires.filter((w) => w.a === w.b).map((w) => w.n);
    return {
      prompt: `A circuit is built only from **${g}** gates:\n\n${wires.map((w) => `- ${bt(wireText(w))}`).join("\n")}\n\nWhich single two-input gate gives the same output OUT for every combination of A and B?`,
      answer: match,
      answerType: "choice",
      choices,
      explanation: `Work out every wire for the four input rows:\n\n${table}\n\nOUT is ${out.join(", ")} for (A, B) = 00, 01, 10, 11. That is the truth table of **${match}**. ${GATE_RULE[match]}${notes.length ? `\n\n(${notes.join(" and ")} ${notes.length === 1 ? "has" : "have"} both inputs joined, so ${notes.length === 1 ? "it acts" : "they act"} as a NOT gate.)` : ""}`,
      params: { kind: "x-universal", wires },
      hints: [
        `A ${g} gate gives ${g === "NAND" ? "0 only when both inputs are 1" : "1 only when both inputs are 0"}. With both inputs on the same wire it works as a NOT gate.`,
        `Take one input row at a time and work out the wires in order (${wires.map((w) => w.n).join(", ")}). Do all four rows: (A, B) = (0, 0), (0, 1), (1, 0), (1, 1).`,
        "Write down the OUT column and compare it with the truth table of each option.",
      ],
    };
  }
}

// Three-input circuit: when does the output not depend on A, and how many rows give 1?
function xIndependent(rng) {
  const sets = [["A", "B"], ["A", "C"], ["B", "C"]];
  for (;;) {
    const [s1, s2] = rng.shuffle(sets).slice(0, 2);
    const wires = [
      { n: "P", g: rng.pick(GATES2), a: s1[0], b: s1[1] },
      { n: "Q", g: rng.pick(GATES2), a: s2[0], b: s2[1] },
    ];
    wires.push({ n: "OUT", g: rng.pick(GATES2), a: "P", b: "Q" });
    const rows = allRows(3);
    const vals = rows.map((r) => runWires(wires, { A: r[0], B: r[1], C: r[2] }));
    const count = vals.filter((x) => x.OUT === 1).length;
    // Rows k and k + 4 differ only in A.
    const same = [0, 1, 2, 3].filter((k) => vals[k].OUT === vals[k + 4].OUT);
    if (count < 1 || count > 7 || same.length < 1 || same.length > 3) continue;
    const cols = ["A", "B", "C", "P", "Q", "OUT"];
    const table = [
      `| ${cols.join(" | ")} |`,
      `| ${cols.map(() => "---").join(" | ")} |`,
      ...vals.map((x) => `| ${cols.map((c) => x[c]).join(" | ")} |`),
    ].join("\n");
    const pairs = [0, 1, 2, 3].map((k) => `- B = ${rows[k][1]}, C = ${rows[k][2]}: OUT is ${vals[k].OUT} with A = 0 and ${vals[k + 4].OUT} with A = 1${same.includes(k) ? " (the same)" : ""}`);
    return {
      prompt: `A circuit has inputs A, B and C:\n\n${wires.map((w) => `- ${bt(wireText(w))}`).join("\n")}`,
      answerType: "multi",
      parts: [
        { id: "indep", label: "A doesn't matter", ask: "For how many of the 4 combinations of B and C is OUT the same whether A is 0 or 1?", answerType: "number", answer: same.length, tolerance: 0,
          hint: "For each (B, C) pair, compare the OUT you get with A = 0 against the OUT with A = 1." },
        { id: "count", label: "Rows giving 1", ask: "How many of the 8 input rows make OUT = 1?", answerType: "number", answer: count, tolerance: 0,
          hint: "Count the 1s in the OUT column of your 8-row table." },
      ],
      explanation: `Work out P, Q and OUT for all 8 rows:\n\n${table}\n\nCompare rows that differ only in A:\n\n${pairs.join("\n")}\n\nSo OUT ignores A for **${same.length}** of the 4 (B, C) pairs, and **${count}** rows give OUT = 1.`,
      params: { kind: "x-indep", wires },
      hints: [
        "Make a table of all 8 rows (A, B, C from 000 to 111) with columns P, Q and OUT.",
        `Work out P and Q first, then OUT = P ${wires[2].g} Q. ${GATE_RULE[wires[2].g]}`,
        "Rows that differ only in A sit 4 apart in counting order (000 and 100, 001 and 101, …). Compare their OUT values.",
      ],
    };
  }
}

// ---- expressions / expert ----

function catalog2() {
  const out = [v("A"), v("B"), not(v("A")), not(v("B"))];
  for (const o of ["AND", "OR"]) for (const x of [v("A"), not(v("A"))]) for (const y of [v("B"), not(v("B"))]) out.push(op(o, x, y));
  out.push(op("XOR", v("A"), v("B")), op("XNOR", v("A"), v("B")));
  return out;
}
const hamming = (a, b) => a.reduce((s, x, i) => s + (x !== b[i] ? 1 : 0), 0);

// Simplify a two-input expression: pick the short equivalent.
function xSimplify(rng) {
  const names = ["A", "B"];
  const cat = catalog2().map((t) => ({ t, s: render(t), tab: tableOf(t, names) }));
  for (;;) {
    const leaves = rng.shuffle(["A", "B", rng.pick(names), rng.pick(names)]);
    let tree = addNots(rng, buildTree(rng, leaves, ["AND", "OR", "XOR", "NAND", "NOR"], 3), rng.int(1, 2));
    if (rng.next() < 0.35) tree = not(tree);
    const tab = tableOf(tree, names);
    const ones = tab.filter(Boolean).length;
    if (ones === 0 || ones === 4) continue;
    const expr = render(tree);
    const ans = cat.find((c) => hamming(c.tab, tab) === 0);
    if (!ans || expr.length < 18) continue;
    const near = rng.shuffle(cat.filter((c) => hamming(c.tab, tab) === 1));
    const far = rng.shuffle(cat.filter((c) => hamming(c.tab, tab) > 1));
    const wrong = [...near.slice(0, 2), ...far].slice(0, 3);
    const answer = bt(ans.s);
    const rows = allRows(2);
    const table = [
      `| A | B | ${bt(expr)} | ${answer} |`,
      "| --- | --- | --- | --- |",
      ...rows.map((r, i) => `| ${r[0]} | ${r[1]} | ${tab[i]} | ${ans.tab[i]} |`),
    ].join("\n");
    return {
      prompt: `Which simpler expression gives the same output as \`${expr}\` for every combination of A and B?`,
      answer,
      answerType: "choice",
      choices: rng.shuffle([answer, ...wrong.map((c) => bt(c.s))]),
      explanation: `Work out the expression for all four rows and compare:\n\n${table}\n\nThe columns match in every row, so the answer is **${ans.s}**. The other options differ in at least one row: ${wrong.map((c) => `${bt(c.s)} gives ${c.tab.join("")}`).join(", ")} instead of ${tab.join("")}.`,
      params: { kind: "x-simplify", expr },
      hints: [
        "Two expressions are equivalent when they give the same output in every row. With two inputs there are only four rows: 00, 01, 10, 11.",
        "Useful rules: NOT (X AND Y) = NOT X OR NOT Y, NOT (X OR Y) = NOT X AND NOT Y, X NAND Y = NOT (X AND Y), X NOR Y = NOT (X OR Y).",
        `Work out \`${expr}\` for all four rows, writing the inner brackets first. Then do the same for each option.`,
      ],
    };
  }
}

function smallTree(rng, names) {
  const r = rng.next();
  if (r < 0.3) return v(rng.pick(names));
  if (r < 0.45) return not(v(rng.pick(names)));
  const [x, y] = rng.shuffle(names).slice(0, 2);
  const l = rng.next() < 0.3 ? not(v(x)) : v(x);
  return op(rng.pick(["AND", "OR"]), l, v(y));
}
const negate = (t) => (t.t === "not" ? t.x : not(t));
const varsIn = (t, acc = new Set()) => {
  if (t.t === "var") acc.add(t.n);
  else if (t.t === "not") varsIn(t.x, acc);
  else { varsIn(t.l, acc); varsIn(t.r, acc); }
  return acc;
};

// Is a De Morgan rewrite right? Yes/No plus how many of the 8 rows differ.
function xDeMorgan(rng) {
  const names = ["A", "B", "C"];
  const FLIPOP = { AND: "OR", OR: "AND" };
  for (;;) {
    const X = smallTree(rng, names);
    const Y = smallTree(rng, names);
    if (render(X) === render(Y)) continue;
    const o = rng.pick(["AND", "OR"]);
    const e1 = not(op(o, X, Y));
    if (varsIn(e1).size < 3) continue;
    const variant = rng.pick(["ok", "ok", "keepop", "oneside", "otherside"]);
    const correct = op(FLIPOP[o], negate(X), negate(Y));
    const e2 = variant === "ok" ? correct
      : variant === "keepop" ? op(o, negate(X), negate(Y))
        : variant === "oneside" ? op(FLIPOP[o], negate(X), Y)
          : op(FLIPOP[o], X, negate(Y));
    const t1 = tableOf(e1, names);
    const t2 = tableOf(e2, names);
    const diff = hamming(t1, t2);
    if ((variant === "ok") !== (diff === 0)) continue;
    const s1 = render(e1);
    const s2 = render(e2);
    if (s1 === s2) continue;
    const rows = allRows(3);
    const bad = rows.filter((_, i) => t1[i] !== t2[i]).map((r) => r.join(""));
    return {
      prompt: `Someone uses De Morgan's law to rewrite\n\n\`${s1}\`\n\nas\n\n\`${s2}\`\n\n(inputs A, B, C).`,
      answerType: "multi",
      parts: [
        { id: "same", label: "Equivalent?", ask: "Is the rewrite equivalent (same output for all 8 input rows)?", answerType: "choice", answer: diff === 0 ? "Yes" : "No", choices: ["Yes", "No"],
          hint: `Apply De Morgan yourself: the NOT goes onto both sides and ${o} becomes ${FLIPOP[o]}. A double NOT cancels.` },
        { id: "diff", label: "Rows that differ", ask: "In how many of the 8 input rows do the two expressions give different outputs? (0 if none)", answerType: "number", answer: diff, tolerance: 0,
          hint: "Work out both expressions for all 8 rows (000 to 111) and count the rows where they disagree." },
      ],
      explanation: `De Morgan: \`NOT (X ${o} Y)\` = \`NOT X ${FLIPOP[o]} NOT Y\`, and NOT NOT X = X. So the correct rewrite is \`${render(correct)}\`.\n\n${diff === 0 ? `The rewrite matches it, so it is equivalent: **Yes**, and **0** rows differ.` : `The rewrite ${variant === "keepop" ? `kept ${o} instead of switching to ${FLIPOP[o]}` : "left one side without its NOT"}, so it is **No**. Checking all 8 rows, the outputs differ in **${diff}** row${diff === 1 ? "" : "s"}: ABC = ${bad.join(", ")}.`}`,
      params: { kind: "x-demorgan", e1: s1, e2: s2 },
      hints: [
        "De Morgan's laws: NOT (X AND Y) = NOT X OR NOT Y, and NOT (X OR Y) = NOT X AND NOT Y. Both sides get a NOT and the operator flips.",
        `Here X is \`${render(X)}\` and Y is \`${render(Y)}\`. Write the correct rewrite and compare it with the one given, side by side.`,
        "To count differences, a quick table of all 8 rows for both expressions is the safest way.",
      ],
    };
  }
}

// ---- truth tables / expert ----

function mutateTree(tree, names) {
  const out = [];
  const paths = [];
  (function walk(node, path) {
    paths.push({ node, path });
    if (node.t === "not") walk(node.x, [...path, "x"]);
    if (node.t === "op") { walk(node.l, [...path, "l"]); walk(node.r, [...path, "r"]); }
  })(tree, []);
  const at = (t, path) => path.reduce((n, k) => n[k], t);
  const setAt = (t, path, val) => {
    if (!path.length) return val;
    const parent = at(t, path.slice(0, -1));
    parent[path[path.length - 1]] = val;
    return t;
  };
  for (const { node, path } of paths) {
    if (node.t === "op") {
      for (const o of ["AND", "OR", "XOR", "NAND", "NOR"]) if (o !== node.o) { const c = cloneTree(tree); at(c, path).o = o; out.push(c); }
    }
    if (node.t === "var") {
      for (const n of names) if (n !== node.n) { const c = cloneTree(tree); at(c, path).n = n; out.push(c); }
    }
    if (path.length) {
      const c = cloneTree(tree);
      const here = at(c, path);
      out.push(setAt(c, path, here.t === "not" ? here.x : not(here)));
    }
  }
  return out;
}

// Truth table given: which expression produces it?
function xWhichExpr(rng) {
  const names = ["A", "B", "C"];
  for (;;) {
    const leaves = rng.shuffle(["A", "B", "C"]);
    const tree = addNots(rng, buildTree(rng, leaves, ["AND", "OR", "XOR", "NAND", "NOR"], 2), rng.int(0, 1));
    const tab = tableOf(tree, names);
    const ones = tab.filter(Boolean).length;
    if (ones === 0 || ones === 8) continue;
    const expr = render(tree);
    const seen = new Set([expr]);
    const seenTab = new Set([tab.join("")]);
    const wrong = [];
    for (const m of rng.shuffle(mutateTree(tree, names))) {
      const s = render(m);
      const mt = tableOf(m, names).join("");
      if (seen.has(s) || seenTab.has(mt)) continue;
      seen.add(s);
      seenTab.add(mt);
      wrong.push({ s, mt });
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) continue;
    const rows = allRows(3);
    const table = ["| A | B | C | out |", "| --- | --- | --- | --- |", ...rows.map((r, i) => `| ${r.join(" | ")} | ${tab[i]} |`)].join("\n");
    const hit = rows.find((_, i) => tab[i] === 1);
    return {
      prompt: `This truth table belongs to one of the expressions below. Which one?\n\n${table}`,
      answer: bt(expr),
      answerType: "choice",
      choices: rng.shuffle([bt(expr), ...wrong.map((w) => bt(w.s))]),
      explanation: `Work out each option for all 8 rows and compare with the out column (${tab.join("")}, read from row 000 down to 111):\n\n- ${bt(expr)} gives ${tab.join("")}: a match.\n${wrong.map((w) => `- ${bt(w.s)} gives ${w.mt}`).join("\n")}\n\nSo the answer is **${expr}**.`,
      params: { kind: "x-whichexpr", outputs: tab },
      hints: [
        "You don't have to build every column fully: one row where an option gives the wrong output rules it out.",
        `Start with rows that are easy to test, such as ABC = 000 and 111. The table gives ${tab[0]} and ${tab[7]} there.`,
        `Then check a row with output 1, for example ABC = ${hit.join("")}. Keep the option that matches every row.`,
      ],
    };
  }
}

// Word specs: `rule` is used by generation, `check` (a counting form) only by verify.
const SPECS = [
  { text: (p, q, r) => `at least two of ${p}, ${q} and ${r} are on`,
    rule: (p, q, r) => (p && q) || (p && r) || (q && r), check: (p, q, r) => p + q + r >= 2,
    right: (p, q, r) => `((${p} AND ${q}) OR (${p} AND ${r})) OR (${q} AND ${r})`,
    wrong: (p, q, r) => [`(${p} AND ${q}) AND ${r}`, `(${p} OR ${q}) OR ${r}`, `(${p} XOR ${q}) XOR ${r}`] },
  { text: (p, q, r) => `exactly one of ${p}, ${q} and ${r} is on`,
    rule: (p, q, r) => (p && !q && !r) || (!p && q && !r) || (!p && !q && r), check: (p, q, r) => p + q + r === 1,
    right: (p, q, r) => `((${p} XOR ${q}) XOR ${r}) AND NOT ((${p} AND ${q}) AND ${r})`,
    wrong: (p, q, r) => [`(${p} XOR ${q}) XOR ${r}`, `(${p} OR ${q}) OR ${r}`, `(${p} XOR ${q}) AND NOT ${r}`] },
  { text: (p, q, r) => `${p} is on and at least one of ${q} and ${r} is on`,
    rule: (p, q, r) => p && (q || r), check: (p, q, r) => p === 1 && q + r >= 1,
    right: (p, q, r) => `${p} AND (${q} OR ${r})`,
    wrong: (p, q, r) => [`(${p} AND ${q}) OR ${r}`, `${p} OR (${q} AND ${r})`, `${p} AND (${q} AND ${r})`] },
  { text: (p, q, r) => `${p} and ${q} are different and ${r} is off`,
    rule: (p, q, r) => p !== q && !r, check: (p, q, r) => p + q === 1 && r === 0,
    right: (p, q, r) => `(${p} XOR ${q}) AND NOT ${r}`,
    wrong: (p, q, r) => [`(${p} XNOR ${q}) AND NOT ${r}`, `(${p} XOR ${q}) OR NOT ${r}`, `(${p} XOR ${q}) AND ${r}`] },
  { text: (p, q, r) => `${p}, ${q} and ${r} are all the same (all on or all off)`,
    rule: (p, q, r) => p === q && q === r, check: (p, q, r) => p + q + r === 0 || p + q + r === 3,
    right: (p, q, r) => `(${p} XNOR ${q}) AND (${q} XNOR ${r})`,
    wrong: (p, q, r) => [`(${p} AND ${q}) AND ${r}`, `(${p} XNOR ${q}) OR (${q} XNOR ${r})`, `NOT ((${p} OR ${q}) OR ${r})`] },
  { text: (p, q, r) => `${p} is on, unless ${q} and ${r} are both on`,
    rule: (p, q, r) => p && !(q && r), check: (p, q, r) => p === 1 && q + r < 2,
    right: (p, q, r) => `${p} AND (${q} NAND ${r})`,
    wrong: (p, q, r) => [`${p} AND (${q} NOR ${r})`, `${p} OR (${q} NAND ${r})`, `${p} AND (${q} AND ${r})`] },
  { text: (p, q, r) => `at least one of ${p} and ${q} is on and ${r} is off`,
    rule: (p, q, r) => (p || q) && !r, check: (p, q, r) => p + q >= 1 && r === 0,
    right: (p, q, r) => `(${p} OR ${q}) AND NOT ${r}`,
    wrong: (p, q, r) => [`(${p} OR ${q}) OR NOT ${r}`, `(${p} AND ${q}) AND NOT ${r}`, `(${p} OR ${q}) AND ${r}`] },
  { text: (p, q, r) => `an odd number of ${p}, ${q} and ${r} are on`,
    rule: (p, q, r) => (p !== q) !== r, check: (p, q, r) => (p + q + r) % 2 === 1,
    right: (p, q, r) => `(${p} XOR ${q}) XOR ${r}`,
    wrong: (p, q, r) => [`(${p} OR ${q}) OR ${r}`, `(${p} XOR ${q}) OR ${r}`, `((${p} AND ${q}) OR (${p} AND ${r})) OR (${q} AND ${r})`] },
  { text: (p, q, r) => `${q} is on and ${p} matches ${r}`,
    rule: (p, q, r) => q && p === r, check: (p, q, r) => q === 1 && (p - r) === 0,
    right: (p, q, r) => `${q} AND (${p} XNOR ${r})`,
    wrong: (p, q, r) => [`${q} AND (${p} XOR ${r})`, `${q} OR (${p} XNOR ${r})`, `(${q} AND ${p}) AND ${r}`] },
];
const DEVICES = [
  ["A greenhouse fan", "runs", "sensors"],
  ["An alarm", "sounds", "door switches"],
  ["A warning light", "turns on", "inputs"],
  ["A pump", "starts", "float switches"],
  ["A door lock", "opens", "keypads"],
];

function xSpec(rng) {
  const si = rng.int(0, SPECS.length - 1);
  const spec = SPECS[si];
  const roles = rng.shuffle(["A", "B", "C"]);
  const [dev, verb, what] = rng.pick(DEVICES);
  const rows = allRows(3);
  // Generation side: the boolean rule, with roles mapped onto A, B, C.
  const outs = rows.map((r) => {
    const env = { A: r[0] === 1, B: r[1] === 1, C: r[2] === 1 };
    return spec.rule(env[roles[0]], env[roles[1]], env[roles[2]]) ? 1 : 0;
  });
  const count = outs.filter(Boolean).length;
  const answer = bt(spec.right(...roles));
  const choices = rng.shuffle([answer, ...spec.wrong(...roles).map(bt)]);
  const onRows = rows.filter((_, i) => outs[i]).map((r) => r.join(""));
  return {
    prompt: `${dev} has three ${what}, A, B and C (1 = on). It ${verb} (output 1) exactly when ${spec.text(...roles)}.`,
    answerType: "multi",
    parts: [
      { id: "count", label: "Rows giving 1", ask: "In the 8-row truth table, how many rows have output 1?", answerType: "number", answer: count, tolerance: 0,
        hint: "Go through ABC = 000, 001, …, 111 and tick each row where the rule is met." },
      { id: "expr", label: "Expression", ask: "Which expression gives exactly this behaviour?", answerType: "choice", answer, choices,
        hint: "Test each option on your ticked rows and on a few unticked ones. A single wrong row rules an option out." },
    ],
    explanation: `Check the rule for all 8 rows. It holds for ABC = ${onRows.join(", ")}, so **${count}** rows give 1.\n\nThe expression must give 1 on exactly those rows: **${unbt(answer)}**. Each other option gets at least one row wrong.`,
    params: { kind: "x-spec", si, roles },
    hints: [
      "Turn the sentence into a truth table first: 8 rows, ABC from 000 to 111.",
      `Read the rule carefully: "${spec.text(...roles)}". Words like "at least", "exactly" and "unless" change which rows count.`,
      "Then test the expressions against your table rather than trying to read them in words.",
    ],
  };
}

function genExpert(subtopic, rng) {
  if (subtopic === "gates") return rng.next() < 0.5 ? xUniversal(rng) : xIndependent(rng);
  if (subtopic === "expressions") return rng.next() < 0.5 ? xSimplify(rng) : xDeMorgan(rng);
  if (subtopic === "truth-tables") return rng.next() < 0.5 ? xWhichExpr(rng) : xSpec(rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---- expert verification ----

// Evaluate wires with counting gates.
function vWires(wires, env) {
  const val = { ...env };
  for (const w of wires) {
    if (!(w.a in val) || !(w.b in val)) return null;
    val[w.n] = gateByCount(w.g, [val[w.a], val[w.b]]);
  }
  return val.OUT;
}
// Table of a parsed expression over names, rows from all-ones downwards, returned in counting order.
function vTable(f, names) {
  const out = [];
  for (let m = 2 ** names.length - 1; m >= 0; m--) {
    const env = {};
    names.forEach((n, i) => (env[n] = (m >> (names.length - 1 - i)) & 1));
    out[m] = f(env);
  }
  return out;
}
const sameTab = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const fourOk = (ch, answer) => Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && ch.includes(String(answer));
const num01 = (x) => (x === "" || x === null || x === undefined ? NaN : Number(x));

function verifyExpert(p, question, answer) {
  if (p.kind === "x-universal") {
    if (!fourOk(question.choices, answer)) return false;
    const outs = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => vWires(p.wires, { A: a, B: b }));
    const ok = question.choices.filter((g) => [[0, 0], [0, 1], [1, 0], [1, 1]].every((r, i) => gateByCount(g, r) === outs[i]));
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "x-indep") {
    const a = answer && typeof answer === "object" ? answer : {};
    let same = 0, count = 0;
    for (let b = 0; b <= 1; b++) for (let c = 0; c <= 1; c++) {
      const o0 = vWires(p.wires, { A: 0, B: b, C: c });
      const o1 = vWires(p.wires, { A: 1, B: b, C: c });
      if (o0 === null || o1 === null) return false;
      if (o0 === o1) same++;
      count += o0 + o1;
    }
    return num01(a.indep) === same && num01(a.count) === count;
  }
  if (p.kind === "x-simplify") {
    if (!fourOk(question.choices, answer)) return false;
    const f = parseExpr(p.expr);
    if (!f) return false;
    const want = vTable(f, ["A", "B"]);
    const ok = question.choices.filter((c) => {
      const g = parseExpr(unbt(c));
      return g && sameTab(vTable(g, ["A", "B"]), want);
    });
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "x-demorgan") {
    const a = answer && typeof answer === "object" ? answer : {};
    const f = parseExpr(p.e1);
    const g = parseExpr(p.e2);
    if (!f || !g) return false;
    const t1 = vTable(f, ["A", "B", "C"]);
    const t2 = vTable(g, ["A", "B", "C"]);
    let diff = 0;
    for (let i = 0; i < 8; i++) if (t1[i] !== t2[i]) diff++;
    return String(a.same) === (diff === 0 ? "Yes" : "No") && num01(a.diff) === diff;
  }
  if (p.kind === "x-whichexpr") {
    if (!fourOk(question.choices, answer) || !Array.isArray(p.outputs) || p.outputs.length !== 8) return false;
    const ok = question.choices.filter((c) => {
      const g = parseExpr(unbt(c));
      return g && sameTab(vTable(g, ["A", "B", "C"]), p.outputs);
    });
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "x-spec") {
    const a = answer && typeof answer === "object" ? answer : {};
    const spec = SPECS[p.si];
    if (!spec || !Array.isArray(p.roles)) return false;
    const want = [];
    for (let m = 0; m < 8; m++) {
      const env = { A: (m >> 2) & 1, B: (m >> 1) & 1, C: m & 1 };
      want.push(spec.check(env[p.roles[0]], env[p.roles[1]], env[p.roles[2]]) ? 1 : 0);
    }
    const part = (question.parts || []).find((x) => x.id === "expr");
    if (!part || !fourOk(part.choices, a.expr)) return false;
    const ok = part.choices.filter((c) => {
      const g = parseExpr(unbt(c));
      return g && sameTab(vTable(g, ["A", "B", "C"]), want);
    });
    return ok.length === 1 && ok[0] === String(a.expr) && num01(a.count) === want.reduce((s, x) => s + x, 0);
  }
  return false;
}
