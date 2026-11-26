// Archaeologist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario worked out from MADE-UP figures stated in the prompt (a
// sample's carbon-14 percentage, context relations and coin years, trench sizes, sherd counts); no real
// site, date or fact has to be recalled. Hints and explanations use only values already drawn (no rng
// calls in them) and verify() recomputes every part by another route (see the ALT table at the end).
// Inputs are drawn so each chained answer is exact (whole half-lives, tenths of a metre, quarter-finds
// per m3, sherd totals that divide 10 000), so a rounded earlier answer never changes a later one and
// no answer sits on a rounding half-step. Decision parts are fitted after a random target is chosen.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   radiocarbon      half-lives from % remaining -> age -> calendar year (BC, no year 0) -> two samples
//   stratigraphy     unique order of contexts from "lies over / cut by" -> coin TPQ -> windows
//   trench-finds     area, volume, finds per m2 / m3, spits, digging days, backwards from a density
//   pottery-counts   total sherds, % by fabric, EVE from rim arcs, most common fabric, next season

import { yearDistance } from "../../js/lib/dates.js";
import { roundTo } from "../../js/lib/mathutil.js";

// ---------- helpers ----------

const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 20000;
const tooMany = () => { throw new Error("role-archaeologist: no suitable draw"); };
const NO_ZERO = "There is no year 0: 1 BC is followed directly by AD 1.";

// Years: negative = BC, never 0. Shown as "44 BC", "AD 79", "2020".
const yr = (y) => (y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : String(y));
const yrAns = (y) => (y < 0 ? `${-y} BC` : String(y));
const shiftY = (y, n) => { // y moved by n years (n may be negative), skipping the missing year 0
  let z = y + n;
  if (y < 0 && z >= 0) z += 1; else if (y > 0 && z <= 0) z -= 1;
  return z;
};
const gv = (label, y) => [`${label}_${y < 0 ? "bc" : "ad"}`, Math.abs(y)]; // a year as a calculator value
const A0n = (y) => (y < 0 ? y + 1 : y); // historical -> astronomical, for ordering

const fmt = (x) => String(roundTo(x, 2));

const numPart = (id, label, ask, val, hint, dp = 0) => {
  const p = { id, label, ask, answerType: "number", answer: roundTo(val, dp), tolerance: dp === 0 ? 0 : 0.005, hint };
  if (dp === 0) p.fuzzyNumber = 0;
  return p;
};
const yearPart = (id, label, ask, y, hint) => ({ id, label, ask, answerType: "date", precision: "year", answer: yrAns(y), hint });
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const yesNo = (id, label, ask, ok, hint) => choicePart(id, label, ask, ok ? "Yes" : "No", ["Yes", "No"], hint);
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// ---------- radiocarbon ----------

const HL = 5730;
const PCT_OF = { 1: 50, 2: 25, 3: 12.5, 4: 6.25 };
const SAMPLES = ["charred seed", "scrap of charcoal", "bone fragment", "piece of burnt grain", "twig of burnt wood"];
const POSITIONS = ["a hearth", "a storage pit", "a ditch fill", "a floor layer", "a post-hole"];
const RC_RULE = `Treat the half-life of carbon-14 as exactly **${HL} years**, the tests as exact, and ignore calibration.`;
const HINT_N = "Each half-life halves what is left, so count the halvings that take 100% down to the stated percentage.";
const HINT_AGE = "Age = number of half-lives × the length of one half-life.";
const HINT_YEAR = "Count back from the year of the test by the age. Counting back from AD to BC passes straight from AD 1 to 1 BC, so the result is one year earlier than a plain subtraction suggests.";

