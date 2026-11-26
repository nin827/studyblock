// Civil Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact, or (where a rounded earlier answer is asked for)
// redrawn until working from the rounded value gives the same later answer. No answer sits on a
// rounding half-step, and verdict parts (Yes/No, In time...) are decided first and then fitted.
// All figures are made up; loads are static and the rules are general textbook practice.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   beam-check        reactions -> bending moment -> required section modulus -> adequate?     (Structural)
//   tie-rod           stress -> extension -> factor of safety -> meets the minimum?             (Structural)
//   concrete-batches  volume -> order with waste -> trucks (round up) -> cost                   (Site)
//   setting-out       gradient -> level difference -> cut/fill -> volume, lorries; trig pegs    (Site)
//   pipe-drainage     Q = A·v and fill time; drain 1 in N -> outfall level -> flood check; pump head ->
//                     hydraulic and input power -> cost; supply rate -> main size -> tank storage -> verdict  (Water)
//   ground-stress     σ, u, σ′ at depth; pad footing weight -> bearing pressure -> FoS -> verdict;
//                     slope FoS -> anchor force (backwards) -> stock anchor -> wider spacing verdict    (Geotechnical)
// (pipe-drainage and ground-stress: medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts.)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-7;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-civil-engineer: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const fracOK = (x, m = 0.03) => Math.abs(x - Math.round(x)) > m; // x not close to a whole number (for round-up counts)
const YN = (b) => (b ? "Yes" : "No");

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
// Segmented part: all combinations of two small value lists (2 x 2), shuffled by the caller's rng.
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: shuffled(rng, choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- beam-check ----------

const SPANS = [4, 5, 6, 8, 10];
const SIGMAS = [10, 12, 160];
const sectionNote = (sigma) => `The beam is ${sigma < 100 ? "timber" : "steel"}: its allowable bending stress is **${sigma} N/mm²**, and bending stress = M ÷ Z (1 kN·m = 10⁶ N·mm; 1 cm³ = 10³ mm³).`;

function genBeam(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const L = rng.pick(SPANS), a = rng.int(1, L - 1), P = rng.pick([10, 12, 15, 16, 18, 20, 24, 25, 30, 32, 36, 40, 45, 48, 50, 60]);
      const RB = (P * a) / L, RA = P - RB, M = RA * a;
      if (!isEx(RB, 1) || !isEx(M, 1) || RA <= 0) continue;
      const parts = [
        numPart("rb", "Reaction at B", "Reaction at support B (kN)", RB, 1, "Take moments about A: the reaction at B times the span balances the load times its distance from A."),
        numPart("m", "Bending moment", "Maximum bending moment, which is under the load (kN·m)", M, 1, "With one point load the largest moment is under it. Take the reaction at A (total load minus RB) times its distance to the load."),
      ];
      const ex = `**Reaction at B** (moments about A): RB × ${L} = ${P} × ${a}, so RB = **${f(RB)} kN**.\n\n**Bending moment under the load:** RA = ${P} − ${f(RB)} = ${f(RA)} kN, so M = ${f(RA)} × ${a} = **${f(M)} kN·m**.`;
      return finish(
        `A simply supported beam AB spans **${L} m**. A single point load of **${P} kN** acts **${a} m from A**. Ignore the weight of the beam.`,
        parts, ex, "civ-beam1", { tier, L, a, P }, [["_L", L], ["_a", a], ["_P", P]],
        ["Reactions first (moments about one support), then the moment under the load.", "RA + RB equals the total load."],
      );
    }
    if (tier === "hard") {
      const L = rng.pick(SPANS), w = rng.pick([2, 4, 5, 6, 8]), a = rng.int(1, L - 1), P = rng.pick([10, 15, 20, 30, 40, 50]);
      const RB = (w * L * L / 2 + P * a) / L, RA = w * L + P - RB, M = RA * a - (w * a * a) / 2;
      if (![RB, RA, M].every((x) => isEx(x, 1)) || RB <= 0 || RA <= 0 || M <= 0) continue;
      const parts = [
        numPart("rb", "Reaction at B", "Reaction at support B (kN)", RB, 1, "The UDL acts as w × span at the middle of the span. Take moments about A for the UDL and the point load together."),
        numPart("ra", "Reaction at A", "Reaction at support A (kN)", RA, 1, "Total downward load (UDL plus point load) minus RB."),
        numPart("m", "Moment at the load", "Bending moment at the point load (kN·m)", M, 1, "Cut the beam at the load and take moments of everything to its left: RA times the distance, minus the UDL on that length acting at its midpoint."),
      ];
      const ex = `**Reaction at B** (moments about A): RB × ${L} = ${w} × ${L} × ${L / 2} + ${P} × ${a}, so RB = **${f(RB)} kN**.\n\n**Reaction at A:** ${w} × ${L} + ${P} − ${f(RB)} = **${f(RA)} kN**.\n\n**Moment at the load** (left side): M = ${f(RA)} × ${a} − ${w} × ${a} × ${a / 2} = **${f(M)} kN·m**.`;
      return finish(
        `A simply supported beam AB spans **${L} m** and carries a uniformly distributed load of **${w} kN/m** over its whole length, plus a point load of **${P} kN** at **${a} m from A**. A is the left support.`,
        parts, ex, "civ-beam2", { tier, L, a, P, w }, [["_L", L], ["_w", w], ["_P", P], ["_a", a]],
        ["Replace the UDL by one force w × L at the midspan to find the reactions.", "For the moment at the load, look at the beam to its left only."],
      );
    }
    if (tier === "expert") {
      const L = rng.pick([4, 6, 8, 10]), w = rng.pick([2, 3, 4, 5, 6]), P = rng.pick([10, 20, 24, 30, 40, 50, 60]);
      const RB = (w * L + P) / 2, M = (P * L) / 4 + (w * L * L) / 8;
      const sigma = rng.pick(SIGMAS);
      const Z = (M * 1000) / sigma;
      if (!isEx(RB, 1) || !isEx(M, 1) || Z < 30 || nearHalf(Z, 0, 0.12)) continue;
      const ok = rng.next() < 0.5;
      const Zs = Math.round((Z * (ok ? rng.pick([1.08, 1.15, 1.25, 1.4]) : rng.pick([0.6, 0.7, 0.8, 0.9]))) / 5) * 5;
      if (Zs <= 0 || (Zs >= Z) !== ok || Math.abs(Zs / Z - 1) < 0.04) continue;
      const parts = [
        numPart("rb", "Reaction at B", "Reaction at support B (kN)", RB, 1, "The load is symmetric, so each reaction is half the total load (UDL plus point load)."),
        numPart("m", "Maximum moment", "Maximum bending moment, at midspan (kN·m)", M, 1, "Take the reaction times half the span, then subtract the UDL on that half acting at its own midpoint."),
        numPart("z", "Section modulus", "Minimum section modulus required (cm³)", Z, 0, `Z = M ÷ allowable stress. Convert kN·m to N·mm (× 10⁶), divide by ${sigma} N/mm², then convert mm³ to cm³ (÷ 10³).`, true),
        yesNo("ok", "Section adequate?", `The chosen section has Z = **${commas(Zs)} cm³**. Is it adequate?`, ok, "A section is adequate if its Z is at least the minimum required."),
      ];
      const ex = `**Reaction at B:** (${w} × ${L} + ${P}) ÷ 2 = **${f(RB)} kN**.\n\n**Maximum moment** (midspan): ${f(RB)} × ${L / 2} − ${w} × ${L / 2} × ${L / 4} = **${f(M)} kN·m** (check: PL/4 + wL²/8).\n\n**Section modulus:** ${f(M)} × 10⁶ ÷ ${sigma} = ${commas(Math.round((M * 1e6) / sigma))} mm³ = **${commas(roundTo(Z, 0))} cm³**.\n\n**Adequate?** ${commas(Zs)} is ${ok ? "at least" : "less than"} ${commas(roundTo(Z, 0))}: **${YN(ok)}**.`;
      return finish(
        `A simply supported beam spans **${L} m**. It carries a uniformly distributed load of **${w} kN/m** (including its own weight) and a point load of **${P} kN** at midspan. ${sectionNote(sigma)}`,
        parts, ex, "civ-beam3", { tier, L, w, P, sigma, Zs }, [["_L", L], ["_w", w], ["_P", P], ["_sigma", sigma]],
        ["With a point load at midspan the maximum moment is at midspan.", "Units: kN·m to N·mm, then divide by the stress."],
      );
    }
    // expert-plus: capacity first, then the load it can carry, then a two-column verdict
    const L = rng.pick([4, 5, 6, 8]), w = rng.pick([2, 3, 4, 5, 6]);
    const sigma = rng.pick(SIGMAS), Z = rng.int(4, 60) * 50;
    const Mcap = (Z * sigma) / 1000;
    const Pmax = (4 * (Mcap - (w * L * L) / 8)) / L;
    if (!isEx(Mcap, 1) || !isEx(Pmax, 1) || Pmax < 10 || Pmax > 150) continue;
    const wantB = rng.next() < 0.5, wantS = rng.next() < 0.5;
    const P = wantB ? Math.floor(Pmax) - rng.int(1, 8) : Math.ceil(Pmax) + rng.int(1, 8);
    if (P < 4 || Math.abs(P - Pmax) < 0.9) continue;
    const R = P / 2 + (w * L) / 2;
    if (!isEx(R, 1)) continue;
    const Rcap = wantS ? Math.ceil(R) + rng.pick([1, 2, 4]) : Math.floor(R) - rng.pick([1, 2, 4]);
    if (Rcap < 3 || Math.abs(Rcap - R) < 0.9) continue;
    const parts = [
      numPart("mcap", "Moment capacity", "Moment capacity of the section (kN·m)", Mcap, 1, `Capacity M = Z × allowable stress. Z is in cm³ (× 10³ for mm³) and the stress is ${sigma} N/mm²; divide by 10⁶ to get kN·m.`),
      numPart("pmax", "Largest point load", "Largest central point load the beam can carry (kN)", Pmax, 1, "Work backwards: the moment capacity minus the UDL's share (wL²/8) is what is left for the point load, and the point load's share is PL/4."),
      numPart("r", "Support reaction", `Reaction at each support under the planned point load of ${P} kN (kN)`, R, 1, "By symmetry each support takes half of the total load: the point load plus the UDL over the whole span."),
      segPart2(rng, "verdict", "Verdict", `The planned point load is **${P} kN** at midspan, and each support can take at most **${Rcap} kN**. Judge the beam for bending and for the supports.`, ["Bending", "Support"], ["OK", "Overstressed"], ["OK", "Exceeds"], [P <= Pmax ? "OK" : "Overstressed", R <= Rcap ? "OK" : "Exceeds"],
        "Bending is fine if the planned load does not exceed the largest load you found. The support is fine if its reaction is no more than the stated limit."),
    ];
    const ex = `**Moment capacity:** ${commas(Z)} × 10³ × ${sigma} = ${commas(Z * sigma * 1000)} N·mm = **${f(Mcap)} kN·m**.\n\n**Largest point load:** PL/4 + wL²/8 = ${f(Mcap)}, so P = 4 × (${f(Mcap)} − ${f((w * L * L) / 8)}) ÷ ${L} = **${f(Pmax)} kN**.\n\n**Reaction:** (${P} + ${w} × ${L}) ÷ 2 = **${f(R)} kN**.\n\n**Verdict:** ${P} kN is ${P <= Pmax ? "no more than" : "more than"} ${f(Pmax)} kN: **${P <= Pmax ? "OK" : "Overstressed"}** in bending; ${f(R)} kN is ${R <= Rcap ? "no more than" : "more than"} ${Rcap} kN: **${R <= Rcap ? "OK" : "Exceeds"}** at the supports.`;
    return finish(
      `A simply supported beam spans **${L} m** and carries its own weight and finishes as a uniform load of **${w} kN/m**. Its section has Z = **${commas(Z)} cm³**. ${sectionNote(sigma)} A point load will be placed at midspan.`,
      parts, ex, "civ-beam4", { tier, L, w, sigma, Z, P, Rcap }, [["_L", L], ["_w", w], ["_Z", Z], ["_sigma", sigma]],
      ["Find the capacity of the section first, then work backwards to the load.", "Two checks: bending and the supports."],
    );
  }
  return tooMany();
}

