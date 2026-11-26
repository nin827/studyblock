import { ELEMENTS, symbolOf } from "../../js/lib/chem.js";

// Radioactivity generator. Uses only the seeded rng passed in by the engine.
// Physics only: nuclide notation, alpha/beta/gamma decay equations and half-life (no health effects or dose).
// Nuclides are written with Unicode super/subscripts, mass number on top: ²³⁸₉₂U. Every nuclide used is real,
// decay chains follow the real uranium-238, thorium-232 and uranium-235 series, and named half-lives are
// standard textbook values (stated in each question). Easy/medium answers are whole numbers or simplest
// fractions like 1/8; hard answers are rounded to 2 decimal places (tolerance 0.005).

import { fmtAnswer as fmtAns, fmtNum, isHalfStep, round2 } from "../../js/lib/mathutil.js";
const fix = (n) => Math.round(n * 1e6) / 1e6;
const clean = (n) => (Math.abs(n - Math.round(n)) < 1e-7 ? Math.round(n) : n);
const isInt = (n) => Math.abs(n - Math.round(n)) < 1e-7;

const num = (n) => fmtNum(n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const DP = " Round to 2 decimal places.";
const THEN = " Then round to 2 decimal places.";

class Retry extends Error {}
const isTie = (x) => isHalfStep(x, 2, 1e-6);

// ---------------------------------------------------------------------------------------------
// Elements and notation

// Index = atomic number (0 = neutron). Symbols and names come from the shared chemistry library.
const SYM = ["n", ...ELEMENTS.map((e) => e.symbol)];
const NAME = Object.fromEntries(ELEMENTS.map((e) => [e.Z, e.name]));
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sup = (n) => String(n).replace(/\d/g, (d) => SUP[d]);
const sub = (n) => String(n).replace("-", "₋").replace(/\d/g, (d) => SUB[d]);
const nuc = (A, Z) => `${sup(A)}${sub(Z)}${SYM[Z]}`;
const named = (A, Z) => `${NAME[Z]}-${A}`;

// Real isotopes: [Z, [A...]]
const ISOTOPES = [
  [1, [1, 2, 3]], [2, [3, 4]], [3, [6, 7]], [4, [9, 10]], [5, [10, 11]], [6, [12, 13, 14]], [7, [14, 15]], [8, [16, 17, 18]],
  [9, [18, 19]], [10, [20, 22]], [11, [23, 24]], [12, [24, 25, 26]], [13, [27]], [14, [28, 30]], [15, [31, 32]], [16, [32, 35]],
  [17, [35, 37]], [18, [40]], [19, [39, 40]], [20, [40, 44]], [26, [54, 56, 59]], [27, [59, 60]], [28, [58, 60]], [29, [63, 65]],
  [30, [64, 66]], [36, [84, 85]], [38, [88, 90]], [39, [89, 90]], [43, [99]], [47, [107, 109]], [53, [127, 131]], [54, [131, 132]],
  [55, [133, 137]], [56, [137, 138]], [79, [197]], [80, [200, 202]], [82, [206, 207, 208, 210, 214]], [83, [209, 210, 214]],
  [84, [210, 218]], [86, [220, 222]], [88, [226, 228]], [90, [230, 232, 234]], [91, [231, 234]], [92, [234, 235, 238]],
  [93, [237]], [94, [239]], [95, [241]],
];
const ALL_NUC = ISOTOPES.flatMap(([Z, As]) => As.map((A) => ({ A, Z })));
const MULTI_ISO = ISOTOPES.filter(([, As]) => As.length > 1);

// Real decay series (one path through each): [A, Z, mode of the next decay]
const SERIES = [
  { name: "uranium-238", steps: [[238, 92, "a"], [234, 90, "b"], [234, 91, "b"], [234, 92, "a"], [230, 90, "a"], [226, 88, "a"], [222, 86, "a"], [218, 84, "a"], [214, 82, "b"], [214, 83, "b"], [214, 84, "a"], [210, 82, "b"], [210, 83, "b"], [210, 84, "a"], [206, 82, null]] },
  { name: "thorium-232", steps: [[232, 90, "a"], [228, 88, "b"], [228, 89, "b"], [228, 90, "a"], [224, 88, "a"], [220, 86, "a"], [216, 84, "a"], [212, 82, "b"], [212, 83, "b"], [212, 84, "a"], [208, 82, null]] },
  { name: "uranium-235", steps: [[235, 92, "a"], [231, 90, "b"], [231, 91, "a"], [227, 89, "b"], [227, 90, "a"], [223, 88, "a"], [219, 86, "a"], [215, 84, "a"], [211, 82, "b"], [211, 83, "a"], [207, 81, "b"], [207, 82, null]] },
];
// Single real decays: chain members plus well-known emitters.
const EMITTERS = [
  ...SERIES.flatMap((s) => s.steps.filter((x) => x[2]).map(([A, Z, m]) => ({ A, Z, m }))),
  { A: 241, Z: 95, m: "a" }, { A: 239, Z: 94, m: "a" }, { A: 237, Z: 93, m: "a" },
  { A: 14, Z: 6, m: "b" }, { A: 90, Z: 38, m: "b" }, { A: 90, Z: 39, m: "b" }, { A: 131, Z: 53, m: "b" }, { A: 137, Z: 55, m: "b" },
  { A: 60, Z: 27, m: "b" }, { A: 32, Z: 15, m: "b" }, { A: 3, Z: 1, m: "b" }, { A: 40, Z: 19, m: "b" }, { A: 24, Z: 11, m: "b" },
  { A: 99, Z: 43, m: "b" }, { A: 35, Z: 16, m: "b" }, { A: 85, Z: 36, m: "b" }, { A: 59, Z: 26, m: "b" }, { A: 45, Z: 20, m: "b" },
];
const MODE = { a: { dA: -4, dZ: -2, name: "alpha", word: "an alpha particle" }, b: { dA: 0, dZ: 1, name: "beta", word: "a beta particle (an electron)" } };
const after = (A, Z, m) => [A + MODE[m].dA, Z + MODE[m].dZ];

// ---------------------------------------------------------------------------------------------
// Shared question builders

function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (Number(s) === 0 && correct !== 0) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  const step = rounded ? Math.max(0.01, round2(Math.abs(correct) * 0.07)) : Math.max(1, Math.round(Math.abs(correct) * 0.05));
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k * step);
    tryAdd(correct - k * step);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Number question (typed 65%, choice 35%). params are what verify() rechecks.
function numberQ({ prompt, exact, rounded, steps, unit, hints, candidates, params, given, choiceRate = 0.35 }, rng) {
  if (!Number.isFinite(exact)) throw new Error("non-finite answer");
  if (rounded && isTie(exact)) throw new Retry();
  if (!rounded && !isInt(exact)) throw new Retry();
  const shown = fmtAns(exact, rounded);
  const last = !rounded || Math.abs(exact - Number(shown)) < 1e-9 ? `= **${shown}${unit ? " " + unit : ""}**` : `≈ ${exact.toFixed(4)}${unit ? " " + unit : ""}, which rounds to **${shown}${unit ? " " + unit : ""}**`;
  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation: [...steps.slice(0, -1), `${steps[steps.length - 1]} ${last}`].join("\n\n"),
    params: { ...params, rounded },
    hints,
    ...(given && given.length ? { given } : {}),
  };
  if (rng.next() < choiceRate) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : clean(exact), answerType: "number", choices: undefined };
}

function choiceQ({ prompt, answer, wrong, explanation, hints, params }, rng) {
  const opts = [answer, ...wrong];
  if (new Set(opts).size !== 4) throw new Retry();
  return { prompt, answer, answerType: "choice", choices: rng.shuffle(opts), explanation, hints, params };
}

function draw(make, ok, tries = 80) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = make();
    if (ok(v)) return v;
  }
  if (!ok(v)) throw new Retry();
  return v;
}

// ---------------------------------------------------------------------------------------------
// Nuclear notation

