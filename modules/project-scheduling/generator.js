// Project Scheduling generator: critical path, float and crashing, working-day dates, earned value.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn (no
// rng calls in hint code). Generation uses the textbook methods (forward/backward pass, greedy
// crashing, day-number calendar maths); verify() recomputes by independent ones (enumerating every
// path, brute-forcing every crash plan, stepping day by day with the platform's Date).
// Every answer is exact (whole days, whole dollars or an index that works out to 2 decimals), so
// no answer sits on a rounding half-step and chained parts never change under rounding.

import { MONTHS, WEEKDAYS, civilToDays, daysToCivil, weekdayOfDays, formatDMY } from "../../js/lib/dates.js";

const IDS = "ABCDEFGHIJ";
const SEP = " → ";
const EXACT = { fuzzyNumber: 0 };
// Whole dollars with comma groups. Hand-rolled: the first toLocaleString call loads Intl data,
// which alone took ~20 ms and pushed single generate() calls past the time limit.
const money = (n) => (n < 0 ? "−$" : "$") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const close = (a, b) => Math.abs(a - b) < 1e-9;
const nearInt = (x) => Math.abs(x - Math.round(x)) < 1e-6;

// =====================================================================
// Activity networks (generation side: forward and backward pass)
// =====================================================================
const NET_RULES = "Durations are in whole days. An activity starts as soon as **all** of its predecessors have finished, and an activity with no predecessor starts at day 0, the start of the project.";
const preText = (a) => (a.pre.length ? a.pre.join(", ") : "—");
const netTable = (acts) =>
  ["| Activity | Duration (days) | Predecessors |", "| --- | --- | --- |", ...acts.map((a) => `| ${a.id} | ${a.d} | ${preText(a)} |`)].join("\n");
const givenDur = (acts) => acts.map((a) => ({ label: `_d${a.id}`, value: a.d }));

function buildNet(rng, n) {
  const acts = [];
  const nSrc = n >= 6 ? rng.int(1, 3) : rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    let pre = [];
    if (i >= nSrc) {
      const pool = acts.map((a) => a.id);
      pre = rng.shuffle(pool).slice(0, Math.min(rng.int(1, 2), pool.length));
    }
    acts.push({ id: IDS[i], d: rng.int(2, 9), pre });
  }
  const last = acts[n - 1];
  for (const a of acts.slice(0, -1)) if (!acts.some((x) => x.pre.includes(a.id))) last.pre.push(a.id);
  const by = Object.fromEntries(acts.map((a) => [a.id, a]));
  const anc = (p, q) => by[q].pre.some((r) => r === p || anc(p, r)); // is p an ancestor of q?
  for (const a of acts) a.pre = a.pre.filter((p) => !a.pre.some((q) => q !== p && anc(p, q))).sort();
  return acts;
}

function analyse(acts) {
  const ES = {}, EF = {}, LS = {}, LF = {}, TF = {}, FF = {}, succ = {}, cnt = {};
  acts.forEach((a) => (succ[a.id] = []));
  acts.forEach((a) => a.pre.forEach((p) => succ[p].push(a.id)));
  for (const a of acts) {
    ES[a.id] = a.pre.length ? Math.max(...a.pre.map((p) => EF[p])) : 0;
    EF[a.id] = ES[a.id] + a.d;
    cnt[a.id] = a.pre.length ? sum(a.pre.filter((p) => EF[p] === ES[a.id]).map((p) => cnt[p])) : 1;
  }
  const D = Math.max(...acts.map((a) => EF[a.id]));
  for (const a of [...acts].reverse()) {
    LF[a.id] = succ[a.id].length ? Math.min(...succ[a.id].map((s) => LS[s])) : D;
    LS[a.id] = LF[a.id] - a.d;
  }
  for (const a of acts) {
    TF[a.id] = LS[a.id] - ES[a.id];
    FF[a.id] = (succ[a.id].length ? Math.min(...succ[a.id].map((s) => ES[s])) : D) - EF[a.id];
  }
  const longest = sum(acts.filter((a) => !succ[a.id].length && EF[a.id] === D).map((a) => cnt[a.id]));
  const crit = acts.filter((a) => TF[a.id] === 0).map((a) => a.id).sort((x, y) => ES[x] - ES[y]);
  const nonCrit = acts.filter((a) => TF[a.id] > 0).map((a) => a.id);
  const paths = [];
  const walk = (id, trail) => {
    const p = [...trail, id];
    if (!succ[id].length) paths.push(p);
    else succ[id].forEach((s) => walk(s, p));
  };
  acts.filter((a) => !a.pre.length).forEach((a) => walk(a.id, []));
  const dur = Object.fromEntries(acts.map((a) => [a.id, a.d]));
  const lens = paths.map((p) => sum(p.map((id) => dur[id])));
  return { ES, EF, LS, LF, TF, FF, succ, D, longest, crit, nonCrit, paths, lens, dur };
}

function drawNet(rng, n, ok) {
  for (let t = 0; t < 400; t++) {
    const acts = buildNet(rng, n);
    const an = analyse(acts);
    if (an.longest !== 1 || an.crit.length < 2 || an.crit.length >= n || an.paths.length < 3) continue;
    if (ok && !ok(an, acts)) continue;
    return { acts, an };
  }
  throw new Error("no network");
}

const pathStr = (p) => p.join(SEP);
const pathSums = (an, p) => `${pathStr(p)} = ${p.map((id) => an.dur[id]).join(" + ")} = ${sum(p.map((id) => an.dur[id]))}`;
const allPathLines = (an) => an.paths.map((p, i) => `- ${pathSums(an, p)}${an.lens[i] === an.D ? " (longest)" : ""}`).join("\n");
const passLines = (an, acts) => acts.map((a) => `- ${a.id}: ES ${an.ES[a.id]}, EF ${an.EF[a.id]}, LS ${an.LS[a.id]}, LF ${an.LF[a.id]}, float ${an.TF[a.id]}`).join("\n");

// ---- segmented choice sets (ticket 022: no counting giveaway) ----
// `alts[i]` lists wrong values for column i; `extra` are explicit tempting wrong tuples.
function segSet(rng, cols, correct, alts, want, extra = []) {
  const n = cols.length;
  const key = (t) => t.join("\u0001");
  const seen = new Set([key(correct)]);
  const pool = [];
  const add = (t) => {
    if (t.length === n && t.every((v) => v !== undefined && v !== "") && !seen.has(key(t))) { seen.add(key(t)); pool.push(t); }
  };
  extra.forEach(add);
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const cs = [...Array(n).keys()].filter((i) => mask & (1 << i));
    if (cs.some((i) => !alts[i].length)) continue;
    for (let k = 0; k < 5; k++) add(correct.map((v, i) => (cs.includes(i) ? rng.pick(alts[i]) : v)));
  }
  const diff = (a, b) => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);
  for (let t = 0; t < 400; t++) {
    const wrong = rng.shuffle(pool).slice(0, want - 1);
    if (wrong.length !== want - 1 || wrong.some((w) => diff(w, correct) >= n)) continue;
    if (!wrong.some((w) => diff(w, correct) >= 2)) continue;
    const all = [correct, ...wrong];
    const counts = (i) => { const m = {}; all.forEach((o) => (m[o[i]] = (m[o[i]] || 0) + 1)); return m; };
    if (!cols.some((_, i) => { const m = counts(i); return m[correct[i]] < Math.max(...Object.values(m)); })) continue;
    const shown = cols.map((_, i) => new Set(all.map((o) => o[i])));
    const extraSegs = [];
    for (const i of rng.shuffle([...Array(n).keys()])) for (const v of rng.shuffle(alts[i])) if (!shown[i].has(v)) { shown[i].add(v); extraSegs.push([i, v]); }
    return { answerType: "choice", choiceCols: cols, choices: rng.shuffle(all), answer: correct.join(" | "), extraSegs: extraSegs.slice(0, 14) };
  }
  throw new Error("no segmented set");
}
const uniq = (a, drop) => [...new Set(a.map(String))].filter((v) => !drop.map(String).includes(v));
const SEG_OPTIONS = (difficulty) => (difficulty === "easy" ? 3 : 5);

function plainPick(rng, correct, others, max = 4) {
  const wrong = rng.shuffle(uniq(others, [correct])).slice(0, max - 1);
  return { answerType: "choice", choices: rng.shuffle([correct, ...wrong]), answer: correct };
}

