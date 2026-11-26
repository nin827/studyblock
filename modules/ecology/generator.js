// Ecology generator. Uses only the seeded rng passed in by the engine.
//
// Generation uses the textbook formulas; verify() checks by a different route:
// energy by working back up the chain, Lincoln–Petersen by cross-multiplying, quadrats via density,
// growth by year-by-year simulation, and Simpson's index by enumerating every pair of individuals.

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
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function numChoices(correct, cands, d, rng, { min = 0, max = Infinity, step } = {}) {
  const st = step ?? (d > 0 ? 10 ** -d : 1);
  const fmt = (v) => num(roundTo(v, d));
  const cStr = fmt(correct);
  const seen = new Set([cStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    const x = roundTo(v, d);
    if (x < min || x > max) return;
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

// Typed number rounded to d places, or sometimes a 4-option choice. `note` goes on typed prompts only.
function finish(base, exact, d, cands, rng, opt = {}) {
  const params = { ...base.params, d };
  if (rng.next() < (opt.choiceP ?? 0.3)) {
    const { answer, choices } = numChoices(exact, cands, d, rng, opt);
    return { ...base, params, answerType: "choice", answer, choices };
  }
  return { ...base, params, prompt: base.prompt + (opt.note || ""), answerType: "number", answer: roundTo(exact, d), tolerance: tolFor(d) };
}

function resultTxt(exact, d, unit = "") {
  const shown = roundTo(exact, d);
  if (Math.abs(shown - exact) < 1e-9) return `= **${num(shown)}${unit}**`;
  return `≈ ${num(roundTo(exact, 4))}${unit}, which rounds to **${num(shown)}${unit}**`;
}

const PCT = " Type the number without the % sign.";
const R0 = " Round to the nearest whole number.";
const R2 = " Round to 2 decimal places.";

// ---------- Energy transfer ----------

const CHAINS = [
  ["grass", "rabbits", "foxes", "golden eagles"],
  ["phytoplankton", "zooplankton", "herring", "seals"],
  ["oak leaves", "caterpillars", "blue tits", "sparrowhawks"],
  ["algae", "mayfly larvae", "trout", "herons"],
  ["grass", "grasshoppers", "frogs", "snakes"],
  ["seaweed", "periwinkles", "crabs", "gulls"],
  ["clover", "slugs", "hedgehogs", "badgers"],
];
const UNIT = " kJ/m²/year";
const LEVELS = "Producers are trophic level 1, primary consumers level 2, and so on.";
const EFF_EQ = "`efficiency (%) = energy transferred to the next level ÷ energy at this level × 100`";

function genEnergy(difficulty, rng) {
  const ch = rng.pick(CHAINS);
  const chain = ch.join(" → ");
  if (difficulty === "easy") {
    const kind = rng.pick(["eff", "next"]);
    if (kind === "eff") {
      const i = rng.int(0, 2);
      const Ein = rng.int(2, 99) * 100;
      const e = rng.pick([5, 8, 10, 12, 15, 20, 25]);
      const Eout = (Ein * e) / 100;
      return finish(
        {
          prompt: `In the food chain ${chain}, the ${ch[i]} contain ${Ein}${UNIT} and pass ${num(Eout)}${UNIT} on to the ${ch[i + 1]}. What is the efficiency of this energy transfer, as a percentage?`,
          explanation: `Use ${EFF_EQ}.\n\n\`${num(Eout)} ÷ ${Ein} × 100\` = **${e}%**.`,
          hints: [`Use ${EFF_EQ}.`, `Divide what the ${ch[i + 1]} receive by what the ${ch[i]} contain, then multiply by 100 (in the calculator: \`_out / _in * 100\`).`],
          given: [{ label: "_in", value: Ein }, { label: "_out", value: Eout }],
          params: { sub: "energy", kind: "eff", Ein, Eout },
        },
        e,
        0,
        [100 - e, Ein / Eout, e * 10, e / 10 > 1 ? e / 10 : e + 5],
        rng,
        { note: PCT, min: 1, max: 100 },
      );
    }
    const E = rng.int(2, 99) * 1000;
    const exact = E / 10;
    return finish(
      {
        prompt: `In the food chain ${chain}, the ${ch[0]} contain ${E}${UNIT}. Assume about 10% of the energy passes from one trophic level to the next. How much energy reaches the ${ch[1]}, in kJ/m²/year?`,
        explanation: `10% of the energy is passed on: \`${E} × 10 ÷ 100\` = **${num(exact)}${UNIT}**. The other 90% is lost as heat from respiration, in waste and in parts that aren't eaten.`,
        hints: ["Only about a tenth of the energy at one level reaches the next.", `Work out 10% of ${E} (in the calculator: \`${E} * 0.1\`).`],
        given: [{ label: "_E", value: E }, { label: "_pct", value: 10 }],
        params: { sub: "energy", kind: "rule", E, steps: 1, pct: 10 },
      },
      exact,
      0,
      [E * 0.9, E / 100, E - 10, E * 10],
      rng,
    );
  }
  if (difficulty === "medium") {
    const kind = rng.pick(["rule", "given", "lost"]);
    if (kind === "rule") {
      const steps = rng.int(2, 3);
      const E = rng.int(1, 99) * 10 ** (steps + 2);
      const exact = E * 0.1 ** steps;
      return finish(
        {
          prompt: `In the food chain ${chain}, the ${ch[0]} contain ${E}${UNIT}. ${LEVELS} Assume 10% of the energy passes from each level to the next. How much energy reaches the ${ch[steps]} (level ${steps + 1}), in kJ/m²/year?`,
          explanation: `From level 1 to level ${steps + 1} there are ${steps} transfers, each keeping 10%.\n\n\`${E} × 0.1${" × 0.1".repeat(steps - 1)}\` = **${num(exact)}${UNIT}**.`,
          hints: [`Count the transfers: from level 1 to level ${steps + 1}.`, "Each transfer keeps 10%, so multiply by 0.1 once for every transfer."],
          given: [{ label: "_E", value: E }, { label: "_pct", value: 10 }],
          params: { sub: "energy", kind: "rule", E, steps, pct: 10 },
        },
        exact,
        2,
        [E * 0.1 ** (steps + 1), E * 0.1 ** (steps - 1), E * 0.1 * steps, E - E * 0.1],
        rng,
      );
    }
    const i = rng.int(0, 2);
    const Ein = rng.int(50, 900) * 10;
    const Eout = rng.int(Math.ceil(Ein * 0.03), Math.floor(Ein * 0.22));
    if (kind === "lost") {
      const exact = Ein - Eout;
      return finish(
        {
          prompt: `In the food chain ${chain}, the ${ch[i]} take in ${Ein}${UNIT}, and ${Eout}${UNIT} becomes part of the ${ch[i + 1]}. How much energy is not passed on (lost as heat, in waste and in parts not eaten), in kJ/m²/year?`,
          explanation: `Energy not passed on = energy in − energy passed on: \`${Ein} - ${Eout}\` = **${exact}${UNIT}**.`,
          hints: ["Everything that isn't passed on to the next level is lost.", `Subtract (in the calculator: \`_in - _out\`).`],
          given: [{ label: "_in", value: Ein }, { label: "_out", value: Eout }],
          params: { sub: "energy", kind: "lost", Ein, Eout },
        },
        exact,
        0,
        [Ein + Eout, Eout, Ein * 0.9],
        rng,
      );
    }
    const exact = (Eout / Ein) * 100;
    return finish(
      {
        prompt: `In the food chain ${chain}, the ${ch[i]} contain ${Ein}${UNIT} and pass ${Eout}${UNIT} on to the ${ch[i + 1]}. What is the efficiency of this transfer, as a percentage?${R2}`,
        explanation: `Use ${EFF_EQ}.\n\n\`${Eout} ÷ ${Ein} × 100\` ${resultTxt(exact, 2, "%")}.`,
        hints: [`Use ${EFF_EQ}.`, `Divide \`_out\` by \`_in\` and multiply by 100, then round to 2 decimal places.`],
        given: [{ label: "_in", value: Ein }, { label: "_out", value: Eout }],
        params: { sub: "energy", kind: "eff", Ein, Eout },
      },
      exact,
      2,
      [100 - exact, Ein / Eout, exact * 10, exact / 10],
      rng,
      { note: PCT, max: 100 },
    );
  }
  // hard
  const kind = rng.pick(["chain", "overall", "multi", "multi"]);
  const E1 = rng.int(100, 999) * 100;
  const e1 = rng.int(5, 20), e2 = rng.int(5, 20), e3 = rng.int(5, 20);
  const given = [{ label: "_E1", value: E1 }, { label: "_eff1", value: e1 }, { label: "_eff2", value: e2 }, { label: "_eff3", value: e3 }];
  if (kind === "chain") {
    const exact = (E1 * e1 * e2 * e3) / 1e6;
    return finish(
      {
        prompt: `In the food chain ${chain}, the ${ch[0]} contain ${E1}${UNIT}. The transfer efficiencies are ${e1}% (${ch[0]} → ${ch[1]}), ${e2}% (${ch[1]} → ${ch[2]}) and ${e3}% (${ch[2]} → ${ch[3]}). How much energy reaches the ${ch[3]}, in kJ/m²/year?${R2}`,
        explanation: `Multiply by each efficiency as a decimal in turn:\n\n\`${E1} × ${e1 / 100} × ${e2 / 100} × ${e3 / 100}\` ${resultTxt(exact, 2, UNIT)}.`,
        hints: ["Turn each percentage into a decimal (divide by 100).", "Multiply the starting energy by all three decimals in turn (in the calculator: `_E1 * _eff1/100 * _eff2/100 * _eff3/100`)."],
        given,
        params: { sub: "energy", kind: "chain", E1, effs: [e1, e2, e3] },
      },
      exact,
      2,
      [(E1 * (e1 + e2 + e3)) / 100, (E1 * e1 * e2) / 1e4, exact * 100, exact / 10],
      rng,
    );
  }
  if (kind === "overall") {
    const E4 = (E1 * e1 * e2 * e3) / 1e6;
    const exact = (E4 / E1) * 100;
    const E4s = roundTo(E4, 2);
    return finish(
      {
        prompt: `In the food chain ${chain}, the ${ch[0]} contain ${E1}${UNIT} and the ${ch[3]} receive ${num(E4s)}${UNIT}. What percentage of the producers' energy reaches the ${ch[3]}?${" Round to 4 decimal places."}`,
        explanation: `Overall efficiency = \`${num(E4s)} ÷ ${E1} × 100\` ${resultTxt((E4s / E1) * 100, 4, "%")}.`,
        hints: ["Compare the top of the chain with the bottom directly: you don't need the levels in between.", "Divide the energy at the top by the energy in the producers and multiply by 100."],
        given: [{ label: "_E1", value: E1 }, { label: "_E4", value: E4s }],
        params: { sub: "energy", kind: "overall", E1, E4: E4s },
      },
      (E4s / E1) * 100,
      4,
      [(E1 / E4s) / 100, (E4s / E1) * 1000, (E4s / E1) * 10],
      rng,
      { note: PCT, step: 0.001 },
    );
  }
  const E2 = rng.int(Math.ceil(E1 * 0.05), Math.floor(E1 * 0.2));
  const E3 = rng.int(Math.ceil(E2 * 0.05), Math.floor(E2 * 0.2));
  const pctA = (E2 / E1) * 100, pctB = (E3 / E2) * 100;
  const E4 = (E3 * e3) / 100;
  return {
    prompt: `In the food chain ${chain}, the ${ch[0]} contain ${E1}${UNIT}, the ${ch[1]} ${E2}${UNIT} and the ${ch[2]} ${E3}${UNIT}.`,
    answerType: "multi",
    parts: [
      {
        id: "first", label: "First transfer", ask: `What is the efficiency from ${ch[0]} to ${ch[1]}, as a percentage? Round to 2 decimal places.${PCT}`,
        answerType: "number", answer: roundTo(pctA, 2), tolerance: 0.005,
        hint: `Efficiency = energy received ÷ energy available × 100 (in the calculator: \`_E2 / _E1 * 100\`).`,
      },
      {
        id: "second", label: "Second transfer", ask: `What is the efficiency from ${ch[1]} to ${ch[2]}, as a percentage? Round to 2 decimal places.${PCT}`,
        answerType: "number", answer: roundTo(pctB, 2), tolerance: 0.005,
        hint: "Same method, one level up: `_E3 / _E2 * 100`.",
      },
      {
        id: "top", label: "Top level", ask: `If ${e3}% passes from the ${ch[2]} to the ${ch[3]}, how much energy reaches the ${ch[3]}, in kJ/m²/year? Round to 2 decimal places.`,
        answerType: "number", answer: roundTo(E4, 2), tolerance: 0.005,
        hint: `Take ${e3}% of the energy in the ${ch[2]}: multiply by ${e3} and divide by 100.`,
      },
    ],
    explanation:
      `**First transfer:** \`${E2} ÷ ${E1} × 100\` ${resultTxt(pctA, 2, "%")}.\n\n` +
      `**Second transfer:** \`${E3} ÷ ${E2} × 100\` ${resultTxt(pctB, 2, "%")}.\n\n` +
      `**Top level:** \`${E3} × ${e3} ÷ 100\` ${resultTxt(E4, 2, UNIT)}.`,
    given: [{ label: "_E1", value: E1 }, { label: "_E2", value: E2 }, { label: "_E3", value: E3 }],
    params: { sub: "energy", kind: "multi", E1, E2, E3, e3 },
  };
}

// ---------- Population estimates ----------

const ANIMALS = [
  ["woodlice", "a dot of non-toxic paint"],
  ["snails", "a dot of non-toxic paint on the shell"],
  ["ground beetles", "a dot of non-toxic paint"],
  ["voles", "a small fur clip"],
  ["grasshoppers", "a dot of non-toxic paint"],
  ["perch in a lake", "a small fin clip"],
  ["newts in a pond", "a photo of their belly pattern"],
];
const PLANTS = ["daisies", "dandelions", "buttercups", "plantains", "clover plants", "orchids", "thistles"];
const LP_ASSUME = "Assume the population is closed (no births, deaths or migration between samples) and marked animals mix back in at random and are just as likely to be caught.";
const LP_EQ = "`N = (M × C) ÷ R`, where M = number marked first, C = number caught second, R = number of marked animals recaught";

function genEstimates(difficulty, rng) {
  const kind = difficulty === "easy" ? "lp" : difficulty === "medium" ? rng.pick(["lp", "quad"]) : rng.pick(["quad", "lpMulti", "quad"]);
  if (kind === "lp" || kind === "lpMulti") {
    const [who, mark] = rng.pick(ANIMALS);
    let M, C, R;
    if (difficulty === "easy") {
      R = rng.int(2, 12);
      const a = rng.int(2, 8);
      M = R * a;
      C = rng.int(R + 2, 60);
    } else {
      do {
        M = rng.int(20, 150);
        C = rng.int(20, 150);
        R = rng.int(3, Math.min(M, C, 40));
      } while ((M * C) % R === 0 || (2 * M * C) % R === 0);
    }
    const exact = (M * C) / R;
    const d = 0;
    const story = `To estimate a population of ${who}, ecologists catch ${M}, mark them with ${mark} and release them. A week later they catch ${C}, of which ${R} are marked. ${LP_ASSUME}`;
    const given = [{ label: "_M", value: M }, { label: "_C", value: C }, { label: "_R", value: R }];
    if (kind === "lpMulti") {
      const frac = R / C;
      return {
        prompt: story,
        answerType: "multi",
        parts: [
          {
            id: "share", label: "Marked share", ask: `What percentage of the second catch was marked? Round to 2 decimal places.${PCT}`,
            answerType: "number", answer: roundTo(frac * 100, 2), tolerance: 0.005,
            hint: "Divide the marked animals in the second catch by the size of the second catch (`_R / _C`), then turn that fraction into a percentage.",
          },
          {
            id: "pop", label: "Population", ask: "Estimate the population size using the Lincoln–Petersen index. Round to the nearest whole number.",
            answerType: "number", answer: roundTo(exact, 0), tolerance: 0,
            hint: "The marked share of the second catch should equal the marked share of the whole population: `_M / N = _R / _C`. Rearrange for N.",
          },
        ],
        explanation: `**Marked share:** \`${R} ÷ ${C} × 100\` ${resultTxt(frac * 100, 2, "%")}.\n\n**Population:** use ${LP_EQ}.\n\n\`${M} × ${C} ÷ ${R}\` ${resultTxt(exact, 0)}.`,
        given,
        params: { sub: "est", kind: "lpMulti", M, C, R },
      };
    }
    return finish(
      {
        prompt: `${story} Estimate the size of the population.${Number.isInteger(exact) ? "" : R0}`,
        explanation: `Use ${LP_EQ}.\n\n\`${M} × ${C} ÷ ${R}\` ${resultTxt(exact, 0)}.`,
        hints: [`Use the Lincoln–Petersen index: ${LP_EQ}.`, "Multiply the two catch sizes, then divide by the number of marked animals recaught (in the calculator: `_M * _C / _R`)."],
        given,
        params: { sub: "est", kind: "lp", M, C, R },
      },
      exact,
      d,
      [M + C - R, (M * R) / C, (C * R) / M, M * C],
      rng,
      { min: 1 },
    );
  }
  // Quadrats
  const plant = rng.pick(PLANTS);
  const k = rng.int(5, 8);
  const counts = Array.from({ length: k }, () => rng.int(0, difficulty === "hard" ? 15 : 9));
  if (counts.every((c) => c === 0)) counts[0] = 3;
  const sum = counts.reduce((a, b) => a + b, 0);
  const mean = sum / k;
  let qa, qTxt, L, W, area;
  if (difficulty === "medium") {
    qa = 1;
    qTxt = "quadrats (each 1 m × 1 m)";
    L = rng.int(2, 10) * 5;
    W = rng.int(2, 10) * 5;
  } else {
    qa = 0.25;
    qTxt = "quadrats (each 50 cm × 50 cm)";
    L = rng.int(5, 40) * 2;
    W = rng.int(5, 40) * 2;
  }
  area = L * W;
  const exact = (mean / qa) * area;
  const story = `A student places ${k} ${qTxt} at random in a field ${L} m × ${W} m and counts the ${plant} in each: ${counts.join(", ")}.`;
  const giv = [{ label: "_k", value: k }, { label: "_L", value: L }, { label: "_W", value: W }];
  const areaLine = qa === 1 ? "" : `Each quadrat is 0.5 m × 0.5 m = 0.25 m² (not 2500: that is in cm²).\n\n`;
  const expl =
    `Mean per quadrat: \`${sum} ÷ ${k}\` ${resultTxt(mean, 2)}.\n\n${areaLine}` +
    `Field area: \`${L} × ${W}\` = ${area} m², which holds \`${area} ÷ ${qa}\` = ${num(area / qa)} quadrats.\n\n` +
    `Estimate, using the unrounded mean: \`${sum} ÷ ${k} × ${num(area / qa)}\` ${resultTxt(exact, 0)}.`;
  if (difficulty === "hard" && rng.next() < 0.5) {
    return {
      prompt: story,
      answerType: "multi",
      parts: [
        {
          id: "mean", label: "Mean", ask: "What is the mean number per quadrat? Round to 2 decimal places.",
          answerType: "number", answer: roundTo(mean, 2), tolerance: 0.005,
          hint: "Add up all the counts and divide by the number of quadrats (in the calculator, put the total of the counts in a row `_total`, then `_total / _k`).",
        },
        {
          id: "total", label: "Estimate", ask: `Estimate the total number of ${plant} in the field. Use the unrounded mean and round to the nearest whole number.`,
          answerType: "number", answer: roundTo(exact, 0), tolerance: 0,
          hint: "Find the field area in m², then how many 0.25 m² quadrats fit in it (divide by the quadrat area in m², for example in a row `_quadrat`). Multiply that by the mean.",
        },
      ],
      explanation: expl,
      given: giv,
      params: { sub: "est", kind: "quadMulti", counts, qa, L, W },
    };
  }
  return finish(
    {
      prompt: `${story} Estimate the total number of ${plant} in the field.${R0}`,
      explanation: expl,
      hints: [
        "Find the mean number per quadrat: add up the counts and divide by how many quadrats there are. Keep it unrounded.",
        qa === 1
          ? "Each quadrat is 1 m², so the mean is the number per m². Multiply by the field area in m² (in the calculator: put the total of the counts in a row `_total`, then `_total / _k * _L * _W`)."
          : "Each quadrat is 0.5 m × 0.5 m. Work out how many quadrats fit in the field (area ÷ quadrat area, both in m²), then multiply by the mean (in the calculator: put the total of the counts in a row `_total` and the quadrat area in m² in a row `_quadrat`, then `_total / _k * _L * _W / _quadrat`).",
      ],
      given: giv,
      params: { sub: "est", kind: "quad", counts, qa, L, W },
    },
    exact,
    0,
    [mean * area, (mean * area) / 2500, sum * area, (mean / qa) * (L + W) * 2],
    rng,
  );
}

// ---------- Population growth ----------

const POPS = ["rabbits", "deer", "starlings", "grey squirrels", "red kites", "seals", "urban foxes", "badgers"];

function simulate(P0, rate, years) {
  let p = P0;
  for (let y = 0; y < years; y++) p += (p * rate) / 100;
  return p;
}

function genGrowth(difficulty, rng) {
  const who = rng.pick(POPS);
  if (difficulty === "easy") {
    const kind = rng.pick(["double", "change"]);
    if (kind === "double") {
      const P0 = rng.int(2, 60) * 10;
      const T = rng.int(2, 8);
      const n = rng.int(1, 5);
      const exact = P0 * 2 ** n;
      return finish(
        {
          prompt: `A population of ${who} starts at ${P0} and doubles every ${T} years. Assume it keeps doubling at this rate. How big is it after ${n * T} years?`,
          explanation: `\`${n * T} ÷ ${T}\` = ${n} ${n === 1 ? 'doubling' : 'doublings'}.\n\n\`${P0} × 2^${n}\` = **${exact}**.`,
          hints: [`Work out how many doublings fit into ${n * T} years.`, "Double the starting population that many times (in the calculator: `_P0 * 2^(_years / _T)`)."],
          given: [{ label: "_P0", value: P0 }, { label: "_T", value: T }, { label: "_years", value: n * T }],
          params: { sub: "growth", kind: "double", P0, T, years: n * T },
        },
        exact,
        0,
        [P0 * 2 * n, P0 * 2 ** (n + 1), P0 * 2 ** (n - 1), P0 * n * T],
        rng,
      );
    }
    const P0 = rng.int(50, 900);
    const B = rng.int(5, 200), D = rng.int(5, 200);
    const exact = P0 + B - D;
    return finish(
      {
        prompt: `A population of ${who} has ${P0} individuals at the start of a year. During the year there are ${B} births and ${D} deaths, and no animals arrive or leave. How many are there at the end of the year?`,
        explanation: `Population change = births − deaths = \`${B} - ${D}\` = ${B - D}.\n\n\`${P0} ${B - D < 0 ? "-" : "+"} ${Math.abs(B - D)}\` = **${exact}**.`,
        hints: ["Births add to the population and deaths take away from it.", "Start with the first population, add the births and subtract the deaths (in the calculator: `_P0 + _B - _D`)."],
        given: [{ label: "_P0", value: P0 }, { label: "_B", value: B }, { label: "_D", value: D }],
        params: { sub: "growth", kind: "change", P0, B, D },
      },
      exact,
      0,
      [P0 + B + D, P0 - B + D, B - D, P0 + B],
      rng,
    );
  }
  if (difficulty === "medium") {
    const kind = rng.pick(["rate", "compound"]);
    if (kind === "rate") {
      const P0 = rng.int(100, 5000);
      let B, D;
      do {
        B = rng.int(5, Math.round(P0 * 0.3));
        D = rng.int(5, Math.round(P0 * 0.3));
      } while (B === D);
      const exact = ((B - D) / P0) * 100;
      return finish(
        {
          prompt: `A population of ${who} has ${P0} individuals. In one year there are ${B} births and ${D} deaths (no migration). What is the growth rate, as a percentage of the starting population? A falling population has a negative rate.${R2}`,
          explanation: `Growth rate = (births − deaths) ÷ starting population × 100.\n\n\`(${B} - ${D}) ÷ ${P0} × 100\` ${resultTxt(exact, 2, "%")}.`,
          hints: ["Growth rate (%) = (births − deaths) ÷ starting population × 100.", "Work out births − deaths first; it may be negative (in the calculator: `(_B - _D) / _P0 * 100`)."],
          given: [{ label: "_P0", value: P0 }, { label: "_B", value: B }, { label: "_D", value: D }],
          params: { sub: "growth", kind: "rate", P0, B, D },
        },
        exact,
        2,
        [((B + D) / P0) * 100, ((D - B) / P0) * 100, (B / P0) * 100, (B - D) / P0],
        rng,
        { note: PCT, min: -100 },
      );
    }
    const P0 = rng.int(20, 200) * 10;
    const r = rng.int(2, 15);
    const n = rng.int(2, 6);
    const exact = P0 * (1 + r / 100) ** n;
    return finish(
      {
        prompt: `A population of ${who} of ${P0} grows by ${r}% each year. Assume the rate stays the same. How big is it after ${n} years?${R0}`,
        explanation: `Each year multiplies the population by \`1 + ${r}/100\` = ${num(1 + r / 100)}.\n\n\`${P0} × ${num(1 + r / 100)}^${n}\` ${resultTxt(exact, 0)}.`,
        hints: [`Growing by ${r}% means multiplying by ${num(1 + r / 100)} every year.`, "Multiply by that factor once per year (in the calculator: `_P0 * (1 + _r/100)^_n`). Don't just add the same amount each year."],
        given: [{ label: "_P0", value: P0 }, { label: "_r", value: r }, { label: "_n", value: n }],
        params: { sub: "growth", kind: "compound", P0, r, n },
      },
      exact,
      0,
      [P0 * (1 + (r * n) / 100), P0 * (1 + r / 100), P0 * (r / 100) ** n, exact * 1.1],
      rng,
    );
  }
  // hard
  const kind = rng.pick(["years", "perThousand", "multi", "multi"]);
  if (kind === "years") {
    const P0 = rng.int(20, 300) * 10;
    const r = rng.int(3, 25);
    const target = P0 * rng.int(2, 5) + rng.int(1, 9) * 10;
    let years = 0, p = P0;
    while (p < target) { p *= 1 + r / 100; years++; }
    return finish(
      {
        prompt: `A population of ${who} of ${P0} grows by ${r}% a year. Assume the rate stays the same. After how many whole years will it first reach at least ${target}?`,
        explanation:
          `Multiply by ${num(1 + r / 100)} each year until the population reaches ${target}.\n\n` +
          `After ${years - 1} years: ≈ ${num(roundTo(P0 * (1 + r / 100) ** (years - 1), 1))}, not enough. After ${years} years: ≈ ${num(roundTo(P0 * (1 + r / 100) ** years, 1))}, enough. So **${years}** years.`,
        hints: [`Each year multiplies the population by ${num(1 + r / 100)}.`, "Keep multiplying, year by year, until you reach the target (in the calculator, try `_P0 * (1 + _r/100)^_n` with different `_n`). Count the years."],
        given: [{ label: "_P0", value: P0 }, { label: "_r", value: r }, { label: "_target", value: target }],
        params: { sub: "growth", kind: "years", P0, r, target },
      },
      years,
      0,
      [years - 1, years + 1, Math.ceil((target - P0) / ((P0 * r) / 100))],
      rng,
      { min: 1 },
    );
  }
  const P0 = rng.int(100, 900) * 100;
  let b, d;
  do {
    b = rng.int(8, 40);
    d = rng.int(5, 35);
  } while (b === d);
  const n = rng.int(2, 8);
  const rate = (b - d) / 10; // % per year
  const after = P0 * (1 + rate / 100) ** n;
  const story = `A population of ${who} of ${P0} has a birth rate of ${b} per 1000 individuals per year and a death rate of ${d} per 1000 per year. There is no migration, and assume the rates stay the same.`;
  const given = [{ label: "_P0", value: P0 }, { label: "_b", value: b }, { label: "_d", value: d }, { label: "_n", value: n }];
  if (kind === "perThousand") {
    return finish(
      {
        prompt: `${story} What is the population after ${n} years?${R0}`,
        explanation: `Growth rate = \`(${b} - ${d}) ÷ 1000 × 100\` = ${num(rate)}% per year, a factor of ${num(1 + rate / 100)}.\n\n\`${P0} × ${num(1 + rate / 100)}^${n}\` ${resultTxt(after, 0)}.`,
        hints: ["Turn the rates into a yearly growth rate: (births − deaths) per 1000, as a percentage.", "Multiply the population by (1 + rate/100) once per year (in the calculator: `_P0 * (1 + (_b - _d)/1000)^_n`)."],
        given,
        params: { sub: "growth", kind: "perThousand", P0, b, dr: d, n },
      },
      after,
      0,
      [P0 * (1 + (b - d) / 100) ** n, P0 * (1 + (rate * n) / 100), P0 * (1 + rate / 100), after + P0 / 100],
      rng,
    );
  }
  return {
    prompt: story,
    answerType: "multi",
    parts: [
      {
        id: "rate", label: "Growth rate", ask: `What is the growth rate, in % per year? A falling population has a negative rate.${PCT}`,
        answerType: "number", answer: rate, tolerance: 0,
        hint: "Births minus deaths per 1000 individuals, turned into a percentage: `(_b - _d) / 1000 * 100`.",
      },
      {
        id: "after", label: `After ${n} years`, ask: `What is the population after ${n} years? Round to the nearest whole number.`,
        answerType: "number", answer: roundTo(after, 0), tolerance: 0,
        hint: "Put your rate in a row `_rate` and make a yearly multiplier `_factor = (100 + _rate) / 100`. Multiply by it once for every year: `_P0 * _factor^_n`.",
      },
    ],
    explanation: `**Growth rate:** \`(${b} - ${d}) ÷ 1000 × 100\` = **${num(rate)}%**.\n\n**After ${n} years:** \`${P0} × ${num(1 + rate / 100)}^${n}\` ${resultTxt(after, 0)}.`,
    given,
    params: { sub: "growth", kind: "multi", P0, b, dr: d, n },
  };
}

// ---------- Biodiversity ----------

const SPECIES = {
  meadow: ["meadow grass", "clover", "buttercup", "daisy", "dandelion", "yarrow", "plantain", "sorrel"],
  pond: ["water boatman", "pond snail", "mayfly larva", "caddisfly larva", "freshwater shrimp", "leech", "water louse"],
  woodland: ["woodlouse", "centipede", "millipede", "ground beetle", "earthworm", "slug", "spider"],
  shore: ["limpet", "barnacle", "periwinkle", "dog whelk", "beadlet anemone", "shore crab", "top shell"],
};
const HABITAT_NAME = { meadow: "a meadow", pond: "a pond", woodland: "woodland leaf litter", shore: "a rocky shore" };
const SIMPSON = "Simpson's diversity index is `D = 1 − Σ n(n − 1) ÷ (N(N − 1))`, where n is the number of each species and N the total number of individuals. D near 1 means high diversity";

function sample(rng, habitat, nSp, lo, hi) {
  const names = rng.shuffle(SPECIES[habitat]).slice(0, nSp);
  return names.map((name) => ({ name, n: rng.int(lo, hi) }));
}
function simpsonFormula(list) {
  const N = list.reduce((a, s) => a + s.n, 0);
  const top = list.reduce((a, s) => a + s.n * (s.n - 1), 0);
  return { N, top, D: 1 - top / (N * (N - 1)) };
}
const listTxt = (list) => list.map((s) => `${s.name} ${s.n}`).join(", ");

function genBiodiversity(difficulty, rng) {
  const habitat = rng.pick(Object.keys(SPECIES));
  if (difficulty === "easy") {
    const kind = rng.pick(["richness", "cover"]);
    if (kind === "richness") {
      const k = rng.int(3, 5);
      const pool = rng.shuffle(SPECIES[habitat]).slice(0, rng.int(4, 7));
      const quads = Array.from({ length: k }, () => rng.shuffle(pool).slice(0, rng.int(2, 4)));
      const exact = new Set(quads.flat()).size;
      const listed = quads.map((q, i) => `Sample ${i + 1}: ${q.join(", ")}`).join(". ");
      const total = quads.flat().length;
      return finish(
        {
          prompt: `A survey of ${HABITAT_NAME[habitat]} records these species. ${listed}. What is the species richness of the whole survey?`,
          explanation: `Species richness is the number of **different** species. Listing each species once gives ${[...new Set(quads.flat())].join(", ")}: **${exact}**.`,
          hints: ["Species richness counts how many different species there are, not how many records.", "Make a list, adding each species only the first time you see it. Then count your list."],
          params: { sub: "bio", kind: "richness", quads },
        },
        exact,
        0,
        [total, k, exact + 1, exact - 1],
        rng,
        { min: 1 },
      );
    }
    const grid = rng.pick([25, 100]);
    const covered = rng.int(2, grid - 2);
    const plant = rng.pick(["moss", "clover", "grass", "heather", "lichen", "bladder wrack"]);
    const exact = (covered / grid) * 100;
    return finish(
      {
        prompt: `A quadrat is divided into ${grid} equal squares. ${cap(plant)} covers more than half of ${covered} of the squares, so those squares count as covered. What is the percentage cover of ${plant}?`,
        explanation: `Percentage cover = covered squares ÷ total squares × 100.\n\n\`${covered} ÷ ${grid} × 100\` = **${num(exact)}%**.`,
        hints: ["Percentage cover = covered squares ÷ total squares × 100.", grid === 100 ? "With 100 squares, each square is 1% of the quadrat." : "With 25 squares, each square is 4% of the quadrat."],
        // With 100 squares the covered count equals the answer, so no given rows then.
        ...(grid === 25 ? { given: [{ label: "_covered", value: covered }, { label: "_grid", value: grid }] } : {}),
        params: { sub: "bio", kind: "cover", covered, grid },
      },
      exact,
      0,
      [covered, 100 - exact, grid === 25 ? covered * 2 : covered / 2],
      rng,
      { note: PCT, max: 100 },
    );
  }
  if (difficulty === "medium") {
    let list;
    do list = sample(rng, habitat, rng.int(3, 4), 1, 12);
    while (simpsonFormula(list).N < 6);
    const { N, top, D } = simpsonFormula(list);
    return finish(
      {
        prompt: `A sample from ${HABITAT_NAME[habitat]} contains: ${listTxt(list)}. ${SIMPSON}. Calculate D.${R2}`,
        explanation:
          `N = ${list.map((s) => s.n).join(" + ")} = ${N}.\n\n` +
          `Σ n(n − 1) = ${list.map((s) => `${s.n}×${s.n - 1}`).join(" + ")} = ${top}.\n\n` +
          `N(N − 1) = ${N}×${N - 1} = ${N * (N - 1)}.\n\n\`D = 1 - ${top} ÷ ${N * (N - 1)}\` ${resultTxt(D, 2)}.`,
        hints: [
          "Add up all the individuals to get N. Then, for each species, work out n × (n − 1) and add those up.",
          `Divide your total by N × (N − 1) and subtract the result from 1.`,
        ],
        given: list.map((s, i) => ({ label: `_n${i + 1}`, value: s.n })),
        params: { sub: "bio", kind: "simpson", list },
      },
      D,
      2,
      [top / (N * (N - 1)), 1 - list.reduce((a, s) => a + s.n * s.n, 0) / (N * N), D + 0.1, D - 0.1],
      rng,
      { max: 1 },
    );
  }
  // hard
  const kind = rng.pick(["simpson5", "compare", "compare"]);
  if (kind === "simpson5") {
    let list;
    do list = sample(rng, habitat, 5, 1, 20);
    while (simpsonFormula(list).N < 10);
    const { N, top, D } = simpsonFormula(list);
    return finish(
      {
        prompt: `A sample from ${HABITAT_NAME[habitat]} contains: ${listTxt(list)}. ${SIMPSON}. Calculate D.${R2}`,
        explanation: `N = ${N}, Σ n(n − 1) = ${top}, N(N − 1) = ${N * (N - 1)}.\n\n\`D = 1 - ${top} ÷ ${N * (N - 1)}\` ${resultTxt(D, 2)}.`,
        hints: ["Find N (the total) and, for each species, n × (n − 1). Add those products.", "D = 1 − (sum of products) ÷ (N × (N − 1))."],
        given: list.map((s, i) => ({ label: `_n${i + 1}`, value: s.n })),
        params: { sub: "bio", kind: "simpson", list },
      },
      D,
      2,
      [top / (N * (N - 1)), D + 0.05, D - 0.05, D + 0.1],
      rng,
      { max: 1 },
    );
  }
  let A, B, rA, rB;
  for (let t = 0; t < 100; t++) {
    A = sample(rng, habitat, rng.int(3, 4), 1, 15);
    B = sample(rng, habitat, rng.int(3, 4), 1, 15);
    rA = simpsonFormula(A);
    rB = simpsonFormula(B);
    if (rA.N >= 6 && rB.N >= 6 && Math.abs(rA.D - rB.D) >= 0.02) break;
  }
  const more = rA.D > rB.D ? "Site 1" : "Site 2";
  return {
    prompt: `Two sites in ${HABITAT_NAME[habitat]} are sampled. Site 1: ${listTxt(A)}. Site 2: ${listTxt(B)}. ${SIMPSON}.`,
    answerType: "multi",
    parts: [
      {
        id: "s1", label: "Site 1", ask: "Calculate D for site 1. Round to 2 decimal places.",
        answerType: "number", answer: roundTo(rA.D, 2), tolerance: 0.005,
        hint: "Find N for site 1, add up n × (n − 1) for each species, then D = 1 − sum ÷ (N × (N − 1)).",
      },
      {
        id: "s2", label: "Site 2", ask: "Calculate D for site 2. Round to 2 decimal places.",
        answerType: "number", answer: roundTo(rB.D, 2), tolerance: 0.005,
        hint: "Same method with site 2's counts.",
      },
      {
        id: "more", label: "More diverse", ask: "Which site is more diverse?",
        answerType: "choice", answer: more, choices: ["Site 1", "Site 2"],
        hint: "A higher D means higher diversity. Compare your two values.",
      },
    ],
    explanation:
      `**Site 1:** N = ${rA.N}, Σ n(n − 1) = ${rA.top}, \`D = 1 - ${rA.top} ÷ ${rA.N * (rA.N - 1)}\` ${resultTxt(rA.D, 2)}.\n\n` +
      `**Site 2:** N = ${rB.N}, Σ n(n − 1) = ${rB.top}, \`D = 1 - ${rB.top} ÷ ${rB.N * (rB.N - 1)}\` ${resultTxt(rB.D, 2)}.\n\n` +
      `**More diverse:** the higher D is **${more}**.`,
    given: [
      ...A.map((s, i) => ({ label: `_a${i + 1}`, value: s.n })),
      ...B.map((s, i) => ({ label: `_b${i + 1}`, value: s.n })),
    ],
    params: { sub: "bio", kind: "compare", A, B },
  };
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return xGenerate(subtopic, rng);
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const gen = { energy: genEnergy, estimates: genEstimates, growth: genGrowth, biodiversity: genBiodiversity }[subtopic];
  if (!gen) throw new Error(`Unknown subtopic: ${subtopic}`);
  // Redraw (same rng, so still deterministic) the rare question whose own check fails, e.g. an exact
  // rounding tie such as 42.735 to 2 decimal places.
  let q;
  for (let t = 0; t < 20; t++) {
    q = gen(difficulty, rng);
    const own = q.answerType === "multi" ? Object.fromEntries(q.parts.map((x) => [x.id, x.answer])) : q.answer;
    if (verify(q, own)) return q;
  }
  return q;
}

// =====================================================================================
// Independent check.
// =====================================================================================

// Simpson's D by enumerating every unordered pair of individuals: D = P(two picks differ).
function simpsonPairs(list) {
  const ind = [];
  list.forEach((s, i) => { for (let k = 0; k < s.n; k++) ind.push(i); });
  let same = 0, all = 0;
  for (let a = 0; a < ind.length; a++) for (let b = a + 1; b < ind.length; b++) { all++; if (ind[a] === ind[b]) same++; }
  return 1 - same / all;
}

// Returns { num, d, rev } or { str }. `rev(x)` (optional) is a residual-style check instead of num.
function expected(p, partId) {
  switch (p.sub) {
    case "energy": {
      if (p.kind === "eff") return { rev: (x) => Math.abs((p.Ein * x) / 100 - p.Eout) <= (p.Ein * tolFor(p.d)) / 100 + 1e-9 };
      if (p.kind === "rule") {
        // Work back up: x × 10^steps should give E.
        return { rev: (x) => Math.abs(x * (100 / p.pct) ** p.steps - p.E) <= tolFor(p.d) * (100 / p.pct) ** p.steps + 1e-6 };
      }
      if (p.kind === "lost") return { rev: (x) => x + p.Eout === p.Ein };
      if (p.kind === "chain") {
        const f = p.effs.reduce((a, e) => a * (e / 100), 1);
        return { rev: (x) => Math.abs(x / f - p.E1) <= tolFor(p.d) / f + 1e-6 };
      }
      if (p.kind === "overall") return { rev: (x) => Math.abs((x / 100) * p.E1 - p.E4) <= (tolFor(p.d) / 100) * p.E1 + 1e-9 };
      // multi
      if (partId === "first") return { rev: (x) => Math.abs((p.E1 * x) / 100 - p.E2) <= (p.E1 * 0.005) / 100 + 1e-9 };
      if (partId === "second") return { rev: (x) => Math.abs((p.E2 * x) / 100 - p.E3) <= (p.E2 * 0.005) / 100 + 1e-9 };
      return { rev: (x) => Math.abs((x * 100) / p.e3 - p.E3) <= (0.005 * 100) / p.e3 + 1e-9 };
    }
    case "est": {
      if (p.kind === "lp" || (p.kind === "lpMulti" && partId === "pop")) {
        // Cross-multiplied: x × R ≈ M × C, within half a unit of x.
        return { rev: (x) => Number.isInteger(x) && Math.abs(x * p.R - p.M * p.C) <= p.R / 2 + 1e-9 };
      }
      if (p.kind === "lpMulti") return { rev: (x) => Math.abs((x / 100) * p.C - p.R) <= (0.005 / 100) * p.C + 1e-9 };
      // Quadrats via density per m².
      let total = 0;
      for (const c of p.counts) total += c;
      const density = total / (p.counts.length * p.qa);
      if (p.kind === "quadMulti" && partId === "mean") return { num: total / p.counts.length, d: 2 };
      return { num: density * p.L * p.W, d: 0 };
    }
    case "growth": {
      if (p.kind === "double") {
        let x = p.P0;
        for (let t = p.T; t <= p.years; t += p.T) x += x;
        return { num: x, d: 0 };
      }
      if (p.kind === "change") return { rev: (x) => x - p.B + p.D === p.P0 };
      if (p.kind === "rate") return { rev: (x) => Math.abs((x / 100) * p.P0 - (p.B - p.D)) <= (0.005 / 100) * p.P0 + 1e-9 };
      if (p.kind === "compound") return { num: simulate(p.P0, p.r, p.n), d: 0 };
      if (p.kind === "years") {
        let y = 0;
        while (simulate(p.P0, p.r, y) < p.target) y++;
        return { num: y, d: 0 };
      }
      const rate = ((p.b - p.dr) * 100) / 1000;
      if (p.kind === "multi" && partId === "rate") return { num: rate, d: 1 };
      return { num: simulate(p.P0, rate, p.n), d: 0 };
    }
    case "bio": {
      if (p.kind === "richness") {
        const seen = {};
        let n = 0;
        for (const q of p.quads) for (const s of q) if (!seen[s]) { seen[s] = 1; n++; }
        return { num: n, d: 0 };
      }
      if (p.kind === "cover") return { rev: (x) => Math.abs((x * p.grid) / 100 - p.covered) < 1e-9 };
      if (p.kind === "simpson") return { num: simpsonPairs(p.list), d: 2 };
      const a = simpsonPairs(p.A), b = simpsonPairs(p.B);
      if (partId === "s1") return { num: a, d: 2 };
      if (partId === "s2") return { num: b, d: 2 };
      return { str: a > b ? "Site 1" : "Site 2" };
    }
    default:
      return null;
  }
}

// The dp-decimal value next to x (x rounded, or one step either side) that passes the reverse check
// `ok`; NaN if none does. Used so verify agrees with checkAnswer near the edges of the tolerance.
function snapRounded(ok, x, dp) {
  const step = 10 ** -dp, r0 = roundTo(x, dp);
  const pass = [r0, roundTo(r0 - step, dp), roundTo(r0 + step, dp)].filter((R) => ok(R));
  return pass.length === 1 ? pass[0] : NaN; // two passing values: the true value is a rounding tie
}

function matches(exp, answer, q, d) {
  if (!exp || answer === undefined || answer === null || answer === "") return false;
  if (q.answerType === "choice") {
    const ch = q.choices;
    if (!Array.isArray(ch) || ch.length < 2 || new Set(ch).size !== ch.length || !ch.includes(String(answer))) return false;
  }
  if (exp.str !== undefined) return String(answer) === exp.str;
  const x = Number(String(answer).trim());
  if (!Number.isFinite(x)) return false;
  const dd = exp.d !== undefined ? exp.d : d;
  if (exp.rev) {
    // A rounded answer is compared with the rounded value the question asks for, as checkAnswer does:
    // find that value R next to x (the reverse check holds for it), then x must be within the tolerance of R.
    const tol = q.tolerance > 0 ? q.tolerance : tolFor(dd);
    if (!(tol > 0)) return exp.rev(x);
    const R = snapRounded(exp.rev, x, Math.round(-Math.log10(2 * tol)));
    return Number.isFinite(R) && Math.abs(x - R) <= tol + 1e-9;
  }
  return Math.abs(x - roundTo(exp.num, dd)) <= tolFor(dd) + 1e-9;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (p.expert) return xVerify(question, answer);
  if (question.answerType === "multi") {
    if (!answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
    return question.parts.every((part) => matches(expected(p, part.id), answer[part.id], part, part.tolerance === 0.005 ? 2 : 0));
  }
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
  }
  return matches(expected(p), answer, question, p.d);
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
    // Compare with the rounded value the part asks for (as checkAnswer does), not the unrounded one.
    const h = 0.5 * 10 ** -spec.dp;
    const R = snapRounded((r) => fn(v, r, h) === true, x, spec.dp);
    return Number.isFinite(R) && Math.abs(x - R) <= h + 1e-9;
  };
  if (question.answerType === "multi") {
    if (!Array.isArray(question.parts) || !Array.isArray(p.parts) || p.parts.length !== question.parts.length) return false;
    if (!answer || typeof answer !== "object") return false;
    return p.parts.every((spec, i) => spec.id === question.parts[i].id && one(spec, answer[spec.id], question.parts[i]));
  }
  return one(p, answer, question);
}

// =====================================================================================
// Expert questions. Each part's check works the other way round from the generator: back up the
// food chain, cross-multiplying, year-by-year simulation, or enumerating pairs of individuals.
// =====================================================================================

const big = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const X_TOPS = [
  { chain: ["grassland plants", "rabbits", "stoats", "golden eagles"], top: "golden eagle" },
  { chain: ["meadow plants", "voles", "weasels", "barn owls"], top: "barn owl" },
  { chain: ["oak leaves", "caterpillars", "blue tits", "sparrowhawks"], top: "sparrowhawk" },
  { chain: ["grass", "grasshoppers", "shrews", "kestrels"], top: "kestrel" },
  { chain: ["heather", "beetles", "lizards", "hen harriers"], top: "hen harrier" },
];

// Energy, expert 1: work backwards from what one top predator needs to the area of habitat it takes,
// then how many a reserve can support (round down).
function xEnergyArea(rng) {
  const t = rng.pick(X_TOPS);
  const ch = t.chain;
  const E = rng.int(20, 300) * 1000; // kJ per predator per year
  const e = [rng.int(5, 20), rng.int(5, 20), rng.int(5, 20)];
  const P = rng.int(5, 40) * 1000; // kJ/m²/year fixed by producers
  const f = (e[0] / 100) * (e[1] / 100) * (e[2] / 100);
  const need = E / f; // kJ of producer energy per year
  const area = need / P / 10000; // hectares
  const R = rng.int(20, 2000);
  const nExact = R / area;
  if (Math.abs(nExact - Math.round(nExact)) < 1e-6 || nExact < 1) throw new XRetry();
  const n = Math.floor(nExact);
  if (Math.floor(R / xRound(area, 2)) !== n) throw new XRetry();
  const values = { E, e, P, R };
  return xMulti(
    `In the food chain ${ch.join(" → ")}, the transfer efficiencies are ${e[0]}% (${ch[0]} → ${ch[1]}), ${e[1]}% (${ch[1]} → ${ch[2]}) and ${e[2]}% (${ch[2]} → ${ch[3]}). One ${t.top} needs ${big(E)} kJ of energy a year from its food. The producers fix ${big(P)} kJ/m²/year. 1 hectare = 10 000 m².`,
    [
      xNum("producer", "Producer energy", `How much energy must the producers fix each year to support one ${t.top}, in kJ?`, need, 0,
        "Work backwards up the chain: at each step, divide by the efficiency (as a decimal).", "en-need"),
      xNum("area", "Area", `What area of habitat does one ${t.top} need, in hectares?`, area, 2,
        `Each m² gives ${big(P)} kJ a year. Area = energy needed ÷ energy per m², then ÷ 10 000 for hectares.`, "en-area"),
      xInt("reserve", "Reserve", `A reserve of ${big(R)} hectares has the same habitat throughout. How many ${t.top}s could it support at most?`, n,
        "Divide the reserve by the area one bird needs. Can you have part of a bird?", "en-reserve"),
    ],
    [
      `Only ${e[0]}% × ${e[1]}% × ${e[2]}% of the producers' energy reaches the top: \`${e[0] / 100} × ${e[1] / 100} × ${e[2] / 100}\` = ${Number(f.toPrecision(6))}.`,
      `Producer energy: \`${E} / ${Number(f.toPrecision(6))}\` ${xRes(need, 0, "kJ")}. In the calculator: \`_E / (_e1 / 100 * _e2 / 100 * _e3 / 100)\`.`,
      `Area: \`${num(roundTo(need, 4))} / ${P} / 10000\` ${xRes(area, 2, "ha")}.`,
      `Reserve: \`${R} / ${Number(area.toPrecision(7))}\` = ${Number(nExact.toPrecision(6))}. A fraction of a bird can't live there, so round **down**: **${n}**.`,
    ],
    values,
    [xG("_E", E), xG("_e1", e[0]), xG("_e2", e[1]), xG("_e3", e[2]), xG("_P", P), xG("_R", R)],
    [
      "Going down a food chain you multiply by each efficiency; going back up you divide by it.",
      "Once you know the producer energy needed each year, the energy fixed per m² turns it into an area.",
      "For the reserve, think about whether to round the number of animals up or down.",
    ],
  );
}

const X_CONSUMERS = ["A caterpillar population", "A herd of deer", "A colony of grasshoppers", "A population of slugs", "A flock of sheep", "A group of rabbits", "A population of aphids"];

// Energy, expert 2: what happens to the energy a consumer eats (faeces, respiration, new biomass),
// forwards or working back from the production efficiency.
function xEnergyBudget(rng) {
  const who = rng.pick(X_CONSUMERS);
  const I = rng.int(50, 500) * 10;
  const F = Math.round(I * rng.int(20, 60) / 100);
  const R = Math.round((I - F) * rng.int(50, 90) / 100);
  const G = I - F - R;
  const back = rng.next() < 0.5;
  const absorbed = ((I - F) / I) * 100;
  const prodPct = (G / I) * 100;
  if (back) {
    // State the production efficiency (to 1 dp) instead of R.
    const pe = Math.round(prodPct * 10) / 10;
    const Gb = (pe / 100) * I;
    const Rb = I - F - Gb;
    const values = { mode: "back", I, F, pe };
    return xMulti(
      `${who} eats ${I} kJ/m²/year of plant food. ${F} kJ/m²/year leaves in faeces. ${num(pe)}% of the energy eaten ends up as new biomass (growth and reproduction). The rest of the absorbed energy is used in respiration.`,
      [
        xNum("absorbed", "Absorbed", "What percentage of the energy eaten is absorbed into the body? (Type the number without the % sign.)", absorbed, 2,
          "Absorbed = eaten - faeces.", "eb-abs"),
        xNum("growth", "New biomass", "How much energy goes into new biomass, in kJ/m²/year?", Gb, 2,
          "Take the stated percentage of the energy eaten.", "eb-G"),
        xNum("resp", "Respiration", "How much energy is used in respiration, in kJ/m²/year?", Rb, 2,
          "Everything eaten goes to faeces, respiration or new biomass. Subtract the other two.", "eb-R"),
      ],
      [
        "Energy eaten = energy in faeces + energy used in respiration + energy in new biomass.",
        `Absorbed: \`(${I} - ${F}) / ${I} × 100\` ${xRes(absorbed, 2, "%")}.`,
        `New biomass: \`${num(pe)} / 100 × ${I}\` ${xRes(Gb, 2, "kJ/m²/year")}.`,
        `Respiration: \`${I} - ${F} - ${num(roundTo(Gb, 4))}\` ${xRes(Rb, 2, "kJ/m²/year")}. Most absorbed energy is respired, which is why so little passes up the chain.`,
      ],
      values,
      [xG("_I", I), xG("_F", F), xG("_pe", pe)],
      [
        "Sketch where the eaten energy goes: some is never absorbed (faeces), and of the absorbed energy, some is respired and the rest builds new biomass.",
        "New biomass is the stated percentage of the energy eaten. Respiration is whatever is left after faeces and new biomass.",
      ],
    );
  }
  const values = { mode: "fwd", I, F, R };
  return xMulti(
    `${who} eats ${I} kJ/m²/year of plant food. ${F} kJ/m²/year leaves in faeces and ${R} kJ/m²/year is used in respiration. The rest becomes new biomass (growth and reproduction).`,
    [
      xNum("absorbed", "Absorbed", "What percentage of the energy eaten is absorbed into the body? (Type the number without the % sign.)", absorbed, 2,
        "Absorbed = eaten - faeces.", "eb-abs"),
      xNum("growth", "New biomass", "How much energy becomes new biomass, in kJ/m²/year?", G, 0,
        "Eaten = faeces + respiration + new biomass.", "eb-Gf"),
      xNum("prod", "Production", "What percentage of the energy eaten becomes new biomass? (Type the number without the % sign.)", prodPct, 2,
        "New biomass ÷ energy eaten × 100. This is the energy available to the next trophic level.", "eb-prod"),
    ],
    [
      "Energy eaten = energy in faeces + energy used in respiration + energy in new biomass.",
      `Absorbed: \`(${I} - ${F}) / ${I} × 100\` ${xRes(absorbed, 2, "%")}.`,
      `New biomass: \`${I} - ${F} - ${R}\` = **${G}** kJ/m²/year.`,
      `Production: \`${G} / ${I} × 100\` ${xRes(prodPct, 2, "%")}. Only this share can be passed on to the next trophic level.`,
    ],
    values,
    [xG("_I", I), xG("_F", F), xG("_R", R)],
    [
      "Sketch where the eaten energy goes: faeces (never absorbed), respiration, and what is left builds new biomass.",
      "Percentages are always of the energy eaten here: part ÷ eaten × 100.",
    ],
  );
}

// Estimates, expert 1: mark-recapture where some marked animals died before the second sample.
function xEstimateDeaths(rng) {
  const [who, mark] = rng.pick(ANIMALS);
  const M = rng.int(20, 120);
  const dead = rng.int(2, Math.max(3, Math.floor(M / 4)));
  const C = rng.int(30, 150);
  const R = rng.int(3, Math.max(4, Math.min(C - 1, Math.floor((M - dead) * 0.8))));
  const naive = (M * C) / R;
  const fixd = ((M - dead) * C) / R;
  const happy = rng.next() < 0.5;
  if (xTie(naive, 0) || xTie(fixd, 0)) throw new XRetry();
  const values = { M, dead, C, R, happy };
  return xMulti(
    `Ecologists catch ${M} ${who}, mark them with ${mark} and release them. Before the second sample, ${dead} of the marked animals are found dead (and removed). The second sample catches ${C} ${who}, of which ${R} are marked. ${LP_EQ}.`,
    [
      xNum("naive", "Ignoring deaths", "What population estimate do you get if you ignore the deaths?", naive, 0,
        "Use the formula with the number originally marked.", "ld-naive"),
      xNum("fixed", "Corrected", "What is the estimate once the dead marked animals are allowed for?", fixd, 0,
        "Only the marked animals still alive could be recaught: use that number for M.", "ld-fixed"),
      happy
        ? xPick("bias", "Another problem", "Suppose instead that no marked animals died, but marked animals were more likely to be caught again than unmarked ones (trap-happy). Would the estimate then be too high or too low?", "too low", ["too high", "too low"],
          "Trap-happy animals make R bigger than it should be. What does a bigger R do to M × C ÷ R?", "ld-bias")
        : xPick("bias", "Direction", "So ignoring the deaths makes the estimate...", "too high", ["too high", "too low"],
          "Compare your two estimates. Which one used too many marked animals?", "ld-bias"),
    ],
    [
      `Ignoring deaths: \`${M} × ${C} / ${R}\` ${xRes(naive, 0, "")}.`,
      `Only ${M} - ${dead} = ${M - dead} marked animals were still out there: \`${M - dead} × ${C} / ${R}\` ${xRes(fixd, 0, "")}. In the calculator: \`(_M - _dead) * _C / _R\`.`,
      happy
        ? "Ignoring the deaths assumes more marked animals were available than really were, so it overestimates. Trap-happy marked animals do the opposite: too many marked ones are recaught, R is too big, and the estimate is **too low**."
        : "Ignoring the deaths assumes more marked animals were available to catch than really were, so the estimate is **too high**.",
    ],
    values,
    [xG("_M", M), xG("_dead", dead), xG("_C", C), xG("_R", R)],
    [
      "Lincoln–Petersen assumes the marked animals are still in the population, mixed in at random.",
      "If some marked animals died, the true number of marked animals available is smaller. Put that into the formula.",
      "Compare the estimates to see which way the mistake pushes the answer.",
    ],
  );
}

// Estimates, expert 2: plan a mark-recapture study backwards (how many to mark), then run it.
function xEstimatePlan(rng) {
  const [who, mark] = rng.pick(ANIMALS);
  const Ng = rng.int(10, 120) * 10;
  const C = rng.int(30, 150);
  const want = rng.int(5, 20);
  const mExact = (want * Ng) / C;
  if (Math.abs(mExact - Math.round(mExact)) < 1e-9 || mExact >= Ng / 2) throw new XRetry();
  const Mmin = Math.ceil(mExact);
  const M = Mmin + rng.int(0, 10);
  const R = Math.max(1, Math.round((M * C / Ng) * (1 + rng.int(-25, 25) / 100)));
  const est = (M * C) / R;
  if (xTie(est, 0) || R >= C) throw new XRetry();
  const values = { Ng, C, want, M, R };
  return xMulti(
    `Ecologists think a site holds about ${big(Ng)} ${who}. They plan to mark some with ${mark}, then catch ${C} in a second sample, and they want to expect at least ${want} marked animals in that sample. ${LP_ASSUME} ${LP_EQ}.`,
    [
      xInt("mark", "Plan", "What is the smallest number they should mark?", Mmin,
        `In the second sample, the expected share that is marked equals the share of the whole population that is marked: M ÷ ${big(Ng)}.`, "lp-plan"),
      xNum("est", "Result", `They actually mark ${M}, and the second sample of ${C} contains ${R} marked animals. What is the population estimate?`, est, 0,
        "Now use the formula with the real numbers.", "lp-est"),
    ],
    [
      `Expected marked in the second sample: \`M × ${C} / ${Ng}\`. We need \`M × ${C} / ${Ng} ≥ ${want}\`, so \`M ≥ ${want} × ${Ng} / ${C}\` = ${Number(mExact.toPrecision(6))}. M must be a whole number, so round **up**: **${Mmin}**.`,
      `Estimate: \`${M} × ${C} / ${R}\` ${xRes(est, 0, "")}. In the calculator: \`_M * _C / _R\`.`,
    ],
    values,
    [xG("_Ng", Ng), xG("_C", C), xG("_want", want)],
    [
      "Run the formula backwards: in the second sample, the fraction of marked animals should match the fraction marked in the whole population.",
      "Rearrange for M and decide which way to round (you need *at least* the target).",
      "For the real result, use M × C ÷ R as usual.",
    ],
  );
}

// Growth, expert 1: work backwards to the yearly rate from two counts, then forwards to a target.
function xGrowthRate(rng) {
  const who = rng.pick(POPS);
  const P0 = rng.int(20, 400) * 5;
  const n = rng.int(2, 8);
  const r0 = rng.int(20, 250) / 10;
  const Pn = Math.round(P0 * (1 + r0 / 100) ** n);
  const r = ((Pn / P0) ** (1 / n) - 1) * 100;
  const target = Math.round(Pn * rng.int(150, 400) / 100);
  const g = Math.log(target / Pn) / Math.log(1 + r / 100);
  if (Math.abs(g - Math.round(g)) < 1e-6 || r <= 0) throw new XRetry();
  const yrs = Math.ceil(g);
  const values = { P0, Pn, n, target };
  return xMulti(
    `A population of ${who} grew from ${big(P0)} to ${big(Pn)} in ${n} years, growing by the same percentage each year.`,
    [
      xNum("rate", "Yearly rate", "What was the yearly growth rate, as a percentage? (Type the number without the % sign.)", r, 2,
        `Each year multiplies the population by the same factor. ${n} years multiply it by ${big(Pn)} ÷ ${big(P0)}.`, "gr-rate"),
      xInt("years", "Target", `If it keeps growing at that (unrounded) rate, how many more whole years until it first reaches at least ${big(target)}?`, yrs,
        "Multiply by the yearly factor one year at a time from the latest count, and count the years until you reach the target.", "gr-years"),
    ],
    [
      `Yearly factor: \`(${Pn} / ${P0})^(1/${n})\` = ${Number((1 + r / 100).toPrecision(8))}. Rate: \`(factor - 1) × 100\` ${xRes(r, 2, "%")}. In the calculator: \`((_Pn / _P0)^(1 / _n) - 1) * 100\`.`,
      `From ${Pn}, multiply by the factor each year. You need \`${Pn} × factor^y ≥ ${target}\`, so \`y ≥ ln(${target} / ${Pn}) / ln(factor)\` = ${Number(g.toPrecision(6))}. Round **up**: **${yrs}** years.`,
    ],
    values,
    [xG("_P0", P0), xG("_Pn", Pn), xG("_n", n), xG("_target", target)],
    [
      `Write the growth as \`${P0} × factor^${n} = ${Pn}\`. Undo the power by taking the ${n === 2 ? "square" : n === 3 ? "cube" : `${n}th`} root.`,
      "The rate is (factor - 1) × 100. Keep the unrounded factor for the next part.",
      "For the target, either multiply year by year or use logs: y = ln(target ÷ now) ÷ ln(factor), then round up to whole years.",
    ],
  );
}

// Growth, expert 2: growth with a fixed yearly harvest; the sustainable harvest; doubling time.
function xGrowthHarvest(rng) {
  const who = rng.pick(POPS);
  const r = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25]);
  const P0 = rng.int(10, 200) * 20;
  const Hs = (P0 * r) / 100;
  if (!Number.isInteger(Hs)) throw new XRetry();
  let H = Math.round(Hs * rng.int(50, 150) / 100);
  if (H === Hs) H += 1;
  let P = P0;
  for (let y = 0; y < 3; y++) P = P * (1 + r / 100) - H;
  if (P <= 0) throw new XRetry();
  const dbl = Math.log(2) / Math.log(1 + r / 100);
  const values = { P0, r, H };
  return xMulti(
    `A population of ${big(P0)} ${who} grows by ${r}% a year (births minus deaths). At the end of each year, after that growth, ${H} animals are removed (culled or moved elsewhere).`,
    [
      xNum("three", "After 3 years", "How many are there after 3 years? Don't round between years.", P, 0,
        "Each year: multiply by the growth factor, then subtract the number removed. Repeat three times.", "hv-three"),
      xNum("steady", "Steady", "How many would have to be removed each year to keep the population at exactly its starting size?", Hs, 0,
        "The population stays the same if the number removed equals one year's growth.", "hv-steady"),
      xNum("double", "Doubling time", "With no removals at all, how many years would the population take to double?", dbl, 2,
        "You need factor^t = 2, so t = ln 2 ÷ ln(factor).", "hv-double"),
    ],
    [
      `Each year: \`P → P × ${1 + r / 100} - ${H}\`. Year 1: ${num(roundTo(P0 * (1 + r / 100) - H, 4))}. Repeating twice more ${xRes(P, 0, "")}.`,
      `Steady: removals = one year's growth = \`${r}% × ${P0}\` = **${Hs}**. ${H > Hs ? "Removing more than this makes the population shrink; removing fewer lets it grow." : "Removing fewer than this lets the population grow; removing more makes it shrink."}`,
      `Doubling: \`ln 2 / ln ${1 + r / 100}\` ${xRes(dbl, 2, "years")}. In the calculator: \`ln(2) / ln(1 + _r / 100)\`.`,
    ],
    values,
    [xG("_P0", P0), xG("_r", r), xG("_H", H)],
    [
      `Do it year by year: growth first (× ${1 + r / 100}), then subtract the ${H} removed.`,
      "A population stays level when the number added each year equals the number taken away.",
      "Doubling needs (growth factor)^t = 2. Take logs to solve for t.",
    ],
  );
}

