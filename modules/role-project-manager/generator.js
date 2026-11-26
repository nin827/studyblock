// Project Manager role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls in hint code), and verify() recomputes every part by another route
// (memoised longest paths instead of path lists, brute-forced crash plans, day-by-day Date stepping,
// integer loops instead of division).
// All data are whole numbers and every chained answer is exact (whole working days, whole dollars,
// indexes that work out to 2 decimals), so a rounded earlier answer never changes a later one.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   delay-finish    activity table -> duration -> float / critical path -> a slip -> finish date in working days -> deadline call
//   crash-decision  crash options with cost per day -> cheapest cut of N days -> total cost -> budget / bonus decision
//   earned-value    % complete, AC -> EV -> CPI -> EAC -> status; expert-plus works back from a stated EAC
//   resource-plan   effort hours and team size -> working days (round up) -> finish date -> cost; expert-plus works back from a deadline

import { civilToDays, daysToCivil, weekdayOfDays, formatDMY, WEEKDAYS, MONTHS } from "../../js/lib/dates.js";
import { fmtGroup } from "../../js/lib/mathutil.js";

const TRY = 400;
const IDS = "ABCDEFGH";
const SEP = " → ";
const TIER_N = { medium: 5, hard: 6, expert: 7, "expert-plus": 7 };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const money = (n) => (n < 0 ? "−$" : "$") + fmtGroup(Math.abs(n), 0, 3);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const close = (a, b) => Math.abs(a - b) < 1e-9;
const nearInt = (x) => Math.abs(x - Math.round(x)) < 1e-6;
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tooMany = () => { throw new Error("role-project-manager: no suitable draw"); };

// ---------- part builders ----------
const numPart = (id, label, ask, answer, hint, exact = true) => {
  const p = { id, label, ask, answerType: "number", answer, tolerance: 0, hint };
  if (exact) p.fuzzyNumber = 0;
  return p;
};
const datePart = (id, label, ask, z, hint) => ({ id, label, ask: `${ask} (day, month and year)`, answerType: "date", precision: "day", answer: fmtZ(z), hint });
const yesNo = (rng, id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: rng.shuffle(["Yes", "No"]), hint });
const pick4 = (rng, id, label, ask, correct, others, hint) => {
  const wrong = rng.shuffle([...new Set(others)].filter((o) => o !== correct)).slice(0, 3);
  return { id, label, ask, answerType: "choice", answer: correct, choices: rng.shuffle([correct, ...wrong]), hint };
};
// Segmented part: the full grid of column values (at most 6 options), shuffled; the answer is one row.
function segPart(rng, id, label, ask, cols, values, answerRow, hint) {
  let rows = [[]];
  for (const vs of values) rows = rows.flatMap((r) => vs.map((v) => [...r, v]));
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: rng.shuffle(rows), answer: answerRow, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// =====================================================================
// Calendar (generation side: day numbers from dates.js; verify steps with Date)
// =====================================================================
const CAL = "Work runs **Monday to Friday** only, and the start date is **day 1**, so a job of *n* working days finishes on its *n*th working day.";
const isWork = (z, hol) => { const w = weekdayOfDays(z); return w >= 1 && w <= 5 && !hol.includes(z); };
const nextWork = (z, hol) => { while (!isWork(z, hol)) z++; return z; };
const addWork = (z, n, hol) => { let c = 1; while (c < n) { z++; if (isWork(z, hol)) c++; } return z; };
const fmtZ = (z) => formatDMY(daysToCivil(z));
const fmtWD = (z) => `${WEEKDAYS[weekdayOfDays(z)]} ${fmtZ(z)}`;
const randWorkday = (rng) => nextWork(civilToDays(rng.int(2026, 2028), rng.int(1, 12), rng.int(1, 28)), []);
function pickHolidays(rng, z0, z1, count) {
  const days = [];
  for (let z = z0 + 1; z <= z1; z++) if (isWork(z, [])) days.push(z);
  return rng.shuffle(days).slice(0, Math.min(count, days.length)).sort((a, b) => a - b);
}
const holText = (hol) => (hol.length ? `These public holidays are not worked: ${hol.map(fmtZ).join(", ")}. ` : "");
const calText = (hol) => `${CAL} ${holText(hol)}`;

// =====================================================================
// Activity networks (generation side: forward and backward pass, path lists)
// =====================================================================
const NET_RULES = "Durations are in working days. An activity starts as soon as **all** its predecessors have finished, and the whole project is counted as one run of working days from its start.";
const preText = (a) => (a.pre.length ? a.pre.join(", ") : "—");
const netTable = (acts) => ["| Activity | Duration | Predecessors |", "| --- | --- | --- |", ...acts.map((a) => `| ${a.id} | ${a.d} | ${preText(a)} |`)].join("\n");
const crashTable = (acts) => ["| Activity | Normal days | Shortest days | Crash cost per day | Predecessors |", "| --- | --- | --- | --- | --- |",
  ...acts.map((a) => `| ${a.id} | ${a.d} | ${a.c ? a.lim : "—"} | ${a.c ? money(a.c) : "—"} | ${preText(a)} |`)].join("\n");
const durGiven = (acts) => acts.map((a) => [`_d${a.id}`, a.d]);

function buildNet(rng, n) {
  const acts = [];
  const nSrc = n >= 6 ? rng.int(1, 3) : rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    let pre = [];
    if (i >= nSrc) pre = rng.shuffle(acts.map((a) => a.id)).slice(0, Math.min(rng.int(1, 2), acts.length));
    acts.push({ id: IDS[i], d: rng.int(2, 9), pre });
  }
  const last = acts[n - 1];
  for (const a of acts.slice(0, -1)) if (!acts.some((x) => x.pre.includes(a.id))) last.pre.push(a.id);
  const by = Object.fromEntries(acts.map((a) => [a.id, a]));
  const anc = (p, q) => by[q].pre.some((r) => r === p || anc(p, r));
  for (const a of acts) a.pre = [...new Set(a.pre)].filter((p) => !a.pre.some((q) => q !== p && anc(p, q))).sort();
  return acts;
}
function analyse(acts) {
  const ES = {}, EF = {}, LS = {}, LF = {}, succ = {};
  acts.forEach((a) => (succ[a.id] = []));
  acts.forEach((a) => a.pre.forEach((p) => succ[p].push(a.id)));
  for (const a of acts) {
    ES[a.id] = a.pre.length ? Math.max(...a.pre.map((p) => EF[p])) : 0;
    EF[a.id] = ES[a.id] + a.d;
  }
  const D = Math.max(...acts.map((a) => EF[a.id]));
  for (const a of [...acts].reverse()) {
    LF[a.id] = succ[a.id].length ? Math.min(...succ[a.id].map((s) => LS[s])) : D;
    LS[a.id] = LF[a.id] - a.d;
  }
  const TF = Object.fromEntries(acts.map((a) => [a.id, LS[a.id] - ES[a.id]]));
  const paths = [];
  const walk = (id, trail) => {
    const p = [...trail, id];
    if (!succ[id].length) paths.push(p);
    else succ[id].forEach((s) => walk(s, p));
  };
  acts.filter((a) => !a.pre.length).forEach((a) => walk(a.id, []));
  const dur = Object.fromEntries(acts.map((a) => [a.id, a.d]));
  const lens = paths.map((p) => sum(p.map((id) => dur[id])));
  const critPaths = paths.filter((_, i) => lens[i] === D);
  const crit = acts.filter((a) => TF[a.id] === 0).map((a) => a.id).sort((x, y) => ES[x] - ES[y]);
  return { ES, EF, LS, LF, TF, D, paths, lens, dur, critPaths, crit, succ };
}
function drawNet(rng, n, ok) {
  for (let t = 0; t < TRY; t++) {
    const acts = buildNet(rng, n);
    const an = analyse(acts);
    if (an.critPaths.length !== 1 || an.crit.length < 2 || an.crit.length >= n || an.paths.length < 3) continue;
    if (ok && !ok(an, acts)) continue;
    return { acts, an };
  }
  return tooMany();
}
const pathStr = (p) => p.join(SEP);
const pathLines = (an) => an.paths.map((p, i) => `- ${pathStr(p)} = ${p.map((id) => an.dur[id]).join(" + ")} = ${an.lens[i]}${an.lens[i] === an.D ? " (longest)" : ""}`).join("\n");
const passLines = (an, acts) => acts.map((a) => `- ${a.id}: earliest start ${an.ES[a.id]}, latest start ${an.LS[a.id]}, float ${an.TF[a.id]}`).join("\n");

