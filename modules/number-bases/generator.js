// Number bases generator. Uses only the seeded rng passed in by the engine.

const BIN_FMT = "Answer in binary without leading zeros, e.g. 1011.";
const HEX_FMT = "Answer in hex without 0x and without leading zeros, e.g. 2F.";
const BYTE_FMT = "Answer with exactly 8 bits, keeping any leading zeros, e.g. 00010110.";

const toBin = (v) => v.toString(2);
const toHex = (v) => v.toString(16).toUpperCase();
const toByte = (v) => (v & 0xff).toString(2).padStart(8, "0");

// Value ranges per difficulty (all ≥ 1 so "0" never comes up).
const BIN_RANGE = { easy: [2, 15], medium: [16, 255], hard: [256, 4095] }; // ≤ 4 / 8 / 12 bits
const HEX_RANGE = { easy: [10, 255], medium: [256, 4095], hard: [4096, 65535] }; // 1-2 / 3 / 4 hex digits
const ADD_RANGE = { easy: [1, 15], medium: [16, 255] };

function range(table, difficulty) {
  const r = table[difficulty];
  if (!r) throw new Error(`Unknown difficulty: ${difficulty}`);
  return r;
}

const FMT = {
  dec: (v) => String(v),
  bin: toBin,
  hex: toHex,
  byte: toByte,
};

// 4 unique choices: correct value + 3 distractor values from common mistakes,
// topped up with nearby values. Deduped by value (so formats can't collide).
function buildChoices(correct, candidates, fmt, rng, valid = (v) => v >= 1) {
  const seen = new Set([correct]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isInteger(v) || !valid(v) || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 1000; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  const answer = fmt(correct);
  return { answer, choices: rng.shuffle([answer, ...out.map(fmt)]) };
}

const reverseValue = (s, base) => parseInt(s.split("").reverse().join(""), base);

// ---- explanations ----

function explainToDec(digits, base) {
  const n = digits.length;
  const terms = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = parseInt(digits[i], base);
    const place = base ** (n - 1 - i);
    total += d * place;
    if (base === 2) {
      if (d) terms.push(String(place));
    } else {
      terms.push(`${d}·${place}`);
    }
  }
  const lines = [];
  if (base === 2) {
    const places = [];
    for (let i = 0; i < n; i++) places.push(2 ** (n - 1 - i));
    lines.push(`Place values from left to right: ${places.join(", ")}.`);
    lines.push(`Add the place values where the bit is 1: ${terms.join(" + ")} = **${total}**.`);
  } else {
    const letters = digits.split("").filter((c) => /[A-F]/.test(c));
    if (letters.length) {
      const uniq = [...new Set(letters)];
      lines.push(`Hex letters: ${uniq.map((c) => `${c} = ${parseInt(c, 16)}`).join(", ")}.`);
    }
    const places = [];
    for (let i = 0; i < n; i++) places.push(16 ** (n - 1 - i));
    lines.push(`Place values from left to right: ${places.join(", ")}.`);
    lines.push(`Multiply and add: ${terms.join(" + ")} = **${total}**.`);
  }
  return lines;
}

function explainFromDec(v, base) {
  const lines = [`Divide by ${base} repeatedly and note the remainders:`];
  const rows = [];
  let x = v;
  while (x > 0) {
    const q = Math.floor(x / base);
    const r = x % base;
    rows.push(`- ${x} ÷ ${base} = ${q} remainder ${r}${base === 16 && r >= 10 ? ` (${toHex(r)})` : ""}`);
    x = q;
  }
  lines.push(rows.join("\n"));
  const ans = base === 2 ? toBin(v) : toHex(v);
  lines.push(`Read the remainders from bottom to top: **${ans}**.`);
  return lines;
}

function nibbleTable(hex) {
  return hex
    .split("")
    .map((c) => `${c} → ${parseInt(c, 16).toString(2).padStart(4, "0")}`)
    .join(", ");
}

// ---- binary ----

// Easy binary also asks counting, doubling, mixed-base sums and bit counts (ticket 014: the 2-15
// conversions alone gave only ~42 distinct prompts). The extra draw comes after every conversion draw,
// so seeds that stay conversions give exactly the question they always did.
function genBinary(difficulty, rng) {
  const q = genBinaryConvert(difficulty, rng);
  if (difficulty !== "easy" || rng.next() >= 0.5) return q;
  const p = q.params;
  const v = p.from === "bin" ? parseDigits(p.input, 2) : Number(p.input);
  const bin = toBin(v);
  const kind = rng.pick(["step", "double", "mixsum", "bits"]);
  if (kind === "step") {
    const delta = rng.next() < 0.5 ? 1 : -1;
    return {
      prompt: `Counting in binary, which number comes straight ${delta > 0 ? "after" : "before"} \`${bin}\`? ${BIN_FMT}`,
      answer: toBin(v + delta), answerType: "text", choices: undefined,
      explanation: `\`${bin}\` = ${v}, and ${v} ${delta > 0 ? "+" : "−"} 1 = ${v + delta}.\n\n${explainFromDec(v + delta, 2).join("\n\n")}`,
      params: { kind: "step", input: bin, delta },
    };
  }
  if (kind === "double") {
    return {
      prompt: `What is double the binary number \`${bin}\`? ${BIN_FMT}`,
      answer: toBin(2 * v), answerType: "text", choices: undefined,
      explanation: `Doubling moves every bit one place to the left, so a 0 goes on the end: \`${bin}\` → **${toBin(2 * v)}**. Check: ${v} × 2 = ${2 * v}.`,
      params: { kind: "double", input: bin },
    };
  }
  if (kind === "mixsum") {
    const w = rng.int(2, 15);
    return {
      prompt: `What is the binary number \`${bin}\` plus the decimal number ${w}? Answer in decimal.`,
      answer: v + w, answerType: "number", tolerance: 0, choices: undefined,
      explanation: `${explainToDec(bin, 2).join("\n\n")}\n\nThen ${v} + ${w} = **${v + w}**.`,
      params: { kind: "mixsum", a: bin, b: w },
    };
  }
  return {
    prompt: `How many bits (binary digits) does the number ${v} need, written in binary without leading zeros?`,
    answer: bin.length, answerType: "number", tolerance: 0, choices: undefined,
    explanation: `${v} in binary is \`${bin}\`, which has **${bin.length}** bits. (${2 ** (bin.length - 1)} ≤ ${v} < ${2 ** bin.length}.)`,
    params: { kind: "bits", input: String(v) },
  };
}

