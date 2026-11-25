// Number Theory generator. Uses only the seeded rng passed in by the engine.
// Answers are whole numbers (tolerance 0) or multiple choice; there is no calculator, because
// working it out by hand is the point.
// verify() never reuses generate()'s shortcuts. generate() works with prime factorisations, the
// divisor-count formula, Euclid-style gcd/lcm, divisibility rules, cycles and modular inverses;
// verify() brute-forces from params: trial division by every number, counting divisors one by one,
// scanning for common divisors and multiples, long division digit by digit, simulating clocks,
// buses and weekdays step by step, multiplying powers out mod 10 or mod n, and trying every x.

// ---------------------------------------------------------------------------------------------
// Shared helpers (generation side)

const NAMES = ["Ava", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Hugo", "Isla", "Jack", "Kiran", "Lena", "Maya", "Noah", "Omar", "Priya", "Sam", "Tara", "Uma", "Zoe"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WHOLE = " Give a whole number.";

function gcd2(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const gcdN = (arr) => arr.reduce((g, x) => gcd2(g, x));
const lcm2 = (a, b) => (a / gcd2(a, b)) * b;
const lcmN = (arr) => arr.reduce((l, x) => lcm2(l, x));

// 6k ± 1 primality test (generation only).
function isPrime(n) {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}
const primesIn = (lo, hi) => {
  const out = [];
  for (let n = lo; n <= hi; n++) if (isPrime(n)) out.push(n);
  return out;
};

// Prime factorisation by dividing out primes in order: [[p, e], ...].
function factorize(n) {
  const out = [];
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      let e = 0;
      while (m % p === 0) {
        m /= p;
        e++;
      }
      out.push([p, e]);
    }
  }
  if (m > 1) out.push([m, 1]);
  return out;
}
const fmtFact = (f) => f.map(([p, e]) => (e === 1 ? `${p}` : `${p}^${e}`)).join(" × ");
const divisorCount = (f) => f.reduce((s, [, e]) => s * (e + 1), 1);
const smallestPrimeFactor = (n) => (n >= 2 ? factorize(n)[0][0] : 2);

// Retry a draw until ok() holds (deterministic: only the rng passed in). Throws if it never does,
// so the engine redraws with a new seed instead of using a value that breaks the question's rules.
function draw(make, ok, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const v = make();
    if (ok(v)) return v;
  }
  throw new Error("draw failed");
}

