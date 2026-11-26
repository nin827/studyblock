// Astronomer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills, with made-up catalogue stars. Hints
// and explanations use only values already drawn (no rng calls), and verify() recomputes every
// part by another route (logs, enumeration, areas) from the stated inputs.
//
// Subtopics (tiers medium / hard / expert / expert-plus):
//   parallax-distance  parallax -> parsecs -> light-years -> year the light left; two stars and a survey range;
//                      Expert+ works back from a light-travel time (parts 2 / 3 / 4 / 4)
//   magnitudes         brightness ratio from a magnitude difference; distance modulus -> absolute magnitude;
//                      apparent magnitude and which star looks brighter; Expert+ distance from m - M
//   telescope-optics   magnification, light gathering, resolution; picking an eyepiece; two telescopes
//   observing-night    stars rising 4 minutes earlier each night (HH:MM text parts, counts of nights)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fmt = (n, d = 4) => String(roundTo(n, d));
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-astronomer: no suitable draw"); };
const EXACT = { fuzzyNumber: 0 }; // whole counts, years: no close credit
const YN = (b) => (b ? "Yes" : "No");
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => { const m = ((mins % 1440) + 1440) % 1440; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; };
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
const pow10 = (e) => `10${String(e).split("").map((c) => SUP[c]).join("")}`;
const sciOf = (x) => { const m = Math.floor(Math.log10(x) + 1e-12); return { A: x / 10 ** m, m }; };

