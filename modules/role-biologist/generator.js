// Biologist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   cross-counts     monohybrid / dihybrid crosses -> probability, expected count, chi-square   (Geneticist)
//   hardy-weinberg   q^2 -> q -> carriers -> alleles; backwards from a carrier count           (Geneticist)
//   field-ecology    capture-recapture -> density -> energy to the next level -> area          (Ecologist)
//   growth-diversity doubling time, microscope magnification, Simpson's index                  (Ecologist)
//   dilution-counts  dilution factor, CFU/mL, countable plate, doubling, C1V1 (Microbiologist; parts 2 / 3 / 3 / 4)

// ---------- helpers ----------

import { roundTo, fmtGroup } from "../../js/lib/mathutil.js";
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
    const pTrue = rng.pick([0.25, 0.5, 0.375]); // 0.375: data that neither cross fits well, so "No" occurs
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
    const R = rng.pick([8, 10, 20, 25, 50, 100]); // q² runs from 0.01 to 0.2, so both answers occur
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
    if (tier === "expert" && r.pr < 1) continue; // at least one whole predator, never "0.0 predators"
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
      const mj = rd("mj", (pop * need * f) / 1000); // GJ: need is in MJ
      const ha = rd("ha", (mj * 1e6) / prod / 10000);
      return { pop, mj, ha };
    };
    if (!stableOk(st, { pop: 0, mj: 1, ha: 0 })) continue;
    const r = st((a, v) => v);
    if (r.ha < 20 || r.ha > 300000) continue;
    const mul = rng.pick([0.6, 0.8, 1.25, 1.5]);
    const res = roundTo(r.ha * mul, 0);
    if (Math.abs(res / r.ha - 1) < 0.1) continue;
    const enough = res >= r.ha;
    const parts = [
      numPart("pop", "Predators", `Estimated number of ${sp}`, r.pop, 0, "Lincoln–Petersen: population = marked × second catch ÷ number recaptured."),
      numPart("mj", "Producer energy", "Energy the grass must capture each year (GJ, 1 GJ = 1000 MJ)", r.mj, 1, "Each transfer passes on only the stated percentage, so divide by pct ÷ 100 once per transfer, working back from the predators' needs. Convert MJ to GJ."),
      numPart("ha", "Area needed", "Area of grassland needed (hectares)", r.ha, 0, "Area (m²) = energy needed ÷ energy captured per m² per year. 1 ha = 10 000 m²."),
      yesNo("enough", "Reserve enough?", `The reserve has ${res} ha of grassland. Is that enough?`, enough, "Compare the area needed with the reserve."),
    ];
    const ex = [
      `**Predators:** ${M} × ${C} ÷ ${R} = **${fixed(r.pop, 0)}**.`,
      `**Producer energy:** the predators need ${fixed(r.pop, 0)} × ${need} = ${fmt(r.pop * need, 0)} MJ a year. With ${P}% passed on at each of ${L} transfers, divide by ${fmt(P / 100, 2)}^${L}: ${fmt(r.pop * need * f, 0)} MJ = **${fixed(r.mj, 1)} GJ**.`,
      `**Area needed:** ${fixed(r.mj, 1)} GJ = ${fmt(r.mj * 1e6, 0)} kJ, and ÷ ${prod} = ${fmt((r.mj * 1e6) / prod, 0)} m², and ÷ 10 000 = **${fixed(r.ha, 0)} ha**.`,
      `**Reserve:** ${res} ha is ${enough ? "at least" : "less than"} ${fixed(r.ha, 0)} ha, so **${enough ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `Researchers mark **${M}** ${sp} and release them. A later sample of **${C}** includes **${R}** marked animals (Lincoln–Petersen: population = marked × second catch ÷ recaptured). Each predator needs **${need} MJ** of food energy per year. The food chain has **${L}** energy transfers from the grass to the ${sp}, and **${P}%** of the energy passes on at each transfer. Grassland captures **${prod} kJ per m²** per year.`,
      parts, ex, "eco-chain", { M, C, R, need, P, L, prod, res }, [["_marked", M], ["_caught", C], ["_recap", R], ["_need", need], ["_pct", P], ["_land", prod], ["_reserve", res]],
      ["Work backwards up the chain: each step down needs more energy, not less.", "Mind the units: MJ to GJ, GJ to kJ, m² to hectares."],
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
      numPart("ts", "Time to target", `Time from the start until the culture first reaches ${fmtGroup(Tg, 0, 3)} cells (hours)`, r.ts, 1, "Solve N₀ × 2^g = target. Take logs: g = log₂(target ÷ N₀), or ln(target ÷ N₀) ÷ ln 2. Then multiply by the doubling time."),
      yesNo("reach", "Within window?", `Does the culture reach ${fmtGroup(Tg, 0, 3)} cells within ${W} hours of the start?`, ok, "Compare your time to the target with the window."),
    ];
    const ex = [
      `**Doublings:** ${fmt(t, 2)} ÷ ${Td} = **${fixed(r.g, 1)}**.`,
      `**Population:** ${N0} × 2^${fixed(r.g, 1)} = **${fixed(r.pop, 0)}**.`,
      `**Time to target:** g = ln(${Tg} ÷ ${N0}) ÷ ln 2 = ${fmt(Math.log(Tg / N0) / Math.LN2, 3)} doublings, × ${Td} h = **${fixed(r.ts, 1)} h**.`,
      `**Window:** ${fixed(r.ts, 1)} h is ${ok ? "within" : "more than"} ${W} h, so **${ok ? "Yes" : "No"}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `A bacterial culture starts with **${N0}** cells and its doubling time is **${Td} hours**. It grows without limit during the experiment. You take a reading at **${fmt(t, 2)} hours**.${n >= 3 ? ` A sample is needed once the culture reaches **${fmtGroup(Tg, 0, 3)}** cells.` : ""}`,
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
      numPart("ts", "Time to target", `Time from the start until the culture first reaches ${fmtGroup(Tg, 0, 3)} cells (hours)`, r.ts, 1, "Take logs: doublings needed = log₂(target ÷ N₀), then multiply by the doubling time."),
      yesNo("reach", "Within window?", `Does the culture reach ${fmtGroup(Tg, 0, 3)} cells within ${W} hours of the start?`, ok, "Compare your time to the target with the window."),
    ];
    const ex = [
      `**Doubling time:** g = log₂(${N1} ÷ ${N0}) = ${fmt(Math.log(N1 / N0) / Math.LN2, 3)} doublings in ${fmt(t1, 2)} h, so **${fixed(r.td, 1)} h**.`,
      `**Later count:** ${fmt(T2, 2)} ÷ ${fixed(r.td, 1)} = ${fmt(T2 / r.td, 2)} doublings, so ${N0} × 2^${fmt(T2 / r.td, 2)} = **${fixed(r.p2, 0)}**.`,
      `**Time to target:** log₂(${Tg} ÷ ${N0}) = ${fmt(Math.log(Tg / N0) / Math.LN2, 3)} doublings, × ${fixed(r.td, 1)} h = **${fixed(r.ts, 1)} h**.`,
      `**Window:** ${fixed(r.ts, 1)} h is ${ok ? "within" : "more than"} ${W} h, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A bacterial culture starts with **${N0}** cells. After **${fmt(t1, 2)} hours** there are **${N1}** cells. It keeps doubling at the same rate. A sample is needed once the culture reaches **${fmtGroup(Tg, 0, 3)}** cells, and the laboratory allows **${W} hours** from the start.`,
      parts, ex, "gd-back", { N0, N1, t1, T2, Tg, W }, [["_start", N0], ["_count", N1], ["_time", t1], ["_later", T2], ["_target", Tg]],
      ["Work backwards: the two counts tell you how many doublings happened.", "Once you have the doubling time, the rest is the same growth formula."],
    );
  }
  return tooMany();
}

