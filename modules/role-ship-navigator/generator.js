// Ship Navigator role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact, or (where a rounded earlier answer is asked for) redrawn until working from
// the rounded value gives the same later answer. No answer sits on a rounding half-step, and verdict parts
// are decided first and then fitted, clear of the threshold. All vessels, places and figures are made up
// for arithmetic practice: speeds in knots, distances in nautical miles (1 nm = 1852 m), bearings true,
// fixed UTC offsets (no daylight saving). Nothing here is a chart, a tide table or a rule of the road.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   passage-plan      time at sea -> trip fuel -> ETA in another zone -> reserve and bunkers; expert-plus: slow steaming (cube rule)
//   set-drift         current along the course -> at right angles -> general angle; expert-plus: course to steer for a track
//   tide-heights      rule of twelfths: range, height, under-keel clearance, safe?; expert-plus: earliest time over a bar
//   closest-approach  head-on / overtaking -> right-angle crossing -> general courses (components); expert-plus: from two radar plots

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
const tooMany = () => { throw new Error("role-ship-navigator: no suitable draw"); };
const YN = (b) => (b ? "Yes" : "No");
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const wrap = (x) => ((x % 360) + 360) % 360;
const bear = (x) => { const r = Math.round(wrap(x)); return r === 0 ? 360 : r; }; // 1..360
const b3 = (n) => String(n).padStart(3, "0");
const fb = (x) => `${b3(bear(x))}°`;
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
const offText = (m) => { const a = Math.abs(m); return `UTC${m < 0 ? "−" : "+"}${Math.floor(a / 60)}${a % 60 ? ":" + pad2(a % 60) : ""}`; };
const hm = (m) => `${Math.floor(m / 60)} h ${pad2(m % 60)} min`;
const brg = (e, n) => wrap(Math.atan2(e, n) * R2D);
const sgn = (x) => (x < 0 ? "−" : "+");

const BEARING_IDS = ["cmg", "course", "tcourse"];
function numPart(id, label, ask, val, dp, hint, rnd = false) {
  if (BEARING_IDS.includes(id)) val = bear(val);
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
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
const pick2 = (rng, a) => a[rng.int(0, a.length - 1)];

const NOTE = "Speeds are in knots (kt), distances in nautical miles (nm, 1 nm = 1852 m) and bearings are true, in degrees clockwise from north. The ships and places are made up.";
const VESSELS = ["MV Calder", "MV Harbour Lark", "the ferry Tern", "MV Northern Reach", "the supply ship Pelican", "MV Saltmarsh", "the coaster Merrow"];
const ROUTES = [["Port Alder", "Cape Wren"], ["Marlow Quay", "Skerry Point"], ["Fenwick Harbour", "Gull Island"], ["Dunmere", "Port Calloway"], ["Brandy Bay", "Tern Head"]];
const PORTS = ["Port Alder", "Marlow Quay", "Fenwick Harbour", "Dunmere", "Brandy Bay", "Skerry Point"];

// ---------- passage-plan ----------

function genPassage(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const ves = rng.pick(VESSELS), [A, B] = rng.pick(ROUTES);
    if (tier === "expert-plus") {
      const [a, b] = rng.pick([[4, 3], [5, 4], [3, 2], [6, 5]]), k = rng.pick([3, 4, 5]);
      const v0 = a * k, v = b * k, r0 = rng.pick([2.4, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0]), D = rng.int(6, 24) * 10;
      const rate = r0 * (v / v0) ** 3, fuel = (rate * D) / v, full = (r0 * D) / v0, saved = full - fuel, t = (D / v) * 60;
      if (nearHalf(rate, 2, 0.1) || nearHalf(fuel, 1, 0.1) || nearHalf(saved, 1, 0.1)) continue;
      if (roundTo((roundTo(rate, 2) * D) / v, 1) !== roundTo(fuel, 1)) continue;
      if (roundTo(full - roundTo(fuel, 1), 1) !== roundTo(saved, 1)) continue;
      const W = wantOk ? Math.ceil(t / 5) * 5 + rng.pick([10, 15, 20, 30]) : Math.floor(t / 5) * 5 - rng.pick([10, 15, 20, 30]);
      if (W < 60) continue;
      const ok = t <= W;
      const parts = [
        numPart("rate", "Burn rate", "Fuel burned per hour at the reduced speed (t/h)", rate, 2, "Use the rule: the burn rate is the full-speed rate × (reduced speed ÷ full speed) cubed."),
        numPart("fuel", "Trip fuel", "Fuel burned on the whole passage at the reduced speed (t)", fuel, 1, "Time at the reduced speed is distance ÷ speed in hours; trip fuel = burn rate × hours."),
        numPart("saved", "Fuel saved", "Fuel saved compared with going at full speed (t)", saved, 1, "Find the trip fuel at full speed the same way (full-speed rate × distance ÷ full speed), then subtract."),
        yesNo("ok", "In time?", `Does the ship reach the berth within the window, **${hm(W)}** after departure, at the reduced speed?`, ok, "Passage time in minutes is distance ÷ speed × 60. Compare it with the window."),
      ];
      const ex = `**Burn rate:** ${r0} × (${v} ÷ ${v0})³ = **${f(roundTo(rate, 2))} t/h**.\n\n**Trip fuel:** ${D} ÷ ${v} = ${f(roundTo(D / v, 3))} h, so ${f(roundTo(rate, 2))} × ${f(roundTo(D / v, 3))} = **${f(roundTo(fuel, 1))} t**.\n\n**Saved:** at full speed ${r0} × ${D} ÷ ${v0} = ${f(roundTo(full, 2))} t, so ${f(roundTo(full, 2))} − ${f(roundTo(fuel, 1))} = **${f(roundTo(saved, 1))} t**.\n\n**In time:** ${D} ÷ ${v} × 60 = ${f(roundTo(t, 1))} min against ${W} min: **${YN(ok)}**.`;
      return finish(
        `${NOTE}\n\n${ves} must make a passage of **${D} nm** from ${A} to ${B}. At its full speed of **${v0} kt** it burns **${f(r0)} t/h** of fuel. To save fuel the master slows to **${v} kt**. Rule for this exercise: fuel burned per hour is proportional to the **cube of the speed**, so the burn rate at speed v is full-speed rate × (v ÷ full speed)³. The berth window closes **${hm(W)}** after departure.`,
        parts, ex, "sn-pl4", { tier, v0, v, r0, D, W }, [["_V0", v0], ["_V", v], ["_R0", r0], ["_D", D], ["_W", W]],
        ["The burn rate falls fast when the speed drops, but the passage takes longer.", "Rate first, then time, then fuel for the whole passage."],
      );
    }
    const s = rng.pick([10, 12, 14, 15, 16, 18, 20, 22]), t = rng.int(10, 60) * 5, D = (s * t) / 60;
    const Br = rng.int(6, 30) / 10, fuel = (Br * t) / 60;
    if (!isEx(D, 0) || D < 15 || !isEx(fuel, 1)) continue;
    const pT = numPart("t", "Time at sea", "Time at sea (minutes)", t, 0, "Time in hours = distance ÷ speed; multiply by 60 for minutes.");
    const pF = numPart("fuel", "Trip fuel", "Fuel burned on the passage (t)", fuel, 1, "Fuel = burn rate × time in hours, so turn the minutes into hours first.");
    const exT = `**Time at sea:** ${D} ÷ ${s} × 60 = **${t} min**.`, exF = `**Trip fuel:** ${f(Br)} × ${t} ÷ 60 = **${f(roundTo(fuel, 1))} t**.`;
    const base = `${NOTE}\n\n${ves} steams **${D} nm** from ${A} to ${B} at **${s} kt**, burning **${f(Br)} t/h** of fuel (tonnes per hour).`;
    if (tier === "medium") {
      return finish(base, [pT, pF], `${exT}\n\n${exF}`, "sn-pl1", { tier, D, s, Br }, [["_D", D], ["_S", s], ["_B", Br]],
        ["Find the time first.", "Fuel = burn per hour × hours."]);
    }
    const oa = rng.pick([-60, 0, 60, 120, 180, 240, 330]), df = rng.pick([-120, -60, 60, 120, 180]), ob = oa + df;
    const dep = rng.int(0, 287) * 5;
    const arr = ((dep + t + df) % 1440 + 1440) % 1440;
    const zoneTxt = `${ves} leaves ${A} at **${hhmm(dep)}** local time (${offText(oa)}). ${B} keeps ${offText(ob)}.`;
    const pA = timePart("arr", "Arrival", `Arrival time at ${B}, local time there`, arr, "Add the time at sea to the departure time, then add the difference between the two zones (positive when the destination is further east).");
    const exA = `**Arrival:** ${hhmm(dep)} + ${hm(t)} = ${hhmm(dep + t)} in ${A}'s time; ${B} is ${f(df / 60)} h ${df > 0 ? "ahead" : "behind"}, so **${hhmm(arr)}** local.`;
    if (tier === "hard") {
      return finish(`${base} ${zoneTxt}`, [pT, pF, pA], `${exT}\n\n${exF}\n\n${exA}`, "sn-pl2", { tier, D, s, Br, dep, df }, [["_D", D], ["_S", s], ["_B", Br]],
        ["Time at sea, then fuel, then the clock.", "Two zones: the clock at the destination is ahead of or behind the departure clock by the offset difference."]);
    }
    // expert: reserve and bunkers
    const R = rng.pick([10, 15, 20, 25]), need = fuel * (1 + R / 100);
    if (nearHalf(need, 1, 0.1)) continue;
    const bunk = wantOk ? Math.ceil(need) + rng.int(1, 5) : Math.floor(need) - rng.int(1, 5);
    if (bunk < 2) continue;
    const ok = bunk >= need;
    const parts = [pT,
      numPart("need", "Fuel to carry", "Fuel the ship must carry for the passage including the reserve (t)", need, 1, `Trip fuel plus a reserve of ${R}% of the trip fuel: multiply the trip fuel by ${f(1 + R / 100)}.`),
      pA,
      yesNo("ok", "Enough fuel?", `The ship has **${bunk} t** of fuel on board. Is that at least the fuel it must carry?`, ok, "Compare the fuel on board with the fuel to carry."),
    ];
    const ex = `${exT}\n\n**Fuel to carry:** trip fuel ${f(roundTo(fuel, 1))} t plus ${R}% = ${f(roundTo(fuel, 1))} × ${f(1 + R / 100)} = **${f(roundTo(need, 1))} t**.\n\n${exA}\n\n**Enough:** ${bunk} t is ${ok ? "at least" : "less than"} ${f(roundTo(need, 1))} t: **${YN(ok)}**.`;
    return finish(`${base} ${zoneTxt} The ship must carry the trip fuel plus a reserve of **${R}%** of the trip fuel.`,
      parts, ex, "sn-pl3", { tier, D, s, Br, dep, df, R, bunk }, [["_D", D], ["_S", s], ["_B", Br], ["_R", R], ["_Fuel", bunk]],
      ["Time, then trip fuel (you need it for the reserve), then the clock.", "The verdict compares the fuel on board with the fuel to carry."]);
  }
  return tooMany();
}