function genBinaryConvert(difficulty, rng) {
  const [lo, hi] = range(BIN_RANGE, difficulty);
  const v = rng.int(lo, hi);
  const bin = toBin(v);
  const bits = bin.length;
  const flip = 1 << rng.int(0, bits - 1);
  const toDec = rng.next() < 0.5;
  const asChoice = rng.next() < 0.35;

  if (toDec) {
    const base = {
      prompt: `Convert the binary number \`${bin}\` to decimal.`,
      explanation: explainToDec(bin, 2).join("\n\n"),
      params: { kind: "convert", from: "bin", to: "dec", input: bin },
    };
    if (asChoice) {
      const { answer, choices } = buildChoices(
        v,
        [reverseValue(bin, 2), v ^ flip, v + 1, v - 1, Number(bin) <= 99999 ? Number(bin) : -1],
        FMT.dec,
        rng
      );
      return { ...base, answer, answerType: "choice", choices };
    }
    return { ...base, answer: v, answerType: "number", tolerance: 0, choices: undefined };
  }

  const base = {
    explanation: explainFromDec(v, 2).join("\n\n"),
    params: { kind: "convert", from: "dec", to: "bin", input: String(v) },
  };
  if (asChoice) {
    const { answer, choices } = buildChoices(
      v,
      [reverseValue(bin, 2), v ^ flip, v + 1, v - 1, v * 2, v >> 1],
      FMT.bin,
      rng
    );
    return { ...base, prompt: `Which binary number equals ${v}?`, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: `Convert ${v} to binary. ${BIN_FMT}`, answer: bin, answerType: "text", choices: undefined };
}

// ---- hexadecimal ----

function genHex(difficulty, rng) {
  const [lo, hi] = range(HEX_RANGE, difficulty);
  const v = rng.int(lo, hi);
  const hex = toHex(v);
  const bin = toBin(v);
  const kind = rng.pick(["hex-dec", "dec-hex", "hex-bin", "bin-hex"]);
  const asChoice = rng.next() < 0.35;
  const nib = 1 << (4 * rng.int(0, hex.length - 1)); // one hex place

  if (kind === "hex-dec") {
    const base = {
      prompt: `Convert the hexadecimal number \`${hex}\` to decimal.`,
      explanation: explainToDec(hex, 16).join("\n\n"),
      params: { kind: "convert", from: "hex", to: "dec", input: hex },
    };
    if (asChoice) {
      const { answer, choices } = buildChoices(
        v,
        [reverseValue(hex, 16), v + nib, v - nib, /^\d+$/.test(hex) ? Number(hex) : -1, v + 1, v - 1],
        FMT.dec,
        rng
      );
      return { ...base, answer, answerType: "choice", choices };
    }
    return { ...base, answer: v, answerType: "number", tolerance: 0, choices: undefined };
  }

  if (kind === "dec-hex") {
    const base = {
      explanation: explainFromDec(v, 16).join("\n\n"),
      params: { kind: "convert", from: "dec", to: "hex", input: String(v) },
    };
    if (asChoice) {
      const { answer, choices } = buildChoices(
        v,
        [reverseValue(hex, 16), v + nib, v - nib, v + 1, v - 1],
        FMT.hex,
        rng
      );
      return { ...base, prompt: `Which hexadecimal number equals ${v}?`, answer, answerType: "choice", choices };
    }
    return { ...base, prompt: `Convert ${v} to hexadecimal. ${HEX_FMT}`, answer: hex, answerType: "text", choices: undefined };
  }

  if (kind === "hex-bin") {
    const lines = [
      `Each hex digit becomes exactly 4 bits: ${nibbleTable(hex)}.`,
      `Join them: \`${hex.split("").map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join(" ")}\`.`,
      `Drop any leading zeros: **${bin}**.`,
    ];
    const base = {
      explanation: lines.join("\n\n"),
      params: { kind: "convert", from: "hex", to: "bin", input: hex },
    };
    if (asChoice) {
      const { answer, choices } = buildChoices(
        v,
        [reverseValue(hex, 16), v ^ (1 << rng.int(0, bin.length - 1)), v + nib, v - nib, v + 1],
        FMT.bin,
        rng
      );
      return { ...base, prompt: `Which binary number equals hexadecimal \`${hex}\`?`, answer, answerType: "choice", choices };
    }
    return {
      ...base,
      prompt: `Convert the hexadecimal number \`${hex}\` to binary. ${BIN_FMT}`,
      answer: bin,
      answerType: "text",
      choices: undefined,
    };
  }

  // bin-hex
  const padded = bin.padStart(Math.ceil(bin.length / 4) * 4, "0");
  const groups = padded.match(/.{4}/g);
  const lines = [
    `Split the bits into groups of 4 from the right, padding the left with zeros: \`${groups.join(" ")}\`.`,
    `Convert each group: ${groups.map((g) => `${g} → ${toHex(parseInt(g, 2))}`).join(", ")}.`,
    `So the answer is **${hex}**.`,
  ];
  const base = {
    explanation: lines.join("\n\n"),
    params: { kind: "convert", from: "bin", to: "hex", input: bin },
  };
  if (asChoice) {
    const { answer, choices } = buildChoices(
      v,
      [reverseValue(hex, 16), v + nib, v - nib, v + 1, v - 1],
      FMT.hex,
      rng
    );
    return { ...base, prompt: `Which hexadecimal number equals binary \`${bin}\`?`, answer, answerType: "choice", choices };
  }
  return {
    ...base,
    prompt: `Convert the binary number \`${bin}\` to hexadecimal. ${HEX_FMT}`,
    answer: hex,
    answerType: "text",
    choices: undefined,
  };
}

// ---- binary arithmetic ----

function explainAdd(a, b) {
  const A = toBin(a);
  const B = toBin(b);
  const n = Math.max(A.length, B.length);
  const pa = A.padStart(n, "0");
  const pb = B.padStart(n, "0");
  const rows = [];
  let carry = 0;
  for (let i = n - 1; i >= 0; i--) {
    const x = Number(pa[i]);
    const y = Number(pb[i]);
    const s = x + y + carry;
    rows.push(`- ${x} + ${y}${carry ? " + carry 1" : ""} = ${s} → write ${s % 2}${s >= 2 ? ", carry 1" : ""}`);
    carry = s >= 2 ? 1 : 0;
  }
  const lines = [
    `Line the numbers up on the right:\n\n\`\`\`\n  ${pa}\n+ ${pb}\n\`\`\``,
    `Add column by column from the right (1 + 1 = 10 in binary, so write 0 and carry 1):\n\n${rows.join("\n")}`,
  ];
  if (carry) lines.push("The last carry becomes a new leftmost 1.");
  lines.push(`Result: **${toBin(a + b)}**. Check in decimal: ${a} + ${b} = ${a + b}.`);
  return lines.join("\n\n");
}

function genAdd(difficulty, rng) {
  const [lo, hi] = range(ADD_RANGE, difficulty);
  const a = rng.int(lo, hi);
  const b = rng.int(lo, hi);
  const s = a + b;
  const A = toBin(a);
  const B = toBin(b);
  const width = Math.max(A.length, B.length);
  const base = {
    explanation: explainAdd(a, b),
    params: { kind: "add", a: A, b: B },
  };
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(
      s,
      [
        a ^ b, // forgot every carry
        s & ((1 << width) - 1), // dropped the final carry
        a | b,
        s + 1,
        s - 1,
      ],
      FMT.bin,
      rng
    );
    return { ...base, prompt: `What is \`${A} + ${B}\` in binary?`, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: `Add the binary numbers \`${A} + ${B}\`. ${BIN_FMT}`, answer: toBin(s), answerType: "text", choices: undefined };
}

function genTwosComplement(rng) {
  // Magnitude 1..127 so the pattern is never 00000000 or 10000000 (both negate to themselves).
  const m = rng.int(1, 127);
  const asChoice = rng.next() < 0.35;

  if (rng.next() < 0.5) {
    // Negate a bit pattern: given +m or -m, find the other one.
    const startNeg = rng.next() < 0.5;
    const x = startNeg ? (256 - m) & 0xff : m;
    const y = (256 - x) & 0xff;
    const X = toByte(x);
    const inv = toByte(~x);
    const lines = [
      `Invert every bit: \`${X}\` → \`${inv}\`.`,
      `Add 1: \`${inv}\` + 1 = \`${toByte(y)}\`.`,
      `Check: as signed 8-bit values this is ${startNeg ? -m : m} → **${startNeg ? m : -m}**, and \`${X}\` + \`${toByte(y)}\` = 1 0000 0000, which wraps to 0 in 8 bits.`,
    ];
    const base = {
      explanation: lines.join("\n\n"),
      params: { kind: "negate8", input: X },
    };
    if (asChoice) {
      const { answer, choices } = buildChoices(
        y,
        [
          (~x) & 0xff, // inverted but forgot to add 1
          x, // unchanged
          (y + 1) & 0xff,
          (y - 1) & 0xff,
          (x ^ 0x80) & 0xff, // only flipped the sign bit
        ],
        FMT.byte,
        rng,
        (v) => v >= 0 && v <= 255
      );
      return {
        ...base,
        prompt: `Which 8-bit pattern is the two's complement (the negation) of \`${X}\`?`,
        answer,
        answerType: "choice",
        choices,
      };
    }
    return {
      ...base,
      prompt: `Find the 8-bit two's complement (the negation) of \`${X}\`. ${BYTE_FMT}`,
      answer: toByte(y),
      answerType: "text",
      choices: undefined,
    };
  }

  // Read a negative 8-bit two's complement pattern as a signed decimal.
  const x = 256 - m; // top bit set
  const X = toByte(x);
  const value = -m;
  const rest = x - 128;
  const lines = [
    `The leftmost bit is 1, so the number is negative. In 8-bit two's complement the leftmost bit is worth −128.`,
    `The other 7 bits \`${X.slice(1)}\` are worth ${rest}.`,
    `So the value is −128 + ${rest} = **${value}**.`,
    `Another way: invert and add 1 to get \`${toByte(m)}\` = ${m}, then make it negative.`,
  ];
  const base = {
    prompt: `The 8-bit two's complement pattern \`${X}\` stands for which decimal number?`,
    explanation: lines.join("\n\n"),
    params: { kind: "signed8", input: X },
  };
  if (asChoice) {
    const { answer, choices } = buildChoices(
      value,
      [
        x, // read as unsigned
        m, // forgot the sign
        -(m - 1), // forgot to add 1 (one's complement reading)
        value - 1,
        value + 1,
      ],
      FMT.dec,
      rng,
      (v) => v !== 0 && v >= -128 && v <= 255
    );
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, prompt: `${base.prompt} Include the minus sign.`, answer: value, answerType: "number", tolerance: 0, choices: undefined };
}

function genArithmetic(difficulty, rng) {
  if (difficulty === "easy" || difficulty === "medium") return genAdd(difficulty, rng);
  if (difficulty === "hard") return genTwosComplement(rng);
  throw new Error(`Unknown difficulty: ${difficulty}`);
}

function generateRaw(subtopic, difficulty, rng) {
  if (subtopic === "binary") return genBinary(difficulty, rng);
  if (subtopic === "hexadecimal") return genHex(difficulty, rng);
  if (subtopic === "binary-arithmetic") return genArithmetic(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  return withHints(generateRaw(subtopic, difficulty, rng));
}

// ---- guided-mode hints ----
// Built from params after the question is made, so they never touch the rng. They describe the
// method with this question's digits and always stop before the whole answer appears (only the
// first division / first group / first column is worked as an example).

const placeList = (n, base) => Array.from({ length: n }, (_, i) => base ** (n - 1 - i)).join(", ");

function divisionRows(v, base, count) {
  const rows = [];
  let x = v;
  while (x > 0 && rows.length < count) {
    const q = Math.floor(x / base);
    rows.push(`${x} ÷ ${base} = ${q} remainder ${x % base}`);
    x = q;
  }
  return rows;
}

function divisionCount(v, base) {
  let c = 0;
  for (let x = v; x > 0; x = Math.floor(x / base)) c++;
  return c;
}

function hintsToDec(digits, base) {
  const n = digits.length;
  if (base === 2) {
    const ones = [];
    for (let i = 0; i < n; i++) if (digits[i] === "1") ones.push(2 ** (n - 1 - i));
    // A single 1 bit means the answer is one place value, so don't list them.
    if (ones.length === 1) {
      return [
        `Each bit has a place value, doubling from the right: 1, 2, 4, 8, … \`${digits}\` has ${n} bits.`,
        "Only one bit is 1, so the value is just the place value of that bit.",
        `Start at 1 for the rightmost bit and double once for each step to the left: the 1 is ${n - 1} step${n === 2 ? "" : "s"} from the right.`,
      ];
    }
    return [
      `Each bit has a place value, doubling from the right: 1, 2, 4, 8, … \`${digits}\` has ${n} bits.`,
      `Write the place values under the bits, left to right: ${placeList(n, 2)}.`,
      `Add up only the place values that sit under a 1: ${ones.join(" + ")}.`,
    ];
  }
  if (n === 1) {
    return [
      "A single hex digit is just its own value. The letters carry on counting after 9: the first letter is the number straight after 9, and each later letter is one more.",
    ];
  }
  const letters = [...new Set(digits.split("").filter((c) => /[A-F]/.test(c)))];
  const terms = digits.split("").map((c, i) => `${parseInt(c, 16)} × ${16 ** (n - 1 - i)}`);
  return [
    `Hex place values grow by ×16 from the right: 1, 16, 256, 4096, … ${letters.length ? `Turn the letters into numbers first: ${letters.map((c) => `${c} = ${parseInt(c, 16)}`).join(", ")}.` : "This number has no letters, but it is still base 16, not base 10."}`,
    `\`${digits}\` has ${n} digits, so the place values are ${placeList(n, 16)}.`,
    `Multiply each digit by its place value and add: ${terms.join(" + ")}.`,
  ];
}

function hintsFromDec(v, base) {
  const name = base === 2 ? "bit" : "hex digit";
  const count = divisionCount(v, base);
  const out = [
    base === 2
      ? `Divide ${v} by 2 again and again, writing down each remainder (0 or 1). Stop when you reach 0.`
      : `Divide ${v} by 16 again and again, writing down each remainder (0–15, with 10–15 written as A–F). Stop when you reach 0.`,
  ];
  // Show at most the first one or two divisions, and only while the quotient left over still needs
  // more divisions (otherwise the shown rows would spell out the whole answer).
  const show = count >= 5 ? 2 : count >= 3 ? 1 : 0;
  if (show) {
    out.push(`Start like this: ${divisionRows(v, base, show).join("; then ")}; …`);
  } else if (count === 2) {
    out.push(
      base === 2
        ? `${v} is 2 or 3, so it needs 2 bits: the 2s place and the 1s place.`
        : `${v} is between 16 and 255, so it needs 2 hex digits: the first is how many whole 16s fit into ${v}, the second is what is left over.`
    );
  } else {
    out.push(`${v} is smaller than 16, so the answer is a single hex digit. Numbers above 9 become letters, counting on from 9 with the first letter of the alphabet.`);
  }
  const top = base ** (count - 1);
  out.push(
    `Check: the biggest place value that fits into ${v} is ${top}, so the answer has ${count} ${name}${count === 1 ? "" : "s"}. ` +
      `Read the remainders from the last division back up to the first: the last remainder is the leftmost ${name}.`
  );
  return out;
}

function hintsHexToBin(hex) {
  const out = ["Each hex digit becomes exactly 4 bits, using the place values 8, 4, 2, 1. Convert the digits one at a time."];
  if (hex.length >= 2) {
    const c = hex[0];
    out.push(`For example, the first digit \`${c}\` is ${parseInt(c, 16)} = ${parseInt(c, 16).toString(2).padStart(4, "0")}. Do the same for the other ${hex.length - 1 === 1 ? "digit" : `${hex.length - 1} digits`}.`);
  } else {
    out.push("Letters stand for 10–15 (A = 10 … F = 15). Write that value with the place values 8, 4, 2, 1.");
  }
  out.push(hex.length === 1 ? "Write the 4 bits, then drop any zeros at the far left." : `Join the ${hex.length} groups of 4 bits in order, then drop any zeros at the far left.`);
  return out;
}

function hintsBinToHex(bin) {
  const padded = bin.padStart(Math.ceil(bin.length / 4) * 4, "0");
  const groups = padded.match(/.{4}/g);
  const out = [
    `Split the bits into groups of 4 from the right, padding the left with zeros: \`${groups.join(" ")}\`.`,
  ];
  if (groups.length >= 2) {
    out.push(
      `Convert each group with the place values 8, 4, 2, 1, writing 10–15 as A–F. For example, \`${groups[0]}\` = ${toHex(parseInt(groups[0], 2))}.`
    );
  } else {
    out.push("Convert the group with the place values 8, 4, 2, 1, then write 10–15 as a letter (A = 10 … F = 15).");
  }
  out.push("Write the hex digits in the same order as the groups. Leave out any leading 0.");
  return out;
}

function hintsAdd(A, B) {
  const n = Math.max(A.length, B.length);
  const pa = A.padStart(n, "0");
  const pb = B.padStart(n, "0");
  const cols = [];
  let carry = 0;
  for (let i = n - 1; i >= 0 && cols.length < (n >= 5 ? 2 : 1); i--) {
    const s = Number(pa[i]) + Number(pb[i]) + carry;
    cols.push(`${pa[i]} + ${pb[i]}${carry ? " + carry 1" : ""} = ${s.toString(2)}, so write ${s % 2}${s >= 2 ? " and carry 1" : ""}`);
    carry = s >= 2 ? 1 : 0;
  }
  return [
    `Line the numbers up on the right, padding with zeros: \`${pa}\` + \`${pb}\`.`,
    "Add column by column from the right: 0 + 0 = 0, 0 + 1 = 1, 1 + 1 = 10 (write 0, carry 1), and 1 + 1 + carry 1 = 11 (write 1, carry 1).",
    `${cols.length > 1 ? "The rightmost columns" : "The rightmost column"}: ${cols.join("; then ")}. Keep going to the left. A carry left over at the end becomes a new leftmost 1.`,
  ];
}

function hintsNegate(X) {
  const inv = toByte(~parseInt(X, 2));
  return [
    "To negate in two's complement: invert every bit (0 ↔ 1), then add 1. Keep all 8 bits.",
    `Inverting \`${X}\` gives \`${inv}\`. That is not the answer yet: you still have to add 1.`,
    "Add 1 starting from the rightmost bit: a 1 + 1 becomes 0 and carries to the next bit, a 0 + 1 becomes 1 and stops the carry.",
  ];
}

function hintsSigned(X) {
  const rest = X.slice(1);
  const ones = [];
  for (let i = 0; i < 7; i++) if (rest[i] === "1") ones.push(2 ** (6 - i));
  return [
    "The leftmost bit is 1, so the number is negative. In 8-bit two's complement that bit is worth −128 instead of +128.",
    `The other 7 bits \`${rest}\` have the place values 64, 32, 16, 8, 4, 2, 1. Add the ones under a 1: ${ones.join(" + ")}.`,
    "The value is −128 plus that total. Remember the minus sign.",
  ];
}

function hintsFor(p) {
  if (!p) return null;
  if (p.kind === "convert") {
    const { from, to, input } = p;
    if (to === "dec") return hintsToDec(input, from === "bin" ? 2 : 16);
    if (from === "dec") return hintsFromDec(Number(input), to === "bin" ? 2 : 16);
    if (from === "hex" && to === "bin") return hintsHexToBin(input);
    if (from === "bin" && to === "hex") return hintsBinToHex(input);
    return null;
  }
  if (p.kind === "step") return [
    `Turn \`${p.input}\` into decimal first: add the place values 1, 2, 4, 8 under each 1.`,
    `${p.delta > 0 ? "Add" : "Take away"} 1, then turn the result back into binary (divide by 2 again and again and read the remainders upwards).`,
  ];
  if (p.kind === "double") return [
    "Every place in binary is worth twice the place to its right.",
    `So doubling moves each bit of \`${p.input}\` one place to the left: write a 0 on the end, just as × 10 does in decimal.`,
  ];
  if (p.kind === "mixsum") return [
    `Only one number is in binary. Turn \`${p.a}\` into decimal: add the place values 1, 2, 4, 8 under each 1.`,
    `Then add ${p.b} to it in decimal.`,
  ];
  if (p.kind === "bits") return [
    "The place values in binary are 1, 2, 4, 8, 16, …. Find the biggest place value that fits into the number.",
    `That place is the leftmost bit. Count the places from it down to the 1s place, including both.`,
  ];
  if (p.kind === "add") return hintsAdd(p.a, p.b);
  if (p.kind === "negate8") return hintsNegate(p.input);
  if (p.kind === "signed8") return hintsSigned(p.input);
  return null;
}

function withHints(q) {
  const hints = hintsFor(q.params);
  return hints && hints.length ? { ...q, hints } : q;
}

// ---- independent check ----

const DIGITS = "0123456789abcdef";

// Parse a digit string by hand (no parseInt). Returns NaN if any digit is invalid for the base.
function parseDigits(str, base) {
  const s = String(str).trim().toLowerCase();
  if (!s) return NaN;
  let v = 0;
  for (const c of s) {
    const d = DIGITS.indexOf(c);
    if (d < 0 || d >= base) return NaN;
    v = v * base + d;
  }
  return v;
}

const noLeadingZero = (s) => s === "0" || s[0] !== "0";

// Parse a user's answer in the format the prompt asks for; NaN if the format is wrong.
function parseAnswer(raw, to) {
  const s = String(raw ?? "").trim();
  if (to === "dec") {
    if (!/^-?\d+$/.test(s)) return NaN;
    return Number(s);
  }
  if (to === "bin") {
    if (!/^[01]+$/.test(s) || !noLeadingZero(s)) return NaN;
    return parseDigits(s, 2);
  }
  if (to === "hex") {
    if (!/^[0-9a-f]+$/i.test(s) || !noLeadingZero(s)) return NaN;
    return parseDigits(s, 16);
  }
  if (to === "byte") {
    if (!/^[01]{8}$/.test(s)) return NaN;
    return parseDigits(s, 2);
  }
  return NaN;
}

const BASE_OF = { bin: 2, dec: 10, hex: 16 };

// Returns { to, ok(value) } describing what a correct answer must satisfy.
function expectation(p) {
  if (p.kind === "convert") {
    const target = parseDigits(p.input, BASE_OF[p.from]);
    if (!Number.isFinite(target)) return null;
    return { to: p.to, ok: (v) => v === target };
  }
  if (p.kind === "add") {
    const a = parseDigits(p.a, 2);
    const b = parseDigits(p.b, 2);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { to: "bin", ok: (v) => v === a + b };
  }
  if (p.kind === "step") {
    const x = parseDigits(p.input, 2);
    if (!Number.isFinite(x) || (p.delta !== 1 && p.delta !== -1)) return null;
    return { to: "bin", ok: (v) => v - p.delta === x }; // undo the step
  }
  if (p.kind === "double") {
    const x = parseDigits(p.input, 2);
    if (!Number.isFinite(x)) return null;
    return { to: "bin", ok: (v) => v % 2 === 0 && v / 2 === x }; // halve it back
  }
  if (p.kind === "mixsum") {
    const x = parseDigits(p.a, 2);
    if (!Number.isFinite(x) || !Number.isInteger(p.b)) return null;
    return { to: "dec", ok: (v) => v - p.b === x };
  }
  if (p.kind === "bits") {
    const x = Number(p.input);
    if (!Number.isInteger(x) || x < 1) return null;
    let n = 0;
    for (let y = x; y > 0; y = Math.floor(y / 2)) n++; // halvings until 0 = number of bits
    return { to: "dec", ok: (v) => v === n };
  }
  if (p.kind === "negate8") {
    if (!/^[01]{8}$/.test(p.input)) return null;
    const x = parseDigits(p.input, 2);
    // A pattern and its negation add up to a multiple of 2^8.
    return { to: "byte", ok: (v) => (x + v) % 256 === 0 };
  }
  if (p.kind === "signed8") {
    if (!/^[01]{8}$/.test(p.input)) return null;
    // Signed value = sum of bits with the top place weighted -128.
    let s = 0;
    for (let i = 0; i < 8; i++) if (p.input[i] === "1") s += i === 0 ? -128 : 2 ** (7 - i);
    return { to: "dec", ok: (v) => v === s };
  }
  return null;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, question, answer);
  const exp = expectation(p);
  if (!exp) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
    // Every choice must be in the right format, and exactly one may be correct.
    let correct = 0;
    for (const c of ch) {
      const v = parseAnswer(c, exp.to);
      if (!Number.isFinite(v)) return false;
      if (exp.ok(v)) correct++;
    }
    if (correct !== 1) return false;
  }

  const v = parseAnswer(answer, exp.to);
  return Number.isFinite(v) && exp.ok(v);
}

