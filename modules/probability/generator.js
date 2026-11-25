// Probability generator. Uses only the seeded rng passed in by the engine.
// Answer formats:
//   probabilities  a fraction in simplest form ("3/8", typed as text; never 0 or 1)
//   counting       a whole number (tolerance 0)
//   expected value rounded to 2 decimal places (tolerance 0.005)
// verify() never reuses generate()'s arithmetic. generate() counts with formulas (13 hearts, 4 kings,
// floor(n / m) multiples, c(c - 1) ordered pairs, n! / (n - r)!); verify() rebuilds the sample space from
// params and counts outcomes one by one (52 cards, 36 dice pairs, ordered draws, raffle tickets), or
// counts arrangements with a different recursion (Pascal's rule, a memoised multiset count).

// ---------------------------------------------------------------------------------------------
// Shared helpers

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Rounded answers as text with exactly 2 decimals; never "-0.00".
function fmt2(n) {
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

// Intermediate values: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// True when n is (almost) exactly on a rounding boundary like 1.235, where float noise could flip it.
const nearHalf = (n) => Math.abs(Math.abs(n * 100) % 1 - 0.5) < 1e-6;

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const lcm = (a, b) => (a / gcd(a, b)) * b;
function reduce(n, d) {
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
const fracStr = (n, d) => {
  const [a, b] = reduce(n, d);
  return `${a}/${b}`;
};
function parseFrac(s) {
  const m = String(s ?? "").trim().match(/^(-?\d+)\/(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const sum = (arr) => arr.reduce((s, x) => s + x, 0);
const andList = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`);
const orList = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} or ${arr[arr.length - 1]}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const art = (k) => (/^(8|11|18)$/.test(String(k)) || /^8\d$/.test(String(k)) ? `an ${k}` : `a ${k}`);

// Money in whole cents: "$5", "$2.50", "-$1.25".
function money(c) {
  const a = Math.abs(c);
  const s = a % 100 === 0 ? String(a / 100) : (a / 100).toFixed(2);
  return c < 0 ? `-$${s}` : `$${s}`;
}
const dollars = (c) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)); // calculator values

const FRAC_NOTE = " Give your answer as a fraction in simplest form, like 3/8 (no spaces around the slash).";
const CHOICE_NOTE = " Choose the answer in simplest form.";
const WHOLE = " Give a whole number.";
const DP2 = " Round to 2 decimal places.";

// "`12/20` simplifies to **3/5** (divide the top and bottom by 4)." or "already in simplest form".
function simplifyLine(N, D) {
  const g = gcd(N, D);
  const [a, b] = reduce(N, D);
  if (g <= 1) return `\`${N}/${D}\` is already in simplest form, so the answer is **${a}/${b}**.`;
  return `\`${N}/${D}\` simplifies to **${a}/${b}** (divide the top and the bottom by ${g}).`;
}

// 4 distinct fraction choices: the answer + 3 plausible mistakes, compared by reduced value.
// Every option lies strictly between 0 and 1 and differs from the answer.
function fracChoices(N, D, cands, rng) {
  const answer = fracStr(N, D);
  const seen = new Set([answer]);
  const out = [];
  const add = ([n, d]) => {
    if (out.length >= 3 || !Number.isInteger(n) || !Number.isInteger(d) || d <= 0 || n <= 0 || n >= d) return;
    const s = fracStr(n, d);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  cands.forEach(add);
  const [a, b] = reduce(N, D);
  for (let k = 1; out.length < 3 && k < 60; k++) {
    add([a + k, b]);
    add([a, b + k]);
    add([a - k, b]);
    add([a + k, b + k]);
  }
  return { answer, choices: rng.shuffle([answer, ...out]) };
}

// A solved probability question becomes a typed fraction (70%) or a multiple-choice one (30%).
function finishFrac(q, N, D, cands, rng) {
  const params = { ...q.params, fmt: "frac" };
  if (rng.next() < 0.3) {
    const { answer, choices } = fracChoices(N, D, cands, rng);
    return { ...q, prompt: q.prompt + CHOICE_NOTE, answer, answerType: "choice", choices, params };
  }
  return { ...q, prompt: q.prompt + FRAC_NOTE, answer: fracStr(N, D), answerType: "text", params };
}

// 4 distinct numeric choices (whole numbers, or 2-decimal strings when `rounded`).
function numChoices(correct, cands, rounded, rng, positive = true) {
  const f = (v) => (rounded ? fmt2(v) : String(Math.round(v)));
  const answer = f(correct);
  const seen = new Set([answer]);
  const out = [];
  const add = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (!rounded && !Number.isInteger(v)) return;
    if (positive && v <= 0) return;
    const s = f(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  cands.forEach(add);
  const step = rounded ? Math.max(0.05, round2(Math.abs(correct) * 0.1)) : Math.max(1, Math.round(Math.abs(correct) * 0.1));
  for (let k = 1; out.length < 3 && k < 100; k++) {
    add(correct + k * step);
    add(correct - k * step);
  }
  return { answer, choices: rng.shuffle([answer, ...out]) };
}

function finishNum(q, exact, rounded, cands, rng, positive = true) {
  const params = { ...q.params, fmt: rounded ? "2dp" : "int" };
  const tolerance = rounded ? 0.005 : 0;
  if (rng.next() < 0.3) {
    const { answer, choices } = numChoices(exact, cands, rounded, rng, positive);
    return { ...q, answer, answerType: "choice", choices, tolerance, params };
  }
  return { ...q, answer: rounded ? round2(exact) : exact, answerType: "number", tolerance, params };
}

// Calls make() until it returns a question (it returns null to ask for a fresh draw).
function retry(make) {
  for (let i = 0; i < 60; i++) {
    const q = make();
    if (q) return q;
  }
  throw new Error("probability: could not draw a valid question");
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Basic probability: one event, counted from the outcomes.

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59];
const COLOURS = ["red", "blue", "green", "yellow", "white", "black", "purple", "orange"];
const THINGS = ["marbles", "counters", "beads", "sweets", "balls", "buttons"];

// Number events on outcomes 1..n. count() is arithmetic; verify() tests each number instead.
const NUM_EVENTS = {
  even: { text: () => "an even number", count: (n) => Math.floor(n / 2) },
  odd: { text: () => "an odd number", count: (n) => n - Math.floor(n / 2) },
  gt: { text: (e) => `a number greater than ${e.k}`, count: (n, e) => n - e.k },
  lt: { text: (e) => `a number less than ${e.k}`, count: (n, e) => e.k - 1 },
  eq: { text: (e) => art(e.k), count: () => 1 },
  atleast: { text: (e) => `${art(e.k)} or higher`, count: (n, e) => n - e.k + 1 },
  atmost: { text: (e) => `${art(e.k)} or lower`, count: (n, e) => e.k },
  mult: { text: (e) => `a multiple of ${e.a}`, count: (n, e) => Math.floor(n / e.a) },
  prime: { text: () => "a prime number", count: (n) => PRIMES.filter((p) => p <= n).length },
  square: { text: () => "a square number", count: (n) => Math.floor(Math.sqrt(n) + 1e-9) },
  multOr: {
    text: (e) => `a multiple of ${e.a} or a multiple of ${e.b}`,
    count: (n, e) => Math.floor(n / e.a) + Math.floor(n / e.b) - Math.floor(n / lcm(e.a, e.b)),
  },
  evenGt: { text: (e) => `an even number greater than ${e.k}`, count: (n, e) => Math.floor(n / 2) - Math.floor(e.k / 2) },
  oddOrGt: {
    text: (e) => `an odd number or a number greater than ${e.k}`,
    count: (n, e) => n - Math.floor(n / 2) + Math.floor(n / 2) - Math.floor(e.k / 2),
  },
};

// How to count each kind of number event (hint text).
function numEventHint(n, e, nLabel) {
  switch (e.type) {
    case "even":
    case "odd":
      return `Half of the numbers 1 to ${n} are even${n % 2 ? `, rounded down, because ${n} is odd and the odd numbers get the extra one` : ""}. Count the ${e.type} ones.`;
    case "gt":
      return `The numbers greater than ${e.k} run from ${e.k + 1} up to ${n}. Count them: \`${nLabel} - ${e.k}\`.`;
    case "lt":
      return `The numbers less than ${e.k} run from 1 up to ${e.k - 1}. ${e.k} itself does not count.`;
    case "eq":
      return `Only one outcome is ${e.k}.`;
    case "atleast":
      return `"${e.k} or higher" includes ${e.k} itself: count ${e.k}, ${e.k + 1}, …, ${n}.`;
    case "atmost":
      return `"${e.k} or lower" includes ${e.k} itself: count 1, 2, …, ${e.k}.`;
    case "mult":
      return `The multiples of ${e.a} are ${e.a}, ${2 * e.a}, ${3 * e.a}, … Count how many fit up to ${n}: divide ${n} by ${e.a} and ignore the remainder.`;
    case "prime":
      return `List the primes up to ${n} (2, 3, 5, 7, …) and count them. 1 is not a prime number.`;
    case "square":
      return `List the square numbers up to ${n} (1, 4, 9, 16, …) and count them.`;
    case "multOr":
      return `Count the multiples of ${e.a} and the multiples of ${e.b}, then take away the multiples of ${lcm(e.a, e.b)}, because those were counted twice.`;
    case "evenGt":
      return `The even numbers greater than ${e.k} are ${e.k % 2 ? e.k + 1 : e.k + 2}, ${e.k % 2 ? e.k + 3 : e.k + 4}, … up to ${n}. Count them.`;
    case "oddOrGt":
      return `Count every odd number from 1 to ${n}, then add the even numbers greater than ${e.k}, which are the only ones not counted yet.`;
    default:
      return "";
  }
}

// Outcomes 1..n: dice, spinners, numbered cards and tickets.
const NUM_CONTEXTS = {
  die: (n) => `A fair ${n}-sided die numbered 1 to ${n} is rolled once.`,
  spinner: (n) => `A fair spinner has ${n} equal sections numbered 1 to ${n}. It is spun once.`,
  cards: (n) => `Cards numbered 1 to ${n} are shuffled and one is picked at random.`,
  tickets: (n) => `A raffle has tickets numbered 1 to ${n}, and one winning ticket is drawn at random.`,
};
const NUM_VERB = { die: "rolling", spinner: "landing on", cards: "picking", tickets: "drawing" };

function numberEvent(difficulty, rng) {
  let ctx, n, e;
  if (difficulty === "easy") {
    ctx = rng.pick(["die", "die", "spinner"]);
    n = ctx === "die" ? rng.pick([6, 6, 8, 10, 12]) : rng.int(5, 10);
    const type = rng.pick(["even", "odd", "gt", "lt", "eq", "atleast", "atmost"]);
    e = { type };
    if (type === "gt" || type === "atmost") e.k = rng.int(1, n - 2);
    if (type === "lt" || type === "atleast") e.k = rng.int(3, n);
    if (type === "eq") e.k = rng.int(1, n);
  } else if (difficulty === "medium") {
    ctx = rng.pick(["cards", "tickets", "die", "spinner"]);
    n = ctx === "die" ? rng.pick([12, 20]) : rng.int(12, 40);
    const type = rng.pick(["mult", "mult", "prime", "square", "gt", "atmost"]);
    e = { type };
    if (type === "mult") e.a = rng.int(3, 9);
    if (type === "gt") e.k = rng.int(Math.ceil(n / 3), n - 2);
    if (type === "atmost") e.k = rng.int(3, n - 3);
  } else {
    ctx = rng.pick(["cards", "tickets", "spinner"]);
    n = rng.int(20, 60);
    const type = rng.pick(["multOr", "multOr", "evenGt", "oddOrGt"]);
    e = { type };
    if (type === "multOr") {
      const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 9]).slice(0, 2);
      if (a % b === 0 || b % a === 0) return null; // "a multiple of 2 or of 4" is just "a multiple of 2"
      e.a = Math.min(a, b);
      e.b = Math.max(a, b);
    } else {
      e.k = rng.int(Math.ceil(n / 4), n - 4);
    }
  }
  const ev = NUM_EVENTS[e.type];
  const N = ev.count(n, e);
  const D = n;
  if (!(N > 0 && N < D)) return null;
  const text = ev.text(e);
  const prompt = `${NUM_CONTEXTS[ctx](n)} What is the probability of ${NUM_VERB[ctx]} ${text}?`;
  const nLabel = "_n";
  const nums = { n, ...(e.k !== undefined ? { k: e.k } : {}), ...(e.a !== undefined ? { a: e.a } : {}), ...(e.b !== undefined ? { b: e.b } : {}) };
  const given = Object.keys(nums).length >= 2 ? Object.entries(nums).map(([k, v]) => ({ label: `_${k}`, value: v })) : undefined;
  const explanation =
    `There are ${D} equally likely outcomes (1 to ${D}).\n\n` +
    `${cap(text)}: ${N} of them.\n\n` +
    `P = favourable ÷ all = \`${N}/${D}\`.\n\n` +
    simplifyLine(N, D);
  const hints = [
    `Probability = favourable outcomes ÷ all outcomes. There are ${D} equally likely outcomes, 1 to ${D}.`,
    numEventHint(n, e, given ? nLabel : String(n)),
    `Write the count over ${D} and simplify the fraction.`,
  ];
  const q = { prompt, explanation, hints, given, params: { kind: "numbers", n, event: e } };
  return finishFrac(q, N, D, [[D - N, D], [N, D - N], [N + 1, D], [N - 1, D], [1, D]], rng);
}

// Playing cards: atoms are "rectangles" of suits × ranks, so counts and overlaps are products.
const SUIT_NAMES = ["hearts", "diamonds", "clubs", "spades"];
const R_ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const CARD_ATOMS = {
  heart: { text: "a heart", suits: ["hearts"], ranks: R_ALL },
  diamond: { text: "a diamond", suits: ["diamonds"], ranks: R_ALL },
  club: { text: "a club", suits: ["clubs"], ranks: R_ALL },
  spade: { text: "a spade", suits: ["spades"], ranks: R_ALL },
  red: { text: "a red card", suits: ["hearts", "diamonds"], ranks: R_ALL },
  black: { text: "a black card", suits: ["clubs", "spades"], ranks: R_ALL },
  king: { text: "a king", suits: SUIT_NAMES, ranks: [13] },
  queen: { text: "a queen", suits: SUIT_NAMES, ranks: [12] },
  jack: { text: "a jack", suits: SUIT_NAMES, ranks: [11] },
  ace: { text: "an ace", suits: SUIT_NAMES, ranks: [1] },
  face: { text: "a face card (jack, queen or king)", suits: SUIT_NAMES, ranks: [11, 12, 13] },
  number: { text: "a number card (2 to 10)", suits: SUIT_NAMES, ranks: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
};
const SUITISH = ["heart", "diamond", "club", "spade", "red", "black"];
const RANKISH = ["king", "queen", "jack", "ace", "face", "number"];
const shared = (a, b) => a.filter((x) => b.includes(x)).length;
const atomCount = (a) => a.suits.length * a.ranks.length;
const bothCount = (a, b) => shared(a.suits, b.suits) * shared(a.ranks, b.ranks);
const DECK = "A card is drawn at random from a standard 52-card deck (four suits of 13 cards: hearts and diamonds are red, clubs and spades are black; each suit has an ace, 2 to 10, a jack, a queen and a king).";
const shortText = (k) => CARD_ATOMS[k].text.replace(/ \(.*\)$/, "");

function cardEvent(difficulty, rng) {
  let op, a, b, N, text, steps, hint2;
  if (difficulty !== "hard") {
    op = "one";
    a = rng.pick([...SUITISH, ...RANKISH]);
    const A = CARD_ATOMS[a];
    N = atomCount(A);
    text = A.text;
    steps = `${cap(shortText(a))}: ${A.suits.length === 4 ? `${A.ranks.length} in each of the 4 suits` : `${A.suits.length} ${A.suits.length === 1 ? "suit" : "suits"} of 13`}, so ${N} cards.`;
    hint2 = A.suits.length === 4
      ? `Each suit has ${A.ranks.length === 1 ? "one" : A.ranks.length} ${shortText(a).replace(/^an? /, "")}${A.ranks.length === 1 ? "" : "s"}, and there are 4 suits.`
      : `Each suit has 13 cards, and ${A.suits.length === 1 ? "one suit counts" : "two suits count"}.`;
  } else {
    op = rng.pick(["or", "or", "or", "and", "andNot"]);
    a = rng.pick(SUITISH);
    b = rng.pick(RANKISH);
    const A = CARD_ATOMS[a];
    const B = CARD_ATOMS[b];
    const nA = atomCount(A);
    const nB = atomCount(B);
    const nAB = bothCount(A, B);
    if (op === "or") {
      N = nA + nB - nAB;
      text = `${shortText(a)} or ${shortText(b)}`;
      steps = `${cap(shortText(a))}: ${nA} cards. ${cap(shortText(b))}: ${nB} cards. ${nAB} cards are both, and they were counted twice, so \`${nA} + ${nB} - ${nAB} = ${N}\` cards.`;
      hint2 = `Count the cards that are ${shortText(a)} (${nA}) and the cards that are ${shortText(b)} (${nB}). The cards that are both were counted twice, so take them away once.`;
    } else if (op === "and") {
      N = nAB;
      text = `${shortText(a)} that is also ${shortText(b)}`;
      steps = `The cards that are both ${shortText(a)} and ${shortText(b)}: ${A.suits.length} ${A.suits.length === 1 ? "suit" : "suits"} × ${B.ranks.length} ${B.ranks.length === 1 ? "rank" : "ranks"} = ${N} cards.`;
      hint2 = `The card must be ${shortText(a)} and ${shortText(b)} at the same time. Count the suits that qualify and the ranks that qualify, and multiply.`;
    } else {
      N = nA - nAB;
      text = `${shortText(a)} that is not ${shortText(b)}`;
      steps = `${cap(shortText(a))}: ${nA} cards, and ${nAB} of them are ${shortText(b)}, so \`${nA} - ${nAB} = ${N}\` cards.`;
      hint2 = `Count the cards that are ${shortText(a)} (${nA}), then take away the ones that are also ${shortText(b)}.`;
    }
  }
  const D = 52;
  const prompt = `${DECK} What is the probability that it is ${text}?`;
  const explanation = `All 52 cards are equally likely.\n\n${steps}\n\nP = \`${N}/52\`.\n\n${simplifyLine(N, D)}`;
  const hints = [
    "Probability = favourable cards ÷ 52, because every card is equally likely.",
    hint2,
    "Write the count over 52 and simplify the fraction.",
  ];
  const q = { prompt, explanation, hints, params: { kind: "cards", op, a, b } };
  return finishFrac(q, N, D, [[52 - N, 52], [N, 52 - N], [N + 1, 52], [N - 1, 52], [N, 13]], rng);
}

function bag(rng, k, lo = 1, hi = 9) {
  const cols = rng.shuffle(COLOURS).slice(0, k);
  const counts = cols.map(() => rng.int(lo, hi));
  return { cols, counts, total: sum(counts), thing: rng.pick(THINGS) };
}
const bagText = (b) => andList(b.cols.map((c, i) => `${b.counts[i]} ${c}`));
const bagGiven = (b) => b.cols.map((c, i) => ({ label: `_${c}`, value: b.counts[i] }));
const bagSum = (b) => b.cols.map((c) => `_${c}`).join(" + ");

function bagEvent(difficulty, rng) {
  const b = bag(rng, difficulty === "easy" ? rng.int(2, 3) : rng.int(3, 4));
  let N, D, text, steps, hint2, ev;
  const pickWord = `One is picked at random.`;
  let intro = `A bag holds ${bagText(b)} ${b.thing}.`;
  if (difficulty === "easy") {
    const i = rng.int(0, b.cols.length - 1);
    ev = { type: "is", cols: [b.cols[i]] };
    N = b.counts[i];
    D = b.total;
    text = b.cols[i];
    steps = `There are \`${bagSum(b)} = ${D}\` ${b.thing}, and ${N} are ${b.cols[i]}.`;
    hint2 = `Add up all the ${b.thing}: \`${bagSum(b)}\`. ${N} of them are ${b.cols[i]}.`;
  } else if (difficulty === "medium") {
    D = b.total;
    if (rng.next() < 0.5) {
      const i = rng.int(0, b.cols.length - 1);
      ev = { type: "not", cols: [b.cols[i]] };
      N = D - b.counts[i];
      text = `not ${b.cols[i]}`;
      steps = `There are \`${bagSum(b)} = ${D}\` ${b.thing}. ${b.counts[i]} are ${b.cols[i]}, so \`${D} - ${b.counts[i]} = ${N}\` are not.`;
      hint2 = `Find the total (\`${bagSum(b)}\`), then take away the ${b.counts[i]} ${b.cols[i]} ones. Everything else is "not ${b.cols[i]}".`;
    } else {
      const [i, j] = rng.shuffle(b.cols.map((_, x) => x)).slice(0, 2);
      ev = { type: "is", cols: [b.cols[i], b.cols[j]] };
      N = b.counts[i] + b.counts[j];
      text = `${b.cols[i]} or ${b.cols[j]}`;
      steps = `There are \`${bagSum(b)} = ${D}\` ${b.thing}, and \`${b.counts[i]} + ${b.counts[j]} = ${N}\` are ${b.cols[i]} or ${b.cols[j]}.`;
      hint2 = `Nothing in the bag is two colours at once, so add the ${b.cols[i]} and ${b.cols[j]} counts. Divide by the total, \`${bagSum(b)}\`.`;
    }
  } else {
    // Some are removed first; then one is picked from what is left.
    const r = rng.int(0, b.cols.length - 1);
    if (b.counts[r] < 3) return null;
    const k = rng.int(1, b.counts[r] - 1);
    const i = rng.int(0, b.cols.length - 1);
    ev = { type: "is", cols: [b.cols[i]], removed: { col: b.cols[r], k } };
    const left = b.counts.map((c, x) => (x === r ? c - k : c));
    D = b.total - k;
    N = left[i];
    text = b.cols[i];
    intro += ` ${k} ${b.cols[r]} ${k === 1 ? "one is" : "ones are"} taken out and kept aside.`;
    steps = `After removing ${k} ${b.cols[r]}, ${D} ${b.thing} are left (\`${bagSum(b)} - ${k}\`), and ${N} of them are ${b.cols[i]}${i === r ? ` (\`${b.counts[i]} - ${k}\`)` : ""}.`;
    hint2 = `Work out what is left in the bag first: \`${bagSum(b)} - _out\`. ${i === r ? `The ${b.cols[i]} count also drops by ${k}.` : `The ${b.cols[i]} count doesn't change.`}`;
  }
  if (!(N > 0 && N < D)) return null;
  const prompt = `${intro} ${pickWord} What is the probability that it is ${text}?`;
  const explanation = `Every ${b.thing.replace(/s$/, "")} is equally likely to be picked.\n\n${steps}\n\nP = \`${N}/${D}\`.\n\n${simplifyLine(N, D)}`;
  const hints = [
    `Probability = favourable outcomes ÷ all outcomes. Each of the ${b.thing} is equally likely.`,
    hint2,
    "Write the favourable count over the total and simplify.",
  ];
  const given = bagGiven(b);
  if (ev.removed) given.push({ label: "_out", value: ev.removed.k });
  const q = { prompt, explanation, hints, given, params: { kind: "bag", cols: b.cols, counts: b.counts, event: ev } };
  return finishFrac(q, N, D, [[D - N, D], [N, D - N], [N, b.total], [N + 1, D]], rng);
}

const WORDS = ["PROBABILITY", "MISSISSIPPI", "STATISTICS", "BANANA", "ELEPHANT", "CALCULATOR", "PARALLEL", "EXCELLENT",
  "COMMITTEE", "GEOGRAPHY", "ALGEBRA", "TOMORROW", "ASSESSMENT", "CHOCOLATE", "ADDRESS", "BOOKKEEPER", "ENGINEERING",
  "MATHEMATICS", "SUCCESS", "COFFEE", "PEPPER", "GRAMMAR", "DICTIONARY", "UMBRELLA"];
const VOWELS = "AEIOU";

function letterEvent(rng) {
  const w = rng.pick(WORDS);
  const len = w.length;
  const type = rng.pick(["vowel", "consonant", "letter", "letter"]);
  let N, text, hint2;
  const vowelCount = w.replace(/[^AEIOU]/g, "").length;
  if (type === "vowel") {
    N = vowelCount;
    text = "a vowel (A, E, I, O or U)";
    hint2 = `Go through ${w} and count the A, E, I, O and U tiles, including repeats.`;
  } else if (type === "consonant") {
    N = len - vowelCount;
    text = `a consonant (any letter except A, E, I, O and U${w.includes("Y") ? "; Y counts as a consonant" : ""})`;
    hint2 = `Count the vowels in ${w} (A, E, I, O, U) and take them away from the ${len} tiles.`;
  } else {
    // A letter that appears at least once; prefer repeated letters.
    const letters = [...new Set(w.split(""))];
    const rep = letters.filter((c) => w.split(c).length - 1 > 1);
    const L = rng.next() < 0.7 && rep.length ? rng.pick(rep) : rng.pick(letters);
    N = w.split(L).length - 1;
    text = `the letter ${L}`;
    hint2 = `Count every ${L} tile in ${w}, including repeats.`;
  }
  const D = len;
  if (!(N > 0 && N < D)) return null;
  const prompt = `Each letter of the word ${w} is written on its own tile, and the ${len} tiles go into a bag. One tile is picked at random. What is the probability that it shows ${text}?`;
  const explanation = `There are ${len} tiles, all equally likely.\n\n${cap(text.replace(/ \(.*\)$/, ""))}: ${N} tiles.\n\nP = \`${N}/${D}\`.\n\n${simplifyLine(N, D)}`;
  const hints = [
    `Probability = favourable tiles ÷ all tiles. ${w} has ${len} letters, so there are ${len} tiles.`,
    hint2,
    `Write the count over ${len} and simplify.`,
  ];
  const q = { prompt, explanation, hints, params: { kind: "letters", word: w, event: { type, letter: type === "letter" ? text.slice(-1) : undefined } } };
  return finishFrac(q, N, D, [[D - N, D], [N, D - N], [N + 1, D], [N, 26]], rng);
}

function genBasic(difficulty, rng) {
  return retry(() => {
    if (difficulty === "easy") return rng.next() < 0.55 ? numberEvent("easy", rng) : bagEvent("easy", rng);
    if (difficulty === "medium") {
      const r = rng.next();
      if (r < 0.3) return numberEvent("medium", rng);
      if (r < 0.55) return cardEvent("medium", rng);
      if (r < 0.8) return bagEvent("medium", rng);
      return letterEvent(rng);
    }
    const r = rng.next();
    if (r < 0.4) return cardEvent("hard", rng);
    if (r < 0.75) return numberEvent("hard", rng);
    return bagEvent("hard", rng);
  });
}

// ---------------------------------------------------------------------------------------------
// Combined events: two or more trials.

const SIDE = { H: "heads", T: "tails" };

function coinDie(rng, medium) {
  const side = rng.pick(["H", "T"]);
  const dt = rng.pick(["even", "odd", "eq", "gt"]);
  const k = dt === "eq" ? rng.int(1, 6) : dt === "gt" ? rng.int(2, 4) : undefined;
  const fDie = dt === "even" || dt === "odd" ? 3 : dt === "eq" ? 1 : 6 - k;
  const dieText = dt === "even" ? "an even number" : dt === "odd" ? "an odd number" : dt === "eq" ? art(k) : `a number greater than ${k}`;
  const op = medium ? "or" : "and";
  let N, steps, hint2;
  const D = 12;
  if (op === "and") {
    N = fDie;
    steps = `P(${SIDE[side]}) = 1/2 and P(${dieText}) = ${fDie}/6. They are independent, so multiply: \`1/2 × ${fDie}/6 = ${N}/12\`.`;
    hint2 = `P(${SIDE[side]}) is 1 out of 2. P(${dieText}) is ${fDie} out of 6. Multiply the two probabilities.`;
  } else {
    N = 6 + 2 * fDie - fDie; // P(A) + P(B) - P(A and B), all over 12
    steps =
      `P(A or B) = P(A) + P(B) - P(A and B).\n\n` +
      `\`1/2 + ${fDie}/6 - 1/2 × ${fDie}/6 = 6/12 + ${2 * fDie}/12 - ${fDie}/12 = ${N}/12\`.`;
    hint2 = `Use P(A or B) = P(A) + P(B) - P(A and B), with P(${SIDE[side]}) = 1 out of 2 and P(${dieText}) = ${fDie} out of 6. P(A and B) is the product, because they are independent.`;
  }
  const prompt = `A fair coin is tossed and a fair six-sided die is rolled. What is the probability of getting ${SIDE[side]} ${op} ${dieText}?`;
  const hints = [
    op === "and"
      ? "The coin and the die don't affect each other (independent events), so P(A and B) = P(A) × P(B)."
      : `"Or" here means at least one of them happens. Adding P(A) and P(B) counts the case where both happen twice.`,
    hint2,
    "Put everything over 12 (2 × 6 outcomes), then simplify.",
  ];
  const explanation = `There are 2 × 6 = 12 equally likely outcomes.\n\n${steps}\n\n${simplifyLine(N, D)}`;
  const cands = op === "and" ? [[1 + fDie * 2, 12], [fDie + 1, 8], [fDie, 6], [12 - N, 12]] : [[6 + 2 * fDie, 12], [fDie, 12], [12 - N, 12], [fDie + 1, 8]];
  return { prompt, N, D, explanation, hints, cands, params: { kind: "coinDie", side, dt, k, op } };
}

function twoDice(rng, difficulty) {
  let ev, N, text, steps, hint2;
  const D = 36;
  const t = difficulty === "easy" ? rng.pick(["bothEven", "bothAtLeast", "bothEq"]) : difficulty === "medium" ? rng.pick(["sumEq", "sumEq", "sumGt", "double", "atLeastOne"]) : rng.pick(["sumOrDouble", "sumLt"]);
  if (t === "bothEven") {
    ev = { type: t };
    N = 9;
    text = "both dice show an even number";
    steps = `P(even) = 3/6 on each die, so \`3/6 × 3/6 = 9/36\`.`;
    hint2 = "Each die shows an even number 3 times out of 6. Multiply the two probabilities.";
  } else if (t === "bothAtLeast") {
    const m = rng.int(2, 5);
    ev = { type: t, m };
    const f = 7 - m;
    N = f * f;
    text = `both dice show ${m} or higher`;
    steps = `Each die shows ${m} or higher in ${f} of its 6 outcomes, so \`${f}/6 × ${f}/6 = ${N}/36\`.`;
    hint2 = `On one die, ${m} or higher is ${f} out of 6 outcomes (count ${m} itself). Multiply for the two dice.`;
  } else if (t === "bothEq") {
    const m = rng.int(1, 6);
    ev = { type: t, m };
    N = 1;
    text = `both dice show ${m}`;
    steps = `\`1/6 × 1/6 = 1/36\`.`;
    hint2 = `Each die shows ${m} once in 6 outcomes. Multiply.`;
  } else if (t === "sumEq") {
    const s = rng.int(3, 11);
    ev = { type: t, s };
    N = 6 - Math.abs(s - 7);
    text = `the total is ${s}`;
    steps = `The pairs that add to ${s} are listed by the first die: ${N} pairs out of 36.`;
    hint2 = `List the pairs (first die, second die) that add up to ${s}, starting with the first die on ${Math.max(1, s - 6)}. (1, 2) and (2, 1) are different outcomes.`;
  } else if (t === "sumGt") {
    const s = rng.int(6, 10);
    ev = { type: t, s };
    N = 0;
    for (let tot = s + 1; tot <= 12; tot++) N += 6 - Math.abs(tot - 7);
    text = `the total is greater than ${s}`;
    steps = `Count the pairs for each total from ${s + 1} to 12: ${Array.from({ length: 12 - s }, (_, i) => 6 - Math.abs(s + 1 + i - 7)).join(" + ")} = ${N} out of 36.`;
    hint2 = `For each total from ${s + 1} to 12, count the pairs that make it (a total of 12 has 1, 11 has 2, 10 has 3, …), then add them.`;
  } else if (t === "double") {
    ev = { type: t };
    N = 6;
    text = "both dice show the same number (a double)";
    steps = "The doubles are (1, 1), (2, 2), …, (6, 6): 6 out of 36.";
    hint2 = "Whatever the first die shows, the second has to match it: 1 outcome out of 6 for the second die. Or list the doubles.";
  } else if (t === "atLeastOne") {
    const m = rng.int(1, 6);
    ev = { type: t, m };
    N = 11;
    text = `at least one die shows ${m}`;
    steps = `P(no ${m}) = \`5/6 × 5/6 = 25/36\`, so P(at least one ${m}) = \`1 - 25/36 = 11/36\`.`;
    hint2 = `Find P(neither die shows ${m}): each die avoids ${m} 5 times out of 6. Then take that away from 1.`;
  } else if (t === "sumOrDouble") {
    const s = rng.int(3, 11);
    ev = { type: t, s };
    const nS = 6 - Math.abs(s - 7);
    const both = s % 2 === 0 ? 1 : 0;
    N = nS + 6 - both;
    text = `the total is ${s} or both dice show the same number`;
    steps = `Total ${s}: ${nS} pairs. Doubles: 6 pairs. ${both ? `(${s / 2}, ${s / 2}) is in both lists, so` : "No double adds up to an odd total, so nothing is counted twice:"} \`${nS} + 6${both ? " - 1" : ""} = ${N}\` pairs out of 36.`;
    hint2 = `Count the pairs with total ${s}, and the 6 doubles. ${s % 2 === 0 ? `One double also adds up to ${s}: don't count it twice.` : `Check whether any double adds up to ${s}.`}`;
  } else {
    const s = rng.int(4, 8);
    ev = { type: t, s };
    N = 0;
    for (let tot = 2; tot < s; tot++) N += 6 - Math.abs(tot - 7);
    text = `the total is less than ${s}`;
    steps = `Count the pairs for each total from 2 to ${s - 1}: ${Array.from({ length: s - 2 }, (_, i) => 6 - Math.abs(2 + i - 7)).join(" + ")} = ${N} out of 36.`;
    hint2 = `For each total from 2 up to ${s - 1}, count the pairs that make it (2 has 1, 3 has 2, 4 has 3, …), then add them.`;
  }
  const prompt = `Two fair six-sided dice are rolled. What is the probability that ${text}?`;
  const hints = [
    "There are 6 × 6 = 36 equally likely ordered outcomes (first die, second die).",
    hint2,
    "Write the count over 36 and simplify.",
  ];
  const explanation = `There are 36 equally likely outcomes.\n\n${steps}\n\n${simplifyLine(N, D)}`;
  return { prompt, N, D, explanation, hints, cands: [[36 - N, 36], [N, 12], [N + 1, 36], [N, 6]], params: { kind: "dice", k: 2, event: ev } };
}

function coins(rng) {
  const k = rng.int(2, 4);
  const t = rng.pick(["allH", "allT", "exactlyOne", "atLeastOne"]);
  const D = 2 ** k;
  let N, text, hint2;
  if (t === "allH" || t === "allT") {
    N = 1;
    text = `${k === 2 ? "both" : `all ${k}`} land ${t === "allH" ? "heads" : "tails"}`;
    hint2 = `Each coin lands ${t === "allH" ? "heads" : "tails"} with probability 1 out of 2. Multiply this ${k} times.`;
  } else if (t === "exactlyOne") {
    N = k;
    text = "exactly one lands heads";
    hint2 = `List the outcomes with exactly one head: the head can be on any one of the ${k} coins.`;
  } else {
    N = D - 1;
    text = "at least one lands heads";
    hint2 = `"At least one head" is everything except all tails. Find P(all tails) and take it away from 1.`;
  }
  const prompt = `${k === 2 ? "Two" : k === 3 ? "Three" : "Four"} fair coins are tossed. What is the probability that ${text}?`;
  const hints = [`Each coin has 2 equally likely sides, so ${k} coins give 2${k === 2 ? "²" : k === 3 ? "³" : "⁴"} equally likely outcomes.`, hint2, `Write it over ${D} and simplify.`];
  const explanation = `There are \`2^${k} = ${D}\` equally likely outcomes.\n\n${cap(text)}: ${N} of them.\n\n${simplifyLine(N, D)}`;
  return { prompt, N, D, explanation, hints, cands: [[1, k], [D - N, D], [N, 2 * k], [1, 2]], params: { kind: "coins", k, event: { type: t } } };
}

// Draws from one bag, with or without replacement. Ordered outcomes: t(t-1) pairs without replacement.
function draws(rng, difficulty) {
  const b = bag(rng, rng.int(2, 3), 2, 7);
  const t = b.total;
  const i = rng.int(0, b.cols.length - 1);
  const c = b.counts[i];
  const col = b.cols[i];
  let replace, n, type, N, D, text, steps, hint2;
  if (difficulty === "easy") {
    replace = true;
    n = 2;
    type = "all";
  } else if (difficulty === "medium") {
    replace = rng.next() < 0.5;
    n = 2;
    type = "all";
  } else {
    replace = false;
    type = rng.pick(["atLeastOne", "exactlyOne", "same", "differ", "all3"]);
    n = type === "all3" ? 3 : 2;
    if (type === "all3" && c < 3) return null;
  }
  const how = replace
    ? `One ${b.thing.replace(/s$/, "")} is picked at random, put back, and then a second is picked.`
    : `${n === 2 ? "Two" : "Three"} ${b.thing} are picked at random, one after another, without putting any back.`;
  const intro = `A bag holds ${bagText(b)} ${b.thing}. ${how}`;
  const t2 = replace ? t : t - 1;
  if (type === "all" && n === 2) {
    const c2 = replace ? c : c - 1;
    N = c * c2;
    D = t * t2;
    text = `both are ${col}`;
    steps = `P(first ${col}) = ${c}/${t}. ${replace ? `It is put back, so P(second ${col}) = ${c}/${t} again` : `One ${col} is gone, so P(second ${col}) = ${c2}/${t2}`}.\n\n\`${c}/${t} × ${c2}/${t2} = ${N}/${D}\`.`;
    hint2 = replace
      ? `P(${col}) is ${c} out of ${t} each time, because the first one goes back in.`
      : `First pick: ${c} ${col} out of ${t}. If it was ${col}, the bag now has ${c2} ${col} out of ${t2}.`;
  } else if (type === "all3") {
    N = c * (c - 1) * (c - 2);
    D = t * (t - 1) * (t - 2);
    text = `all three are ${col}`;
    steps = `\`${c}/${t} × ${c - 1}/${t - 1} × ${c - 2}/${t - 2} = ${N}/${D}\`.`;
    hint2 = `Each ${col} pick leaves one fewer ${col} and one fewer ${b.thing.replace(/s$/, "")}: ${c} out of ${t}, then ${c - 1} out of ${t - 1}, then ${c - 2} out of ${t - 2}.`;
  } else if (type === "atLeastOne") {
    const o = t - c;
    D = t * (t - 1);
    N = D - o * (o - 1);
    text = `at least one is ${col}`;
    steps = `P(neither is ${col}) = \`${o}/${t} × ${o - 1}/${t - 1} = ${o * (o - 1)}/${D}\`.\n\nP(at least one ${col}) = \`1 - ${o * (o - 1)}/${D} = ${N}/${D}\`.`;
    hint2 = `Use the complement: P(at least one ${col}) = 1 - P(no ${col}). There are ${o} ${b.thing} that are not ${col}: ${o} out of ${t}, then ${o - 1} out of ${t - 1}.`;
  } else if (type === "exactlyOne") {
    const o = t - c;
    D = t * (t - 1);
    N = 2 * c * o;
    text = `exactly one is ${col}`;
    steps = `${cap(col)} then not: \`${c}/${t} × ${o}/${t - 1}\`. Not then ${col}: \`${o}/${t} × ${c}/${t - 1}\`.\n\nAdd them: \`${c * o}/${D} + ${c * o}/${D} = ${N}/${D}\`.`;
    hint2 = `Exactly one ${col} can happen two ways: ${col} first, or ${col} second. Work out each (${c} ${col} and ${o} others, no replacement) and add them.`;
  } else {
    D = t * (t - 1);
    const same = sum(b.counts.map((x) => x * (x - 1)));
    N = type === "same" ? same : D - same;
    text = type === "same" ? "both are the same colour" : "they are different colours";
    const parts = b.cols.map((cc, j) => `${b.counts[j]}/${t} × ${b.counts[j] - 1}/${t - 1}`);
    steps = `P(same colour) = ${parts.map((p) => `\`${p}\``).join(" + ")} = \`${same}/${D}\`.` + (type === "differ" ? `\n\nP(different) = \`1 - ${same}/${D} = ${N}/${D}\`.` : "");
    hint2 = `P(same colour) = P(both ${b.cols[0]}) + P(both ${b.cols[1]})${b.cols.length > 2 ? ` + P(both ${b.cols[2]})` : ""}, each worked out without replacement.${type === "differ" ? " Different colours is everything else." : ""}`;
  }
  if (!(N > 0 && N < D)) return null;
  const prompt = `${intro} What is the probability that ${text}?`;
  const hints = [
    replace
      ? "The two picks are independent, because the first one goes back: multiply the probabilities."
      : "Without replacement, the second pick depends on the first: after each pick, the bag has one fewer item.",
    hint2,
    "Multiply along each route, add the routes if there are several, then simplify.",
  ];
  const explanation = `There are ${t} ${b.thing} in the bag.\n\n${steps}\n\n${simplifyLine(N, D)}`;
  const cands = [[c * c, t * t], [c * (c - 1), t * t], [2 * c, t], [D - N, D], [c, t]];
  return { prompt, N, D, explanation, hints, cands, given: bagGiven(b), params: { kind: "draw", cols: b.cols, counts: b.counts, n, replace, event: { type, col } } };
}

function manyDice(rng) {
  const k = rng.int(3, 4);
  const m = rng.int(1, 6);
  const D = 6 ** k;
  const N = D - 5 ** k;
  const prompt = `A fair six-sided die is rolled ${k} times. What is the probability of getting at least one ${m}?`;
  const hints = [
    `"At least one ${m}" is the opposite of "no ${m} at all", so P(at least one) = 1 - P(none).`,
    `On one roll, P(not ${m}) is 5 out of 6. The rolls are independent, so P(no ${m} in ${k} rolls) = (5/6)^${k}.`,
    `Work out 5^${k} and 6^${k}, subtract P(none) from 1, and simplify if possible.`,
  ];
  const explanation = `P(no ${m} in ${k} rolls) = \`(5/6)^${k} = ${5 ** k}/${D}\`.\n\nP(at least one ${m}) = \`1 - ${5 ** k}/${D} = ${N}/${D}\`.\n\n${simplifyLine(N, D)}`;
  return { prompt, N, D, explanation, hints, cands: [[5 ** k, D], [k, 6], [1, 6 ** k], [6 ** (k - 1), D]], params: { kind: "dice", k, event: { type: "atLeastOne", m } } };
}

// Hard multi-part: two draws without replacement, P(both) and P(at least one) or P(exactly one).
function drawsMulti(rng) {
  const b = bag(rng, 2, 3, 8);
  const t = b.total;
  const i = rng.int(0, 1);
  const c = b.counts[i];
  const o = t - c;
  const col = b.cols[i];
  const D = t * (t - 1);
  const second = rng.pick(["atLeastOne", "exactlyOne"]);
  const both = c * (c - 1);
  const N2 = second === "atLeastOne" ? D - o * (o - 1) : 2 * c * o;
  if (!(N2 > 0 && N2 < D)) return null;
  const prompt = `A bag holds ${bagText(b)} ${b.thing}. Two are picked at random, one after the other, without replacement. Give each answer as a fraction in simplest form, like 3/8 (no spaces around the slash).`;
  const parts = [
    {
      id: "both", label: "Both", ask: `What is the probability that both are ${col}?`, answerType: "text", answer: fracStr(both, D),
      hint: `First pick: ${c} ${col} out of ${t}. Second pick, after a ${col} has gone: ${c - 1} out of ${t - 1}. Multiply, then simplify.`,
    },
    second === "atLeastOne"
      ? {
          id: "atleast", label: "At least one", ask: `What is the probability that at least one is ${col}?`, answerType: "text", answer: fracStr(N2, D),
          hint: `Use 1 - P(neither is ${col}). Neither: ${o} out of ${t}, then ${o - 1} out of ${t - 1}.`,
        }
      : {
          id: "exactly", label: "Exactly one", ask: `What is the probability that exactly one is ${col}?`, answerType: "text", answer: fracStr(N2, D),
          hint: `Two routes: ${col} then other (${c} out of ${t}, then ${o} out of ${t - 1}), or other then ${col}. Add the two routes.`,
        },
  ];
  const explanation =
    `Without replacement there are \`${t} × ${t - 1} = ${D}\` equally likely ordered pairs.\n\n` +
    `**Both ${col}:** \`${c}/${t} × ${c - 1}/${t - 1} = ${both}/${D}\`. ${simplifyLine(both, D)}\n\n` +
    (second === "atLeastOne"
      ? `**At least one ${col}:** P(neither) = \`${o}/${t} × ${o - 1}/${t - 1} = ${o * (o - 1)}/${D}\`, so \`1 - ${o * (o - 1)}/${D} = ${N2}/${D}\`. ${simplifyLine(N2, D)}`
      : `**Exactly one ${col}:** \`${c}/${t} × ${o}/${t - 1} + ${o}/${t} × ${c}/${t - 1} = ${N2}/${D}\`. ${simplifyLine(N2, D)}`);
  return {
    prompt, answerType: "multi", parts, explanation,
    hints: ["Without replacement, the second pick depends on the first: the bag has one fewer item, and one fewer of the colour you took."],
    given: bagGiven(b),
    params: { kind: "drawMulti", cols: b.cols, counts: b.counts, col, specs: [{ id: "both", type: "all" }, { id: parts[1].id, type: second }] },
  };
}

function genCombined(difficulty, rng) {
  return retry(() => {
    let x;
    if (difficulty === "easy") {
      const r = rng.next();
      x = r < 0.3 ? coinDie(rng, false) : r < 0.55 ? twoDice(rng, "easy") : r < 0.75 ? coins(rng) : draws(rng, "easy");
    } else if (difficulty === "medium") {
      const r = rng.next();
      x = r < 0.4 ? twoDice(rng, "medium") : r < 0.75 ? draws(rng, "medium") : coinDie(rng, true);
    } else {
      const r = rng.next();
      if (r < 0.3) return drawsMulti(rng);
      x = r < 0.65 ? draws(rng, "hard") : r < 0.85 ? manyDice(rng) : twoDice(rng, "hard");
    }
    if (!x) return null;
    const q = { prompt: x.prompt, explanation: x.explanation, hints: x.hints, given: x.given, params: x.params };
    return finishFrac(q, x.N, x.D, x.cands, rng);
  });
}

// ---------------------------------------------------------------------------------------------
// Counting: whole-number answers.

function fact(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}
const nPr = (n, r) => fact(n) / fact(n - r);
const nCr = (n, r) => Math.round(nPr(n, r) / fact(r));
const prodStr = (from, count) => Array.from({ length: count }, (_, i) => from - i).join(" × ");

const PEOPLE = ["friends", "students", "players", "musicians", "guests", "runners", "chess players", "volunteers"];
const ITEMS = ["books", "trophies", "photos", "plants", "mugs", "paintings"];
const DISTINCT_WORDS = ["MATHS", "PLANET", "GARDEN", "FRIDAY", "SQUARE", "NUMBER", "CHAIRS", "TRIANGLE", "PICTURE", "DOZEN", "BLUE", "STORM", "WINTER", "FROG"];
const REPEAT_WORDS = ["BANANA", "LETTER", "COFFEE", "PEPPER", "BALLOON", "STREET", "PARABOLA", "SUCCESS", "TOMATO", "ADDRESS", "GRAMMAR", "CHEESE", "ASSESS", "KAYAK", "LEVEL", "PUPPY", "LLAMA", "RABBIT"];
const RACES = ["a race", "a talent show", "a spelling bee", "a baking contest", "a chess tournament"];
const GROUPS = ["club", "class", "team", "choir", "orchestra"];

function letterCounts(w) {
  const m = new Map();
  for (const ch of w) m.set(ch, (m.get(ch) || 0) + 1);
  return m;
}

function genCounting(difficulty, rng) {
  checkDifficulty(difficulty);
  return retry(() => {
    let kind, values, prompt, exact, explanation, hints, cands, given;
    if (difficulty === "easy") kind = rng.pick(["arrange", "product", "handshake", "code"]);
    else if (difficulty === "medium") kind = rng.pick(["podium", "choose", "codeNoRep", "word"]);
    else kind = rng.pick(["wordRep", "wordRep", "twoGroups", "together", "multi"]);

    if (kind === "arrange") {
      const n = rng.int(3, 6);
      const it = rng.pick(ITEMS);
      values = { n };
      exact = fact(n);
      prompt = `In how many different orders can ${n} different ${it} be arranged in a row on a shelf?${WHOLE}`;
      explanation = `There are ${n} choices for the first place, ${n - 1} for the second, and so on.\n\n\`${n}! = ${prodStr(n, n)} = ${exact}\`, so the answer is **${exact}**.`;
      hints = [`Fill the places one at a time: ${n} ${it} could go first.`, `Once one is placed, ${n - 1} are left for the second place, then ${n - 2}, and so on. Multiply: \`${prodStr(n, n)}\` (that's ${n}!).`];
      cands = [n * n, fact(n - 1), n * (n - 1), 2 ** n];
    } else if (kind === "product") {
      const cats = rng.shuffle([["shirts", 2, 6], ["pairs of trousers", 2, 5], ["pairs of shoes", 2, 4], ["hats", 2, 4], ["jackets", 2, 3]]).slice(0, rng.int(2, 3));
      const counts = cats.map(([, lo, hi]) => rng.int(lo, hi));
      values = { counts };
      exact = counts.reduce((a, b) => a * b, 1);
      const who = rng.pick(["Sam", "Priya", "Leo", "Mia", "Ade", "Kai"]);
      prompt = `${who} has ${andList(cats.map(([n], i) => `${counts[i]} ${n}`))}. An outfit is one of each. How many different outfits are possible?${WHOLE}`;
      explanation = `Each choice can go with every other choice, so multiply (the product rule).\n\n\`${counts.join(" × ")} = ${exact}\`, so there are **${exact}** outfits.`;
      hints = ["Every shirt can be worn with every option of the other items: this is the product rule.", `Multiply the number of choices for each item: \`${counts.join(" × ")}\`.`];
      cands = [sum(counts), exact * 2, sum(counts) * 2, Math.max(...counts) ** counts.length];
      given = cats.map(([n], i) => ({ label: `_${n.replace(/^pairs of /, "").replace(/s$/, "")}`, value: counts[i] }));
    } else if (kind === "handshake") {
      const n = rng.int(4, 15);
      values = { n, r: 2 };
      exact = nCr(n, 2);
      const p = rng.pick(PEOPLE);
      prompt = `${n} ${p} meet, and every pair shakes hands exactly once. How many handshakes are there?${WHOLE}`;
      explanation = `Each handshake is a pair of people, and order doesn't matter.\n\n\`${n} × ${n - 1} ÷ 2 = ${exact}\`, so there are **${exact}** handshakes.`;
      hints = [`Each person shakes hands with the ${n - 1} others.`, `\`${n} × ${n - 1}\` counts every handshake twice (once from each person), so halve it.`];
      cands = [n * (n - 1), n * n, (n * (n + 1)) / 2, n * 2];
    } else if (kind === "code") {
      const L = rng.int(2, 4);
      const sym = rng.pick([["the 10 digits 0 to 9", 10], ["the 26 letters A to Z", 26], ["the 5 digits 1 to 5", 5], ["the 6 letters A to F", 6]]);
      if (sym[1] === 26 && L > 3) return null;
      values = { k: sym[1], L };
      exact = sym[1] ** L;
      prompt = `A code is ${L} characters long, and each character is one of ${sym[0]}. Characters may repeat. How many different codes are possible?${WHOLE}`;
      explanation = `Each of the ${L} positions has ${sym[1]} choices, because repeats are allowed.\n\n\`${Array(L).fill(sym[1]).join(" × ")} = ${sym[1]}^${L} = ${exact}\`, so there are **${exact}** codes.`;
      hints = [`Each position can be any of the ${sym[1]} characters, whatever the other positions are.`, `Multiply ${sym[1]} by itself ${L} times: \`${sym[1]}^${L}\`.`];
      cands = [sym[1] * L, nPr(sym[1], L), sym[1] ** (L - 1), L ** sym[1] < 1e7 ? L ** sym[1] : sym[1] * L * 2];
      given = [{ label: "_k", value: sym[1] }, { label: "_L", value: L }];
    } else if (kind === "podium") {
      const n = rng.int(5, 12);
      const r = rng.int(2, 4);
      const ev = rng.pick(RACES);
      values = { n, r };
      exact = nPr(n, r);
      const places = ["1st", "2nd", "3rd", "4th"].slice(0, r);
      prompt = `${n} people enter ${ev}. Prizes go to ${andList(places)} place. In how many different ways can these ${r} places be filled?${WHOLE}`;
      explanation = `Order matters (1st is different from 2nd), and nobody can take two places.\n\n\`${n}P${r} = ${prodStr(n, r)} = ${exact}\`, so the answer is **${exact}**.`;
      hints = [`Order matters here, and nobody can win twice: ${n} people could come 1st.`, `Then ${n - 1} could come 2nd${r > 2 ? `, ${n - 2} 3rd` : ""}${r > 3 ? `, ${n - 3} 4th` : ""}. Multiply: \`${prodStr(n, r)}\`.`];
      cands = [nCr(n, r), n ** r, n * r, fact(n) / fact(r)];
      given = [{ label: "_n", value: n }, { label: "_r", value: r }];
    } else if (kind === "choose") {
      const n = rng.int(6, 15);
      const r = rng.int(2, 5);
      const g = rng.pick(GROUPS);
      values = { n, r };
      exact = nCr(n, r);
      prompt = `A ${g} of ${n} people chooses ${r} of them to go to a meeting. The order doesn't matter. How many different groups of ${r} are possible?${WHOLE}`;
      explanation = `Order doesn't matter, so use combinations.\n\n\`${n}C${r} = (${prodStr(n, r)}) ÷ (${prodStr(r, r)}) = ${nPr(n, r)} ÷ ${fact(r)} = ${exact}\`, so the answer is **${exact}**.`;
      hints = [`If order mattered, there would be \`${prodStr(n, r)}\` ways. But here the same ${r} people in a different order are the same group.`, `Each group of ${r} was counted ${r}! = ${prodStr(r, r)} times, so divide: \`(${prodStr(n, r)}) ÷ (${prodStr(r, r)})\`.`];
      cands = [nPr(n, r), n * r, n ** r < 1e9 ? n ** r : nPr(n, r) * 2, nCr(n, r - 1)];
      given = [{ label: "_n", value: n }, { label: "_r", value: r }];
    } else if (kind === "codeNoRep") {
      const L = rng.int(3, 5);
      const sym = rng.pick([["the 10 digits 0 to 9", 10], ["the 26 letters A to Z", 26], ["the 9 digits 1 to 9", 9]]);
      if (sym[1] === 26 && L > 4) return null;
      values = { k: sym[1], L };
      exact = nPr(sym[1], L);
      prompt = `A code is ${L} characters long, and each character is one of ${sym[0]}. No character may be used twice. How many different codes are possible?${WHOLE}`;
      explanation = `Order matters and there are no repeats, so each position has one fewer choice.\n\n\`${prodStr(sym[1], L)} = ${exact}\`, so there are **${exact}** codes.`;
      hints = [`The first position has ${sym[1]} choices. A character can't repeat, so the second has ${sym[1] - 1}.`, `Keep going for all ${L} positions and multiply: \`${prodStr(sym[1], L)}\`.`];
      cands = [sym[1] ** L, nCr(sym[1], L), sym[1] * L, nPr(sym[1], L - 1)];
      given = [{ label: "_k", value: sym[1] }, { label: "_L", value: L }];
    } else if (kind === "word") {
      const w = rng.pick(DISTINCT_WORDS);
      const n = w.length;
      values = { word: w };
      exact = fact(n);
      prompt = `How many different arrangements (orders) of all the letters in the word ${w} are there? Every letter is different.${WHOLE}`;
      explanation = `${w} has ${n} different letters, so the arrangements are \`${n}! = ${prodStr(n, n)} = ${exact}\`. The answer is **${exact}**.`;
      hints = [`${w} has ${n} letters, all different. Any of them could go first.`, `Then ${n - 1} are left for the second place, and so on: \`${prodStr(n, n)}\`.`];
      cands = [fact(n - 1), n * n, n ** 3, 2 * fact(n - 1)];
    } else if (kind === "wordRep") {
      const w = rng.pick(REPEAT_WORDS);
      const n = w.length;
      const lc = [...letterCounts(w)].filter(([, c]) => c > 1);
      values = { word: w };
      exact = fact(n) / lc.reduce((a, [, c]) => a * fact(c), 1);
      const reps = andList(lc.map(([ch, c]) => `${ch} appears ${c === 2 ? "twice" : `${c} times`}`));
      const den = lc.map(([, c]) => `${c}!`).join(" × ");
      prompt = `How many different arrangements of all the letters in the word ${w} are there?${WHOLE}`;
      explanation = `${w} has ${n} letters, and ${reps}. Swapping identical letters doesn't make a new arrangement, so divide by the ways to arrange each repeated letter.\n\n\`${n}! ÷ (${den}) = ${fact(n)} ÷ ${lc.reduce((a, [, c]) => a * fact(c), 1)} = ${exact}\`, so the answer is **${exact}**.`;
      hints = [`If all ${n} letters were different, there would be ${n}! arrangements. But in ${w}, ${reps}.`, `Swapping identical letters gives the same word, so divide ${n}! by ${den}.`];
      cands = [fact(n), fact(n) / 2, fact(n - 1), exact * 2];
    } else if (kind === "twoGroups") {
      const g1 = rng.int(4, 9);
      const g2 = rng.int(4, 9);
      const a = rng.int(2, Math.min(4, g1 - 1));
      const b = rng.int(1, Math.min(3, g2 - 1));
      const names = rng.pick([["teachers", "students"], ["adults", "children"], ["seniors", "juniors"], ["coaches", "players"]]);
      values = { g1, g2, a, b };
      exact = nCr(g1, a) * nCr(g2, b);
      prompt = `A committee needs ${a} ${names[0]} and ${b} ${names[1]}. There are ${g1} ${names[0]} and ${g2} ${names[1]} to choose from. How many different committees are possible?${WHOLE}`;
      explanation =
        `Choose each group separately (order doesn't matter), then multiply.\n\n` +
        `${cap(names[0])}: \`${g1}C${a} = ${nCr(g1, a)}\`. ${cap(names[1])}: \`${g2}C${b} = ${nCr(g2, b)}\`.\n\n` +
        `\`${nCr(g1, a)} × ${nCr(g2, b)} = ${exact}\`, so the answer is **${exact}**.`;
      hints = [`Choose the ${names[0]} and the ${names[1]} separately. Order doesn't matter, so each is a combination.`, `Work out \`${g1}C${a}\` and \`${g2}C${b}\`, then multiply them, because any choice of ${names[0]} goes with any choice of ${names[1]}.`];
      cands = [nCr(g1, a) + nCr(g2, b), nCr(g1 + g2, a + b), nPr(g1, a) * nPr(g2, b), nCr(g1, a) * g2];
      given = [{ label: `_${names[0]}`, value: g1 }, { label: `_${names[1]}`, value: g2 }];
    } else if (kind === "together") {
      const n = rng.int(4, 7);
      const p = rng.pick([["Ana", "Ben"], ["Raj", "Sofia"], ["Tom", "Lena"], ["Omar", "Yuki"]]);
      values = { n };
      exact = 2 * fact(n - 1);
      prompt = `${n} people, including ${p[0]} and ${p[1]}, sit in a row of ${n} chairs. In how many orders can they sit if ${p[0]} and ${p[1]} must sit next to each other?${WHOLE}`;
      explanation =
        `Glue ${p[0]} and ${p[1]} together into one block. Then there are ${n - 1} "units" to arrange: \`${n - 1}! = ${fact(n - 1)}\`.\n\n` +
        `Inside the block they can sit in 2 orders, so \`2 × ${fact(n - 1)} = ${exact}\`. The answer is **${exact}**.`;
      hints = [`Treat ${p[0]} and ${p[1]} as one block. How many "units" are there to arrange then?`, `Arrange the ${n - 1} units (\`${n - 1}!\`), then multiply by the 2 ways ${p[0]} and ${p[1]} can sit inside their block.`];
      cands = [fact(n - 1), fact(n), fact(n) - exact, 2 * fact(n - 2)];
    } else {
      // Multi-part: choose r of n, then the number of those that include one named person.
      const n = rng.int(7, 14);
      const r = rng.int(3, 5);
      const name = rng.pick(["Zara", "Eli", "Noor", "Finn", "Ivy", "Theo"]);
      const g = rng.pick(GROUPS.filter((x) => x !== "team"));
      const all = nCr(n, r);
      const inc = nCr(n - 1, r - 1);
      const second = rng.pick(["with", "without"]);
      const ans2 = second === "with" ? inc : all - inc;
      const prompt2 = `A ${g} of ${n} people, including ${name}, picks a team of ${r}. The order doesn't matter. Give whole numbers.`;
      const parts = [
        {
          id: "teams", label: "All teams", ask: `How many different teams of ${r} are possible?`, answerType: "number", answer: all, tolerance: 0,
          hint: `Order doesn't matter: \`${n}C${r} = (${prodStr(n, r)}) ÷ (${prodStr(r, r)})\`.`,
        },
        second === "with"
          ? {
              id: "with", label: `With ${name}`, ask: `How many of those teams include ${name}?`, answerType: "number", answer: inc, tolerance: 0,
              hint: `Put ${name} in the team first. Then choose the other ${r - 1} from the remaining ${n - 1} people: \`${n - 1}C${r - 1}\`.`,
            }
          : {
              id: "without", label: `Without ${name}`, ask: `How many of those teams do not include ${name}?`, answerType: "number", answer: ans2, tolerance: 0,
              hint: `Leave ${name} out, then choose all ${r} from the other ${n - 1} people: \`${n - 1}C${r}\`.`,
            },
      ];
      const explanation =
        `**All teams:** \`${n}C${r} = ${nPr(n, r)} ÷ ${fact(r)} = ${all}\`.\n\n` +
        (second === "with"
          ? `**With ${name}:** ${name} takes one place, and the other ${r - 1} come from ${n - 1} people: \`${n - 1}C${r - 1} = ${inc}\`.`
          : `**Without ${name}:** all ${r} come from the other ${n - 1} people: \`${n - 1}C${r} = ${ans2}\`. (Check: \`${all} - ${inc}\`, the teams with ${name}.)`);
      return {
        prompt: prompt2, answerType: "multi", parts, explanation,
        hints: ["A team is a combination: the same people in a different order are the same team."],
        given: [{ label: "_n", value: n }, { label: "_r", value: r }],
        params: { kind: "countMulti", n, r, second },
      };
    }
    const q = { prompt, explanation, hints, given, params: { kind, values } };
    return finishNum(q, exact, false, cands, rng);
  });
}

// ---------------------------------------------------------------------------------------------
// Expected value: payoffs in whole cents; answers rounded to 2 decimal places.

// Face groups for a die game, e.g. [{ faces: [6], prize: 500 }, { faces: [4, 5], prize: 200 }].
const facesText = (f) => (f.length === 1 ? art(f[0]) : f.length === 2 ? `${art(f[0])} or ${f[1]}` : `${art(f[0])}, ${f.slice(1, -1).join(", ")}${f.length > 2 ? "," : ""} or ${f[f.length - 1]}`);

function evDie(rng, difficulty) {
  const sides = difficulty === "easy" ? rng.pick([4, 6, 6, 8]) : rng.pick([6, 6, 8, 10]);
  const nGroups = difficulty === "easy" ? rng.int(1, 2) : 2;
  const faces = rng.shuffle(Array.from({ length: sides }, (_, i) => i + 1));
  const groups = [];
  let at = 0;
  for (let g = 0; g < nGroups; g++) {
    const size = g === 0 ? 1 : rng.int(1, 2);
    const f = faces.slice(at, at + size).sort((a, b) => a - b);
    at += size;
    groups.push({ faces: f, prize: 100 * rng.int(1, g === 0 ? 20 : 6) + (difficulty !== "easy" && rng.next() < 0.3 ? 50 : 0) });
  }
  groups.sort((a, b) => b.prize - a.prize);
  const cost = difficulty === "easy" ? 0 : 50 * rng.int(2, 8);
  const rule = andList(groups.map((g) => `${money(g.prize)} for ${facesText(g.faces)}`));
  return {
    space: { type: "die", sides, groups, cost },
    setup: `You roll a fair ${sides}-sided die numbered 1 to ${sides}. You win ${rule}, and nothing otherwise.${cost ? ` It costs ${money(cost)} to play.` : ""}`,
    outcomes: sides,
    terms: groups.map((g) => ({ count: g.faces.length, prize: g.prize, what: facesText(g.faces) })),
    cost,
    givenL: groups.map((g, i) => ({ label: `_prize${i + 1}`, value: g.prize / 100 })),
  };
}

function evSpinner(rng, difficulty) {
  const nVals = rng.int(2, 3);
  const vals = rng.shuffle([1, 2, 3, 4, 5, 10, 20]).slice(0, nVals).sort((a, b) => b - a);
  const counts = vals.map(() => rng.int(1, 4));
  const zero = rng.int(0, 3);
  const total = sum(counts) + zero;
  const moneyMode = difficulty !== "easy";
  const cost = moneyMode ? 50 * rng.int(1, 6) : 0;
  const unit = moneyMode ? (v) => money(v * 100) : (v) => `${v} point${v === 1 ? "" : "s"}`;
  const secs = vals.map((v, i) => `${counts[i]} ${counts[i] === 1 ? "section wins" : "sections win"} ${unit(v)}`);
  if (zero) secs.push(`${zero} ${zero === 1 ? "section wins" : "sections win"} nothing`);
  return {
    space: { type: "spinner", vals: vals.map((v) => v * 100), counts, zero, cost },
    setup: `A fair spinner has ${total} equal sections: ${andList(secs)}.${cost ? ` Each spin costs ${money(cost)}.` : ""}`,
    outcomes: total,
    terms: vals.map((v, i) => ({ count: counts[i], prize: v * 100, what: unit(v) })),
    cost,
    points: !moneyMode,
    givenL: vals.map((v, i) => ({ label: `_win${i + 1}`, value: v })),
  };
}

function evRaffle(rng) {
  const N = 50 * rng.int(2, 10);
  const tiers = [
    { k: 1, prize: 100 * rng.pick([50, 100, 150, 200, 250]) },
    { k: rng.int(2, 5), prize: 100 * rng.pick([10, 15, 20, 25]) },
  ];
  if (rng.next() < 0.5) tiers.push({ k: rng.int(5, 10), prize: 100 * rng.int(2, 5) });
  const cost = 50 * rng.int(1, 8);
  const pr = andList(tiers.map((t) => `${t.k === 1 ? "one prize" : `${t.k} prizes`} of ${money(t.prize)}`));
  return {
    space: { type: "raffle", N, tiers, cost },
    setup: `A raffle sells ${N} tickets at ${money(cost)} each. There ${tiers[0].k === 1 ? "is" : "are"} ${pr}, and each ticket can win at most one prize.`,
    outcomes: N,
    terms: tiers.map((t) => ({ count: t.k, prize: t.prize, what: `a ${money(t.prize)} prize` })),
    cost,
    who: "ticket",
    givenL: [{ label: "_tickets", value: N }, ...tiers.map((t, i) => ({ label: `_prize${i + 1}`, value: t.prize / 100 }))],
  };
}

function evTwoDice(rng) {
  const s = rng.pick([3, 5, 7, 7, 9, 11]); // odd totals, so no double adds up to s
  const a = 100 * rng.int(2, 10);
  const b = 100 * rng.int(2, 8);
  const cost = 50 * rng.int(2, 6);
  const nS = 6 - Math.abs(s - 7);
  return {
    space: { type: "twoDice", s, a, b, cost },
    setup: `You roll two fair six-sided dice. You win ${money(a)} if the total is ${s}, ${money(b)} if both dice show the same number, and nothing otherwise. It costs ${money(cost)} to play.`,
    outcomes: 36,
    terms: [{ count: nS, prize: a, what: `a total of ${s}` }, { count: 6, prize: b, what: "a double" }],
    cost,
    givenL: [{ label: "_win_total", value: a / 100 }, { label: "_win_double", value: b / 100 }],
  };
}

function evBag(rng) {
  const b = bag(rng, 2, 2, 6);
  const t = b.total;
  const prize = 100 * rng.int(2, 10);
  const cost = 50 * rng.int(1, 6);
  const same = sum(b.counts.map((c) => c * (c - 1)));
  return {
    space: { type: "bag", counts: b.counts, prize, cost },
    setup: `A bag holds ${bagText(b)} ${b.thing}. You pick two without looking, without replacement. You win ${money(prize)} if they are the same colour, and nothing otherwise. It costs ${money(cost)} to play.`,
    outcomes: t * (t - 1),
    terms: [{ count: same, prize, what: "the same colour" }],
    cost,
    sameSteps: b.cols.map((c, i) => `${b.counts[i]}/${t} × ${b.counts[i] - 1}/${t - 1}`),
    givenL: [...bagGiven(b), { label: "_prize", value: prize / 100 }],
  };
}

// Turns a scenario into a question; exact EV in dollars per play.
function evParts(sc) {
  const T = sum(sc.terms.map((t) => t.count * t.prize));
  const exactWin = T / sc.outcomes / 100;
  const exact = exactWin - sc.cost / 100;
  const terms = sc.terms.map((t) => `${sc.points ? t.prize / 100 : dollars(t.prize)} × ${t.count}/${sc.outcomes}`);
  return { T, exactWin, exact, terms };
}

function evExplain(sc, ev, ask) {
  const lines = [];
  lines.push(`Expected value = sum of (payout × probability)${sc.cost ? ", minus the cost to play" : ""}.`);
  if (sc.sameSteps) lines.push(`P(same colour) = ${sc.sameSteps.map((x) => `\`${x}\``).join(" + ")} = \`${sc.terms[0].count}/${sc.outcomes}\`.`);
  const winTxt = `\`${ev.terms.join(" + ")}\` = ${num(ev.exactWin)}`;
  lines.push(`Expected ${sc.points ? "score" : "winnings"}: ${winTxt}${sc.points ? " points" : " dollars"}.`);
  if (sc.cost) lines.push(`Expected ${ask}: \`${num(ev.exactWin)} - ${dollars(sc.cost)}\` = ${num(ev.exact)}.`);
  const shown = fmt2(ev.exact);
  lines.push(Math.abs(ev.exact - Number(shown)) < 1e-9 ? `The answer is **${shown}**.` : `Rounded to 2 decimal places: **${shown}**.`);
  return lines.join("\n\n");
}

function genEV(difficulty, rng) {
  checkDifficulty(difficulty);
  return retry(() => {
    let sc;
    if (difficulty === "easy") sc = rng.next() < 0.55 ? evDie(rng, "easy") : evSpinner(rng, "easy");
    else if (difficulty === "medium") {
      const r = rng.next();
      sc = r < 0.4 ? evDie(rng, "medium") : r < 0.7 ? evRaffle(rng) : evSpinner(rng, "medium");
    } else {
      const r = rng.next();
      sc = r < 0.4 ? evTwoDice(rng) : r < 0.75 ? evBag(rng) : evRaffle(rng);
    }
    const ev = evParts(sc);
    if (nearHalf(ev.exact) || Math.abs(ev.exact) < 0.01) return null; // no "0.00" answers
    if (sc.who && ev.exact > 0) return null; // a raffle pays out less than it takes in
    const ask = sc.cost ? `profit per ${sc.who || "game"}` : sc.points ? "score" : "winnings";
    const tail = sc.points ? DP2 : sc.cost ? " Give your answer in dollars, rounded to 2 decimal places, with a minus sign if it is a loss." : " Give your answer in dollars, rounded to 2 decimal places.";
    const given = sc.givenL.length + (sc.cost ? 1 : 0) >= 2 ? [...sc.givenL, ...(sc.cost ? [{ label: "_cost", value: sc.cost / 100 }] : [])] : undefined;
    const winLabels = sc.givenL.filter((g) => /^_(prize|win)/.test(g.label)).map((g) => g.label);
    const hints = [
      `Expected value = sum of (payout × probability) over every outcome. There are ${sc.outcomes} equally likely outcomes${sc.sameSteps ? " (ordered pairs)" : ""}.`,
      `${sc.sameSteps ? `First find P(same colour): add \`${sc.sameSteps.join(" + ")}\`. Then the` : "The"} terms are \`${ev.terms.join(" + ")}\`${given && winLabels.length ? ` (the payouts are ${winLabels.join(", ")} in the calculator)` : ""}. Outcomes that win nothing add 0.`,
    ];
    if (sc.cost) hints.push(`That is the expected amount won per play. Take away the ${money(sc.cost)} cost (\`_cost\`) to get the expected ${ask}, then round to 2 decimal places.`);
    else hints.push("Add the terms and round to 2 decimal places.");

    // Hard: sometimes a multi-part question with a "who does it favour" part.
    if (difficulty === "hard" && sc.cost && rng.next() < 0.35) {
      if (Math.abs(ev.exact) < 0.05) return null;
      const games = rng.pick([20, 50, 100, 200]);
      const totalExact = ev.exact * games;
      if (nearHalf(totalExact)) return null;
      const fav = ev.exact > 0 ? "The player" : "The organiser";
      const parts = [
        {
          id: "ev", label: "Expected profit", ask: `What is the player's expected profit per ${sc.who || "game"}, in dollars? Round to 2 decimal places, with a minus sign for a loss.`,
          answerType: "number", answer: round2(ev.exact), tolerance: 0.005,
          hint: `Add \`${ev.terms.join(" + ")}\`, then subtract the ${money(sc.cost)} cost.`,
        },
        {
          id: "total", label: `Over ${games} plays`, ask: `What is the player's expected total profit over ${games} ${sc.who ? "tickets" : "games"}, in dollars? Use the unrounded value per play, then round to 2 decimal places.`,
          answerType: "number", answer: round2(totalExact), tolerance: 0.005,
          hint: `Expected values add up: multiply the expected profit per play by ${games}.`,
        },
        {
          id: "rec", label: "Who it favours", ask: "In the long run, who does this game favour?", answerType: "choice", answer: fav, choices: ["The player", "The organiser"],
          hint: "If the expected profit per play is positive, the player gains on average; if it is negative, the organiser does.",
        },
      ];
      const explanation = `${evExplain(sc, ev, `profit per ${sc.who || "game"}`)}\n\nOver ${games} plays: \`${num(ev.exact)} × ${games}\` ≈ ${num(totalExact)}, which rounds to **${fmt2(totalExact)}**.\n\nThe expected profit is ${ev.exact > 0 ? "positive" : "negative"}, so the game favours **${fav.toLowerCase()}**.`;
      return {
        prompt: sc.setup, answerType: "multi", parts, explanation, hints: [hints[0]], given,
        params: { kind: "evMulti", space: sc.space, games },
      };
    }

    const prompt = `${sc.setup} What ${ask === "winnings" ? "are" : "is"} the expected ${ask}?${tail}`;
    const explanation = evExplain(sc, ev, ask);
    const q = { prompt, explanation, hints, given, params: { kind: "ev", space: sc.space } };
    const cands = [
      ev.exactWin, // forgot the cost
      ev.exact + 2 * sc.cost / 100,
      sum(sc.terms.map((t) => t.prize)) / 100 / sc.outcomes - sc.cost / 100, // ignored how many outcomes win each prize
      sum(sc.terms.map((t) => t.prize)) / 100 / sc.terms.length - sc.cost / 100, // averaged the prizes
      -ev.exact,
    ];
    return finishNum(q, ev.exact, true, cands, rng, !sc.cost);
  });
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  checkDifficulty(difficulty);
  if (subtopic === "basic") return genBasic(difficulty, rng);
  if (subtopic === "combined") return genCombined(difficulty, rng);
  if (subtopic === "counting") return genCounting(difficulty, rng);
  if (subtopic === "expected-value") return genEV(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// verify(): rebuild the sample space and count outcomes one at a time.

const VCOLOURS_EXPAND = (counts) => {
  const items = [];
  counts.forEach((c, i) => {
    for (let j = 0; j < c; j++) items.push(i);
  });
  return items;
};

function isPrimeV(x) {
  if (x < 2) return false;
  for (let d = 2; d * d <= x; d++) if (x % d === 0) return false;
  return true;
}

// Number events tested on each outcome.
function numPred(e) {
  switch (e.type) {
    case "even": return (x) => x % 2 === 0;
    case "odd": return (x) => x % 2 === 1;
    case "gt": return (x) => x > e.k;
    case "lt": return (x) => x < e.k;
    case "eq": return (x) => x === e.k;
    case "atleast": return (x) => x >= e.k;
    case "atmost": return (x) => x <= e.k;
    case "mult": return (x) => x % e.a === 0;
    case "prime": return isPrimeV;
    case "square": return (x) => { for (let r = 1; r * r <= x; r++) if (r * r === x) return true; return false; };
    case "multOr": return (x) => x % e.a === 0 || x % e.b === 0;
    case "evenGt": return (x) => x % 2 === 0 && x > e.k;
    case "oddOrGt": return (x) => x % 2 === 1 || x > e.k;
    default: return null;
  }
}

// Cards: suit 0-3 (hearts, diamonds, clubs, spades), rank 1-13 (ace = 1, jack 11, queen 12, king 13).
const CARD_PRED = {
  heart: (s) => s === 0, diamond: (s) => s === 1, club: (s) => s === 2, spade: (s) => s === 3,
  red: (s) => s <= 1, black: (s) => s >= 2,
  king: (s, r) => r === 13, queen: (s, r) => r === 12, jack: (s, r) => r === 11, ace: (s, r) => r === 1,
  face: (s, r) => r >= 11, number: (s, r) => r >= 2 && r <= 10,
};

// Every ordered tuple of `n` draws from `items` (with or without replacement).
function forEachDraw(items, n, replace, fn) {
  const pick = [];
  const used = new Array(items.length).fill(false);
  const rec = () => {
    if (pick.length === n) { fn(pick); return; }
    for (let i = 0; i < items.length; i++) {
      if (!replace && used[i]) continue;
      used[i] = true;
      pick.push(items[i]);
      rec();
      pick.pop();
      used[i] = false;
    }
  };
  rec();
}

// Every roll of k six-sided dice.
function forEachDice(k, fn) {
  const total = 6 ** k;
  for (let code = 0; code < total; code++) {
    const r = [];
    let c = code;
    for (let i = 0; i < k; i++) { r.push((c % 6) + 1); c = Math.floor(c / 6); }
    fn(r);
  }
}

// [favourable, all] for a probability question.
function countProb(p) {
  let N = 0, D = 0;
  const tally = (ok) => { D++; if (ok) N++; };
  switch (p.kind) {
    case "numbers": {
      const f = numPred(p.event);
      if (!f) return null;
      for (let x = 1; x <= p.n; x++) tally(f(x));
      break;
    }
    case "cards": {
      const A = CARD_PRED[p.a], B = p.b ? CARD_PRED[p.b] : null;
      if (!A || (p.op !== "one" && !B)) return null;
      for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) {
        const a = A(s, r), b = B ? B(s, r) : false;
        tally(p.op === "one" ? a : p.op === "or" ? a || b : p.op === "and" ? a && b : a && !b);
      }
      break;
    }
    case "bag": {
      const counts = p.counts.slice();
      const ev = p.event;
      if (ev.removed) {
        const r = p.cols.indexOf(ev.removed.col);
        if (r < 0) return null;
        counts[r] -= ev.removed.k;
      }
      const want = ev.cols.map((c) => p.cols.indexOf(c));
      for (const it of VCOLOURS_EXPAND(counts)) tally(ev.type === "not" ? !want.includes(it) : want.includes(it));
      break;
    }
    case "letters": {
      for (const ch of p.word) {
        const v = "AEIOU".indexOf(ch) >= 0;
        tally(p.event.type === "vowel" ? v : p.event.type === "consonant" ? !v : ch === p.event.letter);
      }
      break;
    }
    case "coinDie": {
      for (const c of ["H", "T"]) for (let d = 1; d <= 6; d++) {
        const a = c === p.side;
        const b = p.dt === "even" ? d % 2 === 0 : p.dt === "odd" ? d % 2 === 1 : p.dt === "eq" ? d === p.k : d > p.k;
        tally(p.op === "and" ? a && b : a || b);
      }
      break;
    }
    case "coins": {
      for (let m = 0; m < 2 ** p.k; m++) {
        let heads = 0;
        for (let i = 0; i < p.k; i++) if ((m >> i) & 1) heads++;
        const t = p.event.type;
        tally(t === "allH" ? heads === p.k : t === "allT" ? heads === 0 : t === "exactlyOne" ? heads === 1 : heads >= 1);
      }
      break;
    }
    case "dice": {
      const e = p.event;
      forEachDice(p.k, (r) => {
        const [x, y] = r;
        let ok;
        switch (e.type) {
          case "bothEven": ok = x % 2 === 0 && y % 2 === 0; break;
          case "bothAtLeast": ok = x >= e.m && y >= e.m; break;
          case "bothEq": ok = x === e.m && y === e.m; break;
          case "sumEq": ok = x + y === e.s; break;
          case "sumGt": ok = x + y > e.s; break;
          case "sumLt": ok = x + y < e.s; break;
          case "double": ok = x === y; break;
          case "sumOrDouble": ok = x + y === e.s || x === y; break;
          case "atLeastOne": ok = r.includes(e.m); break;
          default: ok = null;
        }
        if (ok === null) D = -Infinity;
        tally(ok);
      });
      break;
    }
    case "draw": {
      const items = VCOLOURS_EXPAND(p.counts);
      const ci = p.cols.indexOf(p.event.col);
      forEachDraw(items, p.n, p.replace, (d) => {
        const hits = d.filter((x) => x === ci).length;
        const t = p.event.type;
        tally(t === "all" || t === "all3" ? hits === d.length : t === "atLeastOne" ? hits >= 1 : t === "exactlyOne" ? hits === 1 : t === "same" ? d.every((x) => x === d[0]) : !d.every((x) => x === d[0]));
      });
      break;
    }
    default:
      return null;
  }
  return D > 0 ? [N, D] : null;
}

// The typed fraction must be in simplest form and equal N/D exactly (cross-multiplied).
function fracMatches(answer, N, D) {
  const f = parseFrac(answer);
  if (!f) return false;
  const [a, b] = f;
  return a > 0 && b > 1 && gcd(a, b) === 1 && a * D === N * b;
}

// Counting by recursion (not the factorial formulas generate() uses).
function pascal(n, r) {
  const row = [1];
  for (let i = 1; i <= n; i++) {
    for (let j = Math.min(i, r); j >= 1; j--) row[j] = (row[j] || 0) + row[j - 1];
  }
  return row[r] || 0;
}
// Ordered selections: P(n, r) = P(n-1, r) + r · P(n-1, r-1) (the last item is unused, or used in one of r places).
function permRec(n, r, memo = new Map()) {
  if (r === 0) return 1;
  if (n < r) return 0;
  const key = `${n},${r}`;
  if (!memo.has(key)) memo.set(key, permRec(n - 1, r, memo) + r * permRec(n - 1, r - 1, memo));
  return memo.get(key);
}
// Distinct arrangements of a multiset: pick the first letter, recurse on what is left.
function arrangements(counts, memo = new Map()) {
  const key = counts.join(",");
  if (counts.every((c) => c === 0)) return 1;
  if (memo.has(key)) return memo.get(key);
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    if (!counts[i]) continue;
    const next = counts.slice();
    next[i]--;
    total += arrangements(next, memo);
  }
  memo.set(key, total);
  return total;
}
// Strings of length L over k symbols, counted by adding k copies of the shorter count.
function stringsRec(k, L) {
  let c = 1;
  for (let i = 0; i < L; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += c;
    c = s;
  }
  return c;
}
// Brute force: seatings of n people where person 0 and person 1 are side by side.
function togetherBrute(n) {
  let count = 0;
  const seat = [];
  const used = new Array(n).fill(false);
  const rec = () => {
    if (seat.length === n) {
      if (Math.abs(seat.indexOf(0) - seat.indexOf(1)) === 1) count++;
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; seat.push(i); rec(); seat.pop(); used[i] = false;
    }
  };
  rec();
  return count;
}