// ---------- dilution-counts ----------
// Lab-practice maths only (Microbiologist): serial dilution factors, CFU back-calculation, the
// countable plate, growth by doubling and C1V1. Large counts are A × 10ⁿ (n stated, type A).

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
const pow10 = (e) => `10${String(e).split("").map((c) => SUP[c]).join("")}`;
const EXACT = { fuzzyNumber: 0 }; // counts and exact CFU mantissas: no close credit
const intPart = (id, label, ask, val, hint) => ({ ...numPart(id, label, ask, val, 0, hint), ask: `${ask}, as a whole number`, ...EXACT });
const sciPart = (id, label, what, A, m, hint, exact) => {
  const p = numPart(id, label, `${what}, as A × ${pow10(m)} CFU/mL: type A`, A, 2, hint);
  return exact ? { ...p, ...EXACT } : p;
};
const SAMPLES = ["A pond-water sample", "A soil suspension", "A yoghurt starter culture", "A fermentation broth", "A river-water sample", "A sourdough starter", "A compost extract", "A kombucha culture"];
const CULTURES = ["a broth culture of a soil bacterium", "a yeast culture from a brewing trial", "a yoghurt starter culture", "a broth culture of a harmless laboratory strain", "a sourdough yeast culture"];
const REAGENTS = ["glucose", "sodium chloride", "yeast extract", "lactose", "crystal violet stain", "sucrose"];
const PLATE_V = [0.1, 0.1, 0.2, 0.25, 0.5, 1];
const RANGES = [[30, 300], [25, 250]];
const CFU_RULE = "CFU per mL of the sample = colonies ÷ (volume plated in mL × dilution), where a tube's dilution is 1 ÷ its total dilution factor.";
const GROW_RULE = "Growth follows N = N₀ × 2^(t/g), where t is the time and g the generation time.";
const sciOf = (x) => { const m = Math.floor(Math.log10(x) + 1e-12); return { A: x / 10 ** m, m }; };
const exact2 = (A) => Math.abs(A * 100 - Math.round(A * 100)) < 1e-6 && A >= 1 && A < 10;
const tubeName = (t) => `Tube ${t}`;
const countText = (c) => (c >= 1000 ? "too many to count" : String(c));

