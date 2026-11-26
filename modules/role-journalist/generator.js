// Journalist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls), and verify() recomputes every part by another route. Inputs are drawn so
// chained answers are stable when worked from the stated rounded answers, no answer sits on a rounding
// half-step, and verdict parts are decided first and then fitted (clear of their thresholds). All places,
// firms and figures are made up, people are named by job only, and every rule (the margin-of-error rule,
// the "clear lead" and "fair headline" tests, page sizes, time zones) is an exercise rule stated in the
// prompt, not a professional standard.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   claim-check         % change; hard: rate per 100 000 and rate change; expert: is the headline fair;
//                       expert-plus: rate change, points vs relative change, which headline is accurate
//   poll-margin         margin of error (100 / sqrt n), clear lead; expert: poll size for a target margin;
//                       expert-plus: two polls, is the change real
//   page-budget         space, words to cut; hard: reading time; expert: newsroom time; expert-plus: two
//                       stories, equal cut each, latest local filing time
//   misleading-average  mean, median; hard: how many below the mean; expert: which figure the release used;
//                       expert-plus: mean without the top salary, does the mean overstate the median

import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const nearHalf = (n, d, margin = 0.05) => {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
};
const f = (n) => String(+Number(n).toFixed(6));
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value: +Number(value).toFixed(6) }));
const tolOf = (dp) => (dp === 0 ? 0 : Number((0.5 * 10 ** -dp).toFixed(dp + 1)));
const dpWord = (dp, rnd) => (dp === 0 ? (rnd ? ", to the nearest whole number" : "") : dp === 1 ? ", to 1 decimal place" : `, to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-journalist: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const sum = (a) => a.reduce((s, x) => s + x, 0);
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const AREAS = ["Ashwick", "Eastmere", "Dunbarrow", "Kelston", "Orrinford", "Thornley Vale", "Wexmoor", "Highcombe"];
const UTC_OFFSETS = [-8, -5, -4, -3, 0, 1, 2, 3, 4, 5.5, 8, 9.5];
const utcLabel = (o) => {
  const a = Math.abs(o), h = Math.floor(a), m = Math.round((a - h) * 60);
  return `UTC${o < 0 ? "−" : "+"}${h}${m ? `:${pad2(m)}` : ""}`;
};

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function timePart(id, label, ask, mins, hint) {
  const t = hhmm(mins);
  const accepts = [];
  if (t.startsWith("0")) accepts.push(t.slice(1));
  accepts.push(t.replace(":", "."));
  return { id, label, ask: `${ask} (24-hour, HH:MM)`, answerType: "text", answer: t, accepts, fuzzy: false, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}
const pctChange = (a, b) => ((b - a) / a) * 100;
const sgn = (x) => `${x < 0 ? "−" : ""}${f(Math.abs(x))}`;

// ---------- claim-check ----------

const ITEMS = ["noise complaints", "pothole reports", "fly-tipping reports", "graffiti reports", "stray-animal reports"];
const rate1 = (x, p) => (x * 100000) / p;

function genClaim(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const area = rng.pick(AREAS), item = rng.pick(ITEMS);
    const x1 = rng.int(60, 900), dir = rng.next() < 0.75 ? 1 : -1;
    const x2 = Math.round(x1 * (1 + (dir * rng.int(6, 60)) / 100));
    const pct = pctChange(x1, x2);
    if (Math.abs(pct) < 4 || nearHalf(pct, 1, 0.08) || nearHalf(pct, 0, 0.12)) continue;
    const word = pct > 0 ? "up" : "down";
    const K = Math.round(Math.abs(pct));
    const base = `A press release from the **${area} council** says that **${item}** went from **${x1}** last year to **${x2}** this year.`;
    const given = [["_before", x1], ["_after", x2]];
    const exP = `**Change:** (${x2} − ${x1}) ÷ ${x1} × 100 = **${sgn(roundTo(pct, 1))}%**.`;
    const pP = numPart("pct", "Change in the count", `Percentage change in the number of ${item} (give a fall as a negative number)`, pct, 1, "New minus old, divided by the old figure, as a percentage.");
    if (tier === "medium") {
      const right = wantYes;
      const H = right ? K : K + rng.int(4, 15);
      const pR = yesNo("right", "Headline right?", `Is the headline's figure correct to the nearest whole percent?`, right, "Round your percentage change to a whole number and compare it with the headline.");
      return finish(`${base} The headline says "${item} ${word} ${H}%".`, [pP, pR],
        `${exP}\n\n**Headline:** to the nearest whole percent the change is ${word} ${K}%, so "${word} ${H}%" is **${YN(right)}**.`, "jr-cl1", { tier, x1, x2, H }, [...given, ["_headline", H]],
        ["Percentage change always divides by the old figure.", "Round to a whole percent before comparing with the headline."]);
    }
    const p1 = rng.int(20, 250) * 1000, g = rng.int(-3, 14);
    const p2 = Math.round((p1 * (1 + g / 100)) / 100) * 100;
    const r1 = rate1(x1, p1), r2 = rate1(x2, p2), rc = pctChange(r1, r2);
    if (nearHalf(r2, 1, 0.08) || nearHalf(rc, 0, 0.12) || Math.abs(rc) < 1) continue;
    const a1 = roundTo(r1, 1), a2 = roundTo(r2, 1);
    if (roundTo(pctChange(a1, a2), 0) !== roundTo(rc, 0)) continue;
    const R = roundTo(rc, 0);
    const popTxt = ` The population was **${commas(p1)}** last year and **${commas(p2)}** this year.`;
    const gv = [...given, ["_pop1", p1], ["_pop2", p2]];
    const exR = `**Rate this year:** ${x2} ÷ ${commas(p2)} × 100 000 = **${f(a2)}** (last year ${f(a1)}).`;
    const exC = `(${f(a2)} − ${f(a1)}) ÷ ${f(a1)} × 100 = **${sgn(R)}%**.`;
    const pRt = numPart("rate", "Rate this year", `${item[0].toUpperCase()}${item.slice(1)} per 100 000 residents this year`, r2, 1, "Count divided by the population, times 100 000.");
    const pRc = numPart("ratechg", "Change in the rate", "Percentage change in the rate per 100 000 residents, using the two rates to 1 decimal place (a fall is negative)", rc, 0, "Work out last year's rate the same way, then new rate against old rate.", true);
    if (tier === "hard") {
      return finish(`${base}${popTxt}`, [pP, pRt, pRc], `${exP}\n\n${exR}\n\n**Change in the rate:** ${exC}`, "jr-cl2", { tier, x1, x2, p1, p2 }, gv,
        ["The count change ignores population; the rate does not.", "Compute both rates before comparing them."]);
    }
    if (tier === "expert") {
      const Ks = pct > 0 ? K : -K;
      const fair = Math.abs(Ks - R) <= 3;
      if (fair !== wantYes) continue;
      const pF = yesNo("fair", "Headline fair?", `For this exercise a headline counts as **fair** if its figure (whole percent, a fall negative) is within **3 percentage points** of the change in the rate you found. Is the headline fair?`, fair, "Compare the headline's whole-number change with your rounded rate change; a gap of exactly 3 points still counts as fair.");
      return finish(`${base} The headline says "${item} ${word} ${K}%".${popTxt}`, [pP, pRt, pRc, pF],
        `${exP}\n\n${exR}\n\n**Change in the rate:** ${exC}\n\n**Fair?** headline ${sgn(Ks)}% against rate change ${sgn(R)}%: gap ${Math.abs(Ks - R)} points, **${YN(fair)}**.`,
        "jr-cl3", { tier, x1, x2, p1, p2, K: Ks }, [...gv, ["_headline", Ks]],
        ["The count change is the headline figure; the rate change adjusts for population.", "Subtract the two whole numbers and compare the size of the gap with 3."]);
    }
    // expert-plus: rate change, then resolution rate in points vs relative, then which headline is accurate
    const s1 = rng.int(25, 70), s2 = s1 + (rng.next() < 0.6 ? 1 : -1) * rng.int(3, 14);
    if (s2 < 8 || s2 > 92) continue;
    const pp = s2 - s1, rel = (pp / s1) * 100, P = Math.abs(pp), Q = Math.round(Math.abs(rel));
    if (nearHalf(rel, 1, 0.08) || nearHalf(rel, 0, 0.12) || Math.abs(Q - P) < 2) continue;
    const dirw = pp > 0 ? "up" : "down";
    const good = `Resolution rate ${dirw} ${P} percentage points`;
    const choices = shuffled(rng, [good, `Resolution rate ${dirw} ${Q} percentage points`, `Resolution rate ${dirw} ${P}%`]);
    const parts = [
      pRc,
      numPart("pp", "Change in points", "Change in the resolution rate in percentage points (a fall is negative)", pp, 0, "Later percentage minus earlier percentage; no division."),
      numPart("rel", "Relative change", "Relative percentage change in the resolution rate (a fall is negative)", rel, 1, "The change in points, divided by the earlier percentage."),
      { id: "headline", label: "Accurate headline", ask: "Which headline is accurate? (\"points\" means percentage points, \"%\" means relative change; whole numbers)", answerType: "choice", answer: good, choices, hint: "Match each headline's unit to the change you worked out in that unit, rounded to a whole number." },
    ];
    const ex = `**Rate change:** ${exC}\n\n**Points:** ${s2} − ${s1} = **${sgn(pp)}**.\n\n**Relative:** ${sgn(pp)} ÷ ${s1} × 100 = **${sgn(roundTo(rel, 1))}%**.\n\n**Headline:** the points change is ${P} and the relative change rounds to ${Q}%, so **${good}**.`;
    return finish(`${base}${popTxt} The council also says it **resolved** **${s1}%** of these reports within a week last year and **${s2}%** this year.`, parts, ex,
      "jr-cl4", { tier, x1, x2, p1, p2, s1, s2 }, [...gv, ["_res1", s1], ["_res2", s2]],
      ["Rate first: both years per 100 000, then compare.", "A change in points is a plain difference; a relative change divides it by the starting percentage."]);
  }
  return tooMany();
}

