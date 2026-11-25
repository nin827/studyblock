// Gases & Pressure generator. Uses only the seeded rng passed in by the engine.
// SI units (N, m², Pa, kg/m³, m, K). g = 9.8 N/kg and atmospheric pressure are stated in every question
// that uses them. Medium questions state some values in cm², mm², cm, kPa or °C, so a conversion is part
// of the work. Easy/medium answers are whole numbers; hard answers are rounded to 2 decimal places
// (tolerance 0.005), matching Kinematics and Forces & Energy.

const G = 9.8;

const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const fix = (n) => Math.round(n * 1e6) / 1e6;
const clean = (n) => (Math.abs(n - Math.round(n)) < 1e-7 ? Math.round(n) : n);
const isInt = (n) => Math.abs(n - Math.round(n)) < 1e-7;

function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}
function num(n) {
  const r = Math.round(n * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const an = (w) => (/^[aeiou]/i.test(w) || /^8/.test(w) || /^1[18](\D|$)/.test(w) ? `an ${w}` : `a ${w}`);
const An = (w) => cap(an(w));
const DP = " Round to 2 decimal places.";
const THEN = " Then round to 2 decimal places.";

class Retry extends Error {}
const isTie = (x) => {
  const f = Math.abs(x) * 100;
  return Math.abs(f - Math.floor(f) - 0.5) < 1e-6;
};

// ---------------------------------------------------------------------------------------------
// Units, keyed by how they are written. Labels get a suffix: _A_cm2, _h_cm, _P_kPa, _T1_C ...

const CONV = {
  "cm²": { si: "m²", f: 1e-4, suffix: "cm2", calc: "/ 10000", how: "divide by 10 000" },
  "mm²": { si: "m²", f: 1e-6, suffix: "mm2", calc: "/ 1000000", how: "divide by 1 000 000" },
  cm: { si: "m", f: 0.01, suffix: "cm", calc: "/ 100", how: "divide by 100" },
  kPa: { si: "Pa", f: 1000, suffix: "kPa", calc: "* 1000", how: "multiply by 1000" },
  kN: { si: "N", f: 1000, suffix: "kN", calc: "* 1000", how: "multiply by 1000" },
  "°C": { si: "K", add: 273, suffix: "C", calc: "+ 273", how: "add 273" },
};
const toSIu = (v, u) => (!u ? v : CONV[u].add !== undefined ? v + CONV[u].add : v * CONV[u].f);

function labeler(units) {
  const L = (k) => `_${k}${units[k] ? "_" + CONV[units[k]].suffix : ""}`;
  const C = (k) => (units[k] ? `(${L(k)} ${CONV[units[k]].calc})` : L(k));
  return { L, C };
}
function convLine(v, u) {
  const s = toSIu(v, u);
  const exact = Math.abs(s - Number(num(s))) < 1e-12;
  return `${num(v)} ${u} ${exact ? "=" : "≈"} ${num(s)} ${CONV[u].si}`;
}
function givenFrom(values, units, unknown, skip = []) {
  const { L } = labeler(units);
  return Object.entries(values)
    .filter(([k, v]) => k !== unknown && !skip.includes(k) && typeof v === "number")
    .map(([k, value]) => ({ label: L(k), value }));
}
function result(exact, rounded, unit) {
  const shown = fmtAns(exact, rounded);
  const u = unit.startsWith("°") ? unit : ` ${unit}`;
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${exact.toFixed(4)}${u}, which rounds to **${shown}${u}**`;
}

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
      if (ratio > 1e4 || ratio < 1e-4) return;
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
  if (!ok(v)) throw new Retry();
  return v;
}

// ---------------------------------------------------------------------------------------------
// Pressure: P = F / A

const RESTING = ["crate", "statue", "wardrobe", "fridge", "water tank", "piano", "stone block", "tent", "bookcase", "washing machine", "garden shed", "camper van"];
const POINTED = [
  { what: "drawing pin", who: "A thumb pushes a drawing pin into a board", tip: "the point of the pin" },
  { what: "nail", who: "A hammer drives a nail into wood", tip: "the tip of the nail" },
  { what: "needle", who: "A needle is pushed through fabric", tip: "the needle's tip" },
  { what: "knife", who: "A knife is pressed onto a carrot", tip: "the knife's edge" },
  { what: "stiletto heel", who: "A person stands on one stiletto heel", tip: "the heel" },
  { what: "ice skate", who: "A skater stands on one ice skate", tip: "the skate's blade" },
];
const FEET = [
  { who: "A person standing on both feet presses on the floor", tip: "their shoes" },
  { who: "A wooden table presses on the floor", tip: "its four legs" },
  { who: "A loaded trolley presses on the ground", tip: "its wheels" },
  { who: "A tractor presses on the muddy ground", tip: "its tyres" },
  { who: "A sofa presses on the carpet", tip: "its feet" },
  { who: "A camel presses on the sand", tip: "its feet" },
  { who: "A snowshoe walker presses on the snow", tip: "the snowshoes" },
];

function genPressure(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return pressureMulti(rng);
  if (rounded && rng.next() < 0.3) return pressureFace(rng);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";
  const unknown = rng.pick(d === "easy" ? ["P", "P", "F", "A"] : ["P", "P", "F", "A"]);
  let F, Ashown, Aunit, P, Punit, ctx;
  if (d === "easy") {
    Aunit = "m²";
    Ashown = rng.int(1, 12);
    P = 10 * rng.int(2, 300);
    F = P * Ashown;
    Punit = "Pa";
    const thing = rng.pick(RESTING);
    ctx = { lead: `${An(thing)} presses down on the ground`, on: `its base` };
  } else if (d === "medium") {
    if (rng.next() < 0.4) {
      const pt = rng.pick(POINTED);
      Aunit = "mm²";
      Ashown = rng.pick([0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5]);
      F = rng.int(5, 80);
      if (pt.what === "stiletto heel" || pt.what === "ice skate") {
        Ashown = rng.pick([20, 25, 40, 50, 80, 100]);
        F = 10 * rng.int(40, 90);
      }
      P = (F / (Ashown * 1e-6)) / 1000; // kPa
      Punit = "kPa";
      ctx = { lead: pt.who, on: pt.tip };
    } else {
      const ft = rng.pick(FEET);
      Aunit = "cm²";
      [Ashown, P] = draw(() => [rng.int(20, 2000), rng.int(2, 400)], ([a, p]) => isInt((p * a) / 10));
      F = (P * Ashown) / 10; // P in kPa
      Punit = rng.next() < 0.5 ? "kPa" : "Pa";
      if (Punit === "Pa") P *= 1000;
      ctx = { lead: ft.who, on: ft.tip };
    }
  } else {
    Aunit = rng.next() < 0.7 ? "cm²" : "m²";
    Ashown = Aunit === "cm²" ? rng.int(50, 30000) / 10 : rng.int(5, 500) / 100;
    F = rng.int(100, 200000) / 10;
    Punit = Aunit === "cm²" ? "kPa" : "Pa";
    const ft = rng.pick(FEET.concat(RESTING.map((r) => ({ who: `${An(r)} presses down on the floor`, tip: "its base" }))));
    ctx = { lead: ft.who, on: ft.tip };
  }
  const Asi = Aunit === "m²" ? Ashown : toSIu(Ashown, Aunit);
  const Psi = F / Asi;
  const units = {};
  if (Aunit !== "m²") units.A = Aunit;
  if (Punit === "kPa") units.P = "kPa";
  const { C } = labeler(units);
  const aconv = Aunit !== "m²" ? [`Convert the area to m²: ${convLine(Ashown, Aunit)} (${CONV[Aunit].how}).`] : [];
  const Pshown = Punit === "kPa" ? Psi / 1000 : Psi;

  if (unknown === "P") {
    const values = { F, A: Ashown };
    return single({
      prompt: `${ctx.lead} with a force of ${num(F)} N. The area in contact (${ctx.on}) is ${num(Ashown)} ${Aunit}. What pressure is exerted, in ${Punit}?${end}`,
      exact: Pshown, unit: Punit, rounded, formula: "pfa", unknown: "P", values, units,
      steps: [
        "Pressure = force / area: `P = F / A`, with A in m² (1 Pa = 1 N/m²).",
        ...aconv,
        ...(Punit === "kPa" ? [`\`P = ${num(F)} / ${num(Asi)} = ${num(Psi)}\` Pa. Divide by 1000 for kPa:`, `\`P = ${num(Psi)} / 1000\``] : [`\`P = ${num(F)} / ${num(Asi)}\``]),
      ],
      hints: [
        `Pressure is force per unit area: \`P = F / A\`.${Aunit !== "m²" ? ` The area must be in m², so ${CONV[Aunit].how}.` : ""}`,
        `Substitute (in the calculator: \`_F / ${C("A")}\`${Punit === "kPa" ? ", then divide by 1000 for kPa" : ""}).${thenRound}`,
      ],
      candidates: [F * Asi, F / Ashown, Psi, Psi / 1e6, Pshown * 100, Asi / F * 1e6],
    }, rng);
  }
  // Inverse questions state P (hard: kPa or Pa to 1 decimal place).
  let Pgiven = Pshown;
  if (rounded) Pgiven = fix(Math.round(Pshown * 10) / 10);
  if (!(Pgiven > 0)) throw new Retry();
  const PgSI = Punit === "kPa" ? Pgiven * 1000 : Pgiven;
  const pconv = Punit === "kPa" ? [`Convert the pressure: ${convLine(Pgiven, "kPa")}.`] : [];
  if (unknown === "F") {
    const exact = PgSI * Asi;
    const values = { P: Pgiven, A: Ashown };
    return single({
      prompt: `${ctx.lead}. The pressure under ${ctx.on} is ${num(Pgiven)} ${Punit} and the contact area is ${num(Ashown)} ${Aunit}. What force does it push down with, in N?${end}`,
      exact, unit: "N", rounded, formula: "pfa", unknown: "F", values, units,
      steps: ["Rearrange `P = F / A` to `F = P × A`, with P in Pa and A in m².", ...pconv, ...aconv, `\`F = ${num(PgSI)} × ${num(Asi)}\``],
      hints: [
        `Rearrange \`P = F / A\` for the force: \`F = P × A\`. Use Pa and m².`,
        `Substitute (in the calculator: \`${C("P")} * ${C("A")}\`).${thenRound}`,
      ],
      candidates: [Pgiven * Ashown, PgSI / Asi, Pgiven * Asi, PgSI * Ashown, Pgiven * Asi * 100],
    }, rng);
  }
  const Am2 = F / PgSI;
  const exact = Aunit === "m²" ? Am2 : Am2 / CONV[Aunit].f;
  const values = { F, P: Pgiven };
  return single({
    prompt: `${ctx.lead} with a force of ${num(F)} N. The pressure under ${ctx.on} is ${num(Pgiven)} ${Punit}. What is the contact area, in ${Aunit}?${end}`,
    exact, unit: Aunit, rounded, formula: "pfa", unknown: "A", values, units,
    steps: [
      "Rearrange `P = F / A` to `A = F / P`. With F in N and P in Pa, this gives m².",
      ...pconv,
      ...(Aunit !== "m²" ? [`\`A = ${num(F)} / ${num(PgSI)} = ${num(Am2)}\` m². Convert to ${Aunit} (${Aunit === "cm²" ? "multiply by 10 000" : "multiply by 1 000 000"}):`, `\`A = ${num(Am2)} ${Aunit === "cm²" ? "× 10000" : "× 1000000"}\``] : [`\`A = ${num(F)} / ${num(PgSI)}\``]),
    ],
    hints: [
      "Rearrange `P = F / A` for the area: `A = F / P`, with P in Pa.",
      `Substitute (in the calculator: \`_F / ${C("P")}\`)${Aunit !== "m²" ? `, then convert m² to ${Aunit} (1 m² = ${Aunit === "cm²" ? "10 000 cm²" : "1 000 000 mm²"})` : ""}.${thenRound}`,
    ],
    candidates: [F * PgSI, F / Pgiven, Am2, Am2 * 100, exact / 10, exact * 10],
  }, rng);
}

