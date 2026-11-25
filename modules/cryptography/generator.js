// Cryptography Basics generator. Uses only the seeded rng passed in by the engine.
// Generation uses letter-index arithmetic, the extended Euclidean algorithm and square-and-multiply.
// verify() re-derives every answer another way: rotated-alphabet lookup tables (a Vigenère tableau),
// decoding the candidate back, brute-force search over every shift / inverse, counting coprimes
// for φ(n), BigInt powers, and residual checks with half-step tie rejection for rounded times.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Round half away from zero; the 1e-9 nudge absorbs binary error (2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Shortest form, up to 4 decimals; never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// Thousands separators for prompts and explanations (never in calculator text or `given`).
function commas(n) {
  const [i, f] = num(n).split(".");
  const s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${s}.${f}` : s;
}

// True when x sits on (or next to) a half-cent boundary, where 2-decimal rounding is ambiguous.
const nearTie = (x) => Math.abs(Math.abs(x * 100) % 1 - 0.5) < 1e-6;

// Four distinct options from the correct string and candidate wrong strings.
function textChoices(correct, candidates, rng) {
  const seen = new Set([correct]);
  const out = [];
  for (const c of candidates) {
    if (out.length >= 3 || typeof c !== "string" || !c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  if (out.length < 3) return null;
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

function fourDistinct(q) {
  return Array.isArray(q.choices) && q.choices.length === 4 && new Set(q.choices.map(String)).size === 4
    && q.choices.map(String).includes(String(q.answer));
}

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

// ---------------------------------------------------------------------------------------------
// Words (plain, family-friendly, upper case, letters only)

const SHORT = ["CAT", "DOG", "SUN", "HAT", "MAP", "BOX", "CUP", "KEY", "OWL", "FOX", "BEE", "EGG", "PEN", "BUS", "JAM", "ANT", "BAT", "COW", "PIG", "HEN",
  "TREE", "BOOK", "CAKE", "FISH", "FROG", "KITE", "LAMP", "MILK", "MOON", "NEST", "RAIN", "ROSE", "SHIP", "SNOW", "STAR", "BELL", "DUCK", "GOAT", "LEAF", "WOLF"];
const MID = ["APPLE", "BREAD", "CHAIR", "CLOUD", "HONEY", "LEMON", "MUSIC", "OCEAN", "PIZZA", "RIVER", "ROBOT", "STORM", "TIGER", "TRAIN", "ZEBRA", "SHELL", "PLANT", "GRAPE", "HOUSE", "TORCH",
  "BRIDGE", "CASTLE", "DRAGON", "FOREST", "GARDEN", "ISLAND", "JUNGLE", "KITTEN", "MARKET", "ORANGE", "PLANET", "RABBIT", "SILVER", "WINTER", "YELLOW", "PENCIL", "ROCKET", "SUMMER", "TURTLE", "WINDOW"];
const LONG = ["CANDLE", "PUZZLE", "BASKET", "FLOWER", "HAMMER", "MONKEY", "PEANUT", "SECRET", "PIRATE", "MAGNET", "COOKIE", "LADDER", "PARROT", "VIOLIN", "WALRUS", "ANCHOR", "BUTTON", "DONKEY", "FALCON", "GUITAR",
  "HELMET", "JACKET", "KETTLE", "LIZARD", "MEADOW", "NAPKIN", "PEPPER", "RADISH", "SADDLE", "TICKET", "VELVET", "WAFFLE", "BALLOON", "BLANKET", "CABBAGE", "DOLPHIN", "LANTERN", "PENGUIN", "RAINBOW", "TEACHER"];
// Same-length pools for "which word was it?" questions.
const BY_LEN = {};
for (const w of [...MID, ...LONG]) (BY_LEN[w.length] ||= []).push(w);

const KEYS2 = ["GO", "UP", "HI", "BE", "DO", "IT", "ME", "WE"];
const KEYS3 = ["SUN", "KEY", "CAT", "SKY", "BEE", "RED", "ICE", "OAK", "FUN", "JOY", "MAP", "TOY"];
const KEYS4 = ["MOON", "BLUE", "STAR", "LION", "CODE", "GOLD", "KING", "WAVE", "RUBY", "SNOW", "BIRD", "TIDE"];
const KEYS5 = ["LIGHT", "MAPLE", "OCEAN", "TULIP", "CROWN", "PEARL"];

// ---------------------------------------------------------------------------------------------
// Generation maths (index arithmetic)

const idx = (c) => c.charCodeAt(0) - 65;
const chr = (i) => String.fromCharCode((((i % 26) + 26) % 26) + 65);
const caesar = (w, k) => [...w].map((c) => chr(idx(c) + k)).join("");
const vig = (w, key, sign = 1) => [...w].map((c, i) => chr(idx(c) + sign * idx(key[i % key.length]))).join("");

// Key letter repeated under the word: "SUNSU".
const keyStream = (w, key) => [...w].map((_, i) => key[i % key.length]).join("");

// ---------------------------------------------------------------------------------------------
// Verify-only maths (rotated alphabets)

const rotRow = (s) => ALPHA.slice(s) + ALPHA.slice(0, s);
function vCaesarEnc(w, k) {
  const row = rotRow(((k % 26) + 26) % 26);
  let out = "";
  for (const c of w) { const p = ALPHA.indexOf(c); if (p < 0) return null; out += row[p]; }
  return out;
}
function vVigEnc(w, key) {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const row = rotRow(ALPHA.indexOf(key[i % key.length]));
    const p = ALPHA.indexOf(w[i]);
    if (p < 0) return null;
    out += row[p];
  }
  return out;
}
const upper = (a) => String(a ?? "").trim().toUpperCase().replace(/\s+/g, "");

const SHIFT_NOTE = (k) => `Shift each letter **${k}** place${k === 1 ? "" : "s"} forward in the alphabet, wrapping from Z back to A.`;
const VIG_NOTE = "Take A = 0, B = 1, …, Z = 25; each key letter shifts the plaintext letter under it forward by its value, the key repeats, and letters wrap from Z to A.";

// =============================================================================================
// Subtopic: Caesar cipher

function caesarSteps(w, k, dir) {
  // dir 1 = encode (forward), -1 = decode (back)
  const pairs = [...w].map((c) => `${c}→${chr(idx(c) + dir * k)}`);
  return pairs.join(", ");
}

function genCaesar(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["enc", "enc", "dec", "letter"]);
    const k = rng.int(1, 6);
    if (kind === "letter") {
      const p = rng.pick(ALPHA.split(""));
      const correct = chr(idx(p) + k);
      const c = textChoices(correct, [chr(idx(p) - k), chr(idx(p) + k + 1), chr(idx(p) + k - 1)], rng);
      return {
        prompt: `A Caesar cipher uses a shift of **${k}**. ${SHIFT_NOTE(k)} Which letter does **${p}** become?`,
        answerType: "choice", ...c,
        explanation: `Count ${k} letter${k === 1 ? "" : "s"} forward from ${p}, wrapping after Z.\n\n- ${p} is letter number ${idx(p)} (A = 0).\n- ${idx(p)} + ${k} = ${idx(p) + k}${idx(p) + k > 25 ? `, and ${idx(p) + k} − 26 = ${idx(p) + k - 26}` : ""}\n- That is **${correct}**.`,
        hints: [`Count forward ${k} place${k === 1 ? "" : "s"} from ${p}. Forward means towards Z.`, "If you pass Z, carry on from A."],
        params: { kind: "c-letter", p, k },
      };
    }
    const w = rng.pick(SHORT);
    if (kind === "enc") {
      const ans = caesar(w, k);
      return {
        prompt: `Encode the word **${w}** with a Caesar cipher, shift **${k}**. ${SHIFT_NOTE(k)} Type the encoded word.`,
        answerType: "text", answer: ans,
        explanation: `Move every letter ${k} place${k === 1 ? "" : "s"} forward.\n\n- ${caesarSteps(w, k, 1)}\n\nEncoded: **${ans}**`,
        hints: [`Do one letter at a time: ${w[0]} moves ${k} place${k === 1 ? "" : "s"} forward.`, "If a letter passes Z, wrap round to A and keep counting."],
        params: { kind: "c-enc", w, k },
      };
    }
    const cw = caesar(w, k);
    return {
      prompt: `The word **${cw}** was encoded with a Caesar cipher, shift **${k}** forward (letters wrap from Z to A). Decode it. Type the original word.`,
      answerType: "text", answer: w,
      explanation: `To decode, move every letter ${k} place${k === 1 ? "" : "s"} **back**.\n\n- ${caesarSteps(cw, k, -1)}\n\nDecoded: **${w}**`,
      hints: [`Decoding undoes the shift, so move each letter ${k} place${k === 1 ? "" : "s"} back towards A.`, "If you go back past A, wrap round to Z."],
      params: { kind: "c-dec", cw, k },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["enc", "dec", "shift", "shift", "rot13"]);
    const w = rng.pick(MID);
    if (kind === "shift") {
      const k = rng.int(1, 25);
      const cw = caesar(w, k);
      return {
        prompt: `A Caesar cipher turned **${w}** into **${cw}**. Each letter was shifted forward by the same amount, wrapping from Z to A. What is the shift? Give a whole number from 1 to 25.`,
        answerType: "number", answer: k, tolerance: 0,
        explanation: `Compare the first letters.\n\n- ${w[0]} is ${idx(w[0])} and ${cw[0]} is ${idx(cw[0])} (A = 0).\n- ${idx(cw[0])} − ${idx(w[0])} = ${idx(cw[0]) - idx(w[0])}${idx(cw[0]) < idx(w[0]) ? `; add 26: ${idx(cw[0]) - idx(w[0]) + 26}` : ""}\n- Check another pair: ${w[1]}→${cw[1]} gives the same shift.\n\nShift: **${k}**`,
        hints: [`Number the letters A = 0 to Z = 25 and compare ${w[0]} with ${cw[0]}.`, "Subtract plaintext from ciphertext. If the result is negative, add 26. Check with a second letter."],
        params: { kind: "c-shift", w, cw },
      };
    }
    const k = kind === "rot13" ? 13 : rng.int(4, 25);
    if (kind === "enc" || (kind === "rot13" && rng.next() < 0.5)) {
      const ans = caesar(w, k);
      const name = kind === "rot13" ? "ROT13 (a Caesar cipher with shift **13**)" : `a Caesar cipher, shift **${k}**`;
      return {
        prompt: `Encode **${w}** with ${name}. ${SHIFT_NOTE(k)} Type the encoded word.`,
        answerType: "text", answer: ans,
        explanation: `Move every letter ${k} places forward, wrapping after Z.\n\n- ${caesarSteps(w, k, 1)}\n\nEncoded: **${ans}**`,
        hints: [`Number the letters A = 0 to Z = 25, then add ${k} to each.`, "If a total is 26 or more, subtract 26 before turning it back into a letter."],
        params: { kind: "c-enc", w, k },
      };
    }
    const cw = caesar(w, k);
    const name = kind === "rot13" ? "ROT13 (a Caesar cipher with shift **13**)" : `a Caesar cipher, shift **${k}** forward`;
    return {
      prompt: `**${cw}** was encoded with ${name}. Letters wrap from Z to A. Decode it. Type the original word.`,
      answerType: "text", answer: w,
      explanation: `To decode, move every letter ${k} places back (or ${26 - k} forward, which is the same).\n\n- ${caesarSteps(cw, k, -1)}\n\nDecoded: **${w}**`,
      hints: [`Undo the shift: subtract ${k} from each letter number (A = 0).`, `If a result is negative, add 26. Moving back ${k} is the same as moving forward ${26 - k}.`],
      params: { kind: "c-dec", cw, k },
    };
  }

  // hard
  const kind = rng.pick(["multi", "multi", "which", "back"]);
  if (kind === "which") {
    const len = rng.pick([5, 6, 6, 7]);
    const pool = BY_LEN[len];
    const w = rng.pick(pool);
    const k = rng.int(1, 25);
    const cw = caesar(w, k);
    // Distractors: real words of the same length that no shift turns into cw.
    const wrong = rng.shuffle(pool).filter((x) => x !== w && !Array.from({ length: 26 }, (_, s) => caesar(x, s)).includes(cw));
    const c = textChoices(w, wrong, rng);
    return {
      prompt: `A Caesar cipher with an unknown shift (1 to 25, forward, wrapping from Z to A) turned a word into **${cw}**. Which word was it?`,
      answerType: "choice", ...c,
      explanation: `In a Caesar cipher every letter moves by the same amount, so the gaps between letters stay the same.\n\n- Try each option: compare its first letter with ${cw[0]} to get a shift, then check the other letters.\n- Only ${w} works for every letter, with shift ${k}: ${caesarSteps(w, k, 1)}.\n\nThe word was **${w}**.`,
      hints: [`Every letter moves by the same shift. For each option, work out the shift from its first letter to ${cw[0]}.`, "Then test that shift on the second and third letters. A wrong option breaks quickly."],
      params: { kind: "c-which", cw },
    };
  }
  if (kind === "back") {
    const w = rng.pick(LONG);
    const k = rng.int(3, 12);
    const cw = caesar(w, -k);
    return {
      prompt: `This time the encoder shifted each letter **${k}** places **backward** (so A became ${chr(-k)}), wrapping from A to Z. The result was **${cw}**. Decode it. Type the original word.`,
      answerType: "text", answer: w,
      explanation: `The encoder moved letters back, so decoding moves them **forward** ${k} places.\n\n- ${caesarSteps(cw, k, 1)}\n\nDecoded: **${w}**`,
      hints: ["Decoding undoes the encoding, so go the opposite way: forward.", `Add ${k} to each letter number (A = 0), subtracting 26 if you pass Z.`],
      params: { kind: "c-back", cw, k },
    };
  }
  const known = rng.pick(SHORT.filter((x) => x.length === 4));
  let w;
  do { w = rng.pick(LONG); } while (w === known);
  const k = rng.int(1, 25);
  const kc = caesar(known, k);
  const cw = caesar(w, k);
  return {
    prompt: `A spy uses one Caesar shift (forward, 1 to 25, wrapping from Z to A) for every message. You know that **${known}** was sent as **${kc}**. The next message is **${cw}**.`,
    answerType: "multi",
    parts: [
      { id: "shift", label: "Shift", ask: "What is the shift? Give a whole number from 1 to 25.", answerType: "number", answer: k, tolerance: 0,
        hint: `Compare ${known[0]} with ${kc[0]} (A = 0). If the difference is negative, add 26.` },
      { id: "word", label: "Message", ask: "Decode the next message. Type the word.", answerType: "text", answer: w,
        hint: "Move every letter of the next message back by the shift you found." },
    ],
    explanation: `Find the shift from the known pair, then undo it.\n\n- ${known[0]} = ${idx(known[0])}, ${kc[0]} = ${idx(kc[0])}, so the shift is ${k}.\n- Decode: ${caesarSteps(cw, k, -1)}\n\n**Shift:** **${k}**\n\n**Message:** **${w}**`,
    params: { kind: "c-multi", known, kc, cw },
  };
}

function verifyCaesar(q, answer) {
  const p = q.params;
  if (p.kind === "c-letter") {
    if (!fourDistinct(q)) return false;
    const ok = q.choices.filter((c) => vCaesarEnc(p.p, p.k) === c);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "c-enc") return vCaesarEnc(p.w, p.k) === upper(answer);
  if (p.kind === "c-dec" || p.kind === "c-back") {
    const a = upper(answer);
    // Re-encode the candidate (forward, or backward = forward by 26 - k).
    return /^[A-Z]+$/.test(a) && vCaesarEnc(a, p.kind === "c-dec" ? p.k : 26 - p.k) === p.cw;
  }
  if (p.kind === "c-shift") {
    const s = Number(answer);
    if (!Number.isInteger(s) || s < 1 || s > 25) return false;
    // Brute force: exactly one shift in 1..25 maps w to cw, and it is s.
    const all = [];
    for (let t = 1; t <= 25; t++) if (vCaesarEnc(p.w, t) === p.cw) all.push(t);
    return all.length === 1 && all[0] === s;
  }
  if (p.kind === "c-which") {
    if (!fourDistinct(q)) return false;
    const fits = (x) => { for (let t = 1; t <= 25; t++) if (vCaesarEnc(x, t) === p.cw) return true; return false; };
    const ok = q.choices.filter(fits);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "c-multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    const s = Number(a.shift);
    const shifts = [];
    for (let t = 1; t <= 25; t++) if (vCaesarEnc(p.known, t) === p.kc) shifts.push(t);
    if (shifts.length !== 1 || shifts[0] !== s) return false;
    const word = upper(a.word);
    return /^[A-Z]+$/.test(word) && vCaesarEnc(word, s) === p.cw;
  }
  return false;
}

// =============================================================================================
// Subtopic: Vigenère cipher

function vigTable(w, key, dir) {
  const ks = keyStream(w, key);
  const rows = [...w].map((c, i) => `${c} ${dir > 0 ? "+" : "−"} ${ks[i]} (${idx(ks[i])}) → ${chr(idx(c) + dir * idx(ks[i]))}`);
  return rows.map((r) => `- ${r}`).join("\n");
}

function genVigenere(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["enc", "enc", "letter"]);
    if (kind === "letter") {
      const p = rng.pick(ALPHA.split(""));
      const kl = rng.pick(ALPHA.slice(1).split("").filter((c) => c !== "N")); // N (13): forward = backward
      const correct = chr(idx(p) + idx(kl));
      const c = textChoices(correct, [chr(idx(p) - idx(kl)), chr(idx(p) + idx(kl) + 1), chr(idx(p) + idx(kl) - 1)], rng);
      return {
        prompt: `In a Vigenère cipher the plaintext letter **${p}** sits under the key letter **${kl}**. ${VIG_NOTE} Which ciphertext letter does it give?`,
        answerType: "choice", ...c,
        explanation: `Add the key letter's value to the plaintext letter.\n\n- ${p} = ${idx(p)}, ${kl} = ${idx(kl)}\n- ${idx(p)} + ${idx(kl)} = ${idx(p) + idx(kl)}${idx(p) + idx(kl) > 25 ? `, and ${idx(p) + idx(kl)} − 26 = ${idx(p) + idx(kl) - 26}` : ""}\n- That is **${correct}**.`,
        hints: [`The key letter ${kl} is worth ${idx(kl)} (A = 0), so it shifts ${p} forward by ${idx(kl)}.`, "Wrap round to A if you pass Z."],
        params: { kind: "v-letter", p, kl },
      };
    }
    const w = rng.pick(SHORT);
    const key = rng.pick(rng.next() < 0.5 ? KEYS2 : KEYS3);
    const ans = vig(w, key);
    return {
      prompt: `Encode **${w}** with a Vigenère cipher using the key **${key}**. ${VIG_NOTE} Type the encoded word.`,
      answerType: "text", answer: ans,
      explanation: `Write the key under the word, repeating it: ${w} / ${keyStream(w, key)}. Then add each pair.\n\n${vigTable(w, key, 1)}\n\nEncoded: **${ans}**`,
      hints: [`Write the key under the word, repeating it: ${w} over ${keyStream(w, key)}.`, `Each key letter is a shift: ${[...new Set(key)].map((c) => `${c} = ${idx(c)}`).join(", ")}. Shift each letter forward by the key letter under it.`],
      params: { kind: "v-enc", w, key },
    };
  }

  if (difficulty === "medium") {
    const w = rng.pick(MID);
    const key = rng.pick(rng.next() < 0.5 ? KEYS3 : KEYS4);
    if (rng.next() < 0.5) {
      const ans = vig(w, key);
      return {
        prompt: `Encode **${w}** with a Vigenère cipher using the key **${key}**. ${VIG_NOTE} Type the encoded word.`,
        answerType: "text", answer: ans,
        explanation: `Repeat the key under the word: ${w} / ${keyStream(w, key)}. Add each pair, subtracting 26 when a total reaches 26.\n\n${vigTable(w, key, 1)}\n\nEncoded: **${ans}**`,
        hints: [`Repeat the key under the word: ${w} over ${keyStream(w, key)}.`, `Key letter values: ${[...new Set(key)].map((c) => `${c} = ${idx(c)}`).join(", ")}. Add each to the letter above it and wrap past Z.`],
        params: { kind: "v-enc", w, key },
      };
    }
    const cw = vig(w, key);
    return {
      prompt: `**${cw}** was encoded with a Vigenère cipher using the key **${key}**. ${VIG_NOTE} Decode it. Type the original word.`,
      answerType: "text", answer: w,
      explanation: `To decode, **subtract** each key letter instead of adding it. Key under the ciphertext: ${cw} / ${keyStream(cw, key)}.\n\n${vigTable(cw, key, -1)}\n\nDecoded: **${w}**`,
      hints: [`Repeat the key under the ciphertext: ${cw} over ${keyStream(cw, key)}.`, "Subtract each key letter's value from the letter above it. If a result is negative, add 26."],
      params: { kind: "v-dec", cw, key },
    };
  }

  // hard
  const kind = rng.pick(["dec", "findkey", "multi", "multi"]);
  if (kind === "dec") {
    const w = rng.pick(LONG);
    const key = rng.pick(rng.next() < 0.5 ? KEYS4 : KEYS5);
    const cw = vig(w, key);
    return {
      prompt: `**${cw}** was encoded with a Vigenère cipher using the key **${key}**. ${VIG_NOTE} Decode it. Type the original word.`,
      answerType: "text", answer: w,
      explanation: `Subtract the repeating key from the ciphertext: ${cw} / ${keyStream(cw, key)}.\n\n${vigTable(cw, key, -1)}\n\nDecoded: **${w}**`,
      hints: [`Repeat the key under the ciphertext: ${cw} over ${keyStream(cw, key)}.`, "Subtract each key letter's value (A = 0) from the letter above it, adding 26 when the result is negative."],
      params: { kind: "v-dec", cw, key },
    };
  }
  const key = rng.pick(rng.next() < 0.5 ? KEYS3 : KEYS4);
  let known;
  do { known = rng.pick(MID); } while (known.length < key.length + 1);
  const kc = vig(known, key);
  if (kind === "findkey") {
    return {
      prompt: `A Vigenère cipher with a **${key.length}-letter** key turned **${known}** into **${kc}**. ${VIG_NOTE} What is the key? Type its ${key.length} letters.`,
      answerType: "text", answer: key,
      explanation: `Each key letter = ciphertext letter − plaintext letter (add 26 if negative). The first ${key.length} letters give the whole key.\n\n${[...key].map((c, i) => `- ${kc[i]} (${idx(kc[i])}) − ${known[i]} (${idx(known[i])}) → ${c}`).join("\n")}\n\nKey: **${key}**`,
      hints: ["Encoding added the key, so key = ciphertext − plaintext for each letter (A = 0).", `Work out the first ${key.length} letters only, since the key then repeats. Add 26 to any negative result.`],
      params: { kind: "v-findkey", known, kc, len: key.length },
    };
  }
  let w;
  do { w = rng.pick(LONG); } while (w === known);
  const cw = vig(w, key);
  return {
    prompt: `Two words were encoded with the same Vigenère key, which has **${key.length} letters**. ${VIG_NOTE} You know **${known}** became **${kc}**. The second word arrived as **${cw}**.`,
    answerType: "multi",
    parts: [
      { id: "key", label: "Key", ask: `What is the key? Type its ${key.length} letters.`, answerType: "text", answer: key,
        hint: `Key letter = ciphertext − plaintext (A = 0, add 26 if negative). You need only the first ${key.length} letters of ${known} and ${kc}.` },
      { id: "word", label: "Second word", ask: "Decode the second word. Type it.", answerType: "text", answer: w,
        hint: `Repeat your key under ${cw}, then subtract each key letter's value from the letter above it.` },
    ],
    explanation: `Recover the key from the known pair, then decode.\n\n${[...key].map((c, i) => `- ${kc[i]} − ${known[i]} → ${c}`).join("\n")}\n\nThe key is ${key}. Decoding ${cw} with ${keyStream(cw, key)}:\n\n${vigTable(cw, key, -1)}\n\n**Key:** **${key}**\n\n**Second word:** **${w}**`,
    params: { kind: "v-multi", known, kc, cw, len: key.length },
  };
}

