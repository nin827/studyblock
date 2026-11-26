// Networking (IPv4) generator. Uses only the seeded rng passed in by the engine.
// Generation works per octet (decimal arithmetic on four numbers); verify() re-derives every
// answer independently with 32-bit integer / bitwise maths, bit-by-bit parsing, enumeration or
// substitution. Dotted answers are text in canonical form (no leading zeros, no spaces).
// Octet arithmetic for generation (masks, subnets, address offsets, binary) is js/lib/net.js;
// verify()'s helpers below stay local and independent of it.

import { bin8, binDotted, maskOctets, subnetOctets, addToOctets, usableHosts } from "../../js/lib/net.js";

// ---- Segmented (block-list) choices (ticket 019) ----
// Options are arrays with one segment per column (`choiceCols`); the engine joins them with " | ".
// verify() sees the raw arrays (or joined strings for stored questions). Easy has 3 options and the
// other levels 5; every wrong option differs from the right one in 1 to n−1 columns. `extraSegs` are
// Build-mode decoy blocks, and no combination of the available blocks other than the answer is right.
const SEG_OPTIONS = { easy: 3, medium: 5, hard: 5, expert: 5 };
const segsOf = (c) => (Array.isArray(c) ? c.map((s) => String(s).trim()) : String(c ?? "").split("|").map((s) => s.trim()));
const segKey = (c) => segsOf(c).join(" | ");
const segDiff = (a, b) => a.reduce((n, s, i) => n + (s !== b[i] ? 1 : 0), 0);
// Checks a segmented choice: shape, option count (`want`, when given), exactly one right option and it
// is `answer`, wrong options differ in 1..n−1 columns, and (build) exactly one right combination among
// every block on offer (the options' segments plus extraSegs).
function segOk(q, answer, isRight, want, build = true) {
  const cols = q && q.choiceCols;
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > 4 || !Array.isArray(q.choices)) return false;
  const n = cols.length;
  const opts = q.choices.map(segsOf);
  if ((want && opts.length !== want) || opts.length < 2 || opts.some((t) => t.length !== n || t.some((s) => !s))) return false;
  if (new Set(opts.map((t) => t.join(" | "))).size !== opts.length) return false;
  const right = opts.filter((t) => isRight(t));
  if (right.length !== 1) return false;
  const a = segsOf(answer);
  if (a.length !== n || segDiff(a, right[0]) !== 0) return false;
  if (opts.some((t) => t !== right[0] && (segDiff(t, right[0]) < 1 || segDiff(t, right[0]) >= n))) return false;
  if (!build) return true;
  const pools = cols.map((_, i) => new Set(opts.map((t) => t[i])));
  for (const e of Array.isArray(q.extraSegs) ? q.extraSegs : []) {
    const i = Array.isArray(e) ? (typeof e[0] === "number" ? e[0] : cols.indexOf(e[0])) : -1;
    if (i < 0 || i >= n || !String(e[1] ?? "").trim()) return false;
    pools[i].add(String(e[1]).trim());
  }
  let hits = 0;
  const walk = (i, acc) => {
    if (hits > 1) return;
    if (i === n) { if (isRight(acc)) hits++; return; }
    for (const v of pools[i]) walk(i + 1, [...acc, v]);
  };
  walk(0, []);
  return hits === 1;
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers

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

const dotted = (o) => o.join(".");
const pow2 = (k) => Math.pow(2, k);
const ORD = ["1st", "2nd", "3rd", "4th"];

// A "write it like" example that never equals the answer.
function likeIp(ans) {
  return ans === "192.168.1.0" ? "`10.20.30.40`" : "`192.168.1.0`";
}
function likeBin8(ans) {
  return ans === "00101101" ? "`00001010`" : "`00101101`";
}
function likeBinIp(ans) {
  const ex = "11000000.10101000.00000001.00000000";
  return ans === ex ? "`00001010.00000000.00000000.00000001`" : `\`${ex}\``;
}

const IP_NOTE = "Write it in dotted decimal with no leading zeros or spaces";

// ---------------------------------------------------------------------------------------------
// Independent helpers used only by verify()

// Strict dotted decimal -> unsigned 32-bit int (null if not canonical).
function parseDotted(s) {
  if (typeof s !== "string") return null;
  const parts = s.trim().split(".");
  if (parts.length !== 4) return null;
  let v = 0;
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const x = Number(p);
    if (x > 255) return null;
    v = v * 256 + x;
  }
  return v >>> 0;
}

// Binary digits read bit by bit (Horner). Groups must be exactly 8 bits each.
function parseBinGroups(s, groups) {
  if (typeof s !== "string") return null;
  const parts = s.trim().split(".");
  if (parts.length !== groups) return null;
  let v = 0;
  for (const p of parts) {
    if (!/^[01]{8}$/.test(p)) return null;
    for (const ch of p) v = v * 2 + (ch === "1" ? 1 : 0);
  }
  return v;
}

const octInt = (o) => (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0);
const maskInt = (n) => (n <= 0 ? 0 : (0xffffffff << (32 - n)) >>> 0);
const intDotted = (v) => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");

// Leading ones of a mask by scanning bits; -1 if the ones aren't contiguous.
function prefixOfMask(v) {
  let n = 0;
  while (n < 32 && ((v >>> (31 - n)) & 1) === 1) n++;
  for (let b = n; b < 32; b++) if (((v >>> (31 - b)) & 1) === 1) return -1;
  return n;
}

// Address category by masking against a range table (32-bit ints).
const RANGE_TABLE = [
  ["10.0.0.0", 8, "private"], ["172.16.0.0", 12, "private"], ["192.168.0.0", 16, "private"],
  ["127.0.0.0", 8, "loopback"], ["169.254.0.0", 16, "linklocal"],
  ["0.0.0.0", 8, "special"], ["100.64.0.0", 10, "special"], ["192.0.0.0", 24, "special"],
  ["192.0.2.0", 24, "special"], ["198.18.0.0", 15, "special"], ["198.51.100.0", 24, "special"],
  ["203.0.113.0", 24, "special"], ["224.0.0.0", 3, "special"],
];
function categoryOfInt(v) {
  for (const [base, n, cat] of RANGE_TABLE) {
    if (((v & maskInt(n)) >>> 0) === parseDotted(base)) return cat;
  }
  return "public";
}

// Classful class from the leading bits of the first octet.
function classOfOctet(o) {
  if (o === 0 || o === 127 || o >= 240) return null;
  if ((o & 0x80) === 0) return "A";
  if ((o & 0xc0) === 0x80) return "B";
  if ((o & 0xe0) === 0xc0) return "C";
  if ((o & 0xf0) === 0xe0) return "D";
  return null;
}

// 2^k by repeated doubling as a BigInt (verify-only).
function big2(k) {
  let v = 1n;
  for (let i = 0; i < k; i++) v *= 2n;
  return v;
}

// ---------------------------------------------------------------------------------------------
// Shared question builders

// Numeric multiple choice: correct + 3 distinct distractors from common mistakes (topped up).
function numChoices(correct, candidates, rounded, rng) {
  const fmt = (v) => (rounded ? round2(v).toFixed(2) : String(v));
  const correctStr = fmt(correct);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v <= 0) return;
    if (!rounded && !Number.isInteger(v)) return;
    const s = fmt(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) { tryAdd(correct * (1 + k / 10)); tryAdd(correct + k); }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Text multiple choice from a correct string and candidate strings (must give 3 distinct wrongs).
