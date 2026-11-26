// Map skills generator. Uses only the seeded rng passed in by the engine.
// Conventions (stated in every prompt that needs them):
//   - A scale 1 : n means 1 cm on the map is n cm on the ground; 1 km = 100 000 cm.
//   - Grid squares are 1 km across; references give the easting (along) before the northing (up),
//     and a square is named by the lines on its west and south edges.
//   - Bearings are measured clockwise from north, written with three figures (045°), 0 to 359.
//   - Time zones use fixed UTC offsets with no daylight saving.
// params: { kind, dp, rounded, ... }. verify() checks each answer by a different route: residuals
// for distances, point-in-square tests for grid references, ray tests for bearings, and JS Date
// arithmetic for time zones.

// ---------- formatting ----------

function round(n, dp = 0) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
const fix = (n, dp) => round(n, dp).toFixed(dp);
import { fmtNum } from "../../js/lib/mathutil.js";
const num = (n) => fmtNum(n, 6);
// Thousands grouped with non-breaking spaces (prose only): 25 000.
function big(n) {
  const [i, d] = num(n).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return d ? `${g}.${d}` : g;
}
const scaleStr = (n) => `1 : ${big(n)}`;
const b3 = (b) => String(b).padStart(3, "0"); // three-figure bearing
const par = (n) => (n < 0 ? `(${num(n)})` : num(n)); // negatives in brackets inside a formula
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STEP = (dp) => 10 ** -dp;
const DP = (dp) => (dp === 0 ? " Round to the nearest whole number." : ` Round to ${dp} decimal place${dp === 1 ? "" : "s"}.`);
const THEN = (dp) => (dp === 0 ? " Then round to the nearest whole number." : ` Then round to ${dp} decimal place${dp === 1 ? "" : "s"}.`);
const DEG = Math.PI / 180;
const G = (label, value) => ({ label, value });

