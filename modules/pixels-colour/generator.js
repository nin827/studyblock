// Pixels & colour generator. Uses only the seeded rng passed in by the engine.
// Subtopics: hex-rgb, blending, resolution, sprites.
// Answer formats: whole numbers (tolerance 0), "2dp" numbers (tolerance 0.005), hex bytes like "3F",
// hex colours like "#3FA2C8", channel lists like "63, 162, 200" and ratios like "16:9".
// params.kind tells verify() how to recheck a question. verify() never reuses the generator's maths:
// it decodes hex with its own digit table, blends in whole-number arithmetic, walks sprite grids
// with loops, cross-multiplies ratios and brute-forces common factors.

// ---------------------------------------------------------------------------------------------
// Shared helpers

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// 4 unique numeric choices: correct + 3 distractors from common mistakes, topped up with nearby values.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
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

// Number question, sometimes turned into a 4-option choice. fmt: "int" | "2dp".
function finishNum(base, exact, fmt, candidates, rng) {
  const rounded = fmt === "2dp";
  const q = { ...base, tolerance: rounded ? 0.005 : 0 };
  if (candidates && rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: rounded ? round2(exact) : exact, answerType: "number" };
}

// Text question, sometimes a 4-option choice built from wrong strings (compared ignoring case/spaces).
function finishText(base, answer, wrong, rng) {
  const key = (s) => String(s).toLowerCase().replace(/\s+/g, "");
  const seen = new Set([key(answer)]);
  const out = [];
  for (const w of wrong || []) {
    if (out.length >= 3 || typeof w !== "string" || seen.has(key(w))) continue;
    seen.add(key(w));
    out.push(w);
  }
  if (out.length === 3 && rng.next() < 0.35) {
    return { ...base, answer, answerType: "choice", choices: rng.shuffle([answer, ...out]) };
  }
  return { ...base, answer, answerType: "text" };
}

const numPart = (id, label, ask, value, fmt, hint) => ({
  id, label, ask, answerType: "number",
  answer: fmt === "2dp" ? round2(value) : value,
  tolerance: fmt === "2dp" ? 0.005 : 0,
  hint,
});

const givenFrom = (values) => Object.entries(values).map(([k, value]) => ({ label: `_${k}`, value }));

