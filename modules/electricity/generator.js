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

// ---------------------------------------------------------------------------------------------
// Ohm's law: V = I × R. Medium works in mA and kΩ (mA × kΩ = V).

function genOhm(difficulty, rng) {
  checkDifficulty(difficulty);
  const rounded = difficulty === "hard";
  const unknown = rng.pick(["V", "I", "R"]);
  const dev = rng.pick(DEVICES);
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
  let prompt, exact, unit, intro, lines, candidates;
  if (unknown === "V") {
    exact = I * R;
    unit = "V";
    prompt = `A current of ${num(I)} ${uI} flows through ${dev} with a resistance of ${num(R)} ${uR}. What is the voltage across it, in V?${end}`;
    intro = "Use Ohm's law: `V = I × R`." + (milli ? " Convert to amps and ohms first." : "");
    lines = [given("_I", toA(I)), given("_R", toOhm(R)), step("_V", "_I * _R", final(exact, rounded, unit))];
    candidates = [I / R, R / I, I + R];
  } else if (unknown === "I") {
    exact = V / R;
    unit = uI;
    prompt = `A voltage of ${num(V)} V is applied across ${dev} with a resistance of ${num(R)} ${uR}. What current flows, in ${uI}?${end}`;
    intro = "Rearrange Ohm's law to `I = V / R`." + (milli ? " Work in ohms, then convert amps to milliamps (× 1000)." : "");
    lines = [given("_V", V), given("_R", toOhm(R))];
    if (milli) {
      lines.push(step("_I", "_V / _R", `${num(V / toOhm(R))} A`), step("_I_mA", "_I * 1000", final(exact, rounded, unit)));
    } else {
      lines.push(step("_I", "_V / _R", final(exact, rounded, unit)));
    }
    candidates = [V * R, R / V, V - R];
  } else {
    exact = V / I;
    unit = uR;
    prompt = `${dev[0].toUpperCase()}${dev.slice(1)} draws ${num(I)} ${uI} when ${num(V)} V is applied across it. What is its resistance, in ${uR}?${end}`;
    intro = "Rearrange Ohm's law to `R = V / I`." + (milli ? " Work in amps, then convert ohms to kilohms (÷ 1000)." : "");
    lines = [given("_V", V), given("_I", toA(I))];
    if (milli) {
      lines.push(step("_R", "_V / _I", `${num(V / toA(I))} Ω`), step("_R_k", "_R / 1000", final(exact, rounded, unit)));
    } else {
      lines.push(step("_R", "_V / _I", final(exact, rounded, unit)));
    }
    candidates = [V * I, I / V, V - I];
  }

  const values = { V, I, R };
  delete values[unknown];
  const base = { prompt, explanation: explain(intro, lines), params: { formula: "ohm", unknown, values, rounded } };
  return finish(base, exact, rounded, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Power: P = VI, P = I²R, P = V²/R; energy E = Pt (kWh) and cost on hard.

const APPLIANCES = [
  { name: "an electric kettle", W: [1800, 3000] },
  { name: "a space heater", W: [800, 2400] },
  { name: "a desktop computer", W: [150, 450] },
  { name: "a television", W: [60, 250] },
  { name: "a washing machine", W: [500, 2200] },
  { name: "a ceiling fan", W: [40, 90] },
  { name: "a microwave oven", W: [700, 1300] },
  { name: "a fridge", W: [100, 250] },
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
  const dev = rng.pick(DEVICES);
  const end = rounded ? DP2 : "";
  let prompt, exact, unit, intro, lines, candidates, formula, unknown, values;

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
      candidates = [P * V, V / P, P / (V * V), (P / V) * 10];
    } else {
      V = difficulty === "easy" ? rng.int(2, 24) : rng.int(6, 240);
      I = difficulty === "easy" ? rng.int(1, 10) : rng.int(2, 15);
      P = V * I;
      if (kind === "vi-P") {
        unknown = "P";
        exact = P;
        unit = "W";
        values = { V, I };
        prompt = `${dev[0].toUpperCase()}${dev.slice(1)} has ${V} V across it and ${I} A flowing through it. What power does it use, in W?`;
        intro = "Use `P = V × I`.";
        lines = [given("_V", V), given("_I", I), step("_P", "_V * _I", final(exact, false, unit))];
        candidates = [V / I, I / V, V + I];
      } else if (kind === "vi-I") {
        unknown = "I";
        exact = I;
        unit = "A";
        values = { P, V };
        prompt = `${dev[0].toUpperCase()}${dev.slice(1)} uses ${P} W of power with ${V} V across it. What current flows through it, in A?`;
        intro = "Rearrange `P = V × I` to `I = P / V`.";
        lines = [given("_P", P), given("_V", V), step("_I", "_P / _V", final(exact, false, unit))];
        candidates = [P * V, V / P, P - V];
      } else {
        unknown = "V";
        exact = V;
        unit = "V";
        values = { P, I };
        prompt = `${dev[0].toUpperCase()}${dev.slice(1)} uses ${P} W of power while ${I} A flows through it. What is the voltage across it, in V?`;
        intro = "Rearrange `P = V × I` to `V = P / I`.";
        lines = [given("_P", P), given("_I", I), step("_V", "_P / _I", final(exact, false, unit))];
        candidates = [P * I, I / P, P - I];
      }
    }
  } else if (kind === "i2r-P" || kind === "i2r-I") {
    formula = "i2r";
    const I = difficulty === "easy" ? rng.int(1, 6) : rng.int(2, 12);
    const R = difficulty === "easy" ? rng.int(2, 20) : rng.int(2, 60);
    const P = I * I * R;
    if (kind === "i2r-P") {
      unknown = "P";
      exact = P;
      unit = "W";
      values = { I, R };
      prompt = `A current of ${I} A flows through ${dev} with a resistance of ${R} Ω. What power does it use, in W?`;
      intro = "Use `P = I² × R`.";
      lines = [given("_I", I), given("_R", R), step("_P", "_I^2 * _R", final(exact, false, unit))];
      candidates = [I * R, 2 * I * R, I * R * R]; // forgot to square, doubled instead, squared R
    } else {
      unknown = "I";
      exact = I;
      unit = "A";
      values = { P, R };
      prompt = `${dev[0].toUpperCase()}${dev.slice(1)} with a resistance of ${R} Ω uses ${P} W of power. What current flows through it, in A?`;
      intro = "Rearrange `P = I² × R` to `I = √(P / R)`.";
      lines = [given("_P", P), given("_R", R), step("_I", "sqrt(_P / _R)", final(exact, false, unit))];
      candidates = [P / R, P * R, Math.sqrt(P * R)]; // forgot the root, multiplied, root of product
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
    if (kind === "v2r-P") {
      unknown = "P";
      exact = P;
      unit = "W";
      values = { V, R };
      prompt = `A voltage of ${num(V)} V is applied across ${dev} with a resistance of ${num(R)} Ω. What power does it use, in W?${end}`;
      intro = "Use `P = V² / R`.";
      lines = [given("_V", V), given("_R", R), step("_P", "_V^2 / _R", final(exact, rounded, unit))];
      candidates = [V / R, V * V * R, (2 * V) / R]; // forgot to square, multiplied, doubled
    } else {
      unknown = "R";
      exact = (V * V) / P;
      unit = "Ω";
      values = { V, P };
      prompt = `${dev[0].toUpperCase()}${dev.slice(1)} uses ${num(P)} W of power with ${num(V)} V across it. What is its resistance, in Ω?`;
      intro = "Rearrange `P = V² / R` to `R = V² / P`.";
      lines = [given("_V", V), given("_P", P), step("_R", "_V^2 / _P", final(exact, rounded, unit))];
      candidates = [P / (V * V), V / P, P / V];
    }
  } else {
    // Hard: energy in kWh, optionally its cost.
    const a = rng.pick(APPLIANCES);
    const P = 10 * rng.int(a.W[0] / 10, a.W[1] / 10);
    const hours = rng.int(1, 40) / 4; // 0.25 h steps
    const days = rng.int(5, 31);
    const E = (P * hours * days) / 1000;
    const appl = `${a.name[0].toUpperCase()}${a.name.slice(1)}`;
    const setup = `${appl} rated ${P} W runs for ${num(hours)} hours a day for ${days} days.`;
    lines = [given("_P_kW", P / 1000), given("_hours", hours * days)];
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
    } else {
      formula = "cost";
      unknown = "C";
      const price = rng.int(8, 40) / 100;
      exact = E * price;
      unit = "$";
      values = { P, hours, days, price };
      prompt = `${setup} Electricity costs ${cash(price)} per kWh. How much does this cost, in dollars?${end}`;
      intro = "Find the energy in kWh (power in kW × total hours), then multiply by the price per kWh.";
      lines.push(given("_price", price), step("_E", "_P_kW * _hours", `${num(E)} kWh`), step("_cost", "_E * _price", final(exact, rounded, unit)));
      candidates = [P * hours * days * price, ((P * hours) / 1000) * price, E / price];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { formula, unknown, values, rounded } };
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
  let prompt, exact, intro, lines, candidates, kind, values;
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
      candidates = [total - rs[0], Math.max(...rs), total + rs[n - 1]];
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
      lines = [given("_R_total", total), ...known.map((r, i) => given(kl[i], r)), step("_R_x", `_R_total - ${kl.join(" - ")}`, final(exact, false, unit))];
      candidates = [total + known.reduce((s, r) => s + r, 0), total, total - known[0] + 1];
    }
  } else if (difficulty === "medium") {
    kind = "parallel";
    const [a, b] = parallelPair(rng);
    exact = (a * b) / (a + b);
    values = { a, b };
    prompt = `Two resistors of ${a} Ω and ${b} Ω are connected in parallel. What is their combined resistance, in Ω?`;
    intro = "For two resistors in parallel, `R = (R1 × R2) / (R1 + R2)` (product over sum). The result is always smaller than either resistor.";
    lines = [given("_R1", a), given("_R2", b), step("_R_total", "(_R1 * _R2) / (_R1 + _R2)", final(exact, false, unit))];
    candidates = [a + b, (a + b) / 2, a * b, Math.abs(a - b)];
  } else {
    kind = rng.pick(["s+p", "p-of-s"]);
    const pickR = () => rng.int(1, 47) * rng.pick([1, 10]);
    const r1 = pickR();
    const r2 = pickR();
    const r3 = pickR();
    values = { r1, r2, r3 };
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
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { formula: kind, values, rounded } };
  return finish(base, exact, rounded, candidates, rng);
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "ohms-law") return genOhm(difficulty, rng);
  if (subtopic === "power") return genPower(difficulty, rng);
  if (subtopic === "series-parallel") return genCircuit(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: substitute the answer back into the defining relation and look at the residual.
// For rounded answers the allowed residual is 0.005 × (how strongly the relation reacts to the unknown).
export function verify(question, answer) {
  const p = question && question.params;
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
