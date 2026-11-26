// Exponents & logarithms generator. Uses only the seeded rng passed in by the engine.
// Answer formats:
//   exact          a whole number (typed number, tolerance 0) or a fraction in simplest form
//                  ("3/8", "-1/2", "9/4": typed as text; improper fractions, never mixed numbers)
//   2 decimal places   tolerance 0.005 (exact half-cent ties are never generated)
//   powers/statements  multiple choice ("2⁸", "log₂ 32 = 5")
// verify() never reuses generate()'s algebra: it substitutes the answer back (raising the base to
// the answer and comparing), brackets a rounded answer between x − 0.005 and x + 0.005 on a
// monotone function, or simulates growth/decay one period at a time.

// ---------------------------------------------------------------------------------------------
// Helpers

const MINUS = "−";
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const fmt2 = (n) => {
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
};
const nearHalf = (n) => Math.abs((Math.abs(n * 100) % 1) - 0.5) < 1e-6;

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function reduce(n, d) {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
// Typed answer form: "3/8", "-3/2", "4".
function fracAns(n, d) {
  const [a, b] = reduce(n, d);
  return b === 1 ? String(a) : `${a}/${b}`;
}
// Display form with a real minus sign.
const fracShow = (n, d) => fracAns(n, d).replace(/^-/, MINUS);

// Shortest decimal (up to 4 dp) with "−"; plain() keeps "-" for calculator text.
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  const v = Object.is(r, -0) ? 0 : r;
  return v < 0 ? MINUS + String(-v) : String(v);
}
const plain = (n) => String(Math.round(n * 1e6) / 1e6);
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));

const SUPD = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
const SUBD = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
const sup = (n) => String(n).split("").map((c) => SUPD[c]).join("");
const sub = (n) => String(n).split("").map((c) => SUBD[c]).join("");
// "2⁵", "x⁻³"; fractional indices as "8^(2/3)".
const pw = (base, n, d = 1) => {
  const [a, b] = reduce(n, d);
  return b === 1 ? `${base}${sup(a)}` : `${base}^(${a < 0 ? MINUS : ""}${Math.abs(a)}/${b})`;
};
const logb = (b) => (b === "e" ? "ln" : `log${sub(b)}`);

// True when n is a whole-number power of b (1, b, b², …), checked with integer division only.
function isPowOf(n, b) {
  if (!Number.isInteger(n) || n < 1) return false;
  while (n % b === 0) n /= b;
  return n === 1;
}

const nz = (rng, lo, hi) => {
  let v;
  do v = rng.int(lo, hi);
  while (v === 0);
  return v;
};
function draw(make, ok, tries = 80) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = make();
    if (ok(v)) return v;
  }
  return v;
}

// 4 distinct strings: answer + first 3 distinct distractors (topped up by extra(k)).
function pick4(answer, cands, rng, extra) {
  const seen = new Set([answer]);
  const out = [];
  for (const c of cands) {
    if (out.length >= 3) break;
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  for (let k = 1; out.length < 3 && k < 40; k++) {
    const c = extra(k);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.length === 3 ? rng.shuffle([answer, ...out]) : null;
}

const EXACT = " Give the exact value: a whole number, or a fraction in simplest form like 3/8 or 9/4.";
const WHOLE = " Give a whole number.";
const DP2 = " Round to 2 decimal places.";

// Exact answer n/d: a typed number when whole, else a typed fraction (text).
function exactQ(q, n, d) {
  const [a, b] = reduce(n, d);
  if (b === 1) return { ...q, answerType: "number", answer: a, tolerance: 0, prompt: q.prompt + EXACT };
  return { ...q, answerType: "text", answer: `${a}/${b}`, prompt: q.prompt + EXACT };
}
function dpQ(q, exact) {
  return { ...q, answerType: "number", answer: round2(exact), tolerance: 0.005, prompt: q.prompt + DP2 };
}
const result = (exact) => (Math.abs(exact - round2(exact)) < 1e-9 ? `= **${fmt2(exact)}**` : `≈ ${num(exact)}, which rounds to **${fmt2(exact)}**`);

// ---------------------------------------------------------------------------------------------
// Index laws

const LAWS = "Index laws: `aᵐ × aⁿ = aᵐ⁺ⁿ`, `aᵐ ÷ aⁿ = aᵐ⁻ⁿ`, `(aᵐ)ⁿ = aᵐⁿ`.";
const NEG = "A negative index means a reciprocal: `a⁻ⁿ = 1/aⁿ`.";
const FRACI = "A fractional index is a root, then a power: `a^(p/q)` = (q-th root of a)ᵖ.";

function genIndexLaws(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["single", "single", "index", "eval"]);
    if (kind === "eval") {
      const b = rng.pick([2, 3, 4, 5, 6, 10]);
      const maxN = { 2: 7, 3: 5, 4: 4, 5: 4, 6: 3, 10: 5 }[b];
      const n = rng.pick([0, 1, -1, -1, -2, ...[2, 3, 4, 5, 6, 7].filter((k) => k <= maxN)]);
      const [N, D] = n >= 0 ? [b ** n, 1] : [1, b ** -n];
      const steps = n === 0 ? "Anything (except 0) to the power 0 is 1." : n > 0 ? `\`${pw(b, n)}\` means ${n} lots of ${b} multiplied together.` : `${NEG} So \`${pw(b, n)} = 1/${pw(b, -n)}\`.`;
      return exactQ(
        {
          prompt: `Evaluate \`${pw(b, n)}\`.`,
          explanation: [steps, `\`${pw(b, n)}\` = **${fracShow(N, D)}**.`].join("\n\n"),
          hints: n < 0 ? [NEG, `Work out \`${pw(b, -n)}\` first, then take its reciprocal.`] : n === 0 ? ["What happens to the value each time the index goes down by 1? You divide by the base."] : [`Multiply ${b} by itself ${n} times.`],
          params: { sub: "index-laws", kind: "evalPow", base: b, n, d: 1 },
        },
        N, D,
      );
    }
    const base = rng.pick([2, 3, 5, 7, 10, "x", "y", "a", "m"]);
    const op = rng.pick(["mul", "div", "pow"]);
    let m, n, k;
    if (op === "mul") { m = rng.int(2, 9); n = rng.int(2, 9); k = m + n; }
    else if (op === "div") { m = rng.int(5, 12); n = rng.int(2, m - 1); k = m - n; }
    else { m = rng.int(2, 6); n = rng.int(2, 5); k = m * n; }
    const expr = op === "mul" ? `${pw(base, m)} × ${pw(base, n)}` : op === "div" ? `${pw(base, m)} ÷ ${pw(base, n)}` : `(${pw(base, m)})${sup(n)}`;
    const law = op === "mul" ? "add the indices" : op === "div" ? "subtract the indices" : "multiply the indices";
    const work = op === "mul" ? `${m} + ${n}` : op === "div" ? `${m} − ${n}` : `${m} × ${n}`;
    const params = { sub: "index-laws", kind, base, op, m, n };
    const explanation = [`Same base, so ${law}: ${work} = ${k}.`, `\`${expr} = ${pw(base, k)}\`, so the answer is **${kind === "single" ? pw(base, k) : k}**.`].join("\n\n");
    const hints = [LAWS, `This is ${op === "mul" ? "a product" : op === "div" ? "a quotient" : "a power of a power"} with the same base, so ${law}.`];
    if (kind === "index") {
      return {
        prompt: `Write \`${expr}\` as a single power of ${base}. What is the index (the power)?${WHOLE}`,
        answerType: "number", answer: k, tolerance: 0, explanation, hints, params,
      };
    }
    const wrongIdx = op === "mul" ? [m * n, Math.abs(m - n)] : op === "div" ? [m + n, Number.isInteger(m / n) ? m / n : m * n] : [m + n, m ** n <= 40 ? m ** n : null];
    const cands = wrongIdx.filter((v) => v !== null && v !== k).map((v) => pw(base, v));
    if (typeof base === "number" && op !== "div") cands.splice(1, 0, `${op === "mul" ? base * base : base ** n}${sup(op === "mul" ? k : m)}`);
    else cands.push(`${op === "div" ? "1" : "2" + base}${sup(k)}`);
    const answer = pw(base, k);
    return {
      prompt: `Write \`${expr}\` as a single power of ${base}.`,
      answerType: "choice", answer, choices: pick4(answer, cands, rng, (j) => pw(base, k + (j % 2 ? j : -j))),
      explanation, hints, params,
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["letters", "fracIdx", "fracIdx", "negFrac"]);
    if (kind === "letters") {
      const v = rng.pick(["x", "y", "a", "b", "p", "t"]);
      const shape = rng.pick(["mmd", "pd"]);
      let expr, k, work;
      if (shape === "mmd") {
        const a = nz(rng, -4, 9), b = nz(rng, -5, 8), c = nz(rng, -4, 9);
        k = a + b - c;
        expr = `${pw(v, a)} × ${pw(v, b)} ÷ ${pw(v, c)}`;
        work = `${num(a)} + ${par(b)} − ${par(c)} = ${num(k)}`;
      } else {
        const a = nz(rng, -3, 5), b = rng.int(2, 4), c = nz(rng, -6, 9);
        k = a * b - c;
        expr = `(${pw(v, a)})${sup(b)} ÷ ${pw(v, c)}`;
        work = `${par(a)} × ${b} − ${par(c)} = ${num(k)}`;
      }
      return {
        prompt: `Simplify \`${expr}\` to the form \`${v}ⁿ\`. What is n?${WHOLE}`,
        answerType: "number", answer: k, tolerance: 0,
        explanation: [`Combine the indices: add for ×, subtract for ÷, multiply for a power of a power.`, `n = ${work}, so the answer is **${num(k)}**.`].join("\n\n"),
        hints: [LAWS, "Work left to right and watch the signs: subtracting a negative index adds it."],
        params: { sub: "index-laws", kind, v, expr, k },
      };
    }
    if (kind === "fracIdx") {
      const q = rng.pick([2, 2, 3, 3, 4]);
      const r = rng.int(2, q === 2 ? 12 : q === 3 ? 5 : 3);
      const p = nz(rng, -3, q === 2 ? 3 : 2);
      if (Math.abs(p) % q === 0) return genIndexLaws("medium", rng);
      const base = r ** q;
      const [N, D] = p > 0 ? [r ** p, 1] : [1, r ** -p];
      return exactQ(
        {
          prompt: `Evaluate \`${pw(base, p, q)}\`.`,
          explanation: [`The denominator ${q} means the ${q === 2 ? "square" : q === 3 ? "cube" : "fourth"} root: ${q === 2 ? "√" : q === 3 ? "∛" : "∜"}${base} = ${r}.`, `Then the power ${num(p)}: \`${pw(r, p)}\` = **${fracShow(N, D)}**.`].join("\n\n"),
          hints: [FRACI, ...(p < 0 ? [NEG] : []), `Start with the ${q === 2 ? "square" : q === 3 ? "cube" : "fourth"} root of ${base}.`],
          params: { sub: "index-laws", kind: "evalPow", base, n: p, d: q },
        },
        N, D,
      );
    }
    // (a/b)⁻ⁿ
    const { a, b } = draw(() => ({ a: rng.int(1, 6), b: rng.int(2, 7) }), (o) => gcd(o.a, o.b) === 1 && o.a !== o.b);
    const n = rng.int(1, 3);
    return exactQ(
      {
        prompt: `Evaluate \`(${a}/${b})${sup(-n)}\`.`,
        explanation: [`A negative index flips the fraction: \`(${a}/${b})${sup(-n)} = (${b}/${a})${sup(n)}\`.`, `\`${b ** n}/${a ** n}\` = **${fracShow(b ** n, a ** n)}**.`].join("\n\n"),
        hints: [NEG, n === 1 ? "For a fraction, the reciprocal just turns it upside down." : `For a fraction, the reciprocal turns it upside down: \`(${b}/${a})${sup(n)}\`. Then raise the top and the bottom to the power ${n}.`],
        params: { sub: "index-laws", kind: "evalFrac", a, b, n: -n, d: 1 },
      },
      b ** n, a ** n,
    );
  }

  if (difficulty !== "hard") throw new Error(`Unknown difficulty: ${difficulty}`);
  const kind = rng.pick(["fracBase", "fracBase", "mixedBase", "multi"]);
  if (kind === "fracBase") {
    const q = rng.pick([2, 2, 3]);
    const { r, s } = draw(() => ({ r: rng.int(1, q === 2 ? 7 : 4), s: rng.int(2, q === 2 ? 9 : 5) }), (o) => gcd(o.r, o.s) === 1 && o.r !== o.s);
    const p = rng.pick([-3, -2, -1, 1, 2, 3].filter((v) => Math.abs(v) % q !== 0));
    const A = r ** q, B = s ** q;
    const [N, D] = p > 0 ? [r ** p, s ** p] : [s ** -p, r ** -p];
    return exactQ(
      {
        prompt: `Evaluate \`(${A}/${B})^(${p < 0 ? MINUS : ""}${Math.abs(p)}/${q})\`.`,
        explanation: [
          `Take the ${q === 2 ? "square" : "cube"} root of the top and the bottom: ${r}/${s}.`,
          p < 0 ? `The negative index flips it: ${s}/${r}, then raise it to the power ${-p}.` : `Then raise it to the power ${p}.`,
          `\`${p < 0 ? `(${s}/${r})${sup(-p)}` : `(${r}/${s})${sup(p)}`}\` = **${fracShow(N, D)}**.`,
        ].join("\n\n"),
        // With power 1 the root itself is the answer, so that hint stays general.
        hints: [FRACI, ...(p < 0 ? [NEG] : []), p === 1 ? `Take the ${q === 2 ? "square" : "cube"} root of the top and of the bottom separately.` : `The ${q === 2 ? "square" : "cube"} root of ${A}/${B} is ${r}/${s}. Now deal with the power ${num(p)}.`],
        params: { sub: "index-laws", kind: "evalFrac", a: A, b: B, n: p, d: q },
      },
      N, D,
    );
  }
  if (kind === "mixedBase") {
    const base = rng.pick([2, 3]);
    const B2 = base ** 2, B3 = base ** 3;
    const a = nz(rng, -3, 6), b = nz(rng, -3, 4), c = nz(rng, -2, 4);
    const k = a + 2 * b - 3 * c;
    return {
      prompt: `Write \`${pw(base, a)} × ${pw(B2, b)} ÷ ${pw(B3, c)}\` as a single power of ${base}. What is the index?${WHOLE}`,
      answerType: "number", answer: k, tolerance: 0,
      explanation: [
        `Write every base as a power of ${base}: ${B2} = \`${pw(base, 2)}\` and ${B3} = \`${pw(base, 3)}\`.`,
        `\`${pw(B2, b)} = ${pw(base, 2 * b)}\` and \`${pw(B3, c)} = ${pw(base, 3 * c)}\`.`,
        `Index: ${num(a)} + ${par(2 * b)} − ${par(3 * c)} = **${num(k)}**.`,
      ].join("\n\n"),
      hints: [`Rewrite ${B2} and ${B3} as powers of ${base}, then use \`(aᵐ)ⁿ = aᵐⁿ\`.`, `\`${pw(B2, b)} = ${pw(base, 2 * b)}\` and \`${pw(B3, c)} = ${pw(base, 3 * c)}\`. Now add and subtract the indices.`],
      params: { sub: "index-laws", kind, base, a, b, c },
    };
  }
  // multi: (c xᵐ)ⁿ ÷ (d xᵏ) = A xᴮ
  const v = rng.pick(["x", "y", "a", "t"]);
  const c = rng.int(2, 5), n = rng.pick(c <= 3 ? [2, 3, 4] : [2, 3]), m = nz(rng, -3, 5);
  const divs = [];
  for (let dd = 2; dd <= c ** n; dd++) if ((c ** n) % dd === 0 && dd < c ** n) divs.push(dd);
  const d = rng.pick(divs);
  const k = nz(rng, -4, 9);
  const A = c ** n / d, Bi = m * n - k;
  return {
    prompt: `Simplify \`(${c}${pw(v, m)})${sup(n)} ÷ ${d}${pw(v, k)}\` to the form \`A${v}ᴮ\`.`,
    answerType: "multi",
    parts: [
      { id: "coef", label: "Coefficient A", ask: `The number in front.${WHOLE}`, answerType: "number", answer: A, tolerance: 0, hint: `The power ${n} applies to the ${c} too: work out ${c}${sup(n)}, then divide by ${d}.` },
      { id: "index", label: "Index B", ask: `The power of ${v}.${WHOLE}`, answerType: "number", answer: Bi, tolerance: 0, hint: `Multiply the indices for the power of a power (${num(m)} × ${n}), then subtract the index you divide by (${num(k)}).` },
    ],
    explanation: [
      `Deal with the numbers and the powers of ${v} separately.`,
      `Numbers: ${c}${sup(n)} = ${c ** n}, and ${c ** n} ÷ ${d} = **${A}**.`,
      `Powers: \`(${pw(v, m)})${sup(n)} = ${pw(v, m * n)}\`, and ${num(m * n)} − ${par(k)} = **${num(Bi)}**.`,
    ].join("\n\n"),
    hints: [LAWS],
    params: { sub: "index-laws", kind: "multi", c, m, n, d, k },
  };
}

