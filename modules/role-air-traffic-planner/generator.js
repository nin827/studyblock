// Air Traffic Planner role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact, or (where a rounded earlier answer is asked for) redrawn until working from
// the rounded value gives the same later answer. No answer sits on a rounding half-step, and verdict parts
// are decided first and then fitted, clear of the threshold. All airports, flights and figures are made up
// for arithmetic practice: speeds in knots, distances in nautical miles, one fixed local time zone, fuel in
// kg. The separation table and every rule are set for the exercise; nothing here is a real procedure.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   arrival-spacing  wake pair -> stream of arrivals (time span, last time) -> hourly capacity; expert-plus: gate spacing
//   slot-allocation  first-come delays in 15-minute slots: count, total, max, last, average; expert-plus: a closure
//   in-trail         closing speed -> time to minimum -> speed cap; expert-plus: time gap at a fix
//   holding-fuel     laps and fuel in the hold -> land or divert; expert-plus: diversion fuel and laps affordable

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-7;
const fracOk = (x, m = 0.12) => { const fr = x - Math.floor(x + 1e-9); return fr > m && fr < 1 - m; };
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-air-traffic-planner: no suitable draw"); };
const YN = (b) => (b ? "Yes" : "No");
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };

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
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

const NOTE = "Speeds are in knots (kt) and distances in nautical miles (nm). The airports, flights and figures are made up, and the rules below are set for this exercise only.";

// Minimum separation on final approach in nm, leader category then follower category (made up).
const CATS = ["Heavy", "Medium", "Light"];
const SEP = { Heavy: { Heavy: 4, Medium: 5, Light: 6 }, Medium: { Heavy: 3, Medium: 3, Light: 5 }, Light: { Heavy: 3, Medium: 3, Light: 3 } };
const TABLE = "Minimum separation for this exercise, by the leader's category and the follower's category (nm):\n- Heavy leader: Heavy 4, Medium 5, Light 6\n- Medium leader: Heavy 3, Medium 3, Light 5\n- Light leader: Heavy 3, Medium 3, Light 3";
const seqSeps = (cats) => cats.slice(1).map((c, i) => SEP[cats[i]][c]);
const seqText = (cats) => cats.map((c, i) => `Flight ${i + 1} (${c})`).join(", ");

// ---------- arrival-spacing ----------