function series(rng) {
  const e1 = rng.pick([1, 2]);
  const first = e1 === 1 ? rng.pick([[1, 9], [0.5, 4.5]]) : rng.pick([[0.1, 9.9], [1, 99]]);
  const later = rng.pick([[1, 9], [0.5, 4.5]]);
  return { e1, first, later };
}
const seriesText = (s, T) => `It is diluted in a series of ${T} tubes. Tube 1: **${s.first[0]} mL** of the sample into **${s.first[1]} mL** of sterile saline. Each later tube: **${s.later[0]} mL** from the previous tube into **${s.later[1]} mL** of saline, mixed well.`;
const dfText = (s, k, n) => `tube 1 is ${s.first[0]} mL in ${fmt(s.first[0] + s.first[1], 2)} mL, a factor of ${pow10(s.e1)}, and each later tube is ${s.later[0]} mL in ${fmt(s.later[0] + s.later[1], 2)} mL, a factor of 10. Tube ${k}: ${pow10(s.e1)} × ${pow10(k - 1)} = ${pow10(n)}`;

// Four plates from consecutive tubes j..j+3, exactly one inside [lo, hi] (others well clear).
function drawPlates(rng, s, T, lo, hi, mult) {
  const j = rng.int(2, T - 3);
  const at = rng.int(0, 3);
  const C = rng.int(lo + 3, hi - 10);
  const counts = [0, 1, 2, 3].map((idx) => (idx === at ? C : Math.round((C * 10 ** (at - idx) * rng.int(85, 115)) / 100)));
  if (counts.some((c, idx) => idx !== at && c >= lo - 2 && c <= hi + 10)) return null;
  const k = j + at;
  const n = s.e1 + k - 1;
  const x = C * mult;
  const { A, m } = sciOf(x);
  if (!exact2(A)) return null;
  return { j, at, k, C, counts, n, x, A, m: m + n };
}
const plateList = (j, counts) => counts.map((c, idx) => `tube ${j + idx}: **${countText(c)}**`).join(", ");
const plateGiven = (j, counts) => counts.map((c, idx) => [`_t${j + idx}`, c]).filter(([, c]) => c < 1000);
const PLATE_HINT = "Pick the only plate whose count lies inside the stated range.";
const DF_HINT = "Each step's factor is (volume moved + diluent) ÷ volume moved. Multiply the factors of every tube up to this one, then count the powers of ten.";
const CFU_HINT = "Divide the colonies by the volume plated, then multiply by that tube's total dilution factor. Write the result with one digit before the decimal point.";