// ---------- tie-rod ----------

const E_GPA = 200;
const DIAMS = [10, 12, 16, 20, 25, 32, 40];
const area = (d) => (Math.PI * d * d) / 4;
const rodNote = `Steel: E = **${E_GPA} GPa**; stress = force ÷ area; strain = stress ÷ E.`;
const extOf = (s, L) => (s * L) / E_GPA; // mm, s in MPa, L in m (s x L x 1000 mm / (E x 1000 MPa))

function genTie(rng, tier) {
  let tieTarget; // expert-plus only: drawn on first use so the other tiers keep their seeds
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const A = rng.int(6, 60) * 25, P = rng.int(4, 160) * 2.5, Y = rng.pick([235, 250, 275, 355]);
      const s = (P * 1000) / A, fos = Y / s;
      if (!isEx(s, 0) || fos < 1.5 || fos > 6 || nearHalf(fos, 1, 0.08)) continue;
      const parts = [
        numPart("s", "Stress", "Tensile stress in the rod (MPa)", s, 0, "Stress = force ÷ area. With the force in N and the area in mm² the answer is in MPa (N/mm²); 1 kN = 1000 N."),
        numPart("fos", "Factor of safety", "Factor of safety against yield", fos, 1, "Factor of safety = yield stress ÷ working stress."),
      ];
      const ex = `**Stress:** ${P} × 1000 ÷ ${A} = **${s} MPa**.\n\n**Factor of safety:** ${Y} ÷ ${s} = **${roundTo(fos, 1).toFixed(1)}**.`;
      return finish(
        `A steel tie rod has a cross-section of **${A} mm²** and carries a steady tension of **${P} kN**. The yield stress of the steel is **${Y} MPa**.`,
        parts, ex, "civ-tie1", { tier, A, P, Y }, [["_A", A], ["_P", P], ["_Y", Y]],
        ["Convert kN to N, then divide by the area.", "The factor of safety compares the yield stress with the working stress."],
      );
    }
    const d = rng.pick([12, 14, 16, 18, 20, 22, 24, 25, 28, 30]), L = rng.pick([1.5, 2, 2.5, 3, 3.5, 4, 5]);
    const A = area(d), Ar = roundTo(A, 0);
    if (tier === "hard") {
      const P = rng.int(4, 80) * 2.5;
      const s = (P * 1000) / A, sr = roundTo((P * 1000) / Ar, 0);
      if (s < 40 || s > 170 || roundTo(s, 0) !== sr || nearHalf(s, 0, 0.12)) continue;
      const ext = extOf(s, L), extR = extOf(sr, L);
      if (roundTo(ext, 2) !== roundTo(extR, 2) || nearHalf(ext, 2, 0.2) || ext < 0.2) continue;
      const parts = [
        numPart("a", "Area", "Cross-sectional area of the rod (mm²)", A, 0, "A circle's area is π × d² ÷ 4, with the diameter in mm.", true),
        numPart("s", "Stress", "Tensile stress in the rod (MPa)", s, 0, "Stress = force in N ÷ area in mm².", true),
        numPart("ext", "Extension", "Extension of the rod under the load (mm)", ext, 2, "Extension = strain × length = (stress ÷ E) × length. With stress in MPa and E in GPa (× 1000 for MPa), and the length in mm."),
      ];
      const ex = `**Area:** π × ${d}² ÷ 4 = ${roundTo(A, 2)} = **${Ar} mm²**.\n\n**Stress:** ${P} × 1000 ÷ ${Ar} = **${sr} MPa**.\n\n**Extension:** ${sr} ÷ ${E_GPA * 1000} × ${L * 1000} = **${roundTo(extR, 2).toFixed(2)} mm**.`;
      return finish(
        `A steel tie rod of diameter **${d} mm** and length **${L} m** carries a steady tension of **${P} kN**. ${rodNote}`,
        parts, ex, "civ-tie2", { tier, d, L, P }, [["_d", d], ["_L", L], ["_P", P]],
        ["Area first, then stress, then extension.", "Keep the length in mm and E in MPa (1 GPa = 1000 MPa) for the extension."],
      );
    }
    if (tier === "expert") {
      const P = rng.int(2, 60) * 5, Y = rng.pick([250, 355]), nmin = rng.pick([1.5, 1.8, 2.0, 2.2]);
      const s = (P * 1000) / A, sr = roundTo((P * 1000) / Ar, 0);
      if (s < 40 || s > Y / 1.2 || roundTo(s, 0) !== sr || nearHalf(s, 0, 0.12)) continue;
      const fos = Y / s, fosR = Y / sr;
      if (roundTo(fos, 1) !== roundTo(fosR, 1) || nearHalf(fos, 1, 0.1) || Math.abs(fos - nmin) < 0.1 || (fos >= nmin) !== (fosR >= nmin)) continue;
      const ext = extOf(s, L), extR = extOf(sr, L);
      if (roundTo(ext, 2) !== roundTo(extR, 2) || nearHalf(ext, 2, 0.2) || ext < 0.2) continue;
      const want = rng.next() < 0.5; // balance Yes/No: redraw until the verdict matches the coin
      if ((fos >= nmin) !== want) continue;
      const parts = [
        numPart("s", "Stress", "Tensile stress in the rod (MPa)", s, 0, "Area = π d² ÷ 4 in mm²; stress = force in N ÷ area.", true),
        numPart("ext", "Extension", "Extension of the rod (mm)", ext, 2, "Extension = (stress ÷ E) × length, with E in MPa and the length in mm."),
        numPart("fos", "Factor of safety", "Factor of safety against yield", fos, 1, "Yield stress ÷ working stress."),
        yesNo("ok", "Meets the minimum?", `The design rule asks for a factor of safety of at least **${nmin.toFixed(1)}**. Does the rod meet it?`, fos >= nmin, "Compare your factor of safety with the stated minimum."),
      ];
      const ex = `**Stress:** area = π × ${d}² ÷ 4 = ${roundTo(A, 2)} mm²; ${P} × 1000 ÷ ${roundTo(A, 2)} = **${sr} MPa**.\n\n**Extension:** ${sr} ÷ ${E_GPA * 1000} × ${L * 1000} = **${roundTo(extR, 2).toFixed(2)} mm**.\n\n**Factor of safety:** ${Y} ÷ ${sr} = **${roundTo(fosR, 1).toFixed(1)}**.\n\n**Meets the minimum?** ${roundTo(fosR, 1).toFixed(1)} is ${fos >= nmin ? "at least" : "below"} ${nmin.toFixed(1)}: **${YN(fos >= nmin)}**.`;
      return finish(
        `A steel tie rod of diameter **${d} mm** and length **${L} m** carries a steady tension of **${P} kN**. The yield stress is **${Y} MPa**. ${rodNote}`,
        parts, ex, "civ-tie3", { tier, d, L, P, Y, nmin }, [["_d", d], ["_L", L], ["_P", P], ["_Y", Y]],
        ["Stress, then extension, then the factor of safety.", "Round only as each part asks; the later answers do not change if you use the rounded stress."],
      );
    }
    // expert-plus: size the rod from a minimum factor of safety, then check its stiffness
    if (tieTarget === undefined) tieTarget = rng.int(0, DIAMS.length - 1); // spread the right size over the whole list
    const P = rng.int(2, 60) * 5, Y = rng.pick([250, 355]), n = rng.pick([1.5, 2, 2.5, 3]);
    const Areq = (P * 1000 * n) / Y;
    const idx = DIAMS.findIndex((x) => area(x) >= Areq);
    if (idx < 0 || idx !== tieTarget || Areq < 60) continue;
    const dc = DIAMS[idx], Ac = area(dc);
    if (Areq > 0.97 * Ac || (idx > 0 && area(DIAMS[idx - 1]) > Areq / 1.03)) continue;
    const ext = (P * L * 1000) / (Ac * E_GPA);
    if (ext < 0.3 || nearHalf(ext, 2, 0.2)) continue;
    const want = rng.next() < 0.5;
    const limit = want ? Math.ceil(ext * 10) / 10 + rng.pick([0.1, 0.2, 0.3]) : Math.floor(ext * 10) / 10 - rng.pick([0.1, 0.2]);
    if (limit < 0.2 || Math.abs(limit - ext) < 0.1 || (ext <= limit) !== want) continue;
    const opts = DIAMS.map((x) => `${x} mm`);
    const parts = [
      numPart("areq", "Minimum area", "Minimum area for the required factor of safety (mm²)", Areq, 0, "The working stress must not exceed yield ÷ factor of safety, so the area must be at least force ÷ (yield ÷ FoS).", true),
      { id: "dia", label: "Standard size", ask: "Smallest standard diameter that gives at least that area", answerType: "choice", answer: `${dc} mm`, choices: shuffled(rng, opts), hint: "Work out π × d² ÷ 4 for the listed diameters and take the smallest one whose area reaches your minimum." },
      numPart("ext", "Extension", "Extension of that standard rod under the load (mm)", ext, 2, "Use the exact area of the standard rod you chose: extension = force × length ÷ (area × E), in consistent units (mm, N, MPa)."),
      yesNo("ok", "Stiff enough?", `The rod may stretch by at most **${f(limit)} mm**. Is the chosen rod stiff enough?`, ext <= limit, "Compare the extension you found with the stated limit."),
    ];
    const ex = `**Minimum area:** ${P} × 1000 × ${n} ÷ ${Y} = **${roundTo(Areq, 0)} mm²**.\n\n**Standard size:** areas are ${DIAMS.map((x) => `${x} mm: ${roundTo(area(x), 0)}`).join(", ")} mm²; the smallest that reaches ${roundTo(Areq, 0)} is **${dc} mm** (${roundTo(Ac, 1)} mm²).\n\n**Extension:** ${P} × 1000 × ${L * 1000} ÷ (${roundTo(Ac, 1)} × ${E_GPA * 1000}) = **${roundTo(ext, 2).toFixed(2)} mm**.\n\n**Stiff enough?** ${roundTo(ext, 2).toFixed(2)} mm is ${ext <= limit ? "within" : "more than"} ${f(limit)} mm: **${YN(ext <= limit)}**.`;
    return finish(
      `A steel tie rod of length **${L} m** must carry a steady tension of **${P} kN** with a factor of safety against yield of at least **${n}** (yield stress **${Y} MPa**). Standard rod diameters are ${opts.join(", ")}. ${rodNote}`,
      parts, ex, "civ-tie4", { tier, L, P, Y, n, limit }, [["_P", P], ["_Y", Y], ["_n", n], ["_L", L]],
      ["Size the rod from the allowed stress, then check how far it stretches.", "Take the smallest standard size that is big enough."],
    );
  }
  return tooMany();
}

