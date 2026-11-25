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

// =============================================================================================
// Ciphers and Keys & RSA (merged in from the former Cryptography Basics subject).
// Every name below starts with cx / CX so nothing clashes with the helpers above, and these
// subtopics draw their own rng values, so the four original subtopics are unchanged per seed.
// No calculator: words are short, primes are small (≤ 19), powers are reduced after every
// multiplication, and key counts are powers of 2 or 10.
// Generation uses letter-index arithmetic, the extended Euclidean algorithm and running powers;
// cxVerify re-derives answers another way: rotated-alphabet tables, re-encoding the candidate,
// brute force over shifts / inverses / φ, BigInt powers and repeated multiplication.

const CX_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Plain, family-friendly words (upper case, letters only).
const CX_SHORT = ["CAT", "DOG", "SUN", "HAT", "MAP", "BOX", "CUP", "KEY", "OWL", "FOX", "BEE", "EGG", "PEN", "BUS", "JAM", "ANT", "BAT", "COW", "PIG", "HEN",
  "TREE", "BOOK", "CAKE", "FISH", "FROG", "KITE", "LAMP", "MILK", "MOON", "NEST", "RAIN", "ROSE", "SHIP", "SNOW", "STAR", "BELL", "DUCK", "GOAT", "LEAF", "WOLF"];
const CX_MID = ["APPLE", "BREAD", "CHAIR", "CLOUD", "HONEY", "LEMON", "MUSIC", "OCEAN", "PIZZA", "RIVER", "ROBOT", "STORM", "TIGER", "TRAIN", "ZEBRA", "SHELL", "PLANT", "GRAPE", "HOUSE", "TORCH",
  "BRIDGE", "CASTLE", "DRAGON", "FOREST", "GARDEN", "ISLAND", "JUNGLE", "KITTEN", "MARKET", "ORANGE", "PLANET", "RABBIT", "SILVER", "WINTER", "YELLOW", "PENCIL", "ROCKET", "SUMMER", "TURTLE", "WINDOW"];
const CX_LONG = ["CANDLE", "PUZZLE", "BASKET", "FLOWER", "HAMMER", "MONKEY", "PEANUT", "SECRET", "PIRATE", "MAGNET", "COOKIE", "LADDER", "PARROT", "VIOLIN", "WALRUS", "ANCHOR", "BUTTON", "DONKEY", "FALCON", "GUITAR",
  "HELMET", "JACKET", "KETTLE", "LIZARD", "MEADOW", "NAPKIN", "PEPPER", "RADISH", "SADDLE", "TICKET", "VELVET", "WAFFLE", "BALLOON", "BLANKET", "CABBAGE", "DOLPHIN", "LANTERN", "PENGUIN", "RAINBOW", "TEACHER"];
// Same-length pools for "which word was it?" questions.
const CX_BY_LEN = {};
for (const w of [...CX_MID, ...CX_LONG]) (CX_BY_LEN[w.length] ||= []).push(w);

const CX_KEYS2 = ["GO", "UP", "HI", "BE", "DO", "IT", "ME", "WE"];
const CX_KEYS3 = ["SUN", "KEY", "CAT", "SKY", "BEE", "RED", "ICE", "OAK", "FUN", "JOY", "MAP", "TOY"];
const CX_KEYS4 = ["MOON", "BLUE", "STAR", "LION", "CODE", "GOLD", "KING", "WAVE", "RUBY", "SNOW", "BIRD", "TIDE"];
const CX_KEYS5 = ["LIGHT", "MAPLE", "OCEAN", "TULIP", "CROWN", "PEARL"];

// Generation maths (letter-index arithmetic).
const cxIdx = (c) => c.charCodeAt(0) - 65;
const cxChr = (i) => String.fromCharCode((((i % 26) + 26) % 26) + 65);
const cxCaesar = (w, k) => [...w].map((c) => cxChr(cxIdx(c) + k)).join("");
const cxVig = (w, key, sign = 1) => [...w].map((c, i) => cxChr(cxIdx(c) + sign * cxIdx(key[i % key.length]))).join("");
const cxKeyStream = (w, key) => [...w].map((_, i) => key[i % key.length]).join("");
const cxPl = (k) => (k === 1 ? "" : "s");

