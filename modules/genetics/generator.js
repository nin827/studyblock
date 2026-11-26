// Genetics generator. Uses only the seeded rng passed in by the engine.
//
// Generation works with probabilities (product rule: P(aa) = P(a from parent 1) × P(a from parent 2)).
// verify() works the other way: it enumerates every gamete combination (Punnett squares) and counts.
// Notation: alleles are one letter, upper case dominant (`T`/`t`); X-linked alleles are `X^H`/`X^h`
// with `Y`; ABO alleles are `I^A`, `I^B` and `i`. Genotypes are always choice answers, never typed.

// ---------- shared helpers ----------

const clean = (n) => {
  const r = Number(Number(n).toPrecision(12));
  return Object.is(r, -0) ? 0 : r;
};
const roundTo = (n, d) => {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
};
const num = (n) => String(clean(n));
const tolFor = (d) => (d > 0 ? 0.5 * 10 ** -d : 0);

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const fracStr = (n, d) => {
  const g = gcd(n, d) || 1;
  return `${n / g}/${d / g}`;
};
const ratioStr = (arr) => {
  const g = arr.reduce((a, b) => gcd(a, b), 0) || 1;
  return arr.map((x) => x / g).join(" : ");
};

const PCT_NOTE = " Give your answer as a percentage, without the % sign.";
const FRAC_NOTE = " Give your answer as a fraction in simplest form, like 3/4.";

// 4 distinct numeric options (strings) within [min, max]: correct + 3 plausible mistakes, topped up nearby.
function numChoices(correct, cands, d, rng, { suffix = "", min = 0, max = Infinity, step, snap = false } = {}) {
  const st = step ?? (d > 0 ? 10 ** -d : 1);
  const fmt = (v) => num(roundTo(v, d)) + suffix;
  const cStr = fmt(correct);
  const seen = new Set([cStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    const r = roundTo(v, d);
    if (r < min || r > max) return;
    if (snap && Math.abs(r / st - Math.round(r / st)) > 1e-9) return;
    const s = fmt(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  cands.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 2000; k++) {
    tryAdd(correct + k * st);
    tryAdd(correct - k * st);
  }
  return { answer: cStr, choices: rng.shuffle([cStr, ...out]) };
}

// Typed number (rounded to d places) or, sometimes, a 4-option choice. `note` is added to typed prompts only.
function finish(base, exact, d, cands, rng, opt = {}) {
  if (rng.next() < (opt.choiceP ?? 0.35)) {
    const { answer, choices } = numChoices(exact, cands, d, rng, opt);
    return { ...base, answerType: "choice", answer, choices };
  }
  return {
    ...base,
    prompt: base.prompt + (opt.note || ""),
    answerType: "number",
    answer: roundTo(exact, d),
    tolerance: tolFor(d),
  };
}

// 4 distinct string options: correct + the first 3 distinct distractors from the pool.
function strChoices(correct, pool, rng) {
  const out = [correct];
  for (const c of pool) {
    if (out.length >= 4) break;
    if (c && !out.includes(c)) out.push(c);
  }
  if (out.length < 4) throw new Error("not enough distractors");
  return rng.shuffle(out);
}

// ---------- traits ----------

// Complete dominance, one gene. `one`/`many`: the organism; dom/rec: the phenotypes.
const MONO = [
  { one: "pea plant", many: "pea plants", L: "T", dom: "tall", rec: "short" },
  { one: "pea plant", many: "pea plants", L: "R", dom: "round seeds", rec: "wrinkled seeds" },
  { one: "pea plant", many: "pea plants", L: "Y", dom: "yellow seeds", rec: "green seeds" },
  { one: "pea plant", many: "pea plants", L: "P", dom: "purple flowers", rec: "white flowers" },
  { one: "pea plant", many: "pea plants", L: "G", dom: "green pods", rec: "yellow pods" },
  { one: "guinea pig", many: "guinea pigs", L: "B", dom: "black fur", rec: "white fur" },
  { one: "mouse", many: "mice", L: "B", dom: "black fur", rec: "brown fur" },
  { one: "fruit fly", many: "fruit flies", L: "N", dom: "normal wings", rec: "vestigial wings" },
  { one: "tomato plant", many: "tomato plants", L: "R", dom: "red fruit", rec: "yellow fruit" },
  { one: "maize plant", many: "maize plants", L: "P", dom: "purple kernels", rec: "yellow kernels" },
  { one: "rabbit", many: "rabbits", L: "B", dom: "black fur", rec: "brown fur" },
];

// Two genes on different chromosomes (independent assortment).
const DI = [
  {
    one: "pea plant", many: "pea plants",
    A: { L: "R", dom: "round", rec: "wrinkled" }, B: { L: "Y", dom: "yellow", rec: "green" }, noun: "seeds",
  },
  {
    one: "pea plant", many: "pea plants",
    A: { L: "T", dom: "tall", rec: "short" }, B: { L: "P", dom: "purple", rec: "white" }, noun: "flowers",
    phen: (a, b) => `${a}, ${b} flowers`,
  },
  {
    one: "guinea pig", many: "guinea pigs",
    A: { L: "B", dom: "black", rec: "white" }, B: { L: "R", dom: "rough", rec: "smooth" }, noun: "fur",
  },
  {
    one: "tomato plant", many: "tomato plants",
    A: { L: "T", dom: "tall", rec: "dwarf" }, B: { L: "R", dom: "red", rec: "yellow" }, noun: "fruit",
    phen: (a, b) => `${a}, ${b} fruit`,
  },
  {
    one: "fruit fly", many: "fruit flies",
    A: { L: "G", dom: "grey-bodied", rec: "ebony-bodied" }, B: { L: "N", dom: "normal", rec: "vestigial" }, noun: "wings",
    phen: (a, b) => `${a} with ${b} wings`,
  },
  {
    one: "pea plant", many: "pea plants",
    A: { L: "T", dom: "tall", rec: "short" }, B: { L: "R", dom: "round", rec: "wrinkled" }, noun: "seeds",
    phen: (a, b) => `${a} with ${b} seeds`,
  },
  {
    one: "rabbit", many: "rabbits",
    A: { L: "B", dom: "black", rec: "brown" }, B: { L: "L", dom: "short", rec: "long" }, noun: "fur",
    phen: (a, b) => `${a}, ${b}-haired`,
  },
  {
    one: "maize plant", many: "maize plants",
    A: { L: "P", dom: "purple", rec: "yellow" }, B: { L: "S", dom: "smooth", rec: "wrinkled" }, noun: "kernels",
    phen: (a, b) => `${a}, ${b} kernels`,
  },
];
const diPhen = (t, aDom, bDom) => {
  const a = aDom ? t.A.dom : t.A.rec;
  const b = bDom ? t.B.dom : t.B.rec;
  return t.phen ? t.phen(a, b) : `${a} ${b} ${t.noun}`;
};

// Genotype text for one gene with k dominant alleles (2 = TT, 1 = Tt, 0 = tt).
const g1 = (L, k) => (k === 2 ? L + L : k === 1 ? L + L.toLowerCase() : L.toLowerCase() + L.toLowerCase());
const code = (s) => "`" + s + "`";

// Probability a parent with k dominant alleles passes on the dominant allele.
const pD = (k) => k / 2;
// Offspring genotype probabilities [P(0 dominant), P(1), P(2)] from the product rule.
function monoProbs(k1, k2) {
  const p1 = pD(k1), p2 = pD(k2);
  return [(1 - p1) * (1 - p2), p1 * (1 - p2) + (1 - p1) * p2, p1 * p2];
}

// Markdown Punnett square for one gene.
function monoSquare(L, k1, k2) {
  const l = L.toLowerCase();
  const gam = (k) => [k >= 1 ? L : l, k === 2 ? L : l];
  const top = gam(k1), side = gam(k2);
  const cell = (a, b) => code(a === L || b !== L ? a + b : b + a);
  return [
    `| | ${code(top[0])} | ${code(top[1])} |`,
    "| --- | --- | --- |",
    `| ${code(side[0])} | ${cell(top[0], side[0])} | ${cell(top[1], side[0])} |`,
    `| ${code(side[1])} | ${cell(top[0], side[1])} | ${cell(top[1], side[1])} |`,
  ].join("\n");
}
function monoGametesText(L, k) {
  const l = L.toLowerCase();
  if (k === 2) return `${code(g1(L, 2))} makes only ${code(L)} gametes`;
  if (k === 0) return `${code(g1(L, 0))} makes only ${code(l)} gametes`;
  return `${code(g1(L, 1))} makes ${code(L)} and ${code(l)} gametes in equal numbers`;
}

// ---------- Punnett squares (one gene) ----------

function genPunnett(difficulty, rng) {
  const t = rng.pick(MONO);
  const L = t.L, l = L.toLowerCase();
  const intro = `In ${t.many}, the allele for ${t.dom} (${code(L)}) is dominant over the allele for ${t.rec} (${code(l)}).`;
  const crossLine = (k1, k2) => `A ${code(g1(L, k1))} ${t.one} is crossed with a ${code(g1(L, k2))} ${t.one}.`;
  const gametesHint = (k1, k2) => `Write each parent's gametes: ${monoGametesText(L, k1)}; ${monoGametesText(L, k2)}.`;
  const squareHint = (k1, k2) => `Draw the Punnett square, putting one allele from each parent in every box:\n\n${monoSquare(L, k1, k2)}`;
  const solution = (k1, k2) =>
    `${gametesHint(k1, k2).replace("Write each parent's gametes: ", "Gametes: ")}\n\nPunnett square:\n\n${monoSquare(L, k1, k2)}`;

  if (difficulty === "easy") {
    const pairs = [[1, 1], [1, 0], [2, 0], [2, 1], [1, 2], [0, 1]];
    const [k1, k2] = rng.pick(pairs);
    const kind = rng.pick(["pctRec", "pctDom", "boxes"]);
    const pr = monoProbs(k1, k2);
    const base = { explanation: "", params: { sub: "punnett", kind, k1, k2 } };
    if (kind === "boxes") {
      const gk = rng.pick([0, 1, 2].filter((k) => pr[k] > 0));
      const exact = 4 * pr[gk];
      base.params.gk = gk;
      base.prompt = `${intro} ${crossLine(k1, k2)} In the Punnett square for this cross, how many of the 4 boxes contain the genotype ${code(g1(L, gk))}?`;
      base.explanation = `${solution(k1, k2)}\n\nCount the ${code(g1(L, gk))} boxes: **${exact}** of the 4.`;
      base.hints = [gametesHint(k1, k2), squareHint(k1, k2) + `\n\nNow count the boxes that read ${code(g1(L, gk))}.`];
      return finish(base, exact, 0, [4 - exact, exact + 1, exact - 1, 4 * pr[2 - gk]], rng, { max: 4 });
    }
    const rec = kind === "pctRec";
    const exact = 100 * (rec ? pr[0] : 1 - pr[0]);
    base.prompt = `${intro} ${crossLine(k1, k2)} What percentage of the offspring are expected to have the ${rec ? "recessive" : "dominant"} phenotype (${rec ? t.rec : t.dom})?`;
    base.explanation =
      `${solution(k1, k2)}\n\n${rec ? `Only ${code(g1(L, 0))} boxes show ${t.rec}.` : `Every box with at least one ${code(L)} shows ${t.dom}.`} ` +
      `Each box is a quarter of the offspring, so the answer is **${num(exact)}%**.`;
    base.hints = [
      gametesHint(k1, k2),
      squareHint(k1, k2) +
        `\n\n${rec ? `Count the boxes with two ${code(l)} alleles.` : `Count the boxes with at least one ${code(L)}.`} Each box is a quarter of the offspring.`,
    ];
    return finish(base, exact, 0, [100 - exact, 50, exact === 50 ? 75 : 25], rng, { suffix: "%", max: 100, step: 25, snap: true, note: PCT_NOTE });
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["genoRatio", "phenoRatio", "expected", "expected"]);
    if (kind === "genoRatio") {
      const [k1, k2] = rng.pick([[1, 1], [2, 1], [1, 0], [2, 0], [1, 2], [0, 1]]);
      const pr = monoProbs(k1, k2);
      const order = `${code(g1(L, 2))} : ${code(g1(L, 1))} : ${code(g1(L, 0))}`;
      const correct = ratioStr([pr[2] * 4, pr[1] * 4, pr[0] * 4]);
      const pool = rng.shuffle(["1 : 2 : 1", "1 : 1 : 0", "0 : 1 : 1", "0 : 1 : 0", "1 : 0 : 1", "3 : 1 : 0", "2 : 1 : 1"]);
      return {
        prompt: `${intro} ${crossLine(k1, k2)} What is the expected genotype ratio ${order} among the offspring?`,
        answerType: "choice",
        answer: correct,
        choices: strChoices(correct, pool, rng),
        explanation: `${solution(k1, k2)}\n\nCount each genotype in the four boxes and write them in the order ${order}: **${correct}** (simplified).`,
        hints: [gametesHint(k1, k2), squareHint(k1, k2) + `\n\nCount the boxes of each genotype, in the order ${order}, and simplify.`],
        params: { sub: "punnett", kind, k1, k2 },
      };
    }
    if (kind === "phenoRatio") {
      const [k1, k2] = rng.pick([[1, 1], [1, 0], [0, 1]]);
      const pr = monoProbs(k1, k2);
      const correct = ratioStr([4 * (1 - pr[0]), 4 * pr[0]]);
      const pool = rng.shuffle(["3 : 1", "1 : 1", "1 : 3", "1 : 2 : 1", "2 : 1"]);
      return {
        prompt: `${intro} ${crossLine(k1, k2)} What is the expected phenotype ratio ${t.dom} : ${t.rec} among the offspring?`,
        answerType: "choice",
        answer: correct,
        choices: strChoices(correct, pool, rng),
        explanation: `${solution(k1, k2)}\n\nBoxes with at least one ${code(L)} show ${t.dom}; ${code(g1(L, 0))} boxes show ${t.rec}. In the order ${t.dom} : ${t.rec} that is **${correct}**.`,
        hints: [gametesHint(k1, k2), squareHint(k1, k2) + `\n\nSort the boxes into ${t.dom} (at least one ${code(L)}) and ${t.rec} (${code(g1(L, 0))}), in that order.`],
        params: { sub: "punnett", kind, k1, k2 },
      };
    }
    // expected number out of n offspring
    const [k1, k2] = rng.pick([[1, 1], [1, 0], [0, 1], [1, 1]]);
    const n = 4 * rng.int(5, 60);
    const rec = rng.next() < 0.5;
    const pr = monoProbs(k1, k2);
    const p = rec ? pr[0] : 1 - pr[0];
    const exact = n * p;
    const phen = rec ? t.rec : t.dom;
    return finish(
      {
        prompt: `${intro} ${crossLine(k1, k2)} The cross produces ${n} offspring. How many are expected to have ${phen}?`,
        explanation: `${solution(k1, k2)}\n\n${rec ? `${code(g1(L, 0))} boxes` : `Boxes with at least one ${code(L)}`}: ${4 * p} of 4, so the expected number is \`${n} × ${4 * p} / 4\` = **${num(exact)}**.`,
        hints: [
          gametesHint(k1, k2),
          squareHint(k1, k2) + `\n\nFind the fraction of boxes with ${phen}, then multiply that fraction by ${n}.`,
        ],
        params: { sub: "punnett", kind: "expected", k1, k2, n, rec },
      },
      exact,
      0,
      [n - exact, n / 2, n * pr[1], exact / 4],
      rng,
      { max: n },
    );
  }

  // hard
  const kind = rng.pick(["cond", "infer", "infer", "multi", "multi"]);
  if (kind === "cond") {
    const [k1, k2] = rng.pick([[1, 1], [1, 1], [2, 1]]);
    const het = rng.next() < 0.6;
    const pr = monoProbs(k1, k2);
    const domBoxes = 4 * (pr[1] + pr[2]);
    const wanted = 4 * (het ? pr[1] : pr[2]);
    const correct = fracStr(wanted, domBoxes);
    const pool = rng.shuffle(["2/3", "1/2", "1/3", "1/4", "3/4"]).filter((x) => x !== correct);
    const which = het ? `heterozygous (${code(g1(L, 1))})` : `homozygous dominant (${code(g1(L, 2))})`;
    const prompt = `${intro} ${crossLine(k1, k2)} One offspring with ${t.dom} is picked at random. What is the probability that it is ${which}?`;
    const base = {
      prompt,
      explanation:
        `${solution(k1, k2)}\n\nOnly the ${t.dom} offspring count, so the denominator is the ${domBoxes} boxes with at least one ${code(L)}, not all 4.\n\n` +
        `${wanted} of those ${domBoxes} are ${code(g1(L, het ? 1 : 2))}, so the probability is **${correct}**.`,
      hints: [
        gametesHint(k1, k2),
        squareHint(k1, k2),
        `You already know the offspring has ${t.dom}, so cross out the ${code(g1(L, 0))} boxes (if any). Of the boxes left, what fraction are ${code(g1(L, het ? 1 : 2))}?`,
      ],
      params: { sub: "punnett", kind: "cond", k1, k2, het },
    };
    if (rng.next() < 0.5) return { ...base, answerType: "choice", answer: correct, choices: strChoices(correct, pool, rng) };
    return { ...base, prompt: prompt + FRAC_NOTE, answerType: "text", answer: correct };
  }

  if (kind === "infer") {
    const scen = rng.pick(["dd", "dr", "drAll"]);
    let dom, rec, p2Dom, correct, pool;
    const pair = (a, b) => `${code(g1(L, a))} × ${code(g1(L, b))}`;
    const total = 4 * rng.int(10, 40);
    if (scen === "dd") {
      rec = total / 4 + rng.int(-3, 3);
      dom = total - rec;
      p2Dom = true;
      correct = pair(1, 1);
      pool = rng.shuffle([pair(2, 1), pair(2, 2), pair(1, 0)]);
    } else if (scen === "dr") {
      rec = total / 2 + rng.int(-4, 4);
      dom = total - rec;
      p2Dom = false;
      correct = pair(1, 0);
      pool = rng.shuffle([pair(2, 0), pair(1, 1), pair(0, 0)]);
    } else {
      rec = 0;
      dom = total;
      p2Dom = false;
      correct = pair(2, 0);
      pool = rng.shuffle([pair(1, 0), pair(2, 1), pair(1, 1)]);
    }
    const parents = p2Dom ? `Two ${t.many} with ${t.dom} are crossed.` : `A ${t.one} with ${t.dom} is crossed with a ${t.one} with ${t.rec}.`;
    const result = rec === 0 ? `All ${dom} offspring have ${t.dom}.` : `They have ${dom} offspring with ${t.dom} and ${rec} with ${t.rec}.`;
    const why =
      scen === "dd"
        ? `Some offspring are ${code(g1(L, 0))}, so each parent must carry ${code(l)}. Both show ${t.dom}, so both are ${code(g1(L, 1))}, and ${code(g1(L, 1))} × ${code(g1(L, 1))} gives about 3 : 1.`
        : scen === "dr"
          ? `The ${t.rec} parent is ${code(g1(L, 0))}. Some offspring are ${t.rec}, so the other parent must also pass on ${code(l)}: it is ${code(g1(L, 1))}, which gives about 1 : 1.`
          : `The ${t.rec} parent is ${code(g1(L, 0))} and passes ${code(l)} to every offspring. No ${t.rec} offspring among ${total} means the other parent almost certainly has no ${code(l)}: it is ${code(g1(L, 2))}. (A ${code(g1(L, 1))} parent would give about half ${t.rec}.)`;
    return {
      prompt: `${intro} ${parents} ${result} Which parent genotypes (in the order the parents are described) best explain these results?`,
      answerType: "choice",
      answer: correct,
      choices: strChoices(correct, pool, rng),
      explanation: `${why}\n\nSo the parents are **${correct}**.`,
      hints: [
        `A ${t.rec} ${t.one} must be ${code(g1(L, 0))}. A ${t.one} with ${t.dom} could be ${code(g1(L, 2))} or ${code(g1(L, 1))}.`,
        rec > 0
          ? `Some offspring are ${t.rec}, so they got ${code(l)} from both parents. Which parents can pass on ${code(l)}?`
          : `None of the ${total} offspring are ${t.rec}. What would you expect if the ${t.dom} parent carried ${code(l)}?`,
      ],
      params: { sub: "punnett", kind: "infer", dom, rec, p1Dom: true, p2Dom, L },
    };
  }

  // multi-part: percentage, expected number, genotype ratio
  const [k1, k2] = rng.pick([[1, 1], [1, 0], [1, 1], [0, 1]]);
  const pr = monoProbs(k1, k2);
  const n = 4 * rng.int(10, 80);
  const pctRec = 100 * pr[0];
  const expDom = n * (1 - pr[0]);
  const order = `${code(g1(L, 2))} : ${code(g1(L, 1))} : ${code(g1(L, 0))}`;
  const ratio = ratioStr([pr[2] * 4, pr[1] * 4, pr[0] * 4]);
  const pool = rng.shuffle(["1 : 2 : 1", "0 : 1 : 1", "1 : 1 : 0", "3 : 1 : 0", "0 : 3 : 1"]);
  return {
    prompt: `${intro} ${crossLine(k1, k2)} The cross produces ${n} offspring.`,
    answerType: "multi",
    parts: [
      {
        id: "pct", label: "Recessive offspring", ask: `What percentage are expected to have ${t.rec}?${PCT_NOTE}`,
        answerType: "number", answer: pctRec, tolerance: 0,
        hint: `${gametesHint(k1, k2)} Then count the ${code(g1(L, 0))} boxes; each box is a quarter.`,
      },
      {
        id: "num", label: "Expected number", ask: `How many of the ${n} offspring are expected to have ${t.dom}?`,
        answerType: "number", answer: expDom, tolerance: 0,
        hint: `Every box with at least one ${code(L)} shows ${t.dom}. Find that fraction of the square and multiply it by ${n}.`,
      },
      {
        id: "ratio", label: "Genotype ratio", ask: `What is the expected genotype ratio ${order}?`,
        answerType: "choice", answer: ratio, choices: strChoices(ratio, pool, rng),
        hint: `Count the boxes of each genotype in the order ${order}, then simplify.`,
      },
    ],
    explanation:
      `${solution(k1, k2)}\n\n` +
      `**Recessive offspring:** ${4 * pr[0]} of 4 boxes are ${code(g1(L, 0))}, so **${num(pctRec)}%**.\n\n` +
      `**Expected number:** ${4 - 4 * pr[0]} of 4 boxes show ${t.dom}, so \`${n} × ${4 - 4 * pr[0]} / 4\` = **${num(expDom)}**.\n\n` +
      `**Genotype ratio:** ${order} = **${ratio}**.`,
    params: { sub: "punnett", kind: "multi", k1, k2, n },
  };
}

// ---------- Dihybrid crosses ----------

// Genotype text for two genes: kA/kB = dominant allele counts.
const g2 = (t, kA, kB) => g1(t.A.L, kA) + g1(t.B.L, kB);
// Gametes by the "generate" route: each gene independently.
function gametesOf(t, kA, kB) {
  const a = t.A.L, b = t.B.L;
  const as = kA === 2 ? [a] : kA === 0 ? [a.toLowerCase()] : [a, a.toLowerCase()];
  const bs = kB === 2 ? [b] : kB === 0 ? [b.toLowerCase()] : [b, b.toLowerCase()];
  const out = [];
  for (const x of as) for (const y of bs) out.push(x + y);
  return out;
}
// Phenotype class probabilities by the product rule: [AB, Ab, aB, ab] (dominant/recessive for each gene).
function diPhenoProbs(pa1, pa2) {
  const [a0] = monoProbs(pa1[0], pa2[0]);
  const [b0] = monoProbs(pa1[1], pa2[1]);
  return [(1 - a0) * (1 - b0), (1 - a0) * b0, a0 * (1 - b0), a0 * b0];
}
const RATIO_CROSSES = [
  [[1, 1], [1, 1]],
  [[1, 1], [0, 0]],
  [[1, 1], [0, 1]],
  [[1, 1], [1, 0]],
  [[1, 0], [0, 1]],
];

function genDihybrid(difficulty, rng) {
  const t = rng.pick(DI);
  const a = t.A.L, b = t.B.L;
  const intro =
    `In ${t.many}, ${code(a)} (${t.A.dom}) is dominant over ${code(a.toLowerCase())} (${t.A.rec}), and ${code(b)} (${t.B.dom}) is dominant over ${code(b.toLowerCase())} (${t.B.rec}). ` +
    `The two genes are on different chromosomes, so they assort independently.`;
  const cross = (p1, p2) => `A ${code(g2(t, ...p1))} ${t.one} is crossed with a ${code(g2(t, ...p2))} ${t.one}.`;
  const order = `${diPhen(t, true, true)} : ${diPhen(t, true, false)} : ${diPhen(t, false, true)} : ${diPhen(t, false, false)}`;
  const gamHint = (p1, p2) =>
    `Gametes get one allele of each gene. ${code(g2(t, ...p1))} makes ${gametesOf(t, ...p1).map(code).join(", ")}; ${code(g2(t, ...p2))} makes ${gametesOf(t, ...p2).map(code).join(", ")}.`;
  const splitHint = (p1, p2) =>
    `Treat the genes separately and multiply. ${code(g1(a, p1[0]))} × ${code(g1(a, p2[0]))} and ${code(g1(b, p1[1]))} × ${code(g1(b, p2[1]))} are two one-gene crosses.`;
  const geneLine = (p1, p2) => {
    const pa = monoProbs(p1[0], p2[0]);
    const pb = monoProbs(p1[1], p2[1]);
    return (
      `Gene ${code(a)}: ${code(g1(a, p1[0]))} × ${code(g1(a, p2[0]))} gives ${t.A.dom} ${fracStr(4 * (1 - pa[0]), 4)}, ${t.A.rec} ${fracStr(4 * pa[0], 4)}.\n\n` +
      `Gene ${code(b)}: ${code(g1(b, p1[1]))} × ${code(g1(b, p2[1]))} gives ${t.B.dom} ${fracStr(4 * (1 - pb[0]), 4)}, ${t.B.rec} ${fracStr(4 * pb[0], 4)}.`
    );
  };

  if (difficulty === "easy") {
    const kind = rng.pick(["gametes", "gametes", "nGametes", "ratio"]);
    if (kind === "gametes" || kind === "nGametes") {
      const p = rng.pick([[1, 1], [1, 1], [2, 1], [1, 2], [1, 0], [0, 1], [2, 0], [1, 1]]);
      const gs = gametesOf(t, ...p);
      const geno = g2(t, ...p);
      const hints = [
        "Each gamete gets exactly one allele of each gene.",
        `${code(geno)}: the first gene can give ${[...new Set([geno[0], geno[1]])].map(code).join(" or ")}, the second ${[...new Set([geno[2], geno[3]])].map(code).join(" or ")}. Combine every option of the first with every option of the second.`,
      ];
      if (kind === "nGametes") {
        return finish(
          {
            prompt: `${intro} How many genetically different types of gamete can a ${code(geno)} ${t.one} make?`,
            explanation: `Each gamete gets one allele of each gene, so the types are ${gs.map(code).join(", ")}: **${gs.length}**.`,
            hints,
            params: { sub: "dihybrid", kind, p },
          },
          gs.length,
          0,
          [4, 2, 1, 8, 3],
          rng,
          { min: 1 },
        );
      }
      const correct = gs.join(", ");
      const all4 = gametesOf(t, 1, 1).join(", ");
      const pool = rng.shuffle([
        `${geno.slice(0, 2)}, ${geno.slice(2)}`,
        `${a}, ${a.toLowerCase()}, ${b}, ${b.toLowerCase()}`,
        all4,
        `${a}${b}, ${a.toLowerCase()}${b.toLowerCase()}`,
        `${a}${a}${b}${b}, ${a.toLowerCase()}${a.toLowerCase()}${b.toLowerCase()}${b.toLowerCase()}`,
      ]);
      return {
        prompt: `${intro} Which list shows all the types of gamete a ${code(geno)} ${t.one} can make?`,
        answerType: "choice",
        answer: correct,
        choices: strChoices(correct, pool, rng),
        explanation: `A gamete gets one allele of each gene. Combining the options gives **${correct}**.`,
        hints,
        params: { sub: "dihybrid", kind, p, LA: a, LB: b },
      };
    }
    const [p1, p2] = rng.pick(RATIO_CROSSES.slice(0, 2));
    return ratioQuestion(t, p1, p2, rng, intro, cross, order, gamHint, geneLine);
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["ratio", "boxes", "expected"]);
    if (kind === "ratio") {
      const [p1, p2] = rng.pick(RATIO_CROSSES);
      return ratioQuestion(t, p1, p2, rng, intro, cross, order, gamHint, geneLine);
    }
    const [p1, p2] = rng.pick([...RATIO_CROSSES, [[2, 1], [0, 1]], [[1, 2], [1, 0]]]);
    const probs = diPhenoProbs(p1, p2);
    const cls = rng.pick([0, 1, 2, 3].filter((i) => probs[i] > 0));
    const aDom = cls < 2, bDom = cls % 2 === 0;
    const ph = diPhen(t, aDom, bDom);
    if (kind === "boxes") {
      const exact = 16 * probs[cls];
      return finish(
        {
          prompt: `${intro} ${cross(p1, p2)} In a 4 × 4 Punnett square for this cross (four gametes from each parent, repeating any that are the same), how many of the 16 boxes are ${ph}?`,
          explanation:
            `${gamHint(p1, p2)}\n\nIt is quicker to treat the genes separately:\n\n${geneLine(p1, p2)}\n\n` +
            `Multiply the two fractions and scale to 16 boxes: **${num(exact)}**.`,
          hints: [gamHint(p1, p2), splitHint(p1, p2) + ` Multiply the two fractions for ${ph}, then scale up to 16 boxes.`],
          params: { sub: "dihybrid", kind, p1, p2, cls },
        },
        exact,
        0,
        [16 - exact, 9, 3, 1, exact * 2],
        rng,
        { min: 0, max: 16 },
      );
    }
    const n = 16 * rng.int(5, 40);
    const exact = n * probs[cls];
    return finish(
      {
        prompt: `${intro} ${cross(p1, p2)} The cross produces ${n} offspring. How many are expected to be ${ph}?`,
        explanation: `${geneLine(p1, p2)}\n\nMultiply the fractions for ${ph} and then by ${n}: **${num(exact)}**.`,
        hints: [splitHint(p1, p2), `Find the fraction of offspring that are ${ph} (product of the two gene fractions), then multiply it by ${n}.`],
        params: { sub: "dihybrid", kind, p1, p2, cls, n },
      },
      exact,
      0,
      [n / 16, n / 4, n - exact, n * (1 - probs[cls]) / 3],
      rng,
      { max: n },
    );
  }

  // hard: random parents, probability of a genotype or phenotype; or multi-part.
  const kind = rng.pick(["prob", "prob", "multi"]);
  let p1, p2;
  do {
    p1 = [rng.int(0, 2), rng.int(0, 2)];
    p2 = [rng.int(0, 2), rng.int(0, 2)];
  } while ([p1[0], p1[1], p2[0], p2[1]].filter((k) => k === 1).length < 2);
  const pa = monoProbs(p1[0], p2[0]);
  const pb = monoProbs(p1[1], p2[1]);

  if (kind === "prob") {
    const probsAll = diPhenoProbs(p1, p2);
    const phenOk = [0, 1, 2, 3].filter((i) => probsAll[i] > 0 && probsAll[i] < 1);
    const byGeno = rng.next() < 0.5 || phenOk.length === 0;
    let target, frac16, what, why;
    if (byGeno) {
      const opts = [];
      for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) if (pa[x] * pb[y] > 0) opts.push([x, y]);
      const [x, y] = rng.pick(opts);
      frac16 = 16 * pa[x] * pb[y];
      target = { geno: [x, y] };
      what = `the genotype ${code(g2(t, x, y))}`;
      why = `P(${code(g1(a, x))}) = ${fracStr(16 * pa[x], 16)} and P(${code(g1(b, y))}) = ${fracStr(16 * pb[y], 16)}. Multiply them.`;
    } else {
      const cls = rng.pick(phenOk);
      frac16 = 16 * probsAll[cls];
      target = { cls };
      const aDom = cls < 2, bDom = cls % 2 === 0;
      what = `the phenotype ${diPhen(t, aDom, bDom)}`;
      why =
        `P(${aDom ? t.A.dom : t.A.rec}) = ${fracStr(16 * (aDom ? 1 - pa[0] : pa[0]), 16)} and P(${bDom ? t.B.dom : t.B.rec}) = ${fracStr(16 * (bDom ? 1 - pb[0] : pb[0]), 16)}. Multiply them.`;
    }
    const prompt = `${intro} ${cross(p1, p2)} What is the probability that an offspring has ${what}?`;
    const base = {
      prompt,
      explanation: `Split the cross into two one-gene crosses.\n\n${geneLine(p1, p2)}\n\n${why}`,
      hints: [splitHint(p1, p2), `For each gene, use a small Punnett square to find the probability of the part of ${what} that it controls. Then multiply the two probabilities.`],
      params: { sub: "dihybrid", kind: "prob", p1, p2, ...target },
    };
    if (rng.next() < 0.5) {
      const ans = fracStr(frac16, 16);
      base.explanation += ` The probability is **${ans}**.`;
      return { ...base, prompt: prompt + FRAC_NOTE, answerType: "text", answer: ans, params: { ...base.params, as: "frac" } };
    }
    const exact = (frac16 / 16) * 100;
    base.explanation += ` That is ${fracStr(frac16, 16)} = **${num(exact)}%**.`;
    return finish(
      { ...base, prompt: prompt + " Give it as a percentage (to 2 decimal places where needed).", params: { ...base.params, as: "pct" } },
      exact,
      2,
      [100 - exact, exact * 2, exact / 2, 6.25 * (frac16 + 1)],
      rng,
      { suffix: "%", max: 100, step: 6.25, snap: true, note: " Type the number without the % sign." },
    );
  }

  // multi: AaBb × AaBb family cross with a target phenotype
  const [q1, q2] = rng.pick(RATIO_CROSSES);
  const probs = diPhenoProbs(q1, q2);
  const cls = rng.pick([0, 1, 2, 3].filter((i) => probs[i] > 0));
  const aDom = cls < 2, bDom = cls % 2 === 0;
  const ph = diPhen(t, aDom, bDom);
  const n = 16 * rng.int(5, 50);
  const pct = probs[cls] * 100;
  const expd = n * probs[cls];
  const ratio = ratioStr(diPhenoProbs(q1, q2).map((x) => x * 16));
  const pool = rng.shuffle(["9 : 3 : 3 : 1", "1 : 1 : 1 : 1", "3 : 1 : 3 : 1", "3 : 3 : 1 : 1", "1 : 3 : 3 : 9"]);
  return {
    prompt: `${intro} ${cross(q1, q2)} The cross produces ${n} offspring.`,
    answerType: "multi",
    parts: [
      {
        id: "ratio", label: "Phenotype ratio", ask: `What is the expected phenotype ratio ${order}?`,
        answerType: "choice", answer: ratio, choices: strChoices(ratio, pool, rng),
        hint: `${splitHint(q1, q2)} Multiply the fractions for each of the four phenotypes, in the order given.`,
      },
      {
        id: "pct", label: "Probability", ask: `What percentage of offspring are expected to be ${ph}? Give it to 2 decimal places where needed, without the % sign.`,
        answerType: "number", answer: roundTo(pct, 2), tolerance: 0.005,
        hint: `Use the fraction of offspring that are ${ph} from the ratio, and turn it into a percentage.`,
      },
      {
        id: "num", label: "Expected number", ask: `How many of the ${n} offspring are expected to be ${ph}?`,
        answerType: "number", answer: expd, tolerance: 0,
        hint: `Multiply the fraction that are ${ph} by ${n}.`,
      },
    ],
    explanation:
      `${geneLine(q1, q2)}\n\n**Phenotype ratio:** multiplying the gene fractions gives ${order} = **${ratio}**.\n\n` +
      `**Probability:** ${ph} is ${fracStr(16 * probs[cls], 16)} of the offspring = **${num(pct)}%**.\n\n` +
      `**Expected number:** \`${n} × ${fracStr(16 * probs[cls], 16)}\` = **${num(expd)}**.`,
    params: { sub: "dihybrid", kind: "multi", p1: q1, p2: q2, cls, n },
  };
}

