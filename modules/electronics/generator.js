// Electronics generator: resistor colour codes, voltage dividers, LED resistors, RC timing.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Every rounded answer states its rounding; draws that land on a
// rounding half-step, or whose parts would change when worked from a rounded earlier part, are
// redrawn inside generate(). Conventions are stated in each prompt: which resistor is R1/R2, the
// E12 rule ("next value at or above" or "closest"), 5τ for a full charge, power-rating rules.
// verify() re-derives each answer by a different route from the numbers kept in `params`:
// colour bands are decoded (generation encodes), dividers are checked by current or nodal
// analysis, and rounded answers are bracketed by substituting them back into the formula.

import { fmtNum, roundTo, isHalfStep } from "../../js/lib/mathutil.js";

const num = (n) => fmtNum(n, 4);
const rk = (x, k) => roundTo(x, k);
const isTie = (x, k) => isHalfStep(x, k, 1e-4);
const EXACT = { fuzzyNumber: 0 };

// Redraw until `fn` returns a truthy draw.
function redraw(fn) {
  for (let i = 0; i < 5000; i++) {
    const r = fn();
    if (r) return r;
  }
  throw new Error("electronics: no valid draw");
}

// ---- generate-side tables and helpers ------------------------------------------------------
const COLOURS = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"];
const multName = (e) => (e === -1 ? "gold" : e === -2 ? "silver" : COLOURS[e]);
const TOL_COLOUR = new Map([[1, "brown"], [2, "red"], [5, "gold"], [10, "silver"], [0.5, "green"], [0.25, "blue"]]);
const E12N = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
const E96N = [100, 110, 120, 133, 150, 162, 180, 200, 221, 240, 270, 301, 330, 365, 390, 402, 470, 499, 560, 604, 680, 750, 820, 909];
// Every E12 value from 1 Ω to 8.2 MΩ, in ohms.
const E12ALL = [];
for (let d = 0; d <= 6; d++) for (const n of E12N) E12ALL.push(rk((n * 10 ** d) / 10, 6));
const nextUpIdx = (ohm) => E12ALL.findIndex((v) => v >= ohm - 1e-9);
const onE12 = (ohm) => E12ALL.some((v) => Math.abs(v - ohm) <= 1e-6 * Math.max(1, ohm));
function nearestIdx(ohm) {
  const i = nextUpIdx(ohm);
  return ohm - E12ALL[i - 1] < E12ALL[i] - ohm ? i - 1 : i;
}

const valueOf = (digits, exp) => rk(exp >= 0 ? digits * 10 ** exp : digits / 10 ** -exp, 6);
const bandsOf = (digits, exp, tol) => [...String(digits)].map((c) => COLOURS[Number(c)]).concat([multName(exp), TOL_COLOUR.get(tol)]);
const bandText = (b) => b.join(", ");
const multText = (exp) => `× ${num(10 ** exp)}`;
function ohms(v) {
  if (v >= 1e6) return `${num(v / 1e6)} MΩ`;
  if (v >= 1e3) return `${num(v / 1e3)} kΩ`;
  return `${num(v)} Ω`;
}
const kohm = (v) => `${num(v)} kΩ`;
// An E12 value in kΩ: decades 0 (1.0 to 8.2 kΩ) to 2 (100 to 820 kΩ).
const e12k = (rng, lo, hi) => rk((rng.pick(E12N) * 10 ** rng.int(lo, hi)) / 10, 4);
const roundSig = (x, s) => rk(x, Math.max(0, s - 1 - Math.floor(Math.log10(Math.abs(x)))));
// How the digit bands read, for explanations.
const digitsRead = (b, nd) => b.slice(0, nd).map((c) => `${c} = ${COLOURS.indexOf(c)}`).join(", ");

const partNum = (id, label, ask, answer, tol, hint, extra = {}) => ({ id, label, ask, answerType: "number", answer, tolerance: tol, hint, ...extra });
const partChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
const BAND_ORDER = "read from the end away from the tolerance band";

