// Geographer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are whole numbers (or 0.5 steps) and every chained answer is exact, so a rounded
// earlier answer never changes a later one. Bearings and angles are independent of each other.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   scale-journey  map cm -> real km -> walking time -> return time -> before dark?; latest start   (Cartographer)
//   grid-route     two 6-figure grid refs -> distance -> bearing -> feature on the line -> time      (Cartographer)
//   contour-slope  contour heights/scale -> climb -> gradient 1 in N -> steep by a stated rule       (both)
//   climate-table  monthly table -> range, total, driest month, mean -> biome by stated bands          (Climate)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? "" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-geographer: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const same = (a, b) => (Array.isArray(a) ? a.join(" | ") : String(a)) === (Array.isArray(b) ? b.join(" | ") : String(b));

function numPart(id, label, ask, val, dp, hint, fuzzyZero = dp === 0) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (fuzzyZero) p.fuzzyNumber = 0;
  return p;
}
function timePart(id, label, ask, mins, hint) {
  const t = hhmm(mins);
  const accepts = [];
  if (t.startsWith("0")) accepts.push(t.slice(1));
  accepts.push(t.replace(":", "."));
  return { id, label, ask: `${ask} (24-hour, HH:MM)`, answerType: "text", answer: t, accepts, fuzzy: false, hint };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
// Segmented part: all combinations of two small value lists (2 x 2).
function segPart2(id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- scale-journey ----------

const PACES = [3, 4, 5, 6]; // km/h; all divide 60, so minutes are whole numbers for whole km
function genScale(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  for (let i = 0; i < TRY; i++) {
    const n = rng.pick([20000, 25000, 40000, 50000, 100000]);
    const cm = n === 25000 ? rng.int(2, 10) * 4 : n === 20000 || n === 40000 ? rng.int(1, 8) * 5 : n === 50000 ? rng.int(3, 16) * 2 : rng.int(3, 20);
    const km = (cm * n) / 100000;
    const v = tier === "medium" || tier === "hard" ? rng.pick(PACES) : rng.pick([5, 6]);
    const v2 = v === 6 ? rng.pick([4, 5]) : 4;
    const back = med || tier === "hard" ? v : v2;
    const out = (km * 60) / v, ret = (km * 60) / back;
    if (km > 12 || out + ret > 420) continue; // a realistic day walk: at most 12 km each way, 7 hours moving
    const S = rng.pick([15, 20, 30, 45]);
    const dep = rng.int(72, 120) * 5; // 06:00..10:00
    const M = plus ? rng.pick([20, 30, 45]) : 0;
    const total = out + S + ret;
    const retTime = dep + total;
    if (retTime > 1300) continue;
    const given = [["_cm", cm], ["_pace", v]];
    const scaleTxt = `**1 : ${commas(n)}**`;
    const exKm = `**Real distance:** ${cm} cm × ${commas(n)} = ${commas(cm * n)} cm = ${commas((cm * n) / 100)} m = **${km} km**.`;
    const exOut = `**Walking time out:** ${km} ÷ ${v} × 60 = **${out} min**.`;
    if (!plus) {
      const parts = [
        numPart("km", "Real distance", "Real distance from the start to the viewpoint (km)", km, 0, `On a 1 : ${commas(n)} map, 1 cm stands for ${commas(n)} cm on the ground. Multiply the map length, then convert cm to km (100 000 cm = 1 km).`),
        numPart("out", "Walking time out", "Walking time to the viewpoint (minutes)", out, 0, `Time = distance ÷ speed, in hours; multiply by 60 for minutes. The pace is ${v} km/h.`),
      ];
      let sunset = 0, ok = false;
      if (!med) parts.push(timePart("back", "Back at start", "Time back at the start", retTime, back === v ? "Add the walk out, the stay and the walk back to the start time (same pace both ways)." : `Add the walk out, the stay, and the walk back (at ${back} km/h) to the start time.`));
      if (tier === "expert") {
        const delta = rng.pick([-40, -25, -10, 10, 25, 40]);
        sunset = retTime + delta;
        ok = retTime <= sunset;
        parts.push(yesNo("dark", "Before sunset?", `Sunset is at **${hhmm(sunset)}**. Is the walker back at the start before sunset?`, ok, "Compare your return time with the sunset time."));
      }
      const exBack = `**Back at the start:** ${hhmm(dep)} + ${out} min out + ${S} min stay + ${ret} min back = ${hhmm(dep)} + ${total} min = **${hhmm(retTime)}**.`;
      const exDark = tier === "expert" ? `**Before sunset:** ${hhmm(retTime)} is ${ok ? "no later than" : "after"} ${hhmm(sunset)}, so **${ok ? "Yes" : "No"}**.` : "";
      const ex = [exKm, exOut, !med ? exBack : "", exDark].filter(Boolean).join("\n\n");
      const paceTxt = back === v ? `The walker's pace is **${v} km/h**.` : `The walker's pace is **${v} km/h** on the way out and **${back} km/h** on the way back.`;
      const stay = med ? "" : ` The walker stays **${S} minutes** at the viewpoint.`;
      return finish(
        `A footpath on a map (scale ${scaleTxt}) measures **${cm} cm** from the start to a viewpoint. ${paceTxt}${stay}${med ? "" : ` The walk begins at **${hhmm(dep)}** and the times are 24-hour.`}`,
        parts.slice(0, TIER_PARTS[tier]), ex, "geo-scale", { tier, n, cm, v, back, S, dep, sunset }, given.concat(med ? [] : [["_stay", S]]),
        ["Convert map length to ground distance first, then distance to time.", "Work in minutes for the clock times."],
      );
    }
    // expert-plus: work backwards from sunset with a safety margin
    const sunset = rng.int(204, 252) * 5; // 17:00..21:00
    const latest = sunset - M - total;
    if (latest < 240) continue;
    const slowRet = km * 20; // return at 3 km/h
    // Balance the verdicts: both in time, planned start only, or too late (a too-late start is too late either way).
    const extra = slowRet - ret, combo = rng.int(0, 2);
    let rd;
    if (combo === 0) rd = latest - extra - rng.pick([5, 10, 15, 20]);
    else if (combo === 1) {
      const offs = [0, 5, 10, 15, 20, 25, 30].filter((o) => o < extra);
      rd = latest - rng.pick(offs);
    } else rd = latest + rng.pick([5, 10, 15, 20, 30]);
    if (rd < 240) continue;
    const okPlan = rd <= latest;
    const slowTotal = out + S + slowRet;
    const okSlow = rd + slowTotal <= sunset - M;
    if (rd + slowTotal === sunset - M) continue;
    const parts = [
      numPart("km", "Real distance", "Real distance of the path (km)", km, 0, `On a 1 : ${commas(n)} map, 1 cm stands for ${commas(n)} cm on the ground. Multiply, then convert cm to km.`),
      numPart("total", "Time on the move", "Walking time out plus back, not counting the stay (minutes)", out + ret, 0, `Out at ${v} km/h, back at ${back} km/h: work each leg as distance ÷ speed × 60.`),
      timePart("latest", "Latest start", "Latest start time", latest, `Work backwards: the group must be back ${M} minutes before sunset. Take off the walking time and the ${S}-minute stay.`),
      segPart2("verdict", "Verdict", `The group plans to start at **${hhmm(rd)}**. Is that in time, and would the return still be in time if the walk back were only **3 km/h**?`, ["Planned start", "Slow return"], ["In time", "Too late"], ["In time", "Too late"], [okPlan ? "In time" : "Too late", okSlow ? "In time" : "Too late"],
        "A start is in time if it is no later than the latest start. For the slow return, rebuild the total time with the back leg at 3 km/h and check it against the same limit."),
    ];
    const ex = [
      exKm,
      `**Time on the move:** out ${km} ÷ ${v} × 60 = ${out} min; back ${km} ÷ ${back} × 60 = ${ret} min; together **${out + ret} min**.`,
      `**Latest start:** sunset ${hhmm(sunset)} − ${M} min margin = ${hhmm(sunset - M)}; take off ${out + ret} min walking and ${S} min stay (${total} min) to get **${hhmm(latest)}**.`,
      `**Verdict:** ${hhmm(rd)} is ${okPlan ? "no later than" : "after"} ${hhmm(latest)}: **${okPlan ? "In time" : "Too late"}**. With a 3 km/h return the back leg is ${slowRet} min, so the walk takes ${slowTotal} min and the group is back at ${hhmm(rd + slowTotal)} against a limit of ${hhmm(sunset - M)}: **${okSlow ? "In time" : "Too late"}**.`,
    ].join("\n\n");
    return finish(
      `A path measures **${cm} cm** on a map of scale ${scaleTxt}. A group walks it to a viewpoint at **${v} km/h**, stays **${S} minutes**, and walks back at **${back} km/h**. They must be back at the start at least **${M} minutes before sunset**, which is at **${hhmm(sunset)}**. Times are 24-hour.`,
      parts, ex, "geo-scalenow", { tier, n, cm, v, back, S, M, sunset, rd }, given.concat([["_stay", S], ["_margin", M]]),
      ["Convert map length to ground distance, then each leg to minutes.", "The latest start comes from working backwards from the sunset limit."],
    );
  }
  return tooMany();
}

// ---------- grid-route ----------

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25]];
const FEATURES = ["Mill", "Chapel", "Ford", "Quarry", "Farm", "Beacon", "Hut", "Barn", "Bridge", "Well"];
const fmtRef = (e, n) => `${String(e).padStart(3, "0")} ${String(n).padStart(3, "0")}`;
const bearingOf = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
const b3 = (b) => String(b).padStart(3, "0");
const WALK = [3, 4, 6];
const REF_RULE = "In a 6-figure reference the first 3 figures are the easting and the last 3 the northing, each in tenths of a kilometre (so 342 615 is 34.2 km east, 61.5 km north). Bearings are measured clockwise from grid north.";