function resultLine(exact, dp, rounded, unit) {
  const u = unit ? ` ${unit}` : "";
  if (!rounded) return `= **${num(exact)}${u}**`;
  const shown = fix(exact, dp);
  if (Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${Number(exact.toPrecision(7))}${u}, which rounds to **${shown}${u}**`;
}

function numChoices(exact, dp, rounded, candidates, rng, fmtOut, max = Infinity) {
  const decimals = rounded ? dp : (String(num(exact)).split(".")[1] || "").length;
  const fmt = fmtOut || ((v) => (rounded ? fix(v, dp) : num(round(v, decimals))));
  const correct = fmt(exact);
  const seen = new Set([correct]);
  const out = [];
  const add = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v < 0 || v > max) return;
    if (exact > 0 && (v / exact > 1000 || v / exact < 0.001)) return;
    const s = fmt(v);
    if ((Number(s) <= 0 && exact > 0) || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(add);
  for (const f of [1.1, 0.9, 1.25, 0.8, 1.5, 0.5, 2]) add(exact * f);
  for (let k = 1; out.length < 3 && k < 60; k++) add(exact + k * STEP(decimals));
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

// q: { prompt, exact, dp, rounded, unit, steps, hints, candidates, params, given, choiceRate, fmtOut }
function single(q, rng) {
  if (!Number.isFinite(q.exact) || q.exact < 0) throw new Error("bad answer");
  const base = {
    prompt: q.prompt,
    tolerance: q.rounded ? 0.5 * STEP(q.dp) : 0,
    explanation: [...q.steps.slice(0, -1), `${q.steps[q.steps.length - 1]} ${resultLine(q.exact, q.dp, q.rounded, q.unit)}`].join("\n\n"),
    params: { ...q.params, dp: q.dp, rounded: q.rounded },
    hints: q.hints,
  };
  if (q.given && q.given.length) base.given = q.given;
  if (rng.next() < (q.choiceRate ?? 0.35)) {
    const { answer, choices } = numChoices(q.exact, q.dp, q.rounded, q.candidates || [], rng, q.fmtOut, q.max);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: q.rounded ? round(q.exact, q.dp) : q.exact, answerType: "number", choices: undefined };
}

function numPart(id, label, ask, exact, dp, rounded, hint, spec) {
  return {
    part: { id, label, ask, answerType: "number", answer: rounded ? round(exact, dp) : exact, tolerance: rounded ? 0.5 * STEP(dp) : 0, hint },
    spec: { id, ...spec, dp, rounded },
  };
}

function multi(prompt, list, explanation, hint, given) {
  const q = {
    prompt,
    answerType: "multi",
    hints: [hint],
    parts: list.map((p) => p.part),
    explanation,
    params: { multi: true, parts: list.map((p) => p.spec) },
  };
  if (given && given.length) q.given = given;
  return q;
}

// ======================================================================================
// Scale & distance

const SCALE_NOTE = (n) => `On a ${scaleStr(n)} map, 1 cm on the map is ${big(n)} cm on the ground (1 m = 100 cm, 1 km = 100 000 cm).`;
const PLACES = ["the church", "the youth hostel", "the farm", "the bridge", "the car park", "the lighthouse", "the summit cairn", "the campsite", "the railway station", "the windmill", "the lake shore", "the visitor centre", "the castle", "the ford", "the post office", "the school"];

function twoPlaces(rng) {
  const [a, b] = rng.shuffle(PLACES).slice(0, 2);
  return [a, b];
}

function genScale(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["map-km", "map-m", "real-cm"]);
    const [A, B] = twoPlaces(rng);
    if (kind === "map-km") {
      const n = rng.pick([50000, 100000, 200000]);
      const cm = n === 50000 ? 2 * rng.int(1, 12) : rng.int(2, 20);
      const km = (cm * n) / 1e5;
      return single({
        prompt: `${SCALE_NOTE(n)} On the map, ${A} and ${B} are ${cm} cm apart. How far apart are they on the ground, in km?`,
        exact: km, dp: 0, rounded: false, unit: "km",
        steps: [`Ground distance in cm: \`${cm} × ${n}\` = ${big(cm * n)} cm.`, "Divide by 100 000 to get km:"],
        hints: [`Multiply the map distance by ${big(n)} to get centimetres on the ground.`, "Then change cm into km by dividing by 100 000 (in the calculator: `_cm * _n / 100000`)."],
        candidates: [(cm * n) / 1e3, (cm * n) / 1e4, cm * n / 1e6],
        params: { kind, cm, n, unitCm: 1e5 },
        given: [G("_cm", cm), G("_n", n)],
      }, rng);
    }
    if (kind === "map-m") {
      const n = rng.pick([5000, 10000, 20000, 25000]);
      const cm = rng.int(2, 24);
      const m = (cm * n) / 100;
      return single({
        prompt: `${SCALE_NOTE(n)} On the map, the path from ${A} to ${B} measures ${cm} cm. How long is it on the ground, in metres?`,
        exact: m, dp: 0, rounded: false, unit: "m",
        steps: [`Ground distance in cm: \`${cm} × ${n}\` = ${big(cm * n)} cm.`, "Divide by 100 to get metres:"],
        hints: [`Multiply by ${big(n)} to get centimetres on the ground.`, "Then divide by 100 to change cm into metres (in the calculator: `_cm * _n / 100`)."],
        candidates: [m * 10, m / 10, cm * n],
        params: { kind, cm, n, unitCm: 100 },
        given: [G("_cm", cm), G("_n", n)],
      }, rng);
    }
    const n = rng.pick([25000, 50000, 100000]);
    const km = rng.int(1, 12);
    const cm = (km * 1e5) / n;
    return single({
      prompt: `${SCALE_NOTE(n)} ${cap(A)} is ${km} km from ${B} in a straight line. How far apart will they be on the map, in cm?`,
      exact: cm, dp: 0, rounded: false, unit: "cm",
      steps: [`Ground distance in cm: \`${km} × 100000\` = ${big(km * 1e5)} cm.`, `Divide by ${big(n)}:`],
      hints: ["Change the real distance into centimetres first (× 100 000).", `Then divide by ${big(n)} (in the calculator: \`_km * 100000 / _n\`).`],
      candidates: [cm * 10, cm / 10, km * n / 1e5],
      params: { kind: "real-cm", km, n },
      given: [G("_km", km), G("_n", n)],
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["map-m", "real-cm", "walk"]);
    const [A, B] = twoPlaces(rng);
    const n = rng.pick([10000, 25000, 50000, 100000, 250000]);
    if (kind === "map-m") {
      const cm = rng.int(11, 199) / 10;
      const m = round((cm * n) / 100, 6);
      return single({
        prompt: `${SCALE_NOTE(n)} On the map, ${A} and ${B} are ${fix(cm, 1)} cm apart. How far apart are they on the ground, in metres? Give the exact value.`,
        exact: m, dp: 0, rounded: false, unit: "m",
        steps: [`Ground distance in cm: \`${fix(cm, 1)} × ${n}\` = ${big(cm * n)} cm.`, "Divide by 100 for metres:"],
        hints: [`Multiply the map distance by ${big(n)} to get centimetres on the ground.`, "Change cm into metres by dividing by 100 (in the calculator: `_cm * _n / 100`)."],
        candidates: [m / 10, m * 10, m / 1000],
        params: { kind, cm, n, unitCm: 100 },
        given: [G("_cm", cm), G("_n", n)],
      }, rng);
    }
    if (kind === "real-cm") {
      const km = rng.int(5, 300) / 10;
      const exact = (km * 1e5) / n;
      if (exact < 0.5 || exact > 60) return genScale("medium", rng); // keep map distances sensible
      return single({
        prompt: `${SCALE_NOTE(n)} ${cap(A)} is ${fix(km, 1)} km from ${B}. How far apart are they on the map, in cm?${DP(1)}`,
        exact, dp: 1, rounded: true, unit: "cm",
        steps: [`Real distance in cm: \`${fix(km, 1)} × 100000\` = ${big(km * 1e5)} cm.`, `Divide by ${big(n)}:`],
        hints: ["Change km into cm first (× 100 000).", `Then divide by ${big(n)} (in the calculator: \`_km * 100000 / _n\`).${THEN(1)}`],
        candidates: [exact * 10, exact / 10, exact * 100],
        params: { kind, km, n },
        given: [G("_km", km), G("_n", n)],
      }, rng);
    }
    const cm = rng.int(20, 250) / 10;
    const s = rng.pick([3, 4, 5]);
    const km = (cm * n) / 1e5;
    const exact = (km / s) * 60;
    if (exact < 5 || exact > 600) return genScale("medium", rng);
    return single({
      prompt: `${SCALE_NOTE(n)} A walking route from ${A} to ${B} measures ${fix(cm, 1)} cm on the map. Walking at a steady ${s} km/h, how many minutes does the walk take?${DP(0)}`,
      exact, dp: 0, rounded: true, unit: "minutes",
      steps: [`Real distance: \`${fix(cm, 1)} × ${n} / 100000\` = ${num(km)} km.`, `Time in hours = distance ÷ speed = \`${num(km)} / ${s}\` = ${num(km / s)} h. Multiply by 60:`],
      hints: [
        `Find the real distance in km first: map cm × ${big(n)} ÷ 100 000.`,
        `Time in hours = km ÷ ${s}; multiply by 60 for minutes (in the calculator: \`_cm * _n / 100000 / _s * 60\`).${THEN(0)}`,
      ],
      candidates: [km / s, km * s * 60 / 10, exact / 60 * 100],
      params: { kind, cm, n, s },
      given: [G("_cm", cm), G("_n", n), G("_s", s)],
    }, rng);
  }

  // hard
  const kind = rng.pick(["gradient", "area", "find-scale", "multi"]);
  if (kind === "gradient") {
    const n = rng.pick([25000, 50000]);
    const ci = n === 25000 ? rng.pick([5, 10]) : rng.pick([10, 20]);
    const lo = ci * rng.int(5, 40);
    const rise = ci * rng.int(3, 30);
    const hi = lo + rise;
    const cm = rng.int(10, 120) / 10;
    const horiz = (cm * n) / 100; // m
    const exact = horiz / rise;
    if (exact < 1.5 || exact > 200) return genScale("hard", rng);
    const [A, B] = twoPlaces(rng);
    const up = rng.next() < 0.5;
    return single({
      prompt: `${SCALE_NOTE(n)} The contour interval is ${ci} m. ${cap(A)} is on the ${up ? lo : hi} m contour and ${B} is on the ${up ? hi : lo} m contour, ${fix(cm, 1)} cm apart on the map. Write the average gradient between them as 1 : n (vertical : horizontal, in the same units). What is n?${DP(0)}`,
      exact, dp: 0, rounded: true, unit: "",
      steps: [
        `Vertical difference: \`${hi} - ${lo}\` = ${rise} m.`,
        `Horizontal distance: \`${fix(cm, 1)} × ${n} / 100\` = ${num(horiz)} m.`,
        `n = horizontal ÷ vertical = \`${num(horiz)} / ${rise}\``,
      ],
      hints: [
        "Find the height difference from the contour values, and the real horizontal distance in metres from the map.",
        `Gradient 1 : n means n = horizontal ÷ vertical (in the calculator: \`_cm * _n / 100 / (_hi - _lo)\`).${THEN(0)}`,
      ],
      candidates: [rise / horiz * 100, (cm * n) / 1e5 / rise * 1000 / 10, exact * 10],
      params: { kind, cm, n, rise },
      given: [G("_cm", cm), G("_n", n), G("_hi", hi), G("_lo", lo)],
    }, rng);
  }
  if (kind === "area") {
    const n = rng.pick([10000, 25000, 50000]);
    const a = rng.int(15, 400) / 10; // cm²
    const exact = a * (n / 1e5) ** 2;
    const what = rng.pick(["A lake", "A forest", "A nature reserve", "A reservoir", "A golf course", "A field system", "An island"]);
    return single({
      prompt: `${SCALE_NOTE(n)} ${what} covers ${fix(a, 1)} cm² on the map. What is its real area, in km²?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "km²",
      steps: [
        `1 cm on the map is \`${n} / 100000\` = ${num(n / 1e5)} km on the ground.`,
        `So 1 cm² on the map is \`${num(n / 1e5)}²\` = ${num((n / 1e5) ** 2)} km².`,
        `Area: \`${fix(a, 1)} × ${num((n / 1e5) ** 2)}\``,
      ],
      hints: [
        `First find how many km 1 cm on the map stands for (${big(n)} ÷ 100 000).`,
        `Areas scale by the square of that: multiply the map area by it squared (in the calculator: \`_a * (_n / 100000)^2\`).${THEN(2)}`,
      ],
      candidates: [a * (n / 1e5), exact * 10, exact * 100],
      params: { kind, a, n },
      given: [G("_a", a), G("_n", n)],
    }, rng);
  }
  if (kind === "find-scale") {
    const n = rng.pick([10000, 25000, 50000, 100000, 250000]);
    const cm = rng.int(2, 24);
    const km = (cm * n) / 1e5;
    const [A, B] = twoPlaces(rng);
    const opts = [n, n * 10, n / 10, n * 2].map(scaleStr);
    return {
      prompt: `${cap(A)} and ${B} are ${num(km)} km apart on the ground and ${cm} cm apart on a map. What is the scale of the map? (1 km = 100 000 cm.)`,
      answer: scaleStr(n),
      answerType: "choice",
      choices: rng.shuffle([...new Set(opts)]),
      explanation: `Put both distances in cm: ${num(km)} km = \`${num(km)} × 100000\` = ${big(km * 1e5)} cm.\n\nScale = map : ground = ${cm} : ${big(km * 1e5)}. Divide both by ${cm}: **${scaleStr(n)}**.`,
      hints: ["A scale compares the same units, so change the ground distance into cm (× 100 000).", `Then divide the ground distance in cm by the map distance (${cm} cm) to get n in 1 : n.`],
      params: { kind, cm, km },
    };
  }
  // multi: two legs -> total distance (2 dp) and time from the rounded distance
  const n = rng.pick([25000, 50000]);
  const c1 = rng.int(15, 120) / 10, c2 = rng.int(15, 120) / 10;
  const s = rng.pick([3, 4, 5]);
  const km = ((c1 + c2) * n) / 1e5;
  const kr = round(km, 2);
  const mins = (kr / s) * 60;
  const [A, B] = twoPlaces(rng);
  const C = rng.pick(PLACES.filter((p) => p !== A && p !== B));
  return multi(
    `${SCALE_NOTE(n)} A route goes from ${A} to ${C} (${fix(c1, 1)} cm on the map) and then on to ${B} (${fix(c2, 1)} cm). A group walks it at a steady ${s} km/h.`,
    [
      numPart("dist", "Distance", "Total real distance in km, rounded to 2 decimal places.", km, 2, true,
        `Add the two map lengths, then multiply by ${big(n)} and divide by 100 000 (in the calculator: \`(_c1 + _c2) * _n / 100000\`).`,
        { kind: "map-km", cm: round(c1 + c2, 6), n, unitCm: 1e5 }),
      numPart("time", "Time", "Walking time in minutes, rounded to the nearest whole number. Use your rounded distance.", mins, 0, true,
        `Time in hours = distance ÷ ${s}; then × 60 for minutes.`,
        { kind: "walk-km", km: kr, s }),
    ],
    `Distance first, then time.\n\n- \`(${fix(c1, 1)} + ${fix(c2, 1)}) × ${n} / 100000\` ${resultLine(km, 2, true, "km")}\n- \`${fix(kr, 2)} / ${s} × 60\` ${resultLine(mins, 0, true, "minutes")}`,
    "Work out the real length of the whole route first, then use time = distance ÷ speed.",
    [G("_c1", c1), G("_c2", c2), G("_n", n), G("_s", s)],
  );
}