// =====================================================================
// Resistor colour codes
// =====================================================================
function genCodes(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["read4", "read4", "digit", "tol"]);
    if (kind === "read4") {
      const n = rng.pick(E12N), exp = rng.int(0, 3), tol = rng.pick([5, 5, 10, 1, 2]);
      const v = valueOf(n, exp), b = bandsOf(n, exp, tol);
      return {
        prompt: `A 4-band resistor has the colour bands **${bandText(b)}**, ${BAND_ORDER}. What is its resistance, in Ω? Give the full number of ohms, without a k or M prefix.`,
        answerType: "number", answer: v, tolerance: 0, ...EXACT,
        explanation: `Digits: ${digitsRead(b, 2)}, so ${n}. Multiplier: ${b[2]} = ${multText(exp)}. Value = ${n} ${multText(exp)} = **${v} Ω** (${ohms(v)}). The ${b[3]} band is the tolerance, ±${tol}%; it does not change the value.`,
        hints: ["The first two bands are digits. The third band is the multiplier: its digit is the number of zeros to add.", "The last band is the tolerance; it does not change the value."],
        params: { kind, bands: b },
      };
    }
    if (kind === "digit") {
      const d = rng.int(0, 9);
      const others = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== d)).slice(0, 3);
      const choices = rng.shuffle([d, ...others].map((x) => COLOURS[x]));
      const hint = d <= 1 ? "The two darkest colours come first, for 0 and 1." : d <= 7 ? "From 2 to 7 the colours run in rainbow order, starting at 2." : "After the rainbow colours (2 to 7) come the two pale colours, for 8 and 9.";
      return {
        prompt: `In the resistor colour code, which colour stands for the digit **${d}**?`,
        answerType: "choice", answer: COLOURS[d], choices,
        explanation: `The code is ${COLOURS.map((c, i) => `${i} ${c}`).join(", ")}. So ${d} is **${COLOURS[d]}**.`,
        hints: [hint],
        params: { kind, d },
      };
    }
    const t = rng.pick([1, 2, 5, 10]);
    const colour = TOL_COLOUR.get(t);
    return {
      prompt: `The last (tolerance) band of a 4-band resistor is **${colour}**. What tolerance does it mark?`,
      answerType: "choice", answer: `±${t}%`, choices: rng.shuffle(["±1%", "±2%", "±5%", "±10%"]),
      explanation: `On 4-band resistors: brown ±1%, red ±2%, gold ±5%, silver ±10%. So ${colour} is **±${t}%**.`,
      hints: ["The two metallic colours mark the looser tolerances; brown and red mark tighter ones.", "A coloured tolerance band means the same percentage as that colour's digit. Of the metals, gold is the tighter."],
      params: { kind, colour },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["read4k", "lowmult", "read5", "bands"]);
    if (kind === "read4k") {
      const n = rng.pick(E12N), exp = rng.int(2, 5), tol = rng.pick([5, 10, 1, 2]);
      const v = valueOf(n, exp), b = bandsOf(n, exp, tol);
      return {
        prompt: `A 4-band resistor has the colour bands **${bandText(b)}**, ${BAND_ORDER}. What is its resistance? Give the answer in kΩ (1 kΩ = 1000 Ω).`,
        answerType: "number", answer: rk(v / 1000, 6), tolerance: 0, ...EXACT,
        explanation: `Digits: ${digitsRead(b, 2)}, so ${n}. Multiplier: ${b[2]} = ${multText(exp)}. Value = ${n} ${multText(exp)} = ${v} Ω = **${kohm(v / 1000)}**.`,
        hints: ["Read the value in ohms first: two digits, then the multiplier band's digit as a number of zeros.", "Divide the ohms by a thousand to get kΩ."],
        params: { kind, bands: b },
      };
    }
    if (kind === "lowmult") {
      const n = rng.pick(E12N), exp = rng.pick([-1, -1, -2]), tol = rng.pick([5, 10]);
      const v = valueOf(n, exp), b = bandsOf(n, exp, tol);
      return {
        prompt: `A small 4-band resistor has the colour bands **${bandText(b)}**, ${BAND_ORDER}. What is its resistance, in Ω? Give the exact value.`,
        answerType: "number", answer: v, tolerance: 0, ...EXACT,
        explanation: `Digits: ${digitsRead(b, 2)}, so ${n}. Multiplier: ${b[2]} = ${multText(exp)}. Value = ${n} ${multText(exp)} = **${num(v)} Ω**.`,
        hints: ["The first two bands are digits.", "In the multiplier position, gold divides by 10 and silver divides by 100."],
        params: { kind, bands: b },
      };
    }
    if (kind === "read5") {
      const n = rng.pick(E96N), exp = rng.int(0, 3), tol = rng.pick([1, 2, 0.5, 0.25]);
      const v = valueOf(n, exp), b = bandsOf(n, exp, tol);
      return {
        prompt: `A 5-band precision resistor has the colour bands **${bandText(b)}**, ${BAND_ORDER}. What is its resistance? Give the answer in kΩ (1 kΩ = 1000 Ω).`,
        answerType: "number", answer: rk(v / 1000, 6), tolerance: 0, ...EXACT,
        explanation: `Digits: ${digitsRead(b, 3)}, so ${n}. Multiplier: ${b[3]} = ${multText(exp)}. Value = ${n} ${multText(exp)} = ${v} Ω = **${kohm(v / 1000)}**. The ${b[4]} band is the tolerance, ±${tol}%.`,
        hints: ["On a 5-band resistor the first three bands are digits and the fourth is the multiplier.", "Work out the ohms, then divide by 1000 for kΩ."],
        params: { kind, bands: b },
      };
    }
    // bands: choose the colours for a value
    const i = rng.int(0, E12N.length - 1), exp = rng.int(0, 4), tol = rng.pick([5, 5, 10, 1]);
    const n = E12N[i], v = valueOf(n, exp);
    const d1 = Math.floor(n / 10), d2 = n % 10;
    const pool = [[n, exp + 1], [n, exp - 1], [10 * d2 + d1, exp], [10 * d1 + ((d2 + 1) % 10), exp], [10 * ((d1 % 9) + 1) + d2, exp]];
    const seen = new Set([v]);
    const wrong = [];
    for (const [m, e] of rng.shuffle(pool)) {
      if (m < 10 || m > 99 || e < -2 || e > 9) continue;
      const w = valueOf(m, e);
      if (seen.has(w)) continue;
      seen.add(w);
      wrong.push(bandText(bandsOf(m, e, tol)));
    }
    const right = bandText(bandsOf(n, exp, tol));
    const choices = rng.shuffle([right, ...wrong.slice(0, 3)]);
    return {
      prompt: `Which colour bands mark a **${ohms(v)} ±${tol}%** resistor on the 4-band code? The bands are listed from the end away from the tolerance band.`,
      answerType: "choice", answer: right, choices,
      explanation: `${v >= 1000 ? `${ohms(v)} = ${v} Ω` : `${v} Ω`} = ${n} ${multText(exp)}. Digits ${d1} and ${d2}, multiplier ${multText(exp)} (${multName(exp)}), tolerance ±${tol}% (${TOL_COLOUR.get(tol)}): **${right}**.`,
      hints: ["Write the value in ohms, then split it into two digits followed by some zeros.", "The multiplier band's digit is the number of zeros after the two digits."],
      params: { kind, v, tol },
    };
  }

  if (difficulty === "hard") {
    const five = rng.next() < 0.5;
    const d = redraw(() => {
      const n = five ? rng.pick(E96N) : rng.pick(E12N);
      const exp = five ? rng.int(0, 2) : rng.int(0, 3);
      const tol = five ? rng.pick([0.5, 1, 2, 0.25]) : rng.pick([1, 2, 5, 10]);
      const j = rng.pick([-7, -6, -5, -3, -2, -1, 0, 1, 2, 3, 5, 6, 7]);
      const v = valueOf(n, exp);
      const lo = v * (1 - tol / 100), hi = v * (1 + tol / 100);
      if (isTie(lo, 2) || isTie(hi, 2)) return null;
      const reading = rk(v * (1 + (j * tol) / 400), 2);
      return { n, exp, tol, v, lo: rk(lo, 2), hi: rk(hi, 2), reading, inside: Math.abs(j) < 4 };
    });
    const { n, exp, tol, v, lo, hi, reading, inside } = d;
    const b = bandsOf(n, exp, tol);
    const nd = five ? 3 : 2;
    return {
      prompt: `A ${five ? 5 : 4}-band resistor has the colour bands **${bandText(b)}**, ${BAND_ORDER}. A meter reads **${num(reading)} Ω** across it.`,
      answerType: "multi",
      parts: [
        partNum("lo", "Lowest", "Lowest value its tolerance allows, in Ω (round to 2 decimal places if needed)", lo, 0.005, "Decode the nominal value first. Lowest = nominal × (1 − tolerance ÷ 100)."),
        partNum("hi", "Highest", "Highest value its tolerance allows, in Ω (round to 2 decimal places if needed)", hi, 0.005, "Highest = nominal × (1 + tolerance ÷ 100)."),
        partChoice("ok", "Check", "Is the meter reading within the tolerance?", inside ? "Yes" : "No", rng.shuffle(["Yes", "No"]), "Compare the reading with your two limits."),
      ],
      explanation: `Digits: ${digitsRead(b, nd)}, so ${n}; multiplier ${b[nd]} = ${multText(exp)}. Nominal = **${v} Ω**, tolerance ${b[nd + 1]} = ±${tol}%.\n\nLowest = ${v} × (1 − ${tol / 100}) = **${num(lo)} Ω**. Highest = ${v} × (1 + ${tol / 100}) = **${num(hi)} Ω**.\n\n${num(reading)} Ω is ${inside ? "inside" : "outside"} that range: **${inside ? "Yes" : "No"}**.`,
      params: { kind: "range", bands: b, reading },
    };
  }

  // expert: pick the resistor that fits a window, or work out a worn multiplier band
  const kind = rng.pick(["fit", "worn"]);
  if (kind === "fit") {
    const d = redraw(() => {
      const i = rng.int(1, E12N.length - 2), exp = rng.int(1, 3), t = rng.pick([1, 2, 5]);
      const a = rng.int(t + 1, t + 4), bb = rng.int(t + 1, t + 4);
      const v0 = valueOf(E12N[i], exp);
      const lo = rk(v0 * (1 - a / 100), 2), hi = rk(v0 * (1 + bb / 100), 2);
      const cands = [
        { n: E12N[i], exp, t, five: t <= 2 && rng.next() < 0.5 },
        { n: E12N[i], exp, t: 10, five: false },
        { n: E12N[i + 1], exp, t, five: false },
        { n: E12N[i - 1], exp, t: rng.pick([1, 2, 5]), five: false },
      ];
      const fits = (c) => {
        const val = valueOf(c.n, c.exp);
        return val * (1 - c.t / 100) > lo + 1e-9 && val * (1 + c.t / 100) < hi - 1e-9;
      };
      if (!fits(cands[0]) || cands.slice(1).some(fits)) return null;
      return { v0, t, lo, hi, cands };
    });
    const { v0, t, lo, hi, cands } = d;
    const text = (c) => bandText(c.five ? bandsOf(c.n * 10, c.exp - 1, c.t) : bandsOf(c.n, c.exp, c.t));
    const right = text(cands[0]);
    const max = rk(v0 * (1 + t / 100), 2);
    return {
      prompt: `A sensor circuit needs a resistor whose value is certain to lie between **${num(lo)} Ω** and **${num(hi)} Ω**, whatever its tolerance. The drawer holds four resistors, with bands listed from the end away from the tolerance band (a 5-band resistor has three digit bands).`,
      answerType: "multi",
      parts: [
        partChoice("res", "Resistor", "Which resistor's whole tolerance range fits inside the window?", right, rng.shuffle(cands.map(text)), "For each resistor, decode its nominal value and tolerance, then work out its lowest and highest possible values."),
        partNum("max", "Highest", "Highest value that resistor can have, in Ω (round to 2 decimal places if needed)", max, 0.005, "Highest = nominal × (1 + tolerance ÷ 100), for the resistor you chose."),
      ],
      explanation: `Each resistor's range is nominal × (1 ± tolerance):\n\n${cands.map((c) => { const val = valueOf(c.n, c.exp); return `- ${text(c)}: ${val} Ω ±${c.t}% → ${num(val * (1 - c.t / 100))} to ${num(val * (1 + c.t / 100))} Ω`; }).join("\n")}\n\nOnly **${right}** stays inside ${num(lo)} to ${num(hi)} Ω. Its highest value is ${v0} × ${1 + t / 100} = **${num(max)} Ω**.`,
      params: { kind, lo, hi },
    };
  }
  const d = redraw(() => {
    const n = rng.pick(E12N), exp = rng.int(0, 4), t = rng.pick([5, 10]), j = rng.pick([-3, -2, -1, 1, 2, 3]);
    const v = valueOf(n, exp);
    const reading = roundSig(v * (1 + (j * t) / 400), 3);
    return Math.abs(reading - v) < 0.9 * v * (t / 100) ? { n, exp, t, v, reading } : null;
  });
  const { n, exp, t, v, reading } = d;
  const b = bandsOf(n, exp, t);
  const shown = `${b[0]}, ${b[1]}, (worn), ${b[3]}`;
  const choices = rng.shuffle([exp - 1, exp, exp + 1, exp + 2].map(multName));
  return {
    prompt: `The multiplier band of a 4-band resistor has worn off. The bands read **${shown}**, ${BAND_ORDER}. A meter reads **${ohms(reading)}** across it, and the resistor is within its ±${t}% tolerance.`,
    answerType: "multi",
    parts: [
      partNum("nom", "Nominal", "Nominal value, in Ω (the full number of ohms)", v, 0, `The digit bands give a two-digit number. Try it × 1, × 10, × 100, …: only one lands within ±${t}% of the reading.`, EXACT),
      partChoice("mult", "Multiplier", "Which colour was the worn multiplier band?", multName(exp), choices, "Nominal ÷ the two-digit number is a power of 10; the colour's digit is that number of zeros (gold is × 0.1)."),
    ],
    explanation: `The digit bands are ${digitsRead(b, 2)}, so the value is ${n} × a power of 10. The reading ${ohms(reading)} is within ±${t}% of only one of these: **${v} Ω**. That is ${n} ${multText(exp)}, so the multiplier band was **${multName(exp)}**.`,
    params: { kind, n, t, reading },
  };
}

// =====================================================================
// Voltage dividers
// =====================================================================
const SETUP = "R1 is the top resistor (from the supply to the output) and R2 the bottom one (from the output to 0 V)";