// Thousands separators for prompts and explanations.
const cxCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Four distinct options from the correct string and candidate wrong strings.
function cxTextChoices(correct, candidates, rng) {
  const seen = new Set([correct]);
  const out = [];
  for (const c of candidates) {
    if (out.length >= 3 || typeof c !== "string" || !c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  if (out.length < 3) throw new Error("not enough choices");
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

const CX_SHIFT_NOTE = (k) => `Shift each letter **${k}** place${cxPl(k)} forward in the alphabet, wrapping from Z back to A.`;
const CX_VIG_NOTE = "Take A = 0, B = 1, …, Z = 25; each key letter shifts the plaintext letter under it forward by its value, the key repeats, and letters wrap from Z to A.";

function cxCaesarSteps(w, k, dir) {
  return [...w].map((c) => `${c}→${cxChr(cxIdx(c) + dir * k)}`).join(", ");
}
function cxVigTable(w, key, dir) {
  const ks = cxKeyStream(w, key);
  return [...w].map((c, i) => `- ${c} ${dir > 0 ? "+" : "−"} ${ks[i]} (${cxIdx(ks[i])}) → ${cxChr(cxIdx(c) + dir * cxIdx(ks[i]))}`).join("\n");
}

// ---------------------------------------------------------------------------------------------
// Ciphers: question builders

function cxQCaesarLetter(rng) {
  const k = rng.int(1, 6);
  const p = rng.pick(CX_ALPHA.split(""));
  const correct = cxChr(cxIdx(p) + k);
  const c = cxTextChoices(correct, [cxChr(cxIdx(p) - k), cxChr(cxIdx(p) + k + 1), cxChr(cxIdx(p) + k - 1)], rng);
  const sum = cxIdx(p) + k;
  return {
    prompt: `A Caesar cipher uses a shift of **${k}**. ${CX_SHIFT_NOTE(k)} Which letter does **${p}** become?`,
    answerType: "choice", ...c,
    explanation: `Count ${k} letter${cxPl(k)} forward from ${p}, wrapping after Z.\n\n- ${p} is letter number ${cxIdx(p)} (A = 0).\n- ${cxIdx(p)} + ${k} = ${sum}${sum > 25 ? `, and ${sum} − 26 = ${sum - 26}` : ""}\n- That is **${correct}**.`,
    hints: [`Count forward ${k} place${cxPl(k)} from ${p}. Forward means towards Z.`, "If you pass Z, carry on from the start of the alphabet."],
    params: { kind: "c-letter", p, k },
  };
}

function cxQCaesarEnc(w, k, rot13) {
  const ans = cxCaesar(w, k);
  const name = rot13 ? "ROT13 (a Caesar cipher with shift **13**)" : `a Caesar cipher, shift **${k}**`;
  return {
    prompt: `Encode **${w}** with ${name}. ${CX_SHIFT_NOTE(k)} Type the encoded word.`,
    answerType: "text", answer: ans,
    explanation: `Move every letter ${k} place${cxPl(k)} forward, wrapping after Z.\n\n- ${cxCaesarSteps(w, k, 1)}\n\nEncoded: **${ans}**`,
    hints: k <= 6
      ? [`Do one letter at a time: ${w[0]} moves ${k} place${cxPl(k)} forward.`, "If a letter passes Z, wrap round to A and keep counting."]
      : [`Number the letters A = 0 to Z = 25, then add ${k} to each. ${w[0]} is ${cxIdx(w[0])}.`, "If a total is 26 or more, subtract 26 before turning it back into a letter."],
    params: { kind: "c-enc", w, k },
  };
}

function cxQCaesarDec(w, k, rot13) {
  const cw = cxCaesar(w, k);
  const name = rot13 ? "ROT13 (a Caesar cipher with shift **13**)" : `a Caesar cipher, shift **${k}** forward`;
  return {
    prompt: `**${cw}** was encoded with ${name}. Letters wrap from Z to A. Decode it. Type the original word.`,
    answerType: "text", answer: w,
    explanation: `To decode, move every letter ${k} place${cxPl(k)} **back** (or ${26 - k} forward, which is the same).\n\n- ${cxCaesarSteps(cw, k, -1)}\n\nDecoded: **${w}**`,
    hints: k <= 6
      ? [`Decoding undoes the shift, so move each letter ${k} place${cxPl(k)} back towards A.`, "If you go back past A, wrap round to Z."]
      : [`Undo the shift: subtract ${k} from each letter number (A = 0).`, `If a result is negative, add 26. Moving back ${k} is the same as moving forward ${26 - k}.`],
    params: { kind: "c-dec", cw, k },
  };
}

function cxQCaesarShift(rng) {
  const w = rng.pick(CX_MID);
  const k = rng.int(1, 25);
  const cw = cxCaesar(w, k);
  const d0 = cxIdx(cw[0]) - cxIdx(w[0]);
  return {
    prompt: `A Caesar cipher turned **${w}** into **${cw}**. Each letter was shifted forward by the same amount, wrapping from Z to A. What is the shift? Give a whole number from 1 to 25.`,
    answerType: "number", answer: k, tolerance: 0,
    explanation: `Compare the first letters.\n\n- ${w[0]} is ${cxIdx(w[0])} and ${cw[0]} is ${cxIdx(cw[0])} (A = 0).\n- ${cxIdx(cw[0])} − ${cxIdx(w[0])} = ${d0}${d0 < 0 ? `; add 26: ${d0 + 26}` : ""}\n- Check another pair: ${w[1]}→${cw[1]} gives the same shift.\n\nShift: **${k}**`,
    hints: [`Number the letters A = 0 to Z = 25 and compare ${w[0]} with ${cw[0]}.`, "Subtract plaintext from ciphertext. If the result is negative, add 26. Check with a second letter."],
    params: { kind: "c-shift", w, cw },
  };
}

function cxQCaesarWhich(rng) {
  const len = rng.pick([5, 6, 6, 7]);
  const pool = CX_BY_LEN[len];
  const w = rng.pick(pool);
  const k = rng.int(1, 25);
  const cw = cxCaesar(w, k);
  // Distractors: real words of the same length that no shift turns into cw.
  const wrong = rng.shuffle(pool).filter((x) => x !== w && !Array.from({ length: 26 }, (_, s) => cxCaesar(x, s)).includes(cw));
  const c = cxTextChoices(w, wrong, rng);
  return {
    prompt: `A Caesar cipher with an unknown shift (1 to 25, forward, wrapping from Z to A) turned a word into **${cw}**. Which word was it?`,
    answerType: "choice", ...c,
    explanation: `In a Caesar cipher every letter moves by the same amount, so the gaps between letters stay the same.\n\n- Try each option: compare its first letter with ${cw[0]} to get a shift, then check the other letters.\n- Only ${w} works for every letter, with shift ${k}: ${cxCaesarSteps(w, k, 1)}.\n\nThe word was **${w}**.`,
    hints: [`Every letter moves by the same shift. For each option, work out the shift from its first letter to ${cw[0]}.`, "Then test that shift on the second and third letters. A wrong option breaks quickly."],
    params: { kind: "c-which", cw },
  };
}

function cxQCaesarBack(rng) {
  const w = rng.pick(CX_LONG);
  const k = rng.int(3, 12);
  const cw = cxCaesar(w, -k);
  return {
    prompt: `This time the encoder shifted each letter **${k}** places **backward** (so A became ${cxChr(-k)}), wrapping from A to Z. The result was **${cw}**. Decode it. Type the original word.`,
    answerType: "text", answer: w,
    explanation: `The encoder moved letters back, so decoding moves them **forward** ${k} places.\n\n- ${cxCaesarSteps(cw, k, 1)}\n\nDecoded: **${w}**`,
    hints: ["Decoding undoes the encoding, so go the opposite way: forward.", `Add ${k} to each letter number (A = 0), subtracting 26 if you pass Z.`],
    params: { kind: "c-back", cw, k },
  };
}

function cxQCaesarMulti(rng) {
  const known = rng.pick(CX_SHORT.filter((x) => x.length === 4));
  const w = rng.pick(CX_LONG);
  const k = rng.int(1, 25);
  const kc = cxCaesar(known, k);
  const cw = cxCaesar(w, k);
  return {
    prompt: `A spy uses one Caesar shift (forward, 1 to 25, wrapping from Z to A) for every message. You know that **${known}** was sent as **${kc}**. The next message is **${cw}**.`,
    answerType: "multi",
    parts: [
      { id: "shift", label: "Shift", ask: "What is the shift? Give a whole number from 1 to 25.", answerType: "number", answer: k, tolerance: 0,
        hint: `Compare ${known[0]} with ${kc[0]} (A = 0). If the difference is negative, add 26.` },
      { id: "word", label: "Message", ask: "Decode the next message. Type the word.", answerType: "text", answer: w,
        hint: "Move every letter of the next message back by the shift you found." },
    ],
    explanation: `Find the shift from the known pair, then undo it.\n\n- ${known[0]} = ${cxIdx(known[0])}, ${kc[0]} = ${cxIdx(kc[0])}, so the shift is ${k}.\n- Decode: ${cxCaesarSteps(cw, k, -1)}\n\n**Shift:** **${k}**\n\n**Message:** **${w}**`,
    hints: ["Find the shift from the pair you know first, then use it on the new message."],
    params: { kind: "c-multi", known, kc, cw },
  };
}

function cxQVigLetter(rng) {
  const p = rng.pick(CX_ALPHA.split(""));
  const kl = rng.pick(CX_ALPHA.slice(1).split("").filter((c) => c !== "N")); // N (13): forward = backward
  const sum = cxIdx(p) + cxIdx(kl);
  const correct = cxChr(sum);
  const c = cxTextChoices(correct, [cxChr(cxIdx(p) - cxIdx(kl)), cxChr(sum + 1), cxChr(sum - 1)], rng);
  return {
    prompt: `In a Vigenère cipher the plaintext letter **${p}** sits under the key letter **${kl}**. ${CX_VIG_NOTE} Which ciphertext letter does it give?`,
    answerType: "choice", ...c,
    explanation: `Add the key letter's value to the plaintext letter.\n\n- ${p} = ${cxIdx(p)}, ${kl} = ${cxIdx(kl)}\n- ${cxIdx(p)} + ${cxIdx(kl)} = ${sum}${sum > 25 ? `, and ${sum} − 26 = ${sum - 26}` : ""}\n- That is **${correct}**.`,
    hints: [`The key letter ${kl} is worth ${cxIdx(kl)} (A = 0), so it shifts ${p} forward by ${cxIdx(kl)}.`, "Wrap round to the start of the alphabet if you pass Z."],
    params: { kind: "v-letter", p, kl },
  };
}

function cxQVigEnc(w, key) {
  const ans = cxVig(w, key);
  return {
    prompt: `Encode **${w}** with a Vigenère cipher using the key **${key}**. ${CX_VIG_NOTE} Type the encoded word.`,
    answerType: "text", answer: ans,
    explanation: `Repeat the key under the word: ${w} / ${cxKeyStream(w, key)}. Add each pair, subtracting 26 when a total reaches 26.\n\n${cxVigTable(w, key, 1)}\n\nEncoded: **${ans}**`,
    hints: [`Write the key under the word, repeating it: ${w} over ${cxKeyStream(w, key)}.`, `Each key letter is a shift: ${[...new Set(key)].map((c) => `${c} = ${cxIdx(c)}`).join(", ")}. Shift each letter forward by the key letter under it, wrapping past Z.`],
    params: { kind: "v-enc", w, key },
  };
}

function cxQVigDec(w, key) {
  const cw = cxVig(w, key);
  return {
    prompt: `**${cw}** was encoded with a Vigenère cipher using the key **${key}**. ${CX_VIG_NOTE} Decode it. Type the original word.`,
    answerType: "text", answer: w,
    explanation: `To decode, **subtract** each key letter instead of adding it. Key under the ciphertext: ${cw} / ${cxKeyStream(cw, key)}.\n\n${cxVigTable(cw, key, -1)}\n\nDecoded: **${w}**`,
    hints: [`Repeat the key under the ciphertext: ${cw} over ${cxKeyStream(cw, key)}.`, "Subtract each key letter's value (A = 0) from the letter above it. If a result is negative, add 26."],
    params: { kind: "v-dec", cw, key },
  };
}

function cxQVigKey(rng, asMulti) {
  const key = rng.pick(rng.next() < 0.5 ? CX_KEYS3 : CX_KEYS4);
  const known = rng.pick(CX_MID); // every MID word has 5+ letters, longer than any 3- or 4-letter key
  const kc = cxVig(known, key);
  const keySteps = [...key].map((c, i) => `- ${kc[i]} (${cxIdx(kc[i])}) − ${known[i]} (${cxIdx(known[i])}) → ${c}`).join("\n");
  if (!asMulti) {
    return {
      prompt: `A Vigenère cipher with a **${key.length}-letter** key turned **${known}** into **${kc}**. ${CX_VIG_NOTE} What is the key? Type its ${key.length} letters.`,
      answerType: "text", answer: key,
      explanation: `Each key letter = ciphertext letter − plaintext letter (add 26 if negative). The first ${key.length} letters give the whole key.\n\n${keySteps}\n\nKey: **${key}**`,
      hints: ["Encoding added the key, so key = ciphertext − plaintext for each letter (A = 0).", `Work out the first ${key.length} letters only, since the key then repeats. Add 26 to any negative result.`],
      params: { kind: "v-findkey", known, kc, len: key.length },
    };
  }
  const w = rng.pick(CX_LONG);
  const cw = cxVig(w, key);
  return {
    prompt: `Two words were encoded with the same Vigenère key, which has **${key.length} letters**. ${CX_VIG_NOTE} You know **${known}** became **${kc}**. The second word arrived as **${cw}**.`,
    answerType: "multi",
    parts: [
      { id: "key", label: "Key", ask: `What is the key? Type its ${key.length} letters.`, answerType: "text", answer: key,
        hint: `Key letter = ciphertext − plaintext (A = 0, add 26 if negative). You need only the first ${key.length} letters of ${known} and ${kc}.` },
      { id: "word", label: "Second word", ask: "Decode the second word. Type it.", answerType: "text", answer: w,
        hint: `Repeat your key under ${cw}, then subtract each key letter's value from the letter above it.` },
    ],
    explanation: `Recover the key from the known pair, then decode.\n\n${keySteps}\n\nThe key is ${key}. Decoding ${cw} with ${cxKeyStream(cw, key)}:\n\n${cxVigTable(cw, key, -1)}\n\n**Key:** **${key}**\n\n**Second word:** **${w}**`,
    hints: ["Recover the key from the pair you know first, then use it to decode the second word."],
    params: { kind: "v-multi", known, kc, cw, len: key.length },
  };
}

function cxGenCiphers(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["enc", "enc", "dec", "letter", "vletter"]);
    if (kind === "letter") return cxQCaesarLetter(rng);
    if (kind === "vletter") return cxQVigLetter(rng);
    const k = rng.int(1, 6);
    const w = rng.pick(CX_SHORT);
    return kind === "enc" ? cxQCaesarEnc(w, k, false) : cxQCaesarDec(w, k, false);
  }
  if (difficulty === "medium") {
    const kind = rng.pick(["enc", "dec", "shift", "shift", "rot13", "venc", "vdec"]);
    if (kind === "shift") return cxQCaesarShift(rng);
    if (kind === "venc") return cxQVigEnc(rng.pick(CX_MID), rng.pick(rng.next() < 0.5 ? CX_KEYS2 : CX_KEYS3));
    if (kind === "vdec") return cxQVigDec(rng.pick(CX_SHORT), rng.pick(CX_KEYS3));
    const w = rng.pick(CX_MID);
    if (kind === "rot13") return rng.next() < 0.5 ? cxQCaesarEnc(w, 13, true) : cxQCaesarDec(w, 13, true);
    const k = rng.int(4, 25);
    return kind === "enc" ? cxQCaesarEnc(w, k, false) : cxQCaesarDec(w, k, false);
  }
  const kind = rng.pick(["which", "back", "multi", "vdec", "vfindkey", "vmulti"]);
  if (kind === "which") return cxQCaesarWhich(rng);
  if (kind === "back") return cxQCaesarBack(rng);
  if (kind === "multi") return cxQCaesarMulti(rng);
  if (kind === "vdec") return cxQVigDec(rng.pick(CX_LONG), rng.pick(rng.next() < 0.5 ? CX_KEYS4 : CX_KEYS5));
  return cxQVigKey(rng, kind === "vmulti");
}

// ---------------------------------------------------------------------------------------------
// Keys & RSA

// Extended Euclid inverse of a mod m (generation only).
function cxInv(a, m) {
  let [r0, r1, s0, s1] = [m, ((a % m) + m) % m, 0, 1];
  while (r1 !== 0) {
    const qq = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - qq * r1];
    [s0, s1] = [s1, s0 - qq * s1];
  }
  return r0 === 1 ? ((s0 % m) + m) % m : null;
}

// Every toy key (p < q prime, e coprime to φ) that is small enough to work by hand. No rng here.
const CX_RSA = (() => {
  const out = [];
  const P = [3, 5, 7, 11, 13, 17, 19];
  for (const p of P) for (const q of P) {
    if (p >= q) continue;
    const n = p * q, phi = (p - 1) * (q - 1);
    for (const e of [3, 5, 7, 11]) if (e < phi && gcd2(e, phi) === 1) out.push({ p, q, n, phi, e, d: cxInv(e, phi) });
  }
  return out;
})();

// m^e mod n by multiplying by m and reducing each time; returns c and the worked lines.
function cxPowChain(m, e, n) {
  let v = m % n;
  const lines = [`- ${m}^1 mod ${n} = ${v}`];
  for (let i = 2; i <= e; i++) {
    const prod = v * m;
    const nv = prod % n;
    lines.push(`- ${m}^${i}: ${v} × ${m} = ${cxCommas(prod)}, and ${cxCommas(prod)} mod ${n} = ${nv}`);
    v = nv;
  }
  return { c: v, lines: lines.join("\n") };
}

// Trial lines for d: (1 + k × φ) ÷ e for k = 1, 2, … until whole.
function cxDSteps(e, phi) {
  const out = [];
  for (let k = 1; k <= e; k++) {
    const t = 1 + k * phi;
    if (t % e === 0) {
      out.push(`- k = ${k}: (1 + ${k * phi}) ÷ ${e} = ${t / e}, a whole number`);
      break;
    }
    out.push(`- k = ${k}: (1 + ${k * phi}) ÷ ${e} = ${cxCommas(t)} ÷ ${e}, not whole`);
  }
  return out.join("\n");
}

const CX_RSA_NOTE = "Use n = p × q and φ(n) = (p − 1)(q − 1). The private key d is the whole number from 1 to φ(n) − 1 with (d × e) mod φ(n) = 1.";
const CX_SYSTEMS = ["A cipher", "A wireless network", "A game's save-file lock", "A smart door lock", "A toy encryption app", "A school's file vault", "A chat app", "A cloud backup"];
const CX_PIN_FOR = ["a bike lock", "a phone", "a hotel safe", "a school locker", "a garage door", "a games console", "a tablet", "a luggage lock"];
const CX_ALPHABETS = [
  { size: 26, what: "lower-case letters a to z", lens: [2, 3] },
  { size: 36, what: "lower-case letters and digits", lens: [2] },
];
// Hints as [text, alternative if it would name the answer].
const cxGuard = (pairs, answer, prompt) => guardAll(pairs.map(([h, alt]) => [h, alt ?? h]), answer, prompt);

function cxPickKey(rng, ok) {
  const list = CX_RSA.filter(ok);
  const k = rng.pick(list);
  return rng.next() < 0.5 ? { ...k } : { ...k, p: k.q, q: k.p }; // either prime may be named first
}

function cxQBits(rng) {
  const b = rng.int(4, 16);
  const ans = 2 ** b;
  const prompt = `${rng.pick(CX_SYSTEMS)} uses a **${b}-bit** key. How many different keys are there?`;
  return {
    prompt, answerType: "number", answer: ans, tolerance: 0,
    explanation: `Each bit is 0 or 1, so every extra bit doubles the count: ${b} bits give 2 multiplied by itself ${b} times.\n\n2^${b} = **${cxCommas(ans)}** keys`,
    hints: cxGuard([["Each bit can be 0 or 1. One bit gives 2 keys, two bits give 4, three bits give 8.", null], [`So ${b} bits give 2^${b}. Keep doubling, one bit at a time.`, null]], ans, prompt),
    params: { kind: "k-count", base: 2, len: b },
  };
}

