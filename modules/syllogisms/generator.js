// Syllogisms generator: categorical syllogisms (All / No / Some / Some ... not) and if-then
// arguments. Uses only the seeded rng passed in by the engine.
//
// Validity is decided by brute force: categorical arguments over every Venn-diagram model
// (which regions are occupied, every group non-empty), conditionals over every truth table.
// verify() re-checks with a separately written evaluator.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const WORDS = ["none", "one", "two", "three", "four"];

// ======================================================================
// Categorical syllogisms
// ======================================================================

// Made-up nouns, so real-world knowledge can't help or mislead: [singular, plural].
const NOUNS = [
  ["zorb", "zorbs"], ["plink", "plinks"], ["wug", "wugs"], ["dax", "daxes"], ["blicket", "blickets"],
  ["florp", "florps"], ["glim", "glims"], ["tov", "tovs"], ["fendle", "fendles"], ["quib", "quibs"],
  ["morv", "morvs"], ["trel", "trels"], ["vorp", "vorps"], ["grob", "grobs"], ["snib", "snibs"],
  ["jex", "jexes"], ["kepp", "kepps"], ["yint", "yints"], ["harn", "harns"], ["pobble", "pobbles"],
];

// Statement: { f: "A" | "E" | "I" | "O", x, y } over term indexes.
const FORMS = ["A", "E", "I", "O"];
function stText(s, terms) {
  const X = terms[s.x][1];
  const Y = terms[s.y][1];
  if (s.f === "A") return `All ${X} are ${Y}.`;
  if (s.f === "E") return `No ${X} are ${Y}.`;
  if (s.f === "I") return `Some ${X} are ${Y}.`;
  return `Some ${X} are not ${Y}.`;
}
// Same key for statements that say the same thing ("No X are Y" = "No Y are X", likewise "Some ... are").
const stKey = (s) => (s.f === "E" || s.f === "I" ? `${s.f}${Math.min(s.x, s.y)}${Math.max(s.x, s.y)}` : `${s.f}${s.x}${s.y}`);
const quoted = (s, terms) => `"${stText(s, terms).slice(0, -1)}"`;

// Regions: bitmask r over T terms (bit t set = inside term t). A model is a bitmask over regions
// (which regions have at least one member).
function regionMask(T, pred) {
  let m = 0;
  for (let r = 0; r < 1 << T; r++) if (pred(r)) m |= 1 << r;
  return m;
}
const inT = (r, t) => (r >> t) & 1;

function stTest(s, T) {
  const both = regionMask(T, (r) => inT(r, s.x) && inT(r, s.y));
  const xNotY = regionMask(T, (r) => inT(r, s.x) && !inT(r, s.y));
  if (s.f === "A") return (M) => (M & xNotY) === 0;
  if (s.f === "E") return (M) => (M & both) === 0;
  if (s.f === "I") return (M) => (M & both) !== 0;
  return (M) => (M & xNotY) !== 0;
}

// Every model where each term is non-empty and every premise holds.
function catModels(T, premises) {
  const termMasks = [...Array(T).keys()].map((t) => regionMask(T, (r) => inT(r, t)));
  const tests = premises.map((p) => stTest(p, T));
  const out = [];
  const total = 2 ** (1 << T);
  for (let M = 0; M < total; M++) {
    if (!termMasks.every((tm) => (M & tm) !== 0)) continue;
    if (tests.every((f) => f(M))) out.push(M);
  }
  return out;
}

const follows = (models, s, T) => {
  const f = stTest(s, T);
  return models.length > 0 && models.every((M) => f(M));
};

// Smallest model where the premises hold but the conclusion fails (a counter-example).
function counterExample(models, s, T) {
  const f = stTest(s, T);
  const bad = models.filter((M) => !f(M));
  const pop = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };
  bad.sort((a, b) => pop(a) - pop(b) || a - b);
  return bad[0];
}

function regionText(r, T, terms) {
  const yes = [];
  const no = [];
  for (let t = 0; t < T; t++) (inT(r, t) ? yes : no).push(terms[t][0]);
  const art = (w) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
  let s = `something that is ${yes.map(art).join(" and ")}`;
  if (no.length) s += ` but not ${no.map(art).join(" or ")}`;
  return s;
}

function counterText(M, T, terms) {
  const rs = [];
  for (let r = 1; r < 1 << T; r++) if ((M >> r) & 1) rs.push(regionText(r, T, terms));
  return `Counter-example: imagine the only things are ${rs.length > 1 ? `${rs.slice(0, -1).join("; ")}; and ${rs[rs.length - 1]}` : rs[0]}. Every premise is true there, but the conclusion is false.`;
}

