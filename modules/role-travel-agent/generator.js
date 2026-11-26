// Travel Agent role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (a rounded earlier answer would not change a later one), no answer sits on
// a rounding half-step, and yes/no or pick parts are decided first and then fitted with a clear margin.
// All places, airlines, currencies and rates are made up, money is a generic $, and every rule (fixed UTC
// offsets with no daylight saving, minimum connection times, child fares, supplements, fees, cancellation
// bands, due dates) is an exercise rule stated in each prompt, not any airline's, operator's or law's terms.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   itinerary  local arrival time + day; two flights with a layover; minimum connection time verdict and total
//              travel time; expert-plus: three flights, two layovers, half-hour offsets, which connections hold
//   packages   flights + hotel for a family; build-your-own vs bundle; two operators with single supplements and
//              a per-head price; expert-plus: rooms, transfers, bundle promotion, saving %
//   currency   desk fee and units received; desk vs card; buy-back of leftover units; two desks' round trip loss
//   booking    commission and deposit; balance due date; cancellation band charge and refund; group booking where
//              commission is paid on what the supplier keeps

import { roundTo } from "../../js/lib/mathutil.js";
import { MONTHS, civilToDays, daysToCivil, formatDMY } from "../../js/lib/dates.js";

// ---------- helpers ----------

const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-6;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.slice(0, 8).map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-travel-agent: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const m0 = (n) => `$${commas(n)}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const pad2 = (n) => String(n).padStart(2, "0");
const mod = (a, n) => ((a % n) + n) % n;
const hhmm = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const clockOf = (abs) => hhmm(mod(abs, 1440));
const pl = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + "s"}`;
// Fraction of x to its nearest 10^-dp step is well clear of a half-step (no rounding ties).
const clearOfTie = (x, dp, m = 0.12) => { const fr = Math.abs(x * 10 ** dp) % 1; return Math.abs(fr - 0.5) > m; };
const fracOk = (r) => { const fr = r - Math.floor(r); return fr > 0.08 && fr < 0.92; };

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
function timePart(id, label, ask, abs, hint) {
  const t = clockOf(abs);
  const accepts = [];
  if (t.startsWith("0")) accepts.push(t.slice(1));
  accepts.push(t.replace(":", "."));
  return { id, label, ask: `${ask} (24-hour, HH:MM)`, answerType: "text", answer: t, accepts, fuzzy: false, hint };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, [a, b]), hint };
}
const datePart = (id, label, ask, z, hint) => ({ id, label, ask, answerType: "date", precision: "day", answer: formatDMY(daysToCivil(z)), fuzzy: false, hint });
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- itinerary ----------

const CITIES = ["Veldmoor", "Quillon", "Sarnessa", "Kovari", "Brindle Bay", "Tamarack", "Ilverna", "Dunmarrow", "Pellaton", "Zarnov", "Oskelby", "Lumaris"];
const AIRLINES = ["Skyharbor Air", "Nimbus Air", "Aurelia Airways", "Cobalt Jet"];
const OFFS = [-480, -360, -300, -240, -180, 0, 60, 120, 180, 240, 330, 420, 480, 540, 600]; // minutes from UTC
const offTxt = (m) => { const a = Math.abs(m), h = Math.floor(a / 60), mm = a % 60; return `UTC${m < 0 ? "-" : "+"}${h}${mm ? ":" + pad2(mm) : ""}`; };
const durTxt = (d) => { const h = Math.floor(d / 60), m = d % 60; return m ? `${h} h ${m} min` : `${h} h`; };
const shiftTxt = (m) => `${m < 0 ? "−" : "+"}${f(Math.abs(m) / 60)} h`;
const DAYS3 = ["Previous day", "Same day", "Next day"];
const OFFNOTE = "Each place keeps a fixed offset from UTC all year (no daylight saving).";
const CONN_NOTE = "Each onward flight is the first departure at its clock time after you land.";

