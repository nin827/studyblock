// Balancing & progression generator. Uses only the seeded rng passed in by the engine.
// Subtopics: xp-curves, damage, scaling, economy. Every formula is stated in the prompt.
// Number formats: whole numbers (tolerance 0) or "2dp" (tolerance 0.005).
// No hit chances or critical hits (that's Game Probability) and no vectors (Vectors & Movement).
// params.kind tells verify() how to recheck: it levels up step by step, simulates hits and runs,
// and multiplies bonuses one at a time, instead of using the generator's closed forms.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

const DP2 = " Round to 2 decimal places.";
const NEAREST = " Round to the nearest whole number.";

function buildChoices(correct, candidates, rounded, rng, allowNeg = false) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    if (v < 0 && correct >= 0 && !allowNeg) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// fmt: "int" (exact whole number) | "r0" (rounded to a whole number) | "2dp".
function finishNum(base, exact, fmt, candidates, rng, allowNeg = false) {
  const rounded = fmt === "2dp";
  const value = fmt === "r0" ? Math.round(exact) : exact;
  const q = { ...base, tolerance: rounded ? 0.005 : 0 };
  if (candidates && rng.next() < 0.35) {
    const { answer, choices } = buildChoices(value, fmt === "r0" ? candidates.map(Math.round) : candidates, rounded, rng, allowNeg);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: rounded ? round2(value) : value, answerType: "number" };
}

const numPart = (id, label, ask, value, fmt, hint) => ({
  id, label, ask, answerType: "number",
  answer: fmt === "2dp" ? round2(value) : fmt === "r0" ? Math.round(value) : value,
  tolerance: fmt === "2dp" ? 0.005 : 0,
  hint,
});

const givenFrom = (values) => Object.entries(values).map(([k, value]) => ({ label: `_${k}`, value }));
// Bonus percentages as calculator rows: _bonus1, _bonus2, ...
const bonusRows = (bon) => Object.fromEntries(bon.map((x, i) => [`bonus${i + 1}`, x]));