// Hard: a block resting on one face; mass in kg, face measured in cm.
function pressureFace(rng) {
  const thing = rng.pick(["concrete block", "brick", "wooden crate", "metal ingot", "stone slab", "box of books"]);
  const m = rng.int(50, 30000) / 100;
  const l = rng.int(50, 1200) / 10;
  const w = rng.int(50, 800) / 10;
  const askK = rng.next() < 0.5;
  const P = (m * G) / ((l / 100) * (w / 100));
  const exact = askK ? P / 1000 : P;
  const units = { l: "cm", w: "cm", ...(askK ? { P: "kPa" } : {}) };
  const values = { m, g: G, l, w };
  return single({
    prompt: `${An(thing)} of mass ${num(m)} kg rests on a face measuring ${num(l)} cm by ${num(w)} cm. Take g = 9.8 N/kg. What pressure does it exert on the floor, in ${askK ? "kPa" : "Pa"}?${DP}`,
    exact, unit: askK ? "kPa" : "Pa", rounded: true, formula: "face", unknown: "P", values, units,
    steps: [
      "The force on the floor is the weight, `W = m × g`. The area is length × width in metres.",
      `Weight: \`${num(m)} × 9.8 = ${num(m * G)}\` N. Area: \`${num(l / 100)} × ${num(w / 100)} = ${num((l / 100) * (w / 100))}\` m².`,
      ...(askK ? [`\`P = ${num(m * G)} / ${num((l / 100) * (w / 100))} = ${num(P)}\` Pa. Divide by 1000:`, `\`P = ${num(P)} / 1000\``] : [`\`P = ${num(m * G)} / ${num((l / 100) * (w / 100))}\``]),
    ],
    hints: [
      "The force is the block's weight (`W = m × g`), and the area is the face it rests on.",
      "Convert the side lengths to metres (÷ 100) before multiplying, so the area is in m².",
      `In the calculator: \`_m * _g / ((_l_cm / 100) * (_w_cm / 100))\`${askK ? ", then divide by 1000 for kPa" : ""}.${THEN}`,
    ],
    candidates: [m / ((l / 100) * (w / 100)) / (askK ? 1000 : 1), (m * G) / (l * w) * (askK ? 1 : 1000), exact * 100, exact / 100],
  }, rng);
}

// Hard multi: a cuboid can stand on different faces.
function pressureMulti(rng) {
  const thing = rng.pick(["brick", "concrete block", "metal ingot", "wooden beam", "stone block", "crate"]);
  const dims = draw(() => [rng.int(40, 400) / 10, rng.int(40, 400) / 10, rng.int(40, 400) / 10], (a) => new Set(a).size === 3);
  const [a, b, c] = dims.slice().sort((x, y) => x - y);
  const m = rng.int(100, 15000) / 100;
  const W = m * G;
  const Pmax = W / ((a / 100) * (b / 100)) / 1000;
  const Pmin = W / ((b / 100) * (c / 100)) / 1000;
  const values = { m, g: G, a, b, c };
  const units = { a: "cm", b: "cm", c: "cm" };
  const explanation = [
    "The force is the same on every face (the weight). Pressure is biggest on the smallest face and smallest on the biggest face.",
    `1. Weight: \`W = ${num(m)} × 9.8\` ${result(W, true, "N")}`,
    `2. Smallest face: ${num(a)} cm × ${num(b)} cm = ${num((a / 100) * (b / 100))} m², so \`P = ${num(W)} / ${num((a / 100) * (b / 100))} / 1000\` ${result(Pmax, true, "kPa")}`,
    `3. Largest face: ${num(b)} cm × ${num(c)} cm = ${num((b / 100) * (c / 100))} m², so \`P = ${num(W)} / ${num((b / 100) * (c / 100))} / 1000\` ${result(Pmin, true, "kPa")}`,
  ].join("\n\n");
  return multi(
    `${An(thing)} of mass ${num(m)} kg measures ${num(dims[0])} cm × ${num(dims[1])} cm × ${num(dims[2])} cm. It can rest on any face. Take g = 9.8 N/kg.`,
    [
      numPart("weight", "Weight", `What is its weight, in N?${DP}`, W,
        "Weight = mass × g (in the calculator: `_m * _g`).", { formula: "weight", unknown: "W", values: { m, g: G }, units: {} }),
      numPart("max", "Greatest pressure", `What is the greatest pressure it can exert on the floor, in kPa?${DP}`, Pmax,
        "The greatest pressure is on the face with the smallest area: use the two shortest sides, in metres (in the calculator: `_m * _g / ((_a_cm / 100) * (_b_cm / 100)) / 1000`).",
        { formula: "face", unknown: "P", values: { m, g: G, l: a, w: b }, units: { l: "cm", w: "cm", P: "kPa" } }),
      numPart("min", "Least pressure", `What is the least pressure it can exert on the floor, in kPa?${DP}`, Pmin,
        "The least pressure is on the face with the largest area: use the two longest sides, in metres.",
        { formula: "face", unknown: "P", values: { m, g: G, l: b, w: c }, units: { l: "cm", w: "cm", P: "kPa" } }),
    ],
    explanation, values, units,
  );
}

// ---------------------------------------------------------------------------------------------
// Liquid pressure: P = ρ × g × h (pressure due to the liquid only)

