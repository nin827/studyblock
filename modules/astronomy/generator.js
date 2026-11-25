// Astronomy generator. Uses only the seeded rng passed in by the engine.
// Every constant and every planet/star value a question needs is stated in its prompt, so nothing
// has to be remembered. Stated constants (rounded textbook values):
//   c = 3.00 × 10⁵ km/s, 1 AU = 1.50 × 10⁸ km, 1 ly = 9.46 × 10¹² km,
//   1 year = 3.16 × 10⁷ s, 1 day = 86 400 s, Sun diameter = 1 390 000 km.
// params: { kind, dp, rounded, ...stated values }. verify() substitutes the candidate answer back
// into the forward relation (distance = speed × time, T²·M = a³, θ·d = D, …) and checks the residual.

const C = 3e5; // km/s
const AU = 1.5e8; // km
const LY = 9.46e12; // km
const YEAR = 3.16e7; // s
const DAY = 86400; // s
const SUN_D = 1.39e6; // km
const EARTH_D = 12700; // km
const DEG = Math.PI / 180;

// ---------- formatting ----------

// Round half away from zero; the 1e-9 nudge absorbs binary error (2.525*100 = 252.4999...).
function round(n, dp = 0) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
const fix = (n, dp) => round(n, dp).toFixed(dp);