// Why a valid conclusion holds, in words (from the parts the premises empty).
function validText(premises, concl, terms) {
  const P = (t) => terms[t][1];
  const lines = premises.map((p) => {
    if (p.f === "A") return `${quoted(p, terms)} means no ${terms[p.x][0]} is outside the ${P(p.y)}.`;
    if (p.f === "E") return `${quoted(p, terms)} means the ${P(p.x)} and the ${P(p.y)} don't overlap at all.`;
    if (p.f === "I") return `${quoted(p, terms)} means at least one thing is both.`;
    return `${quoted(p, terms)} means at least one ${terms[p.x][0]} is outside the ${P(p.y)}.`;
  });
  return `${lines.join(" ")} Put together, every diagram that fits the premises also makes ${quoted(concl, terms)} true (and every group has at least one member), so it must follow.`;
}

const CAT_NOTE = "Assume every group mentioned has at least one member. Judge only whether the conclusion **must** follow from the premises.";
const CAT_HINTS = [
  "Draw one circle per group. \"All X are Y\": the part of X outside Y is empty. \"No X are Y\": the overlap is empty.",
  "Then mark the \"some\" statements: \"Some X are Y\" puts something in the overlap; \"Some X are not Y\" puts something in X outside Y. If it could go in either of two parts, don't decide yet.",
  "A conclusion follows only if it is true in **every** diagram that fits the premises. Try to draw one where the premises hold and the conclusion fails.",
];

// Two premises linking S (0) and P (1) through M (2), in random orientation.
function threeTermPremises(rng, forms) {
  const p1 = rng.next() < 0.5 ? { x: 2, y: 1 } : { x: 1, y: 2 };
  const p2 = rng.next() < 0.5 ? { x: 0, y: 2 } : { x: 2, y: 0 };
  return [{ f: rng.pick(forms), ...p1 }, { f: rng.pick(forms), ...p2 }];
}

function pickTerms(rng, T) {
  return rng.shuffle(NOUNS.slice()).slice(0, T);
}

function catValidity(difficulty, rng) {
  const target = rng.next() < 0.5; // valid or invalid, about half each
  const forms = difficulty === "easy" ? ["A", "A", "E", "I"] : FORMS;
  const terms = pickTerms(rng, 3);
  let premises, concl, models;
  for (let tries = 0; tries < 500; tries++) {
    premises = threeTermPremises(rng, forms);
    concl = { f: rng.pick(forms), x: 0, y: 1 };
    if (difficulty !== "easy" && rng.next() < 0.3) concl = { f: concl.f, x: 1, y: 0 };
    models = catModels(3, premises);
    if (!models.length) continue;
    if (follows(models, concl, 3) === target) break;
  }
  const valid = follows(models, concl, 3);
  const lines = [`1. ${stText(premises[0], terms)}`, `2. ${stText(premises[1], terms)}`];
  return {
    prompt: `${CAT_NOTE}\n\n${lines.join("\n")}\n\n**Conclusion:** ${stText(concl, terms)}\n\nIs this argument valid?`,
    answerType: "choice",
    choices: ["Valid", "Invalid"],
    answer: valid ? "Valid" : "Invalid",
    explanation: valid ? `**Valid.** ${validText(premises, concl, terms)}` : `**Invalid.** ${counterText(counterExample(models, concl, 3), 3, terms)}`,
    hints: CAT_HINTS,
    params: { kind: "cat-valid", T: 3, premises, concl },
  };
}

// Every A/E/I/O statement between two different terms from `pairs`.
function candidates(pairs) {
  const out = [];
  for (const [x, y] of pairs) for (const f of FORMS) out.push({ f, x, y });
  return out;
}

const NONE = "None of these follows";

