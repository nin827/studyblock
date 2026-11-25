// Body Measurements generator: unit conversions, BMI and body ratios, with every formula and
// conversion factor stated in the prompt. General calculations only, not medical advice.
// Uses only the seeded rng passed in by the engine.
// ---------------------------------------------------------------------------------------------
// Shared helpers (the same block sits in body-measurements, vital-signs and nutrition).
// Rounded answers are accepted within half a unit of the stated precision; exact answers must match.
// Explanations list every step as a labelled calculator row, e.g. `_lb = _kg * 2.2046` → 154.3.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
function roundTo(n, dp) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}

// True when n sits within 2% of a unit of a rounding tie at dp decimals (…5 boundary).
function nearTie(n, dp) {
  const s = Math.abs(n) * 10 ** dp;
  return Math.abs(s - Math.floor(s) - 0.5) < 0.02;
}

// True when n has at most dp decimals (up to binary noise).
function isClean(n, dp) {
  const s = n * 10 ** dp;
  return Math.abs(s - Math.round(s)) < 1e-6;
}

// Values in prompts, hints and steps: shortest form, up to 4 decimals; never "-0".
const num = (n) => String(roundTo(n, 4));
// Negative numbers in brackets when substituted into a formula.
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));

const R0 = { dp: 0, rounded: true };
const R1 = { dp: 1, rounded: true };
const R2 = { dp: 2, rounded: true };
const EX = { dp: 4, rounded: false };

const roundNote = (dp) => (dp === 0 ? " Round to the nearest whole number." : dp === 1 ? " Round to 1 decimal place." : ` Round to ${dp} decimal places.`);
const thenRound = (o) => (o.rounded ? ` Then round to ${o.dp === 0 ? "the nearest whole number" : o.dp === 1 ? "1 decimal place" : `${o.dp} decimal places`}.` : "");
const ansNote = (o, exact) => (o.rounded ? roundNote(o.dp) : Number.isInteger(roundTo(exact, 6)) ? "" : " Give the exact value.");
const PCT_NOTE = " Answer as a number without the % sign.";
const SIGNED_NOTE = " Use a minus sign for a decrease.";

function fmtAns(v, o) {
  return o.rounded ? roundTo(v, o.dp).toFixed(o.dp) : num(v);
}

const decimals = (s) => (String(s).split(".")[1] || "").length;

// The value on the last explanation row: "**154.3 lb**" or "154.3212, which rounds to **154.3 lb**".
function res(exact, o, unit) {
  const shown = fmtAns(exact, o);
  const u = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  if (!o.rounded || Math.abs(exact - Number(shown)) < 1e-9) return `**${shown}${u}**`;
  return `${num(exact)}, which rounds to **${shown}${u}**`;
}

// Explanation rows: a stated value, and a calculator step with its result.
const row = (label, v) => `- \`${label} = ${num(v)}\``;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;

// Pre-filled calculator rows: [["_kg", 70], ["_height", 1.75]] -> [{ label, value }].
const G = (pairs) => pairs.map(([label, value]) => ({ label, value }));

