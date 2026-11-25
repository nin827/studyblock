// Thermal Physics generator. Uses only the seeded rng passed in by the engine.
// SI units (kg, J, s, W, °C / K). Every constant (specific heat capacity, latent heat, the kelvin offset)
// is stated in the prompt. Medium questions sometimes state a value in g, kJ, kJ/kg, kW or minutes,
// so a conversion is part of the work. Easy/medium answers are whole numbers; hard answers are rounded
// to 2 decimal places (tolerance 0.005), matching Kinematics and Forces & Energy.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
// Display values: strip binary noise.
const fix = (n) => Math.round(n * 1e6) / 1e6;
// Whole-number answers: snap tiny binary error to the integer.
const clean = (n) => (Math.abs(n - Math.round(n)) < 1e-7 ? Math.round(n) : n);
const isInt = (n) => Math.abs(n - Math.round(n)) < 1e-7;

function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const an = (w) => (/^[aeiou]/i.test(w) || /^8/.test(w) || /^1[18](\D|$)/.test(w) ? `an ${w}` : `a ${w}`);
const An = (w) => cap(an(w));
const DP = " Round to 2 decimal places.";
const THEN = " Then round to 2 decimal places.";

// Thrown when a draw would give a rounding tie or a non-whole answer; generate() redraws with the same rng.
class Retry extends Error {}
const isTie = (x) => {
  const f = Math.abs(x) * 100;
  return Math.abs(f - Math.floor(f) - 0.5) < 1e-6;
};

// ---------------------------------------------------------------------------------------------
// Units. A value stated in a non-SI unit keeps that number in the prompt and in its calculator row,
// whose label gets a unit suffix (_m_g, _E_kJ, _t_min ...).

const CONV = {
  g: { si: "kg", f: 1 / 1000, suffix: "g", calc: "/ 1000", how: "divide by 1000" },
  kJ: { si: "J", f: 1000, suffix: "kJ", calc: "* 1000", how: "multiply by 1000" },
  "kJ/kg": { si: "J/kg", f: 1000, suffix: "kJkg", calc: "* 1000", how: "multiply by 1000" },
  kW: { si: "W", f: 1000, suffix: "kW", calc: "* 1000", how: "multiply by 1000" },
  min: { si: "s", f: 60, suffix: "min", calc: "* 60", how: "multiply by 60" },
};

function labeler(units) {
  const L = (k) => `_${k}${units[k] ? "_" + CONV[units[k]].suffix : ""}`;
  const C = (k) => (units[k] ? `(${L(k)} ${CONV[units[k]].calc})` : L(k));
  return { L, C };
}
function convLine(v, u) {
  const s = v * CONV[u].f;
  const eq = Math.abs(s - Math.round(s * 10000) / 10000) > 1e-9 ? "≈" : "=";
  return `${num(v)} ${u} ${eq} ${num(s)} ${CONV[u].si}`;
}
function convSteps(values, units, unknown) {
  return Object.keys(units)
    .filter((k) => k !== unknown && values[k] !== undefined)
    .map((k) => `Convert first: ${convLine(values[k], units[k])} (${CONV[units[k]].how}).`);
}
function givenFrom(values, units, unknown, skip = []) {
  const { L } = labeler(units);
  return Object.entries(values)
    .filter(([k, v]) => k !== unknown && !skip.includes(k) && typeof v === "number")
    .map(([k, value]) => ({ label: L(k), value }));
}
function result(exact, rounded, unit) {
  const shown = fmtAns(exact, rounded);
  const u = unit ? (unit.startsWith("°") ? unit : ` ${unit}`) : "";
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${exact.toFixed(4)}${u}, which rounds to **${shown}${u}**`;
}
const withUnit = (v, unit) => (unit.startsWith("°") ? `${v}${unit}` : `${v} ${unit}`);

function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v, strict) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (Number(s) === 0 && correct !== 0) return;
    if (strict && correct !== 0) {
      const ratio = Math.abs(v / correct);
      if (ratio > 1000 || ratio < 0.001) return;
    }
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach((v) => tryAdd(v, true));
  const step = rounded ? Math.max(0.01, round2(Math.abs(correct) * 0.07)) : Math.max(1, Math.round(Math.abs(correct) * 0.07));
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k * step, false);
    tryAdd(correct - k * step, false);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// q: { prompt, exact, unit, rounded, formula, unknown, values, units, steps, hints, candidates, skip }
function single(q, rng) {
  const { exact, rounded } = q;
  if (!Number.isFinite(exact)) throw new Error("non-finite answer");
  if (rounded && isTie(exact)) throw new Retry();
  if (!rounded && !isInt(exact)) throw new Retry();
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

function numPart(id, label, ask, exact, hint, spec) {
  if (isTie(exact)) throw new Retry();
  return {
    part: { id, label, ask, answerType: "number", answer: round2(exact), tolerance: 0.005, hint },
    spec: { id, ...spec, rounded: true },
  };
}
function multi(prompt, partList, explanation, values, units, skip = []) {
  const q = {
    prompt,
    answerType: "multi",
    parts: partList.map((p) => p.part),
    explanation,
    params: { multi: true, parts: partList.map((p) => p.spec) },
  };
  const given = givenFrom(values, units, null, skip);
  if (given.length) q.given = given;
  return q;
}
function draw(make, ok, tries = 80) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = make();
    if (ok(v)) return v;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Materials. Values are typical textbook figures; every question states the one it uses ("take c = ...").

const SOLIDS = [
  { mat: "aluminium", c: 900, items: ["aluminium block", "aluminium pan", "aluminium baking tray", "aluminium engine part"] },
  { mat: "copper", c: 385, items: ["copper block", "copper pipe", "copper kettle base", "copper cylinder"] },
  { mat: "iron", c: 450, items: ["iron bar", "iron pan", "iron horseshoe", "iron block"] },
  { mat: "steel", c: 490, items: ["steel rod", "steel bolt", "steel plate", "steel tool"] },
  { mat: "lead", c: 130, items: ["lead weight", "lead block", "lead sheet"] },
  { mat: "glass", c: 840, items: ["glass dish", "glass bottle", "glass slab"] },
  { mat: "concrete", c: 880, items: ["concrete slab", "concrete block", "concrete step"] },
  { mat: "brass", c: 380, items: ["brass block", "brass weight", "brass door knob"] },
];
const LIQUIDS = [
  { mat: "water", c: 4200, maxT: 95, items: ["kettle", "beaker", "saucepan", "hot-water tank", "fish tank", "flask"] },
  { mat: "cooking oil", c: 2000, maxT: 180, items: ["frying pan", "deep-fat fryer", "beaker"] },
  { mat: "ethanol", c: 2400, maxT: 70, items: ["beaker", "flask", "bottle"] },
];
const WATER = LIQUIDS[0];

// "An aluminium pan of mass 2 kg" or "A kettle holds 2 kg of water"
function subject(m, mUnit, mat, rng) {
  const item = rng.pick(mat.items);
  if (SOLIDS.includes(mat)) return { lead: `${An(item)} has a mass of ${num(m)} ${mUnit}`, it: `the ${item}` };
  return { lead: `${An(item)} holds ${num(m)} ${mUnit} of ${mat.mat}`, it: `the ${mat.mat}` };
}
const cLine = (mat) => `Take the specific heat capacity of ${mat.mat} as ${mat.c} J/kg °C.`;

// ---------------------------------------------------------------------------------------------
// Specific heat capacity: E = m × c × ΔT

function genSpecific(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return specificMulti(rng);
  const kinds = d === "easy" ? ["E", "E", "dT", "m"] : ["E", "m", "c", "dT", "T2"];
  const kind = rng.pick(kinds);
  const mats = kind === "c" ? SOLIDS.filter((x) => !["glass", "concrete"].includes(x.mat)) : rng.next() < 0.5 ? SOLIDS : LIQUIDS;
  const mat = rng.pick(mats);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";

  let m, inG = false, dT, T1, T2, dir = 1, Eunit = "J";
  if (d === "easy") {
    m = rng.int(1, 12);
    dT = rng.int(2, mat.c > 2000 ? 40 : 80);
    T1 = rng.int(10, 30);
  } else if (d === "medium") {
    inG = rng.next() < 0.4;
    m = inG ? (50 * rng.int(2, 40)) / 1000 : rng.int(1, 25);
    dT = rng.int(3, 60);
    T1 = rng.int(5, 40);
    Eunit = rng.next() < 0.5 ? "kJ" : "J";
  } else {
    inG = rng.next() < 0.35;
    m = inG ? rng.int(50, 2500) / 1000 : rng.int(15, 1500) / 100;
    dT = rng.int(15, 700) / 10;
    T1 = rng.int(50, 350) / 10;
    Eunit = "kJ";
  }
  if (d !== "easy" && rng.next() < 0.3) dir = -1; // cooling
  if (dir === 1) {
    T2 = fix(T1 + dT);
    if (mat.maxT && T2 > mat.maxT) throw new Retry();
  } else {
    T1 = fix(T1 + dT + (d === "hard" ? rng.int(0, 300) / 10 : rng.int(0, 30)));
    T2 = fix(T1 - dT);
    if (mat.maxT && T1 > mat.maxT) throw new Retry();
  }
  dT = fix(dir * (T2 - T1));
  const mShown = fix(inG ? m * 1000 : m);
  const mUnit = inG ? "g" : "kg";
  const units = {};
  if (inG) units.m = "g";
  const Ej = m * mat.c * dT; // J
  const useStated = d === "easy" ? rng.next() < 0.5 : false; // easy: "rises by ΔT" wording
  const { lead, it } = subject(mShown, mUnit, mat, rng);
  const heatWord = dir === 1 ? "heated" : "cools";
  const tempPhrase = useStated
    ? `${lead}. Its temperature rises by ${num(dT)} °C.`
    : dir === 1
      ? `${lead}. It is heated from ${num(T1)} °C to ${num(T2)} °C.`
      : `${lead}. It cools from ${num(T1)} °C to ${num(T2)} °C.`;
  const tempValues = useStated ? { dT } : { T1, T2, dir };
  const dTcalc = useStated ? "_dT" : dir === 1 ? "(_T2 - _T1)" : "(_T1 - _T2)";
  const dTtext = useStated ? `${num(dT)}` : dir === 1 ? `(${num(T2)} - ${num(T1)})` : `(${num(T1)} - ${num(T2)})`;
  const { C } = labeler(units);
  const mconv = inG ? [`Convert the mass first: ${convLine(mShown, "g")}.`] : [];

  if (kind === "E") {
    if (Eunit === "kJ") units.E = "kJ";
    const exact = Eunit === "kJ" ? Ej / 1000 : Ej;
    if (!rounded && !isInt(exact)) throw new Retry();
    const values = { m: mShown, c: mat.c, ...tempValues };
    const verb = dir === 1 ? "is needed" : "does it give out";
    return single({
      prompt: `${tempPhrase} ${cLine(mat)} How much energy ${verb}, in ${Eunit}?${end}`,
      exact, unit: Eunit, rounded, formula: "emc", unknown: "E", values, units, skip: ["dir"],
      steps: [
        "Use `E = m × c × ΔT`, with the mass in kg and ΔT the change in temperature.",
        ...mconv,
        ...(Eunit === "kJ" ? [`\`E = ${num(m)} × ${mat.c} × ${dTtext} = ${num(Ej)}\` J. Divide by 1000 for kJ:`, `\`E = ${num(Ej)} / 1000\``] : [`\`E = ${num(m)} × ${mat.c} × ${dTtext}\``]),
      ],
      hints: [
        `Energy to change temperature: \`E = m × c × ΔT\`.${inG ? " The mass must be in kg, so divide the grams by 1000." : ""}${useStated ? "" : " ΔT is the difference between the two temperatures."}`,
        `Substitute: \`E = ${num(m)} × ${mat.c} × ${dTtext}\` (in the calculator: \`${C("m")} * _c * ${dTcalc}\`).${Eunit === "kJ" ? " That gives joules: divide by 1000 for kJ." : ""}${thenRound}`,
      ],
      candidates: Eunit === "kJ" ? [Ej, mShown * mat.c * dT / 1000, m * mat.c / 1000, m * mat.c * (T2 + T1) / 1000] : [mShown * mat.c * dT, m * mat.c, m * mat.c * dT / 1000, m * dT],
    }, rng);
  }

  // Inverse questions state E. Easy/medium: E exact in J or kJ; hard: E in kJ to 1 decimal place.
  let Eshown, EU = d === "easy" ? "J" : rng.next() < 0.5 ? "kJ" : "J";
  if (d === "hard") {
    EU = "kJ";
    Eshown = fix(Math.round(Ej / 100) / 10);
    if (Eshown <= 0) throw new Retry();
  } else Eshown = EU === "kJ" ? fix(Ej / 1000) : fix(Ej);
  if (EU === "kJ") units.E = "kJ";
  const Esi = EU === "kJ" ? Eshown * 1000 : Eshown;
  const Etext = `${num(Eshown)} ${EU}`;
  const econv = EU === "kJ" ? [`Convert the energy first: ${convLine(Eshown, "kJ")}.`] : [];
  const C2 = labeler(units).C;
  const energyPhrase = dir === 1 ? `${Etext} of energy is supplied` : `it gives out ${Etext} of energy`;

  if (kind === "m") {
    const exact = inG ? (Esi / (mat.c * dT)) * 1000 : Esi / (mat.c * dT);
    const mat2 = mat;
    const item = SOLIDS.includes(mat2) ? rng.pick(mat2.items) : `sample of ${mat2.mat}`;
    const tp = useStated ? `its temperature rises by ${num(dT)} °C` : dir === 1 ? `it warms from ${num(T1)} °C to ${num(T2)} °C` : `it cools from ${num(T1)} °C to ${num(T2)} °C`;
    const values = { E: Eshown, c: mat.c, ...tempValues };
    const u2 = { ...units };
    delete u2.m;
    if (inG) u2.m = "g";
    return single({
      prompt: dir === 1
        ? `When ${Etext} of energy is supplied to ${an(item)}, ${tp}. ${cLine(mat2)} What is its mass, in ${mUnit}?${end}`
        : `${An(item)} gives out ${Etext} of energy as ${tp}. ${cLine(mat2)} What is its mass, in ${mUnit}?${end}`,
      exact, unit: mUnit, rounded, formula: "emc", unknown: "m", values, units: u2, skip: ["dir"],
      steps: [
        "Rearrange `E = m × c × ΔT` to `m = E / (c × ΔT)`. This gives the mass in kg.",
        ...econv,
        ...(inG ? [`\`m = ${num(Esi)} / (${mat.c} × ${dTtext}) = ${num(Esi / (mat.c * dT))}\` kg. Multiply by 1000 for grams:`, `\`m = ${num(Esi / (mat.c * dT))} × 1000\``] : [`\`m = ${num(Esi)} / (${mat.c} × ${dTtext})\``]),
      ],
      hints: [
        `Rearrange \`E = m × c × ΔT\` for the mass: \`m = E / (c × ΔT)\`.${EU === "kJ" ? " Use the energy in joules (× 1000)." : ""}`,
        `Substitute: \`m = ${num(Esi)} / (${mat.c} × ${dTtext})\` (in the calculator: \`${C2("E")} / (_c * ${dTcalc})\`).${inG ? " That is in kg: multiply by 1000 for grams." : ""}${thenRound}`,
      ],
      candidates: [Esi * mat.c * dT, Esi / mat.c, (Esi / (mat.c * dT)) * (inG ? 1 : 1000), Eshown / (mat.c * dT) * (inG ? 1000 : 1)],
    }, rng);
  }

  if (kind === "c") {
    const exact = Esi / (m * dT);
    const item = rng.pick(["block of an unknown metal", "metal cylinder", "sample of an unknown alloy", "metal bar"]);
    const values = { E: Eshown, m: mShown, ...tempValues };
    const tp = dir === 1 ? `its temperature rises from ${num(T1)} °C to ${num(T2)} °C` : `it cools from ${num(T1)} °C to ${num(T2)} °C`;
    return single({
      prompt: dir === 1
        ? `${An(item)} has a mass of ${num(mShown)} ${mUnit}. When ${Etext} of energy is supplied, ${tp}. What is its specific heat capacity, in J/kg °C?${end}`
        : `${An(item)} has a mass of ${num(mShown)} ${mUnit}. It gives out ${Etext} of energy as ${tp}. What is its specific heat capacity, in J/kg °C?${end}`,
      exact, unit: "J/kg °C", rounded, formula: "emc", unknown: "c", values, units, skip: ["dir"],
      steps: [
        "Rearrange `E = m × c × ΔT` to `c = E / (m × ΔT)`, with E in J and m in kg.",
        ...econv, ...mconv,
        `\`c = ${num(Esi)} / (${num(m)} × ${dTtext})\``,
      ],
      hints: [
        `Rearrange \`E = m × c × ΔT\` for c: \`c = E / (m × ΔT)\`. Use J and kg.${EU === "kJ" ? " Multiply the kJ by 1000." : ""}${inG ? " Divide the grams by 1000." : ""}`,
        `Substitute: \`c = ${num(Esi)} / (${num(m)} × ${dTtext})\` (in the calculator: \`${C2("E")} / (${C2("m")} * ${dTcalc})\`).${thenRound}`,
      ],
      candidates: [Esi / m, Esi / dT, Eshown / (m * dT), Esi / (mShown * dT), Esi * m * dT / 1e6],
    }, rng);
  }

  if (kind === "dT") {
    const exact = Esi / (m * mat.c);
    const values = { E: Eshown, m: mShown, c: mat.c };
    const item = subject(mShown, mUnit, mat, rng).lead;
    return single({
      prompt: `${item}. ${dir === 1 ? `It is given ${Etext} of energy` : `It gives out ${Etext} of energy as it cools`}. ${cLine(mat)} By how much does its temperature ${dir === 1 ? "rise" : "fall"}, in °C?${end}`,
      exact, unit: "°C", rounded, formula: "emc", unknown: "dT", values, units,
      steps: [
        "Rearrange `E = m × c × ΔT` to `ΔT = E / (m × c)`, with E in J and m in kg.",
        ...econv, ...mconv,
        `\`ΔT = ${num(Esi)} / (${num(m)} × ${mat.c})\``,
      ],
      hints: [
        `Rearrange \`E = m × c × ΔT\` for the temperature change: \`ΔT = E / (m × c)\`.${EU === "kJ" ? " Use joules." : ""}${inG ? " Use kg." : ""}`,
        `Substitute: \`ΔT = ${num(Esi)} / (${num(m)} × ${mat.c})\` (in the calculator: \`${C2("E")} / (${C2("m")} * _c)\`).${thenRound}`,
      ],
      candidates: [Esi / mat.c, Esi * m / mat.c, Eshown / (m * mat.c), Esi / (mShown * mat.c), exact + 20],
    }, rng);
  }

  // T2: final temperature from a start temperature (hard: E is stated to 0.1 kJ, so recompute)
  const exact = T1 + (dir * Esi) / (m * mat.c);
  const values = { E: Eshown, m: mShown, c: mat.c, T1, dir };
  const item = subject(mShown, mUnit, mat, rng).lead;
  const op = dir === 1 ? "+" : "-";
  return single({
    prompt: `${item}. It starts at ${num(T1)} °C. ${dir === 1 ? `It is given ${Etext} of energy` : `It gives out ${Etext} of energy as it cools`}. ${cLine(mat)} What is its final temperature, in °C?${end}`,
    exact, unit: "°C", rounded, formula: "emc", unknown: "T2", values, units, skip: ["dir"],
    steps: [
      `Find the temperature change with \`ΔT = E / (m × c)\`, then ${dir === 1 ? "add it to" : "subtract it from"} the starting temperature.`,
      ...econv, ...mconv,
      `\`ΔT = ${num(Esi)} / (${num(m)} × ${mat.c}) = ${num(Esi / (m * mat.c))}\` °C`,
      `\`T = ${num(T1)} ${op} ${num(Esi / (m * mat.c))}\``,
    ],
    hints: [
      `First find how much the temperature changes: \`ΔT = E / (m × c)\`, in J and kg.`,
      `Work out \`${num(Esi)} / (${num(m)} × ${mat.c})\` (in the calculator: \`${C2("E")} / (${C2("m")} * _c)\`), then ${dir === 1 ? "add it to" : "take it away from"} ${num(T1)} °C.${thenRound}`,
    ],
    candidates: [Esi / (m * mat.c), T1 - dir * Esi / (m * mat.c), T1 + dir * Esi / (mShown * mat.c), T1 + dir * Eshown / (m * mat.c)],
  }, rng);
}