function result(exact, fmt, unit = "") {
  const u = unit ? ` ${unit}` : "";
  if (fmt === "int") return `= **${num(exact)}${u}**`;
  const shown = fmt === "r0" ? String(Math.round(exact)) : fmtAns(exact, true);
  if (Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${num(exact)}${u}, which rounds to **${shown}${u}**`;
}

// Not within 0.0001 of a rounding boundary, so exactly one answer is right.
const safe2 = (v) => Math.abs((Math.abs(v * 100) % 1) - 0.5) > 1e-4;
const safe0 = (v) => Math.abs((Math.abs(v) % 1) - 0.5) > 1e-4;
// A ceiling that isn't sensitive to rounding: the quotient is well away from a whole number.
const ceilSafe = (q) => { const f = q - Math.floor(q); return f > 0.02 && f < 0.98; };

function checkDifficulty(d) {
  if (d !== "easy" && d !== "medium" && d !== "hard") throw new Error(`Unknown difficulty: ${d}`);
}

const GAMES = ["a fantasy RPG", "a space shooter", "a farming sim", "a dungeon crawler", "a monster-catching game", "a pirate adventure", "a mech battler", "a cozy life sim", "a racing RPG", "a tower defence game", "a survival game", "a card battler"];

// ---------------------------------------------------------------------------------------------
// XP curves. XP(k) = XP needed to go from level k to level k + 1; you start at level 1 with 0 XP.

const XP_DEF = "XP(k) is the XP needed to go from level k to level k + 1, and you start at level 1 with 0 XP.";

function genXP(d, rng) {
  checkDifficulty(d);
  const game = rng.pick(GAMES);

  // Linear curve XP(k) = B + S(k − 1).
  const lin = () => ({ B: 10 * rng.int(5, 50), S: 5 * rng.int(2, 40) });
  const linTxt = (B, S) => `\`XP(k) = ${B} + ${S} × (k − 1)\``;
  const linTotal = (B, S, n) => ((n - 1) * (2 * B + (n - 2) * S)) / 2;

  if (d === "easy") {
    const { B, S } = lin();
    if (rng.next() < 0.5) {
      const k = rng.int(3, 25);
      const v = B + S * (k - 1);
      const base = {
        prompt: `In ${game}, ${XP_DEF} The curve is ${linTxt(B, S)}. How much XP does it take to go from level ${k} to level ${k + 1}?`,
        explanation: `Put k = ${k} into the formula.\n\n\`XP(${k}) = ${B} + ${S} × (${k} − 1) = ${B} + ${S * (k - 1)}\` = **${v}**`,
        hints: [`Going from level ${k} to level ${k + 1} costs XP(${k}), so put k = ${k} into the formula.`, `Work out ${B} + ${S} × ${k - 1} (in the calculator: \`_b + _s * (_k - 1)\`). Multiply before you add.`],
        given: givenFrom({ b: B, s: S, k }),
        params: { kind: "linstep", B, S, k },
      };
      return finishNum(base, v, "int", [B + S * k, (B + S) * (k - 1), B * k], rng);
    }
    const n = rng.int(3, 7);
    const steps = [];
    for (let k = 1; k < n; k++) steps.push(B + S * (k - 1));
    const v = steps.reduce((s, x) => s + x, 0);
    const base = {
      prompt: `In ${game}, ${XP_DEF} The curve is ${linTxt(B, S)}. How much XP in total do you need to reach level ${n}?`,
      explanation: `Add the cost of every level-up from 1 to ${n}.\n\n- ${steps.map((x, i) => `XP(${i + 1}) = ${x}`).join(", ")}\n- Total: ${steps.join(" + ")} = **${v}**`,
      hints: [`Reaching level ${n} from level 1 takes ${n - 1} level-ups: XP(1), XP(2), … up to XP(${n - 1}). Add them all.`, `XP(1) = ${B}, and each next level costs ${S} more. List the ${n - 1} costs and add them.`],
      given: givenFrom({ b: B, s: S }),
      params: { kind: "lintotal", B, S, n },
    };
    return finishNum(base, v, "int", [linTotal(B, S, n + 1), B + S * (n - 1), (n - 1) * B], rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["lintotal", "geostep", "linreach"]);
    if (kind === "geostep") {
      let B, r, k, v;
      do {
        B = 10 * rng.int(5, 30);
        r = rng.pick([1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5]);
        k = rng.int(3, 15);
        v = B * r ** (k - 1);
      } while (!safe0(v) || v > 1e6);
      const base = {
        prompt: `In ${game}, ${XP_DEF} Each level-up costs ${Math.round((r - 1) * 100)}% more than the one before: \`XP(k) = ${B} × ${num(r)}^(k − 1)\`. How much XP does it take to go from level ${k} to level ${k + 1}?${NEAREST}`,
        explanation: `Put k = ${k} into the formula.\n\n\`XP(${k}) = ${B} × ${num(r)}^${k - 1}\` ${result(v, "r0")}`,
        hints: [`Going from level ${k} to level ${k + 1} costs XP(${k}). The power is k − 1 = ${k - 1}.`, `Work out ${B} × ${num(r)}^${k - 1} (in the calculator: \`_b * _r^(_k - 1)\`), then round.`],
        given: givenFrom({ b: B, r, k }),
        params: { kind: "geostep", B, r100: Math.round(r * 100), k },
      };
      return finishNum(base, v, "r0", [B * r ** k, B * r * (k - 1), B * (1 + (r - 1) * (k - 1))], rng);
    }
    const { B, S } = lin();
    if (kind === "lintotal") {
      const n = rng.int(8, 40);
      const last = B + S * (n - 2);
      const v = linTotal(B, S, n);
      const base = {
        prompt: `In ${game}, ${XP_DEF} The curve is ${linTxt(B, S)}. How much XP in total do you need to reach level ${n}?`,
        explanation:
          `The level-ups XP(1) … XP(${n - 1}) form an arithmetic series, so total = number of terms × (first + last) ÷ 2.\n\n` +
          `- Terms: ${n - 1}; first: ${B}; last: XP(${n - 1}) = ${B} + ${S} × ${n - 2} = ${last}\n- Total: ${n - 1} × (${B} + ${last}) ÷ 2 = **${v}**`,
        hints: [
          `You need XP(1) + XP(2) + … + XP(${n - 1}): that's ${n - 1} level-ups, each ${S} more than the last.`,
          `For an evenly growing list, total = count × (first + last) ÷ 2. The first is ${B}; the last is XP(${n - 1}) = ${B} + ${S} × ${n - 2}.`,
        ],
        given: givenFrom({ b: B, s: S, n }),
        params: { kind: "lintotal", B, S, n },
      };
      return finishNum(base, v, "int", [linTotal(B, S, n + 1), (n * (2 * B + (n - 1) * S)) / 2 - B, (n - 1) * last], rng);
    }
    // linreach: level reached with X total XP.
    let n, X;
    do {
      n = rng.int(4, 25);
      X = linTotal(B, S, n) + rng.int(0, B + S * (n - 1) - 1);
    } while (X % 10 === 0 && rng.next() < 0.5);
    const base = {
      prompt: `In ${game}, ${XP_DEF} The curve is ${linTxt(B, S)}. A player has earned ${X} XP in total. What level are they?`,
      explanation:
        `Add level-ups until the next one no longer fits.\n\n- Reaching level ${n} costs ${linTotal(B, S, n)} XP in total, which is ≤ ${X}\n` +
        `- Reaching level ${n + 1} costs ${linTotal(B, S, n + 1)} XP, which is more than ${X}\n\nSo the player is level **${n}**.`,
      hints: [
        "Keep a running total: add XP(1), then XP(2), and so on. Stop when the next level-up would take you past the player's XP.",
        `The costs go ${B}, ${B + S}, ${B + 2 * S}, … (each ${S} more). Count how many whole level-ups fit into ${X} XP, then add that to the starting level.`,
      ],
      given: givenFrom({ b: B, s: S, xp: X }),
      params: { kind: "linreach", B, S, X },
    };
    return finishNum(base, n, "int", [n - 1, n + 1, Math.floor(X / B) + 1], rng);
  }

  // Hard
  const kind = rng.pick(["geototal", "georeach", "quad", "multi"]);
  if (kind === "multi") {
    const { B, S } = lin();
    const n = rng.int(10, 40);
    const tot = linTotal(B, S, n);
    const have = tot + rng.int(0, B + S * (n - 1) - 1);
    const left = linTotal(B, S, n + 1) - have;
    const parts = [
      numPart("step", "Next level", `XP to go from level ${n} to level ${n + 1}`, B + S * (n - 1), "int", `Put k = ${n} into the formula.`),
      numPart("total", "Total", `Total XP needed to reach level ${n}`, tot, "int", `Add XP(1) to XP(${n - 1}): count × (first + last) ÷ 2.`),
      numPart("left", "Still needed", `XP still needed to reach level ${n + 1}`, left, "int", `Total XP to reach level ${n + 1}, minus the ${have} XP the player has.`),
    ];
    return {
      prompt: `In ${game}, ${XP_DEF} The curve is ${linTxt(B, S)}. A player has ${have} XP in total, which puts them at level ${n}.`,
      answerType: "multi",
      parts,
      explanation:
        `Use the formula for single steps and the arithmetic series for totals.\n\n- XP(${n}) = ${B} + ${S} × ${n - 1} = **${B + S * (n - 1)}**\n` +
        `- Total to level ${n}: ${n - 1} × (${B} + ${B + S * (n - 2)}) ÷ 2 = **${tot}**\n- Still needed: ${tot} + ${B + S * (n - 1)} − ${have} = **${left}**`,
      hints: ["XP(k) is one level-up; a total is the sum of all level-ups from level 1."],
      given: givenFrom({ b: B, s: S, xp: have }),
      params: { kind: "xpmulti", B, S, n, have },
    };
  }
  if (kind === "quad") {
    const A = 5 * rng.int(1, 12), C = 10 * rng.int(0, 20);
    const n = rng.int(5, 25);
    let v = 0;
    for (let k = 1; k < n; k++) v += A * k * k + C;
    const m = n - 1;
    const sq = (m * (m + 1) * (2 * m + 1)) / 6;
    const base = {
      prompt: `In ${game}, ${XP_DEF} The curve is \`XP(k) = ${A} × k² + ${C}\`. How much XP in total do you need to reach level ${n}?`,
      explanation:
        `Add XP(1) to XP(${m}). Use 1² + 2² + … + m² = m(m + 1)(2m + 1) ÷ 6 with m = ${m}.\n\n` +
        `- 1² + … + ${m}² = ${m} × ${m + 1} × ${2 * m + 1} ÷ 6 = ${sq}\n- Total = ${A} × ${sq} + ${C} × ${m} = **${v}**`,
      hints: [
        `You need XP(1) + … + XP(${m}). Split it into ${A} × (1² + 2² + … + ${m}²) plus ${C} for each of the ${m} level-ups.`,
        `1² + 2² + … + m² = m(m + 1)(2m + 1) ÷ 6. Put m = ${m} in, then multiply by ${A} and add ${C} × ${m}.`,
      ],
      given: givenFrom({ a: A, c: C, n }),
      params: { kind: "quad", A, C, n },
    };
    return finishNum(base, v, "int", [v + A * n * n + C, A * sq, A * ((n * (n + 1) * (2 * n + 1)) / 6) + C * n], rng);
  }
  // Geometric totals / reach.
  let B, r, n, tot;
  do {
    B = 10 * rng.int(5, 30);
    r = rng.pick([1.1, 1.15, 1.2, 1.25, 1.3, 1.5]);
    n = rng.int(5, 20);
    tot = (B * (r ** (n - 1) - 1)) / (r - 1);
  } while (!safe0(tot) || tot > 5e6);
  const curve = `Each level-up costs ${Math.round((r - 1) * 100)}% more than the one before: \`XP(k) = ${B} × ${num(r)}^(k − 1)\` (don't round the individual levels).`;
  if (kind === "geototal") {
    const base = {
      prompt: `In ${game}, ${XP_DEF} ${curve} How much XP in total do you need to reach level ${n}?${NEAREST}`,
      explanation:
        `The level-ups form a geometric series with first term ${B}, ratio ${num(r)} and ${n - 1} terms, so total = first × (rⁿ⁻¹ − 1) ÷ (r − 1).\n\n` +
        `\`${B} × (${num(r)}^${n - 1} − 1) ÷ (${num(r)} − 1)\` ${result(tot, "r0")}`,
      hints: [
        `You need XP(1) + … + XP(${n - 1}): ${n - 1} terms, each ${num(r)} times the one before. That's a geometric series.`,
        `Sum = first × (r^count − 1) ÷ (r − 1). Here: ${B} × (${num(r)}^${n - 1} − 1) ÷ (${num(r)} − 1) (in the calculator: \`_b * (_r^(_n - 1) - 1) / (_r - 1)\`).`,
      ],
      given: givenFrom({ b: B, r, n }),
      params: { kind: "geototal", B, r100: Math.round(r * 100), n },
    };
    return finishNum(base, tot, "r0", [(B * (r ** n - 1)) / (r - 1), B * r ** (n - 1), B * (n - 1) * r], rng);
  }
  // georeach
  const next = B * r ** (n - 1);
  const X = Math.floor(tot + 1 + rng.next() * (next - 2));
  const base = {
    prompt: `In ${game}, ${XP_DEF} ${curve} A player has earned ${X} XP in total. What level are they?`,
    explanation:
      `Add level-ups until the next one no longer fits.\n\n- Reaching level ${n} costs about ${num(tot)} XP in total, which is ≤ ${X}\n- The next level-up costs about ${num(next)} more, which would pass ${X}\n\nSo the player is level **${n}**.`,
    hints: [
      "Keep a running total of XP(1), XP(2), … and stop when the next level-up would take you past the player's XP.",
      `The costs are ${B}, ${num(B * r)}, ${num(B * r * r)}, … (each × ${num(r)}). Count how many fit into ${X} XP, then add 1 for the starting level.`,
    ],
    given: givenFrom({ b: B, r, xp: X }),
    params: { kind: "georeach", B, r100: Math.round(r * 100), X },
  };
  return finishNum(base, n, "int", [n - 1, n + 1, Math.floor(X / B) + 1], rng);
}

// ---------------------------------------------------------------------------------------------
// Damage and armour (no hit chance, no crits)

const FOES = ["a goblin", "a stone golem", "a pirate captain", "a slime king", "a training dummy", "a dragon whelp", "a mech drone", "a skeleton knight", "a swamp troll", "an ice wraith", "a bandit", "a giant crab"];
const ATTACKS = ["sword", "bow", "fireball", "laser", "hammer", "dagger", "spear", "plasma rifle"];

function genDamage(d, rng) {
  checkDifficulty(d);
  const foe = rng.pick(FOES);
  const atk = rng.pick(ATTACKS);

  if (d === "easy") {
    const kind = rng.pick(["flat", "pct", "hits"]);
    if (kind === "flat") {
      let A, R;
      do {
        A = rng.int(8, 120);
        R = rng.int(0, 110);
      } while (A === R);
      const v = Math.max(1, A - R);
      const base = {
        prompt: `In this game, damage per hit = attack − armour, but never less than 1. A ${atk} with ${A} attack hits ${foe} with ${R} armour. How much damage does each hit deal?`,
        explanation: `Subtract the armour, then apply the minimum of 1.\n\n- ${A} − ${R} = ${A - R}\n- ${A - R < 1 ? `That is below 1, so each hit deals **1**` : `That is at least 1, so each hit deals **${v}**`}`,
        hints: ["Flat armour is subtracted from every hit: damage = attack − armour.", `Work out ${A} − ${R}, and remember the rule that a hit always does at least 1.`],
        given: givenFrom({ atk: A, armour: R }),
        params: { kind: "flat", A, R },
      };
      return finishNum(base, v, "int", [A + R, A - R, Math.round(A * (1 - R / 100))], rng, false);
    }
    if (kind === "pct") {
      let A, R;
      do {
        A = 10 * rng.int(2, 40);
        R = 5 * rng.int(1, 16);
      } while ((A * (100 - R)) % 100 !== 0 || A === 100); // at 100 the answer would equal the "lets x% through" hint
      const v = (A * (100 - R)) / 100;
      const base = {
        prompt: `${foe.charAt(0).toUpperCase() + foe.slice(1)} has a shield that blocks ${R}% of incoming damage: damage taken = damage × (1 − ${R} ÷ 100). A ${atk} hit would deal ${A}. How much damage gets through?`,
        explanation: `Keep the part the shield doesn't block.\n\n\`${A} × (1 − ${R / 100})\` = ${A} × ${num(1 - R / 100)} = **${v}**`,
        hints: [`Blocking ${R}% lets ${100 - R}% through.`, `Work out ${A} × ${num(1 - R / 100)} (in the calculator: \`_dmg * (1 - _block / 100)\`).`],
        given: givenFrom({ dmg: A, block: R }),
        params: { kind: "pct", A, R },
      };
      return finishNum(base, v, "int", [(A * R) / 100, A - R, A + (A * R) / 100], rng);
    }
    let H, D;
    do {
      D = rng.int(5, 60);
      H = 10 * rng.int(5, 80);
    } while (H % D === 0 || H / D > 40);
    const v = Math.ceil(H / D);
    const base = {
      prompt: `${foe.charAt(0).toUpperCase() + foe.slice(1)} has ${H} HP. Each ${atk} hit deals exactly ${D} damage. How many hits does it take to defeat it (bring HP to 0 or below)?`,
      explanation: `Divide and round up, because a part-hit still needs a whole hit.\n\n- ${H} ÷ ${D} ≈ ${num(H / D)}\n- Rounded up: **${v}** hits`,
      hints: ["Divide the HP by the damage per hit. If it doesn't come out whole, the last bit of HP still needs one more hit.", `Work out ${H} ÷ ${D} (in the calculator: \`_hp / _dmg\`), then round up.`],
      given: givenFrom({ hp: H, dmg: D }),
      params: { kind: "hits", H, D },
    };
    return finishNum(base, v, "int", [Math.floor(H / D), Math.round(H / D) === v ? v + 1 : Math.round(H / D), v + 2], rng);
  }

  const armourTxt = "damage taken = damage × 100 ÷ (100 + armour)";
  if (d === "medium") {
    const kind = rng.pick(["armour", "ttk", "ehp"]);
    if (kind === "armour") {
      let A, R, v;
      do {
        A = rng.int(20, 400);
        R = rng.int(10, 300);
        v = (A * 100) / (100 + R);
      } while (!safe2(v));
      const base = {
        prompt: `In this game, armour reduces hits by the formula ${armourTxt}. A ${atk} deals ${A} damage to ${foe} with ${R} armour. How much damage is taken?${DP2}`,
        explanation: `Put the numbers into the formula.\n\n\`${A} × 100 ÷ (100 + ${R})\` = ${A * 100} ÷ ${100 + R} ${result(v, "2dp")}`,
        hints: [`The more armour, the bigger the divisor: here it is 100 + ${R}.`, `Work out ${A} × 100 ÷ (100 + ${R}) (in the calculator: \`_dmg * 100 / (100 + _armour)\`).`],
        given: givenFrom({ dmg: A, armour: R }),
        params: { kind: "armour", A, R },
      };
      return finishNum(base, v, "2dp", [A * (1 - R / 100), A - R / 100 * A / 2, (A * R) / (100 + R)], rng);
    }
    if (kind === "ehp") {
      let H, R, v;
      do {
        H = 10 * rng.int(10, 300);
        R = rng.int(5, 80);
        v = H / (1 - R / 100);
      } while (!safe2(v) || R === 50);
      const base = {
        prompt: `${foe.charAt(0).toUpperCase() + foe.slice(1)} has ${H} HP and takes ${R}% less damage from every hit. Its effective HP is the raw damage needed to defeat it: effective HP = HP ÷ (1 − ${R} ÷ 100). What is its effective HP?${DP2}`,
        explanation: `Only ${100 - R}% of each hit gets through, so it takes more raw damage.\n\n\`${H} ÷ (1 − ${num(R / 100)})\` = ${H} ÷ ${num(1 - R / 100)} ${result(v, "2dp")}`,
        hints: [`Only ${100 - R}% of the damage lands, so divide the HP by ${num(1 - R / 100)}.`, `Work out ${H} ÷ ${num(1 - R / 100)} (in the calculator: \`_hp / (1 - _reduce / 100)\`).`],
        given: givenFrom({ hp: H, reduce: R }),
        params: { kind: "ehp", H, R },
      };
      return finishNum(base, v, "2dp", [H * (1 + R / 100), H * (1 - R / 100), H + R], rng);
    }
    // ttk: first hit at t = 0, then one every s seconds.
    let H, D, s, hits;
    do {
      H = 10 * rng.int(5, 200);
      D = rng.int(8, 120);
      s = rng.pick([0.4, 0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.25, 1.5, 2, 2.5]);
      hits = Math.ceil(H / D);
    } while (H % D === 0 || hits < 3 || hits > 40);
    const t = (hits - 1) * s;
    const base = {
      prompt:
        `A ${atk} deals ${D} damage per hit and attacks once every ${num(s)} s. The first hit lands at time 0. ` +
        `${foe.charAt(0).toUpperCase() + foe.slice(1)} has ${H} HP. How many seconds after the first hit does the final, defeating hit land?${DP2}`,
      explanation:
        `Count the hits, then the gaps between them.\n\n- Hits: ${H} ÷ ${D} ≈ ${num(H / D)}, rounded up = ${hits}\n- The first hit is at 0 s, so there are ${hits - 1} gaps\n- Time: ${hits - 1} × ${num(s)} ${result(t, "2dp", "s")}`,
      hints: [
        "First find the number of hits: HP ÷ damage, rounded up.",
        `The first hit is at 0 s, so the last hit comes after (hits − 1) gaps of ${num(s)} s each.`,
      ],
      given: givenFrom({ hp: H, dmg: D, gap: s }),
      params: { kind: "ttk", H, D, s100: Math.round(s * 100) },
    };
    return finishNum(base, t, "2dp", [hits * s, (H / D) * s, (hits - 2) * s], rng);
  }

  // Hard
  const kind = rng.pick(["multi", "order", "pen"]);
  if (kind === "order") {
    let A, F, R, v;
    do {
      A = rng.int(30, 300);
      F = rng.int(3, 40);
      R = 5 * rng.int(2, 14);
      v = (A - F) * (1 - R / 100);
    } while (!safe2(v) || A <= F * 2);
    const base = {
      prompt:
        `In this game, armour first subtracts a flat ${F} from each hit, then a shield blocks ${R}% of what is left: ` +
        `damage taken = (damage − ${F}) × (1 − ${R} ÷ 100). A ${atk} hit deals ${A}. How much damage does ${foe} take?${DP2}`,
      explanation: `Apply the flat reduction first, then the percentage.\n\n- ${A} − ${F} = ${A - F}\n- ${A - F} × ${num(1 - R / 100)} ${result(v, "2dp")}`,
      hints: ["Order matters: subtract the flat armour first, then take the percentage off what is left.", `Work out (${A} − ${F}) × ${num(1 - R / 100)} (in the calculator: \`(_dmg - _flat) * (1 - _block / 100)\`).`],
      given: givenFrom({ dmg: A, flat: F, block: R }),
      params: { kind: "order", A, F, R },
    };
    return finishNum(base, v, "2dp", [A * (1 - R / 100) - F, A - F - R, (A - F) * (R / 100)], rng);
  }
  // Armour with penetration: effective armour = armour × (1 − pen ÷ 100).
  let A, R, P, H, s, dmg, hits;
  do {
    A = rng.int(40, 300);
    R = 10 * rng.int(2, 30);
    P = 5 * rng.int(1, 12);
    H = 50 * rng.int(4, 80);
    s = rng.pick([0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.5, 2]);
    dmg = (A * 100) / (100 + R * (1 - P / 100));
    hits = Math.ceil(H / dmg);
  } while (!safe2(dmg) || !ceilSafe(H / dmg) || Math.ceil(H / round2(dmg)) !== hits || hits < 3 || hits > 60);
  const effR = R * (1 - P / 100);
  const t = (hits - 1) * s;
  const intro =
    `In this game, ${armourTxt}. Armour penetration ignores part of the armour: effective armour = armour × (1 − pen ÷ 100). ` +
    `A ${atk} with ${A} damage and ${P}% penetration attacks ${foe} (${R} armour, ${H} HP)`;
  const given = givenFrom({ dmg: A, armour: R, pen: P, hp: H, gap: s });
  if (kind === "pen") {
    const base = {
      prompt: `${intro}. How much damage does each hit deal?${DP2}`,
      explanation: `Reduce the armour first, then use the armour formula.\n\n- Effective armour: ${R} × ${num(1 - P / 100)} = ${num(effR)}\n- Damage: ${A} × 100 ÷ (100 + ${num(effR)}) ${result(dmg, "2dp")}`,
      hints: [`Work out the effective armour first: ${R} × (1 − ${P} ÷ 100).`, `Then damage = ${A} × 100 ÷ (100 + effective armour) (in the calculator: \`_dmg * 100 / (100 + _armour * (1 - _pen / 100))\`).`],
      given: givenFrom({ dmg: A, armour: R, pen: P }),
      params: { kind: "pen", A, R, P },
    };
    return finishNum(base, dmg, "2dp", [(A * 100) / (100 + R), (A * 100) / (100 + R) * (1 + P / 100), (A * 100) / (100 + R * (P / 100))], rng);
  }
  const parts = [
    numPart("dmg", "Damage per hit", "Damage per hit (2 decimal places)", dmg, "2dp", `Effective armour = ${R} × (1 − ${P} ÷ 100). Then ${A} × 100 ÷ (100 + effective armour).`),
    numPart("hits", "Hits", "Hits needed to defeat it", hits, "int", `Divide ${H} by the unrounded damage per hit and round up.`),
    numPart("ttk", "Time", "Seconds from the first hit to the defeating hit (2 decimal places)", t, "2dp", `The first hit lands at 0 s and one lands every ${num(s)} s, so the last comes after (hits − 1) gaps.`),
  ];
  return {
    prompt: `${intro}, attacking once every ${num(s)} s with the first hit at time 0.`,
    answerType: "multi",
    parts,
    explanation:
      `Damage per hit, then hits, then time.\n\n- Effective armour: ${R} × ${num(1 - P / 100)} = ${num(effR)}\n- Damage: ${A} × 100 ÷ ${num(100 + effR)} ${result(dmg, "2dp")}\n` +
      `- Hits: ${H} ÷ ${num(dmg)} ≈ ${num(H / dmg)}, rounded up = **${hits}**\n- Time: (${hits} − 1) × ${num(s)} ${result(t, "2dp", "s")}`,
    hints: ["Work in order: effective armour, damage per hit, number of hits, then the time between the first and last hit."],
    given,
    params: { kind: "dmgmulti", A, R, P, H, s100: Math.round(s * 100) },
  };
}

// ---------------------------------------------------------------------------------------------
// Stat scaling

const STATS = ["max HP", "attack", "defence", "mana", "move speed", "magic power", "stamina", "shield strength"];
const HEROES = ["a knight", "a ranger", "a mage", "a rogue", "a paladin", "a mech pilot", "a druid", "a gunslinger"];

function genScaling(d, rng) {
  checkDifficulty(d);
  const stat = rng.pick(STATS);
  const hero = rng.pick(HEROES);

  if (d === "easy") {
    if (rng.next() < 0.5) {
      const b = rng.int(5, 200), g = rng.int(2, 40), L = rng.int(3, 60);
      const v = b + g * (L - 1);
      const base = {
        prompt: `In this game, the ${stat} of ${hero} is ${b} at level 1 and grows by ${g} every level: \`stat(L) = ${b} + ${g} × (L − 1)\`. What is it at level ${L}?`,
        explanation: `Put L = ${L} into the formula.\n\n\`${b} + ${g} × (${L} − 1)\` = ${b} + ${g * (L - 1)} = **${v}**`,
        hints: [`From level 1 to level ${L} there are ${L} − 1 level-ups, each adding ${g}.`, `Work out ${b} + ${g} × ${L - 1} (in the calculator: \`_base + _grow * (_lvl - 1)\`).`],
        given: givenFrom({ base: b, grow: g, lvl: L }),
        params: { kind: "linstat", b, g, L },
      };
      return finishNum(base, v, "int", [b + g * L, (b + g) * (L - 1), b * L], rng);
    }
    // Additive % bonuses.
    let base0, bon;
    do {
      base0 = 10 * rng.int(2, 60);
      bon = [5 * rng.int(1, 10), 5 * rng.int(1, 10)];
      if (rng.next() < 0.5) bon.push(5 * rng.int(1, 8));
    } while ((base0 * bon.reduce((s, x) => s + x, 0)) % 100 !== 0);
    const sum = bon.reduce((s, x) => s + x, 0);
    const v = (base0 * (100 + sum)) / 100;
    const list = bon.map((x) => `+${x}%`).join(", ");
    const base = {
      prompt: `${hero.charAt(0).toUpperCase() + hero.slice(1)} has a base ${stat} of ${base0} and gear bonuses of ${list}. In this game percentage bonuses add together first: final = base × (1 + sum of bonuses ÷ 100). What is the final ${stat}?`,
      explanation: `Add the bonuses, then apply them once.\n\n- ${bon.join(" + ")} = ${sum}%\n- ${base0} × ${num(1 + sum / 100)} = **${v}**`,
      hints: ["Additive stacking: add all the percentages together, then apply the total once.", `The bonuses add up to ${bon.join(" + ")}%. Multiply ${base0} by 1 plus that total ÷ 100.`],
      given: givenFrom({ base: base0, ...bonusRows(bon) }),
      params: { kind: "addstack", base: base0, bon },
    };
    const mult = bon.reduce((s, x) => s * (1 + x / 100), base0);
    return finishNum(base, v, "int", [mult, base0 + sum, (base0 * sum) / 100], rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["compound", "multstack", "gap"]);
    if (kind === "compound") {
      let b, p, L, v;
      do {
        b = rng.int(10, 300);
        p = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15]);
        L = rng.int(4, 40);
        v = b * (1 + p / 100) ** (L - 1);
      } while (!safe2(v) || v > 1e6);
      const base = {
        prompt: `The ${stat} of ${hero} starts at ${b} at level 1 and grows by ${p}% each level, compounding: \`stat(L) = ${b} × ${num(1 + p / 100)}^(L − 1)\`. What is it at level ${L}?${DP2}`,
        explanation: `Put L = ${L} into the formula.\n\n\`${b} × ${num(1 + p / 100)}^${L - 1}\` ${result(v, "2dp")}`,
        hints: [`Each level multiplies the stat by ${num(1 + p / 100)}. From level 1 to ${L} that happens ${L - 1} times.`, `Work out ${b} × ${num(1 + p / 100)}^${L - 1} (in the calculator: \`_base * (1 + _pct / 100)^(_lvl - 1)\`).`],
        given: givenFrom({ base: b, pct: p, lvl: L }),
        params: { kind: "compound", b, p, L },
      };
      return finishNum(base, v, "2dp", [b * (1 + p / 100) ** L, b * (1 + (p * (L - 1)) / 100), b * (1 + p / 100) * (L - 1)], rng);
    }
    let b, bon, add, mult;
    do {
      b = rng.int(20, 500);
      bon = [rng.int(5, 60), rng.int(5, 60)];
      if (rng.next() < 0.6) bon.push(rng.int(5, 40));
      add = b * (1 + bon.reduce((s, x) => s + x, 0) / 100);
      mult = bon.reduce((s, x) => s * (1 + x / 100), b);
    } while (!safe2(mult) || !safe2(mult - add));
    const list = bon.map((x) => `+${x}%`).join(", ");
    const chain = bon.map((x) => num(1 + x / 100)).join(" × ");
    if (kind === "multstack") {
      const base = {
        prompt: `${hero.charAt(0).toUpperCase() + hero.slice(1)} has a base ${stat} of ${b} and bonuses of ${list}. In this game each bonus multiplies separately: final = base × (1 + b₁) × (1 + b₂) × …, with each bonus as a decimal. What is the final ${stat}?${DP2}`,
        explanation: `Multiply by each factor in turn.\n\n\`${b} × ${chain}\` ${result(mult, "2dp")}`,
        hints: ["Multiplicative stacking: turn each bonus into a factor (+20% is × 1.2) and multiply them all.", `Work out ${b} × ${chain}.`],
        given: givenFrom({ base: b, ...bonusRows(bon) }),
        params: { kind: "multstack", base: b, bon },
      };
      return finishNum(base, mult, "2dp", [add, b + bon.reduce((s, x) => s + x, 0), b * bon.reduce((s, x) => s * (x / 100), 1)], rng);
    }
    const gap = mult - add;
    const base = {
      prompt:
        `${hero.charAt(0).toUpperCase() + hero.slice(1)} has a base ${stat} of ${b} and bonuses of ${list}. ` +
        `Additive stacking gives base × (1 + sum of bonuses); multiplicative stacking gives base × (1 + b₁) × (1 + b₂) × … (bonuses as decimals). ` +
        `How much higher is the multiplicative result?${DP2}`,
      explanation: `Work out both, then subtract.\n\n- Additive: ${b} × ${num(1 + bon.reduce((s, x) => s + x, 0) / 100)} = ${num(add)}\n- Multiplicative: ${b} × ${chain} ≈ ${num(mult)}\n- Difference ${result(gap, "2dp")}`,
      hints: [
        `Additive: add ${bon.join(" + ")}% and apply once. Multiplicative: multiply by each factor (${chain}).`,
        `Work out ${b} × ${chain} − ${b} × ${num(1 + bon.reduce((s, x) => s + x, 0) / 100)} with full precision, then round.`,
      ],
      given: givenFrom({ base: b, ...bonusRows(bon) }),
      params: { kind: "gap", base: b, bon },
    };
    return finishNum(base, gap, "2dp", [mult, add - b, gap * 2], rng);
  }

  // Hard
  const kind = rng.pick(["firstlevel", "multi", "catchup"]);
  if (kind === "firstlevel") {
    let b, p, T, L;
    do {
      b = rng.int(10, 200);
      p = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20]);
      L = rng.int(5, 40);
      const lo = b * (1 + p / 100) ** (L - 2), hi = b * (1 + p / 100) ** (L - 1);
      T = Math.floor(lo + 1 + rng.next() * Math.max(0, hi - lo - 2));
      // keep the target clearly between the two levels' values
      if (!(T > lo + 0.01 && T < hi - 0.01)) T = null;
    } while (T === null);
    const base = {
      prompt:
        `The ${stat} of ${hero} is ${b} at level 1 and grows ${p}% per level, compounding: \`stat(L) = ${b} × ${num(1 + p / 100)}^(L − 1)\`. ` +
        `At what level does it first go above ${T}?`,
      explanation:
        `Find the smallest L with stat(L) > ${T}.\n\n- Level ${L - 1}: ${b} × ${num(1 + p / 100)}^${L - 2} ≈ ${num(b * (1 + p / 100) ** (L - 2))} (not above ${T})\n` +
        `- Level ${L}: ${b} × ${num(1 + p / 100)}^${L - 1} ≈ ${num(b * (1 + p / 100) ** (L - 1))} (above ${T})\n\nSo the answer is level **${L}**.`,
      hints: [
        `Solve ${b} × ${num(1 + p / 100)}^(L − 1) > ${T}. Logs help: L − 1 > ln(${T} ÷ ${b}) ÷ ln(${num(1 + p / 100)}).`,
        `Work out ln(${T} ÷ ${b}) ÷ ln(${num(1 + p / 100)}) (in the calculator: \`ln(_target / _base) / ln(1 + _pct / 100)\`). L − 1 must be the next whole number above it.`,
      ],
      given: givenFrom({ base: b, pct: p, target: T }),
      params: { kind: "firstlevel", b, p, T },
    };
    return finishNum(base, L, "int", [L - 1, L + 1, Math.ceil(Math.log(T / b) / Math.log(1 + p / 100))], rng);
  }
  if (kind === "catchup") {
    // Linear hero vs compounding hero: first level where B overtakes A.
    let a0, g, b0, p, L;
    do {
      a0 = rng.int(50, 300);
      g = rng.int(5, 40);
      b0 = rng.int(20, a0 - 10);
      p = rng.pick([5, 6, 8, 10, 12, 15, 20]);
      L = null;
      for (let k = 2; k <= 80; k++) {
        const A = a0 + g * (k - 1), B = b0 * (1 + p / 100) ** (k - 1);
        if (B > A) { L = k; break; }
      }
      if (L !== null) {
        const A1 = a0 + g * (L - 1), B1 = b0 * (1 + p / 100) ** (L - 1);
        const A0 = a0 + g * (L - 2), B0 = b0 * (1 + p / 100) ** (L - 2);
        if (B1 - A1 < 0.01 || A0 - B0 < 0.01 || L < 4 || L > 60) L = null;
      }
    } while (L === null);
    const hero2 = rng.pick(HEROES.filter((h) => h !== hero));
    const base = {
      prompt:
        `Two builds compete. ${hero.charAt(0).toUpperCase() + hero.slice(1)} has ${stat} \`A(L) = ${a0} + ${g} × (L − 1)\`; ${hero2} has \`B(L) = ${b0} × ${num(1 + p / 100)}^(L − 1)\`. ` +
        `At what level L is B(L) first greater than A(L)?`,
      explanation:
        `Step through the levels until the compounding build passes the linear one.\n\n` +
        `- Level ${L - 1}: A = ${num(a0 + g * (L - 2))}, B ≈ ${num(b0 * (1 + p / 100) ** (L - 2))} (B not ahead yet)\n` +
        `- Level ${L}: A = ${num(a0 + g * (L - 1))}, B ≈ ${num(b0 * (1 + p / 100) ** (L - 1))} (B ahead)\n\nSo the answer is level **${L}**.`,
      hints: [
        "Linear growth adds the same amount each level; compound growth multiplies. Compound growth always catches up in the end.",
        `Make a table: for each L work out ${a0} + ${g} × (L − 1) and ${b0} × ${num(1 + p / 100)}^(L − 1) (in the calculator: \`_a0 + _g * (_lvl - 1)\` and \`_b0 * (1 + _pct / 100)^(_lvl - 1)\`). Find where B first passes A.`,
      ],
      given: givenFrom({ a0, g, b0, pct: p }),
      params: { kind: "catchup", a0, g, b0, p },
    };
    return finishNum(base, L, "int", [L - 1, L + 1, L + 2], rng);
  }
  // multi: additive, multiplicative, and the % difference.
  let b, bon, add, mult, rel;
  do {
    b = rng.int(20, 500);
    bon = [rng.int(5, 80), rng.int(5, 80), rng.int(5, 60)];
    add = b * (1 + bon.reduce((s, x) => s + x, 0) / 100);
    mult = bon.reduce((s, x) => s * (1 + x / 100), b);
    rel = (mult / add - 1) * 100;
  } while (!safe2(add) || !safe2(mult) || !safe2(rel));
  const chain = bon.map((x) => num(1 + x / 100)).join(" × ");
  const sum = bon.reduce((s, x) => s + x, 0);
  const parts = [
    numPart("add", "Additive", "Final stat with additive stacking (2 decimal places)", add, "2dp", `Add ${bon.join(" + ")}%, then multiply ${b} by 1 plus that total ÷ 100.`),
    numPart("mult", "Multiplicative", "Final stat with multiplicative stacking (2 decimal places)", mult, "2dp", `Multiply ${b} by ${chain}.`),
    numPart("pct", "Difference", "How many percent higher the multiplicative result is than the additive one (2 decimal places)", rel, "2dp", "Percent higher = (multiplicative ÷ additive − 1) × 100, using the unrounded results."),
  ];
  return {
    prompt:
      `${hero.charAt(0).toUpperCase() + hero.slice(1)} has a base ${stat} of ${b} and three bonuses: ${bon.map((x) => `+${x}%`).join(", ")}. ` +
      `Additive stacking gives base × (1 + sum of bonuses); multiplicative stacking gives base × (1 + b₁) × (1 + b₂) × (1 + b₃), with bonuses as decimals.`,
    answerType: "multi",
    parts,
    explanation:
      `Work out both totals, then compare them.\n\n- Additive: ${b} × ${num(1 + sum / 100)} ${result(add, "2dp")}\n- Multiplicative: ${b} × ${chain} ${result(mult, "2dp")}\n` +
      `- Percent higher: (${num(mult)} ÷ ${num(add)} − 1) × 100 ${result(rel, "2dp")}`,
    hints: ["Additive stacking applies the summed bonus once; multiplicative stacking applies each bonus on top of the others, so it always comes out higher."],
    given: givenFrom({ base: b, ...bonusRows(bon) }),
    params: { kind: "scalemulti", base: b, bon },
  };
}

