// Statistics generator. Uses only the seeded rng passed in by the engine.
// Easy number answers are whole; medium/hard ones are rounded to 2 decimals (tolerance 0.005).
// Probabilities are a fraction in simplest form ("3/8", typed as text) or a decimal to 2 places;
// the prompt says which. Data lists have at most 12 values.

// Round half away from zero (the 1e-9 nudge absorbs binary error) and intermediate numbers come from mathutil.
import { fmtNum, round2 } from "../../js/lib/mathutil.js";

// Answer/choice formatter: whole numbers as-is (prompts say "round if it is not a whole number"),
// others with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded && !Number.isInteger(v) ? v.toFixed(2) : String(v);
}

// Given values and intermediate steps: shortest form (up to 4 decimals); never "-0".
const num = (n) => fmtNum(n);

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function reduce(n, d) {
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
const fracStr = (n, d) => {
  const [a, b] = reduce(n, d);
  return `${a}/${b}`;
};

const WHOLE = " Give a whole number.";
const ROUND_IF = " Round to 2 decimal places if it is not a whole number.";
const FRAC_NOTE = " Give your answer as a fraction in simplest form, like 3/8 (no spaces around the slash).";
const DEC_NOTE = " Give your answer as a decimal rounded to 2 decimal places, like 0.25.";
const QUARTILE_METHOD =
  " Find the quartiles as the median of each half of the sorted data; when there is an odd number of values, leave the middle value out of both halves.";

// Final line of an explanation: "= **12**" or "≈ 12.3333, which rounds to **12.33**".
function result(exact, rounded, suffix = "") {
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${suffix}**`;
  return `≈ ${exact.toFixed(4)}${suffix}, which rounds to **${shown}${suffix}**`;
}

// 4 unique numeric choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors. `bounds` keeps options in a sensible range.
function buildChoices(correct, candidates, rounded, rng, bounds = {}) {
  const lo = bounds.lo ?? -Infinity;
  const hi = bounds.hi ?? Infinity;
  const step = bounds.step ?? 1;
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v < lo || v > hi) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (Math.abs(Number(s) - correct) <= 0.005 + 1e-9) return; // would also count as correct (e.g. 0.87 when the exact value is 0.875)
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 1000; k++) {
    tryAdd(correct + k * step);
    tryAdd(correct - k * step);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

function finish(base, exact, rounded, candidates, rng, bounds) {
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng, bounds);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// Pre-filled calculator rows (question.given) for questions with 2–8 stated numbers. Data-set questions
// (mean, median, quartiles of a list) get none: one row per data point isn't useful.
// [[label, value], ...] -> { given: [{ label, value }, ...] }, or {} when there is nothing to pre-fill.
const givenRows = (pairs) => (pairs && pairs.length >= 2 && pairs.length <= 8 ? { given: pairs.map(([label, value]) => ({ label, value })) } : {});

// 1 -> "1st", 2 -> "2nd", 11 -> "11th" (positions in a sorted list, for hints).
const ord = (k) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"}`;
const sorted = (arr) => arr.slice().sort((a, b) => a - b);
const sum = (arr) => arr.reduce((s, x) => s + x, 0);
const list = (arr) => arr.join(", ");

function medianOf(s) {
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Data with exactly one most-frequent value.
function dataWithMode(rng, n, lo, hi, allowRunnerUp) {
  const m = rng.int(lo, hi);
  const top = rng.int(2, 3);
  const data = Array(top).fill(m);
  const used = new Set([m]);
  if (allowRunnerUp && top === 3 && n - top >= 4) {
    // a runner-up value that appears twice, to make the count matter
    let r;
    do {
      r = rng.int(lo, hi);
    } while (used.has(r));
    used.add(r);
    data.push(r, r);
  }
  while (data.length < n) {
    const v = rng.int(lo, hi);
    if (used.has(v)) continue;
    used.add(v);
    data.push(v);
  }
  return rng.shuffle(data);
}

function genCentral(difficulty, rng) {
  checkDifficulty(difficulty);
  const kind = rng.pick(["mean", "median", "mode"]);
  const easy = difficulty === "easy";
  const [nLo, nHi, lo, hi] = easy ? [5, 7, 1, 20] : difficulty === "medium" ? [6, 10, 1, 50] : [8, 12, -10, 60];
  let n = rng.int(nLo, nHi);
  let data;

  if (kind === "mode") {
    data = dataWithMode(rng, n, lo, hi, !easy);
  } else {
    if (easy && kind === "median" && n % 2 === 0) n += 1; // odd count: the median is a data value
    data = [];
    for (let i = 0; i < n; i++) data.push(rng.int(lo, hi));
    if (easy && kind === "mean") {
      // Choose the last value so the mean is whole.
      const partial = sum(data.slice(0, n - 1));
      const options = [];
      for (let v = lo; v <= hi; v++) if ((partial + v) % n === 0) options.push(v);
      data[n - 1] = rng.pick(options);
    }
  }
  const s = sorted(data);
  const shown = easy ? s : data; // easy lists come sorted
  const rounded = !easy;
  const end = rounded ? ROUND_IF : WHOLE;
  const intro = `Here are ${data.length} values${easy ? " (already in order)" : ""}: ${list(shown)}.`;
  const N = data.length;
  let prompt, exact, explanation, candidates, hints;

  if (kind === "mean") {
    exact = sum(data) / N;
    prompt = `${intro} What is the mean?${end}`;
    explanation = `Mean = sum ÷ count.\n\nSum: \`${list(shown).replace(/, /g, " + ").replace(/\+ -/g, "- ")} = ${sum(data)}\`.\n\n\`${sum(data)} / ${N}\` ${result(exact, rounded)}`;
    candidates = [medianOf(s), sum(data) / (N - 1), sum(data) / (N + 1), sum(data)];
    hints = [
      `Mean = sum of the values ÷ how many there are. There are ${N} values.`,
      `Add them all up${data.some((v) => v < 0) ? " (the negative values take away)" : ""}: the total is ${sum(data)}.`,
      `Divide ${sum(data)} by ${N}.${rounded ? " Round to 2 decimal places if it is not a whole number." : ""}`,
    ];
  } else if (kind === "median") {
    exact = medianOf(s);
    prompt = `${intro} What is the median?${end}`;
    const sortStep = easy ? "" : `Sort the values: ${list(s)}.\n\n`;
    explanation =
      sortStep +
      (N % 2
        ? `There are ${N} values, so the median is the middle one, value number ${(N + 1) / 2}: **${num(exact)}**.`
        : `There are ${N} values, so the median is halfway between values ${N / 2} and ${N / 2 + 1}: \`(${s[N / 2 - 1]} + ${s[N / 2]}) / 2\` ${result(exact, rounded)}.`);
    candidates = [data[Math.floor(N / 2)], sum(data) / N, s[Math.floor(N / 2)] + 1, (s[0] + s[N - 1]) / 2]; // middle of the unsorted list, the mean, slip, midrange
    hints = [
      easy
        ? "The median is the middle value of the sorted list. This list is already in order."
        : `The median is the middle value once the list is sorted. Sort all ${N} values from smallest to largest first (the smallest is ${s[0]}, the largest is ${s[N - 1]}).`,
      N % 2
        ? `There are ${N} values (odd), so the median is the ${ord((N + 1) / 2)} value: the one with ${(N - 1) / 2} values on each side.`
        : `There are ${N} values (even), so there is no single middle value: take the two middle ones, the ${ord(N / 2)} and ${ord(N / 2 + 1)} values, and go halfway between them (add and halve).`,
    ];
  } else {
    const counts = new Map();
    data.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    let mode = null;
    let best = 0;
    counts.forEach((c, v) => {
      if (c > best) {
        best = c;
        mode = v;
      }
    });
    exact = mode;
    prompt = `${intro} What is the mode?${WHOLE}`;
    explanation = `The mode is the value that appears most often. ${num(mode)} appears ${best} times, more than any other value, so the mode is **${num(mode)}**.`;
    candidates = [best, medianOf(s), s[N - 1], s[0]]; // gave the count, the median, the largest, the smallest
    const repeats = [...counts.values()].filter((c) => c >= 2).length;
    hints = [
      "The mode is the value that appears most often (not how many times it appears).",
      `Tally the values: go through the list and count how many times each one appears. Sorting first makes repeats sit next to each other.`,
      repeats > 1
        ? `More than one value repeats, so compare the counts: the mode appears ${best === 3 ? "three" : "two"} times.`
        : `Only one value appears more than once.`,
    ];
    const base = { prompt, tolerance: 0, explanation, params: { kind, values: { data }, rounded: false } };
    return { ...finish(base, exact, false, candidates, rng), hints };
  }
  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values: { data }, rounded } };
  return { ...finish(base, exact, rounded, candidates, rng), hints };
}

// Quartiles by the "median of each half, excluding the median for odd n" method.
function quartiles(s) {
  const n = s.length;
  const half = Math.floor(n / 2);
  const lower = s.slice(0, half);
  const upper = s.slice(n - half);
  return { lower, upper, q1: medianOf(lower), q3: medianOf(upper) };
}

function genSpread(difficulty, rng) {
  if (difficulty !== "medium" && difficulty !== "hard") throw new Error(`range-iqr has no "${difficulty}" level`);
  const hard = difficulty === "hard";
  const kind = rng.pick(hard ? ["range", "q1", "q3", "iqr", "iqr"] : ["range", "q1", "q3", "iqr"]);
  const n = hard ? rng.int(8, 12) : rng.int(7, 10);
  const data = [];
  for (let i = 0; i < n; i++) data.push(hard ? rng.int(-10, 80) : rng.int(1, 50));
  const s = sorted(data);
  const shown = hard ? data : s;
  const intro = `Here are ${n} values${hard ? "" : " (already in order)"}: ${list(shown)}.`;
  const { lower, upper, q1, q3 } = quartiles(s);
  const half = Math.floor(n / 2);
  const sortStep = hard ? `Sort the values: ${list(s)}.\n\n` : "";
  const halves =
    `${n % 2 ? `There are ${n} values, so leave out the middle one (${s[(n - 1) / 2]}).` : `There are ${n} values, so split them into two halves of ${n / 2}.`} ` +
    `Lower half: ${list(lower)}. Upper half: ${list(upper)}.`;
  let prompt, exact, rounded, explanation, candidates;
  const sortHint = hard
    ? `Sort the ${n} values from smallest to largest first (watch the negatives: the more negative a number, the smaller it is).`
    : `The ${n} values are already sorted.`;
  const halfPos = (h) => (h % 2 ? `its ${ord((h + 1) / 2)} value` : `halfway between its ${ord(h / 2)} and ${ord(h / 2 + 1)} values`);
  const halvesHint =
    n % 2
      ? `There are ${n} values (odd), so leave out the middle one (the ${ord((n + 1) / 2)} value). That leaves a lower half of ${half} and an upper half of ${half}.`
      : `There are ${n} values (even), so split them into a lower half of ${half} and an upper half of ${half}.`;
  let hints;

  if (kind === "range") {
    rounded = false;
    exact = s[n - 1] - s[0];
    prompt = `${intro} What is the range?${WHOLE}`;
    explanation = `${sortStep}Range = largest - smallest.\n\n\`${s[n - 1]} - ${s[0]}\` ${result(exact, false)}`;
    candidates = [data[n - 1] - data[0], s[n - 1], q3 - q1, s[n - 1] + s[0]];
    hints = [
      "Range = largest value - smallest value.",
      hard
        ? `The list is not sorted, so scan it for the largest and smallest values (not the first and last).${s[0] < 0 ? " The smallest is negative, and subtracting a negative adds." : ""}`
        : `The list is sorted, so the smallest is the first value (${s[0]}) and the largest is the last (${s[n - 1]}).`,
    ];
  } else {
    rounded = true;
    const qText = { q1: "lower quartile (Q1)", q3: "upper quartile (Q3)", iqr: "interquartile range (IQR)" }[kind];
    prompt = `${intro} What is the ${qText}?${QUARTILE_METHOD}${ROUND_IF}`;
    const q1Line = `Q1 is the median of the lower half ${result(q1, false).replace("= **", "= ").replace(/\*\*$/, "")}.`;
    const q3Line = `Q3 is the median of the upper half ${result(q3, false).replace("= **", "= ").replace(/\*\*$/, "")}.`;
    // Alternative quartile methods that people mix up (including the middle value for odd n).
    const incl = n % 2 ? { q1: medianOf(s.slice(0, half + 1)), q3: medianOf(s.slice(half)) } : { q1, q3 };
    if (kind === "q1") {
      exact = q1;
      explanation = `${sortStep}${halves}\n\nQ1 is the median of the lower half ${result(q1, rounded)}.`;
      candidates = [incl.q1, medianOf(s), q3, s[Math.floor(n / 4)]];
      hints = [sortHint, halvesHint, `Q1 is the median of the lower half (the ${half} smallest values): ${halfPos(half)}.`];
    } else if (kind === "q3") {
      exact = q3;
      explanation = `${sortStep}${halves}\n\nQ3 is the median of the upper half ${result(q3, rounded)}.`;
      candidates = [incl.q3, medianOf(s), q1, s[Math.floor((3 * n) / 4)]];
      hints = [sortHint, halvesHint, `Q3 is the median of the upper half (the ${half} largest values): ${halfPos(half)}.`];
    } else {
      exact = q3 - q1;
      explanation = `${sortStep}${halves}\n\n${q1Line}\n\n${q3Line}\n\nIQR = Q3 - Q1: \`${num(q3)} - ${num(q1)}\` ${result(exact, rounded)}`;
      candidates = [incl.q3 - incl.q1, s[n - 1] - s[0], q3 + q1, (q3 - q1) / 2]; // other method, the range, added, halved
      hints = [
        sortHint,
        halvesHint,
        `Q1 is the median of the lower half and Q3 the median of the upper half: in each half that is ${halfPos(half)}.`,
        "IQR = Q3 - Q1 (upper quartile minus lower quartile).",
      ];
    }
  }
  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values: { data }, rounded } };
  return { ...finish(base, exact, rounded, candidates, rng, { lo: kind === "range" || kind === "iqr" ? 0 : -Infinity, step: 0.5 }), hints };
}

