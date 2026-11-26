// Operations Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// All inputs are whole numbers and every chained answer is an exact integer (or a 2 dp figure
// computed from integers), so a rounded earlier answer never changes a later one.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   route-timing   drive time -> breaks -> arrival across a UTC offset -> on time?; latest departure  (Logistics)
//   load-planning  boxes -> pallets -> trucks -> cost per unit; weight vs space limit, fleet check     (Logistics)
//   staffing-plan  capacity per worker -> crew -> labour cost -> budget; hire vs overtime               (Planner)
//   stock-reorder  reorder point -> days until order -> order date -> lead-time risk; policy checks    (Planner)

import { MONTHS, addCalendarDays, formatDMY } from "../../js/lib/dates.js";

// ---------- helpers ----------

function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? "" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-operations-manager: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const utcText = (o) => (o === 0 ? "UTC+0" : o > 0 ? `UTC+${o}` : `UTC-${-o}`);
const cdiv = (a, b) => Math.floor((a + b - 1) / b); // integer ceiling division

// Whole-number (or fixed dp) number part. Whole counts and minutes are exact, so fuzzyNumber 0.
function numPart(id, label, ask, val, dp, hint) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
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
function segPart(id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// Calendar days (integer day numbers to build, Date in UTC to check; js/lib/dates.js; no daylight saving anywhere).
const addDays = addCalendarDays;
const fmtDay = formatDMY;

// ---------- route-timing ----------

const SPEEDS = [60, 72, 80, 88, 100]; // multiples of 4, so distance is a whole number for any quarter-hour drive
const BREAK_RULE = "The driver takes a 15-minute break after every full 2 hours of driving (a 4 h 30 min drive includes two breaks).";

function genRoute(rng, tier) {
  const plus = tier === "expert-plus";
  const med = tier === "medium";
  for (let i = 0; i < TRY; i++) {
    const v = rng.pick(SPEEDS);
    const m = rng.int(10, 36) * 15; // 150..540 minutes of driving
    if (!med && m % 120 === 0) continue;
    const dist = (v * m) / 60;
    const oa = rng.int(-4, 4);
    const diff = rng.pick([-3, -2, -1, 1, 2, 3]);
    const ob = oa + diff;
    const dep = rng.int(20, 44) * 15; // 05:00..11:00 at the origin
    const brk = med ? 0 : Math.floor(m / 120) * 15;
    const total = m + brk;
    const arr = dep + total + diff * 60; // arrival, destination local
    if (arr < 60 || arr > 1380) continue;
    const n = TIER_PARTS[tier];
    const given = [["_dist", dist], ["_speed", v], ["_gap", diff]];
    const route = `The depot is on **${utcText(oa)}** and the customer's site is on **${utcText(ob)}** (fixed offsets, no daylight saving). The trip is **${commas(dist)} km** at an average of **${v} km/h**. All clock times are 24-hour.`;
    const exDrive = `**Driving time:** ${commas(dist)} ÷ ${v} × 60 = **${m} min**.`;
    const exTotal = `**Total time:** ${m} min of driving has ${Math.floor(m / 120)} break${Math.floor(m / 120) === 1 ? "" : "s"} of 15 min (${brk} min), so **${total} min**.`;
    if (!plus) {
      const parts = [numPart("drive", "Driving time", "Driving time (minutes)", m, 0, `Time = distance ÷ speed, in hours; multiply by 60 for minutes. The speed is ${v} km/h.`)];
      if (!med) parts.push(numPart("total", "Total time", "Total trip time including breaks (minutes)", total, 0, "Count the full 2-hour blocks of driving (ignore any part-block), then add 15 minutes for each one to the driving time."));
      parts.push(timePart("arr", "Arrival", "Arrival time at the customer's site, local time", arr, `Add the total trip time to the departure time, then add the time-zone gap: the site is ${diff > 0 ? `${diff} h ahead (add)` : `${-diff} h behind (subtract)`} of the depot.`));
      let ok, delta, deadline;
      if (tier === "expert") {
        delta = rng.pick([-45, -30, -20, -10, 10, 20, 30, 45]);
        deadline = arr + delta;
        ok = arr <= deadline;
        parts.push(yesNo("ok", "On time?", `The customer needs the goods by **${hhmm(deadline)}** local time. Is the delivery on time?`, ok, "Compare your arrival time with the deadline, both in the customer's local time."));
      }
      const exArr = `**Arrival:** ${hhmm(dep)} + ${total} min = ${hhmm(dep + total)} depot time; the site is ${diff > 0 ? `${diff} h ahead` : `${-diff} h behind`}, so **${hhmm(arr)}** local.`;
      const exOk = tier === "expert" ? `**On time:** ${hhmm(arr)} is ${ok ? "no later than" : "after"} ${hhmm(deadline)}, so **${ok ? "Yes" : "No"}**.` : "";
      const ex = [exDrive, !med ? exTotal : "", exArr, exOk].filter(Boolean).join("\n\n");
      return finish(
        `A truck leaves the depot at **${hhmm(dep)}** depot time. ${route}${med ? " Ignore breaks." : ` ${BREAK_RULE}`}`,
        parts.slice(0, n), ex, "op-route", { tier, v, m, dist, oa, ob, dep, delta: delta ?? 0, deadline: deadline ?? 0 }, given,
        ["Work in minutes: driving time first, then add breaks, then the time-zone gap.", "Departure time is local to the depot; arrival is asked in the site's local time."],
      );
    }
    // expert-plus: work backwards from the deadline
    const H = rng.pick([4, 5, 6, 7, 8]);
    if (Math.abs(m - 60 * H) < 15) continue;
    const DL = rng.int(60, 92) * 15; // required arrival, site local, 15:00..23:00
    const latest = DL - total - diff * 60; // latest departure, depot time
    if (latest < 120 || latest > 1380) continue;
    const rd = latest + rng.pick([-40, -25, -10, 10, 25, 40]);
    if (rd < 0 || rd > 1439) continue;
    const onTime = rd <= latest;
    const within = m <= 60 * H;
    const parts = [
      numPart("drive", "Driving time", "Driving time (minutes)", m, 0, `Time = distance ÷ speed, in hours; multiply by 60. The speed is ${v} km/h.`),
      numPart("total", "Total time", "Total trip time including breaks (minutes)", total, 0, "Count the full 2-hour blocks of driving, then add 15 minutes for each one."),
      timePart("latest", "Latest departure", "Latest departure time from the depot, depot time", latest, `Work backwards: start from the required arrival time, take off the total trip time, then take off the time-zone gap (the site is ${diff > 0 ? `${diff} h ahead` : `${-diff} h behind`} of the depot).`),
      segPart("verdict", "Verdict", `The driver is ready to leave at **${hhmm(rd)}** depot time. Is that in time, and does the driving stay within the limit of **${H} hours** of driving?`, ["Departure", "Driving limit"], ["On time", "Late"], ["Within limit", "Over limit"], [onTime ? "On time" : "Late", within ? "Within limit" : "Over limit"],
        "A departure is on time if it is no later than the latest departure you found. The driving limit applies to driving time only, not to breaks."),
    ];
    const ex = [
      exDrive, exTotal,
      `**Latest departure:** ${hhmm(DL)} − ${total} min = ${hhmm(DL - total)} site time; the site is ${diff > 0 ? `${diff} h ahead` : `${-diff} h behind`}, so **${hhmm(latest)}** depot time.`,
      `**Verdict:** ${hhmm(rd)} is ${onTime ? "no later than" : "after"} ${hhmm(latest)}, so **${onTime ? "On time" : "Late"}**. Driving is ${m} min against a limit of ${60 * H} min, so **${within ? "Within limit" : "Over limit"}**.`,
    ].join("\n\n");
    return finish(
      `A delivery must reach the customer's site by **${hhmm(DL)}** local time. ${route} ${BREAK_RULE}`,
      parts, ex, "op-routeback", { tier, v, m, dist, oa, ob, DL, rd, H }, given,
      ["Work forwards first (driving time, then breaks), then backwards from the deadline.", "The deadline is local to the site; the departure time is asked at the depot."],
    );
  }
  return tooMany();
}

// ---------- load-planning ----------

function genLoad(rng, tier) {
  const plus = tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    const b = rng.pick([6, 8, 10, 12, 15, 20]); // units per box
    const p = rng.pick([10, 12, 15, 20, 24, 30]); // boxes per pallet
    const q = rng.pick([10, 12, 14, 16, 18, 20, 24]); // pallets per truck (space)
    const U = b * p; // units per full pallet
    if (!plus) {
      const trucksT = rng.int(2, 9);
      const N = Math.round(trucksT * q * U * (0.55 + 0.4 * rng.next()));
      const boxes = cdiv(N, b), pallets = cdiv(boxes, p), trucks = cdiv(pallets, q);
      if (N % b === 0 || boxes % p === 0 || pallets % q === 0) continue; // every step genuinely rounds up
      if (trucks < 2 || N > 60000) continue;
      const cost = rng.pick([150, 180, 200, 240, 250, 300, 320, 400]);
      const cpu = (trucks * cost) / N;
      if (nearHalf(cpu, 2, 0.08)) continue;
      const n = TIER_PARTS[tier];
      const all = [
        numPart("boxes", "Boxes", "Boxes needed (a part-full box still counts as one)", boxes, 0, `Boxes = units ÷ ${b}, rounded up.`),
        numPart("pallets", "Pallets", "Pallets needed (a part-full pallet still counts as one)", pallets, 0, `Pallets = boxes ÷ ${p}, rounded up. Use your whole number of boxes.`),
        numPart("trucks", "Trucks", "Trucks needed", trucks, 0, `Trucks = pallets ÷ ${q}, rounded up.`),
        numPart("cpu", "Cost per unit", "Delivery cost per unit ($)", cpu, 2, `Total cost = trucks × $${cost}; divide by the ${commas(N)} units.`),
      ].slice(0, n);
      const ex = [
        `**Boxes:** ${commas(N)} ÷ ${b} = ${fixed(N / b, 2)}, rounded up to **${boxes}**.`,
        `**Pallets:** ${boxes} ÷ ${p} = ${fixed(boxes / p, 2)}, rounded up to **${pallets}**.`,
        `**Trucks:** ${pallets} ÷ ${q} = ${fixed(pallets / q, 2)}, rounded up to **${trucks}**.`,
        `**Cost per unit:** ${trucks} × $${cost} = $${trucks * cost}; ÷ ${commas(N)} = **$${fixed(cpu, 2)}**.`,
      ].slice(0, n).join("\n\n");
      return finish(
        `A warehouse must ship **${commas(N)} units**. Each box holds **${b} units**, each pallet holds **${p} boxes**, and each truck carries **${q} pallets**.${n >= 4 ? ` Each truck trip costs **$${cost}**.` : ""}`,
        all, ex, "op-load", { b, p, q, N, cost }, [["_units", N], ["_perbox", b], ["_perpallet", p], ["_perTruck", q]].concat(n >= 4 ? [["_trip", cost]] : []),
        ["Round up at every step: a part-filled box, pallet or truck still has to be used.", "Use your rounded whole numbers when you move on to the next step."],
      );
    }
    // expert-plus: space limit vs weight limit
    const g = rng.pick([1, 2, 3, 4, 5]); // kg per unit
    const pw = U * g; // kg per full pallet
    const wl = q + rng.pick([-6, -4, -3, -2, -1, 1, 2, 3, 4, 6]);
    if (wl < 4) continue;
    const W = Math.round(pw * (wl + rng.pick([0.1, 0.3, 0.5, 0.7, 0.9])));
    const byW = Math.floor(W / pw);
    const frac = W / pw - byW;
    if (frac < 0.06 || frac > 0.94 || byW === q || byW < 3) continue;
    const allowed = Math.min(q, byW);
    const perTruck = allowed * U;
    const trucksT = rng.int(3, 11);
    const N = Math.round(perTruck * (trucksT - 0.15 - 0.7 * rng.next()));
    const trucks = cdiv(N, perTruck);
    if (N % perTruck === 0 || trucks < 2) continue;
    const F = trucks + rng.pick([-2, -1, 1, 2]);
    if (F < 1) continue;
    const binding = byW < q ? "Weight" : "Space";
    const enough = F >= trucks;
    const parts = [
      numPart("bywt", "Weight limit", "Most pallets one truck can carry within its payload (whole pallets)", byW, 0, `Weight of one full pallet = units per pallet × ${g} kg. Divide the payload by it and round down.`),
      numPart("pallets", "Pallets per truck", "Pallets one truck can actually carry", allowed, 0, `A truck is held back by the smaller of its space limit (${q} pallets) and the weight limit you found.`),
      numPart("trucks", "Trucks", "Trucks needed for the order", trucks, 0, `Units per truck = pallets per truck × ${U}. Divide the order by that and round up.`),
      segPart("verdict", "Verdict", `Which limit holds a truck back, and is a fleet of **${F} trucks** enough for the order?`, ["Binding limit", "Fleet"], ["Space", "Weight"], ["Enough", "Short"], [binding, enough ? "Enough" : "Short"],
        "The binding limit is the one that allows fewer pallets. The fleet is enough if it has at least as many trucks as you need."),
    ];
    const ex = [
      `**Weight limit:** a full pallet holds ${b} × ${p} = ${U} units, ${U} × ${g} = ${pw} kg. ${commas(W)} ÷ ${pw} = ${fixed(W / pw, 2)}, rounded down to **${byW}**.`,
      `**Pallets per truck:** the smaller of ${q} (space) and ${byW} (weight) is **${allowed}**.`,
      `**Trucks:** ${allowed} × ${U} = ${commas(perTruck)} units per truck; ${commas(N)} ÷ ${commas(perTruck)} = ${fixed(N / perTruck, 2)}, rounded up to **${trucks}**.`,
      `**Verdict:** the ${binding.toLowerCase()} limit binds, and ${F} trucks is ${enough ? "at least" : "fewer than"} the ${trucks} needed, so **${binding} | ${enough ? "Enough" : "Short"}**.`,
    ].join("\n\n");
    return finish(
      `A depot must ship **${commas(N)} units**. Each box holds **${b} units**, each pallet holds **${p} boxes** and every pallet is loaded full. Each unit weighs **${g} kg**. A truck has room for **${q} pallets** and a payload limit of **${commas(W)} kg**.`,
      parts, ex, "op-loadback", { b, p, q, g, W, N, F }, [["_units", N], ["_perbox", b], ["_perpallet", p], ["_kg", g], ["_payload", W], ["_room", q]],
      ["Two limits apply to every truck: space and weight. Find the pallets allowed by each.", "Capacity per truck is in units; the order is in units."],
    );
  }
  return tooMany();
}

