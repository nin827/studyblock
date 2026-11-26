// Time and dates generator: clock time, calendar dates and time zones.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code), so editing them never changes a question.
//
// Conventions (stated in prompts): 24-hour answers are typed hh:mm; 12-hour answers as "3:45 pm".
// Dates are real Gregorian dates (leap years honoured). Time zones use the fixed standard UTC
// offsets given in the question, with no daylight saving.
// generate() works in minutes / day numbers; verify() re-derives answers another way (Date.UTC
// for calendars, stepping back from the candidate answer for clocks).

import {
  MONTHS, WEEKDAYS, isLeapYear, daysInMonth, civilToDays, daysToCivil, weekdayOfDays, formatDMY,
} from "../../js/lib/dates.js";

const pad = (n) => String(n).padStart(2, "0");
const mod = (a, n) => ((a % n) + n) % n;

// ---- clock formatting ----
function t24(min) {
  const m = mod(min, 1440);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function t12(min) {
  const m = mod(min, 1440);
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m % 60)} ${h < 12 ? "am" : "pm"}`;
}
// Other spellings of the same 24-hour time (unpadded hour, 1435, 14.35).
function acc24(min) {
  const s = t24(min);
  const [H, M] = s.split(":");
  const out = new Set([`${+H}:${M}`, `${H}${M}`, `${H}.${M}`, `${+H}.${M}`]);
  out.delete(s);
  return [...out];
}
// Other spellings of the same 12-hour time (3:45pm, 3:45 p.m., 03:45 pm, 3.45 pm).
function acc12(min) {
  const s = t12(min);
  const [hm, ap] = s.split(" ");
  const [h, mm] = hm.split(":");
  const pm = `${ap[0]}.m.`;
  const out = new Set([`${h}:${mm}${ap}`, `${h}:${mm} ${pm}`, `${h}:${mm}${pm}`, `${h}.${mm} ${ap}`, `${h}.${mm}${ap}`,
    `${pad(+h)}:${mm} ${ap}`, `${pad(+h)}:${mm}${ap}`]);
  out.delete(s);
  return [...out];
}
// "2 h 35 min", "45 min", "3 h"
function dur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Independent clock reader for verify: "14:35", "1435", "14.35", "2:35 pm", "2:35pm" -> minutes or NaN.
function readClock(s) {
  const t = String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  let m = t.match(/^(\d{1,2})[:.]?(\d{2}) ?(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return NaN;
  let h = +m[1];
  const mm = +m[2];
  if (mm > 59) return NaN;
  if (m[3]) {
    if (h < 1 || h > 12) return NaN;
    h = (h % 12) + (m[3][0] === "p" ? 12 : 0);
  } else if (h > 23) return NaN;
  return h * 60 + mm;
}
const is24 = (s) => /^\d{2}:\d{2}$/.test(String(s));
const is12 = (s) => /^\d{1,2}:\d{2} (am|pm)$/.test(String(s));

// ---- calendar (generation side: integer day numbers, day 0 = 1 January 1970; js/lib/dates.js) ----
const dayName = (z) => WEEKDAYS[weekdayOfDays(z)];
const fmtD = formatDMY;
const fmtZ = (z) => fmtD(daysToCivil(z));
const fmtZW = (z) => `${dayName(z)} ${fmtZ(z)}`;
function randDate(rng, y0, y1) {
  const y = rng.int(y0, y1);
  const m = rng.int(1, 12);
  return civilToDays(y, m, rng.int(1, daysInMonth(y, m)));
}

// ---- calendar (verify side: the platform's Date in UTC, a different method) ----
const DAY_MS = 86400000;
function readDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mi < 0) return null;
  const ms = Date.UTC(+m[3], mi, +m[1]);
  const back = new Date(ms);
  if (back.getUTCDate() !== +m[1] || back.getUTCMonth() !== mi) return null; // 31 April etc.
  return ms;
}
const utcOf = (z) => {
  const { y, m, d } = daysToCivil(z);
  return Date.UTC(y, m - 1, d);
};
const utcAdd = (ms, n) => ms + n * DAY_MS;
const utcDiff = (a, b) => Math.round((b - a) / DAY_MS);
const utcDay = (ms) => WEEKDAYS[new Date(ms).getUTCDay()];

// ---- shared question helpers ----
function shuffleChoices(answer, others, rng) {
  return rng.shuffle([answer, ...others.filter((x, i, a) => x !== answer && a.indexOf(x) === i)]);
}
const TIME24 = " Give the time in 24-hour format (hh:mm).";
const TIME12 = " Give the time in 12-hour format with am or pm (for example 4:05 pm).";
const EXACT = { fuzzyNumber: 0 }; // counts of minutes/days are exact

function textTime(min, twelve) {
  return twelve ? { answer: t12(min), accepts: acc12(min) } : { answer: t24(min), accepts: acc24(min) };
}

// =====================================================================
// Clock time
// =====================================================================
const CONTEXTS_ADD = [
  ["A train leaves at", "and the journey takes", "What time does it arrive?"],
  ["A film starts at", "and lasts", "What time does it end?"],
  ["A cake goes into the oven at", "and bakes for", "What time is it ready?"],
  ["A hike starts at", "and takes", "What time does it finish?"],
  ["A meeting starts at", "and runs for", "What time does it end?"],
];
const CONTEXTS_SUB = [
  ["A film ends at", "It lasted", "What time did it start?"],
  ["A bus arrives at", "The journey took", "What time did it leave?"],
  ["A match finished at", "It lasted", "What time did it start?"],
  ["A bread dough was ready at", "It had been rising for", "What time was it put to rise?"],
];

function genClock(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["to24", "to12", "add", "elapsed"]);
    if (kind === "to24") {
      const h12 = rng.int(1, 11);
      const mm = 5 * rng.int(0, 11);
      const pm = rng.next() < 0.5;
      const t = ((h12 % 12) + (pm ? 12 : 0)) * 60 + mm;
      return {
        prompt: `Write **${t12(t)}** in 24-hour time.${TIME24}`,
        answerType: "text", ...textTime(t, false),
        explanation: pm ? `Afternoon and evening times add 12 to the hour: ${h12} + 12 = ${h12 + 12}, so ${t12(t)} is **${t24(t)}**.`
          : `Morning times keep their hour; write it with two digits: ${t12(t)} is **${t24(t)}**.`,
        hints: [pm ? "It's pm, so the hour is after midday: add 12 to it." : "It's am, so the hour stays the same.", "Write the hour with two digits and keep the minutes."],
        params: { kind, t, out: "24" },
      };
    }
    if (kind === "to12") {
      const h = rng.pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
      const t = h * 60 + 5 * rng.int(0, 11);
      return {
        prompt: `Write **${t24(t)}** in 12-hour time.${TIME12}`,
        answerType: "text", ...textTime(t, true),
        explanation: h > 12 ? `Hours after 12 take away 12 and are pm: ${h} − 12 = ${h - 12}, so ${t24(t)} is **${t12(t)}**.`
          : `Hours before 12 stay the same and are am: ${t24(t)} is **${t12(t)}**.`,
        hints: [h > 12 ? "The hour is bigger than 12, so it's afternoon or evening: take 12 away." : "The hour is smaller than 12, so it's morning.", "Drop the leading zero and add am or pm."],
        params: { kind, t, out: "12" },
      };
    }
    if (kind === "add") {
      const start = 5 * rng.int(72, 180);
      const d = 60 * rng.int(1, 4) + 5 * rng.int(0, 11);
      const [a, b, c] = rng.pick(CONTEXTS_ADD);
      return {
        prompt: `${a} **${t24(start)}** ${b} **${dur(d)}**. ${c}${TIME24}`,
        answerType: "text", ...textTime(start + d, false),
        explanation: `Add the hours, then the minutes: ${t24(start)} + ${dur(d)} = **${t24(start + d)}**.`,
        hints: [`Add the ${plural(Math.floor(d / 60), "hour")} to the hour of ${t24(start)} first${d % 60 ? "" : "; the minutes stay the same"}.`,
          d % 60 ? `Now add ${d % 60} minutes; if the minutes pass 60, carry 1 hour.` : "Write the hour with two digits."],
        params: { kind, start, d, out: "24" },
      };
    }
    // elapsed
    const start = 5 * rng.int(84, 192);
    const d = 5 * rng.int(4, 48);
    const end = start + d;
    return {
      prompt: `A lesson runs from **${t24(start)}** to **${t24(end)}**. How many minutes long is it?`,
      answerType: "number", answer: d, tolerance: 0, ...EXACT,
      explanation: `Count up from ${t24(start)} to ${t24(end)}: that is ${dur(d)} = **${d} minutes**.`,
      hints: [`Count up to the next whole hour first, then on to ${t24(end)}.`, "Turn hours into minutes (1 h = 60 min) and add."],
      params: { kind, start, end },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["to24", "to12", "add", "sub", "order"]);
    if (kind === "to24" || kind === "to12") {
      const edge = rng.next() < 0.35;
      const h = edge ? rng.pick([0, 12]) : rng.int(1, 23);
      const t = h * 60 + rng.int(0, 59);
      const toTwelve = kind === "to12";
      const hint12 = h === 0 ? "The hour 00 is just after midnight, which is 12 am." : h === 12 ? "The hour 12 is just after midday, which is 12 pm." : h > 12 ? "Take 12 away from the hour; it's pm." : "The hour stays; it's am.";
      const hint24 = h === 0 ? "12 am is just after midnight, so the hour becomes 00." : h === 12 ? "12 pm is just after midday, so the hour stays 12." : h > 12 ? "It's pm, so add 12 to the hour." : "It's am, so the hour stays (with two digits).";
      return {
        prompt: toTwelve ? `Write **${t24(t)}** in 12-hour time.${TIME12}` : `Write **${t12(t)}** in 24-hour time.${TIME24}`,
        answerType: "text", ...textTime(t, toTwelve),
        explanation: `${toTwelve ? hint12 : hint24} So ${toTwelve ? t24(t) : t12(t)} is **${toTwelve ? t12(t) : t24(t)}**.`,
        hints: [toTwelve ? hint12 : hint24, "Keep the minutes exactly as they are."],
        params: { kind, t, out: toTwelve ? "12" : "24" },
      };
    }
    if (kind === "add") {
      const start = rng.int(360, 900);
      const d = rng.int(65, 250);
      const [a, b, c] = rng.pick(CONTEXTS_ADD);
      return {
        prompt: `${a} **${t24(start)}** ${b} **${d} minutes**. ${c}${TIME24}`,
        answerType: "text", ...textTime(start + d, false),
        explanation: `${d} minutes is ${dur(d)}. ${t24(start)} + ${dur(d)} = **${t24(start + d)}**.`,
        hints: [`Turn ${d} minutes into hours and minutes: ${d} = 60 × ${Math.floor(d / 60)} + ${d % 60}.`, `Add the hours to ${t24(start)}, then the minutes, carrying an hour if the minutes pass 60.`],
        params: { kind, start, d, out: "24" },
      };
    }
    if (kind === "sub") {
      const end = rng.int(600, 1380);
      const d = 60 * rng.int(1, 3) + rng.int(1, 59);
      const [a, b, c] = rng.pick(CONTEXTS_SUB);
      return {
        prompt: `${a} **${t24(end)}**. ${b} **${dur(d)}**. ${c}${TIME24}`,
        answerType: "text", ...textTime(end - d, false),
        explanation: `Count back: ${t24(end)} − ${dur(d)} = **${t24(end - d)}**.`,
        hints: [`Go back ${plural(Math.floor(d / 60), "hour")} first: ${t24(end)} → ${t24(end - 60 * Math.floor(d / 60))}.`, `Then go back ${d % 60} minutes, borrowing an hour if needed.`],
        params: { kind, end, d, out: "24" },
      };
    }
    // order: four times, mixed formats, earliest first (tiles A-D)
    let ts;
    do {
      ts = [0, 1, 2, 3].map(() => rng.int(0, 287) * 5);
    } while (ts.some((a, i) => ts.some((b, j) => i < j && Math.abs(a - b) < 20)));
    const fmts = rng.shuffle(["12", "12", "24", "24"]);
    const shown = ts.map((t, i) => (fmts[i] === "12" ? t12(t) : t24(t)));
    const letters = ["A", "B", "C", "D"];
    const order = [0, 1, 2, 3].sort((i, j) => ts[i] - ts[j]);
    const answer = order.map((i) => letters[i]).join(", ");
    return {
      prompt: `Put these times of one day in order, **earliest first**:\n\n${shown.map((s, i) => `- **${letters[i]}:** ${s}`).join("\n")}`,
      answerType: "tiles",
      tiles: letters.map((l, i) => ({ value: l, label: `${l}: ${shown[i]}` })),
      joiner: ", ",
      useAll: true,
      answer,
      explanation: `In 24-hour time: ${order.map((i) => `${letters[i]} = ${t24(ts[i])}`).join(", ")}. So the order is **${answer}**.`,
      hints: ["Rewrite every time in 24-hour form first (pm hours add 12; 12 am is 00).", "Then compare the hours, and the minutes when the hours match."],
      params: { kind, ts, shown },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["overnight", "night-add", "chores"]);
    if (kind === "overnight") {
      const start = rng.int(1260, 1439);
      const end = rng.int(240, 539);
      const d = end + 1440 - start;
      const who = rng.pick(["A night train leaves", "A night shift starts", "A sleepover film marathon starts", "An overnight flight takes off"]);
      return {
        prompt: `${who} at **${t24(start)}** and ends at **${t24(end)}** the next morning. How long is that?`,
        answerType: "multi",
        parts: [
          { id: "h", label: "h", ask: "Whole hours", answerType: "number", answer: Math.floor(d / 60), tolerance: 0, ...EXACT, hint: `Count from ${t24(start)} up to midnight (24:00) first.` },
          { id: "min", label: "min", ask: "Remaining minutes (0–59)", answerType: "number", answer: d % 60, tolerance: 0, ...EXACT, hint: `Then add the time from midnight to ${t24(end)}, and carry 60 minutes into an hour.` },
        ],
        explanation: `${t24(start)} to midnight is ${dur(1440 - start)}; midnight to ${t24(end)} is ${dur(end)}. Total: **${dur(d)}**.`,
        params: { kind, start, end },
      };
    }
    if (kind === "night-add") {
      const start = rng.int(1200, 1430);
      const d = 60 * rng.int(4, 10) + rng.int(1, 59);
      const who = rng.pick(["A night shift starts", "A coach trip leaves", "A bread machine starts", "A charity walk starts"]);
      return {
        prompt: `${who} at **${t24(start)}** and lasts **${dur(d)}**. What time does it finish (the next day)?${TIME24}`,
        answerType: "text", ...textTime(start + d, false),
        explanation: `${t24(start)} + ${dur(d)} goes past midnight: ${t24(start)} to 24:00 is ${dur(1440 - start)}, leaving ${dur(d - (1440 - start))} after midnight, so it finishes at **${t24(start + d)}**.`,
        hints: [`Use up the time to midnight first: ${t24(start)} → 24:00 takes ${dur(1440 - start)}.`, `Subtract that from ${dur(d)}; what is left is the time after midnight (00:00).`],
        params: { kind, start, d, out: "24" },
      };
    }
    // chores: start + three durations, answer in 12-hour time
    const start = rng.int(480, 900);
    const ds = [rng.int(12, 75), rng.int(12, 75), rng.int(12, 75)];
    const total = ds[0] + ds[1] + ds[2];
    const jobs = rng.shuffle(["laundry", "cooking", "homework", "shopping", "cleaning", "gardening", "a phone call"]).slice(0, 3);
    return {
      prompt: `Starting at **${t12(start)}**, Sam does ${jobs[0]} (${ds[0]} min), ${jobs[1]} (${ds[1]} min) and ${jobs[2]} (${ds[2]} min), one after another with no breaks. What time does Sam finish?${TIME12}`,
      answerType: "text", ...textTime(start + total, true),
      given: [{ label: "_a", value: ds[0] }, { label: "_b", value: ds[1] }, { label: "_c", value: ds[2] }],
      explanation: `Total time: \`_a + _b + _c\` = ${ds[0]} + ${ds[1]} + ${ds[2]} = ${total} min = ${dur(total)}. ${t12(start)} + ${dur(total)} = **${t12(start + total)}**.`,
      hints: [`Add the three durations: \`_a + _b + _c\`, then turn the minutes into hours and minutes.`, `Add that to ${t12(start)}; passing 12 o'clock switches am to pm.`],
      params: { kind, start, ds, out: "12" },
    };
  }

  // expert
  const kind = rng.pick(["backwards", "shifts"]);
  if (kind === "backwards") {
    const arrive = rng.int(400, 600);
    const ready = 5 * rng.int(5, 12);
    const walk = rng.int(4, 18);
    const ride = rng.int(15, 70);
    const buffer = rng.pick([5, 10, 15]);
    const total = ready + walk + ride + buffer;
    const mode = rng.pick(["bus", "train", "tram"]);
    return {
      prompt: `Alex must arrive at work by **${t24(arrive)}**. Getting ready takes **${ready} min**, the walk to the stop **${walk} min**, the ${mode} ride **${ride} min**, and Alex wants **${buffer} min** spare in case the ${mode} is late. What is the latest time Alex can get up?${TIME24}`,
      answerType: "text", ...textTime(arrive - total, false),
      given: [{ label: "_ready", value: ready }, { label: "_walk", value: walk }, { label: "_ride", value: ride }, { label: "_spare", value: buffer }],
      explanation: `Work backwards from ${t24(arrive)}. Total time needed: \`_ready + _walk + _ride + _spare\` = ${ready} + ${walk} + ${ride} + ${buffer} = ${total} min = ${dur(total)}. ${t24(arrive)} − ${dur(total)} = **${t24(arrive - total)}**.`,
      hints: ["Work backwards: add up every step (and the spare time) first.", `Turn the total into hours and minutes, then count back from ${t24(arrive)}.`],
      params: { kind, arrive, steps: [ready, walk, ride, buffer], out: "24" },
    };
  }
  // shifts: n shifts start-end with an unpaid break; total paid time and pay
  let n, s, e, brk, rateC, minutes, payC;
  do {
    n = rng.int(3, 5);
    s = 15 * rng.int(26, 44); // 06:30-11:00
    e = s + 15 * rng.int(26, 40); // 6.5-10 h later
    brk = rng.pick([20, 30, 45, 60]);
    rateC = 5 * rng.int(260, 500); // $13.00-$25.00 in 5-cent steps
    minutes = n * (e - s - brk);
    payC = (minutes * rateC) / 60;
  } while (Math.abs(payC - Math.floor(payC) - 0.5) < 1e-9); // no half-cent ties
  const pay = Math.round(payC) / 100;
  const rate = rateC / 100;
  return {
    prompt: `Jo works **${n} shifts** this week, each from **${t24(s)}** to **${t24(e)}**, with an unpaid break of **${brk} min** in each shift. Jo is paid **$${rate.toFixed(2)}** per hour for paid time.`,
    answerType: "multi",
    given: [{ label: "_shifts", value: n }, { label: "_break", value: brk }, { label: "_rate", value: rate }],
    parts: [
      { id: "h", label: "h", ask: "Total paid time this week: whole hours", answerType: "number", answer: Math.floor(minutes / 60), tolerance: 0, ...EXACT, hint: `One shift is ${dur(e - s)} long; take off the break, then multiply by \`_shifts\`.` },
      { id: "min", label: "min", ask: "… and remaining minutes (0–59)", answerType: "number", answer: minutes % 60, tolerance: 0, ...EXACT, hint: "Turn the total minutes into hours and minutes: divide by 60, and the remainder is the minutes." },
      { id: "pay", label: "Pay", ask: "Pay for the week in dollars, rounded to the nearest cent", answerType: "number", answer: pay, tolerance: 0.005, hint: "Pay = paid hours × rate. Use the hours as a decimal (minutes ÷ 60), not the hh.mm digits." },
    ],
    explanation: `One shift: ${t24(s)} to ${t24(e)} is ${e - s} min; minus the break leaves ${e - s - brk} min. Week: ${n} × ${e - s - brk} = ${minutes} min = **${dur(minutes)}**.\n\nPay: \`${minutes} / 60 * _rate\` = ${(minutes / 60).toFixed(4).replace(/\.?0+$/, "")} × ${rate.toFixed(2)}` +
      (Number.isInteger(payC) ? ` = **$${pay.toFixed(2)}**.` : ` ≈ ${(payC / 100).toFixed(4)}, which rounds to **$${pay.toFixed(2)}**.`),
    params: { kind, n, s, e, brk, rateC },
  };
}

