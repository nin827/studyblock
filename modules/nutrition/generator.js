// Nutrition generator: energy from food, energy units, food labels and energy balance, with every
// factor and reference intake stated in the prompt. Arithmetic only, no diet advice.
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
// Nutrition: energy and label arithmetic only (no diet advice).

const KJ = 4.184; // kJ per kcal (stated in every prompt that uses it)
const FACT = { carbohydrate: 4, protein: 4, fat: 9 };
const FACTS = "carbohydrate and protein give 4 kcal per gram, fat gives 9 kcal per gram";
const MEALS = ["A sandwich", "A bowl of pasta", "A smoothie", "A breakfast", "A snack bar", "A bowl of soup", "A rice dish", "A wrap", "A salad", "A yogurt pot"];
const NAMES = ["Alex", "Priya", "Sam", "Mei", "Jordan", "Ana", "Kofi", "Lena", "Omar", "Tom", "Zara", "Luis", "Hana", "Ravi", "Noor", "Ben", "Ines", "Kai", "Maya", "Theo"];

// Typical per-100 g label values: [min, max] ranges, varied per question.
const FOODS = [
  { name: "breakfast cereal", portion: [30, 50], energy: [350, 400], fat: [1.5, 8], sugars: [5, 30], protein: [7, 12], salt: [0.2, 1.2] },
  { name: "granola", portion: [40, 60], energy: [420, 480], fat: [12, 20], sugars: [15, 25], protein: [8, 12], salt: [0.05, 0.4] },
  { name: "wholemeal bread", portion: [36, 80], energy: [220, 260], fat: [1.5, 4], sugars: [2, 5], protein: [8, 11], salt: [0.8, 1.2] },
  { name: "plain yogurt", portion: [100, 175], energy: [55, 100], fat: [0.1, 5], sugars: [3.5, 6], protein: [4, 10], salt: [0.1, 0.2] },
  { name: "tomato soup", portion: [200, 400], energy: [30, 60], fat: [0.5, 3], sugars: [3, 6], protein: [0.6, 1.5], salt: [0.4, 0.8] },
  { name: "cheddar cheese", portion: [20, 40], energy: [380, 420], fat: [30, 35], sugars: [0.1, 0.5], protein: [24, 26], salt: [1.6, 1.9] },
  { name: "crackers", portion: [20, 35], energy: [420, 480], fat: [10, 20], sugars: [1, 6], protein: [8, 11], salt: [1, 2] },
  { name: "pasta sauce", portion: [100, 175], energy: [40, 90], fat: [0.5, 5], sugars: [4, 8], protein: [1, 2.5], salt: [0.6, 1.2] },
  { name: "peanut butter", portion: [15, 30], energy: [580, 640], fat: [45, 52], sugars: [3, 7], protein: [22, 28], salt: [0.3, 1.2] },
  { name: "baked beans", portion: [150, 210], energy: [75, 100], fat: [0.2, 0.8], sugars: [4, 6], protein: [4, 5.5], salt: [0.5, 0.9] },
];
// Reference intakes as printed on many labels; every prompt states the one it uses.
const RI = { energy: 2000, fat: 70, sugars: 90, protein: 50, salt: 6 };
const UNIT = { energy: "kcal", fat: "g", sugars: "g", protein: "g", salt: "g" };
const LABEL = { energy: "energy", fat: "fat", sugars: "sugars", protein: "protein", salt: "salt" };

const tenths = (rng, [lo, hi]) => rng.int(Math.round(lo * 10), Math.round(hi * 10)) / 10;

// ---- Energy from food

