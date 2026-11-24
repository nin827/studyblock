// Unit conversion generator: length, mass/volume, time/speed, temperature.
// Uses only the seeded rng passed in by the engine.
// Each question's params.fmt says how the answer is given:
//   "exact"  the conversion comes out exactly (at most 3-4 decimals), tolerance 0
//   "2dp"    rounded to 2 decimals, tolerance 0.005
// Non-metric factors are always stated in the prompt (1 in = 2.54 cm, 1 ft = 12 in, 1 mile = 1.609 km).
// Explanations list every step as a labelled calculator row, e.g. `_m = _km * 1000` → 3500.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Strip binary noise (0.07 * 1000 = 70.00000000000001) without changing a real value; never "-0".
function clean(n) {
  const r = Number(n.toFixed(6));
  return Object.is(r, -0) ? 0 : r;
}
const show = (n) => String(clean(n));

function fmtAns(n, fmt) {
  if (fmt !== "2dp") return show(n);
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

const EXACT = " Give the exact answer.";
const DP2 = " Round to 2 decimal places.";

// Unit table. `base` converts to the base unit of its dimension (m, g, mL, s, m/s);
// temperatures go through kelvin in toBase(). Used by verify() as an independent route.
const U = {
  mm: { name: "mm", v: "_mm", base: 0.001 },
  cm: { name: "cm", v: "_cm", base: 0.01 },
  m: { name: "m", v: "_m", base: 1 },
  km: { name: "km", v: "_km", base: 1000 },
  in: { name: "in", v: "_in", base: 0.0254 },
  ft: { name: "ft", v: "_ft", base: 0.3048 },
  mi: { name: "miles", v: "_mi", base: 1609 },
  g: { name: "g", v: "_g", base: 1 },
  kg: { name: "kg", v: "_kg", base: 1000 },
  t: { name: "tonnes", v: "_t", base: 1e6 },
  mL: { name: "mL", v: "_mL", base: 1 },
  L: { name: "L", v: "_L", base: 1000 },
  cm3: { name: "cm³", v: "_cm3", base: 1 },
  m3: { name: "m³", v: "_m3", base: 1e6 },
  s: { name: "s", v: "_s", base: 1 },
  min: { name: "min", v: "_min", base: 60 },
  h: { name: "h", v: "_h", base: 3600 },
  ms: { name: "m/s", v: "_m_s", base: 1 },
  kmh: { name: "km/h", v: "_km_h", base: 1 / 3.6 },
  C: { name: "°C", v: "_C", temp: true },
  F: { name: "°F", v: "_F", temp: true },
  K: { name: "K", v: "_K", temp: true },
};

function toBase(x, u) {
  if (u === "C") return x + 273.15;
  if (u === "F") return ((x - 32) * 5) / 9 + 273.15;
  if (u === "K") return x;
  return x * U[u].base;
}
const slope = (u) => (u === "F" ? 5 / 9 : U[u].temp ? 1 : U[u].base);

// Chain steps: each turns the previous row into a new unit.
const mul = (to, k) => ({ to, expr: (fv) => `${fv} * ${k}`, fn: (x) => x * k });
const div = (to, k) => ({ to, expr: (fv) => `${fv} / ${k}`, fn: (x) => x / k });
const same = (to) => ({ to, expr: (fv) => fv, fn: (x) => x });
const C2F = { to: "F", expr: (fv) => `${fv} * 9 / 5 + 32`, fn: (x) => (x * 9) / 5 + 32 };
const F2C = { to: "C", expr: (fv) => `(${fv} - 32) * 5 / 9`, fn: (x) => ((x - 32) * 5) / 9 };
const C2K = { to: "K", expr: (fv) => `${fv} + 273.15`, fn: (x) => x + 273.15 };
const K2C = { to: "C", expr: (fv) => `${fv} - 273.15`, fn: (x) => x - 273.15 };

const given = (label, v) => `- \`${label} = ${show(v)}\``;
const row = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;

// The value shown on the last row: "**3500 m**" or "2.4138, which rounds to **2.41 km**".
function final(exact, fmt, unit) {
  const shown = fmtAns(exact, fmt);
  if (fmt !== "2dp" || Math.abs(exact - Number(shown)) < 1e-9) return `**${shown} ${unit}**`;
  return `${show(Math.round(exact * 10000) / 10000)}, which rounds to **${shown} ${unit}**`;
}

// At most 4 decimals, so an "exact" distractor never looks oddly long.
const short = (v) => Math.abs(clean(v) * 10000 - Math.round(clean(v) * 10000)) < 1e-6;

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
function buildChoices(correct, candidates, fmt, rng) {
  const correctStr = fmtAns(correct, fmt);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (fmt !== "2dp" && !short(v)) return;
    if (Math.abs(v) > 1e9 || (correct !== 0 && v === 0)) return;
    const s = fmtAns(v, fmt);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  [correct * 10, correct / 10, correct * 100, correct / 100].forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

function finish(base, exact, fmt, candidates, rng) {
  const q = { ...base, tolerance: fmt === "2dp" ? 0.005 : 0 };
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, fmt, rng);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: fmt === "2dp" ? round2(exact) : clean(exact), answerType: "number", choices: undefined };
}