// =====================================================================================
// Expert. A separate branch: easy/medium/hard never reach this code, so their rng draws (and
// questions) are unchanged. Every expert question carries its own hints (no rng calls in them)
// and params with a kind starting "x-", checked by verifyExpert below.

const placeSum = (bits) => {
  const n = bits.length;
  const used = [];
  for (let i = 0; i < n; i++) if (bits[i] === "1") used.push(2 ** (n - 1 - i));
  return used;
};
const sumText = (bits) => {
  const used = placeSum(bits);
  return used.length ? `${used.join(" + ")} = ${used.reduce((a, b) => a + b, 0)}` : "0";
};

// ---- binary / expert ----

const BIT_OPS = { AND: (x, y) => x & y, OR: (x, y) => x | y, XOR: (x, y) => x ^ y };
const BIT_RULE = {
  AND: "AND gives 1 only where both bits are 1",
  OR: "OR gives 1 where at least one of the bits is 1",
  XOR: "XOR gives 1 where the two bits are different",
};
const BIT_USE = {
  AND: "A program uses AND with a mask to keep only some bits of a status register.",
  OR: "A program uses OR to switch some flag bits on in a settings byte.",
  XOR: "A program uses XOR to flip some bits of a pixel value.",
};

function xBitwise(rng) {
  const op = rng.pick(["AND", "OR", "XOR"]);
  let a, b, r;
  do {
    a = rng.int(1, 255);
    b = rng.int(1, 255);
    r = BIT_OPS[op](a, b);
  } while (r === 0 || a === b || r === a || r === b);
  const A = toByte(a);
  const B = toByte(b);
  const R = toByte(r);
  const lines = [
    `${BIT_RULE[op]}. Line the two bytes up and work out each of the 8 columns on its own:\n\n\`\`\`\n    ${A}\n${op.padEnd(4)}${B}\n  = ${R}\n\`\`\``,
    `Result: **${R}**.`,
    `In decimal, add the place values under each 1: ${sumText(R)}, so **${r}**.`,
  ];
  return {
    prompt: `${BIT_USE[op]} Work out \`${A} ${op} ${B}\` bit by bit (8 bits each).`,
    answerType: "multi",
    parts: [
      { id: "res", label: "Result", ask: `The 8-bit result. ${BYTE_FMT}`, answerType: "text", answer: R,
        hint: `Do one column at a time: ${BIT_RULE[op]}. Keep all 8 bits, including leading zeros.` },
      { id: "dec", label: "Decimal", ask: "The result as a decimal number.", answerType: "number", answer: r, tolerance: 0,
        hint: "Write the place values 128, 64, 32, 16, 8, 4, 2, 1 above your result and add the ones that sit over a 1." },
    ],
    explanation: lines.join("\n\n"),
    params: { kind: "x-bitwise", op, a: A, b: B },
    hints: [
      `${BIT_RULE[op]}. Each column is worked out separately: no carries.`,
      `Write \`${A}\` above \`${B}\` so the columns line up, then go left to right through all 8 columns.`,
      "For the decimal value, add the place values (128, 64, …, 1) of the columns where your result has a 1.",
    ],
  };
}

