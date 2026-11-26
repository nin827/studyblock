// Philosopher role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario of reasoning, decided by brute force and never by opinion:
// argument forms are classified by pattern and tested by truth-table enumeration, compound statements are
// counted row by row, payoff tables are worked by expected value, maximin and regret, and ranked ballots
// are recounted voter by voter. All statements, options and candidates are made up. Hints and
// explanations use only values already drawn (no rng calls), and verify() recomputes every part by a
// different route than generate() (bit-vector truth tables, unification of patterns, integer numerators
// for expected value, ballots expanded into individual voters).
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 3 / 4 parts):
//   argument-forms  medium: name the form, valid?; hard: + premise-true rows; expert: three-statement chain,
//                   rows true for premises and conclusion, valid?; expert-plus: four letters, named form,
//                   valid?, premise rows, counter-example rows
//   truth-tables    medium: true rows, tautology/contradiction/contingent; hard: + equivalent?;
//                   expert: rows of A and B, does A entail B?; expert-plus: four letters, rows, both, differ, entails
//   decision-theory medium: EV, best by EV; hard: + maximin; expert: four options, EV, best, maximin;
//                   expert-plus: four states, VPI, best by EV, minimax-regret option, max regret
//   ballots         medium: pairwise tally, Condorcet winner or None; hard: + Borda winner;
//                   expert: Borda points, plurality winner, Condorcet; expert-plus: four candidates,
//                   tally, Condorcet, Borda, instant runoff

// ---------- helpers ----------

const TIER_PARTS = { medium: 2, hard: 3, expert: 3, "expert-plus": 4 };
const TRY = 60000;
const tooMany = () => { throw new Error("role-philosopher: no suitable draw"); };
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const sum = (a) => a.reduce((s, x) => s + x, 0);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const orList = (a) => a.join(", ").replace(/, ([^,]*)$/, " and $1");

function numPart(id, label, ask, val, dp, hint) {
  const answer = dp === 0 ? Math.round(val) : Math.round(val * 10) / 10;
  return { id, label, ask: dp === 0 ? `${ask} (whole number)` : `${ask} (to 1 decimal place)`, answerType: "number", answer, tolerance: dp === 0 ? 0 : 0.05, fuzzyNumber: 0, hint };
}
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask: `${ask} (choose one)`, answerType: "choice", answer, choices, hint });
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask: `${ask} (Yes or No)`, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
const validPart = (id, label, ask, ok, hint) => ({ id, label, ask: `${ask} (choose one)`, answerType: "choice", answer: ok ? "Valid" : "Invalid", choices: ["Valid", "Invalid"], hint });
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const q = { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, hints };
  if (given && given.length) q.given = givenRows(given);
  return q;
}

// ---------- propositional logic: generation route (recursive evaluation per row) ----------
// A statement is an atom ("P") or ["not", x] / ["and"|"or"|"imp"|"iff", x, y]. Plain nested arrays, so
// they sit in params as JSON.

