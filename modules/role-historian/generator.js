// Historian role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario that REASONS FROM FACTS STATED IN THE PROMPT (years of
// well-known events, made-up documents and objects, stated rules); nothing has to be recalled.
// Hints and explanations use only values already drawn (no rng calls); verify() recomputes every
// part by another route (astronomical years with a year 0, the platform Date in UTC).
// All inputs are whole numbers and every chained answer is an exact integer (or an exact 2 dp
// figure), so a rounded earlier answer never changes a later one.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   dating-sources    earliest and latest possible year of a document, which event is too late   (Archivist)
//   calendar-spans    days, whole years, weekday and lapse dates of a term; work back from the end (Archivist)
//   object-labels     age, century label, gallery and room rules for a museum object              (Curator)
//   exhibit-timeline  order, span and wall distances for events; scale and marker year backwards  (Curator)

import { WEEKDAYS, civilToDays, daysToCivil, weekdayOfDays, yearDistance, formatDMY } from "../../js/lib/dates.js";
import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-historian: no suitable draw"); };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ord = (n) => { const r = n % 100; const s = r >= 11 && r <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"; return `${n}${s}`; };
const NO_ZERO = "There is no year 0: 1 BC is followed directly by AD 1.";
const GREG = "Use the Gregorian calendar throughout.";

// Years: negative = BC, never 0. Shown as "44 BC", "AD 79", "1066".
const yr = (y) => (y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : String(y));
const yrAns = (y) => (y < 0 ? `${-y} BC` : String(y));
const shiftY = (y, n) => { // y moved by n years (n may be negative), skipping the missing year 0
  let z = y + n;
  if (y < 0 && z >= 0) z += 1; else if (y > 0 && z <= 0) z -= 1;
  return z;
};
const cOf = (y) => Math.ceil(Math.abs(y) / 100);
const centLabel = (n, era) => `${ord(n)} century ${era}`;
const gv = (label, y) => [`${label}_${y < 0 ? "bc" : "ad"}`, Math.abs(y)]; // a year as a calculator value
const eraOf = (y) => (y < 0 ? "BC" : "AD");

// Well-known events with undisputed years (negative = BC). Every prompt states the year it uses.
const EV = [
  ["the Battle of Marathon", -490], ["the Battle of Salamis", -480], ["the death of Alexander the Great", -323],
  ["the assassination of Julius Caesar", -44], ["the Battle of Actium", -31],
  ["the eruption of Vesuvius that buried Pompeii", 79], ["the opening of the Colosseum", 80],
  ["the start of work on Hadrian's Wall", 122], ["the Edict of Milan", 313],
  ["the Norman conquest of England", 1066], ["the sealing of Magna Carta", 1215], ["the fall of Constantinople", 1453],
  ["Columbus's first voyage across the Atlantic", 1492], ["the defeat of the Spanish Armada", 1588],
  ["the Great Fire of London", 1666], ["the American Declaration of Independence", 1776],
  ["the storming of the Bastille", 1789], ["the Battle of Trafalgar", 1805], ["the Battle of Waterloo", 1815],
  ["the opening of the Stockton and Darlington Railway", 1825], ["the opening of the Suez Canal", 1869],
  ["the first modern Olympic Games", 1896], ["the first powered flight by the Wright brothers", 1903],
  ["the sinking of the Titanic", 1912], ["the Russian Revolution", 1917], ["the Wall Street Crash", 1929],
  ["the end of the Second World War", 1945], ["the first Moon landing", 1969], ["the fall of the Berlin Wall", 1989],
];
const evPool = (rng) => (rng.next() < 0.4 ? EV.slice(0, 9) : EV);
const evText = (e) => `${e[0]} (${yr(e[1])})`;