// Every key of length len that maps plain to cipher (key letters found by tableau search).
function vKeysFor(plain, cipher, len) {
  let key = "";
  for (let i = 0; i < len; i++) {
    let found = null;
    for (const c of ALPHA) if (rotRow(ALPHA.indexOf(c))[ALPHA.indexOf(plain[i])] === cipher[i]) { found = c; break; }
    if (!found) return null;
    key += found;
  }
  return vVigEnc(plain, key) === cipher ? key : null;
}

function verifyVigenere(q, answer) {
  const p = q.params;
  if (p.kind === "v-letter") {
    if (!fourDistinct(q)) return false;
    const ok = q.choices.filter((c) => vVigEnc(p.p, p.kl) === c);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "v-enc") return vVigEnc(p.w, p.key) === upper(answer);
  if (p.kind === "v-dec") {
    const a = upper(answer);
    return /^[A-Z]+$/.test(a) && a.length === p.cw.length && vVigEnc(a, p.key) === p.cw;
  }
  if (p.kind === "v-findkey") {
    const a = upper(answer);
    return /^[A-Z]+$/.test(a) && a.length === p.len && vVigEnc(p.known, a) === p.kc && vKeysFor(p.known, p.kc, p.len) === a;
  }
  if (p.kind === "v-multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    const key = upper(a.key), word = upper(a.word);
    if (!/^[A-Z]+$/.test(key) || key.length !== p.len || vKeysFor(p.known, p.kc, p.len) !== key) return false;
    return /^[A-Z]+$/.test(word) && word.length === p.cw.length && vVigEnc(word, key) === p.cw;
  }
  return false;
}

