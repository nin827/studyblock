// Land Surveyor role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls in hint code), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact, or (where a rounded earlier answer is asked for)
// redrawn until working from the rounded value gives the same later answer. No answer sits on a
// rounding half-step, and verdict parts (Yes/No, Met/Not met) are decided first and then fitted.
// All figures are made up and the rules are general textbook practice, not any country's survey law.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   coordinates       bearing + distance -> dE, dN -> new point -> distance/bearing to a control point   (Boundary)
//   traverse-closure  leg components -> closing error -> misclosure -> 1 in N -> accepted?               (Boundary, Levelling)
//   plot-area         corner coordinates -> shoelace area -> hectares -> plots, value; works back to a corner (Boundary)
//   levelling         BS/IS/FS booking -> reduced levels -> arithmetic check -> misclosure vs allowance      (Levelling)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-surveyor: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const YN = (b) => (b ? "Yes" : "No");
const rad = (d) => (d * Math.PI) / 180;
const sum = (a) => a.reduce((s, x) => s + x, 0);
// Display helpers: real minus sign for signed values; plain fixed decimals for option strings.
const sg = (x, dp = 2) => { const r = roundTo(x, dp); return (r < 0 ? "−" : "") + Math.abs(r).toFixed(dp); };
const sp = (x, dp = 2) => { const r = roundTo(x, dp); return (r < 0 ? "−" : "+") + Math.abs(r).toFixed(dp); };
const pl = (x, dp = 2) => roundTo(x, dp).toFixed(dp);
const sgi = (n) => (n < 0 ? "−" : "") + Math.abs(n);
const mmTxt = (mm) => (mm / 1000).toFixed(3);

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (rng, id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: rng.shuffle(["Yes", "No"]), hint });
// Segmented part: all combinations of two small value lists (2 x 2), shuffled; the answer is one row.
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: rng.shuffle(choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// bearing (whole-circle, degrees) of a vector, by atan2
const bearingOf = (dE, dN) => { const b = (Math.atan2(dE, dN) * 180) / Math.PI; return b < 0 ? b + 360 : b; };
const BEARING_NOTE = "Bearings are whole-circle bearings, measured clockwise from grid north, so for a line of length *d* on bearing *θ*: ΔE = d × sin θ and ΔN = d × cos θ. Eastings increase to the east and Northings to the north.";

// ---------- coordinates ----------

const NICE_B = [30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330];
const gridPt = (rng) => [rng.int(200, 1800) * 5, rng.int(200, 1800) * 5];

function genCoord(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const [E0, N0] = gridPt(rng);
    if (tier === "medium" || tier === "hard") {
      const th = tier === "medium" ? rng.pick(NICE_B) : rng.int(8, 352);
      if (th % 90 === 0) continue;
      const d = tier === "medium" ? rng.pick([40, 50, 60, 80, 100, 120, 150, 200]) : rng.int(60, 400) / 2;
      const dE = d * Math.sin(rad(th)), dN = d * Math.cos(rad(th));
      if (nearHalf(dE, 2, 0.08) || nearHalf(dN, 2, 0.08) || Math.abs(dE) < 5 || Math.abs(dN) < 5) continue;
      const rE = roundTo(dE, 2), rN = roundTo(dN, 2);
      const EB = roundTo(E0 + rE, 2), NB = roundTo(N0 + rN, 2);
      const prompt = `A survey line runs from station **A** (Easting **${E0} m**, Northing **${N0} m**) on a bearing of **${th}°** for **${f(d)} m** to station **B**. ${BEARING_NOTE}`;
      const given = [["_E0", E0], ["_N0", N0], ["_d", d], ["_brg", th]];
      const parts = [
        numPart("de", "Change in Easting", "Change in Easting from A to B, ΔE (m, with its sign)", dE, 2, "ΔE = d × sin θ. Check the sign: a bearing in the west half of the compass (180° to 360°) gives a negative ΔE."),
        numPart("dn", "Change in Northing", "Change in Northing from A to B, ΔN (m, with its sign)", dN, 2, "ΔN = d × cos θ. A bearing in the south half (between 90° and 270°) gives a negative ΔN."),
      ];
      const ex = `**ΔE** = ${f(d)} × sin ${th}° = **${sg(dE)} m**.\n\n**ΔN** = ${f(d)} × cos ${th}° = **${sg(dN)} m**.\n\nSo B is at (${pl(EB)}, ${pl(NB)}).`;
      if (tier === "medium") {
        return finish(prompt, parts, ex, "sur-coord1", { tier, E0, N0, th, d }, given,
          ["Resolve the line into an east part and a north part with sin and cos.", "The sign comes from the direction of the bearing."]);
      }
      const wrongE = roundTo(E0 - rE, 2), wrongN = roundTo(N0 - rN, 2);
      const seg = segPart2(rng, "b", "Coordinates of B", "Which pair gives the coordinates of B?", ["Easting", "Northing"], [pl(EB), pl(wrongE)], [pl(NB), pl(wrongN)], [pl(EB), pl(NB)],
        "Add each change to the matching coordinate of A, keeping its sign. A wrong sign puts B on the wrong side of A.");
      return finish(prompt + " Find the coordinates of B.", [...parts, seg], ex, "sur-coord2", { tier, E0, N0, th, d }, given,
        ["New coordinate = old coordinate + the change.", "Check the quadrant of the bearing before you pick the signs."]);
    }
    if (tier === "expert") {
      const th = rng.int(8, 352), d = rng.int(80, 400) / 2;
      if (th % 90 === 0) continue;
      const dE = d * Math.sin(rad(th)), dN = d * Math.cos(rad(th));
      if (nearHalf(dE, 2, 0.1) || nearHalf(dN, 2, 0.1)) continue;
      const EB = roundTo(E0 + roundTo(dE, 2), 2), NB = roundTo(N0 + roundTo(dN, 2), 2);
      const Ec = Math.round(EB) + rng.int(-30, 30) * 5, Nc = Math.round(NB) + rng.int(-30, 30) * 5;
      const vE = Ec - EB, vN = Nc - NB, vEx = Ec - (E0 + dE), vNx = Nc - (N0 + dN);
      const dist = Math.hypot(vE, vN), distX = Math.hypot(vEx, vNx);
      if (dist < 30) continue;
      const br = bearingOf(vE, vN), brX = bearingOf(vEx, vNx);
      if (roundTo(dist, 1) !== roundTo(distX, 1) || nearHalf(dist, 1, 0.12) || nearHalf(distX, 1, 0.12)) continue;
      if (roundTo(br, 0) !== roundTo(brX, 0) || nearHalf(br, 0, 0.12) || nearHalf(brX, 0, 0.12) || br < 1 || br > 359 || Math.abs(vE) < 5 || Math.abs(vN) < 5) continue;
      const parts = [
        numPart("eb", "Easting of B", "Easting of B (m)", E0 + dE, 2, "Easting of B = Easting of A + d × sin θ."),
        numPart("nb", "Northing of B", "Northing of B (m)", N0 + dN, 2, "Northing of B = Northing of A + d × cos θ."),
        numPart("bc", "Distance B to C", "Distance from B to the control station C, using your coordinates of B (m)", dist, 1, "Pythagoras on the differences in Easting and Northing between B and C."),
        numPart("brg", "Bearing B to C", "Whole-circle bearing from B to C, using your coordinates of B (degrees)", br, 0, "tan(angle) = ΔE ÷ ΔN gives an acute angle; add 180° or 360° so that it lies in the right quadrant.", true),
      ];
      const ex = `**B:** ΔE = ${f(d)} × sin ${th}° = ${sg(dE)}, ΔN = ${f(d)} × cos ${th}° = ${sg(dN)}, so B = (**${pl(EB)}**, **${pl(NB)}**).\n\n**Distance BC:** differences ${sg(vE)} and ${sg(vN)}; √((${sg(vE)})² + (${sg(vN)})²) = **${pl(dist, 1)} m**.\n\n**Bearing BC:** tan⁻¹(${sg(vE)} ÷ ${sg(vN)}) put in the correct quadrant (ΔE ${vE >= 0 ? "positive" : "negative"}, ΔN ${vN >= 0 ? "positive" : "negative"}) = **${roundTo(br, 0)}°**.`;
      return finish(`A survey line runs from station **A** (Easting **${E0} m**, Northing **${N0} m**) on a bearing of **${th}°** for **${f(d)} m** to station **B**. A control station **C** is at Easting **${Ec} m**, Northing **${Nc} m**. ${BEARING_NOTE}`,
        parts, ex, "sur-coord3", { tier, E0, N0, th, d, Ec, Nc }, [["_E0", E0], ["_N0", N0], ["_d", d], ["_brg", th], ["_Ec", Ec], ["_Nc", Nc]],
        ["Find B first, then work with the differences from B to C.", "For the bearing, decide the quadrant from the signs of ΔE and ΔN."]);
    }
    // expert-plus: coordinates of A and B -> bearing and distance -> a right-angle offset peg -> fence verdict
    const th = rng.int(8, 352), d = rng.int(300, 1500) / 10;
    if (th % 90 === 0) continue;
    const EA = E0, NA = N0;
    const EB = roundTo(EA + roundTo(d * Math.sin(rad(th)), 2), 2), NB = roundTo(NA + roundTo(d * Math.cos(rad(th)), 2), 2);
    const dE = EB - EA, dN = NB - NA;
    const brT = bearingOf(dE, dN), distT = Math.hypot(dE, dN);
    if (roundTo(brT, 0) !== th || roundTo(distT, 1) !== roundTo(d, 1)) continue;
    const w = rng.pick([10, 12, 15, 20, 25, 30, 40]);
    const ecExact = EB + w * Math.cos(rad(th)), ecTrue = EB + w * Math.sin(rad(brT + 90));
    if (roundTo(ecExact, 2) !== roundTo(ecTrue, 2) || nearHalf(ecExact, 2, 0.2) || nearHalf(ecTrue, 2, 0.2)) continue;
    const ec = roundTo(ecExact, 2);
    const ok = rng.next() < 0.5, k = rng.pick([0.2, 0.5, 1, 1.5, 2.5]);
    const Ef = roundTo(ok ? ec + 2 + k : ec + 2 - k, 2);
    const bw = (th + 90) % 360;
    const parts = [
      numPart("brg", "Bearing A to B", "Whole-circle bearing from A to B (degrees)", th, 0, "Take the differences ΔE and ΔN from A to B; tan(angle) = ΔE ÷ ΔN, then put the angle in the correct quadrant.", true),
      numPart("dist", "Distance A to B", "Distance from A to B (m)", d, 1, "Pythagoras on ΔE and ΔN."),
      numPart("ec", "Easting of C", "Easting of C (m)", ecExact, 2, `C lies ${w} m from B on the bearing 90° clockwise from AB. Use your bearing for AB, add 90°, then Easting of C = Easting of B + ${w} × sin(that bearing).`),
      yesNo(rng, "ok", "Peg clear of fence?", `A fence runs north–south along Easting **${f(Ef)} m**. Peg C must be at least **2.00 m west** of the fence line (Easting of C at most ${f(roundTo(Ef - 2, 2))} m). Is C acceptable?`, ok, "Compare your Easting of C with the stated limit."),
    ];
    const ex = `**Bearing AB:** ΔE = ${pl(EB)} − ${EA} = ${sg(dE)}, ΔN = ${pl(NB)} − ${NA} = ${sg(dN)}; tan⁻¹(${sg(dE)} ÷ ${sg(dN)}) in the correct quadrant = **${th}°**.\n\n**Distance AB:** √((${sg(dE)})² + (${sg(dN)})²) = **${pl(d, 1)} m**.\n\n**Peg C:** bearing ${th}° + 90° = ${bw}°, so Easting of C = ${pl(EB)} + ${w} × sin ${bw}° = **${pl(ec)} m**.\n\n**Fence:** the limit is ${f(roundTo(Ef - 2, 2))} m and C is at ${pl(ec)} m, so **${YN(ok)}**.`;
    return finish(`Station **A** is at (Easting **${EA}**, Northing **${NA}**) and station **B** is at (**${pl(EB)}**, **${pl(NB)}**), all in metres. A peg **C** is to be set out from B, **${w} m** away on the bearing **90° clockwise from the bearing A to B**. ${BEARING_NOTE}`,
      parts, ex, "sur-coord4", { tier, EA, NA, EB, NB, w, Ef }, [["_EA", EA], ["_NA", NA], ["_EB", EB], ["_NB", NB], ["_w", w], ["_Ef", Ef]],
      ["Work backwards from the two sets of coordinates to the bearing and distance.", "The offset bearing is the bearing of AB plus 90°."]);
  }
  return tooMany();
}