function textChoices(correct, candidates, rng) {
  const seen = new Set([correct]);
  const out = [];
  for (const c of candidates) {
    if (out.length >= 3 || typeof c !== "string" || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  if (out.length < 3) return null;
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

const randOctets = (rng, first) => [first, rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)];

// =============================================================================================
// Subtopic: IP addresses and binary

const PRIV = "Private (RFC 1918)";
const PUB = "Public";
const LOOP = "Loopback";
const LINK = "Link-local (APIPA)";
const CAT_LABEL = { private: PRIV, public: PUB, loopback: LOOP, linklocal: LINK };
const CLASS_LABEL = { A: "Class A", B: "Class B", C: "Class C", D: "Class D (multicast)" };

// Category by plain octet comparisons (generation side).
function catByOctets(o) {
  if (o[0] === 10) return "private";
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return "private";
  if (o[0] === 192 && o[1] === 168) return "private";
  if (o[0] === 127) return "loopback";
  if (o[0] === 169 && o[1] === 254) return "linklocal";
  if (o[0] === 0 || o[0] >= 224) return "special";
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return "special";
  if (o[0] === 192 && o[1] === 0 && (o[2] === 0 || o[2] === 2)) return "special";
  if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return "special";
  if (o[0] === 198 && o[1] === 51 && o[2] === 100) return "special";
  if (o[0] === 203 && o[1] === 0 && o[2] === 113) return "special";
  return "public";
}

function randomPublic(rng) {
  for (;;) {
    const o = randOctets(rng, rng.int(1, 223));
    if (catByOctets(o) === "public") return o;
  }
}

// An address of the wanted category; `edge` picks one close to a range boundary.
function addressOf(cat, edge, rng) {
  const r = () => rng.int(0, 255);
  if (cat === "private") {
    const t = rng.int(0, 2);
    if (t === 0) return [10, edge ? rng.pick([0, 255]) : r(), r(), r()];
    if (t === 1) return [172, edge ? rng.pick([16, 31]) : rng.int(16, 31), r(), r()];
    return [192, 168, edge ? rng.pick([0, 255]) : r(), r()];
  }
  if (cat === "loopback") return [127, r(), r(), rng.int(1, 254)];
  if (cat === "linklocal") return [169, 254, rng.int(1, 254), rng.int(1, 254)];
  if (edge) {
    const near = rng.pick([[172, 15], [172, 32], [192, 169], [192, 167], [169, 253], [169, 255], [11, null], [9, null], [128, null], [126, null]]);
    const o = [near[0], near[1] === null ? r() : near[1], r(), r()];
    if (catByOctets(o) === "public") return o;
  }
  return randomPublic(rng);
}

function classifyHints(o) {
  return [
    `Compare the address \`${dotted(o)}\` with the reserved ranges: private \`10.0.0.0/8\`, \`172.16.0.0/12\` and \`192.168.0.0/16\`; loopback \`127.0.0.0/8\`; link-local \`169.254.0.0/16\`.`,
    `\`172.16.0.0/12\` covers only \`172.16.x.x\` to \`172.31.x.x\`, and \`192.168.0.0/16\` only \`192.168.x.x\`. Check the first ${o[0] === 172 || o[0] === 192 || o[0] === 169 ? "two octets" : "octet"} (${o[0]}${o[0] === 172 || o[0] === 192 || o[0] === 169 ? `.${o[1]}` : ""}) against these.`,
    "An address in none of these ranges is public (routable on the internet).",
  ];
}

function classifyExplanation(o, cat) {
  const why = {
    private: o[0] === 10 ? "It starts with 10, so it is in `10.0.0.0/8`."
      : o[0] === 172 ? `The second octet ${o[1]} is between 16 and 31, so it is in \`172.16.0.0/12\` (172.16.0.0 to 172.31.255.255).`
        : "It starts with 192.168, so it is in `192.168.0.0/16`.",
    loopback: "Every address starting with 127 is in `127.0.0.0/8`, the loopback range (the machine itself).",
    linklocal: "It starts with 169.254, the link-local range `169.254.0.0/16` that a host gives itself when DHCP fails (APIPA).",
    public: `It is not in \`10.0.0.0/8\`, \`172.16.0.0/12\` (172.16 to 172.31), \`192.168.0.0/16\`, \`127.0.0.0/8\` or \`169.254.0.0/16\`, so it is a public address.`,
  }[cat];
  return `Check the address against the reserved IPv4 ranges.\n\n- Private (RFC 1918): \`10.0.0.0/8\`, \`172.16.0.0/12\`, \`192.168.0.0/16\`\n- Loopback: \`127.0.0.0/8\`\n- Link-local: \`169.254.0.0/16\`\n\n${why} The answer is **${CAT_LABEL[cat]}**.`;
}

function octetSteps(d) {
  const w = [128, 64, 32, 16, 8, 4, 2, 1];
  let rem = d;
  const lines = [];
  for (const x of w) {
    if (rem >= x) { lines.push(`- ${x}: ${rem} ≥ ${x}, write **1**, ${rem} − ${x} = ${rem - x}`); rem -= x; }
    else lines.push(`- ${x}: ${rem} < ${x}, write **0**`);
  }
  return lines.join("\n");
}

function genIpBinary(difficulty, rng) {
  checkDifficulty(difficulty);
  const kind = difficulty === "easy" ? rng.pick(["oct2bin", "oct2bin", "bin2oct", "bin2oct", "class"])
    : difficulty === "medium" ? rng.pick(["ip2bin", "bin2ip", "classify", "classify", "class"])
      : rng.pick(["classify", "multi", "multi", "classbin"]);

  if (kind === "oct2bin") {
    const d = rng.int(1, 255);
    const ans = bin8(d);
    return {
      prompt: `Convert the decimal octet **${d}** to 8-bit binary. Write all 8 bits, including leading zeros, like ${likeBin8(ans)}.`,
      answer: ans,
      answerType: "text",
      explanation: `Go through the place values 128, 64, 32, 16, 8, 4, 2, 1. Write 1 when the value fits into what's left and subtract it, otherwise write 0.\n\n${octetSteps(d)}\n\nReading the bits in order gives **${ans}**.`,
      hints: [
        "The 8 place values are 128, 64, 32, 16, 8, 4, 2, 1. Work from the left.",
        d >= 128
          ? `${d} ≥ 128, so the first bit is 1 and ${d} − 128 = ${d - 128} is left. Carry on with 64, 32, and so on.`
          : `${d} < 128, so the first bit is 0. Check 64 next, then 32, and so on, subtracting each value that fits.`,
      ],
      params: { kind, d },
    };
  }

  if (kind === "bin2oct") {
    let d;
    do { d = rng.int(3, 255); } while ((d & (d - 1)) === 0); // at least two 1 bits, so the hint can't name it
    const b = bin8(d);
    const on = [128, 64, 32, 16, 8, 4, 2, 1].filter((x, i) => b[i] === "1");
    return {
      prompt: `What is the binary octet \`${b}\` in decimal?`,
      answer: d,
      answerType: "number",
      tolerance: 0,
      explanation: `Line the bits up with the place values 128, 64, 32, 16, 8, 4, 2, 1 and add the values under each 1.\n\n${on.join(" + ")} = **${d}**`,
      hints: [
        "The place values from left to right are 128, 64, 32, 16, 8, 4, 2, 1.",
        on.length > 1 ? `The 1s sit under ${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}. Add those values.` : `There is only one 1. Which place value is it under?`,
      ],
      params: { kind, b },
    };
  }

  if (kind === "class" || kind === "classbin") {
    const cls = rng.pick(["A", "B", "C", "D"]);
    const ranges = { A: [1, 126], B: [128, 191], C: [192, 223], D: [224, 239] };
    const edges = { A: [1, 126, 100, 64], B: [128, 191, 129, 190], C: [192, 223, 193, 222], D: [224, 239, 225, 238] };
    const first = kind === "classbin" ? rng.pick(edges[cls]) : rng.int(ranges[cls][0], ranges[cls][1]);
    const o = randOctets(rng, first);
    const choices = rng.shuffle(Object.values(CLASS_LABEL));
    const ans = CLASS_LABEL[cls];
    const table = "- Class A: 1 to 126 (first bit `0`)\n- Class B: 128 to 191 (first bits `10`)\n- Class C: 192 to 223 (first bits `110`)\n- Class D: 224 to 239, multicast (first bits `1110`)";
    if (kind === "classbin") {
      return {
        prompt: `In the old classful scheme, which class is an address whose first octet is \`${bin8(first)}\` in binary?`,
        answer: ans,
        answerType: "choice",
        choices,
        explanation: `The class depends on the leading bits of the first octet.\n\n${table}\n\n\`${bin8(first)}\` = ${first}, so it is **${ans}**.`,
        hints: [
          "Classes are set by the leading bits: `0` → A, `10` → B, `110` → C, `1110` → D.",
          `Read \`${bin8(first)}\` from the left and stop at the first 0. How many 1s come before it?`,
        ],
        params: { kind, first },
      };
    }
    return {
      prompt: `In the old classful scheme, which class does the address \`${dotted(o)}\` belong to?`,
      answer: ans,
      answerType: "choice",
      choices,
      explanation: `Only the first octet matters.\n\n${table}\n\nThe first octet is ${first}, so it is **${ans}**.`,
      hints: [
        `Only the first octet matters here: ${first}.`,
        "The first-octet ranges are 1–126, 128–191, 192–223 and 224–239, for A, B, C and D in that order. Which range holds it?",
      ],
      params: { kind, first },
    };
  }

  if (kind === "ip2bin" || kind === "bin2ip") {
    let o;
    do { o = [rng.int(1, 223), rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)]; } while (dotted(o) === "192.168.1.0");
    if (rng.next() < 0.4) o[3] = rng.pick([0, 1, 128, 255]);
    if (kind === "ip2bin") {
      const ans = binDotted(o);
      return {
        prompt: `Write the address \`${dotted(o)}\` in binary: four 8-bit groups (leading zeros included) separated by dots, like ${likeBinIp(ans)}.`,
        answer: ans,
        answerType: "text",
        explanation: `Convert each octet on its own to 8 bits, using the place values 128, 64, 32, 16, 8, 4, 2, 1.\n\n${o.map((x, i) => `- ${ORD[i]} octet: ${x} = \`${bin8(x)}\``).join("\n")}\n\nJoined with dots: **${ans}**`,
        hints: [
          "Convert each of the four octets separately into 8 bits, then join them with dots.",
          `Start with ${o[0]}: use the place values 128, 64, 32, 16, 8, 4, 2, 1 and pad to 8 bits with leading zeros.`,
        ],
        params: { kind, o },
      };
    }
    const ans = dotted(o);
    return {
      prompt: `Convert the binary address \`${binDotted(o)}\` to dotted decimal. ${IP_NOTE}, like ${likeIp(ans)}.`,
      answer: ans,
      answerType: "text",
      explanation: `Convert each 8-bit group on its own (place values 128, 64, 32, 16, 8, 4, 2, 1).\n\n${o.map((x, i) => `- \`${bin8(x)}\` = ${x}`).join("\n")}\n\nJoined with dots: **${ans}**`,
      hints: [
        "Each group of 8 bits is one octet. Convert them one at a time with the place values 128, 64, 32, 16, 8, 4, 2, 1.",
        `For example, \`${bin8(o[0])}\`: add the place values under each 1. Then do the other three groups.`,
      ],
      params: { kind, o },
    };
  }

  // classify (medium plain, hard near the boundaries) and the hard multi-part version
  const cat = rng.pick(["private", "private", "public", "public", "loopback", "linklocal"]);
  const edge = difficulty === "hard";
  const o = addressOf(cat, edge, rng);
  const choices = rng.shuffle([PRIV, PUB, LOOP, LINK]);
  if (kind === "multi") {
    const idx = rng.int(1, 3);
    const bits = bin8(o[idx]);
    return {
      prompt: `Look at the address \`${dotted(o)}\`.`,
      answerType: "multi",
      parts: [
        {
          id: "bits", label: "Binary", ask: `The ${ORD[idx]} octet in 8-bit binary (all 8 bits, like ${likeBin8(bits)})`,
          answerType: "text", answer: bits,
          hint: `The ${ORD[idx]} octet is ${o[idx]}. Go through 128, 64, 32, 16, 8, 4, 2, 1, writing 1 when the value fits and subtracting it.`,
        },
        {
          id: "type", label: "Address type", ask: "What kind of address is it?",
          answerType: "choice", answer: CAT_LABEL[cat], choices,
          hint: "Compare it with the RFC 1918 ranges `10.0.0.0/8`, `172.16.0.0/12` (172.16 to 172.31) and `192.168.0.0/16`, then `127.0.0.0/8` and `169.254.0.0/16`. An address in none of them is routable on the internet.",
        },
      ],
      explanation: `**Binary:** ${o[idx]} → \`${bits}\`.\n\n${octetSteps(o[idx])}\n\n**Address type:** ${classifyExplanation(o, cat)}`,
      params: { kind, o, idx },
    };
  }
  return {
    prompt: `What kind of IPv4 address is \`${dotted(o)}\`?`,
    answer: CAT_LABEL[cat],
    answerType: "choice",
    choices,
    explanation: classifyExplanation(o, cat),
    hints: classifyHints(o),
    params: { kind: "classify", o },
  };
}

function verifyIpBinary(q, answer) {
  const p = q.params;
  if (p.kind === "oct2bin") return parseBinGroups(String(answer), 1) === p.d;
  if (p.kind === "bin2oct") {
    const v = parseBinGroups(p.b, 1);
    return v !== null && Number.isInteger(Number(answer)) && Number(answer) === v;
  }
  if (p.kind === "class" || p.kind === "classbin") {
    const c = classOfOctet(p.first);
    return c !== null && fourChoices(q) && String(answer) === CLASS_LABEL[c];
  }
  if (p.kind === "ip2bin") return parseBinGroups(String(answer), 4) === octInt(p.o);
  if (p.kind === "bin2ip") return parseDotted(String(answer)) === octInt(p.o);
  if (p.kind === "classify") {
    const c = categoryOfInt(octInt(p.o));
    return Boolean(CAT_LABEL[c]) && fourChoices(q) && String(answer) === CAT_LABEL[c];
  }
  if (p.kind === "multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    const parts = q.parts || [];
    const typePart = parts.find((x) => x.id === "type");
    if (!typePart || !Array.isArray(typePart.choices) || typePart.choices.length !== 4 || new Set(typePart.choices).size !== 4) return false;
    const c = categoryOfInt(octInt(p.o));
    const want = (octInt(p.o) >>> (8 * (3 - p.idx))) & 255;
    return parseBinGroups(String(a.bits ?? ""), 1) === want && Boolean(CAT_LABEL[c]) && String(a.type) === CAT_LABEL[c];
  }
  return false;
}

const fourChoices = (q) => Array.isArray(q.choices) && q.choices.length === 4 && new Set(q.choices).size === 4 && q.choices.includes(String(q.answer));

// =============================================================================================
// Subtopic: Subnet masks and CIDR

function maskHints(n) {
  const full = Math.floor(n / 8), rest = n % 8;
  return [
    `/${n} means ${n} ones followed by ${32 - n} zeros, split into four octets of 8 bits.`,
    rest === 0
      ? `${n} = ${full} × 8, so ${full} octet${full === 1 ? " is" : "s are"} all ones (255) and the rest are 0.`
      : `${n} = ${full} × 8 + ${rest}: ${full === 0 ? "no octet is" : `${full} octet${full === 1 ? " is" : "s are"}`} all ones (255), and the next octet has ${rest} one${rest === 1 ? "" : "s"} followed by ${8 - rest} zeros. Add up the top ${rest} place values (128, 64, 32, …) for that octet.`,
  ];
}

function maskExplanation(n) {
  const m = maskOctets(n);
  const full = Math.floor(n / 8), rest = n % 8;
  const bits = "1".repeat(n) + "0".repeat(32 - n);
  const groups = [0, 1, 2, 3].map((i) => bits.slice(8 * i, 8 * i + 8)).join(".");
  return `Write ${n} ones and then ${32 - n} zeros, in groups of 8.\n\n\`${groups}\`\n\n${rest === 0 ? `${full} full octets are 255; the rest are 0.` : `${full} full octet${full === 1 ? "" : "s"} of 255, then ${rest} one${rest === 1 ? "" : "s"}: ${[128, 64, 32, 16, 8, 4, 2].slice(0, rest).join(" + ")} = ${m[full]}.`}\n\nSo /${n} = **${dotted(m)}**.`;
}

const DEVICES = ["A router interface", "A laptop", "A printer", "A web server", "A lab PC", "A security camera", "A file server", "A phone"];
const TEAMS = ["The sales team", "A school lab", "The guest Wi-Fi", "A branch office", "The data centre rack", "The finance team", "A warehouse", "The IoT network"];