function genArrival(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "expert-plus") {
      const lc = rng.pick(CATS), fc = rng.pick(CATS), sep = SEP[lc][fc];
      const vL = rng.pick([100, 120, 140, 150, 160]), r = rng.pick([0.8, 0.9, 1.1, 1.2]), vF = Math.round(vL * r);
      if (vF < 90 || vF > 170 || Math.abs(vF - vL * r) > 1e-9) continue;
      const D = rng.pick([6, 8, 10, 12]);
      if (D <= sep) continue;
      const x = sep + D * (vF / vL - 1);
      if (x < 1 || !isEx(x, 1)) continue;
      const gap = (x / vF) * 3600;
      if (nearHalf(gap, 0, 0.1)) continue;
      const G = wantOk ? Math.ceil(gap) + rng.pick([10, 15, 20, 25]) : Math.floor(gap) - rng.pick([10, 15, 20, 25]);
      if (G < 20) continue;
      const ok = G >= gap;
      const parts = [
        numPart("sep", "Separation", "Minimum separation needed at the threshold (nm)", sep, 0, "Look up the leader's category and then the follower's category in the table."),
        numPart("gate", "Spacing at the gate", "How far behind Flight 1 must Flight 2 be when Flight 1 is at the gate (nm)", x, 1, "Flight 1 flies the final leg at its speed. Where must Flight 2 be at that moment so that it is exactly the minimum separation behind when Flight 1 reaches the threshold?"),
        numPart("gap", "Time gap at the gate", "Time between Flight 1 and Flight 2 passing the gate (seconds)", gap, 0, "Flight 2 flies the gate spacing at its own speed: time = distance ÷ speed, then × 3600 for seconds.", true),
        yesNo("ok", "Enough?", `The controller releases Flight 2 so that it passes the gate **${G} s** after Flight 1. Does that meet the separation at the threshold?`, ok, "A bigger gap at the gate means more separation later. Compare the released gap with the time gap you found."),
      ];
      const ex = `**Separation:** a ${lc} leader and a ${fc} follower need **${sep} nm**.\n\n**Gate spacing:** Flight 1 takes ${D} ÷ ${vL} h to reach the threshold; in that time Flight 2 flies ${D} × ${vF} ÷ ${vL} = ${f(roundTo(D * vF / vL, 2))} nm, so it needs to start ${sep} + ${f(roundTo(D * vF / vL, 2))} − ${D} = **${f(roundTo(x, 1))} nm** behind.\n\n**Time gap:** ${f(roundTo(x, 1))} ÷ ${vF} × 3600 = **${Math.round(gap)} s**.\n\n**Enough:** ${G} s is ${ok ? "at least" : "less than"} ${Math.round(gap)} s: **${YN(ok)}**.`;
      return finish(`${NOTE}\n\n${TABLE}\n\nFlight 1 (${lc}) lands ahead of Flight 2 (${fc}). Both fly the last **${D} nm** to the runway threshold from a point called the gate, at constant speeds: Flight 1 at **${vL} kt** and Flight 2 at **${vF} kt**. The separation must be met at the moment Flight 1 crosses the threshold (Flight 2 is then the minimum distance behind, still at its speed).`,
        parts, ex, "atp-ar4", { tier, lc, fc, sep, vL, vF, D, G }, [["_VL", vL], ["_VF", vF], ["_D", D], ["_G", G]],
        ["Time Flight 1 needs from the gate to the threshold is the same time Flight 2 has to cover its own distance.", "Spacing at the gate, then the time gap, then compare."]);
    }
    const v = rng.pick([110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160]);
    if (tier === "medium") {
      const lc = rng.pick(CATS), fc = rng.pick(CATS), sep = SEP[lc][fc], gap = (sep / v) * 3600;
      if (nearHalf(gap, 0, 0.1)) continue;
      const parts = [
        numPart("sep", "Separation", "Minimum separation for this pair (nm)", sep, 0, "Find the leader's category in the table, then the follower's."),
        numPart("gap", "Time gap", "Time between the two aircraft crossing the threshold (seconds)", gap, 0, "Time = distance ÷ speed in hours; × 3600 for seconds.", true),
      ];
      const ex = `**Separation:** a ${lc} leader and a ${fc} follower need **${sep} nm**.\n\n**Time gap:** ${sep} ÷ ${v} × 3600 = **${Math.round(gap)} s**.`;
      return finish(`${NOTE}\n\n${TABLE}\n\nFlight 1 (${lc}) lands ahead of Flight 2 (${fc}). Both fly the final approach at **${v} kt** ground speed and are set up at exactly the minimum separation when Flight 1 crosses the runway threshold.`,
        parts, ex, "atp-ar1", { tier, lc, fc, v }, [["_V", v]],
        ["The table is read by the leader first.", "Both fly at the same speed, so the time gap is the separation divided by that speed."]);
    }
    const n = tier === "hard" ? 4 : 5, cats = Array.from({ length: n }, () => rng.pick(CATS));
    const seps = seqSeps(cats), total = seps.reduce((a, b) => a + b, 0), span = (total / v) * 60;
    if (nearHalf(span, 1, 0.1)) continue;
    if (tier === "hard") {
      const T0 = rng.int(72, 264) * 5;
      if (nearHalf(span, 0, 0.1) || hhmm(T0 + roundTo(span, 1)) !== hhmm(T0 + span)) continue;
      const parts = [
        numPart("total", "Total separation", "Sum of the separations between the three pairs of neighbours (nm)", total, 0, "Read each leader and follower pair from the table, one pair at a time, and add them."),
        numPart("span", "Time span", "Time from the first aircraft to the last crossing the threshold (minutes)", span, 1, "All fly at the same speed, so time = total distance ÷ speed in hours, × 60."),
        timePart("last", "Last aircraft", "Time the last aircraft crosses the threshold, to the nearest minute", T0 + span, "Add the time span to the first crossing time."),
      ];
      const ex = `**Total:** ${seps.join(" + ")} = **${total} nm**.\n\n**Span:** ${total} ÷ ${v} × 60 = **${f(roundTo(span, 1))} min**.\n\n**Last:** ${hhmm(T0)} + ${f(roundTo(span, 1))} min = **${hhmm(T0 + span)}**.`;
      return finish(`${NOTE}\n\n${TABLE}\n\nFour aircraft land one after another in this order: ${seqText(cats)}. Each follows its neighbour at exactly the minimum separation, and all fly the final approach at **${v} kt**. Flight 1 crosses the threshold at **${hhmm(T0)}**.`,
        parts, ex, "atp-ar2", { tier, cats, v, T0 }, [["_V", v]],
        ["There are three pairs: Flight 1 and 2, 2 and 3, 3 and 4.", "Total distance first, then the time it takes at the common speed, then the clock."]);
    }
    const cap = Math.floor(((n - 1) * v) / total + 1e-9);
    if (!fracOk((n - 1) * v / total) || cap < 4) continue;
    if (Math.floor((60 * (n - 1)) / roundTo(span, 1) + 1e-9) !== cap) continue;
    const N = wantOk ? cap - rng.pick([1, 2, 3]) : cap + rng.pick([1, 2, 3]);
    if (N < 3) continue;
    const ok = N <= cap;
    const parts = [
      numPart("total", "Total separation", "Sum of the separations between the four pairs of neighbours (nm)", total, 0, "Read each leader and follower pair from the table, one pair at a time, and add them."),
      numPart("span", "Time span", "Time from the first aircraft to the last crossing the threshold (minutes)", span, 1, "All fly at the same speed: time = total distance ÷ speed in hours, × 60."),
      numPart("cap", "Hourly capacity", "Arrivals the runway can land in an hour at this average gap (round down to whole arrivals)", Math.floor(60 * (n - 1) / span + 1e-9), 0, "There are four gaps in the stream. Average gap = span ÷ 4 in minutes; arrivals per hour = 60 ÷ average gap, rounded down."),
      yesNo("ok", "Enough?", `The airport expects **${N} arrivals** in the next hour, all in the same kind of mix. Can the runway handle that?`, ok, "Compare the expected arrivals with the hourly capacity."),
    ];
    const ex = `**Total:** ${seps.join(" + ")} = **${total} nm**.\n\n**Span:** ${total} ÷ ${v} × 60 = **${f(roundTo(span, 1))} min**.\n\n**Capacity:** average gap ${f(roundTo(span, 1))} ÷ ${n - 1} min, so 60 ÷ that = ${f(roundTo(60 * (n - 1) / span, 2))}, rounded down to **${cap}**.\n\n**Enough:** ${N} is ${ok ? "at most" : "more than"} ${cap}: **${YN(ok)}**.`;
    return finish(`${NOTE}\n\n${TABLE}\n\nFive aircraft land in this order: ${seqText(cats)}. Each follows its neighbour at exactly the minimum separation, and all fly the final approach at **${v} kt**. Assume the runway keeps landing aircraft at the average gap of this stream.`,
      parts, ex, "atp-ar3", { tier, cats, v, N }, [["_V", v], ["_N", N]],
      ["Four pairs this time. Add their separations first.", "Capacity comes from the average gap between landings."]);
  }
  return tooMany();
}