function genRadio(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const M = rng.int(2015, 2025);
    const what = rng.pick(SAMPLES), where = rng.pick(POSITIONS), code = rng.int(11, 99);
    // Sample A's death year is a typed year answer (at most 4 digits with BC), so A has 1 or 2 half-lives.
    // The decision parts (older / layers agree) are chosen first and then fitted.
    const wantYes = rng.next() < 0.5; // expert: B is older; expert-plus: the layers agree
    let na = rng.int(1, 2), nb = 0;
    if (tier === "expert" || tier === "expert-plus") {
      if (wantYes) { nb = rng.int(na + 1, 4); } else { na = 2; nb = 1; }
    }
    const age = na * HL, ya = shiftY(M, -age);
    const ageP = numPart("age", "Age", "Age of the sample when it was tested, in years", age, HINT_AGE);
    const yearP = yearPart("year", "Year it died", "Calendar year in which the living thing died", ya, HINT_YEAR);
    const halvesP = numPart("halves", "Half-lives", "Half-lives that have passed", na, HINT_N);
    if (tier === "medium" || tier === "hard") {
      const parts = tier === "medium" ? [ageP, yearP] : [halvesP, ageP, yearP];
      const ex = [
        tier === "hard" ? `**Half-lives:** 100% → ${[...Array(na)].map((_, k) => PCT_OF[k + 1]).join("% → ")}%, so **${na}** half-lives.` : "",
        `**Age:** ${na} × ${HL} = **${age}** years.`,
        `**Year it died:** ${M} − ${age} = −${age - M}. Counting that back as BC years gives ${age - M}, and because there is no year 0 one more year back is needed: **${yr(ya)}**.`,
      ].filter(Boolean).join("\n\n");
      return finish(
        `A **${what}** from ${where} (sample **S${code}**) is tested for carbon-14 in **${M}**. It still has **${PCT_OF[na]}%** of its original carbon-14. ${RC_RULE} ${NO_ZERO}`,
        parts, ex, "arch-radio", { tier, M, pa: PCT_OF[na] },
        [["_left_pct", PCT_OF[na]], ["_half_life", HL], ["_tested", M]],
        ["Work out how many half-lives have passed, then the age, then count back from the year of the test.", "The percentage left halves with every half-life: 100, 50, 25, 12.5, 6.25."],
      );
    }
    if (tier === "expert") {
      const older = na > nb ? "Sample A" : "Sample B";
      const gap = Math.abs(na - nb) * HL;
      const parts = [
        ageP,
        yearP,
        numPart("gap", "Gap", "Years between the two plants dying", gap, "Both were tested in the same year, so the gap is the difference between their ages."),
        choicePart("older", "Older", "Which sample is older?", older, ["Sample A", "Sample B"], "The sample with less carbon-14 left has been decaying for longer."),
      ];
      const ex = [
        `**Age:** ${PCT_OF[na]}% is ${na} half-lives, so ${na} × ${HL} = **${age}** years.`,
        `**Year it died:** **${yr(ya)}**.`,
        `**Gap:** Sample B is ${nb} half-lives old, so the ages differ by ${Math.abs(na - nb)} half-lives = **${gap}** years.`,
        `**Older:** ${PCT_OF[na]}% left for A and ${PCT_OF[nb]}% for B; less is left in the older one, so **${older}**.`,
      ].join("\n\n");
      return finish(
        `Two samples from one trench are tested for carbon-14 in **${M}**. **Sample A** (sample **S${code}**, a ${what} from ${where}) has **${PCT_OF[na]}%** of its original carbon-14 and **Sample B** has **${PCT_OF[nb]}%**. ${RC_RULE} ${NO_ZERO}`,
        parts, ex, "arch-radio", { tier, M, pa: PCT_OF[na], pb: PCT_OF[nb] },
        [["_pct_a", PCT_OF[na]], ["_pct_b", PCT_OF[nb]], ["_half_life", HL], ["_tested", M]],
        ["Convert each percentage to a number of half-lives first.", "Both samples were tested in the same year, so differences in age are differences in half-lives."],
      );
    }
    // expert-plus: a second sample is given by the year it died; find its carbon-14 and check the layers
    const yb = shiftY(M, -nb * HL);
    const ok = nb > na; // the lower layer should be the older
    const pctB = PCT_OF[nb];
    const parts = [
      ageP,
      yearP,
      numPart("pctb", "Sample B", "Percentage of its carbon-14 that Sample B had left when tested", pctB, "Work out Sample B's age from its death year and the test year, then how many half-lives that is.", 2),
      yesNo("consistent", "Layers agree?", "Do the two results agree with the layers (the lower sample should be the older)?", ok, "Compare Sample B's age with Sample A's: the sample in the lower layer should have the greater age."),
    ];
    const ex = [
      `**Age:** ${PCT_OF[na]}% is ${na} half-lives, so **${age}** years.`,
      `**Year it died:** **${yr(ya)}**.`,
      `**Sample B:** from ${yr(yb)} to ${M} is ${nb * HL} years (the missing year 0 is allowed for), which is ${nb} half-lives, so **${pctB}%** is left.`,
      `**Layers:** B is ${nb * HL} years old and A is ${age}; B is ${ok ? "older" : "younger"}, and it lies below A, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A **${what}** (Sample A, **S${code}**) from ${where} in an upper layer is tested for carbon-14 in **${M}** and has **${PCT_OF[na]}%** of its original carbon-14. Sample B comes from the layer **directly below** and was dated by another method to have died in **${yr(yb)}**. ${RC_RULE} ${NO_ZERO}`,
      parts, ex, "arch-radio", { tier, M, pa: PCT_OF[na], yb },
      [["_pct_a", PCT_OF[na]], ["_half_life", HL], ["_tested", M], gv("_b_died", yb)],
      ["Find Sample A's age and year first; Sample B's age comes from the span between its year and the test year.", "Every half-life halves the carbon-14 left."],
    );
  }
  return tooMany();
}

// ---------- stratigraphy ----------

const seq = (a) => a.join(" → ");
const cb = (id) => `[${id}]`;