function genMasks(difficulty, rng) {
  checkDifficulty(difficulty);
  const kind = difficulty === "easy" ? rng.pick(["cidr2mask", "mask2cidr", "hosts"])
    : difficulty === "medium" ? rng.pick(["cidr2mask", "mask2cidr", "hosts", "count", "fit"])
      : rng.pick(["cidr2mask", "wildcard", "hosts", "fit", "borrow", "borrow"]);

  const pickN = () => (difficulty === "easy" ? rng.pick([8, 16, 24, 24, 25, 26, 27, 28, 29, 30])
    : difficulty === "medium" ? (() => { let n; do { n = rng.int(9, 30); } while (n % 8 === 0); return n; })()
      : rng.int(1, 30));

  if (kind === "cidr2mask") {
    const n = pickN();
    const ans = dotted(maskOctets(n));
    const base = {
      explanation: maskExplanation(n),
      hints: maskHints(n),
      params: { kind, n },
    };
    if (difficulty !== "easy" && rng.next() < 0.35) {
      const cands = [];
      if (n > 1) cands.push(dotted(maskOctets(n - 1)));
      if (n < 30) cands.push(dotted(maskOctets(n + 1)));
      cands.push(dotted(maskOctets(n).map((x) => 255 - x))); // wildcard instead of mask
      cands.push(dotted(maskOctets(n + 2 <= 30 ? n + 2 : n - 2)));
      const c = textChoices(ans, cands, rng);
      if (c) return { ...base, prompt: `Which subnet mask matches the prefix **/${n}**?`, answerType: "choice", ...c };
    }
    const lead = rng.next() < 0.6 ? `${rng.pick(DEVICES)} is configured as \`${dotted(pickIpForPrefix(n, rng))}/${n}\`. ` : "";
    return { ...base, prompt: `${lead}Write the subnet mask for **/${n}** in dotted decimal. ${IP_NOTE}, like \`255.0.0.0\` for /8.`, answer: ans, answerType: "text" };
  }

  if (kind === "wildcard") {
    const n = rng.int(9, 30);
    const m = maskOctets(n);
    const ans = dotted(m.map((x) => 255 - x));
    return {
      prompt: `A wildcard mask is the subnet mask with every bit flipped. What is the wildcard mask for **/${n}**? ${IP_NOTE}, like \`0.0.0.255\` for /24.`,
      answer: ans,
      answerType: "text",
      explanation: `First find the subnet mask for /${n}: \`${dotted(m)}\`.\n\nFlipping every bit is the same as subtracting each octet from 255:\n\n${m.map((x) => `- 255 − ${x} = ${255 - x}`).join("\n")}\n\nThe wildcard mask is **${ans}**.`,
      hints: [
        `Start from the subnet mask for /${n}: ${n} ones then ${32 - n} zeros.`,
        `The subnet mask is \`${dotted(m)}\`. Flipping the bits means subtracting each octet from 255.`,
      ],
      params: { kind, n },
    };
  }

  if (kind === "mask2cidr") {
    const n = pickN();
    const m = maskOctets(n);
    return {
      prompt: rng.next() < 0.6
        ? `${rng.pick(DEVICES)} has the address \`${dotted(pickIpForPrefix(n, rng))}\` with subnet mask \`${dotted(m)}\`. What is the prefix length (the *n* in /n)?`
        : `What prefix length (the *n* in /n) matches the subnet mask \`${dotted(m)}\`?`,
      answer: n,
      answerType: "number",
      tolerance: 0,
      explanation: `Count the 1 bits in the mask.\n\n${m.map((x) => `- ${x} = \`${bin8(x)}\` → ${bin8(x).split("").filter((c) => c === "1").length} ones`).join("\n")}\n\nTotal: **/${n}**, so the answer is **${n}**.`,
      hints: [
        "Every 255 octet is eight ones and every 0 octet has no ones.",
        m.some((x) => x !== 0 && x !== 255)
          ? `Write the octet ${m.find((x) => x !== 0 && x !== 255)} in binary and count its leading ones, then add eight for each 255.`
          : "Add eight for each 255 octet.",
      ],
      params: { kind, m },
    };
  }

  if (kind === "hosts") {
    const n = difficulty === "easy" ? rng.int(24, 30) : difficulty === "medium" ? rng.int(16, 30) : rng.int(8, 30);
    const h = 32 - n;
    const ans = usableHosts(n);
    const base = {
      explanation: `A /${n} leaves 32 − ${n} = ${h} host bits, giving 2^${h} = ${commas(pow2(h))} addresses. Two of them can't be given to hosts: the network address (all host bits 0) and the broadcast address (all host bits 1).\n\n${commas(pow2(h))} − 2 = **${commas(ans)}** usable hosts.`,
      hints: [
        `Host bits = 32 − ${n}.`,
        `Count all the addresses: two to the power of the host bits. Then take away the network and broadcast addresses, which hosts can't use.`,
      ],
      params: { kind, n },
    };
    const style = rng.int(0, 2);
    const ctxNet = style === 1 ? dotted(subnetOctets(pickIpForPrefix(n, rng), n).net) : "";
    const prompt = style === 0
      ? `How many **usable host** addresses does a **/${n}** subnet have (not counting the network and broadcast addresses)?`
      : style === 1
        ? `${rng.pick(TEAMS)} is given the network \`${ctxNet}/${n}\`. How many **usable host** addresses does it have (not counting the network and broadcast addresses)?`
        : `A subnet uses the mask \`${dotted(maskOctets(n))}\`. How many **usable host** addresses does it have (not counting the network and broadcast addresses)?`;
    if (style === 2) base.hints = [`Count the 1 bits in the mask to get the prefix length n. Host bits = 32 − n.`, base.hints[1]];
    if (difficulty !== "easy" && rng.next() < 0.3) {
      const c = numChoices(ans, [pow2(h), pow2(h) - 1, pow2(h + 1) - 2, pow2(h - 1) - 2], false, rng);
      return { ...base, prompt, answerType: "choice", ...c };
    }
    return { ...base, prompt: `${prompt} Type the whole number.`, answer: ans, answerType: "number", tolerance: 0 };
  }

  if (kind === "count") {
    const n = rng.int(8, 26);
    const m = rng.int(n + 2, Math.min(30, n + 8));
    const ans = pow2(m - n);
    return {
      prompt: `How many **/${m}** subnets fit into one **/${n}** network?`,
      answer: ans,
      answerType: "number",
      tolerance: 0,
      explanation: `Going from /${n} to /${m} borrows ${m} − ${n} = ${m - n} bits for the subnet part. Each borrowed bit doubles the number of subnets.\n\n2^${m - n} = **${ans}**`,
      hints: [
        `How many extra network bits does /${m} have compared with /${n}?`,
        `That's ${m - n} borrowed bits (calculator: \`_m - _n\`). Each one doubles the count, so work out 2 to that power.`,
      ],
      given: [{ label: "_n", value: n }, { label: "_m", value: m }],
      params: { kind, n, m },
    };
  }

  if (kind === "fit") {
    const n = difficulty === "medium" ? rng.int(22, 29) : rng.int(9, 29);
    const lo = usableHosts(n + 1) + 1, hi = usableHosts(n);
    const H = rng.next() < 0.25 ? hi : rng.int(lo, hi);
    return {
      prompt: `A subnet must hold at least **${commas(H)}** hosts. What is the **longest** prefix (the smallest subnet) that is big enough? Give *n* for /n.`,
      answer: n,
      answerType: "number",
      tolerance: 0,
      explanation: `Find the fewest host bits *h* with 2^h − 2 ≥ ${commas(H)}.\n\n- 2^${32 - n - 1} − 2 = ${commas(usableHosts(n + 1))}, too small\n- 2^${32 - n} − 2 = ${commas(hi)}, big enough\n\nSo h = ${32 - n} and the prefix is 32 − ${32 - n} = **${n}**.`,
      hints: [
        `You need host bits *h* so that 2^h − 2 is at least ${commas(H)}.`,
        `Add the network and broadcast addresses (${commas(H)} + 2), then find the smallest power of two, 2^h, that is at least that. The prefix is then 32 − h.`,
      ],
      params: { kind, H },
    };
  }

  // borrow (hard, multi-part)
  const p = rng.pick([8, 16, 16, 20, 22, 24, 24]);
  const maxBits = Math.min(30 - p, 10);
  const bitsWanted = rng.int(2, maxBits);
  const S = rng.next() < 0.25 ? pow2(bitsWanted) : rng.int(pow2(bitsWanted - 1) + 1, pow2(bitsWanted));
  let netO;
  if (p === 8) netO = [10, 0, 0, 0];
  else if (p === 16) netO = rng.pick([[172, rng.int(16, 31), 0, 0], [192, 168, 0, 0]]);
  else if (p === 20) netO = [172, rng.int(1, 3) * 16, 0, 0];
  else if (p === 22) netO = [10, rng.int(0, 255), rng.int(0, 63) * 4, 0];
  else netO = [192, 168, rng.int(0, 255), 0];
  const bits = bitsWanted;
  const np = p + bits;
  const hosts = usableHosts(np);
  return {
    prompt: `The network \`${dotted(netO)}/${p}\` must be split into at least **${S}** equal subnets. Borrow as few host bits as possible. Every subnet is usable (subnet zero allowed), so *s* borrowed bits give 2^s subnets.`,
    answerType: "multi",
    parts: [
      { id: "bits", label: "Borrowed bits", ask: "How many bits do you borrow?", answerType: "number", answer: bits, tolerance: 0,
        hint: `Find the smallest *s* with 2^s ≥ ${S} (\`_s\`).` },
      { id: "prefix", label: "New prefix", ask: "What is the new prefix length (n in /n)?", answerType: "number", answer: np, tolerance: 0,
        hint: `Add the borrowed bits to the original /${p} (\`_p\`).` },
      { id: "hosts", label: "Hosts per subnet", ask: "How many usable hosts does each subnet have?", answerType: "number", answer: hosts, tolerance: 0,
        hint: `Host bits left = 32 − (new prefix). Usable hosts = two to the power of the host bits, minus the network and broadcast addresses.` },
    ],
    explanation: `**Borrowed bits:** 2^${bits - 1} = ${pow2(bits - 1)} is less than ${S}, but 2^${bits} = ${pow2(bits)} is enough, so borrow **${bits}** bits.\n\n**New prefix:** ${p} + ${bits} = **/${np}**, so the answer is **${np}**.\n\n**Hosts per subnet:** 32 − ${np} = ${32 - np} host bits, so 2^${32 - np} − 2 = **${commas(hosts)}**.`,
    given: [{ label: "_p", value: p }, { label: "_s", value: S }],
    params: { kind: "borrow", p, S },
  };
}

function verifyMasks(q, answer) {
  const p = q.params;
  if (q.answerType === "choice" && !fourChoices(q)) return false;
  if (p.kind === "cidr2mask") {
    const v = parseDotted(String(answer));
    return v !== null && v === maskInt(p.n) && prefixOfMask(v) === p.n;
  }
  if (p.kind === "wildcard") {
    const v = parseDotted(String(answer));
    return v !== null && ((v ^ maskInt(p.n)) >>> 0) === 0xffffffff;
  }
  if (p.kind === "mask2cidr") {
    const v = parseDotted(dotted(p.m));
    return v !== null && Number(answer) === prefixOfMask(v);
  }
  if (p.kind === "hosts") {
    const x = Number(answer);
    return Number.isInteger(x) && BigInt(x) === big2(32 - p.n) - 2n;
  }
  if (p.kind === "count") {
    // Enumerate the /m block starts inside one /n network.
    const step = big2(32 - p.m), size = big2(32 - p.n);
    let c = 0;
    for (let s = 0n; s < size; s += step) c++;
    return Number(answer) === c;
  }
  if (p.kind === "fit") {
    // Scan every prefix from /30 upwards in size; the first that fits is the longest.
    let best = null;
    for (let n = 30; n >= 1; n--) {
      if (big2(32 - n) - 2n >= BigInt(p.H)) { best = n; break; }
    }
    return best !== null && Number(answer) === best;
  }
  if (p.kind === "borrow") {
    const a = answer && typeof answer === "object" ? answer : {};
    const s = Number(a.bits), np = Number(a.prefix), h = Number(a.hosts);
    if (![s, np, h].every(Number.isInteger) || s < 1) return false;
    const enough = big2(s) >= BigInt(p.S) && big2(s - 1) < BigInt(p.S);
    return enough && np === p.p + s && np <= 30 && BigInt(h) === big2(32 - np) - 2n;
  }
  return false;
}

// =============================================================================================
// Subtopic: Network and broadcast

const NB_ASK = {
  network: "the **network address**",
  broadcast: "the **broadcast address**",
  first: "the **first usable host** address",
  last: "the **last usable host** address",
};

function nbHints(ip, n, kind) {
  const { k, block } = subnetOctets(ip, n);
  const m = maskOctets(n);
  const h = [];
  if (n % 8 === 0) {
    h.push(`/${n} is \`${dotted(m)}\`: the first ${k} octet${k === 1 ? " is" : "s are"} the network part and the rest are host bits.`);
    h.push(kind === "network" ? "Keep the network octets and set every host octet to 0."
      : kind === "broadcast" ? "Keep the network octets and set every host octet to 255."
        : kind === "first" ? "Find the network address (host octets all 0), then add 1 to the last octet."
          : "Find the broadcast address (host octets all 255), then subtract 1 from the last octet.");
  } else {
    h.push(`/${n} puts the boundary inside the ${ORD[k]} octet, where the mask is ${m[k]}. The block size is 256 − ${m[k]} = ${block}.`);
    h.push(`Subnets start at multiples of ${block} in the ${ORD[k]} octet. Find the largest multiple of ${block} that is ≤ ${ip[k]}.${k < 3 ? " Octets after it are host bits." : ""}`);
    if (kind === "broadcast") h.push(`The broadcast is one less than the next block start: (that multiple + ${block}) − 1 in the ${ORD[k]} octet${k < 3 ? ", with 255 in every later octet" : ""}.`);
    if (kind === "first") h.push(`That multiple gives the network address${k < 3 ? " (later octets 0)" : ""}. The first usable host is the network address plus 1.`);
    if (kind === "last") h.push(`The broadcast ends the block at (multiple + ${block}) − 1${k < 3 ? " with 255 after it" : ""}. The last usable host is the broadcast minus 1.`);
  }
  return h;
}

function nbExplanation(ip, n) {
  const { net, bc, k, block } = subnetOctets(ip, n);
  const m = maskOctets(n);
  const first = addToOctets(net, 1), last = addToOctets(bc, -1);
  const intro = n % 8 === 0
    ? `/${n} = \`${dotted(m)}\`, so the first ${k} octet${k === 1 ? "" : "s"} are the network part.`
    : `/${n} = \`${dotted(m)}\`. The ${ORD[k]} octet has mask ${m[k]}, so the block size is 256 − ${m[k]} = ${block}. The largest multiple of ${block} that is ≤ ${ip[k]} is ${net[k]}.`;
  return `${intro}\n\n- Network address (host bits all 0): \`${dotted(net)}\`\n- Broadcast address (host bits all 1): \`${dotted(bc)}\`\n- First usable host (network + 1): \`${dotted(first)}\`\n- Last usable host (broadcast − 1): \`${dotted(last)}\``;
}

function pickIpForPrefix(n, rng) {
  // A usable host (not the network or broadcast address) in an ordinary unicast range.
  for (;;) {
    const ip = [rng.pick([10, 172, 192, rng.int(1, 223)]), rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)];
    if (ip[0] === 127) continue;
    if (ip[0] === 172 && rng.next() < 0.7) ip[1] = rng.int(16, 31);
    if (ip[0] === 192 && rng.next() < 0.7) ip[1] = 168;
    const { net, bc } = subnetOctets(ip, n);
    if (dotted(ip) !== dotted(net) && dotted(ip) !== dotted(bc)) return ip;
  }
}