// Numbers written in a piece of text ("1.75", "-3", "2.2046").
const numbersIn = (text) => (String(text).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

// True when a hint states an answer value that the prompt doesn't already show.
function hintsLeak(hintTexts, answers, prompt) {
  const inPrompt = new Set(numbersIn(prompt));
  for (const a of answers) {
    if (!Number.isFinite(a) || inPrompt.has(a)) continue;
    for (const h of hintTexts) if (numbersIn(h).some((x) => x === a || x === Math.abs(a))) return true;
  }
  return false;
}

// 4 unique choices: the answer + 3 distractors from common mistakes, topped up with nearby values.
// No distractor is within the tolerance of the answer; no zero (or negative, unless allowed) options.
function buildChoices(ansStr, ansVal, tol, candidates, o, allowNeg, rng) {
  const seen = new Set([ansStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || typeof v !== "number" || !Number.isFinite(v)) return;
    let s;
    if (o.rounded) s = fmtAns(v, o);
    else {
      if (!isClean(v, 4)) return;
      s = num(v);
      if (Number.isInteger(ansVal) && !Number.isInteger(Number(s))) return;
    }
    const x = Number(s);
    if (x === 0 || (!allowNeg && x < 0)) return;
    if (seen.has(s) || Math.abs(x - ansVal) <= tol + 1e-9) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k <= 6; k++) {
    tryAdd(ansVal * (1 + 0.1 * k));
    tryAdd(ansVal * (1 - 0.1 * k));
  }
  const unit = o.rounded ? 10 ** -o.dp : Number.isInteger(ansVal) ? 1 : 10 ** -decimals(ansStr);
  for (let k = 1; out.length < 3 && k <= 40; k++) {
    tryAdd(ansVal + k * unit);
    tryAdd(ansVal - k * unit);
  }
  if (out.length < 3) return null;
  return rng.shuffle([ansStr, ...out]);
}

// A single typed-number or (~35%) multiple-choice question. Returns null when the case must be
// regenerated: rounding tie, zero answer, inexact "exact" answer, a given value equal to the
// answer, or a hint that states the answer.
// s = { kind, values, prompt, intro, lines, exact, o, unit, candidates, hints, given, allowNeg, noChoice }
function make(rng, s) {
  const { exact, o } = s;
  if (!Number.isFinite(exact)) return null;
  if (o.rounded ? nearTie(exact, o.dp) : !isClean(exact, 4)) return null;
  const ansStr = fmtAns(exact, o);
  const ansVal = Number(ansStr);
  if (ansVal === 0 || (!s.allowNeg && ansVal < 0)) return null;
  const prompt = s.prompt + ansNote(o, exact);
  const given = s.given && s.given.length >= 2 ? G(s.given) : undefined;
  if (given && given.some((g) => Math.abs(g.value - ansVal) < 1e-9 || Math.abs(g.value - exact) < 1e-9)) return null;
  if (hintsLeak(s.hints, [ansVal], prompt)) return null;
  const tol = o.rounded ? 0.5 * 10 ** -o.dp : 0;
  const q = {
    prompt,
    explanation: `${s.intro}\n\n${s.lines.join("\n")}`,
    tolerance: tol,
    params: { kind: s.kind, values: s.values, dp: o.dp, rounded: o.rounded },
    ...(given ? { given } : {}),
    hints: s.hints,
  };
  if (!s.noChoice && rng.next() < 0.35) {
    const choices = buildChoices(ansStr, ansVal, tol, s.candidates || [], o, !!s.allowNeg, rng);
    if (!choices) return null;
    return { ...q, answer: ansStr, answerType: "choice", choices };
  }
  return { ...q, answer: ansVal, answerType: "number", choices: undefined };
}

// A multi-part question. parts: [{ id, label, ask, kind, exact, o, hint, allowNeg }] for numbers, or
// [{ id, label, ask, cat, answer, choices, hint }] for a category choice. Returns null to regenerate.
function makeMulti(s) {
  const parts = [];
  const specs = [];
  const answers = [];
  for (const p of s.parts) {
    if (p.cat) {
      parts.push({ id: p.id, label: p.label, ask: p.ask, answerType: "choice", answer: p.answer, choices: p.choices.slice(), hint: p.hint });
      specs.push({ id: p.id, cat: p.cat });
      continue;
    }
    const { exact, o } = p;
    if (!Number.isFinite(exact)) return null;
    if (o.rounded ? nearTie(exact, o.dp) : !isClean(exact, 4)) return null;
    const v = Number(fmtAns(exact, o));
    if ((!p.allowNeg && v < 0) || (v === 0 && !p.allowZero)) return null;
    answers.push(v);
    parts.push({
      id: p.id, label: p.label, ask: p.ask + ansNote(o, exact), answerType: "number",
      answer: v, tolerance: o.rounded ? 0.5 * 10 ** -o.dp : 0, hint: p.hint,
    });
    specs.push({ id: p.id, kind: p.kind, dp: o.dp, rounded: o.rounded });
  }
  const given = s.given && s.given.length >= 2 ? G(s.given) : undefined;
  if (given && given.some((g) => answers.some((a) => Math.abs(g.value - a) < 1e-9))) return null;
  const hintTexts = [...(s.hints || []), ...parts.map((p) => p.hint)];
  if (hintsLeak(hintTexts, answers, s.prompt + " " + parts.map((p) => p.ask).join(" "))) return null;
  return {
    prompt: s.prompt,
    answerType: "multi",
    parts,
    explanation: `${s.intro}\n\n${s.lines.join("\n")}`,
    params: { multi: true, values: s.values, parts: specs },
    ...(given ? { given } : {}),
    ...(s.hints ? { hints: s.hints } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Independent check. Every numeric kind has a reverse formula in REV: it puts the answer back in and
// returns a residual in terms of a stated input (e.g. pounds ÷ 2.2046 − kilograms). The answer passes
// when the residual is within the stated rounding × how strongly the residual reacts to the answer.
// A few kinds use a direct test in CHECK instead (whole feet, categories).

function valueOk(spec, values, answer) {
  if (spec.cat) return typeof CAT[spec.cat] === "function" && String(answer) === CAT[spec.cat](values);
  if (answer === "" || answer === null || answer === undefined || typeof answer === "boolean") return false;
  const x = Number(String(answer).trim().replace(/−/g, "-"));
  if (!Number.isFinite(x)) return false;
  if (spec.rounded && !isClean(x, spec.dp)) return false;
  if (typeof CHECK[spec.kind] === "function") return CHECK[spec.kind](values, x) === true;
  const f = REV[spec.kind];
  if (typeof f !== "function") return false;
  const r = f(values, x);
  const h = Math.max(1e-4, Math.abs(x) * 1e-6);
  const sens = Math.abs((f(values, x + h) - f(values, x - h)) / (2 * h));
  if (!Number.isFinite(r) || !(sens > 0)) return false;
  const tol = spec.rounded ? 0.5 * 10 ** -spec.dp : 1e-7 * Math.max(1, Math.abs(x));
  return Math.abs(r) <= tol * sens * (1 + 1e-6) + 1e-9;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false; // regenerate from the seed to get params back
  try {
    if (question.answerType === "multi" || p.multi) {
      const parts = question.parts;
      const specs = p.parts;
      if (question.answerType !== "multi" || !Array.isArray(parts) || !Array.isArray(specs)) return false;
      if (parts.length < 2 || parts.length > 4 || parts.length !== specs.length) return false;
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
      return specs.every((spec, i) => {
        const part = parts[i];
        if (!part || part.id !== spec.id || !Object.prototype.hasOwnProperty.call(answer, spec.id)) return false;
        const value = answer[spec.id];
        if (spec.cat) {
          if (part.answerType !== "choice" || !Array.isArray(part.choices) || !part.choices.includes(String(value))) return false;
          if (part.choices.filter((c) => valueOk(spec, p.values, c)).length !== 1) return false;
        } else if (part.answerType !== "number") return false;
        return valueOk(spec, p.values, value);
      });
    }
    if (question.answerType === "choice") {
      const ch = question.choices;
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
      if (ch.filter((c) => valueOk(p, p.values, c)).length !== 1) return false;
    }
    return valueOk(p, p.values, answer);
  } catch {
    return false;
  }
}

const DIFFS = ["easy", "medium", "hard"];

export function generate({ subtopic, difficulty, rng }) {
  const fn = GEN[subtopic];
  if (typeof fn !== "function") throw new Error(`Unknown subtopic: ${subtopic}`);
  if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  for (let i = 0; i < 80; i++) {
    const q = fn(difficulty, rng);
    if (q) return q;
  }
  throw new Error(`Could not build a ${subtopic}/${difficulty} question`);
}

// ---------------------------------------------------------------------------------------------
// Body Measurements

const LB = 2.2046; // pounds per kilogram (stated in every prompt that uses it)
const CM = 2.54; // centimetres per inch
const NAMES = ["Alex", "Priya", "Sam", "Mei", "Jordan", "Ana", "Kofi", "Lena", "Omar", "Tom", "Zara", "Luis", "Hana", "Ravi", "Noor", "Ben", "Ines", "Kai", "Maya", "Theo"];

const C_TO_F = "°F = °C × 9/5 + 32";
const F_TO_C = "°C = (°F − 32) × 5/9";

// General adult BMI categories (WHO), shown as ranges only.
const BMI_CATS = ["Under 18.5", "18.5 to 24.9", "25 to 29.9", "30 or more"];
const BMI_TABLE = "General adult BMI categories: under 18.5, 18.5 to 24.9, 25 to 29.9, and 30 or more.";
// Exact BMI must stay this far from a boundary, so a value rounded to 1 decimal never sits on the line.
const BMI_GAP = 0.2;
const bmiClear = (b) => [18.5, 25, 30].every((t) => Math.abs(b - t) >= BMI_GAP);
const bmiCatOf = (b) => (b < 18.5 ? BMI_CATS[0] : b < 25 ? BMI_CATS[1] : b < 30 ? BMI_CATS[2] : BMI_CATS[3]);

// ---- Unit conversions

function genUnits(d, rng) {
  const kind = rng.pick(
    { easy: ["kg2lb", "lb2kg", "in2cm", "c2f"], medium: ["kg2lb", "cm2in", "ftin2cm", "c2f", "f2c"], hard: ["stlb2kg", "cm2ftin", "f2c", "lb2kg", "ftin2cm"] }[d]
  );
  const who = rng.pick(NAMES);

  if (kind === "kg2lb") {
    const kg = d === "easy" ? rng.int(45, 120) : rng.int(450, 1200) / 10;
    const exact = kg * LB;
    return make(rng, {
      kind, values: { kg }, exact, o: R1, unit: "lb",
      prompt: `${who} has a mass of ${num(kg)} kg. What is this in pounds (lb)? Use 1 kg = 2.2046 lb.`,
      intro: "There are 2.2046 lb in every kilogram, so multiply by 2.2046.",
      lines: [row("_kg", kg), step("_lb", "_kg * 2.2046", res(exact, R1, "lb"))],
      candidates: [kg / LB, kg * 2, kg * 2.5],
      hints: [
        "A pound is smaller than a kilogram, so the number of pounds is bigger. Multiply: `lb = kg × 2.2046`.",
        `Work out \`${num(kg)} × 2.2046\` (in the calculator: \`${num(kg)} * 2.2046\`).${thenRound(R1)}`,
      ],
    });
  }

  if (kind === "lb2kg") {
    const o = d === "hard" ? R2 : R1;
    const lb = d === "hard" ? rng.int(950, 2800) / 10 : rng.int(100, 260);
    const exact = lb / LB;
    return make(rng, {
      kind, values: { lb }, exact, o, unit: "kg",
      prompt: `${who}'s mass is ${num(lb)} lb. What is this in kilograms? Use 1 kg = 2.2046 lb.`,
      intro: "Each kilogram is 2.2046 lb, so divide the pounds by 2.2046.",
      lines: [row("_lb", lb), step("_kg", "_lb / 2.2046", res(exact, o, "kg"))],
      candidates: [lb * LB, lb / 2, lb / 2.5],
      hints: [
        "A kilogram is bigger than a pound, so the number of kilograms is smaller. Divide: `kg = lb ÷ 2.2046`.",
        `Work out \`${num(lb)} ÷ 2.2046\` (in the calculator: \`${num(lb)} / 2.2046\`).${thenRound(o)}`,
      ],
    });
  }

  if (kind === "in2cm") {
    const inch = rng.int(20, 76);
    const what = inch >= 55 ? "A height" : rng.pick(["A waist measurement", "A hip measurement", "An arm span"]);
    const exact = inch * CM;
    return make(rng, {
      kind, values: { inch }, exact, o: EX, unit: "cm",
      prompt: `${what} is ${inch} inches. What is this in centimetres? Use 1 inch = 2.54 cm.`,
      intro: "Each inch is 2.54 cm, so multiply by 2.54.",
      lines: [row("_in", inch), step("_cm", "_in * 2.54", res(exact, EX, "cm"))],
      candidates: [inch / CM, inch * 2.5, inch * 25.4],
      hints: [
        "A centimetre is smaller than an inch, so you get more centimetres. Multiply: `cm = inches × 2.54`.",
        `Work out \`${inch} × 2.54\` exactly (in the calculator: \`${inch} * 2.54\`).`,
      ],
    });
  }

  if (kind === "cm2in") {
    const height = rng.next() < 0.5;
    const cm = height ? rng.int(150, 198) : rng.int(60, 120);
    const exact = cm / CM;
    return make(rng, {
      kind, values: { cm }, exact, o: R1, unit: "in",
      prompt: `${who}'s ${height ? "height" : rng.pick(["waist", "hip"]) + " measurement"} is ${cm} cm. What is this in inches? Use 1 inch = 2.54 cm.`,
      intro: "Each inch is 2.54 cm, so divide the centimetres by 2.54.",
      lines: [row("_cm", cm), step("_in", "_cm / 2.54", res(exact, R1, "in"))],
      candidates: [cm * CM, cm / 2.5, cm / 25.4],
      hints: [
        "An inch is bigger than a centimetre, so you get fewer inches. Divide: `inches = cm ÷ 2.54`.",
        `Work out \`${cm} ÷ 2.54\` (in the calculator: \`${cm} / 2.54\`).${thenRound(R1)}`,
      ],
    });
  }

  if (kind === "ftin2cm") {
    const ft = rng.int(4, 6);
    const inch = ft === 4 ? rng.int(8, 11) : ft === 6 ? rng.int(0, 5) : rng.int(0, 11);
    const total = ft * 12 + inch;
    const exact = total * CM;
    const o = d === "hard" ? R0 : R1;
    return make(rng, {
      kind, values: { ft, inch }, exact, o, unit: "cm",
      prompt: `${who} is ${ft} ft ${inch} in tall. What is this height in centimetres? Use 1 ft = 12 in and 1 in = 2.54 cm.`,
      intro: "Turn the height into inches first, then multiply by 2.54.",
      lines: [
        row("_ft", ft), row("_in", inch),
        step("_inches", "_ft * 12 + _in", `${total} in`),
        step("_cm", "_inches * 2.54", res(exact, o, "cm")),
      ],
      candidates: [ft * 30.48 + inch, (ft * 10 + inch) * CM, total / CM],
      given: [["_ft", ft], ["_in", inch]],
      hints: [
        "Change everything to inches first: there are 12 inches in a foot.",
        `Total inches = \`${ft} × 12 + ${inch}\` (in the calculator: \`_ft * 12 + _in\`).`,
        `Multiply the total inches by 2.54 to get centimetres.${thenRound(o)}`,
      ],
    });
  }

  if (kind === "c2f") {
    const c = d === "easy" ? 5 * rng.int(-2, 8) : rng.int(350, 400) / 10;
    const exact = (c * 9) / 5 + 32;
    const o = d === "easy" ? EX : R1;
    const what = d === "easy" ? rng.pick(["The outdoor temperature", "The forecast high", "The temperature at noon", "The air temperature"]) : "A thermometer";
    const reads = d === "easy" ? "is" : "reads";
    return make(rng, {
      kind, values: { c }, exact, o, unit: "°F", allowNeg: true,
      prompt: `${what} ${reads} ${num(c)} °C. What is this in °F? Use ${C_TO_F}.`,
      intro: `Use ${C_TO_F}: multiply by 9/5 first, then add 32.`,
      lines: [row("_c", c), step("_f", "_c * 9 / 5 + 32", res(exact, o, "°F"))],
      candidates: [(c * 9) / 5, ((c + 32) * 9) / 5, (c * 5) / 9 + 32],
      hints: [
        `Use ${C_TO_F}. Multiply before you add.`,
        `Work out \`${par(c)} × 9 / 5\`, then add 32 (in the calculator: \`${num(c)} * 9 / 5 + 32\`).${thenRound(o)}`,
      ],
    });
  }

  if (kind === "f2c") {
    const o = d === "hard" ? R2 : R1;
    const f = d === "hard" ? rng.int(900, 1060) / 10 : rng.int(950, 1040) / 10;
    const exact = ((f - 32) * 5) / 9;
    return make(rng, {
      kind, values: { f }, exact, o, unit: "°C",
      prompt: `A thermometer reads ${num(f)} °F. What is this in °C? Use ${F_TO_C}.`,
      intro: `Use ${F_TO_C}: subtract 32 first, then multiply by 5/9.`,
      lines: [row("_f", f), step("_c", "(_f - 32) * 5 / 9", res(exact, o, "°C"))],
      candidates: [(f * 5) / 9 - 32, ((f - 32) * 9) / 5, f - 32],
      hints: [
        `Use ${F_TO_C}. Take away 32 before you multiply.`,
        `Work out \`(${num(f)} − 32) × 5 / 9\` (in the calculator: \`(${num(f)} - 32) * 5 / 9\`).${thenRound(o)}`,
      ],
    });
  }

  if (kind === "stlb2kg") {
    const st = rng.int(7, 18);
    const lb = rng.int(1, 13);
    const total = st * 14 + lb;
    const exact = total / LB;
    return make(rng, {
      kind, values: { st, lb }, exact, o: R1, unit: "kg",
      prompt: `${who}'s mass is ${st} st ${lb} lb. What is this in kilograms? Use 1 stone = 14 lb and 1 kg = 2.2046 lb.`,
      intro: "Turn stones and pounds into pounds, then divide by 2.2046.",
      lines: [
        row("_st", st), row("_lb", lb),
        step("_pounds", "_st * 14 + _lb", `${total} lb`),
        step("_kg", "_pounds / 2.2046", res(exact, R1, "kg")),
      ],
      candidates: [(st * 12 + lb) / LB, total / 2, (st * 14) / LB],
      given: [["_st", st], ["_lb", lb]],
      hints: [
        "Change everything to pounds first: 1 stone is 14 lb.",
        `Total pounds = \`${st} × 14 + ${lb}\` (in the calculator: \`_st * 14 + _lb\`).`,
        `Divide the total pounds by 2.2046 to get kilograms.${thenRound(R1)}`,
      ],
    });
  }

  // cm2ftin (hard, two parts): whole feet, then the inches left over.
  const cm = rng.int(150, 199);
  const totalIn = cm / CM;
  const ft = Math.floor(totalIn / 12);
  const rest = totalIn - 12 * ft;
  if (nearTie(rest, 0) || roundTo(rest, 0) >= 12) return null;
  return makeMulti({
    values: { cm },
    prompt: `${who} is ${cm} cm tall. Write this height in feet and inches. Use 1 in = 2.54 cm and 1 ft = 12 in.`,
    parts: [
      { id: "feet", label: "Feet", ask: "How many whole feet?", kind: "ft-of-cm", exact: ft, o: EX, hint: `Divide ${cm} by 2.54 to get inches, then count how many whole 12s fit into that.` },
      { id: "inches", label: "Inches", ask: "How many inches are left over?", kind: "in-of-cm", exact: rest, o: R0, allowZero: true, hint: "Take the whole feet × 12 away from the total inches. Round what is left." },
    ],
    intro: "Change to inches, then split the inches into whole feet and what is left over.",
    lines: [
      row("_cm", cm),
      step("_inches", "_cm / 2.54", `${num(totalIn)} in`),
      step("_feet", "floor(_inches / 12)", `**${ft} ft**`),
      step("_left", "_inches - _feet * 12", res(rest, R0, "in")),
    ],
    hints: ["Convert the whole height to inches first (divide by 2.54), then split it into feet (12 in each) and inches."],
  });
}

// ---- BMI

function genBmi(d, rng) {
  const kind = rng.pick({ easy: ["bmi"], medium: ["bmi-cm", "mass-at-bmi", "bmi-cat"], hard: ["bmi-imp", "mass-at-bmi-cm", "bmi-multi"] }[d]);
  const who = rng.pick(NAMES);
  const hcm = rng.int(150, 196);
  const h = hcm / 100;
  const FORMULA = "BMI = mass (kg) ÷ height (m)²";

  if (kind === "bmi" || kind === "bmi-cm" || kind === "bmi-cat" || kind === "bmi-multi") {
    const m = kind === "bmi" ? rng.int(45, 115) : rng.int(450, 1250) / 10;
    const bmi = m / (h * h);
    if (bmi < 16 || bmi > 40) return null;
    const inCm = kind !== "bmi";
    const hShown = inCm ? `${hcm} cm` : `${num(h)} m`;
    const intro = `BMI is a rough, population-level measure: ${FORMULA}.${inCm ? " Change the height to metres first." : ""}`;
    const lines = inCm
      ? [row("_mass", m), row("_height_cm", hcm), step("_height", "_height_cm / 100", `${num(h)} m`)]
      : [row("_mass", m), row("_height", h)];
    const given = inCm ? [["_mass", m], ["_height_cm", hcm]] : [["_mass", m], ["_height", h]];
    const hHint = inCm
      ? `Change the height to metres first: ${hcm} cm = ${num(h)} m (in the calculator: \`_height = _height_cm / 100\`).`
      : null;
    const calcHint = `Square the height, then divide the mass by it: \`${num(m)} ÷ ${num(h)}²\` (in the calculator: \`_mass / _height^2\`).`;
    const values = { m, h };

    if (kind === "bmi-cat" || kind === "bmi-multi") {
      if (!bmiClear(bmi)) return null;
      const cat = bmiCatOf(bmi);
      const catLine = `${num(roundTo(bmi, 1))} is in the **${cat}** range.`;
      if (kind === "bmi-cat") {
        const hints = [hHint, calcHint, "Compare your BMI with the boundaries 18.5, 25 and 30."].filter(Boolean);
        return {
          prompt: `${who} is ${hShown} tall with a mass of ${num(m)} kg. Use ${FORMULA}. ${BMI_TABLE} Which range does this BMI fall in?`,
          answerType: "choice",
          answer: cat,
          choices: BMI_CATS.slice(),
          explanation: `${intro}\n\n${[...lines, step("_bmi", "_mass / _height^2", `${num(roundTo(bmi, 2))}`)].join("\n")}\n\n${catLine}`,
          params: { kind, cat: "bmi", values },
          given: G(given),
          hints,
        };
      }
      return makeMulti({
        values,
        prompt: `${who} is ${hShown} tall with a mass of ${num(m)} kg. Use ${FORMULA}. ${BMI_TABLE}`,
        parts: [
          { id: "bmi", label: "Calculation", ask: "What is the BMI?", kind: "bmi", exact: bmi, o: R1, hint: [hHint, calcHint].filter(Boolean).join(" ") },
          { id: "cat", label: "Category", ask: "Which general adult range is it in?", cat: "bmi", answer: cat, choices: BMI_CATS, hint: "Compare the BMI you found with the boundaries 18.5, 25 and 30." },
        ],
        intro,
        lines: [...lines, step("_bmi", "_mass / _height^2", res(bmi, R1, "")), "", catLine],
        given,
      });
    }

    return make(rng, {
      kind: "bmi", values, exact: bmi, o: R1, unit: "",
      prompt: `${who} is ${hShown} tall with a mass of ${num(m)} kg. What is the BMI? Use ${FORMULA}.`,
      intro,
      lines: [...lines, step("_bmi", "_mass / _height^2", res(bmi, R1, ""))],
      candidates: [m / h, m / (2 * h), (m * LB) / (h * h)],
      given,
      hints: [hHint, `Square the height first: \`${num(h)}² = ${num(h * h)}\` (in the calculator: \`_height^2\`).`, `Divide the mass by the squared height (in the calculator: \`_mass / _height^2\`).${thenRound(R1)}`].filter(Boolean),
    });
  }

  if (kind === "mass-at-bmi" || kind === "mass-at-bmi-cm") {
    const inCm = kind === "mass-at-bmi-cm";
    const b = inCm ? rng.int(186, 320) / 10 : rng.int(19, 29);
    const exact = b * h * h;
    const lines = inCm
      ? [row("_bmi", b), row("_height_cm", hcm), step("_height", "_height_cm / 100", `${num(h)} m`)]
      : [row("_bmi", b), row("_height", h)];
    return make(rng, {
      kind: "mass-at-bmi", values: { b, h }, exact, o: R1, unit: "kg",
      prompt: `Someone is ${inCm ? `${hcm} cm` : `${num(h)} m`} tall. What mass, in kg, gives a BMI of ${num(b)} at this height? Use ${FORMULA}, rearranged to mass = BMI × height².`,
      intro: `Rearrange ${FORMULA} to mass = BMI × height (m)².${inCm ? " Change the height to metres first." : ""}`,
      lines: [...lines, step("_mass", "_bmi * _height^2", res(exact, R1, "kg"))],
      candidates: [b * h, b / (h * h), 2 * b * h],
      given: inCm ? [["_bmi", b], ["_height_cm", hcm]] : [["_bmi", b], ["_height", h]],
      hints: [
        inCm ? `Change the height to metres: ${hcm} cm = ${num(h)} m.` : null,
        "Multiply both sides of the formula by height²: mass = BMI × height².",
        `Work out \`${num(b)} × ${num(h)}²\` (in the calculator: \`_bmi * _height^2\`). Square before multiplying.${thenRound(R1)}`,
      ].filter(Boolean),
    });
  }

  // bmi-imp (hard): pounds and feet + inches, converted to kg and m first.
  const lb = rng.int(100, 260);
  const ft = rng.int(4, 6);
  const inch = ft === 4 ? rng.int(10, 11) : ft === 6 ? rng.int(0, 4) : rng.int(0, 11);
  const kg = lb / LB;
  const hm = ((ft * 12 + inch) * CM) / 100;
  const exact = kg / (hm * hm);
  if (exact < 16 || exact > 40) return null;
  return make(rng, {
    kind: "bmi-imp", values: { lb, ft, inch }, exact, o: R1, unit: "",
    prompt: `${who} is ${ft} ft ${inch} in tall with a mass of ${lb} lb. What is the BMI? Use ${FORMULA}, 1 kg = 2.2046 lb, 1 ft = 12 in and 1 in = 2.54 cm.`,
    intro: `BMI is a rough, population-level measure: ${FORMULA}. Convert the mass to kg and the height to metres first.`,
    lines: [
      row("_lb", lb), row("_ft", ft), row("_in", inch),
      step("_kg", "_lb / 2.2046", `${num(kg)} kg`),
      step("_height", "(_ft * 12 + _in) * 2.54 / 100", `${num(hm)} m`),
      step("_bmi", "_kg / _height^2", res(exact, R1, "")),
    ],
    candidates: [lb / (hm * hm), kg / hm, (lb / (hm * hm)) / 2],
    given: [["_lb", lb], ["_ft", ft], ["_in", inch]],
    hints: [
      `Mass in kg: \`${lb} ÷ 2.2046\` (in the calculator: \`_kg = _lb / 2.2046\`).`,
      `Height in metres: total inches \`${ft} × 12 + ${inch}\`, times 2.54 for cm, then ÷ 100 (in the calculator: \`_height = (_ft * 12 + _in) * 2.54 / 100\`).`,
      `Divide the mass in kg by the height in metres squared: \`_kg / _height^2\`.${thenRound(R1)}`,
    ],
  });
}

// ---- Body ratios

function genRatios(d, rng) {
  const kind = rng.pick({ easy: ["whtr", "whr"], medium: ["whtr-in", "waist-for-ratio", "pct-change", "whr"], hard: ["mass-after-pct", "old-from-pct", "pct-multi", "whtr-imp"] }[d]);
  const who = rng.pick(NAMES);
  const PCT = "percentage change = (new − old) ÷ old × 100";

  if (kind === "whtr" || kind === "whtr-in" || kind === "whtr-imp") {
    const hcm = rng.int(150, 196);
    if (kind === "whtr") {
      const waist = rng.int(60, 112);
      const exact = waist / hcm;
      return make(rng, {
        kind: "whtr", values: { waist, height: hcm }, exact, o: R2, unit: "",
        prompt: `${who}'s waist measures ${waist} cm and height is ${hcm} cm. What is the waist-to-height ratio? Use waist-to-height ratio = waist ÷ height.`,
        intro: "Both measurements are in centimetres, so divide the waist by the height.",
        lines: [row("_waist", waist), row("_height", hcm), step("_ratio", "_waist / _height", res(exact, R2, ""))],
        candidates: [hcm / waist, (hcm - waist) / hcm, waist / hcm + 0.1],
        given: [["_waist", waist], ["_height", hcm]],
        hints: ["The ratio is waist ÷ height, with both in the same units.", `Work out \`${waist} ÷ ${hcm}\` (in the calculator: \`_waist / _height\`).${thenRound(R2)}`],
      });
    }
    const wIn = rng.int(26, 44);
    if (kind === "whtr-in") {
      const exact = (wIn * CM) / hcm;
      return make(rng, {
        kind: "whtr-in", values: { win: wIn, height: hcm }, exact, o: R2, unit: "",
        prompt: `${who}'s waist measures ${wIn} inches and height is ${hcm} cm. What is the waist-to-height ratio? Use waist-to-height ratio = waist ÷ height, with both in cm, and 1 in = 2.54 cm.`,
        intro: "A ratio needs both measurements in the same units, so change the waist to centimetres first.",
        lines: [row("_waist_in", wIn), row("_height", hcm), step("_waist", "_waist_in * 2.54", `${num(wIn * CM)} cm`), step("_ratio", "_waist / _height", res(exact, R2, ""))],
        candidates: [wIn / hcm, hcm / (wIn * CM), wIn / CM / hcm],
        given: [["_waist_in", wIn], ["_height", hcm]],
        hints: [
          `Change the waist to cm first: \`${wIn} × 2.54\` (in the calculator: \`_waist = _waist_in * 2.54\`).`,
          `Divide the waist in cm by the height: \`_waist / _height\`.${thenRound(R2)}`,
        ],
      });
    }
    // whtr-imp: both in imperial units, height in feet and inches.
    const ft = rng.int(4, 6);
    const inch = ft === 4 ? rng.int(10, 11) : ft === 6 ? rng.int(0, 4) : rng.int(0, 11);
    const total = ft * 12 + inch;
    const exact = wIn / total;
    return make(rng, {
      kind: "whtr-imp", values: { win: wIn, ft, inch }, exact, o: R2, unit: "",
      prompt: `${who}'s waist measures ${wIn} in and height is ${ft} ft ${inch} in. What is the waist-to-height ratio? Use waist-to-height ratio = waist ÷ height, with both in inches, and 1 ft = 12 in.`,
      intro: "Put the height in inches too, then divide.",
      lines: [row("_waist", wIn), row("_ft", ft), row("_in", inch), step("_height", "_ft * 12 + _in", `${total} in`), step("_ratio", "_waist / _height", res(exact, R2, ""))],
      candidates: [wIn / (ft + inch / 12), wIn / (ft * 10 + inch), total / wIn],
      given: [["_waist", wIn], ["_ft", ft], ["_in", inch]],
      hints: [
        `Height in inches: \`${ft} × 12 + ${inch}\` (in the calculator: \`_height = _ft * 12 + _in\`).`,
        `Divide the waist by the height in inches: \`_waist / _height\`.${thenRound(R2)}`,
      ],
    });
  }

  if (kind === "whr") {
    const waist = rng.int(62, 110);
    const hip = rng.int(Math.max(85, waist - 5), 125);
    const exact = waist / hip;
    return make(rng, {
      kind: "whr", values: { waist, hip }, exact, o: R2, unit: "",
      prompt: `${who}'s waist measures ${waist} cm and hips measure ${hip} cm. What is the waist-to-hip ratio? Use waist-to-hip ratio = waist ÷ hip.`,
      intro: "Both measurements are in centimetres, so divide the waist by the hip measurement.",
      lines: [row("_waist", waist), row("_hip", hip), step("_ratio", "_waist / _hip", res(exact, R2, ""))],
      candidates: [hip / waist, (hip - waist) / hip, waist / (waist + hip)],
      given: [["_waist", waist], ["_hip", hip]],
      hints: ["The ratio is waist ÷ hip, with both in the same units.", `Work out \`${waist} ÷ ${hip}\` (in the calculator: \`_waist / _hip\`).${thenRound(R2)}`],
    });
  }

  if (kind === "waist-for-ratio") {
    const hcm = rng.int(150, 196);
    let rp = rng.int(40, 59); if (rp >= 50) rp += 1; // skip 0.50, a widely quoted rule of thumb
    const r = rp / 100;
    const exact = r * hcm;
    return make(rng, {
      kind, values: { r, height: hcm }, exact, o: R1, unit: "cm",
      prompt: `Someone is ${hcm} cm tall. What waist measurement, in cm, gives a waist-to-height ratio of ${num(r)}? Use waist-to-height ratio = waist ÷ height.`,
      intro: "Rearrange ratio = waist ÷ height to waist = ratio × height.",
      lines: [row("_ratio", r), row("_height", hcm), step("_waist", "_ratio * _height", res(exact, R1, "cm"))],
      candidates: [hcm / r, r * 100, hcm * (1 - r)],
      given: [["_ratio", r], ["_height", hcm]],
      hints: ["Multiply both sides of ratio = waist ÷ height by the height: waist = ratio × height.", `Work out \`${num(r)} × ${hcm}\` (in the calculator: \`_ratio * _height\`).${thenRound(R1)}`],
    });
  }

  const PERIODS = ["over six months", "over a year", "over a training season", "between two check-ups", "over three months"];
  const period = rng.pick(PERIODS);
  const old = rng.int(480, 1150) / 10;

  if (kind === "pct-change" || kind === "pct-multi") {
    let delta = rng.int(5, 90) / 10;
    if (rng.next() < 0.5) delta = -delta;
    const neu = roundTo(old + delta, 1);
    const pct = ((neu - old) / old) * 100;
    const change = neu - old;
    const lines = [row("_old", old), row("_new", neu), step("_change", "_new - _old", `${num(change)} kg`), step("_pct", "_change / _old * 100", res(pct, R1, "%"))];
    const prompt = `${who}'s mass changed from ${num(old)} kg to ${num(neu)} kg ${period}.`;
    if (kind === "pct-multi") {
      return makeMulti({
        values: { old, neu },
        prompt: `${prompt} Use ${PCT}.`,
        parts: [
          { id: "change", label: "Change", ask: `What is the change in mass, in kg?${SIGNED_NOTE}`, kind: "diff", exact: change, o: R1, allowNeg: true, hint: "Change = new − old. A fall gives a negative number." },
          { id: "pct", label: "Percentage change", ask: `What is the percentage change?${PCT_NOTE}${SIGNED_NOTE}`, kind: "pct-change", exact: pct, o: R1, allowNeg: true, hint: `Divide the change by the old mass (${num(old)} kg), not the new one, then multiply by 100.` },
        ],
        intro: `Use ${PCT}.`,
        lines,
        given: [["_old", old], ["_new", neu]],
      });
    }
    return make(rng, {
      kind: "pct-change", values: { old, neu }, exact: pct, o: R1, unit: "%", allowNeg: true,
      prompt: `${prompt} What is the percentage change? Use ${PCT}.${PCT_NOTE}${SIGNED_NOTE}`,
      intro: `Use ${PCT}.`,
      lines,
      candidates: [((neu - old) / neu) * 100, -pct, neu - old],
      given: [["_old", old], ["_new", neu]],
      hints: [
        `Find the change first: \`${num(neu)} − ${num(old)}\` (in the calculator: \`_new - _old\`).`,
        `Divide the change by the old value, ${num(old)}, and multiply by 100 (in the calculator: \`(_new - _old) / _old * 100\`).${thenRound(R1)}`,
      ],
    });
  }

  let p = rng.int(10, 120) / 10;
  if (rng.next() < 0.5) p = -p;
  const dir = p < 0 ? "fell" : "rose";
  const pAbs = Math.abs(p);

  if (kind === "mass-after-pct") {
    const exact = old * (1 + p / 100);
    return make(rng, {
      kind, values: { old, p }, exact, o: R1, unit: "kg",
      prompt: `${who}'s mass was ${num(old)} kg and ${dir} by ${num(pAbs)}% ${period}. What is the new mass, in kg?`,
      intro: `A ${p < 0 ? "fall" : "rise"} of ${num(pAbs)}% means multiplying by 1 ${p < 0 ? "−" : "+"} ${num(pAbs)}/100.`,
      lines: [row("_old", old), row("_pct", p), step("_new", "_old * (1 + _pct / 100)", res(exact, R1, "kg"))],
      candidates: [old + p, old * (1 - p / 100), (old * pAbs) / 100],
      given: [["_old", old], ["_pct", p]],
      hints: [
        `${num(pAbs)}% of the old mass is the amount it ${dir} by. Find it with \`${num(old)} × ${num(pAbs)} / 100\`.`,
        `${p < 0 ? "Take that away from" : "Add that to"} the old mass. In one step: \`_old * (1 + _pct / 100)\`, where \`_pct\` is ${num(p)}.${thenRound(R1)}`,
      ],
    });
  }

  // old-from-pct: reverse percentage.
  const neu = rng.int(480, 1150) / 10;
  const exact = neu / (1 + p / 100);
  return make(rng, {
    kind: "old-from-pct", values: { neu, p }, exact, o: R1, unit: "kg",
    prompt: `${who}'s mass ${dir} by ${num(pAbs)}% ${period} and is now ${num(neu)} kg. What was the mass before the change, in kg?`,
    intro: `The new mass is the old mass × (1 ${p < 0 ? "−" : "+"} ${num(pAbs)}/100), so divide the new mass by that multiplier.`,
    lines: [row("_new", neu), row("_pct", p), step("_multiplier", "1 + _pct / 100", num(1 + p / 100)), step("_old", "_new / _multiplier", res(exact, R1, "kg"))],
    candidates: [neu * (1 - p / 100), neu - p, neu * (1 + p / 100)],
    given: [["_new", neu], ["_pct", p]],
    hints: [
      `The percentage is of the old mass, which you don't know yet, so don't take ${num(pAbs)}% of ${num(neu)}.`,
      `new = old × ${num(1 + p / 100)}, so divide the new mass by ${num(1 + p / 100)} (in the calculator: \`_new / (1 + _pct / 100)\`).${thenRound(R1)}`,
    ],
  });
}

const GEN = { "unit-conversions": genUnits, bmi: genBmi, "body-ratios": genRatios };

// Reverse formulas: residual in terms of a stated input.
const REV = {
  kg2lb: (k, x) => x / LB - k.kg,
  lb2kg: (k, x) => x * LB - k.lb,
  in2cm: (k, x) => x / CM - k.inch,
  cm2in: (k, x) => x * CM - k.cm,
  ftin2cm: (k, x) => x / CM - (12 * k.ft + k.inch),
  c2f: (k, x) => ((x - 32) * 5) / 9 - k.c,
  f2c: (k, x) => (x * 9) / 5 + 32 - k.f,
  stlb2kg: (k, x) => x * LB - (14 * k.st + k.lb),
  bmi: (k, x) => x * k.h * k.h - k.m,
  "mass-at-bmi": (k, x) => x / (k.h * k.h) - k.b,
  "bmi-imp": (k, x) => x * ((12 * k.ft + k.inch) * 0.0254) ** 2 - k.lb / LB,
  whtr: (k, x) => x * k.height - k.waist,
  "whtr-in": (k, x) => (x * k.height) / CM - k.win,
  "whtr-imp": (k, x) => x * (12 * k.ft + k.inch) - k.win,
  whr: (k, x) => x * k.hip - k.waist,
  "waist-for-ratio": (k, x) => x / k.height - k.r,
  diff: (k, x) => k.old + x - k.neu,
  "pct-change": (k, x) => k.old * (1 + x / 100) - k.neu,
  "mass-after-pct": (k, x) => (x / k.old - 1) * 100 - k.p,
  "old-from-pct": (k, x) => x * (1 + k.p / 100) - k.neu,
};

// Direct tests: whole feet in a height, and the inches left over (found by counting feet up).
const FOOT_CM = 12 * CM;
const CHECK = {
  "ft-of-cm": (k, x) => Number.isInteger(x) && x * FOOT_CM <= k.cm + 1e-9 && k.cm < (x + 1) * FOOT_CM,
  "in-of-cm": (k, x) => {
    let f = 0;
    while ((f + 1) * FOOT_CM <= k.cm) f++;
    return Number.isInteger(x) && Math.abs((12 * f + x) * CM - k.cm) <= 0.5 * CM + 1e-9;
  },
};

// Categories: compare the mass with each boundary × height² (no division).
const CAT = {
  bmi: (k) => {
    const h2 = k.h * k.h;
    if (k.m < 18.5 * h2) return BMI_CATS[0];
    if (k.m < 25 * h2) return BMI_CATS[1];
    if (k.m < 30 * h2) return BMI_CATS[2];
    return BMI_CATS[3];
  },
};
