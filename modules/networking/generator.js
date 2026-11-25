// Networking (IPv4) generator. Uses only the seeded rng passed in by the engine.
// Generation works per octet (decimal arithmetic on four numbers); verify() re-derives every
// answer independently with 32-bit integer / bitwise maths, bit-by-bit parsing, enumeration or
// substitution. Dotted answers are text in canonical form (no leading zeros, no spaces).

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

const bin8 = (d) => d.toString(2).padStart(8, "0");
const dotted = (o) => o.join(".");
const binDotted = (o) => o.map(bin8).join(".");
const ORD = ["1st", "2nd", "3rd", "4th"];
const pow2 = (k) => Math.pow(2, k);

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
// Octet arithmetic used by generation

// Mask octets for /n: each octet holds `bits` ones, worth 256 - 2^(8 - bits).
function maskOctets(n) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const bits = Math.max(0, Math.min(8, n - 8 * i));
    out.push(256 - pow2(8 - bits));
  }
  return out;
}

// Network / broadcast octets of ip/n using the block size in the "interesting" octet.
function subnetOctets(ip, n) {
  const k = Math.floor(n / 8); // index of the first octet that has host bits (n <= 30, so k <= 3)
  const block = pow2(8 - (n % 8));
  const net = [], bc = [];
  for (let i = 0; i < 4; i++) {
    if (i < k) { net.push(ip[i]); bc.push(ip[i]); }
    else if (i === k) { const s = Math.floor(ip[i] / block) * block; net.push(s); bc.push(s + block - 1); }
    else { net.push(0); bc.push(255); }
  }
  return { net, bc, k, block };
}

// Add a (possibly negative) offset to an address held as octets, with carry.
function addOct(o, delta) {
  const out = o.slice();
  let carry = delta;
  for (let i = 3; i >= 0 && carry !== 0; i--) {
    const v = out[i] + carry;
    out[i] = ((v % 256) + 256) % 256;
    carry = Math.floor(v / 256);
  }
  return out;
}

const usable = (n) => pow2(32 - n) - 2;

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
    const ans = usable(n);
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
    const lo = usable(n + 1) + 1, hi = usable(n);
    const H = rng.next() < 0.25 ? hi : rng.int(lo, hi);
    return {
      prompt: `A subnet must hold at least **${commas(H)}** hosts. What is the **longest** prefix (the smallest subnet) that is big enough? Give *n* for /n.`,
      answer: n,
      answerType: "number",
      tolerance: 0,
      explanation: `Find the fewest host bits *h* with 2^h − 2 ≥ ${commas(H)}.\n\n- 2^${32 - n - 1} − 2 = ${commas(usable(n + 1))}, too small\n- 2^${32 - n} − 2 = ${commas(hi)}, big enough\n\nSo h = ${32 - n} and the prefix is 32 − ${32 - n} = **${n}**.`,
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
  const hosts = usable(np);
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
  const first = addOct(net, 1), last = addOct(bc, -1);
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
  const vals = { network: dotted(net), broadcast: dotted(bc), first: dotted(addOct(net, 1)), last: dotted(addOct(bc, -1)) };
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
      parts.push({ id: "hosts", label: "Usable hosts", ask: "How many usable host addresses does the subnet have?", answerType: "number", answer: usable(n), tolerance: 0,
        hint: `Host bits = 32 − ${n}. Usable hosts = two to the power of the host bits, minus the network and broadcast addresses.` });
    } else {
      parts.push({ id: "last", label: "Last host", ask: "Last usable host address (dotted decimal)", answerType: "text", answer: vals.last,
        hint: "The last usable host is the broadcast address minus 1." });
    }
    return {
      prompt: `A host has the address \`${dotted(ip)}/${n}\`. ${IP_NOTE}.`,
      answerType: "multi",
      parts,
      explanation: `${nbExplanation(ip, n)}${withRange ? `\n\nUsable hosts: 2^${32 - n} − 2 = **${commas(usable(n))}**.` : ""}`,
      params: { kind: "multi", ip, n },
    };
  }

  if (kindRoll === "hostin") {
    const size = pow2(32 - n);
    const ipOff = (ip[3] - net[3]) + 256 * ((ip[2] - net[2]) + 256 * ((ip[1] - net[1]) + 256 * (ip[0] - net[0])));
    let off;
    do { off = rng.int(1, size - 2); } while (off === ipOff);
    const right = dotted(addOct(net, off));
    const nextHost = dotted(addOct(bc, 1 + rng.int(1, Math.max(1, Math.min(size - 2, 40)))));
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
  const su = rng.pick(["MiB", "GiB", "GiB"]);
  const S = su === "GiB" ? rng.int(1, 64) : rng.int(50, 4000);
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
    if (["oct2bin", "bin2oct", "class", "classbin", "ip2bin", "bin2ip", "classify"].includes(p.kind) || (p.kind === "multi" && p.idx !== undefined)) return verifyIpBinary(question, answer);
    if (["cidr2mask", "wildcard", "mask2cidr", "hosts", "count", "fit", "borrow"].includes(p.kind)) return verifyMasks(question, answer);
    if (["network", "broadcast", "first", "last", "hostin"].includes(p.kind) || (p.kind === "multi" && p.ip)) return verifyNetBroadcast(question, answer);
    if (["time", "rate", "size", "conv"].includes(p.kind)) return verifyTransfer(question, answer);
  } catch {
    return false;
  }
  return false;
}
