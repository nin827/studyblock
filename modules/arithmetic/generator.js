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
        // Never land exactly on a rounding half-step (x.xx5): redraw with the same rng.
        while ((200 * a) % b === 0 && ((1000 * a) / b) % 10 === 5) {
          a = rng.int(100, 9999);
          b = rng.int(3, 99);
        }
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
    hints: arithmeticHints(subtopic, difficulty, a, b),
  };
}

// ---- Guided-mode hints: the written/mental method with this question's digits, never the result ----

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"];
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const digitsOf = (n) => String(n).split("").reverse().map(Number); // ones first

// Column addition: lining up, the first column(s) with carries, then "finish" without the total.
function columnAddHints(a, b) {
  const da = digitsOf(a);
  const db = digitsOf(b);
  const n = Math.max(da.length, db.length);
  const hints = [`Write \`${Math.max(a, b)}\` above \`${Math.min(a, b)}\`, lining up the ones digits on the right. Then add one column at a time, starting from the ones.`];
  let carry = 0;
  for (let i = 0; i < n - 1 && i < 2; i++) {
    const x = da[i] ?? 0;
    const y = db[i] ?? 0;
    const s = x + y + carry;
    const sumText = `${x} + ${y}${carry ? " + 1 carried" : ""} = ${s}`;
    hints.push(
      s >= 10
        ? `**${cap(PLACES[i])} column:** ${sumText}, so write ${s % 10} and carry 1 into the ${PLACES[i + 1]} column.`
        : `**${cap(PLACES[i])} column:** ${sumText}, so write ${s}.`
    );
    carry = s >= 10 ? 1 : 0;
  }
  if (n - 1 > 2) {
    hints.push(`Keep going left the same way through the ${PLACES.slice(2, n).join(", ")} columns, adding the carry whenever there is one.`);
  } else {
    const i = n - 1;
    hints.push(`Finish with the **${PLACES[i]} column:** ${da[i] ?? 0} + ${db[i] ?? 0}${carry ? " + 1 carried" : ""}. Write the whole of that column's total.`);
  }
  return hints;
}

// Counting up for a small difference (top - bottom < 10).
function countUpHints(top, bottom) {
  if (top < 10) return [`Count up from ${bottom} to ${top} on your fingers or a number line, counting the steps.`];
  if (Math.floor(top / 10) === Math.floor(bottom / 10)) {
    return [`${top} and ${bottom} have the same tens, so only the ones matter: count up from ${bottom} to ${top}, counting the steps.`];
  }
  const ten = Math.ceil(bottom / 10) * 10;
  if (ten === top) return [`Count up from ${bottom} to the round number ${top}, one step at a time.`];
  return [
    `Count up from ${bottom} to the next ten, ${ten}: that is a jump of ${ten - bottom}.`,
    `Then from ${ten} up to ${top} is a jump of ${top - ten}. Add the two jumps together.`,
  ];
}

// Column subtraction of bottom from top (top >= bottom), stopping before the answer's leading digit.
function columnSubHints(top, bottom, maxCols = 2) {
  const diff = top - bottom;
  if (diff < 10) return countUpHints(top, bottom);
  const dt = digitsOf(top);
  const dbm = digitsOf(bottom);
  const lead = String(diff).length - 1; // column of the answer's first digit: never worked out here
  const hints = [`Write \`${top}\` above \`${bottom}\`, lining up the ones digits. Subtract one column at a time, starting from the ones.`];
  let borrow = 0;
  for (let i = 0; i < lead && i < maxCols; i++) {
    const t = dt[i];
    const d = dbm[i] ?? 0;
    const v = t - borrow;
    const topText = borrow ? `${t} - 1 (lent to the ${PLACES[i - 1]})` : `${t}`;
    if (v >= d) {
      hints.push(`**${cap(PLACES[i])} column:** ${topText} - ${d} = ${v - d}.`);
      borrow = 0;
    } else {
      hints.push(`**${cap(PLACES[i])} column:** ${topText} is less than ${d}, so borrow 1 from the ${PLACES[i + 1]} column: ${v + 10} - ${d} = ${v + 10 - d}.`);
      borrow = 1;
    }
  }
  hints.push(`Carry on leftwards the same way${borrow ? `, remembering that the ${PLACES[Math.min(lead, maxCols)]} digit has lent 1` : ""}, until every column is done.`);
  return hints;
}

