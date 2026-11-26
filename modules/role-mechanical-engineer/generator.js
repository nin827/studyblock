// Mechanical Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is stable (working from an earlier rounded answer gives the same result), no answer
// sits on a rounding half-step, and decision parts (Yes/No, catalogue picks) are decided first, then fitted
// with a clear margin. Textbook practice on made-up figures: g, pi, 9550, yield and shear rules are stated
// in each prompt. No design code.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   drive-train          ratio -> output speed -> output torque; expert picks a motor from a list;
//                        expert-plus adds per-stage efficiency and a speed/torque verdict
//   bolt-shaft           force per bolt -> stress -> factor of safety; expert picks the smallest bolt;
//                        expert-plus checks a solid shaft in torsion and picks the smallest diameter
//   fit-stackup          limits -> max/min clearance -> fit type; expert stacks four dimensions (worst case);
//                        expert-plus compares worst case with root-sum-square
//   hydraulic-cylinder   area -> pressure -> speed; expert sizes the motor; expert-plus is a differential cylinder

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
const dpWord = (dp) => (dp === 0 ? ", to the nearest whole number" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 40000;
const tooMany = () => { throw new Error("role-mechanical-engineer: no suitable draw"); };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const mn = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n)); // signed number with a true minus
const sgn = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const same = (a, b, dp) => roundTo(a, dp) === roundTo(b, dp);
const clear = (x, thr, rel) => Math.abs(x - thr) >= rel * Math.abs(thr);

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

const MOTORS = [0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30];
const kw = (k) => `${k} kW`;

// ---------- drive-train ----------

const NS = [750, 1000, 1450, 1500, 2900, 3000];
const ETAS = [80, 85, 90, 95];
const TQ = "Motor torque (N·m) = 9550 × power (kW) ÷ speed (rpm)";

function drawGears(rng) {
  for (let i = 0; i < TRY; i++) {
    const a1 = rng.pick([12, 15, 16, 18, 20, 24, 25]), b1 = rng.pick([30, 36, 40, 45, 48, 50, 54, 60, 64, 72, 75, 80]);
    const a2 = rng.pick([12, 15, 16, 18, 20, 24, 25]), b2 = rng.pick([30, 36, 40, 45, 48, 50, 54, 60, 64, 72, 75, 80]);
    if (b1 / a1 < 1.5 || b2 / a2 < 1.5) continue;
    const R = (b1 * b2) / (a1 * a2);
    if (R < 3 || R > 45 || !isEx(R, 2)) continue;
    return { a1, b1, a2, b2, R };
  }
  return tooMany();
}
const gearText = (g) => `stage 1 has a driver gear of **${g.a1} teeth** meshing with a driven gear of **${g.b1} teeth**, and stage 2 has a driver of **${g.a2} teeth** meshing with a driven gear of **${g.b2} teeth**`;
const gearRule = "Ratio of a stage = driven teeth ÷ driver teeth, and the overall ratio is the product of the stages. Output speed = motor speed ÷ overall ratio.";