function genEnergyFood(d, rng) {
  const kind = rng.pick({ easy: ["macro"], medium: ["macro-dec", "total", "grams-from-kcal"], hard: ["total-dec", "food-multi", "grams-from-kcal"] }[d]);
  const meal = rng.pick(MEALS);

  if (kind === "macro" || kind === "macro-dec") {
    const nut = rng.pick(["carbohydrate", "protein", "fat"]);
    const range = { carbohydrate: [10, 80], protein: [5, 40], fat: [2, 35] }[nut];
    const g = kind === "macro" ? rng.int(range[0], range[1]) : rng.int(range[0] * 10, range[1] * 10) / 10;
    const f = FACT[nut];
    const exact = g * f;
    return make(rng, {
      kind: "macro", values: { g, f }, exact, o: EX, unit: "kcal",
      prompt: `${meal} contains ${num(g)} g of ${nut}. How many kcal does the ${nut} provide? Use: ${FACTS}.`,
      intro: `Multiply the grams by the energy per gram of ${nut} (${f} kcal/g).`,
      lines: [row("_grams", g), step("_kcal", `_grams * ${f}`, res(exact, EX, "kcal"))],
      candidates: [g * (f === 9 ? 4 : 9), g + f, g * 7],
      given: [["_grams", g], ["_kcal_per_g", f]],
      hints: [`Each gram of ${nut} gives ${f} kcal.`, `Work out \`${num(g)} × ${f}\`.`],
    });
  }

  if (kind === "grams-from-kcal") {
    const nut = rng.pick(["carbohydrate", "protein", "fat"]);
    const f = FACT[nut];
    if (d === "hard") {
      // Hard adds a step: the nutrient's share of the total energy comes first (ticket 015).
      const total = rng.int(30, 90) * 10;
      const pct = rng.int(10, 60);
      const kcal = (total * pct) / 100;
      const exact = kcal / f;
      return make(rng, {
        kind: "grams-from-pct", values: { total, pct, f }, exact, o: R1, unit: "g",
        prompt: `${meal} provides ${total} kcal in total, and ${pct}% of that energy comes from ${nut}. How many grams of ${nut} does it contain? Use: ${FACTS}.`,
        intro: `First find the kcal from ${nut} (${pct}% of ${total} kcal), then divide by ${f} kcal per gram.`,
        lines: [row("_total", total), row("_pct", pct), step("_kcal", "_total * _pct / 100", `**${num(kcal)} kcal**`), step("_grams", `_kcal / ${f}`, res(exact, R1, "g"))],
        candidates: [kcal, total / f, kcal / (f === 9 ? 4 : 9), kcal * f],
        given: [["_total", total], ["_pct", pct]],
        hints: [
          `Only ${pct}% of the ${total} kcal comes from ${nut}: work out that share first (\`_total * _pct / 100\`).`,
          `Each gram of ${nut} gives ${f} kcal, so divide that share by ${f}.${thenRound(R1)}`,
        ],
      });
    }
    const kcal = rng.int(30, 400);
    const exact = kcal / f;
    const o = R1;
    return make(rng, {
      kind, values: { kcal, f }, exact, o, unit: "g",
      prompt: `${meal} gets ${kcal} kcal from ${nut}. How many grams of ${nut} does it contain? Use: ${FACTS}.`,
      intro: `Each gram of ${nut} gives ${f} kcal, so divide the kcal by ${f}.`,
      lines: [row("_kcal", kcal), step("_grams", `_kcal / ${f}`, res(exact, o, "g"))],
      candidates: [kcal * f, kcal / (f === 9 ? 4 : 9), kcal / 7],
      given: [["_kcal", kcal], ["_kcal_per_g", f]],
      hints: [`Each gram of ${nut} gives ${f} kcal, so ask how many lots of ${f} kcal there are.`, `Work out \`${kcal} ÷ ${f}\`.${thenRound(o)}`],
    });
  }

  const dec = kind !== "total";
  const C = dec ? rng.int(100, 900) / 10 : rng.int(10, 90);
  const P = dec ? rng.int(30, 450) / 10 : rng.int(3, 45);
  const F = dec ? rng.int(20, 400) / 10 : rng.int(2, 40);
  const kc = 4 * C;
  const kp = 4 * P;
  const kf = 9 * F;
  const total = kc + kp + kf;
  const lines = [
    row("_carb", C), row("_protein", P), row("_fat", F),
    step("_total", "_carb * 4 + _protein * 4 + _fat * 9", `${num(kc)} + ${num(kp)} + ${num(kf)} = ${res(total, dec ? R0 : EX, "kcal")}`),
  ];
  const prompt = `${meal} contains ${num(C)} g of carbohydrate, ${num(P)} g of protein and ${num(F)} g of fat. Use: ${FACTS}.`;
  const given = [["_carb", C], ["_protein", P], ["_fat", F]];

  if (kind === "food-multi") {
    return makeMulti({
      values: { C, P, F },
      prompt,
      parts: [
        { id: "fat", label: "Energy from fat", ask: "How many kcal come from the fat?", kind: "fat-kcal", exact: kf, o: EX, hint: `Multiply the grams of fat, ${num(F)}, by 9.` },
        { id: "total", label: "Total energy", ask: "What is the total energy, in kcal?", kind: "total", exact: total, o: R0, hint: "Work out the kcal from carbohydrate and protein (× 4 each) and add the kcal from fat." },
      ],
      intro: `Multiply each nutrient's grams by its energy per gram, then add: ${FACTS}.`,
      lines: [...lines.slice(0, 3), step("_fat_kcal", "_fat * 9", `**${num(kf)} kcal**`), lines[3]],
      given,
    });
  }

  const o = dec ? R0 : EX;
  return make(rng, {
    kind: "total", values: { C, P, F }, exact: total, o, unit: "kcal",
    prompt: `${prompt} What is its total energy, in kcal?`,
    intro: `Multiply each nutrient's grams by its energy per gram, then add.`,
    lines,
    candidates: [4 * (C + P + F), 9 * C + 4 * P + 4 * F, C + P + F],
    given,
    hints: [
      `Carbohydrate: \`${num(C)} × 4\`. Protein: \`${num(P)} × 4\`. Fat: \`${num(F)} × 9\`.`,
      `Add the three amounts (in the calculator: \`_carb * 4 + _protein * 4 + _fat * 9\`).${thenRound(o)}`,
    ],
  });
}

