// Data Representation generator. Uses only the seeded rng passed in by the engine.
// Generation multiplies the stated quantities forward. verify() checks every answer another way:
// unit factors rebuilt from the unit name with residual checks (and half-step tie rejection for
// rounded answers), doubling loops for colour counts and bit depths, charCodeAt / fromCharCode /
// fromCodePoint for character codes, TextEncoder for UTF-8 byte counts, regex-based run-length
// decoding / encoding, and inequality checks for "how many fit".
// Prefixes: KB, MB, GB = powers of 1000; KiB, MiB, GiB = powers of 1024. Every prompt says which.

// ---------------------------------------------------------------------------------------------
// Shared helpers

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

const SIZE_F = { KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1048576, GiB: 1073741824 };
const SIZE_NOTE = {
  KB: "1 KB = 1,000 bytes", MB: "1 MB = 1,000,000 bytes", GB: "1 GB = 1,000,000,000 bytes",
  KiB: "1 KiB = 1,024 bytes", MiB: "1 MiB = 1,048,576 bytes (1024 × 1024)", GiB: "1 GiB = 1,073,741,824 bytes (1024 × 1024 × 1024)",
};
// Calculator-safe factor text (no commas).
const SIZE_C = { KB: "1000", MB: "1e6", GB: "1e9", KiB: "1024", MiB: "1024^2", GiB: "1024^3" };

function notes(units, bits = true) {
  const parts = [...new Set(units)].map((u) => SIZE_NOTE[u]);
  if (bits) parts.push("1 byte = 8 bits");
  return `Take ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts[parts.length - 1]}.`;
}

// Unit factor rebuilt from the unit name (verify only): K/M/G = 10^3, 10^6, 10^9; Ki/Mi/Gi = 2^10, 2^20, 2^30.
function unitFactor(u) {
  if (u === "B") return 1;
  const m = /^([KMG])(i?)B$/.exec(u);
  if (!m) return NaN;
  const e = { K: 1, M: 2, G: 3 }[m[1]];
  return m[2] ? Math.pow(2, 10 * e) : Math.pow(10, 3 * e);
}

// A rounded answer x is right when |x·sens − target| ≤ 0.005·sens, and no neighbouring 2-dp value also is.
function residualOk(x, sens, target) {
  return Number.isFinite(x) && Math.abs(x * sens - target) <= 0.005 * sens * (1 + 1e-9);
}
function rounded2Ok(x, sens, target) {
  if (!residualOk(x, sens, target)) return false;
  for (const dd of [-0.01, 0.01]) if (residualOk(Math.round((x + dd) * 100) / 100, sens, target)) return false;
  return true;
}

const ROUND = "Round to 2 decimal places.";

// Doubling loop (verify only): 2^b.
function twoTo(b) { let v = 1; for (let i = 0; i < b; i++) v *= 2; return v; }
// Smallest b with 2^b ≥ n (verify only).
function bitsFor(n) { let b = 0, v = 1; while (v < n) { v *= 2; b++; } return b; }

// =============================================================================================
// Subtopic: Images

const IMG_WHAT = ["an icon", "a game sprite", "a logo", "a thumbnail", "a pixel-art tile", "a cursor", "an emoji graphic", "a map tile", "a badge", "a button graphic"];
const PHOTO_WHAT = ["a photo", "a screenshot", "a scanned page", "a webcam frame", "a wallpaper", "a game texture", "a poster design", "a satellite image"];
const PHOTO_DIMS = [[640, 480], [800, 600], [1024, 768], [1280, 720], [1280, 1024], [1366, 768], [1600, 900], [1920, 1080], [2048, 1536], [2560, 1440]];
const CAMERA_DIMS = [[3000, 2000], [4000, 3000], [4032, 3024], [6000, 4000], [3840, 2160], [2592, 1944]];
const NO_HEADER = "Ignore any header or metadata; the image is uncompressed.";

function genImages(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["colours", "bits", "bytes", "bytes"]);
    const what = rng.pick(IMG_WHAT);
    if (kind === "colours") {
      const d = rng.pick([3, 4, 5, 6, 7, 8, 10, 12, 16]);
      const ans = Math.pow(2, d);
      return {
        prompt: `The image for ${what} has a colour depth of **${d} bit${d === 1 ? "" : "s"}** per pixel. How many different colours can each pixel show? Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Each bit doubles the number of patterns, so ${d} bits give 2^${d} colours.\n\n2^${d} = **${commas(ans)}** colours`,
        hints: ["One bit gives two colours (0 or 1). Each extra bit doubles the number of patterns.", `So work out 2 to the power of ${d} (calculator: \`2 ^ ${d}\`).`],
        params: { kind: "i-colours", d },
      };
    }
    if (kind === "bits") {
      let N;
      do { N = rng.int(3, 1000); } while (rng.next() < 0.8 && (N & (N - 1)) === 0);
      const ans = Math.ceil(Math.log2(N));
      return {
        prompt: `The image for ${what} must be able to show **${N} different colours**. What is the smallest colour depth (bits per pixel) that allows this? Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Find the smallest b with 2^b ≥ ${N}.\n\n- 2^${ans - 1} = ${commas(Math.pow(2, ans - 1))}, which is too few\n- 2^${ans} = ${commas(Math.pow(2, ans))}, which is enough\n\nSmallest colour depth: **${ans} bits**`,
        hints: ["b bits give 2^b colours.", `Start at one bit (two colours) and keep doubling until you reach at least ${N}; count the bits as you go.`],
        params: { kind: "i-bits", N },
      };
    }
    let w, h, d;
    do { w = rng.int(4, 64); h = rng.int(4, 64); d = rng.pick([1, 2, 4, 8, 24]); } while ((w * h * d) % 8 !== 0);
    const ans = (w * h * d) / 8;
    return {
      prompt: `The image for ${what} is **${w} × ${h} pixels** with a colour depth of **${d} bit${d === 1 ? "" : "s"}**. How big is it in **bytes**? ${NO_HEADER} 1 byte = 8 bits. Type the whole number.`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Size in bits = width × height × colour depth; divide by 8 for bytes.\n\n- ${w} × ${h} = ${commas(w * h)} pixels\n- ${commas(w * h)} × ${d} = ${commas(w * h * d)} bits\n- ${commas(w * h * d)} ÷ 8 = **${commas(ans)} bytes**`,
      hints: [`Count the pixels: ${w} × ${h}.`, "Multiply by the bits per pixel, then divide by 8 (calculator: `_w * _h * _depth / 8`)."],
      given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_depth", value: d }],
      params: { kind: "i-size", w, h, d, unit: "B", rounded: false },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["size", "size", "ncol", "ratio"]);
    const what = rng.pick(PHOTO_WHAT);
    if (kind === "size") {
      for (;;) {
        const [w, h] = rng.next() < 0.6 ? rng.pick(PHOTO_DIMS) : [rng.int(10, 200) * 8, rng.int(10, 150) * 8];
        const d = rng.pick([8, 16, 24, 32]);
        const bytes = (w * h * d) / 8;
        const unit = bytes < 2e6 ? rng.pick(["KB", "KiB"]) : rng.pick(["MB", "MiB"]);
        const exact = bytes / SIZE_F[unit];
        if (nearTie(exact)) continue;
        return {
          prompt: `${what[0].toUpperCase()}${what.slice(1)} is **${w} × ${h} pixels** with **${d}-bit** colour. How big is the file in **${unit}**? ${NO_HEADER} ${notes([unit])} ${ROUND}`,
          answerType: "number", answer: round2(exact), tolerance: 0.005,
          explanation: `Work out the bits, turn them into bytes, then into ${unit}.\n\n- ${w} × ${h} × ${d} = ${commas(w * h * d)} bits\n- ÷ 8 = ${commas(bytes)} bytes\n- ÷ ${commas(SIZE_F[unit])} ≈ ${num(exact)} ${unit}\n\nRounded: **${round2(exact).toFixed(2)} ${unit}**`,
          hints: ["Size in bits = width × height × colour depth.", `Divide by 8 for bytes, then by ${commas(SIZE_F[unit])} for ${unit}. Calculator: \`_w * _h * _depth / 8 / ${SIZE_C[unit]}\`.`],
          given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_depth", value: d }],
          params: { kind: "i-size", w, h, d, unit, rounded: true },
        };
      }
    }
    if (kind === "ncol") {
      let N;
      do { N = rng.int(5, 3000); } while ((N & (N - 1)) === 0);
      const b = Math.ceil(Math.log2(N));
      let w, h;
      do { w = rng.int(8, 120); h = rng.int(8, 120); } while ((w * h * b) % 8 !== 0);
      const ans = (w * h * b) / 8;
      return {
        prompt: `A **${w} × ${h}** pixel image uses a palette of **${N} colours**, with the smallest colour depth that can store them. How big is it in **bytes**? ${NO_HEADER} 1 byte = 8 bits. Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `First the bits per pixel, then the size.\n\n- 2^${b - 1} = ${Math.pow(2, b - 1)} < ${N} ≤ 2^${b} = ${Math.pow(2, b)}, so ${b} bits per pixel\n- ${w} × ${h} × ${b} = ${commas(w * h * b)} bits\n- ÷ 8 = **${commas(ans)} bytes**`,
        hints: [`Find the smallest b with 2^b ≥ ${N}. That's the colour depth.`, "Then width × height × depth gives bits; divide by 8 for bytes (calculator: `_w * _h * _depth / 8`, adding a row `_depth`)."],
        given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_colours", value: N }],
        params: { kind: "i-ncol", w, h, N },
      };
    }
    // ratio: change of resolution and/or depth
    let d1, d2, f, exact;
    do {
      d1 = rng.pick([1, 2, 4, 8, 16]);
      d2 = rng.pick([8, 16, 24, 32].filter((x) => x !== d1));
      f = rng.pick([1, 1, 2, 3, 0.5]);
      exact = f * f * (d2 / d1);
    } while (nearTie(exact));
    const [w, h] = rng.pick(PHOTO_DIMS);
    const w2 = w * f, h2 = h * f;
    return {
      prompt: `An uncompressed image is **${w} × ${h}** pixels at **${d1}-bit** colour. It is saved again at **${w2} × ${h2}** pixels and **${d2}-bit** colour. How many times bigger is the new file? (A smaller file gives an answer below 1.) ${ROUND}`,
      answerType: "number", answer: round2(exact), tolerance: 0.005,
      explanation: `Size is proportional to pixels × depth, so compare the two products.\n\n- Pixels: ${commas(w2 * h2)} ÷ ${commas(w * h)} = ${num((w2 * h2) / (w * h))}\n- Depth: ${d2} ÷ ${d1} = ${num(d2 / d1)}\n- ${num((w2 * h2) / (w * h))} × ${num(d2 / d1)} = **${round2(exact).toFixed(2)}**`,
      hints: ["File size is width × height × depth, so the ratio is (new pixels ÷ old pixels) × (new depth ÷ old depth).", "Calculator: `(_w2 * _h2 * _d2) / (_w1 * _h1 * _d1)`."],
      given: [{ label: "_w1", value: w }, { label: "_h1", value: h }, { label: "_d1", value: d1 }, { label: "_w2", value: w2 }, { label: "_h2", value: h2 }, { label: "_d2", value: d2 }],
      params: { kind: "i-ratio", a: [w, h, d1], b: [w2, h2, d2] },
    };
  }

  // hard
  const kind = rng.pick(["multi", "multi", "reverse", "fit"]);
  if (kind === "reverse") {
    const [w, h] = rng.next() < 0.5 ? rng.pick(PHOTO_DIMS) : [rng.int(20, 400) * 4, rng.int(20, 300) * 4];
    const d = rng.pick([1, 2, 4, 8, 16, 24, 32]);
    const bytes = (w * h * d) / 8;
    return {
      prompt: `An uncompressed **${w} × ${h}** pixel image with no header takes exactly **${commas(bytes)} bytes**. What is its colour depth in bits per pixel? 1 byte = 8 bits. Type the whole number.`,
      answerType: "number", answer: d, tolerance: 0,
      explanation: `Turn the size into bits, then share it between the pixels.\n\n- ${commas(bytes)} × 8 = ${commas(bytes * 8)} bits\n- ${w} × ${h} = ${commas(w * h)} pixels\n- ${commas(bytes * 8)} ÷ ${commas(w * h)} = **${d} bits per pixel**`,
      hints: ["Bits per pixel = total bits ÷ number of pixels.", "Total bits = bytes × 8 (calculator: `_bytes * 8 / (_w * _h)`)."],
      given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_bytes", value: bytes }],
      params: { kind: "i-reverse", w, h, bytes },
    };
  }
  if (kind === "fit") {
    for (;;) {
      const [w, h] = rng.pick(CAMERA_DIMS);
      const d = rng.pick([24, 24, 32, 48]);
      const cap = rng.pick([1, 2, 4, 8, 16, 32]);
      const cu = rng.pick(["GB", "GiB"]);
      const bytes = (w * h * d) / 8;
      const ans = Math.floor((cap * SIZE_F[cu]) / bytes);
      if (ans < 2 || Number.isInteger((cap * SIZE_F[cu]) / bytes)) continue;
      return {
        prompt: `A camera saves uncompressed **${w} × ${h}** photos with **${d}-bit** colour (no header). How many whole photos fit on a **${cap} ${cu}** memory card? ${notes([cu])} Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Work out one photo's size in bytes, then divide the card size by it and round **down** (a part photo can't be saved).\n\n- One photo: ${w} × ${h} × ${d} ÷ 8 = ${commas(bytes)} bytes\n- Card: ${cap} × ${commas(SIZE_F[cu])} = ${commas(cap * SIZE_F[cu])} bytes\n- ${commas(cap * SIZE_F[cu])} ÷ ${commas(bytes)} ≈ ${num((cap * SIZE_F[cu]) / bytes)}\n\nWhole photos: **${ans}**`,
        hints: ["One photo in bytes = width × height × depth ÷ 8.", `Card in bytes = ${cap} × ${commas(SIZE_F[cu])}. Divide and round down. Calculator: \`_card * ${SIZE_C[cu]} / (_w * _h * _depth / 8)\`.`],
        given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_depth", value: d }, { label: "_card", value: cap }],
        params: { kind: "i-fit", w, h, d, cap, cu },
      };
    }
  }
  for (;;) {
    let N;
    do { N = rng.int(3, 70000); } while ((N & (N - 1)) === 0);
    const b = Math.ceil(Math.log2(N));
    const [w, h] = rng.next() < 0.5 ? rng.pick(PHOTO_DIMS) : [rng.int(20, 250) * 8, rng.int(20, 200) * 8];
    const unit = rng.pick(["KB", "KiB", "KiB"]);
    const bytes = (w * h * b) / 8;
    const exact = bytes / SIZE_F[unit];
    if (nearTie(exact)) continue;
    return {
      prompt: `A ${w} × ${h} pixel image must show up to **${commas(N)} colours**, using the smallest colour depth that can. ${NO_HEADER} ${notes([unit])}`,
      answerType: "multi",
      parts: [
        { id: "depth", label: "Colour depth", ask: "How many bits per pixel? Type the whole number.", answerType: "number", answer: b, tolerance: 0,
          hint: `Find the smallest b with 2^b ≥ ${commas(N)}.` },
        { id: "size", label: "File size", ask: `How big is the file in ${unit}? ${ROUND}`, answerType: "number", answer: round2(exact), tolerance: 0.005,
          hint: `Width × height × depth gives bits; divide by 8, then by ${commas(SIZE_F[unit])}. Calculator: \`_w * _h * _depth / 8 / ${SIZE_C[unit]}\` with a row \`_depth\`.` },
      ],
      explanation: `Depth first, then size.\n\n- 2^${b - 1} = ${commas(Math.pow(2, b - 1))} < ${commas(N)} ≤ 2^${b} = ${commas(Math.pow(2, b))}, so ${b} bits\n- ${w} × ${h} × ${b} = ${commas(w * h * b)} bits = ${commas(bytes)} bytes\n- ÷ ${commas(SIZE_F[unit])} ≈ ${num(exact)} ${unit}\n\n**Colour depth:** **${b} bits**\n\n**File size:** **${round2(exact).toFixed(2)} ${unit}**`,
      given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_colours", value: N }],
      params: { kind: "i-multi", w, h, N, unit },
    };
  }
}