// ---------------------------------------------------------------------------------------------
// Logarithms

const LOGDEF = "`log_b x = y` means `bʸ = x`: the log is the power you raise b to, to get x.";
const LOGLAWS = "Log laws (same base): `log a + log b = log(ab)`, `log a − log b = log(a/b)`, `n log a = log(aⁿ)`.";
// Largest k with b^k <= 100000 (at most 10), for every base used.
const MAXK = {};
for (const b of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20, 25, 100]) {
  let k = 0;
  while (k < 10 && b ** (k + 1) <= 100000) k++;
  MAXK[b] = k;
}
const EASY_BASES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20, 25, 100];

function genLogarithms(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["eval", "eval", "toIndex", "fromIndex"]);
    const b = rng.pick(EASY_BASES);
    const k = kind === "eval" ? rng.int(0, MAXK[b]) : rng.int(2, MAXK[b]);
    const N = b ** k;
    if (kind === "eval") {
      return {
        prompt: `Evaluate \`${logb(b)} ${N}\`.${WHOLE}`,
        answerType: "number", answer: k, tolerance: 0,
        explanation: [`Ask: ${b} to what power gives ${N}?`, k === 0 ? `Any base to the power 0 is 1, so the answer is **0**.` : `\`${pw(b, k)} = ${N}\`, so \`${logb(b)} ${N}\` = **${k}**.`].join("\n\n"),
        hints: [LOGDEF, `Keep multiplying ${b} by itself and count how many ${b}s you need to reach ${N}.`],
        params: { sub: "logarithms", kind: "eval", b, N, D: 1 },
      };
    }
    if (kind === "toIndex") {
      const answer = `${pw(b, k)} = ${N}`;
      return {
        prompt: `Which statement means the same as \`${logb(b)} ${N} = ${k}\`?`,
        answerType: "choice", answer,
        choices: pick4(answer, [[k, b, N], [N, k, b], [b, N, k], [k, N, b], [N, b, k], [b, k + 1, N]].filter(([x, e, r]) => x ** e !== r).map(([x, e, r]) => `${pw(x, e)} = ${r}`), rng, () => null),
        explanation: [`\`log_b x = y\` is the same as \`bʸ = x\`.`, `Here b = ${b}, x = ${N} and y = ${k}, so it means **${answer}**.`].join("\n\n"),
        hints: [LOGDEF, `The base of the log (${b}) stays the base of the power.`],
        params: { sub: "logarithms", kind, b, k, N },
      };
    }
    const answer = `${logb(b)} ${N} = ${k}`;
    return {
      prompt: `Write \`${pw(b, k)} = ${N}\` as a logarithm statement.`,
      answerType: "choice", answer,
      // [base, argument, value]; statements that happen to be true (like log₄ 16 = 2) are left out.
      choices: pick4(answer, [[k, N, b], [b, k, N], [N, b, k], [N, k, b], [k, b, N], [b, N, k + 1]].filter(([x, a, v]) => x ** v !== a).map(([x, a, v]) => `${logb(x)} ${a} = ${v}`), rng, () => null),
      explanation: [`\`bʸ = x\` is the same as \`log_b x = y\`.`, `Here b = ${b}, y = ${k} and x = ${N}, so it is **${answer}**.`].join("\n\n"),
      hints: [LOGDEF, `The base of the power (${b}) becomes the base of the log, and the log equals the power.`],
      params: { sub: "logarithms", kind, b, k, N },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["neg", "frac", "frac", "laws", "laws"]);
    if (kind === "neg") {
      const b = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 20]);
      const k = rng.int(1, Math.min(MAXK[b], 6));
      const N = b ** k;
      return exactQ(
        {
          prompt: `Evaluate \`${logb(b)} (1/${N})\`.`,
          explanation: [`\`1/${N} = 1/${pw(b, k)} = ${pw(b, -k)}\`.`, `So \`${logb(b)} (1/${N})\` = **${num(-k)}**.`].join("\n\n"),
          hints: [LOGDEF, `Write 1/${N} as a power of ${b}. ${NEG}`],
          params: { sub: "logarithms", kind: "eval", b, N: 1, D: N },
        },
        -k, 1,
      );
    }
    if (kind === "frac") {
      const r = rng.pick([2, 2, 3, 3, 5, 6, 7]);
      const { m, n } = draw(() => ({ m: rng.int(2, r === 2 ? 4 : 3), n: rng.int(1, r === 2 ? 9 : r <= 3 ? 5 : 4) }), (o) => o.n % o.m !== 0);
      const b = r ** m, N = r ** n;
      return exactQ(
        {
          prompt: `Evaluate \`${logb(b)} ${N}\`.`,
          explanation: [`Write both as powers of ${r}: ${b} = \`${pw(r, m)}\` and ${N} = \`${pw(r, n)}\`.`, `\`${pw(b, n, m)} = ${pw(r, n)} = ${N}\`, so the log is ${n}/${m} = **${fracShow(n, m)}**.`].join("\n\n"),
          hints: [LOGDEF, `Both ${b} and ${N} are powers of ${r}. Write them that way, then ask what power of ${pw(r, m)} gives ${pw(r, n)}.`],
          params: { sub: "logarithms", kind: "eval", b, N, D: 1 },
        },
        n, m,
      );
    }
    // laws: log_b X ± log_b Y = k
    const b = rng.pick([2, 3, 4, 5, 6, 10]);
    const k = rng.int(2, Math.min(MAXK[b], 5));
    const T = b ** k;
    const op = rng.pick(["+", "−"]);
    let X, Y;
    if (op === "+") {
      const ds = [];
      for (let d = 2; d < T; d++) if (T % d === 0 && !isPowOf(d, b) && !isPowOf(T / d, b)) ds.push(d);
      if (!ds.length) return genLogarithms("medium", rng);
      Y = rng.pick(ds);
      X = T / Y;
    } else {
      Y = rng.pick([2, 3, 5, 6, 7].filter((y) => !isPowOf(y, b)));
      X = T * Y;
    }
    return {
      prompt: `Evaluate \`${logb(b)} ${X} ${op} ${logb(b)} ${Y}\`.${WHOLE}`,
      answerType: "number", answer: k, tolerance: 0,
      explanation: [`Combine into one log first.`, `\`${logb(b)} ${X} ${op} ${logb(b)} ${Y} = ${logb(b)} ${op === "+" ? `(${X} × ${Y})` : `(${X} ÷ ${Y})`} = ${logb(b)} ${T}\`.`, `\`${pw(b, k)} = ${T}\`, so the answer is **${k}**.`].join("\n\n"),
      hints: [LOGLAWS, `Neither log is a whole number on its own. ${op === "+" ? "Multiply" : "Divide"} ${X} and ${Y} to get one log, then ask what power of ${b} that is.`],
      // The calculator helps with X × Y or X ÷ Y; no rows when one of them is also the answer.
      ...(X !== k && Y !== k ? { given: [{ label: "_X", value: X }, { label: "_Y", value: Y }] } : {}),
      params: { sub: "logarithms", kind, b, X, Y, op },
    };
  }

  if (difficulty !== "hard") throw new Error(`Unknown difficulty: ${difficulty}`);
  const kind = rng.pick(["combine", "change", "change", "multi"]);
  if (kind === "combine") {
    const o = draw(
      () => {
        const a = rng.int(2, 3), x = rng.int(2, 9), y = rng.int(2, 15), z = rng.int(2, 12);
        return { a, x, y, z, k: (x ** a * y) / z };
      },
      (v) => Number.isInteger(v.k) && v.k > 1 && v.k <= 5000 && v.z !== v.y && v.z !== v.x,
    );
    const { a, x, y, z, k } = o;
    return {
      prompt: `Here log means log base 10. Write \`${a} log ${x} + log ${y} − log ${z}\` as \`log k\`. What is k?${WHOLE}`,
      answerType: "number", answer: k, tolerance: 0,
      explanation: [
        `Use the power law first: \`${a} log ${x} = log ${pw(x, a)} = log ${x ** a}\`.`,
        `Add logs by multiplying: \`log ${x ** a} + log ${y} = log ${x ** a * y}\`.`,
        `Subtract by dividing: \`log ${x ** a * y} − log ${z} = log ${k}\`, so k = **${k}**.`,
      ].join("\n\n"),
      hints: [LOGLAWS, `The ${a} in front becomes a power: \`${a} log ${x} = log ${pw(x, a)}\`. Then multiply for +, divide for −.`],
      given: [{ label: "_x", value: x }, { label: "_y", value: y }, { label: "_z", value: z }],
      params: { sub: "logarithms", kind, a, x, y, z },
    };
  }
  if (kind === "change") {
    const { b, N, ex } = draw(
      () => {
        const bb = rng.int(2, 9), NN = rng.int(3, 500);
        return { b: bb, N: NN, ex: Math.log(NN) / Math.log(bb) };
      },
      (v) => Math.abs(v.ex - Math.round(v.ex)) > 1e-6 && !nearHalf(v.ex),
    );
    return dpQ(
      {
        prompt: `Use the change of base rule to find \`${logb(b)} ${N}\`.`,
        explanation: [`Change of base: \`log_b x = log x / log b\` (any base works, for example base 10).`, `\`${logb(b)} ${N} = log ${N} / log ${b}\` ${result(ex)}.`, `Check: \`${b}^${fmt2(ex)}\` is about ${num(b ** round2(ex))}, close to ${N}.`].join("\n\n"),
        hints: ["Change of base: `log_b x = log x / log b`. The calculator's `log` is base 10 and `ln` is base e; either works.", `In the calculator: \`log(_N) / log(_b)\`, then round to 2 decimal places.`],
        given: [{ label: "_b", value: b }, { label: "_N", value: N }],
        params: { sub: "logarithms", kind, b, N },
      },
      ex,
    );
  }
  // multi: log_b X − log_b Y (or +) = log_b T, then its value
  const b = rng.pick([2, 3, 5]);
  const k = rng.int(2, Math.min(MAXK[b], 6));
  const T = b ** k;
  const Y = rng.pick([3, 5, 6, 7, 10, 12].filter((y) => y % b !== 0));
  const X = T * Y;
  return {
    prompt: `Simplify \`${logb(b)} ${X} − ${logb(b)} ${Y}\` as \`${logb(b)} k\`, then evaluate it.`,
    answerType: "multi",
    parts: [
      { id: "k", label: "Single log", ask: `The number k in \`${logb(b)} k\`.${WHOLE}`, answerType: "number", answer: T, tolerance: 0, hint: `Subtracting logs with the same base means dividing: ${X} ÷ ${Y}.` },
      { id: "value", label: "Value", ask: `The value of \`${logb(b)} k\`.${WHOLE}`, answerType: "number", answer: k, tolerance: 0, hint: `Ask what power of ${b} gives your k.` },
    ],
    explanation: [`\`${logb(b)} ${X} − ${logb(b)} ${Y} = ${logb(b)} (${X} ÷ ${Y}) = ${logb(b)} ${T}\`, so k = **${T}**.`, `\`${pw(b, k)} = ${T}\`, so the value is **${k}**.`].join("\n\n"),
    hints: [LOGLAWS],
    // X ÷ Y is the calculator step; no rows when X or Y is also one of the answers (T, k).
    ...([X, Y].every((v) => v !== T && v !== k) ? { given: [{ label: "_X", value: X }, { label: "_Y", value: Y }] } : {}),
    params: { sub: "logarithms", kind: "multi", b, X, Y },
  };
}

