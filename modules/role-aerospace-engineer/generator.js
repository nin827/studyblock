// Aerospace Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is stable (working from an earlier rounded answer gives the same result), no answer
// sits on a rounding half-step, and decision parts (Yes/No, list picks) are decided first, then fitted with
// a clear margin. Textbook practice on made-up vehicles: g = 9.81 N/kg, air density 1.2 kg/m^3 and every
// rule are stated in each prompt. Not for real aircraft or rocket design.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   lift-off       weight and thrust-to-weight; hard decides lift-off; expert applies a stated launch rule to
//                  dry + propellant + payload; expert-plus follows the acceleration while propellant burns
//   lift-stall     dynamic pressure and lift (L = 1/2 rho v^2 S CL); hard compares lift with weight; expert
//                  sizes the wing and picks from a list; expert-plus finds stall and approach speed vs a km/h limit
//   rocket-staging mass ratio and delta-v (ve ln(m0/mf)); hard checks a target; expert works back to
//                  propellant mass and a tank check; expert-plus adds two stages
//   mass-balance   total mass and centre of gravity from a loading table; hard checks stated limits; expert
//                  follows the CG after fuel burn; expert-plus moves baggage to bring the CG back in limits

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const G = 9.81, RHO = 1.2;
const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? ", to the nearest whole number" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 40000;
const tooMany = () => { throw new Error("role-aerospace-engineer: no suitable draw"); };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const same = (a, b, dp) => roundTo(a, dp) === roundTo(b, dp);
const clear = (x, thr, rel) => Math.abs(x - thr) >= rel * Math.abs(thr);
const r2 = (x) => roundTo(x, 2);

