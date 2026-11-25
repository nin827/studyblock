// Forces & Energy generator. Uses only the seeded rng passed in by the engine.
// SI units (kg, m, s, N, J, W, kg m/s). Medium and hard questions sometimes state a value in another
// unit (g, km/h, minutes, kJ, km, kN, ms) or ask for the answer in one, so a conversion is part of the work.
// Easy/medium answers are whole numbers; hard answers are rounded to 2 decimal places (tolerance 0.005),
// matching the Kinematics module.

const G = 9.8; // N/kg, stated in every question that uses it

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
// Display values: strip binary noise (e.g. 3.6 * 7 = 25.200000000000003).
const fix = (n) => Math.round(n * 1e6) / 1e6;
// Whole-number answers: snap tiny binary error to the integer.
const clean = (n) => (Math.abs(n - Math.round(n)) < 1e-7 ? Math.round(n) : n);

// Answer/choice formatter: whole numbers as-is, rounded answers with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

// Given values and intermediate steps: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// "a 8 kg box" -> "an 8 kg box" (eight, eleven, eighteen, eighty... start with a vowel sound).
function articles(text) {
  return text.replace(/\b([Aa]n?) (\d+)/g, (all, art, digits) => {
    const vowel = digits[0] === "8" || (digits.length % 3 === 2 && /^1[18]/.test(digits));
    const word = vowel ? "an" : "a";
    return `${art[0] === "A" ? cap(word) : word} ${digits}`;
  });
}
const DP = " Round to 2 decimal places.";
const THEN = " Then round to 2 decimal places.";

// ---------------------------------------------------------------------------------------------
// Units. A value stated in a non-SI unit keeps that number in the prompt and in its calculator row,
// whose label gets a unit suffix (_m_g, _v_kmh, _t_min, _E_kJ ...). The hint shows the conversion.

const CONV = {
  g: { si: "kg", f: 1 / 1000, suffix: "g", calc: "/ 1000", how: "divide by 1000" },
  "km/h": { si: "m/s", f: 1 / 3.6, suffix: "kmh", calc: "/ 3.6", how: "divide by 3.6" },
  min: { si: "s", f: 60, suffix: "min", calc: "* 60", how: "multiply by 60" },
  kJ: { si: "J", f: 1000, suffix: "kJ", calc: "* 1000", how: "multiply by 1000" },
  km: { si: "m", f: 1000, suffix: "km", calc: "* 1000", how: "multiply by 1000" },
  kN: { si: "N", f: 1000, suffix: "kN", calc: "* 1000", how: "multiply by 1000" },
  ms: { si: "s", f: 1 / 1000, suffix: "ms", calc: "/ 1000", how: "divide by 1000" },
};
const toSI = (v, u) => (u ? v * CONV[u].f : v);

// Labels and calculator expressions for one question's values.
function labeler(units) {
  const L = (k) => `_${k}${units[k] ? "_" + CONV[units[k]].suffix : ""}`;
  const C = (k) => (units[k] ? `(${L(k)} ${CONV[units[k]].calc})` : L(k));
  return { L, C };
}

// "500 g = 0.5 kg" (or "≈" when the SI value is not exact to 4 decimals).
function convLine(v, u) {
  const s = v * CONV[u].f;
  const eq = Math.abs(s - Math.round(s * 10000) / 10000) > 1e-9 ? "≈" : "=";
  return `${num(v)} ${u} ${eq} ${num(s)} ${CONV[u].si}`;
}

// Conversion sentences for every stated non-SI value (not the unknown).
function convSteps(values, units, unknown) {
  return Object.keys(units)
    .filter((k) => k !== unknown && values[k] !== undefined)
    .map((k) => `Convert first: ${convLine(values[k], units[k])} (${CONV[units[k]].how}).`);
}

// Calculator rows from the stated inputs. skip: values not stated as numbers (directions, u = 0 "from rest").
function givenFrom(values, units, unknown, skip = []) {
  const { L } = labeler(units);
  return Object.entries(values)
    .filter(([k, v]) => k !== unknown && !skip.includes(k) && typeof v === "number")
    .map(([k, value]) => ({ label: L(k), value }));
}

