// HR Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (or the stated rounding rule makes it stable), no answer sits on a rounding
// half-step, and verdict parts are decided first and then fitted. All figures are made up, money is a
// generic $, and every rule (overtime multiplier, flat deduction, pro-rata leave, offer-acceptance and
// probation rates, pay bands) is an exercise rule stated in each prompt, not any country's employment law.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   payroll          gross -> net; expert: crew cost with on-cost; expert-plus: two workers, overtime share, budget
//   turnover-hiring  average headcount -> turnover % -> hires needed; expert: offers (round up) and cost;
//                    expert-plus: probation pass rate, then offers, against an offer cap
//   leave-absence    pro-rata entitlement (half day) -> days left; expert: team absence rate, cover cost, trigger;
//                    expert-plus: part-year starter, unused-leave payout against a provision
//   pay-review       raise cost -> budget left; hard: band midpoint, compa-ratio, below minimum?;
//                    expert: top-up to band minimum; expert-plus: blanket raise then top-up, total vs budget

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-6;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-hr-manager: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const dollars = (n) => `$${commas(Math.round(n))}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const halfDay = (x) => roundTo(x * 2, 0) / 2;
const orList = (a) => a.join(", ").replace(/, ([^,]*)$/, " and $1");

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- payroll ----------

const JOBS = ["warehouse operative", "care assistant", "kitchen assistant", "delivery driver", "machine operator", "call-centre agent", "bakery assistant", "cleaner"];
const RATES = [11, 12, 12.5, 13.5, 14, 15, 16, 17.5, 18, 20];
const grossOf = (r, T, m, h) => r * Math.min(h, T) + r * m * Math.max(0, h - T);
const rate2 = (r) => `$${r.toFixed(2)}`;
const payRule = (T, m, d) => `Rules for this exercise: the first **${T} hours** a week are paid at the hourly rate, and hours beyond that are overtime, paid at **${f(m)} times** the rate. A flat **${d}%** of gross pay is deducted (made-up rule, not any country's tax); net pay is what is left.`;

function genPay(rng, tier) {
  const wantBudget = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const T = rng.pick([35, 36, 38, 40]), m = rng.pick([1.25, 1.5, 2]), d = rng.pick([10, 12, 15, 18, 20, 22, 25]);
    const job = rng.pick(JOBS), r = rng.pick(RATES), e = rng.int(2, 14) + (rng.next() < 0.3 ? 0.5 : 0), h = T + e;
    const gross = grossOf(r, T, m, h), net = (gross * (100 - d)) / 100;
    if (!isEx(gross, 2) || !isEx(net, 2)) continue;
    if (tier !== "expert-plus") {
      const base = `A **${job}** is paid **${rate2(r)}** an hour and worked **${f(h)} hours** this week. ${payRule(T, m, d)}`;
      const given = [["_rate", r], ["_hours", h], ["_limit", T], ["_mult", m], ["_ded", d]];
      const exOt = `**Overtime hours:** ${f(h)} − ${T} = **${f(e)}**.`;
      const exG = `**Gross:** ${T} × ${rate2(r)} + ${f(e)} × ${f(m)} × ${rate2(r)} = **${money(gross)}**.`;
      const exN = `**Net:** ${money(gross)} × (100 − ${d})% = **${money(net)}**.`;
      const pOt = numPart("ot", "Overtime hours", "Overtime hours worked this week", e, 1, "Hours worked beyond the weekly limit.");
      const pG = numPart("gross", "Gross pay", "Gross pay for the week ($)", gross, 2, "Basic hours at the rate, plus the overtime hours at the rate times the multiplier.");
      const pN = numPart("net", "Net pay", "Net pay for the week after the deduction ($)", net, 2, "Take the stated percentage off the gross pay.");
      if (tier === "medium") return finish(base, [pG, pN], `${exG}\n\n${exN}`, "hr-pay1", { tier, r, T, m, d, h }, given,
        ["Split the hours into basic and overtime first.", "The deduction comes off the gross pay."]);
      if (tier === "hard") return finish(base, [pOt, pG, pN], `${exOt}\n\n${exG}\n\n${exN}`, "hr-pay2", { tier, r, T, m, d, h }, given,
        ["Overtime hours, then the pay for each kind of hour.", "Deduct the percentage from the gross, not from the net."]);
      const k = rng.int(3, 8), c = rng.pick([8, 10, 12, 15]), crew = k * gross * (1 + c / 100);
      if (!isEx(crew, 2)) continue;
      const pC = numPart("crew", "Crew cost", `Cost to the employer of ${k} such workers for the week, each with the same hours, including the on-cost ($)`, crew, 2, "Each worker's gross pay plus the on-cost percentage on top of it; then multiply for the crew. The deduction is paid by the worker, not the employer.");
      return finish(`${base} The employer also pays an on-cost of **${c}%** of gross pay for each worker (made-up rate), on top of the gross.`, [pOt, pG, pN, pC],
        `${exOt}\n\n${exG}\n\n${exN}\n\n**Crew cost:** ${k} × ${money(gross)} × ${f(1 + c / 100)} = **${money(crew)}**.`,
        "hr-pay3", { tier, r, T, m, d, h, k, c }, [...given, ["_oncost", c], ["_crew", k]],
        ["Net pay is the worker's take-home; the employer's cost starts from gross.", "Add the on-cost as a percentage of the gross."]);
    }
    // expert-plus: two workers, overtime share and a weekly budget
    let job2 = rng.pick(JOBS);
    if (job2 === job) continue;
    const r2 = rng.pick(RATES), e2 = rng.int(2, 14) + (rng.next() < 0.3 ? 0.5 : 0), h2 = T + e2;
    const gross2 = grossOf(r2, T, m, h2);
    if (!isEx(gross2, 2)) continue;
    const totalG = gross + gross2, otPay = r * m * e + r2 * m * e2, share = (otPay / totalG) * 100;
    if (nearHalf(share, 1, 0.1)) continue;
    const c = rng.pick([8, 10, 12, 15]), cost = totalG * (1 + c / 100);
    const within = wantBudget;
    const B = Math.round((within ? cost * (1 + rng.int(4, 12) / 100) : cost * (1 - rng.int(4, 12) / 100)) / 10) * 10;
    if (Math.abs(B - cost) < 0.035 * cost || (cost <= B) !== within) continue;
    const parts = [
      numPart("grossa", "First worker", `Gross pay for the ${job} ($)`, gross, 2, "Basic hours at the rate, plus the overtime hours at the rate times the multiplier."),
      numPart("grossb", "Second worker", `Gross pay for the ${job2} ($)`, gross2, 2, "Same method with this worker's rate and hours."),
      numPart("share", "Overtime share", "Overtime pay (pay for the hours above the limit) as a percentage of the two workers' combined gross", share, 1, "Add up the pay for overtime hours only, then divide by the two gross figures added together."),
      yesNo("within", "Within budget?", `The weekly budget for these two workers is **${dollars(B)}**. Is the employer's cost (gross pay plus the **${c}%** on-cost) within the budget?`, within, "Add both gross pays, add the on-cost percentage, and compare with the budget; equal counts as within."),
    ];
    const ex = `**${job}:** ${T} × ${rate2(r)} + ${f(e)} × ${f(m)} × ${rate2(r)} = **${money(gross)}**.\n\n**${job2}:** ${T} × ${rate2(r2)} + ${f(e2)} × ${f(m)} × ${rate2(r2)} = **${money(gross2)}**.\n\n**Overtime share:** overtime pay ${money(otPay)} ÷ ${money(totalG)} × 100 = **${f(roundTo(share, 1))}%**.\n\n**Cost:** ${money(totalG)} × ${f(1 + c / 100)} = ${money(cost)}, ${within ? "within" : "over"} ${dollars(B)}: **${YN(within)}**.`;
    return finish(`A **${job}** (paid **${rate2(r)}** an hour) worked **${f(h)} hours** and a **${job2}** (paid **${rate2(r2)}** an hour) worked **${f(h2)} hours** this week. Rules for this exercise: the first **${T} hours** a week are paid at the hourly rate, and hours beyond that are overtime, paid at **${f(m)} times** the rate. The employer also pays an on-cost of **${c}%** of gross pay (made-up rate).`,
      parts, ex, "hr-pay4", { tier, r, r2, T, m, h, h2, c, B }, [["_rate1", r], ["_hours1", h], ["_rate2", r2], ["_hours2", h2], ["_limit", T], ["_mult", m], ["_oncost", c], ["_budget", B]],
      ["Work out each worker's pay separately before combining anything.", "The overtime share uses only the pay for hours above the limit."]);
  }
  return tooMany();
}

