// Hotel Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so no answer sits on a rounding half-step, chained parts are computed from exact
// inputs (never from a rounded earlier answer), and verdict parts (Yes/No, Plan, Higher/Lower) are
// decided first and then fitted, kept clear of their thresholds. All figures are made up; hotel
// rules (no-show rate, walk cost, cleaning minutes, discounts, service charge) are exercise rules
// stated in each prompt, not law or industry advice. Money is a generic $.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   occupancy-revpar  occupancy %, ADR, RevPAR; room types; target RevPAR and a promotion verdict
//   overbooking       expected no-shows, guests walked, net gain, break-even walk cost, booking limit
//   housekeeping      minutes of cleaning, attendants (round up), labour cost per room, idle time, roster check
//   event-quote       package quote, deposit, profit and margin, break-even guests, group discount and verdict

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-hotel-manager: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const v = Number(n); const [a, b] = Math.abs(v).toFixed(2).split("."); return `${v < 0 ? "-" : ""}$${commas(a)}.${b}`; };
const moneyW = (n) => (Number.isInteger(Number(n)) ? `${Number(n) < 0 ? "-" : ""}$${commas(Math.abs(n))}` : money(n));
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const cdiv = (a, b) => Math.floor((a + b - 1) / b);
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; };
const ROOMS = [40, 50, 60, 80, 100, 120, 150, 200];

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function segPart2(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const choices = [];
  for (const x of a0) for (const y of a1) choices.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: shuffled(rng, choices), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- occupancy-revpar ----------

function genOcc(rng, tier) {
  const wantCombo = rng.pick([["Higher", "Met"], ["Higher", "Not met"], ["Lower", "Not met"]]); // expert-plus verdict
  for (let i = 0; i < TRY; i++) {
    const R = rng.pick(ROOMS);
    if (tier === "expert-plus") {
      const S0 = rng.int(Math.ceil(0.4 * R), Math.floor(0.7 * R)), A0 = rng.pick([100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240]);
      const revpar0 = (S0 * A0) / R;
      if (nearHalf(revpar0, 2)) continue;
      const T = rng.int(Math.ceil(revpar0) + 3, Math.floor(0.95 * A0));
      if (T <= revpar0 + 2 || !fracOk((R * T) / A0)) continue;
      const N = cdiv(R * T, A0);
      if (N > R) continue;
      const d = rng.pick([10, 15, 20, 25]), A1 = (A0 * (100 - d)) / 100;
      const S1 = rng.int(S0 + 1, R);
      const revpar1 = (S1 * A1) / R;
      const higher = revpar1 > revpar0, met = revpar1 >= T;
      if (Math.abs(revpar1 - revpar0) < Math.max(1.5, 0.03 * revpar0) || Math.abs(revpar1 - T) < Math.max(1.5, 0.03 * T)) continue;
      if ((higher ? "Higher" : "Lower") !== wantCombo[0] || (met ? "Met" : "Not met") !== wantCombo[1]) continue;
      const ans = [higher ? "Higher" : "Lower", met ? "Met" : "Not met"];
      const parts = [
        numPart("revpar", "RevPAR last night", "RevPAR last night in $ (room revenue ÷ rooms available)", revpar0, 2, "Room revenue = rooms sold × ADR. RevPAR divides it by every room available, sold or not."),
        numPart("sell", "Rooms to sell", `Rooms to sell at ${moneyW(A0)} to reach the target RevPAR (round up)`, N, 0, "Revenue needed = target RevPAR × rooms available. Divide by the rate and round up to whole rooms."),
        numPart("rate", "Promotion rate", "Room rate during the promotion in $", A1, 2, "Take the percentage off the current rate: rate × (100 − cut) ÷ 100."),
        segPart2(rng, "verdict", "Verdict", `Compare the promotion's RevPAR (${S1} rooms sold at the promotion rate) with last night's RevPAR and with the target.`,
          ["Against last night", "Against target"], ["Higher", "Lower"], ["Met", "Not met"], ans,
          "Work out promotion revenue = rooms sold × promotion rate, then RevPAR, and compare it with the two figures."),
      ];
      const rv1 = (S1 * A1) / R;
      const ex = `**RevPAR now:** ${S0} × ${moneyW(A0)} = ${money(S0 * A0)}, and ${money(S0 * A0)} ÷ ${R} = **${money(roundTo(revpar0, 2))}**.\n\n**Rooms to sell:** target revenue is ${R} × $${T} = $${commas(R * T)}, and $${commas(R * T)} ÷ ${moneyW(A0)} = ${f(roundTo((R * T) / A0, 2))}, round up to **${N}** rooms.\n\n**Promotion rate:** ${moneyW(A0)} × ${100 - d}% = **${money(A1)}**.\n\n**Verdict:** ${S1} × ${money(A1)} ÷ ${R} = ${money(roundTo(rv1, 2))}, which is **${ans[0]}** than ${money(roundTo(revpar0, 2))} and the target of $${T} is **${ans[1]}**.`;
      return finish(`A hotel has **${R} rooms** available. Last night it sold **${S0} rooms** at an ADR of **${moneyW(A0)}**. The target is a RevPAR of **$${T}**. A promotion cuts the room rate by **${d}%**.`,
        parts, ex, "hot-occ4", { tier, R, S0, A0, T, d, S1 }, [["_R", R], ["_sold", S0], ["_ADR", A0], ["_target", T], ["_cut", d], ["_promoSold", S1]],
        ["Start with last night: revenue, then RevPAR.", "The target gives revenue needed; the promotion gives a new rate and a new revenue."]);
    }
    const S = rng.int(Math.ceil(0.35 * R), Math.floor(0.95 * R));
    const A = rng.int(80, 280) + rng.pick([0, 0.5]);
    const occ = (S / R) * 100;
    if (nearHalf(occ, 1)) continue;
    const Rev = S * A;
    if (tier === "medium" || tier === "hard") {
      const parts = [
        numPart("occ", "Occupancy", "Occupancy in % (rooms sold ÷ rooms available × 100)", occ, 1, "Divide the rooms sold by the rooms available, then multiply by 100."),
        numPart("adr", "ADR", "Average daily rate (ADR) in $ (room revenue ÷ rooms sold)", A, 2, "ADR only counts rooms that were sold: revenue ÷ rooms sold."),
      ];
      let ex = `**Occupancy:** ${S} ÷ ${R} × 100 = **${f(roundTo(occ, 1))}%**.\n\n**ADR:** ${money(Rev)} ÷ ${S} = **${money(A)}**.`;
      if (tier === "hard") {
        const rp = Rev / R;
        if (nearHalf(rp, 2)) continue;
        parts.push(numPart("revpar", "RevPAR", "RevPAR in $ (room revenue ÷ rooms available)", rp, 2, "RevPAR spreads the revenue over every room available, sold or not (it also equals occupancy × ADR)."));
        ex += `\n\n**RevPAR:** ${money(Rev)} ÷ ${R} = **${money(roundTo(rp, 2))}**.`;
      }
      return finish(`A hotel has **${R} rooms** available. Last night **${S} rooms** were sold and the room revenue was **${money(Rev)}**.`,
        parts, ex, tier === "medium" ? "hot-occ1" : "hot-occ2", { tier, R, S, Rev }, [["_R", R], ["_sold", S], ["_rev", Rev]],
        tier === "medium" ? ["Occupancy compares rooms sold with rooms available.", "ADR compares revenue with rooms sold."]
          : ["Occupancy uses rooms available; ADR uses rooms sold.", "RevPAR uses rooms available again, with the revenue."]);
    }
    // expert: two room types
    const s1 = rng.int(Math.ceil(0.2 * R), Math.floor(0.6 * R)), s2 = rng.int(3, Math.max(4, Math.floor(0.2 * R)));
    const a1 = rng.int(90, 200), a2 = rng.int(a1 + 60, a1 + 220);
    const sold = s1 + s2, rev = s1 * a1 + s2 * a2;
    if (sold < 0.35 * R || sold > 0.95 * R) continue;
    const o = (sold / R) * 100, adr = rev / sold, rp = rev / R;
    if (nearHalf(o, 1) || nearHalf(adr, 2) || nearHalf(rp, 2)) continue;
    const parts = [
      numPart("rev", "Room revenue", "Total room revenue in $", rev, 0, "Each room type: rooms sold × its rate. Add the two."),
      numPart("occ", "Occupancy", "Occupancy in % (all rooms sold ÷ rooms available × 100)", o, 1, "Count standard rooms and suites together."),
      numPart("adr", "ADR", "ADR in $ (room revenue ÷ rooms sold)", adr, 2, "Use the total revenue and the total rooms sold."),
      numPart("revpar", "RevPAR", "RevPAR in $ (room revenue ÷ rooms available)", rp, 2, "Same revenue, divided by the rooms available."),
    ];
    const ex = `**Revenue:** ${s1} × $${a1} + ${s2} × $${a2} = $${commas(s1 * a1)} + $${commas(s2 * a2)} = **$${commas(rev)}**.\n\n**Occupancy:** (${s1} + ${s2}) ÷ ${R} × 100 = ${sold} ÷ ${R} × 100 = **${f(roundTo(o, 1))}%**.\n\n**ADR:** $${commas(rev)} ÷ ${sold} = **${money(roundTo(adr, 2))}**.\n\n**RevPAR:** $${commas(rev)} ÷ ${R} = **${money(roundTo(rp, 2))}**.`;
    return finish(`A hotel has **${R} rooms** available. Last night it sold **${s1} standard rooms** at **$${a1}** each and **${s2} suites** at **$${a2}** each.`,
      parts, ex, "hot-occ3", { tier, R, s1, a1, s2, a2 }, [["_R", R], ["_std", s1], ["_stdRate", a1], ["_suites", s2], ["_suiteRate", a2]],
      ["Revenue first, from both room types.", "Occupancy, ADR and RevPAR each divide by a different count: sold or available."]);
  }
  return tooMany();
}

// ---------- overbooking ----------

const walkRule = (W) => `A guest who arrives and is walked (sent to another hotel) pays nothing and costs the hotel **$${W}**. No-shows pay nothing (rules for this exercise).`;

function genOver(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const R = rng.pick(ROOMS), p = rng.pick([5, 8, 10, 12, 15]);
    if ((R * p) % 100) continue;
    const A = rng.int(90, 260), W = rng.pick([150, 180, 200, 240, 250, 300, 350, 400]);
    const B = R + rng.int(2, Math.ceil(R * 0.3));
    if ((B * p) % 100) continue;
    const ns = (B * p) / 100, walked = B - ns - R, ns0 = (R * p) / 100;
    if (walked < 1) continue;
    const gain = ns0 * A - walked * W;
    const base = `A hotel has **${R} rooms** and room revenue of **$${A}** per room-night. It accepts **${B} bookings**; **${p}%** of bookings are expected to be no-shows (assume exactly that many fail to arrive). ${walkRule(W)}`;
    if (tier === "medium") {
      const parts = [
        numPart("ns", "No-shows", "Expected no-shows (guests)", ns, 0, `Take the no-show percentage of the bookings accepted.`),
        numPart("walked", "Guests walked", "Guests who arrive but cannot be given a room", walked, 0, "Guests who arrive = bookings − no-shows. Any above the number of rooms are walked."),
      ];
      const ex = `**No-shows:** ${B} × ${p}% = **${ns}**.\n\n**Walked:** ${B} − ${ns} = ${B - ns} arrive, and ${B - ns} − ${R} = **${walked}** have no room.`;
      return finish(base.replace(/ A guest who.*$/, ""), parts, ex, "hot-ovb1", { tier, R, B, p }, [["_R", R], ["_booked", B], ["_noshow", p]],
        ["No-shows are a percentage of the bookings.", "Compare the guests who arrive with the rooms."]);
    }
    if (tier === "hard") {
      if (gain <= 0) continue;
      const parts = [
        numPart("ns", "No-shows", "Expected no-shows (guests)", ns, 0, "Take the no-show percentage of the bookings accepted."),
        numPart("walked", "Guests walked", "Guests who arrive but cannot be given a room", walked, 0, "Guests who arrive = bookings − no-shows. Any above the number of rooms are walked."),
        numPart("gain", "Net gain", `Net gain in revenue in $ from overbooking, compared with taking only ${R} bookings (same no-show rate)`, gain, 0, "Both plans: revenue = guests who stay × room revenue, less walk costs. Work out each and subtract."),
      ];
      const ex = `**No-shows:** ${B} × ${p}% = **${ns}**.\n\n**Walked:** ${B} − ${ns} = ${B - ns} arrive, ${B - ns} − ${R} = **${walked}** walked.\n\n**Gain:** with overbooking all ${R} rooms stay full: ${R} × $${A} − ${walked} × $${W} = $${commas(R * A)} − $${commas(walked * W)} = $${commas(R * A - walked * W)}. With only ${R} bookings, ${R} − ${ns0} = ${R - ns0} guests stay: ${R - ns0} × $${A} = $${commas((R - ns0) * A)}. Difference: **$${commas(gain)}**.`;
      return finish(base, parts, ex, "hot-ovb2", { tier, R, B, p, A, W }, [["_R", R], ["_booked", B], ["_noshow", p], ["_rate", A], ["_walk", W]],
        ["Count the guests who arrive, then compare with the rooms.", "Work out revenue under both plans and take the difference."]);
    }
    if (tier === "expert") {
      if (gain <= 0) continue;
      const Wstar = (ns0 * A) / walked;
      if (nearHalf(Wstar, 2)) continue;
      const parts = [
        numPart("ns", "No-shows", "Expected no-shows (guests)", ns, 0, "Take the no-show percentage of the bookings accepted."),
        numPart("walked", "Guests walked", "Guests who arrive but cannot be given a room", walked, 0, "Guests who arrive = bookings − no-shows, minus the rooms."),
        numPart("gain", "Net gain", `Net gain in revenue in $ from overbooking, compared with taking only ${R} bookings (same no-show rate)`, gain, 0, "Compare revenue from guests who stay under both plans, less walk costs."),
        numPart("wstar", "Break-even walk cost", "Largest walk cost per guest in $ at which overbooking still breaks even or gains", Wstar, 2, "Overbooking fills the rooms that the base plan leaves empty. Set that extra revenue equal to walked × walk cost."),
      ];
      const ex = `**No-shows:** ${B} × ${p}% = **${ns}**; **walked** = ${B} − ${ns} − ${R} = **${walked}**.\n\n**Gain:** extra rooms filled = ${ns0} (the base plan loses ${ns0} to no-shows), so ${ns0} × $${A} − ${walked} × $${W} = $${commas(ns0 * A)} − $${commas(walked * W)} = **$${commas(gain)}**.\n\n**Break-even walk cost:** $${commas(ns0 * A)} ÷ ${walked} = **${money(roundTo(Wstar, 2))}**.`;
      return finish(base, parts, ex, "hot-ovb3", { tier, R, B, p, A, W }, [["_R", R], ["_booked", B], ["_noshow", p], ["_rate", A], ["_walk", W]],
        ["Guests walked = guests arriving − rooms.", "The gain is the revenue of rooms the base plan leaves empty, less walk costs; the break-even sets it to zero."]);
    }
    // expert-plus: booking limit from a walk-cost budget
    const L = rng.pick([300, 400, 450, 500, 600, 700, 750, 800, 900, 1000, 1200, 1500]);
    const wm = L / W, rr = ((R + wm) * 100) / (100 - p);
    if (wm < 1.5 || !fracOk(rr)) continue;
    const Bmax = Math.floor(rr);
    if (B > Bmax + Math.ceil(R * 0.1) + 3) continue;
    const yes = B <= Bmax;
    if (yes !== wantYes) continue;
    if (gain === 0) continue;
    const parts = [
      numPart("walked", "Guests walked", `Guests walked if ${B} bookings are accepted`, walked, 0, "Guests who arrive = bookings − no-shows. Any above the number of rooms are walked."),
      numPart("gain", "Net gain", `Net gain in revenue in $ with ${B} bookings, compared with taking only ${R} (same no-show rate; negative if it loses money)`, gain, 0, "Compare revenue from guests who stay under both plans, less walk costs."),
      numPart("bmax", "Most bookings", `Most bookings that can be accepted with walk costs of at most $${L} (round down)`, Bmax, 0, "The limit ÷ cost per guest gives the most guests walked. Add that to the rooms for the most arrivals, then divide by the share who show up."),
      yesNo("verdict", "Verdict", `Does accepting ${B} bookings keep the walk costs within $${L}?`, yes, "Compare the guests walked with the most the limit allows."),
    ];
    const ex = `**Walked:** ${B} × ${100 - p}% = ${B - ns} arrive, and ${B - ns} − ${R} = **${walked}** walked.\n\n**Gain:** ${ns0} × $${A} − ${walked} × $${W} = $${commas(ns0 * A)} − $${commas(walked * W)} = **${moneyW(gain)}**.\n\n**Most bookings:** $${L} ÷ $${W} = ${f(roundTo(L / W, 2))}, so at most ${f(roundTo(wm, 2))} guests walked. Most arrivals = ${R} + ${f(roundTo(wm, 2))} = ${f(roundTo(R + wm, 2))}; bookings = ${f(roundTo(R + wm, 2))} ÷ ${(100 - p) / 100} = ${f(roundTo(rr, 2))}, round down to **${Bmax}**.\n\n**Verdict:** ${walked} × $${W} = $${commas(walked * W)}, which is ${yes ? "no more than" : "more than"} $${L}: **${YN(yes)}**.`;
    return finish(`A hotel has **${R} rooms** and room revenue of **$${A}** per room-night. **${p}%** of bookings are expected to be no-shows (assume exactly that many fail to arrive). ${walkRule(W)} The manager will accept at most the number of bookings whose walk costs stay within **$${L}**, and a colleague proposes taking **${B} bookings**.`,
      parts, ex, "hot-ovb4", { tier, R, B, p, A, W, L }, [["_R", R], ["_booked", B], ["_noshow", p], ["_rate", A], ["_walk", W], ["_limit", L]],
      ["Start with the proposal: arrivals, then walked guests.", "Then turn the walk-cost limit back into a number of guests, arrivals and bookings."]);
  }
  return tooMany();
}