// ---------- concrete-batches ----------

const FOUND = ["a ground-floor slab", "a garage floor", "a yard slab", "a loading-bay slab"];
function genConcrete(rng, tier) {
  const C = rng.pick([4, 6, 8]), price = rng.pick([120, 130, 140, 150, 160]);
  const FORM = rng.pick(FOUND);
  const wantWaste = rng.next() < 0.5; // decide the verdict first (once), then pick an allowance that gives it
  for (let i = 0; i < TRY; i++) {
    const L = rng.int(6, 24) / 2, W = rng.int(4, 14) / 2, t = rng.pick([100, 150, 200, 250]);
    const V = (L * W * t) / 1000;
    if (!isEx(V, 2) || V < 1.5 || V > 36) continue;
    const dims = `**${f(L)} m** long, **${f(W)} m** wide and **${t} mm** thick`;
    const truck = `Ready-mixed concrete is delivered in trucks of **${C} m³**, and only whole trucks can be ordered.`;
    if (tier === "medium") {
      const trucks = Math.ceil(V / C);
      if (!fracOK(V / C)) continue;
      const parts = [
        numPart("v", "Volume", "Volume of concrete needed (m³)", V, 2, "Volume = length × width × thickness, with the thickness in metres (÷ 1000)."),
        numPart("n", "Trucks", "Number of trucks to order", trucks, 0, "Divide the volume by the truck size and round up: a part-load still needs a whole truck."),
      ];
      const ex = `**Volume:** ${f(L)} × ${f(W)} × ${t / 1000} = **${f(V)} m³**.\n\n**Trucks:** ${f(V)} ÷ ${C} = ${roundTo(V / C, 2)}, rounded up to **${trucks}**.`;
      return finish(`${FORM[0].toUpperCase()}${FORM.slice(1)} is ${dims}. ${truck}`, parts, ex, "civ-conc1", { tier, L, W, t, C }, [["_L", L], ["_W", W], ["_t", t], ["_C", C]],
        ["Convert the thickness to metres first.", "Round the truck count up."]);
    }
    if (tier === "hard") {
      const w = rng.pick([5, 10]), order = V * (1 + w / 100);
      if (!isEx(order, 2) || !fracOK(order / C)) continue;
      const trucks = Math.ceil(order / C), cost = trucks * C * price;
      const parts = [
        numPart("v", "Volume", "Volume of the slab (m³)", V, 2, "Volume = length × width × thickness (in metres)."),
        numPart("n", "Trucks", `Number of trucks to order, allowing ${w}% extra for waste`, trucks, 0, `Add ${w}% to the volume first, divide by the truck size, then round up.`),
        numPart("c", "Cost", "Cost of the concrete ($)", cost, 0, `Every truck is billed in full: trucks × ${C} m³ × the price per m³.`),
      ];
      const ex = `**Volume:** ${f(L)} × ${f(W)} × ${t / 1000} = **${f(V)} m³**.\n\n**Trucks:** ${f(V)} × ${1 + w / 100} = ${f(order)} m³; ÷ ${C} = ${roundTo(order / C, 2)}, rounded up to **${trucks}**.\n\n**Cost:** ${trucks} × ${C} × ${price} = **$${commas(cost)}**.`;
      return finish(`${FORM[0].toUpperCase()}${FORM.slice(1)} is ${dims}. ${truck} Concrete is billed for the full size of every truck, at **$${price} per m³**. Allow **${w}%** extra for waste.`, parts, ex, "civ-conc2",
        { tier, L, W, t, C, w, price }, [["_L", L], ["_W", W], ["_t", t], ["_C", C], ["_price", price]],
        ["Slab volume, then add the waste allowance, then trucks.", "Billing is for whole trucks."]);
    }
    if (tier === "expert") {
      const n = rng.pick([4, 6, 8, 9, 12]), a = rng.pick([0.8, 1, 1.2, 1.5, 1.8, 2]), b = rng.pick([0.8, 1, 1.2, 1.5, 2]), h = rng.pick([300, 400, 500, 600]);
      const Vp = (n * a * b * h) / 1000, VT = V + Vp, w = rng.pick([5, 8, 10]);
      const order = VT * (1 + w / 100);
      if (!isEx(Vp, 2) || !isEx(VT, 2) || VT > 48 || !isEx(order, 2) || !fracOK(order / C)) continue;
      const trucks = Math.ceil(order / C), cost = trucks * C * price;
      const parts = [
        numPart("v", "Total volume", "Total volume of concrete in the slab and the pads (m³)", VT, 2, "Slab: length × width × thickness. Pads: number × length × width × depth. Use metres, then add."),
        numPart("o", "Order volume", `Volume to order, with ${w}% extra for waste (m³)`, order, 2, `Multiply the total volume by 1 + ${w}/100.`),
        numPart("n", "Trucks", "Number of trucks to order", trucks, 0, "Order volume ÷ truck size, rounded up."),
        numPart("c", "Cost", "Cost of the concrete ($)", cost, 0, `Whole trucks × ${C} m³ × the price per m³.`),
      ];
      const ex = `**Total volume:** slab ${f(L)} × ${f(W)} × ${t / 1000} = ${f(V)} m³; pads ${n} × ${f(a)} × ${f(b)} × ${h / 1000} = ${f(Vp)} m³; total **${f(VT)} m³**.\n\n**Order volume:** ${f(VT)} × ${1 + w / 100} = **${f(order)} m³**.\n\n**Trucks:** ${f(order)} ÷ ${C} = ${roundTo(order / C, 2)}, rounded up to **${trucks}**.\n\n**Cost:** ${trucks} × ${C} × ${price} = **$${commas(cost)}**.`;
      return finish(`A building has ${FORM} ${dims}, and **${n}** pad footings, each **${f(a)} m** by **${f(b)} m** and **${h} mm** deep. All are cast from the same mix. ${truck} Concrete is billed for the full size of every truck, at **$${price} per m³**. Allow **${w}%** extra for waste.`,
        parts, ex, "civ-conc3", { tier, L, W, t, n, a, b, h, C, w, price }, [["_L", L], ["_W", W], ["_t", t], ["_n", n], ["_C", C], ["_price", price]],
        ["Add the slab and the pads before applying the waste allowance.", "Round up only at the truck count."]);
    }
    // expert-plus: work backwards from trucks delivered and concrete left over
    const T = Math.ceil(V / C);
    if (!fracOK(V / C, 0.02) || V < 3) continue;
    const r = T * C - V, TC = T * C;
    const pct = (r / TC) * 100;
    const allows = [5, 8, 10, 15, 20, 25].filter((x) => (wantWaste ? x > pct + 1 : x < pct - 1));
    if (!isEx(r, 2) || r < 0.1 || !allows.length) continue;
    const allow = rng.pick(allows);
    const okWaste = r / TC <= allow / 100;
    const cpm = (TC * price) / V;
    if (nearHalf(cpm, 2, 0.15)) continue;
    const parts = [
      numPart("v", "Volume placed", "Volume of concrete actually placed (m³)", V, 2, "Concrete delivered (trucks × truck size) minus the amount left over."),
      numPart("len", "Slab length", "Length of slab poured (m)", L, 1, "Volume = length × width × thickness (in metres), so length = volume ÷ (width × thickness)."),
      numPart("cpm", "Cost per m³ placed", "Cost of the concrete per m³ actually placed ($)", cpm, 2, "Total bill (all trucks billed in full) divided by the volume placed."),
      yesNo("ok", "Waste acceptable?", `The site rule allows up to **${allow}%** of the ordered volume to be left over. Was the leftover within the allowance?`, okWaste, "Leftover ÷ ordered volume, as a percentage, against the allowance."),
    ];
    const ex = `**Volume placed:** ${T} × ${C} − ${f(r)} = **${f(V)} m³**.\n\n**Slab length:** ${f(V)} ÷ (${f(W)} × ${t / 1000}) = **${f(L)} m**.\n\n**Cost per m³ placed:** total bill ${T} × ${C} × ${price} = $${commas(TC * price)}; ÷ ${f(V)} = **$${roundTo(cpm, 2).toFixed(2)}**.\n\n**Waste:** ${f(r)} ÷ ${TC} = ${roundTo((r / TC) * 100, 1)}%, ${okWaste ? "no more than" : "more than"} ${allow}%: **${YN(okWaste)}**.`;
    return finish(`${FORM[0].toUpperCase()}${FORM.slice(1)} is poured in one go, **${f(W)} m** wide and **${t} mm** thick. **${T}** trucks of **${C} m³** were delivered, and **${f(r)} m³** was left over, unused. Concrete is billed for the full size of every truck, at **$${price} per m³**.`,
      parts, ex, "civ-conc4", { tier, W, t, C, T, r, price, allow, L }, [["_W", W], ["_t", t], ["_trucks", T], ["_C", C], ["_left", r], ["_price", price]],
      ["Work backwards from the amount delivered and the amount left over.", "Percentage waste is the leftover over the ordered volume."]);
  }
  return tooMany();
}

