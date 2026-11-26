// Electricity generator: Ohm's law, power/energy, series and parallel resistance.
// Uses only the seeded rng passed in by the engine.
// Easy/medium answers are whole numbers; hard answers are rounded to 2 decimals (tolerance 0.005).
// Explanations list every step as a labelled calculator row, e.g. `_I = _V / _R` → 2.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

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

// Dollar amounts in prompts: "$0.15", "$12.50".
const cash = (n) => `$${round2(n).toFixed(2)}`;

// Calculator rows for the explanation (rendered as a markdown list).
const given = (label, v) => `- \`${label} = ${num(v)}\``;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;
const explain = (intro, lines) => `${intro}\n\n${lines.join("\n")}`;
// Pre-filled calculator rows (question.given): only values stated in the prompt, labelled like the
// explanation's rows where those hold the same number. [[label, value], ...] -> [{ label, value }, ...].
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));

// The value shown on the last row: "**12 V**" or "14.2857, which rounds to **14.29 Ω**".
function final(exact, rounded, unit) {
  const shown = fmtAns(exact, rounded);
  const dressed = unit === "$" ? `$${shown}` : `${shown} ${unit}`;
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `**${dressed}**`;
  return `${num(exact)}, which rounds to **${dressed}**`;
}

const DP2 = " Round to 2 decimal places.";

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors; no negative or zero options.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || !(round2(v) > 0)) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Turn a solved question into either a typed-number or a multiple-choice question.
function finish(base, exact, rounded, candidates, rng) {
  const q = { ...base, tolerance: rounded ? 0.005 : 0 };
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

const DEVICES = ["a resistor", "a lamp", "a heating element", "a small motor", "an LED circuit", "a speaker coil"];
// Plausible ranges per device, in volts, amps, ohms and watts (a resistor fits anything). The device is
// still drawn with the rng as before; one that doesn't suit the numbers is swapped for the next one that
// does, so only the wording changes, never the numbers.
const DEVICE_FIT = {
  "a lamp": { V: [1.5, 240], I: [0.02, 5], P: [0.1, 200] },
  "a heating element": { V: [6, 250], P: [50, 3500] },
  "a small motor": { V: [1.5, 24], I: [0.05, 10], P: [0.1, 200] },
  "an LED circuit": { V: [1.5, 24], I: [0.001, 1], P: [0, 20] },
  "a speaker coil": { V: [0, 60], R: [2, 16], P: [0, 500] },
};
function deviceFor(drawn, { V, I, R, P }) {
  const vals = { V, I, R, P };
  if (vals.R === undefined && V !== undefined && I !== undefined) vals.R = V / I;
  if (vals.P === undefined && V !== undefined && I !== undefined) vals.P = V * I;
  if (vals.V === undefined && I !== undefined && R !== undefined) vals.V = I * R;
  if (vals.I === undefined && V !== undefined && R !== undefined) vals.I = V / R;
  if (vals.P === undefined && vals.V !== undefined && vals.I !== undefined) vals.P = vals.V * vals.I;
  const fits = (d) => Object.entries(DEVICE_FIT[d] || {}).every(([k, [lo, hi]]) => vals[k] === undefined || (vals[k] >= lo && vals[k] <= hi));
  const i = DEVICES.indexOf(drawn);
  for (let k = 0; k < DEVICES.length; k++) if (fits(DEVICES[(i + k) % DEVICES.length])) return DEVICES[(i + k) % DEVICES.length];
  return "a resistor";
}

// ---------------------------------------------------------------------------------------------
// Ohm's law: V = I × R. Medium works in mA and kΩ (mA × kΩ = V).

function genOhm(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty === "hard";
  const unknown = rng.pick(["V", "I", "R"]);
  const devDrawn = rng.pick(DEVICES);
  const milli = difficulty === "medium";
  const uI = milli ? "mA" : "A";
  const uR = milli ? "kΩ" : "Ω";
  let V, I, R;
  if (difficulty === "easy") {
    I = rng.int(1, 12);
    R = rng.int(2, 25);
    V = I * R;
  } else if (milli) {
    I = rng.int(2, 25); // mA
    R = rng.int(1, 47); // kΩ
    V = I * R; // V
  } else if (unknown === "V") {
    I = rng.int(5, 500) / 100;
    R = rng.int(10, 1500) / 10;
  } else if (unknown === "I") {
    V = rng.int(15, 2400) / 10;
    R = rng.int(10, 1500) / 10;
  } else {
    V = rng.int(15, 2400) / 10;
    I = rng.int(5, 500) / 100;
  }

  const end = rounded ? DP2 : "";
  const toA = (x) => (milli ? x / 1000 : x); // mA -> A
  const toOhm = (x) => (milli ? x * 1000 : x); // kΩ -> Ω
  const dev = deviceFor(devDrawn, {
    V: V ?? toA(I) * toOhm(R), I: I === undefined ? V / toOhm(R) : toA(I), R: R === undefined ? V / toA(I) : toOhm(R),
  });
  let prompt, exact, unit, intro, lines, candidates, gv, hints;
  const thenRound = rounded ? " Then round to 2 decimal places." : "";
  // Medium states mA and kΩ; the explanation's _I/_R rows hold amps and ohms, so those get their own labels.
  const gI = milli ? "_mA" : "_I";
  const gR = milli ? "_kOhm" : "_R";
  if (unknown === "V") {
    exact = I * R;
    unit = "V";
    prompt = `A current of ${num(I)} ${uI} flows through ${dev} with a resistance of ${num(R)} ${uR}. What is the voltage across it, in V?${end}`;
    intro = "Use Ohm's law: `V = I × R`." + (milli ? " Convert to amps and ohms first." : "");
    lines = [given("_I", toA(I)), given("_R", toOhm(R)), step("_V", "_I * _R", final(exact, rounded, unit))];
    gv = [[gI, I], [gR, R]];
    candidates = [I / R, R / I, I + R];
    hints = milli
      ? [
          "Use Ohm's law: `V = I × R`, with the current in amps and the resistance in ohms.",
          `Convert: ${num(I)} mA = ${num(toA(I))} A and ${num(R)} kΩ = ${num(toOhm(R))} Ω. (Handy shortcut: mA × kΩ comes out in volts.)`,
          `Substitute: \`V = ${num(toA(I))} × ${num(toOhm(R))}\` (in the calculator: \`(_mA / 1000) * (_kOhm * 1000)\`).`,
        ]
      : [
          "Use Ohm's law: `V = I × R`.",
          `Substitute: \`V = ${num(I)} × ${num(R)}\` (in the calculator: \`_I * _R\`).${thenRound}`,
        ];
  } else if (unknown === "I") {
    exact = V / R;
    unit = uI;
    prompt = `A voltage of ${num(V)} V is applied across ${dev} with a resistance of ${num(R)} ${uR}. What current flows, in ${uI}?${end}`;
    intro = "Rearrange Ohm's law to `I = V / R`." + (milli ? " Work in ohms, then convert amps to milliamps (× 1000)." : "");
    lines = [given("_V", V), given("_R", toOhm(R))];
    gv = [["_V", V], [gR, R]];
    if (milli) {
      lines.push(step("_I", "_V / _R", `${num(V / toOhm(R))} A`), step("_I_mA", "_I * 1000", final(exact, rounded, unit)));
    } else {
      lines.push(step("_I", "_V / _R", final(exact, rounded, unit)));
    }
    candidates = [V * R, R / V, V - R];
    hints = milli
      ? [
          "Rearrange Ohm's law to `I = V / R`. Work in ohms, so the current comes out in amps.",
          `Convert: ${num(R)} kΩ = ${num(toOhm(R))} Ω, so \`I = ${num(V)} / ${num(toOhm(R))}\` in amps (in the calculator: \`_V / (_kOhm * 1000)\`).`,
          "The question wants milliamps, so multiply the amps by 1000.",
        ]
      : [
          "Rearrange Ohm's law `V = I × R` to `I = V / R`.",
          `Substitute: \`I = ${num(V)} / ${num(R)}\` (in the calculator: \`_V / _R\`).${thenRound}`,
        ];
  } else {
    exact = V / I;
    unit = uR;
    prompt = `${dev[0].toUpperCase()}${dev.slice(1)} draws ${num(I)} ${uI} when ${num(V)} V is applied across it. What is its resistance, in ${uR}?${end}`;
    intro = "Rearrange Ohm's law to `R = V / I`." + (milli ? " Work in amps, then convert ohms to kilohms (÷ 1000)." : "");
    lines = [given("_V", V), given("_I", toA(I))];
    gv = [["_V", V], [gI, I]];
    if (milli) {
      lines.push(step("_R", "_V / _I", `${num(V / toA(I))} Ω`), step("_R_k", "_R / 1000", final(exact, rounded, unit)));
    } else {
      lines.push(step("_R", "_V / _I", final(exact, rounded, unit)));
    }
    candidates = [V * I, I / V, V - I];
    hints = milli
      ? [
          "Rearrange Ohm's law to `R = V / I`. Work in amps, so the resistance comes out in ohms.",
          `Convert: ${num(I)} mA = ${num(toA(I))} A, so \`R = ${num(V)} / ${num(toA(I))}\` in ohms (in the calculator: \`_V / (_mA / 1000)\`).`,
          "The question wants kilohms, so divide the ohms by 1000.",
        ]
      : [
          "Rearrange Ohm's law `V = I × R` to `R = V / I`.",
          `Substitute: \`R = ${num(V)} / ${num(I)}\` (in the calculator: \`_V / _I\`).${thenRound}`,
        ];
  }

  const values = { V, I, R };
  delete values[unknown];
  const base = { prompt, explanation: explain(intro, lines), params: { formula: "ohm", unknown, values, rounded }, given: givenRows(gv), hints };
  return finish(base, exact, rounded, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Power: P = VI, P = I²R, P = V²/R; energy E = Pt (kWh) and cost on hard.

// maxH: the most hours a day it plausibly runs (hard energy questions stay within it).
const APPLIANCES = [
  { name: "an electric kettle", W: [1800, 3000], maxH: 1 },
  { name: "a space heater", W: [800, 2400], maxH: 8 },
  { name: "a desktop computer", W: [150, 450], maxH: 10 },
  { name: "a television", W: [60, 250], maxH: 8 },
  { name: "a washing machine", W: [500, 2200], maxH: 3 },
  { name: "a ceiling fan", W: [40, 90], maxH: 10 },
  { name: "a microwave oven", W: [700, 1300], maxH: 1 },
  { name: "a fridge", W: [100, 250], maxH: 10 },
];

function genPower(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty === "hard";
  const kind = rng.pick(
    difficulty === "easy"
      ? ["vi-P", "vi-I", "i2r-P"]
      : difficulty === "medium"
        ? ["v2r-P", "v2r-R", "i2r-I", "vi-V"]
        : ["energy", "cost", "vi-I", "v2r-P"]
  );
  const devDrawn = rng.pick(DEVICES);
  let dev = devDrawn;
  const end = rounded ? DP2 : "";
  let prompt, exact, unit, intro, lines, candidates, formula, unknown, values, gv, hints;
  const thenRound = rounded ? " Then round to 2 decimal places." : "";

  if (kind === "vi-P" || kind === "vi-I" || kind === "vi-V") {
    formula = "vi";
    let V, I, P;
    if (difficulty === "hard") {
      const a = rng.pick(APPLIANCES);
      P = 10 * rng.int(a.W[0] / 10, a.W[1] / 10);
      V = rng.pick([110, 120, 220, 230, 240]);
      I = P / V;
      unknown = "I";
      exact = I;
      unit = "A";
      values = { P, V };
      prompt = `${a.name[0].toUpperCase()}${a.name.slice(1)} is rated ${P} W and runs on a ${V} V supply. What current does it draw, in A?${end}`;
      intro = "Rearrange `P = V × I` to `I = P / V`.";
      lines = [given("_P", P), given("_V", V), step("_I", "_P / _V", final(exact, rounded, unit))];
      gv = [["_P", P], ["_V", V]];
      candidates = [P * V, V / P, P / (V * V), (P / V) * 10];
      hints = [
        "Power, voltage and current are linked by `P = V × I`. Rearrange it for the current: `I = P / V`.",
        `Substitute: \`I = ${P} / ${V}\` (in the calculator: \`_P / _V\`).${thenRound}`,
      ];
    } else {
      V = difficulty === "easy" ? rng.int(2, 24) : rng.int(6, 240);
      I = difficulty === "easy" ? rng.int(1, 10) : rng.int(2, 15);
      P = V * I;
      dev = deviceFor(devDrawn, { V, I, P });
      if (kind === "vi-P") {
        unknown = "P";
        exact = P;
        unit = "W";
        values = { V, I };
        prompt = `${dev[0].toUpperCase()}${dev.slice(1)} has ${V} V across it and ${I} A flowing through it. What power does it use, in W?`;
        intro = "Use `P = V × I`.";
        lines = [given("_V", V), given("_I", I), step("_P", "_V * _I", final(exact, false, unit))];
        gv = [["_V", V], ["_I", I]];
        candidates = [V / I, I / V, V + I];
        hints = [
          "Power is voltage times current: `P = V × I`.",
          `Substitute: \`P = ${V} × ${I}\` (in the calculator: \`_V * _I\`).`,
        ];
      } else if (kind === "vi-I") {
        unknown = "I";
        exact = I;
        unit = "A";
        values = { P, V };
        prompt = `${dev[0].toUpperCase()}${dev.slice(1)} uses ${P} W of power with ${V} V across it. What current flows through it, in A?`;
        intro = "Rearrange `P = V × I` to `I = P / V`.";
        lines = [given("_P", P), given("_V", V), step("_I", "_P / _V", final(exact, false, unit))];
        gv = [["_P", P], ["_V", V]];
        candidates = [P * V, V / P, P - V];
        hints = [
          "Start from `P = V × I` and rearrange for the current: `I = P / V`.",
          `Substitute: \`I = ${P} / ${V}\` (in the calculator: \`_P / _V\`).`,
        ];
      } else {
        unknown = "V";
        exact = V;
        unit = "V";
        values = { P, I };
        prompt = `${dev[0].toUpperCase()}${dev.slice(1)} uses ${P} W of power while ${I} A flows through it. What is the voltage across it, in V?`;
        intro = "Rearrange `P = V × I` to `V = P / I`.";
        lines = [given("_P", P), given("_I", I), step("_V", "_P / _I", final(exact, false, unit))];
        gv = [["_P", P], ["_I", I]];
        candidates = [P * I, I / P, P - I];
        hints = [
          "Start from `P = V × I` and rearrange for the voltage: `V = P / I`.",
          `Substitute: \`V = ${P} / ${I}\` (in the calculator: \`_P / _I\`).`,
        ];
      }
    }
  } else if (kind === "i2r-P" || kind === "i2r-I") {
    formula = "i2r";
    const I = difficulty === "easy" ? rng.int(1, 6) : rng.int(2, 12);
    const R = difficulty === "easy" ? rng.int(2, 20) : rng.int(2, 60);
    const P = I * I * R;
    dev = deviceFor(devDrawn, { I, R, P });
    if (kind === "i2r-P") {
      unknown = "P";
      exact = P;
      unit = "W";
      values = { I, R };
      prompt = `A current of ${I} A flows through ${dev} with a resistance of ${R} Ω. What power does it use, in W?`;
      intro = "Use `P = I² × R`.";
      lines = [given("_I", I), given("_R", R), step("_P", "_I^2 * _R", final(exact, false, unit))];
      gv = [["_I", I], ["_R", R]];
      candidates = [I * R, 2 * I * R, I * R * R]; // forgot to square, doubled instead, squared R
      hints = [
        "You know the current and the resistance, so use `P = I² × R`.",
        `Substitute: \`P = ${I}² × ${R}\` (in the calculator: \`_I^2 * _R\`). Square the current first, then multiply.`,
      ];
    } else {
      unknown = "I";
      exact = I;
      unit = "A";
      values = { P, R };
      prompt = `${dev[0].toUpperCase()}${dev.slice(1)} with a resistance of ${R} Ω uses ${P} W of power. What current flows through it, in A?`;
      intro = "Rearrange `P = I² × R` to `I = √(P / R)`.";
      lines = [given("_P", P), given("_R", R), step("_I", "sqrt(_P / _R)", final(exact, false, unit))];
      gv = [["_P", P], ["_R", R]];
      candidates = [P / R, P * R, Math.sqrt(P * R)]; // forgot the root, multiplied, root of product
      hints = [
        "Start from `P = I² × R`. Divide by R to get I², then take the square root: `I = √(P / R)`.",
        `Substitute: \`I = √(${P} / ${R})\` (in the calculator: \`sqrt(_P / _R)\`).`,
      ];
    }
  } else if (kind === "v2r-P" || kind === "v2r-R") {
    formula = "v2r";
    let V, R, P;
    if (rounded) {
      V = rng.int(15, 2400) / 10;
      R = rng.int(10, 2000) / 10;
      P = (V * V) / R;
    } else {
      // V = I·R keeps V²/R = I²·R whole.
      const I = rng.int(1, 8);
      R = rng.int(2, 40);
      V = I * R;
      P = I * I * R;
    }
    dev = deviceFor(devDrawn, { V, R, P });
    if (kind === "v2r-P") {
      unknown = "P";
      exact = P;
      unit = "W";
      values = { V, R };
      prompt = `A voltage of ${num(V)} V is applied across ${dev} with a resistance of ${num(R)} Ω. What power does it use, in W?${end}`;
      intro = "Use `P = V² / R`.";
      lines = [given("_V", V), given("_R", R), step("_P", "_V^2 / _R", final(exact, rounded, unit))];
      gv = [["_V", V], ["_R", R]];
      candidates = [V / R, V * V * R, (2 * V) / R]; // forgot to square, multiplied, doubled
      hints = [
        "You know the voltage and the resistance, so use `P = V² / R`.",
        `Substitute: \`P = ${num(V)}² / ${num(R)}\` (in the calculator: \`_V^2 / _R\`). Square the voltage first.${thenRound}`,
      ];
    } else {
      unknown = "R";
      exact = (V * V) / P;
      unit = "Ω";
      values = { V, P };
      prompt = `${dev[0].toUpperCase()}${dev.slice(1)} uses ${num(P)} W of power with ${num(V)} V across it. What is its resistance, in Ω?`;
      intro = "Rearrange `P = V² / R` to `R = V² / P`.";
      lines = [given("_V", V), given("_P", P), step("_R", "_V^2 / _P", final(exact, rounded, unit))];
      gv = [["_V", V], ["_P", P]];
      candidates = [P / (V * V), V / P, P / V];
      hints = [
        "Start from `P = V² / R` and swap R and P: `R = V² / P`.",
        `Substitute: \`R = ${num(V)}² / ${num(P)}\` (in the calculator: \`_V^2 / _P\`).${thenRound}`,
      ];
    }
  } else {
    // Hard: energy in kWh, optionally its cost.
    const a = rng.pick(APPLIANCES);
    const P = 10 * rng.int(a.W[0] / 10, a.W[1] / 10);
    // 0.25 h steps; a draw above the appliance's daily maximum wraps round into range (same rng draw).
    const q4 = rng.int(1, 40);
    const hours = (q4 > a.maxH * 4 ? ((q4 - 1) % (a.maxH * 4)) + 1 : q4) / 4;
    const days = rng.int(5, 31);
    const E = (P * hours * days) / 1000;
    const appl = `${a.name[0].toUpperCase()}${a.name.slice(1)}`;
    const setup = `${appl} rated ${P} W runs for ${num(hours)} ${hours === 1 ? "hour" : "hours"} a day for ${days} days.`;
    lines = [given("_P_kW", P / 1000), given("_hours", hours * days)];
    // The prompt states watts and hours per day; _P_kW and _hours above are worked values, so new labels.
    gv = [["_P_W", P], ["_h_per_day", hours], ["_days", days]];
    if (kind === "energy") {
      formula = "energy";
      unknown = "E";
      exact = E;
      unit = "kWh";
      values = { P, hours, days };
      prompt = `${setup} How much energy does it use in total, in kWh?${end}`;
      intro = "Energy = power × time. Convert watts to kilowatts (÷ 1000) and add up the hours, so the answer comes out in kWh.";
      lines.push(step("_E", "_P_kW * _hours", final(exact, rounded, unit)));
      candidates = [P * hours * days, (P * hours) / 1000, (P * hours * days) / 100];
      hints = [
        "Energy = power × time. Use the power in kilowatts and the time in hours, so the answer comes out in kWh.",
        `Convert: ${P} W = ${num(P / 1000)} kW. Total time: ${num(hours)} h × ${days} days = ${num(hours * days)} h.`,
        `Multiply: \`E = ${num(P / 1000)} × ${num(hours * days)}\` (in the calculator: \`_P_W / 1000 * _h_per_day * _days\`).${thenRound}`,
      ];
    } else {
      formula = "cost";
      unknown = "C";
      const price = rng.int(8, 40) / 100;
      exact = E * price;
      unit = "$";
      values = { P, hours, days, price };
      prompt = `${setup} Electricity costs ${cash(price)} per kWh. How much does this cost, in dollars?${end}`;
      intro = "Find the energy in kWh (power in kW × total hours), then multiply by the price per kWh.";
      gv.push(["_price", price]);
      lines.push(given("_price", price), step("_E", "_P_kW * _hours", `${num(E)} kWh`), step("_cost", "_E * _price", final(exact, rounded, unit)));
      candidates = [P * hours * days * price, ((P * hours) / 1000) * price, E / price];
      hints = [
        "Find the energy used in kWh first (power in kW × total hours), then multiply by the price per kWh.",
        `Convert: ${P} W = ${num(P / 1000)} kW, and ${num(hours)} h × ${days} days = ${num(hours * days)} h, so \`E = ${num(P / 1000)} × ${num(hours * days)}\` kWh.`,
        `Cost = energy × price: \`${num(E)} × ${price}\` (in the calculator: \`_P_W / 1000 * _h_per_day * _days * _price\`).${thenRound}`,
      ];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { formula, unknown, values, rounded }, given: givenRows(gv), hints };
  return finish(base, exact, rounded, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Series and parallel: easy series, medium two in parallel, hard combinations.

// Two resistors whose parallel combination is a whole number of ohms.
function parallelPair(rng) {
  for (let i = 0; i < 400; i++) {
    const a = rng.int(2, 60);
    const b = rng.int(2, 60);
    if ((a * b) % (a + b) === 0) return [a, b];
  }
  return rng.pick([[6, 3], [12, 6], [20, 30], [10, 40], [12, 4], [24, 8], [30, 60]]);
}

function genCircuit(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty === "hard";
  const end = rounded ? DP2 : "";
  let prompt, exact, intro, lines, candidates, kind, values, gv, hints;
  const unit = "Ω";

  if (difficulty === "easy") {
    kind = rng.pick(["series", "series-missing"]);
    const n = rng.int(2, 4);
    const rs = Array.from({ length: n }, () => rng.int(1, 50) * rng.pick([1, 1, 2, 10]));
    const total = rs.reduce((s, r) => s + r, 0);
    const labels = rs.map((_, i) => `_R${i + 1}`);
    if (kind === "series") {
      exact = total;
      values = { rs };
      const all = rs.map((r) => `${r} Ω`);
      prompt = `Resistors of ${all.slice(0, -1).join(", ")} and ${all[n - 1]} are connected in series. What is the total resistance, in Ω?`;
      intro = "In series, resistances simply add: `R_total = R1 + R2 + …`.";
      lines = [...rs.map((r, i) => given(labels[i], r)), step("_R_total", labels.join(" + "), final(exact, false, unit))];
      gv = rs.map((r, i) => [labels[i], r]);
      candidates = [total - rs[0], Math.max(...rs), total + rs[n - 1]];
      hints = [
        "In series, resistances simply add: `R_total = R1 + R2 + …`.",
        `Add them up: \`${rs.join(" + ")}\` (in the calculator: \`${labels.join(" + ")}\`).`,
      ];
    } else {
      const known = rs.slice(0, -1);
      exact = rs[n - 1];
      values = { rs: known, total };
      const ks = known.map((r) => `${r} Ω`);
      const list = ks.length === 1 ? ks[0] : `${ks.slice(0, -1).join(", ")} and ${ks[ks.length - 1]}`;
      prompt =
        `${known.length === 1 ? "A resistor" : "Resistors"} of ${list} ${known.length === 1 ? "is" : "are"} connected in series with one more resistor. ` +
        `The total resistance is ${total} Ω. What is the resistance of the extra resistor, in Ω?`;
      intro = "In series, resistances add, so the missing one is the total minus the others.";
      const kl = labels.slice(0, -1);
      gv = [["_R_total", total], ...known.map((r, i) => [kl[i], r])];
      lines = [given("_R_total", total), ...known.map((r, i) => given(kl[i], r)), step("_R_x", `_R_total - ${kl.join(" - ")}`, final(exact, false, unit))];
      candidates = [total + known.reduce((s, r) => s + r, 0), total, total - known[0] + 1];
      hints = [
        "In series, all the resistances add up to the total. So the missing one is the total minus the ones you know.",
        `Subtract: \`${total} - ${known.join(" - ")}\` (in the calculator: \`_R_total - ${kl.join(" - ")}\`).`,
      ];
    }
  } else if (difficulty === "medium") {
    kind = "parallel";
    const [a, b] = parallelPair(rng);
    exact = (a * b) / (a + b);
    values = { a, b };
    prompt = `Two resistors of ${a} Ω and ${b} Ω are connected in parallel. What is their combined resistance, in Ω?`;
    intro = "For two resistors in parallel, `R = (R1 × R2) / (R1 + R2)` (product over sum). The result is always smaller than either resistor.";
    gv = [["_R1", a], ["_R2", b]];
    lines = [given("_R1", a), given("_R2", b), step("_R_total", "(_R1 * _R2) / (_R1 + _R2)", final(exact, false, unit))];
    candidates = [a + b, (a + b) / 2, a * b, Math.abs(a - b)];
    hints = [
      "For two resistors in parallel, use product over sum: `R = (R1 × R2) / (R1 + R2)`. The result is smaller than either resistor.",
      `Substitute: \`R = (${a} × ${b}) / (${a} + ${b}) = ${a * b} / ${a + b}\` (in the calculator: \`(_R1 * _R2) / (_R1 + _R2)\`).`,
    ];
  } else {
    kind = rng.pick(["s+p", "p-of-s"]);
    const pickR = () => rng.int(1, 47) * rng.pick([1, 10]);
    const r1 = pickR();
    const r2 = pickR();
    const r3 = pickR();
    values = { r1, r2, r3 };
    gv = [["_R1", r1], ["_R2", r2], ["_R3", r3]];
    if (kind === "s+p") {
      const p = (r2 * r3) / (r2 + r3);
      exact = r1 + p;
      prompt =
        `A resistor of ${r1} Ω is connected in series with a parallel pair of ${r2} Ω and ${r3} Ω resistors. ` +
        `What is the total resistance of the circuit, in Ω?${end}`;
      intro = "Work from the inside out: combine the parallel pair first (product over sum), then add the series resistor.";
      lines = [
        given("_R1", r1),
        given("_R2", r2),
        given("_R3", r3),
        step("_R_par", "(_R2 * _R3) / (_R2 + _R3)", `${num(p)} Ω`),
        step("_R_total", "_R1 + _R_par", final(exact, true, unit)),
      ];
      candidates = [r1 + r2 + r3, (r1 * (r2 + r3)) / (r1 + r2 + r3), r1 + 1 / r2 + 1 / r3, p];
      hints = [
        "Work from the inside out: combine the parallel pair first, then add the series resistor.",
        `Parallel pair (product over sum): \`R_par = (${r2} × ${r3}) / (${r2} + ${r3})\` (in the calculator: \`(_R2 * _R3) / (_R2 + _R3)\`).`,
        `Now add the series resistor: \`R_total = ${r1} + R_par\`, with R_par ≈ ${num(p)} Ω. Then round to 2 decimal places.`,
      ];
    } else {
      const s = r1 + r2;
      exact = (s * r3) / (s + r3);
      prompt =
        `Two resistors of ${r1} Ω and ${r2} Ω are connected in series, and that pair is connected in parallel with a ${r3} Ω resistor. ` +
        `What is the total resistance, in Ω?${end}`;
      intro = "Add the series pair first, then combine that total in parallel with the third resistor (product over sum).";
      lines = [
        given("_R1", r1),
        given("_R2", r2),
        given("_R3", r3),
        step("_R_ser", "_R1 + _R2", `${num(s)} Ω`),
        step("_R_total", "(_R_ser * _R3) / (_R_ser + _R3)", final(exact, true, unit)),
      ];
      candidates = [r1 + r2 + r3, r1 + (r2 * r3) / (r2 + r3), 1 / s + 1 / r3, (s + r3) / 2];
      hints = [
        "Work from the inside out: add the series pair first, then combine that total in parallel with the third resistor.",
        `Series pair: \`${r1} + ${r2} = ${s}\` Ω.`,
        `Parallel with ${r3} Ω (product over sum): \`R = (${s} × ${r3}) / (${s} + ${r3})\` (in the calculator: \`((_R1 + _R2) * _R3) / (_R1 + _R2 + _R3)\`). Then round to 2 decimal places.`,
      ];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { formula: kind, values, rounded }, given: givenRows(gv), hints };
  const q = finish(base, exact, rounded, candidates, rng);
  // Medium also asks for a missing parallel resistor, n equal resistors, or three in parallel (ticket 014:
  // the pair alone was thin). This draw comes after all the pair's draws, so other seeds are unchanged.
  if (difficulty === "medium" && rng.next() < 0.5) return parallelExtra(rng, values.a, values.b);
  return q;
}

// Medium extras. Every answer is a whole number of ohms.
function parallelExtra(rng, a, b) {
  const unit = "Ω";
  const kind = rng.pick(["parallel-missing", "parallel-equal", "parallel-three"]);
  let prompt, exact, intro, lines, candidates, values, gv, hints;
  if (kind === "parallel-missing") {
    const t = (a * b) / (a + b);
    exact = b;
    values = { a, total: t };
    prompt = `A ${a} Ω resistor is connected in parallel with a second resistor. Their combined resistance is ${t} Ω. What is the resistance of the second resistor, in Ω?`;
    intro = "In parallel the conductances (1 / R) add: `1/R_total = 1/R1 + 1/R2`, so `1/R2 = 1/R_total - 1/R1`. Flip the result at the end.";
    gv = [["_R1", a], ["_R_total", t]];
    lines = [given("_R1", a), given("_R_total", t), step("_R2", "1 / (1/_R_total - 1/_R1)", final(exact, false, unit))];
    candidates = [a - t, a + t, (a * t) / (a + t), a * t];
    hints = [
      "For resistors in parallel, `1/R_total = 1/R1 + 1/R2`. Rearrange it for the unknown: `1/R2 = 1/R_total - 1/R1`.",
      `Work out \`1/${t} - 1/${a}\`, then flip it (1 divided by the result) to get R2 (in the calculator: \`1 / (1/_R_total - 1/_R1)\`).`,
    ];
  } else if (kind === "parallel-equal") {
    const n = rng.int(2, 6);
    const R = n * rng.int(1, 30) * rng.pick([1, 1, 10]);
    exact = R / n;
    values = { n, R };
    prompt = `${["", "", "Two", "Three", "Four", "Five", "Six"][n]} identical ${R} Ω resistors are connected in parallel. What is their combined resistance, in Ω?`;
    intro = `For n identical resistors in parallel, \`R_total = R / n\`: each extra path shares the current.`;
    gv = [["_R", R], ["_n", n]];
    lines = [given("_R", R), given("_n", n), step("_R_total", "_R / _n", final(exact, false, unit))];
    candidates = [R * n, R, R + n, R / (n + 1)];
    hints = [
      `${n} equal paths: \`1/R_total = 1/${R} + … + 1/${R}\` (${n} times), which is ${n}/${R}.`,
      `Flip it: \`R_total = ${R} / ${n}\` (in the calculator: \`_R / _n\`).`,
    ];
  } else {
    let r = null;
    for (let i = 0; i < 400 && !r; i++) {
      const x = rng.int(2, 60), y = rng.int(2, 60), z = rng.int(2, 60);
      if ((x * y * z) % (x * y + y * z + z * x) === 0) r = [x, y, z];
    }
    const [x, y, z] = r || rng.pick([[6, 12, 12], [10, 15, 30], [12, 24, 24], [20, 30, 60], [6, 6, 6], [4, 6, 12]]);
    exact = (x * y * z) / (x * y + y * z + z * x);
    values = { rs: [x, y, z] };
    prompt = `Three resistors of ${x} Ω, ${y} Ω and ${z} Ω are connected in parallel. What is their combined resistance, in Ω?`;
    intro = "In parallel the conductances add: `1/R_total = 1/R1 + 1/R2 + 1/R3`. Flip the sum at the end.";
    gv = [["_R1", x], ["_R2", y], ["_R3", z]];
    lines = [given("_R1", x), given("_R2", y), given("_R3", z), step("_R_total", "1 / (1/_R1 + 1/_R2 + 1/_R3)", final(exact, false, unit))];
    candidates = [x + y + z, (x + y + z) / 3, (x * y) / (x + y), Math.min(x, y, z)];
    hints = [
      "For resistors in parallel add the conductances: `1/R_total = 1/R1 + 1/R2 + 1/R3`. The answer is smaller than the smallest resistor.",
      `Work out \`1/${x} + 1/${y} + 1/${z}\`, then flip it (in the calculator: \`1 / (1/_R1 + 1/_R2 + 1/_R3)\`).`,
    ];
  }
  const base = { prompt, explanation: explain(intro, lines), params: { formula: kind, values, rounded: false }, given: givenRows(gv), hints };
  return finish(base, exact, false, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Expert level: a separate branch. generate() sends "expert" here before any other code runs, so
// easy/medium/hard draw exactly the same rng values as before. Expert questions are multi-part,
// state the rounding on every part, and keep their inputs in params.v with params.kind "x-…".
// verify() recomputes the true values a different way (a Kirchhoff loop or nodal equation solved
// by bisection, energy per second instead of per run) and compares each part. Hint code never calls rng.

// Round half away from zero to dp decimals; never "-0".
function xr(n, dp) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// Display form for stated values and working: up to 4 decimals.
const xs = (n) => String(xr(n, 4));
// True when n sits within 2% of a unit of a rounding tie at dp decimals.
function xTie(n, dp) {
  const f = Math.abs(n) * 10 ** dp;
  return Math.abs(f - Math.floor(f) - 0.5) < 0.02;
}
const xDpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);

// A rounded numeric part (accepted within half a unit of the stated precision).
const xNum = (id, label, ask, exact, dp, hint) => ({
  id, label, ask: `${ask}, ${xDpWord(dp)}`, answerType: "number", answer: xr(exact, dp), tolerance: 0.5 * 10 ** -dp, hint, _exact: exact, _dp: dp,
});
// A choice part.
const xChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });

// Assemble a multi-part question. Returns null (regenerate) on a rounding tie, a zero or
// non-finite answer, a given value equal to an answer, or NaN/undefined in the text.
// "a 8 kg" -> "an 8 kg" (eight, eleven, eighteen, eighty... start with a vowel sound).
function xArticles(text) {
  return text.replace(/\b([Aa]n?) (\d+)/g, (all, art, digits) => {
    const vowel = digits[0] === "8" || (digits.length % 3 === 2 && /^1[18]/.test(digits));
    return `${art[0] === "A" ? (vowel ? "An" : "A") : vowel ? "an" : "a"} ${digits}`;
  });
}

function xMulti({ kind, v, prompt, parts, steps, given, hints }) {
  prompt = xArticles(prompt);
  const dp = {};
  const out = [];
  for (const p of parts) {
    const { _exact, _dp, ...part } = p;
    part.id = part.id.toLowerCase(); // ids must match ^[a-z0-9-]+$
    if (part.answerType === "number") {
      if (!Number.isFinite(_exact) || part.answer === 0) return null;
      if (_dp === null ? !Number.isInteger(_exact) : xTie(_exact, _dp)) return null;
      if (given.some(([, g]) => Math.abs(g - part.answer) < 1e-9)) return null;
      dp[part.id] = _dp;
    } else {
      if (!part.choices.includes(part.answer) || new Set(part.choices).size !== part.choices.length) return null;
      dp[part.id] = "choice";
    }
    out.push(part);
  }
  const text = [prompt, ...steps, ...hints, ...out.map((p) => `${p.ask} ${p.hint} ${p.answer}`)].join(" ");
  if (/NaN|undefined|Infinity/.test(text)) return null;
  return {
    prompt,
    answerType: "multi",
    parts: out,
    explanation: steps.join("\n\n"),
    params: { kind, v, dp },
    given: given.map(([label, value]) => ({ label, value })),
    hints,
  };
}

// Bisection: a root of f between lo and hi (f must change sign), else NaN.
function xRoot(f, lo, hi) {
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || Math.sign(fa) === Math.sign(fb)) return NaN;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

// Check every part against the independently recomputed truth { partId: number | string }.
function xVerify(question, answer, truthFns) {
  const p = question.params;
  const fn = truthFns[p.kind];
  if (!fn || !p.v || !p.dp) return false;
  if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
  let truth;
  try {
    truth = fn(p.v);
  } catch {
    return false;
  }
  if (truth) truth = Object.fromEntries(Object.entries(truth).map(([k, x]) => [k.toLowerCase(), x]));
  if (!truth || Object.keys(truth).length !== question.parts.length) return false;
  for (const part of question.parts) {
    if (!(part.id in truth)) return false;
    const want = truth[part.id];
    const got = answer[part.id];
    if (typeof want === "string") {
      const ch = part.choices;
      if (!Array.isArray(ch) || new Set(ch).size !== ch.length || !ch.includes(String(got)) || String(got) !== want) return false;
      continue;
    }
    if (got === "" || got === null || got === undefined || typeof got === "boolean" || typeof got === "object") return false;
    const x = Number(got);
    if (!Number.isFinite(x) || !Number.isFinite(want)) return false;
    const dp = p.dp[part.id];
    if (dp === null) {
      if (Math.abs(x - want) > 1e-9 * Math.max(1, Math.abs(want))) return false;
    } else if (typeof dp !== "number" || Math.abs(x - want) > 0.5 * 10 ** -dp + 1e-9) return false;
  }
  return true;
}

// Retry a template until it returns a question (deterministic: only the rng passed in).
function xTry(make, rng) {
  for (let i = 0; i < 80; i++) {
    const q = make(rng);
    if (q) return q;
  }
  throw new Error("Expert: could not generate a question");
}

const X_UNROUNDED = "Use unrounded values from earlier parts.";

// ohms-law / expert: a cell with internal resistance; current, terminal voltage and lost volts.
function xEmf(rng) {
  const src = rng.pick([["A battery", 30, 240], ["A cell", 12, 30], ["A power pack", 20, 200], ["A car battery", 120, 130]]);
  const emf = rng.int(src[1], src[2]) / 10;
  const r = rng.int(1, 30) / 10;
  const R = rng.int(10, 500) / 10;
  const I = emf / (R + r);
  const Vt = I * R;
  const lost = I * r;
  return xMulti({
    kind: "x-emf",
    v: { emf, r, R },
    prompt: `${src[0]} has an emf of ${xs(emf)} V and an internal resistance of ${xs(r)} Ω. It is connected to a ${xs(R)} Ω resistor. ${X_UNROUNDED}`,
    parts: [
      xNum("I", "Current", "Current in the circuit, in A", I, 3, "The internal resistance is in series with the resistor: the emf drives current through both."),
      xNum("Vt", "Terminal voltage", "Voltage across the resistor (terminal voltage), in V", Vt, 2, "Ohm's law for the resistor alone: V = I × R."),
      xNum("lost", "Lost volts", "Voltage lost inside the source, in V", lost, 2, "The lost volts are I × r, or emf - terminal voltage."),
    ],
    steps: [
      `Total resistance: \`_R + _rint\` → ${xs(R + r)} Ω. \`_I = _emf / (_R + _rint)\` → ${xs(I)}, which rounds to **${xr(I, 3)} A**.`,
      `\`_I * _R\` → ${xs(Vt)}, which rounds to **${xr(Vt, 2)} V**.`,
      `\`_I * _rint\` → ${xs(lost)}, which rounds to **${xr(lost, 2)} V**. Check: ${xs(Vt)} + ${xs(lost)} = ${xs(emf)} V, the emf.`,
    ],
    given: [["_emf", emf], ["_rint", r], ["_R", R]],
    hints: [
      "Think of the internal resistance as a small resistor inside the source, in series with the outside resistor.",
      "The emf divided by the total resistance (outside + inside) gives the current.",
      "The voltage across each resistance is I × that resistance; together they add up to the emf.",
    ],
  });
}

// ohms-law / expert: design a potential divider (work back to R2), then its current.
function xDivider(rng) {
  const Vin = rng.pick([5, 6, 9, 12, 15, 24]);
  const R1 = rng.int(10, 470) / 10; // kΩ
  const Vout = rng.int(5, Vin * 10 - 5) / 10;
  const R2 = (R1 * Vout) / (Vin - Vout);
  const ImA = Vin / (R1 + R2);
  if (R2 > 2000 || R2 < 0.1) return null;
  return xMulti({
    kind: "x-divider",
    v: { Vin, R1, Vout },
    prompt: `A potential divider has a fixed ${xs(R1)} kΩ resistor R1 in series with a resistor R2, across a ${Vin} V supply. The output is taken across R2 and must be ${xs(Vout)} V. ${X_UNROUNDED}`,
    parts: [
      xNum("R2", "R2", "Resistance R2, in kΩ", R2, 2, "The same current flows through both resistors, so the voltages are in the same ratio as the resistances."),
      xNum("I", "Current", "Current through the divider, in mA", ImA, 3, "Use R1: the voltage across it is the supply minus the output. Volts ÷ kΩ gives mA."),
    ],
    steps: [
      `Voltage across R1: \`_Vin - _Vout\` → ${xs(Vin - Vout)} V.`,
      `Same current, so \`R2 / R1 = Vout / (Vin - Vout)\`: \`_R2 = _R1 * _Vout / (_Vin - _Vout)\` → ${xs(R2)}, which rounds to **${xr(R2, 2)} kΩ**.`,
      `\`(_Vin - _Vout) / _R1\` → ${xs(ImA)}, which rounds to **${xr(ImA, 3)} mA** (V ÷ kΩ = mA).`,
    ],
    given: [["_Vin", Vin], ["_R1", R1], ["_Vout", Vout]],
    hints: [
      "Work backwards from the output. The supply voltage is shared between R1 and R2.",
      "In series the current is the same, so V ÷ R is the same for both resistors: voltages are in the ratio of the resistances.",
      "Find the voltage across R1 first, then set `(_Vin - _Vout) / _R1` equal to `_Vout / R2`.",
    ],
  });
}

// ohms-law / expert: the current rises by a known amount when the voltage is raised; find R and the currents.
function xDelta(rng) {
  const R = rng.int(20, 2000) / 2;
  const V1 = rng.int(10, 120) / 10;
  const V2 = xr(V1 + rng.int(5, 120) / 10, 1);
  const dmA = ((V2 - V1) / R) * 1000;
  const dShown = xr(dmA, 2);
  const Rr = ((V2 - V1) / dShown) * 1000;
  const I1 = (V1 / Rr) * 1000;
  const I2 = (V2 / Rr) * 1000;
  return xMulti({
    kind: "x-delta",
    v: { V1, V2, dmA: dShown },
    prompt: `When the voltage across a resistor is raised from ${xs(V1)} V to ${xs(V2)} V, the current rises by ${xs(dShown)} mA. The resistor obeys Ohm's law. ${X_UNROUNDED}`,
    parts: [
      xNum("R", "Resistance", "Resistance, in Ω", Rr, 1, "For an ohmic resistor the change in voltage ÷ change in current is the resistance. Convert mA to A."),
      xNum("I1", "Current before", "Current at the lower voltage, in mA", I1, 2, "Ohm's law at the lower voltage: I = V ÷ R."),
      xNum("I2", "Current after", "Current at the higher voltage, in mA", I2, 2, "Either use Ohm's law again or add the rise to the first current."),
    ],
    steps: [
      `\`R = ΔV / ΔI\`: \`_R = (_V2 - _V1) / (_dI / 1000)\` → ${xs(Rr)}, which rounds to **${xr(Rr, 1)} Ω**.`,
      `\`_V1 / _R * 1000\` → ${xs(I1)}, which rounds to **${xr(I1, 2)} mA**.`,
      `\`_V2 / _R * 1000\` → ${xs(I2)}, which rounds to **${xr(I2, 2)} mA**.`,
    ],
    given: [["_V1", V1], ["_V2", V2], ["_dI", dShown]],
    hints: [
      "You don't know either current, only the change. For a resistor that obeys Ohm's law, the change in V ÷ the change in I is also R.",
      "Convert the change in current from mA to A before dividing.",
      "With R known, use I = V ÷ R at each voltage, then convert A to mA.",
    ],
  });
}

// [name, min W, max W, most hours a day it plausibly runs]
const X_APPLIANCES = [
  ["a toaster", 800, 1500, 1], ["a microwave", 600, 1200, 1], ["a hair dryer", 1000, 2200, 1], ["a games console", 100, 250, 6],
  ["a fan heater", 1500, 2900, 8], ["a lamp", 20, 100, 12], ["a laptop charger", 45, 140, 10], ["an iron", 1100, 2600, 2], ["a fridge", 80, 200, 12],
];
const X_FUSES = [3, 5, 13];

// power / expert: current at 230 V, the right fuse, and the running cost.
function xFuse(rng) {
  const [what, lo, hi, maxH] = rng.pick(X_APPLIANCES);
  const P = rng.int(lo / 10, hi / 10) * 10;
  const V = 230;
  const I = P / V;
  if (X_FUSES.some((f) => Math.abs(I - f) < 0.15 * f)) return null; // keep clear of a rating
  const fuse = `${X_FUSES.find((f) => f > I)} A`;
  // 0.5 h steps from 1 h; a draw above the daily maximum wraps round into range (same rng draw).
  const q2 = rng.int(2, 40);
  const hours = (q2 > maxH * 2 ? ((q2 - 2) % (maxH * 2 - 1)) + 2 : q2) / 2;
  const days = rng.pick([7, 30, 31, 90, 365]);
  const price = rng.int(10, 45) / 100;
  const cost = (P / 1000) * hours * days * price;
  return xMulti({
    kind: "x-fuse",
    v: { P, V, hours, days, price },
    prompt: `${what[0].toUpperCase() + what.slice(1)} is rated ${P} W on the ${V} V mains. Fuses come in 3 A, 5 A and 13 A. It is used for ${xs(hours)} ${hours === 1 ? "hour" : "hours"} a day for ${days} days, and electricity costs ${cash(price)} per kWh. ${X_UNROUNDED}`,
    parts: [
      xNum("I", "Current", "Current it draws, in A", I, 2, "P = V × I, so I = P ÷ V."),
      xChoice("fuse", "Fuse", "Which fuse should it have?", fuse, ["3 A", "5 A", "13 A"], "Choose the smallest fuse rated above the normal current: big enough not to blow in normal use, small enough to blow on a fault."),
      xNum("cost", "Cost", "Running cost over the whole period, in $", cost, 2, "Energy in kWh = power in kW × hours of use. Then multiply by the price per kWh."),
    ],
    steps: [
      `\`_I = _P / _V\` → ${xs(I)}, which rounds to **${xr(I, 2)} A**.`,
      `The smallest fuse above ${xs(I)} A is **${fuse}**. A smaller one would blow in normal use; a bigger one gives less protection.`,
      `Energy: \`_P / 1000 * _hours * _days\` → ${xs((P / 1000) * hours * days)} kWh. Cost: \`× _price\` → ${xs(cost)}, which rounds to **$${xr(cost, 2).toFixed(2)}**.`,
    ],
    given: [["_P", P], ["_V", V], ["_hours", hours], ["_days", days], ["_price", price]],
    hints: [
      "Start with the current from `P = V × I`.",
      "A fuse must carry the normal current without blowing, but should be as small as possible.",
      "For the cost: convert W to kW, multiply by the total hours of use to get kWh, then by the price.",
    ],
  });
}

// power / expert: a kettle heating water (specific heat capacity) with an efficiency.
function xKettle(rng) {
  const P = rng.int(18, 30) * 100;
  const eff = rng.int(70, 95);
  const m = rng.int(5, 17) / 10;
  const T1 = rng.int(8, 25);
  const c = 4200;
  const Q = m * c * (100 - T1);
  const t = Q / ((P * eff) / 100);
  const I = P / 230;
  return xMulti({
    kind: "x-kettle",
    v: { P, eff, m, T1 },
    prompt: `A ${P} W kettle on the 230 V mains is ${eff}% efficient. It heats ${xs(m)} kg of water from ${T1} °C to boiling (100 °C). The specific heat capacity of water is 4200 J/(kg °C). ${X_UNROUNDED}`,
    parts: [
      xNum("Q", "Energy for the water", "Energy the water must gain, in kJ", Q / 1000, 1, "Q = m × c × temperature rise. Divide J by 1000 for kJ."),
      xNum("t", "Time", "Time to reach boiling, in s", t, 1, `Only ${eff}% of the electrical power heats the water.`),
      xNum("I", "Current", "Current the kettle draws, in A", I, 2, "P = V × I with the kettle's rated power."),
    ],
    steps: [
      `\`_Q = _m * 4200 * (100 - _T1)\` → ${xs(Q)} J, which is **${xr(Q / 1000, 1)} kJ**.`,
      `Useful power: \`_P * _eff / 100\` → ${xs((P * eff) / 100)} W. \`_Q / (_P * _eff / 100)\` → ${xs(t)}, which rounds to **${xr(t, 1)} s**.`,
      `\`_P / 230\` → ${xs(I)}, which rounds to **${xr(I, 2)} A**.`,
    ],
    given: [["_P", P], ["_eff", eff], ["_m", m], ["_T1", T1]],
    hints: [
      "The energy the water needs depends only on its mass, the specific heat capacity and the temperature rise.",
      "The kettle wastes some energy, so the useful heating power is the efficiency × the electrical power.",
      "Time = energy needed ÷ useful power.",
    ],
  });
}

// power / expert: power lost in a transmission cable; why high voltage helps.
function xCable(rng) {
  const P = rng.int(10, 500); // kW delivered
  const V = rng.pick([400, 690, 1000, 3300, 6600, 11000]);
  const R = rng.int(5, 200) / 100;
  const I = (P * 1000) / V;
  const loss = I * I * R;
  const pct = (100 * loss) / (P * 1000);
  if (pct > 30 || pct < 0.01) return null;
  return xMulti({
    kind: "x-cable",
    v: { P, V, R },
    prompt: `A generator sends ${P} kW at ${V} V along a cable with a total resistance of ${xs(R)} Ω. ${X_UNROUNDED}`,
    parts: [
      xNum("I", "Current", "Current in the cable, in A", I, 2, "P = V × I with P in watts."),
      xNum("loss", "Power lost", "Power wasted heating the cable, in W", loss, 1, "The cable's own heating is I² × R. Don't use the supply voltage here: it is not across the cable."),
      xNum("pct", "Percentage lost", "Power lost as a percentage of the power sent", pct, 2, "Divide the power lost by the power sent (in W) and multiply by 100."),
    ],
    steps: [
      `\`_I = _P * 1000 / _V\` → ${xs(I)}, which rounds to **${xr(I, 2)} A**.`,
      `\`_I^2 * _R\` → ${xs(loss)}, which rounds to **${xr(loss, 1)} W**.`,
      `\`_I^2 * _R / (_P * 1000) * 100\` → ${xs(pct)}, which rounds to **${xr(pct, 2)}%**.`,
      `Doubling the voltage would halve the current and cut this loss to a quarter: that is why the grid uses high voltages.`,
    ],
    given: [["_P", P], ["_V", V], ["_R", R]],
    hints: [
      "The power sent fixes the current: I = P ÷ V, with kW converted to W.",
      "The wasted power is the heating in the cable, I² × R. Using V²/R with the supply voltage would be wrong: that voltage is not across the cable.",
      "Compare the loss with the power sent to get the percentage.",
    ],
  });
}

// series-parallel / expert: R1 in series with R2 ∥ R3; total resistance, supply current, current in R2.
function xNetwork(rng) {
  const V = rng.int(30, 240) / 10;
  const R1 = rng.int(1, 100);
  const R2 = rng.int(2, 120);
  let R3;
  do R3 = rng.int(2, 120);
  while (R3 === R2);
  const Rp = (R2 * R3) / (R2 + R3);
  const Rt = R1 + Rp;
  const I = V / Rt;
  const I2 = (I * R3) / (R2 + R3);
  return xMulti({
    kind: "x-network",
    v: { V, R1, R2, R3 },
    prompt: `A ${xs(V)} V supply is connected to R1 = ${R1} Ω in series with a parallel pair, R2 = ${R2} Ω and R3 = ${R3} Ω. ${X_UNROUNDED}`,
    parts: [
      xNum("Rt", "Total resistance", "Total resistance, in Ω", Rt, 2, "Combine the parallel pair first (product over sum), then add R1."),
      xNum("I", "Supply current", "Current from the supply, in A", I, 3, "Supply voltage ÷ total resistance."),
      xNum("I2", "Current in R2", "Current through R2, in A", I2, 3, "Find the voltage across the parallel pair (supply minus the voltage across R1), then use Ohm's law for R2."),
    ],
    steps: [
      `\`_Rp = _R2 * _R3 / (_R2 + _R3)\` → ${xs(Rp)} Ω; \`_Rt = _R1 + _Rp\` → ${xs(Rt)}, which rounds to **${xr(Rt, 2)} Ω**.`,
      `\`_I = _V / _Rt\` → ${xs(I)}, which rounds to **${xr(I, 3)} A**.`,
      `Voltage across the pair: \`_V - _I * _R1\` → ${xs(V - I * R1)} V. \`(_V - _I * _R1) / _R2\` → ${xs(I2)}, which rounds to **${xr(I2, 3)} A**.`,
      `Check: R3 carries ${xs(I - I2)} A, and the two branch currents add up to the supply current.`,
    ],
    given: [["_V", V], ["_R1", R1], ["_R2", R2], ["_R3", R3]],
    hints: [
      "Work from the inside out: replace the parallel pair by a single resistance first.",
      "All of the supply current flows through R1, then it splits between R2 and R3.",
      "The parallel resistors share the same voltage: the supply voltage minus the voltage across R1.",
    ],
  });
}

// series-parallel / expert: which resistor in parallel gives a target total? Then its current.
function xFindR(rng) {
  const R1 = rng.int(10, 200);
  const Rt = rng.int(Math.ceil(R1 * 0.2), R1 - 2);
  const Rx = (R1 * Rt) / (R1 - Rt);
  if (Rx > 5000) return null;
  const V = rng.int(30, 240) / 10;
  const Ix = V / Rx;
  return xMulti({
    kind: "x-findr",
    v: { R1, Rt, V },
    prompt: `A ${R1} Ω resistor is in a circuit, but the design needs a resistance of ${Rt} Ω there. An extra resistor Rx is connected in parallel with it, and the pair is placed across a ${xs(V)} V supply. ${X_UNROUNDED}`,
    parts: [
      xNum("Rx", "Rx", "Resistance Rx needed, in Ω", Rx, 2, "Use the reciprocal rule: 1/R_total = 1/R1 + 1/Rx, and rearrange for 1/Rx."),
      xNum("Ix", "Current in Rx", "Current through Rx, in A", Ix, 3, "Each resistor in parallel has the full supply voltage across it."),
      xNum("I", "Total current", "Total current from the supply, in A", V / Rt, 3, "Supply voltage ÷ the combined resistance."),
    ],
    steps: [
      `\`1/Rx = 1/_Rt - 1/_R1\`, so \`_Rx = 1 / (1/_Rt - 1/_R1)\` → ${xs(Rx)}, which rounds to **${xr(Rx, 2)} Ω**.`,
      `\`_V / _Rx\` → ${xs(Ix)}, which rounds to **${xr(Ix, 3)} A**.`,
      `\`_V / _Rt\` → ${xs(V / Rt)}, which rounds to **${xr(V / Rt, 3)} A**. Check: the ${R1} Ω resistor carries ${xs(V / R1)} A, and the two branch currents add up to this.`,
    ],
    given: [["_R1", R1], ["_Rt", Rt], ["_V", V]],
    hints: [
      "Adding a resistor in parallel lowers the total, which is why this works. Work backwards with reciprocals.",
      "`1/_Rt = 1/_R1 + 1/Rx`: subtract to find 1/Rx, then take the reciprocal.",
      "In parallel, every branch has the full supply voltage across it.",
    ],
  });
}

// series-parallel / expert: two resistors in series and then in parallel on the same supply; compare powers.
function xLamps(rng) {
  const what = rng.pick(["heating elements", "lamps", "resistors", "heater coils"]);
  const V = rng.pick([6, 9, 12, 24, 230]);
  const scale = V === 230 ? 10 : 1;
  const R1 = rng.int(2, 60) * scale;
  let R2;
  do R2 = rng.int(2, 60) * scale;
  while (R2 === R1);
  const Is = V / (R1 + R2);
  const Pser = V * Is;
  const Pr1 = Is * Is * R1;
  const Ppar = (V * V) / ((R1 * R2) / (R1 + R2));
  return xMulti({
    kind: "x-lamps",
    v: { V, R1, R2 },
    prompt: `Two ${what}, R1 = ${R1} Ω and R2 = ${R2} Ω, are connected to a ${V} V supply, first in series and then in parallel. Treat their resistances as constant. ${X_UNROUNDED}`,
    parts: [
      xNum("Pser", "Series power", "Total power in series, in W", Pser, 2, "In series: add the resistances, find the current, then P = V × I."),
      xNum("Pr1", "R1 in series", "Power in R1 when in series, in W", Pr1, 2, "P = I² × R for R1 alone, with the series current."),
      xNum("Ppar", "Parallel power", "Total power in parallel, in W", Ppar, 2, "In parallel each one has the full supply voltage: P = V² ÷ R for each, then add (or use the combined resistance)."),
    ],
    steps: [
      `Series: \`_Is = _V / (_R1 + _R2)\` → ${xs(Is)} A. \`_V * _Is\` → ${xs(Pser)}, which rounds to **${xr(Pser, 2)} W**.`,
      `\`_Is^2 * _R1\` → ${xs(Pr1)}, which rounds to **${xr(Pr1, 2)} W**.`,
      `Parallel: \`_V^2 / (_R1 * _R2 / (_R1 + _R2))\` → ${xs(Ppar)}, which rounds to **${xr(Ppar, 2)} W**, far more than in series.`,
    ],
    given: [["_V", V], ["_R1", R1], ["_R2", R2]],
    hints: [
      "In series the current is shared and the total resistance is bigger; in parallel each one gets the full voltage.",
      "For the series parts, find the single series current first.",
      "For parallel, `V² ÷ R` for each, added together, equals `V² ÷ (combined resistance)`.",
    ],
  });
}

function genExpert(subtopic, rng) {
  const pick = (list) => list[rng.int(0, list.length - 1)];
  if (subtopic === "ohms-law") return xTry(pick([xEmf, xDivider, xDelta]), rng);
  if (subtopic === "power") return xTry(pick([xFuse, xKettle, xCable]), rng);
  if (subtopic === "series-parallel") return xTry(pick([xNetwork, xFindR, xLamps]), rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent truth for verify: Kirchhoff's loop or a nodal equation solved by bisection, energy per
// second instead of per run, summed branch powers instead of a combined resistance.
const X_TRUTH = {
  "x-emf": ({ emf, r, R }) => {
    const I = xRoot((i) => emf - i * r - i * R, 0, 1e4);
    return { I, Vt: emf - I * r, lost: I * r };
  },
  "x-divider": ({ Vin, R1, Vout }) => {
    const R2 = xRoot((x) => (Vin * x) / (R1 + x) - Vout, 1e-9, 1e7);
    return { R2, I: Vout / R2 };
  },
  "x-delta": ({ V1, V2, dmA }) => {
    const R = xRoot((x) => ((V2 - V1) / x) * 1000 - dmA, 1e-6, 1e9);
    return { R, I1: (V1 * 1000) / R, I2: (V1 * 1000) / R + dmA };
  },
  "x-fuse": ({ P, V, hours, days, price }) => {
    const I = xRoot((i) => V * i - P, 0, 1e4);
    let fuse = null;
    for (const f of [3, 5, 13]) if (fuse === null && f >= I) fuse = `${f} A`;
    const joules = P * hours * 3600 * days;
    return { I, fuse, cost: (joules / 3.6e6) * price };
  },
  "x-kettle": ({ P, eff, m, T1 }) => {
    const rate = (P * eff) / 100 / (m * 4200); // °C per second
    return { Q: (m * 4200 * (100 - T1)) / 1000, t: (100 - T1) / rate, I: xRoot((i) => 230 * i - P, 0, 1e4) };
  },
  "x-cable": ({ P, V, R }) => {
    const I = xRoot((i) => V * i - P * 1000, 0, 1e7);
    const drop = I * R; // voltage across the cable
    const loss = (drop * drop) / R;
    return { I, loss, pct: (loss / (P * 1000)) * 100 };
  },
  // Nodal: (V - Vn)/R1 = Vn/R2 + Vn/R3.
  "x-network": ({ V, R1, R2, R3 }) => {
    const Vn = xRoot((x) => (V - x) / R1 - x / R2 - x / R3, 0, V);
    const I = (V - Vn) / R1;
    return { Rt: V / I, I, I2: Vn / R2 };
  },
  "x-findr": ({ R1, Rt, V }) => {
    const Rx = xRoot((x) => 1 / R1 + 1 / x - 1 / Rt, 1e-6, 1e9);
    return { Rx, Ix: V / Rx, I: V / R1 + V / Rx };
  },
  "x-lamps": ({ V, R1, R2 }) => {
    const I = xRoot((i) => V - i * R1 - i * R2, 0, 1e4);
    return { Pser: I * I * R1 + I * I * R2, Pr1: I * I * R1, Ppar: (V * V) / R1 + (V * V) / R2 };
  },
};

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "ohms-law") return genOhm(difficulty, rng);
  if (subtopic === "power") return genPower(difficulty, rng);
  if (subtopic === "series-parallel") return genCircuit(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: substitute the answer back into the defining relation and look at the residual.
// For rounded answers the allowed residual is 0.005 × (how strongly the relation reacts to the unknown).
export function verify(question, answer) {
  const p = question && question.params;
  if (p && typeof p.kind === "string" && p.kind.startsWith("x-")) return xVerify(question, answer, X_TRUTH);
  if (!p || !p.values) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x) || !(x > 0)) return false;

  const k = { ...p.values, [p.unknown]: x };
  let residual, sens;
  switch (p.formula) {
    case "ohm": // V = I·R
      residual = k.I * k.R - k.V;
      sens = p.unknown === "I" ? k.R : p.unknown === "R" ? k.I : 1;
      break;
    case "vi": // P = V·I
      residual = k.V * k.I - k.P;
      sens = p.unknown === "I" ? k.V : p.unknown === "V" ? k.I : 1;
      break;
    case "i2r": // P = I²·R
      residual = k.I * k.I * k.R - k.P;
      sens = p.unknown === "I" ? 2 * x * k.R : 1;
      break;
    case "v2r": // P·R = V²
      residual = k.P * k.R - k.V * k.V;
      sens = p.unknown === "P" ? k.R : k.P;
      break;
    case "energy": // 1000·E = P·h·days
      residual = 1000 * x - k.P * k.hours * k.days;
      sens = 1000;
      break;
    case "cost": // 1000·C = P·h·days·price
      residual = 1000 * x - k.P * k.hours * k.days * k.price;
      sens = 1000;
      break;
    case "series":
      residual = x - k.rs.reduce((s, r) => s + r, 0);
      sens = 1;
      break;
    case "series-missing":
      residual = x + k.rs.reduce((s, r) => s + r, 0) - k.total;
      sens = 1;
      break;
    case "parallel": { // x · (1/a + 1/b) = 1
      const g = 1 / k.a + 1 / k.b;
      residual = x * g - 1;
      sens = g;
      break;
    }
    case "parallel-missing": { // x · (1/total - 1/a) = 1
      const g = 1 / k.total - 1 / k.a;
      residual = x * g - 1;
      sens = g;
      break;
    }
    case "parallel-equal": // x · n = R
      residual = x * k.n - k.R;
      sens = k.n;
      break;
    case "parallel-three": { // x · Σ(1/r) = 1
      const g = k.rs.reduce((s, r) => s + 1 / r, 0);
      residual = x * g - 1;
      sens = g;
      break;
    }
    case "s+p": { // (x - r1) · (1/r2 + 1/r3) = 1
      const g = 1 / k.r2 + 1 / k.r3;
      residual = (x - k.r1) * g - 1;
      sens = g;
      break;
    }
    case "p-of-s": { // x · (1/(r1 + r2) + 1/r3) = 1
      const g = 1 / (k.r1 + k.r2) + 1 / k.r3;
      residual = x * g - 1;
      sens = g;
      break;
    }
    default:
      return false;
  }
  if (!Number.isFinite(residual) || !(sens > 0)) return false;
  // The slack is scaled by sens too, so small conductances (1/Ω) don't loosen the check.
  if (p.rounded) return Math.abs(residual) <= (0.005 + 1e-7) * sens;
  return Number.isInteger(x) && Math.abs(residual) <= 1e-9 * Math.max(1, sens);
}