const fracBits = (num, k) => num.toString(2).padStart(k, "0").replace(/0+$/, "");
// value = whole + num / 2^k, written as a binary fraction.
const binFrac = (whole, num, k) => `${toBin(whole)}.${fracBits(num, k)}`;
const decFrac = (whole, num, k) => String(whole + num / 2 ** k);

function fracPart(rng) {
  const k = rng.int(2, 4);
  let num;
  do num = rng.int(1, 2 ** k - 1); while (num % 2 === 0); // last bit 1, so exactly k places
  return { whole: rng.int(1, 31), num, k };
}

function xFractions(rng) {
  const a = fracPart(rng);
  let b;
  do b = fracPart(rng); while (b.whole === a.whole && b.num === a.num && b.k === a.k);
  const A = binFrac(a.whole, a.num, a.k);
  const aDec = a.whole + a.num / 2 ** a.k;
  const bDec = decFrac(b.whole, b.num, b.k);
  const B = binFrac(b.whole, b.num, b.k);
  const like = B === "10.01" ? "`1.1`" : "`10.01`";
  const placesA = A.split(".")[1].split("").map((c, i) => (c === "1" ? `1/${2 ** (i + 1)}` : null)).filter(Boolean);
  // Doubling method for the fraction of b, as explanation lines.
  const dbl = [];
  let f = b.num / 2 ** b.k;
  while (f > 0 && dbl.length < 6) {
    const d = f * 2;
    const bit = d >= 1 ? 1 : 0;
    dbl.push(`- ${f} × 2 = ${d} → write ${bit}${bit && d > 1 ? `, keep ${d - 1}` : ""}`);
    f = d - bit;
  }
  return {
    prompt: `In a binary fraction the places after the point are worth 1/2, 1/4, 1/8, 1/16, … (0.5, 0.25, 0.125, 0.0625).\n\n(a) What is \`${A}\` in decimal?\n\n(b) Write ${bDec} in binary.`,
    answerType: "multi",
    parts: [
      { id: "todec", label: "(a) Decimal", ask: `\`${A}\` as an exact decimal (e.g. 2.75)`, answerType: "number", answer: aDec, tolerance: 0,
        hint: `The whole part is \`${toBin(a.whole)}\`. After the point, add the place values (1/2, 1/4, …) that sit under a 1.` },
      { id: "tobin", label: "(b) Binary", ask: `${bDec} in binary, like ${like}: no leading zeros and no zeros at the end after the point`, answerType: "text", answer: B,
        hint: `Convert ${b.whole} as usual. For the fraction, keep doubling it: each time the result reaches 1, write 1 and subtract 1, otherwise write 0. Stop when nothing is left.` },
    ],
    explanation: [
      `**(a)** Whole part \`${toBin(a.whole)}\` = ${a.whole}. After the point, the 1s are worth ${placesA.join(" + ")} = ${a.num}/${2 ** a.k} = ${a.num / 2 ** a.k}. So \`${A}\` = **${aDec}**.`,
      `**(b)** ${b.whole} = \`${toBin(b.whole)}\`. For ${b.num / 2 ** b.k}, keep doubling:\n\n${dbl.join("\n")}\n\nReading the bits down gives .${fracBits(b.num, b.k)}, so ${bDec} = **${B}**.`,
    ].join("\n\n"),
    params: { kind: "x-frac", a: A, b: bDec },
    hints: [
      "Place values keep halving to the right of the point: 1/2, 1/4, 1/8, 1/16.",
      "Treat the whole part and the fraction part separately, then put them together.",
      "To turn a decimal fraction into binary, double it again and again; the whole number you get each time (0 or 1) is the next bit.",
    ],
  };
}