function genDividers(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["vout", "vout", "vr1"]);
    const { vin, r1, r2, vx } = redraw(() => {
      const vin = rng.pick([3.3, 5, 6, 9, 12, 15, 24]), r1 = e12k(rng, 0, 2), r2 = e12k(rng, 0, 2);
      const vo = (vin * r2) / (r1 + r2);
      const vx = kind === "vout" ? vo : vin - vo;
      return r1 !== r2 && vo / vin > 0.08 && vo / vin < 0.92 && !isTie(vx, 2) ? { vin, r1, r2, vx: rk(vx, 2) } : null;
    });
    const given = [{ label: "_vin", value: vin }, { label: "_r1", value: r1 }, { label: "_r2", value: r2 }];
    const base = `A voltage divider runs from a **${num(vin)} V** supply. ${SETUP}: R1 = **${kohm(r1)}**, R2 = **${kohm(r2)}**.`;
    if (kind === "vout") {
      return {
        prompt: `${base} What is the output voltage Vout (across R2), in V? Round to 2 decimal places.`,
        answerType: "number", answer: vx, tolerance: 0.005, given,
        explanation: `Vout = Vin × R2 ÷ (R1 + R2) = \`_vin * _r2 / (_r1 + _r2)\` = ${num(vin)} × ${num(r2)} ÷ ${num(r1 + r2)} ≈ **${num(vx)} V**.`,
        hints: ["Vout = Vin × R2 ÷ (R1 + R2), with R2 the bottom resistor.", "Both resistors are in kΩ, so the units cancel."],
        params: { kind, vin, r1, r2 },
      };
    }
    return {
      prompt: `${base} What is the voltage across R1, in V? Round to 2 decimal places.`,
      answerType: "number", answer: vx, tolerance: 0.005, given,
      explanation: `The supply voltage splits in proportion to the resistances. Across R1: \`_vin * _r1 / (_r1 + _r2)\` = ${num(vin)} × ${num(r1)} ÷ ${num(r1 + r2)} ≈ **${num(vx)} V** (the same as Vin − Vout).`,
      hints: ["The voltage splits in proportion: R1's share is R1 ÷ (R1 + R2) of the supply.", "Check: the voltages across R1 and R2 add up to the supply."],
      params: { kind, vin, r1, r2 },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["find-r2", "find-r1", "mixed"]);
    if (kind === "mixed") {
      const { vin, r1, r2, vo } = redraw(() => {
        const vin = rng.pick([5, 9, 12, 15]), r1 = rng.pick(E12ALL.filter((x) => x >= 100 && x <= 8200)), r2 = e12k(rng, 0, 1);
        const vo = (vin * r2 * 1000) / (r1 + r2 * 1000);
        return vo / vin > 0.08 && vo / vin < 0.92 && !isTie(vo, 2) ? { vin, r1, r2, vo: rk(vo, 2) } : null;
      });
      return {
        prompt: `A voltage divider runs from a **${vin} V** supply. ${SETUP}: R1 = **${num(r1)} Ω**, R2 = **${kohm(r2)}**. What is the output voltage Vout (across R2), in V? Round to 2 decimal places.`,
        answerType: "number", answer: vo, tolerance: 0.005,
        given: [{ label: "_vin", value: vin }, { label: "_r1_ohm", value: r1 }, { label: "_r2_kohm", value: r2 }],
        explanation: `Put both in ohms: R2 = ${num(r2)} × 1000 = ${num(r2 * 1000)} Ω. Vout = \`_vin * _r2_kohm * 1000 / (_r1_ohm + _r2_kohm * 1000)\` = ${vin} × ${num(r2 * 1000)} ÷ ${num(r1 + r2 * 1000)} ≈ **${num(vo)} V**.`,
        hints: ["The two resistors are in different units: convert kΩ to Ω (× 1000) first.", "Then Vout = Vin × R2 ÷ (R1 + R2)."],
        params: { kind, vin, r1, r2 },
      };
    }
    const d = redraw(() => {
      const vin = rng.pick([5, 9, 12, 15, 24]), vout = rng.pick([1.2, 1.8, 2.5, 3.3, 5, 6]);
      if (!(vout > 0.1 * vin && vout < 0.9 * vin)) return null;
      const known = e12k(rng, 0, 2);
      const x = kind === "find-r2" ? (known * vout) / (vin - vout) : (known * (vin - vout)) / vout;
      return x >= 0.1 && x <= 2000 && !isTie(x, 2) ? { vin, vout, known, x: rk(x, 2) } : null;
    });
    const { vin, vout, known, x } = d;
    if (kind === "find-r2") {
      return {
        prompt: `A voltage divider on a **${vin} V** supply must give **${num(vout)} V** at its output. ${SETUP}. R1 is **${kohm(known)}**. What value of R2 is needed, in kΩ? Round to 2 decimal places.`,
        answerType: "number", answer: x, tolerance: 0.005,
        given: [{ label: "_vin", value: vin }, { label: "_vout", value: vout }, { label: "_r1", value: known }],
        explanation: `The resistances split in the same ratio as the voltages: R2 ÷ R1 = Vout ÷ (Vin − Vout). So R2 = \`_r1 * _vout / (_vin - _vout)\` = ${num(known)} × ${num(vout)} ÷ ${num(vin - vout)} ≈ **${kohm(x)}**.`,
        hints: ["R1 takes Vin − Vout and R2 takes Vout.", "The voltages are in the same ratio as the resistances: R2 ÷ R1 = Vout ÷ (Vin − Vout)."],
        params: { kind, vin, vout, known },
      };
    }
    return {
      prompt: `A voltage divider on a **${vin} V** supply must give **${num(vout)} V** at its output. ${SETUP}. R2 is **${kohm(known)}**. What value of R1 is needed, in kΩ? Round to 2 decimal places.`,
      answerType: "number", answer: x, tolerance: 0.005,
      given: [{ label: "_vin", value: vin }, { label: "_vout", value: vout }, { label: "_r2", value: known }],
      explanation: `R1 takes Vin − Vout = ${num(vin - vout)} V and R2 takes ${num(vout)} V, and the resistances are in the same ratio. So R1 = \`_r2 * (_vin - _vout) / _vout\` = ${num(known)} × ${num(vin - vout)} ÷ ${num(vout)} ≈ **${kohm(x)}**.`,
      hints: ["R1 takes Vin − Vout and R2 takes Vout.", "R1 ÷ R2 = (Vin − Vout) ÷ Vout."],
      params: { kind, vin, vout, known },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["e12", "sensor"]);
    if (kind === "e12") {
      const d = redraw(() => {
        const vin = rng.pick([5, 9, 12]), target = rng.pick([1.5, 2, 2.5, 3, 3.3, 4]);
        if (!(target > 0.15 * vin && target < 0.85 * vin)) return null;
        const r1 = e12k(rng, 0, 1);
        const r2 = (r1 * target) / (vin - target);
        const ohm = r2 * 1000;
        if (ohm < 1000 || ohm > 820000 || onE12(ohm) || isTie(r2, 2)) return null;
        const i = nextUpIdx(ohm);
        const lo = E12ALL[i - 1], hi = E12ALL[i];
        const out = (r) => (vin * r) / (r1 * 1000 + r);
        const elo = Math.abs(out(lo) - target), ehi = Math.abs(out(hi) - target);
        if (Math.abs(elo - ehi) < 0.02) return null;
        const pick = elo < ehi ? lo : hi;
        const act = out(pick);
        if (isTie(act, 2)) return null;
        return { vin, target, r1, r2: rk(r2, 2), pick, act: rk(act, 2), opts: [E12ALL[i - 2], lo, hi, E12ALL[i + 1]] };
      });
      const { vin, target, r1, r2, pick, act, opts } = d;
      return {
        prompt: `A voltage divider on a **${vin} V** supply should give **${num(target)} V**. ${SETUP}. R1 is **${kohm(r1)}**. R2 must come from the E12 series.`,
        answerType: "multi",
        given: [{ label: "_vin", value: vin }, { label: "_target", value: target }, { label: "_r1", value: r1 }],
        parts: [
          partNum("exact", "R2", "Exact R2 for the target, in kΩ (2 decimal places)", r2, 0.005, "R2 ÷ R1 = Vout ÷ (Vin − Vout)."),
          partChoice("e12", "E12", "E12 value of R2 that gives the output closest to the target", ohms(pick), rng.shuffle(opts.map(ohms)), "Work out Vout with the E12 values just below and just above your exact R2, and keep the closer one."),
          partNum("vout", "Actual", "Actual output with that E12 resistor, in V (2 decimal places)", act, 0.005, "Vout = Vin × R2 ÷ (R1 + R2), using the E12 value for R2."),
        ],
        explanation: `Exact: R2 = \`_r1 * _target / (_vin - _target)\` = ${num(r1)} × ${num(target)} ÷ ${num(vin - target)} ≈ **${kohm(r2)}**.\n\nThe E12 values either side give outputs of ${opts.slice(1, 3).map((r) => `${ohms(r)} → ${num(rk((vin * r) / (r1 * 1000 + r), 3))} V`).join(" and ")}, so the closer one is **${ohms(pick)}**.\n\nActual Vout = ${vin} × ${num(pick / 1000)} ÷ (${num(r1)} + ${num(pick / 1000)}) ≈ **${num(act)} V**.`,
        params: { kind, vin, target, r1 },
      };
    }
    // sensor: an LDR or thermistor in a divider, two conditions
    const SENSORS = [
      { name: "light-dependent resistor (LDR)", a: "in bright light", b: "in the dark", la: "Light", lb: "Dark", change: "As bright light fades to darkness", ra: [1, 2, 3, 4, 5], rb: [50, 100, 150, 200] },
      { name: "thermistor (NTC: its resistance falls as it warms up)", a: "cold", b: "warm", la: "Cold", lb: "Warm", change: "As the sensor warms up", ra: [20, 25, 30, 40], rb: [2, 3, 4, 5] },
    ];
    const s = rng.pick(SENSORS);
    const d = redraw(() => {
      const vin = rng.pick([5, 9, 12]), fixed = e12k(rng, 0, 1), ra = rng.pick(s.ra), rb = rng.pick(s.rb), pos = rng.pick(["top", "bottom"]);
      if (fixed < 2 || fixed > 56) return null;
      const out = (r) => (pos === "bottom" ? (vin * r) / (fixed + r) : (vin * fixed) / (r + fixed));
      const va = out(ra), vb = out(rb);
      return !isTie(va, 2) && !isTie(vb, 2) && Math.abs(va - vb) > 0.2 ? { vin, fixed, ra, rb, pos, va: rk(va, 2), vb: rk(vb, 2) } : null;
    });
    const { vin, fixed, ra, rb, pos, va, vb } = d;
    const dir = vb > va ? "Rises" : "Falls";
    const where = pos === "bottom" ? "the bottom resistor (across the output)" : "the top resistor (from the supply to the output)";
    return {
      prompt: `A ${s.name} is ${where} of a voltage divider on a **${vin} V** supply. The other resistor is a fixed **${kohm(fixed)}**. The sensor measures **${ra} kΩ** when ${s.a} and **${rb} kΩ** when ${s.b}. Vout is taken across the bottom resistor.`,
      answerType: "multi",
      given: [{ label: "_vin", value: vin }, { label: "_fixed", value: fixed }, { label: "_ra", value: ra }, { label: "_rb", value: rb }],
      parts: [
        partNum("a", s.la, `Vout when ${s.a}, in V (2 decimal places)`, va, 0.005, `Vout = Vin × bottom ÷ (top + bottom). The sensor is the ${pos} resistor.`),
        partNum("b", s.lb, `Vout when ${s.b}, in V (2 decimal places)`, vb, 0.005, "Same formula, with the sensor's other resistance."),
        partChoice("dir", "Change", `${s.change}, does Vout rise or fall?`, dir, ["Rises", "Falls"], "Compare your two output voltages."),
      ],
      explanation: pos === "bottom"
        ? `The sensor is R2. ${s.la}: \`_vin * _ra / (_fixed + _ra)\` = ${vin} × ${ra} ÷ ${num(fixed + ra)} ≈ **${num(va)} V**. ${s.lb}: \`_vin * _rb / (_fixed + _rb)\` = ${vin} × ${rb} ÷ ${num(fixed + rb)} ≈ **${num(vb)} V**. So Vout **${dir.toLowerCase()}**.`
        : `The sensor is R1, so the fixed resistor is R2. ${s.la}: \`_vin * _fixed / (_ra + _fixed)\` = ${vin} × ${num(fixed)} ÷ ${num(fixed + ra)} ≈ **${num(va)} V**. ${s.lb}: \`_vin * _fixed / (_rb + _fixed)\` = ${vin} × ${num(fixed)} ÷ ${num(fixed + rb)} ≈ **${num(vb)} V**. So Vout **${dir.toLowerCase()}**.`,
      params: { kind, vin, fixed, ra, rb, pos },
    };
  }

  // expert: a load across the output, or design R1 for a loaded output
  const kind = rng.pick(["load", "design"]);
  if (kind === "load") {
    const d = redraw(() => {
      const vin = rng.pick([5, 9, 12, 15]), r1 = e12k(rng, 0, 1), r2 = e12k(rng, 0, 1), rl = e12k(rng, 0, 2);
      const unl = (vin * r2) / (r1 + r2);
      const rp = (r2 * rl) / (r2 + rl);
      const lod = (vin * rp) / (r1 + rp);
      const drop = (unl - lod) / unl;
      if (unl / vin < 0.15 || unl / vin > 0.85 || drop < 0.01 || drop > 0.6 || Math.abs(drop - 0.1) < 0.015) return null;
      if (isTie(unl, 2) || isTie(lod, 2) || isTie(rp, 2)) return null;
      return { vin, r1, r2, rl, unl: rk(unl, 2), lod: rk(lod, 2), rp, drop };
    });
    const { vin, r1, r2, rl, unl, lod, rp, drop } = d;
    const ok = drop <= 0.1;
    return {
      prompt: `A voltage divider on a **${vin} V** supply has R1 = **${kohm(r1)}** and R2 = **${kohm(r2)}**; ${SETUP}. A load of **${kohm(rl)}** is then connected across the output (in parallel with R2).`,
      answerType: "multi",
      given: [{ label: "_vin", value: vin }, { label: "_r1", value: r1 }, { label: "_r2", value: r2 }, { label: "_rl", value: rl }],
      parts: [
        partNum("unloaded", "No load", "Vout before the load is connected, in V (2 decimal places)", unl, 0.005, "Ignore the load: Vout = Vin × R2 ÷ (R1 + R2)."),
        partNum("loaded", "Loaded", "Vout with the load connected, in V (2 decimal places)", lod, 0.005, "Combine R2 and the load in parallel (product ÷ sum), then use that in place of R2."),
        partChoice("ok", "Within 10%", "Is the loaded output within 10% of the unloaded output?", ok ? "Yes" : "No", rng.shuffle(["Yes", "No"]), "Drop as a percentage = (unloaded − loaded) ÷ unloaded × 100."),
      ],
      explanation: `No load: \`_vin * _r2 / (_r1 + _r2)\` = ${vin} × ${num(r2)} ÷ ${num(r1 + r2)} ≈ **${num(unl)} V**.\n\nR2 ∥ load = \`_r2 * _rl / (_r2 + _rl)\` ≈ ${num(rk(rp, 3))} kΩ, so loaded Vout = ${vin} × ${num(rk(rp, 3))} ÷ (${num(r1)} + ${num(rk(rp, 3))}) ≈ **${num(lod)} V**.\n\nThe drop is about ${num(rk(drop * 100, 1))}%, so **${ok ? "Yes" : "No"}**${ok ? "" : ": the load is too heavy for this divider"}.`,
      params: { kind, vin, r1, r2, rl },
    };
  }
  const d = redraw(() => {
    const vin = rng.pick([9, 12, 15, 24]), target = rng.pick([3.3, 5, 6]);
    if (!(target < 0.7 * vin)) return null;
    const r2 = e12k(rng, 0, 1), rl = e12k(rng, 0, 2);
    const rp = (r2 * rl) / (r2 + rl);
    const r1 = (rp * (vin - target)) / target;
    if (r1 < 0.5 || r1 > 1000 || rl < r2 / 4 || isTie(rp, 2) || isTie(r1, 2)) return null;
    if (rk((rk(rp, 2) * (vin - target)) / target, 2) !== rk(r1, 2)) return null;
    return { vin, target, r2, rl, rp: rk(rp, 2), r1: rk(r1, 2) };
  });
  const { vin, target, r2, rl, rp, r1 } = d;
  return {
    prompt: `A divider on a **${vin} V** supply must give **${num(target)} V** across a load of **${kohm(rl)}**. ${SETUP}; the load is connected across R2, which is **${kohm(r2)}**.`,
    answerType: "multi",
    given: [{ label: "_vin", value: vin }, { label: "_target", value: target }, { label: "_r2", value: r2 }, { label: "_rl", value: rl }],
    parts: [
      partNum("rp", "Bottom", "Resistance of R2 and the load together, in kΩ (2 decimal places)", rp, 0.005, "R2 and the load are in parallel: product ÷ sum."),
      partNum("r1", "R1", "R1 needed, in kΩ (2 decimal places)", r1, 0.005, "Treat the parallel pair as the bottom resistor: R1 ÷ bottom = (Vin − Vout) ÷ Vout."),
    ],
    explanation: `Bottom of the divider: R2 ∥ load = \`_r2 * _rl / (_r2 + _rl)\` ≈ **${kohm(rp)}**.\n\nR1 takes ${num(vin - target)} V and the bottom takes ${num(target)} V, so R1 = bottom × (Vin − Vout) ÷ Vout = \`(_r2 * _rl / (_r2 + _rl)) * (_vin - _target) / _target\` ≈ ${num(rp)} × ${num(vin - target)} ÷ ${num(target)} ≈ **${kohm(r1)}**.`,
    params: { kind, vin, target, r2, rl },
  };
}