function genItin(rng, tier) {
  const wantDay = rng.pick(["Same day", "Next day", "Same day", "Next day", "Previous day"]);
  const wantYes = rng.next() < 0.5, outcome = rng.int(0, 3);
  for (let i = 0; i < TRY; i++) {
    const air = rng.pick(AIRLINES);
    const legs = tier === "medium" ? 1 : tier === "expert-plus" ? 3 : 2;
    const nm = shuffled(rng, CITIES).slice(0, legs + 1);
    const o = shuffled(rng, tier === "expert-plus" ? OFFS : OFFS.filter((x) => x % 60 === 0)).slice(0, legs + 1);
    const D = 5 * rng.int(0, 287);
    const ds = Array.from({ length: legs }, () => 5 * rng.int(18, tier === "medium" ? 168 : 120));
    const dep1 = `Flight 1 leaves **${nm[0]}** at **${hhmm(D)}** local time and takes **${durTxt(ds[0])}**.`;
    const offLine = nm.map((n, k) => `**${n}** ${offTxt(o[k])}`).join(", ");
    if (tier === "medium") {
      const lt = D + ds[0] + o[1] - o[0], dayN = Math.floor(lt / 1440);
      if (dayN < -1 || dayN > 1 || DAYS3[dayN + 1] !== wantDay) continue;
      const parts = [
        timePart("arrive", "Arrival time", `Local time the flight lands in ${nm[1]}`, lt, "Add the flight time to the departure time, then add the difference between the two UTC offsets."),
        { id: "day", label: "Arrival day", ask: `On which day does it land, compared with the day it left ${nm[0]}?`, answerType: "choice", answer: wantDay, choices: shuffled(rng, DAYS3), hint: "Did the clock pass midnight going forward, or does the time shift take you back past midnight?" },
      ];
      const ex = `**Shift:** ${nm[1]} ${offTxt(o[1])} minus ${nm[0]} ${offTxt(o[0])} = **${shiftTxt(o[1] - o[0])}**.\n\n**Arrival:** ${hhmm(D)} + ${durTxt(ds[0])} = ${clockOf(D + ds[0])}${D + ds[0] >= 1440 ? " (next day)" : ""}; ${shiftTxt(o[1] - o[0])} gives local **${clockOf(lt)}**.\n\n**Day:** the local time reads ${lt < 0 ? "before midnight on the day before" : lt >= 1440 ? "after midnight, on the next day" : "on the same day"}: **${wantDay}**.`;
      return finish(`**${air}** flies from **${nm[0]}** to **${nm[1]}**. Flight 1 leaves **${nm[0]}** at **${hhmm(D)}** local time and takes **${durTxt(ds[0])}**. ${nm[0]} is **${offTxt(o[0])}** and ${nm[1]} is **${offTxt(o[1])}**. ${OFFNOTE}`,
        parts, ex, "ta-it1", { tier, D, d1: ds[0], o0: o[0], o1: o[1] }, [["_flight", ds[0]], ["_from_utc", o[0] / 60], ["_to_utc", o[1] / 60]],
        ["Local arrival = local departure + flight time + (arrival offset − departure offset).", "Past 24:00 means the next day; below 00:00 means the day before."]);
    }
    const hint1 = "Add the flight time, then the difference between the two UTC offsets.";
    if (tier === "hard" || tier === "expert") {
      const L = tier === "hard" ? 5 * rng.int(12, 48) : null;
      const M = rng.pick([45, 60, 75, 90]);
      const lay = tier === "hard" ? L : M + (wantYes ? 1 : -1) * 5 * rng.int(3, 10);
      if (lay < 35) continue;
      const aB = D + ds[0] + o[1] - o[0], dep2 = aB + lay, aC = dep2 + ds[1] + o[2] - o[1];
      const total = ds[0] + lay + ds[1];
      const ok = lay >= M;
      const base = `You fly **${air}** from **${nm[0]}** via **${nm[1]}** to **${nm[2]}**. ${dep1} Flight 2 leaves **${nm[1]}** at **${hhmm(mod(dep2, 1440))}** local time and takes **${durTxt(ds[1])}**. ${CONN_NOTE} Offsets: ${offLine}. ${OFFNOTE}`;
      const exB = `**Landing at ${nm[1]}:** ${hhmm(D)} + ${durTxt(ds[0])} = ${clockOf(D + ds[0])}; shift ${shiftTxt(o[1] - o[0])} gives **${clockOf(aB)}**.`;
      const exL = `**Layover:** from ${clockOf(aB)} to ${clockOf(dep2)} = **${lay} min**.`;
      const exC = `**Landing at ${nm[2]}:** ${clockOf(dep2)} + ${durTxt(ds[1])} = ${clockOf(dep2 + ds[1])}; shift ${shiftTxt(o[2] - o[1])} gives **${clockOf(aC)}**.`;
      const given = [["_flight1", ds[0]], ["_flight2", ds[1]], ["_utc_a", o[0] / 60], ["_utc_b", o[1] / 60], ["_utc_c", o[2] / 60]];
      const pB = timePart("arrive-b", `Landing at ${nm[1]}`, `Local time flight 1 lands in ${nm[1]}`, aB, hint1);
      const pL = numPart("layover", "Layover", `Layover at ${nm[1]} (minutes)`, lay, 0, "Count the minutes from the time flight 1 lands to the time flight 2 leaves, both in local time at the same place.");
      const pC = timePart("arrive-c", `Landing at ${nm[2]}`, `Local time flight 2 lands in ${nm[2]}`, aC, "Start from flight 2's departure, add its flight time, then the offset difference for the new place.");
      if (tier === "hard") {
        return finish(base, [pB, pL, pC], `${exB}\n\n${exL}\n\n${exC}`, "ta-it2", { tier, D, d1: ds[0], d2: ds[1], o0: o[0], o1: o[1], o2: o[2], dep2: mod(dep2, 1440) }, given,
          ["Work leg by leg: flight 1 first, then the wait, then flight 2.", "The layover uses local times at one airport, so no time shift is needed for it."]);
      }
      if (Math.abs(lay - M) < 15 || ok !== wantYes) continue;
      const parts = [
        pL,
        yesNo("allowed", "Connection allowed?", `The airport's **minimum connection time** at ${nm[1]} is **${M} minutes**; a connection is allowed only if the layover is at least that. Is this connection allowed?`, ok, "Compare your layover with the minimum connection time."),
        pC,
        numPart("total", "Total travel time", "Total travel time from take-off to final landing, layover included (minutes)", total, 0, "Both flight times plus the layover; the time shifts cancel out because elapsed time is the same everywhere."),
      ];
      const ex = `${exB}\n\n${exL}\n\n**Minimum connection:** ${lay} min against ${M} min: **${YN(ok)}**.\n\n${exC}\n\n**Total:** ${ds[0]} + ${lay} + ${ds[1]} = **${total} min**.`;
      return finish(`${base} The minimum connection time at ${nm[1]} is **${M} minutes**.`, parts, ex, "ta-it3", { tier, D, d1: ds[0], d2: ds[1], o0: o[0], o1: o[1], o2: o[2], dep2: mod(dep2, 1440), M }, [...given, ["_min_connect", M]],
        ["The layover comes first; the verdict and the total both depend on it.", "Elapsed time ignores the time zones: add the flights and the wait."]);
    }
    // expert-plus: three flights, two layovers with their own minimums
    const M1 = rng.pick([40, 50, 60, 75, 90, 120]), M2 = rng.pick([40, 50, 60, 75, 90, 120]);
    const ok1 = outcome <= 1, ok2 = outcome === 0 || outcome === 2;
    const L1 = M1 + (ok1 ? 1 : -1) * 5 * rng.int(3, 12), L2 = M2 + (ok2 ? 1 : -1) * 5 * rng.int(3, 12);
    if (L1 < 35 || L2 < 35) continue;
    const aB = D + ds[0] + o[1] - o[0], dep2 = aB + L1, aC = dep2 + ds[1] + o[2] - o[1], dep3 = aC + L2, aD = dep3 + ds[2] + o[3] - o[2];
    const ans = ok1 && ok2 ? "Both" : ok1 ? "Only the first" : ok2 ? "Only the second" : "Neither";
    const parts = [
      numPart("layover-1", `Layover at ${nm[1]}`, `Layover at ${nm[1]} (minutes)`, L1, 0, `Flight 1 lands at ${nm[1]} some time after it leaves; count to flight 2's departure in local time.`),
      numPart("layover-2", `Layover at ${nm[2]}`, `Layover at ${nm[2]} (minutes)`, L2, 0, `Find when flight 2 lands in ${nm[2]} (local time), then count to flight 3's departure.`),
      { id: "allowed", label: "Connections allowed", ask: "Which connections meet their minimum connection time?", answerType: "choice", answer: ans, choices: shuffled(rng, ["Both", "Only the first", "Only the second", "Neither"]), hint: "Check each layover against the minimum for that airport; the first connection is the one at the first stop." },
      timePart("arrive-d", `Landing at ${nm[3]}`, `Local time flight 3 lands in ${nm[3]}`, aD, "Chain the three flights; each needs its own offset difference."),
    ];
    const ex = `**Landing at ${nm[1]}:** ${hhmm(D)} + ${durTxt(ds[0])}, shift ${shiftTxt(o[1] - o[0])}: **${clockOf(aB)}**; flight 2 leaves ${clockOf(dep2)}, so the layover is **${L1} min**.\n\n**Landing at ${nm[2]}:** ${clockOf(dep2)} + ${durTxt(ds[1])}, shift ${shiftTxt(o[2] - o[1])}: **${clockOf(aC)}**; flight 3 leaves ${clockOf(dep3)}, so the layover is **${L2} min**.\n\n**Connections:** ${L1} against ${M1} (${YN(ok1)}) and ${L2} against ${M2} (${YN(ok2)}): **${ans}**.\n\n**Landing at ${nm[3]}:** ${clockOf(dep3)} + ${durTxt(ds[2])}, shift ${shiftTxt(o[3] - o[2])}: **${clockOf(aD)}**.`;
    return finish(`You fly **${air}** on four sectors, **${nm[0]}** to **${nm[1]}** to **${nm[2]}** to **${nm[3]}**. Flight 1 leaves **${nm[0]}** at **${hhmm(D)}** local time and takes **${durTxt(ds[0])}**. Flight 2 leaves **${nm[1]}** at **${hhmm(mod(dep2, 1440))}** and takes **${durTxt(ds[1])}**. Flight 3 leaves **${nm[2]}** at **${hhmm(mod(dep3, 1440))}** and takes **${durTxt(ds[2])}**. All departure times are local. ${CONN_NOTE} Offsets: ${offLine}. ${OFFNOTE} A connection is allowed only if the layover is **at least** the airport's minimum: **${M1} minutes** at ${nm[1]} and **${M2} minutes** at ${nm[2]}.`,
      parts, ex, "ta-it4", { tier, D, d: ds, o, dep2: mod(dep2, 1440), dep3: mod(dep3, 1440), M1, M2 },
      [["_flight1", ds[0]], ["_flight2", ds[1]], ["_flight3", ds[2]], ["_min_b", M1], ["_min_c", M2], ["_utc_c", o[2] / 60], ["_utc_d", o[3] / 60]],
      ["Do the flights one at a time; each layover uses local times at one airport.", "The verdict needs both layovers; the final time needs all three flights and offsets."]);
  }
  return tooMany();
}