// Final line: "= **15**" or "≈ 5.3333, which rounds to **5.33**".
function result(exact, rounded, unit = "") {
  const u = unit ? ` ${unit}` : "";
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${num(exact)}${u}, which rounds to **${shown}${u}**`;
}

function checkDifficulty(d) {
  if (d !== "easy" && d !== "medium" && d !== "hard") throw new Error(`Unknown difficulty: ${d}`);
}

// ---------------------------------------------------------------------------------------------
// Hex & RGB

const HEX = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const hd = (d) => d.toString(16).toUpperCase();
const colour = (c) => "#" + c.map(HEX).join("");
const rgbStr = (c) => `rgb(${c.join(", ")})`;
const listStr = (c) => c.join(", ");
const CH = ["red", "green", "blue"];
const CH_LABEL = ["Red", "Green", "Blue"];
const THINGS = [
  "a health bar", "a slime sprite", "a UI button", "a laser bolt", "a lava tile", "a menu background",
  "a coin glow", "a water shader", "a player outline", "a sky gradient", "a potion icon", "a neon sign",
  "a fog layer", "a shield bubble", "a grass tile", "a damage number",
];
const dname = (d) => (d >= 10 ? `${hd(d)} (= ${d})` : String(d));
const pairSum = (v) => `16 × ${Math.floor(v / 16)} + ${v % 16}`;
const randColour = (rng, lo = 0) => [rng.int(lo, 255), rng.int(lo, 255), rng.int(lo, 255)];
const swapNibbles = (v) => ((v % 16) * 16) + Math.floor(v / 16);
const HEX_NOTE = "Type it with the #, like `#1A2B3C`.";

function genHex(d, rng) {
  checkDifficulty(d);
  const thing = rng.pick(THINGS);
  const k = rng.int(0, 2);
  const ch = CH[k];

  if (d === "easy") {
    if (rng.next() < 0.5) {
      const v = rng.int(17, 255);
      const s = HEX(v);
      const h = Math.floor(v / 16), l = v % 16;
      const base = {
        prompt: `The ${ch} channel of ${thing} is stored as the hex byte \`${s}\`. What is it in decimal (0 to 255)?`,
        explanation:
          `Hex is base 16, so a two-digit value is first digit × 16 + second digit (A to F are 10 to 15).\n\n` +
          `- \`${s}\` = ${pairSum(v)}\n- = ${16 * h} + ${l} = **${v}**`,
        hints: [
          "Hex is base 16: a two-digit value is (first digit × 16) + second digit. The letters A to F stand for 10 to 15.",
          `The digits of \`${s}\` are ${dname(h)} and ${dname(l)}, so work out ${pairSum(v)}.`,
        ],
        params: { kind: "h2d", hex: s },
      };
      return finishNum(base, v, "int", [16 * l + h, h * 10 + l, v + 16, v - 16], rng);
    }
    let v;
    do v = rng.int(0, 255); while (HEX(v) === "16" || HEX(v) === "10");
    const s = HEX(v);
    const h = Math.floor(v / 16), l = v % 16;
    const base = {
      prompt: `${cap(thing)} needs a ${ch} value of ${v}. Write ${v} as a two-digit hex byte, like \`0F\` or \`A7\`.`,
      explanation:
        `Divide by 16: the whole-number part is the first hex digit and the remainder is the second.\n\n` +
        `- ${v} ÷ 16 = ${h} remainder ${l}\n- ${h} → ${hd(h)} and ${l} → ${hd(l)}, so the byte is **${s}**`,
      hints: [
        "Divide by 16. The whole-number part is the first hex digit and the remainder is the second. Remainders of ten to fifteen become the letters A to F.",
        `${v} ÷ 16 = ${h} remainder ${l}. Now write each of those as one hex digit.`,
      ],
      params: { kind: "d2h", v },
    };
    return finishText(base, s, [HEX(swapNibbles(v)), HEX((v + 16) % 256), HEX((v + 240) % 256), HEX((v + 1) % 256)], rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["hex2ch", "rgb2hex", "hex2rgb", "short"]);
    if (kind === "hex2ch") {
      const c = randColour(rng);
      c[k] = rng.int(17, 255);
      const s = colour(c);
      const v = c[k];
      const base = {
        prompt: `${cap(thing)} uses the colour \`${s}\`, written as #RRGGBB. What is its ${ch} channel in decimal (0 to 255)?`,
        explanation:
          `In #RRGGBB the pairs are red, green and blue, in that order.\n\n` +
          `- The ${ch} pair is \`${HEX(v)}\`\n- \`${HEX(v)}\` = ${pairSum(v)} = **${v}**`,
        hints: [
          "In #RRGGBB the first pair of digits is red, the middle pair green and the last pair blue.",
          `The ${ch} pair is \`${HEX(v)}\`. Work out ${pairSum(v)} (A to F are 10 to 15).`,
        ],
        params: { kind: "hex2ch", hex: s, k },
      };
      return finishNum(base, v, "int", [c[(k + 1) % 3], c[(k + 2) % 3], swapNibbles(v)], rng);
    }
    if (kind === "rgb2hex") {
      const c = randColour(rng);
      const ans = colour(c);
      const steps = c.map((v, i) => `${CH_LABEL[i]}: ${v} ÷ 16 = ${Math.floor(v / 16)} remainder ${v % 16}`);
      const base = {
        prompt: `Write ${rgbStr(c)} for ${thing} as a hex colour. ${HEX_NOTE}`,
        explanation:
          `Convert each channel to two hex digits (divide by 16: quotient, then remainder) and write red, green, blue after a #.\n\n` +
          c.map((v, i) => `- ${steps[i]} → \`${HEX(v)}\``).join("\n") + `\n\nSo the colour is **${ans}**.`,
        hints: [
          "Convert each channel to a two-digit hex byte: divide by 16, the quotient is the first digit and the remainder the second. Then write red, green, blue after a #.",
          `${steps.join(". ")}. Turn each quotient and remainder into a hex digit.`,
        ],
        params: { kind: "rgb2hex", c },
      };
      const wrong = [colour([c[2], c[1], c[0]]), colour(c.map(swapNibbles)), colour([c[0], c[1], (c[2] + 16) % 256]), colour([(c[0] + 16) % 256, c[1], c[2]])];
      return finishText(base, ans, wrong, rng);
    }
    if (kind === "hex2rgb") {
      const c = randColour(rng);
      const s = colour(c);
      const base = {
        prompt: `Convert \`${s}\` (${thing}) to its red, green and blue values in decimal. Type them in that order, separated by commas, like \`12, 200, 7\`.`,
        explanation:
          `Split the colour into its three pairs and convert each one (first digit × 16 + second digit).\n\n` +
          c.map((v, i) => `- ${CH_LABEL[i]}: \`${HEX(v)}\` = ${pairSum(v)} = ${v}`).join("\n") +
          `\n\nSo the answer is **${listStr(c)}**.`,
        hints: [
          "Split #RRGGBB into three pairs. Each pair is (first digit × 16) + second digit, with A to F meaning 10 to 15.",
          `The pairs are \`${HEX(c[0])}\`, \`${HEX(c[1])}\` and \`${HEX(c[2])}\`. Convert each one, then list them in order.`,
        ],
        params: { kind: "hex2rgb", hex: s },
      };
      return finishText(base, listStr(c), [listStr([c[2], c[1], c[0]]), listStr(c.map(swapNibbles))], rng);
    }
    // Shorthand #RGB.
    const dg = [rng.int(0, 15), rng.int(0, 15), rng.int(0, 15)];
    const short = "#" + dg.map(hd).join("");
    const full = "#" + dg.map((x) => hd(x) + hd(x)).join("");
    const intro = `CSS-style shorthand \`${short}\` for ${thing} means every digit is doubled: \`#RGB\` is \`#RRGGBB\`.`;
    if (rng.next() < 0.5) {
      const base = {
        prompt: `${intro} Write it as a full six-digit colour. ${HEX_NOTE}`,
        explanation: `Write each digit twice, keeping the order red, green, blue.\n\n- ${dg.map(hd).join(", ")} → ${dg.map((x) => hd(x) + hd(x)).join(", ")}\n- So the colour is **${full}**.`,
        hints: [
          "In shorthand, each single digit stands for a pair of that same digit.",
          `The digits are ${dg.map(hd).join(", ")}. Double each one and put them after a #.`,
        ],
        params: { kind: "short", short },
      };
      const wrong = [
        "#" + dg.map(hd).join("") + "000",
        "#" + dg.map((x) => hd(x) + "0").join(""),
        "#" + dg.map((x) => "0" + hd(x)).join(""),
        "#" + dg.map(hd).join("") + dg.map(hd).join(""),
      ];
      return finishText(base, full, wrong, rng);
    }
    dg[k] = rng.int(1, 15);
    const shortK = "#" + dg.map(hd).join("");
    const v = 17 * dg[k];
    const pair = hd(dg[k]) + hd(dg[k]);
    const base = {
      prompt: `CSS-style shorthand \`${shortK}\` for ${thing} means every digit is doubled: \`#RGB\` is \`#RRGGBB\`. What is its ${ch} channel in decimal (0 to 255)?`,
      explanation: `Double the ${ch} digit to get its pair, then convert.\n\n- ${hd(dg[k])} → \`${pair}\`\n- \`${pair}\` = ${pairSum(v)} = **${v}**`,
      hints: [
        "Each shorthand digit stands for a pair of that same digit, so first write the full pair.",
        `The ${ch} digit ${dname(dg[k])} becomes the pair \`${pair}\`. Work out ${pairSum(v)}.`,
      ],
      params: { kind: "shortch", short: shortK, k },
    };
    return finishNum(base, v, "int", [dg[k], 16 * dg[k], 10 * dg[k] + dg[k]], rng);
  }

  // Hard
  const kind = rng.pick(["invert", "gray", "luma", "multi"]);
  if (kind === "invert") {
    const c = randColour(rng);
    const s = colour(c);
    const inv = c.map((v) => 255 - v);
    const ans = colour(inv);
    const base = {
      prompt: `A damage-flash shader inverts \`${s}\` (${thing}): each channel becomes 255 − its value. What is the inverted colour? ${HEX_NOTE}`,
      explanation:
        `Invert each channel on its own. (Shortcut: each hex digit becomes F minus that digit.)\n\n` +
        c.map((v, i) => `- ${CH_LABEL[i]}: \`${HEX(v)}\` = ${v}, and 255 − ${v} = ${inv[i]} = \`${HEX(inv[i])}\``).join("\n") +
        `\n\nSo the inverted colour is **${ans}**.`,
      hints: [
        "Invert each channel separately: new = 255 − old. A shortcut in hex: each digit becomes F minus that digit (so 0 ↔ F, 1 ↔ E, …).",
        `In decimal the colour is ${rgbStr(c)}. Work out 255 minus each channel, then write each result as two hex digits.`,
      ],
      params: { kind: "invert", hex: s },
    };
    const wrong = [
      colour([inv[2], inv[1], inv[0]]),
      colour(inv.map(swapNibbles)),
      colour(c.map((v) => Math.min(255, 256 - v))),
      colour(c.map(swapNibbles)),
    ];
    return finishText(base, ans, wrong, rng);
  }
  if (kind === "gray") {
    let c, g;
    do {
      c = randColour(rng);
      g = Math.round((c[0] + c[1] + c[2]) / 3);
    } while (c.includes(g) || g === 16); // 16 appears in the "× 16" hint
    const s = colour(c);
    const base = {
      prompt: `A shader turns \`${s}\` (${thing}) grey using the average: grey = (R + G + B) ÷ 3, rounded to the nearest whole number. What is the grey value (0 to 255)?`,
      explanation:
        `Convert each pair to decimal, then average.\n\n` +
        c.map((v, i) => `- ${CH_LABEL[i]}: \`${HEX(v)}\` = ${v}`).join("\n") +
        `\n- (${c.join(" + ")}) ÷ 3 = ${c[0] + c[1] + c[2]} ÷ 3 ${(c[0] + c[1] + c[2]) % 3 === 0 ? `= **${g}**` : `≈ ${num((c[0] + c[1] + c[2]) / 3)}, which rounds to **${g}**`}`,
      hints: [
        "First turn each pair into decimal: (first digit × 16) + second digit.",
        `The channels are R = ${c[0]}, G = ${c[1]}, B = ${c[2]}. Add them, divide by 3 and round to the nearest whole number.`,
      ],
      params: { kind: "gray", hex: s },
    };
    const sum = c[0] + c[1] + c[2];
    return finishNum(base, g, "int", [Math.round((Math.max(...c) + Math.min(...c)) / 2), Math.max(...c), Math.round(sum / 2)], rng);
  }
  if (kind === "luma") {
    let c, y;
    do {
      c = randColour(rng);
      y = Math.floor(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] + 0.5 + 1e-9);
    } while (c.includes(y));
    const exact = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const base = {
      prompt:
        `Games often weight green most when turning colour into brightness: Y = 0.299 × R + 0.587 × G + 0.114 × B. ` +
        `What is Y for ${rgbStr(c)} (${thing})? Round to the nearest whole number (halves round up).`,
      explanation:
        `Multiply each channel by its weight and add.\n\n` +
        `- \`0.299 × ${c[0]} + 0.587 × ${c[1]} + 0.114 × ${c[2]}\`\n- = ${num(0.299 * c[0])} + ${num(0.587 * c[1])} + ${num(0.114 * c[2])} ≈ ${num(exact)}, which rounds to **${y}**`,
      hints: [
        "Multiply each channel by its own weight (0.299 for red, 0.587 for green, 0.114 for blue), then add the three results.",
        `Work out 0.299 × ${c[0]} + 0.587 × ${c[1]} + 0.114 × ${c[2]} (in the calculator: \`0.299 * _r + 0.587 * _g + 0.114 * _b\`), then round.`,
      ],
      given: givenFrom({ r: c[0], g: c[1], b: c[2] }),
      params: { kind: "luma", c },
    };
    return finishNum(base, y, "int", [Math.round((c[0] + c[1] + c[2]) / 3), Math.round(0.299 * c[2] + 0.587 * c[1] + 0.114 * c[0]), c[1]], rng);
  }
  // multi: hex -> R, G, B
  let c;
  do c = randColour(rng, 17); while (c.some((v) => c.map(HEX).includes(String(v)))); // no pair reads like an answer
  const lower = rng.next() < 0.4;
  const s = lower ? colour(c).toLowerCase() : colour(c);
  const parts = c.map((v, i) =>
    numPart(CH[i], CH_LABEL[i], `${CH_LABEL[i]} channel in decimal (0 to 255)`, v, "int",
      `The ${CH[i]} pair is \`${lower ? HEX(v).toLowerCase() : HEX(v)}\`: work out ${pairSum(v)}.`));
  return {
    prompt: `${cap(thing)} is coloured \`${s}\`${lower ? " (hex digits may be lower case; a to f mean 10 to 15)" : ""}. Give its red, green and blue channels in decimal.`,
    answerType: "multi",
    parts,
    explanation:
      `Split #RRGGBB into three pairs and convert each: first digit × 16 + second digit.\n\n` +
      c.map((v, i) => `- ${CH_LABEL[i]}: \`${HEX(v)}\` = ${pairSum(v)} = **${v}**`).join("\n"),
    hints: ["Split the colour into three pairs: red, green, blue. Each pair is (first digit × 16) + second digit."],
    params: { kind: "hexmulti", hex: s },
  };
}

// ---------------------------------------------------------------------------------------------
// Blending: result = a × src + (1 − a) × dst, rounded to the nearest whole number, halves up.

const BLEND = "result = a × src + (1 − a) × dst";
const ROUND_NOTE = "Round to the nearest whole number (halves round up).";
// Generation uses decimals; verify() redoes it in whole numbers.
const blendF = (a, s, d) => Math.floor(a * s + (1 - a) * d + 0.5 + 1e-9);