function verifyImages(q, answer) {
  const p = q.params;
  const x = Number(answer);
  if (p.kind === "i-colours") return Number.isInteger(x) && x === twoTo(p.d);
  if (p.kind === "i-bits") return Number.isInteger(x) && x === bitsFor(p.N);
  if (p.kind === "i-size") {
    const bits = p.w * p.h * p.d;
    const sens = unitFactor(p.unit) * 8;
    if (!p.rounded) return Number.isInteger(x) && x * sens === bits;
    return rounded2Ok(x, sens, bits);
  }
  if (p.kind === "i-ncol") {
    const b = bitsFor(p.N);
    return Number.isInteger(x) && x * 8 === p.w * p.h * b;
  }
  if (p.kind === "i-ratio") {
    const [a, b] = [p.a, p.b];
    return rounded2Ok(x, a[0] * a[1] * a[2], b[0] * b[1] * b[2]);
  }
  if (p.kind === "i-reverse") return Number.isInteger(x) && x * p.w * p.h === p.bytes * 8;
  if (p.kind === "i-fit") {
    const one = (p.w * p.h * p.d) / 8;
    const card = p.cap * unitFactor(p.cu);
    return Number.isInteger(x) && x * one <= card && (x + 1) * one > card;
  }
  if (p.kind === "i-multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    const b = Number(a.depth), s = Number(a.size);
    if (!Number.isInteger(b) || b !== bitsFor(p.N)) return false;
    return rounded2Ok(s, unitFactor(p.unit) * 8, p.w * p.h * b);
  }
  return false;
}

// =============================================================================================
// Subtopic: Sound

const S_RATES = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 96000];
const S_WHAT = ["a voice memo", "a podcast clip", "a ringtone", "a song", "a sound effect", "a radio jingle", "a bird recording", "a drum loop", "an audiobook chapter", "a game soundtrack"];
const chText = (c) => (c === 1 ? "**mono** (1 channel)" : "**stereo** (2 channels)");
const S_NOTE = "The audio is uncompressed, with no header.";

// Duration with the seconds stated too, so calculator values match the prompt.
const durFull = (t) => (t < 60 ? `${t} seconds` : `${durText(t)} (${t} s)`);

function durText(t) {
  const m = Math.floor(t / 60), s = t % 60;
  if (!m) return `${t} seconds`;
  return s ? `${m} min ${s} s` : `${m} minute${m === 1 ? "" : "s"}`;
}

function genSound(difficulty, rng) {
  const what = rng.pick(S_WHAT);
  const r = rng.pick(S_RATES);
  const c = rng.pick([1, 2]);
  if (difficulty === "easy") {
    const kind = rng.pick(["bitrate", "samples", "bytes", "bytes"]);
    const d = rng.pick([8, 16, 24]);
    if (kind === "bitrate") {
      const ans = r * d * c;
      return {
        prompt: `${what[0].toUpperCase()}${what.slice(1)} is recorded at **${commas(r)} Hz** with **${d}-bit** samples in ${chText(c)}. How many **bits per second** does it need? Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Bits per second = sample rate × bit depth × channels.\n\n${commas(r)} × ${d} × ${c} = **${commas(ans)} bits per second**`,
        hints: ["Each second has (sample rate) samples per channel, and each sample uses (bit depth) bits.", "Multiply sample rate × bit depth × channels (calculator: `_rate * _depth * _ch`)."],
        given: [{ label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }],
        params: { kind: "s-size", r, d, c, t: 1, unit: "bit", rounded: false },
      };
    }
    if (kind === "samples") {
      const t = rng.int(2, 90);
      const ans = r * t;
      return {
        prompt: `A microphone samples ${what} at **${commas(r)} Hz** for **${t} seconds**. How many samples does it take **per channel**? Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `${commas(r)} Hz means ${commas(r)} samples every second.\n\n${commas(r)} × ${t} = **${commas(ans)} samples**`,
        hints: ["Hz means \"per second\", so the sample rate is samples per second.", "Multiply by the number of seconds (calculator: `_rate * _t`)."],
        given: [{ label: "_rate", value: r }, { label: "_t", value: t }],
        params: { kind: "s-samples", r, t },
      };
    }
    const t = rng.int(1, 10);
    const ans = (r * d * c * t) / 8;
    return {
      prompt: `How many **bytes** does **${t} second${t === 1 ? "" : "s"}** of ${what} take, recorded at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)}? ${S_NOTE} 1 byte = 8 bits. Type the whole number.`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Size in bits = sample rate × bit depth × channels × seconds; divide by 8 for bytes.\n\n- ${commas(r)} × ${d} × ${c} × ${t} = ${commas(r * d * c * t)} bits\n- ÷ 8 = **${commas(ans)} bytes**`,
      hints: ["Bits = sample rate × bit depth × channels × seconds.", "Then divide by 8 (calculator: `_rate * _depth * _ch * _t / 8`)."],
      given: [{ label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }, { label: "_t", value: t }],
      params: { kind: "s-size", r, d, c, t, unit: "B", rounded: false },
    };
  }

  const d = rng.pick([16, 16, 24, 8]);
  if (difficulty === "medium") {
    const kind = rng.pick(["size", "size", "kbps", "fit"]);
    for (;;) {
      if (kind === "kbps") {
        const exact = (r * d * c) / 1000;
        if (nearTie(exact)) { continue; }
        return {
          prompt: `What is the bit rate of ${what} recorded at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)}, in **kbps**? Take 1 kbps = 1,000 bits per second. ${ROUND}`,
          answerType: "number", answer: round2(exact), tolerance: 0.005,
          explanation: `Bit rate = sample rate × bit depth × channels, then divide by 1,000.\n\n- ${commas(r)} × ${d} × ${c} = ${commas(r * d * c)} bits per second\n- ÷ 1,000 = **${round2(exact).toFixed(2)} kbps**`,
          hints: ["Multiply sample rate × bit depth × channels to get bits per second.", "Divide by 1,000 for kbps (calculator: `_rate * _depth * _ch / 1000`)."],
          given: [{ label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }],
          params: { kind: "s-kbps", r, d, c },
        };
      }
      if (kind === "fit") {
        const cap = rng.pick([10, 25, 50, 100, 200, 500, 700]);
        const cu = rng.pick(["MB", "MiB"]);
        const exact = (cap * SIZE_F[cu] * 8) / (r * d * c) / 60;
        if (nearTie(exact)) { continue; }
        return {
          prompt: `A recorder is set up for ${what}. How many **minutes** of audio recorded at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)} fit in **${cap} ${cu}**? ${S_NOTE} ${notes([cu])} ${ROUND}`,
          answerType: "number", answer: round2(exact), tolerance: 0.005,
          explanation: `Divide the space (in bits) by the bits needed per second, then by 60.\n\n- Space: ${cap} × ${commas(SIZE_F[cu])} × 8 = ${commas(cap * SIZE_F[cu] * 8)} bits\n- Per second: ${commas(r)} × ${d} × ${c} = ${commas(r * d * c)} bits\n- ${commas(cap * SIZE_F[cu] * 8)} ÷ ${commas(r * d * c)} ÷ 60 ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)} minutes**`,
          hints: [`Turn the space into bits: ${cap} × ${commas(SIZE_F[cu])} × 8.`, `Divide by the bits per second (rate × depth × channels), then by 60. Calculator: \`_space * ${SIZE_C[cu]} * 8 / (_rate * _depth * _ch) / 60\`.`],
          given: [{ label: "_space", value: cap }, { label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }],
          params: { kind: "s-fit", r, d, c, cap, cu },
        };
      }
      const t = rng.next() < 0.5 ? rng.int(5, 59) : rng.int(1, 8) * 60 + rng.pick([0, 15, 30, 45]);
      const unit = rng.pick(["MB", "MiB"]);
      const exact = (r * d * c * t) / 8 / SIZE_F[unit];
      if (nearTie(exact) || exact < 0.05) continue;
      return {
        prompt: `How big is **${durFull(t)}** of ${what} recorded at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)}, in **${unit}**? ${S_NOTE} ${notes([unit])} ${ROUND}`,
        answerType: "number", answer: round2(exact), tolerance: 0.005,
        explanation: `Size = sample rate × bit depth × channels × seconds, then convert.\n\n- Time: ${t} s\n- ${commas(r)} × ${d} × ${c} × ${t} = ${commas(r * d * c * t)} bits\n- ÷ 8 = ${commas((r * d * c * t) / 8)} bytes\n- ÷ ${commas(SIZE_F[unit])} ≈ ${num(exact)} ${unit}\n\nRounded: **${round2(exact).toFixed(2)} ${unit}**`,
        hints: [`Use the time in seconds${t >= 60 ? ` (${durText(t)} = ${t} s)` : ""}. Bits = rate × depth × channels × seconds.`, `Divide by 8 for bytes, then by ${commas(SIZE_F[unit])}. Calculator: \`_rate * _depth * _ch * _t / 8 / ${SIZE_C[unit]}\`.`],
        given: [{ label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }, { label: "_t", value: t }],
        params: { kind: "s-size", r, d, c, t, unit, rounded: true },
      };
    }
  }

  // hard
  const kind = rng.pick(["duration", "multi", "multi", "compare"]);
  for (;;) {
    if (kind === "duration") {
      const unit = rng.pick(["MB", "MiB"]);
      const size = rng.int(2, 300) / (rng.next() < 0.5 ? 1 : 10);
      const exact = (size * SIZE_F[unit] * 8) / (r * d * c);
      if (nearTie(exact)) continue;
      return {
        prompt: `An uncompressed recording of ${what} (no header) is **${num(size)} ${unit}**. It was recorded at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)}. How long is it, in **seconds**? ${notes([unit])} ${ROUND}`,
        answerType: "number", answer: round2(exact), tolerance: 0.005,
        explanation: `Work backwards: seconds = size in bits ÷ bits per second.\n\n- Size: ${num(size)} × ${commas(SIZE_F[unit])} × 8 = ${commas(size * SIZE_F[unit] * 8)} bits\n- Per second: ${commas(r)} × ${d} × ${c} = ${commas(r * d * c)} bits\n- ${commas(size * SIZE_F[unit] * 8)} ÷ ${commas(r * d * c)} ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)} seconds**`,
        hints: [`Turn the size into bits: ${num(size)} × ${commas(SIZE_F[unit])} × 8.`, "Bits per second = rate × depth × channels.", `Divide the first by the second. Calculator: \`_size * ${SIZE_C[unit]} * 8 / (_rate * _depth * _ch)\`.`],
        given: [{ label: "_size", value: size }, { label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }],
        params: { kind: "s-dur", r, d, c, size, unit },
      };
    }
    if (kind === "compare") {
      const r2 = rng.pick(S_RATES.filter((x) => x !== r));
      const d2 = rng.pick([8, 16, 24, 32]);
      const c2 = rng.pick([1, 2]);
      const t1 = rng.int(10, 240), t2 = rng.int(10, 240);
      const exact = (r2 * d2 * c2 * t2) / (r * d * c * t1);
      if (nearTie(exact) || exact < 0.05) continue;
      return {
        prompt: `Recording A is **${durFull(t1)}** at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)}. Recording B is **${durFull(t2)}** at **${commas(r2)} Hz**, **${d2}-bit**, ${chText(c2)}. Both are uncompressed with no header. How many times bigger is B than A? (If B is smaller, the answer is below 1.) ${ROUND}`,
        answerType: "number", answer: round2(exact), tolerance: 0.005,
        explanation: `Size is proportional to rate × depth × channels × seconds, so divide B's product by A's.\n\n- A: ${commas(r)} × ${d} × ${c} × ${t1} = ${commas(r * d * c * t1)}\n- B: ${commas(r2)} × ${d2} × ${c2} × ${t2} = ${commas(r2 * d2 * c2 * t2)}\n- B ÷ A ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)}**`,
        hints: ["Each file's size in bits is rate × depth × channels × seconds. The ÷ 8 cancels out in a ratio.", "Calculator: `(_rate2 * _depth2 * _ch2 * _t2) / (_rate1 * _depth1 * _ch1 * _t1)`, with times in seconds."],
        given: [{ label: "_rate1", value: r }, { label: "_depth1", value: d }, { label: "_ch1", value: c }, { label: "_t1", value: t1 },
          { label: "_rate2", value: r2 }, { label: "_depth2", value: d2 }, { label: "_ch2", value: c2 }, { label: "_t2", value: t2 }],
        params: { kind: "s-cmp", a: [r, d, c, t1], b: [r2, d2, c2, t2] },
      };
    }
    const t = rng.int(1, 9) * 60 + rng.int(0, 59);
    const unit = rng.pick(["MB", "MiB"]);
    const kb = (r * d * c) / 1000;
    const exact = (r * d * c * t) / 8 / SIZE_F[unit];
    if (nearTie(exact) || nearTie(kb)) continue;
    return {
      prompt: `${what[0].toUpperCase()}${what.slice(1)} lasts **${durFull(t)}**, recorded at **${commas(r)} Hz**, **${d}-bit**, ${chText(c)}. ${S_NOTE} Take 1 kbps = 1,000 bits per second. ${notes([unit])}`,
      answerType: "multi",
      parts: [
        { id: "rate", label: "Bit rate", ask: `What is the bit rate in kbps? ${ROUND}`, answerType: "number", answer: round2(kb), tolerance: 0.005,
          hint: "Rate × depth × channels gives bits per second; divide by 1,000 (calculator: `_rate * _depth * _ch / 1000`)." },
        { id: "size", label: "File size", ask: `How big is the file in ${unit}? ${ROUND}`, answerType: "number", answer: round2(exact), tolerance: 0.005,
          hint: `Use the time in seconds (${durText(t)} = ${t} s). Bits ÷ 8 gives bytes; divide by ${commas(SIZE_F[unit])}. Calculator: \`_rate * _depth * _ch * _t / 8 / ${SIZE_C[unit]}\`.` },
      ],
      explanation: `Bits per second first, then the whole file.\n\n- ${commas(r)} × ${d} × ${c} = ${commas(r * d * c)} bits per second = ${num(kb)} kbps\n- ${durText(t)} = ${t} s, so ${commas(r * d * c)} × ${t} = ${commas(r * d * c * t)} bits\n- ÷ 8 ÷ ${commas(SIZE_F[unit])} ≈ ${num(exact)} ${unit}\n\n**Bit rate:** **${round2(kb).toFixed(2)} kbps**\n\n**File size:** **${round2(exact).toFixed(2)} ${unit}**`,
      given: [{ label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }, { label: "_t", value: t }],
      params: { kind: "s-multi", r, d, c, t, unit },
    };
  }
}