function countingTruth(kind, v) {
  switch (kind) {
    case "arrange": return arrangements(new Array(v.n).fill(1));
    case "product": {
      // Nested enumeration of every outfit.
      let c = 0;
      const rec = (i) => { if (i === v.counts.length) { c++; return; } for (let j = 0; j < v.counts[i]; j++) rec(i + 1); };
      rec(0);
      return c;
    }
    case "handshake": {
      let c = 0;
      for (let i = 0; i < v.n; i++) for (let j = i + 1; j < v.n; j++) c++;
      return c;
    }
    case "code": return stringsRec(v.k, v.L);
    case "podium": return permRec(v.n, v.r);
    case "choose": return pascal(v.n, v.r);
    case "codeNoRep": return permRec(v.k, v.L);
    case "word":
    case "wordRep": {
      const m = new Map();
      for (const ch of v.word) m.set(ch, (m.get(ch) || 0) + 1);
      return arrangements([...m.values()]);
    }
    case "twoGroups": return pascal(v.g1, v.a) * pascal(v.g2, v.b);
    case "together": return togetherBrute(v.n);
    default: return null;
  }
}

// Expected value: list every equally likely outcome's payout in cents. Returns [total cents, outcomes, cost].
function evSpace(s) {
  const pays = [];
  if (s.type === "die") {
    for (let f = 1; f <= s.sides; f++) {
      const g = s.groups.find((gg) => gg.faces.includes(f));
      pays.push(g ? g.prize : 0);
    }
  } else if (s.type === "spinner") {
    s.counts.forEach((c, i) => { for (let j = 0; j < c; j++) pays.push(s.vals[i]); });
    for (let j = 0; j < s.zero; j++) pays.push(0);
  } else if (s.type === "raffle") {
    for (const t of s.tiers) for (let j = 0; j < t.k; j++) pays.push(t.prize);
    while (pays.length < s.N) pays.push(0);
  } else if (s.type === "twoDice") {
    forEachDice(2, ([x, y]) => pays.push(x + y === s.s ? s.a : x === y ? s.b : 0));
  } else if (s.type === "bag") {
    forEachDraw(VCOLOURS_EXPAND(s.counts), 2, false, ([x, y]) => pays.push(x === y ? s.prize : 0));
  } else return null;
  return [sum(pays), pays.length, s.cost || 0];
}