function ratioQuestion(t, p1, p2, rng, intro, cross, order, gamHint, geneLine) {
  const correct = ratioStr(diPhenoProbs(p1, p2).map((x) => x * 16));
  const pool = rng.shuffle(["9 : 3 : 3 : 1", "1 : 1 : 1 : 1", "3 : 1 : 3 : 1", "3 : 3 : 1 : 1", "1 : 3 : 3 : 9", "3 : 1"]);
  return {
    prompt: `${intro} ${cross(p1, p2)} What is the expected phenotype ratio ${order}?`,
    answerType: "choice",
    answer: correct,
    choices: strChoices(correct, pool, rng),
    explanation: `${geneLine(p1, p2)}\n\nMultiply the fractions for each phenotype, in the order ${order}, and simplify: **${correct}**.`,
    hints: [
      gamHint(p1, p2),
      `Quicker: treat each gene as its own one-gene cross, then multiply the fractions for each of the four phenotypes, in the order given.`,
    ],
    params: { sub: "dihybrid", kind: "ratio", p1, p2 },
  };
}

// ---------- Sex-linked & blood groups ----------

const XL = [
  { name: "haemophilia", L: "H", aff: "has haemophilia", unaff: "has normal blood clotting", affAdj: "with haemophilia" },
  { name: "red-green colour blindness", L: "B", aff: "is colour-blind", unaff: "has normal colour vision", affAdj: "who is colour-blind" },
  { name: "G6PD deficiency", L: "G", aff: "has G6PD deficiency", unaff: "is unaffected", affAdj: "with G6PD deficiency" },
];
const xa = (L, dom) => `X^${dom ? L : L.toLowerCase()}`;
// Mother: m = number of dominant X alleles (0-2); father: f = 1 if his X is dominant.
const motherG = (L, m) => (m === 2 ? `${xa(L, 1)} ${xa(L, 1)}` : m === 1 ? `${xa(L, 1)} ${xa(L, 0)}` : `${xa(L, 0)} ${xa(L, 0)}`);
const fatherG = (L, f) => `${xa(L, f)} Y`;
const motherDesc = (d, m) => (m === 2 ? "a woman who is not a carrier" : m === 1 ? "a woman who is a carrier" : `a woman who ${d.aff}`);