function verifySound(q, answer) {
  const p = q.params;
  const x = Number(answer);
  if (p.kind === "s-samples") return Number.isInteger(x) && x / p.t === p.r;
  if (p.kind === "s-size") {
    const bits = p.r * p.d * p.c * p.t;
    const sens = p.unit === "bit" ? 1 : unitFactor(p.unit) * 8;
    if (!p.rounded) return Number.isInteger(x) && x * sens === bits;
    return rounded2Ok(x, sens, bits);
  }
  if (p.kind === "s-kbps") return rounded2Ok(x, 1000, p.r * p.d * p.c);
  if (p.kind === "s-fit") return rounded2Ok(x, 60 * p.r * p.d * p.c, p.cap * unitFactor(p.cu) * 8);
  if (p.kind === "s-dur") return rounded2Ok(x, p.r * p.d * p.c, p.size * unitFactor(p.unit) * 8);
  if (p.kind === "s-cmp") return rounded2Ok(x, p.a.reduce((m, v) => m * v, 1), p.b.reduce((m, v) => m * v, 1));
  if (p.kind === "s-multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    const bps = p.r * p.d * p.c;
    return rounded2Ok(Number(a.rate), 1000, bps) && rounded2Ok(Number(a.size), unitFactor(p.unit) * 8, bps * p.t);
  }
  return false;
}

// =============================================================================================
// Subtopic: Characters

const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOW = "abcdefghijklmnopqrstuvwxyz";
// Generation-side ASCII table: position in the alphabet + start code.
const ascii = (ch) => (UP.includes(ch) ? 65 + UP.indexOf(ch) : LOW.includes(ch) ? 97 + LOW.indexOf(ch) : "0123456789".includes(ch) ? 48 + "0123456789".indexOf(ch) : ch === " " ? 32 : NaN);
const fromAscii = (n) => (n >= 65 && n <= 90 ? UP[n - 65] : n >= 97 && n <= 122 ? LOW[n - 97] : n >= 48 && n <= 57 ? String(n - 48) : n === 32 ? " " : null);
const bin8 = (n) => n.toString(2).padStart(8, "0");

const WORDS = ["APPLE", "BREAD", "CHAIR", "HONEY", "RIVER", "STORM", "ZEBRA", "PLANT", "GRAPE", "HOUSE", "TORCH", "CANDLE", "PUZZLE", "BASKET", "FLOWER", "ROCKET", "GARDEN", "PLANET", "WINDOW", "BRIDGE", "COOKIE", "PARROT", "VIOLIN", "TURTLE", "PENCIL", "JUMP", "FROG", "WAVE", "GOLD", "LAMP", "SNOW", "RAIN", "BELL", "NEST", "WOLF", "DUCK",
  "CAT", "SUN", "MAP", "KITE", "MOON", "STAR", "BOOK", "FISH", "TREE", "CAKE", "HELLO", "PIZZA", "ROBOT", "TIGER", "MUSIC", "OCEAN", "CLOUD", "LEMON", "TRAIN", "PIXEL", "BYTE", "CODE", "DATA", "GAME", "CHIP", "DISK", "LOOP", "MOUSE", "SCREEN", "LAPTOP"];
const PHRASES = ["HELLO WORLD", "GOOD MORNING", "SEE YOU SOON", "PIZZA NIGHT", "GAME OVER", "LEVEL UP", "SAVE THE DATE", "HAPPY BIRTHDAY", "WELL DONE", "TRY AGAIN", "NEW HIGH SCORE", "OPEN THE DOOR", "BACK IN FIVE", "MEET AT NOON", "SUNNY DAY", "LUNCH TIME"];

// Non-ASCII characters (written as escapes so the source is unambiguous).
const SPECIAL = [
  { ch: "é", cp: 0xE9 }, { ch: "ñ", cp: 0xF1 }, { ch: "ü", cp: 0xFC }, { ch: "ç", cp: 0xE7 },
  { ch: "ß", cp: 0xDF }, { ch: "£", cp: 0xA3 }, { ch: "©", cp: 0xA9 }, { ch: "°", cp: 0xB0 },
  { ch: "π", cp: 0x3C0 }, { ch: "Ω", cp: 0x3A9 }, { ch: "€", cp: 0x20AC }, { ch: "♥", cp: 0x2665 },
  { ch: "★", cp: 0x2605 }, { ch: "✓", cp: 0x2713 }, { ch: "→", cp: 0x2192 },
  { ch: "\u{1F600}", cp: 0x1F600 }, { ch: "\u{1F3B5}", cp: 0x1F3B5 }, { ch: "\u{1F30D}", cp: 0x1F30D }, { ch: "\u{1F680}", cp: 0x1F680 },
];
const ACCENT_WORDS = ["café", "piñata", "jalapeño", "façade", "naïve", "crème", "résumé", "über", "déjà vu", "señor", "garçon", "fiancée"];
const U_HEX = (cp) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
// UTF-8 length from the code point ranges (generation only).
const utf8Len = (cp) => (cp <= 0x7F ? 1 : cp <= 0x7FF ? 2 : cp <= 0xFFFF ? 3 : 4);
const UTF8_RULE = "UTF-8 uses 1 byte for code points up to U+007F, 2 bytes up to U+07FF, 3 bytes up to U+FFFF and 4 bytes above that.";

// A string with at least one non-ASCII character, from templates.
function specialString(rng) {
  const t = rng.int(0, 4);
  if (t === 0) return rng.pick(ACCENT_WORDS);
  const sp = rng.pick(SPECIAL).ch;
  if (t === 1) return `${sp}${rng.int(2, 99)}`;
  if (t === 2) return `I ${sp} ${rng.pick(WORDS).toLowerCase()}`;
  if (t === 3) return `${rng.pick(WORDS).toLowerCase()} ${sp}`;
  return `${rng.int(5, 40)}${rng.pick(["°C", "°F"])}`;
}
const cpsOf = (s) => Array.from(s).map((ch) => ch.codePointAt(0));
function cpList(s) {
  const seen = new Set();
  const out = [];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7F && !seen.has(ch)) { seen.add(ch); out.push(`${ch} is ${U_HEX(cp)}`); }
  }
  return out.join(", ");
}