function numPart(id, label, ask, val, dp, hint) {
  return { id: id.toLowerCase(), label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
const intPart = (id, label, ask, val, hint) => ({ ...numPart(id, label, ask, val, 0, hint), ask: `${ask}, as a whole number`, ...EXACT });
function sciPart(id, label, what, unit, A, m, hint) {
  return numPart(id, label, `${what}, as A × ${pow10(m)} ${unit}: type A`, A, 2, hint);
}
function timePart(id, label, ask, mins, hint) {
  const t = hhmm(mins);
  const accepts = [];
  if (t.startsWith("0")) accepts.push(t.slice(1));
  accepts.push(t.replace(":", "."));
  return { id, label, ask: `${ask} (24-hour, HH:MM)`, answerType: "text", answer: t, accepts, fuzzy: false, hint };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
const pick2 = (id, label, ask, a, b, ans, hint) => ({ id, label, ask, answerType: "choice", answer: ans, choices: [a, b], hint });
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
function starNames(rng, k) {
  const out = [];
  while (out.length < k) {
    const n = `Star ${rng.pick(["K", "M", "R", "T", "V", "H", "G", "L"])}-${rng.int(2, 98)}`;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

const PX_RULE = "Distance in parsecs = 1 ÷ parallax in arcseconds, and 1 parsec = 3.26 light-years.";
const MAG_RULE = "A smaller magnitude means a brighter star. Every 5 magnitudes is a factor of 100 in brightness, so a difference of Δm magnitudes is a brightness ratio of 10^(0.4 × Δm).";
const MOD_RULE = "Distance modulus: m − M = 5 × log₁₀(d ÷ 10), where m is the apparent magnitude, M the absolute magnitude (the magnitude at 10 parsecs) and d the distance in parsecs.";
const SIDEREAL = "A star rises 4 minutes earlier each night (a sidereal day is 23 h 56 min). Tonight is night 0, and \"by\" a time means at or before it. Times are 24-hour HH:MM.";

// ============================================================
// parallax-distance
// ============================================================

// Medium: parsecs -> light-years. Hard: + the year the light we see now left the star.
function genPx(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const [S] = starNames(rng, 1);
    const p = rng.int(40, 500) / 1000;
    const hard = tier === "hard";
    const Y = 2026;
    const st = (r) => { const pc = r("pc", 1 / p); const ly = r("ly", pc * 3.26); const year = r("year", Y - ly); return { pc, ly, year }; };
    const dps = hard ? { pc: 2, ly: 1, year: 0 } : { pc: 2, ly: 1 };
    if (!stableOk(st, dps)) continue;
    const pc = 1 / p, ly = pc * 3.26;
    if ([3.26, pc, ly].some((x) => Math.abs(x - 3.26) < 0.006) && Math.abs(pc - 3.26) < 0.006) continue;
    const parts = [
      numPart("pc", "Distance", "Distance of the star in parsecs", pc, 2, "Parallax and distance are inverse: divide 1 by the parallax in arcseconds."),
      numPart("ly", "Light-years", "Distance of the star in light-years", ly, 1, "Multiply the distance in parsecs by 3.26."),
    ];
    const ex = [
      `**Distance:** 1 ÷ ${p} = **${fixed(pc, 2)} pc**.`,
      `**Light-years:** ${fixed(pc, 2)} × 3.26 = **${fixed(ly, 1)} ly**.`,
    ];
    if (hard) {
      parts.push({ ...intPart("year", "Year", "In which year did the light we see in 2026 leave the star (nearest whole year)", Y - ly, "Light travels one light-year per year, so the light left that many years before 2026."), ask: "The year the light we see in 2026 left the star, to the nearest whole year" });
      ex.push(`**Year:** light that has travelled ${fixed(ly, 1)} ly left ${fixed(ly, 1)} years ago: 2026 − ${fixed(ly, 1)} = ${fixed(Y - ly, 1)}, so **${fixed(Y - ly, 0)}**.`);
    }
    return finish(
      `**${S}** shows a parallax of **${p} arcseconds** when measured from Earth${hard ? " in 2026" : ""}. ${PX_RULE}${hard ? " Light travels one light-year in one year." : ""}`,
      parts, ex.join("\n\n"), "px", { p, Y }, [["_p", p], ["_lypc", 3.26]],
      ["Convert parallax to parsecs first; then parsecs to light-years.", "Round only when you type each answer."],
    );
  }
  return tooMany();
}

// Expert: two stars -> two distances, the gap between them, and whether each is inside a survey range.
function genPxTwo(rng) {
  for (let i = 0; i < TRY; i++) {
    const [A, B] = starNames(rng, 2);
    const pA = rng.int(30, 400) / 1000, pB = rng.int(30, 400) / 1000;
    const dA = 1 / pA, dB = 1 / pB;
    const lo = Math.min(dA, dB), hi = Math.max(dA, dB);
    if (hi / lo < 1.4 || hi / lo > 6) continue;
    const st = (r) => { const a = r("pca", dA); const b = r("pcb", dB); const gap = r("gap", Math.abs(b - a) * 3.26); return { pca: a, pcb: b, gap }; };
    const dps = { pca: 2, pcb: 2, gap: 1 };
    if (!stableOk(st, dps)) continue;
    const loLy = lo * 3.26, hiLy = hi * 3.26;
    const nearer = dA < dB ? A : B;
    const outcome = rng.pick(["Both", "Neither", `Only ${nearer}`]);
    let R;
    if (outcome === "Both") R = Math.round(hiLy * (1.1 + rng.next() * 0.3));
    else if (outcome === "Neither") R = Math.round(loLy * (0.55 + rng.next() * 0.33));
    else R = Math.round(loLy * 1.1 + rng.next() * (hiLy * 0.9 - loLy * 1.1));
    if (R < 2 || Math.abs(R - loLy) / loLy < 0.06 || Math.abs(R - hiLy) / hiLy < 0.06) continue;
    const inA = dA * 3.26 <= R, inB = dB * 3.26 <= R;
    const truth = inA && inB ? "Both" : !inA && !inB ? "Neither" : `Only ${inA ? A : B}`;
    if (truth !== outcome) continue;
    const choices = rng.shuffle(["Both", "Neither", `Only ${A}`, `Only ${B}`]);
    const gap = Math.abs(dB - dA) * 3.26;
    const parts = [
      numPart("pca", `${A}`, `Distance of ${A} in parsecs`, dA, 2, "Distance in parsecs is 1 divided by the parallax in arcseconds."),
      numPart("pcb", `${B}`, `Distance of ${B} in parsecs`, dB, 2, "Same rule for the second star."),
      numPart("gap", "Gap", "How much farther the more distant star is than the nearer one, in light-years", gap, 1, "Subtract the two distances in parsecs, then convert the difference to light-years."),
      { id: "survey", label: "Survey", ask: `Which star or stars lie inside the survey range of ${R} light-years?`, answerType: "choice", answer: truth, choices, hint: "Convert each distance to light-years and compare it with the range. Equal or less counts as inside." },
    ];
    const ex = [
      `**${A}:** 1 ÷ ${pA} = **${fixed(dA, 2)} pc**. **${B}:** 1 ÷ ${pB} = **${fixed(dB, 2)} pc**.`,
      `**Gap:** |${fixed(dB, 2)} − ${fixed(dA, 2)}| × 3.26 = **${fixed(gap, 1)} ly**.`,
      `**Survey:** ${A} is ${fixed(dA * 3.26, 1)} ly away and ${B} is ${fixed(dB * 3.26, 1)} ly away. The range is ${R} ly, so **${truth}**.`,
    ].join("\n\n");
    return finish(
      `An astronomer measures the parallax of **${A}** as **${pA} arcseconds** and of **${B}** as **${pB} arcseconds**. A survey catalogue includes every star within **${R} light-years** of the Sun (a star exactly at the limit is included). ${PX_RULE}`,
      parts, ex, "px-two", { pA, pB, R, A, B }, [["_pa", pA], ["_pb", pB], ["_range", R], ["_lypc", 3.26]],
      ["Work out each distance in parsecs first. Then convert to light-years only where you need them.", "The farther star has the smaller parallax."],
    );
  }
  return tooMany();
}

// Expert+: from a light-travel time back to the parallax, then a second star with a stated parallax ratio.
function genPxBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const [X, Y2] = starNames(rng, 2);
    const T = rng.int(10, 90);
    const f = rng.pick([0.4, 0.5, 0.8, 1.25, 1.6, 2]);
    const dx = T / 3.26, px = 3260 / T, dy = T / f, gap = Math.abs(dy - T);
    const st = (r) => { const a = r("dx", T / 3.26); const b = r("px", 1000 / a); const c = r("dy", T / f); const g = r("gap", Math.abs(c - T)); return { dx: a, px: b, dy: c, gap: g }; };
    const dps = { dx: 2, px: 0, dy: 1, gap: 1 };
    if (!stableOk(st, dps)) continue;
    const bigger = f < 1 ? Y2 : X;
    const parts = [
      numPart("dx", `${X} distance`, `Distance of ${X} in parsecs`, dx, 2, "The light travelled T light-years, so the distance is T ly. Divide by 3.26 to get parsecs."),
      { ...numPart("px", `${X} parallax`, `Parallax of ${X} in milliarcseconds (1 arcsecond = 1000 milliarcseconds)`, px, 0, "Parallax in arcseconds is 1 ÷ the distance in parsecs. Then multiply by 1000."), ...EXACT },
      numPart("dy", `${Y2} distance`, `Distance of ${Y2} in light-years`, dy, 1, "Distance is inversely proportional to parallax: dividing the parallax by a factor multiplies the distance by that factor."),
      numPart("gap", "Time gap", `How many years earlier the light we see from the more distant star left it than the light from the nearer star, in years`, gap, 1, "Light-years of distance equal years of travel time. Subtract the two distances."),
    ];
    const ex = [
      `**${X} distance:** ${T} ÷ 3.26 = **${fixed(dx, 2)} pc**.`,
      `**${X} parallax:** 1 ÷ ${fixed(dx, 2)} = ${fmt(1 / dx, 5)} arcseconds = **${fixed(px, 0)} milliarcseconds**.`,
      `**${Y2} distance:** its parallax is ${f} times ${X}'s, so its distance is ${T} ÷ ${f} = **${fixed(dy, 1)} ly**.`,
      `**Time gap:** |${fixed(dy, 1)} − ${T}| = **${fixed(gap, 1)} years**. The more distant star is ${bigger}.`,
    ].join("\n\n");
    return finish(
      `Light from **${X}** takes **${T} years** to reach us. **${Y2}** has a parallax that is **${f} times** the parallax of ${X}. ${PX_RULE} Light travels one light-year in one year.`,
      parts, ex, "px-back", { T, f }, [["_years", T], ["_ratio", f], ["_lypc", 3.26]],
      ["Parallax and distance are inverse: a star with half the parallax is twice as far.", "Light-travel time in years equals the distance in light-years."],
    );
  }
  return tooMany();
}

// ============================================================
// magnitudes
// ============================================================

// Medium: which star looks brighter, and by what factor.
function genMagRatio(rng) {
  for (let i = 0; i < TRY; i++) {
    const [A, B] = starNames(rng, 2);
    const mBright = rng.int(10, 80) / 10;
    const dm = rng.int(8, 60) / 10;
    const mFaint = Math.round((mBright + dm) * 10) / 10;
    const aBright = rng.next() < 0.5;
    const mA = aBright ? mBright : mFaint, mB = aBright ? mFaint : mBright;
    const ratio = 10 ** (0.4 * dm);
    if (nearHalf(ratio, 1)) continue;
    const brighter = aBright ? A : B, fainter = aBright ? B : A;
    const parts = [
      pick2("bright", "Brighter star", "Which star looks brighter in the sky?", A, B, brighter, "A smaller magnitude means a brighter star, even though the number looks smaller."),
      numPart("ratio", "Brightness ratio", "How many times brighter the brighter star looks than the fainter one (ratio of brightnesses)", ratio, 1, "Find the difference in magnitudes, multiply by 0.4 and raise 10 to that power."),
    ];
    const ex = [
      `**Brighter:** ${A} is magnitude ${mA} and ${B} is ${mB}; the smaller number is brighter, so **${brighter}**.`,
      `**Ratio:** Δm = ${fixed(dm, 1)}, so 10^(0.4 × ${fixed(dm, 1)}) = 10^${fmt(0.4 * dm, 2)} = **${fixed(ratio, 1)}**.`,
    ].join("\n\n");
    return finish(
      `**${A}** has an apparent magnitude of **${mA}** and **${B}** has an apparent magnitude of **${mB}**. ${MAG_RULE}`,
      parts, ex, "mg-ratio", { mA, mB, A, B }, [["_ma", mA], ["_mb", mB]],
      ["Compare the two magnitudes first, then take their difference.", "The brightness ratio is 10 raised to 0.4 times the magnitude difference."],
    );
  }
  return tooMany();
}

// Hard: distance modulus -> absolute magnitude -> compare with a reference star.
const DISTS = [12, 20, 25, 40, 50, 80, 100, 160, 200, 250, 400, 500, 800, 1000];
function genMagMod(rng) {
  for (let i = 0; i < TRY; i++) {
    const [S] = starNames(rng, 1);
    const m = rng.int(20, 120) / 10;
    const d = rng.pick(DISTS);
    const mod = 5 * Math.log10(d / 10);
    const Mabs = m - mod;
    const st = (r) => { const a = r("mod", mod); const b = r("abs", m - a); return { mod: a, abs: b }; };
    if (!stableOk(st, { mod: 2, abs: 2 })) continue;
    const yes = rng.next() < 0.5;
    const M0 = Math.round((Mabs + (yes ? 1 : -1) * (0.4 + rng.next() * 1.6)) * 10) / 10;
    if (Math.abs(M0 - Mabs) < 0.35) continue;
    const brighter = Mabs < M0;
    const parts = [
      numPart("mod", "Distance modulus", "Distance modulus m − M of the star", mod, 2, "Divide the distance by 10, take log₁₀ and multiply by 5."),
      numPart("abs", "Absolute magnitude", "Absolute magnitude M of the star", Mabs, 2, "M = m minus the distance modulus."),
      yesNo("lum", "Brighter than reference?", `Is ${S} intrinsically brighter than the reference star (absolute magnitude ${M0})?`, brighter, "Compare absolute magnitudes. Remember that a smaller magnitude is a brighter star."),
    ];
    const ex = [
      `**Distance modulus:** 5 × log₁₀(${d} ÷ 10) = 5 × log₁₀(${fmt(d / 10, 2)}) = **${fixed(mod, 2)}**.`,
      `**Absolute magnitude:** M = ${m} − ${fixed(mod, 2)} = **${fixed(Mabs, 2)}**.`,
      `**Compare:** ${fixed(Mabs, 2)} is ${brighter ? "smaller" : "larger"} than ${M0}, so ${S} is ${brighter ? "brighter" : "fainter"} than the reference: **${YN(brighter)}**.`,
    ].join("\n\n");
    return finish(
      `**${S}** has an apparent magnitude of **${m}** and lies **${d} parsecs** away. ${MOD_RULE} A smaller magnitude means a brighter star.`,
      parts, ex, "mg-mod", { m, d, M0 }, [["_m", m], ["_d", d], ["_m0", M0]],
      ["Find the distance modulus before the absolute magnitude.", "Intrinsic brightness is compared with absolute magnitudes, not apparent ones."],
    );
  }
  return tooMany();
}

// Expert: absolute magnitude + distance -> apparent magnitude, then a second star.
function genMagApp(rng) {
  for (let i = 0; i < TRY; i++) {
    const [A, B] = starNames(rng, 2);
    const M = rng.int(-30, 80) / 10;
    const d = rng.pick(DISTS);
    const mod = 5 * Math.log10(d / 10);
    const mA = M + mod;
    const bBright = rng.next() < 0.5;
    const mB = Math.round((mA + (bBright ? -1 : 1) * (0.3 + rng.next() * 2.7)) * 10) / 10;
    const dif = Math.abs(mA - mB);
    if (dif < 0.25) continue;
    const st = (r) => { const a = r("mod", mod); const b = r("app", M + a); const g = r("gap", Math.abs(b - mB)); return { mod: a, app: b, gap: g }; };
    if (!stableOk(st, { mod: 2, app: 2, gap: 2 })) continue;
    const brighter = mA < mB ? A : B;
    const parts = [
      numPart("mod", "Distance modulus", `Distance modulus of ${A}`, mod, 2, "Use 5 × log₁₀(d ÷ 10)."),
      numPart("app", "Apparent magnitude", `Apparent magnitude m of ${A}`, mA, 2, "m = M + the distance modulus."),
      pick2("bright", "Brighter in the sky", "Which star looks brighter in the sky?", A, B, brighter, "Compare the two apparent magnitudes. The smaller one is brighter."),
      numPart("gap", "Difference", "The difference in apparent magnitude between the two stars", Math.abs(mA - mB), 2, "Subtract the smaller apparent magnitude from the larger."),
    ];
    const ex = [
      `**Distance modulus:** 5 × log₁₀(${d} ÷ 10) = **${fixed(mod, 2)}**.`,
      `**Apparent magnitude:** m = ${M} + ${fixed(mod, 2)} = **${fixed(mA, 2)}**.`,
      `**Brighter:** ${A} is ${fixed(mA, 2)} and ${B} is ${mB}; the smaller is brighter, so **${brighter}**.`,
      `**Difference:** |${fixed(mA, 2)} − ${mB}| = **${fixed(dif, 2)}**.`,
    ].join("\n\n");
    return finish(
      `**${A}** has an absolute magnitude of **${M}** and lies **${d} parsecs** away. **${B}** appears in the sky with an apparent magnitude of **${mB}**. ${MOD_RULE} A smaller magnitude means a brighter star.`,
      parts, ex, "mg-app", { M, d, mB, A, B }, [["_absm", M], ["_d", d], ["_mb", mB]],
      ["Distance modulus first, then add it to the absolute magnitude.", "Apparent brightness in the sky is judged by apparent magnitudes."],
    );
  }
  return tooMany();
}

// Expert+: apparent and absolute magnitude -> distance (A x 10^n), fading factor, survey range.
function genMagBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const [S] = starNames(rng, 1);
    const M = rng.int(-40, 60) / 10;
    const modv = rng.int(30, 140) / 10;
    const m = Math.round((M + modv) * 10) / 10;
    const mod = Math.round((m - M) * 10) / 10;
    const d = 10 ** (mod / 5 + 1);
    const fade = 10 ** (0.4 * mod);
    const D = sciOf(d), F = sciOf(fade);
    if (nearHalf(D.A, 2) || nearHalf(F.A, 2) || D.A >= 9.995 || F.A >= 9.995) continue;
    const yes = rng.next() < 0.5;
    let R = Math.round(d * (yes ? 1.2 + rng.next() * 0.5 : 0.5 + rng.next() * 0.3));
    const mag10 = 10 ** Math.floor(Math.log10(R));
    R = Math.round(R / (mag10 / 10)) * (mag10 / 10);
    if (R < 20) continue;
    const inside = d <= R;
    if (inside !== yes || Math.abs(d - R) / d < 0.1) continue;
    const parts = [
      numPart("mod", "Distance modulus", "Distance modulus m − M", mod, 1, "Subtract the absolute magnitude from the apparent magnitude."),
      sciPart("dist", "Distance", "Distance of the star in parsecs", "pc", D.A, D.m, "Rearrange the modulus: d = 10 × 10^((m − M) ÷ 5). Write the result with one digit before the decimal point."),
      sciPart("fade", "Fading factor", "How many times fainter the star looks than it would at a distance of 10 parsecs", "(ratio)", F.A, F.m, "Brightness falls with the square of distance, so the fading factor is (d ÷ 10)². The same number is 10^(0.4 × (m − M))."),
      yesNo("range", "In range?", `Is the star within the survey range of ${R} parsecs (a star exactly at the limit counts as inside)?`, inside, "Compare the distance you found with the range."),
    ];
    parts[2].ask = `How many times fainter the star looks than it would at 10 parsecs, as A × ${pow10(F.m)}: type A`;
    const ex = [
      `**Modulus:** ${m} − (${M}) = **${fixed(mod, 1)}**.`,
      `**Distance:** d = 10 × 10^(${fixed(mod, 1)} ÷ 5) = 10 × 10^${fmt(mod / 5, 3)} = ${fmt(d, 2)} pc = **${fixed(D.A, 2)} × ${pow10(D.m)}** pc.`,
      `**Fading:** (${fmt(d, 2)} ÷ 10)² = **${fixed(F.A, 2)} × ${pow10(F.m)}**.`,
      `**In range:** ${fmt(d, 1)} pc is ${inside ? "no more than" : "more than"} ${R} pc, so **${YN(inside)}**.`,
    ].join("\n\n");
    return finish(
      `**${S}** has an apparent magnitude of **${m}** and an absolute magnitude of **${M}**. ${MOD_RULE} Brightness ratios follow a difference of Δm magnitudes as 10^(0.4 × Δm). Large numbers are written as A × 10ⁿ.`,
      parts, ex, "mg-back", { m, M, R }, [["_m", m], ["_absm", M], ["_range", R]],
      ["The modulus is a plain subtraction. Then undo the log with a power of 10.", "The fading factor is the square of the distance in units of 10 parsecs."],
    );
  }
  return tooMany();
}