// Medium: dilution factor -> CFU/mL. Hard: countable plate -> its dilution factor -> CFU/mL.
function genPlate(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const smp = rng.pick(SAMPLES);
    const s = series(rng);
    const T = rng.int(6, 8);
    const V = rng.pick(PLATE_V);
    const mult = Math.round(1 / V);
    const [lo, hi] = rng.pick(RANGES);
    const hard = tier === "hard";
    let d;
    if (hard) {
      d = drawPlates(rng, s, T, lo, hi, mult);
      if (!d) continue;
    } else {
      const k = rng.int(3, T);
      const C = rng.int(lo, hi);
      const n = s.e1 + k - 1;
      const x = C * mult;
      const { A, m } = sciOf(x);
      if (!exact2(A)) continue;
      d = { k, C, n, x, A, m: m + n, counts: null, j: 0 };
    }
    if (d.m > 10) continue; // keep counts lab-realistic (at most about 10¹⁰ CFU/mL)
    const { k, C, n, x, A, m, counts, j } = d;
    const parts = [
      intPart("df", "Dilution factor", `Total dilution factor of tube ${k}, written as 10ⁿ: type n`, n, DF_HINT),
      sciPart("cfu", "CFU per mL", "CFU per mL in the original sample", A, m, CFU_HINT, true),
    ];
    const ex = [
      `**Dilution factor:** ${dfText(s, k, n)}, so n = **${n}**.`,
      `**CFU per mL:** ${C} ÷ (${V} × 1/${pow10(n)}) = ${x} × ${pow10(n)} = **${fixed(A, 2)} × ${pow10(m)}** CFU/mL.`,
    ];
    if (hard) {
      parts.unshift({ id: "plate", label: "Countable plate", ask: "Which tube's plate should be counted?", answerType: "choice", answer: tubeName(k), choices: [0, 1, 2, 3].map((t) => tubeName(j + t)), hint: PLATE_HINT });
      ex.unshift(`**Countable plate:** only tube ${k}'s plate (${C} colonies) lies within ${lo} to ${hi}, so **${tubeName(k)}**.`);
    }
    const prompt = hard
      ? `${smp} is tested for its microbial count. ${seriesText(s, T)} You spread **${V} mL** from each of tubes ${j} to ${j + 3} on agar plates. After incubation the colony counts are ${plateList(j, counts)}. Rule: only a plate with ${lo} to ${hi} colonies (inclusive) is countable. ${CFU_RULE}`
      : `${smp} is tested for its microbial count. ${seriesText(s, T)} You spread **${V} mL** from tube ${k} on an agar plate, and after incubation it grows **${C}** colonies. ${CFU_RULE}`;
    return finish(
      prompt, parts, ex.join("\n\n"), "dc-plate", { first: s.first, later: s.later, k, C, V, m, counts, j, lo, hi },
      [["_vol", V]].concat(hard ? plateGiven(j, counts) : [["_count", C]]),
      ["Work out each tube's total dilution factor first: the step factors multiply.", "CFU per mL scales the colony count back up by the volume plated and the dilution."],
    );
  }
  return tooMany();
}

// Medium: C1V1 stock volume -> concentration after a 1-in-10 series. Hard adds the tubes filled.
function genStock(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const rg = rng.pick(REAGENTS);
    const C1 = rng.pick([10, 20, 25, 40, 50, 80, 100]);
    const C2 = rng.pick([0.5, 1, 1.5, 2, 2.5, 4, 5]);
    const V2 = rng.pick([50, 100, 150, 200, 250, 500]);
    const s = rng.int(2, 4);
    const u = rng.pick([5, 8, 12, 15, 20]);
    const hard = tier === "hard";
    if (C2 * 4 > C1) continue;
    const v1 = (C2 * V2) / C1;
    const conc = (C2 * 1000) / 10 ** s;
    const tubes = Math.floor((V2 - 1) / u);
    if (v1 < 0.5 || nearHalf(v1, 1) || nearHalf(conc, 2) || conc < 0.05) continue;
    const parts = [
      numPart("v1", "Stock volume", "Volume of stock needed (mL)", v1, 1, "Use C₁V₁ = C₂V₂ and rearrange for the stock volume V₁."),
      numPart("conc", "Last tube", "Concentration in the last tube of the series (µg/mL)", conc, 2, "Each 1-in-10 step divides the concentration by 10. Convert mg to µg (× 1000)."),
    ];
    const ex = [
      `**Stock volume:** V₁ = ${C2} × ${V2} ÷ ${C1} = **${fixed(v1, 1)} mL**, topped up with water to ${V2} mL.`,
      `**Last tube:** ${C2} mg/mL = ${fmt(C2 * 1000, 2)} µg/mL, divided by 10 ${s} times (÷ ${pow10(s)}) = **${fixed(conc, 2)} µg/mL**.`,
    ];
    if (hard) {
      parts.push(intPart("tubes", "Full tubes", `Number of full ${u} mL tubes the rest fills (round down)`, tubes, "Take away the 1 mL used for the series, divide by the tube volume and keep only full tubes."));
      ex.push(`**Full tubes:** (${V2} − 1) ÷ ${u} = ${fmt((V2 - 1) / u, 3)}, so **${tubes}** full tubes.`);
    }
    return finish(
      `You need **${V2} mL** of ${rg} solution at **${C2} mg/mL** for a growth medium, made from a **${C1} mg/mL** stock topped up with sterile water. Use C₁V₁ = C₂V₂. From the working solution you then make a series of **${s}** tubes: 1 mL of it into 9 mL of water, then 1 mL of each tube into 9 mL of water in the next. 1 mg = 1000 µg.${hard ? ` The rest of the working solution is shared into **${u} mL** tubes.` : ""}`,
      parts, ex.join("\n\n"), "dc-stock", { C1, C2, V2, s, u },
      [["_c1", C1], ["_c2", C2], ["_v2", V2], ["_steps", s]].concat(hard ? [["_tube", u]] : []),
      ["The stock is diluted once to make the working solution; the series dilutes it again.", "Keep the units straight: mL for volumes, mg/mL or µg/mL for concentrations."],
    );
  }
  return tooMany();
}