// ---------- staffing-plan ----------

const SHIFT_PAID = 8; // paid hours per shift, stated in the prompt

function genStaff(rng, tier) {
  const plus = tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    const r = rng.pick([4, 5, 6, 8, 10, 12, 15]); // units per productive hour per worker
    const h = rng.pick([5, 6, 7]); // productive hours per shift
    const w = rng.int(14, 30); // wage $ per paid hour
    const cap = r * h;
    if (!plus) {
      const crewT = rng.int(4, 24);
      const D = Math.round(crewT * cap * (0.6 + 0.35 * rng.next()));
      const crew = cdiv(D, cap);
      if (D % cap === 0 || crew < 3) continue;
      const cost = crew * SHIFT_PAID * w;
      const budget = Math.round((cost * rng.pick([0.9, 0.94, 1.06, 1.1, 1.15])) / 10) * 10;
      if (Math.abs(budget - cost) / cost < 0.04) continue;
      const ok = cost <= budget;
      const n = TIER_PARTS[tier];
      const all = [
        numPart("cap", "Capacity", "Units one worker produces in a shift", cap, 0, `Output per shift = units per productive hour (${r}) × productive hours per shift (${h}).`),
        numPart("crew", "Crew", "Workers needed per shift (a part-used worker still counts as one)", crew, 0, "Workers = daily demand ÷ output per worker, rounded up."),
        numPart("cost", "Labour cost", "Labour cost of one day's shift ($)", cost, 0, `Every worker is paid for ${SHIFT_PAID} hours at $${w}, whatever the productive hours.`),
        yesNo("ok", "Within budget?", `The daily labour budget is **$${commas(budget)}**. Does the crew cost fit within it?`, ok, "Compare your labour cost with the budget."),
      ].slice(0, n);
      const ex = [
        `**Capacity:** ${r} × ${h} = **${cap} units** per worker per shift.`,
        `**Crew:** ${commas(D)} ÷ ${cap} = ${fixed(D / cap, 2)}, rounded up to **${crew}** workers.`,
        `**Labour cost:** ${crew} × ${SHIFT_PAID} × $${w} = **$${commas(cost)}**.`,
        `**Budget:** $${commas(cost)} is ${ok ? "within" : "over"} $${commas(budget)}, so **${ok ? "Yes" : "No"}**.`,
      ].slice(0, n).join("\n\n");
      return finish(
        `A line must make **${commas(D)} units** a day on a single shift. Each worker makes **${r} units** per productive hour and is productive for **${h} hours** of the shift. Workers are paid for **${SHIFT_PAID} hours** at **$${w}** an hour.`,
        all, ex, "op-staff", { r, h, w, D, budget, n }, [["_demand", D], ["_rate", r], ["_hours", h], ["_wage", w]].concat(n >= 4 ? [["_budget", budget]] : []),
        ["Capacity per worker first; then divide the demand by it and round up.", "Cost is paid hours × wage × workers, so productive hours do not enter it."],
      );
    }
    // expert-plus: weekly shortfall -> extra workers -> hire or pay overtime
    const k = rng.pick([5, 6]); // days per week
    const C = rng.int(5, 14); // current crew
    const weekCap = C * cap * k;
    const short = rng.int(2, 11) * r * h + rng.int(1, r * h - 1) * rng.int(0, 1) + rng.int(1, 9) * r;
    const Dw = weekCap + short;
    const extra = cdiv(short, cap * k);
    const m = rng.pick([1.25, 1.5, 2]);
    const hire = extra * SHIFT_PAID * k * w;
    const ot = (short / r) * w * m;
    const cheap = Math.min(hire, ot), dear = Math.max(hire, ot);
    const sav = ((dear - cheap) / dear) * 100;
    if (Math.abs(sav - 10) < 2 || dear === cheap || short % (cap * k) === 0) continue;
    const parts = [
      numPart("capwk", "Weekly capacity", "Units the current crew makes in a week", weekCap, 0, `Weekly output = workers × output per worker per shift (${r} × ${h}) × working days (${k}).`),
      numPart("short", "Shortfall", "Units short each week", short, 0, "Shortfall = weekly demand − weekly capacity."),
      numPart("extra", "Extra workers", "Extra workers to hire so that demand is met (a part-used worker still counts as one)", extra, 0, `One extra worker adds ${cap} units a shift, which is output per shift × ${k} days a week. Divide the shortfall by it and round up.`),
      segPart("verdict", "Verdict", `Hired workers are paid ${SHIFT_PAID} hours a shift for every working day. The alternative is to cover the whole shortfall with overtime at **${m} ×** the hourly wage, paid only for the productive hours needed. Which option is cheaper for the week, and by how much (as a percentage of the dearer option)?`, ["Cheaper option", "Saving"], ["Hire", "Overtime"], ["Under 10%", "10% or more"], [hire < ot ? "Hire" : "Overtime", sav < 10 ? "Under 10%" : "10% or more"],
        "Cost to hire = extra workers × paid hours × days × wage. Overtime hours = shortfall ÷ units per hour. Saving % = (dearer − cheaper) ÷ dearer × 100."),
    ];
    const ex = [
      `**Weekly capacity:** ${C} × ${cap} × ${k} = **${commas(weekCap)} units**.`,
      `**Shortfall:** ${commas(Dw)} − ${commas(weekCap)} = **${commas(short)} units**.`,
      `**Extra workers:** ${commas(short)} ÷ (${cap} × ${k}) = ${fixed(short / (cap * k), 2)}, rounded up to **${extra}**.`,
      `**Options:** hiring costs ${extra} × ${SHIFT_PAID} × ${k} × $${w} = $${commas(hire)}; overtime is ${fixed(short / r, 2)} h × $${w} × ${m} = $${fixed(ot, 2)}. ${hire < ot ? "Hiring" : "Overtime"} is cheaper by ${fixed(sav, 1)}% of the dearer, so **${hire < ot ? "Hire" : "Overtime"} | ${sav < 10 ? "Under 10%" : "10% or more"}**.`,
    ].join("\n\n");
    return finish(
      `A plant has **${C} workers** on a single shift for **${k} days** a week and needs **${commas(Dw)} units** a week. Each worker makes **${r} units** per productive hour and is productive for **${h} hours** of the shift. Workers are paid **$${w}** an hour.`,
      parts, ex, "op-staffback", { r, h, w, C, k, Dw, m }, [["_crew", C], ["_days", k], ["_demand", Dw], ["_rate", r], ["_hours", h], ["_wage", w]],
      ["Weekly capacity first, then the gap to demand, then how many workers close that gap.", "Hiring pays for the whole paid shift; overtime pays only for the productive hours needed."],
    );
  }
  return tooMany();
}

