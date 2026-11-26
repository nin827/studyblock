// Sports Analyst role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// Inputs are drawn so each chained answer is exact (or a rounded earlier answer would not change a
// later one), no answer sits on a rounding half-step, and verdict parts are decided first and then
// fitted (and kept clear of their threshold). All teams, players and figures are made up; points
// rules, rating formulas and thresholds are exercise rules stated in each prompt. Probabilities are
// stated chances for independent matches (expected points and chances, nothing to do with wagers).
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   race-pace     pace from a time -> finish at another distance -> splits -> target / pacing plan with stops
//   league-table  a team's record -> table from results (3/1/0, stated tie-break) -> rank -> run-in maths
//   player-stats  per-90 rates and shooting % -> compare players -> stated rating formula -> signing rule
//   win-chances   expected points -> chances over two and three matches -> qualifying chance, from stated odds

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
const TRY = 30000;
const tooMany = () => { throw new Error("role-sports-analyst: no suitable draw"); };
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const pad2 = (n) => String(n).padStart(2, "0");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sgn = (n) => (n > 0 ? `+${n}` : String(n));
const poss = (s) => (/s$/.test(s) ? `${s}'` : `${s}'s`);
const plural = (n, w) => `**${n}** ${w}${n === 1 ? "" : "s"}`;

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
function choicePart(rng, id, label, ask, options, ans, hint) {
  return { id, label, ask, answerType: "choice", answer: ans, choices: shuffled(rng, options), hint };
}
// Durations as text: m:ss, or h:mm:ss from one hour.
function fmtT(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`;
}
function timePart(id, label, ask, s, unit, hint) {
  const t = fmtT(s), m = Math.floor((s % 3600) / 60), x = s % 60, acc = [];
  if (s < 3600) { if (m < 10) acc.push(`0${t}`); acc.push(`0:${pad2(m)}:${pad2(x)}`); }
  else acc.push(`0${t}`);
  return { id, label, ask: `${ask} (${unit})`, answerType: "text", answer: t, accepts: acc, fuzzy: false, hint };
}
const U_PACE = "m:ss per km", U_TIME = "m:ss, or h:mm:ss from one hour";
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const q = { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, hints };
  if (given && given.length) q.given = givenRows(given);
  return q;
}

// ---------- race-pace ----------
// Times are integer seconds; distances are kept in tenths of a km where a decimal is needed.

const DIST_LABEL = (t) => (t === 211 ? "half marathon (21.1 km)" : t === 422 ? "marathon (42.2 km)" : `${f(t / 10)} km`);

function genRace(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const D = rng.pick([5, 8, 10, 12, 15, 16, 20]), p = rng.int(250, 400), T = p * D;
      const d2 = rng.pick([50, 80, 100, 150, 200, 211, 250, 300, 422]);
      if (d2 === D * 10 || (p * d2) % 10 === 5) continue;
      const T2 = Math.floor((p * d2 + 5) / 10);
      const parts = [
        timePart("pace", "Average pace", "Average pace over the race", p, U_PACE, "Pace is time per kilometre: change the time to seconds, divide by the distance, then write the answer as minutes and seconds."),
        timePart("time2", "Finish time", `Finish time over the ${DIST_LABEL(d2)} at that pace, to the nearest second`, T2, U_TIME, "Time = pace × distance. Work in seconds, then change back to minutes and seconds."),
      ];
      const ex = `**Pace:** ${fmtT(T)} is ${T} s, and ${T} ÷ ${D} = ${p} s per km = **${fmtT(p)}** per km.\n\n**Finish:** ${p} × ${f(d2 / 10)} = ${f(p * d2 / 10)} s, which is **${fmtT(T2)}** to the nearest second.`;
      return finish(`A runner finishes a **${D} km** race in **${fmtT(T)}** and then plans a **${DIST_LABEL(d2)}** run at the same pace all the way.`,
        parts, ex, "rc1", { tier, D, p, d2 }, [["_dist", D], ["_dist2", d2 / 10]],
        ["Change the time to seconds first.", "Pace per km times the distance gives a time."]);
    }
    // hard / expert: two halves at different paces
    const D = rng.pick([10, 12, 16, 20, 24, 30]), H = D / 2, p1 = rng.int(250, 400), d = 2 * rng.int(3, 10);
    const neg = rng.next() < 0.5, p2 = neg ? p1 - d : p1 + d;
    if (p2 < 220) continue;
    const half1 = p1 * H, fin = (p1 + p2) * H, avg = (p1 + p2) / 2;
    if (tier === "hard") {
      const parts = [
        timePart("half1", "First half", "Time for the first half", half1, U_TIME, "Pace × distance for the first half only."),
        timePart("finish", "Finish time", "Finish time for the whole race", fin, U_TIME, "Add the time for the second half, which uses the second pace."),
        timePart("avg", "Average pace", "Average pace over the whole race", avg, U_PACE, "Total time divided by total distance."),
      ];
      const ex = `**First half:** ${p1} × ${H} = ${half1} s = **${fmtT(half1)}**.\n\n**Finish:** second half ${p2} × ${H} = ${p2 * H} s, so ${half1} + ${p2 * H} = ${fin} s = **${fmtT(fin)}**.\n\n**Average:** ${fin} ÷ ${D} = ${avg} s per km = **${fmtT(avg)}** per km.`;
      return finish(`A runner races **${D} km**. The first **${H} km** are run at **${fmtT(p1)}** per km and the second **${H} km** at **${fmtT(p2)}** per km.`,
        parts, ex, "rc2", { tier, D, p1, p2 }, [["_dist", D], ["_half", H]],
        ["Each half is a separate pace × distance.", "Add the two half times, then divide by the whole distance for the average pace."]);
    }
    if (tier === "expert") {
      const beat = rng.next() < 0.5, g = rng.int(15, 150);
      const G = beat ? fin + g : fin - g;
      const parts = [
        timePart("finish", "Finish time", "Finish time for the whole race", fin, U_TIME, "Pace × distance for each half, added together."),
        timePart("avg", "Average pace", "Average pace over the whole race", avg, U_PACE, "Total time divided by total distance."),
        segPart2(rng, "verdict", "Splits and target", `Was the second half run faster or slower than the first (a negative split is a faster second half), and did the runner beat the target time of **${fmtT(G)}**?`,
          ["Split", "Target"], ["Negative", "Positive"], ["Beat", "Missed"], [neg ? "Negative" : "Positive", beat ? "Beat" : "Missed"],
          "Compare the two paces (smaller time per km is faster), and compare the finish time with the target (a smaller time beats it)."),
        numPart("gap", "Gap to target", "Seconds between the finish time and the target (ignore the sign)", Math.abs(fin - G), 0, "Work in seconds and subtract the smaller time from the larger."),
      ];
      const ex = `**Finish:** (${p1} + ${p2}) × ${H} = ${fin} s = **${fmtT(fin)}**.\n\n**Average:** ${fin} ÷ ${D} = ${avg} s = **${fmtT(avg)}** per km.\n\n**Splits and target:** ${p2} s per km against ${p1} s per km is a **${neg ? "negative" : "positive"}** split. ${fmtT(fin)} is ${beat ? "faster than" : "slower than"} ${fmtT(G)}: **${beat ? "Beat" : "Missed"}**.\n\n**Gap:** |${fin} − ${G}| = **${Math.abs(fin - G)} s**.`;
      return finish(`A runner races **${D} km** with a target of **${fmtT(G)}**. The first **${H} km** are run at **${fmtT(p1)}** per km and the second **${H} km** at **${fmtT(p2)}** per km.`,
        parts, ex, "rc3", { tier, D, p1, p2, G }, [["_dist", D], ["_half", H]],
        ["Get the finish time first: everything else compares with it.", "Smaller seconds per km means faster."]);
    }
    // expert-plus: pacing plan with aid-station stops, worked back from a target
    const Dd = rng.pick([25, 30, 32, 35, 40]), k = rng.int(10, Dd - 8), rest = Dd - k;
    const pr = rng.int(260, 400), p1x = pr + rng.int(-25, 25);
    if (p1x === pr || p1x < 230) continue;
    const n = rng.int(2, 5), s = rng.pick([20, 25, 30, 40, 45, 60]);
    const G = k * p1x + n * s + rest * pr;
    const wantOk = rng.next() < 0.5, m = wantOk ? pr - rng.pick([5, 8, 10, 15]) : pr + rng.pick([5, 8, 10, 15]);
    const ok = m <= pr;
    const avail = G - n * s, left = avail - k * p1x;
    const parts = [
      timePart("avail", "Running time", "Time available for running once the stops are taken off the target", avail, U_TIME, "The stops use up part of the target time: take their total away first."),
      timePart("left", "Time left", `Time left for the last ${rest} km after the first ${k} km`, left, U_TIME, "The first stretch takes pace × distance. Take that from the running time available."),
      timePart("pace", "Pace needed", `Pace needed over the last ${rest} km`, pr, U_PACE, "Time left divided by the distance left, written as minutes and seconds."),
      yesNo("ok", "Possible?", `The runner can manage **${fmtT(m)}** per km at best (the fastest pace) over the last stretch. Is the target possible?`, ok, "Compare the pace needed with the fastest pace she can run: a smaller time per km is faster."),
    ];
    const ex = `**Running time:** ${n} × ${s} s = ${n * s} s stopped, so ${G} − ${n * s} = ${avail} s = **${fmtT(avail)}**.\n\n**Time left:** ${k} × ${p1x} = ${k * p1x} s for the first stretch, and ${avail} − ${k * p1x} = ${left} s = **${fmtT(left)}**.\n\n**Pace:** ${left} ÷ ${rest} = ${pr} s per km = **${fmtT(pr)}** per km.\n\n**Possible?** Her best is ${m} s per km, which is ${ok ? "no slower than" : "slower than"} the ${pr} s needed: **${YN(ok)}**.`;
    return finish(`A runner has a target of **${fmtT(G)}** for a **${Dd} km** race. She runs the first **${k} km** at **${fmtT(p1x)}** per km. There are **${n} aid stations** and she stops for **${s} s** at each (stopped time counts towards the target). The race is run at an even pace after the first stretch.`,
      parts, ex, "rc4", { tier, Dd, k, p1x, n, s, G, m, pr }, [["_dist", Dd], ["_first", k], ["_stops", n], ["_stop_s", s]],
      ["Start from the target and take away what is already spent: stops, then the first stretch.", "Then turn the time left into a pace."]);
  }
  return tooMany();
}

// ---------- league-table ----------

const TEAMS = ["Harbour Rovers", "Ashby United", "Marlow Athletic", "Kestrel City", "Dunmore Town", "Pennine Wanderers", "Oakfield Albion", "Fairmead Rangers", "Stonebridge FC", "Redwater Vale", "Linden Park", "Thornby Town"];
const GOALS = [0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 4];
const RULE = "A win is worth 3 points, a draw 1 and a loss 0. Teams are ranked by points, then goal difference, then goals scored.";

// Table from a list of matches [homeIdx, homeGoals, awayIdx, awayGoals] (tallied match by match).
function tableOf(n, matches) {
  const t = Array.from({ length: n }, (_, i) => ({ i, p: 0, gf: 0, ga: 0 }));
  for (const [h, hg, a, ag] of matches) {
    t[h].gf += hg; t[h].ga += ag; t[a].gf += ag; t[a].ga += hg;
    if (hg > ag) t[h].p += 3; else if (hg < ag) t[a].p += 3; else { t[h].p += 1; t[a].p += 1; }
  }
  t.forEach((r) => { r.gd = r.gf - r.ga; });
  const order = t.slice().sort((x, y) => y.p - x.p || y.gd - x.gd || y.gf - x.gf);
  const unique = order.every((r, k) => k === 0 || r.p !== order[k - 1].p || r.gd !== order[k - 1].gd || r.gf !== order[k - 1].gf);
  return { rows: t, order, unique };
}
function drawLeague(rng) {
  const idx = shuffled(rng, TEAMS.map((_, i) => i)).slice(0, 4), names = idx.map((i) => TEAMS[i]);
  const ms = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const [h, a] = rng.next() < 0.5 ? [i, j] : [j, i];
    ms.push([h, rng.pick(GOALS), a, rng.pick(GOALS)]);
  }
  return { names, matches: rng.shuffle(ms) };
}
const matchLines = (names, ms) => ms.map(([h, hg, a, ag]) => `- ${names[h]} ${hg}–${ag} ${names[a]}`).join("\n");

function genLeague(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    if (tier === "medium") {
      const W = rng.int(2, 8), D = rng.int(0, 4), L = rng.int(1, 5), GF = rng.int(W, W + 14), GA = rng.int(L, L + 12);
      const pts = 3 * W + D, gd = GF - GA, n = W + D + L;
      if (gd === 0 || n < 6 || n > 14) continue;
      const nm = rng.pick(TEAMS);
      const parts = [
        numPart("pts", "Points", "Points won so far", pts, 0, "Wins are worth 3 points each and draws 1 each. Losses add nothing."),
        numPart("gd", "Goal difference", "Goal difference (negative if more goals were conceded than scored)", gd, 0, "Goals scored minus goals conceded."),
      ];
      const ex = `**Points:** 3 × ${W} + 1 × ${D} = **${pts}**.\n\n**Goal difference:** ${GF} − ${GA} = **${gd}**.`;
      return finish(`${nm} have played **${n}** league games: **${W}** won, **${D}** drawn and **${L}** lost. They have scored **${GF}** goals and conceded **${GA}**. ${RULE}`,
        parts, ex, "lg1", { tier, W, D, L, GF, GA }, [["_W", W], ["_D", D], ["_L", L], ["_GF", GF], ["_GA", GA]],
        ["Points first: each result type has its own value.", "Goal difference is goals for take away goals against."]);
    }
    if (tier === "hard" || tier === "expert") {
      const { names, matches } = drawLeague(rng), T = tableOf(4, matches);
      if (!T.unique) continue;
      const X = rng.int(0, 3), Y = rng.int(0, 3);
      const top = T.order[0];
      const rowsOf = T.rows;
      const lines = matchLines(names, matches);
      const lead = `Four made-up teams played each other once. The results (home team first):\n\n${lines}\n\n${RULE}`;
      if (tier === "hard") {
        const parts = [
          numPart("pts", "Points", `Points for ${names[X]}`, rowsOf[X].p, 0, "Go through the results for that team only and add 3, 1 or 0 for each."),
          numPart("gd", "Goal difference", `Goal difference for ${names[Y]} (negative if more were conceded)`, rowsOf[Y].gd, 0, "Add up the goals that team scored and conceded in all its games, then subtract."),
          choicePart(rng, "top", "Top of the table", "Which team finishes top?", names, names[top.i], "Work out points for every team, then use goal difference and goals scored only if points are level."),
        ];
        const ex = `**${names[X]}:** their three results give **${rowsOf[X].p}** points.\n\n**${names[Y]}:** ${rowsOf[Y].gf} scored and ${rowsOf[Y].ga} conceded, so **${rowsOf[Y].gd}**.\n\n**Table:** ${T.order.map((r) => `${names[r.i]} ${r.p} pts (GD ${sgn(r.gd)}, ${r.gf} scored)`).join("; ")}. **${names[top.i]}** are top.`;
        return finish(lead, parts, ex, "lg2", { tier, names, matches, X, Y }, [],
          ["Tally each team's three games.", "The ranking rule only matters when points are level."]);
      }
      const gap = T.order[0].p - T.order[3].p, rank = T.order.findIndex((r) => r.i === X) + 1;
      const parts = [
        numPart("pts", "Points", `Points for ${names[X]}`, rowsOf[X].p, 0, "Add 3, 1 or 0 for each of that team's results."),
        numPart("gd", "Goal difference", `Goal difference for ${names[X]} (negative if more were conceded)`, rowsOf[X].gd, 0, "All goals scored in its games minus all goals conceded."),
        numPart("rank", "Position", `Final position of ${names[X]} (1 = top)`, rank, 0, "Build the whole table, then order it by points, goal difference, goals scored."),
        numPart("gap", "Points gap", "Points between the top team and the bottom team", gap, 0, "Top team's points minus the bottom team's."),
      ];
      const ex = `**${names[X]}:** **${rowsOf[X].p}** points, goal difference **${rowsOf[X].gd}**.\n\n**Table:** ${T.order.map((r) => `${names[r.i]} ${r.p} pts (GD ${sgn(r.gd)}, ${r.gf} scored)`).join("; ")}.\n\n**Position:** **${rank}**. **Gap:** ${T.order[0].p} − ${T.order[3].p} = **${gap}**.`;
      return finish(lead, parts, ex, "lg3", { tier, names, matches, X }, [],
        ["Build a small table with points, goals for and goals against for each team.", "Order it using the stated rule."]);
    }
    // expert-plus: run-in. Leader versus the chaser, who do not meet again; ties go to the leader.
    const total = 38, rL = rng.int(2, 6), rX = rng.int(2, 6), L = rng.int(48, 78), X = L - rng.int(1, 12);
    const need = X + 3 * rX - L;
    if (need < 1 || need > 3 * rL) continue;
    const wantSafe = rng.next() < 0.5, delta = rng.int(2, 4);
    const E = wantSafe ? need + delta : need - delta;
    if (E < 0 || E > 3 * rL) continue;
    const xmax = X + 3 * rX, wins = Math.ceil(need / 3), safe = E >= need;
    const [nL, nX, nZ] = shuffled(rng, TEAMS).slice(0, 3), Z = X - rng.int(2, 9);
    const parts = [
      numPart("xmax", "Most points", `Most points ${nX} can still finish on`, xmax, 0, "Current points plus 3 for every game they have left."),
      numPart("need", "Points needed", `Fewest further points ${nL} need to be certain of finishing above ${nX}`, need, 0, "Their rival's best total minus the leader's current points (the leader wins a tie on points)."),
      numPart("wins", "Wins needed", `Fewest of ${poss(nL)} remaining games they must win to get those points if they lose the others`, wins, 0, "Each win is worth 3 points. Round up to whole wins."),
      yesNo("safe", "Safe?", `${poss(nL)} coach expects them to take **${E}** points from their remaining games. If that happens, are they certain to finish above ${nX}?`, safe, "Compare the points they take with the points needed."),
    ];
    const ex = `**Most points:** ${X} + 3 × ${rX} = **${xmax}**.\n\n**Points needed:** ${xmax} − ${L} = **${need}** (a tie on points goes to ${nL}).\n\n**Wins:** ${need} ÷ 3 = ${f(roundTo(need / 3, 2))}, round up to **${wins}**.\n\n**Safe?** ${E} is ${safe ? "at least" : "less than"} ${need}: **${YN(safe)}**.`;
    return finish(`Near the end of a **${total}-game** season, three teams are close at the top:\n\n| Team | Played | Points |\n|---|---|---|\n| ${nL} | ${total - rL} | ${L} |\n| ${nX} | ${total - rX} | ${X} |\n| ${nZ} | ${total - rng.int(2, 6)} | ${Z} |\n\n${nL} and ${nX} do not play each other again. If the two finish level on points, ${nL} win the tie on goal difference. ${RULE}`,
      parts, ex, "lg4", { tier, L, X, rL, rX, E }, [["_Lpts", L], ["_Xpts", X], ["_rL", rL], ["_rX", rX], ["_E", E]],
      ["Find the chaser's best possible total first.", "Then see how many points the leader needs to stay at least level with it."]);
  }
  return tooMany();
}

// ---------- player-stats ----------

const PLAYERS = ["Tomas", "Idris", "Kofi", "Rafa", "Lior", "Mateo", "Soren", "Yusuf", "Anders", "Dario", "Nikos", "Emeka"];
const POS = ["striker", "winger", "midfielder", "forward"];
const RATING_RULE = "Rating = (5 × goals + 3 × assists + key passes) × 90 ÷ minutes played, worked from the raw counts.";
const rating = (G, A, K, M) => ((5 * G + 3 * A + K) * 90) / M;

function drawPlayer(rng) {
  const M = rng.int(60, 300) * 10, G = rng.int(2, 22), A = rng.int(1, 14), K = rng.int(5, 70);
  return { M, G, A, K };
}

function genPlayer(rng, tier) {
  const wantYes = rng.next() < 0.5, trap = rng.next() < 0.5; // decided first, so redraws do not bias them
  for (let i = 0; i < TRY; i++) {
    const [n1, n2] = shuffled(rng, PLAYERS), pos1 = rng.pick(POS), pos2 = rng.pick(POS);
    if (tier === "medium") {
      const M = rng.int(60, 300) * 10, G = rng.int(3, 20), S = rng.int(G + 3, 90);
      const per90 = (G * 90) / M, acc = (G / S) * 100;
      if (nearHalf(per90, 2, 0.06) || nearHalf(acc, 1, 0.06) || per90 < 0.05) continue;
      const parts = [
        numPart("per90", "Goals per 90", "Goals per 90 minutes", per90, 2, "Goals ÷ minutes gives goals per minute; times 90 gives per 90."),
        numPart("acc", "Shooting %", "Shooting accuracy: the percentage of shots that were goals", acc, 1, "Goals ÷ shots × 100."),
      ];
      const ex = `**Per 90:** ${G} × 90 ÷ ${M} = ${f(roundTo(per90, 4))}, so **${f(roundTo(per90, 2))}**.\n\n**Shooting %:** ${G} ÷ ${S} × 100 = **${f(roundTo(acc, 1))}%**.`;
      return finish(`${n1}, a ${pos1}, scored **${G}** goals from **${S}** shots in **${M}** minutes of league football this season.`,
        parts, ex, "ps1", { tier, M, G, S }, [["_M", M], ["_G", G], ["_S", S]],
        ["Per 90 means scaled to a full match of 90 minutes.", "Shooting accuracy compares goals with shots."]);
    }
    if (tier === "hard") {
      const a = { M: rng.int(60, 300) * 10, G: rng.int(3, 22) }, b = { M: rng.int(60, 300) * 10, G: rng.int(3, 22) };
      const pa = (a.G * 90) / a.M, pb = (b.G * 90) / b.M;
      if (nearHalf(pa, 2, 0.06) || nearHalf(pb, 2, 0.06) || Math.abs(pa - pb) < 0.06 || pa < 0.05 || pb < 0.05 || a.G === b.G) continue;
      const aBetter = pa > pb, moreGoalsA = a.G > b.G;
      if ((aBetter === moreGoalsA) === trap) continue;
      const winner = aBetter ? n1 : n2;
      const parts = [
        numPart("a", `${poss(n1)} rate`, `${poss(n1)} goals per 90 minutes`, pa, 2, "Goals × 90 ÷ minutes."),
        numPart("b", `${poss(n2)} rate`, `${poss(n2)} goals per 90 minutes`, pb, 2, "Goals × 90 ÷ minutes."),
        choicePart(rng, "who", "Better rate", "Who scores more often per 90 minutes?", [n1, n2], winner, "Compare the two rates, not the total goals."),
      ];
      const ex = `**${n1}:** ${a.G} × 90 ÷ ${a.M} = **${f(roundTo(pa, 2))}**.\n\n**${n2}:** ${b.G} × 90 ÷ ${b.M} = **${f(roundTo(pb, 2))}**.\n\n**Better:** the higher rate is ${poss(winner)}, so the answer is **${winner}**.`;
      return finish(`Two players are being compared this season. ${n1} (${pos1}) scored **${a.G}** goals in **${a.M}** minutes. ${n2} (${pos2}) scored **${b.G}** goals in **${b.M}** minutes.`,
        parts, ex, "ps2", { tier, n1, n2, a, b }, [["_Ga", a.G], ["_Ma", a.M], ["_Gb", b.G], ["_Mb", b.M]],
        ["Put both players on the same scale: goals per 90 minutes.", "Then compare the two rates."]);
    }
    if (tier === "expert") {
      const { M, G, A, K } = drawPlayer(rng);
      const inv = G + A, inv90 = (inv * 90) / M, r = rating(G, A, K, M);
      if (nearHalf(inv90, 2, 0.06) || nearHalf(r, 2, 0.06) || r < 3) continue;
      const T = wantYes ? Math.floor(r - 0.4) - rng.int(0, 2) : Math.ceil(r + 0.4) + rng.int(0, 2);
      if (T < 1) continue;
      const ok = r >= T;
      const parts = [
        numPart("inv", "Involvements", "Goal involvements (goals plus assists)", inv, 0, "Add goals and assists."),
        numPart("inv90", "Involvements per 90", "Goal involvements per 90 minutes", inv90, 2, "Involvements × 90 ÷ minutes."),
        numPart("rating", "Rating", "Rating per 90 minutes using the stated formula", r, 2, "Weight each count by the formula, add them, then scale to 90 minutes. Use the raw counts."),
        yesNo("start", "Starter?", `The club starts any player whose rating is at least **${T}**. Does ${n1} qualify?`, ok, "Compare the rating you calculated with the threshold."),
      ];
      const ex = `**Involvements:** ${G} + ${A} = **${inv}**.\n\n**Per 90:** ${inv} × 90 ÷ ${M} = **${f(roundTo(inv90, 2))}**.\n\n**Rating:** (5 × ${G} + 3 × ${A} + ${K}) × 90 ÷ ${M} = ${5 * G + 3 * A + K} × 90 ÷ ${M} = **${f(roundTo(r, 2))}**.\n\n**Starter?** ${f(roundTo(r, 2))} is ${ok ? "at least" : "below"} ${T}: **${YN(ok)}**.`;
      return finish(`${n1}, a ${pos1}, played **${M}** minutes this season with **${G}** goals, ${plural(A, 'assist')} and **${K}** key passes. ${RATING_RULE}`,
        parts, ex, "ps3", { tier, M, G, A, K, T }, [["_M", M], ["_G", G], ["_A", A], ["_K", K], ["_T", T]],
        ["Count involvements first, then scale to 90 minutes.", "For the rating, weight each count before adding."]);
    }
    // expert-plus: compare a current player and a target, percentage change, signing rule
    const a = drawPlayer(rng), b = drawPlayer(rng);
    const ra = rating(a.G, a.A, a.K, a.M), rb = rating(b.G, b.A, b.K, b.M);
    if (ra < 4 || rb < 4 || nearHalf(ra, 2, 0.06) || nearHalf(rb, 2, 0.06)) continue;
    const pct = ((rb - ra) / ra) * 100, pctR = ((roundTo(rb, 2) - roundTo(ra, 2)) / roundTo(ra, 2)) * 100;
    if (nearHalf(pct, 1, 0.12) || roundTo(pct, 1) !== roundTo(pctR, 1)) continue;
    const R = rng.pick([10, 15, 20, 25]);
    if (wantYes ? pct < R + 2 : pct > R - 2) continue;
    if (Math.abs(pct) > 90) continue;
    const ok = pct >= R;
    const parts = [
      numPart("ra", `${poss(n1)} rating`, `${poss(n1)} rating per 90 minutes`, ra, 2, "Weight goals, assists and key passes, add, then scale to 90 minutes."),
      numPart("rb", `${poss(n2)} rating`, `${poss(n2)} rating per 90 minutes`, rb, 2, "Same formula with the other player's counts."),
      numPart("pct", "Percentage difference", `Percentage by which ${poss(n2)} rating is above ${poss(n1)} (negative if below), using the unrounded ratings`, pct, 1, "(new − current) ÷ current × 100."),
      yesNo("sign", "Sign?", `The club signs ${n2} only if their rating is at least **${R}%** above ${poss(n1)}. Do they sign the player?`, ok, "Compare your percentage with the stated margin."),
    ];
    const ex = `**${n1}:** (5 × ${a.G} + 3 × ${a.A} + ${a.K}) × 90 ÷ ${a.M} = **${f(roundTo(ra, 2))}**.\n\n**${n2}:** (5 × ${b.G} + 3 × ${b.A} + ${b.K}) × 90 ÷ ${b.M} = **${f(roundTo(rb, 2))}**.\n\n**Difference:** (${f(roundTo(rb, 2))} − ${f(roundTo(ra, 2))}) ÷ ${f(roundTo(ra, 2))} × 100 = **${f(roundTo(pct, 1))}%**.\n\n**Sign?** ${f(roundTo(pct, 1))}% is ${ok ? "at least" : "below"} ${R}%: **${YN(ok)}**.`;
    return finish(`A club's current ${pos1}, ${n1}, played **${a.M}** minutes with **${a.G}** goals, ${plural(a.A, 'assist')} and **${a.K}** key passes. A transfer target, ${n2}, played **${b.M}** minutes with **${b.G}** goals, ${plural(b.A, 'assist')} and **${b.K}** key passes. ${RATING_RULE}`,
      parts, ex, "ps4", { tier, n1, n2, a, b, R }, [["_Ma", a.M], ["_Ga", a.G], ["_Aa", a.A], ["_Ka", a.K], ["_Mb", b.M], ["_Gb", b.G], ["_Ab", b.A], ["_Kb", b.K]],
      ["Rate both players with the same formula before comparing anything.", "A percentage change compares the difference with the starting (current) value."]);
  }
  return tooMany();
}