// =============================================================================================
// Subtopic: Modular arithmetic

const mod = (a, n) => ((a % n) + n) % n;

// Square-and-multiply with reduction at each step (generation only).
function powMod(b, e, n) {
  let r = 1 % n, x = mod(b, n), k = e;
  while (k > 0) {
    if (k & 1) r = (r * x) % n;
    x = (x * x) % n;
    k >>= 1;
  }
  return r;
}

// Extended Euclid inverse (generation only).
function invMod(a, m) {
  let [r0, r1, s0, s1] = [m, mod(a, m), 0, 1];
  while (r1 !== 0) {
    const qq = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - qq * r1];
    [s0, s1] = [s1, s0 - qq * s1];
  }
  return r0 === 1 ? mod(s0, m) : null;
}

const RANGE = (n) => `Give a whole number from 0 to ${n - 1}.`;
const MOD_NOTE = "*a* mod *n* is the remainder when *a* is divided by *n*.";

function genModular(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["mod", "add", "mul", "clock"]);
    if (kind === "clock") {
      const h = rng.int(0, 23), t = rng.int(5, 100);
      const ans = (h + t) % 24;
      return {
        prompt: `A 24-hour clock is a mod 24 system. It is **${h}:00** now. What hour will it show **${t} hours** later? ${RANGE(24)}`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Add, then take the remainder after dividing by 24.\n\n- ${h} + ${t} = ${h + t}\n- ${h + t} = 24 × ${Math.floor((h + t) / 24)} + ${ans}\n\nThe clock shows **${ans}:00**, so the answer is **${ans}**.`,
        hints: [`Add the hours: ${h} + ${t}.`, "Remove whole days of 24 hours and keep the remainder (calculator: `(_h + _t) % 24`)."],
        given: [{ label: "_h", value: h }, { label: "_t", value: t }],
        params: { kind: "m-expr", op: "add", a: h, b: t, n: 24 },
      };
    }
    const n = rng.int(3, 13);
    if (kind === "mod") {
      let a;
      do { a = rng.int(10, 250); } while (a % n === 0 && rng.next() < 0.7);
      const ans = a % n;
      return {
        prompt: `Work out **${a} mod ${n}**. ${MOD_NOTE} ${RANGE(n)}`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Find the largest multiple of ${n} that fits into ${a}.\n\n- ${n} × ${Math.floor(a / n)} = ${n * Math.floor(a / n)}\n- ${a} − ${n * Math.floor(a / n)} = **${ans}**`,
        hints: [`How many whole times does ${n} go into ${a}?`, `Subtract that multiple of ${n} from ${a}; what's left is the remainder (calculator: \`_a % _n\`).`],
        given: [{ label: "_a", value: a }, { label: "_n", value: n }],
        params: { kind: "m-expr", op: "mod", a, n },
      };
    }
    const a = rng.int(5, 60), b = rng.int(5, 60);
    const op = kind;
    const v = op === "add" ? a + b : a * b;
    const ans = v % n;
    const sym = op === "add" ? "+" : "×";
    return {
      prompt: `Work out **(${a} ${sym} ${b}) mod ${n}**. ${MOD_NOTE} ${RANGE(n)}`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Work out the bracket, then take the remainder.\n\n- ${a} ${sym} ${b} = ${v}\n- ${v} = ${n} × ${Math.floor(v / n)} + ${ans}\n\nAnswer: **${ans}**`,
      hints: [`First work out ${a} ${sym} ${b}.`, `Then find the remainder after dividing by ${n} (calculator: \`(_a ${op === "add" ? "+" : "*"} _b) % _n\`).`],
      given: [{ label: "_a", value: a }, { label: "_b", value: b }, { label: "_n", value: n }],
      params: { kind: "m-expr", op, a, b, n },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["pow", "inv", "inv", "sub"]);
    if (kind === "pow") {
      const a = rng.int(2, 12), k = rng.int(2, 6), n = rng.int(5, 31);
      const ans = powMod(a, k, n);
      return {
        prompt: `Work out **${a}^${k} mod ${n}**. ${MOD_NOTE} ${RANGE(n)}`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Work out the power, then the remainder.\n\n- ${a}^${k} = ${commas(Math.pow(a, k))}\n- ${commas(Math.pow(a, k))} = ${n} × ${commas(Math.floor(Math.pow(a, k) / n))} + ${ans}\n\nAnswer: **${ans}**`,
        hints: [`First work out ${a}^${k}.`, `Then take the remainder after dividing by ${n} (calculator: \`_a ^ _k % _n\`, since ^ is worked out before %).`],
        given: [{ label: "_a", value: a }, { label: "_k", value: k }, { label: "_n", value: n }],
        params: { kind: "m-pow", a, k, n },
      };
    }
    if (kind === "sub") {
      const n = rng.int(5, 17);
      const a = rng.int(2, 30);
      const b = rng.int(a + 1, a + 40);
      const ans = mod(a - b, n);
      return {
        prompt: `Work out **(${a} − ${b}) mod ${n}**. Here the answer must be a whole number from 0 to ${n - 1}, so a negative result is not allowed.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `The difference is negative, so add multiples of ${n} until it lands in 0 to ${n - 1}.\n\n- ${a} − ${b} = ${a - b}\n- ${a - b} + ${n} × ${Math.ceil((b - a) / n)} = **${ans}**`,
        hints: [`${a} is smaller than ${b}, so the difference is negative.`, `Keep adding ${n} until the result is between 0 and ${n - 1}. (The calculator's % keeps the minus sign, so \`(_a - _b) % _n\` needs ${n} adding afterwards.)`],
        given: [{ label: "_a", value: a }, { label: "_b", value: b }, { label: "_n", value: n }],
        params: { kind: "m-expr", op: "sub", a, b, n },
      };
    }
    let m, a;
    do { m = rng.int(7, 40); a = rng.int(2, m - 1); } while (gcd(a, m) !== 1);
    const ans = invMod(a, m);
    return invQuestion(a, m, ans);
  }

  // hard
  const kind = rng.pick(["rsa-key", "rsa-dc", "rsa-enc", "rsa-dec", "inv"]);
  if (kind === "inv") {
    let m, a;
    do { m = rng.int(41, 150); a = rng.int(3, m - 1); } while (gcd(a, m) !== 1);
    return invQuestion(a, m, invMod(a, m));
  }
  const PR = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
  let p, q, e, phi, n;
  for (;;) {
    p = rng.pick(PR); q = rng.pick(PR);
    if (p === q) continue;
    n = p * q; phi = (p - 1) * (q - 1);
    const es = [3, 5, 7, 11, 13, 17].filter((x) => x < phi && gcd(x, phi) === 1);
    if (!es.length) continue;
    e = rng.pick(es);
    break;
  }
  const d = invMod(e, phi);
  const kTry = (d * e - 1) / phi;
  const dSteps = `Find d with d × e leaving remainder 1 when divided by φ(n): try (1 + k × ${phi}) ÷ ${e} for k = 1, 2, 3, … until it is a whole number. k = ${kTry} gives (1 + ${kTry * phi}) ÷ ${e} = ${d}.`;
  const RSA_NOTE = "Use n = p × q, φ(n) = (p − 1)(q − 1), and the private key d is the number from 1 to φ(n) − 1 with (d × e) mod φ(n) = 1.";

  if (kind === "rsa-key") {
    return {
      prompt: `Toy RSA: the primes are **p = ${p}** and **q = ${q}**, and the public exponent is **e = ${e}**. ${RSA_NOTE}`,
      answerType: "multi",
      parts: [
        { id: "n", label: "Modulus n", ask: "What is n?", answerType: "number", answer: n, tolerance: 0, hint: "Multiply the two primes (calculator: `_p * _q`)." },
        { id: "phi", label: "φ(n)", ask: "What is φ(n)?", answerType: "number", answer: phi, tolerance: 0, hint: "Take one off each prime, then multiply (calculator: `(_p - 1) * (_q - 1)`)." },
        { id: "d", label: "Private key d", ask: "What is d?", answerType: "number", answer: d, tolerance: 0, hint: "Try (1 + k × φ(n)) ÷ e for k = 1, 2, 3, … The first whole-number result is d." },
      ],
      explanation: `Build the key step by step.\n\n- n = ${p} × ${q} = ${n}\n- φ(n) = ${p - 1} × ${q - 1} = ${phi}\n- ${dSteps}\n- Check: ${d} × ${e} = ${d * e} = ${phi} × ${kTry} + 1\n\n**Modulus n:** **${n}**\n\n**φ(n):** **${phi}**\n\n**Private key d:** **${d}**`,
      given: [{ label: "_p", value: p }, { label: "_q", value: q }, { label: "_e", value: e }],
      params: { kind: "rsa-key", p, q, e },
    };
  }

  // A message m with gcd(m, n) = 1 and m^e small enough for exact calculator powers.
  const ms = [];
  for (let x = 2; x < n; x++) if (gcd(x, n) === 1 && Math.pow(x, e) <= 2 ** 53) ms.push(x);
  const m = rng.pick(ms);
  const c = powMod(m, e, n);
  const encSteps = `- ${m}^${e} = ${commas(Math.pow(m, e))}\n- ${commas(Math.pow(m, e))} mod ${n} = ${c}`;

  if (kind === "rsa-enc") {
    return {
      prompt: `Toy RSA: the public key is **n = ${n}** and **e = ${e}**. Encrypt the message **m = ${m}** using c = m^e mod n. ${RANGE(n)}`,
      answerType: "number", answer: c, tolerance: 0,
      explanation: `Raise m to the power e, then take the remainder mod n.\n\n${encSteps}\n\nCiphertext: **${c}**`,
      hints: [`Work out ${m}^${e} first.`, "Then take the remainder after dividing by n (calculator: `_m ^ _e % _n`)."],
      given: [{ label: "_n", value: n }, { label: "_e", value: e }, { label: "_m", value: m }],
      params: { kind: "rsa-enc", n, e, m },
    };
  }
  if (kind === "rsa-dc") {
    return {
      prompt: `Toy RSA: **p = ${p}**, **q = ${q}**, **e = ${e}**, and the message is **m = ${m}**. ${RSA_NOTE} Encryption is c = m^e mod n.`,
      answerType: "multi",
      parts: [
        { id: "d", label: "Private key d", ask: "What is d?", answerType: "number", answer: d, tolerance: 0, hint: "Work out φ(n) = (p − 1)(q − 1), then try (1 + k × φ(n)) ÷ e for k = 1, 2, 3, … until it is whole." },
        { id: "c", label: "Ciphertext c", ask: "What is c?", answerType: "number", answer: c, tolerance: 0, hint: "n = p × q. Then work out m^e and take the remainder mod n (calculator: `_m ^ _e % (_p * _q)`)." },
      ],
      explanation: `Private key first, then encrypt with the public key.\n\n- n = ${p} × ${q} = ${n}, φ(n) = ${p - 1} × ${q - 1} = ${phi}\n- ${dSteps}\n${encSteps}\n\n**Private key d:** **${d}**\n\n**Ciphertext c:** **${c}**`,
      given: [{ label: "_p", value: p }, { label: "_q", value: q }, { label: "_e", value: e }, { label: "_m", value: m }],
      params: { kind: "rsa-dc", p, q, e, m },
    };
  }
  // rsa-dec: choose the message that encrypts to c (exactly one does: RSA is a one-to-one map on 0..n-1).
  const cands = [c, (c * d) % n, powMod(c, e, n), n - m, mod(m + 1, n), mod(m - 1, n)].map(String);
  const ch = textChoices(String(m), cands.filter((x) => x !== "0" && x !== "1"), rng);
  return {
    prompt: `Toy RSA: the public key is **n = ${n}** and **e = ${e}**, and the private key is **d = ${d}**. You receive the ciphertext **c = ${c}**. Which message m was sent? (Encryption is c = m^e mod n.)`,
    answerType: "choice", ...ch,
    explanation: `Decrypting means m = c^d mod n, but ${c}^${d} is far too big to work out directly. Encrypting each option instead is quicker: only the right message gives c = ${c}.\n\n${encSteps}\n\nThe message was **${m}**.`,
    hints: ["c^d is huge, so check the options the other way round: encrypt each one with m^e mod n.", "Calculator: put an option in a row such as `_m`, then work out `_m ^ _e % _n` and compare it with c."],
    given: [{ label: "_n", value: n }, { label: "_e", value: e }, { label: "_c", value: c }],
    params: { kind: "rsa-dec", n, e, c },
  };
}