// A plain "convert value from one unit to another" question built from a chain of steps.
function convertQ(rng, { value, from, chain, fmt, prompt, intro, candidates }) {
  let cur = value;
  let fv = U[from].v;
  const lines = [given(fv, value)];
  chain.forEach((st, i) => {
    const next = st.fn(cur);
    const last = i === chain.length - 1;
    const unit = U[st.to].name;
    lines.push(row(U[st.to].v, st.expr(fv), last ? final(next, fmt, unit) : `${show(next)} ${unit}`));
    cur = next;
    fv = U[st.to].v;
  });
  const to = chain[chain.length - 1].to;
  const base = {
    prompt: (prompt.endsWith(".") ? prompt : `${prompt}.`) + (fmt === "2dp" ? DP2 : EXACT),
    explanation: `${intro}\n\n${lines.join("\n")}`,
    params: { kind: "convert", value, from, to, fmt },
  };
  return finish(base, cur, fmt, candidates, rng);
}

// No closing full stop: convertQ() adds it, so a factor note "(1 in = 2.54 cm)" can sit inside the sentence.
const conv = (value, from, to) => `Convert ${show(value)} ${U[from].name} to ${U[to].name}`;

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// Value with 0, 1 or 2 decimals: int(lo..hi) / 10^d.
const dec = (rng, lo, hi, d) => rng.int(lo, hi) / 10 ** d;

// ---------------------------------------------------------------------------------------------
// Length

