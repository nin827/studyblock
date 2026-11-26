// Cloud Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// each chained answer is exact (or a rounded earlier answer would not change a later one), no answer sits
// on a rounding half-step, and verdict parts are decided first and then fitted. All figures are made up,
// money is a generic $, and every rule (30-day month, headroom, zone loss, tiered transfer prices,
// backup cycle) is an exercise rule stated in each prompt, not a provider's price list.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   error-budget   SLO -> allowed downtime -> burned % -> release freeze; expert-plus: series/parallel availability
//   autoscaling    usable capacity -> instances (round up) -> monthly cost; expert: peak/off-peak fleet;
//                  expert-plus: fleet spread over 3 zones that survives losing one
//   cloud-bill     on-demand bill -> reserved break-even -> mixed fleet; expert-plus: storage (MB->GB), tiered
//                  transfer, commit-or-not verdict
//   storage-backup growth -> weeks to quota; expert: full + incrementals, retention, cost; expert-plus:
//                  restore time against a recovery-time limit

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
const tooMany = () => { throw new Error("role-cloud-engineer: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (n) => { const [a, b] = Number(n).toFixed(2).split("."); return `$${commas(a)}.${b}`; };
const p3 = (n) => { const s = Number(n).toFixed(3); return `$${s.endsWith("0") ? s.slice(0, -1) : s}`; };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`);
const MONTH = 43200;
const monthRule = "A month is **30 days** (43,200 minutes, 720 hours).";

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, [a, b]), hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- error-budget ----------

const SERVICES = ["checkout API", "login service", "search service", "payment gateway", "image upload service", "reporting dashboard"];
const SLOS = [99, 99.5, 99.7, 99.8, 99.9, 99.95];
const allowedOf = (slo) => roundTo((432 * Math.round((100 - slo) * 100)) / 100, 1);
const budgetRule = `The error budget is the downtime the target allows in a month. ${monthRule}`;

function genBudget(rng, tier) {
  const wantFreeze = rng.next() < 0.5, wantMeet = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const svc = rng.pick(SERVICES);
    if (tier === "expert-plus") {
      const lb = rng.pick([99.9, 99.95, 99.99]), s = rng.pick([95, 98, 99, 99.5]), db = rng.pick([99.5, 99.9, 99.95, 99.99]);
      const T = rng.pick([99.5, 99.7, 99.8, 99.9, 99.95]);
      const app = 1 - (1 - s / 100) ** 2, A = (lb / 100) * app * (db / 100);
      const appP = app * 100, sysP = A * 100;
      if (nearHalf(appP, 4, 0.1) || nearHalf(sysP, 3, 0.1)) continue;
      const down = MONTH * (1 - A), downR = MONTH * (1 - roundTo(sysP, 3) / 100);
      if (Math.round(down) !== Math.round(downR) || nearHalf(down, 0, 0.12) || nearHalf(downR, 0, 0.12)) continue;
      if (Math.abs(sysP - T) < 0.02 || Math.abs(roundTo(sysP, 3) - T) < 0.02) continue;
      const meet = sysP >= T;
      if (meet !== wantMeet) continue;
      const parts = [
        numPart("app", "App tier", "Availability of the two-server app tier (%)", appP, 4, "The tier is down only when both servers are down at once. Servers fail independently, so multiply the two chances of being down."),
        numPart("sys", "Whole system", "Availability of the whole request path (%)", sysP, 3, "The layers are in series: everything must be up, so multiply the three availabilities as fractions."),
        numPart("down", "Downtime a month", "Expected downtime in a month at that availability (minutes)", down, 0, "The share of time the system is down, times the minutes in the month.", true),
        yesNo("meet", "Meets the SLO?", `Does the whole system's availability meet the **${f(T)}%** target?`, meet, "Compare the system's availability with the target; at or above it meets the target."),
      ];
      const ex = `**App tier:** down only if both servers are down: (1 − ${f(s / 100)})² = ${f(roundTo((1 - s / 100) ** 2, 8))}, so the tier is up **${f(roundTo(appP, 4))}%**.\n\n**Whole system:** ${f(lb)}% × ${f(roundTo(appP, 4))}% × ${f(db)}% = **${f(roundTo(sysP, 3))}%**.\n\n**Downtime:** ${f(roundTo(100 - sysP, 5))}% of 43,200 min = ${f(roundTo(down, 2))}, about **${Math.round(down)} min**.\n\n**Verdict:** ${f(roundTo(sysP, 3))}% is ${meet ? "at or above" : "below"} ${f(T)}%: **${YN(meet)}**.`;
      return finish(`The **${svc}** is reached through three layers in series: a load balancer, an app tier of **two identical servers** and a database. A request works only if every layer is up, and the app tier is up if at least one of its two servers is up. Servers fail independently. Availability: load balancer **${f(lb)}%**, each app server **${f(s)}%**, database **${f(db)}%**. The target is **${f(T)}%**. ${monthRule}`,
        parts, ex, "ce-eb4", { tier, lb, s, db, T }, [["_lb", lb], ["_server", s], ["_db", db], ["_target", T], ["_month", MONTH]],
        ["The two servers back each other up; the layers do not.", "Work in fractions (divide each percent by 100), multiply, then change back."]);
    }
    const slo = rng.pick(SLOS), allowed = allowedOf(slo);
    const nInc = tier === "medium" ? 2 : 3;
    const maxInc = Math.min(150, Math.max(10, Math.round(allowed * 0.8)));
    const inc = Array.from({ length: nInc }, () => rng.int(2, maxInc));
    const D = sum(inc);
    if (D < 0.3 * allowed || D > 1.4 * allowed || D < 6) continue;
    const burned = (D / allowed) * 100;
    if (nearHalf(burned, 1, 0.08)) continue;
    const incTxt = inc.map(fmtDur).join(", ").replace(/, ([^,]*)$/, " and $1");
    const base = `The **${svc}** has a target of **${f(slo)}%** availability. This month it had ${nInc} outages: ${incTxt}. ${budgetRule}`;
    const given = [["_slo", slo], ...inc.map((m, k) => [`_out${k + 1}`, m])];
    const exA = `**Allowed downtime:** (100 − ${f(slo)})% of 43,200 min = **${f(allowed)} min**.`;
    const exT = `**Total downtime:** ${inc.join(" + ")} = **${D} min**.`;
    const exB = `**Burned:** ${D} ÷ ${f(allowed)} × 100 = **${f(roundTo(burned, 1))}%** of the budget.`;
    const pA = numPart("allowed", "Allowed downtime", "Downtime the target allows in a month (minutes)", allowed, 1, "The share of time the target allows to be down, times the minutes in the month.");
    const pB = numPart("burned", "Budget burned", "Share of the error budget used up this month (%)", burned, 1, "Total downtime divided by the allowed downtime, as a percentage.");
    if (tier === "medium") return finish(base, [pA, pB], `${exA}\n\n${exT}\n\n${exB}`, "ce-eb1", { tier, slo, inc }, given,
      ["Allowed downtime first, from the percentage that may be down.", "Add the outages, then compare with the allowance."]);
    const pT = numPart("total", "Total downtime", "Total downtime this month (minutes)", D, 0, "Turn any hours into minutes, then add every outage.");
    if (tier === "hard") return finish(base, [pA, pT, pB], `${exA}\n\n${exT}\n\n${exB}`, "ce-eb2", { tier, slo, inc }, given,
      ["Allowance, then the total of the outages in one unit.", "Burned share = used ÷ allowed."]);
    const F = rng.pick([50, 60, 70, 75, 80, 90]);
    if (Math.abs(burned - F) < 4) continue;
    const freeze = burned > F;
    if (freeze !== wantFreeze) continue;
    const parts = [pA, pT, pB, yesNo("freeze", "Release freeze?", `Is a release freeze in force? The rule is: no new releases once **more than ${F}%** of the month's error budget is burned.`, freeze, "Compare the share burned with the limit in the rule.")];
    return finish(`${base} Rule for this exercise: no new releases once more than **${F}%** of the month's error budget is burned.`, parts, `${exA}\n\n${exT}\n\n${exB}\n\n**Decision:** ${f(roundTo(burned, 1))}% is ${freeze ? "more than" : "not more than"} ${F}%: **${YN(freeze)}**.`,
      "ce-eb3", { tier, slo, inc, F }, [...given, ["_limit", F]],
      ["Three numbers, then a comparison with the limit.", "A freeze applies only when the share is above the limit."]);
  }
  return tooMany();
}