function invQuestion(a, m, ans) {
  const k = (a * ans - 1) / m;
  return {
    prompt: `Find the **inverse of ${a} mod ${m}**: the whole number x from 1 to ${m - 1} with (${a} × x) mod ${m} = 1.`,
    answerType: "number", answer: ans, tolerance: 0,
    explanation: `You need ${a} × x = 1 more than a multiple of ${m}. Try (1 + k × ${m}) ÷ ${a} for k = 0, 1, 2, … until it is whole.\n\n- k = ${k}: (1 + ${k * m}) ÷ ${a} = ${ans}\n- Check: ${a} × ${ans} = ${a * ans} = ${m} × ${k} + 1\n\nInverse: **${ans}**`,
    hints: [`You want ${a} × x to be 1 more than a multiple of ${m}.`, `Try (1 + k × ${m}) ÷ ${a} for k = 0, then k = 1, and so on; the first whole number is x (calculator: \`(1 + _k * _m) / _a\`, adding a row \`_k\`).`],
    given: [{ label: "_a", value: a }, { label: "_m", value: m }],
    params: { kind: "m-inv", a, m },
  };
}

// BigInt power then remainder (verify only).
const bigPowMod = (b, e, n) => Number((BigInt(b) ** BigInt(e)) % BigInt(n));

