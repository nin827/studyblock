// Travel and journeys generator: speed, distance and time; fuel and trip costs; timetables.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Every rounded answer states its rounding, and draws that land on a
// rounding half-step are redrawn inside generate(). Times are typed hh:mm (24-hour).

const pad = (n) => String(n).padStart(2, "0");
const mod = (a, n) => ((a % n) + n) % n;
const t24 = (min) => `${pad(Math.floor(mod(min, 1440) / 60))}:${pad(mod(min, 1440) % 60)}`;
function acc24(min) {
  const s = t24(min);
  const [H, M] = s.split(":");
  const out = new Set([`${+H}:${M}`, `${H}${M}`, `${H}.${M}`, `${+H}.${M}`]);
  out.delete(s);
  return [...out];
}
const readClock = (s) => {
  const m = String(s ?? "").trim().match(/^(\d{2}):(\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
};
function dur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const TIME24 = " Give the time in 24-hour format (hh:mm).";
const roundK = (x, k) => Math.sign(x) * Math.round(Math.abs(x) * 10 ** k + 1e-9) / 10 ** k;
const nearTie = (x, k) => {
  const v = Math.abs(x) * 10 ** k;
  return Math.abs(v - Math.floor(v) - 0.5) < 1e-6;
};
const isExact = (x, k) => Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6;
import { fmtNum } from "../../js/lib/mathutil.js";
const num = (n) => fmtNum(n);
const approx = (x, k = 4) => (isExact(x, 4) ? `= ${num(x)}` : `≈ ${x.toFixed(k)}`);
const cash2 = (d) => `$${roundK(d, 2).toFixed(2)}`;
const cash = (d) => (isExact(d, 0) ? `$${roundK(d, 0)}` : cash2(d));
const EXACT = { fuzzyNumber: 0 };
const timeAns = (min) => ({ answer: t24(min), accepts: acc24(min) });

const WHO = ["A cyclist", "A delivery van", "A coach", "A train", "A runner", "A family car", "A ferry", "A truck"];

// =====================================================================
// Speed, distance and time
// =====================================================================
function genJourney(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["dist", "time", "speed"]);
    const s = 5 * rng.int(2, 24);
    const t = rng.int(2, 6);
    const d = s * t;
    const who = rng.pick(WHO);
    if (kind === "dist") {
      return {
        prompt: `${who} travels at **${s} km/h** for **${t} hours**. How far does it go, in km?`,
        answerType: "number", answer: d, tolerance: 0,
        given: [{ label: "_speed", value: s }, { label: "_hours", value: t }],
        explanation: `Distance = speed × time: \`_speed * _hours\` = ${s} × ${t} = **${d} km**.`,
        hints: ["Distance = speed × time.", `Every hour it covers ${s} km.`],
        params: { kind, s, t, d },
      };
    }
    if (kind === "time") {
      return {
        prompt: `${who} travels **${d} km** at **${s} km/h**. How many hours does the journey take?`,
        answerType: "number", answer: t, tolerance: 0,
        given: [{ label: "_distance", value: d }, { label: "_speed", value: s }],
        explanation: `Time = distance ÷ speed: \`_distance / _speed\` = ${d} / ${s} = **${t} hours**.`,
        hints: ["Time = distance ÷ speed.", `How many lots of ${s} km fit into ${d} km?`],
        params: { kind, s, t, d },
      };
    }
    return {
      prompt: `${who} travels **${d} km** in **${t} hours**. What is its average speed, in km/h?`,
      answerType: "number", answer: s, tolerance: 0,
      given: [{ label: "_distance", value: d }, { label: "_hours", value: t }],
      explanation: `Speed = distance ÷ time: \`_distance / _hours\` = ${d} / ${t} = **${s} km/h**.`,
      hints: ["Speed = distance ÷ time.", `Share ${d} km between ${t} hours.`],
      params: { kind, s, t, d },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["dist-hm", "minutes", "arrive"]);
    const who = rng.pick(WHO);
    if (kind === "dist-hm") {
      const s = 4 * rng.int(5, 25);
      const m = 15 * rng.int(3, 15);
      const d = (s * m) / 60;
      return {
        prompt: `${who} travels at **${s} km/h** for **${dur(m)}**. How far does it go, in km?`,
        answerType: "number", answer: d, tolerance: 0,
        given: [{ label: "_speed", value: s }, { label: "_minutes", value: m }],
        explanation: `${dur(m)} = ${m} / 60 = ${num(m / 60)} h. \`_speed * _minutes / 60\` = ${s} × ${num(m / 60)} = **${num(d)} km**.`,
        hints: [`Turn ${dur(m)} into hours as a decimal: minutes ÷ 60 (so 15 min = 0.25 h).`, "Then distance = speed × time."],
        params: { kind, s, m },
      };
    }
    let s, d, m;
    do {
      s = 5 * rng.int(6, 24);
      d = rng.int(5, 300);
      m = (d * 60) / s;
    } while (!Number.isInteger(m) || m < 10 || m > 360);
    if (kind === "minutes") {
      return {
        prompt: `${who} travels **${d} km** at an average of **${s} km/h**. How many **minutes** does it take?`,
        answerType: "number", answer: m, tolerance: 0, ...EXACT,
        given: [{ label: "_distance", value: d }, { label: "_speed", value: s }],
        explanation: `Time = \`_distance / _speed\` = ${d} / ${s} = ${num(d / s)} h. In minutes: × 60 = **${m} min**.`,
        hints: ["Time in hours = distance ÷ speed.", "Multiply the hours by 60 to get minutes."],
        params: { kind, s, d },
      };
    }
    const start = 5 * rng.int(72, 216);
    return {
      prompt: `${who} sets off at **${t24(start)}** and travels **${d} km** at an average of **${s} km/h**. What time does it arrive?${TIME24}`,
      answerType: "text", ...timeAns(start + m),
      given: [{ label: "_distance", value: d }, { label: "_speed", value: s }],
      explanation: `Time = ${d} / ${s} = ${num(d / s)} h = ${m} min = ${dur(m)}. ${t24(start)} + ${dur(m)} = **${t24(start + m)}**.`,
      hints: ["Find the journey time first: distance ÷ speed, in hours, then turn it into hours and minutes.", "Add that to the start time."],
      params: { kind, s, d, start },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["average", "needed"]);
    if (kind === "average") {
      let d1, s1, d2, s2, stop, total, avg;
      do {
        s1 = 5 * rng.int(8, 24);
        d1 = rng.int(20, 200);
        s2 = 5 * rng.int(8, 24);
        d2 = rng.int(20, 200);
        stop = rng.pick([0, 0, 10, 15, 20, 30, 45]);
        total = d1 / s1 + d2 / s2 + stop / 60;
        avg = (d1 + d2) / total;
      } while (s1 === s2 || nearTie(avg, 1) || isExact(avg, 1));
      return {
        prompt: `A car drives **${d1} km at ${s1} km/h**, ${stop ? `stops for **${stop} min**, ` : ""}then drives **${d2} km at ${s2} km/h**. What is its average speed for the whole trip${stop ? " (including the stop)" : ""}? Round to 1 decimal place, in km/h.`,
        answerType: "number", answer: roundK(avg, 1), tolerance: 0.05,
        given: [{ label: "_d1", value: d1 }, { label: "_s1", value: s1 }, { label: "_d2", value: d2 }, { label: "_s2", value: s2 }, ...(stop ? [{ label: "_stop", value: stop }] : [])],
        explanation: `Times: ${d1} / ${s1} ${approx(d1 / s1)} h and ${d2} / ${s2} ${approx(d2 / s2)} h${stop ? `, plus ${stop} / 60 ${approx(stop / 60)} h` : ""}; total ${approx(total)} h. Average = total distance ÷ total time = ${d1 + d2} / ${total.toFixed(4)} ≈ ${avg.toFixed(3)}, which rounds to **${roundK(avg, 1).toFixed(1)} km/h**.`,
        hints: ["Average speed is total distance ÷ total time, not the mean of the two speeds.", `Find each leg's time (distance ÷ speed)${stop ? " and add the stop in hours" : ""}.`],
        params: { kind, d1, s1, d2, s2, stop },
      };
    }
    let D, done, used, limit, need;
    do {
      D = 10 * rng.int(10, 60);
      done = 10 * rng.int(3, Math.floor(D / 10) - 3);
      used = 15 * rng.int(4, 16);
      limit = used + 15 * rng.int(4, 16);
      need = (D - done) / ((limit - used) / 60);
    } while (nearTie(need, 1) || need > 130 || need < 20);
    return {
      prompt: `A coach must cover **${D} km** in **${dur(limit)}**. After **${dur(used)}** it has gone **${done} km**. What average speed does it need for the rest of the trip to arrive on time? Round to 1 decimal place, in km/h.`,
      answerType: "number", answer: roundK(need, 1), tolerance: 0.05,
      given: [{ label: "_total", value: D }, { label: "_done", value: done }, { label: "_limit_min", value: limit }, { label: "_used_min", value: used }],
      explanation: `Distance left: ${D} − ${done} = ${D - done} km. Time left: ${dur(limit)} − ${dur(used)} = ${dur(limit - used)} = ${num((limit - used) / 60)} h. Speed: ${D - done} / ${num((limit - used) / 60)} ${approx(need, 3)}${isExact(need, 1) ? "" : `, which rounds to`} **${roundK(need, 1).toFixed(1)} km/h**.`,
      hints: ["Work out the distance still to go and the time still left.", "Speed = distance left ÷ time left (in hours)."],
      params: { kind, D, done, used, limit },
    };
  }

  // expert: two travellers, meeting (towards each other) or catching up
  const kind = rng.pick(["meet", "catch"]);
  const start = 5 * rng.int(84, 180);
  if (kind === "meet") {
    let D, v1, v2, delay, tMin, x;
    do {
      D = 10 * rng.int(8, 50);
      v1 = 10 * rng.int(4, 12);
      v2 = 10 * rng.int(4, 12);
      delay = 15 * rng.int(1, 6);
      tMin = (60 * D + v2 * delay) / (v1 + v2);
      x = (v1 * tMin) / 60;
    } while (!Number.isInteger(tMin) || tMin <= delay || nearTie(x, 1));
    const [A, B] = rng.pick([["Ashford", "Brookton"], ["Millbay", "Northam"], ["Riverside", "Kelso"], ["Port Lane", "Elmstead"]]);
    return {
      prompt: `${A} and ${B} are **${D} km** apart on one road. A van leaves ${A} at **${t24(start)}** driving towards ${B} at **${v1} km/h**. A car leaves ${B} **${delay} min later**, driving towards ${A} at **${v2} km/h**.`,
      answerType: "multi",
      given: [{ label: "_d", value: D }, { label: "_v1", value: v1 }, { label: "_v2", value: v2 }, { label: "_delay", value: delay }],
      parts: [
        { id: "time", label: "Meet", ask: "At what time do they meet? (24-hour, hh:mm)", answerType: "text", ...timeAns(start + tMin), hint: `In its ${delay} min head start the van covers some of the gap at ${v1} km/h. After that they close the rest at ${v1} + ${v2} km/h.` },
        { id: "dist", label: "Distance", ask: `How far from ${A} do they meet, in km? Round to 1 decimal place.`, answerType: "number", answer: roundK(x, 1), tolerance: 0.05, hint: "The van's distance = its speed × its total driving time." },
      ],
      explanation: `Head start: ${v1} × ${num(delay / 60)} = ${num((v1 * delay) / 60)} km, leaving ${num(D - (v1 * delay) / 60)} km. Closing speed ${v1 + v2} km/h: ${num(D - (v1 * delay) / 60)} / ${v1 + v2} = ${num((tMin - delay) / 60)} h = ${tMin - delay} min. They meet ${delay} + ${tMin - delay} = ${tMin} min after ${t24(start)}: **${t24(start + tMin)}**.\n\nDistance from ${A}: ${v1} × ${num(tMin / 60)} ${approx(x, 3)} → **${roundK(x, 1).toFixed(1)} km**.`,
      params: { kind, D, v1, v2, delay, start },
    };
  }
  let v1, v2, delay, tMin, x;
  do {
    v1 = 5 * rng.int(6, 16);
    v2 = v1 + 5 * rng.int(2, 10);
    delay = 5 * rng.int(3, 18);
    tMin = (v2 * delay) / (v2 - v1);
    x = (v1 * tMin) / 60;
  } while (!Number.isInteger(tMin) || tMin > 600 || nearTie(x, 1));
  return {
    prompt: `A truck leaves a depot at **${t24(start)}** at **${v1} km/h**. A car follows it from the same depot on the same road **${delay} min later**, at **${v2} km/h**.`,
    answerType: "multi",
    given: [{ label: "_v1", value: v1 }, { label: "_v2", value: v2 }, { label: "_delay", value: delay }],
    parts: [
      { id: "time", label: "Catch", ask: "At what time does the car catch up? (24-hour, hh:mm)", answerType: "text", ...timeAns(start + tMin), hint: `When the car starts, the truck has had ${delay} min at ${v1} km/h, so it is ahead by that distance. The car gains ${v2 - v1} km every hour.` },
      { id: "dist", label: "Distance", ask: "How far from the depot, in km? Round to 1 decimal place.", answerType: "number", answer: roundK(x, 1), tolerance: 0.05, hint: "Either vehicle's speed × its driving time gives the same distance." },
    ],
    explanation: `Head start: ${v1} × ${num(delay / 60)} = ${num((v1 * delay) / 60)} km. The car gains ${v2} − ${v1} = ${v2 - v1} km/h, so it takes ${num((v1 * delay) / 60)} / ${v2 - v1} = ${num((tMin - delay) / 60)} h = ${tMin - delay} min. That is ${tMin} min after ${t24(start)}: **${t24(start + tMin)}**.\n\nDistance: ${v2} × ${num((tMin - delay) / 60)} ${approx(x, 3)} → **${roundK(x, 1).toFixed(1)} km**.`,
    params: { kind, v1, v2, delay, start },
  };
}