// ======================================================================================
// Grid references

const FEATURES = ["church", "windmill", "farm", "post office", "school", "pub", "radio mast", "campsite", "youth hostel", "bridge", "car park", "picnic site", "viewpoint", "castle", "railway station", "museum", "golf course", "ford", "quarry", "lighthouse"];
const GRID_NOTE = "Grid squares are 1 km across. Each column is labelled with the easting line on its west (left) edge, and each row with the northing line on its south (bottom) edge. Grid references give the easting first, then the northing.";

// A 5 × 4 grid of squares with 6 features in different squares.
function makeGrid(rng) {
  const e0 = rng.int(12, 84), n0 = rng.int(10, 85);
  const names = rng.shuffle(FEATURES).slice(0, 6);
  const cells = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) cells.push([e0 + i, n0 + j]);
  const pos = rng.shuffle(cells).slice(0, 6);
  const feats = names.map((name, k) => ({ name, e: pos[k][0], n: pos[k][1] }));
  return { e0, n0, feats };
}

function gridTable(g) {
  const head = `| N/E | ${[0, 1, 2, 3, 4].map((i) => g.e0 + i).join(" | ")} |`;
  const sep = `| --- | ${[0, 1, 2, 3, 4].map(() => "---").join(" | ")} |`;
  const rows = [];
  for (let j = 3; j >= 0; j--) {
    const n = g.n0 + j;
    const cells = [0, 1, 2, 3, 4].map((i) => {
      const f = g.feats.find((x) => x.e === g.e0 + i && x.n === n);
      return f ? f.name : "·";
    });
    rows.push(`| **${n}** | ${cells.join(" | ")} |`);
  }
  return [head, sep, ...rows].join("\n");
}

const four = (e, n) => e * 100 + n;
const six = (E, N) => E * 1000 + N; // E, N are 3-digit eastings/northings in 100 m units