// Shortest form, up to 6 decimals; never "-0". Used in calculator-style expressions.
function num(n) {
  const r = Math.round(n * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
}

// Prose numbers with thousands grouped by (non-breaking) spaces: 150 000 000.
function big(n) {
  const [i, d] = num(n).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return d ? `${g}.${d}` : g;
}

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const pow10 = (e) => `10${String(e).split("").map((c) => SUP[c]).join("")}`;
// Standard form with a fixed number of decimals in the mantissa: "9.46 × 10¹²".
const sf = (m, e, dp = 2) => `${fix(m, dp)} × ${pow10(e)}`;

// Exponent n such that x / 10ⁿ rounds (to dp) into [1, 10).
function expOf(x, dp = 2) {
  let e = Math.floor(Math.log10(x));
  if (round(x / 10 ** e, dp) >= 10) e += 1;
  return e;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STEP = (dp) => 10 ** -dp;
const DP = (dp) => (dp === 0 ? " Round to the nearest whole number." : ` Round to ${dp} decimal place${dp === 1 ? "" : "s"}.`);
const THEN = (dp) => (dp === 0 ? " Then round to the nearest whole number." : ` Then round to ${dp} decimal place${dp === 1 ? "" : "s"}.`);

// Final line of a worked solution.
function resultLine(exact, dp, rounded, unit) {
  const u = unit ? ` ${unit}` : "";
  if (!rounded) return `= **${num(exact)}${u}**`;
  const shown = fix(exact, dp);
  if (Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${Number(exact.toPrecision(7))}${u}, which rounds to **${shown}${u}**`;
}

// 4 unique numeric choices: the answer plus 3 plausible slips (candidates), topped up with
// near misses (×1.1, ×0.9, ...). Positive answers never get zero or negative options.
function numChoices(exact, dp, rounded, candidates, rng) {
  const decimals = rounded ? dp : (String(num(exact)).split(".")[1] || "").length;
  const fmt = (v) => (rounded ? fix(v, dp) : num(round(v, decimals)));
  const correct = fmt(exact);
  const seen = new Set([correct]);
  const out = [];
  const add = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v <= 0) return;
    const ratio = v / exact;
    if (ratio > 1000 || ratio < 0.001) return;
    const s = fmt(v);
    if (Number(s) <= 0 || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(add);
  for (const f of [1.1, 0.9, 1.2, 0.8, 1.5, 0.5, 2, 3]) add(exact * f);
  for (let k = 1; out.length < 3 && k < 50; k++) add(exact + k * STEP(decimals));
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

// A solved single question -> typed number (65%) or multiple choice (35%).
// q: { prompt, exact, dp, rounded, unit, steps, hints, candidates, params, given }
function single(q, rng) {
  if (!Number.isFinite(q.exact) || q.exact <= 0) throw new Error("bad answer");
  const base = {
    prompt: q.prompt,
    tolerance: q.rounded ? 0.5 * STEP(q.dp) : 0,
    explanation: [...q.steps.slice(0, -1), `${q.steps[q.steps.length - 1]} ${resultLine(q.exact, q.dp, q.rounded, q.unit)}`].join("\n\n"),
    params: { ...q.params, dp: q.dp, rounded: q.rounded },
    hints: q.hints,
  };
  if (q.given && q.given.length) base.given = q.given;
  if (rng.next() < 0.35) {
    const { answer, choices } = numChoices(q.exact, q.dp, q.rounded, q.candidates || [], rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: q.rounded ? round(q.exact, q.dp) : q.exact, answerType: "number", choices: undefined };
}

// One numeric part of a multi-part question. spec carries what verify() rechecks.
function part(id, label, ask, exact, dp, hint, spec) {
  return {
    part: { id, label, ask, answerType: "number", answer: round(exact, dp), tolerance: 0.5 * STEP(dp), hint },
    spec: { id, ...spec, dp, rounded: true },
  };
}

function multi(prompt, list, explanation, given, hint) {
  const q = {
    prompt,
    hints: [hint],
    answerType: "multi",
    parts: list.map((p) => p.part),
    explanation,
    params: { multi: true, parts: list.map((p) => p.spec) },
  };
  if (given && given.length) q.given = given;
  return q;
}

const G = (label, value) => ({ label, value });

// ---------- data (rounded textbook values; always stated in the prompt) ----------

const PLANETS = [
  { name: "Mercury", au: 0.387, mkm: 58, diam: 4880 },
  { name: "Venus", au: 0.72, mkm: 108, diam: 12100 },
  { name: "Mars", au: 1.52, mkm: 228, diam: 6780 },
  { name: "Jupiter", au: 5.2, mkm: 778, diam: 140000 },
  { name: "Saturn", au: 9.54, mkm: 1430, diam: 116000 },
  { name: "Uranus", au: 19.2, mkm: 2870, diam: 50700 },
  { name: "Neptune", au: 30.1, mkm: 4500, diam: 49200 },
];
const STARS = [
  { name: "Proxima Centauri", ly: 4.24 },
  { name: "Barnard's Star", ly: 5.96 },
  { name: "Sirius", ly: 8.6 },
  { name: "Procyon", ly: 11.5 },
  { name: "Altair", ly: 16.7 },
  { name: "Fomalhaut", ly: 25.1 },
  { name: "Arcturus", ly: 36.7 },
  { name: "Aldebaran", ly: 65 },
];
const BODIES = ["an asteroid", "a comet", "a dwarf planet", "a minor planet", "an icy moonlet", "a space rock", "a trans-Neptunian object", "a centaur asteroid", "a rocky planetesimal", "a newly found comet"];
const SIGNALS = ["A radio signal", "A laser pulse", "A light flash", "A radar pulse", "A beam of light", "A message from a space probe"];
const PROBES = ["A space probe", "An uncrewed spacecraft", "A solar-sail probe", "A robotic explorer", "An ion-drive probe", "A deep-space probe"];
const EXO = ["Kepler-22b", "Gliese 667Cc", "Planet Tarsis", "Planet Orla", "Planet Vexa", "Planet Corvin", "Planet Ilda", "Planet Brann", "Planet Sela", "Planet Doran"];

// ======================================================================================
// Distances & light

function genDistances(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["lt-time", "lt-dist", "au-km", "km-au"]);
    if (kind === "lt-time" || kind === "lt-dist") {
      const t = rng.int(2, 40);
      const dist = C * t;
      const who = rng.pick(SIGNALS);
      if (kind === "lt-time") {
        return single({
          prompt: `Light (and radio) travels at 300 000 km/s. ${who} travels ${big(dist)} km through space. How many seconds does it take?`,
          exact: t, dp: 0, rounded: false, unit: "s",
          steps: ["Time = distance ÷ speed.", `\`t = ${num(dist)} / 300000\``],
          hints: ["Time = distance ÷ speed.", `Divide the distance by the speed: \`${num(dist)} / 300000\` (in the calculator: \`_d / _c\`).`],
          candidates: [t * 10, t * 60, dist / 3000],
          params: { kind, dist },
          given: [G("_d", dist), G("_c", C)],
        }, rng);
      }
      return single({
        prompt: `Light (and radio) travels at 300 000 km/s. ${who} travels for ${t} seconds. How far does it go, in km?`,
        exact: dist, dp: 0, rounded: false, unit: "km",
        steps: ["Distance = speed × time.", `\`d = 300000 × ${t}\``],
        hints: ["Distance = speed × time.", `Multiply: \`300000 × ${t}\` (in the calculator: \`_c * _t\`).`],
        candidates: [dist / 10, dist * 10, C / t],
        params: { kind, t },
        given: [G("_c", C), G("_t", t)],
      }, rng);
    }
    const k = rng.int(2, 80) / 2; // AU, whole or half
    const who = rng.pick(BODIES);
    if (kind === "au-km") {
      return single({
        prompt: `1 AU (astronomical unit) = 150 million km. ${cap(who)} is ${num(k)} AU from the Sun. How far is that, in millions of km?`,
        exact: 150 * k, dp: 0, rounded: false, unit: "million km",
        steps: ["Multiply the number of AU by 150 million km.", `\`${num(k)} × 150\``],
        hints: ["Each AU is 150 million km, so multiply.", `Work out \`${num(k)} × 150\` (in the calculator: \`_au * 150\`).`],
        candidates: [k / 150 * 1000, 15 * k, 1500 * k],
        params: { kind, k },
        given: [G("_au", k)],
      }, rng);
    }
    const mkm = 150 * k;
    return single({
      prompt: `1 AU (astronomical unit) = 150 million km. ${cap(who)} is ${num(mkm)} million km from the Sun. How far is that in AU? (It may be a decimal such as 2.5.)`,
      exact: k, dp: 1, rounded: false, unit: "AU",
      steps: ["Divide the distance in millions of km by 150.", `\`${num(mkm)} / 150\``],
      hints: ["Each AU is 150 million km, so divide by 150.", `Work out \`${num(mkm)} / 150\` (in the calculator: \`_mkm / 150\`).`],
      candidates: [k * 10, k / 10, mkm / 15],
      params: { kind, mkm },
      given: [G("_mkm", mkm)],
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["light-min", "ly-km", "km-au2"]);
    if (kind === "light-min") {
      let name, au;
      if (rng.next() < 0.35) ({ name, au } = rng.pick(PLANETS));
      else { name = rng.pick(BODIES); au = rng.int(15, 450) / 10; }
      const exact = (au * AU) / C / 60;
      return single({
        prompt: `Light travels at 3.00 × 10⁵ km/s and 1 AU = 1.50 × 10⁸ km. ${cap(name)} is ${num(au)} AU from the Sun. How many minutes does sunlight take to reach it?${DP(1)}`,
        exact, dp: 1, rounded: true, unit: "minutes",
        steps: [
          `Distance in km: \`_km = ${num(au)} × 1.5e8\` = ${big(au * AU)} km.`,
          `Time in seconds: \`_s = _km / 3e5\` = ${num(au * AU / C)} s.`,
          "Minutes: `_s / 60`",
        ],
        hints: [
          "Turn the distance into km first (multiply by 1.50 × 10⁸), then time = distance ÷ speed.",
          `In the calculator: \`_au * _AUkm / _c\` gives seconds; divide by 60 for minutes.${THEN(1)}`,
        ],
        candidates: [(au * AU) / C, (au * AU) / C / 3600, (au * AU) / C / 6],
        params: { kind, au },
        given: [G("_au", au), G("_AUkm", AU), G("_c", C)],
      }, rng);
    }
    if (kind === "ly-km") {
      let name, ly;
      if (rng.next() < 0.4) ({ name, ly } = rng.pick(STARS));
      else { name = `a star`; ly = rng.int(15, 999) / 10; }
      const km = ly * LY;
      const n = expOf(km);
      const exact = km / 10 ** n;
      return single({
        prompt: `1 light-year (ly) = 9.46 × 10¹² km. ${cap(name)} is ${num(ly)} ly away. How far is that in km? Give it as A × ${pow10(n)} km and type A.${DP(2)}`,
        exact, dp: 2, rounded: true, unit: `× ${pow10(n)} km`,
        steps: [
          `Multiply: \`${num(ly)} × 9.46e12\` = ${Number(km.toPrecision(6)).toExponential(4).replace("e+", " × 10^")} km.`,
          `Write it with ${pow10(n)}: divide by 10^${n}.`,
        ],
        hints: [
          "Multiply the number of light-years by 9.46 × 10¹² km.",
          `In the calculator: \`_ly * _LYkm / 10^${n}\` gives A directly.${THEN(2)}`,
        ],
        candidates: [exact * 10, exact / 10, (ly / 9.46) * 10 ** (12 - n)],
        params: { kind, ly, n },
        given: [G("_ly", ly), G("_LYkm", LY)],
      }, rng);
    }
    const m = rng.int(11, 99) / 10;
    const e = rng.pick([8, 9]);
    const km = m * 10 ** e;
    const who = rng.pick(BODIES);
    const exact = km / AU;
    return single({
      prompt: `1 AU = 1.50 × 10⁸ km. ${cap(who)} is ${fix(m, 1)} × ${pow10(e)} km from the Sun. How far is that in AU?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "AU",
      steps: ["Divide the distance by the length of 1 AU.", `\`${fix(m, 1)}e${e} / 1.5e8\``],
      hints: [
        "To change km into AU, divide by 1.50 × 10⁸.",
        `In the calculator: \`_km / _AUkm\`, with _km = ${fix(m, 1)} × 10^${e}.${THEN(2)}`,
      ],
      candidates: [exact * 10, exact / 10, exact * 1.5],
      params: { kind, km },
      given: [G("_km", km), G("_AUkm", AU)],
    }, rng);
  }

  // hard
  const kind = rng.pick(["probe-years", "star-trip", "round-trip", "multi"]);
  if (kind === "probe-years") {
    const v = rng.int(10, 70);
    const au = rng.int(20, 1500) / 10;
    const who = rng.pick(PROBES);
    const exact = (au * AU) / v / YEAR;
    return single({
      prompt: `${who} cruises at a steady ${v} km/s and must cover a straight-line distance of ${num(au)} AU. Use 1 AU = 1.50 × 10⁸ km and 1 year = 3.16 × 10⁷ s. How many years does the trip take?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "years",
      steps: [
        `Distance in km: \`_km = ${num(au)} × 1.5e8\` = ${big(au * AU)} km.`,
        `Time in seconds: \`_s = _km / ${v}\` = ${Number((au * AU / v).toPrecision(6))} s.`,
        "Years: `_s / 3.16e7`",
      ],
      hints: [
        "Change the distance to km, then time = distance ÷ speed gives seconds.",
        `In the calculator: \`_au * _AUkm / _v\` gives seconds. Divide by \`_yr\` to get years.${THEN(2)}`,
      ],
      candidates: [exact * 10, exact / 10, (au * AU) / v / DAY],
      params: { kind, au, v },
      given: [G("_au", au), G("_v", v), G("_AUkm", AU), G("_yr", YEAR)],
    }, rng);
  }
  if (kind === "star-trip") {
    const { name, ly } = rng.pick(STARS);
    const v = rng.int(12, 90);
    const yrs = (ly * LY) / v / YEAR;
    const n = expOf(yrs);
    const exact = yrs / 10 ** n;
    return single({
      prompt: `${name} is ${num(ly)} light-years away. A probe travels at ${v} km/s. Use 1 ly = 9.46 × 10¹² km and 1 year = 3.16 × 10⁷ s. How many years would the probe take to get there? Give it as A × ${pow10(n)} years and type A.${DP(2)}`,
      exact, dp: 2, rounded: true, unit: `× ${pow10(n)} years`,
      steps: [
        `Distance: \`_km = ${num(ly)} × 9.46e12\` km.`,
        `Seconds: \`_s = _km / ${v}\`; years: \`_s / 3.16e7\` = ${Math.round(yrs)} years.`,
        `Divide by 10^${n} to get A:`,
      ],
      hints: [
        "Turn light-years into km, divide by the speed to get seconds, then divide by the seconds in a year.",
        `In the calculator: \`_ly * _LYkm / _v / _yr\` gives years; divide by 10^${n} for A.${THEN(2)}`,
      ],
      candidates: [exact * 10, exact / 10, (ly * LY) / v / 3600 / 24 / 10 ** (n + 2)],
      params: { kind, ly, v, n },
      given: [G("_ly", ly), G("_v", v), G("_LYkm", LY), G("_yr", YEAR)],
    }, rng);
  }
  if (kind === "round-trip") {
    let name, au;
    if (rng.next() < 0.4) { const p = rng.pick(PLANETS.filter((x) => x.au > 2)); name = `a probe near ${p.name}, ${num(p.au)} AU`; au = p.au; }
    else { au = rng.int(20, 1600) / 10; name = `a probe ${num(au)} AU`; }
    const exact = (2 * au * AU) / C / 3600;
    return single({
      prompt: `Mission control sends a radio command to ${name} away, and the probe replies at once. Radio waves travel at 3.00 × 10⁵ km/s and 1 AU = 1.50 × 10⁸ km. How many hours pass between sending the command and hearing the reply?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "hours",
      steps: [
        `The signal goes there and back: \`_km = 2 × ${num(au)} × 1.5e8\` = ${big(2 * au * AU)} km.`,
        `Seconds: \`_km / 3e5\` = ${num(2 * au * AU / C)} s. Hours: divide by 3600.`,
      ],
      hints: [
        "The signal makes the trip twice: out to the probe and back again.",
        `In the calculator: \`2 * _au * _AUkm / _c\` gives seconds; divide by 3600 for hours.${THEN(2)}`,
      ],
      candidates: [exact / 2, exact * 60, (2 * au * AU) / C / 60],
      params: { kind, au },
      given: [G("_au", au), G("_AUkm", AU), G("_c", C)],
    }, rng);
  }
  // multi: star distance in km, then trip time
  const star = rng.next() < 0.5 ? rng.pick(STARS) : { name: "A newly catalogued star", ly: rng.int(30, 300) / 10 };
  const v = rng.int(15, 80);
  const km = star.ly * LY;
  const n1 = expOf(km);
  const yrs = km / v / YEAR;
  const n2 = expOf(yrs);
  return multi(
    `${star.name} is ${num(star.ly)} light-years away. Use 1 ly = 9.46 × 10¹² km and 1 year = 3.16 × 10⁷ s. A probe sets off towards it at a steady ${v} km/s.`,
    [
      part("km", "Distance", `Distance in km, as A × ${pow10(n1)} km. Type A, rounded to 2 decimal places.`, km / 10 ** n1, 2,
        `Multiply the light-years by 9.46 × 10¹² (in the calculator: \`_ly * _LYkm\`), then divide by 10^${n1}.`,
        { kind: "ly-km", ly: star.ly, n: n1 }),
      part("years", "Trip time", `Trip time in years, as B × ${pow10(n2)} years. Type B, rounded to 2 decimal places. Use the unrounded distance.`, yrs / 10 ** n2, 2,
        `Seconds = distance in km ÷ ${v}; years = seconds ÷ 3.16 × 10⁷ (in the calculator: \`_ly * _LYkm / _v / _yr\`), then divide by 10^${n2}.`,
        { kind: "star-trip", ly: star.ly, v, n: n2 }),
    ],
    `Work in km and seconds.\n\n` +
      `- \`_km = ${num(star.ly)} × 9.46e12\` ≈ ${(km / 10 ** n1).toFixed(4)} × ${pow10(n1)} km, which rounds to **${fix(km / 10 ** n1, 2)}**.\n` +
      `- \`_s = _km / ${v}\`, then \`_s / 3.16e7\` ≈ ${Math.round(yrs)} years = ${(yrs / 10 ** n2).toFixed(4)} × ${pow10(n2)}, which rounds to **${fix(yrs / 10 ** n2, 2)}**.`,
    [G("_ly", star.ly), G("_v", v), G("_LYkm", LY), G("_yr", YEAR)],
    "Work in km and seconds throughout: change light-years to km first, then use time = distance ÷ speed.",
  );
}

