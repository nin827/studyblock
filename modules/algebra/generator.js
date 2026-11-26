// Algebra generator. Uses only the seeded rng passed in by the engine.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Number -> display string; never "-0".
function fmtNum(n) {
  const r = round2(n);
  return String(Object.is(r, -0) ? 0 : r);
}

function intWithMinAbs(rng, lo, hi, minAbs) {
  let v;
  do {
    v = rng.int(lo, hi);
  } while (Math.abs(v) < minAbs);
  return v;
}

// "3x", "x", "-x", "-4x"
function coefX(a) {
  if (a === 1) return "x";
  if (a === -1) return "-x";
  return `${a}x`;
}

// " + 5", " - 5", " + x", " - 3x", "" for zero
function signedTerm(n, suffix = "") {
  if (n === 0) return "";
  const abs = Math.abs(n);
  const mag = abs === 1 && suffix ? "" : String(abs);
  return `${n > 0 ? " + " : " - "}${mag}${suffix}`;
}

// Pre-filled calculator rows: [[label, value], ...] -> [{ label, value }, ...].
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));

const linearText =(a, b, c) => `${coefX(a)}${signedTerm(b)} = ${c}`;
const quadText = (p, q) => `x²${signedTerm(p, "x")}${signedTerm(q)} = 0`;

// (x - r) factor; r = 0 gives "x"
function factor(r) {
  if (r === 0) return "x";
  return r > 0 ? `(x - ${r})` : `(x + ${-r})`;
}