const digitSum = (n) => String(n).split("").reduce((s, c) => s + Number(c), 0);
// Alternating digit sum from the right (units digit +, tens -, ...), as used by the rule for 11.
const altSum = (n) => String(n).split("").reverse().reduce((s, c, i) => s + (i % 2 ? -1 : 1) * Number(c), 0);
const andList = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`);

// True when `tok` appears in `text` as a standalone number (not inside a longer number).
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasToken = (text, tok) => new RegExp(`(^|[^\\w.])${escRe(tok)}(?!\\w|\\.\\d)`).test(text);
// A hint that would name the answer (when the prompt doesn't already) is swapped for `alt`.
function guard(hint, alt, answer, prompt) {
  const t = String(answer);
  return hasToken(hint, t) && !hasToken(prompt, t) ? alt : hint;
}
const guardAll = (hints, answer, prompt) => hints.map(([h, alt]) => guard(h, alt, answer, prompt));

// 4 distinct whole-number choices: the answer + 3 plausible mistakes (topped up with neighbours).
function intChoices(correct, cands, rng, min = 0, max = Infinity) {
  if (!Number.isInteger(correct) || correct < min || correct > max) throw new Error(`bad answer ${correct}`);
  const seen = new Set([correct]);
  const out = [];
  const add = (v) => {
    if (out.length >= 3 || !Number.isInteger(v) || v < min || v > max || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  cands.forEach(add);
  for (let k = 1; out.length < 3; k++) {
    add(correct + k);
    add(correct - k);
  }
  return { answer: String(correct), choices: rng.shuffle([correct, ...out]).map(String) };
}

// A solved whole-number question becomes a typed number (70%) or multiple choice (30%).
function finishInt(base, correct, cands, rng, pChoice = 0.3, min = 0, max = Infinity) {
  if (rng.next() < pChoice) {
    const { answer, choices } = intChoices(correct, cands, rng, min, max);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: base.prompt + WHOLE, answer: correct, answerType: "number", tolerance: 0, choices: undefined };
}

// ---------------------------------------------------------------------------------------------
// Primes & factors

// Prime-looking composites: odd, not ending in 5.
function trickyComposites(lo, hi) {
  const out = [];
  for (let n = lo; n <= hi; n++) if (n % 2 === 1 && n % 5 !== 0 && !isPrime(n)) out.push(n);
  return out;
}

function qWhichPrime(difficulty, rng) {
  const [lo, hi] = { easy: [20, 100], medium: [100, 400], hard: [400, 1000] }[difficulty];
  const p = rng.pick(primesIn(lo, hi));
  // Medium and hard prefer composites that pass the quick tests for 3 as well.
  let pool = trickyComposites(lo, hi);
  if (difficulty !== "easy") {
    const hard3 = pool.filter((n) => n % 3 !== 0);
    if (hard3.length >= 6) pool = hard3;
  }
  const comps = rng.shuffle(pool).slice(0, 3);
  const choices = rng.shuffle([p, ...comps]).map(String);
  const list = `${choices.slice(0, 3).join(", ")} or ${choices[3]}`;
  const lead = rng.pick([
    `Which of these numbers is prime: ${list}?`,
    `Exactly one of ${list} is prime. Which one?`,
    `A prime number has exactly two factors: 1 and itself. Which of ${list} is prime?`,
    `Three of the numbers ${list} can be split into smaller factors. Which one is prime?`,
  ]);
  const root = Math.floor(Math.sqrt(hi));
  const testPrimes = primesIn(2, root);
  const prompt = lead;
  const explanation =
    `A number is prime if no prime up to its square root divides it.\n\n` +
    comps.map((c) => `- ${c} = ${smallestPrimeFactor(c)} × ${c / smallestPrimeFactor(c)}, so it is not prime.`).join("\n") +
    `\n- ${p} is not divisible by any of ${andList(primesIn(2, Math.floor(Math.sqrt(p))))} (the primes up to √${p}), so **${p}** is prime.`;
  const hints = [
    `You only need to test primes up to the square root. Every option here is below ${hi}, so testing ${andList(testPrimes)} is enough.`,
    "Use quick tests first: a digit sum that is a multiple of 3 means divisible by 3. Then try 7, 11 and 13 on what's left.",
    "Three of the options have a small prime factor. Cross those out as you find them.",
  ];
  return { prompt, answer: String(p), answerType: "choice", choices, explanation, hints, params: { kind: "isPrime" } };
}

function qSmallestPF(rng) {
  const p = rng.pick([7, 7, 11, 11, 13, 17, 19]);
  // n = p × m, with m odd and no prime factor below p, so p is the smallest prime factor.
  const n = draw(
    () => p * rng.int(p, Math.floor(600 / p)),
    (v) => v % 2 === 1 && smallestPrimeFactor(v) === p && v >= 45
  );
  const prompt = `What is the smallest prime factor of ${n}?`;
  const fails = primesIn(2, p - 1);
  const explanation =
    `Test the primes in order and stop at the first one that divides exactly.\n\n` +
    fails.map((q) => `- ${n} ÷ ${q} leaves a remainder of ${n % q}.`).join("\n") +
    `\n- ${n} ÷ ${p} = ${n / p} exactly, so the smallest prime factor is **${p}**.`;
  const hints = guardAll(
    [
      ["Test the primes in order, starting with the smallest, and stop at the first one that divides exactly.", null],
      [`${n} is odd, so 2 is out. Its digit sum is ${digitSum(n)}, which rules 3 in or out, and the last digit settles 5.`, `${n} is odd, so 2 is out. Use the digit-sum test for 3 next, then the last digit for 5.`],
      ["When 2, 3 and 5 all fail, carry on with the next primes and divide carefully.", null],
    ].map(([h, alt]) => [h, alt ?? h]),
    p,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "spf", n } };
  return finishInt(base, p, [2, n / p, ...primesIn(p + 1, p + 8)], rng, 0.4, 2);
}

function qLargestPF(rng) {
  const big = rng.pick(primesIn(7, 47));
  const n = draw(
    () => big * rng.pick([2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24]),
    (v) => v >= 60 && v <= 1200 && factorize(v).length >= 2
  );
  const f = factorize(n);
  const largest = f[f.length - 1][0];
  const prompt = `What is the largest prime factor of ${n}?`;
  const explanation = `Divide out the primes from the smallest up: ${n} = ${fmtFact(f)}.\n\nThe primes that appear are ${andList(f.map(([q]) => q))}, so the largest is **${largest}**.`;
  const smallParts = f.slice(0, -1).map(([q, e]) => q ** e);
  const rest = n / smallParts.reduce((a, b) => a * b, 1);
  const hints = guardAll(
    [
      ["Write the number as a product of primes by dividing out 2s, then 3s, then 5s, and so on.", "Write the number as a product of primes by dividing out the smallest primes first."],
      [`Dividing out the small primes leaves ${rest}. Is that prime, or can it be split further?`, "Keep dividing until what is left is prime. The last prime you reach is the largest."],
    ],
    largest,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "lpf", n } };
  return finishInt(base, largest, [n / largest, f[0][0], f.length > 2 ? f[f.length - 2][0] : largest + 2, n], rng, 0.4, 2);
}

// n built from small primes with exponents, inside [lo, hi], with at least `minPrimes` distinct primes.
function buildComposite(rng, lo, hi, minPrimes, maxPrimes) {
  return draw(
    () => {
      const k = rng.int(minPrimes, maxPrimes);
      const ps = rng.shuffle([2, 3, 5, 7, 11, 13]).slice(0, k).sort((a, b) => a - b);
      let n = 1;
      for (const p of ps) n *= p ** rng.int(1, p <= 3 ? 4 : 2);
      return n;
    },
    (n) => n >= lo && n <= hi && factorize(n).some(([, e]) => e >= 2)
  );
}

// 3 wrong factorisations: a changed exponent, swapped exponents, stopped too early, a dropped prime.
function factChoices(n, rng) {
  const f = factorize(n);
  const ans = fmtFact(f);
  const cands = [];
  const i = rng.int(0, f.length - 1);
  cands.push(fmtFact(f.map(([p, e], j) => [p, j === i ? (e > 1 ? e - 1 : e + 1) : e])));
  const j = (i + 1) % f.length;
  if (f[i][1] !== f[j][1]) cands.push(fmtFact(f.map(([p, e], k) => [p, k === i ? f[j][1] : k === j ? f[i][1] : e])));
  // Stopped too early: the first prime power times the unfactorised rest.
  const first = f[0][0] ** f[0][1];
  if (f.length >= 2) cands.push(`${fmtFact([f[0]])} × ${n / first}`);
  if (f.length >= 2) cands.push(fmtFact(f.slice(0, -1)));
  cands.push(fmtFact(f.map(([p, e], k) => [p, k === f.length - 1 ? e + 1 : e])));
  cands.push(fmtFact(f.map(([p, e]) => [p, e + 1])));
  const seen = new Set([ans]);
  const out = [];
  for (const c of cands) if (out.length < 3 && !seen.has(c)) { seen.add(c); out.push(c); }
  return { answer: ans, choices: rng.shuffle([ans, ...out]) };
}

function factExplain(n) {
  const steps = [];
  let m = n;
  for (const [p, e] of factorize(n)) {
    for (let k = 0; k < e; k++) {
      steps.push(`${m} ÷ ${p} = ${m / p}`);
      m /= p;
    }
  }
  return steps;
}

function qFactorisation(difficulty, rng) {
  const n = difficulty === "hard" ? buildComposite(rng, 1000, 30000, 3, 4) : buildComposite(rng, 60, 1500, 2, 3);
  const { answer, choices } = factChoices(n, rng);
  const prompt = rng.pick([
    `Which is the prime factorisation of ${n}?`,
    `Write ${n} as a product of prime powers. Which option is correct?`,
    `Which of these shows ${n} as a product of primes (p^k means p to the power k)?`,
  ]);
  const steps = factExplain(n);
  const explanation = `Divide by the smallest prime that goes in, again and again, until you reach 1.\n\n${steps.map((s) => `- ${s}`).join("\n")}\n\nCollect the primes: ${n} = **${answer}**.`;
  const p0 = factorize(n)[0][0];
  const hints = [
    `Start with the smallest prime that divides ${n}: ${p0}. ${steps[0]}.`,
    "Keep dividing by the same prime while it goes in exactly, then move to the next prime. Every base in the answer must itself be prime.",
    "Count how many times each prime divided in; that count is its power.",
  ];
  return { prompt, answer, answerType: "choice", choices, explanation, hints, params: { kind: "fact", n } };
}

function countExplain(n) {
  const f = factorize(n);
  return `${n} = ${fmtFact(f)}. A factor uses each prime with a power from 0 up to its power in ${n}, so the number of factors is ${f.map(([, e]) => `(${e} + 1)`).join(" × ")} = **${divisorCount(f)}**.`;
}

function qCountFactors(difficulty, rng) {
  const n =
    difficulty === "easy" ? rng.int(12, 80) : difficulty === "medium" ? draw(() => rng.int(60, 300), (v) => !isPrime(v)) : buildComposite(rng, 300, 20000, 2, 4);
  const f = factorize(n);
  const count = divisorCount(f);
  const prompt = rng.pick([
    `How many positive factors does ${n} have? Count 1 and ${n} itself.`,
    `How many positive whole numbers divide ${n} exactly (including 1 and ${n})?`,
  ]);
  let explanation;
  if (difficulty === "hard") {
    explanation = `Use the prime factorisation.\n\n${countExplain(n)}`;
  } else {
    const pairs = [];
    for (let d = 1; d * d <= n; d++) if (n % d === 0) pairs.push(d * d === n ? `${d} × ${d}` : `${d} × ${n / d}`);
    explanation = `List the factor pairs, working up from 1 to √${n}:\n\n${pairs.map((s) => `- ${s}`).join("\n")}\n\nThat gives **${count}** factors${pairs.some((s) => /^(\d+) × \1$/.test(s)) ? " (the square root counts once)" : ""}.\n\nCheck: ${countExplain(n)}`;
  }
  const root = Math.floor(Math.sqrt(n));
  const hints =
    difficulty === "hard"
      ? guardAll(
          [
            [`Write ${n} as a product of prime powers first.`, null],
            [`${n} = ${fmtFact(f)}. A factor picks a power of each prime, from 0 up to the power shown.`, `Write ${n} as a product of prime powers, then think about which power of each prime a factor can use.`],
            ["Add 1 to each power and multiply the results together.", null],
          ].map(([h, alt]) => [h, alt ?? h]),
          count,
          prompt
        )
      : guardAll(
          [
            [`Factors come in pairs d × (${n} ÷ d). Test d = 1, 2, 3, ... up to √${n}, which is just over ${root}.`, `Factors come in pairs d × (${n} ÷ d). Test each d from 1 up to √${n}.`],
            ["Each d that divides exactly gives two factors, except when d × d is the number itself: that counts once.", null],
          ].map(([h, alt]) => [h, alt ?? h]),
          count,
          prompt
        );
  const base = { prompt, explanation, hints, params: { kind: "count", n } };
  const sumExp = f.reduce((s, [, e]) => s + e, 0);
  return finishInt(base, count, [count - 1, count - 2, count + 1, sumExp, sumExp + 1, f.reduce((s, [, e]) => s * e, 1)], rng, 0.3, 1);
}

function qPrimesMulti(rng) {
  const n = buildComposite(rng, 500, 20000, 2, 4);
  const f = factorize(n);
  const { answer: factAns, choices } = factChoices(n, rng);
  const count = divisorCount(f);
  const prompt = `Look at the number ${n}.`;
  const steps = factExplain(n);
  const explanation = `**Factorisation:** divide by the smallest prime again and again.\n\n${steps.map((s) => `- ${s}`).join("\n")}\n\nSo ${n} = **${factAns}**.\n\n**Number of factors:** ${countExplain(n)}`;
  const parts = [
    {
      id: "fact", label: "Factorisation", ask: `Which is the prime factorisation of ${n}?`, answerType: "choice", answer: factAns, choices,
      hint: `Start by dividing by ${f[0][0]}: ${steps[0]}. Keep going with the same prime while it divides exactly.`,
    },
    {
      id: "count", label: "Number of factors", ask: "How many positive factors does it have (including 1 and itself)? Give a whole number.", answerType: "number", answer: count, tolerance: 0,
      hint: "Use the factorisation: add 1 to each power and multiply the results together.",
    },
  ];
  return {
    prompt, answerType: "multi", parts, explanation,
    hints: ["Find the prime factorisation first; the number of factors follows from its powers."],
    params: { multi: true, parts: [{ id: "fact", kind: "fact", n }, { id: "count", kind: "count", n }] },
  };
}

function genPrimes(difficulty, rng) {
  const kind = rng.pick(
    { easy: ["which", "which", "spf", "count"], medium: ["which", "fact", "fact", "count", "lpf"], hard: ["fact", "count", "multi", "multi", "which"] }[difficulty]
  );
  if (kind === "which") return qWhichPrime(difficulty, rng);
  if (kind === "spf") return qSmallestPF(rng);
  if (kind === "lpf") return qLargestPF(rng);
  if (kind === "fact") return qFactorisation(difficulty, rng);
  if (kind === "count") return qCountFactors(difficulty, rng);
  return qPrimesMulti(rng);
}

// ---------------------------------------------------------------------------------------------
// GCD & LCM

// Two numbers g·x and g·y with x, y coprime and different.
function gcdPair(rng, gLo, gHi, xLo, xHi) {
  return draw(
    () => {
      const g = rng.int(gLo, gHi);
      const x = rng.int(xLo, xHi);
      const y = rng.int(xLo, xHi);
      return [g * x, g * y];
    },
    ([a, b]) => a !== b && gcd2(a, b) > 1
  );
}

const factLine = (nums) => nums.map((n) => `${n} = ${fmtFact(factorize(n))}`).join(", ");

function gcdExplain(nums) {
  const g = gcdN(nums);
  return `Write each number as a product of primes: ${factLine(nums)}.\n\nTake each prime they all share, with the lowest power: GCD = ${g === 1 ? "1" : fmtFact(factorize(g))} = **${g}**.`;
}
function lcmExplain(nums) {
  const l = lcmN(nums);
  return `Write each number as a product of primes: ${factLine(nums)}.\n\nTake every prime that appears, with the highest power: LCM = ${fmtFact(factorize(l))} = **${l}**.`;
}

function qGcd(difficulty, rng) {
  let nums;
  if (difficulty === "easy") nums = gcdPair(rng, 2, 12, 1, 6);
  else if (rng.next() < 0.6) nums = gcdPair(rng, 4, 30, 2, 12);
  else {
    nums = draw(
      () => {
        const g = rng.int(2, 15);
        return [rng.int(2, 9), rng.int(2, 9), rng.int(2, 9)].map((x) => g * x);
      },
      (v) => new Set(v).size === 3 && gcdN(v) > 1
    );
  }
  const g = gcdN(nums);
  const prompt = rng.pick([
    `What is the greatest common divisor (GCD, also called the HCF) of ${andList(nums)}?`,
    `Find the highest common factor (HCF, the GCD) of ${andList(nums)}.`,
    `What is the largest whole number that divides ${andList(nums)} exactly?`,
  ]);
  const hints = guardAll(
    [
      ["Write each number as a product of prime factors.", null],
      [`${factLine(nums)}. Keep only the primes every number shares, each with its lowest power.`, "Keep only the primes every number shares, each with its lowest power, and multiply them."],
    ].map(([h, alt]) => [h, alt ?? h]),
    g,
    prompt
  );
  const base = { prompt, explanation: gcdExplain(nums), hints, params: { kind: "gcd", nums } };
  const sp = smallestPrimeFactor(g);
  return finishInt(base, g, [g / sp, g * 2, lcmN(nums), Math.min(...nums), g * smallestPrimeFactor(nums[0] / g || 2)], rng, 0.3, 1);
}

function qLcm(difficulty, rng) {
  let nums;
  if (difficulty === "easy") nums = draw(() => [rng.int(2, 15), rng.int(2, 15)], ([a, b]) => a !== b && a % b !== 0 && b % a !== 0);
  else if (difficulty === "medium" && rng.next() < 0.6) nums = gcdPair(rng, 2, 12, 2, 9);
  else
    nums = draw(
      () => [rng.int(3, difficulty === "hard" ? 30 : 15), rng.int(3, difficulty === "hard" ? 30 : 15), rng.int(3, difficulty === "hard" ? 30 : 15)],
      (v) => new Set(v).size === 3 && lcmN(v) <= 2000 && lcmN(v) < v.reduce((a, b) => a * b, 1) && !v.some((a) => v.some((b) => a !== b && b % a === 0))
    );
  const l = lcmN(nums);
  const prompt = rng.pick([
    `What is the lowest common multiple (LCM) of ${andList(nums)}?`,
    `Find the least common multiple of ${andList(nums)}.`,
    `What is the smallest positive whole number that ${andList(nums)} ${nums.length === 2 ? "both" : "all"} divide into exactly?`,
  ]);
  const hints = guardAll(
    [
      ["Write each number as a product of prime factors.", null],
      [`${factLine(nums)}. Take every prime that appears in any of them, with its highest power.`, "Take every prime that appears in any of them, with its highest power, and multiply."],
    ].map(([h, alt]) => [h, alt ?? h]),
    l,
    prompt
  );
  const base = { prompt, explanation: lcmExplain(nums), hints, params: { kind: "lcm", nums } };
  const prod = nums.reduce((a, b) => a * b, 1);
  return finishInt(base, l, [prod, l * 2, gcdN(nums), l / smallestPrimeFactor(l), l + Math.max(...nums)], rng, 0.3, 1);
}

const LCM_STORIES = [
  (a, b, who) => ({
    text: `Two buses leave the depot together at 9:00. Route A leaves every ${a} minutes and route B every ${b} minutes. How many minutes later do they next leave together?`,
    unit: "minutes",
  }),
  (a, b, who) => ({
    text: `Two lighthouses flash together at midnight. One flashes every ${a} seconds and the other every ${b} seconds. After how many seconds do they next flash together?`,
    unit: "seconds",
  }),
  (a, b, who) => ({
    text: `${who} and a friend start running laps of a track together. ${who} takes ${a} seconds per lap and the friend takes ${b} seconds. Both keep a steady pace. After how many seconds are they next at the start line together?`,
    unit: "seconds",
  }),
  (a, b, who) => ({
    text: `Veggie burgers come in packs of ${a} and buns in packs of ${b}. ${who} wants exactly as many burgers as buns. What is the smallest number of burgers that works?`,
    unit: "burgers",
  }),
  (a, b, who) => ({
    text: `${who} waters the ferns every ${a} days and the cactus every ${b} days. Both were watered today. In how many days will both be watered on the same day again?`,
    unit: "days",
  }),
];

function qLcmStory(difficulty, rng) {
  const [a, b] =
    difficulty === "easy"
      ? draw(() => [rng.int(2, 12), rng.int(2, 12)], ([x, y]) => x < y && y % x !== 0)
      : draw(() => [rng.int(6, 40), rng.int(6, 40)], ([x, y]) => x < y && y % x !== 0 && gcd2(x, y) > 1);
  const who = rng.pick(NAMES);
  const s = rng.pick(LCM_STORIES)(a, b, who);
  const l = lcm2(a, b);
  const prompt = s.text;
  const explanation = `They line up again at the first number that is a multiple of both ${a} and ${b}: the lowest common multiple.\n\n${lcmExplain([a, b])}\n\nSo the answer is **${l}** ${s.unit}.`;
  const hints = guardAll(
    [
      [`You want the first number that is in both the ${a} times table and the ${b} times table: the LCM.`, null],
      [`${factLine([a, b])}. Take every prime with its highest power.`, "Write both as products of primes and take every prime with its highest power."],
    ].map(([h, alt]) => [h, alt ?? h]),
    l,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "lcm", nums: [a, b] } };
  return finishInt(base, l, [a * b, gcd2(a, b), l * 2, a + b], rng, 0.3, 1);
}

const GCD_STORIES = [
  (a, b, who) => ({
    text: `${who} has two ribbons, ${a} cm and ${b} cm long. Both are cut into pieces that are all the same length, as long as possible, with nothing left over. How long is each piece, in cm?`,
    what: "piece length",
    pieces: "pieces",
  }),
  (a, b, who) => ({
    text: `${who} has ${a} red counters and ${b} blue counters to share into identical bags (each bag gets the same mix, nothing left over). What is the greatest number of bags?`,
    what: "number of bags",
    pieces: null,
  }),
  (a, b, who) => ({
    text: `A garden bed is ${a} cm by ${b} cm. ${who} wants to cover it exactly with equal square tiles, as large as possible and none cut. What is the side of each tile, in cm?`,
    what: "tile side",
    pieces: "tiles",
  }),
  (a, b, who) => ({
    text: `A teacher has ${a} pencils and ${b} rulers. She makes identical sets for groups, using every item. What is the largest number of groups she can make?`,
    what: "number of groups",
    pieces: null,
  }),
];

function qGcdStory(difficulty, rng) {
  const [a, b] = difficulty === "easy" ? gcdPair(rng, 2, 10, 2, 7) : gcdPair(rng, 6, 30, 2, 11);
  const who = rng.pick(NAMES);
  const s = rng.pick(GCD_STORIES)(a, b, who);
  const g = gcd2(a, b);
  const prompt = s.text;
  const explanation = `The answer must divide both ${a} and ${b} exactly, and be as large as possible: the greatest common divisor.\n\n${gcdExplain([a, b])}`;
  const hints = guardAll(
    [
      [`The ${s.what} has to divide both ${a} and ${b} with nothing left over, and be as big as possible. That's the GCD.`, null],
      [`${factLine([a, b])}. Multiply the shared primes, each with its lower power.`, "Write both as products of primes and multiply the shared primes, each with its lower power."],
    ].map(([h, alt]) => [h, alt ?? h]),
    g,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "gcd", nums: [a, b] } };
  return finishInt(base, g, [lcm2(a, b), g / smallestPrimeFactor(g), g * 2, b - a], rng, 0.3, 1);
}