function genNetBroadcast(difficulty, rng) {
  checkDifficulty(difficulty);
  let n;
  if (difficulty === "easy") n = rng.pick([8, 16, 24, 24]);
  else if (difficulty === "medium") n = rng.next() < 0.65 ? rng.int(25, 30) : rng.int(17, 23);
  else { do { n = rng.int(9, 30); } while (n % 8 === 0); }
  const ip = pickIpForPrefix(n, rng);
  const { net, bc } = subnetOctets(ip, n);
  const vals = { network: dotted(net), broadcast: dotted(bc), first: dotted(addToOctets(net, 1)), last: dotted(addToOctets(bc, -1)) };
  const kindRoll = difficulty === "hard" ? rng.pick(["multi", "multi", "hostin", "single"]) : difficulty === "medium" ? rng.pick(["single", "single", "single", "hostin"]) : "single";

  if (kindRoll === "multi") {
    const withRange = rng.next() < 0.5;
    const parts = [
      { id: "net", label: "Network", ask: `Network address (write it like ${likeIp(vals.network)})`, answerType: "text", answer: vals.network,
        hint: nbHints(ip, n, "network").join(" ") },
      { id: "bc", label: "Broadcast", ask: "Broadcast address (dotted decimal)", answerType: "text", answer: vals.broadcast,
        hint: `The broadcast is the next block start minus 1: in the ${ORD[Math.floor(n / 8)]} octet that is (network value + block size) − 1${n < 24 ? ", with 255 in every later octet" : ""}.` },
    ];
    if (withRange) {
      parts.push({ id: "hosts", label: "Usable hosts", ask: "How many usable host addresses does the subnet have?", answerType: "number", answer: usableHosts(n), tolerance: 0,
        hint: `Host bits = 32 − ${n}. Usable hosts = two to the power of the host bits, minus the network and broadcast addresses.` });
    } else {
      parts.push({ id: "last", label: "Last host", ask: "Last usable host address (dotted decimal)", answerType: "text", answer: vals.last,
        hint: "The last usable host is the broadcast address minus 1." });
    }
    return {
      prompt: `A host has the address \`${dotted(ip)}/${n}\`. ${IP_NOTE}.`,
      answerType: "multi",
      parts,
      explanation: `${nbExplanation(ip, n)}${withRange ? `\n\nUsable hosts: 2^${32 - n} − 2 = **${commas(usableHosts(n))}**.` : ""}`,
      params: { kind: "multi", ip, n },
    };
  }

  if (kindRoll === "hostin") {
    const size = pow2(32 - n);
    const ipOff = (ip[3] - net[3]) + 256 * ((ip[2] - net[2]) + 256 * ((ip[1] - net[1]) + 256 * (ip[0] - net[0])));
    let off;
    do { off = rng.int(1, size - 2); } while (off === ipOff);
    const right = dotted(addToOctets(net, off));
    const nextHost = dotted(addToOctets(bc, 1 + rng.int(1, Math.max(1, Math.min(size - 2, 40)))));
    const c = textChoices(right, [vals.network, vals.broadcast, nextHost], rng);
    return {
      prompt: `A host has the address \`${dotted(ip)}/${n}\`. Which of these is **another usable host** in the same subnet?`,
      answer: c.answer,
      answerType: "choice",
      choices: c.choices,
      explanation: `${nbExplanation(ip, n)}\n\nThe usable hosts run from \`${vals.first}\` to \`${vals.last}\`. \`${vals.network}\` is the network address, \`${vals.broadcast}\` is the broadcast address, and \`${nextHost}\` is past the broadcast, in the next subnet. The answer is **${right}**.`,
      hints: [
        ...nbHints(ip, n, "network"),
        "Work out the broadcast too. A usable host lies strictly between the network and broadcast addresses.",
      ].slice(-4),
      params: { kind: "hostin", ip, n },
    };
  }

  const kind = rng.pick(["network", "broadcast", "first", "last"]);
  const ans = vals[kind];
  const base = {
    explanation: `${nbExplanation(ip, n)}\n\nThe answer is **${ans}**.`,
    hints: nbHints(ip, n, kind),
    params: { kind, ip, n },
  };
  if (difficulty === "medium" && rng.next() < 0.3) {
    const others = ["network", "broadcast", "first", "last"].filter((x) => x !== kind).map((x) => vals[x]);
    const c = textChoices(ans, others, rng);
    if (c) return { ...base, prompt: `What is ${NB_ASK[kind]} of the subnet that contains \`${dotted(ip)}/${n}\`?`, answerType: "choice", ...c };
  }
  return {
    ...base,
    prompt: `What is ${NB_ASK[kind]} of the subnet that contains \`${dotted(ip)}/${n}\`? ${IP_NOTE}, like ${likeIp(ans)}.`,
    answer: ans,
    answerType: "text",
  };
}

// Bitwise re-derivation of the subnet of ip/n.
function subnetInts(ip, n) {
  const v = octInt(ip), m = maskInt(n);
  const net = (v & m) >>> 0;
  const bc = (net | (~m >>> 0)) >>> 0;
  return { v, net, bc };
}

function verifyNetBroadcast(q, answer) {
  const p = q.params;
  const { v, net, bc } = subnetInts(p.ip, p.n);
  if (v === net || v === bc) return false; // the given address must itself be a usable host
  const want = { network: net, broadcast: bc, first: net + 1, last: bc - 1 };
  if (p.kind in want) {
    if (q.answerType === "choice" && !fourChoices(q)) return false;
    return parseDotted(String(answer)) === want[p.kind];
  }
  if (p.kind === "hostin") {
    if (!fourChoices(q)) return false;
    const ok = (s) => { const x = parseDotted(s); return x !== null && x > net && x < bc && x !== v; };
    return q.choices.filter(ok).length === 1 && ok(String(answer));
  }
  if (p.kind === "multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    if (parseDotted(String(a.net ?? "")) !== net || parseDotted(String(a.bc ?? "")) !== bc) return false;
    const ids = (q.parts || []).map((x) => x.id);
    if (ids.includes("hosts")) {
      // Count usable hosts by enumeration when small, else from the integer range.
      const x = Number(a.hosts);
      if (!Number.isInteger(x)) return false;
      if (bc - net <= 4096) { let c = 0; for (let h = net + 1; h < bc; h++) c++; return x === c; }
      return x === bc - net - 1;
    }
    if (ids.includes("last")) return parseDotted(String(a.last ?? "")) === bc - 1;
    return false;
  }
  return false;
}

// =============================================================================================
// Subtopic: Data transfer

const SIZE_F = { KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1048576, GiB: 1073741824 };
const RATE_F = { kbps: 1e3, Mbps: 1e6, Gbps: 1e9 };
const SIZE_NOTE = {
  KB: "1 KB = 1,000 bytes", MB: "1 MB = 1,000,000 bytes", GB: "1 GB = 1,000,000,000 bytes",
  KiB: "1 KiB = 1,024 bytes", MiB: "1 MiB = 1,048,576 bytes (1024 × 1024)", GiB: "1 GiB = 1,073,741,824 bytes (1024 × 1024 × 1024)",
};
const RATE_NOTE = { kbps: "1 kbps = 1,000 bits per second", Mbps: "1 Mbps = 1,000,000 bits per second", Gbps: "1 Gbps = 1,000,000,000 bits per second" };
// Calculator-safe factor text (no commas).
const SIZE_C = { KB: "1000", MB: "1e6", GB: "1e9", KiB: "1024", MiB: "1024^2", GiB: "1024^3" };
const RATE_C = { kbps: "1e3", Mbps: "1e6", Gbps: "1e9" };

const FILES = ["a video", "a game update", "a backup", "a photo album", "a software installer", "a dataset", "a podcast episode", "a disk image", "a log archive", "a movie"];

function notes(units) {
  const parts = [...new Set(units)].map((u) => SIZE_NOTE[u] || RATE_NOTE[u]);
  return `Take ${parts.join(", ")} and 1 byte = 8 bits.`;
}

// Decide integer vs 2dp answer: integer when exact, else rounded.
function dtFinish(base, exact, rounded, candidates, rng, allowChoice) {
  const tol = rounded ? 0.005 : 0;
  if (allowChoice && rng.next() < 0.25) {
    const c = numChoices(exact, candidates, rounded, rng);
    return { ...base, tolerance: tol, answerType: "choice", ...c };
  }
  return { ...base, tolerance: tol, answer: rounded ? round2(exact) : exact, answerType: "number" };
}

function roundWords(rounded) {
  return rounded ? " Round to 2 decimal places." : "";
}

// "an 8 Mbps link", "an 11 Mbps link", but "a 100 Mbps link".
const an = (n) => (/^(8|(11|18)(\d{3})?(\.\d+)?$)/.test(String(n)) ? "an" : "a");

// Significant digits of a whole number (trailing zeros don't count).
const sigDigits = (n) => String(n).replace(/0+$/, "").length;