// =====================================================================
// Critical path
// =====================================================================
function genCritical(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["duration", "path"]);
    const { acts, an } = drawNet(rng, 5);
    const head = `A small project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\n`;
    const base = { given: givenDur(acts), params: { kind, acts, diff: difficulty } };
    if (kind === "duration") {
      return {
        prompt: `${head}What is the shortest possible duration of the whole project, in days?`,
        answerType: "number", answer: an.D, tolerance: 0, ...EXACT, ...base,
        explanation: `The project can't finish before its longest route does. All the routes from a start to the end:\n\n${allPathLines(an)}\n\nThe longest is **${an.D} days**.`,
        hints: ["List every route from an activity with no predecessor to the final activity.", "Add the durations along each route. The project needs as long as the longest one."],
      };
    }
    const correct = pathStr(an.paths[an.lens.indexOf(an.D)]);
    return {
      prompt: `${head}Which route is the **critical path** (the longest route through the network)?`,
      ...plainPick(rng, correct, an.paths.map(pathStr)), ...base,
      explanation: `Add the durations along each route:\n\n${allPathLines(an)}\n\nThe critical path is **${correct}**.`,
      hints: ["The critical path is the longest route from start to finish.", "Add up the durations along each route and compare."],
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["seg", "seg", "ncrit"]);
    const need = kind === "seg"
      ? (an) => {
          const f = an.nonCrit.map((id) => an.TF[id]).sort((a, b) => b - a);
          return f.length >= 2 && f[0] > f[1];
        }
      : null;
    const { acts, an } = drawNet(rng, 6, need);
    const head = `A project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\n`;
    const base = { given: givenDur(acts), params: { kind, acts, diff: difficulty } };
    if (kind === "ncrit") {
      return {
        prompt: `${head}How many of the activities are on the critical path?`,
        answerType: "number", answer: an.crit.length, tolerance: 0, ...EXACT, ...base,
        explanation: `Route lengths:\n\n${allPathLines(an)}\n\nThe critical path is ${pathStr(an.crit)}, which has **${an.crit.length}** activities.`,
        hints: ["Find the longest route first, by adding the durations along every route.", "Then count the activities on that route."],
      };
    }
    const cp = pathStr(an.crit);
    const mf = an.nonCrit.reduce((b, id) => (an.TF[id] > an.TF[b] ? id : b));
    const correct = [String(an.D), cp, mf];
    const others = an.paths.map((p, i) => [pathStr(p), an.lens[i]]).filter(([s]) => s !== cp);
    const alts = [
      uniq([...others.map(([, l]) => l), an.D - 3, an.D - 2, an.D - 1, an.D + 1, an.D + 2, an.D + 3].filter((v) => v > 0), [an.D]),
      others.map(([s]) => s),
      uniq(acts.map((a) => a.id), [mf]),
    ];
    const extra = others.flatMap(([s, l]) => [[String(l), s, mf], [String(an.D), s, correct[2]]]);
    return {
      prompt: `${head}Find three things: the shortest possible project duration, the critical path, and the activity with the **most total float** (the most days it could slip without delaying the project). Pick the option that has all three right.`,
      ...segSet(rng, ["Duration (days)", "Critical path", "Most float"], correct, alts, SEG_OPTIONS(difficulty), extra), ...base,
      explanation: `Route lengths:\n\n${allPathLines(an)}\n\nDuration **${an.D}**, critical path **${cp}**. Float of each activity (LS − ES):\n\n${passLines(an, acts)}\n\n**${mf}** has the most float (${an.TF[mf]} days).`,
      hints: ["Add up each route. The longest is the critical path and its length is the duration.", "Float is how many days an activity can slip without delaying the project: critical activities have none.", "Compare the non-critical routes with the critical one: the activity with the biggest gap has the most float."],
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["cpm3", "cpm3", "shorten"]);
    const { acts, an } = drawNet(rng, rng.int(6, 7), null);
    const head = `A project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\n`;
    const given = givenDur(acts);
    if (kind === "shorten") {
      const x = rng.pick(an.crit.filter((id) => an.dur[id] >= 2));
      const k = rng.int(1, Math.min(4, an.dur[x] - 1));
      const nd = analyse(acts.map((a) => (a.id === x ? { ...a, d: a.d - k } : a))).D;
      return {
        prompt: `${head}Activity **${x}** is on the critical path. By adding resources, its duration is cut by **${plural(k, "day")}** (to ${an.dur[x] - k}). What is the new shortest project duration, in days?`,
        answerType: "number", answer: nd, tolerance: 0, ...EXACT, given,
        explanation: `Before the change: critical path ${pathStr(an.crit)}, ${an.D} days.\n\nWith ${x} at ${an.dur[x] - k} days, the longest route is now **${nd} days** — ${nd === an.D - k ? `the whole ${k} days are saved` : `only ${an.D - nd} of the ${k} days are saved, because another route becomes critical`}.\n\nRoutes now:\n\n${allPathLines(analyse(acts.map((a) => (a.id === x ? { ...a, d: a.d - k } : a))))}`,
        hints: [`Shortening ${x} shortens the critical path, but the project can only get as short as the next-longest route.`, "Re-add the durations on every route that ran through the old critical path, with the new duration of the activity.", "The new duration is the longest of all the routes."],
        params: { kind, acts, x, k, diff: difficulty },
      };
    }
    const y = rng.pick(acts.filter((a) => a.pre.length).map((a) => a.id));
    const cp = pathStr(an.crit);
    const parts = [
      { id: "duration", label: "Duration", ask: "Shortest project duration (days)", answerType: "number", answer: an.D, tolerance: 0, ...EXACT, hint: "Add the durations along each route; the longest one sets the duration." },
      { id: "path", label: "Critical path", ask: "Which route is the critical path?", ...plainPick(rng, cp, an.paths.map(pathStr)), hint: "It is the route whose durations add up to the project duration." },
      { id: "ef", label: "Earliest finish", ask: `Earliest finish of activity ${y} (day number)`, answerType: "number", answer: an.EF[y], tolerance: 0, ...EXACT, hint: `Its earliest start is when the last of its predecessors finishes; then add its own duration.` },
    ];
    return {
      prompt: `${head}Analyse the network: find the shortest project duration, the critical path, and the earliest finish time of activity **${y}** (days from the start of the project).`,
      answerType: "multi", parts, given,
      explanation: `Routes:\n\n${allPathLines(an)}\n\nDuration **${an.D}** days, critical path **${cp}**.\n\n${y} can start at ES = ${an.ES[y]} (${an.dur[y]} days long), so its earliest finish is **${an.EF[y]}**.`,
      params: { kind, acts, y, diff: difficulty },
    };
  }

  // expert
  const { acts, an } = drawNet(rng, rng.int(7, 8), (a) => a.nonCrit.length >= 2);
  const x = rng.pick(an.nonCrit);
  const f = an.TF[x];
  const k = rng.pick([rng.int(1, f), f + rng.int(1, 5)]);
  const nd = an.D + Math.max(0, k - f);
  const parts = [
    { id: "es", label: "Earliest start", ask: `Earliest start of ${x} (day number)`, answerType: "number", answer: an.ES[x], tolerance: 0, ...EXACT, hint: "Forward pass: the earliest start is the latest earliest-finish among its predecessors (0 if it has none)." },
    { id: "ls", label: "Latest start", ask: `Latest start of ${x} that doesn't delay the project (day number)`, answerType: "number", answer: an.LS[x], tolerance: 0, ...EXACT, hint: "Backward pass: take the project duration and work back through the activities after it; its latest finish is the smallest latest start among its successors." },
    { id: "new", label: "After delay", ask: `New project duration if ${x} is delayed by ${plural(k, "day")} (days)`, answerType: "number", answer: nd, tolerance: 0, ...EXACT, hint: "A delay only pushes the project back by the amount that is more than the activity's float." },
  ];
  return {
    prompt: `A project has these activities. ${NET_RULES} The project must finish as early as the network allows.\n\n${netTable(acts)}\n\nFor activity **${x}**: find its earliest start and its latest start (the latest it can start without delaying the project), and then the new shortest project duration if it starts **${plural(k, "day")} later** than its earliest start (everything else on time).`,
    answerType: "multi", parts, given: givenDur(acts),
    explanation: `Forward and backward pass (project duration ${an.D}):\n\n${passLines(an, acts)}\n\n${x}: ES **${an.ES[x]}**, LS **${an.LS[x]}**, so its float is ${f} days. A delay of ${k} days ${k <= f ? `is within the float, so the project is not delayed: **${nd}**` : `uses up the ${f} days of float and delays the project by ${k - f}: ${an.D} + ${k - f} = **${nd}**`}.`,
    params: { kind: "delay", acts, x, k, diff: difficulty },
  };
}

