// Shared chemistry reference: elements, formulas and mole maths (knowledge only).
// Pure ES module: no DOM, no rng, no eval. Generators pass their drawn values in.
//
// DATA (frozen)
//   ELEMENTS             [{ Z, symbol, name, mass }] for Z = 1..100. `mass` is the rounded relative
//                        atomic mass printed on school data sheets (H 1, C 12, Cl 35.5, Cu 63.5 ...),
//                        or null for elements no module needs a mass for. Names use British spelling
//                        (aluminium, sulfur, caesium), all lower case.
//   Settings are NOT here: each module picks and states its own R, molar volume, Avogadro value,
//   rounding and element subset (e.g. role-chemist uses Cu = 64 in its oxide prompts, the table has 63.5).
//
// LOOKUPS      bySymbol(sym), byZ(Z), symbolOf(Z), nameOf(Z), elementName(sym), ar(sym)
//              ar() throws for a symbol with no mass.
//
// BUILD helpers (used by generate)
//   parseFormula(text)      "Al2(SO4)3" or "H₂O" -> { Al: 2, S: 3, O: 12 } (order of first appearance).
//                           Recursive-descent over parentheses. Throws on bad text.
//   formulaMass(f)          molar mass in g/mol of a formula string or a counts object.
//   massList(formulas)      "H = 1, S = 32, O = 16": masses for the elements the formulas need.
//   massExpr(f)             calculator expression "2*1 + 32 + 4*16".
//   prettyFormula(f)        "H2SO4" -> "H₂SO₄".
//   moles(m, M)  massOf(n, M)   n = m / M and m = n M.
//
// Checks (verify) are written in each module; they may call the facts above (ar, byZ ...).

const NAMES =
  "hydrogen helium lithium beryllium boron carbon nitrogen oxygen fluorine neon sodium magnesium aluminium silicon phosphorus sulfur " +
  "chlorine argon potassium calcium scandium titanium vanadium chromium manganese iron cobalt nickel copper zinc gallium germanium " +
  "arsenic selenium bromine krypton rubidium strontium yttrium zirconium niobium molybdenum technetium ruthenium rhodium palladium " +
  "silver cadmium indium tin antimony tellurium iodine xenon caesium barium lanthanum cerium praseodymium neodymium promethium " +
  "samarium europium gadolinium terbium dysprosium holmium erbium thulium ytterbium lutetium hafnium tantalum tungsten rhenium " +
  "osmium iridium platinum gold mercury thallium lead bismuth polonium astatine radon francium radium actinium thorium " +
  "protactinium uranium neptunium plutonium americium curium berkelium californium einsteinium fermium";
const SYMBOLS =
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr " +
  "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl " +
  "Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm";

// Rounded relative atomic masses (the values used in most school data sheets).
const MASSES = { H: 1, C: 12, N: 14, O: 16, Na: 23, Mg: 24, Al: 27, P: 31, S: 32, Cl: 35.5, K: 39, Ca: 40, Mn: 55, Fe: 56, Cu: 63.5, Zn: 65, Ag: 108 };

const nameList = NAMES.split(" ");
const symList = SYMBOLS.split(" ");
if (nameList.length !== symList.length) throw new Error("chem.js: element tables differ in length");

export const ELEMENTS = Object.freeze(
  symList.map((symbol, i) => Object.freeze({ Z: i + 1, symbol, name: nameList[i], mass: symbol in MASSES ? MASSES[symbol] : null }))
);

const SYM_MAP = new Map(ELEMENTS.map((e) => [e.symbol, e]));

export const bySymbol = (sym) => SYM_MAP.get(sym);
export const byZ = (Z) => ELEMENTS[Z - 1];
export const symbolOf = (Z) => (ELEMENTS[Z - 1] ? ELEMENTS[Z - 1].symbol : undefined);
export const nameOf = (Z) => (ELEMENTS[Z - 1] ? ELEMENTS[Z - 1].name : undefined);
export const elementName = (sym) => (SYM_MAP.has(sym) ? SYM_MAP.get(sym).name : undefined);
export function ar(sym) {
  const e = SYM_MAP.get(sym);
  if (!e || e.mass === null) throw new Error(`chem.js: no atomic mass for ${sym}`);
  return e.mass;
}

// ---------------------------------------------------------------------------------------------
// Build helpers

const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const unsub = (text) => String(text).replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));

export function parseFormula(text) {
  const f = unsub(text);
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
        if (!m || !SYM_MAP.has(m[0]) || SYM_MAP.get(m[0]).mass === null) throw new Error(`Bad formula: ${text}`);
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

export function formulaMass(f) {
  const counts = typeof f === "string" ? parseFormula(f) : f;
  return Object.entries(counts).reduce((s, [el, c]) => s + c * ar(el), 0);
}

export function massList(formulas) {
  const els = [];
  for (const f of formulas) for (const el of Object.keys(parseFormula(f))) if (!els.includes(el)) els.push(el);
  return els.map((el) => `${el} = ${ar(el)}`).join(", ");
}

export function massExpr(f) {
  return Object.entries(parseFormula(f))
    .map(([el, c]) => (c === 1 ? `${ar(el)}` : `${c}*${ar(el)}`))
    .join(" + ");
}

export const prettyFormula = (f) => String(f).replace(/\d/g, (d) => SUB_DIGITS[d]);

export const moles = (m, M) => m / M;
export const massOf = (n, M) => n * M;