function genNotation(d, rng) {
  if (d === "hard" && rng.next() < 0.3) return notationMulti(rng);
  const kinds = d === "easy" ? ["count", "count", "count", "electrons"] : d === "medium" ? ["nameN", "fromPN", "isotope", "isoDiff", "count"] : ["fromAN", "excess", "mostN", "isotope", "isoDiff"];
  const kind = rng.pick(kinds);
  const { A, Z } = rng.pick(ALL_NUC);
  const N = A - Z;
  const show = nuc(A, Z);
  const given = [{ label: "_A", value: A }, { label: "_Z", value: Z }];
  const nameOrNot = rng.next() < 0.5 ? `the nucleus ${show}` : `a nucleus of ${named(A, Z)}, written ${show}`;

  if (kind === "count") {
    const ask = rng.pick(["protons", "neutrons", "neutrons", "nucleons"]);
    const exact = ask === "protons" ? Z : ask === "neutrons" ? N : A;
    const wording = {
      protons: "How many protons does it contain?",
      neutrons: "How many neutrons does it contain?",
      nucleons: "How many nucleons (protons and neutrons together) does it contain?",
    }[ask];
    return numberQ({
      prompt: `Look at ${nameOrNot}. ${wording}`,
      exact, rounded: false, unit: "",
      steps: [
        `In ${show} the top number is the mass number A = ${A} (protons + neutrons) and the bottom number is the atomic number Z = ${Z} (protons).`,
        ask === "neutrons" ? `Neutrons = A - Z = ${A} - ${Z}` : ask === "protons" ? "Protons = Z" : "Nucleons = A",
      ],
      hints: [
        "In nuclide notation the top number is the mass number A (protons + neutrons) and the bottom number is the atomic number Z (protons).",
        ask === "neutrons" ? `Neutrons are the nucleons that are not protons: subtract the bottom number from the top one (in the calculator: \`_A - _Z\`).` : `Which of the two numbers counts ${ask === "protons" ? "only the protons" : "every particle in the nucleus"}?`,
      ],
      candidates: [A, Z, N, A + Z].filter((v) => v !== exact),
      params: { kind: "count", ask, nuclide: show },
      given: ask === "neutrons" ? given : undefined,
      choiceRate: 0.4,
    }, rng);
  }

  if (kind === "electrons") {
    return numberQ({
      prompt: `How many electrons are there in a neutral atom of ${named(A, Z)} (${show})?`,
      exact: Z, rounded: false, unit: "",
      steps: [`A neutral atom has as many electrons as protons. The atomic number (bottom number) is ${Z}.`, "Electrons = Z"],
      hints: ["A neutral atom has no overall charge, so the electrons balance the protons.", "Which number in the notation counts the protons?"],
      candidates: [A, N, A + Z],
      params: { kind: "count", ask: "protons", nuclide: show },
      choiceRate: 0.4,
    }, rng);
  }

  if (kind === "nameN") {
    return numberQ({
      prompt: `${cap(NAME[Z])} has atomic number ${Z}. How many neutrons are in a nucleus of ${named(A, Z)}?`,
      exact: N, rounded: false, unit: "",
      steps: [`The number in the name, ${A}, is the mass number (protons + neutrons). ${cap(NAME[Z])} has ${Z} protons.`, `Neutrons = ${A} - ${Z}`],
      hints: [`In "${named(A, Z)}" the ${A} is the mass number: protons plus neutrons.`, "Take away the number of protons (the atomic number) (in the calculator: `_A - _Z`)."],
      candidates: [A, Z, A + Z, N + 1],
      params: { kind: "count", ask: "neutrons", nuclide: show },
      given,
    }, rng);
  }

  if (kind === "fromPN") {
    return numberQ({
      prompt: `A nucleus of ${NAME[Z]} contains ${Z} protons and ${N} neutrons. What is its mass number?`,
      exact: A, rounded: false, unit: "",
      steps: ["The mass number counts every nucleon: protons + neutrons.", `A = ${Z} + ${N}`],
      hints: ["The mass number is the total number of particles in the nucleus.", "Add the protons and the neutrons (in the calculator: `_p + _n`)."],
      candidates: [N - Z, Z, N, A + Z],
      params: { kind: "count", ask: "nucleons", nuclide: show },
      given: [{ label: "_p", value: Z }, { label: "_n", value: N }],
    }, rng);
  }

  if (kind === "fromAN") {
    return numberQ({
      prompt: `A nucleus has a mass number of ${A} and contains ${N} neutrons. What is its atomic number?`,
      exact: Z, rounded: false, unit: "",
      steps: ["Mass number = protons + neutrons, so protons = mass number - neutrons. The atomic number is the number of protons.", `Z = ${A} - ${N}`],
      hints: ["The atomic number is the number of protons.", "The mass number counts protons and neutrons together, so take away the neutrons (in the calculator: `_A - _n`)."],
      candidates: [A + N, N, A, Math.round(A / 2)],
      params: { kind: "count", ask: "protons", nuclide: show },
      given: [{ label: "_A", value: A }, { label: "_n", value: N }],
    }, rng);
  }

  if (kind === "excess") {
    if (N === Z) throw new Retry();
    const more = N > Z;
    return numberQ({
      prompt: `In the nucleus ${show}, how many more ${more ? "neutrons than protons" : "protons than neutrons"} are there?`,
      exact: Math.abs(N - Z), rounded: false, unit: "",
      steps: [`Protons: Z = ${Z}. Neutrons: A - Z = ${A} - ${Z} = ${N}.`, `Difference = ${more ? `${N} - ${Z}` : `${Z} - ${N}`}`],
      hints: ["Work out the number of protons and the number of neutrons separately.", `Neutrons = A - Z. Then subtract the smaller count from the larger (in the calculator: \`abs(_A - 2 * _Z)\`).`],
      candidates: [A - Z, A + Z, Z, Math.abs(A - Z - Z) + 2],
      params: { kind: "count", ask: "excess", nuclide: show },
      given,
    }, rng);
  }

  if (kind === "isoDiff") {
    const [Zi, As] = rng.pick(MULTI_ISO);
    const [a1, a2] = rng.shuffle(As).slice(0, 2);
    const hi = Math.max(a1, a2), lo = Math.min(a1, a2);
    return numberQ({
      prompt: `How many more neutrons does a nucleus of ${named(hi, Zi)} (${nuc(hi, Zi)}) have than a nucleus of ${named(lo, Zi)} (${nuc(lo, Zi)})?`,
      exact: hi - lo, rounded: false, unit: "",
      steps: ["Isotopes have the same number of protons, so the whole difference in mass number is made of neutrons.", `Difference = ${hi} - ${lo}`],
      hints: ["These are isotopes of the same element: what stays the same between them?", "Since the protons match, compare the mass numbers (in the calculator: `_A1 - _A2`)."],
      candidates: [hi - Zi, lo - Zi, hi - lo + Zi, hi + lo],
      params: { kind: "isoDiff", nuclides: [nuc(hi, Zi), nuc(lo, Zi)] },
      given: [{ label: "_A1", value: hi }, { label: "_A2", value: lo }],
    }, rng);
  }

  if (kind === "isotope") {
    const [Zi, As] = rng.pick(MULTI_ISO);
    const [a0, a1] = rng.shuffle(As).slice(0, 2);
    const answer = nuc(a1, Zi);
    const fakes = rng.shuffle([[a0, Zi + 1], [a0, Zi - 1], [a0 + 1, Zi + 1], [a1, Zi + 1], [a1 + 2, Zi + 2]]
      .filter(([a, z]) => z >= 1 && z < SYM.length && a > z));
    const wrong = [...new Set(fakes.map(([a, z]) => nuc(a, z)))].filter((s) => s !== answer && s !== nuc(a0, Zi)).slice(0, 3);
    if (wrong.length < 3) throw new Retry();
    return choiceQ({
      prompt: `Which of these nuclei is an isotope of ${nuc(a0, Zi)} (${named(a0, Zi)})?`,
      answer, wrong,
      explanation: [
        "Isotopes are atoms of the same element: the same number of protons (atomic number, the bottom number) but a different number of neutrons.",
        `${nuc(a0, Zi)} has Z = ${Zi}. The only option with Z = ${Zi} is **${answer}** (${named(a1, Zi)}). A matching mass number is not enough: a different atomic number means a different element.`,
      ].join("\n\n"),
      hints: ["Isotopes share their number of protons, not their mass number.", `Look for the option whose bottom number is ${Zi}.`],
      params: { kind: "isotope", of: nuc(a0, Zi) },
    }, rng);
  }

  // mostN: which has the most neutrons? Chosen so the biggest mass number is not always the answer.
  const picks = draw(() => [0, 1, 2, 3].map(() => rng.pick(ALL_NUC)), (ps) => {
    const ns = ps.map((p) => p.A - p.Z);
    const s = new Set(ps.map((p) => `${p.A}-${p.Z}`));
    return s.size === 4 && new Set(ns).size === 4;
  });
  const most = rng.next() < 0.5;
  const sorted = picks.slice().sort((x, y) => (x.A - x.Z) - (y.A - y.Z));
  const best = most ? sorted[3] : sorted[0];
  return choiceQ({
    prompt: `Which of these nuclei has the ${most ? "most" : "fewest"} neutrons: ${picks.map((p) => nuc(p.A, p.Z)).join(", ")}?`,
    answer: nuc(best.A, best.Z),
    wrong: picks.filter((p) => p !== best).map((p) => nuc(p.A, p.Z)),
    explanation: [
      "Neutrons = mass number - atomic number (top number - bottom number) for each one.",
      picks.map((p) => `${nuc(p.A, p.Z)}: ${p.A} - ${p.Z} = ${p.A - p.Z}`).join("; ") + ".",
      `So the ${most ? "most" : "fewest"} neutrons: **${nuc(best.A, best.Z)}**.`,
    ].join("\n\n"),
    hints: ["The mass number alone isn't the neutron count: it includes the protons.", "Work out top number minus bottom number for each nucleus, then compare."],
    params: { kind: "mostN", most },
  }, rng);
}