// ---------------------------------------------------------------------------------------------
// Game economy

const SINKS = ["Repair costs for gear", "A fee for listing items on the auction house", "Fast-travel fees", "Buying potions from an NPC shop", "Paying to reset your skill points", "Crafting fees paid to an NPC", "Weekly house upkeep"];
const FAUCETS = ["Gold rewards for finishing quests", "Gold dropped by defeated monsters", "Selling loot to an NPC merchant", "A daily login gold bonus", "Gold rewards for achievements"];
const ACTIVITIES = ["a dungeon run", "a fishing trip", "a bounty hunt", "a cargo delivery", "a raid", "a mining shift", "an arena match", "a treasure dive"];
const ITEMS = ["a mount", "a legendary sword", "a house", "a ship upgrade", "a pet dragon egg", "a cosmetic skin", "an enchanted bow", "a guild banner"];

function genEconomy(d, rng) {
  checkDifficulty(d);
  const act = rng.pick(ACTIVITIES);
  const item = rng.pick(ITEMS);

  if (d === "easy") {
    if (rng.next() < 0.5) {
      const g = 5 * rng.int(4, 200);
      const m = rng.pick([2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);
      const v = g * (60 / m);
      const base = {
        prompt: `In this game, ${act} takes ${m} minutes and pays ${g} gold. Playing back to back, how much gold does a player earn per hour?`,
        explanation: `Count the runs in an hour, then multiply.\n\n- Runs per hour: 60 ÷ ${m} = ${60 / m}\n- Gold per hour: ${60 / m} × ${g} = **${v}**`,
        hints: ["An hour is 60 minutes. Work out how many runs fit into an hour.", `There are 60 ÷ ${m} runs an hour; multiply by ${g} gold (in the calculator: \`60 / _min * _gold\`).`],
        given: givenFrom({ gold: g, min: m }),
        params: { kind: "gph", g, m },
      };
      return finishNum(base, v, "int", [g * m, g * 60, (g / m) * 100], rng);
    }
    let g, P;
    do {
      g = 5 * rng.int(4, 100);
      P = 50 * rng.int(4, 400);
    } while (P % g === 0 || P / g > 80 || P / g < 2);
    const v = Math.ceil(P / g);
    const base = {
      prompt: `${item.charAt(0).toUpperCase() + item.slice(1)} costs ${P} gold. Each ${act.replace(/^an? /, "")} pays ${g} gold, and the player starts with none. How many runs do they need to afford it?`,
      explanation: `Divide and round up: a part-run doesn't pay.\n\n- ${P} ÷ ${g} ≈ ${num(P / g)}\n- Rounded up: **${v}** runs`,
      hints: ["Divide the price by the gold per run. If it isn't whole, one more run is needed for the rest.", `Work out ${P} ÷ ${g} (in the calculator: \`_price / _gold\`), then round up.`],
      given: givenFrom({ price: P, gold: g }),
      params: { kind: "runs", P, g, start: 0, cost: 0 },
    };
    return finishNum(base, v, "int", [Math.floor(P / g), v + 1, Math.round(P / g) === v ? v - 1 : Math.round(P / g)], rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["netruns", "fee", "classify", "netday"]);
    if (kind === "classify") {
      const wantSink = rng.next() < 0.5;
      const right = rng.pick(wantSink ? SINKS : FAUCETS);
      const pool = (wantSink ? FAUCETS : SINKS).slice();
      const wrong = rng.shuffle(pool).slice(0, 3);
      return {
        prompt:
          `In game economies, a **faucet** creates new gold and adds it to the game, and a **sink** removes gold from the game for good. ` +
          `Which of these is a gold ${wantSink ? "sink" : "faucet"}?`,
        explanation:
          `Ask where the gold goes. Gold paid to the game itself (an NPC or a system fee) disappears, so it's a sink. Gold that the game creates and hands to players is a faucet.\n\n` +
          `**${right}** ${wantSink ? "removes gold from the game, so it's a sink" : "creates new gold, so it's a faucet"}. The others ${wantSink ? "create gold (faucets)" : "remove gold (sinks)"}.`,
        hints: [
          "Follow the gold: does it come from nowhere into a player's purse (faucet), or leave the players and vanish into the game (sink)?",
          `Three of the options ${wantSink ? "give players new gold" : "take gold away from players for good"}; one does the opposite.`,
        ],
        answerType: "choice",
        answer: right,
        choices: rng.shuffle([right, ...wrong]),
        params: { kind: "classify", want: wantSink ? "sink" : "faucet" },
      };
    }
    if (kind === "netday") {
      const N = 100 * rng.int(5, 500);
      const F = rng.int(50, 900);
      let S;
      do S = rng.int(30, 900); while (S === F);
      const v = N * (F - S);
      const base = {
        prompt:
          `A game server has ${N} active players. Each day, faucets (quests and loot) give each player ${F} gold on average, and sinks (repairs, fees and shop items) remove ${S} gold per player. ` +
          `By how much does the total amount of gold in the game change per day? Use a negative number for a fall.`,
        explanation: `Net change per player = faucets − sinks; multiply by the players.\n\n- ${F} − ${S} = ${F - S} per player\n- ${N} × ${F - S} = **${v}**`,
        hints: ["Faucets add gold and sinks remove it, so the change per player is faucets − sinks.", `Work out ${N} × (${F} − ${S}) (in the calculator: \`_players * (_faucet - _sink)\`).`],
        given: givenFrom({ players: N, faucet: F, sink: S }),
        params: { kind: "netday", N, F, S },
      };
      return finishNum(base, v, "int", [N * (F + S), F - S, -v], rng, true);
    }
    if (kind === "fee") {
      let sale, fee, v;
      do {
        sale = 10 * rng.int(5, 2000);
        fee = rng.pick([2, 3, 5, 6, 8, 10, 12, 15]);
        v = sale * (1 - fee / 100);
      } while (!Number.isInteger(Math.round(v * 1e6) / 1e6) || sale === 100);
      v = Math.round(v); // snap away binary error
      const base = {
        prompt: `A player sells ${item} on the auction house for ${sale} gold. The auction house keeps a ${fee}% fee, a gold sink: gold received = price × (1 − ${fee} ÷ 100). How much gold does the seller receive?`,
        explanation: `The fee comes off the sale price.\n\n- Fee: ${sale} × ${num(fee / 100)} = ${num((sale * fee) / 100)}\n- Received: ${sale} − ${num((sale * fee) / 100)} = **${v}**`,
        hints: [`The seller keeps ${100 - fee}% of the price.`, `Work out ${sale} × ${num(1 - fee / 100)} (in the calculator: \`_price * (1 - _fee / 100)\`).`],
        given: givenFrom({ price: sale, fee }),
        params: { kind: "fee", sale, fee },
      };
      return finishNum(base, v, "int", [(sale * fee) / 100, sale * (1 + fee / 100), sale - fee], rng);
    }
    // netruns
    let g, c, start, P, net;
    do {
      g = 5 * rng.int(10, 200);
      c = 5 * rng.int(1, Math.floor(g / 10));
      start = 10 * rng.int(0, 200);
      P = 100 * rng.int(10, 500);
      net = g - c;
    } while (P <= start || (P - start) % net === 0 || (P - start) / net > 80 || (P - start) / net < 3);
    const v = Math.ceil((P - start) / net);
    const base = {
      prompt:
        `${item.charAt(0).toUpperCase() + item.slice(1)} costs ${P} gold and a player already has ${start}. Each ${act.replace(/^an? /, "")} pays ${g} gold but costs ${c} gold in repairs. How many runs do they need to afford it?`,
      explanation:
        `Use the net gold per run and only the gold still missing.\n\n- Net per run: ${g} − ${c} = ${net}\n- Still needed: ${P} − ${start} = ${P - start}\n- ${P - start} ÷ ${net} ≈ ${num((P - start) / net)}, rounded up = **${v}** runs`,
      hints: [`Each run really earns ${g} − ${c} gold, and the player only needs ${P} − ${start} more.`, `Work out (${P} − ${start}) ÷ (${g} − ${c}) (in the calculator: \`(_price - _start) / (_gold - _cost)\`), then round up.`],
      given: givenFrom({ price: P, start, gold: g, cost: c }),
      params: { kind: "runs", P, g, start, cost: c },
    };
    return finishNum(base, v, "int", [Math.ceil(P / net), Math.ceil((P - start) / g), Math.floor((P - start) / net)], rng);
  }

  // Hard
  const kind = rng.pick(["multi", "hours", "inflation"]);
  if (kind === "inflation") {
    let G0, N, F, S, T, days;
    do {
      G0 = 100000 * rng.int(5, 200);
      N = 100 * rng.int(5, 300);
      F = rng.int(100, 900);
      S = rng.int(30, F - 20);
      T = G0 + 100000 * rng.int(5, 400);
      days = Math.ceil((T - G0) / (N * (F - S)));
    } while (((T - G0) % (N * (F - S))) === 0 || days < 3 || days > 400);
    const base = {
      prompt:
        `A game's economy holds ${G0} gold in total. Each day, ${N} players each gain ${F} gold from faucets and lose ${S} to sinks. ` +
        `Designers want to act before the total passes ${T} gold. After how many whole days is the total first above ${T}?`,
      explanation:
        `Find the daily growth, then how many days it takes to cover the gap.\n\n- Per day: ${N} × (${F} − ${S}) = ${N * (F - S)}\n- Gap: ${T} − ${G0} = ${T - G0}\n` +
        `- ${T - G0} ÷ ${N * (F - S)} ≈ ${num((T - G0) / (N * (F - S)))}, so after **${days}** days the total is above ${T}`,
      hints: ["The gold supply grows by players × (faucet − sink) every day.", `Work out (${T} − ${G0}) ÷ (${N} × (${F} − ${S})) (in the calculator: \`(_target - _total) / (_players * (_faucet - _sink))\`), then round up.`],
      given: givenFrom({ total: G0, players: N, faucet: F, sink: S, target: T }),
      params: { kind: "inflation", G0, N, F, S, T },
    };
    return finishNum(base, days, "int", [days - 1, Math.ceil((T - G0) / (N * F)), Math.ceil(T / (N * (F - S)))], rng);
  }
  let g, c, m, P, start, net, runs;
  do {
    g = 5 * rng.int(20, 300);
    c = 5 * rng.int(1, Math.floor(g / 8));
    m = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20]);
    P = 500 * rng.int(4, 200);
    start = 50 * rng.int(0, 40);
    net = g - c;
    runs = Math.ceil((P - start) / net);
  } while (P <= start || (P - start) % net === 0 || runs < 4 || runs > 120 || !safe2((runs * m) / 60) || runs === 60 || (runs * m) / 60 === 60);
  const gph = net * (60 / m);
  const hrs = (runs * m) / 60;
  if (kind === "hours") {
    const base = {
      prompt:
        `${item.charAt(0).toUpperCase() + item.slice(1)} costs ${P} gold; a player has ${start}. Each ${act.replace(/^an? /, "")} takes ${m} minutes, pays ${g} gold and costs ${c} gold in repairs. ` +
        `Only whole runs pay out. How many hours of play does it take to afford it?${DP2}`,
      explanation:
        `Find the whole number of runs first, then turn the time into hours.\n\n- Net per run: ${g} − ${c} = ${net}\n- Runs: (${P} − ${start}) ÷ ${net} ≈ ${num((P - start) / net)}, rounded up = ${runs}\n- Time: ${runs} × ${m} ÷ 60 ${result(hrs, "2dp", "hours")}`,
      hints: [
        "Count whole runs: the gold still needed divided by the net gold per run, rounded up.",
        `Runs = (${P} − ${start}) ÷ (${g} − ${c}), rounded up. Then hours = runs × ${m} ÷ 60.`,
      ],
      given: givenFrom({ price: P, start, gold: g, cost: c, min: m }),
      params: { kind: "hours", P, start, g, c, m },
    };
    return finishNum(base, hrs, "2dp", [(P - start) / gph, (runs * m) / 100, (Math.ceil(P / net) * m) / 60], rng);
  }
  const parts = [
    numPart("gph", "Gold per hour", "Net gold per hour of back-to-back runs (2 decimal places)", gph, "2dp", `Net per run is ${g} − ${c}; there are 60 ÷ ${m} runs an hour.`),
    numPart("runs", "Runs", "Whole runs needed to afford it", runs, "int", `(${P} − ${start}) ÷ net gold per run, rounded up.`),
    numPart("hours", "Hours", "Hours of play for those runs (2 decimal places)", hrs, "2dp", `Multiply the runs by ${m} minutes and divide by 60.`),
  ];
  return {
    prompt:
      `${item.charAt(0).toUpperCase() + item.slice(1)} costs ${P} gold; a player has ${start}. Each ${act.replace(/^an? /, "")} takes ${m} minutes, pays ${g} gold and costs ${c} gold in repairs. Only whole runs pay out.`,
    answerType: "multi",
    parts,
    explanation:
      `Net gold first, then runs, then time.\n\n- Net per run: ${g} − ${c} = ${net}; per hour: ${net} × ${num(60 / m)} ${result(gph, "2dp")}\n` +
      `- Runs: (${P} − ${start}) ÷ ${net} ≈ ${num((P - start) / net)}, rounded up = **${runs}**\n- Hours: ${runs} × ${m} ÷ 60 ${result(hrs, "2dp")}`,
    hints: ["Repairs are a sink: take them off every run's pay before anything else."],
    given: givenFrom({ price: P, start, gold: g, cost: c, min: m }),
    params: { kind: "econmulti", P, start, g, c, m },
  };
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "xp-curves") return genXP(difficulty, rng);
  if (subtopic === "damage") return genDamage(difficulty, rng);
  if (subtopic === "scaling") return genScaling(difficulty, rng);
  if (subtopic === "economy") return genEconomy(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// Independent verification: step-by-step loops and simulations.

const numLike = (x) =>
  (typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)));