// ---------- autoscaling ----------

const WORKLOADS = ["image-resizing workers", "API gateway", "web front end", "checkout service", "video thumbnail jobs", "chat backend"];
const PRICES = [0.02, 0.025, 0.04, 0.05, 0.06, 0.085, 0.1, 0.12, 0.15, 0.2, 0.25];
const scaleRule = (C, u) => `One instance handles **${C} requests per second** at most, but the team keeps **${u}% utilisation** as headroom, so only ${u}% of that counts as usable. Instances are billed per whole instance-hour.`;

function genScale(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const wl = rng.pick(WORKLOADS);
    const C = rng.pick([50, 100, 120, 150, 200, 250, 300, 400]), u = rng.pick([50, 60, 70, 75, 80]);
    const usable = (C * u) / 100, p = rng.pick(PRICES);
    const R = Math.round(usable * (rng.int(2, 35) + rng.int(15, 85) / 100));
    const ratio = R / usable;
    if (!fracOk(ratio) || ratio < 3) continue;
    const n = Math.ceil(ratio);
    const base = `The **${wl}** must serve a peak of **${commas(R)} requests per second**. ${scaleRule(C, u)}`;
    const given = [["_peak", R], ["_cap", C], ["_util", u]];
    const exU = `**Usable per instance:** ${C} × ${u}% = **${f(usable)}** requests/s.`;
    const exN = `**Instances:** ${commas(R)} ÷ ${f(usable)} = ${f(roundTo(ratio, 2))}, round up to **${n}**.`;
    const pU = numPart("usable", "Usable capacity", "Requests per second one instance can count on", usable, 1, "Take the utilisation share of the instance's maximum.");
    const pN = numPart("n", "Instances", "Instances needed for the peak (round up)", n, 0, "Peak divided by usable capacity, rounded up: a part-instance cannot be run.");
    if (tier === "medium") return finish(base, [pU, pN], `${exU}\n\n${exN}`, "ce-as1", { tier, R, C, u }, given,
      ["Headroom first: only part of the maximum is usable.", "Round up to whole instances."]);
    const cost = n * p * 720;
    if (!isEx(cost, 2)) continue;
    const priceTxt = `An instance costs **${p3(p)}** per hour. ${monthRule}`;
    if (tier === "hard") return finish(`${base} ${priceTxt}`,
      [pU, pN, numPart("cost", "Monthly cost", "Cost of running that many instances all month ($)", cost, 2, "Instances times the hourly price times the hours in the month.")],
      `${exU}\n\n${exN}\n\n**Cost:** ${n} × ${p3(p)} × 720 = **${money(cost)}**.`, "ce-as2", { tier, R, C, u, p }, [...given, ["_price", p]],
      ["Usable capacity, then instances, then the bill.", "The hours in the month are stated."]);
    if (tier === "expert") {
      const P = rng.int(4, 10), m = rng.pick([2, 3, 4]);
      const R2 = Math.round(R * rng.pick([0.15, 0.2, 0.25, 0.3, 0.4])), r2 = R2 / usable;
      if (R2 < 1) continue;
      const bound = r2 <= m - 0.15;
      if (!bound && !fracOk(r2)) continue;
      const n2 = Math.max(m, Math.ceil(r2));
      if (n2 >= n) continue;
      const hours = n * P + n2 * (24 - P), auto = hours * 30 * p, flat = n * 24 * 30 * p, save = flat - auto;
      if (!isEx(auto, 2) || !isEx(save, 2)) continue;
      const parts = [
        numPart("n1", "Peak fleet", "Instances needed at the peak (round up)", n, 0, "Peak divided by usable capacity, rounded up."),
        numPart("n2", "Quiet fleet", "Instances running in the quiet hours (round up, minimum rule included)", n2, 0, "Quiet-hour load divided by usable capacity, rounded up, but never fewer than the minimum fleet."),
        numPart("auto", "Monthly cost, autoscaled", "Monthly cost with the fleet changing between peak and quiet hours ($)", auto, 2, "Instance-hours in a day (peak fleet for the peak hours, quiet fleet for the rest) times the days in the month times the price."),
        numPart("save", "Saving", "How much a month that saves against running the peak fleet all day ($)", save, 2, "The cost of the peak fleet for every hour of every day, minus the autoscaled cost."),
      ];
      const ex = `${exU}\n\n**Peak fleet:** ${commas(R)} ÷ ${f(usable)} = ${f(roundTo(ratio, 2))}, up to **${n}**.\n\n**Quiet fleet:** ${commas(R2)} ÷ ${f(usable)} = ${f(roundTo(r2, 2))}, so ${Math.ceil(r2)}${bound ? `, but the minimum is ${m}` : ""}: **${n2}** instances.\n\n**Autoscaled cost:** per day ${n} × ${P} + ${n2} × ${24 - P} = ${hours} instance-hours; × 30 × ${p3(p)} = **${money(auto)}**.\n\n**Saving:** the peak fleet all day costs ${n} × 24 × 30 × ${p3(p)} = ${money(flat)}, so ${money(flat)} − ${money(auto)} = **${money(save)}**.`;
      return finish(`The **${wl}** has a peak of **${commas(R)} requests per second** for **${P} hours** each day and **${commas(R2)} requests per second** for the other ${24 - P} hours. ${scaleRule(C, u)} The fleet never drops below **${m} instances**. An instance costs **${p3(p)}** per hour. A month is **30 days**; the fleet changes size at exactly the start and end of the peak.`,
        parts, ex, "ce-as3", { tier, R, R2, C, u, p, P, m }, [["_peak", R], ["_quiet", R2], ["_hours", P], ["_cap", C], ["_util", u], ["_min", m], ["_price", p]],
        ["Two fleet sizes: one for the peak load, one for the quiet load.", "Compare against the peak fleet running all day."]);
    }
    // expert-plus: three zones, survive the loss of one
    const half = R / (2 * usable);
    if (!fracOk(half)) continue;
    const T = 3 * Math.ceil(half);
    if (T <= n) continue;
    const extra = ((T - n) / n) * 100, costT = T * p * 720;
    if (nearHalf(extra, 1, 0.1) || !isEx(costT, 2)) continue;
    const parts = [
      numPart("n", "Plain fleet", "Instances needed for the peak with all zones healthy (round up)", n, 0, "Peak divided by usable capacity, rounded up."),
      numPart("t", "Zone-safe fleet", "Smallest total fleet (a multiple of 3) that still serves the peak after losing one zone", T, 0, "After a zone is lost, two thirds of the fleet is left. Find what each zone must hold, rounded up, then count three zones."),
      numPart("cost", "Monthly cost", "Cost of running the zone-safe fleet all month ($)", costT, 2, "Fleet size times the hourly price times the hours in the month."),
      numPart("extra", "Extra cost", "How much more the zone-safe fleet costs than the plain fleet (%)", extra, 1, "The extra instances as a percentage of the plain fleet; the price per hour cancels out."),
    ];
    const ex = `${exU}\n\n**Plain fleet:** ${commas(R)} ÷ ${f(usable)} = ${f(roundTo(ratio, 2))}, up to **${n}**.\n\n**Zone-safe fleet:** after losing a zone, 2 of the 3 zones carry the peak, which needs ${f(roundTo(ratio, 2))} instances' worth, so each zone needs ${f(roundTo(half, 2))}, up to ${Math.ceil(half)} per zone, and **${T}** in all.\n\n**Cost:** ${T} × ${p3(p)} × 720 = **${money(costT)}**.\n\n**Extra:** (${T} − ${n}) ÷ ${n} × 100 = **${f(roundTo(extra, 1))}%**.`;
    return finish(`${base} The fleet is spread **equally over 3 zones** (so the total is a multiple of 3), and the service must still serve the whole peak if **any one zone is lost**. An instance costs **${p3(p)}** per hour. ${monthRule}`,
      parts, ex, "ce-as4", { tier, R, C, u, p }, [...given, ["_price", p]],
      ["Without the zone rule it is the plain headroom sum.", "Each of the two surviving zones carries half the peak."]);
  }
  return tooMany();
}