// ---------- turnover-hiring ----------

const TEAMS = ["distribution centre", "contact centre", "care home group", "retail chain", "hospital kitchen service", "field-service team"];

function genTurn(rng, tier) {
  const wantCap = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const team = rng.pick(TEAMS);
    const S = rng.int(40, 200), L = rng.int(6, Math.floor(S * 0.3)), E = S + rng.int(-8, 12);
    const avg = (S + E) / 2, rate = (L / avg) * 100;
    if (nearHalf(rate, 1, 0.08)) continue;
    const base = `The **${team}** had **${S} staff** on 1 January and **${E}** on 31 December, and **${L} people left** during the year. Average headcount is the mean of the start and end counts.`;
    const given = [["_start", S], ["_end", E], ["_left", L]];
    const exA = `**Average headcount:** (${S} + ${E}) ÷ 2 = **${f(avg)}**.`;
    const exR = `**Turnover:** ${L} ÷ ${f(avg)} × 100 = **${f(roundTo(rate, 1))}%**.`;
    const pA = numPart("avg", "Average headcount", "Average headcount over the year", avg, 1, "Add the start and end headcounts and halve it.");
    const pR = numPart("rate", "Turnover rate", "Staff turnover for the year (%)", rate, 1, "Leavers divided by the average headcount, as a percentage.");
    if (tier === "medium") return finish(base, [pA, pR], `${exA}\n\n${exR}`, "hr-tu1", { tier, S, E, L }, given,
      ["Average first, then leavers against it.", "Turnover is a percentage of the average headcount, not of the start count."]);
    const T = E + rng.int(5, 25), H = T - E + L;
    const nextTxt = `Next year the same number of people (**${L}**) is expected to leave, and the target headcount on 31 December next year is **${T}**.`;
    const exH = `**Hires needed:** ${T} − ${E} + ${L} = **${H}**.`;
    const pH = numPart("hires", "Hires needed", "Hires needed next year to reach the target", H, 0, "The headcount has to grow to the target, and every leaver also has to be replaced.");
    if (tier === "hard") return finish(`${base} ${nextTxt}`, [pA, pR, pH], `${exA}\n\n${exR}\n\n${exH}`, "hr-tu2", { tier, S, E, L, T }, [...given, ["_target", T]],
      ["Turnover needs the average; the hires need the end count, the target and the leavers.", "Replacing leavers is on top of the growth to the target."]);
    if (tier === "expert") {
      const a = rng.pick([40, 50, 60, 75, 80]), ratio = (H * 100) / a;
      if (!fracOk(ratio)) continue;
      const O = Math.ceil(ratio), cpo = rng.pick([150, 200, 250, 300, 400, 500]), cost = O * cpo;
      const parts = [pR, pH,
        numPart("offers", "Offers to make", "Job offers needed (round up)", O, 0, "Only the accepted share of offers turns into hires, so divide the hires by that share and round up."),
        numPart("cost", "Recruiting cost", "Recruiting cost for those offers ($)", cost, 0, "Offers times the cost per offer. Whole dollars.")];
      const ex = `${exR}\n\n${exH}\n\n**Offers:** ${H} ÷ ${a}% = ${f(roundTo(ratio, 2))}, up to **${O}**.\n\n**Cost:** ${O} × ${dollars(cpo)} = **${dollars(cost)}**.`;
      return finish(`${base} ${nextTxt} **${a}%** of job offers are accepted, and every offer made costs **${dollars(cpo)}** in interviews and checks (made-up figures).`, parts, ex, "hr-tu3", { tier, S, E, L, T, a, cpo }, [...given, ["_target", T], ["_accept", a], ["_offercost", cpo]],
        ["Hires first, as in the plain headcount plan.", "Offers must outnumber hires because some are turned down; round up."]);
    }
    const p = rng.pick([75, 80, 85, 90]), a = rng.pick([40, 50, 60, 70, 75, 80]);
    const rs = (H * 100) / p;
    if (!fracOk(rs)) continue;
    const St = Math.ceil(rs), ro = (St * 100) / a;
    if (!fracOk(ro)) continue;
    const O = Math.ceil(ro);
    if (Math.ceil((H * 10000) / (p * a) - 1e-9) !== O) continue;
    const within = wantCap, C = within ? O + rng.int(2, 6) : O - rng.int(2, 6);
    if (C < 3 || (O <= C) !== within) continue;
    const parts = [pH,
      numPart("starters", "Starters to recruit", "People to recruit so that enough pass probation (round up)", St, 0, "Only the probation pass share of starters stay, so divide the hires by that share and round up."),
      numPart("offers", "Offers to make", "Job offers needed for those starters (round up)", O, 0, "Divide the starters by the acceptance share and round up."),
      yesNo("cap", "Within the cap?", `The recruiting team can make at most **${C} offers** this year. Is that enough?`, within, "Compare the offers needed with the team's limit; equal is enough.")];
    const ex = `${exH}\n\n**Starters:** ${H} ÷ ${p}% = ${f(roundTo(rs, 2))}, up to **${St}**.\n\n**Offers:** ${St} ÷ ${a}% = ${f(roundTo(ro, 2))}, up to **${O}**.\n\n**Cap:** ${O} offers ${within ? "fit within" : "exceed"} ${C}: **${YN(within)}**.`;
    return finish(`${base} ${nextTxt} Rules for this exercise: **${p}%** of starters pass probation and stay, and **${a}%** of job offers are accepted. Round up to a whole number of starters first, then round the offers up from that.`, parts, ex, "hr-tu4", { tier, S, E, L, T, p, a, C }, [...given, ["_target", T], ["_pass", p], ["_accept", a], ["_cap", C]],
      ["Hires needed first, without any losses along the way.", "Work backwards through the funnel: stayers, then starters, then offers."]);
  }
  return tooMany();
}