function cxQCodes(rng) {
  const pin = rng.next() < 0.5;
  const A = pin ? { size: 10, what: "digits 0 to 9" } : rng.pick(CX_ALPHABETS);
  const L = pin ? rng.int(3, 6) : rng.pick(A.lens);
  const ans = A.size ** L;
  const what = rng.pick(CX_PIN_FOR);
  const prompt = pin
    ? `The PIN for ${what} has **${L} digits** (${A.what}), and digits may repeat. How many different PINs are possible?`
    : `The code for ${what} has **${L} characters**, using only ${A.what}, and characters may repeat. How many different codes are possible?`;
  return {
    prompt, answerType: "number", answer: ans, tolerance: 0,
    explanation: `Each of the ${L} positions has ${A.size} choices, so multiply ${A.size} by itself ${L} times.\n\n${A.size}^${L} = **${cxCommas(ans)}**`,
    hints: cxGuard([[`Each position can be any of ${A.size} symbols, chosen independently.`, null], [`So multiply ${A.size} once for every position: ${A.size}^${L}.`, null]], ans, prompt),
    params: { kind: "k-count", base: A.size, len: L },
  };
}

function cxQRatio(rng) {
  const b = rng.int(16, 40), x = rng.int(1, 10);
  const ans = 2 ** x;
  const prompt = `${rng.pick(CX_SYSTEMS)} upgrades its key from **${b} bits** to **${b + x} bits**. How many times more keys are there now?`;
  return {
    prompt, answerType: "number", answer: ans, tolerance: 0,
    explanation: `Each extra bit doubles the number of keys. ${x} extra bit${cxPl(x)} multiply it by 2^${x}.\n\n2^${b + x} ÷ 2^${b} = 2^${x} = **${cxCommas(ans)}**`,
    hints: cxGuard([["Adding one bit doubles the number of keys.", null], ["So count how many bits were added and double that many times, starting from 1.", null]], ans, prompt),
    params: { kind: "k-ratio", from: b, to: b + x },
  };
}

function cxQHalf(rng) {
  const b = rng.int(4, 16);
  const ans = 2 ** (b - 1);
  const prompt = `${rng.pick(CX_SYSTEMS)} uses a **${b}-bit** key. A brute-force attacker tries keys one by one, and on average finds the right one after trying **half** of all the keys. How many keys is that on average?`;
  return {
    prompt, answerType: "number", answer: ans, tolerance: 0,
    explanation: `There are 2^${b} = ${cxCommas(2 ** b)} keys, and half of them is 2^${b - 1}.\n\n${cxCommas(2 ** b)} ÷ 2 = **${cxCommas(ans)}**`,
    hints: cxGuard([[`First count all the keys: 2^${b}.`, null], ["Halving a power of 2 just lowers the power by one.", null]], ans, prompt),
    params: { kind: "k-half", len: b },
  };
}

function cxQMinBits(rng) {
  const X = draw(() => rng.int(2, 9) * 10 ** rng.int(2, 5) + rng.int(0, 99), (v) => (v & (v - 1)) !== 0);
  let b = 0, pw = 1;
  while (pw < X) {
    pw *= 2;
    b++;
  }
  const prompt = `A system needs at least **${cxCommas(X)}** different keys. What is the smallest number of key bits that gives at least that many?`;
  return {
    prompt, answerType: "number", answer: b, tolerance: 0,
    explanation: `Find the smallest b with 2^b ≥ ${cxCommas(X)}.\n\n- 2^${b - 1} = ${cxCommas(pw / 2)}, which is too few\n- 2^${b} = ${cxCommas(pw)}, which is enough\n\nSmallest: **${b} bits**`,
    hints: cxGuard([
      ["b bits give 2^b keys, so you need the smallest b with 2^b at least the target.", null],
      ["A handy landmark: 2^10 = 1,024, about a thousand. Start near it and double (or halve) one bit at a time.", "Count how many times you double, starting from 1, until you reach at least the target."],
    ], b, prompt),
    params: { kind: "k-minbits", X },
  };
}

function cxQTime(rng) {
  const b = rng.int(12, 24);
  const r = rng.int(4, Math.min(10, b - 5));
  const avg = rng.next() < 0.6;
  const top = avg ? b - 1 : b;
  const ans = 2 ** (top - r);
  const R = 2 ** r;
  const prompt = `A cipher uses a **${b}-bit** key, and an attacker tests **${cxCommas(R)}** keys per second (that is 2^${r}). ${avg ? "On average the key turns up after trying **half** of all keys. How many seconds does that take on average?" : "How many seconds does it take to try **every** key?"}`;
  return {
    prompt, answerType: "number", answer: ans, tolerance: 0,
    explanation: `Time = keys to try ÷ keys per second. Keep everything as powers of 2 and subtract the powers.\n\n- Keys: 2^${b}${avg ? `, and half of them is 2^${b - 1}` : ""}\n- 2^${top} ÷ 2^${r} = 2^${top - r}\n- 2^${top - r} = **${cxCommas(ans)}** seconds`,
    hints: cxGuard([
      [`Count the keys to try: 2^${b}${avg ? ", then halve it (one power of 2 less)" : ""}.`, null],
      [`Divide by the rate. Dividing powers of 2 subtracts the powers: 2^a ÷ 2^${r} = 2^(a − ${r}).`, "Divide by the rate. Dividing powers of 2 subtracts the powers."],
    ], ans, prompt),
    params: { kind: "k-time", len: b, r, frac: avg ? 0.5 : 1 },
  };
}

function cxQInv26(rng) {
  const a = rng.pick([3, 5, 7, 9, 11, 15, 17, 19, 21, 23]);
  const d = cxInv(a, 26);
  const k = (a * d - 1) / 26;
  const prompt0 = `A multiplicative cipher turns the letter with number x (A = 0, B = 1, …, Z = 25) into the letter with number (${a} × x) mod 26. To decode, you multiply by the **inverse of ${a} mod 26**: the whole number d from 1 to 25 with (${a} × d) mod 26 = 1.`;
  const dExplain = `- You need ${a} × d to be 1 more than a multiple of 26: 27, 53, 79, 105, 131, …\n- (1 + 26 × ${k}) ÷ ${a} = ${1 + 26 * k} ÷ ${a} = ${d}\n- Check: ${a} × ${d} = ${a * d} = 26 × ${k} + 1`;
  const dHints = [
    [`You want ${a} × d to be 1 more than a multiple of 26. List 27, 53, 79, 105, … and find the first one that ${a} divides exactly.`, `You want ${a} × d to be 1 more than a multiple of 26. List 1 + 26, 1 + 52, 1 + 78, … and find the first one that ${a} divides exactly.`],
  ];
  if (rng.next() < 0.5) {
    const prompt = `${prompt0} What is d?`;
    return {
      prompt, answerType: "number", answer: d, tolerance: 0,
      explanation: `Find d by trying the numbers that are 1 more than a multiple of 26.\n\n${dExplain}\n\nInverse: **${d}**`,
      hints: cxGuard([...dHints, ["Divide that number by the multiplier; the result is d.", null]], d, prompt),
      params: { kind: "x-inv26", a },
    };
  }
  const x = rng.pick(Array.from({ length: 25 }, (_, i) => i + 1).filter((v) => v !== 13)); // A and N never move
  const y = (a * x) % 26;
  const cl = CX_ALPHA[y], pl = CX_ALPHA[x];
  const prompt = `${prompt0} The ciphertext letter is **${cl}**.`;
  return {
    prompt, answerType: "multi",
    parts: [
      { id: "d", label: "Inverse", ask: "What is d? Give a whole number from 1 to 25.", answerType: "number", answer: d, tolerance: 0,
        hint: `Find the first of 27, 53, 79, 105, … that ${a} divides exactly, then divide.` },
      { id: "letter", label: "Plaintext letter", ask: `Decode ${cl}. Type the letter.`, answerType: "text", answer: pl,
        hint: `Turn ${cl} into its number (A = 0), multiply it by d, take the remainder mod 26, and turn that number back into a letter.` },
    ],
    explanation: `Find the inverse, then multiply the ciphertext number by it.\n\n${dExplain}\n- ${cl} = ${y}; ${y} × ${d} = ${y * d}, and ${y * d} mod 26 = ${x}, which is ${pl}\n- Check: (${a} × ${x}) mod 26 = ${y}, which is ${cl}\n\n**Inverse:** **${d}**\n\n**Plaintext letter:** **${pl}**`,
    hints: ["Find d first; decoding is then just multiplying by d."],
    params: { kind: "x-inv26", a, y },
  };
}

function cxQRsaN(rng) {
  const K = cxPickKey(rng, () => true);
  const prompt = `Toy RSA starts from two primes, **p = ${K.p}** and **q = ${K.q}**. Use n = p × q and φ(n) = (p − 1)(q − 1).`;
  return {
    prompt, answerType: "multi",
    parts: [
      { id: "n", label: "Modulus n", ask: "What is n? Give a whole number.", answerType: "number", answer: K.n, tolerance: 0, hint: "Multiply the two primes." },
      { id: "phi", label: "φ(n)", ask: "What is φ(n)? Give a whole number.", answerType: "number", answer: K.phi, tolerance: 0, hint: "Take 1 off each prime, then multiply the results." },
    ],
    explanation: `Multiply for n; take one off each prime before multiplying for φ(n).\n\n- n = ${K.p} × ${K.q} = ${K.n}\n- φ(n) = ${K.p - 1} × ${K.q - 1} = ${K.phi}\n\nφ(n) counts the numbers from 1 to n that share no factor with n.\n\n**Modulus n:** **${K.n}**\n\n**φ(n):** **${K.phi}**`,
    hints: ["Work out n first, then φ(n)."],
    params: { kind: "rsa-nphi", p: K.p, q: K.q },
  };
}

// Messages m (2..mMax, coprime to n) whose ciphertext is not m, 0 or 1. Some keys have none
// (e = 1 more than a multiple of the cycle length leaves every m unchanged), so keys are
// filtered on this list before one is picked.
function cxMsgs(K, mMax) {
  const ms = [];
  for (let x = 2; x <= Math.min(mMax, K.n - 1); x++) {
    const c = cxPowChain(x, K.e, K.n).c;
    if (gcd2(x, K.n) === 1 && c !== x && c > 1) ms.push(x);
  }
  return ms;
}

function cxQRsaEnc(rng) {
  const K = cxPickKey(rng, (k) => k.n <= 55 && k.e <= 7 && cxMsgs(k, k.n - 1).length > 0);
  const m = rng.pick(cxMsgs(K, K.n - 1));
  const { c, lines } = cxPowChain(m, K.e, K.n);
  const prompt = `Toy RSA: the public key is **n = ${K.n}** and **e = ${K.e}**. Encrypt the message **m = ${m}** using c = m^e mod n. Give a whole number from 0 to ${K.n - 1}.`;
  return {
    prompt, answerType: "number", answer: c, tolerance: 0,
    explanation: `Multiply by ${m} one step at a time and reduce mod ${K.n} after every step, so the numbers stay small.\n\n${lines}\n\nCiphertext: **${c}**`,
    hints: cxGuard([
      [`Don't work out ${m}^${K.e} in full. Multiply by ${m} one step at a time.`, null],
      [`After each multiplication, replace the result by its remainder mod ${K.n}. Do ${K.e - 1} multiplications in all.`, `After each multiplication, replace the result by its remainder mod ${K.n}, until you reach the power ${K.e}.`],
    ], c, prompt),
    params: { kind: "rsa-enc", n: K.n, e: K.e, m },
  };
}

function cxQRsaKey(rng) {
  const K = cxPickKey(rng, (k) => k.d !== k.e);
  const prompt = `Toy RSA: the primes are **p = ${K.p}** and **q = ${K.q}**, and the public exponent is **e = ${K.e}**. ${CX_RSA_NOTE}`;
  return {
    prompt, answerType: "multi",
    parts: [
      { id: "n", label: "Modulus n", ask: "What is n? Give a whole number.", answerType: "number", answer: K.n, tolerance: 0, hint: "Multiply the two primes." },
      { id: "phi", label: "φ(n)", ask: "What is φ(n)? Give a whole number.", answerType: "number", answer: K.phi, tolerance: 0, hint: "Take 1 off each prime, then multiply." },
      { id: "d", label: "Private key d", ask: "What is d? Give a whole number.", answerType: "number", answer: K.d, tolerance: 0, hint: "Try (1 + k × φ(n)) ÷ e for k = 1, 2, 3, … The first whole-number result is d." },
    ],
    explanation: `Build the key step by step.\n\n- n = ${K.p} × ${K.q} = ${K.n}\n- φ(n) = ${K.p - 1} × ${K.q - 1} = ${K.phi}\n- d: try (1 + k × ${K.phi}) ÷ ${K.e}:\n\n${cxDSteps(K.e, K.phi)}\n\nCheck: ${K.d} × ${K.e} = ${K.d * K.e} = ${K.phi} × ${(K.d * K.e - 1) / K.phi} + 1\n\n**Modulus n:** **${K.n}**\n\n**φ(n):** **${K.phi}**\n\n**Private key d:** **${K.d}**`,
    hints: ["Work in order: n, then φ(n), then d, which depends on φ(n)."],
    params: { kind: "rsa-key", p: K.p, q: K.q, e: K.e },
  };
}

