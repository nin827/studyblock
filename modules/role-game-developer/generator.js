// Game Developer role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only
// values already drawn (no rng calls), and verify() recomputes every part by another route
// (simulation, loops and summation instead of the closed forms used to generate).
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   move-collide  speed -> frame the wall is hit -> time -> rule; expert+: velocity, speed, heading   (Gameplay)
//   loot-odds     P(at least one) -> expected pulls -> target / pity; expert+: pulls for confidence    (Designer)
//   xp-curve      level cost -> total XP -> hours -> budget; expert+: level reached from XP earned      (Designer)
//   frame-budget  ms per frame -> entities that fit -> headroom / pair checks; expert+: cost per entity (Gameplay)

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
const fmt = (n, d = 4) => String(roundTo(n, d));
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };

function numPart(id, label, ask, val, dp, hint) {
  const p = { id: id.toLowerCase(), label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
  return p;
}
// A whole-number count: exact, no close credit.
function intPart(id, label, ask, val, hint) {
  return { id: id.toLowerCase(), label, ask, answerType: "number", answer: val, tolerance: 0, fuzzyNumber: 0, hint, _dp: 0 };
}
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
const TRY = 20000;
const tooMany = () => { throw new Error("role-game-developer: no suitable draw"); };
const keysFor = (tier, order) => order.slice(0, TIER_PARTS[tier]);
const frac = (x) => x - Math.floor(x);
const GENRES = ["a farming game", "a racing game", "a card battler", "a space shooter", "a puzzle platformer", "a fishing game", "a tower defence game", "a city builder", "a stealth game", "a rhythm game", "a monster tamer", "a dungeon crawler"];

// ---------- move-collide ----------

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [20, 21, 29]];
const SCALES = [0.1, 0.2, 0.25, 0.5, 1, 1.5, 2];
const FPS_MOVE = [30, 40, 50, 60];

// M1: velocity -> speed -> frames to the wall -> time (ms) -> inside the trigger window?
function genMove(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const t = rng.pick(TRIPLES);
    const k = rng.pick(SCALES);
    const swap = rng.next() < 0.5;
    const vx = roundTo((swap ? t[1] : t[0]) * k, 2);
    const vy = roundTo((swap ? t[0] : t[1]) * k * (rng.next() < 0.5 ? 1 : -1), 2);
    const x0 = rng.int(0, 20) * 10;
    const fps = rng.pick(FPS_MOVE);
    const need = rng.int(60, 600) / 4;
    const W = x0 + Math.ceil(need);
    const d = (W - x0) / vx;
    if (d < 3 || d > 400 || frac(d) < 0.1 || frac(d) > 0.9) continue;
    const speed = Math.hypot(vx, vy);
    if (nearHalf(speed, 2)) continue;
    const fr = Math.ceil(roundTo(d, 6));
    const ms = (fr * 1000) / fps;
    if (nearHalf(ms, 1)) continue;
    const L = rng.pick([100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500]);
    if (Math.abs(ms - L) / L < 0.06) continue;
    const ok = ms <= L;
    const all = {
      sp: numPart("sp", "Speed", "Speed of the character (px per frame)", speed, 2, "Speed is the length of the velocity vector: square each component, add, then take the square root."),
      fr: intPart("fr", "Frames to the wall", "Number of the first frame on which the character is at or past the wall", fr, `Distance to the wall is ${W} − ${x0} px. Divide by the x-velocity and round up, because only whole frames happen.`),
      ms: numPart("ms", "Time", "Time from the start until that frame (ms)", ms, 1, `Each frame lasts 1000 ÷ ${fps} ms. Multiply by your frame count.`),
      ok: yesNo("ok", "In time?", `The wall-hit effect must start within ${L} ms of the start. Does it?`, ok, "Compare your time in ms with the limit."),
    };
    const ex = {
      sp: `**Speed:** √(${vx}² + ${vy}²) = **${fixed(speed, 2)} px/frame**.`,
      fr: `**Frames:** (${W} − ${x0}) ÷ ${vx} = ${fmt(d, 3)}, rounded up to **${fr}**.`,
      ms: `**Time:** ${fr} ÷ ${fps} × 1000 = **${fixed(ms, 1)} ms**.`,
      ok: `**Rule:** ${fixed(ms, 1)} ms is ${ok ? "within" : "over"} ${L} ms, so **${ok ? "Yes" : "No"}**.`,
    };
    const ks = keysFor(tier, ["sp", "fr", "ms", "ok"]);
    return finish(
      `In a game running at **${fps} fps**, a character starts at x = **${x0} px** and moves with the constant velocity (**${vx}**, **${vy}**) px per frame. A wall stands at x = **${W} px**.${tier === "expert" ? ` The wall-hit effect must start within **${L} ms** of the start.` : ""}`,
      ks.map((k) => all[k]), ks.map((k) => ex[k]).join("\n\n"), "gd-move", { vx, vy, x0, W, fps, L },
      [["_vx", vx], ["_vy", vy], ["_start", x0], ["_wall", W], ["_fps", fps]],
      ["Treat the two velocity components separately: x decides when the wall is reached, and both give the speed.", "The wall is reached on a whole frame, so round the frame count up before converting to time."],
    );
  }
  return tooMany();
}

