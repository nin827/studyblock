import { fmtNum } from "../../js/lib/mathutil.js";

// Linguist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Hints and explanations use only values already drawn (no rng calls). verify() rebuilds the
// expected answers from the stored parameters with its own, separately written code.
//
// Subtopics (Editor: agreement-edit, readability; Translator: word-building, made-up-language):
//   agreement-edit    numbered words, one wrong: which word, the fix, the rule (segmented Rule | Fix)
//   readability       made-up Plain Index = ASL + 10 x ASW from word / sentence / syllable counts
//   word-building     build a word from stated pieces (spelling rules stated), meaning, word class;
//                     expert-plus decodes a coined word back into prefix | suffix and root
//   made-up-language  a made-up language with stated order, plural, past and negation rules
// Tiers: medium = 2 parts, hard = 3, expert = 3-4, expert-plus = 4 (hardest, backwards, judgement).
// English is British. Every rule a part depends on is stated in its prompt.

// ---------- helpers ----------

const TIER_IDS = ["medium", "hard", "expert", "expert-plus"];
const TRY = 20000;
const tooMany = () => { throw new Error("role-linguist: no suitable draw"); };
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const terminates = (v, dp) => Math.abs(v - Math.round(v * 10 ** dp) / 10 ** dp) < 1e-9;
const N = (v) => fmtNum(r6(v), 4);

const numPart = (id, label, ask, answer, hint) => ({ id, label, ask, answerType: "number", answer: r6(answer), tolerance: 0, hint });
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const textPart = (id, label, ask, answer, accepts, hint) => ({ id, label, ask, answerType: "text", answer, ...(accepts && accepts.length ? { accepts } : {}), hint });
const segPart = (id, label, ask, cols, answer, choices, hint) => ({ id, label, ask, answerType: "choice", choiceCols: cols, choices, answer, hint });

// Five segmented options: the answer, plus wrong ones of which one differs in both columns and one
// column repeats its wrong value three times, so the answer is not the most frequent in every column.
// `ok(option)` (optional) says whether a pair makes sense on its own; when given, the draw is redone
// (up to 50 times) until at least two wrong options make sense too, so the answer can't be found by
// spotting the only sensible pair. Without `ok` the rng draws are exactly one pass.
function segOptions(rng, ans, pools, ok = null) {
  const [A, B] = pools;
  for (let t = 0; ; t++) {
    const oa = rng.shuffle(A.filter((x) => x !== ans[0]));
    const ob = rng.shuffle(B.filter((x) => x !== ans[1]));
    const skew = rng.int(0, 1);
    const opts = skew === 0
      ? [ans, [oa[0], ans[1]], [oa[0], ob[0]], [oa[0], ob[1]], [ans[0], ob[1]]]
      : [ans, [ans[0], ob[0]], [oa[0], ob[0]], [oa[1], ob[0]], [oa[1], ans[1]]];
    if (!ok || t >= 50 || opts.slice(1).filter(ok).length >= 2) return rng.shuffle(opts);
  }
}

// ================= agreement-edit =================

const RULE = { sv: "Subject–verb agreement", tn: "Tense consistency", dm: "Determiner agreement", pr: "Pronoun agreement", ap: "Apostrophe use" };
// Fixes are worded so that each one fits more than one rule, and every rule has at least two
// fixes that fit it: the Rule | Fix options can then be sensible pairs, so the answer is not the
// only pair that makes sense (see ticket 022). Only sing, plur, past, gend and rm are ever answers.
const FIXD = {
  sing: "Make it singular", plur: "Make it plural", past: "Change it to the past tense", pres: "Change it to the present tense",
  gend: "Change the gender (he, she, it)", rm: "Remove the apostrophe", add: "Add an apostrophe",
};
const FITS = { sv: ["sing", "plur"], dm: ["sing", "plur"], pr: ["sing", "plur", "gend"], tn: ["past", "pres"], ap: ["rm", "add"] };
const RULE_LIST = Object.values(RULE);
const RULE_KEY = Object.fromEntries(Object.entries(RULE).map(([k, v]) => [v, k]));
const FIX_KEY = Object.fromEntries(Object.entries(FIXD).map(([k, v]) => [v, k]));

// People only, so every subject can sensibly be "ready", "late", "need help" and so on.
const NOUNS = [["teacher", "teachers"], ["nurse", "nurses"], ["driver", "drivers"], ["student", "students"], ["pilot", "pilots"], ["farmer", "farmers"], ["player", "players"], ["visitor", "visitors"], ["cyclist", "cyclists"], ["neighbour", "neighbours"]];
const ADJS = ["old", "new", "tired", "busy", "local", "young", "quiet"];
const VB = [
  { s: "is", p: "are", rest: ["ready"] }, { s: "has", p: "have", rest: ["arrived"] }, { s: "was", p: "were", rest: ["late"] },
  { s: "arrives", p: "arrive", rest: ["early"] }, { s: "seems", p: "seem", rest: ["ready"] }, { s: "needs", p: "need", rest: ["help"] },
];
const PREPS = ["near", "behind", "beside", "with", "opposite"];
const COLL = ["team", "crew", "class", "committee", "band", "jury"];
const ADV = [["Yesterday,"], ["Last", "week,"], ["Last", "night,"], ["Two", "days", "ago,"], ["Last", "year,"]];
const SUBJP = [["The", "workers"], ["The", "neighbours"], ["The", "children"], ["The", "visitors"], ["The", "students"], ["Our", "cousins"]];
const TV = [
  { past: "wrote", pres: "write", obj: "a long report" }, { past: "painted", pres: "paint", obj: "the old fence" },
  { past: "sold", pres: "sell", obj: "the red car" }, { past: "won", pres: "win", obj: "the final match" },
  { past: "left", pres: "leave", obj: "the building" }, { past: "broke", pres: "break", obj: "the front gate" },
  { past: "took", pres: "take", obj: "the early train" }, { past: "found", pres: "find", obj: "a small key" },
];
const NAMES = ["Maya", "Tom", "Priya", "Omar", "Elena", "Callum"];
const DN = [["apple", "apples"], ["book", "books"], ["chair", "chairs"], ["ticket", "tickets"], ["coat", "coats"], ["picture", "pictures"], ["bag", "bags"], ["cup", "cups"]];
const DV = ["bought", "carried", "chose", "painted", "dropped"];
const DADJ = ["red", "old", "new", "small", "heavy"];
const DREST = [["from", "the", "market."], ["for", "the", "party."], ["at", "the", "shop."], ["last", "week."]];
const REFL = [["Tom", "himself"], ["Priya", "herself"], ["Omar", "himself"], ["The twins", "themselves"], ["The robot", "itself"], ["Our cousins", "themselves"]];
const REFLS = ["himself", "herself", "themselves", "itself"];
const PRV = ["hurt", "cut", "scratched"];
const PRREST = [["while", "cooking", "dinner."], ["on", "the", "old", "stairs."], ["during", "the", "match."], ["in", "the", "garden."]];
const APN = ["farmer", "teacher", "driver", "painter", "neighbour", "student"];
const APD = ["Three", "Several", "Both", "Four", "Many"];
const APV = [["sold", "eggs", "at", "the", "market."], ["fixed", "the", "old", "roof."], ["marked", "the", "tests", "early."], ["drove", "to", "the", "coast."], ["painted", "the", "fence."]];
const ITS = [["dog", "wagged", "tail."], ["cat", "licked", "fur."], ["parrot", "ruffled", "feathers."], ["horse", "shook", "mane."], ["rabbit", "twitched", "nose."]];

const plural = (b) => (b ? "plural" : "singular");