const LIQ = [
  { name: "water", rho: 1000, places: ["a swimming pool", "a water tank", "a lake", "a reservoir", "a diving pool", "a fish tank"] },
  { name: "sea water", rho: 1030, places: ["the sea", "the ocean", "a harbour"] },
  { name: "cooking oil", rho: 920, places: ["a storage drum", "a tall tank"] },
  { name: "petrol", rho: 740, places: ["a fuel tank", "a storage tank"] },
  { name: "glycerol", rho: 1260, places: ["a lab cylinder", "a storage tank"] },
  { name: "mercury", rho: 13600, places: ["a barometer tube", "a lab column"], small: true },
];

function genLiquid(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return liquidMulti(rng);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";
  const kinds = d === "easy" ? ["P", "P", "h"] : d === "medium" ? ["P", "P", "h", "rho"] : ["P", "h", "rho", "dP"];
  const kind = rng.pick(kinds);
  const pool = d === "easy" ? LIQ.slice(0, 2) : LIQ;
  const liq = kind === "rho" ? null : rng.pick(pool);
  let rho = liq ? liq.rho : d === "hard" ? rng.int(600, 1600) : 10 * rng.int(65, 160);
  let h, hUnit = "m", Punit = "Pa";
  if (d === "easy") h = rng.int(1, 30);
  else if (d === "medium") {
    if (liq && liq.small) { hUnit = "cm"; h = rng.int(1, 80); }
    else if (rng.next() < 0.4) { hUnit = "cm"; h = 5 * rng.int(2, 60); }
    else h = rng.int(1, 60);
    Punit = rng.next() < 0.5 ? "kPa" : "Pa";
  } else {
    if (liq && liq.small) { hUnit = "cm"; h = rng.int(10, 900) / 10; }
    else if (rng.next() < 0.3) { hUnit = "cm"; h = rng.int(50, 3000) / 10; }
    else h = rng.int(10, 6000) / 100;
    Punit = rng.next() < 0.7 ? "kPa" : "Pa";
  }
  const hSI = toSIu(h, hUnit === "cm" ? "cm" : null);
  const Psi = rho * G * hSI;
  const units = {};
  if (hUnit === "cm") units.h = "cm";
  if (Punit === "kPa") units.P = "kPa";
  const { C } = labeler(units);
  const hconv = hUnit === "cm" ? [`Convert the depth: ${convLine(h, "cm")}.`] : [];
  const where = liq ? rng.pick(liq.places) : "a tank";
  const gLine = "Take g = 9.8 N/kg.";
  const rhoLine = liq ? `The density of ${liq.name} is ${liq.rho} kg/m³.` : "";

  if (kind === "P") {
    const exact = Punit === "kPa" ? Psi / 1000 : Psi;
    const values = { rho, g: G, h };
    return single({
      prompt: `What is the pressure due to the ${liq.name} at a depth of ${num(h)} ${hUnit} in ${where}, in ${Punit}? ${rhoLine} ${gLine}${end}`,
      exact, unit: Punit, rounded, formula: "rgh", unknown: "P", values, units,
      steps: [
        "Liquid pressure: `P = ρ × g × h`, with ρ in kg/m³ and h in m.",
        ...hconv,
        ...(Punit === "kPa" ? [`\`P = ${rho} × 9.8 × ${num(hSI)} = ${num(Psi)}\` Pa. Divide by 1000:`, `\`P = ${num(Psi)} / 1000\``] : [`\`P = ${rho} × 9.8 × ${num(hSI)}\``]),
      ],
      hints: [
        `Pressure in a liquid depends on density, g and depth: \`P = ρ × g × h\`.${hUnit === "cm" ? " The depth must be in metres." : ""}`,
        `Substitute (in the calculator: \`_rho * _g * ${C("h")}\`${Punit === "kPa" ? ", then divide by 1000 for kPa" : ""}).${thenRound}`,
      ],
      candidates: [rho * G * h / (Punit === "kPa" ? 1000 : 1), rho * hSI / (Punit === "kPa" ? 1000 : 1), Psi + 100000 / (Punit === "kPa" ? 1000 : 1), rho * 10 * hSI / (Punit === "kPa" ? 1000 : 1)],
    }, rng);
  }

  if (kind === "dP") {
    // Pressure difference between two depths (hard).
    const h2 = fix(h + (hUnit === "cm" ? rng.int(10, 1500) / 10 : rng.int(10, 2000) / 100));
    const values = { rho, g: G, h1: h, h2 };
    const u = { ...(hUnit === "cm" ? { h1: "cm", h2: "cm" } : {}), dP: "kPa" };
    const h1si = toSIu(h, hUnit === "cm" ? "cm" : null), h2si = toSIu(h2, hUnit === "cm" ? "cm" : null);
    const dP = (rho * G * (h2si - h1si)) / 1000;
    const Cu = labeler(u).C;
    return single({
      prompt: `A pressure sensor is lowered in ${where} from a depth of ${num(h)} ${hUnit} to ${num(h2)} ${hUnit}. By how much does the pressure due to the ${liq.name} increase, in kPa? ${rhoLine} ${gLine}${DP}`,
      exact: dP, unit: "kPa", rounded: true, formula: "dp", unknown: "dP", values, units: u,
      steps: [
        "The pressure difference only depends on the difference in depth: `ΔP = ρ × g × Δh`.",
        `Δh = ${num(h2si)} - ${num(h1si)} = ${num(h2si - h1si)} m.`,
        `\`ΔP = ${rho} × 9.8 × ${num(h2si - h1si)} / 1000\``,
      ],
      hints: [
        "You don't need either pressure on its own: `ΔP = ρ × g × Δh`, where Δh is the change in depth in metres.",
        `In the calculator: \`_rho * _g * (${Cu("h2")} - ${Cu("h1")}) / 1000\`.${THEN}`,
      ],
      candidates: [(rho * G * h2si) / 1000, (rho * G * (h2si + h1si)) / 1000, rho * G * (h2si - h1si), (rho * 10 * (h2si - h1si)) / 1000],
    }, rng);
  }

  // Inverse: P stated
  let Pg = Punit === "kPa" ? Psi / 1000 : Psi;
  if (rounded) Pg = fix(Math.round(Pg * 10) / 10);
  else if (!isInt(Pg)) throw new Retry();
  Pg = fix(Pg);
  const PgSI = Punit === "kPa" ? Pg * 1000 : Pg;
  const pconv = Punit === "kPa" ? [`Convert the pressure: ${convLine(Pg, "kPa")}.`] : [];
  if (kind === "h") {
    const hm = PgSI / (rho * G);
    const exact = hUnit === "cm" ? hm * 100 : hm;
    const values = { P: Pg, rho, g: G };
    const u = { ...units };
    return single({
      prompt: `The pressure due to the ${liq.name} at the bottom of ${where} is ${num(Pg)} ${Punit}. How deep is it, in ${hUnit}? ${rhoLine} ${gLine}${end}`,
      exact, unit: hUnit, rounded, formula: "rgh", unknown: "h", values, units: u,
      steps: [
        "Rearrange `P = ρ × g × h` to `h = P / (ρ × g)`, with P in Pa. This gives metres.",
        ...pconv,
        ...(hUnit === "cm" ? [`\`h = ${num(PgSI)} / (${rho} × 9.8) = ${num(hm)}\` m. Multiply by 100 for cm:`, `\`h = ${num(hm)} × 100\``] : [`\`h = ${num(PgSI)} / (${rho} × 9.8)\``]),
      ],
      hints: [
        "Rearrange `P = ρ × g × h` for the depth: `h = P / (ρ × g)`. Use the pressure in Pa.",
        `Substitute (in the calculator: \`${labeler(u).C("P")} / (_rho * _g)\`)${hUnit === "cm" ? ", then multiply by 100 for cm" : ""}.${thenRound}`,
      ],
      candidates: [Pg / (rho * G) * (hUnit === "cm" ? 100 : 1), PgSI / rho, PgSI / (rho * 10) * (hUnit === "cm" ? 100 : 1), hm * (hUnit === "cm" ? 1 : 100)],
    }, rng);
  }
  // rho: density of an unknown liquid
  const exact = PgSI / (G * hSI);
  const values = { P: Pg, g: G, h };
  return single({
    prompt: `At a depth of ${num(h)} ${hUnit} in a tank of an unknown liquid, the pressure due to the liquid is ${num(Pg)} ${Punit}. What is the density of the liquid, in kg/m³? ${gLine}${end}`,
    exact, unit: "kg/m³", rounded, formula: "rgh", unknown: "rho", values, units,
    steps: [
      "Rearrange `P = ρ × g × h` to `ρ = P / (g × h)`, with P in Pa and h in m.",
      ...pconv, ...hconv,
      `\`ρ = ${num(PgSI)} / (9.8 × ${num(hSI)})\``,
    ],
    hints: [
      "Rearrange `P = ρ × g × h` for the density: `ρ = P / (g × h)`. Use Pa and m.",
      `Substitute (in the calculator: \`${C("P")} / (_g * ${C("h")})\`).${thenRound}`,
    ],
    candidates: [Pg / (G * hSI), PgSI / (G * h), PgSI / (10 * hSI), exact * 9.8],
  }, rng);
}