// Product-rule probabilities. Returns fractions for each X-linked target.
function xlProbs(m, f) {
  const pm = m / 2; // P(mother passes dominant X)
  return {
    sonAff: 1 - pm,
    dauAff: f ? 0 : 1 - pm,
    dauCarrier: f ? 1 - pm : pm,
    childAffSon: 0.5 * (1 - pm),
    childAff: 0.5 * (1 - pm) + 0.5 * (f ? 0 : 1 - pm),
  };
}
const XL_ASK = {
  sonAff: (d) => `What is the probability that a son of this couple ${d.aff}?`,
  dauAff: (d) => `What is the probability that a daughter of this couple ${d.aff}?`,
  dauCarrier: () => "What is the probability that a daughter of this couple is a carrier (heterozygous)?",
  childAffSon: (d) => `Assuming sons and daughters are equally likely, what is the probability that their next child is a son who ${d.aff}?`,
  childAff: (d) => `Assuming sons and daughters are equally likely, what is the probability that their next child ${d.aff}?`,
};
const XL_DENOM = {
  sonAff: "Only sons count: they get their X from the mother and Y from the father.",
  dauAff: "Only daughters count: they get one X from each parent.",
  dauCarrier: "Only daughters count: they get one X from each parent.",
  childAffSon: "All children count, so each of the 4 boxes is a quarter.",
  childAff: "All children count, so each of the 4 boxes is a quarter.",
};

function xlSquare(L, m, f) {
  const mg = m === 2 ? [1, 1] : m === 1 ? [1, 0] : [0, 0];
  const fx = xa(L, f);
  const kid = (x) => `\`${xa(L, x)} ${fx}\``;
  const son = (x) => `\`${xa(L, x)} Y\``;
  return [
    `| | \`${fx}\` | \`Y\` |`,
    "| --- | --- | --- |",
    `| \`${xa(L, mg[0])}\` | ${kid(mg[0])} | ${son(mg[0])} |`,
    `| \`${xa(L, mg[1])}\` | ${kid(mg[1])} | ${son(mg[1])} |`,
  ].join("\n");
}

const BG = {
  AA: ["A", "A"], AO: ["A", "O"], BB: ["B", "B"], BO: ["B", "O"], AB: ["A", "B"], OO: ["O", "O"],
};
const alleleTxt = (x) => (x === "A" ? "I^A" : x === "B" ? "I^B" : "i");
const bgGeno = (k) => BG[k].map(alleleTxt).join(" ");
const groupOf = (k) => {
  const s = new Set(BG[k]);
  if (s.has("A") && s.has("B")) return "AB";
  if (s.has("A")) return "A";
  if (s.has("B")) return "B";
  return "O";
};
// Product rule: each parent passes either allele with probability 1/2.
function bgProbs(k1, k2) {
  const out = { A: 0, B: 0, AB: 0, O: 0 };
  const passes = (k) => {
    const m = {};
    for (const x of BG[k]) m[x] = (m[x] || 0) + 0.5;
    return m;
  };
  const m1 = passes(k1), m2 = passes(k2);
  for (const [x, px] of Object.entries(m1)) {
    for (const [y, py] of Object.entries(m2)) {
      const s = new Set([x, y]);
      const g = s.has("A") && s.has("B") ? "AB" : s.has("A") ? "A" : s.has("B") ? "B" : "O";
      out[g] += px * py;
    }
  }
  return out;
}
const GROUPS = ["A", "B", "AB", "O"];
const passTxt = (k) => (BG[k][0] === BG[k][1] ? `only ${code(alleleTxt(BG[k][0]))}` : BG[k].map((x) => code(alleleTxt(x))).join(" or "));
const groupSet = (gs) => {
  const list = GROUPS.filter((g) => gs.includes(g));
  if (list.length === 1) return `${list[0]} only`;
  if (list.length === 4) return "A, B, AB and O";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]} only`;
};
function bgSquare(k1, k2) {
  const [a1, a2] = BG[k1], [b1, b2] = BG[k2];
  const cell = (x, y) => {
    const s = [x, y].sort((p, q) => "ABO".indexOf(p) - "ABO".indexOf(q));
    return `\`${s.map(alleleTxt).join(" ")}\``;
  };
  return [
    `| | \`${alleleTxt(a1)}\` | \`${alleleTxt(a2)}\` |`,
    "| --- | --- | --- |",
    `| \`${alleleTxt(b1)}\` | ${cell(a1, b1)} | ${cell(a2, b1)} |`,
    `| \`${alleleTxt(b2)}\` | ${cell(a1, b2)} | ${cell(a2, b2)} |`,
  ].join("\n");
}
const BG_INTRO =
  "ABO blood groups are controlled by one gene with three alleles: `I^A` and `I^B` are codominant, and both are dominant over `i`.";
const BG_KEY = "`I^A I^A` or `I^A i` = group A; `I^B I^B` or `I^B i` = group B; `I^A I^B` = group AB; `i i` = group O.";

function genSexLinked(difficulty, rng) {
  const useBlood = rng.next() < 0.5;
  if (useBlood) return genBlood(difficulty, rng);
  const d = rng.pick(XL);
  const L = d.L;
  const intro = `${d.name[0].toUpperCase() + d.name.slice(1)} is caused by a recessive allele on the X chromosome: ${code(xa(L, 1))} is normal and ${code(xa(L, 0))} causes the condition. Males have one X (from their mother) and a Y (from their father).`;

  if (difficulty === "easy" && rng.next() < 0.45) {
    // Genotype of a described person.
    const who = rng.pick(["affMan", "unaffMan", "carrierWoman", "affWoman"]);
    const opts = {
      affMan: [`${xa(L, 0)} Y`, `a man who ${d.aff}`],
      unaffMan: [`${xa(L, 1)} Y`, `a man who ${d.unaff}`],
      carrierWoman: [`${xa(L, 1)} ${xa(L, 0)}`, `a woman who is a carrier`],
      affWoman: [`${xa(L, 0)} ${xa(L, 0)}`, `a woman who ${d.aff}`],
    };
    const [correct, desc] = opts[who];
    const pool = rng.shuffle([
      ...Object.values(opts).map((o) => o[0]),
      `${xa(L, 1)} ${xa(L, 1)}`,
      `${xa(L, 0)} Y^${L.toLowerCase()}`,
    ]).map((s) => "`" + s + "`");
    const ans = "`" + correct + "`";
    return {
      prompt: `${intro} What is the genotype of ${desc}?`,
      answerType: "choice",
      answer: ans,
      choices: strChoices(ans, pool, rng),
      explanation: `${who.endsWith("Man") ? "A man has one X and a Y; the Y carries no allele for this gene." : "A woman has two X chromosomes."} So ${desc} is **${ans}**.`,
      hints: [
        "Men are XY and women are XX. The Y chromosome carries no allele for this gene.",
        who === "carrierWoman"
          ? "A carrier has one normal allele and one recessive allele, but does not show the condition."
          : who.endsWith("Man")
            ? "A man shows whatever allele is on his single X."
            : "A recessive condition only shows in a woman if both her X alleles are recessive.",
      ],
      params: { sub: "sexlinked", kind: "xlGeno", who, L },
    };
  }

  let m, f, target;
  if (difficulty === "easy") {
    [m, f] = rng.pick([[1, 1], [2, 0], [1, 1]]);
    target = rng.pick(m === 1 ? ["sonAff", "dauCarrier"] : ["sonAff", "dauCarrier", "dauAff"]);
  } else if (difficulty === "medium") {
    [m, f] = rng.pick([[1, 1], [1, 0], [0, 1], [2, 0], [0, 0]]);
    target = rng.pick(["sonAff", "dauAff", "dauCarrier", "childAffSon", "childAff"]);
    if (target === "dauCarrier" && m === 0 && f === 0) target = "childAff";
  } else {
    return xlHard(d, intro, rng);
  }
  const fr = xlProbs(m, f)[target];
  const exact = 100 * fr;
  const momTxt = `${motherDesc(d, m)} (${code(motherG(L, m))})`;
  const dadTxt = `a man who ${f ? d.unaff : d.aff} (${code(fatherG(L, f))})`;
  const prompt = `${intro} ${momTxt[0].toUpperCase() + momTxt.slice(1)} has children with ${dadTxt}. ${XL_ASK[target](d)}`;
  return finish(
    {
      prompt,
      explanation:
        `Mother's gametes: ${code(xa(L, m >= 1))} and ${code(xa(L, m === 2))}. Father's gametes: ${code(xa(L, f))} (to daughters) and \`Y\` (to sons).\n\n${xlSquare(L, m, f)}\n\n` +
        `${XL_DENOM[target]} The answer is **${num(exact)}%**.`,
      hints: [
        `Write the gametes: the mother gives ${code(xa(L, m >= 1))} or ${code(xa(L, m === 2))}; the father gives ${code(xa(L, f))} or \`Y\`.`,
        `Draw the Punnett square:\n\n${xlSquare(L, m, f)}\n\n${XL_DENOM[target]}`,
      ],
      params: { sub: "sexlinked", kind: "xl", m, f, target },
    },
    exact,
    0,
    [100 - exact, exact / 2, Math.min(100, exact * 2), 50, 25],
    rng,
    { suffix: "%", max: 100, step: 25, snap: true, note: PCT_NOTE },
  );
}

function xlHard(d, intro, rng) {
  const L = d.L;
  const kind = rng.pick(["inferMulti", "inferMulti", "inferPct"]);
  // The woman shows no symptoms, but her father was affected: she must have his recessive X.
  const f = rng.int(0, 1);
  const story = `A woman who ${d.unaff} had a father who ${d.aff}. She has children with a man who ${f ? d.unaff : d.aff}.`;
  const m = 1;
  const pr = xlProbs(m, f);
  const why = `Her father passed his only X, ${code(xa(L, 0))}, to her. She is unaffected, so her other X is ${code(xa(L, 1))}: she is ${code(motherG(L, 1))}, a carrier. Her partner is ${code(fatherG(L, f))}.`;
  const hint1 = "Work out the woman's genotype first: which X did she get from her father, and why must her other X be normal?";
  if (kind === "inferPct") {
    const target = rng.pick(["sonAff", "childAffSon", "childAff", "dauAff"]);
    const exact = 100 * pr[target];
    return finish(
      {
        prompt: `${intro} ${story} ${XL_ASK[target](d)}`,
        explanation: `${why}\n\n${xlSquare(L, m, f)}\n\n${XL_DENOM[target]} The answer is **${num(exact)}%**.`,
        hints: [hint1, `She is ${code(motherG(L, 1))} and he is ${code(fatherG(L, f))}. Draw their Punnett square. ${XL_DENOM[target]}`],
        params: { sub: "sexlinked", kind: "xl", m, f, target },
      },
      exact,
      0,
      [100 - exact, exact / 2, Math.min(100, exact * 2), 50, 25],
      rng,
      { suffix: "%", max: 100, step: 25, snap: true, note: PCT_NOTE },
    );
  }
  const geno = "`" + motherG(L, 1) + "`";
  const pool = rng.shuffle([`\`${motherG(L, 2)}\``, `\`${motherG(L, 0)}\``, `\`${xa(L, 0)} Y\``, `\`${xa(L, 1)} Y\``]);
  return {
    prompt: `${intro} ${story}`,
    answerType: "multi",
    parts: [
      {
        id: "geno", label: "Woman's genotype", ask: "What is the woman's genotype?",
        answerType: "choice", answer: geno, choices: strChoices(geno, pool, rng),
        hint: hint1,
      },
      {
        id: "sons", label: "Sons", ask: `What percentage of their sons are expected to be affected?${PCT_NOTE}`,
        answerType: "number", answer: 100 * pr.sonAff, tolerance: 0,
        hint: "A son gets his X from his mother only. What fraction of her eggs carry the recessive allele?",
      },
      {
        id: "daus", label: "Daughters", ask: `What percentage of their daughters are expected to be carriers (heterozygous)?${PCT_NOTE}`,
        answerType: "number", answer: 100 * pr.dauCarrier, tolerance: 0,
        hint: `A daughter gets ${code(xa(L, f))} from her father and one of the mother's two X chromosomes. Which combinations are heterozygous?`,
      },
    ],
    explanation:
      `${why}\n\n${xlSquare(L, m, f)}\n\n**Woman's genotype:** **${geno}**.\n\n` +
      `**Sons:** half get ${code(xa(L, 0))} from her, so **${num(100 * pr.sonAff)}%** are affected.\n\n` +
      `**Daughters:** they all get ${code(xa(L, f))} from him, so **${num(100 * pr.dauCarrier)}%** are carriers.`,
    params: { sub: "sexlinked", kind: "xlMulti", m, f },
  };
}

function genBlood(difficulty, rng) {
  const keys = Object.keys(BG);
  if (difficulty === "easy" && rng.next() < 0.5) {
    const k = rng.pick(keys);
    const correct = groupOf(k);
    return {
      prompt: `${BG_INTRO} What blood group does a person with genotype ${code(bgGeno(k))} have?`,
      answerType: "choice",
      answer: correct,
      choices: rng.shuffle(GROUPS.slice()),
      explanation: `${BG_KEY}\n\nSo ${code(bgGeno(k))} is group **${correct}**.`,
      hints: [
        "`I^A` and `I^B` are codominant: if both are present, both show. `i` only shows when there is no `I^A` or `I^B`.",
        `Look at the two alleles in ${code(bgGeno(k))}. Which of them show?`,
      ],
      params: { sub: "sexlinked", kind: "bgPheno", k },
    };
  }
  let k1, k2, story = "";
  if (difficulty === "hard") return bloodHard(rng);
  do {
    k1 = rng.pick(keys);
    k2 = rng.pick(keys);
  } while (difficulty === "easy" ? !(k1.includes("O") || k2.includes("O")) || k1 === "OO" : k1 === k2 && k1 !== "AO" && k1 !== "AB");
  const probs = bgProbs(k1, k2);
  const kind = difficulty === "medium" && rng.next() < 0.4 ? "bgSet" : "bgPct";
  const parents = `A parent with genotype ${code(bgGeno(k1))} (group ${groupOf(k1)}) has children with a parent with genotype ${code(bgGeno(k2))} (group ${groupOf(k2)}).${story}`;
  const hints = [
    `Each parent passes on one of their two alleles: ${code(bgGeno(k1))} gives ${passTxt(k1)}; ${code(bgGeno(k2))} gives ${passTxt(k2)}.`,
    `Draw the Punnett square:\n\n${bgSquare(k1, k2)}\n\nThen turn each box into a blood group: ${BG_KEY}`,
  ];
  if (kind === "bgSet") {
    const possible = GROUPS.filter((g) => probs[g] > 0);
    const correct = groupSet(possible);
    const parentsG = [...new Set([groupOf(k1), groupOf(k2)])];
    const cand = [
      groupSet(parentsG),
      "A, B, AB and O",
      ...GROUPS.filter((g) => !possible.includes(g)).map((g) => groupSet([...possible, g])),
      ...(possible.length > 1 ? possible.map((g) => groupSet(possible.filter((x) => x !== g))) : []),
      "A and B only",
      "AB only",
      "A and O only",
      "B and O only",
    ];
    return {
      prompt: `${BG_INTRO} ${parents} Which blood groups are possible among their children?`,
      answerType: "choice",
      answer: correct,
      choices: strChoices(correct, rng.shuffle(cand), rng),
      explanation: `${bgSquare(k1, k2)}\n\n${BG_KEY}\n\nThe boxes give **${correct}**.`,
      hints,
      params: { sub: "sexlinked", kind: "bgSet", k1, k2 },
    };
  }
  const opts = GROUPS.filter((g) => probs[g] > 0);
  const grp = rng.next() < 0.85 ? rng.pick(opts) : rng.pick(GROUPS);
  const exact = 100 * probs[grp];
  return finish(
    {
      prompt: `${BG_INTRO} ${parents} What is the probability that a child of theirs has blood group ${grp}?`,
      explanation: `${bgSquare(k1, k2)}\n\n${BG_KEY}\n\nEach box is a quarter of the children, so group ${grp} has a probability of **${num(exact)}%**.`,
      hints,
      params: { sub: "sexlinked", kind: "bgPct", k1, k2, grp },
    },
    exact,
    0,
    [100 - exact, 50, 25, 75, 0],
    rng,
    { suffix: "%", max: 100, step: 25, snap: true, note: PCT_NOTE },
  );
}