// ======================================================================================
// Orbits

const KEPLER = "Kepler's third law for things orbiting the Sun: T² = a³, with T in years and a in AU";

function genOrbits(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["kepler-T", "kepler-a", "comet"]);
    if (kind === "comet") {
      const P = rng.int(5, 200);
      const Y = rng.int(1850, 2020);
      const n = rng.int(1, 4);
      const later = rng.next() < 0.6;
      const exact = later ? Y + n * P : Y - n * P;
      const name = rng.pick(["A comet", "A periodic comet", "An icy comet", "A short-period comet", "A long-period comet"]);
      const orbits = n === 1 ? "1 orbit" : `${n} orbits`;
      return single({
        prompt: `${name} has an orbital period of exactly ${P} years and was closest to the Sun in ${Y}. In which year was it closest to the Sun ${later ? `${orbits} later` : `${orbits} earlier`}? (Assume the period never changes.)`,
        exact, dp: 0, rounded: false, unit: "",
        steps: [`${n} orbit${n === 1 ? "" : "s"} take \`${n} × ${P}\` = ${n * P} years.`, `\`${Y} ${later ? "+" : "-"} ${n * P}\``],
        hints: [
          `Each orbit takes ${P} years, so ${orbits} take ${n} × ${P} years.`,
          `${later ? "Add" : "Subtract"} that many years ${later ? "to" : "from"} ${Y}.`,
        ],
        candidates: [later ? Y + P : Y - P, later ? Y - n * P : Y + n * P, later ? Y + (n + 1) * P : Y - (n + 1) * P],
        params: { kind, P, Y, n: later ? n : -n },
        given: [G("_P", P), G("_Y", Y)],
      }, rng);
    }
    const k = rng.int(2, 10);
    const a = k * k, T = k * k * k;
    const who = rng.pick(BODIES);
    if (kind === "kepler-T") {
      return single({
        prompt: `${KEPLER}. ${cap(who)} orbits the Sun at an average distance of ${a} AU. What is its orbital period, in years?`,
        exact: T, dp: 0, rounded: false, unit: "years",
        steps: [`\`T² = ${a}³ = ${a ** 3}\``, `\`T = √${a ** 3}\``],
        hints: [`Cube the distance: \`${a}³\`, which gives T².`, `Then take the square root (in the calculator: \`sqrt(_a^3)\`).`],
        candidates: [a * a, Math.sqrt(a), a ** 3],
        params: { kind, a, M: 1 },
        given: [G("_a", a)],
      }, rng);
    }
    return single({
      prompt: `${KEPLER}. ${cap(who)} takes ${T} years to orbit the Sun once. What is its average distance from the Sun, in AU?`,
      exact: a, dp: 0, rounded: false, unit: "AU",
      steps: [`\`a³ = ${T}² = ${T * T}\``, `\`a = ∛${T * T}\``],
      hints: [`Square the period: \`${T}²\`, which gives a³.`, `Then take the cube root (in the calculator: \`(_T^2)^(1/3)\`).`],
      candidates: [k, T * T, Math.sqrt(T)],
      params: { kind, T, M: 1 },
      given: [G("_T", T)],
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["kepler-T", "kepler-a", "orb-speed"]);
    if (kind === "kepler-T") {
      let name, a;
      if (rng.next() < 0.3) ({ name, au: a } = rng.pick(PLANETS));
      else { name = rng.pick(BODIES); a = rng.int(12, 400) / 10; }
      const exact = a ** 1.5;
      return single({
        prompt: `${KEPLER}. ${cap(name)} orbits at an average of ${num(a)} AU from the Sun. What is its orbital period, in years?${DP(2)}`,
        exact, dp: 2, rounded: true, unit: "years",
        steps: [`\`T² = ${num(a)}³ = ${num(a ** 3)}\``, `\`T = √${num(a ** 3)}\``],
        hints: [`Cube the distance to get T²: \`${num(a)}³\`.`, `Take the square root (in the calculator: \`sqrt(_a^3)\`).${THEN(2)}`],
        candidates: [a * a, a ** 3, Math.sqrt(a)],
        params: { kind, a, M: 1 },
        given: [G("_a", a)],
      }, rng);
    }
    if (kind === "kepler-a") {
      const T = rng.int(15, 2500) / 10;
      const who = rng.pick(BODIES);
      const exact = T ** (2 / 3);
      return single({
        prompt: `${KEPLER}. ${cap(who)} takes ${num(T)} years to orbit the Sun once. What is its average distance from the Sun, in AU?${DP(2)}`,
        exact, dp: 2, rounded: true, unit: "AU",
        steps: [`\`a³ = ${num(T)}² = ${num(T * T)}\``, `\`a = ∛${num(T * T)}\``],
        hints: [`Square the period to get a³: \`${num(T)}²\`.`, `Take the cube root (in the calculator: \`(_T^2)^(1/3)\`).${THEN(2)}`],
        candidates: [Math.sqrt(T), T ** 1.5, T / 2],
        params: { kind, T, M: 1 },
        given: [G("_T", T)],
      }, rng);
    }
    const REAL = [
      { name: "Mercury", around: "the Sun", r: 58, T: 88 },
      { name: "Venus", around: "the Sun", r: 108, T: 225 },
      { name: "Earth", around: "the Sun", r: 150, T: 365.25 },
      { name: "Mars", around: "the Sun", r: 228, T: 687 },
      { name: "The Moon", around: "Earth", r: 0.384, T: 27.3 },
      { name: "Io", around: "Jupiter", r: 0.422, T: 1.77 },
      { name: "Ganymede", around: "Jupiter", r: 1.07, T: 7.15 },
      { name: "Titan", around: "Saturn", r: 1.22, T: 15.9 },
    ];
    let o;
    if (rng.next() < 0.35) o = rng.pick(REAL);
    else o = { name: cap(rng.pick(BODIES)), around: "a star", r: rng.int(20, 900), T: rng.int(30, 3000) };
    const exact = (2 * Math.PI * o.r * 1e6) / (o.T * DAY);
    return single({
      prompt: `${o.name} moves in a (nearly) circular orbit around ${o.around} with radius ${num(o.r)} million km and period ${num(o.T)} days. Orbital speed = 2πr ÷ T. Use 1 day = 86 400 s. What is its orbital speed, in km/s?${DP(1)}`,
      exact, dp: 1, rounded: true, unit: "km/s",
      steps: [
        `Orbit length: \`2 × π × ${num(o.r)} × 10^6\` = ${big(Math.round(2 * Math.PI * o.r * 1e6))} km.`,
        `Time in seconds: \`${num(o.T)} × 86400\` = ${big(o.T * DAY)} s.`,
        "Speed = distance ÷ time:",
      ],
      hints: [
        "Change the radius to km (× 10⁶) and the period to seconds (× 86 400) before dividing.",
        `In the calculator: \`2 * pi * _r * 10^6 / (_T * 86400)\`.${THEN(1)}`,
      ],
      candidates: [exact * DAY / 3600, (Math.PI * o.r * 1e6) / (o.T * DAY), exact * 24],
      params: { kind, r: o.r, T: o.T },
      given: [G("_r", o.r), G("_T", o.T)],
    }, rng);
  }

  // hard
  const kind = rng.pick(["ratio-T", "star-mass", "multi"]);
  if (kind === "ratio-T") {
    const star = rng.pick(["a red dwarf", "a nearby star", "an orange dwarf", "a distant sun"]);
    const a1 = rng.int(3, 40) / 100;
    let a2;
    do a2 = rng.int(3, 90) / 100; while (Math.abs(a2 - a1) < 0.02);
    const T1 = rng.int(15, 600) / 10;
    const names = rng.shuffle(["b", "c", "d", "e"]);
    const exact = T1 * (a2 / a1) ** 1.5;
    return single({
      prompt: `Two planets orbit ${star}. For planets around the same star, T² ∝ a³. Planet ${names[0]} orbits at ${num(a1)} AU with a period of ${num(T1)} days. Planet ${names[1]} orbits at ${num(a2)} AU. What is planet ${names[1]}'s period, in days?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "days",
      steps: [
        "Because T² ∝ a³, `(T₂ / T₁)² = (a₂ / a₁)³`, so `T₂ = T₁ × (a₂ / a₁)^1.5`.",
        `\`T₂ = ${num(T1)} × (${num(a2)} / ${num(a1)})^1.5\``,
      ],
      hints: [
        "Compare the two planets: (T₂ / T₁)² = (a₂ / a₁)³.",
        `So \`T₂ = T₁ × (a₂ / a₁)^1.5\` (in the calculator: \`_T1 * (_a2 / _a1)^1.5\`).${THEN(2)}`,
      ],
      candidates: [T1 * (a2 / a1), T1 * (a2 / a1) ** (2 / 3), T1 * (a1 / a2) ** 1.5],
      params: { kind, a1, a2, T1 },
      given: [G("_a1", a1), G("_a2", a2), G("_T1", T1)],
    }, rng);
  }
  if (kind === "star-mass") {
    const a = rng.int(5, 80) / 10;
    let M;
    do M = rng.int(3, 30) / 10; while (M === 1);
    const exact = Math.sqrt(a ** 3 / M);
    const who = rng.pick(EXO);
    return single({
      prompt: `For a planet orbiting a star of mass M (in solar masses), T² = a³ ÷ M, with T in years and a in AU. ${who} orbits a star of ${num(M)} solar masses at ${num(a)} AU. What is its orbital period, in years?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "years",
      steps: [`\`T² = ${num(a)}³ / ${num(M)} = ${num(a ** 3 / M)}\``, `\`T = √${num(a ** 3 / M)}\``],
      hints: [`Cube a and divide by M: \`${num(a)}³ / ${num(M)}\` gives T².`, `Take the square root (in the calculator: \`sqrt(_a^3 / _M)\`).${THEN(2)}`],
      candidates: [Math.sqrt(a ** 3 * M), a ** 1.5, a ** 3 / M],
      params: { kind: "kepler-T", a, M },
      given: [G("_a", a), G("_M", M)],
    }, rng);
  }
  // multi: period, then speed from the rounded period
  const a = rng.int(12, 400) / 10;
  const T = a ** 1.5;
  const Tr = round(T, 2);
  const v = (2 * Math.PI * a * AU) / (Tr * YEAR);
  const who = rng.pick(BODIES);
  return multi(
    `${cap(who)} moves in a circular orbit around the Sun with radius ${num(a)} AU. ${KEPLER}. Orbital speed = 2πr ÷ T. Use 1 AU = 1.50 × 10⁸ km and 1 year = 3.16 × 10⁷ s.`,
    [
      part("period", "Period", "Orbital period in years, rounded to 2 decimal places.", T, 2,
        `Cube the radius in AU, then take the square root (in the calculator: \`sqrt(_a^3)\`).`,
        { kind: "kepler-T", a, M: 1 }),
      part("speed", "Speed", "Orbital speed in km/s, rounded to 1 decimal place. Use your rounded period.", v, 1,
        "Change the radius to km and the period to seconds first, then divide the orbit length 2πr by the time (in the calculator: `2 * pi * _a * _AUkm / (T * _yr)`, typing your rounded period in place of T).",
        { kind: "orb-speed-yr", a, Tr }),
    ],
    `Find T first, then use it for the speed.\n\n` +
      `- \`T = √(${num(a)}³) = √${num(a ** 3)}\` ${resultLine(T, 2, true, "years")}\n` +
      `- \`v = 2 × π × ${num(a)} × 1.5e8 / (${fix(Tr, 2)} × 3.16e7)\` ${resultLine(v, 1, true, "km/s")}`,
    [G("_a", a), G("_AUkm", AU), G("_yr", YEAR)],
    "Find the period first with Kepler's law, then use it in the speed formula with r in km and T in seconds.",
  );
}