// ---------- crashing (generation: greedy cheapest set that hits every critical path) ----------
function crashNet(rng, n) {
  const { acts: base, an } = drawNet(rng, n);
  const acts = base.map((a) => {
    const crashable = rng.next() < 0.8 && a.d >= 2;
    const room = crashable ? rng.int(1, Math.min(3, a.d - 1)) : 0;
    return { ...a, lim: a.d - room, c: crashable ? 50 * rng.int(4, 30) : 0 };
  });
  return { acts, an };
}
function greedyCrash(acts, K) {
  const cur = acts.map((a) => ({ ...a }));
  const cum = [], steps = [];
  let total = 0;
  for (let s = 0; s < K; s++) {
    const an = analyse(cur);
    const open = cur.filter((a) => a.c && a.d > a.lim);
    let best = null;
    for (let m = 1; m < 1 << open.length; m++) {
      const set = open.filter((_, i) => m & (1 << i));
      if (!an.critPaths.every((p) => set.some((a) => p.includes(a.id)))) continue;
      const cost = sum(set.map((a) => a.c));
      if (!best || cost < best.cost) best = { set, cost };
    }
    if (!best) return { cum, steps };
    best.set.forEach((a) => (a.d -= 1));
    total += best.cost;
    cum.push(total);
    steps.push({ ids: best.set.map((a) => a.id), cost: best.cost });
  }
  return { cum, steps };
}