// Hard blood groups: genotypes inferred from a parent's family, then a multi-part or single question.
function bloodHard(rng) {
  // Each person: a stated group, plus a parent's group that pins down the genotype.
  const people = [
    { k: "AO", txt: (s) => `${s} has blood group A, and ${s === "A man" ? "his" : "her"} mother had group O` },
    { k: "BO", txt: (s) => `${s} has blood group B, and ${s === "A man" ? "his" : "her"} father had group O` },
    { k: "AO", txt: (s) => `${s} has blood group A, and ${s === "A man" ? "his" : "her"} father had group B` },
    { k: "BO", txt: (s) => `${s} has blood group B, and ${s === "A man" ? "his" : "her"} mother had group A` },
    { k: "AB", txt: (s) => `${s} has blood group AB` },
    { k: "OO", txt: (s) => `${s} has blood group O` },
  ];
  let p1, p2;
  do {
    p1 = rng.pick(people);
    p2 = rng.pick(people);
  } while (p1.k === p2.k && p1.k !== "AO" && p1.k !== "BO");
  const why = (p) => {
    if (p.k === "AB") return "Group AB can only be `I^A I^B`.";
    if (p.k === "OO") return "Group O can only be `i i`.";
    const own = alleleTxt(p.k[0]), other = alleleTxt(p.k[0] === "A" ? "B" : "A");
    return `Group ${groupOf(p.k)} could be ${code(bgGeno(p.k[0] + p.k[0]))} or ${code(bgGeno(p.k))}. The parent named had no ${code(own)} to pass on, and an ${code(other)} would make this person group AB, so they got \`i\` from that parent: ${code(bgGeno(p.k))}.`;
  };
  const story = `${BG_INTRO} ${p1.txt("A man")}. ${p2.txt("A woman")}. They have children together.`;
  const probs = bgProbs(p1.k, p2.k);
  const multi = rng.next() < 0.6;
  const hint1 = "Pin down each parent's genotype first. Group O has no `I^A` or `I^B` at all; a parent with group B has no `I^A` to pass on (and group A has no `I^B`).";
  if (!multi) {
    const opts = GROUPS.filter((g) => probs[g] > 0);
    const grp = rng.pick(opts);
    const exact = 100 * probs[grp];
    return finish(
      {
        prompt: `${story} What is the probability that their first child has blood group ${grp}?`,
        explanation: `${why(p1)}\n\n${why(p2)}\n\n${bgSquare(p1.k, p2.k)}\n\nGroup ${grp}: **${num(exact)}%**.`,
        hints: [hint1, `The man is ${code(bgGeno(p1.k))} and the woman is ${code(bgGeno(p2.k))}. Draw their Punnett square and count the group ${grp} boxes.`],
        params: { sub: "sexlinked", kind: "bgPct", k1: p1.k, k2: p2.k, grp },
      },
      exact,
      0,
      [100 - exact, 50, 25, 75, 0],
      rng,
      { suffix: "%", max: 100, step: 25, snap: true, note: PCT_NOTE },
    );
  }
  const g1s = rng.pick(GROUPS.filter((g) => probs[g] > 0));
  const g2s = rng.pick(GROUPS.filter((g) => g !== g1s));
  const ans = "`" + bgGeno(p1.k) + "`";
  const pool = rng.shuffle(["AA", "AO", "BB", "BO", "AB", "OO"].filter((k) => k !== p1.k).map((k) => "`" + bgGeno(k) + "`"));
  return {
    prompt: story,
    answerType: "multi",
    parts: [
      {
        id: "geno", label: "Man's genotype", ask: "What is the man's genotype?",
        answerType: "choice", answer: ans, choices: strChoices(ans, [...pool.filter((x) => x.includes(alleleTxt(p1.k[0]))), ...pool], rng),
        hint: hint1,
      },
      {
        id: "first", label: `Group ${g1s}`, ask: `What is the probability that a child has blood group ${g1s}?${PCT_NOTE}`,
        answerType: "number", answer: 100 * probs[g1s], tolerance: 0,
        hint: `Work out the woman's genotype the same way, then draw a Punnett square with the man's alleles across the top and hers down the side. Count the group ${g1s} boxes.`,
      },
      {
        id: "second", label: `Group ${g2s}`, ask: `What is the probability that a child has blood group ${g2s}?${PCT_NOTE}`,
        answerType: "number", answer: 100 * probs[g2s], tolerance: 0,
        hint: `Use the same square. A box with both \`I^A\` and \`I^B\` is AB, and only a box with two \`i\` alleles is O. Count the group ${g2s} boxes.`,
      },
    ],
    explanation:
      `${why(p1)}\n\n${why(p2)}\n\n${bgSquare(p1.k, p2.k)}\n\n${BG_KEY}\n\n` +
      `**Man's genotype:** **${ans}**.\n\n**Group ${g1s}:** **${num(100 * probs[g1s])}%**.\n\n**Group ${g2s}:** **${num(100 * probs[g2s])}%**.`,
    params: { sub: "sexlinked", kind: "bgMulti", k1: p1.k, k2: p2.k, g1s, g2s },
  };
}

// ---------- Population genetics (Hardy–Weinberg) ----------

const HW_ASSUME =
  "Assume the population is in Hardy–Weinberg equilibrium (large, random mating, no selection, mutation or migration).";
const HW_TRAITS = [
  { many: "moths", rec: "pale wings" },
  { many: "snails", rec: "a banded shell" },
  { many: "pea plants", rec: "white flowers" },
  { many: "mice", rec: "brown fur" },
  { many: "beetles", rec: "green wing cases" },
  { many: "fruit flies", rec: "vestigial wings" },
  { many: "rabbits", rec: "white fur" },
  { many: "deer", rec: "a pale coat" },
];
const HW_EQ = "`p + q = 1` and `p² + 2pq + q² = 1`, where p is the dominant and q the recessive allele frequency.";