// ---------- poll-margin ----------

const MOE = { 100: 10, 256: 6.25, 400: 5, 625: 4, 1600: 2.5, 2500: 2, 10000: 1 };
const SIZES = Object.keys(MOE).map(Number);
const pollRule = "Rules for this exercise: the **margin of error** in percentage points is **100 ÷ √n** for a poll of n people";

function genPoll(rng, tier) {
  const wantYes = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const area = rng.pick(AREAS), n = rng.pick(SIZES), moe = MOE[n];
    if (tier === "expert-plus") {
      const n2 = rng.pick(SIZES);
      if (n2 === n) continue;
      const moe2 = MOE[n2], comb = moe + moe2, a1 = rng.int(25, 60), sign = rng.next() < 0.5 ? 1 : -1;
      const mag = wantYes ? Math.floor(comb) + rng.int(1, 5) : Math.max(1, Math.floor(comb) - rng.int(1, 4));
      const a2 = a1 + sign * mag, ch = a2 - a1;
      if (a2 < 12 || a2 > 75 || Math.abs(Math.abs(ch) - comb) < 1 || (Math.abs(ch) > comb) !== wantYes) continue;
      const real = Math.abs(ch) > comb;
      const parts = [
        numPart("moe2", "Margin, second poll", "Margin of error of the second poll (percentage points)", moe2, 2, "100 divided by the square root of that poll's sample size."),
        numPart("change", "Change in support", "Change in Plan Red's share between the polls in percentage points (a fall is negative)", ch, 0, "Second poll's share minus the first poll's share."),
        numPart("comb", "Combined margin", "The two margins of error added together (percentage points)", comb, 2, "Work out the first poll's margin the same way, then add."),
        yesNo("real", "Real change?", "For this exercise a change in support is **real** only if its size is **more than** the two margins added together. Is the change real?", real, "Compare the size of the change (ignore its sign) with the combined margin."),
      ];
      return finish(`A town-vote poll in **${area}** asked **${commas(n)}** people last month and **${commas(n2)}** people this month. ${pollRule}. Plan Red's share was **${a1}%** last month and **${a2}%** this month.`, parts,
        `**Margins:** 100 ÷ √${n} = ${f(moe)} and 100 ÷ √${n2} = **${f(moe2)}**.\n\n**Change:** ${a2} − ${a1} = **${sgn(ch)}** points.\n\n**Combined:** ${f(moe)} + ${f(moe2)} = **${f(comb)}**.\n\n**Real?** ${Math.abs(ch)} ${real ? "is more than" : "is not more than"} ${f(comb)}: **${YN(real)}**.`,
        "jr-po4", { tier, n, n2, a1, a2 }, [["_n1", n], ["_n2", n2], ["_red1", a1], ["_red2", a2]],
        ["Each poll has its own margin; the second one is asked for, the first is needed for the total.", "Use the size of the change, whatever its sign, and compare with the combined margin."]);
    }
    const a = rng.int(34, 56), lead = wantYes ? Math.ceil(2 * moe) + rng.int(1, 6) : Math.max(1, Math.floor(2 * moe) - rng.int(1, 5)), b = a - lead;
    if (b < 18 || a + b > 98 || Math.abs(lead - 2 * moe) < 1 || (lead > 2 * moe) !== wantYes) continue;
    const clear = lead > 2 * moe;
    const base = `A pollster asked **${commas(n)}** people in **${area}** how they will vote in a town vote: **${a}%** back Plan Red and **${b}%** back Plan Blue (the rest are undecided). ${pollRule}, and a lead is **clear** only if it is **more than twice** the margin of error.`;
    const given = [["_n", n], ["_red", a], ["_blue", b]];
    const pM = numPart("moe", "Margin of error", "Margin of error of the poll (percentage points)", moe, 2, "100 divided by the square root of the sample size.");
    const pL = numPart("lead", "Lead", "Plan Red's lead over Plan Blue in percentage points", lead, 0, "The difference between the two shares.");
    const pC = yesNo("clear", "Clear lead?", "Is Plan Red's lead clear under the rule above?", clear, "Double the margin of error and compare it with the lead; equal would not be clear.");
    const exM = `**Margin:** 100 ÷ √${n} = **${f(moe)}** points.`;
    const exL = `**Lead:** ${a} − ${b} = **${lead}** points.`;
    const exC = `**Clear?** twice the margin is ${f(2 * moe)}; the lead ${lead} ${clear ? "is more than that" : "is not more than that"}: **${YN(clear)}**.`;
    if (tier === "medium") return finish(base, [pM, pC], `${exM}\n\n${exL}\n\n${exC}`, "jr-po1", { tier, n, a, b }, given,
      ["Margin first, then the lead between the two shares.", "A lead is clear only if it beats twice the margin."]);
    if (tier === "hard") return finish(base, [pL, pM, pC], `${exL}\n\n${exM}\n\n${exC}`, "jr-po2", { tier, n, a, b }, given,
      ["The lead is a gap in points; the margin comes from the sample size.", "Compare the lead with double the margin."]);
    const T = roundTo(moe * rng.pick([0.5, 0.6, 0.7, 0.8]), 1);
    if (T < 1 || T >= moe) continue;
    const t10 = Math.round(T * 10), exact = 1e6 / (t10 * t10), need = Math.ceil(exact - 1e-9), fr = exact - Math.floor(exact);
    if (fr > 1e-9 && (fr < 0.02 || fr > 0.98)) continue;
    const extra = need - n;
    if (extra < 20) continue;
    const parts = [
      pM, pC,
      numPart("need", "Poll size needed", `The editor wants a margin of error of no more than **${f(T)}** points. Smallest number of people to ask (round up to a whole person)`, need, 0, "Rearrange the margin rule to get n, then round up so the margin is no bigger than the target."),
      numPart("extra", "Extra people", "How many more people than this poll must be asked", extra, 0, "Needed size minus the size of this poll."),
    ];
    return finish(base, parts, `${exM}\n\n${exC}\n\n**Poll size:** n = (100 ÷ ${f(T)})² = ${f(roundTo(exact, 2))}, rounded up to **${need}**.\n\n**Extra:** ${need} − ${n} = **${extra}**.`,
      "jr-po3", { tier, n, a, b, T }, [...given, ["_target", T]],
      ["Margin and lead as before; then turn the margin rule round to find n.", "Rounding up keeps the margin at or below the target."]);
  }
  return tooMany();
}