function verifyJourney(q, ans) {
  const p = q.params;
  const x = Number(ans);
  switch (p.kind) {
    case "dist": return x / p.t === p.s;
    case "time": return x * p.s === p.d;
    case "speed": return x * p.t === p.d;
    case "dist-hm": return Math.abs((x * 60) / p.s - p.m) < 1e-9;
    case "minutes": return Math.abs((p.s * x) / 60 - p.d) < 1e-9;
    case "arrive": {
      const t = mod(readClock(ans) - p.start, 1440);
      return Math.abs((p.s * t) / 60 - p.d) < 1e-9;
    }
    case "average": {
      // Simulate minute by minute? Use time from the candidate: distance / avg should be the total time.
      const total = p.d1 / p.s1 + p.d2 / p.s2 + p.stop / 60;
      return isExact(x, 1) && Math.abs((p.d1 + p.d2) / x - total) <= (0.05 * total) / x + 1e-9;
    }
    case "needed": return isExact(x, 1) && Math.abs(p.done + (x * (p.limit - p.used)) / 60 - p.D) <= (0.05 * (p.limit - p.used)) / 60 + 1e-9;
    case "meet": case "catch": {
      const t = mod(readClock(ans.time) - p.start, 1440); // minutes after the first one left
      const d = Number(ans.dist);
      if (t <= p.delay) return false;
      const a = (p.v1 * t) / 60, b = (p.v2 * (t - p.delay)) / 60;
      const met = p.kind === "meet" ? Math.abs(a + b - p.D) < 1e-9 : Math.abs(a - b) < 1e-9;
      return met && isExact(d, 1) && Math.abs(d - a) <= 0.05 + 1e-9;
    }
    default: return false;
  }
}