// =====================================================================
// Float and crashing
// =====================================================================
function genFloat(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["es-ls", "ef-lf", "net"]);
    if (kind === "es-ls") {
      const es = rng.int(0, 12), f = rng.int(1, 8), d = rng.int(2, 9);
      return {
        prompt: `Activity **X** takes ${d} days. Its earliest start is day **${es}** and its latest start (without delaying the project) is day **${es + f}**. What is its total float, in days?`,
        answerType: "number", answer: f, tolerance: 0, ...EXACT,
        given: [{ label: "_es", value: es }, { label: "_ls", value: es + f }],
        explanation: `Total float = latest start − earliest start: \`_ls - _es\` = ${es + f} − ${es} = **${f}** days.`,
        hints: ["Total float = latest start − earliest start.", "The duration isn't needed here."],
        params: { kind, es, ls: es + f, diff: difficulty },
      };
    }
    if (kind === "ef-lf") {
      const es = rng.int(0, 12), f = rng.int(1, 8), d = rng.int(2, 9);
      return {
        prompt: `Activity **X** takes ${d} days. It can start at the earliest on day **${es}**, and it must finish by day **${es + d + f}** at the latest to keep the project on time. What is its total float, in days?`,
        answerType: "number", answer: f, tolerance: 0, ...EXACT,
        given: [{ label: "_es", value: es }, { label: "_d", value: d }, { label: "_lf", value: es + d + f }],
        explanation: `Earliest finish = ES + duration = ${es} + ${d} = ${es + d}. Total float = latest finish − earliest finish = \`_lf - (_es + _d)\` = ${es + d + f} − ${es + d} = **${f}** days.`,
        hints: ["Total float = latest finish − earliest finish (or latest start − earliest start).", "Work out the earliest finish first: earliest start + duration."],
        params: { kind, es, d, lf: es + d + f, diff: difficulty },
      };
    }
    const { acts, an } = drawNet(rng, 5, (a) => a.nonCrit.length >= 1);
    const x = rng.pick(an.nonCrit);
    return {
      prompt: `A small project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\nWhat is the **total float** of activity **${x}**, in days? (Total float = latest start − earliest start, without delaying the project.)`,
      answerType: "number", answer: an.TF[x], tolerance: 0, ...EXACT, given: givenDur(acts),
      explanation: `Project duration ${an.D} days (critical path ${pathStr(an.crit)}).\n\n${passLines(an, acts)}\n\n${x}: LS − ES = ${an.LS[x]} − ${an.ES[x]} = **${an.TF[x]}** days.`,
      hints: ["First find the project duration: the longest route.", `Float is how much longer than necessary the routes through ${x} could take: compare the longest route through ${x} with the project duration.`],
      params: { kind, acts, x, diff: difficulty },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["net", "slip", "slip"]);
    const { acts, an } = drawNet(rng, 6, (a) => a.nonCrit.length >= 1);
    const x = rng.pick(an.nonCrit);
    const f = an.TF[x];
    const head = `A project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\n`;
    if (kind === "net") {
      return {
        prompt: `${head}What is the **total float** of activity **${x}**, in days? (Total float = latest start − earliest start.)`,
        answerType: "number", answer: f, tolerance: 0, ...EXACT, given: givenDur(acts),
        explanation: `Project duration ${an.D} (critical path ${pathStr(an.crit)}).\n\n${passLines(an, acts)}\n\n${x}: LS − ES = ${an.LS[x]} − ${an.ES[x]} = **${f}** days.`,
        hints: ["Forward pass for the earliest times, backward pass from the project duration for the latest times.", `Total float of ${x} = LS − ES (or LF − EF).`],
        params: { kind, acts, x, diff: difficulty },
      };
    }
    const k = rng.next() < 0.5 ? rng.int(1, f) : f + rng.int(1, 4);
    const later = k > f;
    // Three separate parts, not one segmented choice: "Later" forces 0 float left and "Unchanged"
    // forces 0 days later, so only the answer would make sense among combined options (ticket 022).
    const parts = [
      { id: "finish", label: "Project finish", ask: "Does the project finish later, or is it unchanged?", answerType: "choice", choices: rng.shuffle(["Later", "Unchanged"]), answer: later ? "Later" : "Unchanged", hint: "Compare the delay with the activity's float (LS − ES)." },
      { id: "later", label: "Days later", ask: "How many days later does the project finish? (0 if unchanged)", answerType: "number", answer: Math.max(0, k - f), tolerance: 0, ...EXACT, hint: "Only the part of the delay that is more than the float moves the finish." },
      { id: "left", label: "Float left", ask: `How many days of float does ${x} have left? (never below 0)`, answerType: "number", answer: Math.max(0, f - k), tolerance: 0, ...EXACT, hint: "Float left is the float minus the delay, but it can't go below 0." },
    ];
    return {
      prompt: `${head}Activity **${x}** starts **${plural(k, "day")}** later than its earliest start (everything else on time). Say whether the project finish moves, by how many days, and how much float ${x} has **left** (never below 0).`,
      answerType: "multi", parts,
      given: givenDur(acts),
      explanation: `Float of ${x}: LS − ES = ${an.LS[x]} − ${an.ES[x]} = ${f} days. A delay of ${plural(k, "day")} ${later ? `is longer than the float, so the project finishes **${plural(k - f, "day")}** later and **0** days of float are left` : `fits inside the float, so the project finish is unchanged (**0** days later) and **${f - k}** of the ${f} days of float are left`}.\n\n${passLines(an, acts)}`,
      hints: ["Find the float of the activity first: LS − ES.", "A delay no bigger than the float doesn't move the project finish.", "A bigger delay moves the finish by the part of it that is more than the float."],
      params: { kind, acts, x, k, diff: difficulty },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["ff", "two"]);
    if (kind === "ff") {
      const { acts, an } = drawNet(rng, rng.int(6, 7), (a) => a.nonCrit.some((id) => a.FF[id] > 0 && a.FF[id] < a.TF[id]));
      const x = rng.pick(an.nonCrit.filter((id) => an.FF[id] > 0 && an.FF[id] < an.TF[id]));
      const nextES = an.succ[x].length ? Math.min(...an.succ[x].map((s) => an.ES[s])) : an.D;
      const parts = [
        { id: "total", label: "Total float", ask: `Total float of ${x} (days)`, answerType: "number", answer: an.TF[x], tolerance: 0, ...EXACT, hint: "LS − ES: the delay it can take without delaying the project." },
        { id: "free", label: "Free float", ask: `Free float of ${x} (days)`, answerType: "number", answer: an.FF[x], tolerance: 0, ...EXACT, hint: `Compare ${x}'s earliest finish with the earliest start of the activities that follow it (or with the project duration if none follow).` },
      ];
      return {
        prompt: `A project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\nFor activity **${x}**, find its **total float** (LS − ES) and its **free float**: the days it can be delayed without delaying the earliest start of any activity that follows it (the smallest earliest start among the activities that follow it − ${x}'s earliest finish; if nothing follows it, the project duration − its earliest finish).`,
        answerType: "multi", parts, given: givenDur(acts),
        explanation: `${passLines(an, acts)}\n\nTotal float of ${x} = ${an.LS[x]} − ${an.ES[x]} = **${an.TF[x]}**.\n\nFree float = ${nextES} (${an.succ[x].length > 1 ? `the smallest earliest start among ${an.succ[x].join(", ")}` : an.succ[x].length ? `the earliest start of ${an.succ[x][0]}` : "project duration"}) − ${an.EF[x]} (EF of ${x}) = **${an.FF[x]}**.`,
        params: { kind, acts, x, diff: difficulty },
      };
    }
    const { acts, an } = drawNet(rng, rng.int(6, 7), (a) => a.nonCrit.length >= 2);
    const [x, y] = rng.shuffle(an.nonCrit).slice(0, 2);
    const dx = rng.int(2, 6), dy = rng.int(2, 6);
    const nd = analyse(acts.map((a) => (a.id === x ? { ...a, d: a.d + dx } : a.id === y ? { ...a, d: a.d + dy } : a))).D;
    return {
      prompt: `A project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\nActivity **${x}** takes **${plural(dx, "day")}** longer than planned and activity **${y}** takes **${plural(dy, "day")}** longer than planned. What is the new shortest project duration, in days?`,
      answerType: "number", answer: nd, tolerance: 0, ...EXACT, given: givenDur(acts),
      explanation: `Original duration ${an.D} (critical path ${pathStr(an.crit)}). With ${x} = ${an.dur[x] + dx} and ${y} = ${an.dur[y] + dy}, recompute every route:\n\n${allPathLines(analyse(acts.map((a) => (a.id === x ? { ...a, d: a.d + dx } : a.id === y ? { ...a, d: a.d + dy } : a))))}\n\nThe longest is **${nd} days**.`,
      hints: ["Both delays count, and they may be on the same route or on different routes.", "Add the new durations along every route.", "The new project duration is the longest route."],
      params: { kind, acts, x, y, dx, dy, diff: difficulty },
    };
  }

  // expert
  const kind = rng.pick(["crash", "crash", "chain"]);
  if (kind === "chain") {
    const { acts, an } = drawNet(rng, rng.int(7, 8), (a, ac) => ac.some((c) => c.pre.some((p) => a.TF[p] > 0 && a.TF[c.id] > 0)));
    const pairs = acts.filter((c) => an.TF[c.id] > 0).flatMap((c) => c.pre.filter((p) => an.TF[p] > 0).map((p) => [p, c.id]));
    const [x, y] = rng.pick(pairs);
    const dx = rng.int(1, an.TF[x] + 2), dy = rng.int(1, 4);
    const mod = acts.map((a) => (a.id === x ? { ...a, d: a.d + dx } : a.id === y ? { ...a, d: a.d + dy } : a));
    const nd = analyse(mod).D;
    const parts = [
      { id: "fx", label: `Float of ${x}`, ask: `Total float of ${x} (days)`, answerType: "number", answer: an.TF[x], tolerance: 0, ...EXACT, hint: "LS − ES from a forward and backward pass." },
      { id: "fy", label: `Float of ${y}`, ask: `Total float of ${y} (days)`, answerType: "number", answer: an.TF[y], tolerance: 0, ...EXACT, hint: "Same method. Remember that float on a route can be shared by the activities on it." },
      { id: "new", label: "New duration", ask: `Shortest project duration if ${x} takes ${plural(dx, "day")} longer and ${y} takes ${plural(dy, "day")} longer (days)`, answerType: "number", answer: nd, tolerance: 0, ...EXACT, hint: `Both delays may hit the same route, so add them on top of that route and compare it with the project duration.` },
    ];
    return {
      prompt: `A project has these activities. ${NET_RULES}\n\n${netTable(acts)}\n\nActivity **${y}** follows ${x} directly. Find the total float of **${x}** and of **${y}**, then the new shortest project duration if ${x} takes **${plural(dx, "day")}** longer and ${y} takes **${plural(dy, "day")}** longer than planned.`,
      answerType: "multi", parts, given: givenDur(acts),
      explanation: `${passLines(an, acts)}\n\nFloat of ${x} = **${an.TF[x]}**, float of ${y} = **${an.TF[y]}**. With ${x} = ${an.dur[x] + dx} and ${y} = ${an.dur[y] + dy}, the routes are:\n\n${allPathLines(analyse(mod))}\n\nThe longest is **${nd} days** (originally ${an.D}); the two delays share the float of the route they sit on.`,
      params: { kind, acts, x, y, dx, dy, diff: difficulty },
    };
  }

  // crashing
  for (let t = 0; t < 300; t++) {
    const { acts: base, an } = drawNet(rng, rng.int(6, 7));
    const acts = base.map((a) => {
      const crashable = rng.next() < 0.8;
      const room = crashable ? rng.int(1, Math.min(3, a.d - 1)) : 0;
      return { ...a, lim: a.d - room, c: crashable ? 50 * rng.int(4, 30) : 0 };
    });
    const N = rng.int(2, 3);
    const gr = greedyCrash(acts, N);
    if (!gr) continue;
    const brute = [bruteCrash(acts, an.D - 1), bruteCrash(acts, an.D - N)];
    if (brute[0] !== gr.cum[0] || brute[1] !== gr.cum[N - 1]) continue;
    const rows = acts.map((a) => `| ${a.id} | ${a.d} | ${a.c ? a.lim : "—"} | ${a.c ? money(a.c) : "—"} | ${preText(a)} |`);
    const table = ["| Activity | Normal days | Shortest days | Extra cost per day saved | Predecessors |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
    const parts = [
      { id: "one", label: "Cut by 1 day", ask: "Cheapest extra cost to cut the project by 1 day ($)", answerType: "number", answer: gr.cum[0], tolerance: 0, hint: "Crash the cheapest activity that is on the critical path (and can still be shortened)." },
      { id: "many", label: `Cut by ${N} days`, ask: `Cheapest extra cost to cut the project by ${N} days ($)`, answerType: "number", answer: gr.cum[N - 1], tolerance: 0, hint: "Cut one day at a time, re-checking the critical path(s) after every day: if two routes become critical, both must be shortened." },
    ];
    return {
      prompt: `A project has these activities. ${NET_RULES} Any activity can be **crashed** (shortened) by whole days, down to its shortest time, at the extra cost per day saved shown (— means it cannot be crashed). Costs are in dollars and crashing never changes the predecessors.\n\n${table}\n\nWhat is the cheapest total extra cost to cut the shortest project duration (currently ${an.D} days) by **1 day**, and by **${N} days**?`,
      answerType: "multi", parts,
      explanation: `Critical path ${pathStr(an.crit)} (${an.D} days).\n\n${gr.steps.map((s, i) => `- Day ${i + 1}: crash ${s.set.join(" and ")} (${money(s.cost)}), running total ${money(gr.cum[i])}.`).join("\n")}\n\nCheapest cut by 1 day: **${money(gr.cum[0])}**; by ${N} days: **${money(gr.cum[N - 1])}**.`,
      params: { kind: "crash", acts, N, D: an.D, diff: difficulty },
    };
  }
  throw new Error("no crash network");
}

