// Pilot role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact, or (where a rounded earlier answer is asked for)
// redrawn until working from the rounded value gives the same later answer. No answer sits on a
// rounding half-step, and verdict parts (Yes/No, segmented) are decided first and then fitted.
// All figures are made up for arithmetic practice: speeds in knots, distances in nautical miles,
// directions are true bearings, times are 24-hour with fixed UTC offsets (no daylight saving).
// Nothing here is a flight-planning rule or a real procedure.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   wind-triangle  head/tail wind -> crosswind (sine rule) -> heading, ground speed, time -> backwards   (Flight Planner)
//   fuel-planning  time -> trip fuel -> reserve and taxi -> enough? -> point of no return               (Flight Planner)
//   chart-work     chart cm at a scale -> nm -> time -> reciprocal; two legs -> position; track and clearance (Navigator)
//   eta-descent    UTC arrival and local time -> curfew call -> top of descent                           (Navigator)

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
const tooMany = () => { throw new Error("role-pilot: no suitable draw"); };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const wrap = (x) => ((x % 360) + 360) % 360;
const bear = (x) => { const r = Math.round(wrap(x)); return r === 0 ? 360 : r; }; // 1..360
const b3 = (n) => String(n).padStart(3, "0");
const fb = (x) => `${b3(bear(x))}°`;
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const offText = (m) => { const a = Math.abs(m); return `UTC${m < 0 ? "−" : "+"}${Math.floor(a / 60)}${a % 60 ? ":" + pad2(a % 60) : ""}`; };
const hm = (m) => `${Math.floor(m / 60)} h ${pad2(m % 60)} min`;

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
function timePart(id, label, ask, mins, hint) {
  const t = hhmm(mins);
  const accepts = [];
  if (t.startsWith("0")) accepts.push(t.slice(1));
  accepts.push(t.replace(":", "."), t.replace(":", ""));
  return { id, label, ask: `${ask} (24-hour, HH:MM)`, answerType: "text", answer: t, accepts, fuzzy: false, hint };
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

// Wind and vectors. Wd = direction the wind blows FROM; the air vector has heading h and speed tas.
const NOTE = "Speeds are in knots (kt), distances in nautical miles (nm), directions are true bearings in degrees, and a wind direction is where the wind blows **from**.";

// Independent solver: find the heading whose vector sum (air + wind) lies along the track T, by bisection.
function windSolve(T, tas, W, Wd) {
  const wx = W * Math.sin((Wd + 180) * D2R), wy = W * Math.cos((Wd + 180) * D2R);
  const ground = (h) => ({ x: tas * Math.sin(h * D2R) + wx, y: tas * Math.cos(h * D2R) + wy });
  const err = (h) => { const g = ground(h); return ((Math.atan2(g.x, g.y) * R2D - T + 540) % 360) - 180; };
  let lo = T - 70, hi = T + 70;
  for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (err(mid) > 0) hi = mid; else lo = mid; }
  const h = (lo + hi) / 2, g = ground(h);
  return { h, gs: Math.hypot(g.x, g.y), wca: ((h - T + 540) % 360) - 180 };
}

// ---------- wind-triangle ----------

const TAS_LIST = [90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 200, 220];