// =====================================================================
// Fuel and trip costs
// =====================================================================
function genFuel(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["litres", "cost"]);
    if (kind === "litres") {
      const c = rng.int(4, 12);
      const d = 100 * rng.int(2, 9);
      return {
        prompt: `A car uses **${c} litres of fuel per 100 km**. How many litres does it use on a **${d} km** trip?`,
        answerType: "number", answer: (c * d) / 100, tolerance: 0,
        given: [{ label: "_per100", value: c }, { label: "_km", value: d }],
        explanation: `${d} km is ${d / 100} lots of 100 km. ${d / 100} × ${c} = **${(c * d) / 100} litres**.`,
        hints: [`How many lots of 100 km are in ${d} km?`, `Each lot uses ${c} litres.`],
        params: { kind, c, d },
      };
    }
    const L = rng.int(10, 60);
    const pc = rng.int(120, 220);
    return {
      prompt: `Fuel costs **${cash2(pc / 100)} per litre**. How much do **${L} litres** cost, in dollars?`,
      answerType: "number", answer: (L * pc) / 100, tolerance: 0.005,
      given: [{ label: "_litres", value: L }, { label: "_price", value: pc / 100 }],
      explanation: `\`_litres * _price\` = ${L} × ${num(pc / 100)} = **${cash2((L * pc) / 100)}**.`,
      hints: ["Cost = litres × price per litre.", `Multiply ${L} by ${num(pc / 100)}.`],
      params: { kind, L, pc },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["trip-cost", "km-per-l"]);
    if (kind === "trip-cost") {
      let d, c, pc, exact;
      do {
        d = 10 * rng.int(5, 90);
        c = rng.int(45, 110) / 10;
        pc = rng.int(130, 220);
        exact = (d * c * pc) / 100; // cents
      } while (nearTie(exact, 0) || isExact(exact, 0));
      return {
        prompt: `A car uses **${num(c)} L per 100 km**. Fuel costs **${cash2(pc / 100)} per litre**. What does the fuel cost for a **${d} km** trip? Round to the nearest cent.`,
        answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
        given: [{ label: "_km", value: d }, { label: "_per100", value: c }, { label: "_price", value: pc / 100 }],
        explanation: `Litres: \`_km / 100 * _per100\` = ${num(d / 100)} × ${num(c)} = ${num((d * c) / 100)} L. Cost: × ${num(pc / 100)} ${approx(exact / 100)}, which rounds to **${cash2(roundK(exact, 0) / 100)}**.`,
        hints: ["Find the litres first: (km ÷ 100) × litres per 100 km.", "Then multiply by the price per litre and round."],
        params: { kind, d, c, pc },
      };
    }
    let c, kpl;
    do {
      c = rng.int(40, 120) / 10;
      kpl = 100 / c;
    } while (nearTie(kpl, 1) || isExact(kpl, 1));
    return {
      prompt: `A car uses **${num(c)} L per 100 km**. How many kilometres does it go on **1 litre**? Round to 1 decimal place.`,
      answerType: "number", answer: roundK(kpl, 1), tolerance: 0.05,
      given: [{ label: "_per100", value: c }],
      explanation: `${num(c)} L takes it 100 km, so 1 L takes it 100 / ${num(c)} ≈ ${kpl.toFixed(3)}, which rounds to **${roundK(kpl, 1).toFixed(1)} km**.`,
      hints: [`${num(c)} litres for 100 km: share the 100 km between the litres.`, "Divide 100 by the litres per 100 km."],
      params: { kind, c },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["share", "compare-cars", "ev"]);
    if (kind === "share") {
      let d, c, pc, toll, n, exact;
      do {
        d = 10 * rng.int(5, 40);
        c = rng.int(50, 100) / 10;
        pc = rng.int(130, 220);
        toll = 50 * rng.int(0, 30);
        n = rng.int(2, 5);
        exact = ((2 * d * c * pc) / 100 + toll) / n; // cents per person
      } while (nearTie(exact, 0) || isExact(exact, 0));
      return {
        prompt: `${n} friends drive to a festival **${d} km** away and back. The car uses **${num(c)} L per 100 km**, fuel is **${cash2(pc / 100)} per litre**${toll ? `, and tolls for the whole trip cost **${cash(toll / 100)}**` : ""}. They split the cost equally. How much does each pay? Round to the nearest cent.`,
        answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
        given: [{ label: "_km", value: d }, { label: "_per100", value: c }, { label: "_price", value: pc / 100 }, { label: "_tolls", value: toll / 100 }, { label: "_people", value: n }],
        explanation: `There and back is ${2 * d} km: ${num((2 * d) / 100)} × ${num(c)} = ${num((2 * d * c) / 100)} L, costing ${approx((2 * d * c * pc) / 10000)} dollars${toll ? `; plus tolls ${cash(toll / 100)}` : ""}. Each: ÷ ${n} ${approx(exact / 100)}, which rounds to **${cash2(roundK(exact, 0) / 100)}**.`,
        hints: ["It's a round trip: double the distance.", `Find the fuel cost, ${toll ? "add the tolls, " : ""}then divide by ${n}.`],
        params: { kind, d, c, pc, toll, n },
      };
    }
    if (kind === "compare-cars") {
      let c1, c2, d, pc, exact;
      do {
        c1 = rng.int(50, 110) / 10;
        c2 = rng.int(40, 100) / 10;
        d = 1000 * rng.int(5, 25);
        pc = rng.int(130, 220);
        exact = ((c1 - c2) * d * pc) / 100; // cents
      } while (c1 - c2 < 0.5 || nearTie(exact, 0));
      return {
        prompt: `Your old car uses **${num(c1)} L per 100 km** and a newer one uses **${num(c2)} L per 100 km**. You drive **${d} km** a year and fuel costs **${cash2(pc / 100)} per litre**. How much would the newer car save on fuel in a year? Round to the nearest cent.`,
        answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
        given: [{ label: "_old", value: c1 }, { label: "_new", value: c2 }, { label: "_km", value: d }, { label: "_price", value: pc / 100 }],
        explanation: `The newer car saves ${num(c1)} − ${num(c2)} = ${num(c1 - c2)} L every 100 km. Over ${d} km: ${num(d / 100)} × ${num(c1 - c2)} = ${num(((c1 - c2) * d) / 100)} L, × ${num(pc / 100)} ${approx(exact / 100)} → **${cash2(roundK(exact, 0) / 100)}**.`,
        hints: ["Find the litres saved per 100 km first.", "Scale up to the year's distance, then multiply by the fuel price."],
        params: { kind, c1, c2, d, pc },
      };
    }
    let e, d, kc, exact;
    do {
      e = rng.int(130, 250) / 10;
      d = 10 * rng.int(10, 100);
      kc = rng.int(15, 45);
      exact = (d * e * kc) / 100; // cents
    } while (nearTie(exact, 0) || isExact(exact, 0));
    return {
      prompt: `An electric car uses **${num(e)} kWh per 100 km**. Charging costs **${kc} cents per kWh**. What does it cost to drive **${d} km**? Give dollars, rounded to the nearest cent.`,
      answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
      given: [{ label: "_per100", value: e }, { label: "_cents", value: kc }, { label: "_km", value: d }],
      explanation: `Energy: ${num(d / 100)} × ${num(e)} = ${num((d * e) / 100)} kWh. Cost: × ${kc} ${approx(exact, 2)} cents = ${approx(exact / 100)} dollars → **${cash2(roundK(exact, 0) / 100)}**.`,
      hints: ["Energy used = (km ÷ 100) × kWh per 100 km.", "Multiply by the price, and watch the units: cents to dollars is ÷ 100."],
      params: { kind, e, d, kc },
    };
  }

  // expert
  const kind = rng.pick(["stops", "ev-vs-petrol"]);
  if (kind === "stops") {
    let T, c, D, pc, range, stops, exact;
    do {
      T = 5 * rng.int(8, 14);
      c = rng.int(55, 110) / 10;
      D = 50 * rng.int(20, 70);
      pc = rng.int(140, 220);
      range = (T * 100) / c;
      stops = Math.ceil(D / range) - 1;
      exact = (D * c * pc) / 100;
    } while (nearTie(exact, 0) || isExact(exact, 0) || stops < 1 || Math.abs(D / range - Math.round(D / range)) < 0.02);
    return {
      prompt: `A road trip is **${D} km**. Your car has a **${T} L** tank and uses **${num(c)} L per 100 km**. You start with a full tank and refill to full whenever you need to. Fuel costs **${cash2(pc / 100)} per litre**.`,
      answerType: "multi",
      given: [{ label: "_km", value: D }, { label: "_tank", value: T }, { label: "_per100", value: c }, { label: "_price", value: pc / 100 }],
      parts: [
        { id: "range", label: "Range", ask: "How far can you go on one full tank, in km? Round down to a whole km.", answerType: "number", answer: Math.floor(range), tolerance: 0, ...EXACT, hint: `${num(c)} L takes you 100 km; how many 100 km lots does ${T} L give?` },
        { id: "stops", label: "Stops", ask: "What is the fewest refuelling stops you need?", answerType: "number", answer: stops, tolerance: 0, ...EXACT, hint: "Divide the trip by the range and round up to get the tanks needed; the first tank is already full." },
        { id: "cost", label: "Cost", ask: "What does the fuel for the whole trip cost, in dollars (nearest cent)?", answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005, hint: "Pay for the fuel the trip burns: (km ÷ 100) × L per 100 km × price." },
      ],
      explanation: `Range: ${T} / ${num(c)} × 100 ${approx(range, 1)} → **${Math.floor(range)} km**.\n\nTanks: ${D} / ${num(range)} ${approx(D / range, 2)} → ${stops + 1} tanks, so **${stops}** refuelling stop${stops === 1 ? "" : "s"}.\n\nFuel: ${num(D / 100)} × ${num(c)} = ${num((D * c) / 100)} L × ${num(pc / 100)} ${approx(exact / 100)} → **${cash2(roundK(exact, 0) / 100)}**.`,
      params: { kind, T, c, D, pc },
    };
  }
  let c, pc, e, kc, d, petrol, ev;
  do {
    c = rng.int(50, 100) / 10;
    pc = rng.int(140, 220);
    e = rng.int(140, 220) / 10;
    kc = rng.int(15, 40);
    d = 1000 * rng.int(8, 25);
    petrol = (d * c * pc) / 100;
    ev = (d * e * kc) / 100;
  } while (nearTie(petrol, 0) || nearTie(ev, 0) || ev >= petrol || nearTie(petrol - ev, 0));
  const P = roundK(petrol, 0), V = roundK(ev, 0);
  return {
    prompt: `You drive **${d} km** a year. A petrol car uses **${num(c)} L per 100 km** with fuel at **${cash2(pc / 100)} per litre**. An electric car uses **${num(e)} kWh per 100 km** with charging at **${kc} cents per kWh**.`,
    answerType: "multi",
    given: [{ label: "_km", value: d }, { label: "_litres", value: c }, { label: "_fuel", value: pc / 100 }, { label: "_kwh", value: e }, { label: "_cents", value: kc }],
    parts: [
      { id: "petrol", label: "Petrol", ask: "Yearly fuel cost of the petrol car, in dollars (nearest cent)", answerType: "number", answer: P / 100, tolerance: 0.005, hint: "(km ÷ 100) × litres per 100 km × price per litre." },
      { id: "ev", label: "Electric", ask: "Yearly charging cost of the electric car, in dollars (nearest cent)", answerType: "number", answer: V / 100, tolerance: 0.005, hint: "(km ÷ 100) × kWh per 100 km × cents per kWh, then ÷ 100 for dollars." },
      { id: "save", label: "Saving", ask: "How much does the electric car save per year (from your rounded costs), in dollars?", answerType: "number", answer: (P - V) / 100, tolerance: 0.005, hint: "Subtract the two yearly costs." },
    ],
    explanation: `Petrol: ${num(d / 100)} × ${num(c)} × ${num(pc / 100)} ${approx(petrol / 100)} → **${cash2(P / 100)}**.\n\nElectric: ${num(d / 100)} × ${num(e)} × ${kc} / 100 ${approx(ev / 100)} → **${cash2(V / 100)}**.\n\nSaving: **${cash2((P - V) / 100)}**.`,
    params: { kind, c, pc, e, kc, d },
  };
}