// ---------- slot-allocation ----------
// A slot is a 15-minute block starting on the quarter hour; flights are taken in the listed order and each gets
// the earliest slot at or after its request that has room. A flight leaves at the start of its slot.

function slotsGreedy(reqs, cap, closed) {
  const used = new Map(), out = [];
  for (const r of reqs) {
    let q = r;
    while (closed.has(q) || (used.get(q) || 0) >= cap) q++;
    used.set(q, (used.get(q) || 0) + 1);
    out.push(q);
  }
  return out;
}
const flightsText = (B, reqs) => reqs.map((q, i) => `Flight ${i + 1} at ${hhmm(B + 15 * q)}`).join(", ");

function genSlots(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const n = { medium: rng.int(5, 6), hard: rng.int(6, 7), expert: rng.int(7, 8), "expert-plus": rng.int(8, 9) }[tier];
    const cap = rng.pick([1, 2, 2, 3]), B = rng.int(24, 76) * 15;
    const reqs = [];
    let q = 0;
    for (let k = 0; k < n; k++) { q += rng.pick([0, 0, 1, 1, 2]); reqs.push(q); }
    const closed = new Set();
    let cs = 0, ck = 0;
    if (tier === "expert-plus") { cs = rng.int(1, Math.max(1, reqs[n - 1])); ck = rng.pick([1, 2]); for (let k = 0; k < ck; k++) closed.add(cs + k); }
    const asg = slotsGreedy(reqs, cap, closed), delays = asg.map((a, k) => (a - reqs[k]) * 15);
    const total = delays.reduce((a, b) => a + b, 0), max = Math.max(...delays), late = delays.filter((d) => d > 0).length;
    if (late < 2 || late === n || total < 30) continue;
    const lastT = B + 15 * Math.max(...asg);
    const rule = `A **slot** is a 15-minute block starting on the quarter hour and holds at most **${cap}** departure${cap > 1 ? "s" : ""}. A flight leaves at the start of its slot. Flights are taken in the order listed, and each gets the earliest slot at or after its requested time that still has room, so its delay is the wait in minutes.`;
    const list = `Requests: ${flightsText(B, reqs)}.`;
    const given = [["_CAP", cap], ["_N", n]];
    if (tier === "medium") {
      const parts = [
        numPart("late", "Delayed flights", "Number of flights that leave later than they asked", late, 0, "Work through the flights in order and count a slot as full once it holds the stated number."),
        numPart("total", "Total delay", "Total delay of all the flights (minutes)", total, 0, "Each flight's delay is how many slots it is pushed back × 15 minutes. Add them up."),
      ];
      const ex = `Slots given: ${asg.map((a, k) => `Flight ${k + 1} ${hhmm(B + 15 * a)}`).join(", ")}.\n\n**Delayed:** **${late}** flights. **Total delay:** ${delays.join(" + ")} = **${total} min**.`;
      return finish(`${NOTE}\n\n${rule}\n\n${list}`, parts, ex, "atp-sl1", { tier, B, cap, reqs }, given,
        ["Fill the slots in order; when one is full the next flight moves to the following slot.", "Count the flights that moved, then add the minutes of delay."]);
    }
    if (tier === "hard") {
      const parts = [
        numPart("total", "Total delay", "Total delay of all the flights (minutes)", total, 0, "Each flight's delay is how many slots it is pushed back × 15 minutes. Add them up."),
        numPart("max", "Longest delay", "The longest delay any one flight suffers (minutes)", max, 0, "Look at the delay of each flight and take the largest."),
        timePart("last", "Last departure", "Time the last flight to leave departs", lastT, "The last flight is the one in the latest slot used."),
      ];
      const ex = `Slots given: ${asg.map((a, k) => `Flight ${k + 1} ${hhmm(B + 15 * a)}`).join(", ")}.\n\n**Total:** ${delays.join(" + ")} = **${total} min**. **Longest:** **${max} min**. **Last departure:** **${hhmm(lastT)}**.`;
      return finish(`${NOTE}\n\n${rule}\n\n${list}`, parts, ex, "atp-sl2", { tier, B, cap, reqs }, given,
        ["Assign every slot first; the three answers all come from that list.", "Delay = (slot given − slot requested) in minutes."]);
    }
    if (tier === "expert") {
      const avg = total / n;
      if (nearHalf(avg, 1, 0.1)) continue;
      const L = wantOk ? Math.ceil(avg + 0.5) : Math.floor(avg - 0.5);
      if (L < 3) continue;
      const ok = avg <= L;
      const parts = [
        numPart("total", "Total delay", "Total delay of all the flights (minutes)", total, 0, "Each flight's delay is how many slots it is pushed back × 15 minutes. Add them up."),
        numPart("max", "Longest delay", "The longest delay any one flight suffers (minutes)", max, 0, "Look at the delay of each flight and take the largest."),
        numPart("avg", "Average delay", "Average delay per flight (minutes)", avg, 1, "Total delay ÷ number of flights."),
        yesNo("ok", "Within the limit?", `The airport's target is an average delay of **no more than ${L} minutes**. Is it met?`, ok, "Compare the average with the target."),
      ];
      const ex = `Slots given: ${asg.map((a, k) => `Flight ${k + 1} ${hhmm(B + 15 * a)}`).join(", ")}.\n\n**Total:** ${delays.join(" + ")} = **${total} min**. **Longest:** **${max} min**. **Average:** ${total} ÷ ${n} = **${f(roundTo(avg, 1))} min**.\n\n**Target:** ${f(roundTo(avg, 1))} is ${ok ? "within" : "over"} ${L}: **${YN(ok)}**.`;
      return finish(`${NOTE}\n\n${rule}\n\n${list}`, parts, ex, "atp-sl3", { tier, B, cap, reqs, L }, [...given, ["_L", L]],
        ["Assign the slots in order, then list each flight's delay.", "The average uses all the flights, including the ones with no delay."]);
    }
    // expert-plus: a closure of one or two slots; compare with the no-closure total
    const open = slotsGreedy(reqs, cap, new Set()), totalOpen = open.reduce((a, b, k) => a + (b - reqs[k]) * 15, 0);
    const saved = total - totalOpen;
    if (saved < 15) continue;
    const C = wantOk ? lastT + rng.pick([15, 30, 45]) : lastT - rng.pick([15, 30]);
    if (C < B) continue;
    const ok = lastT <= C;
    const closedText = ck === 1 ? `the slot starting at **${hhmm(B + 15 * cs)}**` : `the slots starting at **${hhmm(B + 15 * cs)}** and **${hhmm(B + 15 * (cs + 1))}**`;
    const parts = [
      numPart("total", "Total delay", "Total delay of all the flights with the closure (minutes)", total, 0, "Closed slots hold no departures, so a flight cannot use them even if it asked for them."),
      numPart("saved", "Cost of the closure", "How many more minutes of total delay the closure causes than if the runway had stayed open", saved, 0, "Do the allocation twice, once with every slot available and once with the closure. The difference of the two totals is the extra delay."),
      timePart("last", "Last departure", "Time the last flight to leave departs (with the closure)", lastT, "The last flight is the one in the latest slot used."),
      yesNo("ok", "Before the cut-off?", `No flight may leave after **${hhmm(C)}**. Does the last flight leave at or before that time?`, ok, "Compare the last departure time with the cut-off."),
    ];
    const ex = `Slots given with the closure: ${asg.map((a, k) => `Flight ${k + 1} ${hhmm(B + 15 * a)}`).join(", ")}.\n\n**Total with closure:** ${delays.join(" + ")} = **${total} min**. Without it the total is ${totalOpen} min, so the closure costs **${saved} min**.\n\n**Last departure:** **${hhmm(lastT)}**, ${ok ? "not after" : "after"} ${hhmm(C)}: **${YN(ok)}**.`;
    return finish(`${NOTE}\n\n${rule} The runway is **closed** for ${closedText}: those slots hold no departures.\n\n${list}`, parts, ex, "atp-sl4", { tier, B, cap, reqs, cs, ck, C }, [...given, ["_C", C]],
      ["Allocate once with the closed slots skipped.", "Allocate again with every slot open; the difference in total delay is what the closure costs."]);
  }
  return tooMany();
}