function genStrat(rng, tier) {
  const n = { medium: 4, hard: 5, expert: 5, "expert-plus": 6 }[tier];
  const nCoins = { medium: 3, hard: 3, expert: 4, "expert-plus": 4 }[tier];
  for (let i = 0; i < TRY; i++) {
    const order = []; // oldest first
    while (order.length < n) { const v = rng.int(101, 299); if (!order.includes(v)) order.push(v); }
    // coins: always in the oldest context, the rest random
    const slots = [0, ...rng.shuffle([...Array(n - 1)].map((_, k) => k + 1)).slice(0, nCoins - 1)];
    const years = [];
    let bad = false;
    for (let k = 0; k < nCoins; k++) {
      const y = rng.int(-40, 60) * 5;
      if (y === 0 || years.some((z) => Math.abs(A0n(z) - A0n(y)) < 15)) { bad = true; break; }
      years.push(y);
    }
    if (bad) continue;
    const coinAt = new Map(slots.map((s, k) => [s, years[k]]));
    // running TPQ
    const tpq = [];
    let run = -Infinity, runY = 0;
    for (let k = 0; k < n; k++) {
      if (coinAt.has(k) && A0n(coinAt.get(k)) > run) { run = A0n(coinAt.get(k)); runY = coinAt.get(k); }
      tpq.push(runY);
    }
    const inherited = (k) => !coinAt.has(k) || coinAt.get(k) !== tpq[k];
    // target context
    const cands = [];
    for (let k = 0; k < n; k++) {
      if (tier === "medium") { cands.push(k); continue; }
      if (k >= 1 && k <= n - 2 && inherited(k)) cands.push(k);
    }
    if (!cands.length) continue;
    const xi = rng.pick(cands), X = order[xi], tX = tpq[xi];
    const later = n - 1 - xi;
    // relations (chain of adjacent pairs, three wordings, shuffled)
    const rels = [];
    const lines = [];
    for (let k = 0; k < n - 1; k++) {
      const lo = order[k], hi = order[k + 1];
      const f = rng.int(0, 2);
      rels.push({ lo, hi });
      lines.push(f === 0 ? `${cb(hi)} lies over ${cb(lo)}` : f === 1 ? `${cb(lo)} is cut by ${cb(hi)}` : `${cb(lo)} is sealed beneath ${cb(hi)}`);
    }
    const relLines = rng.shuffle(lines);
    // order choice
    const rev = order.slice().reverse();
    const swaps = rng.shuffle([...Array(n - 1)].map((_, k) => k)).slice(0, 2).map((k) => { const c = order.slice(); [c[k], c[k + 1]] = [c[k + 1], c[k]]; return c; });
    const opts = rng.shuffle([order, rev, ...swaps].map(seq));
    if (new Set(opts).size !== 4) continue;
    const orderP = choicePart("order", "Order", "Order of the contexts, oldest first", seq(order), opts, "Every statement says which of two contexts is later. Start from the context that is never later than another and chain the statements.");
    const tpqP = yearPart("tpq", "TPQ", `Terminus post quem of context ${cb(X)} (earliest year it can date from)`, tX, "The newest coin in the context or in any earlier one sets the year. Use the oldest-first order, and compare years with BC counting down.");
    const coinLines = order.map((c, k) => (coinAt.has(k) ? `- ${cb(c)}: a coin struck in **${yr(coinAt.get(k))}**` : `- ${cb(c)}: no datable finds`));
    const coinShuf = rng.shuffle(coinLines);
    let parts, extra = {}, ex;
    const exBase = [
      `**Order (oldest first):** ${seq(order)}.`,
      `**TPQ of ${cb(X)}:** the newest coin in ${cb(X)} or below it is struck in ${yr(tX)}, so **${yr(tX)}**.`,
    ];
    if (tier === "medium") parts = [orderP, tpqP];
    else if (tier === "hard") {
      parts = [orderP, tpqP, numPart("later", "Later contexts", `How many contexts are definitely later than ${cb(X)}?`, later, "Contexts later than X are all the ones above it in the order you found.")];
      exBase.push(`**Later contexts:** ${later} contexts lie above ${cb(X)}.`);
    } else if (tier === "expert") {
      const dz = rng.int(2, 12) * 10, yes = rng.next() < 0.5;
      const Z = shiftY(tX, yes ? dz : -dz);
      extra = { Z };
      parts = [orderP, tpqP,
        numPart("later", "Later contexts", `How many contexts are definitely later than ${cb(X)}?`, later, "Contexts later than X are all the ones above it in the order you found."),
        yesNo("could", "Could it be?", `Could ${cb(X)} have been laid down in ${yr(Z)}?`, yes, "A context cannot be laid down before its TPQ. Compare the year with the TPQ you found.")];
      exBase.push(`**Later contexts:** ${later}.`, `**Could it be ${yr(Z)}?** ${yr(Z)} is ${yes ? "after" : "before"} the TPQ ${yr(tX)}, so **${yes ? "Yes" : "No"}**.`);
    } else {
      const topTpq = tpq[n - 1];
      const T = shiftY(topTpq, rng.int(4, 40) * 5);
      const win = yearDistance(tX, T);
      let inh = 0;
      for (let k = 1; k < n; k++) if (inherited(k)) inh++;
      if (inh < 1) continue;
      extra = { T };
      parts = [orderP, tpqP,
        numPart("window", "Window", `Years from the TPQ of ${cb(X)} to the date of the top floor`, win, "Subtract the TPQ year from the floor's year; allow for the missing year 0 if one is BC and the other AD."),
        numPart("inherited", "Inherited TPQs", "How many contexts have a TPQ that comes from a coin in a lower context (not from their own coin)?", inh, "A context inherits its TPQ when it has no coin of its own, or its own coin is older than one found below it. Do not count the lowest context.")];
      exBase.push(`**Window:** from ${yr(tX)} to ${yr(T)} is **${win}** years.`, `**Inherited TPQs:** ${inh} of the contexts above the lowest take their TPQ from a coin below.`);
    }
    const bc = years.some((y) => y < 0) || (extra.Z && extra.Z < 0) || (extra.T && extra.T < 0);
    const floorText = tier === "expert-plus" ? ` The topmost context is a floor that is known from a building record to have been laid in **${yr(extra.T)}**.` : "";
    return finish(
      `A trench through a site records **${n} contexts** (layers and cuts), numbered in no particular order. The section shows:\n\n${relLines.map((l) => `- ${l}`).join("\n")}\n\nThe finds are:\n\n${coinShuf.join("\n")}\n\nA context that lies over, or cuts, another is **later** than it. A context cannot have been laid down before the newest coin struck in it **or in any earlier context**; that year is its **terminus post quem (TPQ)**.${floorText}${bc ? ` ${NO_ZERO}` : ""}`,
      parts, exBase.join("\n\n"), "arch-strat",
      { tier, ids: order.slice().sort((a, b) => a - b), rels, coins: [...coinAt].map(([k, y]) => ({ id: order[k], y })), X, ...extra },
      [...[...coinAt].map(([k, y]) => gv(`_coin${order[k]}`, y)), ...(extra.Z ? [gv("_year_z", extra.Z)] : []), ...(extra.T ? [gv("_floor", extra.T)] : [])],
      ["Put the contexts in order first; the other parts use that order.", "TPQ only ever moves up as you go to later contexts."],
    );
  }
  return tooMany();
}