function notationMulti(rng) {
  const [Zi, As] = rng.pick(MULTI_ISO);
  const [a0, a1] = rng.shuffle(As).slice(0, 2);
  const k = a1 - a0;
  const show = nuc(a0, Zi);
  return {
    prompt: `${cap(named(a0, Zi))} is written ${show}. Another isotope of ${NAME[Zi]} has ${Math.abs(k)} ${k > 0 ? "more" : "fewer"} neutron${Math.abs(k) === 1 ? "" : "s"}.`,
    answerType: "multi",
    parts: [
      { id: "neutrons", label: "Neutrons", ask: `How many neutrons are in ${show}?`, answerType: "number", answer: a0 - Zi, tolerance: 0, hint: "Neutrons = mass number (top) - atomic number (bottom)." },
      { id: "protons", label: "Protons", ask: "How many protons are in the other isotope?", answerType: "number", answer: Zi, tolerance: 0, hint: "Isotopes of the same element always share one of the two numbers. Which one?" },
      { id: "mass", label: "Mass number", ask: "What is the mass number of the other isotope?", answerType: "number", answer: a1, tolerance: 0, hint: `Only the neutrons change, so change the mass number by the same amount (${k > 0 ? "+" : "-"}${Math.abs(k)}).` },
    ],
    explanation: [
      `${show}: Z = ${Zi} protons, A = ${a0}, so neutrons = ${a0} - ${Zi} = **${a0 - Zi}**.`,
      `An isotope has the same number of protons: **${Zi}**.`,
      `It has ${Math.abs(k)} ${k > 0 ? "more" : "fewer"} neutron${Math.abs(k) === 1 ? "" : "s"}, so its mass number is ${a0} ${k > 0 ? "+" : "-"} ${Math.abs(k)} = **${a1}**.`,
    ].join("\n\n"),
    given: [{ label: "_A", value: a0 }, { label: "_Z", value: Zi }, { label: "_k", value: Math.abs(k) }],
    params: { kind: "isoMulti", nuclide: show, change: k },
  };
}

// ---------------------------------------------------------------------------------------------
// Decay equations

const PARTICLES = {
  a: "alpha (⁴₂He)",
  b: "beta (⁰₋₁e)",
  g: "gamma (γ)",
  n: "neutron (¹₀n)",
};

function productWrong(A, Z, A2, Z2, steps) {
  // Plausible slips: wrong direction for Z, A and Z swapped roles, the other decay type, mass number left unchanged.
  const nA = steps.filter((s) => s === "a").length;
  const nB = steps.filter((s) => s === "b").length;
  const c = [
    [A - 4 * nA, Z + 2 * nA - nB], // Z moved the wrong way for alpha
    [A - 4 * nA, Z - 2 * nA - nB], // beta lowered Z instead of raising it
    [A - 2 * nA, Z - 4 * nA + nB], // swapped 4 and 2
    [A, Z - 2 * nA + nB], // mass number not changed
    [A - 4 * nA - nB, Z - 2 * nA + nB], // beta also took mass
    [A - 4 * (nA + nB), Z - 2 * (nA + nB)], // treated every step as alpha
    [A, Z + nA + nB], // treated every step as beta
  ];
  return c.filter(([a, z]) => z >= 1 && z < SYM.length && a > z && !(a === A2 && z === Z2)).map(([a, z]) => nuc(a, z));
}