function genWind(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const tas = rng.pick(TAS_LIST.slice(0, 10)), W = rng.pick([10, 15, 20, 25, 30, 35, 40]), head = rng.next() < 0.5;
      const T = rng.int(1, 35) * 10, Wd = head ? T : wrap(T + 180);
      const gs = head ? tas - W : tas + W, t = rng.int(6, 40) * 3, D = (gs * t) / 60;
      if (!isEx(D, 0) || D < 20) continue;
      const parts = [
        numPart("gs", "Ground speed", "Ground speed (kt)", gs, 0, "A wind from straight ahead takes its speed off your airspeed; from straight behind it adds its speed. Compare the wind direction with the track."),
        numPart("t", "Time en route", "Time en route (min)", t, 0, "Time in hours = distance ÷ ground speed; multiply by 60 for minutes."),
      ];
      const ex = `**Ground speed:** the wind from ${fb(Wd)} is ${head ? "straight ahead of" : "straight behind"} the ${fb(T)} track, a ${head ? "headwind" : "tailwind"}, so GS = ${tas} ${head ? "−" : "+"} ${W} = **${gs} kt**.\n\n**Time:** ${D} ÷ ${gs} × 60 = **${t} min**.`;
      return finish(
        `${NOTE}\n\nAn aircraft flies a track of **${fb(T)}** for **${D} nm** at a true airspeed (TAS) of **${tas} kt**. The wind is from **${fb(Wd)}** at **${W} kt**.`,
        parts, ex, "pil-wind1", { tier, T, tas, W, Wd, D }, [["_TAS", tas], ["_W", W], ["_D", D]],
        ["Is the wind ahead of or behind the aircraft? Then add or subtract.", "Time = distance ÷ speed."],
      );
    }
    if (tier === "hard") {
      const tas = rng.pick(TAS_LIST), W = rng.pick([10, 15, 20, 25, 30, 35, 40, 45]), side = rng.next() < 0.5 ? 1 : -1;
      const T = rng.int(5, 67) * 5;
      if (W / tas > 0.32) continue;
      const wca = Math.asin(W / tas) * R2D, hdg = T + side * wca, gs = tas * Math.cos(wca * D2R);
      if (hdg < 6 || hdg > 354 || nearHalf(wca, 1, 0.1) || nearHalf(hdg, 0, 0.12) || nearHalf(gs, 0, 0.12)) continue;
      const wr = roundTo(wca, 1);
      if (roundTo(T + side * wr, 0) !== roundTo(hdg, 0)) continue;
      if (roundTo(tas * Math.cos(wr * D2R), 0) !== roundTo(gs, 0)) continue;
      const Wd = wrap(T + side * 90);
      const parts = [
        numPart("wca", "Wind correction angle", "Wind correction angle (degrees)", wca, 1, "sin(WCA) = W ÷ TAS, so take the inverse sine of the wind speed divided by the airspeed."),
        numPart("hdg", "Heading", "Heading to fly (degrees)", hdg, 0, `The aircraft must point into the wind. A wind from the ${side > 0 ? "right" : "left"} of the track means a heading ${side > 0 ? "right" : "left"} of the track: ${side > 0 ? "add" : "subtract"} the correction angle.`, true),
        numPart("gs", "Ground speed", "Ground speed (kt)", gs, 0, "With the wind at right angles to the track, GS = TAS × cos(WCA).", true),
      ];
      const ex = `**Correction angle:** sin(WCA) = ${W} ÷ ${tas} = ${roundTo(W / tas, 4)}, so WCA = **${wr.toFixed(1)}°**.\n\n**Heading:** the wind from ${fb(Wd)} is on the ${side > 0 ? "right" : "left"} of the ${fb(T)} track, so ${f(T)} ${side > 0 ? "+" : "−"} ${wr.toFixed(1)} = ${f(roundTo(T + side * wr, 1))}, which is **${bear(hdg)}°**.\n\n**Ground speed:** ${tas} × cos(${wr.toFixed(1)}°) = **${roundTo(gs, 0)} kt**.`;
      return finish(
        `${NOTE}\n\nAn aircraft must make good a track of **${fb(T)}** at a TAS of **${tas} kt**. The wind is from **${fb(Wd)}** at **${W} kt**, so it is at right angles to the track. Use sin(WCA) = W ÷ TAS and GS = TAS × cos(WCA).`,
        parts, ex, "pil-wind2", { tier, T, tas, W, Wd }, [["_T", T], ["_TAS", tas], ["_W", W]],
        ["The wind pushes the aircraft sideways, so point it into the wind by the correction angle.", "Angle first, then heading, then ground speed."],
      );
    }
    if (tier === "expert") {
      const tas = rng.pick(TAS_LIST), W = rng.pick([10, 15, 20, 25, 30, 35, 40, 45, 50]), side = rng.next() < 0.5 ? 1 : -1;
      const th = rng.pick([30, 40, 45, 50, 60, 120, 130, 135, 140, 150]);
      const T = rng.int(5, 67) * 5, D = rng.int(10, 80) * 5;
      if (W / tas > 0.35) continue;
      const cw = W * Math.sin(th * D2R), hw = W * Math.cos(th * D2R);
      const wca = Math.asin(cw / tas) * R2D, hdg = T + side * wca, gs = tas * Math.cos(wca * D2R) - hw;
      if (hdg < 6 || hdg > 354 || gs < 55 || nearHalf(wca, 1, 0.1) || nearHalf(hdg, 0, 0.12) || nearHalf(gs, 0, 0.12)) continue;
      const wr = roundTo(wca, 1);
      if (roundTo(T + side * wr, 0) !== roundTo(hdg, 0)) continue;
      const gsr = tas * Math.cos(wr * D2R) - hw;
      if (roundTo(gsr, 0) !== roundTo(gs, 0)) continue;
      const t = (D / gs) * 60, tr = (D / roundTo(gs, 0)) * 60;
      if (nearHalf(t, 0, 0.12) || roundTo(t, 0) !== roundTo(tr, 0)) continue;
      const Wd = wrap(T + side * th);
      const parts = [
        numPart("wca", "Wind correction angle", "Wind correction angle (degrees)", wca, 1, "θ is the angle between the track and the wind direction. Find the crosswind part, W × sin(θ), then use sin(WCA) = crosswind ÷ TAS."),
        numPart("hdg", "Heading", "Heading to fly (degrees)", hdg, 0, `Point into the wind: the wind is on the ${side > 0 ? "right" : "left"} of the track, so ${side > 0 ? "add" : "subtract"} the correction angle to the track.`, true),
        numPart("gs", "Ground speed", "Ground speed (kt)", gs, 0, "Take TAS × cos(WCA) and subtract the headwind part of the wind, W × cos(θ). A negative headwind part is a tailwind and adds.", true),
        numPart("t", "Time en route", "Time en route (min)", t, 0, "Distance ÷ ground speed gives hours; × 60 for minutes.", true),
      ];
      const ex = `**θ:** the wind from ${fb(Wd)} and the track ${fb(T)} differ by ${th}°, with the wind on the ${side > 0 ? "right" : "left"}. Crosswind = ${W} × sin ${th}° = ${roundTo(cw, 2)} kt; headwind part = ${W} × cos ${th}° = ${roundTo(hw, 2)} kt.\n\n**Correction angle:** sin(WCA) = ${roundTo(cw, 2)} ÷ ${tas}, so WCA = **${wr.toFixed(1)}°**.\n\n**Heading:** ${f(T)} ${side > 0 ? "+" : "−"} ${wr.toFixed(1)} = **${bear(hdg)}°** (nearest degree).\n\n**Ground speed:** ${tas} × cos(${wr.toFixed(1)}°) ${hw >= 0 ? "−" : "+"} ${roundTo(Math.abs(hw), 2)} = **${roundTo(gs, 0)} kt**.\n\n**Time:** ${D} ÷ ${roundTo(gs, 0)} × 60 = **${roundTo(t, 0)} min**.`;
      return finish(
        `${NOTE}\n\nAn aircraft must make good a track of **${fb(T)}** for **${D} nm** at a TAS of **${tas} kt**. The wind is from **${fb(Wd)}** at **${W} kt**. Let θ be the angle between the track and the wind direction. Use sin(WCA) = W × sin(θ) ÷ TAS and GS = TAS × cos(WCA) − W × cos(θ). Round as each part says.`,
        parts, ex, "pil-wind3", { tier, T, tas, W, Wd, D }, [["_T", T], ["_TAS", tas], ["_W", W], ["_D", D]],
        ["Work out θ from the two bearings first.", "Crosswind, correction angle, heading, ground speed, then time."],
      );
    }
    // expert-plus: required time -> required ground speed -> wind components -> TAS needed -> verdict
    const W = rng.pick([15, 20, 25, 30, 35, 40, 45, 50, 55, 60]), side = rng.next() < 0.5 ? 1 : -1;
    const th = rng.pick([30, 45, 60, 120, 135, 150]);
    const T = rng.int(5, 67) * 5, gsReq = rng.pick([100, 110, 120, 130, 140, 150, 160, 170, 180, 200, 220, 240]);
    const M = rng.pick([30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90]);
    const D = (gsReq * M) / 60;
    if (!isEx(D, 0) || D < 40) continue;
    const cw = W * Math.sin(th * D2R), hw = W * Math.cos(th * D2R);
    const tas = Math.hypot(gsReq + hw, cw);
    if (tas < 90 || tas > 450 || nearHalf(tas, 0, 0.12)) continue;
    const hwr = roundTo(hw, 1), cwr = roundTo(cw, 1);
    if (nearHalf(hw, 1, 0.12) || nearHalf(cw, 1, 0.12)) continue;
    const tasR = Math.hypot(gsReq + hwr, cwr);
    if (roundTo(tasR, 0) !== roundTo(tas, 0) || nearHalf(tasR, 0, 0.12)) continue;
    const okv = rng.next() < 0.5, tr = roundTo(tas, 0);
    const Vmax = tr + (okv ? 1 : -1) * rng.pick([5, 8, 10, 12, 15]);
    if (Vmax < 80) continue;
    const Wd = wrap(T + side * th), head = th < 90;
    const parts = [
      numPart("gs", "Required ground speed", "Ground speed needed to cover the distance in time (kt)", gsReq, 0, "Ground speed = distance ÷ time, with the time converted to hours."),
      numPart("hw", "Wind along the track", "Wind component along the track (kt; headwind positive, tailwind negative)", hw, 1, "θ is the angle between the track and the wind direction. The component along the track is W × cos(θ); it is a tailwind when θ is over 90°."),
      numPart("tas", "TAS needed", "TAS needed (kt)", tas, 0, "The aircraft must cancel the crosswind and still make the ground speed: TAS² = (GS + headwind)² + crosswind², with the crosswind W × sin(θ).", true),
      segPart2(rng, "verdict", "Verdict", `The aircraft's greatest TAS is **${Vmax} kt**. State the wind along the track and whether it can arrive on time.`, ["Wind effect", "On time"], ["Headwind", "Tailwind"], ["Yes", "No"], [head ? "Headwind" : "Tailwind", YN(tas <= Vmax)],
        "Headwind or tailwind comes from the sign of the along-track component. It is on time only if the TAS needed is no more than the greatest TAS."),
    ];
    const ex = `**Ground speed needed:** ${D} ÷ ${M} × 60 = **${gsReq} kt**.\n\n**Wind components:** θ = ${th}° (wind from ${fb(Wd)}, track ${fb(T)}). Along the track: ${W} × cos ${th}° = **${hwr.toFixed(1)} kt** (${head ? "headwind" : "tailwind"}); across: ${W} × sin ${th}° = ${cwr.toFixed(1)} kt.\n\n**TAS needed:** √((${gsReq} ${hw >= 0 ? "+" : "−"} ${Math.abs(hwr).toFixed(1)})² + ${cwr.toFixed(1)}²) = **${tr} kt**.\n\n**Verdict:** ${head ? "Headwind" : "Tailwind"}; ${tr} kt is ${tas <= Vmax ? "no more than" : "more than"} ${Vmax} kt, so on time: **${YN(tas <= Vmax)}**.`;
    return finish(
      `${NOTE}\n\nAn aircraft must fly a track of **${fb(T)}** for **${D} nm** and arrive within **${M} min**. The wind is from **${fb(Wd)}** at **${W} kt**. Let θ be the angle between the track and the wind direction. Work backwards to the airspeed this needs. Round as each part says.`,
      parts, ex, "pil-wind4", { tier, T, W, Wd, D, M, Vmax }, [["_T", T], ["_W", W], ["_D", D], ["_M", M], ["_Vmax", Vmax]],
      ["Required ground speed comes straight from distance and time.", "Split the wind into a part along the track and a part across it, then rebuild the airspeed."],
    );
  }
  return tooMany();
}