// Fraction choices in (0, 1), deduped by value.
function fracChoices(N, D, candidates, rng) {
  const [an, ad] = reduce(N, D);
  const answer = `${an}/${ad}`;
  const seenVals = [[an, ad]];
  const out = [];
  const tryAdd = ([n, d]) => {
    if (out.length >= 3 || !Number.isInteger(n) || !Number.isInteger(d) || d <= 0 || n <= 0 || n >= d) return;
    const [rn, rd] = reduce(n, d);
    if (seenVals.some(([sn, sd]) => sn * rd === rn * sd)) return;
    seenVals.push([rn, rd]);
    out.push(`${rn}/${rd}`);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 200; k++) {
    for (const m of [1, 2, 3]) {
      tryAdd([an * m + k, ad * m]);
      tryAdd([an * m - k, ad * m]);
    }
  }
  return { answer, choices: rng.shuffle([answer, ...out]) };
}

const COLOURS = ["red", "blue", "green", "yellow", "white", "black"];

function genProbability(difficulty, rng) {
  checkDifficulty(difficulty);
  // Exact probability is always N/D with whole numbers; params carry the raw counts.
  let kind, values, prompt, N, D, steps, fracCands, decCands, gv, hints;

  const bag = (k) => {
    const cols = rng.shuffle(COLOURS).slice(0, k);
    const counts = cols.map(() => rng.int(1, 9));
    return { cols, counts, total: sum(counts) };
  };
  const bagText = (b) => list(b.cols.map((c, i) => `${b.counts[i]} ${c}`)).replace(/, ([^,]*)$/, " and $1");

  const choose = difficulty === "easy" ? "single" : difficulty === "medium" ? rng.pick(["single", "both", "both"]) : rng.pick(["both", "atleast", "atleast"]);

  if (choose === "single") {
    if (rng.next() < 0.5) {
      const b = bag(3);
      const i = rng.int(0, 2);
      const f = b.counts[i];
      values = { f, t: b.total };
      gv = b.cols.map((c, j) => [`_${c}`, b.counts[j]]); // marbles of each colour
      prompt = `A bag holds ${bagText(b)} marbles. One marble is picked at random. What is the probability that it is ${b.cols[i]}?`;
      steps = [`There are ${b.total} marbles and ${f} of them are ${b.cols[i]}.`, `P = \`${f}/${b.total}\``];
      hints = [
        "Probability = favourable outcomes ÷ all outcomes (every marble is equally likely).",
        `Total marbles: \`${b.cols.map((c) => `_${c}`).join(" + ")} = ${b.counts.join(" + ")} = ${b.total}\`. ${f} of them are ${b.cols[i]}.`,
      ];
    } else {
      const sides = rng.pick([6, 6, 8, 10, 12]);
      const label = rng.pick([
        "an even number",
        "an odd number",
        "a number greater than 4",
        "a number less than 3",
        "a multiple of 3",
        "a prime number",
        "a 6",
        "a number greater than 1",
      ]);
      // Count the favourable outcomes on this die.
      const test = {
        "an even number": (x) => x % 2 === 0,
        "an odd number": (x) => x % 2 === 1,
        "a number greater than 4": (x) => x > 4,
        "a number less than 3": (x) => x < 3,
        "a multiple of 3": (x) => x % 3 === 0,
        "a prime number": (x) => [2, 3, 5, 7, 11].includes(x),
        "a 6": (x) => x === 6,
        "a number greater than 1": (x) => x > 1,
      }[label];
      const outcomes = [];
      for (let x = 1; x <= sides; x++) if (test(x)) outcomes.push(x);
      values = { f: outcomes.length, t: sides };
      prompt = `A fair ${sides}-sided die numbered 1 to ${sides} is rolled once. What is the probability of rolling ${label}?`;
      steps = [`The favourable outcomes are ${list(outcomes)}: ${outcomes.length} out of ${sides}.`, `P = \`${outcomes.length}/${sides}\``];
      hints = [
        `Probability = favourable outcomes ÷ all outcomes. The die has ${sides} equally likely outcomes, 1 to ${sides}.`,
        `List the numbers from 1 to ${sides} that are ${label}${label === "a prime number" ? " (remember 1 is not prime)" : ""}, and count them.`,
      ];
    }
    kind = "single";
    N = values.f;
    D = values.t;
    fracCands = [
      [N, D - N], // odds instead of probability
      [D - N, D], // the complement
      [1, D],
      [N + 1, D],
    ];
  } else if (choose === "both") {
    let f1, t1, f2, t2, story;
    const r = rng.next();
    if (r < 0.34) {
      const b = bag(2);
      const i = rng.int(0, 1);
      f1 = f2 = b.counts[i];
      t1 = t2 = b.total;
      story = `A bag holds ${bagText(b)} marbles. A marble is picked at random, put back, and a second marble is picked. What is the probability that both are ${b.cols[i]}?`;
      gv = b.cols.map((c, j) => [`_${c}`, b.counts[j]]);
    } else if (r < 0.67) {
      const target = rng.int(1, 6);
      f1 = 1;
      t1 = 2;
      f2 = 1;
      t2 = 6;
      const side = rng.pick(["heads", "tails"]);
      story = `A fair coin is tossed and a fair six-sided die is rolled. What is the probability of getting ${side} and a ${target}?`;
    } else {
      const k1 = rng.int(1, 5);
      const k2 = rng.int(1, 5);
      f1 = 6 - k1 + 1;
      t1 = 6;
      f2 = k2;
      t2 = 6;
      story = `Two fair six-sided dice are rolled. What is the probability that the first shows ${k1} or more and the second shows ${k2 === 1 ? "a 1" : `${k2} or less`}?`;
      gv = [["_k1", k1], ["_k2", k2]];
      if (f1 === 6 || f2 === 6) return genProbability(difficulty, rng); // avoid a certain event
    }
    kind = "both";
    values = { f1, t1, f2, t2 };
    hints = [
      "The two events are independent (one doesn't affect the other), so P(both) = P(first) × P(second).",
      `P(first) = ${f1} out of ${t1}, and P(second) = ${f2} out of ${t2}.${gv && gv[0][0] !== "_k1" ? " The marble is put back, so the second pick is just like the first." : ""}`,
    ];
    prompt = story;
    N = f1 * f2;
    D = t1 * t2;
    steps = [
      `The two events are independent, so multiply their probabilities.`,
      `\`${f1}/${t1} × ${f2}/${t2} = ${N}/${D}\``,
    ];
    fracCands = [
      [f1 * t2 + f2 * t1, D], // added them
      [f1 + f2, t1 + t2],
      [Math.min(f1 * t2, f2 * t1), D], // only one event
      [D - N, D],
    ];
  } else {
    // At least one success in n independent tries = 1 - P(no successes).
    let f, t, n, story;
    if (rng.next() < 0.5) {
      t = 6;
      f = rng.int(1, 2);
      n = rng.int(2, 5);
      story = `A fair six-sided die is rolled ${n} times. What is the probability of getting at least one ${f === 1 ? "6" : "5 or 6"}?`;
    } else {
      t = 100;
      f = 5 * rng.int(2, 12);
      n = rng.int(2, 4);
      story = `Each day there is a ${f}% chance of rain, independently of other days. What is the probability that it rains on at least one of the next ${n} days?`;
      gv = [["_pct", f], ["_days", n]];
    }
    kind = "atleast";
    values = { f, t, n };
    const pNone = t === 6 ? `${t - f}/6` : `1 - _pct/100 = ${num((t - f) / t)}`;
    hints = [
      `"At least one" is the opposite of "none", so P(at least one) = 1 - P(none).`,
      `P(none on one ${t === 6 ? "roll" : "day"}) = \`${pNone}\`.`,
      `The ${t === 6 ? "rolls" : "days"} are independent, so P(none in all ${n}) is that raised to the power ${n}${gv ? " (`_days`)" : ""}. Then subtract it from 1 and round to 2 decimal places.`,
    ];
    prompt = story;
    N = t ** n - (t - f) ** n;
    D = t ** n;
    const q = (t - f) / t;
    steps = [
      `"At least one" is the opposite of "none", so P(at least one) = 1 - P(none).`,
      `P(none on one try) = \`${num(q)}\`, so P(none in ${n} tries) = \`${num(q)}^${n} ≈ ${(q ** n).toFixed(4)}\`.`,
      `\`1 - ${(q ** n).toFixed(4)}\``,
    ];
    decCands = [(n * f) / t, (f / t) ** n, q ** n, 1 - q * n];
  }

  // Answer format: easy = fraction; medium = fraction or decimal; hard = decimal for "at least one".
  const asDecimal = kind === "atleast" || (difficulty !== "easy" && rng.next() < 0.4);
  const exact = N / D;
  if (kind === "single") hints.push(asDecimal ? "Divide the favourable count by the total, then round to 2 decimal places." : "Write the favourable count over the total, then simplify the fraction if you can.");
  else if (kind === "both") hints.push(asDecimal ? "Multiply the two probabilities, then round to 2 decimal places." : "Multiply the tops together and the bottoms together, then simplify.");
  if (asDecimal) {
    const shown = fmtAns(exact, true);
    if (shown === "0.00" || shown === "1.00") return genProbability(difficulty, rng); // too close to 0 or 1 to be useful
    steps[steps.length - 1] += ` ${result(exact, true)}`;
    const base = {
      prompt: prompt + DEC_NOTE,
      tolerance: 0.005,
      explanation: steps.join("\n\n"),
      params: { kind, values, format: "decimal" },
      ...givenRows(gv),
    };
    const cands = decCands || (fracCands || []).map(([a, b]) => a / b);
    return { ...finish(base, exact, true, cands, rng, { lo: 0.01, hi: 0.99, step: 0.01 }), hints };
  }
  const answer = fracStr(N, D);
  const [rn, rd] = reduce(N, D);
  steps[steps.length - 1] += rn === N ? ` = **${answer}**` : `, which simplifies to **${answer}** (divide top and bottom by ${N / rn}).`;
  const base = { prompt, tolerance: 0, explanation: steps.join("\n\n"), params: { kind, values, format: "fraction" }, ...givenRows(gv) };
  if (rd === 1 || rn === 0) return genProbability(difficulty, rng);
  if (rng.next() < 0.35) {
    const { answer: a, choices } = fracChoices(N, D, fracCands, rng);
    return { ...base, prompt: prompt + " Choose the answer in simplest form.", answer: a, answerType: "choice", choices, hints };
  }
  return { ...base, prompt: prompt + FRAC_NOTE, answer, answerType: "text", choices: undefined, hints };
}

