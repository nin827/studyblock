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
    if (p.kind.startsWith("i-")) return verifyImages(question, answer);
    if (p.kind.startsWith("s-")) return verifySound(question, answer);
    if (p.kind.startsWith("ch-")) return verifyCharacters(question, answer);
    if (p.kind.startsWith("r-")) return verifyCompression(question, answer);
  } catch {
    return false;
  }
  return false;
}