// Final line of an explanation: "= **15 N**" or "≈ 14.2857 N, which rounds to **14.29 N**".
function result(exact, rounded, unit) {
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown} ${unit}**`;
  return `≈ ${exact.toFixed(4)} ${unit}, which rounds to **${shown} ${unit}**`;
}

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors; positive quantities get no negative options.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  // strict (mistake candidates only): skip values more than 100× away from the answer.
  const tryAdd = (v, strict) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (Number(s) === 0 && correct !== 0) return;
    if (strict && correct !== 0) {
      const ratio = Math.abs(v / correct);
      if (ratio > 100 || ratio < 0.01) return;
    }
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach((v) => tryAdd(v, true));
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k, false);
    tryAdd(correct - k, false);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// A solved single question -> typed number (65%) or multiple choice (35%).
// q: { prompt, exact, unit, rounded, formula, unknown, values, units, steps, hints, candidates, skip }
function single(q, rng) {
  q = { ...q, prompt: articles(q.prompt) };
  const { exact, rounded } = q;
  if (!Number.isFinite(exact)) throw new Error("non-finite answer");
  if (!rounded && !Number.isInteger(clean(exact))) throw new Error(`expected a whole-number answer, got ${exact}`);
  const units = q.units || {};
  const base = {
    prompt: q.prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation: [...q.steps.slice(0, -1), `${q.steps[q.steps.length - 1]} ${result(exact, rounded, q.unit)}`].join("\n\n"),
    params: { formula: q.formula, unknown: q.unknown, values: q.values, units, rounded },
    hints: q.hints,
  };
  const given = givenFrom(q.values, units, q.unknown, q.skip);
  if (given.length) base.given = given;
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, q.candidates, rounded, rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : clean(exact), answerType: "number", choices: undefined };
}

// One numeric part of a multi-part question; spec is what verify() rechecks for that part.
function numPart(id, label, ask, exact, hint, spec) {
  return {
    part: { id, label, ask, answerType: "number", answer: round2(exact), tolerance: 0.005, hint },
    spec: { id, ...spec, rounded: true },
  };
}

function multi(prompt, partList, explanation, values, units, skip = []) {
  const q = {
    prompt: articles(prompt),
    answerType: "multi",
    parts: partList.map((p) => p.part),
    explanation,
    params: { multi: true, parts: partList.map((p) => p.spec) },
  };
  const given = givenFrom(values, units, null, skip);
  if (given.length) q.given = given;
  return q;
}

// Retry a draw until ok() holds (deterministic: only the rng passed in). Falls back to the last draw.
function draw(rng, make, ok, tries = 60) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = make();
    if (ok(v)) return v;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Forces

// Names that suit the mass (kg): the first pool whose upper bound is above m.
function nameFor(m, rng, pools) {
  for (const [upTo, names] of pools) if (m < upTo) return rng.pick(names);
  return rng.pick(pools[pools.length - 1][1]);
}
// Something pushed, pulled or moving (people only at adult masses).
const BODY_POOLS = [
  [1, ["ball", "toy car", "wooden block", "hockey puck", "model boat"]],
  [10, ["toy car", "trolley", "bowling ball", "wooden block", "drone", "box"]],
  [45, ["trolley", "crate", "sledge", "box", "wheelbarrow", "shopping cart"]],
  [130, ["crate", "sledge", "go-kart", "runner", "cyclist", "skater"]],
  [700, ["motorbike", "quad bike", "loaded pallet", "small boat"]],
  [Infinity, ["car", "van", "minibus", "tractor", "pickup truck"]],
];
const bodyFor = (m, rng) => nameFor(m, rng, BODY_POOLS);
// Something weighed.
const THING_POOLS = [
  [1, ["rock sample", "camera", "phone", "book"]],
  [10, ["bag of flour", "toolbox", "rock sample", "laptop bag"]],
  [40, ["suitcase", "sack of sand", "bicycle", "backpack"]],
  [Infinity, ["crate", "sack of potatoes", "water barrel", "robot rover"]],
];
// Something raised (hikers and climbers only at adult masses).
const LIFT_POOLS = [
  [2, ["book", "flower pot", "bag of sugar", "watering can"]],
  [45, ["box of books", "suitcase", "bag of cement", "toolbox"]],
  [120, ["hiker", "climber", "crate"]],
  [Infinity, ["crate", "pallet of bricks", "lift car"]],
];
const an = (w) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const An = (w) => cap(an(w));
const PLACES = [
  { at: "on Earth", g: 9.8 },
  { at: "on the Moon", g: 1.6 },
  { at: "on Mars", g: 3.7 },
];
const VEHICLES = ["car", "van", "minibus", "tractor", "pickup truck", "electric car"];

function genForces(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return forcesMulti(rng);
  const kinds =
    d === "easy" ? ["fma-F", "fma-a", "fma-m", "weight", "resultant"]
      : d === "medium" ? ["fma-F", "fma-a", "fma-m", "weight", "weight-m", "net-a"]
        : ["fma-F", "fma-a", "fma-m", "weight", "weight-m", "net-a", "lift-a"];
  const kind = rng.pick(kinds);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";

  if (kind.startsWith("fma")) {
    const unknown = kind.slice(4);
    let m, a, F, inG = false; // m in kg (SI); inG: mass stated (or asked) in grams
    if (d === "easy") {
      m = rng.int(2, 25);
      a = rng.int(1, 10);
      F = m * a;
    } else if (d === "medium") {
      inG = rng.next() < 0.5;
      if (inG) {
        m = (500 * rng.int(1, 8)) / 1000; // 500 g steps
        a = 2 * rng.int(1, 10);
      } else {
        m = rng.int(5, 80);
        a = rng.int(2, 12);
      }
      F = clean(m * a);
    } else {
      inG = rng.next() < 0.35;
      m = inG ? rng.int(150, 4000) / 1000 : rng.int(15, 2500) / 10;
      a = rng.int(5, 150) / 10;
      F = fix(m * a);
      if (unknown !== "F") F = Math.max(0.1, fix(Math.round(m * a * 10) / 10)); // stated to 1 decimal
    }
    const obj = bodyFor(unknown === "m" ? F / a : m, rng);
    const units = inG ? { m: "g" } : {};
    const mShown = fix(inG ? m * 1000 : m);
    const mUnit = inG ? "g" : "kg";
    const values = { F, m: mShown, a };
    const { C } = labeler(units);
    let prompt, exact, unit, steps, hints, candidates;
    const conv = inG && unknown !== "m" ? [`Convert the mass to kg first: ${convLine(mShown, "g")}.`] : [];
    if (unknown === "F") {
      exact = m * a;
      unit = "N";
      prompt = `${An(obj)} of mass ${num(mShown)} ${mUnit} has an acceleration of ${num(a)} m/s². What resultant force acts on it, in N?${end}`;
      steps = ["Use Newton's second law, `F = m × a`, with the mass in kg.", ...conv, `\`F = ${num(m)} × ${num(a)}\``];
      candidates = [mShown * a, m / a, m + a, a / m];
      hints = [
        `Resultant force = mass × acceleration: \`F = m × a\`.${inG ? " The mass must be in kg, so divide the grams by 1000 first." : ""}`,
        `Substitute: \`F = ${num(m)} × ${num(a)}\` (in the calculator: \`${C("m")} * _a\`).${thenRound}`,
      ];
    } else if (unknown === "a") {
      exact = F / m;
      unit = "m/s²";
      prompt = `A resultant force of ${num(F)} N acts on ${an(obj)} of mass ${num(mShown)} ${mUnit}. What is its acceleration, in m/s²?${end}`;
      steps = ["Rearrange `F = m × a` to `a = F / m`, with the mass in kg.", ...conv, `\`a = ${num(F)} / ${num(m)}\``];
      candidates = [F * m, m / F, F / mShown, F - m];
      hints = [
        `You know the force and the mass, so rearrange \`F = m × a\` to \`a = F / m\`.${inG ? " Convert the mass to kg first." : ""}`,
        `Substitute: \`a = ${num(F)} / ${num(m)}\` (in the calculator: \`_F / ${C("m")}\`).${thenRound}`,
      ];
    } else {
      // Mass: asked in g when inG (convert the kg answer to grams).
      exact = inG ? (F / a) * 1000 : F / a;
      unit = mUnit;
      prompt = `A resultant force of ${num(F)} N gives ${an(obj)} an acceleration of ${num(a)} m/s². What is its mass, in ${mUnit}?${end}`;
      steps = [
        "Rearrange `F = m × a` to `m = F / a`. This gives the mass in kg.",
        ...(inG ? [`\`m = ${num(F)} / ${num(a)} = ${num(F / a)}\` kg. Multiply by 1000 to get grams:`, `\`m = ${num(F / a)} × 1000\``] : [`\`m = ${num(F)} / ${num(a)}\``]),
      ];
      candidates = inG ? [F / a, F * a * 1000, (a / F) * 1000] : [F * a, a / F, F - a];
      hints = [
        "You know the force and the acceleration, so rearrange `F = m × a` to `m = F / a`.",
        `Substitute: \`m = ${num(F)} / ${num(a)}\` (in the calculator: \`_F / _a\`).${inG ? " That is in kg: multiply by 1000 for grams." : ""}${thenRound}`,
      ];
    }
    return single({ prompt, exact, unit, rounded, formula: "fma", unknown, values, units, steps, hints, candidates }, rng);
  }

  if (kind === "weight" || kind === "weight-m") {
    const place = d === "easy" ? PLACES[0] : rng.pick(PLACES);
    const g = place.g;
    let m, W, inG = false;
    if (kind === "weight") {
      if (d === "easy") m = 5 * rng.int(1, 20);
      else if (d === "medium") m = (g === 3.7 ? 10 : 5) * rng.int(1, 20);
      else {
        inG = rng.next() < 0.4;
        m = inG ? rng.int(50, 5000) / 1000 : rng.int(5, 2000) / 10;
      }
      const thing = nameFor(m, rng, THING_POOLS);
      const units = inG ? { m: "g" } : {};
      const mShown = fix(inG ? m * 1000 : m);
      const values = { m: mShown, g };
      const { C } = labeler(units);
      const exact = m * g;
      const conv = inG ? [`Convert the mass to kg first: ${convLine(mShown, "g")}.`] : [];
      return single({
        prompt: `${An(thing)} has a mass of ${num(mShown)} ${inG ? "g" : "kg"}. What is its weight ${place.at}, where g = ${g} N/kg? Give your answer in N.${end}`,
        exact, unit: "N", rounded, formula: "weight", unknown: "W", values, units,
        steps: ["Weight = mass × gravitational field strength: `W = m × g`, with the mass in kg.", ...conv, `\`W = ${num(m)} × ${g}\``],
        hints: [
          `Weight is mass times the gravitational field strength: \`W = m × g\`, with g = ${g} N/kg ${place.at}.${inG ? " Convert the mass to kg first." : ""}`,
          `Substitute: \`W = ${num(m)} × ${g}\` (in the calculator: \`${C("m")} * _g\`).${thenRound}`,
        ],
        candidates: [mShown * g, m / g, m * 9.8, m * 10, m],
      }, rng);
    }
    // weight-m: mass from weight
    if (d === "medium") {
      m = rng.int(2, 150);
      W = fix(m * g);
    } else {
      W = rng.int(20, 30000) / 10;
      m = W / g;
    }
    const values = { W, g };
    const exact = W / g;
    const thing = nameFor(exact, rng, THING_POOLS);
    return single({
      prompt: `${An(thing)} weighs ${num(W)} N ${place.at}, where g = ${g} N/kg. What is its mass, in kg?${end}`,
      exact, unit: "kg", rounded, formula: "weight", unknown: "m", values, units: {},
      steps: ["Rearrange `W = m × g` to `m = W / g`.", `\`m = ${num(W)} / ${g}\``],
      hints: [
        "Weight and mass are linked by `W = m × g`. Rearrange it for the mass: `m = W / g`.",
        `Substitute: \`m = ${num(W)} / ${g}\` (in the calculator: \`_W / _g\`).${thenRound}`,
      ],
      candidates: [W * g, W / 10, g / W, W - g],
    }, rng);
  }

  if (kind === "resultant") {
    const mode = rng.pick(["same", "opposite", "friction"]);
    const obj = rng.pick(["trolley", "crate", "sledge", "shopping cart", "wheelbarrow", "piano", "boat", "car"]);
    let F1, F2, dir, prompt;
    if (mode === "same") {
      F1 = 10 * rng.int(2, 40);
      F2 = 10 * rng.int(2, 40);
      dir = 1;
      prompt = `Two people push a ${obj} in the same direction, with forces of ${F1} N and ${F2} N. What is the resultant force on it, in N?`;
    } else if (mode === "opposite") {
      [F1, F2] = draw(rng, () => [10 * rng.int(20, 80), 10 * rng.int(20, 80)], ([x, y]) => x !== y);
      dir = -1;
      prompt = `In a tug of war, team A pulls left with a force of ${F1} N and team B pulls right with a force of ${F2} N. What is the size of the resultant force, in N?`;
    } else {
      F1 = rng.int(20, 200);
      F2 = rng.int(5, F1 - 5);
      dir = -1;
      prompt = `A ${obj} is pushed forwards with a force of ${F1} N. Friction acts backwards on it with a force of ${F2} N. What is the resultant force on it, in N?`;
    }
    const exact = Math.abs(F1 + dir * F2);
    return single({
      prompt, exact, unit: "N", rounded: false, formula: "resultant", unknown: "R", values: { F1, F2, dir }, units: {}, skip: ["dir"],
      steps: [
        dir === 1 ? "Forces in the same direction add up." : "Forces in opposite directions partly cancel: take the smaller from the larger.",
        dir === 1 ? `\`R = ${F1} + ${F2}\`` : `\`R = ${Math.max(F1, F2)} - ${Math.min(F1, F2)}\``,
      ],
      hints: [
        dir === 1
          ? "Both forces point the same way, so they add together."
          : "The forces point in opposite directions, so the resultant is the difference between them, in the direction of the bigger force.",
        dir === 1 ? `Work out \`${F1} + ${F2}\` (in the calculator: \`_F1 + _F2\`).` : `Work out \`${Math.max(F1, F2)} - ${Math.min(F1, F2)}\` (in the calculator: \`abs(_F1 - _F2)\`).`,
      ],
      candidates: dir === 1 ? [Math.abs(F1 - F2), F1, F2] : [F1 + F2, F1, F2],
    }, rng);
  }

  if (kind === "net-a") {
    let m, F, f, kN = false;
    const vehicle = rng.next() < 0.5;
    let who;
    if (d === "medium") {
      if (vehicle) {
        m = 100 * rng.int(8, 20);
        const a = rng.int(1, 4);
        f = 50 * rng.int(4, 16);
        F = m * a + f;
        kN = rng.next() < 0.6;
      } else {
        m = rng.int(4, 60);
        const a = rng.int(1, 6);
        f = rng.int(5, 120);
        F = m * a + f;
      }
    } else {
      if (vehicle) {
        m = 10 * rng.int(60, 250);
        f = 10 * rng.int(20, 120);
        F = f + 10 * rng.int(50, 600);
        kN = rng.next() < 0.5;
      } else {
        m = rng.int(20, 800) / 10;
        f = rng.int(50, 1500) / 10;
        F = fix(f + rng.int(20, 3000) / 10);
      }
    }
    who = vehicle ? rng.pick(VEHICLES) : bodyFor(m, rng);
    const units = kN ? { F: "kN" } : {};
    const FShown = fix(kN ? F / 1000 : F);
    const values = { F: FShown, fric: f, m };
    const { C } = labeler(units);
    const exact = (F - f) / m;
    const conv = kN ? [`Convert the driving force to N first: ${convLine(FShown, "kN")}.`] : [];
    const prompt = vehicle
      ? `${An(who)} of mass ${m} kg has a driving force of ${num(FShown)} ${kN ? "kN" : "N"}. Friction and air resistance together give a backward force of ${num(f)} N. What is its acceleration, in m/s²?${end}`
      : `${An(who)} of mass ${num(m)} kg is pushed with a force of ${num(FShown)} N. Friction acts against it with a force of ${num(f)} N. What is its acceleration, in m/s²?${end}`;
    return single({
      prompt, exact, unit: "m/s²", rounded, formula: "net-a", unknown: "a", values, units,
      steps: [
        "Find the resultant force first, then use `a = F / m`.",
        ...conv,
        `Resultant force: \`${num(F)} - ${num(f)} = ${num(F - f)}\` N.`,
        `\`a = ${num(F - f)} / ${num(m)}\``,
      ],
      hints: [
        `Only the resultant force accelerates it. The forward force and friction act in opposite directions, so subtract: \`F - f\`.${kN ? " Convert kN to N first." : ""}`,
        `Then divide the resultant force by the mass: \`a = (${num(F)} - ${num(f)}) / ${num(m)}\` (in the calculator: \`(${C("F")} - _fric) / _m\`).${thenRound}`,
      ],
      candidates: [F / m, (F + f) / m, (F - f) * m, (FShown - f) / m],
    }, rng);
  }

  // lift-a (hard): a = (T - mg) / m, upward positive.
  const m = 10 * rng.int(30, 120);
  const T = draw(rng, () => 10 * Math.round((m * (G + rng.int(-25, 30) / 10)) / 10), (t) => Math.abs(t - m * G) >= 20);
  const exact = (T - m * G) / m;
  return single({
    prompt: `A lift of mass ${m} kg hangs from a cable. The tension in the cable is ${T} N, and g = 9.8 N/kg. What is the lift's acceleration, in m/s²? Take upward as positive, so a downward acceleration is negative.${end}`,
    exact, unit: "m/s²", rounded, formula: "lift-a", unknown: "a", values: { m, T, g: G }, units: {},
    steps: [
      "Two forces act: the tension upward and the weight downward. Find the weight, then the resultant force, then `a = F / m`.",
      `Weight: \`W = ${m} × 9.8 = ${num(m * G)}\` N.`,
      `Resultant (upward positive): \`${T} - ${num(m * G)} = ${num(T - m * G)}\` N.`,
      `\`a = ${num(T - m * G)} / ${m}\``,
    ],
    hints: [
      "Two forces act on the lift: the tension pulls up, its weight `W = m × g` pulls down.",
      `The resultant force is \`T - W\`. If the weight is bigger, it is negative.`,
      `Divide by the mass: \`a = (${T} - ${m} × 9.8) / ${m}\` (in the calculator: \`(_T - _m * _g) / _m\`).${thenRound}`,
    ],
    candidates: [T / m, (T + m * G) / m, (T - m) / m],
  }, rng);
}

