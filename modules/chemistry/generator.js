// Chemistry generator: moles, concentration, balancing equations, percent composition and
// empirical / molecular formulae. Uses only the seeded rng passed in by the engine.
// Every prompt states the atomic masses (or molar mass) it relies on, its units and its rounding.
// Rounded answers are accepted within half a unit of the stated precision; exact answers must match.
// Explanations list every step as a labelled calculator row, e.g. `_M = 2*1 + 16` → 18.

// ---------------------------------------------------------------------------------------------
// Number helpers

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
// Chemistry data

// Rounded relative atomic masses (the values used in most school data sheets).
const A = { H: 1, C: 12, N: 14, O: 16, Na: 23, Mg: 24, Al: 27, P: 31, S: 32, Cl: 35.5, K: 39, Ca: 40, Mn: 55, Fe: 56, Cu: 63.5, Zn: 65, Ag: 108 };

const EL_NAME = {
  H: "hydrogen", C: "carbon", N: "nitrogen", O: "oxygen", Na: "sodium", Mg: "magnesium", Al: "aluminium", P: "phosphorus",
  S: "sulfur", Cl: "chlorine", K: "potassium", Ca: "calcium", Mn: "manganese", Fe: "iron", Cu: "copper", Zn: "zinc", Ag: "silver",
};

// Parse an ASCII formula such as "Al2(SO4)3" into element counts { Al: 2, S: 3, O: 12 }.
// Unicode subscripts (H₂O) are accepted too. Throws on anything else.
function parseFormula(text) {
  const f = String(text).replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
  let i = 0;
  function group(depth) {
    const counts = {};
    while (i < f.length && f[i] !== ")") {
      let part;
      if (f[i] === "(") {
        i++;
        part = group(depth + 1);
        if (f[i] !== ")") throw new Error(`Bad formula: ${text}`);
        i++;
      } else {
        const m = /^[A-Z][a-z]?/.exec(f.slice(i));
        if (!m || !(m[0] in A)) throw new Error(`Bad formula: ${text}`);
        i += m[0].length;
        part = { [m[0]]: 1 };
      }
      const d = /^[1-9]\d*/.exec(f.slice(i));
      const k = d ? Number(d[0]) : 1;
      if (d) i += d[0].length;
      for (const [el, c] of Object.entries(part)) counts[el] = (counts[el] || 0) + c * k;
    }
    if (depth === 0 && i !== f.length) throw new Error(`Bad formula: ${text}`);
    return counts;
  }
  const counts = group(0);
  if (!Object.keys(counts).length) throw new Error(`Bad formula: ${text}`);
  return counts;
}

const molarMass = (counts) => Object.entries(counts).reduce((s, [el, c]) => s + c * A[el], 0);

// Elements in order of first appearance in the formula.
const elementsOf = (f) => Object.keys(parseFormula(f));

// "H2SO4" -> "H₂SO₄"
const pretty = (f) => f.replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);

// "(H = 1, S = 32, O = 16)" for the atomic masses a list of formulas needs.
function massNote(formulas) {
  const els = [];
  for (const f of formulas) for (const el of elementsOf(f)) if (!els.includes(el)) els.push(el);
  return `the atomic masses ${els.map((el) => `${el} = ${A[el]}`).join(", ")}`;
}