// ---------- in-trail ----------

function genTrail(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const vL = rng.pick([400, 420, 440, 450, 460, 480]);
    if (tier === "expert-plus") {
      const dd = rng.pick([10, 15, 20, 25, 30, 40]), vF = vL + dd, d = rng.int(8, 24) * 10, g = rng.int(3, 12) * 5, Tm = rng.int(3, 8);
      const gap = ((d + g) / vF - d / vL) * 60;
      if (gap < 1 || gap > 12 || Math.abs(gap - Tm) < 0.4 || nearHalf(gap, 1, 0.1)) continue;
      const ok = gap >= Tm;
      if (ok !== wantOk) continue;
      const need = Math.max(0, Tm - gap), vmax = (d + g) / (Tm / 60 + d / vL);
      if (!fracOk(vmax, 0.15) || nearHalf(need, 1, 0.1)) continue;
      const parts = [
        numPart("gap", "Time gap at the fix", "Time between the two aircraft reaching the fix F (minutes)", gap, 1, "Each aircraft's time to F is its distance ÷ its own speed. The gap is the difference."),
        yesNo("ok", "Gap enough?", `The required time separation at F is **${Tm} minutes**. Is the gap at least that?`, ok, "Compare your gap with the required time separation."),
        numPart("need", "Extra delay", "Extra delay the follower needs to reach F with the required gap (minutes, 0 if none is needed)", need, 1, "The shortfall is the required gap minus the gap you found; zero if the gap is already enough."),
        numPart("speed", "Speed cap", "Highest constant speed the follower may fly to F and still keep the required gap (kt, round down to whole knots)", vmax, 0, "The follower's time to F must be at least the leader's time plus the required gap. Speed = its distance ÷ that time.", true),
      ];
      parts[3].answer = Math.floor(vmax);
      const ex = `**Gap:** leader ${d} ÷ ${vL} × 60 = ${f(roundTo((d / vL) * 60, 2))} min; follower ${d + g} ÷ ${vF} × 60 = ${f(roundTo(((d + g) / vF) * 60, 2))} min; difference **${f(roundTo(gap, 1))} min**.\n\n**Enough:** ${f(roundTo(gap, 1))} is ${ok ? "at least" : "less than"} ${Tm}: **${YN(ok)}**.\n\n**Extra delay:** **${f(roundTo(need, 1))} min**.\n\n**Speed cap:** the follower needs at least ${f(roundTo((d / vL) * 60, 2))} + ${Tm} min to cover ${d + g} nm, so speed ≤ ${d + g} ÷ ${f(roundTo((d / vL) * 60 + Tm, 2))} × 60 = ${f(roundTo(vmax, 2))}, rounded down to **${Math.floor(vmax)} kt**.`;
      return finish(`${NOTE}\n\nFlight 1 and Flight 2 follow the same route towards a fix F at constant ground speeds. Flight 1 is **${d} nm** from F at **${vL} kt**; Flight 2 follows **${g} nm** behind Flight 1 at **${vF} kt**.`,
        parts, ex, "atp-it4", { tier, vL, vF, d, g, Tm }, [["_VL", vL], ["_VF", vF], ["_D", d], ["_G", g], ["_T", Tm]],
        ["Time to F for each aircraft, then subtract.", "Faster behind means the gap shrinks on the way to F."]);
    }
    const dd = rng.pick([10, 15, 20, 25, 30, 40]), vF = vL + dd, m = rng.pick([5, 8, 10]), extra = rng.int(3, 18) * 5, g = m + extra;
    const t = (extra * 60) / dd;
    if (!isEx(t, 0) || t < 6 || t > 60) continue;
    if (tier === "medium") {
      const parts = [
        numPart("closing", "Closing speed", "Speed at which the gap is closing (kt)", dd, 0, "Both fly the same way, so the gap changes at the difference of the speeds."),
        numPart("t", "Time to minimum", "Time until the gap has shrunk to the minimum (minutes)", t, 0, "Distance to lose = gap − minimum. Time = that distance ÷ closing speed, × 60 for minutes."),
      ];
      const ex = `**Closing speed:** ${vF} − ${vL} = **${dd} kt**.\n\n**Time:** (${g} − ${m}) ÷ ${dd} × 60 = **${t} min**.`;
      return finish(`${NOTE}\n\nFlight 1 flies along an airway at **${vL} kt**. Flight 2 follows **${g} nm** behind it at **${vF} kt**. Controllers need **at least ${m} nm** between them.`,
        parts, ex, "atp-it1", { tier, vL, vF, g, m }, [["_VL", vL], ["_VF", vF], ["_G", g], ["_M", m]],
        ["Is the follower catching up or falling back?", "Only the part of the gap above the minimum can be used up."]);
    }
    const T0 = rng.int(72, 264) * 5;
    if (tier === "hard") {
      const dist = (vF * t) / 60;
      if (nearHalf(dist, 1, 0.1)) continue;
      const parts = [
        numPart("t", "Time to minimum", "Time until the gap has shrunk to the minimum (minutes)", t, 0, "Closing speed is the difference of the speeds. Time = (gap − minimum) ÷ closing speed, × 60."),
        numPart("dist", "Distance flown", "Distance Flight 2 flies in that time (nm)", dist, 1, "Distance = Flight 2's speed × the time in hours."),
        timePart("when", "Time of the limit", "Clock time at which the gap reaches the minimum", T0 + t, "Add the minutes to the starting time."),
      ];
      const ex = `**Time:** (${g} − ${m}) ÷ (${vF} − ${vL}) × 60 = **${t} min**.\n\n**Distance:** ${vF} × ${t} ÷ 60 = **${f(roundTo(dist, 1))} nm**.\n\n**Clock:** ${hhmm(T0)} + ${t} min = **${hhmm(T0 + t)}**.`;
      return finish(`${NOTE}\n\nAt **${hhmm(T0)}**, Flight 1 flies along an airway at **${vL} kt** and Flight 2 follows **${g} nm** behind it at **${vF} kt**. Controllers need **at least ${m} nm** between them.`,
        parts, ex, "atp-it2", { tier, vL, vF, g, m, T0 }, [["_VL", vL], ["_VF", vF], ["_G", g], ["_M", m]],
        ["Time first; the other answers use it.", "Distance flown uses Flight 2's own speed, not the closing speed."]);
    }
    // expert
    const T = wantOk ? t - rng.int(3, 10) : t + rng.int(3, 10);
    if (T < 8) continue;
    const vmax = vL + (extra * 60) / T;
    if (!fracOk(vmax, 0.15)) continue;
    const ok = T <= t;
    const parts = [
      numPart("closing", "Closing speed", "Speed at which the gap is closing (kt)", dd, 0, "Both fly the same way, so the gap changes at the difference of the speeds."),
      numPart("t", "Time to minimum", "Time until the gap has shrunk to the minimum (minutes)", t, 0, "Time = (gap − minimum) ÷ closing speed, × 60."),
      numPart("vmax", "Speed cap", "Highest constant speed Flight 2 may fly for the next stretch and still be at least the minimum behind at its end (kt, round down to whole knots)", vmax, 0, "In that time Flight 2 may gain at most (gap − minimum) on Flight 1. What closing speed does that allow? Add Flight 1's speed.", true),
      yesNo("ok", "Hold present speed?", `Flight 1 will reach the fix **${T} minutes** from now. Can Flight 2 keep flying at **${vF} kt** until then and still be at least ${m} nm behind?`, ok, "Compare the time to the fix with the time until the gap reaches the minimum."),
    ];
    parts[2].answer = Math.floor(vmax);
    const ex = `**Closing:** ${vF} − ${vL} = **${dd} kt**. **Time:** (${g} − ${m}) ÷ ${dd} × 60 = **${t} min**.\n\n**Speed cap:** Flight 2 may gain ${extra} nm in ${T} min, a closing speed of ${extra} × 60 ÷ ${T} = ${f(roundTo((extra * 60) / T, 2))} kt, so at most ${vL} + ${f(roundTo((extra * 60) / T, 2))} = ${f(roundTo(vmax, 2))}, rounded down to **${Math.floor(vmax)} kt**.\n\n**Hold:** ${T} min is ${ok ? "within" : "longer than"} ${t} min: **${YN(ok)}**.`;
    return finish(`${NOTE}\n\nFlight 1 flies along an airway at **${vL} kt**. Flight 2 follows **${g} nm** behind it at **${vF} kt**. Controllers need **at least ${m} nm** between them. Round as each part says.`,
      parts, ex, "atp-it3", { tier, vL, vF, g, m, T }, [["_VL", vL], ["_VF", vF], ["_G", g], ["_M", m], ["_T", T]],
      ["Closing speed, then the time until the minimum is reached.", "For the speed cap, ask how much of the gap may be used up in the given time."]);
  }
  return tooMany();
}