function cxQRsaDC(rng) {
  const K = cxPickKey(rng, (k) => k.n <= 143 && k.e <= 7 && k.d !== k.e && cxMsgs(k, 12).length > 0);
  const m = rng.pick(cxMsgs(K, 12));
  const { c, lines } = cxPowChain(m, K.e, K.n);
  const prompt = `Toy RSA: **p = ${K.p}**, **q = ${K.q}**, **e = ${K.e}**, and the message is **m = ${m}**. ${CX_RSA_NOTE} Encryption is c = m^e mod n.`;
  return {
    prompt, answerType: "multi",
    parts: [
      { id: "d", label: "Private key d", ask: "What is d? Give a whole number.", answerType: "number", answer: K.d, tolerance: 0, hint: "Work out φ(n) = (p − 1)(q − 1), then try (1 + k × φ(n)) ÷ e, counting k up from 1 until the result is whole." },
      { id: "c", label: "Ciphertext c", ask: `What is c? Give a whole number from 0 to ${K.n - 1}.`, answerType: "number", answer: c, tolerance: 0, hint: "Work out n = p × q. Then multiply by m one step at a time, reducing mod n after each step." },
    ],
    explanation: `Private key first, then encrypt with the public key (n, e).\n\n- n = ${K.p} × ${K.q} = ${K.n}, φ(n) = ${K.p - 1} × ${K.q - 1} = ${K.phi}\n- d: try (1 + k × ${K.phi}) ÷ ${K.e}:\n\n${cxDSteps(K.e, K.phi)}\n\nEncrypt, reducing mod ${K.n} at each step:\n\n${lines}\n\n**Private key d:** **${K.d}**\n\n**Ciphertext c:** **${c}**`,
    hints: ["The two parts are separate: d needs φ(n), and c needs n."],
    params: { kind: "rsa-dc", p: K.p, q: K.q, e: K.e, m },
  };
}

function cxQRsaDec(rng) {
  const K = cxPickKey(rng, (k) => k.n <= 143 && k.e <= 5 && k.d !== k.e && cxMsgs(k, 12).length > 0);
  const m = rng.pick(cxMsgs(K, 12));
  const { c, lines } = cxPowChain(m, K.e, K.n);
  // RSA is one-to-one on 0..n-1, so every other option encrypts to something else.
  const cands = [c, m + 1, m - 1, m + 2, m - 2, m + 3].filter((x) => x >= 2 && x < K.n).map(String);
  const ch = cxTextChoices(String(m), cands, rng);
  const prompt = `Toy RSA: the public key is **n = ${K.n}** and **e = ${K.e}**, and the private key is **d = ${K.d}**. You receive the ciphertext **c = ${c}**. Which message m was sent? (Encryption is c = m^e mod n.)`;
  return {
    prompt, answerType: "choice", ...ch,
    explanation: `Decrypting means m = c^d mod n, which is a long calculation by hand. Encrypting each option is quicker: only the right message gives c = ${c}.\n\n${lines}\n\nThe message was **${m}**.`,
    hints: [`c^d mod n is long by hand, so check the options the other way round: encrypt each one with m^${K.e} mod ${K.n}.`, `Multiply by the option one step at a time, reducing mod ${K.n} after each step, and compare the result with ${c}.`],
    params: { kind: "rsa-dec", n: K.n, e: K.e, c },
  };
}

function cxGenKeys(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["bits", "bits", "codes", "codes", "ratio"]);
    if (kind === "bits") return cxQBits(rng);
    if (kind === "codes") return cxQCodes(rng);
    return cxQRatio(rng);
  }
  if (difficulty === "medium") {
    const kind = rng.pick(["inv", "inv", "half", "minbits", "rsaN", "rsaEnc"]);
    if (kind === "inv") return cxQInv26(rng);
    if (kind === "half") return cxQHalf(rng);
    if (kind === "minbits") return cxQMinBits(rng);
    if (kind === "rsaN") return cxQRsaN(rng);
    return cxQRsaEnc(rng);
  }
  const kind = rng.pick(["key", "key", "dc", "dec", "time"]);
  if (kind === "key") return cxQRsaKey(rng);
  if (kind === "dc") return cxQRsaDC(rng);
  if (kind === "dec") return cxQRsaDec(rng);
  return cxQTime(rng);
}

// Every exact number answer says it is whole (wording only, no rng).
function cxWhole(q) {
  if (q.answerType === "number" && !/whole number/i.test(q.prompt)) q.prompt += WHOLE;
  return q;
}

// ---------------------------------------------------------------------------------------------
// Ciphers and Keys & RSA: independent check

const cxRotRow = (s) => CX_ALPHA.slice(s) + CX_ALPHA.slice(0, s);
function cxTabCaesar(w, k) {
  const row = cxRotRow(((k % 26) + 26) % 26);
  let out = "";
  for (const c of w) {
    const p = CX_ALPHA.indexOf(c);
    if (p < 0) return null;
    out += row[p];
  }
  return out;
}
function cxTabVig(w, key) {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const row = cxRotRow(CX_ALPHA.indexOf(key[i % key.length]));
    const p = CX_ALPHA.indexOf(w[i]);
    if (p < 0) return null;
    out += row[p];
  }
  return out;
}
// The key of length len found by searching tableau rows letter by letter.
function cxKeyFor(plain, cipher, len) {
  let key = "";
  for (let i = 0; i < len; i++) {
    let found = null;
    for (const c of CX_ALPHA) if (cxRotRow(CX_ALPHA.indexOf(c))[CX_ALPHA.indexOf(plain[i])] === cipher[i]) { found = c; break; }
    if (!found) return null;
    key += found;
  }
  return cxTabVig(plain, key) === cipher ? key : null;
}
const cxUp = (a) => String(a ?? "").trim().toUpperCase().replace(/\s+/g, "");
const cxWord = (a) => /^[A-Z]+$/.test(a);
const cxObj = (a) => (a && typeof a === "object" ? a : {});
// Exactly one of 4 distinct choices passes, and it is the answer.
function cxOneChoice(q, answer, passes) {
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices.map(String)).size !== 4) return false;
  const ok = q.choices.map(String).filter(passes);
  return ok.length === 1 && ok[0] === String(answer);
}
const cxBigPowMod = (b, e, n) => Number((BigInt(b) ** BigInt(e)) % BigInt(n));
function cxRepeat(base, len) {
  let v = 1;
  for (let i = 0; i < len; i++) v *= base;
  return v;
}
const cxPhiCount = (n) => {
  let c = 0;
  for (let t = 1; t <= n; t++) if (bfGcd([t, n]) === 1) c++;
  return c;
};
// Every inverse of e mod m in 1..m-1; returns it when there is exactly one.
const cxBruteInv = (e, m) => {
  const all = [];
  for (let t = 1; t < m; t++) if ((e * t) % m === 1) all.push(t);
  return all.length === 1 ? all[0] : null;
};

function cxVerifyOne(q, answer) {
  const p = q.params;
  const x = toInt(answer);
  switch (p.kind) {
    case "c-letter": return cxOneChoice(q, answer, (s) => cxTabCaesar(p.p, p.k) === s);
    case "c-enc": return cxTabCaesar(p.w, p.k) === cxUp(answer);
    case "c-dec": case "c-back": {
      const a = cxUp(answer);
      return cxWord(a) && cxTabCaesar(a, p.kind === "c-dec" ? p.k : 26 - p.k) === p.cw;
    }
    case "c-shift": {
      if (!(x >= 1 && x <= 25)) return false;
      const all = [];
      for (let t = 1; t <= 25; t++) if (cxTabCaesar(p.w, t) === p.cw) all.push(t);
      return all.length === 1 && all[0] === x;
    }
    case "c-which": return cxOneChoice(q, answer, (s) => { for (let t = 1; t <= 25; t++) if (cxTabCaesar(s, t) === p.cw) return true; return false; });
    case "c-multi": {
      const a = cxObj(answer);
      const s = toInt(a.shift);
      const shifts = [];
      for (let t = 1; t <= 25; t++) if (cxTabCaesar(p.known, t) === p.kc) shifts.push(t);
      if (shifts.length !== 1 || shifts[0] !== s) return false;
      const w = cxUp(a.word);
      return cxWord(w) && cxTabCaesar(w, s) === p.cw;
    }
    case "v-letter": return cxOneChoice(q, answer, (s) => cxTabVig(p.p, p.kl) === s);
    case "v-enc": return cxTabVig(p.w, p.key) === cxUp(answer);
    case "v-dec": {
      const a = cxUp(answer);
      return cxWord(a) && a.length === p.cw.length && cxTabVig(a, p.key) === p.cw;
    }
    case "v-findkey": {
      const a = cxUp(answer);
      return cxWord(a) && a.length === p.len && cxTabVig(p.known, a) === p.kc && cxKeyFor(p.known, p.kc, p.len) === a;
    }
    case "v-multi": {
      const a = cxObj(answer);
      const key = cxUp(a.key), w = cxUp(a.word);
      if (!cxWord(key) || key.length !== p.len || cxKeyFor(p.known, p.kc, p.len) !== key) return false;
      return cxWord(w) && w.length === p.cw.length && cxTabVig(w, key) === p.cw;
    }
    case "k-count": return x === cxRepeat(p.base, p.len);
    case "k-ratio": return x > 0 && cxRepeat(2, p.from) * x === cxRepeat(2, p.to); // substitution
    case "k-half": return x > 0 && x + x === cxRepeat(2, p.len);
    case "k-minbits": return x >= 1 && cxRepeat(2, x) >= p.X && cxRepeat(2, x - 1) < p.X;
    case "k-time": return x > 0 && x * cxRepeat(2, p.r) === cxRepeat(2, p.len) * p.frac; // seconds × rate = keys tried
    case "x-inv26": {
      if (q.answerType !== "multi") return x === cxBruteInv(p.a, 26);
      const a = cxObj(answer);
      const d = toInt(a.d);
      if (d !== cxBruteInv(p.a, 26)) return false;
      // Re-encode the candidate letter with the forward rule.
      const L = cxUp(a.letter);
      return /^[A-Z]$/.test(L) && (p.a * CX_ALPHA.indexOf(L)) % 26 === p.y;
    }
    case "rsa-nphi": {
      const a = cxObj(answer);
      const n = toInt(a.n), phi = toInt(a.phi);
      return n > 0 && n % p.p === 0 && n / p.p === p.q && phi === cxPhiCount(p.p * p.q);
    }
    case "rsa-key": {
      const a = cxObj(answer);
      const n = toInt(a.n), phi = toInt(a.phi), d = toInt(a.d);
      if (!(n > 0 && n % p.p === 0 && n / p.p === p.q)) return false;
      if (phi !== cxPhiCount(n)) return false;
      return d === cxBruteInv(p.e, phi);
    }
    case "rsa-enc": return x >= 0 && x < p.n && cxBigPowMod(p.m, p.e, p.n) === x;
    case "rsa-dc": {
      const a = cxObj(answer);
      const d = toInt(a.d), c = toInt(a.c);
      const n = p.p * p.q;
      if (d !== cxBruteInv(p.e, cxPhiCount(n))) return false;
      // c must be the BigInt encryption, and decrypting it with d must give m back.
      return c >= 0 && c < n && cxBigPowMod(p.m, p.e, n) === c && cxBigPowMod(c, d, n) === p.m;
    }
    case "rsa-dec": return cxOneChoice(q, answer, (s) => cxBigPowMod(Number(s), p.e, p.n) === p.c);
    default: return false;
  }
}

