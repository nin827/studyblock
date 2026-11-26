// Event Planner role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (a rounded earlier answer would not change a later one), no answer sits on
// a rounding half-step, and yes/no or pick parts are decided first and then fitted with a clear margin.
// All figures are made up, money is a generic $, and every rule (table areas, buffers, overruns, minimums,
// loading times, round trips) is an exercise rule stated in each prompt, not a venue's or operator's terms.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   seating      tables (round up) + empty seats; floor area and does the room fit; head table and room capacity;
//                expert-plus: 10-tops then 8-tops, dance floor per guest, fits
//   run-of-show  total minutes + end time (HH:MM); latest start for a curfew; doors/set-up and a pack-down verdict;
//                expert-plus: speeches overrun by 10%, actual end, minutes to cut
//   event-budget total cost + break-even ticket price (round up); contingency; sponsorship covering a %;
//                expert-plus: two catering quotes (one with a minimum charge), cheaper, ticket price
//   transport    coaches (round up) + empty seats; shuttle round trip, trips, last arrival; several buses;
//                expert-plus: buses needed to land everyone by a deadline, hire cost

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-6;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-event-planner: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const m0 = (n) => `$${commas(n)}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
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
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, [a, b]), hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
// A room size (W x L, whole metres) whose floor area is clearly above (fit) or below (no fit) `need`.
function roomFor(rng, need, wantFit) {
  const factor = wantFit ? 1.1 + rng.next() * 0.45 : 0.6 + rng.next() * 0.28;
  const W = rng.int(10, 30), L = Math.round((need * factor) / W);
  if (L < 8 || L > 45) return null;
  const room = W * L, ratio = need / room;
  if (Math.abs(ratio - 1) < 0.06 || room < 80) return null;
  return { W, L, room };
}

// ---------- seating ----------

const OCC = ["wedding reception", "charity dinner", "awards evening", "company dinner", "retirement party", "alumni gala"];
const seatRule = "Every round table is counted in full, even if it is not full of guests.";

function genSeating(rng, tier) {
  const wantFit = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const occ = rng.pick(OCC);
    if (tier === "expert-plus") {
      const G = 2 * rng.int(25, 100), rem = G % 10;
      if (rem === 0) continue;
      const t10 = (G - rem) / 10, t8 = Math.ceil(rem / 8);
      const A10 = rng.pick([12, 13, 14]), A8 = rng.pick([9, 10, 11]), dpg = rng.pick([0.5, 1, 1.5]);
      if (t10 < 3) continue;
      const D = G * dpg, need = t10 * A10 + t8 * A8 + D;
      if (!isEx(need, 1)) continue;
      const r = roomFor(rng, need, wantFit);
      if (!r) continue;
      const fits = need <= r.room;
      if (fits !== wantFit) continue;
      const parts = [
        numPart("t10", "Tables of 10", "Tables of 10 used", t10, 0, "Fill as many whole tables of 10 as the guest count allows."),
        numPart("t8", "Tables of 8", "Tables of 8 needed for the remaining guests (round up)", t8, 0, "The guests left over after the tables of 10 go on tables of 8; a part-table still counts as one."),
        numPart("need", "Floor area", "Total floor area needed (m²)", need, 1, "Each table of 10 and of 8 has its own area; the dance floor is its area per guest times the guest count. Add them all."),
        yesNo("fits", "Fits the room?", `Does the layout fit in the room (**${r.W} m × ${r.L} m**)?`, fits, "Compare the floor area needed with the room's floor area, width times length."),
      ];
      const ex = `**Tables of 10:** ${G} ÷ 10 = ${t10} full tables, leaving ${rem} guests: **${t10}**.\n\n**Tables of 8:** ${rem} ÷ 8 = ${f(roundTo(rem / 8, 2))}, up to **${t8}**.\n\n**Floor area:** ${t10} × ${A10} + ${t8} × ${A8} + dance floor ${G} × ${f(dpg)} = ${f(t10 * A10)} + ${f(t8 * A8)} + ${f(D)} = **${f(need)} m²**.\n\n**Room:** ${r.W} × ${r.L} = ${r.room} m², so the layout ${fits ? "fits" : "does not fit"}: **${YN(fits)}**.`;
      return finish(`A **${occ}** has **${G} guests**. Fill as many **tables of 10** as possible; the guests left over sit at **tables of 8**. ${seatRule} A table of 10 needs **${A10} m²** of floor (chairs and walkways included) and a table of 8 needs **${A8} m²**. The dance floor needs **${f(dpg)} m² per guest** for all ${G} guests. The room is **${r.W} m by ${r.L} m**.`,
        parts, ex, "ep-st4", { tier, G, A10, A8, dpg, W: r.W, L: r.L }, [["_guests", G], ["_area10", A10], ["_area8", A8], ["_dance", dpg], ["_width", r.W], ["_length", r.L]],
        ["Tables of 10 first, then what is left over.", "Add the table areas and the dance floor, then compare with width times length."]);
    }
    const s = rng.pick([8, 10]);
    const A = s === 8 ? rng.pick([9, 10, 11]) : rng.pick([12, 13, 14]);
    if (tier === "medium") {
      const G = rng.int(40, 220);
      if (!fracOk(G / s)) continue;
      const n = Math.ceil(G / s), empty = n * s - G;
      const parts = [
        numPart("tables", "Tables", `Round tables of ${s} needed (round up)`, n, 0, "Guests divided by seats per table, rounded up: a part-table is still a table."),
        numPart("empty", "Empty seats", "Empty seats left in the room", empty, 0, "Seats at all the tables minus the guests."),
      ];
      return finish(`A **${occ}** has **${G} guests**, seated at **round tables of ${s}**. ${seatRule}`, parts,
        `**Tables:** ${G} ÷ ${s} = ${f(roundTo(G / s, 2))}, up to **${n}**.\n\n**Empty seats:** ${n} × ${s} − ${G} = ${n * s} − ${G} = **${empty}**.`,
        "ep-st1", { tier, G, s }, [["_guests", G], ["_seats", s]],
        ["Whole tables only: round the division up.", "Seats available, minus the guests who sit."]);
    }
    if (tier === "hard") {
      const G = rng.int(60, 240);
      if (!fracOk(G / s)) continue;
      const n = Math.ceil(G / s), need = n * A;
      const r = roomFor(rng, need, wantFit);
      if (!r) continue;
      const fits = need <= r.room;
      if (fits !== wantFit) continue;
      const parts = [
        numPart("tables", "Tables", `Round tables of ${s} needed (round up)`, n, 0, "Guests divided by seats per table, rounded up."),
        numPart("need", "Floor area", "Floor area the tables need (m²)", need, 0, "Number of tables times the area one table needs."),
        yesNo("fits", "Fits the room?", `Do the tables fit in the room (**${r.W} m × ${r.L} m**)?`, fits, "Compare the area needed with the room's floor area, width times length."),
      ];
      return finish(`A **${occ}** has **${G} guests** at **round tables of ${s}**. ${seatRule} Each table needs **${A} m²** of floor, chairs and walkways included. The room is **${r.W} m by ${r.L} m**.`,
        parts, `**Tables:** ${G} ÷ ${s} = ${f(roundTo(G / s, 2))}, up to **${n}**.\n\n**Floor area:** ${n} × ${A} = **${need} m²**.\n\n**Room:** ${r.W} × ${r.L} = ${r.room} m², so the tables ${fits ? "fit" : "do not fit"}: **${YN(fits)}**.`,
        "ep-st2", { tier, G, s, A, W: r.W, L: r.L }, [["_guests", G], ["_seats", s], ["_area", A], ["_width", r.W], ["_length", r.L]],
        ["Tables first, then the area they take.", "The room's area is width times length."]);
    }
    // expert: a head table plus round tables
    const h = rng.pick([8, 10, 12]), H = rng.pick([14, 16, 18, 20]), G = rng.int(60, 200);
    const rest = G - h;
    if (!fracOk(rest / s)) continue;
    const n = Math.ceil(rest / s), need = n * A + H;
    const r = roomFor(rng, need, wantFit);
    if (!r) continue;
    const mFit = Math.floor((r.room - H) / A);
    if (!fracOk((r.room - H) / A)) continue;
    const capac = mFit * s + h, fits = n <= mFit;
    if (fits !== wantFit || fits !== need <= r.room) continue;
    const parts = [
      numPart("tables", "Round tables", `Round tables of ${s} for the other guests (round up)`, n, 0, "Take the head table's guests off first, then divide by seats per table and round up."),
      numPart("need", "Floor area", "Total floor area needed, head table included (m²)", need, 0, "Round tables times their area, plus the head table's own area."),
      numPart("cap", "Room capacity", "Most guests the room could seat in this style, head table included", capac, 0, "Take the head table's area off the room first, see how many whole round tables fit in what is left, then count their seats plus the head table's."),
      yesNo("fits", "Fits the room?", `Can all **${G} guests** be seated in this room?`, fits, "Compare the guests with what the room can seat."),
    ];
    const ex = `**Round tables:** ${G} − ${h} = ${rest} guests, ${rest} ÷ ${s} = ${f(roundTo(rest / s, 2))}, up to **${n}**.\n\n**Floor area:** ${n} × ${A} + ${H} = **${need} m²**.\n\n**Capacity:** room ${r.W} × ${r.L} = ${r.room} m²; (${r.room} − ${H}) ÷ ${A} = ${f(roundTo((r.room - H) / A, 2))}, so ${mFit} whole round tables; ${mFit} × ${s} + ${h} = **${capac}** guests.\n\n**Verdict:** ${G} guests against a capacity of ${capac}: **${YN(fits)}**.`;
    return finish(`A **${occ}** has **${G} guests**. **${h} guests** sit at one long **head table** that needs **${H} m²**. Everyone else sits at **round tables of ${s}**, each needing **${A} m²**. ${seatRule} The room is **${r.W} m by ${r.L} m**.`,
      parts, ex, "ep-st3", { tier, G, s, A, h, H, W: r.W, L: r.L }, [["_guests", G], ["_head", h], ["_headarea", H], ["_seats", s], ["_area", A], ["_width", r.W], ["_length", r.L]],
      ["The head table's guests do not need round tables.", "For the capacity, take the head table's area off the room before fitting round tables."]);
  }
  return tooMany();
}

// ---------- run-of-show ----------

const ITEMS = ["welcome drinks", "opening speech", "dinner service", "awards presentation", "live band set", "slideshow", "cake cutting", "charity auction", "first dance", "closing toast"];
const durPick = (rng) => rng.pick([10, 15, 20, 25, 30, 40, 45, 60, 75, 90]);
const joinList = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const itemTxt = (names, durs) => joinList(names.map((n, k) => `**${n}** (${durs[k]} min)`));

function genShow(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const S = 900 + 15 * rng.int(0, 18);
    if (tier === "expert-plus") {
      const speech = rng.shuffle(["opening speech", "keynote speech", "awards presentation", "closing address"]).slice(0, 2);
      const others = rng.shuffle(ITEMS.filter((n) => !/speech|address|awards/.test(n))).slice(0, rng.int(2, 3));
      const sd = speech.map(() => rng.pick([20, 30, 40, 50, 60])), od = others.map(() => durPick(rng));
      const order = rng.shuffle([...speech.map((n, k) => [n, sd[k], true]), ...others.map((n, k) => [n, od[k], false])]);
      const b = rng.pick([5, 10, 15]), k = order.length;
      const planned = sum(order.map((x) => x[1])) + (k - 1) * b;
      const over = sum(sd) / 10, actual = planned + over;
      const cut = 5 * rng.int(1, 8);
      const end = S + actual, C = end - cut;
      if (end > 1425 || planned > 330 || end - S > 360) continue;
      const names = order.map((x) => (x[2] ? `${x[0]} (speech)` : x[0])), durs = order.map((x) => x[1]);
      const parts = [
        numPart("planned", "Planned length", "Planned length of the whole programme, buffers included (minutes)", planned, 0, "Add the planned item lengths, then one buffer for each gap between items."),
        numPart("actual", "Actual length", "Actual length once the speeches overrun (minutes)", actual, 0, "Only the items marked (speech) run over, each by 10% of its own planned length. Add those extras to the planned total."),
        timePart("end", "Actual finish", "Time the programme actually finishes", end, "Add the actual length to the start time."),
        numPart("cut", "Minutes to cut", "Minutes that must be cut so the programme finishes by the curfew", cut, 0, "How far past the curfew the actual finish is, in minutes."),
      ];
      const ex = `**Planned:** ${durs.join(" + ")} = ${sum(durs)}, plus ${k - 1} buffers of ${b} min = ${(k - 1) * b}: **${planned} min**.\n\n**Actual:** the speeches (${sd.join(" + ")} = ${sum(sd)} min) run 10% over: ${f(over)} min more, so **${actual} min**.\n\n**Finish:** ${hhmm(S)} + ${actual} min = **${hhmm(end)}**.\n\n**Cut:** ${hhmm(end)} is ${cut} min after the ${hhmm(C)} curfew, so cut **${cut} min**.`;
      return finish(`An evening programme starts at **${hhmm(S)}** and has ${k} items in this order: ${itemTxt(names, durs)}. There is a **${b}-minute buffer** between each pair of items (none before the first or after the last). Items marked **(speech)** run **10% over** their planned length; nothing else overruns, and buffers do not change. The venue curfew is **${hhmm(C)}**.`,
        parts, ex, "ep-rs4", { tier, S, durs, sp: order.map((x) => (x[2] ? 1 : 0)), b, C }, [["_start", S], ["_buffer", b], ["_curfew", C], ...durs.map((d, j) => [`_item${j + 1}`, d])],
        ["Planned time first: items plus the buffers between them.", "Find the speeches' extra minutes, then the actual finish against the curfew."]);
    }
    const k = tier === "medium" ? 3 : tier === "hard" ? 4 : 4;
    const names = rng.shuffle(ITEMS.slice()).slice(0, k), durs = names.map(() => durPick(rng));
    const b = rng.pick([5, 10, 15]);
    const total = sum(durs) + (k - 1) * b, end = S + total;
    if (end > 1400 || total > 300) continue;
    const base = `An event starts its programme at **${hhmm(S)}** with ${k} items in this order: ${itemTxt(names, durs)}. There is a **${b}-minute buffer** between each pair of items (none before the first or after the last).`;
    const given = [["_start", S], ["_buffer", b], ...durs.map((d, j) => [`_item${j + 1}`, d])];
    const exT = `**Total:** ${durs.join(" + ")} = ${sum(durs)}, plus ${k - 1} buffers of ${b} min = ${(k - 1) * b}: **${total} min**.`;
    const exE = `**Finish:** ${hhmm(S)} + ${total} min = **${hhmm(end)}**.`;
    const pT = numPart("total", "Total length", "Length of the whole programme, buffers included (minutes)", total, 0, "Add the item lengths, then one buffer for each gap between items.");
    const pE = timePart("end", "Finish time", "Time the programme finishes", end, "Add the total length to the start time.");
    if (tier === "medium") return finish(base, [pT, pE], `${exT}\n\n${exE}`, "ep-rs1", { tier, S, durs, b }, given,
      ["Items plus the gaps between them (one fewer gap than items).", "Count on from the start time."]);
    if (tier === "hard") {
      const delta = rng.pick([-45, -30, -20, 20, 30, 45, 60]), C = end + delta;
      if (C > 1425) continue;
      const latest = C - total;
      return finish(`${base} The venue has a curfew: the programme must finish by **${hhmm(C)}**.`,
        [pT, pE, timePart("latest", "Latest start", "Latest time the programme can start and still finish by the curfew", latest, "Count back from the curfew by the total length.")],
        `${exT}\n\n${exE}\n\n**Latest start:** ${hhmm(C)} − ${total} min = **${hhmm(latest)}**.`, "ep-rs2", { tier, S, durs, b, C }, [...given, ["_curfew", C]],
        ["The total comes first; it is the same for both questions.", "Latest start = curfew minus the total length."]);
    }
    // expert: doors and set-up, plus a pack-down verdict
    const L = rng.pick([30, 45, 60]), E = rng.pick([60, 90, 120, 150]), P = rng.pick([30, 45, 60]);
    const delta = (wantYes ? 1 : -1) * rng.pick([15, 20, 30, 40]);
    const C = end + P + delta, ok = end + P <= C;
    if (C > 1430 || ok !== wantYes) continue;
    const doors = S - L, setup = doors - E;
    const parts = [
      pT, pE,
      timePart("setup", "Set-up start", "Time the crew must start setting up", setup, "Doors open before the programme starts; set-up takes its own time before the doors."),
      yesNo("ok", "Out by the curfew?", `The crew needs **${P} min** to pack down after the programme ends, and the venue must be empty by **${hhmm(C)}**. Is that possible?`, ok, "Add the pack-down time to the finish time and compare with the time the venue must be empty."),
    ];
    const ex = `${exT}\n\n${exE}\n\n**Set-up:** doors open at ${hhmm(S)} − ${L} min = ${hhmm(doors)}; ${hhmm(doors)} − ${E} min = **${hhmm(setup)}**.\n\n**Pack-down:** ${hhmm(end)} + ${P} min = ${hhmm(end + P)}, ${ok ? "not after" : "after"} ${hhmm(C)}: **${YN(ok)}**.`;
    return finish(`${base} **Doors open ${L} minutes** before the programme starts, and set-up takes **${E} minutes** and ends exactly when the doors open.`,
      parts, ex, "ep-rs3", { tier, S, durs, b, L, E, P, C }, [...given, ["_doors", L], ["_setup", E]],
      ["Programme length and finish first, as before.", "Work backwards from the start for set-up, forwards from the finish for pack-down."]);
  }
  return tooMany();
}

// ---------- event-budget ----------

const EVENTS = ["charity dinner", "company conference", "school fair", "music night", "launch party", "community festival"];

function genBudget(rng, tier) {
  const wantA = rng.next() < 0.5, wantMin = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const ev = rng.pick(EVENTS);
    if (tier === "expert-plus") {
      const G = 10 * rng.int(8, 40), a = rng.int(30, 70), M = 250 * rng.int(6, 40);
      const b = rng.int(25, 70), fx = 100 * rng.int(4, 25);
      const qa = Math.max(a * G, M), qb = b * G + fx;
      if (Math.abs(qa - qb) / Math.min(qa, qb) < 0.06 || (a * G < M && Math.abs(a * G - M) / M < 0.06) || (a * G >= M && Math.abs(a * G - M) / M < 0.06)) continue;
      const aWins = qa < qb;
      if ((a * G < M) !== wantMin) continue;
      if (aWins !== wantA) continue;
      const X = 500 * rng.int(2, 12), q = rng.pick([5, 10, 15]), s = rng.pick([20, 25, 30, 40]);
      const chosen = aWins ? qa : qb, total = chosen + X, cont = (total * q) / 100, budget = total + cont, spons = (budget * s) / 100, raise = budget - spons;
      if (!isEx(budget, 2) || !isEx(spons, 2) || !isEx(raise, 2) || !fracOk(raise / G)) continue;
      const price = Math.ceil(raise / G);
      const parts = [
        numPart("qa", "Quote A", "Cost of caterer A for these guests ($)", qa, 0, "Per-head price times guests, but the caterer never charges less than its minimum."),
        numPart("qb", "Quote B", "Cost of caterer B for these guests ($)", qb, 0, "Per-head price times guests, plus the set-up fee."),
        pickPart(rng, "cheaper", "Cheaper caterer", "Which caterer is cheaper for this event?", "Caterer A", "Caterer B", aWins ? "Caterer A" : "Caterer B", "Compare the two costs you found."),
        numPart("price", "Ticket price", "Ticket price that covers the rest, using the cheaper caterer (whole dollars, round up)", price, 0, "Cheaper caterer plus other costs, then contingency on that total, then take off the sponsor's share; divide what is left by the guests and round up.", true),
      ];
      const ex = `**Caterer A:** ${a} × ${G} = ${m0(a * G)}${a * G < M ? `, below the minimum, so **${m0(M)}**` : `, above the minimum of ${m0(M)}: **${m0(qa)}**`}.\n\n**Caterer B:** ${b} × ${G} + ${fx} = **${m0(qb)}**.\n\n**Cheaper:** **Caterer ${aWins ? "A" : "B"}** (${m0(chosen)}).\n\n**Ticket:** ${m0(chosen)} + ${m0(X)} = ${m0(total)}; plus ${q}% contingency (${money(cont)}) = ${money(budget)}; sponsor covers ${s}% (${money(spons)}), leaving ${money(raise)}; ÷ ${G} = ${f(roundTo(raise / G, 3))}, up to **${m0(price)}**.`;
      return finish(`A **${ev}** for **${G} guests** compares two caterers. **Caterer A** charges **${m0(a)} per head** but has a **minimum charge of ${m0(M)}** (you pay the minimum if the per-head total is lower). **Caterer B** charges **${m0(b)} per head** plus a **${m0(fx)} set-up fee**. Other costs are **${m0(X)}**. A **${q}% contingency** is added to the cheaper caterer's cost plus the other costs. A sponsor then covers **${s}%** of that budget, and every guest pays the same ticket price for the rest.`,
        parts, ex, "ep-bd4", { tier, G, a, M, b, fx, X, q, s }, [["_guests", G], ["_a_head", a], ["_a_min", M], ["_b_head", b], ["_b_fee", fx], ["_other", X], ["_cont", q], ["_sponsor", s]],
        ["Cost each caterer for this guest count first.", "Then build the budget from the cheaper one: other costs, contingency, sponsor share, then per guest."]);
    }
    const G = 10 * rng.int(6, 40), c = rng.int(15, 90), F = 250 * rng.int(2, 24);
    const total = G * c + F;
    if (!fracOk(total / G)) continue;
    const pTotal = numPart("total", "Total cost", "Total cost of the event ($)", total, 0, "Cost per guest times guests, plus the fixed costs.");
    const base = `A **${ev}** will have **${G} guests**. Costs are **${m0(c)} per guest** (food, drink and staffing) plus **${m0(F)}** of fixed costs (venue, sound and decoration).`;
    const given = [["_guests", G], ["_perhead", c], ["_fixed", F]];
    const exT = `**Total cost:** ${G} × ${c} + ${F} = ${commas(G * c)} + ${commas(F)} = **${m0(total)}**.`;
    if (tier === "medium") {
      const price = Math.ceil(total / G);
      return finish(`${base} Every guest buys one ticket, all at the same price.`,
        [pTotal, numPart("price", "Break-even ticket", "Lowest whole-dollar ticket price that covers the cost (round up)", price, 0, "Total cost divided by the guests, rounded up to a whole dollar.", true)],
        `${exT}\n\n**Ticket:** ${m0(total)} ÷ ${G} = ${f(roundTo(total / G, 3))}, up to **${m0(price)}**.`, "ep-bd1", { tier, G, c, F }, given,
        ["Costs first: per guest for everybody, then the fixed part.", "Divide by the number of tickets and round up to a whole dollar."]);
    }
    const q = rng.pick([5, 10, 15, 20]), cont = (total * q) / 100, budget = total + cont;
    if (!isEx(cont, 2)) continue;
    if (tier === "hard") {
      if (!fracOk(budget / G)) continue;
      const price = Math.ceil(budget / G);
      return finish(`${base} A **${q}% contingency** is added to the total cost, and every guest buys one ticket at the same price.`,
        [pTotal, numPart("cont", "Contingency", "Contingency amount ($)", cont, 2, "The contingency percentage of the total cost."),
          numPart("price", "Break-even ticket", "Lowest whole-dollar ticket price that covers cost plus contingency (round up)", price, 0, "Total plus contingency, divided by the guests, rounded up.", true)],
        `${exT}\n\n**Contingency:** ${m0(total)} × ${q}% = **${money(cont)}**.\n\n**Ticket:** (${m0(total)} + ${money(cont)}) ÷ ${G} = ${money(budget)} ÷ ${G} = ${f(roundTo(budget / G, 3))}, up to **${m0(price)}**.`,
        "ep-bd2", { tier, G, c, F, q }, [...given, ["_cont", q]],
        ["Total cost, then the contingency on that total.", "The ticket must cover both."]);
    }
    const s = rng.pick([20, 25, 30, 40, 50]), spons = (budget * s) / 100, raise = budget - spons;
    if (!isEx(spons, 2) || !isEx(raise, 2) || !fracOk(raise / G)) continue;
    const price = Math.ceil(raise / G);
    const parts = [
      numPart("budget", "Budget", "Budget including contingency ($)", budget, 2, "Total cost plus the contingency percentage of it."),
      numPart("spons", "Sponsor's share", "Amount the sponsor covers ($)", spons, 2, "The sponsor's percentage of the budget including contingency."),
      numPart("raise", "Left to raise", "Amount tickets must raise ($)", raise, 2, "Budget minus the sponsor's amount."),
      numPart("price", "Break-even ticket", "Lowest whole-dollar ticket price (round up)", price, 0, "What is left to raise, divided by the guests, rounded up.", true),
    ];
    const ex = `${exT}\n\n**Budget:** ${m0(total)} × ${q}% = ${money(cont)} contingency, so **${money(budget)}**.\n\n**Sponsor:** ${money(budget)} × ${s}% = **${money(spons)}**.\n\n**To raise:** ${money(budget)} − ${money(spons)} = **${money(raise)}**.\n\n**Ticket:** ${money(raise)} ÷ ${G} = ${f(roundTo(raise / G, 3))}, up to **${m0(price)}**.`;
    return finish(`${base} A **${q}% contingency** is added to the total cost. A sponsor covers **${s}%** of that budget (contingency included), and every guest buys one ticket at the same price for the rest.`,
      parts, ex, "ep-bd3", { tier, G, c, F, q, s }, [...given, ["_cont", q], ["_sponsor", s]],
      ["Budget first: the total cost plus its contingency.", "The sponsor takes a share of that budget; tickets cover the rest."]);
  }
  return tooMany();
}

