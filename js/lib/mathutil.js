// Small shared maths knowledge for generators: pure, no DOM, no rng, no checks.
//
// What is here (and only this): facts and tiny conversions that many generators copied.
//   Divisors:    gcd, lcm, gcdAll, lcmAll (integers; gcd is >= 0 and gcd(0, 0) = 0)
//   Rounding:    roundHalfAway(n, dp), round1(n), round2(n), roundTo(n, dp)
//                Half-steps round AWAY from zero, with a 1e-9 nudge so 1.005 -> 1.01 although the
//                double is 1.00499999999999989...  roundHalfAway/round1/round2 are the raw form
//                (may return -0); roundTo is the same but never returns -0.
//   Half-step:   isHalfStep(x, dp = 2, tol = 1e-6) - true when x sits (within tol of the last digit)
//                on a rounding half-step at dp places, so a generator can redraw such a value.
//                The tolerance is the caller's setting; a module wraps it in its own one-liner.
//   Formatting:  fmtNum(n, dp = 4)  - Math.round to dp, "-0" -> "0", then String(): "3.1416", "12"
//                fmtAnswer(n, to2dp) - the answer string most numeric generators store:
//                                      round2 then toFixed(2) when to2dp, else String().
//   Bytes:       bin8(d) - a 0..255 value as 8 bits.
//
// What is NOT here: a module's own rounding rule, tolerance, unit convention, or anything its
// verify() uses to check an answer. verify() keeps its own independent helpers (it may call these
// facts, but a generator and its verify must not both depend on the same function that built the
// answer), so switch only generation / hint / explanation code to this file.

export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export const lcm = (a, b) => (a / gcd(a, b)) * b;
export const gcdAll = arr => arr.reduce((g, x) => gcd(g, x));
export const lcmAll = arr => arr.reduce((l, x) => lcm(l, x));

// Round half away from zero at dp decimal places (raw: -0 is possible).
export const roundHalfAway = (n, dp = 0) => {
  const f = 10 ** dp;
  return (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
};
export const round1 = n => (Math.sign(n) * Math.round(Math.abs(n) * 10 + 1e-9)) / 10;
export const round2 = n => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
// Same rounding, never -0.
export function roundTo(n, dp = 0) {
  const r = roundHalfAway(n, dp);
  return Object.is(r, -0) ? 0 : r;
}

// Does x sit on a half-step of the last kept digit (e.g. 1.005 at dp = 2)?
export const isHalfStep = (x, dp = 2, tol = 1e-6) => {
  const f = Math.abs(x) * 10 ** dp;
  return Math.abs(f - Math.floor(f) - 0.5) < tol;
};

export function fmtNum(n, dp = 4) {
  const f = 10 ** dp;
  const r = Math.round(n * f) / f;
  return String(Object.is(r, -0) ? 0 : r);
}

export function fmtAnswer(n, to2dp) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return to2dp ? v.toFixed(2) : String(v);
}

export const bin8 = d => d.toString(2).padStart(8, '0');
