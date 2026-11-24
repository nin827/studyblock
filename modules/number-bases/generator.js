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

function genBinary(difficulty, rng) {
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

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "binary") return genBinary(difficulty, rng);
  if (subtopic === "hexadecimal") return genHex(difficulty, rng);
  if (subtopic === "binary-arithmetic") return genArithmetic(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
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