function verifyFuel(q, ans) {
  const p = q.params;
  const x = Number(ans);
  const cents = (v) => Math.round(Number(v) * 100);
  switch (p.kind) {
    case "litres": return Math.abs((x / p.c) * 100 - p.d) < 1e-9;
    case "cost": return cents(ans) === p.L * p.pc;
    case "trip-cost": return Math.abs(cents(ans) * 100 - p.d * p.c * p.pc) <= 50 + 1e-6;
    case "km-per-l": return isExact(x, 1) && Math.abs(x * p.c - 100) <= 0.05 * p.c + 1e-9;
    case "share": return Math.abs(cents(ans) * p.n - ((2 * p.d * p.c * p.pc) / 100 + p.toll)) <= 0.5 * p.n + 1e-6;
    case "compare-cars": return Math.abs(cents(ans) * 100 - (p.c1 * p.d * p.pc - p.c2 * p.d * p.pc)) <= 50 + 1e-6;
    case "ev": return Math.abs(cents(ans) * 100 - p.d * p.e * p.kc) <= 50 + 1e-6;
    case "stops": {
      const r = Number(ans.range), s = Number(ans.stops);
      // Drive tank by tank.
      const range = (p.T * 100) / p.c;
      let left = p.D, tanks = 0;
      while (left > 1e-9) { left -= range; tanks++; }
      return Number.isInteger(r) && r <= range + 1e-9 && r + 1 > range && s === tanks - 1
        && Math.abs(cents(ans.cost) * 100 - p.D * p.c * p.pc) <= 50 + 1e-6;
    }
    case "ev-vs-petrol": {
      const P = cents(ans.petrol), V = cents(ans.ev);
      return Math.abs(P * 100 - p.d * p.c * p.pc) <= 50 + 1e-6 && Math.abs(V * 100 - p.d * p.e * p.kc) <= 50 + 1e-6 && cents(ans.save) === P - V;
    }
    default: return false;
  }
}