function genWeighted(difficulty, rng) {
  if (difficulty !== "medium" && difficulty !== "hard") throw new Error(`weighted-average has no "${difficulty}" level`);
  const hard = difficulty === "hard";
  const kind = hard ? rng.pick(["percent", "credits", "required"]) : rng.pick(["percent", "credits"]);
  const rounded = true;
  let prompt, exact, explanation, candidates, values, gv, hints;

  if (kind === "percent" || kind === "required") {
    const names = rng.shuffle(["Homework", "Quizzes", "Project", "Midterm", "Lab work", "Essay"]);
    const k = hard ? 4 : 3;
    // Weights: multiples of 5 summing to 100, each at least 10.
    let weights;
    do {
      weights = [];
      let left = 100;
      for (let i = 0; i < k - 1; i++) {
        const w = 5 * rng.int(2, Math.min(10, Math.floor((left - 10 * (k - 1 - i)) / 5)));
        weights.push(w);
        left -= w;
      }
      weights.push(left);
    } while (weights.some((w) => w < 10));
    if (kind === "required") {
      const parts = names.slice(0, k - 1);
      const scores = parts.map(() => rng.int(50, 100));
      const wf = weights[k - 1];
      const partial = sum(scores.map((s, i) => s * weights[i]));
      let T, need;
      let tries = 0;
      do {
        T = rng.int(60, 90);
        need = (100 * T - partial) / wf;
        tries++;
      } while ((need < 0 || need > 100) && tries < 50);
      if (need < 0 || need > 100) return genWeighted(difficulty, rng);
      values = { weights, scores, target: T };
      // _w4 is the final exam's weight: 4 weights + 3 scores + target = 8 rows.
      gv = [...weights.map((w, i) => [`_w${i + 1}`, w]), ...scores.map((x, i) => [`_s${i + 1}`, x]), ["_target", T]];
      exact = need;
      prompt =
        `A course grade is ${list(parts.map((p, i) => `${p} ${weights[i]}%`))} and Final exam ${wf}%. ` +
        `A student scored ${list(parts.map((p, i) => `${scores[i]} on ${p}`))}. ` +
        `What score on the final exam gives an overall grade of exactly ${T}?${ROUND_IF}`;
      explanation =
        `Overall = sum of (weight × score) / 100. Set it equal to ${T}:\n\n` +
        `\`${parts.map((_, i) => `${weights[i]} × ${scores[i]}`).join(" + ")} + ${wf} × x = 100 × ${T}\`\n\n` +
        `\`${partial} + ${wf}x = ${100 * T}\`, so \`x = (${100 * T} - ${partial}) / ${wf} = ${100 * T - partial} / ${wf}\` ${result(exact, rounded)}`;
      candidates = [T, k * T - sum(scores), (100 * T - partial) / 100, 2 * T - sum(scores) / (k - 1)]; // the target itself, weights ignored, forgot to divide by the weight, averaged
      hints = [
        `Call the final exam score x. Overall = (sum of weight × score) ÷ 100, and you want that to equal \`_target\` = ${T}.`,
        `The parts you know: \`${parts.map((_, i) => `_w${i + 1} × _s${i + 1}`).join(" + ")} = ${partial}\`. The target total is \`100 × _target = ${100 * T}\`.`,
        `So \`${partial} + ${wf}x = ${100 * T}\`: take ${partial} from both sides, then divide by \`_w${k}\` (${wf}). Round to 2 decimal places if needed.`,
      ];
      const base = { prompt, tolerance: 0.005, explanation, params: { kind, values, rounded }, ...givenRows(gv) };
      return { ...finish(base, exact, rounded, candidates, rng, { lo: 0, hi: 100, step: 1 }), hints };
    }
    const parts = names.slice(0, k);
    const scores = parts.map(() => rng.int(40, 100));
    values = { weights, scores };
    gv = [...weights.map((w, i) => [`_w${i + 1}`, w]), ...scores.map((x, i) => [`_s${i + 1}`, x])];
    const total = sum(scores.map((s, i) => s * weights[i]));
    exact = total / 100;
    prompt = `A course grade is made up of ${list(parts.map((p, i) => `${p} (${weights[i]}%)`))}. A student scored ${list(parts.map((p, i) => `${scores[i]} on ${p}`))}. What is the overall grade?${ROUND_IF}`;
    explanation =
      `Weighted average = sum of (weight × score) / sum of weights.\n\n` +
      `\`(${parts.map((_, i) => `${weights[i]} × ${scores[i]}`).join(" + ")}) / 100 = ${total} / 100\` ${result(exact, rounded)}`;
    candidates = [sum(scores) / k, total, sum(scores.map((s, i) => s * weights[k - 1 - i])) / 100]; // plain mean, forgot /100, weights mismatched
    hints = [
      "Weighted average = (sum of weight × score) ÷ (sum of the weights). The percentage weights add up to 100.",
      `Multiply each score by its weight: ${parts.map((_, i) => `\`_w${i + 1} × _s${i + 1} = ${weights[i]} × ${scores[i]} = ${weights[i] * scores[i]}\``).join(", ")}.`,
      "Add those products, then divide by 100. Round to 2 decimal places if needed.",
    ];
  } else {
    // Credits: weights don't add up to 100, so divide by the total credits.
    const k = hard ? rng.int(4, 5) : 3;
    const courses = rng.shuffle(["Math", "English", "History", "Biology", "Art", "Chemistry"]).slice(0, k);
    const credits = courses.map(() => rng.int(1, 5));
    const grades = courses.map(() => (hard ? rng.int(0, 8) / 2 : rng.int(1, 4))); // grade points 0–4
    values = { weights: credits, scores: grades };
    gv = [...credits.map((c, i) => [`_c${i + 1}`, c]), ...grades.map((g, i) => [`_g${i + 1}`, g])]; // 5 courses = 10 rows: skipped
    const total = sum(grades.map((g, i) => g * credits[i]));
    const cr = sum(credits);
    exact = total / cr;
    prompt = `A student's grade points (out of 4) and course credits are: ${list(courses.map((c, i) => `${c} ${num(grades[i])} (${credits[i]} credit${credits[i] === 1 ? "" : "s"})`))}. What is the credit-weighted grade point average?${ROUND_IF}`;
    explanation =
      `Weighted average = sum of (credits × grade) / total credits.\n\n` +
      `\`(${courses.map((_, i) => `${credits[i]} × ${num(grades[i])}`).join(" + ")}) / (${credits.join(" + ")}) = ${num(total)} / ${cr}\` ${result(exact, rounded)}`;
    candidates = [sum(grades) / k, total / k, total];
    const lab = gv.length <= 8; // the calculator only gets the rows when there are at most 8
    hints = [
      "Credit-weighted GPA = (sum of credits × grade) ÷ (total credits). Divide by the credits, not by the number of courses.",
      `Multiply each grade by its credits: ${courses.map((_, i) => `\`${lab ? `_c${i + 1} × _g${i + 1} = ` : ""}${credits[i]} × ${num(grades[i])} = ${num(credits[i] * grades[i])}\``).join(", ")}.`,
      `Add those products, then divide by the total credits, \`${credits.join(" + ")} = ${cr}\`. Round to 2 decimal places if needed.`,
    ];
  }
  const base = { prompt, tolerance: 0.005, explanation, params: { kind, values, rounded }, ...givenRows(gv) };
  return { ...finish(base, exact, rounded, candidates, rng, { lo: 0, step: kind === "credits" ? 0.1 : 1 }), hints };
}

