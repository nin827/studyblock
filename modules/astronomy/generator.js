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
  if (args && args.difficulty === "expert") return xGenerate(args.subtopic, args.rng);
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
  if (p.expert) return xVerify(question, answer);
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

// =============================================================================================
// Expert. A separate branch: generate() sends "expert" here before anything else, so easy, medium
// and hard questions never see an extra rng draw. Each part carries a check name and the values
// stated in the prompt (in SI). verify() substitutes the candidate into the un-rearranged law,
// recomputing any intermediate from the stated values (never from an earlier part), and accepts it
// when the law changes sign inside the answer ± half a unit in the last place.

class XRetry extends Error {}
const xRound = (n, dp) => {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
};
const xTie = (x, dp) => {
  const f = Math.abs(x) * 10 ** dp;
  return Math.abs(f - Math.floor(f) - 0.5) < 1e-6;
};
const xFix = (x, dp) => xRound(x, dp).toFixed(dp);
const xN = (n) => String(xRound(n, 6));
const xDP = (dp) => (dp === 0 ? " Round to the nearest whole number." : ` Round to ${dp} decimal place${dp === 1 ? "" : "s"}.`);
const xG = (label, value) => ({ label, value });

function xNum(id, label, ask, exact, dp, hint, check) {
  if (!Number.isFinite(exact) || xTie(exact, dp)) throw new XRetry();
  return {
    part: { id, label, ask: ask + xDP(dp), answerType: "number", answer: xRound(exact, dp), tolerance: 0.5 * 10 ** -dp, hint },
    spec: { id, check, dp },
  };
}
// A whole-number part that must be exact (counts, "round up" answers): tolerance 0.
function xInt(id, label, ask, answer, hint, check) {
  if (!Number.isInteger(answer)) throw new XRetry();
  return { part: { id, label, ask, answerType: "number", answer, tolerance: 0, hint }, spec: { id, check, int: true } };
}
function xPick(id, label, ask, answer, choices, hint, check) {
  return { part: { id, label, ask, answerType: "choice", answer, choices, hint }, spec: { id, check } };
}
function xMulti(prompt, list, steps, values, given, hints) {
  const q = {
    prompt,
    answerType: "multi",
    parts: list.map((p) => p.part),
    explanation: steps.join("\n\n"),
    params: { expert: true, values, parts: list.map((p) => p.spec) },
    hints,
  };
  if (given && given.length) q.given = given;
  return q;
}
function xSingle(prompt, exact, dp, steps, values, check, given, hints) {
  if (!Number.isFinite(exact) || xTie(exact, dp)) throw new XRetry();
  const q = {
    prompt: prompt + xDP(dp),
    answer: xRound(exact, dp),
    answerType: "number",
    choices: undefined,
    tolerance: 0.5 * 10 ** -dp,
    explanation: steps.join("\n\n"),
    params: { expert: true, values, check, dp },
    hints,
  };
  if (given && given.length) q.given = given;
  return q;
}
// "≈ 12.3456, which rounds to **12.35**" (or "= **12.35**" when exact).
function xRes(exact, dp, unit) {
  const u = unit ? (unit.startsWith("°") ? unit : ` ${unit}`) : "";
  const shown = xFix(exact, dp);
  if (Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${Number(exact.toPrecision(7))}${u}, which rounds to **${shown}${u}**`;
}
function xRun(make, rng) {
  for (let i = 0; i < 60; i++) {
    try {
      return make(rng);
    } catch (e) {
      if (!(e instanceof XRetry)) throw e;
    }
  }
  return make(rng);
}

// Root of f strictly inside (x - h, x + h): a sign change across the window.
function xBracket(f, x, h) {
  if (!Number.isFinite(x)) return false;
  const lo = f(x - h);
  const hi = f(x + h);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo * hi < 0;
}
const xNumOf = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));

function xVerify(question, answer) {
  const p = question.params;
  const v = p.values;
  if (!v || typeof v !== "object") return false;
  const one = (spec, a, q) => {
    const fn = X_CHECKS[spec.check];
    if (!fn) return false;
    if (q.answerType === "choice") {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || new Set(q.choices).size !== q.choices.length) return false;
      if (!q.choices.includes(String(a))) return false;
      return fn(v, String(a)) === true;
    }
    const x = xNumOf(a);
    if (!Number.isFinite(x)) return false;
    if (spec.int) return Number.isInteger(x) && fn(v, x, 0) === true;
    return fn(v, x, 0.5 * 10 ** -spec.dp) === true;
  };
  if (question.answerType === "multi") {
    if (!Array.isArray(question.parts) || !Array.isArray(p.parts) || p.parts.length !== question.parts.length) return false;
    if (!answer || typeof answer !== "object") return false;
    return p.parts.every((spec, i) => spec.id === question.parts[i].id && one(spec, answer[spec.id], question.parts[i]));
  }
  return one(p, answer, question);
}

// ======================================================================================
// Expert questions. Constants are stated in each prompt, as elsewhere in the module.

const X_PC = 3.26; // ly per parsec (stated)
const X_STARNAMES = ["A faint red dwarf", "A newly catalogued star", "A yellow star in Lyra", "A binary star", "A white dwarf", "A star in the Hyades", "An orange dwarf", "A variable star"];

// Distances, expert 1: parallax -> parsecs -> light-years (a new unit chain).
function xParallax(rng) {
  const who = rng.pick(X_STARNAMES);
  const p = rng.int(20, 800) / 1000;
  const pc = 1 / p;
  const ly = pc * X_PC;
  // Someone who carries the rounded parsec value forward still gets the same light-years.
  if (xRound(xRound(pc, 2) * X_PC, 2) !== xRound(ly, 2)) throw new XRetry();
  const values = { p, k: X_PC };
  return xMulti(
    `${who} shows a parallax angle of ${fix(p, 3)} arcseconds. Distance in parsecs = 1 ÷ parallax in arcseconds, and 1 parsec = ${X_PC} light-years.`,
    [
      xNum("pc", "Parsecs", "How far away is the star, in parsecs?", pc, 2,
        "A smaller parallax means a more distant star: divide 1 by the parallax angle in arcseconds.", "px-pc"),
      xNum("ly", "Light-years", "How far away is it in light-years? (This is also how many years its light has travelled.)", ly, 2,
        `Multiply the distance in parsecs by ${X_PC}.`, "px-ly"),
    ],
    [
      `Parallax: \`d = 1 / ${fix(p, 3)}\` ${xRes(pc, 2, "pc")}.`,
      `Light-years: \`${Number(pc.toPrecision(7))} × ${X_PC}\` ${xRes(ly, 2, "ly")}. In the calculator: \`_k / _p\`.`,
      "A light-year is a distance, but it also says how long the light took: light we see tonight left the star that many years ago.",
    ],
    values,
    [xG("_p", p), xG("_k", X_PC)],
    [
      "Parallax works backwards: the bigger the angle, the closer the star. Distance (pc) = 1 ÷ angle (arcseconds).",
      `Then change units: 1 parsec = ${X_PC} light-years. Carry the unrounded parsec value forward.`,
    ],
  );
}