function specificMulti(rng) {
  const body = rng.pick([SOLIDS[0], SOLIDS[1], SOLIDS[3]]); // aluminium, copper, steel
  const vessel = rng.pick(["kettle", "saucepan", "pan"]);
  const mk = rng.int(30, 150) / 100;
  const mw = rng.int(25, 250) / 100;
  const T1 = rng.int(80, 250) / 10;
  const T2 = fix(T1 + rng.int(200, 700) / 10);
  if (T2 >= 100) throw new Retry();
  const dT = T2 - T1;
  const Ew = (mw * WATER.c * dT) / 1000;
  const Ek = (mk * body.c * dT) / 1000;
  const units = { Ew: "kJ", Ek: "kJ", E: "kJ" };
  const values = { mw, cw: WATER.c, mk, ck: body.c, T1, T2 };
  const explanation = [
    "Water and pan warm through the same temperature change, so use `E = m × c × ΔT` for each and add.",
    `ΔT = ${num(T2)} - ${num(T1)} = ${num(dT)} °C.`,
    `1. Water: \`${num(mw)} × ${WATER.c} × ${num(dT)} / 1000\` ${result(Ew, true, "kJ")}`,
    `2. ${cap(vessel)}: \`${num(mk)} × ${body.c} × ${num(dT)} / 1000\` ${result(Ek, true, "kJ")}`,
    `3. Total: \`${num(Ew)} + ${num(Ek)}\` ${result(Ew + Ek, true, "kJ")}`,
  ].join("\n\n");
  return multi(
    `${An(body.mat)} ${vessel} of mass ${num(mk)} kg holds ${num(mw)} kg of water. Both are heated from ${num(T1)} °C to ${num(T2)} °C. Take c = ${WATER.c} J/kg °C for water and c = ${body.c} J/kg °C for ${body.mat}. Ignore energy lost to the surroundings.`,
    [
      numPart("water", "Water", `How much energy does the water need, in kJ?${DP}`, Ew,
        "Use `E = m × c × ΔT` for the water, then divide by 1000 for kJ (in the calculator: `_mw * _cw * (_T2 - _T1) / 1000`).",
        { formula: "emc", unknown: "E", values: { m: mw, c: WATER.c, T1, T2, dir: 1 }, units: { E: "kJ" } }),
      numPart("vessel", cap(vessel), `How much energy does the ${vessel} itself need, in kJ?${DP}`, Ek,
        `Same formula with the ${body.mat}'s mass and specific heat capacity (in the calculator: \`_mk * _ck * (_T2 - _T1) / 1000\`).`,
        { formula: "emc", unknown: "E", values: { m: mk, c: body.c, T1, T2, dir: 1 }, units: { E: "kJ" } }),
      numPart("total", "Total", `What is the total energy needed, in kJ?${DP}`, Ew + Ek,
        "Add the two energies. Work from unrounded values (in the calculator: `(_mw * _cw + _mk * _ck) * (_T2 - _T1) / 1000`).",
        { formula: "emc2", unknown: "E", values, units }),
    ],
    explanation, values, {},
  );
}

// ---------------------------------------------------------------------------------------------
// Latent heat: E = m × L, plus two-stage heating curves at hard.

const FUSION = [
  { mat: "ice", L: 334, at: "at 0 °C", verb: "melt", noun: "fusion" },
  { mat: "aluminium", L: 397, at: "at its melting point", verb: "melt", noun: "fusion" },
  { mat: "copper", L: 205, at: "at its melting point", verb: "melt", noun: "fusion" },
  { mat: "lead", L: 23, at: "at its melting point", verb: "melt", noun: "fusion" },
  { mat: "iron", L: 247, at: "at its melting point", verb: "melt", noun: "fusion" },
  { mat: "paraffin wax", L: 210, at: "at its melting point", verb: "melt", noun: "fusion" },
  { mat: "tin", L: 59, at: "at its melting point", verb: "melt", noun: "fusion" },
  { mat: "gold", L: 64, at: "at its melting point", verb: "melt", noun: "fusion" },
];
const VAPOUR = [
  { mat: "water", L: 2260, at: "at 100 °C", verb: "boil away", noun: "vaporisation" },
  { mat: "ethanol", L: 840, at: "at its boiling point", verb: "boil away", noun: "vaporisation" },
  { mat: "liquid nitrogen", L: 199, at: "at its boiling point", verb: "boil away", noun: "vaporisation" },
  { mat: "mercury", L: 295, at: "at its boiling point", verb: "boil away", noun: "vaporisation" },
];
// Freezing / condensing give the same energy out.
const lLine = (s, unit) => `Take the specific latent heat of ${s.noun} of ${s.mat === "ice" ? "ice" : s.mat} as ${unit === "J/kg" ? s.L * 1000 : s.L} ${unit}.`;

function genLatent(d, rng) {
  if (d === "hard") {
    const r = rng.next();
    if (r < 0.35) return curveMulti(rng);
    if (r < 0.7) return curveSingle(rng);
  }
  const rounded = d === "hard";
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";
  const s = rng.pick(rng.next() < 0.55 ? FUSION : VAPOUR);
  const kinds = d === "easy" ? ["E", "E", "m"] : ["E", "m", "L"];
  const kind = rng.pick(kinds);
  const reverse = d !== "easy" && rng.next() < 0.3; // freezing / condensing
  const verbIng = reverse ? (s.noun === "fusion" ? "freeze" : "condense") : s.verb;
  const stateName = s.noun === "fusion" ? (s.mat === "ice" ? (reverse ? "water" : "ice") : `${reverse ? "liquid" : "solid"} ${s.mat}`) : s.mat === "liquid nitrogen" ? (reverse ? "nitrogen gas" : "liquid nitrogen") : reverse ? `${s.mat} vapour` : `liquid ${s.mat}`;

  let m, inG = false, LU, EU;
  if (d === "easy") {
    m = rng.int(1, 15);
    LU = rng.next() < 0.5 ? "J/kg" : "kJ/kg";
    EU = LU === "J/kg" ? "J" : "kJ";
  } else if (d === "medium") {
    inG = rng.next() < 0.6;
    m = inG ? (10 * rng.int(3, 200)) / 1000 : rng.int(2, 30);
    LU = rng.next() < 0.6 ? "kJ/kg" : "J/kg";
    EU = rng.next() < 0.5 ? "kJ" : "J";
  } else {
    inG = rng.next() < 0.4;
    m = inG ? rng.int(25, 3000) / 1000 : rng.int(12, 1500) / 100;
    LU = rng.next() < 0.6 ? "kJ/kg" : "J/kg";
    EU = "kJ";
  }
  const Lsi = s.L * 1000;
  const Lshown = LU === "kJ/kg" ? s.L : Lsi;
  const mShown = fix(inG ? m * 1000 : m);
  const mUnit = inG ? "g" : "kg";
  const Ej = m * Lsi;
  const units = {};
  if (inG) units.m = "g";
  if (LU === "kJ/kg") units.L = "kJ/kg";
  const { C } = labeler(units);
  const mconv = inG ? [`Convert the mass first: ${convLine(mShown, "g")}.`] : [];
  const lconv = LU === "kJ/kg" && !(d === "easy") ? [`Convert the latent heat: ${convLine(Lshown, "kJ/kg")}.`] : [];
  const outWord = reverse ? "is released" : "is needed";

  if (kind === "E") {
    // Easy keeps matching units (J/kg -> J, kJ/kg -> kJ), so no conversion is needed.
    const easySame = d === "easy";
    let exact;
    if (easySame) exact = m * Lshown;
    else exact = EU === "kJ" ? Ej / 1000 : Ej;
    const u = { ...units };
    if (!easySame && EU === "kJ") u.E = "kJ";
    if (easySame) delete u.L;
    const values = { m: mShown, L: Lshown };
    const Cx = labeler(u).C;
    return single({
      prompt: `How much energy ${outWord} to ${verbIng} ${num(mShown)} ${mUnit} of ${stateName} ${s.at}? ${lLine(s, LU)} Give your answer in ${easySame ? (LU === "J/kg" ? "J" : "kJ") : EU}.${end}`,
      exact, unit: easySame ? (LU === "J/kg" ? "J" : "kJ") : EU, rounded, formula: easySame ? "eml0" : "eml", unknown: "E", values, units: u,
      steps: [
        `A change of state at constant temperature: \`E = m × L\`.${easySame ? "" : " Work in kg and J/kg."}`,
        ...mconv, ...(easySame ? [] : lconv),
        ...(easySame || EU === "J" ? [`\`E = ${num(easySame ? m : m)} × ${easySame ? Lshown : Lsi}\``] : [`\`E = ${num(m)} × ${Lsi} = ${num(Ej)}\` J. Divide by 1000 for kJ:`, `\`E = ${num(Ej)} / 1000\``]),
      ],
      hints: [
        `During a change of state the temperature stays the same, so use \`E = m × L\`.${inG ? " Put the mass in kg." : ""}${!easySame && LU !== (EU === "kJ" ? "kJ/kg" : "J/kg") ? " Watch the units: J/kg with kg gives J, kJ/kg with kg gives kJ." : ""}`,
        `Substitute the mass and L (in the calculator: \`${Cx("m")} * ${easySame ? "_L" : Cx("L")}\`${!easySame && EU === "kJ" ? " then divide by 1000" : ""}).${thenRound}`,
      ],
      candidates: [mShown * Lshown, m * Lshown, Ej / 1000, Ej, m * s.L * 4200 / 1000, Lshown / m],
    }, rng);
  }

  // Inverse: E stated
  let Eshown, EU2 = d === "easy" ? (LU === "J/kg" ? "J" : "kJ") : rng.next() < 0.5 ? "kJ" : "J";
  if (d === "hard") {
    EU2 = "kJ";
    Eshown = fix(Math.round(Ej / 100) / 10);
  } else Eshown = EU2 === "kJ" ? fix(Ej / 1000) : fix(Ej);
  const u = { ...units };
  if (EU2 === "kJ" && d !== "easy") u.E = "kJ";
  const easy = d === "easy";
  if (easy) delete u.L;
  const Cx = labeler(u).C;
  const Esi = EU2 === "kJ" ? Eshown * 1000 : Eshown;
  const econv = !easy && EU2 === "kJ" ? [`Convert the energy: ${convLine(Eshown, "kJ")}.`] : [];

  if (kind === "m") {
    const mkg = easy ? Eshown / Lshown : Esi / Lsi;
    const exact = inG ? mkg * 1000 : mkg;
    const values = { E: Eshown, L: Lshown };
    return single({
      prompt: `${num(Eshown)} ${EU2} of energy is ${reverse ? "released when some" : "used to"} ${reverse ? `${stateName} ${verbIng}s` : `${verbIng} some ${stateName}`} ${s.at}. ${lLine(s, LU)} What mass ${reverse ? (s.noun === "fusion" ? "froze" : "condensed") : (s.noun === "fusion" ? "melted" : "boiled away")}, in ${mUnit}?${end}`,
      exact, unit: mUnit, rounded, formula: easy ? "eml0" : "eml", unknown: "m", values, units: u,
      steps: [
        `Rearrange \`E = m × L\` to \`m = E / L\`.${easy ? "" : " Use J and J/kg to get kg."}`,
        ...econv, ...(easy ? [] : lconv),
        ...(inG ? [`\`m = ${num(Esi)} / ${Lsi} = ${num(mkg)}\` kg. Multiply by 1000 for grams:`, `\`m = ${num(mkg)} × 1000\``] : [`\`m = ${num(easy ? Eshown : Esi)} / ${easy ? Lshown : Lsi}\``]),
      ],
      hints: [
        `Rearrange \`E = m × L\` for the mass: \`m = E / L\`.${easy ? "" : " Match the units first (J with J/kg)."}`,
        `Substitute (in the calculator: \`${Cx("E")} / ${easy ? "_L" : Cx("L")}\`).${inG ? " That is in kg: multiply by 1000 for grams." : ""}${thenRound}`,
      ],
      candidates: [Eshown * Lshown, Lshown / Eshown, Eshown / Lshown * (inG ? 1 : 1000), Esi / s.L, mkg * (inG ? 1 : 1000) / 1000],
    }, rng);
  }

  // L: from E and m. Answer in the unit asked (kJ/kg or J/kg).
  const askU = rng.next() < 0.5 ? "kJ/kg" : "J/kg";
  const Lk = Esi / m; // J/kg
  const exact = askU === "kJ/kg" ? Lk / 1000 : Lk;
  const u3 = { ...u };
  delete u3.L;
  if (askU === "kJ/kg") u3.L = "kJ/kg";
  const Cy = labeler(u3).C;
  const values = { E: Eshown, m: mShown };
  const sub = s.noun === "fusion" ? (s.mat === "ice" ? "ice" : `solid ${s.mat}`) : stateName;
  return single({
    prompt: `It takes ${num(Eshown)} ${EU2} of energy to ${s.verb} ${num(mShown)} ${mUnit} of ${sub} ${s.at}. What is its specific latent heat of ${s.noun}, in ${askU}?${end}`,
    exact, unit: askU, rounded, formula: "eml", unknown: "L", values, units: u3,
    steps: [
      "Rearrange `E = m × L` to `L = E / m`, with E in J and m in kg (this gives J/kg).",
      ...econv, ...mconv,
      ...(askU === "kJ/kg" ? [`\`L = ${num(Esi)} / ${num(m)} = ${num(Lk)}\` J/kg. Divide by 1000 for kJ/kg:`, `\`L = ${num(Lk)} / 1000\``] : [`\`L = ${num(Esi)} / ${num(m)}\``]),
    ],
    hints: [
      "Rearrange `E = m × L` for L: `L = E / m`. With J and kg you get J/kg.",
      `Substitute (in the calculator: \`${Cy("E")} / ${Cy("m")}\`${askU === "kJ/kg" ? ", then divide by 1000 for kJ/kg" : ""}).${thenRound}`,
    ],
    candidates: [Lk, Lk / 1000, Eshown / m, Esi / mShown, Esi * m / 1000],
  }, rng);
}