// =====================================================================
// Timetables
// =====================================================================
const STOP_SETS = [
  ["Bus station", "Market Square", "Hospital", "Hill Road", "Park Gate", "Retail Park"],
  ["Harbour", "Old Town", "Library", "College", "Stadium", "Airport"],
  ["Riverside", "High Street", "Museum", "Leisure Centre", "Westfield", "Beacon Hill"],
];

// A timetable: stops (4-5) x departures (4), with the same running times for every service.
function makeTable(rng, nStops, nRuns, first, label) {
  const names = rng.pick(STOP_SETS).slice(0, nStops);
  const legs = [];
  for (let i = 1; i < nStops; i++) legs.push(rng.int(4, 18));
  const starts = [first];
  for (let k = 1; k < nRuns; k++) starts.push(starts[k - 1] + 5 * rng.int(3, 9));
  const at = (k, i) => starts[k] + legs.slice(0, i).reduce((a, b) => a + b, 0);
  const head = `| Stop | ${starts.map((_, k) => `${label} ${k + 1}`).join(" | ")} |`;
  const sep = `| --- | ${starts.map(() => "---").join(" | ")} |`;
  const rows = names.map((n, i) => `| ${n} | ${starts.map((_, k) => t24(at(k, i))).join(" | ")} |`);
  return { names, legs, starts, at, md: [head, sep, ...rows].join("\n") };
}