// ---------- page-budget ----------

function genPage(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const C = rng.int(3, 6), W = rng.pick([180, 200, 220, 240, 250, 260, 280]), R = rng.pick([80, 100, 120, 140, 150, 180, 200]);
    const K = rng.pick(UTC_OFFSETS), N = rng.pick(UTC_OFFSETS), diff = Math.round((N - K) * 60);
    if (Math.abs(diff) < 60) continue;
    if (tier === "expert-plus") {
      const Q = rng.pick([60, 80, 100, 120]), space = C * W - R - Q, la = rng.int(500, 1100), lb = rng.int(500, 1100);
      const total = la + lb - space;
      if (total < 40 || total > 500) continue;
      const each = Math.ceil(total / 2);
      if (each >= la || each >= lb) continue;
      const D = rng.int(15 * 12, 22 * 12) * 5, latest = D - diff;
      if (latest < 0 || latest > 1439) continue;
      const parts = [
        numPart("space", "Space for text", "Words of story text the page can hold (whole words)", space, 0, "Columns times words per column, less everything else that takes room."),
        numPart("cut", "Total to cut", "Total words that must be cut from the two stories together", total, 0, "The two lengths added together, less the space for text."),
        numPart("each", "Cut from each", "Words cut from **each** story if the same number is cut from both, enough in total (round up)", each, 0, "Split the total between the two stories, rounding up to a whole word."),
        timePart("latest", "Latest filing time", "Latest local time the correspondent can file to meet the deadline", latest, "Move the newsroom deadline back by the difference between the newsroom offset and the local offset."),
      ];
      return finish(`A newspaper page has **${C} columns**, each holding **${W} words**. The headline, byline and picture credits take **${R} words**, and a pull-quote box takes **${Q} words**. Two stories must fit in what is left: one of **${commas(la)} words** and one of **${commas(lb)} words**. The page is locked at **${hhmm(D)}** newsroom time (**${utcLabel(N)}**), and the correspondent works in **${utcLabel(K)}**.`, parts,
        `**Space:** ${C} × ${W} − ${R} − ${Q} = **${space}** words.\n\n**Cut:** ${la} + ${lb} − ${space} = **${total}**.\n\n**Each:** ${total} ÷ 2 rounded up = **${each}**.\n\n**Latest local time:** ${hhmm(D)} ${diff >= 0 ? "−" : "+"} ${f(Math.abs(diff) / 60)} h = **${hhmm(latest)}**.`,
        "jr-pg4", { tier, C, W, R, Q, la, lb, K, N, D }, [["_cols", C], ["_words", W], ["_reserved", R], ["_quote", Q], ["_storya", la], ["_storyb", lb]],
        ["Text space is the whole page's words less the headline and the quote box.", "A later newsroom zone means local time is earlier than the deadline by the zone difference."]);
    }
    const space = C * W - R, cut = rng.int(40, 260), L = space + cut;
    const base = `A newspaper page has **${C} columns**, each holding **${W} words**. The headline, byline and picture credits take **${R} words** of that space, and a story of **${commas(L)} words** has to fit in what is left.`;
    const given = [["_cols", C], ["_words", W], ["_reserved", R], ["_length", L]];
    const pS = numPart("space", "Space for text", "Words of story text the page can hold (whole words)", space, 0, "Columns times words per column, less the words taken by the headline and credits.");
    const pC = numPart("cut", "Words to cut", "Words that must be cut from the story (whole words)", cut, 0, "The story's length less the space available.");
    const exS = `**Space:** ${C} × ${W} − ${R} = **${space}** words.`;
    const exC = `**Cut:** ${commas(L)} − ${space} = **${cut}** words.`;
    if (tier === "medium") return finish(base, [pS, pC], `${exS}\n\n${exC}`, "jr-pg1", { tier, C, W, R, L }, given,
      ["Total words on the page first, then take away the fixed items.", "The cut is whatever the story is over by."]);
    const wpm = rng.pick([180, 200, 220, 240, 250, 260]), rt = space / wpm;
    if (nearHalf(rt, 1, 0.08)) continue;
    const pT = numPart("read", "Reading time", `Reading time of the trimmed story at **${wpm} words a minute** (minutes)`, rt, 1, "The trimmed story is exactly as long as the space; divide that by the reading speed.");
    const exT = `**Reading time:** the trimmed story is ${space} words, ${space} ÷ ${wpm} = **${f(roundTo(rt, 1))}** minutes.`;
    if (tier === "hard") return finish(base, [pS, pC, pT], `${exS}\n\n${exC}\n\n${exT}`, "jr-pg2", { tier, C, W, R, L, wpm }, [...given, ["_wpm", wpm]],
      ["Space, then cut; the trimmed story fills the space exactly.", "Reading time uses the trimmed length, not the original."]);
    const local = rng.int(9 * 12, 17 * 12) * 5, news = local + diff;
    if (news < 0 || news > 1439) continue;
    const pN = timePart("news", "Newsroom time", `The correspondent (${utcLabel(K)}) files the story at **${hhmm(local)}** local time. What time is it then in the newsroom (${utcLabel(N)})?`, news, "Add the difference between the newsroom offset and the local offset to the local time.");
    return finish(base, [pS, pC, pT, pN], `${exS}\n\n${exC}\n\n${exT}\n\n**Newsroom time:** ${hhmm(local)} ${diff >= 0 ? "+" : "−"} ${f(Math.abs(diff) / 60)} h = **${hhmm(news)}**.`,
      "jr-pg3", { tier, C, W, R, L, wpm, K, N, local }, [...given, ["_wpm", wpm]],
      ["Do the page sums first; the time zone part is separate.", "Zones ahead of UTC are later in the day than zones behind it."]);
  }
  return tooMany();
}