function genGrid(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  for (let i = 0; i < TRY; i++) {
    const [a0, b0, c] = rng.pick(TRIPLES);
    const swap = rng.next() < 0.5;
    const k = rng.pick([2, 4, 6]);
    const sx = med ? 1 : rng.pick([-1, 1]);
    const sy = med ? 1 : rng.pick([-1, 1]);
    const dx = k * (swap ? b0 : a0) * sx, dy = k * (swap ? a0 : b0) * sy;
    const D = k * c; // tenths of a km
    const km = D / 10;
    const eA = rng.int(200, 700), nA = rng.int(200, 700);
    const eB = eA + dx, nB = nA + dy;
    if (eB < 120 || eB > 880 || nB < 120 || nB > 880) continue;
    const bear = Math.round(bearingOf(dx, dy)) % 360;
    if (nearHalf(bearingOf(dx, dy), 0, 0.08)) continue;
    const v = rng.pick(WALK);
    const minutes = (6 * D) / v;
    const given = []; // grid differences are the learner's own first step
    const refTxt = `Start **${fmtRef(eA, nA)}**, finish **${fmtRef(eB, nB)}**.`;
    const exDist = `**Distance:** across ${Math.abs(dx) / 10} km and along ${Math.abs(dy) / 10} km: √(${Math.abs(dx) / 10}² + ${Math.abs(dy) / 10}²) = **${km} km**.`;
    const dirTxt = `${dy >= 0 ? "north" : "south"} ${dx >= 0 ? "east" : "west"}`;
    const exBear = `**Bearing:** the finish is ${Math.abs(dx) / 10} km ${dx >= 0 ? "east" : "west"} and ${Math.abs(dy) / 10} km ${dy >= 0 ? "north" : "south"} of the start (${dirTxt}), so the bearing from north is **${b3(bear)}°** (nearest degree).`;
    const distPart = numPart("dist", "Distance", "Straight-line distance from start to finish (km)", km, 1, "Work out the difference in eastings and the difference in northings (in km), then use Pythagoras.", false);
    const bearPart = numPart("bear", "Bearing", "Bearing from the start to the finish (degrees, nearest whole degree)", bear, 0, "Find which way the finish lies (east or west, north or south), then use the angle whose tangent is easting difference ÷ northing difference, measured clockwise from north.");
    if (!plus) {
      const parts = [distPart, bearPart];
      let feat = null, names = null;
      if (!med) {
        const chosen = shuffled(rng, FEATURES).slice(0, 4);
        const mid = [eA + dx / 2, nA + dy / 2];
        const feats = [{ name: chosen[0], e: mid[0], n: mid[1] }];
        let guard = 0;
        while (feats.length < 4 && guard++ < 200) {
          const e = mid[0] + rng.int(-30, 30), n = mid[1] + rng.int(-30, 30);
          const cross = (e - eA) * dy - (n - nA) * dx;
          if (Math.abs(cross) / (D * 1) < 8) continue; // at least 0.8 km off the line
          if (feats.some((f) => Math.abs(f.e - e) < 5 && Math.abs(f.n - n) < 5)) continue;
          if (e < 100 || e > 899 || n < 100 || n > 899) continue;
          feats.push({ name: chosen[feats.length], e, n });
        }
        if (feats.length < 4) continue;
        feat = feats[0];
        names = shuffled(rng, feats);
        const choices = names.map((f) => `${f.name} (${fmtRef(f.e, f.n)})`);
        parts.push({ id: "feat", label: "On the route", ask: "Which of these features lies on the straight line from the start to the finish?", answerType: "choice", answer: `${feat.name} (${fmtRef(feat.e, feat.n)})`, choices, hint: "A feature on the straight line has an easting between the two eastings and a northing between the two northings, in the same proportion. Try the halfway point first: average the two eastings and the two northings." });
      }
      if (tier === "expert") parts.push(numPart("time", "Walking time", `Walking time for the straight route at ${v} km/h (minutes)`, minutes, 0, `Time = distance ÷ ${v} km/h, in hours, times 60 for minutes. Use the distance you found.`));
      const exFeat = feat ? `**On the route:** the halfway point is at (${fmtRef(eA + dx / 2, nA + dy / 2)}), which is the **${feat.name}**; the others are off the line.` : "";
      const exTime = tier === "expert" ? `**Walking time:** ${km} ÷ ${v} × 60 = **${minutes} min**.` : "";
      return finish(
        `${REF_RULE} A route runs in a straight line between two grid references. ${refTxt}${!med ? " Four features are marked on the map." : ""}`,
        parts.slice(0, TIER_PARTS[tier]), [exDist, exBear, exFeat, exTime].filter(Boolean).join("\n\n"), "geo-grid",
        { tier, eA, nA, eB, nB, km, bear, v, feats: feat ? names.map((f) => ({ name: f.name, e: f.e, n: f.n })) : [] }, given,
        ["Differences in easting and northing (in km) are the two short sides of a right-angled triangle.", "Do the distance first, then the bearing, then the rest."].concat(tier === "expert" ? ["The pace is in km/h; the answer is in minutes."] : []),
      );
    }
    // expert-plus: backwards from a deadline; dog-leg comparison
    const S = rng.pick([10, 15, 20, 30]);
    const direct = (6 * D) / v, dog = (6 * (Math.abs(dx) + Math.abs(dy))) / v;
    const DL = rng.int(150, 228) * 5; // 12:30..19:00
    const latest = DL - direct - S;
    if (latest < 240) continue;
    // Balance the verdicts: both in time, direct route only, or late either way (the dog-leg is always longer).
    const extra = dog - direct, combo = rng.int(0, 2);
    let rd;
    if (combo === 0) rd = latest - extra - rng.pick([5, 10, 15]);
    else if (combo === 1) {
      const offs = [0, 2, 5, 10, 15, 20, 25, 30].filter((o) => o < extra);
      rd = latest - rng.pick(offs);
    } else rd = latest + rng.pick([5, 10, 15, 20, 30]);
    if (rd < 240) continue;
    const okDirect = rd + direct + S <= DL;
    const okDog = rd + dog + S <= DL;
    if (rd + dog + S === DL) continue;
    const parts = [
      distPart, bearPart,
      timePart("latest", "Latest start", "Latest start time for the direct route", latest, `Work backwards from the deadline: take off the walking time for the direct route (distance ÷ ${v} km/h, in minutes) and the ${S}-minute rest.`),
      segPart2("verdict", "Verdict", `The group sets off at **${hhmm(rd)}**. Would they arrive in time by the direct route, and by a dog-leg (all the way east or west, then all the way north or south)?`, ["Direct route", "Dog-leg route"], ["In time", "Late"], ["In time", "Late"], [okDirect ? "In time" : "Late", okDog ? "In time" : "Late"],
        `The dog-leg length is the easting difference plus the northing difference (in km). Time it at ${v} km/h, add the rest, and compare each arrival with the deadline.`),
    ];
    const ex = [
      exDist, exBear,
      `**Latest start:** ${km} ÷ ${v} × 60 = ${direct} min walking; ${hhmm(DL)} − ${direct} − ${S} = **${hhmm(latest)}**.`,
      `**Verdict:** direct arrival ${hhmm(rd + direct + S)} is ${okDirect ? "no later than" : "after"} ${hhmm(DL)}: **${okDirect ? "In time" : "Late"}**. The dog-leg is ${(Math.abs(dx) + Math.abs(dy)) / 10} km (${dog} min), arriving ${hhmm(rd + dog + S)}: **${okDog ? "In time" : "Late"}**.`,
    ].join("\n\n");
    return finish(
      `${REF_RULE} A group walks from start **${fmtRef(eA, nA)}** to finish **${fmtRef(eB, nB)}** at **${v} km/h**, with one rest of **${S} minutes**. They must arrive by **${hhmm(DL)}** (24-hour).`,
      parts, ex, "geo-gridback", { tier, eA, nA, eB, nB, km, bear, v, S, DL, rd }, given.concat([["_rest", S]]),
      ["Distance and bearing come from the two differences in grid reference.", "The latest start works backwards from the deadline."],
    );
  }
  return tooMany();
}