function genBlend(d, rng) {
  checkDifficulty(d);
  const thing = rng.pick(THINGS);
  const k = rng.int(0, 2);
  const ch = CH[k];

  if (d === "easy" || (d === "medium" && rng.next() < 0.4)) {
    const p = d === "easy" ? rng.pick([10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90]) : 5 * rng.int(1, 19);
    const a = p / 100;
    let src, dst;
    do {
      src = rng.int(0, 255);
      dst = rng.int(0, 255);
    } while (src === dst);
    const exact = a * src + (1 - a) * dst;
    const ans = blendF(a, src, dst);
    const base = {
      prompt:
        `${cap(thing)} has a ${ch} value of ${src} and is drawn at opacity ${num(a)} over a background whose ${ch} value is ${dst}. ` +
        `Using ${BLEND}, what is the blended ${ch} value? ${ROUND_NOTE}`,
      explanation:
        `Blend the channel with the opacity a = ${num(a)}.\n\n` +
        `- \`${num(a)} × ${src} + ${num(1 - a)} × ${dst}\`\n- = ${num(a * src)} + ${num((1 - a) * dst)} = ${num(exact)}` +
        (Math.abs(exact - ans) < 1e-9 ? ` = **${ans}**` : `, which rounds to **${ans}**`),
      hints: [
        `The new colour is a weighted mix: the sprite counts for a = ${num(a)} and the background for 1 − a = ${num(1 - a)}.`,
        `Work out ${num(a)} × ${src} + ${num(1 - a)} × ${dst} (in the calculator: \`_a * _src + (1 - _a) * _dst\`), then round.`,
      ],
      given: givenFrom({ a, src, dst }),
      params: { kind: "blend", p, src, dst },
    };
    return finishNum(base, ans, "int", [blendF(a, dst, src), Math.floor((src + dst) / 2 + 0.5), Math.floor(a * src + 0.5), Math.floor(exact)], rng);
  }

  if (d === "medium") {
    const p = 5 * rng.int(1, 19);
    const a = p / 100;
    let s, t, res;
    do {
      s = randColour(rng);
      t = randColour(rng);
      res = s.map((v, i) => blendF(a, v, t[i]));
    } while (s.some((v, i) => v === t[i]) || res.some((v) => s.includes(v) || t.includes(v) || v === 16));
    if (rng.next() < 0.5) {
      const S = colour(s), T = colour(t);
      const base = {
        prompt:
          `${cap(thing)} \`${S}\` is drawn at opacity ${num(a)} over a background of \`${T}\`. ` +
          `Using ${BLEND} on each channel, what is the blended ${ch} value in decimal? ${ROUND_NOTE}`,
        explanation:
          `Convert the two ${ch} pairs to decimal, then blend.\n\n` +
          `- Sprite ${ch}: \`${HEX(s[k])}\` = ${s[k]}; background ${ch}: \`${HEX(t[k])}\` = ${t[k]}\n` +
          `- \`${num(a)} × ${s[k]} + ${num(1 - a)} × ${t[k]}\` = ${num(a * s[k] + (1 - a) * t[k])}, which rounds to **${res[k]}**`,
        hints: [
          `Take the ${ch} pair from each colour and convert it to decimal (first digit × 16 + second digit).`,
          `The ${ch} values are ${s[k]} (sprite) and ${t[k]} (background). Work out ${num(a)} × ${s[k]} + ${num(1 - a)} × ${t[k]} and round.`,
        ],
        params: { kind: "blendhex", p, src: S, dst: T, k },
      };
      return finishNum(base, res[k], "int", [blendF(a, t[k], s[k]), Math.floor((s[k] + t[k]) / 2 + 0.5), s[k], t[k]], rng);
    }
    const base = {
      prompt:
        `${cap(thing)} with colour ${rgbStr(s)} is drawn at opacity ${num(a)} over a background of ${rgbStr(t)}. ` +
        `Using ${BLEND} on each channel, what is the blended colour? ${ROUND_NOTE} Type the red, green and blue values separated by commas, like \`12, 200, 7\`.`,
      explanation:
        `Blend each channel on its own with a = ${num(a)}.\n\n` +
        s.map((v, i) => `- ${CH_LABEL[i]}: \`${num(a)} × ${v} + ${num(1 - a)} × ${t[i]}\` = ${num(a * v + (1 - a) * t[i])} → ${res[i]}`).join("\n") +
        `\n\nSo the blended colour is **${listStr(res)}**.`,
      hints: [
        `Blend each channel separately: ${BLEND}, with a = ${num(a)} and 1 − a = ${num(1 - a)}.`,
        `Red: ${num(a)} × ${s[0]} + ${num(1 - a)} × ${t[0]}. Do the same for green and blue (in the calculator: \`_a * _sr + (1 - _a) * _dr\`), then round each.`,
      ],
      given: givenFrom({ a, sr: s[0], sg: s[1], sb: s[2], dr: t[0], dg: t[1], db: t[2] }),
      params: { kind: "blend3", p, src: s, dst: t },
    };
    return finishText(base, listStr(res), [], rng);
  }

  // Hard
  const kind = rng.pick(["byte", "layers", "alpha", "multi"]);
  if (kind === "byte") {
    const A = rng.int(1, 254);
    let src, dst, ans;
    do {
      src = rng.int(0, 255);
      dst = rng.int(0, 255);
      ans = blendF(A / 255, src, dst);
    } while (src === dst || ans === A);
    const a = A / 255;
    const base = {
      prompt:
        `${cap(thing)} stores its opacity as an alpha byte of ${A} out of 255, so a = ${A} ÷ 255. Its ${ch} value is ${src} and the background's is ${dst}. ` +
        `Using ${BLEND}, what is the blended ${ch} value? Round to the nearest whole number.`,
      explanation:
        `Turn the alpha byte into a decimal first, then blend.\n\n` +
        `- a = ${A} ÷ 255 ≈ ${num(a)}\n- \`a × ${src} + (1 − a) × ${dst}\` ≈ ${num(a * src + (1 - a) * dst)}, which rounds to **${ans}**`,
      hints: [
        `Divide the alpha byte by 255 to get a between 0 and 1: a = ${A} ÷ 255.`,
        `Work out a × ${src} + (1 − a) × ${dst} without rounding a (in the calculator: \`_A / 255 * _src + (1 - _A / 255) * _dst\`), then round.`,
      ],
      given: givenFrom({ A, src, dst }),
      params: { kind: "byte", A, src, dst },
    };
    return finishNum(base, ans, "int", [blendF(a, dst, src), Math.floor((A / 100) * src + 0.5), Math.floor((src + dst) / 2 + 0.5)], rng);
  }
  if (kind === "layers") {
    const p1 = 5 * rng.int(2, 18), p2 = 5 * rng.int(2, 18);
    const a1 = p1 / 100, a2 = p2 / 100;
    let s1, s2, bg, ans, mid;
    do {
      s1 = rng.int(0, 255);
      s2 = rng.int(0, 255);
      bg = rng.int(0, 255);
      mid = a1 * s1 + (1 - a1) * bg;
      ans = Math.floor(a2 * s2 + (1 - a2) * mid + 0.5 + 1e-9);
    } while (s1 === bg || s2 === s1 || [s1, s2, bg].includes(ans));
    const exact = a2 * s2 + (1 - a2) * mid;
    const base = {
      prompt:
        `Two effects are drawn over ${thing} whose ${ch} value is ${bg}: first a layer with ${ch} ${s1} at opacity ${num(a1)}, then on top a layer with ${ch} ${s2} at opacity ${num(a2)}. ` +
        `Using ${BLEND} for each layer, keeping full precision between the layers, what is the final ${ch} value? ${ROUND_NOTE}`,
      explanation:
        `Blend the lower layer first, then blend the top layer over that result.\n\n` +
        `- Layer 1: \`${num(a1)} × ${s1} + ${num(1 - a1)} × ${bg}\` = ${num(mid)}\n` +
        `- Layer 2: \`${num(a2)} × ${s2} + ${num(1 - a2)} × ${num(mid)}\` = ${num(exact)}` +
        (Math.abs(exact - ans) < 1e-9 ? ` = **${ans}**` : `, which rounds to **${ans}**`),
      hints: [
        "Work from the bottom up: blend layer 1 over the background, then blend layer 2 over that result. Don't round in between.",
        `Layer 1: m = ${num(a1)} × ${s1} + ${num(1 - a1)} × ${bg} (in the calculator: \`_a1 * _s1 + (1 - _a1) * _bg\`).`,
        `Layer 2: ${num(a2)} × ${s2} + ${num(1 - a2)} × m (in the calculator: \`_a2 * _s2 + (1 - _a2) * _m\`), then round.`,
      ],
      given: givenFrom({ bg, s1, a1, s2, a2 }),
      params: { kind: "layers", p1, p2, s1, s2, bg },
    };
    return finishNum(base, ans, "int", [blendF(a2, s2, bg), blendF(a1, s1, bg), Math.floor(a1 * s1 + a2 * s2 + 0.5)], rng);
  }
  if (kind === "alpha") {
    const p = 5 * rng.int(1, 19);
    let src, dst, res;
    do {
      const diff = 20 * rng.int(-12, 12);
      dst = rng.int(0, 255);
      src = dst + diff;
      res = dst + (p * diff) / 100;
    } while (src === dst || src < 0 || src > 255);
    const a = p / 100;
    const base = {
      prompt:
        `${cap(thing)} with ${ch} value ${src} is drawn over a background with ${ch} value ${dst}, and the screen shows ${res}. ` +
        `Using ${BLEND}, what opacity a was used? Give a decimal between 0 and 1, to 2 decimal places.`,
      explanation:
        `Rearrange the blend formula for a: \`a = (result − dst) ÷ (src − dst)\`.\n\n` +
        `- \`a = (${res} − ${dst}) ÷ (${src} − ${dst})\`\n- = ${num(res - dst)} ÷ ${num(src - dst)} ${result(a, true)}`,
      hints: [
        "Rearrange: result − dst = a × (src − dst), so a = (result − dst) ÷ (src − dst).",
        `Work out (${res} − ${dst}) ÷ (${src} − ${dst}) (in the calculator: \`(_res - _dst) / (_src - _dst)\`).`,
      ],
      given: givenFrom({ src, dst, res }),
      params: { kind: "alpha", src, dst, res },
    };
    return finishNum(base, a, "2dp", [1 - a, res / src, (res - dst) / src, res / 255], rng);
  }
  // multi
  const p = 5 * rng.int(1, 19);
  const a = p / 100;
  let s, t, res;
  do {
    s = randColour(rng);
    t = randColour(rng);
    res = s.map((v, i) => blendF(a, v, t[i]));
  } while (s.some((v, i) => v === t[i]) || res.some((v) => s.includes(v) || t.includes(v) || [...s, ...t].map(HEX).includes(String(v))));
  const S = colour(s), T = colour(t);
  const parts = res.map((v, i) =>
    numPart(CH[i], CH_LABEL[i], `Blended ${CH[i]} value (0 to 255)`, v, "int",
      `${CH_LABEL[i]}: sprite \`${HEX(s[i])}\` = ${s[i]} and background \`${HEX(t[i])}\` = ${t[i]}. Work out ${num(a)} × ${s[i]} + ${num(1 - a)} × ${t[i]}, then round.`));
  return {
    prompt:
      `${cap(thing)} \`${S}\` is drawn at opacity ${num(a)} over a background of \`${T}\`. ` +
      `Using ${BLEND} on each channel, give the blended red, green and blue values in decimal. ${ROUND_NOTE}`,
    answerType: "multi",
    parts,
    explanation:
      `Convert each pair to decimal, then blend each channel with a = ${num(a)}.\n\n` +
      s.map((v, i) => `- ${CH_LABEL[i]}: \`${num(a)} × ${v} + ${num(1 - a)} × ${t[i]}\` = ${num(a * v + (1 - a) * t[i])} → **${res[i]}**`).join("\n"),
    hints: [`Convert both colours to decimal channels, then blend each channel: ${BLEND}, with a = ${num(a)}.`],
    params: { kind: "blendmulti", p, src: S, dst: T },
  };
}