function qOtherNumber(rng) {
  const [G, x, y] = draw(
    () => [rng.int(2, 15), rng.int(2, 12), rng.int(2, 12)],
    ([g, p, q]) => p !== q && gcd2(p, q) === 1
  );
  const a = G * x, b = G * y, L = G * x * y;
  const prompt = `Two whole numbers have a greatest common divisor of ${G} and a lowest common multiple of ${L}. One of the numbers is ${a}. What is the other number?`;
  const explanation = `For any two whole numbers, GCD × LCM = the product of the numbers.\n\nSo the other number is ${G} × ${L} ÷ ${a} = ${G * L} ÷ ${a} = **${b}**.\n\nCheck: ${a} = ${fmtFact(factorize(a))} and ${b} = ${fmtFact(factorize(b))} share ${G}, and their LCM is ${L}.`;
  const hints = guardAll(
    [
      ["For two numbers, GCD × LCM = the product of the two numbers.", null],
      [`So ${a} × (other number) = ${G} × ${L} = ${G * L}. Divide that by ${a}.`, `So ${a} × (other number) = ${G} × ${L}. Work that out and divide by ${a}.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    b,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "other", G, L, a } };
  return finishInt(base, b, [L / a, L - a, G * x, G * L, y], rng, 0.3, 1);
}

function qSmallestAbove(rng) {
  const nums = draw(
    () => [rng.int(3, 20), rng.int(3, 20), rng.int(3, 20)].sort((p, q) => p - q),
    (v) => new Set(v).size === 3 && lcmN(v) >= 24 && lcmN(v) <= 900 && !v.some((p) => v.some((q) => p !== q && q % p === 0))
  );
  const L = lcmN(nums);
  const X = draw(() => rng.int(300, 5000), (v) => v % L !== 0);
  const ans = (Math.floor(X / L) + 1) * L;
  const prompt = `What is the smallest whole number greater than ${X} that is divisible by ${andList(nums)}?`;
  const explanation = `A number divisible by ${andList(nums)} is a multiple of their LCM.\n\n${lcmExplain(nums)}\n\n${X} ÷ ${L} = ${Math.floor(X / L)} remainder ${X % L}, so the next multiple of ${L} is ${Math.floor(X / L) + 1} × ${L} = **${ans}**.`;
  const hints = guardAll(
    [
      [`Any number divisible by all of ${andList(nums)} is a multiple of their LCM. Find the LCM first.`, null],
      [`${factLine(nums)}. Then divide ${X} by the LCM and go up to the next whole multiple.`, `Then divide ${X} by the LCM and go up to the next whole multiple.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    ans,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "above", nums, X } };
  return finishInt(base, ans, [ans - L, ans + L, L, X + nums.reduce((a, b) => a * b, 1) - (X % 2)], rng, 0.3, 1);
}

function qGcdMulti(rng) {
  const [W, H] = gcdPair(rng, 10, 60, 2, 9);
  const g = gcd2(W, H);
  const n = (W / g) * (H / g);
  const room = rng.pick(["kitchen floor", "patio", "bathroom wall", "hallway floor", "stage"]);
  const prompt = `A rectangular ${room} measures ${W} cm by ${H} cm. It is covered exactly with identical square tiles, as large as possible, and no tile is cut.`;
  const explanation = `The tile side must divide both ${W} and ${H}, and be as large as possible: the GCD.\n\n${gcdExplain([W, H])}\n\nThat gives ${W} ÷ ${g} = ${W / g} tiles along one side and ${H} ÷ ${g} = ${H / g} along the other, so **${n}** tiles in all.`;
  const parts = [
    {
      id: "side", label: "Tile side", ask: "What is the side of each tile, in cm? Give a whole number.", answerType: "number", answer: g, tolerance: 0,
      hint: guard(`The side must divide both ${W} and ${H} exactly. ${factLine([W, H])}.`, `The side must divide both ${W} and ${H} exactly: find their GCD from the prime factors.`, g, prompt),
    },
    {
      id: "count", label: "Number of tiles", ask: "How many tiles are needed? Give a whole number.", answerType: "number", answer: n, tolerance: 0,
      hint: "Work out how many tiles fit along each side, then multiply the two counts.",
    },
  ];
  return {
    prompt, answerType: "multi", parts, explanation,
    hints: ["The largest square tile has a side equal to the greatest common divisor of the two lengths."],
    params: { multi: true, parts: [{ id: "side", kind: "gcd", nums: [W, H] }, { id: "count", kind: "tiles", W, H }] },
  };
}

function genGcdLcm(difficulty, rng) {
  const kind = rng.pick(
    {
      easy: ["gcd", "gcd", "lcm", "lcm", "lcmStory", "gcdStory"],
      medium: ["gcd", "lcm", "lcmStory", "gcdStory", "gcdStory", "lcmStory"],
      hard: ["other", "above", "multi", "multi", "lcm", "lcmStory"],
    }[difficulty]
  );
  if (kind === "gcd") return qGcd(difficulty, rng);
  if (kind === "lcm") return qLcm(difficulty, rng);
  if (kind === "lcmStory") return qLcmStory(difficulty, rng);
  if (kind === "gcdStory") return qGcdStory(difficulty, rng);
  if (kind === "other") return qOtherNumber(rng);
  if (kind === "above") return qSmallestAbove(rng);
  return qGcdMulti(rng);
}

// ---------------------------------------------------------------------------------------------
// Divisibility

const RULES = {
  2: "the last digit is even",
  3: "the digit sum is a multiple of 3",
  4: "the number formed by the last two digits is a multiple of 4",
  5: "the last digit is 0 or 5",
  6: "it is divisible by both 2 and 3",
  8: "the number formed by the last three digits is a multiple of 8",
  9: "the digit sum is a multiple of 9",
  10: "the last digit is 0",
  11: "the alternating digit sum (units minus tens plus hundreds ...) is a multiple of 11",
  12: "it is divisible by both 3 and 4",
  15: "it is divisible by both 3 and 5",
  18: "it is divisible by both 2 and 9",
  24: "it is divisible by both 3 and 8",
  36: "it is divisible by both 4 and 9",
  45: "it is divisible by both 5 and 9",
};

// Proper factors of d above 1 (used to build "nearly divisible" distractors).
const properFactors = (d) => {
  const out = [];
  for (let f = 2; f < d; f++) if (d % f === 0) out.push(f);
  return out;
};

function ruleCheck(n, d) {
  switch (d) {
    case 3: case 9: return `digit sum ${digitSum(n)}`;
    case 11: return `alternating sum ${altSum(n)}`;
    case 4: return `last two digits ${String(n).slice(-2)}`;
    case 8: return `last three digits ${String(n).slice(-3)}`;
    default: return null;
  }
}

function qWhichDivisible(difficulty, rng) {
  const d = rng.pick({ easy: [3, 4, 6, 9, 5], medium: [4, 6, 8, 9, 11, 12], hard: [12, 15, 18, 24, 36, 45, 11] }[difficulty]);
  const [lo, hi] = { easy: [100, 999], medium: [1000, 9999], hard: [10000, 99999] }[difficulty];
  const yes = d * rng.int(Math.ceil(lo / d), Math.floor(hi / d));
  const facs = properFactors(d);
  const comps = [];
  const seen = new Set([yes]);
  for (let t = 0; comps.length < 3 && t < 200; t++) {
    // Plausible near-misses: divisible by a proper factor of d but not by d itself.
    const f = facs.length ? rng.pick(facs) : 1;
    const v = f * rng.int(Math.ceil(lo / f), Math.floor(hi / f));
    if (v % d !== 0 && !seen.has(v)) {
      seen.add(v);
      comps.push(v);
    }
  }
  const choices = rng.shuffle([yes, ...comps]).map(String);
  const list = `${choices.slice(0, 3).join(", ")} or ${choices[3]}`;
  const prompt = rng.pick([`Which of these numbers is divisible by ${d}: ${list}?`, `Exactly one of ${list} divides exactly by ${d}. Which one?`]);
  const lines = [yes, ...comps].map((v) => {
    const r = ruleCheck(v, d);
    return `- ${v}${r ? ` (${r})` : ""}: ${v % d === 0 ? `${v} = ${d} × ${v / d}, divisible` : `leaves remainder ${v % d}, not divisible`}.`;
  });
  const explanation = `A number is divisible by ${d} when ${RULES[d] ?? `${d} goes into it exactly`}.\n\n${lines.join("\n")}\n\nSo the answer is **${yes}**.`;
  const hints = [
    `Rule: a number is divisible by ${d} when ${RULES[d] ?? `${d} goes into it exactly`}.`,
    facs.length ? `Each wrong option passes part of the test (for example it divides by ${facs[facs.length - 1]}), so check every condition.` : "Work out the test for each option carefully; only one passes.",
  ];
  return { prompt, answer: String(yes), answerType: "choice", choices, explanation, hints, params: { kind: "divBy", d } };
}

// Long division digit by digit -> remainder (verify only).
function longDivRem(n, d) {
  let r = 0;
  for (const c of String(n)) r = (r * 10 + Number(c)) % d;
  return r;
}

function qRemainder(difficulty, rng) {
  let n, d;
  if (difficulty === "easy") {
    d = rng.int(3, 9);
    n = draw(() => rng.int(20, 200), (v) => v % d !== 0);
  } else if (difficulty === "medium") {
    d = rng.int(11, 25);
    n = draw(() => rng.int(1000, 9999), (v) => v % d !== 0);
  } else {
    d = rng.pick([3, 9, 11, 4, 8, 25]);
    n = draw(() => rng.int(100000, 99999999), (v) => v % d !== 0);
  }
  const r = n % d, q = Math.floor(n / d);
  const prompt = rng.pick([
    `What is the remainder when ${n} is divided by ${d}?`,
    `${n} ÷ ${d} leaves a remainder. What is it?`,
    ...(difficulty === "hard" ? [`Find ${n} mod ${d}, the remainder when ${n} is divided by ${d}.`] : [`${n} sweets are shared equally among ${d} bags, as many per bag as possible. How many are left over?`]),
  ]);
  let explanation, hints;
  if (difficulty === "hard") {
    const how =
      d === 3 || d === 9 ? `the remainder of the digit sum ${digitSum(n)} when divided by ${d}` :
      d === 11 ? `the remainder of the alternating digit sum ${altSum(n)} when divided by 11 (add 11 if it is negative)` :
      d === 4 ? `the remainder of the last two digits, ${String(n).slice(-2)}, divided by 4` :
      d === 8 ? `the remainder of the last three digits, ${String(n).slice(-3)}, divided by 8` :
      `the remainder of the last two digits, ${String(n).slice(-2)}, divided by 25`;
    explanation = `You don't need the full division: the remainder is ${how}.\n\nThat gives **${r}**. Check: ${n} = ${d} × ${q} + ${r}.`;
    hints = guardAll(
      [
        [`Use the shortcut for ${d}: the remainder is ${how}.`, `Use the divisibility shortcut for ${d} on the digits.`],
        ["Reduce that smaller number until it is between 0 and " + (d - 1) + ".", "Reduce that smaller number until it is a valid remainder."],
      ],
      r,
      prompt
    );
  } else {
    explanation = `Find the largest multiple of ${d} that fits: ${d} × ${q} = ${d * q}.\n\n${n} − ${d * q} = **${r}**.`;
    hints = guardAll(
      [
        [`Find the biggest multiple of ${d} that is not more than ${n}.`, null],
        [`${d} × ${q} = ${d * q}. Now subtract that from ${n}.`, `Subtract that multiple of ${d} from ${n}; what is left is the remainder.`],
      ].map(([h, alt]) => [h, alt ?? h]),
      r,
      prompt
    );
  }
  const base = { prompt, explanation, hints, params: { kind: "rem", n, d } };
  return finishInt(base, r, [d - r, r + 1, r - 1, q % 100], rng, 0.3, 0);
}

function qMissingDigit(difficulty, rng) {
  const d = rng.pick({ easy: [3, 9, 9], medium: [4, 6, 8, 11], hard: [11, 12, 18, 36, 45] }[difficulty]);
  const len = { easy: 4, medium: 5, hard: 6 }[difficulty];
  const { digits, pos, sols } = draw(
    () => {
      const digits = [rng.int(1, 9), ...Array.from({ length: len - 1 }, () => rng.int(0, 9))];
      // The gap is never the leading digit; for 4 and 8 it sits in the last two/three digits.
      const pos = d === 4 ? len - 2 : d === 8 ? rng.int(len - 3, len - 2) : rng.int(1, len - 1);
      const sols = [];
      for (let x = 0; x <= 9; x++) {
        const v = Number(digits.map((c, i) => (i === pos ? x : c)).join(""));
        if (v % d === 0) sols.push(x);
      }
      return { digits, pos, sols };
    },
    (o) => o.sols.length >= 1 && o.sols.length <= 5
  );
  if (!sols.length) throw new Error("no digit fits"); // never expected; the engine would redraw
  const shown = digits.map((c, i) => (i === pos ? "?" : String(c))).join("");
  const ans = sols[0];
  const many = sols.length > 1;
  const prompt = `In the number \`${shown}\`, the ? stands for one missing digit (0 to 9). What is the ${many ? "smallest digit" : "digit"} that makes the number divisible by ${d}?${many ? " (More than one digit works; give the smallest.)" : ""}`;
  const full = Number(digits.map((c, i) => (i === pos ? ans : c)).join(""));
  const explanation = `Divisible by ${d} means ${RULES[d]}.\n\nTry the digits 0 to 9 in the gap: ${sols.length === 1 ? "only" : "the ones that work are"} ${andList(sols.map(String))}${sols.length === 1 ? " works" : ""}.\n\nSo the answer is **${ans}**: ${full} = ${d} × ${full / d}.`;
  const known = digits.filter((_, i) => i !== pos);
  const kSum = known.reduce((a, b) => a + b, 0);
  const hints = guardAll(
    [
      [`Divisible by ${d} means ${RULES[d]}.`, `Use the divisibility rule for ${d}${properFactors(d).length > 1 ? ": split it into two coprime parts and check both" : ""}.`],
      [
        d === 3 || d === 9 || d === 12 || d === 18 || d === 36 || d === 45 || d === 6
          ? `The known digits add up to ${kSum}. The missing digit has to bring the digit sum to the right multiple.`
          : d === 11
            ? "Write the alternating sum with the missing digit as x, then find x from 0 to 9 that makes it a multiple of 11."
            : "Only the last digits matter here. Try each digit in the gap and test that short number.",
        "Try each digit from 0 upwards in the gap and test every condition.",
      ],
      ["Try the candidate digits from 0 upwards; the first that passes every part of the test is your answer.", null],
    ].map(([h, alt]) => [h, alt ?? h]),
    ans,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "digit", digits, pos, d } };
  return finishInt(base, ans, [sols[1] ?? ans + 3, (ans + d) % 10, 9 - ans, ans + 1], rng, 0.25, 0, 9);
}