// =====================================================================
// LED resistors
// =====================================================================
const aLed = (col) => (/^[aeiou]/.test(col) ? `An ${col}` : `A ${col}`);
const LEDS = [["red", 1.8], ["orange", 2], ["yellow", 2.1], ["green", 2.2], ["blue", 3.2], ["white", 3.1]];
const SERIES = "The LED and a resistor are in series across the supply";
const NEXT_UP = "Fit the next E12 value at or above the exact resistance, so the current stays at or below the target";

function genLed(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["r", "r", "vr", "i"]);
    if (kind === "vr") {
      const vs = rng.pick([3.3, 5, 6, 9, 12]), [col, vf] = rng.pick(LEDS.filter(([, f]) => f < vs - 0.5));
      const vr = rk(vs - vf, 2);
      return {
        prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** is lit from a **${num(vs)} V** supply. ${SERIES}. What voltage is across the resistor, in V?`,
        answerType: "number", answer: vr, tolerance: 0.005,
        given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }],
        explanation: `In series the voltages add up to the supply, so the resistor takes \`_vs - _vf\` = ${num(vs)} − ${num(vf)} = **${num(vr)} V**.`,
        hints: ["In a series circuit the voltages across the parts add up to the supply.", "The LED takes its forward voltage; the resistor takes the rest."],
        params: { kind, vs, vf },
      };
    }
    if (kind === "i") {
      const d = redraw(() => {
        const vs = rng.pick([5, 6, 9, 12]), [col, vf] = rng.pick(LEDS), r = rng.pick(E12ALL.filter((x) => x >= 100 && x <= 1000));
        const i = ((vs - vf) / r) * 1000;
        return i >= 3 && i <= 40 && !isTie(i, 1) ? { vs, col, vf, r, i: rk(i, 1) } : null;
      });
      const { vs, col, vf, r, i } = d;
      return {
        prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** runs from a **${vs} V** supply through a **${num(r)} Ω** resistor. ${SERIES}. What current flows, in mA? Round to 1 decimal place.`,
        answerType: "number", answer: i, tolerance: 0.05,
        given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_r", value: r }],
        explanation: `The resistor takes ${vs} − ${num(vf)} = ${num(vs - vf)} V. I = V ÷ R = \`(_vs - _vf) / _r * 1000\` = ${num(vs - vf)} ÷ ${num(r)} × 1000 ≈ **${num(i)} mA**.`,
        hints: ["The resistor's voltage is the supply minus the LED's forward voltage.", "I = V ÷ R gives amps; × 1000 for mA."],
        params: { kind, vs, vf, r },
      };
    }
    const d = redraw(() => {
      const vs = rng.pick([3.3, 5, 6, 9, 12]), [col, vf] = rng.pick(LEDS), i = rng.pick([5, 8, 10, 12, 15, 18, 20, 25, 30]);
      const R = ((vs - vf) * 1000) / i;
      return vs - vf >= 0.8 && !isTie(R, 1) ? { vs, col, vf, i, R: rk(R, 1) } : null;
    });
    const { vs, col, vf, i, R } = d;
    return {
      prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** should carry **${i} mA** from a **${num(vs)} V** supply. ${SERIES}. What resistance gives exactly that current, in Ω? Round to 1 decimal place.`,
      answerType: "number", answer: R, tolerance: 0.05,
      given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_i_ma", value: i }],
      explanation: `The resistor takes ${num(vs)} − ${num(vf)} = ${num(vs - vf)} V. R = V ÷ I = \`(_vs - _vf) / (_i_ma / 1000)\` = ${num(vs - vf)} ÷ ${num(i / 1000)} ≈ **${num(R)} Ω**.`,
      hints: ["The resistor takes whatever voltage the LED does not: Vs − Vf.", "R = V ÷ I, with I in amps (mA ÷ 1000)."],
      params: { kind, vs, vf, i },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["e12", "power"]);
    if (kind === "power") {
      const vs = rng.pick([5, 6, 9, 12]), [col, vf] = rng.pick(LEDS), i = rng.pick([5, 10, 15, 20, 25, 30]);
      const p = rk((vs - vf) * i, 2);
      return {
        prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** carries **${i} mA** from a **${vs} V** supply. ${SERIES}. How much power does the resistor turn into heat, in mW? Give the exact value.`,
        answerType: "number", answer: p, tolerance: 0.005,
        given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_i_ma", value: i }],
        explanation: `The resistor takes ${vs} − ${num(vf)} = ${num(vs - vf)} V. P = V × I = \`(_vs - _vf) * _i_ma\` = ${num(vs - vf)} × ${i} = **${num(p)} mW** (V × mA gives mW).`,
        hints: ["First find the voltage across the resistor: Vs − Vf.", "P = V × I. Volts × milliamps gives milliwatts."],
        params: { kind, vs, vf, i },
      };
    }
    const d = redraw(() => {
      const vs = rng.pick([5, 6, 9, 12]), [col, vf] = rng.pick(LEDS), i = rng.pick([5, 8, 10, 12, 15, 18, 20, 25, 30]);
      const R = ((vs - vf) * 1000) / i;
      if (R < 47 || onE12(R) || isTie(R, 1) || nextUpIdx(R) !== nextUpIdx(rk(R, 1))) return null;
      const k = nextUpIdx(R);
      return { vs, col, vf, i, R: rk(R, 1), pick: E12ALL[k], opts: [E12ALL[k - 1], E12ALL[k], E12ALL[k + 1], E12ALL[k + 2]] };
    });
    const { vs, col, vf, i, R, pick, opts } = d;
    return {
      prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** should carry **${i} mA** from a **${vs} V** supply. ${SERIES}. ${NEXT_UP}.`,
      answerType: "multi",
      given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_i_ma", value: i }],
      parts: [
        partNum("exact", "R", "Exact resistance for that current, in Ω (1 decimal place)", R, 0.05, "R = (Vs − Vf) ÷ I, with I in amps."),
        partChoice("e12", "E12", "E12 resistor to fit", ohms(pick), rng.shuffle(opts.map(ohms)), "Going lower would let more current flow than the target, so round up."),
      ],
      explanation: `R = \`(_vs - _vf) / (_i_ma / 1000)\` = ${num(vs - vf)} ÷ ${num(i / 1000)} ≈ **${num(R)} Ω**. The next E12 value at or above it is **${ohms(pick)}**.`,
      params: { kind, vs, vf, i },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["full", "fitted"]);
    const d = redraw(() => {
      const vs = rng.pick([5, 6, 9, 12]), [col, vf] = rng.pick(LEDS), i = rng.pick([5, 8, 10, 12, 15, 18, 20, 25, 30]);
      const vr = vs - vf;
      const R = (vr * 1000) / i;
      if (R < 47 || onE12(R) || isTie(R, 1) || nextUpIdx(R) !== nextUpIdx(rk(R, 1))) return null;
      const k = nextUpIdx(R), re = E12ALL[k];
      const ia = (vr / re) * 1000, p = vr * ia;
      if (isTie(ia, 2) || isTie(p, 1)) return null;
      // Power worked from the rounded current (V × I or I²R) must round the same.
      const ir = rk(ia, 2);
      if (rk(vr * ir, 1) !== rk(p, 1) || rk((ir * ir * re) / 1000, 1) !== rk(p, 1)) return null;
      return { vs, col, vf, i, R: rk(R, 1), re, ia: ir, p: rk(p, 1), opts: [E12ALL[k - 1], re, E12ALL[k + 1], E12ALL[k + 2]] };
    });
    const { vs, col, vf, i, R, re, ia, p, opts } = d;
    if (kind === "fitted") {
      return {
        prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** runs from a **${vs} V** supply. ${SERIES}, and the resistor fitted is **${num(re)} Ω**.`,
        answerType: "multi",
        given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_r", value: re }],
        parts: [
          partNum("i", "I", "Current through the LED, in mA (2 decimal places)", ia, 0.005, "Current = the resistor's voltage (Vs − Vf) ÷ its resistance; × 1000 for mA."),
          partNum("p", "P", "Power in the resistor, in mW (1 decimal place)", p, 0.05, "P = V × I for the resistor. Volts × milliamps gives milliwatts."),
        ],
        explanation: `The resistor takes ${vs} − ${num(vf)} = ${num(vs - vf)} V. I = \`(_vs - _vf) / _r * 1000\` = ${num(vs - vf)} ÷ ${num(re)} × 1000 ≈ **${num(ia)} mA**.\n\nP = ${num(vs - vf)} V × ${num(ia)} mA ≈ **${num(p)} mW**.`,
        params: { kind, vs, vf, re },
      };
    }
    return {
      prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** should carry **${i} mA** from a **${vs} V** supply. ${SERIES}. ${NEXT_UP}.`,
      answerType: "multi",
      given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_i_ma", value: i }],
      parts: [
        partNum("exact", "R", "Exact resistance for the target current, in Ω (1 decimal place)", R, 0.05, "R = (Vs − Vf) ÷ I, with I in amps."),
        partChoice("e12", "E12", "E12 resistor to fit", ohms(re), rng.shuffle(opts.map(ohms)), "Round up to the next E12 value, never down."),
        partNum("i", "I", "Actual current with that resistor, in mA (2 decimal places)", ia, 0.005, "Same voltage across the resistor, divided by the E12 value."),
        partNum("p", "P", "Power in the resistor, in mW (1 decimal place)", p, 0.05, "P = V × I for the resistor. Volts × milliamps gives milliwatts."),
      ],
      explanation: `The resistor takes ${vs} − ${num(vf)} = ${num(vs - vf)} V. Exact R = \`(_vs - _vf) / (_i_ma / 1000)\` ≈ **${num(R)} Ω**, so fit **${ohms(re)}**.\n\nActual I = ${num(vs - vf)} ÷ ${num(re)} × 1000 ≈ **${num(ia)} mA** (a little under the target, as intended).\n\nP = ${num(vs - vf)} V × ${num(ia)} mA ≈ **${num(p)} mW**.`,
      params: { kind, vs, vf, i },
    };
  }

  // expert: a string of LEDs, or choosing the resistor's power rating
  const kind = rng.pick(["string", "rating"]);
  if (kind === "string") {
    const d = redraw(() => {
      const vs = rng.pick([9, 12, 15, 24]), [col, vf] = rng.pick(LEDS), i = rng.pick([10, 12, 15, 18, 20, 25]);
      const room = (vs - 2) / vf;
      if (Math.abs(room - Math.round(room)) < 1e-6) return null;
      const n = Math.floor(room);
      if (n < 2 || n > 10) return null;
      const vr = vs - n * vf, R = (vr * 1000) / i;
      if (onE12(R)) return null;
      const k = nextUpIdx(R), re = E12ALL[k];
      const ia = (vr / re) * 1000;
      if (isTie(ia, 1)) return null;
      return { vs, col, vf, i, n, vr, R, re, ia: rk(ia, 1), opts: [E12ALL[k - 1], re, E12ALL[k + 1], E12ALL[k + 2]] };
    });
    const { vs, col, vf, i, n, vr, R, re, ia, opts } = d;
    return {
      prompt: `A string of identical ${col} LEDs, each with a forward voltage of **${num(vf)} V**, runs from a **${vs} V** supply through one series resistor. The design rule leaves at least **2 V** across the resistor, and the LEDs should carry **${i} mA**. ${NEXT_UP}.`,
      answerType: "multi",
      given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_i_ma", value: i }],
      parts: [
        partNum("n", "Count", "Most LEDs the string can have", n, 0, "The LEDs may use at most Vs − 2 V between them. Divide by one LED's forward voltage and round down.", EXACT),
        partChoice("e12", "Resistor", "E12 resistor to fit", ohms(re), rng.shuffle(opts.map(ohms)), "The resistor takes Vs − (number of LEDs × Vf). Find R = V ÷ I, then round up to the E12 series."),
        partNum("i", "Current", "Actual current with that resistor, in mA (1 decimal place)", ia, 0.05, "Resistor voltage ÷ the E12 value; × 1000 for mA."),
      ],
      explanation: `The LEDs may use up to ${vs} − 2 = ${vs - 2} V. \`(_vs - 2) / _vf\` = ${vs - 2} ÷ ${num(vf)} ≈ ${num(rk((vs - 2) / vf, 2))}, so **${n} LEDs** (round down).\n\nThe resistor then takes ${vs} − ${n} × ${num(vf)} = ${num(vr)} V. Exact R = \`(_vs - ${n} * _vf) / (_i_ma / 1000)\` = ${num(vr)} ÷ ${num(i / 1000)} ≈ ${num(rk(R, 1))} Ω, so fit **${ohms(re)}**.\n\nActual I = ${num(vr)} ÷ ${num(re)} × 1000 ≈ **${num(ia)} mA**.`,
      params: { kind, vs, vf, i },
    };
  }
  const RATINGS = [125, 250, 500, 1000];
  const d = redraw(() => {
    const vs = rng.pick([9, 12, 15, 24]), [col, vf] = rng.pick(LEDS), i = rng.pick([10, 15, 20, 25, 30, 40, 50]);
    const vr = vs - vf, R = (vr * 1000) / i;
    if (onE12(R)) return null;
    const k = nextUpIdx(R), re = E12ALL[k];
    const p = ((vr * vr) / re) * 1000; // mW
    if (isTie(p, 1) || 2 * p > 1000) return null;
    if (RATINGS.some((r) => Math.abs(2 * p - r) < 0.03 * r)) return null;
    const rating = RATINGS.find((r) => r >= 2 * p);
    return { vs, col, vf, i, vr, R, re, p: rk(p, 1), rating, opts: [E12ALL[k - 1], re, E12ALL[k + 1], E12ALL[k + 2]] };
  });
  const { vs, col, vf, i, vr, R, re, p, rating, opts } = d;
  const wText = (mw) => `${num(mw / 1000)} W`;
  return {
    prompt: `${aLed(col)} LED with a forward voltage of **${num(vf)} V** should carry **${i} mA** from a **${vs} V** supply. ${SERIES}. ${NEXT_UP}. Resistors come in power ratings of 0.125 W, 0.25 W, 0.5 W and 1 W; choose the smallest rating that is at least twice the power the resistor turns into heat.`,
    answerType: "multi",
    given: [{ label: "_vs", value: vs }, { label: "_vf", value: vf }, { label: "_i_ma", value: i }],
    parts: [
      partChoice("e12", "Resistor", "E12 resistor to fit", ohms(re), rng.shuffle(opts.map(ohms)), "R = (Vs − Vf) ÷ I, then round up to the next E12 value."),
      partNum("p", "Power", "Power in that resistor, in mW (1 decimal place)", p, 0.05, "With the E12 resistor fitted, P = V² ÷ R, where V = Vs − Vf. × 1000 for mW."),
      partChoice("rating", "Rating", "Power rating to buy", wText(rating), RATINGS.map(wText), "Double the power, convert to watts, and take the first rating that is at least that."),
    ],
    explanation: `The resistor takes ${vs} − ${num(vf)} = ${num(vr)} V. Exact R = \`(_vs - _vf) / (_i_ma / 1000)\` = ${num(vr)} ÷ ${num(i / 1000)} ≈ ${num(rk(R, 1))} Ω, so fit **${ohms(re)}**.\n\nP = V² ÷ R = \`(_vs - _vf)^2 / ${num(re)} * 1000\` ≈ **${num(p)} mW**.\n\nTwice that is ${num(rk(2 * p, 1))} mW = ${num(rk((2 * p) / 1000, 4))} W, so the smallest rating that covers it is **${wText(rating)}**.`,
    params: { kind, vs, vf, i },
  };
}

