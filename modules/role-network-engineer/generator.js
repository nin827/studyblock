// Network Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   subnet-plan      hosts per subnet -> network / broadcast address -> same subnet?; sizing from devices  (Admin)
//   transfer-window  file size -> megabits (+ overhead) -> time -> fits the window?; link choice          (Admin)
//   cipher-decode    Caesar shift from a known letter; affine cipher by hand; known-pair key recovery     (Security)
//   log-flags        failed-login counts -> rate -> lockout rule; flag byte -> risk score -> lockout       (Security)
// Conventions (as Networking): usable hosts = 2^(32-p) - 2, network and broadcast addresses reserved,
// /31 and /32 never used, 1 MB = 8 megabits, 1 GB = 1000 MB.

// ---------- helpers ----------

function roundTo(n, d) {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-network-engineer: no suitable draw"); };

function numPart(id, label, ask, val, dp, hint) {
  return { id, label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
// An exact whole-number answer (counts, shifts, prefix lengths): no rounding, no close credit.
const intPart = (id, label, ask, val, hint) => ({ id, label, ask, answerType: "number", answer: val, tolerance: 0, fuzzyNumber: 0, hint });
const textPart = (id, label, ask, val, hint, accepts) => ({ id, label, ask, answerType: "text", answer: val, ...(accepts && accepts.length ? { accepts } : {}), fuzzy: false, hint });
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
const pickKeys = (keys, dps) => Object.fromEntries(keys.map((k) => [k, dps[k]]));
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const exWith = (lines, n) => lines.slice(0, n).join("\n\n");
const mdTable = (head, rows) => `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;

// ---------- subnet-plan ----------

const ip4 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
const maskOf = (p) => (0xffffffff << (32 - p)) >>> 0;
function randIp(rng) {
  const a = rng.pick([10, 172, 192]);
  const b = a === 10 ? rng.int(0, 255) : a === 172 ? rng.int(16, 31) : 168;
  return ((a << 24) | (b << 16) | (rng.int(0, 255) << 8) | rng.int(1, 254)) >>> 0;
}

// S1: interface address and prefix -> usable hosts, network, broadcast, same subnet?
function genSubnet(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const p = rng.int(20, 29);
    const ip = randIp(rng);
    const mask = maskOf(p);
    const net = (ip & mask) >>> 0;
    const size = 2 ** (32 - p);
    const bc = (net + size - 1) >>> 0;
    if (ip === net || ip === bc) continue;
    const same = rng.next() < 0.5;
    let ip2;
    if (same) {
      ip2 = (net + rng.int(1, size - 2)) >>> 0;
    } else {
      const off = rng.int(1, size - 2);
      ip2 = rng.next() < 0.5 && net - size > 0 ? (net - size + off) >>> 0 : (net + size + off) >>> 0;
    }
    if (ip2 === ip || (ip2 & 0xff) === 0 || (ip2 & 0xff) === 255) continue;
    const n = TIER_PARTS[tier];
    const hosts = size - 2;
    const sameNow = ((ip2 & mask) >>> 0) === net;
    const all = [
      intPart("hosts", "Usable hosts", "How many usable host addresses does each subnet of this size hold?", hosts, `Host bits = 32 − ${p}. The subnet holds 2 to that power addresses, and two of them (network and broadcast) are reserved.`),
      textPart("net", "Network address", "Network address of the subnet (dotted decimal)", ip4(net), "Keep the network bits and set every host bit to 0. Find the octet where the mask stops, and round that octet down to a multiple of the block size."),
      ...(tier === "hard" ? [yesNo("same", "Same subnet?", `Is ${ip4(ip2)} on the same subnet?`, sameNow, "Find that address's network address the same way and compare it with the first one.")] : []),
      ...(tier === "expert" ? [
        textPart("mask", "Mask", "Subnet mask (dotted decimal)", ip4(mask), `A /${p} mask has ${p} ones, filled eight at a time from the left. A partial octet takes the value of its ones: 128, 192, 224, 240, 248, 252.`),
        textPart("bc", "Broadcast", "Broadcast address of the subnet (dotted decimal)", ip4(bc), "The broadcast address is the network address with every host bit set to 1: the last address in the block."),
        yesNo("same", "Same subnet?", `Is ${ip4(ip2)} on the same subnet?`, sameNow, "The subnet runs from the network address to the broadcast address. Is the second address inside that range?"),
      ] : []),
    ];
    const order = tier === "expert" ? ["mask", "hosts", "bc", "same"] : tier === "hard" ? ["hosts", "net", "same"] : ["hosts", "net"];
    const parts = order.map((id) => all.find((x) => x.id === id));
    const lines = {
      mask: `**Mask:** /${p} gives **${ip4(mask)}**.`,
      hosts: `**Hosts:** 2^${32 - p} − 2 = ${size} − 2 = **${hosts}**.`,
      net: `**Network:** with a block of ${size}, the network address is **${ip4(net)}**.`,
      bc: `**Broadcast:** ${ip4(net)} + ${size - 1} = **${ip4(bc)}**.`,
      same: `**Same subnet:** ${ip4(ip2)} ${sameNow ? "lies" : "does not lie"} between ${ip4(net)} and ${ip4(bc)}, so **${sameNow ? "Yes" : "No"}**.`,
    };
    const ex = exWith(order.map((id) => lines[id]), n);
    const lastOct = ip & 255;
    return finish(
      `A router interface is configured as **${ip4(ip)}/${p}**. Hosts need one address each, and the network and broadcast addresses are reserved.${n >= 3 ? ` A second device has the address **${ip4(ip2)}**.` : ""}`,
      parts, ex, "ne-subnet", { ip, ip2, p, n, tier }, [["_prefix", p], ["_lastoctet", lastOct]],
      ["Work from the prefix length: host bits first, then the block size, then the addresses.", "The network address is the first address of the block, and the broadcast address is the last."],
    );
  }
  return tooMany();
}

// S2 (expert+): size a subnet from a device count, then check a parent block can be split.
function genSubnetBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const D = rng.int(10, 1500);
    const g = rng.pick([10, 20, 25, 30, 50]);
    const need = Math.floor((D * (100 + g) + 99) / 100);
    let p = 30;
    while (p > 8 && 2 ** (32 - p) - 2 < need) p--;
    if (p < 20 || p > 28) continue;
    const q = p - rng.int(2, 4);
    if (q < 16) continue;
    const subnets = 2 ** (p - q);
    const O = rng.int(2, subnets * 2);
    if (O === subnets) continue;
    const ok = O <= subnets;
    const parts = [
      intPart("need", "Addresses needed", "Host addresses needed including growth (round up to a whole number)", need, "Growth adds a percentage on top of the device count. Multiply by (100 + growth) ÷ 100 and round up."),
      intPart("prefix", "Prefix length", "Longest prefix length (the number after the slash) whose subnet still holds them", p, "Try host bits h = 2, 3, 4, … until 2^h − 2 is at least the number needed. The prefix is 32 − h."),
      intPart("subnets", "Subnets in block", `How many subnets of that size fit in the /${q} block?`, subnets, `Each subnet uses ${32 - p} host bits and the block has ${32 - q}. The difference in bits gives a power of 2.`),
      yesNo("enough", "Enough subnets?", `The company needs one such subnet for each of its ${O} offices. Does the /${q} block cover them all?`, ok, "Compare the number of subnets in the block with the number of offices."),
    ];
    const ex = [
      `**Needed:** ${D} × ${100 + g} ÷ 100 = ${fixed((D * (100 + g)) / 100, 2)}, rounded up to **${need}**.`,
      `**Prefix:** 2^${32 - p} − 2 = ${2 ** (32 - p) - 2} ≥ ${need} but 2^${31 - p} − 2 = ${2 ** (31 - p) - 2} is too small, so **/${p}**.`,
      `**Subnets:** 2^(${p} − ${q}) = **${subnets}**.`,
      `**Offices:** ${O} ${ok ? "≤" : ">"} ${subnets}, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A site has **${D}** devices and expects **${g}%** growth. Each device needs one address, and each subnet loses its network and broadcast addresses. The site is allocated a **/${q}** block to split into equal subnets of the smallest size that fits, one for each of **${O}** offices.`,
      parts, ex, "ne-subnetback", { D, g, q, O }, [["_devices", D], ["_growth", g], ["_offices", O]],
      ["Work backwards: devices with growth, then host bits, then prefix length, then the block.", "Each extra bit in the prefix halves the subnet and doubles the number of subnets."],
    );
  }
  return tooMany();
}

// ---------- transfer-window ----------

const RATES = [10, 20, 25, 40, 50, 100, 200, 250, 500, 1000];
const LINKS = [10, 25, 50, 100, 250, 500, 1000, 2500];

function genTransfer(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const n = TIER_PARTS[tier];
    const R = rng.pick(RATES);
    if (tier === "medium") {
      const S = rng.int(5, 400);
      const st = (rd) => ({ bits: S * 8, t: rd("t", (S * 8) / R) });
      if (!stableOk(st, { t: 1 }) || (S * 8) / R < 1) continue;
      const r = st((k, v) => v);
      const parts = [
        intPart("bits", "Size in megabits", "File size in megabits (1 MB = 8 megabits)", r.bits, "A megabyte is 8 megabits, so multiply the size in MB by 8."),
        numPart("t", "Transfer time", "Transfer time in seconds", r.t, 1, "Time = megabits ÷ link speed in megabits per second."),
      ];
      const ex = exWith([`**Megabits:** ${S} × 8 = **${r.bits}**.`, `**Time:** ${r.bits} ÷ ${R} = **${fixed(r.t, 1)} s**.`], n);
      return finish(`A **${S} MB** file is sent over a **${R} Mbps** link. Ignore any overhead.`, parts, ex, "ne-xfer", { tier, S, R, n }, [["_size", S], ["_rate", R]],
        ["Convert the size to megabits first, so the units match the link speed.", "Divide by the speed to get seconds."]);
    }
    const S = rng.int(4, 120) / 4; // GB
    const x = rng.pick([5, 8, 10, 12, 15, 20]);
    const st = (rd) => {
      const mb = rd("mb", S * 1000 * (1 + x / 100));
      const bits = rd("bits", mb * 8);
      const tm = rd("tm", bits / R / 60);
      return { mb, bits, tm };
    };
    const dps = { mb: 1, bits: 0, tm: 1 };
    const keys = tier === "hard" ? ["bits", "tm"] : ["mb", "bits", "tm"];
    if (!stableOk(st, pickKeys(keys, dps))) continue;
    const r = st((k, v) => v);
    if (tier === "hard" || tier === "expert") {
      const fac = rng.pick([0.7, 0.8, 1.25, 1.4]);
      const Wmin = tier === "expert" ? Math.max(1, Math.round((r.tm * fac) / 60)) * 60 : Math.max(1, Math.round(r.tm * fac));
      if (Math.abs(r.tm - Wmin) / Wmin < 0.05) continue;
      const ok = r.tm <= Wmin;
      const wText = tier === "expert" ? `${Wmin / 60} hour${Wmin === 60 ? "" : "s"}` : `${Wmin} minutes`;
      const verdict = yesNo("fits", "Fits the window?", `The transfer must finish inside a window of ${wText}. Does it?`, ok, tier === "expert" ? "Convert the window to minutes (or your time to hours) so both use the same unit, then compare." : "Compare your time with the window; both are in minutes.");
      const bitsPart = numPart("bits", "Total megabits", "Total to send in megabits, overhead included", r.bits, 0, tier === "hard" ? "Overhead adds a percentage to the file: size in MB × (100 + overhead) ÷ 100, then × 8 for megabits." : "Take your size in MB and multiply by 8.");
      const tmPart = numPart("tm", "Transfer time", "Transfer time in minutes", r.tm, 1, "Seconds = megabits ÷ speed. Divide by 60 for minutes.");
      const mbPart = numPart("mb", "Size with overhead", "Size to send in MB, overhead included", r.mb, 1, "1 GB = 1000 MB. Overhead adds a percentage on top of the file size.");
      const parts = tier === "hard" ? [bitsPart, tmPart, verdict] : [mbPart, bitsPart, tmPart, verdict];
      const lines = tier === "hard"
        ? [`**Megabits:** ${S} × 1000 × ${1 + x / 100} × 8 = **${fixed(r.bits, 0)}**.`, `**Time:** ${fixed(r.bits, 0)} ÷ ${R} ÷ 60 = **${fixed(r.tm, 1)} min**.`, `**Window:** ${fixed(r.tm, 1)} min is ${ok ? "within" : "over"} ${Wmin} min, so **${ok ? "Yes" : "No"}**.`]
        : [`**Size:** ${S} × 1000 × ${1 + x / 100} = **${fixed(r.mb, 1)} MB**.`, `**Megabits:** ${fixed(r.mb, 1)} × 8 = **${fixed(r.bits, 0)}**.`, `**Time:** ${fixed(r.bits, 0)} ÷ ${R} ÷ 60 = **${fixed(r.tm, 1)} min**.`, `**Window:** ${wText} is ${Wmin} min; ${fixed(r.tm, 1)} is ${ok ? "within" : "over"} it, so **${ok ? "Yes" : "No"}**.`];
      return finish(
        `A backup of **${S} GB** (1 GB = 1000 MB, 1 MB = 8 megabits) is sent over a **${R} Mbps** link. Protocol overhead adds **${x}%** to the data sent.`,
        parts, exWith(lines, n), "ne-xfer2", { tier, S, x, R, Wmin, n }, [["_size", S], ["_overhead", x], ["_rate", R]],
        ["Add the overhead to the size first, then convert units, then divide by the speed.", "Keep units consistent: MB and megabits differ by a factor of 8; seconds and minutes by 60."],
      );
    }
    return tooMany();
  }
  return tooMany();
}

// T2 (expert+): window and link -> payload that fits -> files -> link needed -> upgrade?
function genTransferBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const R = rng.pick([50, 100, 200, 250, 500]);
    const W = rng.pick([30, 40, 60, 90, 120, 180]);
    const x = rng.pick([10, 20, 25, 50]);
    const F = rng.pick([200, 250, 400, 500, 750, 800]);
    const st = (rd) => ({ pay: rd("pay", (R * W * 60) / 8 / (1 + x / 100)) });
    if (!stableOk(st, { pay: 1 })) continue;
    const r = st((k, v) => v);
    const fr = r.pay / F;
    if (fr < 1.5 || fr > 40 || fr - Math.floor(fr) < 0.06 || fr - Math.floor(fr) > 0.94) continue;
    const files = Math.floor(fr);
    if (Math.floor(roundTo(r.pay, 1) / F) !== files) continue;
    const N = files + rng.int(1, 6) * rng.pick([1, 2, -1, -1]); // fewer files than fit half the time, so "No upgrade" occurs
    if (N < 1) continue;
    const needRate = (N * F * 8 * (1 + x / 100)) / (W * 60);
    const link = LINKS.find((l) => l >= needRate);
    if (!link || LINKS.some((l) => Math.abs(l / needRate - 1) < 0.04)) continue;
    const upgrade = N > files;
    const parts = [
      numPart("pay", "Payload that fits", "Most file data (MB, excluding overhead) the link can deliver in the window", r.pay, 1, "Raw capacity = speed × seconds ÷ 8 gives MB. Overhead uses up part of it, so divide by (100 + overhead) ÷ 100."),
      intPart("files", "Whole files", `How many whole ${F} MB files fit in the window?`, files, "Divide the payload by the file size and round down: a part-sent file does not count."),
      { id: "link", label: "Link needed", ask: `Smallest standard link (Mbps) that moves all ${N} files in the window`, answerType: "choice", answer: `${link} Mbps`, choices: LINKS.map((l) => `${l} Mbps`), hint: "Work backwards: total data with overhead × 8, divided by the window in seconds, gives the speed needed. Then take the next standard link up." },
      yesNo("upgrade", "Upgrade needed?", `The site has the ${R} Mbps link now. Does it need an upgrade to move all ${N} files?`, upgrade, "Compare the number of files you need to send with the number that fit on the current link."),
    ];
    const ex = [
      `**Payload:** ${R} × ${W} × 60 ÷ 8 = ${fixed((R * W * 60) / 8, 1)} MB raw, ÷ ${1 + x / 100} = **${fixed(r.pay, 1)} MB**.`,
      `**Files:** ${fixed(r.pay, 1)} ÷ ${F} = ${fixed(fr, 2)}, rounded down to **${files}**.`,
      `**Link:** ${N} × ${F} × 8 × ${1 + x / 100} ÷ ${W * 60} = ${fixed(needRate, 1)} Mbps, so the next standard link is **${link} Mbps**.`,
      `**Upgrade:** ${N} ${upgrade ? ">" : "≤"} ${files}, so **${upgrade ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A nightly job runs in a window of **${W} minutes** over a **${R} Mbps** link, with **${x}%** protocol overhead on the data sent (1 MB = 8 megabits). Each file is **${F} MB**, and the job must send **${N}** files. Standard links: ${LINKS.join(", ")} Mbps.`,
      parts, ex, "ne-xferback", { R, W, x, F, N }, [["_rate", R], ["_window", W], ["_overhead", x], ["_filesize", F], ["_files", N]],
      ["Work out what fits first, then turn the question around to find the speed needed.", "Overhead means each payload byte costs more than one byte on the wire."],
    );
  }
  return tooMany();
}

// ---------- cipher-decode ----------

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WORDS = ["ROUTE", "PORTS", "PROXY", "TOKEN", "LOGIN", "ADMIN", "CLOUD", "CABLE", "ALERT", "AUDIT", "PATCH", "QUEUE", "SHELL", "VAULT", "BADGE", "GUARD", "TRUST", "LINKS", "ROUTER", "SWITCH", "PACKET", "SERVER", "SOCKET", "BRIDGE", "SECURE", "SIGNAL", "BLOCKS", "DOMAIN", "ACCESS", "CIPHER", "FILTER", "GATEWAY", "NETWORK", "TRAFFIC", "BACKUP", "SCRIPT", "MALWARE", "SESSION", "PRIVATE", "VIRTUAL"];
const shiftWord = (w, k) => [...w].map((c) => ALPHA[(ALPHA.indexOf(c) + k) % 26]).join("");
const VALID_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
const affine = (w, a, b) => [...w].map((c) => ALPHA[(a * ALPHA.indexOf(c) + b) % 26]).join("");
const invMod = (a) => { for (let t = 1; t < 26; t++) if ((a * t) % 26 === 1) return t; return 0; };
const idx = (c) => ALPHA.indexOf(c);

function genCaesar(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const n = TIER_PARTS[tier];
    if (tier === "medium" || tier === "hard") {
      const w1 = rng.pick(WORDS);
      let w2 = rng.pick(WORDS);
      if (w2 === w1) continue;
      const k = rng.int(1, 25);
      const c1 = shiftWord(w1, k), c2 = shiftWord(w2, k);
      const parts = [
        intPart("key", "Key", `By how many places (1 to 25) was every letter shifted forward? A is the start of the alphabet, and it wraps after Z.`, k, `Number the letters A = 0 … Z = 25. The shift is (cipher letter − plain letter), and you add 26 if it comes out negative.`),
        textPart("word", "Decoded word", `Decode **${c1}**`, w1, "Move every letter back by the key, wrapping from A round to Z."),
        ...(tier === "hard" ? [textPart("word2", "Second message", `Decode the second message **${c2}**, sent with the same key`, w2, "The same key decodes it: shift each letter back by the same number.")] : []),
      ];
      const ex = exWith([
        `**Key:** ${c1[0]} is letter ${idx(c1[0])} and ${w1[0]} is ${idx(w1[0])}; (${idx(c1[0])} − ${idx(w1[0])}) mod 26 = **${k}**.`,
        `**Decode:** shifting each letter of ${c1} back by ${k} gives **${w1}**.`,
        `**Second message:** shifting ${c2} back by ${k} gives **${w2}**.`,
      ], n);
      return finish(
        `A Caesar cipher shifts every letter forward by the same key. An intercepted message reads **${c1}**, and the analyst knows its first plaintext letter is **${w1[0]}**.${tier === "hard" ? ` A second message with the same key reads **${c2}**.` : ""}`,
        parts, ex, "ne-caesar", { w1, w2, k, n, tier }, [["_firstcipher", idx(c1[0])], ["_firstplain", idx(w1[0])]],
        ["Convert the known pair of letters to numbers; their difference is the key.", "To decode, go back by the key; to encode, go forward."],
      );
    }
    // expert: affine cipher by hand
    const a = rng.pick(VALID_A.filter((v) => v !== 1));
    const b = rng.int(1, 25);
    const x = rng.int(0, 25);
    const w1 = rng.pick(WORDS.filter((w) => w.length <= 6));
    const w2 = rng.pick(WORDS.filter((w) => w.length <= 6 && w !== w1));
    const c2 = affine(w2, a, b);
    const parts = [
      intPart("y", "One letter", `The letter **${ALPHA[x]}** (number ${x}) encrypts to which number (0 to 25)?`, (a * x + b) % 26, "Apply E(x) = (a·x + b) mod 26 to the letter's number."),
      textPart("enc", "Encrypt a word", `Encrypt **${w1}**`, affine(w1, a, b), "Number each letter, apply E(x) = (a·x + b) mod 26, and turn each result back into a letter."),
      intPart("inv", "Inverse of a", `The number t from 1 to 25 with a·t ≡ 1 (mod 26)`, invMod(a), `Try t = 1, 2, 3, … until ${a} × t leaves remainder 1 when divided by 26. Decoding needs this inverse.`),
      textPart("dec", "Decrypt a word", `Decrypt **${c2}**`, w2, "Use D(y) = t·(y − b) mod 26, where t is the inverse of a. Add 26 to (y − b) first if it is negative."),
    ];
    const ex = [
      `**One letter:** (${a} × ${x} + ${b}) mod 26 = ${a * x + b} mod 26 = **${(a * x + b) % 26}**.`,
      `**Encrypt:** ${[...w1].map((c) => `${c}→${ALPHA[(a * idx(c) + b) % 26]}`).join(", ")} gives **${affine(w1, a, b)}**.`,
      `**Inverse:** ${a} × ${invMod(a)} = ${a * invMod(a)} = 26 × ${(a * invMod(a) - 1) / 26} + 1, so **${invMod(a)}**.`,
      `**Decrypt:** D(y) = ${invMod(a)}·(y − ${b}) mod 26 turns ${c2} into **${w2}**.`,
    ].join("\n\n");
    return finish(
      `A secure channel uses an affine cipher: each letter, numbered A = 0 to Z = 25, becomes **E(x) = (${a}·x + ${b}) mod 26**. The key a = ${a} is valid because it shares no factor with 26.`,
      parts, ex, "ne-affine", { a, b, x, w1, w2 }, [["_a", a], ["_b", b], ["_x", x]],
      ["Work in numbers 0 to 25 and reduce mod 26 after every step.", "Encrypting goes forward with (a·x + b); decrypting needs the inverse of a."],
    );
  }
  return tooMany();
}

function genAffineBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const a = rng.pick(VALID_A);
    const b = rng.int(0, 25);
    const x1 = rng.int(0, 25);
    const x2 = rng.int(0, 25);
    const dx = Math.abs(x1 - x2);
    if (dx % 2 === 0 || dx === 13) continue;
    const y1 = (a * x1 + b) % 26, y2 = (a * x2 + b) % 26;
    const w = rng.pick(WORDS.filter((v) => v.length <= 6));
    const cw = affine(w, a, b);
    const Rk = rng.pick([50, 80, 100, 120, 200, 250, 400]);
    const T = rng.pick([1, 2, 3, 5]);
    const time = (12 * 26) / Rk;
    if (Math.abs(time - T) < 0.3) continue;
    const strong = time >= T;
    const parts = [
      intPart("a", "Key a", "The multiplier a (one of the 12 valid values)", a, "Subtract the two equations: a·(x1 − x2) ≡ (y1 − y2) mod 26. Divide by the difference using its inverse mod 26."),
      intPart("b", "Key b", "The shift b (0 to 25)", b, "Once you know a, substitute one pair into y = (a·x + b) mod 26 and solve for b."),
      textPart("word", "Decoded word", `Decrypt **${cw}**`, w, "Use D(y) = t·(y − b) mod 26 where t is the inverse of a mod 26."),
      yesNo("strong", "Strong enough?", `There are 12 valid values of a and 26 of b. An attacker tries ${Rk} keys per second. The policy needs the worst case to take at least ${T} s. Does the cipher meet it?`, strong, "Count all the keys (12 × 26), divide by the keys per second for the worst-case time, and compare it with the policy."),
    ];
    const sol = [];
    for (const aa of VALID_A) for (let bb = 0; bb < 26; bb++) if ((aa * x1 + bb) % 26 === y1 && (aa * x2 + bb) % 26 === y2) sol.push([aa, bb]);
    if (sol.length !== 1) continue;
    const ex = [
      `**a:** (${y1} − ${y2}) ≡ a·(${x1} − ${x2}) mod 26, and the only valid a that works is **${a}**.`,
      `**b:** ${y1} ≡ ${a} × ${x1} + b mod 26 gives **b = ${b}**.`,
      `**Decrypt:** with t = ${invMod(a)}, D(y) = ${invMod(a)}·(y − ${b}) mod 26 turns ${cw} into **${w}**.`,
      `**Strength:** 12 × 26 = 312 keys ÷ ${Rk} per second = ${fixed(time, 2)} s, which is ${strong ? "at least" : "below"} ${T} s, so **${strong ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `Messages use the affine cipher E(x) = (a·x + b) mod 26 with A = 0 … Z = 25, and a is one of the 12 values coprime to 26. A known-plaintext pair shows **${ALPHA[x1]} → ${ALPHA[y1]}** and a second shows **${ALPHA[x2]} → ${ALPHA[y2]}**. The next message reads **${cw}**.`,
      parts, ex, "ne-affineback", { x1, y1, x2, y2, cw, Rk, T }, [["_x1", x1], ["_y1", y1], ["_x2", x2], ["_y2", y2]],
      ["Turn the letter pairs into numbers, then subtract the two equations to remove b.", "A valid a has an inverse mod 26, so you can divide by x1 − x2."],
    );
  }
  return tooMany();
}

// ---------- log-flags ----------

const FLAG_NAMES = ["failed password", "new device", "foreign country", "outside office hours", "admin account"];
const FLAG_WEIGHTS = [1, 2, 2, 1, 3];
const binOf = (n) => n.toString(2).padStart(8, "0");

function genLog(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const n = TIER_PARTS[tier];
    const T = rng.pick([3, 4, 5, 6, 8, 10]);
    if (tier === "medium") {
      const W = rng.pick([4, 5, 6, 8, 10, 12, 15]);
      const F = rng.int(6, Math.max(12, 2 * T * W)); // rates spread either side of the limit
      const st = (rd) => ({ rate: rd("rate", F / W) });
      if (!stableOk(st, { rate: 1 })) continue;
      const r = st((k, v) => v);
      if (Math.abs(F / W - T) < 0.4) continue;
      const lock = F / W > T;
      const parts = [
        numPart("rate", "Failures per minute", "Failed logins per minute", r.rate, 1, "Rate = number of failures ÷ minutes."),
        yesNo("lock", "Lock the account?", `The rule locks an account when the rate is more than ${T} failures per minute. Is it locked?`, lock, "Compare your rate with the limit; 'more than' means strictly greater."),
      ];
      const ex = exWith([`**Rate:** ${F} ÷ ${W} = **${fixed(r.rate, 1)} per minute**.`, `**Rule:** ${fixed(F / W, 2)} is ${lock ? "above" : "not above"} ${T}, so **${lock ? "Yes" : "No"}**.`], n);
      return finish(`A log shows **${F}** failed logins from one address in **${W} minutes**.`, parts, ex, "ne-log", { tier, F, W, T, n }, [["_failures", F], ["_minutes", W], ["_limit", T]],
        ["Divide the count by the time to get a rate per minute.", "Check the rule's wording: more than, or at least."]);
    }
    if (tier === "hard") {
      const cs = Array.from({ length: 5 }, () => rng.int(0, 2 * T)); // mean spread either side of the limit
      const tot = cs.reduce((s, v) => s + v, 0);
      const st = (rd) => ({ mean: rd("mean", tot / 5) });
      if (tot < 10 || !stableOk(st, { mean: 1 })) continue;
      const r = st((k, v) => v);
      if (Math.abs(tot / 5 - T) < 0.4) continue;
      const lock = tot / 5 > T;
      const parts = [
        intPart("total", "Total failures", "Total failed logins over the five minutes", tot, "Add the five counts."),
        numPart("mean", "Mean per minute", "Mean failures per minute", r.mean, 1, "Mean = total ÷ 5 minutes."),
        yesNo("lock", "Lock the account?", `The rule locks an account when the mean is more than ${T} failures per minute. Is it locked?`, lock, "Compare your mean with the limit."),
      ];
      const ex = exWith([`**Total:** ${cs.join(" + ")} = **${tot}**.`, `**Mean:** ${tot} ÷ 5 = **${fixed(r.mean, 1)}**.`, `**Rule:** ${fixed(tot / 5, 2)} is ${lock ? "above" : "not above"} ${T}, so **${lock ? "Yes" : "No"}**.`], n);
      return finish(`The log for one address, counted per minute:\n\n${mdTable(["Minute", "1", "2", "3", "4", "5"], [["Failures", ...cs]])}`, parts, ex, "ne-log2", { tier, cs, T, n }, cs.map((v, j) => [`_m${j + 1}`, v]),
        ["Add the counts first; the mean is the total over the number of minutes.", "A rule that says 'more than' is a strict comparison."]);
    }
    // expert: six ten-minute buckets
    const cs = Array.from({ length: 6 }, () => rng.int(2, 60));
    const tot = cs.reduce((s, v) => s + v, 0);
    const peak = Math.max(...cs);
    const P = rng.pick([25, 30, 35, 40]);
    const st = (rd) => ({ rate: rd("rate", tot / 60), share: rd("share", (peak / tot) * 100) });
    if (!stableOk(st, { rate: 1, share: 1 })) continue;
    const r = st((k, v) => v);
    if (Math.abs(r.share - P) < 2) continue;
    const burst = (peak / tot) * 100 >= P;
    const parts = [
      intPart("total", "Total failures", "Total failed logins over the hour", tot, "Add the six counts."),
      numPart("rate", "Rate per minute", "Mean failures per minute over the hour", r.rate, 1, "The six buckets cover 60 minutes. Rate = total ÷ 60."),
      numPart("share", "Peak share", "Share of all failures in the busiest bucket (%)", r.share, 1, "Find the largest bucket, divide by the total and multiply by 100."),
      yesNo("burst", "Burst?", `The alert fires when the busiest bucket holds at least ${P}% of the hour's failures. Does it fire?`, burst, "Compare your share with the stated percentage."),
    ];
    const ex = [`**Total:** ${cs.join(" + ")} = **${tot}**.`, `**Rate:** ${tot} ÷ 60 = **${fixed(r.rate, 1)} per minute**.`, `**Peak share:** ${peak} ÷ ${tot} × 100 = **${fixed(r.share, 1)}%**.`, `**Alert:** ${fixed(r.share, 1)}% is ${burst ? "at least" : "below"} ${P}%, so **${burst ? "Yes" : "No"}**.`].join("\n\n");
    return finish(`Failed logins against a VPN gateway, counted in ten-minute buckets:\n\n${mdTable(["Bucket", "1", "2", "3", "4", "5", "6"], [["Failures", ...cs]])}`, parts, ex, "ne-log3", { tier, cs, P, n }, cs.map((v, j) => [`_b${j + 1}`, v]),
      ["Total first; every other answer uses it.", "The rate uses minutes (60), the share uses the total."]);
  }
  return tooMany();
}

// L2 (expert+): flag byte -> binary -> risk score -> lockout limit for the window.
function genFlags(rng) {
  for (let i = 0; i < TRY; i++) {
    const val = rng.int(1, 31);
    const score = FLAG_WEIGHTS.reduce((s, w, k) => s + (val & (1 << k) ? w : 0), 0);
    const R0 = rng.pick([3, 4, 5, 6]);
    const T = rng.pick([4, 6, 8, 10]);
    const W = rng.pick([5, 10, 15, 20]);
    const high = score >= R0;
    const limit = high ? T / 2 : T;
    const maxAllowed = limit * W;
    const F = rng.int(Math.max(3, Math.floor(maxAllowed * 0.4)), Math.ceil(maxAllowed * 1.8) + 2);
    if (Math.abs(F - maxAllowed) < 2 || F === maxAllowed) continue;
    const lock = F > maxAllowed;
    const bits = binOf(val);
    const acc = [...new Set([`${bits.slice(0, 4)} ${bits.slice(4)}`, bits.replace(/^0+(?=.)/, ""), `0b${bits}`])].filter((x) => x !== bits);
    const parts = [
      textPart("bin", "Binary", `The flag byte 0x${val.toString(16).toUpperCase().padStart(2, "0")} as 8 binary digits`, bits, "Each hex digit becomes four bits. Bit 0 is the rightmost digit.", acc),
      intPart("score", "Risk score", "Risk score of the event: the sum of the weights of the flags that are set", score, "Read the set bits from the right (bit 0 first) and add the weight of each matching flag in the table."),
      intPart("max", "Most failures allowed", `Most failures allowed in the ${W}-minute window before the account locks (use the limit that applies to this score)`, maxAllowed, `If the score reaches ${R0}, the per-minute limit is halved. The window allows the limit × ${W} failures.`),
      yesNo("lock", "Lock the account?", `The window shows ${F} failures. The account locks when the failures exceed the most allowed. Is it locked?`, lock, "Compare the observed failures with the most allowed."),
    ];
    const setNames = FLAG_NAMES.filter((_, k) => val & (1 << k));
    const ex = [
      `**Binary:** 0x${val.toString(16).toUpperCase().padStart(2, "0")} = **${bits}**.`,
      `**Score:** set bits (${setNames.join(", ")}) add up to **${score}**.`,
      `**Limit:** the score ${high ? "reaches" : "is below"} ${R0}, so the limit is ${limit} per minute; ${limit} × ${W} = **${maxAllowed}** failures.`,
      `**Lock:** ${F} ${lock ? ">" : "≤"} ${maxAllowed}, so **${lock ? "Yes" : "No"}**.`,
    ].join("\n\n");
    const table = mdTable(["Bit", "0", "1", "2", "3", "4"], [["Flag", ...FLAG_NAMES], ["Weight", ...FLAG_WEIGHTS]]);
    return finish(
      `A login event carries the flag byte **0x${val.toString(16).toUpperCase().padStart(2, "0")}** (bits numbered from 0 at the right; bits 5 to 7 are unused):\n\n${table}\n\nThe base limit is **${T}** failures per minute. If the event's risk score is **${R0}** or more, the limit is halved.`,
      parts, ex, "ne-flags", { val, R0, T, W, F }, [["_hexvalue", val], ["_baselimit", T], ["_window", W], ["_failures", F]],
      ["Convert the hex byte to bits before reading any flag.", "The score decides which limit applies, and the limit sets how many failures the window can hold."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  if (subtopic === "subnet-plan") return plus ? genSubnetBack(rng) : genSubnet(rng, difficulty);
  if (subtopic === "transfer-window") return plus ? genTransferBack(rng) : genTransfer(rng, difficulty);
  if (subtopic === "cipher-decode") return plus ? genAffineBack(rng) : genCaesar(rng, difficulty);
  if (subtopic === "log-flags") return plus ? genFlags(rng) : genLog(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (per-octet blocks, loops,
// brute force over keys). A number must be within its rounding tolerance; text and choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");
const octets = (n) => [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256];

// Network / broadcast / mask per octet using block sizes (no bitwise operators).
function blockMaths(ipn, p) {
  const o = octets(ipn);
  const net = [], bc = [], mk = [];
  for (let i = 0; i < 4; i++) {
    const bitsHere = Math.min(8, Math.max(0, p - 8 * i));
    const block = 2 ** (8 - bitsHere);
    const lo = Math.floor(o[i] / block) * block;
    net.push(lo);
    bc.push(lo + block - 1);
    mk.push(256 - block);
  }
  return { net: net.join("."), bc: bc.join("."), mask: mk.join(".") };
}
const dotted = (s) => String(s).trim();
const wordNorm = (s) => String(s).trim().toUpperCase().replace(/\s+/g, "");
const binVal = (s) => { const t = String(s).trim().replace(/\s+/g, "").replace(/^0b/i, ""); return /^[01]{1,8}$/.test(t) ? parseInt(t, 2) : NaN; };

const decodeCaesar = (c, k) => { const cipherAlpha = ALPHA.slice(k) + ALPHA.slice(0, k); return [...c].map((ch) => ALPHA[cipherAlpha.indexOf(ch)]).join(""); };
function affineTable(a, b) { const t = {}; for (let x = 0; x < 26; x++) t[ALPHA[x]] = ALPHA[(a * x + b) % 26]; return t; }

const ALT = {
  "ne-subnet": (p) => {
    const m = blockMaths(p.ip, p.p);
    const m2 = blockMaths(p.ip2, p.p);
    return { hosts: 2 ** (32 - p.p) - 2, net: m.net, bc: m.bc, mask: m.mask, same: YN(m2.net === m.net) };
  },
  "ne-subnetback": (p) => {
    let need = 0;
    while (need * 100 < p.D * (100 + p.g)) need++;
    let h = 2;
    while (2 ** h - 2 < need) h++;
    const subnets = 2 ** (32 - h - p.q);
    return { need, prefix: 32 - h, subnets, enough: YN(p.O <= subnets) };
  },
  "ne-xfer": (p) => ({ bits: p.S * 8, t: (p.S * 8) / p.R }),
  "ne-xfer2": (p) => {
    const mb = (p.S * 1000 * (100 + p.x)) / 100;
    const bits = mb * 8;
    const tm = bits / p.R / 60;
    return { mb, bits, tm, fits: YN(bits / p.R <= p.Wmin * 60) };
  },
  "ne-xferback": (p) => {
    const pay = (p.R * p.W * 60) / 8 / (1 + p.x / 100);
    const files = Math.floor(pay / p.F + 1e-9);
    const need = (p.N * p.F * 8 * (1 + p.x / 100)) / (p.W * 60);
    const link = LINKS.filter((l) => l >= need)[0];
    return { pay, files, link: `${link} Mbps`, upgrade: YN(p.N > files) };
  },
  "ne-caesar": (p) => {
    const k = (idx(shiftWord(p.w1, p.k)[0]) - idx(p.w1[0]) + 26) % 26;
    const c1 = shiftWord(p.w1, p.k);
    const out = { key: k, word: decodeCaesar(c1, k) };
    if (p.tier === "hard") out.word2 = decodeCaesar(shiftWord(p.w2, p.k), k);
    return out;
  },
  "ne-affine": (p) => {
    const tab = affineTable(p.a, p.b);
    const rev = Object.fromEntries(Object.entries(tab).map(([k, v]) => [v, k]));
    const c2 = [...p.w2].map((c) => tab[c]).join("");
    return { y: ALPHA.indexOf(tab[ALPHA[p.x]]), enc: [...p.w1].map((c) => tab[c]).join(""), inv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].find((t) => (t * p.a) % 26 === 1), dec: [...c2].map((c) => rev[c]).join("") };
  },
  "ne-affineback": (p) => {
    let found = null;
    for (const a of VALID_A) for (let b = 0; b < 26; b++) if ((a * idx(ALPHA[p.x1]) + b) % 26 === p.y1 && (a * p.x2 + b) % 26 === p.y2) found = [a, b];
    const [a, b] = found;
    const rev = Object.fromEntries(Object.entries(affineTable(a, b)).map(([k, v]) => [v, k]));
    return { a, b, word: [...p.cw].map((c) => rev[c]).join(""), strong: YN(312 / p.Rk >= p.T) };
  },
  "ne-log": (p) => ({ rate: p.F / p.W, lock: YN(p.F / p.W > p.T) }),
  "ne-log2": (p) => { const t = p.cs.reduce((s, v) => s + v, 0); return { total: t, mean: t / p.cs.length, lock: YN(t / p.cs.length > p.T) }; },
  "ne-log3": (p) => {
    const t = p.cs.reduce((s, v) => s + v, 0);
    const mx = [...p.cs].sort((a, b) => b - a)[0];
    return { total: t, rate: t / 60, share: (mx / t) * 100, burst: YN((mx * 100) / t >= p.P) };
  },
  "ne-flags": (p) => {
    let score = 0;
    for (let k = 0; k < 5; k++) if (Math.floor(p.val / 2 ** k) % 2 === 1) score += FLAG_WEIGHTS[k];
    const max = (score >= p.R0 ? p.T / 2 : p.T) * p.W;
    return { bin: { v: p.val }, score, max, lock: YN(p.F > max) };
  },
};
const TEXT_KEYS = new Set(["net", "bc", "mask"]);

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      const dp = p.dps[part.id];
      if (!near(partNum(answer, part.id), tv, dp === undefined ? 0 : tolOf(dp))) return false;
    } else if (typeof tv === "object") {
      if (binVal(partStr(answer, part.id)) !== tv.v) return false;
    } else if (TEXT_KEYS.has(part.id)) {
      if (dotted(partStr(answer, part.id)) !== tv) return false;
    } else if (part.answerType === "text") {
      if (wordNorm(partStr(answer, part.id)) !== tv) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