// ---------- transport ----------

const GROUPS = ["wedding guests", "conference delegates", "festival volunteers", "gala guests", "school-trip families", "awards-night guests"];
const loopRule = (c, L, t, U) => `Each trip takes **${t} min** one way; loading takes **${L} min** before each departure and unloading **${U} min** at the venue, and the driver then returns empty in another ${t} min.`;

function genTransport(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const grp = rng.pick(GROUPS);
    if (tier === "medium") {
      const c = rng.pick([24, 32, 40, 50, 55]), G = rng.int(80, 400);
      if (!fracOk(G / c)) continue;
      const n = Math.ceil(G / c), empty = n * c - G;
      return finish(`**${G} ${grp}** must be taken to the venue by coach. Each coach has **${c} seats**, and one seat is used by one guest.`,
        [numPart("coaches", "Coaches", "Coaches to hire (round up)", n, 0, "Guests divided by seats per coach, rounded up: no part-coaches."),
          numPart("empty", "Empty seats", "Empty seats across all the coaches", empty, 0, "Seats on every coach minus the guests.")],
        `**Coaches:** ${G} ÷ ${c} = ${f(roundTo(G / c, 2))}, up to **${n}**.\n\n**Empty seats:** ${n} × ${c} − ${G} = **${empty}**.`, "ep-tr1", { tier, G, c }, [["_guests", G], ["_seats", c]],
        ["Whole coaches only: round up.", "Seats you pay for minus guests carried."]);
    }
    const t = rng.pick([10, 12, 15, 18, 20, 25]), L = rng.pick([5, 8, 10]), U = rng.pick([4, 5, 6]);
    const cyc = 2 * t + L + U, S = 960 + 15 * rng.int(0, 12);
    const loop = loopRule(0, L, t, U), cycTxt = "The bus leaves the station at the end of loading.";
    if (tier === "hard") {
      const c = rng.pick([8, 12, 16, 20]), G = rng.int(60, 200);
      if (!fracOk(G / c)) continue;
      const trips = Math.ceil(G / c), last = S + (trips - 1) * cyc + t;
      if (last > 1400) continue;
      const parts = [
        numPart("cycle", "Round trip", "Time from one departure to the next (minutes)", cyc, 0, "Drive there, unload, drive back, load: add the four times."),
        numPart("trips", "Trips", "Trips needed to carry everyone (round up)", trips, 0, "Guests divided by the minibus capacity, rounded up."),
        timePart("last", "Last arrival", "Time the last minibus arrives at the venue", last, "The last trip leaves after all the earlier round trips; add its one-way drive."),
      ];
      const ex = `**Round trip:** ${t} + ${U} + ${t} + ${L} = **${cyc} min**.\n\n**Trips:** ${G} ÷ ${c} = ${f(roundTo(G / c, 2))}, up to **${trips}**.\n\n**Last arrival:** the last trip leaves at ${hhmm(S)} + ${trips - 1} × ${cyc} = ${hhmm(S + (trips - 1) * cyc)}; plus ${t} min = **${hhmm(last)}**.`;
      return finish(`A single **${c}-seat minibus** shuttles **${G} ${grp}** from the station to the venue. ${loop} ${cycTxt} The first trip leaves at **${hhmm(S)}**.`,
        parts, ex, "ep-tr2", { tier, G, c, t, L, U, S }, [["_guests", G], ["_seats", c], ["_drive", t], ["_load", L], ["_unload", U], ["_first", S]],
        ["One cycle = drive, unload, drive back, load.", "Count the earlier round trips before the final departure."]);
    }
    if (tier === "expert") {
      const c = rng.pick([12, 16, 20, 24]), v = rng.pick([2, 3, 4]), G = rng.int(100, 320);
      const trips = Math.ceil(G / c);
      if (!fracOk(G / c) || !fracOk(trips / v)) continue;
      const per = Math.ceil(trips / v), last = S + (per - 1) * cyc + t;
      if (last > 1400) continue;
      const parts = [
        numPart("trips", "Trips", "Trips needed in all to carry everyone (round up)", trips, 0, "Guests divided by the capacity of one bus, rounded up."),
        numPart("cycle", "Round trip", "Time from one departure to the next for one bus (minutes)", cyc, 0, "Drive there, unload, drive back, load."),
        numPart("per", "Trips per bus", "Trips the busiest bus makes (round up)", per, 0, "Trips divided between the buses, rounded up."),
        timePart("last", "Last arrival", "Time the last bus arrives at the venue", last, "The busiest bus makes its last departure after all its earlier round trips; add its one-way drive."),
      ];
      const ex = `**Trips:** ${G} ÷ ${c} = ${f(roundTo(G / c, 2))}, up to **${trips}**.\n\n**Round trip:** ${t} + ${U} + ${t} + ${L} = **${cyc} min**.\n\n**Per bus:** ${trips} ÷ ${v} = ${f(roundTo(trips / v, 2))}, up to **${per}**.\n\n**Last arrival:** ${hhmm(S)} + ${per - 1} × ${cyc} + ${t} = **${hhmm(last)}**.`;
      return finish(`**${v} identical ${c}-seat buses** shuttle **${G} ${grp}** from the station to the venue. ${loop} ${cycTxt} All the buses leave together at **${hhmm(S)}** for the first trip and then run the same loop, every bus full where possible.`,
        parts, ex, "ep-tr3", { tier, G, c, v, t, L, U, S }, [["_guests", G], ["_seats", c], ["_buses", v], ["_drive", t], ["_load", L], ["_unload", U], ["_first", S]],
        ["The trips are shared between the buses.", "The busiest bus decides when the last guest arrives."]);
    }
    // expert-plus: buses needed to land everyone by a deadline, then the hire bill
    const c = rng.pick([12, 16, 20, 24]), G = rng.int(120, 360), kk = rng.int(1, 4), extra = rng.int(2, cyc - 2);
    if (extra / cyc < 0.15 || extra / cyc > 0.85) continue;
    const D = S + t + kk * cyc + extra, trips = Math.ceil(G / c), dpb = kk + 1;
    if (D > 1420 || !fracOk(G / c) || !fracOk(trips / dpb)) continue;
    const buses = Math.ceil(trips / dpb), fee = 50 * rng.int(3, 12), cost = buses * fee;
    if (buses < 2) continue;
    const parts = [
      numPart("trips", "Trips", "Trips needed in all (round up)", trips, 0, "Guests divided by the capacity of one bus, rounded up."),
      numPart("dpb", "Trips per bus", "Trips one bus can start and still arrive by the deadline", dpb, 0, "Time from the first departure to the latest departure that still arrives on time, in whole round trips, plus the first trip."),
      numPart("buses", "Buses", "Buses needed to get everyone there by the deadline (round up)", buses, 0, "Trips divided by the trips one bus can do, rounded up."),
      numPart("cost", "Hire cost", "Total hire cost ($)", cost, 0, "Buses times the hire fee for one bus."),
    ];
    const ex = `**Trips:** ${G} ÷ ${c} = ${f(roundTo(G / c, 2))}, up to **${trips}**.\n\n**Per bus:** a bus must arrive by ${hhmm(D)}, so it must leave by ${hhmm(D - t)}; departures at ${hhmm(S)} and every ${cyc} min after: ${Array.from({ length: dpb }, (_, j) => hhmm(S + j * cyc)).join(", ")} all qualify and the next (${hhmm(S + dpb * cyc)}) is too late. That is **${dpb}** trips.\n\n**Buses:** ${trips} ÷ ${dpb} = ${f(roundTo(trips / dpb, 2))}, up to **${buses}**.\n\n**Cost:** ${buses} × ${m0(fee)} = **${m0(cost)}**.`;
    return finish(`**${G} ${grp}** must all reach the venue by **${hhmm(D)}** (a bus counts as arrived when it pulls in). Buses hold **${c} guests**. ${loop} ${cycTxt} Every bus leaves the station for its first trip at **${hhmm(S)}** and then runs the same loop. Each bus hired costs **${m0(fee)}**.`,
      parts, ex, "ep-tr4", { tier, G, c, t, L, U, S, D, fee }, [["_guests", G], ["_seats", c], ["_drive", t], ["_load", L], ["_unload", U], ["_first", S], ["_deadline", D], ["_fee", fee]],
      ["Find how many trips are needed, and how many trips one bus can fit before the deadline.", "A bus's latest departure is the deadline minus the one-way drive."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "seating") return genSeating(rng, difficulty);
  if (subtopic === "run-of-show") return genShow(rng, difficulty);
  if (subtopic === "event-budget") return genBudget(rng, difficulty);
  if (subtopic === "transport") return genTransport(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (tables by adding one at a time until
// the seats cover the guests, room capacity by trying table counts, programme times by walking the items with
// a running clock, overruns per speech, budgets in cents, buses by simulating departures against the deadline).
// Numbers are compared with the rounded truth; choices and times exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

const tablesFor = (g, s) => { let n = 0, seats = 0; while (seats < g) { n++; seats += s; } return n; };
const clock = (start, items, gap) => { let t = start; items.forEach((d, k) => { t += d + (k < items.length - 1 ? gap : 0); }); return t; };
const cents = (x) => Math.round(x * 100);
const departuresBy = (S, cyc, t, D) => { let n = 0; while (S + n * cyc + t <= D) n++; return n; };

const ALT = {
  "ep-st1": (p) => { const n = tablesFor(p.G, p.s); return { tables: n, empty: n * p.s - p.G }; },
  "ep-st2": (p) => { let area = 0; for (let k = 0; k < tablesFor(p.G, p.s); k++) area += p.A; return { tables: tablesFor(p.G, p.s), need: area, fits: YN(area <= p.W * p.L) }; },
  "ep-st3": (p) => {
    const n = tablesFor(p.G - p.h, p.s), need = p.H + n * p.A;
    let m = 0; while (p.H + (m + 1) * p.A <= p.W * p.L) m++;
    return { tables: n, need, cap: m * p.s + p.h, fits: YN(p.G <= m * p.s + p.h) };
  },
  "ep-st4": (p) => {
    let left = p.G, t10 = 0; while (left >= 10) { left -= 10; t10++; }
    const t8 = tablesFor(left, 8), need = t10 * p.A10 + t8 * p.A8 + p.G * p.dpg;
    return { t10, t8, need, fits: YN(need <= p.W * p.L) };
  },
  "ep-rs1": (p) => { const e = clock(p.S, p.durs, p.b); return { total: e - p.S, end: hhmm(e) }; },
  "ep-rs2": (p) => { const e = clock(p.S, p.durs, p.b); return { total: e - p.S, end: hhmm(e), latest: hhmm(p.C - (e - p.S)) }; },
  "ep-rs3": (p) => {
    const e = clock(p.S, p.durs, p.b);
    return { total: e - p.S, end: hhmm(e), setup: hhmm(p.S - p.L - p.E), ok: YN(e + p.P <= p.C) };
  },
  "ep-rs4": (p) => {
    const planned = clock(p.S, p.durs, p.b) - p.S;
    const actual = clock(p.S, p.durs.map((d, k) => (p.sp[k] ? d * 1.1 : d)), p.b) - p.S;
    return { planned, actual, end: hhmm(Math.round(p.S + actual)), cut: Math.round(p.S + actual - p.C) };
  },
  "ep-bd1": (p) => { const tot = cents(p.G * p.c + p.F) / 100; return { total: tot, price: Math.ceil(tot / p.G - 1e-9) }; },
  "ep-bd2": (p) => {
    const tc = cents(p.G * p.c + p.F), cont = Math.round((tc * p.q) / 100);
    return { total: tc / 100, cont: cont / 100, price: Math.ceil((tc + cont) / 100 / p.G - 1e-9) };
  },
  "ep-bd3": (p) => {
    const tc = cents(p.G * p.c + p.F), bud = tc + Math.round((tc * p.q) / 100), sp = Math.round((bud * p.s) / 100), raise = bud - sp;
    return { budget: bud / 100, spons: sp / 100, raise: raise / 100, price: Math.ceil(raise / 100 / p.G - 1e-9) };
  },
  "ep-bd4": (p) => {
    let qa = 0; for (let g = 0; g < p.G; g++) qa += p.a; if (qa < p.M) qa = p.M;
    const qb = p.fx + p.G * p.b, chosen = cents(Math.min(qa, qb)) + cents(p.X);
    const bud = chosen + Math.round((chosen * p.q) / 100), raise = bud - Math.round((bud * p.s) / 100);
    return { qa, qb, cheaper: qa < qb ? "Caterer A" : "Caterer B", price: Math.ceil(raise / 100 / p.G - 1e-9) };
  },
  "ep-tr1": (p) => { const n = tablesFor(p.G, p.c); return { coaches: n, empty: n * p.c - p.G }; },
  "ep-tr2": (p) => {
    const cyc = p.t + p.U + p.t + p.L, trips = tablesFor(p.G, p.c);
    let dep = p.S; for (let k = 1; k < trips; k++) dep += cyc;
    return { cycle: cyc, trips, last: hhmm(dep + p.t) };
  },
  "ep-tr3": (p) => {
    const cyc = p.L + p.t + p.U + p.t, trips = tablesFor(p.G, p.c);
    let loads = Array(p.v).fill(0), left = trips; // trips given to buses one at a time
    while (left > 0) { loads[loads.indexOf(Math.min(...loads))]++; left--; }
    const per = Math.max(...loads);
    return { trips, cycle: cyc, per, last: hhmm(p.S + (per - 1) * cyc + p.t) };
  },
  "ep-tr4": (p) => {
    const cyc = 2 * p.t + p.L + p.U, trips = tablesFor(p.G, p.c), dpb = departuresBy(p.S, cyc, p.t, p.D);
    let b = 0, done = 0; while (done < trips) { b++; done += dpb; }
    return { trips, dpb, buses: b, cost: b * p.fee };
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