function xCounter(rng) {
  const n = rng.int(4, 12);
  const size = 2 ** n;
  const w = rng.int(1, Math.min(size - 1, 200)); // steps until it wraps
  const start = size - w;
  let T, end;
  do {
    T = rng.next() < 0.3 ? rng.int(1, Math.max(1, w - 1)) : rng.int(w + 1, w + Math.min(size, 300));
    end = (start + T) % size;
  } while (end === 0 || T === w);
  const S = toBin(start).padStart(n, "0");
  const wraps = Math.floor((start + T) / size);
  return {
    prompt: `An **${n}-bit** counter holds whole numbers from 0 up to its largest ${n}-bit value. One more step after the largest value wraps it back to 0. It now holds \`${S}\` (all ${n} bits shown) and adds 1 every second.`,
    answerType: "multi",
    parts: [
      { id: "wrap", label: "Seconds to 0", ask: "After how many seconds does it next show 0?", answerType: "number", answer: w, tolerance: 0,
        hint: `The largest ${n}-bit value is 2^${n} − 1. Count the steps from the current value up to 2^${n}, which is where 0 appears.` },
      { id: "after", label: `After ${T} s`, ask: `What does it hold after ${T} seconds? ${BIN_FMT}`, answerType: "text", answer: toBin(end),
        hint: `Add ${T} to the current value. If you reach 2^${n} or more, take 2^${n} away (as often as needed), then convert back to binary.` },
    ],
    explanation: [
      `Current value: \`${S}\` = ${sumText(S)}. The counter has 2^${n} = ${size} values, 0 to ${size - 1}.`,
      `It shows 0 again after ${size} − ${start} = **${w}** seconds.`,
      `After ${T} seconds: ${start} + ${T} = ${start + T}${wraps ? `; take away ${size}${wraps > 1 ? ` ${wraps} times` : ""} to get ${end}` : ""}. In binary: **${toBin(end)}**.`,
    ].join("\n\n"),
    params: { kind: "x-counter", n, start: S, t: T },
    hints: [
      `First read \`${S}\` as a decimal number.`,
      `An ${n}-bit counter has 2^${n} different values, so it wraps when it would reach 2^${n}.`,
      "Adding past the top is like taking the remainder after dividing by 2^n.",
    ],
  };
}