// ---------------------------------------------------------------------------------------------
// Resolution & aspect

const SCREENS = [
  [1920, 1080], [1280, 720], [2560, 1440], [3840, 2160], [1366, 768], [1280, 1024], [1024, 768], [2560, 1080],
  [3440, 1440], [1440, 900], [800, 600], [1680, 1050], [2048, 1536], [1600, 900], [2880, 1800], [1280, 800],
  [1920, 1200], [2340, 1080], [2400, 1080], [1334, 750], [2732, 2048], [1080, 1920], [720, 1280],
];
const RATIOS = [[16, 9], [4, 3], [8, 5], [3, 2], [5, 4], [7, 3], [2, 1], [1, 1], [5, 3], [9, 16], [3, 4], [2, 3], [16, 10], [21, 9], [32, 9]];
const RETRO = [[320, 180], [256, 224], [384, 216], [426, 240], [480, 270], [160, 144], [640, 360], [320, 240], [256, 144], [400, 225], [240, 160], [256, 240], [320, 200]];
const WHAT = ["game window", "texture", "screenshot", "level map image", "UI panel", "title screen", "sprite atlas", "cutscene video", "minimap", "loading screen"];

function randDims(rng, maxW = 4000) {
  if (rng.next() < 0.5) return rng.pick(SCREENS).slice();
  const [a0, b0] = rng.pick(RATIOS);
  const g = gcd(a0, b0);
  const a = a0 / g, b = b0 / g;
  const kMax = Math.max(2, Math.floor(maxW / Math.max(a, b)));
  const k = rng.int(Math.max(2, Math.ceil(64 / Math.max(a, b))), kMax);
  return [a * k, b * k];
}