// ---------- traverse-closure ----------

const TRI = [[3, 4, 5, 3, 14], [5, 12, 13, 2, 8], [8, 15, 17, 1, 6], [7, 24, 25, 1, 4], [20, 21, 29, 1, 3]];
const ERRS = [[3, 4], [6, 8], [5, 12], [8, 15], [7, 24], [9, 12], [12, 16]]; // centimetres; misclosure 5, 10, 13, 17, 25, 15, 20 cm
const LEGN = "ABCDEFGH";
const LIMITS = [1000, 2000, 3000, 5000, 10000];

function genLegs(rng, n) {
  for (let t = 0; t < 200; t++) {
    const legs = [];
    for (let k = 0; k < n - 1; k++) {
      const [a, b, c, k0, k1] = rng.pick(TRI), m = rng.int(k0, k1);
      let x = a * m, y = b * m;
      if (rng.next() < 0.5) [x, y] = [y, x];
      if (rng.next() < 0.5) x = -x;
      if (rng.next() < 0.5) y = -y;
      legs.push({ dE: x, dN: y, L: c * m });
    }
    const [u, v] = rng.pick(ERRS);
    let eE = u / 100, eN = v / 100;
    if (rng.next() < 0.5) [eE, eN] = [eN, eE];
    if (rng.next() < 0.5) eE = -eE;
    if (rng.next() < 0.5) eN = -eN;
    const lE = roundTo(eE - sum(legs.map((l) => l.dE)), 2), lN = roundTo(eN - sum(legs.map((l) => l.dN)), 2);
    if (Math.abs(lE) > 400 || Math.abs(lN) > 400 || Math.abs(lE) < 5 || Math.abs(lN) < 5) continue;
    legs.push({ dE: lE, dN: lN, L: roundTo(Math.hypot(lE, lN), 2) });
    return { legs, eE: roundTo(eE, 2), eN: roundTo(eN, 2), c: roundTo(Math.hypot(eE, eN), 2), P: roundTo(sum(legs.map((l) => l.L)), 2) };
  }
  return null;
}
const legName = (k, n) => `${LEGN[k]}${LEGN[(k + 1) % n]}`;
const legTable = (legs, withLen) =>
  (withLen ? "| Leg | Length (m) | ΔE (m) | ΔN (m) |\n| --- | --- | --- | --- |\n" : "| Leg | ΔE (m) | ΔN (m) |\n| --- | --- | --- |\n") +
  legs.map((l, k) => `| ${legName(k, legs.length)} | ${withLen ? `${pl(l.L)} | ` : ""}${sp(l.dE)} | ${sp(l.dN)} |`).join("\n");