function verifyClock(q, answer) {
  const p = q.params;
  if (p.kind === "order") {
    const letters = String(answer).split(",").map((x) => x.trim());
    if (letters.length !== 4 || new Set(letters).size !== 4) return false;
    // Re-read each shown time (12- or 24-hour) and check it is ascending.
    const vals = letters.map((l) => readClock(p.shown["ABCD".indexOf(l)]));
    return vals.every((v, i) => Number.isFinite(v) && (i === 0 || v > vals[i - 1]));
  }
  if (p.kind === "elapsed") return Number(answer) > 0 && mod(p.start + Number(answer), 1440) === p.end;
  if (p.kind === "overnight") {
    const h = Number(answer.h), m = Number(answer.min);
    if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) return false;
    return mod(p.start + 60 * h + m, 1440) === p.end && 60 * h + m < 1440;
  }
  if (p.kind === "shifts") {
    const h = Number(answer.h), m = Number(answer.min), pay = Number(answer.pay);
    if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) return false;
    // Rebuild the week minute by minute: each shift counted from its clock times.
    let paid = 0;
    for (let i = 0; i < p.n; i++) paid += readClock(t24(p.e)) - readClock(t24(p.s)) - p.brk;
    if (60 * h + m !== paid) return false;
    const exactC = (paid * p.rateC) / 60;
    return Math.abs(pay * 100 - exactC) <= 0.5 + 1e-6 && Math.abs(pay * 100 - Math.round(pay * 100)) < 1e-6;
  }
  // Text clock answers: right format, then check by stepping back from the answer.
  const s = String(answer);
  if (p.out === "24" ? !is24(s) : !is12(s)) return false;
  const v = readClock(s);
  if (!Number.isFinite(v)) return false;
  switch (p.kind) {
    case "to24":
    case "to12": {
      const shown = p.out === "24" ? t12(p.t) : t24(p.t); // what the prompt showed
      return readClock(shown) === v;
    }
    case "add":
    case "night-add":
      return mod(v - p.d, 1440) === mod(p.start, 1440);
    case "sub":
      return mod(v + p.d, 1440) === mod(p.end, 1440);
    case "chores":
      return mod(v - p.ds[2] - p.ds[1] - p.ds[0], 1440) === p.start;
    case "backwards": {
      let t = v;
      for (const step of p.steps) t += step;
      return mod(t, 1440) === p.arrive;
    }
    default:
      return false;
  }
}