// Medium (3 terms) and expert (4-term chain): which conclusion follows?
function catWhich(difficulty, rng) {
  const T = difficulty === "expert" ? 4 : 3;
  const terms = pickTerms(rng, T);
  const wantNone = rng.next() < (difficulty === "expert" ? 0.2 : 0.25);
  let premises, models, valid, invalid;
  for (let tries = 0; tries < 500; tries++) {
    if (T === 3) {
      premises = threeTermPremises(rng, FORMS);
    } else {
      // Chain 0-1, 1-2, 2-3 in random orientation and order; the conclusion links 0 and 3.
      const links = [[0, 1], [1, 2], [2, 3]].map(([a, b]) => (rng.next() < 0.5 ? { x: a, y: b } : { x: b, y: a }));
      premises = rng.shuffle(links.map((l) => ({ f: rng.pick(["A", "A", "E", "I", "O"]), ...l })));
      // At most one particular ("some") premise, as in a classic chain argument.
      if (premises.filter((p) => p.f === "I" || p.f === "O").length > 1) continue;
    }
    models = catModels(T, premises);
    if (!models.length) continue;
    const ends = T === 3 ? [[0, 1], [1, 0]] : [[0, 3], [3, 0]];
    const cands = candidates(ends);
    valid = cands.filter((c) => follows(models, c, T));
    invalid = cands.filter((c) => !follows(models, c, T));
    if (wantNone ? valid.length === 0 : valid.length > 0) break;
  }
  if (!models || !models.length) throw new Error("no consistent premises");
  const answerSt = valid.length ? rng.pick(valid) : null;
  // Expert distractors may also link middle terms, which can be valid too: keep only invalid ones.
  let pool = invalid;
  if (T === 4) {
    const mids = candidates([[0, 2], [2, 0], [1, 3], [3, 1]]).filter((c) => !follows(models, c, T));
    pool = invalid.concat(mids);
  }
  const seen = new Set(answerSt ? [stKey(answerSt)] : []);
  const wrong = [];
  for (const c of rng.shuffle(pool)) {
    if (wrong.length === (valid.length ? 2 : 3)) break;
    if (seen.has(stKey(c))) continue;
    seen.add(stKey(c));
    wrong.push(c);
  }
  const options = valid.length ? [answerSt, ...wrong] : wrong;
  const texts = options.map((s) => stText(s, terms).replace(/\.$/, ""));
  const answer = answerSt ? texts[0] : NONE;
  const choices = rng.shuffle(texts).concat([NONE]);
  const lines = premises.map((p, i) => `${i + 1}. ${stText(p, terms)}`);
  const why = answerSt
    ? `**${answer}.** ${validText(premises, answerSt, terms)}`
    : `**${NONE}.** None of the conclusions about the ${terms[0][1]} and the ${terms[T === 3 ? 1 : 3][1]} is forced by the premises.`;
  const others = options
    .filter((s) => s !== answerSt)
    .map((s) => `- ${quoted(s, terms)} does not follow. ${counterText(counterExample(models, s, T), T, terms)}`);
  const hints = T === 4
    ? [
      CAT_HINTS[0],
      "Chain the premises: find the one that mentions the first group, then follow the shared group to the next premise, and so on.",
      "A \"some\" premise can only pass through an \"all\" link in the right direction: some X are Y and all Y are Z gives some X are Z. Test each option for a counter-example.",
    ]
    : CAT_HINTS;
  return {
    prompt: `${CAT_NOTE}\n\n${lines.join("\n")}\n\nWhich conclusion follows?`,
    answerType: "choice",
    choices,
    answer,
    explanation: `${why}\n\n${others.join("\n")}`,
    hints,
    params: { kind: "cat-which", T, premises, options, answerIdx: answerSt ? 0 : -1, terms: terms.map((t) => t[1]) },
  };
}

// Hard: three conclusions, judge each one.
function catMulti(rng) {
  const terms = pickTerms(rng, 3);
  let premises, models, picked;
  for (let tries = 0; tries < 500; tries++) {
    premises = threeTermPremises(rng, FORMS);
    models = catModels(3, premises);
    if (!models.length) continue;
    const prem = new Set(premises.map(stKey));
    const uniq = new Map();
    for (const c of candidates([[0, 1], [1, 0], [0, 2], [2, 0], [1, 2], [2, 1]])) if (!prem.has(stKey(c)) && !uniq.has(stKey(c))) uniq.set(stKey(c), c);
    const cands = rng.shuffle([...uniq.values()]);
    const yes = cands.filter((c) => follows(models, c, 3));
    const no = cands.filter((c) => !follows(models, c, 3));
    if (!yes.length || no.length < 2) continue;
    const nYes = yes.length >= 2 && rng.next() < 0.4 ? 2 : 1;
    picked = rng.shuffle(yes.slice(0, nYes).concat(no.slice(0, 3 - nYes)));
    break;
  }
  if (!picked) throw new Error("no hard syllogism");
  const lines = premises.map((p, i) => `${i + 1}. ${stText(p, terms)}`);
  const verdict = picked.map((c) => follows(models, c, 3));
  const exp = picked.map((c, i) => (verdict[i]
    ? `- **${stText(c, terms)}** Follows. ${validText(premises, c, terms)}`
    : `- **${stText(c, terms)}** Does not follow. ${counterText(counterExample(models, c, 3), 3, terms)}`));
  return {
    prompt: `${CAT_NOTE}\n\n${lines.join("\n")}\n\nDoes each conclusion follow?`,
    answerType: "multi",
    parts: picked.map((c, i) => ({
      id: `c${i + 1}`, label: `Conclusion ${i + 1}`, ask: stText(c, terms), answerType: "choice",
      choices: ["Follows", "Does not follow"], answer: verdict[i] ? "Follows" : "Does not follow",
      hint: "Look for a diagram where both premises are true but this statement is false. If you can't make one, it follows.",
    })),
    explanation: exp.join("\n"),
    hints: CAT_HINTS,
    params: { kind: "cat-multi", T: 3, premises, concls: picked },
  };
}

// ======================================================================
// Conditionals (propositional logic)
// ======================================================================