// Hard multi-part: rocket (weight, resultant, acceleration) or vehicle (resultant, acceleration).
function forcesMulti(rng) {
  if (rng.next() < 0.5) {
    const m = rng.int(5, 60) / 10;
    const T = fix(Math.round(m * G * (1.3 + rng.int(0, 27) / 10) * 10) / 10);
    const W = m * G;
    const R = T - W;
    const a = R / m;
    const values = { m, T, g: G };
    const explanation = [
      "Work upward as positive: the thrust pushes up and the weight pulls down.",
      `1. Weight: \`W = m × g = ${num(m)} × 9.8\` ${result(W, true, "N")}`,
      `2. Resultant force: \`R = T - W = ${num(T)} - ${num(W)}\` ${result(R, true, "N")}`,
      `3. Acceleration: \`a = R / m = ${num(R)} / ${num(m)}\` ${result(a, true, "m/s²")}`,
    ].join("\n\n");
    return multi(
      `A model rocket of mass ${num(m)} kg lifts off with an engine thrust of ${num(T)} N upward. Take g = 9.8 N/kg and ignore air resistance.`,
      [
        numPart("weight", "Weight", `What is the rocket's weight, in N?${DP}`, W,
          "Weight = mass × gravitational field strength (in the calculator: `_m * _g`).", { formula: "weight", unknown: "W", values: { m, g: G }, units: {} }),
        numPart("resultant", "Resultant force", `What is the resultant force on it, in N?${DP}`, R,
          "Thrust acts up and weight acts down, so subtract the weight from the thrust (in the calculator: `_T - _m * _g`).", { formula: "lift-R", unknown: "R", values, units: {} }),
        numPart("accel", "Acceleration", `What is its acceleration, in m/s²?${DP}`, a,
          "Divide the resultant force by the mass: `a = F / m` (in the calculator: `(_T - _m * _g) / _m`).", { formula: "lift-a", unknown: "a", values, units: {} }),
      ],
      explanation, values, {},
    );
  }
  const who = rng.pick(VEHICLES);
  const m = 10 * rng.int(60, 250);
  const FkN = rng.int(15, 80) / 10;
  const f = 10 * rng.int(20, 140);
  const R = FkN * 1000 - f;
  const a = R / m;
  const values = { F: FkN, fric: f, m };
  const units = { F: "kN" };
  const explanation = [
    "Convert the driving force to newtons, subtract the resistive force, then divide by the mass.",
    `Convert: ${convLine(FkN, "kN")}.`,
    `1. Resultant force: \`R = ${num(FkN * 1000)} - ${f}\` ${result(R, true, "N")}`,
    `2. Acceleration: \`a = R / m = ${num(R)} / ${m}\` ${result(a, true, "m/s²")}`,
  ].join("\n\n");
  return multi(
    `${An(who)} of mass ${m} kg has a driving force of ${num(FkN)} kN. Friction and air resistance together give a backward force of ${f} N.`,
    [
      numPart("resultant", "Resultant force", `What is the resultant force on it, in N?${DP}`, R,
        "Convert kN to N (multiply by 1000), then subtract the backward force (in the calculator: `_F_kN * 1000 - _fric`).", { formula: "net", unknown: "R", values: { F: FkN, fric: f }, units }),
      numPart("accel", "Acceleration", `What is its acceleration, in m/s²?${DP}`, a,
        "Divide the resultant force by the mass: `a = F / m` (in the calculator: `(_F_kN * 1000 - _fric) / _m`).", { formula: "net-a", unknown: "a", values, units }),
    ],
    explanation, values, units,
  );
}

// ---------------------------------------------------------------------------------------------
// Work & power

const PEOPLE = ["A builder", "A farmer", "A student", "A mover", "A gardener", "A worker", "A climber", "A cyclist"];
const LOADS = ["a crate", "a sledge", "a cart", "a heavy box", "a wheelbarrow", "a trolley", "a log", "a sack of grain"];
const MACHINES = ["A motor", "A crane", "A winch", "An electric hoist", "A lift motor", "A conveyor belt", "A pump", "A forklift"];
const DEVICES = [
  ["light bulb", "electrical", "light"],
  ["electric motor", "electrical", "kinetic"],
  ["kettle", "electrical", "thermal"],
  ["car engine", "chemical", "kinetic"],
  ["solar panel", "light", "electrical"],
  ["loudspeaker", "electrical", "sound"],
  ["crane motor", "electrical", "gravitational potential"],
  ["hair dryer", "electrical", "thermal"],
];