function genCharacters(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["code", "code", "char", "store"]);
    if (kind === "code") {
      const lower = rng.next() < 0.4;
      const alpha = lower ? LOW : UP;
      const ref = rng.pick(alpha.split(""));
      let ch;
      do { ch = rng.pick(alpha.split("")); } while (ch === ref);
      const ans = ascii(ch);
      return {
        prompt: `In ASCII, the letter \`${ref}\` has code **${ascii(ref)}**, and the ${lower ? "lower-case" : "capital"} letters have consecutive codes in alphabetical order. What is the ASCII code of \`${ch}\`?`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Count how far ${ch} is from ${ref} in the alphabet and add (or subtract) that.\n\n- ${ch} is ${Math.abs(alpha.indexOf(ch) - alpha.indexOf(ref))} letter${Math.abs(alpha.indexOf(ch) - alpha.indexOf(ref)) === 1 ? "" : "s"} ${alpha.indexOf(ch) > alpha.indexOf(ref) ? "after" : "before"} ${ref}\n- ${ascii(ref)} ${alpha.indexOf(ch) > alpha.indexOf(ref) ? "+" : "−"} ${Math.abs(alpha.indexOf(ch) - alpha.indexOf(ref))} = **${ans}**`,
        hints: [`Letters next to each other have codes 1 apart, so count the steps from ${ref} to ${ch}.`, `Add that number to ${ascii(ref)} if ${ch} comes later, or subtract it if it comes earlier.`],
        params: { kind: "ch-code", ch },
      };
    }
    if (kind === "char") {
      const lower = rng.next() < 0.5;
      const n = (lower ? 97 : 65) + rng.int(1, 24);
      const correct = fromAscii(n);
      const c = textChoices(correct, [fromAscii(n + 1), fromAscii(n - 1), fromAscii(lower ? n - 32 : n + 32), fromAscii(n + 2)], rng);
      return {
        prompt: `In ASCII, \`A\` is **65** and \`a\` is **97**, and each alphabet runs in order. Which character has ASCII code **${n}**?`,
        answerType: "choice", ...c,
        explanation: `Code ${n} is in the ${lower ? "lower-case (97 to 122)" : "capital (65 to 90)"} range.\n\n- ${n} − ${lower ? 97 : 65} = ${n - (lower ? 97 : 65)} steps after ${lower ? "a" : "A"}\n- That is **${correct}**.`,
        hints: ["Capitals run from 65 (A) to 90 (Z); lower-case letters from 97 (a) to 122 (z).", `Work out how many steps ${n} is past the start of its range, then count that many letters on.`],
        params: { kind: "ch-char", n },
      };
    }
    const s = rng.next() < 0.6 ? rng.pick(PHRASES) : `${rng.pick(WORDS)} ${rng.pick(WORDS)}`;
    const per = rng.pick([7, 8, 8]);
    const asBytes = per === 8 && rng.next() < 0.4;
    const ans = asBytes ? s.length : s.length * per;
    return {
      prompt: `How many **${asBytes ? "bytes" : "bits"}** does the text \`${s}\` take in **${per}-bit** ASCII (${per} bits per character, spaces included)?${asBytes ? " 1 byte = 8 bits." : ""} Type the whole number.`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Count every character, including spaces, then multiply.\n\n- \`${s}\` has ${s.length} characters\n- ${asBytes ? `${s.length} characters × 8 bits = ${s.length * 8} bits = **${ans} bytes**` : `${s.length} × ${per} = **${ans} bits**`}`,
      hints: ["Count every character, and remember a space is a character too.", asBytes ? "In 8-bit ASCII each character is exactly one byte." : `Multiply the number of characters by ${per}.`],
      params: { kind: "ch-store", s, per, unit: asBytes ? "byte" : "bit" },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["binary", "decode", "decode", "frombin", "digit"]);
    if (kind === "binary" || kind === "frombin") {
      const pool = rng.pick([UP, LOW, "0123456789"]);
      const ch = rng.pick(pool.split(""));
      const n = ascii(ch);
      const ref = pool === UP ? "`A` is 65" : pool === LOW ? "`a` is 97" : "`0` is 48";
      if (kind === "binary") {
        return {
          prompt: `In ASCII, ${ref} and the codes run in order. Write the ASCII code of \`${ch}\` as an **8-bit binary** number (all 8 digits, like \`01000001\`).`,
          answerType: "text", answer: bin8(n),
          explanation: `First the decimal code, then binary using the place values 128, 64, 32, 16, 8, 4, 2, 1.\n\n- \`${ch}\` = ${n}\n- ${n} = ${[128, 64, 32, 16, 8, 4, 2, 1].filter((v) => n & v).join(" + ")}\n- Binary: **${bin8(n)}**`,
          hints: [`Find the decimal code of \`${ch}\` first by counting on from the reference character.`, "Then go through 128, 64, 32, 16, 8, 4, 2, 1: write 1 and subtract when the place value fits, otherwise write 0."],
          params: { kind: "ch-bin", ch },
        };
      }
      const correct = ch;
      const near = [n + 1, n - 1, n + 32, n - 32, n + 2, n - 2, n ^ 1, n ^ 2].map(fromAscii).filter(Boolean);
      const c = textChoices(correct, rng.shuffle(near), rng);
      return {
        prompt: `In ASCII, \`A\` is 65, \`a\` is 97 and \`0\` is 48, and each range runs in order. Which character is stored as the byte **${bin8(n)}**?`,
        answerType: "choice", ...c,
        explanation: `Turn the byte into decimal, then find the character.\n\n- ${bin8(n)} = ${[128, 64, 32, 16, 8, 4, 2, 1].filter((v) => n & v).join(" + ")} = ${n}\n- Code ${n} is **${correct}**.`,
        hints: ["Add up the place values wherever the byte has a one: the leftmost bit is worth 128, and each bit to its right is worth half as much.", "Then decide which range the code falls in (digits 48 to 57, capitals 65 to 90, lower case 97 to 122) and count on from its start."],
        params: { kind: "ch-frombin", n },
      };
    }
    if (kind === "digit") {
      const dgt = rng.int(1, 9);
      const ans = ascii(String(dgt));
      return {
        prompt: `In ASCII the digit character \`0\` has code **48**, and the digits \`0\` to \`9\` run in order. What is the ASCII code of the **character** \`${dgt}\`?`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `The character \`${dgt}\` is ${dgt} places after \`0\`.\n\n48 + ${dgt} = **${ans}**\n\nThe character \`${dgt}\` and the number ${dgt} are different things: its code is not ${dgt}.`,
        hints: ["A digit character is stored by its code, not by its value.", `Count on from \`0\` (code 48) to \`${dgt}\`.`],
        params: { kind: "ch-code", ch: String(dgt) },
      };
    }
    const lower = rng.next() < 0.4;
    const w = lower ? rng.pick(WORDS).toLowerCase() : rng.pick(WORDS);
    const codes = [...w].map(ascii);
    const [st, A0, Z0] = lower ? [97, "a", "z"] : [65, "A", "Z"];
    return {
      prompt: `In ASCII, \`${A0}\` is ${st} and the ${lower ? "lower-case" : "capital"} letters run in order up to \`${Z0}\` (${st + 25}). Decode this word: **${codes.join(" ")}**. Type the word.`,
      answerType: "text", answer: w,
      explanation: `Subtract ${st} from each code to get the letter's position (${A0} = 0).\n\n${codes.map((c) => `- ${c} − ${st} = ${c - st} → ${fromAscii(c)}`).join("\n")}\n\nWord: **${w}**`,
      hints: [`Each number is one letter. Subtract ${st} to see how many letters after ${A0} it is.`, `For example, ${st + 1} is one after ${A0}, so it is ${lower ? "b" : "B"}.`],
      params: { kind: "ch-decode", codes },
    };
  }

  // hard
  const kind = rng.pick(["utf8", "utf8", "cp", "multi", "one"]);
  if (kind === "cp") {
    const sp = rng.pick(SPECIAL);
    return {
      prompt: `The character ${sp.ch} has the Unicode code point **${U_HEX(sp.cp)}** (the digits after U+ are hexadecimal). What is the code point in **decimal**?`,
      answerType: "number", answer: sp.cp, tolerance: 0,
      explanation: `Read the hex digits with place values 16^k.\n\n- ${U_HEX(sp.cp).slice(2)} = ${[...sp.cp.toString(16).toUpperCase()].map((d, i, a) => `${d} × ${commas(Math.pow(16, a.length - 1 - i))}`).join(" + ")}\n- = **${commas(sp.cp)}**`,
      hints: ["Hex digits A to F stand for 10 to 15.", "Multiply each digit by its place value (1, 16, 256, 4,096, 65,536 from the right) and add."],
      params: { kind: "ch-cp", ch: sp.ch },
    };
  }
  if (kind === "one") {
    const sp = rng.pick([...SPECIAL, { ch: "A", cp: 65 }, { ch: "z", cp: 0x7A }, { ch: "?", cp: 0x3F }]);
    const ans = utf8Len(sp.cp);
    return {
      prompt: `The character \`${sp.ch}\` has code point **${U_HEX(sp.cp)}**. ${UTF8_RULE} How many bytes does it take in UTF-8?`,
      answerType: "number", answer: ans, tolerance: 0,
      explanation: `Compare ${U_HEX(sp.cp)} with the range limits U+007F, U+07FF and U+FFFF.\n\n${U_HEX(sp.cp)} is in the ${["", "first", "second", "third", "fourth"][ans]} range, so it takes **${ans} byte${ans === 1 ? "" : "s"}**.`,
      hints: ["Compare the hex code point with the limits U+007F, U+07FF and U+FFFF, in that order.", "The first limit it does not go over tells you the byte count."],
      params: { kind: "ch-utf8", s: sp.ch },
    };
  }
  let s;
  do { s = specialString(rng); } while (!cpsOf(s).some((cp) => cp > 0x7F));
  const bytes = cpsOf(s).reduce((t, cp) => t + utf8Len(cp), 0);
  const nChars = cpsOf(s).length;
  const breakdown = Array.from(s).map((ch) => `\`${ch === " " ? "space" : ch}\` ${utf8Len(ch.codePointAt(0))}`).join(", ");
  if (kind === "multi") {
    return {
      prompt: `Look at the text \`${s}\` (spaces count as characters). ${cpList(s)}; every other character is plain ASCII. ${UTF8_RULE}`,
      answerType: "multi",
      parts: [
        { id: "chars", label: "Characters", ask: "How many characters (code points) does it have?", answerType: "number", answer: nChars, tolerance: 0,
          hint: "Count every symbol once, including spaces, accented letters and emoji." },
        { id: "bytes", label: "UTF-8 bytes", ask: "How many bytes does it take in UTF-8?", answerType: "number", answer: bytes, tolerance: 0,
          hint: "Plain ASCII characters are 1 byte each. Look up each other character's code point in the ranges and add everything up." },
      ],
      explanation: `Count the characters, then give each one its UTF-8 size.\n\n- Characters: ${nChars}\n- Bytes per character: ${breakdown}\n\n**Characters:** **${nChars}**\n\n**UTF-8 bytes:** **${bytes}**`,
      params: { kind: "ch-multi", s },
    };
  }
  return {
    prompt: `How many bytes does the text \`${s}\` take in UTF-8 (spaces count)? ${cpList(s)}; every other character is plain ASCII. ${UTF8_RULE}`,
    answerType: "number", answer: bytes, tolerance: 0,
    explanation: `Give each character its UTF-8 size and add them.\n\n- ${breakdown}\n- Total: **${bytes} bytes**`,
    hints: ["Plain ASCII characters, including spaces and digits, take 1 byte each.", "For each other character, compare its code point with U+007F, U+07FF and U+FFFF to find its size, then add everything."],
    params: { kind: "ch-utf8", s },
  };
}

function verifyCharacters(q, answer) {
  const p = q.params;
  if (p.kind === "ch-code") { const x = Number(answer); return Number.isInteger(x) && String.fromCharCode(x) === p.ch; }
  if (p.kind === "ch-char") {
    if (!fourDistinct(q)) return false;
    const ok = q.choices.filter((c) => c.length === 1 && c.charCodeAt(0) === p.n);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "ch-frombin") {
    if (!fourDistinct(q)) return false;
    const ok = q.choices.filter((c) => c.length === 1 && c.charCodeAt(0) === p.n);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "ch-store") {
    const x = Number(answer);
    // Count characters one by one.
    let n = 0;
    for (let i = 0; i < p.s.length; i++) n++;
    const bits = n * p.per;
    return Number.isInteger(x) && (p.unit === "byte" ? x * 8 === bits : x === bits);
  }
  if (p.kind === "ch-bin") {
    const a = String(answer).trim();
    if (!/^[01]{8}$/.test(a)) return false;
    let v = 0;
    for (const b of a) v = v * 2 + (b === "1" ? 1 : 0);
    return String.fromCharCode(v) === p.ch;
  }
  if (p.kind === "ch-decode") {
    // Case-insensitive, like the app's text check.
    const a = String(answer).trim();
    if (a.length !== p.codes.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i].toUpperCase() !== String.fromCharCode(p.codes[i]).toUpperCase()) return false;
    return true;
  }
  if (p.kind === "ch-cp") { const x = Number(answer); return Number.isInteger(x) && x > 0 && x <= 0x10FFFF && String.fromCodePoint(x) === p.ch; }
  if (p.kind === "ch-utf8") { const x = Number(answer); return Number.isInteger(x) && x === new TextEncoder().encode(p.s).length; }
  if (p.kind === "ch-multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    // Code points = UTF-16 units minus surrogate pairs.
    const pairs = (p.s.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;
    return Number(a.chars) === p.s.length - pairs && Number(a.bytes) === new TextEncoder().encode(p.s).length;
  }
  return false;
}

// =============================================================================================
// Subtopic: Compression and storage

const RLE_NOTE = "Run-length encoding (RLE) here writes each run as its count followed by the character (for example `AAAB` → `3A1B`), for every run including runs of 1, with no spaces. Every run is at most 9 long.";
const RLE_SETS = ["WB", "RGB", "ABC", "XYZ", "ABCD", "WBG"];
const FILE_KINDS = ["a report", "a photo", "a music album", "a video clip", "a game level", "a presentation", "a spreadsheet", "a backup", "an e-book", "a map pack"];

// Runs → string; generation-side RLE by walking the runs.
function makeRuns(rng, nRuns, maxLen, set) {
  const runs = [];
  let prev = "";
  for (let i = 0; i < nRuns; i++) {
    let c;
    do { c = rng.pick(set.split("")); } while (c === prev);
    runs.push([rng.int(1, maxLen), c]);
    prev = c;
  }
  return runs;
}
const runsToStr = (runs) => runs.map(([n, c]) => c.repeat(n)).join("");
const runsToRle = (runs) => runs.map(([n, c]) => `${n}${c}`).join("");

// Verify-side RLE: regex decode (strict format) and regex encode.
function rleDecode(code) {
  const a = String(code).trim().toUpperCase();
  if (!/^([1-9][A-Z])+$/.test(a)) return null;
  return a.replace(/([1-9])([A-Z])/g, (_, n, c) => c.repeat(Number(n)));
}
function rleEncode(s) {
  return String(s).replace(/(.)\1*/g, (m) => `${m.length}${m[0]}`);
}