function numPart(id, label, ask, val, dp, hint) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
const pickPart = (rng, id, label, ask, options, answer, hint) => ({ id, label, ask, answerType: "choice", answer, choices: shuffled(rng, options), hint });
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
const table = (rows) => ["| Item | Mass (kg) | Arm (m) |", "| --- | ---: | ---: |",
  ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2].toFixed(2)} |`)].join("\n");

// ---------- lift-off ----------

const gRule = "Weight = mass × g, with g = 9.81 N/kg (so weight in kN = mass in kg × 9.81 ÷ 1000). Thrust-to-weight ratio = thrust ÷ weight, in the same units.";

function genLift(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium" || tier === "hard") {
      const m = rng.int(16, 180) * 500, W = (m * G) / 1000;
      const tw = tier === "medium" ? 0.6 + rng.next() * 1.8 : wantOk ? 1.06 + rng.next() * 0.9 : 0.55 + rng.next() * 0.39;
      const T = Math.round(tw * W), twr = T / W;
      if (twr < 0.5 || nearHalf(W, 1) || nearHalf(twr, 2) || !same(twr, T / roundTo(W, 1), 2)) continue;
      const ok = T > W;
      if (tier === "hard" && (ok !== wantOk || !clear(twr, 1, 0.05))) continue;
      const pW = numPart("weight", "Weight", "Weight of the vehicle (kN)", W, 1, "Mass in kg times 9.81 gives newtons; divide by 1000 for kN.");
      const pR = numPart("twr", "Thrust-to-weight", "Thrust-to-weight ratio", twr, 2, "Divide the thrust by the weight, both in kN.");
      const ex = `**Weight:** ${m} × 9.81 ÷ 1000 = **${f(roundTo(W, 1))} kN**.\n\n**Thrust-to-weight:** ${T} ÷ ${f(roundTo(W, 1))} = **${f(roundTo(twr, 2))}**.`;
      const given = [["_mass", m], ["_thrust", T], ["_g", G]];
      if (tier === "medium") {
        return finish(`A test vehicle has a mass of **${m} kg** and its engines give a thrust of **${T} kN** at lift-off. ${gRule}`,
          [pW, pR], ex, "aer-lo1", { tier, m, T }, given, ["Weight first, then the ratio.", "Use kN for both thrust and weight."]);
      }
      return finish(`A test vehicle has a mass of **${m} kg** and its engines give a thrust of **${T} kN** at lift-off. ${gRule} It can leave the pad only if the thrust is greater than the weight.`,
        [pW, pR, yesNo("lift", "Lifts off?", "Will the vehicle leave the pad?", ok, "It leaves the pad only if the thrust-to-weight ratio is above 1.")],
        `${ex}\n\nThe ratio is ${ok ? "above" : "below"} 1, so it ${ok ? "lifts off" : "stays on the pad"}: **${YN(ok)}**.`,
        "aer-lo2", { tier, m, T }, given, ["Weight and ratio as before.", "A ratio above 1 means the thrust beats the weight."]);
    }
    if (tier === "expert") {
      const d = rng.int(4, 30) * 500, p = rng.int(10, 120) * 500, l = rng.int(1, 10) * 500, m = d + p + l, W = (m * G) / 1000;
      const tw = wantOk ? 1.26 + rng.next() * 0.45 : 0.95 + rng.next() * 0.19;
      const T = Math.round(tw * W), twr = T / W;
      if (nearHalf(W, 1) || nearHalf(twr, 2) || !same(twr, T / roundTo(W, 1), 2)) continue;
      const ok = twr >= 1.2;
      if (ok !== wantOk || !clear(twr, 1.2, 0.04)) continue;
      const parts = [
        numPart("mass", "Total mass", "Total mass at lift-off (kg)", m, 0, "Add the dry mass, the propellant and the payload."),
        numPart("weight", "Weight", "Weight of the loaded vehicle (kN)", W, 1, "Total mass times 9.81, then divide by 1000."),
        numPart("twr", "Thrust-to-weight", "Thrust-to-weight ratio", twr, 2, "Thrust in kN divided by weight in kN."),
        yesNo("ok", "Meets the rule?", "Does the vehicle meet the launch rule (ratio at least 1.2)?", ok, "Compare the ratio with 1.2; equal or above passes.")];
      return finish(`A launcher has a dry mass of **${d} kg**, carries **${p} kg** of propellant and a payload of **${l} kg**. Its engines give **${T} kN** of thrust at lift-off. ${gRule} For this exercise a launch is allowed only if the thrust-to-weight ratio is **at least 1.2**.`,
        parts, `**Total mass:** ${d} + ${p} + ${l} = **${m} kg**.\n\n**Weight:** ${m} × 9.81 ÷ 1000 = **${f(roundTo(W, 1))} kN**.\n\n**Thrust-to-weight:** ${T} ÷ ${f(roundTo(W, 1))} = **${f(roundTo(twr, 2))}**, which is ${ok ? "at least" : "below"} 1.2: **${YN(ok)}**.`,
        "aer-lo3", { tier, d, p, l, T }, [["_dry", d], ["_prop", p], ["_payload", l], ["_thrust", T], ["_g", G]],
        ["Total mass first.", "Weight, then the ratio.", "The rule is a minimum ratio of 1.2."]);
    }
    // expert-plus: acceleration while propellant burns, thrust constant
    const m0 = rng.int(16, 180) * 500, W = (m0 * G) / 1000;
    const tw0 = 1.15 + rng.next() * 0.5, T = Math.round(tw0 * W);
    const t = rng.pick([10, 15, 20, 25, 30, 40, 45, 60]), frac = 0.1 + rng.next() * 0.35;
    const mdot = Math.round((frac * m0) / t / 10) * 10;
    if (mdot < 10) continue;
    const mt = m0 - mdot * t;
    if (mt < 0.5 * m0) continue;
    const a0 = (T * 1000) / m0 - G, at = (T * 1000) / mt - G;
    if (a0 < 1.5 || nearHalf(a0, 2) || nearHalf(at, 2)) continue;
    const ok = at >= 2 * a0;
    if (ok !== wantOk || !clear(at / a0, 2, 0.05)) continue;
    const parts = [
      numPart("a0", "Start acceleration", "Acceleration at lift-off (m/s²)", a0, 2, "Net force = thrust − weight (both in N); acceleration = net force ÷ mass."),
      numPart("mass", "Mass later", `Mass after ${t} s (kg)`, mt, 0, "Propellant burned = burn rate × time; subtract it from the starting mass."),
      numPart("at", "Later acceleration", `Acceleration after ${t} s (m/s²)`, at, 2, "Same method, with the new, smaller mass and the same thrust."),
      yesNo("ok", "At least double?", "Is the later acceleration at least double the lift-off acceleration?", ok, "Divide the later acceleration by the first and compare with 2.")];
    return finish(`A rocket has a mass of **${m0} kg** at lift-off and a constant thrust of **${T} kN**. It burns propellant at **${mdot} kg/s**. Ignore drag, and keep g = 9.81 N/kg at all heights. Acceleration = (thrust − weight) ÷ mass, with thrust and weight in newtons (1 kN = 1000 N).`,
      parts, `**Start:** (${T} × 1000 − ${m0} × 9.81) ÷ ${m0} = **${f(roundTo(a0, 2))} m/s²**.\n\n**Mass after ${t} s:** ${m0} − ${mdot} × ${t} = **${mt} kg**.\n\n**Later:** (${T} × 1000 − ${mt} × 9.81) ÷ ${mt} = **${f(roundTo(at, 2))} m/s²**.\n\n**Check:** ${f(roundTo(at, 2))} ÷ ${f(roundTo(a0, 2))} is ${ok ? "at least" : "below"} 2: **${YN(ok)}**.`,
      "aer-lo4", { tier, m0, T, mdot, t }, [["_mass", m0], ["_thrust", T], ["_burn", mdot], ["_time", t], ["_g", G]],
      ["Acceleration at the start first.", "Burned mass, then the new mass.", "Same formula with the new mass.", "Ratio of the two accelerations."]);
  }
  return tooMany();
}

// ---------- lift-stall ----------

const liftRule = "Dynamic pressure q = ½ × ρ × v², with air density ρ = 1.2 kg/m³ and v in m/s (q in Pa). Lift = q × wing area S × lift coefficient C_L (in N). Weight = mass × 9.81 N/kg.";
const WINGS = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 60, 70, 80, 100];
const qOf = (v) => 0.5 * RHO * v * v;

function genLiftEq(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const v = rng.int(20, 95), S = rng.pick([8, 10, 12, 14, 16, 18, 20, 24, 28, 32]), CL = rng.int(4, 16) / 10;
      const q = qOf(v), L = q * S * CL;
      if (nearHalf(L, 0)) continue;
      return finish(`A light aircraft flies at **${v} m/s** with a wing area of **${S} m²** and a lift coefficient of **${CL}**. ${liftRule}`,
        [numPart("q", "Dynamic pressure", "Dynamic pressure q (Pa)", q, 1, "Half of 1.2 times the speed squared."),
         numPart("lift", "Lift", "Lift produced (N)", L, 0, "Multiply q by the wing area and the lift coefficient.")],
        `**Dynamic pressure:** 0.5 × 1.2 × ${v}² = **${f(roundTo(q, 1))} Pa**.\n\n**Lift:** ${f(roundTo(q, 1))} × ${S} × ${CL} = **${Math.round(L)} N**.`,
        "aer-lf1", { tier, v, S, CL }, [["_v", v], ["_S", S], ["_CL", CL], ["_rho", RHO]],
        ["Square the speed before halving.", "Lift = q × S × C_L."]);
    }
    if (tier === "hard") {
      const v = rng.int(20, 95), S = rng.pick([8, 10, 12, 14, 16, 18, 20, 24, 28, 32]), CL = rng.int(4, 16) / 10;
      const q = qOf(v), L = q * S * CL;
      const ratio = wantOk ? 1.05 + rng.next() * 0.35 : 0.65 + rng.next() * 0.3;
      const m = Math.round(L / (G * ratio) / 100) * 100;
      if (m < 500 || m > 20000 || nearHalf(L, 0)) continue;
      const W = m * G, ok = L >= W;
      if (ok !== wantOk || !clear(L, W, 0.05)) continue;
      return finish(`A light aircraft of mass **${m} kg** flies level at **${v} m/s**, with a wing area of **${S} m²** and a lift coefficient of **${CL}**. ${liftRule} Level flight is possible only if the lift is at least the weight.`,
        [numPart("lift", "Lift", "Lift produced (N)", L, 0, "q = ½ρv², then lift = q × S × C_L."),
         numPart("weight", "Weight", "Weight of the aircraft (N)", W, 0, "Mass times 9.81."),
         yesNo("ok", "Level flight?", "Can the aircraft hold level flight at this speed?", ok, "Compare the lift with the weight.")],
        `**Lift:** 0.5 × 1.2 × ${v}² × ${S} × ${CL} = **${Math.round(L)} N**.\n\n**Weight:** ${m} × 9.81 = **${Math.round(W)} N**.\n\nLift is ${ok ? "at least" : "less than"} the weight: **${YN(ok)}**.`,
        "aer-lf2", { tier, v, S, CL, m }, [["_v", v], ["_S", S], ["_CL", CL], ["_mass", m], ["_rho", RHO]],
        ["Lift first, via dynamic pressure.", "Weight in newtons.", "Lift must be at least the weight."]);
    }
    if (tier === "expert") {
      const m = rng.int(8, 160) * 100, v = rng.int(30, 90), CL = rng.int(8, 20) / 10;
      const W = m * G, q = qOf(v), Sn = W / (q * CL);
      if (Sn < 6 || Sn > 90 || nearHalf(Sn, 1) || nearHalf(W, 0)) continue;
      const j = WINGS.findIndex((a) => a >= Sn);
      if (j < 0 || Sn > 0.95 * WINGS[j] || (j > 0 && Sn < 1.05 * WINGS[j - 1])) continue;
      const s = Math.max(0, Math.min(WINGS.length - 4, j - rng.int(0, 3)));
      if (j < s || j > s + 3) continue;
      const list = WINGS.slice(s, s + 4).map((a) => `${a} m²`);
      const parts = [
        numPart("weight", "Weight", "Weight of the aircraft (N)", W, 0, "Mass times 9.81."),
        numPart("q", "Dynamic pressure", "Dynamic pressure q (Pa)", q, 1, "½ × 1.2 × v²."),
        numPart("area", "Wing area needed", "Smallest wing area that gives lift equal to weight (m²)", Sn, 1, "Rearrange lift = q × S × C_L with lift = weight."),
        pickPart(rng, "wing", "Wing", "Smallest listed wing that is big enough", list, `${WINGS[j]} m²`, "Take the smallest listed area that is at least the area needed.")];
      return finish(`An aircraft of mass **${m} kg** must fly level at **${v} m/s** with a lift coefficient of **${CL}**. ${liftRule} Wings available: **${list.join(", ")}**. Choose the smallest wing whose lift at this speed is at least the weight.`,
        parts, `**Weight:** ${m} × 9.81 = **${Math.round(W)} N**.\n\n**q:** 0.5 × 1.2 × ${v}² = **${f(roundTo(q, 1))} Pa**.\n\n**Area needed:** ${Math.round(W)} ÷ (${f(roundTo(q, 1))} × ${CL}) = **${f(roundTo(Sn, 1))} m²**. The smallest listed wing at least that big is **${WINGS[j]} m²**.`,
        "aer-lf3", { tier, m, v, CL, list: WINGS.slice(s, s + 4) }, [["_mass", m], ["_v", v], ["_CL", CL], ["_rho", RHO]],
        ["Weight and q as before.", "Lift = weight means S = weight ÷ (q × C_L).", "Compare with each listed area."]);
    }
    // expert-plus: stall speed, approach speed, km/h limit
    const m = rng.int(8, 160) * 100, S = rng.pick([10, 12, 14, 16, 18, 20, 24, 28, 32, 40]), CLm = rng.int(12, 24) / 10;
    const W = m * G, vs = Math.sqrt((2 * W) / (RHO * S * CLm)), va = 1.3 * vs;
    if (vs < 20 || vs > 60 || nearHalf(W, 0) || nearHalf(vs, 1) || nearHalf(va, 1) || !same(1.3 * roundTo(vs, 1), va, 1)) continue;
    const kmh = va * 3.6;
    const lim = Math.round((kmh * (wantOk ? 1.12 : 0.88)) / 5) * 5;
    const ok = kmh <= lim;
    if (ok !== wantOk || !clear(kmh, lim, 0.04)) continue;
    const parts = [
      numPart("weight", "Weight", "Weight of the aircraft (N)", W, 0, "Mass times 9.81."),
      numPart("vs", "Stall speed", "Stall speed (m/s)", vs, 1, "At the stall, lift equals weight with C_L at its maximum: solve ½ρv²S·C_L,max = W for v."),
      numPart("vapp", "Approach speed", "Approach speed, 1.3 × stall speed (m/s)", va, 1, "Multiply the stall speed by 1.3."),
      yesNo("ok", "Within limit?", `Is the approach speed at most ${lim} km/h?`, ok, "Convert m/s to km/h by multiplying by 3.6, then compare.")];
    return finish(`An aircraft of mass **${m} kg** has a wing area of **${S} m²** and a maximum lift coefficient of **${CLm}**. ${liftRule} At the stall, lift equals weight with C_L at its maximum, so stall speed v = √(2 × weight ÷ (ρ × S × C_L,max)). The approach speed is **1.3 × the stall speed**. The airfield limits approach speed to **${lim} km/h** (1 m/s = 3.6 km/h).`,
      parts, `**Weight:** ${m} × 9.81 = **${Math.round(W)} N**.\n\n**Stall speed:** √(2 × ${Math.round(W)} ÷ (1.2 × ${S} × ${CLm})) = **${f(roundTo(vs, 1))} m/s**.\n\n**Approach:** 1.3 × ${f(roundTo(vs, 1))} = **${f(roundTo(va, 1))} m/s** = ${f(roundTo(kmh, 1))} km/h, which is ${ok ? "within" : "over"} ${lim}: **${YN(ok)}**.`,
      "aer-lf4", { tier, m, S, CLm, lim }, [["_mass", m], ["_S", S], ["_CLmax", CLm], ["_rho", RHO]],
      ["Weight in newtons.", "Rearrange lift = weight for the speed.", "Multiply by 1.3.", "Convert to km/h before comparing."]);
  }
  return tooMany();
}

// ---------- rocket-staging ----------

const rkRule = "Δv = v_e × ln(m₀ ÷ m_f), where v_e is the exhaust speed, m₀ the starting mass and m_f the mass left when the propellant is used up (ln is the natural logarithm).";

function genRocket(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const ve = rng.int(24, 45) * 100;
    if (tier === "medium" || tier === "hard") {
      const r = rng.int(150, 1000) / 100, mf = 25 * rng.int(1, 16), m0 = r * mf, dv = ve * Math.log(r);
      if (dv < 800 || dv > 12000 || nearHalf(dv, 0)) continue;
      const pR = numPart("ratio", "Mass ratio", "Mass ratio m₀ ÷ m_f", r, 2, "Divide the starting mass by the final mass.");
      const pD = numPart("dv", "Delta-v", "Delta-v (m/s)", dv, 0, "Multiply the exhaust speed by the natural log of the mass ratio.");
      const ex = `**Mass ratio:** ${f(m0)} ÷ ${mf} = **${f(r)}**.\n\n**Delta-v:** ${ve} × ln ${f(r)} = **${Math.round(dv)} m/s**.`;
      const given = [["_m0", m0], ["_mf", mf], ["_ve", ve]];
      if (tier === "medium") {
        return finish(`A made-up booster burns from a starting mass of **${f(m0)} t** down to **${mf} t**, with an exhaust speed of **${ve} m/s**. ${rkRule}`,
          [pR, pD], ex, "aer-rk1", { tier, m0, mf, ve }, given, ["Mass ratio first.", "Natural log, then times v_e."]);
      }
      const tgt = Math.round((dv * (wantOk ? 0.9 : 1.1)) / 100) * 100;
      const ok = dv >= tgt;
      if (ok !== wantOk || !clear(dv, tgt, 0.03)) continue;
      return finish(`A made-up booster burns from a starting mass of **${f(m0)} t** down to **${mf} t**, with an exhaust speed of **${ve} m/s**. ${rkRule} The mission needs a Δv of at least **${tgt} m/s**.`,
        [pR, pD, yesNo("ok", "Reaches target?", "Does the booster deliver the Δv the mission needs?", ok, "Compare the Δv with the stated minimum.")],
        `${ex}\n\n${Math.round(dv)} is ${ok ? "at least" : "below"} ${tgt}: **${YN(ok)}**.`,
        "aer-rk2", { tier, m0, mf, ve, tgt }, [...given, ["_target", tgt]], ["Ratio and Δv as before.", "Compare with the target."]);
    }
    if (tier === "expert") {
      const dvT = rng.int(15, 95) * 100, mf = 5 * rng.int(1, 20), ratio = Math.exp(dvT / ve);
      if (ratio < 1.5 || ratio > 12) continue;
      const m0 = mf * ratio, prop = m0 - mf, rR = roundTo(ratio, 2);
      if (nearHalf(ratio, 2) || nearHalf(m0, 1) || nearHalf(prop, 1)) continue;
      if (!same(m0, mf * rR, 1) || !same(prop, (rR - 1) * mf, 1) || !same(prop, roundTo(m0, 1) - mf, 1)) continue;
      const tank = Math.ceil((prop * (wantOk ? 1.12 : 0.85)) / 5) * 5, ok = tank >= prop;
      if (ok !== wantOk || !clear(tank, prop, 0.04)) continue;
      const parts = [
        numPart("ratio", "Mass ratio", "Mass ratio m₀ ÷ m_f needed", ratio, 2, "Undo the logarithm: the ratio is e raised to (Δv ÷ v_e)."),
        numPart("m0", "Starting mass", "Starting mass m₀ (t)", m0, 1, "Multiply the final mass by the mass ratio."),
        numPart("prop", "Propellant", "Propellant mass (t)", prop, 1, "Starting mass minus final mass."),
        yesNo("ok", "Tank big enough?", `Can a tank that holds ${tank} t of propellant do the job?`, ok, "Compare the tank with the propellant needed.")];
      return finish(`A stage must deliver a Δv of **${dvT} m/s** with an exhaust speed of **${ve} m/s**. Its final mass (structure plus payload) is **${mf} t**. ${rkRule} Working backwards, the mass ratio is e^(Δv ÷ v_e). Its propellant tank holds **${tank} t**.`,
        parts, `**Mass ratio:** e^(${dvT} ÷ ${ve}) = **${f(rR)}**.\n\n**Starting mass:** ${mf} × ${f(rR)} = **${f(roundTo(m0, 1))} t**.\n\n**Propellant:** ${f(roundTo(m0, 1))} − ${mf} = **${f(roundTo(prop, 1))} t**. The tank holds ${tank} t, which is ${ok ? "enough" : "not enough"}: **${YN(ok)}**.`,
        "aer-rk3", { tier, dvT, mf, ve, tank }, [["_dv", dvT], ["_ve", ve], ["_mf", mf], ["_tank", tank]],
        ["Undo the ln with the exponential.", "Final mass times the ratio.", "Starting mass minus final mass.", "Compare with the tank."]);
    }
    // expert-plus: two stages
    const ve1 = rng.int(26, 34) * 100, ve2 = rng.int(33, 45) * 100;
    const M0 = 50 * rng.int(4, 16), p1 = 10 * Math.round((M0 * (0.55 + rng.next() * 0.2)) / 10), d1 = 5 * Math.round((M0 * (0.06 + rng.next() * 0.04)) / 5);
    const M1 = M0 - p1 - d1, p2 = 5 * Math.round((M1 * (0.55 + rng.next() * 0.2)) / 5);
    if (M1 <= 0 || M1 - p2 < 5 || M0 - p1 < 10) continue;
    const dv1 = ve1 * Math.log(M0 / (M0 - p1)), dv2 = ve2 * Math.log(M1 / (M1 - p2)), tot = dv1 + dv2;
    if (nearHalf(dv1, 0) || nearHalf(dv2, 0) || nearHalf(tot, 0) || roundTo(tot, 0) !== roundTo(dv1, 0) + roundTo(dv2, 0)) continue;
    const tgt = Math.round((tot * (wantOk ? 0.92 : 1.08)) / 100) * 100, ok = tot >= tgt;
    if (ok !== wantOk || !clear(tot, tgt, 0.03)) continue;
    const parts = [
      numPart("dv1", "Stage 1 delta-v", "Δv from stage 1 (m/s)", dv1, 0, "Stage 1 starts at the full stack mass and ends with the mass left after its propellant is burned (its structure is still attached)."),
      numPart("dv2", "Stage 2 delta-v", "Δv from stage 2 (m/s)", dv2, 0, "Stage 2 starts after stage 1's structure is dropped, and burns its own propellant."),
      numPart("total", "Total delta-v", "Total Δv (m/s)", tot, 0, "Add the two stages."),
      yesNo("ok", "Reaches target?", "Does the two-stage rocket reach the Δv the mission needs?", ok, "Compare the total with the target.")];
    return finish(`A two-stage rocket starts at **${M0} t**. Stage 1 (exhaust speed **${ve1} m/s**) burns **${p1} t** of propellant, then its empty structure of **${d1} t** is dropped. Stage 2 (exhaust speed **${ve2} m/s**) carries the payload and burns **${p2} t** of propellant. ${rkRule} Apply it to each stage separately and add the two Δv values. The mission needs a total Δv of at least **${tgt} m/s**.`,
      parts, `**Stage 1:** ${ve1} × ln (${M0} ÷ ${M0 - p1}) = **${Math.round(dv1)} m/s**.\n\n**After dropping the structure:** ${M0} − ${p1} − ${d1} = ${M1} t.\n\n**Stage 2:** ${ve2} × ln (${M1} ÷ ${M1 - p2}) = **${Math.round(dv2)} m/s**.\n\n**Total:** **${Math.round(tot)} m/s**, which is ${ok ? "at least" : "below"} ${tgt}: **${YN(ok)}**.`,
      "aer-rk4", { tier, ve1, ve2, M0, p1, d1, p2, tgt }, [["_M0", M0], ["_p1", p1], ["_d1", d1], ["_p2", p2], ["_ve1", ve1], ["_ve2", ve2]],
      ["Stage 1: full mass over the mass after burning.", "Drop the empty structure before stage 2.", "Add the two.", "Compare with the target."]);
  }
  return tooMany();
}

// ---------- mass-balance ----------

const mbRule = "Moment = mass × arm (arm = distance from the datum, in m). Centre of gravity (CG) = total moment ÷ total mass, measured from the datum.";

function drawLoad(rng) {
  return {
    empty: ["Empty aircraft", rng.int(70, 95) * 10, r2(rng.int(225, 265) / 100)],
    crew: ["Pilot and front passenger", rng.int(14, 19) * 10, r2(rng.int(195, 225) / 100)],
    rear: ["Rear passengers", rng.int(6, 16) * 10, r2(rng.int(295, 320) / 100)],
    fuel: ["Fuel", rng.int(10, 22) * 10, r2(rng.int(180, 330) / 100)],
    bag: ["Baggage", rng.int(2, 10) * 10, r2(rng.int(360, 405) / 100)],
  };
}
const sumM = (rows) => rows.reduce((s, r) => s + r[1], 0);
const sumMom = (rows) => roundTo(rows.reduce((s, r) => s + r[1] * r[2], 0), 2);

function makeLimits(rng, cgs, M, wantOk) {
  const lo = Math.min(...cgs), hi = Math.max(...cgs), dl = () => rng.int(4, 20) / 100;
  let fwd, aft, maxM = M + rng.int(2, 15) * 10;
  if (wantOk) { fwd = r2(lo - dl()); aft = r2(hi + dl()); }
  else {
    const kind = rng.pick(["aft", "fwd", "mass"]);
    if (kind === "aft") { aft = r2(hi - rng.int(3, 10) / 100); fwd = r2(Math.min(lo, aft) - dl()); }
    else if (kind === "fwd") { fwd = r2(lo + rng.int(3, 10) / 100); aft = r2(Math.max(hi, fwd) + dl()); }
    else { fwd = r2(lo - dl()); aft = r2(hi + dl()); maxM = M - rng.int(1, 8) * 10; }
  }
  const okCg = cgs.every((c) => c >= fwd && c <= aft), ok = okCg && M <= maxM;
  const fine = cgs.every((c) => Math.abs(c - fwd) >= 0.025 && Math.abs(c - aft) >= 0.025) && Math.abs(M - maxM) >= 10 && fwd < aft;
  return { fwd, aft, maxM, ok, fine };
}
const limText = (L) => `maximum mass **${L.maxM} kg**, CG between **${L.fwd.toFixed(2)} m** (forward limit) and **${L.aft.toFixed(2)} m** (aft limit)`;

function genBalance(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const L = drawLoad(rng);
    if (tier === "medium" || tier === "hard") {
      const rows = tier === "medium" ? [L.empty, L.crew, L.fuel, L.bag] : [L.empty, L.crew, L.rear, L.fuel, L.bag];
      const M = sumM(rows), mom = sumMom(rows), cg = mom / M;
      if (nearHalf(cg, 2)) continue;
      const pM = numPart("mass", "Total mass", "Total mass (kg)", M, 0, "Add the masses in the table.");
      const pC = numPart("cg", "Centre of gravity", "Centre of gravity (m from the datum)", cg, 2, "Multiply each mass by its arm, add the moments, then divide by the total mass.");
      const ex = `**Total mass:** ${rows.map((r) => r[1]).join(" + ")} = **${M} kg**.\n\n**Total moment:** ${rows.map((r) => `${r[1]} × ${r[2].toFixed(2)}`).join(" + ")} = ${f(mom)} kg·m.\n\n**CG:** ${f(mom)} ÷ ${M} = **${f(roundTo(cg, 2))} m**.`;
      const given = rows.map((r, k) => [`_m${k + 1}`, r[1]]).concat(rows.length <= 4 ? rows.map((r, k) => [`_a${k + 1}`, r[2]]) : []);
      if (tier === "medium") {
        return finish(`A light aircraft is loaded as follows. ${mbRule}\n\n${table(rows)}`,
          [pM, pC], ex, "aer-mb1", { tier, rows }, given, ["Total mass first.", "Moment of each row, then the sum."]);
      }
      const lim = makeLimits(rng, [cg], M, wantOk);
      if (!lim.fine || lim.ok !== wantOk) continue;
      return finish(`A light aircraft is loaded as follows. ${mbRule} The aircraft must be within all its limits: ${limText(lim)}.\n\n${table(rows)}`,
        [pM, pC, yesNo("ok", "Within limits?", "Is the loaded aircraft within its mass limit and between both CG limits?", lim.ok, "Check the mass against the maximum, and the CG against both limits.")],
        `${ex}\n\nMass ${M} vs ${lim.maxM} kg, CG ${f(roundTo(cg, 2))} vs ${lim.fwd.toFixed(2)} to ${lim.aft.toFixed(2)} m: **${YN(lim.ok)}**.`,
        "aer-mb2", { tier, rows, lim }, [["_M", M], ["_maxM", lim.maxM], ["_fwd", lim.fwd], ["_aft", lim.aft]],
        ["Mass and CG as before.", "All three conditions must hold."]);
    }
    if (tier === "expert") {
      const rows = [L.empty, L.crew, L.rear, L.fuel, L.bag];
      const F = rng.int(4, Math.floor(L.fuel[1] / 10) - 2) * 10;
      const M = sumM(rows), mom = sumMom(rows), cg0 = mom / M, M1 = M - F, mom1 = roundTo(mom - F * L.fuel[2], 2), cg1 = mom1 / M1;
      if (nearHalf(cg0, 2) || nearHalf(cg1, 2) || Math.abs(cg1 - cg0) < 0.03) continue;
      const lim = makeLimits(rng, [cg0, cg1], M, wantOk);
      if (!lim.fine || lim.ok !== wantOk) continue;
      const parts = [
        numPart("mass", "Take-off mass", "Total mass at take-off (kg)", M, 0, "Add the masses in the table."),
        numPart("cg", "CG at take-off", "CG at take-off (m)", cg0, 2, "Total moment divided by total mass."),
        numPart("cgland", "CG at landing", "CG after the fuel is burned (m)", cg1, 2, "Remove the burned fuel's mass and its moment, then divide again."),
        yesNo("ok", "Within limits?", "Is the aircraft within its mass limit at take-off and between the CG limits at both take-off and landing?", lim.ok, "Check take-off mass, then the CG at both ends of the flight.")];
      return finish(`A light aircraft is loaded as follows, then burns **${F} kg** of the fuel in flight. ${mbRule} Limits: ${limText(lim)}. The CG must be within the limits both at take-off and at landing, and the mass is limited at take-off only.\n\n${table(rows)}`,
        parts, `**Take-off:** ${M} kg, moment ${f(mom)} kg·m, CG = **${f(roundTo(cg0, 2))} m**.\n\n**Landing:** mass ${M} − ${F} = ${M1} kg, moment ${f(mom)} − ${F} × ${L.fuel[2].toFixed(2)} = ${f(mom1)} kg·m, CG = **${f(roundTo(cg1, 2))} m**.\n\nAgainst the limits: **${YN(lim.ok)}**.`,
        "aer-mb3", { tier, rows, F, lim }, [["_M", M], ["_burn", F], ["_fuelarm", L.fuel[2]], ["_maxM", lim.maxM], ["_fwd", lim.fwd], ["_aft", lim.aft]],
        ["Total mass and moment.", "Take-off CG.", "Remove the burned fuel's mass and moment.", "Check both CG values against both limits."]);
    }
    // expert-plus: out of limits, move baggage between holds
    const front = rng.int(2, 9) * 10, rear = rng.int(2, 9) * 10;
    const aF = r2(rng.int(80, 120) / 100), aR = r2(rng.int(360, 420) / 100);
    const rows = [L.empty, L.crew, L.fuel, ["Front baggage hold", front, aF], ["Rear baggage hold", rear, aR]];
    const M = sumM(rows), mom = sumMom(rows), cg = mom / M;
    if (nearHalf(cg, 2)) continue;
    const fwdOut = rng.next() < 0.5, gap = rng.int(4, 12) / 100;
    let fwd, aft, src, dst;
    if (fwdOut) { fwd = r2(cg + gap); aft = r2(fwd + rng.int(25, 40) / 100); src = rows[3]; dst = rows[4]; }
    else { aft = r2(cg - gap); fwd = r2(aft - rng.int(25, 40) / 100); src = rows[4]; dst = rows[3]; }
    const limit = fwdOut ? fwd : aft, exact = (limit * M - mom) / (dst[2] - src[2]);
    const frac = exact - Math.floor(exact);
    if (exact < 3 || frac < 0.08 || frac > 0.92) continue;
    const x = Math.ceil(exact);
    if (x > src[1] || x < 5) continue;
    const cap = Math.round(x * (wantOk ? 1.25 : 0.7)), ok = x <= cap;
    if (ok !== wantOk || !clear(cap, x, 0.04) || Math.abs(cap - x) < 2) continue;
    const newCg = (mom + x * (dst[2] - src[2])) / M;
    if (newCg < fwd || newCg > aft) continue;
    const parts = [
      numPart("mass", "Total mass", "Total mass (kg)", M, 0, "Add the masses in the table."),
      numPart("cg", "Centre of gravity", "CG as loaded (m)", cg, 2, "Total moment divided by total mass."),
      numPart("move", "Mass to move", `Smallest whole number of kg to move from the ${src[0].toLowerCase()} to the ${dst[0].toLowerCase()} to bring the CG back inside the limits`, x, 0, "Moving x kg changes the total moment by x × (arm of destination − arm of source). Find x that puts the CG exactly on the nearest limit, then round up to a whole kg."),
      yesNo("ok", "Fits?", `The ${dst[0].toLowerCase()} has room for **${cap} kg** more. Can that mass be moved there?`, ok, "Compare the mass to move with the room available.")];
    const text = `A light aircraft is loaded as follows and is **outside** its CG limits. ${mbRule} CG limits: **${fwd.toFixed(2)} m** (forward) to **${aft.toFixed(2)} m** (aft). Baggage can be moved between the two holds (the total mass does not change). Moving x kg from the ${src[0].toLowerCase()} to the ${dst[0].toLowerCase()} changes the total moment by x × (${dst[0].toLowerCase()} arm − ${src[0].toLowerCase()} arm).\n\n${table(rows)}`;
    return finish(text,
      parts, `**Total mass:** **${M} kg**; total moment ${f(mom)} kg·m; **CG:** ${f(roundTo(cg, 2))} m, outside the limits (${fwdOut ? "too far forward" : "too far aft"}).\n\n**Move x:** (${f(limit)} × ${M} − ${f(mom)}) ÷ (${dst[2].toFixed(2)} − ${src[2].toFixed(2)}) = ${f(roundTo(exact, 3))} kg, so **${x} kg**.\n\n**Room:** ${x} kg against ${cap} kg: **${YN(ok)}**.`,
      "aer-mb4", { tier, rows, fwd, aft, srcI: fwdOut ? 3 : 4, dstI: fwdOut ? 4 : 3, cap }, [["_M", M], ["_fwd", fwd], ["_aft", aft], ["_cap", cap], ["_aS", src[2]], ["_aD", dst[2]]],
      ["Total mass and CG as before.", "Which limit is broken, and which way must the CG move?", "Set the new CG equal to that limit and solve for x.", "Compare with the room available."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "lift-off") return genLift(rng, difficulty);
  if (subtopic === "lift-stall") return genLiftEq(rng, difficulty);
  if (subtopic === "rocket-staging") return genRocket(rng, difficulty);
  if (subtopic === "mass-balance") return genBalance(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (thrust-to-weight through newtons and
// acceleration, lift by trying wing sizes, stall speed by bisection on the lift equation, mass ratio by an
// inverse log route, stage Δv by summing log ratios with log10, CG by summing mass-weighted arms, the baggage
// move by trying whole-kg moves one at a time). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const ln10 = Math.LN10;
const lnVia10 = (x) => Math.log10(x) * ln10;
const cgOf = (rows) => rows.reduce((s, r) => s + r[1] * r[2], 0) / rows.reduce((s, r) => s + r[1], 0);

const ALT = {
  "aer-lo1": (p) => ({ weight: (p.m * G) / 1000, twr: (p.T * 1000) / (p.m * G) }),
  "aer-lo2": (p) => ({ weight: (p.m * G) / 1000, twr: (p.T * 1000) / (p.m * G), lift: YN(p.T * 1000 - p.m * G > 0) }),
  "aer-lo3": (p) => {
    const m = p.d + p.p + p.l;
    return { mass: m, weight: (m * G) / 1000, twr: (p.T * 1000) / (m * G), ok: YN(p.T * 1000 >= 1.2 * m * G - 1e-9) };
  },
  "aer-lo4": (p) => {
    const mt = p.m0 - p.mdot * p.t, a0 = (p.T * 1000 - p.m0 * G) / p.m0, at = (p.T * 1000 - mt * G) / mt;
    return { a0, mass: mt, at, ok: YN(at / a0 >= 2 - 1e-9) };
  },
  "aer-lf1": (p) => { const q = (RHO * p.v * p.v) / 2; return { q, lift: q * p.S * p.CL }; },
  "aer-lf2": (p) => {
    const L = ((RHO * p.v * p.v) / 2) * p.S * p.CL, W = p.m * G;
    return { lift: L, weight: W, ok: YN(L - W >= 0) };
  },
  "aer-lf3": (p) => {
    const W = p.m * G, q = (RHO * p.v * p.v) / 2, a = p.list.find((s) => q * s * p.CL >= W - 1e-9);
    return { weight: W, q, area: W / q / p.CL, wing: `${a} m²` };
  },
  "aer-lf4": (p) => {
    const W = p.m * G; let lo = 1, hi = 300;
    for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (0.5 * RHO * mid * mid * p.S * p.CLm < W) lo = mid; else hi = mid; }
    const vs = (lo + hi) / 2;
    return { weight: W, vs, vapp: vs * 1.3, ok: YN(vs * 1.3 * 3.6 <= p.lim + 1e-9) };
  },
  "aer-rk1": (p) => ({ ratio: p.m0 / p.mf, dv: p.ve * lnVia10(p.m0 / p.mf) }),
  "aer-rk2": (p) => { const dv = p.ve * lnVia10(p.m0 / p.mf); return { ratio: p.m0 / p.mf, dv, ok: YN(dv >= p.tgt) }; },
  "aer-rk3": (p) => {
    const ratio = 10 ** (p.dvT / (p.ve * ln10)), m0 = p.mf * ratio;
    return { ratio, m0, prop: m0 - p.mf, ok: YN(p.tank >= m0 - p.mf) };
  },
  "aer-rk4": (p) => {
    const M1 = p.M0 - p.p1 - p.d1;
    const a = p.ve1 * lnVia10(p.M0 / (p.M0 - p.p1)), b = p.ve2 * lnVia10(M1 / (M1 - p.p2));
    return { dv1: a, dv2: b, total: a + b, ok: YN(a + b >= p.tgt) };
  },
  "aer-mb1": (p) => ({ mass: p.rows.reduce((s, r) => s + r[1], 0), cg: cgOf(p.rows) }),
  "aer-mb2": (p) => {
    const M = p.rows.reduce((s, r) => s + r[1], 0), c = cgOf(p.rows);
    return { mass: M, cg: c, ok: YN(M <= p.lim.maxM && c >= p.lim.fwd && c <= p.lim.aft) };
  },
  "aer-mb3": (p) => {
    const M = p.rows.reduce((s, r) => s + r[1], 0), c0 = cgOf(p.rows);
    const after = p.rows.map((r) => (r[0] === "Fuel" ? [r[0], r[1] - p.F, r[2]] : r));
    const c1 = cgOf(after), inside = (c) => c >= p.lim.fwd && c <= p.lim.aft;
    return { mass: M, cg: c0, cgland: c1, ok: YN(M <= p.lim.maxM && inside(c0) && inside(c1)) };
  },
  "aer-mb4": (p) => {
    const M = p.rows.reduce((s, r) => s + r[1], 0), c = cgOf(p.rows);
    let x = 0;
    for (; x < 400; x++) {
      const rows = p.rows.map((r, k) => (k === p.srcI ? [r[0], r[1] - x, r[2]] : k === p.dstI ? [r[0], r[1] + x, r[2]] : r));
      const cc = cgOf(rows);
      if (cc >= p.fwd && cc <= p.aft) break;
    }
    return { mass: M, cg: c, move: x, ok: YN(x <= p.cap) };
  },
};

const dpOf = (part) => (part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2)));

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
      const dp = dpOf(part);
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