// ============================================================
// telescope-optics
// ============================================================

const APERTURES = [70, 80, 90, 100, 114, 130, 150, 200, 250, 300];
const FOCALS = [600, 700, 800, 900, 1000, 1200, 1500, 2000];
const EYEPIECES = [6, 9, 10, 12.5, 15, 20, 25, 32, 40];
const TL_RULE = "Magnification = telescope focal length ÷ eyepiece focal length. Light-gathering power compared with the eye = (aperture ÷ 7 mm)², taking the eye's pupil as 7 mm.";
const RES_RULE = "The smallest separation a telescope can split, in arcseconds, = 116 ÷ aperture in mm.";

function genTlMag(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const D = rng.pick(APERTURES), F = rng.pick(FOCALS), f = rng.pick(EYEPIECES);
    const hard = tier === "hard";
    const mag = F / f, light = (D / 7) ** 2, res = 116 / D;
    if (nearHalf(mag, 1) || nearHalf(light, 0) || nearHalf(res, 2)) continue;
    const parts = [
      numPart("mag", "Magnification", "Magnification with this eyepiece", mag, 1, "Divide the telescope's focal length by the eyepiece's focal length."),
      { ...numPart("gather", "Light gathering", "Light-gathering power compared with the eye", light, 0, "Divide the aperture by 7 mm, then square the result."), ask: "Light-gathering power compared with the eye (a ratio), to the nearest whole number" },
    ];
    const ex = [
      `**Magnification:** ${F} ÷ ${f} = **${fixed(mag, 1)}×**.`,
      `**Light gathering:** (${D} ÷ 7)² = ${fmt(D / 7, 3)}² = **${fixed(light, 0)}** times the eye.`,
    ];
    if (hard) {
      parts.push(numPart("res", "Resolution", "The smallest separation it can split, in arcseconds", res, 2, "Divide 116 by the aperture in millimetres."));
      ex.push(`**Resolution:** 116 ÷ ${D} = **${fixed(res, 2)} arcseconds**.`);
    }
    return finish(
      `A reflecting telescope has an aperture (mirror diameter) of **${D} mm** and a focal length of **${F} mm**. You fit an eyepiece with a focal length of **${f} mm**. ${TL_RULE}${hard ? ` ${RES_RULE}` : ""}`,
      parts, ex.join("\n\n"), "tl-mag", { D, F, f }, [["_dia", D], ["_fl", F], ["_ep", f]],
      ["Use the telescope's focal length for magnification, and its aperture for light and resolution.", "Do not mix up the eyepiece and telescope focal lengths."],
    );
  }
  return tooMany();
}