// Distances, expert 2: the shortest and longest radio delay to another body (orbits in the same plane),
// then a round trip at the longest distance.
function xRadioDelay(rng) {
  let name, a;
  if (rng.next() < 0.4) {
    const pl = rng.pick(PLANETS);
    name = pl.name;
    a = pl.au;
  } else {
    name = rng.pick(BODIES);
    a = rng.int(130, 4000) / 100;
  }
  const dmin = Math.abs(a - 1);
  const dmax = a + 1;
  const tmin = (dmin * AU) / C / 60;
  const tmax = (dmax * AU) / C / 60;
  const hrs = (2 * tmax) / 60;
  if (xRound((2 * xRound(tmax, 2)) / 60, 2) !== xRound(hrs, 2)) throw new XRetry();
  const values = { a };
  const inner = a < 1;
  return xMulti(
    `Earth orbits the Sun at 1 AU and ${name} at ${num(a)} AU. Treat both orbits as circles in the same plane. Radio waves travel at 3.00 × 10⁵ km/s and 1 AU = 1.50 × 10⁸ km.`,
    [
      xNum("short", "Closest", `What is the shortest possible one-way radio delay between Earth and ${name}, in minutes?`, tmin, 2,
        `They are closest when they line up on the same side of the Sun. The gap is then the difference of the two orbit radii.`, "rd-min"),
      xNum("long", "Farthest", "What is the longest possible one-way delay, in minutes?", tmax, 2,
        "They are farthest apart on opposite sides of the Sun: add the two orbit radii.", "rd-max"),
      xNum("round", "Round trip", "At the farthest, how long does a command take to get there and the reply to come back, in hours?", hrs, 2,
        "Twice the one-way delay, turned from minutes into hours.", "rd-rt"),
    ],
    [
      `Closest: same side of the Sun, \`|${num(a)} - 1| = ${num(dmin)}\` AU = ${big(dmin * AU)} km.${inner ? " (It orbits inside Earth's orbit, so the gap is 1 minus its radius.)" : ""}`,
      `Delay: \`${num(dmin)} × 1.5e8 / 3e5 / 60\` ${xRes(tmin, 2, "min")}.`,
      `Farthest: opposite sides, \`${num(a)} + 1 = ${num(dmax)}\` AU. Delay: \`${num(dmax)} × 1.5e8 / 3e5 / 60\` ${xRes(tmax, 2, "min")}.`,
      `Round trip: \`2 × ${Number(tmax.toPrecision(7))} / 60\` ${xRes(hrs, 2, "h")}. In the calculator: \`2 * (_a + 1) * _AU / _c / 3600\`.`,
    ],
    values,
    [xG("_a", a), xG("_AU", AU), xG("_c", C)],
    [
      "Draw the Sun with two circles around it. The distance between the bodies changes as they move: it is smallest on the same side and largest on opposite sides.",
      "Turn the gap in AU into km, then time = distance ÷ speed of light gives seconds. Divide by 60 for minutes.",
      "A round trip covers the distance twice.",
    ],
  );
}