// ---------- win-chances ----------
// Stated chances for independent matches, as whole percentages. Expert-plus uses win + draw + loss
// chances that add to 100. Expected points use 3 for a win and 1 for a draw.

const OPP = ["Harbour Rovers", "Ashby United", "Marlow Athletic", "Kestrel City", "Dunmore Town", "Pennine Wanderers", "Oakfield Albion", "Fairmead Rangers"];
function drawOdds(rng, step) {
  for (;;) {
    const pw = rng.int(step === 5 ? 4 : 1, step === 5 ? 13 : 7) * step, pd = rng.int(step === 5 ? 3 : 1, step === 5 ? 6 : 3) * step;
    if (pw + pd <= 100 - step) return { pw, pd, pl: 100 - pw - pd };
  }
}
const oddsText = (o) => `win **${o.pw}%**, draw **${o.pd}%**, loss **${o.pl}%**`;

function genChances(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const nm = shuffled(rng, OPP);
    if (tier === "medium") {
      const o = drawOdds(rng, 5), n = rng.int(3, 8);
      const e1 = (3 * o.pw + o.pd) / 100, en = (n * (3 * o.pw + o.pd)) / 100;
      const parts = [
        numPart("e1", "One match", "Expected points from one match", e1, 2, "Multiply each result's points by its chance (as a decimal) and add: 3 × win chance + 1 × draw chance."),
        numPart("en", "Whole run", `Expected points from all ${n} matches`, en, 2, "Every match has the same chances, so the expected points add up: multiply by the number of matches."),
      ];
      const ex = `**One match:** 3 × ${o.pw / 100} + 1 × ${o.pd / 100} = **${f(roundTo(e1, 2))}**.\n\n**Run of ${n}:** ${n} × ${f(roundTo(e1, 2))} = **${f(roundTo(en, 2))}**.`;
      return finish(`Before each of its next **${n}** league games, a team is given the same chances: ${oddsText(o)}. Every match is independent of the others. A win scores 3 points and a draw 1.`,
        parts, ex, "wo1", { tier, o, n }, [["_pw", o.pw], ["_pd", o.pd], ["_n", n]],
        ["An expected value weights each outcome by its chance.", "Equal matches: expected totals add."]);
    }
    const o1 = drawOdds(rng, 10), o2 = drawOdds(rng, 10);
    if (tier === "hard") {
      const e = (3 * (o1.pw + o2.pw) + o1.pd + o2.pd) / 100;
      const both = (o1.pw * o2.pw) / 100, any = 100 - ((100 - o1.pw) * (100 - o2.pw)) / 100;
      const parts = [
        numPart("e", "Expected points", "Expected points from the two matches together", e, 1, "Work out each match's expected points, then add them."),
        numPart("both", "Win both", "Chance, in percent, of winning both matches", both, 0, "Independent matches: multiply the two win chances (as decimals), then turn back into a percentage.", true),
        numPart("any", "At least one win", "Chance, in percent, of winning at least one of the two matches", any, 0, "It is easier to find the chance of winning neither, then take it from 100%.", true),
      ];
      const ex = `**Expected:** (3 × ${o1.pw / 100} + ${o1.pd / 100}) + (3 × ${o2.pw / 100} + ${o2.pd / 100}) = **${f(roundTo(e, 1))}**.\n\n**Win both:** ${o1.pw / 100} × ${o2.pw / 100} = ${f(both / 100)}, so **${f(both)}%**.\n\n**At least one:** 1 − ${f((100 - o1.pw) / 100)} × ${f((100 - o2.pw) / 100)} = **${f(any)}%**.`;
      return finish(`A team has two games left. Against ${nm[0]}: ${oddsText(o1)}. Against ${nm[1]}: ${oddsText(o2)}. The two matches are independent. A win scores 3 points and a draw 1.`,
        parts, ex, "wo2", { tier, o1, o2 }, [["_pw1", o1.pw], ["_pd1", o1.pd], ["_pw2", o2.pw], ["_pd2", o2.pd]],
        ["Expected points add across matches.", "Chances of independent events multiply."]);
    }
    if (tier === "expert") {
      const o3 = drawOdds(rng, 10), os = [o1, o2, o3];
      const e10 = os.reduce((s, o) => s + (3 * o.pw + o.pd) / 10, 0), e = e10 / 10;
      const all = (o1.pw / 10) * (o2.pw / 10) * (o3.pw / 10) / 10;
      const unb = (((100 - o1.pl) / 10) * ((100 - o2.pl) / 10) * ((100 - o3.pl) / 10)) / 10;
      const wantYes = rng.next() < 0.5, T = wantYes ? Math.floor(e - 0.4) - rng.int(0, 1) : Math.ceil(e + 0.4) + rng.int(0, 1);
      if (T < 2) continue;
      const ok = e >= T;
      const parts = [
        numPart("e", "Expected points", "Expected points from the three matches together", e, 1, "Each match: 3 × win chance + 1 × draw chance. Add the three."),
        numPart("all", "Win all three", "Chance, in percent, of winning all three", all, 1, "Multiply the three win chances (as decimals), then turn into a percentage."),
        numPart("unb", "Unbeaten", "Chance, in percent, of not losing any of the three", unb, 1, "Not losing a match has chance 100% minus the loss chance. Multiply the three."),
        yesNo("track", "On track?", `The team needs at least **${T}** points in total from these three games. Is its expected total at least ${T}?`, ok, "Compare the expected points you found with the number needed."),
      ];
      const ex = `**Expected:** ${os.map((o) => f((3 * o.pw + o.pd) / 100)).join(" + ")} = **${f(roundTo(e, 1))}**.\n\n**All three wins:** ${os.map((o) => o.pw / 100).join(" × ")} = **${f(roundTo(all, 1))}%**.\n\n**Unbeaten:** ${os.map((o) => (100 - o.pl) / 100).join(" × ")} = **${f(roundTo(unb, 1))}%**.\n\n**On track?** ${f(roundTo(e, 1))} is ${ok ? "at least" : "below"} ${T}: **${YN(ok)}**.`;
      return finish(`A team has three games left. Against ${nm[0]}: ${oddsText(o1)}. Against ${nm[1]}: ${oddsText(o2)}. Against ${nm[2]}: ${oddsText(o3)}. The matches are independent. A win scores 3 points and a draw 1.`,
        parts, ex, "wo3", { tier, os, T }, [["_pw1", o1.pw], ["_pw2", o2.pw], ["_pw3", o3.pw], ["_T", T]],
        ["Expected points add; chances of independent events multiply.", "For the last part compare an average with a number."]);
    }
    // expert-plus: needs at least 4 points from two matches to qualify; compare with a rival's stated chance
    const six = (o1.pw * o2.pw) / 100, four = (o1.pw * o2.pd + o1.pd * o2.pw) / 100, atl = six + four;
    const wantYes = rng.next() < 0.5, rival = wantYes ? atl - rng.int(4, 12) : atl + rng.int(4, 12);
    if (rival < 3 || rival > 97) continue;
    const ok = atl > rival;
    const parts = [
      numPart("six", "Six points", "Chance, in percent, of taking all 6 points", six, 0, "Only one result pair gives 6 points: two wins. Multiply the win chances.", true),
      numPart("four", "Exactly four", "Chance, in percent, of taking exactly 4 points", four, 0, "4 points means one win and one draw, in either order: add the two ways.", true),
      numPart("atl", "At least four", "Chance, in percent, of taking at least 4 points", atl, 0, "At least 4 is 6 points or exactly 4. The two cannot both happen, so add them.", true),
      yesNo("more", "Better than the rival?", `A rival team's chance of reaching the same mark is **${f(rival)}%**. Is this team more likely to qualify than the rival?`, ok, "Compare the two percentages."),
    ];
    const ex = `**Six points:** ${o1.pw / 100} × ${o2.pw / 100} = **${f(six)}%**.\n\n**Exactly four:** win then draw ${o1.pw / 100} × ${o2.pd / 100}, plus draw then win ${o1.pd / 100} × ${o2.pw / 100}: **${f(four)}%**.\n\n**At least four:** ${f(six)} + ${f(four)} = **${f(atl)}%**.\n\n**Better?** ${f(atl)}% is ${ok ? "more than" : "not more than"} ${f(rival)}%: **${YN(ok)}**.`;
    return finish(`A team needs at least **4 points** from its last two games to qualify. Against ${nm[0]}: ${oddsText(o1)}. Against ${nm[1]}: ${oddsText(o2)}. The matches are independent. A win scores 3 points and a draw 1.`,
      parts, ex, "wo4", { tier, o1, o2, rival }, [["_pw1", o1.pw], ["_pd1", o1.pd], ["_pw2", o2.pw], ["_pd2", o2.pd], ["_rival", rival]],
      ["List the result pairs that reach 4 points or more.", "Several pairs can give the same total: add their chances."]);
  }
  return tooMany();
}