// Expert: the eyepiece for a wanted magnification, the closest in the case, the actual magnification, within the limit?
function genTlEye(rng) {
  const wantIn = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const D = rng.pick(APERTURES), F = rng.pick(FOCALS);
    const K = rng.pick([1, 1.5, 2]);
    const lim0 = K * D;
    const MtLo = wantIn ? 25 : Math.ceil(lim0 * 1.25), MtHi = wantIn ? Math.floor(lim0 * 0.8) : Math.floor(F / 6.2);
    if (MtHi < MtLo) continue;
    const Mt = rng.int(Math.max(MtLo, 25), Math.min(MtHi, 330));
    const need = F / Mt;
    if (need < 6.5 || need > 38 || nearHalf(need, 1)) continue;
    const ranked = [...EYEPIECES].sort((a, b) => Math.abs(a - need) - Math.abs(b - need));
    const four = ranked.slice(0, 4);
    const d0 = Math.abs(four[0] - need), d1 = Math.abs(four[1] - need);
    if (d0 > 0.7 * d1) continue;
    const chosen = four[0];
    const mag = F / chosen;
    if (nearHalf(mag, 1)) continue;
    const list = rng.shuffle(four.slice());
    const limit = K * D;
    if (Math.abs(mag - limit) / limit < 0.06) continue;
    const within = mag <= limit;
    const parts = [
      numPart("need", "Focal length needed", "Eyepiece focal length needed for the wanted magnification, in mm", need, 1, "Rearrange magnification = F ÷ f for f."),
      { id: "eyepiece", label: "Closest eyepiece", ask: "Which eyepiece from the case is closest to that focal length?", answerType: "choice", answer: `${chosen} mm`, choices: list.map((e) => `${e} mm`), hint: "Subtract each eyepiece's focal length from the one you need and take the smallest gap." },
      numPart("mag", "Actual magnification", "Magnification with the eyepiece you chose", mag, 1, "Divide the telescope's focal length by that eyepiece's focal length."),
      yesNo("limit", "Within limit?", `Is that magnification within the useful limit (at most ${K} × the aperture in mm, so at most ${limit}×)?`, within, "Compare your actual magnification with the limit: the stated multiple of the aperture in millimetres."),
    ];
    const ex = [
      `**Focal length needed:** ${F} ÷ ${Mt} = **${fixed(need, 1)} mm**.`,
      `**Closest:** gaps from ${fixed(need, 1)} mm: ${list.map((e) => `${e} mm → ${fmt(Math.abs(e - need), 2)}`).join(", ")}. The smallest is **${chosen} mm**.`,
      `**Actual magnification:** ${F} ÷ ${chosen} = **${fixed(mag, 1)}×**.`,
      `**Limit:** ${K} × ${D} = ${limit}, and ${fixed(mag, 1)} is ${within ? "no more than" : "more than"} that, so **${YN(within)}**.`,
    ].join("\n\n");
    return finish(
      `A telescope has an aperture of **${D} mm** and a focal length of **${F} mm**. You want a magnification of about **${Mt}×**. Your eyepiece case holds eyepieces of **${list.join(" mm, ")} mm**. Magnification = telescope focal length ÷ eyepiece focal length.`,
      parts, ex, "tl-eye", { D, F, Mt, list, chosen, K }, [["_dia", D], ["_fl", F], ["_want", Mt]],
      ["First find the eyepiece you would need if there were no limits on the case.", "Then choose from the list by smallest gap, and recompute with the real eyepiece."],
    );
  }
  return tooMany();
}