// greedy crashing, one day at a time: the cheapest set of crashable activities that hits every critical path
function greedyCrash(acts, N) {
  const cur = acts.map((a) => ({ ...a }));
  const cum = [], steps = [];
  let total = 0;
  for (let s = 0; s < N; s++) {
    const an = analyse(cur);
    const critPaths = an.paths.filter((_, i) => an.lens[i] === an.D);
    const open = cur.filter((a) => a.c && a.d > a.lim);
    let best = null;
    for (let m = 1; m < 1 << open.length; m++) {
      const set = open.filter((_, i) => m & (1 << i));
      if (!critPaths.every((p) => set.some((a) => p.includes(a.id)))) continue;
      const cost = sum(set.map((a) => a.c));
      if (!best || cost < best.cost) best = { set, cost };
    }
    if (!best) return null;
    best.set.forEach((a) => (a.d -= 1));
    total += best.cost;
    cum.push(total);
    steps.push({ set: best.set.map((a) => a.id), cost: best.cost });
  }
  return { cum, steps };
}

// brute force (verify side): every crash plan, via path enumeration
function bruteCrash(acts, target) {
  const open = acts.filter((a) => a.c && a.d > a.lim);
  const paths = vPaths(acts);
  let best = Infinity;
  const dur = Object.fromEntries(acts.map((a) => [a.id, a.d]));
  const rec = (i, cost) => {
    if (cost >= best) return;
    if (i === open.length) {
      if (Math.max(...paths.map((p) => sum(p.map((id) => dur[id])))) <= target) best = cost;
      return;
    }
    const a = open[i];
    for (let r = 0; r <= a.d - a.lim; r++) {
      dur[a.id] = a.d - r;
      rec(i + 1, cost + r * a.c);
    }
    dur[a.id] = a.d;
  };
  rec(0, 0);
  return best;
}

// =====================================================================
// Working-day dates (generation side: day numbers; verify uses the platform's Date)
// =====================================================================
const WORK_RULES = "Work runs **Monday to Friday** only (weekends are not worked), and the start date counts as **day 1** of the activity, so an activity of *n* working days ends on its *n*th working day.";
const DAYMS = 86400000;
const zOf = civilToDays;
const isWork = (z, hol) => { const w = weekdayOfDays(z); return w >= 1 && w <= 5 && !hol.includes(z); };
const nextWork = (z, hol) => { while (!isWork(z, hol)) z++; return z; };
const addWork = (z, n, hol) => { let c = 1; while (c < n) { z++; if (isWork(z, hol)) c++; } return z; };
const backWork = (z, n, hol) => { let c = 1; while (c < n) { z--; if (isWork(z, hol)) c++; } return z; };
const fmtZ = (z) => formatDMY(daysToCivil(z));
const fmtWD = (z) => `${WEEKDAYS[weekdayOfDays(z)]} ${fmtZ(z)}`;
const dateAns = (z) => ({ answerType: "date", precision: "day", answer: fmtZ(z) });
const ASK_DATE = " Give the day, month and year.";

function randWorkday(rng, hol = []) {
  return nextWork(zOf(rng.int(2026, 2028), rng.int(1, 12), rng.int(1, 28)), hol);
}
// `count` distinct working weekdays strictly after z0 and not after z1 (holidays to state)
function pickHolidays(rng, z0, z1, count) {
  const days = [];
  for (let z = z0 + 1; z <= z1; z++) if (isWork(z, [])) days.push(z);
  return rng.shuffle(days).slice(0, Math.min(count, days.length)).sort((a, b) => a - b);
}
const holText = (hol) => `No work is done on these public holidays: ${hol.map(fmtZ).join(", ")}.`;
const countWork = (z1, z2, hol) => { let c = 0; for (let z = z1; z <= z2; z++) if (isWork(z, hol)) c++; return c; };