// ---------- fuel-planning ----------

const BURNS = [24, 30, 36, 42, 48, 54, 60];
const fuelNote = "Fuel is in litres (L) and burn rates in litres per hour at cruise. The figures are made up for practice.";

function genFuel(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const gs = rng.pick([90, 100, 110, 120, 130, 140, 150]), B = rng.pick(BURNS), t = rng.int(4, 20) * 5, D = (gs * t) / 60, fuel = (B * t) / 60;
      if (!isEx(D, 0) || !isEx(fuel, 0) || D < 20) continue;
      const parts = [
        numPart("t", "Flight time", "Flight time (min)", t, 0, "Time in hours = distance ÷ ground speed; × 60 for minutes."),
        numPart("fuel", "Trip fuel", "Fuel burned on the flight (L)", fuel, 0, "Fuel = burn rate × time in hours, so the time in minutes ÷ 60 first."),
      ];
      const ex = `**Flight time:** ${D} ÷ ${gs} × 60 = **${t} min**.\n\n**Trip fuel:** ${B} × ${t} ÷ 60 = **${fuel} L**.`;
      return finish(
        `${fuelNote}\n\nA leg is **${D} nm** long and the aircraft's ground speed is **${gs} kt**. It burns **${B} L/h**.`,
        parts, ex, "pil-fuel1", { tier, gs, B, D }, [["_D", D], ["_GS", gs], ["_B", B]],
        ["Find the time first, in minutes.", "Fuel = burn per hour × hours."],
      );
    }
    if (tier === "hard") {
      const gs = rng.pick([100, 110, 120, 130, 140, 150, 160]), B = rng.pick(BURNS), t = rng.int(5, 22) * 5, D = (gs * t) / 60, fuel = (B * t) / 60;
      const R = rng.pick([30, 45]), X = rng.pick([3, 4, 5, 6, 8]);
      const res = (B * R) / 60, total = fuel + res + X;
      if (!isEx(D, 0) || !isEx(fuel, 0) || !isEx(total, 0) || D < 25) continue;
      const parts = [
        numPart("t", "Flight time", "Flight time (min)", t, 0, "Time in hours = distance ÷ ground speed; × 60 for minutes."),
        numPart("fuel", "Trip fuel", "Fuel burned on the flight (L)", fuel, 0, "Burn rate × time in hours."),
        numPart("total", "Fuel required", "Total fuel required at departure (L)", total, 0, "Add the three amounts: trip fuel, the reserve (the burn rate for the reserve minutes), and the taxi fuel."),
      ];
      const ex = `**Flight time:** ${D} ÷ ${gs} × 60 = **${t} min**.\n\n**Trip fuel:** ${B} × ${t} ÷ 60 = **${fuel} L**.\n\n**Total:** reserve = ${B} × ${R} ÷ 60 = ${f(res)} L, so ${fuel} + ${f(res)} + ${X} = **${total} L**.`;
      return finish(
        `${fuelNote}\n\nA leg is **${D} nm** at a ground speed of **${gs} kt**, burning **${B} L/h**. The plan needs the trip fuel, plus a reserve of **${R} minutes** at the same burn rate, plus **${X} L** for taxi.`,
        parts, ex, "pil-fuel2", { tier, gs, B, D, R, X }, [["_D", D], ["_GS", gs], ["_B", B], ["_R", R], ["_X", X]],
        ["Time, then trip fuel, then add the reserve and taxi fuel.", "The reserve is time at the burn rate, not a fixed number of litres."],
      );
    }
    if (tier === "expert") {
      const tas = rng.pick([100, 110, 120, 130, 140, 150, 160]), Wc = rng.pick([10, 15, 20, 25, 30]), head = rng.next() < 0.5;
      const B = rng.pick(BURNS), t = rng.int(5, 22) * 5, R = rng.pick([30, 45]), X = rng.pick([3, 4, 5, 6, 8]);
      const gs = head ? tas - Wc : tas + Wc, D = (gs * t) / 60;
      const trip = (B * t) / 60, res = (B * R) / 60, req = 1.1 * trip + res + X;
      if (!isEx(D, 0) || D < 25 || nearHalf(req, 0, 0.12)) continue;
      if (roundTo(1.1 * roundTo(trip, 0) + res + X, 0) !== roundTo(req, 0)) continue;
      const okv = rng.next() < 0.5, rr = roundTo(req, 0), F = rr + (okv ? 1 : -1) * rng.pick([6, 8, 10, 12, 15, 20]);
      if (F < 20) continue;
      const parts = [
        numPart("gs", "Ground speed", "Ground speed (kt)", gs, 0, `A headwind takes its speed off the TAS; a tailwind adds it. Read the prompt for which it is.`),
        numPart("t", "Flight time", "Flight time (min)", t, 0, "Distance ÷ ground speed gives hours; × 60 for minutes."),
        numPart("req", "Fuel required", "Total fuel required at departure (L)", req, 0, "Trip fuel plus 10% of the trip fuel, plus the reserve (burn rate for the reserve minutes), plus taxi fuel.", true),
        yesNo("ok", "Enough fuel?", `The tanks hold **${F} L**. Is that enough for the plan?`, okv, "Compare the fuel on board with the total required."),
      ];
      const ex = `**Ground speed:** ${tas} ${head ? "−" : "+"} ${Wc} (${head ? "headwind" : "tailwind"}) = **${gs} kt**.\n\n**Flight time:** ${D} ÷ ${gs} × 60 = **${t} min**.\n\n**Fuel required:** trip = ${B} × ${t} ÷ 60 = ${f(trip)} L; 10% extra = ${f(roundTo(0.1 * trip, 3))} L; reserve = ${B} × ${R} ÷ 60 = ${f(res)} L; taxi ${X} L. Total = ${f(roundTo(req, 3))}, which is **${rr} L**.\n\n**Enough?** ${F} L is ${okv ? "at least" : "less than"} ${rr} L: **${YN(okv)}**.`;
      return finish(
        `${fuelNote}\n\nA leg is **${D} nm** long. The aircraft's TAS is **${tas} kt** with a **${Wc} kt ${head ? "headwind" : "tailwind"}** along the track, and it burns **${B} L/h**. The plan is the trip fuel plus **10%** of it as contingency, plus a **${R}-minute** reserve at the same burn rate, plus **${X} L** taxi fuel. Round the total to the nearest litre.`,
        parts, ex, "pil-fuel3", { tier, tas, Wc, head, B, D, R, X, F }, [["_TAS", tas], ["_Wc", Wc], ["_D", D], ["_B", B], ["_R", R], ["_X", X], ["_F", F]],
        ["Ground speed first, then time, then the fuel pieces.", "The contingency is a percentage of the trip fuel only."],
      );
    }
    // expert-plus: endurance -> point of no return (radius of action) -> time to it -> verdict
    const V = rng.pick([100, 110, 120, 130, 140]), W = rng.pick([10, 15, 20, 25, 30]);
    const B = rng.pick([30, 36, 40, 45, 48, 50, 60]), R = rng.pick([30, 45]), E = rng.int(9, 24) * 10;
    const F = (B * (E + R)) / 60;
    if (!isEx(F, 0) || F > 220 || F < 60) continue;
    const go = V - W, gh = V + W;
    const x = (E / 60) * ((go * gh) / (go + gh)), xr = roundTo(x, 0);
    const tp = (x / go) * 60, tpr = (xr / go) * 60;
    if (x < 20 || nearHalf(x, 0, 0.12) || nearHalf(tp, 0, 0.12) || roundTo(tp, 0) !== roundTo(tpr, 0)) continue;
    const okv = rng.next() < 0.5, m = rng.pick([8, 10, 12, 15, 18, 22]);
    const D = xr + (okv ? -m : m);
    if (D < 20) continue;
    const parts = [
      numPart("end", "Endurance", "Flying time available after setting the reserve aside (min)", E, 0, "Fuel on board divided by the burn rate gives hours (× 60 for minutes); then take the reserve minutes away."),
      numPart("pnr", "Point of no return", "Furthest distance out from which it can still return (nm)", x, 0, "Out and back must use exactly the endurance. With ground speeds g₁ out and g₂ home, the furthest distance is endurance in hours × g₁ × g₂ ÷ (g₁ + g₂).", true),
      numPart("tp", "Time to the point", "Time to fly out to that point (min)", tp, 0, "Distance out ÷ the outbound ground speed, × 60 for minutes.", true),
      yesNo("ok", "Destination and back?", `The destination is **${D} nm** away on the same route. Can the aircraft fly there and back to the departure airfield without using the reserve?`, okv, "It can if the destination is no further than the furthest distance you found."),
    ];
    const ex = `**Endurance:** ${F} ÷ ${B} × 60 = ${(F / B) * 60} min, less the ${R}-minute reserve = **${E} min**.\n\n**Point of no return:** ground speeds ${go} kt out (headwind ${W} kt) and ${gh} kt home. Distance = ${E} ÷ 60 × ${go} × ${gh} ÷ (${go} + ${gh}) = ${f(roundTo(x, 2))}, which is **${xr} nm**.\n\n**Time out:** ${xr} ÷ ${go} × 60 = **${roundTo(tp, 0)} min**.\n\n**Destination:** ${D} nm is ${okv ? "no further than" : "further than"} ${xr} nm: **${YN(okv)}**.`;
    return finish(
      `${fuelNote}\n\nAn aircraft with a TAS of **${V} kt** carries **${F} L** and burns **${B} L/h**. It must keep a reserve of **${R} minutes** that is never planned for use. The wind is a steady **${W} kt** along the route: a headwind on the way out and so a tailwind on the way home. Round as each part says.`,
      parts, ex, "pil-fuel4", { tier, V, W, B, R, F, D }, [["_V", V], ["_W", W], ["_F", F], ["_B", B], ["_R", R], ["_D", D]],
      ["Endurance first, then the two ground speeds.", "The point of no return balances the time out against the time home."],
    );
  }
  return tooMany();
}