// ---------- contour-slope ----------

const STEEP_R = [4, 5, 6, 8, 10];
function genContour(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  // Expert and Expert+ ask "steep?": decide it once, before the redraw loop, so it stays about even.
  const want = tier === "expert" || plus ? rng.next() < 0.5 : null;
  for (let i = 0; i < TRY; i++) {
    let R = rng.pick(STEEP_R);
    if (!plus) {
      const N = rng.int(3, 20);
      if (N === R) continue;
      const climb = rng.pick([20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150]);
      const ground = N * climb;
      const hA = rng.int(8, 60) * 10;
      const hB = hA + climb;
      const given = [["_hA", hA], ["_hB", hB]];
      let steep = N < R;
      const cmHint = "On a 1 : n map, 1 cm stands for n cm on the ground; convert to metres (100 cm = 1 m).";
      if (med) {
        return finish(
          `A path climbs from a spot height of **${hA} m** to **${hB} m** over a ground distance of **${commas(ground)} m**.`,
          [
            numPart("climb", "Climb", "Height gained (m)", climb, 0, "Subtract the lower spot height from the higher one."),
            numPart("n", "Gradient", "The gradient is 1 in N: find N (whole number)", N, 0, "Gradient 1 in N means N metres along the ground for each 1 metre climbed: N = ground distance ÷ climb."),
          ],
          `**Climb:** ${hB} − ${hA} = **${climb} m**.\n\n**Gradient:** ${commas(ground)} ÷ ${climb} = **1 in ${N}**.`,
          "geo-slope", { tier, ground, climb, N, R, hA, hB }, given.concat([["_ground", ground]]),
          ["The climb is a difference of heights.", "N is the ground distance divided by the climb."],
        );
      }
      // hard and expert: ground distance from the map length and a stated scale
      const sc = rng.pick([10000, 25000, 50000]);
      const mPerCm = sc / 100;
      const cm = ground / mPerCm;
      if (cm < 2 || cm > 30 || Math.round(cm * 2) !== cm * 2) continue;
      if (tier === "expert") {
        const Rs = STEEP_R.filter((r) => (want ? r > N : r < N));
        if (!Rs.length) continue;
        R = rng.pick(Rs);
        steep = N < R;
      }
      const mapTxt = `A path measures **${cm} cm** on a map of scale **1 : ${commas(sc)}**, climbing from **${hA} m** to **${hB} m**.`;
      const parts = [
        numPart("ground", "Ground distance", "Ground distance (m)", ground, 0, cmHint),
        numPart("climb", "Climb", "Height gained (m)", climb, 0, "Subtract the lower spot height from the higher one."),
        numPart("n", "Gradient", "The gradient is 1 in N: find N (whole number)", N, 0, "N = ground distance ÷ climb, both in metres."),
      ];
      if (tier === "expert") parts.push(yesNo("steep", "Steep?", `For this exercise a slope is **steep** if it is steeper than **1 in ${R}**. Is this path steep?`, steep, "A smaller N means a steeper slope: compare your N with the rule's N."));
      const ex = [
        `**Ground distance:** ${cm} cm × ${commas(sc)} = ${commas(cm * sc)} cm = **${commas(ground)} m**.`,
        `**Climb:** ${hB} − ${hA} = **${climb} m**.`,
        `**Gradient:** ${commas(ground)} ÷ ${climb} = **1 in ${N}**.`,
        tier === "expert" ? `**Steep?** 1 in ${N} is ${steep ? "steeper" : "not steeper"} than 1 in ${R} (${N} is ${steep ? "less" : "more"} than ${R}): **${steep ? "Yes" : "No"}**.` : "",
      ].filter(Boolean).join("\n\n");
      return finish(
        mapTxt, parts.slice(0, TIER_PARTS[tier]), ex, "geo-slopemap", { tier, cm, sc, climb, N, R, hA, hB }, given.concat([["_cm", cm]]),
        ["Ground distance first (from the map length and scale), then the climb, then N.", "Gradient 1 in N means N metres along for 1 metre up."],
      );
    }
    // expert-plus: backwards from contour count and a stated gradient
    const I = rng.pick([10, 20, 25, 50]);
    const cnt = rng.int(2, 9);
    const N = rng.int(3, 16);
    if (N === R) continue;
    const climb = cnt * I;
    const ground = N * climb;
    const sc = rng.pick([10000, 25000, 50000]);
    const cm = ground / (sc / 100);
    if (cm < 2 || cm > 40 || Math.round(cm * 2) !== cm * 2) continue;
    const angle = (Math.atan(1 / N) * 180) / Math.PI;
    if (nearHalf(angle, 1, 0.1)) continue;
    const L = climb + rng.pick([-1, 1]) * rng.pick([20, 30, 50]) ;
    if (L <= 0) continue;
    {
      const Rs = STEEP_R.filter((r) => (want ? r > N : r < N));
      if (!Rs.length) continue;
      R = rng.pick(Rs);
    }
    const steep = N < R, within = climb <= L;
    const parts = [
      numPart("climb", "Climb", "Height gained along the path (m)", climb, 0, `The path climbs exactly ${cnt} contour intervals of ${I} m each.`),
      numPart("cm", "Map length", `Length of the path on the map (cm)`, cm, 1, `Ground distance = N × climb for a gradient of 1 in N. Then turn metres into map centimetres using the scale (1 cm on the map is ${commas(sc / 100)} m).`, false),
      numPart("angle", "Slope angle", "Angle of slope above the horizontal (degrees)", angle, 1, "The slope is a right-angled triangle with 1 m up for every N m along the ground: tan(angle) = 1 ÷ N. Use the inverse tangent.", false),
      segPart2("verdict", "Verdict", `A slope is **steep** if it is steeper than **1 in ${R}**, and a day's climb is within limit if it is at most **${L} m**. Judge this path.`, ["Slope", "Climb limit"], ["Steep", "Not steep"], ["Within limit", "Over limit"], [steep ? "Steep" : "Not steep", within ? "Within limit" : "Over limit"],
        "A smaller N means a steeper slope. For the limit, compare the climb you found with the stated maximum."),
    ];
    const ex = [
      `**Climb:** ${cnt} × ${I} = **${climb} m**.`,
      `**Map length:** ground distance = ${N} × ${climb} = ${commas(ground)} m = ${commas(ground * 100)} cm; ÷ ${commas(sc)} = **${cm} cm**.`,
      `**Slope angle:** tan⁻¹(1 ÷ ${N}) = **${roundTo(angle, 1).toFixed(1)}°**.`,
      `**Verdict:** 1 in ${N} is ${steep ? "steeper" : "not steeper"} than 1 in ${R}: **${steep ? "Steep" : "Not steep"}**. ${climb} m is ${within ? "at most" : "more than"} ${L} m: **${within ? "Within limit" : "Over limit"}**.`,
    ].join("\n\n");
    return finish(
      `A path crosses **${cnt} contour intervals** (contour interval **${I} m**) at a steady gradient of **1 in ${N}**. The map scale is **1 : ${commas(sc)}**.`,
      parts, ex, "geo-slopeback", { tier, cnt, I, N, sc, R, L }, [["_lines", cnt], ["_interval", I], ["_N", N]],
      ["Climb comes from counting intervals; the rest follows from the gradient.", "The map length comes last, from the ground distance and the scale."],
    );
  }
  return tooMany();
}