function genLength(difficulty, rng) {
  checkDifficulty(difficulty);
  if (difficulty === "easy") {
    const [small, big, k] = rng.pick([["mm", "cm", 10], ["cm", "m", 100], ["m", "km", 1000]]);
    if (rng.next() < 0.5) {
      const value = dec(rng, 11, 999, rng.int(0, 1));
      return convertQ(rng, {
        value, from: big, chain: [mul(small, k)], fmt: "exact",
        prompt: conv(value, big, small),
        intro: `1 ${big} = ${k} ${small}. Going to a smaller unit gives a bigger number, so multiply by ${k}.`,
        candidates: [value / k, value * k * 10, value * k / 10, value],
      });
    }
    const value = rng.int(5, 2500);
    return convertQ(rng, {
      value, from: small, chain: [div(big, k)], fmt: "exact",
      prompt: conv(value, small, big),
      intro: `1 ${big} = ${k} ${small}. Going to a bigger unit gives a smaller number, so divide by ${k}.`,
      candidates: [value * k, (value / k) * 10, value / k / 10, value],
    });
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["mm-m", "m-mm", "cm-km", "km-cm", "in-cm", "cm-in", "ft-in", "in-ft"]);
    const IN = " (1 in = 2.54 cm)";
    const FT = " (1 ft = 12 in)";
    if (kind === "mm-m") {
      const value = rng.int(5, 25000);
      return convertQ(rng, { value, from: "mm", chain: [div("m", 1000)], fmt: "exact", prompt: conv(value, "mm", "m"),
        intro: "1 m = 1000 mm, so divide by 1000.", candidates: [value / 100, value / 10, value * 1000] });
    }
    if (kind === "m-mm") {
      const value = dec(rng, 1, 999, rng.int(0, 2));
      return convertQ(rng, { value, from: "m", chain: [mul("mm", 1000)], fmt: "exact", prompt: conv(value, "m", "mm"),
        intro: "1 m = 1000 mm, so multiply by 1000.", candidates: [value * 100, value * 10, value / 1000] });
    }
    if (kind === "cm-km") {
      const value = 100 * rng.int(5, 9999);
      return convertQ(rng, { value, from: "cm", chain: [div("m", 100), div("km", 1000)], fmt: "exact", prompt: conv(value, "cm", "km"),
        intro: "Go via metres: 100 cm = 1 m and 1000 m = 1 km, so divide by 100 and then by 1000.",
        candidates: [value / 1000, value / 10000, value / 1000000] });
    }
    if (kind === "km-cm") {
      const value = dec(rng, 1, 999, rng.int(1, 2));
      return convertQ(rng, { value, from: "km", chain: [mul("m", 1000), mul("cm", 100)], fmt: "exact", prompt: conv(value, "km", "cm"),
        intro: "Go via metres: 1 km = 1000 m and 1 m = 100 cm, so multiply by 1000 and then by 100.",
        candidates: [value * 1000, value * 10000, value * 1000000] });
    }
    if (kind === "in-cm") {
      const value = rng.int(2, 60) + rng.pick([0, 0, 0.5]);
      return convertQ(rng, { value, from: "in", chain: [mul("cm", 2.54)], fmt: "exact", prompt: conv(value, "in", "cm") + IN,
        intro: "Each inch is 2.54 cm, so multiply by 2.54.", candidates: [value / 2.54, value * 25.4, value * 2.5] });
    }
    if (kind === "cm-in") {
      const n = rng.int(2, 60);
      const value = clean(n * 2.54);
      return convertQ(rng, { value, from: "cm", chain: [div("in", 2.54)], fmt: "exact", prompt: conv(value, "cm", "in") + IN,
        intro: "Each inch is 2.54 cm, so divide by 2.54.", candidates: [value * 2.54, n * 10, n + 2, n * 2] });
    }
    if (kind === "ft-in") {
      const value = rng.int(2, 20) + rng.pick([0, 0, 0.5, 0.25]);
      return convertQ(rng, { value, from: "ft", chain: [mul("in", 12)], fmt: "exact", prompt: conv(value, "ft", "in") + FT,
        intro: "Each foot is 12 inches, so multiply by 12.", candidates: [value * 10, value / 12, value * 3] });
    }
    const value = 3 * rng.int(2, 80);
    return convertQ(rng, { value, from: "in", chain: [div("ft", 12)], fmt: "exact", prompt: conv(value, "in", "ft") + FT,
      intro: "Each foot is 12 inches, so divide by 12.", candidates: [value * 12, value / 10, value / 3] });
  }

  const kind = rng.pick(["mi-km", "km-mi", "ft-m", "m-ft"]);
  if (kind === "mi-km") {
    const value = dec(rng, 15, 5000, rng.int(0, 1));
    return convertQ(rng, { value, from: "mi", chain: [mul("km", 1.609)], fmt: "2dp", prompt: conv(value, "mi", "km") + " (1 mile = 1.609 km)",
      intro: "Each mile is 1.609 km, so multiply by 1.609.", candidates: [value / 1.609, value * 1.6, value * 1.609 * 10] });
  }
  if (kind === "km-mi") {
    const value = dec(rng, 5, 2000, rng.int(0, 1));
    return convertQ(rng, { value, from: "km", chain: [div("mi", 1.609)], fmt: "2dp", prompt: conv(value, "km", "mi") + " (1 mile = 1.609 km)",
      intro: "Each mile is 1.609 km, so divide by 1.609.", candidates: [value * 1.609, value / 1.6, value * 0.6] });
  }
  if (kind === "ft-m") {
    const value = dec(rng, 15, 3000, 1);
    return convertQ(rng, { value, from: "ft", chain: [mul("in", 12), mul("cm", 2.54), div("m", 100)], fmt: "2dp",
      prompt: conv(value, "ft", "m") + " (1 ft = 12 in, 1 in = 2.54 cm)",
      intro: "Go feet → inches → centimetres → metres.",
      candidates: [value * 12 * 2.54, (value * 2.54) / 100, (value * 12) / 100, value / 3] });
  }
  const value = dec(rng, 10, 1000, 1);
  return convertQ(rng, { value, from: "m", chain: [mul("cm", 100), div("in", 2.54), div("ft", 12)], fmt: "2dp",
    prompt: conv(value, "m", "ft") + " (1 ft = 12 in, 1 in = 2.54 cm)",
    intro: "Go metres → centimetres → inches → feet.",
    candidates: [(value * 100) / 2.54, (value * 100 * 2.54) / 12, value * 3, (value * 100) / 12] });
}