// =====================================================================
// Capacitors and RC timing
// =====================================================================
const PCT = [["63%", 1], ["86%", 2], ["95%", 3], ["98%", 4], ["99%", 5]];

function genRc(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["tau", "tau", "full", "percent"]);
    if (kind === "percent") {
      const k = rng.int(1, 5);
      const right = PCT[k - 1][0];
      const others = rng.shuffle(PCT.filter(([, j]) => j !== k).map(([s]) => s)).slice(0, 3);
      const hints = k === 1
        ? ["In one time constant the capacitor closes most of the gap to the supply voltage: a little under two-thirds of it."]
        : ["In each time constant the capacitor closes about 63% of the gap that is left, so about 37% of the gap remains.", `After ${k} time constants, the gap left is about 0.37 multiplied by itself ${k} times.`];
      return {
        prompt: `A capacitor charges from 0 V through a resistor. After **${k} time constant${k > 1 ? "s" : ""}** (${k}τ), roughly what percentage of the supply voltage has it reached?`,
        answerType: "choice", answer: right, choices: rng.shuffle([right, ...others]),
        explanation: `V ÷ Vs = 1 − e^(−${k}) ≈ ${num(rk(100 * (1 - Math.exp(-k)), 1))}%, so about **${right}**. (1τ: 63%, 2τ: 86%, 3τ: 95%, 4τ: 98%, 5τ: 99%, which is why 5τ is taken as fully charged.)`,
        hints,
        params: { kind, k },
      };
    }
    if (kind === "full") {
      const { r, c, t } = redraw(() => {
        const r = e12k(rng, 1, 2), c = rng.pick([10, 22, 47, 100, 220, 470]);
        const t = (5 * r * c) / 1000;
        return t >= 0.2 && !isTie(t, 2) ? { r, c, t: rk(t, 2) } : null;
      });
      return {
        prompt: `A **${kohm(r)}** resistor charges a **${c} µF** capacitor. Taking the capacitor as fully charged after 5 time constants (5τ), how long does it take to charge fully, in seconds? Round to 2 decimal places.`,
        answerType: "number", answer: t, tolerance: 0.005,
        given: [{ label: "_r_kohm", value: r }, { label: "_c_uf", value: c }],
        explanation: `τ = R × C. kΩ × µF gives ms: \`_r_kohm * _c_uf\` = ${num(r)} × ${c} = ${num(r * c)} ms. Full charge = 5τ = ${num(5 * r * c)} ms, and in seconds \`5 * _r_kohm * _c_uf / 1000\` ≈ **${num(t)} s**.`,
        hints: ["τ = R × C. With R in kΩ and C in µF, the answer is in milliseconds.", "Multiply τ by 5, then divide by 1000 for seconds."],
        params: { kind, r, c },
      };
    }
    const r = e12k(rng, 0, 2), c = rng.pick([10, 22, 47, 100, 220, 470]);
    const tau = rk(r * c, 4);
    return {
      prompt: `A **${kohm(r)}** resistor charges a **${c} µF** capacitor. What is the time constant τ = RC, in milliseconds (ms)? Give the exact value.`,
      answerType: "number", answer: tau, tolerance: 0,
      given: [{ label: "_r_kohm", value: r }, { label: "_c_uf", value: c }],
      explanation: `kΩ × µF = (10³ Ω) × (10⁻⁶ F) = 10⁻³ s, which is ms. τ = \`_r_kohm * _c_uf\` = ${num(r)} × ${c} = **${num(tau)} ms**.`,
      hints: ["τ = R × C.", "1 kΩ × 1 µF = 1000 Ω × 0.000001 F = 0.001 s, which is 1 ms."],
      params: { kind, r, c },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["prefix", "find-c", "find-r"]);
    if (kind === "prefix") {
      const RS = [
        { u: "Ω", f: 1, lab: "_r_ohm", vals: E12ALL.filter((x) => x >= 100 && x <= 820) },
        { u: "kΩ", f: 1e3, lab: "_r_kohm", vals: E12ALL.filter((x) => x >= 1000 && x <= 820000).map((x) => rk(x / 1000, 4)) },
        { u: "MΩ", f: 1e6, lab: "_r_mohm", vals: [1, 1.5, 2.2, 3.3, 4.7, 10] },
      ];
      const CS = [
        { u: "nF", f: 1e-9, lab: "_c_nf", vals: [10, 22, 47, 100, 220, 470] },
        { u: "µF", f: 1e-6, lab: "_c_uf", vals: [0.1, 0.22, 0.47, 1, 4.7, 10, 100, 1000] },
      ];
      const d = redraw(() => {
        const R = rng.pick(RS), C = rng.pick(CS);
        if (R.u === "kΩ" && C.u === "µF") return null;
        const r = rng.pick(R.vals), c = rng.pick(C.vals);
        const tau = r * R.f * c * C.f * 1000; // ms
        return tau >= 0.1 && tau <= 20000 && !isTie(tau, 2) ? { R, C, r, c, tau: rk(tau, 2) } : null;
      });
      const { R, C, r, c, tau } = d;
      const rOhm = r * R.f;
      return {
        prompt: `A **${num(r)} ${R.u}** resistor charges a **${num(c)} ${C.u}** capacitor. What is the time constant τ = RC, in milliseconds (ms)? Round to 2 decimal places.`,
        answerType: "number", answer: tau, tolerance: 0.005,
        given: [{ label: R.lab, value: r }, { label: C.lab, value: c }],
        explanation: `In base units: R = ${R.f === 1 ? `${num(r)} Ω` : `${num(r)} ${R.u} = ${num(rOhm)} Ω`} and C = ${num(c)} ${C.u} = ${num(c)} × 10⁻${C.u === "nF" ? "⁹" : "⁶"} F. τ = R × C = \`${R.lab}${R.f === 1 ? "" : ` * ${R.f}`} * ${C.lab} * ${C.f} * 1000\` ≈ **${num(tau)} ms** (× 1000 turns seconds into ms).`,
        hints: ["Convert both to base units first: Ω and F (k = 10³, M = 10⁶, µ = 10⁻⁶, n = 10⁻⁹).", "τ = R × C gives seconds; × 1000 for ms."],
        params: { kind, rf: R.f, cf: C.f, r, c },
      };
    }
    if (kind === "find-c") {
      const { tau, r, c } = redraw(() => {
        const tau = rng.pick([10, 20, 50, 100, 200, 250, 500, 1000, 2000]), r = e12k(rng, 0, 2);
        const c = tau / r;
        return c >= 0.1 && c <= 2000 && !isTie(c, 2) ? { tau, r, c: rk(c, 2) } : null;
      });
      return {
        prompt: `An RC timer needs a time constant of **${tau} ms**, using a **${kohm(r)}** resistor. What capacitance is needed, in µF? Round to 2 decimal places.`,
        answerType: "number", answer: c, tolerance: 0.005,
        given: [{ label: "_tau_ms", value: tau }, { label: "_r_kohm", value: r }],
        explanation: `τ = R × C, so C = τ ÷ R. ms ÷ kΩ gives µF: \`_tau_ms / _r_kohm\` = ${tau} ÷ ${num(r)} ≈ **${num(c)} µF**.`,
        hints: ["Rearrange τ = R × C for C.", "With τ in ms and R in kΩ, the answer comes out in µF."],
        params: { kind, tau, r },
      };
    }
    const { T, c, r } = redraw(() => {
      const T = rng.pick([0.5, 1, 2, 3, 5, 10]), c = rng.pick([1, 10, 22, 47, 100, 220, 470]);
      const r = (T * 1000) / (5 * c);
      return r >= 0.5 && r <= 2000 && !isTie(r, 2) ? { T, c, r: rk(r, 2) } : null;
    });
    return {
      prompt: `A **${c} µF** capacitor must be fully charged in **${num(T)} s**, taking "fully charged" as 5 time constants (5τ). What resistance is needed, in kΩ? Round to 2 decimal places.`,
      answerType: "number", answer: r, tolerance: 0.005,
      given: [{ label: "_t_s", value: T }, { label: "_c_uf", value: c }],
      explanation: `5τ = ${num(T)} s, so τ = ${num(T)} ÷ 5 = ${num(T / 5)} s = ${num((T / 5) * 1000)} ms. R = τ ÷ C = \`_t_s * 1000 / 5 / _c_uf\` = ${num((T / 5) * 1000)} ÷ ${c} ≈ **${kohm(r)}** (ms ÷ µF gives kΩ).`,
      hints: ["Full charge takes 5τ, so τ is the time ÷ 5.", "R = τ ÷ C. With τ in ms and C in µF, R comes out in kΩ."],
      params: { kind, T, c },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["charge", "discharge", "time"]);
    const d = redraw(() => {
      const vs = rng.pick([5, 6, 9, 12]), r = e12k(rng, 0, 2), c = rng.pick([1, 10, 22, 47, 100, 220, 470]);
      const tau = r * c;
      if (tau < 10 || tau > 5000) return null;
      if (kind === "time") {
        const v1 = rk(vs * rng.pick([0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 0.9]), 2);
        const t = -tau * Math.log(1 - v1 / vs);
        return !isTie(t, 1) ? { vs, r, c, tau, v1, t: rk(t, 1) } : null;
      }
      const t = rk(tau * rng.pick([0.25, 0.5, 0.7, 1.2, 1.5, 2, 2.5, 3]), 0);
      if (t < 1) return null;
      const v = kind === "charge" ? vs * (1 - Math.exp(-t / tau)) : vs * Math.exp(-t / tau);
      return v >= 0.05 && !isTie(v, 2) ? { vs, r, c, tau, t, v: rk(v, 2) } : null;
    });
    const { vs, r, c, tau } = d;
    const given = [{ label: "_vs", value: vs }, { label: "_r_kohm", value: r }, { label: "_c_uf", value: c }];
    if (kind === "time") {
      const { v1, t } = d;
      return {
        prompt: `A **${c} µF** capacitor, starting at 0 V, charges through a **${kohm(r)}** resistor from a **${vs} V** supply. How long does it take to reach **${num(v1)} V**, in ms? Use t = −RC × ln(1 − V ÷ Vs). Round to 1 decimal place.`,
        answerType: "number", answer: t, tolerance: 0.05,
        given: [...given, { label: "_v1", value: v1 }],
        explanation: `τ = R × C = ${num(r)} × ${c} = ${num(tau)} ms. t = \`-_r_kohm * _c_uf * ln(1 - _v1 / _vs)\` = −${num(tau)} × ln(1 − ${num(v1)} ÷ ${vs}) ≈ **${num(t)} ms**.`,
        hints: ["τ = R × C; kΩ × µF gives ms.", "V ÷ Vs is the fraction charged. Take ln(1 − that fraction), then multiply by −τ."],
        params: { kind, vs, tau, v1 },
      };
    }
    const { t, v } = d;
    if (kind === "charge") {
      return {
        prompt: `A **${c} µF** capacitor, starting at 0 V, charges through a **${kohm(r)}** resistor from a **${vs} V** supply. What is its voltage after **${t} ms**, in V? Use V = Vs × (1 − e^(−t ÷ RC)). Round to 2 decimal places.`,
        answerType: "number", answer: v, tolerance: 0.005,
        given: [...given, { label: "_t_ms", value: t }],
        explanation: `τ = R × C = ${num(r)} × ${c} = ${num(tau)} ms, so t ÷ τ = ${num(rk(t / tau, 4))}. V = \`_vs * (1 - exp(-_t_ms / (_r_kohm * _c_uf)))\` ≈ **${num(v)} V**.`,
        hints: ["τ = R × C; kΩ × µF gives ms, the same unit as t.", "Work out e^(−t ÷ τ), take it from 1, then multiply by the supply voltage."],
        params: { kind, vs, tau, t },
      };
    }
    return {
      prompt: `A **${c} µF** capacitor charged to **${vs} V** discharges through a **${kohm(r)}** resistor. What is its voltage after **${t} ms**, in V? Use V = V0 × e^(−t ÷ RC). Round to 2 decimal places.`,
      answerType: "number", answer: v, tolerance: 0.005,
      given: [{ label: "_v0", value: vs }, { label: "_r_kohm", value: r }, { label: "_c_uf", value: c }, { label: "_t_ms", value: t }],
      explanation: `τ = R × C = ${num(r)} × ${c} = ${num(tau)} ms, so t ÷ τ = ${num(rk(t / tau, 4))}. V = \`_v0 * exp(-_t_ms / (_r_kohm * _c_uf))\` ≈ **${num(v)} V**.`,
      hints: ["τ = R × C; kΩ × µF gives ms, the same unit as t.", "Multiply the starting voltage by e^(−t ÷ τ)."],
      params: { kind, vs, tau, t },
    };
  }

  // expert: choose R for a delay, or find τ and C from a measurement
  const kind = rng.pick(["delay", "measure"]);
  if (kind === "delay") {
    const d = redraw(() => {
      const vs = rng.pick([5, 9, 12]), frac = rng.pick([0.5, 0.6, 0.75, 0.8]), c = rng.pick([10, 22, 47, 100, 220]), T = rng.pick([0.5, 1, 2, 3, 5, 10, 15, 30]);
      const vth = rk(vs * frac, 2);
      const k = Math.log(vs / (vs - vth));
      const R = (T * 1000) / (c * k); // kΩ
      const ohm = R * 1000;
      if (ohm < 1000 || ohm > 820000 || onE12(ohm) || isTie(R, 1)) return null;
      const j = nearestIdx(ohm), lo = E12ALL[nextUpIdx(ohm) - 1], hi = E12ALL[nextUpIdx(ohm)];
      if (Math.abs(ohm - lo - (hi - ohm)) < 0.02 * ohm || nearestIdx(rk(R, 1) * 1000) !== j) return null;
      const re = E12ALL[j];
      const ta = ((re / 1000) * c * k) / 1000; // s
      if (isTie(ta, 2)) return null;
      const i0 = nextUpIdx(ohm) - 1;
      return { vs, vth, c, T, k, R: rk(R, 1), re, ta: rk(ta, 2), opts: [E12ALL[i0 - 1], lo, hi, E12ALL[i0 + 2]] };
    });
    const { vs, vth, c, T, k, R, re, ta, opts } = d;
    return {
      prompt: `A timer circuit switches on when its capacitor, charging from 0 V on a **${vs} V** supply, reaches **${num(vth)} V**. The capacitor is **${c} µF** and the delay should be **${num(T)} s**. The time to reach V is t = RC × ln(Vs ÷ (Vs − V)).`,
      answerType: "multi",
      given: [{ label: "_vs", value: vs }, { label: "_vth", value: vth }, { label: "_c_uf", value: c }, { label: "_t_s", value: T }],
      parts: [
        partNum("r", "R", "Exact resistance for that delay, in kΩ (1 decimal place)", R, 0.05, "Rearrange: R = t ÷ (C × ln(Vs ÷ (Vs − V))). With t in ms and C in µF, R is in kΩ."),
        partChoice("e12", "E12", "E12 value closest to the exact resistance", ohms(re), rng.shuffle(opts.map(ohms)), "Compare the distance from your exact R to the E12 value just below and just above it."),
        partNum("delay", "Delay", "Actual delay with that E12 resistor, in s (2 decimal places)", ta, 0.005, "Put the E12 value back into t = RC × ln(Vs ÷ (Vs − V)). kΩ × µF gives ms."),
      ],
      explanation: `ln(${vs} ÷ (${vs} − ${num(vth)})) ≈ ${num(rk(k, 4))}. R = \`_t_s * 1000 / (_c_uf * ln(_vs / (_vs - _vth)))\` ≈ **${kohm(R)}**.\n\nThe nearest E12 value is **${ohms(re)}**.\n\nActual delay = ${num(re / 1000)} × ${c} × ${num(rk(k, 4))} ≈ ${num(rk((re / 1000) * c * k, 1))} ms ≈ **${num(ta)} s**.`,
      params: { kind, vs, vth, c, T },
    };
  }
  const d = redraw(() => {
    const vs = rng.pick([5, 9, 12]), r = e12k(rng, 0, 2), c0 = rng.pick([1, 2.2, 4.7, 10, 22, 47, 100]);
    const tau0 = r * c0;
    if (tau0 < 10 || tau0 > 5000) return null;
    const t1 = rk(tau0 * rng.pick([0.3, 0.5, 0.8, 1, 1.5, 2]), 0);
    if (t1 < 2) return null;
    const v1 = rk(vs * (1 - Math.exp(-t1 / tau0)), 2);
    if (v1 > vs - 0.3 || v1 < 0.3) return null;
    const tau = -t1 / Math.log(1 - v1 / vs);
    const c = tau / r;
    if (isTie(tau, 1) || isTie(c, 2) || rk(rk(tau, 1) / r, 2) !== rk(c, 2)) return null;
    return { vs, r, t1, v1, tau: rk(tau, 1), c: rk(c, 2) };
  });
  const { vs, r, t1, v1, tau, c } = d;
  return {
    prompt: `An unknown capacitor, starting at 0 V, charges through a **${kohm(r)}** resistor from a **${vs} V** supply. After **${t1} ms** it has reached **${num(v1)} V**. Use V = Vs × (1 − e^(−t ÷ τ)).`,
    answerType: "multi",
    given: [{ label: "_vs", value: vs }, { label: "_r_kohm", value: r }, { label: "_t_ms", value: t1 }, { label: "_v1", value: v1 }],
    parts: [
      partNum("tau", "τ", "Time constant, in ms (1 decimal place)", tau, 0.05, "Rearrange: e^(−t ÷ τ) = 1 − V ÷ Vs, so τ = −t ÷ ln(1 − V ÷ Vs)."),
      partNum("c", "C", "Capacitance, in µF (2 decimal places)", c, 0.005, "C = τ ÷ R. With τ in ms and R in kΩ, C is in µF."),
    ],
    explanation: `1 − ${num(v1)} ÷ ${vs} ≈ ${num(rk(1 - v1 / vs, 4))}. τ = \`-_t_ms / ln(1 - _v1 / _vs)\` ≈ **${num(tau)} ms**.\n\nC = τ ÷ R = \`-_t_ms / ln(1 - _v1 / _vs) / _r_kohm\` ≈ ${num(tau)} ÷ ${num(r)} ≈ **${num(c)} µF** (ms ÷ kΩ gives µF).`,
    params: { kind, vs, r, t1, v1 },
  };
}