const TRAV_NOTE = "ΔE and ΔN are the east and north components of each leg of a closed traverse; for a perfect traverse each column adds up to zero. The **closing error** is the sum of each column, and the **misclosure** is the straight-line distance √(ΣΔE² + ΣΔN²). **Linear accuracy** is 1 in N, where N = perimeter ÷ misclosure.";

function genTraverse(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const n = tier === "medium" || tier === "hard" ? 4 : 5;
    const want = tier === "expert" || tier === "expert-plus" ? rng.next() < 0.5 : false; // verdict decided first
    const g = genLegs(rng, n);
    if (!g) continue;
    const { legs, eE, eN, c, P } = g;
    if (Math.abs(eE) === Math.abs(eN)) continue;
    const compGiven = legs.flatMap((l, k) => [[`_dE_${legName(k, n)}`, l.dE], [`_dN_${legName(k, n)}`, l.dN]]);
    const lenGiven = legs.map((l, k) => [`_L_${legName(k, n)}`, l.L]);
    const sumTxt = `ΣΔE = ${sp(legs.reduce((s, l) => s + l.dE, 0))}, ΣΔN = ${sp(legs.reduce((s, l) => s + l.dN, 0))}`;
    if (tier === "medium" || tier === "hard") {
      const parts = [
        numPart("ee", "Closing error in E", "Sum of the ΔE column (m, with its sign)", eE, 2, "Add the ΔE values, keeping each sign: positive and negative values partly cancel."),
        numPart("en", "Closing error in N", "Sum of the ΔN column (m, with its sign)", eN, 2, "Add the ΔN values, keeping each sign."),
      ];
      let ex = `**Closing errors:** ${sumTxt}, i.e. ΣΔE = **${sp(eE)} m** and ΣΔN = **${sp(eN)} m**.`;
      const prompt = `A closed traverse **${LEGN.slice(0, n)}${LEGN[0]}** was measured, and each leg's components were worked out:\n\n${legTable(legs, false)}\n\n${TRAV_NOTE}`;
      if (tier === "medium") {
        return finish(prompt, parts, ex, "sur-trav1", { tier, legs: legs.map((l) => [l.dE, l.dN]) }, compGiven,
          ["Each column should add to zero; whatever is left over is the closing error.", "Keep the signs when adding."]);
      }
      parts.push(numPart("c", "Misclosure", "Misclosure, the straight-line distance of the gap (m)", c, 2, "Pythagoras on the two closing errors: √(ΣΔE² + ΣΔN²)."));
      ex += `\n\n**Misclosure:** √((${sg(eE)})² + (${sg(eN)})²) = **${pl(c)} m**.`;
      return finish(prompt, parts, ex, "sur-trav2", { tier, legs: legs.map((l) => [l.dE, l.dN]) }, compGiven,
        ["Sum each column first, then combine the two sums with Pythagoras.", "The misclosure is a distance, so it is never negative."]);
    }
    const N = P / c;
    if (N < 800 || N > 40000 || nearHalf(N, 0, 0.1)) continue;
    const table = legTable(legs, true);
    const lens = legs.map((l) => pl(l.L)).join(" + ");
    if (tier === "expert") {
      const fit = LIMITS.filter((l) => Math.abs(N - l) / l >= 0.08 && (N >= l) === want);
      if (!fit.length) continue;
      const limit = rng.pick(fit);
      const parts = [
        numPart("c", "Misclosure", "Misclosure of the traverse (m)", c, 2, "Add each column of components with its signs, then use Pythagoras on the two sums."),
        numPart("p", "Perimeter", "Perimeter, the sum of the leg lengths (m)", P, 2, "Add the Length column."),
        numPart("n", "Linear accuracy", "N in the linear accuracy 1 in N, using the perimeter and misclosure (N)", N, 0, "N = perimeter ÷ misclosure.", true),
        yesNo(rng, "ok", "Accepted?", `The job specification needs a linear accuracy of at least **1 in ${commas(limit)}**. Does this traverse meet it?`, N >= limit, "The traverse meets 1 in L when its N is at least L."),
      ];
      const ex = `**Misclosure:** ${sumTxt}; √((${sg(eE)})² + (${sg(eN)})²) = **${pl(c)} m**.\n\n**Perimeter:** ${lens} = **${pl(P)} m**.\n\n**Linear accuracy:** ${pl(P)} ÷ ${pl(c)} = ${roundTo(N, 2)}, so 1 in **${commas(roundTo(N, 0))}**.\n\n**Accepted?** 1 in ${commas(roundTo(N, 0))} is ${N >= limit ? "at least" : "worse than"} 1 in ${commas(limit)}: **${YN(N >= limit)}**.`;
      return finish(`A closed traverse **${LEGN.slice(0, n)}${LEGN[0]}** was measured:\n\n${table}\n\n${TRAV_NOTE}`, parts, ex, "sur-trav3", { tier, legs: legs.map((l) => [l.dE, l.dN, l.L]), limit },
        [...lenGiven, ["_limit", limit]],
        ["The misclosure uses the component columns; the perimeter uses the Length column.", "A larger N means a better traverse."]);
    }
    // expert-plus: misclosure -> N -> largest misclosure allowed by a stated accuracy -> two-column verdict
    const met = want;
    const fitM = LIMITS.filter((m) => { const a = P / m; return !nearHalf(a, 2, 0.12) && a >= 0.03 && Math.abs(c - a) >= 0.02 && Math.abs(c - a) / a >= 0.1 && (c <= a) === met; });
    if (!fitM.length) continue;
    const M = rng.pick(fitM), allowRaw = P / M;
    const bigger = Math.abs(eE) > Math.abs(eN) ? "Easting" : "Northing";
    const parts = [
      numPart("c", "Misclosure", "Misclosure of the traverse (m)", c, 2, "Add each column of components with its signs, then use Pythagoras on the two sums."),
      numPart("n", "Linear accuracy", "N in the linear accuracy 1 in N (N)", N, 0, "N = perimeter ÷ misclosure; the perimeter is the sum of the Length column.", true),
      numPart("allow", "Largest misclosure", `Largest misclosure that still gives 1 in ${commas(M)} (m)`, allowRaw, 2, "Work backwards: misclosure = perimeter ÷ M."),
      segPart2(rng, "v", "Verdict", `Does the traverse reach **1 in ${commas(M)}**, and which closing error (ΣΔE or ΣΔN) is larger in size?`, ["Accuracy limit", "Larger closing error"], ["Met", "Not met"], ["Easting", "Northing"], [met ? "Met" : "Not met", bigger],
        "The limit is met when the misclosure is no more than the largest allowed. For the second column compare the sizes of ΣΔE and ΣΔN, ignoring signs."),
    ];
    const ex = `**Misclosure:** ${sumTxt}; √((${sg(eE)})² + (${sg(eN)})²) = **${pl(c)} m**.\n\n**Linear accuracy:** perimeter ${lens} = ${pl(P)} m, so N = ${pl(P)} ÷ ${pl(c)} = **${commas(roundTo(N, 0))}**.\n\n**Largest misclosure:** ${pl(P)} ÷ ${commas(M)} = **${pl(allowRaw)} m**.\n\n**Verdict:** ${pl(c)} m is ${met ? "no more than" : "more than"} ${pl(allowRaw)} m, so the limit is **${met ? "met" : "not met"}**. |ΣΔE| = ${pl(Math.abs(eE))} and |ΣΔN| = ${pl(Math.abs(eN))}, so the larger closing error is in **${bigger}**.`;
    return finish(`A closed traverse **${LEGN.slice(0, n)}${LEGN[0]}** was measured:\n\n${table}\n\n${TRAV_NOTE}`, parts, ex, "sur-trav4", { tier, legs: legs.map((l) => [l.dE, l.dN, l.L]), M },
      [...lenGiven, ["_M", M]],
      ["Find the misclosure and the perimeter first.", "For the allowed misclosure, turn 1 in M around: misclosure = perimeter ÷ M."]);
  }
  return tooMany();
}