function genTransfer(difficulty, rng) {
  checkDifficulty(difficulty);
  const what = rng.pick(FILES);

  if (difficulty === "easy") {
    const kind = rng.pick(["time", "time", "conv"]);
    if (kind === "time") {
      const R = rng.pick([8, 10, 16, 20, 25, 40, 50, 80, 100, 200]);
      let T;
      do { T = rng.int(2, 90); } while ((R * T) % 8 !== 0);
      const S = (R * T) / 8;
      return dtFinish({
        prompt: `How many seconds does it take to send ${what} of **${S} MB** over ${an(R)} **${R} Mbps** link? ${notes(["MB", "Mbps"])} The answer is a whole number.`,
        explanation: `Convert the size to megabits, then divide by the speed.\n\n- ${S} MB × 8 = ${S * 8} Mb\n- ${S * 8} Mb ÷ ${R} Mbps = **${T} s**`,
        hints: [
          "Speeds are in bits per second but the size is in bytes. Multiply the size by 8 to get megabits.",
          `${S} MB = ${S * 8} Mb. Divide that by ${R} (calculator: \`_size * 8 / _rate\`).`,
        ],
        given: [{ label: "_size", value: S }, { label: "_rate", value: R }],
        params: { kind: "time", S, su: "MB", R, ru: "Mbps", eff: 1, out: "s", rounded: false },
      }, T, false, [], rng, false);
    }
    const t = rng.int(0, 2);
    if (t === 0) {
      const S = rng.int(2, 250), su = rng.pick(["KB", "MB"]);
      const ans = S * SIZE_F[su] * 8;
      return dtFinish({
        prompt: `How many **bits** are in **${S} ${su}**? ${notes([su])} Type the whole number.`,
        explanation: `Convert to bytes, then multiply by 8.\n\n- ${S} ${su} = ${commas(S * SIZE_F[su])} bytes\n- ${commas(S * SIZE_F[su])} × 8 = **${commas(ans)} bits**`,
        hints: [`First turn ${S} ${su} into bytes: ${S} × ${commas(SIZE_F[su])}.`, "Each byte is 8 bits, so multiply the bytes by 8."],
        params: { kind: "conv", S, su, to: "bit" },
      }, ans, false, [], rng, false);
    }
    const R = t === 1 ? rng.int(1, 120) * 8 : rng.int(1, 60) * 8;
    if (t === 1) {
      return dtFinish({
        prompt: `A link runs at **${R} Mbps**. How many **megabytes** (MB) can it carry per second? ${notes(["MB", "Mbps"])}`,
        explanation: `Divide megabits by 8 to get megabytes.\n\n${R} ÷ 8 = **${R / 8} MB per second**`,
        hints: ["There are 8 bits in a byte, so 8 megabits make 1 megabyte.", `Divide ${R} by 8.`],
        params: { kind: "conv", R, ru: "Mbps", to: "MB" },
      }, R / 8, false, [], rng, false);
    }
    return dtFinish({
      prompt: `A link runs at **${R} kbps**. How many **bytes** can it carry per second? ${notes(["kbps"])} Type the whole number.`,
      explanation: `Convert to bits per second, then divide by 8.\n\n- ${R} kbps = ${commas(R * 1000)} bits/s\n- ${commas(R * 1000)} ÷ 8 = **${commas(R * 125)} bytes/s**`,
      hints: [`${R} kbps is ${R} × 1,000 bits per second.`, "Divide the bits per second by 8 to get bytes per second."],
      params: { kind: "conv", R, ru: "kbps", to: "byte" },
    }, R * 125, false, [], rng, false);
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["time", "time", "size", "rate"]);
    if (kind === "time") {
      const combo = rng.pick([["GB", "Mbps"], ["MB", "kbps"], ["GB", "Gbps"], ["MB", "Mbps"]]);
      const [su, ru] = combo;
      const S = su === "GB" ? rng.int(1, 40) : rng.int(2, 900);
      const R = ru === "kbps" ? rng.pick([256, 512, 768, 1000, 1500, 2000])
        : ru === "Gbps" ? rng.pick([1, 2, 2.5, 5, 10]) : rng.pick([12, 30, 50, 75, 100, 150, 300, 500]);
      const inMin = su === "GB" && ru === "Mbps" ? rng.next() < 0.5 : (su === "MB" && ru === "kbps");
      const bits = S * SIZE_F[su] * 8;
      const secs = bits / (R * RATE_F[ru]);
      const exact = inMin ? secs / 60 : secs;
      const unit = inMin ? "minutes" : "seconds";
      const calc = `_size * ${SIZE_C[su]} * 8 / (_rate * ${RATE_C[ru]})${inMin ? " / 60" : ""}`;
      return dtFinish({
        prompt: `How long does it take to download ${what} of **${num(S)} ${su}** over ${an(R)} **${num(R)} ${ru}** connection, in **${unit}**? ${notes([su, ru])}${roundWords(true)}`,
        explanation: `Turn both into bits, then divide.\n\n- Size: ${num(S)} × ${commas(SIZE_F[su])} × 8 = ${commas(bits)} bits\n- Speed: ${num(R)} × ${commas(RATE_F[ru])} = ${commas(R * RATE_F[ru])} bits/s\n- Time: ${commas(bits)} ÷ ${commas(R * RATE_F[ru])} = ${num(secs)} s${inMin ? `\n- In minutes: ${num(secs)} ÷ 60 ≈ ${num(exact)}` : ""}\n\nRounded: **${round2(exact).toFixed(2)} ${unit}**`,
        hints: [
          `Size in bits: ${num(S)} × ${commas(SIZE_F[su])} × 8. Speed in bits per second: ${num(R)} × ${commas(RATE_F[ru])}.`,
          `Divide the bits by the bits per second${inMin ? ", then divide by 60 for minutes" : ""}. In the calculator: \`${calc}\`.`,
        ],
        given: [{ label: "_size", value: S }, { label: "_rate", value: R }],
        params: { kind: "time", S, su, R, ru, eff: 1, out: inMin ? "min" : "s", rounded: true },
      }, exact, true, [exact / 8, exact * 8, exact * 1000, exact / 1000, exact * 1.024], rng, true);
    }
    if (kind === "size") {
      const R = rng.pick([10, 20, 25, 40, 60, 75, 100, 150, 250]);
      const T = rng.int(5, 600);
      const exact = (R * 1e6 * T) / 8 / 1e6;
      return dtFinish({
        prompt: `A link sustains **${R} Mbps** for **${T} seconds**. How many **MB** does it transfer? ${notes(["MB", "Mbps"])}${roundWords(true)}`,
        explanation: `Total bits = speed × time, then divide by 8 for bytes.\n\n- ${R} Mbps × ${T} s = ${commas(R * T)} Mb\n- ${commas(R * T)} ÷ 8 = **${round2(exact).toFixed(2)} MB**`,
        hints: [`Multiply speed by time to get megabits: ${R} × ${T}.`, "Divide megabits by 8 to get megabytes (calculator: `_rate * _time / 8`)."],
        given: [{ label: "_rate", value: R }, { label: "_time", value: T }],
        params: { kind: "size", R, ru: "Mbps", T, out: "MB", rounded: true },
      }, exact, true, [R * T, exact / 8, exact * 1.024], rng, true);
    }
    // rate (throughput)
    const S = rng.int(5, 2000);
    const T = rng.int(3, 300);
    const exact = (S * 8) / T;
    return dtFinish({
      prompt: `Downloading ${what} of **${S} MB** took **${T} seconds**. What was the average throughput in **Mbps**? ${notes(["MB", "Mbps"])}${roundWords(true)}`,
      explanation: `Throughput = data ÷ time, in bits.\n\n- ${S} MB × 8 = ${commas(S * 8)} Mb\n- ${commas(S * 8)} ÷ ${T} ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)} Mbps**`,
      hints: [`Turn the size into megabits: ${S} × 8.`, "Divide megabits by seconds (calculator: `_size * 8 / _time`)."],
      given: [{ label: "_size", value: S }, { label: "_time", value: T }],
      params: { kind: "rate", S, su: "MB", T, out: "Mbps", rounded: true },
    }, exact, true, [S / T, exact * 8, exact / 1000 * 1024], rng, true);
  }

  // hard
  const kind = rng.pick(["time", "rate", "multi"]);
  let su = rng.pick(["MiB", "GiB", "GiB"]);
  let S = su === "GiB" ? rng.int(1, 64) : rng.int(50, 4000);
  // The multi-part question asks for the size in bits: keep it within 10 significant digits, which is
  // what the calculator's Use copies. Otherwise switch to MiB, at most 1192 (under 10^10 bits).
  if (kind === "multi" && sigDigits(S * SIZE_F[su] * 8) > 10) {
    su = "MiB";
    S = rng.int(50, 1192);
  }
  if (kind === "rate") {
    const mins = rng.int(1, 30), secsPart = rng.int(0, 59);
    const T = mins * 60 + secsPart;
    const bits = S * SIZE_F[su] * 8;
    const exact = bits / T / 1e6;
    return dtFinish({
      prompt: `A **${S} ${su}** ${what.replace(/^an? /, "")} took **${mins} min ${secsPart} s** to copy across the network. What was the average throughput in **Mbps**? ${notes([su, "Mbps"])}${roundWords(true)}`,
      explanation: `Convert the size to bits and the time to seconds, then divide.\n\n- Size: ${S} × ${commas(SIZE_F[su])} × 8 = ${commas(bits)} bits\n- Time: ${mins} × 60 + ${secsPart} = ${T} s\n- ${commas(bits)} ÷ ${T} ÷ 1,000,000 ≈ ${num(exact)}\n\nRounded: **${round2(exact).toFixed(2)} Mbps**`,
      hints: [
        `Size in bits: ${S} × ${SIZE_F[su] === 1048576 ? "1024 × 1024" : "1024 × 1024 × 1024"} × 8. Time in seconds: ${mins} × 60 + ${secsPart}.`,
        `Divide bits by seconds to get bits per second, then divide by 1,000,000 for Mbps. Calculator: \`_size * ${SIZE_C[su]} * 8 / _time / 1e6\`.`,
      ],
      given: [{ label: "_size", value: S }, { label: "_time", value: T }],
      params: { kind: "rate", S, su, T, out: "Mbps", rounded: true },
    }, exact, true, [exact / 8, exact * 8, (S * Number(SIZE_C[su] === "1024^2" ? 1e6 : 1e9) * 8) / T / 1e6], rng, true);
  }

  const ru = rng.pick(["Mbps", "Mbps", "Gbps"]);
  const R = ru === "Gbps" ? rng.pick([1, 2.5, 10]) : rng.pick([20, 50, 80, 100, 200, 300, 500, 940]);
  const eff = rng.pick([1, 0.9, 0.85, 0.8, 0.75]);
  const bits = S * SIZE_F[su] * 8;
  const secs = bits / (R * RATE_F[ru] * eff);
  const inMin = secs > 600 && rng.next() < 0.6;
  const exact = inMin ? secs / 60 : secs;
  const unit = inMin ? "minutes" : "seconds";
  const effText = eff === 1 ? "" : ` Protocol overhead means only **${Math.round(eff * 100)}%** of the link speed carries file data.`;
  const effCalc = eff === 1 ? "" : " * _eff";
  const calc = `_size * ${SIZE_C[su]} * 8 / (_rate * ${RATE_C[ru]}${effCalc})${inMin ? " / 60" : ""}`;
  const given = [{ label: "_size", value: S }, { label: "_rate", value: R }, ...(eff === 1 ? [] : [{ label: "_eff", value: eff }])];
  const steps = `- Size: ${S} × ${commas(SIZE_F[su])} × 8 = ${commas(bits)} bits\n- Speed: ${num(R)} × ${commas(RATE_F[ru])}${eff === 1 ? "" : ` × ${eff}`} = ${commas(R * RATE_F[ru] * eff)} bits/s\n- Time: ${commas(bits)} ÷ ${commas(R * RATE_F[ru] * eff)} ≈ ${num(secs)} s${inMin ? `\n- In minutes: ${num(secs)} ÷ 60 ≈ ${num(exact)}` : ""}`;
  const params = { kind: "time", S, su, R, ru, eff, out: inMin ? "min" : "s", rounded: true };

  if (kind === "multi") {
    return {
      prompt: `You send ${what} of **${S} ${su}** over ${an(R)} **${num(R)} ${ru}** link.${effText} ${notes([su, ru])}`,
      answerType: "multi",
      parts: [
        { id: "bits", label: "Size in bits", ask: "How many bits is the file? Type the whole number.", answerType: "number", answer: bits, tolerance: 0,
          hint: `Multiply ${S} by ${commas(SIZE_F[su])} to get bytes, then by 8. Calculator: \`_size * ${SIZE_C[su]} * 8\`.` },
        { id: "time", label: "Transfer time", ask: `How long does it take, in ${unit}? Round to 2 decimal places.`, answerType: "number", answer: round2(exact), tolerance: 0.005,
          hint: `Divide the bits by the bits per second actually carried: ${num(R)} × ${commas(RATE_F[ru])}${eff === 1 ? "" : ` × ${eff}`}${inMin ? ", then divide by 60" : ""}. Calculator: \`${calc}\`.` },
      ],
      explanation: `Work in bits and bits per second.\n\n${steps}\n\n**Size in bits:** **${commas(bits)}**\n\n**Transfer time:** **${round2(exact).toFixed(2)} ${unit}**`,
      given,
      params: { ...params, multi: true },
    };
  }

  return dtFinish({
    prompt: `How long does it take to send ${what} of **${S} ${su}** over ${an(R)} **${num(R)} ${ru}** link, in **${unit}**?${effText} ${notes([su, ru])}${roundWords(true)}`,
    explanation: `Work in bits and bits per second.\n\n${steps}\n\nRounded: **${round2(exact).toFixed(2)} ${unit}**`,
    hints: [
      `Size in bits: ${S} × ${commas(SIZE_F[su])} × 8. Watch out: ${su} uses 1024s, but the link speed uses 1000s.`,
      `Bits per second actually carried: ${num(R)} × ${commas(RATE_F[ru])}${eff === 1 ? "" : ` × ${eff}`}.`,
      `Divide bits by bits per second${inMin ? ", then by 60 for minutes" : ""}. Calculator: \`${calc}\`.`,
    ],
    given,
    params,
  }, exact, true, [exact / 8, exact * 8, exact * Math.pow(1000 / 1024, su === "MiB" ? 2 : 3), exact * eff, eff === 1 ? exact / 1000 : exact * eff * eff], rng, true);
}

// Unit factors rebuilt from the unit name (verify-only): k/M/G = 10^3, 10^6, 10^9; Ki/Mi/Gi = 2^10, 2^20, 2^30.
function unitFactor(u) {
  const m = /^([kKMG])(i?)(B|bps)$/.exec(u);
  if (!m) return NaN;
  const e = { k: 1, K: 1, M: 2, G: 3 }[m[1]];
  return m[2] ? Math.pow(2, 10 * e) : Math.pow(10, 3 * e);
}

// Residual of a candidate answer x, and how much the residual moves per unit of x.
function dtResidual(p, x) {
  if (p.kind === "time") {
    const bits = p.S * unitFactor(p.su) * 8;
    const bps = p.R * unitFactor(p.ru) * p.eff;
    const k = p.out === "min" ? 60 : 1;
    return { r: x * k * bps - bits, sens: k * bps, scale: bits };
  }
  if (p.kind === "rate") {
    const bits = p.S * unitFactor(p.su) * 8;
    return { r: x * unitFactor(p.out) * p.T - bits, sens: unitFactor(p.out) * p.T, scale: bits };
  }
  if (p.kind === "size") {
    const bits = p.R * unitFactor(p.ru) * p.T;
    return { r: x * unitFactor(p.out) * 8 - bits, sens: unitFactor(p.out) * 8, scale: bits };
  }
  if (p.kind === "conv") {
    const from = p.S !== undefined ? p.S * unitFactor(p.su) * 8 : p.R * unitFactor(p.ru);
    const per = { bit: 1, byte: 8, MB: 8 * unitFactor("MB") }[p.to];
    return { r: x * per - from, sens: per, scale: from };
  }
  return null;
}

function dtOk(p, x, rounded) {
  if (!Number.isFinite(x)) return false;
  const d = dtResidual(p, x);
  if (!d || !Number.isFinite(d.r)) return false;
  if (rounded) return Math.abs(d.r) <= 0.005 * d.sens * (1 + 1e-9);
  return Math.abs(d.r) <= 1e-6 * d.sens;
}

// Exactly one 2-decimal answer may pass: reject half-cent ties (the engine regenerates).
function dtWellPosed(p, a) {
  for (const dd of [-0.01, 0.01]) if (dtOk(p, Math.round((a + dd) * 100) / 100, true)) return false;
  return true;
}

function verifyTransfer(q, answer) {
  const p = q.params;
  if (p.multi) {
    const a = answer && typeof answer === "object" ? answer : {};
    const bits = Number(a.bits), t = Number(a.time);
    const bp = { kind: "conv", S: p.S, su: p.su, to: "bit" };
    return dtOk(bp, bits, false) && Number.isInteger(bits) && dtOk(p, t, true) && dtWellPosed(p, t);
  }
  if (q.answerType === "choice" && !fourChoices(q)) return false;
  const x = Number(answer);
  if (answer === "" || answer === null || answer === undefined || !dtOk(p, x, p.rounded)) return false;
  if (p.rounded) return dtWellPosed(p, x);
  return Number.isInteger(x);
}