function genDates(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["finish", "weekday", "wdcount"]);
    const z = randWorkday(rng);
    if (kind === "wdcount") {
      const z2 = nextWork(z + rng.int(4, 20), []);
      return {
        prompt: `${WORK_RULES} How many **working days** are there from **${fmtWD(z)}** to **${fmtWD(z2)}**, counting both the first and the last day?`,
        answerType: "number", answer: countWork(z, z2, []), tolerance: 0, ...EXACT,
        explanation: `From ${fmtZ(z)} to ${fmtZ(z2)} is ${z2 - z + 1} calendar days. Remove the Saturdays and Sundays in between: **${countWork(z, z2, [])}** working days.`,
        hints: ["Count the calendar days, counting both ends.", "Take away the weekend days (Saturday and Sunday) that fall in between."],
        params: { kind, z, z2, hol: [], diff: difficulty },
      };
    }
    const n = rng.int(3, 10);
    const fin = addWork(z, n, []);
    if (kind === "weekday") {
      const correct = WEEKDAYS[weekdayOfDays(fin)];
      return {
        prompt: `${WORK_RULES} An activity of **${n} working days** starts on **${fmtWD(z)}**. On which day of the week does it finish?`,
        ...plainPick(rng, correct, WEEKDAYS.slice(1, 6)),
        explanation: `Day 1 is ${fmtWD(z)}. Counting ${n} working days and skipping the weekends, it finishes on **${fmtWD(fin)}**.`,
        hints: [`Day 1 is the start day, so count ${n - 1} more working days after it.`, "Skip Saturday and Sunday when you count."],
        params: { kind, z, n, hol: [], diff: difficulty },
      };
    }
    return {
      prompt: `${WORK_RULES} An activity of **${n} working days** starts on **${fmtWD(z)}**. On what date does it finish?${ASK_DATE}`,
      ...dateAns(fin),
      explanation: `Day 1 is ${fmtWD(z)}. Counting ${n} working days and skipping weekends gives **${fmtWD(fin)}**.`,
      hints: [`Day 1 is the start day, so count ${n - 1} more working days after it.`, "Skip Saturday and Sunday when you count: Friday is followed by Monday."],
      params: { kind, z, n, hol: [], diff: difficulty },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["finish", "span", "next"]);
    const z = randWorkday(rng);
    if (kind === "next") {
      const n = rng.int(8, 25);
      const fin = addWork(z, n, []);
      const nxt = nextWork(fin + 1, []);
      return {
        prompt: `${WORK_RULES} Task 1 of **${n} working days** starts on **${fmtWD(z)}**. Task 2 starts on the first working day after Task 1 finishes. On what date does Task 2 start?${ASK_DATE}`,
        ...dateAns(nxt),
        explanation: `Task 1 finishes on ${fmtWD(fin)}. The next working day is **${fmtWD(nxt)}**.`,
        hints: [`Find Task 1's finish date first: day 1 is the start day, then ${n - 1} more working days.`, "Task 2 starts on the next working day after that, skipping a weekend if needed."],
        params: { kind, z, n, hol: [], diff: difficulty },
      };
    }
    const n = rng.int(11, 30);
    const fin = addWork(z, n, []);
    if (kind === "span") {
      return {
        prompt: `${WORK_RULES} An activity of **${n} working days** starts on **${fmtWD(z)}**. How many **calendar days** does it occupy, from its first day to its last day, counting both?`,
        answerType: "number", answer: fin - z + 1, tolerance: 0, ...EXACT,
        explanation: `It finishes on ${fmtWD(fin)}. From ${fmtZ(z)} to ${fmtZ(fin)}, counting both ends, is **${fin - z + 1}** calendar days.`,
        hints: [`Find the finish date: day 1 is the start day, then ${n - 1} more working days.`, "Count the calendar days between the two dates, both ends included."],
        params: { kind, z, n, hol: [], diff: difficulty },
      };
    }
    return {
      prompt: `${WORK_RULES} An activity of **${n} working days** starts on **${fmtWD(z)}**. On what date does it finish?${ASK_DATE}`,
      ...dateAns(fin),
      explanation: `${n} working days is ${Math.floor((n - 1) / 5)} full week(s) and ${(n - 1) % 5} more working day(s) after day 1. The finish date is **${fmtWD(fin)}**.`,
      hints: ["Five working days make one calendar week, so count whole weeks first.", `Day 1 is the start day: after day 1 there are ${n - 1} more working days to count, skipping weekends.`],
      params: { kind, z, n, hol: [], diff: difficulty },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["finish", "latest", "wdcount"]);
    if (kind === "finish") {
      const z = randWorkday(rng);
      const n = rng.int(15, 40);
      const hol = pickHolidays(rng, z, addWork(z, n, []), rng.int(1, 3));
      const fin = addWork(z, n, hol);
      return {
        prompt: `${WORK_RULES} ${holText(hol)} An activity of **${n} working days** starts on **${fmtWD(z)}**. On what date does it finish?${ASK_DATE}`,
        ...dateAns(fin),
        explanation: `Weekends and the ${plural(hol.length, "holiday")} are not worked. Without the holidays it would finish on ${fmtZ(addWork(z, n, []))}; each holiday on a weekday inside the period pushes the finish back one working day: **${fmtWD(fin)}**.`,
        hints: ["Treat each holiday exactly like a weekend day: it is skipped.", `Count ${n - 1} working days after day 1, skipping weekends and the listed holidays.`],
        params: { kind, z, n, hol, diff: difficulty },
      };
    }
    if (kind === "latest") {
      const dead = randWorkday(rng);
      const n = rng.int(10, 30);
      const hol = pickHolidays(rng, backWork(dead, n, []), dead - 1, rng.int(1, 3)).filter((h) => h !== dead);
      const st = backWork(dead, n, hol);
      return {
        prompt: `${WORK_RULES} ${holText(hol)} An activity of **${n} working days** must finish by the end of **${fmtWD(dead)}**. What is the **latest start date** that still meets the deadline?${ASK_DATE}`,
        ...dateAns(st),
        explanation: `Count backwards: ${fmtZ(dead)} is the last day (day ${n}), then step back ${n - 1} working days, skipping weekends and holidays. The latest start is **${fmtWD(st)}**.`,
        hints: ["Work backwards from the deadline: it is the last working day of the activity.", `Step back ${n - 1} working days, skipping weekends and the listed holidays.`],
        params: { kind, dead, n, hol, diff: difficulty },
      };
    }
    const z = randWorkday(rng);
    const z2 = nextWork(z + rng.int(14, 45), []);
    const hol = pickHolidays(rng, z, z2 - 1, rng.int(1, 3));
    const c = countWork(z, z2, hol);
    return {
      prompt: `${WORK_RULES} ${holText(hol)} How many **working days** are there from **${fmtWD(z)}** to **${fmtWD(z2)}**, counting both the first and the last day?`,
      answerType: "number", answer: c, tolerance: 0, ...EXACT,
      explanation: `${z2 - z + 1} calendar days, minus the weekend days and the ${plural(hol.length, "holiday")} that fall on weekdays: **${c}** working days.`,
      hints: ["Count the calendar days in the period, both ends included.", "Take away all Saturdays and Sundays, then the listed holidays (they are weekdays, so they are not double counted)."],
      params: { kind: "wdcount", z, z2, hol, diff: difficulty },
    };
  }

  // expert
  const kind = rng.pick(["sequence", "join"]);
  const z = randWorkday(rng);
  if (kind === "sequence") {
    const ns = [rng.int(5, 15), rng.int(5, 15), rng.int(5, 15)];
    const span = addWork(z, sum(ns) + 3, []);
    const hol = rng.next() < 0.6 ? pickHolidays(rng, z, span - 10, rng.int(1, 2)) : [];
    let s = z;
    const fins = ns.map((n) => { const f = addWork(s, n, hol); s = nextWork(f + 1, hol); return f; });
    const parts = ["A", "B", "C"].map((t, i) => ({
      id: `fin-${t.toLowerCase()}`, label: `Task ${t}`, ask: `Finish date of Task ${t}`, ...dateAns(fins[i]),
      hint: i === 0 ? "Count working days from the start date, which is day 1." : `Task ${t} starts on the first working day after Task ${["A", "B"][i - 1]} finishes.`,
    }));
    return {
      prompt: `${WORK_RULES} ${hol.length ? holText(hol) + " " : ""}Three tasks run one after another: each starts on the **first working day after the previous one finishes**. Task A (**${ns[0]}** working days) starts on **${fmtWD(z)}**, Task B takes **${ns[1]}** and Task C takes **${ns[2]}**. Give the finish date of each task.${ASK_DATE}`,
      answerType: "multi", parts,
      explanation: `A: ${fmtZ(z)} + ${ns[0]} working days → **${fmtWD(fins[0])}**. B starts ${fmtWD(nextWork(fins[0] + 1, hol))} → **${fmtWD(fins[1])}**. C starts ${fmtWD(nextWork(fins[1] + 1, hol))} → **${fmtWD(fins[2])}**.`,
      params: { kind, z, ns, hol, diff: difficulty },
    };
  }
  let nA, nB;
  do { nA = rng.int(5, 18); nB = rng.int(5, 18); } while (Math.abs(nA - nB) < 2);
  const nC = rng.int(5, 15);
  const hol = rng.next() < 0.6 ? pickHolidays(rng, z, addWork(z, Math.max(nA, nB) + nC, []) - 5, rng.int(1, 2)) : [];
  const fa = addWork(z, nA, hol), fb = addWork(z, nB, hol);
  const sc = nextWork(Math.max(fa, fb) + 1, hol), fc = addWork(sc, nC, hol);
  const which = fa > fb ? "Task A" : "Task B";
  const parts = [
    { id: "slow", label: "Slower task", ask: "Which task holds up Task C?", answerType: "choice", choices: rng.shuffle(["Task A", "Task B"]), answer: which, hint: "Task C can only start after both A and B have finished: which finishes later?" },
    { id: "start-c", label: "Task C start", ask: "Start date of Task C", ...dateAns(sc), hint: "The first working day after the later of the two finish dates." },
    { id: "finish-c", label: "Project finish", ask: "Finish date of Task C (the project)", ...dateAns(fc), hint: "Count Task C's working days from its start date, which is day 1." },
  ];
  return {
    prompt: `${WORK_RULES} ${hol.length ? holText(hol) + " " : ""}Tasks A (**${nA}** working days) and B (**${nB}** working days) both start on **${fmtWD(z)}**. Task C (**${nC}** working days) starts on the first working day after **both** A and B have finished. Say which task holds up Task C, then give C's start date and the project's finish date.${ASK_DATE}`,
    answerType: "multi", parts,
    explanation: `A finishes ${fmtWD(fa)}, B finishes ${fmtWD(fb)}, so **${which}** is the later one. C starts on ${fmtWD(sc)} and finishes on **${fmtWD(fc)}**.`,
    params: { kind, z, nA, nB, nC, hol, diff: difficulty },
  };
}