function genRes(d, rng) {
  checkDifficulty(d);
  const what = rng.pick(WHAT);

  if (d === "easy") {
    const [W, H] = randDims(rng);
    if (rng.next() < 0.5) {
      const base = {
        prompt: `A ${what} is ${W} × ${H} pixels (width × height). How many pixels is that in total?`,
        explanation: `Total pixels = width × height.\n\n\`${W} × ${H}\` = **${W * H}**`,
        hints: ["The pixels form a grid, so the total is width × height.", `Work out ${W} × ${H} (in the calculator: \`_w * _h\`).`],
        given: givenFrom({ w: W, h: H }),
        params: { kind: "pixels", W, H },
      };
      return finishNum(base, W * H, "int", [W + H, 2 * (W + H), (W * H) / 2], rng);
    }
    const g = gcd(W, H);
    const ans = `${W / g}:${H / g}`;
    const base = {
      prompt: `A ${what} is ${W} × ${H} pixels (width × height). What is its aspect ratio, width:height, in simplest form? Type it like \`5:2\`.`,
      explanation: `Divide both sides by their greatest common factor.\n\n- The greatest common factor of ${W} and ${H} is ${g}.\n- ${W} ÷ ${g} = ${W / g} and ${H} ÷ ${g} = ${H / g}, so the ratio is **${ans}**.`,
      hints: [
        "Write width:height, then divide both numbers by the largest number that goes into both.",
        `The largest number that divides both ${W} and ${H} is ${g}. Divide both sides by it.`,
      ],
      given: givenFrom({ w: W, h: H }),
      params: { kind: "ratio", W, H },
    };
    const r = W / H;
    const others = RATIOS.map(([a, b]) => [a / gcd(a, b), b / gcd(a, b)])
      .filter(([a, b]) => a * H !== b * W)
      .sort((x, y) => Math.abs(x[0] / x[1] - r) - Math.abs(y[0] / y[1] - r))
      .map(([a, b]) => `${a}:${b}`);
    return finishText(base, ans, [`${H / g}:${W / g}`, ...others], rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["height", "mp", "intscale"]);
    if (kind === "height") {
      const [a0, b0] = rng.pick(RATIOS.filter(([x, y]) => x !== y));
      const g = gcd(a0, b0);
      const a = a0 / g, b = b0 / g;
      const W = a * rng.int(Math.ceil(120 / a), Math.floor(4000 / a));
      const H = (W * b) / a;
      const base = {
        prompt: `A ${what} uses a ${a}:${b} aspect ratio (width:height). If it is ${W} pixels wide, how many pixels tall is it?`,
        explanation: `Height = width × (second number ÷ first number).\n\n\`${W} × ${b} ÷ ${a}\` = **${H}**`,
        hints: [
          `The ratio says every ${a} pixels of width go with ${b} pixels of height, so height = width × ${b} ÷ ${a}.`,
          `Work out ${W} × ${b} ÷ ${a} (in the calculator: \`_w * _rb / _ra\`).`,
        ],
        given: givenFrom({ w: W, ra: a, rb: b }),
        params: { kind: "height", W, a, b },
      };
      return finishNum(base, H, "int", [(W * a) / b, W / a, W - (W / a)], rng);
    }
    if (kind === "mp") {
      let W, H;
      do [W, H] = randDims(rng); while (W * H < 20000);
      const exact = (W * H) / 1e6;
      const base = {
        prompt: `A ${what} is ${W} × ${H} pixels. How many megapixels is that, where 1 megapixel = 1,000,000 pixels? Round to 2 decimal places.`,
        explanation: `Megapixels = width × height ÷ 1,000,000.\n\n- \`${W} × ${H}\` = ${W * H} pixels\n- ${W * H} ÷ 1,000,000 ${result(exact, true, "MP")}`,
        hints: ["Find the total number of pixels (width × height), then divide by 1,000,000.", `Work out ${W} × ${H} ÷ 1000000 (in the calculator: \`_w * _h / 1e6\`).`],
        given: givenFrom({ w: W, h: H }),
        params: { kind: "mp", W, H },
      };
      return finishNum(base, exact, "2dp", [(W * H) / 1048576, (W * H) / 1e5, (W + H) / 1000], rng);
    }
    let W, H, SW, SH, sc;
    do {
      [W, H] = rng.pick(RETRO);
      [SW, SH] = rng.pick(SCREENS);
      sc = Math.min(Math.floor(SW / W), Math.floor(SH / H));
    } while (sc < 2);
    const base = {
      prompt:
        `A pixel-art game is drawn at ${W} × ${H} and scaled up by a whole number so every pixel stays square and sharp. ` +
        `What is the largest whole-number scale that fits on a ${SW} × ${SH} screen?`,
      explanation:
        `The scale has to fit in both directions, so take the smaller one and round down.\n\n` +
        `- Width: ${SW} ÷ ${W} ≈ ${num(SW / W)}\n- Height: ${SH} ÷ ${H} ≈ ${num(SH / H)}\n- The smaller, rounded down, is **${sc}**`,
      hints: [
        "The scaled game must fit across and down. Work out how many times it fits each way, take the smaller, and round down to a whole number.",
        `Work out ${SW} ÷ ${W} and ${SH} ÷ ${H} (in the calculator: \`min(_sw / _w, _sh / _h)\`).`,
      ],
      given: givenFrom({ w: W, h: H, sw: SW, sh: SH }),
      params: { kind: "intscale", W, H, SW, SH },
    };
    return finishNum(base, sc, "int", [Math.floor(SW / W), Math.floor(SH / H), Math.ceil(Math.min(SW / W, SH / H)), Math.max(Math.floor(SW / W), Math.floor(SH / H)) + 1], rng);
  }

  // Hard
  const kind = rng.pick(["fit", "fitsingle", "intmulti"]);
  if (kind === "intmulti") {
    let W, H, SW, SH, sc;
    do {
      [W, H] = rng.pick(RETRO);
      [SW, SH] = rng.pick(SCREENS);
      sc = Math.min(Math.floor(SW / W), Math.floor(SH / H));
    } while (sc < 2 || (SW - sc * W) % 2 || (SH - sc * H) % 2);
    const bx = (SW - sc * W) / 2, by = (SH - sc * H) / 2;
    const parts = [
      numPart("scale", "Scale", "Largest whole-number scale that fits", sc, "int", `Take the smaller of ${SW} ÷ ${W} and ${SH} ÷ ${H}, rounded down.`),
      numPart("side", "Side border", "Width of each left/right border, in pixels", bx, "int", `The scaled width is ${W} × the scale. Split what is left of ${SW} equally between the two sides.`),
      numPart("top", "Top border", "Height of each top/bottom border, in pixels", by, "int", `The scaled height is ${H} × the scale. Split what is left of ${SH} equally between top and bottom.`),
    ];
    return {
      prompt:
        `A ${W} × ${H} pixel-art game is scaled by the largest whole number that fits a ${SW} × ${SH} screen and centred, with black borders filling the rest.`,
      answerType: "multi",
      parts,
      explanation:
        `Find the whole-number scale, then share out the leftover space.\n\n` +
        `- Scale: min(${SW} ÷ ${W}, ${SH} ÷ ${H}) rounded down = **${sc}**\n` +
        `- Scaled size: ${sc * W} × ${sc * H}\n` +
        `- Side borders: (${SW} − ${sc * W}) ÷ 2 = **${bx}**\n- Top/bottom borders: (${SH} − ${sc * H}) ÷ 2 = **${by}**`,
      hints: ["First find the scale (it must fit both ways and be whole). Then the borders on each side share the leftover pixels equally."],
      given: givenFrom({ w: W, h: H, sw: SW, sh: SH }),
      params: { kind: "intmulti", W, H, SW, SH },
    };
  }
  // fit / fitsingle: scale a W×H image to fit SW×SH keeping its shape, as large as possible.
  let W, H, SW, SH, w, h, bar, tries = 0;
  for (;;) {
    tries++;
    [W, H] = randDims(rng, 2400);
    [SW, SH] = rng.pick(SCREENS);
    if (W * SH === H * SW) continue;
    if (W * SH > H * SW) { // wider than the screen: full width, bars top and bottom
      w = SW;
      h = (H * SW) / W;
      bar = (SH - h) / 2;
    } else {
      h = SH;
      w = (W * SH) / H;
      bar = (SW - w) / 2;
    }
    if (Number.isInteger(h) && Number.isInteger(w) && Number.isInteger(bar) && bar > 0) break;
    if (tries > 400) { // fall back to a known-good case
      [W, H, SW, SH, w, h, bar] = [1600, 1200, 1920, 1080, 1440, 1080, 240];
      break;
    }
  }
  const letter = w === SW;
  const intro = `A ${W} × ${H} ${what} is scaled to fit a ${SW} × ${SH} screen as large as possible without changing its shape, and centred. Black bars fill the rest.`;
  const scaleTxt = `the smaller of ${SW} ÷ ${W} and ${SH} ÷ ${H}`;
  const expl =
    `The scale is the smaller of the two ratios, so the picture touches two edges.\n\n` +
    `- ${SW} ÷ ${W} ≈ ${num(SW / W)} and ${SH} ÷ ${H} ≈ ${num(SH / H)}, so the scale is ${num(Math.min(SW / W, SH / H))}\n` +
    `- Scaled size: **${w}** × **${h}**\n` +
    `- The bars are ${letter ? "top and bottom" : "left and right"}: (${letter ? SH : SW} − ${letter ? h : w}) ÷ 2 = **${bar}** each`;
  if (kind === "fitsingle") {
    const askW = !letter; // ask for the side that doesn't fill the screen
    const ans = askW ? w : h;
    const base = {
      prompt: `${intro} How many pixels ${askW ? "wide" : "tall"} is the scaled picture?`,
      explanation: expl,
      hints: [
        `The scale is ${scaleTxt}, so the picture fills the screen one way and leaves bars the other way.`,
        `Multiply the ${askW ? `width ${W}` : `height ${H}`} by that scale (in the calculator: \`min(_sw / _w, _sh / _h) * ${askW ? "_w" : "_h"}\`).`,
      ],
      given: givenFrom({ w: W, h: H, sw: SW, sh: SH }),
      params: { kind: "fitone", W, H, SW, SH, askW },
    };
    const wrong = askW ? [W * Math.max(SW / W, SH / H), SW, (W * SW) / H] : [H * Math.max(SW / W, SH / H), SH, (H * SH) / W];
    return finishNum(base, ans, "int", wrong.map(Math.round), rng);
  }
  const parts = [
    numPart("w", "Scaled width", "Width of the scaled picture, in pixels", w, "int", `Multiply ${W} by the scale, ${scaleTxt}.`),
    numPart("h", "Scaled height", "Height of the scaled picture, in pixels", h, "int", `Multiply ${H} by the same scale.`),
    numPart("bar", "Bar size", "Thickness of each of the two black bars, in pixels", bar, "int", "The bars are on the sides the picture doesn't fill. Take the screen size minus the scaled size that way, and halve it."),
  ];
  return {
    prompt: intro,
    answerType: "multi",
    parts,
    explanation: expl,
    hints: [`The scale is ${scaleTxt}: the picture must fit both ways.`],
    given: givenFrom({ w: W, h: H, sw: SW, sh: SH }),
    params: { kind: "fit", W, H, SW, SH },
  };
}

// ---------------------------------------------------------------------------------------------
// Sprite sheets & textures

const ANIMS = ["walk", "run", "idle", "jump", "attack", "explosion", "coin spin", "torch flicker", "swim", "dash", "death", "cast"];
const FRAME_SIZES = [16, 24, 32, 48, 64, 96, 128];
const FORMATS = [
  { name: "RGBA8", bpp: 4, txt: "RGBA, 4 bytes per pixel" },
  { name: "RGB8", bpp: 3, txt: "RGB, 3 bytes per pixel" },
  { name: "RGB565", bpp: 2, txt: "16-bit colour, 2 bytes per pixel" },
  { name: "R8", bpp: 1, txt: "greyscale, 1 byte per pixel" },
];
const POW2 = [32, 64, 128, 256, 512, 1024, 2048, 4096];
const MIB = "1 MiB = 1,048,576 bytes";
const ORDER = "Frames are numbered from 0, left to right along each row, then row by row from the top; columns and rows also count from 0.";