// ---------- set-drift ----------
// The current's "set" is the direction it flows TOWARD; "drift" is its speed. Ground vector = water vector + current vector.

const cur = (S, r) => [r * Math.sin(S * D2R), r * Math.cos(S * D2R)];
const sideWord = (side) => (side > 0 ? "right (starboard)" : "left (port)");

function genDrift(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const ves = rng.pick(VESSELS), side = rng.next() < 0.5 ? 1 : -1;
    if (tier === "medium") {
      const s = rng.pick([10, 12, 14, 15, 16, 18, 20]), r = rng.pick([1, 2, 3, 4, 5]), C = rng.int(1, 35) * 10, fair = rng.next() < 0.5;
      const S = fair ? C : wrap(C + 180), gs = fair ? s + r : s - r, t = rng.int(6, 48) * 5, D = (gs * t) / 60;
      if (!isEx(D, 0) || D < 10) continue;
      const parts = [
        numPart("gs", "Speed over the ground", "Speed over the ground (kt)", gs, 0, "A current setting the way the ship is heading adds its drift to the water speed; one setting against it takes it off."),
        numPart("t", "Time for the leg", "Time to cover the distance over the ground (minutes)", t, 0, "Time in hours = distance ÷ speed over the ground; × 60 for minutes."),
      ];
      const ex = `**Over the ground:** the current sets toward ${fb(S)}, ${fair ? "the same way the ship heads" : "against the heading"}, so ${s} ${fair ? "+" : "−"} ${r} = **${gs} kt**.\n\n**Time:** ${D} ÷ ${gs} × 60 = **${t} min**.`;
      return finish(`${NOTE} A current's **set** is the direction it flows toward and its **drift** is its speed.\n\n${ves} steers **${fb(C)}** at a water speed of **${s} kt**. The current has a set of **${fb(S)}** and a drift of **${r} kt**. The ship must cover **${D} nm** over the ground along the same line.`,
        parts, ex, "sn-sd1", { tier, C, s, S, r, D }, [["_S", s], ["_R", r], ["_D", D]],
        ["Is the current helping or opposing the ship? Then add or subtract.", "Time = distance ÷ ground speed."]);
    }
    if (tier === "hard") {
      const s = rng.pick([10, 12, 14, 15, 16, 18, 20]), r = rng.pick([1.5, 2, 2.5, 3, 3.5, 4]), C = rng.int(1, 35) * 10, T = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
      if (r / s < 0.1 || r / s > 0.36) continue;
      const S = wrap(C + side * 90), gs = Math.hypot(s, r), ang = Math.atan(r / s) * R2D, cmg = C + side * ang, off = r * T;
      if (nearHalf(gs, 1, 0.1) || nearHalf(ang, 0, 0.12) || nearHalf(cmg, 0, 0.12)) continue;
      const parts = [
        numPart("gs", "Speed over the ground", "Speed over the ground (kt)", gs, 1, "The current is at right angles to the heading, so the water speed and the drift are the two short sides of a right triangle: Pythagoras."),
        numPart("cmg", "Course made good", "Course made good (degrees, 3 figures)", cmg, 0, `The ship is carried to the ${sideWord(side)} of its heading. The angle between heading and track has tan = drift ÷ water speed; ${side > 0 ? "add" : "subtract"} it.`, true),
        numPart("off", "Offset after the time", `Distance the current has carried the ship off its steered line after ${f(T)} h (nm)`, off, 1, "Across the steered line the ship moves at the drift speed, so distance = drift × hours."),
      ];
      const ex = `**Over the ground:** √(${s}² + ${f(r)}²) = **${f(roundTo(gs, 1))} kt**.\n\n**Course made good:** tan⁻¹(${f(r)} ÷ ${s}) = ${f(roundTo(ang, 1))}°, to the ${side > 0 ? "right" : "left"}: ${C} ${sgn(side)} ${f(roundTo(ang, 1))} = **${b3(bear(cmg))}°**.\n\n**Offset:** ${f(r)} × ${f(T)} = **${f(roundTo(off, 1))} nm**.`;
      return finish(`${NOTE} A current's **set** is the direction it flows toward and its **drift** is its speed.\n\n${ves} steers **${fb(C)}** at a water speed of **${s} kt**. The current has a set of **${fb(S)}** (at right angles to the heading) and a drift of **${f(r)} kt**.`,
        parts, ex, "sn-sd2", { tier, C, s, S, r, T }, [["_S", s], ["_R", r], ["_T", T]],
        ["Draw the water vector and the current vector at right angles; the ground vector joins them.", "Speed, then direction, then the sideways offset."]);
    }
    if (tier === "expert") {
      const s = rng.pick([10, 12, 14, 15, 16, 18, 20, 22]), r = rng.pick([2, 2.5, 3, 3.5, 4, 5]), th = rng.pick([30, 40, 45, 50, 60, 120, 130, 135, 140, 150]);
      const C = rng.int(1, 35) * 10, D = rng.int(4, 24) * 5;
      if (r / s > 0.35) continue;
      const S = wrap(C + side * th), al = r * Math.cos(th * D2R), cr = r * Math.sin(th * D2R);
      const gs = Math.hypot(s + al, cr), ang = Math.atan2(cr, s + al) * R2D, cmg = C + side * ang;
      const t = (D / gs) * 60, off = (r * t) / 60;
      if (nearHalf(gs, 1, 0.1) || nearHalf(cmg, 0, 0.12) || nearHalf(t, 0, 0.12) || nearHalf(off, 1, 0.1)) continue;
      const tR = (D / roundTo(gs, 1)) * 60;
      if (roundTo(tR, 0) !== roundTo(t, 0) || roundTo((r * roundTo(t, 0)) / 60, 1) !== roundTo(off, 1)) continue;
      const parts = [
        numPart("gs", "Speed over the ground", "Speed over the ground (kt)", gs, 1, "Split the current into a part along the heading, drift × cos(θ), and a part across it, drift × sin(θ). Then ground speed = √((water speed + along)² + across²)."),
        numPart("cmg", "Course made good", "Course made good (degrees, 3 figures)", cmg, 0, `θ is the angle between the heading and the set. The across part pushes the ship to the ${sideWord(side)}: the track angle is tan⁻¹(across ÷ (water speed + along)), ${side > 0 ? "added to" : "taken from"} the heading.`, true),
        numPart("t", "Time for the leg", "Time to cover the distance along the course made good (minutes)", t, 0, "Distance ÷ speed over the ground gives hours; × 60 for minutes.", true),
        numPart("off", "Offset from the DR position", "Distance between the ship's dead-reckoning position (no current) and its real position at the end of the leg (nm)", off, 1, "Over the whole leg the current carries the ship at its drift speed, so distance = drift × hours (use the time in hours)."),
      ];
      const ex = `**Components:** the set ${fb(S)} is ${th}° to the ${side > 0 ? "right" : "left"} of the heading ${fb(C)}. Along = ${f(r)} × cos ${th}° = ${f(roundTo(al, 2))} kt; across = ${f(r)} × sin ${th}° = ${f(roundTo(cr, 2))} kt.\n\n**Over the ground:** √((${s} ${sgn(al)} ${f(roundTo(Math.abs(al), 2))})² + ${f(roundTo(cr, 2))}²) = **${f(roundTo(gs, 1))} kt**.\n\n**Course made good:** tan⁻¹(${f(roundTo(cr, 2))} ÷ ${f(roundTo(s + al, 2))}) = ${f(roundTo(ang, 1))}°, so ${C} ${sgn(side)} ${f(roundTo(ang, 1))} = **${b3(bear(cmg))}°**.\n\n**Time:** ${D} ÷ ${f(roundTo(gs, 1))} × 60 = **${Math.round(t)} min**.\n\n**Offset:** ${f(r)} × ${Math.round(t)} ÷ 60 = **${f(roundTo(off, 1))} nm**.`;
      return finish(`${NOTE} A current's **set** is the direction it flows toward and its **drift** is its speed.\n\n${ves} steers **${fb(C)}** at a water speed of **${s} kt**. The current has a set of **${fb(S)}** and a drift of **${f(r)} kt**. Let θ be the angle between the heading and the set. The ship must cover **${D} nm** over the ground along its course made good. Round as each part says.`,
        parts, ex, "sn-sd3", { tier, C, s, S, r, D }, [["_S", s], ["_R", r], ["_D", D]],
        ["Work out θ from the two bearings first.", "Along and across parts of the current, then speed, course, time, offset."]);
    }
    // expert-plus: course to steer to make good a stated track
    const r = rng.pick([1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]), s = rng.pick([10, 12, 14, 15, 16, 18, 20, 22, 24]), th = rng.pick([30, 45, 60, 120, 135, 150]);
    const T = rng.int(1, 35) * 10, D = rng.int(4, 30) * 5;
    if (r / s > 0.35) continue;
    const S = wrap(T + side * th), al = r * Math.cos(th * D2R), cr = r * Math.sin(th * D2R), wca = Math.asin(cr / s) * R2D;
    const course = T - side * wca, gs = s * Math.cos(wca * D2R) + al, t = (D / gs) * 60;
    if (gs < 4 || nearHalf(al, 1, 0.12) || nearHalf(course, 0, 0.12) || nearHalf(gs, 0, 0.12)) continue;
    const gsR = s * Math.cos(wca * D2R) + roundTo(al, 1);
    if (roundTo(gsR, 0) !== roundTo(gs, 0)) continue;
    const m = rng.pick([4, 6, 8, 10, 12]), M = wantOk ? Math.ceil(t) + m : Math.floor(t) - m;
    if (M < 20) continue;
    const ok = t <= M, tR = (D / roundTo(gs, 0)) * 60;
    if ((tR <= M) !== ok) continue;
    const parts = [
      numPart("along", "Current along the track", "Component of the current along the track (kt; positive when it helps the ship, negative when it opposes)", al, 1, "θ is the angle between the track and the set. The component along the track is drift × cos(θ); it is negative when θ is over 90°."),
      numPart("course", "Course to steer", "Course to steer (degrees, 3 figures)", course, 0, `Cancel the sideways push: sin(angle) = drift × sin(θ) ÷ water speed. Steer that angle to the ${side > 0 ? "left" : "right"} of the track, away from where the current pushes (the current is on the ${side > 0 ? "right" : "left"}).`, true),
      numPart("gs", "Speed over the ground", "Speed over the ground on that course (kt)", gs, 0, "Ground speed = water speed × cos(angle) + the along-track component of the current.", true),
      yesNo("ok", "In time?", `Can the ship cover the **${D} nm** within **${M} min**?`, ok, "Time in minutes = distance ÷ ground speed × 60. Compare it with the time allowed."),
    ];
    const ex = `**θ:** the set ${fb(S)} is ${th}° to the ${side > 0 ? "right" : "left"} of the track ${fb(T)}. Along the track: ${f(r)} × cos ${th}° = **${f(roundTo(al, 1))} kt**; across: ${f(r)} × sin ${th}° = ${f(roundTo(cr, 2))} kt.\n\n**Course to steer:** sin(angle) = ${f(roundTo(cr, 2))} ÷ ${s}, so the angle is ${f(roundTo(wca, 1))}°, to the ${side > 0 ? "left" : "right"} of the track: ${T} ${sgn(-side)} ${f(roundTo(wca, 1))} = **${b3(bear(course))}°**.\n\n**Over the ground:** ${s} × cos ${f(roundTo(wca, 1))}° ${sgn(al)} ${f(roundTo(Math.abs(al), 1))} = **${roundTo(gs, 0)} kt**.\n\n**In time:** ${D} ÷ ${roundTo(gs, 0)} × 60 = ${f(roundTo(tR, 1))} min against ${M} min: **${YN(ok)}**.`;
    return finish(`${NOTE} A current's **set** is the direction it flows toward and its **drift** is its speed.\n\n${ves} must make good a track of **${fb(T)}** for **${D} nm** at a water speed of **${s} kt**. The current has a set of **${fb(S)}** and a drift of **${f(r)} kt**. Let θ be the angle between the track and the set. Work out the course to steer. Round as each part says.`,
      parts, ex, "sn-sd4", { tier, T, s, S, r, D, M }, [["_T", T], ["_S", s], ["_R", r], ["_D", D], ["_M", M]],
      ["The ship does not point along its track; it points a little into the current.", "Split the current along and across the track first."]);
  }
  return tooMany();
}