function genPopulation(difficulty, rng) {
  const t = rng.pick(HW_TRAITS);
  const traitIntro = `In a population of ${t.many}, the recessive phenotype (${t.rec}) is caused by a recessive allele.`;

  if (difficulty === "easy") {
    const kind = rng.pick(["p", "q2", "qFromQ2"]);
    if (kind === "p") {
      const q = rng.int(5, 95) / 100;
      const exact = 1 - q;
      return finish(
        {
          prompt: `${traitIntro} The frequency of the recessive allele (q) is ${num(q)}. What is the frequency of the dominant allele (p)? Give a decimal.`,
          explanation: `There are only two alleles, so \`p + q = 1\`.\n\n\`p = 1 - ${num(q)}\` = **${num(exact)}**.`,
          hints: ["There are only two alleles, so their frequencies add up to 1: `p + q = 1`.", `Rearrange for p and substitute q = ${num(q)}.`],
          params: { sub: "population", kind, q },
        },
        exact,
        2,
        [q, q * q, 1 - q * q],
        rng,
        { max: 1 },
      );
    }
    if (kind === "q2") {
      const q = rng.int(1, 9) / 10;
      const exact = q * q;
      return finish(
        {
          prompt: `${traitIntro} ${HW_ASSUME} The frequency of the recessive allele (q) is ${num(q)}. What fraction of the population is expected to have ${t.rec}? Give a decimal.`,
          explanation: `Only homozygous recessive individuals show ${t.rec}, and their frequency is q².\n\n\`q² = ${num(q)}²\` = **${num(exact)}**.`,
          hints: [
            `Only homozygous recessive individuals (two recessive alleles) show ${t.rec}.`,
            `In ${"`p² + 2pq + q² = 1`"}, which term is the homozygous recessive frequency? Use q = ${num(q)}.`,
          ],
          params: { sub: "population", kind, q },
        },
        exact,
        2,
        [q, 2 * q, 2 * q * (1 - q), (1 - q) * (1 - q)],
        rng,
        { max: 1 },
      );
    }
    const q = rng.int(1, 9) / 10;
    const q2 = clean(q * q);
    return finish(
      {
        prompt: `${traitIntro} ${HW_ASSUME} A fraction ${num(q2)} of the population has ${t.rec}. What is the frequency of the recessive allele (q)? Give a decimal.`,
        explanation: `${t.rec[0].toUpperCase() + t.rec.slice(1)} is the homozygous recessive phenotype, so its frequency is q².\n\n\`q = √${num(q2)}\` = **${num(q)}**.`,
        hints: [`The individuals with ${t.rec} are homozygous recessive, so ${num(q2)} is q², not q.`, `Take the square root of ${num(q2)}.`],
        params: { sub: "population", kind, q2 },
      },
      q,
      2,
      [q2, q2 / 2, 1 - q, 1 - q2],
      rng,
      { max: 1 },
    );
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["q", "p", "carrier", "homDom", "fromDom"]);
    const q = rng.int(5, 50) / 100;
    const q2 = clean(q * q);
    const recPct = clean(q2 * 100);
    const p = 1 - q;
    let prompt, exact, d, cands, ask, last, expl, isPct = false;
    const head = `${traitIntro} ${HW_ASSUME}`;
    if (kind === "fromDom") {
      const domPct = clean(100 - recPct);
      prompt = `${head} ${num(domPct)}% of the population show the dominant phenotype. What is the frequency of the recessive allele (q)? Give a decimal, to 2 decimal places.`;
      exact = q;
      d = 2;
      cands = [Math.sqrt(domPct / 100), 1 - Math.sqrt(domPct / 100), q2];
      expl = `The dominant phenotype includes both p² and 2pq, so work from the recessive phenotype instead: \`q² = 1 - ${num(domPct / 100)}\` = ${num(q2)}.\n\n\`q = √${num(q2)}\` = **${num(q)}**.`;
      const hints = [
        "The dominant phenotype includes heterozygotes (2pq) as well as p², so you can't just take a square root of it.",
        `Find the recessive phenotype frequency first: \`q² = 1 - ${num(domPct / 100)}\`. Then take the square root.`,
      ];
      return finish({ prompt, explanation: expl, hints, params: { sub: "population", kind, domPct } }, exact, d, cands, rng, { max: 1 });
    }
    const start = `${head} ${num(recPct)}% of the population have ${t.rec}.`;
    const step1 = `${num(recPct)}% have ${t.rec}, the homozygous recessive phenotype, so \`q² = ${num(q2)}\` and \`q = √${num(q2)}\` = ${num(q)}.`;
    const hint1 = `Convert ${num(recPct)}% to a decimal: that is q², the frequency of the homozygous recessive genotype.`;
    let hints;
    if (kind === "q") {
      prompt = `${start} What is the frequency of the recessive allele (q)? Give a decimal.`;
      exact = q;
      d = 2;
      cands = [q2, 1 - q, 2 * q, q2 * 2];
      expl = `${step1.replace(` = ${num(q)}.`, ` = **${num(q)}**.`)}`;
      hints = [hint1, `Take the square root of ${num(q2)}.`];
    } else if (kind === "p") {
      prompt = `${start} What is the frequency of the dominant allele (p)? Give a decimal.`;
      exact = p;
      d = 2;
      cands = [q, 1 - q2, Math.sqrt(1 - q2)];
      expl = `${step1}\n\n\`p = 1 - q = 1 - ${num(q)}\` = **${num(p)}**.`;
      hints = [hint1, `Find q with a square root, then use \`p + q = 1\`.`];
    } else if (kind === "carrier") {
      prompt = `${start} What percentage of the population are expected to be heterozygous carriers? Round to 2 decimal places.`;
      exact = 200 * p * q;
      d = 2;
      isPct = true;
      cands = [100 * p * q, 100 * q2 * 2, 100 * (1 - q2), 100 * p * p];
      expl = `${step1}\n\n\`p = 1 - ${num(q)}\` = ${num(p)}.\n\nCarriers are heterozygous: \`2pq = 2 × ${num(p)} × ${num(q)}\` = ${num(2 * p * q)}, which is **${num(roundTo(exact, 2))}%**.`;
      hints = [hint1, "Find q with a square root, then p from `p + q = 1`.", "Carriers are heterozygous, so they make up the 2pq term. Turn it into a percentage."];
    } else {
      prompt = `${start} What percentage of the population are expected to be homozygous dominant? Round to 2 decimal places.`;
      exact = 100 * p * p;
      d = 2;
      isPct = true;
      cands = [100 * (1 - q2), 100 * p, 200 * p * q];
      expl = `${step1}\n\n\`p = 1 - ${num(q)}\` = ${num(p)}.\n\nHomozygous dominant: \`p² = ${num(p)}²\` = ${num(p * p)}, which is **${num(roundTo(exact, 2))}%**.`;
      hints = [hint1, "Find q with a square root, then p from `p + q = 1`.", "The homozygous dominant frequency is p². Turn it into a percentage."];
    }
    return finish(
      { prompt, explanation: expl, hints, params: { sub: "population", kind, recPct } },
      exact,
      d,
      cands,
      rng,
      isPct ? { suffix: "%", max: 100, note: " Type the number without the % sign." } : { max: 1 },
    );
  }

  // hard: "1 in N" phenotype frequency, carriers.
  const k = rng.int(10, 100);
  const N = k * k;
  const q = 1 / k;
  const p = 1 - q;
  const conditions = [
    `In one population, an inherited recessive condition affects 1 in ${N} people.`,
    `A recessive inherited condition affects about 1 in ${N} newborns in a large population.`,
    `In a large population of ${t.many}, 1 in ${N} have ${t.rec}, a trait caused by a recessive allele.`,
  ];
  const kind = rng.pick(["carrierPct", "oneIn", "multi", "multi"]);
  // The town question only makes sense for the human conditions.
  const head = `${rng.pick(kind === "multi" ? conditions.slice(0, 2) : conditions)} ${HW_ASSUME}`;
  const step1 = `The affected individuals are homozygous recessive: \`q² = 1 / ${N}\`, so \`q = √(1 / ${N})\` = 1/${k} ≈ ${num(roundTo(q, 6))}.`;
  if (kind !== "multi") {
    let prompt, exact, d, cands, last, opt;
    if (kind === "carrierPct") {
      exact = 200 * p * q;
      d = 2;
      prompt = `${head} What percentage of the population are expected to be heterozygous carriers? Don't round until the end; round to 2 decimal places.`;
      cands = [100 * q, 100 * p * q, 100 * 2 * q * q, 100 / N];
      last = `Carriers: \`2pq = 2 × ${num(roundTo(p, 6))} × ${num(roundTo(q, 6))}\` ≈ ${num(roundTo(2 * p * q, 6))}, which is **${num(roundTo(exact, 2))}%**.`;
      opt = { suffix: "%", max: 100, note: " Type the number without the % sign." };
    } else {
      exact = 1 / (2 * p * q);
      d = 0;
      prompt = `${head} About 1 in how many individuals is a heterozygous carrier? Don't round until the end; round to the nearest whole number.`;
      cands = [k, k / 2, 2 * k, Math.sqrt(N / 2)];
      last = `Carriers: \`2pq\` ≈ ${num(roundTo(2 * p * q, 6))}, so about 1 in \`1 / ${num(roundTo(2 * p * q, 6))}\`, which rounds to **1 in ${roundTo(exact, 0)}**.`;
      opt = { min: 1 };
    }
    return finish(
      {
        prompt,
        explanation: `${step1}\n\n\`p = 1 - q\` ≈ ${num(roundTo(p, 6))}.\n\n${last}`,
        hints: [
          `"1 in ${N}" is the frequency of the homozygous recessive genotype, q². Write it as \`1 / ${N}\`.`,
          `\`q = sqrt(1 / _N)\` with \`_N\` = ${N}, then \`p = 1 - q\`.`,
          kind === "carrierPct" ? "Carriers are heterozygous: work out 2pq and turn it into a percentage." : "Carriers are heterozygous: work out 2pq, then \"1 in how many\" is 1 divided by that frequency.",
        ],
        given: [{ label: "_N", value: N }],
        params: { sub: "population", kind, N },
      },
      exact,
      d,
      cands,
      rng,
      opt,
    );
  }
  const pop = rng.int(2, 60) * 1000;
  const carriers = 2 * p * q * pop;
  return {
    prompt: `${head} A town in this population has ${pop} people.`,
    answerType: "multi",
    parts: [
      {
        id: "q", label: "Allele frequency", ask: "What is the frequency of the recessive allele (q)? Round to 4 decimal places.",
        answerType: "number", answer: roundTo(q, 4), tolerance: 0.00005,
        hint: `"1 in ${N}" is q², the homozygous recessive frequency. Take the square root of \`1 / _N\`.`,
      },
      {
        id: "carrier", label: "Carrier percentage", ask: "What percentage of people are expected to be heterozygous carriers? Use the unrounded q, and round to 2 decimal places. Type the number without the % sign.",
        answerType: "number", answer: roundTo(200 * p * q, 2), tolerance: 0.005,
        hint: "Find p from `p + q = 1`. Carriers are heterozygous: they are the 2pq term. Turn it into a percentage.",
      },
      {
        id: "town", label: "Carriers in town", ask: "About how many carriers would you expect in the town? Use the unrounded frequencies, and round to the nearest whole number.",
        answerType: "number", answer: roundTo(carriers, 0), tolerance: 0,
        hint: "Multiply the carrier frequency 2pq (as a decimal, not a percentage) by the town's population `_pop`.",
      },
    ],
    explanation:
      `${step1} To 4 decimal places, **q = ${num(roundTo(q, 4))}**.\n\n` +
      `\`p = 1 - q\` ≈ ${num(roundTo(p, 6))}. Carriers: \`2pq\` ≈ ${num(roundTo(2 * p * q, 6))} = **${num(roundTo(200 * p * q, 2))}%**.\n\n` +
      `In the town: \`2pq × ${pop}\` ≈ ${num(roundTo(carriers, 2))}, so about **${roundTo(carriers, 0)}** carriers.`,
    given: [{ label: "_N", value: N }, { label: "_pop", value: pop }],
    params: { sub: "population", kind: "multi", N, pop },
  };
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "write") return genWriteGenetics(difficulty, rng);
  if (difficulty === "expert") return xGenerate(subtopic, rng);
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "punnett") return genPunnett(difficulty, rng);
  if (subtopic === "dihybrid") return genDihybrid(difficulty, rng);
  if (subtopic === "sex-linked") return genSexLinked(difficulty, rng);
  if (subtopic === "population") return genPopulation(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =====================================================================================
// Independent check. Every probability is recomputed by enumerating gametes and counting
// boxes (no product rule); Hardy–Weinberg q is found by bisection instead of Math.sqrt.
// =====================================================================================

// Enumerate a one-gene cross: returns counts [aa, Aa, AA] out of 4 boxes.
function enumMono(k1, k2) {
  const gam = (k) => [k >= 1 ? 1 : 0, k === 2 ? 1 : 0];
  const out = [0, 0, 0];
  for (const x of gam(k1)) for (const y of gam(k2)) out[x + y]++;
  return out;
}
// Enumerate a two-gene cross over 4 × 4 gametes: returns { geno: Map("kA,kB" -> count), cls: [AB, Ab, aB, ab] } out of 16.
function enumDi(p1, p2) {
  const gam = ([kA, kB]) => {
    const as = [kA >= 1 ? 1 : 0, kA === 2 ? 1 : 0];
    const bs = [kB >= 1 ? 1 : 0, kB === 2 ? 1 : 0];
    const out = [];
    for (const x of as) for (const y of bs) out.push([x, y]);
    return out;
  };
  const geno = new Map();
  const cls = [0, 0, 0, 0];
  for (const [a1, b1] of gam(p1)) {
    for (const [a2, b2] of gam(p2)) {
      const kA = a1 + a2, kB = b1 + b2;
      const key = `${kA},${kB}`;
      geno.set(key, (geno.get(key) || 0) + 1);
      cls[(kA > 0 ? 0 : 2) + (kB > 0 ? 0 : 1)]++;
    }
  }
  return { geno, cls };
}
// Distinct gamete strings by listing each allele slot.
function enumGametes(L1, L2, kA, kB) {
  const set = [];
  const a = [kA >= 1 ? L1 : L1.toLowerCase(), kA === 2 ? L1 : L1.toLowerCase()];
  const b = [kB >= 1 ? L2 : L2.toLowerCase(), kB === 2 ? L2 : L2.toLowerCase()];
  for (const x of a) for (const y of b) if (!set.includes(x + y)) set.push(x + y);
  return set;
}
// X-linked: enumerate the 4 children [{ son, dom alleles }].
function enumXL(m, f) {
  const eggs = [m >= 1 ? 1 : 0, m === 2 ? 1 : 0];
  const out = [];
  for (const e of eggs) {
    out.push({ son: false, n: e + f }); // X from father
    out.push({ son: true, n: e });
  }
  return out;
}
function enumBG(k1, k2) {
  const counts = { A: 0, B: 0, AB: 0, O: 0 };
  for (const x of BG[k1]) {
    for (const y of BG[k2]) {
      const hasA = x === "A" || y === "A", hasB = x === "B" || y === "B";
      counts[hasA && hasB ? "AB" : hasA ? "A" : hasB ? "B" : "O"]++;
    }
  }
  return counts; // out of 4
}
// q with q² = target, by bisection on [0, 1].
function bisectRoot(target) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid * mid < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const reduceRatio = (arr) => {
  let g = 0;
  for (const x of arr) g = gcd(g, x);
  return arr.map((x) => x / (g || 1)).join(" : ");
};
const reduceFrac = (n, d) => {
  const g = gcd(n, d) || 1;
  return `${n / g}/${d / g}`;
};

// Expected answer for a single question or part: { num, d } or { str }.
function expected(p, partId) {
  switch (p.sub) {
    case "punnett": {
      const box = enumMono(p.k1, p.k2);
      const domBoxes = box[1] + box[2];
      if (p.kind === "pctRec") return { num: (box[0] / 4) * 100, d: 0 };
      if (p.kind === "pctDom") return { num: (domBoxes / 4) * 100, d: 0 };
      if (p.kind === "boxes") return { num: box[p.gk], d: 0 };
      if (p.kind === "genoRatio") return { str: reduceRatio([box[2], box[1], box[0]]) };
      if (p.kind === "phenoRatio") return { str: reduceRatio([domBoxes, box[0]]) };
      if (p.kind === "expected") return { num: (p.n * (p.rec ? box[0] : domBoxes)) / 4, d: 0 };
      if (p.kind === "cond") return { str: reduceFrac(p.het ? box[1] : box[2], domBoxes) };
      if (p.kind === "multi") {
        if (partId === "pct") return { num: (box[0] / 4) * 100, d: 0 };
        if (partId === "num") return { num: (p.n * domBoxes) / 4, d: 0 };
        if (partId === "ratio") return { str: reduceRatio([box[2], box[1], box[0]]) };
      }
      return null;
    }
    case "dihybrid": {
      if (p.kind === "gametes") {
        return { gametes: enumGametes("A", "B", p.p[0], p.p[1]), LA: p.LA, LB: p.LB };
      }
      if (p.kind === "nGametes") return { num: enumGametes("A", "B", p.p[0], p.p[1]).length, d: 0 };
      const e = enumDi(p.p1, p.p2);
      if (p.kind === "ratio" || (p.kind === "multi" && partId === "ratio")) return { str: reduceRatio(e.cls) };
      if (p.kind === "boxes") return { num: e.cls[p.cls], d: 0 };
      if (p.kind === "expected") return { num: (p.n * e.cls[p.cls]) / 16, d: 0 };
      if (p.kind === "prob") {
        const c = p.geno ? e.geno.get(`${p.geno[0]},${p.geno[1]}`) || 0 : e.cls[p.cls];
        return p.as === "frac" ? { str: reduceFrac(c, 16) } : { num: (c / 16) * 100, d: 2 };
      }
      if (p.kind === "multi") {
        if (partId === "pct") return { num: (e.cls[p.cls] / 16) * 100, d: 2 };
        if (partId === "num") return { num: (p.n * e.cls[p.cls]) / 16, d: 0 };
      }
      return null;
    }
    case "sexlinked": {
      if (p.kind === "xlGeno") {
        const L = p.L, r = L.toLowerCase();
        const map = { affMan: `X^${r} Y`, unaffMan: `X^${L} Y`, carrierWoman: `X^${L} X^${r}`, affWoman: `X^${r} X^${r}` };
        return { str: "`" + map[p.who] + "`" };
      }
      if (p.kind === "xl" || p.kind === "xlMulti") {
        const kids = enumXL(p.m, p.f);
        const sons = kids.filter((k) => k.son), daus = kids.filter((k) => !k.son);
        const pct = (part, whole) => (100 * part.length) / whole.length;
        const target = p.kind === "xl" ? p.target : partId === "sons" ? "sonAff" : partId === "daus" ? "dauCarrier" : null;
        switch (target) {
          case "sonAff": return { num: pct(sons.filter((k) => k.n === 0), sons), d: 0 };
          case "dauAff": return { num: pct(daus.filter((k) => k.n === 0), daus), d: 0 };
          case "dauCarrier": return { num: pct(daus.filter((k) => k.n === 1), daus), d: 0 };
          case "childAffSon": return { num: pct(sons.filter((k) => k.n === 0), kids), d: 0 };
          case "childAff": return { num: pct(kids.filter((k) => (k.son ? k.n === 0 : k.n === 0)), kids), d: 0 };
          default: return null;
        }
      }
      if (p.kind === "bgPheno") {
        const [x, y] = BG[p.k];
        const hasA = x === "A" || y === "A", hasB = x === "B" || y === "B";
        return { str: hasA && hasB ? "AB" : hasA ? "A" : hasB ? "B" : "O" };
      }
      const c = enumBG(p.k1, p.k2);
      if (p.kind === "bgPct") return { num: (c[p.grp] / 4) * 100, d: 0 };
      if (p.kind === "bgSet") return { str: groupSet(GROUPS.filter((g) => c[g] > 0)) };
      if (p.kind === "bgMulti") {
        if (partId === "geno") return { str: "`" + BG[p.k1].map(alleleTxt).join(" ") + "`" };
        if (partId === "first") return { num: (c[p.g1s] / 4) * 100, d: 0 };
        if (partId === "second") return { num: (c[p.g2s] / 4) * 100, d: 0 };
      }
      return null;
    }
    case "population": {
      if (p.kind === "p" && p.q !== undefined) return { num: 1 - p.q, d: 2 };
      if (p.kind === "q2") return { num: p.q * p.q, d: 2 };
      if (p.kind === "qFromQ2") return { num: bisectRoot(p.q2), d: 2 };
      if (p.kind === "fromDom") return { num: bisectRoot(1 - p.domPct / 100), d: 2 };
      if (["q", "p", "carrier", "homDom"].includes(p.kind)) {
        const q = bisectRoot(p.recPct / 100);
        const P = 1 - q;
        if (p.kind === "q") return { num: q, d: 2 };
        if (p.kind === "p") return { num: P, d: 2 };
        if (p.kind === "carrier") return { num: 100 * (1 - P * P - q * q), d: 2 };
        return { num: 100 * P * P, d: 2 };
      }
      const q = bisectRoot(1 / p.N);
      const P = 1 - q;
      const het = 1 - P * P - q * q; // = 2pq, found as "everyone who isn't homozygous"
      if (p.kind === "carrierPct") return { num: 100 * het, d: 2 };
      if (p.kind === "oneIn") return { num: 1 / het, d: 0 };
      if (p.kind === "multi") {
        if (partId === "q") return { num: q, d: 4 };
        if (partId === "carrier") return { num: 100 * het, d: 2 };
        if (partId === "town") return { num: het * p.pop, d: 0 };
      }
      return null;
    }
    default:
      return null;
  }
}

// Answer check against an expectation. answerType/choices describe the question (or part).
function matches(exp, answer, q) {
  if (!exp || answer === undefined || answer === null || answer === "") return false;
  if (q.answerType === "choice") {
    const ch = q.choices;
    if (!Array.isArray(ch) || ch.length < 2 || new Set(ch).size !== ch.length || !ch.includes(String(answer))) return false;
  }
  if (exp.gametes) {
    // Compare as a set of gametes, mapping the trait's letters onto A/B by position.
    const parts = String(answer).split(",").map((s) => s.trim());
    if (parts.some((s) => s.length !== 2 || s[0].toUpperCase() !== exp.LA || s[1].toUpperCase() !== exp.LB)) return false;
    const norm = parts.map((s) => (s[0] === s[0].toUpperCase() ? "A" : "a") + (s[1] === s[1].toUpperCase() ? "B" : "b"));
    return norm.length === exp.gametes.length && new Set(norm).size === norm.length && norm.every((g) => exp.gametes.includes(g));
  }
  if (exp.str !== undefined) return String(answer).trim() === exp.str;
  const x = Number(String(answer).replace(/%$/, "").trim());
  if (!Number.isFinite(x)) return false;
  return Math.abs(x - roundTo(exp.num, exp.d)) <= tolFor(exp.d) + 1e-9;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (p.sub === "write") return wgVerify(p, question, answer);
  if (p.expert) return xVerify(question, answer);
  if (question.answerType === "multi") {
    if (!answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
    return question.parts.every((part) => {
      let exp = expected(p, part.id);
      if (p.sub === "sexlinked" && p.kind === "xlMulti" && part.id === "geno") {
        // The woman's father was affected and she is not: heterozygous. Check the shape of the choice.
        const s = String(answer[part.id] ?? "");
        const m = s.match(/^`X\^([A-Za-z]) X\^([A-Za-z])`$/);
        return part.answerType === "choice" && part.choices.includes(s) && !!m && m[1] !== m[2] && m[1].toLowerCase() === m[2].toLowerCase() && m[1] === m[1].toUpperCase();
      }
      return matches(exp, answer[part.id], part);
    });
  }
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
  }
  if (p.sub === "punnett" && p.kind === "infer") return verifyInfer(p, answer, question);
  return matches(expected(p), answer, question);
}

// Parent genotypes that best explain the observed offspring: parents' phenotypes must match, every
// observed phenotype must be possible, and the expected recessive share must be closest to the observed.
function verifyInfer(p, answer, q) {
  if (!q.choices.includes(String(answer))) return false;
  const parse = (s) => {
    const m = String(s).match(/^`([A-Za-z]{2})` × `([A-Za-z]{2})`$/);
    if (!m) return null;
    const k = (g) => [...g].filter((c) => c === c.toUpperCase()).length;
    return [k(m[1]), k(m[2])];
  };
  const score = (pair) => {
    if (!pair) return Infinity;
    const [a, b] = pair;
    if ((a > 0) !== p.p1Dom || (b > 0) !== p.p2Dom) return Infinity;
    const box = enumMono(a, b);
    if (p.rec > 0 && box[0] === 0) return Infinity;
    if (p.dom > 0 && box[1] + box[2] === 0) return Infinity;
    return Math.abs(box[0] / 4 - p.rec / (p.rec + p.dom));
  };
  const scores = q.choices.map((c) => score(parse(c)));
  const mine = score(parse(answer));
  if (!Number.isFinite(mine)) return false;
  return scores.filter((s) => s <= mine + 1e-12).length === 1;
}

// =============================================================================================
// Expert. A separate branch: generate() sends "expert" here before anything else, so easy, medium
// and hard questions never see an extra rng draw. Each part carries a check name and the values
// stated in the prompt (in SI). verify() substitutes the candidate into the un-rearranged law,
// recomputing any intermediate from the stated values (never from an earlier part), and accepts it
// when the law changes sign inside the answer ± half a unit in the last place.

class XRetry extends Error {}
const xRound = (n, dp) => {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
};
const xTie = (x, dp) => {
  const f = Math.abs(x) * 10 ** dp;
  return Math.abs(f - Math.floor(f) - 0.5) < 1e-6;
};
const xFix = (x, dp) => xRound(x, dp).toFixed(dp);
const xN = (n) => String(xRound(n, 6));
const xDP = (dp) => (dp === 0 ? " Round to the nearest whole number." : ` Round to ${dp} decimal place${dp === 1 ? "" : "s"}.`);
const xG = (label, value) => ({ label, value });

function xNum(id, label, ask, exact, dp, hint, check) {
  if (!Number.isFinite(exact) || xTie(exact, dp)) throw new XRetry();
  return {
    part: { id, label, ask: ask + xDP(dp), answerType: "number", answer: xRound(exact, dp), tolerance: 0.5 * 10 ** -dp, hint },
    spec: { id, check, dp },
  };
}
// A whole-number part that must be exact (counts, "round up" answers): tolerance 0.
function xInt(id, label, ask, answer, hint, check) {
  if (!Number.isInteger(answer)) throw new XRetry();
  return { part: { id, label, ask, answerType: "number", answer, tolerance: 0, hint }, spec: { id, check, int: true } };
}
function xPick(id, label, ask, answer, choices, hint, check) {
  return { part: { id, label, ask, answerType: "choice", answer, choices, hint }, spec: { id, check } };
}
function xMulti(prompt, list, steps, values, given, hints) {
  const q = {
    prompt,
    answerType: "multi",
    parts: list.map((p) => p.part),
    explanation: steps.join("\n\n"),
    params: { expert: true, values, parts: list.map((p) => p.spec) },
    hints,
  };
  if (given && given.length) q.given = given;
  return q;
}
function xSingle(prompt, exact, dp, steps, values, check, given, hints) {
  if (!Number.isFinite(exact) || xTie(exact, dp)) throw new XRetry();
  const q = {
    prompt: prompt + xDP(dp),
    answer: xRound(exact, dp),
    answerType: "number",
    choices: undefined,
    tolerance: 0.5 * 10 ** -dp,
    explanation: steps.join("\n\n"),
    params: { expert: true, values, check, dp },
    hints,
  };
  if (given && given.length) q.given = given;
  return q;
}
// "≈ 12.3456, which rounds to **12.35**" (or "= **12.35**" when exact).
function xRes(exact, dp, unit) {
  const u = unit ? (unit.startsWith("°") ? unit : ` ${unit}`) : "";
  const shown = xFix(exact, dp);
  if (Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${Number(exact.toPrecision(7))}${u}, which rounds to **${shown}${u}**`;
}
function xRun(make, rng) {
  for (let i = 0; i < 60; i++) {
    try {
      return make(rng);
    } catch (e) {
      if (!(e instanceof XRetry)) throw e;
    }
  }
  return make(rng);
}

// Root of f strictly inside (x - h, x + h): a sign change across the window.
function xBracket(f, x, h) {
  if (!Number.isFinite(x)) return false;
  const lo = f(x - h);
  const hi = f(x + h);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo * hi < 0;
}
const xNumOf = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));

function xVerify(question, answer) {
  const p = question.params;
  const v = p.values;
  if (!v || typeof v !== "object") return false;
  const one = (spec, a, q) => {
    const fn = X_CHECKS[spec.check];
    if (!fn) return false;
    if (q.answerType === "choice") {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || new Set(q.choices).size !== q.choices.length) return false;
      if (!q.choices.includes(String(a))) return false;
      return fn(v, String(a)) === true;
    }
    if (q.answerType === "text") return typeof a === "string" && fn(v, a.trim()) === true;
    const x = xNumOf(a);
    if (!Number.isFinite(x)) return false;
    if (spec.int) return Number.isInteger(x) && fn(v, x, 0) === true;
    return fn(v, x, 0.5 * 10 ** -spec.dp) === true;
  };
  if (question.answerType === "multi") {
    if (!Array.isArray(question.parts) || !Array.isArray(p.parts) || p.parts.length !== question.parts.length) return false;
    if (!answer || typeof answer !== "object") return false;
    return p.parts.every((spec, i) => spec.id === question.parts[i].id && one(spec, answer[spec.id], question.parts[i]));
  }
  return one(p, answer, question);
}

// =====================================================================================
// Expert questions. Generation uses the product rule with exact fractions; the checks enumerate
// gametes and family trees (with Bayes' rule for "given that ..." questions) and compare.
// =====================================================================================

const xq = (n, d) => {
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
};
const xqMul = (a, b) => xq(a[0] * b[0], a[1] * b[1]);
const xqAdd = (a, b) => xq(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const xqSub = (a, b) => xq(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const xqStr = (q) => `${q[0]}/${q[1]}`;
const xqOk = (q) => q[0] > 0 && q[0] < q[1];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A probability typed as a fraction in simplest form (a text answer, like the rest of the module).
function xFrac(id, label, ask, q, hint, check) {
  if (!xqOk(q)) throw new XRetry();
  return { part: { id, label, ask: ask + FRAC_NOTE, answerType: "text", answer: xqStr(q), hint }, spec: { id, check } };
}
// "3/8" -> 0.375, only when written in simplest form.
function xFracVal(s) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(s));
  if (!m) return NaN;
  const n = Number(m[1]), d = Number(m[2]);
  if (d === 0 || gcd(n, d) !== 1) return NaN;
  return n / d;
}
const xFracIs = (s, val) => Math.abs(xFracVal(s) - val) < 1e-12;

// ---------- Punnett squares ----------

// What we know about a parent with the dominant phenotype, from the cross that produced it.
const X_BACK = [
  { cross: [1, 1], het: [2, 3] },
  { cross: [2, 1], het: [1, 2] },
  { cross: [1, 0], het: [1, 1] },
];

// Punnett, expert 1: two dominant-looking parents of uncertain genotype; probabilities before and after
// seeing a recessive offspring.
function xPunnettUncertain(rng) {
  const t = rng.pick(MONO);
  const b1 = rng.pick(X_BACK.slice(0, 2));
  const b2 = rng.pick(X_BACK);
  const askRec = rng.next() < 0.5;
  const L = t.L;
  const h1 = b1.het, h2 = b2.het;
  const pRec = xqMul(xqMul(h1, h2), [1, 4]);
  const next = askRec ? [1, 4] : [3, 4];
  const from = (b) => `${code(g1(L, b.cross[0]))} × ${code(g1(L, b.cross[1]))}`;
  const D = `the dominant phenotype (${t.dom})`;
  const R = `the recessive phenotype (${t.rec})`;
  const values = { c1: b1.cross, c2: b2.cross, askRec };
  return xMulti(
    `In ${t.many}, ${t.dom} (\`${L}\`) is dominant to ${t.rec} (\`${L.toLowerCase()}\`). ${cap(t.one)} 1 has ${D}; its parents were ${from(b1)}. ${cap(t.one)} 2 also has ${D}; its parents were ${from(b2)}. ${cap(t.many)} 1 and 2 are crossed.`,
    [
      xFrac("het1", "Parent 1", `What is the probability that ${t.one} 1 is heterozygous (${code(g1(L, 1))})?`, h1,
        `Draw the Punnett square for ${from(b1)}, then cross out the boxes that can't be right: ${t.one} 1 is known to have ${D}.`, "pu-het"),
      xFrac("rec", "First offspring", `What is the probability that their first offspring has ${R}?`, pRec,
        "Both parents must be heterozygous, and then a quarter of their offspring are recessive. Multiply the three probabilities.", "pu-rec"),
      xFrac("next", "After that", `Their first offspring turns out to have ${R}. What is the probability that the next one has ${askRec ? R : D}?`, next,
        `A recessive offspring proves something about both parents' genotypes. Once those are certain, the uncertainty has gone.`, "pu-next"),
    ],
    [
      `${cap(t.one)} 1 came from ${from(b1)}. Among its offspring with ${D}, the share that are ${code(g1(L, 1))} is **${xqStr(h1)}**. ${cap(t.one)} 2 (from ${from(b2)}): ${xqStr(h2)}.`,
      `A recessive offspring needs both parents heterozygous and then the 1/4 box: \`${xqStr(h1)} × ${xqStr(h2)} × 1/4\` = **${xqStr(pRec)}**.`,
      `Once a recessive offspring appears, both parents must be ${code(g1(L, 1))} (each passed on \`${L.toLowerCase()}\`). Now it is a plain ${code(g1(L, 1))} × ${code(g1(L, 1))} cross, so the next offspring has ${askRec ? R : D} with probability **${xqStr(next)}**. Earlier offspring don't change later ones; only what we know about the parents changed.`,
    ],
    values,
    undefined,
    [
      "A parent with the dominant phenotype could be homozygous or heterozygous. Use the cross it came from, but only count the boxes that match its phenotype.",
      "For a recessive offspring, both parents must carry the recessive allele and both must pass it on.",
      "When you learn something about an offspring, ask what it proves about the parents. Then work out the next offspring from the updated parents.",
    ],
  );
}

// Punnett, expert 3: a test cross that keeps giving dominant offspring. Bayes' rule updates the chance
// that the parent is heterozygous.
function xPunnettTestcross(rng) {
  const t = rng.pick(MONO);
  const b = rng.pick(X_BACK.slice(0, 2));
  const n = rng.int(1, 12);
  const L = t.L;
  const D = `the dominant phenotype (${t.dom})`;
  // P(het | n dominant offspring) = h (1/2)^n / (h (1/2)^n + (1 - h)).
  const h = b.het;
  const num2 = xqMul(h, xq(1, 2 ** n));
  const post = xq(num2[0] * h[1], num2[0] * h[1] + (h[1] - h[0]) * num2[1]);
  const nextRec = xqMul(post, [1, 2]);
  const from = `${code(g1(L, b.cross[0]))} × ${code(g1(L, b.cross[1]))}`;
  const values = { cross: b.cross, n };
  return xMulti(
    `In ${t.many}, ${t.dom} (\`${L}\`) is dominant to ${t.rec} (\`${L.toLowerCase()}\`). A ${t.one} with ${D} came from the cross ${from}. To find its genotype it is crossed with a ${code(g1(L, 0))} ${t.one}. The first ${n === 1 ? "offspring has" : `${n} offspring all have`} ${D}.`,
    [
      xFrac("het", "Heterozygous", `Given these results, what is the probability that the ${t.one} is heterozygous (${code(g1(L, 1))})?`, post,
        `Before the test cross it was heterozygous with probability ${xqStr(h)}. A heterozygote gives a dominant offspring only half the time; a homozygote always does.`, "tc-het"),
      xFrac("next", "Next offspring", `What is the probability that the next offspring of the test cross has the recessive phenotype (${t.rec})?`, nextRec,
        "Only a heterozygous parent can give a recessive offspring here, and then only half the time.", "tc-next"),
    ],
    [
      `Before the test cross: from ${from}, its chance of being ${code(g1(L, 1))} is ${xqStr(h)} (only boxes with ${D} count).`,
      `If it is ${code(g1(L, 1))}, the chance that ${n === 1 ? "one offspring is" : `all ${n} offspring are`} dominant is \`(1/2)^${n}\`. If it is ${code(g1(L, 2))}, that is certain.`,
      `Bayes' rule: \`${xqStr(h)} × (1/2)^${n} / (${xqStr(h)} × (1/2)^${n} + ${xqStr(xqSub([1, 1], h))})\` = **${xqStr(post)}**.`,
      `Next offspring recessive: heterozygous and passes on \`${L.toLowerCase()}\`: \`${xqStr(post)} × 1/2\` = **${xqStr(nextRec)}**.`,
    ],
    values,
    undefined,
    [
      "Start with the chance it is heterozygous before the test cross, from the cross it came from (only count dominant-phenotype boxes).",
      "Each dominant offspring is a little evidence for homozygous: weigh each possibility by how likely it makes these results.",
      "Posterior = (prior × chance of the results if heterozygous) ÷ (total chance of the results).",
    ],
  );
}

// Punnett, expert 2: keep self-pollinating a heterozygous plant; heterozygotes halve every generation.
function xPunnettSelfing(rng) {
  const t = rng.pick(MONO.filter((x) => /plant/.test(x.one)));
  const n = rng.int(2, 6);
  const L = t.L;
  const R = `the recessive phenotype (${t.rec})`;
  const het = xq(1, 2 ** n);
  const rec = xq(2 ** n - 1, 2 ** (n + 1));
  const values = { n };
  return xMulti(
    `In ${t.many}, ${t.dom} (\`${L}\`) is dominant to ${t.rec} (\`${L.toLowerCase()}\`). A ${code(g1(L, 1))} plant is self-pollinated. Every plant in the next generation is self-pollinated too, and so on. Each plant leaves the same number of offspring. Generation 1 is the offspring of the first self-pollination.`,
    [
      xFrac("het", "Heterozygous", `What fraction of generation ${n} is heterozygous?`, het,
        `Selfing ${code(g1(L, 2))} or ${code(g1(L, 0))} only gives the same genotype. Selfing ${code(g1(L, 1))} gives only half ${code(g1(L, 1))} again.`, "sf-het"),
      xFrac("rec", "Recessive", `What fraction of generation ${n} has ${R}?`, rec,
        `Whatever isn't heterozygous is homozygous, split equally between ${code(g1(L, 2))} and ${code(g1(L, 0))}.`, "sf-rec"),
    ],
    [
      `Selfing ${code(g1(L, 1))} gives 1/4 ${code(g1(L, 2))}, 1/2 ${code(g1(L, 1))}, 1/4 ${code(g1(L, 0))}. Homozygous plants breed true.`,
      `So the heterozygous share halves each generation: after ${n} generations it is \`(1/2)^${n}\` = **${xqStr(het)}**.`,
      `The other \`1 - ${xqStr(het)}\` is homozygous, half dominant and half recessive: \`(1 - ${xqStr(het)}) / 2\` = **${xqStr(rec)}** has ${R}.`,
    ],
    values,
    undefined,
    [
      "Follow each genotype through one self-pollination. Which genotypes stay the same, and what happens to the heterozygotes?",
      `Write the heterozygous share after generations 1, 2, 3 ... and spot the pattern. Then split the rest evenly between the two homozygotes.`,
    ],
  );
}

// ---------- Dihybrid crosses ----------

const X_DI_OPTS = [[[1, 1], [1, 1]], [[1, 1], [0, 0]], [[1, 1], [1, 0]], [[1, 1], [0, 1]], [[1, 2], [1, 0]]];
// Product rule: share of offspring in each class [AB, Ab, aB, ab].
function xDiShares(p1, p2) {
  const domA = 1 - (1 - p1[0] / 2) * (1 - p2[0] / 2);
  const domB = 1 - (1 - p1[1] / 2) * (1 - p2[1] / 2);
  return [domA * domB, domA * (1 - domB), (1 - domA) * domB, (1 - domA) * (1 - domB)];
}
const xDiFit = (obs, sh) => {
  const N = obs.reduce((a, b) => a + b, 0);
  return obs.reduce((s, o, i) => s + (o / N - sh[i]) ** 2, 0);
};

// Dihybrid, expert 1: offspring counts -> which cross? Then predict a class in a repeat cross.
function xDihybridInfer(rng) {
  const t = rng.pick(DI);
  const opts = rng.shuffle(X_DI_OPTS).slice(0, 4);
  const ans = rng.pick(opts);
  const sh = xDiShares(ans[0], ans[1]);
  const N = rng.int(10, 50) * 16;
  const counts = sh.map((s) => (s === 0 ? 0 : Math.max(1, Math.round(s * N * (1 + rng.int(-8, 8) / 100)))));
  const fits = opts.map((o) => xDiFit(counts, xDiShares(o[0], o[1])));
  const best = Math.min(...fits);
  if (fits.filter((f) => f <= best * 4 + 1e-6).length !== 1 || fits[opts.indexOf(ans)] !== best) throw new XRetry();
  const nonzero = [0, 1, 2, 3].filter((i) => sh[i] > 0);
  const cls = rng.pick(nonzero);
  const M = rng.int(5, 40) * 16;
  const expect = Math.round(sh[cls] * M);
  if (Math.abs(sh[cls] * M - expect) > 1e-9) throw new XRetry();
  const A = t.A.L, B = t.B.L;
  const gtxt = (p) => code(g1(A, p[0]) + g1(B, p[1]));
  const crossTxt = (o) => `${gtxt(o[0])} × ${gtxt(o[1])}`;
  const names = [diPhen(t, 1, 1), diPhen(t, 1, 0), diPhen(t, 0, 1), diPhen(t, 0, 0)];
  const values = { counts, opts, M, cls };
  const ratio = sh.map((s) => s * 16);
  return xMulti(
    `In ${t.many}, ${t.A.dom} (\`${A}\`) is dominant to ${t.A.rec} (\`${A.toLowerCase()}\`) and ${t.B.dom} (\`${B}\`) is dominant to ${t.B.rec} (\`${B.toLowerCase()}\`); the genes are on different chromosomes. A cross gives ${counts.map((c, i) => `${c} ${names[i]}`).join(", ")}.`,
    [
      xPick("cross", "Parents", "Which cross fits these results best?", crossTxt(ans), opts.map(crossTxt),
        "Turn the counts into a rough ratio (divide by the smallest non-zero count), then look at each gene on its own: is it about 3 : 1, 1 : 1, or all dominant?", "di-cross"),
      xInt("expect", "Prediction", `The same cross is repeated and gives ${M} offspring. How many would you expect to be ${names[cls]}?`, expect,
        "Use the exact expected share for that class from the cross you chose (in sixteenths), not the observed counts.", "di-expect"),
    ],
    [
      `Look at one gene at a time. ${t.A.dom}: ${counts[0] + counts[1]}, ${t.A.rec}: ${counts[2] + counts[3]}. ${t.B.dom}: ${counts[0] + counts[2]}, ${t.B.rec}: ${counts[1] + counts[3]}.`,
      "About 3 : 1 for a gene means both parents are heterozygous for it; about 1 : 1 means one heterozygous and one homozygous recessive; all dominant means at least one parent is homozygous dominant.",
      `That points to **${crossTxt(ans)}**, which predicts ${ratio.map((r) => num(r)).join(" : ")} (out of 16). The counts are close to that, but not exact, because offspring are a random sample.`,
      `Expected ${names[cls]}: \`${num(ratio[cls])}/16 × ${M}\` = **${expect}**.`,
    ],
    values,
    [xG("_n1", counts[0]), xG("_n2", counts[1]), xG("_n3", counts[2]), xG("_n4", counts[3]), xG("_M", M)],
    [
      "Split the problem: count the offspring for the first trait only (ignoring the second), then for the second trait only.",
      "A 3 : 1 split for a gene means both parents are heterozygous for it. A 1 : 1 split means a heterozygote crossed with a homozygous recessive. No recessives at all means a parent is homozygous dominant.",
      "For the prediction, multiply the expected share of that class by the new total.",
    ],
  );
}

const X_TRI = [
  { one: "pea plant", many: "pea plants", genes: [{ L: "T", dom: "tall", rec: "short" }, { L: "R", dom: "round seeds", rec: "wrinkled seeds" }, { L: "Y", dom: "yellow seeds", rec: "green seeds" }] },
  { one: "tomato plant", many: "tomato plants", genes: [{ L: "T", dom: "tall", rec: "dwarf" }, { L: "R", dom: "red fruit", rec: "yellow fruit" }, { L: "H", dom: "hairy stems", rec: "smooth stems" }] },
  { one: "guinea pig", many: "guinea pigs", genes: [{ L: "B", dom: "black fur", rec: "white fur" }, { L: "R", dom: "rough fur", rec: "smooth fur" }, { L: "S", dom: "short hair", rec: "long hair" }] },
  { one: "fruit fly", many: "fruit flies", genes: [{ L: "G", dom: "a grey body", rec: "an ebony body" }, { L: "N", dom: "normal wings", rec: "vestigial wings" }, { L: "R", dom: "red eyes", rec: "brown eyes" }] },
];

// Dihybrid, expert 2: three genes at once (product rule over 64 boxes).
function xTrihybrid(rng) {
  const t = rng.pick(X_TRI);
  const k1 = [rng.int(0, 1), rng.int(0, 1), rng.int(0, 1)];
  const k2 = [rng.int(0, 1), rng.int(0, 1), rng.int(0, 1)];
  if (k1.some((k, i) => k + k2[i] === 0)) throw new XRetry();
  const pDom = (a, b) => xqSub([1, 1], xqMul(xq(2 - a, 2), xq(2 - b, 2)));
  const pRec = (a, b) => xqMul(xq(2 - a, 2), xq(2 - b, 2));
  // P(offspring genotype has k dominant alleles) for one gene.
  const pK = (a, b, k) => {
    const pa = xq(a, 2), pb = xq(b, 2);
    const qa = xqSub([1, 1], pa), qb = xqSub([1, 1], pb);
    if (k === 2) return xqMul(pa, pb);
    if (k === 0) return xqMul(qa, qb);
    return xqAdd(xqMul(pa, qb), xqMul(qa, pb));
  };
  let allDom = [1, 1], allRec = [1, 1], same = [1, 1];
  for (let i = 0; i < 3; i++) {
    allDom = xqMul(allDom, pDom(k1[i], k2[i]));
    allRec = xqMul(allRec, pRec(k1[i], k2[i]));
    same = xqMul(same, pK(k1[i], k2[i], k1[i]));
  }
  if (!xqOk(allDom) || !xqOk(allRec) || !xqOk(same)) throw new XRetry();
  const gt = (k) => code(t.genes.map((g, i) => g1(g.L, k[i])).join(""));
  const values = { k1, k2 };
  return xMulti(
    `In ${t.many}, three genes on different chromosomes each have a dominant allele: ${t.genes.map((g) => `${g.dom} (\`${g.L}\`) over ${g.rec} (\`${g.L.toLowerCase()}\`)`).join(", ")}. Two ${t.many} are crossed: ${gt(k1)} × ${gt(k2)}.`,
    [
      xFrac("dom", "All dominant", `What is the probability that an offspring shows all three dominant traits (${t.genes.map((g) => g.dom).join(", ")})?`, allDom,
        "Find the chance of the dominant phenotype for each gene separately (a one-gene cross each), then multiply.", "tri-dom"),
      xFrac("rec", "All recessive", "What is the probability that an offspring shows all three recessive traits?", allRec,
        "For each gene, the recessive phenotype needs a recessive allele from both parents. Multiply across the genes.", "tri-rec"),
      xFrac("same", "Like parent 1", `What is the probability that an offspring has exactly the same genotype as the first parent, ${gt(k1)}?`, same,
        "Gene by gene: the chance that the offspring matches the first parent for that gene. Then multiply.", "tri-same"),
    ],
    [
      "The genes are inherited independently, so treat each one as its own one-gene cross and multiply the probabilities (the product rule). That is quicker than a 64-box square.",
      ...t.genes.map((g, i) => `\`${g.L}\` gene: ${code(g1(g.L, k1[i]))} × ${code(g1(g.L, k2[i]))} gives dominant phenotype ${xqStr(pDom(k1[i], k2[i])).replace(/^1\/1$/, "1")}, recessive ${xqStr(pRec(k1[i], k2[i])).replace(/^0\/1$/, "0")}, same as parent 1 ${xqStr(pK(k1[i], k2[i], k1[i])).replace(/^1\/1$/, "1")}.`),
      `All dominant: **${xqStr(allDom)}**. All recessive: **${xqStr(allRec)}**. Same genotype as parent 1: **${xqStr(same)}**.`,
    ],
    values,
    undefined,
    [
      "Independent genes can be split up: do three small one-gene crosses instead of one huge square.",
      "For each gene, write the chance of the dominant phenotype, the recessive phenotype and each genotype.",
      "Multiply the chances for the three genes to get the chance of a combination.",
    ],
  );
}