const X_STARS2 = ["Kepler-62", "HD 40307", "Gliese 876", "Tau Ceti", "Wolf 1061", "TOI-700", "Teegarden's Star", "LHS 1140", "HD 69830", "Ross 128"];

// Orbits, expert 1: weigh a star from one planet's orbit, then use T² ∝ a³ for a second planet and work
// backwards to where a one-year orbit would be.
function xStarMass(rng) {
  const star = rng.pick(X_STARS2);
  const a1 = rng.int(5, 300) / 100;
  const M = rng.int(30, 250) / 100;
  const Td = Math.round(Math.sqrt(a1 ** 3 / M) * 365.25);
  let a2;
  do a2 = rng.int(5, 400) / 100; while (Math.abs(a2 - a1) < 0.1);
  if (Td < 2) throw new XRetry();
  const Mx = a1 ** 3 / (Td / 365.25) ** 2;
  const T2 = Td * Math.sqrt((a2 / a1) ** 3);
  const aYr = Math.cbrt(Mx);
  if (xRound(Math.cbrt(xRound(Mx, 2)), 2) !== xRound(aYr, 2)) throw new XRetry();
  const values = { a1, Td, a2, yr: 365.25 };
  return xMulti(
    `A planet orbits the star ${star} at ${num(a1)} AU with a period of ${Td} days. For a planet around a star of mass M (in solar masses), T² = a³ ÷ M with T in years and a in AU. Use 1 year = 365.25 days.`,
    [
      xNum("mass", "Star's mass", `What is the mass of ${star}, in solar masses?`, Mx, 2,
        "Turn the period into years first, then rearrange `T² = a³ ÷ M` to `M = a³ ÷ T²`.", "sm-M"),
      xNum("t2", "Second planet", `A second planet orbits ${star} at ${num(a2)} AU. What is its period, in days? (Compare it with the first planet rather than using your rounded mass.)`, T2, 0,
        "Around the same star, T² ∝ a³: `T2 = T1 × (a2 ÷ a1)^1.5`. Days in, days out.", "sm-T2"),
      xNum("ayear", "One-year orbit", `How far from ${star} would a planet with a period of exactly 1 year orbit, in AU?`, aYr, 2,
        "With T = 1, the law becomes `1 = a³ ÷ M`, so a is the cube root of M.", "sm-a1"),
    ],
    [
      `Period in years: \`${Td} / 365.25\` = ${Number((Td / 365.25).toPrecision(6))} years.`,
      `Mass: \`M = ${num(a1)}³ / ${Number((Td / 365.25).toPrecision(6))}²\` ${xRes(Mx, 2, "solar masses")}. In the calculator: \`_a1^3 / (_T1_days / _yr)^2\`.`,
      `Second planet, same star: \`T2 = ${Td} × (${num(a2)} / ${num(a1)})^1.5\` ${xRes(T2, 0, "days")}.`,
      `One-year orbit: \`a³ = M × 1²\`, so \`a = ∛${Number(Mx.toPrecision(6))}\` ${xRes(aYr, 2, "AU")}. A heavier star pulls harder, so a one-year orbit sits farther out.`,
    ],
    values,
    [xG("_a1", a1), xG("_T1_days", Td), xG("_a2", a2), xG("_yr", 365.25)],
    [
      "The law needs T in years: divide the period in days by 365.25.",
      "Rearrange the law for M. Then, for the second planet, compare the two planets: the star's mass cancels.",
      "For the one-year orbit, put T = 1 into the law and solve for a.",
    ],
  );
}