// Expert: countable plate -> CFU/mL -> the count a set time later, by doubling.
function genPlateGrow(rng) {
  for (let i = 0; i < TRY; i++) {
    const smp = rng.pick(CULTURES);
    const s = series(rng);
    const T = rng.int(6, 8);
    const V = rng.pick(PLATE_V);
    const mult = Math.round(1 / V);
    const [lo, hi] = rng.pick(RANGES);
    const d = drawPlates(rng, s, T, lo, hi, mult);
    if (!d) continue;
    const g = rng.pick([20, 25, 30, 40, 45, 60]);
    const t = rng.pick([60, 90, 120, 150, 180, 240, 300]);
    const { k, C, n, x, A, m, counts, j } = d;
    const L = x * 10 ** n * 2 ** (t / g);
    const { A: A2, m: m2 } = sciOf(L);
    if (nearHalf(A2, 2) || roundTo(A2, 2) >= 10 || t / g < 2 || m2 > 10) continue;
    const parts = [
      { id: "plate", label: "Countable plate", ask: "Which tube's plate should be counted?", answerType: "choice", answer: tubeName(k), choices: [0, 1, 2, 3].map((q) => tubeName(j + q)), hint: PLATE_HINT },
      sciPart("cfu", "CFU per mL", "CFU per mL in the culture at sampling", A, m, CFU_HINT, true),
      sciPart("later", "Later count", `CFU per mL in the culture ${t} minutes after sampling`, A2, m2, "Generations = time ÷ generation time. Multiply the count by 2 raised to that number."),
    ];
    const ex = [
      `**Countable plate:** only tube ${k}'s plate (${C} colonies) lies within ${lo} to ${hi}, so **${tubeName(k)}**.`,
      `**CFU per mL:** ${dfText(s, k, n)}. ${C} ÷ (${V} × 1/${pow10(n)}) = **${fixed(A, 2)} × ${pow10(m)}** CFU/mL.`,
      `**Later count:** ${t} ÷ ${g} = ${fmt(t / g, 3)} generations, so ${fixed(A, 2)} × ${pow10(m)} × 2^${fmt(t / g, 3)} = **${fixed(A2, 2)} × ${pow10(m2)}** CFU/mL.`,
    ].join("\n\n");
    return finish(
      `You sample ${smp}. ${seriesText(s, T)} You spread **${V} mL** from each of tubes ${j} to ${j + 3} on agar plates. After incubation the colony counts are ${plateList(j, counts)}. Rule: only a plate with ${lo} to ${hi} colonies (inclusive) is countable. ${CFU_RULE} The culture keeps growing with a generation time of **${g} minutes**. ${GROW_RULE}`,
      parts, ex, "dc-grow", { first: s.first, later: s.later, k, C, V, m, counts, j, lo, hi, g, t, m2 },
      [["_vol", V]].concat(plateGiven(j, counts), [["_gen", g], ["_time", t]]),
      ["Find the countable plate first, then scale its count back to the culture.", "Growth multiplies the count by 2 once per generation."],
    );
  }
  return tooMany();
}