// ---------- Sex-linked & blood groups ----------

const X_XL_BG = [
  { id: "brother", txt: (d) => `Her brother ${d.aff}, but neither of her parents does.`, c: [1, 2] },
  { id: "grandfather", txt: (d) => `Her mother's father ${d.aff}; her mother and her father do not.`, c: [1, 2] },
  { id: "uncle", txt: (d) => `Her mother's brother ${d.aff}, but her mother, her father and her mother's parents do not.`, c: [1, 4] },
  { id: "cousin", txt: (d) => `Her mother's sister has a son who ${d.aff}; nobody else in the family is affected, including her mother, her father, her mother's sister and her mother's parents.`, c: [1, 4] },
];
const X_WOMEN = ["Ana", "Beth", "Chloe", "Dana", "Ella", "Farah", "Grace", "Hana", "Isla", "Jade", "Kira", "Lena"];

// Sex-linked, expert 1: carrier probability from a family history, then her children.
function xSexPedigree(rng) {
  const d = rng.pick(XL);
  const bg = rng.pick(X_XL_BG);
  const who = rng.pick(X_WOMEN);
  const husbandAff = rng.next() < 0.35;
  const c = bg.c;
  const sonAff = xqMul(c, [1, 2]);
  const third = husbandAff ? xqMul(c, [1, 2]) : xqAdd(xqSub([1, 1], c), xqMul(c, [1, 4]));
  const values = { bg: bg.id, husbandAff };
  return xMulti(
    `${d.name.charAt(0).toUpperCase() + d.name.slice(1)} is caused by a recessive allele on the X chromosome. ${who} does not have it. ${bg.txt(d)} ${who}'s partner ${husbandAff ? d.aff : "does not have it"}.`,
    [
      xFrac("carrier", "Carrier", `What is the probability that ${who} is a carrier?`, c,
        "Work down the family tree one generation at a time. An unaffected man passes on a normal X; a carrier woman passes on the recessive X half the time.", "xl-carrier"),
      xFrac("son", "A son", `What is the probability that a son of ${who} and her partner ${d.aff}?`, sonAff,
        `A son's X comes from ${who}. She must be a carrier and then pass on the recessive X.`, "xl-son"),
      husbandAff
        ? xFrac("daughter", "A daughter", `What is the probability that a daughter of theirs ${d.aff}?`, third,
          "A daughter gets her father's X (recessive here) and one X from her mother. She is affected only if both are recessive.", "xl-dau")
        : xFrac("twosons", "Two sons", "If they have two sons, what is the probability that neither is affected?", third,
          `Split it into two cases: ${who} is not a carrier (both sons are certainly fine), or she is a carrier (then each son is fine half the time).`, "xl-two"),
    ],
    [
      bg.id === "brother"
        ? `Her brother's X came from their mother, so her mother must be a carrier. ${who} got one of her mother's two X chromosomes: carrier with probability **${xqStr(c)}**.`
        : bg.id === "grandfather"
          ? `Her mother got her X from an affected father, so her mother is certainly a carrier. ${who} is a carrier with probability **${xqStr(c)}**.`
          : bg.id === "uncle"
            ? `Her mother's brother got his recessive X from his mother, so ${who}'s grandmother is a carrier. Her mother is a carrier with probability 1/2, and ${who} with \`1/2 × 1/2\` = **${xqStr(c)}**.`
            : `The cousin got his recessive X from his mother, so ${who}'s aunt is a carrier. Her grandfather is unaffected, so the aunt's recessive X came from the grandmother: she is a carrier too. ${who}'s mother is then a carrier with probability 1/2, and ${who} with \`1/2 × 1/2\` = **${xqStr(c)}**.`,
      `A son gets his X from ${who}: \`${xqStr(c)} × 1/2\` = **${xqStr(sonAff)}**.`,
      husbandAff
        ? `A daughter gets the recessive X from her father, so she is affected if ${who} also passes on a recessive X: \`${xqStr(c)} × 1/2\` = **${xqStr(third)}**.`
        : `Two unaffected sons: not a carrier (${xqStr(xqSub([1, 1], c))}, both certainly fine) or a carrier (${xqStr(c)}) with both fine (\`1/2 × 1/2\`): \`${xqStr(xqSub([1, 1], c))} + ${xqStr(c)} × 1/4\` = **${xqStr(third)}**. The sons are not independent of each other, because they share the same uncertain mother.`,
    ],
    values,
    undefined,
    [
      "Males have one X (from their mother). An affected male's X always tells you something about his mother.",
      `Work out who must be a carrier first, then go down the tree to ${who}: each step through a carrier mother halves the chance.`,
      "For her children, multiply her carrier probability by the chance she passes on the recessive X.",
    ],
  );
}