// Two-stage heating curves (hard). Stage energies in kJ.
function curveScenario(rng) {
  const kind = rng.pick(["melt-warm", "warm-boil", "ice-melt"]);
  const inG = rng.next() < 0.35;
  const m = inG ? rng.int(50, 2000) / 1000 : rng.int(15, 300) / 100;
  const mShown = fix(inG ? m * 1000 : m);
  const mUnit = inG ? "g" : "kg";
  const cw = 4200, ci = 2100, Lf = 334, Lv = 2260;
  if (kind === "melt-warm") {
    const T = rng.int(5, 90);
    return {
      kind, m, mShown, mUnit, inG,
      text: `${num(mShown)} ${mUnit} of ice at 0 °C is melted and the water is then heated to ${T} °C.`,
      consts: `Take L = ${Lf} kJ/kg for melting ice and c = ${cw} J/kg °C for water.`,
      stages: [
        { id: "melt", label: "Melting", ask: "melt the ice", E: m * Lf, kind: "L", L: Lf, how: `\`E = m × L = ${num(m)} × ${Lf}\` (kJ, since L is in kJ/kg)`, calc: `${inG ? "(_m_g / 1000)" : "_m"} * _L_kJkg` },
        { id: "warm", label: "Warming", ask: `warm the water from 0 °C to ${T} °C`, E: (m * cw * T) / 1000, kind: "c", c: cw, T1: 0, T2: T, how: `\`E = m × c × ΔT = ${num(m)} × ${cw} × ${T}\` J, then ÷ 1000`, calc: `${inG ? "(_m_g / 1000)" : "_m"} * _c * (_T2 - _T1) / 1000` },
      ],
      values: { m: mShown, L: Lf, c: cw, T1: 0, T2: T },
    };
  }
  if (kind === "warm-boil") {
    const T = rng.int(10, 85);
    return {
      kind, m, mShown, mUnit, inG,
      text: `${num(mShown)} ${mUnit} of water at ${T} °C is heated to 100 °C and then boiled away completely.`,
      consts: `Take c = ${cw} J/kg °C for water and L = ${Lv} kJ/kg for boiling water.`,
      stages: [
        { id: "warm", label: "Warming", ask: `warm the water from ${T} °C to 100 °C`, E: (m * cw * (100 - T)) / 1000, kind: "c", c: cw, T1: T, T2: 100, how: `\`E = m × c × ΔT = ${num(m)} × ${cw} × (100 - ${T})\` J, then ÷ 1000`, calc: `${inG ? "(_m_g / 1000)" : "_m"} * _c * (_T2 - _T1) / 1000` },
        { id: "boil", label: "Boiling", ask: "boil it all away at 100 °C", E: m * Lv, kind: "L", L: Lv, how: `\`E = m × L = ${num(m)} × ${Lv}\` (kJ)`, calc: `${inG ? "(_m_g / 1000)" : "_m"} * _L_kJkg` },
      ],
      values: { m: mShown, c: cw, T1: T, T2: 100, L: Lv },
    };
  }
  const T = rng.int(2, 30);
  return {
    kind, m, mShown, mUnit, inG,
    text: `${num(mShown)} ${mUnit} of ice at -${T} °C is warmed to 0 °C and then melted completely.`,
    consts: `Take c = ${ci} J/kg °C for ice and L = ${Lf} kJ/kg for melting ice.`,
    stages: [
      { id: "warm", label: "Warming", ask: `warm the ice from -${T} °C to 0 °C`, E: (m * ci * T) / 1000, kind: "c", c: ci, T1: -T, T2: 0, how: `\`E = m × c × ΔT = ${num(m)} × ${ci} × (0 - (-${T}))\` J, then ÷ 1000`, calc: `${inG ? "(_m_g / 1000)" : "_m"} * _c * (_T2 - _T1) / 1000` },
      { id: "melt", label: "Melting", ask: "melt the ice at 0 °C", E: m * Lf, kind: "L", L: Lf, how: `\`E = m × L = ${num(m)} × ${Lf}\` (kJ)`, calc: `${inG ? "(_m_g / 1000)" : "_m"} * _L_kJkg` },
    ],
    values: { m: mShown, c: ci, T1: -T, T2: 0, L: Lf },
  };
}

function curveUnits(sc) {
  return { ...(sc.inG ? { m: "g" } : {}), L: "kJ/kg" };
}

function curveMulti(rng) {
  const sc = curveScenario(rng);
  const units = curveUnits(sc);
  const total = sc.stages[0].E + sc.stages[1].E;
  const mU = sc.inG ? { m: "g" } : {};
  const partSpec = (st) => (st.kind === "L"
    ? { formula: "eml", unknown: "E", values: { m: sc.mShown, L: st.L }, units: { ...mU, L: "kJ/kg", E: "kJ" } }
    : { formula: "emc", unknown: "E", values: { m: sc.mShown, c: st.c, T1: st.T1, T2: st.T2, dir: 1 }, units: { ...mU, E: "kJ" } });
  const explanation = [
    "Each stage of a heating curve needs its own formula: `E = m × c × ΔT` while the temperature changes, `E = m × L` while the state changes (temperature constant).",
    ...(sc.inG ? [`Convert: ${convLine(sc.mShown, "g")}.`] : []),
    `1. ${sc.stages[0].label}: ${sc.stages[0].how} ${result(sc.stages[0].E, true, "kJ")}`,
    `2. ${sc.stages[1].label}: ${sc.stages[1].how} ${result(sc.stages[1].E, true, "kJ")}`,
    `3. Total: \`${num(sc.stages[0].E)} + ${num(sc.stages[1].E)}\` ${result(total, true, "kJ")}`,
  ].join("\n\n");
  return multi(
    `${sc.text} ${sc.consts}`,
    [
      ...sc.stages.map((st) => numPart(st.id, st.label, `How much energy does it take to ${st.ask}, in kJ?${DP}`, st.E,
        `${st.kind === "L" ? "A change of state: `E = m × L`." : "A temperature change: `E = m × c × ΔT`, then divide by 1000 for kJ."} In the calculator: \`${st.calc}\`.`, partSpec(st))),
      numPart("total", "Total", `What is the total energy needed, in kJ?${DP}`, total,
        "Add the two stages, using unrounded values.", { formula: "curve", unknown: "E", values: sc.values, units: { ...units, E: "kJ" } }),
    ],
    explanation, sc.values, units,
  );
}

function curveSingle(rng) {
  const sc = curveScenario(rng);
  const units = curveUnits(sc);
  const total = sc.stages[0].E + sc.stages[1].E;
  const { C } = labeler(units);
  if (rng.next() < 0.6) {
    return single({
      prompt: `${sc.text} ${sc.consts} How much energy is needed in total, in kJ?${DP}`,
      exact: total, unit: "kJ", rounded: true, formula: "curve", unknown: "E", values: sc.values, units: { ...units, E: "kJ" },
      steps: [
        "There are two stages: a temperature change (`E = m × c × ΔT`) and a change of state (`E = m × L`). Add them.",
        ...(sc.inG ? [`Convert: ${convLine(sc.mShown, "g")}.`] : []),
        `${sc.stages[0].label}: ${sc.stages[0].how} = ${num(sc.stages[0].E)} kJ.`,
        `${sc.stages[1].label}: ${sc.stages[1].how} = ${num(sc.stages[1].E)} kJ.`,
        `Total: \`${num(sc.stages[0].E)} + ${num(sc.stages[1].E)}\``,
      ],
      hints: [
        "Split the process into stages: one where the temperature changes and one where the state changes. Each needs its own formula.",
        `${sc.stages[0].label}: ${sc.stages[0].how}. ${sc.stages[1].label}: ${sc.stages[1].how}.`,
        `Add the two stage energies (in the calculator: \`${sc.stages[0].calc} + ${sc.stages[1].calc}\`).${THEN}`,
      ],
      candidates: [sc.stages[0].E, sc.stages[1].E, sc.stages[0].E * 1000 + sc.stages[1].E, total * 1000 / 4200],
    }, rng);
  }
  // Mass from the total energy, in kg
  const Eshown = fix(Math.round(total * 10) / 10);
  const st = sc.stages;
  const perKg = st.map((x) => x.E / sc.m);
  const values = { E: Eshown, ...sc.values };
  delete values.m;
  const u = { L: "kJ/kg", E: "kJ" };
  const exact = Eshown / (perKg[0] + perKg[1]);
  const text = sc.text.replace(`${num(sc.mShown)} ${sc.mUnit} of `, "Some ").replace(/^Some ice/, "Some ice").replace(/^Some water/, "Some water");
  return single({
    prompt: `${text} This takes ${num(Eshown)} kJ of energy in total. ${sc.consts} What is the mass, in kg?${DP}`,
    exact, unit: "kg", rounded: true, formula: "curve", unknown: "m", values, units: u,
    steps: [
      "Both stages are proportional to the mass, so find the energy per kg for each stage, add them, and divide the total energy by that.",
      `Per kg: ${st[0].label.toLowerCase()} ${num(perKg[0])} kJ, ${st[1].label.toLowerCase()} ${num(perKg[1])} kJ, so ${num(perKg[0] + perKg[1])} kJ per kg.`,
      `\`m = ${num(Eshown)} / ${num(perKg[0] + perKg[1])}\``,
    ],
    hints: [
      "Write the total as `E = m × L + m × c × ΔT = m × (L + c × ΔT)`, with L in kJ/kg and c × ΔT turned into kJ/kg (÷ 1000).",
      `Energy per kg: ${num(perKg[0])} kJ + ${num(perKg[1])} kJ. Divide the total energy by their sum (in the calculator: \`_E_kJ / (_L_kJkg + _c * (_T2 - _T1) / 1000)\`).${THEN}`,
    ],
    candidates: [Eshown / perKg[0], Eshown / perKg[1], Eshown / (perKg[0] + perKg[1] * 1000), exact * 1000],
  }, rng);
}

// ---------------------------------------------------------------------------------------------
// Temperature scales. K = °C + 273 (hard: + 273.15), °F = °C × 9/5 + 32. The offset is stated.

const SCALE_THINGS = [
  "a freezer", "a fridge", "a cup of tea", "a hot oven", "a summer day", "a winter night", "a swimming pool",
  "a sauna", "a lab sample", "a bath", "a pizza oven", "a desert afternoon", "the Antarctic air", "a car engine",
  "liquid in a beaker", "a greenhouse", "a cave", "a hot spring",
];

