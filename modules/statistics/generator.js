// Statistics generator. Uses only the seeded rng passed in by the engine.
// Easy number answers are whole; medium/hard ones are rounded to 2 decimals (tolerance 0.005).
// Probabilities are a fraction in simplest form ("3/8", typed as text) or a decimal to 2 places;
// the prompt says which. Data lists have at most 12 values.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Answer/choice formatter: whole numbers as-is (prompts say "round if it is not a whole number"),
// others with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded && !Number.isInteger(v) ? v.toFixed(2) : String(v);
}

// Given values and intermediate steps: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

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
    explanation = `Mean = sum ÷ count.\n\nSum: \`${list(data).replace(/, /g, " + ").replace(/\+ -/g, "- ")} = ${sum(data)}\`.\n\n\`${sum(data)} / ${N}\` ${result(exact, rounded)}`;
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
      story = `Two fair six-sided dice are rolled. What is the probability that the first shows ${k1} or more and the second shows ${k2} or less?`;
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

export function generate({ subtopic, difficulty, rng }) {
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