// Even split of N individuals over k species (counts differ by at most 1).
const xEven = (N, k) => Array.from({ length: k }, (_, i) => Math.floor(N / k) + (i < N % k ? 1 : 0));
const xSimpson = (counts) => {
  const N = counts.reduce((a, b) => a + b, 0);
  return 1 - counts.reduce((a, n) => a + n * (n - 1), 0) / (N * (N - 1));
};

// Biodiversity, expert 1: D for a sample, the most even sample with the same totals, and evenness.
function xBioEvenness(rng) {
  const habitat = rng.pick(Object.keys(SPECIES));
  const k = rng.int(3, 5);
  const names = rng.shuffle(SPECIES[habitat]).slice(0, k);
  const counts = names.map(() => rng.int(1, 15));
  const N = counts.reduce((a, b) => a + b, 0);
  const D = xSimpson(counts);
  const even = xEven(N, k);
  const Dmax = xSimpson(even);
  if (Dmax - D < 0.01) throw new XRetry();
  const E = D / Dmax;
  const list = names.map((name, i) => ({ name, n: counts[i] }));
  const values = { counts };
  return xMulti(
    `A sample from ${HABITAT_NAME[habitat]} contains: ${listTxt(list)}. ${SIMPSON}.`,
    [
      xNum("D", "D", "Calculate D for this sample.", D, 3,
        "Work out n(n - 1) for each species, add them, divide by N(N - 1), and subtract from 1.", "sd-D"),
      xNum("Dmax", "Most even", `Keep the same ${N} individuals and ${k} species, but share them out as evenly as possible. What would D be then?`, Dmax, 3,
        `${N} ÷ ${k} ${N % k === 0 ? "divides exactly" : "doesn't divide exactly, so some species get one more than others"}.`, "sd-max"),
      xNum("E", "Evenness", "Evenness = D ÷ (the most even D). What is the evenness of the real sample?", E, 2,
        "Divide the first answer by the second, using unrounded values. 1 means perfectly even.", "sd-E"),
    ],
    [
      `N = ${N}. \`Σ n(n - 1)\` = ${counts.map((n) => `${n}×${n - 1}`).join(" + ")} = ${counts.reduce((a, n) => a + n * (n - 1), 0)}. \`D = 1 - ${counts.reduce((a, n) => a + n * (n - 1), 0)} / (${N} × ${N - 1})\` ${xRes(D, 3, "")}.`,
      `Most even split: ${even.join(", ")}. \`Σ n(n - 1)\` = ${even.reduce((a, n) => a + n * (n - 1), 0)}, so \`D = 1 - ${even.reduce((a, n) => a + n * (n - 1), 0)} / (${N} × ${N - 1})\` ${xRes(Dmax, 3, "")}. With a fixed N and number of species, this is the highest D possible.`,
      `Evenness: \`${Number(D.toPrecision(6))} / ${Number(Dmax.toPrecision(6))}\` ${xRes(E, 2, "")}.`,
    ],
    values,
    names.map((nm, i) => xG(`_n${i + 1}`, counts[i])),
    [
      "Simpson's D depends on both how many species there are and how evenly the individuals are shared between them.",
      "For the most even sample, share the total out so the species' counts differ by at most 1, then use the same formula.",
      "Evenness compares the real D with that best possible D.",
    ],
  );
}