function genTimetable(difficulty, rng) {
  if (difficulty === "easy") {
    const T = makeTable(rng, 4, 3, 5 * rng.int(84, 180), "Bus");
    let i, j;
    do {
      i = rng.int(0, 2);
      j = rng.int(1, 3);
    } while (j <= i);
    const k = rng.int(0, 2);
    const m = T.at(k, j) - T.at(k, i);
    return {
      prompt: `${T.md}\n\nHow many minutes does **Bus ${k + 1}** take from **${T.names[i]}** to **${T.names[j]}**?`,
      answerType: "number", answer: m, tolerance: 0, ...EXACT,
      explanation: `Bus ${k + 1} leaves ${T.names[i]} at ${t24(T.at(k, i))} and reaches ${T.names[j]} at ${t24(T.at(k, j))}: **${m} minutes**.`,
      hints: [`Find the Bus ${k + 1} column, then read the times in the ${T.names[i]} and ${T.names[j]} rows.`, "Count the minutes from the first time to the second."],
      params: { kind: "ride", legs: T.legs, i, j },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["latest", "next"]);
    const T = makeTable(rng, 5, 4, 5 * rng.int(84, 180), "Bus");
    let i, j;
    do {
      i = rng.int(0, 3);
      j = rng.int(1, 4);
    } while (j <= i);
    if (kind === "latest") {
      const k = rng.int(0, 3);
      const deadline = T.at(k, j) + rng.int(0, Math.min(14, k < 3 ? T.at(k + 1, j) - T.at(k, j) - 1 : 14));
      const choices = T.starts.map((_, kk) => t24(T.at(kk, i)));
      return {
        prompt: `${T.md}\n\nYou must be at **${T.names[j]}** by **${t24(deadline)}**. What is the latest bus you can catch from **${T.names[i]}**? Choose its departure time from ${T.names[i]}.`,
        answerType: "choice", answer: t24(T.at(k, i)), choices,
        explanation: `In the ${T.names[j]} row, the last arrival at or before ${t24(deadline)} is ${t24(T.at(k, j))} (Bus ${k + 1}). Bus ${k + 1} leaves ${T.names[i]} at **${t24(T.at(k, i))}**.`,
        hints: [`Look along the ${T.names[j]} row for the latest time that is not after ${t24(deadline)}.`, `Then go up that column to the ${T.names[i]} row.`],
        params: { kind, legs: T.legs, starts: T.starts, i, j, deadline },
      };
    }
    const k = rng.int(1, 3);
    const arrive = T.at(k - 1, i) + rng.int(1, T.at(k, i) - T.at(k - 1, i));
    return {
      prompt: `${T.md}\n\nYou get to the **${T.names[i]}** stop at **${t24(arrive)}** and take the next bus. What time do you reach **${T.names[j]}**?${TIME24}`,
      answerType: "text", ...timeAns(T.at(k, j)),
      explanation: `The first bus leaving ${T.names[i]} at or after ${t24(arrive)} is Bus ${k + 1} at ${t24(T.at(k, i))}. It reaches ${T.names[j]} at **${t24(T.at(k, j))}**.`,
      hints: [`In the ${T.names[i]} row, find the first time at or after ${t24(arrive)}.`, `Follow that column down to ${T.names[j]}.`],
      params: { kind, legs: T.legs, starts: T.starts, i, j, arrive },
    };
  }

  // hard / expert: bus to an interchange, then a train
  const B = makeTable(rng, 4, 4, 5 * rng.int(84, 150), "Bus");
  const hub = B.names[3];
  const trainStops = [hub, ...rng.pick([["Fairfield", "Kingsbridge", "Central"], ["Oakley", "Southgate", "City"], ["Lowmoor", "Ashby", "Central"]])];
  const T = makeTable({ ...rng, pick: () => trainStops }, 4, 4, B.at(0, 3) + rng.int(3, 20), "Train");
  // makeTable drew legs/starts with rng; stop names come from trainStops.
  const change = rng.pick([3, 5, 8]);
  const nextTrain = (t) => T.starts.findIndex((s) => s >= t + change);
  if (difficulty === "hard") {
    let arrive, k, kt;
    let tries = 0;
    do {
      k = rng.int(0, 2);
      arrive = B.at(k, 0) - rng.int(0, 10);
      kt = nextTrain(B.at(k, 3));
      tries++;
    } while ((kt < 0 || (k > 0 && arrive <= B.at(k - 1, 0))) && tries < 50);
    if (kt < 0) return genTimetable("medium", rng);
    const dest = rng.int(1, 3);
    return {
      prompt: `**Buses**\n\n${B.md}\n\n**Trains**\n\n${T.md}\n\nYou reach the **${B.names[0]}** stop at **${t24(arrive)}** and take the next bus to ${hub}. Changing at ${hub} takes at least **${change} min**. You take the first train you can to **${trainStops[dest]}**. What time do you get there?${TIME24}`,
      answerType: "text", ...timeAns(T.at(kt, dest)),
      explanation: `Next bus: Bus ${k + 1} at ${t24(B.at(k, 0))}, reaching ${hub} at ${t24(B.at(k, 3))}. With ${change} min to change, the first train you can catch leaves at or after ${t24(B.at(k, 3) + change)}: Train ${kt + 1} at ${t24(T.starts[kt])}. It reaches ${trainStops[dest]} at **${t24(T.at(kt, dest))}**.`,
      hints: [`Find the first bus from ${B.names[0]} at or after ${t24(arrive)} and its time at ${hub}.`, `Add the ${change} min change time, then find the first train leaving ${hub} at or after that.`],
      params: { kind: "connect", bus: { legs: B.legs, starts: B.starts }, train: { legs: T.legs, starts: T.starts }, arrive, change, dest },
    };
  }
  // expert: from leaving home (walk), total journey and total waiting
  let leave, walk, k, kt, tries = 0;
  do {
    walk = rng.int(4, 15);
    k = rng.int(0, 2);
    leave = B.at(k, 0) - walk - rng.int(0, 9);
    kt = nextTrain(B.at(k, 3));
    tries++;
  } while ((kt < 0 || (k > 0 && leave + walk <= B.at(k - 1, 0))) && tries < 50);
  if (kt < 0) return genTimetable("medium", rng);
  const dest = 3;
  const arriveAt = T.at(kt, dest);
  const total = arriveAt - leave;
  const wait = (B.at(k, 0) - (leave + walk)) + (T.starts[kt] - B.at(k, 3));
  return {
    prompt: `**Buses**\n\n${B.md}\n\n**Trains**\n\n${T.md}\n\nYou leave home at **${t24(leave)}** and walk **${walk} min** to the **${B.names[0]}** stop. You take the next bus to ${hub}, where changing takes at least **${change} min**, then the first train you can to **${trainStops[dest]}**.`,
    answerType: "multi",
    given: [{ label: "_walk", value: walk }, { label: "_change", value: change }],
    parts: [
      { id: "arrive", label: "Arrive", ask: `What time do you reach ${trainStops[dest]}? (24-hour, hh:mm)`, answerType: "text", ...timeAns(arriveAt), hint: `You reach the stop at ${t24(leave + walk)}. Find the next bus, its time at ${hub}, then the first train at least ${change} min later.` },
      { id: "total", label: "Total", ask: "How many minutes is the whole journey, from leaving home?", answerType: "number", answer: total, tolerance: 0, ...EXACT, hint: "From your leaving time to your arrival time." },
      { id: "wait", label: "Waiting", ask: "How many minutes do you spend waiting (at the bus stop and at the station together)?", answerType: "number", answer: wait, tolerance: 0, ...EXACT, hint: `Bus stop: from reaching it to the bus leaving. Station: from the bus arriving at ${hub} to the train leaving.` },
    ],
    explanation: `At the stop: ${t24(leave + walk)}. Bus ${k + 1} leaves at ${t24(B.at(k, 0))} (wait ${B.at(k, 0) - leave - walk} min) and reaches ${hub} at ${t24(B.at(k, 3))}. The first train at or after ${t24(B.at(k, 3) + change)} is Train ${kt + 1} at ${t24(T.starts[kt])} (wait ${T.starts[kt] - B.at(k, 3)} min), arriving at **${t24(arriveAt)}**.\n\nWhole journey: ${t24(leave)} to ${t24(arriveAt)} = **${total} min**. Waiting: ${B.at(k, 0) - leave - walk} + ${T.starts[kt] - B.at(k, 3)} = **${wait} min**.`,
    params: { kind: "door", bus: { legs: B.legs, starts: B.starts }, train: { legs: T.legs, starts: T.starts }, leave, walk, change, dest },
  };
}