// Expert+: two telescopes -> light ratio, extra limiting magnitude, resolution, which can split a pair.
function genTlTwo(rng) {
  for (let i = 0; i < TRY; i++) {
    let Dl = rng.pick(APERTURES), Ds = rng.pick(APERTURES);
    if (Dl < Ds) [Dl, Ds] = [Ds, Dl];
    if (Dl / Ds < 1.4) continue;
    const ratio = (Dl / Ds) ** 2;
    const st = (r) => { const g = r("gather", ratio); const dm = r("dmag", 2.5 * Math.log10(g)); return { gather: g, dmag: dm }; };
    const rl = 116 / Dl, rs = 116 / Ds;
    if (!stableOk(st, { gather: 2, dmag: 2 }) || nearHalf(rl, 2)) continue;
    const outcome = rng.pick(["Both", "Neither", "Only larger"]);
    let s;
    if (outcome === "Both") s = rs * (1.1 + rng.next() * 0.6);
    else if (outcome === "Neither") s = rl * (0.4 + rng.next() * 0.5);
    else s = rl * 1.1 + rng.next() * (rs * 0.9 - rl * 1.1);
    s = Math.round(s * 100) / 100;
    if (s < 0.1) continue;
    const canL = s >= rl, canS = s >= rs;
    if (Math.abs(s - rl) / rl < 0.08 || Math.abs(s - rs) / rs < 0.08) continue;
    const aLarge = rng.next() < 0.5;
    const [A, B] = ["Telescope A", "Telescope B"];
    const DA = aLarge ? Dl : Ds, DB = aLarge ? Ds : Dl;
    const large = aLarge ? A : B;
    const truth = canL && canS ? "Both" : !canL && !canS ? "Neither" : `Only ${large}`;
    const choices = ["Both", "Neither", `Only ${A}`, `Only ${B}`];
    const dm = 2.5 * Math.log10(ratio);
    const parts = [
      numPart("gather", "Light ratio", "How many times more light the larger telescope gathers than the smaller one", ratio, 2, "Divide the larger aperture by the smaller one, then square it."),
      numPart("dmag", "Fainter stars", "How many magnitudes fainter a star the larger telescope can reach", dm, 2, "Use 2.5 × log₁₀ of the light ratio."),
      numPart("res", "Resolution", "The smallest separation the larger telescope can split, in arcseconds", rl, 2, "Divide 116 by that telescope's aperture in mm."),
      { id: "split", label: "Split the pair", ask: `Which telescope or telescopes can split a pair of stars ${fixed(s, 2)} arcseconds apart?`, answerType: "choice", answer: truth, choices: rng.shuffle(choices.slice()), hint: "A telescope splits the pair if the separation is at least its smallest separation (116 ÷ aperture). Work out both." },
    ];
    const ex = [
      `**Light ratio:** (${Dl} ÷ ${Ds})² = ${fmt(Dl / Ds, 3)}² = **${fixed(ratio, 2)}**.`,
      `**Fainter stars:** 2.5 × log₁₀(${fixed(ratio, 2)}) = **${fixed(dm, 2)} magnitudes**.`,
      `**Resolution:** 116 ÷ ${Dl} = **${fixed(rl, 2)} arcseconds**.`,
      `**Split:** ${large} splits down to ${fixed(rl, 2)} arcsec and the other telescope down to ${fixed(rs, 2)} arcsec. The pair is ${fixed(s, 2)} arcsec apart, so **${truth}**.`,
    ].join("\n\n");
    return finish(
      `**${A}** has an aperture of **${DA} mm** and **${B}** has an aperture of **${DB} mm**. A telescope that gathers k times more light reaches 2.5 × log₁₀(k) magnitudes fainter. ${RES_RULE} A pair can be split if its separation is at least that value.`,
      parts, ex, "tl-two", { Dl, Ds, s, large, A, B }, [["_da", DA], ["_db", DB], ["_sep", s]],
      ["Identify which telescope has the larger aperture first.", "A larger aperture gathers more light and also splits finer detail."],
    );
  }
  return tooMany();
}

