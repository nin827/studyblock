// Investigator role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
// All people are made up and named by job only ("the guard"); no real names, no violence. Every rule
// and figure is stated in the prompt and is for practice only. Verdict parts (Yes/No, Possible/Impossible,
// Normal/Flagged ...) are decided first and the numbers are then drawn to fit. No answer sits on a rounding
// half-step, and chained answers are exact, so a rounded earlier answer never changes a later one.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   timeline         last-seen times + journeys -> arrival times -> who could have been there        (Case Analyst)
//   statements       four or five statements, exactly one false -> the liar, the culprit, what follows (Case Analyst)
//   record-patterns  a broken arithmetic pattern; first-digit counts against a stated rule           (Fraud Examiner)
//   flag-odds        true rate, hit rate, false alarms -> counts -> chance a flagged case is real     (Fraud Examiner)

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-7;
const f = (n) => String(+Number(n).toFixed(6));
const br = (n) => (n < 0 ? `(${f(n)})` : f(n)); // bracket negatives in explanations
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp) => (dp === 0 ? "" : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-investigator: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const usd = (n) => `$${commas(n)}`;
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function numPart(id, label, ask, val, dp, hint) {
  const p = { id, label, ask: `${ask}${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
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
  const q = { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, hints };
  if (given.length) q.given = givenRows(given); // statements: no numbers worth pre-filling
  return q;
}

// ---------- clock helpers (24-hour, minutes after midnight) ----------

const pad2 = (n) => String(n).padStart(2, "0");
const clock = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const parseClock = (s) => {
  const m = String(s).trim().match(/^(\d{1,2})\s*[:.h]?\s*(\d{2})$/);
  if (!m) return NaN;
  const h = +m[1], mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : NaN;
};
function clockPart(id, label, ask, mins, hint) {
  const hh = pad2(Math.floor(mins / 60)), mm = pad2(mins % 60);
  return { id, label, ask: `${ask} (24-hour clock, HH:MM)`, answerType: "text", answer: clock(mins), accepts: [`${hh}.${mm}`, `${hh}${mm}`], fuzzy: false, hint };
}

// ---------- people ----------

const JOBS = ["guard", "courier", "cleaner", "driver", "clerk", "cook"];
const the = (j) => `the ${j}`;
const The = (j) => `The ${j}`;
const pick = (rng, n) => rng.shuffle(JOBS.slice()).slice(0, n);

// ---------- timeline ----------
// last seen at time t, a journey of d minutes to the stockroom; arrival = t + d.

const aN = (d) => (/^(8|11|18)/.test(String(d)) && !/^1[^18]/.test(String(d)) ? "an" : "a"); // "an 80-minute", "an 11-minute"
function seenLine(j, t, d) { return `${The(j)} was last seen at **${clock(t)}**, ${aN(d)} **${d}-minute** journey from the stockroom.`; }

function genTimeline(rng, tier) {
  if (tier === "medium") {
    const outcome = rng.int(0, 3), couldA = (outcome & 1) === 1, couldB = (outcome & 2) === 2;
    const [A, B] = pick(rng, 2), T = rng.int(144, 252) * 5, ask = rng.int(0, 1);
    const people = [[A, couldA], [B, couldB]].map(([j, could]) => {
      const gap = 5 * rng.int(2, 12), arr = could ? T - gap : T + gap, d = 5 * rng.int(4, 16);
      return { j, t: arr - d, d, arr, could };
    });
    const who = ask === 0 ? people[0] : people[1];
    const ans = outcome === 3 ? "Both" : outcome === 0 ? "Neither" : `Only ${the(outcome === 1 ? A : B)}`;
    const choices = shuffled(rng, [`Only ${the(A)}`, `Only ${the(B)}`, "Both", "Neither"]);
    const parts = [
      clockPart("arr", "Arrival", `The earliest ${the(who.j)} could have reached the stockroom`, who.arr, "Arrival time = the time last seen + the journey. Add the minutes, carrying over each full 60 to the hours."),
      { id: "who", label: "Who could?", ask: `Who could have been at the stockroom by the time the door opened (at or before ${clock(T)})?`, answerType: "choice", answer: ans, choices, hint: "Find each person's earliest arrival, then compare it with the time the door opened. Arriving at or before that time is possible." },
    ];
    const ex = `**Arrival:** ${people.map((p) => `${the(p.j)} ${clock(p.t)} + ${p.d} min = ${clock(p.arr)}`).join("; ")}. The earliest ${the(who.j)} could arrive is **${clock(who.arr)}**.\n\n**Who could:** the door opened at ${clock(T)}. ${people.map((p) => `${The(p.j)} (${clock(p.arr)}) ${p.could ? "arrives in time" : "arrives too late"}`).join("; ")}. Answer: **${ans}**.`;
    return finish(`The alarm log shows that the stockroom door was opened at **${clock(T)}**. Two people could have used it. ${seenLine(A, people[0].t, people[0].d)} ${seenLine(B, people[1].t, people[1].d)}`,
      parts, ex, "inv-tl1", { tier, T, a: people.map((p) => ({ j: p.j, t: p.t, d: p.d })), ask }, [["_d1", people[0].d], ["_d2", people[1].d]],
      ["Journey time added to the time last seen gives the arrival time.", "Compare each arrival with the time the door opened."]);
  }
  if (tier === "hard") {
    for (let i = 0; i < TRY; i++) {
      const cnt = rng.int(1, 2), names = pick(rng, 3), T = rng.int(144, 252) * 5, ask = rng.int(0, 2);
      const idx = rng.shuffle([0, 1, 2]), couldSet = new Set(idx.slice(0, cnt));
      const people = names.map((j, k) => {
        const gap = 5 * rng.int(2, 12), could = couldSet.has(k), arr = could ? T - gap : T + gap, d = 5 * rng.int(4, 16);
        return { j, t: arr - d, d, arr, could };
      });
      if (new Set(people.map((p) => p.arr)).size < 3) continue;
      const first = people.reduce((a, b) => (b.arr < a.arr ? b : a));
      const who = people[ask];
      const parts = [
        clockPart("arr", "Arrival", `The earliest ${the(who.j)} could have reached the stockroom`, who.arr, "Arrival time = the time last seen + the journey. Add the minutes, carrying over each full 60."),
        numPart("n", "How many could?", `How many of the three could have reached the stockroom at or before ${clock(T)}?`, cnt, 0, "Work out all three arrival times and count those at or before the time the door opened."),
        { id: "first", label: "First there", ask: "Who could have arrived at the stockroom first?", answerType: "choice", answer: The(first.j), choices: shuffled(rng, names.map(The)), hint: "Compare the three arrival times: the smallest is the earliest." },
      ];
      const ex = `**Arrivals:** ${people.map((p) => `${the(p.j)} ${clock(p.t)} + ${p.d} min = ${clock(p.arr)}`).join("; ")}. The earliest ${the(who.j)} could arrive is **${clock(who.arr)}**.\n\n**How many:** the door opened at ${clock(T)}. ${cap(people.filter((p) => p.could).map((p) => the(p.j)).join(" and "))} ${cnt === 1 ? "arrives" : "arrive"} in time, so **${cnt}**.\n\n**First there:** the smallest arrival time is ${clock(first.arr)}, so **${the(first.j)}**.`;
      return finish(`The alarm log shows that the stockroom door was opened at **${clock(T)}**. Three people could have used it. ${people.map((p) => seenLine(p.j, p.t, p.d)).join(" ")}`,
        parts, ex, "inv-tl2", { tier, T, a: people.map((p) => ({ j: p.j, t: p.t, d: p.d })), ask }, people.map((p, k) => [`_d${k + 1}`, p.d]),
        ["Arrival = time last seen + journey, for each person.", "Count the arrivals at or before the door time; the smallest arrival is first."]);
    }
    return tooMany();
  }
  if (tier === "expert") {
    const wantYes = rng.next() < 0.5;
    for (let i = 0; i < TRY; i++) {
      const cnt = rng.int(1, 2), names = pick(rng, 3), T = rng.int(144, 252) * 5, k = 5 * rng.int(2, 6), D = T - k;
      const idx = rng.shuffle([0, 1, 2]), couldSet = new Set(idx.slice(0, cnt));
      const people = names.map((j, q) => {
        const gap = 5 * rng.int(2, 12), could = couldSet.has(q), arr = could ? D - gap : D + gap, d = 5 * rng.int(4, 16);
        return { j, t: arr - d, d, arr, could };
      });
      if (new Set(people.map((p) => p.arr)).size < 3) continue;
      const X = people[rng.int(0, 2)], m = 5 * rng.int(1, 8);
      if (X.arr + m === D) continue;
      const yes = X.arr + m <= D;
      if (yes !== wantYes) continue;
      const first = people.reduce((a, b) => (b.arr < a.arr ? b : a));
      const spare = D - first.arr;
      const parts = [
        clockPart("late", "Latest arrival", `The latest a person could arrive and still open the safe by ${clock(T)}`, D, "The safe needs the stated minutes after arrival. Take that many minutes off the time it was opened."),
        numPart("n", "How many could?", "How many of the three could arrive in time to open it?", cnt, 0, "Work out each arrival time (last seen + journey) and count those at or before the latest arrival time."),
        numPart("spare", "Spare minutes", "Minutes to spare for the person who arrives earliest, before the latest arrival time (minutes)", spare, 0, "Latest arrival time minus the earliest arrival among the three."),
        yesNo("shift", "After the new witness?", `A witness now says ${the(X.j)} was last seen **${m} minutes later** than logged. Could ${the(X.j)} still have opened the safe?`, yes, "Add the shift to that person's arrival time, then compare it with the latest arrival time."),
      ];
      const ex = `**Latest arrival:** ${clock(T)} − ${k} min = **${clock(D)}**.\n\n**Arrivals:** ${people.map((p) => `${the(p.j)} ${clock(p.t)} + ${p.d} = ${clock(p.arr)}`).join("; ")}. ${cap(people.filter((p) => p.could).map((p) => the(p.j)).join(" and "))} arrive${cnt === 1 ? "s" : ""} at or before ${clock(D)}, so **${cnt}**.\n\n**Spare:** earliest arrival ${clock(first.arr)}, so ${clock(D)} − ${clock(first.arr)} = **${spare} min**.\n\n**New witness:** ${the(X.j)} would arrive at ${clock(X.arr)} + ${m} = ${clock(X.arr + m)}, which is ${yes ? "no later than" : "later than"} ${clock(D)}: **${YN(yes)}**.`;
      return finish(`The alarm log shows that the stockroom safe was opened at **${clock(T)}**. Opening it takes **${k} minutes** after arriving, so the person must have arrived early enough. Three people are being considered. ${people.map((p) => seenLine(p.j, p.t, p.d)).join(" ")}`,
        parts, ex, "inv-tl3", { tier, T, k, m, a: people.map((p) => ({ j: p.j, t: p.t, d: p.d })), x: X.j }, [["_k", k], ...people.map((p, q) => [`_d${q + 1}`, p.d]), ["_m", m]],
        ["First find the latest arrival time, then each person's arrival.", "The new witness moves one arrival later by the stated minutes."]);
    }
    return tooMany();
  }
  // expert-plus: working backwards; a journey with a wait, two claims judged
  const wantA = rng.next() < 0.5, wantB = rng.next() < 0.5;
  const [A, B] = pick(rng, 2);
  const T = rng.int(144, 252) * 5, k = 5 * rng.int(2, 6), D = T - k;
  const a = 5 * rng.int(4, 10), w = 5 * rng.int(1, 4), b = 5 * rng.int(1, 4), J = a + w + b, LB = D - J, tB = LB - 5 * rng.int(2, 10);
  const dA = 5 * rng.int(4, 16), LA = D - dA, tA = LA - 5 * rng.int(2, 10);
  const claim = (L, t, want) => (want ? t + 5 * rng.int(0, Math.floor((L - t - 5) / 5)) : L + 5 * rng.int(1, 6));
  const sA = claim(LA, tA, wantA), sB = claim(LB, tB, wantB);
  const okA = sA <= LA, okB = sB <= LB, slack = LB - tB;
  const lab = (ok) => (ok ? "Possible" : "Impossible");
  const parts = [
    numPart("j", "Journey time", `Total journey time for ${the(B)} (bus, wait and walk together) (minutes)`, J, 0, "Add all three stages of the journey, including the wait."),
    clockPart("latest", "Latest departure", `The latest ${the(B)} could have left the last-seen place and still opened the safe by ${clock(T)}`, LB, "Work backwards: take the opening time off the time the safe was opened, then take the whole journey off that."),
    numPart("slack", "Time to spare", `How long after being last seen could ${the(B)} have waited before leaving (minutes)`, slack, 0, "Latest departure minus the time last seen."),
    segPart2(rng, "verdict", "The two claims", `Each person gave a time they left the last-seen place. ${The(A)} says **${clock(sA)}** and ${the(B)} says **${clock(sB)}**. Judge each claim: could that person still have opened the safe in time?`,
      [The(A), The(B)], ["Possible", "Impossible"], ["Possible", "Impossible"], [lab(okA), lab(okB)],
      "For each person: latest departure = the latest arrival time minus their journey. A claimed departure after that is too late."),
  ];
  const ex = `**Journey:** ${a} + ${w} + ${b} = **${J} min**.\n\n**Latest departure:** the safe opened at ${clock(T)} and needs ${k} min, so the latest arrival is ${clock(D)}. Then ${clock(D)} − ${J} min = **${clock(LB)}**.\n\n**Time to spare:** ${clock(LB)} − ${clock(tB)} = **${slack} min**.\n\n**Claims:** ${the(B)} left at ${clock(sB)}, ${okB ? "no later than" : "later than"} ${clock(LB)}: **${lab(okB)}**. ${The(A)} has ${aN(dA)} ${dA}-minute journey, so the latest departure is ${clock(D)} − ${dA} = ${clock(LA)}; the claim ${clock(sA)} is ${okA ? "no later than" : "later than"} that: **${lab(okA)}**.`;
  return finish(`The alarm log shows that the stockroom safe was opened at **${clock(T)}**, and opening it takes **${k} minutes** after arriving. ${The(A)} was last seen at **${clock(tA)}**, ${aN(dA)} **${dA}-minute** journey away. ${The(B)} was last seen at **${clock(tB)}** and travels by bus (**${a} min**), waits for a connection (**${w} min**), then walks (**${b} min**).`,
    parts, ex, "inv-tl4", { tier, T, k, A, B, tA, dA, tB, a, w, b, sA, sB }, [["_k", k], ["_dA", dA], ["_bus", a], ["_wait", w], ["_walk", b]],
    ["Work backwards from the time the safe was opened.", "Each claim is judged against that person's latest departure."]);
}

// ---------- statements ----------
// n people each make one statement about who took the item. Exactly one statement is false.
// A statement is { s: speaker, t: "is"|"not"|"or"|"nor", a, b }.

const holds = (st, c) => (st.t === "is" ? c === st.a : st.t === "not" ? c !== st.a : st.t === "or" ? c === st.a || c === st.b : c !== st.a && c !== st.b);

function stText(st, names) {
  const ref = (x) => (x === st.s ? "me" : the(names[x]));
  if (st.t === "is") return `It was ${the(names[st.a])}.`;
  if (st.t === "not") return `It was not ${ref(st.a)}.`;
  if (st.t === "or") return `It was ${the(names[st.a])} or ${the(names[st.b])}.`;
  return `It was neither ${ref(st.a)} nor ${ref(st.b)}.`;
}

function genStatements(rng, tier) {
  const n = tier === "medium" || tier === "hard" ? 4 : 5;
  const wantTruth = rng.next() < 0.5;
  outer: for (let i = 0; i < TRY; i++) {
    const names = pick(rng, n), sts = [];
    for (let s = 0; s < n; s++) {
      const t = rng.pick(["is", "not", "or", "nor"]), a = rng.int(0, n - 1), b = rng.int(0, n - 1);
      if (t === "is" && a === s) continue outer;
      if ((t === "or" || t === "nor") && a === b) continue outer;
      if (t === "or" && (a === s || b === s)) continue outer;
      sts.push({ s, t, a, b });
    }
    const falses = (c) => sts.map((st, k) => (holds(st, c) ? -1 : k)).filter((k) => k >= 0);
    const worlds = [...Array(n).keys()].filter((c) => falses(c).length === 1);
    if (worlds.length !== 1) continue;
    const culprit = worlds[0], liar = falses(culprit)[0];
    const others = [...Array(n).keys()].filter((c) => c !== culprit);
    const X = others[rng.int(0, others.length - 1)];
    const nameChoices = () => shuffled(rng, names.map(The));
    const parts = [
      { id: "liar", label: "The liar", ask: "Who made the false statement?", answerType: "choice", answer: The(names[liar]), choices: nameChoices(), hint: "Try each person as the one who took it, and count how many statements would then be false. Only one choice gives exactly one." },
      { id: "culprit", label: "Who took it", ask: "Who took the item?", answerType: "choice", answer: The(names[culprit]), choices: nameChoices(), hint: "The world that makes exactly one statement false is the real one." },
    ];
    const fX = falses(X).length;
    let kind = "inv-st1", extra = {};
    let ex = `**Test each suspect.** ${names.map((j, c) => `${c ? "if" : "If"} it was ${the(j)}: ${falses(c).length === 0 ? "no statement is false" : `statement${falses(c).length > 1 ? "s" : ""} ${falses(c).map((k) => k + 1).join(", ")} ${falses(c).length > 1 ? "are" : "is"} false`}`).join("; ")}.\n\nOnly ${the(names[culprit])} gives exactly one false statement (number ${liar + 1}, made by ${the(names[liar])}).\n\n**Liar:** **${The(names[liar])}**. **Took it:** **${The(names[culprit])}**.`;
    const hints = ["Assume each person in turn took it and mark which statements fail.", "Keep only the case with exactly one false statement."];
    if (tier === "hard") {
      parts.push(numPart("alt", "If it were another", `If it had instead been ${the(names[X])}, how many of the ${n} statements would be false?`, fX, 0, "Treat that person as the one who took it and check each statement in turn, counting the false ones."));
      ex += `\n\n**If it were ${the(names[X])}:** **${fX}** of the ${n} statements would be false.`;
      kind = "inv-st2"; extra = { x: X };
    } else if (tier === "expert" || tier === "expert-plus") {
      // A truthful Z is the culprit about half the time (when the culprit is not the liar), so naming the
      // culprit does not give away "No" (the liar is the culprit in about a third of puzzles).
      const nonLiars = others.filter((c) => c !== liar);
      const Z = !wantTruth ? liar : culprit !== liar && rng.next() < 0.5 ? culprit : nonLiars[rng.int(0, nonLiars.length - 1)];
      const zTruth = Z !== liar;
      if (zTruth !== wantTruth) continue;
      if (tier === "expert") {
        parts.push(numPart("alt", "If it were another", `If it had instead been ${the(names[X])}, how many of the ${n} statements would be false?`, fX, 0, "Treat that person as the one who took it and check each statement in turn, counting the false ones."));
        ex += `\n\n**If it were ${the(names[X])}:** **${fX}** of the ${n} statements would be false.`;
        kind = "inv-st3"; extra = { x: X, z: Z };
      } else {
        const rem = [...Array(n).keys()].filter((c) => sts.every((st, k) => k === liar || holds(st, c))).length;
        parts.push(numPart("rem", "Without that statement", `Suppose the false statement is thrown out and the other ${n - 1} are taken as true. How many of the ${n} people could then have taken it?`, rem, 0, "Ignore the false statement entirely. Check each person as the one who took it against the remaining statements, and count those who pass them all."));
        ex += `\n\n**Without statement ${liar + 1}:** the other statements all hold for **${rem}** possible ${rem === 1 ? "person" : "people"}.`;
        kind = "inv-st4"; extra = { z: Z };
      }
      parts.push(yesNo("truth", "Telling the truth?", `Is ${the(names[Z])} certainly telling the truth?`, zTruth, "Exactly one person lies. Is the person you named the one you found, or someone else?"));
      ex += `\n\n**Truthful?** ${The(names[Z])} ${zTruth ? "is not the liar" : "is the liar"}: **${YN(zTruth)}**.`;
      hints.push("The liar is the only one not telling the truth.");
    }
    const lines = sts.map((st, k) => `${k + 1}. **${The(names[st.s])}:** "${stText(st, names)}"`).join("\n");
    return finish(`Something went missing from the staff room, and exactly one of ${n === 4 ? "four" : "five"} people took it. Each of them made one statement, listed below. **Exactly one of the ${n} statements is false**; the rest are true.\n\n${lines}`,
      parts, ex, kind, { tier, n, names, sts, ...extra }, [], hints);
  }
  return tooMany();
}

// ---------- record-patterns ----------

// exactly one index whose removal leaves the rest on one straight line (index vs value)
const collinearWithout = (vals, skip) => {
  const pts = vals.map((v, i) => [i, v]).filter(([i]) => i !== skip);
  const [x0, y0] = pts[0], [x1, y1] = pts[1];
  return pts.every(([x, y]) => (y - y0) * (x1 - x0) === (y1 - y0) * (x - x0));
};
const brokenIndices = (vals) => vals.map((_, i) => i).filter((i) => collinearWithout(vals, i));

function amountList(rng, n, c1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = i < c1 ? 1 : rng.int(2, 9), e = rng.int(1, 3);
    out.push(d * 10 ** e + rng.int(0, 10 ** e - 1));
  }
  return rng.shuffle(out);
}
const lead = (v) => +String(v)[0];

function genRecords(rng, tier) {
  if (tier === "medium" || tier === "hard") {
    for (let i = 0; i < TRY; i++) {
      const N = tier === "medium" ? 6 : 7, a0 = 50 * rng.int(4, 20), d = 25 * rng.int(2, 8), b = rng.int(0, N - 1), extra = 25 * rng.int(2, 10);
      const exp = Array.from({ length: N }, (_, k) => a0 + k * d), vals = exp.slice();
      vals[b] += extra;
      const bi = brokenIndices(vals);
      if (bi.length !== 1 || bi[0] !== b) continue;
      const pct = (extra / exp[b]) * 100;
      if (tier === "hard" && nearHalf(pct, 1, 0.1)) continue;
      const choices = shuffled(rng, vals.map((_, k) => `Invoice ${k + 1}`));
      const parts = [
        { id: "odd", label: "Odd one out", ask: "Which invoice breaks the pattern?", answerType: "choice", answer: `Invoice ${b + 1}`, choices, hint: "The other invoices rise by the same step each time. Find the step from the entries that agree, then see which one does not fit." },
        numPart("exp", "Expected amount", "The amount that invoice should have been ($)", exp[b], 0, "Use the steady step: the amount should be the neighbouring invoice plus or minus one step."),
      ];
      let ex = `**Pattern:** the entries that agree rise by **${usd(d)}** each time. Invoice ${b + 1} does not fit.\n\n**Expected:** ${usd(exp[b])} (recorded ${usd(vals[b])}), so **${usd(exp[b])}**.`;
      const hints = ["Find the common step from entries that agree.", "The expected value follows the same step."];
      if (tier === "hard") {
        parts.push(numPart("pct", "Overstated by", "By what percentage is the recorded amount above the expected amount (%)", pct, 1, "Percentage = (recorded − expected) ÷ expected × 100."));
        ex += `\n\n**Percentage:** (${f(vals[b])} − ${f(exp[b])}) ÷ ${f(exp[b])} × 100 = **${roundTo(pct, 1).toFixed(1)}%**.`;
        hints.push("Divide the difference by the expected amount.");
      }
      const table = `| Invoice | Amount |\n|---|---|\n${vals.map((v, k) => `| ${k + 1} | ${usd(v)} |`).join("\n")}`;
      return finish(`A supplier's invoices are meant to rise by the **same fixed amount** each time. These ${N} are on file, and exactly one has been altered upwards.\n\n${table}`,
        parts, ex, tier === "medium" ? "inv-rec1" : "inv-rec2", { tier, vals }, vals.map((v, k) => [`_a${k + 1}`, v]), hints);
    }
    return tooMany();
  }
  if (tier === "expert") {
    const wantFlag = rng.next() < 0.5, N = 20;
    const c1 = wantFlag ? rng.pick([1, 2, 3, 9, 10, 11, 12]) : rng.pick([5, 6, 7]);
    const vals = amountList(rng, N, c1);
    const share = (c1 / N) * 100, away = Math.abs(share - 30), flag = away > 10;
    const parts = [
      numPart("c1", "Count of 1s", "How many of the 20 amounts start with the digit 1?", c1, 0, "Look only at the first digit of each amount, ignoring the commas."),
      numPart("share", "Share", "That count as a percentage of the 20 amounts (%)", share, 0, "Count ÷ 20 × 100."),
      numPart("away", "Distance from 30%", "How many percentage points is that share away from 30 (always positive)", away, 0, "Subtract 30 from the share and ignore the sign."),
      yesNo("flag", "Flag the batch?", "Is the batch flagged?", flag, "Compare the distance with the stated limit: flagged only if it is more than that."),
    ];
    const ex = `**Count:** **${c1}** amounts start with 1.\n\n**Share:** ${c1} ÷ 20 × 100 = **${f(share)}%**.\n\n**Distance from 30:** |${f(share)} − 30| = **${f(away)}**.\n\n**Flag:** ${f(away)} is ${flag ? "more than" : "not more than"} 10, so **${YN(flag)}**.`;
    return finish(`A batch of 20 invoice amounts (made up, whole dollars): ${vals.map(usd).join(", ")}.\n\nThe rule for this exercise: in genuine batches about **30%** of amounts start with the digit 1. Flag a batch if the share starting with 1 is **more than 10 percentage points** away from 30%, above or below.`,
      parts, ex, "inv-rec3", { tier, vals }, [["_n", N], ["_exp", 30], ["_lim", 10]],
      ["Count first digits, then convert to a percentage.", "Flag only if the distance is more than 10 points."]);
  }
  // expert-plus: expected counts, a backwards threshold, and two flags
  const wantF1 = rng.next() < 0.5, wantF9 = rng.next() < 0.5;
  const N = rng.pick([80, 120, 160, 200, 240]), E1 = 0.3 * N, E9 = 0.05 * N, b1 = 0.25 * E1, b9 = 0.25 * E9;
  const off = (E, bound, want) => {
    if (!want) return E + rng.int(-(Math.ceil(bound) - 1), Math.ceil(bound) - 1);
    let mag = Math.floor(bound) + 1 + rng.int(0, 2), sign = rng.next() < 0.5 ? -1 : 1;
    if (E + sign * mag < 0) sign = 1;
    return E + sign * mag;
  };
  const n1 = off(E1, b1, wantF1), n9 = off(E9, b9, wantF9);
  const flag = (n, E, b) => Math.abs(n - E) > b;
  const lab = (x) => (x ? "Flagged" : "Normal");
  const f1 = flag(n1, E1, b1), f9 = flag(n9, E9, b9), minFlag = Math.floor(1.25 * E9) + 1;
  const parts = [
    numPart("e1", "Expected 1s", `Expected number of amounts starting with 1 in the batch of ${N}`, E1, 0, "Expected count = share × batch size."),
    numPart("e9", "Expected 9s", `Expected number of amounts starting with 9 in the batch of ${N}`, E9, 0, "Expected count = share × batch size."),
    numPart("min9", "Smallest flagged count", "The smallest count of 9s that would be flagged as too many (whole number)", minFlag, 0, "Work out 25% above the expected count of 9s. The count must be strictly more than that; take the next whole number."),
    segPart2(rng, "verdict", "The two digits", "Judge each digit against its expected count.", ["Digit 1", "Digit 9"], ["Normal", "Flagged"], ["Normal", "Flagged"], [lab(f1), lab(f9)],
      "A digit is flagged only if its count is more than 25% above or below its expected count. Compare the gap with 25% of the expected count."),
  ];
  const ex = `**Expected:** 30% of ${N} = **${E1}** starting with 1; 5% of ${N} = **${E9}** starting with 9.\n\n**Smallest flagged 9s:** 25% above ${E9} is ${f(1.25 * E9)}, and the count must be more than that, so **${minFlag}**.\n\n**Verdicts:** digit 1: gap |${n1} − ${E1}| = ${Math.abs(n1 - E1)} against 25% of ${E1} = ${f(b1)}, **${lab(f1)}**. Digit 9: gap |${n9} − ${E9}| = ${Math.abs(n9 - E9)} against ${f(b9)}, **${lab(f9)}**.`;
  return finish(`A batch of **${N}** invoice amounts is checked by first digit. The rule for this exercise: about **30%** of genuine amounts start with 1 and about **5%** start with 9. A digit is **flagged** if its count is **more than 25%** above or below its expected count. In this batch **${n1}** amounts start with 1 and **${n9}** start with 9.`,
    parts, ex, "inv-rec4", { tier, N, n1, n9 }, [["_N", N], ["_p1", 30], ["_p9", 5], ["_lim", 25]],
    ["Expected counts first, then the 25% bands around them.", "The threshold question works backwards from the band."]);
}