// =====================================================================
// delay-finish
// =====================================================================
function genDelay(rng, tier) {
  const n = TIER_N[tier];
  const plus = tier === "expert-plus";
  for (let t = 0; t < TRY; t++) {
    const { acts, an } = drawNet(rng, n);
    const non = acts.filter((a) => an.TF[a.id] > 0).map((a) => a.id);
    if (!non.length) continue;
    const D = an.D;
    const S = randWorkday(rng);
    const head = `${NET_RULES}\n\n${netTable(acts)}\n\n`;
    const durG = durGiven(acts);

    if (tier === "medium") {
      const fin = addWork(S, D, []);
      return finish(
        `A small project starts on **${fmtWD(S)}**. ${CAL}\n\n${head}Find the shortest project duration and the date it finishes.`,
        [
          numPart("duration", "Duration", "Shortest project duration (working days)", D, "Add the durations along each route from a start to the end; the longest route sets the duration."),
          datePart("finish", "Finish date", "Finish date", fin, `Count ${D} working days with the start date as day 1, skipping Saturdays and Sundays.`),
        ],
        `Routes:\n\n${pathLines(an)}\n\nDuration **${D}** working days. Day 1 is ${fmtWD(S)}; the ${ord(D)} working day is **${fmtWD(fin)}**.`,
        "pm-delay", { tier, acts, S, hol: [] }, durG,
        ["Find the longest route first, then turn working days into a date.", "Skip weekends when you count."],
      );
    }

    if (tier === "hard") {
      const x = rng.pick(non), f = an.TF[x];
      const k = rng.next() < 0.5 ? rng.int(1, f) : f + rng.int(1, 3);
      const nd = D + Math.max(0, k - f);
      const hol = pickHolidays(rng, S, addWork(S, nd + 3, []), rng.int(1, 2));
      const fin = addWork(S, nd, hol);
      return finish(
        `A project starts on **${fmtWD(S)}**. ${calText(hol)}\n\n${head}Activity **${x}** takes **${plural(k, "working day")}** longer than planned. Find the shortest planned duration, the total float of ${x} (the days it can slip without delaying the project), and the project's new finish date.`,
        [
          numPart("duration", "Planned duration", "Shortest planned duration (working days)", D, "The longest route through the network."),
          numPart("float", `Float of ${x}`, `Total float of ${x} (working days)`, f, `Float = the project duration minus the longest route that runs through ${x}.`),
          datePart("new-finish", "New finish", "New finish date", fin, `A slip only moves the finish by the part that is more than the float. Then count the new duration in working days, skipping weekends and the listed holidays.`),
        ],
        `Routes:\n\n${pathLines(an)}\n\nDuration **${D}**.\n\n${passLines(an, acts)}\n\nFloat of ${x} = **${f}**. A slip of ${k} ${k > f ? `uses the ${f} days of float and delays the project by ${k - f}` : "fits inside the float, so the finish does not move"}: new duration ${nd}. The ${ord(nd)} working day from ${fmtWD(S)}${hol.length ? " (skipping the holidays)" : ""} is **${fmtWD(fin)}**.`,
        "pm-delay", { tier, acts, S, hol, x, k }, durG.concat([["_k", k]]),
        ["Find the longest route, then how much shorter the routes through the slipping activity are.", "Slip beyond the float delays the project day for day."],
      );
    }

    if (tier === "expert") {
      const x = rng.pick(non), f = an.TF[x];
      const k = rng.next() < 0.3 ? rng.int(1, f) : f + rng.int(1, 4);
      const nd = D + Math.max(0, k - f);
      const hol = pickHolidays(rng, S, addWork(S, nd + 3, []), rng.int(1, 3));
      const fin = addWork(S, nd, hol);
      const cp = pathStr(an.critPaths[0]);
      return finish(
        `A project starts on **${fmtWD(S)}**. ${calText(hol)}\n\n${head}Activity **${x}** takes **${plural(k, "working day")}** longer than planned (everything else as planned). Find the planned duration, the critical path, the new project duration and the new finish date.`,
        [
          numPart("duration", "Planned duration", "Planned project duration (working days)", D, "The longest route through the network."),
          pick4(rng, "path", "Critical path", "Which route is the critical path?", cp, an.paths.map(pathStr), "It is the route whose durations add up to the project duration."),
          numPart("new-duration", "New duration", `New project duration (working days)`, nd, `Float of ${x} is the project duration minus the longest route through ${x}; only slip beyond that adds to the project.`),
          datePart("new-finish", "New finish", "New finish date", fin, "Count the new duration in working days from the start date (day 1), skipping weekends and the listed holidays."),
        ],
        `Routes:\n\n${pathLines(an)}\n\nPlanned duration **${D}**, critical path **${cp}**. ${x} has float ${f}, so a slip of ${k} adds ${Math.max(0, k - f)}: new duration **${nd}**. The ${ord(nd)} working day from ${fmtWD(S)}${hol.length ? " (skipping the holidays)" : ""} is **${fmtWD(fin)}**.`,
        "pm-delay", { tier, acts, S, hol, x, k }, durG.concat([["_k", k]]),
        ["Longest route first. The routes that are shorter have float.", "A slip no bigger than the float changes nothing; a bigger one moves the finish by the excess."],
      );
    }

    // expert-plus: deadline, latest start, new finish, days late, cheapest response
    const outcome = rng.pick(["met", "pay", "crash"]);
    const g = rng.int(0, 3);
    let x, k, L = 0;
    if (outcome === "met") {
      const cand = acts.filter((a) => an.TF[a.id] + g >= 1).map((a) => a.id);
      if (!cand.length) continue;
      x = rng.pick(cand);
      k = rng.int(1, an.TF[x] + g);
    } else {
      x = rng.pick(acts.map((a) => a.id));
      L = rng.int(1, 4);
      k = an.TF[x] + g + L;
    }
    if (k > 14) continue;
    const f = an.TF[x];
    const nd = D + Math.max(0, k - f);
    const p = 100 * rng.int(3, 9);
    const c = outcome === "pay" ? p + 100 * rng.int(1, 3) : outcome === "crash" ? p - 100 * rng.int(1, 2) : 100 * rng.int(3, 9);
    if (c <= 0 || (outcome === "met" && c === p)) continue;
    const hol = pickHolidays(rng, S, addWork(S, D + g + L + 6, []), rng.int(1, 3));
    const dead = addWork(S, D + g, hol);
    const newFin = addWork(S, nd, hol);
    const latest = addWork(S, g + 1, hol);
    const late = Math.max(0, nd - D - g);
    const action = late === 0 ? "No action" : p < c ? "Pay penalty" : "Crash " + x;
    const answerRow = [late === 0 ? "Met" : "Missed", action];
    return finish(
      `A project is planned to start on **${fmtWD(S)}**. ${calText(hol)}\n\n${head}The contract deadline is the **end of ${fmtWD(dead)}**, and each working day of lateness costs a penalty of **${money(p)}**. Activity **${x}** takes **${plural(k, "working day")}** longer than planned. As an alternative, ${x} can be crashed back to save days at **${money(c)} per day saved** (up to the ${k} days lost). Find the latest start date that would still meet the deadline for the plan as drawn, the new finish date, the working days late (0 if none), and the outcome with the cheapest response.`,
      [
        datePart("latest-start", "Latest start", "Latest start date that still meets the deadline", latest, "Work backwards from the deadline: it is the last working day of the planned duration, so step back one day fewer than the duration."),
        datePart("new-finish", "New finish", "New finish date after the slip", newFin, `New duration = planned duration plus the part of the slip that is more than the float of ${x}. Count from the planned start.`),
        numPart("late-days", "Days late", "Working days late (0 if the deadline is met)", late, "Count the working days after the deadline up to the new finish date."),
        segPart(rng, "action", "Outcome", "Deadline | Cheapest response", ["Deadline", "Cheapest response"], [["Met", "Missed"], ["No action", "Pay penalty", "Crash " + x]], answerRow,
          "If the deadline is met nothing needs doing. Otherwise compare the penalty per day with the crash cost per day."),
      ],
      `Routes:\n\n${pathLines(an)}\n\nPlanned duration **${D}**. The deadline is working day ${D + g} from the start, so the latest start is the ${ord(g + 1)} working day: **${fmtWD(latest)}**.\n\nFloat of ${x} = ${f}. A slip of ${k} gives new duration ${nd}, finishing **${fmtWD(newFin)}**, which is **${late}** working day(s) late.\n\n${late === 0 ? "The deadline is met, so **no action**." : `Late by ${late}: the penalty is ${late} × ${money(p)} = ${money(late * p)}; crashing ${x} by ${late} costs ${late} × ${money(c)} = ${money(late * c)}. The cheaper response is **${action.toLowerCase()}**.`}`,
      "pm-delay", { tier, acts, S, hol, x, k, g, p, c }, [["_k", k], ["_p", p], ["_c", c]],
      ["Longest route first; then how far the slip pushes the project past its float.", "Dates: count working days only, and keep the holidays in mind."],
    );
  }
  return tooMany();
}