const isAtom = (a) => typeof a === "string";
function evalRow(a, env) {
  if (isAtom(a)) return env[a];
  switch (a[0]) {
    case "not": return !evalRow(a[1], env);
    case "and": return evalRow(a[1], env) && evalRow(a[2], env);
    case "or": return evalRow(a[1], env) || evalRow(a[2], env);
    case "imp": return !evalRow(a[1], env) || evalRow(a[2], env);
    case "iff": return evalRow(a[1], env) === evalRow(a[2], env);
    default: throw new Error("bad statement");
  }
}
const envOf = (vars, r) => Object.fromEntries(vars.map((v, i) => [v, !!((r >> i) & 1)]));
const nRows = (vars) => 1 << vars.length;
function countRows(vars, pred) { let c = 0; for (let r = 0; r < nRows(vars); r++) if (pred(envOf(vars, r))) c++; return c; }
const atomsOf = (a, set = new Set()) => { if (isAtom(a)) set.add(a); else a.slice(1).forEach((x) => atomsOf(x, set)); return set; };
const nodesOf = (a) => (isAtom(a) ? 1 : 1 + sum(a.slice(1).map(nodesOf)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Symbols for display. Binary parts are always bracketed except the whole statement.
function sym(a, top = true) {
  if (isAtom(a)) return a;
  if (a[0] === "not") return `¬${sym(a[1], false)}`;
  const o = { and: "∧", or: "∨", imp: "→", iff: "↔" }[a[0]];
  const s = `${sym(a[1], false)} ${o} ${sym(a[2], false)}`;
  return top ? s : `(${s})`;
}
// Words for display (argument forms use atoms and negated atoms inside).
function words(a) {
  if (isAtom(a)) return a;
  if (a[0] === "not") return `not ${words(a[1])}`;
  if (a[0] === "imp") return `if ${words(a[1])}, then ${words(a[2])}`;
  return `${words(a[1])} ${a[0] === "and" ? "and" : "or"} ${words(a[2])}`;
}
const sentence = (a) => `${cap(words(a))}.`;
const assignText = (vars, env) => vars.map((v) => `${v} ${env[v] ? "true" : "false"}`).join(", ");
const TF_RULES = "Rules for this exercise: ¬ means not, ∧ means and, ∨ means or (one or both), → means if…then (it is false only when the first part is true and the second is false), and ↔ is true when both sides have the same value.";

// ---------- argument forms ----------

const FORMS = {
  "modus ponens": { valid: true, prem: [["imp", "a", "b"], "a"], concl: "b" },
  "modus tollens": { valid: true, prem: [["imp", "a", "b"], ["not", "b"]], concl: ["not", "a"] },
  "disjunctive syllogism": { valid: true, prem: [["or", "a", "b"], ["not", "a"]], concl: "b" },
  "hypothetical syllogism": { valid: true, prem: [["imp", "a", "b"], ["imp", "b", "c"]], concl: ["imp", "a", "c"] },
  "affirming the consequent": { valid: false, prem: [["imp", "a", "b"], "b"], concl: "a" },
  "denying the antecedent": { valid: false, prem: [["imp", "a", "b"], ["not", "a"]], concl: ["not", "b"] },
  "affirming a disjunct": { valid: false, prem: [["or", "a", "b"], "a"], concl: ["not", "b"] },
  "reversed chain": { valid: false, prem: [["imp", "a", "b"], ["imp", "b", "c"]], concl: ["imp", "c", "a"] },
  "constructive dilemma": { valid: true, prem: [["or", "a", "c"], ["imp", "a", "b"], ["imp", "c", "d"]], concl: ["or", "b", "d"] },
  "destructive dilemma": { valid: true, prem: [["or", ["not", "b"], ["not", "d"]], ["imp", "a", "b"], ["imp", "c", "d"]], concl: ["or", ["not", "a"], ["not", "c"]] },
  "faulty dilemma": { valid: false, prem: [["or", "a", "c"], ["imp", "a", "b"], ["imp", "c", "d"]], concl: ["and", "b", "d"] },
  "chained hypothetical syllogism": { valid: true, prem: [["imp", "a", "b"], ["imp", "b", "c"], ["imp", "c", "d"]], concl: ["imp", "a", "d"] },
  "chained modus ponens": { valid: true, prem: [["imp", "a", "b"], ["imp", "b", "c"], ["imp", "c", "d"], "a"], concl: "d" },
  "chained modus tollens": { valid: true, prem: [["imp", "a", "b"], ["imp", "b", "c"], ["imp", "c", "d"], ["not", "d"]], concl: ["not", "a"] },
  "chained affirming the consequent": { valid: false, prem: [["imp", "a", "b"], ["imp", "b", "c"], ["imp", "c", "d"], "d"], concl: "a" },
  "reversed long chain": { valid: false, prem: [["imp", "a", "b"], ["imp", "b", "c"], ["imp", "c", "d"]], concl: ["imp", "d", "a"] },
};
const POOLS = {
  medium: ["modus ponens", "modus tollens", "disjunctive syllogism", "affirming the consequent", "denying the antecedent", "affirming a disjunct"],
  hard: ["modus ponens", "modus tollens", "disjunctive syllogism", "hypothetical syllogism", "affirming the consequent", "denying the antecedent", "affirming a disjunct", "reversed chain"],
  "expert-plus": ["constructive dilemma", "destructive dilemma", "chained hypothetical syllogism", "chained modus ponens", "chained modus tollens", "faulty dilemma", "chained affirming the consequent", "reversed long chain"],
};
const subst = (pat, bind) => (typeof pat === "string" ? bind[pat] : [pat[0], ...pat.slice(1).map((x) => subst(x, bind))]);
const KEYS = ["the gate is open", "the bell rings", "the tank is full", "the signal is red", "the door is locked", "the engine is running", "the alarm sounds", "the pump is on", "the lamp is lit", "the lift is working"];
const LETTERS = ["P", "Q", "R", "S", "T"];

function argHeader(vars, keys) {
  return `Here is an argument built from made-up statements.\n\n${vars.map((v, i) => `- **${v}**: ${keys[i]}`).join("\n")}\n\n`;
}
const argRules = "Rules for this exercise: “or” means one or both, and “if P, then Q” is false only when P is true and Q is false. An argument is **valid** when no assignment of true or false to its statements makes every premise true and the conclusion false.";
function argBody(prem, concl) {
  return `Premises:\n\n${prem.map((p, i) => `${i + 1}. ${sentence(p)}`).join("\n")}\n\nConclusion: **${sentence(concl)}**\n\n`;
}
function argFacts(vars, prem, concl) {
  const rows = countRows(vars, (e) => prem.every((p) => evalRow(p, e)));
  const crows = countRows(vars, (e) => evalRow(concl, e));
  let bad = 0, example = null;
  for (let r = 0; r < nRows(vars); r++) {
    const e = envOf(vars, r);
    if (prem.every((p) => evalRow(p, e)) && !evalRow(concl, e)) { bad++; if (!example) example = e; }
  }
  return { rows, crows, bad, example, valid: bad === 0 };
}

function genArgs(rng, tier) {
  const wantValid = rng.next() < 0.5;
  if (tier === "medium" || tier === "hard" || tier === "expert-plus") {
    const pool = POOLS[tier];
    const group = pool.filter((n) => FORMS[n].valid === wantValid);
    const name = rng.pick(group), form = FORMS[name];
    const need = new Set(); form.prem.concat([form.concl]).forEach((x) => atomsOf(x, need));
    const pv = [...need].sort();
    const letters = shuffled(rng, LETTERS).slice(0, pv.length);
    const bind = Object.fromEntries(pv.map((v, i) => [v, letters[i]]));
    const prem = shuffled(rng, form.prem.map((p) => subst(p, bind))), concl = subst(form.concl, bind);
    const vars = [...letters].sort();
    const keys = shuffled(rng, KEYS).slice(0, vars.length);
    const fx = argFacts(vars, prem, concl);
    if (fx.valid !== form.valid) throw new Error("role-philosopher: form validity mismatch");
    const others = shuffled(rng, pool.filter((n) => n !== name)).slice(0, 3);
    const formPart = choicePart("form", "Form", "Which form does the argument have", name, shuffled(rng, [name, ...others]),
      "Compare the premises with the standard shapes, ignoring which letters are used: which statement is affirmed or denied, and is it the part after “if” or before it?");
    const validP = validPart("valid", "Verdict", "Is the argument valid", fx.valid,
      "Look for a single assignment of true or false that makes every premise true while the conclusion is false; if none exists, the argument holds.");
    const total = nRows(vars);
    const rowsP = numPart("rows", "Premise rows", `In how many of the ${total} true/false assignments to ${orList(vars)} are all the premises true`, fx.rows, 0,
      "Go through each assignment in turn and keep only those where every premise holds at the same time.");
    const badP = numPart("counter", "Counter-example rows", `In how many of the ${total} assignments are all the premises true and the conclusion false`, fx.bad, 0,
      "Among the assignments that make every premise true, count those where the conclusion fails.");
    const ex = `**Form:** ${name}.\n\n**Premises all true:** in ${fx.rows} of ${total} assignments.\n\n**Check:** ${fx.valid ? "no assignment makes every premise true and the conclusion false, so the argument is **valid**." : `for example ${assignText(vars, fx.example)} makes every premise true and the conclusion false, so the argument is **invalid**.`}${tier === "expert-plus" ? `\n\n**Counter-example rows:** ${fx.bad}.` : ""}`;
    const head = argHeader(vars, keys) + argBody(prem, concl) + argRules;
    const hints = ["Match the pattern first, then test it: an argument holds only if its conclusion can never fail while the premises hold.", "List the assignments of true and false to the letters and check each one against every premise."];
    const params = { tier, vars, prem, concl, formName: name };
    if (tier === "medium") return finish(head, [formPart, validP], ex, "ph-af1", params, null, hints);
    if (tier === "hard") return finish(head, [formPart, validP, rowsP], ex, "ph-af2", params, null, hints);
    return finish(head, [formPart, validP, rowsP, badP], ex, "ph-af4", params, null, hints);
  }
  // expert: a two-step chain plus one more fact over P, Q, R (letters drawn), a stated conclusion
  for (let i = 0; i < TRY; i++) {
    const letters = shuffled(rng, LETTERS).slice(0, 3), [x, y, z] = letters, vars = [...letters].sort();
    const fact = rng.pick([x, y, ["not", z], ["not", x], z, ["not", y]]);
    const prem = shuffled(rng, [["imp", x, y], ["imp", y, z], fact]);
    const cands = [x, y, z, ["not", x], ["not", y], ["not", z], ["imp", x, z], ["imp", z, x], ["or", x, z], ["and", x, z]];
    const concl = rng.pick(cands);
    if (prem.some((p) => same(p, concl))) continue;
    const fx = argFacts(vars, prem, concl);
    if (fx.valid !== wantValid || fx.rows < 1 || fx.rows > 6 || fx.crows < 1 || fx.crows > 7) continue;
    const keys = shuffled(rng, KEYS).slice(0, 3);
    const total = 8;
    const parts = [
      numPart("rows", "Premise rows", `In how many of the ${total} true/false assignments to ${orList(vars)} are all the premises true`, fx.rows, 0, "Check each assignment against every premise and keep those where all of them hold."),
      numPart("crows", "Conclusion rows", `In how many of the ${total} assignments is the conclusion true`, fx.crows, 0, "Ignore the premises here and count the assignments where the conclusion alone holds."),
      validPart("valid", "Verdict", "Is the argument valid", fx.valid, "The conclusion must be true in every assignment where all the premises are true; one failure is enough to break it."),
    ];
    const ex = `**Premises all true:** ${fx.rows} of ${total} assignments.\n\n**Conclusion true:** ${fx.crows} of ${total} assignments.\n\n**Check:** ${fx.valid ? "every assignment that makes all the premises true also makes the conclusion true, so the argument is **valid**." : `for example ${assignText(vars, fx.example)} makes every premise true and the conclusion false, so the argument is **invalid**.`}`;
    return finish(argHeader(vars, keys) + argBody(prem, concl) + argRules, parts, ex, "ph-af3", { tier, vars, prem, concl }, null,
      ["Work out which assignments satisfy all the premises together, then see what the conclusion does on exactly those.", "Counting the rows where the conclusion holds does not need the premises at all."]);
  }
  return tooMany();
}

// ---------- truth tables ----------

function randTree(rng, vars, depth) {
  if (depth === 0 || (depth < 3 && rng.next() < 0.2)) {
    const a = rng.pick(vars);
    return rng.next() < 0.25 ? ["not", a] : a;
  }
  const op = rng.pick(["and", "or", "imp", "imp", "iff", "not"]);
  if (op === "not") {
    const sub = randTree(rng, vars, depth - 1);
    return !isAtom(sub) && sub[0] === "not" ? sub : ["not", sub];
  }
  return [op, randTree(rng, vars, depth - 1), randTree(rng, vars, depth - 1)];
}
const cleanTree = (a) => isAtom(a) || (a.slice(1).every(cleanTree) && !(a.length === 3 && same(a[1], a[2])) && !(a[0] === "not" && !isAtom(a[1]) && a[1][0] === "not"));

// Rewrites at one node: equivalent ones and plausible-looking wrong ones.
const nt = (x) => ["not", x];
const RW_EQ = [
  (a) => (a[0] === "imp" ? ["or", nt(a[1]), a[2]] : null),
  (a) => (a[0] === "imp" ? ["imp", nt(a[2]), nt(a[1])] : null),
  (a) => (a[0] === "imp" ? nt(["and", a[1], nt(a[2])]) : null),
  (a) => (a[0] === "not" && !isAtom(a[1]) && a[1][0] === "and" ? ["or", nt(a[1][1]), nt(a[1][2])] : null),
  (a) => (a[0] === "not" && !isAtom(a[1]) && a[1][0] === "or" ? ["and", nt(a[1][1]), nt(a[1][2])] : null),
  (a) => (a[0] === "not" && !isAtom(a[1]) && a[1][0] === "imp" ? ["and", a[1][1], nt(a[1][2])] : null),
  (a) => (a[0] === "and" || a[0] === "or" || a[0] === "iff" ? [a[0], a[2], a[1]] : null),
  (a) => (a[0] === "iff" ? ["and", ["imp", a[1], a[2]], ["imp", a[2], a[1]]] : null),
];
const RW_BAD = [
  (a) => (a[0] === "imp" ? ["imp", a[2], a[1]] : null),
  (a) => (a[0] === "imp" ? ["imp", nt(a[1]), nt(a[2])] : null),
  (a) => (a[0] === "imp" ? ["iff", a[1], a[2]] : null),
  (a) => (a[0] === "not" && !isAtom(a[1]) && a[1][0] === "and" ? ["and", nt(a[1][1]), nt(a[1][2])] : null),
  (a) => (a[0] === "not" && !isAtom(a[1]) && a[1][0] === "or" ? ["or", nt(a[1][1]), nt(a[1][2])] : null),
  (a) => (a[0] === "not" && !isAtom(a[1]) && a[1][0] === "imp" ? ["imp", nt(a[1][1]), nt(a[1][2])] : null),
  (a) => (a[0] === "and" ? ["or", a[1], a[2]] : a[0] === "or" ? ["and", a[1], a[2]] : null),
  (a) => (a[0] === "iff" ? ["imp", a[1], a[2]] : null),
];
function rewriteAt(a, rng, rules) {
  const paths = [];
  (function walk(n, path) {
    if (isAtom(n)) return;
    rules.forEach((r, i) => { if (r(n)) paths.push([path, i]); });
    n.slice(1).forEach((c, i) => walk(c, [...path, i + 1]));
  })(a, []);
  if (!paths.length) return null;
  const [path, ri] = rng.pick(paths);
  const go = (n, p) => (p.length === 0 ? rules[ri](n) : n.map((c, i) => (i === p[0] ? go(c, p.slice(1)) : c)));
  return go(a, path);
}
const ttKind = (vars, a) => { const t = countRows(vars, (e) => evalRow(a, e)); return t === nRows(vars) ? "Tautology" : t === 0 ? "Contradiction" : "Contingent"; };
const KIND3 = ["Tautology", "Contradiction", "Contingent"];
const countSentence = (vars, what) => `In how many of the ${nRows(vars)} rows is ${what} true`;

function genTable(rng, tier) {
  const k = tier === "medium" ? 2 : tier === "expert-plus" ? 4 : 3;
  const vars = LETTERS.slice(0, k);
  const depth = tier === "medium" ? 2 : 3;
  const rowsLine = `A **row** is one assignment of true or false to ${orList(vars)}, so there are ${nRows(vars)} rows. ${TF_RULES}`;
  const draw = (minAtoms, maxNodes) => {
    for (let i = 0; i < TRY; i++) {
      const t = randTree(rng, vars, depth);
      if (isAtom(t) || !cleanTree(t) || nodesOf(t) > maxNodes || atomsOf(t).size < minAtoms) continue;
      return t;
    }
    return tooMany();
  };
  if (tier === "medium" || tier === "hard") {
    const wantKind = rng.pick(["Tautology", "Contradiction", "Contingent", "Contingent"]);
    const wantEq = rng.next() < 0.5;
    for (let i = 0; i < TRY; i++) {
      const A = draw(k, tier === "medium" ? 7 : 9);
      if (ttKind(vars, A) !== wantKind) continue;
      const tr = countRows(vars, (e) => evalRow(A, e));
      const kindP = choicePart("kind", "Kind", `Is statement A a tautology (true in every row), a contradiction (true in no row) or neither`, wantKind === "Contingent" ? "Neither" : wantKind, shuffled(rng, ["Tautology", "Contradiction", "Neither"]),
        "Count the rows where A comes out true, then compare that count with the total number of rows.");
      const rowsP = numPart("rows", "True rows", countSentence(vars, "statement A"), tr, 0, "Work out A row by row, bracket by bracket, and tally the rows that end true.");
      const exA = `**True rows:** ${tr} of ${nRows(vars)}.\n\n**Kind:** ${wantKind === "Contingent" ? "true in some rows but not all, so neither a tautology nor a contradiction" : wantKind === "Tautology" ? "true in every row, so a **tautology**" : "true in no row, so a **contradiction**"}.`;
      if (tier === "medium") {
        return finish(`Consider the statement **A: ${sym(A)}**.\n\n${rowsLine}`, [rowsP, kindP], exA, "ph-tt1", { tier, vars, A }, null,
          ["Fill in a column for each smaller part, then combine them.", "Compare the number of true rows with the number of rows altogether."]);
      }
      // hard: a second statement B, equivalent or not
      let B = null;
      for (let j = 0; j < 60 && !B; j++) {
        let c = rewriteAt(A, rng, wantEq ? RW_EQ : RW_BAD);
        if (c && rng.next() < 0.4) c = rewriteAt(c, rng, RW_EQ) || c;
        if (!c || same(c, A) || !cleanTree(c) || nodesOf(c) > 12) continue;
        const eq = countRows(vars, (e) => evalRow(A, e) === evalRow(c, e)) === nRows(vars);
        if (eq === wantEq) B = c;
      }
      if (!B) continue;
      const equivP = yesNo("equiv", "Equivalent?", "Are A and B logically equivalent (the same truth value in every row)", wantEq, "Compare the two statements row by row; a single row where they differ settles it.");
      const ex = `${exA}\n\n**Equivalent:** ${wantEq ? "B has the same value as A in every row" : "there is a row where A and B differ"}: **${YN(wantEq)}**.`;
      return finish(`Consider the statements **A: ${sym(A)}** and **B: ${sym(B)}**.\n\n${rowsLine}`, [rowsP, kindP, equivP], ex, "ph-tt2", { tier, vars, A, B }, null,
        ["Fill in a column for each smaller part of A, then combine them; do the same for B.", "Two statements are equivalent only if their final columns match in every row."]);
    }
    return tooMany();
  }
  // expert / expert-plus: two statements A and B
  const wantFollows = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const A = draw(3, 9), B = draw(3, 9);
    if (same(A, B)) continue;
    const ra = countRows(vars, (e) => evalRow(A, e)), rb = countRows(vars, (e) => evalRow(B, e));
    const both = countRows(vars, (e) => evalRow(A, e) && evalRow(B, e));
    const diff = countRows(vars, (e) => evalRow(A, e) !== evalRow(B, e));
    const n = nRows(vars);
    if (ra < 1 || ra > n - 1 || rb < 1 || rb > n - 1 || diff < 1) continue;
    const follows = both === ra;
    if (follows !== wantFollows) continue;
    const parts = [numPart("rowsa", "Rows of A", countSentence(vars, "statement A"), ra, 0, "Work out A row by row and tally the rows that end true.")];
    let ex = `**A true:** ${ra} of ${n} rows.`;
    if (tier === "expert") {
      parts.push(numPart("rowsb", "Rows of B", countSentence(vars, "statement B"), rb, 0, "Do the same for B on its own."));
      ex += `\n\n**B true:** ${rb} of ${n} rows.`;
    } else {
      parts.push(numPart("both", "Both true", `In how many of the ${n} rows are A and B both true`, both, 0, "Only count a row if A and B come out true in that same row."));
      parts.push(numPart("differ", "They differ", `In how many of the ${n} rows do A and B have different truth values`, diff, 0, "Count the rows where one is true and the other false, in either order."));
      ex += `\n\n**Both true:** ${both} rows.\n\n**Different values:** ${diff} rows.`;
    }
    parts.push(yesNo("follows", "A entails B?", "Is B true in every row where A is true", follows, "Look only at the rows where A is true and see whether B is ever false there."));
    ex += `\n\n**Entails:** ${follows ? "B is true in every row where A is true" : "there is a row where A is true and B is false"}: **${YN(follows)}**.`;
    return finish(`Consider the statements **A: ${sym(A)}** and **B: ${sym(B)}**.\n\n${rowsLine}`, parts, ex, tier === "expert" ? "ph-tt3" : "ph-tt4", { tier, vars, A, B }, null,
      ["Fill in a column for each statement first; the later counts all come from those two columns.", "Rows where A is false do not matter when you ask whether A entails B."]);
  }
  return tooMany();
}

// ---------- decision theory ----------

const THEMES = [
  { who: "A fair organiser", pick: "which plan to run", states: ["Rain", "Cloud", "Sun", "Heatwave"], opts: ["Indoor hall", "Covered marquee", "Open field", "Mixed layout"] },
  { who: "A bakery", pick: "how big a batch to bake", states: ["Low demand", "Normal demand", "High demand", "Sell-out demand"], opts: ["Small batch", "Medium batch", "Large batch", "Extra-large batch"] },
  { who: "A farm", pick: "which crop to plant", states: ["Dry season", "Average season", "Wet season", "Stormy season"], opts: ["Barley", "Beans", "Potatoes", "Oats"] },
  { who: "A theatre", pick: "which show to put on", states: ["Small crowd", "Medium crowd", "Large crowd", "Full house"], opts: ["Comedy", "Drama", "Musical", "Opera"] },
];
const minOf = (a) => Math.min(...a);

function dtStats(pay, pct) {
  const n = pay.length, s = pct.length;
  const ev = pay.map((row) => sum(row.map((v, j) => (v * pct[j]) / 100)));
  const mins = pay.map(minOf);
  const colMax = pct.map((_, j) => Math.max(...pay.map((row) => row[j])));
  const regret = pay.map((row) => row.map((v, j) => colMax[j] - v));
  const maxReg = regret.map((r) => Math.max(...r));
  const perfect = sum(colMax.map((m, j) => (m * pct[j]) / 100));
  const top = (arr, better) => { const best = better(...arr); const idx = arr.map((v, i) => [v, i]).filter(([v]) => v === best).map(([, i]) => i); return idx; };
  return { n, s, ev, mins, regret, maxReg, perfect, evBest: top(ev, Math.max), maximin: top(mins, Math.max), minimax: top(maxReg, Math.min) };
}

function genDecision(rng, tier) {
  const wantDiff = rng.next() < 0.5;
  const big = tier === "expert" || tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    const th = rng.pick(THEMES);
    const S = tier === "expert-plus" ? 4 : 3, N = big ? 4 : 3;
    const states = th.states.slice(0, S);
    // probabilities in tenths, each at least 10 %
    const tenths = Array.from({ length: S }, () => 1);
    for (let k = 0; k < 10 - S; k++) tenths[rng.int(0, S - 1)]++;
    if (Math.max(...tenths) > 6) continue;
    const pct = tenths.map((t) => t * 10);
    const opts = shuffled(rng, th.opts).slice(0, N);
    const pay = opts.map(() => states.map(() => 5 * rng.int(-8, 40)));
    const st = dtStats(pay, pct);
    if (st.evBest.length !== 1 || st.maximin.length !== 1) continue;
    const evs = [...st.ev].sort((a, b) => b - a);
    if (evs[0] - evs[1] < 2.5) continue;
    if ((st.evBest[0] !== st.maximin[0]) !== wantDiff && tier !== "medium") continue;
    if (tier === "expert-plus") {
      if (st.minimax.length !== 1 || st.perfect - evs[0] < 2.5) continue;
    }
    const target = rng.int(0, N - 1);
    const header = `| Option | ${states.map((s, j) => `${s} (${pct[j]}%)`).join(" | ")} |\n| --- | ${states.map(() => "---:").join(" | ")} |\n${opts.map((o, r) => `| ${o} | ${pay[r].join(" | ")} |`).join("\n")}`;
    const rulesBase = "Rules for this exercise: the **expected value** of an option is the sum of each payoff times the probability of its state. **Maximin** picks the option whose worst payoff is highest. Payoffs are in dollars, and the probabilities are the percentages shown.";
    const rulesRegret = " The **regret** of an option in a state is the best payoff available in that state minus the option's payoff there; its **maximum regret** is its largest regret, and **minimax regret** picks the option whose maximum regret is smallest. The **value of perfect information** is the expected value if the best option were always chosen for the state that occurs, minus the best expected value of the options above.";
    const intro = `${th.who} must decide ${th.pick}. The payoff of each option depends on the state that occurs, and the state probabilities are known.\n\n${header}\n\n`;
    const evP = (id, label) => numPart(id, label, `Expected value of ${opts[target]} ($)`, st.ev[target], 1, "Multiply each payoff in the row by the probability of its state, written as a decimal, then add the results.");
    const bestP = choicePart("best", "Best by EV", "Which option has the highest expected value", opts[st.evBest[0]], shuffled(rng, opts), "Work out an expected value for every option, not just the first, and compare them.");
    const maxP = choicePart("maximin", "Maximin", "Which option does the maximin rule choose", opts[st.maximin[0]], shuffled(rng, opts), "Find the worst payoff in each row, then take the option whose worst payoff is the largest.");
    const exEv = (r) => `**EV(${opts[r]}):** ${pay[r].map((v, j) => `${f(pct[j] / 100)} × ${v}`).join(" + ")} = **${f(st.ev[r])}**.`;
    const exBest = `**Best by EV:** ${opts.map((o, r) => `${o} ${f(st.ev[r])}`).join(", ")} → **${opts[st.evBest[0]]}**.`;
    const exMax = `**Worst payoffs:** ${opts.map((o, r) => `${o} ${st.mins[r]}`).join(", ")} → maximin picks **${opts[st.maximin[0]]}**.`;
    const givenP = pct.map((p, j) => [`_p${j + 1}`, p]);
    const givenPay = pay[target].map((v, j) => [`_pay${j + 1}`, v]);
    const params = { tier, states, pct, opts, pay, target };
    const hintsBase = ["Probabilities are given as percentages, so turn them into decimals before multiplying.", "Different rules can pick different options, so apply each rule exactly as stated."];
    if (tier === "medium") {
      return finish(intro + rulesBase, [evP("ev", "Expected value"), bestP], `${exEv(target)}\n\n${exBest}`, "ph-dt1", params, [...givenP, ...givenPay],
        ["Each payoff is weighted by how likely its state is.", "Compare the options by their expected values."]);
    }
    if (tier === "hard") {
      return finish(intro + rulesBase, [evP("ev", "Expected value"), bestP, maxP], `${exEv(target)}\n\n${exBest}\n\n${exMax}`, "ph-dt2", params, [...givenP, ...givenPay], hintsBase);
    }
    if (tier === "expert") {
      return finish(intro + rulesBase, [evP("ev", "Expected value"), bestP, maxP], `${exEv(target)}\n\n${exBest}\n\n${exMax}`, "ph-dt3", params, givenP, hintsBase);
    }
    const mxName = opts[target];
    const parts = [
      numPart("vpi", "Perfect information", "Value of perfect information ($)", st.perfect - evs[0], 1, "Take the best payoff in each state, weight those by the probabilities and add them, then subtract the best expected value of any single option."),
      bestP,
      choicePart("minimax", "Minimax regret", "Which option does the minimax-regret rule choose", opts[st.minimax[0]], shuffled(rng, opts), "Turn each column into regrets by subtracting every payoff from the column's best, then take each option's largest regret and choose the smallest of those."),
      numPart("maxreg", "Maximum regret", `Maximum regret of ${mxName} ($)`, st.maxReg[target], 0, "Subtract this option's payoff in each state from the best payoff in that state, and take the largest gap."),
    ];
    const colMax = pct.map((_, j) => Math.max(...pay.map((row) => row[j])));
    const ex = `**Best payoff per state:** ${colMax.join(", ")}, so the perfect-information value is ${f(st.perfect)} − ${f(evs[0])} = **${f(st.perfect - evs[0])}**.\n\n${exBest}\n\n**Maximum regrets:** ${opts.map((o, r) => `${o} ${st.maxReg[r]}`).join(", ")} → minimax regret picks **${opts[st.minimax[0]]}**; ${mxName} has **${st.maxReg[target]}**.`;
    return finish(intro + rulesBase + rulesRegret, parts, ex, "ph-dt4", params, [...givenP, ...pay[target].map((v, j) => [`_pay${j + 1}`, v])],
      ["Start with the best payoff in each state; several parts use those.", "Regret is measured against the best you could have done in the state that happened."]);
  }
  return tooMany();
}