function qCountMultiples(difficulty, rng) {
  const d = rng.int(3, difficulty === "easy" ? 9 : 19);
  const a = rng.int(difficulty === "easy" ? 1 : 50, difficulty === "easy" ? 30 : 400);
  const b = a + rng.int(difficulty === "easy" ? 30 : 100, difficulty === "easy" ? 100 : 900);
  const hi = Math.floor(b / d), lo = Math.ceil(a / d);
  const count = hi - lo + 1;
  const prompt = rng.pick([
    `How many multiples of ${d} are there from ${a} to ${b} (including both ends)?`,
    `How many whole numbers from ${a} to ${b} inclusive are divisible by ${d}?`,
  ]);
  const explanation = `The first multiple of ${d} at or above ${a} is ${d} × ${lo} = ${d * lo}. The last at or below ${b} is ${d} × ${hi} = ${d * hi}.\n\nSo the multiples are ${d} × ${lo} up to ${d} × ${hi}: ${hi} − ${lo} + 1 = **${count}**.`;
  const hints = guardAll(
    [
      [`Find the first multiple of ${d} that is ${a} or more, and the last that is ${b} or less.`, null],
      [`They are ${d} × ${lo} and ${d} × ${hi}. Count the whole numbers from ${lo} to ${hi}, including both.`, `Write them as ${d} × (something) and count the whole numbers between those two multipliers, including both ends.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    count,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "countMult", a, b, d } };
  return finishInt(base, count, [count - 1, count + 1, Math.floor((b - a) / d), hi], rng, 0.3, 0);
}

function qCountOr(rng, asMulti) {
  const [p, q] = draw(() => [rng.int(2, 15), rng.int(2, 15)], ([x, y]) => x < y && y % x !== 0 && gcd2(x, y) > 1);
  const N = rng.int(100, 1000);
  const l = lcm2(p, q);
  const nP = Math.floor(N / p), nQ = Math.floor(N / q), nB = Math.floor(N / l);
  const either = nP + nQ - nB;
  const explanation =
    `Count each kind with whole-number division:\n\n- divisible by ${p}: ${N} ÷ ${p} → ${nP}\n- divisible by ${q}: ${N} ÷ ${q} → ${nQ}\n- divisible by both means divisible by LCM(${p}, ${q}) = ${l}: ${N} ÷ ${l} → ${nB}\n\n` +
    `Numbers divisible by both were counted twice, so ${p} or ${q}: ${nP} + ${nQ} − ${nB} = **${either}**.`;
  if (asMulti) {
    const prompt = `Look at the whole numbers from 1 to ${N}.`;
    const parts = [
      { id: "both", label: "Both", ask: `How many are divisible by both ${p} and ${q}? Give a whole number.`, answerType: "number", answer: nB, tolerance: 0, hint: `Divisible by both means divisible by the LCM of ${p} and ${q}. Then divide ${N} by it and drop the remainder.` },
      { id: "either", label: "Either", ask: `How many are divisible by ${p} or ${q} (or both)? Give a whole number.`, answerType: "number", answer: either, tolerance: 0, hint: `Count the multiples of ${p} and of ${q}, add them, and take away the ones counted twice.` },
    ];
    return {
      prompt, answerType: "multi", parts, explanation,
      hints: ["The count of multiples of k from 1 to N is N ÷ k with the remainder dropped."],
      params: { multi: true, parts: [{ id: "both", kind: "countAnd", N, p, q }, { id: "either", kind: "countOr", N, p, q }] },
    };
  }
  const prompt = `How many whole numbers from 1 to ${N} are divisible by ${p} or by ${q} (or both)?`;
  const hints = guardAll(
    [
      [`Count multiples of ${p} and multiples of ${q} separately (${N} ÷ k, dropping the remainder).`, null],
      [`Numbers divisible by both are counted twice. They are the multiples of LCM(${p}, ${q}) = ${l}; take their count away once.`, `Numbers divisible by both are counted twice: they are the multiples of the LCM. Take their count away once.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    either,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "countOr", N, p, q } };
  return finishInt(base, either, [nP + nQ, nP + nQ - Math.floor(N / (p * q)), either - nB, nP + nQ - 2 * nB], rng, 0.3, 0);
}

function genDivisibility(difficulty, rng) {
  const kind = rng.pick(
    {
      easy: ["which", "which", "rem", "rem", "digit", "countMult"],
      medium: ["which", "rem", "digit", "digit", "countMult"],
      hard: ["which", "rem", "digit", "countOr", "multi"],
    }[difficulty]
  );
  if (kind === "which") return qWhichDivisible(difficulty, rng);
  if (kind === "rem") return qRemainder(difficulty, rng);
  if (kind === "digit") return qMissingDigit(difficulty, rng);
  if (kind === "countMult") return qCountMultiples(difficulty, rng);
  if (kind === "countOr") return qCountOr(rng, false);
  return qCountOr(rng, true);
}

// ---------------------------------------------------------------------------------------------
// Modular arithmetic

const modPos = (a, n) => ((a % n) + n) % n;

function qMod(difficulty, rng) {
  const n = rng.int(3, difficulty === "easy" ? 12 : 25);
  const neg = difficulty !== "easy" && rng.next() < 0.4;
  const a = neg ? -rng.int(5, 99) : draw(() => rng.int(10, difficulty === "easy" ? 150 : 2000), (v) => v % n !== 0);
  const r = modPos(a, n);
  const shownA = neg ? `(-${-a})` : String(a);
  const prompt = `What is ${shownA} mod ${n}? Give the remainder from 0 to ${n - 1}.${neg ? " (For a negative number, add multiples of " + n + " until you land in that range.)" : ""}`;
  let explanation, hints;
  if (neg) {
    const k = Math.ceil(-a / n);
    explanation = `Add a multiple of ${n} to get into the range 0 to ${n - 1}: ${a} + ${k} × ${n} = ${a} + ${k * n} = **${r}**.`;
    hints = guardAll(
      [
        [`a mod ${n} doesn't change when you add ${n}, so add multiples of ${n} to ${a}.`, null],
        [`Pick the multiple of ${n} that is just big enough: ${a} + ${k} × ${n} lands in range.`, `Pick the smallest multiple of ${n} that makes the result 0 or more.`],
      ].map(([h, alt]) => [h, alt ?? h]),
      r,
      prompt
    );
  } else {
    const q = Math.floor(a / n);
    explanation = `a mod n is the remainder after dividing by n.\n\n${a} = ${n} × ${q} + ${r}, so ${a} mod ${n} = **${r}**.`;
    hints = guardAll(
      [
        [`a mod ${n} is the remainder when you divide by ${n}.`, null],
        [`The biggest multiple of ${n} not above ${a} is ${n} × ${q} = ${n * q}. What's left over?`, `Find the biggest multiple of ${n} not above ${a} and subtract it.`],
      ].map(([h, alt]) => [h, alt ?? h]),
      r,
      prompt
    );
  }
  const base = { prompt, explanation, hints, params: { kind: "mod", a, n } };
  return finishInt(base, r, [n - r, r + 1, r - 1, modPos(-a, n)], rng, 0.3, 0);
}

function qClock(difficulty, rng) {
  const use24 = difficulty !== "easy" && rng.next() < 0.5;
  const back = difficulty !== "easy" && rng.next() < 0.35;
  const who = rng.pick(NAMES);
  let start, h, ans, prompt, explanation, hints;
  h = difficulty === "easy" ? rng.int(5, 60) : rng.int(30, 500);
  if (use24) {
    start = rng.int(0, 23);
    ans = modPos(start + (back ? -h : h), 24);
    const hh = String(start).padStart(2, "0");
    prompt = rng.pick([
      `A 24-hour clock shows ${hh}:00. What hour will it show ${h} hours ${back ? "earlier" : "later"}? Give the hour as a whole number from 0 to 23 (0 means midnight).`,
      `${who} checks a 24-hour clock at ${hh}:00. What hour (0 to 23) ${back ? `was it ${h} hours before` : `will it be ${h} hours after`} that?`,
    ]);
    const r = h % 24;
    explanation = `Whole days (24 hours) don't change the hour, so only ${h} mod 24 = ${r} hours matters.\n\n${start} ${back ? "−" : "+"} ${r} = ${start + (back ? -r : r)}${(start + (back ? -r : r) !== ans) ? `, and ${back ? "adding" : "taking away"} 24 gives **${ans}**` : `, so the answer is **${ans}**`}.`;
    hints = guardAll(
      [
        ["Every 24 hours the clock is back where it started, so you only need the remainder after dividing by 24.", null],
        [`${h} = 24 × ${Math.floor(h / 24)} + ${r}. Now ${back ? "go back" : "go forward"} ${r} hours from ${start}, wrapping past ${back ? "0" : "23"} if you need to.`, `Divide ${h} by 24 and keep the remainder, then move that many hours ${back ? "back" : "on"} from ${start}.`],
      ].map(([x, alt]) => [x, alt ?? x]),
      ans,
      prompt
    );
  } else {
    start = rng.int(1, 12);
    ans = modPos(start - 1 + (back ? -h : h), 12) + 1; // 12-hour clocks show 1 to 12, never 0
    prompt = rng.pick([
      `A 12-hour clock shows ${start} o'clock. What hour will it show ${h} hours ${back ? "earlier" : "later"}? Give a whole number from 1 to 12.`,
      `${who} looks at a 12-hour clock showing ${start} o'clock. What hour ${back ? `did it show ${h} hours before` : `will it show ${h} hours after`} that? Give a whole number from 1 to 12.`,
    ]);
    const r = h % 12;
    const raw = start + (back ? -r : r);
    explanation = `Every 12 hours the hand is back where it started, so only ${h} mod 12 = ${r} hours matters.\n\n${start} ${back ? "−" : "+"} ${r} = ${raw}${raw !== ans ? `; ${raw > 12 ? "take away" : "add"} 12 to get **${ans}**` : `, so the answer is **${ans}**`}. (A 12-hour clock shows 12, not 0.)`;
    hints = guardAll(
      [
        ["Every 12 hours the clock shows the same hour, so you only need the remainder after dividing by 12.", null],
        [`${h} = 12 × ${Math.floor(h / 12)} + ${r}. ${back ? "Go back" : "Go forward"} ${r} hours from ${start}, wrapping round past 12.`, `Divide ${h} by 12 and keep the remainder, then move that many hours ${back ? "back" : "on"} from ${start}.`],
      ].map(([x, alt]) => [x, alt ?? x]),
      ans,
      prompt
    );
  }
  const mod = use24 ? 24 : 12;
  const base = { prompt, explanation, hints, params: { kind: "clock", start, h: back ? -h : h, mod } };
  const lo = use24 ? 0 : 1, hi = use24 ? 23 : 12;
  const wrap = (v) => modPos(v - lo, mod) + lo;
  if (rng.next() < 0.3) {
    const cands = [wrap(ans + 1), wrap(ans - 1), wrap(start + (back ? h : -h)), wrap(ans + 2), wrap(ans - 2)];
    const { answer, choices } = intChoices(ans, cands.filter((v) => v >= lo && v <= hi), rng, lo);
    if (choices.every((c) => Number(c) >= lo && Number(c) <= hi)) return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: ans, answerType: "number", tolerance: 0 };
}

function qWeekday(difficulty, rng) {
  const s = rng.int(0, 6);
  const k = difficulty === "easy" ? rng.int(8, 60) : rng.int(50, 1000);
  const back = difficulty !== "easy" && rng.next() < 0.3;
  const ans = DAYS[modPos(s + (back ? -k : k), 7)];
  const prompt = rng.pick([
    `Today is ${DAYS[s]}. What day of the week ${back ? "was it" : "will it be"} ${k} days ${back ? "ago" : "from today"}?`,
    `A festival is ${back ? "remembered" : "planned"} ${k} days ${back ? "before" : "after"} a ${DAYS[s]}. On which day of the week ${back ? "was" : "is"} it?`,
  ]);
  const r = k % 7;
  const offs = [r, r + 1, r - 1, -r, r + 2, r - 2, r + 3].map((o) => modPos(s + (back ? -o : o), 7));
  const uniq = [...new Set(offs)].slice(0, 4).map((i) => DAYS[i]);
  const choices = rng.shuffle(uniq);
  const explanation = `The week repeats every 7 days, so only ${k} mod 7 matters: ${k} = 7 × ${Math.floor(k / 7)} + ${r}.\n\nCount ${r} day${r === 1 ? "" : "s"} ${back ? "back" : "on"} from ${DAYS[s]}: **${ans}**.`;
  const hints = [
    "Every 7 days it's the same weekday again, so only the remainder after dividing by 7 matters.",
    `${k} = 7 × ${Math.floor(k / 7)} + ${r}. Count ${r} day${r === 1 ? "" : "s"} ${back ? "backwards" : "forwards"} from ${DAYS[s]}, not counting ${DAYS[s]} itself.`,
  ];
  return { prompt, answer: ans, answerType: "choice", choices, explanation, hints, params: { kind: "weekday", s, k: back ? -k : k } };
}

function qModArith(rng) {
  const n = rng.int(5, 13);
  const op = rng.pick(["+", "×", "×"]);
  const a = rng.int(20, 400), b = rng.int(20, 400);
  const ra = a % n, rb = b % n;
  const r = op === "+" ? (ra + rb) % n : (ra * rb) % n;
  const prompt = `What is (${a} ${op} ${b}) mod ${n}? Give the remainder from 0 to ${n - 1}. (Tip: you can reduce each number mod ${n} first.)`;
  const comb = op === "+" ? ra + rb : ra * rb;
  const explanation = `Reduce each number first: ${a} mod ${n} = ${ra} and ${b} mod ${n} = ${rb}.\n\nThen ${ra} ${op} ${rb} = ${comb}, and ${comb} mod ${n} = **${r}**.`;
  const hints = guardAll(
    [
      [`Replace each number by its remainder mod ${n}: the answer doesn't change.`, null],
      [`${a} mod ${n} = ${ra} and ${b} mod ${n} = ${rb}. Combine these, then reduce mod ${n} again.`, `Work out ${a} mod ${n} and ${b} mod ${n}, combine them, then reduce mod ${n} again.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    r,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "arith", a, b, op, n } };
  return finishInt(base, r, [comb, (comb + 1) % n, op === "+" ? (ra * rb) % n : (ra + rb) % n, n - r], rng, 0.3, 0);
}

// Last digits of b, b², b³, ... until they repeat.
function lastDigitCycle(b) {
  const out = [];
  let v = b % 10;
  while (!out.includes(v)) {
    out.push(v);
    v = (v * b) % 10;
  }
  return out;
}

function qLastDigit(difficulty, rng) {
  const b = rng.pick(difficulty === "easy" ? [2, 3, 7, 8, 4, 9] : [2, 3, 7, 8, 4, 9, 12, 13, 17, 18, 22, 23, 27, 14, 19, 33]);
  const k = difficulty === "medium" ? rng.int(10, 60) : rng.int(50, 2000);
  const cyc = lastDigitCycle(b);
  const L = cyc.length;
  const pos = ((k - 1) % L) + 1; // position in the cycle, 1..L
  const ans = cyc[pos - 1];
  const prompt = rng.pick([`What is the last digit of ${b}^${k}?`, `What is the units digit of ${b} to the power ${k} (${b}^${k})?`]);
  const explanation = `Only the last digit matters, and the last digits of powers of ${b} repeat: ${cyc.join(", ")}, then again (a cycle of ${L}).\n\n${k} ÷ ${L} leaves remainder ${k % L}${k % L === 0 ? `, which means the end of a cycle (position ${L})` : ""}, so ${b}^${k} ends like ${b}^${pos}: **${ans}**.`;
  const hints = guardAll(
    [
      [`Write down the last digits of the powers of ${b}, one by one, until they start repeating. Only the last digit of each step matters.`, null],
      [`The last digits repeat every ${L}. Divide ${k} by ${L}; the remainder tells you where in the cycle you land (remainder 0 = the last one in the cycle).`, `Find how long the cycle is, then divide ${k} by that length; the remainder tells you where in the cycle you land.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    ans,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "lastDigit", b, k } };
  return finishInt(base, ans, cyc.filter((v) => v !== ans).concat([b % 10, (k % 10)]), rng, 0.35, 0);
}

function qPowMod(rng) {
  const n = rng.pick([3, 5, 7, 9, 11, 13]);
  const b = draw(() => rng.int(2, 20), (v) => v % n !== 0);
  const k = rng.int(10, 200);
  let ans = 1;
  for (let i = 0; i < k; i++) ans = (ans * b) % n; // generation uses repeated multiplication too; verify uses square-and-multiply
  // Cycle of powers mod n for the explanation.
  const cyc = [];
  let v = b % n;
  while (!cyc.includes(v)) {
    cyc.push(v);
    v = (v * b) % n;
  }
  const L = cyc.length;
  const prompt = `What is ${b}^${k} mod ${n}? Give the remainder from 0 to ${n - 1}.`;
  const explanation = `Powers of ${b} mod ${n} repeat: ${cyc.join(", ")}, then again (a cycle of ${L}).\n\n${k} ÷ ${L} leaves remainder ${k % L}, so ${b}^${k} mod ${n} is the ${k % L === 0 ? `last value in the cycle` : `value at position ${k % L}`}: **${ans}**.`;
  const hints = guardAll(
    [
      [`Work out the powers of ${b} mod ${n} one by one, multiplying by ${b} and reducing each time, until the values repeat.`, null],
      [`The cycle has length ${L}. Divide ${k} by ${L}; the remainder picks the position (0 means the last in the cycle).`, `Find the cycle length, divide ${k} by it, and use the remainder to pick the position.`],
    ].map(([h, alt]) => [h, alt ?? h]),
    ans,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "powMod", b, k, n } };
  return finishInt(base, ans, cyc.filter((x) => x !== ans).concat([n - ans, (b * k) % n]), rng, 0.3, 0);
}

// Modular inverse by the extended Euclidean algorithm (generation only).
function modInverse(a, n) {
  let [r0, r1, t0, t1] = [n, a % n, 0, 1];
  while (r1) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return modPos(t0, n);
}

function qCongruence(rng) {
  const [a, n] = draw(() => [rng.int(2, 12), rng.int(5, 23)], ([x, y]) => x < y && gcd2(x, y) === 1);
  const b = rng.int(1, n - 1);
  const x = (modInverse(a, n) * b) % n;
  const prompt = `Find the whole number x from 0 to ${n - 1} such that ${a}x mod ${n} = ${b} (that is, ${a} × x leaves remainder ${b} when divided by ${n}).`;
  const inv = modInverse(a, n);
  const explanation = `Find the inverse of ${a} mod ${n}: ${a} × ${inv} = ${a * inv} = ${n} × ${Math.floor((a * inv) / n)} + 1, so the inverse is ${inv}.\n\nMultiply both sides by ${inv}: x = ${b} × ${inv} mod ${n} = ${b * inv} mod ${n} = **${x}**.\n\nCheck: ${a} × ${x} = ${a * x} = ${n} × ${Math.floor((a * x) / n)} + ${b}.`;
  const hints = guardAll(
    [
      [`List the numbers that leave remainder ${b} mod ${n}: ${b}, ${b + n}, ${b + 2 * n}, ... and look for the first one that ${a} divides exactly.`, `List the numbers that leave remainder ${b} mod ${n}, adding ${n} each time, and look for the first one that ${a} divides exactly.`],
      [`Or find the inverse of ${a}: the number that multiplies ${a} to give remainder 1 mod ${n}. Then x = ${b} × inverse, reduced mod ${n}.`, null],
    ].map(([h, alt]) => [h, alt ?? h]),
    x,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "congr", a, b, n } };
  return finishInt(base, x, [(b * a) % n, modPos(b - a, n), (x + 1) % n, n - x], rng, 0.3, 0);
}

