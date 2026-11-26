// Physicist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   launch-motion   ramp or projectile: trig -> kinematics -> energy / judgement     (Astrophysicist)
//   orbit-signals   light delay, Kepler's third law, orbital speed, signal budget    (Astrophysicist)
//   decay-safety    half-life, activity left, time to a safe level (logs), shipping  (Nuclear Physicist)
//   heating-power   energy to heat a sample, power, current, fuse, identify a metal  (Nuclear Physicist)

// ---------- helpers ----------

// Round half away from zero to d places; the 1e-9 nudge absorbs binary error.
function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// True when n sits within `margin` (in units of the last place) of a rounding half-step.
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fmt = (n, d = 4) => String(roundTo(n, d));
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const rad = (deg) => (deg * Math.PI) / 180;
const G = 10;
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const AU = 1.5e8; // km
const YEAR = 3.15e7; // s
const C = 3e5; // km/s

function numPart(id, label, ask, val, dp, hint) {
  return { id: id.toLowerCase(), label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
// Every key in `keys` must be stable: computing each stage from the rounded earlier answers
// rounds to the same value, and nothing sits on a rounding half-step.
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
const TRY = 20000;
const tooMany = () => { throw new Error("role-physicist: no suitable draw"); };

// ---------- launch-motion ----------

// L1: smooth ramp. a = g sin(angle) -> time -> speed -> kinetic energy.
function genRamp(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const th = med ? 30 : rng.pick([20, 25, 30, 35, 40, 45, 50]);
    const L = med ? rng.pick([2.5, 10, 22.5]) : rng.int(4, 24) / 2;
    const m = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]);
    const obj = rng.pick(["block", "crate", "trolley", "sledge"]);
    const st = (rd) => {
      const a = rd("a", G * Math.sin(rad(th)));
      const t = rd("t", Math.sqrt((2 * L) / a));
      const v = rd("v", a * t);
      const ke = rd("ke", 0.5 * m * v * v);
      return { a, t, v, ke };
    };
    const dps = { a: 2, t: 2, v: 2, ke: 0 };
    const n = TIER_PARTS[tier];
    const use = ["a", "t", "v", "ke"].slice(0, n);
    const sub = Object.fromEntries(use.map((k) => [k, dps[k]]));
    if (!stableOk(st, sub)) continue;
    const r = st((k, v) => v);
    const all = [
      numPart("a", "Acceleration", `Acceleration of the ${obj} down the ramp (m/s²)`, r.a, 2, "Only the part of gravity along the slope accelerates the block: a = g × sin(angle)."),
      numPart("t", "Time", "Time to reach the bottom (s)", r.t, 2, "Starting from rest, L = ½ a t². Rearrange for t."),
      numPart("v", "Speed", "Speed at the bottom (m/s)", r.v, 2, "From rest, v = a × t (or v² = 2aL)."),
      numPart("ke", "Energy", "Kinetic energy at the bottom (J)", r.ke, 0, "KE = ½ m v². It also equals the potential energy lost, m g h, where h = L × sin(angle)."),
    ].slice(0, n);
    const ex = [
      `**Acceleration:** g sin ${th}° = 10 × ${fmt(Math.sin(rad(th)), 4)} = **${fixed(r.a, 2)} m/s²**.`,
      `**Time:** L = ½ a t², so t = √(2L ÷ a) = √(${fmt(2 * L, 2)} ÷ ${fixed(r.a, 2)}) = **${fixed(r.t, 2)} s**.`,
      `**Speed:** v = a t = ${fixed(r.a, 2)} × ${fixed(r.t, 2)} = **${fixed(r.v, 2)} m/s**.`,
      `**Energy:** ½ × ${m} × ${fixed(r.v, 2)}² = **${fixed(r.ke, 0)} J**. Check: m g L sin ${th}° = ${m} × 10 × ${L} × ${fmt(Math.sin(rad(th)), 4)} gives the same.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `You are testing a ramp. A **${m} kg** ${obj} is released from rest at the top of a smooth (frictionless) ramp that makes **${th}°** with the horizontal. The ramp is **${L} m** long. Take g = 10 m/s².`,
      all, ex, "ph-ramp", { th, L, m, n }, [["_angle", th], ["_len", L], ["_mass", m]],
      ["Resolve gravity along the slope first, then use the equations of motion from rest.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// L2: projectile from level ground. vertical speed -> flight time -> range -> max height / wall judgement.
function genProjectile(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const th = med ? 30 : rng.pick([25, 30, 35, 40, 45, 50, 55, 60]);
    const u = med ? rng.pick([10, 20, 30, 40]) : rng.int(12, 40);
    const ball = rng.pick(["ball", "stone", "football", "rock"]);
    const wall = tier === "expert-plus";
    const st = (rd) => {
      const vy = rd("vy", u * Math.sin(rad(th)));
      const T = rd("T", (2 * vy) / G);
      const R = rd("R", u * Math.cos(rad(th)) * T);
      const H = rd("H", (vy * vy) / (2 * G));
      return { vy, T, R, H };
    };
    const n = TIER_PARTS[tier];
    const use = wall ? ["vy", "T", "R"] : ["vy", "T", "R", "H"].slice(0, n);
    const dps = { vy: 2, T: 2, R: 1, H: 2 };
    const sub = Object.fromEntries(use.map((k) => [k, dps[k]]));
    if (!stableOk(st, sub)) continue;
    const r = st((k, v) => v);
    let d = 0, h = 0, clears = false;
    if (wall) {
      d = rng.int(4, 40);
      h = rng.int(1, 12);
      if (d > r.R * 0.9 || d < r.R * 0.2) continue;
      const y = d * Math.tan(rad(th)) - (G * d * d) / (2 * u * u * Math.cos(rad(th)) ** 2);
      if (Math.abs(y - h) < 0.4) continue;
      clears = y > h;
    }
    const all = [
      numPart("vy", "Vertical speed", "Initial vertical component of velocity (m/s)", r.vy, 2, "Resolve the launch speed with trigonometry: the vertical part is u × sin(angle)."),
      numPart("T", "Flight time", "Time of flight until it lands (s)", r.T, 2, "It rises and falls symmetrically: time up = vertical speed ÷ g, and the whole flight is twice that."),
      numPart("R", "Range", "Horizontal range (m)", r.R, 1, "The horizontal speed stays constant at u × cos(angle). Range = horizontal speed × time of flight."),
    ];
    if (wall) all.push(yesNo("clears", "Clears wall?", `Does the ${ball} clear the ${h} m wall ${d} m away?`, clears, "Find the time to reach the wall (distance ÷ horizontal speed), then the height at that moment, and compare it with the wall."));
    else all.push(numPart("H", "Max height", "Maximum height reached (m)", r.H, 2, "At the top the vertical speed is zero: H = vy² ÷ (2g)."));
    const parts = all.slice(0, n);
    const ex = [
      `**Vertical speed:** ${u} × sin ${th}° = **${fixed(r.vy, 2)} m/s**.`,
      `**Flight time:** 2 × ${fixed(r.vy, 2)} ÷ 10 = **${fixed(r.T, 2)} s**.`,
      `**Range:** ${u} × cos ${th}° × ${fixed(r.T, 2)} = **${fixed(r.R, 1)} m**.`,
    ];
    if (wall) {
      const tw = d / (u * Math.cos(rad(th)));
      const y = u * Math.sin(rad(th)) * tw - 0.5 * G * tw * tw;
      ex.push(`**The wall:** it reaches ${d} m after ${d} ÷ (${u} cos ${th}°) = ${fmt(tw, 3)} s, where its height is vy t − ½ g t² = ${fmt(y, 2)} m. That is ${clears ? "above" : "below"} ${h} m, so **${clears ? "Yes" : "No"}**.`);
    } else ex.push(`**Maximum height:** ${fixed(r.vy, 2)}² ÷ 20 = **${fixed(r.H, 2)} m**.`);
    return finish(
      `A ${ball} is launched from level ground at **${u} m/s**, **${th}°** above the horizontal. Ignore air resistance and take g = 10 m/s².${wall ? ` A wall **${h} m** high stands **${d} m** away along the line of flight.` : ""}`,
      parts, ex.slice(0, n).join("\n\n"), "ph-proj", { th, u, d, h, n, wall }, [["_speed", u], ["_angle", th]].concat(wall ? [["_dist", d], ["_wallh", h]] : []),
      ["Split the launch velocity into horizontal and vertical parts; each is a separate, simple motion.", "The horizontal speed is constant; the vertical motion has acceleration g downwards."],
    );
  }
  return tooMany();
}

// L3 (expert+): rough ramp worked backwards from the measured sliding time.
function genRough(rng) {
  for (let i = 0; i < TRY; i++) {
    const th = rng.pick([25, 30, 35, 40, 45]);
    const L = rng.int(3, 15);
    const t = rng.int(10, 40) / 10;
    const m = rng.pick([0.5, 1, 2, 3, 4]);
    const st = (rd) => {
      const a = rd("a", (2 * L) / (t * t));
      const mu = rd("mu", (G * Math.sin(rad(th)) - a) / (G * Math.cos(rad(th))));
      const f = rd("f", mu * m * G * Math.cos(rad(th)));
      return { a, mu, f };
    };
    const dps = { a: 2, mu: 2, f: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (r.mu < 0.06 || r.mu > 0.5 || r.a < 0.3) continue;
    const slides = 2 * r.mu < Math.tan(rad(th));
    if (Math.abs(2 * r.mu - Math.tan(rad(th))) < 0.06) continue;
    const parts = [
      numPart("a", "Acceleration", "Acceleration down the ramp (m/s²)", r.a, 2, "The block starts from rest and covers L in the measured time: L = ½ a t². Solve for a."),
      numPart("mu", "Friction coefficient", "Coefficient of friction μ", r.mu, 2, "Along the slope: m a = m g sin(angle) − μ m g cos(angle). The mass cancels."),
      numPart("f", "Friction force", "Friction force on the block (N)", r.f, 1, "Friction force = μ × normal force, and the normal force is m g cos(angle)."),
      yesNo("slides", "Still slides?", "If the surface were twice as rough (2μ), would the block still slide down on its own?", slides, "It slides only if the pull along the slope, g sin(angle), beats the maximum friction, 2μ g cos(angle). Compare 2μ with tan(angle)."),
    ];
    const ex = [
      `**Acceleration:** L = ½ a t², so a = 2L ÷ t² = ${2 * L} ÷ ${fmt(t * t, 2)} = **${fixed(r.a, 2)} m/s²**.`,
      `**Friction coefficient:** m a = m g sin ${th}° − μ m g cos ${th}°, so μ = (10 sin ${th}° − ${fixed(r.a, 2)}) ÷ (10 cos ${th}°) = **${fixed(r.mu, 2)}**.`,
      `**Friction force:** ${fixed(r.mu, 2)} × ${m} × 10 × cos ${th}° = **${fixed(r.f, 1)} N**.`,
      `**Rougher surface:** it slides only if 2μ < tan ${th}° = ${fmt(Math.tan(rad(th)), 3)}. Here 2μ = ${fmt(2 * r.mu, 2)}, so **${slides ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A **${m} kg** block is released from rest at the top of a **${L} m** ramp inclined at **${th}°** to the horizontal. The ramp is rough, and the block takes **${t} s** to reach the bottom. Take g = 10 m/s².`,
      parts, ex, "ph-rough", { th, L, t, m }, [["_angle", th], ["_len", L], ["_time", t], ["_mass", m]],
      ["Work backwards: the measured time gives the acceleration, and the acceleration gives the friction.", "A smooth ramp would give g sin(angle); the shortfall is due to friction."],
    );
  }
  return tooMany();
}

// ---------- orbit-signals ----------

// O1: light delay to a probe -> round trip -> acknowledgement time -> window decision.
function genLightDelay(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const D = med ? rng.int(10, 120) * 3 : rng.int(30, 400); // million km
    const P = rng.pick([30, 60, 90, 120, 180, 240]);
    const st = (rd) => {
      const t1 = rd("t1", (D * 1e6) / C);
      const rt = rd("rt", (2 * t1) / 60);
      const tot = rd("tot", rt + P / 60);
      return { t1, rt, tot };
    };
    const dps = { t1: 1, rt: 1, tot: 1 };
    const n = TIER_PARTS[tier];
    const use = ["t1", "rt", "tot"].slice(0, Math.min(n, 3));
    if (!stableOk(st, Object.fromEntries(use.map((k) => [k, dps[k]])))) continue;
    const r = st((k, v) => v);
    const W = Math.round(r.tot + rng.pick([-1, 1]) * rng.int(2, 8));
    if (W < 2 || Math.abs(W - r.tot) < 1) continue;
    const ok = r.tot <= W;
    const all = [
      numPart("t1", "One-way time", "Time for a radio signal to reach the probe (s)", r.t1, 1, "Radio travels at the speed of light. Convert the distance to km, then time = distance ÷ speed."),
      numPart("rt", "Round trip", "Round-trip signal time (minutes)", r.rt, 1, "There and back is twice the one-way time. Divide seconds by 60 for minutes."),
      numPart("tot", "Command delay", `Time from sending a command to getting its acknowledgement, if the probe takes ${P} s to process it (minutes)`, r.tot, 1, "Add the probe's processing time, converted to minutes, to the round-trip time."),
      yesNo("window", "In window?", `Does the acknowledgement arrive within ${W} minutes?`, ok, "Compare your command delay with the window."),
    ].slice(0, n);
    const ex = [
      `**One-way time:** ${D} × 10⁶ km ÷ 3.0×10⁵ km/s = **${fixed(r.t1, 1)} s**.`,
      `**Round trip:** 2 × ${fixed(r.t1, 1)} ÷ 60 = **${fixed(r.rt, 1)} min**.`,
      `**Command delay:** ${fixed(r.rt, 1)} + ${P} ÷ 60 = **${fixed(r.tot, 1)} min**.`,
      `**Window:** ${fixed(r.tot, 1)} is ${ok ? "within" : "more than"} ${W}, so **${ok ? "Yes" : "No"}**.`,
    ].slice(0, n).join("\n\n");
    return finish(
      `A space probe is **${D} million km** from Earth. Radio signals travel at the speed of light, c = 3.0×10⁵ km/s. Mission control sends a command, and the probe takes **${P} s** to process it before it replies at once.${n === 4 ? ` Operations allow **${W} minutes** for the acknowledgement.` : ""}`,
      all, ex, "ph-light", { D, P, W, n }, [["_dist", D], ["_c", C], ["_proc", P]],
      ["Convert units first: 1 million km = 10⁶ km.", "Distance ÷ speed gives seconds when the speed is in km/s."],
    );
  }
  return tooMany();
}

// O2: Kepler's third law (Sun-like star) -> period -> speed -> signal time -> orbits completed.
function genKepler(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const a = med ? rng.pick([4, 9, 16, 25]) : rng.int(15, 300) / 10;
    const N = rng.pick([40, 60, 80, 100]);
    const st = (rd) => {
      const T = rd("T", a ** 1.5);
      const v = rd("v", (2 * Math.PI * a * AU) / (T * YEAR));
      const lt = rd("lt", (a * AU) / C / 60);
      const orb = rd("orb", N / T);
      return { T, v, lt, orb };
    };
    const dps = { T: 2, v: 1, lt: 1, orb: 1 };
    const n = TIER_PARTS[tier];
    const order = med ? ["T", "v"] : tier === "hard" ? ["T", "lt", "v"] : ["T", "v", "lt", "orb"];
    if (!stableOk(st, Object.fromEntries(order.map((k) => [k, dps[k]])))) continue;
    const r = st((k, v) => v);
    const spec = {
      T: numPart("T", "Period", "Orbital period (years)", r.T, 2, "Kepler's third law for a Sun-like star: T² = a³, with T in years and a in AU."),
      v: numPart("v", "Speed", "Average orbital speed (km/s), treating the orbit as a circle", r.v, 1, "Speed = circumference ÷ period. Convert AU to km and years to seconds first."),
      lt: numPart("lt", "Light time", "Time for light to travel from the star to the planet (minutes)", r.lt, 1, "Distance in km ÷ the speed of light in km/s gives seconds. Divide by 60 for minutes."),
      orb: numPart("orb", "Orbits", `Number of orbits completed in ${N} years`, r.orb, 1, "Divide the time by the period."),
    };
    const parts = order.map((k) => spec[k]);
    const txt = {
      T: `**Period:** T² = a³, so T = ${a}^1.5 = **${fixed(r.T, 2)} years**.`,
      v: `**Speed:** 2π × ${a} × 1.5×10⁸ km ÷ (${fixed(r.T, 2)} × 3.15×10⁷ s) = **${fixed(r.v, 1)} km/s**.`,
      lt: `**Light time:** ${a} × 1.5×10⁸ ÷ 3.0×10⁵ = ${fmt((a * AU) / C, 1)} s = **${fixed(r.lt, 1)} min**.`,
      orb: `**Orbits:** ${N} ÷ ${fixed(r.T, 2)} = **${fixed(r.orb, 1)}**.`,
    };
    return finish(
      `A planet orbits a Sun-like star at a distance of **${a} AU** on a circular orbit. Use 1 AU = 1.5×10⁸ km, 1 year = 3.15×10⁷ s, c = 3.0×10⁵ km/s, and Kepler's third law T² = a³ (T in years, a in AU).`,
      parts, order.map((k) => txt[k]).join("\n\n"), "ph-kepler", { a, N, order }, [["_a", a], ["_au", AU], ["_year", YEAR], ["_c", C]].concat(order.includes("orb") ? [["_years", N]] : []),
      ["Kepler's law links the size of the orbit to its period; everything else follows from distance and time.", "Mind the units: AU and years for Kepler, km and seconds for speeds."],
    );
  }
  return tooMany();
}