// ---- Expert: multi-step questions (easy/medium/hard above are untouched) ----
//
// Every template draws its rng values first (retrying inside the template when needed), then
// builds text. Hints use only values already drawn (no rng) and never state a final answer.
// Params use "x-" kinds, which verify() routes to verifyExpert().

const isTie2 = (x) => Math.abs(((Math.abs(x) * 100) % 1) - 0.5) < 1e-6; // exactly halfway at the 3rd decimal
const dp = (x) => fmtAns(x, true); // "12", "12.5" -> "12.50", "12.33"
const X_ROUND = "round to 2 decimal places if it is not a whole number";
const NAMES = ["Ava", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Hugo", "Isla", "Jay", "Kofi", "Lena", "Mia", "Noah"];
const xGiven = (pairs) => ({ given: pairs.map(([label, value]) => ({ label, value })) });

const SCORE_CTX = [
  { items: "tests", item: "test", what: "score", lo: 20, hi: 100, mLo: 50, mHi: 85 },
  { items: "basketball games", item: "game", what: "points", lo: 0, hi: 45, mLo: 8, mHi: 28 },
  { items: "darts rounds", item: "round", what: "score", lo: 10, hi: 180, mLo: 50, mHi: 120 },
  { items: "spelling quizzes", item: "quiz", what: "score", lo: 0, hi: 50, mLo: 20, mHi: 40 },
];

// mean-median-mode / expert, template 0: working backwards from a changing mean (multi-part).
function genXRunningMean(rng) {
  const ctx = rng.pick(SCORE_CTX);
  const name = rng.pick(NAMES);
  let n, m, m2, m3, a, b;
  for (let t = 0; ; t++) {
    n = rng.int(3, 8);
    m = rng.int(ctx.mLo, ctx.mHi);
    const d1 = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4, 5]);
    const d2 = rng.int(1, 4);
    m2 = m + d1;
    m3 = m2 + d2;
    a = (n + 1) * m2 - n * m;
    b = (n + 2) * m3 - (n + 1) * m2;
    if ((a >= ctx.lo && a <= ctx.hi && b >= ctx.lo && b <= ctx.hi && a !== b) || t > 400) break;
  }
  if (!(a >= ctx.lo && a <= ctx.hi && b >= ctx.lo && b <= ctx.hi)) {
    // fallback (never seen in testing): small steps keep both scores in range
    n = 3; m = ctx.mLo; m2 = m + 1; m3 = m2 + 1;
    a = (n + 1) * m2 - n * m;
    b = (n + 2) * m3 - (n + 1) * m2;
  }
  const prompt =
    `${name}'s mean ${ctx.what} over the first ${n} ${ctx.items} is ${m}. After ${ctx.item} ${n + 1}, the mean is ${m2}. ` +
    `${name} wants the mean after ${ctx.item} ${n + 2} to be exactly ${m3}.`;
  const steps = [
    `Mean × count = total. After ${n} ${ctx.items}: \`_n × _m = ${n} × ${m} = ${n * m}\`.`,
    `After ${n + 1}: \`${n + 1} × ${m2} = ${(n + 1) * m2}\`, so ${ctx.item} ${n + 1} scored \`${(n + 1) * m2} - ${n * m}\` = **${a}**.`,
    `After ${n + 2} the total must be \`${n + 2} × ${m3} = ${(n + 2) * m3}\`, so ${ctx.item} ${n + 2} needs \`${(n + 2) * m3} - ${(n + 1) * m2}\` = **${b}**.`,
  ];
  return {
    prompt,
    answerType: "multi",
    parts: [
      { id: "next", label: `${ctx.item[0].toUpperCase()}${ctx.item.slice(1)} ${n + 1}`, ask: `What was the ${ctx.what} in ${ctx.item} ${n + 1}?`, answerType: "number", answer: a, tolerance: 0,
        hint: `Work out the total before and after ${ctx.item} ${n + 1} (mean × count); the difference is that ${ctx.item}'s ${ctx.what}.` },
      { id: "needed", label: `${ctx.item[0].toUpperCase()}${ctx.item.slice(1)} ${n + 2}`, ask: `What ${ctx.what} is needed in ${ctx.item} ${n + 2}?`, answerType: "number", answer: b, tolerance: 0,
        hint: `The target total after ${n + 2} ${ctx.items} is \`${n + 2} × _m3\`. Subtract the total you already have after ${n + 1}.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-running", values: { n, m, m2, m3 } },
    ...xGiven([["_n", n], ["_m", m], ["_m2", m2], ["_m3", m3]]),
    hints: [
      "Don't average the means. Turn each mean into a total: total = mean × number of values.",
      `Total after ${n} ${ctx.items}: \`_n × _m = ${n * m}\`. Total after ${n + 1}: \`(_n + 1) × _m2 = ${(n + 1) * m2}\`.`,
      `Each new ${ctx.item}'s ${ctx.what} is the jump in the total. For the last part, the total after ${n + 2} must be \`(_n + 2) × _m3 = ${(n + 2) * m3}\`.`,
    ],
  };
}