function genScales(d, rng) {
  const rounded = d === "hard";
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";
  const off = rounded ? 273.15 : 273;
  const kLine = `Use K = °C + ${off}.`;
  const fLine = "Use °F = °C × 9/5 + 32.";
  const kinds = d === "easy" ? ["c2k", "k2c", "c2k", "k2c", "dK"]
    : d === "medium" ? ["c2f", "f2c", "c2k", "k2c", "dF", "dK", "compare"]
      : ["c2f", "f2c", "k2f", "f2k", "k2c", "compare"];
  const kind = rng.pick(kinds);
  const thing = rng.pick(SCALE_THINGS);

  if (kind === "compare") return scalesCompare(d, rng);

  if (kind === "c2k" || kind === "k2c") {
    const C = rounded ? rng.int(-2000, 4000) / 10 : rng.int(-200, 500);
    const K = fix(C + off);
    if (kind === "c2k") {
      return single({
        prompt: `The temperature of ${thing} is ${num(C)} °C. What is this in kelvin (K)? ${kLine}${end}`,
        exact: K, unit: "K", rounded, formula: "ck", unknown: "K", values: { C, off }, units: {}, skip: ["off"],
        steps: ["To go from °C to K, add the offset: `K = °C + " + off + "`.", `\`K = ${num(C)} + ${off}\``],
        hints: [`Kelvin and Celsius degrees are the same size; the scales just start in different places. Add ${off} to the Celsius reading.`, `Work out \`${num(C)} + ${off}\` (in the calculator: \`_C + ${off}\`).`],
        candidates: [C - off, C + 373, C, C + 237],
      }, rng);
    }
    if (K <= 0) throw new Retry();
    return single({
      prompt: `The temperature of ${thing} is ${num(K)} K. What is this in °C? ${kLine}${end}`,
      exact: C, unit: "°C", rounded, formula: "ck", unknown: "C", values: { K, off }, units: {}, skip: ["off"],
      steps: ["To go from K to °C, take away the offset: `°C = K - " + off + "`.", `\`°C = ${num(K)} - ${off}\``],
      hints: [`Rearrange \`K = °C + ${off}\` to get the Celsius reading on its own.`, `Work out \`${num(K)} - ${off}\` (in the calculator: \`_K - ${off}\`).`],
      candidates: [K + off, K - 373, K, K - 237],
    }, rng);
  }

  if (kind === "dK" || kind === "dF") {
    const dC = kind === "dF" ? 5 * rng.int(1, 30) : rng.int(2, 120);
    const fall = rng.next() < 0.4;
    const exact = kind === "dK" ? dC : (dC * 9) / 5;
    const T1 = rng.int(-20, 60);
    const T2 = fall ? T1 - dC : T1 + dC;
    const verb = fall ? "falls" : "rises";
    if (kind === "dK") {
      return single({
        prompt: `The temperature of ${thing} ${verb} from ${T1} °C to ${T2} °C. By how many kelvin (K) does it ${fall ? "fall" : "rise"}? Use K = °C + 273.`,
        exact, unit: "K", rounded: false, formula: "dk", unknown: "dK", values: { T1, T2 }, units: {},
        steps: ["A kelvin is the same size as a Celsius degree, so a *change* in temperature is the same number on both scales. Do not add 273 to a change.", `Change = ${fall ? `${T1} - (${T2})` : `${T2} - (${T1})`}`, "So the change in kelvin is"],
        hints: ["The two scales have the same size of degree; only their zero points differ.", "Find the change in °C first. Adding 273 to both readings cancels out."],
        candidates: [dC + 273, Math.abs(T2) + 273, dC + 546, Math.abs(T1 + T2)],
      }, rng);
    }
    return single({
      prompt: `The temperature of ${thing} ${verb} by ${dC} °C. By how many °F does it ${fall ? "fall" : "rise"}? ${fLine}`,
      exact, unit: "°F", rounded: false, formula: "df", unknown: "dF", values: { dC }, units: {},
      steps: ["A change of 1 °C is a change of 9/5 °F. The +32 only shifts the zero point, so it cancels out for a change.", `\`ΔF = ${dC} × 9/5\``],
      hints: ["For a *change* in temperature, only the scale factor matters: the +32 cancels out.", `Multiply the change by 9/5 (in the calculator: \`_dC * 9 / 5\`).`],
      candidates: [(dC * 9) / 5 + 32, dC + 32, (dC * 5) / 9, dC],
    }, rng);
  }

  // °C <-> °F, and (hard) K <-> °F via °C.
  let C;
  if (d === "medium") C = 5 * rng.int(-12, 50);
  else C = rng.int(-1000, 3000) / 10;
  const F = (C * 9) / 5 + 32;
  const K = C + off;
  if (kind === "c2f") {
    return single({
      prompt: `The temperature of ${thing} is ${num(C)} °C. What is this in °F? ${fLine}${end}`,
      exact: F, unit: "°F", rounded, formula: "cf", unknown: "F", values: { C }, units: {},
      steps: ["Multiply by 9/5, then add 32.", `\`°F = ${num(C)} × 9/5 + 32\``],
      hints: ["Use `°F = °C × 9/5 + 32`: multiply first, then add 32.", `Substitute (in the calculator: \`_C * 9 / 5 + 32\`).${thenRound}`],
      candidates: [((C + 32) * 9) / 5, (C * 5) / 9 + 32, (C * 9) / 5, C + 32, ((C - 32) * 5) / 9],
    }, rng);
  }
  if (kind === "f2c") {
    const Fs = d === "medium" ? F : fix(Math.round(F * 10) / 10);
    const exact = ((Fs - 32) * 5) / 9;
    return single({
      prompt: `The temperature of ${thing} is ${num(Fs)} °F. What is this in °C? ${fLine}${end}`,
      exact, unit: "°C", rounded, formula: "cf", unknown: "C", values: { F: Fs }, units: {},
      steps: ["Rearrange `°F = °C × 9/5 + 32`: take away 32, then multiply by 5/9.", `\`°C = (${num(Fs)} - 32) × 5/9\``],
      hints: ["Undo the steps of `°F = °C × 9/5 + 32` in reverse order: subtract 32 first, then multiply by 5/9.", `Substitute (in the calculator: \`(_F - 32) * 5 / 9\`).${thenRound}`],
      candidates: [(Fs * 5) / 9 - 32, ((Fs + 32) * 5) / 9, ((Fs - 32) * 9) / 5, Fs - 32],
    }, rng);
  }
  if (kind === "k2f") {
    const Ks = fix(Math.round(K * 10) / 10);
    if (Ks <= 0) throw new Retry();
    const exact = ((Ks - off) * 9) / 5 + 32;
    return single({
      prompt: `The temperature of ${thing} is ${num(Ks)} K. What is this in °F? ${kLine} ${fLine}${end}`,
      exact, unit: "°F", rounded, formula: "kf", unknown: "F", values: { K: Ks, off }, units: {}, skip: ["off"],
      steps: ["Go through Celsius: first K to °C, then °C to °F.", `°C = ${num(Ks)} - ${off} = ${num(Ks - off)}`, `\`°F = ${num(Ks - off)} × 9/5 + 32\``],
      hints: [`There is no direct step: convert to °C first (subtract ${off}), then to °F.`, `In the calculator: \`(_K - ${off}) * 9 / 5 + 32\`.${thenRound}`],
      candidates: [(Ks * 9) / 5 + 32, ((Ks - off) * 5) / 9 + 32, ((Ks + off) * 9) / 5 + 32, Ks - off],
    }, rng);
  }
  // f2k
  const Fs = fix(Math.round(F * 10) / 10);
  const exact = ((Fs - 32) * 5) / 9 + off;
  if (exact <= 0) throw new Retry();
  return single({
    prompt: `The temperature of ${thing} is ${num(Fs)} °F. What is this in kelvin (K)? ${kLine} ${fLine}${end}`,
    exact, unit: "K", rounded, formula: "kf", unknown: "K", values: { F: Fs, off }, units: {}, skip: ["off"],
    steps: ["Go through Celsius: first °F to °C, then add the kelvin offset.", `°C = (${num(Fs)} - 32) × 5/9 = ${num(((Fs - 32) * 5) / 9)}`, `\`K = ${num(((Fs - 32) * 5) / 9)} + ${off}\``],
    hints: ["Convert to °C first: subtract 32 and multiply by 5/9. Then convert °C to K.", `In the calculator: \`(_F - 32) * 5 / 9 + ${off}\`.${thenRound}`],
    candidates: [Fs + off, ((Fs - 32) * 9) / 5 + off, (Fs * 5) / 9 + off, ((Fs - 32) * 5) / 9],
  }, rng);
}