const HEADINGS = ["Below 30°", "30° to 60°", "Above 60°"];
// M2 (expert+): frames observed -> velocity -> speed -> heading -> legal? (segmented call)
function genMoveBack(rng) {
  const cols = ["Speed cap", "Heading"];
  const choices = [];
  for (const a of ["Within the cap", "Over the cap"]) for (const h of HEADINGS) choices.push([a, h]);
  for (let i = 0; i < TRY; i++) {
    const q = rng.int(2, 24);
    const F = 4 * rng.int(2, 12);
    const vx = q * 0.25;
    const x0 = rng.int(0, 15) * 10;
    const W = x0 + q * (F / 4);
    const vy = rng.int(1, 40) * 0.25 * (rng.next() < 0.5 ? 1 : -1);
    const st = (rd) => {
      const vxr = rd("vx", (W - x0) / F);
      const sp = rd("sp", Math.hypot(vxr, vy));
      const ang = rd("ang", (Math.atan(Math.abs(vy) / vxr) * 180) / Math.PI);
      return { vx: vxr, sp, ang };
    };
    const dps = { vx: 2, sp: 2, ang: 1 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const cap = roundTo(r.sp * rng.pick([0.8, 0.9, 1.1, 1.25]), 1);
    if (Math.abs(r.sp - cap) / cap < 0.04) continue;
    if ([30, 60].some((b) => Math.abs(r.ang - b) < 3)) continue;
    const over = r.sp > cap;
    const head = r.ang < 30 ? HEADINGS[0] : r.ang <= 60 ? HEADINGS[1] : HEADINGS[2];
    const ans = [over ? "Over the cap" : "Within the cap", head];
    const parts = [
      numPart("vx", "x-velocity", "Velocity in x needed (px per frame)", r.vx, 2, "The character covers the distance to the wall in exactly the stated number of frames: velocity = distance ÷ frames."),
      numPart("sp", "Speed", "Speed of the character (px per frame)", r.sp, 2, "Combine the x-velocity you found with the y-velocity: the square root of the sum of squares."),
      numPart("ang", "Heading", "Angle above the x-axis (degrees, ignore the sign of vy)", r.ang, 1, "The tangent of the angle is the y-velocity (ignoring sign) divided by the x-velocity."),
      { id: "call", label: "Design call", ask: `The movement code caps speed at ${cap} px per frame. Is the speed within the cap, and which band is the heading in?`, answerType: "choice", choiceCols: cols, choices, answer: ans, hint: "Compare your speed with the cap, and your angle with 30° and 60°. Pick the option that matches both columns." },
    ];
    const ex = [
      `**x-velocity:** (${W} − ${x0}) ÷ ${F} = **${fixed(r.vx, 2)} px/frame**.`,
      `**Speed:** √(${fixed(r.vx, 2)}² + ${Math.abs(vy)}²) = **${fixed(r.sp, 2)} px/frame**.`,
      `**Heading:** arctan(${Math.abs(vy)} ÷ ${fixed(r.vx, 2)}) = **${fixed(r.ang, 1)}°**.`,
      `**Call:** ${fixed(r.sp, 2)} is ${over ? "over" : "within"} the cap of ${cap}, and ${fixed(r.ang, 1)}° is in the band "${head}": **${ans.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `A character starts at x = **${x0} px** and a wall stands at x = **${W} px**. Playtesting shows it hits the wall on exactly frame **${F}**, moving with constant velocity in x. Its y-velocity is **${vy} px per frame**.`,
      parts, ex, "gd-moveback", { x0, W, F, vy, cap }, [["_start", x0], ["_wall", W], ["_frames", F], ["_vy", vy], ["_cap", cap]],
      ["Work backwards: the frame count and the distance give the x-velocity.", "Speed uses both components; the heading uses their ratio."],
    );
  }
  return tooMany();
}

// ---------- loot-odds ----------

const DROP_PCT = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20];

// L1: P(at least one rare in n) -> expected pulls -> expected with pity -> call
function genLoot(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const p = rng.pick(DROP_PCT);
    const q = 1 - p / 100;
    const n = rng.int(5, 120);
    const pa = 100 * (1 - q ** n);
    if (pa < 15 || pa > 97 || nearHalf(pa, 1)) continue;
    const e = 100 / p;
    if (nearHalf(e, 1)) continue;
    const H = rng.pick([10, 20, 30, 40, 50, 60, 75, 90]);
    const ep = (1 - q ** H) / (p / 100);
    if (nearHalf(ep, 1)) continue;
    const target = rng.pick([50, 60, 75, 80, 90]);
    const saving = ((e - ep) / e) * 100;
    const X = rng.pick([10, 20, 30]);
    const okT = pa >= target;
    const okS = saving >= X;
    if (Math.abs(pa - target) < 3) continue;
    if (tier === "expert" && (Math.abs(saving - X) < 3 || saving < 4)) continue;
    const useSave = tier === "expert";
    const all = {
      pa: numPart("pa", "At least one", `Chance of at least one rare in ${n} pulls (%)`, pa, 1, "It is easier to find the chance of no rare at all: (1 − p) multiplied by itself once per pull. Then take that away from 1."),
      e: numPart("e", "Expected pulls", "Expected number of pulls to the first rare", e, 1, "The expected wait for an event of chance p is 1 ÷ p (use p as a fraction, or 100 ÷ the percentage)."),
      ep: numPart("ep", "With pity", `Expected pulls to the first rare when a pity cap guarantees one on pull ${H}`, ep, 1, `The wait only counts pulls 1 to ${H}. Sum the chances that the item has not dropped yet before each of those pulls, or use (1 − (1 − p)^${H}) ÷ p.`),
      okT: yesNo("ok", "Target met?", `The design target is at least ${target}% for ${n} pulls. Is it met?`, okT, "Compare your percentage with the target."),
      okS: yesNo("ok", "Cap worth it?", `The team wants the pity cap to cut the expected pulls by at least ${X}%. Does it?`, okS, "Work out the saving as (expected without cap − expected with cap) ÷ expected without cap."),
    };
    const ex = {
      pa: `**At least one:** 1 − ${fmt(q, 3)}^${n} = **${fixed(pa, 1)}%**.`,
      e: `**Expected pulls:** 100 ÷ ${p} = **${fixed(e, 1)}**.`,
      ep: `**With pity:** (1 − ${fmt(q, 3)}^${H}) ÷ ${fmt(p / 100, 3)} = **${fixed(ep, 1)}**.`,
      okT: `**Target:** ${fixed(pa, 1)}% is ${okT ? "at least" : "below"} ${target}%, so **${okT ? "Yes" : "No"}**.`,
      okS: `**Cap:** the saving is (${fixed(e, 1)} − ${fixed(ep, 1)}) ÷ ${fixed(e, 1)} = ${fmt(saving, 1)}%, which is ${okS ? "at least" : "below"} ${X}%, so **${okS ? "Yes" : "No"}**.`,
    };
    const order = tier === "medium" ? ["pa", "e"] : tier === "hard" ? ["pa", "e", "okT"] : ["pa", "e", "ep", "okS"];
    // the Yes/No on the saving must not flip when computed from the rounded answers
    if (useSave && (roundTo(e, 1) - roundTo(ep, 1)) / roundTo(e, 1) * 100 >= X !== okS) continue;
    const given = [["_p", p], ["_pulls", n]].concat(tier === "hard" ? [["_target", target]] : []).concat(useSave ? [["_cap", H], ["_saving", X]] : []);
    return finish(
      `A loot box drops a rare item with a chance of **${p}%** on every pull, and pulls are independent.${tier === "hard" ? ` A player opens **${n}** boxes.` : ` A player opens **${n}** boxes.`}${useSave ? ` A pity rule guarantees a rare on pull **${H}** if none has dropped before.` : ""}`,
      order.map((k) => all[k]), order.map((k) => ex[k]).join("\n\n"), "gd-loot", { p, n, H, target, X, tier },
      given,
      ["Chances multiply across independent pulls. Start from the chance a single pull does not drop the rare.", "Expected waits come from the chance per pull, not from the number of pulls the player happens to open."],
    );
  }
  return tooMany();
}

const PITY_COLS = ["Pity cap", "Budget"];
const PITY_CHOICES = [["Cap comes first", "Within budget"], ["Cap comes first", "Over budget"], ["Cap comes later", "Within budget"], ["Cap comes later", "Over budget"]];
// L2 (expert+): pulls for a target confidence -> cost -> expected with pity -> call
function genLootBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const p = rng.pick(DROP_PCT.filter((x) => x <= 15));
    const q = 1 - p / 100;
    const t = rng.pick([50, 75, 90, 95, 99]);
    const raw = Math.log(1 - t / 100) / Math.log(q);
    if (frac(raw) < 0.1 || frac(raw) > 0.9) continue;
    const nmin = Math.ceil(raw);
    if (nmin < 5 || nmin > 400) continue;
    const price = rng.pick([50, 80, 100, 150, 160, 300]);
    const cost = nmin * price;
    const H = rng.pick([10, 20, 30, 40, 50, 60, 75, 90, 100, 150, 200]);
    if (Math.abs(H - nmin) < Math.max(5, nmin * 0.1)) continue;
    const ep = (1 - q ** H) / (p / 100);
    if (nearHalf(ep, 1)) continue;
    const bud = roundTo(cost * rng.pick([0.7, 0.85, 1.2, 1.5]), -2);
    if (bud < 100 || Math.abs(bud - cost) / cost < 0.08) continue;
    const first = H < nmin;
    const within = cost <= bud;
    const ans = [first ? "Cap comes first" : "Cap comes later", within ? "Within budget" : "Over budget"];
    const parts = [
      intPart("n", "Pulls needed", `Fewest pulls that give at least a ${t}% chance of one rare from the drop rate alone (ignore the pity rule here)`, nmin, "Solve (1 − p)ⁿ ≤ 1 − t with logarithms: n ≥ ln(1 − t) ÷ ln(1 − p). Round up to a whole number of pulls."),
      intPart("cost", "Cost", `Gems that many pulls cost (each pull costs ${price} gems)`, cost, "Multiply the pulls you found by the price of one pull."),
      numPart("ep", "With pity", `Expected pulls to the first rare when a pity cap guarantees one on pull ${H}`, ep, 1, `Expected pulls = (1 − (1 − p)^${H}) ÷ p, because the wait stops at pull ${H}.`),
      { id: "call", label: "Plan check", ask: `Does the pity cap (pull ${H}) arrive before or after the pulls needed, and is the cost within the player's budget of ${bud} gems?`, answerType: "choice", choiceCols: PITY_COLS, choices: PITY_CHOICES, answer: ans, hint: "Compare the cap pull with your number of pulls needed, and your gem cost with the budget. Pick the option that matches both columns." },
    ];
    const ex = [
      `**Pulls needed:** ln(1 − ${t / 100}) ÷ ln(${fmt(q, 3)}) = ${fmt(raw, 2)}, rounded up to **${nmin}**.`,
      `**Cost:** ${nmin} × ${price} = **${cost} gems**.`,
      `**With pity:** (1 − ${fmt(q, 3)}^${H}) ÷ ${fmt(p / 100, 3)} = **${fixed(ep, 1)}**.`,
      `**Plan check:** the cap at pull ${H} comes ${first ? "before" : "after"} pull ${nmin}, and ${cost} is ${within ? "within" : "over"} ${bud}: **${ans.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `A loot box drops a rare with a chance of **${p}%** per pull, independent each time. The designers want a **${t}%** chance of at least one rare. Each pull costs **${price} gems**, and a pity rule guarantees a rare on pull **${H}**. A player has budgeted **${bud} gems**.`,
      parts, ex, "gd-lootback", { p, t, price, H, bud }, [["_p", p], ["_conf", t], ["_price", price], ["_cap", H], ["_budget", bud]],
      ["Work backwards: ask how many pulls make the chance of no rare small enough.", "Whole pulls only, so round up."],
    );
  }
  return tooMany();
}

// ---------- xp-curve ----------

const CURVES = [
  { r: 2, bases: [50, 100, 120, 200, 250], maxL: 10 },
  { r: 3, bases: [20, 40, 100, 200], maxL: 8 },
  { r: 1.5, bases: [32, 64, 96, 160, 320], maxL: 6 },
  { r: 1.25, bases: [256, 512, 768], maxL: 5 },
];
const RATES = [200, 250, 400, 500, 600, 800, 1000, 1200];

// X1: cost of level L -> total to reach L -> hours -> inside the budget?
function genXp(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const cv = rng.pick(CURVES);
    const b = rng.pick(cv.bases);
    const L = rng.int(3, cv.maxL);
    const rate = rng.pick(RATES);
    const cost = b * cv.r ** (L - 1);
    const tot = (b * (cv.r ** L - 1)) / (cv.r - 1);
    if (!Number.isInteger(roundTo(cost, 6)) || !Number.isInteger(roundTo(tot, 6))) continue;
    const hr = tot / rate;
    if (hr < 0.5 || hr > 80 || nearHalf(hr, 1)) continue;
    const H = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 48]);
    if (Math.abs(hr - H) / H < 0.08) continue;
    const ok = hr <= H;
    const genre = tier === "medium" ? rng.pick(GENRES) : "a game";
    const all = {
      c: intPart("c", "Level cost", `XP needed for level ${L} alone`, roundTo(cost, 0), `Each level costs ${cv.r} times the one before. Level 1 costs ${b}, so level L costs ${b} × ${cv.r}^(L − 1).`),
      t: intPart("t", "Total XP", `Total XP needed to reach level ${L} from the start`, roundTo(tot, 0), `Add the costs of levels 1 to ${L}: a geometric series with first term ${b} and ratio ${cv.r}. Sum = first × (rⁿ − 1) ÷ (r − 1).`),
      h: numPart("h", "Hours", `Hours of play to reach level ${L} at ${rate} XP per hour`, hr, 1, "Hours = total XP ÷ XP earned per hour."),
      ok: yesNo("ok", "Within budget?", `The designers want level ${L} reached within ${H} hours. Is it?`, ok, "Compare your hours with the target."),
    };
    const ex = {
      c: `**Level cost:** ${b} × ${cv.r}^${L - 1} = **${roundTo(cost, 0)} XP**.`,
      t: `**Total:** ${b} × (${cv.r}^${L} − 1) ÷ (${cv.r} − 1) = **${roundTo(tot, 0)} XP**.`,
      h: `**Hours:** ${roundTo(tot, 0)} ÷ ${rate} = **${fixed(hr, 1)} h**.`,
      ok: `**Target:** ${fixed(hr, 1)} h is ${ok ? "within" : "over"} ${H} h, so **${ok ? "Yes" : "No"}**.`,
    };
    const ks = keysFor(tier, ["c", "t", "h", "ok"]);
    return finish(
      `${genre[0].toUpperCase() + genre.slice(1)} levels up on a geometric curve: level 1 needs **${b} XP**, and every later level needs **${cv.r} times** the XP of the level before.${tier !== "medium" ? ` A player earns **${rate} XP per hour**.` : ""}${tier === "expert" ? ` The target is level **${L}** within **${H} hours**.` : ""} Look at level **${L}**.`,
      ks.map((k) => all[k]), ks.map((k) => ex[k]).join("\n\n"), "gd-xp", { r: cv.r, b, L, rate, H },
      [["_base", b], ["_ratio", cv.r], ["_level", L]].concat(tier === "medium" ? [] : [["_rate", rate]]).concat(tier === "expert" ? [["_hours", H]] : []),
      ["Each level multiplies the previous cost by the same ratio, so powers appear.", "The total to reach a level is a sum of all the level costs up to it."],
    );
  }
  return tooMany();
}

// X2 (expert+): XP earned so far -> level reached -> XP left -> hours -> fits one session?
function genXpBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const cv = rng.pick(CURVES);
    const b = rng.pick(cv.bases);
    const N = rng.int(2, cv.maxL - 1);
    const next = b * cv.r ** N;
    const S = (b * (cv.r ** N - 1)) / (cv.r - 1);
    const S1 = (b * (cv.r ** (N + 1) - 1)) / (cv.r - 1);
    const f = rng.int(2, 8) / 10;
    const T = roundTo(S + f * next, 0);
    if (!Number.isInteger(roundTo(next, 6)) || !Number.isInteger(roundTo(S, 6)) || T <= S || T >= S1) continue;
    const rem = roundTo(S1 - T, 0);
    const rate = rng.pick(RATES);
    const hr = rem / rate;
    if (nearHalf(hr, 1) || hr < 0.2) continue;
    const sess = rng.pick([1, 2, 3, 4, 5, 6, 8]);
    if (Math.abs(hr - sess) / sess < 0.1) continue;
    const ok = hr <= sess;
    const st = (rd) => ({ rem: rd("rem", S1 - T), hr: rd("hr", (S1 - T) / rate) });
    if (!stableOk(st, { hr: 1 })) continue;
    const parts = [
      intPart("lv", "Level reached", "Highest level the player has reached", N, `Add the level costs one at a time (${b}, then × ${cv.r} each time) until the next total would pass the XP earned.`),
      intPart("rem", "XP to go", "XP still needed to reach the next level", rem, "Find the total XP needed for the next level (a geometric sum) and subtract the XP already earned."),
      numPart("hr", "Hours", `Hours to earn that XP at ${rate} XP per hour`, hr, 1, "Hours = XP needed ÷ XP per hour."),
      yesNo("ok", "One session?", `A play session lasts ${sess} hours. Can the player reach the next level within one session?`, ok, "Compare your hours with the session length."),
    ];
    const ex = [
      `**Level:** the totals are ${fmt(S, 0)} XP for level ${N} and ${fmt(S1, 0)} XP for level ${N + 1}. ${T} XP is between them, so the player is on level **${N}**.`,
      `**XP to go:** ${fmt(S1, 0)} − ${T} = **${rem} XP**.`,
      `**Hours:** ${rem} ÷ ${rate} = **${fixed(hr, 1)} h**.`,
      `**Session:** ${fixed(hr, 1)} h is ${ok ? "within" : "over"} ${sess} h, so **${ok ? "Yes" : "No"}**.`,
    ].join("\n\n");
    return finish(
      `A game levels up on a geometric curve: level 1 needs **${b} XP**, and every later level needs **${cv.r} times** the XP of the level before. A player has earned **${T} XP** in total so far and earns **${rate} XP per hour**.`,
      parts, ex, "gd-xpback", { r: cv.r, b, T, rate, sess }, [["_base", b], ["_ratio", cv.r], ["_earned", T], ["_rate", rate], ["_session", sess]],
      ["Work backwards from the XP earned: find which two level totals it sits between.", "The XP still needed is the next level's total minus what is already earned."],
    );
  }
  return tooMany();
}

// ---------- frame-budget ----------

const FPS_FRAME = [20, 25, 30, 40, 50, 60, 80, 100, 125, 200];
const FIXED_MS = [1, 1.5, 2, 2.5, 3, 4];
const PER_ENT = [0.01, 0.02, 0.025, 0.04, 0.05, 0.08];
const PER_PAIR = [0.0001, 0.0002, 0.0005];

// F1: budget -> entities that fit -> headroom / total with pair checks -> fits?
function genFrame(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const fps = rng.pick(FPS_FRAME);
    const f = rng.pick(FIXED_MS);
    const c = rng.pick(PER_ENT);
    const bud = 1000 / fps;
    const raw = (bud - f) / c;
    if (raw < 30 || raw > 900 || frac(raw) < 0.1 || frac(raw) > 0.9) continue;
    const nmax = Math.floor(raw);
    const cp = rng.pick(PER_PAIR);
    const n = rng.int(Math.max(10, Math.round(nmax * 0.5)), Math.round(nmax * 1.2));
    const st = (rd) => {
      const b = rd("bd", 1000 / fps);
      const nm = rd("nmax", Math.floor(roundTo((b - f) / c, 6)));
      const used = f + n * c;
      const hd = rd("hd", ((b - used) / b) * 100);
      const tot = rd("tot", f + n * c + ((n * (n - 1)) / 2) * cp);
      return { bd: b, nmax: nm, hd, tot };
    };
    const dps = tier === "expert" ? { bd: 2, nmax: 0, tot: 2 } : tier === "hard" ? { bd: 2, nmax: 0, hd: 1 } : { bd: 2, nmax: 0 };
    if (!stableOk(st, dps)) continue;
    const r = st((k, v) => v);
    const ok = r.tot <= r.bd;
    const genre = tier === "medium" ? rng.pick(GENRES) : "a game";
    if (tier === "expert" && Math.abs(r.tot - r.bd) / r.bd < 0.05) continue;
    const pairs = (n * (n - 1)) / 2;
    const all = {
      bd: numPart("bd", "Frame budget", `Time available per frame at ${fps} fps (ms)`, r.bd, 2, "One second is 1000 ms, shared among the frames in it: budget = 1000 ÷ fps."),
      nmax: intPart("nmax", "Entities that fit", `Most entities the frame can hold (each costs ${c} ms, on top of ${f} ms fixed), ignoring pair checks`, r.nmax, "Subtract the fixed cost from the budget, divide by the cost per entity, and round down (a part-entity does not fit)."),
      hd: numPart("hd", "Headroom", `Headroom with ${n} entities in the scene, as a percentage of the budget (%)`, r.hd, 1, "Used time = fixed cost + entities × cost each. Headroom = (budget − used) ÷ budget × 100. It is negative if the frame overruns."),
      tot: numPart("tot", "Total frame time", `Total time per frame with ${n} entities, including the pair checks (ms)`, r.tot, 2, `Every pair is checked once: n × (n − 1) ÷ 2 pairs, each costing ${cp} ms. Add that to the fixed cost and the entity cost.`),
      ok: yesNo("ok", "Fits?", "Does that total fit inside the frame budget?", ok, "Compare your total frame time with the budget."),
    };
    const ex = {
      bd: `**Budget:** 1000 ÷ ${fps} = **${fixed(r.bd, 2)} ms**.`,
      nmax: `**Entities:** (${fixed(r.bd, 2)} − ${f}) ÷ ${c} = ${fmt(raw, 2)}, rounded down to **${r.nmax}**.`,
      hd: `**Headroom:** used = ${f} + ${n} × ${c} = ${fmt(f + n * c, 3)} ms, so (${fixed(r.bd, 2)} − ${fmt(f + n * c, 3)}) ÷ ${fixed(r.bd, 2)} × 100 = **${fixed(r.hd, 1)}%**.`,
      tot: `**Total:** ${f} + ${n} × ${c} + ${pairs} × ${cp} = **${fixed(r.tot, 2)} ms**.`,
      ok: `**Fit:** ${fixed(r.tot, 2)} ms is ${ok ? "within" : "over"} ${fixed(r.bd, 2)} ms, so **${ok ? "Yes" : "No"}**.`,
    };
    const order = tier === "expert" ? ["bd", "nmax", "tot", "ok"] : tier === "hard" ? ["bd", "nmax", "hd"] : ["bd", "nmax"];
    const given = [["_fps", fps], ["_fixed", f], ["_each", c]].concat(tier === "medium" ? [] : [["_n", n]]).concat(tier === "expert" ? [["_pair", cp]] : []);
    return finish(
      `${genre[0].toUpperCase() + genre.slice(1)} runs at **${fps} fps**. Every frame has a fixed cost of **${f} ms** (rendering and audio), and each entity adds **${c} ms**.${tier === "medium" ? "" : ` The scene holds **${n}** entities.`}${tier === "expert" ? ` Collision checks every pair of entities once, at **${cp} ms** per pair.` : ""}`,
      order.map((k) => all[k]), order.map((k) => ex[k]).join("\n\n"), "gd-frame", { fps, f, c, n, cp },
      given,
      ["The frame budget is what is left of each second when it is divided among the frames.", "Costs add up per frame: a fixed part plus a part for every entity."],
    );
  }
  return tooMany();
}

const CUT_COLS = ["Frame rate", "Entities to cut"];
const CUT_BANDS = ["Less than 10%", "10% to 25%", "More than 25%"];
const CUT_CHOICES = [["Meets target", "None"], ...CUT_BANDS.map((b) => ["Misses target", b])];
// F2 (expert+): measured frame time -> cost per entity -> fps now -> entities at target -> cut (segmented)
function genFrameBack(rng) {
  for (let i = 0; i < TRY; i++) {
    const f = rng.pick([1, 2, 3, 4]);
    const c = rng.pick([0.005, 0.01, 0.015, 0.02, 0.025, 0.04, 0.05, 0.08]);
    const n = rng.int(4, 24) * 25;
    const T = roundTo(f + n * c, 3);
    const tf = rng.pick([30, 40, 50, 60, 72, 90]);
    const bud = 1000 / tf;
    const raw = (bud - f) / c;
    if (raw < Math.max(10, n * 0.55) || raw > n * 1.5 || frac(raw) < 0.1 || frac(raw) > 0.9) continue;
    const st = (rd) => {
      const cc = rd("c", (T - f) / n);
      const fp = rd("fps", 1000 / T);
      const nm = rd("nmax", Math.floor(roundTo((bud - f) / cc, 6)));
      return { c: cc, fps: fp, nmax: nm };
    };
    if (!stableOk(st, { c: 3, fps: 1, nmax: 0 })) continue;
    const r = st((k, v) => v);
    const cutFrac = n > r.nmax ? ((n - r.nmax) / n) * 100 : 0;
    if ([10, 25].some((b) => n > r.nmax && Math.abs(cutFrac - b) < 2)) continue;
    const ans = n <= r.nmax ? CUT_CHOICES[0] : ["Misses target", cutFrac < 10 ? CUT_BANDS[0] : cutFrac <= 25 ? CUT_BANDS[1] : CUT_BANDS[2]];
    const parts = [
      numPart("c", "Cost per entity", "Cost of each entity per frame (ms)", r.c, 3, "Take the fixed cost off the measured frame time, then share the rest among the entities."),
      numPart("fps", "Frame rate now", "Frame rate the game achieves now (fps)", r.fps, 1, "A frame of T ms means 1000 ÷ T frames fit in a second."),
      intPart("nmax", "Entities at target", `Most entities that still hit ${tf} fps`, r.nmax, `The budget at ${tf} fps is 1000 ÷ ${tf} ms. Subtract the fixed cost, divide by the cost per entity, and round down.`),
      { id: "call", label: "Cut needed", ask: `The scene has ${n} entities and the target is ${tf} fps. Does it meet the target, and if not, what share of the entities must be cut?`, answerType: "choice", choiceCols: CUT_COLS, choices: CUT_CHOICES, answer: ans, hint: "Compare the entity count now with the most that fit. The share to cut is the difference divided by the count now." },
    ];
    const ex = [
      `**Cost per entity:** (${T} − ${f}) ÷ ${n} = **${fixed(r.c, 3)} ms**.`,
      `**Frame rate now:** 1000 ÷ ${T} = **${fixed(r.fps, 1)} fps**.`,
      `**Entities at target:** budget 1000 ÷ ${tf} = ${fmt(bud, 2)} ms, so (${fmt(bud, 2)} − ${f}) ÷ ${fixed(r.c, 3)} = ${fmt(raw, 2)}, rounded down to **${r.nmax}**.`,
      n <= r.nmax ? `**Cut:** ${n} is at most ${r.nmax}, so the target is met: **${ans.join(" | ")}**.` : `**Cut:** ${n} − ${r.nmax} = ${n - r.nmax}, which is ${fmt(cutFrac, 1)}% of ${n}: **${ans.join(" | ")}**.`,
    ].join("\n\n");
    return finish(
      `A profiler measures **${T} ms** per frame with **${n}** entities in the scene. The frame has a fixed cost of **${f} ms**, and the rest scales with the number of entities. The team's target is **${tf} fps**.`,
      parts, ex, "gd-frameback", { f, T, n, tf }, [["_frame", T], ["_fixed", f], ["_n", n], ["_target", tf]],
      ["Work backwards: the measured time less the fixed cost is what the entities use.", "The target frame rate sets a new budget, and the same cost per entity applies."],
    );
  }
  return tooMany();
}

// ---------- generate ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  const plus = difficulty === "expert-plus";
  if (subtopic === "move-collide") return plus ? genMoveBack(rng) : genMove(rng, difficulty);
  if (subtopic === "loot-odds") return plus ? genLootBack(rng) : genLoot(rng, difficulty);
  if (subtopic === "xp-curve") return plus ? genXpBack(rng) : genXp(rng, difficulty);
  if (subtopic === "frame-budget") return plus ? genFrameBack(rng) : genFrame(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification ----------
// Each part is recomputed from the stated inputs by a different route (simulation, loops,
// summation). A number must be within its rounding tolerance of the true value.

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");

const ALT = {
  "gd-move": (p) => {
    let x = p.x0, fr = 0;
    while (x < p.W && fr < 100000) { x += p.vx; fr++; if (Math.abs(x - p.W) < 1e-9) break; }
    const ms = (fr / p.fps) * 1000;
    return { sp: Math.sqrt(p.vx * p.vx + p.vy * p.vy), fr, ms, ok: YN(ms <= p.L) };
  },
  "gd-moveback": (p) => {
    const vx = (p.W - p.x0) / p.F;
    const ay = Math.abs(p.vy);
    const ang = (Math.atan2(ay, vx) * 180) / Math.PI;
    const sp = Math.hypot(vx, p.vy);
    return { vx, sp, ang, call: `${sp > p.cap ? "Over the cap" : "Within the cap"} | ${ang < 30 ? HEADINGS[0] : ang <= 60 ? HEADINGS[1] : HEADINGS[2]}` };
  },
  "gd-loot": (p) => {
    const q = 1 - p.p / 100;
    let none = 1;
    for (let i = 0; i < p.n; i++) none *= q;
    // expected pulls without a cap, by summing survival chances over a long horizon
    let e = 0, s = 1;
    for (let k = 0; k < 20000; k++) { e += s; s *= q; }
    let ep = 0; s = 1;
    for (let k = 0; k < p.H; k++) { ep += s; s *= q; }
    const pa = (1 - none) * 100;
    const out = { pa, e, ep };
    if (p.tier === "hard") out.ok = YN(pa >= p.target);
    if (p.tier === "expert") out.ok = YN(((e - ep) / e) * 100 >= p.X);
    return out;
  },
  "gd-lootback": (p) => {
    const q = 1 - p.p / 100;
    let n = 0, none = 1;
    while (1 - none < p.t / 100 - 1e-12 && n < 100000) { none *= q; n++; }
    let ep = 0, s = 1;
    for (let k = 0; k < p.H; k++) { ep += s; s *= q; }
    const cost = n * p.price;
    return { n, cost, ep, call: `${p.H < n ? "Cap comes first" : "Cap comes later"} | ${cost <= p.bud ? "Within budget" : "Over budget"}` };
  },
  "gd-xp": (p) => {
    let c = p.b, tot = 0;
    for (let l = 1; l <= p.L; l++) { tot += c; if (l < p.L) c *= p.r; }
    const hr = tot / p.rate;
    return { c, t: tot, h: hr, ok: YN(hr <= p.H) };
  },
  "gd-xpback": (p) => {
    let c = p.b, tot = 0, lv = 0;
    while (tot + c <= p.T) { tot += c; lv++; c *= p.r; }
    const rem = tot + c - p.T;
    return { lv, rem, hr: rem / p.rate, ok: YN(rem / p.rate <= p.sess) };
  },
  "gd-frame": (p) => {
    const bd = 1000 / p.fps;
    let k = 0;
    while (p.f + (k + 1) * p.c <= bd + 1e-9) k++;
    let pairs = 0;
    for (let i = 1; i < p.n; i++) pairs += i;
    const tot = p.f + p.n * p.c + pairs * p.cp;
    return { bd, nmax: k, hd: ((bd - p.f - p.n * p.c) / bd) * 100, tot, ok: YN(tot <= bd) };
  },
  "gd-frameback": (p) => {
    const c = (p.T - p.f) / p.n;
    const bd = 1000 / p.tf;
    let k = 0;
    while (p.f + (k + 1) * c <= bd + 1e-9) k++;
    const cut = p.n > k ? ((p.n - k) / p.n) * 100 : 0;
    return { c, fps: 1000 / p.T, nmax: k, call: p.n <= k ? "Meets target | None" : `Misses target | ${cut < 10 ? CUT_BANDS[0] : cut <= 25 ? CUT_BANDS[1] : CUT_BANDS[2]}` };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = Object.fromEntries(Object.entries(alt(p)).map(([k, v]) => [k.toLowerCase(), v])); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      if (p.dps[part.id] === undefined || !near(partNum(answer, part.id), tv, tolOf(p.dps[part.id]) * (p.dps[part.id] === 0 ? 0 : 1))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