// Calculator expression for a molar mass: "2*1 + 32 + 4*16".
function massExpr(f) {
  return Object.entries(parseFormula(f))
    .map(([el, c]) => (c === 1 ? `${A[el]}` : `${c}*${A[el]}`))
    .join(" + ");
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
  let kind, prompt, exact, unit, intro, lines, candidates, values, o;

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
      prompt = `${mGiven} How many moles of ${EL_NAME[el]} atoms (${el}) are in ${num(m)} g of ${what}, in mol?${EXACT}`;
      intro = `Find the moles of ${P} with \`n = m / M\`, then multiply by the number of ${el} atoms in one formula unit (${k}).${mIntro}`;
      lines = [given("_mass", m, "g"), mLine, step("_n", "_mass / _M", `${num(n)} mol`), step("_n_" + el, `_n * ${k}`, final(exact, o, unit))];
      candidates = [n, n * k * 2, m / A[el], (m * k) / A[el], n / k];
    } else if (kind === "n") {
      exact = n;
      unit = "mol";
      values = { m, f };
      prompt = `${mGiven} How many moles are in ${num(m)} g of ${what}, in mol?${EXACT}`;
      intro = `Use \`n = m / M\` (moles = mass ÷ molar mass).${mIntro}`;
      lines = [given("_mass", m, "g"), mLine, step("_n", "_mass / _M", final(exact, o, unit))];
      candidates = [m * M, M / m, n * 10, n / 10];
    } else if (kind === "m") {
      exact = m;
      unit = "g";
      values = { n, f };
      prompt = `${mGiven} What is the mass of ${num(n)} mol of ${what}, in g?${EXACT}`;
      intro = `Rearrange \`n = m / M\` to \`m = n × M\`.${mIntro}`;
      lines = [given("_n", n, "mol"), mLine, step("_mass", "_n * _M", final(exact, o, unit))];
      candidates = [M / n, n / M, M, m * 2];
    } else {
      exact = M;
      unit = "g/mol";
      values = { m, n };
      prompt = `A sample of ${num(n)} mol of a substance has a mass of ${num(m)} g. What is its molar mass, in g/mol?${EXACT}`;
      intro = "Rearrange `n = m / M` to `M = m / n`.";
      lines = [given("_mass", m, "g"), given("_n", n, "mol"), step("_M", "_mass / _n", final(exact, o, unit))];
      candidates = [m * n, n / m, m];
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
      } else {
        const el = rng.pick(Object.keys(counts));
        const k = counts[el];
        o = { dp: 3, rounded: true };
        exact = n * k;
        unit = "mol";
        values = { m, f, el };
        prompt = `How many moles of ${EL_NAME[el]} atoms (${el}) are in ${num(m)} g of ${what}, in mol? Use ${massNote([f])}.${roundNote(3)}`;
        intro = `Find the moles of ${P} with \`n = m / M\`, then multiply by the number of ${el} atoms in one formula unit (${k}).`;
        lines = [...mLines, nLine, step("_n_" + el, `_n * ${k}`, final(exact, o, unit))];
        candidates = [n, m / A[el], (m * k) / A[el], n / k, n * k * 2];
      }
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `moles-${kind}`, values } };
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
  let kind, prompt, exact, unit, intro, lines, candidates, values, o;

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
    } else if (kind === "n") {
      exact = n;
      unit = "mol";
      values = { c, V };
      prompt = `How many moles of ${what} are in ${num(V)} dm³ of a ${num(c)} mol/dm³ solution, in mol?${EXACT}`;
      intro = "Rearrange `c = n / V` to `n = c × V`.";
      lines = [given("_c", c, "mol/dm³"), given("_V", V, "dm³"), step("_n", "_c * _V", final(exact, o, unit))];
      candidates = [c / V, V / c, c + V];
    } else {
      exact = V;
      unit = "dm³";
      values = { n, c };
      prompt = `What volume of a ${num(c)} mol/dm³ solution of ${what} contains ${num(n)} mol, in dm³?${EXACT}`;
      intro = "Rearrange `c = n / V` to `V = n / c`.";
      lines = [given("_n", n, "mol"), given("_c", c, "mol/dm³"), step("_V", "_n / _c", final(exact, o, unit))];
      candidates = [n * c, c / n, V * 1000];
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
      } else if (kind === "dil-V2") {
        exact = V2;
        unit = "cm³";
        values = { c1, V1, c2 };
        prompt = `${num(V1)} cm³ of a ${num(c1)} mol/dm³ solution of ${what} is diluted to ${num(c2)} mol/dm³. What is the final total volume, in cm³?${EXACT}`;
        lines = [given("_c1", c1), given("_V1", V1, "cm³"), given("_c2", c2), step("_V2", "_c1 * _V1 / _c2", final(exact, o, unit))];
        candidates = [V2 - V1, (c2 * V1) / c1, V2 / 1000, V1 * 2];
      } else {
        exact = V1;
        unit = "cm³";
        values = { c1, c2, V2 };
        prompt = `What volume of a ${num(c1)} mol/dm³ stock solution of ${what} is needed to make ${num(V2)} cm³ of a ${num(c2)} mol/dm³ solution, in cm³?${EXACT}`;
        lines = [given("_c1", c1), given("_c2", c2), given("_V2", V2, "cm³"), step("_V1", "_c2 * _V2 / _c1", final(exact, o, unit))];
        candidates = [(c1 * V2) / c2, V2 - V1, V1 / 1000, V1 * 2];
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
      } else if (kind === "n-cm3") {
        exact = n;
        unit = "mol";
        values = { c, Vc };
        prompt = `How many moles of ${what} are in ${num(Vc)} cm³ of a ${num(c)} mol/dm³ solution, in mol?${EXACT}`;
        intro = `Convert the volume to dm³, then use \`n = c × V\`. ${CONV}`;
        lines = [given("_c", c, "mol/dm³"), given("_V_cm3", Vc), step("_V", `_V_cm3 / 1000`, `${num(Vc / 1000)} dm³`), step("_n", "_c * _V", final(exact, o, unit))];
        candidates = [c * Vc, c / Vc, n * 10, n / 10];
      } else {
        exact = Vc;
        unit = "cm³";
        values = { n, c };
        prompt = `What volume of a ${num(c)} mol/dm³ solution of ${what} contains ${num(n)} mol, in cm³?${EXACT}`;
        intro = `Use \`V = n / c\` to get dm³, then multiply by 1000 for cm³. ${CONV}`;
        lines = [given("_n", n, "mol"), given("_c", c, "mol/dm³"), step("_V_dm3", "_n / _c", `${num(n / c)} dm³`), step("_V", "_V_dm3 * 1000", final(exact, o, unit))];
        candidates = [Vc / 1000, n * c * 1000, Vc * 10, Vc / 10];
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
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `conc-${kind}`, values } };
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
for (const list of Object.values(EQUATIONS)) {
  for (const text of list) {
    const sides = parseEquation(text);
    const coefs = sides.flat().map((t) => t.coef);
    if (!balanced(sides, coefs) || coefs.reduce(gcd) !== 1) throw new Error(`Chemistry: unbalanced equation in data: ${text}`);
  }
}