const X_COMETS = ["Comet Ardent", "Comet Lumen", "Comet Halvard", "Comet Ise", "Comet Taro", "Comet Wenlock", "Comet Brisa", "Comet Okoro", "Comet Mirren", "Comet Quill"];

// Orbits, expert 2: an elliptical orbit. Forwards (perihelion + aphelion -> a -> T) or backwards
// (period + perihelion -> a -> aphelion).
function xComet(rng) {
  const name = rng.pick(X_COMETS);
  const law = "Kepler's third law for things orbiting the Sun: T² = a³, with T in years and a in AU. For an ellipse, a (the semi-major axis) is the average of the closest and farthest distances from the Sun.";
  if (rng.next() < 0.55) {
    const rp = rng.int(30, 300) / 100;
    const ra = rng.int(500, 6000) / 100;
    const a = (rp + ra) / 2;
    const T = a ** 1.5;
    const half = T / 2;
    if (xRound(xRound(a, 2) ** 1.5, 2) !== xRound(T, 2) || xRound(xRound(T, 2) / 2, 2) !== xRound(half, 2)) throw new XRetry();
    const values = { mode: "fwd", rp, ra };
    return xMulti(
      `${name} comes as close as ${num(rp)} AU to the Sun (perihelion) and goes out to ${num(ra)} AU (aphelion). ${law}`,
      [
        xNum("a", "Semi-major axis", "What is the semi-major axis of its orbit, in AU?", a, 2,
          "Average the closest and farthest distances.", "cf-a"),
        xNum("T", "Period", "What is its orbital period, in years?", T, 2,
          "Use `T² = a³`, so `T = √(a³)` = a^1.5.", "cf-T"),
        xNum("half", "Out and back", "How many years does it take to travel from perihelion to aphelion?", half, 2,
          "That is one half of a complete orbit (it moves fast near the Sun and slowly far out, but the two halves take the same time).", "cf-half"),
      ],
      [
        `\`a = (${num(rp)} + ${num(ra)}) / 2\` ${xRes(a, 2, "AU")}.`,
        `\`T = ${num(a)}^1.5\` ${xRes(T, 2, "years")}. In the calculator: \`((_rp + _ra) / 2)^1.5\`.`,
        `Perihelion to aphelion is half an orbit: \`${Number(T.toPrecision(7))} / 2\` ${xRes(half, 2, "years")}.`,
      ],
      values,
      [xG("_rp", rp), xG("_ra", ra)],
      [
        "Kepler's law uses the semi-major axis, not the closest or farthest distance. Find it first.",
        "Then T² = a³ gives the period. From one end of the ellipse to the other is half an orbit.",
      ],
    );
  }
  const T = rng.int(500, 30000) / 100;
  const a = T ** (2 / 3);
  const rp = rng.int(30, Math.max(31, Math.min(300, Math.floor(a * 100) - 10))) / 100;
  const ra = 2 * a - rp;
  if (ra <= rp + 0.1) throw new XRetry();
  if (xRound(2 * xRound(a, 2) - rp, 2) !== xRound(ra, 2)) throw new XRetry();
  const values = { mode: "back", T, rp };
  return xMulti(
    `${name} has an orbital period of ${num(T)} years and comes as close as ${num(rp)} AU to the Sun. ${law}`,
    [
      xNum("a", "Semi-major axis", "What is the semi-major axis of its orbit, in AU?", a, 2,
        "Rearrange `T² = a³`: a is the cube root of T².", "cb-a"),
      xNum("ra", "Aphelion", "How far from the Sun does it get at its farthest, in AU?", ra, 2,
        "The closest and farthest distances add up to 2a.", "cb-ra"),
    ],
    [
      `\`a = ∛(${num(T)}²)\` ${xRes(a, 2, "AU")}. In the calculator: \`(_T^2)^(1/3)\`.`,
      `\`r_far = 2a - r_close = 2 × ${Number(a.toPrecision(7))} - ${num(rp)}\` ${xRes(ra, 2, "AU")}.`,
    ],
    values,
    [xG("_T", T), xG("_rp", rp)],
    [
      "Work backwards: from the period, Kepler's law gives the semi-major axis (a cube root of T²).",
      "The semi-major axis is the average of the closest and farthest distances, so the two add up to 2a.",
    ],
  );
}