// ======================================================================================
// Scale models

function genScale(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["dist-model", "dist-real", "size-model"]);
    if (kind === "size-model") {
      const X = rng.pick([100, 1000, 10000]);
      const p = rng.pick([...PLANETS, { name: "Earth", diam: EARTH_D }, { name: "the Moon", diam: 3470 }]);
      const exact = p.diam / X;
      return single({
        prompt: `In a model, 1 cm represents ${big(X)} km. ${cap(p.name)} is about ${big(p.diam)} km across. How wide is the model ${p.name === "the Moon" ? "Moon" : p.name}, in cm? Give the exact value.`,
        exact, dp: 2, rounded: false, unit: "cm",
        steps: [`Divide the real size by ${big(X)} km per cm.`, `\`${num(p.diam)} / ${num(X)}\``],
        hints: [`Every ${big(X)} km becomes 1 cm, so divide by ${big(X)}.`, `Work out \`${num(p.diam)} / ${num(X)}\` (in the calculator: \`_D / _X\`).`],
        candidates: [exact * 10, exact / 10, p.diam * X / 1e6],
        params: { kind, D: p.diam, X },
        given: [G("_D", p.diam), G("_X", X)],
      }, rng);
    }
    const X = rng.pick([2, 4, 5, 10]);
    let name, mkm;
    const fits = PLANETS.filter((p) => p.mkm % X === 0);
    if (fits.length && rng.next() < 0.35) ({ name, mkm } = rng.pick(fits));
    else { name = rng.pick(BODIES); mkm = X * rng.int(3, 300); }
    const cm = mkm / X;
    const per = `${X} million km`;
    if (kind === "dist-model") {
      return single({
        prompt: `In a model of the solar system, 1 cm represents ${per}. ${cap(name)} is ${big(mkm)} million km from the Sun. How far from the model Sun should it go, in cm?`,
        exact: cm, dp: 0, rounded: false, unit: "cm",
        steps: [`Divide the real distance by ${per} per cm.`, `\`${num(mkm)} / ${X}\``],
        hints: [`Each ${per} becomes 1 cm.`, `Divide: \`${num(mkm)} / ${X}\` (in the calculator: \`_mkm / _X\`).`],
        candidates: [mkm * X, mkm, mkm / X / 10],
        params: { kind, mkm, X },
        given: [G("_mkm", mkm), G("_X", X)],
      }, rng);
    }
    return single({
      prompt: `In a model of the solar system, 1 cm represents ${per}. A model ${name.replace(/^(an?|the) /, "")} is placed ${cm} cm from the model Sun. How far is that in real life, in millions of km?`,
      exact: mkm, dp: 0, rounded: false, unit: "million km",
      steps: [`Multiply the model distance by ${per} per cm.`, `\`${cm} × ${X}\``],
      hints: [`Each cm stands for ${per}.`, `Multiply: \`${cm} × ${X}\` (in the calculator: \`_cm * _X\`).`],
      candidates: [cm / X, cm * X * 10, cm + X],
      params: { kind, cm, X },
      given: [G("_cm", cm), G("_X", X)],
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["sun-ball", "planet-mm", "scale-n"]);
    const D = rng.pick([10, 14, 20, 25, 28, 30, 40, 50, 60, 70, 100]);
    if (kind === "sun-ball") {
      let name, mkm;
      if (rng.next() < 0.5) ({ name, mkm } = rng.pick([...PLANETS, { name: "Earth", mkm: 150 }]));
      else { name = rng.pick(BODIES); mkm = rng.int(40, 6000); }
      const exact = (mkm * 1e6 * D) / SUN_D / 100;
      return single({
        prompt: `In a scale model the Sun (real diameter 1 390 000 km) is a ball ${D} cm across. ${cap(name)} is ${big(mkm)} million km from the Sun. How far from the model Sun should it go, in metres?${DP(1)}`,
        exact, dp: 1, rounded: true, unit: "m",
        steps: [
          `Scale: ${D} cm represents 1 390 000 km, so model distance = real distance × ${D} ÷ 1 390 000 (in cm).`,
          `\`${num(mkm)} × 10^6 × ${D} / 1390000\` = ${num((mkm * 1e6 * D) / SUN_D)} cm.`,
          "Divide by 100 for metres:",
        ],
        hints: [
          `Model ÷ real is the same for every distance: ${D} cm ÷ 1 390 000 km.`,
          `In the calculator: \`_mkm * 10^6 * _D / _sun\` gives cm; divide by 100 for metres.${THEN(1)}`,
        ],
        candidates: [exact * 100, exact / 10, (mkm * 1e6 * D) / SUN_D / 1000],
        params: { kind, mkm, D },
        given: [G("_mkm", mkm), G("_D", D), G("_sun", SUN_D)],
      }, rng);
    }
    if (kind === "planet-mm") {
      const p = rng.pick([...PLANETS, { name: "Earth", diam: EARTH_D }, { name: "the Moon", diam: 3470 }]);
      const exact = (p.diam * D * 10) / SUN_D;
      const label = p.name === "the Moon" ? "the Moon" : p.name;
      return single({
        prompt: `In a scale model the Sun (real diameter 1 390 000 km) is a ball ${D} cm across. ${cap(label)} is about ${big(p.diam)} km across. How wide is the model ${label.replace(/^the /, "")}, in millimetres?${DP(2)}`,
        exact, dp: 2, rounded: true, unit: "mm",
        steps: [
          `The Sun model is ${D} cm = ${D * 10} mm.`,
          `Model size = real size × ${D * 10} ÷ 1 390 000: \`${num(p.diam)} × ${D * 10} / 1390000\``,
        ],
        hints: [
          `Change the Sun model to mm first (${D} cm = ${D * 10} mm).`,
          `Then scale the real size: \`_size * _D * 10 / _sun\`.${THEN(2)}`,
        ],
        candidates: [exact * 10, exact / 10, (p.diam * D) / SUN_D * 100],
        params: { kind, size: p.diam, D },
        given: [G("_size", p.diam), G("_D", D), G("_sun", SUN_D)],
      }, rng);
    }
    const ePow = rng.pick([11, 12]);
    const nScale = 10 ** ePow;
    const cm = rng.int(5, 900) / 10;
    const exact = (cm * nScale) / 1e5 / 1e6; // million km
    return single({
      prompt: `A solar-system model is built to a scale of 1 : ${pow10(ePow)}, so 1 cm on the model is ${pow10(ePow)} cm in real life. Two model planets are ${fix(cm, 1)} cm apart. How far apart would the real planets be, in millions of km? (1 km = 100 000 cm.)${DP(1)}`,
      exact, dp: 1, rounded: true, unit: "million km",
      steps: [
        `Real distance in cm: \`${fix(cm, 1)} × 10^${ePow}\`.`,
        `In km: divide by 100 000. In millions of km: divide by 10^6 as well.`,
      ],
      hints: [
        `Multiply by 10^${ePow} to get the real distance in cm.`,
        `Then change cm to km (÷ 100 000) and km to millions of km (÷ 10^6) (in the calculator: \`_cm * 10^${ePow} / 10^5 / 10^6\`).${THEN(1)}`,
      ],
      candidates: [exact * 10, exact / 10, exact * 100],
      params: { kind, cm, ePow },
      given: [G("_cm", cm)],
    }, rng);
  }

  // hard
  const kind = rng.pick(["scale-sf", "proxima", "multi"]);
  if (kind === "scale-sf") {
    const L = rng.int(20, 2000) / 10; // metres in the model for 1 AU
    const real = AU * 1000; // m
    const ratio = real / L;
    const n = expOf(ratio);
    const exact = ratio / 10 ** n;
    return single({
      prompt: `A school builds a solar-system walk where the Sun–Earth distance (1 AU = 1.50 × 10⁸ km) is ${num(L)} m long. Its scale is 1 : N. Give N as A × ${pow10(n)} and type A.${DP(2)}`,
      exact, dp: 2, rounded: true, unit: `× ${pow10(n)}`,
      steps: [
        `Same units first: 1.50 × 10⁸ km = 1.50 × 10¹¹ m.`,
        `\`N = 1.5e11 / ${num(L)}\` = ${Number(ratio.toPrecision(6))}; divide by 10^${n} to get A:`,
      ],
      hints: [
        "A scale compares the same units: change 1 AU into metres (× 1000).",
        `Then N = real ÷ model (in the calculator: \`_AUkm * 1000 / _L / 10^${n}\` gives A).${THEN(2)}`,
      ],
      candidates: [exact * 10, exact / 10, exact * 1.5],
      params: { kind, L, n },
      given: [G("_L", L), G("_AUkm", AU)],
    }, rng);
  }
  if (kind === "proxima") {
    const D = rng.pick([1, 2, 5, 10, 14, 20, 28, 50, 100]);
    const star = rng.pick(STARS.slice(0, 5));
    const exact = (star.ly * LY * D) / SUN_D / 1e5; // model km
    return single({
      prompt: `In a scale model the Sun (diameter 1 390 000 km) is ${D} cm across. On the same scale, how far away would ${star.name} (${num(star.ly)} light-years; 1 ly = 9.46 × 10¹² km) be, in km? (1 km = 100 000 cm.)${DP(0)}`,
      exact, dp: 0, rounded: true, unit: "km",
      steps: [
        `Real distance: \`${num(star.ly)} × 9.46e12\` km.`,
        `Model distance in cm = real km × ${D} ÷ 1 390 000 = ${big(Math.round(exact * 1e5))} cm.`,
        "Divide by 100 000 to get km:",
      ],
      hints: [
        "Change light-years into km first, then scale with the Sun: model = real × (model Sun ÷ real Sun).",
        `In the calculator: \`_ly * _LYkm * _D / _sun\` gives cm; divide by 100000 for km.${THEN(0)}`,
      ],
      candidates: [exact * 100, exact / 1000, exact * 10],
      params: { kind, ly: star.ly, D },
      given: [G("_ly", star.ly), G("_D", D), G("_LYkm", LY), G("_sun", SUN_D)],
    }, rng);
  }
  // multi: model Earth X mm -> model Sun (cm) and model Neptune distance (km)
  const X = rng.pick([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25]);
  const far = rng.pick(PLANETS.filter((p) => p.mkm >= 778));
  const sunCm = (SUN_D * X) / EARTH_D / 10;
  const farKm = (far.mkm * 1e6 * X) / EARTH_D / 1e6;
  return multi(
    `A model solar system shows Earth (real diameter 12 700 km) as a bead ${X} mm across. On the same scale: the Sun is 1 390 000 km across, and ${far.name} is ${big(far.mkm)} million km from the Sun. (10 mm = 1 cm; 1 km = 1 000 000 mm.)`,
    [
      part("sun", "Model Sun", "Diameter of the model Sun, in cm, rounded to 1 decimal place.", sunCm, 1,
        `Model ÷ real is ${X} mm ÷ 12 700 km for everything. Model Sun in mm: \`_sun * _X / _earth\`, then ÷ 10 for cm.`,
        { kind: "earth-sun", X }),
      part("far", `${far.name} distance`, `Distance from the model Sun to model ${far.name}, in km, rounded to 2 decimal places.`, farKm, 2,
        `Model distance in mm: \`_mkm * 10^6 * _X / _earth\`; then ÷ 1 000 000 for km.`,
        { kind: "earth-far", X, mkm: far.mkm }),
    ],
    `Scale: ${X} mm of model for every 12 700 km of real size.\n\n` +
      `- Sun: \`1390000 × ${X} / 12700\` = ${num((SUN_D * X) / EARTH_D)} mm ${resultLine(sunCm, 1, true, "cm")}\n` +
      `- ${far.name}: \`${far.mkm} × 10^6 × ${X} / 12700\` = ${big(Math.round(far.mkm * 1e6 * X / EARTH_D))} mm ${resultLine(farKm, 2, true, "km")}`,
    [G("_X", X), G("_earth", EARTH_D), G("_sun", SUN_D), G("_mkm", far.mkm)],
    `Everything shrinks by the same factor: ${X} mm of model for every 12 700 km of real size.`,
  );
}