function genDecay(d, rng) {
  if (d === "hard" && rng.next() < 0.3) return decayCount(rng);
  // Pick a starting nucleus and a run of real decays.
  let start, steps, seriesName = null;
  const len = d === "easy" ? 1 : d === "medium" ? rng.pick([1, 2, 2]) : rng.int(3, 6);
  if (len === 1 && rng.next() < 0.5) {
    const e = rng.pick(EMITTERS);
    start = [e.A, e.Z];
    steps = [e.m];
  } else {
    const s = rng.pick(SERIES);
    const maxStart = s.steps.length - 1 - len;
    const i = rng.int(0, maxStart);
    start = s.steps[i].slice(0, 2);
    steps = s.steps.slice(i, i + len).map((x) => x[2]);
    seriesName = s.name;
  }
  const [A0, Z0] = start;
  let A = A0, Z = Z0;
  for (const m of steps) [A, Z] = after(A, Z, m);
  const show = nuc(A0, Z0);
  const stepWords = steps.map((m) => MODE[m].name);
  const seq = steps.length === 1 ? `emits ${MODE[steps[0]].word}` : `decays by ${stepWords.slice(0, -1).join(", ")} and then ${stepWords[stepWords.length - 1]} emission, in that order`;
  const inSeries = seriesName && steps.length > 1 ? ` (part of the ${seriesName} decay series)` : "";
  const rules = "Alpha emission lowers the mass number by 4 and the atomic number by 2; beta emission raises the atomic number by 1 and leaves the mass number unchanged.";
  const kinds = d === "easy" ? ["A", "Z", "product", "type", "gamma"] : d === "medium" ? ["A", "Z", "N", "product", "type", "equation"] : ["A", "Z", "N", "product", "product"];
  let kind = rng.pick(kinds);
  if ((kind === "type" || kind === "equation") && steps.length !== 1) kind = "product";
  const params = { kind: "decay", A0, Z0, steps };
  const given = [{ label: "_A", value: A0 }, { label: "_Z", value: Z0 }];
  const tally = steps.length > 1 ? `${steps.filter((s) => s === "a").length} alpha and ${steps.filter((s) => s === "b").length} beta in total` : "";
  const walk = (() => {
    let a = A0, z = Z0;
    return steps.map((m) => {
      const [a2, z2] = after(a, z, m);
      const line = `${nuc(a, z)} → ${nuc(a2, z2)} (${MODE[m].name}: ${m === "a" ? "A - 4, Z - 2" : "A same, Z + 1"})`;
      a = a2; z = z2;
      return line;
    }).join("; ");
  })();

  if (kind === "gamma") {
    const g = rng.pick(ALL_NUC.filter((x) => x.Z > 2));
    const ask = rng.pick(["A", "Z"]);
    const exact = ask === "A" ? g.A : g.Z;
    return numberQ({
      prompt: `A nucleus of ${nuc(g.A, g.Z)} in an excited state emits a gamma ray. What is the ${ask === "A" ? "mass number" : "atomic number"} of the nucleus afterwards?`,
      exact, rounded: false, unit: "",
      steps: ["A gamma ray is electromagnetic radiation: no mass and no charge. The nucleus just loses energy.", `So the ${ask === "A" ? "mass number" : "atomic number"} is unchanged:`],
      hints: ["A gamma ray carries energy away but has no mass and no charge.", "So what happens to the numbers in the notation?"],
      candidates: ask === "A" ? [g.A - 4, g.A - 1, g.A + 1] : [g.Z - 2, g.Z + 1, g.Z - 1],
      params: { kind: "decay", A0: g.A, Z0: g.Z, steps: ["g"], ask },
      given: [{ label: "_A", value: g.A }, { label: "_Z", value: g.Z }],
      choiceRate: 0.5,
    }, rng);
  }

  if (kind === "A" || kind === "Z" || kind === "N") {
    const exact = kind === "A" ? A : kind === "Z" ? Z : A - Z;
    const what = { A: "mass number", Z: "atomic number", N: "number of neutrons" }[kind];
    return numberQ({
      prompt: `The nucleus ${show}${inSeries} ${seq}. What is the ${what} of the nucleus produced?`,
      exact, rounded: false, unit: "",
      steps: [
        rules,
        `${walk}.`,
        ...(kind === "N" ? [`The new nucleus is ${nuc(A, Z)}, so neutrons = ${A} - ${Z}`] : [`The ${what} of the final nucleus`]),
      ],
      hints: [
        rules,
        steps.length > 1 ? `Count the decays first: ${tally}. Apply each change to A = ${A0} and Z = ${Z0}.` : `Apply that change to A = ${A0} and Z = ${Z0}.`,
        ...(kind === "N" ? ["Then neutrons = new A - new Z."] : []),
      ],
      candidates: kind === "A" ? [A0, A0 - 2 * steps.length, A - 4, A + 4, A0 - 4 * steps.length] : kind === "Z" ? [Z0, Z - 2, Z + 2, Z0 - 2 * steps.length, Z0 + steps.length] : [A0 - Z0, A, Z, A - Z + 2, A - Z - 1],
      params: { ...params, ask: kind },
      given,
    }, rng);
  }

  if (kind === "product") {
    const answer = nuc(A, Z);
    const wrong = [...new Set(productWrong(A0, Z0, A, Z, steps))].filter((s) => s !== answer && s !== show);
    const pickW = rng.shuffle(wrong).slice(0, 3);
    if (pickW.length < 3) throw new Retry();
    return choiceQ({
      prompt: `The nucleus ${show}${inSeries} ${seq}. Which nucleus is produced?`,
      answer, wrong: pickW,
      explanation: [rules, `${walk}.`, `The product is **${answer}** (${NAME[Z] ? named(A, Z) : SYM[Z] + "-" + A}). Its symbol must match its new atomic number.`].join("\n\n"),
      hints: [rules, steps.length > 1 ? `${cap(tally)}: work out the final A and Z from A = ${A0}, Z = ${Z0}, then match the symbol to the new Z.` : `Work out the new A and Z from A = ${A0}, Z = ${Z0}. The symbol follows from the new Z.`],
      params: { ...params, ask: "product" },
    }, rng);
  }

  if (kind === "type" || kind === "equation") {
    const m = steps[0];
    const answer = PARTICLES[m];
    const wrong = ["a", "b", "g", "n"].filter((x) => x !== m).map((x) => PARTICLES[x]);
    const prompt = kind === "type"
      ? `${cap(named(A0, Z0))} (${show}) decays into ${nuc(A, Z)}. What is emitted?`
      : `Complete the decay equation: ${show} → ${nuc(A, Z)} + ?`;
    return choiceQ({
      prompt, answer, wrong,
      explanation: [
        "Compare the numbers before and after: mass number and atomic number are both conserved, so the missing particle makes up the difference.",
        `Mass number: ${A0} → ${A} (change ${A - A0}). Atomic number: ${Z0} → ${Z} (change ${Z - Z0 > 0 ? "+" : ""}${Z - Z0}).`,
        `A change of ${m === "a" ? "-4 and -2 is an alpha particle" : "0 and +1 is a beta particle (an electron, written ⁰₋₁e)"}: **${answer}**.`,
      ].join("\n\n"),
      hints: ["The top numbers must balance on both sides, and so must the bottom numbers.", `Find the change in A (${A0} → ${A}) and in Z (${Z0} → ${Z}). Which particle carries exactly that?`],
      params: { kind: "type", A0, Z0, A1: A, Z1: Z },
    }, rng);
  }
  throw new Retry();
}

// Hard multi: how many alpha and beta decays between two members of a real series.
function decayCount(rng) {
  const s = rng.pick(SERIES);
  const i = rng.int(0, s.steps.length - 4);
  const j = rng.int(i + 3, s.steps.length - 1);
  const [A0, Z0] = s.steps[i];
  const [A1, Z1] = s.steps[j];
  const nA = (A0 - A1) / 4;
  const nB = nA * 2 - (Z0 - Z1);
  if (nB < 0 || !isInt(nA)) throw new Retry();
  return {
    prompt: `In the ${s.name} decay series, ${nuc(A0, Z0)} turns into ${nuc(A1, Z1)} through a chain of alpha and beta decays.`,
    answerType: "multi",
    parts: [
      { id: "alpha", label: "Alpha decays", ask: "How many alpha decays are in the chain?", answerType: "number", answer: nA, tolerance: 0, hint: "Only alpha decay changes the mass number, by 4 each time. Divide the total drop in mass number by 4." },
      { id: "beta", label: "Beta decays", ask: "How many beta decays are in the chain?", answerType: "number", answer: nB, tolerance: 0, hint: "Each alpha lowers Z by 2 and each beta raises it by 1. Compare the drop the alphas alone would cause with the actual drop in Z." },
    ],
    explanation: [
      `Mass number: ${A0} → ${A1}, a drop of ${A0 - A1}. Only alpha decay changes A (by 4), so alpha decays = ${A0 - A1} / 4 = **${nA}**.`,
      `${nA} alpha decays would lower Z by ${2 * nA}, from ${Z0} to ${Z0 - 2 * nA}. The actual Z is ${Z1}, which is ${Z1 - (Z0 - 2 * nA)} higher, and each beta decay raises Z by 1: beta decays = **${nB}**.`,
    ].join("\n\n"),
    given: [{ label: "_A0", value: A0 }, { label: "_Z0", value: Z0 }, { label: "_A1", value: A1 }, { label: "_Z1", value: Z1 }],
    params: { kind: "count2", A0, Z0, A1, Z1 },
  };
}

// ---------------------------------------------------------------------------------------------
// Half-life. Named isotopes use their standard half-lives; others are "a radioactive isotope".

const NAMED_HL = [
  { name: "iodine-131", T: 8, unit: "days" },
  { name: "technetium-99m", T: 6, unit: "hours" },
  { name: "cobalt-60", T: 5.3, unit: "years" },
  { name: "carbon-14", T: 5730, unit: "years" },
  { name: "strontium-90", T: 29, unit: "years" },
  { name: "caesium-137", T: 30, unit: "years" },
  { name: "radon-222", T: 3.8, unit: "days" },
  { name: "phosphorus-32", T: 14, unit: "days" },
  { name: "sodium-24", T: 15, unit: "hours" },
  { name: "polonium-210", T: 138, unit: "days" },
  { name: "radium-226", T: 1600, unit: "years" },
  { name: "hydrogen-3 (tritium)", T: 12.3, unit: "years" },
  { name: "americium-241", T: 432, unit: "years" },
  { name: "radon-220", T: 56, unit: "seconds" },
];
const QTY = [
  { what: "activity", unit: "Bq", of: "an activity of" },
  { what: "count rate", unit: "counts per minute", of: "a count rate of" },
  { what: "mass", unit: "g", of: "a mass of" },
  { what: "mass", unit: "mg", of: "a mass of" },
  { what: "number of undecayed nuclei", unit: "nuclei", of: "" },
];
const TUNITS = ["seconds", "minutes", "hours", "days", "years"];