const X_FAR = PLANETS.filter((p) => p.au > 9);
const X_BIG = PLANETS.filter((p) => p.diam > 40000);
const X_PLACES = ["a school corridor", "a sports field", "a long beach", "a village street", "a park path", "a playing field"];

// Scale models, expert 1: the farthest planet must fit in a given length. Work out the scale, then see how
// tiny everything else becomes.
function xScaleFit(rng) {
  const far = rng.pick(X_FAR);
  const L = rng.int(50, 400);
  const place = rng.pick(X_PLACES);
  const planet = rng.pick(X_BIG.filter((p) => p !== far));
  const earth = (150 / far.mkm) * L * 100; // cm
  const sun = (SUN_D / (far.mkm * 1e6)) * L * 1000; // mm
  const pd = (planet.diam / (far.mkm * 1e6)) * L * 1000; // mm
  const values = { L, mkm: far.mkm, D: planet.diam };
  return xMulti(
    `A model solar system is laid out along ${place} with ${far.name} (${big(far.mkm)} million km from the Sun) at the far end, exactly ${L} m from the model Sun. Earth is 150 million km from the Sun, the Sun is 1 390 000 km across and ${planet.name} is ${big(planet.diam)} km across. Everything uses the same scale.`,
    [
      xNum("earth", "Earth's distance", "How far from the model Sun is the model Earth, in cm?", earth, 2,
        `Earth is 150 ÷ ${big(far.mkm)} of the way to ${far.name}, so it is that fraction of ${L} m.`, "fit-earth"),
      xNum("sun", "Sun's size", "How wide is the model Sun, in mm?", sun, 2,
        `Same scale: ${L} m stands for ${big(far.mkm)} million km. Turn ${L} m into mm first.`, "fit-sun"),
      xNum("planet", `${planet.name}'s size`, `How wide is the model ${planet.name}, in mm?`, pd, 2,
        "Same scale again, with this planet's diameter.", "fit-planet"),
    ],
    [
      `Scale: ${L} m represents ${big(far.mkm)} million km, so 1 million km is \`${L} / ${far.mkm}\` = ${Number((L / far.mkm).toPrecision(6))} m.`,
      `Earth: \`150 × ${L} / ${far.mkm}\` m, × 100 for cm ${xRes(earth, 2, "cm")}.`,
      `Sun: 1 390 000 km = 1.39 million km. \`1.39 × ${L} / ${far.mkm} × 1000\` ${xRes(sun, 2, "mm")}. In the calculator: \`_Sun / (_far_mkm * 1e6) * _L * 1000\`.`,
      `${planet.name}: \`${planet.diam} / (${far.mkm} × 10⁶) × ${L} × 1000\` ${xRes(pd, 2, "mm")}. Space is mostly empty: the planets become specks.`,
    ],
    values,
    [xG("_L", L), xG("_far_mkm", far.mkm), xG("_Sun", SUN_D), xG("_D", planet.diam)],
    [
      `The far end fixes the scale: ${L} m on the model means ${big(far.mkm)} million km in space.`,
      "Every other length is scaled by the same fraction: real length ÷ real far distance × model length. Keep the units the same top and bottom (million km with million km, km with km).",
      "Convert the model answer into the unit asked for (1 m = 100 cm = 1000 mm).",
    ],
  );
}