function genBalancing(d, rng) {
  checkDifficulty(d);
  const text = rng.pick(EQUATIONS[d]);
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
    `Count the **${el}** atoms (${EL_NAME[el]}). The missing species ${pretty(terms[miss].f)} has ${k} ${el} atom${k === 1 ? "" : "s"}, ` +
    `so \`? × ${k}\` plus the other ${el} atoms on its side must equal the ${el} atoms on the other side.`;
  const lines = [
    step(`_${el}_other`, exprFor(other, null), `${otherTotal} atoms on the other side`),
    step(`_${el}_same`, exprFor(same, terms[miss]), `${sameKnown} atoms already on the same side`),
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
  const moles = Object.fromEntries(Object.entries(masses).map(([el, m]) => [el, m / A[el]]));
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
    const elLine = step(`_${el}_mass`, k === 1 ? `${A[el]}` : `${k}*${A[el]}`, `${num(k * A[el])} g of ${el} per mole`);
    const atoms = Object.values(counts).reduce((s, c) => s + c, 0);
    let prompt, exact, unit, intro, lines, candidates, values, o;
    if (kind === "percent") {
      o = { dp: 1, rounded: true };
      exact = (100 * k * A[el]) / M;
      unit = "%";
      values = { f, el };
      prompt = `What is the percentage by mass of ${EL_NAME[el]} (${el}) in ${what}? Use ${massNote([f])}. Give the answer in %.${roundNote(1)}`;
      intro = `Percentage by mass = (mass of ${el} in one formula unit ÷ molar mass) × 100.`;
      // Atomic masses as their own rows, so the calculator can start from them.
      const els = Object.keys(counts);
      const term = (e2) => (counts[e2] === 1 ? `_A_${e2}` : `${counts[e2]}*_A_${e2}`);
      lines = [
        ...els.map((e2) => given(`_A_${e2}`, A[e2])),
        step("_M", els.map(term).join(" + "), `${num(M)} g/mol`),
        step(`_${el}_mass`, term(el), `${num(k * A[el])} g of ${el} per mole`),
        step("_pct", `_${el}_mass / _M * 100`, final(exact, o, unit)),
      ];
      candidates = [(100 * A[el]) / M, (100 * k) / atoms, 100 - exact, (100 * k * A[el]) / (M - k * A[el])];
    } else if (kind === "mass-el") {
      const m = rng.int(10, 500) / 10;
      o = { dp: 2, rounded: true };
      exact = (m * k * A[el]) / M;
      unit = "g";
      values = { f, el, m };
      prompt = `What mass of ${EL_NAME[el]} (${el}) is contained in ${num(m)} g of ${what}, in g? Use ${massNote([f])}.${roundNote(2)}`;
      intro = `The fraction of the mass that is ${el} is (mass of ${el} per formula unit) ÷ (molar mass). Multiply the sample mass by that fraction.`;
      lines = [given("_mass", m, "g"), Mline, elLine, step(`_m_${el}`, `_mass * _${el}_mass / _M`, final(exact, o, unit))];
      candidates = [(m * A[el]) / M, m - exact, (m * M) / (k * A[el]), (m * k) / atoms];
    } else {
      const mel = rng.int(10, 300) / 10;
      o = { dp: 2, rounded: true };
      exact = (mel * M) / (k * A[el]);
      unit = "g";
      values = { f, el, mel };
      prompt = `What mass of ${what} contains exactly ${num(mel)} g of ${EL_NAME[el]} (${el}), in g? Use ${massNote([f])}.${roundNote(2)}`;
      intro = `Only part of each formula unit's mass is ${el}. Divide the mass of ${el} by that fraction (mass of ${el} per formula unit ÷ molar mass).`;
      lines = [given(`_m_${el}`, mel, "g"), Mline, elLine, step("_mass", `_m_${el} * _M / _${el}_mass`, final(exact, o, unit))];
      candidates = [(mel * k * A[el]) / M, (mel * M) / A[el], mel + M, (mel * M) / (k * A[el] * 10)];
    }
    const base = { prompt, explanation: explain(intro, lines), params: { kind: `comp-${kind}`, values } };
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
      askNumber: (el) => `How many ${EL_NAME[el]} atoms (${el}) are in one molecule?`,
    };
    const formulaCands = [mult(n + 1), ce, mult(n * 2), mult(n + 2), Object.fromEntries(order.map((el, i) => [el, cm[order[(i + 1) % order.length]]]))];
    const numberCands = [ce[askEl], n, cm[askEl] + n, cm[askEl] * 2, Math.round(Mm / A[askEl])];
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
    data = Object.fromEntries(order.map((el) => [el, roundTo((sample * ce[el] * A[el]) / Me, 2)]));
    prompt =
      `A sample of a compound contains ${order.map((el) => `${num(data[el])} g of ${EL_NAME[el]} (${el})`).join(", ").replace(/, ([^,]*)$/, " and $1")} and nothing else. ` +
      `Use ${massNote([emp])}.`;
  } else {
    const pct = order.map((el) => roundTo((100 * ce[el] * A[el]) / Me, 1));
    pct[pct.length - 1] = roundTo(100 - pct.slice(0, -1).reduce((s, p) => s + p, 0), 1);
    data = Object.fromEntries(order.map((el, i) => [el, pct[i]]));
    prompt =
      `A compound contains, by mass, ${order.map((el) => `${num(data[el])}% ${EL_NAME[el]} (${el})`).join(", ").replace(/, ([^,]*)$/, " and $1")}. ` +
      `Use ${massNote([emp])}.`;
  }
  if (Object.values(data).some((v) => !(v > 0))) return null;
  // The rounded data must still lead cleanly to the intended formula.
  const sr = simplestRatio(data);
  if (!sr || !order.every((el) => sr.counts[el] === ce[el] && Math.abs(sr.ratio[el] * sr.k - ce[el]) < 0.05)) return null;

  const unitWord = useMass ? "g" : "% (treat as grams in 100 g)";
  const lines = [];
  const dl = (el) => `${useMass ? "_g_" : "_pct_"}${el}`;
  order.forEach((el) => lines.push(given(dl(el), data[el], useMass ? "g" : "%")));
  order.forEach((el) => lines.push(step(`_n_${el}`, `${dl(el)} / ${A[el]}`, `${num4(data[el] / A[el])} mol`)));
  const minEl = order.reduce((a, b) => (data[a] / A[a] <= data[b] / A[b] ? a : b));
  order.forEach((el) => lines.push(step(`_r_${el}`, `_n_${el} / _n_${minEl}`, num4(sr.ratio[el]))));
  const intro =
    `Divide each ${useMass ? "mass" : "percentage"} by its atomic mass to get moles (${unitWord}), then divide by the smallest number of moles. ` +
    (sr.k > 1 ? `The ratios are not all whole numbers, so multiply them all by ${sr.k}.` : "The ratios are already whole numbers.");
  const outro = `Simplest whole-number ratio ${order.map((el) => `${el} ${ce[el]}`).join(" : ")}, so the empirical formula is ${formulaOf(order, ce)}.`;
  const askEl = rng.pick(order);
  const base = {
    prompt,
    explanation: explain(intro, lines, outro),
    params: { kind: "comp-empirical", values: { data, order } },
    askNumber: (el) => `What is the subscript of ${el} in the empirical formula? (Write 1 if ${el} has no subscript.)`,
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

export function generate({ subtopic, difficulty, rng }) {
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

const Mof = (f) => molarMass(parseFormula(f));
const kOf = (f, el) => parseFormula(f)[el] || 0;

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
  "comp-percent": (v, x) => (x * Mof(v.f)) / 100 - kOf(v.f, v.el) * A[v.el],
  "comp-mass-el": (v, x) => x * Mof(v.f) - v.m * kOf(v.f, v.el) * A[v.el],
  "comp-mass-compound": (v, x) => x * kOf(v.f, v.el) * A[v.el] - v.mel * Mof(v.f),
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
    const ce = parseFormula(p.values.emp);
    const n = p.values.Mm / molarMass(ce);
    if (!Number.isInteger(Math.round(n)) || Math.abs(n - Math.round(n)) > 1e-9) return false;
    target = Object.fromEntries(Object.entries(ce).map(([el, c]) => [el, c * Math.round(n)]));
  }
  if (!target) return false;
  if (p.ask === "formula") {
    let c;
    try {
      c = parseFormula(String(raw));
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