// ---------- trench-finds ----------

// Density is drawn in quarters of a find per m2/m3 (k/4); volumes in tenths of a m3 (integers), so
// finds N = (k/4) × (vol10/10) is checked to be a whole number rather than rounded.
const RATES = [4, 5, 6, 8, 10, 12]; // m3 per digger per day, in tenths

function genTrench(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const L = rng.int(4, 14), W = rng.int(2, 6), area = L * W;
    const tag = `${rng.pick(["A", "B", "C", "D", "E", "F", "G", "H"])}${rng.int(1, 30)}`;
    const k = rng.int(2, 40);
    if (tier === "medium") {
      if ((k * area) % 4 !== 0) continue;
      const N = (k * area) / 4;
      if (N < 20 || N > 400) continue;
      const parts = [
        numPart("area", "Area", "Area of the trench in m²", area, "Area of a rectangle = length × width."),
        numPart("density", "Density", "Finds per m² (2 decimal places)", k / 4, "Density = number of finds ÷ area.", 2),
      ];
      return finish(
        `Trench **${tag}** is a rectangle **${L} m** long and **${W} m** wide. The team records **${N} finds** from it altogether. Give the density to 2 decimal places.`,
        parts, `**Area:** ${L} × ${W} = **${area}** m².\n\n**Density:** ${N} ÷ ${area} = **${fmt(k / 4)}** finds per m².`,
        "arch-trench", { tier, L, W, N }, [["_length", L], ["_width", W], ["_finds", N]],
        ["Find the area first, then divide the number of finds by it.", "Area of a rectangle = length × width."],
      );
    }
    const dep10 = rng.int(4, 18), vol10 = area * dep10; // tenths of m3
    const vol = vol10 / 10;
    const nd = rng.int(2, 6), r10 = rng.pick(RATES);
    const raw = vol10 / (nd * r10), fr = raw - Math.floor(raw);
    const days = Math.ceil(raw);
    if (fr < 0.1 || fr > 0.9 || days < 3) continue;
    if (tier === "hard") {
      if ((k * vol10) % 40 !== 0) continue;
      const N = (k * vol10) / 40;
      if (N < 20 || N > 600) continue;
      const parts = [
        numPart("volume", "Volume", "Volume of soil removed in m³", vol, "Volume = length × width × depth.", 2),
        numPart("density", "Density", "Finds per m³ (2 decimal places)", k / 4, "Density = number of finds ÷ volume.", 2),
        numPart("days", "Days", "Whole days to dig the trench (round up)", days, "Days = volume ÷ (diggers × rate per digger per day), rounded up to a whole day."),
      ];
      return finish(
        `Trench **${tag}** is **${L} m** long, **${W} m** wide and dug to a flat floor **${fmt(dep10 / 10)} m** deep. It produces **${N} finds**. A team of **${nd} diggers** each removes **${fmt(r10 / 10)} m³** of soil per day. A part day counts as a whole day.`,
        parts, `**Volume:** ${L} × ${W} × ${fmt(dep10 / 10)} = **${fmt(vol)}** m³.\n\n**Density:** ${N} ÷ ${fmt(vol)} = **${fmt(k / 4)}** finds per m³.\n\n**Days:** the team removes ${fmt(nd * r10 / 10)} m³ a day, so ${fmt(vol)} ÷ ${fmt(nd * r10 / 10)} = ${roundTo(raw, 2)}, which rounds up to **${days}** days.`,
        "arch-trench", { tier, L, W, dep10, N, nd, r10 }, [["_length", L], ["_width", W], ["_depth", dep10 / 10], ["_finds", N], ["_diggers", nd], ["_rate", r10 / 10]],
        ["Volume first; density and the digging time both use it.", "Round the number of days up, because a part day still has to be worked."],
      );
    }
    if (tier === "expert") {
      const d2 = rng.int(3, 10), k2 = rng.int(2, 40);
      const v2 = area * d2; // tenths
      if (Math.abs(k - k2) < 3 || (k * vol10) % 40 !== 0 || (k2 * v2) % 40 !== 0) continue;
      const N1 = (k * vol10) / 40, N2 = (k2 * v2) / 40;
      if (N1 < 10 || N2 < 10 || N1 > 500 || N2 > 500) continue;
      const richer = k > k2 ? "Spit 1" : "Spit 2";
      const tot = (vol10 + v2) / 10;
      const parts = [
        numPart("volume", "Total volume", "Total volume of both spits in m³", tot, "Add the volumes of the two spits, each length × width × depth.", 2),
        numPart("d1", "Spit 1", "Finds per m³ in Spit 1 (2 decimal places)", k / 4, "Finds in the spit ÷ volume of the spit.", 2),
        numPart("d2", "Spit 2", "Finds per m³ in Spit 2 (2 decimal places)", k2 / 4, "Finds in the spit ÷ volume of the spit.", 2),
        choicePart("richer", "Richer spit", "Which spit has the higher density of finds?", richer, ["Spit 1", "Spit 2"], "Compare the two densities, not the two totals."),
      ];
      return finish(
        `Trench **${tag}**, **${L} m** by **${W} m**, is dug in two spits. **Spit 1** is **${fmt(dep10 / 10)} m** deep and yields **${N1} finds**. **Spit 2** below it is **${fmt(d2 / 10)} m** deep and yields **${N2} finds**.`,
        parts, `**Total volume:** ${area} × (${fmt(dep10 / 10)} + ${fmt(d2 / 10)}) = **${fmt(tot)}** m³.\n\n**Spit 1:** ${N1} ÷ ${fmt(vol)} = **${fmt(k / 4)}** per m³.\n\n**Spit 2:** ${N2} ÷ ${fmt(v2 / 10)} = **${fmt(k2 / 4)}** per m³.\n\n**Richer:** **${richer}**.`,
        "arch-trench", { tier, L, W, dep10, d2, N1, N2 }, [["_length", L], ["_width", W], ["_depth1", dep10 / 10], ["_depth2", d2 / 10], ["_finds1", N1], ["_finds2", N2]],
        ["Each spit has its own volume and its own density.", "Compare densities (finds per m³), not totals."],
      );
    }
    // expert-plus: work back from the density and the number of finds
    const L2 = rng.int(3, 10), W2 = rng.int(2, 5), a2 = L2 * W2;
    if ((k * vol10) % 40 !== 0 || (k * a2 * dep10) % 40 !== 0) continue;
    const N = (k * vol10) / 40, N2 = (k * a2 * dep10) / 40;
    if (N < 20 || N > 600 || N2 < 10) continue;
    const parts = [
      numPart("volume", "Volume", "Volume of soil that was dug, in m³", vol, "Volume = number of finds ÷ finds per m³.", 2),
      numPart("depth", "Depth", "Depth of the trench in m (2 decimal places)", dep10 / 10, "Depth = volume ÷ area of the trench floor.", 2),
      numPart("days", "Days", "Whole days the team took (round up)", days, "Days = volume ÷ (diggers × rate per digger per day), rounded up."),
      numPart("next", "Next trench", "Finds expected in the neighbouring trench", N2, "Density × volume of the neighbouring trench, where its volume = its area × the same depth."),
    ];
    return finish(
      `Trench **${tag}**, **${L} m** long and **${W} m** wide with a flat floor, produced **${N} finds** at an average density of **${fmt(k / 4)} finds per m³**. A team of **${nd} diggers**, each removing **${fmt(r10 / 10)} m³** per day, dug it (a part day counts as a whole day). A neighbouring trench **${L2} m** by **${W2} m** will be dug to the **same depth**, and is expected to give the **same density**.`,
      parts, `**Volume:** ${N} ÷ ${fmt(k / 4)} = **${fmt(vol)}** m³.\n\n**Depth:** ${fmt(vol)} ÷ ${area} = **${fmt(dep10 / 10)}** m.\n\n**Days:** ${fmt(vol)} ÷ ${fmt(nd * r10 / 10)} = ${roundTo(raw, 2)}, rounded up to **${days}**.\n\n**Next trench:** ${fmt(k / 4)} × ${a2} × ${fmt(dep10 / 10)} = **${N2}** finds.`,
      "arch-trench", { tier, L, W, N, k, nd, r10, L2, W2 }, [["_length", L], ["_width", W], ["_finds", N], ["_density", k / 4], ["_diggers", nd], ["_rate", r10 / 10], ["_length2", L2], ["_width2", W2]],
      ["Work back from the finds and the density to the volume; the depth comes from the volume and the floor area.", "The neighbouring trench uses the same depth and density."],
    );
  }
  return tooMany();
}