// ---------- plot-area ----------

const area2 = (pts) => pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0);
function segCross(p1, p2, p3, p4) {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2);
}
function isSimple(pts) {
  const n = pts.length;
  for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) {
    if (a === 0 && b === n - 1) continue;
    if (segCross(pts[a], pts[(a + 1) % n], pts[b], pts[(b + 1) % n])) return false;
  }
  return true;
}
// A simple polygon with corners on a 10 m grid, listed anticlockwise or clockwise (coin), area a multiple of 50 m².
function genPoly(rng, n, ccw) {
  for (let t = 0; t < 400; t++) {
    const base = rng.int(0, 359), pts = [];
    for (let k = 0; k < n; k++) {
      const ang = base + (k * 360) / n + rng.int(-15, 15), r = rng.int(7, 14) * 10;
      pts.push([Math.round((170 + r * Math.cos(rad(ang))) / 10) * 10, Math.round((170 + r * Math.sin(rad(ang))) / 10) * 10]);
    }
    if (new Set(pts.map((p) => p.join())).size < n || !isSimple(pts)) continue;
    let S = area2(pts);
    if (Math.abs(S) / 2 < 3000 || Math.abs(S) / 2 > 45000) continue;
    const flip = ccw === undefined ? rng.next() < 0.5 : (S > 0) !== ccw;
    if (flip) pts.reverse();
    return pts;
  }
  return null;
}
const polyTable = (pts, unknownLast) =>
  "| Peg | Easting (m) | Northing (m) |\n| --- | --- | --- |\n" + pts.map(([x, y], k) => `| ${LEGN[k]} | ${x} | ${unknownLast && k === pts.length - 1 ? "?" : y} |`).join("\n");