// =====================================================================
// Earned value
// =====================================================================
const IDX = [0.5, 0.6, 0.75, 0.8, 0.9, 1.2, 1.25, 1.5];
const EV_TERMS = "**PV** (planned value) is the budgeted cost of the work scheduled by now, **EV** (earned value) the budgeted cost of the work actually done, **AC** (actual cost) what has really been spent, and **BAC** the total budget.";
const SIGN_RULE = "A positive SV means ahead of schedule and a positive CV means under budget.";

function drawEV(rng) {
  for (let t = 0; t < 500; t++) {
    const cpi = rng.pick(IDX), spi = rng.pick(IDX);
    if (cpi === spi) continue;
    const ac = 1000 * rng.int(12, 90);
    const ev = Math.round(ac * cpi);
    const pvRaw = ev / spi;
    if (!nearInt(pvRaw)) continue;
    const pv = Math.round(pvRaw);
    const top = Math.max(pv, ev, ac);
    let bac = 0;
    for (let k = 0; k < 30 && !bac; k++) {
      const b = 1000 * rng.int(Math.ceil((1.4 * top) / 1000), Math.ceil((2.6 * top) / 1000));
      if (nearInt(b / cpi)) bac = b;
    }
    if (!bac) continue;
    return { cpi, spi, ac, ev, pv, bac, eac: Math.round(bac / cpi) };
  }
  throw new Error("no earned-value draw");
}
function drawPercent(rng) {
  for (let t = 0; t < 500; t++) {
    const bac = 10000 * rng.int(4, 20);
    const planned = 5 * rng.int(4, 16), actual = 5 * rng.int(3, 17);
    if (planned === actual) continue;
    const cpi = rng.pick(IDX);
    const ev = (bac * actual) / 100, pv = (bac * planned) / 100;
    if (!nearInt(ev / cpi) || !nearInt(bac / cpi) || Math.abs(ev / pv - cpi) < 0.02) continue;
    return { bac, planned, actual, cpi, ev, pv, ac: Math.round(ev / cpi), eac: Math.round(bac / cpi), spi: ev / pv };
  }
  throw new Error("no percent draw");
}
const GIVEN_EV = (d) => [{ label: "_pv", value: d.pv }, { label: "_ev", value: d.ev }, { label: "_ac", value: d.ac }, { label: "_bac", value: d.bac }];
const scheduleWord = (sv) => (sv > 0 ? "Ahead of schedule" : sv < 0 ? "Behind schedule" : "On schedule");
const costWord = (cv) => (cv > 0 ? "Under budget" : cv < 0 ? "Over budget" : "On budget");
const factsLine = (d) => `PV = ${money(d.pv)}, EV = ${money(d.ev)}, AC = ${money(d.ac)}`;

function statusSeg(rng, d, diff) {
  const correct = [scheduleWord(d.ev - d.pv), costWord(d.ev - d.ac), d.spi < d.cpi ? "SPI" : "CPI"];
  const alts = [
    ["Ahead of schedule", "Behind schedule", "On schedule"].filter((v) => v !== correct[0]),
    ["Under budget", "Over budget", "On budget"].filter((v) => v !== correct[1]),
    [correct[2] === "SPI" ? "CPI" : "SPI"],
  ];
  return segSet(rng, ["Schedule", "Cost", "Weaker index"], correct, alts, SEG_OPTIONS(diff));
}