// ---------- climate-table ----------

const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TBANDS = ["Hot", "Mild", "Cold"], RBANDS = ["Dry", "Moderate", "Wet"];
// Cold and wet (1 500 mm or more below a 5 °C mean) is rare and is never drawn; it only appears as a decoy band.
const BIOMES = { "Hot|Dry": "Desert", "Hot|Moderate": "Savanna", "Hot|Wet": "Tropical rainforest", "Mild|Dry": "Steppe", "Mild|Moderate": "Temperate woodland", "Mild|Wet": "Temperate rainforest", "Cold|Dry": "Tundra", "Cold|Moderate": "Boreal forest" };
const BAND_RULE = "For this exercise: **Hot** = mean annual temperature of 20 °C or more, **Mild** = from 5 °C up to 20 °C, **Cold** = below 5 °C; **Dry** = under 500 mm a year, **Moderate** = 500 mm up to 1 500 mm, **Wet** = 1 500 mm or more.";
const BIOME_RULE = "Biome by (temperature, rainfall): Hot Dry = Desert, Hot Moderate = Savanna, Hot Wet = Tropical rainforest; Mild Dry = Steppe, Mild Moderate = Temperate woodland, Mild Wet = Temperate rainforest; Cold Dry = Tundra, Cold Moderate = Boreal forest (Cold Wet is not used).";