// ---------------------------------------------------------------------------------------------
// Solving equations

const SAMEBASE = "If both sides are powers of the same base, the indices must be equal.";
const TAKELOG = "Take logs of both sides: `aˣ = N` gives `x = log N / log a` (or `ln N / ln a`).";

function genSolving(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["sameBase", "sameBase", "logDef"]);
    const b = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20]);
    if (kind === "sameBase") {
      const k = rng.int(b ** 3 <= 1000 ? -3 : -2, Math.min(MAXK[b], 8));
      const rhs = k >= 0 ? String(b ** k) : `1/${b ** -k}`;
      return {
        prompt: `Solve \`${b}ˣ = ${rhs}\`.${WHOLE}`,
        answerType: "number", answer: k, tolerance: 0,
        explanation: [`Write the right-hand side as a power of ${b}: ${rhs} = \`${pw(b, k)}\`${k < 0 ? " (a reciprocal gives a negative index)" : ""}.`, `So \`${b}ˣ = ${pw(b, k)}\` and x = **${num(k)}**.`].join("\n\n"),
        hints: [SAMEBASE, k < 0 ? `${NEG} Write ${b ** -k} as a power of ${b} first.` : k === 0 ? "Which power of any base gives 1?" : `Write ${rhs} as a power of ${b}.`],
        params: { sub: "solving", kind: "pow", a: b, N: k >= 0 ? b ** k : 1, D: k >= 0 ? 1 : b ** -k, c: 1, s: 0 },
      };
    }
    const k = rng.int(1, Math.min(MAXK[b], 5));
    return {
      prompt: `Solve \`${logb(b)} x = ${k}\`.${WHOLE}`,
      answerType: "number", answer: b ** k, tolerance: 0,
      explanation: [`\`log_b x = y\` means \`x = bʸ\`.`, `So x = \`${pw(b, k)}\` = **${b ** k}**.`].join("\n\n"),
      hints: [LOGDEF, `Rewrite it in index form with base ${b}.`],
      // The calculator helps evaluate b^k; no rows when the base is also the answer (k = 1).
      ...(k > 1 ? { given: [{ label: "_b", value: b }, { label: "_k", value: k }] } : {}),
      params: { sub: "solving", kind: "log", b, k, c: 0 },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["rewrite", "rewrite", "shifted", "logShift"]);
    if (kind === "rewrite") {
      const r = rng.pick([2, 2, 3, 3, 5]);
      const { m, n, neg } = draw(() => ({ m: rng.int(2, r === 2 ? 4 : 3), n: rng.int(1, r === 2 ? 9 : 5), neg: rng.next() < 0.3 }), (o) => o.n % o.m !== 0);
      const a = r ** m, N = r ** n;
      const nn = neg ? -n : n;
      const rhs = neg ? `1/${N}` : String(N);
      return exactQ(
        {
          prompt: `Solve \`${a}ˣ = ${rhs}\`.`,
          explanation: [`Write both sides as powers of ${r}: \`${a}ˣ = (${pw(r, m)})ˣ = ${r}^(${m}x)\` and ${rhs} = \`${pw(r, nn)}\`.`, `So ${m}x = ${num(nn)} and x = ${num(nn)}/${m} = **${fracShow(nn, m)}**.`].join("\n\n"),
          hints: [SAMEBASE, `Both ${a} and ${N} are powers of ${r}. Rewrite each side as a power of ${r}${neg ? ` (${NEG})` : ""}.`, `Then set the indices equal: \`${m}x = ${num(nn)}\`.`],
          params: { sub: "solving", kind: "pow", a, N: neg ? 1 : N, D: neg ? N : 1, c: 1, s: 0 },
        },
        nn, m,
      );
    }
    if (kind === "shifted") {
      const b = rng.pick([2, 3, 5, 10]);
      const p = rng.int(1, 3), s = nz(rng, -5, 5), k = rng.int(0, Math.min(MAXK[b], 5));
      const lin = `${p === 1 ? "" : p}x ${s < 0 ? MINUS : "+"} ${Math.abs(s)}`;
      return exactQ(
        {
          prompt: `Solve \`${b}^(${lin}) = ${b ** k}\`.`,
          explanation: [`${b ** k} = \`${pw(b, k)}\`, so the indices are equal: \`${lin} = ${k}\`.`, `${p === 1 ? "x" : `${p}x`} = ${k} ${s < 0 ? "+" : MINUS} ${Math.abs(s)} = ${num(k - s)}${p === 1 ? "" : `, so x = ${num(k - s)}/${p}`} = **${fracShow(k - s, p)}**.`].join("\n\n"),
          hints: [SAMEBASE, `Write ${b ** k} as a power of ${b}, then solve the linear equation \`${lin} = (that index)\`.`],
          params: { sub: "solving", kind: "lin", a: b, N: b ** k, D: 1, p, s },
        },
        k - s, p,
      );
    }
    const b = rng.pick([2, 3, 4, 5, 10]);
    const k = rng.int(1, Math.min(MAXK[b], 4)), c = nz(rng, -9, 9);
    const inner = `x ${c < 0 ? MINUS : "+"} ${Math.abs(c)}`;
    return {
      prompt: `Solve \`${logb(b)} (${inner}) = ${k}\`.${WHOLE}`,
      answerType: "number", answer: b ** k - c, tolerance: 0,
      explanation: [`Index form: \`${inner} = ${pw(b, k)} = ${b ** k}\`.`, `x = ${b ** k} ${c < 0 ? "+" : MINUS} ${Math.abs(c)} = **${num(b ** k - c)}**.`].join("\n\n"),
      hints: [LOGDEF, `Rewrite as \`${inner} = ${pw(b, k)}\`, then solve for x.`],
      // b and k only (c's sign is part of the equation); none when one of them is also the answer.
      ...(b ** k - c !== b && b ** k - c !== k ? { given: [{ label: "_b", value: b }, { label: "_k", value: k }] } : {}),
      params: { sub: "solving", kind: "log", b, k, c },
    };
  }

  if (difficulty !== "hard") throw new Error(`Unknown difficulty: ${difficulty}`);
  const kind = rng.pick(["nonExact", "coef", "exp", "multi"]);
  if (kind === "nonExact" || kind === "exp") {
    const o = draw(
      () => {
        const a = kind === "exp" ? Math.E : rng.int(2, 9);
        const N = kind === "exp" ? rng.pick([rng.int(2, 99), rng.int(2, 20) / 10 + 0.05, rng.int(101, 900)]) : rng.int(3, 999);
        const N1 = Math.round(N * 100) / 100;
        return { a, N: N1, ex: Math.log(N1) / Math.log(a) };
      },
      (v) => Math.abs(v.ex - Math.round(v.ex)) > 1e-6 && !nearHalf(v.ex) && v.N !== 1,
    );
    const { a, N, ex } = o;
    const A = kind === "exp" ? "e" : String(a);
    return dpQ(
      {
        prompt: `Solve \`${A}ˣ = ${num(N)}\`.`,
        explanation: kind === "exp"
          ? [`Take natural logs: \`x = ln ${num(N)}\`.`, `\`ln ${num(N)}\` ${result(ex)}.`].join("\n\n")
          : [`${num(N)} is not a whole power of ${a}, so take logs of both sides.`, `\`x log ${a} = log ${num(N)}\`, so \`x = log ${num(N)} / log ${a}\` ${result(ex)}.`].join("\n\n"),
        hints: kind === "exp"
          ? ["`ln` is the log with base e, so `eˣ = N` gives `x = ln N`.", "In the calculator: `ln(_N)`, then round to 2 decimal places."]
          : [TAKELOG, "In the calculator: `log(_N) / log(_a)`, then round to 2 decimal places."],
        given: kind === "exp" ? [{ label: "_N", value: N }] : [{ label: "_a", value: a }, { label: "_N", value: N }],
        params: { sub: "solving", kind: "pow", a, N, D: 1, c: 1, s: 0, rounded: true },
      },
      ex,
    );
  }
  // c·aˣ = N, with N a multiple of c
  const { a, c, R, ex } = draw(
    () => {
      const aa = rng.int(2, 9), cc = rng.int(2, 9), RR = rng.int(3, 120);
      return { a: aa, c: cc, R: RR, ex: Math.log(RR) / Math.log(aa) };
    },
    (v) => Math.abs(v.ex - Math.round(v.ex)) > 1e-6 && !nearHalf(v.ex),
  );
  const N = c * R;
  const explanation = [`Divide by ${c} first: \`${a}ˣ = ${N} ÷ ${c} = ${R}\`.`, `Take logs: \`x = log ${R} / log ${a}\` ${result(ex)}.`].join("\n\n");
  const params = { sub: "solving", kind: "pow", a, N, D: 1, c, s: 0, rounded: true };
  const given = [{ label: "_c", value: c }, { label: "_a", value: a }, { label: "_N", value: N }];
  if (kind === "multi") {
    return {
      prompt: `Solve \`${c} × ${a}ˣ = ${N}\` in two steps.`,
      answerType: "multi",
      parts: [
        { id: "power", label: `Value of ${a}ˣ`, ask: `First find \`${a}ˣ\`.${WHOLE}`, answerType: "number", answer: R, tolerance: 0, hint: `Undo the multiplication by ${c}.` },
        { id: "x", label: "x", ask: `Then find x.${DP2}`, answerType: "number", answer: round2(ex), tolerance: 0.005, hint: `${TAKELOG} Use your value of \`${a}ˣ\` as N.` },
      ],
      explanation,
      hints: [`Get \`${a}ˣ\` on its own before taking logs.`],
      given,
      params: { ...params, multi: true },
    };
  }
  return dpQ(
    {
      prompt: `Solve \`${c} × ${a}ˣ = ${N}\`.`,
      explanation,
      hints: [`Get \`${a}ˣ\` on its own first: divide both sides by ${c}. Don't take logs of \`${c} × ${a}ˣ\` as if it were \`${c * a}ˣ\`.`, TAKELOG, "In the calculator: `log(_N / _c) / log(_a)`, then round to 2 decimal places."],
      given,
      params,
    },
    ex,
  );
}