// ---------------------------------------------------------------------------------------------
// Mass and volume

// A sum of mixed-unit quantities given in one target unit.
function sumQ(rng, { parts, labels, to, expr, fmt, prompt, intro, candidates }) {
  const exact = parts.reduce((s, [v, u]) => s + toBase(v, u), 0) / U[to].base;
  const lines = [...parts.map(([v], i) => given(labels[i], v)), row(`_total_${to}`, expr, final(exact, fmt, U[to].name))];
  const base = {
    prompt: prompt + (fmt === "2dp" ? DP2 : EXACT),
    explanation: `${intro}\n\n${lines.join("\n")}`,
    params: { kind: "sum", parts, to, fmt },
  };
  return finish(base, exact, fmt, candidates, rng);
}

function genMassVolume(difficulty, rng) {
  checkDifficulty(difficulty);
  if (difficulty === "easy") {
    const kind = rng.pick(["g-kg", "kg-g", "mL-L", "L-mL", "cm3-mL", "mL-cm3"]);
    if (kind === "g-kg" || kind === "mL-L") {
      const [from, to] = kind === "g-kg" ? ["g", "kg"] : ["mL", "L"];
      const value = rng.int(5, 9999);
      return convertQ(rng, { value, from, chain: [div(to, 1000)], fmt: "exact", prompt: conv(value, from, to),
        intro: `1 ${to} = 1000 ${from}, so divide by 1000.`, candidates: [value * 1000, value / 100, value / 10] });
    }
    if (kind === "kg-g" || kind === "L-mL") {
      const [from, to] = kind === "kg-g" ? ["kg", "g"] : ["L", "mL"];
      const value = dec(rng, 1, 999, rng.int(0, 2));
      return convertQ(rng, { value, from, chain: [mul(to, 1000)], fmt: "exact", prompt: conv(value, from, to),
        intro: `1 ${from} = 1000 ${to}, so multiply by 1000.`, candidates: [value / 1000, value * 100, value * 10] });
    }
    const [from, to] = kind === "cm3-mL" ? ["cm3", "mL"] : ["mL", "cm3"];
    const value = rng.int(2, 2000);
    return convertQ(rng, { value, from, chain: [same(to)], fmt: "exact", prompt: conv(value, from, to),
      intro: "1 cm³ is exactly 1 mL, so the number stays the same.", candidates: [value * 1000, value / 1000, value * 100] });
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["kg-t", "t-kg", "g-t", "L-cm3", "m3-L", "kg-g-sum", "L-mL-sum"]);
    if (kind === "kg-t") {
      const value = rng.int(50, 25000);
      return convertQ(rng, { value, from: "kg", chain: [div("t", 1000)], fmt: "exact", prompt: conv(value, "kg", "t"),
        intro: "1 tonne = 1000 kg, so divide by 1000.", candidates: [value * 1000, value / 100, value / 1000000] });
    }
    if (kind === "t-kg") {
      const value = dec(rng, 1, 999, rng.int(0, 2));
      return convertQ(rng, { value, from: "t", chain: [mul("kg", 1000)], fmt: "exact", prompt: conv(value, "t", "kg"),
        intro: "1 tonne = 1000 kg, so multiply by 1000.", candidates: [value / 1000, value * 100, value * 1000000] });
    }
    if (kind === "g-t") {
      const value = 1000 * rng.int(5, 9999);
      return convertQ(rng, { value, from: "g", chain: [div("kg", 1000), div("t", 1000)], fmt: "exact", prompt: conv(value, "g", "t"),
        intro: "Go via kilograms: divide by 1000 to get kg, then by 1000 again to get tonnes.",
        candidates: [value / 1000, value / 100000, value / 10000] });
    }
    if (kind === "L-cm3") {
      const value = dec(rng, 1, 999, rng.int(0, 2));
      return convertQ(rng, { value, from: "L", chain: [mul("mL", 1000), same("cm3")], fmt: "exact", prompt: conv(value, "L", "cm3"),
        intro: "1 L = 1000 mL, and 1 mL is exactly 1 cm³.", candidates: [value / 1000, value * 100, value * 1000000] });
    }
    if (kind === "m3-L") {
      const value = dec(rng, 1, 999, rng.int(0, 2));
      return convertQ(rng, { value, from: "m3", chain: [mul("L", 1000)], fmt: "exact", prompt: conv(value, "m3", "L"),
        intro: "A cube 1 m on each side holds exactly 1000 L, so multiply by 1000.",
        candidates: [value * 1000000, value * 100, value / 1000] });
    }
    if (kind === "kg-g-sum") {
      const kg = rng.int(1, 9);
      const g = rng.int(5, 995);
      return sumQ(rng, { parts: [[kg, "kg"], [g, "g"]], labels: ["_kg", "_g"], to: "g", expr: "_kg * 1000 + _g", fmt: "exact",
        prompt: `How many grams is ${kg} kg ${g} g?`,
        intro: "Turn the kilograms into grams (× 1000), then add the grams.",
        candidates: [kg * 100 + g, kg + g, kg * 1000, kg * 1000 + g * 10] });
    }
    const L = rng.int(1, 9);
    const mL = rng.int(5, 995);
    return sumQ(rng, { parts: [[L, "L"], [mL, "mL"]], labels: ["_L", "_mL"], to: "mL", expr: "_L * 1000 + _mL", fmt: "exact",
      prompt: `How many millilitres is ${L} L ${mL} mL?`,
      intro: "Turn the litres into millilitres (× 1000), then add the millilitres.",
      candidates: [L * 100 + mL, L + mL, L * 1000, L * 1000 + mL * 10] });
  }

  const kind = rng.pick(["sum-mass", "sum-vol", "g-t"]);
  if (kind === "sum-mass") {
    const kg = dec(rng, 105, 2500, 2);
    const g1 = rng.int(15, 950);
    const g2 = rng.int(15, 950);
    return sumQ(rng, { parts: [[kg, "kg"], [g1, "g"], [g2, "g"]], labels: ["_kg", "_g1", "_g2"], to: "kg",
      expr: "_kg + (_g1 + _g2) / 1000", fmt: "2dp",
      prompt: `A parcel holds three items weighing ${show(kg)} kg, ${g1} g and ${g2} g. What is their total mass, in kg?`,
      intro: "Put everything in kilograms first (grams ÷ 1000), then add.",
      candidates: [kg + g1 + g2, kg * 1000 + g1 + g2, kg + (g1 + g2) / 100] });
  }
  if (kind === "sum-vol") {
    const L = dec(rng, 25, 300, 2);
    const mL = rng.int(15, 950);
    const cm3 = rng.int(15, 950);
    return sumQ(rng, { parts: [[L, "L"], [mL, "mL"], [cm3, "cm3"]], labels: ["_L", "_mL", "_cm3"], to: "L",
      expr: "_L + (_mL + _cm3) / 1000", fmt: "2dp",
      prompt: `A jug holds ${show(L)} L of water. You add ${mL} mL of juice and ${cm3} cm³ of syrup. What is the total volume, in L?`,
      intro: "1 cm³ = 1 mL, so add the millilitres together, divide by 1000 to get litres, then add the litres.",
      candidates: [L + mL + cm3, L * 1000 + mL + cm3, L + mL / 1000, L + (mL + cm3) / 100] });
  }
  const value = rng.int(10000, 9999999);
  return convertQ(rng, { value, from: "g", chain: [div("kg", 1000), div("t", 1000)], fmt: "2dp", prompt: conv(value, "g", "t"),
    intro: "Go via kilograms: divide by 1000 to get kg, then by 1000 again to get tonnes.",
    candidates: [value / 1000, value / 100000, value / 10000000] });
}