// ---------- chart-work ----------

const SCALES = [185200, 277800, 370400, 555600]; // 1 nm = 1852 m, so 1 cm on the chart = scale / 185200 nm
const nmPerCm = (s) => s / 185200;
const scaleTxt = (s) => `1:${String(s).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
const chartNote = "A chart distance is converted with the scale, and **1 nm = 1852 m**. Bearings are true, measured clockwise from north.";
const pn = (t) => (String(t).startsWith("-") ? `(−${String(t).slice(1)})` : String(t)); // negative in brackets
const sgn = (v, pos, neg) => (v >= 0 ? `${f(Math.abs(v))} ${pos}` : `${f(Math.abs(v))} ${neg}`);

function genChart(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const s = rng.pick(SCALES), k = nmPerCm(s), cm = rng.int(4, 60) / 2, nm = cm * k, gs = rng.pick([80, 90, 100, 110, 120, 130, 140, 150, 160]);
      const t = (nm / gs) * 60;
      if (!isEx(nm, 1) || nm < 8 || !isEx(t, 0) || t < 5) continue;
      const parts = [
        numPart("d", "Distance", "Distance on the ground (nm)", nm, 1, "Chart cm × scale = real cm. Convert to metres, then divide by 1852 for nautical miles."),
        numPart("t", "Time", "Time at the stated ground speed (min)", t, 0, "Time in hours = distance ÷ ground speed; × 60 for minutes."),
      ];
      const ex = `**Distance:** ${f(cm)} cm × ${s} = ${f(cm * s)} cm = ${f(cm * s / 100)} m; ÷ 1852 = **${f(nm)} nm**.\n\n**Time:** ${f(nm)} ÷ ${gs} × 60 = **${f(t)} min**.`;
      return finish(
        `${chartNote}\n\nOn a chart of scale **${scaleTxt(s)}**, a leg measures **${f(cm)} cm**. The aircraft's ground speed is **${gs} kt**.`,
        parts, ex, "pil-chart1", { tier, s, cm, gs }, [["_cm", cm], ["_scale", s], ["_GS", gs]],
        ["Scale first: centimetres on the chart become centimetres on the ground.", "Then nautical miles, then time."],
      );
    }
    if (tier === "hard") {
      const s = rng.pick(SCALES), k = nmPerCm(s), cm = rng.int(4, 40) / 2, nm = cm * k, gs = rng.pick([90, 100, 110, 120, 130, 140, 150]);
      const T = rng.int(2, 70) * 5, t = (nm / gs) * 60;
      if (T === 180 || T === 360 || !isEx(nm, 1) || nm < 8 || !isEx(t, 0) || t < 5) continue;
      const rb = T < 180 ? T + 180 : T - 180;
      const parts = [
        numPart("d", "Distance", "Distance on the ground (nm)", nm, 1, "Chart cm × scale = real cm. Convert to metres, then divide by 1852."),
        numPart("t", "Time", "Time at the stated ground speed (min)", t, 0, "Distance ÷ ground speed gives hours; × 60 for minutes."),
        numPart("rb", "Return track", "Track for the return leg, the reciprocal (degrees)", rb, 0, "The return track points the opposite way: 180° different from the outward track, staying between 0° and 360°."),
      ];
      const ex = `**Distance:** ${f(cm)} × ${s} ÷ 100 = ${f(cm * s / 100)} m; ÷ 1852 = **${f(nm)} nm**.\n\n**Time:** ${f(nm)} ÷ ${gs} × 60 = **${f(t)} min**.\n\n**Return track:** ${T} ${T < 180 ? "+" : "−"} 180 = **${rb}°**.`;
      return finish(
        `${chartNote}\n\nOn a chart of scale **${scaleTxt(s)}**, a leg on a track of **${fb(T)}** measures **${f(cm)} cm**. The ground speed is **${gs} kt**, and the aircraft then flies straight back.`,
        parts, ex, "pil-chart2", { tier, s, cm, gs, T }, [["_cm", cm], ["_scale", s], ["_GS", gs], ["_T", T]],
        ["Scale, then time, then the opposite direction.", "Add or subtract 180° so the answer stays in 0–360°."],
      );
    }
    if (tier === "expert") {
      const s = rng.pick([185200, 370400]), k = nmPerCm(s);
      const T1 = rng.int(2, 70) * 5, T2 = rng.int(2, 70) * 5;
      const c1 = rng.int(8, 40) / 2, c2 = rng.int(8, 40) / 2;
      if (T1 === 180 || T1 === 360 || T2 === 180 || T2 === 360) continue;
      const dd = Math.abs(((T1 - T2 + 540) % 360) - 180);
      if (dd < 40 || dd > 140) continue;
      const d1 = c1 * k, d2 = c2 * k;
      const N = d1 * Math.cos(T1 * D2R) + d2 * Math.cos(T2 * D2R), E = d1 * Math.sin(T1 * D2R) + d2 * Math.sin(T2 * D2R);
      if (Math.abs(N) < 8 || Math.abs(E) < 8 || nearHalf(N, 1, 0.1) || nearHalf(E, 1, 0.1)) continue;
      const dist = Math.hypot(E, N), b = wrap(Math.atan2(-E, -N) * R2D);
      const Nr = roundTo(N, 1), Er = roundTo(E, 1), distr = Math.hypot(Er, Nr), br = wrap(Math.atan2(-Er, -Nr) * R2D);
      if (nearHalf(dist, 0, 0.12) || nearHalf(b, 0, 0.12) || roundTo(dist, 0) !== roundTo(distr, 0) || roundTo(b, 0) !== roundTo(br, 0)) continue;
      if (b < 6 || b > 354) continue;
      const parts = [
        numPart("n", "Northward", "How far north of the start the aircraft now is (nm; negative if south)", N, 1, "Each leg's north part is its length × cos(track). Add the two. The length comes from the chart cm and the scale."),
        numPart("e", "Eastward", "How far east of the start it now is (nm; negative if west)", E, 1, "Each leg's east part is its length × sin(track). Add the two."),
        numPart("d", "Distance back", "Direct distance back to the start (nm)", dist, 0, "Pythagoras on the east and north parts.", true),
        numPart("b", "Bearing back", "Bearing of the direct track back to the start (degrees)", b, 0, "The way back points opposite to where it has gone: use the inverse tangent of (east ÷ north), choose the right quadrant, and the answer is the bearing of the start from here.", true),
      ];
      const ex = `**Leg lengths:** ${f(c1)} cm × ${k} = ${f(d1)} nm and ${f(c2)} cm × ${k} = ${f(d2)} nm.\n\n**North:** ${f(d1)} cos ${T1}° + ${f(d2)} cos ${T2}° = **${Nr.toFixed(1).replace("-", "−")} nm**.\n\n**East:** ${f(d1)} sin ${T1}° + ${f(d2)} sin ${T2}° = **${Er.toFixed(1).replace("-", "−")} nm**.\n\n**Distance back:** √(${pn(Er.toFixed(1))}² + ${pn(Nr.toFixed(1))}²) = **${roundTo(dist, 0)} nm**.\n\n**Bearing back:** the start lies ${sgn(-Nr, "nm north", "nm south")} and ${sgn(-Er, "nm east", "nm west")} of the aircraft, so the bearing is **${bear(b)}°**.`;
      return finish(
        `${chartNote}\n\nOn a chart of scale **${scaleTxt(s)}**, an aircraft flies two legs from point A: first on a track of **${fb(T1)}** for **${f(c1)} cm** of chart, then on a track of **${fb(T2)}** for **${f(c2)} cm**. Round as each part says.`,
        parts, ex, "pil-chart3", { tier, s, c1, c2, T1, T2 }, [["_c1", c1], ["_T1", T1], ["_c2", c2], ["_T2", T2], ["_scale", s]],
        ["Convert both legs to nautical miles, then split each into north and east parts.", "The start is in the opposite direction from the net movement."],
      );
    }
    // expert-plus: coordinates on a chart -> distance and track -> distance of a danger area from the track -> clearance verdict
    const s = rng.pick(SCALES), k = nmPerCm(s);
    const eb = rng.int(-30, 30) / 2, nb = rng.int(-30, 30) / 2, ep = rng.int(-30, 30) / 2, np = rng.int(-30, 30) / 2;
    const xb = eb * k, yb = nb * k, xp = ep * k, yp = np * k;
    const d = Math.hypot(xb, yb);
    if (d < 25 || d > 160 || ![xb, yb, xp, yp].every((v) => isEx(v, 1))) continue;
    const trk = wrap(Math.atan2(xb, yb) * R2D);
    const along = (xp * xb + yp * yb) / d;
    if (along < 0.2 * d || along > 0.8 * d) continue;
    const xt = Math.abs(xp * yb - yp * xb) / d, xtr = Math.abs(xp * yb - yp * xb) / roundTo(d, 0);
    if (xt < 3 || nearHalf(d, 0, 0.12) || nearHalf(trk, 0, 0.12) || nearHalf(xt, 0, 0.12) || roundTo(xt, 0) !== roundTo(xtr, 0)) continue;
    if (bear(trk) < 3 || bear(trk) > 357) continue;
    const okv = rng.next() < 0.5, rx = roundTo(xt, 0), Rq = rx + (okv ? -1 : 1) * rng.pick([2, 3, 4]);
    if (Rq < 2 || Math.abs(xt - Rq) < 1.2) continue;
    const parts = [
      numPart("d", "Distance A to B", "Distance from A to B (nm)", d, 0, "Convert the east and north chart distances to nm with the scale, then use Pythagoras.", true),
      numPart("trk", "Track A to B", "Track from A to B (degrees)", trk, 0, "Inverse tangent of (east ÷ north) gives an angle; check the quadrant to get the bearing from north.", true),
      numPart("xt", "Danger-area offset", "Shortest distance from the danger area's centre to the track line AB (nm)", xt, 0, "The offset is |east_P × north_B − north_P × east_B| ÷ AB (all in nm), or AP × sin of the angle between AP and AB.", true),
      yesNo("ok", "Clear of the area?", `The track must pass at least **${Rq} nm** from the centre of the area. Does it?`, okv, "Compare the offset you found with the required clearance."),
    ];
    const ex = `**A to B:** ${sgn(eb * k, "nm east", "nm west")} and ${sgn(nb * k, "nm north", "nm south")} (${pn(f(eb))} and ${pn(f(nb))} cm × ${k}), so d = √(${pn(f(xb))}² + ${pn(f(yb))}²) = **${roundTo(d, 0)} nm**.\n\n**Track:** the bearing of B from A is **${bear(trk)}°**.\n\n**Offset:** P is ${pn(f(xp))} nm east and ${pn(f(yp))} nm north of A (negative = west/south). Offset = |${pn(f(xp))} × ${pn(f(yb))} − ${pn(f(yp))} × ${pn(f(xb))}| ÷ ${roundTo(d, 0)} = **${rx} nm**.\n\n**Clear?** ${rx} nm is ${okv ? "at least" : "less than"} ${Rq} nm: **${YN(okv)}**.`;
    const pos = (v, a, b2) => (v >= 0 ? `${f(Math.abs(v))} cm ${a}` : `${f(Math.abs(v))} cm ${b2}`);
    return finish(
      `${chartNote}\n\nOn a chart of scale **${scaleTxt(s)}** (north is up), waypoint B is **${pos(eb, "east", "west")}** and **${pos(nb, "north", "south")}** of the departure point A. The centre of a danger area is **${pos(ep, "east", "west")}** and **${pos(np, "north", "south")}** of A. Round as each part says.`,
      parts, ex, "pil-chart4", { tier, s, eb, nb, ep, np, Rq }, [["_eB", eb], ["_nB", nb], ["_eP", ep], ["_nP", np], ["_scale", s], ["_R", Rq]],
      ["Turn the chart centimetres into nautical miles before anything else.", "The distance from a point to a line is measured at right angles to it."],
    );
  }
  return tooMany();
}