// mean-median-mode / expert, template 1: an unknown value from the mean, then the median (multi-part).
function genXMissing(rng) {
  const n = rng.int(6, 10);
  const lo = rng.pick([1, 5, 10]);
  const hi = lo + rng.pick([30, 40, 50]);
  const others = [];
  for (let i = 0; i < n - 1; i++) others.push(rng.int(lo, hi));
  const S = sum(others);
  const opts = [];
  for (let v = lo; v <= hi; v++) if ((S + v) % n === 0) opts.push(v);
  const x = rng.pick(opts);
  const pos = rng.int(0, n - 1);
  const M = (S + x) / n;
  const shown = others.slice(0, pos).map(String).concat(["x"], others.slice(pos).map(String));
  const full = sorted([...others, x]);
  const med = medianOf(full);
  const steps = [
    `Total = mean × count: \`_mean × _n = ${M} × ${n} = ${M * n}\`.`,
    `The other ${n - 1} values add up to ${S}, so \`x = ${M * n} - ${S}\` = **${x}**.`,
    `Sorted, with x in place: ${list(full)}. ${n % 2 ? `The median is the ${ord((n + 1) / 2)} value` : `The median is halfway between the ${ord(n / 2)} and ${ord(n / 2 + 1)} values`} = **${dp(med)}**.`,
  ];
  return {
    prompt: `These ${n} values have a mean of ${M}: ${shown.join(", ")}.`,
    answerType: "multi",
    parts: [
      { id: "x", label: "Missing value", ask: "Value of x", answerType: "number", answer: x, tolerance: 0,
        hint: "x = (mean × count) - (sum of the values you can see)." },
      { id: "median", label: "Median", ask: `The median of all ${n} values (${X_ROUND})`, answerType: "number", answer: round2(med), tolerance: 0.005,
        hint: `Put x into the list, sort all ${n} values, then find the middle${n % 2 ? " one" : " pair and go halfway between them"}.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-missing", values: { others, mean: M } },
    ...xGiven([["_mean", M], ["_n", n]]),
    hints: [
      `The mean tells you the total: \`_mean × _n = ${M * n}\`.`,
      `The values you can see add up to ${S}. The rest of the total belongs to x.`,
      "Once you know x, the median needs the full list sorted, including x.",
    ],
  };
}

// mean-median-mode / expert, template 2: correcting a mean after a copying mistake (multi-part).
function genXCorrection(rng) {
  const n = rng.int(8, 30);
  const m = rng.int(40, 80);
  let c, w, swapped, mean;
  for (let t = 0; ; t++) {
    const d1 = rng.int(1, 9);
    let d2 = rng.int(0, 9);
    if (d2 === d1) d2 = (d2 + 3) % 10;
    swapped = rng.next() < 0.6;
    c = 10 * d1 + d2;
    w = swapped ? 10 * d2 + d1 : rng.int(10, 99);
    mean = (n * m - w + c) / n;
    if ((w !== c && w >= 10 && !isTie2(mean)) || t > 50) break;
  }
  if (w === c || w < 10 || isTie2(mean)) { c = 47; w = 74; mean = (n * m - w + c) / n; swapped = true; }
  const T = n * m - w + c;
  const why = swapped ? "the digits were swapped: " : "";
  const steps = [
    `The wrong total is \`_n × _m = ${n} × ${m} = ${n * m}\`.`,
    `Take out the wrong mark and put in the right one: \`${n * m} - ${w} + ${c}\` = **${T}**.`,
    `Correct mean = \`${T} / ${n}\` ${result(mean, true)}.`,
  ];
  return {
    prompt: `A teacher worked out the mean of ${n} marks as ${m}. Later she found that one mark had been copied wrongly (${why}it was recorded as ${w} instead of ${c}).`,
    answerType: "multi",
    parts: [
      { id: "total", label: "Correct total", ask: "The correct total of all the marks", answerType: "number", answer: T, tolerance: 0,
        hint: `Start from the wrong total (mean × count), then swap ${w} for ${c}.` },
      { id: "mean", label: "Correct mean", ask: `The correct mean (${X_ROUND})`, answerType: "number", answer: round2(mean), tolerance: 0.005,
        hint: `Divide the correct total by the number of marks, ${n}.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-correct", values: { n, m, w, c } },
    ...xGiven([["_n", n], ["_m", m], ["_wrong", w], ["_right", c]]),
    hints: [
      "The mean came from a total. Rebuild the total that was used: mean × count.",
      `That total includes ${w}, which should have been ${c}. Correct the total first: \`_n × _m - _wrong + _right\`.`,
      `Then divide by the count (${n}). The count doesn't change: one mark was wrong, not missing.`,
    ],
  };
}

// range-iqr / expert, template 0: outliers by the 1.5 × IQR rule (multi-part).
function genXOutliers(rng) {
  let data, q1, q3, iqr, loF, hiF, outs;
  for (let t = 0; ; t++) {
    const n = rng.int(9, 12);
    const base = [];
    for (let i = 0; i < n; i++) base.push(rng.int(20, 60));
    const s = sorted(base);
    const qs = quartiles(s);
    q1 = qs.q1;
    q3 = qs.q3;
    iqr = q3 - q1;
    loF = q1 - 1.5 * iqr;
    hiF = q3 + 1.5 * iqr;
    const up = rng.next() < 0.75;
    const down = !up || rng.next() < 0.35;
    // Replacing the very largest / smallest value keeps both quartiles (each half has 4+ values).
    if (up) s[n - 1] = Math.ceil(hiF) + rng.int(1, 25);
    if (down && Math.floor(loF) - 1 >= 0) s[0] = Math.max(0, Math.floor(loF) - rng.int(1, 15));
    data = rng.shuffle(s);
    outs = data.filter((v) => v < loF || v > hiF).length;
    const onFence = data.some((v) => v === loF || v === hiF);
    const ok = iqr > 0 && outs >= 1 && !onFence && quartiles(sorted(data)).q1 === q1 && quartiles(sorted(data)).q3 === q3;
    if (ok || t > 200) break;
  }
  const n = data.length;
  const s = sorted(data);
  const { lower, upper } = quartiles(s);
  const steps = [
    `Sort: ${list(s)}.`,
    `${n % 2 ? `Leave out the middle value (${s[(n - 1) / 2]}). ` : ""}Lower half: ${list(lower)}, so Q1 = ${num(q1)}. Upper half: ${list(upper)}, so Q3 = ${num(q3)}.`,
    `IQR = \`${num(q3)} - ${num(q1)}\` = **${dp(iqr)}**.`,
    `Lower fence = \`Q1 - 1.5 × IQR = ${num(q1)} - ${num(1.5 * iqr)}\` = **${dp(loF)}**. Upper fence = \`Q3 + 1.5 × IQR = ${num(q3)} + ${num(1.5 * iqr)}\` = **${dp(hiF)}**.`,
    `Values below ${num(loF)} or above ${num(hiF)}: ${list(s.filter((v) => v < loF || v > hiF))}, so there ${outs === 1 ? "is **1** outlier" : `are **${outs}** outliers`}.`,
  ];
  return {
    prompt:
      `Here are ${n} values: ${list(data)}.${QUARTILE_METHOD} ` +
      "A value is an outlier if it is more than 1.5 × IQR below Q1 or more than 1.5 × IQR above Q3.",
    answerType: "multi",
    parts: [
      { id: "iqr", label: "IQR", ask: `The interquartile range (${X_ROUND})`, answerType: "number", answer: round2(iqr), tolerance: 0.005,
        hint: `Sort first, then split into halves of ${Math.floor(n / 2)}. IQR = Q3 - Q1.` },
      { id: "low", label: "Lower fence", ask: `Q1 - 1.5 × IQR (${X_ROUND})`, answerType: "number", answer: round2(loF), tolerance: 0.005,
        hint: "Multiply the IQR by 1.5 and subtract it from Q1. The fence can be negative." },
      { id: "high", label: "Upper fence", ask: `Q3 + 1.5 × IQR (${X_ROUND})`, answerType: "number", answer: round2(hiF), tolerance: 0.005,
        hint: "Multiply the IQR by 1.5 and add it to Q3." },
      { id: "outliers", label: "Outliers", ask: "How many of the values are outliers?", answerType: "number", answer: outs, tolerance: 0,
        hint: "Count the values strictly below the lower fence or strictly above the upper fence. Check both ends." },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-outliers", values: { data } },
    hints: [
      `Sort the ${n} values${n % 2 ? `, leave out the middle one,` : ""} and split them into a lower and upper half of ${Math.floor(n / 2)} each.`,
      "Q1 and Q3 are the medians of the halves; IQR = Q3 - Q1.",
      "The fences are 1.5 × IQR beyond the quartiles: below Q1 and above Q3. Anything outside them is an outlier.",
    ],
  };
}

// range-iqr / expert, template 1: working backwards from the IQR to a missing value (multi-part).
function genXIqrBack(rng) {
  let s, idx, which, iqr, mean;
  for (let t = 0; ; t++) {
    const n = rng.int(8, 11);
    s = [rng.int(1, 20)];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + rng.int(1, 7));
    const half = Math.floor(n / 2);
    const posOf = (from) => (half % 2 ? [from + (half - 1) / 2] : [from + half / 2 - 1, from + half / 2]);
    which = rng.next() < 0.5 ? "q1" : "q3";
    idx = rng.pick(posOf(which === "q1" ? 0 : n - half));
    const qs = quartiles(s);
    iqr = qs.q3 - qs.q1;
    mean = sum(s) / n;
    if (!isTie2(mean) || t > 50) break;
  }
  const n = s.length;
  const x = s[idx];
  const shown = s.map((v, i) => (i === idx ? "x" : String(v)));
  const { lower, upper, q1, q3 } = quartiles(s);
  const known = which === "q1" ? q3 : q1;
  const target = which === "q1" ? q3 - iqr : q1 + iqr;
  const half = Math.floor(n / 2);
  const pair = half % 2 === 0;
  const steps = [
    `${n % 2 ? `There are ${n} values, so leave out the middle one. ` : ""}Lower half: ${lower.map((v, i) => (i === idx ? "x" : v)).join(", ")}. Upper half: ${upper.map((v, i) => (n - half + i === idx ? "x" : v)).join(", ")}.`,
    `${which === "q1" ? `Q3 = ${num(q3)} (x isn't in the upper half), so Q1 = Q3 - IQR = \`${num(q3)} - ${num(iqr)}\` = ${num(q1)}.` : `Q1 = ${num(q1)} (x isn't in the lower half), so Q3 = Q1 + IQR = \`${num(q1)} + ${num(iqr)}\` = ${num(q3)}.`}`,
    pair
      ? `${which.toUpperCase()} is halfway between x and its neighbour in the middle of that half, so x = 2 × ${num(target)} - ${idx === (which === "q1" ? half / 2 - 1 : n - half + half / 2 - 1) ? s[idx + 1] : s[idx - 1]} = **${x}**.`
      : `${which.toUpperCase()} is the middle value of that half, which is x itself: **${x}**.`,
    `Mean = \`${sum(s)} / ${n}\` ${result(mean, true)}.`,
  ];
  return {
    prompt: `These ${n} values are in order from smallest to largest: ${shown.join(", ")}. Their interquartile range is ${num(iqr)}.${QUARTILE_METHOD}`,
    answerType: "multi",
    parts: [
      { id: "x", label: "Missing value", ask: "Value of x", answerType: "number", answer: x, tolerance: 0,
        hint: `x sits in the ${which === "q1" ? "lower" : "upper"} half, so it affects ${which === "q1" ? "Q1" : "Q3"}. Find the other quartile first.` },
      { id: "mean", label: "Mean", ask: `The mean of all ${n} values (${X_ROUND})`, answerType: "number", answer: round2(mean), tolerance: 0.005,
        hint: `Add all ${n} values, with x filled in, and divide by ${n}.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-iqrback", values: { shown, iqr } },
    hints: [
      `Split the ${n} values into halves of ${half}${n % 2 ? " (leaving out the middle value)" : ""}. Which half contains x?`,
      `The other quartile doesn't involve x: ${which === "q1" ? `Q3 = ${num(known)}` : `Q1 = ${num(known)}`}. Use the IQR to find ${which === "q1" ? "Q1 = Q3 - IQR" : "Q3 = Q1 + IQR"}.`,
      pair
        ? `In that half, ${which.toUpperCase()} is halfway between two middle values, and x is one of them: x = 2 × ${which.toUpperCase()} - (the other one).`
        : `In that half, ${which.toUpperCase()} is the single middle value.`,
    ],
  };
}

const TABLES = [
  { who: "students", rows: ["Year 10", "Year 11"], cols: ["Walk", "Bus", "Car"], verb: "travel to school by", rowQ: (r) => `in ${r}`, colQ: (c) => `travels by ${c.toLowerCase()}`, colIs: (c) => (c === "Walk" ? "walks" : `travels by ${c.toLowerCase()}`) },
  { who: "visitors", rows: ["Adults", "Children"], cols: ["Swimming", "Gym", "Tennis"], verb: "chose", rowQ: (r) => `is ${r === "Adults" ? "an adult" : "a child"}`, colQ: (c) => `chose ${c.toLowerCase()}`, colIs: (c) => `chose ${c.toLowerCase()}` },
  { who: "orders", rows: ["Morning", "Afternoon"], cols: ["Tea", "Coffee", "Juice"], verb: "were for", rowQ: (r) => `was placed in the ${r.toLowerCase()}`, colQ: (c) => `is for ${c.toLowerCase()}`, colIs: (c) => `is for ${c.toLowerCase()}` },
  { who: "members", rows: ["Under 30", "30 and over"], cols: ["Fiction", "History", "Science"], verb: "prefer", rowQ: (r) => `is ${r.toLowerCase()}`, colQ: (c) => `prefers ${c.toLowerCase()}`, colIs: (c) => `prefers ${c.toLowerCase()}` },
];

// probability / expert, template 0: two-way table with a missing cell, then conditional probability.
function genXTable(rng) {
  const ctx = rng.pick(TABLES);
  let cells, hr, hc, c2, r3, c3;
  for (let t = 0; ; t++) {
    cells = ctx.rows.map(() => ctx.cols.map(() => rng.int(3, 30)));
    hr = rng.int(0, 1);
    hc = rng.int(0, 2);
    c2 = rng.int(0, 2);
    r3 = rng.int(0, 1);
    c3 = rng.next() < 0.6 ? hc : rng.int(0, 2);
    const colT = cells[0][c2] + cells[1][c2];
    const grand = sum(cells.flat());
    const pA = reduce(colT, grand);
    const pB = reduce(cells[r3][c3], cells[0][c3] + cells[1][c3]);
    if ((pA[1] > 1 && pB[1] > 1) || t > 50) break;
  }
  const rowT = cells.map((r) => sum(r));
  const colT = ctx.cols.map((_, j) => cells[0][j] + cells[1][j]);
  const grand = sum(rowT);
  const missing = cells[hr][hc];
  const cellTxt = (i, j) => (i === hr && j === hc ? "?" : String(cells[i][j]));
  const table = [
    `| | ${ctx.cols.join(" | ")} | Total |`,
    `| --- | ${ctx.cols.map(() => "---").join(" | ")} | --- |`,
    ...ctx.rows.map((r, i) => `| ${r} | ${ctx.cols.map((_, j) => cellTxt(i, j)).join(" | ")} | ${rowT[i]} |`),
    `| Total | ${colT.join(" | ")} | ${grand} |`,
  ].join("\n");
  const pA = fracStr(colT[c2], grand);
  const pB = fracStr(cells[r3][c3], colT[c3]);
  const one = ctx.who.replace(/s$/, "");
  const steps = [
    `The ${ctx.rows[hr]} row total is ${rowT[hr]}, so ? = \`${rowT[hr]} - ${ctx.cols.map((_, j) => (j === hc ? null : cells[hr][j])).filter((v) => v !== null).join(" - ")}\` = **${missing}**. (Check with the column: \`${colT[hc]} - ${cells[1 - hr][hc]} = ${missing}\`.)`,
    `${ctx.cols[c2]}: ${colT[c2]} out of ${grand}, so P = \`${colT[c2]}/${grand}\`${pA === `${colT[c2]}/${grand}` ? "" : `, which simplifies to`} **${pA}**.`,
    `Given ${ctx.cols[c3]}, only that column counts: ${cells[r3][c3]} of its ${colT[c3]} ${ctx.who} are in ${ctx.rows[r3]}, so P = \`${cells[r3][c3]}/${colT[c3]}\`${pB === `${cells[r3][c3]}/${colT[c3]}` ? "" : `, which simplifies to`} **${pB}**.`,
  ];
  return {
    prompt: `The table shows ${grand} ${ctx.who}; one cell is missing. One of the ${ctx.who} is picked at random.\n\n${table}`,
    answerType: "multi",
    parts: [
      { id: "missing", label: "Missing count", ask: "The missing number (?)", answerType: "number", answer: missing, tolerance: 0,
        hint: `Use the ${ctx.rows[hr]} row: its total minus the other two cells in that row.` },
      { id: "p", label: `P(${ctx.cols[c2]})`, ask: `Probability that the ${one} ${ctx.colIs(ctx.cols[c2])}, as a fraction in simplest form like 3/8`, answerType: "text", answer: pA,
        hint: `Use the ${ctx.cols[c2]} column total over the grand total, ${grand}. Simplify.` },
      { id: "cond", label: "Conditional", ask: `Given that the ${one} ${ctx.colIs(ctx.cols[c3])}, the probability that it is in the ${ctx.rows[r3]} row, as a fraction in simplest form`, answerType: "text", answer: pB,
        hint: `"Given that" shrinks the group to the ${ctx.cols[c3]} column only: use that column's total as the bottom of the fraction.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-table", values: { shown: ctx.rows.map((_, i) => ctx.cols.map((_, j) => (i === hr && j === hc ? null : cells[i][j]))), rowT, colT, grand, c2, r3, c3 } },
    ...xGiven([["_rowTotal", rowT[hr]], ["_colTotal", colT[hc]], ["_total", grand]]),
    hints: [
      "Each row adds up to its row total, and each column to its column total. One subtraction finds the missing cell.",
      `P(${ctx.cols[c2]}) = (${ctx.cols[c2]} column total) ÷ (grand total).`,
      `For "given that", divide by the total of the group you were given (the ${ctx.cols[c3]} column, ${colT[c3]}), not by ${grand}.`,
    ],
  };
}

const SPIN_CTX = [
  { thing: "spinner", act: "spun", trials: "spins", event: (c) => `lands on ${c}`, outcomes: ["red", "blue", "green", "yellow"] },
  { thing: "drawing pin", act: "dropped", trials: "drops", event: (c) => `lands ${c}`, outcomes: ["point up", "point down"] },
  { thing: "biased die", act: "rolled", trials: "rolls", event: (c) => `shows a ${c}`, outcomes: ["6", "1", "4"] },
];

// probability / expert, template 1: pooling two experiments into one relative-frequency estimate (multi-part).
function genXPooled(rng) {
  const ctx = rng.pick(SPIN_CTX);
  const out = rng.pick(ctx.outcomes);
  const [p1, p2] = rng.shuffle(NAMES).slice(0, 2);
  let n1, n2, k1, k2, M, N, K, rn, rd;
  for (let t = 0; ; t++) {
    n1 = 10 * rng.int(2, 10);
    n2 = 10 * rng.int(2, 10);
    const p = rng.int(10, 60) / 100;
    k1 = Math.max(1, Math.min(n1 - 1, Math.round(n1 * p + rng.int(-4, 4))));
    k2 = Math.max(1, Math.min(n2 - 1, Math.round(n2 * p + rng.int(-4, 4))));
    N = n1 + n2;
    K = k1 + k2;
    [rn, rd] = reduce(K, N);
    if ((rd > 1 && rd <= 100 && fracStr(k1, n1) !== fracStr(K, N)) || t > 50) break;
  }
  M = rd * rng.int(Math.ceil(200 / rd), Math.max(Math.ceil(200 / rd), Math.floor(2000 / rd)));
  const exp = (M / rd) * rn;
  const steps = [
    `Pool both experiments: ${k1} + ${k2} = ${K} out of ${n1} + ${n2} = ${N} ${ctx.trials}.`,
    `Estimate = \`${K}/${N}\`${fracStr(K, N) === `${K}/${N}` ? "" : ", which simplifies to"} **${fracStr(K, N)}**. More trials give a better estimate, so use all of them.`,
    `Expected count in ${M} ${ctx.trials}: \`${M} × ${K}/${N}\` = **${exp}**.`,
  ];
  return {
    prompt: `${p1} ${ctx.act} a ${ctx.thing} ${n1} times and it ${ctx.event(out)} ${k1} times. ${p2} ${ctx.act} the same ${ctx.thing} ${n2} times and it ${ctx.event(out)} ${k2} times. Next, the ${ctx.thing} will be ${ctx.act} another ${M} times.`,
    answerType: "multi",
    parts: [
      { id: "p", label: "Best estimate", ask: `Best estimate of the probability that it ${ctx.event(out)}, using all the results, as a fraction in simplest form like 3/8`, answerType: "text", answer: fracStr(K, N),
        hint: "Add the successes together and the trials together before dividing; don't average the two fractions." },
      { id: "expected", label: "Expected count", ask: `How many times would you expect it to ${ctx.event(out).replace(/^lands/, "land").replace(/^shows/, "show")} in ${M} ${ctx.trials}?`, answerType: "number", answer: exp, tolerance: 0,
        hint: `Expected count = number of ${ctx.trials} × estimated probability.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-pooled", values: { n1, n2, k1, k2, M } },
    ...xGiven([["_n1", n1], ["_k1", k1], ["_n2", n2], ["_k2", k2], ["_trials", M]]),
    hints: [
      "Relative frequency = successes ÷ trials. The best estimate uses every trial you have.",
      `In total: \`_k1 + _k2\` successes out of \`_n1 + _n2\` trials. Simplify that fraction.`,
      `Then multiply the estimate by \`_trials\` (${M}).`,
    ],
  };
}

// weighted-average / expert, template 0: reverse a combined mean, then add one more value (multi-part).
function genXClasses(rng) {
  let nA, nB, mA, mB, M, s, after;
  for (let t = 0; ; t++) {
    nA = rng.int(10, 30);
    nB = rng.int(8, 30);
    mA = rng.int(50, 85);
    do mB = rng.int(45, 90); while (mB === mA);
    M = (nA * mA + nB * mB) / (nA + nB);
    if (Number.isInteger(Math.round(M * 100 * 1e6) / 1e6) || t > 300) break;
  }
  if (!Number.isInteger(Math.round(M * 100 * 1e6) / 1e6)) { nB = nA; M = (mA + mB) / 2; }
  M = Math.round(M * 100) / 100;
  for (let t = 0; ; t++) {
    s = rng.int(30, 100);
    after = (M * (nA + nB) + s) / (nA + nB + 1);
    if (!isTie2(after) || t > 30) break;
  }
  const N = nA + nB;
  const steps = [
    `Combined total = \`_M × (_nA + _nB) = ${num(M)} × ${N}\` = ${num(M * N)}. Class A's total = \`${nA} × ${mA}\` = ${nA * mA}.`,
    `Class B's total = \`${num(M * N)} - ${nA * mA}\` = ${num(M * N - nA * mA)}, so its mean = \`${num(M * N - nA * mA)} / ${nB}\` = **${mB}**.`,
    `With the new student: \`(${num(M * N)} + ${s}) / ${N + 1}\` ${result(after, true)}.`,
  ];
  return {
    prompt: `Class A has ${nA} students with a mean score of ${mA}. Class B has ${nB} students. The mean score of all ${N} students together is ${num(M)}. Then a new student who scored ${s} joins class B.`,
    answerType: "multi",
    parts: [
      { id: "meanB", label: "Class B mean", ask: "Class B's mean score before the new student joined", answerType: "number", answer: mB, tolerance: 0,
        hint: "Total of everyone minus class A's total leaves class B's total. Divide by class B's size." },
      { id: "after", label: "New overall mean", ask: `The mean of all ${N + 1} students after the new student joins (${X_ROUND})`, answerType: "number", answer: round2(after), tolerance: 0.005,
        hint: `Add the new score to the combined total and divide by ${N + 1}.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-classes", values: { nA, mA, nB, M, s } },
    ...xGiven([["_nA", nA], ["_mA", mA], ["_nB", nB], ["_M", M], ["_s", s]]),
    hints: [
      "A combined mean is a weighted average of the class means, weighted by class size. Work with totals (mean × count).",
      `Total for everyone: \`_M × (_nA + _nB)\`. Total for class A: \`_nA × _mA = ${nA * mA}\`.`,
      "Class B's mean is its total divided by its size. For the last part, the new student adds one score and one person.",
    ],
  };
}

// weighted-average / expert, template 1: find the weight from a result, then use it (multi-part).
function genXFindWeight(rng) {
  let c, e, w, g, c2, T, need;
  for (let t = 0; ; t++) {
    c = rng.int(40, 95);
    do e = rng.int(30, 98); while (Math.abs(e - c) < 8);
    w = 5 * rng.int(4, 14);
    g = (c * (100 - w) + e * w) / 100;
    c2 = rng.int(40, 95);
    T = rng.int(50, 85);
    need = (100 * T - (100 - w) * c2) / w;
    if ((need >= 0 && need <= 100 && !isTie2(need) && c2 !== c) || t > 300) break;
  }
  if (!(need >= 0 && need <= 100) || isTie2(need)) { c2 = T; need = T; }
  const name = rng.pick(NAMES);
  const steps = [
    `Let the exam weight be w%. Then \`${c} × (100 - w) + ${e} × w = 100 × ${num(g)}\`.`,
    `\`${100 * c} + ${e - c}w = ${num(100 * g)}\`, so \`w = ${num(100 * g - 100 * c)} / ${e - c}\` = **${w}**. Coursework is worth ${100 - w}%.`,
    `For a total of ${T}: \`${100 - w} × ${c2} + ${w}x = 100 × ${T}\`, so \`x = (${100 * T} - ${(100 - w) * c2}) / ${w}\` ${result(need, true)}.`,
  ];
  return {
    prompt: `A course grade is a weighted average of coursework and a final exam. ${name} scored ${c} on coursework and ${e} on the exam, and got an overall grade of ${num(g)}. Another student scored ${c2} on coursework and wants an overall grade of exactly ${T}.`,
    answerType: "multi",
    parts: [
      { id: "weight", label: "Exam weight", ask: "What percentage of the grade is the exam worth?", answerType: "number", answer: w, tolerance: 0,
        hint: `Write the overall grade with the exam weight as w% and coursework as (100 - w)%, then solve for w.` },
      { id: "needed", label: "Exam score needed", ask: `What exam score does the other student need? (${X_ROUND})`, answerType: "number", answer: round2(need), tolerance: 0.005,
        hint: "Use the weights you found: coursework part + exam weight × x = 100 × target. Solve for x." },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-weight", values: { c, e, g, c2, T } },
    ...xGiven([["_c", c], ["_e", e], ["_g", g], ["_c2", c2], ["_target", T]]),
    hints: [
      "Call the exam weight w (a percentage). Coursework then has weight 100 - w.",
      `\`_c × (100 - w) + _e × w = 100 × _g\`. Expand: the w terms combine to \`(_e - _c) × w\` = \`${e - c}w\`.`,
      "With w known, the second student's equation has one unknown, the exam score.",
    ],
  };
}

const BLENDS = [
  { what: "coffee beans", a: "Arabica", b: "Robusta" },
  { what: "nuts", a: "cashews", b: "peanuts" },
  { what: "tea", a: "Darjeeling", b: "Assam" },
  { what: "bird seed", a: "sunflower seed", b: "millet" },
];

// weighted-average / expert, template 2: a mixture problem (working backwards from the blend price).
function genXBlend(rng) {
  const ctx = rng.pick(BLENDS);
  let a, b, x, y, m, pct;
  for (let t = 0; ; t++) {
    a = rng.int(8, 30);
    do b = rng.int(3, 25); while (b >= a - 1);
    x = rng.int(2, 20);
    y = rng.int(2, 20);
    m = (x * a + y * b) / (x + y);
    pct = (100 * x) / (x + y);
    if ((Number.isInteger(Math.round(m * 100 * 1e6) / 1e6) && !isTie2(pct)) || t > 400) break;
  }
  if (!Number.isInteger(Math.round(m * 100 * 1e6) / 1e6) || isTie2(pct)) { y = x; m = (a + b) / 2; pct = 50; }
  m = Math.round(m * 100) / 100;
  const price = (v) => `£${Number.isInteger(v) ? v : v.toFixed(2)}`;
  const steps = [
    `Let y kg of ${ctx.b} be used. Cost balance: \`${x} × ${a} + ${b}y = ${num(m)} × (${x} + y)\`.`,
    `\`${x * a} + ${b}y = ${num(m * x)} + ${num(m)}y\`, so \`${num(m - b)}y = ${num(x * a - m * x)}\` and y = **${y}** kg.`,
    `The blend is ${x + y} kg, of which ${x} kg is ${ctx.a}: \`100 × ${x} / ${x + y}\` ${result(pct, true)}%.`,
  ];
  return {
    prompt: `A shop mixes ${x} kg of ${ctx.a} costing ${price(a)} per kg with some ${ctx.b} costing ${price(b)} per kg. The mixture of ${ctx.what} costs exactly ${price(m)} per kg.`,
    answerType: "multi",
    parts: [
      { id: "kg", label: `${ctx.b[0].toUpperCase()}${ctx.b.slice(1)}`, ask: `How many kg of ${ctx.b} are in the mixture?`, answerType: "number", answer: y, tolerance: 0,
        hint: `Total cost of the parts = price of the mixture × total mass. Call the unknown mass y and solve.` },
      { id: "pct", label: `% ${ctx.a}`, ask: `What percentage of the mixture's mass is ${ctx.a}? (${X_ROUND}, no % sign)`, answerType: "number", answer: round2(pct), tolerance: 0.005,
        hint: `Mass of ${ctx.a} ÷ total mass × 100.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-blend", values: { x, a, b, m } },
    ...xGiven([["_x", x], ["_a", a], ["_b", b], ["_m", m]]),
    hints: [
      "The mixture price is a weighted average of the two prices, weighted by mass.",
      `Write \`_x × _a + _b × y = _m × (_x + y)\`, where y is the unknown mass.`,
      "Collect the y terms on one side: each kg of the cheap one is below the mixture price by `_m - _b`, and that has to balance the dearer one being above it.",
    ],
  };
}

function genExpert(subtopic, rng) {
  if (subtopic === "mean-median-mode") {
    const t = rng.int(0, 2);
    return t === 0 ? genXRunningMean(rng) : t === 1 ? genXMissing(rng) : genXCorrection(rng);
  }
  if (subtopic === "range-iqr") return rng.next() < 0.5 ? genXOutliers(rng) : genXIqrBack(rng);
  if (subtopic === "probability") return rng.next() < 0.6 ? genXTable(rng) : genXPooled(rng);
  if (subtopic === "weighted-average") {
    const t = rng.int(0, 2);
    return t === 0 ? genXClasses(rng) : t === 1 ? genXFindWeight(rng) : genXBlend(rng);
  }
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "mean-median-mode") return genCentral(difficulty, rng);
  if (subtopic === "range-iqr") return genSpread(difficulty, rng);
  if (subtopic === "probability") return genProbability(difficulty, rng);
  if (subtopic === "weighted-average") return genWeighted(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Parse "3/8" into [n, d]; null otherwise.
function parseFrac(s) {
  const m = /^(\d+)\/(\d+)$/.exec(String(s ?? "").trim());
  if (!m || Number(m[2]) === 0) return null;
  return [Number(m[1]), Number(m[2])];
}

// k-th smallest (0-based) by counting, without sorting: used as an independent median/quartile path.
function kth(data, k) {
  for (const v of data) {
    const below = data.filter((x) => x < v).length;
    const equal = data.filter((x) => x === v).length;
    if (below <= k && k < below + equal) return v;
  }
  return NaN;
}
function medianByCount(data, from, count) {
  // median of the sorted positions [from, from + count)
  const mid = from + (count - 1) / 2;
  return (kth(data, Math.floor(mid)) + kth(data, Math.ceil(mid))) / 2;
}

// Independent check: recompute from the raw data or counts by a different route (counting ranks
// instead of sorting, cross-multiplying fractions, substituting into the weighted-average equation).
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false;
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, question, answer);

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }
  if (answer === "" || answer === null || answer === undefined) return false;

  const k = p.values;

  if (p.kind === "single" || p.kind === "both" || p.kind === "atleast") {
    let N, D;
    if (p.kind === "single") [N, D] = [k.f, k.t];
    else if (p.kind === "both") [N, D] = [k.f1 * k.f2, k.t1 * k.t2];
    else {
      // 1 - P(none), with P(none) built up one try at a time
      let none = 1;
      let all = 1;
      for (let i = 0; i < k.n; i++) {
        none *= k.t - k.f;
        all *= k.t;
      }
      [N, D] = [all - none, all];
    }
    if (!(D > 0)) return false;
    if (p.format === "fraction") {
      const f = parseFrac(answer);
      if (!f) return false;
      const [a, b] = f;
      return b > 1 && gcd(a, b) === 1 && a * D === N * b;
    }
    const x = Number(answer);
    if (!Number.isFinite(x)) return false;
    return Math.abs(x * D - N) <= 0.005 * D + 1e-9;
  }

  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  let exact;
  const data = k.data;
  switch (p.kind) {
    case "mean":
      // x is the mean iff the deviations from x sum to zero
      return Math.abs(data.reduce((s, v) => s + (v - x), 0)) <= (p.rounded ? 0.005 * data.length + 1e-9 : 1e-9) && (p.rounded || Number.isInteger(x));
    case "median":
      exact = medianByCount(data, 0, data.length);
      break;
    case "mode": {
      const c = data.filter((v) => v === x).length;
      return Number.isInteger(x) && c > 0 && data.every((v) => v === x || data.filter((w) => w === v).length < c);
    }
    case "range":
      exact = Math.max(...data) - Math.min(...data);
      break;
    case "q1":
    case "q3":
    case "iqr": {
      const n = data.length;
      const h = Math.floor(n / 2);
      const q1 = medianByCount(data, 0, h);
      const q3 = medianByCount(data, n - h, h);
      exact = p.kind === "q1" ? q1 : p.kind === "q3" ? q3 : q3 - q1;
      break;
    }
    case "percent": {
      // 100·x = Σ w·s
      const r = 100 * x - k.weights.reduce((s, w, i) => s + w * k.scores[i], 0);
      return Math.abs(r) <= 0.005 * 100 + 1e-9;
    }
    case "credits": {
      const W = k.weights.reduce((s, w) => s + w, 0);
      const r = W * x - k.weights.reduce((s, w, i) => s + w * k.scores[i], 0);
      return W > 0 && Math.abs(r) <= 0.005 * W + 1e-9;
    }
    case "required": {
      // the final score x makes the weighted total hit the target
      const last = k.weights[k.weights.length - 1];
      const r = k.scores.reduce((s, sc, i) => s + sc * k.weights[i], 0) + last * x - 100 * k.target;
      return x >= 0 && x <= 100 + 0.005 && Math.abs(r) <= 0.005 * last + 1e-9;
    }
    default:
      return false;
  }
  if (!Number.isFinite(exact)) return false;
  if (p.rounded) return Math.abs(x - exact) <= 0.005 + 1e-9;
  return Number.isInteger(x) && Math.abs(x - exact) <= 1e-9;
}

// ---- Expert verification: substitute the candidate answers back into the stated facts ----

const toNum = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (ans, id) => (ans && typeof ans === "object" ? toNum(ans[id]) : NaN);
const partFrac = (ans, id) => {
  const f = ans && typeof ans === "object" ? parseFrac(ans[id]) : null;
  return f && f[1] > 1 && gcd(f[0], f[1]) === 1 ? f : null; // simplest form, not a whole number
};
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol + 1e-9;

function verifyExpert(p, question, answer) {
  const k = p.values;
  if (p.kind === "x-running") {
    const a = partNum(answer, "next");
    const b = partNum(answer, "needed");
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
    // the means as stated: (n·m + a)/(n+1) = m2 and (n·m + a + b)/(n+2) = m3
    return (k.n * k.m + a) === (k.n + 1) * k.m2 && (k.n * k.m + a + b) === (k.n + 2) * k.m3;
  }
  if (p.kind === "x-missing") {
    const x = partNum(answer, "x");
    const med = partNum(answer, "median");
    if (!Number.isInteger(x)) return false;
    const full = [...k.others, x];
    const n = full.length;
    if (full.reduce((s, v) => s + (v - k.mean), 0) !== 0) return false; // deviations from the mean sum to 0
    return near(med, medianByCount(full, 0, n), 0.005);
  }
  if (p.kind === "x-correct") {
    const T = partNum(answer, "total");
    const mean = partNum(answer, "mean");
    if (!Number.isInteger(T)) return false;
    // undo the correction: the total with the wrong mark back in must give the reported mean
    if (T - k.c + k.w !== k.n * k.m) return false;
    return Number.isFinite(mean) && Math.abs(mean * k.n - T) <= 0.005 * k.n + 1e-9;
  }
  if (p.kind === "x-outliers") {
    const d = k.data;
    const n = d.length;
    const h = Math.floor(n / 2);
    const q1 = medianByCount(d, 0, h);
    const q3 = medianByCount(d, n - h, h);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    let outs = 0;
    for (const v of d) if (v < lo || v > hi) outs++;
    return near(partNum(answer, "iqr"), iqr, 0.005) && near(partNum(answer, "low"), lo, 0.005)
      && near(partNum(answer, "high"), hi, 0.005) && partNum(answer, "outliers") === outs;
  }
  if (p.kind === "x-iqrback") {
    const x = partNum(answer, "x");
    if (!Number.isInteger(x)) return false;
    const full = k.shown.map((v) => (v === "x" ? x : Number(v)));
    for (let i = 1; i < full.length; i++) if (full[i] < full[i - 1]) return false; // still in order
    const n = full.length;
    const h = Math.floor(n / 2);
    const iqr = medianByCount(full, n - h, h) - medianByCount(full, 0, h);
    if (Math.abs(iqr - k.iqr) > 1e-9) return false;
    return near(partNum(answer, "mean"), full.reduce((s, v) => s + v, 0) / n, 0.005);
  }
  if (p.kind === "x-table") {
    const miss = partNum(answer, "missing");
    if (!Number.isInteger(miss) || miss < 0) return false;
    const t = k.shown.map((r) => r.map((v) => (v === null ? miss : v)));
    // every row and column must add up to its stated total
    if (!t.every((r, i) => r.reduce((s, v) => s + v, 0) === k.rowT[i])) return false;
    if (!k.colT.every((c, j) => t.reduce((s, r) => s + r[j], 0) === c)) return false;
    if (k.colT.reduce((s, v) => s + v, 0) !== k.grand) return false;
    const pA = partFrac(answer, "p");
    const pB = partFrac(answer, "cond");
    if (!pA || !pB) return false;
    return pA[0] * k.grand === k.colT[k.c2] * pA[1] && pB[0] * k.colT[k.c3] === t[k.r3][k.c3] * pB[1];
  }
  if (p.kind === "x-pooled") {
    const f = partFrac(answer, "p");
    const e = partNum(answer, "expected");
    if (!f || !Number.isInteger(e)) return false;
    const N = k.n1 + k.n2;
    const K = k.k1 + k.k2;
    return f[0] * N === K * f[1] && e * N === k.M * K;
  }
  if (p.kind === "x-classes") {
    const mB = partNum(answer, "meanB");
    const after = partNum(answer, "after");
    if (!Number.isFinite(mB)) return false;
    const N = k.nA + k.nB;
    if (Math.abs(k.nA * k.mA + k.nB * mB - k.M * N) > 1e-6) return false;
    return Number.isFinite(after) && Math.abs(after * (N + 1) - (k.M * N + k.s)) <= 0.005 * (N + 1) + 1e-9;
  }
  if (p.kind === "x-weight") {
    const w = partNum(answer, "weight");
    const x = partNum(answer, "needed");
    if (!Number.isInteger(w) || w <= 0 || w >= 100) return false;
    if (Math.abs(k.c * (100 - w) + k.e * w - 100 * k.g) > 1e-6) return false;
    // the true weight by search (0-100 in whole percents)
    let w0 = -1;
    for (let v = 1; v < 100; v++) if (Math.abs(k.c * (100 - v) + k.e * v - 100 * k.g) < 1e-6) w0 = v;
    if (w0 < 0) return false;
    return Number.isFinite(x) && x >= -0.005 && x <= 100.005 && Math.abs((100 - w0) * k.c2 + w0 * x - 100 * k.T) <= 0.005 * w0 + 1e-9;
  }
  if (p.kind === "x-blend") {
    const y = partNum(answer, "kg");
    const pct = partNum(answer, "pct");
    if (!Number.isInteger(y) || y <= 0) return false;
    if (Math.abs(k.x * k.a + y * k.b - k.m * (k.x + y)) > 1e-6) return false;
    let y0 = -1;
    for (let v = 1; v <= 500; v++) if (Math.abs(k.x * k.a + v * k.b - k.m * (k.x + v)) < 1e-6) y0 = v;
    return y0 > 0 && near(pct, (100 * k.x) / (k.x + y0), 0.005);
  }
  return false;
}
