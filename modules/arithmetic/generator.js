// Arithmetic generator. Uses only the seeded rng passed in by the engine.

// Round half away from zero; the 1e-9 nudge absorbs binary error (2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

const RANGES = {
  addition: { easy: [1, 20], medium: [10, 999], hard: [1000, 99999] },
};

export function generate({ subtopic, difficulty, rng }) {
  let a, b, sym, answer, explanation;
  let tolerance = 0;
  let rounded = false;

  switch (subtopic) {
    case "addition": {
      const range = RANGES.addition[difficulty];
      if (!range) throw new Error(`Unknown difficulty: ${difficulty}`);
      a = rng.int(range[0], range[1]);
      b = rng.int(range[0], range[1]);
      sym = "+";
      answer = a + b;
      explanation = `${a} + ${b} = ${answer}`;
      break;
    }
    case "subtraction": {
      sym = "-";
      if (difficulty === "easy") {
        a = rng.int(1, 20);
        b = rng.int(1, a);
      } else if (difficulty === "medium") {
        a = rng.int(10, 999);
        b = rng.int(1, a);
      } else if (difficulty === "hard") {
        a = rng.int(100, 9999);
        b = rng.int(100, 9999);
      } else {
        throw new Error(`Unknown difficulty: ${difficulty}`);
      }
      answer = a - b;
      explanation =
        answer < 0
          ? `${b} is bigger than ${a}, so the result is negative: ${a} - ${b} = -(${b} - ${a}) = ${answer}`
          : `${a} - ${b} = ${answer}`;
      break;
    }
    case "multiplication": {
      sym = "×";
      if (difficulty === "easy") {
        a = rng.int(1, 10);
        b = rng.int(1, 10);
      } else if (difficulty === "medium") {
        a = rng.int(11, 99);
        b = rng.int(2, 12);
      } else if (difficulty === "hard") {
        a = rng.int(100, 999);
        b = rng.int(11, 99);
      } else {
        throw new Error(`Unknown difficulty: ${difficulty}`);
      }
      answer = a * b;
      if (b >= 10) {
        const tens = b - (b % 10);
        const ones = b % 10;
        explanation =
          ones === 0
            ? `${a} × ${b} = ${answer}`
            : `${a} × ${b} = ${a} × ${tens} + ${a} × ${ones} = ${a * tens} + ${a * ones} = ${answer}`;
      } else {
        explanation = `${a} × ${b} = ${answer}`;
      }
      break;
    }
    case "division": {
      sym = "÷";
      if (difficulty === "easy" || difficulty === "medium") {
        b = difficulty === "easy" ? rng.int(1, 10) : rng.int(2, 25);
        const q = difficulty === "easy" ? rng.int(1, 10) : rng.int(2, 50);
        a = b * q;
        answer = q;
        explanation = `${a} ÷ ${b} = ${answer}, because ${answer} × ${b} = ${a}`;
      } else if (difficulty === "hard") {
        a = rng.int(100, 9999);
        b = rng.int(3, 99);
        answer = round2(a / b);
        tolerance = 0.005;
        rounded = true;
        explanation = `${a} ÷ ${b} ≈ ${(a / b).toFixed(4)}, which rounds to ${answer.toFixed(2)}`;
      } else {
        throw new Error(`Unknown difficulty: ${difficulty}`);
      }
      break;
    }
    default:
      throw new Error(`Unknown subtopic: ${subtopic}`);
  }

  const expr = `\`${a} ${sym} ${b}\``;
  const prompt = rounded
    ? `What is ${expr}? Round to 2 decimal places.`
    : `What is ${expr}?`;

  return {
    prompt,
    answer,
    answerType: "number",
    choices: undefined,
    tolerance,
    explanation,
    params: { a, b, op: sym, rounded },
  };
}

// Recover operands from params, or from the prompt if params were stripped.
function operandsOf(question) {
  if (question && question.params) return question.params;
  const m = /`(\d+) ([+\-×÷]) (\d+)`/.exec((question && question.prompt) || "");
  if (!m) return null;
  return {
    a: Number(m[1]),
    b: Number(m[3]),
    op: m[2],
    rounded: /decimal/.test(question.prompt),
  };
}

// Independent check: each operation is verified with its inverse.
export function verify(question, answer) {
  const p = operandsOf(question);
  const x = Number(answer);
  if (!p || answer === "" || answer === null || !Number.isFinite(x)) return false;
  const { a, b, op, rounded } = p;
  switch (op) {
    case "+":
      return Number.isInteger(x) && x - b === a;
    case "-":
      return Number.isInteger(x) && x + b === a;
    case "×":
      return b !== 0 && Number.isInteger(x) && x % b === 0 && x / b === a;
    case "÷":
      if (b === 0) return false;
      if (rounded) return Math.abs(x * b - a) <= 0.005 * Math.abs(b) + 1e-6;
      return Number.isInteger(x) && x * b === a;
    default:
      return false;
  }
}