function genCompression(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["enc", "dec", "fit", "ratio"]);
    if (kind === "enc" || kind === "dec") {
      const runs = makeRuns(rng, rng.int(3, 5), 6, rng.pick(RLE_SETS));
      const s = runsToStr(runs), code = runsToRle(runs);
      if (kind === "enc") {
        return {
          prompt: `Compress \`${s}\` with run-length encoding. ${RLE_NOTE} Type the encoded text.`,
          answerType: "text", answer: code,
          explanation: `Split the text into runs of the same character and write count + character for each.\n\n${runs.map(([n, c]) => `- ${c.repeat(n)} → ${n}${c}`).join("\n")}\n\nEncoded: **${code}**`,
          hints: [`Split \`${s}\` into groups of the same character next to each other.`, "Write each group as its length followed by the character, and join them with no spaces."],
          params: { kind: "r-enc", s },
        };
      }
      return {
        prompt: `Decode the run-length encoded text \`${code}\`. ${RLE_NOTE} Type the original text.`,
        answerType: "text", answer: s,
        explanation: `Each number says how many times to repeat the character after it.\n\n${runs.map(([n, c]) => `- ${n}${c} → ${c.repeat(n)}`).join("\n")}\n\nDecoded: **${s}**`,
        hints: ["Read the code in pairs: a count, then a character.", "Write each character that many times, in order, with no spaces."],
        params: { kind: "r-dec", code },
      };
    }
    if (kind === "fit") {
      for (;;) {
        const capGB = rng.pick([1, 2, 4, 8, 16, 32, 64]);
        const fileMB = rng.int(3, 900);
        const ans = Math.floor((capGB * 1000) / fileMB);
        if (ans < 2 || (capGB * 1000) % fileMB === 0) continue;
        const what = rng.pick(FILE_KINDS);
        return {
          prompt: `Each copy of ${what} is **${fileMB} MB**. How many whole copies fit on a **${capGB} GB** USB stick? Take 1 GB = 1,000 MB. Type the whole number.`,
          answerType: "number", answer: ans, tolerance: 0,
          explanation: `Convert to the same unit, divide, and round **down**.\n\n- ${capGB} GB = ${commas(capGB * 1000)} MB\n- ${commas(capGB * 1000)} ÷ ${fileMB} ≈ ${num((capGB * 1000) / fileMB)}\n\nWhole copies: **${ans}**`,
          hints: [`Turn ${capGB} GB into MB first.`, "Divide by the file size and round down, because a part copy doesn't count (calculator: `floor(_cap * 1000 / _file)`)."],
          given: [{ label: "_cap", value: capGB }, { label: "_file", value: fileMB }],
          params: { kind: "r-fit", cap: capGB, cu: "GB", file: fileMB, fu: "MB" },
        };
      }
    }
    for (;;) {
      const orig = rng.int(4, 400);
      const comp = rng.int(1, orig - 1);
      const exact = orig / comp;
      if (nearTie(exact) || exact < 1.05) continue;
      const what = rng.pick(FILE_KINDS);
      return {
        prompt: `Compressing ${what} shrinks it from **${orig} MB** to **${comp} MB**. What is the compression ratio, defined as original size ÷ compressed size? ${ROUND}`,
        answerType: "number", answer: round2(exact), tolerance: 0.005,
        explanation: `Divide the original size by the compressed size.\n\n${orig} ÷ ${comp} ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)}** (it is ${round2(exact).toFixed(2)} times smaller)`,
        hints: ["Compression ratio = original ÷ compressed, so it is bigger than 1 when the file shrinks.", "Calculator: `_orig / _comp`."],
        given: [{ label: "_orig", value: orig }, { label: "_comp", value: comp }],
        params: { kind: "r-ratio", orig, comp },
      };
    }
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["len", "saving", "compsize", "fit"]);
    if (kind === "len") {
      const runs = makeRuns(rng, rng.int(5, 8), 9, rng.pick(RLE_SETS));
      const s = runsToStr(runs), code = runsToRle(runs);
      const more = rng.next() < 0.5;
      const ans = more ? s.length - code.length : code.length;
      if (more && ans <= 0) {
        // Ask for the encoded length instead when RLE doesn't save anything.
        return rleLenQ(s, code, runs, false);
      }
      return rleLenQ(s, code, runs, more);
    }
    if (kind === "saving") {
      for (;;) {
        const orig = rng.int(20, 900);
        const comp = rng.int(Math.ceil(orig * 0.1), orig - 1);
        const exact = ((orig - comp) / orig) * 100;
        if (nearTie(exact)) continue;
        const u = rng.pick(["KB", "MB"]);
        return {
          prompt: `A file shrinks from **${orig} ${u}** to **${comp} ${u}** when compressed. By what **percentage** was its size reduced? Type the number without the % sign. ${ROUND}`,
          answerType: "number", answer: round2(exact), tolerance: 0.005,
          explanation: `Saving = (original − compressed) ÷ original × 100.\n\n- ${orig} − ${comp} = ${orig - comp}\n- ${orig - comp} ÷ ${orig} × 100 ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)}%**`,
          hints: ["Find how much was saved: original − compressed.", "Divide the saving by the **original** size and multiply by 100 (calculator: `(_orig - _comp) / _orig * 100`)."],
          given: [{ label: "_orig", value: orig }, { label: "_comp", value: comp }],
          params: { kind: "r-saving", orig, comp },
        };
      }
    }
    if (kind === "compsize") {
      for (;;) {
        const orig = rng.int(10, 2000);
        const ratio = rng.pick([1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12]);
        const exact = orig / ratio;
        if (nearTie(exact)) continue;
        const u = rng.pick(["KB", "MB"]);
        const what = rng.pick(FILE_KINDS);
        return {
          prompt: `${what[0].toUpperCase()}${what.slice(1)} is **${orig} ${u}**. A compression tool achieves a ratio of **${ratio}** (original size ÷ compressed size). How big is the compressed file, in ${u}? ${ROUND}`,
          answerType: "number", answer: round2(exact), tolerance: 0.005,
          explanation: `Ratio = original ÷ compressed, so compressed = original ÷ ratio.\n\n${orig} ÷ ${ratio} ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)} ${u}**`,
          hints: ["Rearrange ratio = original ÷ compressed to find the compressed size.", "Calculator: `_orig / _ratio`."],
          given: [{ label: "_orig", value: orig }, { label: "_ratio", value: ratio }],
          params: { kind: "r-compsize", orig, ratio },
        };
      }
    }
    for (;;) {
      const cap = rng.pick([1, 2, 4, 8, 16, 32]);
      const file = rng.int(5, 900);
      const iec = rng.next() < 0.5;
      const cu = iec ? "GiB" : "GB", fu = iec ? "MiB" : "MB";
      const per = iec ? 1024 : 1000;
      const ans = Math.floor((cap * per) / file);
      if (ans < 2 || (cap * per) % file === 0) continue;
      const what = rng.pick(FILE_KINDS);
      return {
        prompt: `How many whole copies of ${what} of **${file} ${fu}** fit in **${cap} ${cu}** of free space? Take 1 ${cu} = ${commas(per)} ${fu}. Type the whole number.`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Convert to ${fu}, divide, and round **down**.\n\n- ${cap} ${cu} = ${commas(cap * per)} ${fu}\n- ${commas(cap * per)} ÷ ${file} ≈ ${num((cap * per) / file)}\n\nWhole copies: **${ans}**`,
        hints: [`Turn ${cap} ${cu} into ${fu}: multiply by ${commas(per)}.`, `Divide by the file size and round down (calculator: \`floor(_cap * ${per} / _file)\`).`],
        given: [{ label: "_cap", value: cap }, { label: "_file", value: file }],
        params: { kind: "r-fit", cap, cu, file, fu },
      };
    }
  }

  // hard
  const kind = rng.pick(["choice", "multi", "photo", "photo"]);
  if (kind === "choice") {
    const runs = makeRuns(rng, rng.int(4, 6), 9, rng.pick(RLE_SETS));
    if (!runs.some(([n]) => n === 1)) runs[rng.int(0, runs.length - 1)][0] = 1;
    if (!runs.some(([n]) => n > 2)) runs[0][0] = rng.int(3, 9);
    const s = runsToStr(runs), code = runsToRle(runs);
    const swapped = runs.map(([n, c]) => `${c}${n}`).join("");
    const noOnes = runs.map(([n, c]) => (n === 1 ? c : `${n}${c}`)).join("");
    const i = runs.findIndex(([n]) => n > 1 && n < 9);
    const off = runs.map(([n, c], k) => `${k === i ? n + 1 : n}${c}`).join("");
    const merged = runs.map(([, c]) => c).join("");
    const ch = textChoices(code, [swapped, noOnes, off, merged], rng);
    return {
      prompt: `Which is the correct run-length encoding of \`${s}\`? ${RLE_NOTE}`,
      answerType: "choice", ...ch,
      explanation: `Split into runs and write count + character for each, including runs of 1.\n\n${runs.map(([n, c]) => `- ${c.repeat(n)} → ${n}${c}`).join("\n")}\n\nAnswer: **${code}**`,
      hints: ["The count comes **before** the character, and a single character still needs a 1.", "Count each run carefully, then check each option against your counts."],
      params: { kind: "r-choice", s },
    };
  }
  if (kind === "multi") {
    for (;;) {
      const runs = makeRuns(rng, rng.int(4, 7), 9, rng.pick(RLE_SETS));
      const s = runsToStr(runs), code = runsToRle(runs);
      const exact = s.length / code.length;
      if (nearTie(exact)) continue;
      return {
        prompt: `A row of pixels is stored as the text \`${s}\` (${s.length} characters, one per pixel). ${RLE_NOTE} Compression ratio here means original characters ÷ encoded characters.`,
        answerType: "multi",
        parts: [
          { id: "code", label: "Encoded", ask: "Write the run-length encoding.", answerType: "text", answer: code,
            hint: "Split the row into runs of the same character; write each as count then character." },
          { id: "ratio", label: "Ratio", ask: `What is the compression ratio? ${ROUND}`, answerType: "number", answer: round2(exact), tolerance: 0.005,
            hint: `The original has ${s.length} characters. Count the characters in your encoding and divide (calculator: \`_orig / _enc\`, adding a row \`_enc\`).` },
        ],
        explanation: `Encode, then compare the lengths.\n\n${runs.map(([n, c]) => `- ${c.repeat(n)} → ${n}${c}`).join("\n")}\n- ${s.length} ÷ ${code.length} ≈ ${num(exact)}\n\n**Encoded:** **${code}**\n\n**Ratio:** **${round2(exact).toFixed(2)}**${exact < 1 ? " (below 1, so RLE made this row bigger)" : ""}`,
        given: [{ label: "_orig", value: s.length }],
        params: { kind: "r-multi", s },
      };
    }
  }
  for (;;) {
    const [w, h] = rng.pick(CAMERA_DIMS);
    const ratio = rng.pick([2, 4, 5, 8, 10, 12, 15, 20]);
    const cap = rng.pick([4, 8, 16, 32, 64]);
    const bytes = (w * h * 24) / 8;
    const mb = bytes / 1e6;
    const compBytes = bytes / ratio;
    const n = Math.floor((cap * 1e9) / compBytes);
    if (nearTie(mb) || Number.isInteger((cap * 1e9) / compBytes)) continue;
    return {
      prompt: `A camera takes **${w} × ${h}** photos with **24-bit** colour, then compresses each one with a ratio of **${ratio}** (original ÷ compressed). The memory card holds **${cap} GB**. Take 1 MB = 1,000,000 bytes, 1 GB = 1,000,000,000 bytes and 1 byte = 8 bits. Ignore headers.`,
      answerType: "multi",
      parts: [
        { id: "raw", label: "Uncompressed size", ask: `How big is one photo **before** compression, in MB? ${ROUND}`, answerType: "number", answer: round2(mb), tolerance: 0.005,
          hint: "Width × height × 24 gives bits; divide by 8 and by 1,000,000 (calculator: `_w * _h * 24 / 8 / 1e6`)." },
        { id: "fit", label: "Photos that fit", ask: "How many whole compressed photos fit on the card? Use the exact size, not your rounded one.", answerType: "number", answer: n, tolerance: 0,
          hint: "Divide the uncompressed size by the ratio, then divide the card size (in bytes) by that and round down (calculator: `floor(_card * 1e9 / (_w * _h * 3 / _ratio))`)." },
      ],
      explanation: `Raw size, then compressed size, then how many fit.\n\n- Raw: ${w} × ${h} × 24 ÷ 8 = ${commas(bytes)} bytes ≈ ${num(mb)} MB\n- Compressed: ${commas(bytes)} ÷ ${ratio} = ${commas(compBytes)} bytes\n- Card: ${cap} × 1,000,000,000 ÷ ${commas(compBytes)} ≈ ${num((cap * 1e9) / compBytes)}, rounded down\n\n**Uncompressed size:** **${round2(mb).toFixed(2)} MB**\n\n**Photos that fit:** **${commas(n)}**`,
      given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_ratio", value: ratio }, { label: "_card", value: cap }],
      params: { kind: "r-photo", w, h, ratio, cap },
    };
  }
}

function rleLenQ(s, code, runs, more) {
  return {
    prompt: more
      ? `A row of pixels is stored as \`${s}\`. ${RLE_NOTE} How many **characters shorter** is the encoded version than the original?`
      : `A row of pixels is stored as \`${s}\`. ${RLE_NOTE} How many characters long is the encoded version?`,
    answerType: "number", answer: more ? s.length - code.length : code.length, tolerance: 0,
    explanation: `Each run becomes 2 characters (one digit and one letter).\n\n- Runs: ${runs.map(([n, c]) => c.repeat(n)).join(" | ")}\n- ${runs.length} runs × 2 = ${code.length} characters${more ? `\n- Original: ${s.length} characters, so ${s.length} − ${code.length} = **${s.length - code.length}** fewer` : `\n\nEncoded length: **${code.length}**`}`,
    hints: ["Every run, even a run of 1, becomes a count digit plus a character.", more ? "Count the runs to get the encoded length, count the original characters, then subtract." : "So count the runs and work out how many characters they turn into."],
    params: { kind: more ? "r-shorter" : "r-len", s },
  };
}