function bSV(rng, kind) {
  const V = rng.pick(VB);
  const rest = V.rest.map((w, i, a) => (i === a.length - 1 ? w + "." : w));
  let words, idx, pl, subj, extra = "";
  if (kind === "plain") {
    const [ns, np] = rng.pick(NOUNS); pl = rng.next() < 0.5; const adj = rng.pick(ADJS);
    subj = pl ? np : ns;
    words = ["The", adj, subj, pl ? V.p : V.s, ...rest]; idx = 3;
  } else if (kind === "attractor") {
    const [h, a] = rng.shuffle(NOUNS).slice(0, 2); pl = rng.next() < 0.5; const prep = rng.pick(PREPS);
    subj = pl ? h[1] : h[0];
    words = ["The", subj, prep, "the", pl ? a[0] : a[1], pl ? V.p : V.s, ...rest]; idx = 5;
    extra = ", whatever noun comes between it and the verb";
  } else if (kind === "coll") {
    const c = rng.pick(COLL); pl = false; subj = c;
    words = ["The", c, V.s, ...rest]; idx = 2;
    extra = " (collective nouns take a singular verb in this exercise)";
  } else if (kind === "collatt") {
    const c = rng.pick(COLL); const [, np] = rng.pick(NOUNS); pl = false; subj = c;
    words = ["The", c, "of", "the", np, V.s, ...rest]; idx = 5;
    extra = " (a collective noun takes a singular verb, and the nouns after \"of\" do not change that)";
  } else {
    const [, np] = rng.pick(NOUNS); const lead = rng.pick(["Each", "One"]); pl = false; subj = lead.toLowerCase();
    words = [lead, "of", "the", np, V.s, ...rest]; idx = 4;
    extra = ` ("${lead} of the …" takes a singular verb in this exercise)`;
  }
  const fix = words[idx];
  const wrong = pl ? V.s : V.p;
  const wr = wrong === fix ? (pl ? V.s : V.p) : wrong;
  return {
    words, idx, wrong: wr, fix, rule: "sv", dir: pl ? "plur" : "sing",
    info: { subj, pl },
    why: `The subject is "${subj}", which counts as ${plural(pl)}${extra}, so the verb must be ${plural(pl)}: **${fix}**, not ${wr}.`,
  };
}
function bTn(rng, two) {
  const adv = rng.pick(ADV), subj = rng.pick(SUBJP);
  const [v1, v2] = rng.shuffle(TV).slice(0, 2);
  const words = [...adv, subj[0].toLowerCase(), ...subj.slice(1), v1.past, ...v1.obj.split(" ")];
  const i1 = adv.length + subj.length;
  let i2 = -1;
  if (two) { words.push("and"); i2 = words.length; words.push(v2.past, ...v2.obj.split(" ")); }
  words[words.length - 1] += ".";
  const second = two && rng.next() < 0.5;
  const idx = second ? i2 : i1, v = second ? v2 : v1;
  return {
    words, idx, wrong: v.pres, fix: v.past, rule: "tn", dir: "past",
    info: { adv: adv.join(" ") },
    why: `"${adv.join(" ").replace(/,$/, "")}" puts the whole sentence in the past, so **${v.past}** is needed, not ${v.pres}.`,
  };
}
function bDm(rng) {
  const name = rng.pick(NAMES), verb = rng.pick(DV), [ns, np] = rng.pick(DN), adj = rng.pick(DADJ), rest = rng.pick(DREST);
  const pl = rng.next() < 0.5, far = rng.next() < 0.5;
  const dem = pl ? (far ? "those" : "these") : (far ? "that" : "this");
  const wrong = pl ? (far ? "that" : "this") : (far ? "those" : "these");
  const noun = pl ? np : ns;
  return {
    words: [name, verb, dem, adj, noun, ...rest], idx: 2, wrong, fix: dem, rule: "dm", dir: pl ? "plur" : "sing",
    info: { pl, far, noun },
    why: `"${noun}" is ${plural(pl)}, so the ${far ? "far" : "near"} determiner is **${dem}**, not ${wrong}.`,
  };
}
function bPr(rng) {
  const [subj, refl] = rng.pick(REFL), verb = rng.pick(PRV), rest = rng.pick(PRREST);
  const wrong = rng.pick(REFLS.filter((x) => x !== refl));
  const sw = subj.split(" ");
  return {
    // themselves is the only plural reflexive here; two singular ones differ in gender.
    words: [...sw, verb, refl, ...rest], idx: sw.length + 1, wrong, fix: refl, rule: "pr",
    dir: refl === "themselves" ? "plur" : wrong === "themselves" ? "sing" : "gend",
    info: { subj },
    why: `The pronoun must match "${subj}": **${refl}**, not ${wrong}.`,
  };
}
function bAp(rng) {
  const det = rng.pick(APD), n = rng.pick(APN), vp = rng.pick(APV);
  return {
    words: [det, n + "s", ...vp], idx: 1, wrong: n + "'s", fix: n + "s", rule: "ap", dir: "rm",
    info: { kind: "plural", base: n },
    why: `A plain plural takes no apostrophe: **${n}s** (the apostrophe would show possession).`,
  };
}
function bIts(rng) {
  const [n, v, part] = rng.pick(ITS);
  return {
    words: ["The", n, v, "its", part], idx: 3, wrong: "it's", fix: "its", rule: "ap", dir: "rm",
    info: { kind: "its", base: n },
    why: "\"its\" (belonging to it) takes no apostrophe; \"it's\" means \"it is\" or \"it has\".",
  };
}

function wordChoices(rng, n, idx) {
  const others = rng.shuffle([...Array(n).keys()].filter((i) => i !== idx)).slice(0, Math.min(4, n - 1));
  const all = [idx, ...others].sort((a, b) => a - b);
  return { choices: all.map((i) => `Word ${i + 1}`), answer: `Word ${idx + 1}` };
}
const numbered = (words) => "`" + words.map((w, i) => `${i + 1}:${w}`).join(" ") + "`";