// ---- hexadecimal / expert ----

function hexColumns(a, b, sub) {
  const A = toHex(a);
  const B = toHex(b);
  const n = Math.max(A.length, B.length);
  const pa = A.padStart(n, "0");
  const pb = B.padStart(n, "0");
  const rows = [];
  let carry = 0;
  let count = 0;
  for (let i = n - 1; i >= 0; i--) {
    const x = parseInt(pa[i], 16);
    const y = parseInt(pb[i], 16);
    if (!sub) {
      const s = x + y + carry;
      rows.push(`- ${pa[i]} + ${pb[i]}${carry ? " + carry 1" : ""} = ${s}${s >= 16 ? ` = 16 + ${s - 16} → write ${toHex(s - 16)}, carry 1` : ` → write ${toHex(s)}`}`);
      carry = s >= 16 ? 1 : 0;
      if (carry) count++;
    } else {
      const s = x - y - carry;
      rows.push(`- ${pa[i]} − ${pb[i]}${carry ? " − borrow 1" : ""}${s < 0 ? `: too small, so borrow 16: ${x + 16} − ${y + carry} = ${s + 16} → write ${toHex(s + 16)}` : ` = ${s} → write ${toHex(s)}`}`);
      carry = s < 0 ? 1 : 0;
      if (carry) count++;
    }
  }
  if (!sub && carry) rows.push("- The last carry becomes a new leftmost digit 1.");
  return { rows, count, pa, pb };
}

function xHexArith(rng) {
  const sub = rng.next() < 0.4;
  let a, b, c, res;
  do {
    a = rng.int(256, 0xffff);
    b = rng.int(256, 0xffff);
    if (sub && b > a) [a, b] = [b, a];
    res = sub ? a - b : a + b;
    c = hexColumns(a, b, sub);
  } while (a === b || res < 16 || c.count < 2);
  const sym = sub ? "−" : "+";
  return {
    prompt: `Work in hexadecimal: \`${toHex(a)} ${sym} ${toHex(b)}\`. Remember that each hex column is worth 16 of the column to its right.`,
    answerType: "multi",
    parts: [
      { id: "hex", label: sub ? "Difference" : "Sum", ask: `The answer in hex. ${HEX_FMT}`, answerType: "text", answer: toHex(res),
        hint: sub
          ? "Subtract column by column from the right. If the top digit is too small, borrow 16 from the next column."
          : "Add column by column from the right. A column total of 16 or more: write total − 16 and carry 1." },
      { id: "dec", label: "Decimal", ask: "The same answer as a decimal number.", answerType: "number", answer: res, tolerance: 0,
        hint: "Multiply each hex digit of your answer by its place value (1, 16, 256, 4096, 65536 from the right) and add." },
    ],
    explanation: [
      `Line the numbers up on the right and work column by column (A = 10 … F = 15):\n\n\`\`\`\n  ${c.pa}\n${sym} ${c.pb}\n\`\`\``,
      c.rows.join("\n"),
      `Result: **${toHex(res)}**.`,
      `In decimal: ${toHex(res).split("").map((d, i, arr) => `${d} × ${16 ** (arr.length - 1 - i)}`).join(" + ")} = **${res}**. Check: ${a} ${sym} ${b} = ${res}.`,
    ].join("\n\n"),
    params: { kind: "x-hexarith", a: toHex(a), b: toHex(b), sub },
    hints: [
      `Hex digits go up to F = 15, so a column ${sub ? "borrows 16, not 10" : "carries when it reaches 16, not 10"}.`,
      `Start with the rightmost column: ${toHex(a).slice(-1)} ${sym} ${toHex(b).slice(-1)}. Turn letters into numbers first.`,
      "For the decimal part you can convert your hex answer, or convert both numbers first and check.",
    ],
  };
}

const CH = ["red", "green", "blue"];
const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, "0");
const colourCode = (rgb) => `#${rgb.map(hex2).join("")}`;
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);

