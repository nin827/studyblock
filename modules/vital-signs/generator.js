// Vital Signs generator: heart rate, circulation, breathing and temperature calculations, with every
// formula stated in the prompt. Calculations only: no judgements about whether a value is normal.
// Uses only the seeded rng passed in by the engine.
// ---------------------------------------------------------------------------------------------
// Shared helpers (the same block sits in body-measurements, vital-signs and nutrition).
// Rounded answers are accepted within half a unit of the stated precision; exact answers must match.
// Explanations list every step as a labelled calculator row, e.g. `_lb = _kg * 2.2046` → 154.3.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
function roundTo(n, dp) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}

// True when n sits within 2% of a unit of a rounding tie at dp decimals (…5 boundary).
function nearTie(n, dp) {
  const s = Math.abs(n) * 10 ** dp;
  return Math.abs(s - Math.floor(s) - 0.5) < 0.02;
}

// True when n has at most dp decimals (up to binary noise).
function isClean(n, dp) {
  const s = n * 10 ** dp;
  return Math.abs(s - Math.round(s)) < 1e-6;
}

// Values in prompts, hints and steps: shortest form, up to 4 decimals; never "-0".
const num = (n) => String(roundTo(n, 4));
// Negative numbers in brackets when substituted into a formula.
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));

const R0 = { dp: 0, rounded: true };
const R1 = { dp: 1, rounded: true };
const R2 = { dp: 2, rounded: true };
const EX = { dp: 4, rounded: false };

const roundNote = (dp) => (dp === 0 ? " Round to the nearest whole number." : dp === 1 ? " Round to 1 decimal place." : ` Round to ${dp} decimal places.`);
const thenRound = (o) => (o.rounded ? ` Then round to ${o.dp === 0 ? "the nearest whole number" : o.dp === 1 ? "1 decimal place" : `${o.dp} decimal places`}.` : "");
const ansNote = (o, exact) => (o.rounded ? roundNote(o.dp) : Number.isInteger(roundTo(exact, 6)) ? "" : " Give the exact value.");
const PCT_NOTE = " Answer as a number without the % sign.";
const SIGNED_NOTE = " Use a minus sign for a decrease.";

function fmtAns(v, o) {
  return o.rounded ? roundTo(v, o.dp).toFixed(o.dp) : num(v);
}

const decimals = (s) => (String(s).split(".")[1] || "").length;

// The value on the last explanation row: "**154.3 lb**" or "154.3212, which rounds to **154.3 lb**".
function res(exact, o, unit) {
  const shown = fmtAns(exact, o);
  const u = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  if (!o.rounded || Math.abs(exact - Number(shown)) < 1e-9) return `**${shown}${u}**`;
  return `${num(exact)}, which rounds to **${shown}${u}**`;
}

// Explanation rows: a stated value, and a calculator step with its result.
const row = (label, v) => `- \`${label} = ${num(v)}\``;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;

// Pre-filled calculator rows: [["_kg", 70], ["_height", 1.75]] -> [{ label, value }].
const G = (pairs) => pairs.map(([label, value]) => ({ label, value }));