function genAgree(rng, tier) {
  const medium = [() => bSV(rng, "plain"), () => bTn(rng, false), () => bDm(rng)];
  const hard = [() => bSV(rng, "plain"), () => bSV(rng, "attractor"), () => bTn(rng, true), () => bDm(rng), () => bPr(rng)];
  const expert = [...hard, () => bAp(rng), () => bIts(rng)];
  const plus = [() => bSV(rng, "coll"), () => bSV(rng, "collatt"), () => bSV(rng, "eachof"), () => bSV(rng, "attractor"), () => bTn(rng, true), () => bDm(rng), () => bPr(rng), () => bAp(rng), () => bIts(rng)];
  const pool = { medium, hard, expert, "expert-plus": plus }[tier];
  const E = rng.pick(pool)();
  const shownErr = E.words.map((w, i) => (i === E.idx ? E.wrong : w));
  let sentences, es;
  if (tier === "expert-plus") {
    const dec = [rng.pick(plus)().words, rng.pick(plus)().words];
    es = rng.int(0, 2);
    sentences = dec.slice(); sentences.splice(es, 0, shownErr);
  } else { sentences = [shownErr]; es = 0; }

  const base = "Words are numbered. **Exactly one word is wrong.** The nouns themselves are right: the fault is in how another word, or an apostrophe, goes with them. Change as little as possible and keep the meaning (this/these point to something near, that/those to something far). Use British English.";
  const conv = {
    medium: "",
    hard: " Words between a subject and its verb do not change the subject.",
    expert: " Words between a subject and its verb do not change the subject. \"its\" means belonging to it; \"it's\" means it is or it has.",
    "expert-plus": " Conventions for this exercise: a collective noun (team, crew, class, committee, band, jury) takes a singular verb; \"each of the …\" and \"one of the …\" take a singular verb; words between a subject and its verb do not change the subject; \"its\" means belonging to it; \"it's\" means it is or it has.",
  }[tier];
  const body = tier === "expert-plus"
    ? sentences.map((s, k) => `**Sentence ${k + 1}:** ${numbered(s)}`).join("\n\n")
    : numbered(sentences[0]);
  const prompt = `${base}${conv}\n\n${body}`;

  const wc = wordChoices(rng, E.words.length, E.idx);
  const wordPart = choicePart("word", "Faulty word", tier === "expert-plus" ? "In that sentence, which word is wrong?" : "Which word is wrong?", wc.answer, wc.choices,
    "Check each verb, determiner and pronoun against the word it goes with, and each time word against the verb.");
  const fixPart = textPart("fix", "Corrected form", "Type the corrected word", E.fix, [E.fix + "."],
    "Keep the meaning and change only the form, so the word agrees with the one it depends on.");
  const ruleChoice = choicePart("rule", "Rule", "Which rule was broken?", RULE[E.rule], rng.shuffle(RULE_LIST),
    "Name the relationship that failed: verb and subject, time and verb, determiner and noun, pronoun and noun, or a stray apostrophe.");
  const ansPair = [RULE[E.rule], FIXD[E.dir]];
  const ruleSeg = segPart("rulefix", "Rule | Fix", "Which rule was broken, and what is the fix?", ["Rule", "Fix"], ansPair,
    segOptions(rng, ansPair, [RULE_LIST, Object.values(FIXD)], ([r, f]) => FITS[RULE_KEY[r]].includes(FIX_KEY[f])),
    "Name the rule first, then say how the word changes: singular or plural, past or present tense, gender, or the apostrophe.");
  const sentPart = tier === "expert-plus"
    ? choicePart("sent", "Faulty sentence", "Which sentence contains the wrong word?", `Sentence ${es + 1}`, sentences.map((_, k) => `Sentence ${k + 1}`),
      "Apply the stated conventions to every sentence. Only one sentence breaks them.")
    : null;
  let parts;
  if (tier === "medium") parts = [wordPart, fixPart];
  else if (tier === "hard") parts = [wordPart, fixPart, ruleChoice];
  else if (tier === "expert") parts = [wordPart, fixPart, ruleSeg];
  else parts = [sentPart, wordPart, fixPart, ruleSeg];

  const exp = [];
  if (tier === "expert-plus") exp.push(`The wrong word is in **Sentence ${es + 1}**.`);
  exp.push(`**Word ${E.idx + 1}** (${E.wrong}) is wrong. ${E.why}`);
  exp.push(`Rule: **${RULE[E.rule]}**. Fix: **${FIXD[E.dir]}**.`);
  const total = sentences.reduce((s, x) => s + x.length, 0);
  return {
    prompt, parts, explanation: exp.join("\n\n"),
    params: { kind: "agree", tier, sentences, es, ei: E.idx, wrong: E.wrong, fix: E.fix, rule: E.rule, dir: E.dir, info: E.info },
    given: givenRows([["_words", total]]),
    hints: [
      "Read the sentence slowly and check each word against the one it depends on.",
      "Only one word is wrong; every other word follows the stated rules.",
    ],
  };
}

// ================= readability =================

const CUT1 = 28, CUT2 = 34;
const WS = [40, 50, 60, 80, 100, 120, 150, 160, 200];
const bandOf = (x) => (x < CUT1 ? "Plain" : x < CUT2 ? "Standard" : "Dense");
const nearCut = (x) => Math.abs(x - CUT1) < 0.005 || Math.abs(x - CUT2) < 0.005;

function drawText(rng) {
  for (let i = 0; i < TRY; i++) {
    const W = rng.pick(WS), S = rng.pick([2, 4, 5, 10]);
    const asl = W / S;
    if (asl < 8 || asl > 24 || !terminates(asl, 2)) continue;
    const Y = rng.int(Math.ceil(1.2 * W), Math.floor(1.9 * W));
    const asw = Y / W;
    if (!terminates(asw, 2)) continue;
    const idx = r6(asl + 10 * asw);
    if (nearCut(idx)) continue;
    return { W, S, Y, asl: r6(asl), asw: r6(asw), idx };
  }
  return tooMany();
}
const DEF = `A style guide defines a made-up **Plain Index** for practice: ASL = words ÷ sentences, ASW = syllables ÷ words, **Plain Index = ASL + 10 × ASW**. Bands: below ${CUT1} is **Plain**; ${CUT1} or more but below ${CUT2} is **Standard**; ${CUT2} or more is **Dense**. Every value here is exact, so no rounding is needed.`;
const txt = (t, name = "The passage") => `${name} has ${t.W} words, ${t.S} sentences and ${t.Y} syllables.`;
const BAND_CH = (rng) => rng.shuffle(["Plain", "Standard", "Dense"]);

function genRead(rng, tier) {
  const aslHint = "ASL is the number of words divided by the number of sentences.";
  const idxHint = "Work out ASW (syllables ÷ words), multiply it by 10, then add ASL.";
  const bandHint = "Compare the index with the two stated cut-offs; a value equal to a cut-off goes in the higher band.";
  if (tier === "medium" || tier === "hard") {
    const t = drawText(rng);
    const parts = [numPart("asl", "ASL", "Average sentence length ASL (words per sentence)", t.asl, aslHint), numPart("index", "Plain Index", "Plain Index", t.idx, idxHint)];
    if (tier === "hard") parts.push(choicePart("band", "Band", "Which band is the passage in?", bandOf(t.idx), BAND_CH(rng), bandHint));
    return {
      prompt: `${DEF}\n\n${txt(t)}`, parts,
      explanation: `ASL = ${t.W} ÷ ${t.S} = **${N(t.asl)}**. ASW = ${t.Y} ÷ ${t.W} = ${N(t.asw)}. Plain Index = ${N(t.asl)} + 10 × ${N(t.asw)} = **${N(t.idx)}**.` + (tier === "hard" ? ` That is **${bandOf(t.idx)}**.` : ""),
      params: { kind: "read", tier, t },
      given: givenRows([["_words", t.W], ["_sentences", t.S], ["_syllables", t.Y]]),
      hints: ["Find ASL and ASW first; the index is built from them.", "Check your ASW: it should be between 1 and 2 for ordinary English."],
    };
  }
  if (tier === "expert") {
    for (let i = 0; i < TRY; i++) {
      const t = drawText(rng);
      const asl2 = t.W / (2 * t.S);
      if (!terminates(asl2, 2)) continue;
      const idx2 = r6(asl2 + 10 * t.asw);
      if (nearCut(idx2) || bandOf(idx2) === bandOf(t.idx)) continue;
      const parts = [
        numPart("asl", "ASL", "Average sentence length ASL now (words per sentence)", t.asl, aslHint),
        numPart("index", "Plain Index", "Plain Index now", t.idx, idxHint),
        numPart("index2", "After the split", "Plain Index after the editor splits every sentence in two", idx2, "Twice as many sentences, the same words and syllables: ASL halves, ASW is unchanged."),
        choicePart("band2", "New band", "Which band is the passage in after the split?", bandOf(idx2), BAND_CH(rng), bandHint),
      ];
      return {
        prompt: `${DEF}\n\n${txt(t)} The editor splits **every** sentence into two shorter ones (twice as many sentences; the words and syllables stay as they are).`, parts,
        explanation: `Now: ASL = ${N(t.asl)}, ASW = ${N(t.asw)}, Plain Index = **${N(t.idx)}** (${bandOf(t.idx)}). After the split: ${2 * t.S} sentences, ASL = ${t.W} ÷ ${2 * t.S} = ${N(asl2)}, so Plain Index = ${N(asl2)} + 10 × ${N(t.asw)} = **${N(idx2)}**, which is **${bandOf(idx2)}**.`,
        params: { kind: "read", tier, t, idx2 },
        given: givenRows([["_words", t.W], ["_sentences", t.S], ["_syllables", t.Y]]),
        hints: ["Find the index now, then halve ASL for the split text; ASW does not change.", "Splitting sentences changes only the sentence count."],
      };
    }
    return tooMany();
  }
  for (let i = 0; i < TRY; i++) {
    const A = drawText(rng), B = drawText(rng);
    if (A.idx === B.idx || B.idx < CUT1) continue;
    const gap = CUT1 - 10 * B.asw;
    const q = B.W / gap;
    if (gap <= 0 || Math.abs(q - Math.round(q)) < 1e-6) continue;
    const smin = Math.floor(q) + 1;
    const easier = A.idx < B.idx ? "Passage A" : "Passage B";
    const parts = [
      numPart("indexa", "Index A", "Plain Index of Passage A", A.idx, idxHint),
      numPart("indexb", "Index B", "Plain Index of Passage B", B.idx, idxHint),
      choicePart("easier", "Easier passage", "Which passage is easier to read (lower index)?", easier, ["Passage A", "Passage B"], "A lower Plain Index means easier text."),
      numPart("smin", "Sentences needed", `Fewest sentences Passage B needs in total to reach the Plain band (index below ${CUT1}), by adding sentence breaks only`, smin,
        "Words and syllables stay fixed, so ASW is fixed. Find how small ASL must become, then how many sentences give that."),
    ];
    return {
      prompt: `${DEF}\n\n${txt(A, "Passage A")} ${txt(B, "Passage B")} The editor will shorten Passage B by adding sentence breaks only: its words and syllables stay as they are.`, parts,
      explanation: `A: ASL ${N(A.asl)}, ASW ${N(A.asw)}, index **${N(A.idx)}**. B: ASL ${N(B.asl)}, ASW ${N(B.asw)}, index **${N(B.idx)}**. The lower index is **${easier}**. For B to be below ${CUT1}, ASL + ${N(10 * B.asw)} < ${CUT1}, so ASL < ${N(gap)}, i.e. ${B.W} ÷ sentences < ${N(gap)}, sentences > ${N(q)}. The fewest whole number of sentences is **${smin}**.`,
      params: { kind: "read", tier, A, B },
      given: givenRows([["_wordsA", A.W], ["_sentA", A.S], ["_sylA", A.Y], ["_wordsB", B.W], ["_sentB", B.S], ["_sylB", B.Y]]),
      hints: ["Work out each index separately, then compare them.", "For the last part: ASL must drop below the cut-off minus 10 × ASW. Divide the words by that limit and go up to the next whole sentence."],
    };
  }
  return tooMany();
}