function liquidMulti(rng) {
  const liq = rng.pick(LIQ.slice(0, 5));
  const thing = rng.pick(["submarine hatch", "sealed box", "diving bell", "sensor capsule", "metal cube"]);
  const top = rng.int(50, 4000) / 100;
  const hgt = rng.int(20, 300) / 100;
  const bottom = fix(top + hgt);
  const Pt = (liq.rho * G * top) / 1000;
  const Pb = (liq.rho * G * bottom) / 1000;
  const values = { rho: liq.rho, g: G, h1: top, h2: bottom };
  const explanation = [
    "Use `P = ρ × g × h` at each depth. The difference only needs the height of the object.",
    `1. Top: \`${liq.rho} × 9.8 × ${num(top)} / 1000\` ${result(Pt, true, "kPa")}`,
    `2. Bottom: \`${liq.rho} × 9.8 × ${num(bottom)} / 1000\` ${result(Pb, true, "kPa")}`,
    `3. Difference: \`${liq.rho} × 9.8 × ${num(hgt)} / 1000\` ${result(Pb - Pt, true, "kPa")}`,
  ].join("\n\n");
  return multi(
    `A ${thing} is held under ${liq.name} (density ${liq.rho} kg/m³). Its top is ${num(top)} m below the surface and its bottom is ${num(bottom)} m below the surface. Take g = 9.8 N/kg. Give pressures due to the liquid only.`,
    [
      numPart("top", "Top", `What is the pressure on its top, in kPa?${DP}`, Pt,
        "Use `P = ρ × g × h` with the depth of the top (in the calculator: `_rho * _g * _h1 / 1000`).", { formula: "rgh", unknown: "P", values: { rho: liq.rho, g: G, h: top }, units: { P: "kPa" } }),
      numPart("bottom", "Bottom", `What is the pressure on its bottom, in kPa?${DP}`, Pb,
        "Same formula with the depth of the bottom (in the calculator: `_rho * _g * _h2 / 1000`).", { formula: "rgh", unknown: "P", values: { rho: liq.rho, g: G, h: bottom }, units: { P: "kPa" } }),
      numPart("diff", "Difference", `How much bigger is the pressure on the bottom than on the top, in kPa?${DP}`, Pb - Pt,
        "Subtract, or use `ΔP = ρ × g × Δh` with the object's height. Use unrounded values.", { formula: "dp", unknown: "dP", values, units: { dP: "kPa" } }),
    ],
    explanation, values, {},
  );
}

// ---------------------------------------------------------------------------------------------
// Gas laws (fixed mass of gas): p1V1/T1 = p2V2/T2, temperatures in kelvin (K = °C + 273).

const GASES = ["air", "helium", "nitrogen", "oxygen", "carbon dioxide", "argon"];
const BOYLE_CTX = [
  ["A syringe", "the plunger is pushed in slowly"], ["A bicycle pump", "the handle is pushed in slowly"],
  ["A sealed cylinder with a piston", "the piston is moved slowly"], ["A weather balloon", "it rises and the outside pressure changes slowly"],
  ["A diver's air bubble", "it rises slowly towards the surface"], ["A gas jar with a movable lid", "the lid is moved slowly"],
];
const CHARLES_CTX = ["A balloon", "A gas in a cylinder with a free-moving piston", "A sealed bag of air", "A gas syringe with a free plunger", "A soap bubble"];
const PLAW_CTX = ["A sealed gas canister", "A car tyre", "An aerosol can", "A pressure cooker (sealed)", "A rigid steel cylinder", "A football"];