// =====================================================================
// verify: independent checks
// =====================================================================
const toNum = (v) => (v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v));
const isDp = (x, k) => Number.isFinite(x) && Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6;
const close = (x, t, tol = 1e-9) => Number.isFinite(x) && Math.abs(x - t) <= tol;
// x typed to k places and the exact t within half a step of it.
const roundsTo = (x, t, k) => isDp(x, k) && Math.abs(x - t) <= 0.5 * 10 ** -k + 1e-9;
// x typed to k places, and the target sits between f(x − h) and f(x + h) for a monotonic f.
function brackets(f, x, k, target) {
  if (!isDp(x, k)) return false;
  const h = 0.5 * 10 ** -k;
  const a = f(x - h), b = f(x + h);
  const eps = 1e-9 * Math.abs(target);
  return Math.min(a, b) - eps <= target && target <= Math.max(a, b) + eps;
}

// Colour decoding (the reverse of the generator's encoding).
const DIGIT = { black: 0, brown: 1, red: 2, orange: 3, yellow: 4, green: 5, blue: 6, violet: 7, grey: 8, white: 9 };
const MULT = { gold: 0.1, silver: 0.01 };
for (const [c, d] of Object.entries(DIGIT)) MULT[c] = 10 ** d;
const TOL = { brown: 1, red: 2, green: 0.5, blue: 0.25, violet: 0.1, grey: 0.05, gold: 5, silver: 10 };
function decode(text) {
  const b = String(text).split(/\s*,\s*/);
  if (b.length !== 4 && b.length !== 5) return null;
  const ds = b.slice(0, b.length - 2).map((c) => DIGIT[c]);
  if (ds.some((x) => x === undefined) || ds[0] === 0) return null;
  const m = MULT[b[b.length - 2]], tol = TOL[b[b.length - 1]];
  if (m === undefined || tol === undefined) return null;
  const digits = ds.reduce((s, x) => s * 10 + x, 0);
  return { value: Math.round(digits * m * 1e6) / 1e6, tol };
}
// "4.7 kΩ" -> 4700
function parseOhms(text) {
  const m = /^(\d+(?:\.\d+)?) (k|M)?Ω$/.exec(String(text));
  if (!m) return NaN;
  return Math.round(Number(m[1]) * (m[2] === "M" ? 1e6 : m[2] === "k" ? 1e3 : 1) * 1e6) / 1e6;
}
// E12 check and neighbours, from the mantissa.
const E12_V = "1.0 1.2 1.5 1.8 2.2 2.7 3.3 3.9 4.7 5.6 6.8 8.2".split(" ").map(Number);
function e12Parts(ohm) {
  if (!(ohm > 0)) return null;
  const e = Math.floor(Math.log10(ohm) + 1e-9);
  const m = Math.round((ohm / 10 ** e) * 1e6) / 1e6;
  const i = E12_V.indexOf(m);
  if (i < 0) return null;
  const below = i === 0 ? 8.2 * 10 ** (e - 1) : E12_V[i - 1] * 10 ** e;
  const above = i === E12_V.length - 1 ? 10 ** (e + 1) : E12_V[i + 1] * 10 ** e;
  return { below, above };
}
// The fitted value is E12, at or above `exact`, and the E12 value below it is under `exact`.
const isNextUp = (ohm, exact) => { const p = e12Parts(ohm); return !!p && ohm >= exact - 1e-9 && p.below < exact - 1e-9; };
const isClosest = (ohm, err) => { const p = e12Parts(ohm); return !!p && err(ohm) < err(p.below) && err(ohm) < err(p.above); };
const choiceOk = (q, ans) => (q.parts || []).every((pt) => pt.answerType !== "choice" || pt.choices.includes(String(ans[pt.id])));