// ---------- tide-heights ----------
// Rule of twelfths: over the six hours between low and high water the tide gains 1, 2, 3, 3, 2, 1 twelfths of the range
// in hours 1 to 6 (and loses them in the same pattern after high water). Heights are exact tenths of a metre.

const CUM = [1, 3, 6, 9, 11, 12];
const TIDE_RULE = "Rule of twelfths for this exercise: in the six hours between low water and high water the tide rises by 1/12, 2/12, 3/12, 3/12, 2/12 and 1/12 of the range in hours 1 to 6, and it falls in the same pattern after high water. Only whole hours are used. Heights are above chart datum, and a charted depth is measured below chart datum.";

function genTide(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const place = rng.pick(PORTS);
    const hlT = rng.int(2, 15), mm = rng.int(2, 8), RT = mm * 12; // tenths of a metre: range = 1.2 m x mm
    const hl = hlT / 10, R = RT / 10, hw = (hlT + RT) / 10;
    const rise = (N) => (hlT + (mm * CUM[N - 1])) / 10, fall = (N) => (hlT + RT - mm * CUM[N - 1]) / 10;
    if (tier === "expert-plus") {
      const b = rng.int(10, 50) / 10, d = rng.int(40, 90) / 10, u = rng.pick([0.5, 0.8, 1.0, 1.2]);
      const need = roundTo(d + u - b, 1), tL = rng.int(0, 95) * 15;
      let N = 0;
      for (let k = 1; k <= 6; k++) if (rise(k) >= need - 1e-9) { N = k; break; }
      if (N < 1 || N > 5 || need <= hl || Math.abs(rise(N) - need) < 1e-9) continue;
      let clash = false;
      for (let k = 1; k <= 6; k++) if (Math.abs(rise(k) - need) < 1e-9) clash = true;
      if (clash) continue;
      const ukc = b + rise(N) - d;
      const parts = [
        numPart("need", "Tide needed", "Height of tide needed over the bar (m)", need, 1, "The ship needs depth for its draught plus the minimum clearance. The tide must make up whatever the charted depth lacks: draught + minimum clearance − charted depth."),
        numPart("hours", "Whole hours", "Whole hours after low water until the tide first reaches that height", N, 0, "Add up the twelfths hour by hour to find the height of tide each hour after low water, and stop at the first hour that reaches the height needed."),
        timePart("time", "Earliest time", "Earliest time the ship can cross the bar", tL + N * 60, "Add the whole hours to the clock time of low water."),
        numPart("ukc", "Clearance then", "Under-keel clearance at that time (m)", ukc, 1, "Clearance = charted depth + height of tide − draught."),
      ];
      const heights = [1, 2, 3, 4, 5].map((k) => `hour ${k}: ${f(rise(k))} m`).join(", ");
      const ex = `**Tide needed:** ${f(d)} + ${f(u)} − ${f(b)} = **${f(need)} m**.\n\n**Tide height by hour** (low water ${f(hl)} m, range ${f(R)} m, one twelfth = ${f(roundTo(R / 12, 2))} m): ${heights}.\n\n**Whole hours:** the first height of at least ${f(need)} m is at hour ${N}, so **${N} h**.\n\n**Earliest time:** ${hhmm(tL)} + ${N} h = **${hhmm(tL + N * 60)}**.\n\n**Clearance:** ${f(b)} + ${f(rise(N))} − ${f(d)} = **${f(roundTo(ukc, 1))} m**.`;
      return finish(`${NOTE}\n\n${TIDE_RULE}\n\nThe bar at the entrance to ${place} has a charted depth of **${f(b)} m**. ${rng.pick(VESSELS).replace(/^the /, "The ")} draws **${f(d)} m** and needs an under-keel clearance of at least **${f(u)} m** on the bar. Low water at the bar is at **${hhmm(tL)}** at **${f(hl)} m**, and the next high water is **${f(hw)} m**. The tide is rising. Find the earliest whole hour after low water at which the ship can cross.`,
        parts, ex, "sn-td4", { tier, hlT, mm, b, d, u, tL }, [["_LW", hl], ["_HW", hw], ["_BAR", b], ["_DRAUGHT", d], ["_MIN", u]],
        ["Work out the height of tide you need before looking at the clock.", "Build the heights hour by hour from low water with the twelfths."]);
    }
    const N = rng.int(1, 5), isFall = tier === "expert" && rng.next() < 0.5;
    const h = isFall ? fall(N) : rise(N);
    const pR = numPart("range", "Range", "Range of the tide, high water minus low water (m)", R, 1, "Range = height at high water − height at low water.");
    const pH = numPart("h", "Height of tide", `Height of tide ${N} h after ${isFall ? "high" : "low"} water (m)`, h, 1, isFall ? "The tide falls from high water by the cumulative twelfths of the range." : "The tide rises from low water by the cumulative twelfths of the range: 1/12, then 3/12 in all, then 6/12...");
    const cumTxt = `${CUM[N - 1]}/12`;
    const exR = `**Range:** ${f(hw)} − ${f(hl)} = **${f(R)} m**.`;
    const exH = `**Height:** after ${N} h the tide has ${isFall ? "fallen" : "risen"} ${cumTxt} of ${f(R)} m = ${f(roundTo((R * CUM[N - 1]) / 12, 2))} m, so ${isFall ? `${f(hw)} − ${f(roundTo((R * CUM[N - 1]) / 12, 2))}` : `${f(hl)} + ${f(roundTo((R * CUM[N - 1]) / 12, 2))}`} = **${f(h)} m**.`;
    const base = `${NOTE}\n\n${TIDE_RULE}\n\nAt ${place} low water is **${f(hl)} m** and high water is **${f(hw)} m**.`;
    if (tier === "medium") {
      return finish(`${base} The tide is rising. Look at the time **${N} h** after low water.`, [pR, pH], `${exR}\n\n${exH}`, "sn-td1", { tier, hlT, mm, N }, [["_LW", hl], ["_HW", hw], ["_N", N]],
        ["Range first; one twelfth of it is the unit.", "Add the twelfths for the hours that have passed."]);
    }
    const b = rng.int(15, 60) / 10, d = rng.int(25, 80) / 10, u = rng.pick([0.5, 0.8, 1.0, 1.2, 1.5]);
    const ukc = b + h - d;
    if (ukc < 0.2 || ukc > 6) continue;
    const pU = numPart("ukc", "Under-keel clearance", "Under-keel clearance (m)", ukc, 1, "Clearance = charted depth + height of tide − draught.");
    const exU = `**Clearance:** ${f(b)} + ${f(h)} − ${f(d)} = **${f(roundTo(ukc, 1))} m**.`;
    const hardBase = `${base} The berth has a charted depth of **${f(b)} m** and the ship draws **${f(d)} m**.`;
    if (tier === "hard") {
      return finish(`${hardBase} The tide is rising. Look at the time **${N} h** after low water.`, [pR, pH, pU], `${exR}\n\n${exH}\n\n${exU}`, "sn-td2", { tier, hlT, mm, N, b, d }, [["_LW", hl], ["_HW", hw], ["_N", N], ["_DEPTH", b], ["_DRAUGHT", d]],
        ["Range, then height, then clearance.", "Clearance uses the charted depth, the height of tide and the draught."]);
    }
    if (Math.abs(ukc - u) < 0.2) continue;
    const ok = ukc >= u;
    if (ok !== wantOk) continue;
    const tRef = rng.int(0, 95) * 15, tNow = tRef + N * 60;
    const when = `${isFall ? "High" : "Low"} water is at **${hhmm(tRef)}**. The ship plans to pass the berth at **${hhmm(tNow)}**, and the tide is ${isFall ? "falling" : "rising"}.`;
    const parts = [pR, numPart("h", "Height of tide", `Height of tide at ${hhmm(tNow)} (m)`, h, 1, "Count the whole hours from the water given, then use the cumulative twelfths of the range."), pU,
      yesNo("ok", "Safe?", `The ship needs an under-keel clearance of at least **${f(u)} m**. Does it have that at ${hhmm(tNow)}?`, ok, "Compare the clearance with the minimum.")];
    return finish(`${hardBase} ${when}`, parts, `${exR}\n\n${exH.replace("**Height:**", `**Height** (${hhmm(tNow)} is ${N} h after ${isFall ? "high" : "low"} water):`)}\n\n${exU}\n\n**Safe:** ${f(roundTo(ukc, 1))} m is ${ok ? "at least" : "less than"} ${f(u)} m: **${YN(ok)}**.`,
      "sn-td3", { tier, hlT, mm, N, b, d, u, fall: isFall }, [["_LW", hl], ["_HW", hw], ["_DEPTH", b], ["_DRAUGHT", d], ["_MIN", u]],
      ["How many whole hours is the clock time after the water given?", "Height, then clearance, then compare with the minimum."]);
  }
  return tooMany();
}