// ---------- leave-absence ----------

const STAFF = ["Receptionist", "Technician", "Analyst", "Designer", "Coordinator", "Planner", "Supervisor", "Administrator"];
const leaveRule = (D) => `Rules for this exercise: a full-time employee works **5 days a week** and gets **${D} days** of paid holiday a year. A part-time employee's entitlement is scaled by days worked per week ÷ 5, and a part-year starter's by months employed ÷ 12. Round the entitlement to the **nearest half day**, and use that rounded figure from then on.`;

function genLeave(rng, tier) {
  const wantTrig = rng.next() < 0.5, wantProv = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const D = rng.pick([20, 24, 25, 28]), k = rng.pick([2, 3, 4]);
    if (tier === "expert") {
      const n = rng.int(4, 6), days = Array.from({ length: n }, () => rng.int(0, 3)), tot = sum(days), W = rng.pick([20, 21, 22]);
      if (tot < 4 || days.filter((x) => x === 0).length > 1) continue;
      const rate = (tot / (n * W)) * 100;
      if (nearHalf(rate, 1, 0.08)) continue;
      const T = rng.pick([3, 4, 5, 6, 7, 8]);
      if (Math.abs(rate - T) < 0.4) continue;
      const trig = rate > T;
      if (trig !== wantTrig) continue;
      const c = rng.pick([70, 80, 85, 90, 100, 120, 150]), cost = tot * c;
      const titles = shuffled(rng, STAFF).slice(0, n);
      const list = orList(titles.map((t, q) => `the ${t} ${days[q]}`));
      const parts = [
        numPart("total", "Days absent", "Total sick days taken by the team in the month", tot, 0, "Add each person's days."),
        numPart("rate", "Absence rate", "Absence rate for the month (%)", rate, 1, "Days absent divided by all the working days the team could have worked, as a percentage."),
        numPart("cost", "Cover cost", "Cost of covering every absent day ($)", cost, 0, "Days absent times the cost of one day of cover. Whole dollars."),
        yesNo("review", "Review triggered?", `A review is triggered when the absence rate is **above ${T}%**. Is it triggered this month?`, trig, "Compare the rate with the trigger; only above it triggers a review."),
      ];
      const ex = `**Days absent:** ${days.join(" + ")} = **${tot}**.\n\n**Rate:** ${tot} ÷ (${n} × ${W}) × 100 = **${f(roundTo(rate, 1))}%**.\n\n**Cover:** ${tot} × ${dollars(c)} = **${dollars(cost)}**.\n\n**Review:** ${f(roundTo(rate, 1))}% is ${trig ? "above" : "not above"} ${T}%: **${YN(trig)}**.`;
      return finish(`A team of **${n}** has **${W} working days** this month. Sick days taken: ${list}. Each absent day is covered by an agency worker at **${dollars(c)}** a day (made-up figure). The absence rate is days absent as a share of all the working days the team could have worked.`,
        parts, ex, "hr-le3", { tier, days, W, c, T, n }, [["_staff", n], ["_wdays", W], ["_cover", c], ["_trigger", T]],
        ["Add the days, then compare with the days the team could have worked.", "Cover is charged per absent day."]);
    }
    if (tier === "expert-plus") {
      const m = rng.int(3, 9), ent = (D * k * m) / 60, entR = halfDay(ent);
      if (nearHalf(ent * 2, 0, 0.08)) continue;
      const taken = rng.int(1, Math.max(1, Math.floor(entR) - 1)) + (rng.next() < 0.3 ? 0.5 : 0), left = entR - taken;
      if (left < 1) continue;
      const dr = rng.pick([88, 92, 96, 104, 110, 120, 125.5, 140]), pay = left * dr;
      if (!isEx(pay, 2)) continue;
      const within = wantProv;
      const P = Math.round((within ? pay * (1 + rng.int(6, 20) / 100) : pay * (1 - rng.int(6, 20) / 100)) / 10) * 10;
      if (Math.abs(P - pay) < 0.05 * pay || (pay <= P) !== within) continue;
      const parts = [
        numPart("ent", "Entitlement", "Holiday entitlement for the year, to the nearest half day (days)", entR, 1, "Full-time days, scaled by days worked per week and by months employed, then rounded to a half day."),
        numPart("left", "Days left", "Days of holiday not yet taken (use the rounded entitlement)", left, 1, "Rounded entitlement minus the days already taken."),
        numPart("payout", "Payout", "Pay owed for the unused days ($)", pay, 2, "Unused days times the daily rate."),
        yesNo("prov", "Within provision?", `The company set aside **${dollars(P)}** for unused-leave payouts for this person. Does it cover the payout?`, within, "Compare the payout with the amount set aside; equal covers it."),
      ];
      const ex = `**Entitlement:** ${D} × ${k}/5 × ${m}/12 = ${f(roundTo(ent, 3))}, to the nearest half day **${f(entR)}**.\n\n**Days left:** ${f(entR)} − ${f(taken)} = **${f(left)}**.\n\n**Payout:** ${f(left)} × ${money(dr)} = **${money(pay)}**.\n\n**Provision:** ${money(pay)} ${within ? "is covered by" : "exceeds"} ${dollars(P)}: **${YN(within)}**.`;
      return finish(`A **${rng.pick(STAFF)}** joined **${m} months** before the end of the holiday year and works **${k} days a week**. So far **${f(taken)} days** of holiday have been taken. At the end of the year the unused days are paid out at a daily rate of **${money(dr)}**. ${leaveRule(D)}`,
        parts, ex, "hr-le4", { tier, D, k, m, taken, dr, P }, [["_full", D], ["_dpw", k], ["_months", m], ["_taken", taken], ["_daily", dr], ["_provision", P]],
        ["Scale the full-time entitlement twice: by the week and by the months.", "Round once, to the half day, then use the rounded figure."]);
    }
    // medium / hard: part-timer for a full year
    const ent = (D * k) / 5, entR = halfDay(ent);
    if (nearHalf(ent * 2, 0, 0.08)) continue;
    const taken = rng.int(1, Math.max(1, Math.floor(entR) - 1)) + (rng.next() < 0.3 ? 0.5 : 0), left = entR - taken;
    if (left < 1) continue;
    const who = rng.pick(STAFF);
    const base = `A **${who}** works **${k} days a week** for the whole year and has taken **${f(taken)} days** of holiday so far. ${leaveRule(D)}`;
    const given = [["_full", D], ["_dpw", k], ["_taken", taken]];
    const exE = `**Entitlement:** ${D} × ${k}/5 = ${f(roundTo(ent, 3))}, to the nearest half day **${f(entR)}**.`;
    const exL = `**Days left:** ${f(entR)} − ${f(taken)} = **${f(left)}**.`;
    const pE = numPart("ent", "Entitlement", "Holiday entitlement for the year, to the nearest half day (days)", entR, 1, "Full-time days scaled by days worked per week ÷ 5, then rounded to a half day.");
    const pL = numPart("left", "Days left", "Days of holiday not yet taken (use the rounded entitlement)", left, 1, "Rounded entitlement minus the days already taken.");
    if (tier === "medium") return finish(base, [pE, pL], `${exE}\n\n${exL}`, "hr-le1", { tier, D, k, taken }, given,
      ["Scale the full-time days by the share of the week worked.", "Round to a half day before subtracting."]);
    const fte = (k / 5) * 100;
    const pF = numPart("fte", "Share of full time", "Share of a full-time week worked (%)", fte, 0, "Days worked per week divided by the full-time 5, as a percentage.");
    return finish(base, [pF, pE, pL], `**Share of full time:** ${k} ÷ 5 × 100 = **${f(fte)}%**.\n\n${exE}\n\n${exL}`, "hr-le2", { tier, D, k, taken }, given,
      ["The share of full time is the scaling factor, as a percentage.", "Entitlement is the full-time days times that share."]);
  }
  return tooMany();
}