function genDrive(rng, tier) {
  const wantOk = rng.next() < 0.5, failSpeed = rng.next() < 0.5, targetK = rng.int(0, 3);
  for (let i = 0; i < TRY; i++) {
    const g = drawGears(rng), n = rng.pick(NS), R = g.R, N = n / R;
    if (N < 15 || nearHalf(N, 1)) continue;
    const given = [["_n", n]];
    const exR = `**Ratio:** (${g.b1} ÷ ${g.a1}) × (${g.b2} ÷ ${g.a2}) = **${f(R)}**.\n\n**Output speed:** ${n} ÷ ${f(R)} = **${f(roundTo(N, 1))} rpm**.`;
    const pR = numPart("ratio", "Overall ratio", "Overall gear ratio", R, 2, "Work out each stage as driven teeth over driver teeth, then multiply the two stages.");
    const pN = numPart("speed", "Output speed", "Output shaft speed (rpm)", N, 1, "Divide the motor speed by the overall ratio.");
    if (tier === "medium") {
      return finish(`A two-stage gearbox: ${gearText(g)}. The motor shaft turns at **${n} rpm**. ${gearRule}`,
        [pR, pN], exR, "mch-dt1", { tier, n, ...g }, [...given, ["_z1", g.a1], ["_z2", g.b1], ["_z3", g.a2], ["_z4", g.b2]],
        ["Ratio of each stage first, then the product.", "The output turns slower than the motor by the ratio."]);
    }
    const P = rng.pick(MOTORS.slice(0, 10)), eta = rng.pick(ETAS);
    const Tm = (9550 * P) / n, Tout = (Tm * R * eta) / 100;
    if (Tout < 10 || nearHalf(Tout, 0)) continue;
    if (tier === "hard") {
      const pT = numPart("torque", "Output torque", "Torque at the output shaft (N·m)", Tout, 0, "Find the motor torque from the stated formula, multiply by the overall ratio, then by the efficiency as a fraction.");
      return finish(`A two-stage gearbox: ${gearText(g)}. The motor delivers **${P} kW** at **${n} rpm**. ${gearRule} ${TQ}. The gearbox is **${eta}%** efficient overall: output torque = motor torque × overall ratio × efficiency.`,
        [pR, pN, pT], `${exR}\n\n**Motor torque:** 9550 × ${P} ÷ ${n} = ${f(roundTo(Tm, 3))} N·m.\n\n**Output torque:** ${f(roundTo(Tm, 3))} × ${f(R)} × ${eta / 100} = **${Math.round(Tout)} N·m**.`,
        "mch-dt2", { tier, n, P, eta, ...g }, [...given, ["_P", P], ["_eff", eta], ["_ratio", R]],
        ["Ratio and speed as before.", "Motor torque, then ratio, then efficiency."]);
    }
    if (tier === "expert") {
      const s = rng.int(0, MOTORS.length - 4), list = MOTORS.slice(s, s + 4);
      const rated = list.map((k) => (9550 * k) / n);
      const lo = targetK === 0 ? 0.4 * rated[0] : 1.05 * rated[targetK - 1], hi = 0.95 * rated[targetK];
      if (lo >= hi) continue;
      const lo2 = Math.ceil(lo * R * (eta / 100)), hi2 = Math.floor(hi * R * (eta / 100));
      if (lo2 < 5 || hi2 < lo2) continue;
      const TL = rng.int(lo2, hi2), need = TL / (R * (eta / 100));
      if (nearHalf(need, 1)) continue;
      const k = list.findIndex((m, j) => rated[j] >= need);
      if (k !== targetK) continue;
      const parts = [pR, pN,
        numPart("need", "Motor-shaft torque", "Torque needed at the motor shaft (N·m)", need, 1, "Work backwards: the output torque equals motor torque × ratio × efficiency, so divide the load torque by both."),
        pickPart(rng, "motor", "Motor", "Smallest listed motor that gives that torque", list.map(kw), kw(list[k]), "Rated torque of a listed motor = 9550 × kW ÷ speed. Take the smallest that is at least the torque needed.")];
      return finish(`A conveyor drive needs **${TL} N·m** at the output of a two-stage gearbox: ${gearText(g)}. The motor runs at **${n} rpm**. ${gearRule} The gearbox is **${eta}%** efficient overall, so output torque = motor torque × overall ratio × efficiency. ${TQ}. Motors available, all rated at ${n} rpm: **${list.map(kw).join(", ")}**. Choose the smallest whose rated torque is at least the torque needed at the motor shaft.`,
        parts, `${exR}\n\n**Needed at the motor shaft:** ${TL} ÷ (${f(R)} × ${eta / 100}) = **${f(roundTo(need, 1))} N·m**.\n\n**Rated torques:** ${list.map((m, j) => `${kw(m)}: ${f(roundTo(rated[j], 2))} N·m`).join("; ")}. The smallest that reaches ${f(roundTo(need, 1))} is **${kw(list[k])}**.`,
        "mch-dt3", { tier, n, eta, TL, list, ...g }, [...given, ["_TL", TL], ["_eff", eta], ["_ratio", R]],
        ["Ratio and speed as before.", "Divide the load torque by the ratio and the efficiency, then compare with the listed motors' rated torques."]);
    }
    // expert-plus: two stages each with its own efficiency, then a verdict on speed band and torque
    const es = rng.pick([90, 92, 94, 95, 96, 98]), etaT = (es * es) / 10000;
    const To = Tm * R * etaT;
    if (To < 10 || nearHalf(To, 0)) continue;
    const speedOk = wantOk || !failSpeed, torqueOk = wantOk || failSpeed;
    let lo, hi, TL;
    if (speedOk) { lo = Math.round(N * (1 - rng.pick([0.05, 0.08, 0.1, 0.15]))); hi = Math.round(N * (1 + rng.pick([0.05, 0.08, 0.1, 0.15]))); }
    else if (rng.next() < 0.5) { lo = Math.round(N * rng.pick([1.08, 1.12, 1.18])); hi = Math.round(lo * 1.15); }
    else { hi = Math.round(N * rng.pick([0.92, 0.88, 0.82])); lo = Math.round(hi * 0.85); }
    TL = Math.round(To * (torqueOk ? rng.pick([0.8, 0.85, 0.9]) : rng.pick([1.08, 1.12, 1.2])));
    const okS = N >= lo && N <= hi, okT = To >= TL;
    if (okS !== speedOk || okT !== torqueOk) continue;
    if (!clear(N, lo, 0.04) || !clear(N, hi, 0.04) || !clear(To, TL, 0.04) || lo >= hi) continue;
    const ok = okS && okT;
    const parts = [pR, pN,
      numPart("torque", "Output torque", "Torque at the output shaft (N·m)", To, 0, "Each stage loses the same share, so the overall efficiency is the stage efficiency multiplied by itself."),
      yesNo("ok", "Meets the spec?", "Is the output speed inside the band and the output torque at least the load torque (both must hold)?", ok, "Check the speed against both ends of the band, and the torque against the load, separately.")];
    return finish(`A drive for a mixer must run between **${lo} and ${hi} rpm** and deliver at least **${TL} N·m** at the output. Gearbox: ${gearText(g)}, driven by a **${P} kW** motor at **${n} rpm**. ${gearRule} ${TQ}. Each of the two stages is **${es}%** efficient, so the overall efficiency is the two stage efficiencies multiplied. Output torque = motor torque × overall ratio × overall efficiency.`,
      parts, `${exR}\n\n**Overall efficiency:** ${es / 100} × ${es / 100} = ${f(roundTo(etaT, 4))}.\n\n**Output torque:** 9550 × ${P} ÷ ${n} × ${f(R)} × ${f(roundTo(etaT, 4))} = **${Math.round(To)} N·m**.\n\n**Check:** speed ${f(roundTo(N, 1))} rpm is ${okS ? "inside" : "outside"} ${lo} to ${hi}; torque ${Math.round(To)} is ${okT ? "at least" : "below"} ${TL}. Both hold? **${YN(ok)}**.`,
      "mch-dt4", { tier, n, P, es, TL, lo, hi, ...g }, [...given, ["_P", P], ["_effs", es], ["_TL", TL], ["_low", lo], ["_high", hi]],
      ["Ratio and output speed as before.", "Overall efficiency, then torque.", "Both conditions must hold."]);
  }
  return tooMany();
}

// ---------- bolt-shaft ----------