function verifyTimetable(q, ans) {
  const p = q.params;
  const sum = (legs, i) => legs.slice(0, i).reduce((a, b) => a + b, 0);
  // Earliest service leaving the first stop of `tt` at or after t, as a scan.
  const board = (tt, t) => {
    for (const s of tt.starts) if (s >= t) return s;
    return null;
  };
  switch (p.kind) {
    case "ride": return Number(ans) === sum(p.legs, p.j) - sum(p.legs, p.i);
    case "latest": {
      const dep = readClock(ans);
      const k = p.starts.findIndex((s) => s + sum(p.legs, p.i) === dep);
      if (k < 0 || p.starts[k] + sum(p.legs, p.j) > p.deadline) return false;
      return k === p.starts.length - 1 || p.starts[k + 1] + sum(p.legs, p.j) > p.deadline;
    }
    case "next": {
      const s = board({ starts: p.starts.map((x) => x + sum(p.legs, p.i)) }, p.arrive);
      return s !== null && readClock(ans) === s - sum(p.legs, p.i) + sum(p.legs, p.j);
    }
    case "connect": case "door": {
      const atStop = p.kind === "door" ? p.leave + p.walk : p.arrive;
      const busDep = board(p.bus, atStop);
      if (busDep === null) return false;
      const atHub = busDep + sum(p.bus.legs, 3);
      const train = board(p.train, atHub + p.change);
      if (train === null) return false;
      const arrive = train + sum(p.train.legs, p.dest);
      if (p.kind === "connect") return readClock(ans) === arrive;
      return readClock(ans.arrive) === arrive && Number(ans.total) === arrive - p.leave
        && Number(ans.wait) === (busDep - atStop) + (train - atHub);
    }
    default: return false;
  }
}

// =====================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard", "expert"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const make = { journeys: genJourney, "fuel-costs": genFuel, timetables: genTimetable }[subtopic];
  if (!make) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = make(difficulty, rng);
  q.params.sub = subtopic;
  return q;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || answer === undefined || answer === null || answer === "") return false;
  if (question.answerType === "choice" && !question.choices.includes(String(answer))) return false;
  if (question.answerType === "multi" && typeof answer !== "object") return false;
  try {
    if (p.sub === "journeys") return verifyJourney(question, answer);
    if (p.sub === "fuel-costs") return verifyFuel(question, answer);
    if (p.sub === "timetables") return verifyTimetable(question, answer);
    return false;
  } catch {
    return false;
  }
}