// =====================================================================
// crash-decision
// =====================================================================
function genCrash(rng, tier) {
  const n = tier === "medium" ? 5 : 6;
  for (let t = 0; t < TRY; t++) {
    const { acts, an } = crashNet(rng, n);
    const D = an.D;
    const K = greedyCrash(acts, 4);
    const need = tier === "medium" ? 1 : tier === "expert-plus" ? 3 : 3;
    if (K.cum.length < need) continue;
    let ok = true;
    for (let k = 1; k <= K.cum.length; k++) if (bruteCrash(acts, D - k) !== K.cum[k - 1]) ok = false;
    if (!ok) continue;
    const cum = K.cum;
    const N = tier === "medium" ? 1 : rng.int(2, Math.min(3, cum.length));
    const table = crashTable(acts);
    const costG = acts.filter((a) => a.c).map((a) => [`_c${a.id}`, a.c]);
    const head = `${NET_RULES} Any activity can be **crashed** (shortened) by whole days down to its shortest time, at the crash cost shown for each day saved (— means it cannot be crashed). Crashing never changes the predecessors.\n\n${table}\n\n`;
    const stepText = K.steps.slice(0, N).map((s, i) => `- Day ${i + 1}: crash ${s.ids.join(" and ")} (${money(s.cost)}), running total ${money(cum[i])}.`).join("\n");
    const base = { tier, acts, D, N };
    if (tier === "medium") {
      return finish(
        `${head}Find the shortest project duration and the cheapest extra cost to cut it by **1 day**.`,
        [
          numPart("duration", "Duration", "Shortest project duration (days)", D, "The longest route through the network."),
          numPart("one", "Cut by 1 day", "Cheapest extra cost to cut the project by 1 day ($)", cum[0], "Only activities on the critical path help, and each must still have room to shorten. Take the cheapest.", false),
        ],
        `Routes:\n\n${pathLines(an)}\n\nDuration **${D}**. Critical path ${pathStr(an.critPaths[0])}.\n\n${stepText}\n\nCheapest cut by 1 day: **${money(cum[0])}**.`,
        "pm-crash", base, costG.slice(0, 8), ["Find the critical path first.", "Cut the cheapest activity on it that can still be shortened."],
      );
    }
    const T0 = 1000 * rng.int(40, 120);
    if (tier === "hard") {
      return finish(
        `${head}The direct cost of the project at normal durations is **${money(T0)}**. Find the shortest project duration, the cheapest extra cost to cut it by **${N} days**, and the total direct cost after crashing.`,
        [
          numPart("duration", "Duration", "Shortest project duration (days)", D, "The longest route through the network."),
          numPart("cut", `Cut by ${N} days`, `Cheapest extra cost to cut the project by ${N} days ($)`, cum[N - 1], "Cut one day at a time and re-check the critical path after each day: if two routes become critical, both must be shortened.", false),
          numPart("total", "Total direct cost", "Total direct cost after crashing ($)", T0 + cum[N - 1], "Normal direct cost plus the extra crash cost.", false),
        ],
        `Routes:\n\n${pathLines(an)}\n\nDuration **${D}**.\n\n${stepText}\n\nExtra cost for ${N} days **${money(cum[N - 1])}**; total direct cost ${money(T0)} + ${money(cum[N - 1])} = **${money(T0 + cum[N - 1])}**.`,
        "pm-crash", { ...base, T0 }, [["_n", N], ["_t0", T0], ...costG].slice(0, 8),
        ["Longest route first; crash only on the critical path.", "After each day saved a different route may become critical as well."],
      );
    }
    const perDay = cum[N - 1] / N;
    const savingPositive = rng.next() < 0.5;
    const rate = (lo, hi) => 50 * Math.max(1, Math.round((perDay * rng.pick([lo, hi])) / 50));
    if (tier === "expert") {
      const I = savingPositive ? rate(1.15, 1.6) : rate(0.4, 0.8);
      const net = I * N - cum[N - 1];
      if (net === 0 || (net > 0) !== savingPositive) continue;
      const cp = pathStr(an.critPaths[0]);
      return finish(
        `${head}Overheads cost **${money(I)}** for every day the project runs. Find the shortest duration, the critical path, the cheapest extra cost to cut **${N} days**, and the net saving from doing so (the overheads saved minus the crash cost).`,
        [
          numPart("duration", "Duration", "Shortest project duration (days)", D, "The longest route through the network."),
          pick4(rng, "path", "Critical path", "Which route is the critical path?", cp, an.paths.map(pathStr), "It is the route whose durations add up to the project duration."),
          numPart("cut", `Cut by ${N} days`, `Cheapest extra cost to cut the project by ${N} days ($)`, cum[N - 1], "Cut one day at a time, re-checking which routes are critical after every day.", false),
          numPart("net", "Net saving", "Net saving ($, negative if crashing costs more than it saves)", net, `Overheads saved = ${N} days × the daily overhead; subtract the crash cost.`, false),
        ],
        `Routes:\n\n${pathLines(an)}\n\nDuration **${D}**, critical path **${cp}**.\n\n${stepText}\n\nCrash cost **${money(cum[N - 1])}**. Overheads saved ${N} × ${money(I)} = ${money(I * N)}. Net saving = ${money(I * N)} − ${money(cum[N - 1])} = **${money(net)}**.`,
        "pm-crash", { ...base, I }, [["_n", N], ["_i", I], ...costG].slice(0, 8),
        ["Longest route first; crash the cheapest set of activities that cuts every critical route.", "Net saving compares the overheads saved with the extra crash cost."],
      );
    }
    // expert-plus: budget (working backwards) and a bonus decision
    const m = rng.int(1, cum.length - 1);
    const stepCost = cum[m] - cum[m - 1];
    const B = cum[m - 1] + 50 * rng.int(0, stepCost / 50 - 1);
    const b = savingPositive ? rate(1.15, 1.6) : rate(0.4, 0.8);
    const worth = b * N > cum[N - 1];
    if (b * N === cum[N - 1] || worth !== savingPositive) continue;
    return finish(
      `${head}The project can spend at most **${money(B)}** on crashing. The client pays a bonus of **${money(b)}** for every day the project is shortened. Find the shortest project duration, the cheapest extra cost to cut **${N} days**, the **most days** that can be cut within the budget, and whether cutting ${N} days earns more in bonus than it costs.`,
      [
        numPart("duration", "Duration", "Shortest project duration (days)", D, "The longest route through the network."),
        numPart("cut", `Cut by ${N} days`, `Cheapest extra cost to cut the project by ${N} days ($)`, cum[N - 1], "One day at a time: after each day, check which routes are now critical.", false),
        numPart("max-days", "Days within budget", "Most days that can be cut within the budget", m, "List the running total after 1 day, 2 days, 3 days… and stop before it passes the budget."),
        yesNo(rng, "worth", "Worth it?", `Does cutting ${N} days earn more in bonus than it costs to crash?`, worth, `Bonus = ${N} days × the bonus per day. Compare with the crash cost for ${N} days.`),
      ],
      `Routes:\n\n${pathLines(an)}\n\nDuration **${D}**.\n\n${K.steps.map((s, i) => `- Day ${i + 1}: crash ${s.ids.join(" and ")} (${money(s.cost)}), running total ${money(cum[i])}.`).join("\n")}\n\nCutting ${N} days costs **${money(cum[N - 1])}**. The budget ${money(B)} covers **${m}** day(s) (running total ${money(cum[m - 1])}${cum[m] ? `; the next day would bring it to ${money(cum[m])}` : ""}). Bonus ${N} × ${money(b)} = ${money(b * N)} ${worth ? "is more than" : "is less than"} ${money(cum[N - 1])}: **${worth ? "Yes" : "No"}**.`,
      "pm-crash", { ...base, B, b }, [["_n", N], ["_budget", B], ["_bonus", b], ...costG].slice(0, 8),
      ["Cut one day at a time; running totals are what the budget is compared with.", "For the decision, compare total bonus with total crash cost."],
    );
  }
  return tooMany();
}

