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

export function generate({ subtopic, difficulty, rng }) {
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
    if (p.rounded) return residual <= 0.005 * Math.abs(p.a) + 1e-6;
    return Number.isInteger(x) && residual === 0;
  }

  if (p.kind === "quadratic") {
    if (!Number.isInteger(x) || x * x + p.p * x + p.q !== 0) return false;
    const other = -p.p - x; // Vieta: roots sum to -p
    return x >= other;
  }

  return false;
}