// ---------- closest-approach ----------
// The target's motion relative to own ship is (target velocity) - (own velocity). With r0 = the target's position
// from own ship, the distance is smallest at t = -(r0 . v) / |v|^2 and its value is |r0 + v t|.

const vel = (s, c) => [s * Math.sin(c * D2R), s * Math.cos(c * D2R)];

function genCpa(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const ves = rng.pick(VESSELS), oth = rng.pick(["a trawler", "a tanker", "a cargo ship", "a tug", "a ferry"]);
    if (tier === "medium") {
      const overtake = rng.next() < 0.5, s1 = rng.int(12, 24), s2 = rng.int(6, 16);
      const closing = overtake ? s1 - s2 : s1 + s2, t = rng.int(6, 36) * 5, R0 = (closing * t) / 60;
      if (closing < 4 || !isEx(R0, 0) || R0 < 3) continue;
      const C = rng.int(1, 36) * 10;
      const parts = [
        numPart("closing", "Closing speed", "Speed at which the gap between the ships shrinks (kt)", closing, 0, overtake ? "The ships head the same way, so the gap shrinks at the difference of their speeds." : "The ships head toward each other, so the gap shrinks at the sum of their speeds."),
        numPart("t", "Time to meet", overtake ? "Time until the ships are level (minutes)" : "Time until the ships meet (minutes)", t, 0, "Time in hours = gap ÷ closing speed; × 60 for minutes."),
      ];
      const ex = `**Closing speed:** ${overtake ? `${s1} − ${s2}` : `${s1} + ${s2}`} = **${closing} kt**.\n\n**Time:** ${R0} ÷ ${closing} × 60 = **${t} min**.`;
      return finish(`${NOTE}\n\n${ves} steers **${fb(C)}** at **${s1} kt**. ${overtake ? `${oth[0].toUpperCase() + oth.slice(1)} is **${R0} nm** dead ahead on the same line, steering **${fb(C)}** at **${s2} kt**` : `${oth[0].toUpperCase() + oth.slice(1)} is **${R0} nm** dead ahead on the same line, steering the opposite way, **${fb(C + 180)}**, at **${s2} kt**`}.`,
        parts, ex, "sn-ca1", { tier, s1, s2, R0, overtake }, [["_S1", s1], ["_S2", s2], ["_GAP", R0]],
        [overtake ? "Same direction: subtract the speeds." : "Opposite directions: add the speeds.", "Time = gap ÷ closing speed."]);
    }
    if (tier === "hard") {
      const s1 = rng.int(10, 22), s2 = rng.int(6, 20), x0 = rng.int(20, 90) / 10, y0 = rng.int(20, 90) / 10, side = rng.next() < 0.5 ? 1 : -1;
      const r0 = [side * x0, y0], v = [-side * s2, -s1], vv = v[0] ** 2 + v[1] ** 2, tc = -(r0[0] * v[0] + r0[1] * v[1]) / vv;
      const cpa = Math.hypot(r0[0] + v[0] * tc, r0[1] + v[1] * tc), vr = Math.sqrt(vv), tm = tc * 60;
      if (tm < 8 || tm > 90 || cpa < 0.3 || nearHalf(vr, 1, 0.1) || nearHalf(tm, 0, 0.12) || nearHalf(cpa, 1, 0.1)) continue;
      const tR = roundTo(tm, 0);
      if (roundTo(Math.hypot(r0[0] + (v[0] * tR) / 60, r0[1] + (v[1] * tR) / 60), 1) !== roundTo(cpa, 1)) continue;
      const parts = [
        numPart("vrel", "Relative speed", "Speed of the other ship relative to own ship (kt)", vr, 1, "Relative velocity = the other ship's velocity − own velocity. The two courses are at right angles, so the speed is a Pythagoras sum of the two speeds."),
        numPart("tcpa", "Time of closest approach", "Time until the ships are closest (minutes)", tm, 0, "Closest when the gap's change along the relative path is zero: t = −(r · v) ÷ |v|², with r the other ship's position from own ship and v the relative velocity. Use east and north components.", true),
        numPart("cpa", "Closest distance", "Distance between the ships at closest approach (nm)", cpa, 1, "Find the other ship's position relative to own ship at that time: r + v × t, then its length."),
      ];
      const ex = `**Relative velocity:** the other ship moves ${side > 0 ? "west" : "east"} at ${s2} kt and own ship north at ${s1} kt, so relative to own ship it moves (${f(v[0])}, ${f(v[1])}) kt (east, north). Speed = √(${s2}² + ${s1}²) = **${f(roundTo(vr, 1))} kt**.\n\n**Time:** r = (${f(r0[0])}, ${f(r0[1])}) nm, so t = −(r · v) ÷ |v|² = **${Math.round(tm)} min**.\n\n**Closest distance:** r + v × t = (${f(roundTo(r0[0] + v[0] * tc, 2))}, ${f(roundTo(r0[1] + v[1] * tc, 2))}) nm, length **${f(roundTo(cpa, 1))} nm**.`;
      return finish(`${NOTE}\n\n${ves} steers **000°** at **${s1} kt**. ${oth[0].toUpperCase() + oth.slice(1)} is **${f(x0)} nm ${side > 0 ? "east" : "west"}** and **${f(y0)} nm north** of it, steering **${side > 0 ? "270" : "090"}°** at **${s2} kt**. Both hold course and speed.`,
        parts, ex, "sn-ca2", { tier, s1, s2, x0, y0, side }, [["_S1", s1], ["_S2", s2], ["_X", x0], ["_Y", y0]],
        ["Subtract own velocity from the other ship's velocity, in east and north parts.", "Speed, then the time of closest approach, then the distance at that time."]);
    }
    const s1 = rng.int(10, 24), c1 = rng.int(0, 71) * 5, s2 = rng.int(8, 28), c2 = rng.int(0, 71) * 5, B = rng.int(0, 71) * 5, R0 = rng.int(40, 120) / 10;
    const v1 = vel(s1, c1), v2 = vel(s2, c2), v = [v2[0] - v1[0], v2[1] - v1[1]], r0 = [R0 * Math.sin(B * D2R), R0 * Math.cos(B * D2R)];
    const vv = v[0] ** 2 + v[1] ** 2;
    if (vv < 64) continue;
    const tc = -(r0[0] * v[0] + r0[1] * v[1]) / vv, tm = tc * 60, cpa = Math.hypot(r0[0] + v[0] * tc, r0[1] + v[1] * tc);
    if (tm < 8 || tm > 90 || cpa < 0.3 || cpa > 3.5 || nearHalf(v[0], 1, 0.12) || nearHalf(v[1], 1, 0.12) || nearHalf(tm, 0, 0.12) || nearHalf(cpa, 1, 0.1)) continue;
    const ve = roundTo(v[0], 1), vn = roundTo(v[1], 1), vv2 = ve * ve + vn * vn, tc2 = -(r0[0] * ve + r0[1] * vn) / vv2;
    if (roundTo(tc2 * 60, 0) !== roundTo(tm, 0) || roundTo(Math.hypot(r0[0] + ve * tc2, r0[1] + vn * tc2), 1) !== roundTo(cpa, 1)) continue;
    if (Math.abs(Math.round(tm) - tm) < 0.12) continue;
    const base = `${NOTE}\n\n${ves} steers **${fb(c1)}** at **${s1} kt**. ${oth[0].toUpperCase() + oth.slice(1)} bears **${fb(B)}** at **${f(R0)} nm** and steers **${fb(c2)}** at **${s2} kt**. Both hold course and speed.`;
    const pe = numPart("ve", "Relative east", "East part of the other ship's velocity relative to own ship (kt; east positive)", v[0], 1, "Relative velocity = the other ship's velocity − own velocity. A ship's east part is speed × sin(course) and its north part is speed × cos(course).");
    const pn = numPart("vn", "Relative north", "North part of the other ship's velocity relative to own ship (kt; north positive)", v[1], 1, "Same subtraction for the north parts: speed × cos(course) for each ship.");
    const pt = numPart("tcpa", "Time of closest approach", "Time until the ships are closest (minutes)", tm, 0, "With r the other ship's position from own ship (east = range × sin(bearing), north = range × cos(bearing)) and v the relative velocity: t = −(r · v) ÷ |v|². Convert hours to minutes.", true);
    const pc = numPart("cpa", "Closest distance", "Distance between the ships at closest approach (nm)", cpa, 1, "The other ship's relative position at that time is r + v × t; take its length.");
    const exV = `**Relative velocity:** other ship (${f(roundTo(v2[0], 2))}, ${f(roundTo(v2[1], 2))}) − own ship (${f(roundTo(v1[0], 2))}, ${f(roundTo(v1[1], 2))}) = (**${f(ve)}**, **${f(vn)}**) kt.`;
    const exC = `**Closest approach:** r = (${f(roundTo(r0[0], 2))}, ${f(roundTo(r0[1], 2))}) nm; t = −(r · v) ÷ |v|² gives **${Math.round(tm)} min**, and the distance is |r + v × t| = **${f(roundTo(cpa, 1))} nm**.`;
    if (tier === "expert") {
      return finish(`${base} Give the relative velocity in east and north parts, then the time and distance of closest approach. Round as each part says.`, [pe, pn, pt, pc], `${exV}\n\n${exC}`,
        "sn-ca3", { tier, s1, c1, s2, c2, B, R0 }, [["_S1", s1], ["_S2", s2], ["_R", R0]],
        ["East and north parts of each ship's velocity, then subtract.", "Closest approach needs the position of the other ship as east and north parts too."]);
    }
    // expert-plus: both ships' velocities unknown to the learner for the target: two radar plots
    const dt = rng.pick([6, 12, 15, 20]), p1a = [R0 * Math.sin(B * D2R), R0 * Math.cos(B * D2R)];
    const p2a = [p1a[0] + (v[0] * dt) / 60, p1a[1] + (v[1] * dt) / 60];
    const B1 = Math.round(wrap(B)), R1 = roundTo(R0, 1), B2 = Math.round(brg(p2a[0], p2a[1])), R2 = roundTo(Math.hypot(p2a[0], p2a[1]), 1);
    const P1 = [R1 * Math.sin(B1 * D2R), R1 * Math.cos(B1 * D2R)], P2 = [R2 * Math.sin(B2 * D2R), R2 * Math.cos(B2 * D2R)];
    const dv = [P2[0] - P1[0], P2[1] - P1[1]], dl = Math.hypot(dv[0], dv[1]);
    if (dl < 1.2) continue;
    const vr = [(dv[0] * 60) / dt, (dv[1] * 60) / dt], tv = [vr[0] + v1[0], vr[1] + v1[1]];
    const tspeed = Math.hypot(tv[0], tv[1]), tcourse = brg(tv[0], tv[1]);
    const cpa2 = Math.abs(P1[0] * P2[1] - P1[1] * P2[0]) / dl, tcpa2 = (-(P1[0] * dv[0] + P1[1] * dv[1]) / (dl * dl)) * dt;
    if (tcpa2 < 3 || tcpa2 > 120 || cpa2 < 0.3 || cpa2 > 3.8 || tspeed < 5 || tspeed > 35) continue;
    if (nearHalf(tspeed, 0, 0.12) || nearHalf(tcourse, 0, 0.12) || nearHalf(cpa2, 1, 0.1)) continue;
    const L = rng.pick([1.0, 1.5, 2.0, 2.5, 3.0]);
    if (Math.abs(cpa2 - L) < 0.35) continue;
    const ok = cpa2 >= L;
    if (ok !== wantOk) continue;
    const parts = [
      numPart("tspeed", "Target speed", "True speed of the other ship (kt)", tspeed, 0, "Its motion relative to own ship is the change in its position ÷ the time (east and north parts). Add own ship's velocity to get its true velocity, then its speed.", true),
      numPart("tcourse", "Target course", "True course of the other ship (degrees, 3 figures)", tcourse, 0, "From the east and north parts of its true velocity, the course is tan⁻¹(east ÷ north), placed in the right quarter.", true),
      numPart("cpa", "Closest distance", "Closest distance between the ships if both hold on (nm)", cpa2, 1, "The relative path is a straight line through the two plotted positions. The closest distance is the perpendicular distance from own ship to that line: |x₁y₂ − x₂y₁| ÷ the length between the two points."),
      yesNo("ok", "Clear of the limit?", `The company rule for this exercise is a closest approach of **at least ${f(L)} nm**. Is the closest distance at least that?`, ok, "Compare the closest distance with the limit."),
    ];
    const ex = `**Positions:** (${f(roundTo(P1[0], 2))}, ${f(roundTo(P1[1], 2))}) nm and (${f(roundTo(P2[0], 2))}, ${f(roundTo(P2[1], 2))}) nm (east, north) from own ship.\n\n**Relative velocity:** the change ÷ ${dt} min = (${f(roundTo(vr[0], 2))}, ${f(roundTo(vr[1], 2))}) kt. Add own velocity (${f(roundTo(v1[0], 2))}, ${f(roundTo(v1[1], 2))}) to get the true velocity (${f(roundTo(tv[0], 2))}, ${f(roundTo(tv[1], 2))}) kt: speed **${roundTo(tspeed, 0)} kt**, course **${b3(bear(tcourse))}°**.\n\n**Closest distance:** |x₁y₂ − x₂y₁| ÷ ${f(roundTo(dl, 2))} = **${f(roundTo(cpa2, 1))} nm**, ${ok ? "at least" : "less than"} ${f(L)}: **${YN(ok)}**.`;
    return finish(`${NOTE}\n\n${ves} steers **${fb(c1)}** at **${s1} kt** and holds on. Radar plots ${oth} at **${b3(B1)}°, ${f(R1)} nm**, and **${dt} min** later at **${b3(B2)}°, ${f(R2)} nm**. Assume the other ship also holds course and speed. Work from the plotted figures. Round as each part says.`,
      parts, ex, "sn-ca4", { tier, s1, c1, B1, R1, B2, R2, dt, L }, [["_S1", s1], ["_R1", R1], ["_R2", R2], ["_DT", dt], ["_LIMIT", L]],
      ["Turn each plotted bearing and range into east and north parts.", "The change between the two plots is the other ship's movement relative to you."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "passage-plan") return genPassage(rng, difficulty);
  if (subtopic === "set-drift") return genDrift(rng, difficulty);
  if (subtopic === "tide-heights") return genTide(rng, difficulty);
  if (subtopic === "closest-approach") return genCpa(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (times via seconds or a per-nm rate, the
// steering course by bisection on the ground track, tide heights by adding the twelfths hour by hour, closest
// approach by a ternary search on the distance or by the cross product of two plots). Numbers are compared with
// the rounded truth; choices and times exactly.

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

// Course to steer for a track T (bisection on the ground-track error), and the resulting ground speed.
function steerSolve(T, s, S, r) {
  const [ce, cn] = cur(S, r);
  const ground = (h) => [s * Math.sin(h * D2R) + ce, s * Math.cos(h * D2R) + cn];
  const err = (h) => { const g = ground(h); return ((Math.atan2(g[0], g[1]) * R2D - T + 540) % 360) - 180; };
  let lo = T - 75, hi = T + 75;
  const up = err(hi) > err(lo);
  for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if ((err(mid) > 0) === up) hi = mid; else lo = mid; }
  const h = (lo + hi) / 2, g = ground(h);
  return { h, gs: Math.hypot(g[0], g[1]) };
}
// Time and distance of closest approach by ternary search (the distance to a moving point is convex in t).
function closest(r0, v) {
  let lo = 0, hi = 12;
  const d = (t) => Math.hypot(r0[0] + v[0] * t, r0[1] + v[1] * t);
  for (let i = 0; i < 200; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (d(a) < d(b)) hi = b; else lo = a; }
  const t = (lo + hi) / 2;
  return { tm: t * 60, cpa: d(t) };
}
const riseH = (hlT, mm, N) => { let h = hlT; for (let k = 0; k < N; k++) h += mm * [1, 2, 3, 3, 2, 1][k]; return h / 10; };
const fallH = (hlT, mm, N) => { let h = hlT + mm * 12; for (let k = 0; k < N; k++) h -= mm * [1, 2, 3, 3, 2, 1][k]; return h / 10; };

const ALT = {
  "sn-pl1": (p) => { const t = (p.D / p.s) * 3600 / 60; return { t, fuel: p.Br * (t / 60) }; },
  "sn-pl2": (p) => { const t = (p.D / p.s) * 3600 / 60; return { t, fuel: (p.Br / 60) * t, arr: (p.dep + t + p.df + 1440) % 1440 }; },
  "sn-pl3": (p) => {
    const t = (p.D / p.s) * 3600 / 60, fuel = (p.Br / 60) * t, need = fuel + (fuel * p.R) / 100;
    return { t, need, arr: (p.dep + t + p.df + 1440) % 1440, ok: YN(p.bunk >= need) };
  },
  "sn-pl4": (p) => {
    const hours = p.D / p.v, rate = (p.r0 * p.v ** 3) / p.v0 ** 3, fuel = rate * hours, full = (p.r0 / p.v0) * p.D;
    return { rate, fuel, saved: full - fuel, ok: YN(hours * 60 <= p.W) };
  },
  "sn-sd1": (p) => { const [ce, cn] = cur(p.S, p.r), g = Math.hypot(p.s * Math.sin(p.C * D2R) + ce, p.s * Math.cos(p.C * D2R) + cn); return { gs: g, t: (p.D / g) * 60 }; },
  "sn-sd2": (p) => {
    const [ce, cn] = cur(p.S, p.r), ge = p.s * Math.sin(p.C * D2R) + ce, gn = p.s * Math.cos(p.C * D2R) + cn;
    return { gs: Math.hypot(ge, gn), cmg: brg(ge, gn), off: p.r * p.T };
  },
  "sn-sd3": (p) => {
    const [ce, cn] = cur(p.S, p.r), ge = p.s * Math.sin(p.C * D2R) + ce, gn = p.s * Math.cos(p.C * D2R) + cn, gs = Math.hypot(ge, gn), t = (p.D / gs) * 60;
    return { gs, cmg: brg(ge, gn), t, off: p.r * (t / 60) };
  },
  "sn-sd4": (p) => {
    const st = steerSolve(p.T, p.s, p.S, p.r), [ce, cn] = cur(p.S, p.r), u = [Math.sin(p.T * D2R), Math.cos(p.T * D2R)];
    return { along: ce * u[0] + cn * u[1], course: wrap(st.h), gs: st.gs, ok: YN((p.D / st.gs) * 60 <= p.M) };
  },
  "sn-td1": (p) => ({ range: (p.mm * 12) / 10, h: riseH(p.hlT, p.mm, p.N) }),
  "sn-td2": (p) => { const h = riseH(p.hlT, p.mm, p.N); return { range: (p.mm * 12) / 10, h, ukc: p.b + h - p.d }; },
  "sn-td3": (p) => {
    const h = p.fall ? fallH(p.hlT, p.mm, p.N) : riseH(p.hlT, p.mm, p.N), ukc = p.b + h - p.d;
    return { range: (p.mm * 12) / 10, h, ukc, ok: YN(ukc >= p.u - 1e-9) };
  },
  "sn-td4": (p) => {
    const need = p.d + p.u - p.b;
    let N = 0;
    for (let k = 1; k <= 6 && !N; k++) if (riseH(p.hlT, p.mm, k) >= need - 1e-9) N = k;
    return { need, hours: N, time: p.tL + N * 60, ukc: p.b + riseH(p.hlT, p.mm, N) - p.d };
  },
  "sn-ca1": (p) => { const c = p.overtake ? p.s1 - p.s2 : p.s1 + p.s2; return { closing: c, t: (p.R0 / c) * 60 }; },
  "sn-ca2": (p) => {
    const r0 = [p.side * p.x0, p.y0], v = [-p.side * p.s2, -p.s1], c = closest(r0, v);
    return { vrel: Math.hypot(v[0], v[1]), tcpa: c.tm, cpa: c.cpa };
  },
  "sn-ca3": (p) => {
    const v1 = vel(p.s1, p.c1), v2 = vel(p.s2, p.c2), v = [v2[0] - v1[0], v2[1] - v1[1]], c = closest([p.R0 * Math.sin(p.B * D2R), p.R0 * Math.cos(p.B * D2R)], v);
    return { ve: v[0], vn: v[1], tcpa: c.tm, cpa: c.cpa };
  },
  "sn-ca4": (p) => {
    const v1 = vel(p.s1, p.c1), P1 = [p.R1 * Math.sin(p.B1 * D2R), p.R1 * Math.cos(p.B1 * D2R)], P2 = [p.R2 * Math.sin(p.B2 * D2R), p.R2 * Math.cos(p.B2 * D2R)];
    const vr = [((P2[0] - P1[0]) * 60) / p.dt, ((P2[1] - P1[1]) * 60) / p.dt], tv = [vr[0] + v1[0], vr[1] + v1[1]], c = closest(P1, vr);
    return { tspeed: Math.hypot(tv[0], tv[1]), tcourse: brg(tv[0], tv[1]), cpa: c.cpa, ok: YN(c.cpa >= p.L - 1e-9) };
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
      let tr = roundTo(tv, dp);
      if (BEARING_IDS.includes(part.id)) tr = bear(tv);
      if (!near(partNum(answer, part.id), tr, tolOf(dp))) return false;
    } else if (part.answerType === "text") {
      if (timeMins(partStr(answer, part.id)) !== (((Math.round(tv) % 1440) + 1440) % 1440)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