// ================= word-building =================

const AFF = {
  re: ["re-", "again", "prefix"], un: ["un-", "not", "prefix"], mis: ["mis-", "wrongly", "prefix"], pre: ["pre-", "beforehand", "prefix"],
  able: ["-able", "able to be …ed; makes an adjective", "suffix"], er: ["-er", "a person or thing that …s; makes a noun", "suffix"],
  ness: ["-ness", "the state of being …; makes a noun", "suffix"], ly: ["-ly", "in a … way; makes an adverb", "suffix"],
  ful: ["-ful", "full of …; makes an adjective", "suffix"], less: ["-less", "without …; makes an adjective", "suffix"],
};
const PRE_KEYS = ["re", "un", "mis", "pre"], SUF_KEYS = ["able", "er", "ness", "ly", "ful", "less"];
const V_ = (r, pp, ok, dbl = false) => ({ r, pp, ok, dbl, pos: "verb" });
const A_ = (r, ok) => ({ r, ok, pos: "adjective" });
const NN_ = (r, ok) => ({ r, ok, pos: "noun" });
const ROOTS = [
  V_("read", "read", ["re", "mis", "able", "un+able"]), V_("write", "written", ["re", "able", "er", "re+able"]),
  V_("use", "used", ["re", "mis", "able", "er", "un+able", "re+able"]), V_("play", "played", ["re", "able", "er", "un+able", "re+able"]),
  V_("build", "built", ["re", "er"]), V_("break", "broken", ["able", "er", "un+able"]), V_("heat", "heated", ["pre", "re", "er"]),
  V_("wash", "washed", ["pre", "re", "able", "er"]), V_("pay", "paid", ["pre", "able", "er"]), V_("spell", "spelled", ["mis", "re"]),
  V_("judge", "judged", ["mis", "pre"]), V_("run", "run", ["er"], true), V_("swim", "swum", ["er"], true), V_("win", "won", ["er"], true),
  V_("plan", "planned", ["re", "er"], true), V_("shop", "shopped", ["er"], true), V_("stop", "stopped", ["able", "un+able"], true),
  V_("begin", "begun", ["er"], true), V_("paint", "painted", ["re", "er"]), V_("tell", "told", ["re"]), V_("open", "opened", ["re", "er"]),
  A_("kind", ["un", "ness", "ly", "un+ness", "un+ly"]), A_("fair", ["un", "ness", "ly", "un+ness", "un+ly"]),
  A_("happy", ["un", "ness", "ly", "un+ness", "un+ly"]), A_("lucky", ["un", "ness", "ly", "un+ness", "un+ly"]),
  A_("tidy", ["un", "ness", "ly", "un+ness", "un+ly"]), A_("easy", ["ness", "ly"]),
  A_("safe", ["un", "ly", "un+ly"]), A_("wise", ["un", "ly", "un+ly"]), A_("clear", ["un", "ly", "ness"]),
  A_("fit", ["un", "ness", "un+ness"]), A_("noisy", ["ness", "ly"]), A_("angry", ["ly"]),
  NN_("hope", ["ful", "less"]), NN_("care", ["ful", "less"]), NN_("help", ["ful", "less"]), NN_("pain", ["ful", "less"]),
  NN_("faith", ["ful", "less"]), NN_("colour", ["ful", "less"]), NN_("power", ["ful", "less"]), NN_("fear", ["ful", "less"]),
  NN_("joy", ["ful", "less"]), NN_("harm", ["ful", "less"]), NN_("waste", ["ful"]), NN_("success", ["ful"]),
];
const splitKey = (key) => {
  const ks = key.split("+");
  return ks.length === 2 ? { pre: ks[0], suf: ks[1] } : PRE_KEYS.includes(ks[0]) ? { pre: ks[0], suf: null } : { pre: null, suf: ks[0] };
};
function joinW(R, pre, suf) {
  let base = R.r;
  if (suf) {
    const vowel = "aeiou".includes(suf[0]);
    if (vowel && base.endsWith("e")) base = base.slice(0, -1);
    else if (vowel && R.dbl) base += base[base.length - 1];
    else if ((suf === "ness" || suf === "ly") && /[^aeiou]y$/.test(base)) base = base.slice(0, -1) + "i";
  }
  return (pre || "") + base + (suf || "");
}
const plainJoin = (R, pre, suf) => (pre || "") + R.r + (suf || "");
const v3 = (r) => (r.endsWith("sh") ? r + "es" : r + "s");
const posOf = (R, suf) => (suf === "able" || suf === "ful" || suf === "less" ? "adjective" : suf === "er" || suf === "ness" ? "noun" : suf === "ly" ? "adverb" : R.pos);
function meaningOf(R, key) {
  const r = R.r;
  const M = {
    re: `to ${r} again`, mis: `to ${r} wrongly`, pre: `to ${r} beforehand`, un: `not ${r}`, ness: `the state of being ${r}`, ly: `in a way that is ${r}`,
    ful: `full of ${r}`, less: `without ${r}`, er: `a person or thing that ${v3(r)}`,
    able: `able to be ${R.pp}`, "un+able": `not able to be ${R.pp}`, "re+able": `able to be ${R.pp} again`,
    "un+ness": `the state of not being ${r}`, "un+ly": `in a way that is not ${r}`,
  };
  return M[key];
}
const meaningPool = (R) => {
  const keys = R.pos === "verb" ? ["re", "mis", "pre", "able", "er", "un+able", "re+able"] : R.pos === "adjective" ? ["un", "ness", "ly", "un+ness", "un+ly"] : ["ful", "less", "ness", "ly", "un"];
  return keys.map((k) => ({ k, m: meaningOf(R, k) }));
};
const CANDS = (() => {
  const all = [];
  for (const R of ROOTS) for (const key of R.ok) {
    const { pre, suf } = splitKey(key);
    all.push({ R, key, pre, suf, change: joinW(R, pre, suf) !== plainJoin(R, pre, suf), two: !!(pre && suf) });
  }
  return {
    medium: all.filter((c) => !c.two && !c.change), hard: all.filter((c) => !c.change),
    expert: all.filter((c) => c.change), "expert-plus": all.filter((c) => c.two),
  };
})();
const SPELL = "**Spelling rules:** (1) a final **e** is dropped before a suffix that starts with a vowel (use + able = usable); (2) a final **y** after a consonant becomes **i** before -ness and -ly (happy + ness = happiness); (3) the final consonant of run, swim, win, plan, shop, stop and begin is doubled before a vowel suffix (run + er = runner). Otherwise just join the pieces.";
const glossLine = (k) => `- **${AFF[k][0]}** (${AFF[k][2]}): ${AFF[k][1]}`;