// Parent descriptions for blood groups. Each says what is known; dist = genotype probabilities.
const X_BGP = [
  { id: "A-momO", txt: (s) => `group A, and ${s} mother is group O`, dist: { AO: [1, 1] } },
  { id: "B-dadO", txt: (s) => `group B, and ${s} father is group O`, dist: { BO: [1, 1] } },
  { id: "A-AB", txt: (s) => `group A, and both of ${s} parents are group AB`, dist: { AA: [1, 1] } },
  { id: "A-AiAi", txt: (s) => `group A, and both of ${s} parents have genotype \`I^A i\``, dist: { AA: [1, 3], AO: [2, 3] } },
  { id: "B-BiBi", txt: (s) => `group B, and both of ${s} parents have genotype \`I^B i\``, dist: { BB: [1, 3], BO: [2, 3] } },
  { id: "AB", txt: () => "group AB", dist: { AB: [1, 1] } },
  { id: "O", txt: () => "group O", dist: { OO: [1, 1] } },
  { id: "B-ABO", txt: (s) => `group B, and ${s} parents are group AB and group O`, dist: { BO: [1, 1] } },
];

// Blood groups, expert 2: parents known only through their own parents; probabilities for a child.
function xBloodFamily(rng) {
  const mo = rng.pick(X_BGP);
  const fa = rng.pick(X_BGP);
  // Gamete probabilities from each parent's genotype distribution (product rule).
  const gam = (dist) => {
    const out = { A: [0, 1], B: [0, 1], O: [0, 1] };
    for (const [k, w] of Object.entries(dist)) for (const a of BG[k]) out[a] = xqAdd(out[a], xqMul(w, [1, 2]));
    return out;
  };
  const gm = gam(mo.dist), gf = gam(fa.dist);
  const P = { A: [0, 1], B: [0, 1], AB: [0, 1], O: [0, 1] };
  for (const a of ["A", "B", "O"]) for (const b of ["A", "B", "O"]) {
    const s = new Set([a, b]);
    const grp = s.has("A") && s.has("B") ? "AB" : s.has("A") ? "A" : s.has("B") ? "B" : "O";
    P[grp] = xqAdd(P[grp], xqMul(gm[a], gf[b]));
  }
  const ok = GROUPS.filter((g) => xqOk(P[g]));
  if (ok.length < 2) throw new XRetry();
  const asks = rng.shuffle(ok).slice(0, 2).sort((x, y) => GROUPS.indexOf(x) - GROUPS.indexOf(y));
  const values = { mo: mo.id, fa: fa.id };
  const gtx = (g) => xqStr(g).replace(/^0\/1$/, "0").replace(/^1\/1$/, "1");
  return xMulti(
    `${BG_INTRO} A woman is ${mo.txt("her")}. Her partner is ${fa.txt("his")}.`,
    asks.map((g) => xFrac(`g${g}`, `Group ${g}`, `What is the probability that their child is group ${g}?`, P[g],
      "List the alleles each parent could pass on, with their chances, then combine them in a 3 × 3 grid.", `bg-${g}`)),
    [
      BG_KEY,
      `Woman: ${Object.entries(mo.dist).map(([k, w]) => `${code(bgGeno(k))} (${gtx(w)})`).join(" or ")}. She passes on \`I^A\` ${gtx(gm.A)}, \`I^B\` ${gtx(gm.B)}, \`i\` ${gtx(gm.O)}.`,
      `Partner: ${Object.entries(fa.dist).map(([k, w]) => `${code(bgGeno(k))} (${gtx(w)})`).join(" or ")}. He passes on \`I^A\` ${gtx(gf.A)}, \`I^B\` ${gtx(gf.B)}, \`i\` ${gtx(gf.O)}.`,
      `Combine (multiply the chances and add the boxes that give each group): ${asks.map((g) => `group ${g} **${xqStr(P[g])}**`).join(", ")}.`,
    ],
    values,
    undefined,
    [
      "First work out each parent's possible genotypes from the family information. A group A person with a group O parent must carry `i`.",
      "If two `I^A i` parents have a group A child, only count the group A boxes of their Punnett square: `I^A I^A` and `I^A i` in the ratio 1 : 2.",
      "Then find the chance each parent passes on `I^A`, `I^B` or `i`, and multiply across.",
    ],
  );
}

// ---------- Population genetics ----------

const X_HW_TRAITS = HW_TRAITS;

// Population, expert 1: from 1 in N recessive, find q, the carrier rate, and the risk for two random
// dominant-phenotype parents.
function xHWRisk(rng) {
  const t = rng.pick(X_HW_TRAITS);
  const N = rng.int(4, 400) * 25;
  const big = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const q = 1 / Math.sqrt(N);
  const H = 2 * q * (1 - q);
  const carrierGivenDom = H / (1 - q * q);
  const risk = (carrierGivenDom ** 2) / 4;
  const oneIn = 1 / risk;
  const values = { N };
  return xMulti(
    `In a large population of ${t.many}, 1 in ${big(N)} has ${t.rec}, which is caused by a recessive allele. ${HW_ASSUME}`,
    [
      xNum("q", "q", "What is the frequency q of the recessive allele?", q, 4,
        "The recessive phenotype frequency is q².", "hw-q"),
      xNum("carriers", "Carriers", `What percentage of the population are carriers (heterozygous)? (Type the number without the % sign.)`, H * 100, 2,
        "Carriers are 2pq of the population, with p = 1 - q.", "hw-H"),
      xNum("oneIn", "Risk", `Two ${t.many} without ${t.rec} are picked at random and mated. Their offspring has a 1 in X chance of ${t.rec}. What is X?`, oneIn, 0,
        `Each parent must be a carrier. But they don't have ${t.rec}, so the chance is 2pq ÷ (1 - q²), not 2pq. Then both pass on the recessive allele (1/4).`, "hw-risk"),
    ],
    [
      HW_EQ,
      `\`q² = 1 / ${N}\`, so \`q = √(1 / ${N})\` ${xRes(q, 4, "")}. In the calculator: \`sqrt(1 / _N)\`.`,
      `\`2pq = 2 × q × (1 - q)\` = ${Number(H.toPrecision(6))} ${xRes(H * 100, 2, "%")}.`,
      `Among individuals without ${t.rec}, the carrier share is \`2pq / (1 - q²)\` = ${Number(carrierGivenDom.toPrecision(6))}. Both must be carriers and the offspring gets two recessive alleles: \`(${Number(carrierGivenDom.toPrecision(6))})² × 1/4\` = ${Number(risk.toPrecision(6))}.`,
      `X = 1 ÷ that ${xRes(oneIn, 0, "")}. Keep full precision until the end: rounding q early changes X.`,
    ],
    values,
    [xG("_N", N)],
    [
      "Start from the recessive phenotype: its frequency is q². Then p = 1 - q.",
      "Heterozygotes (carriers) make up 2pq of everyone.",
      "The parents are known not to show the trait, so divide the carrier share by the share without the trait (1 - q²). Then multiply the two parents' chances by 1/4.",
    ],
  );
}

// Population, expert 2: selection against the recessive phenotype; q_next = q / (1 + q).
function xHWSelection(rng) {
  const t = rng.pick(X_HW_TRAITS);
  const q0 = rng.int(10, 70) / 100;
  const n = rng.int(2, 8);
  const qn = q0 / (1 + n * q0);
  const target = rng.pick([0.5, 1, 2, 4, 5]);
  if (q0 * q0 * 100 <= target) throw new XRetry();
  const qt = Math.sqrt(target / 100);
  const gExact = 1 / qt - 1 / q0;
  if (Math.abs(gExact - Math.round(gExact)) < 1e-6) throw new XRetry();
  const gens = Math.ceil(gExact);
  const values = { q0, n, target };
  return xMulti(
    `In a population of ${t.many}, ${num(roundTo(q0 * q0 * 100, 2))}% have ${t.rec}, which is caused by a recessive allele. From now on, every individual with ${t.rec} is removed before it can breed, and the rest mate at random. In each generation, then, q changes to \`q ÷ (1 + q)\`. Start from Hardy–Weinberg proportions.`,
    [
      xNum("q0", "q now", "What is the recessive allele frequency q now?", q0, 2,
        "The recessive phenotype frequency is q².", "sel-q0"),
      xNum("qn", `After ${n}`, `What is q after ${n} generations of this selection?`, qn, 4,
        "Apply `q ÷ (1 + q)` once per generation, keeping full precision each time (or spot the pattern: 1/q goes up by 1 each generation).", "sel-qn"),
      xInt("gens", "How long", `After how many generations does the share of ${t.many} with ${t.rec} first fall below ${target}%?`, gens,
        `The phenotype share is q². Find the q that gives ${target}%, then count generations until q drops below it.`, "sel-gens"),
    ],
    [
      `\`q = √${num(roundTo(q0 * q0, 4))}\` = **${num(q0)}**.`,
      `Taking reciprocals, \`1/q_next = (1 + q)/q = 1/q + 1\`: 1/q rises by exactly 1 each generation. So after ${n} generations \`1/q = 1/${num(q0)} + ${n}\` = ${Number((1 / q0 + n).toPrecision(7))}, and \`q\` ${xRes(qn, 4, "")}.`,
      `Below ${target}% means \`q² < ${target / 100}\`, so \`q < ${Number(qt.toPrecision(6))}\` and \`1/q > ${Number((1 / qt).toPrecision(6))}\`. That needs \`1/${num(q0)} + g > ${Number((1 / qt).toPrecision(6))}\`, so g > ${Number(gExact.toPrecision(6))}: **${gens}** generations.`,
      "Selection against a recessive allele gets slower and slower, because most copies hide in carriers, who aren't removed.",
    ],
    values,
    [xG("_q0", q0), xG("_n", n), xG("_target", target)],
    [
      "Start with q: the recessive phenotype share is q².",
      "Apply the rule `q ÷ (1 + q)` repeatedly. It is quicker to notice what happens to 1/q each generation.",
      "For the last part, turn the target percentage into a q value, then count generations until q falls below it.",
    ],
  );
}