// ============================================================
// observing-night
// ============================================================

// Medium: rise time after n nights, and the first night it rises by a stated time.
// Hard adds the rise time on that first night.
function genObRise(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const [S] = starNames(rng, 1);
    const T0 = rng.int(21 * 60, 23 * 60 + 55);
    const n = rng.int(3, 40);
    const Tg = rng.int(17 * 60, T0 - 24);
    const first = Math.ceil((T0 - Tg) / 4);
    const hard = tier === "hard";
    const parts = [
      timePart("time", "Rise time", `The time ${S} rises after ${n} more nights`, T0 - 4 * n, "Each night it rises 4 minutes earlier, so take off 4 minutes for every night."),
      intPart("night", "First night", `The first night on which ${S} rises by ${hhmm(Tg)}`, first, "Work out the minutes it must move earlier, divide by 4 and round up to a whole night."),
    ];
    const ex = [
      `**Rise time:** ${n} × 4 = ${4 * n} min earlier, so ${hhmm(T0)} − ${4 * n} min = **${hhmm(T0 - 4 * n)}**.`,
      `**First night:** ${hhmm(T0)} to ${hhmm(Tg)} is ${T0 - Tg} min, and ${T0 - Tg} ÷ 4 = ${fmt((T0 - Tg) / 4, 2)}, rounded up to **night ${first}**.`,
    ];
    if (hard) {
      parts.push(timePart("tnight", "Rise time then", `The time ${S} rises on that first night`, T0 - 4 * first, "Take 4 minutes per night off tonight's time, for the night number you found."));
      ex.push(`**Rise time then:** ${hhmm(T0)} − ${4 * first} min = **${hhmm(T0 - 4 * first)}**.`);
    }
    return finish(
      `Tonight (night 0) **${S}** rises at **${hhmm(T0)}**. You want to see it from a dark site, and it must rise by **${hhmm(Tg)}**, which it cannot do tonight. ${SIDEREAL}`,
      parts, ex.join("\n\n"), "ob-rise", { T0, n, Tg, hard }, [["_nights", n]],
      ["It moves earlier in 4-minute steps, so count minutes, not hours.", "A night count must be a whole number: round up."],
    );
  }
  return tooMany();
}