const ATOMS = [
  { pos: "it rains", neg: "it does not rain", label: "Rain" },
  { pos: "the match is cancelled", neg: "the match is not cancelled", label: "Match" },
  { pos: "the alarm rings", neg: "the alarm does not ring", label: "Alarm" },
  { pos: "the light is on", neg: "the light is off", label: "Light" },
  { pos: "the shop is open", neg: "the shop is closed", label: "Shop" },
  { pos: "Ava takes the bus", neg: "Ava does not take the bus", label: "Bus" },
  { pos: "the road is icy", neg: "the road is not icy", label: "Road" },
  { pos: "the printer has paper", neg: "the printer has no paper", label: "Printer" },
  { pos: "the gate is locked", neg: "the gate is unlocked", label: "Gate" },
  { pos: "the oven is hot", neg: "the oven is not hot", label: "Oven" },
  { pos: "the train is late", neg: "the train is on time", label: "Train" },
  { pos: "the dog barks", neg: "the dog does not bark", label: "Dog" },
  { pos: "the window is open", neg: "the window is shut", label: "Window" },
  { pos: "the fan is running", neg: "the fan is not running", label: "Fan" },
];

// Formulas: { v } atom, { not }, { and: [a, b] }, { or: [a, b] }, { imp: [a, b] }, { nand: [a, b] }.
const lit = (v, neg = false) => (neg ? { not: { v } } : { v });
function fEval(f, w) {
  if ("v" in f) return w[f.v];
  if (f.not) return !fEval(f.not, w);
  if (f.and) return fEval(f.and[0], w) && fEval(f.and[1], w);
  if (f.or) return fEval(f.or[0], w) || fEval(f.or[1], w);
  if (f.imp) return !fEval(f.imp[0], w) || fEval(f.imp[1], w);
  if (f.nand) return !(fEval(f.nand[0], w) && fEval(f.nand[1], w));
  throw new Error("bad formula");
}
function worlds(n) {
  const out = [];
  for (let m = 0; m < 1 << n; m++) out.push([...Array(n)].map((_, i) => Boolean(m & (1 << i))));
  return out;
}
const entails = (n, prem, c) => {
  const ws = worlds(n).filter((w) => prem.every((p) => fEval(p, w)));
  return ws.length > 0 && ws.every((w) => fEval(c, w));
};
const consistent = (n, prem) => worlds(n).some((w) => prem.every((p) => fEval(p, w)));
const equivalent = (n, a, b) => worlds(n).every((w) => fEval(a, w) === fEval(b, w));

// Literal text: { v } -> "it rains", { not: { v } } -> "it does not rain".
function litText(f, atoms) {
  return "v" in f ? atoms[f.v].pos : atoms[f.not.v].neg;
}
const negLit = (f) => ("v" in f ? { not: f } : f.not);

// A premise in words. `style` picks the phrasing: if / then, "only if", "unless", or / not both.
function premText(p, atoms) {
  const { f, style } = p;
  if (f.imp) {
    const [a, b] = f.imp;
    if (style === "onlyif") return `${cap(litText(a, atoms))} only if ${litText(b, atoms)}.`;
    if (style === "unless") return `${cap(litText(b, atoms))} unless ${litText(negLit(a), atoms)}.`; // ¬a' → b  where a = ¬a'
    if (style === "qif") return `${cap(litText(b, atoms))} if ${litText(a, atoms)}.`;
    return `If ${litText(a, atoms)}, then ${litText(b, atoms)}.`;
  }
  if (f.or) return `Either ${litText(f.or[0], atoms)} or ${litText(f.or[1], atoms)} (or both).`;
  if (f.nand) return `It is not the case that both ${litText(f.nand[0], atoms)} and ${litText(f.nand[1], atoms)}.`;
  return `${cap(litText(f, atoms))}.`;
}

const COND_NOTE = "Take every statement as true. \"A only if B\" means: if A, then B. \"A unless B\" means: if not B, then A.";

function pickAtoms(rng, n) {
  return rng.shuffle(ATOMS.slice()).slice(0, n);
}

// Easy: the four classic forms, valid or not.
const FORMS4 = [
  { id: "mp", fact: (a) => a, concl: (a, b) => b, valid: true, name: "affirming the antecedent (modus ponens)" },
  { id: "mt", fact: (a, b) => negLit(b), concl: (a) => negLit(a), valid: true, name: "denying the consequent (modus tollens)" },
  { id: "ac", fact: (a, b) => b, concl: (a) => a, valid: false, name: "affirming the consequent" },
  { id: "da", fact: (a) => negLit(a), concl: (a, b) => negLit(b), valid: false, name: "denying the antecedent" },
];