function arithmeticHints(subtopic, difficulty, a, b) {
  if (subtopic === "addition") {
    if (difficulty !== "easy") return columnAddHints(a, b);
    const big = Math.max(a, b);
    const small = Math.min(a, b);
    const hints = [`Start from the bigger number, ${big}, and add ${small} on to it.`];
    if (big < 10 && big + small > 10) {
      hints.push(`Make a ten first: \`${big} + ${10 - big} = 10\`. You still have ${small - (10 - big)} left to add on to 10.`);
    } else if (big < 10) {
      hints.push(`Count on ${small} step${small === 1 ? "" : "s"} from ${big}.`);
    } else {
      const sTens = small - (small % 10);
      hints.push(
        sTens
          ? `Split both into tens and ones: ${big} = ${big - (big % 10)} + ${big % 10} and ${small} = ${sTens} + ${small % 10}. Add the tens, then add the ones.`
          : `Split ${big} into ${big - (big % 10)} + ${big % 10}. Add ${small} to the ones first: \`${big % 10} + ${small}\`, then add the ${big - (big % 10)} back on.`
      );
    }
    return hints;
  }

  if (subtopic === "subtraction") {
    if (a < b) {
      return [`${b} is bigger than ${a}, so the answer is negative. Work out \`${b} - ${a}\` instead, then put a minus sign in front.`, ...columnSubHints(b, a, 1)];
    }
    if (difficulty !== "easy") return columnSubHints(a, b);
    const hints = [`Think of it as a missing number: \`${b} + ? = ${a}\`.`];
    if (a - b < 10) return [...hints, ...countUpHints(a, b)];
    if (a % 10 >= b % 10 && b < 10) hints.push(`Only the ones digit changes: work out \`${a % 10} - ${b}\` and keep the ten.`);
    else if (b < 10) hints.push(`From ${b} up to 10 is a jump of ${10 - b}, and from 10 up to ${a} is a jump of ${a - 10}. Add the two jumps.`);
    else hints.push(`Take away the tens first, then the ones.`);
    return hints;
  }

  if (subtopic === "multiplication") {
    if (difficulty === "easy") {
      const m = Math.max(a, b);
      const n = Math.min(a, b);
      if (n === 1) return ["Multiplying by 1 leaves a number unchanged."];
      if (m === 10) return [`Multiplying by 10 shifts the digits one place left: put a 0 on the end of ${n}.`];
      if (n === 2) return [`Multiplying by 2 is doubling: \`${m} + ${m}\`.`];
      if (n === 5) return [`× 5 is half of × 10.`, `\`${m} × 10 = ${m * 10}\`. Now halve it.`];
      return [`Think of \`${a} × ${b}\` as ${n} groups of ${m}.`, `Start from a fact you know: \`${m} × ${n - 1} = ${m * (n - 1)}\`.`, `Add one more ${m}.`];
    }
    if (difficulty === "medium") {
      const T = a - (a % 10);
      const O = a % 10;
      if (O === 0) return [`${a} is ${T / 10} tens, so work out \`${T / 10} × ${b}\` first.`, `Then multiply that by 10: put a 0 on the end.`];
      return [
        `Split ${a} into tens and ones, \`${T} + ${O}\`, and multiply each part by ${b}.`,
        `Tens part: \`${T} × ${b} = ${T * b}\`.`,
        `Ones part: \`${O} × ${b} = ${O * b}\`. Now add the two parts.`,
      ];
    }
    const tens = b - (b % 10);
    const ones = b % 10;
    if (ones === 0) {
      const k = tens / 10;
      const H = a - (a % 100);
      const T = (a % 100) - (a % 10);
      const O = a % 10;
      return [
        `${b} is ${k} × 10, so work out \`${a} × ${k}\`, then put a 0 on the end.`,
        `Split ${a} into \`${H} + ${T} + ${O}\`: \`${H} × ${k} = ${H * k}\`, \`${T} × ${k} = ${T * k}\`, \`${O} × ${k} = ${O * k}\`.`,
        `Add those three parts, then put a 0 on the end.`,
      ];
    }
    return [
      `Long multiplication: split ${b} into \`${tens} + ${ones}\`, multiply ${a} by each part, then add.`,
      `Ones part: \`${a} × ${ones} = ${a * ones}\`.`,
      `Tens part: \`${a} × ${tens} = ${a} × ${tens / 10} × 10 = ${a * tens}\`.`,
      `Now add the two partial products, lining up the place values.`,
    ];
  }

  if (subtopic === "division") {
    if (difficulty === "easy" || difficulty === "medium") {
      const q = a / b;
      if (b === 1) return ["Dividing by 1 leaves a number unchanged."];
      const hints = [`Turn it round into a times-table question: what times ${b} makes ${a}? \`? × ${b} = ${a}\`.`];
      if (difficulty === "easy") {
        if (q > 5 && 5 * b !== q) hints.push(`\`${b} × 5 = ${5 * b}\`, which is still less than ${a}. Count on in ${b}s from there, counting the steps.`);
        else hints.push(`Count up in ${b}s until you reach ${a}, counting the steps.`);
        return hints;
      }
      const K = 10 * Math.floor((q - 1) / 10);
      if (K >= 10 && b * K !== q && b * (q - K) !== q) {
        hints.push(`\`${b} × ${K} = ${b * K}\`, which leaves \`${a} - ${b * K} = ${a - b * K}\` still to share out.`);
        hints.push(`How many ${b}s make ${a - b * K}? Add that to ${K}.`);
      } else {
        hints.push(`Use your ${b} times table to get close to ${a}, then count on in ${b}s.`);
      }
      return hints;
    }
    const W = Math.floor(a / b);
    const R = a - W * b;
    const hints = [`Use long (or short) division: how many times does ${b} go into ${a}?`];
    if (R === 0) {
      hints.push(`${b} goes into ${a} exactly, with no remainder, so there are no decimals to round.`);
      return hints;
    }
    const d1 = Math.floor((10 * R) / b);
    const R1 = 10 * R - d1 * b;
    hints.push(`\`${b} × ${W} = ${W * b}\`, which leaves a remainder of ${R}. So the whole-number part is ${W}.`);
    hints.push(`Put a decimal point and bring down a 0: \`${10 * R} ÷ ${b} = ${d1}\` remainder ${R1}, so the first decimal digit is ${d1}.`);
    hints.push(`Bring down another 0 for the second decimal digit, and one more to decide whether to round up.`);
    return hints;
  }
  return undefined;
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
      if (rounded) {
        // In hundredths, with integers: |X·b − 100a| < b/2 strictly, so an exact half-step tie fails.
        const X = Math.round(x * 100);
        return Math.abs(x * 100 - X) < 1e-6 && 2 * Math.abs(X * b - 100 * a) < Math.abs(b);
      }
      return Number.isInteger(x) && x * b === a;
    default:
      return false;
  }
}