function genWork(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return workMulti(rng);
  const kinds =
    d === "easy" ? ["work-W", "work-F", "power-P", "power-E", "eff"]
      : d === "medium" ? ["work-W", "work-d", "power-P", "power-t", "power-E", "pfv", "eff", "eff-out"]
        : ["work-W", "work-F", "work-d", "power-P", "power-t", "pfv", "pfv-F", "eff", "eff-out"];
  const kind = rng.pick(kinds);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";

  if (kind.startsWith("work")) {
    const unknown = kind.slice(5);
    const who = rng.pick(PEOPLE);
    const load = rng.pick(LOADS);
    let F, dist, W;
    const units = {};
    if (d === "easy") {
      F = 10 * rng.int(1, 30);
      dist = rng.int(2, 25);
      W = F * dist;
    } else if (d === "medium") {
      F = 10 * rng.int(5, 60);
      if (unknown === "W" && rng.next() < 0.6) {
        dist = rng.int(1, 8) / 2; // km
        units.d = "km";
        units.W = "kJ";
        W = F * dist; // kJ
      } else {
        dist = rng.int(3, 60);
        W = F * dist;
        if (unknown === "d" && W % 100 === 0 && rng.next() < 0.6) {
          units.W = "kJ";
          W = fix(W / 1000);
        }
      }
    } else {
      F = rng.int(50, 5000) / 10;
      dist = rng.int(10, 3000) / 10;
      W = fix(F * dist);
      if (unknown !== "W") W = fix(Math.round(F * dist * 10) / 10);
    }
    const { C } = labeler(units);
    const Wj = toSI(W, units.W);
    const dm = toSI(dist, units.d);
    const values = { F, d: dist, W };
    let prompt, exact, unit, steps, hints, candidates;
    if (unknown === "W") {
      const inkJ = units.W === "kJ";
      exact = inkJ ? (F * dm) / 1000 : F * dm;
      unit = inkJ ? "kJ" : "J";
      prompt = `${who} pulls ${load} with a steady force of ${num(F)} N for ${num(dist)} ${units.d || "m"} in the direction of the force. How much work is done, in ${unit}?${end}`;
      steps = [
        "Work done = force × distance moved in the direction of the force: `W = F × d`, with d in metres.",
        ...(units.d ? [`Convert first: ${convLine(dist, "km")}.`] : []),
        ...(inkJ ? [`\`W = ${num(F)} × ${num(dm)} = ${num(F * dm)}\` J. Divide by 1000 for kJ:`, `\`W = ${num(F * dm)} / 1000\``] : [`\`W = ${num(F)} × ${num(dm)}\``]),
      ];
      hints = [
        `Work done is force times distance: \`W = F × d\`.${units.d ? " Use the distance in metres (1 km = 1000 m)." : ""}`,
        `Substitute: \`W = ${num(F)} × ${num(dm)}\` (in the calculator: \`_F * ${C("d")}\`).${inkJ ? " That is in J: divide by 1000 for kJ." : ""}${thenRound}`,
      ];
      candidates = inkJ ? [F * dm, F * dist * 10, F * dist / 10] : [F / dm, F + dm, (F * dm) / 2];
    } else if (unknown === "F") {
      exact = Wj / dm;
      unit = "N";
      prompt = `${who} does ${num(W)} J of work pulling ${load} ${num(dist)} m along the ground. What steady force do they apply, in N?${end}`;
      steps = ["Rearrange `W = F × d` to `F = W / d`.", `\`F = ${num(Wj)} / ${num(dm)}\``];
      hints = [
        "You know the work done and the distance, so rearrange `W = F × d` to `F = W / d`.",
        `Substitute: \`F = ${num(Wj)} / ${num(dm)}\` (in the calculator: \`_W / _d\`).${thenRound}`,
      ];
      candidates = [Wj * dm, dm / Wj, Wj - dm];
    } else {
      exact = Wj / F;
      unit = "m";
      prompt = `${who} does ${num(W)} ${units.W || "J"} of work pulling ${load} with a steady force of ${num(F)} N. How far does the ${load.split(" ").pop()} move, in m?${end}`;
      steps = [
        "Rearrange `W = F × d` to `d = W / F`, with W in joules.",
        ...(units.W ? [`Convert first: ${convLine(W, "kJ")}.`] : []),
        `\`d = ${num(Wj)} / ${num(F)}\``,
      ];
      hints = [
        `You know the work done and the force, so rearrange \`W = F × d\` to \`d = W / F\`.${units.W ? " Convert kJ to J first (multiply by 1000)." : ""}`,
        `Substitute: \`d = ${num(Wj)} / ${num(F)}\` (in the calculator: \`${C("W")} / _F\`).${thenRound}`,
      ];
      candidates = [Wj * F, F / Wj, W / F, Wj / F / 1000];
    }
    return single({ prompt, exact, unit, rounded, formula: "work", unknown, values, units, steps, hints, candidates }, rng);
  }

  if (kind.startsWith("power")) {
    const unknown = kind.slice(6);
    const mach = rng.pick(MACHINES);
    let P, t, E;
    const units = {};
    if (d === "easy") {
      P = 10 * rng.int(1, 50);
      t = rng.int(2, 30);
      E = P * t;
    } else if (d === "medium") {
      P = 50 * rng.int(1, 60);
      if (rng.next() < 0.6) {
        t = rng.int(1, 10);
        units.t = "min";
        E = fix((P * t * 60) / 1000);
        units.E = "kJ";
      } else {
        t = rng.int(5, 120);
        E = P * t;
      }
    } else {
      P = rng.int(100, 50000) / 10;
      t = rng.int(20, 6000) / 10;
      E = fix(P * t);
      if (unknown === "P") E = fix(Math.round(P * t));
      if (unknown === "t") {
        units.E = "kJ";
        E = Math.max(0.1, fix(Math.round(P * t / 100) / 10));
      }
    }
    const { C } = labeler(units);
    const Ej = toSI(E, units.E);
    const ts = toSI(t, units.t);
    const values = { P, t, E };
    const tTxt = `${num(t)} ${units.t === "min" ? (t === 1 ? "minute" : "minutes") : "s"}`;
    const eTxt = `${num(E)} ${units.E || "J"}`;
    let prompt, exact, unit, steps, hints, candidates;
    const conv = convSteps(values, units, unknown);
    if (unknown === "P") {
      exact = Ej / ts;
      unit = "W";
      prompt = `${mach} transfers ${eTxt} of energy in ${tTxt}. What is its power, in W?${end}`;
      steps = ["Power = energy transferred / time: `P = E / t`, with E in J and t in s.", ...conv, `\`P = ${num(Ej)} / ${num(ts)}\``];
      hints = [
        `Power is energy per second: \`P = E / t\`.${conv.length ? " Convert to joules and seconds first." : ""}`,
        `Substitute: \`P = ${num(Ej)} / ${num(ts)}\` (in the calculator: \`${C("E")} / ${C("t")}\`).${thenRound}`,
      ];
      candidates = [Ej * ts, E / t, ts / Ej, Ej / t];
    } else if (unknown === "E") {
      const inkJ = units.E === "kJ";
      exact = inkJ ? (P * ts) / 1000 : P * ts;
      unit = inkJ ? "kJ" : "J";
      prompt = `${mach} with a power of ${num(P)} W runs for ${tTxt}. How much energy does it transfer, in ${unit}?${end}`;
      steps = [
        "Rearrange `P = E / t` to `E = P × t`, with t in seconds.",
        ...(units.t ? [`Convert first: ${convLine(t, "min")}.`] : []),
        ...(inkJ ? [`\`E = ${num(P)} × ${num(ts)} = ${num(P * ts)}\` J. Divide by 1000 for kJ:`, `\`E = ${num(P * ts)} / 1000\``] : [`\`E = ${num(P)} × ${num(ts)}\``]),
      ];
      hints = [
        `Energy = power × time: \`E = P × t\`.${units.t ? " Use the time in seconds (multiply minutes by 60)." : ""}`,
        `Substitute: \`E = ${num(P)} × ${num(ts)}\` (in the calculator: \`_P * ${C("t")}\`).${inkJ ? " That is in J: divide by 1000 for kJ." : ""}${thenRound}`,
      ];
      candidates = inkJ ? [P * t, P * ts, (P * t) / 1000] : [P / t, t / P, P + t];
    } else {
      const inMin = units.t === "min";
      exact = inMin ? Ej / P / 60 : Ej / P;
      unit = inMin ? "minutes" : "s";
      prompt = `${mach} with a power of ${num(P)} W transfers ${eTxt} of energy. How long does this take, in ${unit}?${end}`;
      steps = [
        "Rearrange `P = E / t` to `t = E / P`, with E in joules. This gives the time in seconds.",
        ...(units.E ? [`Convert first: ${convLine(E, "kJ")}.`] : []),
        ...(inMin ? [`\`t = ${num(Ej)} / ${num(P)} = ${num(Ej / P)}\` s. Divide by 60 for minutes:`, `\`t = ${num(Ej / P)} / 60\``] : [`\`t = ${num(Ej)} / ${num(P)}\``]),
      ];
      hints = [
        `Rearrange \`P = E / t\` to \`t = E / P\`.${units.E ? " Convert kJ to J first (multiply by 1000)." : ""}`,
        `Substitute: \`t = ${num(Ej)} / ${num(P)}\` (in the calculator: \`${C("E")} / _P\`).${inMin ? " That is in seconds: divide by 60 for minutes." : ""}${thenRound}`,
      ];
      candidates = inMin ? [Ej / P, (E / P) * 60, Ej * P] : [Ej * P, P / Ej, E / P];
    }
    return single({ prompt, exact, unit, rounded, formula: "power", unknown, values, units, steps, hints, candidates }, rng);
  }

  if (kind === "pfv" || kind === "pfv-F") {
    const unknown = kind === "pfv" ? "P" : "F";
    const who = rng.pick(VEHICLES);
    let F, v, P;
    const units = {};
    if (d === "medium") {
      F = 10 * rng.int(20, 300);
      v = fix(3.6 * rng.int(2, 30)); // km/h that is a whole number of m/s
      units.v = "km/h";
    } else {
      F = rng.int(500, 50000) / 10;
      if (rng.next() < 0.5) {
        v = rng.int(20, 130);
        units.v = "km/h";
      } else v = rng.int(20, 400) / 10;
      if (unknown === "F") P = 100 * rng.int(50, 1500);
    }
    const { C } = labeler(units);
    const vs = toSI(v, units.v);
    const vTxt = `${num(v)} ${units.v || "m/s"}`;
    const conv = units.v ? [`Convert first: ${convLine(v, "km/h")}.`] : [];
    if (unknown === "P") {
      const exact = F * vs;
      return single({
        prompt: `${An(who)}'s engine provides a driving force of ${num(F)} N while it travels at a steady ${vTxt}. What useful power is the engine producing, in W?${end}`,
        exact, unit: "W", rounded, formula: "pfv", unknown, values: { F, v }, units,
        steps: ["Power = force × velocity: `P = F × v`, with v in m/s.", ...conv, `\`P = ${num(F)} × ${num(vs)}\``],
        hints: [
          `At a steady speed, power = force × velocity: \`P = F × v\`.${units.v ? " Use the speed in m/s (divide km/h by 3.6)." : ""}`,
          `Substitute: \`P = ${num(F)} × ${num(vs)}\` (in the calculator: \`_F * ${C("v")}\`).${thenRound}`,
        ],
        candidates: [F * v, F / vs, (F * vs) / 1000, F * vs * 3.6],
      }, rng);
    }
    const exact = P / vs;
    return single({
      prompt: `${An(who)}'s engine delivers a useful power of ${num(P)} W while it travels at a steady ${vTxt}. What driving force does it provide, in N?${end}`,
      exact, unit: "N", rounded, formula: "pfv", unknown, values: { P, v }, units,
      steps: ["Rearrange `P = F × v` to `F = P / v`, with v in m/s.", ...conv, `\`F = ${num(P)} / ${num(vs)}\``],
      hints: [
        `Rearrange \`P = F × v\` to \`F = P / v\`.${units.v ? " Use the speed in m/s (divide km/h by 3.6)." : ""}`,
        `Substitute: \`F = ${num(P)} / ${num(vs)}\` (in the calculator: \`_P / ${C("v")}\`).${thenRound}`,
      ],
      candidates: [P / v, P * vs, vs / P],
    }, rng);
  }

  // Efficiency
  const [dev, inForm, outForm] = rng.pick(DEVICES);
  let Ein, Eout, eff;
  const units = {};
  if (d === "easy") {
    Ein = 20 * rng.int(2, 50);
    eff = 5 * rng.int(2, 19);
    Eout = (Ein * eff) / 100;
  } else if (d === "medium") {
    Ein = rng.int(1, 20);
    units.Ein = "kJ";
    eff = 5 * rng.int(2, 19);
    Eout = 10 * Ein * eff;
  } else {
    if (rng.next() < 0.4) {
      units.Ein = "kJ";
      Ein = rng.int(10, 900) / 10;
    } else Ein = rng.int(100, 90000) / 10;
    const inJ = toSI(Ein, units.Ein);
    if (kind === "eff") Eout = fix(Math.round(inJ * rng.int(50, 950) / 100) / 10); // 1 decimal
    else eff = rng.int(50, 950) / 10;
  }
  const { C } = labeler(units);
  const EinJ = toSI(Ein, units.Ein);
  const inTxt = `${num(Ein)} ${units.Ein || "J"}`;
  const conv = units.Ein ? [`Convert first: ${convLine(Ein, "kJ")}.`] : [];
  if (kind === "eff") {
    const exact = (Eout / EinJ) * 100;
    return single({
      prompt: `${An(dev)} is supplied with ${inTxt} of ${inForm} energy and transfers ${num(Eout)} J usefully as ${outForm} energy. What is its efficiency, as a percentage? Answer as a number without the % sign.${end}`,
      exact, unit: "%", rounded, formula: "eff", unknown: "eff", values: { Ein, Eout }, units,
      steps: ["Efficiency = useful output energy / total input energy × 100%, with both in the same unit.", ...conv, `\`efficiency = ${num(Eout)} / ${num(EinJ)} × 100\``],
      hints: [
        `Efficiency compares the useful output with the total input: \`useful out / total in × 100\`.${units.Ein ? " Put both energies in joules first." : ""}`,
        `Substitute: \`${num(Eout)} / ${num(EinJ)} × 100\` (in the calculator: \`_Eout / ${C("Ein")} * 100\`).${thenRound}`,
      ],
      candidates: [(EinJ / Eout) * 100, ((EinJ - Eout) / EinJ) * 100, Eout / EinJ, (Eout / Ein) * 100],
    }, rng);
  }
  const exact = (eff / 100) * EinJ;
  return single({
    prompt: `${An(dev)} is ${num(eff)}% efficient. It is supplied with ${inTxt} of ${inForm} energy. How much useful ${outForm} energy does it transfer, in J?${end}`,
    exact, unit: "J", rounded, formula: "eff", unknown: "Eout", values: { Ein, eff }, units,
    steps: ["Useful output = efficiency × total input, with the efficiency as a decimal (divide the percentage by 100).", ...conv, `\`useful out = ${num(eff)} / 100 × ${num(EinJ)}\``],
    hints: [
      `Rearrange \`efficiency = useful out / total in × 100\` to \`useful out = efficiency / 100 × total in\`.${units.Ein ? " Put the input in joules first." : ""}`,
      `Substitute: \`${num(eff)} / 100 × ${num(EinJ)}\` (in the calculator: \`_eff / 100 * ${C("Ein")}\`).${thenRound}`,
    ],
    candidates: [EinJ - exact, eff * EinJ, (100 / eff) * EinJ, (eff / 100) * Ein],
  }, rng);
}

// Hard multi-part: work + power, or efficiency + wasted energy.
function workMulti(rng) {
  if (rng.next() < 0.5) {
    const who = rng.pick(MACHINES);
    const F = rng.int(500, 20000) / 10;
    const dist = rng.int(20, 500) / 10;
    const t = rng.int(1, 8) / 2; // minutes
    const units = { t: "min" };
    const W = F * dist;
    const P = W / (t * 60);
    const values = { F, d: dist, t };
    const explanation = [
      "Find the work done first, then divide by the time in seconds.",
      `1. Work done: \`W = F × d = ${num(F)} × ${num(dist)}\` ${result(W, true, "J")}`,
      `Convert the time: ${convLine(t, "min")}.`,
      `2. Power: \`P = W / t = ${num(W)} / ${num(t * 60)}\` ${result(P, true, "W")}`,
    ].join("\n\n");
    return multi(
      `${who} drags a load ${num(dist)} m with a steady force of ${num(F)} N. It takes ${num(t)} ${t === 1 ? "minute" : "minutes"}.`,
      [
        numPart("work", "Work done", `How much work is done, in J?${DP}`, W,
          "Work done = force × distance (in the calculator: `_F * _d`).", { formula: "work", unknown: "W", values: { F, d: dist }, units: {} }),
        numPart("power", "Power", `What is the average power, in W?${DP}`, P,
          "Power = work done / time, with the time in seconds (in the calculator: `_F * _d / (_t_min * 60)`).", { formula: "power-fd", unknown: "P", values, units }),
      ],
      explanation, values, units,
    );
  }
  const [dev, inForm, outForm] = rng.pick(DEVICES);
  const Ein = rng.int(200, 90000) / 10;
  const Eout = fix(Math.round(Ein * rng.int(50, 950) / 100) / 10); // 1 decimal
  const eff = (Eout / Ein) * 100;
  const Ew = Ein - Eout;
  const values = { Ein, Eout };
  const explanation = [
    "Efficiency compares useful output with total input. Whatever is not useful is wasted.",
    `1. Efficiency: \`${num(Eout)} / ${num(Ein)} × 100\` ${result(eff, true, "%")}`,
    `2. Wasted energy: \`${num(Ein)} - ${num(Eout)}\` ${result(Ew, true, "J")}`,
  ].join("\n\n");
  return multi(
    `${An(dev)} is supplied with ${num(Ein)} J of ${inForm} energy and transfers ${num(Eout)} J usefully as ${outForm} energy.`,
    [
      numPart("eff", "Efficiency", `What is its efficiency, as a percentage? Answer without the % sign.${DP}`, eff,
        "Efficiency = useful out / total in × 100 (in the calculator: `_Eout / _Ein * 100`).", { formula: "eff", unknown: "eff", values, units: {} }),
      numPart("wasted", "Wasted energy", `How much energy is wasted, in J?${DP}`, Ew,
        "Energy is conserved: wasted = total in - useful out (in the calculator: `_Ein - _Eout`).", { formula: "waste", unknown: "Ew", values, units: {} }),
    ],
    explanation, values, {},
  );
}

// ---------------------------------------------------------------------------------------------
// Energy

const DROPS = ["stone", "rock", "parcel", "sandbag", "ball", "melon", "brick"];