// Biodiversity, expert 2: a two-species sample, worked backwards from D to the counts.
function xBioBackwards(rng) {
  const habitat = rng.pick(Object.keys(SPECIES));
  const [a, b] = rng.shuffle(SPECIES[habitat]).slice(0, 2);
  const N = rng.int(12, 80);
  const big1 = rng.int(Math.floor(N / 2) + 1, N - 1);
  const D = xSimpson([big1, N - big1]);
  const Ds = roundTo(D, 4);
  // The 4-dp value must pin down a single split.
  const hits = [];
  for (let m = Math.ceil(N / 2); m < N; m++) if (Math.abs(roundTo(xSimpson([m, N - m]), 4) - Ds) < 1e-12) hits.push(m);
  if (hits.length !== 1 || 2 * big1 === N) throw new XRetry();
  const up = xSimpson([big1, N - big1 + 1]) > D;
  const values = { N, Ds };
  return xMulti(
    `A sample from ${HABITAT_NAME[habitat]} contains only two species, ${a} and ${b}: ${N} individuals in all, with more ${a} than ${b}. Simpson's index for the sample is D = ${num(Ds)} (to 4 decimal places). ${SIMPSON}.`,
    [
      xInt("big", "Count", `How many ${a} are in the sample?`, big1,
        "With two species, n and N - n. Try values of n (more than half of N) in the formula until D matches.", "sb-n"),
      xPick("change", "One more", `If one more ${b} were added to the sample, would D go up or down?`, up ? "up" : "down", ["up", "down"],
        `Adding to the rarer species makes the two counts more even.`, "sb-up"),
    ],
    [
      `For two species: \`D = 1 - (n(n - 1) + (N - n)(N - n - 1)) / (N(N - 1))\` with N = ${N}.`,
      `Trying values of n above ${Math.floor(N / 2)}: only n = ${big1} gives ${num(Ds)}. So there are **${big1}** ${a} and ${N - big1} ${b}.`,
      `Adding one ${b} (${big1} and ${N - big1 + 1}) gives D = ${num(roundTo(xSimpson([big1, N - big1 + 1]), 4))}: D goes **${up ? "up" : "down"}**, because the sample becomes ${up ? "more" : "less"} even.`,
    ],
    values,
    [xG("_N", N), xG("_D", Ds)],
    [
      "With only two species, the counts are n and N - n. The more common species has n above N ÷ 2.",
      "Put trial values of n into the formula (the calculator helps) and find the one that gives the stated D.",
      "For the last part, recompute D with the new counts and compare.",
    ],
  );
}