// ---------- misleading-average ----------

const kfmt = (v) => `$${v}k`;
const FIRMS = ["Harbourline Ltd", "Northfield Foods", "Brightmoor Textiles", "Castell Logistics", "Pennywell Print Works"];

function genAvg(rng, tier) {
  const wantYes = rng.next() < 0.5, headMean = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const n = tier === "medium" ? 5 : tier === "hard" ? rng.pick([5, 7]) : 7;
    const lo = rng.int(24, 45), typical = [];
    for (let q = 0; q < n - 1; q++) typical.push(lo + rng.int(0, 22));
    const top = Math.round(Math.max(...typical) * rng.pick([2.2, 2.6, 3, 3.5, 4]));
    const vals = shuffled(rng, [...typical, top]);
    const total = sum(vals), mean = total / n, srt = vals.slice().sort((x, y) => x - y), median = srt[(n - 1) / 2];
    if (mean - median < 3 || nearHalf(mean, 1, 0.08) || vals.some((v) => Math.abs(v - mean) < 0.25)) continue;
    const below = vals.filter((v) => v < mean).length;
    const firm = rng.pick(FIRMS);
    const base = `A staff list at **${firm}** shows these yearly salaries: ${vals.map(kfmt).join(", ")}.`;
    const given = vals.map((v, q) => [`_s${q + 1}`, v]);
    const m1 = roundTo(mean, 1);
    const pMean = numPart("mean", "Mean", "Mean salary (in $ thousands)", mean, 1, "Add all the salaries, then divide by how many there are.");
    const pMed = numPart("median", "Median", "Median salary (in $ thousands, whole number)", median, 0, "Put the salaries in order and take the middle one.");
    const exMean = `**Mean:** ${total} ÷ ${n} = **${f(m1)}** ($${f(m1)}k).`;
    const exMed = `**Median:** in order ${srt.join(", ")}; the middle one is **${median}**.`;
    if (tier === "medium") return finish(base, [pMean, pMed], `${exMean}\n\n${exMed}`, "jr-av1", { tier, vals }, given,
      ["Mean uses every value; median uses only the middle one.", "Sort the list before picking the median."]);
    const pB = numPart("below", "Below the mean", "How many of the salaries are below the mean", below, 0, "Compare each salary with the mean and count the lower ones.");
    const exB = `**Below the mean:** ${vals.filter((v) => v < mean).sort((x, y) => x - y).join(", ")} are under ${f(m1)}, so **${below}**.`;
    if (tier === "hard") return finish(base, [pMean, pMed, pB], `${exMean}\n\n${exMed}\n\n${exB}`, "jr-av2", { tier, vals }, given,
      ["Mean and median first; the count needs the mean.", "Count salaries that are strictly lower than the mean."]);
    if (tier === "expert") {
      const head = headMean ? m1 : median;
      const pW = { id: "which", label: "Release used", ask: `Which figure is the quoted average of **$${f(head)}k**?`, answerType: "choice", answer: headMean ? "Mean" : "Median", choices: ["Mean", "Median"], hint: "Compare the quoted figure with the mean and the median you found." };
      return finish(`${base} The press release says "the average salary is $${f(head)}k".`, [pMean, pMed, pB, pW], `${exMean}\n\n${exMed}\n\n${exB}\n\n**Release:** $${f(head)}k is the **${headMean ? "mean" : "median"}**.`,
        "jr-av3", { tier, vals, head }, [...given, ["_quoted", head]],
        ["The two figures differ clearly, so only one can match.", "A single very high salary pulls the mean up, not the median."]);
    }
    const without = (total - top) / (n - 1), w1 = roundTo(without, 1);
    if (nearHalf(without, 1, 0.08)) continue;
    const gap = ((mean - median) / median) * 100;
    const R = [10, 15, 20, 25, 30, 40, 50][rng.int(0, 6)];
    if (Math.abs(gap - R) < 3 || gap > R !== wantYes) continue;
    const over = gap > R;
    const pW = numPart("without", "Mean without the top salary", "Mean salary if the highest salary is left out (in $ thousands)", without, 1, "Remove the highest value, then divide the new total by one fewer people.");
    const pO = yesNo("over", "Overstates?", `For this exercise the quoted mean **overstates** the typical salary if it is more than **${R}%** above the median. Does it?`, over, "(Mean − median) ÷ median × 100, compared with the stated percentage.");
    return finish(`${base} The press release says "the average salary is $${f(m1)}k", counting the highest salary, which belongs to the director.`,
      [pMean, pMed, pW, pO],
      `${exMean}\n\n${exMed}\n\n**Without the top salary:** (${total} − ${top}) ÷ ${n - 1} = **${f(w1)}**.\n\n**Overstates?** (${f(m1)} − ${median}) ÷ ${median} × 100 = ${f(roundTo(gap, 1))}%, ${over ? "more" : "not more"} than ${R}%: **${YN(over)}**.`,
      "jr-av4", { tier, vals, R }, [...given, ["_limit", R]],
      ["Mean, then median; the third figure drops the biggest value.", "Measure the gap between mean and median as a share of the median."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "claim-check") return genClaim(rng, difficulty);
  if (subtopic === "poll-margin") return genPoll(rng, difficulty);
  if (subtopic === "page-budget") return genPage(rng, difficulty);
  if (subtopic === "misleading-average") return genAvg(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (ratios instead of differences,
// the margin by square root and the poll size by counting up, page space column by column, zones through
// UTC, means by running totals, medians by sorting and counting). Numbers are compared with the rounded
// truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const normTime = (s) => String(s).trim().replace(".", ":").replace(/^(\d):/, "0$1:");

const relChange = (a, b) => (b / a - 1) * 100;
const moeOf = (n) => 100 * Math.sqrt(1 / n);
const needBy = (T) => { let n = 1; while (moeOf(n) > T + 1e-9) n++; return n; };
const spaceBy = (C, W, deduct) => { let s = 0; for (let c = 0; c < C; c++) s += W; return s - deduct; };
const toUtc = (local, K) => local - Math.round(K * 60);
const fromUtc = (utc, N) => utc + Math.round(N * 60);
const meanOf = (a) => { let s = 0, k = 0; for (const x of a) { s += x; k++; } return s / k; };
const medianOf = (a) => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ratesRounded = (p) => [roundTo(rate1(p.x1, p.p1), 1), roundTo(rate1(p.x2, p.p2), 1)];

const ALT = {
  "jr-cl1": (p) => ({ pct: relChange(p.x1, p.x2), right: YN(Math.round(Math.abs(relChange(p.x1, p.x2))) === p.H) }),
  "jr-cl2": (p) => { const [r1, r2] = ratesRounded(p); return { pct: relChange(p.x1, p.x2), rate: rate1(p.x2, p.p2), ratechg: relChange(r1, r2) }; },
  "jr-cl3": (p) => {
    const [r1, r2] = ratesRounded(p), R = roundTo(relChange(r1, r2), 0);
    return { pct: relChange(p.x1, p.x2), rate: rate1(p.x2, p.p2), ratechg: relChange(r1, r2), fair: YN(Math.abs(p.K - R) <= 3) };
  },
  "jr-cl4": (p) => {
    const [r1, r2] = ratesRounded(p), d = p.s2 > p.s1 ? "up" : "down";
    return { ratechg: relChange(r1, r2), pp: p.s2 - p.s1, rel: relChange(p.s1, p.s2), headline: `Resolution rate ${d} ${Math.abs(p.s2 - p.s1)} percentage points` };
  },
  "jr-po1": (p) => { const m = moeOf(p.n); return { moe: m, clear: YN(p.a - p.b > 2 * m) }; },
  "jr-po2": (p) => { const m = moeOf(p.n); return { lead: p.a - p.b, moe: m, clear: YN(p.a - p.b > m + m) }; },
  "jr-po3": (p) => { const m = moeOf(p.n), need = needBy(p.T); return { moe: m, clear: YN(p.a - p.b > 2 * m), need, extra: need - p.n }; },
  "jr-po4": (p) => {
    const m1 = moeOf(p.n), m2 = moeOf(p.n2), ch = p.a2 - p.a1;
    return { moe2: m2, change: ch, comb: m1 + m2, real: YN(Math.abs(ch) > m1 + m2) };
  },
  "jr-pg1": (p) => { const s = spaceBy(p.C, p.W, p.R); return { space: s, cut: p.L - s }; },
  "jr-pg2": (p) => { const s = spaceBy(p.C, p.W, p.R); return { space: s, cut: p.L - s, read: (p.L - (p.L - s)) / p.wpm }; },
  "jr-pg3": (p) => {
    const s = spaceBy(p.C, p.W, p.R);
    return { space: s, cut: p.L - s, read: (p.L - (p.L - s)) / p.wpm, news: hhmm(fromUtc(toUtc(p.local, p.K), p.N)) };
  },
  "jr-pg4": (p) => {
    const s = spaceBy(p.C, p.W, p.R + p.Q), tot = p.la + p.lb - s;
    let each = 0; while (each * 2 < tot) each++;
    return { space: s, cut: tot, each, latest: hhmm(fromUtc(toUtc(p.D, p.N), p.K)) };
  },
  "jr-av1": (p) => ({ mean: meanOf(p.vals), median: medianOf(p.vals) }),
  "jr-av2": (p) => { const m = meanOf(p.vals); return { mean: m, median: medianOf(p.vals), below: p.vals.reduce((c, v) => c + (v < m ? 1 : 0), 0) }; },
  "jr-av3": (p) => {
    const m = meanOf(p.vals), md = medianOf(p.vals);
    return { mean: m, median: md, below: p.vals.reduce((c, v) => c + (v < m ? 1 : 0), 0), which: Math.abs(p.head - roundTo(m, 1)) < 1e-9 ? "Mean" : Math.abs(p.head - md) < 1e-9 ? "Median" : "?" };
  },
  "jr-av4": (p) => {
    const m = meanOf(p.vals), md = medianOf(p.vals), rest = p.vals.slice();
    rest.splice(rest.indexOf(Math.max(...p.vals)), 1);
    return { mean: m, median: md, without: meanOf(rest), over: YN(m - md > (p.R / 100) * md) };
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
    } else if (part.answerType === "text") {
      if (normTime(partStr(answer, part.id)) !== tv) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