function cxVerify(q, answer) {
  if (answer === "" || answer === null || answer === undefined) return false;
  try {
    return cxVerifyOne(q, answer);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Expert: multi-step questions, still worked by hand (no calculator). This branch runs only for
// "expert", before the other levels, so easy/medium/hard never consume extra rng draws. Every
// template draws all rng values first; hints use only values already drawn and never state an
// answer. Params carry `expert: true` and are checked by verifyExpert (brute force).

const XP_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
const xpWhole = (s) => `${s}${WHOLE}`;

// primes-factors / expert, template 0: count all, even and square factors.
function xpDivCount(rng) {
  const { a, b, c, d, n } = draw(
    () => {
      const a = rng.int(1, 5), b = rng.int(0, 3), c = rng.int(0, 2), d = rng.int(0, 1);
      return { a, b, c, d, n: 2 ** a * 3 ** b * 5 ** c * 7 ** d };
    },
    (o) => o.n >= 100 && o.n <= 2000 && [o.b, o.c, o.d].filter((e) => e > 0).length >= 1,
  );
  const f = factorize(n);
  const total = divisorCount(f);
  const even = a * (b + 1) * (c + 1) * (d + 1);
  const sq = f.reduce((s, [, e]) => s * (Math.floor(e / 2) + 1), 1);
  const exps = f.map(([p, e]) => `${p}: ${e}`).join(", ");
  return {
    prompt: `Think about the positive factors of **${n}**.`,
    answerType: "multi",
    parts: [
      { id: "total", label: "All factors", ask: xpWhole("How many factors does it have?"), answerType: "number", answer: total, tolerance: 0,
        hint: "Write the prime factorisation, add 1 to each power, and multiply the results." },
      { id: "even", label: "Even factors", ask: xpWhole("How many of them are even?"), answerType: "number", answer: even, tolerance: 0,
        hint: "An even factor must use at least one 2: the power of 2 can be 1 up to its maximum, not 0." },
      { id: "square", label: "Square factors", ask: xpWhole("How many of them are perfect squares (1 counts)?"), answerType: "number", answer: sq, tolerance: 0,
        hint: "In a square factor every prime's power is even (zero counts), up to the power in the factorisation. Count the choices for each prime and multiply." },
    ],
    explanation: [
      `Factorise: ${n} = ${fmtFact(f)}. A factor picks a power of each prime from 0 up to its power here.`,
      `All factors: ${f.map(([, e]) => `(${e} + 1)`).join(" × ")} = **${total}**.`,
      `Even factors: the power of 2 must be 1 to ${a} (${a} choices), the others as before: ${[a, ...f.slice(1).map(([, e]) => e + 1)].join(" × ")} = **${even}**.`,
      `Square factors: each power must be even. Choices per prime: ${f.map(([p, e]) => `${p} → ${Math.floor(e / 2) + 1}`).join(", ")}; multiplied: **${sq}**.`,
    ].join("\n\n"),
    hints: [
      `Start with the prime factorisation of ${n}: divide by 2 as often as you can, then 3, 5 and 7.`,
      "Any factor is a product of the same primes with powers from 0 up to the power in the factorisation. Each part of the question just restricts which powers are allowed.",
    ],
    params: { expert: true, kind: "xp-divcount", n, exps },
  };
}

// primes-factors / expert, template 1: zeros at the end of n! and the power of 2 in n!.
function xpFactorial(rng) {
  const n = rng.int(20, 160);
  let z = 0;
  for (let p = 5; p <= n; p *= 5) z += Math.floor(n / p);
  let t = 0;
  for (let p = 2; p <= n; p *= 2) t += Math.floor(n / p);
  const fives = [];
  for (let p = 5; p <= n; p *= 5) fives.push(`⌊${n}/${p}⌋ = ${Math.floor(n / p)}`);
  const twos = [];
  for (let p = 2; p <= n; p *= 2) twos.push(Math.floor(n / p));
  return {
    prompt: `${n}! means ${n} × ${n - 1} × ${n - 2} × … × 2 × 1.`,
    answerType: "multi",
    parts: [
      { id: "zeros", label: "Trailing zeros", ask: xpWhole(`How many zeros are at the end of ${n}! when it is written out in full?`), answerType: "number", answer: z, tolerance: 0,
        hint: "Each zero needs a 10 = 2 × 5, and there are far more 2s than 5s, so count the 5s. Multiples of 25 give an extra 5 each." },
      { id: "twos", label: "Power of 2", ask: xpWhole(`What is the largest k such that 2^k divides ${n}!?`), answerType: "number", answer: t, tolerance: 0,
        hint: `Count the multiples of 2 up to ${n}, then add the multiples of 4, of 8, of 16, … (each adds one more 2).` },
    ],
    explanation: [
      `Count prime factors in the whole product, one layer at a time.`,
      `Fives: ${fives.join(", ")}. Total **${z}**, and that is the number of zeros, since 2s are plentiful.`,
      `Twos: ${twos.join(" + ")} = **${t}**.`,
    ].join("\n\n"),
    hints: [
      `Don't multiply ${n}! out. Count how many times each prime appears across all the numbers 1 to ${n}.`,
      `Numbers like 25 = 5 × 5 contribute two 5s, and 125 contributes three: count multiples of 5, then of 25, then of 125.`,
    ],
    params: { expert: true, kind: "xp-fact", n },
  };
}

// primes-factors / expert, template 2: how far trial division must go (√N edge case).
function xpSqrtTest(rng) {
  const isP = rng.next() < 0.5;
  const N = isP
    ? rng.pick(primesIn(101, 997))
    : draw(() => [rng.pick([7, 11, 13, 17, 19, 23, 29, 31]), rng.pick([7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43])], ([p, q]) => p <= q && p * q >= 101 && p * q <= 999).reduce((x, y) => x * y);
  const r = Math.floor(Math.sqrt(N));
  const maxP = Math.max(...primesIn(2, r));
  const spf = smallestPrimeFactor(N);
  return {
    prompt: `You test whether **${N}** is prime by dividing it by primes 2, 3, 5, 7, … in order.`,
    answerType: "multi",
    parts: [
      { id: "maxp", label: "Last prime needed", ask: xpWhole(`If no prime divides ${N}, what is the largest prime you would need to try before you can stop?`), answerType: "number", answer: maxP, tolerance: 0,
        hint: `If ${N} = a × b with a ≤ b, then a × a ≤ ${N}. So you only need primes whose square is at most ${N}.` },
      { id: "spf", label: "Smallest prime factor", ask: xpWhole(`What is the smallest prime factor of ${N}? (If ${N} is prime, give ${N} itself.)`), answerType: "number", answer: spf, tolerance: 0,
        hint: "Use the quick divisibility rules first, then divide by each larger prime in turn." },
    ],
    explanation: [
      `A factor pair a × b = ${N} always has a ≤ √${N}, so trial division can stop at √${N}.`,
      `${r}² = ${r * r} ≤ ${N} < ${(r + 1) * (r + 1)} = ${r + 1}², so the primes to try go up to ${r}: the largest is **${maxP}**.`,
      spf === N
        ? `None of the primes up to ${maxP} divides ${N}, so ${N} is prime and the answer is **${N}**.`
        : `${N} = ${spf} × ${N / spf}, and no smaller prime divides it, so the smallest prime factor is **${spf}**.`,
    ].join("\n\n"),
    hints: [
      `Find the largest whole number whose square is at most ${N} (compare ${N} with squares like 20² = 400 and 30² = 900), then the largest prime not above it.`,
      "Primes that look easy to skip still need checking: after the quick rules for 2, 3 and 5, divide by each larger prime in turn.",
    ],
    params: { expert: true, kind: "xp-sqrt", N },
  };
}

// gcd-lcm / expert, template 0: every pair with a given GCD and LCM.
function xpPairs(rng) {
  const { g, m } = draw(
    () => {
      const g = rng.int(2, 12);
      const picks = rng.shuffle([2, 3, 5, 7]).slice(0, rng.int(2, 3));
      const m = picks.reduce((s, p) => s * p ** (p === 2 ? rng.int(1, 3) : p === 3 ? rng.int(1, 2) : 1), 1);
      return { g, m };
    },
    (o) => o.m <= 120 && o.g * o.m <= 1500,
  );
  const L = g * m;
  const f = factorize(m);
  const blocks = f.map(([p, e]) => p ** e);
  const k = blocks.length;
  const count = 2 ** (k - 1);
  // smallest sum: split the blocks into two products as close as possible
  let best = Infinity, bestPair = null;
  for (let mask = 0; mask < 1 << k; mask++) {
    let u = 1;
    blocks.forEach((b, i) => { if (mask & (1 << i)) u *= b; });
    const v = m / u;
    if (u < v && g * (u + v) < best) { best = g * (u + v); bestPair = [g * u, g * v]; }
  }
  return {
    prompt: `Two different whole numbers a < b have GCD **${g}** and LCM **${L}**.`,
    answerType: "multi",
    parts: [
      { id: "count", label: "Number of pairs", ask: xpWhole("How many different pairs (a, b) are possible?"), answerType: "number", answer: count, tolerance: 0,
        hint: `Write a = ${g}x and b = ${g}y. Then x and y share no factor and x × y = ${L} ÷ ${g}.` },
      { id: "sum", label: "Smallest sum", ask: xpWhole("Of these pairs, what is the smallest possible a + b?"), answerType: "number", answer: best, tolerance: 0,
        hint: "Keep x and y as close together as you can, without splitting a prime power between them." },
    ],
    explanation: [
      `Divide out the GCD: a = ${g}x, b = ${g}y with x, y coprime and x × y = ${L} ÷ ${g} = ${m} = ${fmtFact(f)}.`,
      `Coprime means each prime power (${blocks.join(", ")}) goes wholly to x or wholly to y: 2^${k} ways, halved because x < y. That gives **${count}** pairs.`,
      `The closest split is ${bestPair[0] / g} × ${bestPair[1] / g}, so (a, b) = (${bestPair[0]}, ${bestPair[1]}) and a + b = **${best}**.`,
    ].join("\n\n"),
    hints: [
      "GCD × LCM = a × b, and both a and b are multiples of the GCD.",
      `Factorise ${L} ÷ ${g} = ${m} into prime powers. Each prime power must go entirely to one of the two numbers, or the GCD would be bigger.`,
    ],
    params: { expert: true, kind: "xp-pairs", g, L },
  };
}

const XP_FROB = [
  { what: "stamps", unit: "p", of: (a, b) => `${a}p and ${b}p stamps`, make: "postage", },
  { what: "coins", unit: "", of: (a, b) => `coins worth ${a} and ${b} credits`, make: "a price (in credits)" },
  { what: "boxes", unit: "", of: (a, b) => `boxes of ${a} and boxes of ${b} eggs`, make: "an order (number of eggs)" },
  { what: "tiles", unit: " cm", of: (a, b) => `tiles ${a} cm and ${b} cm long laid end to end`, make: "a row length (cm)" },
];

// gcd-lcm / expert, template 1: amounts you can't make from two sizes (coprime, Frobenius).
function xpFrob(rng) {
  const ctx = rng.pick(XP_FROB);
  const [a, b] = draw(() => [rng.int(3, 7), rng.int(4, 11)], ([x, y]) => x < y && gcd2(x, y) === 1);
  const largest = a * b - a - b;
  const count = ((a - 1) * (b - 1)) / 2;
  return {
    prompt: `You can only use ${ctx.of(a, b)}, as many of each as you like. Some amounts of ${ctx.make} can't be made exactly; from some point on, every amount can.`,
    answerType: "multi",
    parts: [
      { id: "largest", label: "Largest impossible", ask: xpWhole("What is the largest amount that can't be made?"), answerType: "number", answer: largest, tolerance: 0,
        hint: `Once ${a} amounts in a row can be made, every larger amount can too (add one more ${a}). Find where that run of ${a} starts.` },
      { id: "count", label: "How many impossible", ask: xpWhole("How many positive amounts can't be made?"), answerType: "number", answer: count, tolerance: 0,
        hint: `List the amounts 1, 2, 3, … up to the largest impossible one and tick off those made from ${a}s and ${b}s.` },
    ],
    explanation: [
      `${a} and ${b} share no factor, so every large enough amount can be made.`,
      `Sort the amounts by remainder mod ${a}: for each remainder, the first reachable amount is the smallest multiple of ${b} with that remainder: ${Array.from({ length: a }, (_, i) => i * b).join(", ")}.`,
      `The last of these is ${(a - 1) * b}, so the largest impossible amount is ${(a - 1) * b} − ${a} = **${largest}** (= ${a} × ${b} − ${a} − ${b}).`,
      `Counting the gaps gives (${a} − 1)(${b} − 1) ÷ 2 = **${count}** impossible amounts.`,
    ].join("\n\n"),
    hints: [
      `Start listing what you can make: ${a}, ${b}, ${2 * a}, ${a + b}, … in order.`,
      `Group amounts by their remainder when divided by ${a}. Once one amount in a group can be made, adding ${a}s makes every bigger one in that group.`,
    ],
    params: { expert: true, kind: "xp-frob", a, b },
  };
}

// gcd-lcm / expert, template 2: largest divisor leaving the same remainder (GCD of differences).
function xpSameRem(rng) {
  const { D, r, ks } = draw(
    () => {
      const D = rng.int(7, 40);
      const r = rng.int(1, D - 1);
      const ks = [rng.int(3, 30), rng.int(3, 30), rng.int(3, 30)].sort((x, y) => x - y);
      return { D, r, ks };
    },
    (o) => o.ks[0] < o.ks[1] && o.ks[1] < o.ks[2] && gcd2(o.ks[1] - o.ks[0], o.ks[2] - o.ks[1]) === 1,
  );
  const N = ks.map((k) => r + D * k);
  const d1 = N[1] - N[0], d2 = N[2] - N[1];
  return {
    prompt: `When each of **${N[0]}**, **${N[1]}** and **${N[2]}** is divided by the same whole number D, all three leave the same remainder. D is as large as possible.`,
    answerType: "multi",
    parts: [
      { id: "D", label: "Divisor D", ask: xpWhole("What is D?"), answerType: "number", answer: D, tolerance: 0,
        hint: "If two numbers leave the same remainder, D divides their difference exactly." },
      { id: "r", label: "Remainder", ask: xpWhole("What is the common remainder?"), answerType: "number", answer: r, tolerance: 0,
        hint: `Divide ${N[0]} by your D and keep the remainder.` },
    ],
    explanation: [
      `Same remainder means D divides every difference: ${N[1]} − ${N[0]} = ${d1} and ${N[2]} − ${N[1]} = ${d2}.`,
      `The largest such D is GCD(${d1}, ${d2}). ${d1} = ${fmtFact(factorize(d1))}, ${d2} = ${fmtFact(factorize(d2))}, so D = **${D}**.`,
      `${N[0]} = ${D} × ${ks[0]} + ${r}, so the remainder is **${r}** (check: ${N[1]} = ${D} × ${ks[1]} + ${r}).`,
    ].join("\n\n"),
    hints: [
      "The remainders cancel when you subtract: work with the differences between the numbers.",
      `Find the differences, then their GCD (factorise each, or use Euclid's method).`,
    ],
    params: { expert: true, kind: "xp-samerem", N },
  };
}

const XP_DIVS = [12, 18, 24, 36, 45, 72, 15, 44];
const XP_DIV_RULE = {
  12: "3 and 4", 18: "2 and 9", 24: "3 and 8", 36: "4 and 9", 45: "5 and 9", 72: "8 and 9", 15: "3 and 5", 44: "4 and 11",
};

// divisibility / expert, template 0: two missing digits, count the fillings and find the largest.
function xpTwoDigits(rng) {
  const o = draw(
    () => {
      const div = rng.pick(XP_DIVS);
      const digits = [rng.int(1, 9), rng.int(0, 9), rng.int(0, 9), rng.int(0, 9), rng.int(0, 9)];
      const i = rng.int(1, 3);
      const j = rng.int(i + 1, 4);
      const fills = [];
      for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) {
        const ds = digits.slice();
        ds[i] = a;
        ds[j] = b;
        const v = Number(ds.join(""));
        if (v % div === 0) fills.push(v);
      }
      return { div, digits, i, j, fills };
    },
    (v) => v.fills.length >= 1 && v.fills.length <= 12,
  );
  const { div, digits, i, j, fills } = o;
  const shown = digits.map((d, k) => (k === i ? "a" : k === j ? "b" : String(d))).join("");
  const largest = Math.max(...fills);
  return {
    prompt: `In the 5-digit number **${shown}**, a and b are single digits (0 to 9, and they may be equal). The number must be divisible by **${div}**.`,
    answerType: "multi",
    parts: [
      { id: "count", label: "Number of ways", ask: xpWhole("How many different pairs (a, b) work?"), answerType: "number", answer: fills.length, tolerance: 0,
        hint: `${div} = ${XP_DIV_RULE[div].replace(" and ", " × ")} with no common factor, so the number must pass both tests. Use the test on the last digits first; it fixes b (or narrows it down).` },
      { id: "largest", label: "Largest number", ask: xpWhole("What is the largest such number?"), answerType: "number", answer: largest, tolerance: 0,
        hint: "Among your valid pairs, the largest number has the largest a, and then the largest b." },
    ],
    explanation: [
      `Divisible by ${div} means divisible by both ${XP_DIV_RULE[div]}.`,
      `Checking each possible pair with both rules gives ${fills.length} number${fills.length === 1 ? "" : "s"}: ${fills.join(", ")}.`,
      `So there ${fills.length === 1 ? "is" : "are"} **${fills.length}** pair${fills.length === 1 ? "" : "s"}, and the largest number is **${largest}**.`,
    ].join("\n\n"),
    hints: [
      `Split ${div} into two coprime factors (${XP_DIV_RULE[div]}) and use a divisibility rule for each.`,
      "One rule depends only on the last digit(s), the other on the digit sum (or alternating sum). Combine them: list the options for one letter, then find the matching other letter.",
    ],
    params: { expert: true, kind: "xp-twodig", digits, i, j, div },
  };
}

const XP_TRIPLES = [[2, 3, 5], [3, 5, 7], [2, 5, 7], [2, 3, 7], [3, 4, 5], [4, 5, 7], [2, 7, 9], [4, 7, 9]];

// divisibility / expert, template 1: three-way inclusion–exclusion.
function xpIncExc(rng) {
  const [a, b, c] = rng.pick(XP_TRIPLES);
  const N = rng.int(100, 999);
  const fl = (d) => Math.floor(N / d);
  const S1 = fl(a) + fl(b) + fl(c);
  const S2 = fl(a * b) + fl(a * c) + fl(b * c);
  const S3 = fl(a * b * c);
  const atLeast = S1 - S2 + S3;
  const exactly = S1 - 2 * S2 + 3 * S3;
  return {
    prompt: `Consider the whole numbers from 1 to **${N}**, and the divisors **${a}**, **${b}** and **${c}** (no two share a factor).`,
    answerType: "multi",
    parts: [
      { id: "atleast", label: "At least one", ask: xpWhole(`How many are divisible by at least one of ${a}, ${b}, ${c}?`), answerType: "number", answer: atLeast, tolerance: 0,
        hint: "Add the three single counts, subtract the three pair counts (each pair overlap was counted twice), then add back the triple overlap." },
      { id: "exactly", label: "Exactly one", ask: xpWhole(`How many are divisible by exactly one of them?`), answerType: "number", answer: exactly, tolerance: 0,
        hint: "From each single count, remove the numbers that are also divisible by one of the other two. Draw a three-circle Venn diagram and fill it from the middle out." },
    ],
    explanation: [
      `Counts: multiples of d up to ${N} = ⌊${N}/d⌋. Because the divisors are coprime, "divisible by ${a} and ${b}" means divisible by ${a * b}.`,
      `Singles: ${fl(a)} + ${fl(b)} + ${fl(c)} = ${S1}. Pairs: ⌊${N}/${a * b}⌋ + ⌊${N}/${a * c}⌋ + ⌊${N}/${b * c}⌋ = ${fl(a * b)} + ${fl(a * c)} + ${fl(b * c)} = ${S2}. All three: ⌊${N}/${a * b * c}⌋ = ${S3}.`,
      `At least one: ${S1} − ${S2} + ${S3} = **${atLeast}**.`,
      `Exactly one: ${S1} − 2 × ${S2} + 3 × ${S3} = **${exactly}** (each pair region is removed from both of its circles, and the centre is put back right).`,
    ].join("\n\n"),
    hints: [
      `Start with the count of multiples of each divisor: ⌊${N} ÷ d⌋.`,
      `For overlaps, a number divisible by both ${a} and ${b} is a multiple of ${a * b} (they are coprime). Do the same for every pair and for all three.`,
    ],
    params: { expert: true, kind: "xp-incexc", N, a, b, c },
  };
}

// modular / expert, template 0: big powers with Fermat's little theorem.
function xpFermat(rng) {
  const p = rng.pick([5, 7, 11, 13]);
  const a = draw(() => rng.int(2, 40), (v) => v % p !== 0);
  const k = rng.int(50, 999);
  const e = k % (p - 1);
  const base = a % p;
  let v = 1;
  for (let i = 0; i < e; i++) v = (v * base) % p;
  return {
    prompt: `Find the remainder when **${a}^${k}** is divided by **${p}**. (${p} is prime and doesn't divide ${a}.)`,
    answerType: "multi",
    parts: [
      { id: "e", label: "Reduced exponent", ask: xpWhole(`Fermat's little theorem says ${a}^${p - 1} leaves remainder 1 mod ${p}. What is ${k} mod ${p - 1}?`), answerType: "number", answer: e, tolerance: 0,
        hint: `Divide ${k} by ${p - 1} and keep the remainder.` },
      { id: "rem", label: "Remainder", ask: xpWhole(`So what is ${a}^${k} mod ${p}?`), answerType: "number", answer: v, tolerance: 0,
        hint: `Reduce the base first (${a} mod ${p}), then raise it to the reduced exponent, reducing mod ${p} after each multiplication. A reduced exponent of 0 means a full set of cycles.` },
    ],
    explanation: [
      `${a}^${p - 1} ≡ 1 (mod ${p}), so whole blocks of ${p - 1} in the exponent contribute 1.`,
      `${k} = ${p - 1} × ${Math.floor(k / (p - 1))} + ${e}, so ${a}^${k} ≡ ${a}^${e} (mod ${p}).`,
      `${a} mod ${p} = ${base}, and ${base}^${e} mod ${p} = **${v}**.`,
    ].join("\n\n"),
    hints: [
      `Powers of a number mod ${p} repeat in a cycle whose length divides ${p - 1}.`,
      `Write ${k} as a multiple of ${p - 1} plus a remainder; only the remainder matters.`,
    ],
    params: { expert: true, kind: "xp-fermat", a, k, p },
  };
}

// modular / expert, template 1: a congruence where the coefficient shares a factor with n.
function xpCongr(rng) {
  const { a, n, x0, d } = draw(
    () => {
      const d = rng.int(2, 5);
      const n = d * rng.int(3, 8);
      const a = d * rng.int(1, 6);
      const x0 = rng.int(0, n - 1);
      return { a, n, x0, d };
    },
    (o) => o.a < o.n && gcd2(o.a, o.n) === o.d,
  );
  const b = (a * x0) % n;
  const sols = [];
  for (let x = 0; x < n; x++) if ((a * x) % n === b) sols.push(x);
  const n2 = n / d, a2 = a / d, b2 = b / d;
  return {
    prompt: `Solve **${a}x mod ${n} = ${b}** for whole numbers x from 0 to ${n - 1}. Careful: ${a} and ${n} share a factor.`,
    answerType: "multi",
    parts: [
      { id: "count", label: "Number of solutions", ask: xpWhole(`How many solutions are there from 0 to ${n - 1}?`), answerType: "number", answer: sols.length, tolerance: 0,
        hint: `Let g = GCD(${a}, ${n}). If g divides ${b}, divide everything by g; each solution of the smaller congruence then repeats every ${n} ÷ g.` },
      { id: "smallest", label: "Smallest solution", ask: xpWhole("What is the smallest solution?"), answerType: "number", answer: sols[0], tolerance: 0,
        hint: "Solve the reduced congruence (its coefficient now has an inverse), and take the answer from 0 upwards." },
    ],
    explanation: [
      `GCD(${a}, ${n}) = ${d}, and ${d} divides ${b}, so divide through: ${a2}x mod ${n2} = ${b2}.`,
      `That has one solution from 0 to ${n2 - 1}: x = ${sols[0]}. Adding ${n2} repeatedly gives every solution below ${n}: ${sols.join(", ")}.`,
      `So there are **${sols.length}** solutions and the smallest is **${sols[0]}**.`,
    ].join("\n\n"),
    hints: [
      `${a} has no inverse mod ${n}, because they share a factor. Find GCD(${a}, ${n}) first.`,
      `Divide ${a}, ${b} and ${n} by that GCD to get a smaller congruence you can solve the usual way.`,
    ],
    params: { expert: true, kind: "xp-congr", a, b, n },
  };
}

// modular / expert, template 2: a missing ISBN-10 digit (weights 10 down to 1, total ≡ 0 mod 11).
function xpIsbn(rng) {
  const o = draw(
    () => {
      const ds = Array.from({ length: 9 }, () => rng.int(0, 9));
      const pos = rng.int(0, 8);
      return { ds, pos };
    },
    (v) => {
      const s = v.ds.reduce((t, d, i) => t + (10 - i) * d, 0);
      return (11 - (s % 11)) % 11 <= 9;
    },
  );
  const { ds, pos } = o;
  const s = ds.reduce((t, d, i) => t + (10 - i) * d, 0);
  const check = (11 - (s % 11)) % 11;
  const all = [...ds, check];
  const missing = all[pos];
  const shown = all.map((d, i) => (i === pos ? "?" : String(d))).join("");
  const w = 10 - pos;
  const known = all.reduce((t, d, i) => (i === pos ? t : t + (10 - i) * d), 0);
  return {
    prompt: `An ISBN-10 is valid when 10 × (1st digit) + 9 × (2nd) + 8 × (3rd) + … + 1 × (10th) is divisible by 11. One digit of the ISBN **${shown}** is smudged. Find the missing digit (0 to 9).${WHOLE}`,
    answer: missing, answerType: "number", tolerance: 0, choices: undefined,
    explanation: [
      `The missing digit has weight ${w}. The known digits give ${known}.`,
      `${known} mod 11 = ${known % 11}, so we need ${w} × ? ≡ ${(11 - (known % 11)) % 11} (mod 11).`,
      `Trying ? = 0 to 9: only ? = ${missing} works (${w} × ${missing} = ${w * missing}, and ${known} + ${w * missing} = ${known + w * missing} = 11 × ${(known + w * missing) / 11}).`,
      `The missing digit is **${missing}**.`,
    ].join("\n\n"),
    hints: [
      `Work out the weighted total of the nine digits you can see. The smudged digit is number ${pos + 1}, so its weight is ${w}.`,
      `You need ${w} × ? to bring the total up to a multiple of 11. Reduce the known total mod 11 first, then try the digits 0 to 9.`,
    ],
    params: { expert: true, kind: "xp-isbn", shown },
  };
}

const XP_UNITS26 = [3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
const xpAff = (w, a, b) => [...w].map((ch) => cxChr(a * cxIdx(ch) + b)).join("");

// ciphers / expert, template 0: decode an affine cipher (needs the inverse of a mod 26).
function xpAffineDec(rng) {
  const a = rng.pick(XP_UNITS26);
  const b = rng.int(1, 25);
  const w = rng.pick(rng.next() < 0.5 ? CX_SHORT : CX_MID);
  const cw = xpAff(w, a, b);
  const inv = cxInv(a, 26);
  return {
    prompt: `An **affine cipher** encodes letter number x (A = 0, …, Z = 25) as (${a}x + ${b}) mod 26. The word **${cw}** was encoded this way.`,
    answerType: "multi",
    parts: [
      { id: "inv", label: "Inverse", ask: xpWhole(`What is the inverse of ${a} mod 26 (the number from 1 to 25 that times ${a} leaves remainder 1)?`), answerType: "number", answer: inv, tolerance: 0,
        hint: `Try multiples of ${a}: which one is 1 more than a multiple of 26 (27, 53, 79, 105, …)?` },
      { id: "word", label: "Decoded word", ask: "Decode the word. Type it.", answerType: "text", answer: w,
        hint: `To undo it, subtract ${b}, then multiply by your inverse, reducing mod 26 each time.` },
    ],
    explanation: [
      `Decoding reverses the steps: x = inverse × (y − ${b}) mod 26.`,
      `${a} × ${inv} = ${a * inv} = 26 × ${(a * inv - 1) / 26} + 1, so the inverse is **${inv}**.`,
      [...cw].map((ch) => `- ${ch} (${cxIdx(ch)}): ${inv} × (${cxIdx(ch)} − ${b}) mod 26 = ${(((inv * (cxIdx(ch) - b)) % 26) + 26) % 26} → ${cxChr(inv * (cxIdx(ch) - b))}`).join("\n"),
      `Decoded: **${w}**.`,
    ].join("\n\n"),
    hints: [
      `Encoding multiplied by ${a} and then added ${b}. Undo them in reverse order: subtract first, then "divide" by ${a}.`,
      `Dividing by ${a} mod 26 means multiplying by its inverse. Find it first.`,
    ],
    params: { expert: true, kind: "xp-affdec", a, b, cw },
  };
}

// ciphers / expert, template 1: crack an affine key from two known letters.
function xpAffineCrack(rng) {
  const a = rng.pick(XP_UNITS26);
  const b = rng.int(0, 25);
  const [p1, p2] = draw(() => [rng.int(0, 25), rng.int(0, 25)], ([x, y]) => x < y && gcd2(y - x, 26) === 1 && y - x !== 1 && y - x !== 25);
  const c1 = (a * p1 + b) % 26, c2 = (a * p2 + b) % 26;
  const L = (i) => CX_ALPHA[i];
  const dp = p2 - p1, dc = (((c2 - c1) % 26) + 26) % 26;
  const invd = cxInv(dp, 26);
  return {
    prompt: `An affine cipher encodes x as (ax + b) mod 26 (A = 0, …, Z = 25). You know that **${L(p1)} → ${L(c1)}** and **${L(p2)} → ${L(c2)}**.`,
    answerType: "multi",
    parts: [
      { id: "a", label: "a", ask: xpWhole("Find a (from 1 to 25)."), answerType: "number", answer: a, tolerance: 0,
        hint: `Subtract the two equations: a × (${p2} − ${p1}) ≡ ${c2} − ${c1} (mod 26). b cancels out.` },
      { id: "b", label: "b", ask: xpWhole("Find b (from 0 to 25)."), answerType: "number", answer: b, tolerance: 0,
        hint: `Put your a into the first pair: b ≡ ${c1} − a × ${p1} (mod 26).` },
    ],
    explanation: [
      `As numbers: ${p1} → ${c1} and ${p2} → ${c2}, so ${p1}a + b ≡ ${c1} and ${p2}a + b ≡ ${c2} (mod 26).`,
      `Subtract: ${dp}a ≡ ${dc} (mod 26). The inverse of ${dp} mod 26 is ${invd}, so a ≡ ${dc} × ${invd} = ${dc * invd} ≡ **${a}**.`,
      `Then b ≡ ${c1} − ${a} × ${p1} = ${c1 - a * p1} ≡ **${b}** (mod 26).`,
    ].join("\n\n"),
    hints: [
      `Turn the letters into numbers and write two equations: ${p1}a + b ≡ ${c1} and ${p2}a + b ≡ ${c2} (mod 26).`,
      `Subtracting removes b. To solve ${dp}a ≡ ${dc}, multiply by the inverse of ${dp} mod 26.`,
    ],
    params: { expert: true, kind: "xp-affcrack", p1, p2, c1, c2 },
  };
}

// ciphers / expert, template 2: frequency analysis on a Caesar cipher.
function xpFreq(rng) {
  const k = rng.int(1, 25);
  const top = cxChr(4 + k);
  const w = rng.pick(rng.next() < 0.5 ? CX_MID : CX_LONG);
  const cw = cxCaesar(w, k);
  return {
    prompt: `A long message was encoded with a Caesar cipher (shift forward, wrapping from Z to A). In the ciphertext the most common letter by far is **${top}**. E is the most common letter in English. One encoded word is **${cw}**.`,
    answerType: "multi",
    parts: [
      { id: "shift", label: "Shift", ask: xpWhole("Assuming E was encoded as the most common letter, what is the shift (1 to 25)?"), answerType: "number", answer: k, tolerance: 0,
        hint: `Count forward from E to ${top}, wrapping after Z if you need to (A = 0, E = 4).` },
      { id: "word", label: "Decoded word", ask: "Decode the word. Type it.", answerType: "text", answer: w,
        hint: "Move every letter back by the shift, wrapping from A to Z." },
    ],
    explanation: [
      `E is letter 4 and ${top} is letter ${cxIdx(top)}. Shift = (${cxIdx(top)} − 4) mod 26 = **${k}**.`,
      `Decode by moving each letter ${k} back: ${cxCaesarSteps(cw, k, -1)}.`,
      `Decoded: **${w}**.`,
    ].join("\n\n"),
    hints: [
      "Frequency analysis: the most common ciphertext letter probably stands for E.",
      `The shift is how far ${top} is after E in the alphabet (subtract the letter numbers, add 26 if negative).`,
    ],
    params: { expert: true, kind: "xp-freq", top, cw },
  };
}

// keys-rsa / expert, template 0: break a toy RSA key from the public key alone.
function xpBreak(rng) {
  const K = rng.pick(CX_RSA.filter((k) => k.d !== k.e && k.n >= 35));
  const p = Math.min(K.p, K.q);
  return {
    prompt: `A toy RSA public key is **n = ${K.n}**, **e = ${K.e}**. Small n can be factored by hand, which breaks the key. ${CX_RSA_NOTE}`,
    answerType: "multi",
    parts: [
      { id: "p", label: "Smaller prime", ask: xpWhole(`Factor n = ${K.n}: what is its smaller prime factor?`), answerType: "number", answer: p, tolerance: 0,
        hint: `Divide ${K.n} by each prime in turn, starting from 3. You only need to go up to about √${K.n}.` },
      { id: "phi", label: "φ(n)", ask: xpWhole("What is φ(n)?"), answerType: "number", answer: K.phi, tolerance: 0,
        hint: "Take 1 off each prime factor, then multiply." },
      { id: "d", label: "Private key d", ask: xpWhole("What is the private key d?"), answerType: "number", answer: K.d, tolerance: 0,
        hint: `Try (1 + k × φ(n)) ÷ ${K.e} for k = 1, 2, 3, … The first whole-number result is d.` },
    ],
    explanation: [
      `Trial division: ${K.n} = ${p} × ${K.n / p}, both prime, so the smaller prime is **${p}**.`,
      `φ(n) = ${p - 1} × ${K.n / p - 1} = **${K.phi}**.`,
      `d: try (1 + k × ${K.phi}) ÷ ${K.e}:\n\n${cxDSteps(K.e, K.phi)}`,
      `So d = **${K.d}**. Check: ${K.d} × ${K.e} = ${K.d * K.e} = ${K.phi} × ${(K.d * K.e - 1) / K.phi} + 1.`,
    ].join("\n\n"),
    hints: [
      "RSA is only safe while n can't be factored. Here it can: once you have p and q, everything else follows.",
      "Work in order: the factors, then φ(n), then d.",
    ],
    params: { expert: true, kind: "xp-break", n: K.n, e: K.e },
  };
}

// keys-rsa / expert, template 1: toy Diffie–Hellman key exchange.
function xpDH(rng) {
  const p = rng.pick([23, 29, 31, 37, 41, 43, 47]);
  const g = rng.int(2, p - 2);
  const [a, b] = draw(() => [rng.int(2, 6), rng.int(2, 6)], ([x, y]) => x !== y);
  const [na, nb] = rng.shuffle(NAMES.slice()).slice(0, 2);
  const pw = (x, e) => {
    let v = 1;
    for (let i = 0; i < e; i++) v = (v * x) % p;
    return v;
  };
  const A = pw(g, a), B = pw(g, b), S = pw(B, a);
  return {
    prompt: `${na} and ${nb} agree a shared key with a toy **Diffie–Hellman** exchange. The public numbers are p = **${p}** and g = **${g}**. ${na}'s secret is **${a}** and ${nb}'s secret is **${b}**. Each sends g^(secret) mod p, then raises what they receive to their own secret, mod p.`,
    answerType: "multi",
    parts: [
      { id: "A", label: `${na} sends`, ask: xpWhole(`What number does ${na} send (${g}^${a} mod ${p})?`), answerType: "number", answer: A, tolerance: 0,
        hint: `Multiply by ${g} one step at a time, reducing mod ${p} after each step.` },
      { id: "B", label: `${nb} sends`, ask: xpWhole(`What number does ${nb} send (${g}^${b} mod ${p})?`), answerType: "number", answer: B, tolerance: 0,
        hint: `Same method, with ${b} multiplications by ${g}.` },
      { id: "S", label: "Shared key", ask: xpWhole("What is the shared key?"), answerType: "number", answer: S, tolerance: 0,
        hint: `${na} raises ${nb}'s number to the power ${a}, mod ${p}. (${nb} would raise ${na}'s number to ${b} and get the same.)` },
    ],
    explanation: [
      `${na}: ${g}^${a} mod ${p} = **${A}**. ${nb}: ${g}^${b} mod ${p} = **${B}**.`,
      `${na} computes ${B}^${a} mod ${p} = **${S}**; ${nb} computes ${A}^${b} mod ${p} = ${pw(A, b)}. Both equal ${g}^(${a} × ${b}) mod ${p}.`,
      "An eavesdropper sees p, g and both sent numbers but not the secrets, so can't easily find the key when p is huge.",
    ].join("\n\n"),
    hints: [
      `Never work out a big power in full: multiply by the base and take the remainder mod ${p} after every step.`,
      "The shared key uses the number the other person sent, raised to your own secret.",
    ],
    params: { expert: true, kind: "xp-dh", p, g, a, b },
  };
}

// keys-rsa / expert, template 2: pick a valid public exponent, then find d.
function xpChooseE(rng) {
  const { p, q, phi, good, bad } = draw(
    () => {
      const P = [5, 7, 11, 13, 17, 19];
      const [p, q] = rng.shuffle(P.slice()).slice(0, 2).sort((x, y) => x - y);
      const phi = (p - 1) * (q - 1);
      const pool = rng.shuffle([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      const good = pool.find((e) => gcd2(e, phi) === 1 && e < phi);
      const bad = pool.filter((e) => gcd2(e, phi) !== 1).slice(0, 3);
      return { p, q, phi, good, bad };
    },
    (o) => o.good !== undefined && o.bad.length === 3 && cxInv(o.good, o.phi) !== o.good,
  );
  const d = cxInv(good, phi);
  const choices = rng.shuffle([good, ...bad]).map(String);
  return {
    prompt: `Toy RSA with **p = ${p}** and **q = ${q}**. The public exponent e must share no factor with φ(n) = (p − 1)(q − 1), or there is no private key d.`,
    answerType: "multi",
    parts: [
      { id: "e", label: "Valid e", ask: "Which of these could be e?", answerType: "choice", answer: String(good), choices,
        hint: "Work out φ(n), factorise it, and rule out every option that shares a prime factor with it." },
      { id: "d", label: "Private key d", ask: xpWhole("For that e, what is d?"), answerType: "number", answer: d, tolerance: 0,
        hint: "Try (1 + k × φ(n)) ÷ e for k = 1, 2, 3, … The first whole-number result is d." },
    ],
    explanation: [
      `φ(n) = ${p - 1} × ${q - 1} = ${phi} = ${fmtFact(factorize(phi))}.`,
      `${bad.map((e) => `${e} shares the factor ${gcd2(e, phi)}`).join("; ")}. Only **${good}** is coprime to ${phi}.`,
      `d: try (1 + k × ${phi}) ÷ ${good}:\n\n${cxDSteps(good, phi)}`,
      `So d = **${d}**.`,
    ].join("\n\n"),
    hints: [
      "e needs an inverse mod φ(n), which exists only when GCD(e, φ(n)) = 1.",
      `φ(n) is even, so every even option fails straight away. Check the odd ones against the other prime factors of φ(n).`,
    ],
    params: { expert: true, kind: "xp-choosee", p, q },
  };
}

function genExpert(subtopic, rng) {
  const t = rng.int(0, 2);
  if (subtopic === "primes-factors") return t === 0 ? xpDivCount(rng) : t === 1 ? xpFactorial(rng) : xpSqrtTest(rng);
  if (subtopic === "gcd-lcm") return t === 0 ? xpPairs(rng) : t === 1 ? xpFrob(rng) : xpSameRem(rng);
  if (subtopic === "divisibility") return t === 1 ? xpIncExc(rng) : xpTwoDigits(rng);
  if (subtopic === "modular") return t === 0 ? xpFermat(rng) : t === 1 ? xpCongr(rng) : xpIsbn(rng);
  if (subtopic === "ciphers") return t === 0 ? xpAffineDec(rng) : t === 1 ? xpAffineCrack(rng) : xpFreq(rng);
  if (subtopic === "keys-rsa") return t === 0 ? xpBreak(rng) : t === 1 ? xpDH(rng) : xpChooseE(rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "primes-factors") return genPrimes(difficulty, rng);
  if (subtopic === "gcd-lcm") return genGcdLcm(difficulty, rng);
  if (subtopic === "divisibility") return genDivisibility(difficulty, rng);
  if (subtopic === "modular") return genModular(difficulty, rng);
  if (subtopic === "ciphers") return cxWhole(cxGenCiphers(difficulty, rng));
  if (subtopic === "keys-rsa") return cxWhole(cxGenKeys(difficulty, rng));
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
  if (p.expert) return verifyExpert(question, answer);
  if (typeof p.kind === "string" && /^(c|v|k|x|rsa)-/.test(p.kind)) return cxVerify(question, answer);
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

// ---------------------------------------------------------------------------------------------
// Expert: independent check by brute force from params (never the generation shortcuts).

const xpPart = (ans, id) => (ans && typeof ans === "object" ? ans[id] : undefined);
const xpText = (v) => String(v ?? "").trim().toUpperCase();
const xpPowMod = (b, e, n) => Number((BigInt(b) ** BigInt(e)) % BigInt(n));
// Shift a word by s letters using alphabet lookups (not the generator's index arithmetic).
const xpShiftWord = (w, s) => cxTabCaesar(w, s);

function xpVerifyOne(q, ans) {
  const p = q.params;
  const P = (id) => toInt(xpPart(ans, id));
  switch (p.kind) {
    case "xp-divcount": {
      let total = 0, even = 0, sq = 0;
      for (let d = 1; d <= p.n; d++) {
        if (p.n % d) continue;
        total++;
        if (d % 2 === 0) even++;
        const r = Math.round(Math.sqrt(d));
        if (r * r === d) sq++;
      }
      return P("total") === total && P("even") === even && P("square") === sq;
    }
    case "xp-fact": {
      let f = 1n;
      for (let i = 2n; i <= BigInt(p.n); i++) f *= i;
      const s = f.toString();
      const zeros = s.length - s.replace(/0+$/, "").length;
      let t = 0;
      while (f % 2n === 0n) { f /= 2n; t++; }
      return P("zeros") === zeros && P("twos") === t;
    }
    case "xp-sqrt": {
      let maxP = 0;
      for (let k = 2; k * k <= p.N; k++) if (bfPrime(k)) maxP = k;
      let spf = p.N;
      for (let d = 2; d < p.N; d++) if (p.N % d === 0) { spf = d; break; }
      return P("maxp") === maxP && P("spf") === spf;
    }
    case "xp-pairs": {
      const pairs = [];
      const divs = [];
      for (let d = 1; d <= p.L; d++) if (p.L % d === 0) divs.push(d);
      for (const a of divs) for (const b of divs) {
        if (b <= a) continue;
        if (bfGcd([a, b]) === p.g && bfLcm([a, b]) === p.L) pairs.push(a + b);
      }
      return pairs.length > 0 && P("count") === pairs.length && P("sum") === Math.min(...pairs);
    }
    case "xp-frob": {
      const lim = p.a * p.b * 2;
      const can = new Array(lim + 1).fill(false);
      can[0] = true;
      for (let v = 1; v <= lim; v++) can[v] = (v >= p.a && can[v - p.a]) || (v >= p.b && can[v - p.b]);
      let largest = -1, count = 0;
      for (let v = 1; v <= lim; v++) if (!can[v]) { largest = v; count++; }
      return P("largest") === largest && P("count") === count;
    }
    case "xp-samerem": {
      for (let D = Math.min(...p.N); D >= 2; D--) {
        const r = p.N.map((x) => bfMod(x, D));
        if (r[0] === r[1] && r[1] === r[2]) return P("D") === D && P("r") === r[0];
      }
      return false;
    }
    case "xp-twodig": {
      const fills = [];
      for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) {
        const ds = p.digits.slice();
        ds[p.i] = a;
        ds[p.j] = b;
        const v = Number(ds.join(""));
        if (longDivRem(v, p.div) === 0) fills.push(v);
      }
      return fills.length > 0 && P("count") === fills.length && P("largest") === Math.max(...fills);
    }
    case "xp-incexc": {
      let one = 0, any = 0;
      for (let x = 1; x <= p.N; x++) {
        const k = [p.a, p.b, p.c].filter((d) => x % d === 0).length;
        if (k >= 1) any++;
        if (k === 1) one++;
      }
      return P("atleast") === any && P("exactly") === one;
    }
    case "xp-fermat":
      return P("e") === p.k % (p.p - 1) && P("rem") === xpPowMod(p.a, p.k, p.p);
    case "xp-congr": {
      const sols = [];
      for (let x = 0; x < p.n; x++) if (bfMod(p.a * x, p.n) === p.b) sols.push(x);
      return sols.length > 0 && P("count") === sols.length && P("smallest") === sols[0];
    }
    case "xp-isbn": {
      const x = toInt(ans);
      if (!(x >= 0 && x <= 9)) return false;
      const digits = [...p.shown].map((ch) => (ch === "?" ? x : Number(ch)));
      const ok = (ds) => ds.reduce((t, d, i) => t + (10 - i) * d, 0) % 11 === 0;
      // exactly one digit 0-9 completes the ISBN, and it is x
      const valid = [];
      for (let t = 0; t <= 9; t++) if (ok([...p.shown].map((ch) => (ch === "?" ? t : Number(ch))))) valid.push(t);
      return valid.length === 1 && ok(digits);
    }
    case "xp-affdec": {
      const inv = P("inv");
      if (!(inv >= 1 && inv <= 25) || (inv * p.a) % 26 !== 1) return false;
      const w = xpText(xpPart(ans, "word"));
      if (w.length !== p.cw.length) return false;
      // Re-encode the candidate with a lookup table and compare.
      const table = {};
      for (let x = 0; x < 26; x++) table[CX_ALPHA[x]] = CX_ALPHA[(p.a * x + p.b) % 26];
      return [...w].every((ch, i) => table[ch] === p.cw[i]);
    }
    case "xp-affcrack": {
      const keys = [];
      for (let a = 1; a < 26; a++) {
        if (bfGcd([a, 26]) !== 1) continue;
        for (let b = 0; b < 26; b++) if ((a * p.p1 + b) % 26 === p.c1 && (a * p.p2 + b) % 26 === p.c2) keys.push([a, b]);
      }
      return keys.length === 1 && P("a") === keys[0][0] && P("b") === keys[0][1];
    }
    case "xp-freq": {
      let s = null;
      for (let t = 1; t <= 25; t++) if (xpShiftWord("E", t) === p.top) s = t;
      if (s === null || P("shift") !== s) return false;
      const w = xpText(xpPart(ans, "word"));
      return xpShiftWord(w, s) === p.cw;
    }
    case "xp-break": {
      let sp = 0;
      for (let d = 2; d < p.n; d++) if (p.n % d === 0) { sp = d; break; }
      const q2 = p.n / sp;
      if (!bfPrime(sp) || !bfPrime(q2)) return false;
      const phi = cxPhiCount(p.n);
      return P("p") === sp && P("phi") === phi && P("d") === cxBruteInv(p.e, phi);
    }
    case "xp-dh": {
      const A = xpPowMod(p.g, p.a, p.p), B = xpPowMod(p.g, p.b, p.p);
      return P("A") === A && P("B") === B && P("S") === xpPowMod(p.g, p.a * p.b, p.p) && P("S") === xpPowMod(A, p.b, p.p);
    }
    case "xp-choosee": {
      const phi = cxPhiCount(p.p * p.q);
      const ch = q.parts.find((x) => x.id === "e").choices;
      const okE = (s) => cxBruteInv(Number(s), phi) !== null;
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || ch.filter(okE).length !== 1) return false;
      const e = xpPart(ans, "e");
      if (!ch.includes(String(e)) || !okE(e)) return false;
      return P("d") === cxBruteInv(Number(e), phi);
    }
    default:
      return false;
  }
}

function verifyExpert(q, answer) {
  if (answer === "" || answer === null || answer === undefined) return false;
  try {
    return xpVerifyOne(q, answer);
  } catch {
    return false;
  }
}