// ---------------------------------------------------------------------------------------------
// Time and speed

function genTimeSpeed(difficulty, rng) {
  checkDifficulty(difficulty);
  if (difficulty === "easy") {
    const kind = rng.pick(["h-min", "min-s", "min-h", "s-min"]);
    if (kind === "h-min" || kind === "min-s") {
      const [from, to] = kind === "h-min" ? ["h", "min"] : ["min", "s"];
      const value = rng.int(1, 12) + rng.pick([0, 0, 0.5, 0.25]);
      const big = kind === "h-min" ? "hour" : "minute";
      return convertQ(rng, { value, from, chain: [mul(to, 60)], fmt: "exact", prompt: conv(value, from, to),
        intro: `There are 60 ${U[to].name} in 1 ${big}, so multiply by 60.`, candidates: [value * 100, value / 60, value * 3600, value * 6] });
    }
    const [from, to] = kind === "min-h" ? ["min", "h"] : ["s", "min"];
    const value = (kind === "min-h" ? 15 : 30) * rng.int(1, 30);
    const big = kind === "min-h" ? "hour" : "minute";
    return convertQ(rng, { value, from, chain: [div(to, 60)], fmt: "exact", prompt: conv(value, from, to),
      intro: `There are 60 ${U[from].name} in 1 ${big}, so divide by 60.`, candidates: [value / 100, value * 60, value / 3600, value / 6] });
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["kmh-ms", "ms-kmh", "hmin-min", "h-s"]);
    if (kind === "kmh-ms") {
      const n = rng.int(1, 40);
      const value = clean(n * 3.6);
      return convertQ(rng, { value, from: "kmh", chain: [{ to: "ms", expr: (fv) => `${fv} * 1000 / 3600`, fn: (x) => (x * 1000) / 3600 }],
        fmt: "exact", prompt: conv(value, "kmh", "ms"),
        intro: "1 km/h is 1000 m in 3600 s, so multiply by 1000 and divide by 3600 (the same as dividing by 3.6).",
        candidates: [value * 3.6, value / 60, n * 10, n + 2] });
    }
    if (kind === "ms-kmh") {
      const value = rng.int(2, 40);
      return convertQ(rng, { value, from: "ms", chain: [{ to: "kmh", expr: (fv) => `${fv} * 3600 / 1000`, fn: (x) => (x * 3600) / 1000 }],
        fmt: "exact", prompt: conv(value, "ms", "kmh"),
        intro: "In one hour (3600 s) you cover 3600 times as many metres; divide by 1000 to get km. That is the same as multiplying by 3.6.",
        candidates: [value / 3.6, value * 60, value * 3600, value * 36] });
    }
    if (kind === "hmin-min") {
      const h = rng.int(1, 9);
      const m = rng.int(1, 59);
      return sumQ(rng, { parts: [[h, "h"], [m, "min"]], labels: ["_h", "_min"], to: "min", expr: "_h * 60 + _min", fmt: "exact",
        prompt: `How many minutes are there in ${h} h ${m} min?`,
        intro: "Turn the hours into minutes (× 60), then add the minutes.",
        candidates: [h * 100 + m, h + m, h * 60, h * 60 - m] });
    }
    const value = rng.int(1, 10) + rng.pick([0, 0, 0.5]);
    return convertQ(rng, { value, from: "h", chain: [mul("min", 60), mul("s", 60)], fmt: "exact", prompt: conv(value, "h", "s"),
      intro: "1 h = 60 min and 1 min = 60 s, so multiply by 60 twice (× 3600).", candidates: [value * 60, value * 360, value * 600] });
  }

  const kind = rng.pick(["kmh-ms", "s-h", "rate-kmh", "rate-ms"]);
  if (kind === "kmh-ms") {
    const value = dec(rng, 100, 3000, 1);
    return convertQ(rng, { value, from: "kmh", chain: [{ to: "ms", expr: (fv) => `${fv} * 1000 / 3600`, fn: (x) => (x * 1000) / 3600 }],
      fmt: "2dp", prompt: conv(value, "kmh", "ms"),
      intro: "1 km/h is 1000 m in 3600 s, so multiply by 1000 and divide by 3600 (the same as dividing by 3.6).",
      candidates: [value * 3.6, value / 60, value / 36] });
  }
  if (kind === "s-h") {
    const value = rng.int(1000, 40000);
    return convertQ(rng, { value, from: "s", chain: [div("min", 60), div("h", 60)], fmt: "2dp", prompt: conv(value, "s", "h"),
      intro: "Divide by 60 to get minutes, then by 60 again to get hours (÷ 3600 in total).",
      candidates: [value / 60, value / 100 / 60, value / 360] });
  }
  if (kind === "rate-kmh") {
    const km = dec(rng, 20, 4000, 1);
    const mins = rng.int(5, 180);
    const h = mins / 60;
    const exact = km / h;
    const fmt = "2dp";
    const lines = [given("_km", km), given("_min", mins), row("_h", "_min / 60", `${show(Math.round(h * 10000) / 10000)} h`), row("_km_h", "_km / _h", final(exact, fmt, "km/h"))];
    const base = {
      prompt: `A train travels ${show(km)} km in ${mins} minutes at a steady speed. What is its speed, in km/h?${DP2}`,
      explanation: `Speed = distance ÷ time, with the time in hours.\n\n${lines.join("\n")}`,
      params: { kind: "rate", dist: [km, "km"], time: [mins, "min"], to: "kmh", fmt },
    };
    return finish(base, exact, fmt, [km / mins, (km * mins) / 60, km / (mins / 100)], rng);
  }
  const m = rng.int(100, 10000);
  const s = rng.int(10, 2000);
  const exact = (m / s) * 3.6;
  const fmt = "2dp";
  const lines = [given("_m", m), given("_s", s), row("_m_s", "_m / _s", `${show(Math.round((m / s) * 10000) / 10000)} m/s`), row("_km_h", "_m_s * 3.6", final(exact, fmt, "km/h"))];
  const base = {
    prompt: `A runner covers ${m} m in ${s} seconds at a steady pace. What is the runner's speed, in km/h?${DP2}`,
    explanation: `Find the speed in m/s first, then convert: 1 m/s = 3.6 km/h.\n\n${lines.join("\n")}`,
    params: { kind: "rate", dist: [m, "m"], time: [s, "s"], to: "kmh", fmt },
  };
  return finish(base, exact, fmt, [m / s, m / s / 3.6, (m / s) * 60], rng);
}