function genGas(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return gasMulti(rng);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";
  const law = rng.pick(d === "easy" ? ["boyle", "boyle", "charles", "plaw"] : d === "medium" ? ["boyle", "charles", "plaw", "charles", "plaw"] : ["boyle", "charles", "plaw", "combined", "combined"]);
  const gas = rng.pick(GASES);
  const useC = d !== "easy"; // medium/hard state temperatures in °C
  const tUnits = useC ? { T1: "°C", T2: "°C" } : {};
  const Tw = (T) => (useC ? `${num(T)} °C` : `${num(T)} K`);
  const Tsi = (T) => (useC ? T + 273 : T);
  const kLine = useC ? " Use K = °C + 273." : "";

  if (law === "boyle") {
    const [ctx, how] = rng.pick(BOYLE_CTX);
    const vu = rng.next() < 0.7 ? "cm³" : "litres";
    let p1, V1, p2, V2;
    if (rounded) {
      p1 = rng.int(500, 3000) / 10;
      V1 = vu === "cm³" ? rng.int(200, 50000) / 10 : rng.int(5, 500) / 10;
      p2 = draw(() => rng.int(300, 5000) / 10, (x) => Math.abs(x - p1) > 5);
      V2 = (p1 * V1) / p2;
    } else {
      [p1, V1, p2] = draw(() => [10 * rng.int(5, 40), vu === "cm³" ? 10 * rng.int(2, 100) : rng.int(2, 40), 10 * rng.int(5, 60)], ([a, b, c]) => a !== c && isInt((a * b) / c));
      V2 = (p1 * V1) / p2;
    }
    const unknown = rng.pick(["V2", "V2", "p2"]);
    if (unknown === "V2") {
      const values = { p1, V1, p2 };
      return single({
        prompt: `${ctx} holds ${num(V1)} ${vu} of ${gas} at a pressure of ${num(p1)} kPa. The temperature stays constant while ${how}, until the pressure is ${num(p2)} kPa. What is the new volume, in ${vu}?${end}`,
        exact: V2, unit: vu, rounded, formula: "gas", unknown: "V2", values, units: {},
        steps: ["At constant temperature, Boyle's law: `p1 × V1 = p2 × V2`, so `V2 = p1 × V1 / p2`. The units of p and V just carry through.", `\`V2 = ${num(p1)} × ${num(V1)} / ${num(p2)}\``],
        hints: [
          "The temperature is constant, so use Boyle's law: `p1 × V1 = p2 × V2`. Higher pressure means smaller volume.",
          `Rearrange for V2 and substitute (in the calculator: \`_p1 * _V1 / _p2\`).${thenRound}`,
        ],
        candidates: [(p2 * V1) / p1, V1 * p1 * p2 / 1e4, V1 + (p1 - p2), (V1 * p1) / (p2 * 10)],
      }, rng);
    }
    const values = { p1, V1, V2: rounded ? fix(Math.round(V2 * 10) / 10) : V2 };
    const exact = (p1 * V1) / values.V2;
    return single({
      prompt: `${ctx} holds ${num(V1)} ${vu} of ${gas} at a pressure of ${num(p1)} kPa. The temperature stays constant while ${how}, until the volume is ${num(values.V2)} ${vu}. What is the new pressure, in kPa?${end}`,
      exact, unit: "kPa", rounded, formula: "gas", unknown: "p2", values, units: {},
      steps: ["At constant temperature, Boyle's law: `p1 × V1 = p2 × V2`, so `p2 = p1 × V1 / V2`.", `\`p2 = ${num(p1)} × ${num(V1)} / ${num(values.V2)}\``],
      hints: [
        "The temperature is constant, so pressure × volume stays the same: `p1 × V1 = p2 × V2`.",
        `Rearrange for p2 and substitute (in the calculator: \`_p1 * _V1 / _V2\`).${thenRound}`,
      ],
      candidates: [(p1 * values.V2) / V1, p1 + (V1 - values.V2), (p1 * V1) / values.V2 / 10, (V1 * values.V2) / p1],
    }, rng);
  }

  if (law === "charles" || law === "plaw") {
    const isV = law === "charles";
    const q = isV ? "V" : "p";
    const ctx = rng.pick(isV ? CHARLES_CTX : PLAW_CTX);
    const vu = rng.next() < 0.7 ? "cm³" : "litres";
    const qUnit = isV ? vu : "kPa";
    const qName = isV ? "volume" : "pressure";
    const fixed = isV ? "pressure" : "volume";
    let T1, T2, a1;
    if (rounded) {
      T1 = rng.int(-300, 2000) / 10;
      T2 = draw(() => rng.int(-300, 3000) / 10, (x) => Math.abs(x - T1) > 5);
      a1 = isV ? (vu === "cm³" ? rng.int(500, 20000) / 10 : rng.int(5, 300) / 10) : rng.int(800, 6000) / 10;
    } else {
      [T1, T2, a1] = draw(
        () => (useC ? [rng.int(-20, 120), rng.int(-20, 250), isV ? (vu === "cm³" ? 10 * rng.int(5, 100) : rng.int(2, 30)) : 10 * rng.int(8, 50)]
          : [10 * rng.int(20, 50), 10 * rng.int(20, 80), isV ? (vu === "cm³" ? 10 * rng.int(5, 100) : rng.int(2, 30)) : 10 * rng.int(8, 50)]),
        ([t1, t2, x]) => t1 !== t2 && isInt((x * Tsi(t2)) / Tsi(t1)));
    }
    const a2 = (a1 * Tsi(T2)) / Tsi(T1);
    const unknown = rng.pick(useC ? [q + "2", q + "2", "T2"] : [q + "2", q + "2", "T2"]);
    const verb = T2 > T1 ? "warmed" : "cooled";
    if (unknown !== "T2") {
      const values = { [q + "1"]: a1, T1, T2 };
      return single({
        prompt: `${ctx} contains ${gas} with a ${qName} of ${num(a1)} ${qUnit} at ${Tw(T1)}. It is ${verb} to ${Tw(T2)} at constant ${fixed}. What is the new ${qName}, in ${qUnit}?${kLine}${end}`,
        exact: a2, unit: qUnit, rounded, formula: "gas", unknown: q + "2", values, units: tUnits,
        steps: [
          `At constant ${fixed}, ${isV ? "Charles's law" : "the pressure law"}: \`${q}1 / T1 = ${q}2 / T2\`, with T in kelvin.`,
          ...(useC ? [`Convert: T1 = ${num(T1)} + 273 = ${num(Tsi(T1))} K, T2 = ${num(T2)} + 273 = ${num(Tsi(T2))} K.`] : []),
          `\`${q}2 = ${num(a1)} × ${num(Tsi(T2))} / ${num(Tsi(T1))}\``,
        ],
        hints: [
          `The ${fixed} is constant, so ${qName} is proportional to the kelvin temperature: \`${q}1 / T1 = ${q}2 / T2\`.${useC ? " Convert both temperatures to kelvin first." : ""}`,
          `Rearrange: \`${q}2 = ${q}1 × T2 / T1\` (in the calculator: \`_${q}1 * ${useC ? "(_T2_C + 273) / (_T1_C + 273)" : "_T2 / _T1"}\`).${thenRound}`,
        ],
        candidates: [(a1 * T2) / T1, (a1 * Tsi(T1)) / Tsi(T2), a1 + (T2 - T1), (a1 * (T2 + 273)) / T1],
      }, rng);
    }
    // New temperature, in the same scale as the question.
    const a2g = rounded ? fix(Math.round(a2 * 10) / 10) : a2;
    const TK = (Tsi(T1) * a2g) / a1;
    const exact = useC ? TK - 273 : TK;
    const values = { [q + "1"]: a1, T1, [q + "2"]: a2g };
    const tu = useC ? { T1: "°C", T2: "°C" } : {};
    return single({
      prompt: `${ctx} contains ${gas} with a ${qName} of ${num(a1)} ${qUnit} at ${Tw(T1)}. At constant ${fixed}, its ${qName} changes to ${num(a2g)} ${qUnit}. What is its new temperature, in ${useC ? "°C" : "K"}?${kLine}${end}`,
      exact, unit: useC ? "°C" : "K", rounded, formula: "gas", unknown: "T2", values, units: tu,
      steps: [
        `Use \`${q}1 / T1 = ${q}2 / T2\` with T in kelvin, so \`T2 = T1 × ${q}2 / ${q}1\`.`,
        ...(useC ? [`T1 = ${num(T1)} + 273 = ${num(Tsi(T1))} K.`, `T2 = ${num(Tsi(T1))} × ${num(a2g)} / ${num(a1)} = ${num(TK)} K. Convert back to °C:`, `\`T2 = ${num(TK)} - 273\``] : [`\`T2 = ${num(T1)} × ${num(a2g)} / ${num(a1)}\``]),
      ],
      hints: [
        `${cap(qName)} is proportional to kelvin temperature, so \`T2 = T1 × ${q}2 / ${q}1\`.${useC ? " Work in kelvin, then convert the answer back to °C." : ""}`,
        `In the calculator: \`${useC ? "(_T1_C + 273)" : "_T1"} * _${q}2 / _${q}1${useC ? " - 273" : ""}\`.${thenRound}`,
      ],
      candidates: [(T1 * a2g) / a1, useC ? TK : TK - 273, (Tsi(T1) * a1) / a2g - (useC ? 273 : 0), exact + 273],
    }, rng);
  }

  // combined (hard)
  const ctx = rng.pick(["A weather balloon", "A sealed syringe", "A gas cylinder with a piston", "A bubble of gas", "A sample of gas"]);
  const vu = rng.next() < 0.6 ? "cm³" : "litres";
  const p1 = rng.int(500, 2500) / 10;
  const V1 = vu === "cm³" ? rng.int(500, 20000) / 10 : rng.int(10, 400) / 10;
  const T1 = rng.int(-200, 800) / 10;
  const p2 = draw(() => rng.int(300, 4000) / 10, (x) => Math.abs(x - p1) > 5);
  const T2 = draw(() => rng.int(-400, 1500) / 10, (x) => Math.abs(x - T1) > 3);
  const V2 = (p1 * V1 * (T2 + 273)) / ((T1 + 273) * p2);
  const unknown = rng.pick(["V2", "V2", "p2", "T2"]);
  if (unknown === "V2") {
    const values = { p1, V1, T1, p2, T2 };
    return single({
      prompt: `${ctx} holds ${num(V1)} ${vu} of ${gas} at ${num(p1)} kPa and ${num(T1)} °C. The pressure changes to ${num(p2)} kPa and the temperature to ${num(T2)} °C. What is the new volume, in ${vu}? Use K = °C + 273.${DP}`,
      exact: V2, unit: vu, rounded: true, formula: "gas", unknown: "V2", values, units: tUnits,
      steps: [
        "Combined gas law: `p1 × V1 / T1 = p2 × V2 / T2`, with T in kelvin.",
        `T1 = ${num(T1 + 273)} K, T2 = ${num(T2 + 273)} K.`,
        `\`V2 = ${num(p1)} × ${num(V1)} × ${num(T2 + 273)} / (${num(T1 + 273)} × ${num(p2)})\``,
      ],
      hints: [
        "Both pressure and temperature change, so use `p1 × V1 / T1 = p2 × V2 / T2`, with temperatures in kelvin.",
        `Rearrange: \`V2 = p1 × V1 × T2 / (T1 × p2)\` (in the calculator: \`_p1 * _V1 * (_T2_C + 273) / ((_T1_C + 273) * _p2)\`).${THEN}`,
      ],
      candidates: [(p1 * V1 * T2) / (T1 * p2), (p2 * V1 * (T2 + 273)) / ((T1 + 273) * p1), (p1 * V1) / p2, (p1 * V1 * (T1 + 273)) / ((T2 + 273) * p2)],
    }, rng);
  }
  const V2g = fix(Math.round(V2 * 10) / 10);
  if (unknown === "p2") {
    const exact = (p1 * V1 * (T2 + 273)) / ((T1 + 273) * V2g);
    const values = { p1, V1, T1, V2: V2g, T2 };
    return single({
      prompt: `${ctx} holds ${num(V1)} ${vu} of ${gas} at ${num(p1)} kPa and ${num(T1)} °C. Its volume changes to ${num(V2g)} ${vu} and its temperature to ${num(T2)} °C. What is the new pressure, in kPa? Use K = °C + 273.${DP}`,
      exact, unit: "kPa", rounded: true, formula: "gas", unknown: "p2", values, units: tUnits,
      steps: [
        "Combined gas law: `p1 × V1 / T1 = p2 × V2 / T2`, with T in kelvin.",
        `T1 = ${num(T1 + 273)} K, T2 = ${num(T2 + 273)} K.`,
        `\`p2 = ${num(p1)} × ${num(V1)} × ${num(T2 + 273)} / (${num(T1 + 273)} × ${num(V2g)})\``,
      ],
      hints: [
        "Use `p1 × V1 / T1 = p2 × V2 / T2` with both temperatures in kelvin.",
        `Rearrange: \`p2 = p1 × V1 × T2 / (T1 × V2)\` (in the calculator: \`_p1 * _V1 * (_T2_C + 273) / ((_T1_C + 273) * _V2)\`).${THEN}`,
      ],
      candidates: [(p1 * V1 * T2) / (T1 * V2g), (p1 * V1) / V2g, (p1 * V2g * (T2 + 273)) / ((T1 + 273) * V1), exact * 1.1],
    }, rng);
  }
  const p2g = p2;
  const TK = ((T1 + 273) * p2g * V2g) / (p1 * V1);
  const exact = TK - 273;
  const values = { p1, V1, T1, p2: p2g, V2: V2g };
  return single({
    prompt: `${ctx} holds ${num(V1)} ${vu} of ${gas} at ${num(p1)} kPa and ${num(T1)} °C. Later its pressure is ${num(p2g)} kPa and its volume is ${num(V2g)} ${vu}. What is its new temperature, in °C? Use K = °C + 273.${DP}`,
    exact, unit: "°C", rounded: true, formula: "gas", unknown: "T2", values, units: tUnits,
    steps: [
      "Combined gas law: `p1 × V1 / T1 = p2 × V2 / T2`, with T in kelvin, so `T2 = T1 × p2 × V2 / (p1 × V1)`.",
      `T1 = ${num(T1 + 273)} K, so T2 = ${num(T1 + 273)} × ${num(p2g)} × ${num(V2g)} / (${num(p1)} × ${num(V1)}) = ${num(TK)} K. Convert to °C:`,
      `\`T2 = ${num(TK)} - 273\``,
    ],
    hints: [
      "Use `p1 × V1 / T1 = p2 × V2 / T2` with T1 in kelvin. Solve for T2 in kelvin, then convert back to °C.",
      `In the calculator: \`(_T1_C + 273) * _p2 * _V2 / (_p1 * _V1) - 273\`.${THEN}`,
    ],
    candidates: [TK, (T1 * p2g * V2g) / (p1 * V1), ((T1 + 273) * p1 * V1) / (p2g * V2g) - 273, exact + 10],
  }, rng);
}