// Which reading is the highest / lowest? Four readings in mixed scales.
function scalesCompare(d, rng) {
  const off = d === "hard" ? 273.15 : 273;
  const high = rng.next() < 0.5;
  const base = rng.int(-30, 150);
  // Four distinct Celsius targets at least 3 °C apart, each shown in a random scale (whole numbers).
  const targets = draw(() => [0, 1, 2, 3].map(() => base + rng.int(-25, 25)),
    (t) => t.every((a, i) => t.every((b, j) => i === j || Math.abs(a - b) >= 3)));
  if (!targets.every((a, i) => targets.every((b, j) => i === j || Math.abs(a - b) >= 3))) throw new Retry();
  const scales = rng.shuffle(["C", "K", "F", rng.pick(["C", "K", "F"])]);
  const shown = targets.map((t, i) => {
    const s = scales[i];
    if (s === "C") return { s, v: t, txt: `${t} °C`, c: t };
    if (s === "K") { const v = Math.round(t + off); return { s, v, txt: `${v} K`, c: v - off }; }
    const v = Math.round((t * 9) / 5 + 32);
    return { s, v, txt: `${v} °F`, c: ((v - 32) * 5) / 9 };
  });
  const sorted = shown.slice().sort((a, b) => a.c - b.c);
  const best = high ? sorted[3] : sorted[0];
  const runner = high ? sorted[2] : sorted[1];
  if (Math.abs(best.c - runner.c) < 1 || new Set(shown.map((x) => x.txt)).size !== 4) throw new Retry();
  const list = shown.map((x) => `${x.txt} = ${num(x.c)} °C`).join("; ");
  return {
    prompt: `Which of these temperatures is the ${high ? "highest" : "lowest"}: ${shown.slice(0, 3).map((x) => x.txt).join(", ")} or ${shown[3].txt}? Use K = °C + ${off} and °F = °C × 9/5 + 32.`,
    answer: best.txt,
    answerType: "choice",
    choices: rng.shuffle(shown.map((x) => x.txt)),
    explanation: [
      "Put every reading on the same scale (here °C), then compare.",
      `K to °C: subtract ${off}. °F to °C: \`(°F - 32) × 5/9\`.`,
      `${list}.`,
      `The ${high ? "highest" : "lowest"} is **${best.txt}**.`,
    ].join("\n\n"),
    params: { formula: "compare", high, off, readings: shown.map((x) => x.txt) },
    hints: [
      "The numbers alone are misleading: 300 K is much colder than 300 °F. Convert all four to one scale first.",
      `Convert to °C: kelvin readings minus ${off}; Fahrenheit readings \`(°F - 32) × 5/9\`. Then compare.`,
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Mixing & heat transfer: E = P × t, heaters, efficiency, final temperature when mixing.

const HEATERS = ["kettle", "immersion heater", "electric heater", "hot plate", "water heater", "heating element"];
const MIX_TEXT = ["No heat is lost to the surroundings or the container."];

function genMixing(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return mixingMulti(rng);
  const kinds = d === "easy" ? ["pt", "pt", "eff", "mixeq"] : d === "medium" ? ["pt", "heater", "eff", "mixw", "mixw"] : ["heater", "heaterEff", "mixm", "mixm", "mixc", "eff"];
  const kind = rng.pick(kinds);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";
  const dev = rng.pick(HEATERS);

  if (kind === "pt") {
    const unknown = rng.pick(["E", "E", "P", "t"]);
    let P, t, units = {};
    if (d === "easy") {
      P = 50 * rng.int(1, 60);
      t = rng.int(5, 300);
    } else {
      const kw = rng.next() < 0.6;
      const mins = rng.next() < 0.6;
      P = kw ? rng.int(5, 30) / 10 : 50 * rng.int(2, 60);
      t = mins ? rng.int(2, 30) : rng.int(20, 600);
      if (kw) units.P = "kW";
      if (mins) units.t = "min";
    }
    const Psi = units.P ? P * 1000 : P;
    const tsi = units.t ? t * 60 : t;
    const E = Psi * tsi;
    const Pu = units.P ? "kW" : "W";
    const tu = units.t ? "minutes" : "s";
    const askE = d === "easy" ? "J" : rng.next() < 0.5 ? "kJ" : "J";
    const { C } = labeler(units);
    const conv = convSteps({ P, t }, units, null);
    if (unknown === "E") {
      const u = { ...units, ...(askE === "kJ" ? { E: "kJ" } : {}) };
      const exact = askE === "kJ" ? E / 1000 : E;
      return single({
        prompt: `${An(dev)} with a power of ${num(P)} ${Pu} is switched on for ${num(t)} ${tu}. How much energy does it transfer, in ${askE}?`,
        exact, unit: askE, rounded: false, formula: "pt", unknown: "E", values: { P, t }, units: u,
        steps: ["Energy transferred = power × time: `E = P × t`, with P in W and t in s.", ...conv, ...(askE === "kJ" ? [`\`E = ${num(Psi)} × ${num(tsi)} = ${num(E)}\` J. Divide by 1000 for kJ:`, `\`E = ${num(E)} / 1000\``] : [`\`E = ${num(Psi)} × ${num(tsi)}\``])],
        hints: [`Power is energy per second, so \`E = P × t\`.${units.P || units.t ? " Convert to W and s first." : ""}`, `Substitute (in the calculator: \`${C("P")} * ${C("t")}\`${askE === "kJ" ? ", then divide by 1000" : ""}).`],
        candidates: [P * t, Psi * t, P * tsi, E / 1000, E * 1000, Psi / tsi],
      }, rng);
    }
    const Eu = d === "easy" ? "J" : rng.next() < 0.5 ? "kJ" : "J";
    const Eshown = Eu === "kJ" ? fix(E / 1000) : E;
    const u = { ...units, ...(Eu === "kJ" ? { E: "kJ" } : {}) };
    const Cx = labeler(u).C;
    const econv = Eu === "kJ" ? [`Convert: ${convLine(Eshown, "kJ")}.`] : [];
    if (unknown === "P") {
      const askU = units.P && isInt(P) ? "kW" : "W";
      const uu = { ...u };
      delete uu.P;
      if (askU === "kW") uu.P = "kW";
      const exact = askU === "kW" ? Psi / 1000 : Psi;
      if (!isInt(exact)) throw new Retry();
      const Cy = labeler(uu).C;
      return single({
        prompt: `${An(dev)} transfers ${num(Eshown)} ${Eu} of energy in ${num(t)} ${tu}. What is its power, in ${askU}?`,
        exact, unit: askU, rounded: false, formula: "pt", unknown: "P", values: { E: Eshown, t }, units: uu,
        steps: ["Power = energy / time: `P = E / t`, with E in J and t in s.", ...econv, ...convSteps({ t }, units, null), ...(askU === "kW" ? [`\`P = ${num(E)} / ${num(tsi)} = ${num(Psi)}\` W. Divide by 1000 for kW:`, `\`P = ${num(Psi)} / 1000\``] : [`\`P = ${num(E)} / ${num(tsi)}\``])],
        hints: ["Power is the energy transferred each second: `P = E / t`.", `Substitute, in J and s (in the calculator: \`${Cy("E")} / ${Cy("t")}\`${askU === "kW" ? ", then divide by 1000" : ""}).`],
        candidates: [Eshown / t, E / t, Eshown * t, exact * 60, exact / 60],
      }, rng);
    }
    const askT = units.t ? "minutes" : "s";
    const uu = { ...u };
    delete uu.t;
    if (units.t) uu.t = "min";
    const exact = units.t ? tsi / 60 : tsi;
    const Cy = labeler(uu).C;
    return single({
      prompt: `How long does ${an(dev)} with a power of ${num(P)} ${Pu} take to transfer ${num(Eshown)} ${Eu} of energy? Give your answer in ${askT}.`,
      exact, unit: askT === "s" ? "s" : "minutes", rounded: false, formula: "pt", unknown: "t", values: { E: Eshown, P }, units: uu,
      steps: ["Rearrange `E = P × t` to `t = E / P`, with E in J and P in W (this gives seconds).", ...econv, ...convSteps({ P }, units, null), ...(units.t ? [`\`t = ${num(E)} / ${num(Psi)} = ${num(tsi)}\` s. Divide by 60 for minutes:`, `\`t = ${num(tsi)} / 60\``] : [`\`t = ${num(E)} / ${num(Psi)}\``])],
      hints: ["Rearrange `E = P × t` for the time: `t = E / P`.", `Substitute, in J and W (in the calculator: \`${Cy("E")} / ${Cy("P")}\`${units.t ? ", then divide by 60 for minutes" : ""}).`],
      candidates: [Eshown / P, E * Psi / 1e6, tsi, tsi / 60, Psi / E * 1e4],
    }, rng);
  }

  if (kind === "eff") {
    // efficiency = useful / total × 100
    let Ein, Eout, unknown = rng.pick(["eff", "eff", "out"]);
    if (d === "hard") {
      Ein = rng.int(500, 20000) / 10;
      Eout = fix(Math.round(Ein * rng.int(150, 950) / 100) / 10);
    } else if (d === "medium") {
      const e = 5 * rng.int(4, 19);
      Ein = 20 * rng.int(5, 200);
      Eout = (Ein * e) / 100;
    } else {
      const e = 10 * rng.int(2, 9);
      Ein = 100 * rng.int(1, 50);
      Eout = (Ein * e) / 100;
    }
    const app = rng.pick(["kettle", "electric heater", "hair dryer", "toaster", "oven", "immersion heater"]);
    const useful = "thermal energy that heats the " + (app === "hair dryer" ? "air" : app === "toaster" ? "bread" : app === "oven" ? "food" : "water");
    if (unknown === "eff") {
      const exact = (Eout / Ein) * 100;
      return single({
        prompt: `${An(app)} is supplied with ${num(Ein)} J of electrical energy. ${num(Eout)} J of it ends up as useful ${useful}. What is its efficiency, as a percentage? (Type the number without the % sign.)${end}`,
        exact, unit: "%", rounded, formula: "eff", unknown: "eff", values: { Ein, Eout }, units: {},
        steps: ["Efficiency = useful energy out / total energy in × 100.", `\`efficiency = ${num(Eout)} / ${num(Ein)} × 100\``],
        hints: ["Efficiency compares the useful energy with the total supplied: `useful / total × 100`.", `Substitute (in the calculator: \`_Eout / _Ein * 100\`).${thenRound}`],
        candidates: [(Ein / Eout) * 100, ((Ein - Eout) / Ein) * 100, Eout / Ein, 100 - (Eout / Ein) * 100],
      }, rng);
    }
    const e = round2((Eout / Ein) * 100);
    const Eo = (Ein * e) / 100;
    return single({
      prompt: `${An(app)} is ${num(e)}% efficient. It is supplied with ${num(Ein)} J of electrical energy. How much useful ${useful} does it give out, in J?${end}`,
      exact: Eo, unit: "J", rounded, formula: "eff", unknown: "Eout", values: { Ein, eff: e }, units: {},
      steps: ["Rearrange `efficiency = useful / total × 100`: `useful = efficiency / 100 × total`.", `\`useful = ${num(e)} / 100 × ${num(Ein)}\``],
      hints: ["The useful energy is the efficiency's share of the total energy supplied.", `Work out \`${num(e)} / 100 × ${num(Ein)}\` (in the calculator: \`_eff / 100 * _Ein\`).${thenRound}`],
      candidates: [Ein - Eo, e * Ein, (Ein / e) * 100, Ein * (1 - e / 1000)],
    }, rng);
  }

  if (kind === "mixeq" || kind === "mixw") {
    // Two lots of water. Easy: equal masses, so the average.
    let m1, m2, inG = false;
    if (kind === "mixeq") {
      m1 = m2 = rng.int(1, 8);
    } else {
      inG = rng.next() < 0.5;
      m1 = inG ? (50 * rng.int(2, 20)) / 1000 : rng.int(1, 12);
      m2 = inG ? (50 * rng.int(2, 20)) / 1000 : rng.int(1, 12);
      if (m1 === m2) throw new Retry();
    }
    const [T1, T2] = draw(() => [rng.int(5, 40), rng.int(50, 95)], ([a, b]) => isInt((m1 * a + m2 * b) / (m1 + m2)));
    const T = (m1 * T1 + m2 * T2) / (m1 + m2);
    if (!isInt(T)) throw new Retry();
    const mu = inG ? "g" : "kg";
    const s1 = fix(inG ? m1 * 1000 : m1), s2 = fix(inG ? m2 * 1000 : m2);
    const units = inG ? { m1: "g", m2: "g" } : {};
    const { C } = labeler(units);
    return single({
      prompt: `${num(s1)} ${mu} of cold water at ${T1} °C is mixed with ${num(s2)} ${mu} of hot water at ${T2} °C. ${MIX_TEXT[0]} What is the final temperature of the mixture, in °C?`,
      exact: T, unit: "°C", rounded: false, formula: "mix", unknown: "T", values: { m1: s1, T1, m2: s2, T2 }, units,
      steps: [
        "Energy lost by the hot water = energy gained by the cold water. Both are water, so c cancels:",
        `\`m1 × (T - T1) = m2 × (T2 - T)\`, which gives \`T = (m1 × T1 + m2 × T2) / (m1 + m2)\`.`,
        `\`T = (${num(s1)} × ${T1} + ${num(s2)} × ${T2}) / (${num(s1)} + ${num(s2)})\``,
      ],
      hints: [
        "The hot water cools by as much energy as the cold water gains. Since both are water, c is the same on both sides and cancels.",
        `The final temperature is the mass-weighted average: \`(m1 × T1 + m2 × T2) / (m1 + m2)\` (in the calculator: \`(${C("m1")} * _T1 + ${C("m2")} * _T2) / (${C("m1")} + ${C("m2")})\`).`,
      ],
      candidates: [(T1 + T2) / 2, (m2 * T1 + m1 * T2) / (m1 + m2), T2 - T1, (T1 + T2) / 2 + 5],
    }, rng);
  }

  if (kind === "heater" || kind === "heaterEff") {
    const eff = kind === "heaterEff" ? 5 * rng.int(12, 19) : 100;
    let m, P, dT, unknown, units = {};
    if (d === "medium") {
      m = rng.int(1, 10) / 2;
      P = 100 * rng.int(5, 30);
      dT = rng.int(5, 60);
      unknown = "t";
      if (!isInt((m * 4200 * dT) / P)) throw new Retry();
    } else {
      m = rng.int(20, 400) / 100;
      P = 10 * rng.int(50, 300);
      dT = rng.int(50, 750) / 10;
      unknown = rng.pick(["t", "dT"]);
    }
    const T1 = d === "medium" ? rng.int(10, 30) : rng.int(100, 300) / 10;
    if (T1 + dT >= 100) throw new Retry();
    const c = 4200;
    const t = (m * c * dT) / (P * eff / 100);
    const effTxt = eff < 100 ? ` The ${dev} is ${eff}% efficient: only ${eff}% of its energy heats the water.` : " Assume all of its energy heats the water.";
    if (unknown === "t") {
      const tShown = t;
      const values = { m, c, dT, P, ...(eff < 100 ? { eff } : {}) };
      return single({
        prompt: `${An(dev)} with a power of ${num(P)} W heats ${num(m)} kg of water, raising its temperature by ${num(dT)} °C. Take c = ${c} J/kg °C for water.${effTxt} How long does this take, in seconds?${end}`,
        exact: tShown, unit: "s", rounded, formula: "heater", unknown: "t", values, units,
        steps: [
          "Energy needed by the water: `E = m × c × ΔT`.",
          `\`E = ${num(m)} × ${c} × ${num(dT)} = ${num(m * c * dT)}\` J.`,
          ...(eff < 100 ? [`Only ${eff}% of the power is useful: useful power = ${num(P)} × ${eff}/100 = ${num((P * eff) / 100)} W.`] : []),
          `Time = energy / useful power: \`t = ${num(m * c * dT)} / ${num((P * eff) / 100)}\``,
        ],
        hints: [
          "First find the energy the water needs with `E = m × c × ΔT`.",
          `Then use \`t = E / P\`${eff < 100 ? `, where P is the useful power (${eff}% of ${num(P)} W)` : ""}.`,
          `In the calculator: \`_m * _c * _dT / (_P${eff < 100 ? " * _eff / 100" : ""})\`.${thenRound}`,
        ],
        candidates: [(m * c * dT) / P, (m * c * dT * eff) / (P * 100), (m * c * dT) / P / 60, (m * dT) / P * 1000],
      }, rng);
    }
    // dT achieved in a given time
    const tGiven = Math.round(t);
    const exact = (P * eff / 100) * tGiven / (m * c);
    const values = { m, c, P, t: tGiven, ...(eff < 100 ? { eff } : {}) };
    return single({
      prompt: `${An(dev)} with a power of ${num(P)} W heats ${num(m)} kg of water for ${tGiven} s. Take c = ${c} J/kg °C for water.${effTxt} By how much does the water's temperature rise, in °C?${DP}`,
      exact, unit: "°C", rounded: true, formula: "heater", unknown: "dT", values, units,
      steps: [
        `Useful energy supplied: \`E = P × t${eff < 100 ? ` × ${eff}/100` : ""} = ${num((P * eff / 100) * tGiven)}\` J.`,
        "Rearrange `E = m × c × ΔT` to `ΔT = E / (m × c)`.",
        `\`ΔT = ${num((P * eff / 100) * tGiven)} / (${num(m)} × ${c})\``,
      ],
      hints: [
        `Find the useful energy the ${dev} gives the water: \`E = P × t\`${eff < 100 ? `, then take ${eff}% of it` : ""}.`,
        `Then \`ΔT = E / (m × c)\` (in the calculator: \`_P * _t${eff < 100 ? " * _eff / 100" : ""} / (_m * _c)\`).${THEN}`,
      ],
      candidates: [(P * tGiven) / (m * c), (P * tGiven) / (m * c) * (100 / eff), exact + T1, (P * tGiven) / c],
    }, rng);
  }

  if (kind === "mixm") {
    // Hot metal dropped into water: final temperature.
    const metal = rng.pick(SOLIDS.filter((s) => ["aluminium", "copper", "iron", "steel", "brass", "lead"].includes(s.mat)));
    const mm = rng.int(10, 200) / 100;
    const mw = rng.int(20, 300) / 100;
    const Tm = rng.int(60, 300);
    const Tw = rng.int(80, 300) / 10;
    const T = (mm * metal.c * Tm + mw * 4200 * Tw) / (mm * metal.c + mw * 4200);
    const item = rng.pick(metal.items);
    const values = { mm, cm: metal.c, Tm, mw, cw: 4200, Tw };
    return single({
      prompt: `${An(item)} of mass ${num(mm)} kg is heated to ${Tm} °C and dropped into ${num(mw)} kg of water at ${num(Tw)} °C. Take c = ${metal.c} J/kg °C for ${metal.mat} and c = 4200 J/kg °C for water. ${MIX_TEXT[0]} What is the final temperature, in °C?${DP}`,
      exact: T, unit: "°C", rounded: true, formula: "mix", unknown: "T", values, units: {},
      steps: [
        "Energy lost by the metal = energy gained by the water: `mm × cm × (Tm - T) = mw × cw × (T - Tw)`.",
        "Solve for T: `T = (mm × cm × Tm + mw × cw × Tw) / (mm × cm + mw × cw)`.",
        `\`T = (${num(mm)} × ${metal.c} × ${Tm} + ${num(mw)} × 4200 × ${num(Tw)}) / (${num(mm)} × ${metal.c} + ${num(mw)} × 4200)\``,
      ],
      hints: [
        "The metal cools and the water warms until they reach the same final temperature T. Energy lost by one = energy gained by the other.",
        "Write `mm × cm × (Tm - T) = mw × cw × (T - Tw)` and collect the T terms on one side.",
        `T = (mm·cm·Tm + mw·cw·Tw) / (mm·cm + mw·cw). In the calculator: \`(_mm * _cm * _Tm + _mw * _cw * _Tw) / (_mm * _cm + _mw * _cw)\`.${THEN}`,
      ],
      candidates: [(Tm + Tw) / 2, (mm * Tm + mw * Tw) / (mm + mw), (mm * metal.c * Tm + mw * 4200 * Tw) / (mm + mw) / 1000, Tw + (Tm - Tw) * 0.5 * mm / mw],
    }, rng);
  }

  // mixc: specific heat capacity of a metal from a mixing experiment
  const mm = rng.int(20, 150) / 100;
  const mw = rng.int(20, 200) / 100;
  const Tm = rng.int(80, 100);
  const Tw = rng.int(150, 250) / 10;
  const cTrue = rng.pick([385, 450, 490, 900, 380, 130]);
  const Tf = fix(Math.round(((mm * cTrue * Tm + mw * 4200 * Tw) / (mm * cTrue + mw * 4200)) * 10) / 10);
  if (!(Tf > Tw + 0.2) || !(Tf < Tm)) throw new Retry();
  const exact = (mw * 4200 * (Tf - Tw)) / (mm * (Tm - Tf));
  const values = { mm, Tm, mw, cw: 4200, Tw, T: Tf };
  return single({
    prompt: `A ${num(mm)} kg metal block is heated in boiling water to ${Tm} °C, then quickly moved into ${num(mw)} kg of water at ${num(Tw)} °C. The final temperature of the water and block is ${num(Tf)} °C. Take c = 4200 J/kg °C for water. ${MIX_TEXT[0]} What is the specific heat capacity of the metal, in J/kg °C?${DP}`,
    exact, unit: "J/kg °C", rounded: true, formula: "mix", unknown: "cm", values, units: {},
    steps: [
      "Energy gained by the water = energy lost by the block.",
      `Water gains \`${num(mw)} × 4200 × (${num(Tf)} - ${num(Tw)}) = ${num(mw * 4200 * (Tf - Tw))}\` J.`,
      `So \`cm = ${num(mw * 4200 * (Tf - Tw))} / (${num(mm)} × (${Tm} - ${num(Tf)}))\``,
    ],
    hints: [
      "Work out the energy the water gained with `E = m × c × ΔT`. The block lost exactly that much.",
      `Then rearrange for the block: \`c = E / (m × ΔT)\`, with ΔT = ${Tm} - ${num(Tf)} (in the calculator: \`_mw * _cw * (_T - _Tw) / (_mm * (_Tm - _T))\`).${THEN}`,
    ],
    candidates: [(mw * 4200 * (Tf - Tw)) / (mm * Tm), (mw * 4200 * (Tm - Tf)) / (mm * (Tf - Tw)), (4200 * (Tf - Tw)) / (Tm - Tf), exact * 1.1],
  }, rng);
}

function mixingMulti(rng) {
  if (rng.next() < 0.5) {
    // Heater with efficiency: useful energy, energy supplied, time
    const dev = rng.pick(["kettle", "immersion heater", "water heater"]);
    const m = rng.int(30, 250) / 100;
    const T1 = rng.int(100, 250) / 10;
    const T2 = rng.int(500, 950) / 10;
    const P = 10 * rng.int(80, 300);
    const eff = rng.int(60, 95);
    const c = 4200;
    const Eu = (m * c * (T2 - T1)) / 1000;
    const Es = Eu / (eff / 100);
    const t = (Es * 1000) / P;
    const values = { m, c, T1, T2, eff, P };
    const explanation = [
      "Find the useful energy the water needs, scale up by the efficiency to get the energy supplied, then divide by the power.",
      `1. Useful energy: \`${num(m)} × ${c} × (${num(T2)} - ${num(T1)}) / 1000\` ${result(Eu, true, "kJ")}`,
      `2. Energy supplied: \`${num(Eu)} / (${eff} / 100)\` ${result(Es, true, "kJ")}`,
      `3. Time: \`t = E / P = ${num(Es * 1000)} / ${P}\` ${result(t, true, "s")}`,
    ].join("\n\n");
    return multi(
      `${An(dev)} rated at ${P} W heats ${num(m)} kg of water from ${num(T1)} °C to ${num(T2)} °C. It is ${eff}% efficient. Take c = ${c} J/kg °C for water.`,
      [
        numPart("useful", "Useful energy", `How much energy does the water gain, in kJ?${DP}`, Eu,
          "Use `E = m × c × ΔT`, then divide by 1000 for kJ (in the calculator: `_m * _c * (_T2 - _T1) / 1000`).",
          { formula: "emc", unknown: "E", values: { m, c, T1, T2, dir: 1 }, units: { E: "kJ" } }),
        numPart("supplied", "Energy supplied", `How much electrical energy must be supplied, in kJ?${DP}`, Es,
          `Only ${eff}% of the supplied energy is useful, so supplied = useful ÷ (${eff}/100). Use the unrounded useful energy.`,
          { formula: "effE", unknown: "Ein", values: { m, c, T1, T2, eff }, units: { Ein: "kJ" } }),
        numPart("time", "Time", `How long does it take, in seconds?${DP}`, t,
          "Time = energy supplied (in J) ÷ power (in the calculator: `_m * _c * (_T2 - _T1) / (_eff / 100) / _P`).",
          { formula: "heaterT", unknown: "t", values, units: {} }),
      ],
      explanation, values, {},
    );
  }
  // Mixing: final temperature, then energy gained by the water
  const metal = rng.pick(SOLIDS.filter((s) => ["aluminium", "copper", "iron", "steel"].includes(s.mat)));
  const mm = rng.int(20, 200) / 100;
  const mw = rng.int(30, 300) / 100;
  const Tm = rng.int(70, 250);
  const Tw = rng.int(80, 250) / 10;
  const T = (mm * metal.c * Tm + mw * 4200 * Tw) / (mm * metal.c + mw * 4200);
  const Eg = (mw * 4200 * (T - Tw)) / 1000;
  const values = { mm, cm: metal.c, Tm, mw, cw: 4200, Tw };
  const item = rng.pick(metal.items);
  const explanation = [
    "Energy lost by the metal = energy gained by the water.",
    `1. \`T = (${num(mm)} × ${metal.c} × ${Tm} + ${num(mw)} × 4200 × ${num(Tw)}) / (${num(mm)} × ${metal.c} + ${num(mw)} × 4200)\` ${result(T, true, "°C")}`,
    `2. Energy gained by the water: \`${num(mw)} × 4200 × (${num(T)} - ${num(Tw)}) / 1000\` ${result(Eg, true, "kJ")}`,
  ].join("\n\n");
  return multi(
    `${An(item)} of mass ${num(mm)} kg at ${Tm} °C is dropped into ${num(mw)} kg of water at ${num(Tw)} °C. Take c = ${metal.c} J/kg °C for ${metal.mat} and c = 4200 J/kg °C for water. ${MIX_TEXT[0]}`,
    [
      numPart("temp", "Final temperature", `What is the final temperature, in °C?${DP}`, T,
        "Set energy lost by the metal equal to energy gained by the water and solve for T (in the calculator: `(_mm * _cm * _Tm + _mw * _cw * _Tw) / (_mm * _cm + _mw * _cw)`).",
        { formula: "mix", unknown: "T", values, units: {} }),
      numPart("gain", "Energy gained", `How much energy does the water gain, in kJ?${DP}`, Eg,
        "Use `E = m × c × ΔT` for the water, with ΔT from its start temperature to the unrounded final temperature, then divide by 1000.",
        { formula: "mixE", unknown: "E", values, units: { E: "kJ" } }),
    ],
    explanation, values, {},
  );
}

// ---------------------------------------------------------------------------------------------

const GENS = { "specific-heat": genSpecific, "latent-heat": genLatent, "temperature-scales": genScales, "mixing-heat": genMixing };

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return xGenerate(subtopic, rng);
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
// Independent check: convert every stated value to SI with its own table, substitute the answer back
// into the un-rearranged law (an energy balance for mixing, the 0-100 °C / 32-212 °F fixed points for
// Fahrenheit) and look at the residual. Whole-number answers must be integers that satisfy the law
// exactly; a rounded answer x is right when the law changes sign strictly inside x ± 0.005.

const SI_FACTOR = { g: 0.001, kJ: 1000, "kJ/kg": 1000, kW: 1000, min: 60 };
const ON_FP = (C, F) => (F - 32) / 180 - C / 100; // 0 °C = 32 °F, 100 °C = 212 °F

const LAWS = {
  emc: (k) => {
    const dT = k.dT !== undefined ? k.dT : k.dir * (k.T2 - k.T1);
    return dT > 0 ? k.E - k.m * k.c * dT : NaN;
  },
  emc2: (k) => (k.T2 > k.T1 ? k.E - (k.mw * k.cw + k.mk * k.ck) * (k.T2 - k.T1) : NaN),
  eml: (k) => k.E - k.m * k.L,
  eml0: (k) => k.E - k.m * k.L, // matching units (J with J/kg, kJ with kJ/kg)
  curve: (k) => k.E - k.m * (k.L + k.c * (k.T2 - k.T1)),
  ck: (k) => k.K - k.off - k.C,
  dk: (k) => k.dK - Math.abs(k.T2 - k.T1),
  df: (k) => k.dF / 180 - k.dC / 100,
  cf: (k) => ON_FP(k.C, k.F),
  kf: (k) => ON_FP(k.K - k.off, k.F),
  pt: (k) => k.E - k.P * k.t,
  eff: (k) => k.Eout * 100 - k.eff * k.Ein,
  heater: (k) => (k.P * (k.eff === undefined ? 100 : k.eff) / 100) * k.t - k.m * k.c * k.dT,
  heaterT: (k) => (k.P * k.eff / 100) * k.t - k.m * k.c * (k.T2 - k.T1),
  effE: (k) => k.Ein * k.eff / 100 - k.m * k.c * (k.T2 - k.T1),
  mix: (k) => (k.mm !== undefined
    ? k.mm * k.cm * (k.T - k.Tm) + k.mw * k.cw * (k.T - k.Tw)
    : k.m1 * (k.T - k.T1) + k.m2 * (k.T - k.T2)),
  // energy gained by the water, with T found from the balance independently (bisection)
  mixE: (k) => {
    let lo = Math.min(k.Tm, k.Tw), hi = Math.max(k.Tm, k.Tw);
    const f = (T) => k.mm * k.cm * (T - k.Tm) + k.mw * k.cw * (T - k.Tw);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    return k.E - k.mw * k.cw * ((lo + hi) / 2 - k.Tw);
  },
};
// Must be strictly positive (after conversion to SI).
const POS = ["m", "m1", "m2", "mm", "mw", "mk", "c", "cm", "cw", "ck", "L", "P", "t", "Ein", "eff", "dT", "dK", "dF", "dC", "K"];
const NONNEG = ["E", "Eout"];

function checkOne(spec, answer) {
  if (!spec || !LAWS[spec.formula] || !spec.values || !spec.unknown) return false;
  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  const units = spec.units || {};
  const law = LAWS[spec.formula];
  const at = (val) => {
    const k = {};
    for (const [key, raw] of Object.entries({ ...spec.values, [spec.unknown]: val })) {
      k[key] = units[key] ? raw * SI_FACTOR[units[key]] : raw;
    }
    return k;
  };
  const k = at(x);
  for (const [key, val] of Object.entries(k)) {
    if (typeof val !== "number" || !Number.isFinite(val)) return false;
    if (POS.includes(key) && !(val > 0)) return false;
    if (NONNEG.includes(key) && val < 0) return false;
  }
  if (k.eff !== undefined && k.eff > 100) return false;
  const r = law(k);
  const step = 1e-4 * Math.max(1, Math.abs(x));
  const sens = Math.abs(law(at(x + step)) - law(at(x - step))) / (2 * step);
  if (!Number.isFinite(r) || !(sens > 0)) return false;
  if (!spec.rounded) return Number.isInteger(x) && Math.abs(r) / sens <= 1e-6;
  const h = 0.005;
  const lo = law(at(x - h));
  const hi = law(at(x + h));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
  const eps = 1e-7 * sens;
  if (Math.abs(lo) <= eps || Math.abs(hi) <= eps) return false; // a rounding tie: never generated
  return lo * hi < 0;
}

// Readings like "300 K", "25 °C", "80 °F" -> kelvin with the given offset.
function toKelvin(txt, off) {
  const m = /^(-?\d+(?:\.\d+)?) (K|°C|°F)$/.exec(String(txt));
  if (!m) return NaN;
  const v = Number(m[1]);
  if (m[2] === "K") return v;
  if (m[2] === "°C") return v + off;
  return 100 * (v - 32) / 180 + off;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (p.expert) return xVerify(question, answer);
  if (p.multi) {
    if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
    return p.parts.length === question.parts.length && p.parts.every((spec) => checkOne(spec, answer[spec.id]));
  }
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  if (p.formula === "compare") {
    const ks = question.choices.map((c) => toKelvin(c, p.off));
    if (ks.some((v) => !Number.isFinite(v))) return false;
    const mine = toKelvin(answer, p.off);
    return ks.every((v, i) => question.choices[i] === String(answer) || (p.high ? mine - v >= 0.5 : v - mine >= 0.5));
  }
  return checkOne(p, answer);
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
    const x = xNumOf(a);
    if (!Number.isFinite(x)) return false;
    return fn(v, x, 0.5 * 10 ** -spec.dp) === true;
  };
  if (question.answerType === "multi") {
    if (!Array.isArray(question.parts) || !Array.isArray(p.parts) || p.parts.length !== question.parts.length) return false;
    if (!answer || typeof answer !== "object") return false;
    return p.parts.every((spec, i) => spec.id === question.parts[i].id && one(spec, answer[spec.id], question.parts[i]));
  }
  return one(p, answer, question);
}

// ---------------------------------------------------------------------------------------------
// Expert questions (all answers rounded as each part says; every constant is stated).

const XC = { water: 4200, ice: 2100, Lf: 334, Lv: 2260 };
const X_METALS = [
  { mat: "aluminium", c: 900 }, { mat: "copper", c: 385 }, { mat: "iron", c: 450 }, { mat: "lead", c: 130 },
  { mat: "silver", c: 235 }, { mat: "magnesium", c: 1020 }, { mat: "titanium", c: 520 }, { mat: "brass", c: 380 },
];
const X_VESSELS = [{ mat: "aluminium", c: 900 }, { mat: "copper", c: 385 }, { mat: "steel", c: 490 }, { mat: "iron", c: 450 }];
const X_POTS = ["kettle", "saucepan", "tea urn", "pan", "boiling pot"];
const X_STUDENTS = ["A student", "A technician", "Priya", "Tom", "A lab group", "Mei", "Kofi", "Sara"];

// Specific heat capacity, expert 1: find c from a heating experiment, correct it for heat lost, then
// identify the metal from a list (the uncorrected value can point at the wrong one).
function xSpecificExperiment(rng) {
  const who = rng.pick(X_STUDENTS);
  const metal = rng.pick(X_METALS);
  const m = rng.int(4, 30) / 10;
  const dTt = rng.int(80, 300) / 10;
  const t = rng.int(4, 20);
  const loss = rng.int(4, 30);
  const P = Math.round((metal.c * m * dTt) / (t * 60 * (1 - loss / 100)));
  if (P < 10 || P > 3000) throw new XRetry();
  const T1 = rng.int(150, 250) / 10;
  const dT = Math.round(((P * t * 60 * (1 - loss / 100)) / (m * metal.c)) * 10) / 10;
  const T2 = fix(T1 + dT);
  const E = P * t * 60;
  const cRaw = E / (m * (T2 - T1));
  const cCorr = cRaw * (1 - loss / 100);
  // Four options, every pair at least 15% apart, so "nearest" is never close.
  const opts = [metal];
  for (const o of rng.shuffle(X_METALS.filter((x) => x !== metal))) {
    if (opts.length < 4 && opts.every((y) => Math.abs(y.c - o.c) / Math.max(y.c, o.c) >= 0.15)) opts.push(o);
  }
  if (opts.length < 4) throw new XRetry();
  const nearest = opts.reduce((a, b) => (Math.abs(b.c - cCorr) < Math.abs(a.c - cCorr) ? b : a));
  if (nearest !== metal) throw new XRetry();
  const listed = [...opts].sort((a, b) => a.c - b.c);
  const values = { P, t, m, T1, T2, loss, opts: listed.map((o) => [cap(o.mat), o.c]) };
  const keep = 100 - loss;
  return xMulti(
    `${who} heats a ${num(m)} kg block of an unknown metal with a ${P} W electrical heater for ${t} minutes. Its temperature rises from ${num(T1)} °C to ${num(T2)} °C. Afterwards ${who === "A lab group" ? "they estimate" : "it is estimated"} that ${loss}% of the heater's energy was lost to the surroundings. The metal is one of these: ${listed.map((o) => `${o.mat} (${o.c} J/kg °C)`).join(", ")}.`,
    [
      xNum("raw", "Ignoring losses", "What specific heat capacity do the results give if no energy were lost, in J/kg °C?", cRaw, 0,
        "All the heater's energy is assumed to go into the block: `c = E / (m × ΔT)` with `E = P × t` (t in seconds).", "c-raw"),
      xNum("corrected", "Allowing for losses", `What is the specific heat capacity once the ${loss}% lost is allowed for, in J/kg °C?`, cCorr, 0,
        `Only ${keep}% of the supplied energy heated the block. In the calculator: \`_P * _t_min * 60 * (100 - _loss) / 100 / (_m * (_T2 - _T1))\`.`, "c-loss"),
      xPick("metal", "Identify", "Which metal is the block most likely made of?", cap(metal.mat), rng.shuffle(listed.map((o) => cap(o.mat))),
        "Compare the listed values with the specific heat capacity that allows for the losses.", "c-metal"),
    ],
    [
      "This is an experiment run backwards: you know the energy supplied and the temperature rise, and want c.",
      `Energy supplied: \`E = P × t = ${P} × ${t} × 60 = ${E}\` J. Temperature rise: \`ΔT = ${num(T2)} - ${num(T1)} = ${num(dT)}\` °C.`,
      `Ignoring losses: \`c = E / (m × ΔT) = ${E} / (${num(m)} × ${num(dT)})\` ${xRes(cRaw, 0, "J/kg °C")}.`,
      `Only ${keep}% of the energy stayed in the block: \`c = ${keep / 100} × ${E} / (${num(m)} × ${num(dT)})\` ${xRes(cCorr, 0, "J/kg °C")}.`,
      `The nearest listed value is ${metal.mat} (${metal.c} J/kg °C): **${cap(metal.mat)}**. Ignoring the losses makes c look too big, because the block seems to need more energy per degree than it really did.`,
    ],
    values,
    [xG("_P", P), xG("_t_min", t), xG("_m", m), xG("_T1", T1), xG("_T2", T2), xG("_loss", loss)],
    [
      "Find the energy the heater supplied with `E = P × t`, turning minutes into seconds.",
      "Rearrange `E = m × c × ΔT` to `c = E / (m × ΔT)`. That gives c as if no energy were lost.",
      `For the corrected value, only ${keep}% of E actually heated the block. Then compare with the listed metals.`,
    ],
  );
}

// Specific heat capacity, expert 2: a heater with an efficiency warms water and its container; find the
// energy and the time, then the time if the container were (wrongly) ignored.
function xSpecificHeater(rng) {
  const ves = rng.pick(X_VESSELS);
  const pot = rng.pick(X_POTS);
  const mk = rng.int(30, 150) / 100;
  const mw = rng.int(50, 400) / 100;
  const T1 = rng.int(8, 25);
  const T2 = rng.int(45, 95);
  const PkW = rng.pick([1.2, 1.5, 1.8, 2, 2.2, 2.4, 2.5, 2.8, 3]);
  const eff = rng.int(70, 95);
  const cw = XC.water;
  const useful = PkW * 1000 * eff / 100; // W
  const E = ((mw * cw + mk * ves.c) * (T2 - T1)) / 1000; // kJ
  const tMin = (E * 1000) / useful / 60;
  const tAlone = (mw * cw * (T2 - T1)) / useful / 60;
  // Someone who uses the rounded energy from part 1 must still land on the same time.
  if (xRound((xRound(E, 2) * 1000) / useful / 60, 2) !== xRound(tMin, 2)) throw new XRetry();
  const values = { mw, cw, mk, ck: ves.c, T1, T2, P: PkW * 1000, eff };
  return xMulti(
    `${An(ves.mat)} ${pot} of mass ${num(mk)} kg holds ${num(mw)} kg of water at ${T1} °C. A ${num(PkW)} kW heater that is ${eff}% efficient heats the water and the ${pot} together to ${T2} °C. Take c = ${cw} J/kg °C for water and c = ${ves.c} J/kg °C for ${ves.mat}.`,
    [
      xNum("energy", "Energy", `How much energy must the water and the ${pot} gain together, in kJ?`, E, 2,
        `Both warm through the same ΔT: \`E = (m_w × c_w + m_k × c_k) × ΔT\`, then ÷ 1000 for kJ.`, "sh-E"),
      xNum("time", "Time", "How long does the heater take, in minutes?", tMin, 2,
        `Only ${eff}% of ${num(PkW)} kW is useful. Time = energy needed ÷ useful power, in seconds, then ÷ 60.`, "sh-t"),
      xNum("alone", "Water only", `How many minutes would you have predicted if you forgot to heat the ${pot}?`, tAlone, 2,
        "Same method, but with only the water's `m × c × ΔT`.", "sh-t-alone"),
    ],
    [
      `The water and the ${pot} both warm by ΔT = ${T2} - ${T1} = ${T2 - T1} °C.`,
      `Energy: \`(${num(mw)} × ${cw} + ${num(mk)} × ${ves.c}) × ${T2 - T1} / 1000\` ${xRes(E, 2, "kJ")}. In the calculator: \`(_mw * _cw + _mk * _ck) * (_T2 - _T1) / 1000\`.`,
      `Useful power: \`${num(PkW * 1000)} × ${eff} / 100 = ${num(useful)}\` W.`,
      `Time: \`${num(E * 1000)} / ${num(useful)} / 60\` ${xRes(tMin, 2, "min")}.`,
      `Water only: \`${num(mw)} × ${cw} × ${T2 - T1} / ${num(useful)} / 60\` ${xRes(tAlone, 2, "min")}. Forgetting the ${pot} underestimates the time.`,
    ],
    values,
    [xG("_mw", mw), xG("_cw", cw), xG("_mk", mk), xG("_ck", ves.c), xG("_T1", T1), xG("_T2", T2), xG("_P_kW", PkW), xG("_eff", eff)],
    [
      `Two things warm up here: the water and the ${pot}. Each needs its own \`m × c × ΔT\`.`,
      `The heater's useful power is ${eff}% of ${num(PkW)} kW. Convert kW to W.`,
      "Time = energy ÷ useful power gives seconds; divide by 60 for minutes.",
    ],
  );
}

// Latent heat, expert 1: ice below 0 °C heated to warm water or all the way to steam by a heater;
// find the total energy, when the ice has finished melting and when the process ends.
function xLatentCurve(rng) {
  const m = rng.int(100, 1500) / 1000;
  const inG = rng.next() < 0.5;
  const Ti = rng.int(3, 25);
  const steam = rng.next() < 0.5;
  const T2 = rng.int(20, 90);
  const P = rng.pick([500, 750, 800, 1000, 1200, 1500, 2000, 2400, 3000]);
  const Tend = steam ? 100 : T2;
  const E1 = m * XC.ice * Ti, E2 = m * XC.Lf * 1000, E3 = m * XC.water * Tend, E4 = steam ? m * XC.Lv * 1000 : 0;
  const tot = (E1 + E2 + E3 + E4) / 1000;
  const tMelt = (E1 + E2) / P / 60;
  const tEnd = (tot * 1000) / P / 60;
  if (xRound((xRound(tot, 2) * 1000) / P / 60, 2) !== xRound(tEnd, 2)) throw new XRetry();
  const mTxt = inG ? `${num(m * 1000)} g` : `${num(m)} kg`;
  const values = { m, T0: -Ti, steam, T2: Tend, P, ci: XC.ice, cw: XC.water, Lf: XC.Lf, Lv: XC.Lv };
  const mCalc = inG ? "(_m_g / 1000)" : "_m";
  const stageLines = [
    `1. Warm the ice from -${Ti} °C to 0 °C: \`${num(m)} × ${XC.ice} × ${Ti}\` = ${num(E1)} J.`,
    `2. Melt it at 0 °C: \`${num(m)} × ${XC.Lf} × 1000\` = ${num(E2)} J.`,
    `3. Warm the water from 0 °C to ${Tend} °C: \`${num(m)} × ${XC.water} × ${Tend}\` = ${num(E3)} J.`,
    ...(steam ? [`4. Boil it away at 100 °C: \`${num(m)} × ${XC.Lv} × 1000\` = ${num(E4)} J.`] : []),
  ];
  return xMulti(
    `A ${P} W heater is used on ${mTxt} of ice that starts at -${Ti} °C. It keeps heating until ${steam ? "all of it has boiled away at 100 °C" : `the melted ice is water at ${Tend} °C`}. Take c = ${XC.ice} J/kg °C for ice, c = ${XC.water} J/kg °C for water, L = ${XC.Lf} kJ/kg for melting${steam ? ` and L = ${XC.Lv} kJ/kg for boiling` : ""}. Assume all the heater's energy goes into the ice and water.`,
    [
      xNum("total", "Total energy", "How much energy is needed altogether, in kJ?", tot, 2,
        `Split it into stages: ${steam ? "warm the ice, melt it, warm the water, boil it" : "warm the ice, melt it, warm the water"}. Add the stage energies.`, "lh-total"),
      xNum("melted", "Melted", "How many minutes after switching on has the last of the ice just melted?", tMelt, 2,
        "Only the first two stages (warming the ice and melting it) have happened by then. Time = energy ÷ power.", "lh-tmelt"),
      xNum("end", "Finished", "How many minutes does the whole process take?", tEnd, 2,
        "Time = total energy (in J) ÷ power, then ÷ 60 for minutes.", "lh-tend"),
    ],
    [
      `A heating curve has a stage for each temperature change (\`E = m × c × ΔT\`) and each change of state (\`E = m × L\`). Mass: ${inG ? `${num(m * 1000)} g = ${num(m)} kg` : `${num(m)} kg`}.`,
      ...stageLines,
      `Total: ${xRes(tot, 2, "kJ")}.`,
      `The ice has melted after stages 1 and 2: \`(${num(E1)} + ${num(E2)}) / ${P} / 60\` ${xRes(tMelt, 2, "min")}.`,
      `The whole process: \`${num(tot * 1000)} / ${P} / 60\` ${xRes(tEnd, 2, "min")}. In the calculator: \`${mCalc} * (_ci * _Ti + _Lf_kJkg * 1000 + _cw * _Tend${steam ? " + _Lv_kJkg * 1000" : ""}) / _P / 60\`.`,
    ],
    values,
    [xG(inG ? "_m_g" : "_m", inG ? m * 1000 : m), xG("_Ti", Ti), xG("_Tend", Tend), xG("_P", P), xG("_ci", XC.ice), xG("_cw", XC.water), xG("_Lf_kJkg", XC.Lf), ...(steam ? [xG("_Lv_kJkg", XC.Lv)] : [])],
    [
      "List the stages in order. The temperature only changes between changes of state; during melting and boiling it stays fixed.",
      "Use `m × c × ΔT` for each warming stage and `m × L` (L × 1000 for J/kg) for each change of state. Work in J and kg.",
      "A heater of power P supplies P joules every second, so time = energy ÷ P. Divide by 60 for minutes.",
    ],
  );
}

// Latent heat, expert 2: measure L from a boiling kettle, correct it for heat lost to the room, then
// predict how long the rest takes to boil away.
function xLatentKettle(rng) {
  const P = rng.pick([1500, 1800, 2000, 2200, 2400, 2500, 2800, 3000]);
  const t = rng.int(2, 8);
  const Ploss = rng.int(4, 30) * 10;
  const dm = Math.round(((P - Ploss) * t * 60) / (XC.Lv * 1000) * 1000);
  const M = rng.int(10, 90) * 10;
  const Lraw = (P * t * 60) / (dm / 1000) / 1000;
  const Lcor = ((P - Ploss) * t * 60) / (dm / 1000) / 1000;
  const tRest = (M * t) / dm;
  const values = { P, t, Ploss, dm, M };
  return xMulti(
    `A ${P} W kettle with its lid off is kept boiling. In ${t} minutes the mass of water in it falls by ${dm} g. The whole time, the kettle loses energy to the room at a rate of ${Ploss} W. ${M} g of water is still left in it.`,
    [
      xNum("raw", "Ignoring losses", "What specific latent heat of vaporisation do these results give if you ignore the energy lost, in kJ/kg?", Lraw, 0,
        "`L = E / m` with `E = P × t` (t in seconds) and m in kg. Divide by 1000 for kJ/kg.", "lv-raw"),
      xNum("corrected", "Allowing for losses", "What is the specific latent heat once the losses are allowed for, in kJ/kg?", Lcor, 0,
        `Only ${P} - ${Ploss} W actually boils the water. In the calculator: \`(_P - _Ploss) * _t_min * 60 / (_dm_g / 1000) / 1000\`.`, "lv-loss"),
      xNum("rest", "Time left", "Boiling at the same rate, how many more minutes until the kettle boils dry?", tRest, 2,
        `The water boils off at a steady rate: ${dm} g every ${t} minutes.`, "lv-rest"),
    ],
    [
      "Once the water is boiling, the energy that stays in the water goes into turning it to steam: `E = m × L`.",
      `Ignoring losses: \`L = ${P} × ${t} × 60 / ${num(dm / 1000)} / 1000\` ${xRes(Lraw, 0, "kJ/kg")}.`,
      `Only ${P - Ploss} W boils water, the rest heats the room: \`L = ${P - Ploss} × ${t} × 60 / ${num(dm / 1000)} / 1000\` ${xRes(Lcor, 0, "kJ/kg")}. Ignoring the losses overestimates L.`,
      `The rate is steady, so the time is proportional to the mass: \`${M} × ${t} / ${dm}\` ${xRes(tRest, 2, "min")}.`,
    ],
    values,
    [xG("_P", P), xG("_t_min", t), xG("_dm_g", dm), xG("_Ploss", Ploss), xG("_M_g", M)],
    [
      "When water is already boiling, the energy that reaches it changes liquid to steam without changing the temperature: `E = m × L`.",
      "Energy supplied: `E = P × t` with t in seconds. Mass in kg. The answer comes out in J/kg; divide by 1000 for kJ/kg.",
      `For the correction, only the power that is not lost (P minus ${Ploss} W) boils water. For the time left, compare ${M} g with the ${dm} g that boiled off in ${t} minutes.`,
    ],
  );
}

const X_SCALES = ["Zeta", "Nova", "Orion", "Vega", "Lyra", "Polaris", "Atlas", "Draco"];

// Temperature scales, expert 1: a made-up linear scale with its own fixed points (sometimes reversed).
function xScaleCustom(rng) {
  const name = rng.pick(X_SCALES);
  const u = `°${name[0]}`;
  const a = rng.int(-30, 30);
  const rev = rng.next() < 0.2;
  const b = a + (rev ? -1 : 1) * rng.int(50, 250);
  const C = rng.int(-300, 1200) / 10;
  const y = fix(Math.round((a + ((b - a) * rng.int(-20, 120)) / 100) * 10) / 10);
  const x = a + ((b - a) * C) / 100;
  const F = ((y - a) / (b - a)) * 180 + 32;
  const values = { a, b, C, y };
  return xMulti(
    `On the ${name} scale (${u}), pure water freezes at ${a} ${u} and boils at ${b} ${u} (at normal pressure), and the scale is linear between and beyond these points.${rev ? ` Notice that the numbers go down as it gets hotter.` : ""} Use °F = °C × 9/5 + 32.`,
    [
      xNum("toX", `To ${u}`, `What is ${num(C)} °C on the ${name} scale?`, x, 2,
        `Find what fraction of the way from freezing to boiling ${num(C)} °C is (÷ 100), then go the same fraction of the way from ${a} to ${b} ${u}.`, "sx-to"),
      xNum("toF", "To °F", `What is ${num(y)} ${u} in °F?`, F, 2,
        `Fraction of the way: \`(${num(y)} - ${a}) / (${b} - ${a})\`. On the Fahrenheit scale, freezing is 32 and boiling is 212.`, "sx-f"),
    ],
    [
      `Every linear scale can be matched by the fraction of the way from the freezing point to the boiling point. On this scale that gap is ${b} - ${a} = ${b - a} ${u} (100 °C, or 180 °F).`,
      `${num(C)} °C is ${num(C)} / 100 = ${num(C / 100)} of the way, so \`${a} + ${b - a} × ${num(C / 100)}\` ${xRes(x, 2, u)}. In the calculator: \`_a + (_b - _a) * _C / 100\`.`,
      `${num(y)} ${u} is \`(${num(y)} - ${a}) / ${b - a}\` = ${Number(((y - a) / (b - a)).toPrecision(7))} of the way. In °F: \`32 + 180 × that\` ${xRes(F, 2, "°F")}.`,
    ],
    values,
    [xG("_a", a), xG("_b", b), xG("_C", C), xG("_y", y)],
    [
      `Linear scales line up by their fixed points: freezing (0 °C, 32 °F, ${a} ${u}) and boiling (100 °C, 212 °F, ${b} ${u}).`,
      "Turn a reading into the fraction of the way from freezing to boiling, then turn that fraction into a reading on the other scale.",
      rev ? `Here the gap ${b} - ${a} is negative; keep the sign and the formula still works.` : "Readings below freezing or above boiling just give a fraction below 0 or above 1.",
    ],
  );
}

const X_THERMO = [
  { what: "A liquid-in-glass thermometer has no markings yet. Its liquid column", unit: "cm", qty: "length", lo: [20, 60], gap: [100, 250] },
  { what: "An uncalibrated resistance thermometer", unit: "Ω", qty: "resistance", lo: [950, 1050], gap: [300, 420] },
  { what: "A homemade gas thermometer", unit: "kPa", qty: "pressure", lo: [900, 1050], gap: [300, 400] },
];

// Temperature scales, expert 2: calibrate a thermometer from its ice and steam points (readings may be
// outside 0-100 °C), then work backwards to a reading.
function xScaleCalibrate(rng) {
  const th = rng.pick(X_THERMO);
  const X0 = rng.int(th.lo[0], th.lo[1]) / 10;
  const X100 = fix(X0 + rng.int(th.gap[0], th.gap[1]) / 10);
  const Xr = fix(Math.round((X0 + ((X100 - X0) * rng.int(-15, 115)) / 100) * 10) / 10);
  let T2;
  do T2 = rng.int(-20, 120); while (T2 === 0 || T2 === 100);
  const T = ((Xr - X0) / (X100 - X0)) * 100;
  const X2 = X0 + ((X100 - X0) * T2) / 100;
  if (Xr <= 0 || X2 <= 0) throw new XRetry();
  const verb = th.qty === "length" ? "is" : "reads";
  const values = { X0, X100, Xr, T2 };
  return xMulti(
    `${th.what} ${verb} ${num(X0)} ${th.unit} in melting ice (0 °C) and ${num(X100)} ${th.unit} in steam above boiling water (100 °C). Assume the ${th.qty} changes linearly with temperature.`,
    [
      xNum("temp", "Temperature", `What temperature does a ${th.qty} of ${num(Xr)} ${th.unit} show, in °C?`, T, 2,
        `How far is ${num(Xr)} along the gap from ${num(X0)} to ${num(X100)}? That fraction × 100 is the temperature.`, "cal-T"),
      xNum("reading", "Reading", `What ${th.qty} would it show at ${T2} °C, in ${th.unit}?`, X2, 2,
        `Start at the 0 °C value and add ${T2} / 100 of the gap.`, "cal-X"),
    ],
    [
      `Between the fixed points the ${th.qty} changes by ${num(X100)} - ${num(X0)} = ${num(X100 - X0)} ${th.unit} for 100 °C.`,
      `\`T = (${num(Xr)} - ${num(X0)}) / ${num(X100 - X0)} × 100\` ${xRes(T, 2, "°C")}. In the calculator: \`(_Xr - _X0) / (_X100 - _X0) * 100\`.${T < 0 || T > 100 ? " The reading is outside the fixed points, so the temperature is outside 0-100 °C; the linear rule still applies." : ""}`,
      `Backwards: \`${num(X0)} + ${num(X100 - X0)} × ${T2} / 100\` ${xRes(X2, 2, th.unit)}.`,
    ],
    values,
    [xG("_X0", X0), xG("_X100", X100), xG("_Xr", Xr), xG("_T2", T2)],
    [
      `The two fixed points give the scale: ${num(X0)} ${th.unit} means 0 °C and ${num(X100)} ${th.unit} means 100 °C.`,
      "Temperature = (reading - ice-point reading) ÷ (steam-point reading - ice-point reading) × 100.",
      "To go backwards, rearrange the same rule for the reading.",
    ],
  );
}

const X_KS = [-4, -3, -2, -1, 0.5, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

// Temperature scales, expert 3: when is the °F reading k times the °C reading (or equal to the K reading)?
function xScaleMultiple(rng) {
  if (rng.next() < 0.15) {
    const K = (273.15 * 1.8 - 32) / 0.8;
    return xSingle(
      "At what temperature do a Fahrenheit thermometer and a kelvin thermometer show the same number? Give the answer in K. Use K = °C + 273.15 and °F = °C × 9/5 + 32.",
      K, 2,
      [
        "Call the shared number x. Then x K means x - 273.15 °C, and that in °F must also be x.",
        "`(x - 273.15) × 9/5 + 32 = x`, so `1.8x - 491.67 + 32 = x` and `0.8x = 459.67`.",
        `\`x = 459.67 / 0.8\` ${xRes(K, 2, "K")}.`,
      ],
      { off: 273.15 }, "fk-same", [xG("_off", 273.15)],
      [
        "Call the shared reading x. Write the Celsius temperature in terms of x using the kelvin rule.",
        "Turn that Celsius temperature into °F and set it equal to x. Collect the x terms on one side.",
      ],
    );
  }
  const k = rng.pick(X_KS);
  const askF = rng.next() < 0.5;
  const C = 32 / (k - 1.8);
  const F = k * C;
  const kTxt = k === -1 ? "the same number as the Celsius reading but with the opposite sign" : `exactly ${num(k)} times the Celsius reading`;
  return xSingle(
    `One day a Fahrenheit thermometer shows ${kTxt}. What is the temperature in ${askF ? "°F" : "°C"}? Use °F = °C × 9/5 + 32.`,
    askF ? F : C, 2,
    [
      `Call the Celsius reading C. The Fahrenheit reading is \`C × 9/5 + 32\`, and it must equal \`${num(k)} × C\`.`,
      `\`1.8C + 32 = ${num(k)}C\`, so \`(${num(k)} - 1.8)C = 32\` and \`C = 32 / ${num(k - 1.8)}\` ${xRes(C, 2, "°C")}.`,
      ...(askF ? [`In °F: \`${num(k)} × C\` ${xRes(F, 2, "°F")} (from the unrounded C).`] : []),
    ],
    { k, askF }, "fk-mult", [xG("_k", k)],
    [
      "Call the Celsius reading C and write the Fahrenheit reading two ways: from the conversion rule, and from the condition in the question.",
      `Set \`1.8C + 32\` equal to \`${num(k)} × C\` and solve for C.${askF ? " Then convert to °F." : ""}`,
    ],
  );
}

// Mixing, expert 1: ice cubes dropped in a drink. Either it all melts (find the final temperature) or it
// doesn't (the mix sits at 0 °C; find how much ice is left). The learner has to check which.
function xMixIce(rng) {
  const mi = rng.int(5, 70) * 2; // g
  const Ti = rng.int(0, 18);
  const mw = rng.int(15, 50) / 100; // kg
  const Tw = rng.int(8, 40);
  const ci = XC.ice, cw = XC.water, Lf = XC.Lf;
  const have = mw * cw * Tw; // J released cooling the drink to 0 °C
  const needWarm = (mi / 1000) * ci * Ti;
  const needMelt = (mi / 1000) * Lf * 1000;
  let Tf, left;
  if (have >= needWarm + needMelt) {
    Tf = (have - needWarm - needMelt) / ((mw + mi / 1000) * cw);
    left = 0;
    if (Tf < 0.05) throw new XRetry();
  } else {
    if (have <= needWarm) throw new XRetry(); // the drink would freeze: out of scope
    Tf = 0;
    left = mi - ((have - needWarm) / (Lf * 1000)) * 1000;
    if (left < 0.5) throw new XRetry();
  }
  const drink = rng.pick(["a glass of lemonade", "a jug of water", "a glass of juice", "a cup of iced tea", "a bottle of water", "a glass of cola"]);
  const values = { mi, Ti, mw, Tw, ci, cw, Lf };
  const all = left === 0;
  return xMulti(
    `${mi} g of ice at ${Ti === 0 ? "0" : `-${Ti}`} °C is dropped into ${drink}: ${num(mw)} kg of liquid at ${Tw} °C. Treat the drink as water: c = ${cw} J/kg °C. For ice, c = ${ci} J/kg °C and L = ${Lf} kJ/kg. No energy is exchanged with the container or the air. If some ice is left at the end, the mixture settles at 0 °C.`,
    [
      xNum("temp", "Final temperature", "What is the final temperature of the drink, in °C?", Tf, 2,
        "First check whether cooling the drink to 0 °C releases enough energy to warm and melt all the ice.", "ice-T"),
      xNum("left", "Ice left", "How much ice is left unmelted, in g? (Type 0 if it all melts.)", left, 2,
        "If the drink can't melt all of it, the energy it gives out cooling to 0 °C melts only part of the ice (after warming it to 0 °C).", "ice-left"),
    ],
    [
      `Energy the drink gives out cooling to 0 °C: \`${num(mw)} × ${cw} × ${Tw}\` = ${num(have)} J.`,
      `Energy to warm all the ice to 0 °C: \`${num(mi / 1000)} × ${ci} × ${Ti}\` = ${num(needWarm)} J. Energy to melt it: \`${num(mi / 1000)} × ${Lf} × 1000\` = ${num(needMelt)} J.`,
      all
        ? `${num(have)} J is more than ${num(needWarm + needMelt)} J, so all the ice melts and the leftover ${num(have - needWarm - needMelt)} J warms all ${num(mw + mi / 1000)} kg of water: \`T = ${num(have - needWarm - needMelt)} / (${num(mw + mi / 1000)} × ${cw})\` ${xRes(Tf, 2, "°C")}. No ice is left: **0** g.`
        : `${num(have)} J is less than ${num(needWarm + needMelt)} J, so not all the ice melts and the mixture sits at **0** °C. The ${num(have - needWarm)} J left after warming the ice melts \`${num(have - needWarm)} / (${Lf} × 1000)\` kg, so the ice left is \`${mi} - that × 1000\` ${xRes(left, 2, "g")}.`,
    ],
    values,
    [xG("_mi_g", mi), xG("_Ti", Ti), xG("_mw", mw), xG("_Tw", Tw), xG("_ci", ci), xG("_cw", cw), xG("_Lf_kJkg", Lf)],
    [
      "Compare two energies: what the drink can give out by cooling to 0 °C, and what the ice needs to warm to 0 °C and melt completely.",
      "If the drink has more, all the ice melts: the spare energy warms the whole lot of water (drink + melted ice) above 0 °C.",
      "If the drink has less, the mixture stays at 0 °C and the spare energy after warming the ice melts only part of it: mass melted = energy ÷ L.",
    ],
  );
}

const X_BLOCKS = [{ mat: "aluminium", c: 900 }, { mat: "copper", c: 385 }, { mat: "iron", c: 450 }, { mat: "brass", c: 380 }, { mat: "steel", c: 490 }, { mat: "lead", c: 130 }];
const X_CUPS = [{ mat: "copper", c: 385 }, { mat: "aluminium", c: 900 }];

// Mixing, expert 2: hot block into water in a calorimeter cup (three bodies), then work backwards to the
// starting temperature needed for a target final temperature.
function xMixCalorimeter(rng) {
  const blk = rng.pick(X_BLOCKS);
  const cup = rng.pick(X_CUPS);
  const mm = rng.int(10, 100) / 100;
  const Tm = rng.int(60, 300);
  const mw = rng.int(10, 50) / 100;
  const mk = rng.int(5, 25) / 100;
  const Tw = rng.int(10, 25);
  const cw = XC.water;
  const hot = mm * blk.c;
  const cold = mw * cw + mk * cup.c;
  const Tf = (hot * Tm + cold * Tw) / (hot + cold);
  if (Tf >= 95 || Tf - Tw < 1) throw new XRetry();
  const Tf2 = Math.round(Tf) + rng.int(3, 15);
  if (Tf2 >= 99) throw new XRetry();
  const Tm2 = Tf2 + (cold * (Tf2 - Tw)) / hot;
  const values = { mm, cm: blk.c, Tm, mw, cw, mk, ck: cup.c, Tw, Tf2 };
  return xMulti(
    `${An(blk.mat)} block of mass ${num(mm)} kg is heated to ${Tm} °C and dropped into ${num(mw)} kg of water at ${Tw} °C. The water is in ${an(cup.mat)} calorimeter cup of mass ${num(mk)} kg, also at ${Tw} °C. Take c = ${blk.c} J/kg °C for ${blk.mat}, ${cw} J/kg °C for water and ${cup.c} J/kg °C for ${cup.mat}. No energy is lost to the air.`,
    [
      xNum("final", "Final temperature", "What is the final temperature of the block, water and cup, in °C?", Tf, 2,
        "Energy lost by the block = energy gained by the water + energy gained by the cup. The water and cup start at the same temperature.", "cal-Tf"),
      xNum("start", "Backwards", `To what temperature would the block have to be heated for a final temperature of ${Tf2} °C, in °C?`, Tm2, 2,
        `Now the final temperature is known (${Tf2} °C) and the block's starting temperature is the unknown. Use the same energy balance.`, "cal-Tm"),
    ],
    [
      `Energy balance: \`m_b × c_b × (T_b - T) = (m_w × c_w + m_c × c_c) × (T - T_w)\`.`,
      `Block: ${num(mm)} × ${blk.c} = ${num(hot)} J/°C. Water + cup: ${num(mw)} × ${cw} + ${num(mk)} × ${cup.c} = ${num(cold)} J/°C.`,
      `\`T = (${num(hot)} × ${Tm} + ${num(cold)} × ${Tw}) / (${num(hot)} + ${num(cold)})\` ${xRes(Tf, 2, "°C")}. In the calculator: \`(_mm * _cm * _Tm + (_mw * _cw + _mk * _ck) * _Tw) / (_mm * _cm + _mw * _cw + _mk * _ck)\`.`,
      `Backwards, with T = ${Tf2} °C: \`T_b = ${Tf2} + ${num(cold)} × (${Tf2} - ${Tw}) / ${num(hot)}\` ${xRes(Tm2, 2, "°C")}.`,
    ],
    values,
    [xG("_mm", mm), xG("_cm", blk.c), xG("_Tm", Tm), xG("_mw", mw), xG("_cw", cw), xG("_mk", mk), xG("_ck", cup.c), xG("_Tw", Tw)],
    [
      "Three things share energy: the hot block cools, and the water and the cup both warm up to the same final temperature T.",
      "Write `energy lost by block = energy gained by water + energy gained by cup`, each as `m × c × (temperature change)`.",
      "Collect the T terms on one side to solve for T. For the second part, T is known and the block's starting temperature is the unknown.",
    ],
  );
}

function xGenerate(subtopic, rng) {
  if (subtopic === "specific-heat") return xRun(rng.next() < 0.5 ? xSpecificExperiment : xSpecificHeater, rng);
  if (subtopic === "latent-heat") return xRun(rng.next() < 0.55 ? xLatentCurve : xLatentKettle, rng);
  if (subtopic === "temperature-scales") {
    const r = rng.next();
    return xRun(r < 0.4 ? xScaleCustom : r < 0.8 ? xScaleCalibrate : xScaleMultiple, rng);
  }
  if (subtopic === "mixing-heat") return xRun(rng.next() < 0.5 ? xMixIce : xMixCalorimeter, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Expert checks. Numbers: (values, x, h) -> true when the law has its root inside x ± h.
// Choices: (values, answer) -> true when the answer is the right option, found independently.
function xIceWalk(v, stop) {
  let E = v.m * v.ci * (0 - v.T0);
  E += v.m * v.Lf * 1000;
  if (stop === "melted") return E;
  E += v.m * v.cw * (v.T2 - 0);
  if (v.steam) E += v.m * v.Lv * 1000;
  return E;
}
const X_CHECKS = {
  "c-raw": (v, x, h) => xBracket((c) => v.P * v.t * 60 - v.m * c * (v.T2 - v.T1), x, h),
  "c-loss": (v, x, h) => xBracket((c) => (v.P * v.t * 60 * (100 - v.loss)) / 100 - v.m * c * (v.T2 - v.T1), x, h),
  "c-metal": (v, a) => {
    // Measured c with the losses, then the listed value with the smallest relative gap.
    let lo = 1, hi = 1e5;
    const f = (c) => (v.P * v.t * 60 * (100 - v.loss)) / 100 - v.m * c * (v.T2 - v.T1);
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
    const c = (lo + hi) / 2;
    const best = v.opts.reduce((p, q) => (Math.abs(q[1] - c) < Math.abs(p[1] - c) ? q : p));
    return best[0] === a;
  },
  "sh-E": (v, x, h) => xBracket((E) => E * 1000 - v.mw * v.cw * (v.T2 - v.T1) - v.mk * v.ck * (v.T2 - v.T1), x, h),
  "sh-t": (v, x, h) => xBracket((t) => (v.P * v.eff / 100) * t * 60 - v.mw * v.cw * (v.T2 - v.T1) - v.mk * v.ck * (v.T2 - v.T1), x, h),
  "sh-t-alone": (v, x, h) => xBracket((t) => (v.P * v.eff / 100) * t * 60 - v.mw * v.cw * (v.T2 - v.T1), x, h),
  "lh-total": (v, x, h) => xBracket((E) => E * 1000 - xIceWalk(v, "end"), x, h),
  "lh-tmelt": (v, x, h) => xBracket((t) => v.P * t * 60 - xIceWalk(v, "melted"), x, h),
  "lh-tend": (v, x, h) => xBracket((t) => v.P * t * 60 - xIceWalk(v, "end"), x, h),
  "lv-raw": (v, x, h) => xBracket((L) => v.P * v.t * 60 - (v.dm / 1000) * L * 1000, x, h),
  "lv-loss": (v, x, h) => xBracket((L) => (v.P - v.Ploss) * v.t * 60 - (v.dm / 1000) * L * 1000, x, h),
  // Same boiling power for the rest: energy per gram from the measured part, applied to M grams.
  "lv-rest": (v, x, h) => xBracket((t) => (v.P - v.Ploss) * t * 60 - v.M * (((v.P - v.Ploss) * v.t * 60) / v.dm), x, h),
  "sx-to": (v, x, h) => xBracket((X) => (X - v.a) / (v.b - v.a) - v.C / 100, x, h),
  "sx-f": (v, x, h) => xBracket((F) => (v.y - v.a) / (v.b - v.a) - (F - 32) / 180, x, h),
  "cal-T": (v, x, h) => xBracket((T) => (v.Xr - v.X0) / (v.X100 - v.X0) - T / 100, x, h),
  "cal-X": (v, x, h) => xBracket((X) => (X - v.X0) / (v.X100 - v.X0) - v.T2 / 100, x, h),
  "fk-mult": (v, x, h) => xBracket(v.askF ? (F) => F - v.k * ((F - 32) * 5 / 9) : (C) => C * 9 / 5 + 32 - v.k * C, x, h),
  "fk-same": (v, x, h) => xBracket((K) => (K - v.off) * 9 / 5 + 32 - K, x, h),
  "ice-T": (v, x, h) => {
    const m = v.mi / 1000;
    const have = v.mw * v.cw * v.Tw;
    const need = m * v.ci * v.Ti + m * v.Lf * 1000;
    if (have < need) return x - h < 0 && 0 < x + h; // ice remains: 0 °C
    return xBracket((T) => v.mw * v.cw * (v.Tw - T) - need - m * v.cw * T, x, h);
  },
  "ice-left": (v, x, h) => {
    const m = v.mi / 1000;
    const have = v.mw * v.cw * v.Tw;
    if (have >= m * v.ci * v.Ti + m * v.Lf * 1000) return x - h < 0 && 0 < x + h; // all melts
    // Energy the drink releases = warming all the ice + melting (mi - left) grams of it.
    return xBracket((g) => have - m * v.ci * v.Ti - ((v.mi - g) / 1000) * v.Lf * 1000, x, h);
  },
  "cal-Tf": (v, x, h) => xBracket((T) => v.mm * v.cm * (v.Tm - T) - (v.mw * v.cw + v.mk * v.ck) * (T - v.Tw), x, h),
  "cal-Tm": (v, x, h) => xBracket((Tb) => v.mm * v.cm * (Tb - v.Tf2) - (v.mw * v.cw + v.mk * v.ck) * (v.Tf2 - v.Tw), x, h),
};