// Expert: two stars, nights each needs, the limiting star, the first night both are up by the time.
function genObTwo(rng) {
  for (let i = 0; i < TRY; i++) {
    const [A, B] = starNames(rng, 2);
    const TA = rng.int(21 * 60, 23 * 60 + 55);
    const diff = rng.int(12, 60) * (rng.next() < 0.5 ? -1 : 1);
    const TB = TA + diff;
    if (TB < 20 * 60 || TB > 23 * 60 + 58) continue;
    const Tg = rng.int(17 * 60, Math.min(TA, TB) - 24);
    const nA = Math.ceil((TA - Tg) / 4), nB = Math.ceil((TB - Tg) / 4);
    const lim = TA > TB ? A : B;
    const parts = [
      intPart("na", `${A}`, `Nights from tonight until ${A} first rises by ${hhmm(Tg)}`, nA, "Minutes to move earlier ÷ 4, rounded up."),
      intPart("nb", `${B}`, `Nights from tonight until ${B} first rises by ${hhmm(Tg)}`, nB, "Same working for the other star."),
      pick2("limit", "Limiting star", "Which star decides how long you must wait for both?", A, B, lim, "The star that rises later tonight needs more nights."),
      intPart("both", "Both up", `The first night on which both stars rise by ${hhmm(Tg)}`, Math.max(nA, nB), "Both must be up, so take the later of the two nights."),
    ];
    const ex = [
      `**${A}:** ${hhmm(TA)} to ${hhmm(Tg)} is ${TA - Tg} min; ${TA - Tg} ÷ 4 = ${fmt((TA - Tg) / 4, 2)}, rounded up to **${nA}**.`,
      `**${B}:** ${hhmm(TB)} to ${hhmm(Tg)} is ${TB - Tg} min; ${TB - Tg} ÷ 4 = ${fmt((TB - Tg) / 4, 2)}, rounded up to **${nB}**.`,
      `**Limiting star:** ${lim} rises later tonight (${hhmm(Math.max(TA, TB))}), so it needs more nights: **${lim}**.`,
      `**Both up:** the later of ${nA} and ${nB} is **${Math.max(nA, nB)}**.`,
    ].join("\n\n");
    return finish(
      `Tonight (night 0) **${A}** rises at **${hhmm(TA)}** and **${B}** rises at **${hhmm(TB)}**. For a survey you need both to rise by **${hhmm(Tg)}**. ${SIDEREAL}`,
      parts, ex, "ob-two", { TA, TB, Tg, A, B }, [],
      ["Do each star separately, then combine.", "Count in minutes: each night moves a star 4 minutes earlier."],
    );
  }
  return tooMany();
}

// Expert+: two sighting times -> nights between, a later rise time (maybe wrapping midnight), drift, morning or evening.
function genObGap(rng) {
  for (let i = 0; i < TRY; i++) {
    const [S] = starNames(rng, 1);
    const k = rng.int(4, 20);
    const T1 = rng.int(70, 400);
    const T0 = T1 + 4 * k;
    const wantMorning = rng.next() < 0.5;
    let m;
    if (wantMorning) { const hiM = Math.floor(T1 / 4); if (hiM < 3) continue; m = rng.int(1, hiM); }
    else { m = rng.int(Math.floor(T1 / 4) + 1, Math.floor((T1 + 700) / 4)); }
    const tm = T1 - 4 * m;
    const clock = ((tm % 1440) + 1440) % 1440;
    const morning = clock < 720;
    if (morning !== wantMorning) continue;
    const drift = (4 * (k + m)) / 60;
    const parts = [
      intPart("nights", "Nights between", `The number of nights between the two sightings`, k, "The star moved earlier by 4 minutes per night; divide the total change by 4."),
      timePart("time", "Later rise time", `The time ${S} rises ${m} nights after the second sighting`, tm, "Subtract 4 minutes per night from the second sighting's time. If it goes below 00:00, add 24 hours."),
      numPart("drift", "Total drift", `The total drift in rise time from the first sighting to that night, in hours`, drift, 2, "Count all the nights from the first sighting and take 4 minutes for each; convert to hours."),
      pick2("part", "Time of day", `Is that later rise in the morning (before 12:00) or in the evening (12:00 or later)?`, "Morning", "Evening", morning ? "Morning" : "Evening", "Look at the 24-hour time you found: before 12:00 is morning."),
    ];
    const ex = [
      `**Nights between:** ${hhmm(T0)} − ${hhmm(T1)} = ${T0 - T1} min, and ${T0 - T1} ÷ 4 = **${k}**.`,
      `**Later rise time:** ${hhmm(T1)} − ${4 * m} min = ${tm < 0 ? `${tm} min, add 24 h: ` : ""}**${hhmm(tm)}**.`,
      `**Total drift:** (${k} + ${m}) nights × 4 min = ${4 * (k + m)} min = **${fixed(drift, 2)} h**.`,
      `**Time of day:** ${hhmm(tm)} is ${morning ? "before" : "after"} 12:00, so **${morning ? "Morning" : "Evening"}**.`,
    ].join("\n\n");
    return finish(
      `You first see **${S}** rise at **${hhmm(T0)}**. After losing count of the nights, you see it rise at **${hhmm(T1)}**. ${SIDEREAL} If a subtraction goes below 00:00, add 24 hours to get the clock time.`,
      parts, ex, "ob-gap", { T0, T1, m, k }, [["_more", m]],
      ["Use the difference between the two times to find how many nights passed.", "Keep the minutes together; convert to hours at the end."],
    );
  }
  return tooMany();
}