function xGenerate(subtopic, rng) {
  if (subtopic === "energy") return xRun(rng.next() < 0.5 ? xEnergyArea : xEnergyBudget, rng);
  if (subtopic === "estimates") return xRun(rng.next() < 0.55 ? xEstimateDeaths : xEstimatePlan, rng);
  if (subtopic === "growth") return xRun(rng.next() < 0.5 ? xGrowthRate : xGrowthHarvest, rng);
  if (subtopic === "biodiversity") return xRun(rng.next() < 0.55 ? xBioEvenness : xBioBackwards, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Year-by-year population with a fixed removal after the growth.
function xHarvest(P0, r, H, years) {
  let p = P0;
  for (let y = 0; y < years; y++) p = p + (p * r) / 100 - H;
  return p;
}
// Pair counting for Simpson's D (probability that two different individuals are different species).
const xPairsD = (counts) => simpsonPairs(counts.map((n) => ({ n })));

const X_CHECKS = {
  // Back down the chain: producer energy × efficiencies must equal the predator's need.
  "en-need": (v, x, h) => xBracket((P) => P * (v.e[0] / 100) * (v.e[1] / 100) * (v.e[2] / 100) - v.E, x, h),
  "en-area": (v, x, h) => xBracket((ha) => ha * 10000 * v.P * (v.e[0] / 100) * (v.e[1] / 100) * (v.e[2] / 100) - v.E, x, h),
  // n birds fit, n + 1 don't.
  "en-reserve": (v, x) => {
    const perBird = v.E / ((v.e[0] / 100) * (v.e[1] / 100) * (v.e[2] / 100)) / v.P / 10000;
    return x >= 1 && x * perBird <= v.R && (x + 1) * perBird > v.R;
  },
  "eb-abs": (v, x, h) => xBracket((pc) => (pc / 100) * v.I + v.F - v.I, x, h),
  "eb-G": (v, x, h) => xBracket((G) => (G / v.I) * 100 - v.pe, x, h),
  "eb-R": (v, x, h) => xBracket((R) => v.F + R + (v.pe / 100) * v.I - v.I, x, h),
  "eb-Gf": (v, x, h) => xBracket((G) => v.F + v.R + G - v.I, x, h),
  "eb-prod": (v, x, h) => xBracket((pc) => (pc / 100) * v.I + v.F + v.R - v.I, x, h),
  // Cross-multiplied Lincoln-Petersen: x × R = M × C.
  "ld-naive": (v, x, h) => xBracket((N) => N * v.R - v.M * v.C, x, h),
  "ld-fixed": (v, x, h) => xBracket((N) => N * v.R - (v.M - v.dead) * v.C, x, h),
  "ld-bias": (v, a) => {
    // Compare the estimate the flawed data give with the one the true situation would give.
    const flawed = v.happy ? (v.M * v.C) / (v.R * 1.2) : (v.M * v.C) / v.R;
    const truth = v.happy ? (v.M * v.C) / v.R : ((v.M - v.dead) * v.C) / v.R;
    return a === (flawed > truth ? "too high" : "too low");
  },
  // Smallest M whose expected recapture reaches the target; one fewer must fall short.
  "lp-plan": (v, x) => x >= 1 && (x * v.C) / v.Ng >= v.want && ((x - 1) * v.C) / v.Ng < v.want,
  "lp-est": (v, x, h) => xBracket((N) => N * v.R - v.M * v.C, x, h),
  "gr-rate": (v, x, h) => xBracket((r) => v.P0 * (1 + r / 100) ** v.n - v.Pn, x, h),
  // Simulate with the exact rate (bisection on the stated counts), year by year from Pn.
  "gr-years": (v, x) => {
    let lo = -50, hi = 200;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (v.P0 * (1 + mid / 100) ** v.n < v.Pn) lo = mid; else hi = mid; }
    const r = (lo + hi) / 2;
    let p = v.Pn, y = 0;
    while (p < v.target && y < 10000) { p += (p * r) / 100; y++; }
    return x === y;
  },
  "hv-three": (v, x, h) => xBracket((P) => P - xHarvest(v.P0, v.r, v.H, 3), x, h),
  "hv-steady": (v, x, h) => xBracket((H) => xHarvest(v.P0, v.r, H, 1) - v.P0, x, h),
  "hv-double": (v, x, h) => xBracket((t) => (1 + v.r / 100) ** t - 2, x, h),
  "sd-D": (v, x, h) => xBracket((D) => D - xPairsD(v.counts), x, h),
  // Most even: search every split of N over k species for the highest D (by pair counting).
  "sd-max": (v, x, h) => xBracket((D) => D - xBestD(v.counts), x, h),
  "sd-E": (v, x, h) => xBracket((E) => E - xPairsD(v.counts) / xBestD(v.counts), x, h),
  "sb-n": (v, x) => {
    if (!(x > v.N / 2 && x < v.N)) return false;
    const ok = [];
    for (let m = Math.ceil(v.N / 2); m < v.N; m++) if (Math.abs(roundTo(xPairsD([m, v.N - m]), 4) - v.Ds) < 1e-12) ok.push(m);
    return ok.length === 1 && ok[0] === x;
  },
  "sb-up": (v, a) => {
    let m = -1;
    for (let k = Math.ceil(v.N / 2); k < v.N; k++) if (Math.abs(roundTo(xPairsD([k, v.N - k]), 4) - v.Ds) < 1e-12) m = k;
    if (m < 0) return false;
    return xPairsD([m, v.N - m + 1]) > xPairsD([m, v.N - m]) ? a === "up" : a === "down";
  },
};
// Brute force over all splits of N individuals into k non-empty species groups.
function xBestD(counts) {
  const N = counts.reduce((a, b) => a + b, 0);
  const k = counts.length;
  let best = 0;
  const rec = (left, slots, acc) => {
    if (slots === 1) {
      if (left >= 1) {
        const all = [...acc, left];
        best = Math.max(best, 1 - all.reduce((a, n) => a + n * (n - 1), 0) / (N * (N - 1)));
      }
      return;
    }
    for (let n = 1; n <= left - (slots - 1); n++) {
      if (acc.length && n < acc[acc.length - 1]) continue; // non-decreasing, avoids repeats
      rec(left - n, slots - 1, [...acc, n]);
    }
  };
  rec(N, k, []);
  return best;
}