function qCrt(rng) {
  const [m1, m2] = draw(() => [rng.int(3, 11), rng.int(3, 13)], ([p, q]) => p < q && gcd2(p, q) === 1);
  const r1 = rng.int(1, m1 - 1), r2 = rng.int(1, m2 - 1);
  let x = r2;
  while (x % m1 !== r1) x += m2; // walk through the numbers ≡ r2 (mod m2)
  const who = rng.pick(NAMES);
  const prompt = rng.pick([
    `What is the smallest positive whole number that leaves remainder ${r1} when divided by ${m1} and remainder ${r2} when divided by ${m2}?`,
    `${who} has some marbles. In rows of ${m1} there are ${r1} left over; in rows of ${m2} there are ${r2} left over. What is the smallest number of marbles ${who} could have?`,
  ]);
  const list = [];
  for (let v = r2; v <= x; v += m2) list.push(v);
  const explanation = `List the numbers that leave remainder ${r2} when divided by ${m2}: ${list.join(", ")}.\n\nCheck each one mod ${m1}; the first that leaves remainder ${r1} is **${x}** (${x} = ${m1} × ${Math.floor(x / m1)} + ${r1}).`;
  const hints = guardAll(
    [
      [`Start with the bigger divisor: list ${r2}, ${r2 + m2}, ${r2 + 2 * m2}, ... (they all leave remainder ${r2} mod ${m2}).`, `Start with the bigger divisor: list numbers that leave remainder ${r2} mod ${m2}, adding ${m2} each time.`],
      [`For each one, find the remainder when you divide by ${m1}. Stop at the first that gives ${r1}.`, null],
    ].map(([h, alt]) => [h, alt ?? h]),
    x,
    prompt
  );
  const base = { prompt, explanation, hints, params: { kind: "crt", r1, m1, r2, m2 } };
  return finishInt(base, x, [x + m1 * m2, r1 + r2, m1 * m2 - x, x - m2, x + m2], rng, 0.3, 1);
}

