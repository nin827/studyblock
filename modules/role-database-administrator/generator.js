// Database Administrator role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so each
// chained answer is exact (or a rounded earlier answer would not change a later one), no answer sits on a
// rounding half-step, and verdict parts are decided first and then fitted clear of the threshold. All figures
// are made up and every rule (page sizes, fill, fan-out, 1 GB = 10^9 bytes or 1000 MB, replay speeds, pool
// utilisation) is an exercise rule stated in each prompt, not any product's behaviour.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   index-scan       pages, index height + reads; hard: cheaper plan; expert: timed plan (sequential vs random
//                    ms); expert-plus: table grows, break-even number of matches, plan for a query
//   sizing           rows per page, pages, table GB; expert: + index GB and total; expert-plus: growth, two
//                    indexes, quota verdict
//   backup-recovery  restore chain size, restore minutes; hard: RTO verdict; expert: + log replay, total
//                    downtime; expert-plus: weekly full + incrementals vs daily fulls under an RTO
//   pool-replica     busy connections, pool size; hard: server limit; expert: replica lag and catch-up after a
//                    write burst; expert-plus: primary + replicas pools, cluster connection limit

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const isEx = (x, dp) => Math.abs(x * 10 ** dp - Math.round(x * 10 ** dp)) < 1e-6;
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-database-administrator: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.1 && fr < 0.9; };
const fracIn = (r) => { const fr = r - Math.floor(r); return fr > 0.1 && fr < 0.9; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const gb = (n) => `${f(roundTo(n, 4))} GB`;

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function pickPart(rng, id, label, ask, a, b, win, hint) {
  return { id, label, ask, answerType: "choice", answer: win, choices: shuffled(rng, [a, b]), hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

const TABLES = ["orders table", "events table", "sessions table", "invoices table", "audit-log table", "sensor-readings table"];
const DBS = ["orders database", "customer database", "inventory database", "payments database", "analytics database", "booking database"];
const SERVICES = ["checkout service", "reporting tool", "mobile API", "search page", "billing job runner", "admin dashboard"];

// ---------- index-scan ----------

const heightOf = (N, fo) => { let h = 0, c = 1; while (c < N) { c *= fo; h++; } return h; };
// a number of matches clear of the break-even read count Rb (20% either side)
function pickM(rng, Rb, h, wantIdx) {
  if (wantIdx) { const hi = Math.floor(0.8 * Rb - h); return hi < 1 ? null : rng.int(1, hi); }
  return rng.int(Math.ceil(1.2 * Rb - h), Math.ceil(2 * Rb - h));
}
const PLAN_IDX = "Index lookup", PLAN_SCAN = "Full scan";

function genIndex(rng, tier) {
  const wantIdx = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const tb = rng.pick(TABLES), r = rng.pick([40, 50, 80, 100, 125, 200, 250]), fo = rng.pick([50, 100, 200, 250, 400, 500]);
    const N0 = 20 * rng.int(500, 50000), x = rng.pick([10, 20, 25, 50, 100]);
    const s = rng.pick([0.05, 0.1, 0.2, 0.25]), rr = rng.pick([1, 2, 4, 5, 8]);
    const N = tier === "expert-plus" ? (N0 * (100 + x)) / 100 : N0;
    if (!fracOk(N / r)) continue;
    const P = Math.ceil(N / r), h = heightOf(N, fo);
    if (!(N > fo ** (h - 1) * 1.15 && N < fo ** h * 0.92) || h < 2) continue;
    const Rb = tier === "expert" ? (P * s) / rr : P;
    const m = pickM(rng, Rb, h, wantIdx);
    if (m == null || P - h < 12) continue;
    const reads = h + m;
    const base = `The **${tb}** has **${commas(N0)} rows**${tier === "expert-plus" ? ` today and will grow by **${x}%** before the query runs` : ""}, stored **${r} rows per page** (the last page may be part full). A full scan reads every page. A B-tree index has fan-out **${fo}**: its height is the fewest levels h with ${fo}^h at least the number of rows, and a lookup reads **h** index pages and then **1 data page for each matching row** (worst case: every match is on its own page).`;
    const given = [["_rows", N0], ["_perpage", r], ["_fanout", fo]];
    const exP = `**Pages:** ${commas(N)} ÷ ${r} = ${f(roundTo(N / r, 2))}, round up to **${commas(P)}** pages.`;
    const exH = `**Height:** ${fo}^${h - 1} = ${commas(fo ** (h - 1))} is below ${commas(N)} and ${fo}^${h} = ${commas(fo ** h)} is at or above it, so **h = ${h}**.`;
    const exR = `**Index reads:** ${h} + ${commas(m)} = **${commas(reads)}** pages.`;
    const pP = numPart("pages", "Pages", "Pages in the table (round up)", P, 0, "Rows divided by rows per page, rounded up: a part-full last page still has to be read.");
    const pR = numPart("reads", "Index reads", `Page reads for an index lookup that matches ${commas(m)} rows`, reads, 0, "Find the tree height first, then add one data page for each matching row.");
    if (tier === "medium") return finish(`${base} A query matches **${commas(m)} rows**.`, [pP, pR], `${exP}\n\n${exH}\n\n${exR}`, "dba-ix1", { tier, N, r, fo, m }, [...given, ["_matches", m]],
      ["Pages come from the rows and the page size; the index reads come from the height and the matches.", "Round the pages up."]);
    if (tier === "hard") {
      const win = reads < P ? PLAN_IDX : PLAN_SCAN;
      return finish(`${base} A query matches **${commas(m)} rows**.`,
        [pP, pR, pickPart(rng, "win", "Cheaper plan", "Which plan reads fewer pages?", PLAN_IDX, PLAN_SCAN, win, "Compare the number of pages each plan reads.")],
        `${exP}\n\n${exH}\n\n${exR}\n\n**Cheaper:** the scan reads ${commas(P)} pages and the index ${commas(reads)}, so **${win}**.`, "dba-ix2", { tier, N, r, fo, m }, [...given, ["_matches", m]],
        ["Both plans need a page count; compare them.", "Fewer pages read wins."]);
    }
    if (tier === "expert") {
      const idxT = reads * rr, scanT = P * s, win = idxT < scanT ? PLAN_IDX : PLAN_SCAN;
      const parts = [pP, pR,
        numPart("idxms", "Index plan time", "Time for the index lookup (milliseconds)", idxT, 0, "Random page reads times the time for one random read."),
        pickPart(rng, "win", "Faster plan", "Which plan is faster?", PLAN_IDX, PLAN_SCAN, win, "Work out the scan time too (pages times the sequential time per page), then compare the two times."),
      ];
      return finish(`${base} A full scan reads its pages in order at **${f(s)} ms** per page; the index lookup's reads are random and take **${rr} ms** each. A query matches **${commas(m)} rows**.`,
        parts, `${exP}\n\n${exH}\n\n${exR}\n\n**Index time:** ${commas(reads)} × ${rr} ms = **${commas(idxT)} ms**.\n\n**Scan time:** ${commas(P)} × ${f(s)} = ${f(roundTo(scanT, 2))} ms, so the faster plan is the **${win}**.`,
        "dba-ix3", { tier, N, r, fo, m, s, rr }, [...given, ["_matches", m], ["_seq", s], ["_rand", rr]],
        ["Two plans, two times: sequential pages for the scan, random reads for the index.", "Pages and index reads come first."]);
    }
    // expert-plus: grown table, break-even matches, verdict for a stated query
    const maxM = P - h - 1;
    const win = reads < P ? PLAN_IDX : PLAN_SCAN;
    const parts = [
      numPart("pages", "Pages", "Pages in the table after the growth (round up)", P, 0, "Grow the rows first, then divide by rows per page, rounded up."),
      numPart("height", "Index height", "Height h of the index after the growth", h, 0, "The fewest levels with fan-out to the power h at least the new number of rows."),
      numPart("maxm", "Break-even matches", "Largest whole number of matching rows for which the index still reads fewer pages than the scan", maxM, 0, "The index reads h + matches pages; that must stay below the scan's pages."),
      pickPart(rng, "win", "Plan for the query", `A query matches **${commas(m)} rows**. Which plan reads fewer pages?`, PLAN_IDX, PLAN_SCAN, win, "Compare the matches with the break-even number from the previous part."),
    ];
    const ex = `**Rows after growth:** ${commas(N0)} × ${100 + x}% = ${commas(N)}.\n\n${exP}\n\n${exH}\n\n**Break-even:** index reads h + m must be below ${commas(P)}, so m ≤ ${commas(P)} − ${h} − 1 = **${commas(maxM)}**.\n\n**Query:** ${commas(m)} matches is ${m <= maxM ? "within" : "over"} ${commas(maxM)}, so the **${win}** reads fewer pages.`;
    return finish(`${base} Use the table's size after that growth.`, parts, ex, "dba-ix4", { tier, N0, x, N, r, fo, m }, [...given, ["_growth", x], ["_matches", m]],
      ["Everything is worked on the grown table.", "The break-even is where the two page counts would be equal, rounded the safe way."]);
  }
  return tooMany();
}

// ---------- sizing ----------

function genSize(rng, tier) {
  const wantFit = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const tb = rng.pick(TABLES), Pg = rng.pick([4000, 8000, 16000]), fill = rng.pick([60, 70, 75, 80, 90]), usable = (Pg * fill) / 100;
    const B = rng.int(60, 600), e = rng.pick([12, 16, 20, 24, 32, 40]), e2 = rng.pick([8, 10, 12, 16, 20, 24]);
    const N0 = 1000 * rng.int(500, 80000), x = rng.pick([10, 20, 25, 50, 100]);
    const ep = tier === "expert-plus";
    const N = ep ? (N0 * (100 + x)) / 100 : N0;
    if (!fracIn(usable / B) || usable / B < 5 || !fracIn(N / Math.floor(usable / B))) continue;
    const rpp = Math.floor(usable / B), pages = Math.ceil(N / rpp), tbl = (pages * Pg) / 1e9;
    if (tbl < 2 || nearHalf(tbl, 2, 0.1)) continue;
    const base = `The **${tb}** has **${commas(N0)} rows** of **${B} bytes** each${ep ? ` and will grow by **${x}%**` : ""}. Pages are **${commas(Pg)} bytes** but are only filled to **${fill}%** (so **${commas(usable)} bytes** are used per page), and a row never splits across pages.`;
    const given = [["_rows", N0], ["_row", B], ["_page", Pg], ["_fill", fill]];
    const exR = `**Rows per page:** ${commas(usable)} ÷ ${B} = ${f(roundTo(usable / B, 2))}, down to **${rpp}**.`;
    const exP = `**Pages:** ${commas(N)} ÷ ${rpp} = ${f(roundTo(N / rpp, 2))}, up to **${commas(pages)}**.`;
    const exT = `**Table size:** ${commas(pages)} × ${commas(Pg)} = ${commas(pages * Pg)} bytes = **${gb(tbl)}** (1 GB = 10^9 bytes).`;
    const pRpp = numPart("rpp", "Rows per page", "Whole rows that fit on one page (round down)", rpp, 0, "Usable bytes per page divided by the row size, rounded down: a row cannot be split.");
    const pPages = numPart("pages", "Pages", "Pages the table needs (round up)", pages, 0, "Rows divided by rows per page, rounded up.");
    const pTbl = numPart("tbl", "Table size", "Table size (GB)", tbl, 2, "Pages times the page size gives bytes; divide by a billion for gigabytes.");
    if (tier === "medium") return finish(`${base} Rows per page and pages are whole numbers.`, [pRpp, pPages], `${exR}\n\n${exP}`, "dba-sz1", { tier, N, B, Pg, fill }, given,
      ["Only the usable part of each page holds rows.", "Round the rows per page down, then the pages up."]);
    if (tier === "hard") return finish(`${base} 1 GB = 10^9 bytes.`, [pRpp, pPages, pTbl], `${exR}\n\n${exP}\n\n${exT}`, "dba-sz2", { tier, N, B, Pg, fill }, given,
      ["Rows per page, then pages, then bytes.", "A page counts in full even if it is only part used."]);
    const epp = Math.floor(usable / e), ipg = Math.ceil(N / epp);
    if (tier === "expert") {
      if (!fracIn(usable / e) || !fracIn(N / epp)) continue;
      const idx = (ipg * Pg) / 1e9, total = tbl + idx;
      if (nearHalf(idx, 2, 0.1) || nearHalf(total, 2, 0.1) || roundTo(tbl, 2) + roundTo(idx, 2) !== roundTo(total, 2) || idx < 0.2) continue;
      const parts = [pRpp, pTbl, numPart("idx", "Index size", "Size of the index's leaf pages (GB)", idx, 2, "Entries per page (rounded down), then leaf pages (rounded up), then bytes to gigabytes."),
        numPart("total", "Total", "Table plus index (GB)", total, 2, "Add the two sizes.")];
      const ex = `${exR}\n\n${exP}\n\n${exT}\n\n**Index:** ${commas(usable)} ÷ ${e} = ${f(roundTo(usable / e, 2))}, so ${epp} entries per page; ${commas(N)} ÷ ${epp} = ${f(roundTo(N / epp, 2))}, up to ${commas(ipg)} pages; × ${commas(Pg)} bytes = **${gb(idx)}**.\n\n**Total:** ${gb(tbl)} + ${gb(idx)} = **${gb(total)}**.`;
      return finish(`${base} An index holds one **${e}-byte** entry per row in its leaf pages, packed the same way (same page size and fill; a part-full last page still counts); ignore the upper levels. 1 GB = 10^9 bytes.`,
        parts, ex, "dba-sz3", { tier, N, B, Pg, fill, e }, [...given, ["_entry", e]],
        ["The index is sized the same way as the table, with its own entry size.", "Entries per page round down, pages round up."]);
    }
    // expert-plus: grown table, two indexes, quota verdict
    const epp2 = Math.floor(usable / e2), ipg2 = Math.ceil(N / epp2);
    if (!fracIn(usable / e) || !fracIn(usable / e2) || !fracIn(N / epp) || !fracIn(N / epp2) || e === e2) continue;
    const total = tbl + (ipg * Pg) / 1e9 + (ipg2 * Pg) / 1e9;
    if (nearHalf(total, 2, 0.1)) continue;
    const Q = wantFit ? Math.ceil(total * rng.pick([1.1, 1.2, 1.3, 1.5])) : Math.floor(total * rng.pick([0.6, 0.7, 0.8, 0.88]));
    if (Q < 1 || Math.abs(total - Q) / Q < 0.08) continue;
    const fit = total <= Q;
    const parts = [
      numPart("n2", "Rows after growth", "Rows in the table after the growth", N, 0, "Increase today's rows by the stated percentage."),
      numPart("tbl", "Table size", "Table size after the growth (GB)", tbl, 2, "Rows per page (down), pages (up), then bytes to gigabytes."),
      numPart("total", "Table and indexes", "Table plus both indexes (GB)", total, 2, "Size each index from its entry size the same way as the table, then add all three."),
      yesNo("fit", "Fits the quota?", `The volume's quota is **${commas(Q)} GB**. Does everything fit?`, fit, "Compare the total with the quota; equal still fits."),
    ];
    const ex = `**Rows after growth:** ${commas(N0)} × ${100 + x}% = **${commas(N)}**.\n\n${exR}\n\n${exP}\n\n${exT}\n\n**Index 1:** ${epp} entries per page, ${commas(ipg)} pages = ${gb((ipg * Pg) / 1e9)}. **Index 2:** ${epp2} entries per page, ${commas(ipg2)} pages = ${gb((ipg2 * Pg) / 1e9)}.\n\n**Total:** **${gb(total)}**, ${fit ? "within" : "over"} ${commas(Q)} GB: **${YN(fit)}**.`;
    return finish(`${base} Two indexes each hold one entry per row in their leaf pages, packed the same way (same page size and fill; a part-full last page still counts), with entries of **${e} bytes** and **${e2} bytes**; ignore the upper levels. 1 GB = 10^9 bytes. Use the sizes after the growth.`,
      parts, ex, "dba-sz4", { tier, N, B, Pg, fill, e, e2, Q }, [...given, ["_growth", x], ["_entry1", e], ["_entry2", e2], ["_quota", Q]],
      ["Grow the rows first; every size is worked from that.", "Three structures to size, one to compare with the quota."]);
  }
  return tooMany();
}

// ---------- backup-recovery ----------

const DAYS = (k) => `${k} day${k === 1 ? "" : "s"}`;
const mins = (gbv, T) => (gbv * 1000) / T / 60;

function genBackup(rng, tier) {
  const wantMeet = rng.next() < 0.5, outcome = rng.pick(["A", "B", "N"]);
  for (let i = 0; i < TRY; i++) {
    const db = rng.pick(DBS), S = 10 * rng.int(20, 200), d = rng.pick([2, 3, 4, 5, 6, 8, 10]), T = rng.pick([100, 125, 150, 200, 250, 300]);
    const inc = (S * d) / 100;
    if (!isEx(inc, 1)) continue;
    if (tier === "expert-plus") {
      const stA = S + 6 * inc, stB = 7 * S, rA = mins(stA, T), rB = mins(S, T);
      if (nearHalf(rA, 0, 0.1) || rB < 5) continue;
      let L;
      if (outcome === "A") L = 5 * Math.round((rA * rng.pick([1.15, 1.3, 1.5])) / 5);
      else if (outcome === "B") L = 5 * Math.round(((rB + rA) / 2) / 5);
      else L = 5 * Math.round((rB * rng.pick([0.5, 0.7, 0.85])) / 5);
      if (L < 5) continue;
      if (Math.abs(L - rA) / L < 0.1 || Math.abs(L - rB) / L < 0.1) continue;
      const win = rA <= L ? "A" : rB <= L ? "B" : "N";
      if (win !== outcome) continue;
      const CA = "Weekly full + daily incrementals", CB = "Daily full backups", CN = "Neither";
      const parts = [
        numPart("sta", "Plan A storage", "Storage for one week of plan A: one full backup and 6 incrementals (GB)", stA, 1, "One full backup plus six incrementals, each a percentage of the database size."),
        numPart("stb", "Plan B storage", "Storage for one week of plan B: 7 full backups (GB)", stB, 0, "Seven copies of the full database."),
        numPart("ra", "Plan A restore", "Restore time on the worst day for plan A, full plus all 6 incrementals (minutes)", rA, 0, "Gigabytes to megabytes, divide by the speed for seconds, then minutes.", true),
        { id: "pick", label: "Cheapest plan that qualifies", ask: "Which plan uses the least storage while meeting the recovery-time limit on its worst day?", answerType: "choice", answer: win === "A" ? CA : win === "B" ? CB : CN, choices: shuffled(rng, [CA, CB, CN]), hint: "Plan B restores one full backup at worst. Check each plan's worst-day restore against the limit, then pick the cheaper of those that pass." },
      ];
      const ex = `**Plan A storage:** incremental = ${d}% of ${S} = ${f(inc)} GB; ${S} + 6 × ${f(inc)} = **${f(stA)} GB**.\n\n**Plan B storage:** 7 × ${S} = **${stB} GB**.\n\n**Plan A restore:** ${f(stA)} GB = ${commas(f(stA * 1000))} MB ÷ ${T} MB/s = ${f(roundTo(stA * 1000 / T, 1))} s, about **${Math.round(rA)} min**.\n\n**Plan B restore:** ${S} GB ÷ ${T} MB/s is about ${f(roundTo(rB, 1))} min.\n\n**Pick:** the limit is ${L} min. ${win === "A" ? `Plan A (${f(roundTo(rA, 1))} min) meets it and stores less than plan B.` : win === "B" ? `Plan A is too slow (${f(roundTo(rA, 1))} min) but plan B (${f(roundTo(rB, 1))} min) meets it.` : `Even plan B needs ${f(roundTo(rB, 1))} min.`} Answer: **${parts[3].answer}**.`;
      return finish(`The **${db}** is **${S} GB**. Plan A: a full backup every Sunday and an incremental every day, each incremental **${d}%** of the database size. Plan B: a full backup every day. Backups are restored at **${T} MB/s**, and the **recovery-time limit is ${L} minutes** on the worst day. 1 GB = 1000 MB. A week's storage is what is kept for the 7 days.`,
        parts, ex, "dba-bk4", { tier, S, d, T, L }, [["_size", S], ["_pct", d], ["_speed", T], ["_limit", L]],
        ["Size both plans first, then test each against the limit.", "Plan B's worst day is just one full backup."]);
    }
    const k = rng.int(2, 6), chain = S + k * inc, rest = mins(chain, T);
    if (nearHalf(rest, 0, 0.1) || rest < 8) continue;
    const base = `The **${db}** is **${S} GB**. A full backup is taken every Sunday and an incremental every day after it, each incremental **${d}%** of the database size. The disk failed after incremental number **${k}** was taken, so restoring needs the full backup and **${k}** incrementals, read at **${T} MB/s**. 1 GB = 1000 MB.`;
    const given = [["_size", S], ["_pct", d], ["_days", k], ["_speed", T]];
    const pC = numPart("chain", "Chain size", "Size of the full backup plus the incrementals to restore (GB)", chain, 1, "Each incremental is a percentage of the database size; add them to the full backup.");
    const pRest = numPart("rest", "Restore time", "Time to read that whole chain (minutes)", rest, 0, "Gigabytes to megabytes, divide by the speed for seconds, then minutes.", true);
    const exC = `**Chain:** incremental = ${d}% of ${S} = ${f(inc)} GB; ${S} + ${k} × ${f(inc)} = **${f(chain)} GB**.`;
    const exRest = `**Restore:** ${f(chain)} GB = ${commas(f(chain * 1000))} MB ÷ ${T} MB/s = ${f(roundTo(chain * 1000 / T, 1))} s, about **${Math.round(rest)} min**.`;
    if (tier === "medium") return finish(base, [pC, pRest], `${exC}\n\n${exRest}`, "dba-bk1", { tier, S, d, k, T }, given,
      ["Build the chain first; only then convert size to time.", "Mind the units: GB, MB, seconds, minutes."]);
    if (tier === "hard") {
      const L = 5 * Math.round((rest * (wantMeet ? rng.pick([1.15, 1.3, 1.5]) : rng.pick([0.6, 0.75, 0.85]))) / 5);
      if (L < 5 || Math.abs(L - rest) / L < 0.1) continue;
      const meet = rest <= L;
      if (meet !== wantMeet) continue;
      return finish(`${base} The **recovery-time limit is ${L} minutes** (counting only this read).`,
        [pC, pRest, yesNo("meet", "Meets the limit?", `Is the restore within the **${L}-minute** limit?`, meet, "Compare the restore time with the limit; equal counts as meeting it.")],
        `${exC}\n\n${exRest}\n\n**Verdict:** ${Math.round(rest)} min is ${meet ? "within" : "over"} ${L} min: **${YN(meet)}**.`, "dba-bk2", { tier, S, d, k, T, L }, [...given, ["_limit", L]],
        ["Chain, then time, then compare.", "The limit applies to the whole chain read."]);
    }
    // expert: log replay after the restore
    const g = rng.pick([0.5, 1, 1.5, 2, 3, 4]), hl = rng.int(3, 20), q = rng.pick([6, 8, 10, 12, 15, 20, 25, 30]);
    const logGB = g * hl, replay = (logGB / q) * 60;
    if (!isEx(logGB, 1) || nearHalf(replay, 0, 0.1) || replay < 3) continue;
    const total = rest + replay;
    if (nearHalf(total, 0, 0.1) || Math.round(rest) + Math.round(replay) !== Math.round(total)) continue;
    const L = 5 * Math.round((total * (wantMeet ? rng.pick([1.15, 1.3, 1.5]) : rng.pick([0.6, 0.75, 0.85]))) / 5);
    if (L < 5 || Math.abs(L - total) / L < 0.1) continue;
    const meet = total <= L;
    if (meet !== wantMeet) continue;
    const parts = [pRest,
      numPart("log", "Log to replay", "Size of the transaction logs written since the last incremental (GB)", logGB, 1, "Log rate times the hours since the last incremental."),
      numPart("total", "Total downtime", "Restore time plus log replay time (minutes)", total, 0, "Replay time is log size divided by the replay speed, in minutes. Add it to the restore time.", true),
      yesNo("meet", "Meets the limit?", `The **recovery-time limit is ${L} minutes** for restore plus replay. Is it met?`, meet, "Compare the total with the limit; equal counts as meeting it."),
    ];
    const ex = `${exC}\n\n${exRest}\n\n**Logs:** ${f(g)} GB/h × ${hl} h = **${f(logGB)} GB**.\n\n**Replay:** ${f(logGB)} ÷ ${q} GB/h = ${f(roundTo(logGB / q, 3))} h, about ${Math.round(replay)} min.\n\n**Total:** about **${Math.round(total)} min**, ${meet ? "within" : "over"} ${L} min: **${YN(meet)}**.`;
    return finish(`${base} After the restore, the logs written since the last incremental are replayed: the database wrote **${f(g)} GB of logs per hour** for **${hl} hours** since then, and replay runs at **${q} GB per hour**. The **recovery-time limit is ${L} minutes** for restore plus replay.`,
      parts, ex, "dba-bk3", { tier, S, d, k, T, g, hl, q, L }, [...given, ["_lograte", g], ["_hours", hl], ["_replay", q], ["_limit", L]],
      ["Restore first, then the logs: two separate times.", "Replay speed is in GB per hour, restore speed in MB per second."]);
  }
  return tooMany();
}

// ---------- pool-replica ----------

function genPool(rng, tier) {
  const wantFit = rng.next() < 0.5, wantMeet = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const svc = rng.pick(SERVICES), Q = 20 * rng.int(5, 120), t = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 40]), u = rng.pick([50, 60, 70, 75, 80]);
    if (tier === "expert") {
      const w = rng.pick([20, 30, 40, 50, 60, 80]), a = w - rng.pick([5, 10, 15, 20]), D = rng.pick([10, 15, 20, 30, 45]);
      if (a < 10) continue;
      const w0 = rng.int(3, a - 5);
      const backlog = (w - a) * D * 60, lag = backlog / w, cu = backlog / (a - w0) / 60;
      if (nearHalf(lag, 0, 0.1) || nearHalf(cu, 1, 0.1) || cu < 2) continue;
      const W = Math.max(1, Math.round(cu * (wantMeet ? rng.pick([1.15, 1.3, 1.5]) : rng.pick([0.6, 0.75, 0.85]))));
      if (Math.abs(W - cu) / W < 0.1) continue;
      const meet = cu <= W;
      if (meet !== wantMeet) continue;
      const parts = [
        numPart("backlog", "Backlog", "Changes the replica has not yet applied when the burst ends (MB)", backlog, 0, "The gap between write and apply rates, times the burst length in seconds."),
        numPart("lag", "Lag", "Replica lag at the end of the burst (seconds)", lag, 0, "Backlog divided by the primary's write rate during the burst.", true),
        numPart("catch", "Catch-up time", "Time after the burst for the replica to clear the backlog (minutes)", cu, 1, "The backlog shrinks at the apply rate minus the new, lower write rate. Divide, then convert to minutes."),
        yesNo("meet", "Caught up in time?", `The reporting team needs the replica caught up within **${W} minutes** of the burst ending. Is that met?`, meet, "Compare the catch-up time with the window; equal counts as met."),
      ];
      const ex = `**Backlog:** (${w} − ${a}) MB/s × ${D} × 60 s = **${commas(backlog)} MB**.\n\n**Lag:** ${commas(backlog)} ÷ ${w} = ${f(roundTo(lag, 2))}, about **${Math.round(lag)} s**.\n\n**Catch-up:** the backlog shrinks by ${a} − ${w0} = ${a - w0} MB/s: ${commas(backlog)} ÷ ${a - w0} = ${f(roundTo(backlog / (a - w0), 1))} s = **${f(roundTo(cu, 1))} min**.\n\n**Verdict:** ${f(roundTo(cu, 1))} min is ${meet ? "within" : "over"} ${W} min: **${YN(meet)}**.`;
      return finish(`During a bulk import the primary writes **${w} MB/s** of changes for **${D} minutes**, but its replica can apply only **${a} MB/s**. Replica lag at a moment is the backlog divided by the primary's write rate then. After the burst the primary's writes drop to **${w0} MB/s** and the replica keeps applying at **${a} MB/s**, so the backlog shrinks at the difference. The reporting team needs the replica caught up within **${W} minutes** of the burst ending.`,
        parts, ex, "dba-pr3", { tier, w, a, D, w0, W }, [["_write", w], ["_apply", a], ["_burst", D], ["_after", w0], ["_window", W]],
        ["The backlog builds during the burst and drains afterwards.", "Both rates are in MB per second; the burst is in minutes."]);
    }
    if (tier === "expert-plus") {
      const p = rng.pick([50, 60, 70, 75, 80]), k = rng.pick([2, 3, 4]);
      const qP = (Q * (100 - p)) / 100, qR = (Q * p) / (100 * k);
      const rP = (qP * t) / (10 * u), rR = (qR * t) / (10 * u);
      if (!fracOk(rP) || !fracOk(rR) || rP < 2 || rR < 2) continue;
      const prim = Math.ceil(rP), rep = Math.ceil(rR), total = prim + k * rep;
      const L = wantFit ? Math.ceil(total * rng.pick([1.1, 1.2, 1.35, 1.5])) : Math.floor(total * rng.pick([0.6, 0.7, 0.8, 0.88]));
      if (L < 2 || Math.abs(total - L) / L < 0.08) continue;
      const fit = total <= L;
      const parts = [
        numPart("prim", "Primary pool", "Connections in the primary's pool (round up)", prim, 0, "Primary queries per second times the time each holds a connection gives busy connections; divide by the allowed busy share and round up."),
        numPart("rep", "Replica pool", "Connections in each replica's pool (round up)", rep, 0, "Each replica gets an equal share of the read queries; size its pool the same way."),
        numPart("total", "Cluster total", "Connections across the primary and all replicas", total, 0, "The primary's pool plus every replica's pool."),
        yesNo("fit", "Within the cluster limit?", `The cluster may open at most **${commas(L)} connections** in total. Is the total within it?`, fit, "Compare the total with the limit; equal is within it."),
      ];
      const ex = `**Primary:** ${p}% reads leave ${100 - p}% of ${commas(Q)} = ${f(qP)} queries/s; busy = ${f(qP)} × ${t} ÷ 1000 = ${f(roundTo(qP * t / 1000, 3))}; ÷ ${u}% = ${f(roundTo(rP, 2))}, up to **${prim}**.\n\n**Each replica:** ${p}% of ${commas(Q)} ÷ ${k} = ${f(qR)} queries/s; busy = ${f(roundTo(qR * t / 1000, 3))}; ÷ ${u}% = ${f(roundTo(rR, 2))}, up to **${rep}**.\n\n**Total:** ${prim} + ${k} × ${rep} = **${total}**, ${fit ? "within" : "over"} ${commas(L)}: **${YN(fit)}**.`;
      return finish(`The **${svc}** sends up to **${commas(Q)} queries per second** at peak and each query holds a connection for **${t} ms** on average. **${p}%** of the queries are reads sent equally to **${k} replicas**; the rest go to the primary. Every server's pool is sized so at most **${u}%** of its connections are busy at the peak. The cluster may open at most **${commas(L)} connections** in total.`,
        parts, ex, "dba-pr4", { tier, Q, t, u, p, k, L }, [["_qps", Q], ["_ms", t], ["_busy", u], ["_reads", p], ["_replicas", k], ["_limit", L]],
        ["Split the queries between primary and replicas, then size each pool.", "Busy connections = queries per second × seconds each holds one."]);
    }
    const busy = (Q * t) / 1000, ratio = (Q * t) / (10 * u);
    if (!fracOk(ratio) || ratio < 3 || nearHalf(busy, 1, 0.1)) continue;
    const pool = Math.ceil(ratio);
    const base = `The **${svc}** sends up to **${commas(Q)} queries per second** at peak and each query holds a database connection for **${t} ms** on average. The connection pool is sized so that at most **${u}%** of its connections are busy at the peak.`;
    const given = [["_qps", Q], ["_ms", t], ["_busy", u]];
    const exB = `**Busy connections:** ${commas(Q)} × ${t} ms ÷ 1000 = **${f(roundTo(busy, 1))}**.`;
    const exPool = `**Pool:** ${f(roundTo(busy, 3))} ÷ ${u}% = ${f(roundTo(ratio, 2))}, round up to **${pool}** connections.`;
    const pB = numPart("busy", "Busy connections", "Connections busy at the peak, on average", busy, 1, "Queries per second times the time each holds a connection, in seconds.");
    const pPool = numPart("pool", "Pool size", "Connections the pool needs (round up)", pool, 0, "Busy connections divided by the allowed busy share, rounded up.");
    if (tier === "medium") return finish(base, [pB, pPool], `${exB}\n\n${exPool}`, "dba-pr1", { tier, Q, t, u }, given,
      ["Milliseconds to seconds first.", "The pool must be bigger than the busy count, because only part of it may be busy."]);
    const L = wantFit ? Math.ceil(pool * rng.pick([1.1, 1.2, 1.35, 1.5])) : Math.floor(pool * rng.pick([0.6, 0.7, 0.8, 0.88]));
    if (L < 2 || Math.abs(pool - L) / L < 0.08) continue;
    const fit = pool <= L;
    return finish(`${base} The database server allows this service **${L} connections**.`,
      [pB, pPool, yesNo("fit", "Within the server limit?", `Is the pool within the server's limit of **${L} connections**?`, fit, "Compare the pool size with the limit; equal is within it.")],
      `${exB}\n\n${exPool}\n\n**Limit:** ${pool} is ${fit ? "within" : "over"} ${L}: **${YN(fit)}**.`, "dba-pr2", { tier, Q, t, u, L }, [...given, ["_limit", L]],
      ["Busy connections, then the pool, then the limit.", "The limit applies to the pool, not to the busy count."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "index-scan") return genIndex(rng, difficulty);
  if (subtopic === "sizing") return genSize(rng, difficulty);
  if (subtopic === "backup-recovery") return genBackup(rng, difficulty);
  if (subtopic === "pool-replica") return genPool(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (pages by integer arithmetic, tree height
// by repeated division, rows per page by integer division of bytes, restore time in seconds, backlog summed
// minute by minute, pool size by adding connections one at a time). Numbers are compared with the rounded
// truth; choices exactly.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

const pagesOf = (N, r) => Math.trunc((N + r - 1) / r);
const levels = (N, fo) => { let n = N, h = 0; while (n > 1) { n = Math.trunc((n + fo - 1) / fo); h++; } return h; };
const rowsPer = (Pg, fill, B) => Math.trunc((Pg * fill) / (100 * B));
const bytesGB = (pages, Pg) => (pages * Pg) / 1000 / 1000 / 1000;
const poolFor = (busy, u) => { let k = 1; while ((k * u) / 100 < busy - 1e-9) k++; return k; };
const sumMinutes = (rate, minutes) => { let b = 0; for (let m = 0; m < minutes; m++) b += rate * 60; return b; };
const secsRestore = (gbv, T) => (gbv * 1000) / T;
const planName = (idxWins) => (idxWins ? PLAN_IDX : PLAN_SCAN);

const ALT = {
  "dba-ix1": (p) => ({ pages: pagesOf(p.N, p.r), reads: levels(p.N, p.fo) + p.m }),
  "dba-ix2": (p) => { const P = pagesOf(p.N, p.r), R = levels(p.N, p.fo) + p.m; return { pages: P, reads: R, win: planName(R < P) }; },
  "dba-ix3": (p) => { const P = pagesOf(p.N, p.r), R = levels(p.N, p.fo) + p.m; return { pages: P, reads: R, idxms: R * p.rr, win: planName(R * p.rr < P * p.s) }; },
  "dba-ix4": (p) => {
    const P = pagesOf(p.N, p.r), h = levels(p.N, p.fo);
    let mx = 0; while (h + mx + 1 < P) mx++;
    return { pages: P, height: h, maxm: mx, win: planName(h + p.m < P) };
  },
  "dba-sz1": (p) => { const rp = rowsPer(p.Pg, p.fill, p.B); return { rpp: rp, pages: pagesOf(p.N, rp) }; },
  "dba-sz2": (p) => { const rp = rowsPer(p.Pg, p.fill, p.B), pg = pagesOf(p.N, rp); return { rpp: rp, pages: pg, tbl: bytesGB(pg, p.Pg) }; },
  "dba-sz3": (p) => {
    const rp = rowsPer(p.Pg, p.fill, p.B), pg = pagesOf(p.N, rp), ip = pagesOf(p.N, rowsPer(p.Pg, p.fill, p.e));
    return { rpp: rp, tbl: bytesGB(pg, p.Pg), idx: bytesGB(ip, p.Pg), total: bytesGB(pg, p.Pg) + bytesGB(ip, p.Pg) };
  },
  "dba-sz4": (p) => {
    const pg = pagesOf(p.N, rowsPer(p.Pg, p.fill, p.B)), i1 = pagesOf(p.N, rowsPer(p.Pg, p.fill, p.e)), i2 = pagesOf(p.N, rowsPer(p.Pg, p.fill, p.e2));
    const tot = bytesGB(pg + i1 + i2, p.Pg);
    return { n2: p.N, tbl: bytesGB(pg, p.Pg), total: tot, fit: YN(tot <= p.Q) };
  },
  "dba-bk1": (p) => { const ch = p.S + p.k * ((p.S * p.d) / 100); return { chain: ch, rest: secsRestore(ch, p.T) / 60 }; },
  "dba-bk2": (p) => { const ch = p.S + p.k * ((p.S * p.d) / 100), s = secsRestore(ch, p.T); return { chain: ch, rest: s / 60, meet: YN(s <= p.L * 60) }; },
  "dba-bk3": (p) => {
    const ch = p.S + p.k * ((p.S * p.d) / 100), rs = secsRestore(ch, p.T), lg = p.g * p.hl, rpSecs = (lg / p.q) * 3600;
    return { rest: rs / 60, log: lg, total: (rs + rpSecs) / 60, meet: YN(rs + rpSecs <= p.L * 60) };
  },
  "dba-bk4": (p) => {
    const inc = (p.S * p.d) / 100, sA = p.S + inc * 6, sB = p.S * 7, tA = secsRestore(sA, p.T), tB = secsRestore(p.S, p.T);
    const pick = tA <= p.L * 60 ? "Weekly full + daily incrementals" : tB <= p.L * 60 ? "Daily full backups" : "Neither";
    return { sta: sA, stb: sB, ra: tA / 60, pick };
  },
  "dba-pr1": (p) => { const b = p.Q * (p.t / 1000); return { busy: b, pool: poolFor(b, p.u) }; },
  "dba-pr2": (p) => { const b = p.Q * (p.t / 1000), pl = poolFor(b, p.u); return { busy: b, pool: pl, fit: YN(pl <= p.L) }; },
  "dba-pr3": (p) => {
    const back = sumMinutes(p.w - p.a, p.D), catchSecs = back / (p.a - p.w0);
    return { backlog: back, lag: back / p.w, catch: catchSecs / 60, meet: YN(catchSecs / 60 <= p.W) };
  },
  "dba-pr4": (p) => {
    const reads = (p.Q * p.p) / 100, prim = poolFor(((p.Q - reads) * p.t) / 1000, p.u), rep = poolFor(((reads / p.k) * p.t) / 1000, p.u);
    const tot = prim + p.k * rep;
    return { prim, rep, total: tot, fit: YN(tot <= p.L) };
  },
};

const dpOf = (part) => (part.tolerance === 0 ? 0 : Math.round(-Math.log10(part.tolerance * 2)));

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object") return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined || tv === null) return false;
    if (part.answerType === "number") {
      const dp = dpOf(part);
      if (!near(partNum(answer, part.id), roundTo(tv, dp), tolOf(dp))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