// Numbers written in a piece of text ("1.75", "-3", "2.2046").
const numbersIn = (text) => (String(text).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

// True when a hint states an answer value that the prompt doesn't already show.
function hintsLeak(hintTexts, answers, prompt) {
  const inPrompt = new Set(numbersIn(prompt));
  for (const a of answers) {
    if (!Number.isFinite(a) || inPrompt.has(a)) continue;
    for (const h of hintTexts) if (numbersIn(h).some((x) => x === a || x === Math.abs(a))) return true;
  }
  return false;
}

// 4 unique choices: the answer + 3 distractors from common mistakes, topped up with nearby values.
// No distractor is within the tolerance of the answer; no zero (or negative, unless allowed) options.
function buildChoices(ansStr, ansVal, tol, candidates, o, allowNeg, rng) {
  const seen = new Set([ansStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || typeof v !== "number" || !Number.isFinite(v)) return;
    let s;
    if (o.rounded) s = fmtAns(v, o);
    else {
      if (!isClean(v, 4)) return;
      s = num(v);
      if (Number.isInteger(ansVal) && !Number.isInteger(Number(s))) return;
    }
    const x = Number(s);
    if (x === 0 || (!allowNeg && x < 0)) return;
    if (seen.has(s) || Math.abs(x - ansVal) <= tol + 1e-9) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k <= 6; k++) {
    tryAdd(ansVal * (1 + 0.1 * k));
    tryAdd(ansVal * (1 - 0.1 * k));
  }
  const unit = o.rounded ? 10 ** -o.dp : Number.isInteger(ansVal) ? 1 : 10 ** -decimals(ansStr);
  for (let k = 1; out.length < 3 && k <= 40; k++) {
    tryAdd(ansVal + k * unit);
    tryAdd(ansVal - k * unit);
  }
  if (out.length < 3) return null;
  return rng.shuffle([ansStr, ...out]);
}

// A single typed-number or (~35%) multiple-choice question. Returns null when the case must be
// regenerated: rounding tie, zero answer, inexact "exact" answer, a given value equal to the
// answer, or a hint that states the answer.
// s = { kind, values, prompt, intro, lines, exact, o, unit, candidates, hints, given, allowNeg, noChoice }
function make(rng, s) {
  const { exact, o } = s;
  if (!Number.isFinite(exact)) return null;
  if (o.rounded ? nearTie(exact, o.dp) : !isClean(exact, 4)) return null;
  const ansStr = fmtAns(exact, o);
  const ansVal = Number(ansStr);
  if (ansVal === 0 || (!s.allowNeg && ansVal < 0)) return null;
  const prompt = s.prompt + ansNote(o, exact);
  const given = s.given && s.given.length >= 2 ? G(s.given) : undefined;
  if (given && given.some((g) => Math.abs(g.value - ansVal) < 1e-9 || Math.abs(g.value - exact) < 1e-9)) return null;
  if (hintsLeak(s.hints, [ansVal], prompt)) return null;
  const tol = o.rounded ? 0.5 * 10 ** -o.dp : 0;
  const q = {
    prompt,
    explanation: `${s.intro}\n\n${s.lines.join("\n")}`,
    tolerance: tol,
    params: { kind: s.kind, values: s.values, dp: o.dp, rounded: o.rounded },
    ...(given ? { given } : {}),
    hints: s.hints,
  };
  if (!s.noChoice && rng.next() < 0.35) {
    const choices = buildChoices(ansStr, ansVal, tol, s.candidates || [], o, !!s.allowNeg, rng);
    if (!choices) return null;
    return { ...q, answer: ansStr, answerType: "choice", choices };
  }
  return { ...q, answer: ansVal, answerType: "number", choices: undefined };
}

// A multi-part question. parts: [{ id, label, ask, kind, exact, o, hint, allowNeg }] for numbers, or
// [{ id, label, ask, cat, answer, choices, hint }] for a category choice. Returns null to regenerate.
function makeMulti(s) {
  const parts = [];
  const specs = [];
  const answers = [];
  for (const p of s.parts) {
    if (p.cat) {
      parts.push({ id: p.id, label: p.label, ask: p.ask, answerType: "choice", answer: p.answer, choices: p.choices.slice(), hint: p.hint });
      specs.push({ id: p.id, cat: p.cat });
      continue;
    }
    const { exact, o } = p;
    if (!Number.isFinite(exact)) return null;
    if (o.rounded ? nearTie(exact, o.dp) : !isClean(exact, 4)) return null;
    const v = Number(fmtAns(exact, o));
    if ((!p.allowNeg && v < 0) || (v === 0 && !p.allowZero)) return null;
    answers.push(v);
    parts.push({
      id: p.id, label: p.label, ask: p.ask + ansNote(o, exact), answerType: "number",
      answer: v, tolerance: o.rounded ? 0.5 * 10 ** -o.dp : 0, hint: p.hint,
    });
    specs.push({ id: p.id, kind: p.kind, dp: o.dp, rounded: o.rounded });
  }
  const given = s.given && s.given.length >= 2 ? G(s.given) : undefined;
  if (given && given.some((g) => answers.some((a) => Math.abs(g.value - a) < 1e-9))) return null;
  const hintTexts = [...(s.hints || []), ...parts.map((p) => p.hint)];
  if (hintsLeak(hintTexts, answers, s.prompt + " " + parts.map((p) => p.ask).join(" "))) return null;
  return {
    prompt: s.prompt,
    answerType: "multi",
    parts,
    explanation: `${s.intro}\n\n${s.lines.join("\n")}`,
    params: { multi: true, values: s.values, parts: specs },
    ...(given ? { given } : {}),
    ...(s.hints ? { hints: s.hints } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Independent check. Every numeric kind has a reverse formula in REV: it puts the answer back in and
// returns a residual in terms of a stated input (e.g. pounds ÷ 2.2046 − kilograms). The answer passes
// when the residual is within the stated rounding × how strongly the residual reacts to the answer.
// A few kinds use a direct test in CHECK instead (whole feet, categories).

function valueOk(spec, values, answer) {
  if (spec.cat) return typeof CAT[spec.cat] === "function" && String(answer) === CAT[spec.cat](values);
  if (answer === "" || answer === null || answer === undefined || typeof answer === "boolean") return false;
  const x = Number(String(answer).trim().replace(/−/g, "-"));
  if (!Number.isFinite(x)) return false;
  if (spec.rounded && !isClean(x, spec.dp)) return false;
  if (typeof CHECK[spec.kind] === "function") return CHECK[spec.kind](values, x) === true;
  const f = REV[spec.kind];
  if (typeof f !== "function") return false;
  const r = f(values, x);
  const h = Math.max(1e-4, Math.abs(x) * 1e-6);
  const sens = Math.abs((f(values, x + h) - f(values, x - h)) / (2 * h));
  if (!Number.isFinite(r) || !(sens > 0)) return false;
  const tol = spec.rounded ? 0.5 * 10 ** -spec.dp : 1e-7 * Math.max(1, Math.abs(x));
  return Math.abs(r) <= tol * sens * (1 + 1e-6) + 1e-9;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.values) return false; // regenerate from the seed to get params back
  try {
    if (question.answerType === "multi" || p.multi) {
      const parts = question.parts;
      const specs = p.parts;
      if (question.answerType !== "multi" || !Array.isArray(parts) || !Array.isArray(specs)) return false;
      if (parts.length < 2 || parts.length > 4 || parts.length !== specs.length) return false;
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
      return specs.every((spec, i) => {
        const part = parts[i];
        if (!part || part.id !== spec.id || !Object.prototype.hasOwnProperty.call(answer, spec.id)) return false;
        const value = answer[spec.id];
        if (spec.cat) {
          if (part.answerType !== "choice" || !Array.isArray(part.choices) || !part.choices.includes(String(value))) return false;
          if (part.choices.filter((c) => valueOk(spec, p.values, c)).length !== 1) return false;
        } else if (part.answerType !== "number") return false;
        return valueOk(spec, p.values, value);
      });
    }
    if (question.answerType === "choice") {
      const ch = question.choices;
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(String(answer))) return false;
      if (ch.filter((c) => valueOk(p, p.values, c)).length !== 1) return false;
    }
    return valueOk(p, p.values, answer);
  } catch {
    return false;
  }
}

const DIFFS = ["easy", "medium", "hard"];

export function generate({ subtopic, difficulty, rng }) {
  const fn = GEN[subtopic];
  if (typeof fn !== "function") throw new Error(`Unknown subtopic: ${subtopic}`);
  if (!DIFFS.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  for (let i = 0; i < 80; i++) {
    const q = fn(difficulty, rng);
    if (q) return q;
  }
  throw new Error(`Could not build a ${subtopic}/${difficulty} question`);
}

// ---------------------------------------------------------------------------------------------
// Vital Signs: calculations only (no normal / abnormal judgements).

const NAMES = ["Alex", "Priya", "Sam", "Mei", "Jordan", "Ana", "Kofi", "Lena", "Omar", "Tom", "Zara", "Luis", "Hana", "Ravi", "Noor", "Ben", "Ines", "Kai", "Maya", "Theo"];
const C_TO_F = "°F = °C × 9/5 + 32";
const F_TO_C = "°C = (°F − 32) × 5/9";
const BPM = "beats per minute = beats counted × 60 ÷ seconds counted";
const PER_MIN = "breaths per minute = breaths counted × 60 ÷ seconds counted";
const CO = "cardiac output (L/min) = heart rate (beats/min) × stroke volume (mL) ÷ 1000";
const MAP = "MAP ≈ diastolic + (systolic − diastolic) ÷ 3";
const VE = "minute ventilation (L/min) = breathing rate (breaths/min) × tidal volume (mL) ÷ 1000";
const VA = "alveolar ventilation (L/min) = breathing rate × (tidal volume − dead space) ÷ 1000";
const CONTEXT = ["at rest", "while sitting", "during a lab practical", "while lying down", "first thing in the morning", "in a practice session"];

// ---- Heart rate

function genHeart(d, rng) {
  const kind = rng.pick({ easy: ["count", "total"], medium: ["count-odd", "interval", "bpm-from-interval"], hard: ["bpm-from-ms", "hr-multi", "total-hours", "count-odd"] }[d]);
  const who = rng.pick(NAMES);
  const ctx = rng.pick(CONTEXT);

  if (kind === "count" || kind === "count-odd") {
    const s = kind === "count" ? rng.pick([10, 15, 30]) : d === "hard" ? rng.pick([18, 25, 35, 40, 45, 50]) : rng.pick([20, 40, 45, 25]);
    const bpmT = rng.int(55, 105);
    const beats = Math.max(5, Math.round((bpmT * s) / 60) + (kind === "count" ? 0 : rng.int(-1, 1)));
    const exact = (beats * 60) / s;
    const o = Number.isInteger(exact) ? EX : R0;
    if (kind === "count" && !Number.isInteger(exact)) return null;
    return make(rng, {
      kind: "count", values: { beats, s }, exact, o, unit: "beats/min",
      prompt: `${who}'s pulse is counted ${ctx}: ${beats} beats in ${s} seconds. What is the heart rate in beats per minute? Use ${BPM}.`,
      intro: `A minute is 60 seconds, so scale the count up: ${BPM}.`,
      lines: [row("_beats", beats), row("_seconds", s), step("_bpm", "_beats * 60 / _seconds", res(exact, o, "beats/min"))],
      candidates: [beats * (s / 10), beats + 60 - s, (beats * s) / 60 + beats],
      given: [["_beats", beats], ["_seconds", s]],
      hints: [
        `A minute is 60 seconds, so the count covers ${s} of them.`,
        `Multiply the count by 60 and divide by ${s}: \`${beats} × 60 ÷ ${s}\` (in the calculator: \`_beats * 60 / _seconds\`).${thenRound(o)}`,
      ],
    });
  }

  if (kind === "total" || kind === "total-hours") {
    const bpm = rng.int(55, 100);
    if (kind === "total") {
      const min = rng.int(2, 15);
      const exact = bpm * min;
      return make(rng, {
        kind: "total", values: { bpm, min }, exact, o: EX, unit: "beats",
        prompt: `${who}'s heart beats steadily at ${bpm} beats per minute. How many beats is that in ${min} minutes?`,
        intro: "Beats = beats per minute × minutes.",
        lines: [row("_bpm", bpm), row("_minutes", min), step("_beats", "_bpm * _minutes", res(exact, EX, "beats"))],
        candidates: [bpm + min, bpm * (min + 1), bpm * (min - 1)],
        given: [["_bpm", bpm], ["_minutes", min]],
        hints: [`Each minute adds ${bpm} beats.`, `Multiply: \`${bpm} × ${min}\` (in the calculator: \`_bpm * _minutes\`).`],
      });
    }
    const hours = rng.int(3, 24) / 2;
    const exact = bpm * 60 * hours;
    return make(rng, {
      kind: "total-hours", values: { bpm, hours }, exact, o: EX, unit: "beats",
      prompt: `Suppose a heart beats at an average of ${bpm} beats per minute. How many beats is that in ${num(hours)} hours?`,
      intro: "Turn the hours into minutes, then multiply by the beats per minute.",
      lines: [row("_bpm", bpm), row("_hours", hours), step("_minutes", "_hours * 60", `${num(hours * 60)} min`), step("_beats", "_bpm * _minutes", res(exact, EX, "beats"))],
      candidates: [bpm * hours, bpm * 60 * hours * 60, bpm * 100 * hours],
      given: [["_bpm", bpm], ["_hours", hours]],
      hints: [`Change the time to minutes first: \`${num(hours)} × 60\`.`, "Multiply the number of minutes by the beats per minute (in the calculator: `_bpm * _hours * 60`)."],
    });
  }

  if (kind === "interval") {
    const bpm = rng.int(50, 110);
    const exact = 60 / bpm;
    return make(rng, {
      kind, values: { bpm }, exact, o: R2, unit: "s",
      prompt: `A heart beats steadily at ${bpm} beats per minute. What is the time between beats, in seconds? Use time between beats = 60 ÷ beats per minute.`,
      intro: "There are 60 seconds in a minute, shared equally between the beats.",
      lines: [row("_bpm", bpm), step("_interval", "60 / _bpm", res(exact, R2, "s"))],
      candidates: [bpm / 60, 100 / bpm, 1 / bpm * 100],
      hints: ["60 seconds are shared between all the beats in a minute, so divide 60 by the heart rate.", `Work out \`60 ÷ ${bpm}\`.${thenRound(R2)}`],
    });
  }

  if (kind === "bpm-from-interval") {
    const iv = rng.int(55, 125) / 100;
    const exact = 60 / iv;
    return make(rng, {
      kind, values: { iv }, exact, o: R0, unit: "beats/min",
      prompt: `The time between two heartbeats is ${num(iv)} s, and the rhythm is steady. What is the heart rate in beats per minute? Use beats per minute = 60 ÷ time between beats (s).`,
      intro: "Count how many intervals of that length fit into 60 seconds.",
      lines: [row("_interval", iv), step("_bpm", "60 / _interval", res(exact, R0, "beats/min"))],
      candidates: [60 * iv, 100 / iv, 1 / iv],
      hints: ["How many gaps of that length fit into one minute (60 s)?", `Work out \`60 ÷ ${num(iv)}\`.${thenRound(R0)}`],
    });
  }

  if (kind === "bpm-from-ms") {
    const ms = rng.int(520, 1250);
    const exact = 60000 / ms;
    return make(rng, {
      kind, values: { ms }, exact, o: R0, unit: "beats/min",
      prompt: `On a heart trace, the time between beats is ${ms} milliseconds (ms), and the rhythm is steady. What is the heart rate in beats per minute? Use 1 s = 1000 ms and beats per minute = 60 ÷ time between beats (s).`,
      intro: "Change the interval to seconds, then see how many fit into 60 seconds.",
      lines: [row("_ms", ms), step("_interval", "_ms / 1000", `${num(ms / 1000)} s`), step("_bpm", "60 / _interval", res(exact, R0, "beats/min"))],
      candidates: [60 / ms, 1000 / ms * 100, ms / 10],
      hints: [`Change ${ms} ms to seconds by dividing by 1000.`, `Then work out 60 ÷ the interval in seconds (in the calculator: \`60 / (_ms / 1000)\`).${thenRound(R0)}`],
    });
  }

  // hr-multi: count with an exact rate, then the time between beats.
  const s = rng.pick([10, 12, 15, 20, 30]);
  const beats = rng.int(Math.ceil((55 * s) / 60), Math.floor((105 * s) / 60));
  const bpm = (beats * 60) / s;
  const iv = 60 / bpm;
  return makeMulti({
    values: { beats, s, bpm },
    prompt: `${who}'s pulse is counted ${ctx}: ${beats} beats in ${s} seconds. The rhythm is steady. Use ${BPM}, and time between beats = 60 ÷ beats per minute.`,
    parts: [
      { id: "rate", label: "Heart rate", ask: "What is the heart rate in beats per minute?", kind: "count", exact: bpm, o: EX, hint: `Scale ${s} seconds up to 60 seconds: multiply the count by 60, then divide by ${s}.` },
      { id: "gap", label: "Time between beats", ask: "What is the time between beats, in seconds?", kind: "interval", exact: iv, o: R2, hint: "Divide 60 seconds by the heart rate from the first part." },
    ],
    intro: `Find the rate first (${BPM}), then share 60 seconds between the beats.`,
    lines: [row("_beats", beats), row("_seconds", s), step("_bpm", "_beats * 60 / _seconds", `**${num(bpm)} beats/min**`), step("_interval", "60 / _bpm", res(iv, R2, "s"))],
    given: [["_beats", beats], ["_seconds", s]],
  });
}

// ---- Circulation

function genCirc(d, rng) {
  const kind = rng.pick({ easy: ["co", "pp", "map"], medium: ["co", "sv", "map"], hard: ["hr-from-co", "volume", "map", "map-multi"] }[d]);
  const who = rng.pick(NAMES);

  if (kind === "co") {
    const hr = d === "easy" ? 5 * rng.int(12, 20) : rng.int(55, 100);
    const sv = d === "easy" ? 10 * rng.int(6, 10) : rng.int(55, 105);
    const exact = (hr * sv) / 1000;
    const o = d === "easy" ? EX : R2;
    return make(rng, {
      kind, values: { hr, sv }, exact, o, unit: "L/min",
      prompt: `${who}'s heart rate is ${hr} beats per minute and the stroke volume (blood pumped per beat) is ${sv} mL. What is the cardiac output in litres per minute? Use ${CO}.`,
      intro: `Cardiac output is the volume of blood the heart pumps each minute: ${CO}.`,
      lines: [row("_hr", hr), row("_sv", sv), step("_co", "_hr * _sv / 1000", res(exact, o, "L/min"))],
      candidates: [hr * sv, (hr * sv) / 100, (hr + sv) / 10],
      given: [["_hr", hr], ["_sv", sv]],
      hints: [
        `Multiply the beats per minute by the millilitres per beat: \`${hr} × ${sv}\` gives mL per minute.`,
        `Divide by 1000 to turn mL into litres (in the calculator: \`_hr * _sv / 1000\`).${thenRound(o)}`,
      ],
    });
  }

  if (kind === "pp") {
    const sys = rng.int(100, 145);
    const dia = rng.int(60, Math.min(95, sys - 25));
    const exact = sys - dia;
    return make(rng, {
      kind, values: { sys, dia }, exact, o: EX, unit: "mmHg",
      prompt: `A blood pressure reading is ${sys}/${dia} mmHg (systolic/diastolic). What is the pulse pressure? Use pulse pressure = systolic − diastolic.`,
      intro: "The first number is the systolic pressure and the second the diastolic. Pulse pressure is the difference.",
      lines: [row("_sys", sys), row("_dia", dia), step("_pp", "_sys - _dia", res(exact, EX, "mmHg"))],
      candidates: [sys + dia, (sys + dia) / 2, dia - sys + 100],
      given: [["_sys", sys], ["_dia", dia]],
      hints: ["The reading is written systolic/diastolic.", `Subtract: \`${sys} − ${dia}\` (in the calculator: \`_sys - _dia\`).`],
    });
  }

  if (kind === "map" || kind === "map-multi") {
    const o = d === "hard" ? R1 : d === "medium" ? R0 : EX;
    let sys = rng.int(100, 145);
    const dia = rng.int(60, Math.min(95, sys - 25));
    if (d === "easy") sys = dia + 3 * Math.round((sys - dia) / 3); // easy: whole-number MAP
    const pp = sys - dia;
    const exact = dia + pp / 3;
    const lines = [row("_sys", sys), row("_dia", dia), step("_pp", "_sys - _dia", `${pp} mmHg`), step("_map", "_dia + _pp / 3", res(exact, o, "mmHg"))];
    const prompt = `A blood pressure reading is ${sys}/${dia} mmHg (systolic/diastolic).`;
    if (kind === "map-multi") {
      return makeMulti({
        values: { sys, dia },
        prompt: `${prompt} Use pulse pressure = systolic − diastolic, and ${MAP}.`,
        parts: [
          { id: "pp", label: "Pulse pressure", ask: "What is the pulse pressure, in mmHg?", kind: "pp", exact: pp, o: EX, hint: "Subtract the second number of the reading from the first." },
          { id: "map", label: "Mean arterial pressure", ask: "What is the mean arterial pressure (MAP), in mmHg?", kind: "map", exact, o, hint: `Divide the pulse pressure by 3, then add it to the diastolic pressure, ${dia}.` },
        ],
        intro: `The mean arterial pressure is closer to the diastolic value, because the heart spends longer relaxing than contracting: ${MAP}.`,
        lines,
        given: [["_sys", sys], ["_dia", dia]],
      });
    }
    return make(rng, {
      kind: "map", values: { sys, dia }, exact, o, unit: "mmHg",
      prompt: `${prompt} Estimate the mean arterial pressure (MAP), in mmHg, using ${MAP}.`,
      intro: `Use ${MAP}. Work out the bracket, divide by 3, then add the diastolic value.`,
      lines,
      candidates: [(sys + dia) / 2, dia + pp / 2, sys - pp / 3],
      given: [["_sys", sys], ["_dia", dia]],
      hints: [
        `Find systolic − diastolic first: \`${sys} − ${dia}\`.`,
        `Divide that difference by 3 and add the diastolic pressure (in the calculator: \`_dia + (_sys - _dia) / 3\`). Divide before you add.${thenRound(o)}`,
      ],
    });
  }

  if (kind === "sv") {
    const co = rng.int(40, 75) / 10;
    const hr = rng.int(55, 100);
    const exact = (co * 1000) / hr;
    return make(rng, {
      kind, values: { co, hr }, exact, o: R0, unit: "mL",
      prompt: `${who}'s cardiac output is ${num(co)} L/min at a heart rate of ${hr} beats per minute. What is the stroke volume, in mL? Use ${CO}, rearranged to stroke volume = cardiac output × 1000 ÷ heart rate.`,
      intro: "Rearrange the cardiac output formula. Changing litres to millilitres means multiplying by 1000.",
      lines: [row("_co", co), row("_hr", hr), step("_sv", "_co * 1000 / _hr", res(exact, R0, "mL"))],
      candidates: [co * hr, (co * 100) / hr, (co * 1000) / hr / 2],
      given: [["_co", co], ["_hr", hr]],
      hints: [`Change the cardiac output to mL per minute: \`${num(co)} × 1000\`.`, `Divide that by the number of beats per minute (in the calculator: \`_co * 1000 / _hr\`).${thenRound(R0)}`],
    });
  }

  if (kind === "hr-from-co") {
    const co = rng.int(400, 750) / 100;
    const sv = rng.int(55, 105);
    const exact = (co * 1000) / sv;
    if (exact < 45 || exact > 130) return null;
    return make(rng, {
      kind, values: { co, sv }, exact, o: R0, unit: "beats/min",
      prompt: `${who}'s cardiac output is ${num(co)} L/min and the stroke volume is ${sv} mL. What is the heart rate, in beats per minute? Use ${CO}.`,
      intro: "Rearrange the formula for heart rate: heart rate = cardiac output × 1000 ÷ stroke volume.",
      lines: [row("_co", co), row("_sv", sv), step("_hr", "_co * 1000 / _sv", res(exact, R0, "beats/min"))],
      candidates: [(co * sv) / 1000, (co * 100) / sv, sv / co],
      given: [["_co", co], ["_sv", sv]],
      hints: [
        "Rearrange: heart rate = cardiac output × 1000 ÷ stroke volume (the × 1000 turns litres into millilitres).",
        `Work out \`${num(co)} × 1000 ÷ ${sv}\` (in the calculator: \`_co * 1000 / _sv\`).${thenRound(R0)}`,
      ],
    });
  }

  // volume: total blood pumped over some minutes.
  const hr = rng.int(55, 100);
  const sv = rng.int(55, 105);
  const min = rng.pick([5, 10, 15, 20, 30, 45, 60]);
  const co = (hr * sv) / 1000;
  const exact = co * min;
  return make(rng, {
    kind: "volume", values: { hr, sv, min }, exact, o: R1, unit: "L",
    prompt: `${who}'s heart beats at ${hr} beats per minute with a stroke volume of ${sv} mL. How many litres of blood does the heart pump in ${min} minutes? Use ${CO}.`,
    intro: "Find the cardiac output (litres per minute), then multiply by the number of minutes.",
    lines: [row("_hr", hr), row("_sv", sv), row("_minutes", min), step("_co", "_hr * _sv / 1000", `${num(co)} L/min`), step("_volume", "_co * _minutes", res(exact, R1, "L"))],
    candidates: [co, (co * min) / 60, co * 60 * min],
    given: [["_hr", hr], ["_sv", sv], ["_minutes", min]],
    hints: [
      `Cardiac output first: \`${hr} × ${sv} ÷ 1000\` L/min (in the calculator: \`_co = _hr * _sv / 1000\`).`,
      `Multiply the litres per minute by ${min} minutes (in the calculator: \`_co * _minutes\`).${thenRound(R1)}`,
    ],
  });
}

// ---- Breathing

function genBreath(d, rng) {
  const kind = rng.pick({ easy: ["rr", "ve"], medium: ["rr-odd", "ve", "tv", "breath-time"], hard: ["rr-from-ve", "va", "breath-multi", "tv"] }[d]);
  const who = rng.pick(NAMES);
  const ctx = rng.pick(CONTEXT);

  if (kind === "rr" || kind === "rr-odd") {
    const s = kind === "rr" ? rng.pick([10, 15, 20, 30]) : rng.pick([40, 45, 25, 50]);
    const rTarget = rng.int(10, 22);
    const breaths = Math.max(2, Math.round((rTarget * s) / 60) + (kind === "rr" ? 0 : rng.int(-1, 1)));
    const exact = (breaths * 60) / s;
    const o = Number.isInteger(exact) ? EX : R0;
    if (kind === "rr" && !Number.isInteger(exact)) return null;
    return make(rng, {
      kind: "rr", values: { breaths, s }, exact, o, unit: "breaths/min",
      prompt: `${who}'s breathing is counted ${ctx}: ${breaths} breaths in ${s} seconds. What is the breathing rate in breaths per minute? Use ${PER_MIN}.`,
      intro: `Scale the count up to a full minute: ${PER_MIN}.`,
      lines: [row("_breaths", breaths), row("_seconds", s), step("_rate", "_breaths * 60 / _seconds", res(exact, o, "breaths/min"))],
      candidates: [breaths * (s / 10), breaths + 60 - s, breaths * 2 + 1],
      given: [["_breaths", breaths], ["_seconds", s]],
      hints: [`A minute is 60 seconds, so the count covers ${s} of them.`, `Work out \`${breaths} × 60 ÷ ${s}\` (in the calculator: \`_breaths * 60 / _seconds\`).${thenRound(o)}`],
    });
  }

  if (kind === "ve") {
    const rr = rng.int(10, d === "easy" ? 20 : 24);
    const tv = d === "easy" ? 50 * rng.int(7, 13) : rng.int(320, 700);
    const exact = (rr * tv) / 1000;
    const o = d === "easy" ? EX : R2;
    return make(rng, {
      kind, values: { rr, tv }, exact, o, unit: "L/min",
      prompt: `${who} takes ${rr} breaths per minute with a tidal volume (air per breath) of ${tv} mL. What is the minute ventilation, in litres per minute? Use ${VE}.`,
      intro: `Minute ventilation is the volume of air breathed in each minute: ${VE}.`,
      lines: [row("_rate", rr), row("_tv", tv), step("_ve", "_rate * _tv / 1000", res(exact, o, "L/min"))],
      candidates: [rr * tv, (rr * tv) / 100, (rr + tv) / 100],
      given: [["_rate", rr], ["_tv", tv]],
      hints: [`Breaths per minute × mL per breath gives mL per minute: \`${rr} × ${tv}\`.`, `Divide by 1000 to change mL to litres (in the calculator: \`_rate * _tv / 1000\`).${thenRound(o)}`],
    });
  }

  if (kind === "tv") {
    const ve = d === "hard" ? rng.int(400, 1100) / 100 : rng.int(40, 110) / 10;
    const rr = rng.int(10, 22);
    const exact = (ve * 1000) / rr;
    if (exact < 250 || exact > 800) return null;
    return make(rng, {
      kind, values: { ve, rr }, exact, o: R0, unit: "mL",
      prompt: `${who}'s minute ventilation is ${num(ve)} L/min at ${rr} breaths per minute. What is the tidal volume, in mL? Use ${VE}.`,
      intro: "Rearrange the formula: tidal volume = minute ventilation × 1000 ÷ breathing rate.",
      lines: [row("_ve", ve), row("_rate", rr), step("_tv", "_ve * 1000 / _rate", res(exact, R0, "mL"))],
      candidates: [ve * rr, (ve * 100) / rr, (ve * 1000) / rr / 2],
      given: [["_ve", ve], ["_rate", rr]],
      hints: [`Change the minute ventilation to mL per minute: \`${num(ve)} × 1000\`.`, `Share that between the ${rr} breaths (in the calculator: \`_ve * 1000 / _rate\`).${thenRound(R0)}`],
    });
  }

  if (kind === "breath-time") {
    const rr = rng.int(9, 24);
    const exact = 60 / rr;
    return make(rng, {
      kind, values: { rr }, exact, o: R2, unit: "s",
      prompt: `Someone breathes steadily at ${rr} breaths per minute. On average, how many seconds does one breath (in and out) take? Use time per breath = 60 ÷ breaths per minute.`,
      intro: "Share the 60 seconds of a minute equally between the breaths.",
      lines: [row("_rate", rr), step("_time", "60 / _rate", res(exact, R2, "s"))],
      candidates: [rr / 60, 100 / rr, 30 / rr],
      hints: ["60 seconds are shared between all the breaths in a minute.", `Work out \`60 ÷ ${rr}\`.${thenRound(R2)}`],
    });
  }

  if (kind === "rr-from-ve") {
    const ve = rng.int(450, 1100) / 100;
    const tv = rng.int(350, 650);
    const exact = (ve * 1000) / tv;
    if (exact < 8 || exact > 26) return null;
    return make(rng, {
      kind, values: { ve, tv }, exact, o: R0, unit: "breaths/min",
      prompt: `${who}'s minute ventilation is ${num(ve)} L/min with a tidal volume of ${tv} mL. What is the breathing rate, in breaths per minute? Use ${VE}.`,
      intro: "Rearrange the formula: breathing rate = minute ventilation × 1000 ÷ tidal volume.",
      lines: [row("_ve", ve), row("_tv", tv), step("_rate", "_ve * 1000 / _tv", res(exact, R0, "breaths/min"))],
      candidates: [(ve * 1000) / (tv - 150), (ve * 100) / tv, (ve * tv) / 1000],
      given: [["_ve", ve], ["_tv", tv]],
      hints: [`Change the minute ventilation to mL: \`${num(ve)} × 1000\`.`, `Divide by the volume of one breath, ${tv} mL (in the calculator: \`_ve * 1000 / _tv\`).${thenRound(R0)}`],
    });
  }

  if (kind === "va") {
    const rr = rng.int(10, 22);
    const tv = rng.int(380, 650);
    const ds = rng.int(120, 180);
    const exact = (rr * (tv - ds)) / 1000;
    return make(rng, {
      kind, values: { rr, tv, ds }, exact, o: R2, unit: "L/min",
      prompt: `${who} breathes ${rr} times a minute with a tidal volume of ${tv} mL. About ${ds} mL of each breath stays in the airways (dead space) and never reaches the alveoli. What is the alveolar ventilation, in L/min? Use ${VA}.`,
      intro: `Only the air beyond the dead space reaches the alveoli: ${VA}.`,
      lines: [row("_rate", rr), row("_tv", tv), row("_dead", ds), step("_fresh", "_tv - _dead", `${tv - ds} mL`), step("_va", "_rate * _fresh / 1000", res(exact, R2, "L/min"))],
      candidates: [(rr * tv) / 1000, (rr * (tv + ds)) / 1000, (rr * tv - ds) / 1000],
      given: [["_rate", rr], ["_tv", tv], ["_dead", ds]],
      hints: [
        `Find the air per breath that reaches the alveoli: \`${tv} − ${ds}\` mL.`,
        `Multiply by ${rr} breaths per minute, then divide by 1000 for litres (in the calculator: \`_rate * (_tv - _dead) / 1000\`).${thenRound(R2)}`,
      ],
    });
  }

  // breath-multi: rate from a count (exact), then minute ventilation.
  const s = rng.pick([10, 15, 20, 30]);
  const breaths = rng.int(Math.ceil((10 * s) / 60), Math.floor((24 * s) / 60));
  const rr = (breaths * 60) / s;
  const tv = rng.int(350, 650);
  const ve = (rr * tv) / 1000;
  return makeMulti({
    values: { breaths, s, rr, tv },
    prompt: `${who}'s breathing is counted ${ctx}: ${breaths} breaths in ${s} seconds. The tidal volume is ${tv} mL. Use ${PER_MIN}, and ${VE}.`,
    parts: [
      { id: "rate", label: "Breathing rate", ask: "What is the breathing rate in breaths per minute?", kind: "rr", exact: rr, o: EX, hint: `Multiply the count by 60, then divide by ${s}.` },
      { id: "ve", label: "Minute ventilation", ask: "What is the minute ventilation, in L/min?", kind: "ve", exact: ve, o: R2, hint: `Multiply your breathing rate by ${tv} mL, then divide by 1000.` },
    ],
    intro: "Find the breathing rate first, then the volume of air per minute.",
    lines: [row("_breaths", breaths), row("_seconds", s), row("_tv", tv), step("_rate", "_breaths * 60 / _seconds", `**${num(rr)} breaths/min**`), step("_ve", "_rate * _tv / 1000", res(ve, R2, "L/min"))],
    given: [["_breaths", breaths], ["_seconds", s], ["_tv", tv]],
  });
}

// ---- Temperature

function genTemp(d, rng) {
  const kind = rng.pick({ easy: ["c2f", "change"], medium: ["f2c", "dc2df", "rate", "c2f"], hard: ["df2dc", "temp-multi", "rate", "f2c"] }[d]);
  const who = rng.pick(NAMES);

  if (kind === "c2f") {
    const c = d === "easy" ? rng.int(70, 80) / 2 : rng.int(350, 400) / 10;
    const o = d === "easy" ? EX : R1;
    const exact = (c * 9) / 5 + 32;
    return make(rng, {
      kind, values: { c }, exact, o, unit: "°F",
      prompt: `A thermometer reads ${num(c)} °C. What is this in °F? Use ${C_TO_F}.`,
      intro: `Use ${C_TO_F}: multiply by 9/5 first, then add 32.`,
      lines: [row("_c", c), step("_f", "_c * 9 / 5 + 32", res(exact, o, "°F"))],
      candidates: [(c * 9) / 5, ((c + 32) * 9) / 5, (c * 5) / 9 + 32],
      hints: [`Use ${C_TO_F}. Multiply before you add.`, `Work out \`${num(c)} × 9 / 5\`, then add 32 (in the calculator: \`${num(c)} * 9 / 5 + 32\`).${thenRound(o)}`],
    });
  }

  if (kind === "f2c") {
    const o = d === "hard" ? R2 : R1;
    const f = rng.int(950, 1040) / 10;
    const exact = ((f - 32) * 5) / 9;
    return make(rng, {
      kind, values: { f }, exact, o, unit: "°C",
      prompt: `A thermometer reads ${num(f)} °F. What is this in °C? Use ${F_TO_C}.`,
      intro: `Use ${F_TO_C}: subtract 32 first, then multiply by 5/9.`,
      lines: [row("_f", f), step("_c", "(_f - 32) * 5 / 9", res(exact, o, "°C"))],
      candidates: [(f * 5) / 9 - 32, ((f - 32) * 9) / 5, f - 32],
      hints: [`Use ${F_TO_C}. Take away 32 before you multiply.`, `Work out \`(${num(f)} − 32) × 5 / 9\` (in the calculator: \`(${num(f)} - 32) * 5 / 9\`).${thenRound(o)}`],
    });
  }

  const T1 = rng.int(360, 378) / 10;
  if (kind === "change") {
    let t2 = rng.int(358, 392) / 10;
    if (t2 === T1) t2 = roundTo(T1 + 0.4, 1);
    const exact = roundTo(t2 - T1, 1);
    const [a, b] = rng.pick([["9:00", "13:00"], ["morning", "evening"], ["the first reading", "the second reading"]]);
    return make(rng, {
      kind, values: { t1: T1, t2 }, exact, o: EX, unit: "°C", allowNeg: true,
      prompt: `${who}'s temperature was ${num(T1)} °C at ${a} and ${num(t2)} °C at ${b}. What is the change in temperature, in °C? Use change = later reading − earlier reading.${SIGNED_NOTE}`,
      intro: "Change = later reading − earlier reading. A fall gives a negative change.",
      lines: [row("_t1", T1), row("_t2", t2), step("_change", "_t2 - _t1", res(exact, EX, "°C"))],
      candidates: [-exact, T1 + t2, exact * 2],
      given: [["_t1", T1], ["_t2", t2]],
      hints: ["Change = later − earlier, so start from the later reading.", `Work out \`${num(t2)} − ${num(T1)}\` (in the calculator: \`_t2 - _t1\`).`],
    });
  }

  if (kind === "dc2df") {
    const dc = rng.int(3, 30) / 10;
    const exact = (dc * 9) / 5;
    return make(rng, {
      kind, values: { dc }, exact, o: EX, unit: "°F",
      prompt: `A temperature rises by ${num(dc)} °C. By how many °F does it rise? A change of 1 °C is a change of 9/5 °F, so use change in °F = change in °C × 9/5 (no + 32 for a change).`,
      intro: "For a change in temperature, the + 32 cancels out, so only multiply by 9/5.",
      lines: [row("_dc", dc), step("_df", "_dc * 9 / 5", res(exact, EX, "°F"))],
      candidates: [(dc * 9) / 5 + 32, (dc * 5) / 9, dc + 32],
      hints: ["The + 32 in the full conversion is a shift, and it cancels out when you subtract two readings.", `Work out \`${num(dc)} × 9 / 5\`.`],
    });
  }

  if (kind === "df2dc") {
    const df = rng.int(5, 60) / 10;
    const exact = (df * 5) / 9;
    return make(rng, {
      kind, values: { df }, exact, o: R2, unit: "°C",
      prompt: `A temperature falls by ${num(df)} °F. By how many °C does it fall? A change of 1 °F is a change of 5/9 °C, so use change in °C = change in °F × 5/9 (no − 32 for a change).`,
      intro: "For a change in temperature, the 32 cancels out, so only multiply by 5/9.",
      lines: [row("_df", df), step("_dc", "_df * 5 / 9", res(exact, R2, "°C"))],
      candidates: [((df - 32) * 5) / 9 * -1, (df * 9) / 5, df / 2],
      hints: ["The 32 in the full conversion cancels out when you subtract two readings.", `Work out \`${num(df)} × 5 / 9\`.${thenRound(R2)}`],
    });
  }

  if (kind === "rate") {
    let t2 = rng.int(358, 392) / 10;
    if (t2 === T1) t2 = roundTo(T1 - 0.6, 1);
    const hours = d === "hard" ? rng.int(3, 16) / 2 : rng.int(2, 8);
    const change = roundTo(t2 - T1, 1);
    const exact = change / hours;
    return make(rng, {
      kind, values: { t1: T1, t2, hours }, exact, o: R2, unit: "°C per hour", allowNeg: true,
      prompt: `${who}'s temperature went from ${num(T1)} °C to ${num(t2)} °C over ${num(hours)} hours. What was the average change per hour, in °C per hour? Use average change per hour = (later − earlier) ÷ hours.${SIGNED_NOTE}`,
      intro: "Find the total change, then share it between the hours.",
      lines: [row("_t1", T1), row("_t2", t2), row("_hours", hours), step("_change", "_t2 - _t1", `${num(change)} °C`), step("_rate", "_change / _hours", res(exact, R2, "°C per hour"))],
      candidates: [-exact, change * hours, (t2 + T1) / hours],
      given: [["_t1", T1], ["_t2", t2], ["_hours", hours]],
      hints: [`Total change first: \`${num(t2)} − ${num(T1)}\` (in the calculator: \`_t2 - _t1\`).`, `Divide the total change by ${num(hours)} hours (in the calculator: \`(_t2 - _t1) / _hours\`).${thenRound(R2)}`],
    });
  }

  // temp-multi: two °F readings → first reading in °C, and the change in °C.
  const f1 = rng.int(965, 1000) / 10;
  let f2 = rng.int(960, 1030) / 10;
  if (f2 === f1) f2 = roundTo(f1 + 1.3, 1);
  const c1 = ((f1 - 32) * 5) / 9;
  const dc = ((f2 - f1) * 5) / 9;
  return makeMulti({
    values: { f: f1, df: f2 - f1, f1, f2 },
    prompt: `${who}'s temperature was ${num(f1)} °F in the morning and ${num(f2)} °F in the evening. Use ${F_TO_C}. For a change, use change in °C = change in °F × 5/9.`,
    parts: [
      { id: "first", label: "Morning reading", ask: "What was the morning reading in °C?", kind: "f2c", exact: c1, o: R1, hint: `Take 32 away from ${num(f1)}, then multiply by 5/9.` },
      { id: "change", label: "Change", ask: `What was the change from morning to evening, in °C?${SIGNED_NOTE}`, kind: "df-signed", exact: dc, o: R2, allowNeg: true, hint: "Find evening − morning in °F first, then multiply that difference by 5/9. Don't subtract 32 for a change." },
    ],
    intro: "Convert the reading with the full formula, but convert the change with × 5/9 only.",
    lines: [row("_f1", f1), row("_f2", f2), step("_c1", "(_f1 - 32) * 5 / 9", res(c1, R1, "°C")), step("_dc", "(_f2 - _f1) * 5 / 9", res(dc, R2, "°C"))],
    given: [["_f1", f1], ["_f2", f2]],
  });
}

const GEN = { "heart-rate": genHeart, circulation: genCirc, breathing: genBreath, temperature: genTemp };

// Reverse formulas: residual in terms of a stated input.
const REV = {
  count: (k, x) => (x * k.s) / 60 - k.beats,
  total: (k, x) => x / k.min - k.bpm,
  "total-hours": (k, x) => x / (60 * k.hours) - k.bpm,
  interval: (k, x) => x * k.bpm - 60,
  "bpm-from-interval": (k, x) => x * k.iv - 60,
  "bpm-from-ms": (k, x) => x * k.ms - 60000,
  co: (k, x) => (x * 1000) / k.hr - k.sv,
  pp: (k, x) => k.dia + x - k.sys,
  map: (k, x) => 3 * x - (k.sys + 2 * k.dia),
  sv: (k, x) => (x * k.hr) / 1000 - k.co,
  "hr-from-co": (k, x) => (x * k.sv) / 1000 - k.co,
  volume: (k, x) => (x * 1000) / (k.min * k.hr) - k.sv,
  rr: (k, x) => (x * k.s) / 60 - k.breaths,
  ve: (k, x) => (x * 1000) / k.rr - k.tv,
  tv: (k, x) => (x * k.rr) / 1000 - k.ve,
  "breath-time": (k, x) => x * k.rr - 60,
  "rr-from-ve": (k, x) => (x * k.tv) / 1000 - k.ve,
  va: (k, x) => (x * 1000) / k.rr + k.ds - k.tv,
  c2f: (k, x) => ((x - 32) * 5) / 9 - k.c,
  f2c: (k, x) => (x * 9) / 5 + 32 - k.f,
  change: (k, x) => k.t1 + x - k.t2,
  dc2df: (k, x) => (x * 5) / 9 - k.dc,
  df2dc: (k, x) => (x * 9) / 5 - k.df,
  "df-signed": (k, x) => (k.f1 + (x * 9) / 5) - k.f2,
  rate: (k, x) => k.t1 + x * k.hours - k.t2,
};
const CHECK = {};
const CAT = {};
