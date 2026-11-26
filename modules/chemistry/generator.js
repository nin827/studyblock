import {
  parseFormula, formulaMass as molarMass, massList, massExpr, prettyFormula as pretty, elementName, ar,
} from "../../js/lib/chem.js";

// Chemistry generator: moles, concentration, balancing equations, percent composition and
// empirical / molecular formulae. Uses only the seeded rng passed in by the engine.
// Every prompt states the atomic masses (or molar mass) it relies on, its units and its rounding.
// Rounded answers are accepted within half a unit of the stated precision; exact answers must match.
// Explanations list every step as a labelled calculator row, e.g. `_M = 2*1 + 16` → 18.

// ---------------------------------------------------------------------------------------------
// Number helpers

// Round half away from zero (the 1e-9 nudge absorbs binary error, e.g. 2.525*100 = 252.4999...): mathutil.
import { roundTo } from "../../js/lib/mathutil.js";

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

// Given values and intermediate steps: shortest form (up to 6 decimals); never "-0".
const num = (n) => String(roundTo(n, 6));

// Intermediate values in explanations: up to 4 decimals.
const num4 = (n) => String(roundTo(n, 4));

const decimals = (s) => (String(s).split(".")[1] || "").length;

// Answer/choice formatter. o = { dp, rounded, integer, allowNeg }.
function fmtAns(v, o) {
  if (o.rounded) {
    const r = roundTo(v, o.dp);
    return r.toFixed(o.dp);
  }
  return num(v);
}

const roundNote = (dp) => (dp === 0 ? " Round to the nearest whole number." : dp === 1 ? " Round to 1 decimal place." : ` Round to ${dp} decimal places.`);
const EXACT = " Give the exact value.";
const WHOLE = " Give a whole number.";

// 4 unique choices: the answer + 3 distractors from common mistakes, topped up with nearby values.
// No distractor is within the tolerance of the answer; no zero (or negative, unless allowed) options.
function buildChoices(ansStr, ansVal, tol, candidates, o, rng) {
  const seen = new Set([ansStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || typeof v !== "number" || !Number.isFinite(v)) return;
    let s;
    if (o.rounded) s = fmtAns(v, o);
    else {
      if (!isClean(v, 4)) return;
      s = num(v);
      if (o.integer && !Number.isInteger(Number(s))) return;
    }
    const x = Number(s);
    if (x === 0 || (!o.allowNeg && x < 0)) return;
    if (seen.has(s) || Math.abs(x - ansVal) <= tol + 1e-9) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k <= 40; k++) {
    if (o.integer) {
      tryAdd(ansVal + k);
      tryAdd(ansVal - k);
    } else {
      tryAdd(ansVal * (1 + 0.1 * k));
      tryAdd(ansVal * (1 - 0.1 * k));
    }
  }
  const step = o.rounded ? 10 ** -o.dp : o.integer ? 1 : 10 ** -decimals(ansStr);
  for (let k = 1; out.length < 3 && k <= 40; k++) tryAdd(ansVal + k * step);
  if (out.length < 3) return null;
  return rng.shuffle([ansStr, ...out]);
}

// Pre-filled calculator rows: the explanation's plain-number rows (`_x = 12` with no "→") whose value
// is a number stated in the prompt. Labels therefore match the explanation. Rounding instructions and
// "(for example …)" hints are ignored when reading the prompt's numbers.
function promptNumbers(prompt) {
  const text = String(prompt)
    .replace(/\(for example[^)]*\)/g, "")
    .replace(/Round to [^.]*\./g, "");
  return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}

function givenFrom(prompt, explanation) {
  const nums = new Set(promptNumbers(prompt));
  const out = [];
  const seen = new Set();
  for (const m of String(explanation).matchAll(/^- `(_[A-Za-z0-9_]{1,23}) = (-?\d+(?:\.\d+)?)`(?: \([^)]*\))?$/gm)) {
    const label = m[1];
    const value = Number(m[2]);
    if (!Number.isFinite(value) || !nums.has(value) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, value });
  }
  return out.slice(0, 8);
}

// Attach `given` to a question with two or more numeric inputs. Returns false when a given value
// equals the answer (the case is then regenerated so the pre-filled rows never show the answer).
function withGiven(q, answerValues) {
  const g = givenFrom(q.prompt, q.explanation);
  if (g.some((x) => answerValues.some((a) => Number.isFinite(a) && Math.abs(x.value - a) < 1e-9))) return false;
  if (g.length && promptNumbers(q.prompt).length >= 2) q.given = g;
  return true;
}

// Turn a solved question into a typed-number or (~35%) multiple-choice question.
// Returns null when the case must be regenerated (rounding tie, zero answer, inexact "exact" answer).
function finish(base, exact, o, candidates, rng) {
  if (!Number.isFinite(exact)) return null;
  const tol = o.rounded ? 0.5 * 10 ** -o.dp : 0;
  if (o.rounded) {
    if (nearTie(exact, o.dp) || roundTo(exact, o.dp) === 0) return null;
  } else if (!isClean(exact, 6)) return null;
  const ansStr = fmtAns(exact, o);
  const ansVal = Number(ansStr);
  if (o.integer && !Number.isInteger(ansVal)) return null;
  if (!o.allowNeg && !(ansVal > 0)) return null;
  const q = {
    ...base,
    tolerance: tol,
    params: { ...base.params, dp: o.dp, rounded: !!o.rounded, integer: !!o.integer },
  };
  if (base.params.kind !== "balance" && !withGiven(q, [ansVal, exact])) return null;
  if (rng.next() < 0.35) {
    const choices = buildChoices(ansStr, ansVal, tol, candidates, o, rng);
    if (!choices) return null;
    return { ...q, answer: ansStr, answerType: "choice", choices };
  }
  return { ...q, answer: ansVal, answerType: "number", choices: undefined };
}

// Calculator rows for the explanation (rendered as a markdown list).
const given = (label, v, unit = "") => `- \`${label} = ${num(v)}\`${unit ? ` (${unit})` : ""}`;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;
const explain = (intro, lines, outro = "") => `${intro}\n\n${lines.join("\n")}${outro ? `\n\n${outro}` : ""}`;