// Parts. Whole numbers are exact, so fuzzyNumber 0.
const numPart = (id, label, ask, val, hint, dp = 0) => {
  const p = { id, label, ask, answerType: "number", answer: roundTo(val, dp), tolerance: dp === 0 ? 0 : 0.005, hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
};
const yearPart = (id, label, ask, y, hint) => ({ id, label, ask, answerType: "date", precision: "year", answer: yrAns(y), hint });
const dayPart = (id, label, ask, civ, hint) => ({ id, label, ask, answerType: "date", precision: "day", answer: formatDMY(civ), hint });
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const yesNo = (id, label, ask, ok, hint) => choicePart(id, label, ask, ok ? "Yes" : "No", ["Yes", "No"], hint);
function segPart(rng, id, label, ask, cols, a0, a1, ans, hint) {
  const ch = [];
  for (const x of a0) for (const y of a1) ch.push([x, y]);
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: rng.shuffle(ch), answer: ans, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
// Four century labels: the right one, the other era, and the neighbours.
function centOptions(rng, y) {
  const c = cOf(y), era = eraOf(y), flip = era === "BC" ? "AD" : "BC";
  return rng.shuffle([centLabel(c, era), centLabel(c, flip), centLabel(c + 1, era), c > 1 ? centLabel(c - 1, era) : centLabel(c + 2, era)]);
}
const centSeg = (rng, id, y, ask, hint) => {
  const c = cOf(y), era = eraOf(y);
  return segPart(rng, id, "Century", ask, ["Century", "Era"], [ord(c), ord(c + 1), c > 1 ? ord(c - 1) : ord(c + 2)], ["BC", "AD"], [ord(c), era], hint);
};
const HINT_CENT = "Century n covers years 100(n-1)+1 to 100n, so a year like 1200 is the last year of its century. For BC, count the same way from 1 BC backwards.";

// ---------- dating-sources ----------

const DOCS = ["letter", "ledger", "charter", "diary", "map", "chronicle", "report"];

function genDating(rng, tier) {
  const plus = tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    const doc = rng.pick(DOCS);
    if (!plus) {
      const pool = evPool(rng);
      const A = rng.pick(pool), B = rng.pick(pool);
      if (A === B || A[1] === B[1]) continue;
      const tpq = Math.max(A[1], B[1]);
      const C = shiftY(tpq, rng.int(6, 60) * 5);
      if (C > 1995) continue;
      const range = yearDistance(tpq, C);
      const bc = [A[1], B[1], C].some((y) => y < 0);
      const parts = [
        yearPart("earliest", "Earliest year", "Earliest possible year of writing", tpq, "The document cannot be older than the later of the two events it mentions. Compare their years; BC years count down, so a bigger BC number is the earlier year."),
        numPart("range", "Range", "Years from the earliest possible year to the latest possible year", range, bc ? "Count the years from your earliest year up to the book's year. If the two are on opposite sides of BC and AD, remember there is no year 0 to count." : "Subtract the earliest possible year from the book's year."),
      ];
      let tooLate = null, opts = null;
      if (tier !== "medium") {
        const later = EV.filter((e) => e[1] > C + 1);
        const earlier = EV.filter((e) => e[1] < C);
        if (!later.length || earlier.length < 3) continue;
        tooLate = rng.pick(later);
        const three = rng.shuffle(earlier).slice(0, 3);
        opts = rng.shuffle([tooLate, ...three]);
        parts.push(choicePart("toolate", "Too late", `Which of these events is definitely too late for the ${doc} to mention?`, cap(evText(tooLate)), opts.map((e) => cap(evText(e))),
          "The book quoting it gives the latest possible year. An event that happened after that year cannot be mentioned; one before it might be."));
      }
      if (tier === "expert" || tier === "expert-plus") {
        parts.push(centSeg(rng, "century", tpq, "Which century is the earliest possible year in?", HINT_CENT));
      }
      const c = cOf(tpq);
      const ex = [
        `**Earliest year:** the ${doc} must be at least as late as the later event, ${yr(tpq)}.`,
        `**Range:** from ${yr(tpq)} to ${yr(C)} is **${range}** years${tpq < 0 && C > 0 ? " (the missing year 0 means you count one fewer than adding the two year numbers)" : ""}.`,
        tooLate ? `**Too late:** the latest possible year is ${yr(C)}, and only ${evText(tooLate)} comes after it, so the other three could have been mentioned.` : "",
        tier === "expert" ? `**Century:** ${yr(tpq)} is in the ${centLabel(c, eraOf(tpq))}, so **${ord(c)} | ${eraOf(tpq)}**.` : "",
      ].filter(Boolean).join("\n\n");
      return finish(
        `An archive holds an undated **${doc}**. It mentions **${evText(A)}** and **${evText(B)}**, so it cannot have been written before the later of those events. It is also quoted in a book known to have been written in **${yr(C)}**, so it cannot be later than that. Take the earliest possible year to be the year of the later event and the latest possible year to be the book's year.${bc ? ` ${NO_ZERO}` : ""}`,
        parts, ex, "hist-dating", { tier, A: A[1], B: B[1], C, opts: opts ? opts.map((e) => ({ n: e[0], y: e[1] })) : null },
        [gv("_a", A[1]), gv("_b", B[1]), gv("_book", C)],
        ["The earliest possible year comes from the events it mentions; the latest from the book that quotes it.", "BC years count down: 400 BC is earlier than 300 BC."],
      );
    }
    // expert-plus: the author dates the event relative to the writing
    const A = rng.pick(EV);
    const N = rng.int(5, 60) * 5;
    const W = shiftY(A[1], N);
    if (W > 1995) continue;
    const wantFit = rng.next() < 0.5;
    const cands = EV.filter((e) => e !== A && (wantFit ? e[1] < W : e[1] > W));
    if (!cands.length) continue;
    const B = rng.pick(cands);
    const dC = rng.int(2, 30) * 5;
    const C = shiftY(W, rng.next() < 0.5 ? dC : -dC);
    if (C > 1995) continue;
    const fitB = B[1] < W, fitC = C >= W;
    const apart = yearDistance(W, C);
    const bc = [A[1], B[1], C, W].some((y) => y < 0);
    const parts = [
      yearPart("written", "Year written", `In which year was the ${doc} written?`, W, `The author places the event ${N} years before the time of writing, so move forward ${N} years from the event's year.${A[1] < 0 ? " If you cross from BC into AD, skip the missing year 0." : ""}`),
      numPart("apart", "Years apart", "Years between the year of writing and the year of the quoting text", apart, "Subtract the smaller year from the larger one, with the year-0 correction if one is BC and the other AD."),
      segPart(rng, "verdict", "Verdict", `Does the year you found fit the ${doc}'s mention of the second event, and the text that quotes it?`, ["Mention of event", "Quoting text"], ["Fits", "Impossible"], ["Fits", "Impossible"], [fitB ? "Fits" : "Impossible", fitC ? "Fits" : "Impossible"],
        "A document cannot mention an event that happens after it was written, and it cannot be quoted by a text written before it existed."),
      choicePart("century", "Century", `Which century is the year of writing in?`, centLabel(cOf(W), eraOf(W)), centOptions(rng, W), HINT_CENT),
    ];
    const ex = [
      `**Year written:** ${yr(A[1])} + ${N} years = **${yr(W)}**${A[1] < 0 && W > 0 ? " (skipping the missing year 0)" : ""}.`,
      `**Years apart:** ${yr(W)} and ${yr(C)} are **${apart}** years apart.`,
      `**Verdict:** the second event (${yr(B[1])}) is ${fitB ? "before" : "after"} ${yr(W)}, so it **${fitB ? "Fits" : "is Impossible"}**; the quoting text (${yr(C)}) is ${fitC ? "no earlier than" : "earlier than"} the writing, so it **${fitC ? "Fits" : "is Impossible"}**.`,
      `**Century:** ${yr(W)} is in the **${centLabel(cOf(W), eraOf(W))}**.`,
    ].join("\n\n");
    return finish(
      `An archive holds an undated **${doc}**. Its author says that **${evText(A)}** happened **${N} years** before the time of writing. The ${doc} also mentions **${evText(B)}**, and a text known to date from **${yr(C)}** quotes it.${bc ? ` ${NO_ZERO}` : ""}`,
      parts, ex, "hist-dating-plus", { A: A[1], N, B: B[1], C }, [gv("_event", A[1]), ["_years", N], gv("_second", B[1]), gv("_quote", C)],
      ["Find the year of writing first; the other three parts are checked against it.", "BC years count down, and there is no year 0."],
    );
  }
  return tooMany();
}

// ---------- calendar-spans ----------

const OFFICES = ["harbour master of Port Elmsworth", "town clerk of Marlow Vale", "lighthouse keeper at Gull Point", "librarian of the Hartley Institute", "bridge warden at Cold Ford", "postmaster of Linden Cross"];
const dayText = (days) => formatDMY(daysToCivil(days));
const cmpMD = (m1, d1, m2, d2) => (m1 !== m2 ? m1 - m2 : d1 - d2);
function wholeYears(s, e) { // completed anniversaries between civil dates s and e
  return e.y - s.y - (cmpMD(e.m, e.d, s.m, s.d) < 0 ? 1 : 0);
}
const weekdayChoices = (rng, w) => {
  const others = rng.shuffle([0, 1, 2, 3, 4, 5, 6].filter((x) => x !== w)).slice(0, 3);
  return rng.shuffle([w, ...others]).map((x) => WEEKDAYS[x]);
};

function genSpans(rng, tier) {
  const plus = tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    const office = rng.pick(OFFICES);
    if (!plus) {
      const sy = rng.int(1801, 1960), sm = rng.int(1, 12), sd = rng.int(1, 28);
      const S = civilToDays(sy, sm, sd);
      const D = rng.int(400, 2900);
      const E = S + D, ec = daysToCivil(E), sc = { y: sy, m: sm, d: sd };
      const yrs = wholeYears(sc, ec);
      if (cmpMD(ec.m, ec.d, sm, sd) === 0) continue; // never exactly on an anniversary
      const wd = weekdayOfDays(E);
      const wdHint = "Start from the stated weekday of the start date. Divide the days by 7: the remainder is how many days further on in the week the end date falls.";
      const daysP = numPart("days", "Days", "Days from the start date to the end date", D, "Count the days between the two dates: the start day itself is day 0. Add whole years (365 days, or 366 across 29 February) and then the rest.");
      const yearsP = numPart("years", "Whole years", "Whole years completed in the term", yrs, "A year is complete on each anniversary of the start date. Compare the month and day of the end date with those of the start date.");
      const wdP = choicePart("weekday", "Weekday", "On which weekday did the term end?", WEEKDAYS[wd], weekdayChoices(rng, wd), wdHint);
      let parts, K = 0, lapse = null, outlast = false;
      if (tier === "medium") parts = [daysP, wdP];
      else if (tier === "hard") parts = [daysP, yearsP, wdP];
      else {
        const dl = rng.int(30, 300) * (rng.next() < 0.5 ? 1 : -1);
        K = D + dl;
        if (K < 100) continue;
        lapse = daysToCivil(S + K);
        outlast = D > K;
        parts = [daysP, yearsP,
          dayPart("lapse", "Lapse date", "On what date does the charter lapse?", lapse, "Add the number of days to the start date, month by month; the start date is day 0."),
          yesNo("outlast", "Outlasted?", "Did the term last longer than the charter?", outlast, "Compare the length of the term in days with the charter's length.")];
      }
      const ex = [
        `**Days:** ${formatDMY(sc)} to ${formatDMY(ec)} is **${D}** days.`,
        tier === "medium" ? "" : `**Whole years:** the last anniversary of the start before the end is in ${sy + yrs}, so **${yrs}** years are complete.`,
        tier === "expert" ? `**Lapse date:** ${formatDMY(sc)} + ${K} days = **${formatDMY(lapse)}**.` : `**Weekday:** ${D} = ${Math.floor(D / 7)} × 7 + ${D % 7}, so the end is ${D % 7} day${D % 7 === 1 ? "" : "s"} on in the week from the start's ${WEEKDAYS[weekdayOfDays(S)]}: **${WEEKDAYS[wd]}**.`,
        tier === "expert" ? `**Outlasted:** the term was ${D} days against ${K}, so **${outlast ? "Yes" : "No"}**.` : "",
      ].filter(Boolean).join("\n\n");
      return finish(
        `A register records that the **${office}** served from **${formatDMY(sc)}** to **${formatDMY(ec)}**.${tier === "expert" ? "" : ` The start date was a **${WEEKDAYS[weekdayOfDays(S)]}**.`} ${GREG} Count days as the difference between the two dates (the start day is day 0). A whole year is completed on each anniversary of the start date.${tier === "expert" ? ` A charter signed on the start date stays valid for **${K} days** (the start date is day 0).` : ""}`,
        parts, ex, "hist-span", { tier, sy, sm, sd, ey: ec.y, em: ec.m, ed: ec.d, K },
        tier === "expert" ? [["_start_year", sy], ["_end_year", ec.y], ["_charter", K]] : [["_start_year", sy], ["_end_year", ec.y]],
        ["Use the day difference for the days part, then compare anniversaries for whole years.", "Weekdays repeat every 7 days, so the remainder after dividing by 7 is what matters."],
      );
    }
    // expert-plus: work back from the end date
    const ey = rng.int(1830, 1990), em = rng.int(1, 12), ed = rng.int(1, 28);
    const E = civilToDays(ey, em, ed);
    const D = rng.int(500, 3000);
    const S = E - D, sc = daysToCivil(S), ec = { y: ey, m: em, d: ed };
    if (sc.d > 28 || cmpMD(em, ed, sc.m, sc.d) === 0) continue;
    const yrs = wholeYears(sc, ec);
    const L = yrs + rng.pick([0, 1]);
    const within = civilToDays(sc.y + L, sc.m, sc.d) >= E;
    const wd = weekdayOfDays(S);
    const parts = [
      dayPart("start", "Start date", "On what date did the term start?", sc, "Count back from the end date by the stated number of days, year by year first and then the rest."),
      numPart("years", "Whole years", "Whole years completed in the term", yrs, "A year is complete on each anniversary of the start date you found."),
      choicePart("weekday", "Weekday", "On which weekday did the term start?", WEEKDAYS[wd], weekdayChoices(rng, wd), "Use the weekday of the end date and go back by the days in the term, using the remainder after dividing by 7."),
      yesNo("limit", "Within limit?", `Was the term within the legal limit of ${L} years?`, within, "The term is within the limit if it ends on or before the anniversary of the start date that is that many years later."),
    ];
    const ex = [
      `**Start date:** ${formatDMY(ec)} minus ${D} days = **${formatDMY(sc)}**.`,
      `**Whole years:** the last anniversary of ${formatDMY(sc)} on or before the end is in ${sc.y + yrs}, so **${yrs}** years.`,
      `**Weekday:** ${D} days is ${D % 7} days more than whole weeks, so the start was ${D % 7} day${D % 7 === 1 ? "" : "s"} back in the week from the end's ${WEEKDAYS[weekdayOfDays(E)]}: a **${WEEKDAYS[wd]}**.`,
      `**Limit:** ${L} years after the start is ${formatDMY({ y: sc.y + L, m: sc.m, d: sc.d })}; the term ended ${within ? "on or before" : "after"} that, so **${within ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A register records that the **${office}** left office on **${formatDMY(ec)}** after serving exactly **${D} days** (the first day counted as day 0). The end date was a **${WEEKDAYS[weekdayOfDays(E)]}**. ${GREG} The office's rules allow a term of at most **${L} years**: it must end on or before the ${ord(L)} anniversary of the start date. A whole year is completed on each anniversary of the start date.`,
      parts, ex, "hist-span-plus", { ey, em, ed, D, L }, [["_end_year", ey], ["_days", D], ["_limit", L]],
      ["Find the start date first; every other part uses it.", "Weekdays repeat every 7 days."],
    );
  }
  return tooMany();
}