// ---------- housekeeping ----------

const hkRule = (m1, m2, H) => `A check-out room takes **${m1} minutes** to clean and a stay-over room **${m2} minutes**. Each attendant has **${H} minutes** of cleaning time per shift (rules for this exercise).`;

function genHouse(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const m1 = rng.pick([30, 35, 40, 45]), m2 = rng.pick([15, 20, 25]), H = rng.pick([360, 390, 420, 450]);
    if (tier === "expert-plus") {
      const R = rng.pick([60, 80, 100, 120, 150, 200]), o = rng.int(55, 95), c = rng.pick([20, 25, 30, 35, 40, 45, 50, 60]), m3 = rng.pick([5, 6, 8, 10]);
      if ((R * o) % 100) continue;
      const occ = (R * o) / 100;
      if ((occ * c) % 100) continue;
      const D = (occ * c) / 100, T = occ - D, V = R - occ, total = D * m1 + T * m2 + V * m3;
      if (!fracOk(total / H)) continue;
      const need = cdiv(total, H);
      if (need < 3 || need > 16) continue;
      const k = wantYes ? need + rng.pick([0, 1, 2]) : need - rng.pick([1, 2]);
      if (k < 1 || (k >= need) !== wantYes) continue;
      const parts = [
        numPart("co", "Check-outs", "Number of check-out rooms to clean", D, 0, "Occupied rooms come from the occupancy percentage; the check-out share is a percentage of those."),
        numPart("mins", "Cleaning minutes", "Total cleaning minutes needed (check-outs, stay-overs and vacant-room checks)", total, 0, "Stay-overs are the occupied rooms that are not check-outs. Vacant rooms get the short check."),
        numPart("att", "Attendants", "Attendants needed (round up)", need, 0, "Total minutes ÷ minutes per attendant, rounded up to whole people."),
        yesNo("verdict", "Verdict", `The roster has **${k}** attendants. Can they finish everything with no overtime?`, k >= need, "Compare the minutes they can work with the minutes needed."),
      ];
      const ex = `**Check-outs:** occupied = ${R} × ${o}% = ${occ}; ${occ} × ${c}% = **${D}**, so ${T} stay-overs and ${V} vacant rooms.\n\n**Minutes:** ${D} × ${m1} + ${T} × ${m2} + ${V} × ${m3} = ${D * m1} + ${T * m2} + ${V * m3} = **${commas(total)}**.\n\n**Attendants:** ${commas(total)} ÷ ${H} = ${f(roundTo(total / H, 2))}, round up to **${need}**.\n\n**Verdict:** ${k} attendants have ${k} × ${H} = ${commas(k * H)} minutes, which is ${k >= need ? "enough" : "not enough"} for ${commas(total)}: **${YN(k >= need)}**.`;
      return finish(`A hotel has **${R} rooms**, **${o}%** occupied tonight; **${c}%** of the occupied rooms are check-outs and the rest are stay-overs. Vacant rooms get a quick check of **${m3} minutes** each. ${hkRule(m1, m2, H)}`,
        parts, ex, "hot-hsk4", { tier, R, o, c, m1, m2, m3, H, k }, [["_R", R], ["_occ", o], ["_out", c], ["_mCO", m1], ["_mSO", m2], ["_mVac", m3], ["_shift", H], ["_rostered", k]],
        ["Occupied rooms first, then split them into check-outs and stay-overs.", "Add the minutes for all three kinds of room, then divide by the shift."]);
    }
    const D = rng.int(20, 90), T = rng.int(15, 90), total = D * m1 + T * m2;
    if (!fracOk(total / H)) continue;
    const need = cdiv(total, H);
    if (need > 16) continue;
    const base = `On one day a hotel has **${D} check-out rooms** and **${T} stay-over rooms** to clean. ${hkRule(m1, m2, H)}`;
    const parts = [
      numPart("mins", "Cleaning minutes", "Total cleaning minutes needed", total, 0, "Rooms of each kind × the minutes each takes. Add the two."),
      numPart("att", "Attendants", "Attendants needed (round up)", need, 0, "Total minutes ÷ minutes per attendant, rounded up to whole people."),
    ];
    let ex = `**Minutes:** ${D} × ${m1} + ${T} × ${m2} = ${D * m1} + ${T * m2} = **${commas(total)}**.\n\n**Attendants:** ${commas(total)} ÷ ${H} = ${f(roundTo(total / H, 2))}, round up to **${need}**.`;
    let given = [["_out", D], ["_stay", T], ["_mCO", m1], ["_mSO", m2], ["_shift", H]], kind = "hot-hsk1", params = { tier, D, T, m1, m2, H };
    let hints = ["Minutes for each kind of room, added together.", "Divide by one attendant's shift and round up."];
    if (tier === "hard") {
      const Wg = rng.pick([96, 104, 112, 120, 128, 136, 144]), per = (need * Wg) / (D + T);
      if (nearHalf(per, 2)) continue;
      parts.push(numPart("cost", "Labour cost per room", `Labour cost per room cleaned in $ (attendants × $${Wg} per shift ÷ rooms cleaned)`, per, 2, "Wages for the day = attendants × cost per shift. Divide by every room cleaned, check-outs and stay-overs."));
      ex += `\n\n**Cost per room:** ${need} × $${Wg} = $${commas(need * Wg)}, and $${commas(need * Wg)} ÷ ${D + T} = **${money(roundTo(per, 2))}**.`;
      given.push(["_wage", Wg]); kind = "hot-hsk2"; params = { ...params, Wg };
      hints = ["Total minutes, then whole attendants.", "Wages for the day divided by all rooms cleaned."];
    } else if (tier === "expert") {
      const idle = need * H - total, extra = Math.floor(idle / m2);
      if (idle < m2 || idle / m2 - extra < 0.08 || idle / m2 - extra > 0.92) continue;
      parts.push(numPart("idle", "Idle minutes", "Cleaning minutes left unused across the team", idle, 0, "Minutes available = attendants × shift. Take away the minutes needed."));
      parts.push(numPart("extra", "Extra stay-overs", "Extra stay-over rooms the idle time could still clean (round down)", extra, 0, "Divide the idle minutes by the minutes one stay-over takes and round down: a part-clean does not count."));
      ex += `\n\n**Idle:** ${need} × ${H} = ${commas(need * H)} available, so ${commas(need * H)} − ${commas(total)} = **${commas(idle)}** minutes.\n\n**Extra stay-overs:** ${commas(idle)} ÷ ${m2} = ${f(roundTo(idle / m2, 2))}, round down to **${extra}**.`;
      kind = "hot-hsk3";
      hints = ["Minutes needed, then whole attendants.", "What the team could work minus what is needed is idle; fit whole stay-overs into it."];
    }
    return finish(base, parts, ex, kind, params, given, hints);
  }
  return tooMany();
}