function verifyCompression(q, answer) {
  const p = q.params;
  const x = Number(answer);
  if (p.kind === "r-enc") { const d = rleDecode(answer); return d !== null && d === p.s && rleEncode(d) === String(answer).trim().toUpperCase(); }
  if (p.kind === "r-dec") { const a = String(answer).trim().toUpperCase(); return /^[A-Z]+$/.test(a) && rleEncode(a) === p.code; }
  if (p.kind === "r-len") return Number.isInteger(x) && x === rleEncode(p.s).length;
  if (p.kind === "r-shorter") return Number.isInteger(x) && x === p.s.length - rleEncode(p.s).length;
  if (p.kind === "r-fit") {
    const cap = p.cap * unitFactor(p.cu), file = p.file * unitFactor(p.fu);
    return Number.isInteger(x) && x * file <= cap && (x + 1) * file > cap;
  }
  if (p.kind === "r-ratio") return rounded2Ok(x, p.comp, p.orig);
  if (p.kind === "r-saving") return rounded2Ok(x, p.orig / 100, p.orig - p.comp);
  if (p.kind === "r-compsize") return rounded2Ok(x, p.ratio, p.orig);
  if (p.kind === "r-choice") {
    if (!fourDistinct(q)) return false;
    const ok = q.choices.filter((c) => rleDecode(c) === p.s && rleEncode(p.s) === c);
    return ok.length === 1 && ok[0] === String(answer);
  }
  if (p.kind === "r-multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    const code = String(a.code ?? "").trim().toUpperCase();
    if (rleDecode(code) !== p.s || rleEncode(p.s) !== code) return false;
    return rounded2Ok(Number(a.ratio), code.length, p.s.length);
  }
  if (p.kind === "r-photo") {
    const a = answer && typeof answer === "object" ? answer : {};
    const bits = p.w * p.h * 24;
    if (!rounded2Ok(Number(a.raw), 8e6, bits)) return false;
    const n = Number(a.fit);
    const card = p.cap * unitFactor("GB") * 8 * p.ratio; // compare in "bits × ratio"
    return Number.isInteger(n) && n * bits <= card && (n + 1) * bits > card;
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
  if (difficulty === "expert") return stateWhole(genExpert(subtopic, rng));
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "images") return stateWhole(genImages(difficulty, rng));
  if (subtopic === "sound") return stateWhole(genSound(difficulty, rng));
  if (subtopic === "characters") return stateWhole(genCharacters(difficulty, rng));
  if (subtopic === "compression") return stateWhole(genCompression(difficulty, rng));
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check (see the header).
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.kind) return false;
  if (answer === "" || answer === null || answer === undefined) return false;
  try {
    if (p.kind.startsWith("x-")) return verifyExpert(p, question, answer);
    if (p.kind.startsWith("i-")) return verifyImages(question, answer);
    if (p.kind.startsWith("s-")) return verifySound(question, answer);
    if (p.kind.startsWith("ch-")) return verifyCharacters(question, answer);
    if (p.kind.startsWith("r-")) return verifyCompression(question, answer);
  } catch {
    return false;
  }
  return false;
}

// =============================================================================================
// Expert. A separate branch: generate() dispatches here before its difficulty check, so
// easy/medium/hard draws are unchanged. Hints use only values already drawn. Params kinds start
// with "x-"; verifyExpert checks with unit factors from unit names, residual and inequality
// checks, TextEncoder / TextDecoder for UTF-8, and an exhaustive search for Huffman costs.

const xv = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);
const xnum = (answer, id) => {
  const v = xv(answer, id);
  return v === "" || v === null || v === undefined ? NaN : Number(v);
};
const tidy = (x) => commas(Math.round(x * 100) / 100);

// ---- images / expert ----

function xPalette(rng) {
  for (;;) {
    let N;
    do N = rng.int(5, 256); while ((N & (N - 1)) === 0 && rng.next() < 0.8);
    const b = Math.ceil(Math.log2(N));
    const w = rng.int(8, 120) * 8;
    const h = rng.int(40, 900);
    const pix = (w * h * b) / 8;
    const pal = N * 3;
    const idx = pix + pal;
    const tru = w * h * 3;
    const saving = ((tru - idx) / tru) * 100;
    if (nearTie(saving) || saving <= 0) continue;
    return {
      prompt: `A **${w} × ${h}** pixel image uses only **${N} different colours**. As true colour it would use 24 bits (3 bytes) per pixel. Instead it is saved as an **indexed** image: each pixel stores a palette number using the fewest bits that can count all ${N} colours, plus a palette table of ${N} entries × 3 bytes. No other header.`,
      answerType: "multi",
      parts: [
        { id: "bpp", label: "Bits per pixel", ask: "How many bits does each pixel's palette number use?", answerType: "number", answer: b, tolerance: 0,
          hint: `Find the smallest b with 2^b ≥ ${N}.` },
        { id: "size", label: "Indexed size", ask: "Total size of the indexed image in bytes, palette included.", answerType: "number", answer: idx, tolerance: 0,
          hint: "Pixel data = width × height × b ÷ 8 bytes; add the palette, 3 bytes per colour." },
        { id: "saving", label: "Saving", ask: "By what percentage is that smaller than the true-colour image? Round to 2 decimal places.", answerType: "number", answer: round2(saving), tolerance: 0.005,
          hint: "Percentage saved = (true-colour size − indexed size) ÷ true-colour size × 100." },
      ],
      explanation: `- Bits per pixel: 2^${b - 1} = ${2 ** (b - 1)} < ${N} ≤ 2^${b} = ${2 ** b}, so **${b}**.\n- Pixel data: ${w} × ${h} × ${b} ÷ 8 = ${commas(pix)} bytes; palette: ${N} × 3 = ${pal} bytes; total **${commas(idx)}** bytes.\n- True colour: ${w} × ${h} × 3 = ${commas(tru)} bytes.\n- Saving: (${commas(tru)} − ${commas(idx)}) ÷ ${commas(tru)} × 100 ≈ **${round2(saving).toFixed(2)}%**.`,
      given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_colours", value: N }],
      params: { kind: "x-palette", w, h, N },
      hints: [
        `The palette numbers run from 0 to ${N - 1}, so they need enough bits for ${N} values.`,
        "Indexed size = pixel data + palette. True-colour size = width × height × 3 bytes.",
        "Calculator, after adding a row `_b` for the bits: `_w * _h * _b / 8 + _colours * 3`.",
      ],
    };
  }
}

function xVideo(rng) {
  for (;;) {
    const [w, h] = rng.pick(PHOTO_DIMS);
    const fps = rng.pick([24, 25, 30, 50, 60]);
    const t = rng.int(5, 120);
    const frame = (w * h * 24) / 8 / 1e6;
    const rate = (w * h * 24 * fps) / 1e6;
    const total = (w * h * 3 * fps * t) / 1e9;
    if ([frame, rate, total].some(nearTie)) continue;
    return {
      prompt: `An uncompressed video is **${w} × ${h}** pixels, **24-bit** colour, at **${fps} frames per second**, and lasts **${t} seconds**. No audio and no header. ${notes(["MB", "GB"])} 1 Mbps = 1,000,000 bits per second.`,
      answerType: "multi",
      parts: [
        { id: "frame", label: "One frame", ask: "Size of one frame in MB. Round to 2 decimal places.", answerType: "number", answer: round2(frame), tolerance: 0.005,
          hint: "One frame is one image: width × height × 24 bits, then ÷ 8 for bytes and ÷ 1,000,000 for MB." },
        { id: "rate", label: "Data rate", ask: "Data rate needed to play it, in Mbps. Round to 2 decimal places.", answerType: "number", answer: round2(rate), tolerance: 0.005,
          hint: "Bits per frame × frames per second, then ÷ 1,000,000." },
        { id: "total", label: "Whole clip", ask: "Size of the whole clip in GB. Round to 2 decimal places.", answerType: "number", answer: round2(total), tolerance: 0.005,
          hint: `Bytes per frame × ${fps} × ${t}, then ÷ 1,000,000,000.` },
      ],
      explanation: `- One frame: ${w} × ${h} × 24 = ${commas(w * h * 24)} bits = ${commas(w * h * 3)} bytes ≈ **${round2(frame).toFixed(2)} MB**\n- Data rate: ${commas(w * h * 24)} × ${fps} = ${commas(w * h * 24 * fps)} bits/s ≈ **${round2(rate).toFixed(2)} Mbps**\n- Whole clip: ${commas(w * h * 3)} × ${fps} × ${t} = ${commas(w * h * 3 * fps * t)} bytes ≈ **${round2(total).toFixed(2)} GB**`,
      given: [{ label: "_w", value: w }, { label: "_h", value: h }, { label: "_fps", value: fps }, { label: "_t", value: t }],
      params: { kind: "x-video", w, h, fps, t },
      hints: [
        "A video is a sequence of images: work out one frame first, exactly like an image.",
        "Data rate is bits per second: bits in one frame × frames per second.",
        "Calculator: `_w * _h * 3 * _fps * _t / 1e9` gives the whole clip in GB.",
      ],
    };
  }
}

const ASPECTS = [[16, 9], [4, 3], [3, 2], [1, 1], [21, 9], [5, 4]];

function xDimsBack(rng) {
  const [a, b] = rng.pick(ASPECTS);
  const k = rng.int(8, 160) * (a === 1 ? 4 : 1);
  const d = rng.pick([8, 16, 24, 32]);
  const w = a * k, h = b * k;
  const bytes = (w * h * d) / 8;
  if (!Number.isInteger(bytes)) return xDimsBack(rng);
  return {
    prompt: `An uncompressed image with no header has an aspect ratio of exactly **${a}:${b}** (width : height) and **${d}-bit** colour. Its file is exactly **${commas(bytes)} bytes**. 1 byte = 8 bits.`,
    answerType: "multi",
    parts: [
      { id: "w", label: "Width", ask: "Width in pixels", answerType: "number", answer: w, tolerance: 0,
        hint: `Write width = ${a}k and height = ${b}k; then ${a}k × ${b}k = pixels, so k² = pixels ÷ ${a * b}.` },
      { id: "h", label: "Height", ask: "Height in pixels", answerType: "number", answer: h, tolerance: 0,
        hint: `Once you have k, the height is ${b}k.` },
    ],
    explanation: `- Pixels: ${commas(bytes)} × 8 ÷ ${d} = ${commas(w * h)}\n- With width ${a}k and height ${b}k: ${a * b}k² = ${commas(w * h)}, so k² = ${commas(k * k)} and k = ${k}\n- Width = ${a} × ${k} = **${w}**, height = ${b} × ${k} = **${h}**`,
    given: [{ label: "_bytes", value: bytes }, { label: "_depth", value: d }, { label: "_a", value: a }, { label: "_b", value: b }],
    params: { kind: "x-dims", a, b, d, bytes },
    hints: [
      "Work backwards: bytes → bits → number of pixels (bits ÷ colour depth).",
      `The ratio ${a}:${b} means width = ${a}k and height = ${b}k for some whole number k.`,
      "Calculator: `sqrt(_bytes * 8 / _depth / (_a * _b))` gives k.",
    ],
  };
}

// ---- sound / expert ----

function xSoundBack(rng) {
  const r = rng.pick(S_RATES);
  const d = rng.pick([8, 16, 24]);
  const c = rng.int(1, 2);
  const t = rng.int(2, 90);
  const bytes = (r * d * c * t) / 8;
  if (!Number.isInteger(bytes)) return xSoundBack(rng);
  return {
    prompt: `A ${chText(c)} recording at **${d}-bit** lasts **${t} seconds** and takes exactly **${commas(bytes)} bytes** (${S_NOTE.toLowerCase().replace(/\.$/, "")}). 1 byte = 8 bits. A sample rate can capture sounds up to **half** its value (the Nyquist limit).`,
    answerType: "multi",
    parts: [
      { id: "rate", label: "Sample rate", ask: "What is the sample rate, in Hz (samples per second)?", answerType: "number", answer: r, tolerance: 0,
        hint: "Size in bits = rate × depth × channels × seconds. Rearrange for the rate." },
      { id: "nyq", label: "Highest frequency", ask: "What is the highest frequency it can capture, in Hz?", answerType: "number", answer: r / 2, tolerance: 0,
        hint: "Halve the sample rate." },
    ],
    explanation: `- Bits: ${commas(bytes)} × 8 = ${commas(bytes * 8)}\n- Rate = bits ÷ (depth × channels × seconds) = ${commas(bytes * 8)} ÷ (${d} × ${c} × ${t}) = **${commas(r)} Hz**\n- Highest frequency: ${commas(r)} ÷ 2 = **${commas(r / 2)} Hz**`,
    given: [{ label: "_bytes", value: bytes }, { label: "_depth", value: d }, { label: "_ch", value: c }, { label: "_t", value: t }],
    params: { kind: "x-soundback", d, c, t, bytes },
    hints: [
      "Turn the size into bits first.",
      `Every second holds rate × ${d} × ${c} bits, so divide the bits by ${d} × ${c} × ${t}. Calculator: \`_bytes * 8 / (_depth * _ch * _t)\`.`,
    ],
  };
}