// =====================================================================
// Calendar dates
// =====================================================================
function genCalendar(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["later", "dim", "weeks", "between"]);
    if (kind === "later") {
      const z = randDate(rng, 2023, 2028);
      const n = rng.int(3, 25);
      const { y, m, d } = daysToCivil(z);
      const left = daysInMonth(y, m) - d;
      return {
        prompt: `What date is **${n} days after ${fmtZ(z)}**? (Give the day, month and year.)`,
        answerType: "date", precision: "day", answer: fmtZ(z + n),
        explanation: n <= left ? `${d} + ${n} = ${d + n}, still in ${MONTHS[m - 1]}: **${fmtZ(z + n)}**.`
          : `${MONTHS[m - 1]} has ${daysInMonth(y, m)} days, so ${left} days take you to ${daysInMonth(y, m)} ${MONTHS[m - 1]}. The other ${n - left} days go into the next month: **${fmtZ(z + n)}**.`,
        hints: [`${MONTHS[m - 1]} ${y} has ${daysInMonth(y, m)} days.`, n <= left ? `Add ${n} to the day number.` : `Count to the end of ${MONTHS[m - 1]} first (${left} days), then carry on into the next month.`],
        params: { kind, z, n },
      };
    }
    if (kind === "dim") {
      const y = rng.int(2023, 2030);
      const m = rng.pick([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      return {
        prompt: `How many days are there in **${MONTHS[m - 1]} ${y}**?`,
        answerType: "number", answer: daysInMonth(y, m), tolerance: 0, ...EXACT,
        explanation: `"Thirty days has September, April, June and November"; all the rest except February have 31. ${MONTHS[m - 1]} has **${daysInMonth(y, m)}** days.`,
        hints: ["Remember the rhyme: thirty days has September, April, June and November.", "Is the month in the rhyme? The months not in it (apart from February) have one day more."],
        params: { kind, y, m },
      };
    }
    if (kind === "weeks") {
      const w = rng.int(2, 9);
      const d = rng.int(1, 6);
      return {
        prompt: `How many days are there in **${plural(w, "week")} and ${plural(d, "day")}**?`,
        answerType: "number", answer: 7 * w + d, tolerance: 0, ...EXACT,
        given: [{ label: "_weeks", value: w }, { label: "_days", value: d }],
        explanation: `\`_weeks * 7 + _days\` = ${w} × 7 + ${d} = **${7 * w + d}** days.`,
        hints: ["A week has 7 days.", `Multiply the weeks by 7, then add the ${plural(d, "extra day")}.`],
        params: { kind, w, d },
      };
    }
    // between: same month
    const y = rng.int(2023, 2028);
    const m = rng.int(1, 12);
    const d1 = rng.int(1, daysInMonth(y, m) - 5);
    const d2 = rng.int(d1 + 4, daysInMonth(y, m));
    return {
      prompt: `How many days is it **from ${d1} ${MONTHS[m - 1]} ${y} to ${d2} ${MONTHS[m - 1]} ${y}**? (Count the days you move forward, so from the 1st to the 3rd is 2 days.)`,
      answerType: "number", answer: d2 - d1, tolerance: 0, ...EXACT,
      explanation: `Both dates are in the same month, so subtract the day numbers: ${d2} − ${d1} = **${d2 - d1}** days.`,
      hints: ["Both dates are in the same month.", "Subtract the smaller day number from the bigger one."],
      params: { kind, z1: civilToDays(y, m, d1), z2: civilToDays(y, m, d2) },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["later", "between", "weekday-after", "dim-feb"]);
    if (kind === "later") {
      const z = randDate(rng, 2023, 2028);
      const n = rng.int(20, 100);
      const { y, m } = daysToCivil(z);
      return {
        prompt: `What date is **${n} days after ${fmtZ(z)}**? (Give the day, month and year.)`,
        answerType: "date", precision: "day", answer: fmtZ(z + n),
        explanation: monthWalk(z, n) + ` So the date is **${fmtZ(z + n)}**.`,
        hints: [`Count the days left in ${MONTHS[m - 1]} first (${MONTHS[m - 1]} ${y} has ${daysInMonth(y, m)} days).`, "Then take away whole months one at a time (check how many days each has, and whether February is in a leap year)."],
        params: { kind, z, n },
      };
    }
    if (kind === "between") {
      const y = rng.int(2023, 2028);
      let z1, z2;
      do {
        z1 = randDate(rng, y, y);
        z2 = randDate(rng, y, y);
      } while (!(z2 - z1 >= 20 && daysToCivil(z1).m !== daysToCivil(z2).m));
      return {
        prompt: `How many days is it **from ${fmtZ(z1)} to ${fmtZ(z2)}**? (Count the days you move forward, so from the 1st to the 3rd is 2 days.)`,
        answerType: "number", answer: z2 - z1, tolerance: 0, ...EXACT,
        explanation: betweenWalk(z1, z2) + ` Total: **${z2 - z1}** days.`,
        hints: [`Count the days left in ${MONTHS[daysToCivil(z1).m - 1]} after the ${daysToCivil(z1).d}th.`, "Add the full months in between, then the day number of the last date."],
        params: { kind, z1, z2 },
      };
    }
    if (kind === "weekday-after") {
      const w = rng.int(0, 6);
      const n = rng.int(10, 200);
      const ans = WEEKDAYS[(w + n) % 7];
      return {
        prompt: `Today is a **${WEEKDAYS[w]}**. What day of the week will it be in **${n} days**?`,
        answerType: "choice", answer: ans, choices: rng.shuffle(WEEKDAYS.slice()),
        explanation: `Every 7 days is the same weekday. ${n} = 7 × ${Math.floor(n / 7)} + ${n % 7}, so move ${plural(n % 7, "day")} on from ${WEEKDAYS[w]}: **${ans}**.`,
        hints: ["Whole weeks bring you back to the same weekday.", `Find the remainder of ${n} ÷ 7 and count that many days on from ${WEEKDAYS[w]}.`],
        params: { kind, w, n },
      };
    }
    // dim-feb: February in a given year
    const y = rng.pick([1900, 2000, 2100, ...Array.from({ length: 28 }, (_, i) => 2010 + i)]);
    return {
      prompt: `How many days are there in **February ${y}**?`,
      answerType: "number", answer: daysInMonth(y, 2), tolerance: 0, ...EXACT,
      explanation: `${y} ${y % 4 !== 0 ? "is not divisible by 4" : y % 100 !== 0 ? "is divisible by 4 (and is not a century year)" : y % 400 === 0 ? "is a century year divisible by 400" : "is a century year not divisible by 400"}, so it ${isLeapYear(y) ? "is" : "is not"} a leap year: February has **${daysInMonth(y, 2)}** days.`,
      hints: ["February has 29 days in a leap year and 28 otherwise.", "Leap years are divisible by 4, except century years (like 1900), which must be divisible by 400."],
      params: { kind, y },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["before", "span", "weekday-of"]);
    if (kind === "before") {
      const z = randDate(rng, 2024, 2030);
      const n = rng.int(30, 400);
      return {
        prompt: `What date was **${n} days before ${fmtZ(z)}**? (Give the day, month and year.)`,
        answerType: "date", precision: "day", answer: fmtZ(z - n),
        explanation: `Count back in whole months and years where you can. ${n} days before ${fmtZ(z)} is **${fmtZ(z - n)}**. Check: from ${fmtZ(z - n)} forward, ${betweenWalk(z - n, z).replace(/^Days/, "days")}`,
        hints: [n >= 365 ? "A whole year back is 365 days, or 366 if a 29 February is inside it." : "Go back to the end of the previous month first.",
          "Then go back month by month, using each month's length (watch February in leap years)."],
        params: { kind, z, n },
      };
    }
    if (kind === "span") {
      let z1, z2;
      do {
        z1 = randDate(rng, 2023, 2028);
        z2 = z1 + rng.int(40, 500);
      } while (daysToCivil(z1).y === daysToCivil(z2).y);
      const incl = rng.next() < 0.5;
      const ans = z2 - z1 + (incl ? 1 : 0);
      const ctx = rng.pick(["A festival exhibition runs", "A library book loan runs", "A building project runs", "A travel pass is valid"]);
      return {
        prompt: incl ? `${ctx} from **${fmtZ(z1)}** to **${fmtZ(z2)}**, **including both of those days**. How many days is that?`
          : `How many days is it **from ${fmtZ(z1)} to ${fmtZ(z2)}**? (Count the days you move forward, so from the 1st to the 3rd is 2 days.)`,
        answerType: "number", answer: ans, tolerance: 0, ...EXACT,
        explanation: `${betweenWalk(z1, z2)} That gives ${z2 - z1} days from one date to the other.${incl ? ` Counting both the first and the last day adds 1: **${ans}** days.` : ` **${ans}** days.`}`,
        hints: [`Count to the end of ${daysToCivil(z1).y} first, then on into ${daysToCivil(z1).y + 1}${daysToCivil(z2).y > daysToCivil(z1).y + 1 ? " and beyond" : ""}.`,
          incl ? "Counting forward misses the first day; add 1 when both days are included." : "Check each February: is that year a leap year?"],
        params: { kind, z1, z2, incl },
      };
    }
    // weekday-of: a reference date and its weekday, then another date
    const z1 = randDate(rng, 2023, 2028);
    let z2;
    do {
      z2 = z1 + rng.int(-400, 400);
    } while (Math.abs(z2 - z1) < 15);
    const diff = z2 - z1;
    const ans = dayName(z2);
    return {
      prompt: `**${fmtZ(z1)}** is a **${dayName(z1)}**. What day of the week is **${fmtZ(z2)}**?`,
      answerType: "choice", answer: ans, choices: rng.shuffle(WEEKDAYS.slice()),
      explanation: `${fmtZ(diff > 0 ? z1 : z2)} to ${fmtZ(diff > 0 ? z2 : z1)} is ${Math.abs(diff)} days = ${plural(Math.floor(Math.abs(diff) / 7), "week")}` +
        (Math.abs(diff) % 7 ? ` and ${plural(Math.abs(diff) % 7, "day")}. So move ${plural(Math.abs(diff) % 7, "day")} ${diff > 0 ? "forward" : "back"} from ${dayName(z1)}: **${ans}**.`
          : ` exactly, so it is the same weekday: **${ans}**.`),
      hints: [`Count the days between the two dates (it is ${diff > 0 ? "later" : "earlier"}).`, `Only the remainder after dividing by 7 matters; move that many weekdays ${diff > 0 ? "forward" : "back"}.`],
      params: { kind, z1, z2 },
    };
  }

  // expert
  const kind = rng.pick(["age", "recur", "workdays"]);
  if (kind === "age") {
    let b, on;
    do {
      b = randDate(rng, 1950, 2015);
      on = randDate(rng, 2024, 2030);
    } while (daysToCivil(b).m === 2 && daysToCivil(b).d === 29);
    const B = daysToCivil(b), O = daysToCivil(on);
    const hadBday = O.m > B.m || (O.m === B.m && O.d >= B.d);
    const age = O.y - B.y - (hadBday ? 0 : 1);
    const nextY = O.m === B.m && O.d === B.d ? O.y + 1 : hadBday ? O.y + 1 : O.y;
    const next = civilToDays(nextY, B.m, B.d);
    const until = next - on;
    return {
      prompt: `Robin was born on **${fmtD(B)}**. Today is **${fmtD(O)}**.`,
      answerType: "multi",
      parts: [
        { id: "age", label: "Age", ask: "How old is Robin today, in whole years?", answerType: "number", answer: age, tolerance: 0, ...EXACT, hint: `Subtract the years (${O.y} − ${B.y}), then take 1 off if this year's birthday on ${B.d} ${MONTHS[B.m - 1]} hasn't happened yet.` },
        { id: "days", label: "Days", ask: "How many days until Robin's next birthday? (Count forward, so tomorrow is 1 day away.)", answerType: "number", answer: until, tolerance: 0, ...EXACT, hint: "Count forward to the next " + `${B.d} ${MONTHS[B.m - 1]}` + ", month by month (watch February in a leap year)." },
      ],
      explanation: `${O.y} − ${B.y} = ${O.y - B.y}; the ${O.y} birthday ${hadBday ? (O.m === B.m && O.d === B.d ? "is today" : "has already passed") : "is still to come"}, so Robin is **${age}**.\n\nThe next birthday is ${fmtZ(next)}: ${betweenWalk(on, next).replace(/^Days/, "days")} That is **${until}** days.`,
      params: { kind, b, on },
    };
  }
  if (kind === "recur") {
    const z = randDate(rng, 2023, 2028);
    const k = rng.int(6, 30);
    const n = rng.int(5, 14);
    const zn = z + (n - 1) * k;
    const task = rng.pick(["A plant is watered", "A pool filter is cleaned", "A bin is emptied", "A bike chain is oiled"]);
    const ans = dayName(zn);
    return {
      prompt: `${task} every **${k} days**. The first time is on **${fmtZW(z)}**.`,
      answerType: "multi",
      parts: [
        { id: "date", label: "Date", ask: `On what date is the ${ordinal(n)} time? (Give the day, month and year.)`, answerType: "date", precision: "day", answer: fmtZ(zn), hint: `The ${ordinal(n)} time is ${n - 1} gaps after the first, not ${n}: that is ${n - 1} × ${k} days later.` },
        { id: "day", label: "Day", ask: "What day of the week is that?", answerType: "choice", answer: ans, choices: rng.shuffle(WEEKDAYS.slice()), hint: `Only the remainder of the total days ÷ 7 matters; count that many weekdays on from ${dayName(z)}.` },
      ],
      given: [{ label: "_every", value: k }, { label: "_times", value: n }],
      explanation: `The ${ordinal(n)} time comes after ${n - 1} gaps: \`(_times - 1) * _every\` = ${n - 1} × ${k} = ${(n - 1) * k} days after ${fmtZ(z)}, which is **${fmtZ(zn)}**.\n\n${(n - 1) * k} = 7 × ${Math.floor(((n - 1) * k) / 7)} + ${((n - 1) * k) % 7}, so it falls ${plural(((n - 1) * k) % 7, "weekday")} after ${dayName(z)}: **${ans}**.`,
      params: { kind, z, k, n },
    };
  }
  // workdays: Monday-Friday days from z1 to z2 inclusive
  const z1 = randDate(rng, 2024, 2028);
  const z2 = z1 + rng.int(10, 60);
  let count = 0;
  for (let z = z1; z <= z2; z++) if (mod(z + 4, 7) >= 1 && mod(z + 4, 7) <= 5) count++;
  const span = z2 - z1 + 1;
  return {
    prompt: `A temporary job runs from **${fmtZW(z1)}** to **${fmtZW(z2)}**, including both days. The work is **Monday to Friday** only (no holidays). How many working days is that?`,
    answerType: "number", answer: count, tolerance: 0, ...EXACT,
    explanation: `From the first to the last day inclusive is ${span} days = ${plural(Math.floor(span / 7), "full week")}` +
      (span % 7 ? ` and ${plural(span % 7, "day")}. Each full week has 5 working days (${5 * Math.floor(span / 7)}); the ${plural(span % 7, "extra day")} (${dayName(z1 + 7 * Math.floor(span / 7))} to ${dayName(z2)}) add ${count - 5 * Math.floor(span / 7)}. Total: **${count}**.`
        : ` exactly, and each full week has 5 working days: **${count}**.`),
    hints: ["Count the days, including both ends, and split them into full weeks plus extra days.", "Each full week has 5 working days; check which weekdays the extra days fall on."],
    params: { kind, z1, z2 },
  };
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// "From 3 May: 28 days to the end of May, then June (30), …, then 12 more."
function betweenWalk(z1, z2) {
  const A = daysToCivil(z1);
  const B = daysToCivil(z2);
  if (A.y === B.y && A.m === B.m) return `Within ${MONTHS[A.m - 1]}: ${B.d} − ${A.d} = ${B.d - A.d} days.`;
  const bits = [`${daysInMonth(A.y, A.m) - A.d} to the end of ${MONTHS[A.m - 1]} ${A.y}`];
  let y = A.y, m = A.m;
  const mids = [];
  for (;;) {
    m++;
    if (m > 12) { m = 1; y++; }
    if (y === B.y && m === B.m) break;
    mids.push(`${MONTHS[m - 1].slice(0, 3)} ${daysInMonth(y, m)}`);
  }
  if (mids.length > 6) {
    bits.push(`${mids.length} full months in between (${mids.reduce((s, x) => s + Number(x.split(" ")[1]), 0)} days)`);
  } else if (mids.length) bits.push(`full months ${mids.join(", ")}`);
  bits.push(`${B.d} in ${MONTHS[B.m - 1]} ${B.y}`);
  return `Days: ${bits.join("; ")}.`;
}
function monthWalk(z, n) {
  return betweenWalk(z, z + n);
}

function verifyCalendar(q, answer) {
  const p = q.params;
  switch (p.kind) {
    case "later": case "before": {
      const ms = readDate(answer);
      return ms !== null && ms === utcAdd(utcOf(p.z), p.kind === "later" ? p.n : -p.n);
    }
    case "dim": case "dim-feb": {
      const y = p.y, m = p.kind === "dim" ? p.m : 2;
      // Day 0 of the next month is the last day of this one.
      return Number(answer) === new Date(Date.UTC(y, m, 0)).getUTCDate();
    }
    case "weeks":
      return Number(answer) - p.d === 7 * p.w;
    case "between":
      return Number(answer) === utcDiff(utcOf(p.z1), utcOf(p.z2));
    case "span":
      return Number(answer) === utcDiff(utcOf(p.z1), utcOf(p.z2)) + (p.incl ? 1 : 0);
    case "weekday-after":
      return WEEKDAYS.includes(answer) && WEEKDAYS[(WEEKDAYS.indexOf(answer) - p.n % 7 + 7) % 7] === WEEKDAYS[p.w];
    case "weekday-of":
      return answer === utcDay(utcOf(p.z2)) && utcDay(utcOf(p.z1)) === dayName(p.z1);
    case "age": {
      const b = new Date(utcOf(p.b)), o = new Date(utcOf(p.on));
      const age = Number(answer.age), days = Number(answer.days);
      // Age: count the birthdays passed by stepping years forward.
      let n = 0;
      while (Date.UTC(b.getUTCFullYear() + n + 1, b.getUTCMonth(), b.getUTCDate()) <= o.getTime()) n++;
      if (age !== n) return false;
      // Days: the candidate lands on a birthday, and no earlier day after today does.
      if (!Number.isInteger(days) || days < 1 || days > 366) return false;
      const land = new Date(utcAdd(o.getTime(), days));
      if (land.getUTCMonth() !== b.getUTCMonth() || land.getUTCDate() !== b.getUTCDate()) return false;
      for (let k = 1; k < days; k++) {
        const t = new Date(utcAdd(o.getTime(), k));
        if (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() === b.getUTCDate()) return false;
      }
      return true;
    }
    case "recur": {
      // Step k days at a time from the first date.
      let ms = utcOf(p.z);
      for (let i = 1; i < p.n; i++) ms = utcAdd(ms, p.k);
      return readDate(answer.date) === ms && answer.day === utcDay(ms);
    }
    case "workdays": {
      let c = 0;
      for (let ms = utcOf(p.z1); ms <= utcOf(p.z2); ms = utcAdd(ms, 1)) {
        const wd = new Date(ms).getUTCDay();
        if (wd !== 0 && wd !== 6) c++;
      }
      return Number(answer) === c;
    }
    default:
      return false;
  }
}

// =====================================================================
// Time zones (fixed standard offsets, no daylight saving)
// =====================================================================
const CITIES = [
  ["London", 0], ["Reykjavik", 0], ["Lagos", 60], ["Cairo", 120], ["Nairobi", 180], ["Moscow", 180],
  ["Dubai", 240], ["Karachi", 300], ["Delhi", 330], ["Kathmandu", 345], ["Dhaka", 360], ["Bangkok", 420],
  ["Singapore", 480], ["Tokyo", 540], ["Adelaide", 570], ["Brisbane", 600], ["Auckland", 720],
  ["São Paulo", -180], ["New York", -300], ["Lima", -300], ["Chicago", -360], ["Mexico City", -360],
  ["Denver", -420], ["Los Angeles", -480], ["Anchorage", -540], ["Honolulu", -600],
];
const WHOLE = CITIES.filter(([, o]) => o % 60 === 0);
function utcText(o) {
  if (o === 0) return "UTC+0";
  const a = Math.abs(o);
  return `UTC${o > 0 ? "+" : "−"}${Math.floor(a / 60)}${a % 60 ? `:${pad(a % 60)}` : ""}`;
}
function pickPair(rng, list, minGap = 60) {
  let A, B;
  do {
    A = rng.pick(list);
    B = rng.pick(list);
  } while (A[0] === B[0] || Math.abs(A[1] - B[1]) < minGap);
  return [A, B];
}
const offsetsLine = (...cs) => `Use these standard offsets (no daylight saving): ${cs.map(([n, o]) => `${n} ${utcText(o)}`).join(", ")}.`;
const diffText = (A, B) => {
  const d = B[1] - A[1];
  return `${B[0]} is ${dur(Math.abs(d))} ${d > 0 ? "ahead of" : "behind"} ${A[0]}`;
};
function dayChoices(w, lo, hi) {
  const out = [];
  for (let k = lo; k <= hi; k++) out.push(WEEKDAYS[mod(w + k, 7)]);
  return out;
}

function genZones(difficulty, rng) {
  if (difficulty === "easy") {
    const [A, B] = pickPair(rng, WHOLE);
    const d = B[1] - A[1];
    let t;
    do {
      t = 5 * rng.int(0, 287);
    } while (t + d < 0 || t + d >= 1440);
    return {
      prompt: `${offsetsLine(A, B)}\n\nWhen it is **${t24(t)}** in ${A[0]}, what time is it in ${B[0]} (same day)?${TIME24}`,
      answerType: "text", ...textTime(t + d, false),
      explanation: `${diffText(A, B)} (${utcText(B[1])} vs ${utcText(A[1])}). ${t24(t)} ${d > 0 ? "+" : "−"} ${dur(Math.abs(d))} = **${t24(t + d)}**.`,
      hints: [`Find the gap between the offsets: ${utcText(B[1])} and ${utcText(A[1])}.`, `${B[0]} is ${d > 0 ? "further east (ahead), so add" : "further west (behind), so subtract"} the gap.`],
      params: { kind: "convert", t, oA: A[1], oB: B[1], out: "24" },
    };
  }
  if (difficulty === "medium") {
    const kind = rng.pick(["convert-day", "convert-day", "gap"]);
    if (kind === "gap") {
      const [A, B] = pickPair(rng, WHOLE);
      const [E, W] = A[1] > B[1] ? [A, B] : [B, A];
      return {
        prompt: `${offsetsLine(A, B)}\n\nHow many hours ahead of ${W[0]} is ${E[0]}?`,
        answerType: "number", answer: (E[1] - W[1]) / 60, tolerance: 0, ...EXACT,
        explanation: `${utcText(E[1])} − (${utcText(W[1])}) = ${plural((E[1] - W[1]) / 60, "hour")}. ${E[0]} is **${plural((E[1] - W[1]) / 60, "hour")}** ahead.`,
        hints: ["Subtract the two UTC offsets.", W[1] < 0 && E[1] > 0 ? "One is behind UTC and one is ahead, so the gap is the two sizes added." : "Both are on the same side of UTC, so take the smaller size from the bigger one."],
        params: { kind, oE: E[1], oW: W[1] },
      };
    }
    const [A, B] = pickPair(rng, WHOLE, 180);
    const d = B[1] - A[1];
    const w = rng.int(0, 6);
    let t;
    do {
      t = 5 * rng.int(0, 287);
    } while (t + d >= 0 && t + d < 1440);
    const shift = Math.floor((t + d) / 1440);
    const ans = WEEKDAYS[mod(w + shift, 7)];
    return {
      prompt: `${offsetsLine(A, B)}\n\nIt is **${t24(t)} on ${WEEKDAYS[w]}** in ${A[0]}. What is the time and day in ${B[0]}?`,
      answerType: "multi",
      parts: [
        { id: "time", label: "Time", ask: `Local time in ${B[0]} (24-hour, hh:mm)`, answerType: "text", ...textTime(t + d, false), hint: `${diffText(A, B)}; ${d > 0 ? "add" : "subtract"} ${dur(Math.abs(d))}.` },
        { id: "day", label: "Day", ask: `Day of the week in ${B[0]}`, answerType: "choice", answer: ans, choices: dayChoices(w, -1, 1), hint: d > 0 ? "Going past 24:00 moves to the next day." : "Going back past 00:00 moves to the previous day." },
      ],
      explanation: `${diffText(A, B)}. ${t24(t)} ${d > 0 ? "+" : "−"} ${dur(Math.abs(d))} = ${t24(t + d)}, which ${d > 0 ? "passes midnight into the next day" : "goes back past midnight into the previous day"}: **${t24(t + d)} on ${ans}**.`,
      params: { kind, t, w, oA: A[1], oB: B[1] },
    };
  }
  if (difficulty === "hard") {
    const [A, B] = pickPair(rng, CITIES, 120);
    const w = rng.int(0, 6);
    const t = 5 * rng.int(0, 287);
    const f = 5 * rng.int(18, 168); // 1.5-14 h
    const arr = t + f + (B[1] - A[1]);
    const shift = Math.floor(arr / 1440);
    const ans = WEEKDAYS[mod(w + shift, 7)];
    return {
      prompt: `${offsetsLine(A, B)}\n\nA flight leaves ${A[0]} at **${t24(t)} on ${WEEKDAYS[w]}** (local time) and the flight takes **${dur(f)}**. What is the local time and day in ${B[0]} when it lands?`,
      answerType: "multi",
      parts: [
        { id: "time", label: "Time", ask: `Landing time in ${B[0]} (24-hour, hh:mm)`, answerType: "text", ...textTime(arr, false), hint: `Add the flight time in ${A[0]}'s time first, then ${B[1] > A[1] ? "add" : "subtract"} the ${dur(Math.abs(B[1] - A[1]))} time difference.` },
        { id: "day", label: "Day", ask: `Day of the week in ${B[0]}`, answerType: "choice", answer: ans, choices: dayChoices(w, -1, 2), hint: "Count how many times you pass midnight (forwards or backwards)." },
      ],
      explanation: `In ${A[0]} time it lands at ${t24(t)} + ${dur(f)} = ${t24(t + f)}${Math.floor((t + f) / 1440) ? " the next day" : ""}. ${diffText(A, B)}, so in ${B[0]} that is **${t24(arr)} on ${ans}**.`,
      params: { kind: "flight", t, w, f, oA: A[1], oB: B[1] },
    };
  }
  // expert
  const kind = rng.pick(["duration", "overlap", "depart"]);
  if (kind === "duration") {
    const [A, B] = pickPair(rng, CITIES, 120);
    const w = rng.int(0, 6);
    const t = 5 * rng.int(0, 287);
    const f = 5 * rng.int(24, 192); // 2-16 h
    const arr = t + f + (B[1] - A[1]);
    const shift = Math.floor(arr / 1440);
    return {
      prompt: `${offsetsLine(A, B)}\n\nA flight leaves ${A[0]} at **${t24(t)} on ${WEEKDAYS[w]}** and lands in ${B[0]} at **${t24(arr)} on ${WEEKDAYS[mod(w + shift, 7)]}** (both local times). How long is the flight?`,
      answerType: "multi",
      parts: [
        { id: "h", label: "h", ask: "Whole hours", answerType: "number", answer: Math.floor(f / 60), tolerance: 0, ...EXACT, hint: `Put both times in one zone first: ${diffText(A, B)}.` },
        { id: "min", label: "min", ask: "Remaining minutes (0–59)", answerType: "number", answer: f % 60, tolerance: 0, ...EXACT, hint: "Then count from take-off to landing in that one zone, including any midnight." },
      ],
      explanation: `In ${A[0]} time, the landing is ${t24(arr)} ${B[1] > A[1] ? "−" : "+"} ${dur(Math.abs(B[1] - A[1]))} = ${t24(t + f)}${Math.floor((t + f) / 1440) ? ` on ${WEEKDAYS[mod(w + Math.floor((t + f) / 1440), 7)]}` : ""}. From ${t24(t)} to that is **${dur(f)}**.`,
      params: { kind, t, w, f, oA: A[1], oB: B[1], arrT: mod(arr, 1440), arrK: shift },
    };
  }
  if (kind === "overlap") {
    let A, B, sA, eA, sB, eB, lo, hi;
    do {
      [A, B] = pickPair(rng, CITIES, 60);
      sA = 30 * rng.int(14, 20); eA = sA + 30 * rng.int(14, 18);
      sB = 30 * rng.int(14, 20); eB = sB + 30 * rng.int(14, 18);
      // In UTC minutes.
      lo = Math.max(sA - A[1], sB - B[1]);
      hi = Math.min(eA - A[1], eB - B[1]);
    } while (hi - lo < 30 || Math.abs(A[1] - B[1]) > 600);
    return {
      prompt: `${offsetsLine(A, B)}\n\nAn office in ${A[0]} is open **${t24(sA)}–${t24(eA)}** and an office in ${B[0]} is open **${t24(sB)}–${t24(eB)}** (each in its own local time). They want to talk while both are open.`,
      answerType: "multi",
      parts: [
        { id: "start", label: "Start", ask: `When does the shared window start, in ${A[0]} time? (24-hour, hh:mm)`, answerType: "text", ...textTime(lo + A[1], false), hint: `Write ${B[0]}'s opening hours in ${A[0]} time (${diffText(B, A)}).` },
        { id: "end", label: "End", ask: `When does it end, in ${B[0]} time? (24-hour, hh:mm)`, answerType: "text", ...textTime(hi + B[1], false), hint: `The window ends when the first office closes; convert that moment to ${B[0]} time.` },
        { id: "len", label: "Length", ask: "How many minutes long is the shared window?", answerType: "number", answer: hi - lo, tolerance: 0, ...EXACT, hint: "Subtract start from end using times in the same zone." },
      ],
      explanation: `In ${A[0]} time, ${B[0]}'s office is open ${t24(sB - B[1] + A[1])}–${t24(eB - B[1] + A[1])}. Both are open from ${t24(lo + A[1])} to ${t24(hi + A[1])} ${A[0]} time, so the window starts at **${t24(lo + A[1])}** (${A[0]}), ends at **${t24(hi + B[1])}** (${B[0]}) and lasts **${hi - lo} minutes**.`,
      params: { kind, oA: A[1], oB: B[1], sA, eA, sB, eB },
    };
  }
  // depart: arrive at B by a local time; latest departure in A's local time and day
  const [A, B] = pickPair(rng, CITIES, 120);
  const w = rng.int(0, 6);
  const arr = 5 * rng.int(84, 264); // 07:00-22:00
  const f = 5 * rng.int(24, 168);
  const check = 5 * rng.pick([6, 9, 12]); // 30/45/60 min to get through the airport
  const dep = arr - check - f - (B[1] - A[1]);
  const shift = Math.floor(dep / 1440);
  const ans = WEEKDAYS[mod(w + shift, 7)];
  return {
    prompt: `${offsetsLine(A, B)}\n\nYou must be out of the airport in ${B[0]} by **${t24(arr)} on ${WEEKDAYS[w]}** (local time). The flight from ${A[0]} takes **${dur(f)}**, and leaving the airport after landing takes **${check} min**. What is the latest departure time from ${A[0]}, in ${A[0]} local time?`,
    answerType: "multi",
    parts: [
      { id: "time", label: "Time", ask: `Departure time in ${A[0]} (24-hour, hh:mm)`, answerType: "text", ...textTime(dep, false), hint: `Work backwards: take off the ${check} min and the ${dur(f)} flight first (still in ${B[0]} time).` },
      { id: "day", label: "Day", ask: `Day of the week in ${A[0]}`, answerType: "choice", answer: ans, choices: dayChoices(w, -2, 1), hint: `Then switch to ${A[0]} time (${diffText(B, A)}) and count any midnights you cross.` },
    ],
    explanation: `Latest landing: ${t24(arr)} − ${check} min = ${t24(arr - check)} (${B[0]}). Take-off: ${t24(arr - check)} − ${dur(f)} = ${t24(arr - check - f)} ${B[0]} time. ${diffText(B, A)}, so in ${A[0]} that is **${t24(dep)} on ${ans}**.`,
    params: { kind, w, arr, f, check, oA: A[1], oB: B[1] },
  };
}

function verifyZones(q, answer) {
  const p = q.params;
  // Work in UTC minutes from the start of the first local day.
  const toUtc = (local, o) => local - o;
  switch (p.kind) {
    case "convert": {
      if (!is24(answer)) return false;
      return toUtc(readClock(answer), p.oB) === toUtc(p.t, p.oA);
    }
    case "gap":
      return Number(answer) * 60 + p.oW === p.oE;
    case "convert-day":
    case "flight": {
      if (!is24(answer.time) || !WEEKDAYS.includes(answer.day)) return false;
      const k = mod(WEEKDAYS.indexOf(answer.day) - p.w + 3, 7) - 3; // -3..3 days from the start day
      const landUtc = toUtc(k * 1440 + readClock(answer.time), p.oB);
      return landUtc === toUtc(p.t, p.oA) + (p.f || 0);
    }
    case "duration": {
      const h = Number(answer.h), m = Number(answer.min);
      if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) return false;
      // From the shown local times: landing = arrK days on, at arrT, in B's zone.
      return toUtc(p.arrK * 1440 + p.arrT, p.oB) - toUtc(p.t, p.oA) === 60 * h + m;
    }
    case "overlap": {
      if (!is24(answer.start) || !is24(answer.end)) return false;
      const len = Number(answer.len);
      // Minute by minute in UTC over two days: both offices open?
      let first = null, last = null, count = 0;
      for (let u = -1440; u < 2880; u++) {
        const a = u + p.oA, b = u + p.oB;
        if (a >= p.sA && a < p.eA && b >= p.sB && b < p.eB) {
          if (first === null) first = u;
          last = u;
          count++;
        }
      }
      if (first === null) return false;
      return len === count && mod(readClock(answer.start) - p.oA, 1440) === mod(first, 1440)
        && mod(readClock(answer.end) - p.oB, 1440) === mod(last + 1, 1440);
    }
    case "depart": {
      if (!is24(answer.time) || !WEEKDAYS.includes(answer.day)) return false;
      const k = mod(WEEKDAYS.indexOf(answer.day) - p.w + 3, 7) - 3;
      const depUtc = toUtc(k * 1440 + readClock(answer.time), p.oA);
      return depUtc + p.f + p.check === toUtc(p.arr, p.oB);
    }
    default:
      return false;
  }
}

// =====================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard", "expert"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const make = { clock: genClock, calendar: genCalendar, "time-zones": genZones }[subtopic];
  if (!make) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = make(difficulty, rng);
  q.params.sub = subtopic;
  return q;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || answer === undefined || answer === null || answer === "") return false;
  if (question.answerType === "choice" && !question.choices.includes(String(answer))) return false;
  if (question.answerType === "multi") {
    if (typeof answer !== "object") return false;
    for (const part of question.parts) {
      if (part.answerType === "choice" && !part.choices.includes(String(answer[part.id]))) return false;
    }
  }
  try {
    if (p.sub === "clock") return verifyClock(question, answer);
    if (p.sub === "calendar") return verifyCalendar(question, answer);
    if (p.sub === "time-zones") return verifyZones(question, answer);
    return false;
  } catch {
    return false;
  }
}