function genWord(rng, tier) {
  const c = rng.pick(CANDS[tier]);
  const { R, key, pre, suf } = c;
  const word = joinW(R, pre, suf);
  const meaning = meaningOf(R, key), pos = posOf(R, suf);
  const POS_CH = rng.shuffle(["noun", "verb", "adjective", "adverb"]);
  const posHint = "The last piece decides the word class; with only a prefix, the root's class stays.";
  const pool = meaningPool(R).filter((x) => x.m !== meaning);
  const meaningCh = rng.shuffle([meaning, ...rng.shuffle(pool).slice(0, 3).map((x) => x.m)]);
  const meaningPart = choicePart("meaning", "Meaning", "What does the word mean?", meaning, meaningCh,
    "Put the meanings of the pieces together, root first, then add the prefix and suffix meanings.");
  const hy = pre ? [pre + "-" + joinW(R, null, suf)] : [];

  if (tier === "expert-plus") {
    const preL = AFF[pre][0], sufL = AFF[suf][0];
    const ans = [preL, sufL];
    const gloss = rng.shuffle([...PRE_KEYS, ...SUF_KEYS]).map(glossLine).join("\n");
    const parts = [
      segPart("affixes", "Prefix | Suffix", "Which prefix and which suffix were used?", ["Prefix", "Suffix"], ans,
        segOptions(rng, ans, [PRE_KEYS.map((k) => AFF[k][0]), SUF_KEYS.map((k) => AFF[k][0])]), "Look at the start and the end of the word, and remember that spelling rules may have changed a letter."),
      textPart("root", "Root", "Type the root (undo any spelling change)", R.r, [], "Remove the prefix and suffix, then restore any letter the spelling rules changed or dropped."),
      meaningPart,
      choicePart("pos", "Word class", "Which word class is the word?", pos, POS_CH, posHint),
    ];
    return {
      prompt: `A coined word is built from one root plus one prefix and one suffix from this glossary.\n\n${gloss}\n\n${SPELL}\n\nThe coined word is **${word}**.`,
      parts,
      explanation: `${word} = ${pre}- + ${R.r} + -${suf}${c.change ? ", after the spelling rules" : ""}. Prefix | suffix: **${preL} | ${sufL}**; root: **${R.r}** (${R.pos}). Meaning: **${meaning}**. The suffix ${sufL} makes it ${/^[aeiou]/.test(pos) ? "an" : "a"} **${pos}**.`,
      params: { kind: "word", tier, root: R.r, pp: R.pp, dbl: R.dbl, rpos: R.pos, pre, suf, key },
      given: givenRows([["_letters", word.length]]),
      hints: ["Check both ends of the word against the glossary.", "The meaning is built from the root meaning plus the prefix and suffix meanings."],
    };
  }
  const used = [pre, suf].filter(Boolean);
  const extra = tier === "medium" ? [rng.pick(pre ? SUF_KEYS : PRE_KEYS)] : [rng.pick(PRE_KEYS.filter((k) => k !== pre)), rng.pick(SUF_KEYS.filter((k) => k !== suf))];
  const decoyRoot = [rng.pick(ROOTS.filter((x) => x.r !== R.r))];
  const lines = [...rng.shuffle([...used, ...extra]).map(glossLine), ...rng.shuffle([R, ...decoyRoot]).map((x) => `- **${x.r}** (root, ${x.pos})`)];
  const piece = [pre ? `**${pre}-**` : null, `**${R.r}**`, suf ? `**-${suf}**` : null].filter(Boolean).join(" + ");
  const parts = [textPart("word", "Word", "Type the word you build", word, hy, "Join the pieces in order: prefix, root, suffix" + (tier === "expert" ? ", then apply the spelling rules." : "."))];
  parts.push(meaningPart);
  if (tier !== "medium") parts.push(choicePart("pos", "Word class", "Which word class is the word?", pos, POS_CH, posHint));
  if (tier === "expert") parts.push(numPart("letters", "Letters", "Number of letters in the word", word.length, "Spell the finished word out and count every letter."));
  return {
    prompt: `Glossary for this exercise:\n\n${lines.join("\n")}\n\n${tier === "expert" ? SPELL + "\n\n" : ""}Build the word ${piece} (prefix, root, suffix in that order).`,
    parts,
    explanation: `${piece.replace(/\*\*/g, "")} gives **${word}**${c.change ? " after the spelling rules" : ""}. Meaning: **${meaning}**. Word class: **${pos}**.` + (tier === "expert" ? ` It has **${word.length}** letters.` : ""),
    params: { kind: "word", tier, root: R.r, pp: R.pp, dbl: R.dbl, rpos: R.pos, pre, suf, key },
    given: givenRows([["_pieces", used.length + 1]]),
    hints: ["Use only the pieces named in the question; the other glossary entries are not needed.", "The meaning combines the root with the prefix and suffix meanings."],
  };
}

// ================= made-up-language =================

const LNAMES = ["Velan", "Torish", "Mirelic", "Kasan", "Orelian"];
const NOUN_E = ["dog", "cat", "bird", "boy", "girl", "farmer", "horse", "teacher"];
const VERB_E = [
  { e: "see", e3: "sees", ep: "saw" }, { e: "eat", e3: "eats", ep: "ate" }, { e: "find", e3: "finds", ep: "found" },
  { e: "chase", e3: "chases", ep: "chased" }, { e: "hear", e3: "hears", ep: "heard" }, { e: "follow", e3: "follows", ep: "followed" },
];
const ADJ_E = ["big", "small", "red", "old", "quick"];
const SUFS = ["ko", "ri", "su", "ne", "ta"], PASTS = ["na", "po", "de", "mi", "hu"], NEGS = ["ve", "ka", "zo", "lo"];
const ORDERS = { SVO: "subject, verb, object", SOV: "subject, object, verb", VSO: "verb, subject, object" };