// Hard multi: compress at constant temperature, then heat at constant volume.
function gasMulti(rng) {
  const gas = rng.pick(GASES);
  const p1 = rng.int(800, 1500) / 10;
  const V1 = rng.int(1000, 6000) / 10;
  const V2 = draw(() => rng.int(300, 5000) / 10, (x) => x < V1 - 20);
  const T1 = rng.int(50, 300) / 10;
  const T2 = draw(() => rng.int(400, 1500) / 10, (x) => x > T1 + 10);
  const pm = (p1 * V1) / V2;
  const pf = (pm * (T2 + 273)) / (T1 + 273);
  const values = { p1, V1, V2, T1, T2 };
  const units = { T1: "°C", T2: "°C" };
  const explanation = [
    "Treat each stage with the law for what stays constant.",
    `1. Constant temperature (Boyle's law): \`p = ${num(p1)} × ${num(V1)} / ${num(V2)}\` ${result(pm, true, "kPa")}`,
    `2. Constant volume (pressure law, kelvin): \`p = ${num(pm)} × ${num(T2 + 273)} / ${num(T1 + 273)}\` ${result(pf, true, "kPa")}`,
  ].join("\n\n");
  return multi(
    `A cylinder with a piston holds ${num(V1)} cm³ of ${gas} at ${num(p1)} kPa and ${num(T1)} °C. First the gas is compressed slowly to ${num(V2)} cm³ at constant temperature. Then the piston is locked and the gas is heated to ${num(T2)} °C. Use K = °C + 273.`,
    [
      numPart("compress", "After compression", `What is the pressure after the compression, in kPa?${DP}`, pm,
        "Temperature is constant during this stage, so `p1 × V1 = p2 × V2` (in the calculator: `_p1 * _V1 / _V2`).",
        { formula: "gas", unknown: "p2", values: { p1, V1, V2 }, units: {} }),
      numPart("final", "After heating", `What is the final pressure after heating, in kPa?${DP}`, pf,
        "Volume is constant now, so pressure is proportional to kelvin temperature. Start from the unrounded pressure after compression (in the calculator: `_p1 * _V1 / _V2 * (_T2_C + 273) / (_T1_C + 273)`).",
        { formula: "gas", unknown: "p2", values, units }),
    ],
    explanation, values, units,
  );
}

// ---------------------------------------------------------------------------------------------
// Pressure in context: hydraulics (F1/A1 = F2/A2) and atmospheric + liquid pressure at depth.

const HYD = ["car jack", "hydraulic press", "car lift in a garage", "dentist's chair", "digger arm", "brake system"];