function verifyCodes(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "read4": case "lowmult": { const d = decode(p.bands.join(", ")); return close(x, d.value, 1e-9 * Math.max(1, d.value)); }
    case "read4k": case "read5": { const d = decode(p.bands.join(", ")); return close(x * 1000, d.value, 1e-6); }
    case "digit": return DIGIT[ans] === p.d;
    case "tol": return Number(String(ans).replace(/[±%]/g, "")) === TOL[p.colour];
    case "bands": { const d = decode(ans); return !!d && close(d.value, p.v, 1e-9) && d.tol === p.tol; }
    case "range": {
      const d = decode(p.bands.join(", "));
      const lo = toNum(ans.lo), hi = toNum(ans.hi);
      const loOk = roundsTo(lo, d.value - (d.value * d.tol) / 100, 2), hiOk = roundsTo(hi, d.value + (d.value * d.tol) / 100, 2);
      const inside = Math.abs(p.reading - d.value) <= (d.value * d.tol) / 100;
      return loOk && hiOk && ans.ok === (inside ? "Yes" : "No");
    }
    case "fit": {
      const d = decode(ans.res);
      if (!d) return false;
      const fits = d.value - (d.value * d.tol) / 100 > p.lo && d.value + (d.value * d.tol) / 100 < p.hi;
      return fits && roundsTo(toNum(ans.max), d.value + (d.value * d.tol) / 100, 2);
    }
    case "worn": {
      const v = toNum(ans.nom);
      const pow = Math.log10(v / p.n);
      const powOk = Number.isFinite(pow) && Math.abs(pow - Math.round(pow)) < 1e-9;
      const within = Math.abs(p.reading - v) <= (v * p.t) / 100;
      return powOk && within && close(p.n * MULT[ans.mult], v, 1e-6 * v);
    }
    default: return false;
  }
}