// ---------------------------------------------------------------------------------------------
// Growth & decay

const UNITS = ["years", "hours", "days", "minutes"];
const HALF_THINGS = [
  ["A sample of a radioactive isotope", "g", "years"],
  ["A sample of a radioactive tracer", "mg", "hours"],
  ["A sample of radon gas", "mg", "days"],
  ["A sample of iodine-131", "mg", "days"],
  ["A sample of carbon-11", "mg", "minutes"],
  ["A sample of a short-lived isotope", "g", "minutes"],
];
const DOUBLE_THINGS = [
  ["A culture of bacteria", "cells", "hours"],
  ["The number of fruit flies in a jar", "flies", "days"],
  ["The followers of a new channel", "followers", "weeks"],
  ["A colony of yeast cells", "cells", "hours"],
  ["The number of rabbits on an island, in a simple model,", "rabbits", "years"],
  ["A pond's patch of algae", "cm² of algae", "days"],
];
const GROW = [
  ["invests", "in a savings account that pays", "interest compounded once a year"],
  ["puts", "into a bond that pays", "compound interest once a year"],
  ["deposits", "in a fund that grows by", "a year, compounded yearly"],
];
const SHRINK = [
  ["A car bought for", "loses", "of its value each year"],
  ["A laptop bought for", "loses", "of its value each year"],
  ["A phone bought for", "loses", "of its value each year"],
  ["A machine bought for", "depreciates by", "a year"],
];
const NAMES = ["Ana", "Ben", "Chloe", "Dev", "Ella", "Femi", "Grace", "Hugo", "Isla", "Jin", "Kai", "Lena", "Maya", "Noah", "Omar", "Priya", "Ravi", "Sara", "Tom", "Zoe"];
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const pct = (r) => `${num(r)}%`;

function genGrowth(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["halving", "doubling"]);
    const k = rng.int(2, 5);
    const [what, unit, per] = rng.pick(kind === "halving" ? HALF_THINGS : DOUBLE_THINGS);
    const T = rng.int(2, 12);
    const m = kind === "halving" ? rng.int(3, 40) : rng.int(2, 60) * (rng.next() < 0.5 ? 10 : 1);
    const N0 = kind === "halving" ? m * 2 ** k : m;
    const ans = kind === "halving" ? m : m * 2 ** k;
    const t = k * T;
    const verb = kind === "halving" ? `has a half-life of ${T} ${per}` : `doubles every ${T} ${per}`;
    return {
      prompt: `${what} starts at ${N0} ${unit} and ${verb}. How many ${unit} ${kind === "halving" ? "are left" : "are there"} after ${t} ${per}?${WHOLE}`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: [`${t} ÷ ${T} = ${k} ${kind === "halving" ? "half-lives" : "doublings"}.`, kind === "halving" ? `\`${N0} × (1/2)${sup(k)} = ${N0} ÷ ${2 ** k}\` = **${ans}** ${unit}.` : `\`${N0} × ${pw(2, k)} = ${N0} × ${2 ** k}\` = **${ans}** ${unit}.`].join("\n\n"),
      hints: [`First count how many ${kind === "halving" ? "half-lives" : "doubling times"} fit into ${t} ${per}.`, `Then ${kind === "halving" ? "halve" : "double"} ${N0} that many times.`],
      given: [{ label: "_N0", value: N0 }, { label: "_period", value: T }, { label: "_time", value: t }],
      params: { sub: "growth-decay", kind, N0, T, t },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["compound", "compound", "depreciate", "halfLives"]);
    if (kind === "halfLives") {
      const [what, , per] = rng.pick(HALF_THINGS);
      const T = rng.int(2, 30), k = rng.int(2, 6);
      const ask = rng.pick(["time", "fraction"]);
      if (ask === "time") {
        return {
          prompt: `${what} has a half-life of ${T} ${per}. How long until only 1/${2 ** k} of it remains, in ${per}?${WHOLE}`,
          answerType: "number", answer: k * T, tolerance: 0,
          explanation: [`1/${2 ** k} = \`(1/2)${sup(k)}\`, so it takes ${k} half-lives.`, `${k} × ${T} = **${k * T}** ${per}.`].join("\n\n"),
          hints: ["Each half-life halves what is left: 1/2, 1/4, 1/8, …", `Find how many halvings give 1/${2 ** k}, then multiply by the half-life.`],
          given: [{ label: "_half", value: T }],
          params: { sub: "growth-decay", kind: "halfTime", T, frac: 2 ** k },
        };
      }
      return exactQ(
        {
          prompt: `${what} has a half-life of ${T} ${per}. What fraction of it remains after ${k * T} ${per}?`,
          explanation: [`${k * T} ÷ ${T} = ${k} half-lives.`, `\`(1/2)${sup(k)}\` = **1/${2 ** k}**.`].join("\n\n"),
          hints: [`Count the half-lives: ${k * T} ÷ ${T}.`, "Each half-life multiplies what is left by 1/2."],
          given: [{ label: "_half", value: T }, { label: "_time", value: k * T }],
          params: { sub: "growth-decay", kind: "halfFrac", T, t: k * T },
        },
        1, 2 ** k,
      );
    }
    const grow = kind === "compound";
    const { P, r, n, ex } = draw(
      () => {
        const PP = grow ? rng.int(10, 500) * 10 : rng.int(30, 400) * 50;
        const rr = grow ? rng.int(2, 18) / 2 : rng.int(5, 30);
        const nn = rng.int(2, 10);
        return { P: PP, r: rr, n: nn, ex: PP * (1 + (grow ? rr : -rr) / 100) ** nn };
      },
      (v) => !nearHalf(v.ex) && Math.abs(v.ex - round2(v.ex)) > 1e-7,
    );
    const name = rng.pick(NAMES);
    const g = grow ? rng.pick(GROW) : rng.pick(SHRINK);
    const prompt = grow
      ? `${name} ${g[0]} ${money(P)} ${g[1]} ${pct(r)} ${g[2]}. How much is in the account after ${n} years, in dollars?`
      : `${g[0]} ${money(P)} ${g[1]} ${pct(r)} ${g[2]}. What is it worth after ${n} years, in dollars?`;
    const factor = 1 + (grow ? r : -r) / 100;
    return dpQ(
      {
        prompt,
        explanation: [
          grow ? `Each year multiplies the amount by 1 + ${num(r)}/100 = ${num(factor)}.` : `Each year leaves 100% − ${num(r)}% = ${num(100 - r)}% of the value, a multiplier of ${num(factor)}.`,
          `\`${money(P)} × ${num(factor)}${sup(n)}\` ${result(ex)}.`,
        ].join("\n\n"),
        hints: [
          grow ? "Compound growth: `A = P × (1 + r/100)ⁿ`." : "Percentage decay: `V = P × (1 − r/100)ⁿ`.",
          `In the calculator: \`_P * (1 ${grow ? "+" : "-"} _r/100)^_n\`, then round to 2 decimal places.`,
        ],
        given: [{ label: "_P", value: P }, { label: "_r", value: r }, { label: "_n", value: n }],
        params: { sub: "growth-decay", kind: "compound", P, r: grow ? r : -r, n },
      },
      ex,
    );
  }

  if (difficulty !== "hard") throw new Error(`Unknown difficulty: ${difficulty}`);
  const kind = rng.pick(["doublingTime", "timeToTarget", "halfLifeFind", "rate", "multi"]);
  if (kind === "doublingTime") {
    const { r, ex } = draw(() => { const rr = rng.int(2, 30) / 2; return { r: rr, ex: Math.log(2) / Math.log(1 + rr / 100) }; }, (v) => !nearHalf(v.ex));
    const ctx = rng.pick([`A town's population grows by ${pct(r)} a year.`, `An investment grows by ${pct(r)} a year, compounded yearly.`, `A city's number of electric cars grows by ${pct(r)} a year.`, `Visitors to a website grow by ${pct(r)} a month.`]);
    const unit = ctx.includes("a month") ? "months" : "years";
    return dpQ(
      {
        prompt: `${ctx} How long does it take to double, in ${unit}? Treat the time as continuous (it can be a fraction of a ${unit.slice(0, -1)}).`,
        explanation: [`Doubling means \`${num(1 + r / 100)}ᵗ = 2\`.`, `Take logs: \`t = log 2 / log ${num(1 + r / 100)}\` ${result(ex)} ${unit}.`].join("\n\n"),
        hints: [`Doubling means the multiplier \`(1 + r/100)ᵗ\` equals 2, whatever the starting amount.`, `Solve \`${num(1 + r / 100)}ᵗ = 2\` by taking logs (in the calculator: \`log(2) / log(1 + _r/100)\`), then round to 2 decimal places.`],
        given: [{ label: "_r", value: r }],
        params: { sub: "growth-decay", kind: "time", P: 1, r, A: 2 },
      },
      ex,
    );
  }
  if (kind === "timeToTarget" || kind === "multi") {
    const { P, r, A, ex } = draw(
      () => {
        const PP = rng.int(10, 300) * 10, rr = rng.int(2, 16) / 2;
        const AA = Math.round(PP * rng.int(13, 40) / 10 / 10) * 10;
        return { P: PP, r: rr, A: AA, ex: Math.log(AA / PP) / Math.log(1 + rr / 100) };
      },
      (v) => v.A > v.P && !nearHalf(v.ex) && Math.abs(v.ex - Math.round(v.ex)) > 0.02,
    );
    const name = rng.pick(NAMES);
    const base = `${name} invests ${money(P)} at ${pct(r)} a year, compounded yearly.`;
    const f = num(1 + r / 100);
    if (kind === "multi") {
      const n = rng.int(2, 6);
      const val = P * (1 + r / 100) ** n;
      if (nearHalf(val)) return genGrowth("hard", rng);
      const year = Math.ceil(ex - 1e-12);
      return {
        prompt: `${base} ${name} wants to reach at least ${money(A)}.`,
        answerType: "multi",
        parts: [
          { id: "value", label: `Value after ${n} years`, ask: `How much is it worth after ${n} years, in dollars?${DP2}`, answerType: "number", answer: round2(val), tolerance: 0.005, hint: `\`A = P × ${f}ⁿ\` with n = ${n}.` },
          { id: "year", label: "First year at target", ask: `After how many whole years is the balance first at least ${money(A)}?${WHOLE}`, answerType: "number", answer: year, tolerance: 0, hint: `Solve \`${f}ⁿ = ${num(A / P)}\` with logs, then round up to the next whole year (interest is only added at the end of each year).` },
        ],
        explanation: [`After ${n} years: \`${money(P)} × ${f}${sup(n)}\` ${result(val)}.`, `Target: \`${f}ⁿ ≥ ${A} / ${P}\`, so n ≥ \`log(${num(A / P)}) / log ${f}\` ≈ ${num(ex)}.`, `Interest is added once a year, so round up: **${year}** years.`].join("\n\n"),
        hints: ["Compound growth: `A = P × (1 + r/100)ⁿ`."],
        given: [{ label: "_P", value: P }, { label: "_r", value: r }, { label: "_A", value: A }, { label: "_n", value: n }],
        params: { sub: "growth-decay", kind: "multi", P, r, A, n },
      };
    }
    return dpQ(
      {
        prompt: `${base} How long until it is worth ${money(A)}, in years? Treat the time as continuous.`,
        explanation: [`Solve \`${P} × ${f}ᵗ = ${A}\`.`, `Divide: \`${f}ᵗ = ${A} / ${P}\`.`, `Take logs: \`t = log(${A} / ${P}) / log ${f}\` ${result(ex)} years.`].join("\n\n"),
        hints: ["Set up `P × (1 + r/100)ᵗ = A`.", `Divide by ${money(P)} first, then take logs of both sides.`, "In the calculator: `log(_A / _P) / log(1 + _r/100)`, then round to 2 decimal places."],
        given: [{ label: "_P", value: P }, { label: "_r", value: r }, { label: "_A", value: A }],
        params: { sub: "growth-decay", kind: "time", P, r, A },
      },
      ex,
    );
  }
  if (kind === "halfLifeFind") {
    const { N0, N, t, ex } = draw(
      () => {
        const NN0 = rng.int(20, 200) * 10, tt = rng.int(2, 40), NN = Math.round(NN0 * rng.int(10, 85) / 100);
        return { N0: NN0, N: NN, t: tt, ex: (tt * Math.log(2)) / Math.log(NN0 / NN) };
      },
      (v) => v.N > 0 && v.N < v.N0 && !nearHalf(v.ex) && Math.abs(v.ex - Math.round(v.ex)) > 1e-6,
    );
    const [what, unit, per] = rng.pick(HALF_THINGS);
    return dpQ(
      {
        prompt: `${what} goes from ${N0} ${unit} to ${N} ${unit} in ${t} ${per}, decaying exponentially. What is its half-life, in ${per}?`,
        explanation: [`Use \`N = N₀ × (1/2)^(t/T)\`: \`${N} / ${N0} = (1/2)^(${t}/T)\`.`, `Take logs: \`${t}/T = log(${N0}/${N}) / log 2\`.`, `\`T = ${t} × log 2 / log(${N0}/${N})\` ${result(ex)} ${per}.`].join("\n\n"),
        hints: ["Half-life model: `N = N₀ × (1/2)^(t/T)`, where T is the half-life.", `Divide by ${N0}, then take logs to find t/T.`, "In the calculator: `_t * log(2) / log(_N0 / _N)`, then round to 2 decimal places."],
        given: [{ label: "_N0", value: N0 }, { label: "_N", value: N }, { label: "_t", value: t }],
        params: { sub: "growth-decay", kind: "halfLife", N0, N, t },
      },
      ex,
    );
  }
  // rate
  const { P, A, n, ex } = draw(
    () => {
      const PP = rng.int(10, 200) * 50, nn = rng.int(2, 12), AA = Math.round(PP * rng.int(110, 250) / 100);
      return { P: PP, A: AA, n: nn, ex: 100 * ((AA / PP) ** (1 / nn) - 1) };
    },
    (v) => v.A > v.P && !nearHalf(v.ex),
  );
  const name = rng.pick(NAMES);
  return dpQ(
    {
      prompt: `${name}'s investment grew from ${money(P)} to ${money(A)} in ${n} years, compounded yearly at a fixed rate. What was the yearly interest rate, as a percentage (without the % sign)?`,
      explanation: [`\`${P} × (1 + r/100)${sup(n)} = ${A}\`, so \`1 + r/100 = (${A}/${P})^(1/${n})\` ≈ ${num((A / P) ** (1 / n))}.`, `r = 100 × (that − 1) ${result(ex)}%.`].join("\n\n"),
      hints: ["Set up `P × (1 + r/100)ⁿ = A` and find the yearly multiplier first.", `The multiplier is the ${n}-th root of ${A} ÷ ${P}: \`(_A / _P)^(1/_n)\` in the calculator.`, "Subtract 1 and multiply by 100 to get a percentage, then round to 2 decimal places."],
      given: [{ label: "_P", value: P }, { label: "_A", value: A }, { label: "_n", value: n }],
      params: { sub: "growth-decay", kind: "rate", P, A, n },
    },
    ex,
  );
}