function verifyModular(q, answer) {
  const p = q.params;
  const isInt = (x) => Number.isInteger(x);
  if (p.kind === "m-expr") {
    const x = Number(answer);
    if (!isInt(x) || x < 0 || x >= p.n) return false;
    const v = p.op === "mod" ? p.a : p.op === "add" ? p.a + p.b : p.op === "mul" ? p.a * p.b : p.a - p.b;
    // Substitution: v - x must be a whole multiple of n.
    return Number.isInteger((v - x) / p.n);
  }
  if (p.kind === "m-pow") {
    const x = Number(answer);
    return isInt(x) && x >= 0 && x < p.n && bigPowMod(p.a, p.k, p.n) === x;
  }
  if (p.kind === "m-inv") {
    const x = Number(answer);
    if (!isInt(x) || x < 1 || x >= p.m) return false;
    // Brute force: exactly one inverse in 1..m-1.
    const all = [];
    for (let t = 1; t < p.m; t++) if ((p.a * t) % p.m === 1) all.push(t);
    return all.length === 1 && all[0] === x;
  }
  const phiCount = (n) => { let c = 0; for (let t = 1; t <= n; t++) if (gcd(t, n) === 1) c++; return c; };
  const bruteD = (e, phi) => { const all = []; for (let t = 1; t < phi; t++) if ((e * t) % phi === 1) all.push(t); return all.length === 1 ? all[0] : null; };
  if (p.kind === "rsa-key") {
    const a = answer && typeof answer === "object" ? answer : {};
    const n = Number(a.n), phi = Number(a.phi), d = Number(a.d);
    if (!(n / p.p === p.q && n % p.p === 0)) return false;
    if (phiCount(p.p * p.q) !== phi) return false;
    return bruteD(p.e, phi) === d;
  }
  if (p.kind === "rsa-dc") {
    const a = answer && typeof answer === "object" ? answer : {};
    const d = Number(a.d), c = Number(a.c);
    const n = p.p * p.q;
    if (bruteD(p.e, phiCount(n)) !== d) return false;
    // Decrypting c with d must give m back, and c must be the BigInt encryption.
    return isInt(c) && c >= 0 && c < n && bigPowMod(p.m, p.e, n) === c && bigPowMod(c, d, n) === p.m;
  }
  if (p.kind === "rsa-enc") {
    const x = Number(answer);
    return isInt(x) && x >= 0 && x < p.n && bigPowMod(p.m, p.e, p.n) === x && Math.pow(p.m, p.e) <= 2 ** 53;
  }
  if (p.kind === "rsa-dec") {
    if (!fourDistinct(q)) return false;
    const ok = q.choices.filter((s) => bigPowMod(Number(s), p.e, p.n) === p.c);
    return ok.length === 1 && ok[0] === String(answer);
  }
  return false;
}