// ======================================================================================
// Apparent size & gravity

const SMALL = "For small angles, angle in degrees = (diameter ÷ distance) × 180 ÷ π";
const ROCKY = [
  { name: "Mercury", M: 0.055, R: 0.383 },
  { name: "Venus", M: 0.815, R: 0.95 },
  { name: "Mars", M: 0.107, R: 0.532 },
  { name: "the Moon", M: 0.0123, R: 0.273 },
];

function genAngles(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["weight", "ratio-int", "mass-same"]);
    if (kind === "weight" || kind === "mass-same") {
      const W = rng.pick([
        { name: "the Moon", g: 1.6, step: 5 }, { name: "Mars", g: 3.7, step: 10 }, { name: "Mercury", g: 3.7, step: 10 },
        { name: "Venus", g: 8.9, step: 10 }, { name: "Titan", g: 1.4, step: 5 }, { name: "Pluto", g: 0.6, step: 5 },
        { name: rng.pick(EXO), g: rng.int(4, 30), step: 1 },
      ]);
      const m = W.step * rng.int(Math.ceil(20 / W.step), Math.floor(150 / W.step));
      const who = rng.pick(["A rover", "A lander", "A robot", "A science package", "A drill rig", "A supply crate"]);
      if (kind === "mass-same") {
        const pool = [String(m), num(round(m * W.g, 1)), num(round(m / W.g, 1)), num(round(m * 9.8, 1)), num(round(m / 6, 1))];
        const opts = [...new Set(pool)].slice(0, 4);
        if (opts.length < 4) throw new Error("not enough options");
        return {
          prompt: `${who} has a mass of ${m} kg on Earth. Gravity on ${W.name} is ${num(W.g)} N/kg. What is its mass on ${W.name}, in kg?`,
          answer: String(m),
          answerType: "choice",
          choices: rng.shuffle(opts),
          explanation: `Mass is the amount of matter, so it does not change from world to world. Only the weight (the force, in N) changes.\n\nThe mass on ${W.name} is still **${m} kg**.`,
          hints: ["Is the question asking for a mass (kg) or a weight (N)?", "Weight depends on gravity, but mass is the amount of stuff, which does not depend on where you are."],
          params: { kind, m, g: W.g },
        };
      }
      const exact = round(m * W.g, 6);
      return single({
        prompt: `Weight = mass × g. On ${W.name}, g = ${num(W.g)} N/kg. ${who} has a mass of ${m} kg. What is its weight on ${W.name}, in newtons (N)?`,
        exact, dp: 1, rounded: false, unit: "N",
        steps: ["Weight = mass × g.", `\`W = ${m} × ${num(W.g)}\``],
        hints: ["Use weight = mass × g.", `Multiply: \`${m} × ${num(W.g)}\` (in the calculator: \`_m * _g\`).`],
        candidates: [m / W.g, m * 9.8, m],
        params: { kind, m, g: W.g },
        given: [G("_m", m), G("_g", W.g)],
      }, rng);
    }
    const R = rng.pick([1, 2, 2, 3]);
    const k = R === 1 ? rng.int(2, 12) : rng.int(1, 6);
    const M = k * R * R;
    const who = rng.pick(EXO);
    return single({
      prompt: `Surface gravity compared with Earth = mass ratio ÷ (radius ratio)². ${who} has ${M} times Earth's mass and ${R === 1 ? "the same radius as Earth" : `${R} times Earth's radius`}. How many times Earth's surface gravity does it have?`,
      exact: k, dp: 0, rounded: false, unit: "times Earth's",
      steps: [`Square the radius ratio: \`${R}² = ${R * R}\`.`, `\`g ratio = ${M} / ${R * R}\``],
      hints: ["Gravity grows with mass but shrinks with the square of the radius.", `Square the radius ratio (${R}), then divide the mass ratio by it.`],
      candidates: [M / R, M * R * R, M],
      params: { kind: "g-ratio", M, R },
      given: [G("_M", M), G("_R", R)],
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["angle-deg", "angle-deg", "g-ratio"]);
    if (kind === "angle-deg") {
      const OBJ = [
        () => ({ what: "The Moon", D: 3470, dist: rng.int(356, 407) * 1000, u: "km", ctx: "from Earth" }),
        () => ({ what: "The Sun", D: SUN_D, dist: rng.int(147, 152) * 1e6, u: "km", ctx: "from Earth" }),
        () => ({ what: "A person", D: rng.int(150, 195) / 100, dist: rng.int(20, 200), u: "m", ctx: "on a hilltop" }),
        () => ({ what: "A tree", D: rng.int(8, 30), dist: rng.int(200, 900), u: "m", ctx: "across a valley" }),
        () => ({ what: "A hot-air balloon", D: rng.int(15, 25), dist: rng.int(200, 2000), u: "m", ctx: "in the sky" }),
        () => ({ what: "A coin", D: rng.int(18, 30) / 1000, dist: rng.int(10, 40) / 10, u: "m", ctx: "held up by a friend" }),
        () => ({ what: "A moon of a distant planet", D: rng.int(1000, 5000), dist: rng.int(50, 500) * 1000, u: "km", ctx: "seen from a passing probe" }),
      ];
      const o = rng.pick(OBJ)();
      const exact = (o.D / o.dist) / DEG;
      if (exact < 0.1 || exact > 20) throw new Error("angle out of range");
      return single({
        prompt: `${SMALL}. ${o.what} ${o.ctx} is ${big(o.D)} ${o.u} across and ${big(o.dist)} ${o.u} away. What angle does it cover, in degrees?${DP(2)}`,
        exact, dp: 2, rounded: true, unit: "°",
        steps: [`Both lengths are in ${o.u}, so divide: \`${num(o.D)} / ${num(o.dist)}\` = ${Number((o.D / o.dist).toPrecision(5))} (radians).`, "Change to degrees: × 180 ÷ π."],
        hints: [
          "Divide the diameter by the distance (same units) to get the angle in radians.",
          `Then multiply by 180 and divide by π (in the calculator: \`_D / _dist * 180 / pi\`).${THEN(2)}`,
        ],
        candidates: [o.D / o.dist, (o.dist / o.D) / DEG / 1000, exact * 2],
        params: { kind, D: o.D, dist: o.dist },
        given: [G("_D", o.D), G("_dist", o.dist)],
      }, rng);
    }
    let name, M, R;
    if (rng.next() < 0.4) ({ name, M, R } = rng.pick(ROCKY));
    else { name = rng.pick(EXO); M = rng.int(20, 2000) / 100; R = rng.int(5, 30) / 10; }
    const exact = M / (R * R);
    return single({
      prompt: `Surface gravity compared with Earth = mass ratio ÷ (radius ratio)². ${cap(name)} has ${num(M)} times Earth's mass and ${num(R)} times Earth's radius. How many times Earth's surface gravity does it have?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "times Earth's",
      steps: [`\`${num(R)}² = ${num(R * R)}\``, `\`g ratio = ${num(M)} / ${num(R * R)}\``],
      hints: ["Square the radius ratio first.", `Then divide the mass ratio by it (in the calculator: \`_M / _R^2\`).${THEN(2)}`],
      candidates: [M / R, M * R * R, M / (2 * R)],
      params: { kind: "g-ratio", M, R },
      given: [G("_M", M), G("_R", R)],
    }, rng);
  }

  // hard
  const kind = rng.pick(["arcsec", "size-angle", "dist-angle", "multi"]);
  const ARC = "1° = 3600 arcseconds (″). For small angles, angle in radians = diameter ÷ distance, and 1 radian = 180 ÷ π degrees";
  if (kind === "arcsec") {
    const P = rng.pick([
      { name: "Jupiter", D: 140000, lo: 588, hi: 968 },
      { name: "Mars", D: 6780, lo: 56, hi: 400 },
      { name: "Venus", D: 12100, lo: 40, hi: 260 },
      { name: "Saturn", D: 116000, lo: 1200, hi: 1660 },
    ]);
    const mkm = rng.int(P.lo, P.hi);
    const exact = (P.D / (mkm * 1e6)) / DEG * 3600;
    return single({
      prompt: `${ARC}. ${P.name} (diameter ${big(P.D)} km) is ${big(mkm)} million km from Earth tonight. How wide does it look, in arcseconds?${DP(1)}`,
      exact, dp: 1, rounded: true, unit: "″",
      steps: [
        `Radians: \`${num(P.D)} / (${mkm} × 10^6)\` = ${Number((P.D / (mkm * 1e6)).toPrecision(5))}.`,
        "Degrees: × 180 ÷ π. Arcseconds: × 3600.",
      ],
      hints: [
        "Put both lengths in km: the distance is millions of km, so multiply it by 10⁶.",
        `Then radians → degrees → arcseconds (in the calculator: \`_D / (_mkm * 10^6) * 180 / pi * 3600\`).${THEN(1)}`,
      ],
      candidates: [exact / 60, exact * 60, exact * DEG],
      params: { kind, D: P.D, dist: mkm * 1e6 },
      given: [G("_D", P.D), G("_mkm", mkm)],
    }, rng);
  }
  if (kind === "size-angle") {
    const theta = rng.int(5, 50) / 10; // arcsec
    const mkm = rng.int(20, 400); // million km
    const exact = mkm * 1e6 * (theta / 3600) * DEG;
    const what = rng.pick(["An asteroid", "A small moon", "A comet's nucleus and coma", "A dwarf planet", "A gas cloud", "A distant moon"]);
    return single({
      prompt: `${ARC}. ${what} ${mkm} million km from a telescope appears ${fix(theta, 1)}″ wide. How wide is it really, in km?${DP(0)}`,
      exact, dp: 0, rounded: true, unit: "km",
      steps: [
        `Change the angle to radians: \`${fix(theta, 1)} / 3600 × π / 180\` = ${Number(((theta / 3600) * DEG).toPrecision(5))}.`,
        `Diameter = angle (radians) × distance: \`× ${mkm} × 10^6\``,
      ],
      hints: [
        "Turn arcseconds into degrees (÷ 3600), then degrees into radians (× π ÷ 180).",
        `Diameter = angle in radians × distance in km (in the calculator: \`_th / 3600 * pi / 180 * _mkm * 10^6\`).${THEN(0)}`,
      ],
      candidates: [mkm * 1e6 * (theta / 3600), exact * 60, exact / 60],
      params: { kind, theta, dist: mkm * 1e6 },
      given: [G("_th", theta), G("_mkm", mkm)],
    }, rng);
  }
  if (kind === "dist-angle") {
    const D = rng.int(200, 5000); // km
    const theta = rng.int(5, 100) / 10; // arcsec
    const exact = D / ((theta / 3600) * DEG) / 1e6; // million km
    if (exact < 1 || exact > 50000) throw new Error("distance out of range");
    const what = rng.pick(["An asteroid", "A moon", "A dwarf planet", "An icy world", "A comet nucleus"]);
    return single({
      prompt: `${ARC}. ${what} is known to be ${big(D)} km across and appears ${fix(theta, 1)}″ wide. How far away is it, in millions of km?${DP(1)}`,
      exact, dp: 1, rounded: true, unit: "million km",
      steps: [
        `Angle in radians: \`${fix(theta, 1)} / 3600 × π / 180\` = ${Number(((theta / 3600) * DEG).toPrecision(5))}.`,
        `Distance = diameter ÷ angle: \`${D} / angle\` = ${big(Math.round(D / ((theta / 3600) * DEG)))} km. Divide by 10^6:`,
      ],
      hints: [
        "Turn the angle into radians first (÷ 3600, then × π ÷ 180).",
        `Distance = diameter ÷ angle in radians (in the calculator: \`_D / (_th / 3600 * pi / 180)\`), then divide by 10^6.${THEN(1)}`,
      ],
      candidates: [exact * 60, exact / 60, D / (theta / 3600) / 1e6],
      params: { kind, D, theta },
      given: [G("_D", D), G("_th", theta)],
    }, rng);
  }
  // multi: gravity ratio, then weight from the rounded ratio
  let name, M, R;
  if (rng.next() < 0.3) ({ name, M, R } = rng.pick(ROCKY));
  else { name = rng.pick(EXO); M = rng.int(20, 2000) / 100; R = rng.int(5, 30) / 10; }
  const ratio = M / (R * R);
  const rr = round(ratio, 2);
  const m = rng.int(40, 150);
  const W = rr * 9.8 * m;
  return multi(
    `Surface gravity compared with Earth = mass ratio ÷ (radius ratio)². ${cap(name)} has ${num(M)} times Earth's mass and ${num(R)} times Earth's radius. On Earth, g = 9.8 N/kg. An astronaut with a mass of ${m} kg lands there.`,
    [
      part("ratio", "Gravity ratio", "How many times Earth's surface gravity? Round to 2 decimal places.", ratio, 2,
        "Square the radius ratio, then divide the mass ratio by it (in the calculator: `_M / _R^2`).",
        { kind: "g-ratio", M, R }),
      part("weight", "Weight", "The astronaut's weight there, in N, rounded to the nearest whole number. Use your rounded ratio.", W, 0,
        "Weight = mass × g there, and g there = your ratio × 9.8 N/kg (in the calculator: your ratio `* 9.8 * _mass`).",
        { kind: "weight-ratio", rr, m }),
    ],
    `Gravity first, then weight.\n\n` +
      `- \`${num(M)} / ${num(R)}²\` ${resultLine(ratio, 2, true, "")}\n` +
      `- \`W = ${fix(rr, 2)} × 9.8 × ${m}\` ${resultLine(W, 0, true, "N")}`,
    [G("_M", M), G("_R", R), G("_mass", m)],
    "Find how strong gravity is there compared with Earth, then turn that into a weight.",
  );
}