// ---------- flag-odds ----------

function genOdds(rng, tier) {
  const wantYes = rng.next() < 0.5, wantMaj = rng.next() < 0.5, wantCope = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const N = rng.pick([500, 1000, 1500, 2000, 2500, 3000, 4000, 5000]), r = rng.pick([1, 2, 4, 5, 8, 10]), s = rng.pick([50, 60, 70, 75, 80, 90]);
    const fr = tier === "medium" ? rng.pick([1, 2, 5]) : rng.pick([1, 1.5, 2, 2.5, 3, 4, 5, 8]);
    const F0 = (N * r) / 100, TP = (F0 * s) / 100, honest = N - F0, FP = (honest * fr) / 100;
    if (!isEx(TP, 0)) continue;
    const fmtF = (x) => f(x);
    const intro = `A screening check flags claims for review (made-up figures, practice only). Of **${commas(N)}** claims, **${r}%** are really fraudulent. The check flags **${s}%** of the fraudulent claims`;
    if (tier === "medium") {
      const parts = [
        numPart("fraud", "Fraudulent claims", `How many of the ${commas(N)} claims are fraudulent?`, F0, 0, "Find the stated percentage of the total number of claims."),
        numPart("tp", "Flagged and real", "How many fraudulent claims does the check flag?", TP, 0, "Take the stated percentage of the fraudulent claims, not of all claims."),
      ];
      const ex = `**Fraudulent:** ${r}% of ${commas(N)} = **${commas(F0)}**.\n\n**Flagged and real:** ${s}% of ${commas(F0)} = **${f(TP)}**.`;
      return finish(`${intro}.`, parts, ex, "inv-odd1", { tier, N, r, s }, [["_N", N], ["_r", r], ["_s", s]],
        ["Work out the fraudulent claims first.", "Then take the flag percentage of those only."]);
    }
    if (!isEx(FP, 0) || FP < 3) continue;
    const flagged = TP + FP, pct = (TP / flagged) * 100;
    if (nearHalf(pct, 1, 0.1) || pct < 8 || pct > 92) continue;
    const introF = `${intro} and also wrongly flags **${fmtF(fr)}%** of the honest claims.`;
    const base = { tier, N, r, s, fr };
    const given = [["_N", N], ["_r", r], ["_s", s], ["_f", fr]];
    if (tier === "hard") {
      const parts = [
        numPart("tp", "Flagged and real", "How many fraudulent claims does the check flag?", TP, 0, "Fraudulent claims = the true rate × all claims; then take the flag percentage of those."),
        numPart("fp", "Flagged but honest", "How many honest claims does it wrongly flag?", FP, 0, "Honest claims = all claims minus the fraudulent ones; then take the false-flag percentage of those."),
        numPart("pct", "Chance a flag is real", "Of all flagged claims, what percentage are really fraudulent (%)", pct, 1, "Flagged and real ÷ all flagged × 100, where all flagged = the two counts added."),
      ];
      const ex = `**Flagged and real:** ${commas(F0)} fraudulent × ${s}% = **${f(TP)}**.\n\n**Flagged but honest:** ${commas(honest)} honest × ${fmtF(fr)}% = **${f(FP)}**.\n\n**Chance real:** ${f(TP)} ÷ (${f(TP)} + ${f(FP)}) × 100 = **${roundTo(pct, 1).toFixed(1)}%**.`;
      return finish(introF, parts, ex, "inv-odd2", base, given, ["Two groups get flagged: the real ones and the honest ones.", "The chance is the real share of the whole flagged group."]);
    }
    if (tier === "expert") {
      let thr;
      if (wantYes) { thr = 5 * Math.floor((pct - 3) / 5); if (thr < 5) continue; }
      else { thr = 5 * Math.ceil((pct + 3) / 5); if (thr > 95) continue; }
      const yes = pct >= thr;
      if (yes !== wantYes) continue;
      const parts = [
        numPart("tp", "Flagged and real", "How many fraudulent claims does the check flag?", TP, 0, "Fraudulent claims = the true rate × all claims; then take the flag percentage of those."),
        numPart("flagged", "All flagged", "How many claims does the check flag in total?", flagged, 0, "Add the flagged fraudulent claims and the flagged honest ones."),
        numPart("pct", "Chance a flag is real", "Of all flagged claims, what percentage are really fraudulent (%)", pct, 1, "Flagged and real ÷ all flagged × 100."),
        yesNo("review", "Full review?", `The rule: send a flagged claim to full review only if the chance it is real is at least **${thr}%**. Do flagged claims qualify?`, yes, "Compare the percentage you found with the stated rule: at least means equal or more."),
      ];
      const ex = `**Flagged and real:** ${commas(F0)} × ${s}% = **${f(TP)}**.\n\n**All flagged:** ${f(TP)} real + ${commas(honest)} × ${fmtF(fr)}% = ${f(TP)} + ${f(FP)} = **${f(flagged)}**.\n\n**Chance real:** ${f(TP)} ÷ ${f(flagged)} × 100 = **${roundTo(pct, 1).toFixed(1)}%**.\n\n**Review:** ${roundTo(pct, 1).toFixed(1)}% is ${yes ? "at least" : "below"} ${thr}%: **${YN(yes)}**.`;
      return finish(introF, parts, ex, "inv-odd3", { ...base, thr }, [...given, ["_thr", thr]], ["Count the real and the honest flags separately, then combine.", "Then compare the percentage with the stated rule."]);
    }
    // expert-plus: the false-alarm rate is not stated; the total flagged is
    const maj = TP > FP;
    if (maj !== wantMaj || Math.abs(TP - FP) < 5) continue;
    let C;
    if (wantCope) C = flagged + 10 * rng.int(1, 8);
    else { if (flagged < 80) continue; C = flagged - 10 * rng.int(1, 6); }
    const cope = flagged <= C;
    const introB = `A screening check flags claims for review (made-up figures, practice only). Of **${commas(N)}** claims, **${r}%** are really fraudulent, and the check flags **${s}%** of the fraudulent ones. In total it flagged **${flagged}** claims. The review team can check at most **${C}** claims.`;
    const mlab = (x) => (x ? "Majority real" : "Minority real"), clab = (x) => (x ? "Copes" : "Overloaded");
    const parts = [
      numPart("tp", "Flagged and real", "How many fraudulent claims does the check flag?", TP, 0, "Fraudulent claims = the true rate × all claims; then take the flag percentage of those."),
      numPart("fp", "Flagged but honest", "How many honest claims were flagged (whole number)", FP, 0, "All flagged claims minus the flagged fraudulent ones are the honest claims that were flagged."),
      numPart("far", "False-alarm rate", "The percentage of honest claims that the check wrongly flags (%)", fr, 1, "Divide the wrongly flagged claims by all honest claims, then multiply by 100."),
      segPart2(rng, "verdict", "Real share and workload", "Judge the flagged group: are most of the flags real, and can the review team check them all?", ["Flags that are real", "Review team"], ["Majority real", "Minority real"], ["Copes", "Overloaded"], [mlab(maj), clab(cope)],
        "Compare the real flags with the honest flags: more than half real means a majority. For the team, compare the total flagged with the most it can check."),
    ];
    const ex = `**Flagged and real:** ${commas(F0)} × ${s}% = **${f(TP)}**.\n\n**Flagged but honest:** ${f(flagged)} − ${f(TP)} = **${f(FP)}**.\n\n**False-alarm rate:** honest claims are ${commas(N)} − ${commas(F0)} = ${commas(honest)}, so ${f(FP)} ÷ ${commas(honest)} × 100 = **${roundTo(fr, 1).toFixed(1)}%**.\n\n**Verdict:** ${f(TP)} real against ${f(FP)} honest is **${mlab(maj)}**. ${f(flagged)} flagged is ${cope ? "within" : "over"} the team's ${C}: **${clab(cope)}**.`;
    return finish(introB, parts, ex, "inv-odd4", { tier, N, r, s, F: flagged, C }, [["_N", N], ["_r", r], ["_s", s], ["_F", flagged], ["_C", C]],
      ["Start with the real flags, then work backwards from the total.", "The false-alarm rate uses the honest claims, not all claims."]);
  }
  return tooMany();
}