// =============================================================================================
// Subtopic: Key space and brute force

const UNITS = [
  { name: "years", s: 365 * 86400, note: "1 year = 365 days" },
  { name: "days", s: 86400, note: "1 day = 24 hours" },
  { name: "hours", s: 3600, note: "" },
  { name: "minutes", s: 60, note: "" },
  { name: "seconds", s: 1, note: "" },
];
const UNIT_C = { years: "365 * 86400", days: "86400", hours: "3600", minutes: "60", seconds: "1" };
// Biggest unit in which the time is at least 1 (no rng: picked from the numbers).
const unitFor = (secs) => UNITS.find((u) => secs / u.s >= 1) || UNITS[UNITS.length - 1];

const SYSTEMS = ["A cipher", "A wireless network", "A game's save-file lock", "A smart door lock", "A toy encryption app", "A school's file vault", "A chat app", "A cloud backup"];
const PIN_FOR = ["a bike lock", "a phone", "a hotel safe", "a school locker", "a garage door", "a games console", "a tablet", "a luggage lock"];

const RATES = [1000, 2000, 5000, 10000, 50000, 100000, 250000, 1000000, 2000000, 5000000, 10000000, 1e8, 1e9];
const ALPHABETS = [
  { size: 10, what: "digits 0 to 9" },
  { size: 26, what: "lower-case letters a to z" },
  { size: 36, what: "lower-case letters and digits" },
  { size: 52, what: "upper- and lower-case letters" },
  { size: 62, what: "upper- and lower-case letters and digits" },
];