// Expert (3 parts) / Expert+ (4): two plate counts -> CFU/mL at each time -> generation time
// (working backwards with logs) -> Expert+: is the target reached by the planned harvest?
function genGenTime(rng, plus) {
  for (let i = 0; i < TRY; i++) {
    const smp = rng.pick(CULTURES);
    const s = series(rng);
    const T = 8;
    const V = rng.pick(PLATE_V);
    const mult = Math.round(1 / V);
    const [lo, hi] = rng.pick(RANGES);
    const a = rng.int(2, 4);
    const C1 = rng.int(lo, hi);
    const g = rng.pick([20, 25, 30, 40, 45, 50, 60]);
    const dbl = rng.int(6, 20) / 2;
    const tm = g * dbl;
    if (!Number.isInteger(tm)) continue; // whole minutes only
    const x1 = C1 * mult;
    const n1 = s.e1 + a - 1;
    const N1 = x1 * 10 ** n1;
    const N2t = N1 * 2 ** dbl;
    let b = 0, C2 = 0;
    for (let tb = a; tb <= T; tb++) {
      const c = Math.round((N2t * V) / 10 ** (s.e1 + tb - 1));
      if (c >= lo + 5 && c <= hi - 10) { b = tb; C2 = c; break; }
    }
    if (!b) continue;
    const n2 = s.e1 + b - 1;
    const x2 = C2 * mult;
    const N2 = x2 * 10 ** n2;
    const S1 = sciOf(x1), S2 = sciOf(x2);
    if (!exact2(S1.A) || !exact2(S2.A)) continue;
    const m1 = S1.m + n1, m2 = S2.m + n2;
    if (m2 > 9) continue; // keep counts lab-realistic (below 10¹⁰ CFU/mL)
    const st = (rd) => {
      const gens = rd("gens", Math.log(N2 / N1) / Math.LN2);
      return { gens, gen: rd("gen", tm / gens) };
    };
    if (!stableOk(st, { gens: 2, gen: 1 })) continue; // generation time is the same from the rounded generations
    const gens = Math.log(N2 / N1) / Math.LN2;
    const gen = tm / gens;
    if (gen < 10 || gen > 120) continue;
    let R = 0, q = 0, W = 0, ok = false, tneed = 0;
    if (plus) {
      R = rng.pick([1, 2, 5]);
      q = m2 + rng.int(1, 2);
      const Tg = R * 10 ** q;
      if (Tg <= N2 * 2 || q > 10) continue;
      tneed = (gen * Math.log(Tg / N1)) / Math.LN2;
      W = Math.round(tneed * (1 + (rng.pick([-1, 1]) * rng.int(8, 25)) / 100));
      if (W <= tm || Math.abs(W - tneed) < 5) continue;
      ok = W >= tneed;
    }
    const parts = [
      sciPart("cfu1", "First count", "CFU per mL at the first sample", S1.A, m1, CFU_HINT, true),
      numPart("gens", "Generations", `Number of generations between the two samples`, gens, 2, "Work out the second sample's CFU per mL the same way, using its own tube. Then solve 2^x = N ÷ N₀ with logs: x = log(N ÷ N₀) ÷ log 2."),
      numPart("gen", "Generation time", "Generation time of the culture (minutes)", gen, 1, "The generation time is the time between the samples shared out over the generations."),
    ];
    const ex = [
      `**First count:** tube ${a} has total dilution ${pow10(n1)}, so ${C1} ÷ (${V} × 1/${pow10(n1)}) = **${fixed(S1.A, 2)} × ${pow10(m1)}** CFU/mL.`,
      `**Generations:** tube ${b} has total dilution ${pow10(n2)}, so the second sample is ${C2} ÷ (${V} × 1/${pow10(n2)}) = ${fixed(S2.A, 2)} × ${pow10(m2)} CFU/mL. The count rose by a factor of ${fmt(N2 / N1, 4)}, and log(${fmt(N2 / N1, 4)}) ÷ log 2 = **${fixed(gens, 2)}** generations.`,
      `**Generation time:** ${tm} ÷ ${fixed(gens, 2)} = **${fixed(gen, 1)} min**.`,
    ];
    if (plus) {
      parts.push(yesNo("reach", "Ready in time?", `Will the culture have reached ${R} × ${pow10(q)} CFU/mL by the planned harvest?`, ok, "Work out how many generations take the first count to the target, then multiply by the generation time and compare with the harvest time."));
      ex.push(`**Ready in time?** log(${R} × ${pow10(q)} ÷ ${fixed(S1.A, 2)} × ${pow10(m1)}) ÷ log 2 × ${fixed(gen, 1)} = ${fmt(tneed, 1)} minutes after the first sample. The harvest is at ${W} minutes, so **${ok ? "Yes" : "No"}**.`);
    }
    const prompt = `You follow ${smp}. ${seriesText(s, T).replace("It is diluted", "Each sample is diluted")} At time 0 you spread **${V} mL** from tube ${a} on an agar plate: after incubation it grows **${C1}** colonies. After **${tm} minutes** you spread **${V} mL** from tube ${b}: **${C2}** colonies. ${CFU_RULE} ${GROW_RULE}${plus ? ` The next step needs at least **${R} × ${pow10(q)} CFU/mL**, and the harvest is planned **${W} minutes** after the first sample, with growth carrying on at the same rate.` : ""}`;
    return finish(
      prompt, parts, ex.join("\n\n"), "dc-gen", { first: s.first, later: s.later, a, b, C1, C2, V, m1, m2, tm, R, q, W },
      [["_vol", V], ["_c1", C1], ["_c2", C2], ["_time", tm]].concat(plus ? [["_target", R * 10 ** q], ["_harvest", W]] : []),
      ["Turn each plate count into CFU per mL first; the tubes are different, so the dilutions are too.", "Logs undo the power of 2: generations = log(ratio) ÷ log 2."],
    );
  }
  return tooMany();
}