const polyGiven = (pts) => pts.flatMap(([x, y], k) => [[`_E${LEGN[k]}`, x], [`_N${LEGN[k]}`, y]]).slice(0, 8);
const SHOE = "Use the coordinate (shoelace) method: area = ½ |Σ(Eᵢ × Nᵢ₊₁ − Eᵢ₊₁ × Nᵢ)|, going once round the corners in the order listed and back to the first. 1 hectare (ha) = 10 000 m².";

function genPlot(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "expert-plus") {
      const pts = genPoly(rng, 4, true);
      if (!pts) continue;
      const S = area2(pts) / 2, [Cx, Cy] = pts[2], [Dx, Dy] = pts[3];
      if (S < 5000 || pts[2][0] === pts[0][0]) continue;
      const len = Math.hypot(Dx - Cx, Dy - Cy), len1 = roundTo(len, 1);
      if (len < 20 || nearHalf(len, 1, 0.12)) continue;
      const size = rng.pick([300, 400, 500, 600]), q = (0.85 * S) / size, plots = Math.floor(q);
      if (plots < 5 || q - plots < 0.08 || q - plots > 0.92) continue;
      const rate = rng.pick([20, 25, 30, 40, 45]), cost = len * rate, cost1 = len1 * rate, ok = rng.next() < 0.5;
      const B = ok ? Math.ceil((Math.max(cost, cost1) + rate * 0.3) / 50) * 50 + 50 * rng.int(0, 2) : Math.floor((Math.min(cost, cost1) - rate * 0.3) / 50) * 50 - 50 * rng.int(0, 2);
      if (B <= 0 || (cost <= B) !== ok || (cost1 <= B) !== ok) continue;
      const parts = [
        numPart("dy", "Northing of D", "Northing of corner D (m)", Dy, 0, "Work backwards: write the shoelace sum with the unknown Northing of D, set the area equal to the stated value, and solve for it.", true),
        numPart("len", "Side CD", "Length of side CD, using the Northing you found (m)", len, 1, "Pythagoras on the differences in Easting and Northing between C and D."),
        numPart("plots", "Whole plots", `Number of whole plots of at least ${size} m² that the plot can give (round down)`, plots, 0, "Take 85% of the area, divide by the plot size and round down."),
        yesNo(rng, "ok", "Fence budget enough?", `A fence along side CD costs **$${rate} per metre**. Is a budget of **$${commas(B)}** enough for side CD (use your length of CD)?`, ok, "Cost = length × rate; the budget is enough if it is at least the cost."),
      ];
      const ex = `**Northing of D:** the signed shoelace sum must equal 2 × ${commas(S)} = ${commas(2 * S)}. With D = (${Dx}, y) the sum is ${commas(2 * S)} only for **y = ${Dy} m**.\n\n**Side CD:** √((${Dx} − ${Cx})² + (${Dy} − ${Cy})²) = **${pl(len, 1)} m**.\n\n**Plots:** 0.85 × ${commas(S)} ÷ ${size} = ${roundTo(q, 2)}, so **${plots}** whole plots.\n\n**Fence:** ${pl(len, 1)} × ${rate} = $${commas(roundTo(cost1, 2).toFixed(2))}, which is ${ok ? "within" : "over"} the budget of $${commas(B)}: **${YN(ok)}**.`;
      return finish(`A plot has corners **A, B, C, D**, listed anticlockwise, on a local grid. The Northing of D is missing, but the plot's area is **${commas(S)} m²**.\n\n${polyTable(pts, true)}\n\n${SHOE} The 'listed anticlockwise' rule means the signed sum is positive. Roads and services take **15%** of the area and the rest is divided into whole plots of at least **${size} m²**.`,
        parts, ex, "sur-plot4", { tier, pts, S, size, rate, B }, [...polyGiven(pts.slice(0, 3)), ["_Dx", Dx], ["_area", S]],
        ["Only one corner's Northing is unknown, so the shoelace sum is a simple equation in it.", "Once D is known, CD is a distance between two points."]);
    }
    const n = tier === "medium" ? 3 : tier === "hard" ? 4 : 5;
    const pts = genPoly(rng, n);
    if (!pts) continue;
    const A = Math.abs(area2(pts)) / 2, ha = A / 10000;
    const prompt = `A plot has **${n}** corner pegs, listed in order round its boundary, in metres on a local grid:\n\n${polyTable(pts, false)}\n\n${SHOE}`;
    const given = polyGiven(pts);
    const terms = pts.map(([x, y], k) => { const [x2, y2] = pts[(k + 1) % n]; return `${x}×${y2} − ${x2}×${y}`; }).join(" + ");
    const base = [
      numPart("a", "Area", "Area of the plot (m²)", A, 0, "Multiply each Easting by the next Northing, subtract the next Easting times this Northing, add up all the terms, take the size and halve it.", true),
      numPart("ha", "Hectares", "Area in hectares (1 ha = 10 000 m²)", ha, 3, "Divide the area in m² by 10 000."),
    ];
    const exA = `**Area:** Σ = ${terms} = ${commas(area2(pts))}; area = ½ × ${commas(Math.abs(area2(pts)))} = **${commas(A)} m²**.\n\n**Hectares:** ${commas(A)} ÷ 10 000 = **${pl(ha, 3)} ha**.`;
    if (tier === "medium") {
      return finish(prompt, base, exA, "sur-plot1", { tier, pts }, given, ["Shoelace first, then convert to hectares.", "The area is half the absolute value of the sum."]);
    }
    if (tier === "hard") {
      const price = rng.int(8, 60), val = A * price;
      const parts = [...base, numPart("v", "Land value", `Value of the plot at $${price} per m² ($)`, val, 0, "Value = area in m² × price per m².", true)];
      return finish(prompt, parts, `${exA}\n\n**Value:** ${commas(A)} × ${price} = **$${commas(val)}**.`, "sur-plot2", { tier, pts, price }, [...given.slice(0, 7), ["_price", price]],
        ["Area in m² first; the value uses m², not hectares.", "Hectares come from dividing by 10 000."]);
    }
    const size = rng.pick([300, 400, 500, 600]), q = (0.85 * A) / size, plots = Math.floor(q);
    if (plots < 5 || q - plots < 0.08 || q - plots > 0.92) continue;
    const price = rng.int(20, 90) * 1000, rev = plots * price;
    const parts = [...base,
      numPart("plots", "Whole plots", `Number of whole plots of at least ${size} m² that can be made after roads and services take 15% of the area (round down)`, plots, 0, "Take 85% of the area, divide by the plot size and round down."),
      numPart("rev", "Sales value", `Sales value if every plot sells at $${commas(price)} ($)`, rev, 0, "Number of plots × price per plot.", true)];
    return finish(prompt + ` Roads and services take **15%** of the area. The rest is divided into whole plots of at least **${size} m²**, each sold at **$${commas(price)}**.`, parts,
      `${exA}\n\n**Plots:** 0.85 × ${commas(A)} ÷ ${size} = ${roundTo(q, 2)}, rounded down to **${plots}**.\n\n**Sales value:** ${plots} × ${commas(price)} = **$${commas(rev)}**.`,
      "sur-plot3", { tier, pts, size, price }, [...given.slice(0, 6), ["_size", size], ["_price", price]],
      ["Area first, then take away the roads before counting plots.", "A part-plot does not count: round down."]);
  }
  return tooMany();
}

