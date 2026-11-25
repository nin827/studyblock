// Game Probability generator. Uses only the seeded rng passed in by the engine.
// Answer formats:
//   percentages  a number without the % sign, rounded to 2 decimal places (tolerance 0.005)
//   other values rounded to 2 decimal places (damage, DPS, gold, expected pulls), or a whole
//                number where the prompt says so (tries needed, average tries for a 1-in-k drop)
// verify() never reuses generate()'s closed forms. It rebuilds each situation from params and
// works it out another way: a try-by-try distribution of the number of drops (binomial DP),
// enumerating every hit/miss sequence, expanding a loot table into weight "tickets", counting 100 × 100
// equally likely hit/crit outcomes, or stepping through a pity counter pull by pull.

// ---------------------------------------------------------------------------------------------
// Shared helpers

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

function fmt2(n) {
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

// Intermediate values: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

// True when n sits (almost) exactly on a 2-decimal rounding boundary, where float noise could flip it.
const nearHalf = (n) => Math.abs(Math.abs(n * 100) % 1 - 0.5) < 1e-6;
const okPct = (x) => x >= 0.5 && x <= 99.5 && !nearHalf(x);

const sum = (arr) => arr.reduce((s, x) => s + x, 0);
const andList = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`);
const pct = (x) => `${num(x)}%`;
// "a 5% chance", "an 8% chance", "an 11% chance": the article follows how the number is said.
const aN = (x) => (/^(8|11(\D|$)|18(\D|$))/.test(num(x)) ? "an" : "a");
const aWord = (w) => (/^[AEIOU]/i.test(w) ? "an" : "a");

const PCT = " Answer as a percentage without the % sign, rounded to 2 decimal places.";
const DP2 = " Round to 2 decimal places.";
const WHOLE = " Give a whole number.";

// "≈ 40.1263, which rounds to **40.13**" or "= **40.13**".
function result(exact, rounded = true, suffix = "") {
  if (!rounded) return `= **${exact}${suffix}**`;
  const shown = fmt2(exact);
  if (Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${suffix}**`;
  return `≈ ${exact.toFixed(4)}${suffix}, which rounds to **${shown}${suffix}**`;
}