// ---------- pottery-counts ----------

const DIV = [20, 25, 40, 50, 80, 100, 125, 200, 250, 400]; // totals that divide 10 000, so % are exact to 2 dp
const FABRICS = ["Grey ware", "Red slip ware", "Buff ware", "Black burnished ware", "Coarse gritty ware"];
const ARCS = [5, 10, 15, 20, 25, 30, 35, 40];

const pct2 = (c, t) => (c * 100) / t;

function genPottery(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const names = rng.shuffle(FABRICS).slice(0, 3);
    if (tier !== "expert-plus") {
      const T = rng.pick(DIV);
      const a = rng.int(Math.ceil(T * 0.12), Math.floor(T * 0.5)), b = rng.int(Math.ceil(T * 0.12), Math.floor(T * 0.5));
      const c = T - a - b;
      if (c < Math.ceil(T * 0.1)) continue;
      const counts = [a, b, c];
      const t = rng.int(0, 2); // target fabric
      const totalP = numPart("total", "Total", "Total number of sherds", T, "Add the three counts.");
      const pctP = numPart("pct", "Percentage", `Percentage of all sherds that are ${names[t].toLowerCase()} (2 decimal places)`, pct2(counts[t], T), "Percentage = count of the fabric ÷ total × 100.", 2);
      const tbl = `| Fabric | Sherds |\n|---|---|\n${names.map((nm, k) => `| ${nm} | ${counts[k]} |`).join("\n")}`;
      if (tier === "medium") {
        return finish(
          `A pottery assemblage from a pit is sorted by fabric:\n\n${tbl}`,
          [totalP, pctP], `**Total:** ${counts.join(" + ")} = **${T}**.\n\n**Percentage:** ${counts[t]} ÷ ${T} × 100 = **${fmt(pct2(counts[t], T))}%**.`,
          "arch-pot", { tier, counts, t }, counts.map((c, k) => [`_f${k + 1}`, c]),
          ["Find the total first; the percentage is a share of it.", "Percentage = part ÷ whole × 100."],
        );
      }
      // rim arcs for target (hard) or all three (expert); the highest EVE is fitted to a random target
      const nRim = tier === "hard" ? 1 : 3;
      const winner = rng.int(0, 2);
      const rims = [];
      for (let k = 0; k < nRim; k++) {
        const m = rng.int(3, 5), arr = [];
        for (let j = 0; j < m; j++) arr.push(rng.pick(ARCS));
        rims.push(arr);
      }
      const tgtRim = tier === "hard" ? rims[0] : rims[t];
      const sum = (arr) => arr.reduce((s, x) => s + x, 0);
      let hi = -1;
      if (tier === "expert") {
        const sums = rims.map(sum);
        const mx = Math.max(...sums);
        hi = sums.indexOf(mx);
        if (sums.filter((s) => s >= mx - 15).length > 1 || hi !== winner) continue;
      }
      const eve = sum(tgtRim) / 100;
      const eveP = numPart("eve", "EVE", `Estimated vessel equivalents (EVE) of ${names[t].toLowerCase()} (2 decimal places)`, eve, "EVE = the total of the rim percentages ÷ 100.", 2);
      const arcText = (arr) => arr.map((x) => `${x}%`).join(", ");
      const rimTxt = tier === "hard"
        ? `The rim sherds of ${names[t].toLowerCase()} preserve **${arcText(tgtRim)}** of a full rim circle.`
        : `The rim sherds preserve this share of a full rim circle:\n\n${names.map((nm, k) => `- ${nm}: **${arcText(rims[k])}**`).join("\n")}`;
      const parts = [totalP, pctP, eveP];
      let ex = `**Total:** **${T}**.\n\n**Percentage:** ${counts[t]} ÷ ${T} × 100 = **${fmt(pct2(counts[t], T))}%**.\n\n**EVE:** (${tgtRim.join(" + ")}) ÷ 100 = **${fmt(eve)}**.`;
      if (tier === "expert") {
        parts.push(choicePart("top", "Highest EVE", "Which fabric has the highest EVE?", names[hi], rng.shuffle(names.slice()), "Add up the rim percentages for each fabric and compare the totals."));
        ex += `\n\n**Highest EVE:** the totals are ${rims.map((r, k) => `${names[k]} ${fmt(sum(r) / 100)}`).join(", ")}, so **${names[hi]}**.`;
      }
      return finish(
        `A pottery assemblage from a pit is sorted by fabric:\n\n${tbl}\n\n${rimTxt} **EVE** is the total of the rim percentages ÷ 100.`,
        parts, ex, "arch-pot", { tier, counts, t, rims: tier === "hard" ? [rims[0]] : rims, names },
        counts.map((c, k) => [`_f${k + 1}`, c]),
        ["Total and percentage first, then add up the rim arcs.", "EVE counts how many whole rims the rim sherds add up to."],
      );
    }
    // expert-plus: work back from one fabric's count and percentage, then a second season
    const T = rng.pick(DIV);
    const nX = rng.int(Math.ceil(T * 0.1), Math.floor(T * 0.4));
    const R = T - nX, ra = rng.int(1, 4), rb = rng.int(1, 4);
    if (ra === rb || R % (ra + rb) !== 0) continue;
    const nY = (R / (ra + rb)) * ra, nZ = (R / (ra + rb)) * rb;
    if (nY < 3 || nZ < 3) continue;
    const M = rng.int(5, 200);
    const T2 = T + M;
    if (!DIV.includes(T2)) continue;
    const after = [nX, nY, nZ + M];
    const hi = after.indexOf(Math.max(...after));
    const srt = after.slice().sort((p, q) => q - p);
    if (srt[0] - srt[1] < 3 || hi !== rng.int(0, 2)) continue;
    const p = pct2(nX, T), p2 = pct2(nX, T2);
    const nm = [names[0], names[1], names[2]];
    const parts = [
      numPart("total", "Total", "Total number of sherds in the first season", T, "The count of the first fabric is p% of the total, so total = count × 100 ÷ p."),
      numPart("second", "Second fabric", `Number of ${nm[1].toLowerCase()} sherds`, nY, "Take the first fabric away from the total, then share what is left in the stated ratio."),
      numPart("pct2", "New share", `Percentage of ${nm[0].toLowerCase()} once the second season is added (2 decimal places)`, p2, "New share = the unchanged count ÷ the new total × 100.", 2),
      choicePart("top", "Most common", "Which fabric is the most common once the second season is added?", nm[hi], rng.shuffle(nm.slice()), "Add the second season's sherds to the fabric they belong to, then compare all three counts."),
    ];
    const ex = `**Total:** ${nX} × 100 ÷ ${fmt(p)} = **${T}**.\n\n**${nm[1]}:** ${T} − ${nX} = ${R}, shared ${ra} : ${rb}, so ${nm[1].toLowerCase()} is ${ra} × ${R / (ra + rb)} = **${nY}** (and ${nm[2].toLowerCase()} ${nZ}).\n\n**New share:** ${nX} ÷ ${T2} × 100 = **${fmt(p2)}%**.\n\n**Most common:** ${nm[0]} ${after[0]}, ${nm[1]} ${after[1]}, ${nm[2]} ${after[2]}, so **${nm[hi]}**.`;
    return finish(
      `In a first season of digging, **${nX}** sherds of **${nm[0].toLowerCase()}** make up **${fmt(p)}%** of all the sherds found. The remaining sherds are **${nm[1].toLowerCase()}** and **${nm[2].toLowerCase()}** in the ratio **${ra} : ${rb}**. A second season adds **${M}** more sherds, **all ${nm[2].toLowerCase()}**.`,
      parts, ex, "arch-pot-plus", { nX, p, ra, rb, M, names: nm },
      [["_count", nX], ["_pct", p], ["_ratio_a", ra], ["_ratio_b", rb], ["_extra", M]],
      ["The percentage and the count give the total; everything else follows from the total.", "Share the sherds that are not the first fabric in the ratio."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "radiocarbon") return genRadio(rng, difficulty);
  if (subtopic === "stratigraphy") return genStrat(rng, difficulty);
  if (subtopic === "trench-finds") return genTrench(rng, difficulty);
  if (subtopic === "pottery-counts") return genPottery(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Years are re-derived on the astronomical scale (1 BC = 0). Half-lives come from log2 of the stated
// percentage (generation used a lookup of whole half-lives). Context order is found by brute force over
// every permutation (it must be unique). Trench figures use integer tenths; sherd percentages use a
// different formula route. Each part is compared by value.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (a, id) => (a && typeof a === "object" ? num(a[id]) : NaN);
const partStr = (a, id) => {
  const v = a && typeof a === "object" ? a[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (c, t, tol) => Number.isFinite(c) && Math.abs(c - t) <= tol + 1e-9;
const A0 = (y) => (y < 0 ? y + 1 : y);
const F0 = (a) => (a <= 0 ? a - 1 : a);
const span = (a, b) => Math.abs(A0(a) - A0(b));
const move = (y, n) => F0(A0(y) + n);
const parseY = (s) => {
  const t = String(s).trim().toLowerCase().replace(/−/g, "-").replace(/\./g, "");
  let m = /^(\d{1,4})\s*(?:bc|bce)$/.exec(t);
  if (m) return -Number(m[1]);
  m = /^-(\d{1,4})$/.exec(t);
  if (m) return -Number(m[1]);
  m = /^(?:ad|ce)\s*(\d{1,4})$/.exec(t) || /^(\d{1,4})\s*(?:ad|ce)?$/.exec(t);
  return m && Number(m[1]) > 0 ? Number(m[1]) : NaN;
};
const YN = (b) => (b ? "Yes" : "No");

function perms(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => { for (const r of perms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...r]); });
  return out;
}

const ALT = {
  "arch-radio": (p) => {
    const half = (pc) => Math.round(Math.log2(100 / pc));
    const na = half(p.pa), age = na * HL;
    const t = { halves: na, age, year: move(p.M, -age) };
    if (p.pb !== undefined) {
      const nb = half(p.pb);
      t.gap = Math.abs(na - nb) * HL;
      t.older = na > nb ? "Sample A" : "Sample B";
    }
    if (p.yb !== undefined) {
      const ageB = span(p.M, p.yb);
      t.pctb = 100 / Math.pow(2, ageB / HL);
      t.consistent = YN(ageB > age);
    }
    return t;
  },
  "arch-strat": (p) => {
    const ok = perms(p.ids).filter((o) => p.rels.every((r) => o.indexOf(r.lo) < o.indexOf(r.hi)));
    if (ok.length !== 1) throw new Error("order not unique");
    const o = ok[0];
    const t = { order: o.join(" → ") };
    const own = new Map(p.coins.map((c) => [c.id, c.y]));
    const tp = o.map((_, k) => {
      let best = null;
      for (let j = 0; j <= k; j++) if (own.has(o[j]) && (best === null || A0(own.get(o[j])) > A0(best))) best = own.get(o[j]);
      return best;
    });
    const xi = o.indexOf(p.X);
    t.tpq = tp[xi];
    t.later = o.length - 1 - xi;
    if (p.Z !== undefined) t.could = YN(A0(p.Z) >= A0(tp[xi]));
    if (p.T !== undefined) {
      t.window = span(tp[xi], p.T);
      t.inherited = o.filter((c, k) => k > 0 && !(own.has(c) && A0(own.get(c)) === A0(tp[k]))).length;
    }
    return t;
  },
  "arch-trench": (p) => {
    const area = p.L * p.W;
    if (p.tier === "medium") return { area, density: p.N / area };
    if (p.tier === "hard") {
      const vol = (area * p.dep10) / 10;
      return { volume: vol, density: p.N / vol, days: Math.ceil((vol * 10) / (p.nd * p.r10) - 1e-9) };
    }
    if (p.tier === "expert") {
      const v1 = (area * p.dep10) / 10, v2 = (area * p.d2) / 10;
      const d1 = p.N1 / v1, d2 = p.N2 / v2;
      return { volume: v1 + v2, d1, d2, richer: d1 > d2 ? "Spit 1" : "Spit 2" };
    }
    const dens = p.k / 4;
    const vol = p.N / dens, depth = vol / area;
    return { volume: vol, depth, days: Math.ceil((vol * 10) / (p.nd * p.r10) - 1e-9), next: dens * (p.L2 * p.W2) * depth };
  },
  "arch-pot": (p) => {
    const T = p.counts.reduce((s, x) => s + x, 0);
    const t = { total: T, pct: (p.counts[p.t] / T) * 100 };
    if (p.rims) {
      const eves = p.rims.map((r) => r.reduce((s, x) => s + x, 0) / 100);
      t.eve = p.tier === "hard" ? eves[0] : eves[p.t];
      if (p.tier === "expert") t.top = p.names[eves.indexOf(Math.max(...eves))];
    }
    return t;
  },
  "arch-pot-plus": (p) => {
    const T = Math.round((p.nX * 100) / p.p);
    const R = T - p.nX, nY = (R * p.ra) / (p.ra + p.rb), nZ = (R * p.rb) / (p.ra + p.rb);
    const after = [p.nX, nY, nZ + p.M];
    return {
      total: T, second: nY, pct2: (p.nX / (T + p.M)) * 100,
      top: p.names[after.indexOf(Math.max(...after))],
    };
  },
};

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
    if (tv === undefined) return false;
    if (part.answerType === "number") {
      if (!near(partNum(answer, part.id), tv, part.tolerance || 0)) return false;
    } else if (part.answerType === "date") {
      if (parseY(partStr(answer, part.id)) !== tv) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