function source(rng, integerT) {
  if (rng.next() < 0.45) {
    const pool = NAMED_HL.filter((s) => !integerT || Number.isInteger(s.T));
    const s = rng.pick(pool);
    return { label: s.name, T: s.T, unit: s.unit, named: true };
  }
  const unit = rng.pick(TUNITS);
  const T = integerT ? rng.int(2, 60) : rng.int(15, 900) / 10;
  return { label: "A radioactive isotope", T, unit, named: false };
}
const qtyText = (q, v) => (q.unit === "nuclei" ? `${num(v)} undecayed nuclei` : `${q.of} ${num(v)} ${q.unit}`);
const qtyVal = (q, v) => (q.unit === "nuclei" ? `${num(v)} nuclei` : `${num(v)} ${q.unit}`);
const sampleOf = (src) => (src.named ? `A sample of ${src.label}` : "A sample of a radioactive isotope");
const hlLine = (src) => (src.named ? `${cap(src.label)} has a half-life of ${num(src.T)} ${src.unit}.` : `Its half-life is ${num(src.T)} ${src.unit}.`);

function fracStr(p, q) {
  const g = gcd(p, q);
  return `${p / g}/${q / g}`;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function genHalfLife(d, rng) {
  if (d === "hard") {
    if (rng.next() < 0.3) return halfMulti(rng);
    return halfHard(rng);
  }
  const kinds = d === "easy" ? ["remain", "remain", "time", "T", "n"] : ["frac", "decayed", "bg", "bgRead", "mixed", "remain", "T"];
  const kind = rng.pick(kinds);
  const q = rng.pick(QTY);
  const n = d === "easy" ? rng.int(1, 4) : rng.int(2, 6);
  const k = rng.int(3, q.unit === "nuclei" ? 500 : 60) * (q.unit === "nuclei" ? 1000 : 1);
  const N0 = k * 2 ** n;
  const N = k;
  const src = source(rng, kind === "time" || kind === "T" || kind === "remain" || kind === "mixed");
  const t = src.T * n;
  const tShown = fix(t);

  if (kind === "remain") {
    return numberQ({
      prompt: `${sampleOf(src)} has ${qtyText(q, N0)}. ${hlLine(src)} What will its ${q.what} be after ${num(tShown)} ${src.unit}? Give your answer in ${q.unit}.`,
      exact: N, rounded: false, unit: q.unit,
      steps: [`Number of half-lives: ${num(tShown)} / ${num(src.T)} = ${n}.`, `Halve ${n} time${n === 1 ? "" : "s"}: ${num(N0)} → ${Array.from({ length: n }, (_, i) => num(N0 / 2 ** (i + 1))).join(" → ")}.`, `After ${n} half-lives`],
      hints: ["First find how many half-lives fit into the time.", `Divide ${num(tShown)} by ${num(src.T)}, then halve the starting value that many times (in the calculator: \`_N0 / 2 ^ (_time / _half)\`).`],
      candidates: [N0 / (2 * n), N0 / 2, N0 - N0 / 2 ** n, N0 / 2 ** (n + 1), N0 / 2 ** (n - 1)],
      params: { kind: "decay", values: { N0, t: tShown, T: src.T }, unknown: "N" },
      given: [{ label: "_N0", value: N0 }, { label: "_time", value: tShown }, { label: "_half", value: src.T }],
    }, rng);
  }
  if (kind === "time") {
    return numberQ({
      prompt: `${sampleOf(src)} has ${qtyText(q, N0)}. ${hlLine(src)} How long will it take to fall to ${qtyVal(q, N)}? Give your answer in ${src.unit}.`,
      exact: t, rounded: false, unit: src.unit,
      steps: [`Count the halvings: ${Array.from({ length: n + 1 }, (_, i) => num(N0 / 2 ** i)).join(" → ")}. That is ${n} half-li${n === 1 ? "fe" : "ves"}.`, `Time = ${n} × ${num(src.T)}`],
      hints: [`Keep halving ${num(N0)} until you reach ${num(N)}, counting the steps.`, "Each step takes one half-life, so multiply the number of steps by the half-life."],
      candidates: [src.T * (n + 1), src.T / n, src.T * 2 ** n, src.T * (n - 1)],
      params: { kind: "decay", values: { N0, N, T: src.T }, unknown: "t" },
      given: [{ label: "_N0", value: N0 }, { label: "_N", value: N }, { label: "_half", value: src.T }],
    }, rng);
  }
  if (kind === "T") {
    const tu = src.unit;
    const T = src.T;
    return numberQ({
      prompt: `The ${q.what} of a radioactive sample falls from ${qtyVal(q, N0)} to ${qtyVal(q, N)} in ${num(T * n)} ${tu}. What is its half-life, in ${tu}?`,
      exact: T, rounded: false, unit: tu,
      steps: [`Count the halvings: ${Array.from({ length: n + 1 }, (_, i) => num(N0 / 2 ** i)).join(" → ")}, so ${n} half-li${n === 1 ? "fe" : "ves"}.`, `Half-life = ${num(T * n)} / ${n}`],
      hints: [`How many times do you halve ${num(N0)} to get ${num(N)}?`, "That many half-lives took the whole time, so divide the time by that number."],
      candidates: [T * n * 2, (T * n) / (n + 1), T * n / 2 ** n, T * n],
      params: { kind: "decay", values: { N0, N, t: fix(T * n) }, unknown: "T" },
      given: [{ label: "_N0", value: N0 }, { label: "_N", value: N }, { label: "_time", value: fix(T * n) }],
    }, rng);
  }
  if (kind === "n") {
    return numberQ({
      prompt: `The ${q.what} of a radioactive sample falls from ${qtyVal(q, N0)} to ${qtyVal(q, N)}. How many half-lives have passed?`,
      exact: n, rounded: false, unit: "",
      steps: [`Halve until you reach ${num(N)}: ${Array.from({ length: n + 1 }, (_, i) => num(N0 / 2 ** i)).join(" → ")}.`, "Number of halvings"],
      hints: ["Each half-life halves the value.", `Keep halving ${num(N0)} and count the steps until you reach ${num(N)}.`],
      candidates: [n + 1, n - 1, N0 / N / 2, 2 * n],
      params: { kind: "nhl", values: { N0, N }, unknown: "n" },
      given: [{ label: "_N0", value: N0 }, { label: "_N", value: N }],
    }, rng);
  }
  if (kind === "mixed") {
    // Half-life in hours, time in days.
    const T = rng.pick([2, 3, 4, 6, 8, 12, 24]);
    const nn = draw(() => rng.int(2, 6), (x) => isInt((T * x) / 24));
    const tDays = (T * nn) / 24;
    const N0b = k * 2 ** nn;
    return numberQ({
      prompt: `A radioactive sample has ${qtyText(q, N0b)}. Its half-life is ${T} hours. What will its ${q.what} be after ${num(tDays)} day${tDays === 1 ? "" : "s"}? Give your answer in ${q.unit}.`,
      exact: k, rounded: false, unit: q.unit,
      steps: [`Use the same time unit: ${num(tDays)} days = ${num(tDays * 24)} hours.`, `Half-lives: ${num(tDays * 24)} / ${T} = ${nn}.`, `${num(N0b)} halved ${nn} times: ${num(N0b)} / 2^${nn}`],
      hints: ["Put the time and the half-life in the same unit first (1 day = 24 hours).", `Then count half-lives and halve the starting value that many times (in the calculator: \`_N0 / 2 ^ (_time_days * 24 / _half_h)\`).`],
      candidates: [N0b / 2 ** (nn + 1), N0b / 2 ** Math.max(1, Math.round(tDays)), N0b / (2 * nn), N0b - k],
      params: { kind: "decay", values: { N0: N0b, t: tDays, T }, units: { t: 24 }, unknown: "N" },
      given: [{ label: "_N0", value: N0b }, { label: "_time_days", value: tDays }, { label: "_half_h", value: T }],
    }, rng);
  }
  if (kind === "frac" || kind === "decayed") {
    const den = 2 ** n;
    const p = kind === "frac" ? 1 : den - 1;
    const answer = fracStr(p, den);
    const after = rng.next() < 0.5 ? `${n} half-lives` : `${num(tShown)} ${src.unit}`;
    const halfInfo = after.includes("half") ? "" : ` ${hlLine(src)}`;
    const ask = kind === "frac" ? "What fraction of the original radioactive nuclei is left undecayed" : "What fraction of the original radioactive nuclei has decayed";
    const prompt = `${sampleOf(src)} is left for ${after}.${halfInfo} ${ask}? Type it as a fraction in simplest form, like 1/4.`;
    const alt = (x) => (kind === "frac" ? x : `${x.split("/")[1] - x.split("/")[0]}/${x.split("/")[1]}`);
    const wrongPool = [fracStr(1, 2 * n), fracStr(1, 2 ** (n + 1)), fracStr(1, 2 ** (n - 1)), fracStr(1, n + 1)].map(alt).concat(kind === "frac" ? [fracStr(den - 1, den)] : [fracStr(1, den)]);
    const explanation = [
      `Number of half-lives: ${after.includes("half") ? n : `${num(tShown)} / ${num(src.T)} = ${n}`}.`,
      `Each half-life halves what is left: 1 → 1/2 → 1/4 → … so after ${n} half-lives, (1/2)^${n} = 1/${den} is left.`,
      kind === "frac" ? `Fraction left: **${answer}**.` : `Fraction decayed = 1 - 1/${den} = **${answer}**.`,
    ].join("\n\n");
    const hints = [
      `${after.includes("half") ? "" : "Work out how many half-lives that is. "}Each half-life halves the fraction still left.`,
      kind === "frac" ? `Multiply 1/2 by itself once per half-life.` : `Find the fraction still left first, then take it away from 1.`,
    ];
    const params = { kind: "frac", which: kind, ...(after.includes("half") ? { n } : { t: tShown, T: src.T }) };
    if (rng.next() < 0.4) {
      const wrong = [...new Set(wrongPool)].filter((w) => w !== answer).slice(0, 3);
      return choiceQ({ prompt: prompt.replace(" Type it as a fraction in simplest form, like 1/4.", ""), answer, wrong, explanation, hints, params }, rng);
    }
    return { prompt, answer, answerType: "text", explanation, hints, params };
  }
  // Background correction (medium): whole numbers.
  const B = rng.int(10, 60);
  const kk = rng.int(5, 80);
  const C0 = kk * 2 ** n + B;
  const src2 = source(rng, true);
  const tt = src2.T * n;
  const per = rng.pick(["counts per minute", "counts per second"]);
  const read = kind === "bgRead";
  const exact = read ? kk + B : kk;
  return numberQ({
    prompt: `A Geiger counter next to ${src2.named ? `a sample of ${src2.label}` : "a radioactive sample"} reads ${C0} ${per}. With the sample removed, the background count rate is ${B} ${per}. The half-life is ${num(src2.T)} ${src2.unit}. ${read ? `What will the counter read next to the sample after ${num(tt)} ${src2.unit}` : `What will the corrected count rate from the sample alone be after ${num(tt)} ${src2.unit}`}, in ${per}? (The background stays the same.)`,
    exact, rounded: false, unit: per,
    steps: [
      `Subtract the background first: the sample alone gives ${C0} - ${B} = ${C0 - B} ${per}. Only this part halves.`,
      `Half-lives: ${num(tt)} / ${num(src2.T)} = ${n}, so ${C0 - B} / 2^${n} = ${kk}.`,
      ...(read ? [`The counter also picks up the background again: ${kk} + ${B}`] : ["Corrected count rate"]),
    ],
    hints: [
      "Background radiation doesn't decay with the sample, so take it away before you halve anything.",
      `Halve the corrected count rate once per half-life (in the calculator: \`(_C - _B) / 2 ^ (_time / _half)\`).${read ? " Then add the background back on." : ""}`,
    ],
    candidates: read ? [kk, C0 / 2 ** n, C0 / 2 ** n + B, kk + 2 * B] : [C0 / 2 ** n, kk + B, C0 / 2 ** n - B, (C0 - B) / (2 * n)],
    params: { kind: "bg", values: { C: C0, B, t: fix(tt), T: src2.T }, unknown: "R", read },
    given: [{ label: "_C", value: C0 }, { label: "_B", value: B }, { label: "_time", value: fix(tt) }, { label: "_half", value: src2.T }],
  }, rng);
}

function halfHard(rng) {
  const kind = rng.pick(["nonint", "nhl", "timeTo", "Tfrom", "bgHard"]);
  const src = source(rng, false);
  const q = rng.pick(QTY.filter((x) => x.unit !== "nuclei"));
  const T = src.T;
  const N0 = rng.int(500, 50000) / 10;
  if (kind === "nonint" || kind === "nhl") {
    const t = draw(() => fix(Math.round(T * (rng.int(15, 70) / 10) * 10) / 10), (x) => !isInt(x / T));
    const n = t / T;
    if (kind === "nhl") {
      return numberQ({
        prompt: `${sampleOf(src)} is left for ${num(t)} ${src.unit}. ${hlLine(src)} How many half-lives is this?${DP}`,
        exact: n, rounded: true, unit: "",
        steps: ["Number of half-lives = time / half-life (same units).", `n = ${num(t)} / ${num(T)}`],
        hints: ["Number of half-lives = time elapsed ÷ half-life.", `Make sure both are in ${src.unit}, then divide (in the calculator: \`_time / _half\`).${THEN}`],
        candidates: [T / t, n + 1, Math.floor(n), t * T / 100],
        params: { kind: "nhl2", values: { t, T }, unknown: "n" },
        given: [{ label: "_time", value: t }, { label: "_half", value: T }],
      }, rng);
    }
    const N = N0 * 0.5 ** n;
    return numberQ({
      prompt: `${sampleOf(src)} has ${qtyText(q, N0)}. ${hlLine(src)} What will its ${q.what} be after ${num(t)} ${src.unit}, in ${q.unit}?${DP}`,
      exact: N, rounded: true, unit: q.unit,
      steps: [
        "The time is not a whole number of half-lives, so use `N = N0 × (1/2)^n` with n = t / T.",
        `n = ${num(t)} / ${num(T)} = ${num(n)}.`,
        `\`N = ${num(N0)} × 0.5 ^ ${num(n)}\``,
      ],
      hints: [
        "When the time isn't a whole number of half-lives, use `N = N0 × (1/2)^n`, where n = t / T can be a decimal.",
        `In the calculator: \`_N0 * 0.5 ^ (_time / _half)\`.${THEN}`,
      ],
      candidates: [N0 * 0.5 ** Math.floor(n), N0 * 0.5 ** Math.ceil(n), N0 / (2 * n), N0 * (1 - 0.5 ** n)],
      params: { kind: "decay", values: { N0, t, T }, unknown: "N" },
      given: [{ label: "_N0", value: N0 }, { label: "_time", value: t }, { label: "_half", value: T }],
    }, rng);
  }
  if (kind === "timeTo" || kind === "Tfrom") {
    const ratio = draw(() => rng.int(150, 9000) / 100, (x) => !isInt(Math.log2(x)));
    const N = fix(Math.round((N0 / ratio) * 10) / 10);
    if (!(N > 0) || !(N < N0)) throw new Retry();
    const n = Math.log2(N0 / N);
    if (kind === "timeTo") {
      const exact = T * n;
      return numberQ({
        prompt: `${sampleOf(src)} has ${qtyText(q, N0)}. ${hlLine(src)} How long will it take for its ${q.what} to fall to ${qtyVal(q, N)}, in ${src.unit}?${DP}`,
        exact, rounded: true, unit: src.unit,
        steps: [
          "Solve `N = N0 × (1/2)^n` for n: `n = log(N0 / N) / log 2`. Then time = n × half-life.",
          `n = log(${num(N0)} / ${num(N)}) / log 2 = ${num(n)}.`,
          `\`t = ${num(n)} × ${num(T)}\``,
        ],
        hints: [
          "Use `N = N0 × (1/2)^n` and solve for the number of half-lives: `n = log(N0 / N) / log(2)`.",
          `Then multiply n by the half-life (in the calculator: \`log(_N0 / _N) / log(2) * _half\`).${THEN}`,
        ],
        candidates: [T * (N0 / N) / 2, T * Math.ceil(n), T * Math.floor(n), (T * N0) / N / 4, T / n],
        params: { kind: "decay", values: { N0, N, T }, unknown: "t" },
        given: [{ label: "_N0", value: N0 }, { label: "_N", value: N }, { label: "_half", value: T }],
      }, rng);
    }
    const t = fix(Math.round(rng.int(20, 900)) / 10);
    const exact = t / n;
    return numberQ({
      prompt: `The ${q.what} of a radioactive sample falls from ${qtyVal(q, N0)} to ${qtyVal(q, N)} in ${num(t)} ${src.unit}. What is its half-life, in ${src.unit}?${DP}`,
      exact, rounded: true, unit: src.unit,
      steps: [
        "Find how many half-lives passed: `n = log(N0 / N) / log 2`. Then half-life = time / n.",
        `n = log(${num(N0)} / ${num(N)}) / log 2 = ${num(n)}.`,
        `\`T = ${num(t)} / ${num(n)}\``,
      ],
      hints: [
        "First find the number of half-lives from `N = N0 × (1/2)^n`: `n = log(N0 / N) / log(2)`.",
        `Half-life = time ÷ n (in the calculator: \`_time / (log(_N0 / _N) / log(2))\`).${THEN}`,
      ],
      candidates: [t * n, t / Math.ceil(n), t / Math.floor(Math.max(1, n)), t / (N0 / N / 2)],
      params: { kind: "decay", values: { N0, N, t }, unknown: "T" },
      given: [{ label: "_N0", value: N0 }, { label: "_N", value: N }, { label: "_time", value: t }],
    }, rng);
  }
  // bgHard: counter reading after a non-whole number of half-lives
  const B = rng.int(100, 600) / 10;
  const C = fix(B + rng.int(500, 20000) / 10);
  const per = rng.pick(["counts per minute", "counts per second"]);
  const t = draw(() => fix(Math.round(T * (rng.int(12, 50) / 10) * 10) / 10), (x) => !isInt(x / T));
  const corr = (C - B) * 0.5 ** (t / T);
  const read = rng.next() < 0.5;
  const exact = read ? corr + B : corr;
  return numberQ({
    prompt: `A counter next to ${src.named ? `a sample of ${src.label}` : "a radioactive sample"} reads ${num(C)} ${per}, including a background count rate of ${num(B)} ${per}. ${hlLine(src)} ${read ? `What will the counter read after ${num(t)} ${src.unit}` : `What will the corrected count rate (sample only) be after ${num(t)} ${src.unit}`}, in ${per}? (The background stays the same.)${DP}`,
    exact, rounded: true, unit: per,
    steps: [
      `Corrected count rate now: ${num(C)} - ${num(B)} = ${num(C - B)} ${per}. Only this part decays.`,
      `Half-lives: n = ${num(t)} / ${num(T)} = ${num(t / T)}, so the sample gives ${num(C - B)} × 0.5^${num(t / T)} = ${num(corr)} ${per}.`,
      ...(read ? [`Add the background back on: ${num(corr)} + ${num(B)}`] : ["Corrected count rate"]),
    ],
    hints: [
      "Subtract the background first: it doesn't decay.",
      "The time isn't a whole number of half-lives, so use `(C - B) × 0.5^(t / T)`.",
      `In the calculator: \`(_C - _B) * 0.5 ^ (_time / _half)${read ? " + _B" : ""}\`.${THEN}`,
    ],
    candidates: read ? [corr, C * 0.5 ** (t / T), C * 0.5 ** (t / T) + B, corr + 2 * B] : [C * 0.5 ** (t / T), corr + B, C * 0.5 ** (t / T) - B, (C - B) * 0.5 ** Math.floor(t / T)],
    params: { kind: "bg", values: { C, B, t, T }, unknown: "R", read },
    given: [{ label: "_C", value: C }, { label: "_B", value: B }, { label: "_time", value: t }, { label: "_half", value: T }],
  }, rng);
}

function halfMulti(rng) {
  const src = source(rng, false);
  const T = src.T;
  const B = rng.int(100, 500) / 10;
  const C = fix(B + rng.int(1000, 20000) / 10);
  const per = rng.pick(["counts per minute", "counts per second"]);
  const t = draw(() => fix(Math.round(T * (rng.int(12, 45) / 10) * 10) / 10), (x) => !isInt(x / T));
  const n = t / T;
  const corr0 = C - B;
  const corr = corr0 * 0.5 ** n;
  const read = corr + B;
  for (const v of [n, corr, read, corr0]) if (isTie(v)) throw new Retry();
  return {
    prompt: `A counter next to ${src.named ? `a sample of ${src.label}` : "a radioactive sample"} reads ${num(C)} ${per}. The background count rate is ${num(B)} ${per}. ${hlLine(src)} The sample is measured again after ${num(t)} ${src.unit}. The background stays the same.`,
    answerType: "multi",
    parts: [
      { id: "corr", label: "Corrected now", ask: `What is the corrected count rate from the sample alone now, in ${per}?${DP}`, answerType: "number", answer: round2(corr0), tolerance: 0.005, hint: "Take the background away from the reading." },
      { id: "n", label: "Half-lives", ask: `How many half-lives pass in ${num(t)} ${src.unit}?${DP}`, answerType: "number", answer: round2(n), tolerance: 0.005, hint: "Divide the time by the half-life (in the calculator: `_time / _half`)." },
      { id: "read", label: "New reading", ask: `What will the counter read after ${num(t)} ${src.unit}, in ${per}?${DP}`, answerType: "number", answer: round2(read), tolerance: 0.005, hint: "Only the corrected part decays: `(C - B) × 0.5^(t / T)`, then add the background back. Use the unrounded number of half-lives." },
    ],
    explanation: [
      `1. Corrected count rate: ${num(C)} - ${num(B)} = **${fmtAns(corr0, true)} ${per}**.`,
      `2. Half-lives: ${num(t)} / ${num(T)} ≈ ${n.toFixed(4)}, which rounds to **${fmtAns(n, true)}**.`,
      `3. Sample alone later: ${num(corr0)} × 0.5^${num(n)} ≈ ${corr.toFixed(4)}. Add the background: ${corr.toFixed(4)} + ${num(B)} ≈ ${read.toFixed(4)}, which rounds to **${fmtAns(read, true)} ${per}**.`,
    ].join("\n\n"),
    given: [{ label: "_C", value: C }, { label: "_B", value: B }, { label: "_time", value: t }, { label: "_half", value: T }],
    params: {
      kind: "multiHL",
      parts: [
        { id: "corr", kind: "corr", values: { C, B }, rounded: true },
        { id: "n", kind: "nhl2", values: { t, T }, rounded: true },
        { id: "read", kind: "bg", values: { C, B, t, T }, read: true, rounded: true },
      ],
    },
  };
}

// ---------------------------------------------------------------------------------------------

const GENS = { "nuclear-notation": genNotation, "decay-equations": genDecay, "half-life": genHalfLife };

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") throw new Error(`Unknown difficulty: ${difficulty}`);
  const fn = GENS[subtopic];
  if (!fn) throw new Error(`Unknown subtopic: ${subtopic}`);
  for (let i = 0; i < 40; i++) {
    try {
      return fn(difficulty, rng);
    } catch (e) {
      if (!(e instanceof Retry)) throw e;
    }
  }
  return fn(difficulty, rng);
}