const BOLTS = [["M8", 36.6], ["M10", 58], ["M12", 84.3], ["M16", 157], ["M20", 245], ["M24", 353]];
const GRADES = [["4.6", 240], ["8.8", 640], ["10.9", 940]];
const boltTable = BOLTS.map(([s, a]) => `${s} ${a} mm²`).join(", ");
const DIAS = [20, 25, 30, 35, 40, 45, 50, 55, 60];
const PI = 3.14;
const boltRule = `Stress (N/mm², the same as MPa) = force (N) ÷ area (mm²), and the load is shared equally by the bolts. Factor of safety = yield strength ÷ stress. Tensile stress areas: ${boltTable}. 1 kN = 1000 N.`;
const shaftRule = "Torque (N·m) = 9550 × power (kW) ÷ speed (rpm). Shear stress in a solid round shaft τ = 16 × T ÷ (π × d³), with T in N·mm, d in mm and π = 3.14. Shear yield strength = 0.6 × tensile yield strength.";

function genBolt(rng, tier) {
  const targetK = rng.int(0, 3);
  for (let i = 0; i < TRY; i++) {
    if (tier === "expert-plus") {
      const P = rng.pick([1.5, 3, 5.5, 7.5, 11, 15, 22, 30, 45, 55, 75, 110]), n = rng.pick([500, 750, 1000, 1450, 1500]);
      const y = rng.pick([250, 350, 450]), r = rng.pick([2, 2.5, 3, 4]);
      const s = rng.int(0, DIAS.length - 4), list = DIAS.slice(s, s + 4), d = rng.pick(list);
      const T = (9550 * P) / n;
      if (T < 3 || nearHalf(T, 1)) continue;
      const dReq = Math.cbrt((16 * T * 1000 * r) / (PI * 0.6 * y));
      const lo = targetK === 0 ? 0.6 * list[0] : 1.03 * list[targetK - 1], hi = 0.97 * list[targetK];
      if (!(dReq > lo && dReq < hi)) continue;
      const tau = (16 * T * 1000) / (PI * d ** 3), FoS = (0.6 * y) / tau;
      if (nearHalf(tau, 1) || nearHalf(FoS, 1) || FoS < 0.4 || FoS > 15) continue;
      const Tr = roundTo(T, 1), tauR = (16 * Tr * 1000) / (PI * d ** 3);
      if (!same(tauR, tau, 1) || !same((0.6 * y) / roundTo(tauR, 1), FoS, 1)) continue;
      const parts = [
        numPart("torque", "Shaft torque", "Torque carried by the shaft (N·m)", T, 1, "Use the stated torque formula with the power and the speed."),
        numPart("tau", "Shear stress", `Shear stress in the ${d} mm shaft (N/mm²)`, tau, 1, "Torque in N·mm first (multiply by 1000), then 16 × torque over π × diameter cubed."),
        numPart("fos", "Factor of safety", `Factor of safety of the ${d} mm shaft against shear yield`, FoS, 1, "Shear yield strength is 0.6 of the tensile yield. Divide it by the shear stress."),
        pickPart(rng, "dia", "Diameter", `Smallest listed diameter that gives a factor of safety of at least ${f(r)}`, list.map((x) => `${x} mm`), `${list[targetK]} mm`, "The factor of safety rises quickly with diameter, because d is cubed. Work out what the stress would have to be at the required factor of safety, then which diameter gives it.")];
      const fosL = list.map((x) => (0.6 * y) / ((16 * T * 1000) / (PI * x ** 3)));
      return finish(`A solid round steel shaft transmits **${P} kW** at **${n} rpm**. The steel has a tensile yield strength of **${y} N/mm²**. ${shaftRule} The ${d} mm shaft is the one in service. The design needs a factor of safety of at least **${f(r)}** against shear yield. Standard diameters available: **${list.map((x) => `${x} mm`).join(", ")}**.`,
        parts, `**Torque:** 9550 × ${P} ÷ ${n} = **${f(roundTo(T, 1))} N·m**.\n\n**Shear stress:** 16 × ${f(roundTo(T * 1000, 0))} ÷ (3.14 × ${d}³) = **${f(roundTo(tau, 1))} N/mm²**.\n\n**Factor of safety:** 0.6 × ${y} ÷ ${f(roundTo(tau, 1))} = **${f(roundTo(FoS, 1))}**.\n\n**Diameters:** ${list.map((x, j) => `${x} mm gives ${f(roundTo(fosL[j], 2))}`).join("; ")}. The smallest that reaches ${f(r)} is **${list[targetK]} mm**.`,
        "mch-bs4", { tier, P, n, y, r, d, list }, [["_P", P], ["_n", n], ["_yield", y], ["_d", d], ["_FoS", r]],
        ["Torque from power and speed.", "Shear stress from torque and diameter.", "Shear yield over stress.", "Try the listed diameters from the smallest up."]);
    }
    const N = rng.pick([2, 3, 4, 5, 6, 8]), grade = rng.pick(GRADES);
    const y = grade[1];
    if (tier === "expert") {
      const r = rng.pick([2, 2.5, 3, 4]), s = rng.int(0, BOLTS.length - 4), list = BOLTS.slice(s, s + 4);
      const lo = targetK === 0 ? 0.45 * list[0][1] : 1.04 * list[targetK - 1][1], hi = 0.96 * list[targetK][1];
      const fLo = (lo * y) / (1000 * r), fHi = (hi * y) / (1000 * r);
      const Fmin = Math.ceil(fLo * N), Fmax = Math.floor(fHi * N);
      if (Fmax < Fmin) continue;
      const F = rng.int(Fmin, Fmax), Fb = F / N;
      if (!isEx(Fb, 2)) continue;
      const Areq = (Fb * 1000 * r) / y, kk = list.findIndex(([, a]) => a >= Areq);
      if (kk !== targetK || nearHalf(Areq, 1)) continue;
      const Ak = list[kk][1], fosK = (y * Ak) / (Fb * 1000);
      if (nearHalf(fosK, 1)) continue;
      const parts = [
        numPart("force", "Force per bolt", "Tensile force on each bolt (kN)", Fb, 2, "Share the total load equally between the bolts."),
        numPart("area", "Area needed", `Smallest tensile stress area that gives a factor of safety of ${f(r)} (mm²)`, Areq, 1, "Turn the factor of safety around: the stress allowed is the yield strength divided by the factor of safety. Then area = force ÷ allowed stress, with the force in newtons."),
        pickPart(rng, "size", "Bolt size", "Smallest listed bolt that has at least that area", list.map(([sz]) => sz), list[kk][0], "Compare the area needed with each listed stress area, from the smallest bolt up."),
        numPart("fos", "Actual factor of safety", `Factor of safety with the chosen ${list[kk][0]} bolts`, fosK, 1, "Stress = force per bolt ÷ the chosen bolt's stress area. Then yield ÷ stress.")];
      return finish(`A bracket is held by **${N} identical grade ${grade[0]} bolts** that share a total tensile load of **${F} kN** equally. Grade ${grade[0]} bolts have a yield strength of **${y} N/mm²**. ${boltRule} The design needs a factor of safety of at least **${f(r)}**. Sizes available: **${list.map(([sz, a]) => `${sz} (${a} mm²)`).join(", ")}**.`,
        parts, `**Per bolt:** ${F} ÷ ${N} = **${f(Fb)} kN** = ${f(Fb * 1000)} N.\n\n**Area needed:** ${f(Fb * 1000)} × ${f(r)} ÷ ${y} = **${f(roundTo(Areq, 1))} mm²**.\n\n**Size:** the smallest listed area at or above that is ${list[kk][0]} (${Ak} mm²).\n\n**Actual factor of safety:** ${y} × ${Ak} ÷ ${f(Fb * 1000)} = **${f(roundTo(fosK, 1))}**.`,
        "mch-bs3", { tier, N, F, y, r, list }, [["_F", F], ["_N", N], ["_yield", y], ["_FoS", r]],
        ["Force per bolt, in newtons.", "Area needed from the allowed stress.", "Find the smallest listed bolt with enough area."]);
    }
    const [size, A] = rng.pick(BOLTS);
    const F = rng.pick([4, 6, 8, 10, 12, 15, 16, 18, 20, 24, 25, 30, 32, 36, 40, 48, 50, 60, 64, 80, 100, 120]);
    const Fb = F / N;
    if (!isEx(Fb, 2) || Fb < 0.5) continue;
    const st = (Fb * 1000) / A, FoS = y / st;
    if (st > y * 1.5 || FoS > 8 || nearHalf(st, 0)) continue;
    const pF = numPart("force", "Force per bolt", "Tensile force on each bolt (kN)", Fb, 2, "Share the total load equally between the bolts.");
    const pS = numPart("stress", "Stress", `Tensile stress in each ${size} bolt (N/mm²)`, st, 0, "Change the force to newtons, then divide by the stress area of the bolt.");
    const ex1 = `**Per bolt:** ${F} ÷ ${N} = **${f(Fb)} kN** = ${f(Fb * 1000)} N.\n\n**Stress:** ${f(Fb * 1000)} ÷ ${A} = **${Math.round(st)} N/mm²**.`;
    if (tier === "medium") {
      return finish(`A flange is held by **${N} ${size} bolts** carrying a total tensile load of **${F} kN**, shared equally. ${boltRule}`,
        [pF, pS], ex1, "mch-bs1", { tier, N, F, A }, [["_F", F], ["_N", N], ["_area", A]],
        ["Load per bolt first, in newtons.", "Divide by the stress area."]);
    }
    if (nearHalf(FoS, 1) || FoS < 0.4 || !same(y / roundTo(st, 0), FoS, 1)) continue;
    const pFoS = numPart("fos", "Factor of safety", `Factor of safety against yield for ${grade[0]} bolts`, FoS, 1, "Divide the yield strength by the stress.");
    return finish(`A flange is held by **${N} ${size} grade ${grade[0]} bolts** carrying a total tensile load of **${F} kN**, shared equally. Grade ${grade[0]} bolts have a yield strength of **${y} N/mm²**. ${boltRule}`,
      [pF, pS, pFoS], `${ex1}\n\n**Factor of safety:** ${y} ÷ ${Math.round(st)} = **${f(roundTo(FoS, 1))}**.`,
      "mch-bs2", { tier, N, F, A, y }, [["_F", F], ["_N", N], ["_area", A], ["_yield", y]],
      ["Load per bolt, then stress.", "Yield strength over stress."]);
  }
  return tooMany();
}