// ---------- eta-descent ----------

const OFFS = [-480, -420, -360, -300, -240, -180, -120, -60, 60, 120, 180, 240, 300, 360, 480, 540];
const OFFS_HALF = [...OFFS, -210, 210, 330, 570, -150];
const clockNote = "Times use the 24-hour clock. Each place keeps a fixed offset from UTC all year (no daylight saving), so local time = UTC + the offset.";

function genEta(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const dep = rng.int(36, 156) * 5, ft = rng.int(7, 34) * 10, off = rng.pick(OFFS);
      const arr = dep + ft, loc = arr + off;
      if (arr >= 1440 || loc < 0 || loc >= 1440) continue;
      const parts = [
        timePart("utc", "Arrival in UTC", "Arrival time in UTC", arr, "Add the flight time to the departure time, carrying minutes into hours."),
        timePart("loc", "Local arrival", "Local arrival time at the destination", loc, "Add the destination's offset to the UTC arrival time. A negative offset takes hours off."),
      ];
      const ex = `**Arrival UTC:** ${hhmm(dep)} + ${hm(ft)} = **${hhmm(arr)}**.\n\n**Local time:** ${hhmm(arr)} ${off < 0 ? "−" : "+"} ${Math.abs(off) / 60} h (${offText(off)}) = **${hhmm(loc)}**.`;
      return finish(
        `${clockNote}\n\nAn aircraft departs at **${hhmm(dep)} UTC** and the flight takes **${hm(ft)}**. The destination is at **${offText(off)}**.`,
        parts, ex, "pil-eta1", { tier, dep, ft, off }, [["_dep", dep], ["_ft", ft], ["_off", off / 60]],
        ["UTC first: add the flight time.", "Then change from UTC to local with the offset."],
      );
    }
    if (tier === "hard") {
      const dep = rng.int(36, 144) * 5, gs = rng.pick([120, 150, 180, 210, 240, 300, 360, 420]), t = rng.int(10, 34) * 10, off = rng.pick(OFFS);
      const D = (gs * t) / 60, arr = dep + t, loc = arr + off;
      if (!isEx(D, 0) || D < 40 || arr >= 1440 || loc < 0 || loc >= 1440) continue;
      const parts = [
        numPart("t", "Flight time", "Flight time (min)", t, 0, "Distance ÷ ground speed gives hours; × 60 for minutes."),
        timePart("utc", "Arrival in UTC", "Arrival time in UTC", arr, "Add the flight time in minutes to the departure time."),
        timePart("loc", "Local arrival", "Local arrival time at the destination", loc, "Apply the destination's offset to the UTC arrival."),
      ];
      const ex = `**Flight time:** ${D} ÷ ${gs} × 60 = **${t} min** (${hm(t)}).\n\n**Arrival UTC:** ${hhmm(dep)} + ${hm(t)} = **${hhmm(arr)}**.\n\n**Local:** ${hhmm(arr)} ${off < 0 ? "−" : "+"} ${Math.abs(off) / 60} h = **${hhmm(loc)}**.`;
      return finish(
        `${clockNote}\n\nAn aircraft departs at **${hhmm(dep)} UTC** and flies **${D} nm** at a ground speed of **${gs} kt**. The destination is at **${offText(off)}**.`,
        parts, ex, "pil-eta2", { tier, dep, gs, D, off }, [["_dep", dep], ["_D", D], ["_GS", gs], ["_off", off / 60]],
        ["Time from distance and speed first.", "Then UTC, then local."],
      );
    }
    if (tier === "expert") {
      const oa = rng.pick(OFFS_HALF), ob = rng.pick(OFFS_HALF);
      if (oa === ob) continue;
      const depL = rng.int(60, 180) * 5, dep = depL - oa;
      const gs = rng.pick([120, 150, 180, 210, 240, 300, 360, 420]), t = rng.int(10, 40) * 10, D = (gs * t) / 60;
      const arrU = dep + t, arrL = arrU + ob;
      if (!isEx(D, 0) || D < 40 || dep < 0 || arrU >= 1440 || arrL < 0 || arrL >= 1440) continue;
      const okv = rng.next() < 0.5, cur = arrL + (okv ? 1 : -1) * rng.pick([10, 15, 20, 25, 30, 40]);
      if (cur <= 0 || cur >= 1440) continue;
      const parts = [
        timePart("dep", "Departure in UTC", "Departure time in UTC", dep, "Local time = UTC + offset, so UTC = local time − the departure offset."),
        numPart("t", "Flight time", "Flight time (min)", t, 0, "Distance ÷ ground speed, × 60 for minutes."),
        timePart("arr", "Local arrival", "Arrival time, local at the destination", arrL, "Add the flight time to the UTC departure, then apply the destination offset."),
        yesNo("ok", "Before the curfew?", `The destination airport closes to arrivals at **${hhmm(cur)} local**. The aircraft must land before that. Does it?`, okv, "Compare the local arrival time with the closing time."),
      ];
      const ex = `**Departure UTC:** ${hhmm(depL)} ${oa < 0 ? "+" : "−"} ${Math.abs(oa) / 60} h = **${hhmm(dep)}**.\n\n**Flight time:** ${D} ÷ ${gs} × 60 = **${t} min** (${hm(t)}).\n\n**Local arrival:** ${hhmm(dep)} + ${hm(t)} = ${hhmm(arrU)} UTC; ${offText(ob)} gives **${hhmm(arrL)}**.\n\n**Before ${hhmm(cur)}?** ${hhmm(arrL)} is ${okv ? "before" : "not before"} it: **${YN(okv)}**.`;
      return finish(
        `${clockNote}\n\nAn aircraft departs at **${hhmm(depL)} local** from a place at **${offText(oa)}**. It flies **${D} nm** at a ground speed of **${gs} kt** to a place at **${offText(ob)}**.`,
        parts, ex, "pil-eta3", { tier, depL, oa, ob, gs, D, cur }, [["_depL", depL], ["_oa", oa / 60], ["_D", D], ["_GS", gs], ["_ob", ob / 60], ["_cur", cur]],
        ["Go through UTC: local departure to UTC, then add the flight, then to local arrival.", "Some offsets include 30 minutes."],
      );
    }
    // expert-plus: ground speed from TAS and wind -> descent time -> top of descent -> verdict
    const tas = rng.pick([100, 110, 120, 130, 140, 150, 160, 180]), Wc = rng.pick([10, 15, 20, 25, 30]), head = rng.next() < 0.5;
    const gs = head ? tas - Wc : tas + Wc;
    const rate = rng.pick([300, 400, 500, 600, 800]), cruise = rng.int(10, 19) * 500, target = rng.int(2, 6) * 500;
    const lose = cruise - target, t = lose / rate, tod = (t / 60) * gs;
    if (lose < 3000 || !isEx(t, 1) || t < 5 || nearHalf(tod, 1, 0.15)) continue;
    const okv = rng.next() < 0.5, todr = roundTo(tod, 1), X = Math.round(tod) + (okv ? 1 : -1) * rng.pick([3, 4, 5, 6, 8, 10]);
    if (X < 5 || Math.abs(X - tod) < 2) continue;
    const parts = [
      numPart("gs", "Descent ground speed", "Ground speed in the descent (kt)", gs, 0, "A headwind takes its speed off the TAS; a tailwind adds it. Read the prompt for which it is."),
      numPart("t", "Descent time", "Time to descend (min)", t, 1, "Height to lose = cruise altitude − target altitude. Divide by the rate of descent."),
      numPart("tod", "Top of descent", "Distance before the target point at which the descent must start (nm)", tod, 1, "Distance = ground speed × time in hours, so the descent minutes ÷ 60 first."),
      yesNo("ok", "Still before the top of descent?", `The aircraft is now **${X} nm** from the target point and still at cruise altitude. Is it still before the top of descent, so it can stay at cruise a little longer?`, okv, "It is still before the top of descent if it is further from the target than the distance you found."),
    ];
    const ex = `**Ground speed:** ${tas} ${head ? "−" : "+"} ${Wc} (${head ? "headwind" : "tailwind"}) = **${gs} kt**.\n\n**Descent time:** (${cruise} − ${target}) ÷ ${rate} = ${lose} ÷ ${rate} = **${f(t)} min**.\n\n**Top of descent:** ${f(t)} ÷ 60 × ${gs} = **${todr.toFixed(1)} nm** before the target.\n\n**Still before it?** ${X} nm is ${okv ? "more than" : "less than"} ${todr.toFixed(1)} nm: **${YN(okv)}**.`;
    return finish(
      `${NOTE}\n\nAn aircraft cruises at **${cruise} ft** and must be at **${target} ft** over a target point. It descends at a steady **${rate} ft/min**, with a TAS of **${tas} kt** and a **${Wc} kt ${head ? "headwind" : "tailwind"}** along the track. Work out when the descent must begin. Round as each part says.`,
      parts, ex, "pil-eta4", { tier, tas, Wc, head, rate, cruise, target, X }, [["_TAS", tas], ["_Wc", Wc], ["_rate", rate], ["_cruise", cruise], ["_target", target], ["_X", X]],
      ["Height to lose, then time, then distance.", "Use the ground speed, not the TAS, for the distance."],
    );
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "wind-triangle") return genWind(rng, difficulty);
  if (subtopic === "fuel-planning") return genFuel(rng, difficulty);
  if (subtopic === "chart-work") return genChart(rng, difficulty);
  if (subtopic === "eta-descent") return genEta(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (the heading by bisection on the
// vector sum, TAS by bisecting that same solver, positions by sin/cos sums, offsets by an angle, times by
// minutes modulo a day). Numbers are compared with the rounded truth; choices and times exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const timeMins = (s) => {
  const m = /^(\d{1,2})\s*[:.]?\s*(\d{2})$/.exec(String(s).replace("−", "-").trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
};
const yn = (b) => (b ? "Yes" : "No");

const ALT = {
  "pil-wind1": (p) => { const s = windSolve(p.T, p.tas, p.W, p.Wd); return { gs: s.gs, t: (p.D / s.gs) * 60 }; },
  "pil-wind2": (p) => { const s = windSolve(p.T, p.tas, p.W, p.Wd); return { wca: Math.abs(s.wca), hdg: wrap(s.h), gs: s.gs }; },
  "pil-wind3": (p) => { const s = windSolve(p.T, p.tas, p.W, p.Wd); return { wca: Math.abs(s.wca), hdg: wrap(s.h), gs: s.gs, t: (p.D / s.gs) * 60 }; },
  "pil-wind4": (p) => {
    const gsReq = (p.D / p.M) * 60;
    // along-track component by projecting the wind-to vector on the track direction
    const wx = p.W * Math.sin((p.Wd + 180) * D2R), wy = p.W * Math.cos((p.Wd + 180) * D2R);
    const ux = Math.sin(p.T * D2R), uy = Math.cos(p.T * D2R);
    const hw = -(wx * ux + wy * uy);
    let lo = p.W + 0.01, hi = 700; // TAS that gives the required ground speed (ground speed rises with TAS)
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (windSolve(p.T, mid, p.W, p.Wd).gs < gsReq) lo = mid; else hi = mid; }
    const tas = (lo + hi) / 2;
    return { gs: gsReq, hw, tas, verdict: `${hw > 0 ? "Headwind" : "Tailwind"} | ${yn(tas <= p.Vmax)}` };
  },
  "pil-fuel1": (p) => { const t = (p.D / p.gs) * 60; return { t, fuel: (p.B / 60) * t }; },
  "pil-fuel2": (p) => { const t = (p.D / p.gs) * 60, fuel = (p.B / 60) * t; return { t, fuel, total: fuel + (p.B / 60) * p.R + p.X }; },
  "pil-fuel3": (p) => {
    const gs = p.head ? p.tas - p.Wc : p.tas + p.Wc, t = (p.D / gs) * 60;
    const req = (p.B / 60) * (t * 1.1 + p.R) + p.X;
    return { gs, t, req, ok: yn(p.F >= roundTo(req, 0)) };
  },
  "pil-fuel4": (p) => {
    const go = p.V - p.W, gh = p.V + p.W, Emin = (p.F / p.B) * 60 - p.R;
    // out and back use the whole endurance: x/go + x/gh = Emin/60
    const x = (Emin / 60) / (1 / go + 1 / gh);
    return { end: Emin, pnr: x, tp: (x / go) * 60, ok: yn(p.D / go + p.D / gh <= Emin / 60 + 1e-9) };
  },
  "pil-chart1": (p) => { const nm = (p.cm * p.s) / 185200; return { d: nm, t: (nm / p.gs) * 60 }; },
  "pil-chart2": (p) => { const nm = (p.cm * p.s) / 185200; return { d: nm, t: (nm / p.gs) * 60, rb: wrap(p.T + 180) }; },
  "pil-chart3": (p) => {
    const k = p.s / 185200, a = p.c1 * k, b = p.c2 * k;
    const N = a * Math.cos(p.T1 * D2R) + b * Math.cos(p.T2 * D2R), E = a * Math.sin(p.T1 * D2R) + b * Math.sin(p.T2 * D2R);
    // bearing back through the direction of the start seen from the aircraft
    let back = Math.atan2(-E, -N) * R2D; if (back < 0) back += 360;
    return { n: N, e: E, d: Math.sqrt(N * N + E * E), b: back };
  },
  "pil-chart4": (p) => {
    const k = p.s / 185200, B = [p.eb * k, p.nb * k], P = [p.ep * k, p.np * k];
    const d = Math.hypot(B[0], B[1]);
    const trk = wrap(Math.atan2(B[0], B[1]) * R2D);
    // offset as AP times the sine of the angle between the bearings of AP and AB
    const bp = Math.atan2(P[0], P[1]) * R2D;
    const xt = Math.hypot(P[0], P[1]) * Math.abs(Math.sin((bp - trk) * D2R));
    return { d, trk, xt, ok: yn(xt >= p.Rq) };
  },
  "pil-eta1": (p) => ({ utc: (p.dep + p.ft) % 1440, loc: (p.dep + p.ft + p.off + 1440) % 1440 }),
  "pil-eta2": (p) => { const t = (p.D / p.gs) * 60; return { t, utc: (p.dep + t) % 1440, loc: (p.dep + t + p.off + 1440) % 1440 }; },
  "pil-eta3": (p) => {
    const t = (p.D / p.gs) * 60, dep = (p.depL - p.oa + 1440) % 1440, arr = (dep + t + p.ob + 1440) % 1440;
    return { dep, t, arr, ok: yn(arr < p.cur) };
  },
  "pil-eta4": (p) => {
    const gs = p.head ? p.tas - p.Wc : p.tas + p.Wc, t = (p.cruise - p.target) / p.rate, tod = gs * (t / 60);
    return { gs, t, tod, ok: yn(p.X > tod) };
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
      const tr = part.id === "hdg" || part.id === "rb" || part.id === "b" || part.id === "trk" ? (() => { const r = roundTo(tv, dp); return r === 0 ? 360 : r; })() : roundTo(tv, dp);
      if (!near(partNum(answer, part.id), tr, tolOf(dp))) return false;
    } else if (part.answerType === "text") {
      if (timeMins(partStr(answer, part.id)) !== Math.round(tv)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