// ---------- setting-out ----------

const NS = [8, 10, 20, 25, 40, 50];
function genSetting(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const N = rng.pick(NS), L = rng.int(12, 80) * 5, rise = L / N;
      if (!isEx(rise, 2) || rise < 1) continue;
      const pct = 100 / N;
      const parts = [
        numPart("rise", "Level difference", "Rise over the whole length (m)", rise, 2, "1 in N means 1 m of rise for every N m of horizontal length: rise = length ÷ N."),
        numPart("pct", "Gradient as %", "The same gradient as a percentage", pct, 1, "Percentage gradient = rise ÷ length × 100, which is 100 ÷ N."),
      ];
      const ex = `**Rise:** ${L} ÷ ${N} = **${f(rise)} m**.\n\n**Percentage:** 100 ÷ ${N} = **${roundTo(pct, 1).toFixed(1)}%**.`;
      return finish(`A road rises at a gradient of **1 in ${N}** over a horizontal length of **${L} m**. (1 in ${N} means 1 m of rise for every ${N} m along.)`,
        parts, ex, "civ-set1", { tier, N, L }, [["_N", N], ["_L", L]],
        ["Rise is the length divided by N.", "A percentage gradient is the rise over the length times 100."]);
    }
    if (tier === "hard") {
      const N = rng.pick([20, 25, 40, 50, 100]), L = rng.int(10, 50) * 10, rise = L / N;
      if (!isEx(rise, 2)) continue;
      const R0 = rng.int(300, 900) / 10, up = rng.next() < 0.5, F1 = up ? R0 + rise : R0 - rise;
      const d = rng.int(2, 16) * 0.25, cut = rng.next() < 0.5, G = cut ? F1 + d : F1 - d;
      const cands = [Math.abs(G - R0), rise, d + rise, Math.abs(d - rise)].map((x) => +x.toFixed(2)).filter((x) => x > 0 && Math.abs(x - d) > 0.004);
      if (!cands.length) continue;
      const wrong = rng.pick([...new Set(cands)]);
      const s = (x) => `${x.toFixed(2)} m`;
      const parts = [
        numPart("rise", "Level difference", "Change in level over the length (m)", rise, 2, "1 in N means 1 m of rise or fall per N m along: change = length ÷ N."),
        numPart("f", "Formation at far end", "Formation level at the far end (m RL)", F1, 2, `The road ${up ? "rises" : "falls"}, so ${up ? "add the change in level to" : "subtract the change in level from"} the starting formation level.`),
        segPart2(rng, "cf", "Cut or fill", `Existing ground at the far end is at **${f(G)} m RL**. Is it cut or fill there, and by how much?`, ["Operation", "Depth"], ["Cut", "Fill"], [s(d), s(wrong)], [cut ? "Cut" : "Fill", s(d)],
          "Cut means the ground is above the formation (dig it out); fill means it is below (build it up). The depth is the difference between the two levels at the far end."),
      ];
      const ex = `**Change in level:** ${L} ÷ ${N} = **${f(rise)} m**.\n\n**Formation at far end:** ${f(R0)} ${up ? "+" : "−"} ${f(rise)} = **${f(F1)} m**.\n\n**Cut or fill:** the ground (${f(G)} m) is ${cut ? "above" : "below"} the formation (${f(F1)} m), so it is **${cut ? "cut" : "fill"}**, depth ${f(Math.abs(G - F1))} m.`;
      return finish(`A road's formation level (the level the earthworks are cut down or filled up to, before the road layers go on) is at **${f(R0)} m RL** at the start and ${up ? "rises" : "falls"} at **1 in ${N}** over a horizontal length of **${L} m**. Cut means the existing ground is above the formation, fill means it is below.`,
        parts, ex, "civ-set2", { tier, N, L, R0, up, G, d, cut }, [["_R0", R0], ["_N", N], ["_L", L], ["_G", G]],
        ["Find the change in level, then the formation level at the far end.", "Compare the formation with the ground."]);
    }
    if (tier === "expert") {
      const N = rng.pick([20, 25, 40, 50]), L = rng.pick([40, 60, 80, 100, 120]), rise = L / N;
      if (!isEx(rise, 2)) continue;
      const w = rng.pick([4, 5, 6, 8]), G = rng.int(400, 900) / 10, d1 = rng.int(2, 8) * 0.25, deeper = rng.next() < 0.5;
      const f0 = G - d1, f1 = deeper ? f0 - rise : f0 + rise, d2 = G - f1;
      if (d2 < 0.3) continue;
      const V = (w * L * (d1 + d2)) / 2;
      const loose = V * 1.25, Cl = rng.pick([6, 8, 10, 12]);
      if (!isEx(V, 0) || V < 20 || !isEx(loose, 2) || !fracOK(loose / Cl, 0.02)) continue;
      const loads = Math.ceil(loose / Cl);
      const parts = [
        numPart("f", "Formation at end", "Formation level at the far end (m RL)", f1, 2, `The road ${deeper ? "falls" : "rises"} by length ÷ N over its length.`),
        numPart("v", "Volume of cut", "Volume of cut, measured in the ground (m³)", V, 0, "Volume = width × length × average depth, where the average depth is the mean of the depths at the two ends."),
        numPart("l", "Loose volume", "Volume of the excavated soil once loosened (m³)", loose, 2, "Loose volume = 1.25 × the volume measured in the ground."),
        numPart("n", "Lorry loads", "Number of lorry loads to remove it", loads, 0, `Loose volume ÷ ${Cl} m³ per lorry, rounded up.`),
      ];
      const ex = `**Formation at far end:** ${f(f0)} ${deeper ? "−" : "+"} ${L} ÷ ${N} = ${f(f0)} ${deeper ? "−" : "+"} ${f(rise)} = **${f(f1)} m**.\n\n**Volume of cut:** depth at the start = ${f(G)} − ${f(f0)} = ${f(d1)} m; at the end = ${f(G)} − ${f(f1)} = ${f(d2)} m; V = ${w} × ${L} × (${f(d1)} + ${f(d2)}) ÷ 2 = **${f(V)} m³**.\n\n**Loose volume:** ${f(V)} × 1.25 = **${f(loose)} m³**.\n\n**Lorry loads:** ${f(loose)} ÷ ${Cl} = ${roundTo(loose / Cl, 2)}, rounded up to **${loads}**.`;
      return finish(`A road cutting is **${w} m** wide with vertical sides and **${L} m** long. The ground is level at **${f(G)} m RL**. The formation is at **${f(f0)} m RL** at the start and ${deeper ? "falls" : "rises"} at **1 in ${N}** along the cutting. Soil swells by 25% when dug (loose volume = 1.25 × volume in the ground), and each lorry carries **${Cl} m³** of loose soil.`,
        parts, ex, "civ-set3", { tier, N, L, w, G, f0, d1, deeper, Cl }, [["_w", w], ["_L", L], ["_G", G], ["_f0", f0], ["_N", N]],
        ["Depths at the two ends come from the ground level and the formation level.", "Swell before you count lorries."]);
    }
    // expert-plus: levels to slope angle to tape length, then a tolerance call
    const H = rng.int(4, 16) * 5, R0 = rng.int(300, 900) / 10, rise = rng.int(2, Math.floor(H / 5) * 4) * 0.25;
    if (rise / H > 0.2) continue;
    const R1 = R0 + rise, ang = (Math.atan(rise / H) * 180) / Math.PI, S = Math.hypot(H, rise);
    const angR = roundTo(ang, 1), SR = H / Math.cos((angR * Math.PI) / 180);
    if (nearHalf(ang, 1, 0.15) || nearHalf(S, 1, 0.2) || roundTo(S, 1) !== roundTo(SR, 1)) continue;
    const S1 = roundTo(S, 1), within = rng.next() < 0.5;
    const delta = within ? rng.pick([0, 0.1]) : rng.pick([0.3, 0.5]), meas = S1 + (rng.next() < 0.5 ? -delta : delta);
    const parts = [
      numPart("rise", "Level difference", "Height of the peg above the datum (m)", rise, 2, "The peg's design level minus the datum level."),
      numPart("ang", "Slope angle", "Angle of the slope above the horizontal (degrees)", ang, 1, "tan(angle) = rise ÷ horizontal distance. Use the inverse tangent."),
      numPart("s", "Tape length", "Distance to measure along the sloping ground (m)", S, 1, "The slope distance is the hypotenuse: use Pythagoras with the horizontal distance and the rise."),
      yesNo("ok", "Peg within tolerance?", `The crew measures **${f(meas)} m** along the slope. The tape length is accepted if it is within **0.20 m** of the exact slope distance. Is it accepted?`, within, "Compare the crew's reading with your slope distance."),
    ];
    const ex = `**Height above datum:** ${f(R1)} − ${f(R0)} = **${f(rise)} m**.\n\n**Slope angle:** tan⁻¹(${f(rise)} ÷ ${H}) = **${angR.toFixed(1)}°**.\n\n**Tape length:** √(${H}² + ${f(rise)}²) = **${S1.toFixed(1)} m**.\n\n**Accepted?** |${f(meas)} − ${S1.toFixed(1)}| = ${f(Math.abs(meas - S1))} m, ${within ? "within" : "more than"} 0.20 m: **${YN(within)}**.`;
    return finish(`A peg is to be set out up a uniform slope at a horizontal distance of **${H} m** from a datum peg. The datum is at **${f(R0)} m RL** and the peg's design level is **${f(R1)} m RL**. The slope distance is what a tape measures along the ground.`,
      parts, ex, "civ-set4", { tier, H, R0, R1, meas }, [["_H", H], ["_R0", R0], ["_R1", R1]],
      ["The level difference and the horizontal distance form a right-angled triangle.", "Work backwards from the levels to the angle."]);
  }
  return tooMany();
}