// ---------- holding-fuel ----------

function genHold(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const L = rng.pick([3, 4, 5, 6]), rh = rng.pick([1500, 1800, 2100, 2400, 2700, 3000]), per = (rh * L) / 60;
    const A = rng.int(8, 16) * 50, Rf = rng.int(20, 36) * 50;
    const holdRule = `One lap of the holding pattern takes **${L} minutes** and the aircraft burns **${rh} kg/h** while holding. It must hold whole laps, so it leaves the hold at the end of the lap in which the delay runs out.`;
    const lapsFor = (D) => Math.ceil(D / L);
    if (tier === "medium" || tier === "hard") {
      const D = rng.int(8, 40);
      if (D % L === 0) continue;
      const laps = lapsFor(D), fuel = laps * per;
      const pLaps = numPart("laps", "Laps", "Whole laps flown in the hold (round up)", laps, 0, "Delay ÷ lap time, then round up to a whole lap.");
      const pFuel = numPart("fuel", "Holding fuel", "Fuel burned in the hold (kg)", fuel, 0, "Fuel per lap = burn rate × lap time in hours. Multiply by the laps.");
      const base = `${NOTE}\n\nFlight 1 is told to expect a delay of **${D} minutes** at the holding fix. ${holdRule}`;
      if (tier === "medium") {
        const ex = `**Laps:** ${D} ÷ ${L} = ${f(roundTo(D / L, 2))}, rounded up to **${laps}**.\n\n**Fuel:** ${rh} × ${L} ÷ 60 = ${per} kg per lap, so ${laps} × ${per} = **${fuel} kg**.`;
        return finish(base, [pLaps, pFuel], ex, "atp-hf1", { tier, L, rh, D }, [["_D", D], ["_L", L], ["_R", rh]],
          ["Work in whole laps, never part of a lap.", "Fuel in one lap first, then all the laps."]);
      }
      const need = fuel + A + Rf, F0 = wantOk ? need + rng.pick([2, 3, 4, 5, 6, 8]) * 50 : need - rng.pick([2, 3, 4, 5, 6, 8]) * 50;
      if (F0 < 1000) continue;
      const ok = F0 >= need;
      const pOk = yesNo("ok", "Land here?", `Flight 1 has **${F0} kg** of fuel when it reaches the holding fix. After the hold it needs **${A} kg** to fly the approach and land and must still have a **${Rf} kg** final reserve. Can it hold for the whole delay and then land?`, ok, "Fuel after the hold must cover the approach plus the reserve.");
      const ex = `**Laps:** ${D} ÷ ${L} rounded up = **${laps}**. **Fuel:** ${laps} × ${per} = **${fuel} kg**.\n\n**Land here:** it needs ${fuel} + ${A} + ${Rf} = ${need} kg and has ${F0} kg: **${YN(ok)}**.`;
      return finish(base, [pLaps, pFuel, pOk], ex, "atp-hf2", { tier, L, rh, D, A, Rf, F0 }, [["_D", D], ["_L", L], ["_R", rh], ["_F", F0], ["_A", A], ["_RF", Rf]],
        ["Laps first, then fuel burned in the hold.", "Add everything the aircraft still needs after the hold and compare it with the fuel it has."]);
    }
    if (tier === "expert") {
      const m = rng.int(2, 9), extraFuel = Math.round((rng.int(15, 85) / 100) * per / 10) * 10;
      if (!fracOk(extraFuel / per, 0.12)) continue;
      const F0 = A + Rf + m * per + extraFuel, spare = F0 - A - Rf;
      const laps = m + (wantOk ? -rng.pick([1, 2]) : rng.pick([1, 2]));
      if (laps < 1) continue;
      const D = (laps - 1) * L + rng.int(1, L - 1), fuel = laps * per, ok = laps <= m;
      const parts = [
        numPart("laps", "Laps", "Whole laps flown in the hold (round up)", laps, 0, "Delay ÷ lap time, then round up to a whole lap."),
        numPart("fuel", "Holding fuel", "Fuel burned in the hold (kg)", fuel, 0, "Fuel per lap = burn rate × lap time in hours. Multiply by the laps."),
        numPart("maxlaps", "Laps affordable", "Most whole laps it could hold and still have the approach fuel and final reserve (laps, round down)", m, 0, "Spare fuel = fuel on board − approach fuel − final reserve. Divide by the fuel per lap and round down.", true),
        yesNo("ok", "Land here?", "Can it hold for the whole delay and then land with the final reserve?", ok, "Compare the laps it needs with the laps it can afford."),
      ];
      const ex = `**Laps:** ${D} ÷ ${L} rounded up = **${laps}**. **Fuel:** ${laps} × ${per} = **${fuel} kg**.\n\n**Affordable:** spare = ${F0} − ${A} − ${Rf} = ${spare} kg; ${spare} ÷ ${per} = ${f(roundTo(spare / per, 2))}, rounded down to **${m}** laps.\n\n**Land here:** ${laps} laps is ${ok ? "within" : "more than"} ${m}: **${YN(ok)}**.`;
      return finish(`${NOTE}\n\nFlight 1 is told to expect a delay of **${D} minutes** at the holding fix with **${F0} kg** of fuel on board. ${holdRule} After the hold it needs **${A} kg** to fly the approach and land, and it must still have a **${Rf} kg** final reserve.`,
        parts, ex, "atp-hf3", { tier, L, rh, D, A, Rf, F0 }, [["_D", D], ["_L", L], ["_R", rh], ["_F", F0], ["_A", A], ["_RF", Rf]],
        ["Laps and fuel as before; then work out the fuel the aircraft can spare.", "Round the affordable laps down: a part-lap cannot be flown."]);
    }
    // expert-plus: diversion fuel and laps affordable
    const Dalt = rng.int(6, 20) * 10, vc = rng.pick([300, 360, 420]), rc = rng.pick([2400, 2700, 3000, 3300, 3600]);
    const div = (Dalt / vc) * rc;
    if (nearHalf(div, 0, 0.1)) continue;
    const divR = Math.round(div), m = rng.int(2, 9), extraFuel = Math.round((rng.int(15, 85) / 100) * per / 10) * 10;
    if (!fracOk(extraFuel / per, 0.12)) continue;
    const F0 = divR + Rf + m * per + extraFuel, spare = F0 - divR - Rf;
    const laps = m + (wantOk ? -rng.pick([1, 2]) : rng.pick([1, 2]));
    if (laps < 1) continue;
    const D = (laps - 1) * L + rng.int(1, L - 1), ok = laps <= m;
    const parts = [
      numPart("divfuel", "Diversion fuel", "Fuel needed to fly to the alternate airport (kg)", div, 0, "Time = distance ÷ speed in hours. Fuel = cruise burn rate × that time.", true),
      numPart("spare", "Spare fuel", "Fuel left to spend on holding once the diversion fuel and final reserve are kept back (kg)", spare, 0, "Fuel on board − diversion fuel (your whole-kg answer) − final reserve."),
      numPart("maxlaps", "Laps affordable", "Most whole laps it can hold and still be able to divert (laps, round down)", m, 0, "Spare fuel ÷ fuel per lap, rounded down. Fuel per lap = hold burn rate × lap time in hours.", true),
      yesNo("ok", "Keep holding?", `The expected delay is **${D} minutes**. Can it hold for the whole delay and still keep the option to divert with the final reserve?`, ok, "The laps needed for the delay must not exceed the laps it can afford."),
    ];
    const ex = `**Diversion:** ${Dalt} ÷ ${vc} × ${rc} = ${f(roundTo(div, 2))}, so **${divR} kg**.\n\n**Spare:** ${F0} − ${divR} − ${Rf} = **${spare} kg**.\n\n**Affordable:** ${per} kg per lap; ${spare} ÷ ${per} = ${f(roundTo(spare / per, 2))}, rounded down to **${m}** laps.\n\n**Keep holding:** ${D} min needs ${laps} laps, ${ok ? "within" : "more than"} ${m}: **${YN(ok)}**.`;
    return finish(`${NOTE}\n\nFlight 1 reaches the holding fix with **${F0} kg** of fuel. ${holdRule} The alternate airport is **${Dalt} nm** away: the aircraft would fly there at **${vc} kt** burning **${rc} kg/h**, and must still land with a **${Rf} kg** final reserve. Round as each part says.`,
      parts, ex, "atp-hf4", { tier, L, rh, D, Rf, F0, Dalt, vc, rc }, [["_F", F0], ["_L", L], ["_R", rh], ["_DA", Dalt], ["_V", vc], ["_RC", rc], ["_RF", Rf], ["_D", D]],
      ["Diversion fuel from the alternate's distance, speed and burn rate.", "What is left after the diversion and the reserve is the fuel available for holding."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "arrival-spacing") return genArrival(rng, difficulty);
  if (subtopic === "slot-allocation") return genSlots(rng, difficulty);
  if (subtopic === "in-trail") return genTrail(rng, difficulty);
  if (subtopic === "holding-fuel") return genHold(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route: arrival times by cumulative seconds, slots
// by a quarter-by-quarter queue instead of a first-fit search, separation loss by bisection on the gap, laps by
// adding lap times until the delay is covered. Numbers are compared with the rounded truth; choices and times exactly.

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

// Cumulative threshold crossing times (seconds) for a stream at one speed, built from the pairwise table.
function streamTimes(cats, v) {
  const t = [0];
  for (let k = 1; k < cats.length; k++) t.push(t[k - 1] + (SEP[cats[k - 1]][cats[k]] * 3600) / v);
  return t;
}
// Slots by a quarter-by-quarter queue: at each open quarter, waiting flights take the room in listed order.
function slotsQueue(reqs, cap, closed) {
  const out = new Array(reqs.length).fill(-1);
  let done = 0, q = Math.min(...reqs);
  while (done < reqs.length) {
    if (!closed.has(q)) {
      let room = cap;
      for (let k = 0; k < reqs.length && room > 0; k++) if (out[k] < 0 && reqs[k] <= q) { out[k] = q; room--; done++; }
    }
    q++;
  }
  return out;
}
const slotFacts = (p, closed) => {
  const asg = slotsQueue(p.reqs, p.cap, closed), dl = asg.map((a, k) => (a - p.reqs[k]) * 15);
  const total = dl.reduce((a, b) => a + b, 0);
  return { total, max: Math.max(...dl), late: dl.filter((x) => x > 0).length, avg: total / dl.length, last: p.B + 15 * Math.max(...asg) };
};
// Time (minutes) for the gap to fall from g to m, by bisection.
function gapLossTime(g, m, vL, vF) {
  let lo = 0, hi = 600;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (g - ((vF - vL) * mid) / 60 > m) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const lapsToCover = (D, L) => { let n = 0, t = 0; while (t < D - 1e-9) { t += L; n++; } return n; };

const ALT = {
  "atp-ar1": (p) => { const s = SEP[p.lc][p.fc]; return { sep: s, gap: streamTimes([p.lc, p.fc], p.v)[1] }; },
  "atp-ar2": (p) => { const t = streamTimes(p.cats, p.v), tot = seqSeps(p.cats).reduce((a, b) => a + b, 0); return { total: tot, span: t[t.length - 1] / 60, last: p.T0 + t[t.length - 1] / 60 }; },
  "atp-ar3": (p) => {
    const t = streamTimes(p.cats, p.v), tot = seqSeps(p.cats).reduce((a, b) => a + b, 0), span = t[t.length - 1], avg = span / (p.cats.length - 1);
    const cap = Math.floor(3600 / avg + 1e-9);
    return { total: tot, span: span / 60, cap, ok: YN(p.N <= cap) };
  },
  "atp-ar4": (p) => {
    const sep = SEP[leaderCat(p)][followerCat(p)];
    const tL = (p.D / p.vL) * 3600, t0 = tL - ((p.D - sep) / p.vF) * 3600;
    return { sep, gate: (t0 * p.vF) / 3600, gap: t0, ok: YN(p.G >= t0 - 1e-9) };
  },
  "atp-sl1": (p) => slotFacts(p, new Set()),
  "atp-sl2": (p) => slotFacts(p, new Set()),
  "atp-sl3": (p) => { const s = slotFacts(p, new Set()); return { ...s, ok: YN(s.avg <= p.L) }; },
  "atp-sl4": (p) => {
    const closed = new Set(Array.from({ length: p.ck }, (_, k) => p.cs + k)), s = slotFacts(p, closed), o = slotFacts(p, new Set());
    return { total: s.total, saved: s.total - o.total, last: s.last, ok: YN(s.last <= p.C) };
  },
  "atp-it1": (p) => ({ closing: p.vF - p.vL, t: gapLossTime(p.g, p.m, p.vL, p.vF) }),
  "atp-it2": (p) => { const t = gapLossTime(p.g, p.m, p.vL, p.vF); return { t, dist: (p.vF * t) / 60, when: p.T0 + t }; },
  "atp-it3": (p) => {
    const t = gapLossTime(p.g, p.m, p.vL, p.vF), allowed = (p.g - p.m) * 60 / p.T;
    return { closing: p.vF - p.vL, t, vmax: p.vL + allowed, ok: YN(p.T <= t + 1e-9) };
  },
  "atp-it4": (p) => {
    const tL = p.d / p.vL, tF = (p.d + p.g) / p.vF, gap = (tF - tL) * 60;
    let lo = 1, hi = 2000;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (((p.d + p.g) / mid - tL) * 60 >= p.Tm) lo = mid; else hi = mid; }
    return { gap, ok: YN(gap >= p.Tm), need: Math.max(0, p.Tm - gap), speed: lo };
  },
  "atp-hf1": (p) => { const n = lapsToCover(p.D, p.L); return { laps: n, fuel: p.rh * ((n * p.L) / 60) }; },
  "atp-hf2": (p) => { const n = lapsToCover(p.D, p.L), fuel = p.rh * ((n * p.L) / 60); return { laps: n, fuel, ok: YN(p.F0 - fuel >= p.A + p.Rf) }; },
  "atp-hf3": (p) => {
    const n = lapsToCover(p.D, p.L), fuel = p.rh * ((n * p.L) / 60), per = (p.rh * p.L) / 60;
    let m = 0;
    while (p.A + p.Rf + (m + 1) * per <= p.F0) m++;
    return { laps: n, fuel, maxlaps: m, ok: YN(n <= m) };
  },
  "atp-hf4": (p) => {
    const n = lapsToCover(p.D, p.L), per = (p.rh * p.L) / 60, div = Math.round((p.Dalt * p.rc) / p.vc), spare = p.F0 - div - p.Rf;
    let m = 0;
    while ((m + 1) * per <= spare) m++;
    return { divfuel: (p.Dalt * p.rc) / p.vc, spare, maxlaps: m, ok: YN(n <= m) };
  },
};
// ar4 stores the category pair only through sep, so keep it in params (see generator): helpers read it back.
const leaderCat = (p) => p.lc;
const followerCat = (p) => p.fc;

const FLOORED = { "atp-it3": ["vmax"], "atp-it4": ["speed"], "atp-hf3": [], "atp-hf4": [] };

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  const floored = FLOORED[p.kind] || [];
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined || tv === null) return false;
    if (part.answerType === "number") {
      const dp = part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2));
      let tr = floored.includes(part.id) ? Math.floor(tv + 1e-9) : roundTo(tv, dp);
      if (part.id === "cap") tr = Math.floor(tv + 1e-9);
      if (!near(partNum(answer, part.id), tr, tolOf(dp))) return false;
    } else if (part.answerType === "text") {
      if (timeMins(partStr(answer, part.id)) !== (((Math.round(tv) % 1440) + 1440) % 1440)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