function condEasy(rng) {
  const atoms = pickAtoms(rng, 2);
  const form = rng.pick(FORMS4);
  const a = lit(0);
  const b = lit(1);
  const rule = { f: { imp: [a, b] }, style: "if" };
  const fact = { f: form.fact(a, b), style: "fact" };
  const concl = form.concl(a, b);
  const valid = entails(2, [rule.f, fact.f], concl);
  const hints = [
    `"If ${atoms[0].pos}, then ${atoms[1].pos}" only promises something when ${atoms[0].pos}.`,
    `Ask: could the two statements both be true while the conclusion is false? Try all four combinations of ${atoms[0].label.toLowerCase()} and ${atoms[1].label.toLowerCase()}.`,
  ];
  const why = valid
    ? `**Valid**: this is ${form.name}. In every case where both statements are true, the conclusion is true too.`
    : `**Invalid**: this is ${form.name}. The rule says nothing about what happens when ${atoms[0].neg}: ${form.id === "ac" ? `"${atoms[1].pos}" could have another cause` : `"${atoms[1].pos}" could still be true`}. Counter-example: ${atoms[0].neg}, and ${atoms[1].pos}. Both statements hold, but the conclusion is false.`;
  return {
    prompt: `${premText(rule, atoms)}\n\n${premText(fact, atoms)}\n\n**So:** ${cap(litText(concl, atoms))}.\n\nIs this argument valid?`,
    answerType: "choice",
    choices: ["Valid", "Invalid"],
    answer: valid ? "Valid" : "Invalid",
    explanation: why,
    hints,
    params: { kind: "cond-valid", n: 2, premises: [rule.f, fact.f], concl },
  };
}

// Medium: what follows from a rule and a fact, or which statement means the same.
function condMedium(rng) {
  const atoms = pickAtoms(rng, 2);
  if (rng.next() < 0.5) {
    const a = lit(0, rng.next() < 0.25);
    const b = lit(1, rng.next() < 0.25);
    const form = rng.pick(FORMS4);
    const style = rng.pick(["if", "if", "onlyif", "qif"]);
    const rule = { f: { imp: [a, b] }, style };
    const fact = { f: form.fact(a, b), style: "fact" };
    // The question is about the other atom.
    const askV = "v" in fact.f ? 1 - fact.f.v : 1 - fact.f.not.v;
    const yes = lit(askV);
    const no = lit(askV, true);
    const prem = [rule.f, fact.f];
    const opts = [
      { t: cap(litText(yes, atoms)), ok: entails(2, prem, yes) },
      { t: cap(litText(no, atoms)), ok: entails(2, prem, no) },
      { t: "Can't tell either way", ok: false },
    ];
    if (!opts[0].ok && !opts[1].ok) opts[2].ok = true;
    const answer = opts.find((o) => o.ok).t;
    return {
      prompt: `${COND_NOTE}\n\n${premText(rule, atoms)}\n\n${premText(fact, atoms)}\n\nWhat follows?`,
      answerType: "choice",
      choices: rng.shuffle(opts.map((o) => o.t)),
      answer,
      explanation: opts[2].ok
        ? `**Can't tell.** Both "${litText(yes, atoms)}" and "${litText(no, atoms)}" fit the two statements, so neither is forced.`
        : `**${answer}.** ${style === "onlyif" ? "\"Only if\" puts the condition after it: the" : "The"} rule is "if ${litText(a, atoms)}, then ${litText(b, atoms)}". In every case where both statements are true, ${answer.charAt(0).toLowerCase() + answer.slice(1)}.`,
      hints: [
        style === "onlyif"
          ? `Rewrite "${premText(rule, atoms).slice(0, -1)}" as an if-then: the part after "only if" goes after "then".`
          : `Write the rule as "if A, then B" and the fact as A, not A, B or not B.`,
        "If the fact matches the if-part, the then-part follows. If the fact denies the then-part, the if-part must be false. The other two cases tell you nothing.",
      ],
      params: { kind: "cond-which", n: 2, premises: prem, yes, no, texts: opts.map((o) => o.t) },
    };
  }
  // Equivalence: which statement means the same as "If P, then Q"?
  const a = lit(0);
  const b = lit(1);
  const base = { imp: [a, b] };
  const nA = negLit(a);
  const nB = negLit(b);
  const goods = [
    { f: { imp: [nB, nA] }, style: "if" },
    { f: { imp: [a, b] }, style: "onlyif" },
    { f: { imp: [nB, nA] }, style: "qif" },
  ];
  const bads = [
    { f: { imp: [b, a] }, style: "if" },
    { f: { imp: [nA, nB] }, style: "if" },
    { f: { imp: [b, a] }, style: "onlyif" },
    { f: { imp: [a, nB] }, style: "if" },
  ];
  const good = rng.pick(goods);
  const opts = [good, ...rng.shuffle(bads).slice(0, 3)];
  const texts = opts.map((o) => premText(o, atoms));
  return {
    prompt: `${COND_NOTE}\n\nWhich statement means exactly the same as:\n\n"${premText({ f: base, style: "if" }, atoms)}"`,
    answerType: "choice",
    choices: rng.shuffle(texts.slice()),
    answer: texts[0],
    explanation: `**${texts[0]}** ${good.style === "onlyif" ? `"A only if B" is another way to say "if A, then B".` : `This is the contrapositive: if the then-part is false, the if-part can't be true.`} The others swap or negate the parts (the converse "if ${atoms[1].pos}, then ${atoms[0].pos}" and the inverse "if ${atoms[0].neg}, then ${atoms[1].neg}" are different claims).`,
    hints: [
      "Rewrite every option as \"if …, then …\" (\"A only if B\" is \"if A, then B\").",
      "\"If A, then B\" is the same as \"if not B, then not A\". Swapping A and B, or negating both without swapping, changes the meaning.",
    ],
    params: { kind: "cond-equiv", n: 2, base, options: opts.map((o) => o.f), texts },
  };
}

