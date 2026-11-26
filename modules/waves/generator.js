// Waves generator: the wave equation, period and frequency, refraction (Snell's law, critical angle)
// and thin lenses. Uses only the seeded rng passed in by the engine.
// Every prompt states its units and rounding. Rounded answers are accepted within half a unit of the
// stated precision; exact answers must match. Angles are in degrees.
// Explanations list every step as a labelled calculator row, e.g. `_v = _f * _lambda` → 340.

// ---------------------------------------------------------------------------------------------
// Number helpers

// Round half away from zero (the 1e-9 nudge absorbs binary error, e.g. 2.525*100 = 252.4999...): mathutil.
import { roundTo } from "../../js/lib/mathutil.js";

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

// Given values and intermediate steps: shortest form (up to 6 decimals); never "-0".
const num = (n) => String(roundTo(n, 6));
const num4 = (n) => String(roundTo(n, 4));
const decimals = (s) => (String(s).split(".")[1] || "").length;

// Answer/choice formatter. o = { dp, rounded, integer, allowNeg }.
function fmtAns(v, o) {
  return o.rounded ? roundTo(v, o.dp).toFixed(o.dp) : num(v);
}

const roundNote = (dp) => (dp === 0 ? " Round to the nearest whole number." : dp === 1 ? " Round to 1 decimal place." : ` Round to ${dp} decimal places.`);
const EXACT = " Give the exact value.";

// 4 unique choices: the answer + 3 distractors from common mistakes, topped up with nearby values.
// No distractor is within the tolerance of the answer; no zero (or negative, unless allowed) options.
function buildChoices(ansStr, ansVal, tol, candidates, o, rng) {
  const seen = new Set([ansStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || typeof v !== "number" || !Number.isFinite(v)) return;
    let s;
    if (o.rounded) s = fmtAns(v, o);
    else {
      if (!isClean(v, 4)) return;
      s = num(v);
      if (o.integer && !Number.isInteger(Number(s))) return;
    }
    const x = Number(s);
    if (x === 0 || (!o.allowNeg && x < 0)) return;
    if (o.maxVal !== undefined && x >= o.maxVal) return;
    if (seen.has(s) || Math.abs(x - ansVal) <= tol + 1e-9) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k <= 40; k++) {
    if (o.integer) {
      tryAdd(ansVal + k);
      tryAdd(ansVal - k);
    } else {
      tryAdd(ansVal * (1 + 0.1 * k));
      tryAdd(ansVal * (1 - 0.1 * k));
    }
  }
  const step = o.rounded ? 10 ** -o.dp : o.integer ? 1 : 10 ** -decimals(ansStr);
  for (let k = 1; out.length < 3 && k <= 40; k++) tryAdd(ansVal + k * step);
  if (out.length < 3) return null;
  return rng.shuffle([ansStr, ...out]);
}

// Pre-filled calculator rows: the explanation's plain-number rows (`_x = 12` with no "→") whose value
// is a number stated in the prompt. Labels therefore match the explanation. Rounding instructions and
// "(for example …)" hints are ignored when reading the prompt's numbers.
function promptNumbers(prompt) {
  const text = String(prompt)
    .replace(/\(for example[^)]*\)/g, "")
    .replace(/Round to [^.]*\./g, "");
  return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}

function givenFrom(prompt, explanation) {
  const nums = new Set(promptNumbers(prompt));
  const out = [];
  const seen = new Set();
  for (const m of String(explanation).matchAll(/^- `(_[A-Za-z0-9_]{1,23}) = (-?\d+(?:\.\d+)?)`(?: \([^)]*\))?$/gm)) {
    const label = m[1];
    const value = Number(m[2]);
    if (!Number.isFinite(value) || !nums.has(value) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, value });
  }
  return out.slice(0, 8);
}

// Attach `given` to a question with two or more numeric inputs. Returns false when a given value
// equals the answer (the case is then regenerated so the pre-filled rows never show the answer).
function withGiven(q, answerValues) {
  const g = givenFrom(q.prompt, q.explanation);
  if (g.some((x) => answerValues.some((a) => Number.isFinite(a) && Math.abs(x.value - a) < 1e-9))) return false;
  if (g.length && promptNumbers(q.prompt).length >= 2) q.given = g;
  return true;
}

// Turn a solved question into a typed-number or (~35%) multiple-choice question.
// Returns null when the case must be regenerated (rounding tie, zero answer, inexact "exact" answer).
function finish(base, exact, o, candidates, rng) {
  if (!Number.isFinite(exact)) return null;
  const tol = o.rounded ? 0.5 * 10 ** -o.dp : 0;
  if (o.rounded) {
    if (nearTie(exact, o.dp) || roundTo(exact, o.dp) === 0) return null;
  } else if (!isClean(exact, 6)) return null;
  const ansStr = fmtAns(exact, o);
  const ansVal = Number(ansStr);
  if (o.integer && !Number.isInteger(ansVal)) return null;
  if (!o.allowNeg && !(ansVal > 0)) return null;
  const q = {
    ...base,
    tolerance: tol,
    params: { ...base.params, dp: o.dp, rounded: !!o.rounded, allowNeg: !!o.allowNeg },
  };
  if (base.params.kind !== "balance" && !withGiven(q, [ansVal, exact])) return null;
  if (rng.next() < 0.35) {
    const choices = buildChoices(ansStr, ansVal, tol, candidates, o, rng);
    if (!choices) return null;
    return { ...q, answer: ansStr, answerType: "choice", choices };
  }
  return { ...q, answer: ansVal, answerType: "number", choices: undefined };
}

// Calculator rows for the explanation (rendered as a markdown list).
const given = (label, v, unit = "") => `- \`${label} = ${num(v)}\`${unit ? ` (${unit})` : ""}`;
const step = (label, expr, shown) => `- \`${label} = ${expr}\` → ${shown}`;
const explain = (intro, lines, outro = "") => `${intro}\n\n${lines.join("\n")}${outro ? `\n\n${outro}` : ""}`;