// Made-up words that would read as slurs, rude words or loaded real words in some language.
const BLOCKED = new Set(["kike", "paki", "dago", "nazi", "rape", "puta", "pute", "pube", "nude", "lube", "dike", "kaka", "pipi", "titi", "pene", "kuso", "baka", "vagi", "pisa", "pisi", "bobo", "popo", "mona", "fifi"]);
function makeLang(rng, agree, hidden) {
  const used = new Set();
  const C = "bdfgklmnprstvz", Vw = "aeiou";
  const word = () => { for (let i = 0; i < 500; i++) { const w = C[rng.int(0, 13)] + Vw[rng.int(0, 4)] + C[rng.int(0, 13)] + Vw[rng.int(0, 4)]; if (!used.has(w) && !BLOCKED.has(w)) { used.add(w); return w; } } return tooMany(); };
  const nouns = rng.shuffle(NOUN_E).slice(0, 4), verbs = rng.shuffle(VERB_E).slice(0, 3), adjs = rng.shuffle(ADJ_E).slice(0, 2);
  const lex = {};
  for (const n of nouns) lex[n] = word();
  for (const v of verbs) lex[v.e] = word();
  for (const a of adjs) lex[a] = word();
  return {
    name: rng.pick(LNAMES), order: rng.pick(Object.keys(ORDERS)), suf: rng.pick(SUFS), pastP: rng.pick(PASTS), negP: rng.pick(NEGS),
    adjPos: rng.pick(["before", "after"]), agree, hidden, nouns, verbs, adjs, lex,
  };
}
function drawSpec(rng, L, f) {
  const [sn, on] = rng.shuffle(L.nouns).slice(0, 2);
  const sp = { s: { n: sn, pl: false, adj: null }, o: { n: on, pl: false, adj: null }, v: rng.pick(L.verbs), past: !!f.past, neg: !!f.neg };
  if (f.pl) {
    if (f.plOne) { const subj = rng.next() < 0.5; sp.s.pl = subj; sp.o.pl = !subj; }
    else { const w = rng.int(0, 2); sp.s.pl = w !== 1; sp.o.pl = w !== 0; }
  }
  if (f.adj) { const a = rng.pick(L.adjs); if (rng.next() < 0.5) sp.s.adj = a; else sp.o.adj = a; }
  return sp;
}
const npE = (x) => ["the", x.adj, x.n + (x.pl ? "s" : "")].filter(Boolean).join(" ");
function engOf(sp) {
  const v = sp.v, pl = sp.s.pl;
  const vp = sp.neg ? `${sp.past ? "did" : pl ? "do" : "does"} not ${v.e}` : sp.past ? v.ep : pl ? v.e : v.e3;
  return `${npE(sp.s)} ${vp} ${npE(sp.o)}`;
}
function velTok(sp, L) {
  const np = (x) => {
    const n = { w: L.lex[x.n] + (x.pl ? L.suf : ""), k: x.pl ? "pl" : "base" };
    if (!x.adj) return [n];
    const a = { w: L.lex[x.adj] + (L.agree && x.pl ? L.suf : ""), k: L.agree && x.pl ? "ag" : "base" };
    return L.adjPos === "before" ? [a, n] : [n, a];
  };
  const vp = [...(sp.neg ? [{ w: L.negP, k: "neg" }] : []), { w: L.lex[sp.v.e], k: "base" }, ...(sp.past ? [{ w: L.pastP, k: "past" }] : [])];
  const S = np(sp.s), O = np(sp.o);
  return L.order === "SVO" ? [...S, ...vp, ...O] : L.order === "SOV" ? [...S, ...O, ...vp] : [...vp, ...S, ...O];
}
const velOf = (sp, L) => velTok(sp, L).map((t) => t.w).join(" ");
const marks = (sp, L) => velTok(sp, L).filter((t) => t.k !== "base").length;
const KIND_TXT = { pl: "Plural suffix on a noun", ag: "Plural suffix on an adjective", past: "Past-tense particle", neg: "Negation particle" };
const KIND_LIST = Object.values(KIND_TXT);

function rulesBlock(L, tier) {
  const lines = [
    `Word order is **${L.order}** (${ORDERS[L.order]}); ${L.name} has no words for "the" or "a".`,
    `A plural noun takes the suffix **-${L.suf}** (add it to the end of the word).`,
    `Past tense: the particle **${L.pastP}** is a separate word placed right after the verb.`,
    `An adjective goes **${L.adjPos}** its noun.` + (L.agree ? ` An adjective takes the same plural suffix as its noun.` : " An adjective never changes."),
  ];
  if (tier !== "medium" && tier !== "hard") lines.push(`Negation: the particle **${L.negP}** is a separate word placed right before the verb.`);
  return lines.map((s) => `- ${s}`).join("\n");
}
function rulesHidden(L) {
  return [
    `Word order is **${L.order}** (${ORDERS[L.order]}); ${L.name} has no words for "the" or "a".`,
    `An adjective goes **${L.adjPos}** its noun and takes the same plural suffix as its noun.`,
    `Negation: the particle **${L.negP}** is a separate word placed right before the verb.`,
    "Past tense is shown by a separate particle placed right after the verb, and a plural noun by a suffix; both are shown in the examples.",
  ].map((s) => `- ${s}`).join("\n");
}
const vocab = (L) => `**Vocabulary:** ${[...L.nouns, ...L.verbs.map((v) => v.e), ...L.adjs].map((w) => `${w} = *${L.lex[w]}*`).join(", ")}.`;
const verbNote = "English verbs are listed in their base form (for example, *see* stands for see, sees and saw).";