// Clauses (lists of literals, at least one true) for a premise formula.
function clauseOf(f) {
  if (f.imp) return [negLit(f.imp[0]), f.imp[1]];
  if (f.or) return [f.or[0], f.or[1]];
  if (f.nand) return [negLit(f.nand[0]), negLit(f.nand[1])];
  return [f];
}

// Worked steps by unit propagation: when every literal of a clause but one is false, the last one
// must be true. Returns lines of text (empty when nothing can be pushed through).
function chainSteps(prems, atoms) {
  const known = new Map(); // atom -> boolean
  const litVal = (l) => {
    const v = "v" in l ? l.v : l.not.v;
    if (!known.has(v)) return undefined;
    return "v" in l ? known.get(v) : !known.get(v);
  };
  const lines = [];
  for (const p of prems) if (!p.f.imp && !p.f.or && !p.f.nand) known.set("v" in p.f ? p.f.v : p.f.not.v, "v" in p.f);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prems) {
      const cl = clauseOf(p.f);
      if (cl.length < 2) continue;
      const open = cl.filter((l) => litVal(l) === undefined);
      if (open.length !== 1 || cl.some((l) => litVal(l) === true)) continue;
      const l = open[0];
      known.set("v" in l ? l.v : l.not.v, "v" in l);
      const because = cl.filter((x) => x !== l).map((x) => litText(negLit(x), atoms));
      lines.push(`- ${cap(because.join(" and "))}, and "${premText(p, atoms).slice(0, -1)}", so **${litText(l, atoms)}**.`);
      changed = true;
    }
  }
  return lines;
}

function randImp(rng, x, y) {
  return { f: { imp: [lit(x, rng.next() < 0.3), lit(y, rng.next() < 0.3)] }, style: rng.pick(["if", "onlyif", "unless", "qif"]) };
}

// Hard: a chain of two rules and a fact; which statement must be true?
function condHard(rng) {
  const atoms = pickAtoms(rng, 3);
  for (let tries = 0; tries < 500; tries++) {
    const r1 = randImp(rng, 0, 1);
    const r2 = randImp(rng, 1, 2);
    const fv = rng.pick([0, 2]);
    const fact = { f: lit(fv, rng.next() < 0.5), style: "fact" };
    const prem = [r1.f, r2.f, fact.f];
    if (!consistent(3, prem)) continue;
    const askable = [0, 1, 2].filter((v) => v !== fv);
    const lits = askable.flatMap((v) => [lit(v), lit(v, true)]);
    const yes = lits.filter((l) => entails(3, prem, l));
    const no = lits.filter((l) => !entails(3, prem, l));
    const wantNone = rng.next() < 0.2;
    if (wantNone ? yes.length : !yes.length) continue;
    // Never offer a literal and its opposite where one is entailed... keep 3 non-entailed options.
    // Prefer the far end of the chain, so both rules are needed.
    const far = yes.filter((l) => ("v" in l ? l.v : l.not.v) === 2 - fv);
    const ans = yes.length ? (far.length && rng.next() < 0.75 ? far[0] : rng.pick(yes)) : null;
    const wrong = rng.shuffle(no).slice(0, ans ? 2 : 3);
    const opts = ans ? [ans, ...wrong] : wrong;
    const texts = opts.map((l) => cap(litText(l, atoms)));
    const NONEC = "None of these must be true";
    const answer = ans ? texts[0] : NONEC;
    const premLines = rng.shuffle([r1, r2]).concat([fact]).map((p) => premText(p, atoms));
    const asIf = [r1, r2].map((r) => `if ${litText(r.f.imp[0], atoms)}, then ${litText(r.f.imp[1], atoms)}`);
    return {
      prompt: `${COND_NOTE}\n\n${premLines.join("\n\n")}\n\nWhich of these must be true?`,
      answerType: "choice",
      choices: rng.shuffle(texts.slice()).concat([NONEC]),
      answer,
      explanation: `As if-then rules: "${asIf[0]}" and "${asIf[1]}".\n\n${ans ? `Start from the fact and apply the rules (forwards from an if-part, or backwards from a false then-part):\n${chainSteps([r1, r2, fact], atoms).join("\n")}` : "From the fact, neither rule can be applied (the fact matches no if-part and denies no then-part), so none of the options is forced."}\n\n${wrong.map((l) => `"${litText(l, atoms)}" can be false while every statement holds.`).join(" ")}`,
      hints: [
        "Rewrite each rule as \"if …, then …\". \"A only if B\" is \"if A, then B\"; \"A unless B\" is \"if not B, then A\".",
        "Start from the fact. A rule fires forwards when the fact matches its if-part, and backwards (the if-part is false) when the fact denies its then-part.",
        "Follow the chain one rule at a time. Anything you can't reach this way is not forced.",
      ],
      params: { kind: "cond-must", n: 3, premises: prem, options: opts, texts, none: !ans },
    };
  }
  throw new Error("no hard conditional");
}