function genContext(d, rng) {
  const rounded = d === "hard";
  if (rounded && rng.next() < 0.3) return contextMulti(rng);
  const kind = rng.pick(d === "easy" ? ["hyd", "hyd", "atm"] : d === "medium" ? ["hyd", "hydP", "atm", "atmh"] : ["hydd", "hyd", "atm", "atmh", "window"]);
  const end = rounded ? DP : "";
  const thenRound = rounded ? THEN : "";

  if (kind === "hyd") {
    const dev = rng.pick(HYD);
    let A1, A2, F1, A2u = "cm²";
    if (d === "easy") {
      A1 = rng.int(2, 20);
      A2 = A1 * rng.int(3, 40);
      F1 = 10 * rng.int(2, 50);
    } else if (d === "medium") {
      A1 = rng.int(2, 50);
      A2u = rng.next() < 0.5 ? "m²" : "cm²";
      [A2, F1] = draw(() => [A2u === "m²" ? rng.int(1, 40) / 100 : rng.int(50, 2000), rng.int(20, 500)], ([a2, f1]) => isInt((f1 * toSIu(a2, A2u === "m²" ? null : "cm²")) / toSIu(A1, "cm²")));
    } else {
      A1 = rng.int(10, 500) / 10;
      A2 = rng.int(1000, 50000) / 10;
      F1 = rng.int(100, 8000) / 10;
    }
    const A1si = toSIu(A1, "cm²");
    const A2si = A2u === "m²" ? A2 : toSIu(A2, "cm²");
    const F2 = (F1 * A2si) / A1si;
    const units = { A1: "cm²", ...(A2u === "cm²" ? { A2: "cm²" } : {}) };
    const { C } = labeler(units);
    const unknown = rng.pick(["F2", "F2", "F1"]);
    const mixed = A2u !== "cm²";
    const conv = mixed ? [`The areas must be in the same unit: ${convLine(A1, "cm²")}.`] : [];
    if (unknown === "F2") {
      const values = { F1, A1, A2 };
      return single({
        prompt: `In a ${dev}, a force of ${num(F1)} N pushes on a small piston of area ${num(A1)} cm². The large piston has an area of ${num(A2)} ${A2u}. What force does the large piston exert, in N? (The pressure is the same throughout the liquid.)${end}`,
        exact: F2, unit: "N", rounded, formula: "hyd", unknown: "F2", values, units,
        steps: [
          "The pressure is the same on both pistons: `F1 / A1 = F2 / A2`, so `F2 = F1 × A2 / A1` (both areas in the same unit).",
          ...conv,
          `\`F2 = ${num(F1)} × ${num(mixed ? A2si : A2)} / ${num(mixed ? A1si : A1)}\``,
        ],
        hints: [
          "Liquids pass pressure on equally, so `F1 / A1 = F2 / A2`.",
          `Rearrange for F2 and make sure both areas are in the same unit (in the calculator: \`_F1 * ${mixed ? "_A2" : C("A2")} / ${mixed ? C("A1") : C("A1")}\`).${thenRound}`,
        ],
        candidates: [(F1 * A1si) / A2si, F1 * A2, (F1 * A2) / A1, F1 + A2si / A1si, F2 / 100],
      }, rng);
    }
    const F2g = rounded ? fix(Math.round(F2 * 10) / 10) : F2;
    if (!rounded && !isInt(F2g)) throw new Retry();
    const exact = (F2g * A1si) / A2si;
    const values = { F2: F2g, A1, A2 };
    return single({
      prompt: `A ${dev} must lift a load of ${num(F2g)} N with its large piston, of area ${num(A2)} ${A2u}. The small piston has an area of ${num(A1)} cm². What force is needed on the small piston, in N?${end}`,
      exact, unit: "N", rounded, formula: "hyd", unknown: "F1", values, units,
      steps: [
        "Equal pressure on both pistons: `F1 / A1 = F2 / A2`, so `F1 = F2 × A1 / A2` (same units for both areas).",
        ...conv,
        `\`F1 = ${num(F2g)} × ${num(mixed ? A1si : A1)} / ${num(mixed ? A2si : A2)}\``,
      ],
      hints: [
        "The pressure is the same in the whole liquid: `F1 / A1 = F2 / A2`.",
        `Rearrange for F1 (in the calculator: \`_F2 * ${mixed ? C("A1") : "_A1_cm2"} / ${mixed ? "_A2" : "_A2_cm2"}\`).${thenRound}`,
      ],
      candidates: [(F2g * A2si) / A1si, F2g / A1, F2g * A1, F2g - A2si / A1si, exact * 100],
    }, rng);
  }

  if (kind === "hydP") {
    // Pressure in the liquid from the small piston (medium, whole-number kPa)
    const dev = rng.pick(HYD);
    const [A1, F1] = draw(() => [rng.int(2, 40), rng.int(20, 800)], ([a, f]) => isInt((f * 10) / a));
    const P = (F1 / toSIu(A1, "cm²")) / 1000;
    const units = { A1: "cm²", P: "kPa" };
    return single({
      prompt: `In a ${dev}, a force of ${F1} N acts on a small piston of area ${A1} cm². What is the pressure in the hydraulic liquid, in kPa?`,
      exact: P, unit: "kPa", rounded: false, formula: "pfa1", unknown: "P", values: { F1, A1 }, units,
      steps: ["Pressure = force / area, with the area in m².", `Convert: ${convLine(A1, "cm²")}.`, `\`P = ${F1} / ${num(toSIu(A1, "cm²"))} = ${num(P * 1000)}\` Pa. Divide by 1000:`, `\`P = ${num(P * 1000)} / 1000\``],
      hints: ["The pressure in the liquid is the force on the small piston divided by its area: `P = F / A`.", "Convert cm² to m² (÷ 10 000) first, then divide; finally convert Pa to kPa (in the calculator: `_F1 / (_A1_cm2 / 10000) / 1000`)."],
      candidates: [F1 / A1, (F1 / A1) * 10000, P * 1000, P / 10],
    }, rng);
  }

  if (kind === "hydd") {
    // Circular pistons given by diameter (hard)
    const dev = rng.pick(HYD);
    const d1 = rng.int(10, 60) / 10;
    const d2 = draw(() => rng.int(80, 400) / 10, (x) => x > d1 * 2);
    const F1 = rng.int(100, 5000) / 10;
    const F2 = F1 * ((Math.PI * (d2 / 200) ** 2) / (Math.PI * (d1 / 200) ** 2));
    return single({
      prompt: `A ${dev} has circular pistons. The small piston has a diameter of ${num(d1)} cm and the large one ${num(d2)} cm. A force of ${num(F1)} N acts on the small piston. What force does the large piston exert, in N? (Area of a circle = π × d² / 4.)${DP}`,
      exact: F2, unit: "N", rounded: true, formula: "hydd", unknown: "F2", values: { F1, d1, d2 }, units: { d1: "cm", d2: "cm" },
      steps: [
        "Equal pressure: `F2 = F1 × A2 / A1`. For circles, A = π d² / 4, so π/4 and the cm-to-m factor cancel in the ratio: `A2 / A1 = (d2 / d1)²`.",
        `\`(d2 / d1)² = (${num(d2)} / ${num(d1)})² = ${num((d2 / d1) ** 2)}\``,
        `\`F2 = ${num(F1)} × ${num((d2 / d1) ** 2)}\``,
      ],
      hints: [
        "Use `F1 / A1 = F2 / A2` with circle areas `A = π × d² / 4`.",
        "In the ratio A2 / A1 everything cancels except the diameters squared: `A2 / A1 = (d2 / d1)²`. Doubling the diameter gives 4 times the area.",
        `In the calculator: \`_F1 * (_d2_cm / _d1_cm) ^ 2\`.${THEN}`,
      ],
      candidates: [F1 * (d2 / d1), F1 * (d2 / d1) ** 2 / 4, F1 * ((d2 / 2) / d1) ** 2, (F1 * d1 * d1) / (d2 * d2)],
    }, rng);
  }

  // Atmospheric + liquid pressure
  const liq = rng.pick(d === "easy" ? [LIQ[0]] : LIQ.slice(0, 3));
  const Patm = d === "easy" ? 100000 : d === "medium" ? 101000 : rng.pick([101000, 101300, 100000]);
  const PatmShown = d === "easy" ? "100000 Pa" : `${num(Patm / 1000)} kPa`;
  const where = rng.pick(liq.places);
  if (kind === "atm") {
    let h;
    if (d === "easy") h = rng.int(1, 40);
    else if (d === "medium") h = draw(() => rng.int(1, 80), (x) => isInt((liq.rho * G * x) / 1000));
    else h = rng.int(10, 8000) / 100;
    const Ptot = Patm + liq.rho * G * h;
    const askU = d === "easy" ? "Pa" : "kPa";
    const exact = askU === "kPa" ? Ptot / 1000 : Ptot;
    const units = d === "easy" ? {} : { Patm: "kPa", P: "kPa" };
    const values = { Patm: d === "easy" ? Patm : Patm / 1000, rho: liq.rho, g: G, h };
    return single({
      prompt: `A diver is ${num(h)} m below the surface of ${where} (${liq.name}, density ${liq.rho} kg/m³). Atmospheric pressure at the surface is ${PatmShown}. Take g = 9.8 N/kg. What is the total pressure on the diver, in ${askU}?${end}`,
      exact, unit: askU, rounded, formula: "patm", unknown: "P", values, units,
      steps: [
        "Total pressure = atmospheric pressure + pressure due to the liquid: `P = P_atm + ρ × g × h`.",
        `Liquid: \`${liq.rho} × 9.8 × ${num(h)} = ${num(liq.rho * G * h)}\` Pa.`,
        `\`P = ${num(Patm)} + ${num(liq.rho * G * h)}${askU === "kPa" ? "` Pa = " + num(Ptot) + " Pa. In kPa: `" + num(Ptot) + " / 1000" : ""}\``,
      ],
      hints: [
        "The air above the water pushes down too, so add atmospheric pressure to the liquid's own pressure `ρ × g × h`.",
        `Work in Pa (in the calculator: \`${d === "easy" ? "_Patm" : "_Patm_kPa * 1000"} + _rho * _g * _h\`${askU === "kPa" ? ", then divide by 1000" : ""}).${thenRound}`,
      ],
      candidates: [(liq.rho * G * h) / (askU === "kPa" ? 1000 : 1), (Patm + liq.rho * 10 * h) / (askU === "kPa" ? 1000 : 1), (Patm - liq.rho * G * h) / (askU === "kPa" ? 1000 : 1)],
    }, rng);
  }

  if (kind === "atmh") {
    // Depth from a total pressure
    let h, Ptot;
    if (d === "medium") {
      h = draw(() => rng.int(2, 90), (x) => isInt((liq.rho * G * x) / 1000));
      Ptot = (Patm + liq.rho * G * h) / 1000;
    } else {
      Ptot = fix(Math.round((Patm + liq.rho * G * (rng.int(100, 9000) / 100)) / 100) / 10);
    }
    const exact = (Ptot * 1000 - Patm) / (liq.rho * G);
    if (!(exact > 0)) throw new Retry();
    const values = { P: Ptot, Patm: Patm / 1000, rho: liq.rho, g: G };
    const units = { P: "kPa", Patm: "kPa" };
    return single({
      prompt: `A pressure gauge on a submarine in ${where} (${liq.name}, density ${liq.rho} kg/m³) reads a total pressure of ${num(Ptot)} kPa. Atmospheric pressure at the surface is ${PatmShown}. Take g = 9.8 N/kg. How deep is the submarine, in m?${end}`,
      exact, unit: "m", rounded, formula: "patm", unknown: "h", values, units,
      steps: [
        "Subtract atmospheric pressure to get the pressure due to the liquid, then use `h = P / (ρ × g)`.",
        `Liquid pressure: \`${num(Ptot * 1000)} - ${num(Patm)} = ${num(Ptot * 1000 - Patm)}\` Pa.`,
        `\`h = ${num(Ptot * 1000 - Patm)} / (${liq.rho} × 9.8)\``,
      ],
      hints: [
        "The gauge reads atmospheric pressure plus the liquid's pressure. Take away the atmospheric part first.",
        `Then \`h = P / (ρ × g)\`, all in Pa (in the calculator: \`(_P_kPa - _Patm_kPa) * 1000 / (_rho * _g)\`).${thenRound}`,
      ],
      candidates: [(Ptot * 1000) / (liq.rho * G), (Ptot * 1000 + Patm) / (liq.rho * G), (Ptot - Patm / 1000) / (liq.rho * G) * 100, (Ptot * 1000 - Patm) / (liq.rho * 10)],
    }, rng);
  }

  // window: force on a submerged window from the water alone (hard)
  const h = rng.int(100, 6000) / 100;
  const A = rng.int(100, 20000) / 10;
  const F = liq.rho * G * h * (A / 10000);
  const thing = rng.pick(["window of an underwater observatory", "porthole of a submarine", "viewing panel of an aquarium", "hatch of a diving bell"]);
  return single({
    prompt: `A ${thing} has an area of ${num(A)} cm² and is ${num(h)} m below the surface of ${where} (${liq.name}, density ${liq.rho} kg/m³). Take g = 9.8 N/kg. What force does the ${liq.name} alone exert on it, in N? (Ignore atmospheric pressure, which acts on both sides.)${DP}`,
    exact: F, unit: "N", rounded: true, formula: "window", unknown: "F", values: { rho: liq.rho, g: G, h, A }, units: { A: "cm²" },
    steps: [
      "Find the liquid pressure at that depth, then multiply by the area in m²: `F = ρ × g × h × A`.",
      `Pressure: \`${liq.rho} × 9.8 × ${num(h)} = ${num(liq.rho * G * h)}\` Pa. Area: ${convLine(A, "cm²")}.`,
      `\`F = ${num(liq.rho * G * h)} × ${num(A / 10000)}\``,
    ],
    hints: [
      "Two steps: the pressure at that depth (`P = ρ × g × h`), then force = pressure × area.",
      `Convert the area to m² (÷ 10 000) before multiplying (in the calculator: \`_rho * _g * _h * (_A_cm2 / 10000)\`).${THEN}`,
    ],
    candidates: [liq.rho * G * h * A, liq.rho * G * h * (A / 100), liq.rho * G * h / (A / 10000), F / 1000],
  }, rng);
}