// ---------- ballots and voting ----------

const VOTE_THEMES = [
  { who: "A garden club", what: "which tree to plant", names: ["Ash", "Birch", "Cedar", "Elm"] },
  { who: "A canteen committee", what: "which flavour to add", names: ["Amber", "Basil", "Clove", "Dill"] },
  { who: "A book club", what: "which title to read next", names: ["Atlas", "Beacon", "Compass", "Delta"] },
];
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

function voteStats(m, groups) {
  const total = sum(groups.map((g) => g.n));
  const pw = Array.from({ length: m }, () => Array(m).fill(0));
  const borda = Array(m).fill(0), first = Array(m).fill(0);
  for (const g of groups) {
    g.rank.forEach((c, pos) => { borda[c] += g.n * (m - 1 - pos); });
    first[g.rank[0]] += g.n;
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
      if (a !== b && g.rank.indexOf(a) < g.rank.indexOf(b)) pw[a][b] += g.n;
    }
  }
  let cond = -1;
  for (let a = 0; a < m; a++) if (pw[a].every((v, b) => b === a || v > pw[b][a])) cond = a;
  const uniqMax = (arr) => { const mx = Math.max(...arr); const idx = arr.map((v, i) => (v === mx ? i : -1)).filter((i) => i >= 0); return idx.length === 1 ? idx[0] : -1; };
  // instant runoff: drop the candidate with the fewest first places until one has more than half
  let alive = Array.from({ length: m }, (_, i) => i), irv = -1, tie = false;
  for (;;) {
    const tally = Object.fromEntries(alive.map((c) => [c, 0]));
    for (const g of groups) tally[g.rank.find((c) => alive.includes(c))] += g.n;
    const lead = alive.find((c) => tally[c] * 2 > total);
    if (lead !== undefined) { irv = lead; break; }
    const low = Math.min(...alive.map((c) => tally[c]));
    const drop = alive.filter((c) => tally[c] === low);
    if (drop.length !== 1) { tie = true; break; }
    alive = alive.filter((c) => c !== drop[0]);
  }
  return { total, pw, borda, first, cond, bordaWin: uniqMax(borda), plurWin: uniqMax(first), irv: tie ? -1 : irv };
}