// Expert: four facts linked by rules, "either/or" and "not both"; True / False / Can't tell for three.
function condExpert(rng) {
  const atoms = pickAtoms(rng, 4);
  const wantOpen = rng.next() < 0.4; // about 40% have one "Can't tell"
  for (let tries = 0; tries < 2000; tries++) {
    const order = rng.shuffle([0, 1, 2, 3]);
    const prems = [];
    // Three links along a random chain of the atoms, each a rule, an either/or, or a not-both.
    for (let i = 0; i < 3; i++) {
      const x = order[i];
      const y = order[i + 1];
      const kind = rng.pick(["imp", "imp", "or", "nand"]);
      if (kind === "imp") prems.push(randImp(rng, x, y));
      else if (kind === "or") prems.push({ f: { or: [lit(x, rng.next() < 0.3), lit(y, rng.next() < 0.3)] }, style: "or" });
      else prems.push({ f: { nand: [lit(x), lit(y)] }, style: "nand" });
    }
    const fv = rng.pick([order[0], order[3]]);
    const fact = { f: lit(fv, rng.next() < 0.5), style: "fact" };
    const all = prems.map((p) => p.f).concat([fact.f]);
    if (!consistent(4, all)) continue;
    const asked = order.filter((v) => v !== fv);
    const status = asked.map((v) => (entails(4, all, lit(v)) ? "True" : entails(4, all, lit(v, true)) ? "False" : "Can't tell"));
    const determined = status.filter((s) => s !== "Can't tell").length;
    if (determined < 2) continue;
    if (status.includes("Can't tell") !== wantOpen) continue;
    const lines = rng.shuffle(prems).concat([fact]).map((p) => premText(p, atoms));
    const parts = asked.map((v, i) => ({
      id: atoms[v].label.toLowerCase(), label: atoms[v].label, ask: `Is it true that ${atoms[v].pos}?`, answerType: "choice",
      choices: ["True", "False", "Can't tell"], answer: status[i],
      hint: `Find the statements that mention ${atoms[v].label.toLowerCase()} and see whether what you know already forces it one way.`,
    }));
    const exp = asked.map((v, i) => `- ${atoms[v].label}: **${status[i]}**. ${status[i] === "Can't tell"
      ? `Both "${atoms[v].pos}" and "${atoms[v].neg}" fit every statement.`
      : `In every case that fits all the statements, ${status[i] === "True" ? atoms[v].pos : atoms[v].neg}.`}`);
    const steps = chainSteps(prems.concat([fact]), atoms);
    return {
      prompt: `${COND_NOTE} "Either A or B (or both)" means at least one is true.\n\n${lines.join("\n\n")}\n\nFor each statement below, is it true, false, or can't you tell?`,
      answerType: "multi",
      parts,
      explanation: `Start from the fact (${litText(fact.f, atoms)}) and work along the statements one link at a time:\n${steps.join("\n")}\n\n${exp.join("\n")}`,
      hints: [
        "Rewrite the rules as \"if …, then …\". \"Either A or B\" is \"if not A, then B\"; \"not both A and B\" is \"if A, then not B\".",
        "Start from the fact and follow the links one at a time. Each link either forces the next fact or tells you nothing.",
        "\"Can't tell\" means both answers fit every statement: check by trying to build a case for each.",
      ],
      params: { kind: "cond-tf", n: 4, premises: all, asked },
    };
  }
  throw new Error("no expert conditional");
}

// ======================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "categorical") {
    if (difficulty === "easy") return catValidity("easy", rng);
    if (difficulty === "medium") return catWhich("medium", rng);
    if (difficulty === "hard") return rng.next() < 0.5 ? catMulti(rng) : catValidity("hard", rng);
    if (difficulty === "expert") return catWhich("expert", rng);
  }
  if (subtopic === "conditionals") {
    if (difficulty === "easy") return condEasy(rng);
    if (difficulty === "medium") return condMedium(rng);
    if (difficulty === "hard") return condHard(rng);
    if (difficulty === "expert") return condExpert(rng);
  }
  throw new Error(`Unknown cell: ${subtopic}/${difficulty}`);
}

// ======================================================================
// verify: an independent evaluator
// ======================================================================