// ---------- pay-review ----------

const BANDS = ["Receptionist", "Technician", "Analyst", "Designer", "Coordinator", "Planner", "Supervisor", "Administrator"];

function genReview(rng, tier) {
  const wantBelow = rng.next() < 0.5, wantBudget = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const P = rng.int(10, 80) * 10000, r = rng.pick([2, 2.5, 3, 3.5, 4, 4.5, 5, 6]), cost = (P * r) / 100;
      const B = cost + rng.int(1, 9) * 500, staff = rng.int(12, 40);
      const parts = [
        numPart("cost", "Cost of the raise", "Extra yearly payroll cost of the raise (whole dollars)", cost, 0, "The raise percentage of the current payroll."),
        numPart("left", "Budget left", "Budget left after paying for the raise (whole dollars)", B - cost, 0, "Budget minus the cost of the raise."),
      ];
      return finish(`Payroll for **${staff} staff** is **${dollars(P)}** a year. The pay review gives everyone a raise of **${f(r)}%**, funded from a pay-review budget of **${dollars(B)}** (made-up figures).`, parts,
        `**Cost:** ${dollars(P)} × ${f(r)}% = **${dollars(cost)}**.\n\n**Left:** ${dollars(B)} − ${dollars(cost)} = **${dollars(B - cost)}**.`, "hr-pr1", { tier, P, r, B }, [["_payroll", P], ["_raise", r], ["_budget", B]],
        ["The raise is a percentage of the whole payroll.", "Compare it with the budget available."]);
    }
    const mn = rng.int(24, 45) * 1000, mx = mn + rng.int(10, 20) * 1000, mid = (mn + mx) / 2;
    if (tier === "hard") {
      const x = Math.round((mid * (0.8 + rng.next() * 0.35)) / 100) * 100, compa = x / mid;
      if (nearHalf(compa, 2, 0.1) || Math.abs(x - mn) < 0.03 * mn) continue;
      const below = x < mn;
      if (below !== wantBelow) continue;
      const job = rng.pick(BANDS);
      const parts = [
        numPart("mid", "Band midpoint", "Midpoint of the pay band ($, whole dollars)", mid, 0, "Halfway between the band minimum and maximum."),
        numPart("compa", "Compa-ratio", "Compa-ratio: pay divided by the band midpoint", compa, 2, "The employee's pay divided by the midpoint; 1 means paid exactly at the midpoint."),
        yesNo("below", "Below the minimum?", "Is the employee paid below the band minimum?", below, "Compare the pay with the band minimum, not the midpoint."),
      ];
      return finish(`A **${job}** is paid **${dollars(x)}** a year. The pay band for the job runs from a minimum of **${dollars(mn)}** to a maximum of **${dollars(mx)}** (made-up band). The compa-ratio is pay ÷ band midpoint.`, parts,
        `**Midpoint:** (${dollars(mn)} + ${dollars(mx)}) ÷ 2 = **${dollars(mid)}**.\n\n**Compa-ratio:** ${dollars(x)} ÷ ${dollars(mid)} = **${f(roundTo(compa, 2))}**.\n\n**Minimum:** ${dollars(x)} is ${below ? "below" : "not below"} ${dollars(mn)}: **${YN(below)}**.`,
        "hr-pr2", { tier, mn, mx, x }, [["_pay", x], ["_min", mn], ["_max", mx]],
        ["Midpoint from the two ends of the band.", "The compa-ratio uses the midpoint; the minimum check uses the minimum."]);
    }
    const titles = shuffled(rng, BANDS).slice(0, 4);
    const pays = titles.map(() => Math.round((mn * (0.82 + rng.next() * 0.38)) / 500) * 500);
    if (new Set(pays).size < 4) continue;
    if (tier === "expert") {
      const gaps = pays.map((x) => Math.max(0, mn - x)), cnt = gaps.filter((g) => g > 0).length, topup = sum(gaps);
      if (cnt < 1 || cnt > 3 || pays.some((x) => Math.abs(x - mn) < 0.01 * mn)) continue;
      const within = wantBudget;
      const B = Math.round((within ? topup * (1 + rng.int(8, 30) / 100) : topup * (1 - rng.int(8, 30) / 100)) / 100) * 100;
      if (Math.abs(B - topup) < 0.07 * topup || (topup <= B) !== within) continue;
      const parts = [
        numPart("mid", "Band midpoint", "Midpoint of the pay band ($, whole dollars)", mid, 0, "Halfway between the band minimum and maximum."),
        numPart("count", "Below the minimum", "How many of the four earn less than the band minimum", cnt, 0, "Compare each pay with the minimum and count those under it."),
        numPart("topup", "Top-up cost", "Yearly cost of raising each of them to the minimum ($, whole dollars)", topup, 0, "For each person under the minimum, the gap up to the minimum; add the gaps."),
        yesNo("within", "Within budget?", `The budget for fixing pay below the minimum is **${dollars(B)}** a year. Does it cover the top-ups?`, within, "Compare the total of the gaps with the budget; equal covers it."),
      ];
      const list = orList(titles.map((t, q) => `the ${t} **${dollars(pays[q])}**`));
      return finish(`Four employees in one pay band earn: ${list}. The band runs from a minimum of **${dollars(mn)}** to a maximum of **${dollars(mx)}** (made-up figures). Anyone paid below the minimum is raised to the minimum.`, parts,
        `**Midpoint:** (${dollars(mn)} + ${dollars(mx)}) ÷ 2 = **${dollars(mid)}**.\n\n**Below the minimum:** **${cnt}**.\n\n**Top-ups:** ${gaps.filter((g) => g > 0).map(dollars).join(" + ")} = **${dollars(topup)}**.\n\n**Budget:** ${dollars(topup)} ${within ? "is covered by" : "exceeds"} ${dollars(B)}: **${YN(within)}**.`,
        "hr-pr3", { tier, mn, mx, pays, B }, [["_min", mn], ["_max", mx], ...pays.map((x, q) => [`_pay${q + 1}`, x]), ["_budget", B]],
        ["Only people under the minimum need a top-up.", "Each top-up is the minimum less that person's pay."]);
    }
    // expert-plus: blanket raise, then top up whoever is still below the minimum
    const r = rng.pick([2, 2.5, 3, 3.5, 4, 4.5, 5, 6]);
    const pays2 = titles.map(() => Math.round((mn * (0.88 + rng.next() * 0.2)) / 1000) * 1000);
    if (new Set(pays2).size < 4) continue;
    const raised = pays2.map((x) => (x * (100 + r)) / 100);
    if (!raised.every((x) => isEx(x, 0)) || raised.some((x) => Math.abs(x - mn) < 0.012 * mn)) continue;
    const blanket = sum(pays2) * r / 100, gaps = raised.map((x) => Math.max(0, mn - x)), cnt = gaps.filter((g) => g > 0).length, topup = sum(gaps), total = blanket + topup;
    if (cnt < 1 || cnt > 3) continue;
    const within = wantBudget;
    const B = Math.round((within ? total * (1 + rng.int(5, 15) / 100) : total * (1 - rng.int(5, 15) / 100)) / 100) * 100;
    if (Math.abs(B - total) < 0.035 * total || (total <= B) !== within) continue;
    const parts = [
      numPart("blanket", "Blanket raise", "Yearly cost of the raise for all four ($, whole dollars)", blanket, 0, "The raise percentage of the four pays added together."),
      numPart("count", "Still below", "How many are still below the band minimum after the raise", cnt, 0, "Raise each pay first, then compare with the minimum."),
      numPart("topup", "Top-up cost", "Yearly cost of lifting those still below to the minimum ($, whole dollars)", topup, 0, "For each person still under the minimum after the raise, the gap up to the minimum."),
      yesNo("within", "Within budget?", `The total budget for this pay review is **${dollars(B)}** a year. Does it cover the raise and the top-ups together?`, within, "Add the blanket raise and the top-ups, then compare with the budget; equal covers it."),
    ];
    const list = orList(titles.map((t, q) => `the ${t} **${dollars(pays2[q])}**`));
    return finish(`Four employees in one pay band earn: ${list}. Everyone gets a raise of **${f(r)}%**. The band minimum is **${dollars(mn)}**; after the raise, anyone still below the minimum is lifted to it (made-up figures).`, parts,
      `**Blanket raise:** ${dollars(sum(pays2))} × ${f(r)}% = **${dollars(blanket)}**.\n\n**After the raise:** ${raised.map(dollars).join(", ")}; **${cnt}** still below ${dollars(mn)}.\n\n**Top-ups:** ${gaps.filter((g) => g > 0).map(dollars).join(" + ")} = **${dollars(topup)}**.\n\n**Total:** ${dollars(blanket)} + ${dollars(topup)} = ${dollars(total)}, ${within ? "within" : "over"} ${dollars(B)}: **${YN(within)}**.`,
      "hr-pr4", { tier, mn, r, pays: pays2, B }, [["_min", mn], ["_raise", r], ...pays2.map((x, q) => [`_pay${q + 1}`, x]), ["_budget", B]],
      ["The raise comes first; compare with the minimum afterwards.", "The total adds the raise for everyone and the top-ups for some."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "payroll") return genPay(rng, difficulty);
  if (subtopic === "turnover-hiring") return genTurn(rng, difficulty);
  if (subtopic === "leave-absence") return genLeave(rng, difficulty);
  if (subtopic === "pay-review") return genReview(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (pay hour by half-hour, headcount
// by summing, funnel by adding people one at a time, entitlement in half-days, absence by averaging per
// person, bands by walking from the minimum). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

// pay accumulated half an hour at a time
const payByHalfHours = (r, T, m, h) => { let g = 0; for (let t = 0; t < h * 2; t++) g += (t < T * 2 ? 0.5 : 0.5 * m) * r; return g; };
const otByHalfHours = (r, T, m, h) => { let g = 0; for (let t = T * 2; t < h * 2; t++) g += 0.5 * m * r; return g; };
// people needed, counting up from zero (a funnel stage with a percentage yield)
const keptOf = (k, pct) => (k * pct) / 100;
const needExact = (target, pct) => { let k = 0; while (keptOf(k, pct) < target - 1e-9) k++; return k; };
const halfDaysOf = (D, k, months) => Math.round((D * 2 * k * months) / 60 + 1e-9);
const gapsBelow = (pays, mn) => pays.map((x) => (x < mn ? mn - x : 0));

const ALT = {
  "hr-pay1": (p) => { const g = payByHalfHours(p.r, p.T, p.m, p.h); return { gross: g, net: g - (g * p.d) / 100 }; },
  "hr-pay2": (p) => { const g = payByHalfHours(p.r, p.T, p.m, p.h); return { ot: p.h - p.T, gross: g, net: g - (g * p.d) / 100 }; },
  "hr-pay3": (p) => { const g = payByHalfHours(p.r, p.T, p.m, p.h); return { ot: p.h - p.T, gross: g, net: g - (g * p.d) / 100, crew: g * p.k + (g * p.k * p.c) / 100 }; },
  "hr-pay4": (p) => {
    const ga = payByHalfHours(p.r, p.T, p.m, p.h), gb = payByHalfHours(p.r2, p.T, p.m, p.h2);
    const ot = otByHalfHours(p.r, p.T, p.m, p.h) + otByHalfHours(p.r2, p.T, p.m, p.h2);
    const cost = (ga + gb) * (100 + p.c) / 100;
    return { grossa: ga, grossb: gb, share: (ot / (ga + gb)) * 100, within: YN(cost <= p.B + 1e-9) };
  },
  "hr-tu1": (p) => { const avg = (p.S + p.E) / 2; return { avg, rate: (p.L / avg) * 100 }; },
  "hr-tu2": (p) => { const avg = (p.S + p.E) / 2; return { avg, rate: (p.L / avg) * 100, hires: p.L + (p.T - p.E) }; },
  "hr-tu3": (p) => {
    const avg = (p.S + p.E) / 2, H = p.L + (p.T - p.E), O = needExact(H, p.a);
    return { rate: (p.L / avg) * 100, hires: H, offers: O, cost: O * p.cpo };
  },
  "hr-tu4": (p) => {
    const H = p.L + (p.T - p.E), St = needExact(H, p.p), O = needExact(St, p.a);
    return { hires: H, starters: St, offers: O, cap: YN(O <= p.C) };
  },
  "hr-le1": (p) => { const e = halfDaysOf(p.D, p.k, 12) / 2; return { ent: e, left: e - p.taken }; },
  "hr-le2": (p) => { const e = halfDaysOf(p.D, p.k, 12) / 2; return { fte: 20 * p.k, ent: e, left: e - p.taken }; },
  "hr-le3": (p) => {
    const tot = p.days.reduce((s, x) => s + x, 0), perPerson = p.days.map((x) => (x / p.W) * 100);
    const rate = perPerson.reduce((s, x) => s + x, 0) / p.n;
    return { total: tot, rate, cost: p.c * tot, review: YN(rate > p.T) };
  },
  "hr-le4": (p) => {
    const e = halfDaysOf(p.D, p.k, p.m) / 2, left = e - p.taken, pay = left * p.dr;
    return { ent: e, left, payout: pay, prov: YN(pay <= p.P + 1e-9) };
  },
  "hr-pr1": (p) => { const cost = (p.P / 100) * p.r; return { cost, left: p.B - cost }; },
  "hr-pr2": (p) => { const mid = p.mn + (p.mx - p.mn) / 2; return { mid, compa: p.x / mid, below: YN(p.x < p.mn) }; },
  "hr-pr3": (p) => { const g = gapsBelow(p.pays, p.mn), top = g.reduce((s, x) => s + x, 0); return { mid: p.mn + (p.mx - p.mn) / 2, count: g.filter((x) => x > 0).length, topup: top, within: YN(top <= p.B + 1e-9) }; },
  "hr-pr4": (p) => {
    const raised = p.pays.map((x) => x + (x * p.r) / 100), blanket = raised.reduce((s, x, q) => s + x - p.pays[q], 0);
    const g = gapsBelow(raised, p.mn), top = g.reduce((s, x) => s + x, 0);
    return { blanket, count: g.filter((x) => x > 0).length, topup: top, within: YN(blanket + top <= p.B + 1e-9) };
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