// =============================================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "ip-binary") return genIpBinary(difficulty, rng);
  if (subtopic === "masks-cidr") return genMasks(difficulty, rng);
  if (subtopic === "network-broadcast") return genNetBroadcast(difficulty, rng);
  if (subtopic === "data-transfer") {
    // A few draws put a 2-decimal answer exactly on a half (25 Mbps × 331 s ÷ 8 = 1034.375 MB),
    // so two answers would round correctly and verify() rejects it. Redraw from the same rng:
    // well-posed seeds give exactly the same question as before.
    let q;
    for (let t = 0; t < 10; t++) {
      q = genTransfer(difficulty, rng);
      const own = q.answerType === "multi" ? Object.fromEntries(q.parts.map((p) => [p.id, p.answer])) : q.answer;
      if (verify(q, own) === true) return q;
    }
    return q;
  }
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: 32-bit integer and bitwise maths, bit-by-bit parsing, enumeration or
// substitution, never the generator's octet arithmetic.
export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.kind) return false; // regenerate from the seed to get params back
  if (answer === "" || answer === null || answer === undefined) return false;
  try {
    if (p.kind.startsWith("x-")) return verifyExpert(p, question, answer);
    if (["oct2bin", "bin2oct", "class", "classbin", "ip2bin", "bin2ip", "classify"].includes(p.kind) || (p.kind === "multi" && p.idx !== undefined)) return verifyIpBinary(question, answer);
    if (["cidr2mask", "wildcard", "mask2cidr", "hosts", "count", "fit", "borrow"].includes(p.kind)) return verifyMasks(question, answer);
    if (["network", "broadcast", "first", "last", "hostin"].includes(p.kind) || (p.kind === "multi" && p.ip)) return verifyNetBroadcast(question, answer);
    if (["time", "rate", "size", "conv"].includes(p.kind)) return verifyTransfer(question, answer);
  } catch {
    return false;
  }
  return false;
}

// =============================================================================================
// Expert. A separate branch: generate() dispatches here first (before checkDifficulty and the
// data-transfer retry loop), so easy/medium/hard draws are unchanged. Hints use only values
// already drawn. Params kinds start with "x-"; verifyExpert re-derives everything with 32-bit
// integer / bitwise maths, prefix scans with big2, unit factors from unit names and residuals.

const hex8 = (o) => o.map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join("");
const YN = ["Yes", "No"];

// ---- IP addresses and binary / expert ----

function xIpInt(rng) {
  const cat = rng.pick(["private", "private", "public", "public", "loopback", "linklocal"]);
  const o = addressOf(cat, false, rng);
  const val = ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];
  const hx = hex8(o);
  return {
    prompt: `Software often stores an IPv4 address as one 32-bit number. Take the address \`${dotted(o)}\`.`,
    answerType: "multi",
    parts: [
      { id: "int", label: "32-bit integer", ask: "The address as one decimal integer. Type the whole number, without commas.", answerType: "number", answer: val, tolerance: 0,
        hint: "The octets are base-256 digits: first × 256³ + second × 256² + third × 256 + fourth. Calculator: `_o1*256^3 + _o2*256^2 + _o3*256 + _o4`." },
      { id: "hex", label: "Hex", ask: `The address in hexadecimal: exactly 8 hex digits, keeping leading zeros, no 0x (like ${hx === "0A000001" ? "`C0A80001` for 192.168.0.1" : "`0A000001` for 10.0.0.1"}).`, answerType: "text", answer: hx,
        hint: "Each octet becomes exactly two hex digits: divide it by 16; the whole-number result is the first digit and the remainder the second." },
    ],
    explanation: `Each octet is one base-256 digit.\n\n- ${o[0]} × 16,777,216 + ${o[1]} × 65,536 + ${o[2]} × 256 + ${o[3]} = **${commas(val)}**\n- In hex, each octet is two digits: ${o.map((x) => `${x} → ${x.toString(16).toUpperCase().padStart(2, "0")}`).join(", ")}, so **${hx}**.`,
    given: [{ label: "_o1", value: o[0] }, { label: "_o2", value: o[1] }, { label: "_o3", value: o[2] }, { label: "_o4", value: o[3] }],
    params: { kind: "x-ipint", o },
    hints: [
      "Think of the four octets as digits in base 256: the first is worth 256³ = 16,777,216, the second 256² = 65,536, the third 256 and the last 1.",
      "For hex, 8 bits = 2 hex digits, so convert each octet separately and write the four pairs side by side.",
    ],
  };
}

function xHexIp(rng) {
  const cat = rng.pick(["private", "private", "public", "loopback", "linklocal"]);
  const o = addressOf(cat, rng.next() < 0.5, rng);
  const c = catByOctets(o);
  if (!CAT_LABEL[c]) return xHexIp(rng);
  const hx = hex8(o);
  return {
    prompt: `A packet capture shows an IPv4 address as the hex value \`${hx}\` (8 hex digits, two per octet).`,
    answerType: "multi",
    parts: [
      { id: "ip", label: "Address", ask: `The address in dotted decimal (write it like ${likeIp(dotted(o))}).`, answerType: "text", answer: dotted(o),
        hint: "Split the hex into four pairs. Each pair is one octet: first digit × 16 + second digit." },
      { id: "type", label: "Type", ask: "What kind of address is it?", answerType: "choice", answer: CAT_LABEL[c], choices: [PRIV, PUB, LOOP, LINK],
        hint: "Compare it with 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private), 127.0.0.0/8 (loopback) and 169.254.0.0/16 (link-local)." },
    ],
    explanation: `Split into pairs and convert each: ${hx.match(/../g).map((p, i) => `\`${p}\` = ${o[i]}`).join(", ")}. The address is **${dotted(o)}**.\n\n${classifyExplanation(o, c)}`,
    params: { kind: "x-hexip", hx },
    hints: [
      `Split \`${hx}\` into four pairs of hex digits.`,
      "Convert each pair to decimal (A = 10 … F = 15); those are the four octets.",
      "Then check the octets against the reserved ranges, watching the edges such as 172.16 to 172.31.",
    ],
  };
}

function xSameSubnet(rng) {
  for (;;) {
    let n;
    do n = rng.int(17, 30); while (n % 8 === 0);
    const a = pickIpForPrefix(n, rng);
    const { net, bc, k, block } = subnetOctets(a, n);
    const same = rng.next() < 0.5;
    let b;
    if (same) {
      const size = pow2(32 - n);
      b = addToOctets(net, rng.int(1, size - 2));
    } else {
      const dir = rng.next() < 0.5 ? -1 : 1;
      b = dir < 0 ? addToOctets(net, -rng.int(2, Math.min(40, pow2(32 - n) - 1))) : addToOctets(bc, rng.int(2, Math.min(40, pow2(32 - n) - 1)));
    }
    if (dotted(b) === dotted(a)) continue;
    const m = maskOctets(n);
    return {
      prompt: `Host A is \`${dotted(a)}\` and host B is \`${dotted(b)}\`, both with mask /${n} (\`${dotted(m)}\`). A router finds a host's network by ANDing its address with the mask, bit by bit.`,
      answerType: "multi",
      parts: [
        { id: "bits", label: `${ORD[k]} octet`, ask: `The ${ORD[k]} octet of host A's network address, in 8-bit binary (like ${likeBin8(bin8(net[k]))}).`, answerType: "text", answer: bin8(net[k]),
          hint: `Write ${a[k]} and the mask octet ${m[k]} in binary and AND them: a result bit is 1 only where both bits are 1.` },
        { id: "same", label: "Same subnet?", ask: "Are A and B on the same subnet?", answerType: "choice", answer: same ? "Yes" : "No", choices: YN,
          hint: `Do the same AND for B's ${ORD[k]} octet (and check the octets before it) and compare the two network addresses.` },
      ],
      explanation: `The mask ${m[k]} = \`${bin8(m[k])}\` keeps the first ${n % 8} bit${n % 8 === 1 ? "" : "s"} of the ${ORD[k]} octet.\n\n- A: \`${bin8(a[k])}\` AND \`${bin8(m[k])}\` = **${bin8(net[k])}** (${net[k]}), so A's network is \`${dotted(net)}\`.\n- B's network is \`${dotted(subnetOctets(b, n).net)}\`.\n\n${same ? "They match: **Yes**, same subnet." : "They differ: **No**, B is in a different subnet."} (Blocks are ${block} wide in the ${ORD[k]} octet; A's runs from \`${dotted(net)}\` to \`${dotted(bc)}\`.)`,
      params: { kind: "x-samesub", a, b, n },
      hints: [
        `With /${n}, the boundary is inside the ${ORD[k]} octet, where the mask is ${m[k]} = \`${bin8(m[k])}\`.`,
        "AND keeps a bit only when both bits are 1, so the mask keeps the network bits and clears the host bits.",
        "Two hosts are on the same subnet when every octet of their network addresses matches.",
      ],
    };
  }
}

// ---- Subnet masks and CIDR / expert ----

const DEPTS = ["Sales", "Admin", "Lab", "Guest Wi-Fi", "Cameras", "Finance", "Support", "Servers", "Printers", "Warehouse"];

function xVlsm(rng) {
  for (;;) {
    const base = rng.pick([[192, 168, rng.int(0, 255), 0], [10, rng.int(0, 255), rng.int(0, 255), 0], [172, rng.int(16, 31), rng.int(0, 255), 0]]);
    const names = rng.shuffle(DEPTS).slice(0, 3);
    const need = names.map(() => rng.int(3, 120));
    const pref = need.map((h) => { let p = 30; while (usableHosts(p) < h) p--; return p; });
    const order = [0, 1, 2].sort((x, y) => pref[x] - pref[y] || x - y); // biggest block first; ties keep listed order
    const sizes = order.map((i) => pow2(32 - pref[i]));
    if (sizes.reduce((s, x) => s + x, 0) > 256 || new Set(need).size < 3) continue;
    const starts = [];
    let off = 0;
    for (const s of sizes) { starts.push(off); off += s; }
    const third = addToOctets(base, starts[2]);
    return {
      prompt: `The network \`${dotted(base)}/24\` is split with VLSM for three teams: ${names.map((nm, i) => `**${nm}** needs ${need[i]} hosts`).join(", ")}. Give each team the smallest subnet that fits (usable hosts = 2^h − 2), and hand them out **biggest subnet first** from the start of the block (equal sizes in the order listed), each starting straight after the previous one.`,
      answerType: "multi",
      parts: [
        ...[0, 1, 2].map((i) => ({ id: `p${i + 1}`, label: names[i], ask: `Prefix length for ${names[i]} (n in /n)`, answerType: "number", answer: pref[i], tolerance: 0,
          hint: `Find the fewest host bits h with 2^h − 2 ≥ ${need[i]}; the prefix is 32 − h.` })),
        { id: "net3", label: "Third subnet", ask: `Network address of the subnet handed out **third** (${names[order[2]]}). ${IP_NOTE}.`, answerType: "text", answer: dotted(third),
          hint: "Add the sizes (2^h addresses each) of the first two subnets to the start of the block." },
      ],
      explanation: `Smallest subnet for each team:\n\n${names.map((nm, i) => `- ${nm}: ${need[i]} hosts → 2^${32 - pref[i]} − 2 = ${usableHosts(pref[i])} ≥ ${need[i]}, so **/${pref[i]}** (${pow2(32 - pref[i])} addresses)`).join("\n")}\n\nBiggest first: ${order.map((i, j) => `${names[i]} at \`${dotted(addToOctets(base, starts[j]))}/${pref[i]}\``).join(", ")}.\n\nThe third subnet starts at ${starts[2]} addresses in: **${dotted(third)}**.`,
      given: need.map((h, i) => ({ label: `_h${i + 1}`, value: h })),
      params: { kind: "x-vlsm", base, need },
      hints: [
        "For each team, find the smallest power of two that is at least hosts + 2. That is the subnet size.",
        "Sort the subnets from biggest to smallest; allocating in that order keeps every subnet on a boundary of its own size.",
        `The first subnet starts at \`${dotted(base)}\`; each next one starts right after the previous one ends.`,
      ],
    };
  }
}

function xSummary(rng) {
  for (;;) {
    const cnt = rng.int(2, 4);
    const first = rng.pick([[10, rng.int(0, 255)], [172, rng.int(16, 31)], [192, 168]]);
    const start = rng.int(0, 255 - cnt);
    const nets = Array.from({ length: cnt }, (_, i) => [first[0], first[1], start + i, 0]);
    // Generation: grow the block until it covers the first and last /24.
    let p = 24;
    while (p > 16 && Math.floor(start / pow2(24 - p)) !== Math.floor((start + cnt - 1) / pow2(24 - p))) p--;
    const sumNet = [first[0], first[1], Math.floor(start / pow2(24 - p)) * pow2(24 - p), 0];
    const extra = pow2(24 - p) - cnt;
    return {
      prompt: `A router has these routes:\n\n${nets.map((x) => `- \`${dotted(x)}/24\``).join("\n")}\n\nThey are to be replaced by **one** summary route: the longest prefix that covers all of them. (It may also cover some addresses that are not in the list.)`,
      answerType: "multi",
      parts: [
        { id: "net", label: "Summary network", ask: `Summary network address. ${IP_NOTE}.`, answerType: "text", answer: dotted(sumNet),
          hint: "Keep only the bits that all the networks share; set the rest to 0." },
        { id: "prefix", label: "Prefix", ask: "Its prefix length (n in /n)", answerType: "number", answer: p, tolerance: 0,
          hint: `Write the third octets ${start} and ${start + cnt - 1} in binary and count how many leading bits they share. Add that to 16.` },
      ],
      explanation: `Only the third octet changes. In binary:\n\n${nets.map((x) => `- ${x[2]} = \`${bin8(x[2])}\``).join("\n")}\n\nThey share the first ${p - 16} bits, so the summary is /16 + ${p - 16} = **/${p}**, starting at **${dotted(sumNet)}**.${extra ? ` It also covers ${extra} other /24${extra === 1 ? "" : "s"}, which is allowed here.` : ""}`,
      params: { kind: "x-summary", nets },
      hints: [
        "A summary route covers a block whose size is a power of two and that starts on a multiple of that size.",
        `Compare the first and last networks, \`${dotted(nets[0])}\` and \`${dotted(nets[cnt - 1])}\`: everything they share in binary stays.`,
        "Count the shared leading bits across the whole address. That count is the prefix.",
      ],
    };
  }
}