// Hard multi: hydraulic jack with diameters, or a hatch at depth.
function contextMulti(rng) {
  if (rng.next() < 0.5) {
    const dev = rng.pick(HYD);
    const A1 = rng.int(20, 400) / 10;
    const A2 = rng.int(1000, 30000) / 10;
    const F1 = rng.int(100, 6000) / 10;
    const P = F1 / (A1 / 10000) / 1000;
    const F2 = (F1 * A2) / A1;
    const values = { F1, A1, A2 };
    const units = { A1: "cm²", A2: "cm²" };
    const explanation = [
      "The small piston sets the pressure in the liquid; the large piston feels that same pressure over its bigger area.",
      `1. Pressure: \`${num(F1)} / ${num(A1 / 10000)} / 1000\` ${result(P, true, "kPa")}`,
      `2. Force on the large piston: \`P × A2 = ${num(P * 1000)} × ${num(A2 / 10000)}\` ${result(F2, true, "N")}`,
    ].join("\n\n");
    return multi(
      `In a ${dev}, a force of ${num(F1)} N pushes on a small piston of area ${num(A1)} cm². The large piston has an area of ${num(A2)} cm².`,
      [
        numPart("pressure", "Pressure", `What is the pressure in the liquid, in kPa?${DP}`, P,
          "`P = F / A` with the area in m² (÷ 10 000), then ÷ 1000 for kPa (in the calculator: `_F1 / (_A1_cm2 / 10000) / 1000`).",
          { formula: "pfa1", unknown: "P", values: { F1, A1 }, units: { A1: "cm²", P: "kPa" } }),
        numPart("force", "Output force", `What force does the large piston exert, in N?${DP}`, F2,
          "The same pressure acts on the large piston: `F2 = P × A2`, or `F1 × A2 / A1`. Use unrounded values.",
          { formula: "hyd", unknown: "F2", values, units }),
      ],
      explanation, values, units,
    );
  }
  const liq = rng.pick(LIQ.slice(0, 2));
  const h = rng.int(200, 8000) / 100;
  const A = rng.int(500, 15000) / 10;
  const Patm = 101000;
  const Pl = (liq.rho * G * h) / 1000;
  const Pt = Pl + Patm / 1000;
  const F = (liq.rho * G * h * (A / 10000)) / 1000;
  const values = { rho: liq.rho, g: G, h, Patm: 101, A };
  const units = { Patm: "kPa", A: "cm²" };
  const explanation = [
    "Find the liquid's pressure, add the atmosphere for the total, and use the liquid's pressure alone for the force (the air pushes on the inside of the hatch too).",
    `1. Liquid: \`${liq.rho} × 9.8 × ${num(h)} / 1000\` ${result(Pl, true, "kPa")}`,
    `2. Total: \`${num(Pl)} + 101\` ${result(Pt, true, "kPa")}`,
    `3. Force: \`${num(Pl * 1000)} × ${num(A / 10000)} / 1000\` ${result(F, true, "kN")}`,
  ].join("\n\n");
  return multi(
    `A submarine hatch of area ${num(A)} cm² is ${num(h)} m below the surface of the ${liq.name === "water" ? "lake" : "sea"} (${liq.name}, density ${liq.rho} kg/m³). Atmospheric pressure is 101 kPa. Take g = 9.8 N/kg. Inside the submarine the air is at atmospheric pressure.`,
    [
      numPart("liquid", "Liquid pressure", `What is the pressure due to the ${liq.name} alone, in kPa?${DP}`, Pl,
        "`P = ρ × g × h`, then divide by 1000 (in the calculator: `_rho * _g * _h / 1000`).",
        { formula: "rgh", unknown: "P", values: { rho: liq.rho, g: G, h }, units: { P: "kPa" } }),
      numPart("total", "Total pressure", `What is the total pressure on the outside of the hatch, in kPa?${DP}`, Pt,
        "Add atmospheric pressure to the liquid's pressure.",
        { formula: "patm", unknown: "P", values: { Patm: 101, rho: liq.rho, g: G, h }, units: { Patm: "kPa", P: "kPa" } }),
      numPart("force", "Resultant force", `The air inside cancels the atmospheric part. What is the resultant force on the hatch, in kN?${DP}`, F,
        "Use only the liquid's pressure (in Pa) × the area in m² (÷ 10 000), then ÷ 1000 for kN.",
        { formula: "window", unknown: "F", values: { rho: liq.rho, g: G, h, A }, units: { A: "cm²", F: "kN" } }),
    ],
    explanation, values, units,
  );
}

// ---------------------------------------------------------------------------------------------

const GENS = { pressure: genPressure, "liquid-pressure": genLiquid, "gas-laws": genGas, "pressure-context": genContext };

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
// Independent check: convert each stated value to SI with its own table (°C -> K by + 273), substitute
// the answer into the cross-multiplied law (p1·V1·T2 = p2·V2·T1, F1·A2 = F2·A1, P·A = F ...) and look at
// the residual. Whole-number answers must satisfy it exactly; a rounded answer x is right when the law
// changes sign strictly inside x ± 0.005 (rounding ties are never generated).

const SI = { "cm²": [1e-4, 0], "mm²": [1e-6, 0], cm: [0.01, 0], kPa: [1000, 0], kN: [1000, 0], "°C": [1, 273] };

const LAWS = {
  pfa: (k) => k.P * k.A - k.F,
  pfa1: (k) => k.P * k.A1 - k.F1,
  face: (k) => k.P * k.l * k.w - k.m * k.g,
  weight: (k) => k.W - k.m * k.g,
  rgh: (k) => k.P - k.rho * k.g * k.h,
  dp: (k) => (k.h2 > k.h1 ? k.dP - k.rho * k.g * (k.h2 - k.h1) : NaN),
  gas: (k) => (k.p1 ?? 1) * (k.V1 ?? 1) * (k.T2 ?? 1) - (k.p2 ?? 1) * (k.V2 ?? 1) * (k.T1 ?? 1),
  hyd: (k) => k.F1 * k.A2 - k.F2 * k.A1,
  hydd: (k) => k.F1 * (Math.PI * k.d2 * k.d2 / 4) - k.F2 * (Math.PI * k.d1 * k.d1 / 4),
  patm: (k) => k.P - k.Patm - k.rho * k.g * k.h,
  window: (k) => k.F - k.rho * k.g * k.h * k.A,
};
const POS = ["P", "A", "A1", "A2", "F", "F1", "F2", "W", "m", "g", "l", "w", "rho", "h", "h1", "h2", "dP", "p1", "p2", "V1", "V2", "T1", "T2", "d1", "d2", "Patm"];

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
      const u = units[key] ? SI[units[key]] : [1, 0];
      k[key] = raw * u[0] + u[1];
    }
    return k;
  };
  const k = at(x);
  for (const [key, val] of Object.entries(k)) {
    if (typeof val !== "number" || !Number.isFinite(val)) return false;
    if (POS.includes(key) && !(val > 0)) return false;
  }
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
  if (Math.abs(lo) <= eps || Math.abs(hi) <= eps) return false;
  return lo * hi < 0;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
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