// Expert+: plate count -> CFU/mL -> count later by doubling -> which tube to plate then (working
// backwards to the countable range) -> expected colonies on that plate.
function genPlan(rng) {
  for (let i = 0; i < TRY; i++) {
    const smp = rng.pick(CULTURES);
    const s = series(rng);
    const T = 8;
    const V = rng.pick(PLATE_V);
    const mult = Math.round(1 / V);
    const V2 = rng.pick([0.1, 0.2, 0.5, 1]);
    const [lo, hi] = rng.pick(RANGES);
    const a = rng.int(2, 4);
    const C = rng.int(lo, hi);
    const g = rng.pick([20, 25, 30, 40, 45, 60]);
    const t = rng.pick([90, 120, 150, 180, 240, 300, 360]);
    const c0 = rng.int(0, 3);
    const x = C * mult;
    const n = s.e1 + a - 1;
    const S = sciOf(x);
    if (!exact2(S.A) || t / g < 2) continue;
    const m = S.m + n;
    const L = x * 10 ** n * 2 ** (t / g);
    const { A: A2, m: m2 } = sciOf(L);
    if (roundTo(A2, 2) >= 10 || m2 > 10) continue;
    let b = 0;
    for (let tb = 1; tb <= T; tb++) {
      const E = (L * V2) / 10 ** (s.e1 + tb - 1);
      if (E >= lo * 1.05 && E <= hi * 0.95) b = tb;
    }
    if (!b) continue;
    const j = b - c0;
    if (j < 1 || j + 3 > T) continue;
    const nb = s.e1 + b - 1;
    const st = (rd) => {
      const later = rd("later", A2);
      const col = rd("col", (later * 10 ** m2 * V2) / 10 ** nb);
      return { later, col };
    };
    if (!stableOk(st, { later: 2, col: 0 })) continue;
    const E = (L * V2) / 10 ** nb;
    const parts = [
      sciPart("cfu", "CFU per mL now", "CFU per mL in the culture now", S.A, m, CFU_HINT, true),
      sciPart("later", "Later count", `CFU per mL ${t} minutes from now`, A2, m2, "Generations = time ÷ generation time. Multiply the count by 2 raised to that number."),
      { id: "tube", label: "Tube to plate", ask: "Which tube should you plate from then?", answerType: "choice", answer: tubeName(b), choices: [0, 1, 2, 3].map((q) => tubeName(j + q)), hint: "Expected colonies = CFU per mL × volume plated ÷ the tube's total dilution factor. Try each tube until the count falls inside the range." },
      intPart("col", "Expected colonies", "Expected number of colonies on that plate", E, "Use your later count, the volume plated and that tube's total dilution factor."),
    ];
    const ex = [
      `**CFU per mL now:** tube ${a} has total dilution ${pow10(n)}, so ${C} ÷ (${V} × 1/${pow10(n)}) = **${fixed(S.A, 2)} × ${pow10(m)}** CFU/mL.`,
      `**Later count:** ${t} ÷ ${g} = ${fmt(t / g, 3)} generations, so × 2^${fmt(t / g, 3)} = **${fixed(A2, 2)} × ${pow10(m2)}** CFU/mL.`,
      `**Tube to plate:** ${V2} mL holds ${fmt(A2 * V2, 4)} × ${pow10(m2)} CFU. Tube ${b} divides that by ${pow10(nb)}, giving ${fmt(E, 1)}, inside ${lo} to ${hi}; the tubes either side are 10 times too many or too few. So **${tubeName(b)}**.`,
      `**Expected colonies:** ${fixed(A2, 2)} × ${pow10(m2)} × ${V2} ÷ ${pow10(nb)} = **${fixed(E, 0)}**.`,
    ].join("\n\n");
    return finish(
      `You are growing ${smp}. ${seriesText(s, T)} You spread **${V} mL** from tube ${a} on an agar plate, and after incubation it grows **${C}** colonies. ${CFU_RULE} The culture keeps growing with a generation time of **${g} minutes**. ${GROW_RULE} In **${t} minutes** you will dilute it in the same series again and spread **${V2} mL** from one tube. Rule: a plate is countable with ${lo} to ${hi} colonies (inclusive).`,
      parts, ex, "dc-plan", { first: s.first, later: s.later, a, C, V, V2, g, t, m, m2, lo, hi, T },
      [["_count", C], ["_vol", V], ["_gen", g], ["_time", t], ["_vol2", V2]],
      ["Work forwards to the later count, then backwards to the dilution that gives a countable plate.", "Each tube along the series cuts the expected colonies by a factor of 10."],
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
  if (subtopic === "dilution-counts") {
    if (plus) return coin ? genGenTime(rng, true) : genPlan(rng);
    if (difficulty === "expert") return coin ? genGenTime(rng, false) : genPlateGrow(rng);
    return coin ? genPlate(rng, difficulty) : genStock(rng, difficulty);
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
    let kj = pop * p.need * 1000; // need is in MJ per predator per year
    for (let i = 0; i < p.L; i++) kj /= p.P / 100;
    const ha = kj / p.prod / 1e4;
    return { pop, mj: kj / 1e6, ha, enough: YN(p.res >= ha) };
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

// dilution-counts: step factors multiplied tube by tube, CFU = colonies × factor ÷ volume.
const dfOf = (p, k) => {
  let f = (p.first[0] + p.first[1]) / p.first[0];
  for (let t = 2; t <= k; t++) f *= (p.later[0] + p.later[1]) / p.later[0];
  return f;
};
const cfuOf = (p, C, k, V) => (C * dfOf(p, k)) / V;
const onlyPlate = (p) => {
  const hits = (p.counts || []).map((c, i) => (c >= p.lo && c <= p.hi ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? `Tube ${p.j + hits[0]}` : "(none)";
};
Object.assign(ALT, {
  "dc-plate": (p) => ({ df: Math.round(Math.log10(dfOf(p, p.k))), cfu: cfuOf(p, p.C, p.k, p.V) / 10 ** p.m, plate: onlyPlate(p) }),
  "dc-stock": (p) => {
    let left = p.V2 - 1, tubes = 0;
    while (left >= p.u - 1e-9) { left -= p.u; tubes++; }
    return { v1: p.V2 / (p.C1 / p.C2), conc: p.C2 * 1000 * 0.1 ** p.s, tubes };
  },
  "dc-grow": (p) => {
    const N = cfuOf(p, p.C, p.k, p.V);
    return { plate: onlyPlate(p), cfu: N / 10 ** p.m, later: (N * Math.exp((Math.LN2 * p.t) / p.g)) / 10 ** p.m2 };
  },
  "dc-gen": (p) => {
    const N1 = cfuOf(p, p.C1, p.a, p.V), N2 = cfuOf(p, p.C2, p.b, p.V);
    const gens = Math.log10(N2 / N1) / Math.log10(2);
    const gen = p.tm / gens;
    const out = { cfu1: N1 / 10 ** p.m1, gens, gen };
    if (p.R) out.reach = YN(p.W >= gen * log2((p.R * 10 ** p.q) / N1));
    return out;
  },
  "dc-plan": (p) => {
    const L = cfuOf(p, p.C, p.a, p.V) * Math.exp((Math.LN2 * p.t) / p.g);
    let tube = "(none)", col = NaN;
    for (let k = 1; k <= p.T; k++) {
      const E = (L * p.V2) / dfOf(p, k);
      if (E >= p.lo && E <= p.hi) { tube = `Tube ${k}`; col = E; }
    }
    return { cfu: cfuOf(p, p.C, p.a, p.V) / 10 ** p.m, later: L / 10 ** p.m2, tube, col };
  },
});

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