// ---------- cloud-bill ----------

function genBill(rng, tier) {
  const wantRes = rng.next() < 0.5, wantCommit = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const p = rng.pick(PRICES), n = rng.int(2, 16);
    if (tier === "expert-plus") {
      const H = rng.int(150, 640), x = rng.pick([20, 25, 30, 35, 40]);
      const GB = rng.int(500, 9000), M = GB * 1000, s = rng.pick([0.02, 0.025, 0.03, 0.04, 0.05]);
      const E = rng.int(1200, 6000), a = rng.pick([0.08, 0.09, 0.1]), b = rng.pick([0.05, 0.06, 0.07]);
      const od = n * p * H, cm = (n * p * (100 - x) * 720) / 100, stor = GB * s, egr = 900 * a + (E - 1000) * b;
      if (![od, cm, stor, egr].every((v) => isEx(v, 2))) continue;
      if (Math.abs(od - cm) < Math.max(6, 0.06 * od)) continue;
      const commit = cm < od;
      if (commit !== wantCommit) continue;
      const total = od + stor + egr;
      const parts = [
        numPart("stor", "Storage", "Monthly storage cost ($)", stor, 2, "Change the megabytes to gigabytes first (a thousand to the gigabyte), then multiply by the price per gigabyte."),
        numPart("egr", "Transfer out", "Monthly data-transfer-out cost ($)", egr, 2, "The first block is free. Price the next block at its rate and everything after that at the lower rate."),
        numPart("total", "On-demand bill", "Total monthly bill on demand: compute, storage and transfer ($)", total, 2, "Compute is instances times price times the hours run. Add storage and transfer."),
        yesNo("commit", "Commit?", `A commitment gives **${x}% off** the hourly price but bills every instance for all 720 hours. Is the committed plan cheaper for the total bill than staying on demand?`, commit, "Storage and transfer are the same either way, so compare the two compute costs."),
      ];
      const ex = `**Storage:** ${commas(M)} MB = ${commas(GB)} GB; ${commas(GB)} × ${p3(s)} = **${money(stor)}**.\n\n**Transfer:** ${commas(E)} GB out: the first 100 free, the next 900 at ${p3(a)} = ${money(900 * a)}, the remaining ${commas(E - 1000)} at ${p3(b)} = ${money((E - 1000) * b)}; total **${money(egr)}**.\n\n**On-demand compute:** ${n} × ${p3(p)} × ${H} = ${money(od)}, so the bill is ${money(od)} + ${money(stor)} + ${money(egr)} = **${money(total)}**.\n\n**Committed compute:** ${n} × ${p3(p)} × ${100 - x}% × 720 = ${money(cm)}, ${commit ? "less" : "more"} than ${money(od)}: **${YN(commit)}**.`;
      return finish(`A team runs **${n} instances** at **${p3(p)}** per instance-hour on demand, each for **${H} hours** this month. It stores **${commas(M)} MB** at **${p3(s)}** per GB per month and sends **${commas(E)} GB** out to the internet. Transfer out is priced in blocks: the first **100 GB free**, the next **900 GB at ${p3(a)}** per GB, and everything beyond that at **${p3(b)}** per GB. 1 GB = 1000 MB.`,
        parts, ex, "ce-bl4", { tier, n, p, H, x, GB, s, E, a, b }, [["_n", n], ["_price", p], ["_hours", H], ["_mb", M], ["_srate", s], ["_out", E], ["_commit", x]],
        ["Three separate charges, then one total.", "A commitment changes only the compute line."]);
    }
    const be10 = rng.int(2500, 6500), be = be10 / 10, F = be * p;
    if (!isEx(F, 2)) continue;
    if (tier === "medium") {
      const H = rng.int(120, 720), od = n * p * H;
      if (!isEx(od, 2)) continue;
      const parts = [
        numPart("od", "On-demand bill", `Monthly bill for all ${n} instances on demand ($)`, od, 2, "Instances times the hourly price times the hours each runs."),
        numPart("be", "Break-even hours", "Hours of use per instance per month at which on-demand costs the same as one reserved instance", be, 1, "The reserved fee divided by the hourly on-demand price."),
      ];
      return finish(`A team runs **${n} identical instances**, each for **${H} hours** this month, at **${p3(p)}** per instance-hour on demand. Alternatively an instance can be reserved for a fixed **${money(F)}** a month whatever its use.`,
        parts, `**On demand:** ${n} × ${p3(p)} × ${H} = **${money(od)}**.\n\n**Break-even:** ${money(F)} ÷ ${p3(p)} = **${f(be)} hours**.`, "ce-bl1", { tier, n, p, H, F }, [["_n", n], ["_price", p], ["_hours", H], ["_fee", F]],
        ["The bill is instances times price times hours.", "At break-even the two costs are equal."]);
    }
    if (tier === "hard") {
      const H = rng.int(100, 720);
      if (Math.abs(H - be) / be < 0.08 || (H > be) !== wantRes) continue;
      const od = n * p * H, rs = n * F;
      if (!isEx(od, 2) || !isEx(rs, 2)) continue;
      const win = rs < od ? "Reserved" : "On-demand";
      const parts = [
        numPart("od", "On-demand bill", `Monthly bill for all ${n} instances on demand ($)`, od, 2, "Instances times the hourly price times the hours each runs."),
        numPart("rs", "Reserved bill", "Monthly bill if all of them are reserved ($)", rs, 2, "Instances times the fixed monthly fee."),
        pickPart(rng, "win", "Cheaper plan", "Which plan is cheaper this month?", "On-demand", "Reserved", win, "Compare the two bills."),
      ];
      return finish(`A team runs **${n} identical instances**, each for **${H} hours** this month, at **${p3(p)}** per instance-hour on demand. Reserving an instance costs a fixed **${money(F)}** a month whatever its use.`,
        parts, `**On demand:** ${n} × ${p3(p)} × ${H} = **${money(od)}**.\n\n**Reserved:** ${n} × ${money(F)} = **${money(rs)}**.\n\n**Cheaper:** ${win}.`, "ce-bl2", { tier, n, p, H, F }, [["_n", n], ["_price", p], ["_hours", H], ["_fee", F]],
        ["Two full bills, one for each plan.", "The lower bill wins."]);
    }
    // expert: mixed fleet
    const r = rng.int(1, n - 1), H = rng.int(Math.ceil(be * 1.1) + 1, 720);
    if (H > 720 || H <= be * 1.1) continue;
    const resC = r * F, odC = (n - r) * p * H, tot = resC + odC, allOd = n * p * H, saving = ((allOd - tot) / allOd) * 100;
    if (!isEx(resC, 2) || !isEx(odC, 2) || !isEx(allOd, 2) || nearHalf(saving, 1, 0.08) || saving < 3) continue;
    const parts = [
      numPart("res", "Reserved cost", `Monthly cost of the ${r} reserved instance${r === 1 ? "" : "s"} ($)`, resC, 2, "Reserved instances times the fixed monthly fee."),
      numPart("od", "On-demand cost", `Monthly cost of the other ${n - r} instance${n - r === 1 ? "" : "s"} on demand ($)`, odC, 2, "Instances times the hourly price times the hours they run."),
      numPart("total", "Total bill", "Total monthly bill ($)", tot, 2, "Add the reserved and on-demand costs."),
      numPart("save", "Saving", "Saving compared with running all of them on demand (%)", saving, 1, "The all-on-demand bill minus the total, as a percentage of the all-on-demand bill."),
    ];
    const ex = `**Reserved:** ${r} × ${money(F)} = **${money(resC)}**.\n\n**On demand:** ${n - r} × ${p3(p)} × ${H} = **${money(odC)}**.\n\n**Total:** ${money(resC)} + ${money(odC)} = **${money(tot)}**.\n\n**Saving:** all on demand would be ${n} × ${p3(p)} × ${H} = ${money(allOd)}, so (${money(allOd)} − ${money(tot)}) ÷ ${money(allOd)} × 100 = **${f(roundTo(saving, 1))}%**.`;
    return finish(`A team runs **${n} instances**, each used **${H} hours** this month. **${r}** of them are reserved at a fixed **${money(F)}** a month each, whatever the use. The other **${n - r}** are on demand at **${p3(p)}** per instance-hour.`,
      parts, ex, "ce-bl3", { tier, n, p, H, F, r }, [["_n", n], ["_reserved", r], ["_hours", H], ["_price", p], ["_fee", F]],
      ["Price the two groups separately.", "The comparison bill puts every instance on demand."]);
  }
  return tooMany();
}