function genEnergy(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return energyMulti(rng);
  const kinds =
    d === "easy" ? ["ke-E", "ke-m", "gpe-E", "gpe-h"]
      : d === "medium" ? ["ke-E", "ke-v", "gpe-E", "gpe-h", "fall-v", "rise-h"]
        : ["ke-E", "ke-v", "ke-m", "gpe-E", "gpe-h", "fall-v", "rise-h"];
  const kind = rng.pick(kinds);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";

  if (kind.startsWith("ke")) {
    const unknown = kind === "ke-E" ? "Ek" : kind.slice(3);
    let m, v, Ek;
    const units = {};
    if (d === "easy") {
      m = rng.int(1, 20);
      v = rng.int(1, 12);
      if ((m * v * v) % 2) m += 1;
    } else if (d === "medium") {
      if (unknown === "Ek" && rng.next() < 0.6) {
        if (rng.next() < 0.5) {
          m = (200 * rng.int(1, 10)) / 1000;
          v = 10 * rng.int(1, 3);
          units.m = "g";
        } else {
          m = rng.int(2, 120);
          v = rng.int(2, 30);
          if ((m * v * v) % 2) m += 1;
          units.v = "km/h";
        }
      } else {
        m = rng.int(1, 80);
        v = rng.int(2, 25);
        if ((m * v * v) % 2) m += 1;
      }
    } else {
      if (unknown === "Ek" && rng.next() < 0.3) {
        units.m = "g";
        m = rng.int(50, 3000) / 1000;
      } else m = rng.int(5, 2000) / 10;
      v = rng.int(10, 400) / 10;
      if (unknown === "Ek" && rng.next() < 0.3) {
        units.v = "km/h";
        v = rng.int(10, 130) / 3.6;
      }
      if (unknown !== "Ek") Ek = Math.max(0.1, fix(Math.round(0.5 * m * v * v * 10) / 10)); // stated to 1 decimal
    }
    if (Ek === undefined) Ek = fix(0.5 * m * v * v);
    const thing = bodyFor(m, rng);
    const mShown = fix(units.m ? m * 1000 : m);
    const vShown = fix(units.v ? v * 3.6 : v);
    const values = { m: mShown, v: vShown, Ek };
    const { C } = labeler(units);
    const conv = convSteps(values, units, unknown);
    let prompt, exact, unit, steps, hints, candidates;
    if (unknown === "Ek") {
      exact = 0.5 * m * v * v;
      unit = "J";
      prompt = `${An(`${num(mShown)} ${units.m || "kg"} ${thing}`)} moves at ${num(vShown)} ${units.v || "m/s"}. What is its kinetic energy, in J?${end}`;
      steps = ["Kinetic energy: `Ek = ½ × m × v²`, with m in kg and v in m/s.", ...conv, `\`Ek = ½ × ${num(m)} × ${num(v)}²\``];
      hints = [
        `Use \`Ek = ½ × m × v²\`.${conv.length ? ` Convert to ${units.m ? "kg" : "m/s"} first.` : ""}`,
        `Substitute: \`Ek = 0.5 × ${num(m)} × ${num(v)}²\` (in the calculator: \`0.5 * ${C("m")} * ${C("v")}^2\`). Square the speed before multiplying.${thenRound}`,
      ];
      candidates = [m * v * v, 0.5 * m * v, (0.5 * m * v) ** 2, 0.5 * mShown * vShown * vShown];
    } else if (unknown === "v") {
      exact = Math.sqrt((2 * Ek) / m);
      unit = "m/s";
      prompt = `${An(`${num(m)} kg ${thing}`)} has ${num(Ek)} J of kinetic energy. How fast is it moving, in m/s?${end}`;
      steps = ["Rearrange `Ek = ½ × m × v²` to `v = √(2 × Ek / m)`.", `\`v = √(2 × ${num(Ek)} / ${num(m)}) = √${num((2 * Ek) / m)}\``];
      hints = [
        "Rearrange `Ek = ½ × m × v²`: multiply by 2, divide by m, then take the square root: `v = √(2 × Ek / m)`.",
        `Substitute: \`v = √(2 × ${num(Ek)} / ${num(m)})\` (in the calculator: \`sqrt(2 * _Ek / _m)\`).${thenRound}`,
      ];
      candidates = [(2 * Ek) / m, Math.sqrt(Ek / m), Ek / m, Math.sqrt(2 * Ek * m)];
    } else {
      exact = (2 * Ek) / (v * v);
      unit = "kg";
      prompt = `${An(thing)} moving at ${num(v)} m/s has ${num(Ek)} J of kinetic energy. What is its mass, in kg?${end}`;
      steps = ["Rearrange `Ek = ½ × m × v²` to `m = 2 × Ek / v²`.", `\`m = 2 × ${num(Ek)} / ${num(v)}²\``];
      hints = [
        "Rearrange `Ek = ½ × m × v²` for the mass: `m = 2 × Ek / v²`.",
        `Substitute: \`m = 2 × ${num(Ek)} / ${num(v)}²\` (in the calculator: \`2 * _Ek / _v^2\`).${thenRound}`,
      ];
      candidates = [Ek / (v * v), (2 * Ek) / v, Ek / (2 * v * v), 2 * Ek * v * v];
    }
    return single({ prompt, exact, unit, rounded, formula: "ke", unknown, values, units, steps, hints, candidates }, rng);
  }

  if (kind.startsWith("gpe")) {
    const unknown = kind === "gpe-E" ? "Ep" : "h";
    let m, h, Ep;
    const units = {};
    if (d === "easy") {
      if (rng.next() < 0.5) {
        m = rng.int(1, 20);
        h = 5 * rng.int(1, 6);
      } else {
        m = 5 * rng.int(1, 6);
        h = rng.int(1, 20);
      }
    } else if (d === "medium") {
      const r = rng.next();
      if (unknown === "Ep" && r < 0.35) {
        m = 10 * rng.int(5, 9);
        h = 500 * rng.int(1, 8);
        units.Ep = "kJ";
      } else if (unknown === "Ep" && r < 0.7) {
        m = (500 * rng.int(1, 8)) / 1000;
        h = 10 * rng.int(1, 10);
        units.m = "g";
      } else {
        m = rng.int(2, 60);
        h = rng.int(2, 40);
        if ((m * h) % 5) h = 5 * rng.int(1, 8);
      }
    } else {
      m = rng.next() < 0.3 ? (units.m = "g", rng.int(100, 5000) / 1000) : rng.int(5, 1500) / 10;
      h = rng.int(5, 1000) / 10;
      if (unknown === "Ep" && rng.next() < 0.3) units.Ep = "kJ";
      if (unknown === "h") Ep = Math.max(0.1, fix(Math.round(m * G * h * 10) / 10));
    }
    const EpJ = Ep === undefined ? m * G * h : Ep;
    if (Ep === undefined) Ep = fix(units.Ep ? EpJ / 1000 : EpJ);
    const thing = nameFor(m, rng, LIFT_POOLS);
    const mShown = fix(units.m ? m * 1000 : m);
    const values = { m: mShown, g: G, h, Ep };
    const { C } = labeler(units);
    const conv = convSteps(values, units, unknown);
    let prompt, exact, unit, steps, hints, candidates;
    if (unknown === "Ep") {
      const inkJ = units.Ep === "kJ";
      exact = inkJ ? (m * G * h) / 1000 : m * G * h;
      unit = inkJ ? "kJ" : "J";
      const who = An(`${num(mShown)} ${units.m || "kg"} ${thing}`);
      const verb = thing === "hiker" || thing === "climber" ? `${who} climbs` : `${who} is lifted`;
      prompt = `${verb} ${num(h)} m upward. Using g = 9.8 N/kg, how much gravitational potential energy does it gain, in ${unit}?${end}`;
      steps = [
        "Gravitational potential energy: `Ep = m × g × h`, with m in kg.",
        ...conv,
        ...(inkJ ? [`\`Ep = ${num(m)} × 9.8 × ${num(h)} = ${num(m * G * h)}\` J. Divide by 1000 for kJ:`, `\`Ep = ${num(m * G * h)} / 1000\``] : [`\`Ep = ${num(m)} × 9.8 × ${num(h)}\``]),
      ];
      hints = [
        `Use \`Ep = m × g × h\`.${units.m ? " Convert the mass to kg first." : ""}`,
        `Substitute: \`Ep = ${num(m)} × 9.8 × ${num(h)}\` (in the calculator: \`${C("m")} * _g * _h\`).${inkJ ? " That is in J: divide by 1000 for kJ." : ""}${thenRound}`,
      ];
      candidates = inkJ ? [m * G * h, m * 10 * h / 1000, (m * h) / 1000] : [m * h, m * 10 * h, mShown * G * h, (m * G) / h];
    } else {
      exact = EpJ / (m * G);
      unit = "m";
      prompt = `${An(`${num(mShown)} ${units.m || "kg"} ${thing}`)} gains ${num(Ep)} J of gravitational potential energy when it is raised. Using g = 9.8 N/kg, how high is it raised, in m?${end}`;
      steps = ["Rearrange `Ep = m × g × h` to `h = Ep / (m × g)`.", ...conv, `\`h = ${num(EpJ)} / (${num(m)} × 9.8)\``];
      hints = [
        "Rearrange `Ep = m × g × h` for the height: `h = Ep / (m × g)`.",
        `Substitute: \`h = ${num(EpJ)} / (${num(m)} × 9.8)\` (in the calculator: \`_Ep / (${C("m")} * _g)\`). Keep the bracket.${thenRound}`,
      ];
      candidates = [EpJ / m, (EpJ / m) * G, EpJ / (m * 10), EpJ * m * G];
    }
    return single({ prompt, exact, unit, rounded, formula: "gpe", unknown, values, units, steps, hints, candidates }, rng);
  }

  if (kind === "fall-v") {
    const thing = rng.pick(DROPS);
    let h, u = 0, m;
    if (d === "medium") {
      const n = rng.int(1, 6);
      h = fix(2.5 * n * n); // v = 7n
      m = rng.int(1, 10) / 2;
    } else {
      h = rng.int(10, 1000) / 10;
      m = rng.int(1, 50) / 10;
      if (rng.next() < 0.4) u = rng.int(10, 150) / 10;
    }
    const exact = Math.sqrt(u * u + 2 * G * h);
    const start = u ? `is thrown straight down at ${num(u)} m/s from` : "is dropped from rest from";
    const values = u ? { m, h, g: G, u } : { m, h, g: G };
    return single({
      prompt: `A ${num(m)} kg ${thing} ${start} a height of ${num(h)} m. Ignoring air resistance and using g = 9.8 N/kg, how fast is it moving just before it hits the ground, in m/s?${end}`,
      exact, unit: "m/s", rounded, formula: "fall", unknown: "v", values, units: {},
      steps: [
        `Energy is conserved: the potential energy lost becomes kinetic energy. ${u ? "`½mv² = ½mu² + mgh`" : "`½mv² = mgh`"}. The mass cancels, so \`v = √(${u ? "u² + " : ""}2gh)\`.`,
        `\`v = √(${u ? `${num(u)}² + ` : ""}2 × 9.8 × ${num(h)}) = √${num(u * u + 2 * G * h)}\``,
      ],
      hints: [
        `The gravitational potential energy it loses turns into kinetic energy: \`${u ? "½mv² = ½mu² + mgh" : "½mv² = mgh"}\`. The mass cancels out.`,
        `That leaves \`v² = ${u ? "u² + " : ""}2gh\`. Remember the square root at the end.`,
        `Substitute: \`v = √(${u ? `${num(u)}² + ` : ""}2 × 9.8 × ${num(h)})\` (in the calculator: \`sqrt(${u ? "_u^2 + " : ""}2 * _g * _h)\`).${thenRound}`,
      ],
      candidates: [u * u + 2 * G * h, Math.sqrt(G * h + u * u), 2 * G * h, Math.sqrt(2 * G * h) + u, Math.sqrt(m * G * h)],
    }, rng);
  }

  // rise-h: thrown straight up at u; h = u² / 2g.
  const thing = rng.pick(DROPS);
  let u, m;
  if (d === "medium") {
    u = 14 * rng.int(1, 3);
    m = rng.int(1, 10) / 2;
  } else {
    u = rng.int(20, 300) / 10;
    m = rng.int(1, 50) / 10;
  }
  const exact = (u * u) / (2 * G);
  return single({
    prompt: `A ${num(m)} kg ${thing} is thrown straight up at ${num(u)} m/s. Ignoring air resistance and using g = 9.8 N/kg, how high does it rise above the point where it was thrown, in m?${end}`,
    exact, unit: "m", rounded, formula: "rise", unknown: "h", values: { m, u, g: G }, units: {},
    steps: [
      "At the top it stops for a moment, so all its kinetic energy has become potential energy: `½mu² = mgh`. The mass cancels, so `h = u² / (2g)`.",
      `\`h = ${num(u)}² / (2 × 9.8) = ${num(u * u)} / 19.6\``,
    ],
    hints: [
      "At the highest point it is momentarily still, so all the kinetic energy has turned into gravitational potential energy: `½mu² = mgh`.",
      "The mass cancels, leaving `h = u² / (2g)`.",
      `Substitute: \`h = ${num(u)}² / (2 × 9.8)\` (in the calculator: \`_u^2 / (2 * _g)\`).${thenRound}`,
    ],
    candidates: [(u * u) / G, u / (2 * G), (0.5 * m * u * u) / G, (u * u) / 20],
  }, rng);
}