function xGenerate(subtopic, rng) {
  if (subtopic === "punnett") {
    const r = rng.next();
    return xRun(r < 0.4 ? xPunnettUncertain : r < 0.8 ? xPunnettTestcross : xPunnettSelfing, rng);
  }
  if (subtopic === "dihybrid") return xRun(rng.next() < 0.5 ? xDihybridInfer : xTrihybrid, rng);
  if (subtopic === "sex-linked") return xRun(rng.next() < 0.5 ? xSexPedigree : xBloodFamily, rng);
  if (subtopic === "population") return xRun(rng.next() < 0.5 ? xHWRisk : xHWSelection, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- Expert checks: enumeration, Bayes and simulation ----------

// Dominant-phenotype offspring of a cross, as weights over k (number of dominant alleles).
function xDomOffspring(cross) {
  const box = enumMono(cross[0], cross[1]); // [aa, Aa, AA] out of 4
  return [[1, box[1]], [2, box[2]]].filter(([, w]) => w > 0);
}
// P(first offspring recessive), P(both of two offspring have phenotype ph | first recessive).
function xPunnettEnum(v) {
  let pFirst = 0, pBoth = 0, tot = 0;
  for (const [k1, w1] of xDomOffspring(v.c1)) for (const [k2, w2] of xDomOffspring(v.c2)) {
    const w = w1 * w2;
    tot += w;
    const box = enumMono(k1, k2);
    const rec = box[0] / 4;
    pFirst += w * rec;
    pBoth += w * rec * (v.askRec ? rec : 1 - rec);
  }
  return { first: pFirst / tot, nextGiven: pBoth / pFirst };
}
// Woman's carrier probability by walking down the tree; each woman is a distribution over 0/1/2 recessive X's.
function xDaughter(mother, fatherRec) {
  const out = [0, 0, 0];
  mother.forEach((w, k) => {
    if (!w) return;
    // Her two X's, each passed on half the time.
    for (const a of [k >= 1 ? 1 : 0, k === 2 ? 1 : 0]) out[a + fatherRec] += w / 2;
  });
  out[2] = 0; // known to be unaffected
  const s = out[0] + out[1];
  return out.map((x) => x / s);
}
// An unaffected woman with an affected son: Bayes over carrier / not carrier (any prior > 0).
function xCarrierGivenSon(prior) {
  const like = [0, 0.5, 0];
  const post = prior.map((w, k) => w * like[k]);
  const s = post.reduce((a, b) => a + b, 0);
  return post.map((x) => x / s);
}
function xWoman(bg) {
  const unknown = [0.5, 0.5, 0];
  if (bg === "brother") return xDaughter(xCarrierGivenSon(unknown), 0);
  if (bg === "grandfather") return xDaughter(xDaughter([1, 0, 0], 1), 0);
  if (bg === "uncle") return xDaughter(xDaughter(xCarrierGivenSon(unknown), 0), 0);
  if (bg === "cousin") {
    // Grandmother: Bayes on "her daughter (the aunt) has an affected son".
    const post = unknown.map((w, k) => {
      if (!w) return 0;
      const aunt = [0, 0, 0];
      aunt[k] = 1;
      return w * xDaughter(aunt, 0)[1] * 0.5;
    });
    const s = post.reduce((a, b) => a + b, 0);
    return xDaughter(xDaughter(post.map((x) => x / s), 0), 0);
  }
  return null;
}
// Blood-group parent genotype distribution, by enumerating the grandparents and conditioning.
const X_ALL_BG = ["AA", "AO", "BB", "BO", "AB", "OO"];
function xBgParent(id) {
  const grp = (a, b) => {
    const s = new Set([a, b]);
    return s.has("A") && s.has("B") ? "AB" : s.has("A") ? "A" : s.has("B") ? "B" : "O";
  };
  const spec = {
    "A-momO": [["OO"], X_ALL_BG, "A"], "B-dadO": [["OO"], X_ALL_BG, "B"], "A-AB": [["AB"], ["AB"], "A"],
    "A-AiAi": [["AO"], ["AO"], "A"], "B-BiBi": [["BO"], ["BO"], "B"], "B-ABO": [["AB"], ["OO"], "B"],
  }[id];
  if (id === "AB") return { AB: 1 };
  if (id === "O") return { OO: 1 };
  if (!spec) return null;
  const out = {};
  let tot = 0;
  for (const g1x of spec[0]) for (const g2x of spec[1]) for (const a of BG[g1x]) for (const b of BG[g2x]) {
    if (grp(a, b) !== spec[2]) continue;
    const key = X_ALL_BG.find((k) => (BG[k][0] === a && BG[k][1] === b) || (BG[k][0] === b && BG[k][1] === a));
    out[key] = (out[key] || 0) + 1;
    tot++;
  }
  for (const k of Object.keys(out)) out[k] /= tot;
  return out;
}
function xBgChild(v, group) {
  const mo = xBgParent(v.mo), fa = xBgParent(v.fa);
  if (!mo || !fa) return NaN;
  let p = 0;
  for (const [km, wm] of Object.entries(mo)) for (const [kf, wf] of Object.entries(fa)) for (const a of BG[km]) for (const b of BG[kf]) {
    const s = new Set([a, b]);
    const grp = s.has("A") && s.has("B") ? "AB" : s.has("A") ? "A" : s.has("B") ? "B" : "O";
    if (grp === group) p += (wm * wf) / 4;
  }
  return p;
}
// Bisection for q from q² = 1/N (no square root).
function xBisectQ(N) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid * mid * N < 1) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// Generation-by-generation selection: remove the recessive phenotype, renormalise.
function xSelectStep(q) {
  const p = 1 - q;
  const AA = p * p, Aa = 2 * p * q;
  return (Aa / 2) / (AA + Aa);
}

const X_CHECKS = {
  // Bayes by enumeration: candidate genotypes from the parents' cross, weighted by P(n dominant test-cross offspring).
  "tc-het": (v, a) => { const r = xTestcrossEnum(v); return xFracIs(a, r.het); },
  "tc-next": (v, a) => { const r = xTestcrossEnum(v); return xFracIs(a, r.nextRec); },
  "pu-het": (v, a) => {
    const ws = xDomOffspring(v.c1);
    const tot = ws.reduce((s, [, w]) => s + w, 0);
    return xFracIs(a, (ws.find(([k]) => k === 1)?.[1] || 0) / tot);
  },
  "pu-rec": (v, a) => xFracIs(a, xPunnettEnum(v).first),
  "pu-next": (v, a) => xFracIs(a, xPunnettEnum(v).nextGiven),
  "sf-het": (v, a) => {
    let d = [0, 1, 0]; // [aa, Aa, AA] shares
    for (let i = 0; i < v.n; i++) {
      const nx = [0, 0, 0];
      d.forEach((w, k) => enumMono(k, k).forEach((c, j) => { nx[j] += (w * c) / 4; }));
      d = nx;
    }
    return xFracIs(a, d[1]);
  },
  "sf-rec": (v, a) => {
    let d = [0, 1, 0];
    for (let i = 0; i < v.n; i++) {
      const nx = [0, 0, 0];
      d.forEach((w, k) => enumMono(k, k).forEach((c, j) => { nx[j] += (w * c) / 4; }));
      d = nx;
    }
    return xFracIs(a, d[0]);
  },
  // Best fit by enumerating each option's 16 boxes.
  "di-cross": (v, a) => {
    const N = v.counts.reduce((s, c) => s + c, 0);
    const fit = (o) => enumDi(o[0], o[1]).cls.reduce((s, c, i) => s + (v.counts[i] / N - c / 16) ** 2, 0);
    const fits = v.opts.map(fit);
    const best = Math.min(...fits);
    const i = fits.indexOf(best);
    if (fits.filter((f) => f === best).length !== 1) return false;
    const o = v.opts[i];
    const L = /`([A-Za-z]{4})` × `([A-Za-z]{4})`/.exec(a);
    if (!L) return false;
    const k = (s, j) => [s[j * 2], s[j * 2 + 1]].filter((c) => c === c.toUpperCase()).length;
    return k(L[1], 0) === o[0][0] && k(L[1], 1) === o[0][1] && k(L[2], 0) === o[1][0] && k(L[2], 1) === o[1][1];
  },
  "di-expect": (v, x) => {
    const N = v.counts.reduce((s, c) => s + c, 0);
    const fit = (o) => enumDi(o[0], o[1]).cls.reduce((s, c, i) => s + (v.counts[i] / N - c / 16) ** 2, 0);
    const fits = v.opts.map(fit);
    const o = v.opts[fits.indexOf(Math.min(...fits))];
    return x * 16 === enumDi(o[0], o[1]).cls[v.cls] * v.M;
  },
  // 8 × 8 gametes over three genes.
  "tri-dom": (v, a) => xFracIs(a, xTriEnum(v, (k) => k.every((x) => x > 0))),
  "tri-rec": (v, a) => xFracIs(a, xTriEnum(v, (k) => k.every((x) => x === 0))),
  "tri-same": (v, a) => xFracIs(a, xTriEnum(v, (k) => k.every((x, i) => x === v.k1[i]))),
  "xl-carrier": (v, a) => { const w = xWoman(v.bg); return !!w && xFracIs(a, w[1]); },
  "xl-son": (v, a) => { const w = xWoman(v.bg); return !!w && xFracIs(a, w[1] * 0.5); },
  "xl-dau": (v, a) => { const w = xWoman(v.bg); return !!w && v.husbandAff && xFracIs(a, w[1] * 0.5); },
  // Enumerate both sons' X chromosomes for each possible mother.
  "xl-two": (v, a) => {
    const w = xWoman(v.bg);
    if (!w || v.husbandAff) return false;
    let p = 0;
    w.forEach((wk, k) => {
      const xs = [k >= 1 ? 1 : 0, k === 2 ? 1 : 0];
      for (const s1 of xs) for (const s2 of xs) if (!s1 && !s2) p += wk / 4;
    });
    return xFracIs(a, p);
  },
  "bg-A": (v, a) => xFracIs(a, xBgChild(v, "A")),
  "bg-B": (v, a) => xFracIs(a, xBgChild(v, "B")),
  "bg-AB": (v, a) => xFracIs(a, xBgChild(v, "AB")),
  "bg-O": (v, a) => xFracIs(a, xBgChild(v, "O")),
  "hw-q": (v, x, h) => x - h > 0 && xBracket((q) => q * q * v.N - 1, x, h),
  "hw-H": (v, x, h) => { const q = xBisectQ(v.N); return xBracket((pc) => pc / 100 - 2 * q * (1 - q), x, h); },
  // Enumerate parent genotypes (AA, Aa) with HW weights, keep the recessive-offspring chance.
  "hw-risk": (v, x, h) => {
    const q = xBisectQ(v.N), p = 1 - q;
    const par = [[p * p, 2], [2 * p * q, 1]];
    let num = 0, den = 0;
    for (const [w1, k1] of par) for (const [w2, k2] of par) { den += w1 * w2; num += (w1 * w2 * enumMono(k1, k2)[0]) / 4; }
    const risk = num / den;
    return xBracket((X) => X * risk - 1, x, h);
  },
  "sel-q0": (v, x, h) => x - h > 0 && xBracket((q) => q * q * 100 - roundTo(v.q0 * v.q0 * 100, 2), x, h),
  "sel-qn": (v, x, h) => { let q = v.q0; for (let i = 0; i < v.n; i++) q = xSelectStep(q); return xBracket((y) => y - q, x, h); },
  "sel-gens": (v, x) => {
    let q = v.q0, g = 0;
    while (q * q * 100 >= v.target && g < 10000) { q = xSelectStep(q); g++; }
    return x === g;
  },
};
function xTestcrossEnum(v) {
  let tot = 0, het = 0, rec = 0;
  for (const [k, w] of xDomOffspring(v.cross)) {
    const box = enumMono(k, 0); // test cross with aa: [aa, Aa, AA] out of 4
    const like = (1 - box[0] / 4) ** v.n;
    tot += w * like;
    if (k === 1) het += w * like;
    rec += (w * like * box[0]) / 4;
  }
  return { het: het / tot, nextRec: rec / tot };
}
function xTriEnum(v, pred) {
  const gam = (k) => {
    const sets = k.map((kk) => [kk >= 1 ? 1 : 0, kk === 2 ? 1 : 0]);
    const out = [];
    for (const a of sets[0]) for (const b of sets[1]) for (const c of sets[2]) out.push([a, b, c]);
    return out;
  };
  let hit = 0, tot = 0;
  for (const x of gam(v.k1)) for (const y of gam(v.k2)) {
    tot++;
    if (pred(x.map((xi, i) => xi + y[i]))) hit++;
  }
  return hit / tot;
}

// =====================================================================================
// Write gametes & genotypes (subtopic "write"): typed lists with a Blocks alternative.
// Answers are gametes or offspring genotypes written gene by gene (capital first within a gene)
// and listed in alphabetical order with each capital before its lower-case letter (TT, Tt, tt),
// separated by commas; the prompt states this order. Capitals matter, so every question sets
// `caseSensitive: true` (the engine compares without lowercasing), and verify compares exactly.
// Blocks: one block per gamete/genotype, joiner ", ", plus decoys (impossible gametes or
// genotypes, a whole genotype offered as a gamete, a single gene's pair): easy 0-1, medium 2-3,
// hard 4-6, expert 6-10.
// Generation builds the lists gene by gene in order (dominant first); verify enumerates every
// gamete pairing literally and sorts by gene ranks instead.

const WG_EXTRA = { easy: [0, 1], medium: [2, 3], hard: [4, 6], expert: [6, 10] };
const wgText = (genes, ks) => genes.map((g, i) => g1(g.L, ks[i])).join("");
const wgAlleles = (L, k) => (k === 2 ? [L] : k === 0 ? [L.toLowerCase()] : [L, L.toLowerCase()]);
function wgGametes(genes, ks) {
  let out = [""];
  genes.forEach((g, i) => { out = out.flatMap((p) => wgAlleles(g.L, ks[i]).map((a) => p + a)); });
  return out;
}
// Distinct offspring genotypes, gene by gene from most to fewest dominant alleles (= the stated order).
function wgOffspring(genes, k1, k2) {
  const per = genes.map((g, i) => {
    const s = new Set();
    for (const x of wgAlleles(g.L, k1[i])) for (const y of wgAlleles(g.L, k2[i])) s.add((x === g.L ? 1 : 0) + (y === g.L ? 1 : 0));
    return [...s].sort((p, q) => q - p);
  });
  let out = [[]];
  for (const ks of per) out = out.flatMap((pre) => ks.map((k) => [...pre, k]));
  return out.map((ks) => wgText(genes, ks));
}
// Every genotype over the genes (for decoys).
function wgAllGenos(genes) {
  let out = [[]];
  for (let i = 0; i < genes.length; i++) out = out.flatMap((pre) => [2, 1, 0].map((k) => [...pre, k]));
  return out.map((ks) => wgText(genes, ks));
}
const WG_ORDER_GENO = "Write each genotype gene by gene with the capital first (`Dd`, not `dD`), and list them in alphabetical order with each capital before its lower-case letter, like `DDEe, DdEe, ddEe`. Separate them with commas. Capitals matter.";
const WG_ORDER_GAM = "List the gametes in alphabetical order with each capital before its lower-case letter, like `DE, De, dE, de`. Separate them with commas. Capitals matter.";
const wgIntro = (many, genes) =>
  `In ${many}, ${genes.map((g) => `${code(g.L)} (${g.dom}) is dominant over ${code(g.L.toLowerCase())} (${g.rec})`).join("; ")}.` +
  (genes.length > 1 ? ` The genes are on different chromosomes, so they assort independently.` : "");
const diGenes = (t) => [t.A, t.B].map((g) => ({ L: g.L, dom: `${g.dom} ${t.noun}`, rec: `${g.rec} ${t.noun}` }));

// Described parent for Expert: per gene "het" (dominant, mother showed the recessive), "rec"
// (shows the recessive) or "hom" (true-breeding dominant).
const WG_K = { hom: 2, het: 1, rec: 0 };
function wgDescribe(genes, states, label) {
  const look = genes.map((g, i) => (states[i] === "rec" ? g.rec : g.dom));
  const het = genes.filter((_, i) => states[i] === "het").map((g) => g.rec);
  const hom = genes.filter((_, i) => states[i] === "hom").map((g) => g.dom);
  const bits = [`${label}: ${look.join(", ")}.`];
  if (het.length) bits.push(`Its mother showed ${het.join(" and ")}.`);
  if (hom.length) bits.push(`It comes from a line that is true-breeding for ${hom.join(" and ")}.`);
  return bits.join(" ");
}
const wgWhy = (genes, states) =>
  genes.map((g, i) => `${g.L}: ${states[i] === "het" ? `shows ${g.dom} but its mother showed ${g.rec} (${code(g1(g.L, 0))}), so ${code(g1(g.L, 1))}` : states[i] === "rec" ? `shows ${g.rec}, so ${code(g1(g.L, 0))}` : `true-breeding for ${g.dom}, so ${code(g1(g.L, 2))}`}`).join("; ");

function wgDecoys(rng, count, pool, answer) {
  const have = new Set(answer);
  const out = [];
  for (const d of rng.shuffle([...new Set(pool)])) if (out.length < count && !have.has(d)) { out.push(d); have.add(d); }
  return out;
}

function genWriteGenetics(difficulty, rng) {
  if (!WG_EXTRA[difficulty]) throw new Error(`Unknown difficulty: ${difficulty}`);
  const roll = rng.next();
  let q;
  if (difficulty === "easy" && roll < 0.5) {
    // One gene: offspring genotypes.
    const t = rng.pick(MONO);
    const genes = [{ L: t.L, dom: t.dom, rec: t.rec }];
    const [k1, k2] = rng.pick([[1, 1], [1, 0], [0, 1], [2, 1], [1, 2]]);
    q = { kind: "geno", genes, k1: [k1], k2: [k2], many: t.many, one: t.one };
  } else if (difficulty === "easy" || (difficulty === "medium" && roll < 0.4)) {
    // Gametes of a two-gene genotype (easy: one gene heterozygous; medium: both).
    const t = rng.pick(DI);
    const ks = difficulty === "easy" ? rng.pick([[1, 2], [1, 0], [2, 1], [0, 1]]) : [1, 1];
    q = { kind: "gam", genes: diGenes(t), ks, many: t.many, one: t.one };
  } else if (difficulty === "medium" && roll < 0.65) {
    // Three genes, two heterozygous: four gametes.
    const t = rng.pick(X_TRI);
    const homo = rng.int(0, 2);
    const ks = [0, 1, 2].map((i) => (i === homo ? rng.pick([0, 2]) : 1));
    q = { kind: "gam", genes: t.genes, ks, many: t.many, one: t.one };
  } else if (difficulty === "medium" || difficulty === "hard") {
    // Two genes: offspring genotypes (medium 2-4 of them, hard 4-6).
    const t = rng.pick(DI);
    const genes = diGenes(t);
    const [lo, hi] = difficulty === "medium" ? [2, 4] : [4, 6];
    let k1, k2, n;
    for (let i = 0; i < 100; i++) {
      k1 = [rng.int(0, 2), rng.int(0, 2)];
      k2 = [rng.int(0, 2), rng.int(0, 2)];
      n = wgOffspring(genes, k1, k2).length;
      if (n >= lo && n <= hi && !(difficulty === "medium" && k1.every((k) => k === 1) && k2.every((k) => k === 1))) break;
    }
    q = { kind: "geno", genes, k1, k2, many: t.many, one: t.one };
  } else if (roll < 0.5) {
    // Expert: work out a described parent's genotype (three genes), then its gametes.
    const t = rng.pick(X_TRI);
    let states;
    do states = [0, 1, 2].map(() => rng.pick(["het", "het", "rec", "hom"]));
    while (states.filter((s) => s === "het").length < 2);
    q = { kind: "gam", genes: t.genes, ks: states.map((s) => WG_K[s]), many: t.many, one: t.one, states };
  } else {
    // Expert: two described parents (two of the three genes), then every offspring genotype.
    const t = rng.pick(X_TRI);
    const pair = rng.shuffle([0, 1, 2]).slice(0, 2).sort();
    const genes = pair.map((i) => t.genes[i]);
    let s1, s2, n;
    for (let i = 0; i < 100; i++) {
      s1 = genes.map(() => rng.pick(["het", "het", "rec", "hom"]));
      s2 = genes.map(() => rng.pick(["het", "het", "rec", "hom"]));
      n = wgOffspring(genes, s1.map((s) => WG_K[s]), s2.map((s) => WG_K[s])).length;
      if (n >= 4) break;
    }
    q = { kind: "geno", genes, k1: s1.map((s) => WG_K[s]), k2: s2.map((s) => WG_K[s]), many: t.many, one: t.one, s1, s2 };
  }

  const { genes } = q;
  const [lo, hi] = WG_EXTRA[difficulty];
  const extra = rng.int(lo, hi);
  const intro = wgIntro(q.many, genes);
  let answer, decoyPool, prompt, explanation, hints, params;
  if (q.kind === "gam") {
    answer = wgGametes(genes, q.ks);
    const geno = wgText(genes, q.ks);
    // Impossible gametes, the whole genotype, single-gene pairs.
    decoyPool = [...wgGametes(genes, genes.map(() => 1)), geno, ...genes.map((g) => g1(g.L, 1))];
    prompt = q.states
      ? `${intro}\n\n${wgDescribe(genes, q.states, cap(`a ${q.one}`))}\n\nWhich different gametes can this ${q.one} make?\n\n${WG_ORDER_GAM}`
      : `${intro}\n\nWhich different gametes can a ${code(geno)} ${q.one} make?\n\n${WG_ORDER_GAM}`;
    const perGene = genes.map((g, i) => `${code(g1(g.L, q.ks[i]))} gives ${wgAlleles(g.L, q.ks[i]).map(code).join(" or ")}`).join("; ");
    explanation = `${q.states ? `First the genotype: ${wgWhy(genes, q.states)}. So it is ${code(geno)}.\n\n` : ""}A gamete gets one allele of each gene: ${perGene}. Combine every choice: ${answer.length} gamete${answer.length === 1 ? "" : "s"}, **${answer.join(", ")}**.`;
    hints = [
      ...(q.states ? [`Work out the genotype first. A ${genes[0].dom} parent whose mother was ${genes[0].rec} must carry ${code(genes[0].L.toLowerCase())}; a parent that shows the recessive trait is homozygous recessive.`] : []),
      "A gamete gets exactly one allele of each gene, never both letters of one gene.",
      `A heterozygous gene doubles the number of gamete types; a homozygous one gives the same letter to all of them. Expect 2^(number of heterozygous genes) gametes.`,
    ];
    params = { sub: "write", kind: "gam", letters: genes.map((g) => g.L), ks: q.ks, states: q.states || null };
  } else {
    answer = wgOffspring(genes, q.k1, q.k2);
    const p1 = wgText(genes, q.k1), p2 = wgText(genes, q.k2);
    decoyPool = [...wgAllGenos(genes), ...(genes.length > 1 ? wgGametes(genes, q.k1) : [])];
    const cross = q.s1
      ? `Two ${q.many} are crossed:\n\n- ${wgDescribe(genes, q.s1, "Parent 1")}\n- ${wgDescribe(genes, q.s2, "Parent 2")}\n\n`
      : `A ${code(p1)} ${q.one} is crossed with a ${code(p2)} ${q.one}. `;
    prompt = `${intro}\n\n${cross}Which different genotypes can the offspring have?\n\n${genes.length === 1 ? WG_ORDER_GENO.replace("`DDEe, DdEe, ddEe`", "`DD, Dd, dd`") : WG_ORDER_GENO}`;
    const perGene = genes.map((g, i) => {
      const ks = [...new Set(wgOffspring([g], [q.k1[i]], [q.k2[i]]))];
      return `${code(g1(g.L, q.k1[i]))} × ${code(g1(g.L, q.k2[i]))} gives ${ks.map(code).join(", ")}`;
    });
    explanation = `${q.s1 ? `First the parents. Parent 1: ${wgWhy(genes, q.s1)}; so ${code(p1)}. Parent 2: ${wgWhy(genes, q.s2)}; so ${code(p2)}.\n\n` : ""}${genes.length > 1 ? "Take one gene at a time: " : ""}${perGene.join("; ")}.${genes.length > 1 ? " Combine every option of the first gene with every option of the second." : ""}\n\nThe ${answer.length} genotypes: **${answer.join(", ")}**.`;
    hints = [
      ...(q.s1 ? ["Work out each parent's genotype first: a dominant-looking parent whose mother showed the recessive trait is heterozygous; one that shows the recessive trait is homozygous recessive."] : []),
      genes.length > 1 ? "Split the cross into one-gene crosses and list the genotypes each can give." : "Write each parent's gametes, then fill in a Punnett square.",
      genes.length > 1 ? "Combine every genotype of the first gene with every genotype of the second, then sort them: the first gene decides the order, then the second." : "List each different box once, in the order stated.",
    ];
    params = { sub: "write", kind: "geno", letters: genes.map((g) => g.L), k1: q.k1, k2: q.k2, s1: q.s1 || null, s2: q.s2 || null };
  }
  const decoys = wgDecoys(rng, Math.min(extra, 24 - answer.length), decoyPool, answer);
  return {
    prompt,
    answerType: "text",
    answer: answer.join(", "),
    accepts: [answer.join(" ")],
    caseSensitive: true,
    blocks: { tiles: rng.shuffle([...answer, ...decoys]), joiner: ", ", useAll: false },
    explanation,
    params,
    hints,
  };
}

// verify for "write": pair every gamete of one parent with every gamete of the other (or list a
// parent's gametes allele slot by slot), then sort by gene ranks; exact, case-sensitive compare.
function wgVerify(p, question, answer) {
  const L = p.letters;
  if (!Array.isArray(L) || !L.length) return false;
  const kFrom = (states, ks) => (states ? states.map((s) => ({ hom: 2, het: 1, rec: 0 })[s]) : ks);
  const slots = (ks) => {
    // all 2^n slot choices, duplicates included
    let out = [[]];
    ks.forEach((k, i) => {
      const two = [k >= 1 ? L[i] : L[i].toLowerCase(), k === 2 ? L[i] : L[i].toLowerCase()];
      out = out.flatMap((pre) => two.map((a) => [...pre, a]));
    });
    return out;
  };
  const rank = (s) => [...s].map((c) => (c === c.toUpperCase() ? 0 : 1));
  const cmp = (x, y) => { const a = rank(x), b = rank(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  let want;
  if (p.kind === "gam") {
    const ks = kFrom(p.states, p.ks);
    if (!ks || ks.length !== L.length) return false;
    want = [...new Set(slots(ks).map((g) => g.join("")))].sort(cmp);
  } else {
    const k1 = kFrom(p.s1, p.k1), k2 = kFrom(p.s2, p.k2);
    if (!k1 || !k2 || k1.length !== L.length || k2.length !== L.length) return false;
    const set = new Set();
    for (const a of slots(k1)) for (const b of slots(k2)) {
      set.add(a.map((x, i) => (x === L[i] || b[i] !== L[i] ? x + b[i] : b[i] + x)).join(""));
    }
    want = [...set].sort(cmp);
  }
  const got = String(answer ?? "").split(",").map((s) => s.trim());
  if (got.length !== want.length || !got.every((g, i) => g === want[i])) return false;
  if (question.answer !== want.join(", ") || question.caseSensitive !== true) return false;
  const b = question.blocks;
  if (!b || b.joiner !== ", " || !Array.isArray(b.tiles) || b.tiles.length < 2 || b.tiles.length > 24) return false;
  const vals = b.tiles.map((t) => String(typeof t === "object" ? t.value : t));
  return new Set(vals).size === vals.length && want.every((w) => vals.includes(w));
}