function genBallots(rng, tier) {
  const m = tier === "expert-plus" ? 4 : 3;
  const wantNone = rng.next() < 0.4;
  for (let i = 0; i < TRY; i++) {
    const th = rng.pick(VOTE_THEMES);
    const names = shuffled(rng, th.names).slice(0, m);
    const rankings = shuffled(rng, perms([...Array(m).keys()]));
    const g = tier === "expert-plus" ? rng.int(4, 6) : rng.int(3, 5);
    const groups = rankings.slice(0, g).map((rank) => ({ n: rng.int(2, 12), rank }));
    const st = voteStats(m, groups);
    if (st.total % 2 === 0 || st.total > 45) continue;
    if ((st.cond === -1) !== wantNone) continue;
    if (st.bordaWin === -1) continue;
    if ((tier === "expert") && st.plurWin === -1) continue;
    if (tier === "expert-plus" && st.irv === -1) continue;
    const X = rng.int(0, m - 1);
    let Y = rng.int(0, m - 2); if (Y >= X) Y++;
    const nm = (c) => names[c];
    const cols = ["1st", "2nd", "3rd", "4th"].slice(0, m);
    const table = `| Members | ${cols.join(" | ")} |\n| ---: | ${cols.map(() => "---").join(" | ")} |\n${groups.map((gr) => `| ${gr.n} | ${gr.rank.map(nm).join(" | ")} |`).join("\n")}`;
    const pts = Array.from({ length: m }, (_, k) => m - 1 - k).join(", ");
    const rulesBase = `Rules for this exercise: **${st.total} members** each rank all ${m} choices from first to last, and each row shows how many members chose that order. A choice **beats** another when more members rank it above the other than the reverse. The **Condorcet winner** is a choice that beats every other one; if no choice does, the answer is None.`;
    const rulesBorda = ` **Borda count:** each member's ranking gives ${pts} points from first place to last, and the points are added over all members.`;
    const rulesIrv = " **Instant runoff:** the choice with the fewest first places is removed, its ballots move to their next remaining choice, and this repeats until one choice has more than half of the members.";
    const intro = `${th.who} is deciding ${th.what}.\n\n${table}\n\n`;
    const tallyP = numPart("tally", "Pairwise tally", `How many members rank ${nm(X)} above ${nm(Y)}`, st.pw[X][Y], 0, "Add up the member counts of every row in which the first choice appears higher than the second.");
    const condChoices = shuffled(rng, [...names, "None"]);
    const condP = choicePart("condorcet", "Condorcet winner", "Which choice is the Condorcet winner, or None", st.cond === -1 ? "None" : nm(st.cond), condChoices, "Compare each pair of choices head to head; a winner must come out ahead in every one of its contests, and if the wins go round in a loop, no choice qualifies.");
    const bordaP = choicePart("borda", "Borda winner", "Which choice has the most Borda points", nm(st.bordaWin), shuffled(rng, names), "Each row gives points by position; multiply by the number of members in that row and add up the rows for every choice.");
    const exTally = `**${nm(X)} over ${nm(Y)}:** ${groups.filter((gr) => gr.rank.indexOf(X) < gr.rank.indexOf(Y)).map((gr) => gr.n).join(" + ") || "0"} = **${st.pw[X][Y]}** (of ${st.total}).`;
    const pairs = [];
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) pairs.push(`${nm(a)} ${st.pw[a][b]}–${st.pw[b][a]} ${nm(b)}`);
    const exCond = `**Head to head:** ${pairs.join("; ")}. ${st.cond === -1 ? "No choice wins all its contests, so the answer is **None**." : `**${nm(st.cond)}** wins every contest.`}`;
    const exBorda = `**Borda points:** ${names.map((n, c) => `${n} ${st.borda[c]}`).join(", ")} → **${nm(st.bordaWin)}**.`;
    const given = groups.map((gr, q) => [`_n${q + 1}`, gr.n]);
    const params = { tier, names, groups, X, Y };
    const hints = ["Work out each count from the rows, weighting every row by its member count.", "Read each ranking from first choice down; a higher position means preferred."];
    if (tier === "medium") return finish(intro + rulesBase, [tallyP, condP], `${exTally}\n\n${exCond}`, "ph-vt1", params, given, hints);
    if (tier === "hard") return finish(intro + rulesBase + rulesBorda, [tallyP, condP, bordaP], `${exTally}\n\n${exCond}\n\n${exBorda}`, "ph-vt2", params, given, hints);
    if (tier === "expert") {
      const bpP = numPart("bordapts", "Borda points", `Total Borda points of ${nm(X)}`, st.borda[X], 0, "A first place earns the most points and last earns none; weight each row's points by its member count.");
      const plP = choicePart("plurality", "Plurality winner", "Which choice has the most first places", nm(st.plurWin), shuffled(rng, names), "Only the first column matters here: add the member counts of the rows that put each choice first.");
      return finish(intro + rulesBase + rulesBorda, [bpP, plP, condP], `**${nm(X)}:** ${st.borda[X]} Borda points.\n\n**First places:** ${names.map((n, c) => `${n} ${st.first[c]}`).join(", ")} → **${nm(st.plurWin)}**.\n\n${exCond}`, "ph-vt3", params, given, hints);
    }
    const irvP = choicePart("runoff", "Instant runoff", "Which choice wins the instant runoff", nm(st.irv), shuffled(rng, names), "After each removal, move every ballot from the removed choice to the highest-ranked choice still in the race, then recount the first places.");
    // runoff trace for the explanation
    let alive = [...Array(m).keys()]; const trace = [];
    for (;;) {
      const tl = Object.fromEntries(alive.map((c) => [c, 0]));
      for (const gr of groups) tl[gr.rank.find((c) => alive.includes(c))] += gr.n;
      trace.push(alive.map((c) => `${nm(c)} ${tl[c]}`).join(", "));
      const lead = alive.find((c) => tl[c] * 2 > st.total);
      if (lead !== undefined) break;
      const low = Math.min(...alive.map((c) => tl[c]));
      alive = alive.filter((c) => tl[c] !== low);
    }
    const exIrv = `**Runoff rounds:** ${trace.join(" → ")} → **${nm(st.irv)}** wins.`;
    return finish(intro + rulesBase + rulesBorda + rulesIrv, [tallyP, condP, bordaP, irvP], `${exTally}\n\n${exCond}\n\n${exBorda}\n\n${exIrv}`, "ph-vt4", params, given, hints);
  }
  return tooMany();
}