function climateData(rng, med) {
  for (let t = 0; t < 200; t++) {
    const m0 = rng.int(-6, 30), A = rng.int(2, 14), ph = rng.int(0, 11);
    const base = rng.pick([40, 120, 250, 500, 900, 1400, 2200]) / 12; // mean monthly rain
    const amp = rng.pick([0.2, 0.5, 0.8]), rph = rng.int(0, 11);
    const step = med ? 10 : 5;
    const T = [], P = [];
    for (let i = 0; i < 12; i++) {
      T.push(Math.round(m0 + A * Math.cos(((i - ph) * Math.PI) / 6)));
      P.push(Math.max(0, Math.round((base * (1 + amp * Math.cos(((i - rph) * Math.PI) / 6))) / step) * step));
    }
    // A smooth curve has equal neighbours either side of its low and high points: make one month clearly
    // the driest and one clearly the wettest, so dry climates are possible too.
    P[(rph + 6) % 12] = Math.max(0, P[(rph + 6) % 12] - 10);
    P[rph] += 10;
    const hot = Math.max(...T), cold = Math.min(...T);
    const dry = Math.min(...P), wet = Math.max(...P);
    if (hot - cold < 3 || hot > 36) continue;
    if (P.filter((x) => x === dry).length > 1 || P.filter((x) => x === wet).length > 1) continue;
    const sorted = P.slice().sort((a, b) => a - b);
    if (sorted[1] - sorted[0] < 10) continue; // clear driest month
    if (sorted[11] - sorted[10] < 10) continue;
    const total = P.reduce((a, b) => a + b, 0);
    if (total < 60) continue;
    if (Math.abs(total - 500) < 60 || Math.abs(total - 1500) < 100) continue;
    if (T.reduce((a, b) => a + b, 0) / 12 < 5 && total >= 1500) continue; // no cold, very wet climates
    return { T, P };
  }
  return null;
}
const tableMd = (T, P, hideIdx = -1) => ["| Month | Temp (°C) | Rain (mm) |", "|---|---|---|"].concat(MONTHS3.map((m, i) => `| ${m} | ${T[i]} | ${i === hideIdx ? "?" : P[i]} |`)).join("\n");