// The value shown on the last row: "**18 g**" or "0.4167, which rounds to **0.417 mol**".
function final(exact, o, unit) {
  const shown = fmtAns(exact, o);
  const dressed = unit ? `${shown} ${unit}` : shown;
  if (!o.rounded || Math.abs(exact - Number(shown)) < 1e-9) return `**${dressed}**`;
  return `${num4(exact)}, which rounds to **${dressed}**`;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------
// Guided-mode hints. Built only from values already drawn (never calls rng).

// " (in the calculator: `_n * _M`)" when every label in expr is one of the question's given rows
// (the same rule as withGiven), otherwise "".
function calcFor(prompt, explanation) {
  const have = new Set(promptNumbers(prompt).length >= 2 ? givenFrom(prompt, explanation).map((g) => g.label) : []);
  return (expr) => {
    const labels = expr.match(/_[A-Za-z0-9_]+/g) || [];
    return labels.length && labels.every((l) => have.has(l)) ? ` (in the calculator: \`${expr}\`)` : "";
  };
}

// "2*1 + 16" -> "2 × 1 + 16"
const times = (e) => e.replace(/\*/g, " × ");
const roundHint = (o) => (o && o.rounded ? ` Then${roundNote(o.dp).replace(" Round", " round")}` : "");

// ---------------------------------------------------------------------------------------------
// Chemistry data

// Element data, formula parsing and molar masses come from the shared chemistry library.
const EL_NAME = elementName;

// Elements in order of first appearance in the formula.
const elementsOf = (f) => Object.keys(parseFormula(f));

// "the atomic masses H = 1, S = 32, O = 16" for the elements a list of formulas needs.
function massNote(formulas) {
  const els = new Set();
  for (const f of formulas) for (const el of elementsOf(f)) els.add(el);
  return `the atomic mass${els.size === 1 ? "" : "es"} ${massList(formulas)}`;
}

const COMPOUNDS = [
  ["water", "H2O"], ["carbon dioxide", "CO2"], ["sodium chloride", "NaCl"], ["sodium hydroxide", "NaOH"],
  ["calcium carbonate", "CaCO3"], ["magnesium oxide", "MgO"], ["methane", "CH4"], ["ammonia", "NH3"],
  ["oxygen gas", "O2"], ["nitrogen gas", "N2"], ["sulfuric acid", "H2SO4"], ["hydrogen chloride", "HCl"],
  ["glucose", "C6H12O6"], ["potassium chloride", "KCl"], ["copper(II) sulfate", "CuSO4"], ["ethanol", "C2H5OH"],
  ["iron(III) oxide", "Fe2O3"], ["aluminium oxide", "Al2O3"], ["sodium carbonate", "Na2CO3"], ["calcium chloride", "CaCl2"],
  ["potassium nitrate", "KNO3"], ["zinc oxide", "ZnO"], ["copper(II) oxide", "CuO"], ["calcium hydroxide", "Ca(OH)2"],
  ["sulfur dioxide", "SO2"], ["nitric acid", "HNO3"], ["magnesium chloride", "MgCl2"], ["silver nitrate", "AgNO3"],
  ["sodium hydrogen carbonate", "NaHCO3"], ["ammonium sulfate", "(NH4)2SO4"], ["potassium hydroxide", "KOH"], ["propane", "C3H8"],
  ["calcium oxide", "CaO"], ["ammonium chloride", "NH4Cl"], ["magnesium sulfate", "MgSO4"], ["sodium sulfate", "Na2SO4"],
];

// Substances that dissolve readily in water, for the concentration questions.
const SOLUTES = [
  ["sodium chloride", "NaCl"], ["sodium hydroxide", "NaOH"], ["potassium chloride", "KCl"], ["copper(II) sulfate", "CuSO4"],
  ["sodium carbonate", "Na2CO3"], ["calcium chloride", "CaCl2"], ["potassium nitrate", "KNO3"], ["hydrochloric acid", "HCl"],
  ["sulfuric acid", "H2SO4"], ["nitric acid", "HNO3"], ["magnesium chloride", "MgCl2"], ["silver nitrate", "AgNO3"],
  ["glucose", "C6H12O6"], ["potassium hydroxide", "KOH"], ["ammonium chloride", "NH4Cl"], ["magnesium sulfate", "MgSO4"],
  ["sodium sulfate", "Na2SO4"], ["ammonium sulfate", "(NH4)2SO4"], ["sodium hydrogen carbonate", "NaHCO3"],
];

const L_AVO = 6.02; // Avogadro constant, in units of 10²³ per mol

function checkDifficulty(d, allowed = ["easy", "medium", "hard"]) {
  if (!allowed.includes(d)) throw new Error(`Unknown difficulty: ${d}`);
}

// ---------------------------------------------------------------------------------------------
// Moles: n = m / M

const NICE_N = [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

function genMoles(d, rng) {
  checkDifficulty(d);
  const [name, f] = rng.pick(COMPOUNDS);
  const counts = parseFormula(f);
  const M = molarMass(counts);
  const P = pretty(f);
  const what = `${name} (${P})`;
  const mLine = d === "easy" ? given("_M", M, "g/mol") : step("_M", massExpr(f), `${num(M)} g/mol`);
  const mIntro = d === "easy" ? "" : ` First add up the molar mass of ${P} from the atomic masses.`;
  const mGiven = d === "easy" ? `The molar mass of ${what} is ${num(M)} g/mol.` : `Use ${massNote([f])}.`;
  let kind, prompt, exact, unit, intro, lines, candidates, values, o, hintFn;
  // Hint line for the molar mass when the prompt only gives atomic masses.
  const mHint = `Molar mass of ${P}: \`${times(massExpr(f))}\` = ${num(M)} g/mol.`;

  if (d === "easy" || d === "medium") {
    kind = rng.pick(d === "easy" ? ["n", "m", "M"] : ["n", "m", "atoms"]);
    o = { dp: 6, rounded: false };
    const n = rng.pick(NICE_N);
    const m = roundTo(n * M, 6);
    if (kind === "atoms") {
      const el = rng.pick(Object.keys(counts));
      const k = counts[el];
      exact = n * k;
      unit = "mol";
      values = { m, f, el };
      prompt = `${mGiven} How many moles of ${EL_NAME(el)} atoms (${el}) are in ${num(m)} g of ${what}, in mol?${EXACT}`;
      intro = `Find the moles of ${P} with \`n = m / M\`, then multiply by the number of ${el} atoms in one formula unit (${k}).${mIntro}`;
      lines = [given("_mass", m, "g"), mLine, step("_n", "_mass / _M", `${num(n)} mol`), step("_n_" + el, `_n * ${k}`, final(exact, o, unit))];
      candidates = [n, n * k * 2, m / ar(el), (m * k) / ar(el), n / k];
      hintFn = () => [
        `Find the moles of ${P} with \`n = m / M\`, then multiply by the number of ${el} atoms in one formula unit.`,
        mHint,
        `One formula unit of ${P} has ${k} ${el} atom${k === 1 ? "" : "s"}, so work out \`(${num(m)} / ${num(M)}) × ${k}\`.`,
      ];
    } else if (kind === "n") {
      exact = n;
      unit = "mol";
      values = { m, f };
      prompt = `${mGiven} How many moles are in ${num(m)} g of ${what}, in mol?${EXACT}`;
      intro = `Use \`n = m / M\` (moles = mass ÷ molar mass).${mIntro}`;
      lines = [given("_mass", m, "g"), mLine, step("_n", "_mass / _M", final(exact, o, unit))];
      candidates = [m * M, M / m, n * 10, n / 10];
      hintFn = (calc) => [
        "Use `n = m / M` (moles = mass ÷ molar mass).",
        ...(d === "easy" ? [] : [mHint]),
        `Substitute: \`n = ${num(m)} / ${num(M)}\`${calc("_mass / _M")}.`,
      ];
    } else if (kind === "m") {
      exact = m;
      unit = "g";
      values = { n, f };
      prompt = `${mGiven} What is the mass of ${num(n)} mol of ${what}, in g?${EXACT}`;
      intro = `Rearrange \`n = m / M\` to \`m = n × M\`.${mIntro}`;
      lines = [given("_n", n, "mol"), mLine, step("_mass", "_n * _M", final(exact, o, unit))];
      candidates = [M / n, n / M, M, m * 2];
      hintFn = (calc) => [
        "Rearrange `n = m / M` to `m = n × M` (mass = moles × molar mass).",
        ...(d === "easy" ? [] : n === 1 ? [`Molar mass of ${P}: add up \`${times(massExpr(f))}\`.`] : [mHint]),
        `Substitute: \`m = ${num(n)} × ${d === "easy" || n !== 1 ? num(M) : `(${times(massExpr(f))})`}\`${calc("_n * _M")}.`,
      ];
    } else {
      exact = M;
      unit = "g/mol";
      values = { m, n };
      prompt = `A sample of ${num(n)} mol of a substance has a mass of ${num(m)} g. What is its molar mass, in g/mol?${EXACT}`;
      intro = "Rearrange `n = m / M` to `M = m / n`.";
      lines = [given("_mass", m, "g"), given("_n", n, "mol"), step("_M", "_mass / _n", final(exact, o, unit))];
      candidates = [m * n, n / m, m];
      hintFn = (calc) => [
        "Rearrange `n = m / M` to `M = m / n` (molar mass = mass ÷ moles).",
        `Substitute: \`M = ${num(m)} / ${num(n)}\`${calc("_mass / _n")}.`,
      ];
    }
  } else {
    kind = rng.pick(["n", "m", "particles", "atoms"]);
    if (kind === "m") {
      const n = rng.int(5, 500) / 100;
      o = { dp: 2, rounded: true };
      exact = n * M;
      unit = "g";
      values = { n, f };
      prompt = `What is the mass of ${num(n)} mol of ${what}, in g? Use ${massNote([f])}.${roundNote(2)}`;
      intro = "Add up the molar mass, then use `m = n × M`.";
      lines = [given("_n", n, "mol"), step("_M", massExpr(f), `${num(M)} g/mol`), step("_mass", "_n * _M", final(exact, o, unit))];
      candidates = [M / n, n / M, n * (M - 1), M];
      hintFn = (calc) => [
        "Add up the molar mass from the atomic masses, then use `m = n × M`.",
        n === 1 ? `Molar mass of ${P}: add up \`${times(massExpr(f))}\`.` : mHint,
        `Substitute: \`m = ${num(n)} × ${n === 1 ? `(${times(massExpr(f))})` : num(M)}\`${calc("_n * _M")}.${roundHint(o)}`,
      ];
    } else {
      // A mass with 1 decimal giving roughly 0.05–8 mol.
      const m = roundTo((rng.int(50, 8000) / 1000) * M, 1);
      const n = m / M;
      if (!(m > 0)) return null;
      const nLine = step("_n", "_mass / _M", `${num4(n)} mol`);
      const mLines = [given("_mass", m, "g"), step("_M", massExpr(f), `${num(M)} g/mol`)];
      if (kind === "n") {
        o = { dp: 3, rounded: true };
        exact = n;
        unit = "mol";
        values = { m, f };
        prompt = `How many moles are in ${num(m)} g of ${what}, in mol? Use ${massNote([f])}.${roundNote(3)}`;
        intro = "Add up the molar mass, then use `n = m / M`.";
        lines = [...mLines, step("_n", "_mass / _M", final(exact, o, unit))];
        candidates = [m * M, M / m, n * 10, m / (M + 1)];
        hintFn = (calc) => [
          "Add up the molar mass from the atomic masses, then use `n = m / M`.",
          mHint,
          `Substitute: \`n = ${num(m)} / ${num(M)}\`${calc("_mass / _M")}.${roundHint(o)}`,
        ];
      } else if (kind === "particles") {
        o = { dp: 2, rounded: true };
        exact = n * L_AVO;
        unit = "× 10²³";
        values = { m, f };
        prompt =
          `How many molecules (or formula units) are in ${num(m)} g of ${what}? Use ${massNote([f])} and the Avogadro constant 6.02 × 10²³ per mol. ` +
          `Give the number in units of 10²³ (for example, type 3.01 for 3.01 × 10²³).${roundNote(2)}`;
        intro = "Find the moles with `n = m / M`, then multiply by the Avogadro constant (6.02 × 10²³ per mol). Working in units of 10²³ keeps the numbers small.";
        lines = [...mLines, nLine, given("_L", L_AVO, "× 10²³ per mol"), step("_particles", "_n * _L", final(exact, o, unit))];
        candidates = [L_AVO / n, m * L_AVO, n * L_AVO * 10, (n * L_AVO) / 10];
        hintFn = () => [
          "Find the moles with `n = m / M`, then multiply by the Avogadro constant. Working in units of 10²³, that means multiplying by 6.02.",
          mHint,
          `Work out \`(${num(m)} / ${num(M)}) × 6.02\`, which gives the number in units of 10²³.${roundHint(o)}`,
        ];
      } else {
        const el = rng.pick(Object.keys(counts));
        const k = counts[el];
        o = { dp: 3, rounded: true };
        exact = n * k;
        unit = "mol";
        values = { m, f, el };
        prompt = `How many moles of ${EL_NAME(el)} atoms (${el}) are in ${num(m)} g of ${what}, in mol? Use ${massNote([f])}.${roundNote(3)}`;
        intro = `Find the moles of ${P} with \`n = m / M\`, then multiply by the number of ${el} atoms in one formula unit (${k}).`;
        lines = [...mLines, nLine, step("_n_" + el, `_n * ${k}`, final(exact, o, unit))];
        candidates = [n, m / ar(el), (m * k) / ar(el), n / k, n * k * 2];
        hintFn = () => [
          `Find the moles of ${P} with \`n = m / M\`, then multiply by the number of ${el} atoms in one formula unit.`,
          mHint,
          `One formula unit of ${P} has ${k} ${el} atom${k === 1 ? "" : "s"}, so work out \`(${num(m)} / ${num(M)}) × ${k}\`.${roundHint(o)}`,
        ];
      }
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `moles-${kind}`, values } };
  base.hints = hintFn(calcFor(base.prompt, base.explanation));
  return finish(base, exact, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Concentration: c = n / V, dilution c1·V1 = c2·V2

const NICE_C = [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.5, 2];
const NICE_V = [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 1, 1.5, 2, 2.5, 5];
const NICE_CM3 = [10, 20, 25, 40, 50, 100, 125, 150, 200, 250, 400, 500, 750];
const CONV = "Remember 1 dm³ = 1000 cm³, so divide cm³ by 1000 to get dm³.";

function genConcentration(d, rng) {
  checkDifficulty(d);
  const [name, f] = rng.pick(SOLUTES);
  const what = `${name} (${pretty(f)})`;
  let kind, prompt, exact, unit, intro, lines, candidates, values, o, hintFn;
  const P = pretty(f);

  if (d === "easy") {
    kind = rng.pick(["c", "n", "V"]);
    o = { dp: 6, rounded: false };
    const c = rng.pick(NICE_C);
    const V = rng.pick(NICE_V);
    const n = roundTo(c * V, 6);
    if (kind === "c") {
      exact = c;
      unit = "mol/dm³";
      values = { n, V };
      prompt = `${cap(num(n))} mol of ${what} is dissolved in water to make ${num(V)} dm³ of solution. What is the concentration, in mol/dm³?${EXACT}`;
      intro = "Use `c = n / V` (concentration = moles ÷ volume in dm³).";
      lines = [given("_n", n, "mol"), given("_V", V, "dm³"), step("_c", "_n / _V", final(exact, o, unit))];
      candidates = [n * V, V / n, n];
      hintFn = (calc) => [
        "Use `c = n / V` (concentration = moles ÷ volume in dm³).",
        `Substitute: \`c = ${num(n)} / ${num(V)}\`${calc("_n / _V")}.`,
      ];
    } else if (kind === "n") {
      exact = n;
      unit = "mol";
      values = { c, V };
      prompt = `How many moles of ${what} are in ${num(V)} dm³ of a ${num(c)} mol/dm³ solution, in mol?${EXACT}`;
      intro = "Rearrange `c = n / V` to `n = c × V`.";
      lines = [given("_c", c, "mol/dm³"), given("_V", V, "dm³"), step("_n", "_c * _V", final(exact, o, unit))];
      candidates = [c / V, V / c, c + V];
      hintFn = (calc) => [
        "Rearrange `c = n / V` to `n = c × V` (moles = concentration × volume in dm³).",
        `Substitute: \`n = ${num(c)} × ${num(V)}\`${calc("_c * _V")}.`,
      ];
    } else {
      exact = V;
      unit = "dm³";
      values = { n, c };
      prompt = `What volume of a ${num(c)} mol/dm³ solution of ${what} contains ${num(n)} mol, in dm³?${EXACT}`;
      intro = "Rearrange `c = n / V` to `V = n / c`.";
      lines = [given("_n", n, "mol"), given("_c", c, "mol/dm³"), step("_V", "_n / _c", final(exact, o, unit))];
      candidates = [n * c, c / n, V * 1000];
      hintFn = (calc) => [
        "Rearrange `c = n / V` to `V = n / c` (volume = moles ÷ concentration).",
        `Substitute: \`V = ${num(n)} / ${num(c)}\`${calc("_n / _c")}.`,
      ];
    }
  } else if (d === "medium") {
    kind = rng.pick(["c-cm3", "n-cm3", "V-cm3", "dil-c2", "dil-V2", "dil-V1"]);
    o = { dp: 6, rounded: false };
    if (kind.startsWith("dil")) {
      const c1 = rng.pick([0.2, 0.4, 0.5, 0.8, 1, 1.5, 2]);
      const V1 = rng.pick([10, 20, 25, 50, 100, 200, 250]);
      const fct = rng.pick([2, 2.5, 4, 5, 8, 10]);
      const V2 = V1 * fct;
      const c2 = roundTo(c1 / fct, 6);
      if (!isClean(c1 / fct, 4)) return null;
      intro = "When a solution is diluted the moles of solute stay the same, so `c1 × V1 = c2 × V2`. Both volumes can stay in cm³ because the units cancel.";
      if (kind === "dil-c2") {
        exact = c2;
        unit = "mol/dm³";
        values = { c1, V1, V2 };
        prompt = `${num(V1)} cm³ of a ${num(c1)} mol/dm³ solution of ${what} is diluted with water to a total volume of ${num(V2)} cm³. What is the new concentration, in mol/dm³?${EXACT}`;
        lines = [given("_c1", c1), given("_V1", V1, "cm³"), given("_V2", V2, "cm³"), step("_c2", "_c1 * _V1 / _V2", final(exact, o, unit))];
        candidates = [(c1 * V2) / V1, c1 - c2, (c1 * V1) / (V2 - V1), c1 / 2];
        hintFn = (calc) => [
          "Diluting keeps the moles the same, so `c1 × V1 = c2 × V2`. Both volumes can stay in cm³.",
          `Rearrange for the new concentration and substitute: \`c2 = ${num(c1)} × ${num(V1)} / ${num(V2)}\`${calc("_c1 * _V1 / _V2")}.`,
        ];
      } else if (kind === "dil-V2") {
        exact = V2;
        unit = "cm³";
        values = { c1, V1, c2 };
        prompt = `${num(V1)} cm³ of a ${num(c1)} mol/dm³ solution of ${what} is diluted to ${num(c2)} mol/dm³. What is the final total volume, in cm³?${EXACT}`;
        lines = [given("_c1", c1), given("_V1", V1, "cm³"), given("_c2", c2), step("_V2", "_c1 * _V1 / _c2", final(exact, o, unit))];
        candidates = [V2 - V1, (c2 * V1) / c1, V2 / 1000, V1 * 2];
        hintFn = (calc) => [
          "Diluting keeps the moles the same, so `c1 × V1 = c2 × V2`. Both volumes can stay in cm³.",
          `Rearrange for the final volume and substitute: \`V2 = ${num(c1)} × ${num(V1)} / ${num(c2)}\`${calc("_c1 * _V1 / _c2")}.`,
        ];
      } else {
        exact = V1;
        unit = "cm³";
        values = { c1, c2, V2 };
        prompt = `What volume of a ${num(c1)} mol/dm³ stock solution of ${what} is needed to make ${num(V2)} cm³ of a ${num(c2)} mol/dm³ solution, in cm³?${EXACT}`;
        lines = [given("_c1", c1), given("_c2", c2), given("_V2", V2, "cm³"), step("_V1", "_c2 * _V2 / _c1", final(exact, o, unit))];
        candidates = [(c1 * V2) / c2, V2 - V1, V1 / 1000, V1 * 2];
        hintFn = (calc) => [
          "The moles you take from the stock end up in the new solution, so `c1 × V1 = c2 × V2`. Both volumes can stay in cm³.",
          `Rearrange for the stock volume and substitute: \`V1 = ${num(c2)} × ${num(V2)} / ${num(c1)}\`${calc("_c2 * _V2 / _c1")}.`,
        ];
      }
    } else {
      const c = rng.pick(NICE_C);
      const Vc = rng.pick(NICE_CM3);
      const n = roundTo((c * Vc) / 1000, 6);
      if (n < 0.001) return null;
      if (kind === "c-cm3") {
        exact = c;
        unit = "mol/dm³";
        values = { n, Vc };
        prompt = `${cap(num(n))} mol of ${what} is dissolved to make ${num(Vc)} cm³ of solution. What is the concentration, in mol/dm³?${EXACT}`;
        intro = `Convert the volume to dm³, then use \`c = n / V\`. ${CONV}`;
        lines = [given("_n", n, "mol"), given("_V_cm3", Vc), step("_V", `_V_cm3 / 1000`, `${num(Vc / 1000)} dm³`), step("_c", "_n / _V", final(exact, o, unit))];
        candidates = [n / Vc, n * Vc, c * 1000, c / 10];
        hintFn = (calc) => [
          `Convert the volume to dm³ first: ${num(Vc)} cm³ ÷ 1000. Then use \`c = n / V\`.`,
          `Substitute: \`c = ${num(n)} / (${num(Vc)} / 1000)\`${calc("_n / (_V_cm3 / 1000)")}.`,
        ];
      } else if (kind === "n-cm3") {
        exact = n;
        unit = "mol";
        values = { c, Vc };
        prompt = `How many moles of ${what} are in ${num(Vc)} cm³ of a ${num(c)} mol/dm³ solution, in mol?${EXACT}`;
        intro = `Convert the volume to dm³, then use \`n = c × V\`. ${CONV}`;
        lines = [given("_c", c, "mol/dm³"), given("_V_cm3", Vc), step("_V", `_V_cm3 / 1000`, `${num(Vc / 1000)} dm³`), step("_n", "_c * _V", final(exact, o, unit))];
        candidates = [c * Vc, c / Vc, n * 10, n / 10];
        hintFn = (calc) => [
          `Convert the volume to dm³ first: ${num(Vc)} cm³ ÷ 1000. Then use \`n = c × V\`.`,
          `Substitute: \`n = ${num(c)} × (${num(Vc)} / 1000)\`${calc("_c * _V_cm3 / 1000")}.`,
        ];
      } else {
        exact = Vc;
        unit = "cm³";
        values = { n, c };
        prompt = `What volume of a ${num(c)} mol/dm³ solution of ${what} contains ${num(n)} mol, in cm³?${EXACT}`;
        intro = `Use \`V = n / c\` to get dm³, then multiply by 1000 for cm³. ${CONV}`;
        lines = [given("_n", n, "mol"), given("_c", c, "mol/dm³"), step("_V_dm3", "_n / _c", `${num(n / c)} dm³`), step("_V", "_V_dm3 * 1000", final(exact, o, unit))];
        candidates = [Vc / 1000, n * c * 1000, Vc * 10, Vc / 10];
        hintFn = (calc) => [
          "`V = n / c` gives the volume in dm³. The question wants cm³, so multiply by 1000 at the end.",
          `Substitute: \`V = ${num(n)} / ${num(c)}\` in dm³${calc("_n / _c")}, then convert to cm³.`,
        ];
      }
    }
  } else {
    kind = rng.pick(["mass-c", "mass-needed", "water-add", "dil-c2"]);
    if (kind === "mass-c" || kind === "mass-needed") {
      const M = molarMass(parseFormula(f));
      const Mline = step("_M", massExpr(f), `${num(M)} g/mol`);
      const Vc = rng.int(5, 50) * 10;
      if (kind === "mass-c") {
        const m = roundTo((rng.int(20, 2000) / 1000) * (Vc / 1000) * M, 2);
        if (!(m > 0)) return null;
        o = { dp: 3, rounded: true };
        exact = m / M / (Vc / 1000);
        unit = "mol/dm³";
        values = { m, f, Vc };
        prompt = `${num(m)} g of ${what} is dissolved in water to make ${num(Vc)} cm³ of solution. What is the concentration, in mol/dm³? Use ${massNote([f])}.${roundNote(3)}`;
        intro = `Find the moles with \`n = m / M\`, convert the volume to dm³, then use \`c = n / V\`. ${CONV}`;
        lines = [given("_mass", m, "g"), Mline, step("_n", "_mass / _M", `${num4(m / M)} mol`), given("_V_cm3", Vc), step("_V", `_V_cm3 / 1000`, `${num(Vc / 1000)} dm³`), step("_c", "_n / _V", final(exact, o, unit))];
        candidates = [m / M / Vc, m / (Vc / 1000), exact * 10, (m * M) / (Vc / 1000)];
        hintFn = () => [
          "Find the moles with `n = m / M`, convert the volume to dm³ (÷ 1000), then use `c = n / V`.",
          `Molar mass of ${P}: \`${times(massExpr(f))}\` = ${num(M)} g/mol, so \`n = ${num(m)} / ${num(M)}\`.`,
          `Volume: ${num(Vc)} cm³ = ${num(Vc / 1000)} dm³, so work out \`c = (${num(m)} / ${num(M)}) / ${num(Vc / 1000)}\`.${roundHint(o)}`,
        ];
      } else {
        const c = rng.int(5, 200) / 100;
        o = { dp: 2, rounded: true };
        exact = c * (Vc / 1000) * M;
        unit = "g";
        values = { c, f, Vc };
        prompt = `What mass of ${what} is needed to make ${num(Vc)} cm³ of a ${num(c)} mol/dm³ solution, in g? Use ${massNote([f])}.${roundNote(2)}`;
        intro = `Find the moles needed with \`n = c × V\` (V in dm³), then the mass with \`m = n × M\`. ${CONV}`;
        lines = [given("_c", c, "mol/dm³"), given("_V_cm3", Vc), step("_V", `_V_cm3 / 1000`, `${num(Vc / 1000)} dm³`), step("_n", "_c * _V", `${num4(c * Vc / 1000)} mol`), Mline, step("_mass", "_n * _M", final(exact, o, unit))];
        candidates = [c * Vc * M, (c * Vc) / 1000, (c * (Vc / 1000)) / M, exact * 10];
        hintFn = () => [
          "Find the moles needed with `n = c × V` (V in dm³), then the mass with `m = n × M`.",
          `Volume: ${num(Vc)} cm³ = ${num(Vc / 1000)} dm³. Molar mass of ${P}: \`${times(massExpr(f))}\` = ${num(M)} g/mol.`,
          `Work out \`m = ${num(c)} × ${num(Vc / 1000)} × ${num(M)}\`.${roundHint(o)}`,
        ];
      }
    } else if (kind === "water-add") {
      const c1 = rng.int(20, 200) / 100;
      const V1 = rng.int(2, 50) * 5;
      const c2 = rng.int(5, Math.floor(c1 * 80)) / 100;
      if (!(c2 > 0 && c2 < c1)) return null;
      const V2 = (c1 * V1) / c2;
      o = { dp: 1, rounded: true };
      exact = V2 - V1;
      unit = "cm³";
      values = { c1, V1, c2 };
      prompt = `You have ${num(V1)} cm³ of a ${num(c1)} mol/dm³ solution of ${what}. What volume of water must be added to dilute it to ${num(c2)} mol/dm³, in cm³?${roundNote(1)}`;
      intro = "The moles stay the same, so `c1 × V1 = c2 × V2` gives the final volume. The water to add is the final volume minus the starting volume.";
      lines = [given("_c1", c1), given("_V1", V1, "cm³"), given("_c2", c2), step("_V2", "_c1 * _V1 / _c2", `${num4(V2)} cm³`), step("_water", "_V2 - _V1", final(exact, o, unit))];
      candidates = [V2, (c2 * V1) / c1, V1 * (c1 - c2), exact / 1000];
      hintFn = (calc) => [
          "The moles stay the same, so `c1 × V1 = c2 × V2` gives the final volume. The water to add is the final volume minus the volume you started with.",
          `Final volume: \`V2 = ${num(c1)} × ${num(V1)} / ${num(c2)}\`${calc("_c1 * _V1 / _c2")}.`,
          `Water to add: \`V2 - ${num(V1)}\`.${roundHint(o)}`,
        ];
    } else {
      const c1 = rng.int(10, 300) / 100;
      const V1 = rng.int(2, 100) * 5;
      const V2 = V1 + rng.int(1, 40) * 10;
      o = { dp: 3, rounded: true };
      exact = (c1 * V1) / V2;
      unit = "mol/dm³";
      values = { c1, V1, V2 };
      prompt = `${num(V1)} cm³ of a ${num(c1)} mol/dm³ solution of ${what} is diluted with water to a total volume of ${num(V2)} cm³. What is the new concentration, in mol/dm³?${roundNote(3)}`;
      intro = "The moles stay the same, so `c1 × V1 = c2 × V2` and `c2 = c1 × V1 / V2`.";
      lines = [given("_c1", c1), given("_V1", V1, "cm³"), given("_V2", V2, "cm³"), step("_c2", "_c1 * _V1 / _V2", final(exact, o, unit))];
      candidates = [(c1 * V2) / V1, (c1 * V1) / (V2 - V1), c1 - exact, c1 / 2];
      hintFn = (calc) => [
          "Diluting keeps the moles the same, so `c1 × V1 = c2 × V2`. Both volumes can stay in cm³.",
          `Rearrange for the new concentration: \`c2 = ${num(c1)} × ${num(V1)} / ${num(V2)}\`${calc("_c1 * _V1 / _V2")}.${roundHint(o)}`,
        ];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `conc-${kind}`, values } };
  base.hints = hintFn(calcFor(base.prompt, base.explanation));
  return finish(base, exact, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Balancing: one coefficient in a real, balanced equation is replaced by "?".
// Written as "coef formula + … = coef formula + …"; checked by atom counting when this file loads.

const EQUATIONS = {
  easy: [
    "2 H2 + 1 O2 = 2 H2O",
    "1 N2 + 3 H2 = 2 NH3",
    "2 Na + 1 Cl2 = 2 NaCl",
    "2 Mg + 1 O2 = 2 MgO",
    "1 C + 1 O2 = 1 CO2",
    "4 Fe + 3 O2 = 2 Fe2O3",
    "2 H2O2 = 2 H2O + 1 O2",
    "1 CaCO3 = 1 CaO + 1 CO2",
    "2 K + 2 H2O = 2 KOH + 1 H2",
    "1 Zn + 2 HCl = 1 ZnCl2 + 1 H2",
    "4 Al + 3 O2 = 2 Al2O3",
    "1 H2 + 1 Cl2 = 2 HCl",
    "2 Ca + 1 O2 = 2 CaO",
    "1 Mg + 2 HCl = 1 MgCl2 + 1 H2",
    "2 KClO3 = 2 KCl + 3 O2",
    "2 Na + 2 H2O = 2 NaOH + 1 H2",
    "4 Na + 1 O2 = 2 Na2O",
    "2 Cu + 1 O2 = 2 CuO",
  ],
  medium: [
    "1 CH4 + 2 O2 = 1 CO2 + 2 H2O",
    "2 C2H6 + 7 O2 = 4 CO2 + 6 H2O",
    "1 C3H8 + 5 O2 = 3 CO2 + 4 H2O",
    "2 Al + 6 HCl = 2 AlCl3 + 3 H2",
    "1 Fe2O3 + 3 CO = 2 Fe + 3 CO2",
    "1 CaCO3 + 2 HCl = 1 CaCl2 + 1 H2O + 1 CO2",
    "2 NaOH + 1 H2SO4 = 1 Na2SO4 + 2 H2O",
    "3 Fe + 4 H2O = 1 Fe3O4 + 4 H2",
    "1 N2 + 2 O2 = 2 NO2",
    "2 SO2 + 1 O2 = 2 SO3",
    "4 NH3 + 5 O2 = 4 NO + 6 H2O",
    "2 C4H10 + 13 O2 = 8 CO2 + 10 H2O",
    "1 Ca(OH)2 + 2 HCl = 1 CaCl2 + 2 H2O",
    "2 AgNO3 + 1 CaCl2 = 2 AgCl + 1 Ca(NO3)2",
    "1 C2H5OH + 3 O2 = 2 CO2 + 3 H2O",
    "1 Mg + 2 AgNO3 = 1 Mg(NO3)2 + 2 Ag",
    "1 Na2CO3 + 2 HCl = 2 NaCl + 1 H2O + 1 CO2",
    "1 Fe2O3 + 3 H2 = 2 Fe + 3 H2O",
  ],
  hard: [
    "1 C6H12O6 + 6 O2 = 6 CO2 + 6 H2O",
    "2 Al + 3 CuSO4 = 1 Al2(SO4)3 + 3 Cu",
    "3 Cu + 8 HNO3 = 3 Cu(NO3)2 + 2 NO + 4 H2O",
    "2 KMnO4 + 16 HCl = 2 KCl + 2 MnCl2 + 5 Cl2 + 8 H2O",
    "1 Al2(SO4)3 + 6 NaOH = 2 Al(OH)3 + 3 Na2SO4",
    "2 C8H18 + 25 O2 = 16 CO2 + 18 H2O",
    "4 FeS2 + 11 O2 = 2 Fe2O3 + 8 SO2",
    "1 Ca3(PO4)2 + 3 H2SO4 = 3 CaSO4 + 2 H3PO4",
    "2 NaHCO3 = 1 Na2CO3 + 1 H2O + 1 CO2",
    "1 Fe2O3 + 6 HCl = 2 FeCl3 + 3 H2O",
    "3 NO2 + 1 H2O = 2 HNO3 + 1 NO",
    "2 C2H2 + 5 O2 = 4 CO2 + 2 H2O",
    "4 NH3 + 3 O2 = 2 N2 + 6 H2O",
    "3 Ca(OH)2 + 2 H3PO4 = 1 Ca3(PO4)2 + 6 H2O",
    "1 Cu + 4 HNO3 = 1 Cu(NO3)2 + 2 NO2 + 2 H2O",
    "2 CH3OH + 3 O2 = 2 CO2 + 4 H2O",
    "1 P4 + 5 O2 = 1 P4O10",
    "2 Al + 3 H2SO4 = 1 Al2(SO4)3 + 3 H2",
  ],
};

// More real equations per level (ticket 014: 18 a level was thin). Picked by a draw made after the
// original question is built, so seeds that keep an EQUATIONS equation are unchanged.
const EXTRA_EQUATIONS = {
  easy: [
    "2 Zn + 1 O2 = 2 ZnO",
    "1 S + 1 O2 = 1 SO2",
    "2 C + 1 O2 = 2 CO",
    "2 Al + 3 Cl2 = 2 AlCl3",
    "1 Mg + 1 Cl2 = 1 MgCl2",
    "2 K + 1 Cl2 = 2 KCl",
    "2 Fe + 3 Cl2 = 2 FeCl3",
    "1 Fe + 1 S = 1 FeS",
    "1 MgCO3 = 1 MgO + 1 CO2",
    "1 CuCO3 = 1 CuO + 1 CO2",
    "1 Zn + 1 CuSO4 = 1 ZnSO4 + 1 Cu",
    "1 Fe + 1 CuSO4 = 1 FeSO4 + 1 Cu",
    "1 Mg + 1 H2SO4 = 1 MgSO4 + 1 H2",
    "1 Ca + 2 H2O = 1 Ca(OH)2 + 1 H2",
    "1 CaO + 1 H2O = 1 Ca(OH)2",
    "4 K + 1 O2 = 2 K2O",
    "1 NaOH + 1 HCl = 1 NaCl + 1 H2O",
    "1 Ca + 1 Cl2 = 1 CaCl2",
  ],
  medium: [
    "1 CuO + 1 H2SO4 = 1 CuSO4 + 1 H2O",
    "1 MgO + 2 HCl = 1 MgCl2 + 1 H2O",
    "2 KOH + 1 H2SO4 = 1 K2SO4 + 2 H2O",
    "1 CaCO3 + 2 HNO3 = 1 Ca(NO3)2 + 1 H2O + 1 CO2",
    "1 Zn + 2 AgNO3 = 1 Zn(NO3)2 + 2 Ag",
    "1 Cu + 2 AgNO3 = 1 Cu(NO3)2 + 2 Ag",
    "2 ZnS + 3 O2 = 2 ZnO + 2 SO2",
    "1 Fe3O4 + 4 CO = 3 Fe + 4 CO2",
    "1 C2H4 + 3 O2 = 2 CO2 + 2 H2O",
    "2 C3H6 + 9 O2 = 6 CO2 + 6 H2O",
    "1 CuO + 2 HCl = 1 CuCl2 + 1 H2O",
    "1 Fe + 2 HCl = 1 FeCl2 + 1 H2",
    "2 NaOH + 1 CuSO4 = 1 Cu(OH)2 + 1 Na2SO4",
    "1 MgCO3 + 2 HCl = 1 MgCl2 + 1 H2O + 1 CO2",
    "1 Na2O + 2 HCl = 2 NaCl + 1 H2O",
    "2 NH3 + 1 H2SO4 = 1 (NH4)2SO4",
    "2 Mg + 1 CO2 = 2 MgO + 1 C",
    "1 ZnO + 2 HNO3 = 1 Zn(NO3)2 + 1 H2O",
  ],
  hard: [
    "1 C5H12 + 8 O2 = 5 CO2 + 6 H2O",
    "2 C6H14 + 19 O2 = 12 CO2 + 14 H2O",
    "2 C3H7OH + 9 O2 = 6 CO2 + 8 H2O",
    "4 NH3 + 7 O2 = 4 NO2 + 6 H2O",
    "1 Fe3O4 + 8 HCl = 1 FeCl2 + 2 FeCl3 + 4 H2O",
    "2 KMnO4 = 1 K2MnO4 + 1 MnO2 + 1 O2",
    "1 Mg3N2 + 6 H2O = 3 Mg(OH)2 + 2 NH3",
    "1 PCl5 + 4 H2O = 1 H3PO4 + 5 HCl",
    "1 P4 + 6 Cl2 = 4 PCl3",
    "1 P4O10 + 6 H2O = 4 H3PO4",
    "2 Fe(OH)3 = 1 Fe2O3 + 3 H2O",
    "1 Cu + 2 H2SO4 = 1 CuSO4 + 1 SO2 + 2 H2O",
    "2 Al(OH)3 + 3 H2SO4 = 1 Al2(SO4)3 + 6 H2O",
    "4 Al + 3 MnO2 = 2 Al2O3 + 3 Mn",
    "8 Al + 3 Fe3O4 = 4 Al2O3 + 9 Fe",
    "2 Fe2O3 + 3 C = 4 Fe + 3 CO2",
    "1 C12H22O11 + 12 O2 = 12 CO2 + 11 H2O",
    "4 Zn + 10 HNO3 = 4 Zn(NO3)2 + 1 N2O + 5 H2O",
  ],
};

// "2 H2 + 1 O2 = 2 H2O" -> [[{ coef: 2, f: "H2" }, …], [{ coef: 2, f: "H2O" }]]
function parseEquation(text) {
  return text.split("=").map((side) =>
    side.split("+").map((term) => {
      const m = /^\s*(\d+)\s+(\S+)\s*$/.exec(term);
      if (!m) throw new Error(`Bad equation: ${text}`);
      return { coef: Number(m[1]), f: m[2] };
    })
  );
}

// Atom totals on each side; returns true when every element balances.
function balanced(sides, coefs) {
  const tally = [{}, {}];
  let idx = 0;
  sides.forEach((side, s) => {
    for (const term of side) {
      const c = coefs[idx++];
      for (const [el, k] of Object.entries(parseFormula(term.f))) tally[s][el] = (tally[s][el] || 0) + c * k;
    }
  });
  const els = new Set([...Object.keys(tally[0]), ...Object.keys(tally[1])]);
  for (const el of els) if (Math.abs((tally[0][el] || 0) - (tally[1][el] || 0)) > 1e-9) return false;
  return true;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Self-check on load: every listed equation balances and is in lowest whole-number terms.
for (const list of [...Object.values(EQUATIONS), ...Object.values(EXTRA_EQUATIONS)]) {
  for (const text of list) {
    const sides = parseEquation(text);
    const coefs = sides.flat().map((t) => t.coef);
    if (!balanced(sides, coefs) || coefs.reduce(gcd) !== 1) throw new Error(`Chemistry: unbalanced equation in data: ${text}`);
  }
}

function genBalancing(d, rng) {
  checkDifficulty(d);
  const q = balancingQuestion(rng.pick(EQUATIONS[d]), rng);
  const more = EXTRA_EQUATIONS[d];
  // Each equation in the combined pool is equally likely.
  if (rng.next() < more.length / (more.length + EQUATIONS[d].length)) return balancingQuestion(rng.pick(more), rng);
  return q;
}

function balancingQuestion(text, rng) {
  const sides = parseEquation(text);
  const terms = sides.flat();
  const miss = rng.int(0, terms.length - 1);
  const x = terms[miss].coef;
  const missSide = miss < sides[0].length ? 0 : 1;

  let idx = 0;
  const show = sides
    .map((side) =>
      side
        .map((t) => {
          const i = idx++;
          return `${i === miss ? "**?**" : t.coef} ${pretty(t.f)}`;
        })
        .join(" + ")
    )
    .join(" → ");
  const prompt =
    `Balance this equation by finding the missing coefficient. Every other coefficient is shown, including 1s.\n\n${show}\n\n` +
    `What number replaces the **?** symbol?${WHOLE}`;

  // Explanation: count one element that appears in the missing species.
  const missCounts = parseFormula(terms[miss].f);
  const el = Object.keys(missCounts)[0];
  const k = missCounts[el];
  const total = (side, skip) =>
    side.reduce((s, t) => (t === skip ? s : s + t.coef * (parseFormula(t.f)[el] || 0)), 0);
  const exprFor = (side, skip) => {
    const parts = side.filter((t) => t !== skip && parseFormula(t.f)[el]).map((t) => `${t.coef}*${parseFormula(t.f)[el]}`);
    return parts.length ? parts.join(" + ") : "0";
  };
  const same = sides[missSide];
  const other = sides[1 - missSide];
  const sameKnown = total(same, terms[miss]);
  const otherTotal = total(other, null);
  const intro =
    `Count the **${el}** atoms (${EL_NAME(el)}). The missing species ${pretty(terms[miss].f)} has ${k} ${el} atom${k === 1 ? "" : "s"}, ` +
    `so \`? × ${k}\` plus the other ${el} atoms on its side must equal the ${el} atoms on the other side.`;
  const lines = [
    step(`_${el}_other`, exprFor(other, null), `${otherTotal} atom${otherTotal === 1 ? "" : "s"} on the other side`),
    step(`_${el}_same`, exprFor(same, terms[miss]), `${sameKnown} atom${sameKnown === 1 ? "" : "s"} already on the same side`),
    step("_x", `(_${el}_other - _${el}_same) / ${k}`, `**${x}**`),
  ];
  // Final check: atom totals per element with the coefficient filled in.
  const tally = [{}, {}];
  sides.forEach((side, s) => side.forEach((t) => {
    for (const [e2, c] of Object.entries(parseFormula(t.f))) tally[s][e2] = (tally[s][e2] || 0) + t.coef * c;
  }));
  const outro = `Check with ${x} filled in: ${Object.keys(tally[0]).map((e2) => `${e2} ${tally[0][e2]} = ${tally[1][e2]}`).join(", ")}.`;

  const others = terms.filter((_, i) => i !== miss).map((t) => t.coef);
  const candidates = [x + 1, x - 1, x * 2, k, otherTotal, ...others];
  const o = { dp: 0, rounded: false, integer: true };
  const base = {
    prompt,
    explanation: explain(intro, lines, outro),
    params: { kind: "balance", values: { equation: text, miss } },
    hints: [
      `Pick one element that is in the missing species and count its atoms on both sides. ${pretty(terms[miss].f)} contains **${el}**, so count ${el}.`,
      `${el} atoms on the other side: \`${times(exprFor(other, null))}\` = ${otherTotal}. ` +
        `${el} atoms already on the same side (without the missing term): ${sameKnown === 0 ? "none" : `\`${times(exprFor(same, terms[miss]))}\` = ${sameKnown}`}.`,
      `Each ${pretty(terms[miss].f)} has ${k} ${el} atom${k === 1 ? "" : "s"}, so solve \`? × ${k}${sameKnown ? ` + ${sameKnown}` : ""} = ${otherTotal}\`.`,
    ],
  };
  return finish(base, x, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Percent composition, empirical and molecular formulae (medium and hard)

const COMPOSITION = COMPOUNDS.filter(([, f]) => elementsOf(f).length >= 2);

// Empirical formulae (lowest whole-number ratios), checked on load.
const EMPIRICAL = [
  "CH2", "CH3", "CH", "C2H5", "CH2O", "C3H8", "CH4O", "C2H6O", "C3H4", "NO2", "N2O", "N2O5", "NO", "Fe2O3", "Fe3O4", "FeO",
  "P2O5", "Al2O3", "MgO", "Na2O", "K2O", "CuO", "Cu2O", "SO2", "SO3", "CaCl2", "MgCl2", "KNO3", "CaCO3", "Na2SO4", "C2H3O2",
];

// [empirical, molecular, name]
const MOLECULAR = [
  ["CH2O", "C6H12O6", "glucose"], ["CH2O", "C2H4O2", "ethanoic acid"], ["CH2O", "C3H6O3", "lactic acid"],
  ["CH2", "C2H4", "ethene"], ["CH2", "C3H6", "propene"], ["CH2", "C4H8", "butene"], ["CH2", "C6H12", "cyclohexane"],
  ["CH", "C2H2", "ethyne"], ["CH", "C6H6", "benzene"], ["CH", "C8H8", "styrene"], ["CH3", "C2H6", "ethane"],
  ["C2H5", "C4H10", "butane"], ["NO2", "N2O4", "dinitrogen tetroxide"], ["P2O5", "P4O10", "phosphorus(V) oxide"],
  ["HO", "H2O2", "hydrogen peroxide"], ["C5H4", "C10H8", "naphthalene"], ["C2H4O", "C4H8O2", "ethyl ethanoate"],
  ["C3H8", "C3H8", "propane"], ["CH2O", "CH2O", "methanal"],
];

for (const f of EMPIRICAL) if (Object.values(parseFormula(f)).reduce(gcd) !== 1) throw new Error(`Chemistry: ${f} is not an empirical formula`);
for (const [e, m] of MOLECULAR) {
  const ce = parseFormula(e);
  const cm = parseFormula(m);
  const r = cm[Object.keys(ce)[0]] / ce[Object.keys(ce)[0]];
  if (Object.values(ce).reduce(gcd) !== 1 || !Object.keys(cm).every((el) => cm[el] === ce[el] * r) || Object.keys(cm).length !== Object.keys(ce).length) {
    throw new Error(`Chemistry: ${m} does not match empirical ${e}`);
  }
}

// Write element counts as a formula in the given element order: { C: 1, H: 2 } -> "CH₂".
const formulaOf = (order, counts) => pretty(order.map((el) => `${el}${counts[el] === 1 ? "" : counts[el]}`).join(""));

// Simplest whole-number ratio from masses (or percentages) per element; null if no multiplier up to 8 works.
function simplestRatio(masses) {
  const moles = Object.fromEntries(Object.entries(masses).map(([el, m]) => [el, m / ar(el)]));
  const min = Math.min(...Object.values(moles));
  const ratio = Object.fromEntries(Object.entries(moles).map(([el, n]) => [el, n / min]));
  for (let k = 1; k <= 8; k++) {
    if (Object.values(ratio).every((r) => Math.abs(r * k - Math.round(r * k)) < 0.1)) {
      return { ratio, k, counts: Object.fromEntries(Object.entries(ratio).map(([el, r]) => [el, Math.round(r * k)])) };
    }
  }
  return null;
}

// Answer as either a formula choice or a whole-number count (~35% choice), with formula distractors.
function finishFormula(full, counts, order, askEl, formulaCands, numberCands, rng) {
  const { askNumber, ...base } = full;
  const ansFormula = formulaOf(order, counts);
  if (rng.next() < 0.35) {
    const seen = new Set([ansFormula]);
    const out = [];
    for (const c of formulaCands) {
      if (out.length >= 3) break;
      if (!order.every((el) => Number.isInteger(c[el]) && c[el] >= 1)) continue;
      const s = formulaOf(order, c);
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    for (let k = 1; out.length < 3 && k <= 10; k++) {
      for (const el of order) {
        const s = formulaOf(order, { ...counts, [el]: counts[el] + k });
        if (out.length < 3 && !seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    if (out.length < 3) return null;
    const q = {
      ...base,
      prompt: `${base.prompt}\n\nWhich formula is it?`,
      answer: ansFormula,
      answerType: "choice",
      choices: rng.shuffle([ansFormula, ...out]),
      tolerance: 0,
      params: { ...base.params, ask: "formula" },
    };
    if (!withGiven(q, [])) return null;
    return q;
  }
  const x = counts[askEl];
  const q = finish(
    { ...base, prompt: `${base.prompt}\n\n${askNumber(askEl)}${WHOLE}`, params: { ...base.params, ask: askEl } },
    x,
    { dp: 0, rounded: false, integer: true },
    numberCands,
    { next: () => 1, shuffle: (a) => a } // always the typed-number branch here
  );
  return q;
}

function genComposition(d, rng) {
  checkDifficulty(d, ["medium", "hard"]);
  const kind = rng.pick(d === "medium" ? ["percent", "percent", "mass-el"] : ["empirical-pct", "empirical-mass", "molecular", "mass-compound"]);

  if (kind === "percent" || kind === "mass-el" || kind === "mass-compound") {
    const [name, f] = rng.pick(COMPOSITION);
    const counts = parseFormula(f);
    const M = molarMass(counts);
    const el = rng.pick(Object.keys(counts));
    const k = counts[el];
    const what = `${name} (${pretty(f)})`;
    const Mline = step("_M", massExpr(f), `${num(M)} g/mol`);
    const elLine = step(`_${el}_mass`, k === 1 ? `${ar(el)}` : `${k}*${ar(el)}`, `${num(k * ar(el))} g of ${el} per mole`);
    const atoms = Object.values(counts).reduce((s, c) => s + c, 0);
    let prompt, exact, unit, intro, lines, candidates, values, o, hintFn;
    const elMass = num(k * ar(el));
    const massHint = `Molar mass of ${pretty(f)}: \`${times(massExpr(f))}\` = ${num(M)} g/mol. ` +
      `Mass of ${el} in one formula unit: ${k === 1 ? `${elMass} g` : `\`${k} × ${ar(el)}\` = ${elMass} g`}.`;
    if (kind === "percent") {
      o = { dp: 1, rounded: true };
      exact = (100 * k * ar(el)) / M;
      unit = "%";
      values = { f, el };
      prompt = `What is the percentage by mass of ${EL_NAME(el)} (${el}) in ${what}? Use ${massNote([f])}. Give the answer in %.${roundNote(1)}`;
      intro = `Percentage by mass = (mass of ${el} in one formula unit ÷ molar mass) × 100.`;
      // Atomic masses as their own rows, so the calculator can start from them.
      const els = Object.keys(counts);
      const term = (e2) => (counts[e2] === 1 ? `_A_${e2}` : `${counts[e2]}*_A_${e2}`);
      lines = [
        ...els.map((e2) => given(`_A_${e2}`, ar(e2))),
        step("_M", els.map(term).join(" + "), `${num(M)} g/mol`),
        step(`_${el}_mass`, term(el), `${num(k * ar(el))} g of ${el} per mole`),
        step("_pct", `_${el}_mass / _M * 100`, final(exact, o, unit)),
      ];
      candidates = [(100 * ar(el)) / M, (100 * k) / atoms, 100 - exact, (100 * k * ar(el)) / (M - k * ar(el))];
      hintFn = (calc) => [
        `Percentage by mass = (mass of ${el} in one formula unit ÷ molar mass) × 100.`,
        massHint,
        `Substitute: \`${elMass} / ${num(M)} × 100\`${calc(`${term(el)} / (${els.map(term).join(" + ")}) * 100`)}.${roundHint(o)}`,
      ];
    } else if (kind === "mass-el") {
      const m = rng.int(10, 500) / 10;
      o = { dp: 2, rounded: true };
      exact = (m * k * ar(el)) / M;
      unit = "g";
      values = { f, el, m };
      prompt = `What mass of ${EL_NAME(el)} (${el}) is contained in ${num(m)} g of ${what}, in g? Use ${massNote([f])}.${roundNote(2)}`;
      intro = `The fraction of the mass that is ${el} is (mass of ${el} per formula unit) ÷ (molar mass). Multiply the sample mass by that fraction.`;
      lines = [given("_mass", m, "g"), Mline, elLine, step(`_m_${el}`, `_mass * _${el}_mass / _M`, final(exact, o, unit))];
      candidates = [(m * ar(el)) / M, m - exact, (m * M) / (k * ar(el)), (m * k) / atoms];
      hintFn = () => [
        `Find what fraction of the mass is ${el}: (mass of ${el} per formula unit) ÷ (molar mass). Then multiply the sample mass by it.`,
        massHint,
        `Work out \`${num(m)} × ${elMass} / ${num(M)}\`.${roundHint(o)}`,
      ];
    } else {
      const mel = rng.int(10, 300) / 10;
      o = { dp: 2, rounded: true };
      exact = (mel * M) / (k * ar(el));
      unit = "g";
      values = { f, el, mel };
      prompt = `What mass of ${what} contains exactly ${num(mel)} g of ${EL_NAME(el)} (${el}), in g? Use ${massNote([f])}.${roundNote(2)}`;
      intro = `Only part of each formula unit's mass is ${el}. Divide the mass of ${el} by that fraction (mass of ${el} per formula unit ÷ molar mass).`;
      lines = [given(`_m_${el}`, mel, "g"), Mline, elLine, step("_mass", `_m_${el} * _M / _${el}_mass`, final(exact, o, unit))];
      candidates = [(mel * k * ar(el)) / M, (mel * M) / ar(el), mel + M, (mel * M) / (k * ar(el) * 10)];
      hintFn = () => [
        `Only part of the compound's mass is ${el}. Divide the mass of ${el} by that fraction, (mass of ${el} per formula unit) ÷ (molar mass).`,
        massHint,
        `Work out \`${num(mel)} × ${num(M)} / ${elMass}\`.${roundHint(o)}`,
      ];
    }
    const base = { prompt, explanation: explain(intro, lines), params: { kind: `comp-${kind}`, values } };
    base.hints = hintFn(calcFor(base.prompt, base.explanation));
    return finish(base, exact, o, candidates, rng);
  }

  if (kind === "molecular") {
    const [emp, mol, name] = rng.pick(MOLECULAR);
    const ce = parseFormula(emp);
    const cm = parseFormula(mol);
    const order = Object.keys(ce);
    const Me = molarMass(ce);
    const Mm = molarMass(cm);
    const n = Mm / Me;
    const askEl = rng.pick(order);
    const prompt =
      `A compound has the empirical formula ${pretty(emp)} and a molar mass of ${num(Mm)} g/mol. ` +
      `Use ${massNote([emp])}.`;
    const intro = "Find how many empirical-formula units fit in the molar mass, then multiply every subscript by that number.";
    const lines = [step("_M_emp", massExpr(emp), `${num(Me)} g/mol`), given("_M", Mm, "g/mol"), step("_n", "_M / _M_emp", `${num(n)}`)];
    const outro = `So the molecular formula is ${pretty(mol)} (${name}).`;
    const mult = (k) => Object.fromEntries(order.map((el) => [el, ce[el] * k]));
    const base = {
      prompt,
      explanation: explain(intro, lines, outro),
      params: { kind: "comp-molecular", values: { emp, Mm } },
      askNumber: (el) => `How many ${EL_NAME(el)} atoms (${el}) are in one molecule?`,
      hints: [
        "Find how many empirical-formula units fit into the molar mass, then multiply every subscript by that number.",
        `Empirical formula mass of ${pretty(emp)}: \`${times(massExpr(emp))}\` = ${num(Me)} g/mol.`,
        `Number of units: \`${num(Mm)} / ${num(Me)}\`. Multiply each subscript in ${pretty(emp)} by that whole number.`,
      ],
    };
    const formulaCands = [mult(n + 1), ce, mult(n * 2), mult(n + 2), Object.fromEntries(order.map((el, i) => [el, cm[order[(i + 1) % order.length]]]))];
    const numberCands = [ce[askEl], n, cm[askEl] + n, cm[askEl] * 2, Math.round(Mm / ar(askEl))];
    return finishFormula(base, cm, order, askEl, formulaCands, numberCands, rng);
  }

  // Empirical formula from mass percentages (1 decimal) or from masses in a sample (2 decimals).
  const emp = rng.pick(EMPIRICAL);
  const ce = parseFormula(emp);
  const order = Object.keys(ce);
  const Me = molarMass(ce);
  let data;
  let prompt;
  const useMass = kind === "empirical-mass";
  if (useMass) {
    const sample = rng.int(20, 300) / 10;
    data = Object.fromEntries(order.map((el) => [el, roundTo((sample * ce[el] * ar(el)) / Me, 2)]));
    prompt =
      `A sample of a compound contains ${order.map((el) => `${num(data[el])} g of ${EL_NAME(el)} (${el})`).join(", ").replace(/, ([^,]*)$/, " and $1")} and nothing else. ` +
      `Use ${massNote([emp])}.`;
  } else {
    const pct = order.map((el) => roundTo((100 * ce[el] * ar(el)) / Me, 1));
    pct[pct.length - 1] = roundTo(100 - pct.slice(0, -1).reduce((s, p) => s + p, 0), 1);
    data = Object.fromEntries(order.map((el, i) => [el, pct[i]]));
    prompt =
      `A compound contains, by mass, ${order.map((el) => `${num(data[el])}% ${EL_NAME(el)} (${el})`).join(", ").replace(/, ([^,]*)$/, " and $1")}. ` +
      `Use ${massNote([emp])}.`;
  }
  if (Object.values(data).some((v) => !(v > 0))) return null;
  // The rounded data must still lead cleanly to the intended formula.
  const sr = simplestRatio(data);
  if (!sr || !order.every((el) => sr.counts[el] === ce[el] && Math.abs(sr.ratio[el] * sr.k - ce[el]) < 0.05)) return null;

  const lines = [];
  const dl = (el) => `${useMass ? "_g_" : "_pct_"}${el}`;
  order.forEach((el) => lines.push(given(dl(el), data[el], useMass ? "g" : "%")));
  order.forEach((el) => lines.push(step(`_n_${el}`, `${dl(el)} / ${ar(el)}`, `${num4(data[el] / ar(el))} mol`)));
  const minEl = order.reduce((a, b) => (data[a] / ar(a) <= data[b] / ar(b) ? a : b));
  order.forEach((el) => lines.push(step(`_r_${el}`, `_n_${el} / _n_${minEl}`, num4(sr.ratio[el]))));
  const intro =
    `Divide each ${useMass ? "mass" : "percentage"} by its atomic mass to get moles${useMass ? "" : " (treat each percentage as grams in a 100 g sample)"}, then divide by the smallest number of moles. ` +
    (sr.k > 1 ? `The ratios are not all whole numbers, so multiply them all by ${sr.k}.` : "The ratios are already whole numbers (allowing for rounding in the data).");
  const outro = `Simplest whole-number ratio ${order.map((el) => `${el} ${ce[el]}`).join(" : ")}, so the empirical formula is ${formulaOf(order, ce)}.`;
  const askEl = rng.pick(order);
  const base = {
    prompt,
    explanation: explain(intro, lines, outro),
    params: { kind: "comp-empirical", values: { data, order } },
    askNumber: (el) => `What is the subscript of ${el} in the empirical formula? (Write 1 if ${el} has no subscript.)`,
    hints: [
      `${useMass ? "" : "Treat the percentages as grams in a 100 g sample. "}Divide each mass by its atomic mass to get moles, then divide every result by the smallest.`,
      `Moles: ${order.map((el) => `${el} \`${num(data[el])} / ${ar(el)}\` ≈ ${num4(data[el] / ar(el))}`).join("; ")}.`,
      `Divide each by the smallest (${minEl}, ≈ ${num4(data[minEl] / ar(minEl))} mol). If a ratio comes out near .5, .33 or .25, multiply them all by 2, 3 or 4 to get whole numbers.`,
    ],
  };
  const swapped = Object.fromEntries(order.map((el, i) => [el, ce[order[order.length - 1 - i]]]));
  const unscaled = Object.fromEntries(order.map((el) => [el, Math.max(1, Math.round(sr.ratio[el]))]));
  const doubled = Object.fromEntries(order.map((el) => [el, ce[el] * 2]));
  const byMass = Object.fromEntries(order.map((el) => [el, Math.max(1, Math.round((data[el] / Math.min(...Object.values(data)))))]));
  const formulaCands = [swapped, unscaled, byMass, doubled];
  const numberCands = [Math.round(sr.ratio[askEl]), ce[askEl] + 1, ce[askEl] * 2, byMass[askEl], swapped[askEl]];
  return finishFormula(base, ce, order, askEl, formulaCands, numberCands, rng);
}

// ---------------------------------------------------------------------------------------------

const GENERATORS = { moles: genMoles, concentration: genConcentration, balancing: genBalancing, composition: genComposition };

// ---------------------------------------------------------------------------------------------
// Expert level: a separate branch. generate() sends "expert" here before any other code runs, so
// easy/medium/hard draw exactly the same rng values as before. Expert questions are multi-part,
// state the rounding on every part, and keep their inputs in params.v with params.kind "x-…".
// verify() recomputes the true values a different way (the product each reactant could make, atom
// counting for any candidate coefficients, the empirical formula rebuilt from the data) and compares
// each part. Hint code never calls rng.

// Round half away from zero to dp decimals; never "-0".
function xr(n, dp) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// Display form for stated values and working: up to 4 decimals (6 for small numbers).
const xs = (n) => String(Math.abs(n) < 0.1 ? xr(n, 6) : xr(n, 4));
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
// An exact whole-number part.
const xInt = (id, label, ask, value, hint) => ({ id, label, ask, answerType: "number", answer: value, tolerance: 0, hint, _exact: value, _dp: null });
// A choice part.
const xChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });

// Assemble a multi-part question. Returns null (regenerate) on a rounding tie, a zero or
// non-finite answer, a given value equal to an answer, or NaN/undefined in the text.
// sameOk: part ids whose answer may legitimately equal a given value (whole-number counts).
// "a 8 kg" -> "an 8 kg" (eight, eleven, eighteen, eighty... start with a vowel sound).
function xArticles(text) {
  return text.replace(/\b([Aa]n?) (\d+)/g, (all, art, digits) => {
    const vowel = digits[0] === "8" || (digits.length % 3 === 2 && /^1[18]/.test(digits));
    return `${art[0] === "A" ? (vowel ? "An" : "A") : vowel ? "an" : "a"} ${digits}`;
  });
}

function xMulti({ kind, v, prompt, parts, steps, given, hints, sameOk = false }) {
  prompt = xArticles(prompt);
  const dp = {};
  const out = [];
  for (const p of parts) {
    const { _exact, _dp, ...part } = p;
    part.id = part.id.toLowerCase(); // ids must match ^[a-z0-9-]+$
    if (part.answerType === "number") {
      if (!Number.isFinite(_exact) || part.answer === 0) return null;
      if (_dp === null ? !Number.isInteger(_exact) : xTie(_exact, _dp)) return null;
      if (!sameOk && given.some(([, g]) => Math.abs(g - part.answer) < 1e-9)) return null;
      dp[part.id] = _dp;
    } else {
      if (!part.choices.includes(part.answer) || new Set(part.choices).size !== part.choices.length) return null;
      dp[part.id] = "choice";
    }
    out.push(part);
  }
  const text = [prompt, ...steps, ...hints, ...out.map((p) => `${p.ask} ${p.hint} ${p.answer}`)].join(" ");
  if (/NaN|undefined|Infinity/.test(text)) return null;
  const q = {
    prompt,
    answerType: "multi",
    parts: out,
    explanation: steps.join("\n\n"),
    params: { kind, v, dp },
    hints,
  };
  if (given.length) q.given = given.map(([label, value]) => ({ label, value }));
  return q;
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
    truth = fn(p.v, answer);
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

// Balanced equations for the Expert level, in lowest whole-number terms (checked on load).
const X_EQ = [
  "4 Fe + 3 O2 = 2 Fe2O3", "4 Al + 3 O2 = 2 Al2O3", "2 Na + 2 H2O = 2 NaOH + 1 H2", "1 Fe2O3 + 3 CO = 2 Fe + 3 CO2",
  "2 Al + 6 HCl = 2 AlCl3 + 3 H2", "1 Mg + 2 HCl = 1 MgCl2 + 1 H2", "1 Ca(OH)2 + 2 HCl = 1 CaCl2 + 2 H2O", "4 NH3 + 5 O2 = 4 NO + 6 H2O",
  "4 P + 5 O2 = 2 P2O5", "2 Fe + 3 Cl2 = 2 FeCl3", "2 KClO3 = 2 KCl + 3 O2", "2 H2O2 = 2 H2O + 1 O2",
  "2 Al + 1 Fe2O3 = 1 Al2O3 + 2 Fe", "1 Cu + 2 AgNO3 = 1 Cu(NO3)2 + 2 Ag", "1 Al2(SO4)3 + 6 NaOH = 2 Al(OH)3 + 3 Na2SO4", "2 Fe2O3 + 3 C = 4 Fe + 3 CO2",
  "2 ZnS + 3 O2 = 2 ZnO + 2 SO2", "1 Fe3O4 + 4 H2 = 3 Fe + 4 H2O", "1 N2 + 3 H2 = 2 NH3", "2 SO2 + 1 O2 = 2 SO3",
  "3 NO2 + 1 H2O = 2 HNO3 + 1 NO", "1 H2SO4 + 2 NaOH = 1 Na2SO4 + 2 H2O", "2 Mg + 1 O2 = 2 MgO", "2 Na + 1 Cl2 = 2 NaCl",
  "2 K + 2 H2O = 2 KOH + 1 H2", "1 Ca + 2 H2O = 1 Ca(OH)2 + 1 H2", "3 Fe + 4 H2O = 1 Fe3O4 + 4 H2", "1 PCl5 + 4 H2O = 1 H3PO4 + 5 HCl",
  "1 Mg3N2 + 6 H2O = 3 Mg(OH)2 + 2 NH3", "1 CaCO3 = 1 CaO + 1 CO2", "2 Cu + 1 O2 = 2 CuO", "1 Zn + 2 HCl = 1 ZnCl2 + 1 H2",
  "2 Mg + 1 CO2 = 2 MgO + 1 C", "1 CuO + 1 H2 = 1 Cu + 1 H2O", "2 NaHCO3 = 1 Na2CO3 + 1 H2O + 1 CO2", "1 Zn + 1 CuSO4 = 1 ZnSO4 + 1 Cu",
];
// Complete combustion fuels: [formula, name].
const X_FUELS = [
  ["CH4", "methane"], ["C2H6", "ethane"], ["C3H8", "propane"], ["C4H10", "butane"], ["C5H12", "pentane"], ["C6H14", "hexane"],
  ["C7H16", "heptane"], ["C8H18", "octane"], ["C9H20", "nonane"], ["C10H22", "decane"],
  ["C2H4", "ethene"], ["C3H6", "propene"], ["C4H8", "butene"], ["C5H10", "pentene"], ["C6H12", "hexene"], ["C7H14", "heptene"], ["C8H16", "octene"],
  ["CH3OH", "methanol"], ["C2H5OH", "ethanol"], ["C3H7OH", "propanol"], ["C4H9OH", "butanol"], ["C5H11OH", "pentanol"],
  ["C6H13OH", "hexanol"], ["C7H15OH", "heptanol"], ["C8H17OH", "octanol"],
];
// "1 Fe2O3 + 3 CO = 2 Fe + 3 CO2" for a fuel's complete combustion.
function xCombustion(f) {
  const c = parseFormula(f);
  const x = c.C;
  const y = c.H;
  const z = c.O || 0;
  // CxHyOz + (x + y/4 - z/2) O2 = x CO2 + y/2 H2O, scaled by 4 then reduced.
  let k = [4, 4 * x + y - 2 * z, 4 * x, 2 * y];
  const g = k.reduce(gcd);
  k = k.map((n) => n / g);
  return `${k[0]} ${f} + ${k[1]} O2 = ${k[2]} CO2 + ${k[3]} H2O`;
}
for (const text of [...X_EQ, ...X_FUELS.map(([f]) => xCombustion(f))]) {
  const sides = parseEquation(text);
  const coefs = sides.flat().map((t) => t.coef);
  if (!balanced(sides, coefs) || coefs.reduce(gcd) !== 1 || coefs.length > 4) throw new Error(`Chemistry: bad Expert equation: ${text}`);
}

// "2 Mg + O₂ → 2 MgO" (coefficient 1 left out), or without coefficients for a balancing question.
function xShowEq(text, withCoefs = true) {
  return parseEquation(text)
    .map((side) => side.map((t) => `${withCoefs && t.coef !== 1 ? `${t.coef} ` : ""}${pretty(t.f)}`).join(" + "))
    .join(" → ");
}

// balancing / expert: balance a whole equation (every coefficient, lowest whole numbers).
function xBalance(rng) {
  let text, intro;
  if (rng.next() < 0.4) {
    const [f, name] = rng.pick(X_FUELS);
    text = xCombustion(f);
    intro = `Balance the equation for the complete combustion of ${name}`;
  } else {
    text = rng.pick(X_EQ);
    intro = "Balance this equation";
  }
  const terms = parseEquation(text).flat();
  const ids = ["a", "b", "c", "d"];
  const parts = terms.map((t, i) =>
    xInt(ids[i], pretty(t.f), `Coefficient of ${pretty(t.f)}`, t.coef, i === 0 ? "Use 1 when no number is needed in front." : `Count each element's atoms on both sides once ${pretty(t.f)} has its number.`)
  );
  const sides = parseEquation(text);
  const els = [];
  for (const t of terms) for (const el of Object.keys(parseFormula(t.f))) if (!els.includes(el)) els.push(el);
  const count = (side, el) => side.reduce((s, t) => s + t.coef * (parseFormula(t.f)[el] || 0), 0);
  return xMulti({
    kind: "x-balance",
    v: { eq: sides.map((side) => side.map((t) => t.f)) },
    prompt: `${intro}, using the lowest whole-number coefficients (write 1 where no number is needed):\n\n${xShowEq(text, false)}`,
    parts,
    steps: [
      `Balanced: **${xShowEq(text)}**.`,
      `Check every element: ${els.map((el) => `${el}: ${count(sides[0], el)} = ${count(sides[1], el)}`).join("; ")}.`,
      "The coefficients have no common factor, so they are the lowest whole numbers.",
    ],
    given: [],
    sameOk: true,
    hints: [
      "Start with an element that appears in only one formula on each side, and leave elements that appear alone (like O₂, H₂ or a metal) until last.",
      "Change only the numbers in front of formulas, never the subscripts. After each change, recount the atoms it affects.",
      "If you need half a molecule (often O₂), double every coefficient. At the end, check there is no common factor.",
    ],
  });
}

// Equations used for reacting masses (any reactant with any product).
const X_REACT = X_EQ;

// moles / expert: reacting masses from a balanced equation.
function xReact(rng) {
  const text = rng.pick(X_REACT);
  const [lhs, rhs] = parseEquation(text);
  const R = rng.pick(lhs);
  const P = rng.pick(rhs);
  const MR = molarMass(parseFormula(R.f));
  const MP = molarMass(parseFormula(P.f));
  const m = rng.int(10, 2000) / 10;
  const nR = m / MR;
  const nP = (nR * P.coef) / R.coef;
  const mP = nP * MP;
  return xMulti({
    kind: "x-react",
    v: { eq: text, r: R.f, p: P.f, m },
    prompt: `${xShowEq(text)}\n\nA reaction uses ${xs(m)} g of ${pretty(R.f)} completely. Use ${massNote([R.f, P.f])}. ${X_UNROUNDED}`,
    parts: [
      xNum("n", `Moles of ${pretty(R.f)}`, `Moles of ${pretty(R.f)} used, in mol`, nR, 4, "n = m ÷ M, where M is the sum of the atomic masses in the formula."),
      xNum("m", `Mass of ${pretty(P.f)}`, `Mass of ${pretty(P.f)} formed, in g`, mP, 2, "Use the equation's numbers as a mole ratio, then m = n × M."),
    ],
    steps: [
      `\`_M_R = ${massExpr(R.f)}\` → ${xs(MR)} g/mol. \`_n = _m / _M_R\` → ${xs(nR)}, which rounds to **${xr(nR, 4)} mol**.`,
      `Mole ratio ${pretty(R.f)} : ${pretty(P.f)} = ${R.coef} : ${P.coef}, so moles of ${pretty(P.f)} = \`_n * ${P.coef} / ${R.coef}\` → ${xs(nP)} mol.`,
      `\`_M_P = ${massExpr(P.f)}\` → ${xs(MP)} g/mol. Mass: \`_n * ${P.coef} / ${R.coef} * _M_P\` → ${xs(mP)}, which rounds to **${xr(mP, 2)} g**.`,
    ],
    given: [["_m", m]],
    hints: [
      `Change the mass of ${pretty(R.f)} into moles first.`,
      "The big numbers in front of the formulas give the mole ratio between any two substances.",
      `Turn the moles of ${pretty(P.f)} back into a mass with its own molar mass.`,
    ],
  });
}

// moles / expert: limiting reactant, product mass and the excess left over.
function xLimit(rng) {
  const text = rng.pick(X_EQ.filter((t) => parseEquation(t)[0].length === 2));
  const [lhs, rhs] = parseEquation(text);
  const P = rng.pick(rhs);
  const [A1, B1] = lhs;
  const MA = molarMass(parseFormula(A1.f));
  const MB = molarMass(parseFormula(B1.f));
  const MP = molarMass(parseFormula(P.f));
  const mA = rng.int(10, 1000) / 10;
  // B's amount: between 0.4 and 2.5 times what reacts exactly with A.
  const exactB = ((mA / MA) * B1.coef) / A1.coef * MB;
  const mB = xr(exactB * (rng.int(40, 250) / 100), 1);
  const rA = mA / MA / A1.coef;
  const rB = mB / MB / B1.coef;
  if (Math.abs(rA - rB) / Math.max(rA, rB) < 0.1 || mB <= 0) return null;
  const lim = rA < rB ? A1 : B1;
  const exc = lim === A1 ? B1 : A1;
  const r = Math.min(rA, rB); // moles of "reaction"
  const mP = r * P.coef * MP;
  const left = (lim === A1 ? mB : mA) - r * exc.coef * molarMass(parseFormula(exc.f));
  return xMulti({
    kind: "x-limit",
    v: { eq: text, p: P.f, mA, mB },
    prompt: `${xShowEq(text)}\n\n${xs(mA)} g of ${pretty(A1.f)} is mixed with ${xs(mB)} g of ${pretty(B1.f)} and they react until one runs out. Use ${massNote([A1.f, B1.f, P.f])}. ${X_UNROUNDED}`,
    parts: [
      xChoice("lim", "Limiting reactant", "Which reactant is used up first (the limiting reactant)?", pretty(lim.f), [pretty(A1.f), pretty(B1.f)], "Divide each reactant's moles by its number in the equation. The smaller result runs out first."),
      xNum("m", `Mass of ${pretty(P.f)}`, `Mass of ${pretty(P.f)} formed, in g`, mP, 2, "Only the limiting reactant decides how much product forms."),
      xNum("left", "Excess left", `Mass of ${pretty(exc.f)} left over, in g`, left, 2, "Find how much of the other reactant actually reacts, using the mole ratio, and subtract."),
    ],
    steps: [
      `Moles: ${pretty(A1.f)} \`_mA / ${xs(MA)}\` → ${xs(mA / MA)}; ${pretty(B1.f)} \`_mB / ${xs(MB)}\` → ${xs(mB / MB)}.`,
      `Divide by the equation's numbers: ${xs(rA)} for ${pretty(A1.f)} and ${xs(rB)} for ${pretty(B1.f)}. The smaller is **${pretty(lim.f)}**, so it is limiting.`,
      `${pretty(P.f)}: ${xs(r)} × ${P.coef} = ${xs(r * P.coef)} mol, × ${xs(MP)} g/mol → ${xs(mP)}, which rounds to **${xr(mP, 2)} g**.`,
      `${pretty(exc.f)} used: ${xs(r)} × ${exc.coef} = ${xs(r * exc.coef)} mol = ${xs(r * exc.coef * molarMass(parseFormula(exc.f)))} g, so ${xs(left)} g is left, which rounds to **${xr(left, 2)} g**.`,
    ],
    given: [["_mA", mA], ["_mB", mB]],
    hints: [
      "Turn both masses into moles.",
      "Compare them with the equation: divide each by its own number in front. The smaller result is the limiting reactant.",
      "Base the product on the limiting reactant. For the excess, work out how many moles of it react and subtract from what you had.",
    ],
  });
}

// moles / expert: percentage yield, or working back to the mass of reactant needed.
function xYield(rng) {
  const text = rng.pick(X_EQ);
  const [lhs, rhs] = parseEquation(text);
  const R = rng.pick(lhs);
  const P = rng.pick(rhs);
  const MR = molarMass(parseFormula(R.f));
  const MP = molarMass(parseFormula(P.f));
  const ratio = (P.coef * MP) / (R.coef * MR); // g of P per g of R
  if (rng.next() < 0.5) {
    const m = rng.int(20, 2000) / 10;
    const theo = m * ratio;
    const actual = xr(theo * (rng.int(40, 97) / 100), 2);
    if (!(actual > 0)) return null;
    const y = (100 * actual) / theo;
    return xMulti({
      kind: "x-yield",
      v: { eq: text, r: R.f, p: P.f, m, actual },
      prompt: `${xShowEq(text)}\n\nStarting from ${xs(m)} g of ${pretty(R.f)}, a student collects ${xs(actual)} g of ${pretty(P.f)}. Use ${massNote([R.f, P.f])}. ${X_UNROUNDED}`,
      parts: [
        xNum("theo", "Theoretical yield", `Maximum (theoretical) mass of ${pretty(P.f)}, in g`, theo, 2, "Mass → moles of reactant, use the mole ratio, then moles → mass of product."),
        xNum("y", "Percentage yield", "Percentage yield, in %", y, 1, "Percentage yield = actual mass ÷ theoretical mass × 100."),
      ],
      steps: [
        `Moles of ${pretty(R.f)}: \`_m / ${xs(MR)}\` → ${xs(m / MR)} mol; × ${P.coef}/${R.coef} → ${xs(((m / MR) * P.coef) / R.coef)} mol of ${pretty(P.f)}.`,
        `\`_theo = ${xs(((m / MR) * P.coef) / R.coef)} * ${xs(MP)}\` → ${xs(theo)}, which rounds to **${xr(theo, 2)} g**.`,
        `\`_actual / _theo * 100\` → ${xs(y)}, which rounds to **${xr(y, 1)}%**.`,
      ],
      given: [["_m", m], ["_actual", actual]],
      hints: [
        "First find the most product the reactant could ever make (100% yield), by the usual mass → moles → ratio → mass route.",
        `Use the equation's numbers ${R.coef} : ${P.coef} as the mole ratio.`,
        "Then compare what was collected with that maximum, as a percentage.",
      ],
    });
  }
  const want = rng.int(10, 1000) / 10;
  const yPct = rng.int(50, 95);
  const nP = want / MP;
  const need = want / ratio / (yPct / 100);
  return xMulti({
    kind: "x-yieldback",
    v: { eq: text, r: R.f, p: P.f, want, yPct },
    prompt: `${xShowEq(text)}\n\nA chemist needs ${xs(want)} g of ${pretty(P.f)}. The process has a ${yPct}% yield. Use ${massNote([R.f, P.f])}. ${X_UNROUNDED}`,
    parts: [
      xNum("n", `Moles of ${pretty(P.f)}`, `Moles of ${pretty(P.f)} needed, in mol`, nP, 4, "n = m ÷ M for the product."),
      xNum("m", `Mass of ${pretty(R.f)}`, `Mass of ${pretty(R.f)} to start with, in g`, need, 2, `Use the mole ratio for the 100% amount, then allow for the yield: only ${yPct}% of it turns into product.`),
    ],
    steps: [
      `\`_n = _want / ${xs(MP)}\` → ${xs(nP)}, which rounds to **${xr(nP, 4)} mol**.`,
      `At 100% yield: ${xs(nP)} × ${R.coef}/${P.coef} = ${xs((nP * R.coef) / P.coef)} mol of ${pretty(R.f)} = ${xs((nP * R.coef * MR) / P.coef)} g.`,
      `Only ${yPct}% becomes product, so divide by ${yPct / 100}: → ${xs(need)}, which rounds to **${xr(need, 2)} g**.`,
    ],
    given: [["_want", want], ["_yield", yPct]],
    hints: [
      "Work backwards from the product: its mass → its moles.",
      `Use the mole ratio ${pretty(R.f)} : ${pretty(P.f)} = ${R.coef} : ${P.coef} to get the reactant needed at 100% yield.`,
      "A lower yield means you need more to start with: divide by the yield as a decimal, don't multiply.",
    ],
  });
}

const X_ACIDS = [["hydrochloric acid", "HCl", 1], ["nitric acid", "HNO3", 1], ["sulfuric acid", "H2SO4", 2]];
const X_BASES = [["sodium hydroxide", "NaOH"], ["potassium hydroxide", "KOH"]];

// concentration / expert: a titration; moles of acid, moles of base, then the base concentration.
function xTitration(rng) {
  const [acid, af, k] = rng.pick(X_ACIDS);
  const [base, bf] = rng.pick(X_BASES);
  const Vb = rng.pick([10, 20, 25]);
  const cb = rng.int(20, 200) / 100;
  const ca = rng.int(5, 200) / 100;
  const titre = xr((cb * Vb) / k / ca, 2);
  if (titre < 8 || titre > 49) return null;
  const na = (ca * titre) / 1000;
  const nb = na * k;
  const cbx = nb / (Vb / 1000);
  const eq = k === 1 ? `${pretty(af)} + ${pretty(bf)} → ${bf[0] === "N" ? "Na" : "K"}${af === "HCl" ? "Cl" : "NO₃"} + H₂O` : `H₂SO₄ + 2 ${pretty(bf)} → ${bf[0] === "N" ? "Na" : "K"}₂SO₄ + 2 H₂O`;
  return xMulti({
    kind: "x-titration",
    v: { ca, titre, Vb, k },
    prompt: `In a titration, ${Vb} cm³ of ${base} solution is exactly neutralised by ${xs(titre)} cm³ of ${xs(ca)} mol/dm³ ${acid}.\n\n${eq}\n\n${X_UNROUNDED}`,
    parts: [
      xNum("na", "Moles of acid", "Moles of acid used, in mol", na, 5, "n = c × V, with V in dm³ (cm³ ÷ 1000)."),
      xNum("nb", "Moles of base", `Moles of ${pretty(bf)} neutralised, in mol`, nb, 5, `Use the equation: 1 ${pretty(af)} reacts with ${k} ${pretty(bf)}.`),
      xNum("cb", "Concentration", `Concentration of the ${base}, in mol/dm³`, cbx, 3, "c = n ÷ V with the base's volume in dm³."),
    ],
    steps: [
      `\`_na = _ca * _titre / 1000\` → ${xs(na)}, which rounds to **${xr(na, 5)} mol**.`,
      `Ratio 1 : ${k}: \`_nb = _na * ${k}\` → ${xs(nb)}, which rounds to **${xr(nb, 5)} mol**.`,
      `\`_nb / (_Vb / 1000)\` → ${xs(cbx)}, which rounds to **${xr(cbx, 3)} mol/dm³**.`,
    ],
    given: [["_Vb", Vb], ["_titre", titre], ["_ca", ca]],
    hints: [
      "Start with the solution you know everything about: the acid. Moles = concentration × volume in dm³.",
      `Read the mole ratio from the equation${k === 2 ? ": sulfuric acid has two H⁺ to give, so it neutralises twice as much base" : ""}.`,
      "Then divide the moles of base by its volume in dm³.",
    ],
  });
}

const X_SOLIDS = [
  ["sodium chloride", "NaCl"], ["sodium hydroxide", "NaOH"], ["potassium chloride", "KCl"], ["copper(II) sulfate", "CuSO4"],
  ["sodium carbonate", "Na2CO3"], ["potassium nitrate", "KNO3"], ["magnesium sulfate", "MgSO4"], ["glucose", "C6H12O6"], ["silver nitrate", "AgNO3"],
];

// concentration / expert: make a standard solution, then dilute a sample of it.
function xMakeDilute(rng) {
  const [name, f] = rng.pick(X_SOLIDS);
  const M = molarMass(parseFormula(f));
  const m = rng.int(10, 500) / 10;
  const V1 = rng.pick([100, 250, 500, 1000]);
  const a = rng.pick([5, 10, 20, 25, 50]);
  const V2 = rng.pick([100, 250, 500, 1000].filter((x) => x > a * 2));
  const c1 = m / M / (V1 / 1000);
  const c2 = (c1 * a) / V2;
  const g2 = c2 * M;
  return xMulti({
    kind: "x-makedilute",
    v: { f, m, V1, a, V2 },
    prompt: `${xs(m)} g of ${name} (${pretty(f)}) is dissolved in water and made up to ${V1} cm³. Then ${a} cm³ of this solution is diluted with water to ${V2} cm³. Use ${massNote([f])}. ${X_UNROUNDED}`,
    parts: [
      xNum("c1", "First solution", "Concentration of the first solution, in mol/dm³", c1, 3, "Mass → moles, then c = n ÷ V with V in dm³."),
      xNum("c2", "Diluted solution", "Concentration after dilution, in mol/dm³", c2, 4, "c1 × V1 = c2 × V2 for the sample you took and the volume it was made up to."),
      xNum("g2", "In g/dm³", "Concentration after dilution, in g/dm³", g2, 3, "Multiply mol/dm³ by the molar mass."),
    ],
    steps: [
      `\`_M = ${massExpr(f)}\` → ${xs(M)} g/mol. \`_c1 = _m / _M / (_V1 / 1000)\` → ${xs(c1)}, which rounds to **${xr(c1, 3)} mol/dm³**.`,
      `\`_c2 = _c1 * _a / _V2\` → ${xs(c2)}, which rounds to **${xr(c2, 4)} mol/dm³**.`,
      `\`_c2 * _M\` → ${xs(g2)}, which rounds to **${xr(g2, 3)} g/dm³**.`,
    ],
    given: [["_m", m], ["_V1", V1], ["_a", a], ["_V2", V2]],
    hints: [
      "Two stages: making the first solution, then diluting a sample of it.",
      "For the dilution only the sample matters: its moles are spread through the new, bigger volume.",
      "To change mol/dm³ to g/dm³, multiply by the molar mass.",
    ],
  });
}

// concentration / expert: mix two solutions of the same solute, then dilute to a target.
function xMix(rng) {
  const [name] = rng.pick(X_SOLIDS);
  const c1 = rng.int(5, 200) / 100;
  let c2;
  do c2 = rng.int(5, 200) / 100;
  while (c2 === c1);
  const V1 = rng.int(2, 60) * 5;
  const V2 = rng.int(2, 60) * 5;
  const n = (c1 * V1 + c2 * V2) / 1000;
  const c = n / ((V1 + V2) / 1000);
  const c3 = xr(c * (rng.int(20, 80) / 100), 3);
  if (!(c3 > 0)) return null;
  const water = (n / c3) * 1000 - (V1 + V2);
  return xMulti({
    kind: "x-mix",
    v: { c1, V1, c2, V2, c3 },
    prompt: `${V1} cm³ of ${xs(c1)} mol/dm³ ${name} solution is mixed with ${V2} cm³ of ${xs(c2)} mol/dm³ ${name} solution. Assume the volumes add. ${X_UNROUNDED}`,
    parts: [
      xNum("c", "Mixed concentration", "Concentration of the mixture, in mol/dm³", c, 3, "Add the moles from both solutions and divide by the total volume. Don't average the concentrations."),
      xNum("w", "Water to add", `Volume of water to add to the mixture to bring it down to ${xs(c3)} mol/dm³, in cm³`, water, 1, "The moles stay the same: find the final volume from n ÷ c, then subtract the volume you already have."),
    ],
    steps: [
      `Moles: \`(_c1 * _V1 + _c2 * _V2) / 1000\` → ${xs(n)} mol, in ${V1 + V2} cm³.`,
      `\`_c = ${xs(n)} / ((_V1 + _V2) / 1000)\` → ${xs(c)}, which rounds to **${xr(c, 3)} mol/dm³**.`,
      `Final volume: \`${xs(n)} / _c3 * 1000\` → ${xs((n / c3) * 1000)} cm³. Water: minus ${V1 + V2} → ${xs(water)}, which rounds to **${xr(water, 1)} cm³**.`,
    ],
    given: [["_c1", c1], ["_V1", V1], ["_c2", c2], ["_V2", V2], ["_c3", c3]],
    hints: [
      "Concentrations don't simply average unless the volumes are equal. Work in moles: n = c × V (V in dm³) for each solution.",
      "Total moles ÷ total volume (in dm³) gives the mixture's concentration.",
      "Adding water keeps the moles the same. The final volume is n ÷ c; take away the volume already there.",
    ],
  });
}

// [molecular formula, name] for empirical → molecular formula questions (C, H, O only).
const X_MOLS = [
  ["C2H4O2", "ethanoic acid"], ["C6H12O6", "glucose"], ["C3H6O3", "lactic acid"], ["C4H8", "butene"], ["C6H12", "cyclohexane"],
  ["C2H2", "ethyne"], ["C6H6", "benzene"], ["C8H8", "styrene"], ["C2H6", "ethane"], ["C4H10", "butane"], ["C10H8", "naphthalene"],
  ["C4H8O2", "ethyl ethanoate"], ["C5H10", "pentene"], ["C8H18", "octane"], ["C6H14", "hexane"], ["C4H6", "butadiene"],
  ["C3H4", "propyne"], ["C6H10O4", "adipic acid"], ["C4H4O4", "fumaric acid"], ["C2H6O2", "ethane-1,2-diol"], ["C8H10", "xylene"],
];

// composition / expert: from percentages (or masses in a sample) and the molar mass, to the molecular formula.
function xEmpMol(rng) {
  const [f, name] = rng.pick(X_MOLS);
  const c = parseFormula(f);
  const Mm = molarMass(c);
  const els = Object.keys(c);
  const useMass = rng.next() < 0.5;
  const sample = rng.int(100, 900) / 100;
  const data = {};
  for (const el of els) {
    const frac = (c[el] * ar(el)) / Mm;
    data[el] = useMass ? xr(frac * sample, 3) : xr(frac * 100, 1);
  }
  const sr = simplestRatio(data);
  if (!sr) return null;
  const Me = molarMass(sr.counts);
  const k = Mm / Me;
  if (Math.abs(k - Math.round(k)) > 1e-9 || els.some((el) => sr.counts[el] * Math.round(k) !== c[el])) return null;
  const list = els.map((el) => (useMass ? `${xs(data[el])} g of ${EL_NAME(el)}` : `${xs(data[el])}% ${EL_NAME(el)}`));
  const dataText = useMass
    ? `A ${xs(sample)} g sample of ${name} contains ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}.`
    : `By mass, ${name} is ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}.`;
  const empF = els.map((el) => `${el}${sr.counts[el] === 1 ? "" : sr.counts[el]}`).join("");
  return xMulti({
    kind: "x-empmol",
    v: { data, Mm },
    prompt: `${dataText} Its relative molecular mass is ${Mm}. Use ${massNote([f])}. Find its molecular formula.`,
    parts: els.map((el) =>
      xInt(el.toLowerCase(), `${EL_NAME(el)[0].toUpperCase()}${EL_NAME(el).slice(1)} atoms`, `Number of ${el} atoms in one molecule`, c[el], el === "C" ? "Find the empirical formula first: divide each amount by the atomic mass, then by the smallest result." : "Scale the empirical formula up so its mass matches the relative molecular mass.")
    ),
    steps: [
      `Divide by the atomic masses: ${els.map((el) => `${el} ${xs(data[el])} ÷ ${ar(el)} = ${xs(data[el] / ar(el))}`).join(", ")}.`,
      `Divide by the smallest and round to whole numbers${sr.k > 1 ? ` (after multiplying by ${sr.k})` : ""}: empirical formula **${pretty(empF)}**, mass ${xs(Me)}.`,
      `${Mm} ÷ ${xs(Me)} = ${Math.round(k)}, so multiply every subscript by ${Math.round(k)}: **${pretty(f)}**.`,
    ],
    given: [...els.map((el) => [`_${el}`, data[el]]), ["_Mr", Mm]],
    sameOk: true,
    hints: [
      `Find the empirical formula first: divide each ${useMass ? "mass" : "percentage"} by its atomic mass, then divide every result by the smallest.`,
      "If a ratio ends in about .5 or .33, multiply them all by the small whole number that clears it (double or triple them).",
      "Divide the relative molecular mass by the empirical formula's mass, and multiply each subscript by that whole number.",
    ],
  });
}

// [anhydrous formula, name, water count]
const X_HYDRATES = [
  ["CuSO4", "copper(II) sulfate", 5], ["MgSO4", "magnesium sulfate", 7], ["Na2CO3", "sodium carbonate", 10], ["CaCl2", "calcium chloride", 6],
  ["FeSO4", "iron(II) sulfate", 7], ["ZnSO4", "zinc sulfate", 7], ["Na2SO4", "sodium sulfate", 10], ["MgCl2", "magnesium chloride", 6],
  ["CaSO4", "calcium sulfate", 2], ["Na2S2O3", "sodium thiosulfate", 5],
];

// composition / expert: water of crystallisation from heating a hydrate to constant mass.
function xHydrate(rng) {
  const [f, name, x] = rng.pick(X_HYDRATES);
  const Ma = molarMass(parseFormula(f));
  const m1 = rng.int(150, 1200) / 100;
  const m2 = xr((m1 * Ma) / (Ma + 18 * x), 2);
  const w = m1 - m2;
  const ns = m2 / Ma;
  const nw = w / 18;
  if (Math.abs(nw / ns - x) > 0.15) return null;
  return xMulti({
    kind: "x-hydrate",
    v: { f, m1, m2 },
    prompt: `${xs(m1)} g of hydrated ${name}, ${pretty(f)}·xH₂O, is heated to constant mass. ${xs(m2)} g of the anhydrous salt is left. Use ${massNote([f, "H2O"])}. ${X_UNROUNDED}`,
    parts: [
      xNum("w", "Water lost", "Mass of water driven off, in g", w, 2, "The mass lost on heating is all water."),
      xNum("ns", "Moles of salt", `Moles of anhydrous ${pretty(f)}, in mol`, ns, 4, "n = m ÷ M for the anhydrous salt."),
      xInt("x", "x", "Value of x (a whole number)", x, "Divide the moles of water by the moles of salt and round to the nearest whole number."),
    ],
    steps: [
      `\`_w = _m1 - _m2\` → **${xr(w, 2)} g** of water.`,
      `\`_ns = _m2 / (${massExpr(f)})\` → ${xs(ns)}, which rounds to **${xr(ns, 4)} mol**. Water: \`_w / 18\` → ${xs(nw)} mol.`,
      `Ratio: ${xs(nw)} ÷ ${xs(ns)} = ${xs(nw / ns)}, so **x = ${x}**: ${pretty(f)}·${x}H₂O.`,
    ],
    given: [["_m1", m1], ["_m2", m2]],
    hints: [
      "Heating drives off the water of crystallisation, so the loss in mass is the water.",
      "Change both the water and the anhydrous salt into moles.",
      "x is the number of water molecules per formula unit of salt: a mole ratio, rounded to a whole number.",
    ],
  });
}

// composition / expert: percentage of water in a hydrate, and the mass left after heating a sample.
function xPctWater(rng) {
  const [f, name, x] = rng.pick(X_HYDRATES);
  const Ma = molarMass(parseFormula(f));
  const Mh = Ma + 18 * x;
  const pct = (100 * 18 * x) / Mh;
  const m = rng.int(100, 5000) / 100;
  const left = (m * Ma) / Mh;
  return xMulti({
    kind: "x-pctwater",
    v: { f, x, m },
    prompt: `Hydrated ${name} has the formula ${pretty(f)}·${x}H₂O. A ${xs(m)} g sample is heated until all its water is driven off. Use ${massNote([f, "H2O"])}. ${X_UNROUNDED}`,
    parts: [
      xNum("Mh", "Molar mass", `Molar mass of ${pretty(f)}·${x}H₂O, in g/mol`, Mh, 1, "Add the anhydrous salt's molar mass and x times the molar mass of water."),
      xNum("pct", "Percentage water", "Percentage of water by mass", pct, 1, "Mass of the water in one formula unit ÷ the whole molar mass × 100."),
      xNum("left", "Mass left", "Mass of anhydrous salt left, in g", left, 2, "The salt's share of the mass is what remains: 100% minus the water percentage."),
    ],
    steps: [
      `\`_Mh = ${massExpr(f)} + ${x}*18\` → **${xs(Mh)} g/mol**.`,
      `\`${x} * 18 / _Mh * 100\` → ${xs(pct)}, which rounds to **${xr(pct, 1)}%**.`,
      `\`_m * (1 - ${x} * 18 / _Mh)\` → ${xs(left)}, which rounds to **${xr(left, 2)} g**.`,
    ],
    given: [["_m", m]],
    sameOk: true,
    hints: [
      "The dot means the water is part of the formula: add x × 18 to the salt's molar mass.",
      "Percentage of water = water's mass in the formula ÷ the whole molar mass × 100.",
      "After heating only the anhydrous salt is left: the rest of the percentage.",
    ],
  });
}

function genExpert(subtopic, rng) {
  const pick = (list) => list[rng.int(0, list.length - 1)];
  if (subtopic === "moles") return xTry(pick([xReact, xLimit, xYield]), rng);
  if (subtopic === "concentration") return xTry(pick([xTitration, xMakeDilute, xMix]), rng);
  if (subtopic === "balancing") return xTry(xBalance, rng);
  if (subtopic === "composition") return xTry(pick([xEmpMol, xHydrate, xPctWater]), rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent truth for verify. Molar masses are recomputed from the formula; coefficients are
// checked by counting atoms for the learner's own numbers; formulas are rebuilt from the data.
// Independent check helpers (verify only): expand brackets textually, then scan "Symbol count" tokens.
const subsToAscii = (t) => String(t).replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
function checkCounts(text) {
  let s = subsToAscii(text);
  if (!/^[A-Za-z0-9()]+$/.test(s)) throw new Error(`Bad formula: ${text}`);
  const inner = /\(([^()]*)\)([1-9]\d*)?/;
  while (inner.test(s)) s = s.replace(inner, (_, body, k) => body.repeat(k === undefined ? 1 : Number(k)));
  if (/[()]/.test(s)) throw new Error(`Bad formula: ${text}`);
  const counts = {};
  const re = /([A-Z][a-z]?)([1-9]\d*)?/g;
  let used = 0;
  let m;
  while ((m = re.exec(s))) {
    ar(m[1]); // throws for an element without a stated mass
    counts[m[1]] = (counts[m[1]] || 0) + (m[2] === undefined ? 1 : Number(m[2]));
    used += m[0].length;
  }
  if (used !== s.length || !used) throw new Error(`Bad formula: ${text}`);
  return counts;
}
const checkMass = (text) => Object.entries(checkCounts(text)).reduce((t, [el, c]) => t + ar(el) * c, 0);
const checkCount = (text, el) => checkCounts(text)[el] || 0;

const xM = (f) => checkMass(f);
const xCoef = (text, f, side) => parseEquation(text)[side].find((t) => t.f === f).coef;
const X_TRUTH = {
  "x-react": ({ eq, r, p, m }) => {
    // Mass of product per mole "of reaction", times the moles of reaction the reactant supplies.
    const reactions = m / xM(r) / xCoef(eq, r, 0);
    return { n: reactions * xCoef(eq, r, 0), m: reactions * xCoef(eq, p, 1) * xM(p) };
  },
  "x-limit": ({ eq, p, mA, mB }) => {
    const [[A1, B1]] = parseEquation(eq);
    const fromA = (mA / xM(A1.f) / A1.coef) * xCoef(eq, p, 1) * xM(p);
    const fromB = (mB / xM(B1.f) / B1.coef) * xCoef(eq, p, 1) * xM(p);
    const limA = fromA < fromB;
    const mP = Math.min(fromA, fromB);
    // Mass conservation per reactant pair: excess used = product formed × (its share of the ratio).
    const exc = limA ? B1 : A1;
    const used = (mP / (xCoef(eq, p, 1) * xM(p))) * exc.coef * xM(exc.f);
    return { lim: pretty(limA ? A1.f : B1.f), m: mP, left: (limA ? mB : mA) - used };
  },
  "x-yield": ({ eq, r, p, m, actual }) => {
    const theo = xRoot((x) => x / xM(p) / xCoef(eq, p, 1) - m / xM(r) / xCoef(eq, r, 0), 0, 1e7);
    return { theo, y: (actual / theo) * 100 };
  },
  "x-yieldback": ({ eq, r, p, want, yPct }) => {
    const n = want / xM(p);
    const need = xRoot((x) => ((x * yPct) / 100 / xM(r)) * (xCoef(eq, p, 1) / xCoef(eq, r, 0)) * xM(p) - want, 0, 1e8);
    return { n, m: need };
  },
  "x-titration": ({ ca, titre, Vb, k }) => {
    const nb = (k * ca * titre) / 1000;
    return { na: nb / k, nb, cb: (k * ca * titre) / Vb };
  },
  "x-makedilute": ({ f, m, V1, a, V2 }) => {
    const gPerDm3 = (m / V1) * 1000 * (a / V2); // mass route
    return { c1: (m / xM(f)) * (1000 / V1), c2: gPerDm3 / xM(f), g2: gPerDm3 };
  },
  "x-mix": ({ c1, V1, c2, V2, c3 }) => {
    const n = (c1 * V1 + c2 * V2) / 1000;
    return { c: (c1 * V1 + c2 * V2) / (V1 + V2), w: xRoot((x) => (n * 1000) / (V1 + V2 + x) - c3, 0, 1e8) };
  },
  // Any coefficients the learner gives are accepted if they balance every element and share no factor.
  "x-balance": ({ eq }, answer) => {
    const ids = ["a", "b", "c", "d"];
    const flat = eq.flat();
    const coefs = flat.map((_, i) => Number(answer && answer[ids[i]]));
    const tally = [{}, {}];
    let i = 0;
    eq.forEach((side, s) => {
      for (const f of side) {
        for (const [el, k] of Object.entries(parseFormula(f))) tally[s][el] = (tally[s][el] || 0) + coefs[i] * k;
        i++;
      }
    });
    const ok =
      coefs.every((c) => Number.isInteger(c) && c >= 1) &&
      coefs.reduce(gcd) === 1 &&
      [...new Set([...Object.keys(tally[0]), ...Object.keys(tally[1])])].every((el) => tally[0][el] === tally[1][el]);
    // When the answer balances, it is the truth; otherwise return an impossible value for each part.
    return Object.fromEntries(flat.map((_, j) => [ids[j], ok ? coefs[j] : -1]));
  },
  "x-empmol": ({ data, Mm }) => {
    const sr = simplestRatio(data);
    const k = Math.round(Mm / molarMass(sr.counts));
    return Object.fromEntries(Object.entries(sr.counts).map(([el, n]) => [el.toLowerCase(), n * k]));
  },
  "x-hydrate": ({ f, m1, m2 }) => {
    const ns = m2 / xM(f);
    return { w: m1 - m2, ns, x: Math.round((m1 - m2) / xM("H2O") / ns) };
  },
  "x-pctwater": ({ f, x, m }) => {
    const Mh = xM(`${f}`) + x * xM("H2O");
    const waterShare = (x * xM("H2O")) / Mh;
    return { Mh, pct: waterShare * 100, left: m - m * waterShare };
  },
};

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  const gen = GENERATORS[subtopic];
  if (!gen) throw new Error(`Unknown subtopic: ${subtopic}`);
  for (let i = 0; i < 80; i++) {
    const q = gen(difficulty, rng);
    if (q) return q;
  }
  throw new Error(`Chemistry: could not generate ${subtopic}/${difficulty}`);
}

// ---------------------------------------------------------------------------------------------
// Independent check. Molar masses are recomputed here from the formula and the atomic-mass table.
// Numeric answers: the defining relation, written as a residual g(x) that is monotonic in the unknown,
// must change sign across [x - tol, x + tol]; i.e. the true value lies within the accepted band.

const Mof = (f) => checkMass(f);
const kOf = (f, el) => checkCount(f, el);

const RESIDUAL = {
  "moles-n": (v, x) => x * Mof(v.f) - v.m,
  "moles-m": (v, x) => x / Mof(v.f) - v.n,
  "moles-M": (v, x) => x * v.n - v.m,
  "moles-atoms": (v, x) => (x / kOf(v.f, v.el)) * Mof(v.f) - v.m,
  "moles-particles": (v, x) => (x / L_AVO) * Mof(v.f) - v.m,
  "conc-c": (v, x) => x * v.V - v.n,
  "conc-n": (v, x) => x / v.V - v.c,
  "conc-V": (v, x) => x * v.c - v.n,
  "conc-c-cm3": (v, x) => (x * v.Vc) / 1000 - v.n,
  "conc-n-cm3": (v, x) => (1000 * x) / v.Vc - v.c,
  "conc-V-cm3": (v, x) => (x * v.c) / 1000 - v.n,
  "conc-dil-c2": (v, x) => x * v.V2 - v.c1 * v.V1,
  "conc-dil-V2": (v, x) => x * v.c2 - v.c1 * v.V1,
  "conc-dil-V1": (v, x) => x * v.c1 - v.c2 * v.V2,
  "conc-mass-c": (v, x) => x * (v.Vc / 1000) * Mof(v.f) - v.m,
  "conc-mass-needed": (v, x) => x / Mof(v.f) / (v.Vc / 1000) - v.c,
  "conc-water-add": (v, x) => (v.V1 + x) * v.c2 - v.c1 * v.V1,
  "comp-percent": (v, x) => (x * Mof(v.f)) / 100 - kOf(v.f, v.el) * ar(v.el),
  "comp-mass-el": (v, x) => x * Mof(v.f) - v.m * kOf(v.f, v.el) * ar(v.el),
  "comp-mass-compound": (v, x) => x * kOf(v.f, v.el) * ar(v.el) - v.mel * Mof(v.f),
};

function numericOk(p, raw, tol) {
  if (raw === "" || raw === null || raw === undefined || typeof raw === "object") return false;
  const x = Number(raw);
  if (!Number.isFinite(x) || !(x > 0)) return false;
  if (p.integer && !Number.isInteger(x)) return false;
  const g = RESIDUAL[p.kind];
  if (!g) return false;
  const h = tol > 0 ? tol + 1e-7 : 1e-9 * Math.max(1, Math.abs(x));
  if (x - h <= 0) return false;
  const a = g(p.values, x - h);
  const b = g(p.values, x + h);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === 0 || b === 0 || a < 0 !== b < 0;
}

function balanceOk(v, raw) {
  const x = Number(raw);
  if (raw === "" || raw === null || !Number.isInteger(x) || x < 1) return false;
  const sides = parseEquation(v.equation);
  const coefs = sides.flat().map((t) => t.coef);
  if (!(v.miss >= 0 && v.miss < coefs.length)) return false;
  coefs[v.miss] = x;
  return balanced(sides, coefs);
}

// Recompute the empirical formula from the data (moles ÷ smallest, then the smallest whole multiplier).
function empiricalCounts(v) {
  const sr = simplestRatio(v.data);
  return sr ? sr.counts : null;
}

function formulaAnswerOk(p, q, raw) {
  let target;
  if (p.kind === "comp-empirical") target = empiricalCounts(p.values);
  else {
    const ce = checkCounts(p.values.emp);
    const n = p.values.Mm / checkMass(p.values.emp);
    if (!Number.isInteger(Math.round(n)) || Math.abs(n - Math.round(n)) > 1e-9) return false;
    target = Object.fromEntries(Object.entries(ce).map(([el, c]) => [el, c * Math.round(n)]));
  }
  if (!target) return false;
  if (p.ask === "formula") {
    let c;
    try {
      c = checkCounts(String(raw));
    } catch {
      return false;
    }
    const els = new Set([...Object.keys(c), ...Object.keys(target)]);
    for (const el of els) if (c[el] !== target[el]) return false;
    return true;
  }
  const x = Number(raw);
  return raw !== "" && raw !== null && Number.isInteger(x) && x === target[p.ask];
}

function answerOk(q, raw) {
  const p = q.params;
  if (p.kind === "balance") return balanceOk(p.values, raw);
  if (p.kind === "comp-empirical" || p.kind === "comp-molecular") return formulaAnswerOk(p, q, raw);
  const tol = p.rounded ? 0.5 * 10 ** -p.dp : 0;
  return numericOk(p, raw, tol);
}

export function verify(question, answer) {
  const p = question && question.params;
  if (p && typeof p.kind === "string" && p.kind.startsWith("x-")) return xVerify(question, answer, X_TRUTH);
  if (!p || !p.values || typeof p.kind !== "string") return false;
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
    // Exactly one choice may be correct.
    if (ch.filter((c) => answerOk(question, c)).length !== 1) return false;
  }
  try {
    return answerOk(question, answer) === true;
  } catch {
    return false;
  }
}