function genSprites(d, rng) {
  checkDifficulty(d);
  const anim = rng.pick(ANIMS);

  if (d === "easy") {
    const kind = rng.pick(["frames", "frames", "bytes"]);
    if (kind === "frames") {
      const fw = rng.pick(FRAME_SIZES);
      const fh = rng.next() < 0.7 ? fw : rng.pick(FRAME_SIZES);
      let C, R;
      do {
        C = rng.int(2, 12);
        R = rng.int(1, 8);
      } while (C === R);
      const W = C * fw, H = R * fh;
      const ask = rng.pick(["total", "total", "cols", "rows"]);
      const ans = ask === "total" ? C * R : ask === "cols" ? C : R;
      const q = ask === "total" ? "How many frames does the sheet hold?" : ask === "cols" ? "How many frames fit across one row (columns)?" : "How many rows of frames are there?";
      const base = {
        prompt: `A ${anim} sprite sheet is ${W} × ${H} pixels and is packed edge to edge with ${fw} × ${fh} frames (no gaps). ${q}`,
        explanation:
          `Divide the sheet by the frame size in each direction.\n\n- Columns: ${W} ÷ ${fw} = ${C}\n- Rows: ${H} ÷ ${fh} = ${R}` +
          (ask === "total" ? `\n- Frames: ${C} × ${R} = **${ans}**` : `\n\nSo the answer is **${ans}**.`),
        hints: ask === "total"
          ? ["Frames across = sheet width ÷ frame width, and frames down = sheet height ÷ frame height.", `Work out ${W} ÷ ${fw} and ${H} ÷ ${fh}, then multiply them (in the calculator: \`(_w / _fw) * (_h / _fh)\`).`]
          : ask === "cols"
            ? ["A row is as wide as the sheet, so divide the sheet width by the frame width.", `Work out ${W} ÷ ${fw} (in the calculator: \`_w / _fw\`).`]
            : ["The rows stack down the sheet, so divide the sheet height by the frame height.", `Work out ${H} ÷ ${fh} (in the calculator: \`_h / _fh\`).`],
        given: givenFrom({ w: W, h: H, fw, fh }),
        params: { kind: "frames", W, H, fw, fh, ask },
      };
      const wrong = ask === "total" ? [C + R, (W * H) / fw, 2 * C * R] : ask === "cols" ? [R, W / fh, C * R] : [C, H / fw, C * R];
      return finishNum(base, ans, "int", wrong, rng);
    }
    const W = rng.pick(POW2.slice(0, 6)), H = rng.next() < 0.6 ? W : rng.pick(POW2.slice(0, 6));
    const f = rng.pick(FORMATS);
    const ans = W * H * f.bpp;
    const base = {
      prompt: `An uncompressed ${W} × ${H} texture is stored as ${f.name} (${f.txt}). How many bytes does it take?`,
      explanation: `Bytes = width × height × bytes per pixel.\n\n- \`${W} × ${H}\` = ${W * H} pixels\n- ${W * H} × ${f.bpp} = **${ans}** bytes`,
      hints: ["Count the pixels (width × height), then multiply by how many bytes each pixel uses.", `Work out ${W} × ${H} × ${f.bpp} (in the calculator: \`_w * _h * _bpp\`).`],
      given: givenFrom({ w: W, h: H, bpp: f.bpp }),
      params: { kind: "bytes", W, H, bpp: f.bpp },
    };
    return finishNum(base, ans, "int", [W * H, W * H * f.bpp * 8, (W + H) * f.bpp], rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["index", "pos", "frameat", "mib"]);
    if (kind === "mib") {
      let W, H, f, bytes, exact;
      do { // skip half-step ties like 0.125 MiB, so exactly one 2-decimal answer is right
        W = rng.next() < 0.7 ? rng.pick(POW2.slice(2)) : rng.pick([1920, 1280, 2560, 1600, 800, 3840, 1366]);
        H = POW2.includes(W) ? (rng.next() < 0.6 ? W : rng.pick(POW2.slice(2))) : rng.pick([1080, 720, 1440, 900, 600, 2160, 768]);
        f = rng.pick(FORMATS);
        bytes = W * H * f.bpp;
        exact = bytes / 1048576;
      } while (Math.abs(((exact * 100) % 1) - 0.5) < 1e-6);
      const base = {
        prompt: `An uncompressed ${W} × ${H} texture is stored as ${f.name} (${f.txt}). How many MiB of memory does it use, where ${MIB}? Round to 2 decimal places.`,
        explanation: `Work out the bytes, then divide by 1,048,576.\n\n- \`${W} × ${H} × ${f.bpp}\` = ${bytes} bytes\n- ${bytes} ÷ 1,048,576 ${result(exact, true, "MiB")}`,
        hints: ["Bytes = width × height × bytes per pixel. Then convert to MiB by dividing by 1,048,576 (= 1024 × 1024).", `Work out ${W} × ${H} × ${f.bpp} ÷ 1048576 (in the calculator: \`_w * _h * _bpp / 1048576\`).`],
        given: givenFrom({ w: W, h: H, bpp: f.bpp }),
        params: { kind: "mib", W, H, bpp: f.bpp },
      };
      return finishNum(base, exact, "2dp", [bytes / 1e6, (W * H) / 1048576, (bytes * 8) / 1048576], rng);
    }
    let C, R;
    do {
      C = rng.int(3, 12);
      R = rng.int(2, 8);
    } while (C === R);
    let i, col, row;
    do {
      i = rng.int(C + 1, C * R - 1);
      col = i % C;
      row = Math.floor(i / C);
    } while (col === row || col === 0);
    if (kind === "index") {
      const parts = [
        numPart("col", "Column", "Column of the frame (from 0)", col, "int", `The column is the remainder when ${i} is divided by ${C}.`),
        numPart("row", "Row", "Row of the frame (from 0)", row, "int", `The row is how many whole times ${C} goes into ${i}.`),
      ];
      return {
        prompt: `A ${anim} animation is packed into a sprite sheet with ${C} columns and ${R} rows. ${ORDER} Which column and row hold frame ${i}?`,
        answerType: "multi",
        parts,
        explanation: `Each row holds ${C} frames, so divide the index by ${C}.\n\n- ${i} ÷ ${C} = ${row} remainder ${col}\n- Row = **${row}**, column = **${col}**`,
        hints: [`Each full row holds ${C} frames. Divide the frame number by ${C}: the whole part and the remainder tell you the position.`],
        given: givenFrom({ i, cols: C }),
        params: { kind: "index", i, C },
      };
    }
    const fw = rng.pick(FRAME_SIZES);
    const fh = rng.next() < 0.7 ? fw : rng.pick(FRAME_SIZES);
    if (kind === "pos") {
      const parts = [
        numPart("x", "x", "x of the frame's top-left corner, in pixels", col * fw, "int", `Find the column (${i} ÷ ${C} remainder), then multiply it by the frame width ${fw}.`),
        numPart("y", "y", "y of the frame's top-left corner, in pixels", row * fh, "int", `Find the row (whole times ${C} goes into ${i}), then multiply it by the frame height ${fh}.`),
      ];
      return {
        prompt:
          `A ${anim} sprite sheet has ${C} columns of ${fw} × ${fh} frames, packed edge to edge from the top-left corner (0, 0), with y counting down. ${ORDER} ` +
          `Where is the top-left pixel of frame ${i}?`,
        answerType: "multi",
        parts,
        explanation:
          `Find the frame's column and row, then multiply by the frame size.\n\n- ${i} ÷ ${C} = ${row} remainder ${col}, so column ${col}, row ${row}\n` +
          `- x = ${col} × ${fw} = **${col * fw}**\n- y = ${row} × ${fh} = **${row * fh}**`,
        hints: [`First find the column and row: divide ${i} by ${C}. The remainder is the column and the whole part is the row.`],
        given: givenFrom({ i, cols: C, fw, fh }),
        params: { kind: "pos", i, C, fw, fh },
      };
    }
    // frameat: (col,row) -> index
    const base = {
      prompt: `A ${anim} sprite sheet has ${C} columns and ${R} rows. ${ORDER} What is the number of the frame in column ${col}, row ${row}?`,
      explanation: `Every row before it is full, so count those frames and add the column.\n\n\`${row} × ${C} + ${col}\` = **${i}**`,
      hints: [`There are ${row} full rows above this frame, each with ${C} frames. Then add how far along the row it is.`, `Work out ${row} × ${C} + ${col} (in the calculator: \`_row * _cols + _col\`).`],
      given: givenFrom({ col, row, cols: C }),
      params: { kind: "frameat", col, row, C, R },
    };
    return finishNum(base, i, "int", [col * R + row, i + 1, col * C + row, row * R + col], rng);
  }

  // Hard
  const kind = rng.pick(["pad", "padcount", "mip", "anim"]);
  if (kind === "mip") {
    const W = rng.pick(POW2.slice(1)), H = rng.next() < 0.6 ? W : rng.pick(POW2.slice(1));
    const f = rng.pick(FORMATS);
    let total = 0, w = W, h = H, levels = 0;
    for (;;) {
      total += w * h * f.bpp;
      levels++;
      if (w === 1 && h === 1) break;
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
    const exact = total / 1048576;
    const baseBytes = W * H * f.bpp;
    const base = {
      prompt:
        `A ${W} × ${H} texture (${f.name}, ${f.txt}) has a full mipmap chain: each level halves the width and the height (never below 1) until the 1 × 1 level. ` +
        `How many MiB do all the levels use together, where ${MIB}? Round to 2 decimal places.`,
      explanation:
        `Add the bytes of every level, then convert.\n\n- Level 0: ${W} × ${H} × ${f.bpp} = ${baseBytes} bytes\n` +
        `- There are ${levels} levels in all; their total is ${total} bytes\n- ${total} ÷ 1,048,576 ${result(exact, true, "MiB")}`,
      hints: [
        "List the levels: halve the width and height each time (a side that reaches 1 stays 1) until you reach 1 × 1. Each level uses width × height × bytes per pixel.",
        `Level 0 is ${W} × ${H}, level 1 is ${Math.max(1, W / 2)} × ${Math.max(1, H / 2)}, and so on. Add all the levels' bytes, then divide by 1,048,576. (A full chain adds about a third to the base size.)`,
      ],
      given: givenFrom({ w: W, h: H, bpp: f.bpp }),
      params: { kind: "mip", W, H, bpp: f.bpp },
    };
    return finishNum(base, exact, "2dp", [baseBytes / 1048576, (2 * baseBytes) / 1048576, total / 1e6], rng);
  }
  if (kind === "anim") {
    let C, n, fps, tms, idx;
    do {
      C = rng.int(3, 10);
      n = rng.int(C + 2, Math.min(C * 6, 48));
      fps = rng.pick([6, 8, 10, 12, 15, 20, 24, 30]);
      tms = 10 * rng.int(20, 900);
      idx = Math.floor((tms * fps) / 1000) % n;
    } while ((tms * fps) % 1000 === 0 || idx % C === Math.floor(idx / C) || idx < C);
    const t = tms / 1000;
    const shown = Math.floor((tms * fps) / 1000);
    const col = idx % C, row = Math.floor(idx / C);
    const parts = [
      numPart("frame", "Frame", "Which frame number is showing?", idx, "int", `Frames shown so far = ${num(t)} × ${fps}, rounded down. The animation loops every ${n} frames, so take the remainder after dividing by ${n}.`),
      numPart("col", "Column", "Column of that frame (from 0)", col, "int", `Divide the frame number by ${C}; the remainder is the column.`),
      numPart("row", "Row", "Row of that frame (from 0)", row, "int", `Divide the frame number by ${C}; the whole part is the row.`),
    ];
    return {
      prompt:
        `A looping ${anim} animation has ${n} frames (numbered 0 to ${n - 1}) packed into a sheet ${C} columns wide. ${ORDER} ` +
        `It plays at ${fps} frames per second, starting with frame 0 at time 0. Which frame is on screen at ${num(t)} s, and where is it on the sheet?`,
      answerType: "multi",
      parts,
      explanation:
        `Count the frames that have played, wrap around the loop, then find the position.\n\n` +
        `- ${num(t)} × ${fps} = ${num(t * fps)}, rounded down: ${shown} frames have finished\n` +
        `- ${shown} mod ${n} = **${idx}**\n- ${idx} ÷ ${C} = ${row} remainder ${col}: column **${col}**, row **${row}**`,
      hints: ["First work out how many frames have played (time × fps, rounded down), then wrap it around the loop with the remainder."],
      given: givenFrom({ t, fps, n, cols: C }),
      params: { kind: "anim", tms, fps, n, C },
    };
  }
  // padded sheets: margin m on every edge, spacing s between neighbouring frames.
  const fw = rng.pick(FRAME_SIZES.slice(0, 5));
  const fh = rng.next() < 0.7 ? fw : rng.pick(FRAME_SIZES.slice(0, 5));
  const m = rng.int(1, 4), s = rng.int(1, 4);
  const pad = `It has a margin of ${m} px on every edge and ${s} px of spacing between neighbouring frames (none after the last).`;
  if (kind === "padcount") {
    let W, H, C, R;
    do {
      W = 16 * rng.int(8, 64);
      H = 16 * rng.int(4, 48);
      C = Math.floor((W - 2 * m + s) / (fw + s));
      R = Math.floor((H - 2 * m + s) / (fh + s));
    } while (C < 2 || R < 1 || C > 40 || C * R > 600 || C === W / fw);
    const ans = C * R;
    const base = {
      prompt: `A ${anim} sprite sheet is ${W} × ${H} pixels and holds ${fw} × ${fh} frames. ${pad} How many whole frames fit on the sheet?`,
      explanation:
        `n frames across need 2 × margin + n × width + (n − 1) × spacing pixels, so n = floor((W − 2m + s) ÷ (fw + s)).\n\n` +
        `- Across: (${W} − ${2 * m} + ${s}) ÷ (${fw} + ${s}) = ${W - 2 * m + s} ÷ ${fw + s} → ${C}\n` +
        `- Down: (${H} − ${2 * m} + ${s}) ÷ (${fh} + ${s}) = ${H - 2 * m + s} ÷ ${fh + s} → ${R}\n- Frames: ${C} × ${R} = **${ans}**`,
      hints: [
        "n frames in a row take 2 × margin + n × frame width + (n − 1) × spacing pixels. Find the largest n that fits, across and down.",
        `Across: floor((${W} − 2 × ${m} + ${s}) ÷ (${fw} + ${s})). Down: the same with ${H} and ${fh}. Then multiply.`,
      ],
      given: givenFrom({ w: W, h: H, fw, fh, m, s }),
      params: { kind: "padcount", W, H, fw, fh, m, s },
    };
    return finishNum(base, ans, "int", [Math.floor(W / fw) * Math.floor(H / fh), Math.floor(W / (fw + s)) * Math.floor(H / (fh + s)), C * R + C], rng);
  }
  let C, i, col, row;
  do {
    C = rng.int(3, 10);
    i = rng.int(C + 1, C * 6);
    col = i % C;
    row = Math.floor(i / C);
  } while (col === 0 || col === row);
  const x = m + col * (fw + s), y = m + row * (fh + s);
  const parts = [
    numPart("x", "x", "x of the frame's top-left pixel", x, "int", `Find the column of frame ${i} (remainder of ${i} ÷ ${C}). Then x = ${m} + column × (${fw} + ${s}).`),
    numPart("y", "y", "y of the frame's top-left pixel", y, "int", `Find the row of frame ${i} (whole times ${C} goes into ${i}). Then y = ${m} + row × (${fh} + ${s}).`),
  ];
  return {
    prompt:
      `A ${anim} sprite sheet has ${C} columns of ${fw} × ${fh} frames. ${pad} ${ORDER} ` +
      `Pixel (0, 0) is the sheet's top-left corner, with y counting down. Where is the top-left pixel of frame ${i}?`,
    answerType: "multi",
    parts,
    explanation:
      `Find the column and row, then step over the margin and each earlier frame plus its spacing.\n\n` +
      `- ${i} ÷ ${C} = ${row} remainder ${col}: column ${col}, row ${row}\n` +
      `- x = ${m} + ${col} × (${fw} + ${s}) = **${x}**\n- y = ${m} + ${row} × (${fh} + ${s}) = **${y}**`,
    hints: ["Each frame before this one in the row takes its width plus one spacing. Start from the margin, not from 0."],
    given: givenFrom({ i, cols: C, fw, fh, m, s }),
    params: { kind: "pad", i, C, fw, fh, m, s },
  };
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "hex-rgb") return genHex(difficulty, rng);
  if (subtopic === "blending") return genBlend(difficulty, rng);
  if (subtopic === "resolution") return genRes(difficulty, rng);
  if (subtopic === "sprites") return genSprites(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// Independent verification

const VD = "0123456789abcdef";
function vByte(str) {
  if (typeof str !== "string" || str.length !== 2) return -1;
  let v = 0;
  for (const chr of str.toLowerCase()) {
    const dgt = VD.indexOf(chr);
    if (dgt < 0) return -1;
    v = v * 16 + dgt;
  }
  return v;
}
function vColour(str) {
  const t = String(str ?? "").trim();
  if (t.length !== 7 || t[0] !== "#") return null;
  const out = [vByte(t.slice(1, 3)), vByte(t.slice(3, 5)), vByte(t.slice(5, 7))];
  return out.some((v) => v < 0) ? null : out;
}
function vShort(str) { // "#3AC" -> [0x33, 0xAA, 0xCC], digit by digit
  const t = String(str ?? "");
  if (t.length !== 4 || t[0] !== "#") return null;
  const out = [];
  for (const chr of t.slice(1).toLowerCase()) {
    const dgt = VD.indexOf(chr);
    if (dgt < 0) return null;
    out.push(dgt * 16 + dgt);
  }
  return out;
}
const numLike = (x) =>
  (typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)));