// ---------- packages ----------

const PLACES = ["Sunmere Bay", "Port Alder", "Lake Tamsin", "Palmera Cove", "Cedar Heights", "Coral Point"];
const party = (A, C) => `${pl(A, "adult")} and ${pl(C, "child", "children")}`;
const cf = (fare, x) => (fare * x) / 100;

function genPkg(rng, tier) {
  const wantOwn = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const place = rng.pick(PLACES);
    const A = rng.int(2, 4), C = rng.int(1, 3);
    const x = rng.pick([50, 75]), fare = 20 * rng.int(8, 40);
    const flights = A * fare + C * cf(fare, x);
    if (tier === "medium") {
      const H = 50 * rng.int(8, 40);
      const parts = [
        numPart("flights", "Flights", "Total flight cost for the whole party ($)", flights, 0, "Adults pay the full fare; each child pays the stated percentage of it."),
        numPart("total", "Total price", "Total holiday price, flights plus hotel ($)", flights + H, 0, "Add the hotel cost to the flights."),
      ];
      return finish(`A family of ${party(A, C)} books a week at **${place}**. Flights cost **${m0(fare)} per adult**, and each child pays **${x}%** of the adult fare. The hotel costs **${m0(H)}** for the stay (one family room).`,
        parts, `**Flights:** ${A} × ${m0(fare)} + ${C} × ${m0(cf(fare, x))} (${x}% of ${m0(fare)}) = ${m0(A * fare)} + ${m0(C * cf(fare, x))} = **${m0(flights)}**.\n\n**Total:** ${m0(flights)} + ${m0(H)} = **${m0(flights + H)}**.`,
        "ta-pk1", { tier, A, C, fare, x, H }, [["_adults", A], ["_children", C], ["_fare", fare], ["_child_pct", x], ["_hotel", H]],
        ["Adults at the full fare, children at a percentage of it.", "The total adds the hotel on top."]);
    }
    const y = rng.pick([50, 75]);
    if (tier === "hard") {
      const H = 50 * rng.int(8, 40), t = 10 * rng.int(2, 10);
      const own = flights + H + A * t;
      const b = 20 * Math.round((own * (0.8 + rng.next() * 0.4)) / (A + (C * y) / 100) / 20);
      if (b <= 0) continue;
      const bundle = A * b + C * cf(b, y);
      if (Math.abs(own - bundle) / Math.min(own, bundle) < 0.04 || own < bundle !== wantOwn) continue;
      const parts = [
        numPart("own", "Build your own", "Total cost of booking it yourself: flights, hotel and transfers ($)", own, 0, "Flights (adults full, children at a percentage), plus the hotel, plus transfers for the adults only."),
        numPart("bundle", "Bundle", "Total price of the bundle ($)", bundle, 0, "Adults at the bundle price, children at its percentage."),
        pickPart(rng, "cheaper", "Cheaper option", "Which is cheaper for this family?", "Build your own", "Bundle", own < bundle ? "Build your own" : "Bundle", "Compare the two totals."),
      ];
      const ex = `**Build your own:** flights ${A} × ${m0(fare)} + ${C} × ${m0(cf(fare, x))} = ${m0(flights)}; plus hotel ${m0(H)}; plus transfers ${A} × ${m0(t)} = ${m0(A * t)}: **${m0(own)}**.\n\n**Bundle:** ${A} × ${m0(b)} + ${C} × ${m0(cf(b, y))} (${y}% of ${m0(b)}) = **${m0(bundle)}**.\n\n**Cheaper:** **${own < bundle ? "Build your own" : "Bundle"}**.`;
      return finish(`A family of ${party(A, C)} is choosing how to book a week at **${place}**. **Build your own:** flights cost **${m0(fare)} per adult** (each child pays **${x}%** of that), the hotel costs **${m0(H)}** for the stay, and return transfers cost **${m0(t)} per adult** (children travel free). **Bundle:** one operator sells everything at **${m0(b)} per adult**, and each child pays **${y}%** of the adult price.`,
        parts, ex, "ta-pk2", { tier, A, C, fare, x, H, t, b, y }, [["_adults", A], ["_children", C], ["_fare", fare], ["_child_pct", x], ["_hotel", H], ["_transfer", t], ["_bundle", b], ["_bundle_pct", y]],
        ["Price each option for the whole family first.", "Children never pay transfers; they do pay a share of the flight and bundle prices."]);
    }
    if (tier === "expert") {
      const s = rng.int(1, Math.min(2, A)), ss = 20 * rng.int(4, 15);
      const a = 20 * rng.int(20, 80), fee = 20 * rng.int(2, 10);
      const costX = A * a + C * cf(a, x) + s * ss;
      const b = 20 * Math.round((costX * (0.85 + rng.next() * 0.3) - fee) / (A + (C * y) / 100) / 20);
      if (b <= 0) continue;
      const costY = A * b + C * cf(b, y) + fee;
      if (Math.abs(costX - costY) / Math.min(costX, costY) < 0.04 || costX < costY !== wantOwn) continue;
      const min = Math.min(costX, costY), pp = min / (A + C);
      if (!fracOk(pp)) continue;
      const parts = [
        numPart("sunline", "Sunline total", "Total price from Sunline Tours ($)", costX, 0, "Adults and children as stated, then the single supplement for each person in a single room."),
        numPart("bluewave", "Bluewave total", "Total price from Bluewave Holidays ($)", costY, 0, "Adults and children as stated, then the one booking fee for the whole party."),
        pickPart(rng, "cheaper", "Cheaper operator", "Which operator is cheaper?", "Sunline Tours", "Bluewave Holidays", costX < costY ? "Sunline Tours" : "Bluewave Holidays", "Compare the two totals."),
        numPart("per-head", "Per person", "Cost per person (adults and children) of the cheaper operator ($, round up to a whole dollar)", Math.ceil(pp), 0, "The cheaper total divided by everyone travelling, children included, rounded up."),
      ];
      const ex = `**Sunline:** ${A} × ${m0(a)} + ${C} × ${m0(cf(a, x))} + ${s} × ${m0(ss)} supplement = **${m0(costX)}**.\n\n**Bluewave:** ${A} × ${m0(b)} + ${C} × ${m0(cf(b, y))} + ${m0(fee)} fee = **${m0(costY)}**.\n\n**Cheaper:** **${costX < costY ? "Sunline Tours" : "Bluewave Holidays"}** at ${m0(min)}.\n\n**Per person:** ${m0(min)} ÷ ${A + C} = ${f(roundTo(pp, 3))}, up to **${m0(Math.ceil(pp))}**.`;
      return finish(`A party of ${party(A, C)} wants a week at **${place}**, and **${s}** of the adults need a **single room**. **Sunline Tours** charges **${m0(a)} per adult**, each child pays **${x}%** of that, and each single room adds a **${m0(ss)} single supplement** (once per person). **Bluewave Holidays** charges **${m0(b)} per adult**, each child pays **${y}%** of that, and adds one **${m0(fee)} booking fee** for the whole party with no single supplement.`,
        parts, ex, "ta-pk3", { tier, A, C, s, ss, a, x, b, y, fee }, [["_adults", A], ["_children", C], ["_singles", s], ["_x_price", a], ["_supplement", ss], ["_y_price", b], ["_fee", fee], ["_x_pct", x]],
        ["Cost each operator for the whole party, then compare.", "For the per-person figure use everyone travelling, children too."]);
    }
    // expert-plus: build-your-own with rooms and transfers vs a bundle with a promotion
    const cap = 3, rooms = Math.ceil((A + C) / cap), h = 10 * rng.int(8, 25), n = rng.int(4, 10), t = 10 * rng.int(2, 10);
    const own = flights + rooms * h * n + A * t;
    const z = rng.pick([5, 10, 15, 20]);
    const b = 20 * Math.round((own / (1 - z / 100) * (0.8 + rng.next() * 0.4)) / (A + (C * y) / 100) / 20);
    if (b <= 0) continue;
    const b0 = A * b + C * cf(b, y), bundle = b0 - (b0 * z) / 100;
    if (!isEx(bundle, 2)) continue;
    const cheap = Math.min(own, bundle), dear = Math.max(own, bundle), sv = ((dear - cheap) / dear) * 100;
    if (sv < 4 || own < bundle !== wantOwn || !clearOfTie(sv, 1)) continue;
    const parts = [
      numPart("own", "Build your own", "Total cost of booking it yourself ($)", own, 0, "Flights, then rooms (a part-room is still a room) times the room rate times the nights, then transfers for the adults."),
      numPart("bundle", "Bundle", "Price of the bundle after the promotion ($)", bundle, 2, "Adults and children at the bundle prices, then take the promotion's percentage off the whole."),
      pickPart(rng, "cheaper", "Cheaper option", "Which is cheaper?", "Build your own", "Bundle", own < bundle ? "Build your own" : "Bundle", "Compare the two totals."),
      numPart("saving", "Saving", "Saving of the cheaper option as a percentage of the dearer one (%)", sv, 1, "The difference between the totals, divided by the dearer total, times 100."),
    ];
    const ex = `**Build your own:** flights ${m0(flights)}; rooms ${A + C} ÷ ${cap} = ${f(roundTo((A + C) / cap, 2))}, up to ${rooms}, so ${rooms} × ${m0(h)} × ${n} = ${m0(rooms * h * n)}; transfers ${A} × ${m0(t)} = ${m0(A * t)}: **${m0(own)}**.\n\n**Bundle:** ${A} × ${m0(b)} + ${C} × ${m0(cf(b, y))} = ${m0(b0)}; less ${z}% (${money((b0 * z) / 100)}) = **${money(bundle)}**.\n\n**Cheaper:** **${own < bundle ? "Build your own" : "Bundle"}**.\n\n**Saving:** (${f(dear)} − ${f(cheap)}) ÷ ${f(dear)} × 100 = **${f(roundTo(sv, 1))}%**.`;
    return finish(`A family of ${party(A, C)} is comparing ways to book **${n} nights** at **${place}**. **Build your own:** flights cost **${m0(fare)} per adult** (each child pays **${x}%**); hotel rooms sleep **up to ${cap} people each** (children count, a part-filled room is still a room) at **${m0(h)} per room per night**; return transfers cost **${m0(t)} per adult** (children free). **Bundle:** **${m0(b)} per adult** and each child pays **${y}%**, with a **${z}% promotional discount** taken off the whole bundle price.`,
      parts, ex, "ta-pk4", { tier, A, C, cap, fare, x, h, n, t, b, y, z }, [["_adults", A], ["_children", C], ["_fare", fare], ["_room_rate", h], ["_nights", n], ["_transfer", t], ["_bundle", b], ["_promo", z]],
      ["Count whole rooms for everyone, children included.", "The saving is a percentage of the dearer option, not of the cheaper one."]);
  }
  return tooMany();
}