const X_BALLS = ["a peppercorn", "a pea", "a marble", "a cherry", "a bead", "a grape", "a hazelnut"];

// Scale models, expert 2: start from the size of the model Earth instead, and work out the distances.
function xScaleEarth(rng) {
  const ball = rng.pick(X_BALLS);
  const d = rng.int(2, 30);
  const target = rng.pick(PLANETS.filter((p) => p.au > 1));
  const k = d / EARTH_D; // mm of model per km
  const earthSun = (AU * k) / 1000; // m
  const sun = (SUN_D * k) / 10; // cm
  const far = (target.mkm * 1e6 * k) / 1000; // m
  const values = { d, mkm: target.mkm };
  return xMulti(
    `In a scale model, Earth (${big(EARTH_D)} km across) is ${ball} ${d} mm wide. On the same scale: the Sun is 1 390 000 km across, Earth is 1.50 × 10⁸ km from the Sun and ${target.name} is ${big(target.mkm)} million km from the Sun.`,
    [
      xNum("au", "Earth to Sun", "How far from the model Sun must the model Earth go, in m?", earthSun, 2,
        `Scale: ${d} mm stands for ${big(EARTH_D)} km. Multiply the real distance by ${d} ÷ ${EARTH_D} to get mm, then ÷ 1000 for m.`, "eb-au"),
      xNum("sun", "Model Sun", "How wide is the model Sun, in cm?", sun, 2,
        "Same scale factor applied to the Sun's diameter; ÷ 10 for cm.", "eb-sun"),
      xNum("far", target.name, `How far from the model Sun is the model ${target.name}, in m?`, far, 2,
        `Million km must be turned into km (× 1 000 000) before using the scale.`, "eb-far"),
    ],
    [
      `Scale factor: \`${d} / ${EARTH_D}\` mm of model per km of space.`,
      `Earth-Sun: \`1.5e8 × ${d} / ${EARTH_D} / 1000\` ${xRes(earthSun, 2, "m")}.`,
      `Sun: \`1390000 × ${d} / ${EARTH_D} / 10\` ${xRes(sun, 2, "cm")}.`,
      `${target.name}: \`${target.mkm} × 10⁶ × ${d} / ${EARTH_D} / 1000\` ${xRes(far, 2, "m")}. In the calculator: \`_far_mkm * 1e6 * _d_mm / _Earth / 1000\`.`,
    ],
    values,
    [xG("_d_mm", d), xG("_Earth", EARTH_D), xG("_far_mkm", target.mkm)],
    [
      `Start from what you know on both sides: ${d} mm on the model is ${big(EARTH_D)} km in space. That gives mm per km.`,
      "Multiply each real length (in km) by that factor to get mm on the model, then convert to m or cm as asked.",
    ],
  );
}

const X_SMALL_ARC = "For small angles, angle in arcminutes = (diameter ÷ distance) × (180 ÷ π) × 60";

// Apparent size, expert 1: will an eclipse be total or annular? Compare the Moon's and Sun's angular sizes.
function xEclipse(rng) {
  const dm = rng.int(3565, 4067) * 100;
  const ds = rng.int(1471, 1521) * 1e5;
  const Dm = 3474;
  const moon = (Dm / dm) * (180 / Math.PI) * 60;
  const sun = (SUN_D / ds) * (180 / Math.PI) * 60;
  if (Math.abs(moon - sun) < 0.05) throw new XRetry();
  const total = moon > sun;
  const values = { dm, ds, Dm, Ds: SUN_D };
  return xMulti(
    `During a solar eclipse the Moon (${big(Dm)} km across) is ${big(dm)} km from Earth and the Sun (1 390 000 km across) is ${big(ds)} km away. ${X_SMALL_ARC}.`,
    [
      xNum("moon", "Moon", "How wide does the Moon look, in arcminutes?", moon, 2, "Diameter ÷ distance gives the angle in radians; × 180 ÷ π for degrees; × 60 for arcminutes.", "ec-moon"),
      xNum("sun", "Sun", "How wide does the Sun look, in arcminutes?", sun, 2, "Same formula with the Sun's diameter and distance.", "ec-sun"),
      xPick("type", "Eclipse", "What kind of eclipse is seen from the centre of the Moon's shadow path?", total ? "Total" : "Annular (a ring of Sun)", ["Total", "Annular (a ring of Sun)"],
        "If the Moon looks bigger than the Sun it can cover it completely. If it looks smaller, a ring of Sun stays visible.", "ec-type"),
    ],
    [
      `Moon: \`${Dm} / ${dm} × 180 / π × 60\` ${xRes(moon, 2, "′")}.`,
      `Sun: \`1390000 / ${ds} × 180 / π × 60\` ${xRes(sun, 2, "′")}. In the calculator: \`_sun_size / _sun_dist * 180 / pi * 60\`.`,
      `The Moon looks ${total ? "bigger" : "smaller"} than the Sun, so the eclipse is **${total ? "total" : "annular"}**. The Moon's distance changes during its orbit, which is why both kinds happen.`,
    ],
    values,
    [xG("_moon_size", Dm), xG("_moon_dist", dm), xG("_sun_size", SUN_D), xG("_sun_dist", ds)],
    [
      "Work out each body's angular size with the small-angle formula, using its own diameter and distance (both in km).",
      "Compare the two angles. The Moon can only hide the whole Sun if it looks at least as big.",
    ],
  );
}