// ---------------------------------------------------------------------------------------------
// Expert: multi-step questions. Easy/medium/hard above are untouched; these run only when
// difficulty === "expert". Every template draws all of its rng values first, then builds text.
// Hints use only values already drawn (no rng) and never state a final answer.

const ROOT_NAME = { 2: "square", 3: "cube", 4: "fourth" };
const ROOT_SIGN = { 2: "√", 3: "∛", 4: "∜" };
// n/d as an exact typed answer: { answerType, answer, tolerance? }.
function exactPart(n, d) {
  const [a, b] = reduce(n, d);
  return b === 1 ? { answerType: "number", answer: a, tolerance: 0 } : { answerType: "text", answer: `${a}/${b}` };
}
// "x + 3", "x − 2", "x"
const xPlus = (c, v = "x") => (c === 0 ? v : `${v} ${c < 0 ? MINUS : "+"} ${Math.abs(c)}`);
const EXP_E = (B) => (B === "e" ? Math.E : B);
// Like pw, but a power of 1 is left bare ("y", not "y¹").
const pw1 = (base, n) => (n === 1 ? String(base) : pw(base, n));

// index-laws / expert 0: two or three fractional and negative powers multiplied and divided.
function genIxEval(rng) {
  const mk = () => {
    const q = rng.pick([2, 2, 3, 3, 4]);
    const r = rng.int(2, q === 2 ? 9 : q === 3 ? 5 : 3);
    let p;
    do p = nz(rng, -3, 3);
    while (gcd(p, q) !== 1);
    return { q, r, p, B: r ** q };
  };
  const o = draw(
    () => {
      const n = rng.int(2, 3);
      const ts = [mk()];
      while (ts.length < n) {
        const t = mk();
        if (!ts.some((u) => u.B === t.B || u.r === t.r)) ts.push(t);
      }
      const ops = ts.map((_, i) => (i === 0 ? "×" : rng.pick(["×", "÷"])));
      let N = 1, D = 1;
      ts.forEach((t, i) => {
        const e = ops[i] === "÷" ? -t.p : t.p;
        if (e > 0) N *= t.r ** e;
        else D *= t.r ** -e;
      });
      const [a, b] = reduce(N, D);
      return { ts, ops, a, b };
    },
    (v) => !(v.b === 1 && v.ts.some((t) => t.r === v.a)) && !(v.a === 1 && v.b === 1) && v.a <= 20000 && v.b <= 20000,
  );
  const { ts, ops, a, b } = o;
  const expr = ts.map((t, i) => (i === 0 ? "" : ` ${ops[i]} `) + pw(t.B, t.p, t.q)).join("");
  const each = ts.map((t, i) => {
    const e = ops[i] === "÷" ? -t.p : t.p;
    return `- \`${pw(t.B, t.p, t.q)}\`: ${ROOT_SIGN[t.q]}${t.B} = ${t.r}, then the power ${num(t.p)} gives ${fracShow(t.p > 0 ? t.r ** t.p : 1, t.p > 0 ? 1 : t.r ** -t.p)}${ops[i] === "÷" ? `; dividing by it multiplies by ${fracShow(e > 0 ? t.r ** e : 1, e > 0 ? 1 : t.r ** -e)}` : ""}.`;
  });
  return exactQ(
    {
      prompt: `Evaluate \`${expr}\`.`,
      explanation: [`Work out each power on its own, then combine the fractions.`, each.join("\n"), `Multiply everything together and simplify: **${fracShow(a, b)}**.`].join("\n\n"),
      hints: [
        `${FRACI} ${NEG}`,
        `Find each root first: ${ts.map((t) => `the ${ROOT_NAME[t.q]} root of ${t.B} is ${t.r}`).join(", ")}.`,
        "Raise each root to its own power (a negative power flips it into a fraction). Dividing by a fraction means multiplying by its reciprocal. Then multiply and simplify.",
      ],
      params: { sub: "index-laws", kind: "x-ixEval", ts: ts.map((t) => ({ B: t.B, p: t.p, q: t.q })), ops },
    },
    a, b,
  );
}

// index-laws / expert 1: working backwards, find an unknown (possibly fractional) index.
function genIxUnknown(rng) {
  const r = rng.pick([2, 2, 3, 3, 5]);
  const es = r === 2 ? [2, 3, 4, 5] : r === 3 ? [2, 3, 4] : [2, 3];
  const e1 = rng.pick(es);
  let e2;
  do e2 = rng.pick(es);
  while (e2 === e1);
  const a = nz(rng, -3, 4), b = nz(rng, -4, 5), c = rng.int(-3, 6);
  const B1 = r ** e1, B2 = r ** e2;
  const rhsShow = c >= 0 && r ** c <= 1000 ? String(r ** c) : c < 0 && r ** -c <= 1000 ? `1/${r ** -c}` : pw(r, c);
  const [nn, nd] = reduce(c + b - e2 * a, e1);
  const K = e2 * a - b;
  const idx = K === 0 ? `${e1}n` : `${e1}n ${K < 0 ? MINUS : "+"} ${Math.abs(K)}`;
  return exactQ(
    {
      prompt: `Find n if \`${B1}ⁿ × ${pw1(B2, a)} ÷ ${pw1(r, b)} = ${rhsShow}\`.`,
      explanation: [
        `Write everything as a power of ${r}: ${B1} = \`${pw(r, e1)}\`, ${B2} = \`${pw(r, e2)}\`${rhsShow !== pw(r, c) ? ` and ${rhsShow} = \`${pw(r, c)}\`` : ""}.`,
        `The left side is \`${r}^(${idx})\`: ${e1}n + ${e2} × ${par(a)} − ${par(b)}.`,
        `Set the indices equal: \`${idx} = ${c}\`, so \`${e1}n = ${c - e2 * a + b}\` and n = **${fracShow(nn, nd)}**.`,
      ].join("\n\n"),
      hints: [
        `Rewrite every number as a power of ${r}: ${B1} = \`${pw(r, e1)}\` and ${B2} = \`${pw(r, e2)}\`${rhsShow !== pw(r, c) ? `, and the right side too` : ""}.`,
        `Then \`${B1}ⁿ = ${r}^(${e1}n)\`. Combine the left side into one power of ${r} (multiply the indices, then add and subtract them).`,
        `Set the two indices equal and solve the linear equation for n. The answer may be a fraction.`,
      ],
      given: [{ label: "_a", value: a }, { label: "_b", value: b }],
      params: { sub: "index-laws", kind: "x-ixUnknown", r, B1, B2, a, b, c },
    },
    nn, nd,
  );
}

// index-laws / expert 2: (c·vᵐ)^(p/q) ÷ (d·vᵏ)ⁿ = A·vᴮ, with A possibly a fraction (multi-part).
function genIxMulti(rng) {
  const v = rng.pick(["x", "y", "a", "t"]);
  const q = rng.pick([2, 2, 3]);
  const r = rng.int(2, q === 2 ? 6 : 4);
  const p = q === 2 ? rng.pick([1, 3]) : rng.pick([1, 2]);
  const m1 = nz(rng, -3, 4);
  const d = rng.int(2, 5);
  const n = rng.int(1, 3);
  const k = nz(rng, -3, 4);
  const c = r ** q, m = q * m1;
  const [An, Ad] = reduce(r ** p, d ** n);
  const Bi = m1 * p - k * n;
  const second = n === 1 ? `${d}${pw1(v, k)}` : `(${d}${pw1(v, k)})${sup(n)}`;
  const coefPart = exactPart(An, Ad);
  return {
    prompt: `Simplify \`(${c}${pw(v, m)})^(${p}/${q}) ÷ ${second}\` to the form \`A${v}ᴮ\`.`,
    answerType: "multi",
    parts: [
      { id: "coef", label: "Coefficient A", ask: `The number A.${EXACT}`, ...coefPart,
        hint: `The power ${p}/${q} acts on ${c} as well: take the ${ROOT_NAME[q]} root of ${c}, raise it to the power ${p}, then divide by ${d}${n === 1 ? "" : sup(n)}.` },
      { id: "index", label: "Index B", ask: `The power of ${v}.${WHOLE}`, answerType: "number", answer: Bi, tolerance: 0,
        hint: `Multiply the index of ${v} inside each bracket by the power outside that bracket, then subtract the second result from the first.` },
    ],
    explanation: [
      `Deal with the numbers and the powers of ${v} separately.`,
      `Numbers: \`${c}^(${p}/${q})\`: ${ROOT_SIGN[q]}${c} = ${r}, and ${r}${p === 1 ? "" : sup(p)} = ${r ** p}. The divisor is ${d}${n === 1 ? "" : `${sup(n)} = ${d ** n}`}. So A = ${r ** p}/${d ** n} = **${fracShow(An, Ad)}**.`,
      `Powers: \`(${pw(v, m)})^(${p}/${q}) = ${pw(v, m1 * p)}\` and \`${n === 1 ? pw(v, k) : `(${pw(v, k)})${sup(n)} = ${pw(v, k * n)}`}\`. Subtract: ${num(m1 * p)} − ${par(k * n)} = **${num(Bi)}**.`,
    ].join("\n\n"),
    hints: [LAWS, "A power outside a bracket applies to the number and to the letter inside it."],
    params: { sub: "index-laws", kind: "x-ixMulti", c, m, p, q, d, k, n },
  };
}