// ======================================================================================

// Draws until verify() accepts the question (e.g. no rounding ties). Only the rng passed in is
// used, so a seed always gives the same question.
export function generate(args) {
  let q;
  for (let i = 0; i < 25; i++) {
    q = make(args);
    const own = q.answerType === "multi" ? Object.fromEntries(q.parts.map((p) => [p.id, p.answer])) : q.answer;
    if (verify(q, own)) return q;
  }
  return q;
}

function make({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "distances") return genDistances(difficulty, rng);
  if (subtopic === "orbits") return genOrbits(difficulty, rng);
  if (subtopic === "scale-models") return genScale(difficulty, rng);
  if (subtopic === "angles-gravity") return genAngles(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ======================================================================================
// Independent check: substitute the candidate x into the forward relation and look at the
// residual r (with sens = |dr/dx|). A rounded answer passes when |r| ≤ half a step × sens; it is
// well posed only if the neighbouring rounded values clearly fail (no half-step ties).

function residual(p, x) {
  switch (p.kind) {
    case "lt-time": return { r: C * x - p.dist, sens: C };
    case "lt-dist": return { r: x / C - p.t, sens: 1 / C };
    case "au-km": return { r: x / 150 - p.k, sens: 1 / 150 };
    case "km-au": return { r: 150 * x - p.mkm, sens: 150 };
    case "light-min": return { r: x * 60 * C - p.au * AU, sens: 60 * C };
    case "ly-km": return { r: (x * 10 ** p.n) / LY - p.ly, sens: 10 ** p.n / LY };
    case "km-au2": return { r: x * AU - p.km, sens: AU };
    case "probe-years": return { r: x * YEAR * p.v - p.au * AU, sens: YEAR * p.v };
    case "star-trip": return { r: x * 10 ** p.n * YEAR * p.v - p.ly * LY, sens: 10 ** p.n * YEAR * p.v };
    case "round-trip": return { r: (x * 3600 * C) / 2 - p.au * AU, sens: (3600 * C) / 2 };
    case "kepler-T": return x > 0 ? { r: x * x * p.M - p.a ** 3, sens: 2 * x * p.M } : null;
    case "kepler-a": return x > 0 ? { r: x ** 3 - p.T * p.T * p.M, sens: 3 * x * x } : null;
    case "comet": return { r: (x - p.Y) / p.P - p.n, sens: 1 / p.P };
    case "orb-speed": return { r: x * p.T * DAY - 2 * Math.PI * p.r * 1e6, sens: p.T * DAY };
    case "orb-speed-yr": return { r: x * p.Tr * YEAR - 2 * Math.PI * p.a * AU, sens: p.Tr * YEAR };
    case "ratio-T": return x > 0 ? { r: (x / p.T1) ** 2 - (p.a2 / p.a1) ** 3, sens: (2 * x) / (p.T1 * p.T1) } : null;
    case "size-model": return { r: x * p.X - p.D, sens: p.X };
    case "dist-model": return { r: x * p.X - p.mkm, sens: p.X };
    case "dist-real": return { r: x / p.X - p.cm, sens: 1 / p.X };
    case "sun-ball": return { r: x * 100 * SUN_D - p.mkm * 1e6 * p.D, sens: 100 * SUN_D };
    case "planet-mm": return { r: x * SUN_D - p.size * p.D * 10, sens: SUN_D };
    case "scale-n": return { r: x * 1e6 * 1e5 - p.cm * 10 ** p.ePow, sens: 1e11 };
    case "scale-sf": return { r: x * 10 ** p.n * p.L - AU * 1000, sens: 10 ** p.n * p.L };
    case "proxima": return { r: x * 1e5 * SUN_D - p.ly * LY * p.D, sens: 1e5 * SUN_D };
    case "earth-sun": return { r: x * 10 * EARTH_D - SUN_D * p.X, sens: 10 * EARTH_D };
    case "earth-far": return { r: x * 1e6 * EARTH_D - p.mkm * 1e6 * p.X, sens: 1e6 * EARTH_D };
    case "weight": return { r: x / p.m - p.g, sens: 1 / p.m };
    case "g-ratio": return { r: x * p.R * p.R - p.M, sens: p.R * p.R };
    case "weight-ratio": return { r: x / (9.8 * p.m) - p.rr, sens: 1 / (9.8 * p.m) };
    case "angle-deg": return { r: x * DEG * p.dist - p.D, sens: DEG * p.dist };
    case "arcsec": return { r: (x / 3600) * DEG * p.dist - p.D, sens: (DEG * p.dist) / 3600 };
    case "size-angle": return { r: (x / p.dist / DEG) * 3600 - p.theta, sens: 3600 / (p.dist * DEG) };
    case "dist-angle": return x > 0 ? { r: (p.D / (x * 1e6) / DEG) * 3600 - p.theta, sens: (p.D * 3600) / (DEG * 1e6 * x * x) } : null;
    default: return null;
  }
}

function toNum(a) {
  if (a === "" || a === null || a === undefined) return NaN;
  return typeof a === "number" ? a : Number(String(a).trim());
}

function numOk(p, a, slack = 1) {
  const x = toNum(a);
  if (!Number.isFinite(x)) return false;
  const d = residual(p, x);
  if (!d || !Number.isFinite(d.r) || !(d.sens > 0)) return false;
  if (!p.rounded) return Math.abs(d.r) <= 1e-9 * d.sens * Math.max(1, Math.abs(x));
  return Math.abs(d.r) <= 0.5 * STEP(p.dp) * d.sens * slack;
}

// The neighbours one step either side must clearly fail (2% margin), so exactly one rounded value fits.
function wellPosed(p, a) {
  if (!p.rounded) return true;
  const x = toNum(a);
  if (Math.abs(round(x, p.dp) - x) > 1e-9 * Math.max(1, Math.abs(x))) return false;
  return [-1, 1].every((s) => !numOk(p, x + s * STEP(p.dp), 1.02));
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false; // regenerate from the seed to get params back
  try {
    if (p.multi) {
      const a = answer && typeof answer === "object" ? answer : {};
      return Array.isArray(p.parts) && p.parts.every((s) => numOk(s, a[s.id]) && wellPosed(s, a[s.id]));
    }
    if (p.kind === "mass-same") {
      const ch = question.choices;
      return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && ch.includes(String(answer)) &&
        ch.filter((c) => Number(c) === p.m).length === 1 && Number(answer) === p.m;
    }
    if (question.answerType === "choice") {
      const ch = question.choices;
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
      if (ch.filter((c) => numOk(p, c)).length !== 1) return false;
      // a correct value must also be well posed
      return numOk(p, answer) && wellPosed(p, round(toNum(answer), p.rounded ? p.dp : 9));
    }
    return numOk(p, answer) && wellPosed(p, answer);
  } catch {
    return false;
  }
}