function xMaskBack(rng) {
  for (;;) {
    const n = rng.int(18, 29);
    const ip = pickIpForPrefix(n, rng);
    const { net, bc } = subnetOctets(ip, n);
    const h = usableHosts(n);
    return {
      prompt: `A subnet's broadcast address is \`${dotted(bc)}\` and it has exactly **${commas(h)}** usable host addresses.`,
      answerType: "multi",
      parts: [
        { id: "mask", label: "Mask", ask: `Its subnet mask in dotted decimal (like \`255.255.255.0\`).`, answerType: "text", answer: dotted(maskOctets(n)),
          hint: `Usable hosts = 2^h − 2, so 2^h = ${commas(h)} + 2. Find h, then the prefix is 32 − h.` },
        { id: "net", label: "Network", ask: `Its network address. ${IP_NOTE}.`, answerType: "text", answer: dotted(net),
          hint: "The subnet holds 2^h addresses ending at the broadcast, so the network address is broadcast − 2^h + 1." },
      ],
      explanation: `- ${commas(h)} + 2 = ${commas(h + 2)} = 2^${32 - n}, so there are ${32 - n} host bits and the prefix is /${n}: mask **${dotted(maskOctets(n))}**.\n- The block has ${commas(h + 2)} addresses and ends at \`${dotted(bc)}\`, so it starts ${commas(h + 1)} addresses earlier: **${dotted(net)}**.`,
      given: [{ label: "_hosts", value: h }],
      params: { kind: "x-maskback", bc, h },
      hints: [
        "Add back the network and broadcast addresses: the block holds hosts + 2 addresses, a power of two.",
        "Host bits h give the prefix 32 − h, and the mask has that many 1s.",
        "The broadcast is the last address of the block. Count back to its first address.",
      ],
    };
  }
}

// ---- Network and broadcast / expert ----

function xKth(rng) {
  const p = rng.pick([16, 16, 20, 22]);
  const base = p === 16 ? rng.pick([[10, rng.int(0, 255), 0, 0], [172, rng.int(16, 31), 0, 0]])
    : p === 20 ? [172, rng.int(1, 15) * 16, 0, 0] : [10, rng.int(0, 255), rng.int(0, 63) * 4, 0];
  const m = rng.int(Math.max(p + 3, 24), 28);
  const count = pow2(m - p);
  const k = rng.int(3, count - 2);
  const size = pow2(32 - m);
  const net = addToOctets(base, k * size);
  const bc = addToOctets(net, size - 1);
  return {
    prompt: `The network \`${dotted(base)}/${p}\` is cut into equal **/${m}** subnets, numbered from **0** (subnet 0 starts at \`${dotted(base)}\`; subnet zero is allowed). Look at **subnet number ${k}**. ${IP_NOTE}.`,
    answerType: "multi",
    parts: [
      { id: "net", label: "Network", ask: "Its network address", answerType: "text", answer: dotted(net),
        hint: `Each /${m} subnet has 2^${32 - m} addresses. Subnet ${k} starts ${k} × that many addresses after the base, carrying into the next octet every 256.` },
      { id: "bc", label: "Broadcast", ask: "Its broadcast address", answerType: "text", answer: dotted(bc),
        hint: "The broadcast is the last address of the subnet: the network address plus the subnet size, minus 1." },
      { id: "first", label: "First host", ask: "Its first usable host address", answerType: "text", answer: dotted(addToOctets(net, 1)),
        hint: "The first usable host is the network address plus 1." },
    ],
    explanation: `A /${m} subnet has 2^${32 - m} = ${size} addresses.\n\n- Subnet ${k} starts ${k} × ${size} = ${commas(k * size)} addresses after \`${dotted(base)}\`${k * size >= 256 ? ` (${Math.floor(k * size / 256)} × 256 + ${(k * size) % 256}, so the third octet goes up by ${Math.floor(k * size / 256)} and the fourth is ${(k * size) % 256})` : ""}: **${dotted(net)}**.\n- Broadcast: + ${size - 1} → **${dotted(bc)}**.\n- First usable host: **${dotted(addToOctets(net, 1))}**.`,
    given: [{ label: "_k", value: k }, { label: "_size", value: size }],
    params: { kind: "x-kth", base, p, m, k },
    hints: [
      `Subnet size: 2^(32 − ${m}) addresses. Calculator: \`_k * _size\` gives how far subnet ${k} starts from the base.`,
      "Turn that offset into octets: divide by 256; the whole-number part adds to the third octet and the remainder is the fourth.",
      "Broadcast = start + size − 1; first host = start + 1.",
    ],
  };
}

// Gateway check as Valid? | Reason blocks. The options are the answer plus every tuple that changes
// exactly one column (5 in all, fixed order, no rng).
const GW_COLS = ["Valid?", "Reason"];
const GW_REASON = { ok: "Usable host in the same subnet", other: "In a different subnet", net: "The subnet's network address", bc: "The subnet's broadcast address" };
const gwTuple = (kind) => [kind === "ok" ? "Yes" : "No", GW_REASON[kind]];
function gwChoices(kind) {
  const [v, r] = gwTuple(kind);
  const out = [];
  for (const k of ["ok", "other", "net", "bc"]) {
    if (GW_REASON[k] === r) out.push(["Yes", r], ["No", r]);
    else out.push([v, GW_REASON[k]]);
  }
  return out;
}

function xGateway(rng) {
  let n;
  do n = rng.int(20, 30); while (n % 8 === 0);
  const ip = pickIpForPrefix(n, rng);
  const { net, bc } = subnetOctets(ip, n);
  const size = pow2(32 - n);
  const kind = rng.pick(["ok", "other", "net", "bc"]);
  let gw;
  if (kind === "net") gw = net;
  else if (kind === "bc") gw = bc;
  else if (kind === "other") gw = rng.next() < 0.5 ? addToOctets(bc, 1 + rng.int(1, Math.min(size - 1, 30))) : addToOctets(net, -1 - rng.int(1, Math.min(size - 1, 30)));
  else {
    let off;
    do off = rng.int(1, size - 2); while (dotted(addToOctets(net, off)) === dotted(ip));
    gw = addToOctets(net, off);
  }
  const ans = gwTuple(kind);
  return {
    prompt: `A laptop is set up as \`${dotted(ip)}/${n}\` with default gateway \`${dotted(gw)}\`.`,
    answerType: "multi",
    parts: [
      { id: "gw", label: "Gateway OK?", ask: "Is that a valid gateway for this laptop, and why?", answerType: "choice", answer: ans, choiceCols: GW_COLS, choices: gwChoices(kind),
        hint: "Work out the laptop's network and broadcast addresses, then see where the gateway falls." },
      { id: "last", label: "Last host", ask: `A common choice of gateway is the subnet's last usable host. What is it? ${IP_NOTE}.`, answerType: "text", answer: dotted(addToOctets(bc, -1)),
        hint: "The last usable host is the broadcast address minus 1." },
    ],
    explanation: `${nbExplanation(ip, n)}\n\nThe gateway \`${dotted(gw)}\` ${kind === "ok" ? "lies strictly between them" : kind === "net" ? "is the network address" : kind === "bc" ? "is the broadcast address" : "is outside that range"}, so: **${ans[0] === "Yes" ? "yes, it is" : "no, it is not"} a valid gateway** (${ans[1].toLowerCase()}).\n\nLast usable host: **${dotted(addToOctets(bc, -1))}**.`,
    params: { kind: "x-gateway", ip, n, gw },
    hints: nbHints(ip, n, "broadcast").slice(0, 3),
  };
}

function xPrefixBack(rng) {
  for (;;) {
    const n = rng.int(18, 29);
    const ip = pickIpForPrefix(n, rng);
    const { net, bc } = subnetOctets(ip, n);
    // Only keep cases where exactly one prefix fits this host and broadcast.
    const fits = [];
    for (let q = 1; q <= 30; q++) {
      const s = subnetOctets(ip, q);
      if (dotted(s.bc) === dotted(bc) && dotted(ip) !== dotted(s.net) && dotted(ip) !== dotted(s.bc)) fits.push(q);
    }
    if (fits.length !== 1) continue;
    return {
      prompt: `A host has the address \`${dotted(ip)}\`, and the broadcast address of its subnet is \`${dotted(bc)}\`. The prefix is between /1 and /30.`,
      answerType: "multi",
      parts: [
        { id: "prefix", label: "Prefix", ask: "What is the prefix length (n in /n)?", answerType: "number", answer: n, tolerance: 0,
          hint: "The broadcast is the host address with every host bit set to 1. Compare the two in binary." },
        { id: "net", label: "Network", ask: `What is the network address? ${IP_NOTE}.`, answerType: "text", answer: dotted(net),
          hint: "Set every host bit of the address to 0 instead." },
      ],
      explanation: `The broadcast is the address with every host bit set to 1. Look at the ${ORD[Math.floor(n / 8)]} octet: address ${ip[Math.floor(n / 8)]} = \`${bin8(ip[Math.floor(n / 8)])}\`, broadcast ${bc[Math.floor(n / 8)]} = \`${bin8(bc[Math.floor(n / 8)])}\`${n < 24 ? " (later octets are 255 in the broadcast)" : ""}.

Only ${32 - n} host bits work: fewer would leave a 0 that the broadcast has as 1, and more would change a bit the address has as 0. So the prefix is **${n}** (/${n}), and clearing those ${32 - n} bits gives the network address **${dotted(net)}**.`,
      params: { kind: "x-prefixback", ip, bc },
      hints: [
        "The broadcast address = the network part of the address followed by all-1 host bits.",
        `Write the octets of \`${dotted(ip)}\` and \`${dotted(bc)}\` that differ in binary. The host bits are the run of 1s at the end of the broadcast.`,
        "Check which run length works: the address must keep its own bits in the network part, and it must not itself be the network or broadcast address.",
      ],
    };
  }
}

// ---- Data transfer / expert ----

const PLANS = [10, 20, 50, 100, 200, 300, 500, 1000];

function xRequired(rng) {
  for (;;) {
    const su = rng.pick(["GB", "GiB"]);
    const S = rng.int(2, 120);
    const mins = rng.int(5, 90);
    const eff = rng.pick([0.95, 0.9, 0.85, 0.8, 0.75]);
    const need = (S * SIZE_F[su] * 8) / (mins * 60 * eff) / 1e6;
    if (nearHalf(need)) continue;
    const pi = PLANS.findIndex((x) => x >= need);
    if (pi < 0 || PLANS[pi] - need < 0.01) continue;
    const lo = Math.max(0, Math.min(pi - 1, PLANS.length - 4));
    const opts = PLANS.slice(lo, lo + 4).map((x) => `${x} Mbps`);
    return {
      prompt: `A **${S} ${su}** backup must finish within **${mins} minutes**. Protocol overhead means only **${Math.round(eff * 100)}%** of the link speed carries file data. ${notes([su, "Mbps"])}`,
      answerType: "multi",
      parts: [
        { id: "need", label: "Link speed needed", ask: "What link speed, in Mbps, is just enough? Round to 2 decimal places.", answerType: "number", answer: round2(need), tolerance: 0.005,
          hint: `Bits ÷ seconds gives the data rate; divide by ${eff} because only that fraction of the link carries data. Calculator: \`_size * ${SIZE_C[su]} * 8 / (_mins * 60 * _eff) / 1e6\`.` },
        { id: "plan", label: "Plan to buy", ask: "Which is the slowest of these plans that is fast enough?", answerType: "choice", answer: `${PLANS[pi]} Mbps`, choices: opts,
          hint: "A plan is fast enough when its speed is at least the speed you found. Round up to a plan, never down." },
      ],
      explanation: `- Size: ${S} × ${commas(SIZE_F[su])} × 8 = ${commas(S * SIZE_F[su] * 8)} bits\n- Time: ${mins} × 60 = ${mins * 60} s\n- Data rate: ${commas(S * SIZE_F[su] * 8)} ÷ ${mins * 60} ≈ ${commas(Math.round(need * eff * 1e6))} bits/s\n- Link speed: ÷ ${eff} ≈ ${commas(Math.round(need * 1e6))} bits/s ≈ **${round2(need).toFixed(2)} Mbps**\n\nThe slowest plan at or above that is **${PLANS[pi]} Mbps**${pi > 0 ? ` (${PLANS[pi - 1]} Mbps is too slow)` : ""}.`,
      given: [{ label: "_size", value: S }, { label: "_mins", value: mins }, { label: "_eff", value: eff }],
      params: { kind: "x-required", S, su, mins, eff, opts },
      hints: [
        `Convert the size to bits (${su} uses ${SIZE_F[su] === 1e9 ? "1000s" : "1024s"}) and the time to seconds.`,
        `Bits per second needed for the file data = bits ÷ seconds. The link must be faster, because only ${Math.round(eff * 100)}% of it carries data.`,
        "Then pick the slowest plan that is not below your answer.",
      ],
    };
  }
}

const nearHalf = (x) => Math.abs(Math.abs(x * 100) % 1 - 0.5) < 1e-6;