// |answer - (T/n - cost)/100| ≤ 0.005, in whole-number arithmetic where possible.
function evMatches(x, T, n, cost, times = 1) {
  if (!Number.isFinite(x)) return false;
  const exactCentsTimesN = (T - cost * n) * times; // = exact EV × 100 × n
  return Math.abs(x * 100 * n - exactCentsTimesN) <= 0.5 * n + 1e-6;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (question.answerType === "multi") {
    if (!answer || typeof answer !== "object") return false;
    if (p.kind === "drawMulti") {
      const items = VCOLOURS_EXPAND(p.counts);
      const ci = p.cols.indexOf(p.col);
      return p.specs.every((sp) => {
        let N = 0, D = 0;
        forEachDraw(items, 2, false, (d) => {
          D++;
          const hits = d.filter((x) => x === ci).length;
          if (sp.type === "all" ? hits === 2 : sp.type === "atLeastOne" ? hits >= 1 : hits === 1) N++;
        });
        return fracMatches(answer[sp.id], N, D);
      });
    }
    if (p.kind === "countMulti") {
      const all = pascal(p.n, p.r);
      // Brute force over subsets of n people (person 0 is the named one).
      let withCount = 0;
      for (let m = 0; m < 1 << p.n; m++) {
        let bits = 0;
        for (let i = 0; i < p.n; i++) if ((m >> i) & 1) bits++;
        if (bits === p.r && m & 1) withCount++;
      }
      const second = p.second === "with" ? withCount : all - withCount;
      return Number(answer.teams) === all && Number(answer[p.second]) === second;
    }
    if (p.kind === "evMulti") {
      const sp = evSpace(p.space);
      if (!sp) return false;
      const [T, n, cost] = sp;
      const favours = T - cost * n > 0 ? "The player" : "The organiser";
      return evMatches(Number(answer.ev), T, n, cost) && evMatches(Number(answer.total), T, n, cost, p.games) && answer.rec === favours;
    }
    return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;

  if (p.fmt === "frac") {
    const c = countProb(p);
    if (!c) return false;
    const [N, D] = c;
    if (!(N > 0 && N < D)) return false;
    return fracMatches(answer, N, D);
  }
  if (p.kind === "ev") {
    const sp = evSpace(p.space);
    if (!sp) return false;
    return evMatches(Number(answer), ...sp);
  }
  const truth = countingTruth(p.kind, p.values);
  if (truth === null || !Number.isFinite(truth)) return false;
  const x = Number(answer);
  return Number.isInteger(x) && x === truth;
}