// ---------- levelling ----------
// All readings and levels are kept in integer millimetres while drawing, so nothing is rounded.

const KS = [0.25, 0.36, 0.49, 0.64, 0.81, 1, 1.44, 1.69, 2.25, 2.56]; // 10 x sqrt(K) is a whole number of mm
const LEV_NOTE = "A **reduced level (RL)** is a height above the datum. In the height-of-instrument method HI = RL of the point just read on a backsight + the backsight, and RL = HI − reading. In the rise-and-fall method a point is a **rise** if the reading on it is smaller than the reading before it, otherwise a **fall**.";

function genLevel(rng, tier) {
  const rd = () => rng.int(400, 3200);
  for (let i = 0; i < TRY; i++) {
    const R0 = rng.int(20000, 95000);
    if (tier === "medium") {
      const BS = rd(), FS = rd(), rise = BS - FS;
      if (Math.abs(rise) < 50 || Math.abs(rise) > 2200) continue;
      const parts = [
        numPart("rf", "Rise or fall", "Rise (+) or fall (−) from BM to P (m)", rise / 1000, 3, "Rise or fall = backsight − foresight; a smaller reading on P than on BM means P is higher."),
        numPart("rl", "RL of P", "Reduced level of P (m)", (R0 + rise) / 1000, 3, "RL of P = RL of BM + rise (or − fall)."),
      ];
      const ex = `**Rise or fall:** ${mmTxt(BS)} − ${mmTxt(FS)} = **${sg(rise / 1000, 3)} m** (${rise >= 0 ? "a rise" : "a fall"}).\n\n**RL of P:** ${mmTxt(R0)} ${rise >= 0 ? "+" : "−"} ${mmTxt(Math.abs(rise))} = **${mmTxt(R0 + rise)} m**.`;
      return finish(`A level is set up between a benchmark **BM** (RL **${mmTxt(R0)} m**) and a point **P**. The staff reading on BM (the backsight) is **${mmTxt(BS)} m** and the reading on P (the foresight) is **${mmTxt(FS)} m**. ${LEV_NOTE}`,
        parts, ex, "sur-lev1", { tier, R0, BS, FS }, [["_RL", R0 / 1000], ["_BS", BS / 1000], ["_FS", FS / 1000]],
        ["Compare the two readings to see whether P is higher or lower than BM.", "A rise is added to the RL, a fall is subtracted."]);
    }
    if (tier === "hard") {
      const BS = rd(), IS = rd(), FS = rd(), HI = R0 + BS, rI = HI - IS, rF = HI - FS;
      if (IS === FS || Math.abs(IS - BS) > 2400 || Math.abs(FS - BS) > 2400) continue;
      const parts = [
        numPart("hi", "Height of instrument", "Height of the instrument, HI (m)", HI / 1000, 3, "HI = RL of BM + the backsight reading on BM."),
        numPart("rli", "RL of P", "Reduced level of P, the intermediate sight (m)", rI / 1000, 3, "RL = HI − the reading on that point."),
        numPart("rlf", "RL of Q", "Reduced level of Q, the foresight (m)", rF / 1000, 3, "RL = HI − the foresight reading."),
      ];
      const ex = `**HI:** ${mmTxt(R0)} + ${mmTxt(BS)} = **${mmTxt(HI)} m**.\n\n**RL of P:** ${mmTxt(HI)} − ${mmTxt(IS)} = **${mmTxt(rI)} m**.\n\n**RL of Q:** ${mmTxt(HI)} − ${mmTxt(FS)} = **${mmTxt(rF)} m**.`;
      return finish(`One instrument position is used to book three staff readings, in metres:\n\n| Station | BS | IS | FS |\n| --- | --- | --- | --- |\n| BM (RL ${mmTxt(R0)}) | ${mmTxt(BS)} | – | – |\n| P | – | ${mmTxt(IS)} | – |\n| Q | – | – | ${mmTxt(FS)} |\n\n${LEV_NOTE}`,
        parts, ex, "sur-lev2", { tier, R0, BS, IS, FS }, [["_RL", R0 / 1000], ["_BS", BS / 1000], ["_IS", IS / 1000], ["_FS", FS / 1000]],
        ["Find the height of the instrument first; every level in this setup comes from it.", "A bigger reading means a lower point."]);
    }
    if (tier === "expert") {
      const BS1 = rd(), IS1 = rd(), FS1 = rd(), BS2 = rd(), FS2 = rd();
      const HI1 = R0 + BS1, rP = HI1 - IS1, rCP = HI1 - FS1, HI2 = rCP + BS2, rQ = HI2 - FS2, chk = BS1 + BS2 - FS1 - FS2;
      if (Math.abs(chk) < 50 || Math.abs(BS1 - FS1) > 2400 || Math.abs(BS2 - FS2) > 2400 || new Set([IS1, FS1]).size < 2) continue;
      const parts = [
        numPart("rlp", "RL of P", "Reduced level of P (m)", rP / 1000, 3, "HI of the first setup = RL of BM + BS; RL of P = HI − the intermediate sight."),
        numPart("rlcp", "RL of CP", "Reduced level of the change point CP (m)", rCP / 1000, 3, "RL of CP = first HI − the foresight read on CP."),
        numPart("rlq", "RL of Q", "Reduced level of Q (m)", rQ / 1000, 3, "Second HI = RL of CP + the backsight read on CP; RL of Q = second HI − the foresight."),
        numPart("chk", "Arithmetic check", "ΣBS − ΣFS (m, with its sign)", chk / 1000, 3, "Add all backsights, add all foresights and subtract; the result must equal the last RL minus the first RL."),
      ];
      const ex = `**HI₁:** ${mmTxt(R0)} + ${mmTxt(BS1)} = ${mmTxt(HI1)}; **RL of P** = ${mmTxt(HI1)} − ${mmTxt(IS1)} = **${mmTxt(rP)} m**.\n\n**RL of CP** = ${mmTxt(HI1)} − ${mmTxt(FS1)} = **${mmTxt(rCP)} m**.\n\n**HI₂:** ${mmTxt(rCP)} + ${mmTxt(BS2)} = ${mmTxt(HI2)}; **RL of Q** = ${mmTxt(HI2)} − ${mmTxt(FS2)} = **${mmTxt(rQ)} m**.\n\n**Check:** (${mmTxt(BS1)} + ${mmTxt(BS2)}) − (${mmTxt(FS1)} + ${mmTxt(FS2)}) = **${sg(chk / 1000, 3)} m**, and ${mmTxt(rQ)} − ${mmTxt(R0)} = ${sg((rQ - R0) / 1000, 3)} m, so the book checks.`;
      return finish(`A level run uses two instrument positions with a change point **CP** between them. The readings, in metres:\n\n| Station | BS | IS | FS |\n| --- | --- | --- | --- |\n| BM (RL ${mmTxt(R0)}) | ${mmTxt(BS1)} | – | – |\n| P | – | ${mmTxt(IS1)} | – |\n| CP, first setup | – | – | ${mmTxt(FS1)} |\n| CP, second setup | ${mmTxt(BS2)} | – | – |\n| Q | – | – | ${mmTxt(FS2)} |\n\n${LEV_NOTE}`,
        parts, ex, "sur-lev3", { tier, R0, BS1, IS1, FS1, BS2, FS2 }, [["_RL", R0 / 1000], ["_BS1", BS1 / 1000], ["_IS1", IS1 / 1000], ["_FS1", FS1 / 1000], ["_BS2", BS2 / 1000], ["_FS2", FS2 / 1000]],
        ["The change point links the two setups: a new HI starts from its RL.", "The check compares the sum of backsights minus foresights with the overall change in level."]);
    }
    // expert-plus: three setups by rise and fall -> closing RL -> misclosure (mm) -> allowance 10 mm x sqrt(K) -> verdict
    const BS = [rd(), rd(), rd()], FS = [rd(), rd(), rd()];
    if (BS.some((b, k) => Math.abs(b - FS[k]) > 2400 || Math.abs(b - FS[k]) < 30)) continue;
    const rl = R0 + sum(BS) - sum(FS), K = rng.pick(KS), allow = Math.round(10 * Math.sqrt(K));
    const ok = rng.next() < 0.5, mag = ok ? rng.int(1, allow - 1) : allow + rng.int(1, 6), mis = (rng.next() < 0.5 ? -1 : 1) * mag;
    const known = rl - mis;
    const parts = [
      numPart("rl", "Closing RL", "Reduced level of the closing benchmark BM2, as computed from the readings (m)", rl / 1000, 3, "Follow the rise-and-fall method: for each setup the change in level is BS − FS (a rise if positive); add all three to the RL of BM1."),
      numPart("mis", "Misclosure", "Misclosure = computed RL − known RL, in millimetres (whole mm, with its sign)", mis, 0, "Subtract the known RL from your computed RL, then multiply metres by 1000.", true),
      numPart("allow", "Allowable misclosure", `Allowable misclosure for K = ${f(K)} km (mm)`, allow, 0, "Allowable = 10 mm × √K, with K in km.", true),
      yesNo(rng, "ok", "Run accepted?", "Is the level run accepted? It is accepted if the size of the misclosure is no more than the allowable misclosure.", ok, "Compare the size of your misclosure, ignoring its sign, with the allowable value."),
    ];
    const chg = BS.map((b, k) => sg((b - FS[k]) / 1000, 3));
    const ex = `**Changes in level:** ${BS.map((b, k) => `${mmTxt(b)} − ${mmTxt(FS[k])} = ${chg[k]}`).join("; ")}.\n\n**Computed RL of BM2:** ${mmTxt(R0)} + (${chg.join(") + (")}) = **${mmTxt(rl)} m**.\n\n**Misclosure:** ${mmTxt(rl)} − ${mmTxt(known)} = ${sg(mis / 1000, 3)} m = **${sgi(mis)} mm**.\n\n**Allowable:** 10 × √${f(K)} = **${allow} mm**.\n\n**Accepted?** |${sgi(mis)}| is ${ok ? "no more than" : "more than"} ${allow}: **${YN(ok)}**.`;
    return finish(`A level run goes from **BM1** (RL **${mmTxt(R0)} m**) to a second benchmark **BM2** (known RL **${mmTxt(known)} m**) through three instrument positions and two change points, CP1 and CP2. The readings, in metres:\n\n| Station | BS | FS |\n| --- | --- | --- |\n| BM1 | ${mmTxt(BS[0])} | – |\n| CP1 | ${mmTxt(BS[1])} | ${mmTxt(FS[0])} |\n| CP2 | ${mmTxt(BS[2])} | ${mmTxt(FS[1])} |\n| BM2 | – | ${mmTxt(FS[2])} |\n\n(On a change-point row the FS is read from the earlier setup and the BS from the next one.) The run is **${f(K)} km** long and the allowable misclosure is **10 mm × √K**, with K in km. ${LEV_NOTE}`,
      parts, ex, "sur-lev4", { tier, R0, BS, FS, known, K }, [["_RL1", R0 / 1000], ["_RL2", known / 1000], ["_BS1", BS[0] / 1000], ["_FS1", FS[0] / 1000], ["_BS2", BS[1] / 1000], ["_FS2", FS[1] / 1000], ["_BS3", BS[2] / 1000], ["_FS3", FS[2] / 1000]],
      ["The overall change in level is the total of the backsights minus the total of the foresights.", "The misclosure is how far the computed RL of BM2 is from its known RL."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "coordinates") return genCoord(rng, difficulty);
  if (subtopic === "traverse-closure") return genTraverse(rng, difficulty);
  if (subtopic === "plot-area") return genPlot(rng, difficulty);
  if (subtopic === "levelling") return genLevel(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stored inputs by a different route (cos(90 - bearing) for sin,
// atan with a quadrant fix for the bearing, column sums by reduce, the trapezoid form of the area
// formula and a two-point solve for the unknown Northing, rise-and-fall chains against height of
// instrument). Numbers are compared with the rounded truth; choices exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const bearingAlt = (dE, dN) => { let b = (Math.atan(dE / dN) * 180) / Math.PI; if (dN < 0) b += 180; else if (dE < 0) b += 360; return b; };
const compsAlt = (d, th) => ({ dE: d * Math.cos(rad(90 - th)), dN: d * Math.sin(rad(90 - th)) });
// Area (signed, anticlockwise positive) by the trapezoid form.
const trap = (pts) => pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + ((x - x2) * (y + y2)) / 2; }, 0);
const shoeAlt = (p) => {
  const A = Math.abs(trap(p.pts));
  return { a: A, ha: A / 10000 };
};
const travAlt = (p) => {
  const eE = p.legs.reduce((s, l) => s + l[0], 0), eN = p.legs.reduce((s, l) => s + l[1], 0);
  const c = Math.sqrt(eE * eE + eN * eN);
  const P = p.legs.length && p.legs[0].length > 2 ? p.legs.reduce((s, l) => s + l[2], 0) : NaN;
  return { eE, eN, c, P };
};
const rf = (BS, FS) => BS - FS; // rise (+) or fall (-) in mm

const ALT = {
  "sur-coord1": (p) => { const c = compsAlt(p.d, p.th); return { de: c.dE, dn: c.dN }; },
  "sur-coord2": (p) => {
    const c = compsAlt(p.d, p.th);
    return { de: c.dE, dn: c.dN, b: `${pl(p.E0 + roundTo(c.dE, 2))} | ${pl(p.N0 + roundTo(c.dN, 2))}` };
  },
  "sur-coord3": (p) => {
    const c = compsAlt(p.d, p.th);
    const EB = p.E0 + roundTo(c.dE, 2), NB = p.N0 + roundTo(c.dN, 2);
    const vE = p.Ec - EB, vN = p.Nc - NB;
    return { eb: p.E0 + c.dE, nb: p.N0 + c.dN, bc: Math.sqrt(vE * vE + vN * vN), brg: bearingAlt(vE, vN) };
  },
  "sur-coord4": (p) => {
    const dE = p.EB - p.EA, dN = p.NB - p.NA;
    const th = bearingAlt(dE, dN);
    const ec = roundTo(p.EB + p.w * Math.sin(rad(th + 90)), 2);
    return { brg: th, dist: Math.sqrt(dE * dE + dN * dN), ec, ok: YN(ec <= p.Ef - 2 + 1e-9) };
  },
  "sur-trav1": (p) => { const t = travAlt(p); return { ee: t.eE, en: t.eN }; },
  "sur-trav2": (p) => { const t = travAlt(p); return { ee: t.eE, en: t.eN, c: t.c }; },
  "sur-trav3": (p) => { const t = travAlt(p); return { c: t.c, p: t.P, n: t.P / t.c, ok: YN(t.P / t.c >= p.limit) }; },
  "sur-trav4": (p) => {
    const t = travAlt(p);
    return { c: t.c, n: t.P / t.c, allow: t.P / p.M, v: `${t.P / t.c >= p.M ? "Met" : "Not met"} | ${Math.abs(t.eE) > Math.abs(t.eN) ? "Easting" : "Northing"}` };
  },
  "sur-plot1": (p) => shoeAlt(p),
  "sur-plot2": (p) => { const s = shoeAlt(p); return { ...s, v: s.a * p.price }; },
  "sur-plot3": (p) => {
    const s = shoeAlt(p), plots = Math.floor((s.a * 85) / 100 / p.size + 1e-9);
    return { ...s, plots, rev: plots * p.price };
  },
  "sur-plot4": (p) => {
    // Northing of D: area is linear in it, so solve from two trial values instead of rearranging.
    const withD = (y) => trap([p.pts[0], p.pts[1], p.pts[2], [p.pts[3][0], y]]);
    const f0 = withD(0), slope = withD(1) - f0, Dy = (p.S - f0) / slope;
    const [Cx, Cy] = p.pts[2], Dx = p.pts[3][0];
    const len = Math.sqrt((Dx - Cx) ** 2 + (Dy - Cy) ** 2);
    const plots = Math.floor((p.S * 85) / 100 / p.size + 1e-9);
    return { dy: Dy, len, plots, ok: YN(roundTo(len, 1) * p.rate <= p.B + 1e-9) };
  },
  "sur-lev1": (p) => { const HI = p.R0 + p.BS, rl = HI - p.FS; return { rf: (rl - p.R0) / 1000, rl: rl / 1000 }; },
  "sur-lev2": (p) => {
    const rlI = p.R0 + rf(p.BS, p.IS), rlF = rlI + rf(p.IS, p.FS); // rise and fall chain
    return { hi: (p.R0 + p.BS) / 1000, rli: rlI / 1000, rlf: rlF / 1000 };
  },
  "sur-lev3": (p) => {
    const rP = p.R0 + rf(p.BS1, p.IS1), rCP = rP + rf(p.IS1, p.FS1), rQ = rCP + rf(p.BS2, p.FS2);
    return { rlp: rP / 1000, rlcp: rCP / 1000, rlq: rQ / 1000, chk: (p.BS1 + p.BS2 - (p.FS1 + p.FS2)) / 1000 };
  },
  "sur-lev4": (p) => {
    let rl = p.R0;
    for (let k = 0; k < 3; k++) rl += rf(p.BS[k], p.FS[k]);
    const mis = Math.round(rl - p.known), allow = Math.round(10 * Math.sqrt(p.K));
    return { rl: rl / 1000, mis, allow, ok: YN(Math.abs(mis) <= allow) };
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
