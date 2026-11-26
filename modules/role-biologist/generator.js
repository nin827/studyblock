// Biologist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   cross-counts     monohybrid / dihybrid crosses -> probability, expected count, chi-square   (Geneticist)
//   hardy-weinberg   q^2 -> q -> carriers -> alleles; backwards from a carrier count           (Geneticist)
//   field-ecology    capture-recapture -> density -> energy to the next level -> area          (Ecologist)
//   growth-diversity doubling time, microscope magnification, Simpson's index                  (Ecologist)

// ---------- helpers ----------

function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fmt = (n, d = 4) => String(roundTo(n, d));
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-biologist: no suitable draw"); };

function numPart(id, label, ask, val, dp, hint) {
  return { id: id.toLowerCase(), label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
const pct = (x) => `${roundTo(x * 100, 2)}%`;

// ---------- cross-counts ----------

const MONO = [
  ["tall stems", "dwarf stems", "pea plants"],
  ["purple flowers", "white flowers", "pea plants"],
  ["round seeds", "wrinkled seeds", "pea plants"],
  ["black fur", "brown fur", "mice"],
  ["long wings", "short wings", "fruit flies"],
  ["grey bodies", "ebony bodies", "fruit flies"],
  ["smooth skin", "rough skin", "garden snails"],
  ["yellow seeds", "green seeds", "pea plants"],
  ["red petals", "white petals", "snapdragons"],
  ["curly hair", "straight hair", "guinea pigs"],
  ["normal wings", "vestigial wings", "fruit flies"],
  ["dark coats", "pale coats", "rabbits"],
];
const DI = [
  ["round", "wrinkled", "yellow", "green", "pea seeds"],
  ["tall", "dwarf", "purple-flowered", "white-flowered", "pea plants"],
];

// Monohybrid Aa x Aa: probability -> expected count -> (hard) consistent within 10%?
function genMono(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const tr = rng.pick(MONO);
    const N = rng.pick([40, 60, 80, 120, 160, 200, 240, 320, 400, 600]);
    const dom = rng.next() < 0.5;
    const frac = dom ? 0.75 : 0.25;
    const E = N * frac;
    const n = TIER_PARTS[tier];
    const trait = dom ? tr[0] : tr[1];
    let obs = 0, ok = false;
    if (n === 3) {
      const dev = rng.int(1, Math.ceil(E * 0.25)) * (rng.next() < 0.5 ? -1 : 1);
      obs = Math.round(E + dev);
      if (obs < 1 || Math.abs(Math.abs(obs - E) - 0.1 * E) < 1.5) continue;
      ok = Math.abs(obs - E) <= 0.1 * E;
    }
    const parts = [
      numPart("p", "Probability", `Probability that one offspring has ${trait}`, frac, 2, "List the four equally likely offspring genotypes of Aa × Aa (AA, Aa, aA, aa) and count those showing the trait."),
      numPart("e", "Expected count", `Expected number of offspring with ${trait}`, E, 0, "Expected count = probability × the number of offspring."),
    ];
    if (n === 3) parts.push(yesNo("ok", "Consistent?", `Is the observed count consistent with the expected ratio, by the rule above?`, ok, "Find the difference between observed and expected, then compare it with 10% of the expected count."));
    const ex = [
      `**Probability:** Aa × Aa gives AA, Aa, aA, aa. ${dom ? "Three of the four" : "One of the four"} show ${trait}, so **${fixed(frac, 2)}**.`,
      `**Expected count:** ${fixed(frac, 2)} × ${N} = **${fixed(E, 0)}**.`,
      `**Consistent?** |${obs} − ${fixed(E, 0)}| = ${Math.abs(obs - E)}, and 10% of ${fixed(E, 0)} is ${fmt(0.1 * E, 1)}. The difference is ${ok ? "no more than" : "more than"} that, so **${ok ? "Yes" : "No"}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `Two heterozygous ${tr[2]} (Aa × Aa) are crossed. ${tr[0][0].toUpperCase() + tr[0].slice(1)} is dominant to ${tr[1]}. The cross produces **${N}** offspring.${n === 3 ? ` You count **${obs}** with ${trait}. Rule: the result is consistent with the expected ratio if the observed count is within 10% of the expected count.` : ""}`,
      parts, ex, "bi-mono", { N, dom, obs, n }, [["_n", N]].concat(n === 3 ? [["_obs", obs]] : []),
      ["Aa × Aa gives a 3 : 1 ratio of dominant to recessive.", "Expected counts come from the probability times the total."],
    );
  }
  return tooMany();
}

// Dihybrid AaBb x AaBb: probability -> expected count -> chi-square -> consistent (chi-square < 7.81).
function genDi(rng) {
  for (let i = 0; i < TRY; i++) {
    const tr = rng.pick(DI);
    const N = rng.pick([160, 240, 320, 400, 480]);
    const w = [9, 3, 3, 1];
    const E = w.map((x) => (x * N) / 16);
    const ti = rng.pick([0, 0, 1, 2, 3]);
    const dmax = rng.int(2, 14);
    const d = [rng.int(-dmax, dmax), rng.int(-dmax, dmax), rng.int(-dmax, dmax)];
    d.push(-d[0] - d[1] - d[2]);
    const O = E.map((e, k) => e + d[k]);
    if (O.some((o) => o < 1)) continue;
    const chi = d.reduce((s, x, k) => s + (x * x) / E[k], 0);
    if (Math.abs(chi - 7.81) < 0.6 || nearHalf(chi, 2)) continue;
    const ok = chi < 7.81;
    const names = [`${tr[0]} and ${tr[2]}`, `${tr[0]} and ${tr[3]}`, `${tr[1]} and ${tr[2]}`, `${tr[1]} and ${tr[3]}`];
    const p = w[ti] / 16;
    const parts = [
      numPart("p", "Probability", `Probability that one offspring is ${names[ti]}`, p, 4, "AaBb × AaBb gives 16 equally likely combinations in a 9 : 3 : 3 : 1 ratio. Divide the class's share by 16."),
      numPart("e", "Expected count", `Expected number of ${names[ti]} offspring`, E[ti], 0, "Expected count = probability × the number of offspring."),
      numPart("chi", "Chi-square", "Chi-square, the sum of (observed − expected)² ÷ expected over all four classes", chi, 2, "Work out the expected count for each of the four classes first, then add the four terms."),
      yesNo("ok", "Consistent?", "By the rule above, is the result consistent with a 9 : 3 : 3 : 1 ratio?", ok, "Compare your chi-square value with the cut-off."),
    ];
    const ex = [
      `**Probability:** ${w[ti]} of the 16 combinations, so **${fixed(p, 4)}**.`,
      `**Expected count:** ${fixed(p, 4)} × ${N} = **${fixed(E[ti], 0)}**.`,
      `**Chi-square:** expected counts ${E.join(", ")}. ${d.map((x, k) => `(${O[k]} − ${E[k]})² ÷ ${E[k]}`).join(" + ")} = **${fixed(chi, 2)}**.`,
      `**Consistent?** ${fixed(chi, 2)} is ${ok ? "below" : "not below"} 7.81, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `Two plants heterozygous for both genes (AaBb × AaBb) are crossed. For the ${tr[4]}, ${tr[0]} (A) is dominant to ${tr[1]}, and ${tr[2]} (B) is dominant to ${tr[3]}. The genes are on different chromosomes. The cross gives **${N}** offspring: **${O[0]}** ${names[0]}, **${O[1]}** ${names[1]}, **${O[2]}** ${names[2]} and **${O[3]}** ${names[3]}. Rule: with 3 degrees of freedom, the result is consistent with the expected ratio if chi-square is below 7.81.`,
      parts, ex, "bi-di", { N, O, ti }, [["_n", N], ["_o1", O[0]], ["_o2", O[1]], ["_o3", O[2]], ["_o4", O[3]]],
      ["Expected classes follow 9 : 3 : 3 : 1 out of 16.", "Chi-square adds one term per class, each (O − E)² ÷ E."],
    );
  }
  return tooMany();
}

// Expert+: which of two crosses fits the data, by chi-square.
function genCrossFit(rng) {
  for (let i = 0; i < TRY; i++) {
    const tr = rng.pick(MONO);
    const N = rng.int(10, 30) * 4;
    const pTrue = rng.pick([0.25, 0.5]);
    const r = Math.ceil(N * 0.08);
    const k = Math.round(N * pTrue + rng.int(-r, r));
    if (k < 1 || k >= N) continue;
    const chi1 = ((k - N / 4) ** 2 * 16) / (3 * N);
    const chi2 = ((k - N / 2) ** 2 * 4) / N;
    if (Math.abs(chi1 - chi2) < 1 || nearHalf(chi1, 2) || nearHalf(chi2, 2)) continue;
    const best = chi1 < chi2 ? 0 : 1;
    const chiB = best ? chi2 : chi1;
    if (Math.abs(chiB - 3.84) < 0.4) continue;
    const ok = chiB < 3.84;
    const M = rng.pick([40, 80, 120, 200]);
    const pB = best ? 0.5 : 0.25;
    const nm = ["Aa × Aa", "Aa × aa"];
    const cols = ["Better-fitting cross", "Consistent with it?"];
    const choices = [[nm[0], "Yes"], [nm[0], "No"], [nm[1], "Yes"], [nm[1], "No"]];
    const parts = [
      numPart("chi1", "Chi-square, Aa × Aa", "Chi-square for the Aa × Aa cross (1 recessive : 3 dominant)", chi1, 2, "Expected recessive = N ÷ 4 and expected dominant = 3N ÷ 4. Add (O − E)² ÷ E for both classes."),
      numPart("chi2", "Chi-square, Aa × aa", "Chi-square for the Aa × aa cross (1 : 1)", chi2, 2, "Expected recessive = N ÷ 2 and expected dominant = N ÷ 2. Add (O − E)² ÷ E for both classes."),
      { id: "best", label: "Verdict", ask: "Which cross fits better, and is that fit consistent with the data by the 3.84 rule?", answerType: "choice", choiceCols: cols, choices, answer: [nm[best], ok ? "Yes" : "No"], hint: "The smaller chi-square is the better fit. Then compare that value with 3.84." },
      numPart("next", "Next offspring", `Expected number of recessive offspring among the next ${M} from the better-fitting cross`, M * pB, 0, "Use the probability of a recessive offspring under the better-fitting cross, times the number of offspring."),
    ];
    const ex = [
      `**Aa × Aa:** expected ${fmt(N / 4, 2)} recessive and ${fmt((3 * N) / 4, 2)} dominant; observed ${k} and ${N - k}. Chi-square = **${fixed(chi1, 2)}**.`,
      `**Aa × aa:** expected ${fmt(N / 2, 2)} of each; chi-square = **${fixed(chi2, 2)}**.`,
      `**Verdict:** the smaller value is ${nm[best]}, and ${fixed(chiB, 2)} is ${ok ? "below" : "not below"} 3.84, so **${nm[best]} | ${ok ? "Yes" : "No"}**.`,
      `**Next offspring:** ${pB} × ${M} = **${fixed(M * pB, 0)}**.`,
    ].join("\n\n");
    return finish(
      `Two ${tr[2]} produced **${N}** offspring, of which **${k}** show the recessive trait (${tr[1]}). It is not known whether both parents are heterozygous (Aa × Aa, expected 1 recessive : 3 dominant) or one is heterozygous and the other recessive (Aa × aa, expected 1 : 1). Rule: with 1 degree of freedom, a cross is consistent with the data if its chi-square is below 3.84.`,
      parts, ex, "bi-fit", { N, k, M }, [["_n", N], ["_k", k], ["_next", M]],
      ["Test each cross in turn: expected counts first, then chi-square.", "Whichever chi-square is smaller is the better fit."],
    );
  }
  return tooMany();
}

// ---------- hardy-weinberg ----------

const POPS = [["rabbits", "white fur"], ["snails", "yellow shells"], ["mice", "short tails"], ["beetles", "wingless bodies"], ["moths", "pale wings"], ["geckos", "striped skin"], ["finches", "short beaks"], ["frogs", "spotless backs"], ["crickets", "flightless bodies"], ["voles", "grey tails"], ["newts", "orange bellies"], ["lizards", "blue throats"]];

// q^2 -> q -> carrier frequency -> carriers (hard) -> alleles (expert, from an affected count)
function genHW(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const [org, trait] = rng.pick(POPS);
    const n = TIER_PARTS[tier];
    const expert = tier === "expert";
    const k = rng.int(2, 9);
    const q0 = k / 20;
    const q2 = q0 * q0;
    const N = expert ? rng.pick([400, 800, 1200, 1600, 2000, 2400, 4000]) : rng.pick([200, 400, 500, 800, 1000, 2000, 2500]);
    const st = (rd) => {
      const f2 = rd("f2", q2);
      const q = rd("q", Math.sqrt(f2));
      const c = rd("c", 2 * q * (1 - q));
      const cn = rd("cn", c * N);
      const al = rd("al", 2 * N * q);
      return { f2, q, c, cn, al };
    };
    let parts, ex, order;
    if (expert) {
      order = ["f2", "q", "cn", "al"];
      const aff = Math.round(q2 * N);
      if (Math.abs(aff - q2 * N) > 1e-6) continue;
      if (!stableOk(st, { f2: 4, q: 2, cn: 0, al: 0 })) continue;
      const r = st((a, v) => v);
      parts = [
        numPart("f2", "Affected frequency", "Frequency q² of affected animals (a decimal)", r.f2, 4, "Frequency = number affected ÷ population size."),
        numPart("q", "Allele frequency", "Frequency q of the recessive allele", r.q, 2, "Affected animals are aa, so q² is their frequency. Take the square root."),
        numPart("cn", "Carriers", "Expected number of carriers (Aa) in the population", r.cn, 0, "Carrier frequency is 2pq, with p = 1 − q. Multiply by the population size."),
        numPart("al", "Recessive alleles", "Number of recessive alleles in the gene pool (each animal has 2 alleles)", r.al, 0, "The gene pool has 2 × N alleles in total. Multiply by q."),
      ];
      ex = [
        `**Affected frequency:** ${aff} ÷ ${N} = **${fixed(r.f2, 4)}**.`,
        `**Allele frequency:** q = √${fixed(r.f2, 4)} = **${fixed(r.q, 2)}**.`,
        `**Carriers:** 2pq = 2 × ${fixed(r.q, 2)} × ${fixed(1 - r.q, 2)} = ${fmt(r.c, 4)}, and × ${N} = **${fixed(r.cn, 0)}**.`,
        `**Recessive alleles:** 2 × ${N} × ${fixed(r.q, 2)} = **${fixed(r.al, 0)}**.`,
      ].join("\n\n");
      return finish(
        `In a population of **${N}** ${org}, the recessive allele a gives ${trait}. **${aff}** animals show it. Assume Hardy–Weinberg equilibrium: p + q = 1 and p² + 2pq + q² = 1.`,
        parts, ex, "hw-x", { N, aff }, [["_n", N], ["_aff", aff]],
        ["Affected animals are the aa genotype, so their frequency is q².", "Square root first, then p = 1 − q, then the carriers."],
      );
    }
    order = ["q", "c", "cn"].slice(0, n);
    const dps = { q: 2, c: 3, cn: 0 };
    if (!stableOk(st, Object.fromEntries(order.map((x) => [x, dps[x]])))) continue;
    const r = st((a, v) => v);
    const all = [
      numPart("q", "Allele frequency", "Frequency q of the recessive allele", r.q, 2, "The trait needs aa, so q² is the frequency of affected animals. Take the square root."),
      numPart("c", "Carrier frequency", "Frequency of carriers (Aa) as a decimal", r.c, 3, "Carriers have frequency 2pq, and p = 1 − q."),
      numPart("cn", "Carriers", `Expected number of carriers in ${N} animals`, r.cn, 0, "Multiply the carrier frequency by the population size."),
    ].slice(0, n);
    const exs = [
      `**Allele frequency:** q = √${fmt(q2, 4)} = **${fixed(r.q, 2)}**.`,
      `**Carrier frequency:** p = ${fixed(1 - r.q, 2)}, so 2pq = 2 × ${fixed(r.q, 2)} × ${fixed(1 - r.q, 2)} = **${fixed(r.c, 3)}**.`,
      `**Carriers:** ${fixed(r.c, 3)} × ${N} = **${fixed(r.cn, 0)}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `In a population of ${org}, the recessive allele a gives ${trait}, and the frequency of ${trait} is **${fmt(q2, 4)}** (that is q²). Assume Hardy–Weinberg equilibrium: p + q = 1 and p² + 2pq + q² = 1.${n === 3 ? ` The population has **${N}** animals.` : ""}`,
      all, exs, "hw", { k, N, n }, [["_q2", q2]].concat(n === 3 ? [["_n", N]] : []),
      ["The affected animals are aa, so their frequency is q².", "Find q, then p = 1 − q, then use 2pq for carriers."],
    );
  }
  return tooMany();
}

// Expert+: from a carrier count back to q (q < 0.5), q^2, affected births and a judgement.
function genHWBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const [org, trait] = rng.pick(POPS);
    const k = rng.int(2, 9);
    const N = rng.pick([1000, 2000, 4000]);
    const M = rng.pick([4000, 8000, 20000]);
    const R = rng.pick([50, 100, 200, 500, 1000, 2000]);
    const c = Math.round((N * k * (20 - k)) / 200);
    if (Math.abs(c - (N * k * (20 - k)) / 200) > 1e-6) continue;
    const st = (rd) => {
      const x = c / N;
      const q = rd("q", (1 - Math.sqrt(1 - 2 * x)) / 2);
      const f2 = rd("f2", q * q);
      const aff = rd("aff", f2 * M);
      return { q, f2, aff };
    };
    if (!stableOk(st, { q: 2, f2: 4, aff: 0 })) continue;
    const r = st((a, v) => v);
    if (r.f2 * R > 0.7 && r.f2 * R < 1.4) continue;
    const common = r.f2 > 1 / R;
    const parts = [
      numPart("q", "Allele frequency", "Frequency q of the recessive allele", r.q, 2, "Carriers have frequency 2pq = 2q(1 − q). Divide the carrier count by N, then solve the quadratic for q, taking the root below 0.5."),
      numPart("f2", "Affected frequency", "Frequency q² of affected animals (a decimal)", r.f2, 4, "Affected animals are aa, with frequency q²."),
      numPart("aff", "Affected births", `Expected number of affected animals among ${M} births`, r.aff, 0, "Multiply q² by the number of births."),
      yesNo("common", "More common?", `Is the trait more common than 1 in ${R}?`, common, "Compare q² with 1 ÷ the stated number."),
    ];
    const ex = [
      `**Allele frequency:** 2pq = ${c} ÷ ${N} = ${fmt(c / N, 4)}, so 2q(1 − q) = ${fmt(c / N, 4)}. Then q = (1 − √(1 − 2 × ${fmt(c / N, 4)})) ÷ 2 = **${fixed(r.q, 2)}**.`,
      `**Affected frequency:** ${fixed(r.q, 2)}² = **${fixed(r.f2, 4)}**.`,
      `**Affected births:** ${fixed(r.f2, 4)} × ${M} = **${fixed(r.aff, 0)}**.`,
      `**Comparison:** 1 in ${R} is ${fmt(1 / R, 5)}. ${fixed(r.f2, 4)} is ${common ? "larger" : "smaller"}, so **${common ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A survey of **${N}** ${org} finds **${c}** carriers of a recessive allele a that gives ${trait} (genotype Aa). Assume Hardy–Weinberg equilibrium: p + q = 1 and p² + 2pq + q² = 1. The recessive allele is the rarer one (q below 0.5). A later breeding programme expects **${M}** births.`,
      parts, ex, "hw-back", { N, c, M, R }, [["_n", N], ["_carriers", c], ["_births", M], ["_r", R]],
      ["Work backwards: the carrier frequency is 2pq, which gives a quadratic in q.", "Once you have q, everything else is a frequency times a count."],
    );
  }
  return tooMany();
}

// ---------- field-ecology ----------

const PREY = [["ground beetles", 20], ["field voles", 400], ["snails", 50], ["grasshoppers", 30], ["mice", 300]];
const PRED = ["barn owls", "foxes", "stoats", "kestrels"];

function lincoln(rng) {
  const R = rng.pick([4, 5, 6, 8, 10]);
  const a = rng.int(2, 9);
  const M = R * a;
  const C = rng.int(R * 2, R * 6);
  return { M, C, R, N: a * C };
}

// Capture-recapture -> density -> energy to the next level -> predators supported
function genLincoln(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const [sp, e] = rng.pick(PREY);
    const { M, C, R, N } = lincoln(rng);
    const A = rng.pick([0.5, 1, 2, 2.5, 4, 5, 8, 10]);
    const P = rng.pick([10, 10, 15, 20]);
    const need = rng.pick([500, 800, 1000, 1500, 2000]);
    const n = TIER_PARTS[tier];
    const st = (rd) => {
      const pop = rd("pop", (M * C) / R);
      const dens = rd("dens", pop / A);
      const en = rd("en", (pop * e * P) / 100);
      const pr = rd("pr", en / need);
      return { pop, dens, en, pr };
    };
    const dps = { pop: 0, dens: 1, en: 0, pr: 1 };
    const order = ["pop", "dens", "en", "pr"].slice(0, n);
    if (!stableOk(st, Object.fromEntries(order.map((x) => [x, dps[x]])))) continue;
    const r = st((a, v) => v);
    const spec = {
      pop: numPart("pop", "Population", `Estimated population of ${sp}`, r.pop, 0, "Lincoln–Petersen: population = marked × second catch ÷ number recaptured."),
      dens: numPart("dens", "Density", "Population density (animals per hectare)", r.dens, 1, "Density = population ÷ area."),
      en: numPart("en", "Energy to next level", `Energy available to the next trophic level (kJ)`, r.en, 0, "Total energy held = population × energy per animal. Then take the stated percentage of it."),
      pr: numPart("pr", "Predators supported", `Number of predators this energy could support for a year`, r.pr, 1, "Divide the energy available by the energy one predator needs per year."),
    };
    const txt = {
      pop: `**Population:** ${M} × ${C} ÷ ${R} = **${fixed(r.pop, 0)}**.`,
      dens: `**Density:** ${fixed(r.pop, 0)} ÷ ${A} = **${fixed(r.dens, 1)} per hectare**.`,
      en: `**Energy to next level:** ${fixed(r.pop, 0)} × ${e} kJ = ${fmt(r.pop * e, 0)} kJ held, and ${P}% of that is **${fixed(r.en, 0)} kJ**.`,
      pr: `**Predators supported:** ${fixed(r.en, 0)} ÷ ${need} = **${fixed(r.pr, 1)}**.`,
    };
    return finish(
      `Researchers mark **${M}** ${sp} in a **${A} ha** meadow and release them. A later sample of **${C}** ${sp} contains **${R}** marked animals. Use the Lincoln–Petersen estimate (population = marked × second catch ÷ recaptured).${n >= 3 ? ` Each animal holds about **${e} kJ** of energy, and **${P}%** of the energy at one trophic level passes to the next.` : ""}${n === 4 ? ` A predator needs **${need} kJ** per year.` : ""}`,
      order.map((x) => spec[x]), order.map((x) => txt[x]).join("\n\n"), "eco-linc", { M, C, R, A, e, P, need, order },
      [["_marked", M], ["_caught", C], ["_recap", R], ["_area", A]].concat(n >= 3 ? [["_energy", e], ["_pct", P]] : []).concat(n === 4 ? [["_need", need]] : []),
      ["Estimate the population first; every other answer builds on it.", "A percentage of energy passes on, so multiply by pct ÷ 100."],
    );
  }
  return tooMany();
}

// Expert+: from a predator population back to producer energy and the area needed.
function genChain(rng) {
  for (let i = 0; i < TRY; i++) {
    const sp = rng.pick(PRED);
    const { M, C, R, N } = lincoln(rng);
    const need = rng.pick([200, 400, 500, 800, 1000]);
    const P = rng.pick([10, 10, 20, 25]);
    const L = rng.pick([2, 3]);
    const prod = rng.pick([5000, 8000, 10000, 12500]);
    const f = (100 / P) ** L;
    const st = (rd) => {
      const pop = rd("pop", (M * C) / R);
      const mj = rd("mj", (pop * need * f) / 1000);
      const ha = rd("ha", (mj * 1000) / prod / 10000);
      return { pop, mj, ha };
    };
    if (!stableOk(st, { pop: 0, mj: 1, ha: 1 })) continue;
    const r = st((a, v) => v);
    if (r.ha < 0.5 || r.ha > 300) continue;
    const mul = rng.pick([0.6, 0.8, 1.25, 1.5]);
    const res = roundTo(r.ha * mul, 1);
    if (Math.abs(res / r.ha - 1) < 0.1) continue;
    const enough = res >= r.ha;
    const parts = [
      numPart("pop", "Predators", `Estimated number of ${sp}`, r.pop, 0, "Lincoln–Petersen: population = marked × second catch ÷ number recaptured."),
      numPart("mj", "Producer energy", "Energy the grass must capture each year (MJ)", r.mj, 1, "Each transfer passes on only the stated percentage, so divide by pct ÷ 100 once per transfer, working back from the predators' needs. Convert kJ to MJ."),
      numPart("ha", "Area needed", "Area of grassland needed (hectares)", r.ha, 1, "Area (m²) = energy needed ÷ energy captured per m² per year. 1 ha = 10 000 m²."),
      yesNo("enough", "Reserve enough?", `The reserve has ${res} ha of grassland. Is that enough?`, enough, "Compare the area needed with the reserve."),
    ];
    const ex = [
      `**Predators:** ${M} × ${C} ÷ ${R} = **${fixed(r.pop, 0)}**.`,
      `**Producer energy:** the predators need ${fixed(r.pop, 0)} × ${need} = ${fmt(r.pop * need, 0)} kJ a year. With ${P}% passed on at each of ${L} transfers, divide by ${fmt(P / 100, 2)}^${L}: ${fmt(r.pop * need * f, 0)} kJ = **${fixed(r.mj, 1)} MJ**.`,
      `**Area needed:** ${fixed(r.mj, 1)} × 1000 ÷ ${prod} = ${fmt((r.mj * 1000) / prod, 1)} m², and ÷ 10 000 = **${fixed(r.ha, 1)} ha**.`,
      `**Reserve:** ${res} ha is ${enough ? "at least" : "less than"} ${fixed(r.ha, 1)} ha, so **${enough ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `Researchers mark **${M}** ${sp} and release them. A later sample of **${C}** includes **${R}** marked animals (Lincoln–Petersen: population = marked × second catch ÷ recaptured). Each predator needs **${need} kJ** per year. The food chain has **${L}** energy transfers from the grass to the ${sp}, and **${P}%** of the energy passes on at each transfer. Grassland captures **${prod} kJ per m²** per year.`,
      parts, ex, "eco-chain", { M, C, R, need, P, L, prod, res }, [["_marked", M], ["_caught", C], ["_recap", R], ["_need", need], ["_pct", P], ["_land", prod], ["_reserve", res]],
      ["Work backwards up the chain: each step down needs more energy, not less.", "Convert units at the end: kJ to MJ, m² to hectares."],
    );
  }
  return tooMany();
}

// ---------- growth-diversity ----------

const TD = [1, 2, 2.5, 3, 4];

// Culture growth: doublings -> population -> (hard) time to a target -> (expert) reached within W?
function genCulture(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const n = TIER_PARTS[tier];
    const Td = rng.pick(TD);
    const g = tier === "medium" ? rng.int(2, 6) : rng.int(4, 16) / 2;
    const t = Td * g;
    const N0 = rng.pick([100, 200, 500, 1000, 2500]);
    const Tg = rng.pick([20000, 50000, 100000, 1000000, 5000000]);
    const st = (rd) => {
      const gg = rd("g", t / Td);
      const pop = rd("pop", N0 * 2 ** gg);
      const ts = rd("ts", (Td * Math.log(Tg / N0)) / Math.LN2);
      return { g: gg, pop, ts };
    };
    const dps = { g: 1, pop: 0, ts: 1 };
    const order = ["g", "pop", "ts"].slice(0, Math.min(n, 3));
    if (!stableOk(st, Object.fromEntries(order.map((x) => [x, dps[x]])))) continue;
    const r = st((a, v) => v);
    if (n >= 3 && Tg / N0 < 2 ** (g + 1)) continue;
    let W = 0, ok = false;
    if (n === 4) {
      W = Math.round(r.ts + rng.pick([-1, 1]) * rng.int(2, 6));
      if (W < 1 || Math.abs(W - r.ts) < 1) continue;
      ok = W >= r.ts;
    }
    const all = [
      numPart("g", "Doublings", `Number of doublings in ${fmt(t, 2)} hours`, r.g, 1, "Doublings = time ÷ doubling time."),
      numPart("pop", "Population", "Number of cells after that time", r.pop, 0, "Population = starting number × 2^(number of doublings)."),
      numPart("ts", "Time to target", `Time from the start until the culture first reaches ${Tg.toLocaleString("en-US")} cells (hours)`, r.ts, 1, "Solve N₀ × 2^g = target. Take logs: g = log₂(target ÷ N₀), or ln(target ÷ N₀) ÷ ln 2. Then multiply by the doubling time."),
      yesNo("reach", "Within window?", `Does the culture reach ${Tg.toLocaleString("en-US")} cells within ${W} hours of the start?`, ok, "Compare your time to the target with the window."),
    ];
    const ex = [
      `**Doublings:** ${fmt(t, 2)} ÷ ${Td} = **${fixed(r.g, 1)}**.`,
      `**Population:** ${N0} × 2^${fixed(r.g, 1)} = **${fixed(r.pop, 0)}**.`,
      `**Time to target:** g = ln(${Tg} ÷ ${N0}) ÷ ln 2 = ${fmt(Math.log(Tg / N0) / Math.LN2, 3)} doublings, × ${Td} h = **${fixed(r.ts, 1)} h**.`,
      `**Window:** ${fixed(r.ts, 1)} h is ${ok ? "within" : "more than"} ${W} h, so **${ok ? "Yes" : "No"}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `A bacterial culture starts with **${N0}** cells and its doubling time is **${Td} hours**. It grows without limit during the experiment. You take a reading at **${fmt(t, 2)} hours**.${n >= 3 ? ` A sample is needed once the culture reaches **${Tg.toLocaleString("en-US")}** cells.` : ""}`,
      all.slice(0, n), ex, "gd-culture", { N0, Td, t, Tg, W, n }, [["_start", N0], ["_double", Td], ["_time", t]].concat(n >= 3 ? [["_target", Tg]] : []),
      ["Count how many doublings fit in the time first.", "Each doubling multiplies the number of cells by 2."],
    );
  }
  return tooMany();
}

// Microscope: actual size -> cells across the field -> image size of a small cell
function genMicro(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const n = TIER_PARTS[tier];
    const s = rng.pick([5, 8, 10, 20, 25, 40]);
    const mag = rng.pick([40, 100, 400, 1000]);
    const D = rng.pick([0.2, 0.4, 0.5, 1, 1.5, 2]);
    const b = rng.pick([1, 2, 2.5, 4]);
    const img = (s * mag) / 1000;
    const st = (rd) => ({ size: rd("size", (img * 1000) / mag), across: rd("across", (D * 1000) / s), bimg: rd("bimg", (b * mag) / 1000) });
    const dps = { size: 0, across: 0, bimg: 3 };
    const order = ["size", "across", "bimg"].slice(0, n);
    if (!stableOk(st, Object.fromEntries(order.map((x) => [x, dps[x]])))) continue;
    const r = st((a, v) => v);
    const all = [
      numPart("size", "Actual size", "Actual length of the cell (µm)", r.size, 0, "Actual size = image size ÷ magnification. Convert mm to µm (× 1000)."),
      numPart("across", "Cells across", "Number of these cells that fit in a row across the field of view", r.across, 0, "Convert the field of view to µm, then divide by the cell length."),
      numPart("bimg", "Image size", `Image length of a ${b} µm bacterium at the same magnification (mm)`, r.bimg, 3, "Image size = actual size × magnification. Convert µm to mm (÷ 1000)."),
    ].slice(0, n);
    const ex = [
      `**Actual size:** ${fmt(img, 3)} mm × 1000 ÷ ${mag} = **${fixed(r.size, 0)} µm**.`,
      `**Cells across:** ${D} mm = ${fmt(D * 1000, 0)} µm, and ÷ ${s} = **${fixed(r.across, 0)}**.`,
      `**Image size:** ${b} × ${mag} = ${fmt(b * mag, 1)} µm = **${fixed(r.bimg, 3)} mm**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `Under a microscope at **×${mag}**, an animal cell measures **${fmt(img, 3)} mm** long in the image. The real field of view is **${D} mm** across. Use 1 mm = 1000 µm and magnification = image size ÷ actual size.`,
      all, ex, "gd-micro", { s, mag, D, b, img, n }, [["_image", img], ["_mag", mag], ["_field", D]].concat(n === 3 ? [["_bact", b]] : []),
      ["Use magnification = image size ÷ actual size, and keep mm and µm straight.", "A row of cells across the field is the field width divided by one cell's length."],
    );
  }
  return tooMany();
}

const TREES = ["oak", "beech", "birch", "hazel"];
const simp = (c) => {
  const N = c.reduce((a, b) => a + b, 0);
  const S = c.reduce((a, b) => a + b * (b - 1), 0);
  return { N, S, D: 1 - S / (N * (N - 1)) };
};

// Simpson's index: totals -> sum n(n-1) -> D -> judgement (expert: vs another site; expert+: missing count, vs a threshold)
function genSimpson(rng, back) {
  for (let i = 0; i < TRY; i++) {
    const c = [0, 0, 0, 0].map(() => rng.int(2, 25));
    const { N, S, D } = simp(c);
    if (nearHalf(D, 3) || N < 20) continue;
    const gap = rng.pick([-1, 1]) * rng.int(4, 15) / 100;
    const other = roundTo(D + gap, 2);
    const th = roundTo(D + gap, 1);
    const cmp = back ? th : other;
    if (Math.abs(cmp - D) < 0.04) continue;
    const ok = D > cmp;
    const names = c.map((x, k) => `${TREES[k]} ${x}`);
    const given = back ? names.slice(0, 3).join(", ") : names.join(", ");
    const parts = [];
    if (back) parts.push(numPart("n4", "Missing count", `Number of ${TREES[3]} trees`, c[3], 0, "The four counts add up to the total, so subtract the three known counts from it."));
    else parts.push(numPart("tot", "Total", "Total number of trees N", N, 0, "Add the four counts."));
    parts.push(
      numPart("s", "Sum n(n−1)", "The sum of n(n − 1) over the four species", S, 0, "For each species multiply its count by one less than its count, then add the four results."),
      numPart("d", "Simpson's index", "Simpson's index D", D, 3, "D = 1 − Σ n(n − 1) ÷ (N(N − 1)), using the total N and your sum."),
      yesNo("ok", back ? "Meets threshold?" : "More diverse?", back ? `Sites count as high-diversity if D is above ${th}. Is this site high-diversity?` : `Site B has D = ${other}. Is this site (Site A) more diverse than Site B?`, ok, back ? "Compare your index with the threshold." : "A higher index means higher diversity. Compare the two values."),
    );
    const ex = [
      back ? `**Missing count:** ${N} − (${c[0]} + ${c[1]} + ${c[2]}) = **${c[3]}**.` : `**Total:** ${c.join(" + ")} = **${N}**.`,
      `**Sum:** ${c.map((x) => `${x}×${x - 1}`).join(" + ")} = **${S}**.`,
      `**Simpson's index:** D = 1 − ${S} ÷ (${N} × ${N - 1}) = **${fixed(D, 3)}**.`,
      back ? `**Threshold:** ${fixed(D, 3)} is ${ok ? "above" : "not above"} ${th}, so **${ok ? "Yes" : "No"}**.` : `**Comparison:** ${fixed(D, 3)} is ${ok ? "higher" : "lower"} than ${other}, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A woodland plot (Site A) is surveyed. Counts: ${given}.${back ? ` The plot holds **${N}** trees in total.` : ""} Simpson's index of diversity is D = 1 − Σ n(n − 1) ÷ (N(N − 1)), where n is the count of one species and N is the total.`,
      parts, ex, "gd-simp", { c, N, back, cmp }, [["_n1", c[0]], ["_n2", c[1]], ["_n3", c[2]]].concat(back ? [["_total", N], ["_limit", th]] : [["_n4", c[3]], ["_siteb", other]]),
      ["Work out n(n − 1) for each species separately.", "Divide the sum by N(N − 1), then subtract from 1."],
    );
  }
  return tooMany();
}

// Expert+: doubling time from two readings, then population, time to a target and a window judgement.
function genGrowthBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const Td = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
    const g1 = rng.int(2, 6);
    const N0 = rng.pick([100, 200, 500, 1000]);
    const N1 = N0 * 2 ** g1;
    const t1 = Td * g1;
    const g2 = rng.int(2 * g1 + 2, 30) / 2;
    const T2 = Td * g2;
    const Tg = rng.pick([50000, 100000, 1000000, 5000000, 20000000]);
    const st = (rd) => {
      const T = rd("td", (t1 * Math.LN2) / Math.log(N1 / N0));
      const p2 = rd("p2", N0 * 2 ** (T2 / T));
      const ts = rd("ts", (T * Math.log(Tg / N0)) / Math.LN2);
      return { td: T, p2, ts };
    };
    if (!stableOk(st, { td: 1, p2: 0, ts: 1 })) continue;
    const r = st((a, v) => v);
    if (Tg <= N0 * 2 ** (g2 + 1)) continue;
    const W = Math.round(r.ts + rng.pick([-1, 1]) * rng.int(2, 6));
    if (W < 1 || Math.abs(W - r.ts) < 1) continue;
    const ok = W >= r.ts;
    const parts = [
      numPart("td", "Doubling time", "Doubling time of the culture (hours)", r.td, 1, "From N₁ = N₀ × 2^g, the number of doublings is g = log₂(N₁ ÷ N₀). Doubling time = time ÷ g."),
      numPart("p2", "Later count", `Number of cells at ${fmt(T2, 2)} hours`, r.p2, 0, "Doublings = time ÷ doubling time. Then N₀ × 2^doublings."),
      numPart("ts", "Time to target", `Time from the start until the culture first reaches ${Tg.toLocaleString("en-US")} cells (hours)`, r.ts, 1, "Take logs: doublings needed = log₂(target ÷ N₀), then multiply by the doubling time."),
      yesNo("reach", "Within window?", `Does the culture reach ${Tg.toLocaleString("en-US")} cells within ${W} hours of the start?`, ok, "Compare your time to the target with the window."),
    ];
    const ex = [
      `**Doubling time:** g = log₂(${N1} ÷ ${N0}) = ${fmt(Math.log(N1 / N0) / Math.LN2, 3)} doublings in ${fmt(t1, 2)} h, so **${fixed(r.td, 1)} h**.`,
      `**Later count:** ${fmt(T2, 2)} ÷ ${fixed(r.td, 1)} = ${fmt(T2 / r.td, 2)} doublings, so ${N0} × 2^${fmt(T2 / r.td, 2)} = **${fixed(r.p2, 0)}**.`,
      `**Time to target:** log₂(${Tg} ÷ ${N0}) = ${fmt(Math.log(Tg / N0) / Math.LN2, 3)} doublings, × ${fixed(r.td, 1)} h = **${fixed(r.ts, 1)} h**.`,
      `**Window:** ${fixed(r.ts, 1)} h is ${ok ? "within" : "more than"} ${W} h, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A bacterial culture starts with **${N0}** cells. After **${fmt(t1, 2)} hours** there are **${N1}** cells. It keeps doubling at the same rate. A sample is needed once the culture reaches **${Tg.toLocaleString("en-US")}** cells, and the laboratory allows **${W} hours** from the start.`,
      parts, ex, "gd-back", { N0, N1, t1, T2, Tg, W }, [["_start", N0], ["_count", N1], ["_time", t1], ["_later", T2], ["_target", Tg]],
      ["Work backwards: the two counts tell you how many doublings happened.", "Once you have the doubling time, the rest is the same growth formula."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  const coin = rng.next() < 0.5;
  if (subtopic === "cross-counts") return plus ? genCrossFit(rng) : difficulty === "expert" ? genDi(rng) : genMono(rng, difficulty);
  if (subtopic === "hardy-weinberg") return plus ? genHWBack(rng) : genHW(rng, difficulty);
  if (subtopic === "field-ecology") return plus ? genChain(rng) : genLincoln(rng, difficulty);
  if (subtopic === "growth-diversity") {
    if (plus) return coin ? genGrowthBack(rng) : genSimpson(rng, true);
    if (difficulty === "expert") return coin ? genCulture(rng, difficulty) : genSimpson(rng, false);
    return coin ? genCulture(rng, difficulty) : genMicro(rng, difficulty);
  }
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route where one exists. A number
// must be within its rounding tolerance of the true value; a choice must match exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");
const chiSq = (O, E) => O.reduce((s, o, k) => s + (o - E[k]) ** 2 / E[k], 0);
const log2 = (x) => Math.log(x) / Math.log(2);

const ALT = {
  "bi-mono": (p) => {
    // enumerate gamete pairs
    let dom = 0;
    for (const x of ["A", "a"]) for (const y of ["A", "a"]) if (x === "A" || y === "A") dom++;
    const pr = p.dom ? dom / 4 : 1 - dom / 4;
    const E = pr * p.N;
    return { p: pr, e: E, ok: YN(Math.abs(p.obs - E) <= 0.1 * E + 1e-9) };
  },
  "bi-di": (p) => {
    const cells = [];
    for (const a of ["AA", "Aa", "Aa", "aa"]) for (const b of ["BB", "Bb", "Bb", "bb"]) cells.push((a.includes("A") ? 0 : 2) + (b.includes("B") ? 0 : 1));
    const share = [0, 1, 2, 3].map((k) => cells.filter((x) => x === k).length / 16);
    const E = share.map((s) => s * p.N);
    const chi = chiSq(p.O, E);
    return { p: share[p.ti], e: E[p.ti], chi, ok: YN(chi < 7.81) };
  },
  "bi-fit": (p) => {
    const c1 = chiSq([p.k, p.N - p.k], [p.N * 0.25, p.N * 0.75]);
    const c2 = chiSq([p.k, p.N - p.k], [p.N * 0.5, p.N * 0.5]);
    const b = c1 < c2;
    return { chi1: c1, chi2: c2, best: `${b ? "Aa × Aa" : "Aa × aa"} | ${YN(Math.min(c1, c2) < 3.84)}`, next: p.M * (b ? 0.25 : 0.5) };
  },
  hw: (p) => {
    const q = Math.exp(0.5 * Math.log((p.k * p.k) / 400));
    const pp = 1 - q;
    const c = pp * q + q * pp;
    return { q, c, cn: c * p.N };
  },
  "hw-x": (p) => {
    const f2 = p.aff / p.N;
    const q = Math.pow(f2, 0.5);
    const cn = (1 - (1 - q) ** 2 - q * q) * p.N; // 1 - p^2 - q^2 = 2pq
    return { f2, q, cn, al: q * p.N * 2 };
  },
  "hw-back": (p) => {
    const x = p.c / p.N;
    const q = x / (1 + Math.sqrt(1 - 2 * x));
    const f2 = q * q;
    return { q, f2, aff: f2 * p.M, common: YN(f2 > 1 / p.R) };
  },
  "eco-linc": (p) => {
    const pop = p.M * (p.C / p.R);
    const dens = pop / p.A;
    const en = ((pop * p.e) / 100) * p.P;
    return { pop, dens, en, pr: en / p.need };
  },
  "eco-chain": (p) => {
    const pop = p.C / (p.R / p.M);
    let kj = pop * p.need;
    for (let i = 0; i < p.L; i++) kj /= p.P / 100;
    const ha = kj / p.prod / 1e4;
    return { pop, mj: kj / 1000, ha, enough: YN(p.res >= ha) };
  },
  "gd-culture": (p) => {
    const g = p.t / p.Td;
    const ts = p.Td * log2(p.Tg / p.N0);
    return { g, pop: p.N0 * Math.exp(g * Math.LN2), ts, reach: YN(p.W >= ts) };
  },
  "gd-micro": (p) => ({ size: p.s, across: (p.D * 1000) / p.s, bimg: p.b / 1000 * p.mag }),
  "gd-simp": (p) => {
    const N = p.c.reduce((a, b) => a + b, 0);
    let S = 0, pr = 0;
    for (const n of p.c) { S += n * n - n; pr += (n / N) * ((n - 1) / (N - 1)); }
    const D = 1 - pr;
    return { tot: N, n4: p.c[3], s: S, d: D, ok: YN(D > p.cmp) };
  },
  "gd-back": (p) => {
    const g1 = log2(p.N1 / p.N0);
    const T = p.t1 / g1;
    const ts = T * log2(p.Tg / p.N0);
    return { td: T, p2: p.N0 * 2 ** (p.T2 / T), ts, reach: YN(p.W >= ts) };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = Object.fromEntries(Object.entries(alt(p)).map(([k, v]) => [k.toLowerCase(), v])); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      if (p.dps[part.id] === undefined || !near(partNum(answer, part.id), tv, tolOf(p.dps[part.id]))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