// ---------- object-labels ----------

const OBJS = ["clay bowl", "bronze coin", "oil lamp", "stone seal", "silver brooch", "iron sword", "glass vase", "wax tablet", "bone comb", "marble statuette"];
const GALLERY_RULE = "Galleries by year made: **Ancient** before AD 500; **Medieval** AD 500 to AD 1499; **Modern** AD 1500 or later (every BC year is Ancient).";
const gal = (y) => (y < 500 ? "Ancient" : y < 1500 ? "Medieval" : "Modern");
const GALS = ["Ancient", "Medieval", "Modern"];
const YD = 2026;

function genObject(rng, tier) {
  const plus = tier === "expert-plus";
  // Spread the gallery answers (most random years would be Ancient): pick the target once, before the loop.
  const wantGal = tier === "expert" ? rng.pick(GALS) : null;
  // Expert+: 0 = in the Empires room, 1 = Ancient but outside it, 2 = Medieval, 3 = Modern.
  const wantRoom = plus ? rng.pick([0, 0, 1, 2, 2, 3, 3]) : null;
  for (let i = 0; i < TRY; i++) {
    const obj = rng.pick(OBJS);
    if (!plus) {
      const m = rng.next() < 0.5 ? -rng.int(5, 2400) : rng.int(20, 1950);
      if (wantGal && gal(m) !== wantGal) continue;
      const age = yearDistance(m, YD);
      const parts = [
        numPart("age", "Age", `How many years old is the ${obj} when the exhibition opens in ${YD}?`, age, m < 0 ? "Count from the year it was made to the opening year. It is made in BC, so the year-0 gap means you count one fewer than adding the two year numbers." : "Subtract the year it was made from the opening year."),
        choicePart("century", "Century", "Which century was it made in?", centLabel(cOf(m), eraOf(m)), centOptions(rng, m), HINT_CENT),
      ];
      let m2 = null, gap = 0, g1 = "", g2 = "";
      if (tier !== "medium") {
        const obj2 = OBJS.filter((o) => o !== obj)[rng.int(0, OBJS.length - 2)];
        m2 = shiftY(m, rng.int(8, 120) * 10);
        if (m2 > 1990) continue;
        gap = yearDistance(m, m2);
        parts.push(numPart("gap", "Years apart", `A second object, a ${obj2}, was made in ${yr(m2)}. How many years older is the ${obj} than the ${obj2}?`, gap, "Subtract the earlier year from the later one, with the year-0 correction if the two are on opposite sides of BC and AD."));
        if (tier === "expert") {
          g1 = gal(m); g2 = gal(m2);
          const x1 = rng.pick(GALS.filter((g) => g !== g1)), x2 = rng.pick(GALS.filter((g) => g !== g2));
          parts.push(segPart(rng, "gallery", "Galleries", `Which gallery does each object go in (first object, then second)?`, ["First object", "Second object"], [g1, x1], [g2, x2], [g1, g2],
            "Compare each year made with the gallery boundaries in the rule. BC years are always before AD 500."));
        }
      }
      const c = cOf(m);
      const ex = [
        `**Age:** ${yr(m)} to ${YD} is **${age}** years${m < 0 ? " (one fewer than adding the numbers, as there is no year 0)" : ""}.`,
        `**Century:** ${yr(m)} is in the **${centLabel(c, eraOf(m))}**.`,
        m2 !== null ? `**Years apart:** ${yr(m)} to ${yr(m2)} is **${gap}** years.` : "",
        tier === "expert" ? `**Galleries:** ${yr(m)} goes in the ${g1} gallery and ${yr(m2)} in the ${g2} gallery.` : "",
      ].filter(Boolean).join("\n\n");
      return finish(
        `A museum label says a **${obj}** was made in **${yr(m)}**. The exhibition opens in **${YD}**.${m < 0 || (m2 !== null && m2 < 0) ? ` ${NO_ZERO}` : ""}${tier === "expert" ? ` ${GALLERY_RULE}` : ""}`,
        parts, ex, "hist-obj", { tier, m, m2: m2 ?? 0 }, [gv("_made", m), ["_open", YD]].concat(m2 !== null ? [gv("_second", m2)] : []),
        ["Find the age first, then the century; the later parts reuse the years in the prompt.", "A year is in century n if it lies between 100(n-1)+1 and 100n."],
      );
    }
    // expert-plus: the label dates the object relative to an event
    const m = wantRoom === 0 ? rng.int(-200, 300)
      : wantRoom === 1 ? (rng.next() < 0.5 ? -rng.int(201, 2400) : rng.int(301, 499))
        : wantRoom === 2 ? rng.int(500, 1499) : rng.int(1500, 1950);
    if (m === 0) continue;
    const cands = EV.filter((e) => e[1] > m + 10);
    if (!cands.length) continue;
    const E = rng.pick(cands);
    const N = yearDistance(m, E[1]);
    if (N < 10 || N > 3000 || shiftY(E[1], -N) !== m) continue;
    const age = yearDistance(m, YD);
    const fits = m >= -200 && m <= 300;
    const parts = [
      yearPart("made", "Year made", `In which year was the ${obj} made?`, m, `Go back ${N} years from the event's year.${E[1] > 0 ? " If you cross from AD into BC, skip the missing year 0." : ""}`),
      numPart("age", "Age", `How many years old is it when the exhibition opens in ${YD}?`, age, "Count from your year made to the opening year, with the year-0 correction if it is BC."),
      choicePart("century", "Century", "Which century was it made in?", centLabel(cOf(m), eraOf(m)), centOptions(rng, m), HINT_CENT),
      segPart(rng, "room", "Gallery and room", "Which gallery holds it, and does it fit the Empires room?", ["Gallery", "Empires room"], GALS, ["Fits", "Does not fit"], [gal(m), fits ? "Fits" : "Does not fit"],
        "Use the year you found. The Empires room has its own year range, which is separate from the gallery boundaries."),
    ];
    const ex = [
      `**Year made:** ${yr(E[1])} minus ${N} years = **${yr(m)}**${E[1] > 0 && m < 0 ? " (skipping the missing year 0)" : ""}.`,
      `**Age:** ${yr(m)} to ${YD} is **${age}** years.`,
      `**Century:** the **${centLabel(cOf(m), eraOf(m))}**.`,
      `**Gallery and room:** ${yr(m)} belongs in the ${gal(m)} gallery, and it ${fits ? "lies" : "does not lie"} between 200 BC and AD 300, so **${gal(m)} | ${fits ? "Fits" : "Does not fit"}**.`,
    ].join("\n\n");
    return finish(
      `The label of a **${obj}** says it was made **${N} years before ${evText(E)}**. The exhibition opens in **${YD}**. ${NO_ZERO} ${GALLERY_RULE} The **Empires room** shows objects made between 200 BC and AD 300, inclusive.`,
      parts, ex, "hist-obj-plus", { E: E[1], N, m }, [gv("_event", E[1]), ["_before", N], ["_open", YD]],
      ["The year made comes first; age, century, gallery and room all use it.", "BC years count down, and there is no year 0."],
    );
  }
  return tooMany();
}