function xColour(rng) {
  let rgb;
  do rgb = [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)];
  while (new Set(rgb).size < 3 || rgb.some((v) => v % 17 === 0)); // every channel has two different digits
  const code = colourCode(rgb);
  const pairRows = rgb.map((v, i) => `- ${CH[i]}: \`${hex2(v)}\` = ${parseInt(hex2(v)[0], 16)} × 16 + ${parseInt(hex2(v)[1], 16)} = ${v}`).join("\n");

  if (rng.next() < 0.5) {
    return {
      prompt: `Web colours are written as \`#RRGGBB\`: two hex digits each for red, green and blue, from 00 (none) to FF (full). What are the red, green and blue values of \`${code}\` in decimal?`,
      answerType: "multi",
      parts: CH.map((name, i) => ({
        id: name, label: cap1(name), ask: `${cap1(name)} (0 to 255)`, answerType: "number", answer: rgb[i], tolerance: 0,
        hint: `The ${name} digits are \`${hex2(rgb[i])}\`. The left digit is worth 16 each.`,
      })),
      explanation: `Split the code into pairs and convert each one (left digit × 16 + right digit):\n\n${pairRows}`,
      params: { kind: "x-colour", code },
      hints: [
        `Split \`${code}\` after the # into three pairs: red, green, blue.`,
        "Each pair is a 2-digit hex number: left digit × 16 + right digit, with A = 10 … F = 15.",
      ],
    };
  }

  // Reverse: decimal channels -> which code. Distractors are classic slips.
  const swapDigits = (i) => rgb.map((v, k) => (k === i ? ((v & 15) << 4) | (v >> 4) : v));
  const i0 = rng.int(0, 2);
  const cands = [
    colourCode(swapDigits(i0)), // digits of one channel swapped
    colourCode([rgb[2], rgb[1], rgb[0]]), // blue and red swapped (BGR order)
    colourCode(rgb.map((v, k) => (k === (i0 + 1) % 3 ? (v + 16) % 256 : v))), // one 16s digit off by one
    colourCode(swapDigits((i0 + 2) % 3)),
    colourCode(rgb.map((v, k) => (k === (i0 + 2) % 3 ? (v + 240) % 256 : v))),
  ];
  const wrong = [];
  for (const c of cands) if (c !== code && !wrong.includes(c) && wrong.length < 3) wrong.push(c);
  return {
    prompt: `Web colours are written as \`#RRGGBB\`: two hex digits each for red, green and blue. Which code is the colour with red ${rgb[0]}, green ${rgb[1]} and blue ${rgb[2]}?`,
    answer: code,
    answerType: "choice",
    choices: rng.shuffle([code, ...wrong]),
    explanation: `Convert each channel to a 2-digit hex number (divide by 16: the whole-number result is the left digit, the remainder the right):\n\n${rgb.map((v, i) => `- ${CH[i]}: ${v} = ${Math.floor(v / 16)} × 16 + ${v % 16} → \`${hex2(v)}\``).join("\n")}\n\nIn red, green, blue order: **${code}**.`,
    params: { kind: "x-colour-rev", rgb },
    hints: [
      "Each channel becomes exactly two hex digits, in the order red, green, blue.",
      `Divide ${rgb[0]} by 16: the whole-number result is the left digit and the remainder is the right digit. Do the same for the other two.`,
      "Check the options for swapped digits or swapped channels.",
    ],
  };
}

function xMemory(rng) {
  const start = rng.int(0x1000, 0xfe00);
  let n = rng.int(20, 700);
  let last = start + n - 1;
  if (rng.next() < 0.25) {
    // Edge case: the buffer ends right before a 16-byte boundary.
    n += 15 - (last % 16);
    last = start + n - 1;
  }
  const next = Math.ceil((last + 1) / 16) * 16;
  const S = toHex(start);
  return {
    prompt: `Memory addresses are written in hex, and each address holds one byte. A buffer starts at address \`${S}\` and holds **${n}** bytes (that count is in decimal).`,
    answerType: "multi",
    parts: [
      { id: "last", label: "Last address", ask: `Address of the buffer's last byte. ${HEX_FMT}`, answerType: "text", answer: toHex(last),
        hint: `The first byte is at \`${S}\` itself, so the last one is ${n} − 1 addresses further on.` },
      { id: "next", label: "Next aligned", ask: `The next buffer must start on a 16-byte boundary (an address ending in hex 0) after this buffer. Which address is that? ${HEX_FMT}`, answerType: "text", answer: toHex(next),
        hint: "Take the address right after the last byte. If its last hex digit is 0 it is already aligned; otherwise round it up to the next address ending in 0." },
    ],
    explanation: [
      `Work in one base. \`${S}\` = ${start}.`,
      `The last byte is at ${start} + ${n} − 1 = ${last} = **${toHex(last)}** (not ${start} + ${n}: the first byte uses address \`${S}\` itself).`,
      `The address after it is ${last + 1} = \`${toHex(last + 1)}\`. ${(last + 1) % 16 === 0 ? "Its last hex digit is already 0, so it is aligned" : "Round up to the next multiple of 16 (last hex digit 0)"}: **${toHex(next)}**.`,
    ].join("\n\n"),
    params: { kind: "x-memory", start: S, n },
    hints: [
      `Work in one base: convert \`${S}\` to decimal (or ${n} to hex) first.`,
      "Off-by-one check: a buffer of 1 byte starts and ends at the same address.",
      "A 16-byte boundary is an address whose last hex digit is 0 (a multiple of 16).",
    ],
  };
}

// ---- binary arithmetic / expert ----

const signed8 = (v) => (v >= 128 ? v - 256 : v);

function xSignedAdd(rng) {
  const over = rng.next() < 0.5;
  let a, b;
  do {
    if (over) {
      if (rng.next() < 0.5) {
        a = rng.int(20, 127);
        b = rng.int(128 - a, 127);
      } else {
        a = -rng.int(20, 128);
        b = -rng.int(Math.max(1, 129 + a), 128);
      }
    } else {
      a = rng.int(-128, 127);
      b = rng.int(Math.max(-128, -128 - a), Math.min(127, 127 - a));
    }
  } while (a === 0 || b === 0 || a + b === 0 || over === (a + b >= -128 && a + b <= 127));
  const x = a & 0xff;
  const y = b & 0xff;
  const r = (x + y) & 0xff;
  const X = toByte(x);
  const Y = toByte(y);
  const R = toByte(r);
  const val = signed8(r);
  const carryOut = x + y > 255;
  return {
    prompt: `These are 8-bit two's complement numbers (the leftmost bit is worth −128). Add \`${X}\` + \`${Y}\`, keeping only 8 bits.`,
    answerType: "multi",
    parts: [
      { id: "res", label: "8-bit result", ask: `The 8-bit result. ${BYTE_FMT}`, answerType: "text", answer: R,
        hint: "Add like ordinary binary, column by column from the right. If a carry comes out of the leftmost column, drop it." },
      { id: "val", label: "Value", ask: "The signed decimal value your 8-bit result stands for. Include the minus sign if needed.", answerType: "number", answer: val, tolerance: 0,
        hint: "If the result starts with 1, its value is −128 plus the other seven place values." },
      { id: "ovf", label: "Overflow", ask: "Did the addition overflow (is the 8-bit result different from the true sum)?", answerType: "choice", answer: over ? "Yes" : "No", choices: ["Yes", "No"],
        hint: "Read both inputs as signed numbers, add them in decimal, and check whether that sum fits in −128 to 127." },
    ],
    explanation: [
      `As signed values: \`${X}\` = ${a} and \`${Y}\` = ${b}, so the true sum is ${a + b}.`,
      `Binary addition: ${x} + ${y} = ${x + y}${carryOut ? `, which needs 9 bits; dropping the carry leaves ${r}` : ""}, so the 8-bit result is **${R}**.`,
      `Read it as two's complement: ${R[0] === "1" ? `−128 + ${r - 128} = ` : ""}**${val}**.`,
      over
        ? `The true sum ${a + b} is outside −128 to 127, so the 8-bit result is wrong: overflow, **Yes**. Both inputs have the same sign, but the result's sign is different.`
        : `The true sum ${a + b} fits in −128 to 127, so there is **No** overflow${carryOut ? " (a carry out of the leftmost bit is not overflow in two's complement)" : ""}.`,
    ].join("\n\n"),
    params: { kind: "x-sadd", x: X, y: Y },
    hints: [
      "Add the bit patterns exactly as you would unsigned binary, then keep only the rightmost 8 bits.",
      "Work out what each input means: a pattern starting with 1 is negative (−128 plus the rest).",
      "Overflow means the true answer doesn't fit in 8 bits. It can only happen when both inputs have the same sign.",
    ],
  };
}