// =====================================================================
// earned-value
// =====================================================================
const IDX = [0.5, 0.6, 0.75, 0.8, 0.9, 1.2, 1.25, 1.5];
const r2ok = (x) => Math.abs(Math.round(x * 100) / 100 - x) < 1e-9;
// showPlanned: the share planned is stated, so keep the schedule position realistic (SPI 0.6 to 1.5).
function drawEV(rng, needSpi, cpis = IDX, showPlanned = false) {
  for (let t = 0; t < 2000; t++) {
    const bac = 10000 * rng.int(4, 20);
    const planned = 5 * rng.int(4, 16), actual = 5 * rng.int(3, 17);
    const cpi = rng.pick(cpis);
    if (planned === actual) continue;
    if (showPlanned && (actual < 0.6 * planned || actual > 1.5 * planned)) continue;
    const ev = (bac * actual) / 100;
    if (!nearInt(ev / cpi) || !nearInt(bac / cpi)) continue;
    if (needSpi && !r2ok(actual / planned)) continue;
    return { bac, planned, actual, cpi, ev, ac: Math.round(ev / cpi), eac: Math.round(bac / cpi), spi: actual / planned };
  }
  return tooMany();
}
const EV_TERMS = "**BAC** is the total budget, **EV** (earned value) = BAC × the share of work done, **AC** is the actual cost so far, **CPI** = EV ÷ AC and **EAC** = BAC ÷ CPI. Every index works out exactly to 2 decimal places.";
const statusHint = "Compare the share done with the share planned for the schedule, and the CPI with 1 for the cost.";