// ---------- exhibit-timeline ----------

const SCALES = [10, 20, 25, 50, 100];
const LET = ["A", "B", "C", "D"];
const byYear = (a, b) => a - b; // signed order puts 490 BC (-490) before 44 BC (-44)

function genTimeline(rng, tier) {
  const plus = tier === "expert-plus";
  for (let i = 0; i < TRY; i++) {
    if (!plus) {
      const pool = rng.next() < 0.35 ? EV.slice(0, 12) : EV;
      const four = rng.shuffle(pool).slice(0, 4);
      if (four.length < 4) continue;
      const evs = four.map((e, k) => ({ L: LET[k], n: e[0], y: e[1] }));
      const sorted = evs.slice().sort((a, b) => byYear(a.y, b.y));
      const earliest = sorted[0], latest = sorted[3];
      const order = sorted.map((e) => e.L);
      const span = yearDistance(earliest.y, latest.y);
      // distractor orders
      const fmt = (a) => a.join(", ");
      const swaps = [];
      for (let k = 0; k < 3; k++) { const o = order.slice(); [o[k], o[k + 1]] = [o[k + 1], o[k]]; swaps.push(o); }
      const naive = evs.slice().sort((a, b) => Math.abs(a.y) - Math.abs(b.y)).map((e) => e.L);
      const cands = [order.slice().reverse(), naive, ...rng.shuffle(swaps)];
      const seen = new Set([fmt(order)]); const wrong = [];
      for (const o of cands) { if (!seen.has(fmt(o))) { seen.add(fmt(o)); wrong.push(fmt(o)); } if (wrong.length === 3) break; }
      if (wrong.length < 3) continue;
      const choices = rng.shuffle([fmt(order), ...wrong]);
      const bc = evs.some((e) => e.y < 0);
      const parts = [
        choicePart("order", "Order", "Which order puts the events from earliest to latest?", fmt(order), choices, "Put the years on one line. BC years count down, so a bigger BC number is the earlier year, and every BC year is earlier than every AD year."),
        numPart("span", "Span", "Years from the earliest event to the latest event", span, bc && earliest.y < 0 && latest.y > 0 ? "Subtract the years, and remember there is no year 0 between 1 BC and AD 1." : "Subtract the earlier year from the later year."),
      ];
      let S = 0, X = null, cm = 0, W = 0, fit = false, total = 0;
      if (tier !== "medium") {
        const sc = rng.shuffle(SCALES);
        X = rng.pick(sorted.slice(1));
        const dx = yearDistance(earliest.y, X.y);
        S = sc.find((s) => dx / s >= 2 && dx / s <= 120 && span / s <= 150);
        if (!S) continue;
        cm = roundTo(dx / S, 2);
        parts.push(numPart("cm", "Wall distance", `A wall timeline uses a scale of 1 cm for every ${S} years. How far along the wall is event ${X.L} from the earliest event? Give the answer in cm, to 2 decimal places`, cm, "Distance in years divided by the number of years each centimetre stands for.", 2));
        if (tier === "expert") {
          total = span / S;
          W = Math.ceil(total) + rng.pick([-6, -4, -3, -2, -1, 1, 2, 3, 5]);
          if (W < 3) continue;
          fit = total <= W;
          parts.push(yesNo("fits", "Fits the panel?", `The whole timeline, from the earliest to the latest event, must fit a panel **${W} cm** wide. Does it fit?`, fit, "Total length is the span in years divided by the years per centimetre. Compare it with the panel width."));
        }
      }
      const ex = [
        `**Order:** sorted by year, the events run **${fmt(order)}** (${sorted.map((e) => yr(e.y)).join(", ")}).`,
        `**Span:** ${yr(earliest.y)} to ${yr(latest.y)} is **${span}** years.`,
        X ? `**Wall distance:** ${yearDistance(earliest.y, X.y)} ÷ ${S} = **${cm.toFixed(2)}** cm.` : "",
        tier === "expert" ? `**Fits:** the timeline is ${span} ÷ ${S} = ${roundTo(total, 2).toFixed(2)} cm long, which ${fit ? "fits" : "does not fit"} in ${W} cm, so **${fit ? "Yes" : "No"}**.` : "",
      ].filter(Boolean).join("\n\n");
      return finish(
        `A museum plans a wall timeline of four events:\n\n${evs.map((e) => `- **${e.L}**: ${cap(e.n)} (${yr(e.y)})`).join("\n")}\n\n${bc ? NO_ZERO : "Years are shown as plain AD years."}`,
        parts, ex, "hist-tl", { tier, evs, S, X: X ? X.L : "", W },
        evs.map((e) => gv(`_${e.L.toLowerCase()}`, e.y)).concat(S ? [["_scale", S]] : []),
        ["Order the years first; the span and the distances both come from the same differences.", "For the wall distance, divide a distance in years by the years per centimetre."],
      );
    }
    // expert-plus: scale and marker year, working backwards from positions on the wall
    const s = rng.pick([10, 20, 40, 50, 100]);
    const x1 = rng.int(4, 16) / 2;
    const x2 = x1 + rng.int(6, 40) / 2;
    const x3 = x1 + rng.int(-6, 40) / 2;
    if (x3 < 0.5 || x3 === x1 || x3 === x2) continue;
    const y1 = rng.next() < 0.5 ? -rng.int(200, 1800) : rng.int(100, 1100);
    const y2 = shiftY(y1, (x2 - x1) * s);
    const y3 = shiftY(y1, (x3 - x1) * s);
    if (y2 > 1990 || y3 > 1990) continue;
    const yT = shiftY(y3, rng.int(6, 60) * 10 * (rng.next() < 0.5 ? 1 : -1));
    if (yT > 1990) continue;
    const dists = [["Object P", y1], ["Object Q", y2], ["Object T", yT]].map(([n, y]) => ({ n, d: yearDistance(y3, y) }));
    const srt = dists.slice().sort((a, b) => a.d - b.d);
    if (srt[1].d - srt[0].d < 20) continue;
    const closest = srt[0].n;
    const bc = [y1, y2, y3, yT].some((y) => y < 0);
    const parts = [
      numPart("scale", "Scale", "How many years does 1 cm on the wall stand for?", s, "Years between the two dated objects divided by the centimetres between them on the wall."),
      yearPart("marker", "Marker year", "Which year does the marker card stand at?", y3, "Use your scale to turn the marker's distance from object P into years, and move forward or back from P's year. If the marker is left of P, go back."),
      choicePart("century", "Century", "Which century is the marker's year in?", centLabel(cOf(y3), eraOf(y3)), centOptions(rng, y3), HINT_CENT),
      choicePart("closest", "Closest object", "Which of the three objects was made closest in time to the marker's year?", closest, rng.shuffle(["Object P", "Object Q", "Object T"]), "Find how many years apart the marker's year is from each object, and pick the smallest gap."),
    ];
    const ex = [
      `**Scale:** from ${yr(y1)} to ${yr(y2)} is ${yearDistance(y1, y2)} years over ${x2 - x1} cm, so **${s}** years per cm.`,
      `**Marker year:** the marker is ${Math.abs(x3 - x1)} cm ${x3 > x1 ? "right" : "left"} of P, which is ${Math.abs(x3 - x1) * s} years ${x3 > x1 ? "after" : "before"} ${yr(y1)}: **${yr(y3)}**.`,
      `**Century:** the **${centLabel(cOf(y3), eraOf(y3))}**.`,
      `**Closest:** the gaps are ${dists.map((d) => `${d.n.slice(-1)} ${d.d}`).join(", ")} years, so **${closest}**.`,
    ].join("\n\n");
    return finish(
      `A wall timeline is drawn to one steady scale, measured from the left edge. **Object P** (made ${yr(y1)}) sits at **${x1} cm** and **Object Q** (made ${yr(y2)}) at **${x2} cm**. A marker card sits at **${x3} cm**. **Object T** was made in **${yr(yT)}** and is not on the wall. ${bc ? NO_ZERO : ""}`.trim(),
      parts, ex, "hist-tl-plus", { y1, y2, yT, x1, x2, x3 }, [gv("_p", y1), gv("_q", y2), ["_x1", x1], ["_x2", x2], ["_x3", x3]],
      ["Find the scale from the two dated objects first.", "Years apart are the distance in cm times the scale."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "dating-sources") return genDating(rng, difficulty);
  if (subtopic === "calendar-spans") return genSpans(rng, difficulty);
  if (subtopic === "object-labels") return genObject(rng, difficulty);
  if (subtopic === "exhibit-timeline") return genTimeline(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Years are re-derived on the astronomical scale (1 BC = 0), dates with the platform Date in UTC,
// and each part is compared by value (numbers within tolerance, years and dates parsed from text,
// choices matched exactly).

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (a, id) => (a && typeof a === "object" ? num(a[id]) : NaN);
const partStr = (a, id) => {
  const v = a && typeof a === "object" ? a[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (c, t, tol) => Number.isFinite(c) && Math.abs(c - t) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");
const A0 = (y) => (y < 0 ? y + 1 : y); // historical -> astronomical
const F0 = (a) => (a <= 0 ? a - 1 : a); // astronomical -> historical
const span = (a, b) => Math.abs(A0(a) - A0(b));
const move = (y, n) => F0(A0(y) + n);
const centOf = (y) => (y < 0 ? Math.floor((-y - 1) / 100) + 1 : Math.floor((y - 1) / 100) + 1);
const parseY = (s) => {
  const t = String(s).trim().toLowerCase().replace(/−/g, "-").replace(/\./g, "");
  let m = /^(\d{1,4})\s*(?:bc|bce)$/.exec(t);
  if (m) return -Number(m[1]);
  m = /^-(\d{1,4})$/.exec(t);
  if (m) return -Number(m[1]);
  m = /^(?:ad|ce)\s*(\d{1,4})$/.exec(t) || /^(\d{1,4})\s*(?:ad|ce)?$/.exec(t);
  return m && Number(m[1]) > 0 ? Number(m[1]) : NaN;
};
const MN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayKey = (s) => String(s).toLowerCase().replace(/,/g, " ").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ").trim();
const utc = (y, m, d, k = 0) => new Date(Date.UTC(y, m - 1, d + k));
const keyOf = (t) => `${t.getUTCDate()} ${MN[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
const daysBetween = (t0, t1) => Math.round((t1 - t0) / 86400000);
const completed = (s, e) => { let k = 0; while (Date.UTC(s.getUTCFullYear() + k + 1, s.getUTCMonth(), s.getUTCDate()) <= e.getTime()) k++; return k; };
const evLabel = (n, y) => `${cap(n)} (${yr(y)})`;

const ALT = {
  "hist-dating": (p) => {
    const t = { earliest: Math.max(A0(p.A), A0(p.B)) };
    t.earliest = F0(t.earliest);
    t.range = span(t.earliest, p.C);
    if (p.opts) { const x = p.opts.find((o) => A0(o.y) > A0(p.C)); t.toolate = x ? evLabel(x.n, x.y) : undefined; }
    const c = centOf(t.earliest);
    t.century = `${ord(c)} | ${t.earliest < 0 ? "BC" : "AD"}`;
    return t;
  },
  "hist-dating-plus": (p) => {
    const W = move(p.A, p.N), c = centOf(W);
    return {
      written: W, apart: span(W, p.C),
      verdict: `${A0(p.B) < A0(W) ? "Fits" : "Impossible"} | ${A0(p.C) >= A0(W) ? "Fits" : "Impossible"}`,
      century: `${ord(c)} century ${W < 0 ? "BC" : "AD"}`,
    };
  },
  "hist-span": (p) => {
    const s = utc(p.sy, p.sm, p.sd), e = utc(p.ey, p.em, p.ed);
    const t = { days: daysBetween(s, e), years: completed(s, e), weekday: WD[e.getUTCDay()] };
    if (p.tier === "expert") { t.lapse = keyOf(utc(p.sy, p.sm, p.sd, p.K)); t.outlast = YN(t.days > p.K); }
    return t;
  },
  "hist-span-plus": (p) => {
    const e = utc(p.ey, p.em, p.ed), s = utc(p.ey, p.em, p.ed, -p.D);
    const ann = Date.UTC(s.getUTCFullYear() + p.L, s.getUTCMonth(), s.getUTCDate());
    return { start: keyOf(s), years: completed(s, e), weekday: WD[s.getUTCDay()], limit: YN(e.getTime() <= ann) };
  },
  "hist-obj": (p) => {
    const c = centOf(p.m);
    const g = (y) => (A0(y) < 500 ? "Ancient" : A0(y) < 1500 ? "Medieval" : "Modern");
    const t = { age: span(p.m, YD), century: `${ord(c)} century ${p.m < 0 ? "BC" : "AD"}` };
    if (p.m2) { t.gap = span(p.m, p.m2); t.gallery = `${g(p.m)} | ${g(p.m2)}`; }
    return t;
  },
  "hist-obj-plus": (p) => {
    const m = move(p.E, -p.N), c = centOf(m);
    const g = A0(m) < 500 ? "Ancient" : A0(m) < 1500 ? "Medieval" : "Modern";
    return { made: m, age: span(m, YD), century: `${ord(c)} century ${m < 0 ? "BC" : "AD"}`, room: `${g} | ${A0(m) >= -199 && A0(m) <= 300 ? "Fits" : "Does not fit"}` };
  },
  "hist-tl": (p) => {
    const sorted = p.evs.slice().sort((a, b) => A0(a.y) - A0(b.y));
    const t = { order: sorted.map((e) => e.L).join(", "), span: span(sorted[0].y, sorted[3].y) };
    if (p.S) {
      const X = p.evs.find((e) => e.L === p.X);
      t.cm = span(sorted[0].y, X.y) / p.S;
      if (p.tier === "expert") t.fits = YN(t.span / p.S <= p.W);
    }
    return t;
  },
  "hist-tl-plus": (p) => {
    const s = span(p.y1, p.y2) / (p.x2 - p.x1);
    const y3 = move(p.y1, Math.round((p.x3 - p.x1) * s));
    const gaps = [["Object P", p.y1], ["Object Q", p.y2], ["Object T", p.yT]].map(([n, y]) => [span(y3, y), n]).sort((a, b) => a[0] - b[0]);
    const c = centOf(y3);
    return { scale: s, marker: y3, century: `${ord(c)} century ${y3 < 0 ? "BC" : "AD"}`, closest: gaps[0][1] };
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
    if (tv === undefined) return false;
    if (part.answerType === "number") {
      if (!near(partNum(answer, part.id), tv, part.tolerance || 0)) return false;
    } else if (part.answerType === "date") {
      if (part.precision === "year") { if (parseY(partStr(answer, part.id)) !== tv) return false; }
      else if (dayKey(partStr(answer, part.id)) !== dayKey(tv)) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