// ---- Energy units

function genUnitsE(d, rng) {
  const kind = rng.pick({ easy: ["kcal2kj", "kj2kcal"], medium: ["kcal2kj", "kj2kcal", "label-kj"], hard: ["mj2kcal", "kcal2mj", "kj-multi"] }[d]);
  const NOTE = "Use 1 kcal = 4.184 kJ.";

  if (kind === "kcal2kj") {
    const kcal = d === "easy" ? 10 * rng.int(5, 90) : rng.int(1200, 3200);
    const what = d === "easy" ? `${rng.pick(MEALS)} provides ${kcal} kcal.` : `${rng.pick(NAMES)}'s food diary for one day adds up to ${kcal} kcal.`;
    const exact = kcal * KJ;
    return make(rng, {
      kind, values: { kcal }, exact, o: R0, unit: "kJ",
      prompt: `${what} What is this in kilojoules (kJ)? ${NOTE}`,
      intro: "A kilojoule is smaller than a kilocalorie, so multiply by 4.184.",
      lines: [row("_kcal", kcal), step("_kj", "_kcal * 4.184", res(exact, R0, "kJ"))],
      candidates: [kcal / KJ, kcal * 4, kcal * 4.2 + 10],
      given: [["_kcal", kcal], ["_kj_per_kcal", KJ]],
      hints: ["Every kcal is 4.184 kJ, so the number of kJ is bigger.", `Work out \`${kcal} × 4.184\`.${thenRound(R0)}`],
    });
  }

  if (kind === "kj2kcal") {
    const kj = d === "easy" ? rng.int(200, 3500) : rng.int(5000, 13000);
    const o = d === "easy" ? R0 : R1;
    const what = d === "easy" ? `${rng.pick(MEALS)} provides ${kj} kJ.` : `A day's food adds up to ${kj} kJ.`;
    const exact = kj / KJ;
    return make(rng, {
      kind, values: { kj }, exact, o, unit: "kcal",
      prompt: `${what} What is this in kilocalories (kcal)? ${NOTE}`,
      intro: "A kilocalorie is bigger than a kilojoule, so divide by 4.184.",
      lines: [row("_kj", kj), step("_kcal", "_kj / 4.184", res(exact, o, "kcal"))],
      candidates: [kj * KJ, kj / 4, kj / 4.2 - 10],
      given: [["_kj", kj], ["_kj_per_kcal", KJ]],
      hints: ["Every kcal is 4.184 kJ, so the number of kcal is smaller.", `Work out \`${kj} ÷ 4.184\`.${thenRound(o)}`],
    });
  }

  if (kind === "label-kj") {
    const food = rng.pick(FOODS);
    const kcal100 = rng.int(food.energy[0], food.energy[1]);
    const kj100 = Math.round(kcal100 * KJ);
    const portion = rng.int(food.portion[0], food.portion[1]);
    const exact = ((kj100 / KJ) * portion) / 100;
    return make(rng, {
      kind: "portion-kcal", values: { kj100, portion }, exact, o: R0, unit: "kcal",
      prompt: `A label for ${food.name} gives ${kj100} kJ per 100 g. How many kcal are in a ${portion} g portion? ${NOTE}`,
      intro: "Scale from 100 g to the portion, and change kJ to kcal (in either order).",
      lines: [row("_kj100", kj100), row("_portion", portion), step("_kj", "_kj100 * _portion / 100", `${num((kj100 * portion) / 100)} kJ`), step("_kcal", "_kj / 4.184", res(exact, R0, "kcal"))],
      candidates: [(kj100 * portion) / 100, kj100 / KJ, ((kj100 * KJ) * portion) / 100],
      given: [["_kj100", kj100], ["_portion", portion]],
      hints: [`Energy in the portion, in kJ: \`${kj100} × ${portion} ÷ 100\` (in the calculator: \`_kj100 * _portion / 100\`).`, `Divide the kJ by 4.184 to get kcal.${thenRound(R0)}`],
    });
  }

  if (kind === "mj2kcal") {
    const mj = rng.int(500, 1300) / 100;
    const exact = (mj * 1000) / KJ;
    return make(rng, {
      kind, values: { mj }, exact, o: R0, unit: "kcal",
      prompt: `An estimate of daily energy use is ${num(mj)} MJ (megajoules). What is this in kcal? Use 1 MJ = 1000 kJ and 1 kcal = 4.184 kJ.`,
      intro: "Change MJ to kJ, then kJ to kcal.",
      lines: [row("_mj", mj), step("_kj", "_mj * 1000", `${num(mj * 1000)} kJ`), step("_kcal", "_kj / 4.184", res(exact, R0, "kcal"))],
      candidates: [mj * 1000 * KJ, (mj * 100) / KJ, mj * 1000],
      given: [["_mj", mj], ["_kj_per_mj", 1000], ["_kj_per_kcal", KJ]],
      hints: [`Change to kJ first: \`${num(mj)} × 1000\`.`, `Divide the kJ by 4.184.${thenRound(R0)}`],
    });
  }

  if (kind === "kcal2mj") {
    const kcal = rng.int(1400, 3200);
    const exact = (kcal * KJ) / 1000;
    return make(rng, {
      kind, values: { kcal }, exact, o: R2, unit: "MJ",
      prompt: `A day's food diary adds up to ${kcal} kcal. What is this in megajoules (MJ)? Use 1 kcal = 4.184 kJ and 1 MJ = 1000 kJ.`,
      intro: "Change kcal to kJ, then kJ to MJ.",
      lines: [row("_kcal", kcal), step("_kj", "_kcal * 4.184", `${num(kcal * KJ)} kJ`), step("_mj", "_kj / 1000", res(exact, R2, "MJ"))],
      candidates: [kcal / KJ / 1000, (kcal * KJ) / 100, kcal / 1000],
      given: [["_kcal", kcal], ["_kj_per_kcal", KJ], ["_kj_per_mj", 1000]],
      hints: [`Change to kJ first: \`${kcal} × 4.184\`.`, `Divide the kJ by 1000 to get MJ.${thenRound(R2)}`],
    });
  }

  // kj-multi: per 100 g in kJ → kcal per 100 g, then kcal per portion.
  const food = rng.pick(FOODS);
  const kj100 = Math.round(rng.int(food.energy[0], food.energy[1]) * KJ);
  const portion = rng.int(food.portion[0], food.portion[1]);
  const k100 = kj100 / KJ;
  const kp = (k100 * portion) / 100;
  return makeMulti({
    values: { kj100, portion, kj: kj100 },
    prompt: `A label for ${food.name} gives ${kj100} kJ per 100 g. A portion is ${portion} g. ${NOTE} Work from the kJ figure, not from a rounded answer.`,
    parts: [
      { id: "per100", label: "Per 100 g", ask: "How many kcal are in 100 g?", kind: "kj2kcal", exact: k100, o: R0, hint: `Divide ${kj100} by 4.184.` },
      { id: "portion", label: "Per portion", ask: "How many kcal are in one portion?", kind: "portion-kcal", exact: kp, o: R0, hint: `Scale from 100 g to ${portion} g: multiply the unrounded kcal per 100 g by ${portion}, then divide by 100.` },
    ],
    intro: "Change the label's kJ to kcal, then scale from 100 g to the portion.",
    lines: [row("_kj100", kj100), row("_portion", portion), step("_kcal100", "_kj100 / 4.184", res(k100, R0, "kcal")), step("_kcal_portion", "_kcal100 * _portion / 100", res(kp, R0, "kcal"))],
    given: [["_kj100", kj100], ["_portion", portion]],
  });
}