// 4 distinct numeric choices: the answer + 3 plausible mistakes, topped up with nearby values.
function numChoices(correct, cands, rounded, rng, { lo = 0, hi = Infinity } = {}) {
  const f = (v) => (rounded ? fmt2(v) : String(Math.round(v)));
  const answer = f(correct);
  const seen = new Set([answer]);
  const out = [];
  const add = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (!rounded && !Number.isInteger(v)) return;
    if (v <= lo || v >= hi) return;
    const s = f(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  cands.forEach(add);
  const step = rounded ? Math.max(0.5, round2(Math.abs(correct) * 0.1)) : Math.max(1, Math.round(Math.abs(correct) * 0.1));
  for (let k = 1; out.length < 3 && k < 200; k++) {
    add(correct + k * step);
    add(correct - k * step);
  }
  return { answer, choices: rng.shuffle([answer, ...out]) };
}

// A solved question becomes a typed number (70%) or a multiple-choice one (30%).
function finish(q, exact, rounded, cands, rng, bounds) {
  const params = { ...q.params, rounded };
  const tolerance = rounded ? 0.005 : 0;
  if (rng.next() < 0.3) {
    const { answer, choices } = numChoices(exact, cands, rounded, rng, bounds);
    return { ...q, answer, answerType: "choice", choices, tolerance, params };
  }
  return { ...q, answer: rounded ? round2(exact) : exact, answerType: "number", tolerance, params };
}

function numPart(id, label, ask, exact, rounded, hint) {
  return { id, label, ask, answerType: "number", answer: rounded ? round2(exact) : exact, tolerance: rounded ? 0.005 : 0, hint };
}

// Calls make() until it returns a question (it returns null to ask for a fresh draw).
function retry(make) {
  for (let i = 0; i < 80; i++) {
    const q = make();
    if (q) return q;
  }
  throw new Error("game-probability: could not draw a valid question");
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Drop rates

const BOSSES = ["the Frost Giant", "the Lich King", "a cave troll", "the Sand Wyrm", "a goblin chief", "the Ember Golem", "a swamp hydra", "the Shadow Knight"];
const DROPS = ["a rare mount", "a legendary sword", "a pet dragon", "an epic helmet", "a golden key", "a mythic ring", "a shiny skin", "a crafting gem"];
const EASY_P = [1, 2, 4, 5, 10, 20, 25, 50];
const MED_P = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function genDrops(difficulty, rng) {
  return retry(() => {
    const boss = rng.pick(BOSSES);
    const drop = rng.pick(DROPS);
    let kind;
    if (difficulty === "easy") kind = rng.pick(["expTries", "none", "atLeast"]);
    else if (difficulty === "medium") kind = rng.pick(["atLeast", "atLeast", "firstOn", "expTries2"]);
    else kind = rng.pick(["smallestN", "exactlyK", "multi"]);

    const p = kind === "expTries" ? rng.pick(EASY_P) : difficulty === "easy" ? rng.pick([10, 20, 25, 30, 40, 50]) : rng.pick(MED_P);
    const q = 1 - p / 100;
    const intro = `Each time you defeat ${boss}, there is ${aN(p)} ${pct(p)} chance it drops ${drop}, independently of every other try.`;
    let prompt, exact, rounded = true, explanation, hints, cands, given, values, bounds = { lo: 0, hi: 100 };

    if (kind === "expTries" || kind === "expTries2") {
      exact = 100 / p;
      rounded = kind === "expTries2";
      if (!rounded && !Number.isInteger(exact)) return null;
      if (rounded && (Number.isInteger(exact) || nearHalf(exact))) return null;
      values = { p };
      prompt = `${intro} On average, how many tries does it take to get the drop?${rounded ? DP2 : WHOLE}`;
      explanation = `For a chance p on each try, the average number of tries until the first success is \`1 / p\`.\n\n\`1 / ${num(p / 100)} = 100 / ${num(p)}\` ${result(exact, rounded)}.`;
      hints = [
        `${aN(p) === "an" ? "An" : "A"} ${pct(p)} chance is ${num(p / 100)} as a decimal.`,
        `The average number of tries until the first success is 1 divided by the chance per try, written as a decimal: \`1 / (_pct/100)\`.${rounded ? " Then round to 2 decimal places." : ""}`,
      ];
      cands = [p, 100 - p, 50 / p, 200 / p, 100 / p + 1];
      bounds = { lo: 0, hi: Infinity };
      given = [{ label: "_pct", value: p }];
    } else if (kind === "none" || kind === "atLeast") {
      const n = difficulty === "easy" ? rng.int(2, 5) : rng.int(5, 40);
      const none = q ** n * 100;
      exact = kind === "none" ? none : 100 - none;
      if (!okPct(exact)) return null;
      values = { p, n };
      const ask = kind === "none" ? `no drop at all in ${n} tries` : `at least one drop in ${n} tries`;
      prompt = `${intro} What is the chance of getting ${ask}?${PCT}`;
      explanation =
        `One try misses with probability \`1 - ${num(p / 100)} = ${num(q)}\`.\n\n` +
        `All ${n} tries miss: \`${num(q)}^${n}\` ≈ ${(q ** n).toFixed(6)}.` +
        (kind === "atLeast" ? `\n\nAt least one drop is the opposite: \`1 - ${(q ** n).toFixed(6)}\` ≈ ${(1 - q ** n).toFixed(6)}.` : "") +
        `\n\nAs a percentage ${result(exact)}%.`;
      hints = [
        kind === "none"
          ? "The tries are independent, so the chance that every one of them misses is the miss chance multiplied by itself once per try."
          : `"At least one drop" is the opposite of "no drops at all", so P(at least one) = 1 - P(none).`,
        `One try misses with probability \`1 - _pct/100\` = ${num(q)}. All ${n} miss: \`(1 - _pct/100)^_n\`.`,
        kind === "none" ? "Multiply by 100 for a percentage and round to 2 decimal places." : "Subtract that from 1, multiply by 100 for a percentage, and round to 2 decimal places.",
      ];
      cands = kind === "none" ? [100 - none, (q * 100) / n, 100 - n * p] : [none, Math.min(n * p, 99), p, (1 - (p / 100) ** n) * 100];
      given = [{ label: "_pct", value: p }, { label: "_n", value: n }];
    } else if (kind === "firstOn") {
      const k = rng.int(2, 8);
      exact = q ** (k - 1) * p;
      if (!okPct(exact)) return null;
      values = { p, k };
      prompt = `${intro} What is the chance that the first drop comes on exactly try number ${k}?${PCT}`;
      explanation =
        `The first ${k - 1} tries must miss and try ${k} must hit.\n\n` +
        `\`${num(q)}^${k - 1} × ${num(p / 100)}\` ≈ ${(exact / 100).toFixed(6)}.\n\nAs a percentage ${result(exact)}%.`;
      hints = [
        `"First drop on try ${k}" means tries 1 to ${k - 1} all miss, and try ${k} hits.`,
        `Multiply ${k - 1} miss chances (\`1 - _pct/100\` each) by one hit chance (\`_pct/100\`): \`(1 - _pct/100)^${k - 1} * _pct/100\`.`,
        "Multiply by 100 for a percentage and round to 2 decimal places.",
      ];
      cands = [q ** k * 100, p, q ** (k - 1) * 100, (1 - q ** k) * 100];
      given = [{ label: "_pct", value: p }, { label: "_k", value: k }];
    } else if (kind === "smallestN") {
      const T = rng.pick([50, 75, 80, 90, 95, 99]);
      const target = 1 - T / 100;
      const n = Math.ceil(Math.log(target) / Math.log(q));
      // Stay clear of thresholds where float noise could change n.
      if (!(n >= 2 && n <= 500) || Math.abs(q ** n - target) < 1e-9 || Math.abs(q ** (n - 1) - target) < 1e-9) return null;
      exact = n;
      rounded = false;
      values = { p, T };
      prompt = `${intro} What is the smallest number of tries that gives at least ${aN(T)} ${T}% chance of getting at least one drop?${WHOLE}`;
      explanation =
        `You need \`1 - ${num(q)}^n\` to be at least ${num(T / 100)}, so \`${num(q)}^n\` must be at most ${num(target)}.\n\n` +
        `Taking logs: \`n ≥ ln(${num(target)}) / ln(${num(q)})\` ≈ ${(Math.log(target) / Math.log(q)).toFixed(4)}.\n\n` +
        `Round **up** to a whole number of tries: **${n}**. (Check: ${n - 1} tries give ${((1 - q ** (n - 1)) * 100).toFixed(2)}%, ${n} tries give ${((1 - q ** n) * 100).toFixed(2)}%.)`;
      hints = [
        `After n tries, P(at least one drop) = \`1 - (1 - _pct/100)^n\`. You want it to be at least ${num(T / 100)}.`,
        `That means \`(1 - _pct/100)^n\` must be at most ${num(target)}. Take logs: \`n ≥ ln(${num(target)}) / ln(1 - _pct/100)\`. The inequality flips because ln of a number below 1 is negative.`,
        "Round up to the next whole number, since a fraction of a try isn't possible.",
      ];
      const naive = Math.round((T / p));
      cands = [n - 1, n + 1, naive, Math.round(100 / p)];
      bounds = { lo: 0, hi: Infinity };
      given = [{ label: "_pct", value: p }, { label: "_target", value: T }];
    } else if (kind === "exactlyK") {
      const n = rng.int(5, 20);
      const k = rng.int(1, 2);
      const C = k === 1 ? n : (n * (n - 1)) / 2;
      exact = C * (p / 100) ** k * q ** (n - k) * 100;
      if (!okPct(exact)) return null;
      values = { p, n, k };
      prompt = `${intro} What is the chance of getting exactly ${k === 1 ? "one drop" : "two drops"} in ${n} tries?${PCT}`;
      explanation =
        `Use the binomial formula: \`P = C(n, k) × p^k × (1 - p)^(n - k)\`.\n\n` +
        `There are \`C(${n}, ${k}) = ${C}\` ways to choose which ${k === 1 ? "try drops" : "two tries drop"}.\n\n` +
        `\`${C} × ${num(p / 100)}^${k} × ${num(q)}^${n - k}\` ≈ ${(exact / 100).toFixed(6)}.\n\nAs a percentage ${result(exact)}%.`;
      hints = [
        `One particular order (${k === 1 ? "drop on try 1, then misses" : "drops on tries 1 and 2, then misses"}) has probability \`(_pct/100)^${k} × (1 - _pct/100)^${n - k}\`.`,
        `The drop${k === 1 ? "" : "s"} can be on any ${k === 1 ? "one" : "two"} of the ${n} tries: there are C(${n}, ${k}) = ${C} such orders. Multiply by ${C}.`,
        "Multiply by 100 for a percentage and round to 2 decimal places.",
      ];
      cands = [(p / 100) ** k * q ** (n - k) * 100, (1 - q ** n) * 100, C * (p / 100) ** k * 100, k === 1 ? q ** (n - 1) * 100 : n * (p / 100) ** 2 * q ** (n - 2) * 100];
      given = [{ label: "_pct", value: p }, { label: "_n", value: n }, { label: "_k", value: k }];
    } else {
      // Multi-part: at least one in n tries, then the tries needed for a target chance.
      const n = rng.int(5, 30);
      const T = rng.pick([75, 90, 95, 99]);
      const target = 1 - T / 100;
      const a1 = (1 - q ** n) * 100;
      const need = Math.ceil(Math.log(target) / Math.log(q));
      if (!okPct(a1) || !(need >= 2 && need <= 500) || need === n) return null;
      if (Math.abs(q ** need - target) < 1e-9 || Math.abs(q ** (need - 1) - target) < 1e-9) return null;
      const parts = [
        numPart("chance", `In ${n} tries`, `What is the chance of at least one drop in ${n} tries?${PCT}`, a1, true,
          `Use 1 - P(no drops): \`1 - (1 - _pct/100)^_n\`, then turn it into a percentage.`),
        numPart("tries", `${T}% target`, `What is the smallest number of tries that gives at least ${aN(T)} ${T}% chance of at least one drop?${WHOLE}`, need, false,
          `Solve \`(1 - _pct/100)^n ≤ ${num(target)}\` with logs, \`n ≥ ln(${num(target)}) / ln(1 - _pct/100)\`, and round up.`),
      ];
      const explanation2 =
        `**In ${n} tries:** \`1 - ${num(q)}^${n}\` ≈ ${(a1 / 100).toFixed(6)}, so ${result(a1)}%.\n\n` +
        `**${T}% target:** \`n ≥ ln(${num(target)}) / ln(${num(q)})\` ≈ ${(Math.log(target) / Math.log(q)).toFixed(4)}, which rounds up to **${need}** tries.`;
      return {
        prompt: intro, answerType: "multi", parts, explanation: explanation2,
        hints: [`Every question about "at least one drop" starts from P(no drops in n tries) = \`(1 - _pct/100)^n\`.`],
        given: [{ label: "_pct", value: p }, { label: "_n", value: n }],
        params: { kind: "dropMulti", p, n, T },
      };
    }
    return finish({ prompt, explanation, hints, given, params: { kind, values } }, exact, rounded, cands, rng, bounds);
  });
}

// ---------------------------------------------------------------------------------------------
// Critical hits and damage

const HEROES = ["Your knight", "A rogue", "The archer", "Your mage", "A berserker", "The paladin", "Your ranger", "A samurai"];
const WEAPONS = ["dagger", "longsword", "crossbow", "war axe", "spear", "bow", "hammer", "katana"];
const MULTS = [1.5, 2, 2.5, 3];
const critRule = (m) => `A critical hit deals ${num(m)}× normal damage (that is the total, not extra damage).`;

function genCrits(difficulty, rng) {
  return retry(() => {
    const hero = rng.pick(HEROES);
    let kind;
    if (difficulty === "easy") kind = rng.pick(["perHit", "perHit", "nHits"]);
    else if (difficulty === "medium") kind = rng.pick(["dps", "dpsAcc", "perHitAcc"]);
    else kind = rng.pick(["needCrit", "compare", "compare"]);

    let prompt, exact, explanation, hints, cands, given, values;
    if (kind === "perHit" || kind === "nHits" || kind === "perHitAcc" || kind === "dps" || kind === "dpsAcc") {
      const D = difficulty === "easy" ? 5 * rng.int(2, 20) : rng.int(12, 180);
      const c = difficulty === "easy" ? rng.pick([10, 20, 25, 30, 40, 50]) : rng.int(5, 60);
      const m = difficulty === "easy" ? rng.pick([1.5, 2]) : rng.pick(MULTS);
      const h = kind === "perHitAcc" || kind === "dpsAcc" ? 5 * rng.int(12, 19) : 100;
      const interval = kind.startsWith("dps") && rng.next() < 0.4 ? rng.pick([0.5, 0.8, 1.2, 1.5, 2, 2.5]) : null;
      const aps = kind.startsWith("dps") ? (interval ? 1 / interval : rng.int(5, 30) / 10) : null;
      const n = kind === "nHits" ? rng.pick([10, 20, 50, 100]) : null;
      const perHit = D * (1 + (c / 100) * (m - 1));
      const perSwing = (h / 100) * perHit;
      exact = kind === "nHits" ? n * perHit : kind === "dps" || kind === "dpsAcc" ? perSwing * aps : perSwing;
      if (nearHalf(exact)) return null;
      values = { D, c, m, h, aps, interval, n };
      const acc = h < 100 ? ` Each attack hits with ${aN(h)} ${h}% chance; a miss deals 0, and only hits can be critical.` : "";
      const speed = aps ? (interval ? ` It attacks once every ${num(interval)} seconds.` : ` It attacks ${num(aps)} times per second.`) : "";
      const lead = `${hero}'s ${rng.pick(WEAPONS)} deals ${D} damage per hit, with ${aN(c)} ${c}% chance of a critical hit. ${critRule(m)}${acc}${speed}`;
      const ask = kind === "nHits"
        ? `What is the expected total damage from ${n} hits?`
        : aps
          ? "What is the expected damage per second (DPS)?"
          : h < 100 ? "What is the expected damage per attack?" : "What is the expected damage per hit?";
      prompt = `${lead} ${ask}${DP2}`;
      const lines = [
        `Expected damage per hit = damage × (1 + crit chance × (multiplier - 1)), because a crit adds ${num(m - 1)} × the damage on top.`,
        `\`${D} × (1 + ${num(c / 100)} × ${num(m - 1)})\` = ${num(perHit)}.`,
      ];
      if (h < 100) lines.push(`Only ${h}% of attacks hit: \`${num(h / 100)} × ${num(perHit)}\` = ${num(perSwing)} per attack.`);
      if (aps) lines.push(`${interval ? `One attack every ${num(interval)} s is \`1 / ${num(interval)}\` = ${num(aps)} attacks per second. ` : ""}DPS = \`${num(perSwing)} × ${num(aps)}\` ${result(exact)}.`);
      else if (n) lines.push(`Over ${n} hits: \`${n} × ${num(perHit)}\` ${result(exact)}.`);
      else lines.push(`The answer ${result(exact).replace(/^= /, "is ")}.`);
      explanation = lines.join("\n\n");
      const perHitExpr = "_dmg * (1 + _crit/100 * (_mult - 1))";
      hints = [
        `On average, a fraction _crit/100 of hits are critical, and each crit adds (_mult - 1) × the damage on top of a normal hit. So the expected damage per hit is \`${perHitExpr}\`.`,
      ];
      if (h < 100) hints.push(`Misses deal 0, so multiply the expected damage per hit by the hit chance, \`_hit/100\`.`);
      if (aps) hints.push(interval ? `Attacks per second = \`1 / _interval\`. Multiply the expected damage per attack by it.` : "Multiply the expected damage per attack by the attacks per second (`_aps`).");
      if (n) hints.push(`Expected values add up, so multiply the expected damage per hit by ${n} (\`_hits\`).`);
      hints.push("Round to 2 decimal places at the end.");
      cands = [
        exact / (1 + (c / 100) * (m - 1)) * (1 + (c / 100) * m), // added the full multiplier as extra
        exact / (1 + (c / 100) * (m - 1)), // ignored crits
        exact / (1 + (c / 100) * (m - 1)) * m, // every hit a crit
        h < 100 ? exact / (h / 100) : exact * 0.9,
        aps ? exact / aps / aps : exact * 1.1,
      ];
      given = [
        { label: "_dmg", value: D },
        { label: "_crit", value: c },
        { label: "_mult", value: m },
        ...(h < 100 ? [{ label: "_hit", value: h }] : []),
        ...(interval ? [{ label: "_interval", value: interval }] : aps ? [{ label: "_aps", value: aps }] : []),
        ...(n ? [{ label: "_hits", value: n }] : []),
      ];
    } else if (kind === "needCrit") {
      const D = rng.int(20, 150);
      const m = rng.pick(MULTS);
      const cTrue = rng.int(50, 900) / 10; // the hidden crit chance that sets the target
      const X = Math.round(D * (1 + (cTrue / 100) * (m - 1)) * 10) / 10;
      exact = ((X / D - 1) / (m - 1)) * 100;
      if (!(exact > 1 && exact < 99) || nearHalf(exact)) return null;
      values = { D, m, X };
      prompt = `${hero}'s ${rng.pick(WEAPONS)} deals ${D} damage per hit. ${critRule(m)} What crit chance is needed for the expected damage per hit to be ${num(X)}?${PCT}`;
      explanation =
        `Expected damage per hit = \`D × (1 + c × (m - 1))\`. Set it equal to ${num(X)} and solve for c.\n\n` +
        `\`1 + c × ${num(m - 1)} = ${num(X)} / ${D}\` = ${(X / D).toFixed(6)}.\n\n` +
        `\`c = (${(X / D).toFixed(6)} - 1) / ${num(m - 1)}\` ≈ ${(exact / 100).toFixed(6)}.\n\nAs a percentage ${result(exact)}%.`;
      hints = [
        "Expected damage per hit = `_dmg * (1 + c * (_mult - 1))`, where c is the crit chance as a decimal.",
        "Divide the target by the damage, subtract 1, then divide by (`_mult - 1`) to undo each step: `(_target / _dmg - 1) / (_mult - 1)`.",
        "That gives c as a decimal. Multiply by 100 for a percentage and round to 2 decimal places.",
      ];
      cands = [((X / D - 1) / m) * 100, (X / D) * 100 - 100, ((X - D) / m / D) * 100 + 5, (X / D / m) * 100];
      given = [{ label: "_dmg", value: D }, { label: "_mult", value: m }, { label: "_target", value: X }];
      return finish({ prompt, explanation, hints, given, params: { kind, values } }, exact, true, cands, rng, { lo: 0, hi: 100 });
    } else {
      // Multi-part: compare two weapons' DPS.
      const mk = () => ({ D: rng.int(15, 120), c: rng.int(5, 50), m: rng.pick(MULTS), aps: rng.int(5, 25) / 10 });
      const A = mk();
      const B = mk();
      const dps = (w) => w.D * (1 + (w.c / 100) * (w.m - 1)) * w.aps;
      const a = dps(A), b = dps(B);
      if (nearHalf(a) || nearHalf(b) || Math.abs(a - b) < 0.05 * Math.max(a, b)) return null;
      const better = a > b ? "Weapon A" : "Weapon B";
      const desc = (w, name) => `${name}: ${w.D} damage per hit, ${w.c}% crit chance, ${num(w.m)}× crit damage, ${num(w.aps)} attacks per second.`;
      prompt = `${hero} is choosing between two weapons. Critical damage is the total (a 2× crit deals twice the normal damage), and every attack hits.\n\n- ${desc(A, "Weapon A")}\n- ${desc(B, "Weapon B")}`;
      const parts = [
        numPart("dps-a", "Weapon A", `Expected DPS of Weapon A?${DP2}`, a, true, "Expected damage per hit = `_dmg_a * (1 + _crit_a/100 * (_mult_a - 1))`. Multiply by the attacks per second."),
        numPart("dps-b", "Weapon B", `Expected DPS of Weapon B?${DP2}`, b, true, "Same method: `_dmg_b * (1 + _crit_b/100 * (_mult_b - 1)) * _aps_b`."),
        {
          id: "best", label: "Choice", ask: "Which weapon has the higher expected DPS?", answerType: "choice", answer: better, choices: ["Weapon A", "Weapon B"],
          hint: "Compare your two DPS values (unrounded if they are close).",
        },
      ];
      const line = (w, name, v) => `**${name}:** \`${w.D} × (1 + ${num(w.c / 100)} × ${num(w.m - 1)}) × ${num(w.aps)}\` ${result(v)}.`;
      explanation = `DPS = damage × (1 + crit chance × (multiplier - 1)) × attacks per second.\n\n${line(A, "Weapon A", a)}\n\n${line(B, "Weapon B", b)}\n\n**${better}** has the higher expected DPS.`;
      return {
        prompt, answerType: "multi", parts, explanation,
        hints: ["Work out each weapon's expected damage per hit first, then multiply by its attack speed."],
        given: [
          { label: "_dmg_a", value: A.D }, { label: "_crit_a", value: A.c }, { label: "_mult_a", value: A.m }, { label: "_aps_a", value: A.aps },
          { label: "_dmg_b", value: B.D }, { label: "_crit_b", value: B.c }, { label: "_mult_b", value: B.m }, { label: "_aps_b", value: B.aps },
        ],
        params: { kind: "critMulti", A, B },
      };
    }
    return finish({ prompt, explanation, hints, given, params: { kind, values } }, exact, true, cands, rng, { lo: 0 });
  });
}

// ---------------------------------------------------------------------------------------------
// Loot tables

const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const POOL = {
  Common: [["Rusty Sword", "sword"], ["Leather Boots", "boots"], ["Health Potion", "potion"], ["Wooden Shield", "shield"], ["Loaf of Bread", "bread"], ["Iron Ore", "ore"]],
  Uncommon: [["Iron Helmet", "helmet"], ["Mana Elixir", "elixir"], ["Silver Ring", "ring"], ["Hunter's Bow", "bow"]],
  Rare: [["Steel Axe", "axe"], ["Magic Scroll", "scroll"], ["Emerald", "emerald"], ["Spell Tome", "tome"]],
  Epic: [["Dragon Scale", "scale"], ["Phoenix Feather", "feather"], ["Storm Staff", "staff"]],
  Legendary: [["Crown of Ages", "crown"], ["Starforged Blade", "blade"], ["Void Amulet", "amulet"]],
};
const W_RANGE = { Common: [20, 60], Uncommon: [10, 30], Rare: [4, 15], Epic: [2, 6], Legendary: [1, 3] };
const G_RANGE = { Common: [1, 10], Uncommon: [10, 30], Rare: [40, 100], Epic: [120, 300], Legendary: [500, 1000] };

// 4-6 items, at least one per chosen tier, all different.
function makeTable(rng, size) {
  const tiers = size === 4 ? rng.pick([["Common", "Uncommon", "Rare", "Legendary"], ["Common", "Rare", "Epic", "Legendary"], ["Common", "Common", "Rare", "Epic"], ["Common", "Uncommon", "Uncommon", "Rare"]])
    : size === 5 ? rng.pick([["Common", "Common", "Uncommon", "Rare", "Legendary"], ["Common", "Uncommon", "Rare", "Epic", "Legendary"], ["Common", "Uncommon", "Rare", "Rare", "Epic"]])
      : rng.pick([["Common", "Common", "Uncommon", "Rare", "Epic", "Legendary"], ["Common", "Uncommon", "Uncommon", "Rare", "Epic", "Legendary"]]);
  const used = new Set();
  return tiers.map((t) => {
    let it;
    do it = rng.pick(POOL[t]); while (used.has(it[1]));
    used.add(it[1]);
    const [wl, wh] = W_RANGE[t];
    const [gl, gh] = G_RANGE[t];
    return { name: it[0], key: it[1], tier: t, w: rng.int(wl, wh), g: rng.int(gl, gh) };
  });
}

// The loot table as a list, one item per line ("- **Emerald** (Rare): weight 10, gold 55"). A markdown
// table would squeeze its number columns on a 360px phone, because prompts wrap anywhere.
const tableMd = (items, gold) =>
  items.map((x) => `- **${x.name}** (${x.tier}): weight ${x.w}${gold ? `, gold ${x.g}` : ""}`).join("\n");
const wSum = (items) => items.map((x) => `_${x.key}`).join(" + ");
const ROLL = "Opening a chest rolls once on this loot table: each item's chance is its weight divided by the total weight.";

function genLoot(difficulty, rng) {
  return retry(() => {
    let kind;
    if (difficulty === "easy") kind = rng.pick(["item", "item", "notItem"]);
    else if (difficulty === "medium") kind = rng.pick(["tier", "tier", "evGold"]);
    else kind = rng.pick(["atLeastN", "evGoldN", "multi"]);
    const gold = kind === "evGold" || kind === "evGoldN" || kind === "multi";
    const items = makeTable(rng, gold ? 4 : difficulty === "easy" ? rng.int(4, 5) : rng.int(5, 6));
    const W = sum(items.map((x) => x.w));
    const given = items.map((x) => ({ label: `_${x.key}`, value: x.w }));
    const head = `${ROLL}\n\n${tableMd(items, gold)}\n\n`;
    let prompt, exact, explanation, hints, cands, values;
    const totalHint = `Add up all the weights for the total: \`${wSum(items)}\`.`;

    if (kind === "item" || kind === "notItem") {
      const i = rng.int(0, items.length - 1);
      const it = items[i];
      const favourable = kind === "item" ? it.w : W - it.w;
      exact = (favourable / W) * 100;
      if (!okPct(exact)) return null;
      values = { i };
      prompt = `${head}What is the chance that a chest ${kind === "item" ? "gives" : "does not give"} the ${it.name}?${PCT}`;
      explanation = `The total weight is \`${items.map((x) => x.w).join(" + ")} = ${W}\`.\n\n` +
        (kind === "item" ? `P = \`${it.w} / ${W}\`` : `Everything except the ${it.name}: \`${W} - ${it.w} = ${favourable}\`, so P = \`${favourable} / ${W}\``) +
        ` ≈ ${(favourable / W).toFixed(6)}.\n\nAs a percentage ${result(exact)}%.`;
      hints = [totalHint, kind === "item" ? `The ${it.name} has weight ${it.w}. Its chance is its weight ÷ the total weight.` : `"Not the ${it.name}" is every other item: total weight minus ${it.w}, divided by the total.`, "Multiply by 100 for a percentage and round to 2 decimal places."];
      cands = [(it.w / 100) * 100, 100 - exact, (1 / items.length) * 100, (it.w / (W - it.w)) * 100];
    } else if (kind === "tier") {
      const tiers = [...new Set(items.map((x) => x.tier))];
      const mode = rng.pick(["tier", "orBetter"]);
      let pick, set;
      if (mode === "tier") {
        pick = rng.pick(tiers);
        set = items.filter((x) => x.tier === pick);
      } else {
        const rank = rng.int(2, 3);
        pick = TIERS[rank];
        set = items.filter((x) => TIERS.indexOf(x.tier) >= rank);
      }
      const fav = sum(set.map((x) => x.w));
      exact = (fav / W) * 100;
      if (!okPct(exact) || set.length === 0) return null;
      values = { mode, tier: pick };
      const what = mode === "tier" ? `${aWord(pick)} ${pick} item` : `an item of ${pick} rarity or better (${andList(TIERS.slice(TIERS.indexOf(pick)))} count)`;
      prompt = `${head}What is the chance that a chest gives ${what}?${PCT}`;
      explanation = `The total weight is ${W}.\n\nThe matching items are ${andList(set.map((x) => `${x.name} (${x.w})`))}, with total weight ${fav}.\n\nP = \`${fav} / ${W}\` ≈ ${(fav / W).toFixed(6)}, so as a percentage ${result(exact)}%.`;
      hints = [totalHint, `Only one item comes out, so the chances of the matching items add: add the weights of ${set.length === 1 ? "the one matching item" : `all ${set.length} matching items`} and divide by the total.`, "Multiply by 100 for a percentage and round to 2 decimal places."];
      cands = [(set[0].w / W) * 100, (set.length / items.length) * 100, 100 - exact, (fav / (W - fav)) * 100];
    } else if (kind === "evGold" || kind === "evGoldN") {
      const n = kind === "evGoldN" ? rng.pick([5, 10, 20, 50]) : 1;
      const T = sum(items.map((x) => x.w * x.g));
      exact = (n * T) / W;
      if (nearHalf(exact)) return null;
      values = { n };
      prompt = `${head}What is the expected gold value of ${n === 1 ? "one chest" : `${n} chests`}?${DP2}`;
      explanation = `Expected value = sum of (gold × chance) = \`(${items.map((x) => `${x.w} × ${x.g}`).join(" + ")}) / ${W}\` = \`${T} / ${W}\` ≈ ${num(T / W)} gold per chest.` +
        (n > 1 ? `\n\nFor ${n} chests: \`${n} × ${num(T / W)}\` ${result(exact)}.` : `\n\nThe answer ${result(exact).replace(/^= /, "is ")}.`);
      hints = [
        "Expected value = sum of (gold value × chance) over every item, and each item's chance is weight ÷ total weight.",
        `Multiply each weight by its gold value, add those products, and divide by the total weight (\`${wSum(items)}\`). The gold values are \`${items.map((x) => `_g_${x.key}`).join(", ")}\` in the calculator.`,
        n > 1 ? `Expected values add up, so multiply the value of one chest by ${n}, then round to 2 decimal places.` : "Round to 2 decimal places.",
      ];
      cands = [(n * sum(items.map((x) => x.g))) / items.length, n * T / 100, (n * sum(items.map((x) => x.g)) * items[0].w) / W, exact * 1.1];
      given.push(...items.map((x) => ({ label: `_g_${x.key}`, value: x.g })));
    } else if (kind === "atLeastN") {
      const tiersPresent = [...new Set(items.filter((x) => TIERS.indexOf(x.tier) >= 3).map((x) => x.tier))];
      if (!tiersPresent.length) return null;
      const tier = rng.pick(tiersPresent);
      const fav = sum(items.filter((x) => x.tier === tier).map((x) => x.w));
      const n = rng.int(3, 40);
      exact = (1 - (1 - fav / W) ** n) * 100;
      if (!okPct(exact)) return null;
      values = { tier, n };
      prompt = `${head}You open ${n} chests, each rolling independently. What is the chance of getting at least one ${tier} item?${PCT}`;
      explanation =
        `One chest gives ${aWord(tier)} ${tier} item with probability \`${fav} / ${W}\` ≈ ${(fav / W).toFixed(6)}.\n\n` +
        `No ${tier} item in ${n} chests: \`(1 - ${fav}/${W})^${n}\` ≈ ${((1 - fav / W) ** n).toFixed(6)}.\n\n` +
        `At least one: \`1 - ${((1 - fav / W) ** n).toFixed(6)}\`, so as a percentage ${result(exact)}%.`;
      hints = [
        `First find the chance that one chest gives ${aWord(tier)} ${tier} item: its weight${fav === items.find((x) => x.tier === tier).w ? "" : "s added"} ÷ the total weight.`,
        `"At least one" is the opposite of "none": no ${tier} item in ${n} chests has probability \`(1 - p)^${n}\`.`,
        "Subtract that from 1, multiply by 100 and round to 2 decimal places.",
      ];
      cands = [((1 - fav / W) ** n) * 100, Math.min(99, (n * fav * 100) / W), (fav / W) * 100, (1 - (1 - fav / 100) ** n) * 100];
      given.push({ label: "_n", value: n });
    } else {
      // Multi-part: tier chance, expected gold per chest, expected gold from n chests.
      const tier = rng.pick([...new Set(items.map((x) => x.tier))].filter((t) => t !== "Common"));
      if (!tier) return null;
      const fav = sum(items.filter((x) => x.tier === tier).map((x) => x.w));
      const a1 = (fav / W) * 100;
      const T = sum(items.map((x) => x.w * x.g));
      const ev = T / W;
      const n = rng.pick([10, 25, 50, 100]);
      if (!okPct(a1) || nearHalf(ev) || nearHalf(ev * n)) return null;
      const parts = [
        numPart("tier", `${tier} chance`, `What is the chance that one chest gives ${aWord(tier)} ${tier} item?${PCT}`, a1, true, `Add the weights of the ${tier} items and divide by the total weight, \`${wSum(items)}\`.`),
        numPart("gold", "Gold per chest", `What is the expected gold value of one chest?${DP2}`, ev, true, "Multiply each weight by its gold value, add the products, and divide by the total weight."),
        numPart("total", `${n} chests`, `What is the expected gold from ${n} chests?${DP2}`, ev * n, true, `Expected values add up: multiply the unrounded value per chest by ${n}.`),
      ];
      const explanation2 =
        `The total weight is ${W}.\n\n` +
        `**${tier} chance:** \`${fav} / ${W}\` ≈ ${(fav / W).toFixed(6)}, so ${result(a1)}%.\n\n` +
        `**Gold per chest:** \`(${items.map((x) => `${x.w} × ${x.g}`).join(" + ")}) / ${W} = ${T} / ${W}\` ${result(ev)}.\n\n` +
        `**${n} chests:** \`${n} × ${num(ev)}\` ${result(ev * n)}.`;
      given.push(...items.map((x) => ({ label: `_g_${x.key}`, value: x.g })));
      return {
        prompt: `${ROLL}\n\n${tableMd(items, true)}`, answerType: "multi", parts, explanation: explanation2,
        hints: ["Each item's chance is its weight ÷ the total weight. Start by adding up the weights."],
        given, params: { kind: "lootMulti", items, tier, n },
      };
    }
    return finish({ prompt, explanation, hints, given, params: { kind, items, values } }, exact, true, cands, rng, kind.startsWith("evGold") ? { lo: 0 } : { lo: 0, hi: 100 });
  });
}

// ---------------------------------------------------------------------------------------------
// Pity and streaks

const BANNERS = ["the summer banner", "the hero gacha", "a mystery crate", "the card pack", "the egg hatchery", "a lucky wheel", "the event banner"];
const PRIZES = ["a 5-star hero", "a golden card", "a legendary pet", "a rare skin", "an ultra-rare weapon", "a mythic egg"];

function genPity(difficulty, rng) {
  return retry(() => {
    let kind;
    if (difficulty === "easy") kind = rng.pick(["streak", "pity"]);
    else if (difficulty === "medium") kind = rng.pick(["exactly", "within", "pity"]);
    else kind = rng.pick(["expected", "expected", "multi"]);
    const banner = rng.pick(BANNERS);
    const prize = rng.pick(PRIZES);
    const p = difficulty === "easy" ? rng.pick([5, 8, 10, 12, 15, 20, 25]) : rng.pick([0.6, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]);
    const q = 1 - p / 100;
    const N = difficulty === "easy" ? rng.int(5, 15) : difficulty === "medium" ? rng.int(10, 60) : rng.int(10, 90);
    const rules = `Each pull on ${banner} has ${aN(p)} ${num(p)}% chance to give ${prize}. Pity rule: if the first ${N - 1} pulls all miss, pull ${N} is guaranteed to give it. The counter resets after you get it.`;
    let prompt, exact, explanation, hints, cands, given, values;
    let rounded = true;
    let bounds = { lo: 0, hi: 100 };

    if (kind === "streak") {
      const k = rng.int(3, 12);
      exact = q ** k * 100;
      if (!okPct(exact)) return null;
      values = { p, k };
      prompt = `Each pull on ${banner} has ${aN(p)} ${num(p)}% chance to give ${prize}, independently. What is the chance of missing ${k} pulls in a row?${PCT}`;
      explanation = `One pull misses with probability \`1 - ${num(p / 100)} = ${num(q)}\`.\n\n${k} misses in a row: \`${num(q)}^${k}\` ≈ ${(exact / 100).toFixed(6)}, so as a percentage ${result(exact)}%.`;
      hints = ["The pulls are independent, so the chance of several misses in a row is the miss chance multiplied by itself once per pull.", `One pull misses with probability \`1 - _pct/100\` = ${num(q)}. Raise it to the power ${k} (\`_k\`).`, "Multiply by 100 for a percentage and round to 2 decimal places."];
      cands = [(1 - q ** k) * 100, Math.max(1, 100 - k * p), q * 100, q ** (k - 1) * 100]; // complement, subtracted chances, one miss, one miss too few
      given = [{ label: "_pct", value: p }, { label: "_k", value: k }];
    } else if (kind === "pity") {
      exact = q ** (N - 1) * 100;
      if (!okPct(exact)) return null;
      values = { p, N };
      prompt = `${rules} Starting from zero, what is the chance that you need the pity, that is, that you reach pull ${N}?${PCT}`;
      explanation = `You reach pull ${N} only if the first ${N - 1} pulls all miss.\n\n\`${num(q)}^${N - 1}\` ≈ ${(exact / 100).toFixed(6)}, so as a percentage ${result(exact)}%.`;
      hints = [`The pity only matters if pulls 1 to ${N - 1} all miss. Pull ${N} itself doesn't change that chance.`, `That's ${N - 1} independent misses: \`(1 - _pct/100)^(_pity - 1)\`.`, "Multiply by 100 for a percentage and round to 2 decimal places."];
      cands = [q ** N * 100, (1 - q ** (N - 1)) * 100, p, Math.max(1, 100 - (N - 1) * p)];
      given = [{ label: "_pct", value: p }, { label: "_pity", value: N }];
    } else if (kind === "exactly") {
      const k = rng.int(2, Math.min(12, N - 1));
      exact = q ** (k - 1) * p;
      if (!okPct(exact)) return null;
      values = { p, N, k };
      prompt = `${rules} Starting from zero, what is the chance that you first get it on exactly pull ${k}?${PCT}`;
      explanation = `Pull ${k} is before the pity, so it is an ordinary pull: the first ${k - 1} miss and pull ${k} hits.\n\n\`${num(q)}^${k - 1} × ${num(p / 100)}\` ≈ ${(exact / 100).toFixed(6)}, so as a percentage ${result(exact)}%.`;
      hints = [`Pull ${k} comes before pull ${N}, so the pity rule doesn't apply yet.`, `You need ${k - 1} misses, then a hit: \`(1 - _pct/100)^${k - 1} * _pct/100\`.`, "Multiply by 100 for a percentage and round to 2 decimal places."];
      cands = [q ** k * 100, p, (1 - q ** k) * 100, q ** (k - 1) * 100];
      given = [{ label: "_pct", value: p }, { label: "_pity", value: N }, { label: "_k", value: k }];
    } else if (kind === "within") {
      const k = rng.int(3, N - 1);
      exact = (1 - q ** k) * 100;
      if (!okPct(exact)) return null;
      values = { p, N, k };
      prompt = `${rules} Starting from zero, what is the chance that you get it within your first ${k} pulls?${PCT}`;
      explanation = `${k} is less than ${N}, so the pity can't help yet. Missing all ${k}: \`${num(q)}^${k}\` ≈ ${(q ** k).toFixed(6)}.\n\nAt least one hit: \`1 - ${(q ** k).toFixed(6)}\`, so as a percentage ${result(exact)}%.`;
      hints = [`${k} pulls is fewer than ${N}, so the guarantee hasn't kicked in. "Within ${k} pulls" means at least one hit among them.`, `Use 1 - P(all ${k} miss), where P(all miss) = \`(1 - _pct/100)^_k\`.`, "Multiply by 100 for a percentage and round to 2 decimal places."];
      cands = [q ** k * 100, Math.min(99, k * p), (1 - q ** (k - 1)) * 100, p];
      given = [{ label: "_pct", value: p }, { label: "_pity", value: N }, { label: "_k", value: k }];
    } else if (kind === "expected") {
      exact = (1 - q ** N) / (p / 100);
      if (nearHalf(exact) || 100 / p - exact < 0.05) return null; // the pity must make a visible difference
      values = { p, N };
      rounded = true;
      bounds = { lo: 0 };
      prompt = `${rules} Starting from zero, what is the expected number of pulls to get it?${DP2}`;
      explanation =
        `Let T be the pull that gives it. T is more than k exactly when the first k pulls all miss (for k < ${N}), so\n\n` +
        `\`E[T] = 1 + q + q² + … + q^${N - 1}\`, with q = ${num(q)}.\n\n` +
        `This geometric series sums to \`(1 - q^${N}) / (1 - q) = (1 - ${num(q)}^${N}) / ${num(p / 100)}\` ${result(exact)}.\n\n` +
        `(Without pity it would be \`1 / ${num(p / 100)}\` = ${num(100 / p)}; the pity cuts off the long unlucky runs.)`;
      hints = [
        `Without pity, the average would be \`100 / _pct\`. The pity stops every run at pull ${N}, so it is a bit less.`,
        `E[T] = P(T > 0) + P(T > 1) + … + P(T > ${N - 1}), and P(T > k) = q^k, where q = \`1 - _pct/100\`.`,
        `Sum the geometric series: \`(1 - q^_pity) / (_pct/100)\`, then round to 2 decimal places.`,
      ];
      cands = [100 / p, (N + 1) / 2, (1 - q ** (N - 1)) / (p / 100), N * q ** (N - 1) + 1];
      given = [{ label: "_pct", value: p }, { label: "_pity", value: N }];
    } else {
      const pity = q ** (N - 1) * 100;
      const ev = (1 - q ** N) / (p / 100);
      if (!okPct(pity) || nearHalf(ev) || 100 / p - ev < 0.05) return null;
      const parts = [
        numPart("pity", "Reach the pity", `What is the chance that you reach pull ${N}?${PCT}`, pity, true, `You reach pull ${N} only if pulls 1 to ${N - 1} all miss: \`(1 - _pct/100)^(_pity - 1)\`.`),
        numPart("expected", "Expected pulls", `What is the expected number of pulls to get it?${DP2}`, ev, true, "Add P(T > k) = q^k for k = 0 to `_pity - 1`; the geometric series gives `(1 - q^_pity) / (_pct/100)` with q = `1 - _pct/100`."),
      ];
      const explanation2 =
        `**Reach the pity:** \`${num(q)}^${N - 1}\` ≈ ${(pity / 100).toFixed(6)}, so ${result(pity)}%.\n\n` +
        `**Expected pulls:** \`(1 - ${num(q)}^${N}) / ${num(p / 100)}\` ${result(ev)}. Without pity it would be ${num(100 / p)}.`;
      return {
        prompt: `${rules} You start from zero.`, answerType: "multi", parts, explanation: explanation2,
        hints: [`Before pull ${N}, every pull is an ordinary independent pull that misses with probability \`1 - _pct/100\`.`],
        given: [{ label: "_pct", value: p }, { label: "_pity", value: N }],
        params: { kind: "pityMulti", p, N },
      };
    }
    return finish({ prompt, explanation, hints, given, params: { kind, values } }, exact, rounded, cands, rng, bounds);
  });
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  checkDifficulty(difficulty);
  if (subtopic === "drop-rates") return genDrops(difficulty, rng);
  if (subtopic === "crits") return genCrits(difficulty, rng);
  if (subtopic === "loot") return genLoot(difficulty, rng);
  if (subtopic === "pity") return genPity(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// verify(): rebuild each situation and work it out a different way.

// Distribution of the number of drops after n independent tries, built one try at a time.
function dropDist(p, n) {
  let d = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(d.length + 1).fill(0);
    for (let k = 0; k < d.length; k++) {
      next[k] += d[k] * (1 - p);
      next[k + 1] += d[k] * p;
    }
    d = next;
  }
  return d;
}

// Probability of each pull number T giving the prize, stepping the pity counter pull by pull.
function pityDist(p, N) {
  const dist = new Array(N + 1).fill(0);
  let waiting = 1; // still without the prize before this pull
  for (let k = 1; k <= N; k++) {
    const hit = k === N ? waiting : waiting * p;
    dist[k] = hit;
    waiting -= hit;
  }
  return dist;
}

// Expected damage per attack from 100 × 100 equally likely (hit ticket, crit ticket) outcomes.
function ticketDamage(D, cPct, m, hPct) {
  let total = 0;
  for (let i = 0; i < 100; i++) {
    if (i >= hPct) continue; // miss
    for (let j = 0; j < 100; j++) total += j < cPct ? D * m : D;
  }
  return total / 10000;
}

// Every hit/miss sequence of length k with its probability; returns P(first hit is exactly on try k).
function firstOnEnum(p, k) {
  let total = 0;
  for (let mask = 0; mask < 1 << k; mask++) {
    let pr = 1;
    let first = 0;
    for (let i = 0; i < k; i++) {
      const hit = (mask >> i) & 1;
      pr *= hit ? p : 1 - p;
      if (hit && !first) first = i + 1;
    }
    if (first === k) total += pr;
  }
  return total;
}

// Expected tries until the first success, as a long sum of k · P(first success on try k).
function expTriesSeries(p) {
  let e = 0;
  let wait = 1;
  for (let k = 1; k < 200000 && wait > 1e-15; k++) {
    e += k * wait * p;
    wait *= 1 - p;
  }
  return e;
}

// Loot tables expanded into weight tickets: returns the item index for every ticket.
const tickets = (items) => items.flatMap((x, i) => new Array(x.w).fill(i));

const near = (x, truth, tol) => Number.isFinite(x) && Math.abs(x - truth) <= tol + 1e-9;
const pctOk = (x, prob) => near(x, prob * 100, 0.005);

function checkSingle(p, x) {
  const v = p.values || {};
  switch (p.kind) {
    case "expTries":
    case "expTries2": {
      const e = expTriesSeries(v.p / 100);
      return p.rounded ? near(x, e, 0.005) : Number.isInteger(x) && Math.abs(x - e) < 1e-6;
    }
    case "none":
    case "atLeast": {
      const d = dropDist(v.p / 100, v.n);
      return pctOk(x, p.kind === "none" ? d[0] : sum(d.slice(1)));
    }
    case "firstOn":
      return pctOk(x, firstOnEnum(v.p / 100, v.k));
    case "smallestN": {
      if (!Number.isInteger(x) || x < 1) return false;
      let none = 1;
      let n = 0;
      while (1 - none < v.T / 100 && n < 10000) { none *= 1 - v.p / 100; n++; }
      return x === n;
    }
    case "exactlyK":
      return pctOk(x, dropDist(v.p / 100, v.n)[v.k]);
    case "perHit":
    case "perHitAcc":
    case "nHits":
    case "dps":
    case "dpsAcc": {
      const perAttack = ticketDamage(v.D, v.c, v.m, v.h);
      const truth = p.kind === "nHits" ? perAttack * v.n : p.kind.startsWith("dps") ? perAttack * (v.interval ? 1 / v.interval : v.aps) : perAttack;
      return near(x, truth, 0.005);
    }
    case "needCrit": {
      // Expected damage is linear in the crit chance: interpolate between whole-percent ticket counts.
      if (!(x > 0 && x < 100)) return false;
      const c0 = Math.floor(x);
      const e0 = ticketDamage(v.D, c0, v.m, 100);
      const e1 = ticketDamage(v.D, c0 + 1, v.m, 100);
      const ex = e0 + (x - c0) * (e1 - e0);
      return Math.abs(ex - v.X) <= 0.005 * (e1 - e0) + 1e-9;
    }
    case "item":
    case "notItem": {
      const t = tickets(p.items);
      const fav = t.filter((i) => (p.kind === "item" ? i === v.i : i !== v.i)).length;
      return pctOk(x, fav / t.length);
    }
    case "tier": {
      const t = tickets(p.items);
      const rank = TIERS.indexOf(v.tier);
      const fav = t.filter((i) => (v.mode === "tier" ? p.items[i].tier === v.tier : TIERS.indexOf(p.items[i].tier) >= rank)).length;
      return pctOk(x, fav / t.length);
    }
    case "evGold":
    case "evGoldN": {
      const t = tickets(p.items);
      const truth = (v.n * sum(t.map((i) => p.items[i].g))) / t.length;
      return near(x, truth, 0.005);
    }
    case "atLeastN": {
      const t = tickets(p.items);
      const one = t.filter((i) => p.items[i].tier === v.tier).length / t.length;
      return pctOk(x, sum(dropDist(one, v.n).slice(1)));
    }
    case "streak":
      return pctOk(x, dropDist(v.p / 100, v.k)[0]);
    case "pity":
      return pctOk(x, pityDist(v.p / 100, v.N)[v.N]);
    case "exactly":
      return pctOk(x, pityDist(v.p / 100, v.N)[v.k]);
    case "within":
      return pctOk(x, sum(pityDist(v.p / 100, v.N).slice(1, v.k + 1)));
    case "expected": {
      const d = pityDist(v.p / 100, v.N);
      return near(x, sum(d.map((pr, k) => pr * k)), 0.005);
    }
    default:
      return false;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (question.answerType === "multi") {
    if (!answer || typeof answer !== "object") return false;
    const A = (id) => Number(answer[id]);
    if (p.kind === "dropMulti") {
      const d = dropDist(p.p / 100, p.n);
      return pctOk(A("chance"), sum(d.slice(1))) && checkSingle({ kind: "smallestN", values: { p: p.p, T: p.T } }, A("tries"));
    }
    if (p.kind === "critMulti") {
      const a = ticketDamage(p.A.D, p.A.c, p.A.m, 100) * p.A.aps;
      const b = ticketDamage(p.B.D, p.B.c, p.B.m, 100) * p.B.aps;
      return near(A("dps-a"), a, 0.005) && near(A("dps-b"), b, 0.005) && answer.best === (a > b ? "Weapon A" : "Weapon B");
    }
    if (p.kind === "lootMulti") {
      const t = tickets(p.items);
      const tier = t.filter((i) => p.items[i].tier === p.tier).length / t.length;
      const ev = sum(t.map((i) => p.items[i].g)) / t.length;
      return pctOk(A("tier"), tier) && near(A("gold"), ev, 0.005) && near(A("total"), ev * p.n, 0.005);
    }
    if (p.kind === "pityMulti") {
      const d = pityDist(p.p / 100, p.N);
      return pctOk(A("pity"), d[p.N]) && near(A("expected"), sum(d.map((pr, k) => pr * k)), 0.005);
    }
    return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x)) return false;
  return checkSingle(p, x);
}