// ---------- entry point ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "timeline") return genTimeline(rng, difficulty);
  if (subtopic === "statements") return genStatements(rng, difficulty);
  if (subtopic === "record-patterns") return genRecords(rng, difficulty);
  if (subtopic === "flag-odds") return genOdds(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route: arrivals by comparing the time
// available with the journey needed; statements by trying each person as the liar (the generator tried each
// person as the culprit); patterns by fitting a line through the other points; digits by string scanning
// and a loop for the threshold; odds by natural-frequency tables and ratios.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const clk = (m) => ({ clock: m });
const lab2 = (x, a, b) => (x ? a : b);

// Statements: pairs (liar, culprit) such that, with that liar, that statement is false and the rest true.
function liarPairs(p) {
  const out = [];
  for (let L = 0; L < p.n; L++) for (let c = 0; c < p.n; c++) {
    if (p.sts.every((st, k) => (k === L ? !holds(st, c) : holds(st, c)))) out.push([L, c]);
  }
  if (out.length !== 1) throw new Error("not a unique liar and culprit"); // verify() then returns false
  return out;
}

const ALT = {
  "inv-tl1": (p) => {
    const need = p.a.map((x) => x.d), have = p.a.map((x) => p.T - x.t); // minutes available vs journey needed
    const c = have.map((h, i) => h >= need[i]);
    const who = c[0] && c[1] ? "Both" : !c[0] && !c[1] ? "Neither" : `Only ${the(c[0] ? p.a[0].j : p.a[1].j)}`;
    return { arr: clk(p.a[p.ask].t + p.a[p.ask].d), who };
  },
  "inv-tl2": (p) => {
    const have = p.a.map((x) => p.T - x.t), c = have.map((h, i) => h >= p.a[i].d);
    let best = 0; p.a.forEach((x, i) => { if (x.t + x.d < p.a[best].t + p.a[best].d) best = i; });
    return { arr: clk(p.a[p.ask].t + p.a[p.ask].d), n: c.filter(Boolean).length, first: The(p.a[best].j) };
  },
  "inv-tl3": (p) => {
    const D = p.T - p.k, avail = p.a.map((x) => D - x.t), c = avail.map((h, i) => h >= p.a[i].d);
    const slacks = p.a.map((x, i) => avail[i] - x.d);
    const X = p.a.find((x) => x.j === p.x), after = D - (X.t + p.m) >= X.d;
    return { late: clk(D), n: c.filter(Boolean).length, spare: Math.max(...slacks), shift: YN(after) };
  },
  "inv-tl4": (p) => {
    const D = p.T - p.k, J = p.a + p.w + p.b, depB = D - J, depA = D - p.dA;
    return { j: J, latest: clk(depB), slack: depB - p.tB, verdict: `${lab2(p.sA <= depA, "Possible", "Impossible")} | ${lab2(p.sB <= depB, "Possible", "Impossible")}` };
  },
  "inv-st1": (p) => { const [[L, c]] = liarPairs(p); return { liar: The(p.names[L]), culprit: The(p.names[c]) }; },
  "inv-st2": (p) => {
    const [[L, c]] = liarPairs(p);
    return { liar: The(p.names[L]), culprit: The(p.names[c]), alt: p.sts.filter((st) => !holds(st, p.x)).length };
  },
  "inv-st3": (p) => {
    const [[L, c]] = liarPairs(p);
    return { liar: The(p.names[L]), culprit: The(p.names[c]), alt: p.sts.filter((st) => !holds(st, p.x)).length, truth: YN(p.z !== L) };
  },
  "inv-st4": (p) => {
    const pairs = liarPairs(p), [L, c] = pairs[0];
    let rem = 0; for (let q = 0; q < p.n; q++) if (p.sts.every((st, k) => k === L || holds(st, q))) rem++;
    return { liar: The(p.names[L]), culprit: The(p.names[c]), rem, truth: YN(p.z !== L) };
  },
  "inv-rec1": (p) => {
    const bi = brokenIndices(p.vals); if (bi.length !== 1) return {};
    const k = bi[0], [j, other] = p.vals.map((_, i) => i).filter((i) => i !== k); // expected via a line through two other entries
    const step = (p.vals[other] - p.vals[j]) / (other - j);
    return { odd: `Invoice ${k + 1}`, exp: p.vals[j] + step * (k - j) };
  },
  "inv-rec2": (p) => {
    const bi = brokenIndices(p.vals); if (bi.length !== 1) return {};
    const k = bi[0], [j, other] = p.vals.map((_, i) => i).filter((i) => i !== k);
    const step = (p.vals[other] - p.vals[j]) / (other - j), e = p.vals[j] + step * (k - j);
    return { odd: `Invoice ${k + 1}`, exp: e, pct: ((p.vals[k] - e) / e) * 100 };
  },
  "inv-rec3": (p) => {
    const c1 = p.vals.filter((v) => String(v).startsWith("1")).length, sh = (100 * c1) / p.vals.length;
    return { c1, share: sh, away: Math.abs(sh - 30), flag: YN(Math.abs(sh - 30) > 10) };
  },
  "inv-rec4": (p) => {
    const e1 = (30 * p.N) / 100, e9 = (5 * p.N) / 100;
    let m = 0; while (!(m * 4 > e9 * 5)) m++; // smallest whole count strictly above 125% of expected
    const fl = (n, e) => Math.abs(n - e) * 4 > e;
    return { e1, e9, min9: m, verdict: `${lab2(fl(p.n1, e1), "Flagged", "Normal")} | ${lab2(fl(p.n9, e9), "Flagged", "Normal")}` };
  },
  "inv-odd1": (p) => { const fr = Math.round((p.N * p.r) / 100); return { fraud: fr, tp: (fr * p.s) / 100 }; },
  "inv-odd2": (p) => {
    const fr = (p.N * p.r) / 100, tp = (fr * p.s) / 100, fp = ((p.N - fr) * p.fr) / 100;
    return { tp, fp, pct: (100 * tp) / (tp + fp) };
  },
  "inv-odd3": (p) => {
    const fr = (p.N * p.r) / 100, tp = (fr * p.s) / 100, fp = ((p.N - fr) * p.fr) / 100, pct = (100 * tp) / (tp + fp);
    return { tp, flagged: tp + fp, pct, review: YN(pct >= p.thr) };
  },
  "inv-odd4": (p) => {
    const fr = (p.N * p.r) / 100, tp = (fr * p.s) / 100, fp = p.F - tp;
    return { tp, fp, far: (100 * fp) / (p.N - fr), verdict: `${lab2(tp > fp, "Majority real", "Minority real")} | ${lab2(p.F <= p.C, "Copes", "Overloaded")}` };
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
    } else if (part.answerType === "text") {
      if (!(tv && typeof tv === "object" && "clock" in tv)) return false;
      if (parseClock(partStr(answer, part.id)) !== tv.clock) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