// ---- Food labels

function genLabels(d, rng) {
  const kind = rng.pick({ easy: ["portion"], medium: ["portion", "pct-ri"], hard: ["pct-ri-100", "portion-for", "label-multi"] }[d]);
  const food = rng.pick(FOODS);
  const nut = rng.pick(["energy", "fat", "sugars", "protein", "salt"]);
  const per100 = nut === "energy" ? rng.int(food.energy[0], food.energy[1]) : tenths(rng, food[nut]);
  if (per100 <= 0) return null;
  const portion = d === "easy" ? 5 * rng.int(Math.ceil(food.portion[0] / 5), Math.floor(food.portion[1] / 5)) : rng.int(food.portion[0], food.portion[1]);
  const u = UNIT[nut];
  const lab = LABEL[nut];
  const amount = (per100 * portion) / 100;
  const oAmt = nut === "energy" ? R0 : nut === "salt" ? R2 : R1;
  const riText = `The label uses a reference intake (RI) of ${RI[nut]} ${u} of ${lab} a day.`;
  const SCALE = "amount per portion = amount per 100 g × portion (g) ÷ 100";
  const PCTRI = "% RI = amount ÷ reference intake × 100";

  if (kind === "portion") {
    return make(rng, {
      kind, values: { per100, portion }, exact: amount, o: oAmt, unit: u,
      prompt: `A label for ${food.name} shows ${num(per100)} ${u} of ${lab} per 100 g. How much ${lab} is in a ${portion} g portion, in ${u}? Use ${SCALE}.`,
      intro: "Label values per 100 g scale in proportion to the portion size.",
      lines: [row("_per100", per100), row("_portion", portion), step("_amount", "_per100 * _portion / 100", res(amount, oAmt, u))],
      candidates: [(per100 * 100) / portion, per100 * portion, per100 + portion / 100],
      given: [["_per100", per100], ["_portion", portion]],
      hints: [`A ${portion} g portion is ${portion}/100 of the 100 g amount.`, `Work out \`${num(per100)} × ${portion} ÷ 100\` (in the calculator: \`_per100 * _portion / 100\`).${thenRound(oAmt)}`],
    });
  }

  if (kind === "pct-ri") {
    const amt = roundTo(amount, oAmt.dp);
    if (!(amt > 0)) return null;
    const exact = (amt / RI[nut]) * 100;
    return make(rng, {
      kind, values: { amount: amt, ri: RI[nut] }, exact, o: R0, unit: "%",
      prompt: `A portion of ${food.name} contains ${num(amt)} ${u} of ${lab}. ${riText} What percentage of the RI is this? Use ${PCTRI}.${PCT_NOTE}`,
      intro: `Use ${PCTRI}.`,
      lines: [row("_amount", amt), row("_ri", RI[nut]), step("_pct", "_amount / _ri * 100", res(exact, R0, "%"))],
      candidates: [(RI[nut] / amt) * 100, amt / RI[nut], (amt / 100) * RI[nut]],
      given: [["_amount", amt], ["_ri", RI[nut]]],
      hints: [`Divide the amount by the reference intake: \`${num(amt)} ÷ ${RI[nut]}\`.`, `Multiply by 100 to turn the fraction into a percentage (in the calculator: \`_amount / _ri * 100\`).${thenRound(R0)}`],
    });
  }

  if (kind === "pct-ri-100" || kind === "label-multi") {
    const pct = (amount / RI[nut]) * 100;
    const prompt = `A label for ${food.name} shows ${num(per100)} ${u} of ${lab} per 100 g. A portion is ${portion} g. ${riText}`;
    const lines = [row("_per100", per100), row("_portion", portion), row("_ri", RI[nut]), step("_amount", "_per100 * _portion / 100", res(amount, oAmt, u)), step("_pct", "_amount / _ri * 100", res(pct, R1, "%"))];
    const given = [["_per100", per100], ["_portion", portion], ["_ri", RI[nut]]];
    if (kind === "label-multi") {
      return makeMulti({
        values: { per100, portion, ri: RI[nut] },
        prompt: `${prompt} Use ${SCALE}, and ${PCTRI}. Work from the unrounded amount.`,
        parts: [
          { id: "amount", label: "Per portion", ask: `How much ${lab} is in one portion, in ${u}?`, kind: "portion", exact: amount, o: oAmt, hint: `Multiply ${num(per100)} by ${portion}, then divide by 100.` },
          { id: "pct", label: "% of RI", ask: `What percentage of the RI is one portion?${PCT_NOTE}`, kind: "pct-ri-100", exact: pct, o: R1, hint: `Divide the amount per portion by ${RI[nut]}, then multiply by 100.` },
        ],
        intro: "Scale the label to the portion, then compare with the reference intake.",
        lines,
        given,
      });
    }
    return make(rng, {
      kind, values: { per100, portion, ri: RI[nut] }, exact: pct, o: R1, unit: "%",
      prompt: `${prompt} What percentage of the RI does one portion provide? Use ${SCALE}, and ${PCTRI}.${PCT_NOTE}`,
      intro: "Scale the label to the portion first, then compare with the reference intake.",
      lines,
      candidates: [(per100 / RI[nut]) * 100, (amount / RI[nut]) * 1000, ((per100 * 100) / portion / RI[nut]) * 100],
      given,
      hints: [
        `Amount in the portion: \`${num(per100)} × ${portion} ÷ 100\` (in the calculator: \`_amount = _per100 * _portion / 100\`).`,
        `Divide that amount by ${RI[nut]} and multiply by 100 (in the calculator: \`_amount / _ri * 100\`).${thenRound(R1)}`,
      ],
    });
  }

  // portion-for: how many grams of the food contain a stated amount.
  const target = nut === "energy" ? 10 * rng.int(5, 40) : nut === "salt" ? rng.int(1, 15) / 10 : rng.int(2, 30);
  const exact = (target * 100) / per100;
  if (exact < 5 || exact > 600) return null;
  return make(rng, {
    kind, values: { per100, target }, exact, o: R0, unit: "g",
    prompt: `A label for ${food.name} shows ${num(per100)} ${u} of ${lab} per 100 g. How many grams of ${food.name} contain ${num(target)} ${u} of ${lab}? Use grams = amount wanted × 100 ÷ amount per 100 g.`,
    intro: "Each gram of the food has 1/100 of the per-100 g amount, so scale up from that.",
    lines: [row("_per100", per100), row("_target", target), step("_grams", "_target * 100 / _per100", res(exact, R0, "g"))],
    candidates: [(per100 * 100) / target, (target * per100) / 100, target * 100],
    given: [["_per100", per100], ["_target", target]],
    hints: [`Find the amount in 1 g first: \`${num(per100)} ÷ 100\`.`, `Divide ${num(target)} by the amount in 1 g (in the calculator: \`_target * 100 / _per100\`).${thenRound(R0)}`],
  });
}