function genKeySpace(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["bits", "bits", "pin", "letters", "extra"]);
    if (kind === "bits") {
      const b = rng.int(4, 32);
      const ans = Math.pow(2, b);
      return {
        prompt: `${rng.pick(SYSTEMS)} uses a **${b}-bit** key. How many different keys are there? Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Each bit has 2 values, so ${b} bits give 2 multiplied by itself ${b} times.\n\n2^${b} = **${commas(ans)}** keys`,
        hints: ["Each bit can be 0 or 1. One bit gives 2 keys, two bits 4, three bits 8.", "So the number of keys is 2 to the power of the number of bits (calculator: `2 ^ _bits`)."],
        given: [{ label: "_bits", value: b }],
        params: { kind: "k-count", base: 2, len: b },
      };
    }
    if (kind === "pin" || kind === "letters") {
      const A = kind === "pin" ? ALPHABETS[0] : ALPHABETS[1];
      const L = kind === "pin" ? rng.int(3, 8) : rng.int(2, 5);
      const ans = Math.pow(A.size, L);
      const thing = kind === "pin" ? `The PIN for ${rng.pick(PIN_FOR)} has **${L} digits** (${A.what}), and digits may repeat.` : `The code for ${rng.pick(PIN_FOR)} has **${L} characters**, using only ${A.what}, and letters may repeat.`;
      return {
        prompt: `${thing} How many different codes are possible? Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Each of the ${L} positions has ${A.size} choices, so multiply ${A.size} by itself ${L} times.\n\n${A.size}^${L} = **${commas(ans)}**`,
        hints: [`Each position can be any of ${A.size} symbols, chosen independently.`, `Multiply ${A.size} for every position (calculator: \`${A.size} ^ _len\`).`],
        given: [{ label: "_len", value: L }],
        params: { kind: "k-count", base: A.size, len: L },
      };
    }
    const b = rng.int(16, 40), x = rng.int(1, 12);
    const ans = Math.pow(2, x);
    return {
      prompt: `${rng.pick(SYSTEMS)} upgrades its key from **${b} bits** to **${b + x} bits**. How many times more keys are there now? Type the whole number.`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Each extra bit doubles the number of keys. ${x} extra bit${x === 1 ? "" : "s"} multiply it by 2^${x}.\n\n2^${b + x} ÷ 2^${b} = 2^${x} = **${commas(ans)}**`,
      hints: ["Adding one bit doubles the number of keys.", `So count how many bits were added and double that many times.`],
      given: [{ label: "_old", value: b }, { label: "_new", value: b + x }],
      params: { kind: "k-ratio", from: b, to: b + x },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["bits", "bits", "pass"]);
    for (;;) {
      let keys, desc, given, calcKeys, base, len;
      if (kind === "bits") {
        const b = rng.int(20, 44);
        keys = Math.pow(2, b);
        desc = `a **${b}-bit** key`;
        given = [{ label: "_bits", value: b }];
        calcKeys = "2 ^ _bits";
        base = 2; len = b;
      } else {
        const A = rng.pick(ALPHABETS.slice(1));
        const L = rng.int(4, 7);
        keys = Math.pow(A.size, L);
        desc = `a **${L}-character** password made of ${A.what} (repeats allowed)`;
        given = [{ label: "_len", value: L }];
        calcKeys = `${A.size} ^ _len`;
        base = A.size; len = L;
      }
      const R = rng.pick(RATES);
      const secs = keys / R;
      const u = unitFor(secs);
      const exact = secs / u.s;
      if (nearTie(exact) || exact > 1e7) continue;
      return {
        prompt: `An attacker tries every possible key for ${desc}, testing **${commas(R)} keys per second**. How long does it take to try them all, in **${u.name}**?${u.note ? ` Take ${u.note}.` : ""} Round to 2 decimal places.`,
        answerType: "number", answer: round2(exact), tolerance: 0.005,
        explanation: `Time = number of keys ÷ keys per second, then convert the units.\n\n- Keys: ${commas(keys)}\n- Seconds: ${commas(keys)} ÷ ${commas(R)} = ${num(secs)}${u.s !== 1 ? `\n- In ${u.name}: ${num(secs)} ÷ ${commas(u.s)} ≈ ${num(exact)}` : ""}\n\nRounded: **${round2(exact).toFixed(2)} ${u.name}**`,
        hints: [`First count the keys (calculator: \`${calcKeys}\`).`, `Divide by the rate to get seconds${u.s !== 1 ? `, then divide by ${commas(u.s)} for ${u.name}` : ""}. Calculator: \`${calcKeys} / _rate${u.s !== 1 ? ` / (${UNIT_C[u.name]})` : ""}\`.`],
        given: [...given, { label: "_rate", value: R }],
        params: { kind: "k-time", base, len, rate: R, unit: u.s, frac: 1 },
      };
    }
  }

  // hard
  const kind = rng.pick(["avg", "multi", "minbits", "multi"]);
  if (kind === "minbits") {
    let X;
    do { X = rng.int(2, 9) * Math.pow(10, rng.int(3, 12)) + rng.int(0, 999); } while (Math.log2(X) % 1 === 0);
    const ans = Math.ceil(Math.log2(X));
    return {
      prompt: `A system needs at least **${commas(X)}** different keys. What is the smallest number of key bits that gives at least that many? Type the whole number.`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Find the smallest b with 2^b ≥ ${commas(X)}.\n\n- 2^${ans - 1} = ${commas(Math.pow(2, ans - 1))}, which is too few\n- 2^${ans} = ${commas(Math.pow(2, ans))}, which is enough\n\nSmallest: **${ans} bits**`,
      hints: ["b bits give 2^b keys, so you need the smallest b with 2^b at least the target.", "Every extra 10 bits multiply the count by about a thousand (2^10 = 1,024). Estimate, then adjust one bit at a time (calculator: `2 ^ _b` with a row `_b`)."],
      given: [{ label: "_target", value: X }],
      params: { kind: "k-minbits", X },
    };
  }
  for (;;) {
    // Multi asks for the exact key count, so keep it within the calculator's 10 significant digits.
    const b = kind === "multi" ? rng.int(24, 33) : rng.int(36, 52);
    const keys = Math.pow(2, b);
    const R = rng.pick(RATES.slice(4));
    const avg = kind !== "multi" || rng.next() < 0.5;
    const secs = (avg ? keys / 2 : keys) / R;
    const u = unitFor(secs);
    const exact = secs / u.s;
    if (nearTie(exact) || exact > 1e7) continue;
    const avgWords = avg ? " On average an attacker finds the key after trying **half** of them." : "";
    const calc = `2 ^ _bits${avg ? " / 2" : ""} / _rate${u.s !== 1 ? ` / (${UNIT_C[u.name]})` : ""}`;
    const steps = `- Keys: 2^${b} = ${commas(keys)}${avg ? `\n- Half of them: ${commas(keys / 2)}` : ""}\n- Seconds: ${commas(avg ? keys / 2 : keys)} ÷ ${commas(R)} = ${num(secs)}${u.s !== 1 ? `\n- In ${u.name}: ${num(secs)} ÷ ${commas(u.s)} ≈ ${num(exact)}` : ""}`;
    const given = [{ label: "_bits", value: b }, { label: "_rate", value: R }];
    const params = { kind: "k-time", base: 2, len: b, rate: R, unit: u.s, frac: avg ? 0.5 : 1 };
    const unitNote = u.note ? ` Take ${u.note}.` : "";
    if (kind === "multi") {
      return {
        prompt: `A cipher uses a **${b}-bit** key, and an attacker tests **${commas(R)} keys per second**.${avgWords}${unitNote}`,
        answerType: "multi",
        parts: [
          { id: "keys", label: "Key space", ask: "How many keys are there? Type the whole number.", answerType: "number", answer: keys, tolerance: 0,
            hint: "Each bit doubles the number of keys (calculator: `2 ^ _bits`)." },
          { id: "time", label: avg ? "Average time" : "Time for all keys", ask: `${avg ? "On average, how long" : "How long"} does the search take, in ${u.name}? Round to 2 decimal places.`, answerType: "number", answer: round2(exact), tolerance: 0.005,
            hint: `${avg ? "Halve the keys, then d" : "D"}ivide by the rate for seconds${u.s !== 1 ? `, then by ${commas(u.s)} for ${u.name}` : ""}. Calculator: \`${calc}\`.` },
        ],
        explanation: `Count the keys, then divide by the rate.\n\n${steps}\n\n**Key space:** **${commas(keys)}**\n\n**${avg ? "Average time" : "Time for all keys"}:** **${round2(exact).toFixed(2)} ${u.name}**`,
        given,
        params: { ...params, multi: true },
      };
    }
    return {
      prompt: `A cipher uses a **${b}-bit** key, and an attacker tests **${commas(R)} keys per second**.${avgWords} What is the average time to find the key, in **${u.name}**?${unitNote} Round to 2 decimal places.`,
      answerType: "number", answer: round2(exact), tolerance: 0.005,
      explanation: `Average time = half the keys ÷ the rate.\n\n${steps}\n\nRounded: **${round2(exact).toFixed(2)} ${u.name}**`,
      hints: ["Count the keys first: 2 to the power of the bits.", "On average you search half of them, so halve the count.", `Divide by the rate for seconds${u.s !== 1 ? `, then convert to ${u.name}` : ""}. Calculator: \`${calc}\`.`],
      given,
      params,
    };
  }
}