function bandOptions(rng, tb, rb) {
  // answer + others; at least one differs in both columns; answer value not the most common in every column
  for (let t = 0; t < 100; t++) {
    const all = [];
    for (const x of TBANDS) for (const y of RBANDS) if (!(x === tb && y === rb)) all.push([x, y]);
    const picked = shuffled(rng, all).slice(0, 4);
    const opts = picked.concat([[tb, rb]]);
    if (!picked.some(([x, y]) => x !== tb && y !== rb)) continue;
    const cT = opts.filter((o) => o[0] === tb).length, cR = opts.filter((o) => o[1] === rb).length;
    const maxT = Math.max(...TBANDS.map((b) => opts.filter((o) => o[0] === b).length));
    const maxR = Math.max(...RBANDS.map((b) => opts.filter((o) => o[1] === b).length));
    if (cT === maxT && cR === maxR) continue;
    return shuffled(rng, opts);
  }
  return null;
}
const bandOf = (mean, total) => [mean >= 20 ? "Hot" : mean >= 5 ? "Mild" : "Cold", total < 500 ? "Dry" : total < 1500 ? "Moderate" : "Wet"];

function genClimate(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  for (let i = 0; i < TRY; i++) {
    const d = climateData(rng, med);
    if (!d) continue;
    const { T, P } = d;
    const range = Math.max(...T) - Math.min(...T);
    const total = P.reduce((a, b) => a + b, 0);
    const sumT = T.reduce((a, b) => a + b, 0);
    const mean = sumT / 12;
    const driestIdx = P.indexOf(Math.min(...P));
    const given = [["_hot", Math.max(...T)], ["_cold", Math.min(...T)]];
    const exRange = `**Annual range:** hottest ${Math.max(...T)} °C − coldest ${Math.min(...T)} °C = **${range} °C**.`;
    const exTotal = `**Total rainfall:** adding the twelve months gives **${commas(total)} mm**.`;
    if (!plus) {
      const parts = [
        numPart("range", "Temperature range", "Annual temperature range: hottest month minus coldest month (°C)", range, 0, "Find the highest and the lowest monthly temperature in the table, then subtract."),
        numPart("total", "Total rainfall", "Total annual rainfall (mm)", total, 0, "Add the twelve monthly rainfall figures."),
      ];
      let exs = [exRange, exTotal];
      if (tier === "hard") {
        const others = shuffled(rng, MONTHS3.filter((m, j) => j !== driestIdx)).slice(0, 3);
        const choices = shuffled(rng, others.concat([MONTHS3[driestIdx]]));
        parts.push({ id: "dry", label: "Driest month", ask: "Which month is the driest?", answerType: "choice", answer: MONTHS3[driestIdx], choices, hint: "Look down the rainfall column for the smallest value." });
        exs.push(`**Driest month:** the smallest rainfall is ${P[driestIdx]} mm, in **${MONTHS3[driestIdx]}**.`);
      }
      let mTxt = "";
      if (tier === "expert") {
        if (nearHalf(mean, 1, 0.03)) continue;
        const [tb, rb] = bandOf(mean, total);
        if (Math.abs(mean - 20) < 1.5 || Math.abs(mean - 5) < 1.5) continue;
        const opts = bandOptions(rng, tb, rb);
        if (!opts) continue;
        parts.push(numPart("mean", "Mean temperature", "Mean annual temperature: the average of the twelve monthly figures (°C)", mean, 1, "Add the twelve temperatures (watch the minus signs) and divide by 12.", false));
        parts.push(segPart2("bands", "Bands", `Classify the climate. ${BAND_RULE}`, ["Temperature", "Rainfall"], TBANDS, RBANDS, [tb, rb], "Compare your mean temperature and your total rainfall with the cut-offs in the rule."));
        parts[3].choices = opts;
        exs.push(`**Mean temperature:** ${sumT} ÷ 12 = **${roundTo(mean, 1).toFixed(1)} °C**.`, `**Bands:** ${roundTo(mean, 1).toFixed(1)} °C is **${tb}**; ${commas(total)} mm is **${rb}**.`);
        mTxt = "";
      }
      return finish(
        `A weather station records these monthly figures over a typical year (made-up data for practice).\n\n${tableMd(T, P)}${mTxt}`,
        parts.slice(0, TIER_PARTS[tier]), exs.join("\n\n"), "geo-climate", { tier, T, P }, given,
        ["Read down the columns: highest minus lowest for the range; add for the total.", "Work from the table only; no figure needs a calculator beyond adding."],
      );
    }
    // expert-plus: one rainfall month is hidden; the annual total is stated
    const hid = rng.int(0, 11);
    if (hid === driestIdx || P[hid] === Math.max(...P)) continue;
    if (nearHalf(mean, 1, 0.03) || Math.abs(mean - 20) < 1.5 || Math.abs(mean - 5) < 1.5) continue;
    const [tb, rb] = bandOf(mean, total);
    const opts = bandOptions(rng, tb, rb);
    if (!opts) continue;
    const biome = BIOMES[`${tb}|${rb}`];
    const bchoices = [biome].concat(shuffled(rng, Object.values(BIOMES).filter((b) => b !== biome)).slice(0, 3));
    const parts = [
      numPart("hidden", "Missing month", `Rainfall in ${MONTHS3[hid]} (mm)`, P[hid], 0, "The twelve months add up to the stated annual total: subtract the eleven known months from it."),
      numPart("mean", "Mean temperature", "Mean annual temperature (°C)", mean, 1, "Add the twelve temperatures (watch the minus signs) and divide by 12.", false),
      segPart2("bands", "Bands", `Classify the climate. ${BAND_RULE}`, ["Temperature", "Rainfall"], TBANDS, RBANDS, [tb, rb], "Compare the mean temperature and the annual total with the cut-offs."),
      { id: "biome", label: "Biome", ask: `Which biome does this climate point to? ${BIOME_RULE}`, answerType: "choice", answer: biome, choices: shuffled(rng, bchoices), hint: "Use your two bands as the row and column of the biome rule." },
    ];
    parts[2].choices = opts;
    const ex = [
      `**Missing month:** ${commas(total)} − (sum of the other eleven months, ${commas(total - P[hid])}) = **${P[hid]} mm**.`,
      `**Mean temperature:** ${sumT} ÷ 12 = **${roundTo(mean, 1).toFixed(1)} °C**.`,
      `**Bands:** ${roundTo(mean, 1).toFixed(1)} °C is **${tb}** and ${commas(total)} mm is **${rb}**.`,
      `**Biome:** ${tb} and ${rb} give **${biome}**.`,
    ].join("\n\n");
    return finish(
      `A station's rainfall for ${MONTHS3[hid]} was lost (shown as ?). Its **annual total was ${commas(total)} mm**. Made-up data for practice.\n\n${tableMd(T, P, hid)}`,
      parts, ex, "geo-climateback", { tier, T, P, hid, total }, [["_total", total]],
      ["The annual total lets you recover the missing month.", "Bands first, then the biome table."],
    );
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "scale-journey") return genScale(rng, difficulty);
  if (subtopic === "grid-route") return genGrid(rng, difficulty);
  if (subtopic === "contour-slope") return genContour(rng, difficulty);
  if (subtopic === "climate-table") return genClimate(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (minute counting, vector
// cross products, sorting and summing the table). Numbers must be within tolerance; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");
const timeMins = (s) => {
  const t = String(s).trim().replace(/\s+/g, "");
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(t) || /^(\d{2})(\d{2})$/.exec(t);
  if (!m || +m[1] > 23 || +m[2] > 59) return NaN;
  return +m[1] * 60 + +m[2];
};
const IT = (b) => (b ? "In time" : "Too late");

const ALT = {
  "geo-scale": (p) => {
    const km = (p.cm * p.n) / 1e5;
    const out = Math.round((km / p.v) * 60), ret = Math.round((km / p.back) * 60);
    const stay = p.tier === "medium" ? 0 : p.S;
    const backAt = p.dep + out + stay + ret;
    return { km, out, back: backAt, dark: YN(backAt <= p.sunset) };
  },
  "geo-scalenow": (p) => {
    const km = (p.cm * p.n) / 1e5;
    const out = (km / p.v) * 60, ret = (km / p.back) * 60;
    const latest = p.sunset - p.M - (out + ret + p.S);
    const lim = p.sunset - p.M;
    return { km, total: out + ret, latest, verdict: `${IT(p.rd <= latest)} | ${IT(p.rd + out + p.S + (km / 3) * 60 <= lim)}` };
  },
  "geo-grid": (p) => {
    const dx = p.eB - p.eA, dy = p.nB - p.nA;
    let b = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
    b = (b + 360) % 360;
    const dist = Math.hypot(dx, dy) / 10;
    const on = (p.feats || []).filter((f) => {
      const cr = (f.e - p.eA) * dy - (f.n - p.nA) * dx;
      const t = ((f.e - p.eA) * dx + (f.n - p.nA) * dy) / (dx * dx + dy * dy);
      return cr === 0 && t > 0 && t < 1;
    });
    const f = on.length === 1 ? on[0] : null;
    const out = { dist, bear: b, time: Math.round((dist / p.v) * 60) };
    if (f) out.feat = `${f.name} (${String(f.e).padStart(3, "0")} ${String(f.n).padStart(3, "0")})`;
    else if ((p.feats || []).length) out.feat = null;
    return out;
  },
  "geo-gridback": (p) => {
    const dx = p.eB - p.eA, dy = p.nB - p.nA;
    const b = (Math.round((Math.atan2(dx, dy) * 180) / Math.PI) + 360) % 360;
    const dist = Math.hypot(dx, dy) / 10;
    const lim = p.DL - p.S;
    const latest = lim - (dist / p.v) * 60;
    const dogT = ((Math.abs(dx) + Math.abs(dy)) / 10 / p.v) * 60;
    return { dist, bear: b, latest, verdict: `${p.rd + (dist / p.v) * 60 <= lim ? "In time" : "Late"} | ${p.rd + dogT <= lim ? "In time" : "Late"}` };
  },
  "geo-slope": (p) => ({ climb: p.hB - p.hA, n: p.ground / (p.hB - p.hA) }),
  "geo-slopemap": (p) => {
    const ground = (p.cm * p.sc) / 100;
    const climb = p.hB - p.hA;
    return { ground, climb, n: ground / climb, steep: YN(ground / climb < p.R) };
  },
  "geo-slopeback": (p) => {
    const climb = p.cnt * p.I;
    const ground = p.N * climb;
    return { climb, cm: ground / (p.sc / 100), angle: Math.atan2(1, p.N) * (180 / Math.PI), verdict: `${1 / p.N > 1 / p.R ? "Steep" : "Not steep"} | ${climb <= p.L ? "Within limit" : "Over limit"}` };
  },
  "geo-climate": (p) => {
    const hi = p.T.reduce((a, b) => (b > a ? b : a), -Infinity), lo = p.T.reduce((a, b) => (b < a ? b : a), Infinity);
    const total = p.P.reduce((a, b) => a + b, 0);
    const mean = p.T.reduce((a, b) => a + b, 0) / 12;
    const ranked = p.P.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const [tb, rb] = bandOf(mean, total);
    return { range: hi - lo, total, dry: MONTHS3[ranked[0][1]], mean, bands: `${tb} | ${rb}` };
  },
  "geo-climateback": (p) => {
    const mean = p.T.reduce((a, b) => a + b, 0) / 12;
    const known = p.P.reduce((a, v, i) => (i === p.hid ? a : a + v), 0);
    const [tb, rb] = bandOf(mean, p.total);
    return { hidden: p.total - known, mean, bands: `${tb} | ${rb}`, biome: BIOMES[`${tb}|${rb}`] };
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
      if (!near(partNum(answer, part.id), tv, tolOf(dp))) return false;
    } else if (part.answerType === "text") {
      if (timeMins(partStr(answer, part.id)) !== tv) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