function genEV(rng, tier) {
  if (tier === "expert-plus") {
    const outcome = rng.pick(["esc", "esc", "cont-over", "cont-under"]);
    const d = drawEV(rng, true, outcome === "cont-under" ? IDX.filter((v) => v > 1) : IDX.filter((v) => v < 1), true);
    const over = d.eac - d.bac;
    let T;
    if (outcome === "esc") T = 1000 * Math.floor((over * rng.pick([0.5, 0.6, 0.7, 0.8])) / 1000);
    else if (outcome === "cont-over") T = 1000 * Math.ceil((over * rng.pick([1.2, 1.3, 1.5, 2])) / 1000);
    else T = 1000 * rng.int(3, 10);
    if (T < 1000 || (outcome === "esc" && over < 4000)) return genEV(rng, tier);
    const esc = over > T;
    return finish(
      `A project has a budget BAC of **${money(d.bac)}**. The forecast cost at completion is **EAC = ${money(d.eac)}**. **${d.actual}%** of the work is done, and **${d.planned}%** was planned to be done by now. ${EV_TERMS} Also SPI = share done ÷ share planned. Work back to the CPI, the actual cost so far and the SPI. The rule is to **escalate** to the sponsor if the forecast overrun (EAC − BAC) is more than **${money(T)}**: should this project be escalated?`,
      [
        numPart("cpi", "CPI", "CPI (2 decimal places)", d.cpi, "EAC = BAC ÷ CPI, so CPI = BAC ÷ EAC."),
        numPart("ac", "Actual cost", "Actual cost so far ($)", d.ac, "EV = BAC × share done; AC = EV ÷ CPI.", false),
        numPart("spi", "SPI", "SPI (2 decimal places)", d.spi, "Share done divided by share planned."),
        yesNo(rng, "escalate", "Escalate?", `Should the project be escalated (overrun more than ${money(T)})?`, esc, "Work out EAC − BAC (negative means a forecast underspend) and compare with the limit."),
      ],
      `CPI = BAC ÷ EAC = ${d.bac} ÷ ${d.eac} = **${d.cpi}**. EV = ${money(d.bac)} × ${d.actual}% = ${money(d.ev)}, so AC = ${d.ev} ÷ ${d.cpi} = **${money(d.ac)}**. SPI = ${d.actual} ÷ ${d.planned} = **${d.spi}**. Forecast overrun = ${money(d.eac)} − ${money(d.bac)} = ${money(over)}, ${esc ? "more than" : "not more than"} ${money(T)}: **${esc ? "Yes" : "No"}**.`,
      "pm-ev", { tier, d, T }, [["_bac", d.bac], ["_eac", d.eac], ["_done", d.actual], ["_planned", d.planned], ["_limit", T]],
      ["Start from EAC and BAC to get the CPI.", "Then the earned value from the share done, and the actual cost from EV and CPI."],
    );
  }
  // expert: one coin decides over or under budget (balanced cost verdict)
  const overCoin = tier === "expert" ? rng.next() < 0.5 : null;
  const d = drawEV(rng, false, tier === "expert" ? IDX.filter((v) => (v < 1) === overCoin) : IDX, tier === "expert");
  const given = [["_bac", d.bac], ["_done", d.actual], ["_ac", d.ac]];
  const ex = `EV = ${money(d.bac)} × ${d.actual}% = **${money(d.ev)}**. CPI = ${d.ev} ÷ ${d.ac} = **${d.cpi}**.`;
  if (tier === "medium") {
    return finish(
      `A project has BAC = **${money(d.bac)}**. **${d.actual}%** of the work is done and **${money(d.ac)}** has been spent. ${EV_TERMS} Find the earned value and the CPI.`,
      [numPart("ev", "EV", "Earned value ($)", d.ev, "Budget × the share of work done.", false), numPart("cpi", "CPI", "CPI (2 decimal places)", d.cpi, "Earned value ÷ actual cost.")],
      ex, "pm-ev", { tier, d }, given, ["EV is what the finished work was budgeted to cost.", "CPI compares the value earned with the money spent."],
    );
  }
  const eacParts = [numPart("ev", "EV", "Earned value ($)", d.ev, "Budget × the share of work done.", false), numPart("cpi", "CPI", "CPI (2 decimal places)", d.cpi, "Earned value ÷ actual cost."),
    numPart("eac", "EAC", "Forecast cost at completion, EAC ($)", d.eac, "Divide the budget by the CPI (cost efficiency stays the same).", false)];
  const exE = `${ex} EAC = ${d.bac} ÷ ${d.cpi} = **${money(d.eac)}**.`;
  if (tier === "hard") {
    return finish(
      `A project has BAC = **${money(d.bac)}**. **${d.actual}%** of the work is done and **${money(d.ac)}** has been spent. ${EV_TERMS} Find the earned value, the CPI and the forecast cost at completion.`,
      eacParts, exE, "pm-ev", { tier, d }, given, ["Earned value first, then the CPI.", "The forecast assumes the same efficiency to the end."],
    );
  }
  const ahead = d.actual > d.planned, under = d.cpi > 1;
  const status = [ahead ? "Ahead of schedule" : "Behind schedule", under ? "Under budget" : "Over budget"];
  return finish(
    `A project has BAC = **${money(d.bac)}**. By now **${d.planned}%** of the work was planned to be done, but **${d.actual}%** is done, and **${money(d.ac)}** has been spent. ${EV_TERMS} Find the earned value, the CPI, the forecast cost at completion, and the status: the schedule position (share done against share planned) and the cost position (CPI against 1).`,
    [...eacParts, segPart(rng, "status", "Status", "Schedule | Cost", ["Schedule", "Cost"], [["Ahead of schedule", "Behind schedule"], ["Under budget", "Over budget"]], status, statusHint)],
    `${exE} ${d.actual}% done against ${d.planned}% planned is **${status[0].toLowerCase()}**; CPI ${d.cpi} ${under ? "is above 1" : "is below 1"}, so **${status[1].toLowerCase()}**.`,
    "pm-ev", { tier, d }, given.concat([["_planned", d.planned]]), ["Earned value, then CPI, then the forecast.", statusHint],
  );
}