function genEarned(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["cv", "sv", "overunder"]);
    const d = drawEV(rng);
    const base = { given: GIVEN_EV(d), params: { kind, d, diff: difficulty } };
    if (kind === "cv") {
      return {
        prompt: `${EV_TERMS} A project has EV = **${money(d.ev)}** and AC = **${money(d.ac)}**. Cost variance is **CV = EV − AC**. What is the CV, in dollars? (A negative answer means over budget.)`,
        answerType: "number", answer: d.ev - d.ac, tolerance: 0, ...base,
        explanation: `CV = EV − AC: \`_ev - _ac\` = ${d.ev} − ${d.ac} = **${d.ev - d.ac}**, so the project is ${costWord(d.ev - d.ac).toLowerCase()}.`,
        hints: ["CV = EV − AC.", "Subtract the actual cost from the earned value; the sign matters."],
      };
    }
    if (kind === "sv") {
      return {
        prompt: `${EV_TERMS} A project has EV = **${money(d.ev)}** and PV = **${money(d.pv)}**. Schedule variance is **SV = EV − PV**. What is the SV, in dollars? (A negative answer means behind schedule.)`,
        answerType: "number", answer: d.ev - d.pv, tolerance: 0, ...base,
        explanation: `SV = EV − PV: \`_ev - _pv\` = ${d.ev} − ${d.pv} = **${d.ev - d.pv}**, so the project is ${scheduleWord(d.ev - d.pv).toLowerCase()}.`,
        hints: ["SV = EV − PV.", "Subtract the planned value from the earned value; the sign matters."],
      };
    }
    const correct = costWord(d.ev - d.ac);
    return {
      prompt: `${EV_TERMS} ${SIGN_RULE} A project has EV = **${money(d.ev)}** and AC = **${money(d.ac)}**. Is it over or under budget?`,
      ...plainPick(rng, correct, ["Over budget", "Under budget", "On budget"], 3), ...base,
      explanation: `CV = EV − AC = ${d.ev} − ${d.ac} = ${d.ev - d.ac}, so the project is **${correct.toLowerCase()}**.`,
      hints: ["Compare the value of the work done (EV) with what was spent (AC).", "Work out CV = EV − AC, then read its sign with the rule given in the question."],
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["cpi", "spi", "eac"]);
    const d = drawEV(rng);
    const base = { given: GIVEN_EV(d), params: { kind, d, diff: difficulty } };
    if (kind === "cpi") {
      return {
        prompt: `${EV_TERMS} A project has EV = **${money(d.ev)}** and AC = **${money(d.ac)}**. The cost performance index is **CPI = EV ÷ AC**. What is the CPI? (It works out exactly to 2 decimal places.)`,
        answerType: "number", answer: d.cpi, tolerance: 0, ...base,
        explanation: `CPI = EV ÷ AC: \`_ev / _ac\` = ${d.ev} / ${d.ac} = **${d.cpi}**. ${d.cpi < 1 ? "Below 1: you get less than $1 of work for each $1 spent." : "Above 1: you get more than $1 of work for each $1 spent."}`,
        hints: ["CPI = EV ÷ AC.", "Divide the earned value by the actual cost."],
      };
    }
    if (kind === "spi") {
      return {
        prompt: `${EV_TERMS} A project has EV = **${money(d.ev)}** and PV = **${money(d.pv)}**. The schedule performance index is **SPI = EV ÷ PV**. What is the SPI? (It works out exactly to 2 decimal places.)`,
        answerType: "number", answer: d.spi, tolerance: 0, ...base,
        explanation: `SPI = EV ÷ PV: \`_ev / _pv\` = ${d.ev} / ${d.pv} = **${d.spi}**. ${d.spi < 1 ? "Below 1: behind schedule." : "Above 1: ahead of schedule."}`,
        hints: ["SPI = EV ÷ PV.", "Divide the earned value by the planned value."],
      };
    }
    return {
      prompt: `${EV_TERMS} A project has a budget of BAC = **${money(d.bac)}**, EV = **${money(d.ev)}** and AC = **${money(d.ac)}**. If the cost efficiency stays the same, the estimate at completion is **EAC = BAC ÷ CPI**, where CPI = EV ÷ AC. What is the EAC, in dollars?`,
      answerType: "number", answer: d.eac, tolerance: 0, ...base,
      explanation: `CPI = EV ÷ AC = ${d.ev} / ${d.ac} = ${d.cpi}. EAC = BAC ÷ CPI: \`_bac / (_ev / _ac)\` = ${d.bac} / ${d.cpi} = **${d.eac}**.`,
      hints: ["Find the CPI first: EV ÷ AC.", "Then divide the budget by the CPI."],
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["four", "forecast"]);
    const d = drawEV(rng);
    const base = { given: GIVEN_EV(d), params: { kind, d, diff: difficulty } };
    if (kind === "four") {
      const parts = [
        { id: "cv", label: "CV", ask: "Cost variance CV = EV − AC ($)", answerType: "number", answer: d.ev - d.ac, tolerance: 0, hint: "Earned value minus actual cost." },
        { id: "sv", label: "SV", ask: "Schedule variance SV = EV − PV ($)", answerType: "number", answer: d.ev - d.pv, tolerance: 0, hint: "Earned value minus planned value." },
        { id: "cpi", label: "CPI", ask: "CPI = EV ÷ AC (2 decimal places)", answerType: "number", answer: d.cpi, tolerance: 0, hint: "Earned value divided by actual cost." },
        { id: "spi", label: "SPI", ask: "SPI = EV ÷ PV (2 decimal places)", answerType: "number", answer: d.spi, tolerance: 0, hint: "Earned value divided by planned value." },
      ];
      return {
        prompt: `${EV_TERMS} At a status date: ${factsLine(d)}. Work out the cost variance (CV = EV − AC), the schedule variance (SV = EV − PV), the cost performance index (CPI = EV ÷ AC) and the schedule performance index (SPI = EV ÷ PV). Each index works out exactly to 2 decimal places.`,
        answerType: "multi", parts, ...base,
        explanation: `CV = ${d.ev} − ${d.ac} = **${d.ev - d.ac}**; SV = ${d.ev} − ${d.pv} = **${d.ev - d.pv}**; CPI = ${d.ev} / ${d.ac} = **${d.cpi}**; SPI = ${d.ev} / ${d.pv} = **${d.spi}**.`,
      };
    }
    const parts = [
      { id: "cpi", label: "CPI", ask: "CPI = EV ÷ AC (2 decimal places)", answerType: "number", answer: d.cpi, tolerance: 0, hint: "Earned value divided by actual cost." },
      { id: "eac", label: "EAC", ask: "Estimate at completion, EAC = BAC ÷ CPI ($)", answerType: "number", answer: d.eac, tolerance: 0, hint: "Divide the budget by the CPI." },
      { id: "etc", label: "ETC", ask: "Estimate to complete, ETC = EAC − AC ($)", answerType: "number", answer: d.eac - d.ac, tolerance: 0, hint: "What is still to be spent: the forecast total minus what has been spent." },
    ];
    return {
      prompt: `${EV_TERMS} A project has BAC = **${money(d.bac)}**, EV = **${money(d.ev)}** and AC = **${money(d.ac)}**. Assuming cost efficiency stays the same, work out the CPI (EV ÷ AC, exactly 2 decimal places), the estimate at completion (EAC = BAC ÷ CPI) and the estimate to complete (ETC = EAC − AC).`,
      answerType: "multi", parts, ...base,
      explanation: `CPI = ${d.ev} / ${d.ac} = **${d.cpi}**. EAC = ${d.bac} / ${d.cpi} = **${d.eac}**. ETC = ${d.eac} − ${d.ac} = **${d.eac - d.ac}**.`,
    };
  }

  // expert
  const kind = rng.pick(["status", "percent"]);
  if (kind === "status") {
    const d = drawEV(rng);
    const parts = [
      { id: "eac", label: "EAC", ask: "Estimate at completion, EAC = BAC ÷ CPI ($)", answerType: "number", answer: d.eac, tolerance: 0, hint: "CPI = EV ÷ AC first, then divide the budget by it." },
      { id: "vac", label: "VAC", ask: "Variance at completion, VAC = BAC − EAC ($, negative if over)", answerType: "number", answer: d.bac - d.eac, tolerance: 0, hint: "Budget minus the forecast total: negative means a forecast overrun." },
      { id: "status", label: "Status", ask: "Schedule | Cost | Weaker index", ...statusSeg(rng, d, difficulty), hint: "Signs of SV and CV tell ahead/behind and under/over; the weaker index is the one that is lower." },
    ];
    return {
      prompt: `${EV_TERMS} ${SIGN_RULE} At a status date: BAC = **${money(d.bac)}**, ${factsLine(d)}. Use CPI = EV ÷ AC, SPI = EV ÷ PV, EAC = BAC ÷ CPI and VAC = BAC − EAC. Give the EAC, the VAC, and the status: the schedule position, the cost position, and which index (SPI or CPI) is the **lower**.`,
      answerType: "multi", parts, given: GIVEN_EV(d),
      explanation: `CPI = ${d.ev} / ${d.ac} = ${d.cpi}; SPI = ${d.ev} / ${d.pv} = ${d.spi}. EAC = ${d.bac} / ${d.cpi} = **${d.eac}**; VAC = ${d.bac} − ${d.eac} = **${d.bac - d.eac}**. SV = ${d.ev - d.pv} (${scheduleWord(d.ev - d.pv).toLowerCase()}), CV = ${d.ev - d.ac} (${costWord(d.ev - d.ac).toLowerCase()}), and the lower index is **${d.spi < d.cpi ? "SPI" : "CPI"}**.`,
      params: { kind, d, diff: difficulty },
    };
  }
  const d = drawPercent(rng);
  const parts = [
    { id: "ev", label: "EV", ask: "Earned value ($)", answerType: "number", answer: d.ev, tolerance: 0, hint: "Budget × the share of the work actually done." },
    { id: "cpi", label: "CPI", ask: "CPI = EV ÷ AC (2 decimal places)", answerType: "number", answer: d.cpi, tolerance: 0, hint: "Use the EV you just found, divided by the actual cost." },
    { id: "eac", label: "EAC", ask: "Estimate at completion, EAC = BAC ÷ CPI ($)", answerType: "number", answer: d.eac, tolerance: 0, hint: "Divide the budget by the CPI." },
    { id: "status", label: "Status", ask: "Schedule | Cost | Weaker index", ...statusSeg(rng, d, difficulty), hint: "Planned value is the budget × the share planned by now; compare EV with PV and with AC." },
  ];
  return {
    prompt: `${EV_TERMS} ${SIGN_RULE} A project has BAC = **${money(d.bac)}**. By the status date **${d.planned}%** of the work was planned to be done, but **${d.actual}%** is actually done, and **${money(d.ac)}** has been spent. Use EV = BAC × % done, PV = BAC × % planned, CPI = EV ÷ AC, SPI = EV ÷ PV and EAC = BAC ÷ CPI (every value works out exactly). Give the EV, the CPI, the EAC, and the status: the schedule position, the cost position, and which index (SPI or CPI) is the **lower**.`,
    answerType: "multi", parts, given: [{ label: "_bac", value: d.bac }, { label: "_ac", value: d.ac }],
    explanation: `EV = ${d.bac} × ${d.actual}% = **${d.ev}**; PV = ${d.bac} × ${d.planned}% = ${d.pv}. CPI = ${d.ev} / ${d.ac} = **${d.cpi}**; SPI = ${d.ev} / ${d.pv} ≈ ${d.spi.toFixed(2)}. EAC = ${d.bac} / ${d.cpi} = **${d.eac}**. SV = ${d.ev - d.pv} (${scheduleWord(d.ev - d.pv).toLowerCase()}), CV = ${d.ev - d.ac} (${costWord(d.ev - d.ac).toLowerCase()}); lower index **${d.spi < d.cpi ? "SPI" : "CPI"}**.`,
    params: { kind: "percent", d, diff: difficulty },
  };
}

// =====================================================================
export function generate({ subtopic, difficulty, rng }) {
  switch (subtopic) {
    case "critical-path": return genCritical(difficulty, rng);
    case "float": return genFloat(difficulty, rng);
    case "gantt-dates": return genDates(difficulty, rng);
    case "earned-value": return genEarned(difficulty, rng);
    default: throw new Error(`unknown subtopic ${subtopic}`);
  }
}

