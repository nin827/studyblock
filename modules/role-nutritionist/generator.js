// Nutritionist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Calculation practice with made-up figures; never advice. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   label-energy     4/4/9 kcal per g -> per portion -> % of reference intake -> fat share; work back to fat  (Food Label)
//   label-scale      recipe total -> per serving -> % of reference intake -> scaled amount; per-100 g vs portion (Food Label)
//   activity-energy  MET x kg x hours -> kJ -> per minute -> compare sessions; work back to body mass       (Sports)
//   fluid-volume     mass change + drunk -> volume -> rate -> % of mass -> bottles; forward from a rate        (Sports)

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
const PRACTICE = "All figures are made up for practice.";
const isWhole = (n) => Math.abs(n - Math.round(n)) < 1e-9;

function numPart(id, label, ask, val, dp, hint) {
  return { id: id.toLowerCase(), label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
// Every key in `dps` must be stable: computing each stage from the rounded earlier answers
// rounds to the same value, and nothing sits on a rounding half-step.
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
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const TRY = 20000;
const tooMany = () => { throw new Error("role-nutritionist: no suitable draw"); };
const sliceBy = (tier, keys) => keys.slice(0, TIER_PARTS[tier]);

// Energy factors used in the label questions (stated in each prompt).
const KC = { carb: 4, protein: 4, fat: 9 };
const KJ_PER_KCAL = 4.184;

// ---------- label-energy ----------

// L1: macros per 100 g -> kcal per 100 g -> kcal per portion -> % of RI -> fat under 30% of energy?
function genLabel(rng, tier) {
  // The Yes/No claim (Expert) is balanced: pick the answer first, then draw until it fits.
  const wantUnder = sliceBy(tier, ["e100", "ep", "pri", "claim"]).includes("claim") ? rng.next() < 0.5 : null;
  for (let i = 0; i < TRY; i++) {
    const c = rng.int(5, 60), p = rng.int(1, 30), f = rng.int(1, 30);
    const portion = 5 * rng.int(4, 50);
    const RI = rng.pick([2000, 2200, 2500]);
    if (c + p + f > 95) continue; // a label's nutrients can't add up to more than the 100 g
    const st = (rd) => {
      const e100 = KC.carb * c + KC.protein * p + KC.fat * f;
      const ep = rd("ep", (e100 * portion) / 100);
      const pri = rd("pri", (ep / RI) * 100);
      return { e100, ep, pri };
    };
    const dps = { ep: 1, pri: 1 };
    const keys = sliceBy(tier, ["e100", "ep", "pri", "claim"]);
    const use = {}; for (const k of ["ep", "pri"]) if (keys.includes(k)) use[k] = dps[k];
    if (!stableOk(st, use)) continue;
    const r = st((k, v) => v);
    const share = ((KC.fat * f) / r.e100) * 100;
    if (Math.abs(share - 30) < 2.5) continue;
    const under = share < 30;
    if (wantUnder !== null && under !== wantUnder) continue;
    const all = {
      e100: numPart("e100", "Energy per 100 g", "Energy per 100 g (kcal)", r.e100, 0, "Multiply each nutrient's grams by its stated kcal per gram, then add the three."),
      ep: numPart("ep", "Energy per portion", "Energy in one portion (kcal)", r.ep, 1, "Energy per portion = energy per 100 g × portion mass ÷ 100."),
      pri: numPart("pri", "% of reference", "Energy of one portion as a percentage of the reference intake (%)", r.pri, 1, "Percentage = energy of the portion ÷ reference intake × 100."),
      claim: choicePart("claim", "Fat share", "For this exercise the cut-off is 30%. Is the share of the food's energy that comes from fat under 30%?", under ? "Yes" : "No", ["Yes", "No"], "Energy from fat = 9 × fat grams. Divide by the energy per 100 g and compare with 30%."),
    };
    const exs = {
      e100: `**Per 100 g:** ${KC.carb} × ${c} + ${KC.protein} × ${p} + ${KC.fat} × ${f} = **${r.e100} kcal**.`,
      ep: `**Per portion:** ${r.e100} × ${portion} ÷ 100 = **${fixed(r.ep, 1)} kcal**.`,
      pri: `**% of reference:** ${fixed(r.ep, 1)} ÷ ${RI} × 100 = **${fixed(r.pri, 1)}%**.`,
      claim: `**Fat share:** ${KC.fat} × ${f} ÷ ${r.e100} × 100 = ${fixed(share, 1)}%, so **${under ? "Yes" : "No"}**.`,
    };
    const hard = keys.includes("pri");
    return finish(
      `A made-up food label gives, per 100 g: **${c} g** carbohydrate, **${p} g** protein and **${f} g** fat. Use ${KC.carb} kcal per g for carbohydrate and protein and ${KC.fat} kcal per g for fat. One portion is **${portion} g**.${hard ? ` The reference intake for this exercise is **${RI} kcal**.` : ""} ${PRACTICE}`,
      keys.map((k) => all[k]), keys.map((k) => exs[k]).join("\n\n"), "nu-label", { c, p, f, portion, RI, keys },
      [["_carb", c], ["_protein", p], ["_fat", f], ["_portion", portion]].concat(hard ? [["_ri", RI]] : []),
      ["Energy per gram differs by nutrient, so convert each nutrient first.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// L2 (expert+): energy per portion -> energy per 100 g -> fat per 100 g -> fat share -> segmented claim check.
function genLabelBack(rng) {
  const cols = ["Low-fat rule", "Fat share of energy"];
  const choices = [];
  for (const a of ["Meets rule", "Fails rule"]) for (const b of ["Under 30%", "30% or more"]) choices.push([a, b]);
  // Each of the four answers is equally likely: pick it first, then draw figures until they fit.
  const want = rng.int(0, 3), wantMeets = want < 2, wantUnder = want % 2 === 0;
  for (let i = 0; i < TRY; i++) {
    const lean = wantMeets && !wantUnder; // little fat but a high fat share needs a low-energy food
    const c = lean ? rng.int(2, 8) : rng.int(5, 60), p = lean ? rng.int(1, 4) : rng.int(1, 25);
    const f10 = wantMeets ? rng.int(5, 26) : rng.int(34, 300);
    const portion = 10 * rng.int(2, 25);
    if (c + p + f10 / 10 > 95) continue;
    const e100x = KC.carb * c + KC.protein * p + (KC.fat * f10) / 10;
    const E = Math.round((e100x * portion) / 100);
    const st = (rd) => {
      const e100 = rd("e100", (E * 100) / portion);
      const fat = rd("fat", (e100 - KC.carb * c - KC.protein * p) / KC.fat);
      const share = rd("share", ((KC.fat * fat) / e100) * 100);
      return { e100, fat, share };
    };
    const dps = { e100: 1, fat: 1, share: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (r.fat < 0.5 || Math.abs(r.fat - 3) < 0.4 || Math.abs(r.share - 30) < 2.5) continue;
    if (roundTo(r.fat, 1) === 3) continue;
    const meets = r.fat <= 3, under = r.share < 30;
    if (meets !== wantMeets || under !== wantUnder) continue;
    const ans = [meets ? "Meets rule" : "Fails rule", under ? "Under 30%" : "30% or more"];
    const parts = [
      numPart("e100", "Energy per 100 g", "Energy per 100 g (kcal)", r.e100, 1, "The portion's energy is the per-100 g energy × portion mass ÷ 100. Rearrange to find the per-100 g energy."),
      numPart("fat", "Fat per 100 g", "Fat per 100 g (g)", r.fat, 1, `Take the carbohydrate and protein energy (${KC.carb} kcal per g each) away from the energy per 100 g. What is left comes from fat at ${KC.fat} kcal per g.`),
      numPart("share", "Fat share", "Percentage of the energy that comes from fat (%)", r.share, 0, "Energy from fat = 9 × fat grams per 100 g. Divide by the energy per 100 g and multiply by 100."),
      { id: "check", label: "Rule check", ask: "For this exercise, the low-fat rule is at most 3 g of fat per 100 g. Does the food meet it, and is the fat share of energy under 30%?", answerType: "choice", choiceCols: cols, choices, answer: ans, hint: "Compare your fat per 100 g with 3 g, and your fat share with 30%." },
    ];
    const ex = [
      `**Per 100 g:** ${E} × 100 ÷ ${portion} = **${fixed(r.e100, 1)} kcal**.`,
      `**Fat:** (${fixed(r.e100, 1)} − ${KC.carb} × ${c} − ${KC.protein} × ${p}) ÷ ${KC.fat} = **${fixed(r.fat, 1)} g**.`,
      `**Fat share:** ${KC.fat} × ${fixed(r.fat, 1)} ÷ ${fixed(r.e100, 1)} × 100 = **${fixed(r.share, 0)}%**.`,
      `**Rule check:** ${fixed(r.fat, 1)} g is ${meets ? "at most" : "more than"} 3 g, and ${fixed(r.share, 0)}% is ${under ? "under" : "not under"} 30%: **${ans.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `A made-up label says one **${portion} g** portion gives **${E} kcal**. Per 100 g it lists **${c} g** carbohydrate and **${p} g** protein; the fat line is hidden. Use ${KC.carb} kcal per g for carbohydrate and protein and ${KC.fat} kcal per g for fat. ${PRACTICE}`,
      parts, ex, "nu-labelback", { c, p, E, portion }, [["_energy", E], ["_portion", portion], ["_carb", c], ["_protein", p]],
      ["Work backwards: portion energy gives per-100 g energy, then take away what carbohydrate and protein supply.", "Whatever energy is left must come from fat."],
    );
  }
  return tooMany();
}

// ---------- label-scale ----------

// [name, kcal per 100 g, most grams in one recipe (a multiple of 50, so fats and sweeteners stay small)]
const INGR = [
  ["rolled oats", 370, 300], ["plain flour", 350, 500], ["white sugar", 400, 200], ["butter", 720, 150], ["cooked rice", 130, 500],
  ["milk", 46, 500], ["dried lentils", 350, 400], ["honey", 304, 150], ["olive oil", 884, 100], ["pasta (dry)", 360, 500],
];
// S1: recipe from three ingredients -> total kcal -> per serving -> % of RI -> amount of the first ingredient for N servings.
function genScale(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const idx = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
    const ing = idx.map((j) => ({ name: INGR[j][0], k: INGR[j][1], g: 50 * rng.int(1, INGR[j][2] / 50) }));
    const S = rng.pick([4, 5, 6, 8, 10]);
    const N = rng.pick([2, 3, 6, 12, 15, 20]);
    if (N === S) continue;
    const RI = rng.pick([2000, 2200, 2500]);
    const st = (rd) => {
      const tot = ing.reduce((a, x) => a + (x.g * x.k) / 100, 0);
      const per = rd("per", tot / S);
      const pri = rd("pri", (per / RI) * 100);
      const sc = rd("sc", (ing[0].g * N) / S);
      return { tot, per, pri, sc };
    };
    const keys = sliceBy(tier, ["tot", "per", "pri", "sc"]);
    const dps = { per: 1, pri: 1, sc: 1 };
    const use = {}; for (const k of ["per", "pri", "sc"]) if (keys.includes(k)) use[k] = dps[k];
    if (!stableOk(st, use)) continue;
    const r = st((k, v) => v);
    if (!isWhole(r.tot)) continue;
    const all = {
      tot: numPart("tot", "Recipe energy", "Total energy of the whole recipe (kcal)", r.tot, 0, "For each ingredient, grams × kcal per 100 g ÷ 100. Then add the three."),
      per: numPart("per", "Per serving", "Energy in one serving (kcal)", r.per, 1, "Divide the recipe's total energy by the number of servings it makes."),
      pri: numPart("pri", "% of reference", "Energy of one serving as a percentage of the reference intake (%)", r.pri, 1, "Percentage = energy of one serving ÷ reference intake × 100."),
      sc: numPart("sc", "Scaled amount", `Grams of ${ing[0].name} needed for ${N} servings (g)`, r.sc, 1, `Scale by the new servings over the old: multiply by ${N} ÷ ${S}.`),
    };
    const exs = {
      tot: `**Total:** ${ing.map((x) => `${x.g} × ${x.k} ÷ 100`).join(" + ")} = **${r.tot} kcal**.`,
      per: `**Per serving:** ${r.tot} ÷ ${S} = **${fixed(r.per, 1)} kcal**.`,
      pri: `**% of reference:** ${fixed(r.per, 1)} ÷ ${RI} × 100 = **${fixed(r.pri, 1)}%**.`,
      sc: `**Scaled:** ${ing[0].g} × ${N} ÷ ${S} = **${fixed(r.sc, 1)} g**.`,
    };
    const needRI = keys.includes("pri"), needN = keys.includes("sc");
    return finish(
      `A made-up recipe makes **${S} servings** from ${ing.map((x) => `**${x.g} g** ${x.name} (${x.k} kcal per 100 g)`).join(", ")}.${needRI ? ` The reference intake for this exercise is **${RI} kcal**.` : ""}${needN ? ` The recipe is scaled to **${N} servings**.` : ""} ${PRACTICE}`,
      keys.map((k) => all[k]), keys.map((k) => exs[k]).join("\n\n"), "nu-scale", { ing: ing.map((x) => [x.g, x.k]), names: ing.map((x) => x.name), S, N, RI, keys },
      ing.map((x, j) => [`_g${j + 1}`, x.g]).concat([["_servings", S]]).concat(needRI ? [["_ri", RI]] : []).concat(needN ? [["_new", N]] : []),
      ["Each ingredient's energy comes from its own per-100 g value, so work them one at a time.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// S2 (expert+): per-100 g and per-portion energy -> portion mass -> portions per packet -> packet energy -> packets for a total.
function genPack(rng) {
  for (let i = 0; i < TRY; i++) {
    const X = 2 * rng.int(60, 250);
    const P = 5 * rng.int(4, 40);
    const Y = Math.round((X * P) / 100);
    const M = 50 * rng.int(5, 20);
    const st = (rd) => {
      const por = rd("por", (Y / X) * 100);
      const pk = rd("pk", M / por);
      const tot = rd("tot", pk * Y);
      return { por, pk, tot };
    };
    const dps = { por: 0, pk: 1, tot: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const T = 100 * rng.int(8, 60);
    const q = T / r.tot;
    const q2 = T / roundTo(r.tot, 0);
    if (Math.abs(q - Math.round(q)) < 0.1 || Math.ceil(q) !== Math.ceil(q2) || Math.ceil(q) < 2) continue;
    const cnt = Math.ceil(q);
    const parts = [
      numPart("por", "Portion mass", "Mass of one portion (g)", r.por, 0, "The per-100 g figure gives kcal per gram. Divide the portion's kcal by that to find grams (× 100 for per 100 g)."),
      numPart("pk", "Portions per packet", "Number of portions in one packet", r.pk, 1, "Packet mass ÷ portion mass."),
      numPart("tot", "Packet energy", "Energy in one whole packet (kcal)", r.tot, 0, "Portions in the packet × energy per portion."),
      { ...numPart("cnt", "Packets needed", "", cnt, 0, "Divide the order's total by the energy in one packet, then round up: part of a packet still means opening another."), ask: `Fewest whole packets that supply at least ${T} kcal in total (round up)` },
    ];
    const ex = [
      `**Portion:** ${Y} ÷ ${X} × 100 = **${fixed(r.por, 0)} g**.`,
      `**Portions per packet:** ${M} ÷ ${fixed(r.por, 0)} = **${fixed(r.pk, 1)}**.`,
      `**Packet energy:** ${fixed(r.pk, 1)} × ${Y} = **${fixed(r.tot, 0)} kcal**.`,
      `**Packets:** ${T} ÷ ${fixed(r.tot, 0)} = ${fixed(q, 2)}, rounded up to **${cnt}**.`,
    ].join("\n\n");
    return finish(
      `A made-up packet label shows **${X} kcal per 100 g** and **${Y} kcal per portion**. The packet holds **${M} g**. Treat the figures as exact. A made-up stock order must supply at least **${T} kcal** of this food in total. ${PRACTICE}`,
      parts, ex, "nu-pack", { X, Y, M, T }, [["_per100", X], ["_portion_kcal", Y], ["_packet", M], ["_total", T]],
      ["Per 100 g and per portion are the same food: use them together to find the portion's mass.", "The last part is a rounded-up count, not a rounded-to-nearest one."],
    );
  }
  return tooMany();
}

// ---------- activity-energy ----------

const ACTS = [
  ["walking at a steady pace", 3.5], ["cycling at a moderate pace", 6.8], ["swimming laps", 5.8], ["rowing", 7],
  ["hiking", 5.3], ["jogging", 7], ["gardening", 3.8], ["dancing", 4.8],
];
const sessionKcal = (met, kg, min) => (met * kg * min) / 60;
const minTxt = (m) => `${m} minutes`;

// A1: MET x kg x hours -> kJ -> energy per minute -> which of two sessions uses more?
function genAct(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const [aN, aM] = rng.pick(ACTS);
    let [bN, bM] = rng.pick(ACTS);
    if (bN === aN) continue;
    const kg = rng.int(50, 95);
    const min = 30 * rng.int(1, 4);
    const min2 = 30 * rng.int(1, 4);
    rng.pick([150, 180, 200, 220, 250]); // unused draw, kept so existing seeds give the same sessions
    const kcal = sessionKcal(aM, kg, min);
    if (!isWhole(kcal)) continue;
    const k2 = sessionKcal(bM, kg, min2);
    if (Math.abs(k2 - kcal) / kcal < 0.08) continue;
    const st = (rd) => {
      const kc = rd("kcal", kcal);
      const kj = rd("kj", kc * KJ_PER_KCAL);
      const kpm = rd("kpm", kc / min);
      return { kcal: kc, kj, kpm };
    };
    const keys = sliceBy(tier, ["kcal", "kj", "kpm", "cmp"]);
    const dps = { kcal: 0, kj: 0, kpm: 1 };
    const use = {}; for (const k of ["kcal", "kj", "kpm"]) if (keys.includes(k)) use[k] = dps[k];
    if (!stableOk(st, use)) continue;
    const r = st((k, v) => v);
    const aMore = kcal > k2;
    const all = {
      kcal: numPart("kcal", "Session energy", "Energy used in the session (kcal)", r.kcal, 0, "Convert the minutes to hours first, then multiply MET × body mass × hours."),
      kj: numPart("kj", "In kilojoules", "The same energy in kJ", r.kj, 0, "Multiply the kcal by 4.184."),
      kpm: numPart("kpm", "Per minute", "Average energy used per minute in session A (kcal per minute)", r.kpm, 1, "Divide the session's energy in kcal by its length in minutes."),
      cmp: choicePart("cmp", "Which session", "Which session uses more energy?", aMore ? "Session A" : "Session B", ["Session A", "Session B"], "Work out session B's energy the same way (same body mass) and compare the two."),
    };
    const exs = {
      kcal: `**Session A:** ${aM} × ${kg} × ${min} ÷ 60 = **${fixed(r.kcal, 0)} kcal**.`,
      kj: `**kJ:** ${fixed(r.kcal, 0)} × 4.184 = **${fixed(r.kj, 0)} kJ**.`,
      kpm: `**Per minute:** ${fixed(r.kcal, 0)} ÷ ${min} = **${fixed(r.kpm, 1)} kcal per minute**.`,
      cmp: `**Session B:** ${bM} × ${kg} × ${min2} ÷ 60 = ${fixed(k2, 0)} kcal, against ${fixed(kcal, 0)} kcal for A: **${aMore ? "Session A" : "Session B"}** uses more.`,
    };
    const needB = keys.includes("cmp");
    return finish(
      `A made-up person of **${kg} kg** does ${aN} (MET **${aM}**) for **${minTxt(min)}** as session A. Energy in kcal = MET × body mass in kg × time in hours, and 1 kcal = 4.184 kJ.${needB ? ` Session B is ${bN} (MET **${bM}**) for **${minTxt(min2)}**, same person.` : ""} ${PRACTICE}`,
      keys.map((k) => all[k]), keys.map((k) => exs[k]).join("\n\n"), "nu-act", { aM, bM, kg, min, min2, keys },
      [["_met", aM], ["_kg", kg], ["_min", min]].concat(needB ? [["_met_b", bM], ["_min_b", min2]] : []),
      ["Time must be in hours for the formula, so convert minutes first.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// A2 (expert+): energy of session 1 -> body mass -> energy of session 2 -> kJ -> which used more.
function genActBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const [aN, aM] = rng.pick(ACTS);
    const [bN, bM] = rng.pick(ACTS);
    if (aN === bN) continue;
    const kg = rng.int(50, 95);
    const m1 = 30 * rng.int(1, 4), m2 = 30 * rng.int(1, 4);
    const E = sessionKcal(aM, kg, m1);
    const k2 = sessionKcal(bM, kg, m2);
    if (!isWhole(E) || !isWhole(k2) || Math.abs(k2 - E) / E < 0.08) continue;
    const st = (rd) => {
      const w = rd("kg", E / (aM * (m1 / 60)));
      const kc = rd("kcal2", bM * w * (m2 / 60));
      const kj = rd("kj2", kc * KJ_PER_KCAL);
      return { kg: w, kcal2: kc, kj2: kj };
    };
    const dps = { kg: 1, kcal2: 0, kj2: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const oneMore = E > k2;
    const parts = [
      numPart("kg", "Body mass", "Body mass of the person (kg)", r.kg, 1, "Rearrange energy = MET × mass × hours to mass = energy ÷ (MET × hours). Convert minutes to hours first."),
      numPart("kcal2", "Session 2 energy", "Energy used in session 2 (kcal)", r.kcal2, 0, "Use the body mass you found with session 2's MET and time."),
      numPart("kj2", "In kilojoules", "Session 2 energy in kJ", r.kj2, 0, "Multiply the kcal by 4.184."),
      choicePart("cmp", "Which session", "Which session used more energy?", oneMore ? "Session 1" : "Session 2", ["Session 1", "Session 2"], "Compare the stated energy of session 1 with the energy you worked out for session 2."),
    ];
    const ex = [
      `**Body mass:** ${E} ÷ (${aM} × ${m1} ÷ 60) = **${fixed(r.kg, 1)} kg**.`,
      `**Session 2:** ${bM} × ${fixed(r.kg, 1)} × ${m2} ÷ 60 = **${fixed(r.kcal2, 0)} kcal**.`,
      `**kJ:** ${fixed(r.kcal2, 0)} × 4.184 = **${fixed(r.kj2, 0)} kJ**.`,
      `**Compare:** ${E} kcal for session 1 against ${fixed(r.kcal2, 0)} kcal for session 2: **${oneMore ? "Session 1" : "Session 2"}** used more.`,
    ].join("\n\n");
    return finish(
      `A made-up person did session 1: ${aN} (MET **${aM}**) for **${minTxt(m1)}**, using **${E} kcal**. Their body mass is not given. Session 2: ${bN} (MET **${bM}**) for **${minTxt(m2)}**, same person. Energy in kcal = MET × body mass in kg × time in hours, and 1 kcal = 4.184 kJ. ${PRACTICE}`,
      parts, ex, "nu-actback", { aM, bM, E, m1, m2 }, [["_energy", E], ["_met", aM], ["_min", m1], ["_met2", bM], ["_min2", m2]],
      ["Work backwards: the first session's energy, MET and time fix the body mass.", "The same body mass then feeds session 2."],
    );
  }
  return tooMany();
}

// ---------- fluid-volume ----------

// F1: mass before/after + drunk -> volume lost -> rate -> % of start mass -> bottles to hold that volume.
function genFluid(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const B = rng.int(500, 900) / 10;
    const dm = rng.int(5, 30) / 10;
    const D = rng.int(0, 15) / 10;
    const h = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
    const V = rng.pick([330, 500, 600, 750]);
    const A = roundTo(B - dm, 1);
    const st = (rd) => {
      const loss = rd("loss", B - A + D);
      const rate = rd("rate", loss / h);
      const pct = rd("pct", ((B - A) / B) * 100);
      return { loss, rate, pct };
    };
    const keys = sliceBy(tier, ["loss", "rate", "pct", "btl"]);
    const dps = { loss: 2, rate: 2, pct: 1 };
    const use = {}; for (const k of ["loss", "rate", "pct"]) if (keys.includes(k)) use[k] = dps[k];
    if (!stableOk(st, use)) continue;
    const r = st((k, v) => v);
    const q = (r.loss * 1000) / V;
    if (Math.abs(q - Math.round(q)) < 0.1 || q < 1) continue;
    const btl = Math.ceil(q);
    const all = {
      loss: numPart("loss", "Fluid lost", "Volume of fluid lost (litres)", r.loss, 2, "The mass drop plus the fluid drunk gives the fluid lost. Use 1 kg = 1 L."),
      rate: numPart("rate", "Rate", "Average rate of loss (litres per hour)", r.rate, 2, "Volume ÷ hours."),
      pct: numPart("pct", "% of start mass", "Net mass change as a percentage of the start mass (%)", r.pct, 1, "Net mass change = start − end. Divide by the start mass and multiply by 100 (ignore the fluid drunk here)."),
      btl: { ...numPart("btl", "Bottles", "", btl, 0, `Change litres to mL, divide by ${V}, then round up: a part-filled bottle still counts as one.`), ask: `Fewest whole ${V} mL bottles whose total volume is at least the volume lost (round up)` },
    };
    const exs = {
      loss: `**Fluid lost:** (${B} − ${A}) + ${D} = **${fixed(r.loss, 2)} L**.`,
      rate: `**Rate:** ${fixed(r.loss, 2)} ÷ ${h} = **${fixed(r.rate, 2)} L/h**.`,
      pct: `**Net change:** (${B} − ${A}) ÷ ${B} × 100 = **${fixed(r.pct, 1)}%**.`,
      btl: `**Bottles:** ${fixed(r.loss * 1000, 0)} ÷ ${V} = ${fixed(q, 2)}, rounded up to **${btl}**.`,
    };
    const needV = keys.includes("btl");
    return finish(
      `In a made-up test, an athlete weighs **${B} kg** before and **${A} kg** after **${h} hours** of exercise, and drinks **${D} L** during it. Use 1 kg of mass = 1 L of fluid.${needV ? ` Bottles hold **${V} mL**.` : ""} ${PRACTICE}`,
      keys.map((k) => all[k]), keys.map((k) => exs[k]).join("\n\n"), "nu-fluid", { B, A, D, h, V, keys },
      [["_before", B], ["_after", A], ["_drunk", D], ["_hours", h]].concat(needV ? [["_bottle", V]] : []),
      ["Mass lost is the before mass minus the after mass; the drink was extra fluid that came in.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// F2 (expert+): stated rate -> fluid lost -> end mass -> net change % -> which of two athletes changed more.
function genFluidBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const B = rng.int(500, 900) / 10;
    const rt = rng.int(4, 16) / 10;
    const h = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
    const D = rng.int(0, 15) / 10;
    const loss = rt * h;
    if (loss - D < 0.3) continue;
    const st = (rd) => {
      const l = rd("loss", rt * h);
      const end = rd("end", B - (l - D));
      const pct = rd("pct", ((B - end) / B) * 100);
      return { loss: l, end, pct };
    };
    const dps = { loss: 2, end: 2, pct: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const q2 = roundTo(r.pct + rng.pick([-0.9, -0.6, -0.4, 0.4, 0.6, 0.9]), 1);
    if (q2 <= 0 || Math.abs(q2 - r.pct) < 0.3) continue;
    const firstMore = r.pct > q2;
    const parts = [
      numPart("loss", "Fluid lost", "Volume of fluid lost (litres)", r.loss, 2, "Rate × hours."),
      numPart("end", "End mass", "Mass at the end (kg)", r.end, 2, "With 1 kg = 1 L, mass falls by the fluid lost but rises by the fluid drunk. End mass = start − lost + drunk."),
      numPart("pct", "% of start mass", "Net mass change as a percentage of the start mass (%)", r.pct, 1, "Net change = start − end. Divide by the start mass and multiply by 100."),
      choicePart("cmp", "Which athlete", `Athlete 2's net mass change was ${fixed(q2, 1)}% of their start mass. Who had the larger net change as a percentage?`, firstMore ? "Athlete 1" : "Athlete 2", ["Athlete 1", "Athlete 2"], "Compare your percentage for athlete 1 with the figure given for athlete 2."),
    ];
    const ex = [
      `**Fluid lost:** ${rt} × ${h} = **${fixed(r.loss, 2)} L**.`,
      `**End mass:** ${B} − ${fixed(r.loss, 2)} + ${D} = **${fixed(r.end, 2)} kg**.`,
      `**Net change:** (${B} − ${fixed(r.end, 2)}) ÷ ${B} × 100 = **${fixed(r.pct, 1)}%**.`,
      `**Compare:** ${fixed(r.pct, 1)}% against ${fixed(q2, 1)}%: **${firstMore ? "Athlete 1" : "Athlete 2"}** is larger.`,
    ].join("\n\n");
    return finish(
      `In a made-up test, athlete 1 starts at **${B} kg**, loses fluid at **${rt} L per hour** for **${h} hours**, and drinks **${D} L** during that time. Use 1 kg of mass = 1 L of fluid. ${PRACTICE}`,
      parts, ex, "nu-fluidback", { B, rt, h, D, q2 }, [["_start", B], ["_rate", rt], ["_hours", h], ["_drunk", D]],
      ["Work forwards: rate and time give the volume lost, and the mass follows from it.", "Drinking adds mass back, so only the net change counts at the end."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  if (subtopic === "label-energy") return plus ? genLabelBack(rng) : genLabel(rng, difficulty);
  if (subtopic === "label-scale") return plus ? genPack(rng) : genScale(rng, difficulty);
  if (subtopic === "activity-energy") return plus ? genActBack(rng) : genAct(rng, difficulty);
  if (subtopic === "fluid-volume") return plus ? genFluidBack(rng) : genFluid(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (cents/integer arithmetic,
// ratios, rearranged formulas). A number must be within its rounding tolerance; a choice must match exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");

const ALT = {
  "nu-label": (p) => {
    // energy in 100 g of food worked as kcal per g x grams, in a different grouping
    const e100 = 4 * (p.c + p.p) + 9 * p.f;
    const ep = (e100 / 100) * p.portion;
    return { e100, ep, pri: ep / (p.RI / 100), claim: YN(9 * p.f * 100 < 30 * e100) };
  },
  "nu-labelback": (p) => {
    const e100 = p.E / (p.portion / 100);
    const fat = (e100 - 4 * (p.c + p.p)) / 9;
    const share = (fat / (e100 / 9)) * 100;
    return { e100, fat, share, check: `${fat <= 3 ? "Meets rule" : "Fails rule"} | ${share < 30 ? "Under 30%" : "30% or more"}` };
  },
  "nu-scale": (p) => {
    const tot = p.ing.reduce((a, [g, k]) => a + g * (k / 100), 0);
    const per = tot / p.S;
    return { tot, per, pri: per / (p.RI / 100), sc: p.ing[0][0] / (p.S / p.N) };
  },
  "nu-pack": (p) => {
    const perGram = p.X / 100;
    const por = p.Y / perGram;
    const pk = p.M / por;
    const tot = p.M * perGram * (p.Y / (perGram * por)); // = M x kcal per g, via the portion route
    return { por, pk, tot, cnt: Math.ceil(p.T / tot - 1e-9) };
  },
  "nu-act": (p) => {
    const kcal = (p.aM * p.kg * p.min) / 60;
    const k2 = p.bM * p.kg * (p.min2 / 60);
    return { kcal, kj: kcal / 0.239006, kpm: (p.aM * p.kg) / 60, cmp: kcal > k2 ? "Session A" : "Session B" };
  },
  "nu-actback": (p) => {
    const kg = p.E / ((p.aM * p.m1) / 60);
    const kcal2 = p.bM * kg * (p.m2 / 60);
    return { kg, kcal2, kj2: kcal2 * 4.184, cmp: p.E > kcal2 ? "Session 1" : "Session 2" };
  },
  "nu-fluid": (p) => {
    const loss = Math.round(p.B * 100 - p.A * 100 + p.D * 100) / 100;
    return { loss, rate: loss / p.h, pct: (1 - p.A / p.B) * 100, btl: Math.ceil((loss * 1000) / p.V - 1e-9) };
  },
  "nu-fluidback": (p) => {
    const loss = Math.round(p.rt * p.h * 100) / 100;
    const end = p.B - loss + p.D;
    const pct = (loss - p.D) / (p.B / 100);
    return { loss, end, pct, cmp: pct > p.q2 ? "Athlete 1" : "Athlete 2" };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      const dp = p.dps[part.id] === undefined ? 0 : p.dps[part.id];
      if (!near(partNum(answer, part.id), tv, tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