// logarithms / expert 0: log equation that becomes a quadratic; one root must be rejected (multi-part).
function genLogEq(rng) {
  const b = rng.pick([2, 2, 3, 3, 5, 10]);
  const k = b === 2 ? rng.int(3, 6) : b === 3 ? rng.int(2, 4) : b === 5 ? rng.int(2, 3) : 2;
  const T = b ** k;
  const divs = [];
  for (let u = 1; u <= T; u++) if (T % u === 0 && u * u !== T) divs.push(u);
  const { x0, u } = draw(
    () => ({ x0: rng.int(-6, 10), u: rng.pick(divs) }),
    (o) => o.u - o.x0 !== 0 && T / o.u - o.x0 !== 0,
  );
  const v = T / u;
  const a = u - x0, c = v - x0;
  const x1 = -(a + c) - x0;
  const L = logb(b);
  const sumC = a + c, prodC = a * c - T;
  const quad = `x² ${sumC < 0 ? MINUS : "+"} ${Math.abs(sumC)}x ${prodC < 0 ? MINUS : "+"} ${Math.abs(prodC)} = 0`.replace(" + 0x", "").replace(" − 0x", "").replace(/ \+ 1x/, " + x").replace(/ − 1x/, " − x").replace(" + 0 = 0", " = 0");
  return {
    prompt: `Solve \`${L}(${xPlus(a)}) + ${L}(${xPlus(c)}) = ${k}\`. The quadratic you get has two roots, but only one is a solution.`,
    answerType: "multi",
    parts: [
      { id: "x", label: "Solution", ask: `The value of x that solves the equation.${WHOLE}`, answerType: "number", answer: x0, tolerance: 0,
        hint: `A log is only defined for a positive number: both \`${xPlus(a)}\` and \`${xPlus(c)}\` must be greater than 0.` },
      { id: "rejected", label: "Rejected root", ask: `The other root of the quadratic, which must be rejected.${WHOLE}`, answerType: "number", answer: x1, tolerance: 0,
        hint: "Put this root into the brackets: at least one of them comes out negative, so its log doesn't exist." },
    ],
    explanation: [
      `Combine the logs: \`${L}((${xPlus(a)})(${xPlus(c)})) = ${k}\`, so \`(${xPlus(a)})(${xPlus(c)}) = ${pw(b, k)} = ${T}\`.`,
      `Expand and rearrange: \`${quad}\`, which factorises as \`(${xPlus(-x0)})(${xPlus(-x1)}) = 0\`.`.replace("(x + 0)", "x").replace("(x − 0)", "x"),
      `x = ${num(x0)} gives brackets ${num(x0 + a)} and ${num(x0 + c)}, both positive, so **x = ${num(x0)}** works.`,
      `x = ${num(x1)} gives brackets ${num(x1 + a)} and ${num(x1 + c)}; a log of a negative number (or 0) does not exist, so **${num(x1)}** is rejected.`,
    ].join("\n\n"),
    hints: [
      LOGLAWS,
      `Combine the two logs into one, then write it in index form: \`(${xPlus(a)})(${xPlus(c)}) = ${pw(b, k)}\`.`,
      "Expand, move everything to one side and solve the quadratic by factorising.",
    ],
    given: [{ label: "_a", value: a }, { label: "_c", value: c }, { label: "_k", value: k }],
    params: { sub: "logarithms", kind: "x-logEq", b, k, a, c },
  };
}

// logarithms / expert 1: product of logs in different bases (change of base, then cancel).
function genLogChain(rng) {
  const PR = [2, 3, 5, 7];
  const o = draw(
    () => {
      const r = rng.pick(PR);
      let s;
      do s = rng.pick(PR);
      while (s === r);
      return { r, s, a: rng.int(1, 3), b: rng.int(1, 4), c: rng.int(1, 3), d: rng.int(1, 4) };
    },
    (v) => (v.a > 1 || v.c > 1) && v.r ** v.a <= 343 && v.s ** v.c <= 343 && v.s ** v.b <= 2401 && v.r ** v.d <= 2401 && (v.b * v.d) % (v.a * v.c) !== 0,
  );
  const { r, s, a, b, c, d } = o;
  const B1 = r ** a, X1 = s ** b, B2 = s ** c, X2 = r ** d;
  const [nn, nd] = reduce(b * d, a * c);
  return exactQ(
    {
      prompt: `Evaluate \`${logb(B1)} ${X1} × ${logb(B2)} ${X2}\` exactly.`,
      explanation: [
        `Change both logs to one base (ln, say): \`${logb(B1)} ${X1} = ln ${X1} / ln ${B1}\` and \`${logb(B2)} ${X2} = ln ${X2} / ln ${B2}\`.`,
        `Write each number as a power of a prime: ${X1} = \`${pw(s, b)}\`, ${B1} = \`${pw(r, a)}\`, ${X2} = \`${pw(r, d)}\`, ${B2} = \`${pw(s, c)}\`. So the product is \`(${b} ln ${s} / ${a} ln ${r}) × (${d} ln ${r} / ${c} ln ${s})\`.`,
        `ln ${s} and ln ${r} cancel, leaving ${b} × ${d} / (${a} × ${c}) = ${b * d}/${a * c} = **${fracShow(nn, nd)}**.`,
      ].join("\n\n"),
      hints: [
        "Change of base: `log_b x = ln x / ln b`. Write both logs this way.",
        `Every number here is a power of ${r} or ${s}. Use \`ln(aⁿ) = n ln a\` on each one.`,
        `The ln ${r} and ln ${s} terms cancel between the two fractions; multiply what is left and simplify.`,
      ],
      params: { sub: "logarithms", kind: "x-logChain", B1, X1, B2, X2 },
    },
    nn, nd,
  );
}

// logarithms / expert 2: given log_b x = u, find the log of a related expression.
function genLogGiven(rng) {
  const b = rng.pick([2, 3, 5, 10]);
  const o = draw(
    () => ({ u: rng.int(11, 59), m: rng.pick([2, 3, 4, 0.5]), n: rng.int(1, 3), op: rng.pick(["mul", "div"]) }),
    (v) => v.u % 10 !== 0 && b ** v.n <= 1000 && !Number.isInteger((v.u / 10) * v.m),
  );
  const u = o.u / 10, { m, n, op } = o;
  const B = b ** n;
  const xp = m === 0.5 ? "√x" : `x${sup(m)}`;
  const expr = op === "mul" ? `${B}${xp}` : `${xp} / ${B}`;
  const ans = Math.round((m * u + (op === "mul" ? n : -n)) * 10000) / 10000;
  const L = logb(b);
  return {
    prompt: `Given that \`${L} x = ${u}\`, find \`${L}(${expr})\`. Give the exact decimal value.`,
    answerType: "number", answer: ans, tolerance: 0,
    explanation: [
      `Split with the log laws: \`${L}(${expr}) = ${L} ${op === "mul" ? `${B} + ${L} ${xp}` : `${xp} − ${L} ${B}`}\`.`,
      `${B} = \`${pw(b, n)}\`, so \`${L} ${B} = ${n}\`. ${m === 0.5 ? "√x = x^(1/2), so `" + L + " √x = ½ " + L + " x`" : "`" + L + " " + xp + " = " + m + " " + L + " x`"} = ${num(m * u)}.`,
      `${num(m * u)} ${op === "mul" ? "+" : MINUS} ${n} = **${num(ans)}**.`,
    ].join("\n\n"),
    hints: [
      LOGLAWS,
      `Split the log into two: ${op === "mul" ? "a product becomes a sum" : "a quotient becomes a difference"}. ${m === 0.5 ? "A square root is the power 1/2" : `The power ${m} comes down in front`}.`,
      `${B} is a power of ${b}, so its log is a whole number. Replace \`${L} x\` by ${u} in the other term.`,
    ],
    given: [{ label: "_u", value: u }],
    params: { sub: "logarithms", kind: "x-logGiven", b, u, m, n, op },
  };
}

// solving / expert 0: a quadratic in Bˣ with one negative root to reject (multi-part).
function genSolveQuad(rng) {
  const o = draw(
    () => ({ B: rng.pick([2, 3, 4, 5, 10, "e"]), y1: rng.int(2, 30), s: rng.int(1, 9) }),
    (v) => v.y1 !== v.s && !nearHalf(Math.log(v.y1) / Math.log(EXP_E(v.B))),
  );
  const { B, y1, s } = o;
  const pC = y1 - s; // y² − pC·y − y1·s = 0
  const qC = y1 * s;
  const ex = Math.log(y1) / Math.log(EXP_E(B));
  const Bx = `${B}ˣ`;
  const midT = `${pC > 0 ? MINUS : "+"} ${Math.abs(pC) === 1 ? "" : Math.abs(pC) + " × "}${Bx}`;
  const eq = `${B}^(2x) ${midT} ${MINUS} ${qC} = 0`;
  const yEq = `y² ${pC > 0 ? MINUS : "+"} ${Math.abs(pC) === 1 ? "" : Math.abs(pC)}y ${MINUS} ${qC} = 0`;
  const lg = B === "e" ? `ln ${y1}` : `log ${y1} / log ${B}`;
  return {
    prompt: `Solve \`${eq}\`.`,
    answerType: "multi",
    parts: [
      { id: "y", label: `Value of ${Bx}`, ask: `The value of \`${Bx}\` that gives a real solution.${WHOLE}`, answerType: "number", answer: y1, tolerance: 0,
        hint: `Let y = \`${Bx}\`, so \`${B}^(2x) = y²\`. Factorise \`${yEq}\`.` },
      { id: "x", label: "x", ask: `The solution x.${DP2}`, answerType: "number", answer: round2(ex), tolerance: 0.005,
        hint: B === "e" ? "`eˣ = N` gives `x = ln N`." : TAKELOG },
    ],
    explanation: [
      `Let y = \`${Bx}\`. Then \`${B}^(2x) = (${Bx})² = y²\`, so the equation is \`${yEq}\`.`,
      `Factorise: \`(y ${MINUS} ${y1})(y + ${s}) = 0\`, so y = ${y1} or y = ${MINUS}${s}.`,
      `\`${Bx}\` is always positive, so y = ${MINUS}${s} is rejected and **${Bx} = ${y1}**.`,
      `x = \`${lg}\` ${result(ex)}.`,
    ].join("\n\n"),
    hints: [
      `Spot the hidden quadratic: \`${B}^(2x)\` is \`(${Bx})²\`. Substitute y = \`${Bx}\`.`,
      "Solve the quadratic in y. A power of a positive base can never be negative, so reject any negative y.",
    ],
    given: [{ label: "_q", value: qC }],
    params: { sub: "solving", kind: "x-solveQuad", B, pC, qC },
  };
}

// solving / expert 1: different bases on each side, a^(x + m) = c^(x + n).
function genSolveTwo(rng) {
  const o = draw(
    () => {
      const a = rng.int(2, 9);
      let c;
      do c = rng.int(2, 9);
      while (c === a);
      const m = nz(rng, -4, 4), n = rng.int(-4, 4);
      const la = Math.log(a), lc = Math.log(c);
      return { a, c, m, n, ex: (n * lc - m * la) / (la - lc) };
    },
    (v) => Math.log(v.a) / Math.log(v.c) !== 2 && Math.log(v.c) / Math.log(v.a) !== 2 && !nearHalf(v.ex) && Math.abs(v.ex) < 60 && Math.abs(v.ex - Math.round(v.ex)) > 1e-6 && !isPowOf(v.a, v.c) && !isPowOf(v.c, v.a),
  );
  const { a, c, m, n, ex } = o;
  const lhs = `${a}^(${xPlus(m)})`;
  const rhs = n === 0 ? `${c}ˣ` : `${c}^(${xPlus(n)})`;
  return dpQ(
    {
      prompt: `Solve \`${lhs} = ${rhs}\`.`,
      explanation: [
        `The bases ${a} and ${c} are not powers of one number, so take logs of both sides: \`(${xPlus(m)}) log ${a} = (${xPlus(n)}) log ${c}\`.`,
        `Expand and collect the x terms: \`x(log ${a} − log ${c}) = ${n} log ${c} − ${par(m)} log ${a}\`.`,
        `\`x = (${n} log ${c} − ${par(m)} log ${a}) / (log ${a} − log ${c})\` ${result(ex)}.`,
      ].join("\n\n"),
      hints: [
        `Take logs of both sides and bring the powers down: \`(${xPlus(m)}) log ${a} = (${xPlus(n)}) log ${c}\`.`,
        "Expand both brackets. log a and log c are just numbers: collect every x term on one side and factor out x.",
        "In the calculator: `(_n*log(_c) - _m*log(_a)) / (log(_a) - log(_c))`, then round to 2 decimal places.",
      ],
      given: [{ label: "_a", value: a }, { label: "_m", value: m }, { label: "_c", value: c }, { label: "_n", value: n }],
      params: { sub: "solving", kind: "x-solveTwo", a, c, m, n },
    },
    ex,
  );
}