function xSoundFit(rng) {
  for (;;) {
    const r = rng.pick([22050, 44100, 48000, 96000]);
    const d = rng.pick([16, 24]);
    const c = rng.int(1, 2);
    const cap = rng.pick([1, 2, 4, 8, 16]);
    const kb = rng.pick([96, 128, 160, 192, 256, 320]);
    const perMin = (r * d * c * 60) / 8;
    const mp3PerMin = (kb * 1000 * 60) / 8;
    const raw = Math.floor((cap * 1e9) / perMin);
    const mp3 = Math.floor((cap * 1e9) / mp3PerMin);
    if (raw < 1 || Number.isInteger((cap * 1e9) / perMin) || Number.isInteger((cap * 1e9) / mp3PerMin)) continue;
    return {
      prompt: `A recorder saves ${chText(c)} audio at **${commas(r)} Hz** and **${d}-bit**, uncompressed. Its card holds **${cap} GB** (1 GB = 1,000,000,000 bytes; 1 byte = 8 bits). It can instead save compressed audio at **${kb} kbps** (1 kbps = 1,000 bits per second).`,
      answerType: "multi",
      parts: [
        { id: "raw", label: "Uncompressed", ask: "How many whole minutes of uncompressed audio fit on the card?", answerType: "number", answer: raw, tolerance: 0,
          hint: "One minute uses rate × depth × channels × 60 bits. Divide the card's bits by that and round down." },
        { id: "mp3", label: "Compressed", ask: `How many whole minutes fit at ${kb} kbps?`, answerType: "number", answer: mp3, tolerance: 0,
          hint: `At ${kb} kbps one minute uses ${kb} × 1,000 × 60 bits. Divide and round down.` },
      ],
      explanation: `- One minute uncompressed: ${commas(r)} × ${d} × ${c} × 60 = ${commas(perMin * 8)} bits = ${commas(perMin)} bytes\n- Card: ${commas(cap * 1e9)} bytes ÷ ${commas(perMin)} ≈ ${num((cap * 1e9) / perMin)} → **${commas(raw)}** whole minutes\n- One minute at ${kb} kbps: ${commas(mp3PerMin)} bytes, so ${commas(cap * 1e9)} ÷ ${commas(mp3PerMin)} ≈ ${num((cap * 1e9) / mp3PerMin)} → **${commas(mp3)}** whole minutes`,
      given: [{ label: "_rate", value: r }, { label: "_depth", value: d }, { label: "_ch", value: c }, { label: "_card", value: cap }, { label: "_kbps", value: kb }],
      params: { kind: "x-soundfit", r, d, c, cap, kb },
      hints: [
        "Work out how many bytes one minute takes in each format, then divide the card size by it.",
        "Round **down**: a part minute doesn't count as a whole minute.",
        "Calculator: `floor(_card * 1e9 * 8 / (_rate * _depth * _ch * 60))` for the uncompressed part.",
      ],
    };
  }
}

const FREQS = [4, 5, 7.5, 8, 10, 11, 12, 15, 16, 20, 22, 24, 30];

function xSoundChoose(rng) {
  for (;;) {
    const F = rng.pick(FREQS);
    const pi = S_RATES.findIndex((x) => x >= 2 * F * 1000);
    if (pi < 0) continue;
    const d = rng.pick([16, 24]);
    const c = rng.int(1, 2);
    const t = rng.int(10, 600);
    const mb = (S_RATES[pi] * d * c * t) / 8 / 1e6;
    if (nearTie(mb)) continue;
    const lo = Math.max(0, Math.min(pi - 1, S_RATES.length - 4));
    const opts = S_RATES.slice(lo, lo + 4).map((x) => `${commas(x)} Hz`);
    return {
      prompt: `A recording must capture sounds up to **${F} kHz**. A sample rate can capture frequencies up to **half** its value (the Nyquist limit). The recorder offers: ${opts.join(", ")}. It records ${chText(c)} at **${d}-bit** for **${durFull(t)}**, uncompressed with no header. Take 1 MB = 1,000,000 bytes and 1 byte = 8 bits.`,
      answerType: "multi",
      parts: [
        { id: "rate", label: "Sample rate", ask: "Which is the lowest offered rate that is enough?", answerType: "choice", answer: `${commas(S_RATES[pi])} Hz`, choices: opts,
          hint: `You need a rate of at least 2 × ${F} kHz. Equal to that is enough.` },
        { id: "size", label: "File size", ask: "How big is the recording at that rate, in MB? Round to 2 decimal places.", answerType: "number", answer: round2(mb), tolerance: 0.005,
          hint: "Size in bits = rate × depth × channels × seconds; then ÷ 8 and ÷ 1,000,000." },
      ],
      explanation: `- Needed: at least 2 × ${F} kHz = ${commas(2 * F * 1000)} Hz. The lowest offered rate that reaches it is **${commas(S_RATES[pi])} Hz**${pi > lo ? ` (${commas(S_RATES[pi - 1])} Hz only reaches ${commas(S_RATES[pi - 1] / 2)} Hz)` : ""}.\n- Size: ${commas(S_RATES[pi])} × ${d} × ${c} × ${t} = ${commas(S_RATES[pi] * d * c * t)} bits = ${commas((S_RATES[pi] * d * c * t) / 8)} bytes ≈ **${round2(mb).toFixed(2)} MB**`,
      given: [{ label: "_depth", value: d }, { label: "_ch", value: c }, { label: "_t", value: t }],
      params: { kind: "x-soundchoose", F, d, c, t, opts },
      hints: [
        `Double the highest frequency: the rate must be at least 2 × ${F} kHz.`,
        "Pick the smallest offered rate that is not below that.",
        "Then the usual size formula. Calculator: add a row `_rate` and use `_rate * _depth * _ch * _t / 8 / 1e6`.",
      ],
    };
  }
}

// ---- characters / expert ----

const hx2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// Generation-side UTF-8 encoder from the bit layout.
function utf8Bytes(cp) {
  if (cp <= 0x7f) return [cp];
  if (cp <= 0x7ff) return [0xc0 | (cp >> 6), 0x80 | (cp & 63)];
  if (cp <= 0xffff) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
}
const UTF8_LAYOUT = "UTF-8 layouts: 2 bytes `110xxxxx 10xxxxxx` (11 bits, up to U+07FF), 3 bytes `1110xxxx 10xxxxxx 10xxxxxx` (16 bits, up to U+FFFF), 4 bytes `11110xxx 10xxxxxx 10xxxxxx 10xxxxxx` (21 bits). The code point's bits fill the x's from the right.";

function randomCp(rng) {
  const n = rng.pick([2, 2, 3, 3, 4]);
  if (n === 2) return rng.int(0x80, 0x7ff);
  if (n === 3) {
    let cp;
    do cp = rng.int(0x800, 0xffff); while (cp >= 0xd800 && cp <= 0xdfff);
    return cp;
  }
  return rng.int(0x10000, 0x10ffff);
}

function layoutLines(cp, bytes) {
  const n = bytes.length;
  const bitsN = [0, 7, 11, 16, 21][n];
  const bits = cp.toString(2).padStart(bitsN, "0");
  return `${U_HEX(cp)} = ${cp} needs ${n} bytes. Its ${bitsN} bits are \`${bits}\`.\n\nFilled into the layout: ${bytes.map((x) => `\`${x.toString(2).padStart(8, "0")}\``).join(" ")} = ${bytes.map(hx2).join(" ")} in hex.`;
}

function xUtf8Enc(rng) {
  const cp = randomCp(rng);
  const bytes = utf8Bytes(cp);
  return {
    prompt: `Encode the code point **${U_HEX(cp)}** in UTF-8. ${UTF8_LAYOUT}`,
    answerType: "multi",
    parts: [
      { id: "n", label: "Bytes", ask: "How many bytes does it take?", answerType: "number", answer: bytes.length, tolerance: 0,
        hint: "Compare the code point with U+007F, U+07FF and U+FFFF." },
      { id: "first", label: "First byte", ask: "The first byte, as 2 hex digits (like `C3`).", answerType: "text", answer: hx2(bytes[0]),
        hint: "Write the code point in binary, padded to the layout's number of bits. The first byte is the prefix (110, 1110 or 11110) followed by the leftmost bits." },
      { id: "last", label: "Last byte", ask: "The last byte, as 2 hex digits.", answerType: "text", answer: hx2(bytes[bytes.length - 1]),
        hint: "The last byte is `10` followed by the code point's lowest 6 bits." },
    ],
    explanation: layoutLines(cp, bytes),
    params: { kind: "x-utf8enc", cp },
    hints: [
      `First decide the length: ${U_HEX(cp)} compared with U+007F, U+07FF and U+FFFF.`,
      "Write the hex code point in binary (4 bits per hex digit), then pad with zeros on the left to 11, 16 or 21 bits.",
      "Fill the x's from the right: the last 6 bits go in the last byte, the 6 before that in the byte before, and so on.",
    ],
  };
}

function xUtf8Dec(rng) {
  const cp = randomCp(rng);
  const bytes = utf8Bytes(cp);
  const hexs = bytes.map(hx2).join(" ");
  return {
    prompt: `These bytes (in hex) are **one** character in UTF-8: \`${hexs}\`. ${UTF8_LAYOUT}`,
    answerType: "multi",
    parts: [
      { id: "n", label: "Length", ask: "How many bytes does the first byte say the character uses?", answerType: "number", answer: bytes.length, tolerance: 0,
        hint: "Count the 1s at the start of the first byte before the first 0." },
      { id: "cp", label: "Code point", ask: "What is the code point in decimal?", answerType: "number", answer: cp, tolerance: 0,
        hint: "Remove the prefix bits from every byte, join the x bits, and read that binary number." },
    ],
    explanation: `In binary: ${bytes.map((x) => `\`${x.toString(2).padStart(8, "0")}\``).join(" ")}. The first byte starts with ${bytes.length} ones, so it is a **${bytes.length}**-byte character.\n\nStripping the prefixes leaves \`${cp.toString(2).padStart([0, 7, 11, 16, 21][bytes.length], "0")}\` = ${U_HEX(cp)} = **${commas(cp)}**.`,
    params: { kind: "x-utf8dec", hexs },
    hints: [
      "Write each byte as 8 bits (each hex digit is 4 bits).",
      "The first byte's leading 1s give the length; every other byte starts with 10.",
      "Join the remaining bits in order and convert that binary number to decimal.",
    ],
  };
}