// ============================================================
// generate
// ============================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  const expert = difficulty === "expert";
  if (subtopic === "parallax-distance") return plus ? genPxBack(rng) : expert ? genPxTwo(rng) : genPx(rng, difficulty);
  if (subtopic === "magnitudes") return plus ? genMagBack(rng) : expert ? genMagApp(rng) : difficulty === "hard" ? genMagMod(rng) : genMagRatio(rng);
  if (subtopic === "telescope-optics") return plus ? genTlTwo(rng) : expert ? genTlEye(rng) : genTlMag(rng, difficulty);
  if (subtopic === "observing-night") return plus ? genObGap(rng) : expert ? genObTwo(rng) : genObRise(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ============================================================
// independent verification
// ============================================================
// Each part is recomputed from the stated inputs by a different route (logs, enumeration, areas).

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v).trim();
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const clockOf = (mins) => { let m = mins; while (m < 0) m += 1440; m %= 1440; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; };
const firstNight = (T, Tg) => { let n = 0; while (T - 4 * n > Tg) n++; return n; };

const ALT = {
  px: (p) => {
    const pc = 10 ** -Math.log10(p.p);
    return { pc, ly: 3.26 / p.p, year: p.Y - 3.26 / p.p };
  },
  "px-two": (p) => {
    const a = 1 / p.pA, b = 1 / p.pB;
    const lyA = 3.26 / p.pA, lyB = 3.26 / p.pB;
    const inA = lyA <= p.R, inB = lyB <= p.R;
    return { pca: a, pcb: b, gap: Math.abs(lyB - lyA), survey: inA && inB ? "Both" : !inA && !inB ? "Neither" : `Only ${inA ? p.A : p.B}` };
  },
  "px-back": (p) => {
    const dy = p.T / p.f;
    return { dx: p.T / 3.26, px: (1 / (p.T / 3.26)) * 1000, dy, gap: Math.abs(dy - p.T) };
  },
  "mg-ratio": (p) => ({ bright: p.mA < p.mB ? p.A : p.B, ratio: 100 ** (Math.abs(p.mA - p.mB) / 5) }),
  "mg-mod": (p) => {
    const mod = 5 * (Math.log(p.d) - Math.log(10)) / Math.LN10;
    return { mod, abs: p.m - mod, lum: YN(p.m - mod < p.M0) };
  },
  "mg-app": (p) => {
    const mod = 5 * Math.log10(p.d) - 5;
    const mA = p.M + mod;
    return { mod, app: mA, bright: mA < p.mB ? p.A : p.B, gap: Math.abs(mA - p.mB) };
  },
  "mg-back": (p) => {
    const mod = p.m - p.M;
    const d = 10 ** (1 + mod / 5);
    const dd = sciOf(d), ff = sciOf((d / 10) ** 2);
    return { mod, dist: dd.A, fade: ff.A, range: YN(d <= p.R) };
  },
  "tl-mag": (p) => ({ mag: p.F / p.f, gather: (Math.PI * (p.D / 2) ** 2) / (Math.PI * 3.5 ** 2), res: 116 / p.D }),
  "tl-eye": (p) => {
    const need = p.F / p.Mt;
    let best = p.list[0];
    for (const e of p.list) if (Math.abs(e - need) < Math.abs(best - need)) best = e;
    const mag = p.F / best;
    return { need, eyepiece: `${best} mm`, mag, limit: YN(mag <= p.K * p.D) };
  },
  "tl-two": (p) => {
    const area = (D) => Math.PI * (D / 2) ** 2;
    const k = area(p.Dl) / area(p.Ds);
    const canL = p.s >= 116 / p.Dl, canS = p.s >= 116 / p.Ds;
    const small = p.large === p.A ? p.B : p.A;
    return { gather: k, dmag: 2.5 * Math.log(k) / Math.LN10, res: 116 / p.Dl, split: canL && canS ? "Both" : !canL && !canS ? "Neither" : `Only ${canL ? p.large : small}` };
  },
  "ob-rise": (p) => {
    const night = firstNight(p.T0, p.Tg);
    const out = { time: clockOf(p.T0 - 4 * p.n), night };
    if (p.hard) out.tnight = clockOf(p.T0 - 4 * night);
    return out;
  },
  "ob-two": (p) => {
    const na = firstNight(p.TA, p.Tg), nb = firstNight(p.TB, p.Tg);
    let both = 0;
    while (p.TA - 4 * both > p.Tg || p.TB - 4 * both > p.Tg) both++;
    return { na, nb, limit: na > nb ? p.A : p.B, both };
  },
  "ob-gap": (p) => {
    let k = 0;
    while (p.T0 - 4 * k > p.T1) k++;
    const t = clockOf(p.T1 - 4 * p.m);
    return { nights: k, time: t, drift: ((k + p.m) * 4) / 60, part: Number(t.slice(0, 2)) < 12 ? "Morning" : "Evening" };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      if (p.dps[part.id] === undefined || !near(partNum(answer, part.id), tv, tolOf(p.dps[part.id]))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