// ---------- entry point ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "argument-forms") return genArgs(rng, difficulty);
  if (subtopic === "truth-tables") return genTable(rng, difficulty);
  if (subtopic === "decision-theory") return genDecision(rng, difficulty);
  if (subtopic === "ballots") return genBallots(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Truth tables become bit vectors (one bit per row), so a statement is a BigInt and counting is a popcount.
// Argument forms are recognised by unifying the premises with each pattern (any premise order). Expected
// value is the integer numerator over 100, regret comes from sorted columns, and ballots are expanded
// into one entry per voter before recounting.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

function makeVec(vars) {
  const n = 1 << vars.length, full = (1n << BigInt(n)) - 1n;
  const base = vars.map((_, i) => { let m = 0n; for (let r = 0; r < n; r++) if ((r >> i) & 1) m |= 1n << BigInt(r); return m; });
  const go = (a) => {
    if (typeof a === "string") { const i = vars.indexOf(a); if (i < 0) throw new Error("unknown letter"); return base[i]; }
    const x = go(a[1]);
    if (a[0] === "not") return ~x & full;
    const y = go(a[2]);
    switch (a[0]) {
      case "and": return x & y;
      case "or": return x | y;
      case "imp": return (~x & full) | y;
      case "iff": return ~(x ^ y) & full;
      default: throw new Error("bad statement");
    }
  };
  return { full, go };
}
const pop = (b) => { let c = 0; for (const ch of b.toString(2)) if (ch === "1") c++; return c; };

function unify(pat, ast, bind, rev) {
  if (typeof pat === "string") {
    if (typeof ast !== "string") return false;
    if (pat in bind) return bind[pat] === ast;
    if (ast in rev) return false;
    bind[pat] = ast; rev[ast] = pat; return true;
  }
  if (typeof ast === "string" || ast.length !== pat.length || ast[0] !== pat[0]) return false;
  return pat.slice(1).every((p, i) => unify(p, ast[i + 1], bind, rev));
}
const permsOf = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => permsOf([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
function formsMatching(prem, concl) {
  const out = [];
  for (const [name, form] of Object.entries(FORMS)) {
    if (form.prem.length !== prem.length) continue;
    for (const order of permsOf(prem)) {
      const bind = {}, rev = {};
      if (form.prem.every((p, i) => unify(p, order[i], bind, rev)) && unify(form.concl, concl, bind, rev)) { out.push(name); break; }
    }
  }
  return out;
}

function vecArgFacts(vars, prem, concl) {
  const { full, go } = makeVec(vars);
  let all = full;
  for (const p of prem) all &= go(p);
  const c = go(concl);
  return { rows: pop(all), crows: pop(c), bad: pop(all & (~c & full)) };
}

// decision theory by integer numerators
function dtAlt(p) {
  const { pct, pay } = p, n = pay.length, s = pct.length;
  const num100 = pay.map((row) => row.reduce((t, v, j) => t + v * pct[j], 0));
  const sorted = [...num100].sort((a, b) => b - a);
  const best = num100.indexOf(sorted[0]);
  const worst = pay.map((row) => [...row].sort((a, b) => a - b)[0]);
  const wsorted = [...worst].sort((a, b) => b - a);
  const cols = Array.from({ length: s }, (_, j) => pay.map((row) => row[j]).sort((a, b) => b - a));
  const reg = pay.map((row) => row.map((v, j) => cols[j][0] - v));
  const mreg = reg.map((r) => [...r].sort((a, b) => b - a)[0]);
  const msorted = [...mreg].sort((a, b) => a - b);
  const perfect100 = cols.reduce((t, c, j) => t + c[0] * pct[j], 0);
  return {
    n,
    ev: num100[p.target] / 100,
    best: p.opts[best],
    bestUnique: sorted[0] > sorted[1],
    maximin: p.opts[worst.indexOf(wsorted[0])],
    maximinUnique: wsorted[0] > wsorted[1],
    vpi: (perfect100 - sorted[0]) / 100,
    minimax: p.opts[mreg.indexOf(msorted[0])],
    maxreg: mreg[p.target],
  };
}

// ballots expanded voter by voter
function ballotAlt(p) {
  const m = p.names.length, voters = [];
  for (const g of p.groups) for (let i = 0; i < g.n; i++) voters.push(g.rank.slice());
  const N = voters.length;
  const above = (a, b) => voters.filter((v) => v.indexOf(a) < v.indexOf(b)).length;
  let cond = "None";
  for (let a = 0; a < m; a++) { let wins = 0; for (let b = 0; b < m; b++) if (b !== a && above(a, b) * 2 > N) wins++; if (wins === m - 1) cond = p.names[a]; }
  const borda = Array(m).fill(0);
  for (const v of voters) v.forEach((c, pos) => { borda[c] += m - 1 - pos; });
  const bs = [...borda].sort((a, b) => b - a);
  const first = Array(m).fill(0);
  for (const v of voters) first[v[0]]++;
  const fs = [...first].sort((a, b) => b - a);
  // runoff, one voter at a time
  let out = new Set(), irv = "";
  for (;;) {
    const t = Array(m).fill(0);
    for (const v of voters) t[v.find((c) => !out.has(c))]++;
    const live = [...Array(m).keys()].filter((c) => !out.has(c));
    const lead = live.find((c) => t[c] * 2 > N);
    if (lead !== undefined) { irv = p.names[lead]; break; }
    const low = Math.min(...live.map((c) => t[c]));
    const gone = live.filter((c) => t[c] === low);
    if (gone.length !== 1) { irv = ""; break; }
    out.add(gone[0]);
  }
  return {
    odd: N % 2 === 1,
    tally: above(p.X, p.Y),
    condorcet: cond,
    borda: p.names[borda.indexOf(bs[0])],
    bordaUnique: bs[0] > bs[1],
    bordapts: borda[p.X],
    plurality: p.names[first.indexOf(fs[0])],
    pluralityUnique: fs[0] > fs[1],
    runoff: irv,
  };
}

function afAlt(p, parts) {
  const fx = vecArgFacts(p.vars, p.prem, p.concl);
  const out = { rows: fx.rows, crows: fx.crows, counter: fx.bad, valid: fx.bad === 0 ? "Valid" : "Invalid" };
  if (parts.some((q) => q.id === "form")) {
    const ms = formsMatching(p.prem, p.concl);
    if (ms.length !== 1) throw new Error("form not unique");
    out.form = ms[0];
  }
  return out;
}
function ttAlt(p) {
  const { go, full } = makeVec(p.vars);
  const a = go(p.A), b = p.B ? go(p.B) : 0n;
  const ra = pop(a), n = 1 << p.vars.length;
  const out = { rows: ra, rowsa: ra, kind: ra === n ? "Tautology" : ra === 0 ? "Contradiction" : "Neither" };
  if (p.B) {
    out.rowsb = pop(b);
    out.both = pop(a & b);
    out.differ = pop(a ^ b);
    out.equiv = YN((a ^ b) === 0n);
    out.follows = YN((a & ~b & full) === 0n);
  }
  return out;
}
const dtTruth = (p) => { const t = dtAlt(p); if (!t.bestUnique || !t.maximinUnique) throw new Error("tie"); return t; };

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  const parts = question.parts;
  if (!Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try {
    const k = p.kind || "";
    if (k.startsWith("ph-af")) truth = afAlt(p, parts);
    else if (k.startsWith("ph-tt")) truth = ttAlt(p);
    else if (k.startsWith("ph-dt")) {
      const t = dtTruth(p);
      truth = { ev: t.ev, best: t.best, maximin: t.maximin, vpi: t.vpi, minimax: t.minimax, maxreg: t.maxreg };
    } else if (k.startsWith("ph-vt")) {
      const t = ballotAlt(p);
      if (!t.odd || !t.bordaUnique || (p.tier === "expert" && !t.pluralityUnique) || (p.tier === "expert-plus" && !t.runoff)) return false;
      truth = t;
    } else return false;
  } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined || tv === null) return false;
    if (part.answerType === "number") {
      const dp = part.tolerance === 0 ? 0 : 1;
      const want = dp === 0 ? Math.round(tv) : Math.round(tv * 10) / 10;
      if (!near(partNum(answer, part.id), want, part.tolerance)) return false;
    } else if (partStr(answer, part.id) !== String(tv)) return false;
  }
  return true;
}