// Repeated multiplication (verify only).
function countKeys(base, len) {
  let v = 1;
  for (let i = 0; i < len; i++) v *= base;
  return v;
}

function timeOk(p, x) {
  if (!Number.isFinite(x)) return false;
  const keys = countKeys(p.base, p.len) * p.frac;
  const sens = p.unit * p.rate; // keys per unit of x
  return Math.abs(x * sens - keys) <= 0.005 * sens * (1 + 1e-9);
}
function timeWellPosed(p, x) {
  for (const dd of [-0.01, 0.01]) if (timeOk(p, Math.round((x + dd) * 100) / 100)) return false;
  return true;
}

function verifyKeySpace(q, answer) {
  const p = q.params;
  if (p.kind === "k-count") {
    const x = Number(answer);
    return Number.isInteger(x) && x === countKeys(p.base, p.len) && x <= 2 ** 53;
  }
  if (p.kind === "k-ratio") {
    const x = Number(answer);
    // Substitution: old count × x must equal the new count.
    return Number.isInteger(x) && countKeys(2, p.from) * x === countKeys(2, p.to);
  }
  if (p.kind === "k-minbits") {
    const x = Number(answer);
    if (!Number.isInteger(x) || x < 1) return false;
    return countKeys(2, x) >= p.X && countKeys(2, x - 1) < p.X;
  }
  if (p.kind === "k-time") {
    if (p.multi) {
      const a = answer && typeof answer === "object" ? answer : {};
      const keys = Number(a.keys), t = Number(a.time);
      if (!Number.isInteger(keys) || keys !== countKeys(2, p.len)) return false;
      return timeOk(p, t) && timeWellPosed(p, t);
    }
    const x = Number(answer);
    return timeOk(p, x) && timeWellPosed(p, x);
  }
  return false;
}

// =============================================================================================


// Every exact number answer says so (no rng calls: wording only).
function stateWhole(q) {
  if (!q) return q;
  if (q.answerType === "number" && !q.tolerance && !/whole number/i.test(q.prompt)) q.prompt += " Type the whole number.";
  if (q.answerType === "multi") for (const p of q.parts || []) if (p.answerType === "number" && !p.tolerance && !/whole number/i.test(p.ask)) p.ask += " Type the whole number.";
  return q;
}

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "caesar") return stateWhole(genCaesar(difficulty, rng));
  if (subtopic === "vigenere") return stateWhole(genVigenere(difficulty, rng));
  if (subtopic === "modular") return stateWhole(genModular(difficulty, rng));
  if (subtopic === "key-space") return stateWhole(genKeySpace(difficulty, rng));
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check (see the header): rotated-alphabet tables, re-encoding candidates, brute
// force over shifts / inverses / φ, BigInt powers, and rounding residuals with tie rejection.
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.kind) return false;
  if (answer === "" || answer === null || answer === undefined) return false;
  try {
    if (p.kind.startsWith("c-")) return verifyCaesar(question, answer);
    if (p.kind.startsWith("v-")) return verifyVigenere(question, answer);
    if (p.kind.startsWith("m-") || p.kind.startsWith("rsa-")) return verifyModular(question, answer);
    if (p.kind.startsWith("k-")) return verifyKeySpace(question, answer);
  } catch {
    return false;
  }
  return false;
}