function verifyDividers(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "vout": { const I = p.vin / (p.r1 + p.r2); return roundsTo(x, I * p.r2, 2); }
    case "vr1": { const I = p.vin / (p.r1 + p.r2); return roundsTo(x, I * p.r1, 2); }
    case "mixed": { const I = p.vin / (p.r1 / 1000 + p.r2); return roundsTo(x, I * p.r2, 2); }
    case "find-r2": return brackets((r2) => (p.vin * r2) / (p.known + r2), x, 2, p.vout);
    case "find-r1": return brackets((r1) => (p.vin * p.known) / (r1 + p.known), x, 2, p.vout);
    case "e12": {
      const ex = toNum(ans.exact);
      const exOk = brackets((r2) => (p.vin * r2) / (p.r1 + r2), ex, 2, p.target);
      const ohm = parseOhms(ans.e12);
      const out = (o) => (p.vin / (p.r1 * 1000 + o)) * o; // current × R2
      const pickOk = isClosest(ohm, (o) => Math.abs(out(o) - p.target));
      return exOk && pickOk && roundsTo(toNum(ans.vout), out(ohm), 2);
    }
    case "sensor": {
      const out = (rs) => { const top = p.pos === "top" ? rs : p.fixed, bot = p.pos === "top" ? p.fixed : rs; return (p.vin / (top + bot)) * bot; };
      const a = toNum(ans.a), b = toNum(ans.b);
      return roundsTo(a, out(p.ra), 2) && roundsTo(b, out(p.rb), 2) && ans.dir === (out(p.rb) > out(p.ra) ? "Rises" : "Falls");
    }
    case "load": {
      const unl = (p.vin / (p.r1 + p.r2)) * p.r2;
      // Nodal analysis at the output: (Vin − V)/R1 = V/R2 + V/RL.
      const lod = p.vin / p.r1 / (1 / p.r1 + 1 / p.r2 + 1 / p.rl);
      const ok = (unl - lod) / unl <= 0.1;
      return roundsTo(toNum(ans.unloaded), unl, 2) && roundsTo(toNum(ans.loaded), lod, 2) && ans.ok === (ok ? "Yes" : "No");
    }
    case "design": {
      const g = 1 / p.r2 + 1 / p.rl;
      const rpOk = brackets((r) => 1 / r, toNum(ans.rp), 2, g);
      const r1Ok = brackets((r1) => p.vin / r1 / (1 / r1 + g), toNum(ans.r1), 2, p.target);
      return rpOk && r1Ok;
    }
    default: return false;
  }
}

function verifyLed(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "vr": return roundsTo(x + p.vf, p.vs, 2) || close(x + p.vf, p.vs, 1e-6);
    case "i": return brackets((ma) => (ma / 1000) * p.r, x, 1, p.vs - p.vf);
    case "r": return brackets((r) => ((p.vs - p.vf) / r) * 1000, x, 1, p.i);
    case "power": return close(x / p.i, p.vs - p.vf, 1e-6);
    case "e12": {
      const exact = ((p.vs - p.vf) / p.i) * 1000;
      return brackets((r) => ((p.vs - p.vf) / r) * 1000, toNum(ans.exact), 1, p.i) && isNextUp(parseOhms(ans.e12), exact);
    }
    case "fitted": case "full": {
      const re = p.kind === "fitted" ? p.re : parseOhms(ans.e12);
      if (p.kind === "full") {
        const exact = ((p.vs - p.vf) / p.i) * 1000;
        if (!brackets((r) => ((p.vs - p.vf) / r) * 1000, toNum(ans.exact), 1, p.i) || !isNextUp(re, exact)) return false;
      }
      const iA = (p.vs - p.vf) / re;
      // Power as I²R, a different route from the generator's V × I.
      return roundsTo(toNum(ans.i), iA * 1000, 2) && roundsTo(toNum(ans.p), iA * iA * re * 1000, 1);
    }
    case "string": {
      const n = toNum(ans.n);
      const nOk = Number.isInteger(n) && n * p.vf <= p.vs - 2 + 1e-9 && (n + 1) * p.vf > p.vs - 2 + 1e-9;
      if (!nOk) return false;
      const vr = p.vs - n * p.vf;
      const re = parseOhms(ans.e12);
      return isNextUp(re, (vr / p.i) * 1000) && roundsTo(toNum(ans.i), (vr / re) * 1000, 1);
    }
    case "rating": {
      const re = parseOhms(ans.e12);
      if (!isNextUp(re, ((p.vs - p.vf) / p.i) * 1000)) return false;
      const iA = (p.vs - p.vf) / re;
      const pw = iA * iA * re; // W
      const rate = Number(String(ans.rating).replace(/ W$/, ""));
      const list = [0.125, 0.25, 0.5, 1];
      const idx = list.indexOf(rate);
      return roundsTo(toNum(ans.p), pw * 1000, 1) && idx >= 0 && rate >= 2 * pw && (idx === 0 || list[idx - 1] < 2 * pw);
    }
    default: return false;
  }
}

function verifyRc(q, ans) {
  const p = q.params;
  const x = toNum(ans);
  switch (p.kind) {
    case "percent": return Number(String(ans).replace("%", "")) === Math.round(100 - 100 * Math.exp(-p.k));
    case "tau": return close(x / p.r, p.c, 1e-6);
    case "full": return brackets((t) => (t * 200) / p.r, x, 2, p.c); // C = (t s × 1000 ÷ 5) ÷ R
    case "prefix": return brackets((ms) => ms / 1000 / (p.r * p.rf), x, 2, p.c * p.cf);
    case "find-c": return brackets((c) => c * p.r, x, 2, p.tau);
    case "find-r": return brackets((r) => (5 * r * p.c) / 1000, x, 2, p.T);
    case "charge": return brackets((v) => -p.tau * Math.log(1 - v / p.vs), x, 2, p.t);
    case "discharge": return brackets((v) => p.tau * Math.log(p.vs / v), x, 2, p.t);
    case "time": return brackets((t) => p.vs * (1 - Math.exp(-t / p.tau)), x, 1, p.v1);
    case "delay": {
      const k = -Math.log(1 - p.vth / p.vs);
      const rOk = brackets((r) => (r * p.c * k) / 1000, toNum(ans.r), 1, p.T);
      const exact = ((p.T * 1000) / (p.c * k)) * 1000; // Ω
      const ohm = parseOhms(ans.e12);
      const pickOk = isClosest(ohm, (o) => Math.abs(o - exact));
      return rOk && pickOk && roundsTo(toNum(ans.delay), (ohm * p.c * 1e-6) * k, 2);
    }
    case "measure": {
      const tauOk = brackets((tau) => p.vs * (1 - Math.exp(-p.t1 / tau)), toNum(ans.tau), 1, p.v1);
      const tau = p.t1 / Math.log(p.vs / (p.vs - p.v1));
      return tauOk && brackets((c) => c * p.r, toNum(ans.c), 2, tau);
    }
    default: return false;
  }
}

// =====================================================================

const SUBTOPICS = { "resistor-codes": genCodes, dividers: genDividers, "led-resistors": genLed, "rc-timing": genRc };
const VERIFIERS = { "resistor-codes": verifyCodes, dividers: verifyDividers, "led-resistors": verifyLed, "rc-timing": verifyRc };

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard", "expert"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const make = SUBTOPICS[subtopic];
  if (!make) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = make(difficulty, rng);
  q.params.sub = subtopic;
  return q;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || answer === undefined || answer === null || answer === "") return false;
  if (question.answerType === "choice" && !question.choices.includes(String(answer))) return false;
  if (question.answerType === "multi" && (typeof answer !== "object" || answer === null || !choiceOk(question, answer))) return false;
  try {
    const fn = VERIFIERS[p.sub];
    return fn ? fn(question, answer) === true : false;
  } catch {
    return false;
  }
}