// ---------------------------------------------------------------------------------------------
// Independent check.
// - Notation: parse the nuclide string back into A and Z (from the super/subscripts) and recount.
// - Decays: use conservation totals (A0 = A + 4·alphas, Z0 = Z + 2·alphas - betas) instead of
//   stepping through the chain, and check the product's symbol against its own table of atomic numbers.
// - Half-life: substitute the answer into N - N0·2^(-t/T) (or the background version) and check the
//   residual changes sign inside ±0.005 for rounded answers; fractions are rebuilt by repeated halving.

const SUP_V = Object.fromEntries([..."⁰¹²³⁴⁵⁶⁷⁸⁹"].map((c, i) => [c, i]));
const SUB_V = Object.fromEntries([..."₀₁₂₃₄₅₆₇₈₉"].map((c, i) => [c, i]));

function parseNuc(s) {
  const m = /^([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([₀₁₂₃₄₅₆₇₈₉]+)([A-Z][a-z]?)$/.exec(String(s));
  if (!m) return null;
  const A = Number([...m[1]].map((c) => SUP_V[c]).join(""));
  const Z = Number([...m[2]].map((c) => SUB_V[c]).join(""));
  if (symbolOf(Z) !== m[3]) return null; // symbol must match the atomic number
  return { A, Z };
}

const intAns = (a) => {
  if (a === "" || a === null || a === undefined) return null;
  const x = Number(a);
  return Number.isInteger(x) ? x : null;
};

function fourChoices(q, answer) {
  const ch = q.choices;
  return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && ch.includes(String(answer));
}

// Residual laws for half-life numbers (times in the question's unit; units.t scales t into T's unit).
const HL = {
  decay: (k) => k.N - k.N0 * Math.pow(2, -k.t / k.T),
  nhl: (k) => k.N0 - k.N * Math.pow(2, k.n),
  nhl2: (k) => k.n * k.T - k.t,
  bg: (k) => k.R - (k.read ? k.B : 0) - (k.C - k.B) * Math.pow(2, -k.t / k.T),
  corr: (k) => k.R - (k.C - k.B),
};

function checkHL(kind, values, unknown, units, rounded, answer, extra = {}) {
  const x = Number(answer);
  if (answer === "" || answer === null || answer === undefined || !Number.isFinite(x)) return false;
  const law = HL[kind];
  const at = (v) => {
    const k = { ...extra };
    for (const [key, raw] of Object.entries({ ...values, [unknown]: v })) k[key] = units && units[key] ? raw * units[key] : raw;
    return k;
  };
  const k = at(x);
  for (const [key, v] of Object.entries(k)) if (key !== "read" && !(typeof v === "number" && v > 0)) return false;
  const r = law(k);
  const step = 1e-4 * Math.max(1, Math.abs(x));
  const sens = Math.abs(law(at(x + step)) - law(at(x - step))) / (2 * step);
  if (!Number.isFinite(r) || !(sens > 0)) return false;
  if (!rounded) return Number.isInteger(x) && Math.abs(r) / sens <= 1e-6;
  const lo = law(at(x - 0.005)), hi = law(at(x + 0.005));
  const eps = 1e-7 * sens;
  if (Math.abs(lo) <= eps || Math.abs(hi) <= eps) return false;
  return lo * hi < 0;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (question.answerType === "choice" && !fourChoices(question, answer)) return false;

  switch (p.kind) {
    case "count": {
      const nucl = parseNuc(p.nuclide);
      const x = intAns(answer);
      if (!nucl || x === null) return false;
      const want = { protons: nucl.Z, neutrons: nucl.A - nucl.Z, nucleons: nucl.A, excess: Math.abs(nucl.A - 2 * nucl.Z) }[p.ask];
      return x === want;
    }
    case "isoDiff": {
      const [a, b] = p.nuclides.map(parseNuc);
      const x = intAns(answer);
      if (!a || !b || x === null || a.Z !== b.Z) return false;
      return x === (a.A - a.Z) - (b.A - b.Z);
    }
    case "isotope": {
      const of = parseNuc(p.of), c = parseNuc(answer);
      if (!of || !c) return false;
      const others = question.choices.filter((s) => s !== String(answer)).map(parseNuc);
      return c.Z === of.Z && c.A !== of.A && others.every((o) => o && o.Z !== of.Z);
    }
    case "mostN": {
      const all = question.choices.map(parseNuc);
      const c = parseNuc(answer);
      if (!c || all.some((x) => !x)) return false;
      const nc = c.A - c.Z;
      return all.every((x) => (x.A === c.A && x.Z === c.Z) || (p.most ? x.A - x.Z < nc : x.A - x.Z > nc));
    }
    case "isoMulti": {
      const nucl = parseNuc(p.nuclide);
      if (!nucl || !answer || typeof answer !== "object") return false;
      const n = intAns(answer.neutrons), z = intAns(answer.protons), a = intAns(answer.mass);
      return n === nucl.A - nucl.Z && z === nucl.Z && a !== null && a - z === n + p.change;
    }
    case "decay": {
      if (!Array.isArray(p.steps)) {
        // half-life number questions
        return checkHL("decay", p.values, p.unknown, p.units, p.rounded, answer);
      }
      const alphas = p.steps.filter((s) => s === "a").length;
      const betas = p.steps.filter((s) => s === "b").length;
      if (alphas + betas + p.steps.filter((s) => s === "g").length !== p.steps.length) return false;
      const A = p.A0 - 4 * alphas;
      const Z = p.Z0 - 2 * alphas + betas;
      if (p.ask === "product") {
        const c = parseNuc(answer);
        return !!c && c.A === A && c.Z === Z;
      }
      const x = intAns(answer);
      if (x === null) return false;
      return x === { A, Z, N: A - Z }[p.ask];
    }
    case "type": {
      const EFFECT = { "alpha (⁴₂He)": [4, 2], "beta (⁰₋₁e)": [0, -1], "gamma (γ)": [0, 0], "neutron (¹₀n)": [1, 0] };
      const e = EFFECT[String(answer)];
      // Conservation: parent = daughter + emitted particle.
      return !!e && p.A0 === p.A1 + e[0] && p.Z0 === p.Z1 + e[1];
    }
    case "count2": {
      if (!answer || typeof answer !== "object") return false;
      const a = intAns(answer.alpha), b = intAns(answer.beta);
      if (a === null || b === null || a < 0 || b < 0) return false;
      return p.A0 - 4 * a === p.A1 && p.Z0 - 2 * a + b === p.Z1;
    }
    case "nhl":
      return checkHL("nhl", p.values, "n", null, p.rounded, answer);
    case "nhl2":
      return checkHL("nhl2", p.values, "n", null, p.rounded, answer);
    case "bg":
      return checkHL("bg", p.values, "R", null, p.rounded, answer, { read: p.read ? 1 : 0 });
    case "frac": {
      const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(answer));
      if (!m) return false;
      const num_ = Number(m[1]), den = Number(m[2]);
      if (den === 0 || gcd(num_, den) !== 1) return false;
      const n = p.n !== undefined ? p.n : p.t / p.T;
      if (!Number.isInteger(Math.round(n * 1e9) / 1e9)) return false;
      let left = [1, 1];
      for (let i = 0; i < Math.round(n); i++) left = [left[0], left[1] * 2];
      const want = p.which === "frac" ? left : [left[1] - left[0], left[1]];
      return num_ * want[1] === want[0] * den;
    }
    case "multiHL": {
      if (question.answerType !== "multi" || !answer || typeof answer !== "object") return false;
      return p.parts.every((s) => {
        if (s.kind === "corr") return checkHL("corr", s.values, "R", null, true, answer[s.id]);
        if (s.kind === "nhl2") return checkHL("nhl2", s.values, "n", null, true, answer[s.id]);
        return checkHL("bg", s.values, "R", null, true, answer[s.id], { read: 1 });
      });
    }
    default:
      return false;
  }
}