// ---------- fit-stackup ----------

const mm3 = (um) => (um / 1000).toFixed(3);
const mm2 = (c) => (c / 100).toFixed(2);

function genFit(rng, tier) {
  if (tier === "medium" || tier === "hard") {
    const type = rng.pick(["Clearance", "Transition", "Interference"]);
    for (let i = 0; i < TRY; i++) {
      const D = rng.pick([10, 12, 16, 20, 25, 30, 40, 50, 60]);
      const ITh = rng.pick([11, 13, 16, 19, 21, 25, 30, 35]), ITs = rng.pick([8, 11, 13, 16, 19, 21, 25]);
      let sUp, sLo;
      if (type === "Clearance") { sUp = -rng.int(8, 60); sLo = sUp - ITs; }
      else if (type === "Interference") { sLo = ITh + rng.int(3, 30); sUp = sLo + ITs; }
      else { sUp = rng.int(3, ITs + 6); sLo = sUp - ITs; }
      const maxC = ITh - sLo, minC = 0 - sUp;
      const t = maxC <= 0 ? "Interference" : minC >= 0 ? "Clearance" : "Transition";
      if (t !== type || Math.abs(maxC) < 3 || Math.abs(minC) < 3) continue;
      const hMax = D * 1000 + ITh, hMin = D * 1000, sMax = D * 1000 + sUp, sMin = D * 1000 + sLo;
      const base = `A hole and a shaft are made to these limits (hole basis): hole **${mm3(hMax)} mm** largest and **${mm3(hMin)} mm** smallest; shaft **${mm3(sMax)} mm** largest and **${mm3(sMin)} mm** smallest. Clearance = hole − shaft, in µm (1 mm = 1000 µm). The largest clearance uses the largest hole and smallest shaft; the smallest clearance uses the smallest hole and largest shaft. A negative clearance is an interference.`;
      const given = [["_hmax", +mm3(hMax)], ["_hmin", +mm3(hMin)], ["_smax", +mm3(sMax)], ["_smin", +mm3(sMin)]];
      const pMax = numPart("max", "Largest clearance", "Largest clearance (µm, negative if interference)", maxC, 0, "Largest hole minus smallest shaft, then convert the difference to micrometres.");
      const pMin = numPart("min", "Smallest clearance", "Smallest clearance (µm, negative if interference)", minC, 0, "Smallest hole minus largest shaft, then convert to micrometres.");
      const ex = `**Largest clearance:** ${mm3(hMax)} − ${mm3(sMin)} = ${(maxC / 1000).toFixed(3)} mm = **${maxC} µm**.\n\n**Smallest clearance:** ${mm3(hMin)} − ${mm3(sMax)} = ${(minC / 1000).toFixed(3)} mm = **${minC} µm**.`;
      if (tier === "medium") {
        return finish(base, [pMax, pMin], ex, "mch-ft1", { tier, hMax, hMin, sMax, sMin }, given,
          ["Largest hole against smallest shaft.", "Smallest hole against largest shaft."]);
      }
      const pT = pickPart(rng, "type", "Type of fit", "What type of fit is this?", ["Clearance", "Transition", "Interference"], type,
        "If even the smallest clearance is positive it is a clearance fit. If even the largest is negative it is an interference fit. Otherwise it is a transition fit.");
      return finish(`${base} Fit type: clearance if the smallest clearance is positive, interference if the largest is negative, otherwise transition.`,
        [pMax, pMin, pT], `${ex}\n\n**Type:** smallest ${minC} µm, largest ${maxC} µm, so it is a **${type.toLowerCase()}** fit.`,
        "mch-ft2", { tier, hMax, hMin, sMax, sMin }, given,
        ["Both clearances first.", "Look at the signs of the two values."]);
    }
    return tooMany();
  }
  // stack-up work in units of 0.01 mm (integers)
  const outcome = rng.pick(["Both", "RSS only", "Neither"]);
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "expert") {
      const a = rng.int(800, 3500), b = rng.int(800, 3500), c = rng.int(800, 3500);
      const tl = rng.int(2, 8), ta = rng.int(2, 8), tb = rng.int(2, 8), tc = rng.int(2, 8);
      const gap = rng.int(10, 60);
      const L = a + b + c + gap, tot = tl + ta + tb + tc;
      const gmax = gap + tot, gmin = gap - tot;
      const need = rng.pick([0, 2, 5, 8, 10]);
      if (!clear(gmin, need, 0) || Math.abs(gmin - need) < 2) continue;
      const ok = gmin >= need;
      if (ok !== wantYes) continue;
      const parts = [
        numPart("nom", "Nominal gap", "Nominal gap when every part is at its nominal size (mm)", gap / 100, 2, "Housing length minus the three parts."),
        numPart("gmax", "Largest gap", "Largest possible gap (mm)", gmax / 100, 2, "Largest gap: housing at its largest, every part at its smallest, so all four tolerances add."),
        numPart("gmin", "Smallest gap", "Smallest possible gap (mm)", gmin / 100, 2, "Smallest gap: housing at its smallest, every part at its largest."),
        yesNo("ok", "Always enough?", `Is the gap at least ${(need / 100).toFixed(2)} mm in every assembly, worst case?`, ok, "Compare the smallest possible gap with the required gap.")];
      return finish(`Three parts are stacked in a housing: part A **${mm2(a)} ± ${mm2(ta)} mm**, part B **${mm2(b)} ± ${mm2(tb)} mm** and part C **${mm2(c)} ± ${mm2(tc)} mm**. The housing is **${mm2(L)} ± ${mm2(tl)} mm** long inside. Gap = housing − (A + B + C). Worst case: take every dimension at the limit that makes the gap largest or smallest. The design needs a gap of at least **${(need / 100).toFixed(2)} mm**.`,
        parts, `**Nominal gap:** ${mm2(L)} − (${mm2(a)} + ${mm2(b)} + ${mm2(c)}) = **${mm2(gap)} mm**.\n\n**Total tolerance:** ${mm2(tl)} + ${mm2(ta)} + ${mm2(tb)} + ${mm2(tc)} = ${mm2(tot)} mm.\n\n**Largest gap:** ${mm2(gap)} + ${mm2(tot)} = **${mm2(gmax)} mm**. **Smallest gap:** ${mm2(gap)} − ${mm2(tot)} = **${mm2(gmin)} mm**.\n\n**Verdict:** ${mm2(gmin)} is ${ok ? "at least" : "below"} ${(need / 100).toFixed(2)}, so **${YN(ok)}**.`,
        "mch-ft3", { tier, a, b, c, L, ta, tb, tc, tl, need }, [["_L", L / 100], ["_A", a / 100], ["_B", b / 100], ["_C", c / 100], ["_need", need / 100]],
        ["Nominal gap from the nominal sizes.", "Add all four tolerances for the worst case, then subtract from or add to the nominal gap."]);
    }
    // expert-plus: worst case against root-sum-square
    const Q = rng.pick([[1, 1, 1, 1, 2], [2, 2, 4, 5, 7], [1, 2, 4, 10, 11], [2, 4, 5, 6, 9]]), m = rng.pick([1, 2, 3]);
    const tols = shuffled(rng, Q.slice(0, 4)).map((x) => x * m), rss = Q[4] * m, tot = tols.reduce((s, x) => s + x, 0);
    const [tl, ta, tb, tc] = tols;
    const a = rng.int(800, 3500), b = rng.int(800, 3500), c = rng.int(800, 3500), gap = rng.int(10, 90), L = a + b + c + gap;
    const gWc = gap - tot, gRss = gap - rss;
    const need = 5 * rng.int(0, 10);
    const res = gWc >= need ? "Both" : gRss >= need ? "RSS only" : "Neither";
    if (res !== outcome) continue;
    if (Math.abs(gWc - need) < 2 || Math.abs(gRss - need) < 2) continue;
    const parts = [
      numPart("nom", "Nominal gap", "Nominal gap (mm)", gap / 100, 2, "Housing length minus the three parts."),
      numPart("wc", "Worst-case smallest gap", "Smallest gap by the worst-case method (mm)", gWc / 100, 2, "Add all four tolerances, then subtract the total from the nominal gap."),
      numPart("rss", "RSS smallest gap", "Smallest gap by the root-sum-square (RSS) method (mm)", gRss / 100, 2, "Square each tolerance, add the squares, take the square root, and subtract that from the nominal gap. The squares add up to a perfect square."),
      pickPart(rng, "pass", "Which method passes", `Which method(s) show a gap of at least ${(need / 100).toFixed(2)} mm?`, ["Both", "RSS only", "Neither"], res, "Compare each method's smallest gap with the required gap. The RSS tolerance is never larger than the worst-case total.")];
    return finish(`Three parts are stacked in a housing: part A **${mm2(a)} ± ${mm2(ta)} mm**, part B **${mm2(b)} ± ${mm2(tb)} mm** and part C **${mm2(c)} ± ${mm2(tc)} mm**. The housing is **${mm2(L)} ± ${mm2(tl)} mm** long inside. Gap = housing − (A + B + C). Worst case: the four tolerances add. Root-sum-square (RSS), for a statistical stack: the gap varies by ± √(sum of the squares of the four tolerances) around the nominal gap. The design needs a gap of at least **${(need / 100).toFixed(2)} mm**.`,
      parts, `**Nominal gap:** ${mm2(L)} − (${mm2(a)} + ${mm2(b)} + ${mm2(c)}) = **${mm2(gap)} mm**.\n\n**Worst case:** tolerances add to ${mm2(tot)} mm, so the smallest gap is ${mm2(gap)} − ${mm2(tot)} = **${mm2(gWc)} mm**.\n\n**RSS:** √(${[tl, ta, tb, tc].map((x) => `${mm2(x)}²`).join(" + ")}) = ${mm2(rss)} mm, so the smallest gap is ${mm2(gap)} − ${mm2(rss)} = **${mm2(gRss)} mm**.\n\n**Against ${(need / 100).toFixed(2)} mm:** **${res}**.`,
      "mch-ft4", { tier, a, b, c, L, ta, tb, tc, tl, need }, [["_L", L / 100], ["_A", a / 100], ["_B", b / 100], ["_C", c / 100], ["_need", need / 100]],
      ["Nominal gap, then the two tolerance totals.", "RSS: square, add, square root.", "Test each method's smallest gap against the need."]);
  }
  return tooMany();
}