function qCycleMulti(rng) {
  const b = rng.pick([2, 3, 7, 8, 12, 13, 17, 18, 22, 23, 27, 28, 4, 9, 14, 19, 24]);
  const k = rng.int(50, 3000);
  const cyc = lastDigitCycle(b);
  const L = cyc.length;
  const ans = cyc[((k - 1) % L)];
  const prompt = `The last digits of the powers ${b}^1, ${b}^2, ${b}^3, ... repeat in a cycle.`;
  const explanation = `The last digits go ${cyc.join(", ")}, then repeat, so the cycle length is **${L}**.\n\n${k} ÷ ${L} leaves remainder ${k % L}${k % L === 0 ? " (the end of a cycle)" : ""}, so ${b}^${k} ends in **${ans}**.`;
  const parts = [
    { id: "cycle", label: "Cycle length", ask: "How many different last digits are in the cycle before it repeats? Give a whole number.", answerType: "number", answer: L, tolerance: 0, hint: `Only the last digit matters: multiply the last digit by ${b % 10} each time and keep just the units digit.` },
    { id: "digit", label: "Last digit", ask: `What is the last digit of ${b}^${k}? Give a whole number.`, answerType: "number", answer: ans, tolerance: 0, hint: `Divide ${k} by the cycle length; the remainder tells you the position in the cycle (remainder 0 = the last one).` },
  ];
  return {
    prompt, answerType: "multi", parts, explanation,
    hints: [`Write down the last digits of the powers of ${b}, one by one, until one repeats.`],
    params: { multi: true, parts: [{ id: "cycle", kind: "cycleLen", b }, { id: "digit", kind: "lastDigit", b, k }] },
  };
}