// ---- Energy balance

function genBalance(d, rng) {
  const kind = rng.pick({ easy: ["net"], medium: ["week", "avg", "pct-fat"], hard: ["pct-macro", "balance-multi", "avg"] }[d]);
  const who = rng.pick(NAMES);
  const BAL = "energy balance = energy in − energy out";
  const NEG_NOTE = " If more energy is used than taken in, the answer is negative.";

  if (kind === "net") {
    const ein = 10 * rng.int(160, 320);
    let eout = 10 * rng.int(170, 300);
    if (eout === ein) eout += 50;
    const exact = ein - eout;
    return make(rng, {
      kind, values: { ein, eout }, exact, o: EX, unit: "kcal", allowNeg: true,
      prompt: `${who}'s food diary records ${ein} kcal eaten in a day, and the estimated energy used that day is ${eout} kcal. What is the energy balance for the day, in kcal? Use ${BAL}.${NEG_NOTE}`,
      intro: `Use ${BAL}. A negative balance means more energy was used than taken in.`,
      lines: [row("_in", ein), row("_out", eout), step("_balance", "_in - _out", res(exact, EX, "kcal"))],
      candidates: [-exact, ein + eout, (ein + eout) / 2],
      given: [["_in", ein], ["_out", eout]],
      hints: ["Start from the energy taken in and take away the energy used.", `Work out \`${ein} − ${eout}\` (in the calculator: \`_in - _out\`).`],
    });
  }

  if (kind === "week") {
    const ein = 10 * rng.int(170, 300);
    let eout = 10 * rng.int(180, 290);
    if (eout === ein) eout -= 40;
    const exact = (ein - eout) * 7;
    return make(rng, {
      kind, values: { ein, eout }, exact, o: EX, unit: "kcal", allowNeg: true,
      prompt: `Over a week, ${who} takes in an average of ${ein} kcal a day and uses an estimated ${eout} kcal a day. What is the energy balance for the whole week, in kcal? Use ${BAL}.${NEG_NOTE}`,
      intro: "Find the balance for one day, then multiply by 7 days.",
      lines: [row("_in", ein), row("_out", eout), step("_day", "_in - _out", `${ein - eout} kcal`), step("_week", "_day * 7", res(exact, EX, "kcal"))],
      candidates: [ein - eout, -exact, (ein - eout) * 5],
      given: [["_in", ein], ["_out", eout]],
      hints: [`Balance for one day: \`${ein} − ${eout}\`.`, "Multiply the daily balance by the number of days in a week (in the calculator: `(_in - _out) * 7`)."],
    });
  }

  if (kind === "avg") {
    const n = d === "hard" ? rng.int(4, 5) : 3;
    const days = Array.from({ length: n }, () => rng.int(1500, 3200));
    const sum = days.reduce((a, b) => a + b, 0);
    const exact = sum / n;
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const list = days.map((v, i) => `${DAYS[i]} ${v} kcal`).join(", ");
    const labels = days.map((_, i) => `_${DAYS[i].slice(0, 3).toLowerCase()}`);
    return make(rng, {
      kind, values: { sum, n }, exact, o: R0, unit: "kcal",
      prompt: `A food diary records these daily totals: ${list}. What is the mean daily energy intake, in kcal? Use mean = total ÷ number of days.`,
      intro: "Add the daily totals, then divide by the number of days.",
      lines: [...days.map((v, i) => row(labels[i], v)), step("_total", labels.join(" + "), `${sum} kcal`), step("_mean", `_total / ${n}`, res(exact, R0, "kcal"))],
      candidates: [sum / (n - 1), sum / (n + 1), (Math.max(...days) + Math.min(...days)) / 2],
      given: days.map((v, i) => [labels[i], v]),
      hints: [`Add all ${n} daily totals (in the calculator: \`${labels.join(" + ")}\`).`, `Divide the total by ${n}, the number of days.${thenRound(R0)}`],
    });
  }

  if (kind === "pct-fat") {
    const total = 10 * rng.int(150, 300);
    const fat = rng.int(40, 110);
    const exact = ((fat * 9) / total) * 100;
    return make(rng, {
      kind, values: { total, fat }, exact, o: R1, unit: "%",
      prompt: `A day's food provides ${total} kcal in total, including ${fat} g of fat. What percentage of the energy comes from fat? Fat gives 9 kcal per gram. Use % = energy from fat ÷ total energy × 100.${PCT_NOTE}`,
      intro: "Turn the grams of fat into kcal first, then compare with the total.",
      lines: [row("_total", total), row("_fat", fat), step("_fat_kcal", "_fat * 9", `${fat * 9} kcal`), step("_pct", "_fat_kcal / _total * 100", res(exact, R1, "%"))],
      candidates: [(fat / total) * 100, ((fat * 4) / total) * 100, (total / (fat * 9))],
      given: [["_total", total], ["_fat", fat]],
      hints: [`Energy from fat: \`${fat} × 9\` kcal.`, `Divide that by ${total} and multiply by 100 (in the calculator: \`_fat * 9 / _total * 100\`).${thenRound(R1)}`],
    });
  }

  // pct-macro / balance-multi: grams of all three → share of energy from one of them.
  const C = rng.int(150, 350);
  const P = rng.int(50, 130);
  const F = rng.int(40, 110);
  const total = 4 * C + 4 * P + 9 * F;
  const nut = kind === "balance-multi" ? "fat" : rng.pick(["carbohydrate", "protein", "fat"]);
  const g = { carbohydrate: C, protein: P, fat: F }[nut];
  const f = FACT[nut];
  const exact = ((g * f) / total) * 100;
  const prompt = `${who}'s food for one day contains ${C} g of carbohydrate, ${P} g of protein and ${F} g of fat. Use: ${FACTS}.`;
  const lines = [
    row("_carb", C), row("_protein", P), row("_fat", F),
    step("_total", "_carb * 4 + _protein * 4 + _fat * 9", `${total} kcal`),
    step(`_${nut.slice(0, 4)}_kcal`, `_${nut === "carbohydrate" ? "carb" : nut} * ${f}`, `${g * f} kcal`),
    step("_pct", `_${nut.slice(0, 4)}_kcal / _total * 100`, res(exact, R1, "%")),
  ];
  const given = [["_carb", C], ["_protein", P], ["_fat", F]];
  if (kind === "balance-multi") {
    return makeMulti({
      values: { C, P, F, g: F, f: 9 },
      prompt: `${prompt} Use % from fat = energy from fat ÷ total energy × 100.`,
      parts: [
        { id: "fat", label: "Energy from fat", ask: "How many kcal come from fat?", kind: "fat-kcal", exact: 9 * F, o: EX, hint: `Multiply the grams of fat, ${F}, by 9.` },
        { id: "total", label: "Total energy", ask: "What is the total energy, in kcal?", kind: "total", exact: total, o: EX, hint: "Multiply carbohydrate and protein by 4, fat by 9, and add the three." },
        { id: "pct", label: "% from fat", ask: `What percentage of the energy comes from fat?${PCT_NOTE}`, kind: "pct-macro", exact, o: R1, hint: "Divide the energy from fat by the total energy, then multiply by 100." },
      ],
      intro: "Find each nutrient's energy, add them up, then work out fat's share.",
      lines,
      given,
    });
  }
  return make(rng, {
    kind: "pct-macro", values: { C, P, F, g, f }, exact, o: R1, unit: "%",
    prompt: `${prompt} What percentage of the day's energy comes from ${nut}? Use % = energy from ${nut} ÷ total energy × 100.${PCT_NOTE}`,
    intro: "Work out the total energy, then the energy from one nutrient as a share of it.",
    lines,
    candidates: [(g / (C + P + F)) * 100, ((g * (f === 9 ? 4 : 9)) / total) * 100, ((g * f) / (4 * (C + P + F))) * 100],
    given,
    hints: [
      `Total energy: \`${C} × 4 + ${P} × 4 + ${F} × 9\` (in the calculator: \`_carb * 4 + _protein * 4 + _fat * 9\`).`,
      `Energy from ${nut}: \`${g} × ${f}\`.`,
      `Divide the energy from ${nut} by the total and multiply by 100.${thenRound(R1)}`,
    ],
  });
}