// ---------- stock-reorder ----------

function genStock(rng, tier) {
  const plus = tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    const u = rng.pick([20, 25, 30, 40, 50, 60, 80, 100, 120, 150]); // units used per day
    const L = rng.int(3, 10); // lead time, days
    const sf = rng.pick([0.5, 0.8, 1.2, 1.5, 2, 2.5, 3]);
    const S = Math.round(u * sf); // safety stock
    const rop = u * L + S;
    const d = rng.int(2, 12); // days until the count reaches the reorder point
    const stock = rop + u * d;
    const y = 2027, mo = rng.int(1, 12), da = rng.int(1, 28);
    const ordered = addDays(y, mo, da, d);
    const today = `${da} ${MONTHS[mo - 1]} ${y}`;
    const conv = `Stock is counted at the start of each day and usage happens during the day. An order is placed on the first morning the count is at or below the reorder point.`;
    const n = TIER_PARTS[tier];
    if (!plus) {
      const e = rng.pick([1, 2, 3, 4]); // possible extra lead-time days
      if (n === 4 && (Math.abs(S - u * e) < 0.3 * u)) continue;
      const covers = S >= u * e;
      const all = [
        numPart("rop", "Reorder point", "Reorder point (units)", rop, 0, `Reorder point = daily usage × lead time + safety stock (${u} × ${L} + ${S}).`),
        numPart("days", "Days until order", "Whole days from the count until the order must be placed", d, 0, "The gap between the current stock and the reorder point, divided by daily usage."),
        { id: "when", label: "Order date", ask: "On what date is the order placed?", answerType: "date", precision: "day", answer: fmtDay(ordered), hint: "Count the days you found forward from the date of the stock count." },
        yesNo("ok", "Cover?", `The supplier warns that the lead time may rise by **${e} day${e > 1 ? "s" : ""}**. Would the safety stock still cover the extra demand?`, covers, "Extra demand during a longer lead time = daily usage × extra days. Compare it with the safety stock."),
      ].slice(0, n);
      const ex = [
        `**Reorder point:** ${u} × ${L} + ${S} = **${commas(rop)} units**.`,
        `**Days until order:** (${commas(stock)} − ${commas(rop)}) ÷ ${u} = **${d} days**.`,
        `**Order date:** ${today} + ${d} days = **${fmtDay(ordered)}**.`,
        `**Cover:** ${e} extra day${e > 1 ? "s" : ""} × ${u} = ${commas(u * e)} units against a safety stock of ${commas(S)}, so **${covers ? "Yes" : "No"}**.`,
      ].slice(0, n).join("\n\n");
      return finish(
        `A warehouse uses **${u} units** a day and the supplier delivers **${L} days** after an order. Safety stock is **${commas(S)} units**. The count on **${today}** is **${commas(stock)} units**. ${conv}`,
        all, ex, "op-stock", { u, L, S, stock, e, today: { y, mo, da }, n }, [["_usage", u], ["_lead", L], ["_safety", S], ["_stock", stock]],
        ["Reorder point = what is used while waiting for the delivery, plus the safety stock.", "Units above the reorder point, divided by daily usage, give the days you can wait."],
      );
    }
    // expert-plus: usage is not stated, work back from the reorder point
    const X = rng.pick([1, 2, 3]);
    const e = rng.pick([1, 2, 3, 4]);
    if (Math.abs(sf - X) < 0.3 || Math.abs(sf - e) < 0.3) continue;
    const meets = S >= u * X, covered = S >= u * e;
    const parts = [
      numPart("usage", "Daily usage", "Units used per day", u, 0, "Reorder point − safety stock is what is used during the lead time. Divide by the lead time in days."),
      numPart("days", "Days until order", "Whole days from the count until the order must be placed", d, 0, "Units above the reorder point, divided by daily usage."),
      { id: "when", label: "Order date", ask: "On what date is the order placed?", answerType: "date", precision: "day", answer: fmtDay(ordered), hint: "Count the days you found forward from the date of the stock count." },
      segPart("verdict", "Verdict", `Policy says safety stock must cover at least **${X} day${X > 1 ? "s" : ""}** of usage. The lead time may also rise by **${e} day${e > 1 ? "s" : ""}**. Does the safety stock meet the policy, and does it cover the longer lead time?`, ["Policy", "Longer lead time"], ["Met", "Not met"], ["Covered", "Exposed"], [meets ? "Met" : "Not met", covered ? "Covered" : "Exposed"],
        "Safety stock covers a number of days equal to safety stock ÷ daily usage. Compare that with the policy days and with the extra lead-time days."),
    ];
    const ex = [
      `**Daily usage:** (${commas(rop)} − ${commas(S)}) ÷ ${L} = **${u} units**.`,
      `**Days until order:** (${commas(stock)} − ${commas(rop)}) ÷ ${u} = **${d} days**.`,
      `**Order date:** ${today} + ${d} days = **${fmtDay(ordered)}**.`,
      `**Verdict:** the safety stock covers ${fixed(S / u, 2)} days of usage, which ${meets ? "meets" : "misses"} the ${X}-day policy and ${covered ? "covers" : "does not cover"} ${e} extra day${e > 1 ? "s" : ""}, so **${meets ? "Met" : "Not met"} | ${covered ? "Covered" : "Exposed"}**.`,
    ].join("\n\n");
    return finish(
      `A warehouse's reorder point is **${commas(rop)} units**, its safety stock is **${commas(S)} units** and the supplier delivers **${L} days** after an order. Daily usage is steady but not stated. The count on **${today}** is **${commas(stock)} units**. ${conv}`,
      parts, ex, "op-stockback", { L, S, rop, stock, X, e, today: { y, mo, da } }, [["_rop", rop], ["_safety", S], ["_lead", L], ["_stock", stock]],
      ["The reorder point covers the lead-time usage plus the safety stock, so work out the usage first.", "Days of cover = safety stock ÷ daily usage."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "route-timing") return genRoute(rng, difficulty);
  if (subtopic === "load-planning") return genLoad(rng, difficulty);
  if (subtopic === "staffing-plan") return genStaff(rng, difficulty);
  if (subtopic === "stock-reorder") return genStock(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (minute counting from the
// distance, direct unit capacities, day counting with real dates). A number must be within its
// tolerance of the true value; a choice must match exactly.

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
const dayKey = (s) => String(s).toLowerCase().replace(/,/g, " ").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ").trim();
// Check side: the platform Date in UTC, not the library arithmetic.
const utcDate = (y, m, d, k) => { const t = new Date(Date.UTC(y, m - 1, d + k)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const dayOf = (t, k) => dayKey(fmtDay(utcDate(t.y, t.mo, t.da, k)));

const ALT = {
  "op-route": (p) => {
    const m = Math.round((p.dist / p.v) * 60);
    const total = p.tier === "medium" ? m : m + 15 * Math.floor(m / 120);
    const arr = ((p.dep + total + (p.ob - p.oa) * 60) % 1440 + 1440) % 1440;
    return { drive: m, total, arr: arr, ok: YN(arr <= p.deadline) };
  },
  "op-routeback": (p) => {
    const m = Math.round((p.dist / p.v) * 60);
    const total = m + 15 * Math.floor(m / 120);
    const latest = p.DL - (p.ob - p.oa) * 60 - total;
    return { drive: m, total, latest, verdict: `${p.rd <= latest ? "On time" : "Late"} | ${m <= p.H * 60 ? "Within limit" : "Over limit"}` };
  },
  "op-load": (p) => {
    const boxes = Math.ceil(p.N / p.b);
    const trucks = Math.ceil(p.N / (p.b * p.p * p.q));
    return { boxes, pallets: Math.ceil(boxes / p.p), trucks: Math.ceil(Math.ceil(boxes / p.p) / p.q), cpu: (trucks * p.cost) / p.N };
  },
  "op-loadback": (p) => {
    const U = p.b * p.p;
    const byW = Math.floor(p.W / (U * p.g));
    const allowed = Math.min(p.q, byW);
    const trucks = Math.ceil(p.N / (U * allowed));
    return { bywt: byW, pallets: allowed, trucks, verdict: `${byW < p.q ? "Weight" : "Space"} | ${p.F >= trucks ? "Enough" : "Short"}` };
  },
  "op-staff": (p) => {
    const cap = p.r * p.h;
    const crew = Math.ceil(p.D / cap);
    const cost = crew * SHIFT_PAID * p.w;
    return { cap, crew, cost, ok: YN(cost <= p.budget) };
  },
  "op-staffback": (p) => {
    const cap = p.r * p.h;
    const weekCap = p.C * cap * p.k;
    const short = p.Dw - weekCap;
    const extra = Math.ceil(short / (cap * p.k));
    const hire = extra * SHIFT_PAID * p.k * p.w;
    const ot = (short / p.r) * p.w * p.m;
    const sav = (Math.abs(hire - ot) / Math.max(hire, ot)) * 100;
    return { capwk: weekCap, short, extra, verdict: `${hire < ot ? "Hire" : "Overtime"} | ${sav < 10 ? "Under 10%" : "10% or more"}` };
  },
  "op-stock": (p) => {
    const rop = p.u * p.L + p.S;
    const days = Math.round((p.stock - (p.u * p.L + p.S)) / p.u);
    return { rop, days, when: dayOf(p.today, days), ok: YN(p.S >= p.u * p.e) };
  },
  "op-stockback": (p) => {
    const u = (p.rop - p.S) / p.L;
    const days = (p.stock - p.rop) / u;
    return { usage: u, days, when: dayOf(p.today, days), verdict: `${p.S >= u * p.X ? "Met" : "Not met"} | ${p.S >= u * p.e ? "Covered" : "Exposed"}` };
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
    if (tv === undefined) return false;
    if (part.answerType === "number") {
      const dp = part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2));
      if (!near(partNum(answer, part.id), tv, tolOf(dp))) return false;
    } else if (part.answerType === "date") {
      if (dayKey(partStr(answer, part.id)) !== tv) return false;
    } else if (part.answerType === "text") {
      if (timeMins(partStr(answer, part.id)) !== tv) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