// ---------- pipe-drainage ----------

const PIPE_D = [100, 150, 200, 225, 250, 300];
const STOCK_D = [100, 150, 200, 250, 300, 350, 400, 450];
const GRAV = 9.81;
const waterNote = "Water has a density of **1000 kg/m³**, and g = **9.81 N/kg**.";
const boreArea = (dmm) => (Math.PI * (dmm / 1000) ** 2) / 4; // m², diameter in mm
const BLOCKS = ["00:00–04:00", "04:00–08:00", "08:00–12:00", "12:00–16:00", "16:00–20:00", "20:00–24:00"];

function genPipe(rng, tier) {
  let pipeTarget; // expert-plus only: drawn on first use so the answer spreads over the stock list
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const d = rng.pick(PIPE_D), v = rng.int(6, 20) / 10, V = rng.int(4, 60) * 5;
      const Q = boreArea(d) * v * 1000; // L/s
      const t = (V * 1000) / Q / 60, tR = (V * 1000) / roundTo(Q, 1) / 60;
      if (nearHalf(Q, 1, 0.1) || nearHalf(t, 0, 0.1) || roundTo(t, 0) !== roundTo(tR, 0) || t < 5 || t > 600) continue;
      const parts = [
        numPart("q", "Flow rate", "Flow rate when the main runs full (L/s)", Q, 1, "Area of the bore = π × d² ÷ 4 with d in metres. Flow in m³/s = area × velocity; multiply by 1000 for litres per second."),
        numPart("t", "Filling time", "Time to fill the empty tank at that flow (minutes)", t, 0, "Tank volume in litres ÷ flow in L/s gives seconds; then convert the seconds to minutes.", true),
      ];
      const ex = `**Flow rate:** area = π × ${f(d / 1000)}² ÷ 4 = ${roundTo(boreArea(d), 5)} m²; Q = area × ${f(v)} = ${roundTo(Q / 1000, 5)} m³/s = **${roundTo(Q, 1).toFixed(1)} L/s**.\n\n**Filling time:** ${commas(V * 1000)} L ÷ ${roundTo(Q, 1).toFixed(1)} L/s = ${commas(roundTo((V * 1000) / Q, 0))} s ÷ 60 = **${roundTo(t, 0)} minutes**.`;
      return finish(
        `A water main with an internal diameter of **${d} mm** runs full at a mean velocity of **${f(v)} m/s**. It fills an empty storage tank of **${V} m³** (1 m³ = 1000 L).`,
        parts, ex, "civ-pipe1", { tier, d, v, V }, [["_d", d], ["_vel", v], ["_vol", V]],
        ["Flow = area × velocity, with the area from the internal diameter in metres.", "Then time = volume ÷ flow, keeping litres with L/s."],
      );
    }
    if (tier === "hard") {
      const N = rng.pick([40, 50, 60, 75, 80, 100, 120, 150, 200]), L = rng.int(4, 30) * 5, fall = L / N;
      if (!isEx(fall, 2) || fall < 0.1) continue;
      const ILa = rng.int(3000, 9000) / 100, ILb = roundTo(ILa - fall, 2);
      const L2 = rng.int(2, 20) * 5, out = ILb - L2 / N;
      if (nearHalf(out, 2, 0.1)) continue;
      const want = rng.next() < 0.5, clr = rng.pick([0.15, 0.2, 0.3]), gap = rng.pick([0.05, 0.1, 0.2, 0.4]);
      const F = roundTo(want ? out - clr - gap : out - clr + gap, 2);
      const ok = out - F >= clr;
      if (ok !== want || ok !== roundTo(out, 2) - F >= clr - 1e-9) continue;
      const parts = [
        numPart("n", "Gradient", "Gradient of the drain from A to B, written as 1 in N (give N)", N, 0, "Fall = invert at A − invert at B. N = horizontal length ÷ fall.", true),
        numPart("out", "Outfall invert", "Invert level at the outfall (m RL)", out, 2, "Over the extra length the drain falls by that length ÷ N. Subtract this from the invert at B."),
        yesNo("ok", "Clear of the flood?", `The outfall invert must be at least **${clr.toFixed(2)} m** above the river's design flood level of **${F.toFixed(2)} m RL**. Is it?`, ok, "Subtract the flood level from the outfall invert and compare the gap with the clearance."),
      ];
      const ex = `**Gradient:** fall = ${ILa.toFixed(2)} − ${ILb.toFixed(2)} = ${f(fall)} m; N = ${L} ÷ ${f(fall)} = **${N}**, so 1 in ${N}.\n\n**Outfall invert:** extra fall = ${L2} ÷ ${N} = ${roundTo(L2 / N, 4)} m; ${ILb.toFixed(2)} − ${roundTo(L2 / N, 4)} = **${roundTo(out, 2).toFixed(2)} m RL**.\n\n**Clear of the flood?** ${roundTo(out, 2).toFixed(2)} − ${F.toFixed(2)} = ${roundTo(out - F, 2).toFixed(2)} m, ${ok ? "at least" : "less than"} ${clr.toFixed(2)} m: **${YN(ok)}**.`;
      return finish(
        `A surface-water drain runs from manhole A (invert level **${ILa.toFixed(2)} m RL**) to manhole B (invert level **${ILb.toFixed(2)} m RL**), a horizontal distance of **${L} m**. The invert is the inside bottom of the pipe. From B the drain continues at the same gradient for a further **${L2} m** to an outfall on a river.`,
        parts, ex, "civ-pipe2", { tier, ILa, ILb, L, L2, clr, F }, [["_ILa", ILa], ["_ILb", ILb], ["_L", L], ["_L2", L2]],
        ["A gradient of 1 in N means 1 m of fall for every N m along.", "The drain keeps the same gradient all the way to the outfall."],
      );
    }
    if (tier === "expert") {
      const sump = rng.int(1000, 6000) / 100, top = roundTo(sump + rng.int(500, 4000) / 100, 2), hf = rng.int(5, 60) / 10;
      const Q = rng.int(5, 80), eta = rng.pick([55, 60, 65, 70, 72, 75, 78, 80, 85]), hrs = rng.pick([4, 6, 8, 10, 12, 16, 20]);
      const price = rng.pick([0.12, 0.15, 0.18, 0.2, 0.22, 0.25, 0.28, 0.3]);
      const H = roundTo(top - sump + hf, 2);
      const P = (GRAV * Q * H) / 1000; // kW: 1000 kg/m³ × g × Q/1000 m³/s × H, in W, ÷ 1000
      const Pin = P / (eta / 100), PinR = roundTo(P, 2) / (eta / 100);
      const cost = Pin * hrs * price, costR = roundTo(Pin, 2) * hrs * price;
      if (P < 0.5 || nearHalf(P, 2, 0.1) || nearHalf(Pin, 2, 0.1) || roundTo(Pin, 2) !== roundTo(PinR, 2)) continue;
      if (nearHalf(cost, 2, 0.1) || roundTo(cost, 2) !== roundTo(costR, 2)) continue;
      const parts = [
        numPart("h", "Total head", "Total head the pump must deliver (m)", H, 2, "Static lift = reservoir top water level − sump water level. Add the friction loss."),
        numPart("p", "Hydraulic power", "Hydraulic power given to the water (kW)", P, 2, "Hydraulic power = ρ × g × Q × H, with Q in m³/s (L/s ÷ 1000). That gives watts; divide by 1000 for kW."),
        numPart("pin", "Motor input", "Electrical power the pump set draws (kW)", Pin, 2, "Input power = hydraulic power ÷ efficiency, with the efficiency as a decimal."),
        numPart("cost", "Daily cost", "Electricity cost per day ($)", cost, 2, "Energy in kWh = input power × hours run. Multiply by the price per kWh."),
      ];
      const ex = `**Total head:** ${top.toFixed(2)} − ${sump.toFixed(2)} + ${f(hf)} = **${H.toFixed(2)} m**.\n\n**Hydraulic power:** 1000 × 9.81 × ${f(Q / 1000)} × ${H.toFixed(2)} = ${roundTo(P * 1000, 1)} W = **${roundTo(P, 2).toFixed(2)} kW**.\n\n**Motor input:** ${roundTo(P, 2).toFixed(2)} ÷ ${f(eta / 100)} = **${roundTo(Pin, 2).toFixed(2)} kW**.\n\n**Daily cost:** ${roundTo(Pin, 2).toFixed(2)} × ${hrs} h = ${roundTo(Pin * hrs, 2)} kWh; × $${price.toFixed(2)} = **$${roundTo(cost, 2).toFixed(2)}**.`;
      return finish(
        `A pump lifts water from a sump (water level **${sump.toFixed(2)} m RL**) to a reservoir (top water level **${top.toFixed(2)} m RL**) at **${Q} L/s**. Friction in the rising main adds a head loss of **${f(hf)} m**. The pump set is **${eta}%** efficient, runs **${hrs} hours** a day, and electricity costs **$${price.toFixed(2)} per kWh**. ${waterNote}`,
        parts, ex, "civ-pipe3", { tier, sump, top, hf, Q, eta, hrs, price }, [["_sump", sump], ["_top", top], ["_hf", hf], ["_Q", Q], ["_eta", eta], ["_hrs", hrs], ["_price", price]],
        ["Head first: the static lift plus the friction loss.", "Power to the water, then the power drawn, then the energy over the day."],
      );
    }
    // expert-plus: average supply rate -> size the main backwards from a velocity limit -> mass-curve storage -> verdict
    if (pipeTarget === undefined) pipeTarget = rng.int(1, 4);
    const qs = Array.from({ length: 6 }, () => rng.int(5, 90));
    const Qin = qs.reduce((a, b) => a + b, 0) / 6;
    if (!isEx(Qin, 1)) continue;
    const vmax = rng.pick([0.8, 1, 1.2, 1.5]);
    const Areq = Qin / 1000 / vmax;
    const idx = STOCK_D.findIndex((x) => boreArea(x) >= Areq);
    if (idx !== pipeTarget || Areq > 0.97 * boreArea(STOCK_D[idx]) || boreArea(STOCK_D[idx - 1]) > Areq / 1.03) continue;
    const dc = STOCK_D[idx];
    let run = 0, hi = 0, lo = 0;
    const runs = [];
    for (const q of qs) { run += (Qin - q) * 14.4; runs.push(run); hi = Math.max(hi, run); lo = Math.min(lo, run); }
    const S = hi - lo;
    if (S < 50) continue;
    const want = rng.next() < 0.5;
    const cap = want ? Math.ceil((S * (1 + rng.pick([0.05, 0.1, 0.2]))) / 10) * 10 : Math.floor((S * (1 - rng.pick([0.05, 0.1, 0.2]))) / 10) * 10;
    if ((cap >= S) !== want || Math.abs(cap / S - 1) < 0.04) continue;
    const opts = STOCK_D.map((x) => `${x} mm`);
    const parts = [
      numPart("qin", "Supply rate", "Constant rate the main must supply (L/s)", Qin, 1, "The main supplies the whole day's demand at a steady rate. Every block lasts the same time, so that rate is the mean of the six demands."),
      { id: "dia", label: "Main size", ask: `Smallest stock diameter that keeps the velocity in the main at or below ${f(vmax)} m/s`, answerType: "choice", answer: `${dc} mm`, choices: shuffled(rng, opts), fuzzyNumber: 0,
        hint: "Work backwards: the bore area needed is flow (m³/s) ÷ maximum velocity. Work out π × d² ÷ 4 for the stock sizes (d in metres) and take the smallest that reaches it." },
      numPart("s", "Storage needed", "Storage the tank needs over the day (m³)", S, 0, "For each block, surplus = (supply − demand) in L/s × 4 × 3600 s ÷ 1000, in m³. Keep a running total from 0 at 00:00; storage = highest running total − lowest (0 counts).", true),
      yesNo("ok", "Tank big enough?", `The existing tank holds **${commas(cap)} m³**. Is it big enough?`, cap >= S, "Compare the storage you found with the tank's capacity."),
    ];
    const ex = `**Supply rate:** (${qs.join(" + ")}) ÷ 6 = **${f(Qin)} L/s**.\n\n**Main size:** area needed = ${f(Qin / 1000)} ÷ ${f(vmax)} = ${roundTo(Areq, 5)} m². Areas: ${STOCK_D.map((x) => `${x} mm: ${roundTo(boreArea(x), 5)}`).join(", ")} m². The smallest that reaches it is **${dc} mm**.\n\n**Storage needed:** surplus per block = (${f(Qin)} − demand) × 14.4 m³; running totals ${runs.map((x) => f(roundTo(x, 1))).join(", ")}. Highest ${f(roundTo(hi, 1))}, lowest ${f(roundTo(lo, 1))}, so storage = **${commas(roundTo(S, 0))} m³**.\n\n**Tank big enough?** ${commas(cap)} m³ is ${cap >= S ? "at least" : "less than"} ${commas(roundTo(S, 0))} m³: **${YN(cap >= S)}**.`;
    const table = ["| Block | Demand (L/s) |", "|---|---|"].concat(qs.map((q, k) => `| ${BLOCKS[k]} | ${q} |`)).join("\n");
    return finish(
      `A service reservoir feeds a district. Demand is steady within each 4-hour block:\n\n${table}\n\nOne main fills the reservoir at a constant rate that supplies the day's total demand, and the pattern repeats every day. Stock pipe diameters are ${opts.join(", ")}. For this exercise, storage needed = the highest running total of (supply − demand) volume minus the lowest, counting from 0 at 00:00 (1 m³ = 1000 L).`,
      parts, ex, "civ-pipe4", { tier, qs, vmax, cap }, [...qs.map((q, k) => [`_q${k + 1}`, q]), ["_vmax", vmax]],
      ["Find the steady supply rate first; everything else follows from it.", "Size the main backwards from the velocity limit, then build the running total for the tank."],
    );
  }
  return tooMany();
}