// solving / expert 2: smallest whole n with (p/q)ⁿ < T. Dividing by a negative log flips the sign.
function genSolveIneq(rng) {
  const o = draw(
    () => {
      const q = rng.int(2, 12);
      const p = rng.int(1, q - 1);
      const T = rng.pick([0.1, 0.05, 0.02, 0.01, 0.005, 0.001, 0.25, 0.2]);
      return { p, q, T, ex: Math.log(T) / Math.log(p / q) };
    },
    (v) => gcd(v.p, v.q) === 1 && v.ex > 1.05 && v.ex < 80 && Math.abs(v.ex - Math.round(v.ex)) > 0.02,
  );
  const { p, q, T, ex } = o;
  const n = Math.ceil(ex);
  return {
    prompt: `Find the smallest whole number n for which \`(${p}/${q})ⁿ < ${T}\`.${WHOLE}`,
    answerType: "number", answer: n, tolerance: 0,
    explanation: [
      `Take logs of both sides: \`n log(${p}/${q}) < log ${T}\`.`,
      `\`log(${p}/${q})\` is negative (${p}/${q} is less than 1), so dividing by it **reverses** the inequality: \`n > log ${T} / log(${p}/${q})\` ≈ ${num(ex)}.`,
      `The smallest whole number above ${num(ex)} is **${n}**. Check: \`(${p}/${q})${sup(n)}\` ≈ ${num((p / q) ** n)} < ${T}, but \`(${p}/${q})${sup(n - 1)}\` ≈ ${num((p / q) ** (n - 1))}.`,
    ].join("\n\n"),
    hints: [
      "Take logs of both sides and bring the power n down in front.",
      `\`log(${p}/${q})\` is a negative number. Dividing an inequality by a negative number reverses its sign.`,
      "In the calculator: `log(_T) / log(_p/_q)`. n must be a whole number bigger than that, so round up.",
    ],
    given: [{ label: "_p", value: p }, { label: "_q", value: q }, { label: "_T", value: T }],
    params: { sub: "solving", kind: "x-solveIneq", p, q, T },
  };
}

const TWO_POINT_THINGS = [
  ["A town's population", "people"],
  ["A charity's membership", "members"],
  ["The number of electric buses in a region", "buses"],
  ["The number of nesting birds on a reserve", "birds"],
  ["A website's monthly visitors", "visitors"],
  ["A city's number of bike-share bikes", "bikes"],
];

// growth-decay / expert 0: find the yearly rate from two data points, then predict (multi-part).
function genTwoPoints(rng) {
  const o = draw(
    () => {
      const N1 = rng.int(20, 900) * 10, r0 = rng.int(15, 140) / 10, d = rng.int(2, 8), e = rng.int(1, 6), y1 = 2008 + rng.int(0, 10);
      const N2 = Math.round(N1 * (1 + r0 / 100) ** d);
      const g = (N2 / N1) ** (1 / d);
      const rate = 100 * (g - 1);
      const pred = N2 * g ** e;
      return { N1, N2, d, e, y1, rate, pred };
    },
    (v) => !nearHalf(v.rate) && Math.abs((v.pred % 1) - 0.5) > 0.02 && v.N2 > v.N1,
  );
  const { N1, N2, d, e, y1, rate, pred } = o;
  const [what, unit] = rng.pick(TWO_POINT_THINGS);
  const y2 = y1 + d, y3 = y2 + e;
  const P = Math.round(pred);
  return {
    prompt: `${what} grows by the same percentage each year. It was ${N1} ${unit} in ${y1} and ${N2} ${unit} in ${y2}.`,
    answerType: "multi",
    parts: [
      { id: "rate", label: "Yearly growth rate", ask: `The yearly growth rate, as a percentage (without the % sign).${DP2}`, answerType: "number", answer: round2(rate), tolerance: 0.005,
        hint: `${y2} − ${y1} = ${d} years. The yearly multiplier is the ${d}-th root of ${N2} ÷ ${N1}.` },
      { id: "pred", label: `Prediction for ${y3}`, ask: `The predicted number in ${y3}, to the nearest whole number. Use the unrounded rate.`, answerType: "number", answer: P, tolerance: 0,
        hint: `Start from ${N2} in ${y2} and multiply by the yearly multiplier once for each year up to ${y3}.` },
    ],
    explanation: [
      `Model: \`N = N₀ × gᵗ\`. From ${y1} to ${y2} is ${d} years, so \`g${sup(d)} = ${N2} / ${N1}\` and \`g = (${N2}/${N1})^(1/${d})\` ≈ ${num((N2 / N1) ** (1 / d))}.`,
      `Rate = 100 × (g − 1) ${result(rate)}%.`,
      `${y3} is ${e} year${e === 1 ? "" : "s"} after ${y2}: \`${N2} × g${e === 1 ? "" : sup(e)}\` ≈ ${num(pred)}, so about **${P}** ${unit}.`,
    ].join("\n\n"),
    hints: ["Growth by the same percentage each year means `N = N₀ × gᵗ`, where g is the yearly multiplier. Find g first."],
    given: [{ label: "_N1", value: N1 }, { label: "_N2", value: N2 }, { label: "_d", value: d }, { label: "_e", value: e }],
    params: { sub: "growth-decay", kind: "x-gTwoPoints", N1, N2, d, e },
  };
}

// growth-decay / expert 1: when does a smaller, faster-growing investment overtake a bigger one?
function genCross(rng) {
  const o = draw(
    () => {
      const P1 = rng.int(20, 100) * 100;
      const P2 = Math.round((P1 * rng.int(50, 90)) / 100 / 100) * 100;
      const r1 = rng.int(4, 12) / 2;
      const r2 = r1 + rng.int(2, 10) / 2;
      const t = Math.log(P1 / P2) / Math.log((1 + r2 / 100) / (1 + r1 / 100));
      return { P1, P2, r1, r2, t };
    },
    (v) => v.P2 > 0 && v.P2 < v.P1 && v.t < 60 && !nearHalf(v.t) && Math.abs(v.t - Math.round(v.t)) > 0.02,
  );
  const { P1, P2, r1, r2, t } = o;
  const nA = rng.pick(NAMES);
  let nB;
  do nB = rng.pick(NAMES);
  while (nB === nA);
  const year = Math.ceil(t);
  const g1 = num(1 + r1 / 100), g2 = num(1 + r2 / 100);
  return {
    prompt: `${nA} invests ${money(P1)} at ${pct(r1)} a year and ${nB} invests ${money(P2)} at ${pct(r2)} a year, both compounded yearly.`,
    answerType: "multi",
    parts: [
      { id: "t", label: "Equal value", ask: `Treating time as continuous, after how many years are the two investments worth the same?${DP2}`, answerType: "number", answer: round2(t), tolerance: 0.005,
        hint: `Set \`${P1} × ${g1}ᵗ = ${P2} × ${g2}ᵗ\`, collect the powers on one side and take logs.` },
      { id: "year", label: "First year ahead", ask: `After how many whole years is ${nB}'s investment first worth more than ${nA}'s?${WHOLE}`, answerType: "number", answer: year, tolerance: 0,
        hint: "Interest is only added at the end of each year, so round the equal-value time up." },
    ],
    explanation: [
      `Set the values equal: \`${P1} × ${g1}ᵗ = ${P2} × ${g2}ᵗ\`, so \`(${g2} / ${g1})ᵗ = ${P1} / ${P2}\`.`,
      `Take logs: \`t = log(${P1}/${P2}) / log(${g2}/${g1})\` ${result(t)} years.`,
      `Interest is added at the end of each year, so ${nB} is first ahead after **${year}** years.`,
    ].join("\n\n"),
    hints: ["Write each value after t years as `P × (1 + r/100)ᵗ` and set them equal."],
    given: [{ label: "_P1", value: P1 }, { label: "_r1", value: r1 }, { label: "_P2", value: P2 }, { label: "_r2", value: r2 }],
    params: { sub: "growth-decay", kind: "x-gCross", P1, r1, P2, r2 },
  };
}

// growth-decay / expert 2: half-life backwards (how much was there?) and forwards (multi-part).
function genHalfBack(rng) {
  const o = draw(
    () => {
      const T = rng.int(2, 40), t = rng.int(1, 120), N = rng.int(5, 400), Pc = rng.pick([1, 2, 5, 10, 15, 20, 30, 40, 60, 70, 80, 90]);
      return { T, t, N, Pc, N0: N * 2 ** (t / T), tt: (T * Math.log(100 / Pc)) / Math.log(2) };
    },
    (v) => v.t % v.T !== 0 && !nearHalf(v.N0) && !nearHalf(v.tt) && v.N0 < 1e6,
  );
  const { T, t, N, Pc, N0, tt } = o;
  const [what, unit, per] = rng.pick(HALF_THINGS);
  return {
    prompt: `${what} has a half-life of ${T} ${per}. After ${t} ${per}, ${N} ${unit} of it remain.`,
    answerType: "multi",
    parts: [
      { id: "start", label: "Starting amount", ask: `How much was there at the start, in ${unit}?${DP2}`, answerType: "number", answer: round2(N0), tolerance: 0.005,
        hint: `Work backwards: \`${N} = N₀ × (1/2)^(${t}/${T})\`, so divide ${N} by \`(1/2)^(${t}/${T})\`.` },
      { id: "time", label: `Time to ${Pc}%`, ask: `From the start, how long until only ${Pc}% of the original amount remains, in ${per}?${DP2}`, answerType: "number", answer: round2(tt), tolerance: 0.005,
        hint: `The starting amount cancels: solve \`(1/2)^(t/${T}) = ${Pc / 100}\` with logs.` },
    ],
    explanation: [
      `Model: \`N = N₀ × (1/2)^(t/T)\` with T = ${T}.`,
      `Backwards: \`N₀ = ${N} × 2^(${t}/${T})\` ${result(N0)} ${unit}.`,
      `${Pc}% left: \`(1/2)^(t/${T}) = ${Pc / 100}\`, so \`t = ${T} × log(${Pc / 100}) / log(0.5)\` ${result(tt)} ${per}.`,
    ].join("\n\n"),
    hints: ["Half-life model: `N = N₀ × (1/2)^(t/T)`. Dividing by (1/2)^(t/T) is the same as multiplying by 2^(t/T)."],
    given: [{ label: "_half", value: T }, { label: "_time", value: t }, { label: "_N", value: N }, { label: "_pct", value: Pc }],
    params: { sub: "growth-decay", kind: "x-gHalfBack", T, t, N, Pc },
  };
}