const GEN = { "energy-from-food": genEnergyFood, "energy-units": genUnitsE, "food-labels": genLabels, "energy-balance": genBalance };

// Reverse formulas: residual in terms of a stated input.
const REV = {
  macro: (k, x) => x / k.f - k.g,
  "grams-from-kcal": (k, x) => x * k.f - k.kcal,
  "grams-from-pct": (k, x) => (x * k.f * 100) / k.total - k.pct,
  total: (k, x) => (x - 9 * k.F) / 4 - (k.C + k.P),
  "fat-kcal": (k, x) => x / 9 - k.F,
  kcal2kj: (k, x) => x / KJ - k.kcal,
  kj2kcal: (k, x) => x * KJ - k.kj,
  "portion-kcal": (k, x) => (x * KJ * 100) / k.portion - k.kj100,
  mj2kcal: (k, x) => (x * KJ) / 1000 - k.mj,
  kcal2mj: (k, x) => (x * 1000) / KJ - k.kcal,
  portion: (k, x) => (x * 100) / k.portion - k.per100,
  "pct-ri": (k, x) => (x * k.ri) / 100 - k.amount,
  "pct-ri-100": (k, x) => (((x * k.ri) / 100) * 100) / k.portion - k.per100,
  "portion-for": (k, x) => (x * k.per100) / 100 - k.target,
  net: (k, x) => k.eout + x - k.ein,
  week: (k, x) => x / 7 + k.eout - k.ein,
  avg: (k, x) => x * k.n - k.sum,
  "pct-fat": (k, x) => (x * k.total) / 100 / 9 - k.fat,
  // share × total energy, with the total rebuilt from the other two nutrients plus this one.
  "pct-macro": (k, x) => ((x / 100) * (4 * k.C + 4 * k.P + 9 * k.F)) / k.f - k.g,
};
const CHECK = {};
const CAT = {};