const isDp2 = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const near = (v, fmt) => (x) => {
  if (!numLike(x) || !Number.isFinite(v)) return false;
  const n = Number(x);
  if (fmt === "int") return Number.isInteger(n) && Math.abs(n - v) < 1e-6;
  if (fmt === "r0") return Number.isInteger(n) && Math.abs(n - v) < 0.5 - 1e-7;
  return isDp2(n) && Math.abs(n - v) < 0.005 - 1e-7;
};

// Total XP to reach level n by adding each level-up.
function xpTo(n, cost) {
  let t = 0;
  for (let k = 1; k < n; k++) t += cost(k);
  return t;
}
// Level reached with X XP: level up while the next cost fits.
function levelAt(X, cost) {
  let lvl = 1, spent = 0;
  while (spent + cost(lvl) <= X + 1e-9 && lvl < 10000) { spent += cost(lvl); lvl++; }
  return lvl;
}
// Geometric cost by repeated multiplication.
const geoCost = (B, r100) => (k) => { let c = B; for (let i = 1; i < k; i++) c = (c * r100) / 100; return c; };
// Hits to bring HP to 0 or below.
function hitsToKill(H, D) {
  let hp = H, n = 0;
  while (hp > 1e-9 && n < 100000) { hp -= D; n++; }
  return n;
}
// Runs until the purse reaches the price.
function runsTo(P, start, net) {
  let purse = start, n = 0;
  while (purse < P && n < 100000) { purse += net; n++; }
  return n;
}

