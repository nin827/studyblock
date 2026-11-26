// Logic Puzzles generator: knights and knaves, ordering puzzles, whodunits.
// Uses only the seeded rng passed in by the engine. Every puzzle is checked for a unique
// solution by brute force while generating, and verify() re-solves it by brute force with its
// own, separately written interpreter.

// ---------- shared helpers ----------

// One name per initial, so alphabetical order is the order of the initials (A, B, C, ...).
const NAME_POOL = [
  ["Ava", "Amir", "Alba"],
  ["Ben", "Bea", "Bruno"],
  ["Cara", "Chen", "Cyrus"],
  ["Dev", "Dina", "Dario"],
  ["Eli", "Esme", "Emeka"],
  ["Finn", "Fay", "Farah"],
];
const WORDS = ["none", "one", "two", "three", "four", "five", "six"];
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ids = (names) => names.map((n) => n.toLowerCase());

function pickNames(rng, n) {
  return NAME_POOL.slice(0, n).map((pool) => rng.pick(pool));
}

// "Ava", "Ava and Ben", "Ava, Ben and Cara"
function listAnd(xs) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function permutations(n) {
  const out = [];
  const a = [...Array(n).keys()];
  const rec = (k) => {
    if (k === n) { out.push(a.slice()); return; }
    for (let i = k; i < n; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      rec(k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  rec(0);
  return out;
}
const PERMS = [null, null, null, permutations(3), permutations(4), permutations(5), permutations(6)];

// ======================================================================
// Knights and knaves
// ======================================================================
// Statement AST (persons are indexes 0..n-1, k = true means "knight"):
//   { t: "is", p, k }              p is a knight / knave
//   { t: "same", a, b } / "diff"   a and b are the same / different kinds
//   { t: "count", op, c, k }       exactly / at least / at most c of us are knights (k) / knaves
//   { t: "and" | "or" | "if", l, r }   l, r are "is" statements
//   { t: "says", p, s }            p would say s (s is an "is" statement)

const KK_SPEC = {
  easy: { n: 2, kinds: ["is", "same", "diff", "count", "and"], speakers: [1, 2] },
  medium: { n: 3, kinds: ["is", "same", "diff", "count", "and", "or"], speakers: [2, 3] },
  hard: { n: 4, kinds: ["same", "diff", "count", "and", "or", "if", "is"], speakers: [4, 4] },
  expert: { n: 5, kinds: ["count", "and", "or", "if", "says", "same", "diff"], speakers: [5, 5] },
};

function kkValue(s, A) {
  switch (s.t) {
    case "is": return A[s.p] === s.k;
    case "same": return A[s.a] === A[s.b];
    case "diff": return A[s.a] !== A[s.b];
    case "count": {
      const knights = A.filter(Boolean).length;
      const c = s.k ? knights : A.length - knights;
      return s.op === "eq" ? c === s.c : s.op === "ge" ? c >= s.c : c <= s.c;
    }
    case "and": return kkValue(s.l, A) && kkValue(s.r, A);
    case "or": return kkValue(s.l, A) || kkValue(s.r, A);
    case "if": return !kkValue(s.l, A) || kkValue(s.r, A);
    case "says": return A[s.p] === kkValue(s.s, A); // a knight says what is true, a knave what is false
    default: throw new Error(`bad statement ${s.t}`);
  }
}

// All knight/knave assignments (arrays of booleans) consistent with the statements.
function kkSolve(n, said) {
  const sols = [];
  for (let m = 0; m < 1 << n; m++) {
    const A = [...Array(n)].map((_, i) => Boolean(m & (1 << i)));
    if (said.every((s, i) => s === null || A[i] === kkValue(s, A))) sols.push(A);
  }
  return sols;
}

function otherThan(rng, n, ...not) {
  let p;
  do p = rng.int(0, n - 1); while (not.includes(p));
  return p;
}

function kkRandomStatement(rng, kind, n, sp) {
  const isAbout = (p) => ({ t: "is", p, k: rng.next() < 0.5 });
  switch (kind) {
    case "is": return isAbout(otherThan(rng, n, sp));
    case "same":
    case "diff": {
      const a = rng.next() < 0.6 ? sp : otherThan(rng, n, sp);
      return { t: kind, a, b: otherThan(rng, n, a) };
    }
    case "count": {
      const op = n === 2 ? "eq" : rng.pick(["eq", "eq", "ge", "le"]);
      let c;
      if (op === "eq") c = rng.int(0, n);
      else if (op === "ge") c = rng.int(1, n - 1);
      else c = rng.int(1, n - 1);
      return { t: "count", op, c, k: rng.next() < 0.5 };
    }
    case "and":
    case "or":
    case "if": {
      const p1 = rng.next() < 0.5 ? sp : otherThan(rng, n, sp);
      const p2 = otherThan(rng, n, p1);
      return { t: kind, l: isAbout(p1), r: isAbout(p2) };
    }
    case "says": {
      const p = otherThan(rng, n, sp);
      return { t: "says", p, s: isAbout(otherThan(rng, n, p)) };
    }
    default: throw new Error(kind);
  }
}

const kindWord = (k) => (k ? "knight" : "knave");

// A clause as `sp` would say it ("I am a knave", "Ben and I are the same kind").
function kkClause(s, sp, names, n) {
  const who = (p) => (p === sp ? "I" : names[p]);
  switch (s.t) {
    case "is": return s.p === sp ? `I am a ${kindWord(s.k)}` : `${names[s.p]} is a ${kindWord(s.k)}`;
    case "same":
    case "diff": {
      const tail = s.t === "same" ? "the same kind" : "different kinds";
      if (s.a === sp) return `${names[s.b]} and I are ${tail}`;
      if (s.b === sp) return `${names[s.a]} and I are ${tail}`;
      return `${who(s.a)} and ${who(s.b)} are ${tail}`;
    }
    case "count": {
      const noun = kindWord(s.k);
      if (s.op === "eq") {
        if (s.c === 0) return n === 2 ? `neither of us is a ${noun}` : `none of us is a ${noun}`;
        if (s.c === n) return n === 2 ? `we are both ${noun}s` : `all of us are ${noun}s`;
        return `exactly ${WORDS[s.c]} of us ${s.c === 1 ? `is a ${noun}` : `are ${noun}s`}`;
      }
      const lead = s.op === "ge" ? "at least" : "at most";
      return `${lead} ${WORDS[s.c]} of us ${s.c === 1 ? `is a ${noun}` : `are ${noun}s`}`;
    }
    case "and": return `${kkClause(s.l, sp, names, n)} and ${kkClause(s.r, sp, names, n)}`;
    case "or": return `${kkClause(s.l, sp, names, n)} or ${kkClause(s.r, sp, names, n)}`;
    case "if": return `if ${kkClause(s.l, sp, names, n)}, then ${kkClause(s.r, sp, names, n)}`;
    case "says": return `${names[s.p]} would say that ${kkClause(s.s, sp, names, n)}`;
    default: throw new Error(s.t);
  }
}

const mentionsSelf = (s, sp) =>
  s.t === "is" ? s.p === sp
    : s.t === "same" || s.t === "diff" ? s.a === sp || s.b === sp
      : s.t === "count" ? true
        : s.t === "says" ? s.p === sp || mentionsSelf(s.s, sp)
          : mentionsSelf(s.l, sp) || mentionsSelf(s.r, sp);

function genKnights(difficulty, rng) {
  const spec = KK_SPEC[difficulty];
  const n = spec.n;
  const names = pickNames(rng, n);
  let said, sol;
  for (let tries = 0; tries < 5000; tries++) {
    const k = rng.int(spec.speakers[0], spec.speakers[1]);
    const speakers = rng.shuffle([...Array(n).keys()]).slice(0, k);
    said = [...Array(n)].map((_, i) => (speakers.includes(i) ? kkRandomStatement(rng, rng.pick(spec.kinds), n, i) : null));
    const sols = kkSolve(n, said);
    if (sols.length !== 1) continue;
    sol = sols[0];
    const knights = sol.filter(Boolean).length;
    // Expert is answered by listing the knights, so keep at least one knight and one knave.
    if (difficulty === "expert" && (knights === 0 || knights === n)) continue;
    // Hard/expert: every statement must matter (dropping any one gives more than one answer).
    if ((difficulty === "hard" || difficulty === "expert") &&
        said.some((s, i) => s && kkSolve(n, said.map((x, j) => (j === i ? null : x))).length === 1)) continue;
    break;
  }
  if (!sol) throw new Error("no unique knights puzzle");

  const lines = said.map((s, i) =>
    s ? `- **${names[i]}:** "${cap(kkClause(s, i, names, n))}."` : `- **${names[i]}** says nothing.`);
  const uses = (t) => said.some((s) => s && (s.t === t || (s.l && s.l.t === t)));
  const notes = [];
  if (uses("count")) notes.push(`"us" means ${n === 2 ? "both" : `all ${WORDS[n]}`} of them`);
  if (uses("or")) notes.push('"or" means at least one part is true');
  const intro = `On an island, everyone is either a **knight**, who always tells the truth, or a **knave**, who always lies. You meet ${WORDS[n]} islanders: ${listAnd(names)}.${notes.length ? ` (Here ${notes.join(", and ")}.)` : ""}`;
  const checks = said
    .map((s, i) => s && `- ${names[i]} is a ${kindWord(sol[i])}, and "${cap(kkClause(s, i, names, n))}" is ${kkValue(s, sol) ? "true" : "false"}, which fits.`)
    .filter(Boolean);
  const explanation = [
    `The only combination that fits every statement: ${names.map((nm, i) => `${nm} is a ${kindWord(sol[i])}`).join(", ")}.`,
    checks.join("\n"),
    `Each of the other ${(1 << n) - 1} combinations breaks at least one statement (a knight saying something false, or a knave saying something true).`,
  ].join("\n\n");

  const first = said.findIndex((s, i) => s && mentionsSelf(s, i));
  const hints = [
    "Suppose one person is a knight: then their statement is true. Suppose they are a knave: then it is false. Follow each case and look for a contradiction.",
    first >= 0
      ? `Start with ${names[first]}: the statement includes ${names[first]} too, so test it both ways (as a knight, then as a knave) and see which one can't work.`
      : `Start with ${names[said.findIndex(Boolean)]}'s statement and test both cases.`,
    `There are ${1 << n} possible combinations and exactly one fits. When you have one, re-read every statement with it as a check.`,
  ];
  const params = { kind: "kk", n, said };

  if (difficulty === "expert") {
    const knights = names.filter((_, i) => sol[i]);
    return {
      prompt: `${intro}\n\n${lines.join("\n")}\n\nBuild the list of the **knights**, in alphabetical order.`,
      answerType: "tiles",
      tiles: rng.shuffle(names.slice()),
      joiner: ", ",
      useAll: false,
      answer: knights.join(", "),
      explanation,
      hints,
      params: { ...params, names },
    };
  }
  const pid = ids(names);
  return {
    prompt: `${intro}\n\n${lines.join("\n")}\n\nWhat is each of them?`,
    answerType: "multi",
    parts: names.map((nm, i) => ({
      id: pid[i], label: nm, ask: `Is ${nm} a knight or a knave?`, answerType: "choice",
      answer: sol[i] ? "Knight" : "Knave", choices: ["Knight", "Knave"],
      hint: said[i] ? `Read ${nm}'s own statement and ask whether a knight could say it.` : `${nm} says nothing, so work out ${nm} from what the others say about ${nm}.`,
    })),
    explanation,
    hints,
    params: { ...params, names },
  };
}

// ======================================================================
// Ordering puzzles
// ======================================================================
// Clues: first/last/pos/notFirst/notLast (x), before/dir/adj/notAdj (x, y), gap (x, y, k).

const ORDER_SPEC = {
  easy: { n: 3, types: ["first", "last", "before", "dir"] },
  medium: { n: 4, types: ["first", "last", "pos", "before", "dir", "notFirst", "notLast"] },
  hard: { n: 5, types: ["pos", "before", "dir", "adj", "notAdj", "gap", "notFirst", "notLast"] },
  expert: { n: 6, types: ["before", "dir", "adj", "notAdj", "gap", "notFirst", "notLast"] },
};

const SETTINGS = [
  {
    id: "race",
    intro: (w, names) => `${cap(w)} friends ran a race: ${listAnd(names)}. There were no ties.`,
    ask: "Put them in finishing order, first to last.",
    askPos: (k) => `Who finished ${ORD[k]}?`,
    first: (x) => `${x} won the race.`,
    last: (x) => `${x} finished last.`,
    pos: (x, k) => `${x} finished ${ORD[k]}.`,
    notFirst: (x) => `${x} did not win.`,
    notLast: (x) => `${x} did not finish last.`,
    before: (x, y) => `${x} finished somewhere ahead of ${y}.`,
    dir: (x, y) => `${x} finished directly ahead of ${y}.`,
    adj: (x, y) => `${x} and ${y} finished in consecutive places.`,
    notAdj: (x, y) => `${x} and ${y} did not finish in consecutive places.`,
    gap: (x, y, k) => `Exactly ${WORDS[k]} ${k === 1 ? "runner" : "runners"} finished between ${x} and ${y}.`,
  },
  {
    id: "queue",
    intro: (w, names) => `${cap(w)} people stand in a single queue: ${listAnd(names)}.`,
    ask: "Give the queue from front to back.",
    askPos: (k) => `Who is ${ORD[k]} in the queue, counting from the front?`,
    first: (x) => `${x} is at the front.`,
    last: (x) => `${x} is at the back.`,
    pos: (x, k) => `${x} is ${ORD[k]} from the front.`,
    notFirst: (x) => `${x} is not at the front.`,
    notLast: (x) => `${x} is not at the back.`,
    before: (x, y) => `${x} is somewhere in front of ${y}.`,
    dir: (x, y) => `${x} is directly in front of ${y}.`,
    adj: (x, y) => `${x} and ${y} stand next to each other.`,
    notAdj: (x, y) => `${x} and ${y} do not stand next to each other.`,
    gap: (x, y, k) => `There ${k === 1 ? "is exactly one person" : `are exactly ${WORDS[k]} people`} between ${x} and ${y}.`,
  },
];

// pos[x] = place of person x (0 = first).
function clueHolds(c, pos, n) {
  switch (c.t) {
    case "first": return pos[c.x] === 0;
    case "last": return pos[c.x] === n - 1;
    case "pos": return pos[c.x] === c.k;
    case "notFirst": return pos[c.x] !== 0;
    case "notLast": return pos[c.x] !== n - 1;
    case "before": return pos[c.x] < pos[c.y];
    case "dir": return pos[c.y] === pos[c.x] + 1;
    case "adj": return Math.abs(pos[c.x] - pos[c.y]) === 1;
    case "notAdj": return Math.abs(pos[c.x] - pos[c.y]) !== 1;
    case "gap": return Math.abs(pos[c.x] - pos[c.y]) === c.k + 1;
    default: throw new Error(c.t);
  }
}

function orderSolutions(n, clues) {
  const out = [];
  for (const order of PERMS[n]) {
    const pos = [];
    order.forEach((p, i) => { pos[p] = i; });
    if (clues.every((c) => clueHolds(c, pos, n))) out.push(order);
  }
  return out;
}

function trueClues(order, types) {
  const n = order.length;
  const pos = [];
  order.forEach((p, i) => { pos[p] = i; });
  const out = [];
  for (let x = 0; x < n; x++) {
    if (types.includes("first") && pos[x] === 0) out.push({ t: "first", x });
    if (types.includes("last") && pos[x] === n - 1) out.push({ t: "last", x });
    if (types.includes("pos") && pos[x] !== 0 && pos[x] !== n - 1) out.push({ t: "pos", x, k: pos[x] });
    if (types.includes("notFirst") && pos[x] !== 0) out.push({ t: "notFirst", x });
    if (types.includes("notLast") && pos[x] !== n - 1) out.push({ t: "notLast", x });
    for (let y = 0; y < n; y++) {
      if (y === x) continue;
      const d = pos[y] - pos[x];
      if (types.includes("before") && d > 1) out.push({ t: "before", x, y });
      if (types.includes("dir") && d === 1) out.push({ t: "dir", x, y });
      if (x < y) {
        if (types.includes("adj") && Math.abs(d) === 1) out.push({ t: "adj", x, y });
        if (types.includes("notAdj") && Math.abs(d) > 1) out.push({ t: "notAdj", x, y });
        if (types.includes("gap") && Math.abs(d) > 1) out.push({ t: "gap", x, y, k: Math.abs(d) - 1 });
      }
    }
  }
  return out;
}

function clueText(c, setting, names) {
  const f = setting[c.t];
  if (c.t === "gap") return f(names[c.x], names[c.y], c.k);
  if (c.t === "pos") return f(names[c.x], c.k);
  return c.y === undefined ? f(names[c.x]) : f(names[c.x], names[c.y]);
}

function genOrdering(difficulty, rng) {
  const spec = ORDER_SPEC[difficulty];
  const n = spec.n;
  const names = pickNames(rng, n);
  const setting = rng.pick(SETTINGS);
  const askChoice = (difficulty === "medium" || difficulty === "hard") && rng.next() < 0.35;
  let order, clues;
  for (let tries = 0; tries < 200; tries++) {
    order = rng.shuffle([...Array(n).keys()]);
    const pool = rng.shuffle(trueClues(order, spec.types));
    clues = [];
    for (const c of pool) {
      clues.push(c);
      if (orderSolutions(n, clues).length === 1) break;
    }
    if (orderSolutions(n, clues).length !== 1) continue;
    // Drop clues that aren't needed, so every clue matters.
    for (let i = clues.length - 1; i >= 0; i--) {
      const without = clues.filter((_, j) => j !== i);
      if (orderSolutions(n, without).length === 1) clues = without;
    }
    if (difficulty === "expert" && clues.length < 5) continue;
    // Medium/hard should need at least one relative clue, not only fixed places.
    if (difficulty !== "easy" && clues.every((c) => c.y === undefined)) continue;
    break;
  }
  // A "Who is kth?" question never asks about a place a clue states outright.
  const placeOf = (c) => (c.t === "first" ? 0 : c.t === "last" ? n - 1 : c.t === "pos" ? c.k : -1);
  const open = [...Array(n).keys()].filter((k) => !clues.some((c) => placeOf(c) === k));
  const askK = askChoice ? rng.pick(open) : -1;
  const clueLines = rng.shuffle(clues).map((c) => `- ${clueText(c, setting, names)}`);
  const orderNames = order.map((p) => names[p]);
  const fixed = clues.filter((c) => c.t === "first" || c.t === "last" || c.t === "pos");
  const blocks = clues.filter((c) => c.t === "dir" || c.t === "adj" || c.t === "gap");
  const hints = [
    `Draw ${WORDS[n]} places in a row, 1st to ${ORD[n - 1]}.`,
    fixed.length
      ? `Fill in the clues that fix a place first: ${fixed.map((c) => `"${clueText(c, setting, names)}"`).join(" ")}`
      : blocks.length
        ? `No clue fixes a place, so start with the ones that tie two people together, like "${clueText(blocks[0], setting, names)}" Treat that pair as a block and try each place it could go.`
        : "No clue fixes a place: use the \"ahead of\" clues to find who must come before everyone else.",
    "Try the remaining people in the gaps and cross out any arrangement that breaks a \"not\" clue. Exactly one arrangement is left.",
  ];
  const explanation = [
    `The only order that fits: ${orderNames.map((nm, i) => `${ORD[i]} ${nm}`).join(", ")}.`,
    `Check each clue against it:\n${clues.map((c) => `- ${clueText(c, setting, names)} ✓`).join("\n")}`,
  ].join("\n\n");
  const prompt = `${setting.intro(WORDS[n], names)}\n\n${clueLines.join("\n")}\n\n`;
  const params = { kind: "order", n, clues, names, setting: setting.id };
  if (askChoice) {
    return {
      prompt: prompt + setting.askPos(askK),
      answerType: "choice",
      choices: rng.shuffle(names.slice()),
      answer: orderNames[askK],
      explanation,
      hints,
      params: { ...params, askK },
    };
  }
  return {
    prompt: prompt + setting.ask,
    answerType: "tiles",
    tiles: rng.shuffle(names.slice()),
    joiner: ", ",
    useAll: true,
    answer: orderNames.join(", "),
    explanation,
    hints,
    params,
  };
}

// ======================================================================
// Whodunit: one culprit, statements, a rule about who lies
// ======================================================================
// Statements (sp = speaker): notMe, did x, didnt x, either x y, notMeNot x, lying x, truthful x.
// Rules: { t: "liars", k } exactly k statements are false; { t: "culpritPlusOne" } the culprit lies
// and exactly one innocent suspect lies too.

const WHO_SPEC = {
  easy: { n: 3, kinds: ["notMe", "did", "didnt"], rules: [{ t: "liars", k: 1 }] },
  medium: { n: 4, kinds: ["notMe", "did", "didnt", "either", "notMeNot"], rules: [{ t: "liars", k: 1 }, { t: "liars", k: 3 }] },
  hard: { n: 5, kinds: ["notMe", "did", "didnt", "either", "notMeNot", "lying"], rules: [{ t: "liars", k: 2 }, { t: "liars", k: 3 }] },
  expert: { n: 5, kinds: ["did", "didnt", "either", "notMeNot", "lying", "truthful"], rules: [{ t: "culpritPlusOne" }] },
};

const CRIMES = [
  "ate the last biscuit",
  "broke the vase",
  "left the gate open",
  "took the last slice of cake",
  "spilled paint on the rug",
  "hid the TV remote",
];

function whoValue(s, sp, c, T) {
  switch (s.t) {
    case "notMe": return c !== sp;
    case "did": return c === s.x;
    case "didnt": return c !== s.x;
    case "either": return c === s.x || c === s.y;
    case "notMeNot": return c !== sp && c !== s.x;
    case "lying": return !T[s.x];
    case "truthful": return T[s.x];
    default: throw new Error(s.t);
  }
}

function ruleHolds(rule, c, T) {
  const liars = T.filter((v) => !v).length;
  if (rule.t === "liars") return liars === rule.k;
  return !T[c] && liars === 2;
}

// Solutions as { c, T } (culprit + which statements are true).
function whoSolve(n, said, rule) {
  const out = [];
  for (let c = 0; c < n; c++) {
    for (let m = 0; m < 1 << n; m++) {
      const T = [...Array(n)].map((_, i) => Boolean(m & (1 << i)));
      if (said.every((s, i) => whoValue(s, i, c, T) === T[i]) && ruleHolds(rule, c, T)) out.push({ c, T });
    }
  }
  return out;
}

function whoRandom(rng, kind, n, sp) {
  switch (kind) {
    case "notMe": return { t: "notMe" };
    case "did":
    case "didnt":
    case "notMeNot": return { t: kind, x: otherThan(rng, n, sp) };
    case "either": {
      const x = otherThan(rng, n, sp);
      const y = otherThan(rng, n, sp, x);
      return { t: "either", x: Math.min(x, y), y: Math.max(x, y) };
    }
    case "lying":
    case "truthful": return { t: kind, x: otherThan(rng, n, sp) };
    default: throw new Error(kind);
  }
}

function whoText(s, names) {
  switch (s.t) {
    case "notMe": return "It wasn't me.";
    case "did": return `${names[s.x]} did it.`;
    case "didnt": return `${names[s.x]} didn't do it.`;
    case "either": return `It was ${names[s.x]} or ${names[s.y]}.`;
    case "notMeNot": return `It wasn't me, and it wasn't ${names[s.x]}.`;
    case "lying": return `${names[s.x]} is lying.`;
    case "truthful": return `${names[s.x]} is telling the truth.`;
    default: throw new Error(s.t);
  }
}

function ruleText(rule, n) {
  if (rule.t === "liars") {
    if (rule.k === n - 1) return "Exactly one of them is telling the truth; the rest are lying.";
    return `Exactly ${WORDS[rule.k]} of them ${rule.k === 1 ? "is" : "are"} lying; the rest tell the truth.`;
  }
  return "The culprit is lying, and exactly one of the innocent suspects is lying too. Everyone else tells the truth.";
}

function genWhodunit(difficulty, rng) {
  const spec = WHO_SPEC[difficulty];
  const n = spec.n;
  const names = pickNames(rng, n);
  const crime = rng.pick(CRIMES);
  const rule = rng.pick(spec.rules);
  let said, sol;
  for (let tries = 0; tries < 5000; tries++) {
    said = [...Array(n)].map((_, i) => whoRandom(rng, rng.pick(spec.kinds), n, i));
    if (difficulty !== "easy" && new Set(said.map((s) => s.t)).size < 3) continue;
    if ((difficulty === "hard" || difficulty === "expert") && !said.some((s) => s.t === "lying" || s.t === "truthful")) continue;
    const sols = whoSolve(n, said, rule);
    if (sols.length === 1) { sol = sols[0]; break; }
  }
  if (!sol) throw new Error("no unique whodunit");

  const lines = said.map((s, i) => `- **${names[i]}:** "${whoText(s, names)}"`);
  const prompt = `Someone ${crime}. It was one of these ${WORDS[n]}, and each of them makes one statement.\n\n${lines.join("\n")}\n\n${ruleText(rule, n)}`;
  const meta = said.some((s) => s.t === "lying" || s.t === "truthful");
  // Per suspect: what happens if they did it.
  const liarText = (T) => {
    const liars = names.filter((_, i) => !T[i]);
    return liars.length ? `${listAnd(liars)} ${liars.length === 1 ? "would be the only liar" : `would be lying (${WORDS[liars.length]})`}` : "nobody would be lying";
  };
  const cases = [...Array(n).keys()].map((c) => {
    if (c === sol.c) return `- Suppose ${names[c]} did it: ${liarText(sol.T)}, which fits the rule.`;
    // Truth patterns that match the statements for this culprit, before the rule is applied.
    const fits = [];
    for (let m = 0; m < 1 << n; m++) {
      const T = [...Array(n)].map((_, i) => Boolean(m & (1 << i)));
      if (said.every((s, i) => whoValue(s, i, c, T) === T[i])) fits.push(T);
    }
    if (fits.length === 1) return `- Suppose ${names[c]} did it: ${liarText(fits[0])}, which breaks the rule.`;
    if (!fits.length) return `- Suppose ${names[c]} did it: the statements about lying contradict each other, so this can't happen.`;
    return `- Suppose ${names[c]} did it: the statements allow ${WORDS[fits.length] || fits.length} patterns of liars, and none of them fits the rule.`;
  });
  const explanation = [
    "Try each suspect as the culprit and see which statements become true or false.",
    cases.join("\n"),
    `So it was **${names[sol.c]}**.`,
  ].join("\n\n");
  const hints = [
    "Go through the suspects one at a time: suppose that person did it, and mark each statement true or false.",
    meta
      ? `${names[said.findIndex((s) => s.t === "lying" || s.t === "truthful")]}'s statement is about another statement: decide that other statement first, then this one follows (a claim that someone is lying is true exactly when they are lying).`
      : "Count how many statements are false in each case and compare with the rule.",
    `Only one suspect makes the number of liars match the rule.`,
  ];
  const params = { kind: "who", n, said, rule, names };
  if (difficulty === "expert") {
    const other = sol.T.findIndex((v, i) => !v && i !== sol.c);
    return {
      prompt: `${prompt}\n\nWho did it, and who is the other liar?`,
      answerType: "multi",
      parts: [
        { id: "culprit", label: "Culprit", ask: "Who did it?", answerType: "choice", answer: names[sol.c], choices: rng.shuffle(names.slice()),
          hint: "The culprit must be one of the two liars, so their own statement is false." },
        { id: "liar", label: "Other liar", ask: "Which innocent suspect is also lying?", answerType: "choice", answer: names[other], choices: rng.shuffle(names.slice()),
          hint: "Once you know the culprit, mark every statement true or false: the false one that isn't the culprit's is the answer." },
      ],
      explanation: `${explanation} The other liar is **${names[other]}**.`,
      hints,
      params,
    };
  }
  return {
    prompt: `${prompt}\n\nWho did it?`,
    answerType: "choice",
    choices: rng.shuffle(names.slice()),
    answer: names[sol.c],
    explanation,
    hints,
    params,
  };
}

// ======================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!KK_SPEC[difficulty]) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "knights-knaves") return genKnights(difficulty, rng);
  if (subtopic === "ordering") return genOrdering(difficulty, rng);
  if (subtopic === "whodunit") return genWhodunit(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ======================================================================
// verify: re-solve by brute force with a separate interpreter
// ======================================================================

function vTruth(st, world) {
  // world: array of "K" / "N"
  const kn = (p) => world[p] === "K";
  if (st.t === "is") return kn(st.p) === st.k;
  if (st.t === "same" || st.t === "diff") return (kn(st.a) === kn(st.b)) === (st.t === "same");
  if (st.t === "count") {
    let c = 0;
    for (const w of world) if ((w === "K") === st.k) c++;
    if (st.op === "eq") return c === st.c;
    if (st.op === "ge") return c >= st.c;
    if (st.op === "le") return c <= st.c;
    return null;
  }
  if (st.t === "and") return vTruth(st.l, world) && vTruth(st.r, world);
  if (st.t === "or") return vTruth(st.l, world) || vTruth(st.r, world);
  if (st.t === "if") return vTruth(st.l, world) ? vTruth(st.r, world) : true;
  if (st.t === "says") {
    const inner = vTruth(st.s, world);
    return kn(st.p) ? inner : !inner;
  }
  return null;
}

function vWorlds(n) {
  let ws = [[]];
  for (let i = 0; i < n; i++) ws = ws.flatMap((w) => [[...w, "K"], [...w, "N"]]);
  return ws;
}

function verifyKnights(p, question, answer) {
  const good = vWorlds(p.n).filter((w) => p.said.every((st, i) => st === null || vTruth(st, w) === (w[i] === "K")));
  if (good.length !== 1) return false;
  const w = good[0];
  if (question.answerType === "tiles") {
    const want = p.names.filter((_, i) => w[i] === "K");
    if (!want.length || want.length === p.n) return false;
    return String(answer) === want.join(", ");
  }
  if (!answer || typeof answer !== "object") return false;
  const pid = p.names.map((nm) => nm.toLowerCase());
  return pid.every((id, i) => answer[id] === (w[i] === "K" ? "Knight" : "Knave"));
}

function vClueOk(cl, place, n) {
  const a = place[cl.x];
  const b = cl.y === undefined ? null : place[cl.y];
  switch (cl.t) {
    case "first": return a === 1;
    case "last": return a === n;
    case "pos": return a === cl.k + 1;
    case "notFirst": return a !== 1;
    case "notLast": return a !== n;
    case "before": return a < b;
    case "dir": return b - a === 1;
    case "adj": return a - b === 1 || b - a === 1;
    case "notAdj": return !(a - b === 1 || b - a === 1);
    case "gap": return Math.max(a, b) - Math.min(a, b) - 1 === cl.k;
    default: return false;
  }
}

function verifyOrder(p, question, answer) {
  const n = p.n;
  const found = [];
  // Assign 1-based places by counting through all n^n place vectors that are permutations.
  const place = Array(n).fill(0);
  const rec = (i, used) => {
    if (i === n) {
      if (p.clues.every((cl) => vClueOk(cl, place, n))) found.push(place.slice());
      return;
    }
    for (let v = 1; v <= n; v++) {
      if (used & (1 << v)) continue;
      place[i] = v;
      rec(i + 1, used | (1 << v));
    }
  };
  rec(0, 0);
  if (found.length !== 1) return false;
  const byPlace = [];
  found[0].forEach((v, person) => { byPlace[v - 1] = p.names[person]; });
  if (question.answerType === "choice") {
    if (!question.choices.includes(String(answer))) return false;
    return String(answer) === byPlace[p.askK];
  }
  if (question.answerType === "tiles" && question.tiles.length !== n) return false;
  return String(answer) === byPlace.join(", ");
}

function vStatementTrue(st, speaker, culprit, truth) {
  if (st.t === "notMe") return culprit !== speaker;
  if (st.t === "did") return culprit === st.x;
  if (st.t === "didnt") return culprit !== st.x;
  if (st.t === "either") return [st.x, st.y].includes(culprit);
  if (st.t === "notMeNot") return ![speaker, st.x].includes(culprit);
  if (st.t === "lying") return truth[st.x] === false;
  if (st.t === "truthful") return truth[st.x] === true;
  return null;
}

function verifyWho(p, question, answer) {
  const n = p.n;
  const found = [];
  for (let culprit = 0; culprit < n; culprit++) {
    for (const w of vWorlds(n)) {
      const truth = w.map((x) => x === "K"); // reuse: K = statement true
      if (!p.said.every((st, i) => vStatementTrue(st, i, culprit, truth) === truth[i])) continue;
      const liars = truth.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
      const ok = p.rule.t === "liars" ? liars.length === p.rule.k : liars.length === 2 && liars.includes(culprit);
      if (ok) found.push({ culprit, liars });
    }
  }
  if (found.length !== 1) return false;
  const f = found[0];
  if (question.answerType === "multi") {
    if (!answer || typeof answer !== "object") return false;
    const other = f.liars.find((i) => i !== f.culprit);
    return answer.culprit === p.names[f.culprit] && answer.liar === p.names[other];
  }
  if (!question.choices || !question.choices.includes(String(answer))) return false;
  return String(answer) === p.names[f.culprit];
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  try {
    if (p.kind === "kk") return verifyKnights(p, question, answer);
    if (p.kind === "order") return verifyOrder(p, question, answer);
    if (p.kind === "who") return verifyWho(p, question, answer);
  } catch {
    return false;
  }
  return false;
}