// ---------- ground-stress ----------

const GAMMA_W = 9.81;
const groundNote = "Unit weight of water γw = **9.81 kN/m³**. Stresses are in kPa (1 kPa = 1 kN/m²).";
const ANCHORS = [100, 150, 200, 250, 300, 400, 500, 600, 800];
const RAD = Math.PI / 180;

function genGround(rng, tier) {
  let anchTarget, anchWant; // expert-plus only: drawn on first use (spread the anchor size, balance the verdict)
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const dw = rng.int(2, 8) * 0.5, z = dw + rng.int(2, 12) * 0.5;
      const g1 = rng.pick([16, 16.5, 17, 17.5, 18, 18.5, 19]), gs = rng.pick([19, 19.5, 20, 20.5, 21, 21.5]);
      if (gs <= g1) continue;
      const sig = g1 * dw + gs * (z - dw), u = GAMMA_W * (z - dw);
      if (nearHalf(sig, 1, 0.1) || nearHalf(u, 1, 0.1)) continue;
      const parts = [
        numPart("sig", "Total stress", `Total vertical stress at ${f(z)} m depth (kPa)`, sig, 1, "Add unit weight × thickness for each band of soil above the point: the soil above the water table, then the saturated soil below it."),
        numPart("u", "Pore pressure", "Pore water pressure at that depth (kPa)", u, 1, "u = γw × the depth of the point below the water table (not below ground level)."),
      ];
      const ex = `**Total stress:** ${f(g1)} × ${f(dw)} + ${f(gs)} × ${f(z - dw)} = **${roundTo(sig, 1).toFixed(1)} kPa**.\n\n**Pore pressure:** 9.81 × (${f(z)} − ${f(dw)}) = **${roundTo(u, 1).toFixed(1)} kPa**.`;
      return finish(
        `A uniform soil has its water table **${f(dw)} m** below ground level. Above the water table the soil weighs **${f(g1)} kN/m³**; below it, saturated, it weighs **${f(gs)} kN/m³**. Consider a point **${f(z)} m** below ground level. Total vertical stress σ = Σ(unit weight × thickness) of the soil above the point; pore water pressure u = γw × depth below the water table. ${groundNote}`,
        parts, ex, "civ-ground1", { tier, dw, z, g1, gs }, [["_dw", dw], ["_z", z], ["_g1", g1], ["_gsat", gs]],
        ["Split the soil above the point at the water table.", "Pore pressure only counts the water above the point."],
      );
    }
    if (tier === "hard") {
      const dw = rng.int(1, 6) * 0.5, h1 = dw + rng.int(1, 6) * 0.5, z = h1 + rng.int(1, 10) * 0.5;
      const g1 = rng.pick([16, 16.5, 17, 17.5, 18, 18.5]), g1s = rng.pick([19, 19.5, 20, 20.5, 21]), g2 = rng.pick([17.5, 18, 18.5, 19, 19.5, 20, 20.5]);
      const sig = g1 * dw + g1s * (h1 - dw) + g2 * (z - h1), u = GAMMA_W * (z - dw), se = sig - u;
      if (nearHalf(sig, 1, 0.1) || nearHalf(u, 1, 0.1) || nearHalf(se, 1, 0.1)) continue;
      if (roundTo(roundTo(sig, 1) - roundTo(u, 1), 1) !== roundTo(se, 1)) continue;
      const parts = [
        numPart("sig", "Total stress", `Total vertical stress at ${f(z)} m depth (kPa)`, sig, 1, "Three bands of soil lie above the point: sand above the water table, saturated sand below it, then clay. Add unit weight × thickness for each."),
        numPart("u", "Pore pressure", "Pore water pressure at that depth (kPa)", u, 1, "u = γw × the depth of the point below the water table."),
        numPart("se", "Effective stress", "Effective vertical stress σ′ = σ − u at that depth (kPa)", se, 1, "Effective stress is the share carried by the soil grains: total stress minus pore water pressure."),
      ];
      const ex = `**Total stress:** ${f(g1)} × ${f(dw)} + ${f(g1s)} × ${f(h1 - dw)} + ${f(g2)} × ${f(z - h1)} = **${roundTo(sig, 1).toFixed(1)} kPa**.\n\n**Pore pressure:** 9.81 × (${f(z)} − ${f(dw)}) = **${roundTo(u, 1).toFixed(1)} kPa**.\n\n**Effective stress:** ${roundTo(sig, 1).toFixed(1)} − ${roundTo(u, 1).toFixed(1)} = **${roundTo(se, 1).toFixed(1)} kPa** (check: Σ(γ − γw) × thickness below the water table plus the dry sand).`;
      return finish(
        `A site has **${f(h1)} m** of sand over a deep clay layer. The water table is **${f(dw)} m** below ground level. The sand weighs **${f(g1)} kN/m³** above the water table and **${f(g1s)} kN/m³** below it (saturated); the clay is saturated and weighs **${f(g2)} kN/m³**. Consider a point in the clay **${f(z)} m** below ground level. σ = Σ(unit weight × thickness) above the point; u = γw × depth below the water table; σ′ = σ − u. ${groundNote}`,
        parts, ex, "civ-ground2", { tier, dw, h1, z, g1, g1s, g2 }, [["_dw", dw], ["_h1", h1], ["_z", z], ["_g1", g1], ["_g1sat", g1s], ["_g2", g2]],
        ["Total stress band by band, then the water pressure, then the difference.", "Measure the water depth from the water table, not the ground."],
      );
    }
    if (tier === "expert") {
      const B = rng.int(12, 36) / 10, t = rng.pick([0.4, 0.5, 0.6, 0.75]), P = rng.int(20, 300) * 5;
      const qult = rng.int(15, 90) * 10, Fmin = rng.pick([2.5, 3]);
      const W = B * B * t * 24, q = (P + W) / (B * B), qR = (P + roundTo(W, 1)) / (B * B);
      const fos = qult / q, fosR = qult / roundTo(q, 1);
      if (nearHalf(W, 1, 0.1) || nearHalf(q, 1, 0.1) || roundTo(q, 1) !== roundTo(qR, 1)) continue;
      if (fos < 1.5 || fos > 5 || nearHalf(fos, 2, 0.1) || roundTo(fos, 2) !== roundTo(fosR, 2) || Math.abs(fos - Fmin) < 0.1) continue;
      const want = rng.next() < 0.5;
      if ((fos >= Fmin) !== want) continue;
      const parts = [
        numPart("w", "Footing weight", "Weight of the concrete footing (kN)", W, 1, "Volume = B × B × thickness; weight = volume × the concrete's unit weight."),
        numPart("q", "Bearing pressure", "Bearing pressure under the footing (kPa)", q, 1, "Bearing pressure = (column load + footing weight) ÷ plan area B × B."),
        numPart("fos", "Factor of safety", "Factor of safety against bearing failure", fos, 2, "Factor of safety = ultimate bearing capacity ÷ bearing pressure."),
        yesNo("ok", "Meets the minimum?", `The design rule asks for a factor of safety of at least **${Fmin.toFixed(1)}**. Is it met?`, fos >= Fmin, "Compare your factor of safety with the stated minimum."),
      ];
      const ex = `**Footing weight:** ${f(B)} × ${f(B)} × ${f(t)} × 24 = **${roundTo(W, 1).toFixed(1)} kN**.\n\n**Bearing pressure:** (${P} + ${roundTo(W, 1).toFixed(1)}) ÷ (${f(B)} × ${f(B)}) = **${roundTo(q, 1).toFixed(1)} kPa**.\n\n**Factor of safety:** ${qult} ÷ ${roundTo(q, 1).toFixed(1)} = **${roundTo(fos, 2).toFixed(2)}**.\n\n**Meets the minimum?** ${roundTo(fos, 2).toFixed(2)} is ${fos >= Fmin ? "at least" : "below"} ${Fmin.toFixed(1)}: **${YN(fos >= Fmin)}**.`;
      return finish(
        `A square pad footing, **${f(B)} m** by **${f(B)} m** in plan and **${f(t)} m** thick, carries a column load of **${P} kN**. Reinforced concrete weighs **24 kN/m³**. The soil's ultimate bearing capacity is **${qult} kPa**. For this exercise, bearing pressure = total vertical load ÷ plan area, and factor of safety = ultimate bearing capacity ÷ bearing pressure (1 kPa = 1 kN/m²).`,
        parts, ex, "civ-ground3", { tier, B, t, P, qult, Fmin }, [["_B", B], ["_t", t], ["_P", P], ["_qult", qult]],
        ["The footing's own weight adds to the column load.", "Pressure, then factor of safety, then the verdict."],
      );
    }
    // expert-plus: slope FoS -> anchor force needed (backwards) -> stock anchor -> verdict at a wider spacing
    if (anchTarget === undefined) { anchTarget = rng.int(1, ANCHORS.length - 2); anchWant = rng.next() < 0.5; }
    const th = rng.pick([20, 25, 30, 35, 40]), ph = rng.pick([20, 22, 25, 28, 30, 32, 35]), c = rng.pick([0, 5, 10, 15, 20]);
    const L = rng.int(8, 25), W = rng.int(20, 120) * 10, Freq = rng.pick([1.3, 1.4, 1.5]);
    if (c === 0 && th === ph) continue; // FoS would be exactly 1 whatever W and L are
    const D = W * Math.sin(th * RAD), R = c * L + W * Math.cos(th * RAD) * Math.tan(ph * RAD);
    const fos = R / D;
    if (fos < 0.6 || fos > Freq - 0.1 || nearHalf(fos, 2, 0.1)) continue;
    const T = Freq * D - R, Talt = D * (Freq - roundTo(fos, 2)); // Talt: worked from the rounded FoS
    if (T < 20 || nearHalf(T, 0, 0.1) || nearHalf(Talt, 0, 0.1) || roundTo(Talt, 0) !== roundTo(T, 0)) continue;
    const s = rng.pick([1.5, 2, 2.5, 3]), F = T * s;
    const idx = ANCHORS.findIndex((x) => x >= F);
    if (idx !== anchTarget || F > 0.97 * ANCHORS[idx] || ANCHORS[idx - 1] > F / 1.03) continue;
    const Tset = [T, roundTo(T, 0), Talt]; // later parts must agree whichever of these is used
    if (Tset.some((x) => ANCHORS.findIndex((a) => a >= x * s) !== idx)) continue;
    const cap = ANCHORS[idx], s2 = s + rng.pick([0.25, 0.5, 1]), want = anchWant;
    const okW = cap / s2 >= T;
    if (okW !== want || Math.abs(cap / s2 / T - 1) < 0.03 || Tset.some((x) => (cap / s2 >= x) !== okW)) continue;
    const opts = ANCHORS.map((x) => `${x} kN`);
    const parts = [
      numPart("fos", "Factor of safety", "Factor of safety of the slope as it stands", fos, 2, "Work out the disturbing force W sin θ and the resisting force c × L + W cos θ × tan φ, then divide resisting by disturbing."),
      numPart("t", "Anchor force", `Anchor force needed per metre run to reach a factor of safety of ${f(Freq)} (kN/m)`, T, 0, "Work backwards: with an anchor force T up the slope, FoS = (resisting + T) ÷ disturbing. Set that equal to the required value and solve for T.", true),
      { id: "anchor", label: "Stock anchor", ask: `Anchors are spaced **${f(s)} m** apart along the slope, so each carries the force per metre × the spacing. Smallest stock anchor that can carry it`, answerType: "choice", answer: `${cap} kN`, choices: shuffled(rng, opts), fuzzyNumber: 0,
        hint: "Multiply the force per metre run by the spacing, then take the smallest working capacity that is at least that." },
      yesNo("ok", "Wider spacing OK?", `To save cost, the spacing is widened to **${f(s2)} m**, with the same anchor working at its full capacity. Would the slope still reach a factor of safety of ${f(Freq)}?`, okW, "At the wider spacing each metre run gets the anchor's capacity ÷ the spacing. Compare that with the force per metre you need."),
    ];
    const ex = `**Factor of safety:** disturbing = ${W} × sin ${th}° = ${roundTo(D, 2)} kN; resisting = ${c} × ${L} + ${W} × cos ${th}° × tan ${ph}° = ${roundTo(R, 2)} kN; FoS = ${roundTo(R, 2)} ÷ ${roundTo(D, 2)} = **${roundTo(fos, 2).toFixed(2)}**.\n\n**Anchor force:** T = ${f(Freq)} × ${roundTo(D, 2)} − ${roundTo(R, 2)} = ${roundTo(T, 2)}, so **${roundTo(T, 0)} kN/m**.\n\n**Stock anchor:** ${roundTo(T, 2)} × ${f(s)} = ${roundTo(F, 1)} kN, so the smallest is **${cap} kN**.\n\n**Wider spacing OK?** ${cap} ÷ ${f(s2)} = ${roundTo(cap / s2, 1)} kN/m, ${okW ? "at least" : "less than"} the ${roundTo(T, 2)} kN/m needed: **${YN(okW)}**.`;
    return finish(
      `A block of soil can slide on a plane slip surface inclined at **${th}°** to the horizontal. Per metre run of slope, the block weighs **${W} kN** and the slip surface is **${L} m** long. Along the slip surface the soil has cohesion c = **${c} kPa** and friction angle φ = **${ph}°**. For this exercise: disturbing force = W sin θ; resisting force = c × L + W cos θ × tan φ; factor of safety = resisting ÷ disturbing. An anchor force T per metre run, pulling straight up the slope, adds to the resisting force. The required factor of safety is **${f(Freq)}**. Stock ground anchors have working capacities of ${opts.join(", ")}.`,
      parts, ex, "civ-ground4", { tier, th, ph, c, L, W, Freq, s, s2 }, [["_W", W], ["_theta", th], ["_L", L], ["_c", c], ["_phi", ph], ["_Freq", Freq]],
      ["Find how safe the slope is now, then work backwards to the anchor force it needs.", "Per metre run first, then per anchor."],
    );
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "beam-check") return genBeam(rng, difficulty);
  if (subtopic === "tie-rod") return genTie(rng, difficulty);
  if (subtopic === "concrete-batches") return genConcrete(rng, difficulty);
  if (subtopic === "setting-out") return genSetting(rng, difficulty);
  if (subtopic === "pipe-drainage") return genPipe(rng, difficulty);
  if (subtopic === "ground-stress") return genGround(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (moments about the other
// support, cutting the beam from the other side, areas by a standard-size scan, volumes by
// summing slices, angles by Pythagoras). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const sM = (x) => `${(+x).toFixed(2)} m`;

const ALT = {
  "civ-beam1": (p) => {
    const RA = (p.P * (p.L - p.a)) / p.L; // moments about B
    const RB = p.P - RA;
    return { rb: RB, m: RB * (p.L - p.a) }; // moment from the right-hand side
  },
  "civ-beam2": (p) => {
    const b = p.L - p.a;
    const RA = ((p.w * p.L * p.L) / 2 + p.P * b) / p.L; // moments about B
    const RB = p.w * p.L + p.P - RA;
    return { rb: RB, ra: RA, m: RB * b - (p.w * b * b) / 2 }; // cut from the right
  },
  "civ-beam3": (p) => {
    const RA = (p.w * p.L * (p.L / 2) + p.P * (p.L / 2)) / p.L; // moments about B (symmetry)
    const RB = p.w * p.L + p.P - RA;
    const M = RA * (p.L / 2) - (p.w * (p.L / 2) ** 2) / 2;
    const Z = M * 1e6 / p.sigma / 1e3;
    return { rb: RB, m: M, z: Z, ok: YN(p.Zs >= Z) };
  },
  "civ-beam4": (p) => {
    const Mcap = (p.Z * 1e3 * p.sigma) / 1e6;
    const RAmax = (Mcap + (p.w * p.L * p.L) / 8) / (p.L / 2); // reaction that makes midspan moment = capacity
    const Pmax = 2 * RAmax - p.w * p.L;
    const R = (p.P + p.w * p.L) / 2;
    const M = R * (p.L / 2) - (p.w * (p.L / 2) ** 2) / 2;
    return { mcap: Mcap, pmax: Pmax, r: R, verdict: `${M <= Mcap ? "OK" : "Overstressed"} | ${R <= p.Rcap ? "OK" : "Exceeds"}` };
  },
  "civ-tie1": (p) => ({ s: p.P / (p.A / 1000), fos: p.Y / (p.P / (p.A / 1000)) }),
  "civ-tie2": (p) => {
    const A = Math.PI * (p.d / 2) ** 2;
    const s = p.P / (A / 1000);
    return { a: A, s, ext: (s / (E_GPA * 1000)) * (p.L * 1000) };
  },
  "civ-tie3": (p) => {
    const A = Math.PI * (p.d / 2) ** 2;
    const s = p.P / (A / 1000);
    const fos = p.Y / s;
    return { s, ext: (s / (E_GPA * 1000)) * (p.L * 1000), fos, ok: YN(fos >= p.nmin) };
  },
  "civ-tie4": (p) => {
    const Areq = p.P / (p.Y / p.n / 1000);
    let dc = null;
    for (const d of DIAMS) if (Math.PI * (d / 2) ** 2 >= Areq) { dc = d; break; }
    const A = Math.PI * (dc / 2) ** 2;
    const ext = ((p.P * 1000) / A / (E_GPA * 1000)) * (p.L * 1000);
    return { areq: Areq, dia: `${dc} mm`, ext, ok: YN(ext <= p.limit) };
  },
  "civ-conc1": (p) => {
    const V = (p.L * 1000 * p.W * 1000 * p.t) / 1e9; // via mm^3
    return { v: V, n: Math.ceil(V / p.C - 1e-9) };
  },
  "civ-conc2": (p) => {
    const V = (p.L * p.W * p.t) / 1000;
    const trucks = Math.ceil((V * (100 + p.w)) / 100 / p.C - 1e-9);
    return { v: V, n: trucks, c: trucks * p.C * p.price };
  },
  "civ-conc3": (p) => {
    const V = (p.L * p.W * p.t) / 1000 + (p.n * (p.a * p.b * p.h)) / 1000;
    const order = (V * (100 + p.w)) / 100;
    const trucks = Math.ceil(order / p.C - 1e-9);
    return { v: V, o: order, n: trucks, c: trucks * p.C * p.price };
  },
  "civ-conc4": (p) => {
    const V = p.T * p.C - p.r;
    return { v: V, len: V / (p.W * (p.t / 1000)), cpm: (p.T * p.C * p.price) / V, ok: YN((p.r * 100) / (p.T * p.C) <= p.allow) };
  },
  "civ-set1": (p) => ({ rise: p.L * (1 / p.N), pct: (1 / p.N) * 100 }),
  "civ-set2": (p) => {
    const rise = p.L * (1 / p.N);
    const F1 = p.up ? p.R0 + rise : p.R0 - rise;
    const diff = p.G - F1;
    return { rise, f: F1, cf: `${diff > 0 ? "Cut" : "Fill"} | ${sM(Math.abs(diff))}` };
  },
  "civ-set3": (p) => {
    const rise = p.L / p.N;
    const f1 = p.deeper ? p.f0 - rise : p.f0 + rise;
    // volume by summing 1 m slices (depth varies linearly) rather than the mean-depth formula
    let V = 0;
    for (let k = 0; k < p.L; k++) V += p.w * (p.G - (p.f0 + ((f1 - p.f0) * (k + 0.5)) / p.L));
    const loose = V * 1.25;
    return { f: f1, v: V, l: loose, n: Math.ceil(loose / p.Cl - 1e-9) };
  },
  "civ-set4": (p) => {
    const rise = p.R1 - p.R0;
    const ang = (Math.atan2(rise, p.H) * 180) / Math.PI;
    const S = Math.sqrt(p.H * p.H + rise * rise);
    return { rise, ang, s: S, ok: YN(Math.abs(p.meas - S) <= 0.2 + 1e-9) }; // exact slope distance, as the prompt says
  },
  "civ-pipe1": (p) => {
    const r = p.d / 2; // mm
    const Qm3 = (Math.PI * r * r * (p.v * 1000)) / 1e9; // mm² × mm/s -> m³/s
    return { q: Qm3 * 1000, t: p.V / Qm3 / 60 };
  },
  "civ-pipe2": (p) => {
    const pct = ((p.ILa - p.ILb) / p.L) * 100; // gradient as a percentage, then back to 1 in N
    const N = 100 / pct;
    const out = p.ILa - (p.L + p.L2) / N; // straight from A over the whole length
    return { n: N, out, ok: YN(out - p.F >= p.clr - 1e-9) };
  },
  "civ-pipe3": (p) => {
    const H = p.top + p.hf - p.sump;
    const pressure = 1000 * GRAV * H; // Pa
    const P = (pressure * (p.Q / 1000)) / 1000; // kW
    const Pin = (P * 100) / p.eta;
    return { h: H, p: P, pin: Pin, cost: Pin * p.price * p.hrs };
  },
  "civ-pipe4": (p) => {
    const vol = p.qs.reduce((a, q) => a + q * 4 * 3600, 0); // litres per day
    const Qin = vol / 86400;
    let dc = null;
    for (const d of STOCK_D) if (Qin / 1000 / ((Math.PI * d * d) / 4e6) <= p.vmax + 1e-12) { dc = d; break; }
    // storage: largest net draw over any run of consecutive blocks, the day wrapping round
    const draw = p.qs.map((q) => (q - Qin) * 4 * 3.6);
    let S = 0;
    for (let a = 0; a < 6; a++) { let sum = 0; for (let k = 0; k < 6; k++) { sum += draw[(a + k) % 6]; S = Math.max(S, sum); } }
    return { qin: Qin, dia: `${dc} mm`, s: S, ok: YN(p.cap >= S) };
  },
  "civ-ground1": (p) => {
    const sig = p.gs * p.z - (p.gs - p.g1) * p.dw;
    return { sig, u: GAMMA_W * (p.z - p.dw) };
  },
  "civ-ground2": (p) => {
    // effective stress from submerged unit weights, total stress = effective + pore pressure
    const se = p.g1 * p.dw + (p.g1s - GAMMA_W) * (p.h1 - p.dw) + (p.g2 - GAMMA_W) * (p.z - p.h1);
    const u = GAMMA_W * (p.z - p.dw);
    return { sig: se + u, u, se };
  },
  "civ-ground3": (p) => {
    const Bmm = p.B * 1000;
    const W = 24 * p.t * p.B * p.B;
    const q = (((p.P + W) * 1000) / (Bmm * Bmm)) * 1000; // N/mm² -> kPa
    const fos = p.qult / q;
    return { w: W, q, fos, ok: YN(fos >= p.Fmin) };
  },
  "civ-ground4": (p) => {
    const Nf = p.W * Math.cos(p.th * RAD), Sf = p.W * Math.sin(p.th * RAD);
    const R = Nf * Math.tan(p.ph * RAD) + p.c * p.L;
    const fos = R / Sf;
    const T = Sf * (p.Freq - fos);
    let cap = null;
    for (const a of ANCHORS) if ((R + a / p.s) / Sf >= p.Freq) { cap = a; break; }
    return { fos, t: T, anchor: `${cap} kN`, ok: YN((R + cap / p.s2) / Sf >= p.Freq) };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined || tv === null) return false;
    if (part.answerType === "number") {
      const dp = part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2));
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