function genModular(difficulty, rng) {
  const kind = rng.pick(
    {
      easy: ["mod", "mod", "clock", "clock", "weekday"],
      medium: ["mod", "clock", "weekday", "arith", "arith", "lastDigit"],
      hard: ["lastDigit", "powMod", "congr", "congr", "crt", "multi"],
    }[difficulty]
  );
  if (kind === "mod") return qMod(difficulty, rng);
  if (kind === "clock") return qClock(difficulty, rng);
  if (kind === "weekday") return qWeekday(difficulty, rng);
  if (kind === "arith") return qModArith(rng);
  if (kind === "lastDigit") return qLastDigit(difficulty, rng);
  if (kind === "powMod") return qPowMod(rng);
  if (kind === "congr") return qCongruence(rng);
  if (kind === "crt") return qCrt(rng);
  return qCycleMulti(rng);
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "primes-factors") return genPrimes(difficulty, rng);
  if (subtopic === "gcd-lcm") return genGcdLcm(difficulty, rng);
  if (subtopic === "divisibility") return genDivisibility(difficulty, rng);
  if (subtopic === "modular") return genModular(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------
// Independent check: brute force from params only.

// Trial division by every number from 2 to n - 1.
function bfPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let d = 2; d < n; d++) if (n % d === 0) return false;
  return true;
}
function bfDivisorCount(n) {
  let c = 0;
  for (let d = 1; d <= n; d++) if (n % d === 0) c++;
  return c;
}
// Largest number that divides all of nums, scanning down from the smallest.
function bfGcd(nums) {
  for (let d = Math.min(...nums); d >= 1; d--) if (nums.every((x) => x % d === 0)) return d;
  return 1;
}
// First number that all of nums divide, scanning up through multiples of the largest.
function bfLcm(nums) {
  const m = Math.max(...nums);
  for (let v = m; ; v += m) if (nums.every((x) => v % x === 0)) return v;
}
// Repeated subtraction / addition into 0..n-1.
function bfMod(a, n) {
  let v = a;
  while (v < 0) v += n;
  while (v >= n) v -= n;
  return v;
}

