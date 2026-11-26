// Frontend Engineer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario. Hints and explanations use only values already drawn (no rng calls),
// and verify() recomputes every part by another route. Inputs are drawn so each chained answer is exact (or a
// rounded earlier answer would not change a later one), no answer sits on a rounding half-step, and decisions
// (Yes/No, a choice) are decided first and then fitted, clear of their thresholds. All figures are made up and
// every rule (1 rem, 1 MB = 1000 KB, 4.5 : 1, frame budget) is an exercise rule stated in each prompt.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   responsive-layout  container % of window -> card width (rem x root px) -> cards per row (round down);
//                      expert: rows needed; expert-plus: grid columns + gutters, a panel's span in px and rem, fit
//   page-weight        images + scripts -> load time on a Mbps link; hard/expert: compression %, budget verdict;
//                      expert-plus: first visit vs repeat visit with caching
//   frame-budget       1000 / fps -> list items per frame; expert: virtualised window and its frame time;
//                      expert-plus: scroll height and speed-up against drawing every row
//   colour-contrast    (L1 + 0.05) / (L2 + 0.05) -> 4.5 : 1 verdict; expert: lightest passing shade from a list;
//                      expert-plus: a dark overlay on a photo and the least opacity that passes

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
const tooMany = () => { throw new Error("role-frontend-engineer: no suitable draw"); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shuffled = (rng, arr) => rng.shuffle(arr.slice());
const YN = (b) => (b ? "Yes" : "No");
const fracOk = (r) => { const fr = r - Math.floor(r); return r > 1 && fr > 0.08 && fr < 0.92; };

function numPart(id, label, ask, val, dp, hint, rnd = false) {
  const p = { id, label, ask: `${ask}${dpWord(dp, rnd)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: YN(ok), choices: ["Yes", "No"], hint });
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- responsive-layout ----------

const WINDOWS = [360, 390, 600, 640, 768, 800, 1000, 1024, 1100, 1200, 1280, 1400, 1600];
const SHARES = [60, 65, 70, 75, 80, 85, 90, 95];
const CARD_REMS = [10, 12, 14, 15, 16, 18, 20, 22, 24, 25];
const GAPS = [8, 10, 12, 16, 20, 24, 32];
const ITEMS = ["product cards", "photo tiles", "article previews", "pricing cards", "team profiles"];
const rootRule = (R) => `1 rem = **${R} px** on this page.`;

function genLayout(rng, tier) {
  const wantFit = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const R = rng.pick([10, 16, 16, 20]);
    const item = rng.pick(ITEMS);
    if (tier === "expert-plus") {
      const k = rng.pick([4, 6, 8, 12]), g = rng.pick([8, 12, 16, 20, 24]), cw = rng.int(15, 40) * 4;
      const s = rng.int(2, Math.min(k - 1, 6));
      const W = k * cw + (k - 1) * g;
      if (W > 1400 || W < 300) continue;
      const span = s * cw + (s - 1) * g, rem = span / R;
      if (nearHalf(rem, 2, 0.1)) continue;
      const D = Math.round(span * (wantFit ? rng.pick([0.7, 0.8, 0.9, 0.95]) : rng.pick([1.05, 1.1, 1.25, 1.4])));
      if ((span >= D) !== wantFit || Math.abs(span - D) / span < 0.04) continue;
      const parts = [
        numPart("col", "Column width", "Width of one column (px)", cw, 0, "The columns and the gutters between them fill the whole width. Take the gutters off, then share what is left equally."),
        numPart("span", "Panel width", `Width of the panel that spans ${s} columns (px)`, span, 0, "Add the columns it covers and the gutters between them (one fewer gutter than columns)."),
        numPart("rem", "Panel width in rem", "Width of that panel in rem", rem, 2, "Divide pixels by the pixels in one rem."),
        yesNo("fits", "Image fits?", `Does the **${D} px** image fit in the panel at its natural size?`, wantFit, "Compare the panel width with the image width; equal or wider fits."),
      ];
      const ex = `**One column:** (${W} − ${k - 1} × ${g}) ÷ ${k} = **${cw} px**.\n\n**Panel:** ${s} × ${cw} + ${s - 1} × ${g} = **${span} px**.\n\n**In rem:** ${span} ÷ ${R} = ${f(roundTo(rem, 4))}, about **${f(roundTo(rem, 2))} rem**.\n\n**Verdict:** ${span} px is ${wantFit ? "at least" : "less than"} ${D} px: **${YN(wantFit)}**.`;
      return finish(`A page grid is **${W} px** wide with **${k} equal columns**. Between neighbouring columns is a gutter of **${g} px** (no gutters at the outer edges). A feature panel spans **${s} columns**, which includes the ${s - 1} gutters between them. An image is **${D} px** wide and is shown at its natural size, so it fits only if the panel is at least as wide. ${rootRule(R)}`,
        parts, ex, "fe-lg4", { tier, W, k, g, s, D, R }, [["_width", W], ["_cols", k], ["_gutter", g], ["_span", s], ["_image", D], ["_root", R]],
        ["Find one column first; the panel is built from it.", "A panel over s columns contains s − 1 gutters."]);
    }
    const W = rng.pick(WINDOWS), P = rng.pick(SHARES), C = (W * P) / 100;
    if (!isEx(C, 0)) continue;
    const cRem = rng.pick(CARD_REMS), card = cRem * R, g = rng.pick(GAPS);
    const ratio = (C + g) / (card + g), n = Math.floor(ratio);
    if (!fracOk(ratio) || n < 2 || n > 10) continue;
    const base = `A page is shown in a window **${W} px** wide. Its content container is **${P}%** of the window width. The **${item}** are **${cRem} rem** wide with a **${g} px** gap between neighbouring ones (no gap at the ends of a row). ${rootRule(R)} A row holds as many whole ones as fit in the container.`;
    const given = [["_window", W], ["_share", P], ["_rem", cRem], ["_root", R], ["_gap", g]];
    const exC = `**Container:** ${W} × ${P}% = **${C} px**.`;
    const exW = `**Card width:** ${cRem} × ${R} = **${card} px**.`;
    const exN = `**Per row:** n cards need n × ${card} + (n − 1) × ${g} px. (${C} + ${g}) ÷ (${card} + ${g}) = ${f(roundTo(ratio, 2))}, round down: **${n}**.`;
    const pC = numPart("container", "Container width", "Width of the content container (px)", C, 0, "Take the stated percentage of the window width.");
    const pW = numPart("card", "Card width", "Width of one card (px)", card, 0, "Rem times the pixels in one rem.");
    const pN = numPart("fit", "Cards per row", "Whole cards that fit in one row (round down)", n, 0, "Each card after the first also brings a gap. Add one gap to both sides before dividing, then round down.");
    if (tier === "medium") return finish(base, [pC, pN], `${exC}\n\n${exW}\n\n${exN}`, "fe-lg1", { tier, W, P, cRem, R, g }, given,
      ["Container first, then the card in pixels (rem times root size).", "Whole cards only, so round down."]);
    if (tier === "hard") return finish(base, [pC, pW, pN], `${exC}\n\n${exW}\n\n${exN}`, "fe-lg2", { tier, W, P, cRem, R, g }, given,
      ["Container, card in pixels, then how many fit.", "Count the gaps: one fewer than the cards."]);
    const N = rng.int(n + 2, 6 * n);
    if (!fracOk(N / n)) continue;
    const rows = Math.ceil(N / n);
    const parts = [pC, pW, pN, numPart("rows", "Rows needed", `Rows needed to show all ${N} ${item} (round up)`, rows, 0, "Items divided by the number per row, rounded up: a part-filled last row still counts.")];
    return finish(`${base} The page has **${N}** of them to show.`, parts,
      `${exC}\n\n${exW}\n\n${exN}\n\n**Rows:** ${N} ÷ ${n} = ${f(roundTo(N / n, 2))}, round up: **${rows}**.`, "fe-lg3", { tier, W, P, cRem, R, g, N }, [...given, ["_count", N]],
      ["The per-row count from the width feeds the number of rows.", "The last row may be part-filled."]);
  }
  return tooMany();
}

// ---------- page-weight ----------

const PAGES = ["landing page", "shop home page", "blog article", "dashboard", "gallery page"];
const KBrule = "1 MB = 1000 KB, 1 KB = 1000 bytes and 1 byte = 8 bits. A connection of M Mbps moves M million bits per second. Load time = size ÷ speed; ignore delays and protocol overhead.";
const secsOf = (kb, M) => (kb * 0.008) / M;

function genWeight(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const page = rng.pick(PAGES), M = rng.pick([2, 4, 5, 8, 10, 16, 20, 25, 40]);
    const nImg = rng.int(3, 12), sImg = rng.int(4, 40) * 10, scripts = rng.int(10, 60) * 10;
    const imgs = nImg * sImg;
    if (tier === "medium") {
      const tot = imgs + scripts, t = secsOf(tot, M);
      if (t < 0.3 || t > 30 || nearHalf(t, 2, 0.12)) continue;
      return finish(`The **${page}** loads **${nImg} images** of **${sImg} KB** each and a script bundle of **${scripts} KB**. It is loaded over a **${M} Mbps** connection. ${KBrule}`,
        [numPart("total", "Page weight", "Total size the page downloads (KB)", tot, 0, "Images are a count times a size; add the script bundle."),
         numPart("time", "Load time", "Time to download the page (seconds)", t, 2, "Convert KB to bits, then divide by the bits per second.")],
        `**Page weight:** ${nImg} × ${sImg} + ${scripts} = **${commas(tot)} KB**.\n\n**Time:** ${commas(tot)} KB × 8000 bits = ${commas(tot * 8000)} bits; ÷ ${M},000,000 bits/s = ${f(roundTo(t, 4))}, about **${f(roundTo(t, 2))} s**.`,
        "fe-pw1", { tier, nImg, sImg, scripts, M }, [["_images", nImg], ["_size", sImg], ["_scripts", scripts], ["_mbps", M]],
        ["Weight first, in KB; time uses it.", "1 KB is 8000 bits and 1 Mbps is 1,000,000 bits a second."]);
    }
    const c = rng.pick([20, 25, 30, 40, 50, 60, 70]);
    const after = imgs * (1 - c / 100);
    if (!isEx(after, 1)) continue;
    const tot = after + scripts, t = secsOf(tot, M);
    if (t < 0.3 || t > 30 || nearHalf(t, 2, 0.12)) continue;
    const exI = `**Images after compression:** ${nImg} × ${sImg} = ${imgs} KB; ${c}% smaller leaves ${100 - c}%: **${f(after)} KB**.`;
    const exT = `**Page weight:** ${f(after)} + ${scripts} = **${f(tot)} KB**.`;
    const exS = `**Time:** ${f(tot)} × 8000 ÷ ${M},000,000 = ${f(roundTo(t, 4))}, about **${f(roundTo(t, 2))} s**.`;
    const pI = numPart("images", "Images after compression", "Total size of the images after compression (KB)", after, 1, "Compression takes the stated percentage off the images; the scripts stay as they are.");
    const pT = numPart("total", "Page weight", "Total size the page downloads after compression (KB)", tot, 1, "Compressed images plus the script bundle.");
    const pS = numPart("time", "Load time", "Time to download the compressed page (seconds)", t, 2, "KB to bits, then divide by the bits per second.");
    const base = `The **${page}** has **${nImg} images** of **${sImg} KB** each and a script bundle of **${scripts} KB**. Compression makes the images **${c}% smaller** and leaves the scripts unchanged. It loads over a **${M} Mbps** connection. ${KBrule}`;
    const given = [["_images", nImg], ["_size", sImg], ["_scripts", scripts], ["_cut", c], ["_mbps", M]];
    if (tier === "hard") return finish(base, [pI, pT, pS], `${exI}\n\n${exT}\n\n${exS}`, "fe-pw2", { tier, nImg, sImg, scripts, c, M }, given,
      ["Images shrink; scripts do not.", "Weight, then convert to bits for the time."]);
    if (tier === "expert") {
      const T = Math.round(t * (wantOk ? rng.pick([1.2, 1.35, 1.5, 1.8]) : rng.pick([0.55, 0.65, 0.75, 0.85])) * 2) / 2;
      if (T < 0.5) continue;
      const ok = t <= T;
      if (ok !== wantOk || Math.abs(t - T) / T < 0.1) continue;
      return finish(`${base} The page must load in **${f(T)} seconds** or less.`,
        [pI, pT, pS, yesNo("ok", "Within the limit?", `Does the compressed page load within **${f(T)} seconds**?`, ok, "Compare the load time with the limit; at or under it is within.")],
        `${exI}\n\n${exT}\n\n${exS}\n\n**Verdict:** ${f(roundTo(t, 2))} s is ${ok ? "within" : "over"} ${f(T)} s: **${YN(ok)}**.`, "fe-pw3", { tier, nImg, sImg, scripts, c, M, T }, [...given, ["_limit", T]],
        ["Same steps as before, then one comparison.", "A load time equal to the limit would still pass."]);
    }
    // expert-plus: first visit vs repeat visit with caching
    const html = rng.pick([20, 30, 40, 50, 60, 80]), fonts = rng.pick([40, 60, 80, 120, 150]);
    const first = html + after + scripts + fonts, repeat = html + after;
    if (!isEx(first, 1)) continue;
    const t2 = secsOf(repeat, M);
    if (t2 < 0.1 || t2 > 30 || nearHalf(t2, 2, 0.12)) continue;
    const L = Math.round(t2 * (wantOk ? rng.pick([1.2, 1.35, 1.5, 1.8]) : rng.pick([0.55, 0.65, 0.75, 0.85])) * 10) / 10;
    if (L < 0.1) continue;
    const ok = t2 <= L;
    if (ok !== wantOk || Math.abs(t2 - L) / L < 0.1) continue;
    const parts = [
      numPart("first", "First visit", "Total size downloaded on a first visit (KB)", first, 1, "Everything is downloaded: the page, the compressed images, the scripts and the fonts."),
      numPart("repeat", "Repeat visit", "Total size downloaded on a repeat visit (KB)", repeat, 1, "Scripts and fonts come from the cache; the page and the images are downloaded again."),
      numPart("time", "Repeat load time", "Time to download the page on a repeat visit (seconds)", t2, 2, "Use the repeat-visit size: KB to bits, then divide by the bits per second."),
      yesNo("ok", "Within the limit?", `Does a repeat visit load within **${f(L)} seconds**?`, ok, "Compare the repeat-visit time with the limit."),
    ];
    const ex = `${exI}\n\n**First visit:** ${html} + ${f(after)} + ${scripts} + ${fonts} = **${f(first)} KB**.\n\n**Repeat visit:** ${html} + ${f(after)} = **${f(repeat)} KB**.\n\n**Time:** ${f(repeat)} × 8000 ÷ ${M},000,000 = ${f(roundTo(t2, 4))}, about **${f(roundTo(t2, 2))} s**.\n\n**Verdict:** ${f(roundTo(t2, 2))} s is ${ok ? "within" : "over"} ${f(L)} s: **${YN(ok)}**.`;
    return finish(`The **${page}** downloads an HTML file of **${html} KB**, **${nImg} images** of **${sImg} KB** each (compression makes them **${c}% smaller**), a script bundle of **${scripts} KB** and fonts of **${fonts} KB**. On a **repeat visit** the browser keeps the scripts and fonts in its cache, but downloads the HTML and the images again. The connection is **${M} Mbps**, and a repeat visit must load in **${f(L)} seconds** or less. ${KBrule}`,
      parts, ex, "fe-pw4", { tier, html, nImg, sImg, scripts, fonts, c, M, L }, [["_html", html], ["_images", nImg], ["_size", sImg], ["_cut", c], ["_scripts", scripts], ["_fonts", fonts], ["_mbps", M], ["_limit", L]],
      ["Two totals: everything, then only what the cache does not hold.", "The time uses the repeat-visit total."]);
  }
  return tooMany();
}

// ---------- frame-budget ----------

const SCREENS = ["chat history", "product list", "news feed", "file browser", "order table"];
const FPS = [30, 40, 50, 60, 60, 120];
const budgetRule = "A frame has **1000 ÷ fps milliseconds** to finish all its work.";

function genFrame(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const scr = rng.pick(SCREENS), fps = rng.pick(FPS), budget = 1000 / fps;
    const F = rng.pick([2, 2.5, 3, 4, 5]), c = rng.pick([0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.4]);
    const b2 = roundTo(budget, 2);
    const budgetPart = numPart("budget", "Frame budget", "Time one frame may take (milliseconds)", budget, 2, "One second is 1000 ms; share it between the frames.");
    if (tier === "expert" || tier === "expert-plus") {
      const H = rng.pick([600, 640, 700, 720, 800, 900]), h = rng.pick([40, 44, 48, 56, 64, 72]);
      const vis = Math.ceil(H / h), bu = rng.pick([2, 3, 4, 5, 10]);
      if (!fracOk(H / h)) continue;
      const rendered = vis + 2 * bu, virt = F + rendered * c;
      if (!isEx(virt, 2)) continue;
      const base = `The **${scr}** has a window **${H} px** tall and every row is **${h} px** high. A frame costs **${f(F)} ms** of fixed work plus **${f(c)} ms** for every row that is drawn. Only the rows in view plus **${bu} spare rows above and ${bu} below** are drawn (a partly visible row counts as in view).`;
      const exV = `**Rows in view:** ${H} ÷ ${h} = ${f(roundTo(H / h, 2))}, round up: **${vis}**.\n\n**Rows drawn:** ${vis} + ${bu} + ${bu} = **${rendered}**.\n\n**Frame time:** ${f(F)} + ${rendered} × ${f(c)} = **${f(roundTo(virt, 2))} ms**.`;
      const pV = numPart("visible", "Rows in view", "Rows at least partly in view (round up)", vis, 0, "Window height divided by row height, rounded up: a cut-off row still has to be drawn.");
      const pR = numPart("drawn", "Rows drawn", "Rows actually drawn, spare rows included", rendered, 0, "Rows in view plus the spare rows on both sides.");
      const pF = numPart("time", "Frame time", "Time one frame takes with those rows drawn (milliseconds)", virt, 2, "Fixed work plus the per-row cost for each row drawn.");
      if (tier === "expert") {
        const ok = virt <= budget;
        if (ok !== wantOk || Math.abs(virt - budget) / budget < 0.08 || Math.abs(virt - b2) / b2 < 0.08) continue;
        return finish(`${base} The screen must hold **${fps} fps**. ${budgetRule}`,
          [pV, pR, pF, yesNo("ok", "Holds the frame rate?", `Does a frame fit in the budget for **${fps} fps**?`, ok, "Compare the frame time with 1000 ÷ fps; at or under the budget holds the rate.")],
          `${exV}\n\n**Budget:** 1000 ÷ ${fps} = ${f(roundTo(budget, 2))} ms, so ${f(roundTo(virt, 2))} ms ${ok ? "fits" : "is over"}: **${YN(ok)}**.`, "fe-fb3", { tier, fps, F, c, H, h, bu }, [["_window", H], ["_row", h], ["_fixed", F], ["_cost", c], ["_spare", bu], ["_fps", fps]],
          ["Rows in view, then rows drawn, then time.", "The budget comes from the frame rate: 1000 divided by it."]);
      }
      const N = rng.int(8, 60) * 100, full = F + N * c, sp = full / virt;
      if (!isEx(full, 2) || nearHalf(sp, 1, 0.1) || sp < 3) continue;
      const parts = [
        numPart("height", "Scroll height", "Total height of the whole list (px)", N * h, 0, "Rows times the height of one row."),
        pR,
        pF,
        numPart("speed", "Speed-up", "How many times faster a frame is than drawing all rows (full-list frame time ÷ this frame time)", sp, 1, "Work out the frame time with every row drawn, then divide by the frame time you found."),
      ];
      return finish(`The **${scr}** has **${commas(N)} rows**, each **${h} px** high, in a window **${H} px** tall. A frame costs **${f(F)} ms** of fixed work plus **${f(c)} ms** for every row that is drawn. A virtualised list draws only the rows in view plus **${bu} spare rows above and ${bu} below** (a partly visible row counts as in view), while a plain list draws all ${commas(N)}.`,
        parts, `**Scroll height:** ${commas(N)} × ${h} = **${commas(N * h)} px**.\n\n${exV}\n\n**Plain list:** ${f(F)} + ${commas(N)} × ${f(c)} = ${f(roundTo(full, 2))} ms.\n\n**Speed-up:** ${f(roundTo(full, 2))} ÷ ${f(roundTo(virt, 2))} = ${f(roundTo(sp, 3))}, about **${f(roundTo(sp, 1))}×**.`,
        "fe-fb4", { tier, N, h, H, F, c, bu }, [["_rows", N], ["_row", h], ["_window", H], ["_fixed", F], ["_cost", c], ["_spare", bu]],
        ["Height is rows times row height; the frame time comes from the rows drawn.", "A speed-up is a ratio: slow time over fast time."]);
    }
    const ratio = (budget - F) / c, ratio2 = (b2 - F) / c, fit = Math.floor(ratio);
    if (!fracOk(ratio) || !fracOk(ratio2) || Math.floor(ratio2) !== fit || fit < 10 || fit > 250) continue;
    const base = `The **${scr}** must hold **${fps} fps**. ${budgetRule} A frame costs **${f(F)} ms** of fixed work plus **${f(c)} ms** for every item drawn.`;
    const pFit = numPart("fit", "Items per frame", "Most items that can be drawn without going over the budget (round down)", fit, 0, "Take the fixed work off the budget, then divide by the cost of one item and round down.");
    const exB = `**Budget:** 1000 ÷ ${fps} = **${f(roundTo(budget, 2))} ms**.`;
    const exF = `**Items:** (${f(roundTo(budget, 2))} − ${f(F)}) ÷ ${f(c)} = ${f(roundTo(ratio, 2))}, round down: **${fit}**.`;
    const given = [["_fps", fps], ["_fixed", F], ["_cost", c]];
    if (tier === "medium") return finish(base, [budgetPart, pFit], `${exB}\n\n${exF}`, "fe-fb1", { tier, fps, F, c }, given,
      ["The budget first: 1000 ms shared among the frames.", "Only whole items, so round down."]);
    const N = fit * rng.int(2, 5), ft = F + N * c, fp = 1000 / ft;
    if (!isEx(ft, 2) || nearHalf(fp, 1, 0.1)) continue;
    return finish(`${base} The list holds **${commas(N)} items**; if all of them were drawn every frame the screen would run slower.`,
      [budgetPart, pFit, numPart("fps", "Frame rate if all drawn", "Frame rate reached when all the items are drawn every frame (frames per second)", fp, 1, "Time for one frame with every item, then 1000 divided by that time.")],
      `${exB}\n\n${exF}\n\n**Frame time with all ${commas(N)}:** ${f(F)} + ${commas(N)} × ${f(c)} = ${f(roundTo(ft, 2))} ms.\n\n**Frame rate:** 1000 ÷ ${f(roundTo(ft, 2))} = ${f(roundTo(fp, 3))}, about **${f(roundTo(fp, 1))} fps**.`,
      "fe-fb2", { tier, fps, F, c, N }, [...given, ["_items", N]],
      ["Budget, items that fit, then the slower frame.", "Frames per second = 1000 ÷ frame time in ms."]);
  }
  return tooMany();
}

// ---------- colour-contrast ----------

const ratioOf = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const contrastRule = "The contrast ratio of two colours is **(L1 + 0.05) ÷ (L2 + 0.05)**, where L1 is the **lighter** colour's relative luminance and L2 the darker one's. Body text passes only at **4.5 : 1** or more.";
const L2 = (x) => x.toFixed(2);
const SHADES = ["Ink", "Charcoal", "Slate", "Steel", "Graphite", "Ash", "Pewter", "Fog"];
const ELEMENTS = ["body text", "caption text", "link text", "button label", "menu text"];
const clearOf45 = (r) => Math.abs(r - 4.5) >= 0.3;

function genContrast(rng, tier) {
  const wantOk = rng.next() < 0.5;
  for (let i = 0; i < TRY; i++) {
    const el = rng.pick(ELEMENTS);
    if (tier === "expert") {
      const Lb = rng.int(55, 100) / 100, Lmax = (Lb + 0.05) / 4.5 - 0.05;
      if (nearHalf(Lmax, 3, 0.1)) continue;
      const names = rng.shuffle(SHADES.slice()).slice(0, 4);
      const Ls = names.map(() => rng.int(1, 30) / 100);
      if (new Set(Ls).size < 4 || Ls.some((x) => Math.abs(x - Lmax) < 0.012)) continue;
      const passing = names.map((_, k) => k).filter((k) => Ls[k] < Lmax);
      if (passing.length < 1 || passing.length > 3) continue;
      const best = passing.reduce((a, k) => (Ls[k] > Ls[a] ? k : a), passing[0]);
      const r = ratioOf(Lb, Ls[best]);
      if (nearHalf(r, 2, 0.1)) continue;
      const list = names.map((n, k) => `${n} (${L2(Ls[k])})`).join(", ");
      const parts = [
        numPart("max", "Darkest allowed", "Highest luminance the text colour can have on this background and still reach 4.5 : 1", Lmax, 3, "Rearrange (L1 + 0.05) ÷ (L2 + 0.05) = 4.5 for the darker colour: L2 = (L1 + 0.05) ÷ 4.5 − 0.05."),
        numPart("count", "Shades that pass", "How many of the four shades pass 4.5 : 1", passing.length, 0, "A shade passes if its luminance is below the limit you found."),
        { id: "pick", label: "Lightest passing shade", ask: "Which passing shade is the lightest (highest luminance)?", answerType: "choice", answer: names[best], choices: shuffled(rng, names), hint: "Among the shades that pass, take the one with the largest luminance." },
        numPart("ratio", "Its contrast ratio", "Contrast ratio of that shade on the background (ratio : 1)", r, 2, "Lighter luminance plus 0.05, divided by darker luminance plus 0.05."),
      ];
      const ex = `**Limit:** (${L2(Lb)} + 0.05) ÷ 4.5 − 0.05 = ${f(roundTo(Lmax, 4))}, about **${f(roundTo(Lmax, 3))}**.\n\n**Passing:** shades below ${f(roundTo(Lmax, 3))}: ${passing.map((k) => names[k]).join(", ")}, so **${passing.length}**.\n\n**Lightest passing:** **${names[best]}** (${L2(Ls[best])}).\n\n**Ratio:** (${L2(Lb)} + 0.05) ÷ (${L2(Ls[best])} + 0.05) = ${f(roundTo(r, 3))}, about **${f(roundTo(r, 2))} : 1**.`;
      return finish(`A light page background has relative luminance **${L2(Lb)}**. The designer is choosing a dark text colour from four shades, with luminances: ${list}. ${contrastRule}`,
        parts, ex, "fe-cc3", { tier, Lb, names, Ls }, [["_bg", Lb], ...Ls.map((x, k) => [`_s${k + 1}`, x])],
        ["Work backwards from 4.5 : 1 to the largest luminance the text may have.", "Test every shade against that limit."]);
    }
    if (tier === "expert-plus") {
      const Lt = rng.int(88, 100) / 100, Lb = rng.int(50, 90) / 100, a = rng.int(2, 18) * 5;
      const bl = (1 - a / 100) * Lb, r = (Lt + 0.05) / (bl + 0.05);
      const Lmax = (Lt + 0.05) / 4.5 - 0.05, need = 100 * (1 - Lmax / Lb), amin = Math.ceil(need);
      if (nearHalf(bl, 3, 0.1) || nearHalf(r, 2, 0.1) || !clearOf45(r)) continue;
      const rr = (Lt + 0.05) / (roundTo(bl, 3) + 0.05);
      if (roundTo(rr, 2) !== roundTo(r, 2)) continue;
      if (need < 4 || need > 90 || !fracOk(need + 1)) continue;
      const ok = r >= 4.5;
      if (ok !== wantOk) continue;
      const parts = [
        numPart("blend", "Photo under the overlay", `Luminance of the photo after the ${a}% overlay`, bl, 3, "The overlay leaves the remaining share of the photo's luminance."),
        numPart("ratio", "Contrast ratio", "Contrast ratio of the white-ish text on the darkened photo (ratio : 1)", r, 2, "The text is the lighter colour here: its luminance plus 0.05, over the photo's plus 0.05."),
        yesNo("ok", "Passes 4.5 : 1?", `Does the text reach **4.5 : 1** with the ${a}% overlay?`, ok, "Compare your ratio with 4.5."),
        numPart("amin", "Least opacity", "Smallest whole-number overlay opacity that makes the text pass (%, round up)", amin, 0, "Find the highest photo luminance that still gives 4.5 : 1, then the share of the photo's luminance that must be removed, rounded up.", true),
      ];
      const ex = `**Photo after overlay:** (1 − ${a}%) × ${L2(Lb)} = ${f(roundTo(bl, 4))}, about **${f(roundTo(bl, 3))}**.\n\n**Ratio:** (${L2(Lt)} + 0.05) ÷ (${f(roundTo(bl, 3))} + 0.05) = ${f(roundTo(r, 3))}, about **${f(roundTo(r, 2))} : 1**.\n\n**Verdict:** ${ok ? "at least" : "below"} 4.5: **${YN(ok)}**.\n\n**Least opacity:** the photo may be at most (${L2(Lt)} + 0.05) ÷ 4.5 − 0.05 = ${f(roundTo(Lmax, 4))}. So at least ${f(roundTo(need, 2))}% must be removed: round up to **${amin}%**.`;
      return finish(`White-ish text of relative luminance **${L2(Lt)}** sits over a photo of luminance **${L2(Lb)}**. A **black overlay** of **${a}% opacity** is laid over the photo. For this exercise, the photo's luminance after the overlay is **(1 − opacity) × its luminance**. ${contrastRule}`,
        parts, ex, "fe-cc4", { tier, Lt, Lb, a }, [["_text", Lt], ["_photo", Lb], ["_opacity", a]],
        ["Darken the photo first; then it is the usual ratio with the text as the lighter colour.", "For the least opacity, work backwards from 4.5 : 1."]);
    }
    // medium and hard
    const flip = rng.next() < 0.5;
    const hi = rng.int(55, 100) / 100, lo = rng.int(2, 35) / 100;
    const r1 = ratioOf(hi, lo);
    const textL = flip ? hi : lo, bgL = flip ? lo : hi;
    const base = `The **${el}** has relative luminance **${L2(textL)}** on a background of luminance **${L2(bgL)}**.`;
    if (tier === "medium") {
      if (!clearOf45(r1) || nearHalf(r1, 2, 0.12)) continue;
      const ok = r1 >= 4.5;
      if (ok !== wantOk) continue;
      return finish(`${base} ${contrastRule}`,
        [numPart("ratio", "Contrast ratio", "Contrast ratio of the text on its background (ratio : 1)", r1, 2, "Decide which colour is lighter before dividing."),
         yesNo("ok", "Passes 4.5 : 1?", "Does the text reach **4.5 : 1**?", ok, "Compare the ratio with 4.5.")],
        `**Ratio:** (${L2(hi)} + 0.05) ÷ (${L2(lo)} + 0.05) = ${f(roundTo(r1, 3))}, about **${f(roundTo(r1, 2))} : 1**.\n\n**Verdict:** ${ok ? "at least" : "below"} 4.5: **${YN(ok)}**.`,
        "fe-cc1", { tier, textL, bgL }, [["_text", textL], ["_bg", bgL]],
        ["The lighter colour goes on top of the fraction, whichever is the text.", "Both have 0.05 added."]);
    }
    const bg2 = flip ? rng.int(2, 35) / 100 : rng.int(55, 100) / 100;
    const r2 = ratioOf(textL, bg2);
    if (!clearOf45(r1) || !clearOf45(r2) || nearHalf(r1, 2, 0.12) || nearHalf(r2, 2, 0.12) || Math.abs(bg2 - bgL) < 0.05) continue;
    const ok = r1 >= 4.5 && r2 >= 4.5;
    if (ok !== wantOk) continue;
    return finish(`${base} When the pointer hovers over the button the background changes to luminance **${L2(bg2)}**; the text stays the same. ${contrastRule} A button passes only if it passes in **both** states.`,
      [numPart("normal", "Normal state", "Contrast ratio in the normal state (ratio : 1)", r1, 2, "Lighter plus 0.05 over darker plus 0.05."),
       numPart("hover", "Hover state", "Contrast ratio in the hover state (ratio : 1)", r2, 2, "The text colour is the same, but the lighter and darker roles may swap."),
       yesNo("ok", "Passes in both?", "Does the button reach **4.5 : 1** in both states?", ok, "Both ratios must be 4.5 or more.")],
      `**Normal:** (${L2(Math.max(textL, bgL))} + 0.05) ÷ (${L2(Math.min(textL, bgL))} + 0.05) = **${f(roundTo(r1, 2))} : 1**.\n\n**Hover:** (${L2(Math.max(textL, bg2))} + 0.05) ÷ (${L2(Math.min(textL, bg2))} + 0.05) = **${f(roundTo(r2, 2))} : 1**.\n\n**Verdict:** ${ok ? "both are at least 4.5" : "at least one is below 4.5"}: **${YN(ok)}**.`,
      "fe-cc2", { tier, textL, bgL, bg2 }, [["_text", textL], ["_bg", bgL], ["_hover", bg2]],
      ["Do the normal state, then repeat with the hover background.", "One failing state is enough to fail the button."]);
  }
  return tooMany();
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "responsive-layout") return genLayout(rng, difficulty);
  if (subtopic === "page-weight") return genWeight(rng, difficulty);
  if (subtopic === "frame-budget") return genFrame(rng, difficulty);
  if (subtopic === "colour-contrast") return genContrast(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (cards per row by adding cards until
// they no longer fit, column width from the total width, load time through bits and seconds, items per frame
// by adding items one at a time, the contrast ratio as a reciprocal, shade tests by cross-multiplying, the least
// opacity by stepping the percentage up). Numbers are compared with the rounded truth; choices exact.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;

const cardsIn = (C, card, g) => { let n = 0; while ((n + 1) * card + n * g <= C + 1e-9) n++; return n; };
const bitsTime = (kb, M) => (kb * 1000 * 8) / (M * 1e6);
const itemsIn = (budget, F, c) => { let n = 0; while (F + (n + 1) * c <= budget + 1e-9) n++; return n; };
const rowsView = (H, h) => { let n = 0; while (n * h < H - 1e-9) n++; return n; };
const passes = (a, b) => Math.min(a, b) + 0.05 <= (Math.max(a, b) + 0.05) / 4.5 + 1e-12; // cross-multiplied, no division by the darker side
const recip = (a, b) => 1 / ((Math.min(a, b) + 0.05) / (Math.max(a, b) + 0.05));

const ALT = {
  "fe-lg1": (p) => { const C = (p.W / 100) * p.P; return { container: C, fit: cardsIn(C, p.cRem * p.R, p.g) }; },
  "fe-lg2": (p) => { const C = (p.W / 100) * p.P, card = p.R * p.cRem; return { container: C, card, fit: cardsIn(C, card, p.g) }; },
  "fe-lg3": (p) => {
    const C = (p.W / 100) * p.P, card = p.R * p.cRem, n = cardsIn(C, card, p.g);
    let rows = 0, left = p.N; while (left > 0) { left -= n; rows++; }
    return { container: C, card, fit: n, rows };
  },
  "fe-lg4": (p) => {
    const cw = (p.W - (p.k - 1) * p.g) / p.k, span = p.s * (cw + p.g) - p.g;
    return { col: cw, span, rem: span / p.R, fits: YN(p.D <= span) };
  },
  "fe-pw1": (p) => { const tot = p.sImg * p.nImg + p.scripts; return { total: tot, time: bitsTime(tot, p.M) }; },
  "fe-pw2": (p) => { const im = (p.nImg * p.sImg * (100 - p.c)) / 100, tot = im + p.scripts; return { images: im, total: tot, time: bitsTime(tot, p.M) }; },
  "fe-pw3": (p) => { const im = (p.nImg * p.sImg * (100 - p.c)) / 100, tot = im + p.scripts, t = bitsTime(tot, p.M); return { images: im, total: tot, time: t, ok: YN(t <= p.T) }; },
  "fe-pw4": (p) => {
    const im = (p.nImg * p.sImg * (100 - p.c)) / 100, rep = p.html + im, t = bitsTime(rep, p.M);
    return { first: p.html + im + p.scripts + p.fonts, repeat: rep, time: t, ok: YN(t <= p.L) };
  },
  "fe-fb1": (p) => ({ budget: 1000 / p.fps, fit: itemsIn(1000 / p.fps, p.F, p.c) }),
  "fe-fb2": (p) => { const t = p.F + p.c * p.N; return { budget: 1000 / p.fps, fit: itemsIn(1000 / p.fps, p.F, p.c), fps: 1 / (t / 1000) }; },
  "fe-fb3": (p) => {
    const vis = rowsView(p.H, p.h), dr = vis + p.bu * 2, t = p.F + p.c * dr;
    return { visible: vis, drawn: dr, time: t, ok: YN(t <= 1000 / p.fps) };
  },
  "fe-fb4": (p) => {
    const vis = rowsView(p.H, p.h), dr = vis + p.bu * 2, t = p.F + p.c * dr, full = p.F + p.c * p.N;
    return { height: p.h * p.N, drawn: dr, time: t, speed: full / t };
  },
  "fe-cc1": (p) => { const r = recip(p.textL, p.bgL); return { ratio: r, ok: YN(passes(p.textL, p.bgL)) }; },
  "fe-cc2": (p) => ({ normal: recip(p.textL, p.bgL), hover: recip(p.textL, p.bg2), ok: YN(passes(p.textL, p.bgL) && passes(p.textL, p.bg2)) }),
  "fe-cc3": (p) => {
    const ok = p.Ls.map((x) => passes(p.Lb, x));
    let best = -1; p.Ls.forEach((x, k) => { if (ok[k] && (best < 0 || x > p.Ls[best])) best = k; });
    return { max: (p.Lb + 0.05) / 4.5 - 0.05, count: ok.filter(Boolean).length, pick: p.names[best], ratio: recip(p.Lb, p.Ls[best]) };
  },
  "fe-cc4": (p) => {
    const at = (a) => (100 - a) * p.Lb / 100, bl = at(p.a), r = (p.Lt + 0.05) / (bl + 0.05);
    let a = 0; while (!passes(p.Lt, at(a)) && a < 100) a++;
    return { blend: bl, ratio: r, ok: YN(passes(p.Lt, bl)), amin: a };
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