function xSubtract(rng) {
  let a, b;
  do {
    a = rng.int(1, 127);
    b = rng.int(1, 127);
    if (rng.next() < 0.6 && a > b) [a, b] = [b, a];
  } while (a === b);
  const A = toByte(a);
  const B = toByte(b);
  const nb = (256 - b) & 0xff;
  const r = (a + nb) & 0xff;
  const R = toByte(r);
  return {
    prompt: `Computers subtract by adding the negative. In 8-bit two's complement, work out \`${A}\` − \`${B}\` as \`${A}\` + (−\`${B}\`).`,
    answerType: "multi",
    parts: [
      { id: "neg", label: "Negative", ask: `The two's complement (negative) of \`${B}\`. ${BYTE_FMT}`, answerType: "text", answer: toByte(nb),
        hint: "Invert every bit, then add 1." },
      { id: "res", label: "Result", ask: `The 8-bit result of the addition (drop any carry out of 8 bits). ${BYTE_FMT}`, answerType: "text", answer: R,
        hint: "Add the first number to the negative you found, column by column, and keep only 8 bits." },
      { id: "val", label: "Value", ask: "The signed decimal value of the result. Include the minus sign if needed.", answerType: "number", answer: a - b, tolerance: 0,
        hint: "If the result starts with 1 it is negative: −128 plus the other place values." },
    ],
    explanation: [
      `Negate \`${B}\`: invert to \`${toByte(~b)}\`, add 1 → \`${toByte(nb)}\`.`,
      `Add: \`${A}\` + \`${toByte(nb)}\` = ${a} + ${nb} = ${a + nb}${a + nb > 255 ? `; drop the carry out of 8 bits → ${r}` : ""}, so the result is **${R}**.`,
      `Value: ${R[0] === "1" ? `−128 + ${r - 128} = ` : ""}**${a - b}**. Check: ${a} − ${b} = ${a - b}.`,
    ].join("\n\n"),
    params: { kind: "x-sub", a: A, b: B },
    hints: [
      `Step 1: negate \`${B}\` (invert every bit, then add 1).`,
      `Step 2: add \`${A}\` to that pattern in binary, keeping only 8 bits.`,
      "Step 3: read the result as two's complement. A leading 1 means negative.",
    ],
  };
}

function genExpert(subtopic, rng) {
  if (subtopic === "binary") {
    const t = rng.int(0, 2);
    return t === 0 ? xBitwise(rng) : t === 1 ? xFractions(rng) : xCounter(rng);
  }
  if (subtopic === "hexadecimal") {
    const t = rng.int(0, 2);
    return t === 0 ? xHexArith(rng) : t === 1 ? xColour(rng) : xMemory(rng);
  }
  if (subtopic === "binary-arithmetic") return rng.next() < 0.5 ? xSignedAdd(rng) : xSubtract(rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---- expert verification: re-derive with the hand parser (parseDigits), loops and per-bit work ----

const xPart = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);

// Parse a binary fraction "101.011" bit by bit (no parseInt). NaN if not canonical.
function parseBinFrac(raw) {
  const s = String(raw ?? "").trim();
  const m = /^(1[01]*)\.([01]*1)$/.exec(s);
  if (!m) return NaN;
  let v = parseDigits(m[1], 2);
  let place = 1;
  for (const c of m[2]) {
    place /= 2;
    if (c === "1") v += place;
  }
  return v;
}

// Signed value of an 8-bit pattern: top bit weighted -128.
function signedOf(bits) {
  let s = 0;
  for (let i = 0; i < 8; i++) if (bits[i] === "1") s += i === 0 ? -128 : 2 ** (7 - i);
  return s;
}

function verifyExpert(p, question, answer) {
  if (p.kind === "x-bitwise") {
    if (!/^[01]{8}$/.test(p.a) || !/^[01]{8}$/.test(p.b)) return false;
    let want = "";
    for (let i = 0; i < 8; i++) {
      const x = p.a[i] === "1";
      const y = p.b[i] === "1";
      want += (p.op === "AND" ? x && y : p.op === "OR" ? x || y : x !== y) ? "1" : "0";
    }
    const res = parseAnswer(xPart(answer, "res"), "byte");
    const dec = parseAnswer(xPart(answer, "dec"), "dec");
    return res === parseDigits(want, 2) && dec === parseDigits(want, 2);
  }
  if (p.kind === "x-frac") {
    const aBits = /^([01]+)\.([01]+)$/.exec(p.a);
    if (!aBits) return false;
    // (a): x × 2^k must equal the digits read as one whole number.
    const raw = xPart(answer, "todec");
    const x = Number(raw);
    if (!Number.isFinite(x) || String(raw ?? "").trim() === "") return false;
    if (x * 2 ** aBits[2].length !== parseDigits(aBits[1] + aBits[2], 2)) return false;
    // (b): the typed binary fraction read back must equal the decimal in the prompt.
    return parseBinFrac(xPart(answer, "tobin")) === Number(p.b);
  }
  if (p.kind === "x-counter") {
    const start = parseDigits(p.start, 2);
    if (!Number.isFinite(start) || p.start.length !== p.n) return false;
    const top = parseDigits("1".repeat(p.n), 2);
    const tick = (v) => (v === top ? 0 : v + 1);
    let v = start;
    let steps = 0;
    do {
      v = tick(v);
      steps++;
    } while (v !== 0 && steps < 100000);
    if (parseAnswer(xPart(answer, "wrap"), "dec") !== steps) return false;
    v = start;
    for (let i = 0; i < p.t; i++) v = tick(v);
    return v !== 0 && parseAnswer(xPart(answer, "after"), "bin") === v;
  }
  if (p.kind === "x-hexarith") {
    const a = parseDigits(p.a, 16);
    const b = parseDigits(p.b, 16);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    const want = p.sub ? a - b : a + b;
    return want > 0 && parseAnswer(xPart(answer, "hex"), "hex") === want && parseAnswer(xPart(answer, "dec"), "dec") === want;
  }
  if (p.kind === "x-colour") {
    const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/.exec(p.code);
    if (!m) return false;
    return CH.every((name, i) => parseAnswer(xPart(answer, name), "dec") === parseDigits(m[i + 1], 16));
  }
  if (p.kind === "x-colour-rev") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
    const fits = (c) => {
      const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/.exec(c);
      return !!m && [1, 2, 3].every((i) => parseDigits(m[i], 16) === p.rgb[i - 1]);
    };
    const ok = ch.filter(fits);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "x-memory") {
    const start = parseDigits(p.start, 16);
    const last = parseAnswer(xPart(answer, "last"), "hex");
    const next = parseAnswer(xPart(answer, "next"), "hex");
    if (!Number.isFinite(start) || !Number.isFinite(last) || !Number.isFinite(next)) return false;
    // Counting the addresses from start to last, inclusive, must give n.
    if (last - start + 1 !== p.n) return false;
    return next % 16 === 0 && next > last && next - 16 <= last;
  }
  if (p.kind === "x-sadd") {
    if (!/^[01]{8}$/.test(p.x) || !/^[01]{8}$/.test(p.y)) return false;
    const sx = signedOf(p.x);
    const sy = signedOf(p.y);
    const res = parseAnswer(xPart(answer, "res"), "byte");
    if (!Number.isFinite(res) || (res - (parseDigits(p.x, 2) + parseDigits(p.y, 2))) % 256 !== 0) return false;
    if (parseAnswer(xPart(answer, "val"), "dec") !== signedOf(toByte(res))) return false;
    const over = sx + sy < -128 || sx + sy > 127;
    return String(xPart(answer, "ovf")) === (over ? "Yes" : "No");
  }
  if (p.kind === "x-sub") {
    if (!/^[01]{8}$/.test(p.a) || !/^[01]{8}$/.test(p.b)) return false;
    const a = parseDigits(p.a, 2);
    const b = parseDigits(p.b, 2);
    const neg = parseAnswer(xPart(answer, "neg"), "byte");
    if (!Number.isFinite(neg) || (neg + b) % 256 !== 0) return false;
    const res = parseAnswer(xPart(answer, "res"), "byte");
    if (!Number.isFinite(res) || signedOf(toByte(res)) !== a - b) return false;
    return parseAnswer(xPart(answer, "val"), "dec") === a - b;
  }
  return false;
}