// ---------- currency ----------

const CURR = ["ZND", "VLM", "TRN", "KRV"];
const rt = (rc) => (rc / 100).toFixed(2); // rate given in cents of a unit

function genFx(rng, tier) {
  const wantDesk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const cur = rng.pick(CURR);
    const X = 100 * rng.int(2, 15), ra = 5 * rng.int(20, 300);
    if (tier === "medium") {
      const p = rng.pick([2, 3, 4, 5]), fee = (X * p) / 100, net = X - fee, units = (net * ra) / 100;
      const parts = [
        numPart("fee", "Fee", "Commission the desk keeps ($)", fee, 0, "The percentage of the dollars handed over."),
        numPart("units", "Units received", `${cur} received`, units, 2, "The dollars left after the fee, times the rate."),
      ];
      return finish(`A client changes **${m0(X)}** into **${cur}** at a desk offering **1 $ = ${rt(ra)} ${cur}**. The desk keeps **${p}%** of the dollars as commission, and only the rest is exchanged.`,
        parts, `**Fee:** ${m0(X)} × ${p}% = **${m0(fee)}**.\n\n**Units:** (${m0(X)} − ${m0(fee)}) × ${rt(ra)} = ${m0(net)} × ${rt(ra)} = **${f(units)} ${cur}**.`,
        "ta-fx1", { tier, X, p, ra }, [["_dollars", X], ["_pct", p], ["_rate", ra / 100]],
        ["The fee comes off before the exchange.", "Multiply the dollars that are left by the rate."]);
    }
    if (tier === "hard") {
      const c = rng.pick([5, 8, 10, 12, 15, 20]), x = rng.pick([1, 2, 3, 4, 5]);
      const rb = 5 * Math.round((ra * (0.9 + rng.next() * 0.22)) / 5);
      if (rb <= 0) continue;
      const uA = ((X - c) * ra) / 100, uB = ((X - (X * x) / 100) * rb) / 100;
      if (Math.abs(uA - uB) / Math.min(uA, uB) < 0.03 || uA > uB !== wantDesk) continue;
      const parts = [
        numPart("desk", "Desk", `${cur} from the exchange desk`, uA, 2, "Take the flat fee off the dollars, then multiply by the desk's rate."),
        numPart("card", "Card", `${cur} from the card withdrawal`, uB, 2, "Take the percentage fee off the dollars, then multiply by the card rate."),
        pickPart(rng, "better", "Better option", `Which gives more ${cur}?`, "Desk", "Card", uA > uB ? "Desk" : "Card", "Compare the two amounts."),
      ];
      const ex = `**Desk:** (${m0(X)} − ${m0(c)}) × ${rt(ra)} = ${m0(X - c)} × ${rt(ra)} = **${f(uA)} ${cur}**.\n\n**Card:** fee ${m0(X)} × ${x}% = ${m0((X * x) / 100)}; (${m0(X)} − ${m0((X * x) / 100)}) × ${rt(rb)} = **${f(uB)} ${cur}**.\n\n**Better:** **${uA > uB ? "Desk" : "Card"}**.`;
      return finish(`A traveller has **${m0(X)}** to turn into **${cur}**. The **exchange desk** offers **1 $ = ${rt(ra)} ${cur}** and charges a **flat ${m0(c)} fee**. Withdrawing with a **card** gives **1 $ = ${rt(rb)} ${cur}** and the bank charges **${x}%** of the dollar amount. In both cases the fee comes off the dollars before they are converted.`,
        parts, ex, "ta-fx2", { tier, X, c, x, ra, rb }, [["_dollars", X], ["_desk_fee", c], ["_desk_rate", ra / 100], ["_card_pct", x], ["_card_rate", rb / 100]],
        ["Work out the dollars that are converted in each case.", "Then multiply each by its own rate."]);
    }
    const c = rng.pick([5, 8, 10, 12, 15, 20]);
    const rs = 5 * Math.round((ra * (1.03 + rng.next() * 0.12)) / 5);
    const Uc = (X - c) * ra;
    if (rs <= ra) continue;
    if (tier === "expert") {
      const T = Math.floor((Uc / 100) * (0.6 + rng.next() * 0.3)), leftC = Uc - T * 100;
      if (T < 20 || leftC < Uc * 0.05 || !clearOfTie((leftC * 100) / rs, 0, 0.1)) continue;
      const backC = Math.round((leftC * 100) / rs), back = backC / 100, net = X - back;
      const parts = [
        numPart("units", "Units bought", `${cur} bought`, Uc / 100, 2, "Take the fee off the dollars, then multiply by the buying rate."),
        numPart("left", "Units left", `${cur} left after the trip`, leftC / 100, 2, "What was bought minus what was spent."),
        numPart("back", "Dollars back", "Dollars received for the leftover units ($, to the nearest cent)", back, 2, "Units left divided by the units the desk charges per dollar when buying back."),
        numPart("net", "Net cost", "Net dollars the foreign money cost the traveller ($)", net, 2, "Dollars handed over minus dollars received back (use your rounded figure)."),
      ];
      const ex = `**Bought:** (${m0(X)} − ${m0(c)}) × ${rt(ra)} = **${f(Uc / 100)} ${cur}**.\n\n**Left:** ${f(Uc / 100)} − ${T} = **${f(leftC / 100)} ${cur}**.\n\n**Back:** ${f(leftC / 100)} ÷ ${rt(rs)} = ${f(leftC / rs)}, to the cent **${money(back)}**.\n\n**Net:** ${m0(X)} − ${money(back)} = **${money(net)}**.`;
      return finish(`A traveller changes **${m0(X)}** into **${cur}** at a desk offering **1 $ = ${rt(ra)} ${cur}**, with a **flat ${m0(c)} fee** taken from the dollars first. During the trip they spend **${commas(T)} ${cur}**. At the airport the desk buys back leftover ${cur} at **${rt(rs)} ${cur} per $1** (no fee) and rounds the dollars to the nearest cent.`,
        parts, ex, "ta-fx3", { tier, X, c, ra, rs, T }, [["_dollars", X], ["_fee", c], ["_buy_rate", ra / 100], ["_spent", T], ["_sell_rate", rs / 100]],
        ["Units bought first, then the leftover after the spending.", "Buying back uses the second rate: units divided by units per dollar."]);
    }
    // expert-plus: two desks' round trip, which loses less
    const c2 = rng.pick([5, 8, 10, 12, 15, 20]), ra2 = 5 * Math.round((ra * (0.93 + rng.next() * 0.14)) / 5);
    const rs2 = 5 * Math.round((ra2 * (1.03 + rng.next() * 0.12)) / 5);
    if (ra2 <= 0 || rs2 <= ra2) continue;
    const Uc2 = (X - c2) * ra2;
    const t1 = (Uc * 100) / rs, t2 = (Uc2 * 100) / rs2;
    if (!clearOfTie(t1, 0, 0.1) || !clearOfTie(t2, 0, 0.1)) continue;
    const b1 = Math.round(t1), b2 = Math.round(t2), l1 = X * 100 - b1, l2 = X * 100 - b2;
    if (l1 < 500 || l2 < 500 || Math.abs(l1 - l2) / Math.min(l1, l2) < 0.08) continue;
    if (l1 < l2 !== wantDesk) continue;
    const lc = Math.min(l1, l2), pct = lc / X;
    if (!clearOfTie(pct, 1, 0.12)) continue;
    const parts = [
      numPart("loss-a", "Desk A loss", "Dollars lost on the round trip at Desk A ($)", l1 / 100, 2, "Dollars handed over minus dollars received back, with the dollars back rounded to the cent."),
      numPart("loss-b", "Desk B loss", "Dollars lost on the round trip at Desk B ($)", l2 / 100, 2, "Same steps with Desk B's fee and rates."),
      pickPart(rng, "cheaper", "Cheaper desk", "Which desk loses less?", "Desk A", "Desk B", l1 < l2 ? "Desk A" : "Desk B", "Compare the two losses."),
      numPart("loss-pct", "Loss %", `Loss of the cheaper desk as a percentage of the ${m0(X)} (use your loss in dollars and cents)`, pct, 1, "The smaller loss divided by the dollars handed over, times 100."),
    ];
    const ex = `**Desk A:** (${m0(X)} − ${m0(c)}) × ${rt(ra)} = ${f(Uc / 100)} ${cur}; back ${f(Uc / 100)} ÷ ${rt(rs)} = ${f(roundTo(t1 / 100, 3))}, to the cent ${money(b1 / 100)}; loss **${money(l1 / 100)}**.\n\n**Desk B:** (${m0(X)} − ${m0(c2)}) × ${rt(ra2)} = ${f(Uc2 / 100)} ${cur}; back ${f(Uc2 / 100)} ÷ ${rt(rs2)} = ${f(roundTo(t2 / 100, 3))}, to the cent ${money(b2 / 100)}; loss **${money(l2 / 100)}**.\n\n**Cheaper:** **${l1 < l2 ? "Desk A" : "Desk B"}**.\n\n**Loss %:** ${money(lc / 100)} ÷ ${m0(X)} × 100 = **${f(roundTo(pct, 1))}%**.`;
    return finish(`A traveller changes **${m0(X)}** into **${cur}** and, unspent, changes it all back straight away. **Desk A:** flat **${m0(c)} fee** on the dollars, buys **${cur}** at **1 $ = ${rt(ra)} ${cur}** and buys them back at **${rt(rs)} ${cur} per $1**. **Desk B:** flat **${m0(c2)} fee**, **1 $ = ${rt(ra2)} ${cur}** and buy-back at **${rt(rs2)} ${cur} per $1**. Fees come off the dollars before they are converted; there is no fee on the way back, and dollars received are rounded to the nearest cent.`,
      parts, ex, "ta-fx4", { tier, X, c, ra, rs, c2, ra2, rs2 }, [["_dollars", X], ["_a_fee", c], ["_a_buy", ra / 100], ["_a_sell", rs / 100], ["_b_fee", c2], ["_b_buy", ra2 / 100], ["_b_sell", rs2 / 100]],
      ["Do one desk at a time: exchange, then buy back.", "The loss is what you handed over minus what you got back."]);
  }
  return tooMany();
}