// Categorical: a model is a list of "kinds of thing" (arrays of booleans, one per term).
function vKinds(T) {
  const out = [];
  for (let r = 1; r < 1 << T; r++) out.push([...Array(T)].map((_, t) => Boolean(r & (1 << t))));
  return out;
}
function vHolds(st, things) {
  let xy = false;
  let xNotY = false;
  for (const k of things) {
    if (!k[st.x]) continue;
    if (k[st.y]) xy = true;
    else xNotY = true;
  }
  if (st.f === "A") return !xNotY;
  if (st.f === "E") return !xy;
  if (st.f === "I") return xy;
  if (st.f === "O") return xNotY;
  return null;
}
// Returns { consistent, follows(st) } over every set of kinds where each term has a member.
// A set of kinds is an integer m (bit i = kind i is present); vHolds runs on the kinds present.
function vCat(T, premises) {
  const kinds = vKinds(T);
  const models = [];
  const present = [];
  for (let m = 1; m < 2 ** kinds.length; m++) {
    present.length = 0;
    for (let i = 0; i < kinds.length; i++) if ((m >> i) & 1) present.push(kinds[i]);
    let ok = true;
    for (let t = 0; t < T && ok; t++) if (!present.some((k) => k[t])) ok = false;
    if (ok && premises.every((p) => vHolds(p, present))) models.push(m);
  }
  const thingsOf = (m) => kinds.filter((_, i) => (m >> i) & 1);
  return { consistent: models.length > 0, follows: (st) => models.length > 0 && models.every((m) => vHolds(st, thingsOf(m))) };
}

const vText = (st, terms) => {
  const [X, Y] = [terms[st.x], terms[st.y]];
  return { A: `All ${X} are ${Y}`, E: `No ${X} are ${Y}`, I: `Some ${X} are ${Y}`, O: `Some ${X} are not ${Y}` }[st.f];
};

// Propositional: evaluate by recursion over a world given as a Set of true atoms.
function vVal(f, on) {
  if (typeof f.v === "number") return on.has(f.v);
  if (f.not) return !vVal(f.not, on);
  if (f.and) return f.and.every((g) => vVal(g, on));
  if (f.or) return f.or.some((g) => vVal(g, on));
  if (f.imp) return !vVal(f.imp[0], on) || vVal(f.imp[1], on);
  if (f.nand) return !f.nand.every((g) => vVal(g, on));
  throw new Error("bad");
}
function vSets(n) {
  const out = [];
  for (let m = 0; m < 1 << n; m++) out.push(new Set([...Array(n).keys()].filter((i) => (m >> i) & 1)));
  return out;
}
function vEntails(n, prem, c) {
  const ok = vSets(n).filter((on) => prem.every((p) => vVal(p, on)));
  return ok.length > 0 && ok.every((on) => vVal(c, on));
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  try {
    if (p.kind === "cat-valid") {
      const m = vCat(p.T, p.premises);
      if (!m.consistent) return false;
      return answer === (m.follows(p.concl) ? "Valid" : "Invalid");
    }
    if (p.kind === "cat-which") {
      const m = vCat(p.T, p.premises);
      if (!m.consistent) return false;
      const ok = p.options.map((st) => m.follows(st));
      // Exactly the answer option (or none, for "None of these follows") is valid.
      if (ok.filter(Boolean).length !== (p.answerIdx >= 0 ? 1 : 0)) return false;
      if (p.answerIdx >= 0 && !ok[p.answerIdx]) return false;
      if (question.choices.length !== new Set(question.choices).size) return false;
      const want = p.answerIdx >= 0 ? vText(p.options[p.answerIdx], p.terms) : NONE;
      return answer === want && question.choices.includes(want);
    }
    if (p.kind === "cat-multi") {
      const m = vCat(p.T, p.premises);
      if (!m.consistent || !answer || typeof answer !== "object") return false;
      return p.concls.every((c, i) => answer[`c${i + 1}`] === (m.follows(c) ? "Follows" : "Does not follow"));
    }
    if (p.kind === "cond-valid") return answer === (vEntails(p.n, p.premises, p.concl) ? "Valid" : "Invalid");
    if (p.kind === "cond-which") {
      const ey = vEntails(p.n, p.premises, p.yes);
      const en = vEntails(p.n, p.premises, p.no);
      if (ey && en) return false;
      const want = p.texts[ey ? 0 : en ? 1 : 2];
      return answer === want && question.choices.includes(want);
    }
    if (p.kind === "cond-equiv") {
      const same = p.options.map((o) => vSets(p.n).every((on) => vVal(o, on) === vVal(p.base, on)));
      if (same.filter(Boolean).length !== 1) return false;
      const want = p.texts[same.indexOf(true)];
      return answer === want && question.choices.includes(want);
    }
    if (p.kind === "cond-must") {
      const ok = p.options.map((l) => vEntails(p.n, p.premises, l));
      const NONEC = "None of these must be true";
      if (ok.filter(Boolean).length > 1 || !question.choices.includes(NONEC)) return false;
      const want = ok.includes(true) ? p.texts[ok.indexOf(true)] : NONEC;
      return answer === want && question.choices.includes(want);
    }
    if (p.kind === "cond-tf") {
      if (!answer || typeof answer !== "object") return false;
      return question.parts.every((part, i) => {
        const v = p.asked[i];
        const want = vEntails(p.n, p.premises, { v }) ? "True" : vEntails(p.n, p.premises, { not: { v } }) ? "False" : "Can't tell";
        return answer[part.id] === want;
      });
    }
  } catch {
    return false;
  }
  return false;
}