// ---------- hydraulic-cylinder ----------

const hydRule = "Piston area = π × d² ÷ 4 with π = 3.14. Pressure = force ÷ area, and 1 N/mm² = 10 bar. Pump flow in L/min: 1 L = 1 000 000 mm³, so flow in mm³/s = L/min × 1 000 000 ÷ 60. Piston speed = flow ÷ area.";

function genHyd(rng, tier) {
  const targetK = rng.int(0, 3), wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const d = rng.pick([30, 40, 50, 60, 70, 80, 90, 100]), A = (PI * d * d) / 4;
    if (tier === "expert-plus") {
      const dr = rng.pick([20, 25, 30, 35, 40, 45, 50, 60, 70]);
      if (dr > 0.7 * d || dr < 0.25 * d) continue;
      const p = rng.pick([100, 120, 125, 150, 160, 180, 200, 210, 250]), Q = rng.pick([6, 10, 12, 15, 20, 24, 30, 40]);
      const S = 50 * rng.int(4, 16), Aa = (PI * (d * d - dr * dr)) / 4;
      const Fe = (p * 0.1 * A) / 1000, Fr = (p * 0.1 * Aa) / 1000;
      const t = (S * Aa * 60) / (Q * 1e6);
      if (nearHalf(Fe, 1) || nearHalf(Fr, 1) || nearHalf(t, 1) || t < 1 || t > 60) continue;
      const W = Math.round(Fr * (wantOk ? rng.pick([0.7, 0.8, 0.9]) : rng.pick([1.1, 1.2, 1.35])));
      const ok = Fr >= W;
      if (ok !== wantOk || !clear(Fr, W, 0.05) || W < 2) continue;
      const parts = [
        numPart("fext", "Extend force", "Force when extending at full pressure (kN)", Fe, 1, "Pressure in N/mm² (bar ÷ 10) times the full piston area gives newtons. Divide by 1000 for kN."),
        numPart("fret", "Retract force", "Force when retracting at full pressure (kN)", Fr, 1, "On the retract stroke the fluid acts on the ring-shaped area: piston area minus rod area."),
        numPart("time", "Retract time", `Time to retract the ${S} mm stroke (s)`, t, 1, "Speed = flow in mm³/s ÷ the ring-shaped area. Time = stroke ÷ speed."),
        yesNo("lift", "Can it retract the load?", `Can it retract against a load of ${W} kN (retract force at least the load)?`, ok, "Compare the retract force with the load.")];
      return finish(`A double-acting cylinder has a **${d} mm** bore and a **${dr} mm** rod, a stroke of **${S} mm**, and a relief valve set to **${p} bar**. The pump supplies **${Q} L/min**. ${hydRule} On the extend stroke the pressure acts on the full piston area; on the retract stroke it acts on the piston area minus the rod area (π × rod diameter² ÷ 4). Force (N) = pressure (N/mm²) × area (mm²).`,
        parts, `**Areas:** piston 3.14 × ${d}² ÷ 4 = ${f(A)} mm²; rod 3.14 × ${dr}² ÷ 4 = ${f((PI * dr * dr) / 4)} mm²; ring ${f(Aa)} mm².\n\n**Extend force:** ${p / 10} × ${f(A)} = ${f(roundTo(Fe * 1000, 1))} N = **${f(roundTo(Fe, 1))} kN**.\n\n**Retract force:** ${p / 10} × ${f(Aa)} = ${f(roundTo(Fr * 1000, 1))} N = **${f(roundTo(Fr, 1))} kN**.\n\n**Retract time:** speed = ${Q} × 1 000 000 ÷ 60 ÷ ${f(Aa)}; ${S} mm takes **${f(roundTo(t, 1))} s**.\n\n**Load:** ${f(roundTo(Fr, 1))} kN is ${ok ? "at least" : "below"} ${W} kN: **${YN(ok)}**.`,
        "mch-hc4", { tier, d, dr, p, Q, S, W }, [["_d", d], ["_rod", dr], ["_p", p], ["_Q", Q], ["_S", S], ["_W", W]],
        ["Both areas first: full piston, then the ring.", "Force from pressure and area.", "Speed from flow and area, then time from stroke.", "Retract force against the load."]);
    }
    if (tier === "expert") {
      const Q = rng.pick([6, 10, 12, 15, 20, 24, 30, 40]), etaP = rng.pick([80, 85, 90]);
      const F = rng.pick([10, 15, 20, 25, 30, 40, 50, 60, 80, 100]);
      const p = (F * 10000) / A;
      if (p < 40 || p > 250 || nearHalf(p, 1)) continue;
      const Ph = (p * Q) / 600;
      const s = rng.int(0, MOTORS.length - 4), list = MOTORS.slice(s, s + 4), need = Ph / (etaP / 100);
      const k = list.findIndex((m) => m >= need);
      if (k !== targetK || nearHalf(Ph, 2)) continue;
      const lo = targetK === 0 ? 0 : 1.04 * list[targetK - 1];
      if (need < lo || need > 0.96 * list[targetK]) continue;
      if (!same((roundTo(p, 1) * Q) / 600, Ph, 2)) continue;
      const parts = [
        numPart("area", "Piston area", "Piston area (mm²)", A, 1, "Use the stated area formula with the bore."),
        numPart("press", "Pressure", "Pressure needed to push the load (bar)", p, 1, "Force in newtons over area gives N/mm². Multiply by 10 for bar."),
        numPart("power", "Hydraulic power", "Hydraulic power delivered by the pump (kW)", Ph, 2, "Power in kW = pressure in bar × flow in L/min ÷ 600."),
        pickPart(rng, "motor", "Motor", "Smallest listed motor that can drive the pump at that power", list.map(kw), kw(list[k]), "The motor must supply more than the hydraulic power, because the pump wastes some. Divide the hydraulic power by the pump efficiency, then take the smallest listed motor at or above that.")];
      return finish(`A press cylinder with a **${d} mm** bore must push with **${F} kN**. The pump supplies **${Q} L/min**. ${hydRule} Hydraulic power (kW) = pressure (bar) × flow (L/min) ÷ 600. The pump is **${etaP}%** efficient, so the motor power needed = hydraulic power ÷ efficiency. Motors available: **${list.map(kw).join(", ")}**. Choose the smallest that is at least the motor power needed.`,
        parts, `**Area:** 3.14 × ${d}² ÷ 4 = **${f(A)} mm²**.\n\n**Pressure:** ${F} × 1000 ÷ ${f(A)} = ${f(roundTo(p / 10, 3))} N/mm² = **${f(roundTo(p, 1))} bar**.\n\n**Hydraulic power:** ${f(roundTo(p, 1))} × ${Q} ÷ 600 = **${f(roundTo(Ph, 2))} kW**.\n\n**Motor:** ${f(roundTo(Ph, 2))} ÷ ${etaP / 100} = ${f(roundTo(need, 2))} kW, so the smallest listed motor is **${kw(list[k])}**.`,
        "mch-hc3", { tier, d, F, Q, etaP, list }, [["_d", d], ["_F", F], ["_Q", Q], ["_eff", etaP]],
        ["Area, then pressure.", "Power from pressure and flow.", "Allow for the pump efficiency before choosing a motor."]);
    }
    const F = rng.pick([10, 15, 20, 25, 30, 40, 50, 60, 80, 100]), p = (F * 10000) / A;
    if (p < 40 || p > 250 || nearHalf(p, 1) || nearHalf(A, 1, 0.001)) continue;
    const pA = numPart("area", "Piston area", "Piston area (mm²)", A, 1, "Use the stated area formula with the bore.");
    const pP = numPart("press", "Pressure", "Pressure needed to push the load (bar)", p, 1, "Force in newtons over area gives N/mm². Multiply by 10 for bar.");
    const ex = `**Area:** 3.14 × ${d}² ÷ 4 = **${f(A)} mm²**.\n\n**Pressure:** ${F} × 1000 ÷ ${f(A)} = ${f(roundTo(p / 10, 3))} N/mm² = **${f(roundTo(p, 1))} bar**.`;
    if (tier === "medium") {
      return finish(`A hydraulic cylinder with a **${d} mm** bore has to push a load of **${F} kN**. ${hydRule}`,
        [pA, pP], ex, "mch-hc1", { tier, d, F }, [["_d", d], ["_F", F]], ["Area from the bore.", "Force in newtons divided by the area, then to bar."]);
    }
    const Q = rng.pick([6, 10, 12, 15, 20, 24, 30, 40]), v = (Q * 1e6) / 60 / A;
    if (nearHalf(v, 0)) continue;
    const pV = numPart("speed", "Extend speed", "Piston speed when extending (mm/s)", v, 0, "Flow in mm³/s divided by the piston area.");
    return finish(`A hydraulic cylinder with a **${d} mm** bore has to push a load of **${F} kN**, fed by a pump delivering **${Q} L/min**. ${hydRule}`,
      [pA, pP, pV], `${ex}\n\n**Speed:** ${Q} × 1 000 000 ÷ 60 ÷ ${f(A)} = **${Math.round(v)} mm/s**.`,
      "mch-hc2", { tier, d, F, Q }, [["_d", d], ["_F", F], ["_Q", Q]],
      ["Area and pressure as before.", "Convert litres per minute to mm³ per second first."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "drive-train") return genDrive(rng, difficulty);
  if (subtopic === "bolt-shaft") return genBolt(rng, difficulty);
  if (subtopic === "fit-stackup") return genFit(rng, difficulty);
  if (subtopic === "hydraulic-cylinder") return genHyd(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (ratio by cross-multiplying teeth,
// torque through output power and output speed, motor pick by delivered torque against the load, stress
// from per-bolt force in newtons, shaft sizing by trying each diameter, fit limits from signed
// deviations, stack-up by trying the extreme corners, RSS from a sum of squares, hydraulics through
// radius and SI pressure and flow). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

const ratioOf = (p) => (p.b1 * p.b2) / (p.a1 * p.a2);
const circleA = (d) => PI * (d / 2) ** 2;
const typeOf = (hMax, hMin, sMax, sMin) => {
  const mx = hMax - sMin, mi = hMin - sMax;
  return { mx, mi, type: mx < 0 ? "Interference" : mi > 0 ? "Clearance" : "Transition" };
};
const corners = (nominal, tols) => { // extreme gaps by trying every corner (all signs)
  let lo = Infinity, hi = -Infinity;
  for (let m = 0; m < 1 << tols.length; m++) {
    let g = nominal;
    tols.forEach((t, i) => { g += m & (1 << i) ? t : -t; });
    lo = Math.min(lo, g); hi = Math.max(hi, g);
  }
  return { lo, hi };
};

const ALT = {
  "mch-dt1": (p) => { const R = ratioOf(p); return { ratio: R, speed: p.n / R }; },
  "mch-dt2": (p) => {
    const R = ratioOf(p), N = p.n / R, Pout = p.P * (p.eta / 100);
    return { ratio: R, speed: N, torque: (9550 * Pout) / N };
  },
  "mch-dt3": (p) => {
    const R = ratioOf(p), N = p.n / R, k = p.list.findIndex((m) => ((9550 * m) / p.n) * R * (p.eta / 100) >= p.TL - 1e-9);
    return { ratio: R, speed: N, need: p.TL / (R * (p.eta / 100)), motor: kw(p.list[k]) };
  },
  "mch-dt4": (p) => {
    const R = ratioOf(p), N = p.n / R, Pout = p.P * (p.es / 100) * (p.es / 100), To = (9550 * Pout) / N;
    return { ratio: R, speed: N, torque: To, ok: YN(N >= p.lo && N <= p.hi && To >= p.TL) };
  },
  "mch-bs1": (p) => ({ force: p.F / p.N, stress: (p.F * 1000) / p.N / p.A }),
  "mch-bs2": (p) => { const s = (p.F * 1000) / p.N / p.A; return { force: p.F / p.N, stress: s, fos: p.y / s }; },
  "mch-bs3": (p) => {
    const Fn = (p.F * 1000) / p.N;
    const ok = p.list.find(([, a]) => (p.y * a) / Fn >= p.r - 1e-9);
    return { force: Fn / 1000, area: (Fn * p.r) / p.y, size: ok[0], fos: (p.y * ok[1]) / Fn };
  },
  "mch-bs4": (p) => {
    const T = (9550 * p.P) / p.n, tauAt = (d) => (16 * T * 1000) / (PI * d * d * d);
    const ok = p.list.find((d) => (0.6 * p.y) / tauAt(d) >= p.r - 1e-9);
    return { torque: T, tau: tauAt(p.d), fos: (0.6 * p.y) / tauAt(p.d), dia: `${ok} mm` };
  },
  "mch-ft1": (p) => { const t = typeOf(p.hMax, p.hMin, p.sMax, p.sMin); return { max: t.mx, min: t.mi }; },
  "mch-ft2": (p) => { const t = typeOf(p.hMax, p.hMin, p.sMax, p.sMin); return { max: t.mx, min: t.mi, type: t.type }; },
  "mch-ft3": (p) => {
    const nom = p.L - p.a - p.b - p.c;
    const c = corners(nom, [p.tl, p.ta, p.tb, p.tc]);
    return { nom: nom / 100, gmax: c.hi / 100, gmin: c.lo / 100, ok: YN(c.lo >= p.need) };
  },
  "mch-ft4": (p) => {
    const nom = p.L - p.a - p.b - p.c, ts = [p.tl, p.ta, p.tb, p.tc];
    const wc = corners(nom, ts).lo, rss = nom - Math.sqrt(ts.reduce((s, t) => s + t * t, 0));
    return { nom: nom / 100, wc: wc / 100, rss: rss / 100, pass: wc >= p.need ? "Both" : rss >= p.need - 1e-9 ? "RSS only" : "Neither" };
  },
  "mch-hc1": (p) => { const A = circleA(p.d); return { area: A, press: (p.F * 1000) / A / 0.1 }; },
  "mch-hc2": (p) => {
    const A = circleA(p.d);
    return { area: A, press: (p.F * 1000) / A / 0.1, speed: (p.Q * 1e6) / 60 / A };
  },
  "mch-hc3": (p) => {
    const A = circleA(p.d), pr = (p.F * 1000) / A / 0.1;
    const watts = pr * 1e5 * (p.Q / 60000), kwh = watts / 1000, k = p.list.find((m) => m >= kwh / (p.etaP / 100) - 1e-9);
    return { area: A, press: pr, power: kwh, motor: kw(k) };
  },
  "mch-hc4": (p) => {
    const A = circleA(p.d), Aa = A - circleA(p.dr), Pa = p.p * 1e5; // pressure in pascals, areas in m²
    const Fr = (Pa * Aa * 1e-6) / 1000;
    const t = (p.S / 1000) / ((p.Q / 60000) / (Aa * 1e-6));
    return { fext: (Pa * A * 1e-6) / 1000, fret: Fr, time: t, lift: YN(Fr >= p.W) };
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