// ---------------------------------------------------------------------------------------------
// Temperature

const KNOTE = " (0 °C = 273.15 K)";

function tempQ(rng, kind, value, fmt, withFormula) {
  const F_OF_C = ". Use °F = °C × 9/5 + 32.";
  const C_OF_F = ". Use °C = (°F − 32) × 5/9.";
  const K_OF_C = ". Use K = °C + 273.15.";
  const C_OF_K = ". Use °C = K − 273.15.";
  const spec = {
    "C-F": { from: "C", chain: [C2F], hint: withFormula ? F_OF_C : "", intro: "Multiply by 9/5, then add 32.",
      cand: (c) => [(c * 9) / 5, ((c + 32) * 9) / 5, (c * 5) / 9 + 32] },
    "F-C": { from: "F", chain: [F2C], hint: withFormula ? C_OF_F : "", intro: "Subtract 32 first, then multiply by 5/9.",
      cand: (f) => [f - 32, ((f - 32) * 9) / 5, (f * 5) / 9 - 32] },
    "C-K": { from: "C", chain: [C2K], hint: withFormula ? K_OF_C : KNOTE, intro: "A kelvin step is the same size as a degree Celsius; just add 273.15.",
      cand: (c) => [c - 273.15, c + 273, c + 373.15] },
    "K-C": { from: "K", chain: [K2C], hint: withFormula ? C_OF_K : KNOTE, intro: "A kelvin step is the same size as a degree Celsius; just subtract 273.15.",
      cand: (k) => [k + 273.15, k - 273, k - 373.15] },
    "F-K": { from: "F", chain: [F2C, C2K], hint: KNOTE, intro: "Go via Celsius: °C = (°F − 32) × 5/9, then K = °C + 273.15.",
      cand: (f) => [((f - 32) * 5) / 9, f + 273.15, ((f - 32) * 9) / 5 + 273.15] },
    "K-F": { from: "K", chain: [K2C, C2F], hint: KNOTE, intro: "Go via Celsius: °C = K − 273.15, then °F = °C × 9/5 + 32.",
      cand: (k) => [k - 273.15, (k * 9) / 5 + 32, ((k + 273.15) * 9) / 5 + 32] },
  }[kind];
  const to = spec.chain[spec.chain.length - 1].to;
  return convertQ(rng, { value, from: spec.from, chain: spec.chain, fmt, prompt: conv(value, spec.from, to) + spec.hint,
    intro: spec.intro, candidates: spec.cand(value) });
}