function xStoreForward(rng) {
  for (;;) {
    const S = rng.int(20, 900);
    const hops = rng.int(2, 3);
    const rates = Array.from({ length: hops }, () => rng.pick([10, 20, 50, 100, 200, 500, 1000]));
    if (new Set(rates).size < 2) continue;
    const times = rates.map((r) => (S * 8) / r);
    const total = times.reduce((s, x) => s + x, 0);
    const slow = Math.max(...times);
    if (nearHalf(total) || nearHalf(slow)) continue;
    return {
      prompt: `A **${S} MB** file travels over ${hops} links in a row: ${rates.map((r, i) => `link ${i + 1} at **${r} Mbps**`).join(", ")}. Each router is **store-and-forward**: it must receive the whole file before it starts sending it on. Ignore delays other than transmission time. ${notes(["MB", "Mbps"])}`,
      answerType: "multi",
      parts: [
        { id: "slow", label: "Slowest link", ask: "How many seconds does the slowest link take? Round to 2 decimal places.", answerType: "number", answer: round2(slow), tolerance: 0.005,
          hint: `Time on a link = ${S} × 8 megabits ÷ its speed. The slowest link is the one with the lowest Mbps.` },
        { id: "total", label: "Total time", ask: "How many seconds until the file has fully arrived? Round to 2 decimal places.", answerType: "number", answer: round2(total), tolerance: 0.005,
          hint: "Store-and-forward means the links take turns, so add the times of all the links." },
      ],
      explanation: `${S} MB = ${S * 8} megabits.\n\n${rates.map((r, i) => `- Link ${i + 1}: ${S * 8} ÷ ${r} = ${num(times[i])} s`).join("\n")}\n\nSlowest: **${round2(slow).toFixed(2)} s**. Because each router waits for the whole file, the times add up: **${round2(total).toFixed(2)} s**.`,
      given: [{ label: "_size", value: S }, ...rates.map((r, i) => ({ label: `_r${i + 1}`, value: r }))],
      params: { kind: "x-storefwd", S, rates },
      hints: [
        `Convert the size to megabits once: ${S} × 8.`,
        "Work out the time on each link separately: megabits ÷ Mbps.",
        "With store-and-forward nothing overlaps, so the total is the sum.",
      ],
    };
  }
}

function xCourier(rng) {
  for (;;) {
    const TB = rng.int(2, 40);
    const R = rng.pick([50, 100, 200, 300, 500, 1000]);
    const eff = rng.pick([1, 0.9, 0.8]);
    const hours = rng.int(4, 48);
    const netH = (TB * 1e12 * 8) / (R * 1e6 * eff) / 3600;
    const courierRate = (TB * 1e12 * 8) / (hours * 3600) / 1e6;
    if (nearHalf(netH) || nearHalf(courierRate) || Math.abs(netH - hours) < 0.5) continue;
    const faster = netH < hours ? "The network" : "The courier";
    return {
      prompt: `You must move **${TB} TB** of data to another office. Option 1: send it over a **${R} Mbps** link${eff === 1 ? "" : `, where only **${Math.round(eff * 100)}%** of the speed carries file data`}. Option 2: copy it to a drive and send a courier, which takes **${hours} hours** door to door. Take 1 TB = 10¹² bytes, 1 Mbps = 1,000,000 bits per second and 1 byte = 8 bits; ignore copying time.`,
      answerType: "multi",
      parts: [
        { id: "net", label: "Network time", ask: "How many hours would the network take? Round to 2 decimal places.", answerType: "number", answer: round2(netH), tolerance: 0.005,
          hint: `Bits ÷ (bits per second actually carried) gives seconds; divide by 3600 for hours. Calculator: \`_tb * 1e12 * 8 / (_rate * 1e6${eff === 1 ? "" : " * _eff"}) / 3600\`.` },
        { id: "rate", label: "Courier's speed", ask: "What average speed in Mbps does the courier deliver? Round to 2 decimal places.", answerType: "number", answer: round2(courierRate), tolerance: 0.005,
          hint: "Treat the courier like a link: total bits ÷ total seconds, then ÷ 1,000,000." },
        { id: "faster", label: "Faster", ask: "Which option is faster?", answerType: "choice", answer: faster, choices: ["The network", "The courier"],
          hint: "Compare the network time with the courier's hours (or compare the two speeds)." },
      ],
      explanation: `${TB} TB = ${TB} × 10¹² × 8 = ${commas(TB * 8e12)} bits.\n\n- Network: ${commas(TB * 8e12)} ÷ ${commas(R * 1e6 * eff)} bits/s ≈ ${commas(Math.round(netH * 3600))} s ÷ 3600 ≈ **${round2(netH).toFixed(2)} hours**\n- Courier: ${commas(TB * 8e12)} bits ÷ ${hours * 3600} s ≈ ${commas(Math.round(courierRate * 1e6))} bits/s ≈ **${round2(courierRate).toFixed(2)} Mbps**\n\n${netH < hours ? `The network needs ${round2(netH).toFixed(2)} h, less than ${hours} h:` : `The network needs ${round2(netH).toFixed(2)} h, more than ${hours} h:`} **${faster}** is faster.`,
      given: [{ label: "_tb", value: TB }, { label: "_rate", value: R }, { label: "_hours", value: hours }, ...(eff === 1 ? [] : [{ label: "_eff", value: eff }])],
      params: { kind: "x-courier", TB, R, eff, hours },
      hints: [
        "Work in bits and seconds throughout, then convert at the end.",
        `The link carries ${R} × 1,000,000${eff === 1 ? "" : ` × ${eff}`} bits of file data per second.`,
        `The courier moves all the bits in ${hours} × 3600 seconds, so its speed is bits ÷ seconds.`,
      ],
    };
  }
}

function genExpert(subtopic, rng) {
  const t = rng.int(0, 2);
  if (subtopic === "ip-binary") return t === 0 ? xIpInt(rng) : t === 1 ? xHexIp(rng) : xSameSubnet(rng);
  if (subtopic === "masks-cidr") return t === 0 ? xVlsm(rng) : t === 1 ? xSummary(rng) : xMaskBack(rng);
  if (subtopic === "network-broadcast") return t === 0 ? xKth(rng) : t === 1 ? xGateway(rng) : xPrefixBack(rng);
  if (subtopic === "data-transfer") return t === 0 ? xRequired(rng) : t === 1 ? xStoreForward(rng) : xCourier(rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---- expert verification ----

const xa = (answer, id) => (answer && typeof answer === "object" ? answer[id] : undefined);
const xn = (answer, id) => {
  const v = xa(answer, id);
  return v === "" || v === null || v === undefined ? NaN : Number(v);
};
// A 2-decimal answer x for an exact value: within 0.005, and no neighbouring 2-dp value also is.
function r2(x, exact) {
  const ok = (y) => Number.isFinite(y) && Math.abs(y - exact) <= 0.005 * (1 + 1e-9);
  return ok(x) && !ok(Math.round((x - 0.01) * 100) / 100) && !ok(Math.round((x + 0.01) * 100) / 100);
}
// Smallest prefix scan: longest /p whose usable hosts (2^(32-p) - 2) reach h.
function vPrefixFor(h) {
  for (let p = 30; p >= 1; p--) if (big2(32 - p) - 2n >= BigInt(h)) return p;
  return null;
}

function verifyExpert(p, q, answer) {
  if (p.kind === "x-ipint") {
    const v = octInt(p.o);
    let hx = "";
    for (let s = 28; s >= 0; s -= 4) hx += "0123456789ABCDEF"[(v >>> s) & 15];
    return xn(answer, "int") === v && String(xa(answer, "hex") ?? "").trim().toUpperCase() === hx;
  }
  if (p.kind === "x-hexip") {
    if (!/^[0-9A-F]{8}$/.test(p.hx)) return false;
    let v = 0;
    for (const c of p.hx) v = v * 16 + "0123456789ABCDEF".indexOf(c);
    const cat = categoryOfInt(v >>> 0);
    const part = (q.parts || []).find((x) => x.id === "type");
    if (!part || !Array.isArray(part.choices) || new Set(part.choices).size !== 4) return false;
    return parseDotted(String(xa(answer, "ip") ?? "")) === v >>> 0 && Boolean(CAT_LABEL[cat]) && String(xa(answer, "type")) === CAT_LABEL[cat];
  }
  if (p.kind === "x-samesub") {
    const m = maskInt(p.n);
    const na = (octInt(p.a) & m) >>> 0;
    const nb = (octInt(p.b) & m) >>> 0;
    if (octInt(p.a) === na || octInt(p.a) === (na | ~m) >>> 0) return false;
    const k = Math.floor(p.n / 8);
    const want = (na >>> (8 * (3 - k))) & 255;
    return parseBinGroups(String(xa(answer, "bits") ?? ""), 1) === want && String(xa(answer, "same")) === (na === nb ? "Yes" : "No");
  }
  if (p.kind === "x-vlsm") {
    const pre = p.need.map(vPrefixFor);
    if (pre.some((x) => x === null)) return false;
    if (![0, 1, 2].every((i) => xn(answer, `p${i + 1}`) === pre[i])) return false;
    const order = [0, 1, 2].sort((x, y) => pre[x] - pre[y] || x - y);
    const size = (i) => Number(big2(32 - pre[i]));
    if (order.reduce((s, i) => s + size(i), 0) > 256) return false;
    const start = octInt(p.base) + size(order[0]) + size(order[1]);
    const net3 = parseDotted(String(xa(answer, "net3") ?? ""));
    return net3 === start && net3 % size(order[2]) === 0;
  }
  if (p.kind === "x-summary") {
    const ints = p.nets.map(octInt);
    const lo = Math.min(...ints), hi = Math.max(...ints) + 255;
    // Longest prefix whose block holds both the lowest and the highest address.
    let best = null;
    for (let n = 32; n >= 0 && best === null; n--) if (((lo & maskInt(n)) >>> 0) === ((hi & maskInt(n)) >>> 0)) best = n;
    return xn(answer, "prefix") === best && parseDotted(String(xa(answer, "net") ?? "")) === ((lo & maskInt(best)) >>> 0);
  }
  if (p.kind === "x-maskback") {
    const n = vPrefixFor(p.h);
    if (n === null || big2(32 - n) - 2n !== BigInt(p.h)) return false;
    const bc = parseDotted(dotted(p.bc));
    const size = Number(big2(32 - n));
    const net = bc - size + 1;
    if (net % size !== 0) return false;
    const mask = parseDotted(String(xa(answer, "mask") ?? ""));
    return mask !== null && prefixOfMask(mask) === n && parseDotted(String(xa(answer, "net") ?? "")) === net;
  }
  if (p.kind === "x-kth") {
    const size = Number(big2(32 - p.m));
    if (p.k < 0 || p.k >= Number(big2(p.m - p.p))) return false;
    const net = octInt(p.base) + p.k * size;
    return parseDotted(String(xa(answer, "net") ?? "")) === net && parseDotted(String(xa(answer, "bc") ?? "")) === net + size - 1
      && parseDotted(String(xa(answer, "first") ?? "")) === net + 1;
  }
  if (p.kind === "x-gateway") {
    const { v, net, bc } = subnetInts(p.ip, p.n);
    if (v === net || v === bc) return false;
    const g = octInt(p.gw);
    // Valid only strictly inside [network, broadcast]; the reason names where it falls.
    const valid = g > net && g < bc ? "Yes" : "No";
    const reason = g === net ? "network address" : g === bc ? "broadcast address" : valid === "Yes" ? "usable host" : "different subnet";
    const isRight = (t) => t.length === 2 && t[0] === valid && t[1].toLowerCase().includes(reason);
    const part = (q.parts || []).find((x) => x.id === "gw");
    if (!part || !segOk(part, xa(answer, "gw"), isRight, 5, false)) return false;
    return parseDotted(String(xa(answer, "last") ?? "")) === bc - 1;
  }
  if (p.kind === "x-prefixback") {
    const v = octInt(p.ip), b = octInt(p.bc);
    const fits = [];
    for (let n = 1; n <= 30; n++) {
      const m = maskInt(n);
      const net = (v & m) >>> 0, bc = (net | ~m) >>> 0;
      if (bc === b && v !== net && v !== bc) fits.push(n);
    }
    if (fits.length !== 1) return false;
    return xn(answer, "prefix") === fits[0] && parseDotted(String(xa(answer, "net") ?? "")) === ((v & maskInt(fits[0])) >>> 0);
  }
  if (p.kind === "x-required") {
    const bits = p.S * unitFactor(p.su) * 8;
    if (!Number.isFinite(bits)) return false;
    // need · 10^6 · seconds · eff = bits
    const need = bits / (p.mins * 60 * p.eff) / unitFactor("Mbps");
    if (!r2(xn(answer, "need"), need)) return false;
    const speeds = p.opts.map((s) => Number(s.replace(" Mbps", "")));
    const enough = speeds.filter((s) => s * unitFactor("Mbps") * p.eff * p.mins * 60 >= bits);
    if (!enough.length || new Set(p.opts).size !== 4) return false;
    return String(xa(answer, "plan")) === `${Math.min(...enough)} Mbps`;
  }
  if (p.kind === "x-storefwd") {
    const bits = p.S * unitFactor("MB") * 8;
    const t = p.rates.map((r) => bits / (r * unitFactor("Mbps")));
    return r2(xn(answer, "slow"), Math.max(...t)) && r2(xn(answer, "total"), t.reduce((s, x) => s + x, 0));
  }
  if (p.kind === "x-courier") {
    const bits = p.TB * 1e12 * 8;
    const netH = bits / (p.R * unitFactor("Mbps") * p.eff) / 3600;
    const rate = bits / (p.hours * 3600) / unitFactor("Mbps");
    return r2(xn(answer, "net"), netH) && r2(xn(answer, "rate"), rate)
      && String(xa(answer, "faster")) === (p.R * unitFactor("Mbps") * p.eff > rate * unitFactor("Mbps") ? "The network" : "The courier");
  }
  return false;
}