// "2^3 × 3^2 × 5" -> true when every base is prime, bases increase and the product is n.
function factStringOk(s, n) {
  const terms = String(s).split("×").map((t) => t.trim());
  let prod = 1, last = 1;
  for (const t of terms) {
    const m = t.match(/^(\d+)(?:\^(\d+))?$/);
    if (!m) return false;
    const p = Number(m[1]), e = m[2] ? Number(m[2]) : 1;
    if (!bfPrime(p) || p <= last || e < 1) return false;
    last = p;
    for (let i = 0; i < e; i++) prod *= p;
  }
  return prod === n;
}

const toInt = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  const x = Number(v);
  return Number.isInteger(x) ? x : NaN;
};

function okValue(p, v) {
  const x = toInt(v);
  switch (p.kind) {
    case "isPrime": return bfPrime(x);
    case "spf": {
      if (!bfPrime(x) || p.n % x !== 0) return false;
      for (let d = 2; d < x; d++) if (p.n % d === 0) return false;
      return true;
    }
    case "lpf": {
      if (!bfPrime(x) || p.n % x !== 0) return false;
      for (let d = x + 1; d <= p.n; d++) if (p.n % d === 0 && bfPrime(d)) return false;
      return true;
    }
    case "fact": return factStringOk(v, p.n);
    case "count": return x === bfDivisorCount(p.n);
    case "gcd": return x === bfGcd(p.nums);
    case "lcm": {
      // Simulate: advance whichever event is behind until they coincide.
      if (p.nums.length === 2) {
        let [ta, tb] = p.nums;
        while (ta !== tb) {
          if (ta < tb) ta += p.nums[0];
          else tb += p.nums[1];
        }
        return x === ta;
      }
      return x === bfLcm(p.nums);
    }
    case "other": return x > 0 && bfGcd([p.a, x]) === p.G && bfLcm([p.a, x]) === p.L;
    case "above": {
      let v = p.X + 1;
      while (!p.nums.every((k) => v % k === 0)) v++;
      return x === v;
    }
    case "tiles": {
      const g = bfGcd([p.W, p.H]);
      let c = 0;
      for (let i = 0; i < p.W; i += g) for (let j = 0; j < p.H; j += g) c++;
      return x === c;
    }
    case "divBy": return longDivRem(x, p.d) === 0;
    case "rem": return x >= 0 && x < p.d && x === longDivRem(p.n, p.d);
    case "digit": {
      if (!(x >= 0 && x <= 9)) return false;
      const fits = (dg) => longDivRem(Number(p.digits.map((c, i) => (i === p.pos ? dg : c)).join("")), p.d) === 0;
      if (!fits(x)) return false;
      for (let dg = 0; dg < x; dg++) if (fits(dg)) return false;
      return true;
    }
    case "countMult": {
      let c = 0;
      for (let v = p.a; v <= p.b; v++) if (v % p.d === 0) c++;
      return x === c;
    }
    case "countOr": case "countAnd": {
      let c = 0;
      for (let v = 1; v <= p.N; v++) {
        const A = v % p.p === 0, B = v % p.q === 0;
        if (p.kind === "countOr" ? A || B : A && B) c++;
      }
      return x === c;
    }
    case "mod": return x === bfMod(p.a, p.n);
    case "clock": {
      // Step the hand one hour at a time.
      const lo = p.mod === 12 ? 1 : 0;
      let h = p.start;
      const step = p.h > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(p.h); i++) {
        h += step;
        if (h > lo + p.mod - 1) h = lo;
        if (h < lo) h = lo + p.mod - 1;
      }
      return x === h;
    }
    case "weekday": {
      let d = p.s;
      const step = p.k > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(p.k); i++) d = (d + step + 7) % 7;
      return String(v) === DAYS[d];
    }
    case "arith": {
      const full = p.op === "+" ? p.a + p.b : p.a * p.b;
      return x >= 0 && x < p.n && (full - x) % p.n === 0;
    }
    case "lastDigit": {
      let d = 1;
      for (let i = 0; i < p.k; i++) d = (d * p.b) % 10;
      return x === d;
    }
    case "cycleLen": {
      // Smallest L with b^(1+L) ending like b^1, b^(2+L) like b^2, ... (checked over 20 powers).
      const seq = [];
      let d = 1;
      for (let i = 0; i < 24; i++) {
        d = (d * p.b) % 10;
        seq.push(d);
      }
      for (let L = 1; L <= 10; L++) if (seq.every((y, i) => i + L >= seq.length || seq[i + L] === y)) return x === L;
      return false;
    }
    case "powMod": {
      // Square-and-multiply.
      let res = 1, base = p.b % p.n, e = p.k;
      while (e > 0) {
        if (e & 1) res = (res * base) % p.n;
        base = (base * base) % p.n;
        e >>= 1;
      }
      return x === res;
    }
    case "congr": {
      let found = -1, count = 0;
      for (let t = 0; t < p.n; t++) if (bfMod(p.a * t, p.n) === p.b) { found = t; count++; }
      return count === 1 && x === found;
    }
    case "crt": {
      let v = 1;
      while (!(bfMod(v, p.m1) === p.r1 && bfMod(v, p.m2) === p.r2)) v++;
      return x === v;
    }
    default:
      return false;
  }
}

// One answer (single question or one part): a choice needs 4 distinct options of which exactly one passes.
function checkOne(spec, answer, answerType, choices) {
  if (answer === "" || answer === null || answer === undefined) return false;
  if (answerType === "choice") {
    if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices.map(String)).size !== 4) return false;
    if (!choices.map(String).includes(String(answer))) return false;
    if (choices.filter((c) => okValue(spec, c)).length !== 1) return false;
  }
  return okValue(spec, answer);
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false; // regenerate from the seed to get params back
  if (p.multi) {
    if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
    if (p.parts.length !== question.parts.length) return false;
    return p.parts.every((spec) => {
      const part = question.parts.find((x) => x.id === spec.id);
      return part && checkOne(spec, answer[spec.id], part.answerType, part.choices);
    });
  }
  return checkOne(p, answer, question.answerType, question.choices);
}