// =====================================================================
// verify(): independent recomputation
// =====================================================================
// ---- networks: enumerate every route, built backwards from the activities nobody follows ----
function vPaths(acts) {
  const by = Object.fromEntries(acts.map((a) => [a.id, a]));
  const out = [];
  const back = (id, tail) => {
    const p = [id, ...tail];
    if (!by[id].pre.length) out.push(p);
    else by[id].pre.forEach((q) => back(q, p));
  };
  acts.filter((a) => !acts.some((b) => b.pre.includes(a.id))).forEach((e) => back(e.id, []));
  return out;
}
function vModel(acts, change = {}) {
  const dur = Object.fromEntries(acts.map((a) => [a.id, a.d + (change[a.id] || 0)]));
  const paths = vPaths(acts);
  const len = (p) => sum(p.map((id) => dur[id]));
  const D = Math.max(...paths.map(len));
  const longest = paths.filter((p) => len(p) === D);
  const ES = {}, EF = {}, LS = {}, TF = {}, FF = {};
  for (const a of acts) {
    const through = paths.filter((p) => p.includes(a.id));
    ES[a.id] = Math.max(...through.map((p) => len(p.slice(0, p.indexOf(a.id)))));
    EF[a.id] = ES[a.id] + dur[a.id];
    LS[a.id] = D - Math.max(...through.map((p) => len(p.slice(p.indexOf(a.id)))));
    TF[a.id] = LS[a.id] - ES[a.id];
  }
  for (const a of acts) {
    const nxt = acts.filter((b) => b.pre.includes(a.id));
    FF[a.id] = (nxt.length ? Math.min(...nxt.map((b) => ES[b.id])) : D) - EF[a.id];
  }
  return { dur, paths, D, longest, ES, EF, LS, TF, FF };
}

// ---- dates: the platform's Date, stepping day by day ----
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
const vFinish = (ms, n, hol) => { let c = 0; for (;; ms += DAYMS) if (vWork(ms, hol) && ++c === n) return ms; };
const vBack = (ms, n, hol) => { let c = 0; for (;; ms -= DAYMS) if (vWork(ms, hol) && ++c === n) return ms; };
const vNext = (ms, hol) => { do ms += DAYMS; while (!vWork(ms, hol)); return ms; };
const WDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function expected(p) {
  const ms = (z) => z * DAYMS;
  const hol = (p.hol || []).map(ms);
  switch (p.kind) {
    // ---- networks ----
    case "duration": return vModel(p.acts).D;
    case "path": { const m = vModel(p.acts); return m.longest.length === 1 ? m.longest[0].join(SEP) : null; }
    case "ncrit": { const m = vModel(p.acts); return m.longest.length === 1 ? m.longest[0].length : null; }
    case "wdcount": { let c = 0; for (let t = ms(p.z); t <= ms(p.z2); t += DAYMS) if (vWork(t, hol)) c++; return c; }
    case "seg": {
      const m = vModel(p.acts);
      if (m.longest.length !== 1) return null;
      const free = p.acts.filter((a) => !m.longest[0].includes(a.id)).sort((a, b) => m.TF[b.id] - m.TF[a.id]);
      return [String(m.D), m.longest[0].join(SEP), free[0].id].join(" | ");
    }
    case "shorten": return vModel(p.acts, { [p.x]: -p.k }).D;
    case "cpm3": { const m = vModel(p.acts); return { duration: m.D, path: m.longest[0].join(SEP), ef: m.EF[p.y] }; }
    case "delay": { const m = vModel(p.acts); return { es: m.ES[p.x], ls: m.LS[p.x], new: vModel(p.acts, { [p.x]: p.k }).D }; }
    case "slip": {
      const f = vModel(p.acts).TF[p.x], late = Math.max(0, vModel(p.acts, { [p.x]: p.k }).D - vModel(p.acts).D);
      return { finish: late > 0 ? "Later" : "Unchanged", later: late, left: Math.max(0, f - p.k) };
    }
    case "es-ls": return p.ls - p.es;
    case "ef-lf": return p.lf - (p.es + p.d);
    case "net": return vModel(p.acts).TF[p.x];
    case "ff": { const m = vModel(p.acts); return { total: m.TF[p.x], free: m.FF[p.x] }; }
    case "two": return vModel(p.acts, { [p.x]: p.dx, [p.y]: p.dy }).D;
    case "chain": { const m = vModel(p.acts); return { fx: m.TF[p.x], fy: m.TF[p.y], new: vModel(p.acts, { [p.x]: p.dx, [p.y]: p.dy }).D }; }
    case "crash": return { one: bruteCrash(p.acts, p.D - 1), many: bruteCrash(p.acts, p.D - p.N) };
    // ---- dates ----
    case "finish": return vFinish(ms(p.z), p.n, hol);
    case "weekday": return WDAY[new Date(vFinish(ms(p.z), p.n, hol)).getUTCDay()];
    case "span": return Math.round((vFinish(ms(p.z), p.n, hol) - ms(p.z)) / DAYMS) + 1;
    case "next": return vNext(vFinish(ms(p.z), p.n, hol), hol);
    case "latest": return vBack(ms(p.dead), p.n, hol);
    case "sequence": {
      let s = ms(p.z);
      const out = {};
      p.ns.forEach((n, i) => { const f = vFinish(s, n, hol); out[`fin-${"abc"[i]}`] = f; s = vNext(f, hol); });
      return out;
    }
    case "join": {
      const fa = vFinish(ms(p.z), p.nA, hol), fb = vFinish(ms(p.z), p.nB, hol);
      if (fa === fb) return null;
      const sc = vNext(Math.max(fa, fb), hol);
      return { slow: fa > fb ? "Task A" : "Task B", "start-c": sc, "finish-c": vFinish(sc, p.nC, hol) };
    }
    // ---- earned value ----
    case "cv": return p.d.ev - p.d.ac;
    case "sv": return p.d.ev - p.d.pv;
    case "overunder": return p.d.ev - p.d.ac > 0 ? "Under budget" : p.d.ev - p.d.ac < 0 ? "Over budget" : "On budget";
    case "cpi": return p.d.ev / p.d.ac;
    case "spi": return p.d.ev / p.d.pv;
    case "eac": return p.d.bac / (p.d.ev / p.d.ac);
    case "four": return { cv: p.d.ev - p.d.ac, sv: p.d.ev - p.d.pv, cpi: p.d.ev / p.d.ac, spi: p.d.ev / p.d.pv };
    case "forecast": { const cpi = p.d.ev / p.d.ac; const eac = p.d.bac / cpi; return { cpi, eac, etc: eac - p.d.ac }; }
    case "percent": {
      const d = p.d, ev = (d.bac * d.actual) / 100, pv = (d.bac * d.planned) / 100;
      const cpi = ev / d.ac;
      return { ev, cpi, eac: d.bac / cpi, status: statusExpected({ ev, pv, ac: d.ac }) };
    }
  }
  return null;
}
function statusExpected(d) {
  const spi = d.ev / d.pv, cpi = d.ev / d.ac;
  const s = d.ev - d.pv, c = d.ev - d.ac;
  return [s > 0 ? "Ahead of schedule" : s < 0 ? "Behind schedule" : "On schedule", c > 0 ? "Under budget" : c < 0 ? "Over budget" : "On budget", spi < cpi ? "SPI" : "CPI"].join(" | ");
}

// "status" kind is shared: a plain EV draw (expert, parts eac/vac/status) vs percent
function expectedTop(p) {
  if (p.kind === "status") {
    const d = p.d, cpi = d.ev / d.ac, eac = d.bac / cpi;
    return { eac, vac: d.bac - eac, status: statusExpected(d) };
  }
  return expected(p);
}

function sameItem(item, given, want) {
  if (want === null || want === undefined) return false;
  if (item.answerType === "number") return typeof given === "number" && typeof want === "number" && Number.isFinite(given) && close(given, want);
  if (item.answerType === "date") return typeof want === "number" && readDate(given) === want;
  if (item.answerType === "choice") {
    const opts = (item.choices || []).map((o) => (Array.isArray(o) ? o.join(" | ") : String(o)));
    if (opts.filter((o) => o === want).length !== 1) return false;
    const g = Array.isArray(given) ? given.join(" | ") : String(given);
    return g === want;
  }
  return false;
}

export function verify(question, answer) {
  try {
    const p = question.params;
    if (!p) return false;
    const want = expectedTop(p);
    if (question.answerType === "multi") {
      if (!want || typeof want !== "object" || !answer || typeof answer !== "object") return false;
      if (question.parts.length !== Object.keys(want).length) return false;
      return question.parts.every((part) => sameItem(part, answer[part.id], want[part.id]));
    }
    return sameItem(question, answer, want);
  } catch {
    return false;
  }
}