function xUtf16(rng) {
  for (;;) {
    const parts = [];
    const nSp = rng.int(2, 3);
    for (let i = 0; i < nSp; i++) parts.push(rng.pick(SPECIAL).ch);
    if (!parts.some((ch) => ch.codePointAt(0) > 0xffff)) parts[rng.int(0, nSp - 1)] = rng.pick(SPECIAL.filter((x) => x.cp > 0xffff)).ch;
    const word = rng.pick(WORDS).toLowerCase();
    const s = rng.next() < 0.5 ? `${word} ${parts.join("")}` : `${parts.join(" ")} ${word}`;
    const cps = cpsOf(s);
    const u8 = cps.reduce((t, cp) => t + utf8Len(cp), 0);
    const u16 = cps.reduce((t, cp) => t + (cp > 0xffff ? 4 : 2), 0);
    return {
      prompt: `Look at the text \`${s}\` (spaces count). ${cpList(s)}; every other character is plain ASCII. ${UTF8_RULE} UTF-16 uses 2 bytes for code points up to U+FFFF and 4 bytes (a surrogate pair) above that. Ignore any byte-order mark.`,
      answerType: "multi",
      parts: [
        { id: "u8", label: "UTF-8", ask: "How many bytes in UTF-8?", answerType: "number", answer: u8, tolerance: 0,
          hint: "ASCII characters are 1 byte each in UTF-8; give each other character its size from the ranges." },
        { id: "u16", label: "UTF-16", ask: "How many bytes in UTF-16?", answerType: "number", answer: u16, tolerance: 0,
          hint: "In UTF-16 even ASCII takes 2 bytes; only characters above U+FFFF take 4." },
      ],
      explanation: `Character by character (UTF-8 / UTF-16 bytes):\n\n${Array.from(s).map((ch) => { const cp = ch.codePointAt(0); return `- \`${ch === " " ? "space" : ch}\`: ${utf8Len(cp)} / ${cp > 0xffff ? 4 : 2}`; }).join("\n")}\n\n**UTF-8:** **${u8}** bytes. **UTF-16:** **${u16}** bytes.`,
      params: { kind: "x-utf16", s },
      hints: [
        `There are ${cps.length} characters (code points). Make a list and give each one its size in both encodings.`,
        "UTF-8 favours ASCII (1 byte); UTF-16 uses 2 bytes for every character up to U+FFFF.",
      ],
    };
  }
}

// ---- compression / expert ----

function huffmanCost(freqs) {
  // Generation side: repeatedly merge the two smallest weights; the cost is the sum of merges.
  const w = freqs.slice();
  let cost = 0;
  const merges = [];
  while (w.length > 1) {
    w.sort((a, b) => a - b);
    const a = w.shift(), b = w.shift();
    cost += a + b;
    merges.push(`${a} + ${b} = ${a + b}`);
    w.push(a + b);
  }
  return { cost, merges };
}

function xHuffman(rng) {
  for (;;) {
    const k = rng.int(4, 6);
    const syms = rng.shuffle(["A", "B", "C", "D", "E", "F", "G", "R", "S", "T"]).slice(0, k).sort();
    const freqs = syms.map(() => rng.int(1, 30));
    const total = freqs.reduce((s, x) => s + x, 0);
    const fixedBits = Math.ceil(Math.log2(k));
    const fixed = total * fixedBits;
    const { cost, merges } = huffmanCost(freqs);
    if (cost >= fixed) continue;
    return {
      prompt: `A message of ${total} characters uses these characters this many times: ${syms.map((s, i) => `**${s}** × ${freqs[i]}`).join(", ")}. Huffman coding builds a code by repeatedly joining the two smallest counts; frequent characters get short codes.`,
      answerType: "multi",
      parts: [
        { id: "fixed", label: "Fixed length", ask: `With a fixed-length code (the fewest bits that give each of the ${k} characters its own code), how many bits is the message?`, answerType: "number", answer: fixed, tolerance: 0,
          hint: `Find the smallest b with 2^b ≥ ${k}; every character then costs b bits.` },
        { id: "huff", label: "Huffman", ask: "With a Huffman code, how many bits is the message?", answerType: "number", answer: cost, tolerance: 0,
          hint: "Shortcut: the total Huffman bits equal the sum of every merged count you create while building the tree." },
      ],
      explanation: `- Fixed length: ${k} characters need ${fixedBits} bits each (2^${fixedBits} = ${2 ** fixedBits} ≥ ${k}), so ${total} × ${fixedBits} = **${fixed}** bits.\n- Huffman: join the two smallest counts each time: ${merges.join("; ")}. Each merge adds one bit to every character beneath it, so the total is the sum of the merged counts: **${cost}** bits.`,
      given: [{ label: "_total", value: total }],
      params: { kind: "x-huffman", freqs, k },
      hints: [
        "Fixed length first: every character uses the same number of bits.",
        "For Huffman, sort the counts, join the two smallest into one new count, and repeat until one count is left.",
        "Each character's code length is how many joins it went through; or just add up all the joined counts.",
      ],
    };
  }
}

function xCompressSend(rng) {
  for (;;) {
    const S = rng.int(50, 4000);
    const R = rng.pick([10, 20, 50, 100, 200, 500, 1000]);
    const ratio = rng.pick([1.5, 2, 2.5, 3, 4, 5, 8]);
    const cs = rng.int(2, 90);
    const plain = (S * 8) / R;
    const comp = cs + (S * 8) / ratio / R;
    if (nearTie(plain) || nearTie(comp) || Math.abs(plain - comp) < 0.5) continue;
    const better = comp < plain ? "Compress first" : "Send it as it is";
    return {
      prompt: `You need to send a **${S} MB** file over a **${R} Mbps** link. You could first compress it with a ratio of **${ratio}** (original ÷ compressed), which takes **${cs} s** of computing time before sending starts. Ignore decompression and overhead. 1 MB = 1,000,000 bytes, 1 Mbps = 1,000,000 bits per second and 1 byte = 8 bits.`,
      answerType: "multi",
      parts: [
        { id: "plain", label: "As it is", ask: "Seconds to send the file uncompressed. Round to 2 decimal places.", answerType: "number", answer: round2(plain), tolerance: 0.005,
          hint: `Megabits ÷ Mbps: ${S} × 8 ÷ ${R}.` },
        { id: "comp", label: "Compressed", ask: "Seconds in total to compress and then send. Round to 2 decimal places.", answerType: "number", answer: round2(comp), tolerance: 0.005,
          hint: `The compressed file is ${S} ÷ ${ratio} MB. Add the ${cs} s of compressing to its sending time.` },
        { id: "best", label: "Faster", ask: "Which is faster?", answerType: "choice", answer: better, choices: ["Compress first", "Send it as it is"],
          hint: "Compare your two totals." },
      ],
      explanation: `- Uncompressed: ${S} × 8 ÷ ${R} = **${round2(plain).toFixed(2)} s**\n- Compressed: ${S} ÷ ${ratio} = ${tidy(S / ratio)} MB, sent in ${tidy(S / ratio)} × 8 ÷ ${R} = ${tidy((S * 8) / ratio / R)} s; plus ${cs} s compressing = **${round2(comp).toFixed(2)} s**\n\nSo: **${better}**.`,
      given: [{ label: "_size", value: S }, { label: "_rate", value: R }, { label: "_ratio", value: ratio }, { label: "_ctime", value: cs }],
      params: { kind: "x-compsend", S, R, ratio, cs },
      hints: [
        "Sending time = size in megabits ÷ speed in Mbps.",
        "Compression only helps if the time it saves on the link is more than the time spent compressing.",
        "Calculator: `_ctime + _size / _ratio * 8 / _rate` for the compressed route.",
      ],
    };
  }
}

const RUN_COL = ["white", "black", "grey", "blue"];

function xRleLong(rng) {
  for (;;) {
    const nr = rng.int(3, 5);
    const runs = [];
    let prev = -1;
    for (let i = 0; i < nr; i++) {
      let c;
      do c = rng.int(0, 2); while (c === prev);
      prev = c;
      const len = rng.next() < 0.3 ? rng.pick([255, 256, 510, 511, 765]) : rng.int(1, 700);
      runs.push([len, c]);
    }
    const width = runs.reduce((s, [n]) => s + n, 0);
    const pieces = runs.map(([n]) => Math.ceil(n / 255));
    const enc = pieces.reduce((s, x) => s + x, 0) * 2;
    const ratio = width / enc;
    if (!runs.some(([n]) => n > 255) || nearTie(ratio)) continue;
    return {
      prompt: `A row of **${width}** pixels (1 byte per pixel uncompressed) is: ${runs.map(([n, c]) => `${n} ${RUN_COL[c]}`).join(", then ")}. It is run-length encoded as pairs of bytes: a count byte, then a colour byte. One count byte can hold at most **255**, so a longer run is split into several pairs.`,
      answerType: "multi",
      parts: [
        { id: "bytes", label: "Encoded size", ask: "How many bytes is the encoded row?", answerType: "number", answer: enc, tolerance: 0,
          hint: "For each run, work out how many pairs it needs (255 per pair at most); each pair is 2 bytes." },
        { id: "ratio", label: "Ratio", ask: "Compression ratio (original bytes ÷ encoded bytes). Round to 2 decimal places.", answerType: "number", answer: round2(ratio), tolerance: 0.005,
          hint: `The original row is ${width} bytes. Divide by your encoded size.` },
      ],
      explanation: `${runs.map(([n, c], i) => `- ${n} ${RUN_COL[c]}: ${pieces[i]} pair${pieces[i] === 1 ? "" : "s"}${pieces[i] > 1 ? ` (${Array.from({ length: pieces[i] }, (_, k) => Math.min(255, n - 255 * k)).join(" + ")})` : ""}`).join("\n")}\n\n${pieces.reduce((s, x) => s + x, 0)} pairs × 2 = **${enc}** bytes. Ratio: ${width} ÷ ${enc} ≈ **${round2(ratio).toFixed(2)}**.`,
      given: [{ label: "_width", value: width }],
      params: { kind: "x-rlelong", runs },
      hints: [
        "A run of 255 fits in one pair, but 256 needs two pairs (255 + 1).",
        "Pairs for a run = its length ÷ 255, rounded up.",
        "Add up the pairs, double for bytes, then divide the original size by that.",
      ],
    };
  }
}

function genExpert(subtopic, rng) {
  const t = rng.int(0, 2);
  if (subtopic === "images") return t === 0 ? xPalette(rng) : t === 1 ? xVideo(rng) : xDimsBack(rng);
  if (subtopic === "sound") return t === 0 ? xSoundBack(rng) : t === 1 ? xSoundFit(rng) : xSoundChoose(rng);
  if (subtopic === "characters") return t === 0 ? xUtf8Enc(rng) : t === 1 ? xUtf8Dec(rng) : xUtf16(rng);
  if (subtopic === "compression") return t === 0 ? xHuffman(rng) : t === 1 ? xCompressSend(rng) : xRleLong(rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---- expert verification ----

// Minimum Σ f·len over all prefix-code length assignments (Kraft sum ≤ 1), by exhaustive search.
function vOptimalCode(freqs) {
  const k = freqs.length;
  let best = Infinity;
  const len = new Array(k).fill(1);
  const rec = (i, kraft) => {
    if (kraft > 1 + 1e-12) return;
    if (i === k) { best = Math.min(best, freqs.reduce((s, f, j) => s + f * len[j], 0)); return; }
    for (let l = 1; l <= k - 1; l++) { len[i] = l; rec(i + 1, kraft + 2 ** -l); }
  };
  rec(0, 0);
  return best;
}

function verifyExpert(p, q, answer) {
  if (p.kind === "x-palette") {
    const b = bitsFor(p.N);
    const size = p.w * p.h * b / 8 + p.N * 3;
    const tru = p.w * p.h * 3;
    return xnum(answer, "bpp") === b && xnum(answer, "size") === size && rounded2Ok(xnum(answer, "saving"), tru / 100, tru - size);
  }
  if (p.kind === "x-video") {
    const bitsFrame = p.w * p.h * 24;
    return rounded2Ok(xnum(answer, "frame"), unitFactor("MB") * 8, bitsFrame)
      && rounded2Ok(xnum(answer, "rate"), 1e6, bitsFrame * p.fps)
      && rounded2Ok(xnum(answer, "total"), unitFactor("GB") * 8, bitsFrame * p.fps * p.t);
  }
  if (p.kind === "x-dims") {
    const w = xnum(answer, "w"), h = xnum(answer, "h");
    return Number.isInteger(w) && Number.isInteger(h) && w * p.b === h * p.a && w * h * p.d === p.bytes * 8;
  }
  if (p.kind === "x-soundback") {
    const r = xnum(answer, "rate");
    return Number.isInteger(r) && r * p.d * p.c * p.t === p.bytes * 8 && xnum(answer, "nyq") * 2 === r;
  }
  if (p.kind === "x-soundfit") {
    const card = p.cap * unitFactor("GB") * 8;
    const fit = (x, perMinBits) => Number.isInteger(x) && x * perMinBits <= card && (x + 1) * perMinBits > card;
    return fit(xnum(answer, "raw"), p.r * p.d * p.c * 60) && fit(xnum(answer, "mp3"), p.kb * 1000 * 60);
  }
  if (p.kind === "x-soundchoose") {
    const rates = p.opts.map((s) => Number(s.replace(/[^0-9]/g, "")));
    if (new Set(rates).size !== 4) return false;
    const ok = rates.filter((r) => r / 2 >= p.F * 1000);
    if (!ok.length) return false;
    const r = Math.min(...ok);
    return String(xv(answer, "rate")) === `${commas(r)} Hz` && rounded2Ok(xnum(answer, "size"), unitFactor("MB") * 8, r * p.d * p.c * p.t);
  }
  if (p.kind === "x-utf8enc") {
    const enc = new TextEncoder().encode(String.fromCodePoint(p.cp));
    const hex = (x) => x.toString(16).toUpperCase().padStart(2, "0");
    return xnum(answer, "n") === enc.length && String(xv(answer, "first") ?? "").trim().toUpperCase() === hex(enc[0])
      && String(xv(answer, "last") ?? "").trim().toUpperCase() === hex(enc[enc.length - 1]);
  }
  if (p.kind === "x-utf8dec") {
    const bytes = p.hexs.split(" ").map((h) => parseInt(h, 16));
    const s = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    const cps = Array.from(s);
    return cps.length === 1 && xnum(answer, "cp") === s.codePointAt(0) && xnum(answer, "n") === bytes.length;
  }
  if (p.kind === "x-utf16") {
    return xnum(answer, "u8") === new TextEncoder().encode(p.s).length && xnum(answer, "u16") === p.s.length * 2;
  }
  if (p.kind === "x-huffman") {
    let b = 0;
    while (2 ** b < p.k) b++;
    const total = p.freqs.reduce((s, x) => s + x, 0);
    return xnum(answer, "fixed") === total * b && xnum(answer, "huff") === vOptimalCode(p.freqs);
  }
  if (p.kind === "x-compsend") {
    const bits = p.S * unitFactor("MB") * 8;
    const plain = bits / (p.R * 1e6);
    const comp = p.cs + bits / p.ratio / (p.R * 1e6);
    return rounded2Ok(xnum(answer, "plain"), 1, plain) && rounded2Ok(xnum(answer, "comp"), 1, comp)
      && String(xv(answer, "best")) === (comp < plain ? "Compress first" : "Send it as it is");
  }
  if (p.kind === "x-rlelong") {
    // Build the row, then encode it greedily with a 255 cap.
    let row = "";
    for (const [n, c] of p.runs) row += String(c).repeat(n);
    let pairs = 0;
    for (let i = 0; i < row.length;) {
      let j = i;
      while (j < row.length && row[j] === row[i] && j - i < 255) j++;
      pairs++;
      i = j;
    }
    return xnum(answer, "bytes") === pairs * 2 && rounded2Ok(xnum(answer, "ratio"), pairs * 2, row.length);
  }
  return false;
}