const X_WORLDS = ["Planet Orla", "Planet Tarsis", "Planet Vexa", "a large moon", "Planet Corvin", "a dwarf planet", "Planet Ilda", "a rocky exoplanet", "Planet Brann"];
const X_GRAV = 6.67e-11;

// Apparent size & gravity, expert 2: surface gravity from G, M and R; then work backwards to the radius a
// world of the same mass would need for Earth-like gravity.
function xGravity(rng) {
  const who = rng.pick(X_WORLDS);
  const mm = rng.int(10, 99) / 10;
  const e = rng.int(22, 25);
  const M = mm * 10 ** e;
  const rho = rng.int(20, 60) * 100;
  const Rkm = Math.round(Math.cbrt((3 * M) / (4 * Math.PI * rho)) / 1000 / 10) * 10;
  const g = (X_GRAV * M) / (Rkm * 1000) ** 2;
  if (g < 0.05 || g > 40) throw new XRetry();
  const Rs = Math.sqrt((X_GRAV * M) / 9.8) / 1000;
  const values = { M, R: Rkm, G: X_GRAV };
  return xMulti(
    `${cap(who)} has a mass of ${fix(mm, 1)} × ${pow10(e)} kg and a radius of ${big(Rkm)} km. Surface gravity g = G × M ÷ R², with G = 6.67 × 10⁻¹¹ N m²/kg², M in kg and R in metres.`,
    [
      xNum("g", "Surface gravity", "What is the surface gravity, in N/kg?", g, 2,
        "Turn the radius into metres before squaring it.", "gv-g"),
      xNum("R", "Earth-like radius", "What radius would a world of the same mass need for a surface gravity of 9.8 N/kg, in km?", Rs, 0,
        "Rearrange `g = G × M ÷ R²` for R: `R = √(G × M ÷ g)`. That gives metres; ÷ 1000 for km.", "gv-R"),
    ],
    [
      `R = ${big(Rkm)} km = ${big(Rkm * 1000)} m.`,
      `\`g = 6.67e-11 × ${fix(mm, 1)}e${e} / ${Rkm * 1000}²\` ${xRes(g, 2, "N/kg")}. In the calculator: \`_G * _M / (_R_km * 1000)^2\`.`,
      `Backwards: \`R = √(6.67e-11 × ${fix(mm, 1)}e${e} / 9.8)\` = ${big(Math.round(Rs * 1000))} m ${xRes(Rs, 0, "km")}. ${Rs < Rkm ? "It would have to be squeezed smaller" : "It could be larger"}: gravity at the surface grows as the radius shrinks.`,
    ],
    values,
    [xG("_G", X_GRAV), xG("_M", M), xG("_R_km", Rkm)],
    [
      "Use SI units: mass in kg, radius in metres (km × 1000). Square the radius, not the whole fraction.",
      "For the second part, g is known (9.8 N/kg) and R is the unknown. Multiply both sides by R², divide by g, then take the square root.",
    ],
  );
}