function genExpert(subtopic, rng) {
  const t = rng.int(0, 2);
  if (subtopic === "index-laws") return [genIxEval, genIxUnknown, genIxMulti][t](rng);
  if (subtopic === "logarithms") return [genLogEq, genLogChain, genLogGiven][t](rng);
  if (subtopic === "solving") return [genSolveQuad, genSolveTwo, genSolveIneq][t](rng);
  if (subtopic === "growth-decay") return [genTwoPoints, genCross, genHalfBack][t](rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "index-laws") return genIndexLaws(difficulty, rng);
  if (subtopic === "logarithms") return genLogarithms(difficulty, rng);
  if (subtopic === "solving") return genSolving(difficulty, rng);
  if (subtopic === "growth-decay") return genGrowth(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// Independent verification

// Exact answers: a whole number, or "n/d" in simplest form with d > 1. Returns the value or null.
function parseExact(ans) {
  if (typeof ans === "number") return Number.isInteger(ans) ? ans : null;
  const s = String(ans ?? "").trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  const m = s.match(/^(-?)(\d+)\/(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]), d = Number(m[3]);
  if (d <= 1 || n === 0 || gcd(n, d) !== 1) return null;
  return (m[1] ? -1 : 1) * (n / d);
}
// Relative comparison (values here are never 0, and can be tiny like 3^-20).
const rclose = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
// Rounded answer x is right when the monotone g crosses `target` strictly inside (x − 0.005, x + 0.005).
function bracket(g, x, target) {
  if (!Number.isFinite(x) || Math.abs(round2(x) - x) > 1e-9) return false;
  const lo = g(x - 0.005 + 1e-7) - target, hi = g(x + 0.005 - 1e-7) - target;
  return lo * hi < 0;
}
const isInt = (x) => typeof x === "number" ? Number.isInteger(x) : /^-?\d+$/.test(String(x).trim());
const fourChoices = (q, a) => Array.isArray(q.choices) && q.choices.length === 4 && new Set(q.choices).size === 4 && q.choices.includes(String(a));

// Reads "2⁸", "x⁻³", "16⁴" -> { base, idx }.
const SUPR = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
function readPow(s) {
  const m = String(s).match(/^([0-9]+|[a-z])([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/);
  if (!m) return null;
  return { base: m[1], idx: Number(m[2].split("").map((c) => SUPR[c]).join("")) };
}
const SUBR = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

function verifyIndex(q, answer, p) {
  if (p.kind === "evalPow" || p.kind === "evalFrac") {
    const x = parseExact(answer);
    if (x === null) return false;
    const base = p.kind === "evalFrac" ? p.a / p.b : p.base;
    return rclose(x, Math.pow(base, p.n / p.d)); // substitute: compare with a direct power
  }
  if (p.kind === "single" || p.kind === "index") {
    // Substitute numbers: the expression and base^answer agree for two test values of a letter base.
    const tests = typeof p.base === "number" ? [p.base] : [1.3, 2.1];
    let idx;
    if (p.kind === "single") {
      const r = readPow(answer);
      if (!r || r.base !== String(p.base)) return false;
      idx = r.idx;
    } else {
      if (!isInt(answer)) return false;
      idx = Number(answer);
    }
    return tests.every((v) => {
      const lhs = p.op === "mul" ? v ** p.m * v ** p.n : p.op === "div" ? v ** p.m / v ** p.n : (v ** p.m) ** p.n;
      return rclose(lhs, v ** idx);
    });
  }
  if (p.kind === "letters") {
    if (!isInt(answer)) return false;
    // Evaluate the written expression at x = 1.7 by reading it token by token.
    const v = 1.7;
    let val = 1, op = "×";
    for (const tok of p.expr.split(" ")) {
      if (tok === "×" || tok === "÷") { op = tok; continue; }
      const m = tok.match(/^\((.+)\)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/);
      let t;
      if (m) t = readPow(m[1].replace(/^[a-z]/, "x")).idx * Number(m[2].split("").map((c) => SUPR[c]).join(""));
      else t = readPow(tok.replace(/^[a-z]/, "x")).idx;
      val = op === "×" ? val * v ** t : val / v ** t;
    }
    return rclose(val, v ** Number(answer));
  }
  if (p.kind === "mixedBase") {
    if (!isInt(answer)) return false;
    const lhs = p.base ** p.a * (p.base ** 2) ** p.b / (p.base ** 3) ** p.c;
    return rclose(lhs, p.base ** Number(answer));
  }
  if (p.kind === "multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    if (!isInt(a.coef) || !isInt(a.index)) return false;
    // Substitute two values of the variable; both sides must agree.
    return [1.3, 2.2].every((v) => rclose((p.c * v ** p.m) ** p.n / (p.d * v ** p.k), Number(a.coef) * v ** Number(a.index)));
  }
  return false;
}

function verifyLogs(q, answer, p) {
  if (p.kind === "eval") {
    const x = parseExact(answer);
    if (x === null) return false;
    return rclose(Math.pow(p.b, x), p.N / p.D); // b^answer must give the number
  }
  if (p.kind === "toIndex" || p.kind === "fromIndex") {
    // Read the statement back and check it is a true identity with the same three numbers.
    const s = String(answer);
    let b, y, x;
    if (p.kind === "toIndex") {
      const m = s.match(/^(\S+) = (\d+)$/);
      const r = m && readPow(m[1]);
      if (!r) return false;
      [b, y, x] = [Number(r.base), r.idx, Number(m[2])];
    } else {
      const m = s.match(/^log([₀₁₂₃₄₅₆₇₈₉]+) (\d+) = (\d+)$/);
      if (!m) return false;
      [b, x, y] = [Number(m[1].split("").map((c) => SUBR[c]).join("")), Number(m[2]), Number(m[3])];
    }
    return b === p.b && b ** y === x && x === p.N;
  }
  if (p.kind === "laws") {
    if (!isInt(answer)) return false;
    const v = p.op === "+" ? Math.log(p.X) / Math.log(p.b) + Math.log(p.Y) / Math.log(p.b) : Math.log(p.X) / Math.log(p.b) - Math.log(p.Y) / Math.log(p.b);
    return Math.abs(v - Number(answer)) < 1e-9;
  }
  if (p.kind === "combine") {
    if (!isInt(answer)) return false;
    const v = p.a * Math.log10(p.x) + Math.log10(p.y) - Math.log10(p.z);
    return Math.abs(v - Math.log10(Number(answer))) < 1e-10;
  }
  if (p.kind === "change") return bracket((x) => Math.pow(p.b, x), Number(answer), p.N);
  if (p.kind === "multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    if (!isInt(a.k) || !isInt(a.value)) return false;
    const k = Number(a.k);
    return Math.abs(Math.log(p.X) / Math.log(p.b) - Math.log(p.Y) / Math.log(p.b) - Math.log(k) / Math.log(p.b)) < 1e-9 && p.b ** Number(a.value) === k;
  }
  return false;
}

function verifySolving(q, answer, p) {
  if (p.kind === "log") {
    if (!isInt(answer)) return false;
    return rclose(Math.log(Number(answer) + p.c) / Math.log(p.b), p.k); // substitute into the log
  }
  if (p.kind === "lin") {
    const x = parseExact(answer);
    return x !== null && rclose(Math.pow(p.a, p.p * x + p.s), p.N / p.D);
  }
  // pow: c·aˣ = N/D
  if (p.multi) {
    const a = answer && typeof answer === "object" ? answer : {};
    if (!isInt(a.power) || p.c * Number(a.power) !== p.N) return false;
    return bracket((x) => p.c * Math.pow(p.a, x), Number(a.x), p.N);
  }
  if (p.rounded) return bracket((x) => p.c * Math.pow(p.a, x), Number(answer), p.N / p.D);
  const x = parseExact(answer);
  return x !== null && rclose(p.c * Math.pow(p.a, x), p.N / p.D);
}

// Simulate period by period.
function grow(P, r, n) {
  let v = P;
  for (let i = 0; i < n; i++) v += (v * r) / 100;
  return v;
}

function verifyGrowth(q, answer, p) {
  switch (p.kind) {
    case "halving":
    case "doubling": {
      if (!isInt(answer)) return false;
      let v = p.N0;
      for (let t = 0; t < p.t; t += p.T) v = p.kind === "halving" ? v / 2 : v * 2;
      return Number(answer) === v;
    }
    case "halfTime": {
      if (!isInt(answer)) return false;
      let left = 1, t = 0;
      while (left > 1 / p.frac + 1e-12) { left /= 2; t += p.T; }
      return Number(answer) === t;
    }
    case "halfFrac": {
      const x = parseExact(answer);
      if (x === null) return false;
      let left = 1;
      for (let t = 0; t < p.t; t += p.T) left /= 2;
      return rclose(x, left);
    }
    case "compound": {
      const x = Number(answer);
      const truth = grow(p.P, p.r, p.n);
      return Math.abs(round2(x) - x) < 1e-9 && Math.abs(x - truth) < 0.005 - 1e-7;
    }
    case "time":
      return bracket((t) => p.P * Math.exp(t * Math.log1p(p.r / 100)), Number(answer), p.A);
    case "halfLife":
      // N0·(1/2)^(t/T) is increasing in T.
      return bracket((T) => p.N0 * Math.pow(0.5, p.t / T), Number(answer), p.N);
    case "rate":
      return bracket((r) => p.P * Math.pow(1 + r / 100, p.n), Number(answer), p.A);
    case "multi": {
      const a = answer && typeof answer === "object" ? answer : {};
      const v = Number(a.value), truth = grow(p.P, p.r, p.n);
      if (!(Math.abs(round2(v) - v) < 1e-9 && Math.abs(v - truth) < 0.005 - 1e-7)) return false;
      let bal = p.P, years = 0;
      while (bal < p.A && years < 1000) { bal = grow(bal, p.r, 1); years++; }
      return isInt(a.year) && Number(a.year) === years;
    }
    default:
      return false;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.sub) return false; // regenerate from the seed to get params back
  if (answer === "" || answer === null || answer === undefined) return false;
  if (question.answerType === "choice" && !fourChoices(question, answer)) return false;
  try {
    if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(question, answer, p);
    if (p.sub === "index-laws") return verifyIndex(question, answer, p);
    if (p.sub === "logarithms") return verifyLogs(question, answer, p);
    if (p.sub === "solving") return verifySolving(question, answer, p);
    if (p.sub === "growth-decay") return verifyGrowth(question, answer, p);
  } catch {
    return false;
  }
  return false;
}

// ---- Expert verification: substitute the candidate back into the problem as written ----

const partVal = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);

function verifyExpert(q, answer, p) {
  switch (p.kind) {
    case "x-ixEval": {
      const x = parseExact(answer);
      if (x === null) return false;
      const v = p.ts.reduce((acc, t, i) => (p.ops[i] === "÷" ? acc / Math.pow(t.B, t.p / t.q) : acc * Math.pow(t.B, t.p / t.q)), 1);
      return rclose(x, v);
    }
    case "x-ixUnknown": {
      const n = parseExact(answer);
      if (n === null) return false;
      return rclose((Math.pow(p.B1, n) * Math.pow(p.B2, p.a)) / Math.pow(p.r, p.b), Math.pow(p.r, p.c));
    }
    case "x-ixMulti": {
      const A = parseExact(partVal(answer, "coef"));
      const B = partVal(answer, "index");
      if (A === null || !isInt(B)) return false;
      return [1.3, 2.2].every((v) => rclose(Math.pow(p.c * v ** p.m, p.p / p.q) / (p.d * v ** p.k) ** p.n, A * v ** Number(B)));
    }
    case "x-logEq": {
      const x = partVal(answer, "x"), y = partVal(answer, "rejected");
      if (!isInt(x) || !isInt(y)) return false;
      const X = Number(x), Y = Number(y);
      if (X === Y || !(X + p.a > 0 && X + p.c > 0)) return false;
      const lhs = Math.log(X + p.a) / Math.log(p.b) + Math.log(X + p.c) / Math.log(p.b);
      if (Math.abs(lhs - p.k) > 1e-9) return false;
      // The rejected root satisfies the combined (product) equation but makes a log undefined.
      return (Y + p.a) * (Y + p.c) === Math.round(Math.pow(p.b, p.k)) && (Y + p.a <= 0 || Y + p.c <= 0);
    }
    case "x-logChain": {
      const x = parseExact(answer);
      if (x === null) return false;
      return Math.abs(x - (Math.log(p.X1) / Math.log(p.B1)) * (Math.log(p.X2) / Math.log(p.B2))) < 1e-9;
    }
    case "x-logGiven": {
      const x = Number(answer);
      if (!Number.isFinite(x) || Math.abs(x * 1e4 - Math.round(x * 1e4)) > 1e-6) return false;
      const X = Math.pow(p.b, p.u);
      const inner = (p.m === 0.5 ? Math.sqrt(X) : X ** p.m);
      const val = p.op === "mul" ? p.b ** p.n * inner : inner / p.b ** p.n;
      return Math.abs(Math.log(val) / Math.log(p.b) - x) < 1e-6;
    }
    case "x-solveQuad": {
      const y = partVal(answer, "y");
      if (!isInt(y)) return false;
      const Y = Number(y);
      const f = (v) => v * v - p.pC * v - p.qC;
      if (Y <= 0 || f(Y) !== 0) return false;
      let pos = 0;
      for (let v = 1; v <= 2000; v++) if (f(v) === 0) pos++;
      if (pos !== 1) return false;
      const base = p.B === "e" ? Math.E : p.B;
      return bracket((x) => (p.B === "e" ? Math.exp(x) : Math.pow(base, x)), Number(partVal(answer, "x")), Y);
    }
    case "x-solveTwo":
      return bracket((x) => (x + p.m) * Math.log10(p.a) - (x + p.n) * Math.log10(p.c), Number(answer), 0);
    case "x-solveIneq": {
      if (!isInt(answer)) return false;
      let v = 1, n = 0;
      while (!(v < p.T) && n < 1000) { v = (v * p.p) / p.q; n++; }
      return Number(answer) === n;
    }
    case "x-gTwoPoints": {
      if (!bracket((r) => p.N1 * Math.pow(1 + r / 100, p.d), Number(partVal(answer, "rate")), p.N2)) return false;
      const pr = partVal(answer, "pred");
      // Log-linear extrapolation from the two data points.
      const truth = Math.exp(Math.log(p.N1) + ((p.d + p.e) / p.d) * (Math.log(p.N2) - Math.log(p.N1)));
      return isInt(pr) && Math.abs(Number(pr) - truth) < 0.5;
    }
    case "x-gCross": {
      if (!bracket((t) => p.P2 * Math.pow(1 + p.r2 / 100, t) - p.P1 * Math.pow(1 + p.r1 / 100, t), Number(partVal(answer, "t")), 0)) return false;
      let a = p.P1, b = p.P2, years = 0;
      while (!(b > a) && years < 1000) { a = grow(a, p.r1, 1); b = grow(b, p.r2, 1); years++; }
      const yr = partVal(answer, "year");
      return isInt(yr) && Number(yr) === years;
    }
    case "x-gHalfBack":
      return bracket((x) => x * Math.pow(0.5, p.t / p.T), Number(partVal(answer, "start")), p.N)
        && bracket((s) => 100 * Math.pow(0.5, s / p.T), Number(partVal(answer, "time")), p.Pc);
    default:
      return false;
  }
}