function genTemperature(difficulty, rng) {
  checkDifficulty(difficulty);
  if (difficulty === "easy" || difficulty === "medium") {
    const easy = difficulty === "easy";
    const kind = rng.pick(["C-F", "F-C", "C-K", "K-C"]);
    let value;
    if (kind === "C-F") value = 5 * (easy ? rng.int(-8, 20) : rng.int(-40, 60));
    else if (kind === "F-C") value = 32 + 9 * (easy ? rng.int(-6, 22) : rng.int(-20, 40));
    else if (kind === "C-K") value = easy ? rng.int(-50, 150) : dec(rng, -2000, 10000, 1);
    else value = rng.next() < 0.5 ? clean(rng.int(easy ? -50 : -270, easy ? 150 : 1000) + 273.15) : rng.int(easy ? 200 : 1, easy ? 450 : 1500);
    return tempQ(rng, kind, value, "exact", easy);
  }
  const kind = rng.pick(["F-K", "K-F", "C-F", "F-C"]);
  let value;
  if (kind === "F-K") value = dec(rng, -4000, 5000, 1);
  else if (kind === "K-F") value = dec(rng, 500, 6000, 1);
  else if (kind === "C-F") value = dec(rng, -400, 1000, 1);
  else value = dec(rng, -400, 2000, 1);
  return tempQ(rng, kind, value, "2dp", false);
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "length") return genLength(difficulty, rng);
  if (subtopic === "mass-volume") return genMassVolume(difficulty, rng);
  if (subtopic === "time-speed") return genTimeSpeed(difficulty, rng);
  if (subtopic === "temperature") return genTemperature(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: convert both the given quantity and the answer to the dimension's base unit
// (m, g, mL, s, m/s, K) with the unit table and compare. For rounded answers the allowed gap is
// 0.005 target units, scaled by how big one target unit is in the base unit.
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !U[p.to]) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;

  let want;
  if (p.kind === "convert") {
    if (!U[p.from]) return false;
    want = toBase(p.value, p.from);
  } else if (p.kind === "sum") {
    if (!Array.isArray(p.parts) || !p.parts.every(([, u]) => U[u])) return false;
    want = p.parts.reduce((s, [v, u]) => s + toBase(v, u), 0);
  } else if (p.kind === "rate") {
    const t = toBase(p.time[0], p.time[1]);
    if (!(t > 0)) return false;
    want = toBase(p.dist[0], p.dist[1]) / t;
  } else {
    return false;
  }
  const got = toBase(x, p.to);
  const residual = got - want;
  if (!Number.isFinite(residual)) return false;
  const noise = 1e-9 * Math.max(1, Math.abs(want));
  if (p.fmt === "2dp") return Math.abs(residual) <= 0.005 * slope(p.to) + noise;
  return Math.abs(residual) <= noise;
}