const intIs = (v) => (x) => numLike(x) && Number(x) === v;
// Exactly one 2-decimal value passes: half-step ties fail (the engine regenerates).
const dp2Is = (v) => (x) => {
  if (!numLike(x)) return false;
  const n = Number(x);
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 && Math.abs(n - v) < 0.005 - 1e-7;
};
// Integer blend check: the answer R must satisfy den·R − den/2 ≤ N < den·R + den/2 (halves round up).
const roundsTo = (N, den) => (x) => numLike(x) && Number.isInteger(Number(x)) && 2 * den * Number(x) - den <= 2 * N && 2 * N < 2 * den * Number(x) + den;
const colourIs = (c) => (x) => {
  const got = vColour(x);
  return !!got && got.every((v, i) => v === c[i]);
};
const listIs = (c) => (x) => {
  if (typeof x !== "string") return false;
  const bits = x.split(",").map((s) => s.trim());
  return bits.length === c.length && bits.every((b, i) => /^\d+$/.test(b) && Number(b) === c[i]);
};
const coprime = (a, b) => {
  for (let f = 2; f <= Math.min(a, b); f++) if (a % f === 0 && b % f === 0) return false;
  return true;
};

// Expected checkers per part id ("_" for single questions), computed without the generator's code paths.
function checkers(p) {
  switch (p.kind) {
    case "h2d": return { _: intIs(vByte(p.hex)) };
    case "d2h": return { _: (x) => typeof x === "string" && x.trim().length === 2 && vByte(x.trim()) === p.v };
    case "hex2ch": { const c = vColour(p.hex); return c && { _: intIs(c[p.k]) }; }
    case "rgb2hex": return { _: colourIs(p.c) };
    case "hex2rgb": { const c = vColour(p.hex); return c && { _: listIs(c) }; }
    case "short": { const c = vShort(p.short); return c && { _: colourIs(c) }; }
    case "shortch": { const c = vShort(p.short); return c && { _: intIs(c[p.k]) }; }
    case "invert": { const c = vColour(p.hex); return c && { _: colourIs(c.map((v) => 255 - v)) }; }
    case "gray": { const c = vColour(p.hex); return c && { _: roundsTo(c[0] + c[1] + c[2], 3) }; }
    case "luma": return { _: roundsTo(299 * p.c[0] + 587 * p.c[1] + 114 * p.c[2], 1000) };
    case "hexmulti": { const c = vColour(p.hex); return c && { red: intIs(c[0]), green: intIs(c[1]), blue: intIs(c[2]) }; }
    case "blend": return { _: roundsTo(p.p * p.src + (100 - p.p) * p.dst, 100) };
    case "blendhex": {
      const s = vColour(p.src), t = vColour(p.dst);
      return s && t && { _: roundsTo(p.p * s[p.k] + (100 - p.p) * t[p.k], 100) };
    }
    case "blend3": {
      const want = p.src.map((v, i) => { const N = p.p * v + (100 - p.p) * p.dst[i]; return Math.floor((2 * N + 100) / 200); });
      return { _: listIs(want) };
    }
    case "blendmulti": {
      const s = vColour(p.src), t = vColour(p.dst);
      if (!s || !t) return null;
      return { red: roundsTo(p.p * s[0] + (100 - p.p) * t[0], 100), green: roundsTo(p.p * s[1] + (100 - p.p) * t[1], 100), blue: roundsTo(p.p * s[2] + (100 - p.p) * t[2], 100) };
    }
    case "byte": return { _: roundsTo(p.A * p.src + (255 - p.A) * p.dst, 255) };
    case "layers": return { _: roundsTo(100 * p.p2 * p.s2 + (100 - p.p2) * (p.p1 * p.s1 + (100 - p.p1) * p.bg), 10000) };
    case "alpha": // substitute the candidate opacity back in, in hundredths
      return {
        _: (x) => {
          if (!numLike(x)) return false;
          const h = Number(x) * 100;
          if (Math.abs(h - Math.round(h)) > 1e-6) return false;
          const P = Math.round(h);
          return P >= 0 && P <= 100 && P * p.src + (100 - P) * p.dst === 100 * p.res;
        },
      };
    case "pixels": { let t = 0; for (let r = 0; r < p.H; r++) t += p.W; return { _: intIs(t) }; }
    case "ratio":
      return {
        _: (x) => {
          const mm = typeof x === "string" && x.trim().match(/^(\d+)\s*:\s*(\d+)$/);
          if (!mm) return false;
          const a = Number(mm[1]), b = Number(mm[2]);
          return a > 0 && b > 0 && a * p.H === b * p.W && coprime(a, b);
        },
      };
    case "height": return { _: (x) => numLike(x) && Number(x) * p.a === p.W * p.b && Number.isInteger(Number(x)) };
    case "mp": // x megapixels × 1,000,000 must be within half a hundredth of W × H
      return { _: (x) => numLike(x) && Math.abs(Number(x) * 100 - Math.round(Number(x) * 100)) < 1e-6 && Math.abs(Number(x) * 1e6 - p.W * p.H) < (0.005 - 1e-7) * 1e6 };
    case "intscale": { // largest k with k·W ≤ SW and k·H ≤ SH, by counting up
      let k = 0;
      while ((k + 1) * p.W <= p.SW && (k + 1) * p.H <= p.SH) k++;
      return { _: intIs(k) };
    }
    case "intmulti": {
      let k = 0;
      while ((k + 1) * p.W <= p.SW && (k + 1) * p.H <= p.SH) k++;
      return {
        scale: intIs(k),
        side: (x) => numLike(x) && 2 * Number(x) + k * p.W === p.SW,
        top: (x) => numLike(x) && 2 * Number(x) + k * p.H === p.SH,
      };
    }
    case "fit":
    case "fitone": {
      // Cross-multiplied: the picture keeps W:H, fits inside, and touches one pair of edges.
      const okW = (w) => numLike(w) && Number.isInteger(Number(w)) && Number(w) > 0 && Number(w) <= p.SW;
      const hOf = (w) => (Number(w) * p.H) / p.W;
      const fits = (w) => okW(w) && hOf(w) <= p.SH && (Number(w) === p.SW || hOf(w) === p.SH);
      // The fitting width w* is the one candidate in [1, SW] that passes `fits`.
      let wStar = null;
      for (let w = p.SW; w >= 1; w--) if (fits(w)) { wStar = w; break; }
      if (wStar === null) return null;
      const hStar = hOf(wStar);
      if (!Number.isInteger(hStar)) return null;
      const barTimes2 = wStar === p.SW ? p.SH - hStar : p.SW - wStar;
      if (p.kind === "fitone") return { _: intIs(p.askW ? wStar : hStar) };
      return { w: intIs(wStar), h: intIs(hStar), bar: (x) => numLike(x) && 2 * Number(x) === barTimes2 };
    }
    case "frames": {
      let C = 0, R = 0;
      for (let x = 0; x + p.fw <= p.W; x += p.fw) C++;
      for (let y = 0; y + p.fh <= p.H; y += p.fh) R++;
      return { _: intIs(p.ask === "total" ? C * R : p.ask === "cols" ? C : R) };
    }
    case "bytes": // divide back: bytes ÷ bpp ÷ width must give the height
      return { _: (x) => numLike(x) && Number.isInteger(Number(x)) && Number(x) % p.bpp === 0 && Number(x) / p.bpp / p.W === p.H };
    case "mib": return { _: (x) => numLike(x) && Math.abs(Number(x) * 1048576 - p.W * p.H * p.bpp) < (0.005 - 1e-7) * 1048576 && Math.abs(Number(x) * 100 - Math.round(Number(x) * 100)) < 1e-6 };
    case "index":
    case "pos":
    case "frameat":
    case "anim":
    case "pad": {
      // Walk the grid frame by frame.
      const walk = (target, C) => {
        let col = 0, row = 0;
        for (let f = 0; f < target; f++) { col++; if (col === C) { col = 0; row++; } }
        return [col, row];
      };
      if (p.kind === "index") { const [c, r] = walk(p.i, p.C); return { col: intIs(c), row: intIs(r) }; }
      if (p.kind === "pos") { const [c, r] = walk(p.i, p.C); return { x: intIs(c * p.fw), y: intIs(r * p.fh) }; }
      if (p.kind === "pad") {
        const [c, r] = walk(p.i, p.C);
        let x = p.m, y = p.m;
        for (let k = 0; k < c; k++) x += p.fw + p.s;
        for (let k = 0; k < r; k++) y += p.fh + p.s;
        return { x: intIs(x), y: intIs(y) };
      }
      if (p.kind === "frameat") {
        let f = 0;
        while (f < p.C * p.R) { const [c, r] = walk(f, p.C); if (c === p.col && r === p.row) break; f++; }
        return { _: intIs(f) };
      }
      // anim: step through time in whole frames; the frame changes every 1000/fps ms.
      let played = 0;
      while ((played + 1) * 1000 <= p.tms * p.fps) played++;
      if (played * 1000 === p.tms * p.fps) return null; // on a frame boundary: ambiguous
      let shown = 0;
      for (let k = 0; k < played; k++) shown = shown + 1 === p.n ? 0 : shown + 1;
      const [c, r] = walk(shown, p.C);
      return { frame: intIs(shown), col: intIs(c), row: intIs(r) };
    }
    case "padcount": {
      const fit = (size, f) => { let n = 0; while (p.m + (n + 1) * f + n * p.s + p.m <= size) n++; return n; };
      return { _: intIs(fit(p.W, p.fw) * fit(p.H, p.fh)) };
    }
    case "mip": {
      let total = 0;
      const levels = Math.round(Math.log2(Math.max(p.W, p.H)));
      for (let k = 0; k <= levels; k++) total += Math.max(1, p.W >> k) * Math.max(1, p.H >> k) * p.bpp;
      return { _: (x) => numLike(x) && Math.abs(Number(x) * 1048576 - total) < (0.005 - 1e-7) * 1048576 && Math.abs(Number(x) * 100 - Math.round(Number(x) * 100)) < 1e-6 };
    }
    default: return null;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  const chk = checkers(p);
  if (!chk) return false;
  if (question.answerType === "multi") {
    const parts = question.parts;
    if (!Array.isArray(parts) || !answer || typeof answer !== "object") return false;
    if (parts.length !== Object.keys(chk).length) return false;
    return parts.every((pt) => {
      const f = chk[pt.id];
      if (!f) return false;
      if (pt.answerType === "choice" && (!Array.isArray(pt.choices) || pt.choices.filter(f).length !== 1)) return false;
      return f(answer[pt.id]);
    });
  }
  const f = chk._;
  if (!f) return false;
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (ch.filter((c) => f(c)).length !== 1) return false;
    return ch.includes(String(answer)) && f(String(answer));
  }
  return f(answer);
}
