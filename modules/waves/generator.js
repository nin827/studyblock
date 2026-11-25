// Waves generator: the wave equation, period and frequency, refraction (Snell's law, critical angle)
// and thin lenses. Uses only the seeded rng passed in by the engine.
// Every prompt states its units and rounding. Rounded answers are accepted within half a unit of the
// stated precision; exact answers must match. Angles are in degrees.
// Explanations list every step as a labelled calculator row, e.g. `_v = _f * _lambda` → 340.

// ---------------------------------------------------------------------------------------------
// Number helpers

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
      intro = "Radio waves travel at the speed of light, `v = 3 × 10⁸ m/s`. Use `v = f × λ`, converting MHz to Hz (× 10⁶). In MHz the powers of ten cancel: `λ = 300 / f(MHz)`.";
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

export function generate({ subtopic, difficulty, rng }) {
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