// Hard multi-part: drop (GPE at the top, speed at the bottom) or throw up (KE at launch, max height).
function energyMulti(rng) {
  const thing = rng.pick(DROPS);
  const m = rng.int(1, 50) / 10;
  if (rng.next() < 0.5) {
    const h = rng.int(10, 1000) / 10;
    const Ep = m * G * h;
    const v = Math.sqrt(2 * G * h);
    const values = { m, h, g: G };
    const explanation = [
      "The potential energy at the top all becomes kinetic energy at the bottom (no air resistance).",
      `1. \`Ep = m × g × h = ${num(m)} × 9.8 × ${num(h)}\` ${result(Ep, true, "J")}`,
      `2. \`½mv² = Ep\`, so \`v = √(2 × Ep / m) = √(2 × 9.8 × ${num(h)})\` ${result(v, true, "m/s")}`,
    ].join("\n\n");
    return multi(
      `A ${num(m)} kg ${thing} is dropped from rest from a height of ${num(h)} m. Use g = 9.8 N/kg and ignore air resistance.`,
      [
        numPart("gpe", "Potential energy", `How much gravitational potential energy does it lose on the way down, in J?${DP}`, Ep,
          "Use `Ep = m × g × h` (in the calculator: `_m * _g * _h`).", { formula: "gpe", unknown: "Ep", values, units: {} }),
        numPart("speed", "Speed", `How fast is it moving just before it lands, in m/s?${DP}`, v,
          "All that energy becomes kinetic energy: set `½ × m × v² = Ep` and solve for v (the mass cancels; in the calculator: `sqrt(2 * _g * _h)`).", { formula: "fall", unknown: "v", values, units: {} }),
      ],
      explanation, values, {},
    );
  }
  const u = rng.int(20, 300) / 10;
  const Ek = 0.5 * m * u * u;
  const h = (u * u) / (2 * G);
  const values = { m, u, g: G };
  const explanation = [
    "The kinetic energy at launch all becomes potential energy at the highest point (no air resistance).",
    `1. \`Ek = ½ × m × u² = 0.5 × ${num(m)} × ${num(u)}²\` ${result(Ek, true, "J")}`,
    `2. \`m × g × h = Ek\`, so \`h = Ek / (m × g) = ${num(Ek)} / (${num(m)} × 9.8)\` ${result(h, true, "m")}`,
  ].join("\n\n");
  return multi(
    `A ${num(m)} kg ${thing} is thrown straight up at ${num(u)} m/s. Use g = 9.8 N/kg and ignore air resistance.`,
    [
      numPart("ke", "Kinetic energy", `What is its kinetic energy as it leaves the hand, in J?${DP}`, Ek,
        "Use `Ek = ½ × m × v²` (in the calculator: `0.5 * _m * _u^2`).", { formula: "ke", unknown: "Ek", values: { m, v: u }, units: {} }),
      numPart("height", "Maximum height", `How high does it rise, in m?${DP}`, h,
        "At the top all of it is potential energy: set `m × g × h = Ek` and solve for h (the mass cancels; in the calculator: `_u^2 / (2 * _g)`).", { formula: "rise", unknown: "h", values, units: {} }),
    ],
    explanation, values, {},
  );
}

// ---------------------------------------------------------------------------------------------
// Momentum

// Colliding pairs with plausible masses (kg) for hard questions; medium questions use lab trolleys.
const PAIRS = [
  { name: "trolley", lo: 0.5, hi: 5, dp: 1 },
  { name: "railway wagon", lo: 5000, hi: 40000, step: 100 },
  { name: "bumper car", lo: 150, hi: 300, dp: 1 },
  { name: "ice skater", lo: 30, hi: 100, dp: 1 },
  { name: "air-track glider", lo: 0.1, hi: 1, dp: 2 },
];
const pairMass = (pair, rng) =>
  pair.step ? pair.step * rng.int(pair.lo / pair.step, pair.hi / pair.step) : rng.int(pair.lo * 10 ** pair.dp, pair.hi * 10 ** pair.dp) / 10 ** pair.dp;