function genGrid(d, rng) {
  if (d === "easy") {
    const g = makeGrid(rng);
    const f = rng.pick(g.feats);
    const kind = rng.pick(["four-fig", "four-fig", "which-feature"]);
    const table = gridTable(g);
    if (kind === "which-feature") {
      const others = rng.shuffle(g.feats.filter((x) => x !== f)).slice(0, 3);
      return {
        prompt: `${GRID_NOTE}\n\n${table}\n\nWhich feature is in grid square ${four(f.e, f.n)}?`,
        answer: f.name,
        answerType: "choice",
        choices: rng.shuffle([f.name, ...others.map((x) => x.name)]),
        explanation: `The first two digits are the easting: go along to the column labelled ${f.e}.\n\nThe last two digits are the northing: go up to the row labelled ${f.n}. That square holds the **${f.name}**.`,
        hints: ["Read the first two digits as the easting (the column), then the last two as the northing (the row).", `Find the column labelled ${f.e} and the row labelled ${f.n}, and see where they meet.`],
        params: { kind, e: f.e, n: f.n, feats: g.feats },
      };
    }
    return single({
      prompt: `${GRID_NOTE}\n\n${table}\n\nWhat is the 4-figure grid reference of the square containing the ${f.name}? Type the 4 digits with no spaces, easting first.`,
      exact: four(f.e, f.n), dp: 0, rounded: false, unit: "",
      steps: [`Go along to the ${f.name}'s column: easting ${f.e}.`, `Then up to its row: northing ${f.n}.`, "Write the easting, then the northing:"],
      hints: ["Along the corridor, then up the stairs: easting (the column label) first, then northing (the row label).", `The ${f.name} is in the column labelled ${f.e}. Now find its row label.`],
      candidates: [four(f.n, f.e), four(f.e + 1, f.n), four(f.e, f.n + 1)],
      params: { kind: "four-fig", x: f.e * 1000 + 500, y: f.n * 1000 + 500 },
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["six-fig", "six-fig", "six-to-four"]);
    if (kind === "six-to-four") {
      const e = rng.int(12, 88), n = rng.int(10, 89), tx = rng.int(0, 9), ty = rng.int(0, 9);
      const ref = six(e * 10 + tx, n * 10 + ty);
      const what = rng.pick(FEATURES);
      return single({
        prompt: `${GRID_NOTE} A ${what} is at 6-figure grid reference ${ref}. What is the 4-figure reference of the grid square it is in? Type the 4 digits with no spaces.`,
        exact: four(e, n), dp: 0, rounded: false, unit: "",
        steps: [`Split the 6 figures in half: easting ${e * 10 + tx}, northing ${n * 10 + ty}.`, `The third digit of each half is tenths of a square, so drop it: easting ${e}, northing ${n}.`, "Together:"],
        hints: ["Split the 6-figure reference into two halves of 3 digits: easting, then northing.", "In each half, the last digit is tenths of a square. Which digits are left when you drop it?"],
        candidates: [four(e * 10 + tx > 99 ? e : e, n + 1), four(n, e), four(e + 1, n)],
        params: { kind: "four-fig", x: e * 1000 + tx * 100 + 50, y: n * 1000 + ty * 100 + 50 },
      }, rng);
    }
    const g = makeGrid(rng);
    const f = rng.pick(g.feats);
    const tx = rng.int(1, 9), ty = rng.int(1, 9);
    const E = f.e * 10 + tx, N = f.n * 10 + ty;
    return single({
      prompt: `${GRID_NOTE}\n\n${gridTable(g)}\n\nInside its square, the ${f.name} is ${tx} tenths of the way east (from the west edge) and ${ty} tenths of the way north (from the south edge). What is its 6-figure grid reference? Type the 6 digits with no spaces, easting first.`,
      exact: six(E, N), dp: 0, rounded: false, unit: "",
      steps: [`4-figure square: easting ${f.e}, northing ${f.n}.`, `Add the tenths: easting ${f.e} then ${tx} → ${E}; northing ${f.n} then ${ty} → ${N}.`, "Write the easting, then the northing:"],
      hints: [`First find the 4-figure square of the ${f.name} from the table.`, `Put the tenths east (${tx}) after the easting, and the tenths north (${ty}) after the northing.`],
      candidates: [six(N, E), six(f.e * 10 + ty, f.n * 10 + tx), six(E, f.n * 10 + (10 - ty) % 10)],
      params: { kind: "six-fig", x: f.e * 1000 + tx * 100 + 50, y: f.n * 1000 + ty * 100 + 50 },
    }, rng);
  }

  // hard
  const kind = rng.pick(["offset", "distance", "multi"]);
  const dir = (v, pos, neg) => (v >= 0 ? `${v * 100} m ${pos}` : `${-v * 100} m ${neg}`);
  if (kind === "offset") {
    const E = rng.int(200, 790), N = rng.int(200, 790);
    let dx, dy;
    do { dx = rng.int(-9, 9); dy = rng.int(-9, 9); } while (dx === 0 || dy === 0);
    const [a, b] = rng.shuffle(FEATURES).slice(0, 2);
    return single({
      prompt: `${GRID_NOTE} The ${a} is at 6-figure grid reference ${six(E, N)}. The ${b} is ${dir(dx, "east", "west")} and ${dir(dy, "north", "south")} of the ${a}. What is the 6-figure grid reference of the ${b}? Type the 6 digits with no spaces.`,
      exact: six(E + dx, N + dy), dp: 0, rounded: false, unit: "",
      steps: [`In a 6-figure reference, each step of the third digit is 100 m. Easting: ${E} ${dx > 0 ? "+" : "−"} ${Math.abs(dx)} = ${E + dx}.`, `Northing: ${N} ${dy > 0 ? "+" : "−"} ${Math.abs(dy)} = ${N + dy}.`, "Together:"],
      hints: ["Each 100 m moves the third digit of the easting or northing by 1 (a grid square is 1 km = 10 steps).", `Split ${six(E, N)} into easting ${E} and northing ${N}, then add or take away the steps (east and north add, west and south take away).`],
      candidates: [six(E - dx, N - dy), six(E + dy, N + dx), six(E + 10 * dx, N + 10 * dy)],
      params: { kind: "six-fig", x: (E + dx) * 100 + 50, y: (N + dy) * 100 + 50 },
    }, rng);
  }
  if (kind === "distance") {
    const E1 = rng.int(150, 850), N1 = rng.int(150, 850);
    let dx, dy;
    do { dx = rng.int(-40, 40); dy = rng.int(-40, 40); } while (Math.abs(dx) < 3 || Math.abs(dy) < 3);
    const [a, b] = rng.shuffle(FEATURES).slice(0, 2);
    const exact = Math.hypot(dx, dy) / 10;
    return single({
      prompt: `${GRID_NOTE} The ${a} is at ${six(E1, N1)} and the ${b} is at ${six(E1 + dx, N1 + dy)}. What is the straight-line distance between them, in km?${DP(2)}`,
      exact, dp: 2, rounded: true, unit: "km",
      steps: [
        `East–west difference: \`${E1 + dx} - ${E1}\` = ${dx} hundred metres = ${num(dx / 10)} km.`,
        `North–south difference: \`${N1 + dy} - ${N1}\` = ${dy} hundred metres = ${num(dy / 10)} km.`,
        `Pythagoras: \`√(${par(dx / 10)}² + ${par(dy / 10)}²)\``,
      ],
      hints: [
        "Split each reference into a 3-digit easting and northing; each unit of the third digit is 100 m (0.1 km).",
        `Find the east and north differences in km, then use Pythagoras (in the calculator: add rows \`_dx\` and \`_dy\` for the differences, then \`sqrt(_dx^2 + _dy^2)\`).${THEN(2)}`,
      ],
      candidates: [(Math.abs(dx) + Math.abs(dy)) / 10, Math.hypot(dx, dy), exact * 0.5],
      params: { kind: "grid-dist", dx, dy },
    }, rng);
  }
  // multi: 6-figure of a table feature, then distance to a second given reference
  const g = makeGrid(rng);
  const f = rng.pick(g.feats);
  const tx = rng.int(1, 9), ty = rng.int(1, 9);
  const E = f.e * 10 + tx, N = f.n * 10 + ty;
  let dx, dy;
  do { dx = rng.int(-30, 30); dy = rng.int(-30, 30); } while (Math.abs(dx) < 3 || Math.abs(dy) < 3 || E + dx < 100 || N + dy < 100 || E + dx > 999 || N + dy > 999);
  const other = rng.pick(FEATURES.filter((x) => !g.feats.some((y) => y.name === x)));
  const dist = Math.hypot(dx, dy) / 10;
  return multi(
    `${GRID_NOTE}\n\n${gridTable(g)}\n\nInside its square, the ${f.name} is ${tx} tenths of the way east and ${ty} tenths of the way north. A ${other} off this map is at ${six(E + dx, N + dy)}.`,
    [
      numPart("ref", "Grid reference", `6-figure grid reference of the ${f.name} (6 digits, no spaces).`, six(E, N), 0, false,
        `Find the ${f.name}'s square in the table, then put ${tx} after the easting and ${ty} after the northing.`,
        { kind: "six-fig", x: f.e * 1000 + tx * 100 + 50, y: f.n * 1000 + ty * 100 + 50 }),
      numPart("dist", "Distance", `Straight-line distance from the ${f.name} to the ${other}, in km, rounded to 2 decimal places.`, dist, 2, true,
        "Each unit of the third digit is 100 m. Find the east and north differences in km, then use Pythagoras.",
        { kind: "grid-dist", dx, dy }),
    ],
    `Reference first, then distance.\n\n- ${f.name}: square ${f.e} ${f.n}, plus tenths ${tx} and ${ty} → **${six(E, N)}**.\n- Differences: easting \`${E + dx} - ${E}\` = ${dx} (${num(dx / 10)} km), northing \`${N + dy} - ${N}\` = ${dy} (${num(dy / 10)} km).\n- \`√(${par(dx / 10)}² + ${par(dy / 10)}²)\` ${resultLine(dist, 2, true, "km")}`,
    "Find the 6-figure reference first; then compare it with the other reference, digit by digit.",
  );
}

// ======================================================================================
// Bearings

const POINTS = [["north", 0], ["north-east", 45], ["east", 90], ["south-east", 135], ["south", 180], ["south-west", 225], ["west", 270], ["north-west", 315]];
const BEARING_NOTE = "Bearings are measured clockwise from north and written with three figures (000° to 359°).";
const TYPE_B = " Type the number of degrees (for example 045 or 45).";
const fmtB = (v) => `${b3(((Math.round(v) % 360) + 360) % 360)}°`;
const mod360 = (v) => ((v % 360) + 360) % 360;

function bearingChoices(correct, candidates, rng) {
  const c = fmtB(correct);
  const seen = new Set([c]);
  const out = [];
  for (const v of [...candidates, correct + 90, correct - 90, correct + 180, correct + 10, correct - 10]) {
    if (out.length >= 3) break;
    const s = fmtB(mod360(v));
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return { answer: c, choices: rng.shuffle([c, ...out]) };
}

// Bearing questions: typed number (65%) or a choice of 3-figure bearings (35%).
function bearingQ(q, rng) {
  const base = {
    prompt: q.prompt,
    tolerance: 0,
    explanation: q.explanation,
    hints: q.hints,
    params: q.params,
  };
  if (rng.next() < 0.35) {
    const { answer, choices } = bearingChoices(q.exact, q.candidates, rng);
    return { ...base, prompt: q.prompt.replace(TYPE_B, ""), answer, answerType: "choice", choices };
  }
  return { ...base, answer: q.exact, answerType: "number" };
}

const WHO = ["A ship", "A plane", "A drone", "A fishing boat", "A yacht", "A helicopter", "A ferry", "A survey boat"];

function genBearings(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["point-to-b", "b-to-point", "back"]);
    if (kind === "point-to-b") {
      const [name, b] = rng.pick(POINTS.slice(1));
      const who = rng.pick(WHO);
      return bearingQ({
        prompt: `${BEARING_NOTE} ${who} heads due ${name}. What is that as a three-figure bearing?${TYPE_B}`,
        exact: b,
        explanation: `Start at north (000°) and turn clockwise. Each of the 8 compass points is 45° further on.\n\n${cap(name)} is **${b3(b)}°**.`,
        hints: ["Start facing north (000°) and turn clockwise. A quarter turn is a right angle, and the 8 compass points are 45° apart.", `Count the 45° steps clockwise from north round to ${name}.`],
        candidates: [360 - b, b + 180],
        params: { kind: "b-exact", b },
      }, rng);
    }
    if (kind === "b-to-point") {
      const k = rng.int(1, 7);
      const [name, b] = POINTS[k];
      const opp = POINTS[(k + 4) % 8][0];
      const mirror = POINTS[(8 - k) % 8][0];
      const near = POINTS[(k + 2) % 8][0];
      const opts = [...new Set([name, opp, mirror, near, POINTS[(k + 6) % 8][0]])].slice(0, 4);
      return {
        prompt: `${BEARING_NOTE} Which compass direction is a bearing of ${b3(b)}°?`,
        answer: name,
        answerType: "choice",
        choices: rng.shuffle(opts),
        explanation: `Turn ${b}° clockwise from north. 090° is east, 180° is south and 270° is west, so ${b3(b)}° is **${name}**.`,
        hints: ["North is 000°, and each quarter turn clockwise adds 90°.", `Count clockwise from north in steps of 45°: each step is the next of the 8 compass points. How many steps is ${b}°?`],
        params: { kind: "b-to-point", b },
      };
    }
    const b = 5 * rng.int(1, 71);
    if (b === 180) return genBearings("easy", rng);
    const exact = mod360(b + 180);
    const [x, y] = rng.shuffle(["the lighthouse", "the tower", "the summit", "the harbour", "the camp", "the beacon", "the church spire"]);
    return bearingQ({
      prompt: `${BEARING_NOTE} The bearing of ${x} from ${y} is ${b3(b)}°. What is the bearing of ${y} from ${x}?${TYPE_B}`,
      exact,
      explanation: `The way back is the opposite direction, 180° round. ${b < 180 ? "Add" : "Subtract"} 180°: \`${b} ${b < 180 ? "+" : "-"} 180\` = **${b3(exact)}°**.`,
      hints: ["Going back the other way is a half turn: 180°.", `Since ${b3(b)}° is ${b < 180 ? "less" : "more"} than 180°, ${b < 180 ? "add" : "subtract"} 180°.`],
      candidates: [360 - b, b + 90],
      params: { kind: "b-exact", b: exact },
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["back", "turn", "turn-between"]);
    const who = rng.pick(WHO);
    if (kind === "back") {
      let b;
      do b = rng.int(1, 359); while (b === 180);
      const exact = mod360(b + 180);
      return bearingQ({
        prompt: `${BEARING_NOTE} ${who} travels on a bearing of ${b3(b)}° and then turns round to go straight back. On what bearing does it travel back?${TYPE_B}`,
        exact,
        explanation: `A back bearing differs by 180°. ${b < 180 ? "Add" : "Subtract"} 180°: \`${b} ${b < 180 ? "+" : "-"} 180\` = **${b3(exact)}°**.`,
        hints: ["Going straight back is a half turn: 180°.", `${b3(b)}° is ${b < 180 ? "below" : "above"} 180°, so ${b < 180 ? "add" : "subtract"} 180°.`],
        candidates: [360 - b, mod360(b + 90)],
        params: { kind: "b-exact", b: exact },
      }, rng);
    }
    if (kind === "turn") {
      const b = rng.int(0, 359);
      const t = 5 * rng.int(2, 34);
      const cw = rng.next() < 0.5;
      const exact = mod360(cw ? b + t : b - t);
      if (exact === 0 && cw) return genBearings("medium", rng);
      return bearingQ({
        prompt: `${BEARING_NOTE} ${who} is heading on a bearing of ${b3(b)}°. It turns ${t}° ${cw ? "clockwise (to the right)" : "anticlockwise (to the left)"}. What is its new bearing?${TYPE_B}`,
        exact,
        explanation: `Clockwise turns add, anticlockwise turns subtract.\n\n\`${b} ${cw ? "+" : "-"} ${t}\` = ${cw ? b + t : b - t}${(cw ? b + t : b - t) >= 360 ? ", minus 360" : (cw ? b + t : b - t) < 0 ? ", plus 360" : ""} = **${b3(exact)}°**.`,
        hints: ["A clockwise (right) turn adds to the bearing; an anticlockwise (left) turn subtracts.", "If you go past 360°, subtract 360; if you go below 0°, add 360."],
        candidates: [mod360(cw ? b - t : b + t), mod360(cw ? b + t + 180 : b - t + 180)],
        params: { kind: "b-exact", b: exact },
      }, rng);
    }
    const b1 = rng.int(0, 359);
    let b2;
    do b2 = rng.int(0, 359); while (b2 === b1 || mod360(b2 - b1) === 180);
    const exact = mod360(b2 - b1);
    return single({
      prompt: `${BEARING_NOTE} ${who} is heading on ${b3(b1)}° and needs to head on ${b3(b2)}°. How many degrees must it turn clockwise (to the right) to do that? (Give a whole number of degrees from 1 to 359.)`,
      exact, dp: 0, rounded: false, unit: "degrees",
      steps: ["A clockwise turn adds to the bearing, so the turn is new − old (adding 360 if that is negative).", `\`${b2} - ${b1}\` = ${b2 - b1}${b2 < b1 ? ", plus 360" : ""}`],
      hints: ["Clockwise turns add to the bearing, so the turn = new bearing − old bearing.", "If that comes out negative, add 360°."],
      candidates: [Math.abs(b2 - b1) === exact ? 360 - exact : Math.abs(b2 - b1), 360 - exact, b1 + b2 > 360 ? b1 + b2 - 360 : b1 + b2],
      params: { kind: "turn-between", b1, b2 },
      choiceRate: 0.3,
      max: 359,
    }, rng);
  }

  // hard
  const kind = rng.pick(["disp", "disp", "multi"]);
  if (kind === "disp") {
    let x, y, exact;
    do {
      x = rng.int(-90, 90) * 10; y = rng.int(-90, 90) * 10;
      exact = mod360(Math.atan2(x, y) / DEG);
    } while (Math.abs(x) < 50 || Math.abs(y) < 50 || Math.abs(exact - Math.floor(exact) - 0.5) < 0.02 || exact > 359.4);
    const who = rng.pick(WHO);
    const ans = Math.round(exact);
    const ew = x >= 0 ? "east" : "west", ns = y >= 0 ? "north" : "south";
    const acute = Math.atan(Math.abs(x) / Math.abs(y)) / DEG;
    const quad = y >= 0 ? (x >= 0 ? "θ" : "360 − θ") : (x >= 0 ? "180 − θ" : "180 + θ");
    return bearingQ({
      prompt: `${BEARING_NOTE} ${who} moves ${Math.abs(x)} m ${ew} and ${Math.abs(y)} m ${ns} from its start. What is the bearing of its finish from its start, to the nearest degree?${TYPE_B}`,
      exact: ans,
      explanation: `Find the angle θ from the north–south line: \`tan θ = ${Math.abs(x)} / ${Math.abs(y)}\`, so θ = ${acute.toFixed(2)}°.\n\nThe finish is ${ns}-${ew} of the start, so the bearing is ${quad} = ${exact.toFixed(2)}°, which rounds to **${b3(ans)}°**.`,
      hints: [
        `Sketch it: the finish is ${ns}-${ew} of the start. Find the angle θ from the north–south line with \`tan θ = east-west ÷ north-south\` (in the calculator: \`atan(${Math.abs(x)} / ${Math.abs(y)})\`).`,
        `Then turn θ into a clockwise bearing from north: for ${ns}-${ew}, the bearing is ${quad}. Round to the nearest degree.`,
      ],
      candidates: [Math.round(acute), Math.round(mod360(90 - exact)), Math.round(mod360(360 - exact))],
      params: { kind: "disp", x, y },
    }, rng);
  }
  // multi: two legs -> distance back to start (nearest m) and bearing back to start (nearest degree)
  let b1, b2, d1, d2, X, Y, back, dist;
  do {
    b1 = 5 * rng.int(0, 71); b2 = 5 * rng.int(0, 71);
    d1 = 10 * rng.int(20, 120); d2 = 10 * rng.int(20, 120);
    X = d1 * Math.sin(b1 * DEG) + d2 * Math.sin(b2 * DEG);
    Y = d1 * Math.cos(b1 * DEG) + d2 * Math.cos(b2 * DEG);
    dist = Math.hypot(X, Y);
    back = mod360(Math.atan2(-X, -Y) / DEG);
  } while (Math.abs(mod360(b2 - b1)) < 20 || Math.abs(mod360(b2 - b1) - 180) < 20 || dist < 100 ||
    Math.abs(back - Math.floor(back) - 0.5) < 0.02 || back > 359.4 || Math.abs(dist - Math.floor(dist) - 0.5) < 0.02);
  const who = rng.pick(WHO);
  return multi(
    `${BEARING_NOTE} ${who} travels ${d1} m on a bearing of ${b3(b1)}°, then ${d2} m on a bearing of ${b3(b2)}°. It then wants to go straight back to its start. Use east = distance × sin(bearing) and north = distance × cos(bearing) for each leg (the calculator's sin and cos use degrees).`,
    [
      numPart("dist", "Distance", "Straight-line distance back to the start, in m, rounded to the nearest whole number.", dist, 0, true,
        "Add up the east parts and the north parts of the two legs, then use Pythagoras on the totals.",
        { kind: "legs-dist", b1, b2, d1, d2 }),
      numPart("bearing", "Bearing", "Bearing to travel on to get back to the start, to the nearest degree (type, for example, 045 or 45).", Math.round(back), 0, false,
        "The way back points the opposite way to the total movement. Find the bearing of the total movement, then turn it half way round.",
        { kind: "legs-back", b1, b2, d1, d2 }),
    ],
    `Split each leg into east and north parts.\n\n` +
      `- East: \`${d1} × sin(${b1}) + ${d2} × sin(${b2})\` = ${X.toFixed(2)} m; north: \`${d1} × cos(${b1}) + ${d2} × cos(${b2})\` = ${Y.toFixed(2)} m.\n` +
      `- Distance: \`√(${X < 0 ? `(${X.toFixed(2)})` : X.toFixed(2)}² + ${Y < 0 ? `(${Y.toFixed(2)})` : Y.toFixed(2)}²)\` ${resultLine(dist, 0, true, "m")}\n` +
      `- The total movement has bearing ${mod360(back + 180).toFixed(2)}°, so the way back is 180° round: ${back.toFixed(2)}°, which rounds to **${b3(Math.round(back))}°**.`,
    "Break each leg into an east part and a north part, add them, and work with the totals.",
    [G("_d1", d1), G("_b1", b1), G("_d2", d2), G("_b2", b2)],
  );
}

// ======================================================================================
// Time zones

// ---- Segmented (block-list) choices (ticket 019) ----
// Options are arrays with one segment per column (`choiceCols`); the engine joins them with " | ".
// verify() sees the raw arrays (or joined strings for stored questions). Easy has 3 options and the
// other levels 5; every wrong option differs from the right one in 1 to n−1 columns. `extraSegs` are
// Build-mode decoy blocks, and no combination of the available blocks other than the answer is right.
const SEG_OPTIONS = { easy: 3, medium: 5, hard: 5, expert: 5 };
const segsOf = (c) => (Array.isArray(c) ? c.map((s) => String(s).trim()) : String(c ?? "").split("|").map((s) => s.trim()));
const segKey = (c) => segsOf(c).join(" | ");
const segDiff = (a, b) => a.reduce((n, s, i) => n + (s !== b[i] ? 1 : 0), 0);
// Ticket 022 (mixed distances): some wrong option differs in 2+ columns, the answer is not the strict
// majority value in every column, and (3+ columns) no wrong option differs in every column.
// `noCount`: also refuse sets where the answer has the highest summed value counts.
function mixOk(opts, a, noCount) {
  const n = a.length, key = a.join("\u0001");
  const wrong = opts.filter((t) => t.join("\u0001") !== key);
  const d = wrong.map((t) => segDiff(t, a));
  if (!d.some((x) => x >= 2) || (n >= 3 && d.some((x) => x >= n))) return false;
  const cnt = (j, v) => opts.filter((t) => t[j] === v).length;
  if (a.every((v, j) => opts.every((t) => t[j] === v || cnt(j, t[j]) < cnt(j, v)))) return false;
  if (!noCount) return true;
  const sc = (t) => t.reduce((s, v, j) => s + cnt(j, v), 0);
  return wrong.some((t) => sc(t) >= sc(a));
}
// The right tuple plus wrong ones from `cands` -> `want` options, shuffled; or null. Wrong options are
// drawn (rng.shuffle) until the set satisfies the mixed-distance rule; 2 columns allow a wrong option
// that differs in both.
function segPick(rng, correct, cands, want) {
  const n = correct.length;
  const seen = new Set([segKey(correct)]);
  const ok = [];
  for (const c of cands) {
    if (!Array.isArray(c) || c.length !== n || c.some((s) => !String(s))) continue;
    const d = segDiff(c, correct);
    if (d < 1 || (n > 2 && d >= n) || seen.has(segKey(c))) continue;
    seen.add(segKey(c));
    ok.push(c);
  }
  for (let t = 0; t < 80; t++) {
    const out = [correct, ...rng.shuffle(ok.slice()).slice(0, want - 1)];
    if (out.length === want && mixOk(out, correct, t < 50)) return rng.shuffle(out);
  }
  return null;
}
// Build-mode decoys: the [column index, value] pairs no option already shows (max 14). Indexes, not
// labels, because labels such as TT and Tt differ only in case.
function segExtras(cols, options, pairs) {
  const shown = cols.map((_, i) => new Set(options.map((t) => String(t[i]))));
  const out = [];
  for (const [i, v] of pairs) {
    const s = String(v ?? "");
    if (s && !shown[i].has(s)) { shown[i].add(s); out.push([i, s]); }
  }
  return out.slice(0, 14);
}
// Checks a segmented choice: shape, option count (`want`, when given), exactly one right option and it
// is `answer`, wrong options differ in 1..n−1 columns, and (build) exactly one right combination among
// every block on offer (the options' segments plus extraSegs).
function segOk(q, answer, isRight, want, build = true) {
  const cols = q && q.choiceCols;
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > 4 || !Array.isArray(q.choices)) return false;
  const n = cols.length;
  const opts = q.choices.map(segsOf);
  if ((want && opts.length !== want) || opts.length < 2 || opts.some((t) => t.length !== n || t.some((s) => !s))) return false;
  if (new Set(opts.map((t) => t.join(" | "))).size !== opts.length) return false;
  const right = opts.filter((t) => isRight(t));
  if (right.length !== 1) return false;
  const a = segsOf(answer);
  if (a.length !== n || segDiff(a, right[0]) !== 0) return false;
  if (opts.some((t) => t !== right[0] && (segDiff(t, right[0]) < 1 || segDiff(t, right[0]) > (n === 2 ? 2 : n - 1)))) return false;
  if (!build) return true;
  const pools = cols.map((_, i) => new Set(opts.map((t) => t[i])));
  for (const e of Array.isArray(q.extraSegs) ? q.extraSegs : []) {
    const i = Array.isArray(e) ? (typeof e[0] === "number" ? e[0] : cols.indexOf(e[0])) : -1;
    if (i < 0 || i >= n || !String(e[1] ?? "").trim()) return false;
    pools[i].add(String(e[1]).trim());
  }
  let hits = 0;
  const walk = (i, acc) => {
    if (hits > 1) return;
    if (i === n) { if (isRight(acc)) hits++; return; }
    for (const v of pools[i]) walk(i + 1, [...acc, v]);
  };
  walk(0, []);
  return hits === 1;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CITIES = [
  ["London", 0], ["Reykjavik", 0], ["Lagos", 60], ["Paris", 60], ["Cairo", 120], ["Athens", 120], ["Nairobi", 180], ["Moscow", 180],
  ["Dubai", 240], ["Karachi", 300], ["Mumbai", 330], ["Kathmandu", 345], ["Dhaka", 360], ["Bangkok", 420], ["Beijing", 480],
  ["Singapore", 480], ["Perth", 480], ["Tokyo", 540], ["Seoul", 540], ["Brisbane", 600], ["Auckland", 720], ["Honolulu", -600],
  ["Anchorage", -540], ["Los Angeles", -480], ["Denver", -420], ["Mexico City", -360], ["Chicago", -360], ["New York", -300],
  ["Lima", -300], ["Santiago", -240], ["Buenos Aires", -180], ["São Paulo", -180],
];
const WHOLE = CITIES.filter((c) => c[1] % 60 === 0);
const TZ_NOTE = "Use these fixed offsets from UTC (no daylight saving)";
const HHMM = " Give the time on the 24-hour clock as HH:MM (two digits each, with a colon).";
const offStr = (m) => {
  const s = m < 0 ? "−" : "+";
  const a = Math.abs(m);
  return `UTC${s}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
};
const hm = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const dayShift = (mins) => Math.floor(mins / 1440);
const dayName = (d0, shift) => DAYS[(((d0 + shift) % 7) + 7) % 7];
const durStr = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;

function twoCities(rng, pool, minGap = 60) {
  let a, b;
  do { [a, b] = rng.shuffle(pool).slice(0, 2); } while (Math.abs(a[1] - b[1]) < minGap);
  return [a, b];
}

function timeChoices(correct, cands, rng) {
  const seen = new Set([correct]);
  const out = [];
  for (const c of cands) {
    if (out.length < 3 && !seen.has(c)) { seen.add(c); out.push(c); }
  }
  return rng.shuffle([correct, ...out]);
}

function genTimes(d, rng) {
  if (d === "easy") {
    const kind = rng.pick(["diff", "convert", "convert"]);
    let [A, B] = twoCities(rng, WHOLE);
    if (kind === "diff") {
      if (A[1] < B[1]) [A, B] = [B, A];
      const exact = (A[1] - B[1]) / 60;
      return single({
        prompt: `${TZ_NOTE}: ${A[0]} is ${offStr(A[1])} and ${B[0]} is ${offStr(B[1])}. How many hours ahead of ${B[0]} is ${A[0]}?`,
        exact, dp: 0, rounded: false, unit: "hours",
        steps: ["The difference between two places is the difference between their UTC offsets.", `\`${num(A[1] / 60)} - (${num(B[1] / 60)})\``],
        hints: ["Subtract the offsets: the one further east (bigger offset) is ahead.", `Work out ${num(A[1] / 60)} − (${num(B[1] / 60)}). Careful with negative offsets: taking away a negative adds.`],
        candidates: [Math.abs(A[1] / 60 + B[1] / 60), Math.abs(A[1] / 60), exact + 1],
        params: { kind: "tz-diff", a: A[1], b: B[1] },
        choiceRate: 0.3,
      }, rng);
    }
    let t, out;
    do {
      t = 60 * rng.int(0, 23) + 5 * rng.int(0, 11);
      out = t - A[1] + B[1];
    } while (out < 0 || out >= 1440);
    const day = rng.int(0, 6);
    const ans = hm(out);
    const q = {
      prompt: `${TZ_NOTE}: ${A[0]} is ${offStr(A[1])} and ${B[0]} is ${offStr(B[1])}. It is ${hm(t)} on ${DAYS[day]} in ${A[0]}. What time is it in ${B[0]} (on the same day)?`,
      explanation: `Go through UTC.\n\n- ${A[0]} → UTC: \`${hm(t)} - (${offStr(A[1])})\` = ${hm(t - A[1])}.\n- UTC → ${B[0]}: \`${hm(t - A[1])} + (${offStr(B[1])})\` = **${ans}**.`,
      hints: [`First change ${A[0]} time to UTC by taking away its offset (${offStr(A[1])}).`, `Then add ${B[0]}'s offset (${offStr(B[1])}) to the UTC time.`],
      params: { kind: "tz-time", t, day, a: A[1], b: B[1] },
    };
    if (rng.next() < 0.35) {
      return { ...q, answer: ans, answerType: "choice", choices: timeChoices(ans, [hm(t + A[1] - B[1]), hm(out + 60), hm(out - 60), hm(t - A[1])], rng) };
    }
    return { ...q, prompt: q.prompt + HHMM, answer: ans, answerType: "text" };
  }

  if (d === "medium") {
    const kind = rng.pick(["cross", "cross", "half"]);
    if (kind === "half") {
      const odd = CITIES.filter((c) => c[1] % 60 !== 0);
      const A = rng.pick(odd);
      const B = rng.pick(CITIES.filter((c) => c[1] !== A[1]));
      const [X, Y] = rng.next() < 0.5 ? [A, B] : [B, A];
      let t, out;
      do {
        t = 60 * rng.int(0, 23) + 5 * rng.int(0, 11);
        out = t - X[1] + Y[1];
      } while (out < 0 || out >= 1440);
      const ans = hm(out);
      return {
        prompt: `${TZ_NOTE}: ${X[0]} is ${offStr(X[1])} and ${Y[0]} is ${offStr(Y[1])}. It is ${hm(t)} in ${X[0]}. What time is it in ${Y[0]} (on the same day)?${HHMM}`,
        answer: ans,
        answerType: "text",
        explanation: `Go through UTC.\n\n- ${X[0]} → UTC: \`${hm(t)} - (${offStr(X[1])})\` = ${hm(t - X[1])}.\n- UTC → ${Y[0]}: \`${hm(t - X[1])} + (${offStr(Y[1])})\` = **${ans}**.`,
        hints: [`Change ${X[0]} time to UTC by taking away ${offStr(X[1])} (hours and minutes).`, `Then add ${offStr(Y[1])} for ${Y[0]}. Carry 60 minutes into an hour where needed.`],
        params: { kind: "tz-time", t, day: 0, a: X[1], b: Y[1] },
      };
    }
    let A, B, t, out;
    do {
      [A, B] = twoCities(rng, CITIES, 180);
      t = 60 * rng.int(0, 23) + 5 * rng.int(0, 11);
      out = t - A[1] + B[1];
    } while (out >= 0 && out < 1440);
    const day = rng.int(0, 6);
    const sh = dayShift(out);
    const ans = `${dayName(day, sh)} ${hm(out)}`;
    const wrong = t + A[1] - B[1];
    // Day | Time blocks: each wrong option changes one of them (fixed candidate order, so the only rng
    // draw is the final shuffle). Build decoys: two more days and times.
    const ansT = [dayName(day, sh), hm(out)];
    const wrongDay = dayName(day, dayShift(wrong));
    const choices = segPick(rng, ansT, [
      [DAYS[day], hm(out)], [dayName(day, -sh), hm(out)], [ansT[0], hm(out + 60)], [ansT[0], hm(wrong)], [ansT[0], hm(out - 60)], [ansT[0], hm(t)],
      // both wrong (ticket 022): forgot the day change as well, or reversed the offsets throughout
      [DAYS[day], hm(wrong)], [wrongDay, hm(wrong)], [DAYS[day], hm(out + 60)], [dayName(day, -sh), hm(out - 60)], [dayName(day, -sh), hm(t)],
    ], SEG_OPTIONS.medium);
    if (!choices) throw new Error("no day/time options");
    return {
      prompt: `${TZ_NOTE}: ${A[0]} is ${offStr(A[1])} and ${B[0]} is ${offStr(B[1])}. It is ${hm(t)} on ${DAYS[day]} in ${A[0]}. What day and time is it in ${B[0]}?`,
      answer: ansT,
      answerType: "choice",
      choiceCols: ["Day", "Time"],
      choices,
      extraSegs: segExtras(["Day", "Time"], choices, [[0, dayName(day, 2 * sh)], [1, hm(out + 120)]]),
      explanation: `Go through UTC, counting the days.\n\n- ${A[0]} → UTC: \`${hm(t)} - (${offStr(A[1])})\` gives ${hm(t - A[1])}${dayShift(t - A[1]) ? ` on ${dayName(day, dayShift(t - A[1]))}` : ` on ${DAYS[day]}`}.\n- UTC → ${B[0]}: add ${offStr(B[1])}, which gives **${ans}**.`,
      hints: [`Change ${A[0]} time to UTC first (take away ${offStr(A[1])}), keeping track of whether you pass midnight.`, `Then add ${offStr(B[1])}. Going past midnight moves to the next day; going below 00:00 moves to the day before.`],
      params: { kind: "tz-daytime", t, day, a: A[1], b: B[1] },
    };
  }

  // hard: flight (arrive) or leave-by, as two parts: time + day
  const leave = rng.next() < 0.4;
  let A, B, t, dur, outAbs;
  do {
    [A, B] = twoCities(rng, CITIES, 120);
    t = 60 * rng.int(0, 23) + 5 * rng.int(0, 11);
    dur = 60 * rng.int(2, 16) + 5 * rng.int(0, 11);
    outAbs = leave ? t - B[1] - dur + A[1] : t - A[1] + dur + B[1];
  } while (Math.abs(dayShift(outAbs)) > 1 || dayShift(outAbs) === 0 && rng.next() < 0.5);
  const day = rng.int(0, 6);
  const sh = dayShift(outAbs);
  const ansT = hm(outAbs);
  const ansD = dayName(day, sh);
  const dayOpts = [-1, 0, 1, 2].map((k) => dayName(day, k));
  const from = leave ? B : A, to = leave ? A : B;
  const prompt = leave
    ? `${TZ_NOTE}: ${A[0]} is ${offStr(A[1])} and ${B[0]} is ${offStr(B[1])}. A flight from ${A[0]} to ${B[0]} takes ${durStr(dur)}. You must land in ${B[0]} at ${hm(t)} local time on ${DAYS[day]}. When must you take off, in ${A[0]} local time?`
    : `${TZ_NOTE}: ${A[0]} is ${offStr(A[1])} and ${B[0]} is ${offStr(B[1])}. A flight leaves ${A[0]} at ${hm(t)} local time on ${DAYS[day]} and takes ${durStr(dur)}. When does it land, in ${B[0]} local time?`;
  const utc = leave ? t - B[1] : t - A[1];
  const explanation = leave
    ? `Work backwards through UTC.\n\n- Landing in UTC: \`${hm(t)} - (${offStr(B[1])})\` = ${hm(utc)}.\n- Take off in UTC: ${hm(utc)} − ${durStr(dur)} = ${hm(utc - dur)}.\n- In ${A[0]} time: add ${offStr(A[1])}, giving **${ansT}** on **${ansD}**.`
    : `Work through UTC.\n\n- Take off in UTC: \`${hm(t)} - (${offStr(A[1])})\` = ${hm(utc)}.\n- Landing in UTC: ${hm(utc)} + ${durStr(dur)} = ${hm(utc + dur)}.\n- In ${B[0]} time: add ${offStr(B[1])}, giving **${ansT}** on **${ansD}**.`;
  return {
    prompt,
    answerType: "multi",
    hints: [`Change the ${leave ? "landing" : "take-off"} time to UTC first, then ${leave ? "take away" : "add"} the flight time, and finally change to ${to[0]} time.`],
    parts: [
      { id: "time", label: "Local time", ask: `Time in ${to[0]} (24-hour clock, HH:MM).`, answerType: "text", answer: ansT,
        hint: `In UTC the ${leave ? "landing" : "take-off"} is at ${hm(utc)}. ${leave ? "Take away" : "Add"} ${durStr(dur)}, then add ${offStr(to[1])}.` },
      { id: "day", label: "Day", ask: `Which day is it in ${to[0]} then?`, answerType: "choice", answer: ansD, choices: dayOpts,
        hint: `Start from ${DAYS[day]} in ${from[0]}; each time you pass midnight forwards add a day, and backwards take one away.` },
    ],
    explanation,
    params: { multi: true, kind: leave ? "tz-leave" : "tz-fly", t, day, dur, a: A[1], b: B[1] },
  };
}