// ---------- event-quote ----------

function genEvent(rng, tier) {
  const wantYes = rng.next() < 0.5, wantDisc = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const G = rng.pick([20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200]), P = rng.int(35, 95), F = rng.pick([150, 200, 250, 300, 400, 500, 600, 800, 900]);
    const sub = G * P + F;
    if (tier === "medium") {
      const dep = rng.pick([20, 25, 30, 40, 50]), dv = (sub * dep) / 100;
      const parts = [
        numPart("sub", "Quote", "Quote in $ (guests × price per head + room hire)", sub, 0, "Price per head × guests, then add the room hire."),
        numPart("dep", "Deposit", `Deposit in $ (${dep}% of the quote)`, dv, 2, "Take the deposit percentage of the quote."),
      ];
      const ex = `**Quote:** ${G} × $${P} + $${F} = $${commas(G * P)} + $${F} = **$${commas(sub)}**.\n\n**Deposit:** $${commas(sub)} × ${dep}% = **${money(dv)}**.`;
      return finish(`A hotel quotes a banquet for **${G} guests** at **$${P} per head**, plus a room hire fee of **$${F}**. A deposit of **${dep}%** of the quote is due on booking.`,
        parts, ex, "hot-evt1", { tier, G, P, F, dep }, [["_guests", G], ["_head", P], ["_hire", F], ["_deposit", dep]],
        ["Per-head charges for all guests, plus the hire fee.", "The deposit is a percentage of the whole quote."]);
    }
    const c = Math.round(P * rng.pick([0.4, 0.45, 0.5, 0.55, 0.6])), X = rng.pick([100, 150, 200, 250, 300, 400, 500, 600, 700, 800]);
    if (c >= P - 8) continue;
    const cost = G * c + X, profit = sub - cost, margin = (profit / sub) * 100;
    if (profit <= 0 || nearHalf(margin, 1)) continue;
    const costTxt = `The hotel's cost is **$${c} per guest** plus **$${X}** of fixed costs for staff and set-up.`;
    if (tier === "hard" || tier === "expert") {
      const parts = [
        numPart("sub", "Quote", "Quote in $ (guests × price per head + room hire)", sub, 0, "Price per head × guests, then add the room hire."),
        numPart("profit", "Profit", "Profit in $ (quote − cost)", profit, 0, "Cost = cost per guest × guests + fixed costs. Take it from the quote."),
        numPart("margin", "Profit margin", "Profit as a percentage of the quote", margin, 1, "Profit ÷ quote × 100."),
      ];
      let ex = `**Quote:** ${G} × $${P} + $${F} = **$${commas(sub)}**.\n\n**Profit:** cost = ${G} × $${c} + $${X} = $${commas(cost)}, so $${commas(sub)} − $${commas(cost)} = **$${commas(profit)}**.\n\n**Margin:** $${commas(profit)} ÷ $${commas(sub)} × 100 = **${f(roundTo(margin, 1))}%**.`;
      let kind = "hot-evt2", params = { tier, G, P, F, c, X }, hints = ["Quote first, then the cost to the hotel.", "Margin compares profit with the quote."];
      if (tier === "expert") {
        const be = (X - F) / (P - c);
        if (X <= F || !fracOk(be) || be > G) continue;
        const beG = Math.ceil(be);
        parts.push(numPart("be", "Break-even guests", "Fewest guests at which the booking breaks even (round up)", beG, 0, "Each guest adds price − cost; the room hire offsets the fixed costs. Find how many guests cover what is left, and round up."));
        ex += `\n\n**Break-even:** fixed costs left after hire = $${X} − $${F} = $${X - F}; each guest adds $${P} − $${c} = $${P - c}; $${X - F} ÷ $${P - c} = ${f(roundTo(be, 2))}, round up to **${beG}** guests.`;
        kind = "hot-evt3"; hints = ["Quote and profit first.", "Each guest contributes price minus cost; the hire fee offsets the fixed cost."];
      }
      return finish(`A hotel quotes a banquet for **${G} guests** at **$${P} per head**, plus a room hire fee of **$${F}**. ${costTxt}`,
        parts, ex, kind, params, [["_guests", G], ["_head", P], ["_hire", F], ["_cost", c], ["_fixed", X]], hints);
    }
    // expert-plus: group discount, service charge, minimum profit verdict
    const L = rng.pick([20, 30, 40, 50, 60, 75, 100]), d = rng.pick([5, 10, 15, 20]), s = rng.pick([5, 10, 15, 20]);
    const disc = G >= L;
    if (disc !== wantDisc) continue;
    if (G >= L && G - L < 5 && G !== L) continue;
    const Pc = disc ? (P * (100 - d)) / 100 : P;
    const rev = G * Pc + F, bill = (rev * (100 + s)) / 100, pf = rev - (G * c + X);
    if (pf <= 0 || nearHalf(bill, 2) || nearHalf(Pc, 2)) continue;
    const M = wantYes ? Math.floor(pf) - rng.pick([30, 50, 80, 120, 200]) : Math.ceil(pf) + rng.pick([30, 50, 80, 120, 200]);
    if (M < 20 || Math.abs(pf - M) < Math.max(30, 0.03 * Math.abs(pf))) continue;
    const ok = pf >= M;
    const parts = [
      numPart("price", "Price per head", "Price per head actually charged in $", Pc, 2, "Check whether the group size reaches the discount level. If so, take the percentage off; if not, the price stays."),
      numPart("bill", "Client's bill", `Client's total bill in $ (guests × price + room hire, plus the ${s}% service charge)`, bill, 2, "Add the room hire to the guests' charges, then add the service charge percentage on top."),
      numPart("profit", "Hotel profit", "Hotel's profit in $ (the service charge goes to staff and is not income; cost = cost per guest × guests + fixed costs)", pf, 2, "Income is guests × price + room hire, without the service charge. Take the cost away."),
      yesNo("verdict", "Verdict", `The hotel only takes bookings that earn at least **$${M}** profit. Does this booking qualify?`, ok, "Compare the profit with the minimum."),
    ];
    const ex = `**Price:** ${G} guests ${disc ? "reaches" : "is below"} the ${L}-guest level, so the price is ${disc ? `$${P} × ${100 - d}% = ` : ""}**${money(Pc)}**.\n\n**Bill:** ${G} × ${money(Pc)} + $${F} = ${money(rev)}; plus ${s}%: ${money(rev)} × ${(100 + s) / 100} = **${money(roundTo(bill, 2))}**.\n\n**Profit:** income ${money(rev)} − cost (${G} × $${c} + $${X} = $${commas(G * c + X)}) = **${money(roundTo(pf, 2))}**.\n\n**Verdict:** ${money(roundTo(pf, 2))} is ${ok ? "at least" : "less than"} $${M}: **${YN(ok)}**.`;
    return finish(`A hotel quotes a banquet for **${G} guests** at **$${P} per head**, plus a room hire fee of **$${F}**. Groups of at least **${L} guests** get **${d}%** off the per-head price. The client's bill also carries a **${s}%** service charge. ${costTxt}`,
      parts, ex, "hot-evt4", { tier, G, P, F, c, X, L, d, s, M }, [["_guests", G], ["_head", P], ["_hire", F], ["_minGroup", L], ["_disc", d], ["_service", s], ["_cost", c], ["_fixed", X]],
      ["The discount only applies if the group is big enough.", "The bill includes the service charge; the hotel's profit does not."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "occupancy-revpar") return genOcc(rng, difficulty);
  if (subtopic === "overbooking") return genOver(rng, difficulty);
  if (subtopic === "housekeeping") return genHouse(rng, difficulty);
  if (subtopic === "event-quote") return genEvent(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (occupancy as 1 - vacant
// share, RevPAR as occupancy x ADR, counts by scanning for the smallest/largest whole number that
// satisfies a rule, overbooking by simulating both plans room by room, profit by per-guest margin).
// Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const smallestK = (ok) => { let k = 0; while (!ok(k)) k++; return k; };           // smallest whole k passing ok
const largestK = (ok) => { let k = 0; while (ok(k + 1)) k++; return k; };           // largest whole k passing ok
// Revenue of a night: guests who show up fill rooms; guests beyond the rooms are walked.
function night(R, bookings, p, A, W) {
  const shows = bookings - (bookings * p) / 100;
  let stay = 0, walked = 0;
  for (let g = 1; g <= shows; g++) { if (g <= R) stay++; else walked++; }
  return { shows, stay, walked, revenue: stay * A - walked * W };
}

const ALT = {
  "hot-occ1": (p) => ({ occ: (1 - (p.R - p.S) / p.R) * 100, adr: p.Rev / p.S }),
  "hot-occ2": (p) => { const occ = (1 - (p.R - p.S) / p.R) * 100, adr = p.Rev / p.S; return { occ, adr, revpar: (occ / 100) * adr }; },
  "hot-occ3": (p) => {
    const sold = p.s1 + p.s2, rev = sum([p.s1 * p.a1, p.s2 * p.a2]), occ = (1 - (p.R - sold) / p.R) * 100, adr = rev / sold;
    return { rev, occ, adr, revpar: (occ / 100) * adr };
  },
  "hot-occ4": (p) => {
    const revpar = (p.S0 * p.A0) / p.R, A1 = p.A0 - (p.A0 * p.d) / 100;
    const sell = smallestK((k) => (k * p.A0) / p.R >= p.T - 1e-9);
    const rp1 = (p.S1 * A1) / p.R;
    return { revpar, sell, rate: A1, verdict: `${rp1 > revpar ? "Higher" : "Lower"} | ${rp1 >= p.T ? "Met" : "Not met"}` };
  },
  "hot-ovb1": (p) => { const n = night(p.R, p.B, p.p, 0, 0); return { ns: p.B - n.shows, walked: n.walked }; },
  "hot-ovb2": (p) => {
    const over = night(p.R, p.B, p.p, p.A, p.W), base = night(p.R, p.R, p.p, p.A, p.W);
    return { ns: p.B - over.shows, walked: over.walked, gain: over.revenue - base.revenue };
  },
  "hot-ovb3": (p) => {
    const over = night(p.R, p.B, p.p, p.A, p.W), base = night(p.R, p.R, p.p, p.A, p.W);
    const wstar = (night(p.R, p.B, p.p, p.A, 0).revenue - base.revenue) / over.walked; // gain at W = 0, spread over walked guests
    return { ns: p.B - over.shows, walked: over.walked, gain: over.revenue - base.revenue, wstar };
  },
  "hot-ovb4": (p) => {
    const over = night(p.R, p.B, p.p, p.A, p.W), base = night(p.R, p.R, p.p, p.A, p.W);
    const bmax = largestK((b) => Math.max(0, (b * (100 - p.p)) / 100 - p.R) * p.W <= p.L + 1e-9);
    return { walked: over.walked, gain: over.revenue - base.revenue, bmax, verdict: YN(over.walked * p.W <= p.L + 1e-9) };
  },
  "hot-hsk1": (p) => { const t = p.D * p.m1 + p.T * p.m2; return { mins: t, att: smallestK((k) => k * p.H >= t) }; },
  "hot-hsk2": (p) => {
    const t = p.D * p.m1 + p.T * p.m2, a = smallestK((k) => k * p.H >= t);
    return { mins: t, att: a, cost: (a * p.Wg) / (p.D + p.T) };
  },
  "hot-hsk3": (p) => {
    const t = p.D * p.m1 + p.T * p.m2, a = smallestK((k) => k * p.H >= t), idle = a * p.H - t;
    return { mins: t, att: a, idle, extra: largestK((k) => k * p.m2 <= idle) };
  },
  "hot-hsk4": (p) => {
    let occ = 0; for (let r = 1; r <= p.R; r++) if (r * 100 <= p.R * p.o) occ++;   // occupied rooms counted one by one
    const D = (occ * p.c) / 100, t = D * p.m1 + (occ - D) * p.m2 + (p.R - occ) * p.m3, a = smallestK((k) => k * p.H >= t);
    return { co: D, mins: t, att: a, verdict: YN(p.k * p.H >= t) };
  },
  "hot-evt1": (p) => ({ sub: p.F + p.P * p.G, dep: (p.F + p.P * p.G) * (p.dep / 100) }),
  "hot-evt2": (p) => {
    const sub = p.F + p.P * p.G, profit = p.G * (p.P - p.c) + p.F - p.X;
    return { sub, profit, margin: (profit * 100) / sub };
  },
  "hot-evt3": (p) => {
    const sub = p.F + p.P * p.G, profit = p.G * (p.P - p.c) + p.F - p.X;
    return { sub, profit, margin: (profit * 100) / sub, be: smallestK((g) => g * (p.P - p.c) + p.F >= p.X) };
  },
  "hot-evt4": (p) => {
    const price = p.G >= p.L ? p.P - (p.P * p.d) / 100 : p.P;
    const income = p.F + p.G * price, profit = income - p.X - p.G * p.c;
    return { price, bill: income + (income * p.s) / 100, profit, verdict: YN(profit >= p.M - 1e-9) };
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
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