const PUSHED = ["trolley", "sledge", "boat", "cart", "go-kart", "canoe"];
const BALLS = [
  ["tennis ball", 58], ["football", 430], ["cricket ball", 160], ["golf ball", 46], ["hockey puck", 170], ["basketball", 620],
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function genMomentum(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return momentumMulti(rng);
  const kinds =
    d === "easy" ? ["p", "p-v", "explode", "ift-dp", "ift-F"]
      : d === "medium" ? ["p", "p-v", "p-m", "stick", "explode", "impulse-F"]
        : ["p", "p-v", "stick", "stick-opp", "explode", "impulse-F", "bounce-F"];
  const kind = rng.pick(kinds);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";

  if (kind === "p" || kind === "p-v" || kind === "p-m") {
    const unknown = kind === "p" ? "p" : kind.slice(2);
    let m, v, p;
    const units = {};
    if (d === "easy") {
      m = rng.int(1, 30);
      v = rng.int(1, 15);
    } else if (d === "medium") {
      const r = rng.next();
      if (unknown === "p" && r < 0.3) {
        m = rng.int(50, 2000);
        v = rng.int(2, 30);
        units.v = "km/h";
      } else if (unknown === "p" && r < 0.6) {
        m = (100 * rng.int(1, 9)) / 1000;
        v = 10 * rng.int(1, 5);
        units.m = "g";
      } else {
        m = rng.int(2, 120);
        v = rng.int(2, 30);
      }
    } else {
      if (rng.next() < 0.3 && unknown !== "m") {
        units.m = "g";
        m = rng.int(40, 3000) / 1000;
      } else m = rng.int(5, 20000) / 10;
      v = rng.int(5, 400) / 10;
      if (unknown === "p" && !units.m && rng.next() < 0.35) {
        units.v = "km/h";
        v = rng.int(10, 130) / 3.6;
      }
      if (unknown !== "p") p = Math.max(0.1, fix(Math.round(m * v * 10) / 10)); // stated to 1 decimal
    }
    if (p === undefined) p = fix(m * v);
    const body = units.m && d === "medium" ? rng.pick(["ball", "hockey puck"]) : bodyFor(unknown === "m" ? p / v : m, rng);
    const mShown = fix(units.m ? m * 1000 : m);
    const vShown = fix(units.v ? v * 3.6 : v);
    const values = { p, m: mShown, v: vShown };
    delete values[unknown];
    const { C } = labeler(units);
    const conv = convSteps(values, units, unknown);
    let prompt, exact, unit, steps, hints, candidates;
    if (unknown === "p") {
      exact = m * v;
      unit = "kg m/s";
      prompt = `A ${num(mShown)} ${units.m || "kg"} ${body} moves at ${num(vShown)} ${units.v || "m/s"}. What is its momentum, in kg m/s?${end}`;
      steps = ["Momentum = mass × velocity: `p = m × v`, with m in kg and v in m/s.", ...conv, `\`p = ${num(m)} × ${num(v)}\``];
      hints = [
        `Use \`p = m × v\`.${conv.length ? ` Convert to ${units.m ? "kg" : "m/s"} first.` : ""}`,
        `Substitute: \`p = ${num(m)} × ${num(v)}\` (in the calculator: \`${C("m")} * ${C("v")}\`).${thenRound}`,
      ];
      candidates = [mShown * vShown, 0.5 * m * v * v, m / v, m + v];
    } else if (unknown === "v") {
      exact = p / m;
      unit = "m/s";
      prompt = `A ${num(mShown)} ${units.m || "kg"} ${body} has a momentum of ${num(p)} kg m/s. What is its velocity, in m/s?${end}`;
      steps = ["Rearrange `p = m × v` to `v = p / m`, with m in kg.", ...conv, `\`v = ${num(p)} / ${num(m)}\``];
      hints = [
        `Rearrange \`p = m × v\` to \`v = p / m\`.${units.m ? " Convert the mass to kg first." : ""}`,
        `Substitute: \`v = ${num(p)} / ${num(m)}\` (in the calculator: \`_p / ${C("m")}\`).${thenRound}`,
      ];
      candidates = [p * m, m / p, p / mShown, p - m];
    } else {
      exact = p / v;
      unit = "kg";
      prompt = `A ${body} moving at ${num(v)} m/s has a momentum of ${num(p)} kg m/s. What is its mass, in kg?${end}`;
      steps = ["Rearrange `p = m × v` to `m = p / v`.", `\`m = ${num(p)} / ${num(v)}\``];
      hints = [
        "Rearrange `p = m × v` to `m = p / v`.",
        `Substitute: \`m = ${num(p)} / ${num(v)}\` (in the calculator: \`_p / _v\`).${thenRound}`,
      ];
      candidates = [p * v, v / p, p - v];
    }
    return single({ prompt, exact, unit, rounded, formula: "mom", unknown, values, units, steps, hints, candidates }, rng);
  }

  if (kind === "stick" || kind === "stick-opp") {
    const pair = d === "medium" ? PAIRS[0] : rng.pick(PAIRS);
    const opp = kind === "stick-opp";
    let m1, m2, u1, u2 = 0;
    if (d === "medium") {
      [m1, m2, u1] = draw(rng, () => [rng.int(1, 12), rng.int(1, 12), rng.int(2, 15)], ([a, b, c]) => (a * c) % (a + b) === 0);
      if ((m1 * u1) % (m1 + m2)) { m2 = m1; u1 = 2 * rng.int(1, 7); } // fallback: equal masses, even speed
    } else {
      const same = !opp && rng.next() < 0.3;
      [m1, m2, u1, u2] = draw(
        rng,
        () => [
          pairMass(pair, rng),
          pairMass(pair, rng),
          rng.int(5, 80) / 10,
          opp || same ? rng.int(5, 60) / 10 : 0,
        ],
        ([a, b, c, e]) => !opp || Math.abs((a * c - b * e) / (a + b)) >= 0.1,
      );
    }
    const dir = opp ? -1 : 1;
    const before = m1 * u1 + dir * m2 * u2;
    const exact = before / (m1 + m2);
    const B = pair.name;
    const A = pair.name;
    let prompt;
    if (!u2) prompt = `A ${num(m1)} kg ${A} moving at ${num(u1)} m/s hits a stationary ${num(m2)} kg ${B}, and they stick together. What is their speed just after the collision, in m/s?${end}`;
    else if (!opp) prompt = `A ${num(m1)} kg ${A} moving at ${num(u1)} m/s catches up with a ${num(m2)} kg ${B} moving the same way at ${num(u2)} m/s. They stick together. What is their speed just after the collision, in m/s?${end}`;
    else prompt = `A ${num(m1)} kg ${A} moves right at ${num(u1)} m/s. Another ${num(m2)} kg ${B} moves left at ${num(u2)} m/s. They collide head-on and stick together. What is their velocity just after the collision, in m/s? Take right as positive, so a negative answer means they move left.${end}`;
    const values = { m1, u1, m2, u2, dir };
    const sign = opp ? "-" : "+";
    const beforeTxt = u2 ? `${num(m1)} × ${num(u1)} ${sign} ${num(m2)} × ${num(u2)}` : `${num(m1)} × ${num(u1)} + ${num(m2)} × 0`;
    const calcBefore = u2 ? `_m1 * _u1 ${sign} _m2 * _u2` : "_m1 * _u1";
    return single({
      prompt, exact, unit: "m/s", rounded, formula: "stick", unknown: "v", values, units: {}, skip: u2 ? ["dir"] : ["dir", "u2"],
      steps: [
        `Momentum is conserved: total momentum before = total momentum after. Afterwards they move together as one mass, \`m1 + m2\`.${opp ? " Moving left counts as negative." : ""}`,
        `Before: \`${beforeTxt} = ${num(before)}\` kg m/s.`,
        `After: \`(${num(m1)} + ${num(m2)}) × v = ${num(before)}\`, so \`v = ${num(before)} / ${num(m1 + m2)}\``,
      ],
      hints: [
        `Total momentum before the collision equals total momentum after.${u2 ? "" : " The stationary one has zero momentum."}${opp ? " The one moving left has negative velocity." : ""}`,
        "After sticking together they move as one object of mass `m1 + m2` with a single velocity v.",
        `So \`v = (${beforeTxt}) / (${num(m1)} + ${num(m2)})\` (in the calculator: \`(${calcBefore}) / (_m1 + _m2)\`).${thenRound}`,
      ],
      candidates: [
        before / m1,
        (m1 * u1 + m2 * u2) / (m1 + m2),
        (m1 * u1 - m2 * u2) / (m1 + m2),
        before / m2,
        (u1 + u2) / 2,
        -exact,
      ],
    }, rng);
  }

  if (kind === "explode") {
    // m1 is the lighter thrown/fired/pushed object, m2 recoils. Easy/medium keep v2 whole.
    const scen = rng.pick(d === "easy" ? ["trolleys", "skaters"] : d === "medium" ? ["trolleys", "skaters", "cannon"] : ["trolleys", "skaters", "cannon", "astronaut", "rifle", "boat"]);
    let m1, m2, v1, unitsM1 = false;
    if (d !== "hard") {
      const R = {
        trolleys: () => [rng.int(1, 6), rng.int(2, 12), rng.int(1, 12)],
        skaters: () => [5 * rng.int(6, 12), 5 * rng.int(8, 20), rng.int(1, 8)],
        cannon: () => [rng.int(2, 20), 100 * rng.int(2, 20), 10 * rng.int(5, 30)],
      }[scen];
      [m1, m2, v1] = draw(rng, R, ([a, b, c]) => a < b && Number.isInteger((a * c) / b));
      if (!(m1 < m2 && Number.isInteger((m1 * v1) / m2))) [m1, m2, v1] = scen === "cannon" ? [10, 1000, 200] : scen === "skaters" ? [40, 80, 4] : [2, 4, 6];
    } else {
      unitsM1 = scen === "rifle";
      const R = {
        trolleys: () => [rng.int(5, 30) / 10, rng.int(10, 60) / 10, rng.int(2, 40) / 10],
        skaters: () => [rng.int(300, 700) / 10, rng.int(400, 1000) / 10, rng.int(5, 60) / 10],
        cannon: () => [rng.int(20, 200) / 10, 10 * rng.int(20, 200), rng.int(50, 300)],
        astronaut: () => [rng.int(10, 100) / 10, rng.int(700, 1500) / 10, rng.int(10, 80) / 10],
        rifle: () => [rng.int(5, 20) / 1000, rng.int(30, 60) / 10, rng.int(300, 900)],
        boat: () => [rng.int(400, 900) / 10, 10 * rng.int(10, 40), rng.int(10, 50) / 10],
      }[scen];
      [m1, m2, v1] = draw(rng, R, ([a, b]) => a < b);
    }
    const units = unitsM1 ? { m1: "g" } : {};
    const m1Shown = fix(unitsM1 ? m1 * 1000 : m1);
    const M1 = `${num(m1Shown)} ${unitsM1 ? "g" : "kg"}`;
    const texts = {
      trolleys: `Two trolleys of mass ${M1} and ${num(m2)} kg are held at rest with a compressed spring between them. When it is released, the ${M1} trolley moves off at ${num(v1)} m/s. How fast does the ${num(m2)} kg trolley move, in m/s?`,
      skaters: `Two ice skaters stand still, facing each other. One has a mass of ${M1} and the other ${num(m2)} kg. They push off, and the ${M1} skater moves away at ${num(v1)} m/s. How fast does the ${num(m2)} kg skater move away, in m/s?`,
      cannon: `A ${num(m2)} kg cannon at rest fires a ${M1} cannonball at ${num(v1)} m/s. How fast does the cannon recoil, in m/s?`,
      astronaut: `A ${num(m2)} kg astronaut floats still in space and throws a ${M1} tool bag away at ${num(v1)} m/s. How fast does the astronaut move in the opposite direction, in m/s?`,
      rifle: `A ${num(m2)} kg rifle at rest fires a ${M1} bullet at ${num(v1)} m/s. How fast does the rifle recoil, in m/s?`,
      boat: `A ${num(m2)} kg boat floats at rest. A ${M1} swimmer dives off the back at ${num(v1)} m/s. How fast does the boat move forward, in m/s?`,
    };
    const exact = (m1 * v1) / m2;
    const values = { m1: m1Shown, v1, m2 };
    const { C } = labeler(units);
    return single({
      prompt: texts[scen] + end, exact, unit: "m/s", rounded, formula: "explode", unknown: "v2", values, units,
      steps: [
        "Everything starts at rest, so the total momentum is zero before and after. The two parts get equal and opposite momentum: `m1 × v1 = m2 × v2`.",
        ...(unitsM1 ? [`Convert first: ${convLine(m1Shown, "g")}.`] : []),
        `\`v2 = ${num(m1)} × ${num(v1)} / ${num(m2)}\``,
      ],
      hints: [
        "The total momentum starts at zero, so afterwards the two momenta are equal in size and opposite in direction.",
        `Set \`m1 × v1 = m2 × v2\` and solve for v2.${unitsM1 ? " Convert the grams to kg first." : ""}`,
        `Substitute: \`v2 = ${num(m1)} × ${num(v1)} / ${num(m2)}\` (in the calculator: \`${C("m1")} * _v1 / _m2\`).${thenRound}`,
      ],
      candidates: [(m2 * v1) / m1, m1 * v1, (m1 * v1) / (m1 + m2), v1, (m1Shown * v1) / m2],
    }, rng);
  }

  if (kind === "ift-dp" || kind === "ift-F") {
    const body = rng.pick(PUSHED);
    const F = 10 * rng.int(1, 60);
    const t = rng.int(1, 10);
    const dp = F * t;
    if (kind === "ift-dp") {
      return single({
        prompt: `A steady force of ${F} N acts on a ${body} for ${t} s. By how much does its momentum change, in kg m/s?`,
        exact: dp, unit: "kg m/s", rounded: false, formula: "ift", unknown: "dp", values: { F, t }, units: {},
        steps: ["Impulse = force × time = change in momentum (dp): `dp = F × t`.", `\`dp = ${F} × ${t}\``],
        hints: [
          "The change in momentum equals the impulse, force × time: `dp = F × t`.",
          `Substitute: \`dp = ${F} × ${t}\` (in the calculator: \`_F * _t\`).`,
        ],
        candidates: [F / t, F + t, t / F],
      }, rng);
    }
    return single({
      prompt: `The momentum of a ${body} changes by ${dp} kg m/s in ${t} s. What average force acts on it, in N?`,
      exact: F, unit: "N", rounded: false, formula: "ift", unknown: "F", values: { dp, t }, units: {},
      steps: ["Rearrange `dp = F × t` to `F = dp / t`.", `\`F = ${dp} / ${t}\``],
      hints: [
        "Force = rate of change of momentum: `F = dp / t`.",
        `Substitute: \`F = ${dp} / ${t}\` (in the calculator: \`_dp / _t\`).`,
      ],
      candidates: [dp * t, t / dp, dp - t],
    }, rng);
  }

  if (kind === "impulse-F") {
    const [ball, grams] = rng.pick(BALLS);
    let m, u, v, t;
    if (d === "medium") {
      [m, u, v, t] = draw(
        rng,
        () => {
          const mm = rng.int(1, 10);
          const uu = rng.int(0, 10);
          return [mm, uu, uu + rng.int(2, 20), rng.pick([0.1, 0.2, 0.25, 0.5])];
        },
        ([mm, uu, vv, tt]) => Number.isInteger(clean((mm * (vv - uu)) / tt)),
      );
      const exact = clean((m * (v - u)) / t);
      const body = rng.pick(["trolley", "cart", "go-kart", "sledge"]);
      return single({
        prompt: `A ${m} kg ${body} speeds up from ${u ? `${u} m/s` : "rest"} to ${v} m/s in ${num(t)} s. What average resultant force acts on it, in N?`,
        exact, unit: "N", rounded: false, formula: "impulse", unknown: "F", values: { m, u, v, t }, units: {}, skip: u ? [] : ["u"],
        steps: ["Force = change in momentum / time: `F = m × (v - u) / t`.", `Change in momentum: \`${m} × (${v} - ${u}) = ${m * (v - u)}\` kg m/s.`, `\`F = ${m * (v - u)} / ${num(t)}\``],
        hints: [
          `First find the change in momentum: \`dp = m × (v - u)\`.${u ? "" : " From rest means u = 0."}`,
          `Then divide by the time: \`F = ${m} × (${v} - ${u}) / ${num(t)}\` (in the calculator: \`_m * (_v - ${u ? "_u" : "0"}) / _t\`).`,
        ],
        candidates: [m * (v - u) * t, (m * v) / t, (m * (v + u)) / t, m * (v - u)],
      }, rng);
    }
    // hard: ball kicked/hit from rest, contact time in ms
    m = grams;
    const units = { m: "g", t: "ms" };
    v = rng.int(50, 600) / 10;
    t = rng.int(3, 40) / 2; // ms
    const exact = ((m / 1000) * v) / (t / 1000);
    const { C } = labeler(units);
    return single({
      prompt: `A ${m} g ${ball} at rest is struck and leaves at ${num(v)} m/s. The contact lasts ${num(t)} ms. What average force acts on the ball, in N?${end}`,
      exact, unit: "N", rounded, formula: "impulse", unknown: "F", values: { m, v, t, u: 0 }, units, skip: ["u"],
      steps: [
        "Force = change in momentum / time: `F = m × (v - u) / t`, with m in kg and t in s. It starts at rest, so u = 0.",
        `Convert first: ${convLine(m, "g")} and ${convLine(t, "ms")}.`,
        `\`F = ${num(m / 1000)} × ${num(v)} / ${num(t / 1000)}\``,
      ],
      hints: [
        "Force = change in momentum / time. Starting from rest, the change in momentum is `m × v`.",
        "Convert grams to kg and milliseconds to seconds (divide both by 1000).",
        `Substitute: \`F = ${num(m / 1000)} × ${num(v)} / ${num(t / 1000)}\` (in the calculator: \`${C("m")} * _v / ${C("t")}\`).${thenRound}`,
      ],
      candidates: [m * v / t, (m / 1000) * v * (t / 1000), (m * v) / (t / 1000), ((m / 1000) * v) / t],
    }, rng);
  }

  // bounce-F (hard): ball hits a wall at u, rebounds at v; F = m(u + v) / t.
  const [ball, grams] = rng.pick(BALLS);
  const m = grams;
  const u = rng.int(50, 400) / 10;
  const v = rng.int(20, Math.round(u * 10) - 5) / 10;
  const t = rng.int(5, 80); // ms
  const units = { m: "g", t: "ms" };
  const exact = ((m / 1000) * (u + v)) / (t / 1000);
  const { C } = labeler(units);
  return single({
    prompt: `A ${m} g ${ball} hits a wall at ${num(u)} m/s and bounces straight back at ${num(v)} m/s. It is in contact with the wall for ${t} ms. What is the average force of the wall on the ball, in N?${end}`,
    exact, unit: "N", rounded, formula: "bounce", unknown: "F", values: { m, u, v, t }, units,
    steps: [
      "The velocity reverses, so the change in velocity is `u + v` (from +u to -v). Then `F = m × (u + v) / t`, with m in kg and t in s.",
      `Convert first: ${convLine(m, "g")} and ${convLine(t, "ms")}.`,
      `Change in momentum: \`${num(m / 1000)} × (${num(u)} + ${num(v)}) = ${num((m / 1000) * (u + v))}\` kg m/s.`,
      `\`F = ${num((m / 1000) * (u + v))} / ${num(t / 1000)}\``,
    ],
    hints: [
      "The ball changes direction. Taking its first direction as positive, it goes from +u to -v, so the change in velocity has size `u + v`, not `u - v`.",
      "Convert grams to kg and milliseconds to seconds, then use `F = dp / t`.",
      `Substitute: \`F = ${num(m / 1000)} × (${num(u)} + ${num(v)}) / ${num(t / 1000)}\` (in the calculator: \`${C("m")} * (_u + _v) / ${C("t")}\`).${thenRound}`,
    ],
    candidates: [((m / 1000) * (u - v)) / (t / 1000), ((m / 1000) * u) / (t / 1000), (m * (u + v)) / t, ((m / 1000) * (u + v)) * (t / 1000)],
  }, rng);
}

// Hard multi-part: collision (momentum before, velocity after) or bounce (change in momentum, force).
function momentumMulti(rng) {
  if (rng.next() < 0.5) {
    const pair = rng.pick(PAIRS);
    const [m1, m2, u1, u2] = draw(
      rng,
      () => [pairMass(pair, rng), pairMass(pair, rng), rng.int(5, 80) / 10, rng.int(5, 60) / 10],
      ([a, b, c, e]) => Math.abs((a * c - b * e) / (a + b)) >= 0.1,
    );
    const before = m1 * u1 - m2 * u2;
    const v = before / (m1 + m2);
    const values = { m1, u1, m2, u2, dir: -1 };
    const B = pair.name;
    const explanation = [
      "Take right as positive, so the one moving left has a negative velocity. Momentum is conserved.",
      `1. Total momentum before: \`${num(m1)} × ${num(u1)} - ${num(m2)} × ${num(u2)}\` ${result(before, true, "kg m/s")}`,
      `2. Afterwards they move together: \`v = ${num(before)} / (${num(m1)} + ${num(m2)})\` ${result(v, true, "m/s")}`,
    ].join("\n\n");
    return multi(
      `A ${num(m1)} kg ${pair.name} moves right at ${num(u1)} m/s. Another ${num(m2)} kg ${B} moves left at ${num(u2)} m/s. They collide head-on and stick together. Take right as positive, so a negative answer means left.`,
      [
        numPart("before", "Total momentum", `What is the total momentum before the collision, in kg m/s?${DP}`, before,
          "Add the two momenta, with the left-moving one negative (in the calculator: `_m1 * _u1 - _m2 * _u2`).", { formula: "ptot", unknown: "p", values, units: {} }),
        numPart("after", "Velocity after", `What is their velocity just after the collision, in m/s?${DP}`, v,
          "The same total momentum is shared by the combined mass `m1 + m2` (in the calculator: `(_m1 * _u1 - _m2 * _u2) / (_m1 + _m2)`).", { formula: "stick", unknown: "v", values, units: {} }),
      ],
      explanation, values, {}, ["dir"],
    );
  }
  const [ball, grams] = rng.pick(BALLS);
  const m = grams;
  const u = rng.int(50, 400) / 10;
  const v = rng.int(20, Math.round(u * 10) - 5) / 10;
  const t = rng.int(5, 80);
  const units = { m: "g", t: "ms" };
  const dp = (m / 1000) * (u + v);
  const F = dp / (t / 1000);
  const values = { m, u, v, t };
  const explanation = [
    "The ball reverses, so its velocity changes by `u + v`. Work in kg and seconds.",
    `Convert: ${convLine(m, "g")} and ${convLine(t, "ms")}.`,
    `1. Change in momentum: \`${num(m / 1000)} × (${num(u)} + ${num(v)})\` ${result(dp, true, "kg m/s")}`,
    `2. Average force: \`F = dp / t = ${num(dp)} / ${num(t / 1000)}\` ${result(F, true, "N")}`,
  ].join("\n\n");
  return multi(
    `A ${m} g ${ball} hits a wall at ${num(u)} m/s and bounces straight back at ${num(v)} m/s. It touches the wall for ${t} ms.`,
    [
      numPart("dp", "Change in momentum", `What is the size of the change in momentum, in kg m/s?${DP}`, dp,
        "The direction reverses, so the change in velocity is `u + v`. Use the mass in kg (in the calculator: `(_m_g / 1000) * (_u + _v)`).", { formula: "dpb", unknown: "dp", values: { m, u, v }, units: { m: "g" } }),
      numPart("force", "Average force", `What is the average force on the ball, in N?${DP}`, F,
        "Divide the change in momentum by the contact time in seconds (in the calculator: `(_m_g / 1000) * (_u + _v) / (_t_ms / 1000)`).", { formula: "bounce", unknown: "F", values, units }),
    ],
    explanation, values, units,
  );
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "forces") return genForces(difficulty, rng);
  if (subtopic === "work-power") return genWork(difficulty, rng);
  if (subtopic === "energy") return genEnergy(difficulty, rng);
  if (subtopic === "momentum") return genMomentum(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------
// Independent check: convert every stated value to SI with its own table, substitute the answer back
// into the un-rearranged law (or, for falls and throws, an energy balance instead of v² = u² + 2gh),
// and look at the residual. Whole-number answers must be integers that satisfy the law exactly;
// a rounded answer x is right when the law changes sign between x - 0.005 and x + 0.005.

const SI_FACTOR = { g: 0.001, "km/h": 1000 / 3600, min: 60, kJ: 1000, km: 1000, kN: 1000, ms: 0.001 };

const LAWS = {
  fma: (k) => k.F - k.m * k.a,
  weight: (k) => k.W - k.m * k.g,
  resultant: (k) => k.R - Math.abs(k.F1 + k.dir * k.F2),
  net: (k) => k.R - (k.F - k.fric),
  "net-a": (k) => k.m * k.a - (k.F - k.fric),
  "lift-R": (k) => k.R - (k.T - k.m * k.g),
  "lift-a": (k) => k.m * k.a - (k.T - k.m * k.g),
  work: (k) => k.W - k.F * k.d,
  power: (k) => k.P * k.t - k.E,
  "power-fd": (k) => k.P * k.t - k.F * k.d,
  pfv: (k) => k.P - k.F * k.v,
  eff: (k) => k.eff * k.Ein - 100 * k.Eout,
  waste: (k) => k.Ew + k.Eout - k.Ein,
  ke: (k) => 2 * k.Ek - k.m * k.v * k.v,
  gpe: (k) => k.Ep - k.m * k.g * k.h,
  fall: (k) => 0.5 * k.m * k.v * k.v - 0.5 * k.m * (k.u || 0) ** 2 - k.m * k.g * k.h,
  rise: (k) => 0.5 * k.m * k.u * k.u - k.m * k.g * k.h,
  mom: (k) => k.p - k.m * k.v,
  ptot: (k) => k.p - (k.m1 * k.u1 + k.dir * k.m2 * k.u2),
  stick: (k) => k.m1 * k.u1 + k.dir * k.m2 * k.u2 - (k.m1 + k.m2) * k.v,
  explode: (k) => k.m1 * k.v1 - k.m2 * k.v2,
  ift: (k) => k.dp - k.F * k.t,
  impulse: (k) => k.F * k.t - k.m * (k.v - (k.u || 0)),
  bounce: (k) => k.F * k.t - k.m * (k.u + k.v),
  dpb: (k) => k.dp - k.m * (k.u + k.v),
};
// Quantities that may legitimately be negative in a given law; everything else must be ≥ 0.
const SIGNED = { "lift-R": ["R"], "lift-a": ["a"], ptot: ["p"], stick: ["v"] };
const STRICT_POS = ["m", "m1", "m2", "t", "d", "h", "Ein", "g"];

function checkOne(spec, answer) {
  if (!spec || !LAWS[spec.formula] || !spec.values || !spec.unknown) return false;
  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  const units = spec.units || {};
  const law = LAWS[spec.formula];
  const signed = SIGNED[spec.formula] || [];
  const at = (val) => {
    const k = {};
    for (const [key, raw] of Object.entries({ ...spec.values, [spec.unknown]: val })) {
      k[key] = units[key] ? raw * SI_FACTOR[units[key]] : raw;
    }
    return k;
  };
  const k = at(x);
  for (const [key, val] of Object.entries(k)) {
    if (key === "dir") continue;
    if (typeof val !== "number" || !Number.isFinite(val)) return false;
    if (STRICT_POS.includes(key) && !(val > 0)) return false;
    if (!signed.includes(key) && val < 0) return false;
  }
  const r = law(k);
  const step = 1e-4 * Math.max(1, Math.abs(x));
  const sens = Math.abs(law(at(x + step)) - law(at(x - step))) / (2 * step);
  if (!Number.isFinite(r) || !(sens > 0)) return false;
  if (!spec.rounded) return Number.isInteger(x) && Math.abs(r) / sens <= 1e-6;
  // Rounded: the true value must lie within ±0.005 of x, i.e. the law changes sign across that bracket.
  // A true value exactly on the edge (a rounding tie) belongs to x only if it rounds half away from zero to x.
  const h = 0.005;
  const lo = law(at(x - h));
  const hi = law(at(x + h));
  const eps = 1e-7 * sens;
  const roundsTo = (v) => Math.abs((Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-6)) / 100 - x) < 1e-9;
  if (Math.abs(lo) <= eps) return roundsTo(x - h);
  if (Math.abs(hi) <= eps) return roundsTo(x + h);
  return lo * hi < 0;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false; // regenerate from the seed to get params back
  if (p.multi) {
    if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
    return p.parts.length === question.parts.length && p.parts.every((spec) => checkOne(spec, answer[spec.id]));
  }
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  return checkOne(p, answer);
}