function genLang(rng, tier) {
  const agree = tier === "expert" || tier === "expert-plus";
  const L = makeLang(rng, agree, tier === "expert-plus");
  const FS = ["pl", "past", "adj"];
  const markHint = `Count every word of the ${L.name} sentence that is not exactly as listed in the vocabulary: suffixed words and particles.`;
  const fixAcc = (s) => [s + "."];
  if (tier === "medium") {
    const f = rng.pick(FS);
    const sp = drawSpec(rng, L, { [f]: true });
    const featTxt = { pl: "Plural suffix", past: "Past-tense particle", adj: "Adjective position", neg: "Negation particle" };
    const ans = velOf(sp, L), en = engOf(sp);
    return {
      prompt: `A made-up language, **${L.name}**, has these rules:\n\n${rulesBlock(L, tier)}\n\n${vocab(L)} ${verbNote}\n\nTranslate into ${L.name}: **${en}**`,
      parts: [
        textPart("trans", "Translation", `Type the ${L.name} sentence (words separated by spaces)`, ans, fixAcc(ans), "Translate each word, then arrange them in the stated word order and add the markers."),
        choicePart("feat", "Rule used", "Besides word order, which rule did this sentence need?", featTxt[f], rng.shuffle(Object.values(featTxt)), "Look at what changed between the plain vocabulary words and your sentence."),
      ],
      explanation: `Word by word in ${L.order} order: **${ans}**. The sentence needed the **${featTxt[f].toLowerCase()}** rule.`,
      params: { kind: "lang", tier, L, sp },
      given: givenRows([["_words", en.split(" ").length]]),
      hints: ["Replace each English word by its vocabulary word first.", "Then reorder to the stated word order and add the marker that the sentence needs."],
    };
  }
  if (tier === "hard") {
    const fs = rng.shuffle(FS).slice(0, 2);
    const sp = drawSpec(rng, L, { [fs[0]]: true, [fs[1]]: true });
    const fs2 = rng.shuffle(FS).slice(0, rng.int(1, 2));
    const sp2 = drawSpec(rng, L, Object.fromEntries(fs2.map((x) => [x, true])));
    const ans = velOf(sp, L), en2 = engOf(sp2), vel2 = velOf(sp2, L), n = marks(sp, L);
    return {
      prompt: `A made-up language, **${L.name}**, has these rules:\n\n${rulesBlock(L, tier)}\n\n${vocab(L)} ${verbNote}\n\n**Sentence A (English):** ${engOf(sp)}\n\n**Sentence B (${L.name}):** ${vel2}\n\nWhen you translate into English, put "the" before every noun.`,
      parts: [
        textPart("trans", "Translation A", `Translate Sentence A into ${L.name}`, ans, fixAcc(ans), "Translate word by word, order the words, then add the markers."),
        textPart("back", "Translation B", "Translate Sentence B into English", en2, fixAcc(en2), "Undo the markers first: a suffix means plural, the particle after the verb means past. Then restore English order."),
        numPart("marked", "Marked words", `How many words of your ${L.name} Sentence A are not exactly as listed in the vocabulary?`, n, markHint),
      ],
      explanation: `A in ${L.name}: **${ans}** (${n} marked word${n === 1 ? "" : "s"}: suffixed words and particles). B in English: **${en2}**.`,
      params: { kind: "lang", tier, L, sp, sp2 },
      given: givenRows([["_words", engOf(sp).split(" ").length]]),
      hints: ["Handle one sentence at a time.", "Marked words are the ones that differ from the plain vocabulary word: suffixed words and separate particles."],
    };
  }
  if (tier === "expert") {
    for (let i = 0; i < TRY; i++) {
      const fs = rng.shuffle(["pl", "past", "adj", "neg"]).slice(0, rng.int(3, 4));
      const sp = drawSpec(rng, L, Object.fromEntries(fs.map((x) => [x, true])));
      const fs2 = rng.shuffle(["pl", "past", "adj", "neg"]).slice(0, rng.int(2, 3));
      const sp2 = drawSpec(rng, L, Object.fromEntries(fs2.map((x) => [x, true])));
      const toks = velTok(sp2, L).filter((t) => t.k !== "base");
      if (!toks.length) continue;
      const tk = rng.pick(toks);
      const ans = velOf(sp, L), en2 = engOf(sp2), vel2 = velOf(sp2, L), n = marks(sp, L);
      return {
        prompt: `A made-up language, **${L.name}**, has these rules:\n\n${rulesBlock(L, tier)}\n\n${vocab(L)} ${verbNote} In English negatives use "do not", "does not" or "did not" followed by the base verb.\n\n**Sentence A (English):** ${engOf(sp)}\n\n**Sentence B (${L.name}):** ${vel2}\n\nWhen you translate into English, put "the" before every noun.`,
        parts: [
          textPart("trans", "Translation A", `Translate Sentence A into ${L.name}`, ans, fixAcc(ans), "Translate word by word, order the words, then add every marker the English sentence needs."),
          textPart("back", "Translation B", "Translate Sentence B into English", en2, fixAcc(en2), "Undo each marker, then restore English order and verb agreement."),
          numPart("marked", "Marked words", `How many words of your ${L.name} Sentence A are not exactly as listed in the vocabulary?`, n, markHint),
          choicePart("rw", "Why this form", `In Sentence B, why is the word **${tk.w}** not exactly as listed in the vocabulary?`, KIND_TXT[tk.k], rng.shuffle(KIND_LIST), "Compare it with the plain vocabulary words: is it a particle, or a word with a suffix, and is the suffixed word a noun or an adjective?"),
        ],
        explanation: `A in ${L.name}: **${ans}** (${n} marked words). B in English: **${en2}**. In B, **${tk.w}** is explained by the **${KIND_TXT[tk.k].toLowerCase()}** rule.`,
        params: { kind: "lang", tier, L, sp, sp2, askTok: tk.w },
        given: givenRows([["_words", engOf(sp).split(" ").length]]),
        hints: ["Check the vocabulary list for every word before you translate.", "A marked word is either a particle (a separate word) or a vocabulary word with the plural suffix."],
      };
    }
    return tooMany();
  }
  // expert-plus: the plural suffix and the past particle are not stated; they are read from two examples.
  const ex1 = drawSpec(rng, L, { pl: true, plOne: true });
  const ex2 = drawSpec(rng, L, { past: true });
  const fs = rng.shuffle(["neg", "adj"]).slice(0, rng.int(1, 2));
  const sp = drawSpec(rng, L, { pl: true, past: true, ...Object.fromEntries(fs.map((x) => [x, true])) });
  const ans = velOf(sp, L), n = marks(sp, L);
  const sufCh = rng.shuffle([L.suf, ...rng.shuffle(SUFS.filter((x) => x !== L.suf)).slice(0, 3)]).map((s) => "-" + s);
  return {
    prompt: `A made-up language, **${L.name}**, has these rules:\n\n${rulesHidden(L)}\n\n${vocab(L)} ${verbNote} In English negatives use "do not", "does not" or "did not" followed by the base verb.\n\n**Examples**\n\n- *${velOf(ex1, L)}* = ${engOf(ex1)}\n- *${velOf(ex2, L)}* = ${engOf(ex2)}\n\nWhen you translate, put "the" before every noun in English.\n\n**Translate into ${L.name}:** ${engOf(sp)}`,
    parts: [
      choicePart("plsuf", "Plural suffix", "What is the plural suffix?", "-" + L.suf, sufCh, "Compare the plural noun in the first example with its plain vocabulary word: what was added at the end?"),
      textPart("pastw", "Past particle", `Type the past-tense particle of ${L.name}`, L.pastP, [], "In the second example, find the word that is not in the vocabulary and sits right after the verb."),
      textPart("trans", "Translation", `Type the ${L.name} sentence`, ans, fixAcc(ans), "Use the vocabulary, the stated order, the suffix and particle you found, adjective agreement and the negation particle."),
      numPart("marked", "Marked words", `How many words of your ${L.name} sentence are not exactly as listed in the vocabulary?`, n, markHint),
    ],
    explanation: `The first example shows the plural suffix **-${L.suf}**; the second shows the past particle **${L.pastP}**. The sentence becomes **${ans}**, with **${n}** marked word${n === 1 ? "" : "s"}.`,
    params: { kind: "lang", tier, L, sp, ex1, ex2 },
    given: givenRows([["_words", engOf(sp).split(" ").length]]),
    hints: ["The two examples reveal the two unstated rules.", "Marked words are suffixed words and separate particles, including the negation particle."],
  };
}

// ================= compose =================

export function generate({ subtopic, difficulty, rng }) {
  if (!TIER_IDS.includes(difficulty)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const fn = { "agreement-edit": genAgree, readability: genRead, "word-building": genWord, "made-up-language": genLang }[subtopic];
  if (!fn) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = fn(rng, difficulty);
  return { answerType: "multi", ...q };
}

// ---------- independent verification ----------

const normT = (s) => String(s ?? "").replace(/−/g, "-").trim().replace(/\s+/g, " ").replace(/ ?: ?/g, ":").replace(/ ?, ?/g, ", ").toLowerCase();
const numOf = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const strOf = (a, id) => { const v = a ? a[id] : undefined; return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v); };
const textIs = (a, id, want, extra = []) => { const u = normT(strOf(a, id)); return u !== "" && [want, ...extra].some((w) => normT(w) === u); };
const numIs = (a, id, want) => { const v = numOf(a ? a[id] : undefined); return Number.isFinite(v) && Math.abs(v - want) <= 1e-7 * Math.max(1, Math.abs(want)); };

const PLV = new Set(["are", "were", "have", "arrive", "seem", "need"]);
const SGV = new Set(["is", "was", "has", "arrives", "seems", "needs"]);
const PASTV = new Set(["wrote", "painted", "sold", "won", "left", "broke", "took", "found"]);
const REFLV = { Tom: "himself", Priya: "herself", Omar: "himself", "The twins": "themselves", "The robot": "itself", "Our cousins": "themselves" };

function verifyAgree(q, a) {
  const p = q.params;
  const s = p.sentences[p.es];
  if (s[p.ei] !== p.wrong || p.wrong === p.fix) return false;
  // The fix is checked against the rule's own facts.
  const i = p.info;
  if (p.rule === "sv") {
    const plural = PLV.has(p.fix);
    if (!(plural || SGV.has(p.fix)) || plural !== i.pl || p.dir !== (plural ? "plur" : "sing")) return false;
    if (PLV.has(p.wrong) === plural) return false;
  } else if (p.rule === "tn") {
    if (!PASTV.has(p.fix) || PASTV.has(p.wrong) || p.dir !== "past" || !/(yesterday|last|ago)/i.test(i.adv)) return false;
  } else if (p.rule === "dm") {
    const isPl = (w) => w === "these" || w === "those", isFar = (w) => w === "that" || w === "those";
    const ok = (w) => ["this", "that", "these", "those"].includes(w);
    if (!ok(p.fix) || !ok(p.wrong) || isPl(p.fix) !== i.pl || isPl(p.wrong) === i.pl) return false;
    if (isFar(p.fix) !== i.far || isFar(p.wrong) !== i.far || p.dir !== (i.pl ? "plur" : "sing")) return false;
  } else if (p.rule === "pr") {
    const many = (w) => w === "themselves";
    const want = many(p.fix) && !many(p.wrong) ? "plur" : !many(p.fix) && many(p.wrong) ? "sing" : "gend";
    if (REFLV[i.subj] !== p.fix || p.fix === p.wrong || !REFLS.includes(p.wrong) || p.dir !== want) return false;
  } else if (p.rule === "ap") {
    const expect = i.kind === "its" ? "its" : i.base + "s";
    if (p.fix !== expect || p.wrong !== (i.kind === "its" ? "it's" : i.base + "'s") || p.dir !== "rm") return false;
  } else return false;
  // Every other word must still be in the original, correct sentence (exactly one word changed).
  if (s.filter((w, k) => k !== p.ei && w === p.wrong).length > 1) return false;
  const parts = q.parts;
  const has = (id) => parts.some((x) => x.id === id);
  if (has("sent") && strOf(a, "sent") !== `Sentence ${p.es + 1}`) return false;
  if (strOf(a, "word") !== `Word ${p.ei + 1}`) return false;
  if (!textIs(a, "fix", p.fix, [p.fix + "."])) return false;
  if (has("rule") && strOf(a, "rule") !== RULE[p.rule]) return false;
  if (has("rulefix") && strOf(a, "rulefix") !== `${RULE[p.rule]} | ${FIXD[p.dir]}`) return false;
  return true;
}