function xGenerate(subtopic, rng) {
  if (subtopic === "distances") return xRun(rng.next() < 0.45 ? xParallax : xRadioDelay, rng);
  if (subtopic === "orbits") return xRun(rng.next() < 0.5 ? xStarMass : xComet, rng);
  if (subtopic === "scale-models") return xRun(rng.next() < 0.5 ? xScaleFit : xScaleEarth, rng);
  if (subtopic === "angles-gravity") return xRun(rng.next() < 0.5 ? xEclipse : xGravity, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Expert checks: each substitutes the candidate into the forward relation, rebuilt from the stated values.
const X_CHECKS = {
  "px-pc": (v, x, h) => xBracket((d) => d * v.p - 1, x, h),
  "px-ly": (v, x, h) => xBracket((ly) => (ly / v.k) * v.p - 1, x, h),
  "rd-min": (v, x, h) => xBracket((t) => t * 60 * 3e5 - Math.abs(v.a - 1) * 1.5e8, x, h),
  "rd-max": (v, x, h) => xBracket((t) => t * 60 * 3e5 - (v.a + 1) * 1.5e8, x, h),
  "rd-rt": (v, x, h) => xBracket((t) => (t * 3600 * 3e5) / 2 - (v.a + 1) * 1.5e8, x, h),
  "sm-M": (v, x, h) => xBracket((M) => M * (v.Td / v.yr) ** 2 - v.a1 ** 3, x, h),
  // T² / a³ is the same for both planets (days and AU throughout).
  "sm-T2": (v, x, h) => xBracket((T) => (T * T) / v.a2 ** 3 - (v.Td * v.Td) / v.a1 ** 3, x, h),
  // One-year orbit: (1 year in days)² / a³ matches the first planet's T² / a³.
  "sm-a1": (v, x, h) => xBracket((a) => (v.yr * v.yr) / v.Td ** 2 - a ** 3 / v.a1 ** 3, x, h),
  "cf-a": (v, x, h) => xBracket((a) => 2 * a - v.rp - v.ra, x, h),
  "cf-T": (v, x, h) => xBracket((T) => T * T - ((v.rp + v.ra) / 2) ** 3, x, h),
  "cf-half": (v, x, h) => xBracket((t) => (2 * t) ** 2 - ((v.rp + v.ra) / 2) ** 3, x, h),
  "cb-a": (v, x, h) => xBracket((a) => a ** 3 - v.T * v.T, x, h),
  "cb-ra": (v, x, h) => xBracket((ra) => ((v.rp + ra) / 2) ** 3 - v.T * v.T, x, h),
  // Model length ÷ real length is the same for every object.
  "fit-earth": (v, x, h) => xBracket((cm) => cm / 100 / (150e6) - v.L / (v.mkm * 1e6), x, h),
  "fit-sun": (v, x, h) => xBracket((mm) => mm / 1000 / 1.39e6 - v.L / (v.mkm * 1e6), x, h),
  "fit-planet": (v, x, h) => xBracket((mm) => mm / 1000 / v.D - v.L / (v.mkm * 1e6), x, h),
  "eb-au": (v, x, h) => xBracket((m) => (m * 1000) / 1.5e8 - v.d / 12700, x, h),
  "eb-sun": (v, x, h) => xBracket((cm) => (cm * 10) / 1.39e6 - v.d / 12700, x, h),
  "eb-far": (v, x, h) => xBracket((m) => (m * 1000) / (v.mkm * 1e6) - v.d / 12700, x, h),
  "ec-moon": (v, x, h) => xBracket((am) => (am / 60) * (Math.PI / 180) * v.dm - v.Dm, x, h),
  "ec-sun": (v, x, h) => xBracket((am) => (am / 60) * (Math.PI / 180) * v.ds - v.Ds, x, h),
  // Total when the Moon covers a wider angle: compare Dm/dm with Ds/ds by cross-multiplying.
  "ec-type": (v, a) => (v.Dm * v.ds > v.Ds * v.dm ? a === "Total" : a === "Annular (a ring of Sun)"),
  "gv-g": (v, x, h) => xBracket((g) => g * (v.R * 1000) ** 2 - v.G * v.M, x, h),
  "gv-R": (v, x, h) => xBracket((R) => 9.8 * (R * 1000) ** 2 - v.G * v.M, x, h),
};