function checkers(p) {
  switch (p.kind) {
    case "linstep": { let v = p.B; for (let i = 1; i < p.k; i++) v += p.S; return { _: near(v, "int") }; }
    case "lintotal": return { _: near(xpTo(p.n, (k) => p.B + p.S * (k - 1)), "int") };
    case "linreach": return { _: near(levelAt(p.X, (k) => p.B + p.S * (k - 1)), "int") };
    case "geostep": return { _: near(geoCost(p.B, p.r100)(p.k), "r0") };
    case "geototal": return { _: near(xpTo(p.n, geoCost(p.B, p.r100)), "r0") };
    case "georeach": return { _: near(levelAt(p.X, geoCost(p.B, p.r100)), "int") };
    case "quad": return { _: near(xpTo(p.n, (k) => p.A * k * k + p.C), "int") };
    case "xpmulti": {
      const cost = (k) => p.B + p.S * (k - 1);
      return { step: near(cost(p.n), "int"), total: near(xpTo(p.n, cost), "int"), left: near(xpTo(p.n + 1, cost) - p.have, "int") };
    }
    case "flat": // substitute: x + armour gives the attack back, unless the minimum of 1 applies
      return { _: (x) => numLike(x) && Number.isInteger(Number(x)) && (Number(x) === 1 ? p.R + 1 >= p.A : Number(x) > 1 && Number(x) + p.R === p.A) };
    case "pct": return { _: near(p.A - (p.A * p.R) / 100, "int") };
    case "hits": return { _: near(hitsToKill(p.H, p.D), "int") };
    case "armour": return { _: (x) => numLike(x) && isDp2(Number(x)) && Math.abs(Number(x) * (100 + p.R) - p.A * 100) < (0.005 - 1e-7) * (100 + p.R) };
    case "ehp": return { _: (x) => numLike(x) && isDp2(Number(x)) && Math.abs(Number(x) * (100 - p.R) - p.H * 100) < (0.005 - 1e-7) * (100 - p.R) };
    case "ttk": { // simulate: hit at t = 0, then every s
      let hp = p.H, t = 0, first = true;
      while (hp > 0) { if (!first) t += p.s100; first = false; hp -= p.D; }
      return { _: near(t / 100, "2dp") };
    }
    case "order": // cross-multiplied: 100x against (A − F)(100 − R)
      return { _: (x) => numLike(x) && isDp2(Number(x)) && Math.abs(100 * Number(x) - (p.A - p.F) * (100 - p.R)) < 100 * (0.005 - 1e-7) };
    case "pen":
    case "dmgmulti": {
      const eff = p.R - (p.R * p.P) / 100;
      const dmg = p.A / (1 + eff / 100);
      if (p.kind === "pen") return { _: near(dmg, "2dp") };
      const hits = hitsToKill(p.H, dmg);
      let t = 0;
      for (let i = 1; i < hits; i++) t += p.s100;
      return { dmg: near(dmg, "2dp"), hits: near(hits, "int"), ttk: near(t / 100, "2dp") };
    }
    case "linstat": { let v = p.b; for (let l = 2; l <= p.L; l++) v += p.g; return { _: near(v, "int") }; }
    case "addstack": { let pctSum = 0; for (const x of p.bon) pctSum += x; return { _: near(p.base + (p.base * pctSum) / 100, "int") }; }
    case "compound": { let v = p.b; for (let l = 2; l <= p.L; l++) v += (v * p.p) / 100; return { _: near(v, "2dp") }; }
    case "multstack":
    case "gap":
    case "scalemulti": {
      let m = p.base, s = 0;
      for (const x of p.bon) { m += (m * x) / 100; s += x; }
      const a = p.base + (p.base * s) / 100;
      if (p.kind === "multstack") return { _: near(m, "2dp") };
      if (p.kind === "gap") return { _: near(m - a, "2dp") };
      return { add: near(a, "2dp"), mult: near(m, "2dp"), pct: near(((m - a) / a) * 100, "2dp") };
    }
    case "firstlevel": {
      let v = p.b, L = 1;
      while (v <= p.T && L < 1000) { v += (v * p.p) / 100; L++; }
      return { _: near(L, "int") };
    }
    case "catchup": {
      let A = p.a0, B = p.b0, L = 1;
      while (B <= A && L < 1000) { A += p.g; B += (B * p.p) / 100; L++; }
      return { _: near(L, "int") };
    }
    case "gph": { let gold = 0; for (let t = 0; t + p.m <= 60; t += p.m) gold += p.g; return { _: near(gold, "int") }; } // 60/m is whole here
    case "runs": return { _: near(runsTo(p.P, p.start, p.g - p.cost), "int") };
    case "classify": {
      const list = p.want === "sink" ? SINKS : FAUCETS;
      return { _: (x) => list.includes(x) };
    }
    case "netday": { let total = 0; for (let i = 0; i < p.N; i++) total += p.F - p.S; return { _: near(total, "int") }; }
    case "fee": return { _: near(p.sale - (p.sale * p.fee) / 100, "int") };
    case "inflation": {
      let g = p.G0, days = 0;
      while (g <= p.T && days < 100000) { g += p.N * p.F - p.N * p.S; days++; }
      return { _: near(days, "int") };
    }
    case "hours":
    case "econmulti": {
      const runs = runsTo(p.P, p.start, p.g - p.c);
      let mins = 0;
      for (let i = 0; i < runs; i++) mins += p.m;
      if (p.kind === "hours") return { _: near(mins / 60, "2dp") };
      return { gph: near(((p.g - p.c) / p.m) * 60, "2dp"), runs: near(runs, "int"), hours: near(mins / 60, "2dp") };
    }
    default: return null;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  const chk = checkers(p);
  if (!chk) return false;
  if (question.answerType === "multi") {
    const parts = question.parts;
    if (!Array.isArray(parts) || !answer || typeof answer !== "object") return false;
    if (parts.length !== Object.keys(chk).length) return false;
    return parts.every((pt) => {
      const f = chk[pt.id];
      if (!f) return false;
      if (pt.answerType === "choice" && (!Array.isArray(pt.choices) || pt.choices.filter(f).length !== 1)) return false;
      return f(answer[pt.id]);
    });
  }
  const f = chk._;
  if (!f) return false;
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (ch.filter((c) => f(c)).length !== 1) return false;
    return ch.includes(String(answer)) && f(String(answer));
  }
  return f(answer);
}