function verifyRead(q, a) {
  const p = q.params, band = (x) => (x < 28 ? "Plain" : x < 34 ? "Standard" : "Dense");
  // Alternative arrangement of the same formula: (W^2 + 10 Y S) / (S W).
  const idx = (t) => (t.W * t.W + 10 * t.Y * t.S) / (t.S * t.W);
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  if (p.tier === "expert-plus") {
    const { A, B } = p;
    let smin = 0;
    for (let S = 1; S <= 5000; S++) if (B.W / S + (10 * B.Y) / B.W < 28 - 1e-12) { smin = S; break; }
    return numIs(a, "indexa", idx(A)) && numIs(a, "indexb", idx(B)) &&
      strOf(a, "easier") === (idx(A) < idx(B) ? "Passage A" : "Passage B") && numIs(a, "smin", smin) && smin > B.S;
  }
  const t = p.t;
  if (!near(idx(t), t.idx)) return false;
  if (!numIs(a, "asl", t.W / t.S)) return false;
  if (!numIs(a, "index", idx(t))) return false;
  if (p.tier === "hard" && strOf(a, "band") !== band(idx(t))) return false;
  if (p.tier === "expert") {
    const i2 = (t.W * t.W + 10 * t.Y * 2 * t.S) / (2 * t.S * t.W);
    if (!numIs(a, "index2", i2) || strOf(a, "band2") !== band(i2) || band(i2) === band(idx(t))) return false;
  }
  return true;
}

function joinV(root, dbl, pre, suf) {
  let r = root;
  if (suf) {
    if (/^[aeiou]/.test(suf)) { const had = /e$/.test(r); r = r.replace(/e$/, ""); if (!had && dbl) r += r.slice(-1); }
    if (suf === "ness" || suf === "ly") r = r.replace(/([^aeiou])y$/, "$1i");
  }
  return (pre || "") + r + (suf || "");
}
function verifyWord(q, a) {
  const p = q.params;
  const word = joinV(p.root, p.dbl, p.pre, p.suf);
  const pp = p.pp, r = p.root;
  const sw = r.endsWith("sh") ? "es" : "s";
  const combo = `${p.pre || ""}+${p.suf || ""}`;
  const meanings = {
    "re+": `to ${r} again`, "mis+": `to ${r} wrongly`, "pre+": `to ${r} beforehand`, "un+": `not ${r}`,
    "+ness": `the state of being ${r}`, "+ly": `in a way that is ${r}`, "+ful": `full of ${r}`, "+less": `without ${r}`,
    "+er": `a person or thing that ${r}${sw}`, "+able": `able to be ${pp}`, "un+able": `not able to be ${pp}`, "re+able": `able to be ${pp} again`,
    "un+ness": `the state of not being ${r}`, "un+ly": `in a way that is not ${r}`,
  };
  const meaning = meanings[combo];
  const pos = { able: "adjective", ful: "adjective", less: "adjective", er: "noun", ness: "noun", ly: "adverb" }[p.suf] || p.rpos;
  if (!meaning || word.length < 3) return false;
  const parts = q.parts, has = (id) => parts.some((x) => x.id === id);
  if (strOf(a, "meaning") !== meaning) return false;
  if (has("pos") && strOf(a, "pos") !== pos) return false;
  if (has("word") && !textIs(a, "word", word, p.pre ? [`${p.pre}-${joinV(p.root, p.dbl, null, p.suf)}`] : [])) return false;
  if (has("letters") && !numIs(a, "letters", word.length)) return false;
  if (has("root") && !textIs(a, "root", p.root)) return false;
  if (has("affixes") && strOf(a, "affixes") !== `${p.pre}- | -${p.suf}`) return false;
  if (p.tier === "expert-plus" && !(p.pre && p.suf)) return false;
  return true;
}

function velV(sp, L) {
  const lex = (w) => L.lex[w];
  const np = (x) => {
    let n = lex(x.n); if (x.pl) n += L.suf;
    if (!x.adj) return n;
    let ad = lex(x.adj); if (L.agree && x.pl) ad += L.suf;
    return L.adjPos === "before" ? `${ad} ${n}` : `${n} ${ad}`;
  };
  const verb = `${sp.neg ? L.negP + " " : ""}${lex(sp.v.e)}${sp.past ? " " + L.pastP : ""}`;
  const S = np(sp.s), O = np(sp.o);
  if (L.order === "SVO") return `${S} ${verb} ${O}`;
  if (L.order === "SOV") return `${S} ${O} ${verb}`;
  return `${verb} ${S} ${O}`;
}
function engV(sp) {
  const np = (x) => `the ${x.adj ? x.adj + " " : ""}${x.n}${x.pl ? "s" : ""}`;
  const v = sp.v;
  let verb;
  if (sp.neg) verb = (sp.past ? "did" : sp.s.pl ? "do" : "does") + " not " + v.e;
  else verb = sp.past ? v.ep : sp.s.pl ? v.e : v.e3;
  return np(sp.s) + " " + verb + " " + np(sp.o);
}
function verifyLang(q, a) {
  const p = q.params, L = p.L, has = (id) => q.parts.some((x) => x.id === id);
  const base = new Set(Object.values(L.lex));
  const velAns = velV(p.sp, L);
  const marked = (s) => s.split(" ").filter((w) => !base.has(w)).length;
  if (!SUFS.includes(L.suf) || !PASTS.includes(L.pastP)) return false;
  if (has("trans") && !textIs(a, "trans", velAns, [velAns + "."])) return false;
  if (has("feat")) {
    const sp = p.sp;
    const f = sp.s.pl || sp.o.pl ? "Plural suffix" : sp.past ? "Past-tense particle" : sp.s.adj || sp.o.adj ? "Adjective position" : "Negation particle";
    if (strOf(a, "feat") !== f) return false;
  }
  if (has("back")) { const e = engV(p.sp2); if (!textIs(a, "back", e, [e + "."])) return false; }
  if (has("marked") && !numIs(a, "marked", marked(velAns))) return false;
  if (has("rw")) {
    const t = p.askTok;
    let kind;
    if (t === L.pastP) kind = "Past-tense particle";
    else if (t === L.negP) kind = "Negation particle";
    else if (t.endsWith(L.suf) && base.has(t.slice(0, -L.suf.length))) kind = L.adjs.some((x) => L.lex[x] === t.slice(0, -L.suf.length)) ? "Plural suffix on an adjective" : "Plural suffix on a noun";
    else return false;
    if (!velV(p.sp2, L).split(" ").includes(t) || strOf(a, "rw") !== kind) return false;
  }
  if (has("plsuf")) {
    // The examples must reveal the suffix and the particle.
    const e1 = velV(p.ex1, L).split(" ").filter((w) => !base.has(w));
    const e2 = velV(p.ex2, L).split(" ").filter((w) => !base.has(w));
    if (e1.length !== 1 || e2.length !== 1 || !e1[0].endsWith(L.suf) || e2[0] !== L.pastP) return false;
    if (strOf(a, "plsuf") !== "-" + L.suf || !textIs(a, "pastw", L.pastP)) return false;
  }
  return true;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
  switch (p.kind) {
    case "agree": return verifyAgree(question, answer);
    case "read": return verifyRead(question, answer);
    case "word": return verifyWord(question, answer);
    case "lang": return verifyLang(question, answer);
    default: return false;
  }
}