// =====================================================================
// resource-plan
// =====================================================================
const RES_RULES = (H) => `Each person does **${H} productive hours** per working day, a team works the whole day, and a task takes **whole working days** (round up).`;
function effort(rng, T, H, days) {
  return T * H * (days - 1) + rng.int(1, T * H - 1);
}
const daysFor = (E, T, H) => Math.floor((E + T * H - 1) / (T * H));
function genResource(rng, tier) {
  const H = rng.pick([6, 8]);
  const S = randWorkday(rng);
  const TA = rng.int(2, 6), dA = rng.int(3, 12), EA = effort(rng, TA, H, dA);
  const taskA = `Task A needs **${EA} hours** of effort from a team of **${TA} people**.`;
  const bStart = (finA, hol) => nextWork(finA + 1, hol);
  if (tier === "medium") {
    const fin = addWork(S, dA, []);
    return finish(
      `${taskA} ${RES_RULES(H)} ${CAL} It starts on **${fmtWD(S)}**. How many working days does it take, and on what date does it finish?`,
      [numPart("days", "Working days", "Working days for Task A", dA, `Hours of work per day = people × ${H}. Divide the effort by that and round up.`), datePart("finish", "Finish date", "Finish date of Task A", fin, "Count that many working days with the start date as day 1, skipping weekends.")],
      `Per day the team does ${TA} × ${H} = ${TA * H} hours. ${EA} ÷ ${TA * H} = ${(EA / (TA * H)).toFixed(2)}, rounded **up** to **${dA}** working days. The ${ord(dA)} working day from ${fmtWD(S)} is **${fmtWD(fin)}**.`,
      "pm-res", { tier, H, S, hol: [], TA, EA }, [["_hours", EA], ["_people", TA], ["_perday", H]],
      ["How many hours does the team do in one working day?", "Round up: a part day still takes a whole day."],
    );
  }
  const TB = rng.int(2, 6), dB = rng.int(3, 12), EB = effort(rng, TB, H, dB);
  const taskB = `Task B needs **${EB} hours** from a team of **${TB} people** and starts on the first working day after Task A finishes.`;
  const finA0 = addWork(S, dA, []);
  const hol = pickHolidays(rng, S, addWork(finA0 + 1, dB + 2, []), rng.int(1, tier === "hard" ? 2 : 3));
  const finA = addWork(S, dA, hol), stB = bStart(finA, hol), finB = addWork(stB, dB, hol);
  const common = `${RES_RULES(H)} ${calText(hol)}Task A starts on **${fmtWD(S)}**. ${taskA} ${taskB}`;
  const given = [["_hoursA", EA], ["_peopleA", TA], ["_hoursB", EB], ["_peopleB", TB], ["_perday", H]];
  const exAB = `Task A: ${EA} ÷ (${TA} × ${H}) = ${(EA / (TA * H)).toFixed(2)} → **${dA}** days, finishing ${fmtWD(finA)}. Task B starts ${fmtWD(stB)}: ${EB} ÷ (${TB} × ${H}) = ${(EB / (TB * H)).toFixed(2)} → **${dB}** days, finishing **${fmtWD(finB)}**.`;
  const daysA = numPart("days-a", "Days for A", "Working days for Task A", dA, `People × ${H} hours per day; divide the effort by it and round up.`);
  const daysB = numPart("days-b", "Days for B", "Working days for Task B", dB, "Same method with Task B's team.");
  const finBp = datePart("finish-b", "Finish of B", "Finish date of Task B", finB, "Find Task A's finish date, step to the next working day for B's start, then count B's days (day 1 is the start), skipping weekends and holidays.");
  if (tier === "hard") {
    return finish(`${common} Find the working days for each task and the date Task B finishes.`, [daysA, daysB, finBp], exAB, "pm-res", { tier, H, S, hol, TA, EA, TB, EB }, given, ["Round each task up to whole days.", "B starts the working day after A ends."]);
  }
  const rate = 5 * rng.int(4, 12);
  if (tier === "expert") {
    const cost = (TA * dA + TB * dB) * H * rate;
    return finish(
      `${common} Everyone on a team is paid for a full day of **${H} hours** at **${money(rate)} per hour** on every working day of their task. Find the working days for each task, the date Task B finishes, and the total labour cost of the two tasks.`,
      [daysA, daysB, finBp, numPart("cost", "Labour cost", "Total labour cost ($)", cost, "Person-days = people × working days for each task; multiply by the hours per day and the hourly rate.", false)],
      `${exAB} Person-days: ${TA} × ${dA} + ${TB} × ${dB} = ${TA * dA + TB * dB}. Cost = ${TA * dA + TB * dB} × ${H} h × ${money(rate)} = **${money(cost)}**.`,
      "pm-res", { tier, H, S, hol, TA, EA, TB, EB, rate }, given.concat([["_rate", rate]]), ["Round each task up to whole days first.", "Pay is for whole days, so cost uses the rounded days."],
    );
  }
  // expert-plus: working backwards from a deadline
  for (let t = 0; t < TRY; t++) {
    const avail = rng.int(5, 12), m = rng.int(2, 6);
    const E2 = H * avail * (m - 1) + rng.int(1, H * avail - 1);
    const dead = addWork(stB, avail, hol);
    const cur = rng.next() < 0.5 ? m - 1 : m + rng.int(0, 2);
    if (cur < 1) continue;
    const ok = cur >= m;
    return finish(
      `${RES_RULES(H)} ${calText(hol)}Task A needs **${EA} hours** from **${TA} people** and starts on **${fmtWD(S)}**. Task B needs **${E2} hours** and starts on the first working day after Task A finishes. Task B must be finished by the **end of ${fmtWD(dead)}**. Find Task B's start date, the working days available to it (start and deadline days both count), the smallest team that finishes it in time, and whether the planned team of **${cur}** does.`,
      [
        datePart("start-b", "Start of B", "Start date of Task B", stB, "First work out Task A's working days (round up) and its finish date; B starts the next working day."),
        numPart("avail", "Days available", "Working days available to Task B", avail, "Count the working days from B's start to the deadline, both included, skipping weekends and holidays."),
        numPart("min-team", "Smallest team", "Smallest team that finishes Task B in time (people)", m, `Team hours per day = people × ${H}. Hours needed ÷ (days available × ${H}), rounded up.`),
        yesNo(rng, "enough", "Enough?", `Does a team of ${cur} finish Task B in time?`, ok, "Compare the planned team with the smallest team you found."),
      ],
      `Task A: ${EA} ÷ (${TA} × ${H}) → **${dA}** days, finishing ${fmtWD(finA)}; Task B starts **${fmtWD(stB)}**. From there to ${fmtWD(dead)} there are **${avail}** working days. B needs ${E2} hours, so the team must do at least ${E2} ÷ (${avail} × ${H}) = ${(E2 / (avail * H)).toFixed(2)} → **${m}** people. A team of ${cur} ${ok ? "is enough" : "is too small"}: **${ok ? "Yes" : "No"}**.`,
      "pm-res", { tier, H, S, hol, TA, EA, E2, dead, cur }, [["_hoursA", EA], ["_peopleA", TA], ["_hoursB", E2], ["_planned", cur], ["_perday", H]],
      ["Task A's days (rounded up) give B's start date.", "Then count the days from B's start to the deadline."],
    );
  }
  return tooMany();
}

// =====================================================================
export function generate({ subtopic, difficulty, rng }) {
  switch (subtopic) {
    case "delay-finish": return genDelay(rng, difficulty);
    case "crash-decision": return genCrash(rng, difficulty);
    case "earned-value": return genEV(rng, difficulty);
    case "resource-plan": return genResource(rng, difficulty);
    default: throw new Error(`unknown subtopic ${subtopic}`);
  }
}

// =====================================================================
// verify(): independent recomputation
// =====================================================================
// ---- networks: memoised longest paths ----
function vNet(acts, change = {}) {
  const by = Object.fromEntries(acts.map((a) => [a.id, a]));
  const d = (id) => by[id].d + (change[id] || 0);
  const suc = (id) => acts.filter((a) => a.pre.includes(id)).map((a) => a.id);
  const head = {}, tail = {};
  const h = (id) => (id in head ? head[id] : (head[id] = by[id].pre.length ? Math.max(...by[id].pre.map((p) => h(p) + d(p))) : 0));
  const tl = (id) => (id in tail ? tail[id] : (tail[id] = d(id) + (suc(id).length ? Math.max(...suc(id).map(tl)) : 0)));
  const D = Math.max(...acts.map((a) => h(a.id) + tl(a.id)));
  const TF = Object.fromEntries(acts.map((a) => [a.id, D - h(a.id) - tl(a.id)]));
  const crit = acts.filter((a) => TF[a.id] === 0).map((a) => a.id);
  return { D, TF, crit, h, d };
}
function vPathsOf(acts) {
  const out = [];
  const back = (id, tail) => {
    const a = acts.find((x) => x.id === id);
    const p = [id, ...tail];
    if (!a.pre.length) out.push(p);
    else a.pre.forEach((q) => back(q, p));
  };
  acts.filter((a) => !acts.some((b) => b.pre.includes(a.id))).forEach((e) => back(e.id, []));
  return out;
}
function bruteCrash(acts, target) {
  const open = acts.filter((a) => a.c && a.d > a.lim);
  const paths = vPathsOf(acts);
  const dur = Object.fromEntries(acts.map((a) => [a.id, a.d]));
  let best = Infinity;
  const rec = (i, cost) => {
    if (cost >= best) return;
    if (i === open.length) {
      if (Math.max(...paths.map((p) => sum(p.map((id) => dur[id])))) <= target) best = cost;
      return;
    }
    const a = open[i];
    for (let r = 0; r <= a.d - a.lim; r++) { dur[a.id] = a.d - r; rec(i + 1, cost + r * a.c); }
    dur[a.id] = a.d;
  };
  rec(0, 0);
  return best;
}