// ======================================================================================

// Draws until verify() accepts the question (e.g. no rounding ties). Only the rng passed in is
// used, so a seed always gives the same question.
export function generate(args) {
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
  if (subtopic === "scale-distance") return genScale(difficulty, rng);
  if (subtopic === "grid-references") return genGrid(difficulty, rng);
  if (subtopic === "bearings") return genBearings(difficulty, rng);
  if (subtopic === "time-zones") return genTimes(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ======================================================================================
// Independent checks

function toNum(a) {
  if (a === "" || a === null || a === undefined) return NaN;
  return typeof a === "number" ? a : Number(String(a).trim());
}

// Residual of the forward relation (substitution) for distance-type answers.
function residual(p, x) {
  switch (p.kind) {
    case "map-km": case "map-m": return { r: (x * p.unitCm) / p.n - p.cm, sens: p.unitCm / p.n };
    case "real-cm": return { r: x * p.n - p.km * 1e5, sens: p.n };
    case "walk": return { r: (x / 60) * p.s - (p.cm * p.n) / 1e5, sens: p.s / 60 };
    case "walk-km": return { r: (x / 60) * p.s - p.km, sens: p.s / 60 };
    case "gradient": return { r: x * p.rise - (p.cm * p.n) / 100, sens: p.rise };
    case "area": return { r: x / (p.n / 1e5) ** 2 - p.a, sens: 1 / (p.n / 1e5) ** 2 };
    case "grid-dist": return x > 0 ? { r: (x * 10) ** 2 - (p.dx * p.dx + p.dy * p.dy), sens: 200 * x } : null;
    case "tz-diff": return { r: x * 60 + p.b - p.a, sens: 60 };
    case "turn-between": return { r: ((p.b1 + x) % 360) - p.b2, sens: 1 };
    case "legs-dist": {
      // walk back from the end point by the candidate distance along the true return line: law of cosines check
      const turn = (p.b2 - p.b1) * DEG; // angle between the legs' directions
      const sq = p.d1 * p.d1 + p.d2 * p.d2 + 2 * p.d1 * p.d2 * Math.cos(turn);
      return x > 0 ? { r: x * x - sq, sens: 2 * x } : null;
    }
    default: return null;
  }
}

function numOk(p, a, slack = 1) {
  const x = toNum(a);
  if (!Number.isFinite(x)) return false;
  const d = residual(p, x);
  if (!d || !Number.isFinite(d.r) || !(d.sens > 0)) return false;
  if (!p.rounded) return Number.isInteger(round(x, 9)) || p.allowDec ? Math.abs(d.r) <= 1e-9 * d.sens * Math.max(1, Math.abs(x)) : false;
  return Math.abs(d.r) <= 0.5 * STEP(p.dp) * d.sens * slack;
}

function wellPosed(p, a) {
  if (!p.rounded) return true;
  const x = toNum(a);
  if (Math.abs(round(x, p.dp) - x) > 1e-9 * Math.max(1, Math.abs(x))) return false;
  return [-1, 1].every((s) => !numOk(p, x + s * STEP(p.dp), 1.02));
}

// Grid references: the candidate's digits must name a square (or 100 m square) that contains the
// feature's position (x, y in metres of grid).
function gridOk(p, a, digits) {
  const s = String(a ?? "").trim();
  if (!/^\d+$/.test(s) || s.length !== digits) return false;
  const h = digits / 2;
  const unit = digits === 4 ? 1000 : 100;
  const E = Number(s.slice(0, h)), N = Number(s.slice(h));
  return p.x >= E * unit && p.x < (E + 1) * unit && p.y >= N * unit && p.y < (N + 1) * unit;
}

// Bearing of a movement (x east, y north) checked as a ray: the unit vector at the candidate
// bearing must point the same way as (x, y) to within half a degree.
function rayOk(x, y, bearing) {
  if (!Number.isInteger(bearing) || bearing < 0 || bearing > 359) return false;
  const ux = Math.sin(bearing * DEG), uy = Math.cos(bearing * DEG);
  const L = Math.hypot(x, y);
  const dot = (ux * x + uy * y) / L;
  const cross = (ux * y - uy * x) / L;
  return dot > 0 && Math.abs(Math.asin(Math.max(-1, Math.min(1, cross)))) / DEG <= 0.5;
}

const COMPASS = { north: 0, "north-east": 45, east: 90, "south-east": 135, south: 180, "south-west": 225, west: 270, "north-west": 315 };

function bearingOk(p, a) {
  const s = String(a ?? "").trim().replace(/°$/, "");
  if (!/^\d{1,3}$/.test(s)) return false;
  const b = Number(s);
  if (b > 359) return false;
  if (p.kind === "b-exact") {
    // walk 1 unit on the candidate bearing and on the expected one: both must end at the same point
    return Math.hypot(Math.sin(b * DEG) - Math.sin(p.b * DEG), Math.cos(b * DEG) - Math.cos(p.b * DEG)) < 1e-9;
  }
  if (p.kind === "disp") return rayOk(p.x, p.y, b);
  if (p.kind === "legs-back") {
    let x = 0, y = 0; // step along the two legs metre by metre
    for (const [dist, br] of [[p.d1, p.b1], [p.d2, p.b2]]) {
      for (let i = 0; i < dist; i++) { x += Math.sin(br * DEG); y += Math.cos(br * DEG); }
    }
    return rayOk(-x, -y, b);
  }
  return false;
}

// Time zones: rebuild the times with JS Date (UTC arithmetic) from params.
const BASE = Date.UTC(2024, 0, 1); // a Monday
function localParts(utcMs, off) {
  const dt = new Date(utcMs + off * 60000);
  const dayIdx = (dt.getUTCDay() + 6) % 7; // Monday = 0
  return { time: `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`, day: DAYS[dayIdx] };
}
function tzTruth(p) {
  // start: local time t on day `day` in the start city
  if (p.kind === "tz-time" || p.kind === "tz-daytime") return localParts(BASE + (p.day * 1440 + p.t - p.a) * 60000, p.b);
  if (p.kind === "tz-fly") return localParts(BASE + (p.day * 1440 + p.t - p.a + p.dur) * 60000, p.b);
  if (p.kind === "tz-leave") return localParts(BASE + (p.day * 1440 + p.t - p.b - p.dur) * 60000, p.a);
  return null;
}
const normTime = (s) => String(s ?? "").trim().replace(/\s+/g, "");

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false; // regenerate from the seed to get params back
  try {
    if (p.kind === "tz-fly" || p.kind === "tz-leave") {
      const a = answer && typeof answer === "object" ? answer : {};
      const truth = tzTruth(p);
      const dayPart = question.parts && question.parts.find((x) => x.id === "day");
      if (!dayPart || new Set(dayPart.choices).size !== 4 || !dayPart.choices.includes(truth.day)) return false;
      return normTime(a.time) === truth.time && a.day === truth.day;
    }
    if (p.multi) {
      const a = answer && typeof answer === "object" ? answer : {};
      return p.parts.every((s) => {
        if (s.kind === "six-fig") return gridOk(s, a[s.id], 6);
        if (s.kind === "legs-back") return bearingOk(s, a[s.id]) && [-1, 1].every((k) => !bearingOk(s, Number(a[s.id]) + k));
        return numOk(s, a[s.id]) && wellPosed(s, a[s.id]);
      });
    }
    if (p.kind === "tz-time" || p.kind === "tz-daytime") {
      const truth = tzTruth(p);
      const want = p.kind === "tz-time" ? truth.time : `${truth.day} ${truth.time}`;
      if (p.kind === "tz-time" && localParts(BASE + (p.day * 1440 + p.t - p.a) * 60000, p.b).day !== DAYS[p.day]) return false; // must stay on the same day
      if (question.answerType === "choice" && question.choiceCols) {
        // Day | Time blocks: right only when both match the UTC round trip.
        return p.kind === "tz-daytime" && segOk(question, answer, (t) => t.length === 2 && t[0] === truth.day && t[1] === truth.time, SEG_OPTIONS.medium);
      }
      if (question.answerType === "choice") {
        const ch = question.choices;
        if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || ch.filter((c) => c === want).length !== 1) return false;
      }
      return String(answer).trim() === want || (question.answerType === "text" && normTime(answer) === want);
    }
    if (p.kind === "find-scale") {
      const ch = question.choices;
      const scaleN = (s) => Number(String(s).replace(/^1\s*:\s*/, "").replace(/\s/g, ""));
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
      const ok = (s) => Math.abs((p.cm * scaleN(s)) / 1e5 - p.km) < 1e-9;
      return ch.filter(ok).length === 1 && ch.includes(answer) && ok(answer);
    }
    if (p.kind === "which-feature") {
      const inSq = (name) => p.feats.some((f) => f.name === name && f.e === p.e && f.n === p.n);
      const ch = question.choices;
      return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && ch.filter(inSq).length === 1 && inSq(answer);
    }
    if (p.kind === "b-to-point") {
      const ch = question.choices;
      return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && COMPASS[answer] === p.b &&
        ch.filter((c) => COMPASS[c] === p.b).length === 1;
    }
    const choice = question.answerType === "choice";
    if (choice) {
      const ch = question.choices;
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
    }
    let ok;
    if (p.kind === "four-fig" || p.kind === "six-fig") {
      const digits = p.kind === "four-fig" ? 4 : 6;
      ok = (v) => gridOk(p, v, digits);
    } else if (p.kind === "b-exact" || p.kind === "disp") {
      ok = (v) => bearingOk(p, v);
    } else {
      ok = (v) => numOk(p, v) && wellPosed(p, v);
    }
    if (choice && question.choices.filter((c) => ok(c)).length !== 1) return false;
    return ok(answer);
  } catch {
    return false;
  }
}