// The value shown on the last row: "**12 m**" or "14.2857, which rounds to **14.29 m**".
function final(exact, o, unit) {
  const shown = fmtAns(exact, o);
  const dressed = unit ? `${shown} ${unit}` : shown;
  if (!o.rounded || Math.abs(exact - Number(shown)) < 1e-9) return `**${dressed}**`;
  return `${num4(exact)}, which rounds to **${dressed}**`;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function checkDifficulty(d, allowed = ["easy", "medium", "hard"]) {
  if (!allowed.includes(d)) throw new Error(`Unknown difficulty: ${d}`);
}

const DEG = Math.PI / 180;
const sind = (x) => Math.sin(x * DEG);
const asind = (x) => Math.asin(x) / DEG;

// ---------------------------------------------------------------------------------------------
// Wave equation: v = f × λ. Values are stored in SI units; `scale` converts the answer unit to SI.

const EASY_WAVES = ["a wave", "a wave on a long rope", "a transverse wave", "a longitudinal wave", "a wave on a slinky spring", "a water wave"];
// Rough top speeds (m/s) for the everyday waves above.
const WAVE_MAX_SPEED = { "a wave on a long rope": 40, "a wave on a slinky spring": 10, "a water wave": 10 };

function genWaveEquation(d, rng) {
  checkDifficulty(d);
  let kind, prompt, exact, unit, intro, lines, candidates, values, o, unknown, scale;

  if (d === "easy") {
    unknown = rng.pick(["v", "f", "lam"]);
    const f = rng.int(2, 50);
    const lam = rng.int(1, 20);
    const v = f * lam;
    const drawn = rng.pick(EASY_WAVES);
    // Ropes, slinkies and water waves are slow; faster values keep the wording neutral (no rng call).
    const what = v > (WAVE_MAX_SPEED[drawn] ?? Infinity) ? "a wave" : drawn;
    o = { dp: 6, rounded: false };
    scale = 1;
    if (unknown === "v") {
      exact = v;
      unit = "m/s";
      values = { f, lam };
      prompt = `${cap(what)} has a frequency of ${f} Hz and a wavelength of ${lam} m. What is its speed, in m/s?${EXACT}`;
      intro = "Use the wave equation `v = f × λ` (speed = frequency × wavelength).";
      lines = [given("_f", f, "Hz"), given("_lambda", lam, "m"), step("_v", "_f * _lambda", final(exact, o, unit))];
      candidates = [f / lam, lam / f, f + lam];
    } else if (unknown === "f") {
      exact = f;
      unit = "Hz";
      values = { v, lam };
      prompt = `${cap(what)} travels at ${v} m/s and has a wavelength of ${lam} m. What is its frequency, in Hz?${EXACT}`;
      intro = "Rearrange `v = f × λ` to `f = v / λ`.";
      lines = [given("_v", v, "m/s"), given("_lambda", lam, "m"), step("_f", "_v / _lambda", final(exact, o, unit))];
      candidates = [v * lam, lam / v, v - lam];
    } else {
      exact = lam;
      unit = "m";
      values = { v, f };
      prompt = `${cap(what)} travels at ${v} m/s with a frequency of ${f} Hz. What is its wavelength, in m?${EXACT}`;
      intro = "Rearrange `v = f × λ` to `λ = v / f`.";
      lines = [given("_v", v, "m/s"), given("_f", f, "Hz"), step("_lambda", "_v / _f", final(exact, o, unit))];
      candidates = [v * f, f / v, v - f];
    }
    kind = "weq";
  } else if (d === "medium") {
    kind = "weq";
    o = { dp: 6, rounded: false };
    const sc = rng.pick(["radio-lam", "radio-f", "sound-lam", "sound-f", "light-f", "light-lam", "ultrasound-v"]);
    if (sc === "radio-lam" || sc === "radio-f") {
      const fM = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10, 12, 12.5, 15, 20, 24, 25, 30, 40, 50, 60, 75, 100, 120, 150, 200, 250, 300, 400, 500, 600, 750, 1000]);
      const lam = 300 / fM;
      if (!isClean(lam, 4)) return null;
      // The "λ = 300 / f(MHz)" shortcut is the answer itself at 1 MHz (300 m), so it's left out there.
      intro = `Radio waves travel at the speed of light, \`v = 3 × 10⁸ m/s\`. Use \`v = f × λ\`, converting MHz to Hz (× 10⁶).${fM === 1 ? "" : " In MHz the powers of ten cancel: `λ = 300 / f(MHz)`."}`;
      if (sc === "radio-lam") {
        unknown = "lam";
        scale = 1;
        exact = lam;
        unit = "m";
        values = { v: 3e8, f: fM * 1e6 };
        prompt = `A radio station broadcasts at ${num(fM)} MHz. Radio waves travel at 3 × 10⁸ m/s. What is the wavelength, in m?${EXACT}`;
        lines = [given("_v", 3e8, "m/s"), given("_f_MHz", fM), step("_f", `_f_MHz * 1e6`, `${num(fM)} × 10⁶ Hz`), step("_lambda", "_v / _f", final(exact, o, unit))];
        candidates = [lam * 1000, lam / 1000, fM / 300, lam * 10];
      } else {
        unknown = "f";
        scale = 1e6;
        exact = fM;
        unit = "MHz";
        values = { v: 3e8, lam };
        prompt = `A radio wave has a wavelength of ${num(lam)} m and travels at 3 × 10⁸ m/s. What is its frequency, in MHz?${EXACT}`;
        lines = [given("_v", 3e8, "m/s"), given("_lambda", lam, "m"), step("_f", "_v / _lambda", `${num(fM * 1e6)} Hz`), step("_f_MHz", "_f / 1e6", final(exact, o, unit))];
        candidates = [fM * 1000, fM / 1000, lam / 300, fM * 10];
      }
    } else if (sc === "sound-lam" || sc === "sound-f") {
      const v = rng.pick([320, 330, 340]);
      const f = rng.pick([100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 4000, 5000, 8000]);
      const lamCm = (100 * v) / f;
      if (!isClean(lamCm, 2)) return null;
      intro = "Use `v = f × λ`. Work in metres and hertz, then convert: 1 m = 100 cm and 1 kHz = 1000 Hz.";
      if (sc === "sound-lam") {
        unknown = "lam";
        scale = 0.01;
        exact = lamCm;
        unit = "cm";
        values = { v, f };
        prompt = `A sound wave of frequency ${num(f)} Hz travels through air at ${v} m/s. What is its wavelength, in cm?${EXACT}`;
        lines = [given("_v", v, "m/s"), given("_f", f, "Hz"), step("_lambda", "_v / _f", `${num(v / f)} m`), step("_lambda_cm", "_lambda * 100", final(exact, o, unit))];
        candidates = [v / f, lamCm * 10, (f / v) * 100, lamCm / 10];
      } else {
        unknown = "f";
        scale = 1000;
        exact = f / 1000;
        unit = "kHz";
        values = { v, lam: lamCm / 100 };
        prompt = `A sound wave travels through air at ${v} m/s and has a wavelength of ${num(lamCm)} cm. What is its frequency, in kHz?${EXACT}`;
        lines = [given("_v", v, "m/s"), given("_lambda_cm", lamCm), step("_lambda", `_lambda_cm / 100`, `${num(lamCm / 100)} m`), step("_f", "_v / _lambda", `${num(f)} Hz`), step("_f_kHz", "_f / 1000", final(exact, o, unit))];
        candidates = [f, f / 100, v / lamCm, (f / 1000) * 10];
      }
    } else if (sc === "light-f" || sc === "light-lam") {
      const lamNm = rng.pick([400, 480, 500, 600, 625, 750, 800, 1000, 1200, 1500, 375, 3000]);
      const fT = 300000 / lamNm;
      intro = "Light travels at `c = 3 × 10⁸ m/s`. Use `c = f × λ` with 1 nm = 10⁻⁹ m and 1 THz = 10¹² Hz.";
      if (sc === "light-f") {
        unknown = "f";
        scale = 1e12;
        exact = fT;
        unit = "THz";
        values = { v: 3e8, lam: lamNm * 1e-9 };
        prompt = `Light of wavelength ${lamNm} nm travels at 3 × 10⁸ m/s. What is its frequency, in THz?${EXACT}`;
        lines = [given("_c", 3e8, "m/s"), given("_lambda_nm", lamNm), step("_lambda", `_lambda_nm * 1e-9`, `${lamNm} × 10⁻⁹ m`), step("_f", "_c / _lambda", `${num(fT)} × 10¹² Hz`), step("_f_THz", "_f / 1e12", final(exact, o, unit))];
        candidates = [fT * 1000, fT / 1000, fT * 10, lamNm / 1000];
      } else {
        unknown = "lam";
        scale = 1e-9;
        exact = lamNm;
        unit = "nm";
        values = { v: 3e8, f: fT * 1e12 };
        prompt = `Light of frequency ${num(fT)} THz travels at 3 × 10⁸ m/s. What is its wavelength, in nm?${EXACT}`;
        lines = [given("_c", 3e8, "m/s"), given("_f_THz", fT), step("_f", `_f_THz * 1e12`, `${num(fT)} × 10¹² Hz`), step("_lambda", "_c / _f", `${lamNm} × 10⁻⁹ m`), step("_lambda_nm", "_lambda / 1e-9", final(exact, o, unit))];
        candidates = [lamNm * 1000, lamNm / 1000, lamNm * 10, lamNm / 10];
      }
    } else {
      const fM = rng.pick([1, 2, 2.5, 3, 4, 5, 7.5, 10]);
      const lamMm = rng.pick([0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.5]);
      const v = fM * 1e6 * lamMm * 1e-3;
      if (v < 300 || v > 6000) return null;
      unknown = "v";
      scale = 1;
      exact = v;
      unit = "m/s";
      values = { f: fM * 1e6, lam: lamMm * 1e-3 };
      prompt = `An ultrasound wave has a frequency of ${num(fM)} MHz and a wavelength of ${num(lamMm)} mm in body tissue. What is its speed, in m/s?${EXACT}`;
      intro = "Use `v = f × λ` with the frequency in Hz (1 MHz = 10⁶ Hz) and the wavelength in metres (1 mm = 10⁻³ m).";
      lines = [given("_f_MHz", fM), step("_f", `_f_MHz * 1e6`, `${num(fM * 1e6)} Hz`), given("_lambda_mm", lamMm), step("_lambda", `_lambda_mm * 1e-3`, `${num(lamMm / 1000)} m`), step("_v", "_f * _lambda", final(exact, o, unit))];
      candidates = [fM * lamMm, v * 1000, v / 1000, v * 10];
    }
  } else {
    kind = "weq";
    o = { dp: 2, rounded: true };
    const sc = rng.pick(["sound", "fm", "am", "light", "speed"]);
    if (sc === "sound") {
      const [medium, v, inCm] = rng.pick([["air", 343, true], ["air", 330, true], ["air", 340, true], ["water", 1480, false], ["steel", 5100, false], ["glass", 4540, false]]);
      const f = rng.int(100, 9000);
      unknown = "lam";
      scale = inCm ? 0.01 : 1;
      exact = (v / f) / scale;
      unit = inCm ? "cm" : "m";
      values = { v, f };
      prompt = `A sound wave of frequency ${f} Hz travels through ${medium} at ${v} m/s. What is its wavelength, in ${unit}?${roundNote(2)}`;
      intro = `Rearrange \`v = f × λ\` to \`λ = v / f\`${inCm ? ", then convert metres to centimetres (× 100)" : ""}.`;
      lines = [given("_v", v, "m/s"), given("_f", f, "Hz"), step("_lambda", "_v / _f", inCm ? `${num4(v / f)} m` : final(exact, o, unit))];
      if (inCm) lines.push(step("_lambda_cm", "_lambda * 100", final(exact, o, unit)));
      candidates = [(f / v) / scale, exact * 10, exact / 10, (v * f) / 1e4];
    } else if (sc === "fm" || sc === "am") {
      const fm = sc === "fm";
      const fv = fm ? rng.int(880, 1080) / 10 : rng.int(530, 1700);
      const fHz = fv * (fm ? 1e6 : 1e3);
      unknown = "lam";
      scale = 1;
      exact = 3e8 / fHz;
      unit = "m";
      values = { v: 3e8, f: fHz };
      prompt = `A radio station broadcasts at ${num(fv)} ${fm ? "MHz" : "kHz"}. Radio waves travel at 3 × 10⁸ m/s. What is the wavelength, in m?${roundNote(2)}`;
      intro = `Use \`λ = v / f\` with the frequency in Hz (1 ${fm ? "MHz = 10⁶" : "kHz = 10³"} Hz).`;
      lines = [given("_v", 3e8, "m/s"), given(fm ? "_f_MHz" : "_f_kHz", fv), step("_f", `${fm ? "_f_MHz * 1e6" : "_f_kHz * 1e3"}`, `${num(fHz)} Hz`), step("_lambda", "_v / _f", final(exact, o, unit))];
      candidates = [exact * 1000, exact / 1000, exact * 10, exact / 10];
    } else if (sc === "light") {
      const lamNm = rng.int(380, 750);
      unknown = "f";
      scale = 1e12;
      exact = 300000 / lamNm;
      unit = "THz";
      values = { v: 3e8, lam: lamNm * 1e-9 };
      prompt = `Visible light of wavelength ${lamNm} nm travels at 3 × 10⁸ m/s. What is its frequency, in THz?${roundNote(2)}`;
      intro = "Use `f = c / λ` with 1 nm = 10⁻⁹ m and 1 THz = 10¹² Hz.";
      lines = [given("_c", 3e8, "m/s"), given("_lambda_nm", lamNm), step("_lambda", `_lambda_nm * 1e-9`, `${lamNm} × 10⁻⁹ m`), step("_f", "_c / _lambda", `${num4(exact)} × 10¹² Hz`), step("_f_THz", "_f / 1e12", final(exact, o, unit))];
      candidates = [exact * 10, exact / 10, lamNm / 300, exact * 1000];
    } else {
      const fk = rng.int(11, 400) / 10; // kHz
      const lamCm = rng.int(5, 500) / 10; // cm
      unknown = "v";
      scale = 1;
      exact = fk * 1000 * (lamCm / 100);
      unit = "m/s";
      values = { f: fk * 1000, lam: lamCm / 100 };
      prompt = `A wave has a frequency of ${num(fk)} kHz and a wavelength of ${num(lamCm)} cm. What is its speed, in m/s?${roundNote(2)}`;
      intro = "Use `v = f × λ` with the frequency in Hz (× 1000) and the wavelength in metres (÷ 100).";
      lines = [given("_f_kHz", fk), step("_f", `_f_kHz * 1000`, `${num(fk * 1000)} Hz`), given("_lambda_cm", lamCm), step("_lambda", `_lambda_cm / 100`, `${num(lamCm / 100)} m`), step("_v", "_f * _lambda", final(exact, o, unit))];
      candidates = [fk * lamCm, exact * 100, exact / 10, (fk * 1000) / (lamCm / 100)];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind, unknown, scale, values } };
  return finish(base, exact, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Period and frequency: T = 1 / f, counting waves, oscilloscope traces.
// Values in SI; `scale` converts the answer unit to SI.

function genPeriod(d, rng) {
  checkDifficulty(d);
  let kind, prompt, exact, unit, intro, lines, candidates, values, o, scale = 1;

  if (d === "easy") {
    o = { dp: 6, rounded: false };
    kind = rng.pick(["T", "f", "count", "f-count"]);
    if (kind === "T") {
      const f = rng.pick([1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 200, 250, 500]);
      exact = 1 / f;
      unit = "s";
      values = { f };
      prompt = `A wave has a frequency of ${f} Hz. What is its period, in s?${EXACT}`;
      intro = "The period is the time for one complete wave: `T = 1 / f`.";
      lines = [given("_f", f, "Hz"), step("_T", "1 / _f", final(exact, o, unit))];
      candidates = [f, 10 / f, 1 / (2 * f), 100 / f];
    } else if (kind === "f") {
      const T = rng.pick([0.01, 0.02, 0.04, 0.05, 0.1, 0.125, 0.2, 0.25, 0.5, 1, 2, 4, 5, 10]);
      exact = 1 / T;
      unit = "Hz";
      values = { T };
      prompt = `A wave has a period of ${num(T)} s. What is its frequency, in Hz?${EXACT}`;
      intro = "Frequency is the number of waves per second: `f = 1 / T`.";
      lines = [given("_T", T, "s"), step("_f", "1 / _T", final(exact, o, unit))];
      candidates = [T, 10 / T, 2 / T, 100 * T];
    } else if (kind === "count") {
      const f = rng.int(2, 50);
      const t = rng.int(2, 60);
      exact = f * t;
      unit = "waves";
      values = { f, t };
      prompt = `A source makes waves at ${f} Hz. How many complete waves does it make in ${t} s?${EXACT}`;
      intro = "Frequency is waves per second, so the number of waves is `N = f × t`.";
      lines = [given("_f", f, "Hz"), given("_time", t, "s"), step("_N", "_f * _time", final(exact, o, unit))];
      candidates = [f + t, f * t * 2, f * (t - 1)];
    } else {
      const f = rng.int(1, 30);
      const t = rng.int(2, 20);
      const N = f * t;
      exact = f;
      unit = "Hz";
      values = { N, t };
      prompt = `${N} complete waves pass a point in ${t} s. What is the frequency, in Hz?${EXACT}`;
      intro = "Frequency is the number of waves per second: `f = N / t`.";
      lines = [given("_N", N), given("_time", t, "s"), step("_f", "_N / _time", final(exact, o, unit))];
      candidates = [N * t, t, N - t, 2 * f];
    }
  } else if (d === "medium") {
    o = { dp: 6, rounded: false };
    kind = rng.pick(["T-ms", "f-ms", "T-us", "scope"]);
    if (kind === "T-ms") {
      const f = rng.pick([2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 125, 200, 250, 400, 500, 800, 1000, 2000]);
      exact = 1000 / f;
      unit = "ms";
      scale = 1e-3;
      kind = "T";
      values = { f };
      prompt = `A vibration has a frequency of ${f} Hz. What is its period, in milliseconds (ms)?${EXACT}`;
      intro = "Use `T = 1 / f` to get seconds, then multiply by 1000 for milliseconds.";
      lines = [given("_f", f, "Hz"), step("_T", "1 / _f", `${num(1 / f)} s`), step("_T_ms", "_T * 1000", final(exact, o, unit))];
      candidates = [1 / f, f / 1000, 100 / f, 10000 / f];
    } else if (kind === "f-ms") {
      const Tms = rng.pick([0.5, 1, 2, 2.5, 4, 5, 8, 10, 12.5, 16, 20, 25, 40, 50, 80, 100, 125, 200, 250, 500]);
      exact = 1000 / Tms;
      unit = "Hz";
      kind = "f";
      values = { T: Tms / 1000 };
      prompt = `A wave has a period of ${num(Tms)} ms. What is its frequency, in Hz?${EXACT}`;
      intro = "Convert the period to seconds (÷ 1000), then use `f = 1 / T`.";
      lines = [given("_T_ms", Tms), step("_T", `_T_ms / 1000`, `${num(Tms / 1000)} s`), step("_f", "1 / _T", final(exact, o, unit))];
      candidates = [1 / Tms, Tms * 1000, 100 / Tms, 10000 / Tms];
    } else if (kind === "T-us") {
      const fk = rng.pick([1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 125, 200, 250, 500]);
      exact = 1000 / fk;
      unit = "μs";
      scale = 1e-6;
      kind = "T";
      values = { f: fk * 1000 };
      prompt = `An ultrasonic signal has a frequency of ${fk} kHz. What is its period, in microseconds (μs)?${EXACT}`;
      intro = "Convert to hertz (× 1000), use `T = 1 / f` for seconds, then multiply by 10⁶ for microseconds.";
      lines = [given("_f_kHz", fk), step("_f", `_f_kHz * 1000`, `${fk * 1000} Hz`), step("_T", "1 / _f", `${num(1 / (fk * 1000))} s`), step("_T_us", "_T * 1e6", final(exact, o, unit))];
      candidates = [1 / fk, exact * 1000, exact / 1000, 100 / fk];
    } else {
      const X = rng.pick([0.1, 0.2, 0.5, 1, 2, 5, 10]); // ms per division
      const div = rng.pick([1, 2, 2.5, 4, 5, 8]);
      const Tms = div * X;
      exact = 1000 / Tms;
      unit = "Hz";
      kind = "scope";
      if (!isClean(exact, 4)) return null;
      values = { div, X };
      prompt = `On an oscilloscope set to ${num(X)} ms per division, one complete wave spans ${num(div)} ${div === 1 ? "division" : "divisions"}. What is the frequency of the signal, in Hz?${EXACT}`;
      intro = "The period is divisions × time per division. Convert it to seconds, then use `f = 1 / T`.";
      lines = [given("_div", div), given("_X", X, "ms per division"), step("_T", "_div * _X / 1000", `${num(Tms / 1000)} s`), step("_f", "1 / _T", final(exact, o, unit))];
      candidates = [1 / Tms, Tms, 1000 / X, 1000 * div / X];
    }
  } else {
    o = { dp: 2, rounded: true };
    kind = rng.pick(["T-ms", "f-ms", "speed-T", "scope", "count-T"]);
    if (kind === "T-ms") {
      const f = rng.int(20, 900);
      exact = 1000 / f;
      unit = "ms";
      scale = 1e-3;
      kind = "T";
      values = { f };
      prompt = `A note has a frequency of ${f} Hz. What is its period, in milliseconds (ms)?${roundNote(2)}`;
      intro = "Use `T = 1 / f` for seconds, then multiply by 1000 for milliseconds.";
      lines = [given("_f", f, "Hz"), step("_T", "1 / _f", `${num(1 / f)} s`), step("_T_ms", "_T * 1000", final(exact, o, unit))];
      candidates = [f / 1000, 100 / f, 10000 / f, 1000 / (f + 1)];
    } else if (kind === "f-ms") {
      const Tms = rng.int(11, 500) / 10;
      exact = 1000 / Tms;
      unit = "Hz";
      kind = "f";
      values = { T: Tms / 1000 };
      prompt = `A vibration has a period of ${num(Tms)} ms. What is its frequency, in Hz?${roundNote(2)}`;
      intro = "Convert the period to seconds (÷ 1000), then use `f = 1 / T`.";
      lines = [given("_T_ms", Tms), step("_T", `_T_ms / 1000`, `${num(Tms / 1000)} s`), step("_f", "1 / _T", final(exact, o, unit))];
      candidates = [1 / Tms, 100 / Tms, 10000 / Tms, Tms * 10];
    } else if (kind === "speed-T") {
      const T = rng.int(15, 150) / 10;
      const lam = rng.int(10, 400) / 10;
      exact = lam / T;
      unit = "m/s";
      kind = "speed-T";
      values = { T, lam };
      prompt = `Ocean waves have a wavelength of ${num(lam)} m, and a new crest arrives every ${num(T)} s. What is the speed of the waves, in m/s?${roundNote(2)}`;
      intro = "The time between crests is the period, so `f = 1 / T` and `v = f × λ = λ / T`.";
      lines = [given("_lambda", lam, "m"), given("_T", T, "s"), step("_f", "1 / _T", `${num4(1 / T)} Hz`), step("_v", "_f * _lambda", final(exact, o, unit))];
      candidates = [lam * T, T / lam, lam / (2 * T), lam];
    } else if (kind === "scope") {
      const X = rng.pick([0.1, 0.2, 0.5, 1, 2, 5]);
      const div = rng.int(12, 95) / 10;
      const Tms = div * X;
      exact = 1000 / Tms;
      unit = "Hz";
      values = { div, X };
      prompt = `On an oscilloscope set to ${num(X)} ms per division, one complete wave spans ${num(div)} divisions. What is the frequency of the signal, in Hz?${roundNote(2)}`;
      intro = "The period is divisions × time per division. Convert it to seconds, then use `f = 1 / T`.";
      lines = [given("_div", div), given("_X", X, "ms per division"), step("_T", "_div * _X / 1000", `${num(Tms / 1000)} s`), step("_f", "1 / _T", final(exact, o, unit))];
      candidates = [1 / Tms, 1000 / X, (1000 * div) / X, 1000 / (div + X)];
    } else {
      const N = rng.int(12, 400);
      const t = rng.int(15, 600) / 10;
      exact = (1000 * t) / N;
      unit = "ms";
      scale = 1e-3;
      kind = "count-T";
      values = { N, t };
      prompt = `A pendulum-driven wave machine makes ${N} complete waves in ${num(t)} s. What is the period of the waves, in milliseconds (ms)?${roundNote(2)}`;
      intro = "The period is the time for one wave: `T = t / N`. Multiply by 1000 for milliseconds.";
      lines = [given("_N", N), given("_time", t, "s"), step("_T", "_time / _N", `${num4(t / N)} s`), step("_T_ms", "_T * 1000", final(exact, o, unit))];
      candidates = [(1000 * N) / t, t / N, (100 * t) / N, N / t];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `period-${kind}`, scale, values } };
  return finish(base, exact, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Refraction: n = c / v, Snell's law n1 sin θ1 = n2 sin θ2, critical angle sin C = n2 / n1.

const MEDIA = [
  ["water", 1.33], ["glass", 1.5], ["crown glass", 1.52], ["acrylic", 1.49], ["diamond", 2.42], ["ice", 1.31],
  ["ethanol", 1.36], ["glycerol", 1.47], ["sapphire", 1.77], ["flint glass", 1.62], ["quartz", 1.46], ["cubic zirconia", 2.15],
];
const C_NOTE = "the speed of light in a vacuum (and air) is 3.00 × 10⁸ m/s";
const ANG = "Angles are measured from the normal.";

function genRefraction(d, rng) {
  checkDifficulty(d);
  let kind, prompt, exact, unit, intro, lines, candidates, values, o;
  const angle = { dp: 1, rounded: true, maxVal: 90 };
  const index = { dp: 2, rounded: true };

  if (d === "easy") {
    kind = rng.pick(["n-from-v", "v-from-n", "n-from-angles"]);
    if (kind === "n-from-v") {
      const v = rng.int(120, 280) / 100;
      o = index;
      exact = 3 / v;
      unit = "";
      values = { v };
      prompt = `Light travels at ${num(v)} × 10⁸ m/s in a transparent material. What is the material's refractive index? Use the fact that ${C_NOTE}. The refractive index has no unit.${roundNote(2)}`;
      intro = "Refractive index = speed of light in vacuum ÷ speed in the material: `n = c / v`. The 10⁸ cancels.";
      lines = [given("_c_light", 3, "× 10⁸ m/s"), given("_v", v, "× 10⁸ m/s"), step("_n", "_c_light / _v", final(exact, o, unit))];
      candidates = [v / 3, 3 * v, 3 - v, 1 / v];
    } else if (kind === "v-from-n") {
      const [name, n] = rng.pick(MEDIA);
      o = index;
      exact = 3 / n;
      unit = "× 10⁸ m/s";
      values = { n };
      prompt = `${cap(name)} has a refractive index of ${num(n)}. How fast does light travel in it? Use the fact that ${C_NOTE}. Give the answer in units of 10⁸ m/s (for example, type 2.25 for 2.25 × 10⁸ m/s).${roundNote(2)}`;
      intro = "Rearrange `n = c / v` to `v = c / n`, working in units of 10⁸ m/s.";
      lines = [given("_c_light", 3, "× 10⁸ m/s"), given("_n", n), step("_v", "_c_light / _n", final(exact, o, unit))];
      candidates = [3 * n, n / 3, 3 - n, 1 / n];
    } else {
      const [name, n] = rng.pick(MEDIA);
      const i = rng.int(20, 80);
      const r = Math.round(asind(sind(i) / n));
      if (r < 8) return null;
      o = index;
      exact = sind(i) / sind(r);
      unit = "";
      values = { n1: 1, t1: i, t2: r, unknown: "n2" };
      kind = "snell";
      prompt = `A ray of light passes from air into a block of a transparent material. The angle of incidence is ${i}° and the angle of refraction is ${r}°. ${ANG} What is the refractive index of the material (no unit)? Take the refractive index of air as 1.00.${roundNote(2)}`;
      intro = "Snell's law from air: `n = sin i / sin r`. Make sure your calculator works in degrees.";
      lines = [given("_i", i, "°"), given("_r", r, "°"), step("_n", "sin(_i) / sin(_r)", final(exact, o, unit))];
      candidates = [sind(r) / sind(i), i / r, Math.cos(r * DEG) / Math.cos(i * DEG), sind(i - r) * 10];
    }
  } else if (d === "medium") {
    kind = rng.pick(["r-from-air", "critical", "n-from-critical", "i-from-r"]);
    if (kind === "r-from-air") {
      const [name, n] = rng.pick(MEDIA);
      const i = rng.int(10, 80);
      o = angle;
      exact = asind(sind(i) / n);
      unit = "°";
      values = { n1: 1, t1: i, n2: n, unknown: "t2" };
      kind = "snell";
      prompt = `A ray of light travels from air into ${name} (refractive index ${num(n)}) at an angle of incidence of ${i}°. ${ANG} What is the angle of refraction, in degrees? Take the refractive index of air as 1.00.${roundNote(1)}`;
      intro = "Snell's law `n1 sin θ1 = n2 sin θ2` with n1 = 1 for air gives `sin r = sin i / n`. Then take the inverse sine (in degrees).";
      lines = [given("_i", i, "°"), given("_n", n), step("_r", "asin(sin(_i) / _n)", final(exact, o, unit))];
      candidates = [i / n, sind(i) * n <= 1 ? asind(sind(i) * n) : 90 - i / n, 90 - exact, i - exact];
    } else if (kind === "critical") {
      const [name, n] = rng.pick(MEDIA);
      o = angle;
      exact = asind(1 / n);
      unit = "°";
      values = { n1: n, n2: 1, unknown: "C" };
      kind = "critical";
      prompt = `What is the critical angle for light going from ${name} (refractive index ${num(n)}) into air, in degrees? Take the refractive index of air as 1.00.${roundNote(1)}`;
      intro = "At the critical angle the refracted ray runs along the surface (90°), so `sin C = 1 / n` (for a boundary with air).";
      lines = [given("_n", n), step("_C", "asin(1 / _n)", final(exact, o, unit))];
      candidates = [90 - exact, 90 / n, Math.atan(1 / n) / DEG, asind(1 / (n + 0.2))];
    } else if (kind === "n-from-critical") {
      const C = rng.int(24, 55);
      o = index;
      exact = 1 / sind(C);
      unit = "";
      values = { t1: C, n2: 1, unknown: "n1" };
      kind = "critical";
      prompt = `A transparent material has a critical angle of ${C}° at its boundary with air. What is its refractive index (no unit)? Take the refractive index of air as 1.00.${roundNote(2)}`;
      intro = "The critical angle satisfies `sin C = 1 / n`, so `n = 1 / sin C`.";
      lines = [given("_C", C, "°"), step("_n", "1 / sin(_C)", final(exact, o, unit))];
      candidates = [sind(C), 1 / Math.cos(C * DEG), 90 / C, 1 / Math.tan(C * DEG)];
    } else {
      const [name, n] = rng.pick(MEDIA);
      const r = rng.int(8, 45);
      const s = n * sind(r);
      if (s > 0.97) return null;
      o = angle;
      exact = asind(s);
      unit = "°";
      values = { n1: 1, n2: n, t2: r, unknown: "t1" };
      kind = "snell";
      prompt = `A ray of light passes from air into ${name} (refractive index ${num(n)}). Inside the ${name} the angle of refraction is ${r}°. ${ANG} What was the angle of incidence in air, in degrees? Take the refractive index of air as 1.00.${roundNote(1)}`;
      intro = "Snell's law with n1 = 1 for air gives `sin i = n × sin r`. Then take the inverse sine (in degrees).";
      lines = [given("_r", r, "°"), given("_n", n), step("_i", "asin(_n * sin(_r))", final(exact, o, unit))];
      candidates = [r * n, asind(sind(r) / n), 90 - exact, r / n];
    }
  } else {
    kind = rng.pick(["two-media", "critical-two", "n2-from-angles", "v-from-critical"]);
    if (kind === "two-media") {
      const [a, n1] = rng.pick(MEDIA);
      const [b, n2] = rng.pick(MEDIA);
      if (n1 === n2) return null;
      const t1 = rng.int(50, 800) / 10;
      const s = (n1 * sind(t1)) / n2;
      if (s > 0.97) return null; // keeps clear of total internal reflection
      o = angle;
      exact = asind(s);
      unit = "°";
      values = { n1, t1, n2, unknown: "t2" };
      kind = "snell";
      prompt = `A ray of light passes from ${a} (refractive index ${num(n1)}) into ${b} (refractive index ${num(n2)}) at an angle of incidence of ${num(t1)}°. ${ANG} What is the angle of refraction, in degrees?${roundNote(1)}`;
      intro = "Use Snell's law `n1 sin θ1 = n2 sin θ2`, so `sin θ2 = n1 sin θ1 / n2`. Then take the inverse sine (in degrees).";
      lines = [given("_n1", n1), given("_t1", t1, "°"), given("_n2", n2), step("_t2", "asin(_n1 * sin(_t1) / _n2)", final(exact, o, unit))];
      const flip = (n2 * sind(t1)) / n1;
      candidates = [flip <= 1 ? asind(flip) : (t1 * n1) / n2, (t1 * n1) / n2, 90 - exact, Math.abs(t1 - exact) > 1 ? t1 : exact + 5];
    } else if (kind === "critical-two") {
      const [a, n1] = rng.pick(MEDIA);
      const [b, n2] = rng.pick(MEDIA);
      if (!(n1 > n2) || n2 / n1 > 0.97) return null;
      o = angle;
      exact = asind(n2 / n1);
      unit = "°";
      values = { n1, n2, unknown: "C" };
      kind = "critical";
      prompt = `Light travels inside ${a} (refractive index ${num(n1)}) towards a boundary with ${b} (refractive index ${num(n2)}). What is the critical angle at this boundary, in degrees?${roundNote(1)}`;
      intro = "Total internal reflection can only happen going into the lower index. At the critical angle θ2 = 90°, so `sin C = n2 / n1`.";
      lines = [given("_n1", n1), given("_n2", n2), step("_C", "asin(_n2 / _n1)", final(exact, o, unit))];
      candidates = [asind(1 / n1), 90 - exact, (90 * n2) / n1, asind(1 / n2)];
    } else if (kind === "n2-from-angles") {
      const [a, n1] = rng.pick(MEDIA);
      const t1 = rng.int(15, 70);
      const n2true = rng.int(110, 250) / 100;
      const t2 = Math.round(asind((n1 * sind(t1)) / n2true));
      if (!(t2 >= 8 && t2 <= 80) || t2 === t1 || (n1 * sind(t1)) / n2true > 0.97) return null;
      o = index;
      exact = (n1 * sind(t1)) / sind(t2);
      unit = "";
      values = { n1, t1, t2, unknown: "n2" };
      kind = "snell";
      prompt = `A ray of light passes from ${a} (refractive index ${num(n1)}) into an unknown transparent material. The angle of incidence is ${t1}° and the angle of refraction is ${t2}°. ${ANG} What is the refractive index of the material (no unit)?${roundNote(2)}`;
      intro = "Rearrange Snell's law `n1 sin θ1 = n2 sin θ2` to `n2 = n1 sin θ1 / sin θ2`.";
      lines = [given("_n1", n1), given("_t1", t1, "°"), given("_t2", t2, "°"), step("_n2", "_n1 * sin(_t1) / sin(_t2)", final(exact, o, unit))];
      candidates = [(n1 * sind(t2)) / sind(t1), sind(t1) / sind(t2), (n1 * t1) / t2, n1];
    } else {
      const C = rng.int(240, 600) / 10;
      o = index;
      exact = 3 * sind(C);
      unit = "× 10⁸ m/s";
      values = { C };
      kind = "v-from-critical";
      prompt =
        `A transparent material has a critical angle of ${num(C)}° at its boundary with air (refractive index 1.00). How fast does light travel in the material? ` +
        `Use the fact that ${C_NOTE}. Give the answer in units of 10⁸ m/s (for example, type 2.25 for 2.25 × 10⁸ m/s).${roundNote(2)}`;
      intro = "First find the refractive index from `sin C = 1 / n`, then the speed from `v = c / n`. (Together: `v = c × sin C`.)";
      lines = [given("_C", C, "°"), step("_n", "1 / sin(_C)", num4(1 / sind(C))), given("_c_light", 3, "× 10⁸ m/s"), step("_v", "_c_light / _n", final(exact, o, unit))];
      candidates = [3 / sind(C), 3 * Math.cos(C * DEG), 1 / sind(C), sind(C)];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `refr-${kind}`, values } };
  return finish(base, exact, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------
// Thin lenses: 1/f = 1/u + 1/v, real-is-positive convention. Distances in cm.

const LENS_RULE =
  "Use `1/f = 1/u + 1/v` with the real-is-positive convention: the object distance u is positive, " +
  "a real image has a positive image distance v and a virtual image a negative v, and a converging lens has a positive focal length f (a diverging lens a negative one).";
const MAG_RULE = "Magnification here means the size ratio image height ÷ object height = |v| ÷ u, always given as a positive number.";

// A converging-lens case with whole-number u, v and f (real image).
function integerLens(rng) {
  for (let t = 0; t < 300; t++) {
    const f = rng.int(4, 30);
    const u = rng.int(f + 1, 6 * f);
    const v = (u * f) / (u - f);
    if (Number.isInteger(v) && v <= 300) return { f, u, v };
  }
  return rng.pick([{ f: 10, u: 15, v: 30 }, { f: 12, u: 20, v: 30 }, { f: 20, u: 30, v: 60 }, { f: 6, u: 10, v: 15 }]);
}

function genLenses(d, rng) {
  checkDifficulty(d, ["medium", "hard"]);
  let kind, prompt, exact, unit = "cm", intro, lines, candidates, values, o;

  if (d === "medium") {
    kind = rng.pick(["v", "f", "u", "mag"]);
    const { f, u, v } = integerLens(rng);
    o = { dp: 6, rounded: false };
    if (kind === "v") {
      exact = v;
      values = { u, f };
      prompt = `An object is placed ${u} cm from a converging lens of focal length ${f} cm. ${LENS_RULE} What is the image distance v, in cm?${EXACT}`;
      intro = "Rearrange to `1/v = 1/f - 1/u`, then take the reciprocal.";
      lines = [given("_f", f, "cm"), given("_u", u, "cm"), step("_v", "1 / (1/_f - 1/_u)", final(exact, o, unit))];
      candidates = [u - f, u + f, (u * f) / (u + f), -v];
    } else if (kind === "f") {
      exact = f;
      values = { u, v };
      prompt = `A converging lens forms a real image ${v} cm from the lens when the object is ${u} cm from it. ${LENS_RULE} What is the focal length f, in cm?${EXACT}`;
      intro = "Add the reciprocals: `1/f = 1/u + 1/v`, then take the reciprocal.";
      lines = [given("_u", u, "cm"), given("_v", v, "cm"), step("_f", "1 / (1/_u + 1/_v)", final(exact, o, unit))];
      candidates = [u + v, Math.abs(v - u), (u + v) / 2, (u * v) / Math.abs(v - u)];
    } else if (kind === "u") {
      exact = u;
      values = { f, v };
      prompt = `A converging lens of focal length ${f} cm forms a real image ${v} cm from the lens. ${LENS_RULE} How far from the lens is the object (u), in cm?${EXACT}`;
      intro = "Rearrange to `1/u = 1/f - 1/v`, then take the reciprocal.";
      lines = [given("_f", f, "cm"), given("_v", v, "cm"), step("_u", "1 / (1/_f - 1/_v)", final(exact, o, unit))];
      candidates = [v - f, v + f, (v * f) / (v + f), u * 2];
    } else {
      o = { dp: 2, rounded: true };
      exact = v / u;
      unit = "";
      values = { u, f };
      prompt = `An object is placed ${u} cm from a converging lens of focal length ${f} cm. ${LENS_RULE} ${MAG_RULE} What is the magnification (no unit)?${roundNote(2)}`;
      intro = "Find the image distance from the lens equation, then divide by the object distance.";
      lines = [given("_f", f, "cm"), given("_u", u, "cm"), step("_v", "1 / (1/_f - 1/_u)", `${num(v)} cm`), step("_m", "abs(_v) / _u", final(exact, o, unit))];
      candidates = [u / v, f / u, v / f, (u - f) / f];
    }
  } else {
    kind = rng.pick(["v-virtual", "v-diverging", "v-real", "f-from-uv", "height", "power"]);
    o = { dp: 2, rounded: true, allowNeg: true };
    if (kind === "v-virtual" || kind === "v-diverging" || kind === "v-real") {
      let f, u;
      if (kind === "v-virtual") {
        f = rng.int(80, 400) / 10;
        u = rng.int(20, Math.floor(f * 9)) / 10;
        if (!(u <= 0.9 * f && u >= 1)) return null;
      } else if (kind === "v-diverging") {
        f = -rng.int(50, 400) / 10;
        u = rng.int(30, 800) / 10;
      } else {
        f = rng.int(50, 300) / 10;
        u = rng.int(Math.ceil(f * 11), Math.floor(f * 60)) / 10;
        if (!(u >= 1.1 * f)) return null;
      }
      exact = (u * f) / (u - f);
      values = { u, f };
      kind = "v";
      const lensWord = f > 0 ? "converging" : "diverging";
      prompt = `An object is placed ${num(u)} cm from a ${lensWord} lens of focal length ${num(f)} cm. ${LENS_RULE} What is the image distance v, in cm (include a minus sign if the image is virtual)?${roundNote(2)}`;
      intro = "Rearrange to `1/v = 1/f - 1/u` and take the reciprocal. A negative result means a virtual image on the same side as the object.";
      lines = [given("_f", f, "cm"), given("_u", u, "cm"), step("_v", "1 / (1/_f - 1/_u)", final(exact, o, unit))];
      candidates = [-exact, (u * f) / (u + f), u - f, 1 / (1 / f + 1 / u)];
    } else if (kind === "f-from-uv") {
      const virtual = rng.next() < 0.5;
      const u = rng.int(30, 400) / 10;
      const vAbs = virtual ? rng.int(Math.ceil(u * 12), Math.floor(u * 50)) / 10 : rng.int(30, 800) / 10;
      const v = virtual ? -vAbs : vAbs;
      exact = (u * v) / (u + v);
      if (!(exact > 0)) return null;
      values = { u, v };
      kind = "f";
      prompt =
        `A converging lens forms a ${virtual ? "virtual" : "real"} image ${num(vAbs)} cm from the lens when the object is ${num(u)} cm away. ` +
        `${LENS_RULE} What is the focal length f, in cm?${roundNote(2)}`;
      intro = `Use \`1/f = 1/u + 1/v\`${virtual ? " with v negative because the image is virtual" : ""}, then take the reciprocal.`;
      lines = [given("_u", u, "cm"), given("_v", v, "cm"), step("_f", "1 / (1/_u + 1/_v)", final(exact, o, unit))];
      candidates = [(u * vAbs) / (u + vAbs), (u * vAbs) / Math.abs(vAbs - u), -exact, (u + vAbs) / 2, u + vAbs];
    } else if (kind === "height") {
      const f = rng.int(50, 300) / 10;
      const virtual = rng.next() < 0.4;
      const u = virtual ? rng.int(10, Math.floor(f * 9)) / 10 : rng.int(Math.ceil(f * 11), Math.floor(f * 50)) / 10;
      if (virtual ? !(u <= 0.9 * f && u >= 1) : !(u >= 1.1 * f)) return null;
      const h = rng.int(5, 100) / 10;
      const v = (u * f) / (u - f);
      exact = (h * Math.abs(v)) / u;
      values = { h, u, f };
      kind = "height";
      o = { dp: 2, rounded: true };
      prompt =
        `An object ${num(h)} cm tall stands ${num(u)} cm from a converging lens of focal length ${num(f)} cm. ${LENS_RULE} ` +
        `How tall is the image, in cm (as a positive size)?${roundNote(2)}`;
      intro = "Find v from the lens equation, then scale the height by the size ratio `|v| / u`.";
      lines = [given("_f", f, "cm"), given("_u", u, "cm"), given("_h", h, "cm"), step("_v", "1 / (1/_f - 1/_u)", `${num4(v)} cm`), step("_h_img", "_h * abs(_v) / _u", final(exact, o, unit))];
      candidates = [(h * u) / Math.abs(v), (h * f) / u, h * Math.abs(v), h + Math.abs(v) - u];
    } else {
      const fcm = (rng.next() < 0.6 ? 1 : -1) * rng.int(30, 800) / 10;
      exact = 100 / fcm;
      unit = "D";
      values = { f: fcm };
      kind = "power";
      prompt =
        `A ${fcm > 0 ? "converging" : "diverging"} lens has a focal length of ${num(fcm)} cm (negative for a diverging lens). ` +
        `What is its power, in dioptres (D)? Power = 1 / f with f in metres, so a diverging lens has a negative power.${roundNote(2)}`;
      intro = "Convert the focal length to metres (÷ 100), then `P = 1 / f`.";
      lines = [step("_f", `${num(fcm)} / 100`, `${num(fcm / 100)} m`), step("_P", "1 / _f", final(exact, o, unit))];
      candidates = [1 / fcm, -exact, fcm / 100, 10 / fcm];
    }
  }

  const base = { prompt, explanation: explain(intro, lines), params: { kind: `lens-${kind}`, values } };
  return finish(base, exact, o, candidates, rng);
}

// ---------------------------------------------------------------------------------------------

const GENERATORS = { "wave-equation": genWaveEquation, period: genPeriod, refraction: genRefraction, lenses: genLenses };

// ---------------------------------------------------------------------------------------------
// Expert level: a separate branch. generate() sends "expert" here before any other code runs (and
// before withHints, which is built for single answers), so easy/medium/hard draw exactly the same
// rng values as before. Expert questions are multi-part, state the rounding on every part, carry
// their own hints, and keep their inputs in params.v with params.kind "x-…". verify() recomputes the
// true values a different way (bisection on Snell's law or the lens equation, time per wave instead
// of waves per second) and compares each part. Hint code never calls rng.

// Round half away from zero to dp decimals; never "-0".
function xr(n, dp) {
  const f = 10 ** dp;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
}
// Display form for stated values and working: up to 4 decimals.
const xs = (n) => String(xr(n, 4));
// True when n sits within 2% of a unit of a rounding tie at dp decimals.
function xTie(n, dp) {
  const f = Math.abs(n) * 10 ** dp;
  return Math.abs(f - Math.floor(f) - 0.5) < 0.02;
}
const xDpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);

// A rounded numeric part (accepted within half a unit of the stated precision).
const xNum = (id, label, ask, exact, dp, hint) => ({
  id, label, ask: `${ask}, ${xDpWord(dp)}`, answerType: "number", answer: xr(exact, dp), tolerance: 0.5 * 10 ** -dp, hint, _exact: exact, _dp: dp,
});
// A choice part.
const xChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });

// Assemble a multi-part question. Returns null (regenerate) on a rounding tie, a zero or
// non-finite answer, a given value equal to an answer, or NaN/undefined in the text.
// "a 8 kg" -> "an 8 kg" (eight, eleven, eighteen, eighty... start with a vowel sound).
function xArticles(text) {
  return text.replace(/\b([Aa]n?) (\d+)/g, (all, art, digits) => {
    const vowel = digits[0] === "8" || (digits.length % 3 === 2 && /^1[18]/.test(digits));
    return `${art[0] === "A" ? (vowel ? "An" : "A") : vowel ? "an" : "a"} ${digits}`;
  });
}

function xMulti({ kind, v, prompt, parts, steps, given, hints }) {
  prompt = xArticles(prompt);
  const dp = {};
  const out = [];
  for (const p of parts) {
    const { _exact, _dp, ...part } = p;
    part.id = part.id.toLowerCase(); // ids must match ^[a-z0-9-]+$
    if (part.answerType === "number") {
      if (!Number.isFinite(_exact) || part.answer === 0) return null;
      if (_dp === null ? !Number.isInteger(_exact) : xTie(_exact, _dp)) return null;
      if (given.some(([, g]) => Math.abs(g - part.answer) < 1e-9)) return null;
      dp[part.id] = _dp;
    } else {
      if (!part.choices.includes(part.answer) || new Set(part.choices).size !== part.choices.length) return null;
      dp[part.id] = "choice";
    }
    out.push(part);
  }
  const text = [prompt, ...steps, ...hints, ...out.map((p) => `${p.ask} ${p.hint} ${p.answer}`)].join(" ");
  if (/NaN|undefined|Infinity/.test(text)) return null;
  return {
    prompt,
    answerType: "multi",
    parts: out,
    explanation: steps.join("\n\n"),
    params: { kind, v, dp },
    given: given.map(([label, value]) => ({ label, value })),
    hints,
  };
}

// Bisection: a root of f between lo and hi (f must change sign), else NaN.
function xRoot(f, lo, hi) {
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || Math.sign(fa) === Math.sign(fb)) return NaN;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

// Check every part against the independently recomputed truth { partId: number | string }.
function xVerify(question, answer, truthFns) {
  const p = question.params;
  const fn = truthFns[p.kind];
  if (!fn || !p.v || !p.dp) return false;
  if (question.answerType !== "multi" || !Array.isArray(question.parts) || !answer || typeof answer !== "object") return false;
  let truth;
  try {
    truth = fn(p.v);
  } catch {
    return false;
  }
  if (truth) truth = Object.fromEntries(Object.entries(truth).map(([k, x]) => [k.toLowerCase(), x]));
  if (!truth || Object.keys(truth).length !== question.parts.length) return false;
  for (const part of question.parts) {
    if (!(part.id in truth)) return false;
    const want = truth[part.id];
    const got = answer[part.id];
    if (typeof want === "string") {
      const ch = part.choices;
      if (!Array.isArray(ch) || new Set(ch).size !== ch.length || !ch.includes(String(got)) || String(got) !== want) return false;
      continue;
    }
    if (got === "" || got === null || got === undefined || typeof got === "boolean" || typeof got === "object") return false;
    const x = Number(got);
    if (!Number.isFinite(x) || !Number.isFinite(want)) return false;
    const dp = p.dp[part.id];
    if (dp === null) {
      if (Math.abs(x - want) > 1e-9 * Math.max(1, Math.abs(want))) return false;
    } else if (typeof dp !== "number" || Math.abs(x - want) > 0.5 * 10 ** -dp + 1e-9) return false;
  }
  return true;
}

// Retry a template until it returns a question (deterministic: only the rng passed in).
function xTry(make, rng) {
  for (let i = 0; i < 80; i++) {
    const q = make(rng);
    if (q) return q;
  }
  throw new Error("Expert: could not generate a question");
}

const X_UNROUNDED = "Use unrounded values from earlier parts.";

// wave-equation / expert: sonar; speed from f and λ, then a depth from the echo time.
function xSonar(rng) {
  const who = rng.pick(["A ship's sonar", "A fishing boat's echo sounder", "A survey vessel", "A submarine's sonar"]);
  const fk = rng.int(10, 200) / 2; // kHz
  const v = rng.int(1440, 1540);
  const lamcm = (v / (fk * 1000)) * 100;
  const lamShown = xr(lamcm, 2);
  const vv = fk * 1000 * (lamShown / 100);
  const t = rng.int(20, 800) / 100;
  const depth = (vv * t) / 2;
  return xMulti({
    kind: "x-sonar",
    v: { fk, lam: lamShown, t },
    prompt: `${who} sends out ${xs(fk)} kHz pulses. In seawater their wavelength is ${xs(lamShown)} cm. An echo from the seabed arrives ${xs(t)} s after a pulse is sent. ${X_UNROUNDED}`,
    parts: [
      xNum("v", "Speed", "Speed of sound in the seawater, in m/s", vv, 0, "v = f × λ with f in Hz and λ in m."),
      xNum("depth", "Depth", "Depth of the water, in m", depth, 1, "The echo time covers the trip down and back up."),
    ],
    steps: [
      `Convert: ${xs(fk)} kHz = ${xs(fk * 1000)} Hz and ${xs(lamShown)} cm = ${xs(lamShown / 100)} m.`,
      `\`_v = _f_kHz * 1000 * _lam_cm / 100\` → ${xs(vv)}, which rounds to **${xr(vv, 0)} m/s**.`,
      `The pulse travels down and back: \`_v * _t / 2\` → ${xs(depth)}, which rounds to **${xr(depth, 1)} m**.`,
    ],
    given: [["_f_kHz", fk], ["_lam_cm", lamShown], ["_t", t]],
    hints: [
      "Convert to SI first: kHz × 1000 for Hz, cm ÷ 100 for m. Then use v = f × λ.",
      "Distance travelled by the pulse = speed × echo time.",
      "That distance is there and back, so the depth is half of it.",
    ],
  });
}

const X_BOUNDARIES = [
  ["water waves", "deep water", "shallow water", 5, 40, 0.3, 0.8],
  ["sound", "air", "water", 3300, 3500, 4.2, 4.5],
  ["sound", "air", "steel", 3300, 3500, 14, 18],
  ["a wave on a rope", "a thick rope", "a thin rope", 20, 80, 1.3, 2.5],
];

// wave-equation / expert: crossing a boundary keeps the frequency; the wavelength changes with speed.
function xBoundary(rng) {
  const [what, m1, m2, vlo, vhi, rlo, rhi] = rng.pick(X_BOUNDARIES);
  const v1 = what === "sound" ? rng.int(vlo, vhi) / 10 : rng.int(vlo, vhi) / 10;
  const ratio = rng.int(Math.round(rlo * 100), Math.round(rhi * 100)) / 100;
  const v2 = xr(v1 * ratio, 1);
  const lam1 = rng.int(5, 300) / 100;
  const f = v1 / lam1;
  const lam2 = v2 / f;
  const D = xr(lam2 * rng.int(15, 60), 0);
  const n = D / lam2;
  return xMulti({
    kind: "x-boundary",
    v: { v1, lam1, v2, D },
    prompt: `When ${what} travel${what === "sound" || what === "a wave on a rope" ? "s" : ""} in ${m1}, the speed is ${xs(v1)} m/s and the wavelength is ${xs(lam1)} m. The wave then passes into ${m2}, where its speed is ${xs(v2)} m/s. ${X_UNROUNDED}`,
    parts: [
      xNum("f", "Frequency", `Frequency in ${m2}, in Hz`, f, 2, "The frequency is set by the source, so it does not change at a boundary."),
      xNum("lam2", "New wavelength", `Wavelength in ${m2}, in m`, lam2, 3, "λ = v ÷ f with the new speed and the same frequency."),
      xNum("n", "Waves", `Number of whole and part wavelengths in ${D} m of ${m2}`, n, 1, "Divide the distance by the new wavelength."),
    ],
    steps: [
      `\`_f = _v1 / _lam1\` → ${xs(f)} Hz, which rounds to **${xr(f, 2)} Hz**. It stays the same in ${m2}.`,
      `\`_lam2 = _v2 / _f\` → ${xs(lam2)}, which rounds to **${xr(lam2, 3)} m**. (Equivalently λ2 = λ1 × v2 ÷ v1.)`,
      `\`${D} / _lam2\` → ${xs(n)}, which rounds to **${xr(n, 1)}**.`,
    ],
    given: [["_v1", v1], ["_lam1", lam1], ["_v2", v2]],
    hints: [
      "At a boundary the speed and wavelength change, but the frequency stays the same.",
      "Find the frequency from the first medium: f = v ÷ λ.",
      "Then use the new speed with that same frequency for the new wavelength.",
    ],
  });
}

// wave-equation / expert: an FM station; wavelength, quarter-wave aerial and travel time.
function xRadio(rng) {
  const fM = rng.int(880, 1080) / 10;
  const dkm = rng.int(5, 400);
  const lam = 3e8 / (fM * 1e6);
  const quarter = (lam / 4) * 100;
  const tms = ((dkm * 1000) / 3e8) * 1000;
  return xMulti({
    kind: "x-radio",
    v: { fM, dkm },
    prompt: `An FM radio station broadcasts at ${xs(fM)} MHz. Radio waves travel at 3.00 × 10⁸ m/s. A simple aerial is a quarter of a wavelength long. A listener is ${dkm} km from the transmitter. ${X_UNROUNDED}`,
    parts: [
      xNum("lam", "Wavelength", "Wavelength, in m", lam, 3, "λ = c ÷ f with f in Hz (MHz × 10⁶)."),
      xNum("aerial", "Aerial length", "Length of a quarter-wave aerial, in cm", quarter, 1, "A quarter of the wavelength, then m × 100 for cm."),
      xNum("time", "Travel time", "Time for the signal to reach the listener, in ms", tms, 3, "Time = distance ÷ speed, with the distance in m; then s × 1000 for ms."),
    ],
    steps: [
      `\`_lam = 3e8 / (_f_MHz * 1e6)\` → ${xs(lam)}, which rounds to **${xr(lam, 3)} m**.`,
      `\`_lam / 4 * 100\` → ${xs(quarter)}, which rounds to **${xr(quarter, 1)} cm**.`,
      `\`_d_km * 1000 / 3e8 * 1000\` → ${xs(tms)}, which rounds to **${xr(tms, 3)} ms**.`,
    ],
    given: [["_f_MHz", fM], ["_d_km", dkm]],
    hints: [
      "Convert MHz to Hz (× 10⁶) and use λ = c ÷ f, with c = 3 × 10⁸ m/s. In the calculator, 3e8 means 3 × 10⁸.",
      "The aerial is a quarter of that wavelength.",
      "The travel time uses the speed of the wave, not its frequency: distance ÷ speed.",
    ],
  });
}

// period / expert: a bobbing boat gives the period; with the crest spacing, the speed and a travel time.
function xBob(rng) {
  const thing = rng.pick(["A moored boat", "A buoy", "A floating duck", "A fishing float", "A surfer waiting for waves"]);
  const N = rng.int(5, 30);
  const t = rng.int(N * 15, N * 120) / 10;
  const lam = rng.int(10, 400) / 10;
  const X = rng.int(20, 500);
  const T = t / N;
  const v = lam / T;
  const tx = X / v;
  return xMulti({
    kind: "x-bob",
    v: { N, t, lam, X },
    prompt: `${thing} rises and falls ${N} times in ${xs(t)} s as waves pass. The crests are ${xs(lam)} m apart. ${X_UNROUNDED}`,
    parts: [
      xNum("T", "Period", "Period of the waves, in s", T, 2, "The period is the time for one complete wave: total time ÷ number of waves."),
      xNum("v", "Speed", "Speed of the waves, in m/s", v, 2, "In one period a crest moves forward one wavelength: v = λ ÷ T."),
      xNum("tx", "Travel time", `Time for a crest to travel ${X} m, in s`, tx, 1, "Time = distance ÷ speed."),
    ],
    steps: [
      `\`_T = _t / _N\` → ${xs(T)}, which rounds to **${xr(T, 2)} s**.`,
      `\`_v = _lam / _T\` → ${xs(v)}, which rounds to **${xr(v, 2)} m/s**.`,
      `\`${X} / _v\` → ${xs(tx)}, which rounds to **${xr(tx, 1)} s**.`,
    ],
    given: [["_N", N], ["_t", t], ["_lam", lam]],
    hints: [
      "Each rise and fall is one complete wave passing.",
      "The distance between crests is the wavelength, and one wavelength passes in one period.",
      "Speed = wavelength ÷ period (or wavelength × frequency).",
    ],
  });
}

// period / expert: something spinning; rpm to Hz and ms, then backwards from a period to rpm.
function xRpm(rng) {
  const what = rng.pick(["A ceiling fan", "A washing machine drum", "A car engine", "A drill", "A record turntable", "A wind turbine"]);
  const rpm = rng.int(30, 6000);
  const f = rpm / 60;
  const Tms = 1000 / f;
  const T2 = rng.int(50, 20000) / 10; // ms
  const rpm2 = 60000 / T2;
  return xMulti({
    kind: "x-rpm",
    v: { rpm, T2 },
    prompt: `${what} turns at ${rpm} revolutions per minute (rpm). ${X_UNROUNDED}`,
    parts: [
      xNum("f", "Frequency", "Frequency of rotation, in Hz", f, 2, "rpm counts turns per minute; Hz counts per second. Divide by 60."),
      xNum("T", "Period", "Time for one turn, in ms", Tms, 2, "T = 1 ÷ f gives seconds; × 1000 for ms."),
      xNum("rpm2", "Speed needed", `Speed in rpm that would give one turn every ${xs(T2)} ms`, rpm2, 1, "Work backwards: convert the period to seconds, take 1 ÷ T for Hz, then × 60."),
    ],
    steps: [
      `\`_f = _rpm / 60\` → ${xs(f)}, which rounds to **${xr(f, 2)} Hz**.`,
      `\`1 / _f * 1000\` → ${xs(Tms)}, which rounds to **${xr(Tms, 2)} ms**.`,
      `\`60 / (_T2_ms / 1000)\` → ${xs(rpm2)}, which rounds to **${xr(rpm2, 1)} rpm**.`,
    ],
    given: [["_rpm", rpm], ["_T2_ms", T2]],
    hints: [
      "Turns per minute ÷ 60 = turns per second, which is the frequency in Hz.",
      "Period and frequency are reciprocals, and the period must be converted between s and ms.",
      "For the last part go the other way: ms → s, then 1 ÷ T, then × 60.",
    ],
  });
}

// period / expert: an oscilloscope trace of a sound; frequency, wavelength in air, and the timebase for a target view.
function xScope(rng) {
  const k = rng.int(15, 80) / 10; // divisions per cycle
  const tb = rng.pick([0.1, 0.2, 0.5, 1, 2, 5]); // ms/div
  const T = (k * tb) / 1000;
  const f = 1 / T;
  if (f < 20 || f > 20000) return null;
  const lam = 340 / f;
  const cycles = rng.int(2, 6);
  const tb2 = (cycles * T * 1000) / 10;
  return xMulti({
    kind: "x-scope",
    v: { k, tb, cycles },
    prompt: `A microphone feeds a sound into an oscilloscope set to ${xs(tb)} ms per division. One complete cycle spans ${xs(k)} divisions. The screen is 10 divisions wide, and sound travels at 340 m/s in air. ${X_UNROUNDED}`,
    parts: [
      xNum("f", "Frequency", "Frequency of the sound, in Hz", f, 1, "Period = divisions × time per division, converted to seconds; then f = 1 ÷ T."),
      xNum("lam", "Wavelength", "Wavelength in air, in m", lam, 3, "λ = v ÷ f."),
      xNum("tb2", "Timebase", `Time per division (in ms) that would show exactly ${cycles} cycles across the screen`, tb2, 3, "Work backwards: the screen must show that many periods across its 10 divisions."),
    ],
    steps: [
      `\`_T = _div * _tb_ms / 1000\` → ${xs(T * 1000)} ms = ${String(xr(T, 7))} s. \`1 / _T\` → ${xs(f)}, which rounds to **${xr(f, 1)} Hz**.`,
      `\`340 / _f\` → ${xs(lam)}, which rounds to **${xr(lam, 3)} m**.`,
      `${cycles} cycles take ${xs(cycles * T * 1000)} ms, spread over 10 divisions: \`${cycles} * _T * 1000 / 10\` → ${xs(tb2)}, which rounds to **${xr(tb2, 3)} ms per division**.`,
    ],
    given: [["_div", k], ["_tb_ms", tb]],
    hints: [
      "The period is the time for one cycle: number of divisions × time per division. Convert ms to s.",
      "Frequency = 1 ÷ period; wavelength = speed ÷ frequency.",
      "For the new setting, find the total time for the cycles you want, then share it over the 10 divisions.",
    ],
  });
}

const X_LOW = [["water", 1.33], ["air", 1]];

// refraction / expert: from glass-like media into water; the angle and the critical angle.
function xTwoMedia(rng) {
  const hi = rng.pick(MEDIA.filter(([, n]) => n >= 1.4));
  const n2 = 1.33;
  const C = Math.asin(n2 / hi[1]) / DEG;
  const t1 = rng.int(10, Math.floor(C) - 3);
  const t2 = Math.asin((hi[1] * Math.sin(t1 * DEG)) / n2) / DEG;
  return xMulti({
    kind: "x-twomedia",
    v: { n1: hi[1], t1 },
    prompt: `Light travels from ${hi[0]} (n = ${hi[1]}) into water (n = 1.33), meeting the boundary at ${t1}° to the normal. ${ANG} ${X_UNROUNDED}`,
    parts: [
      xNum("t2", "Angle in water", "Angle of refraction in the water, in degrees", t2, 1, "Snell's law: n1 sin θ1 = n2 sin θ2. Going into a lower index, the ray bends away from the normal."),
      xNum("C", "Critical angle", `Critical angle for ${hi[0]} to water, in degrees`, C, 1, "At the critical angle the refracted ray is at 90°: sin C = n2 ÷ n1."),
    ],
    steps: [
      `\`sin θ2 = _n1 * sin(_t1) / 1.33\` → ${xs((hi[1] * Math.sin(t1 * DEG)) / n2)}. \`asin(_n1 * sin(_t1) / 1.33)\` → ${xs(t2)}, which rounds to **${xr(t2, 1)}°**.`,
      `\`asin(1.33 / _n1)\` → ${xs(C)}, which rounds to **${xr(C, 1)}°**. The ray here hits at ${t1}°, below this, so it does refract out.`,
    ],
    given: [["_n1", hi[1]], ["_t1", t1]],
    hints: [
      "Neither side is air, so keep both indices in Snell's law: n1 sin θ1 = n2 sin θ2.",
      "Divide by the water's index, then take the inverse sine (`asin`). The calculator works in degrees.",
      "For the critical angle, set θ2 = 90°, so sin C = n2 ÷ n1 (lower index ÷ higher index).",
    ],
  });
}

// refraction / expert: measure i and r for a block; index, speed and critical angle.
function xFindN(rng) {
  const i = rng.int(25, 75);
  const n0 = rng.int(130, 200) / 100;
  const r = Math.round(Math.asin(Math.sin(i * DEG) / n0) / DEG);
  if (r < 8 || r >= i) return null;
  const n = Math.sin(i * DEG) / Math.sin(r * DEG);
  if (n < 1.2) return null;
  const v = 3 / n;
  const C = Math.asin(1 / n) / DEG;
  return xMulti({
    kind: "x-findn",
    v: { i, r },
    prompt: `In an experiment, a ray of light in air enters a transparent block at an angle of incidence of ${i}°. The angle of refraction inside the block is ${r}°. ${ANG} Take the speed of light in air as 3.00 × 10⁸ m/s. ${X_UNROUNDED}`,
    parts: [
      xNum("n", "Refractive index", "Refractive index of the block (no unit)", n, 3, "From air, n = sin i ÷ sin r."),
      xNum("v", "Speed in the block", "Speed of light in the block, in units of 10⁸ m/s", v, 2, "n = c ÷ v, so v = c ÷ n. With c = 3 (× 10⁸ m/s), the answer is in units of 10⁸ m/s."),
      xNum("C", "Critical angle", "Critical angle from the block into air, in degrees", C, 1, "sin C = 1 ÷ n."),
    ],
    steps: [
      `\`_n = sin(_i) / sin(_r)\` → ${xs(n)}, which rounds to **${xr(n, 3)}**.`,
      `\`3 / _n\` → ${xs(v)}, which rounds to **${xr(v, 2)}** × 10⁸ m/s.`,
      `\`asin(1 / _n)\` → ${xs(C)}, which rounds to **${xr(C, 1)}°**.`,
    ],
    given: [["_i", i], ["_r", r]],
    hints: [
      "Snell's law from air (n = 1): sin i = n sin r. Divide the sines, not the angles.",
      "A higher refractive index means slower light: v = c ÷ n.",
      "The critical angle uses the same index: sin C = 1 ÷ n.",
    ],
  });
}

// refraction / expert: will a ray inside a material escape, or be totally internally reflected?
function xTir(rng) {
  const hi = rng.pick(MEDIA.filter(([, n]) => n >= 1.36));
  const lo = rng.pick(X_LOW);
  if (hi[1] <= lo[1] + 0.05) return null;
  const C = Math.asin(lo[1] / hi[1]) / DEG;
  const th = rng.int(10, 85);
  if (Math.abs(th - C) < 2) return null;
  const outcome = th > C ? "Totally internally reflected" : "Refracts out";
  return xMulti({
    kind: "x-tir",
    v: { n1: hi[1], n2: lo[1], th },
    prompt: `A ray of light inside ${hi[0]} (n = ${hi[1]}) meets a boundary with ${lo[0]}${lo[1] === 1 ? "" : " (n = 1.33)"} at ${th}° to the normal. ${ANG} ${X_UNROUNDED}`,
    parts: [
      xNum("C", "Critical angle", "Critical angle at this boundary, in degrees", C, 1, `sin C = n2 ÷ n1, with n2 the index of the ${lo[0]}.`),
      xChoice("out", "Outcome", "What happens to the ray?", outcome, ["Refracts out", "Totally internally reflected"], "Compare the angle of incidence with the critical angle."),
    ],
    steps: [
      `\`asin(${lo[1] === 1 ? "1" : "1.33"} / _n1)\` → ${xs(C)}, which rounds to **${xr(C, 1)}°**.`,
      th > C
        ? `${th}° is bigger than the critical angle, so no ray can refract out: it is **Totally internally reflected**.`
        : `${th}° is smaller than the critical angle, so the ray **Refracts out** (bending away from the normal), with a weak reflection too.`,
    ],
    given: [["_n1", hi[1]], ["_th", th]],
    hints: [
      "Total internal reflection can only happen going from a higher index to a lower one, beyond the critical angle.",
      "Find the critical angle: sin C = (lower index) ÷ (higher index), then use `asin`.",
      "If the angle of incidence is bigger than C, nothing refracts out.",
    ],
  });
}

// lenses / expert: design a projection; work back from a magnification to u and v.
function xScreen(rng) {
  const f = rng.int(30, 300) / 10;
  const M = rng.int(12, 80) / 10;
  const u = f * (1 + 1 / M);
  const v = f * (1 + M);
  return xMulti({
    kind: "x-screen",
    v: { f, M },
    prompt: `A converging lens of focal length ${xs(f)} cm must project a real image of a slide onto a screen, ${xs(M)} times as tall as the slide. ${LENS_RULE} ${X_UNROUNDED}`,
    parts: [
      xNum("u", "Object distance", "Distance from the slide to the lens, in cm", u, 2, "Magnification = v ÷ u, so v = M × u. Put that into the lens equation: 1/f = 1/u + 1/(Mu)."),
      xNum("v", "Image distance", "Distance from the lens to the screen, in cm", v, 2, "v = M × u."),
      xNum("D", "Slide to screen", "Distance from the slide to the screen, in cm", u + v, 1, "The slide and screen are on opposite sides of the lens: add u and v."),
    ],
    steps: [
      `With v = Mu: \`1/f = 1/u + 1/(Mu) = (M + 1)/(Mu)\`, so \`_u = _f * (1 + 1/_M)\` → ${xs(u)}, which rounds to **${xr(u, 2)} cm**.`,
      `\`_v = _M * _u\` → ${xs(v)}, which rounds to **${xr(v, 2)} cm**.`,
      `\`_u + _v\` → ${xs(u + v)}, which rounds to **${xr(u + v, 1)} cm**.`,
    ],
    given: [["_f", f], ["_M", M]],
    hints: [
      "Work backwards. A real image M times as big means v = M × u.",
      "Substitute v = Mu into 1/f = 1/u + 1/v and combine the fractions: 1/f = (M + 1) ÷ (M u).",
      "Rearrange for u, then v = M × u.",
    ],
  });
}

// lenses / expert: a magnifying glass (object inside f): a virtual image with negative v.
function xMagnifier(rng) {
  const f = rng.int(40, 250) / 10;
  const u = rng.int(Math.ceil(f * 3), Math.floor(f * 9)) / 10;
  if (u >= f - 0.2) return null;
  const v = (u * f) / (u - f);
  const m = Math.abs(v) / u;
  const h = rng.int(2, 40) / 10;
  return xMulti({
    kind: "x-magnifier",
    v: { f, u, h },
    prompt: `A magnifying glass is a converging lens of focal length ${xs(f)} cm. It is held ${xs(u)} cm from an insect ${xs(h)} mm long. ${LENS_RULE} ${MAG_RULE} ${X_UNROUNDED}`,
    parts: [
      xNum("v", "Image distance", "Image distance v, in cm (negative for a virtual image)", v, 2, "1/v = 1/f - 1/u. The object is inside the focal length, so 1/v comes out negative."),
      xNum("m", "Magnification", "Magnification (no unit)", m, 2, "|v| ÷ u."),
      xNum("hi", "Image length", "Length of the image, in mm", m * h, 2, "Object length × magnification."),
    ],
    steps: [
      `\`_v = 1 / (1/_f - 1/_u)\` → ${xs(v)}, which rounds to **${xr(v, 2)} cm**: negative, so the image is virtual, on the same side as the insect.`,
      `\`abs(_v) / _u\` → ${xs(m)}, which rounds to **${xr(m, 2)}**.`,
      `\`_h * abs(_v) / _u\` → ${xs(m * h)}, which rounds to **${xr(m * h, 2)} mm**.`,
    ],
    given: [["_f", f], ["_u", u], ["_h", h]],
    hints: [
      "The insect is closer than the focal length, which is how a magnifying glass works: the image is virtual and upright.",
      "Use 1/v = 1/f - 1/u. The result is negative: keep the sign, it means virtual.",
      "For the size, use |v| ÷ u (ignore the sign) and multiply by the insect's length.",
    ],
  });
}

// lenses / expert: object and screen a fixed distance apart; two lens positions give a sharp image.
function xTwoPos(rng) {
  const f = rng.int(50, 250) / 10;
  const D = rng.int(Math.ceil(4.4 * f), Math.floor(9 * f));
  const disc = Math.sqrt(D * D - 4 * D * f);
  const u1 = (D - disc) / 2;
  const u2 = (D + disc) / 2;
  const m1 = (D - u1) / u1;
  return xMulti({
    kind: "x-twopos",
    v: { f, D },
    prompt: `An object and a screen are fixed ${D} cm apart. A converging lens of focal length ${xs(f)} cm is moved between them. There are two positions where a sharp image forms on the screen. ${LENS_RULE} ${MAG_RULE} ${X_UNROUNDED}`,
    parts: [
      xNum("u1", "Nearer position", "Distance from the object to the lens in the position nearer the object, in cm", u1, 2, "With u + v = D, the lens equation becomes 1/f = 1/u + 1/(D - u): a quadratic in u."),
      xNum("u2", "Further position", "Distance from the object to the lens in the other position, in cm", u2, 2, "The two answers are symmetric: they swap u and v, so they add up to D."),
      xNum("m1", "Magnification", "Magnification in the nearer position (no unit)", m1, 2, "|v| ÷ u, with v = D - u."),
    ],
    steps: [
      `\`1/f = 1/u + 1/(D - u)\` gives \`u² - Du + Df = 0\`, i.e. \`u² - ${D}u + ${xs(D * f)} = 0\`.`,
      `\`(_D - sqrt(_D^2 - 4 * _D * _f)) / 2\` → ${xs(u1)}, which rounds to **${xr(u1, 2)} cm**.`,
      `\`(_D + sqrt(_D^2 - 4 * _D * _f)) / 2\` → ${xs(u2)}, which rounds to **${xr(u2, 2)} cm**.`,
      `Nearer position: v = ${xs(D - u1)} cm, so \`(_D - _u1) / _u1\` → ${xs(m1)}, which rounds to **${xr(m1, 2)}** (an enlarged image; the other position gives the reciprocal).`,
    ],
    given: [["_D", D], ["_f", f]],
    hints: [
      "The object-to-screen distance is fixed: u + v = D, so v = D - u.",
      "Put v = D - u into 1/f = 1/u + 1/v and multiply out: you get a quadratic in u.",
      "Both roots are valid positions. A sharp image needs D ≥ 4f, which holds here.",
    ],
  });
}

function genExpert(subtopic, rng) {
  const pick = (list) => list[rng.int(0, list.length - 1)];
  if (subtopic === "wave-equation") return xTry(pick([xSonar, xBoundary, xRadio]), rng);
  if (subtopic === "period") return xTry(pick([xBob, xRpm, xScope]), rng);
  if (subtopic === "refraction") return xTry(pick([xTwoMedia, xFindN, xTir]), rng);
  if (subtopic === "lenses") return xTry(pick([xScreen, xMagnifier, xTwoPos]), rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent truth for verify: bisection on Snell's law and the lens equation as written, and
// frequency-first or time-per-wave routes where the generator went the other way.
const X_SIN = (x) => Math.sin((x * Math.PI) / 180);
const X_TRUTH = {
  "x-sonar": ({ fk, lam, t }) => {
    const v = xRoot((x) => x / (fk * 1000) - lam / 100, 0, 1e5);
    return { v, depth: xRoot((d) => (2 * d) / v - t, 0, 1e7) };
  },
  "x-boundary": ({ v1, lam1, v2, D }) => {
    const lam2 = (lam1 * v2) / v1;
    return { f: v2 / lam2, lam2, n: (D * v1) / (lam1 * v2) };
  },
  "x-radio": ({ fM, dkm }) => {
    const T = 1 / (fM * 1e6); // one wave passes in T and moves one wavelength
    const lam = 3e8 * T;
    return { lam, aerial: lam * 25, time: (dkm / 3e5) * 1000 };
  },
  "x-bob": ({ N, t, lam, X }) => {
    const f = N / t;
    return { T: 1 / f, v: f * lam, tx: X / (f * lam) };
  },
  "x-rpm": ({ rpm, T2 }) => {
    const turnsPerMs = rpm / 60000;
    return { f: turnsPerMs * 1000, T: 1 / turnsPerMs, rpm2: (1 / T2) * 60000 };
  },
  "x-scope": ({ k, tb, cycles }) => {
    const f = 1000 / (k * tb);
    return { f, lam: 340 / f, tb2: ((cycles / f) * 1000) / 10 };
  },
  "x-twomedia": ({ n1, t1 }) => ({
    t2: xRoot((x) => n1 * X_SIN(t1) - 1.33 * X_SIN(x), 0, 90),
    C: xRoot((x) => n1 * X_SIN(x) - 1.33, 0, 90),
  }),
  "x-findn": ({ i, r }) => {
    const n = xRoot((x) => x * X_SIN(r) - X_SIN(i), 1, 10);
    return { n, v: xRoot((x) => n * x - 3, 0, 3), C: xRoot((x) => n * X_SIN(x) - 1, 0, 90) };
  },
  "x-tir": ({ n1, n2, th }) => {
    const C = xRoot((x) => n1 * X_SIN(x) - n2, 0, 90);
    // Total internal reflection when Snell's law has no solution: n1 sin θ > n2.
    return { C, out: n1 * X_SIN(th) > n2 ? "Totally internally reflected" : "Refracts out" };
  },
  "x-screen": ({ f, M }) => {
    const u = xRoot((x) => 1 / x + 1 / (M * x) - 1 / f, f * 1.0000001, 1e6);
    return { u, v: M * u, D: u + M * u };
  },
  "x-magnifier": ({ f, u, h }) => {
    const v = xRoot((x) => 1 / u + 1 / x - 1 / f, -1e7, -u * 1.0000001);
    return { v, m: -v / u, hi: (-v / u) * h };
  },
  "x-twopos": ({ f, D }) => {
    const g = (x) => 1 / x + 1 / (D - x) - 1 / f;
    const u1 = xRoot(g, f * 1.0000001, D / 2);
    return { u1, u2: xRoot(g, D / 2, D - f * 1.0000001), m1: (D - u1) / u1 };
  },
};

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  const gen = GENERATORS[subtopic];
  if (!gen) throw new Error(`Unknown subtopic: ${subtopic}`);
  for (let i = 0; i < 80; i++) {
    const q = gen(difficulty, rng);
    if (q) return withHints(q);
  }
  throw new Error(`Waves: could not generate ${subtopic}/${difficulty}`);
}

// ---------------------------------------------------------------------------------------------
// Guided-mode hints, read from the explanation's calculator rows after the question is built (so
// they never touch the rng and use the same `_labels` as the given values):
//   1. the method, plus a "watch out" for the classic mistake;
//   2. the values from the question as calculator rows;
//   3. any intermediate rows with their values;
//   4. the final row's expression only, without its value.
// When the final row is only a unit conversion (e.g. `_T_ms = _T * 1000`), the row before it is the
// answer in other units, so its value is hidden too and both expressions go in the last hint.

const TIPS = {
  weq: "Watch out: multiply for speed, divide for frequency or wavelength, and work in Hz and m.",
  "period-T": "Watch out: period and frequency are reciprocals, not the same number.",
  "period-f": "Watch out: period and frequency are reciprocals, and the period must be in seconds.",
  "period-count": "Frequency is waves per second, so multiply by the time.",
  "period-f-count": "Watch out: divide the number of waves by the time, not the other way round.",
  "period-scope": "Watch out: the time per division is in milliseconds, so convert the period to seconds first.",
  "period-speed-T": "The time between one crest and the next is one period.",
  "period-count-T": "Watch out: time ÷ number of waves is the period; number of waves ÷ time would be the frequency.",
  "refr-n-from-v": "A refractive index is always more than 1, because light is slowest in the material.",
  "refr-v-from-n": "Light is slower in the material than in air, so the answer is less than 3.",
  "refr-snell": "Measure angles from the normal and keep the calculator in degrees (it already is).",
  "refr-critical": "At the critical angle the refracted ray skims along the boundary, at 90°.",
  "refr-v-from-critical": "It takes two steps: the index from the critical angle, then the speed from the index.",
  "lens-v": "Watch out: work with reciprocals and flip the result at the end. Don't just add or subtract the distances.",
  "lens-f": "Watch out: work with reciprocals and flip the result at the end. Don't just add the distances.",
  "lens-u": "Watch out: work with reciprocals and flip the result at the end. Don't just subtract the distances.",
  "lens-mag": "Magnification is |v| ÷ u, so you need the image distance first.",
  "lens-height": "The image is |v| ÷ u times the size of the object.",
  "lens-power": "Watch out: the focal length must be in metres, and a diverging lens has a negative power.",
};

const ROW = /^- `(_[A-Za-z0-9_]+) = ([^`]+)`(.*)$/;
const UNIT_STEP = /^(_[A-Za-z0-9_]+) [*/] (?:1e-?\d+|\d+)$/;

function rowHints(explanation, tip, finishNote, answer, tol) {
  const blocks = String(explanation || "").split("\n\n");
  const intro = blocks[0];
  const rows = [];
  for (const line of blocks.slice(1).join("\n").split("\n")) {
    const m = line.match(ROW);
    if (!m) continue;
    const rest = m[3].trim();
    rows.push(rest.startsWith("→") ? { label: m[1], expr: m[2], shown: rest.slice(1).trim() } : { label: m[1], text: line.slice(2) });
  }
  const last = rows[rows.length - 1];
  if (!last || last.expr === undefined) return null;
  const givens = rows.filter((r) => r.expr === undefined);
  let mids = rows.slice(0, -1).filter((r) => r.expr !== undefined);
  const conv = last.expr.match(UNIT_STEP);
  const prev = conv && mids.length && mids[mids.length - 1].label === conv[1] ? mids[mids.length - 1] : null;
  if (prev) mids = mids.slice(0, -1);
  const out = [`${intro}${tip ? ` ${tip}` : ""}`];
  if (givens.length) out.push(`Put the values from the question into calculator rows:\n\n${givens.map((r) => `- ${r.text}`).join("\n")}`);
  // An intermediate value that happens to match the answer is listed without its value.
  const leaks = (s) => Number.isFinite(answer) && (String(s).match(/-?\d+(?:\.\d+)?/g) || []).some((x) => Math.abs(Number(x) - answer) <= tol + 1e-9);
  if (mids.length) out.push(`Then work out:\n\n${mids.map((r) => `- \`${r.label} = ${r.expr}\`${leaks(r.shown) ? "" : ` → ${r.shown}`}`).join("\n")}`);
  out.push(
    prev
      ? `Work out \`${prev.label} = ${prev.expr}\`, then convert the unit: \`${last.label} = ${last.expr}\`.${finishNote}`
      : `Finally work out \`${last.label} = ${last.expr}\`.${finishNote}`
  );
  return out;
}