// ---- dates: the platform's Date, stepping day by day ----
const DAYMS = 86400000;
function readDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mi < 0) return null;
  const ms = Date.UTC(+m[3], mi, +m[1]);
  const back = new Date(ms);
  return back.getUTCDate() === +m[1] && back.getUTCMonth() === mi ? ms : null;
}
const vWork = (ms, hol) => { const w = new Date(ms).getUTCDay(); return w !== 0 && w !== 6 && !hol.includes(ms); };
const vNth = (ms, n, hol) => { let c = 0; for (;; ms += DAYMS) if (vWork(ms, hol) && ++c === n) return ms; };
const vBack = (ms, n, hol) => { let c = 0; for (;; ms -= DAYMS) if (vWork(ms, hol) && ++c === n) return ms; };
const vNextDay = (ms, hol) => { do ms += DAYMS; while (!vWork(ms, hol)); return ms; };
const vCount = (a, b, hol) => { let c = 0; for (let t = a; t <= b; t += DAYMS) if (vWork(t, hol)) c++; return c; };
const vCeil = (E, per) => { let d = 0; while (d * per < E) d++; return d; };

function expected(p) {
  const ms = (z) => z * DAYMS;
  const hol = (p.hol || []).map(ms);
  switch (p.kind) {
    case "pm-delay": {
      const base = vNet(p.acts);
      if (p.tier === "medium") return { duration: base.D, finish: vNth(ms(p.S), base.D, hol) };
      const slip = vNet(p.acts, { [p.x]: p.k });
      const nd = slip.D;
      if (p.tier === "hard") return { duration: base.D, float: base.TF[p.x], "new-finish": vNth(ms(p.S), nd, hol) };
      if (p.tier === "expert") return { duration: base.D, path: vPathsOf(p.acts).find((q) => sum(q.map((id) => base.d(id))) === base.D).join(SEP), "new-duration": nd, "new-finish": vNth(ms(p.S), nd, hol) };
      const dead = vNth(ms(p.S), base.D + p.g, hol);
      const nf = vNth(ms(p.S), nd, hol);
      const late = nf > dead ? vCount(dead + DAYMS, nf, hol) : 0;
      return { "latest-start": vBack(dead, base.D, hol), "new-finish": nf, "late-days": late, action: `${late === 0 ? "Met" : "Missed"} | ${late === 0 ? "No action" : p.p < p.c ? "Pay penalty" : "Crash " + p.x}` };
    }
    case "pm-crash": {
      const D = vNet(p.acts).D;
      const cost = (k) => bruteCrash(p.acts, D - k);
      if (p.tier === "medium") return { duration: D, one: cost(1) };
      if (p.tier === "hard") return { duration: D, cut: cost(p.N), total: p.T0 + cost(p.N) };
      const cp = vPathsOf(p.acts).filter((q) => sum(q.map((id) => p.acts.find((a) => a.id === id).d)) === D);
      if (p.tier === "expert") return { duration: D, path: cp.length === 1 ? cp[0].join(SEP) : null, cut: cost(p.N), net: p.I * p.N - cost(p.N) };
      let m = 0;
      while (cost(m + 1) <= p.B) m++;
      return { duration: D, cut: cost(p.N), "max-days": m, worth: p.b * p.N > cost(p.N) ? "Yes" : "No" };
    }
    case "pm-ev": {
      const d = p.d;
      if (p.tier === "expert-plus") {
        const cpi = d.bac / d.eac, ev = (d.bac * d.actual) / 100;
        return { cpi, ac: ev / cpi, spi: d.actual / d.planned, escalate: d.eac - d.bac > p.T ? "Yes" : "No" };
      }
      const ev = (d.bac * d.actual) / 100, cpi = ev / d.ac;
      const out = { ev, cpi };
      if (p.tier === "medium") return out;
      out.eac = d.bac / cpi;
      if (p.tier === "expert") out.status = `${d.actual > d.planned ? "Ahead of schedule" : "Behind schedule"} | ${cpi > 1 ? "Under budget" : "Over budget"}`;
      return out;
    }
    case "pm-res": {
      const per = (T) => T * p.H;
      const dA = vCeil(p.EA, per(p.TA));
      if (p.tier === "medium") return { days: dA, finish: vNth(ms(p.S), dA, hol) };
      const finA = vNth(ms(p.S), dA, hol), stB = vNextDay(finA, hol);
      if (p.tier === "expert-plus") {
        const avail = vCount(stB, ms(p.dead), hol);
        const need = (() => { let m = 1; while (m * p.H * avail < p.E2) m++; return m; })();
        return { "start-b": stB, avail, "min-team": need, enough: p.cur >= need ? "Yes" : "No" };
      }
      const dB = vCeil(p.EB, per(p.TB));
      const out = { "days-a": dA, "days-b": dB, "finish-b": vNth(stB, dB, hol) };
      if (p.tier === "expert") out.cost = (p.TA * dA + p.TB * dB) * p.H * p.rate;
      return out;
    }
  }
  return null;
}

function sameItem(item, given, want) {
  if (want === null || want === undefined) return false;
  if (item.answerType === "number") return typeof given === "number" && typeof want === "number" && Number.isFinite(given) && close(given, want);
  if (item.answerType === "date") return typeof want === "number" && readDate(given) === want;
  if (item.answerType === "choice") {
    const opts = (item.choices || []).map((o) => (Array.isArray(o) ? o.join(" | ") : String(o)));
    if (opts.filter((o) => o === want).length !== 1) return false;
    return (Array.isArray(given) ? given.join(" | ") : String(given)) === want;
  }
  return false;
}

export function verify(question, answer) {
  try {
    const p = question.params;
    if (!p || !answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
    const want = expected(p);
    if (!want || question.parts.length !== Object.keys(want).length) return false;
    return question.parts.every((part) => sameItem(part, answer[part.id], want[part.id]));
  } catch {
    return false;
  }
}