// ---------- entry ----------

const TIERS = new Set(["medium", "hard", "expert", "expert-plus"]);
export function generate({ subtopic, difficulty, rng }) {
  if (!TIERS.has(difficulty)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "race-pace") return genRace(rng, difficulty);
  if (subtopic === "league-table") return genLeague(rng, difficulty);
  if (subtopic === "player-stats") return genPlayer(rng, difficulty);
  if (subtopic === "win-chances") return genChances(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (times by repeated addition
// and proportion, league tables by per-team match filtering and rank counting, ratings per minute,
// chances by enumerating every combination of results). Numbers are compared with the rounded
// truth; choices exactly; times by value in seconds.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const TIME = (s) => ({ t: s });
const timeOk = (cand, secs) => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(cand).trim().replace(/\s+/g, ""));
  if (!m) return false;
  const total = m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
  const secOk = Number(m[3] !== undefined ? m[3] : m[2]) < 60 && (m[3] === undefined || Number(m[2]) < 60);
  return secOk && total === secs;
};
const addN = (x, n) => { let t = 0; for (let k = 0; k < n; k++) t += x; return t; }; // repeated addition

// League table by filtering each team's games and ranking by counting the teams that beat it.
function leagueAlt(names, matches) {
  const stats = names.map((_, t) => {
    let p = 0, gf = 0, ga = 0;
    for (const m of matches.filter((x) => x[0] === t || x[2] === t)) {
      const mine = m[0] === t ? m[1] : m[3], theirs = m[0] === t ? m[3] : m[1];
      gf += mine; ga += theirs;
      p += mine > theirs ? 3 : mine === theirs ? 1 : 0;
    }
    return { p, gf, ga, gd: gf - ga };
  });
  const better = (a, b) => a.p > b.p || (a.p === b.p && (a.gd > b.gd || (a.gd === b.gd && a.gf > b.gf)));
  stats.forEach((s) => { s.rank = 1 + stats.filter((o) => better(o, s)).length; });
  return stats;
}
// Chance distribution over total points by enumerating every combination of results.
function pointsDist(oddsList) {
  let combos = [{ pts: 0, pr: 1 }];
  for (const o of oddsList) {
    const next = [];
    for (const c of combos) for (const [pts, pc] of [[3, o.pw], [1, o.pd], [0, o.pl]]) next.push({ pts: c.pts + pts, pr: c.pr * (pc / 100) });
    combos = next;
  }
  return combos;
}
const probWhere = (combos, fn) => combos.filter(fn).reduce((s, c) => s + c.pr, 0) * 100;

const ALT = {
  "rc1": (p) => { const T = addN(p.p, p.D); return { pace: TIME(Math.round(T / p.D)), time2: TIME(Math.round((T * (p.d2 / 10)) / p.D)) }; },
  "rc2": (p) => { const H = p.D / 2, h1 = addN(p.p1, H), fin = h1 + addN(p.p2, H); return { half1: TIME(h1), finish: TIME(fin), avg: TIME(Math.round(fin / p.D)) }; },
  "rc3": (p) => {
    const H = p.D / 2, fin = addN(p.p1, H) + addN(p.p2, H);
    return { finish: TIME(fin), avg: TIME(Math.round(fin / p.D)), verdict: `${p.p2 < p.p1 ? "Negative" : "Positive"} | ${fin < p.G ? "Beat" : "Missed"}`, gap: Math.abs(p.G - fin) };
  },
  "rc4": (p) => {
    const avail = p.G - p.n * p.s, left = avail - p.k * p.p1x, rest = p.Dd - p.k, pace = left / rest;
    return { avail: TIME(avail), left: TIME(left), pace: TIME(Math.round(pace)), ok: YN(p.m <= Math.round(pace)) };
  },
  "lg1": (p) => ({ pts: p.W * 3 + p.D, gd: p.GF - p.GA }),
  "lg2": (p) => { const s = leagueAlt(p.names, p.matches); return { pts: s[p.X].p, gd: s[p.Y].gd, top: p.names[s.findIndex((r) => r.rank === 1)] }; },
  "lg3": (p) => {
    const s = leagueAlt(p.names, p.matches), ps = s.map((r) => r.p);
    return { pts: s[p.X].p, gd: s[p.X].gd, rank: s[p.X].rank, gap: Math.max(...ps) - Math.min(...ps) };
  },
  "lg4": (p) => {
    const xmax = p.X + 3 * p.rX; let w = 0; while (p.L + 3 * w < xmax) w++; // least wins that reach the rival's best total
    return { xmax, need: xmax - p.L, wins: w, safe: YN(p.L + p.E >= xmax) };
  },
  "ps1": (p) => ({ per90: (p.G / p.M) * 90, acc: (p.G * 100) / p.S }),
  "ps2": (p) => { const a = (p.a.G / p.a.M) * 90, b = (p.b.G / p.b.M) * 90; return { a, b, who: a > b ? p.n1 : p.n2 }; },
  "ps3": (p) => { const r = (5 * p.G + 3 * p.A + p.K) / (p.M / 90); return { inv: p.G + p.A, inv90: (p.G + p.A) / (p.M / 90), rating: r, start: YN(r >= p.T) }; },
  "ps4": (p) => {
    const ra = (5 * p.a.G + 3 * p.a.A + p.a.K) / (p.a.M / 90), rb = (5 * p.b.G + 3 * p.b.A + p.b.K) / (p.b.M / 90), pct = (rb / ra - 1) * 100;
    return { ra, rb, pct, sign: YN(pct >= p.R) };
  },
  "wo1": (p) => { const d = pointsDist([p.o]), e1 = d.reduce((s, c) => s + c.pts * c.pr, 0), dn = pointsDist(Array(p.n).fill(p.o)); return { e1, en: dn.reduce((s, c) => s + c.pts * c.pr, 0) }; },
  "wo2": (p) => {
    const d = pointsDist([p.o1, p.o2]);
    return { e: d.reduce((s, c) => s + c.pts * c.pr, 0), both: Math.round(probWhere(pointsDist([p.o1, p.o2]), (c) => c.pts === 6) * 1e6) / 1e6, any: 100 - (1 - p.o1.pw / 100) * (1 - p.o2.pw / 100) * 100 };
  },
  "wo3": (p) => {
    const d = pointsDist(p.os), e = d.reduce((s, c) => s + c.pts * c.pr, 0);
    return { e, all: probWhere(d, (c) => c.pts === 9), unb: probWhere(pointsDist(p.os.map((o) => ({ pw: o.pw + o.pd, pd: 0, pl: o.pl }))), (c) => c.pts === 9), track: YN(e >= p.T) };
  },
  "wo4": (p) => {
    const d = pointsDist([p.o1, p.o2]), six = probWhere(d, (c) => c.pts === 6), four = probWhere(d, (c) => c.pts === 4), atl = probWhere(d, (c) => c.pts >= 4);
    return { six, four, atl, more: YN(atl > p.rival) };
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
    } else if (typeof tv === "object") {
      if (!timeOk(partStr(answer, part.id), tv.t)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