// 4 unique choices: correct + 3 integer distractors from common mistakes,
// topped up with nearby integers if mistakes collide.
function buildChoices(correct, candidates, rng) {
  const correctStr = fmtNum(correct);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || !Number.isInteger(v)) return;
    const s = fmtNum(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// ---- Guided-mode hints: this question's numbers, never the final value of x ----

function linearHints(a, b, c, rounded) {
  const ax = coefX(a);
  const hints = [];
  if (b !== 0) {
    hints.push(`Get the x term on its own first: ${b > 0 ? `subtract ${b} from` : `add ${-b} to`} both sides of \`${linearText(a, b, c)}\`.`);
    hints.push(`That leaves \`${ax} = ${c - b}\`.`);
  } else {
    hints.push(`There is no number added to the x term, so \`${ax}\` is already on its own.`);
  }
  let last = `Now divide both sides by ${a}${a < 0 ? " (a negative divided by a negative is positive, and vice versa)" : ""}.`;
  if (rounded) last += ` In the calculator: \`${b !== 0 ? "(_c - _b)" : "_c"} / _a\`, then round to 2 decimal places.`;
  hints.push(last);
  return hints;
}

function quadraticHints(p, q) {
  if (q === 0) {
    return [
      `There is no number term, so take x out as a common factor: \`x(x${signedTerm(p)}) = 0\`.`,
      `A product is zero when either factor is zero, so solve \`x = 0\` and \`x${signedTerm(p)} = 0\`, then compare the two roots and give the **larger** one.`,
    ];
  }
  const labels = p !== 0 ? " (they are `_c` and `_b` in the calculator)" : "";
  const hints = [`Find two numbers that **multiply to ${q}** and **add to ${p}**${labels}.`];
  if (p === 0) hints.push(`They add to 0, so they are opposites (the same size, different signs): look for a number whose square is ${-q}.`);
  else if (q > 0) hints.push(`The product is positive, so both numbers have the same sign; the sum is ${p > 0 ? "positive, so both are positive" : "negative, so both are negative"}. Try the factor pairs of ${q}.`);
  else hints.push(`The product is negative, so one number is positive and one is negative. The sum is ${p > 0 ? "positive" : "negative"}, so the bigger one (ignoring signs) is ${p > 0 ? "positive" : "negative"}. Try the factor pairs of ${-q}.`);
  hints.push(`If the numbers are m and n, the equation factors as \`(x + m)(x + n) = 0\`, so the roots are x = -m and x = -n (flip the signs). Give the **larger** root.`);
  return hints;
}

function genLinear(difficulty, rng) {
  let a, b, c;
  if (difficulty === "easy") {
    a = rng.int(2, 9);
    const x = rng.int(1, 10);
    b = rng.int(1, 20);
    c = a * x + b;
  } else if (difficulty === "medium") {
    a = intWithMinAbs(rng, -12, 12, 2);
    const x = rng.int(-15, 15);
    b = intWithMinAbs(rng, -40, 40, 1);
    c = a * x + b;
  } else if (difficulty === "hard") {
    a = intWithMinAbs(rng, -15, 15, 2);
    b = rng.int(-50, 50);
    c = rng.int(-50, 50);
    // Never land exactly on a rounding half-step (x.xx5): redraw b and c with the same rng.
    while ((200 * (c - b)) % a === 0 && Math.abs((1000 * (c - b)) / a) % 10 === 5) {
      b = rng.int(-50, 50);
      c = rng.int(-50, 50);
    }
  } else {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }

  const rounded = difficulty === "hard";
  const x = (c - b) / a;
  const exact = Number.isInteger(x);
  const answerNum = exact ? x : round2(x);
  const eq = linearText(a, b, c);

  const steps = [`Start with \`${eq}\`.`];
  if (b !== 0) {
    const verb = b > 0 ? `Subtract ${b} from` : `Add ${-b} to`;
    steps.push(`${verb} both sides: \`${coefX(a)} = ${c - b}\`.`);
  }
  const divisor = a < 0 ? `(${a})` : `${a}`;
  steps.push(
    exact
      ? `Divide both sides by ${a}: \`x = ${c - b} / ${divisor} = ${fmtNum(x)}\`.`
      : `Divide both sides by ${a}: \`x = ${c - b} / ${divisor} ≈ ${fmtNum(answerNum)}\`.`
  );
  if (exact) {
    const bPart = b === 0 ? "" : signedTerm(b);
    steps.push(`Check: \`${a} · (${fmtNum(x)})${bPart} = ${c}\`.`);
  }

  let prompt = `Solve for x: \`${eq}\``;
  if (rounded) prompt += ". Give your answer to 2 decimal places.";

  const base = {
    prompt,
    tolerance: rounded ? 0.005 : 0,
    explanation: steps.join("\n\n"),
    params: { kind: "linear", a, b, c, rounded },
  };
  // Calculator rows only where a calculator helps (hard: non-whole answers); easy/medium are by hand.
  if (rounded) base.given = givenRows([["_a", a], ["_b", b], ["_c", c]].filter(([label]) => label !== "_b" || b !== 0));
  base.hints = linearHints(a, b, c, rounded);

  // Multiple choice only for whole-number answers (easy/medium).
  if (!rounded && rng.next() < 0.35) {
    const { answer, choices } = buildChoices(
      x,
      [
        -x, // sign slip
        (c + b) / a, // added b instead of subtracting
        c - b, // forgot to divide
        (c - b) * a, // multiplied instead of divided
        c / a, // ignored b
      ],
      rng
    );
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: answerNum, answerType: "number", choices: undefined };
}

function genQuadratic(difficulty, rng) {
  let R;
  if (difficulty === "medium") R = 9;
  else if (difficulty === "hard") R = 15;
  else throw new Error(`quadratic-roots has no "${difficulty}" level`);

  const r1 = rng.int(-R, R);
  let r2;
  do {
    r2 = rng.int(-R, R);
  } while (r2 === r1);

  const big = Math.max(r1, r2);
  const small = Math.min(r1, r2);
  const p = -(r1 + r2);
  const q = r1 * r2;
  const eq = quadText(p, q);

  // Zero root first so "x(x - 3)" reads naturally.
  const [f1, f2] = small === 0 ? [small, big] : [big, small];
  const steps = [
    `Look for two numbers that multiply to ${q} and add to ${p}: ${fmtNum(-big)} and ${fmtNum(-small)}.`,
    `Factor: \`${factor(f1)}${factor(f2)} = 0\`.`,
    `So x = ${big} or x = ${small}. The larger root is **${big}**.`,
  ];

  const base = {
    prompt: `Find the larger root of \`${eq}\``,
    tolerance: 0,
    explanation: steps.join("\n\n"),
    params: { kind: "quadratic", p, q },
  };
  // b and c of x² + bx + c = 0 (a = 1 is implied); only when both terms appear in the equation.
  if (p !== 0 && q !== 0) base.given = givenRows([["_b", p], ["_c", q]]);
  base.hints = quadraticHints(p, q);

  if (rng.next() < 0.4) {
    const { answer, choices } = buildChoices(
      big,
      [
        small, // picked the wrong root
        -big, // sign flip from the factors
        -small,
        -p, // took the sum of roots
        q, // took the product
      ],
      rng
    );
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: big, answerType: "number", choices: undefined };
}

// ---- Expert: multi-step questions (easy/medium/hard above are untouched) ----
//
// Every template draws all of its rng values first, then builds text. Hints use only values
// already drawn (no rng), and never state a final answer.

const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const isSquare = (n) => Number.isInteger(Math.sqrt(n));
// "3x + 5", "-x", "2x"
const lin = (m, a, v = "x") => `${m === 1 ? v : m === -1 ? `-${v}` : `${m}${v}`}${signedTerm(a)}`;
// "(3x + 5)/4", "x/4"
const over = (m, a, p) => (a === 0 && m === 1 ? `x/${p}` : `(${lin(m, a)})/${p}`);
const FLIP = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
const ineqChoice = (op, v) => `\`x ${op} ${v}\``;
const money = (n) => `£${n}`;

// linear / expert, template 0: fractions on both sides, x on both sides.
function genFracEquation(rng) {
  const x0 = rng.int(-9, 9);
  const p = rng.int(2, 7);
  let q;
  do q = rng.int(2, 7); while (q === p);
  const m = rng.int(1, 6);
  let n;
  do n = intWithMinAbs(rng, -5, 5, 1); while (m * q === n * p);
  const k = rng.int(-5, 5);
  const a = p * k - m * x0;
  const b = q * k - n * x0;

  const D = q * m - p * n; // x coefficient after clearing fractions
  const N = p * b - q * a;
  const eq = `${over(m, a, p)} = ${over(n, b, q)}`;
  const steps = [
    `Multiply both sides by ${p} × ${q} = ${p * q} to clear the fractions: \`${q}(${lin(m, a)}) = ${p}(${lin(n, b)})\`.`,
    `Expand: \`${lin(q * m, q * a)} = ${lin(p * n, p * b)}\`.`,
    `Collect x on the left and numbers on the right: \`${coefX(D)} = ${N}\`.`,
    `Divide by ${D}: \`x = ${N} / ${D < 0 ? `(${D})` : D} = ${x0}\`. In the calculator: \`(_p*_b - _q*_a) / (_m*_q - _n*_p)\`.`,
    `Check: both sides equal ${k}.`,
  ];
  return {
    prompt: `Solve for x: \`${eq}\``,
    answer: x0,
    answerType: "number",
    choices: undefined,
    tolerance: 0,
    explanation: steps.join("\n\n"),
    params: { kind: "x-frac", m, a, p, n, b, q },
    given: givenRows([["_m", m], ["_a", a], ["_p", p], ["_n", n], ["_b", b], ["_q", q]]),
    hints: [
      `Clear the fractions first: multiply both sides by ${p} × ${q} = ${p * q}. Each side keeps its own bracket: \`${q}(${lin(m, a)}) = ${p}(${lin(n, b)})\`.`,
      `Expand both brackets, then move every x term to the left and every number to the right. The x terms should combine to \`${coefX(D)}\`.`,
      `Divide both sides by ${D}${D < 0 ? " (watch the sign)" : ""}. In the calculator: \`(_p*_b - _q*_a) / (_m*_q - _n*_p)\`.`,
    ],
  };
}

// linear / expert, template 1: simultaneous equations, one with fractions (multi-part x, y).
function genSimultaneous(rng) {
  const a = rng.int(2, 5);
  let b;
  do b = rng.int(2, 6); while (b === a);
  const i = intWithMinAbs(rng, -5, 5, 1);
  const j = intWithMinAbs(rng, -5, 5, 1);
  const p = rng.int(1, 5);
  const sgn = rng.next() < 0.5 ? 1 : -1;
  let q0;
  do q0 = rng.int(1, 6); while (sgn === 1 && q0 * b === p * a);
  const q = sgn * q0;
  const x0 = a * i;
  const y0 = b * j;
  const c = i + j;
  const r = p * x0 + q * y0;

  const E = a * p - b * q; // y coefficient after eliminating x
  const eq1 = `x/${a} + y/${b} = ${c}`;
  const eq2 = `${coefX(p)}${signedTerm(q, "y")} = ${r}`;
  const cleared = `${b}x + ${a}y = ${a * b * c}`;
  const steps = [
    `Multiply the first equation by ${a} × ${b} = ${a * b}: \`${cleared}\`.`,
    `Eliminate x: multiply that by ${p} and the second equation by ${b}, then subtract: \`${E}y = ${p * a * b * c - b * r}\`, so **y = ${y0}**.`,
    `Substitute into \`${cleared}\`: \`${b}x = ${a * b * c - a * y0}\`, so **x = ${x0}**.`,
    `Check in the second equation: \`${p}(${x0})${q < 0 ? " - " : " + "}${Math.abs(q)}(${y0}) = ${r}\`.`,
  ];
  return {
    prompt: `Solve the simultaneous equations:\n\n\`${eq1}\`\n\n\`${eq2}\``,
    answerType: "multi",
    parts: [
      { id: "x", label: "x", ask: "Value of x", answerType: "number", answer: x0, tolerance: 0,
        hint: `Once you know y, put it into \`${cleared}\` and solve for x.` },
      { id: "y", label: "y", ask: "Value of y", answerType: "number", answer: y0, tolerance: 0,
        hint: `After eliminating x you are left with \`${E}y = …\`: one equation in y only.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-sim", a, b, c, p, q, r },
    given: givenRows([["_a", a], ["_b", b], ["_c", c], ["_p", p], ["_q", q], ["_r", r]]),
    hints: [
      `Clear the fractions in the first equation: multiply every term by ${a} × ${b} = ${a * b}.`,
      `Now both equations have whole numbers. Make the x coefficients match (multiply the cleared equation by ${p} and the second by ${b}), then subtract to eliminate x.`,
      "Solve the result for y, then substitute y back into either equation to find x.",
    ],
  };
}

// linear / expert, template 2: inequality with a bracket where dividing by a negative flips the sign.
function genInequality(rng) {
  const a = rng.int(2, 6);
  let c;
  do c = rng.int(-1, 6); while (c === 0);
  const bnd = intWithMinAbs(rng, -9, 9, 1);
  const b = intWithMinAbs(rng, -6, 6, 1);
  const op = rng.pick(["<", ">", "≤", "≥"]);
  const d = a * b - bnd * (a + c);
  const flip = FLIP[op];
  const answer = ineqChoice(flip, bnd);
  const choices = rng.shuffle([answer, ineqChoice(op, bnd), ineqChoice(flip, -bnd), ineqChoice(op, -bnd)]);

  const lhs = `${a}(${b} - x)`;
  const rhs = lin(c, d);
  const S = a + c;
  const steps = [
    `Expand the bracket: \`${a * b} - ${a}x ${op} ${rhs}\`.`,
    `Move the x terms to the left and the numbers to the right: \`${coefX(-S)} ${op} ${d - a * b}\`.`,
    `Divide by ${-S}. Dividing by a **negative** number reverses the inequality: \`x ${flip} ${bnd}\`.`,
  ];
  return {
    prompt: `Solve the inequality \`${lhs} ${op} ${rhs}\``,
    answer,
    answerType: "choice",
    choices,
    explanation: steps.join("\n\n"),
    params: { kind: "x-ineq", a, b, c, d, op },
    given: givenRows([["_a", a], ["_b", b], ["_c", c], ["_d", d]]),
    hints: [
      `Expand the bracket first: multiply both terms inside it by ${a}.`,
      `Move every x term to the left and every number to the right. The x terms combine to \`${coefX(-S)}\`.`,
      `You now divide by ${-S}, a negative number. Dividing (or multiplying) both sides by a negative number reverses the inequality sign.`,
    ],
  };
}

const WORD_CONTEXTS = [
  { what: "gyms", fee: "joining fee", unit: "visit", units: "visits" },
  { what: "bike hire schemes", fee: "membership fee", unit: "hour", units: "hours" },
  { what: "print shops", fee: "set-up fee", unit: "poster", units: "posters" },
  { what: "taxi firms", fee: "booking fee", unit: "mile", units: "miles" },
];

// linear / expert, template 3: word problem that needs setting up (multi-part).
function genWordProblem(rng) {
  const ctx = rng.pick(WORD_CONTEXTS);
  const rateHi = rng.int(6, 20);
  const rateLo = rng.int(2, rateHi - 1);
  const n0 = rng.int(3, 30);
  const feeLo = rng.int(1, 8) * 5;
  const feeHi = feeLo + n0 * (rateHi - rateLo);
  const swap = rng.next() < 0.5; // which option gets the cheaper rate

  const A = swap ? { fee: feeHi, rate: rateLo } : { fee: feeLo, rate: rateHi };
  const B = swap ? { fee: feeLo, rate: rateHi } : { fee: feeHi, rate: rateLo };
  const cheaper = A.rate < B.rate ? "Option A" : "Option B";
  const prompt = `Two ${ctx.what} compare prices. **Option A** charges a ${ctx.fee} of ${money(A.fee)} plus ${money(A.rate)} per ${ctx.unit}. **Option B** charges a ${ctx.fee} of ${money(B.fee)} plus ${money(B.rate)} per ${ctx.unit}.`;
  const steps = [
    `Let n be the number of ${ctx.units}. Option A costs \`${A.fee} + ${A.rate}n\` and Option B costs \`${B.fee} + ${B.rate}n\`.`,
    `Set them equal: \`${A.fee} + ${A.rate}n = ${B.fee} + ${B.rate}n\`, so \`${Math.abs(A.rate - B.rate)}n = ${Math.abs(B.fee - A.fee)}\` and **n = ${n0}**. In the calculator: \`(_feeB - _feeA) / (_rateA - _rateB)\`.`,
    `Above ${n0} ${ctx.units}, the option with the lower rate per ${ctx.unit} (${money(Math.min(A.rate, B.rate))}) is cheaper: **${cheaper}**.`,
  ];
  return {
    prompt,
    answerType: "multi",
    parts: [
      { id: "n", label: "Break-even", ask: `For how many ${ctx.units} do both options cost the same?`, answerType: "number", answer: n0, tolerance: 0,
        hint: "Subtract the smaller rate × n and the smaller fee from both sides, then divide." },
      { id: "cheaper", label: "Recommendation", ask: `Which option is cheaper for more ${ctx.units} than that?`, answerType: "choice", answer: cheaper, choices: ["Option A", "Option B"],
        hint: `Each extra ${ctx.unit} adds the rate, so for large numbers the rate matters more than the ${ctx.fee}.` },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-word", feeA: A.fee, rateA: A.rate, feeB: B.fee, rateB: B.rate },
    given: givenRows([["_feeA", A.fee], ["_rateA", A.rate], ["_feeB", B.fee], ["_rateB", B.rate]]),
    hints: [
      `Write each option's cost for n ${ctx.units}: ${ctx.fee} + rate × n.`,
      "Set the two costs equal and solve for n: collect the n terms on one side and the fees on the other.",
    ],
  };
}

// quadratic-roots / expert, template 0: rearrange first; a ≠ 1 and one root is a fraction (multi-part).
function genQuadRearrange(rng) {
  const r1 = rng.int(-6, 6);
  const qd = rng.int(2, 5);
  let pn;
  do pn = rng.int(-12, 12); while (pn === 0 || gcd(pn, qd) !== 1);
  const k = intWithMinAbs(rng, -6, 6, 1);

  // (x - r1)(qd·x - pn) = 0  ->  A x² + B x + C = 0
  const A = qd;
  const B = -(pn + qd * r1);
  const C = pn * r1;
  const B1 = B + k; // shown as x(A x + B1) = k x + D
  const D = -C;
  const r2 = pn / qd;
  const lo = Math.min(r1, r2);
  const hi = Math.max(r1, r2);
  const lhs = B1 === 0 ? `${A}x²` : `x(${lin(A, B1)})`;
  const rhs = lin(k, D);
  const std = `${A}x²${signedTerm(B, "x")}${signedTerm(C)} = 0`;
  const steps = [
    `Expand and move everything to the left: \`${std}\`.`,
    `Factor: \`${factor(r1)}(${lin(qd, -pn)}) = 0\`${r1 === 0 ? " (x is a common factor)" : ""}.`,
    `So x = ${r1} or x = ${pn}/${qd} ≈ ${fmtNum(r2)}. Smaller: **${fmtNum(lo)}**, larger: **${fmtNum(hi)}**.`,
  ];
  return {
    prompt: `Solve \`${lhs} = ${rhs}\`. Give both roots, to 2 decimal places where needed.`,
    answerType: "multi",
    parts: [
      { id: "smaller", label: "Smaller root", ask: "The smaller root", answerType: "number", answer: round2(lo), tolerance: 0.005,
        hint: "Set each bracket equal to zero. The smaller root is the one further left on the number line." },
      { id: "larger", label: "Larger root", ask: "The larger root", answerType: "number", answer: round2(hi), tolerance: 0.005,
        hint: "A bracket like (ax - b) gives x = b ÷ a, which may be a fraction: give it to 2 decimal places." },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-qrearr", A, B1, k, D },
    given: givenRows([["_a", A], ["_b", B1], ["_k", k], ["_d", D]]),
    hints: [
      "Expand the left side, then move every term to the left so the right side is 0.",
      `Collect like terms into the form \`ax² + bx + c = 0\`. Here a = ${A}, so the roots need not be whole numbers.`,
      "Factor (find two numbers that multiply to a × c and add to b, then split the middle term), or use the quadratic formula.",
    ],
  };
}

// quadratic-roots / expert, template 1: completing the square, irrational roots (multi-part).
function genCompleteSquare(rng) {
  const h = intWithMinAbs(rng, -7, 7, 1);
  let k;
  do k = rng.int(2, 40); while (isSquare(k));
  const b = 2 * h;
  const d = k - h * h; // x² + bx = d
  const root = -h + Math.sqrt(k);
  const steps = [
    `Half of ${b} is ${h}; add ${h}² = ${h * h} to both sides: \`x²${signedTerm(b, "x")} + ${h * h} = ${d + h * h}\`.`,
    `The left side is a perfect square: \`(x${signedTerm(h)})² = ${k}\`, so **h = ${h}** and **k = ${k}**.`,
    `Square root: \`x${signedTerm(h)} = ±√${k}\`, so x = ${-h} ± √${k}. The larger root is ${-h} + √${k} ≈ **${fmtNum(root)}**.`,
  ];
  return {
    prompt: `Solve \`x²${signedTerm(b, "x")} = ${d}\` by completing the square, writing it as \`(x + h)² = k\` (h may be negative).`,
    answerType: "multi",
    parts: [
      { id: "h", label: "h", ask: "Value of h", answerType: "number", answer: h, tolerance: 0,
        hint: "h is half the coefficient of x. Keep its sign." },
      { id: "k", label: "k", ask: "Value of k", answerType: "number", answer: k, tolerance: 0,
        hint: "k is the right-hand side after you add h² to both sides." },
      { id: "larger", label: "Larger root", ask: "The larger root, to 2 decimal places", answerType: "number", answer: round2(root), tolerance: 0.005,
        hint: "Take the square root of both sides (±), then subtract h. The larger root uses +√k." },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-qsquare", b, d },
    given: givenRows([["_b", b], ["_d", d]]),
    hints: [
      "Halve the coefficient of x and square the result. Add that square to both sides.",
      "The left side is now a perfect square, `(x + half)²`, where half is the number you just found.",
      "Take the square root of both sides, remembering ±, then solve for x.",
    ],
  };
}

const SHAPES = [
  { thing: "rectangular garden", unit: "m" },
  { thing: "rectangular poster", unit: "cm" },
  { thing: "rectangular car park", unit: "m" },
];

// quadratic-roots / expert, template 2: area word problem -> quadratic, reject the negative root.
function genRectangle(rng) {
  const sh = rng.pick(SHAPES);
  const w = rng.int(3, 20);
  const dd = rng.int(1, 12);
  const area = w * (w + dd);
  const steps = [
    `Let the width be w, so the length is w + ${dd} and \`w(w + ${dd}) = ${area}\`.`,
    `Rearrange: \`w²${signedTerm(dd, "w")} - ${area} = 0\`, which factors as \`(w - ${w})(w + ${w + dd}) = 0\`.`,
    `A width can't be negative, so **w = ${w} ${sh.unit}**; the length is ${w + dd} ${sh.unit}.`,
    `Perimeter = 2 × (${w} + ${w + dd}) = **${2 * (2 * w + dd)} ${sh.unit}**.`,
  ];
  return {
    prompt: `A ${sh.thing} is ${dd} ${sh.unit} longer than it is wide. Its area is ${area} ${sh.unit}².`,
    answerType: "multi",
    parts: [
      { id: "width", label: "Width", ask: `Width (${sh.unit})`, answerType: "number", answer: w, tolerance: 0,
        hint: "Factor the quadratic (or use the formula) and keep only the positive solution." },
      { id: "perimeter", label: "Perimeter", ask: `Perimeter (${sh.unit})`, answerType: "number", answer: 2 * (2 * w + dd), tolerance: 0,
        hint: "Perimeter = 2 × (width + length), and the length is the width plus the difference." },
    ],
    explanation: steps.join("\n\n"),
    params: { kind: "x-qrect", dd, area },
    given: givenRows([["_d", dd], ["_area", area]]),
    hints: [
      `Call the width w. Then the length is w + ${dd}.`,
      "Area = width × length gives a quadratic in w: expand it and move everything to one side so it equals 0.",
      "Solve it and reject the negative solution: a width can't be negative.",
    ],
  };
}

function genExpert(subtopic, rng) {
  if (subtopic === "linear") {
    const t = rng.int(0, 3);
    if (t === 0) return genFracEquation(rng);
    if (t === 1) return genSimultaneous(rng);
    if (t === 2) return genInequality(rng);
    return genWordProblem(rng);
  }
  if (subtopic === "quadratic-roots") {
    const t = rng.int(0, 2);
    if (t === 0) return genQuadRearrange(rng);
    if (t === 1) return genCompleteSquare(rng);
    return genRectangle(rng);
  }
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "linear") return genLinear(difficulty, rng);
  if (subtopic === "quadratic-roots") return genQuadratic(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Recover coefficients from params, or parse the equation in the prompt.
function paramsOf(question) {
  if (question && question.params) return question.params;
  const prompt = (question && question.prompt) || "";
  const m = /`([^`]+)`/.exec(prompt);
  if (!m) return null;
  const eq = m[1];
  let r = /^(-?\d*)x(?: ([+-]) (\d+))? = (-?\d+)$/.exec(eq);
  if (r) {
    const a = r[1] === "" ? 1 : r[1] === "-" ? -1 : Number(r[1]);
    const b = r[2] ? (r[2] === "+" ? 1 : -1) * Number(r[3]) : 0;
    return { kind: "linear", a, b, c: Number(r[4]), rounded: /decimal/.test(prompt) };
  }
  r = /^x²(?: ([+-]) (\d*)x)?(?: ([+-]) (\d+))? = 0$/.exec(eq);
  if (r) {
    const p = r[1] ? (r[1] === "+" ? 1 : -1) * (r[2] === "" ? 1 : Number(r[2])) : 0;
    const q = r[3] ? (r[3] === "+" ? 1 : -1) * Number(r[4]) : 0;
    return { kind: "quadratic", p, q };
  }
  return null;
}

// Independent check: substitute the answer back into the equation.
export function verify(question, answer) {
  const p = paramsOf(question);
  if (!p) return false;
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, question, answer);

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;

  if (p.kind === "linear") {
    if (p.a === 0) return false;
    const residual = Math.abs(p.a * x + p.b - p.c);
    if (p.rounded) {
      // In hundredths, with integers: |a·X + 100b − 100c| < |a|/2 strictly, so a half-step tie fails.
      const X = Math.round(x * 100);
      return Math.abs(x * 100 - X) < 1e-6 && 2 * Math.abs(p.a * X + 100 * (p.b - p.c)) < Math.abs(p.a);
    }
    return Number.isInteger(x) && residual === 0;
  }

  if (p.kind === "quadratic") {
    if (!Number.isInteger(x) || x * x + p.p * x + p.q !== 0) return false;
    const other = -p.p - x; // Vieta: roots sum to -p
    return x >= other;
  }

  return false;
}

// ---- Expert verification: substitute the candidate answers into the equations as written ----

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partOf = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);

// True when f has a root within ±tol of v (exact zero, or a sign change across the interval).
function rootNear(f, v, tol) {
  if (!Number.isFinite(v)) return false;
  if (f(v) === 0) return true;
  const d = tol + 1e-4;
  return Math.sign(f(v - d)) !== Math.sign(f(v + d));
}

function holds(op, l, r) {
  if (op === "<") return l < r;
  if (op === ">") return l > r;
  if (op === "≤") return l <= r;
  if (op === "≥") return l >= r;
  return false;
}

function verifyExpert(p, question, answer) {
  if (p.kind === "x-frac") {
    const x = num(answer);
    if (!Number.isInteger(x)) return false;
    // (m x + a)/p = (n x + b)/q  <=>  q(m x + a) = p(n x + b) (p, q > 0), checked in integers.
    return p.p > 0 && p.q > 0 && p.m * p.q !== p.n * p.p && p.q * (p.m * x + p.a) === p.p * (p.n * x + p.b);
  }
  if (p.kind === "x-sim") {
    const x = partOf(answer, "x");
    const y = partOf(answer, "y");
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    // x/a + y/b = c  <=>  b x + a y = a b c
    return p.b * x + p.a * y === p.a * p.b * p.c && p.p * x + p.q * y === p.r;
  }
  if (p.kind === "x-ineq") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
    const m = /^`x (<|>|≤|≥) (-?\d+)`$/.exec(String(answer));
    if (!m) return false;
    const v = Number(m[2]);
    const original = (x) => holds(p.op, p.a * (p.b - x), p.c * x + p.d);
    // The candidate must agree with the original inequality at every test point.
    const pts = [v - 3, v - 1, v - 0.5, v, v + 0.5, v + 1, v + 3];
    for (let t = -40; t <= 40; t++) pts.push(t, t + 0.5);
    return pts.every((x) => original(x) === holds(m[1], x, v));
  }
  if (p.kind === "x-word") {
    const n = partOf(answer, "n");
    const pick = answer && typeof answer === "object" ? String(answer.cheaper) : "";
    if (!Number.isInteger(n) || n <= 0) return false;
    if (p.feeA + p.rateA * n !== p.feeB + p.rateB * n) return false;
    const costA = p.feeA + p.rateA * (n + 1);
    const costB = p.feeB + p.rateB * (n + 1);
    if (pick === "Option A") return costA < costB;
    if (pick === "Option B") return costB < costA;
    return false;
  }
  if (p.kind === "x-qrearr") {
    const lo = partOf(answer, "smaller");
    const hi = partOf(answer, "larger");
    if (p.A === 0) return false;
    const f = (x) => x * (p.A * x + p.B1) - (p.k * x + p.D);
    return hi - lo > 0.0102 && rootNear(f, lo, 0.005) && rootNear(f, hi, 0.005);
  }
  if (p.kind === "x-qsquare") {
    const h = partOf(answer, "h");
    const k = partOf(answer, "k");
    const x = partOf(answer, "larger");
    if (!Number.isInteger(h) || !Number.isInteger(k) || k <= 0) return false;
    // (x + h)² = k must expand to x² + bx = d: 2h = b and h² - k = -d.
    if (2 * h !== p.b || h * h - k !== -p.d) return false;
    const f = (t) => t * t + p.b * t - p.d;
    // The larger root lies right of the vertex x = -b/2.
    return x > -p.b / 2 && rootNear(f, x, 0.005);
  }
  if (p.kind === "x-qrect") {
    const w = partOf(answer, "width");
    const per = partOf(answer, "perimeter");
    if (!Number.isInteger(w) || w <= 0) return false;
    return w * (w + p.dd) === p.area && per === 2 * (w + (w + p.dd));
  }
  return false;
}