// ---------- booking ----------

const BANDS3 = [[30, 25], [14, 50], [7, 75], [0, 100]];
const BANDS4 = [[35, 20], [21, 40], [10, 60], [0, 100]];
const RANGES3 = (B) => [[32, B - 1], [16, 27], [9, 11], [2, 4]];
const RANGES4 = (B) => [[37, B - 1], [23, 32], [12, 18], [2, 7]];
const bandsTxt = (bands) => bands.map(([lo, pct], k) => (k === 0 ? `**${lo} or more days** before departure: ${pct}%` : k === bands.length - 1 ? `**fewer than ${bands[k - 1][1 - 1]} days**: ${pct}%` : `**${lo} to ${bands[k - 1][0] - 1} days**: ${pct}%`)).join("; ");
const pctFor = (days, bands) => bands.find(([lo]) => days >= lo)[1];
const dayTxt = (z) => formatDMY(daysToCivil(z));

function genBooking(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const place = rng.pick(PLACES);
    const n = rng.int(2, 8), P = 50 * rng.int(6, 50), total = n * P;
    const c = rng.pick([8, 10, 12, 15]), d = rng.pick([10, 20, 25, 30]);
    if (tier === "medium") {
      const parts = [
        numPart("commission", "Commission", "Agent's commission on the booking ($)", (total * c) / 100, 2, "The commission percentage of the whole booking."),
        numPart("deposit", "Deposit", "Deposit due at booking ($)", (total * d) / 100, 2, "The deposit percentage of the whole booking."),
      ];
      return finish(`A tour to **${place}** costs **${m0(P)} per person** and ${pl(n, "traveller")} book it together. The agency earns **${c}%** commission on the booking total, and the traveller group pays a **${d}%** deposit when booking.`,
        parts, `**Booking total:** ${n} × ${m0(P)} = ${m0(total)}.\n\n**Commission:** ${m0(total)} × ${c}% = **${money((total * c) / 100)}**.\n\n**Deposit:** ${m0(total)} × ${d}% = **${money((total * d) / 100)}**.`,
        "ta-bk1", { tier, n, P, c, d }, [["_travellers", n], ["_price", P], ["_comm_pct", c], ["_dep_pct", d]],
        ["Find the booking total first.", "Both answers are a percentage of that same total."]);
    }
    const y = 2027, mo = rng.int(3, 12), da = rng.int(1, 28), zd = civilToDays(y, mo, da);
    const B = rng.pick([42, 56, 60]);
    if (tier === "hard") {
      const parts = [
        numPart("deposit", "Deposit", "Deposit paid at booking ($)", (total * d) / 100, 2, "The deposit percentage of the booking total."),
        numPart("balance", "Balance", "Balance still to pay ($)", total - (total * d) / 100, 2, "The total minus the deposit already paid."),
        datePart("due", "Balance due date", "On what date is the balance due?", zd - B, "Count back from the departure date by the stated number of days."),
      ];
      return finish(`${pl(n, "traveller")} book a tour to **${place}** at **${m0(P)} per person**, departing on **${formatDMY({ y, m: mo, d: da })}**. A **${d}%** deposit is paid at booking, and the balance is due **${B} days before departure**.`,
        parts, `**Booking total:** ${n} × ${m0(P)} = ${m0(total)}.\n\n**Deposit:** ${m0(total)} × ${d}% = **${money((total * d) / 100)}**.\n\n**Balance:** ${m0(total)} − ${money((total * d) / 100)} = **${money(total - (total * d) / 100)}**.\n\n**Due date:** ${B} days before ${formatDMY({ y, m: mo, d: da })} = **${dayTxt(zd - B)}**.`,
        "ta-bk2", { tier, n, P, d, B, y, mo, da }, [["_travellers", n], ["_price", P], ["_dep_pct", d], ["_days_before", B]],
        ["Deposit first, then the balance is what remains.", "Count back day by day through the months; check how many days each month has."]);
    }
    const plus = tier === "expert-plus", bands = plus ? BANDS4 : BANDS3, band = rng.int(0, 3);
    const [lo, hi] = (plus ? RANGES4 : RANGES3)(B)[band];
    if (hi < lo) continue;
    const k = rng.int(lo, hi), zc = zd - k, pct = pctFor(k, bands);
    const cd = daysToCivil(zc);
    const bt = bandsTxt(bands);
    if (!plus) {
      const charge = (total * pct) / 100, refund = total - charge;
      const parts = [
        datePart("due", "Balance due date", "On what date was the balance due?", zd - B, "Count back from the departure date by the stated number of days."),
        numPart("days", "Days before departure", "Days between the cancellation date and the departure date", k, 0, "Count the days from the cancellation date forward to departure."),
        numPart("charge", "Cancellation charge", "Cancellation charge ($)", charge, 2, "Find which band the number of days falls in, then take that percentage of the booking total."),
        numPart("refund", "Refund", "Refund to the traveller ($)", refund, 2, "The traveller paid the full price by the balance due date; refund = amount paid minus the charge."),
      ];
      const ex = `**Due date:** ${B} days before ${dayTxt(zd)} = **${dayTxt(zd - B)}**.\n\n**Days before departure:** ${dayTxt(zc)} to ${dayTxt(zd)} = **${k} days**.\n\n**Charge:** ${k} days is in the ${pct}% band: ${m0(total)} × ${pct}% = **${money(charge)}**.\n\n**Refund:** ${m0(total)} − ${money(charge)} = **${money(refund)}**.`;
      return finish(`${pl(n, "traveller")} book a tour to **${place}** at **${m0(P)} per person**, departing on **${dayTxt(zd)}**. The balance is due **${B} days before departure** and was paid in full on time. The party then cancels on **${dayTxt(zc)}**. Cancellation charges, as a percentage of the booking total, are ${bt}.`,
        parts, ex, "ta-bk3", { tier, n, P, B, y, mo, da, cy: cd.y, cm: cd.m, cd: cd.d, bands }, [["_travellers", n], ["_price", P], ["_days_before", B]],
        ["Count the days between the two dates before choosing a band.", "The charge is a percentage of the total price; the refund is what was paid minus the charge."]);
    }
    if (n < 3) continue;
    const charge = (P * pct) / 100, refund = P - charge, kept = (n - 1) * P + charge;
    const parts = [
      datePart("due", "Balance due date", "On what date is the group's balance due?", zd - B, "Count back from the departure date by the stated number of days."),
      numPart("days", "Days before departure", "Days between the cancellation date and the departure date", k, 0, "Count the days from the cancellation date forward to departure."),
      numPart("refund", "Refund", "Refund to the cancelling traveller ($)", refund, 2, "Their price minus the cancellation charge for the band the days fall in (they had already paid in full)."),
      numPart("commission", "Commission", "Agent's commission ($)", (kept * c) / 100, 2, "Commission applies to what the supplier keeps: the other travellers' prices plus the cancellation charge."),
    ];
    const ex = `**Due date:** ${B} days before ${dayTxt(zd)} = **${dayTxt(zd - B)}**.\n\n**Days:** ${dayTxt(zc)} to ${dayTxt(zd)} = **${k} days**, which is the ${pct}% band.\n\n**Refund:** charge ${m0(P)} × ${pct}% = ${money(charge)}; refund ${m0(P)} − ${money(charge)} = **${money(refund)}**.\n\n**Commission:** the supplier keeps ${n - 1} × ${m0(P)} + ${money(charge)} = ${money(kept)}; × ${c}% = **${money((kept * c) / 100)}**.`;
    return finish(`A group of **${n} travellers** book a tour to **${place}** at **${m0(P)} per person**, departing on **${dayTxt(zd)}**. The balance is due **${B} days before departure**; everyone paid in full on time. One traveller cancels on **${dayTxt(zc)}** and the other ${n - 1} still go. Cancellation charges, as a percentage of that traveller's price, are ${bt}. The agency earns **${c}%** commission, paid only on the money the supplier keeps (the remaining travellers' prices plus the cancellation charge).`,
      parts, ex, "ta-bk4", { tier, n, P, c, B, y, mo, da, cy: cd.y, cm: cd.m, cd: cd.d, bands }, [["_travellers", n], ["_price", P], ["_comm_pct", c], ["_days_before", B]],
      ["Dates first: the due date and the days to departure.", "Commission is on what the supplier keeps, not on the original booking total."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "itinerary") return genItin(rng, difficulty);
  if (subtopic === "packages") return genPkg(rng, difficulty);
  if (subtopic === "currency") return genFx(rng, difficulty);
  if (subtopic === "booking") return genBooking(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (times through the platform Date in
// UTC rather than clock arithmetic, dates by Date.UTC, money in whole cents, bands by scanning from the lowest
// threshold up, per-head prices by exact cents). Numbers are compared with the rounded truth; choices exact;
// times by minutes; dates by their text form.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const timeMins = (s) => {
  const t = String(s).trim().replace(/\s+/g, "");
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(t) || /^(\d{2})(\d{2})$/.exec(t);
  if (!m || +m[1] > 23 || +m[2] > 59) return NaN;
  return +m[1] * 60 + +m[2];
};
const dayKey = (s) => String(s).toLowerCase().replace(/,/g, " ").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ").trim();
const clk = (total) => { const t = new Date(Date.UTC(2027, 0, 15, 0, total)); return t.getUTCHours() * 60 + t.getUTCMinutes(); };
const dayShift = (total) => new Date(Date.UTC(2027, 0, 15, 0, total)).getUTCDate() - 15;
const utcDay = (y, m, d, k) => { const t = new Date(Date.UTC(y, m - 1, d + k)); return dayKey(`${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`); };
const dayGap = (y1, m1, d1, y2, m2, d2) => Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
const cents = (x) => Math.round(x * 100);
const bandPct = (days, bands) => { let r = null; for (const [lo, pct] of bands.slice().reverse()) if (days >= lo) r = pct; return r; };

// Walk a multi-flight trip in UTC: returns local clocks at each landing and the layovers (from the stated clocks).
function trip(p, o, d, deps) {
  const t0 = p.D - o[0];
  let u = t0 + d[0];
  const land = [clk(u + o[1])], lay = [];
  for (let k = 1; k < d.length; k++) {
    const l = mod(deps[k - 1] - land[k - 1], 1440);
    lay.push(l);
    u += l + d[k];
    land.push(clk(u + o[k + 1]));
  }
  return { land, lay, elapsed: u - t0 };
}
const connLabel = (a, b) => (a && b ? "Both" : a ? "Only the first" : b ? "Only the second" : "Neither");

const ALT = {
  "ta-it1": (p) => { const u = p.D - p.o0 + p.d1 + p.o1; return { arrive: clk(u), day: DAYS3[dayShift(u) + 1] }; },
  "ta-it2": (p) => { const r = trip(p, [p.o0, p.o1, p.o2], [p.d1, p.d2], [p.dep2]); return { "arrive-b": r.land[0], layover: r.lay[0], "arrive-c": r.land[1] }; },
  "ta-it3": (p) => { const r = trip(p, [p.o0, p.o1, p.o2], [p.d1, p.d2], [p.dep2]); return { layover: r.lay[0], allowed: YN(r.lay[0] >= p.M), "arrive-c": r.land[1], total: r.elapsed }; },
  "ta-it4": (p) => {
    const r = trip(p, p.o, p.d, [p.dep2, p.dep3]);
    return { "layover-1": r.lay[0], "layover-2": r.lay[1], allowed: connLabel(r.lay[0] >= p.M1, r.lay[1] >= p.M2), "arrive-d": r.land[2] };
  },
  "ta-pk1": (p) => { let fl = 0; for (let k = 0; k < p.A; k++) fl += p.fare; for (let k = 0; k < p.C; k++) fl += (p.fare * p.x) / 100; return { flights: fl, total: fl + p.H }; },
  "ta-pk2": (p) => {
    const kids = (v, q) => Array.from({ length: p.C }, () => (v * q) / 100).reduce((a, b) => a + b, 0);
    const own = p.A * (p.fare + p.t) + kids(p.fare, p.x) + p.H, bu = p.A * p.b + kids(p.b, p.y);
    return { own, bundle: bu, cheaper: own < bu ? "Build your own" : "Bundle" };
  },
  "ta-pk3": (p) => {
    const sx = cents(p.A * p.a) + cents(p.C * ((p.a * p.x) / 100)) + cents(p.s * p.ss), sy = cents(p.A * p.b) + cents(p.C * ((p.b * p.y) / 100)) + cents(p.fee);
    const min = Math.min(sx, sy);
    return { sunline: sx / 100, bluewave: sy / 100, cheaper: sx < sy ? "Sunline Tours" : "Bluewave Holidays", "per-head": Math.ceil(min / (p.A + p.C) / 100 - 1e-9) };
  },
  "ta-pk4": (p) => {
    let rooms = 0; while (rooms * p.cap < p.A + p.C) rooms++;
    const own = cents(p.A * p.fare + p.C * ((p.fare * p.x) / 100) + rooms * p.n * p.h + p.A * p.t);
    const b0 = cents(p.A * p.b + p.C * ((p.b * p.y) / 100)), bu = b0 - Math.round((b0 * p.z) / 100);
    const dear = Math.max(own, bu), cheap = Math.min(own, bu);
    return { own: own / 100, bundle: bu / 100, cheaper: own < bu ? "Build your own" : "Bundle", saving: ((dear - cheap) / dear) * 100 };
  },
  "ta-fx1": (p) => { const fee = Math.round((p.X * p.p) / 100), u = (p.X - fee) * p.ra; return { fee, units: u / 100 }; },
  "ta-fx2": (p) => {
    const uA = (p.X - p.c) * p.ra, uB = (p.X * 100 - p.X * p.x) * p.rb / 100;
    return { desk: uA / 100, card: uB / 100, better: uA > uB ? "Desk" : "Card" };
  },
  "ta-fx3": (p) => {
    const Uc = (p.X - p.c) * p.ra, leftC = Uc - p.T * 100, backC = Math.round((leftC * 100) / p.rs);
    return { units: Uc / 100, left: leftC / 100, back: backC / 100, net: (p.X * 100 - backC) / 100 };
  },
  "ta-fx4": (p) => {
    const one = (c, ra, rs) => p.X * 100 - Math.round((((p.X - c) * ra) * 100) / rs);
    const l1 = one(p.c, p.ra, p.rs), l2 = one(p.c2, p.ra2, p.rs2), lc = Math.min(l1, l2);
    return { "loss-a": l1 / 100, "loss-b": l2 / 100, cheaper: l1 < l2 ? "Desk A" : "Desk B", "loss-pct": lc / p.X };
  },
  "ta-bk1": (p) => ({ commission: cents(p.n * p.P * p.c / 100) / 100, deposit: cents(p.n * p.P * p.d / 100) / 100 }),
  "ta-bk2": (p) => {
    const tot = p.n * p.P, dep = cents((tot * p.d) / 100);
    return { deposit: dep / 100, balance: (cents(tot) - dep) / 100, due: utcDay(p.y, p.mo, p.da, -p.B) };
  },
  "ta-bk3": (p) => {
    const k = dayGap(p.cy, p.cm, p.cd, p.y, p.mo, p.da), tot = p.n * p.P, ch = cents((tot * bandPct(k, p.bands)) / 100);
    return { due: utcDay(p.y, p.mo, p.da, -p.B), days: k, charge: ch / 100, refund: (cents(tot) - ch) / 100 };
  },
  "ta-bk4": (p) => {
    const k = dayGap(p.cy, p.cm, p.cd, p.y, p.mo, p.da), ch = cents((p.P * bandPct(k, p.bands)) / 100);
    const kept = cents((p.n - 1) * p.P) + ch;
    return { due: utcDay(p.y, p.mo, p.da, -p.B), days: k, refund: (cents(p.P) - ch) / 100, commission: Math.round((kept * p.c) / 100) / 100 };
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
    if (tv === undefined || tv === null || (typeof tv === "number" && !Number.isFinite(tv))) return false;
    if (part.answerType === "number") {
      const dp = dpOf(part);
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (part.answerType === "date") {
      if (dayKey(partStr(answer, part.id)) !== tv) return false;
    } else if (part.answerType === "text") {
      if (timeMins(partStr(answer, part.id)) !== tv) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