function withHints(q) {
  const p = q.params || {};
  const hints = rowHints(q.explanation, TIPS[p.kind], p.rounded ? roundNote(p.dp) : EXACT, Number(q.answer), q.tolerance || 0);
  return hints && hints.length ? { ...q, hints } : q;
}

// ---------------------------------------------------------------------------------------------
// Independent check: substitute the answer into the defining relation, written as a residual g(x)
// that is monotonic in the unknown near the answer. It must change sign across [x - tol, x + tol],
// i.e. the true value lies inside the accepted band. Trig is recomputed here in degrees.

const S = (x) => Math.sin((x * Math.PI) / 180);

function snellResidual(v, x) {
  const k = { ...v, [v.unknown]: x };
  if (v.unknown === "t1" || v.unknown === "t2") {
    if (!(x > 0 && x < 90)) return NaN;
  }
  return k.n1 * S(k.t1) - k.n2 * S(k.t2);
}

const RESIDUAL = {
  // v = f·λ, all SI; x is in the asked unit (× scale → SI).
  "weq": (p, x) => {
    const k = { ...p.values, [p.unknown]: x * p.scale };
    return k.v - k.f * k.lam;
  },
  "period-T": (p, x) => x * p.scale * p.values.f - 1,
  "period-f": (p, x) => x * p.values.T - 1,
  "period-count": (p, x) => x - p.values.f * p.values.t,
  "period-f-count": (p, x) => x * p.values.t - p.values.N,
  "period-scope": (p, x) => (x * p.values.div * p.values.X) / 1000 - 1,
  "period-speed-T": (p, x) => x * p.values.T - p.values.lam,
  "period-count-T": (p, x) => x * p.scale * p.values.N - p.values.t,
  "refr-n-from-v": (p, x) => x * p.values.v - 3,
  "refr-v-from-n": (p, x) => x * p.values.n - 3,
  "refr-snell": (p, x) => snellResidual(p.values, x),
  // Critical angle: n1 sin C = n2 (C is the unknown angle, or n1 the unknown index).
  "refr-critical": (p, x) => {
    const v = p.values;
    if (v.unknown === "C") return x > 0 && x < 90 ? v.n1 * S(x) - v.n2 : NaN;
    return x * S(v.t1) - v.n2;
  },
  "refr-v-from-critical": (p, x) => x / 3 - S(p.values.C),
  "lens-v": (p, x) => 1 / x + 1 / p.values.u - 1 / p.values.f,
  "lens-f": (p, x) => 1 / x - 1 / p.values.u - 1 / p.values.v,
  "lens-u": (p, x) => 1 / x + 1 / p.values.v - 1 / p.values.f,
  // Size ratio |v|/u = |f / (u - f)|, an alternative form of the lens equation.
  "lens-mag": (p, x) => x * Math.abs(p.values.u - p.values.f) - Math.abs(p.values.f),
  "lens-height": (p, x) => x * Math.abs(p.values.u - p.values.f) - p.values.h * Math.abs(p.values.f),
  "lens-power": (p, x) => (x * p.values.f) / 100 - 1,
};

function answerOk(p, raw) {
  if (raw === "" || raw === null || raw === undefined || typeof raw === "object") return false;
  const x = Number(raw);
  if (!Number.isFinite(x) || x === 0) return false;
  if (!p.allowNeg && x < 0) return false;
  const g = RESIDUAL[p.kind];
  if (!g) return false;
  const tol = p.rounded ? 0.5 * 10 ** -p.dp : 0;
  const h = tol > 0 ? tol + 1e-7 : 1e-9 * Math.max(1, Math.abs(x));
  if (Math.abs(x) <= h) return false; // the band must not straddle zero (1/x relations)
  const a = g(p, x - h);
  const b = g(p, x + h);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === 0 || b === 0 || a < 0 !== b < 0;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (p && typeof p.kind === "string" && p.kind.startsWith("x-")) return xVerify(question, answer, X_TRUTH);
  if (!p || !p.values || typeof p.kind !== "string") return false;
  try {
    if (question.answerType === "choice") {
      const ch = question.choices;
      if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
      if (!ch.includes(String(answer))) return false;
      if (ch.filter((c) => answerOk(p, c)).length !== 1) return false;
    }
    return answerOk(p, answer) === true;
  } catch {
    return false;
  }
}