// ---------- storage-backup ----------

const DATASETS = ["customer files", "log archive", "photo library", "database dump", "analytics data", "build artefacts"];

function genStore(rng, tier) {
  const wantMeet = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const ds = rng.pick(DATASETS);
    if (tier === "expert-plus") {
      const S0 = 10 * rng.int(20, 150), g = 10 * rng.int(1, 12), W = rng.int(4, 20), d = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const SW = S0 + g * W, inc = (SW * d) / 100, cycle = SW + 6 * inc;
      const T = rng.pick([50, 80, 100, 120, 125, 150, 200, 250]), hours = (cycle * 1000) / (T * 3600);
      const X = rng.pick([1, 1.5, 2, 3, 4, 6, 8, 12]);
      if (!isEx(inc, 1) || nearHalf(hours, 2, 0.12) || Math.abs(hours - X) / X < 0.1) continue;
      const meet = hours <= X;
      if (meet !== wantMeet) continue;
      const parts = [
        numPart("sw", "Size at backup", "Size of the data at the end of that week (GB)", SW, 0, "Today's size plus the weekly growth for each week."),
        numPart("cycle", "Cycle size", "Total size of the full backup plus the six incrementals (GB)", cycle, 1, "Each incremental is a percentage of the data size at the full backup. Add six of them to the full backup."),
        numPart("hours", "Restore time", "Time to restore that whole chain at the stated speed (hours)", hours, 2, "Change gigabytes to megabytes, divide by the speed for seconds, then seconds to hours."),
        yesNo("meet", "Meets the limit?", `The recovery-time limit is **${f(X)} hour${X === 1 ? "" : "s"}**. Can the whole chain be restored within it?`, meet, "Compare the restore time with the limit."),
      ];
      const ex = `**Size:** ${S0} + ${g} × ${W} = **${SW} GB**.\n\n**Cycle:** each incremental is ${d}% of ${SW} = ${f(inc)} GB; ${SW} + 6 × ${f(inc)} = **${f(cycle)} GB**.\n\n**Restore:** ${f(cycle)} GB = ${commas(f(cycle * 1000))} MB; ÷ ${T} MB/s = ${f(roundTo((cycle * 1000) / T, 1))} s; ÷ 3600 = **${f(roundTo(hours, 2))} h**.\n\n**Verdict:** ${f(roundTo(hours, 2))} h is ${meet ? "within" : "over"} ${f(X)} h: **${YN(meet)}**.`;
      return finish(`The **${ds}** hold **${S0} GB** today and grow by **${g} GB** every week. A full backup is taken at the end of week **${W}**, followed by **6 daily incrementals**, each **${d}%** of the data size at that full backup. Restoring after the worst day needs the full backup and all 6 incrementals, read at **${T} MB/s**. 1 GB = 1000 MB.`,
        parts, ex, "ce-st4", { tier, S0, g, W, d, T, X }, [["_start", S0], ["_growth", g], ["_week", W], ["_inc", d], ["_speed", T], ["_limit", X]],
        ["Grow the data first; the backups are sized from that.", "Only the units change between size and time: GB to MB, seconds to hours."]);
    }
    if (tier === "expert") {
      const S = 10 * rng.int(10, 200), d = rng.pick([2, 3, 4, 5, 6, 8, 10, 12]), R = rng.int(2, 8), rate = rng.pick([0.01, 0.02, 0.025, 0.03, 0.04, 0.05]);
      const inc = (S * d) / 100, cycle = S + 6 * inc, tot = R * cycle, cost = tot * rate;
      if (!isEx(inc, 1) || nearHalf(cost, 2, 0.1)) continue;
      const parts = [
        numPart("inc", "Incremental", "Size of one daily incremental backup (GB)", inc, 1, "A percentage of the data size."),
        numPart("cycle", "One week's backups", "Backup storage for one weekly cycle: the full backup plus 6 incrementals (GB)", cycle, 1, "Full backup plus six incrementals."),
        numPart("tot", "Retained", `Backup storage for ${R} retained weekly cycles (GB)`, tot, 1, "One cycle times the number of cycles kept."),
        numPart("cost", "Monthly cost", "Monthly cost of storing all the retained backups ($)", cost, 2, "Gigabytes times the price per gigabyte per month."),
      ];
      const ex = `**Incremental:** ${d}% of ${S} = **${f(inc)} GB**.\n\n**One cycle:** ${S} + 6 × ${f(inc)} = **${f(cycle)} GB**.\n\n**Retained:** ${R} × ${f(cycle)} = **${f(tot)} GB**.\n\n**Cost:** ${f(tot)} × ${p3(rate)} = ${f(roundTo(cost, 4))}, about **${money(roundTo(cost, 2))}**.`;
      return finish(`The **${ds}** are **${S} GB**. Backups run in weekly cycles: one full backup (the full data size) plus **6 daily incrementals**, each **${d}%** of the data size. The last **${R} weekly cycles** are kept. Backup storage costs **${p3(rate)}** per GB per month. Round the cost to the nearest cent.`,
        parts, ex, "ce-st3", { tier, S, d, R, rate }, [["_size", S], ["_inc", d], ["_cycles", R], ["_rate", rate]],
        ["One incremental first; a cycle is built from it.", "Retention just multiplies the cycle."]);
    }
    const S = 10 * rng.int(10, 200), x = rng.pick([2, 3, 4, 5, 6, 8, 10, 12]), gw = (S * x) / 100;
    const k = rng.int(4, 50), Q = S + Math.round(gw * (k + rng.int(15, 85) / 100) * 10) / 10;
    const wr = (Q - S) / gw;
    if (!fracOk(wr) || !isEx(Q, 1)) continue;
    const w = Math.ceil(wr);
    const pg = numPart("gw", "Weekly growth", "Growth each week (GB)", gw, 1, "A percentage of today's size.");
    const pw = numPart("weeks", "Weeks to quota", "Whole weeks until the data reaches or passes the quota (round up)", w, 0, "The room left divided by the weekly growth, rounded up.");
    const base = `The **${ds}** are **${S} GB** today and grow by **${x}% of today's size** every week (the same amount each week). The storage quota is **${f(Q)} GB**.`;
    const given = [["_size", S], ["_pct", x], ["_quota", Q]];
    const exG = `**Weekly growth:** ${x}% of ${S} = **${f(gw)} GB**.`;
    const exW = `**Weeks to quota:** (${f(Q)} − ${S}) ÷ ${f(gw)} = ${f(roundTo(wr, 2))}, round up to **${w} weeks**.`;
    if (tier === "medium") return finish(base, [pg, pw], `${exG}\n\n${exW}`, "ce-st1", { tier, S, x, Q }, given,
      ["Growth per week from the percentage.", "The space left, divided by a week's growth."]);
    if (w < 3) continue;
    const W = rng.int(2, w - 1), sz = S + gw * W;
    return finish(`${base} Look at the end of week **${W}**.`, [pg, numPart("sz", "Size after the weeks", `Size of the data at the end of week ${W} (GB)`, sz, 1, "Today's size plus a week's growth for every week that has passed."), pw],
      `${exG}\n\n**Size:** ${S} + ${f(gw)} × ${W} = **${f(sz)} GB**.\n\n${exW}`, "ce-st2", { tier, S, x, Q, W }, [...given, ["_week", W]],
      ["Weekly growth first, then use it twice.", "The weeks to quota count from today, not from the week you looked at."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "error-budget") return genBudget(rng, difficulty);
  if (subtopic === "autoscaling") return genScale(rng, difficulty);
  if (subtopic === "cloud-bill") return genBill(rng, difficulty);
  if (subtopic === "storage-backup") return genStore(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (allowed downtime in seconds, series
// availability from failure chances, instances by adding one at a time, zone loss by trying fleet sizes,
// tiered transfer by walking the blocks, restore time in seconds, weeks to quota by stepping week by week).
// Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

const allowedMin = (slo) => (30 * 86400 * (1 - slo / 100)) / 60; // via seconds
const fleetFor = (R, per) => { let k = 1; while (k * per < R - 1e-9) k++; return k; };
const egress = (E, a, b) => { let left = E, cost = 0; for (const [size, rate] of [[100, 0], [900, a], [Infinity, b]]) { const t = Math.min(left, size); cost += t * rate; left -= t; } return cost; };
const weeksTo = (S, gw, Q) => { let w = 0, s = S; while (s < Q - 1e-9) { s += gw; w++; } return w; };

const ALT = {
  "ce-eb1": (p) => { const al = allowedMin(p.slo), D = sum(p.inc); return { allowed: al, burned: (D * 100) / al }; },
  "ce-eb2": (p) => { const al = allowedMin(p.slo), D = sum(p.inc); return { allowed: al, total: D, burned: (D * 100) / al }; },
  "ce-eb3": (p) => { const al = allowedMin(p.slo), D = sum(p.inc), b = (D * 100) / al; return { allowed: al, total: D, burned: b, freeze: YN(b > p.F) }; },
  "ce-eb4": (p) => {
    const uApp = ((100 - p.s) / 100) ** 2, A = (p.lb / 100) * (1 - uApp) * (p.db / 100), sys = A * 100;
    return { app: (1 - uApp) * 100, sys, down: MONTH * (1 - A), meet: YN(sys >= p.T) };
  },
  "ce-as1": (p) => { const u = (p.C * p.u) / 100; return { usable: u, n: fleetFor(p.R, u) }; },
  "ce-as2": (p) => { const u = (p.C * p.u) / 100, n = fleetFor(p.R, u); return { usable: u, n, cost: n * p.p * 24 * 30 }; },
  "ce-as3": (p) => {
    const u = (p.C * p.u) / 100, n1 = fleetFor(p.R, u), n2 = Math.max(p.m, fleetFor(p.R2, u));
    const auto = 30 * p.p * (n1 * p.P + n2 * (24 - p.P)), flat = 30 * 24 * p.p * n1;
    return { n1, n2, auto, save: flat - auto };
  },
  "ce-as4": (p) => {
    const u = (p.C * p.u) / 100, n = fleetFor(p.R, u);
    let T = 3; while (((T * 2) / 3) * u < p.R - 1e-9) T += 3;
    return { n, t: T, cost: T * p.p * 720, extra: (T / n - 1) * 100 };
  },
  "ce-bl1": (p) => ({ od: p.H * p.p * p.n, be: p.F / p.p }),
  "ce-bl2": (p) => { const od = p.H * p.p * p.n, rs = p.F * p.n; return { od, rs, win: od < rs ? "On-demand" : "Reserved" }; },
  "ce-bl3": (p) => {
    const res = p.F * p.r, od = p.p * p.H * (p.n - p.r), tot = res + od;
    return { res, od, total: tot, save: (1 - tot / (p.p * p.H * p.n)) * 100 };
  },
  "ce-bl4": (p) => {
    const stor = ((p.GB * 1000) / 1000) * p.s, od = p.p * p.H * p.n, cm = p.p * 720 * p.n * (1 - p.x / 100), eg = egress(p.E, p.a, p.b);
    return { stor, egr: eg, total: od + stor + eg, commit: YN(cm < od) };
  },
  "ce-st1": (p) => { const gw = p.S * (p.x / 100); return { gw, weeks: weeksTo(p.S, gw, p.Q) }; },
  "ce-st2": (p) => { const gw = p.S * (p.x / 100); return { gw, sz: p.S + p.W * gw, weeks: weeksTo(p.S, gw, p.Q) }; },
  "ce-st3": (p) => {
    const inc = p.S * (p.d / 100), cyc = p.S + inc * 6;
    return { inc, cycle: cyc, tot: cyc * p.R, cost: cyc * p.R * p.rate };
  },
  "ce-st4": (p) => {
    const SW = p.S0 + p.W * p.g, cyc = SW + SW * (p.d / 100) * 6, secs = (cyc * 1e3) / p.T;
    return { sw: SW, cycle: cyc, hours: secs / 3600, meet: YN(secs / 3600 <= p.X) };
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