// O3 (expert+): from an observed period and the star's mass, back to the orbit, speed and signal budget.
function genStarMass(rng) {
  for (let i = 0; i < TRY; i++) {
    const M = rng.pick([0.5, 0.6, 0.8, 1.2, 1.5, 2, 2.5, 3, 4]);
    const T = rng.int(2, 40);
    const B = rng.pick([20, 30, 40, 60]);
    const st = (rd) => {
      const a = rd("a", Math.cbrt(M * T * T));
      const v = rd("v", (2 * Math.PI * a * AU) / (T * YEAR));
      const rt = rd("rt", (2 * a * AU) / C / 60);
      return { a, v, rt };
    };
    const dps = { a: 2, v: 1, rt: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    if (Math.abs(r.rt - B) < 2.5) continue;
    const ok = r.rt <= B;
    const parts = [
      numPart("a", "Orbit size", "Orbital radius (AU)", r.a, 2, "For a star of M solar masses, T² = a³ ÷ M. Rearrange for a: a³ = M T²."),
      numPart("v", "Speed", "Orbital speed (km/s), treating the orbit as a circle", r.v, 1, "Speed = 2π a ÷ T, with a in km (1 AU = 1.5×10⁸ km) and T in seconds."),
      numPart("rt", "Signal time", "Round-trip signal time between the planet and the star (minutes)", r.rt, 1, "Distance in km ÷ c gives one-way seconds. Double it, then divide by 60."),
      yesNo("budget", "Within budget?", `A relay needs the round trip to take at most ${B} minutes. Is that met?`, ok, "Compare your round-trip time with the limit."),
    ];
    const ex = [
      `**Orbit size:** a³ = M T² = ${M} × ${T}² = ${fmt(M * T * T, 2)}, so a = **${fixed(r.a, 2)} AU**.`,
      `**Speed:** 2π × ${fixed(r.a, 2)} × 1.5×10⁸ ÷ (${T} × 3.15×10⁷) = **${fixed(r.v, 1)} km/s**.`,
      `**Signal time:** 2 × ${fixed(r.a, 2)} × 1.5×10⁸ ÷ 3.0×10⁵ ÷ 60 = **${fixed(r.rt, 1)} min**.`,
      `**Budget:** ${fixed(r.rt, 1)} is ${ok ? "within" : "more than"} ${B}, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A planet is seen to orbit a star of **${M} solar masses** once every **${T} years** on a circular orbit. For such a star, Kepler's third law is T² = a³ ÷ M (T in years, a in AU, M in solar masses). Use 1 AU = 1.5×10⁸ km, 1 year = 3.15×10⁷ s and c = 3.0×10⁵ km/s.`,
      parts, ex, "ph-starmass", { M, T, B }, [["_mass", M], ["_period", T], ["_au", AU], ["_year", YEAR], ["_c", C], ["_limit", B]],
      ["Work backwards from the period: the law gives the orbit size, and the orbit size gives everything else.", "The star's mass is not 1, so keep M in Kepler's law."],
    );
  }
  return tooMany();
}

// ---------- decay-safety ----------

const ISOTOPES = ["a medical tracer", "a calibration source", "an industrial gauge source", "a research sample"];

// D1: half-life -> activity left -> time to the safe level -> handling decision.
function genDecay(rng, tier) {
  const what = rng.pick(ISOTOPES);
  if (tier === "medium") {
    const S = rng.pick([0.5, 1, 2, 5]);
    const m = rng.int(3, 6);
    const k = rng.int(1, m - 1);
    const T = rng.pick([2, 3, 4, 6, 8, 12, 24]);
    const A0 = S * 2 ** m;
    const left = A0 / 2 ** k;
    const parts = [
      { ...numPart("left", "Activity left", `Activity of the source after ${k * T} hours (MBq)`, left, 1, "Count how many half-lives fit in the waiting time, then halve the activity that many times.") },
      numPart("ts", "Time to safe", "Time until the activity first falls to the safe limit (hours)", m * T, 1, "The limit is reached after some whole number of half-lives. Work out how many halvings take the starting activity down to the limit."),
    ];
    const ex = [
      `**Activity left:** ${k * T} h ÷ ${T} h = ${k} half-lives, so ${A0} ÷ 2^${k} = **${fixed(left, 1)} MBq**.`,
      `**Time to safe:** ${A0} → ${S} MBq is ${A0} ÷ ${S} = 2^${m}, so ${m} half-lives: ${m} × ${T} = **${m * T} h**.`,
    ].join("\n\n");
    return finish(
      `You handle ${what} with an activity of **${A0} MBq** and a half-life of **${T} hours**. It is safe to handle when its activity is at most **${S} MBq**.`,
      parts, ex, "ph-decay-m", { A0, T, S, k }, [["_a0", A0], ["_half", T], ["_limit", S]],
      ["Each half-life halves the activity.", "Compare the starting activity with the limit as a power of 2."],
    );
  }
  for (let i = 0; i < TRY; i++) {
    const T = rng.pick([2, 4, 6, 8, 12]);
    const A0 = rng.int(40, 200);
    const S = rng.pick([1, 2, 5]);
    const t = rng.int(3, 30);
    const st = (rd) => {
      const lam = rd("lam", Math.LN2 / T);
      const A = rd("A", A0 * Math.exp(-lam * t));
      const ts = rd("ts", Math.log(A0 / S) / lam);
      return { lam, A, ts };
    };
    const dps = { lam: 4, A: 2, ts: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const W = Math.round(r.ts + rng.pick([-1, 1]) * rng.int(2, 10));
    if (W < 1 || Math.abs(W - r.ts) < 1) continue;
    const ok = W >= r.ts;
    const all = [
      numPart("lam", "Decay constant", "Decay constant λ (per hour)", r.lam, 4, "λ = ln 2 ÷ half-life."),
      numPart("A", "Activity left", `Activity after ${t} hours (MBq)`, r.A, 2, "A = A₀ × e^(−λt)."),
      numPart("ts", "Time to safe", "Time until the activity first falls to the safe limit (hours)", r.ts, 1, "Set A₀ e^(−λt) equal to the limit and take natural logs: t = ln(A₀ ÷ limit) ÷ λ."),
      yesNo("ok", "Safe after wait?", `Is the source safe to handle after waiting ${W} hours?`, ok, "Compare the waiting time with the time to reach the limit."),
    ].slice(0, TIER_PARTS[tier]);
    const ex = [
      `**Decay constant:** ln 2 ÷ ${T} = **${fixed(r.lam, 4)} per hour**.`,
      `**Activity left:** ${A0} × e^(−${fixed(r.lam, 4)} × ${t}) = **${fixed(r.A, 2)} MBq**.`,
      `**Time to safe:** ln(${A0} ÷ ${S}) ÷ ${fixed(r.lam, 4)} = ${fmt(Math.log(A0 / S), 4)} ÷ ${fixed(r.lam, 4)} = **${fixed(r.ts, 1)} h**.`,
      `**Decision:** ${W} h is ${ok ? "at least" : "less than"} ${fixed(r.ts, 1)} h, so **${ok ? "Yes" : "No"}**.`,
    ].slice(0, TIER_PARTS[tier]).join("\n\n");
    return finish(
      `You handle ${what} with an activity of **${A0} MBq** and a half-life of **${T} hours**. It is safe to handle when its activity is at most **${S} MBq**.${tier === "expert" ? ` The lab plans to wait **${W} hours**.` : ""}`,
      all, ex, "ph-decay", { A0, T, S, t, W }, [["_a0", A0], ["_half", T], ["_limit", S], ["_t", t]],
      ["Find the decay constant first; the other answers use it.", "Logs undo the exponential: ln(e^x) = x."],
    );
  }
  return tooMany();
}

// D2 (expert+): half-life found from two readings, then the starting activity and a shipping decision.
function genDecayBack(rng) {
  const what = rng.pick(ISOTOPES);
  for (let i = 0; i < TRY; i++) {
    const T0 = rng.pick([5, 6, 8, 10, 12, 18]);
    const A00 = rng.int(300, 900);
    const t1 = rng.int(2, 8);
    const t2 = t1 + rng.int(T0 >> 1, 2 * T0);
    const A1 = roundTo(A00 * 0.5 ** (t1 / T0), 1);
    const A2 = roundTo(A00 * 0.5 ** (t2 / T0), 1);
    const S = rng.pick([1, 2, 5]);
    const Dd = rng.int(10, 120);
    const st = (rd) => {
      const T = rd("T", ((t2 - t1) * Math.LN2) / Math.log(A1 / A2));
      const A0 = rd("A0", A1 * Math.exp((Math.LN2 * t1) / T));
      const ts = rd("ts", (T * Math.log(A0 / S)) / Math.LN2);
      return { T, A0, ts };
    };
    const dps = { T: 1, A0: 0, ts: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const onArrival = r.A0 * 0.5 ** (Dd / r.T);
    if (Math.abs(onArrival / S - 1) < 0.15) continue;
    const below = onArrival <= S;
    const cols = ["Courier", "Activity on arrival"];
    const choices = [["Ship", "Below the limit"], ["Ship", "Above the limit"], ["Hold", "Below the limit"], ["Hold", "Above the limit"]];
    const parts = [
      numPart("T", "Half-life", "Half-life of the source (hours)", r.T, 1, "The activity fell from the first reading to the second in a known time. Use A₂ = A₁ × (½)^(Δt ÷ half-life) and take logs."),
      numPart("A0", "Initial activity", "Activity when the source was made (MBq)", r.A0, 0, "Run the decay backwards from the first reading, taken t₁ hours after production."),
      numPart("ts", "Time to safe", "Time after production until the activity first falls to the safe limit (hours)", r.ts, 0, "Find how many half-lives take the initial activity down to the limit, with logs, then multiply by the half-life."),
      { id: "ship", label: "Shipping", ask: `The courier delivers ${Dd} hours after production. Shipping is allowed only if the activity on arrival is at most ${S} MBq. What is the decision?`, answerType: "choice", choiceCols: cols, choices, answer: below ? choices[0] : choices[3], hint: `Find the activity ${Dd} hours after production (or compare ${Dd} with the time to reach the limit), then compare it with the limit.` },
    ];
    const ex = [
      `**Half-life:** the activity fell from ${A1} to ${A2} MBq in ${t2 - t1} h: T = ${t2 - t1} × ln 2 ÷ ln(${A1} ÷ ${A2}) = **${fixed(r.T, 1)} h**.`,
      `**Initial activity:** ${A1} × 2^(${t1} ÷ ${fixed(r.T, 1)}) = **${fixed(r.A0, 0)} MBq**.`,
      `**Time to safe:** ${fixed(r.T, 1)} × log₂(${fixed(r.A0, 0)} ÷ ${S}) = **${fixed(r.ts, 0)} h**.`,
      `**Shipping:** at ${Dd} h the activity is about ${fmt(onArrival, 2)} MBq, which is ${below ? "below" : "above"} ${S} MBq, so **${below ? "Ship" : "Hold"}**.`,
    ].join("\n\n");
    return finish(
      `You receive ${what} whose activity is measured twice: **${A1} MBq** at **${t1} hours** after it was made, and **${A2} MBq** at **${t2} hours** after it was made. Its safe limit for shipping is **${S} MBq**.`,
      parts, ex, "ph-decayback", { A1, A2, t1, t2, S, Dd }, [["_a1", A1], ["_a2", A2], ["_t1", t1], ["_t2", t2], ["_limit", S], ["_deliver", Dd]],
      ["Work backwards: two readings give the half-life, and the half-life lets you extend the decay in either direction.", "A ratio of activities is a power of ½: take logs to bring the exponent down."],
    );
  }
  return tooMany();
}

// ---------- heating-power ----------

const FUSES = [3, 5, 13];
const METALS = [["Copper", 385], ["Aluminium", 900], ["Iron", 450], ["Lead", 130]];

// H1: heat water with an electric heater -> energy -> time -> current -> fuse.
function genKettle(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const med = tier === "medium";
    const m = rng.pick([0.5, 1, 1.5, 2]);
    const T1 = rng.int(15, 25);
    const dT = med ? rng.int(5, 30) * 2 : rng.int(20, 70);
    const P = rng.pick([500, 1000, 1500, 2000, 2500]);
    const eta = tier === "expert" ? rng.pick([60, 70, 80, 90]) : 100;
    const V = 230;
    const st = (rd) => {
      const Q = rd("Q", (m * 4200 * dT) / 1000);
      const ts = rd("ts", (Q * 1000) / P);
      const tm = rd("tm", (Q * 1000) / P / 60);
      const I = rd("I", P / V);
      const te = rd("te", (Q * 1000) / ((eta / 100) * P) / 60);
      return { Q, ts, tm, I, te };
    };
    const dps = { Q: 1, ts: 0, tm: 1, I: 2, te: 1 };
    const order = med ? ["Q", "ts"] : tier === "hard" ? ["Q", "tm", "I"] : ["I", "Q", "te"];
    if (!stableOk(st, Object.fromEntries(order.map((k) => [k, dps[k]])))) continue;
    const r = st((k, v) => v);
    const fuse = FUSES.find((f) => f > r.I);
    if (!fuse || FUSES.some((f) => Math.abs(f - r.I) < 0.15)) continue;
    const spec = {
      Q: numPart("Q", "Energy", "Energy needed to heat the water (kJ)", r.Q, 1, "Q = m × c × ΔT, with c = 4200 J/kg°C. Divide by 1000 for kJ."),
      ts: numPart("ts", "Time", "Time the heater takes (s)", r.ts, 0, "Power is energy per second: time = energy ÷ power. Use joules, not kJ."),
      tm: numPart("tm", "Time", "Time the heater takes (minutes)", r.tm, 1, "time = energy (J) ÷ power (W) gives seconds; divide by 60 for minutes."),
      I: numPart("I", "Current", `Current drawn from the ${V} V supply (A)`, r.I, 2, "Electrical power P = V × I, so I = P ÷ V."),
      te: numPart("te", "Time (losses)", `Time needed when only ${eta}% of the electrical energy reaches the water (minutes)`, r.te, 1, "Useful power = efficiency × P. Time = energy needed ÷ useful power, then convert to minutes."),
    };
    const parts = order.map((k) => spec[k]);
    if (tier === "expert") parts.push({ id: "fuse", label: "Fuse", ask: `Which is the smallest standard fuse (3 A, 5 A or 13 A) rated above the current?`, answerType: "choice", answer: `${fuse} A`, choices: FUSES.map((f) => `${f} A`), hint: "The fuse must be rated higher than the current drawn. Use your current from the earlier part." });
    const txt = {
      Q: `**Energy:** ${m} × 4200 × ${dT} = ${m * 4200 * dT} J = **${fixed(r.Q, 1)} kJ**.`,
      ts: `**Time:** ${fixed(r.Q, 1)} × 1000 ÷ ${P} = **${fixed(r.ts, 0)} s**.`,
      tm: `**Time:** ${fixed(r.Q, 1)} × 1000 ÷ ${P} ÷ 60 = **${fixed(r.tm, 1)} min**.`,
      I: `**Current:** ${P} ÷ ${V} = **${fixed(r.I, 2)} A**.`,
      te: `**Time with losses:** useful power = ${eta / 100} × ${P} = ${(eta / 100) * P} W, so ${fixed(r.Q, 1)} × 1000 ÷ ${(eta / 100) * P} ÷ 60 = **${fixed(r.te, 1)} min**.`,
    };
    const ex = order.map((k) => txt[k]);
    if (tier === "expert") ex.push(`**Fuse:** ${fixed(r.I, 2)} A is above ${FUSES[FUSES.indexOf(fuse) - 1] ?? 0} A and below ${fuse} A, so **${fuse} A**.`);
    return finish(
      `An immersion heater rated **${P} W** heats **${m} kg** of water from **${T1} °C** to **${T1 + dT} °C**. The specific heat capacity of water is 4200 J/kg°C and the supply is ${V} V.${tier === "expert" ? ` Only **${eta}%** of the electrical energy reaches the water.` : " Assume all the electrical energy goes into the water."}`,
      parts, ex.join("\n\n"), "ph-kettle", { m, dT, P, eta, V, order, tier }, [["_mass", m], ["_rise", dT], ["_power", P], ["_volts", V]].concat(tier === "expert" ? [["_eff", eta]] : []),
      ["Energy first, then power turns energy into time.", "Keep joules and watts together, and convert to kJ or minutes only for the answer."],
    );
  }
  return tooMany();
}

// H2 (expert+): identify a metal from its heating data, then plan a further rise and cost it.
function genMetal(rng) {
  for (let i = 0; i < TRY; i++) {
    const [name, c] = rng.pick(METALS);
    const m = rng.pick([0.5, 1, 1.5, 2]);
    const P = rng.pick([500, 750, 1000, 1500, 2000]);
    const eta = rng.pick([70, 80, 90]);
    const dT1 = rng.int(10, 60);
    const dT2 = rng.int(10, 40);
    const rate = rng.pick([20, 25, 30]);
    const t1 = roundTo((m * c * dT1) / ((eta / 100) * P) / 60, 1);
    if (t1 < 1.5 || t1 > 14) continue;
    const st = (rd) => {
      const cc = rd("c", ((eta / 100) * P * t1 * 60) / (m * dT1));
      const t2 = rd("t2", (m * c * dT2) / ((eta / 100) * P) / 60);
      const cost = rd("cost", (P / 1000) * ((t1 + t2) / 60) * rate);
      return { c: cc, t2, cost };
    };
    const dps = { c: 0, t2: 1, cost: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const near = METALS.map(([nm, cv]) => [nm, Math.abs(cv - r.c) / cv]).sort((x, y) => x[1] - y[1]);
    if (near[0][0] !== name || near[1][1] < 0.3) continue;
    const parts = [
      numPart("c", "Specific heat", "Specific heat capacity of the block (J/kg°C)", r.c, 0, "Energy supplied to the block = efficiency × power × time. Then c = energy ÷ (m × ΔT)."),
      { id: "metal", label: "Metal", ask: "Which metal in the table is the block most likely made of?", answerType: "choice", answer: name, choices: METALS.map((x) => x[0]), hint: "Pick the metal whose tabulated value is closest to your calculated specific heat capacity." },
      numPart("t2", "Further heating", `Time to raise its temperature by a further ${dT2} °C (minutes), using the tabulated value for the metal you chose`, r.t2, 1, "Energy = m × c × ΔT with the table's c, then divide by the useful power (efficiency × P) and convert to minutes."),
      numPart("cost", "Cost", `Cost of running the heater for the whole time, at ${rate} cents per kWh (cents)`, r.cost, 0, "Energy in kWh = power in kW × time in hours. The whole time is the first heating plus the further heating."),
    ];
    const ex = [
      `**Specific heat:** energy = ${eta / 100} × ${P} × ${fmt(t1 * 60, 1)} s = ${fmt((eta / 100) * P * t1 * 60, 0)} J, so c = ${fmt((eta / 100) * P * t1 * 60, 0)} ÷ (${m} × ${dT1}) = **${fixed(r.c, 0)} J/kg°C**.`,
      `**Metal:** the closest table value is ${name} (${c}), so **${name}**.`,
      `**Further heating:** ${m} × ${c} × ${dT2} ÷ (${eta / 100} × ${P}) = ${fmt((m * c * dT2) / ((eta / 100) * P), 1)} s = **${fixed(r.t2, 1)} min**.`,
      `**Cost:** ${P / 1000} kW × (${t1} + ${fixed(r.t2, 1)}) ÷ 60 h × ${rate} = **${fixed(r.cost, 0)} cents**.`,
    ].join("\n\n");
    return finish(
      `A **${m} kg** block of an unknown metal is heated by a **${P} W** electric heater. **${eta}%** of the electrical energy reaches the block, and its temperature rises by **${dT1} °C** in **${t1} minutes**. Specific heat capacities (J/kg°C): ${METALS.map(([nm, cv]) => `${nm} ${cv}`).join(", ")}.`,
      parts, ex, "ph-metal", { m, P, eta, dT1, dT2, t1, rate }, [["_mass", m], ["_power", P], ["_eff", eta], ["_rise", dT1], ["_mins", t1], ["_rise2", dT2], ["_rate", rate]],
      ["Work backwards from the heating data to the specific heat capacity, then use the table to identify the metal.", "After identifying the metal, use its tabulated value rather than your rounded calculation."],
    );
  }
  return tooMany();
}

// ---------- dispatch ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  const coin = rng.next() < 0.5;
  if (subtopic === "launch-motion") return plus ? (coin ? genProjectile(rng, difficulty) : genRough(rng)) : coin ? genRamp(rng, difficulty) : genProjectile(rng, difficulty);
  if (subtopic === "orbit-signals") return plus ? genStarMass(rng) : coin ? genLightDelay(rng, difficulty) : genKepler(rng, difficulty);
  if (subtopic === "decay-safety") return plus ? genDecayBack(rng) : genDecay(rng, difficulty);
  if (subtopic === "heating-power") return plus ? genMetal(rng) : genKettle(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route where one exists. A number
// must be within its rounding tolerance of the true value; a choice must match exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");

const ALT = {
  "ph-ramp": (p) => {
    const h = p.L * Math.sin(rad(p.th)); // energy route
    const v = Math.sqrt(2 * G * h);
    return { a: (v * v) / (2 * p.L), t: (2 * p.L) / v, v, ke: p.m * G * h };
  },
  "ph-proj": (p) => {
    const ux = p.u * Math.cos(rad(p.th));
    const uy = p.u * Math.cos(rad(90 - p.th));
    const out = { vy: uy, T: (uy + Math.sqrt(uy * uy)) / G, R: (p.u * p.u * Math.sin(rad(2 * p.th))) / G, H: (p.u * Math.sin(rad(p.th))) ** 2 / (2 * G) };
    if (p.wall) {
      const y = p.d * Math.tan(rad(p.th)) - (G * p.d * p.d) / (2 * ux * ux);
      out.clears = YN(y > p.h);
    }
    return out;
  },
  "ph-rough": (p) => {
    const mu = Math.tan(rad(p.th)) - (2 * p.L) / (G * p.t * p.t * Math.cos(rad(p.th))); // work-energy route
    return { a: (2 * p.L) / (p.t * p.t), mu, f: mu * p.m * G * Math.cos(rad(p.th)), slides: YN(2 * mu < Math.tan(rad(p.th))) };
  },
  "ph-light": (p) => {
    const t1 = p.D / 0.3; // distance in 10⁶ km over c in 10⁶ km/s
    const tot = t1 / 30 + p.P / 60;
    return { t1, rt: t1 / 30, tot, window: YN(tot <= p.W) };
  },
  "ph-kepler": (p) => {
    const T = Math.exp(1.5 * Math.log(p.a));
    return { T, v: (2 * Math.PI * p.a * AU) / (T * YEAR), lt: (p.a * AU) / C / 60, orb: p.N / T };
  },
  "ph-starmass": (p) => {
    const a = Math.exp(Math.log(p.M * p.T * p.T) / 3);
    const vEarth = (2 * Math.PI * AU) / YEAR; // speed of a 1 AU, 1 year orbit
    const rt = (2 * a * AU) / C / 60;
    return { a, v: vEarth * Math.sqrt(p.M / a), rt, budget: YN(rt <= p.B) };
  },
  "ph-decay-m": (p) => {
    const m = Math.round(Math.log2(p.A0 / p.S));
    return { left: p.A0 / 2 ** p.k, ts: m * p.T };
  },
  "ph-decay": (p) => ({
    lam: -Math.log(0.5) / p.T,
    A: p.A0 * 0.5 ** (p.t / p.T),
    ts: p.T * Math.log2(p.A0 / p.S),
    ok: YN(p.A0 * 0.5 ** (p.W / p.T) <= p.S),
  }),
  "ph-decayback": (p) => {
    const T = ((p.t2 - p.t1) * Math.log(2)) / Math.log(p.A1 / p.A2);
    const A0 = p.A1 * 2 ** (p.t1 / T);
    const arrive = A0 * 0.5 ** (p.Dd / T);
    return { T, A0, ts: T * Math.log2(A0 / p.S), ship: arrive <= p.S ? "Ship | Below the limit" : "Hold | Above the limit" };
  },
  "ph-kettle": (p) => {
    const Q = (p.m * 4200 * p.dT) / 1000;
    const R = (p.V * p.V) / p.P; // current via resistance
    const I = p.V / R;
    return { Q, ts: Q * 1000 / p.P, tm: Q * 1000 / p.P / 60, I, te: (Q * 1000) / (p.P * p.eta / 100) / 60, fuse: `${FUSES.find((f) => f > I)} A` };
  },
  "ph-metal": (p) => {
    const c = ((p.eta / 100) * p.P * p.t1 * 60) / (p.m * p.dT1);
    const best = METALS.slice().sort((x, y) => Math.abs(x[1] - c) - Math.abs(y[1] - c))[0];
    const t2 = (p.m * best[1] * p.dT2) / (p.eta / 100 / (1 / p.P)) / 60;
    return { c, metal: best[0], t2, cost: (p.P / 1000) * ((p.t1 + t2) / 60) * p.rate };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = Object.fromEntries(Object.entries(alt(p)).map(([k, v]) => [k.toLowerCase(), v])); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      if (p.dps[part.id] === undefined || !near(partNum(answer, part.id), tv, tolOf(p.dps[part.id]))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
