// Calculus basics generator. Uses only the seeded rng passed in by the engine.
// Answer formats:
//   whole numbers      tolerance 0 (easy and medium values)
//   2 decimal places   tolerance 0.005 (hard values; exact half-cent ties are never generated)
//   expressions        multiple choice, written like "6x² − 4x + 1", "x^(−1/2)", "2x³ + 5x + C"
// verify() never reuses generate()'s algebra. Derivatives are checked by central differences,
// integrals by Simpson's rule (split at sign changes for areas), stationary points by scanning the
// numerical gradient for sign changes, and expression choices by parsing the chosen string and
// comparing it with a numerical derivative of the function (or of the chosen antiderivative).

// ---------------------------------------------------------------------------------------------
// Number helpers

const MINUS = "−";
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
const fmt2 = (n) => {
  const r = round2(n);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
};
// True when n sits (almost) on a half-cent, where rounding to 2 decimals would be ambiguous.
const nearHalf = (n) => Math.abs((Math.abs(n * 100) % 1) - 0.5) < 1e-6;

import { gcd } from "../../js/lib/mathutil.js";

// Shortest decimal (up to 4 dp), "−" for negatives, never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  const v = Object.is(r, -0) ? 0 : r;
  return v < 0 ? MINUS + String(-v) : String(v);
}
// Plain ASCII number for calculator expressions.
function plain(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
// Negative numbers in brackets when substituted.
const par = (n) => (n < 0 ? `(${num(n)})` : num(n));

// Exact rational display of a float with a small denominator: "7/3", "−5/2", "4".
function rat(x) {
  for (let d = 1; d <= 60; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x * d - n) < 1e-9) {
      const g = gcd(n, d) || 1;
      const a = n / g, b = d / g;
      const s = b === 1 ? String(Math.abs(a)) : `${Math.abs(a)}/${b}`;
      return a < 0 ? MINUS + s : s;
    }
  }
  return num(x);
}

const nz = (rng, lo, hi) => {
  let v;
  do v = rng.int(lo, hi);
  while (v === 0);
  return v;
};

// Retry a draw until ok() holds (deterministic: only the rng passed in). Falls back to the last draw.
function draw(make, ok, tries = 80) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = make();
    if (ok(v)) return v;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// Polynomials with rational powers: terms { c, p, q } mean c·x^(p/q), q > 0, p/q reduced.

const SUPD = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
const sup = (n) => String(n).split("").map((ch) => SUPD[ch]).join("");

function T(c, p, q = 1) {
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(p, q) || 1;
  return { c, p: p / g, q: q / g };
}
const ev = (t) => t.p / t.q;

// Merge equal powers, drop zero coefficients, highest power first.
function norm(terms) {
  const m = new Map();
  for (const t of terms) {
    const k = `${t.p}/${t.q}`;
    const cur = m.get(k);
    if (cur) cur.c += t.c;
    else m.set(k, { ...t });
  }
  return [...m.values()].filter((t) => Math.abs(t.c) > 1e-12).sort((a, b) => ev(b) - ev(a));
}

function powStr(p, q) {
  if (q === 1) {
    if (p === 0) return "";
    if (p === 1) return "x";
    return "x" + sup(p);
  }
  return `x^(${p < 0 ? MINUS : ""}${Math.abs(p)}/${q})`;
}
function coefStr(a) {
  // a > 0
  if (Number.isInteger(a)) return String(a);
  return `(${rat(a)})`;
}
function body(t) {
  const a = Math.abs(t.c);
  if (t.p === 0) return Number.isInteger(a) ? String(a) : rat(a);
  return (a === 1 ? "" : coefStr(a)) + powStr(t.p, t.q);
}
// "6x² − 4x + 1"; "0" for the zero polynomial.
function polyStr(terms) {
  const ts = norm(terms);
  if (!ts.length) return "0";
  return ts.map((t, i) => (i === 0 ? (t.c < 0 ? MINUS : "") + body(t) : (t.c < 0 ? ` ${MINUS} ` : " + ") + body(t))).join("");
}
// Friendly form for prompts: "6√x", "4/x²", "3/√x", "2x√x".
function prettyBody(t) {
  const a = Math.abs(t.c);
  const lead = a === 1 ? "" : String(a);
  if (t.q === 1 && t.p < 0) return `${a}/x${t.p === -1 ? "" : sup(-t.p)}`;
  if (t.q === 2 && t.p === 1) return `${lead}√x`;
  if (t.q === 2 && t.p === -1) return `${a}/√x`;
  if (t.q === 2 && t.p === 3) return `${lead}x√x`;
  return body(t);
}
function prettyStr(terms) {
  const ts = norm(terms);
  return ts.map((t, i) => (i === 0 ? (t.c < 0 ? MINUS : "") + prettyBody(t) : (t.c < 0 ? ` ${MINUS} ` : " + ") + prettyBody(t))).join("");
}
const isPlainPoly = (terms) => terms.every((t) => t.q === 1 && t.p >= 0);

const dTerm = (t) => (t.p === 0 ? null : T((t.c * t.p) / t.q, t.p - t.q, t.q));
const deriv = (terms) => norm(terms.map(dTerm).filter(Boolean));
const iTerm = (t) => T((t.c * t.q) / (t.p + t.q), t.p + t.q, t.q); // never called with p/q = -1
const integ = (terms) => norm(terms.map(iTerm));
const evalAt = (terms, x) => terms.reduce((s, t) => s + t.c * Math.pow(x, ev(t)), 0);
const coefInts = (terms) => terms.every((t) => Number.isInteger(t.c));

// Calculator expression for a polynomial in _x (or another variable name).
function calcExpr(terms, v = "_x") {
  const ts = norm(terms);
  return ts
    .map((t, i) => {
      const a = Math.abs(t.c);
      let s;
      if (t.p === 0) s = plain(a);
      else {
        const pw = t.q === 1 ? (t.p === 1 ? v : `${v}^${t.p < 0 ? `(${t.p})` : t.p}`) : `${v}^(${t.p}/${t.q})`;
        s = a === 1 ? pw : `${plain(a)}*${pw}`;
      }
      return i === 0 ? (t.c < 0 ? "-" : "") + s : (t.c < 0 ? " - " : " + ") + s;
    })
    .join("");
}

// One random polynomial: degree `deg`, leading coefficient in ±[1, lead], others in [-other, other].
// `mult(n)` gives the multiple each coefficient of x^n must be (for whole-number integrals).
function randPoly(rng, deg, lead, other, mult = () => 1) {
  return draw(
    () => {
      const ts = [];
      for (let n = deg; n >= 0; n--) {
        const m = mult(n);
        const c = n === deg ? nz(rng, -lead, lead) * m : rng.int(-other, other) * m;
        ts.push(T(c, n));
      }
      return norm(ts);
    },
    (ts) => ts.length >= 2 && ts[0].p === deg,
  );
}

// ---------------------------------------------------------------------------------------------
// Shared question helpers

const WHOLE = " Give a whole number.";
const DP2 = " Round to 2 decimal places.";
const NAT_NOTE = " The powers in the options are written like x⁻² and x^(1/2).";

function fname(rng) {
  return rng.pick(["f", "f", "g", "h"]);
}

// 4 distinct choice strings: the answer + 3 distractor strings (first distinct ones win).
function pick4(answer, cands, rng, extra) {
  const seen = new Set([answer]);
  const out = [];
  for (const c of cands) {
    if (out.length >= 3) break;
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  for (let k = 1; out.length < 3 && k < 40; k++) {
    const c = extra(k);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.length === 3 ? rng.shuffle([answer, ...out]) : null;
}

// A typed whole number (65%) or a multiple-choice one (35%).
function numChoices(correct, cands, rounded, rng) {
  const f = (v) => (rounded ? fmt2(v) : String(Math.round(v)));
  const answer = f(correct);
  const strs = cands.filter((v) => Number.isFinite(v) && (rounded || Number.isInteger(v))).map(f);
  const step = rounded ? Math.max(0.1, round2(Math.abs(correct) * 0.1)) : 1;
  return { answer, choices: pick4(answer, strs, rng, (k) => f(correct + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step)) };
}
function finishNum(q, exact, rounded, cands, rng, choiceShare = 0.3) {
  const tolerance = rounded ? 0.005 : 0;
  const params = { ...q.params, rounded };
  if (rng.next() < choiceShare) {
    const { answer, choices } = numChoices(exact, cands, rounded, rng);
    if (choices) return { ...q, params, answer, answerType: "choice", choices, tolerance: undefined };
  }
  return { ...q, params, answer: rounded ? round2(exact) : exact, answerType: "number", tolerance };
}

// "Use the power rule on each term" lines: "- `3x²` → `6x`".
function diffLines(terms) {
  return norm(terms).map((t) => {
    const d = dTerm(t);
    if (!d) return `- \`${body(t)}\` is a constant, so it becomes 0.`;
    return `- \`${t.c < 0 ? MINUS : ""}${body(t)}\` → ${par(t.c)} × ${t.q === 1 ? num(t.p) : rat(ev(t))} × ${powStr(d.p, d.q) || "1"} = \`${polyStr([d])}\``;
  });
}
function intLines(terms) {
  return norm(terms).map((t) => {
    const i = iTerm(t);
    const np = rat(ev(i));
    return `- \`${t.c < 0 ? MINUS : ""}${body(t)}\` → raise the power to ${np} and divide by ${np}: \`${polyStr([i])}\``;
  });
}

// ---------------------------------------------------------------------------------------------
// Derivatives

// Common power-rule slips, each a whole polynomial (constants handled like the real rule).
function derivMistakes(f) {
  const consts = f.filter((t) => t.p === 0);
  const vars = f.filter((t) => t.p !== 0);
  return [
    norm(vars.map((t) => T((t.c * t.p) / t.q, t.p, t.q))), // multiplied but kept the power
    norm(vars.map((t) => T(t.c, t.p - t.q, t.q))), // lowered the power but didn't multiply
    norm([...deriv(f), ...consts]), // kept the constant
    norm(vars.map((t) => T((t.c * t.p) / t.q, t.p + t.q, t.q))), // raised the power instead
    norm(vars.map((t) => T((t.c * (t.p - t.q)) / t.q, t.p - t.q, t.q))), // multiplied by the new power
    norm(deriv(f).map((t) => (t.p < 0 ? T(-t.c, t.p, t.q) : t))), // sign slip on negative powers
  ].filter((ts) => coefInts(ts));
}

function hardTerms(rng) {
  const POOL = [[-1, 1], [-2, 1], [-3, 1], [1, 2], [-1, 2], [3, 2], [1, 1], [2, 1], [3, 1]];
  return draw(
    () => {
      const n = rng.int(2, 3);
      const picks = rng.shuffle(POOL).slice(0, n);
      return norm(picks.map(([p, q]) => T(q === 2 ? 2 * nz(rng, -4, 4) : nz(rng, -6, 6), p, q)));
    },
    (ts) => ts.length >= 2 && ts.some((t) => t.q !== 1 || t.p < 0),
  );
}

function genDerivatives(difficulty, rng) {
  const F = fname(rng);
  let f, kind;
  if (difficulty === "easy") {
    kind = rng.pick(["choice", "choice", "value", "value", "coef"]);
    f = randPoly(rng, rng.int(2, 3), 6, 9);
  } else if (difficulty === "medium") {
    kind = rng.pick(["choice", "value", "value", "second", "product"]);
    if (kind === "product") {
      // (x + a)(bx + c), expanded before differentiating.
      const a = nz(rng, -7, 7), b = nz(rng, -4, 5), c = nz(rng, -8, 8);
      f = norm([T(b, 2), T(a * b + c, 1), T(a * c, 0)]);
      f.factored = `(x ${a < 0 ? MINUS : "+"} ${Math.abs(a)})(${b === 1 ? "" : b === -1 ? MINUS : num(b)}x ${c < 0 ? MINUS : "+"} ${Math.abs(c)})`;
    } else f = randPoly(rng, rng.int(3, 4), 5, 9);
  } else if (difficulty === "hard") {
    kind = rng.pick(["choice", "value", "value", "multi"]);
    f = hardTerms(rng);
  } else throw new Error(`Unknown difficulty: ${difficulty}`);

  const d1 = deriv(f);
  const d2 = deriv(d1);
  const hard = difficulty === "hard";
  const shown = hard ? prettyStr(f) : polyStr(f);
  const def = f.factored ? `\`${F}(x) = ${f.factored}\`` : `\`${F}(x) = ${shown}\``;
  const rewrite = hard ? `Write every term as a power of x first: \`${F}(x) = ${polyStr(f)}\`.` : "";
  const rule = "Power rule: the derivative of `axⁿ` is `n·a·xⁿ⁻¹` (multiply by the power, then lower the power by 1). A constant becomes 0.";
  const params = { sub: "derivatives", kind, f };

  const choiceSet = () => {
    const ans = polyStr(d1);
    const mis = derivMistakes(f).map(polyStr);
    const choices = pick4(ans, mis, rng, (k) => polyStr([...d1, T(k % 2 ? k : -k, 0)]));
    return { ans, choices };
  };

  // Derivative as an expression
  if (kind === "choice") {
    const { ans, choices } = choiceSet();
    const hints = [rule];
    if (hard) hints.push(rewrite);
    const lead = norm(f)[0];
    const varTerms = norm(f).filter((t) => t.p !== 0).length;
    // With only one x term, its derivative would be the whole answer, so show a neutral example instead.
    hints.push(
      varTerms >= 2
        ? `Start with the first term: \`${lead.c < 0 ? MINUS : ""}${body(lead)}\` becomes \`${polyStr([dTerm(lead)])}\`. Do the same to every other term${f.some((t) => t.p === 0) ? ", and drop the constant" : ""}.`
        : "For example, `5x⁶` would become `30x⁵`. Apply the same steps to each term here, and drop the constant.",
    );
    return {
      prompt: `${def}. Which of these is \`${F}'(x)\`?${hard ? NAT_NOTE : ""}`,
      answerType: "choice",
      answer: ans,
      choices,
      explanation: [`Differentiate term by term with the power rule.`, ...(hard ? [rewrite] : []), diffLines(f).join("\n"), `So \`${F}'(x) = ${ans}\`, which is **${ans}**.`].join("\n\n"),
      hints,
      params,
    };
  }

  if (kind === "coef") {
    const which = rng.pick(["x", "const"]);
    const exact = which === "x" ? evalAt(d1.filter((t) => t.p === 1), 1) : evalAt(d1.filter((t) => t.p === 0), 1);
    const what = which === "x" ? "the coefficient of x" : "the constant term";
    return finishNum(
      {
        prompt: `${def}. What is ${what} in \`${F}'(x)\`?${WHOLE}`,
        explanation: [`Differentiate term by term.`, diffLines(f).join("\n"), `\`${F}'(x) = ${polyStr(d1)}\`, so ${what} is **${num(exact)}**.`].join("\n\n"),
        hints: [rule, `Only one term of \`${F}(x)\` gives ${which === "x" ? "an x term" : "a constant"} in the derivative: the ${which === "x" ? "x² term" : "x term"}.`],
        params: { ...params, which },
      },
      exact, false, [exact * 2, exact / 2, evalAt(f.filter((t) => t.p === (which === "x" ? 1 : 0)), 1)], rng,
    );
  }

  // Values f'(k) and f''(k)
  const order = kind === "second" ? 2 : 1;
  const g = order === 2 ? d2 : d1;
  const pool = hard ? (f.some((t) => t.q !== 1) ? [1, 4, 9, 16, 2, 3, 5] : [1, 2, 3, 4, 5, -1, -2, -3]) : difficulty === "easy" ? [-3, -2, -1, 1, 2, 3, 0] : [-4, -3, -2, -1, 1, 2, 3, 4];
  let x = rng.pick(pool);
  if (hard) {
    // Redraw away from half-cent ties (deterministic, no extra rng beyond this loop).
    for (let i = 0; i < pool.length && nearHalf(evalAt(g, x)); i++) x = pool[(pool.indexOf(x) + 1) % pool.length];
  }
  const exact = evalAt(g, x);
  const rounded = hard;
  const end = rounded ? DP2 : WHOLE;
  const nm = order === 2 ? `${F}''(${num(x)})` : `${F}'(${num(x)})`;
  const gName = order === 2 ? `${F}''(x)` : `${F}'(x)`;
  const steps = [diffLines(f).join("\n"), `\`${F}'(x) = ${polyStr(d1)}\``];
  if (order === 2) steps.push(`Differentiate again: \`${F}''(x) = ${polyStr(d2)}\``);
  const result = rounded && Math.abs(exact - round2(exact)) > 1e-9 ? `≈ ${num(exact)}, which rounds to **${fmt2(exact)}**` : `= **${rounded ? fmt2(exact) : num(exact)}**`;
  const subLine = `Substitute x = ${num(x)}: \`${nm}\` ${result}.`;
  const explanation = [`Differentiate${order === 2 ? " twice" : ""}, then substitute x = ${num(x)}.`, ...(hard ? [rewrite] : []), ...steps, subLine].join("\n\n");
  const valueHints = [
    order === 2 ? `\`${F}''(x)\` means differentiate twice. ${rule}` : rule,
    ...(hard ? [rewrite] : []),
    `\`${gName} = ${polyStr(g)}\`. Now substitute x = ${num(x)} (in the calculator: \`${calcExpr(g)}\`).${rounded ? " Then round to 2 decimal places." : ""}`,
  ];

  if (kind === "multi") {
    const { ans, choices } = choiceSet();
    return {
      prompt: `${def}.`,
      answerType: "multi",
      parts: [
        { id: "derivative", label: "Derivative", ask: `Which of these is \`${F}'(x)\`?${NAT_NOTE}`, answerType: "choice", answer: ans, choices, hint: `${rewrite} Then use the power rule on each term: multiply by the power and lower it by 1.` },
        { id: "value", label: "Gradient value", ask: `Find \`${nm}\`.${DP2}`, answerType: "number", answer: round2(exact), tolerance: 0.005, hint: `Substitute x = ${num(x)} into your \`${F}'(x)\` (in the calculator, with \`_x\`: write each power as \`_x^(p/q)\`).` },
      ],
      explanation,
      hints: [rule],
      given: [{ label: "_x", value: x }],
      params: { ...params, x, order },
    };
  }

  const prompt = `${def}. Find \`${nm}\`.${end}`;
  const cands = [evalAt(f, x), evalAt(derivMistakes(f)[0] || [], x), evalAt(d1, x) + (order === 2 ? 0 : 1), order === 2 ? evalAt(d1, x) : -exact];
  return finishNum(
    { prompt, explanation, hints: valueHints, given: [{ label: "_x", value: x }], params: { ...params, x, order } },
    exact, rounded, cands, rng, hard ? 0.2 : 0.3,
  );
}

// ---------------------------------------------------------------------------------------------
// Gradients & tangents

// "y = 5x − 3", "y = −x + 2", "y = 4".
function lineStr(m, c) {
  let s = m === 0 ? "" : m === 1 ? "x" : m === -1 ? `${MINUS}x` : `${num(m)}x`;
  if (c !== 0 || !s) s += s ? (c < 0 ? ` ${MINUS} ${num(-c)}` : ` + ${num(c)}`) : num(c);
  return `y = ${s}`;
}

const CURVE = (y) => `the curve \`y = ${y}\``;

function genTangents(difficulty, rng) {
  let kind, f;
  if (difficulty === "easy") {
    kind = rng.pick(["grad", "gradPoint"]);
    f = randPoly(rng, 2, 5, 9);
  } else if (difficulty === "medium") {
    kind = rng.pick(["xAtGrad", "tangentChoice", "intercept", "grad"]);
    f = randPoly(rng, kind === "grad" ? 3 : 2, kind === "grad" ? 3 : 5, 9);
  } else if (difficulty === "hard") {
    kind = rng.pick(["cubicX", "tangentMulti", "xMulti", "normal"]);
    f = null;
  } else throw new Error(`Unknown difficulty: ${difficulty}`);

  const rule = "The gradient of a curve at a point is the value of its derivative `dy/dx` there.";

  if (kind === "grad" || kind === "gradPoint") {
    const x0 = rng.int(-4, 5);
    const d = deriv(f);
    const exact = evalAt(d, x0);
    const y0 = evalAt(f, x0);
    const where = kind === "gradPoint" ? `at the point (${num(x0)}, ${num(y0)})` : `where x = ${num(x0)}`;
    return finishNum(
      {
        prompt: `Find the gradient of ${CURVE(polyStr(f))} ${where}.${WHOLE}`,
        explanation: [`Differentiate, then substitute x = ${num(x0)}.`, diffLines(f).join("\n"), `\`dy/dx = ${polyStr(d)}\``, `At x = ${num(x0)}: \`dy/dx = ${calcExpr(d, par(x0)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = **${num(exact)}**.`].join("\n\n"),
        hints: [rule, `\`dy/dx = ${polyStr(d)}\`. Substitute x = ${num(x0)}${kind === "gradPoint" ? " (the y-value of the point is not needed)" : ""}: in the calculator, \`${calcExpr(d)}\`.`],
        given: [{ label: "_x", value: x0 }],
        params: { sub: "tangents", kind: "grad", f, x0 },
      },
      exact, false, [y0, evalAt(deriv(f.map((t) => T(t.c, t.p))).map((t) => T(t.c, t.p)), x0) + 1, evalAt(norm(f.filter((t) => t.p).map((t) => T(t.c * t.p, t.p))), x0)], rng,
    );
  }

  if (kind === "xAtGrad") {
    const a = f[0].c, b = evalAt(f.filter((t) => t.p === 1), 1);
    const x0 = rng.int(-6, 6);
    const m = 2 * a * x0 + b;
    return finishNum(
      {
        prompt: `At what value of x does ${CURVE(polyStr(f))} have gradient ${num(m)}?${WHOLE}`,
        explanation: [`Differentiate and set the gradient equal to ${num(m)}.`, `\`dy/dx = ${polyStr(deriv(f))}\``, `\`${polyStr(deriv(f))} = ${num(m)}\``, `\`${num(2 * a)}x = ${num(m)} ${b < 0 ? "+" : MINUS} ${num(Math.abs(b))} = ${num(m - b)}\`, so x = ${num(m - b)} ÷ ${par(2 * a)} = **${num(x0)}**.`].join("\n\n"),
        hints: [rule, `\`dy/dx = ${polyStr(deriv(f))}\`. Set it equal to ${num(m)} and solve the linear equation for x.`],
        params: { sub: "tangents", kind, f, m },
      },
      x0, false, [(m - b) / a, (m + b) / (2 * a), evalAt(f, x0) === x0 ? null : m / (2 * a)].filter((v) => v !== null), rng, 0.25,
    );
  }

  if (kind === "tangentChoice" || kind === "intercept") {
    const x0 = nz(rng, -4, 4);
    const d = deriv(f);
    const m = evalAt(d, x0), y0 = evalAt(f, x0), c = y0 - m * x0;
    const steps = [
      `Find the point: \`y = ${calcExpr(f, par(x0)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = ${num(y0)}, so the point is (${num(x0)}, ${num(y0)}).`,
      `Find the gradient: \`dy/dx = ${polyStr(d)}\`, so at x = ${num(x0)} the gradient is m = ${num(m)}.`,
      `Use \`y = mx + c\` through the point: \`c = y − mx = ${num(y0)} − ${par(m)} × ${par(x0)}\` = ${num(c)}.`,
    ];
    const hints = [
      `A tangent is a straight line \`y = mx + c\`. Its gradient m is \`dy/dx\` at x = ${num(x0)}, and it passes through the curve's point there.`,
      `\`dy/dx = ${polyStr(d)}\`, so put x = ${num(x0)} into it for m, and into the curve for the point's y-value.`,
      `Then \`c = y − m × x\` with that point (in the calculator: \`_y - _m * _x\`, after adding rows for _y and _m).`,
    ];
    const params = { sub: "tangents", kind, f, x0 };
    if (kind === "tangentChoice") {
      const answer = lineStr(m, c);
      const mWrong = evalAt(norm(f.filter((t) => t.p).map((t) => T(t.c * t.p, t.p))), x0);
      const choices = pick4(answer, [lineStr(m, y0), lineStr(m, y0 + m * x0), lineStr(y0, y0 - y0 * x0), lineStr(mWrong, y0 - mWrong * x0)], rng, (k) => lineStr(m, c + (k % 2 ? k : -k)));
      return {
        prompt: `Which is the equation of the tangent to ${CURVE(polyStr(f))} at x = ${num(x0)}?`,
        answerType: "choice", answer, choices,
        explanation: [...steps, `The tangent is **${answer}**.`].join("\n\n"),
        hints, given: [{ label: "_x", value: x0 }], params,
      };
    }
    return finishNum(
      {
        prompt: `The tangent to ${CURVE(polyStr(f))} at x = ${num(x0)} has equation \`y = mx + c\`. Find c, where the tangent crosses the y-axis.${WHOLE}`,
        explanation: [...steps, `So c = **${num(c)}**.`].join("\n\n"),
        hints, given: [{ label: "_x", value: x0 }], params,
      },
      c, false, [y0, y0 + m * x0, m, -c], rng, 0.25,
    );
  }

  // Hard: cubics. f'(x) − k = 3a(x − r1)(x − r2), so the x-values are whole numbers.
  const a = nz(rng, -2, 2);
  const { r1, r2 } = draw(
    () => ({ r1: rng.int(-5, 4), r2: rng.int(-4, 6) }),
    (r) => r.r1 < r.r2 && ((r.r1 + r.r2) % 2 === 0 || a % 2 === 0),
  );
  const k = rng.int(-12, 12);
  const B = (-3 * a * (r1 + r2)) / 2;
  const Cc = 3 * a * r1 * r2 + k;
  const D = rng.int(-9, 9);
  const g = norm([T(a, 3), T(B, 2), T(Cc, 1), T(D, 0)]);
  const d = deriv(g);

  if (kind === "cubicX" || kind === "xMulti") {
    const which = rng.pick(["larger", "smaller"]);
    const target = which === "larger" ? r2 : r1;
    const quad = norm([...d, T(-k, 0)]);
    const steps = [
      `\`dy/dx = ${polyStr(d)}\``,
      `Set it equal to ${num(k)}: \`${polyStr(quad)} = 0\`.`,
      `Divide by ${par(3 * a)}: \`${polyStr(quad.map((t) => T(t.c / (3 * a), t.p)))} = 0\`, which factorises as \`(x ${r1 < 0 ? "+" : MINUS} ${Math.abs(r1)})(x ${r2 < 0 ? "+" : MINUS} ${Math.abs(r2)}) = 0\`.`,
      `So x = ${num(r1)} or x = ${num(r2)}.`,
    ].map((s) => s.replace("(x + 0)", "x").replace("(x − 0)", "x"));
    const hints = [rule, `\`dy/dx = ${polyStr(d)}\`. Set it equal to ${num(k)} and move everything to one side to get a quadratic.`, `\`${polyStr(quad)} = 0\`. Divide through by ${par(3 * a)}, then factorise (or use the quadratic formula).`];
    const params = { sub: "tangents", kind, f: g, k, which };
    const prompt = `The curve \`y = ${polyStr(g)}\` has gradient ${num(k)} at two points.`;
    if (kind === "xMulti") {
      return {
        prompt: prompt + " Find the x-coordinates of both points.",
        answerType: "multi",
        parts: [
          { id: "smaller", label: "Smaller x", ask: `The smaller x-coordinate.${WHOLE}`, answerType: "number", answer: r1, tolerance: 0, hint: `Solve \`${polyStr(quad)} = 0\`: divide by ${par(3 * a)} and factorise.` },
          { id: "larger", label: "Larger x", ask: `The larger x-coordinate.${WHOLE}`, answerType: "number", answer: r2, tolerance: 0, hint: "The quadratic has two roots; this part wants the bigger one." },
        ],
        explanation: [`Differentiate and set the gradient equal to ${num(k)}.`, ...steps, `Smaller: **${num(r1)}**, larger: **${num(r2)}**.`].join("\n\n"),
        hints: hints.slice(0, 2),
        params,
      };
    }
    return finishNum(
      { prompt: `${prompt} Find the ${which} x-coordinate.${WHOLE}`, explanation: [`Differentiate and set the gradient equal to ${num(k)}.`, ...steps, `The ${which} one is **${num(target)}**.`].join("\n\n"), hints, params },
      target, false, [which === "larger" ? r1 : r2, -target, r1 + r2], rng, 0.2,
    );
  }

  // Tangent (or normal) at a point of the cubic.
  const x0 = nz(rng, -3, 3);
  const m = evalAt(d, x0), y0 = evalAt(g, x0), c = y0 - m * x0;
  const steps = [
    `The point: \`y = ${calcExpr(g, par(x0)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = ${num(y0)}.`,
    `\`dy/dx = ${polyStr(d)}\`, so the gradient at x = ${num(x0)} is m = ${num(m)}.`,
  ];
  if (kind === "normal" && m !== 0) {
    const mn = -1 / m;
    const cn = y0 - mn * x0;
    const ok = !nearHalf(mn) && !nearHalf(cn);
    if (ok) {
      return {
        prompt: `Find the equation of the normal to the curve \`y = ${polyStr(g)}\` at x = ${num(x0)}, in the form \`y = mx + c\`. (The normal is perpendicular to the tangent.)`,
        answerType: "multi",
        parts: [
          { id: "m", label: "Gradient m", ask: `The normal's gradient.${DP2}`, answerType: "number", answer: round2(mn), tolerance: 0.005, hint: `Find the tangent's gradient \`dy/dx\` at x = ${num(x0)}; the normal's gradient is −1 divided by it.` },
          { id: "c", label: "Intercept c", ask: `Where it crosses the y-axis.${DP2}`, answerType: "number", answer: round2(cn), tolerance: 0.005, hint: `Use \`c = y − m × x\` with the curve's point at x = ${num(x0)} and the normal's gradient (use full precision, not the rounded m).` },
        ],
        explanation: [`The normal passes through the curve's point with gradient −1/m.`, ...steps, `The normal's gradient is \`−1 / ${par(m)}\` ≈ ${num(mn)}, so m = **${fmt2(mn)}**.`, `\`c = ${num(y0)} − (${num(mn)}) × ${par(x0)}\` ≈ ${num(cn)}, so c = **${fmt2(cn)}**.`].join("\n\n"),
        hints: ["The tangent's gradient is `dy/dx` at the point. A perpendicular line has gradient −1 ÷ (tangent gradient)."],
        given: [{ label: "_x", value: x0 }],
        params: { sub: "tangents", kind: "normal", f: g, x0 },
      };
    }
  }
  return {
    prompt: `Find the equation of the tangent to the curve \`y = ${polyStr(g)}\` at x = ${num(x0)}, in the form \`y = mx + c\`.`,
    answerType: "multi",
    parts: [
      { id: "m", label: "Gradient m", ask: `The tangent's gradient.${WHOLE}`, answerType: "number", answer: m, tolerance: 0, hint: `\`dy/dx = ${polyStr(d)}\`; substitute x = ${num(x0)}.` },
      { id: "c", label: "Intercept c", ask: `Where it crosses the y-axis.${WHOLE}`, answerType: "number", answer: c, tolerance: 0, hint: `Find the curve's y-value at x = ${num(x0)}, then use \`c = y − m × x\`.` },
    ],
    explanation: [`A tangent is \`y = mx + c\` with m = \`dy/dx\` at the point.`, ...steps, `\`c = ${num(y0)} − ${par(m)} × ${par(x0)}\` = ${num(c)}.`, `So m = **${num(m)}** and c = **${num(c)}**: the tangent is ${lineStr(m, c)}.`].join("\n\n"),
    hints: [rule],
    given: [{ label: "_x", value: x0 }],
    params: { sub: "tangents", kind: "tangentMulti", f: g, x0 },
  };
}

// ---------------------------------------------------------------------------------------------
// Stationary points

const NATURES = ["Maximum point", "Minimum point", "Point of inflection", "Not a stationary point"];

function genStationary(difficulty, rng) {
  const rule = "At a stationary point the gradient is zero: solve `dy/dx = 0`.";
  const second = "Classify with the second derivative: `d²y/dx² > 0` means a minimum, `< 0` means a maximum.";

  if (difficulty === "easy" || (difficulty === "medium" && rng.next() < 0.4)) {
    // Quadratic y = a(x − h)² + k, expanded.
    const a = nz(rng, -3, 3), h = rng.int(-6, 6), k = rng.int(-12, 12);
    const f = norm([T(a, 2), T(-2 * a * h, 1), T(a * h * h + k, 0)]);
    const kind = difficulty === "easy" ? rng.pick(["quadX", "quadX", "quadNature"]) : rng.pick(["quadY", "quadY", "quadX"]);
    const d = deriv(f);
    const solve = `\`dy/dx = ${polyStr(d)} = 0\`, so x = ${par(-d.find((t) => t.p === 0)?.c || 0)} ÷ ${par(2 * a)} = ${num(h)}.`;
    const nat = a > 0 ? "Minimum point" : "Maximum point";
    const params = { sub: "stationary", kind, f };
    const prompt0 = `The curve \`y = ${polyStr(f)}\` has one stationary point.`;
    if (kind === "quadNature") {
      return {
        prompt: `${prompt0} What kind of stationary point is it?`,
        answerType: "choice", answer: nat, choices: rng.shuffle(NATURES.slice()),
        explanation: [`Differentiate twice.`, `\`dy/dx = ${polyStr(d)}\` and \`d²y/dx² = ${num(2 * a)}\`.`, `${2 * a > 0 ? "Positive" : "Negative"}, so it is a **${nat.toLowerCase()}**.`].join("\n\n"),
        hints: [rule, `${second} Here \`d²y/dx²\` is just the number ${num(2 * a)}.`],
        params,
      };
    }
    if (kind === "quadX") {
      return finishNum(
        { prompt: `${prompt0} Find its x-coordinate.${WHOLE}`, explanation: [`Set the gradient to zero.`, solve, `So x = **${num(h)}**.`].join("\n\n"), hints: [rule, `\`dy/dx = ${polyStr(d)}\`. Set it equal to 0 and solve for x.`], params },
        h, false, [-h, k, 2 * h], rng, 0.25,
      );
    }
    return finishNum(
      {
        prompt: `${prompt0} Find its y-coordinate.${WHOLE}`,
        explanation: [`Find x first, then substitute into the curve.`, solve, `\`y = ${calcExpr(f, par(h)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = **${num(k)}**.`].join("\n\n"),
        hints: [rule, `\`dy/dx = ${polyStr(d)}\`. Solve \`dy/dx = 0\` for x, then put that x into \`y = ${polyStr(f)}\` (not into dy/dx).`],
        params,
      },
      k, false, [h, evalAt(f, -h), evalAt(f, 0)], rng, 0.25,
    );
  }

  // Cubic with stationary points at whole numbers p < q: y' = 3a(x − p)(x − q).
  const a = rng.pick([1, -1, 1, -1, 2, -2]);
  const { p, q } = draw(() => ({ p: rng.int(-4, 3), q: rng.int(-3, 5) }), (r) => r.p < r.q && ((r.p + r.q) % 2 === 0 || a % 2 === 0));
  const D = rng.int(-10, 10);
  const f = norm([T(a, 3), T((-3 * a * (p + q)) / 2, 2), T(3 * a * p * q, 1), T(D, 0)]);
  const d = deriv(f), d2 = deriv(d);
  const xMax = a > 0 ? p : q, xMin = a > 0 ? q : p;
  const factor = (r) => (r === 0 ? "x" : `(x ${r < 0 ? "+" : MINUS} ${Math.abs(r)})`);
  const solve = [
    `\`dy/dx = ${polyStr(d)}\``,
    `Set it to zero and divide by ${par(3 * a)}: \`${polyStr(d.map((t) => T(t.c / (3 * a), t.p)))} = 0\`, so \`${factor(p)}${factor(q)} = 0\` and x = ${num(p)} or x = ${num(q)}.`,
  ];
  const classify = `\`d²y/dx² = ${polyStr(d2)}\`: at x = ${num(p)} it is ${num(evalAt(d2, p))}, at x = ${num(q)} it is ${num(evalAt(d2, q))}. Negative means maximum, positive means minimum.`;
  const prompt0 = `The curve \`y = ${polyStr(f)}\` has two stationary points.`;
  const hint2 = `\`dy/dx = ${polyStr(d)}\`. Set it to 0, divide by ${par(3 * a)} and factorise.`;
  const params = { sub: "stationary", f };

  const kind = difficulty === "medium" ? rng.pick(["cubicX", "cubicNature"]) : rng.pick(["cubicY", "multi", "multi", "f2"]);
  if (kind === "cubicNature") {
    const x0 = rng.pick([p, q]);
    const nat = x0 === xMax ? "Maximum point" : "Minimum point";
    return {
      prompt: `The curve \`y = ${polyStr(f)}\` has a stationary point at x = ${num(x0)}. What kind is it?`,
      answerType: "choice", answer: nat, choices: rng.shuffle(NATURES.slice()),
      explanation: [`Use the second derivative.`, `\`dy/dx = ${polyStr(d)}\`, which is 0 at x = ${num(x0)}.`, `\`d²y/dx² = ${polyStr(d2)}\` = ${num(evalAt(d2, x0))} at x = ${num(x0)}.`, `${evalAt(d2, x0) > 0 ? "Positive" : "Negative"}, so it is a **${nat.toLowerCase()}**.`].join("\n\n"),
      hints: [second, `\`d²y/dx² = ${polyStr(d2)}\`. Substitute x = ${num(x0)} and look at the sign.`],
      given: [{ label: "_x", value: x0 }],
      params: { ...params, kind, x0 },
    };
  }
  if (kind === "cubicX") {
    const which = rng.pick(["maximum", "minimum"]);
    const ans = which === "maximum" ? xMax : xMin;
    return finishNum(
      { prompt: `${prompt0} Find the x-coordinate of the local ${which}.${WHOLE}`, explanation: [`Find both stationary points, then classify them.`, ...solve, classify, `The local ${which} is at x = **${num(ans)}**.`].join("\n\n"), hints: [rule, hint2, second], params: { ...params, kind, which } },
      ans, false, [which === "maximum" ? xMin : xMax, -ans, p + q], rng, 0.25,
    );
  }
  if (kind === "f2") {
    const which = rng.pick(["maximum", "minimum"]);
    const x0 = which === "maximum" ? xMax : xMin;
    const ans = evalAt(d2, x0);
    return finishNum(
      { prompt: `${prompt0} Find the value of \`d²y/dx²\` at the local ${which}.${WHOLE}`, explanation: [`Find the stationary points, pick the ${which}, then use the second derivative.`, ...solve, classify, `At the local ${which} (x = ${num(x0)}), \`d²y/dx²\` = **${num(ans)}**.`].join("\n\n"), hints: [rule, hint2, `\`d²y/dx² = ${polyStr(d2)}\`. A maximum has a negative value; substitute the right x.`], params: { ...params, kind, which } },
      ans, false, [-ans, evalAt(d2, which === "maximum" ? xMin : xMax), evalAt(d, x0 + 1)], rng, 0.2,
    );
  }
  if (kind === "cubicY") {
    const which = rng.pick(["maximum", "minimum"]);
    const x0 = which === "maximum" ? xMax : xMin;
    const ans = evalAt(f, x0);
    return finishNum(
      { prompt: `${prompt0} Find the y-coordinate of the local ${which}.${WHOLE}`, explanation: [`Find the stationary points, pick the ${which}, then substitute its x into the curve.`, ...solve, classify, `At x = ${num(x0)}: \`y = ${calcExpr(f, par(x0)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = **${num(ans)}**.`].join("\n\n"), hints: [rule, hint2, `${second} Then put the x of the ${which} into \`y = ${polyStr(f)}\`.`], params: { ...params, kind, which } },
      ans, false, [evalAt(f, which === "maximum" ? xMin : xMax), x0, evalAt(d2, x0)], rng, 0.2,
    );
  }
  // multi: the stationary point with the smaller (or larger) x: its x, y and nature.
  const side = rng.pick(["smaller", "larger"]);
  const x0 = side === "smaller" ? p : q;
  const nat = x0 === xMax ? "Maximum point" : "Minimum point";
  return {
    prompt: `${prompt0} Answer about the one with the ${side} x-coordinate.`,
    answerType: "multi",
    parts: [
      { id: "x", label: "x-coordinate", ask: `Its x-coordinate.${WHOLE}`, answerType: "number", answer: x0, tolerance: 0, hint: hint2 },
      { id: "y", label: "y-coordinate", ask: `Its y-coordinate.${WHOLE}`, answerType: "number", answer: evalAt(f, x0), tolerance: 0, hint: `Substitute your x into \`y = ${polyStr(f)}\`.` },
      { id: "nature", label: "Nature", ask: "What kind of stationary point is it?", answerType: "choice", answer: nat, choices: rng.shuffle(NATURES.slice()), hint: `\`d²y/dx² = ${polyStr(d2)}\`. Positive means minimum, negative means maximum.` },
    ],
    explanation: [`Solve \`dy/dx = 0\`, then use the second derivative.`, ...solve, `The ${side} one is x = **${num(x0)}**; \`y = ${calcExpr(f, par(x0)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = **${num(evalAt(f, x0))}**.`, classify, `So it is a **${nat.toLowerCase()}**.`].join("\n\n"),
    hints: [rule],
    params: { ...params, kind: "multi", side },
  };
}

// ---------------------------------------------------------------------------------------------
// Integration

// Whole-number integrals: the coefficient of xⁿ is a multiple of n + 1.
const intMult = (n) => n + 1;

function intMistakes(f) {
  const out = [
    deriv(f), // differentiated instead
    norm(f.map((t) => T(t.c, t.p + t.q, t.q))), // raised the power but didn't divide
    norm(f.map((t) => T((t.c * t.q) / (t.p + t.q), t.p, t.q))), // divided but kept the power
    norm(f.map((t) => (t.p === 0 ? T(t.c, 0) : iTerm(t)))), // the constant stayed a constant
    norm(f.map((t) => (t.p + 2 * t.q !== 0 ? T((t.c * t.q) / (t.p + 2 * t.q), t.p + t.q, t.q) : iTerm(t)))), // divided by one too many
  ];
  return out.filter((ts) => ts.length && coefInts(ts)).map((ts) => `${polyStr(ts)} + C`);
}

function hardIntTerms(rng) {
  // Powers whose integrals have whole-number coefficients after the right multiple.
  const POOL = [[1, 2], [-1, 2], [3, 2], [-2, 1], [-3, 1], [1, 1], [2, 1], [0, 1]];
  return draw(
    () => {
      const picks = rng.shuffle(POOL).slice(0, rng.int(2, 3));
      return norm(
        picks.map(([p, q]) => {
          const np = p + q;
          const unit = Math.abs(np) / gcd(q, Math.abs(np));
          return T(unit * nz(rng, -3, 3) * (unit === 1 ? rng.int(1, 3) : 1), p, q);
        }),
      );
    },
    (ts) => ts.length >= 2 && ts.some((t) => t.q !== 1 || t.p < 0),
  );
}

// Signed definite integral from a to b using the antiderivative.
const defInt = (f, a, b) => evalAt(integ(f), b) - evalAt(integ(f), a);

function genIntegration(difficulty, rng) {
  const ruleI = "Integrate each term: raise the power by 1, then divide by the new power. Add + C for an indefinite integral.";
  const ruleD = "For a definite integral, find the antiderivative F(x), then work out F(upper) − F(lower). No + C is needed.";
  let kind;
  if (difficulty === "easy") kind = rng.pick(["indef", "indef", "defSimple", "defSimple"]);
  else if (difficulty === "medium") kind = rng.pick(["indef", "def", "def", "area"]);
  else if (difficulty === "hard") kind = rng.pick(["enclosed", "split", "fracDef", "multi"]);
  else throw new Error(`Unknown difficulty: ${difficulty}`);

  if (kind === "indef") {
    const f = randPoly(rng, difficulty === "easy" ? rng.int(1, 2) : rng.int(2, 3), 4, 5, intMult);
    const F = integ(f);
    const answer = `${polyStr(F)} + C`;
    const choices = pick4(answer, intMistakes(f), rng, (k) => `${polyStr([...F, T(k % 2 ? k : -k, 1)])} + C`);
    const lead = f[0];
    return {
      prompt: `Find \`∫ (${polyStr(f)}) dx\`.`,
      answerType: "choice", answer, choices,
      explanation: [`Integrate term by term.`, intLines(f).join("\n"), `So the integral is **${answer}**.`].join("\n\n"),
      hints: [ruleI, `For example \`${lead.c < 0 ? MINUS : ""}${body(lead)}\` becomes \`${polyStr([iTerm(lead)])}\`. A constant k becomes kx.`],
      params: { sub: "integration", kind, f },
    };
  }

  if (kind === "defSimple" || kind === "def" || kind === "area") {
    let f, a, b;
    if (kind === "defSimple") {
      f = draw(() => randPoly(rng, rng.int(1, 2), 3, 3, intMult), (ts) => ts.length <= 2, 40);
      a = rng.int(0, 2);
      b = a + rng.int(1, 3);
    } else if (kind === "def") {
      f = randPoly(rng, rng.int(2, 3), 2, 4, intMult);
      a = rng.int(-3, 2);
      b = a + rng.int(1, 4);
    } else {
      // Positive on [a, b], so the integral is the area.
      ({ f, a, b } = draw(
        () => {
          const ff = randPoly(rng, 2, 2, 5, intMult);
          const aa = rng.int(-2, 3);
          return { f: ff, a: aa, b: aa + rng.int(1, 3) };
        },
        (o) => [...Array(41).keys()].every((i) => evalAt(o.f, o.a + ((o.b - o.a) * i) / 40) > 0),
      ));
    }
    const F = integ(f);
    const exact = defInt(f, a, b);
    const prompt =
      kind === "area"
        ? `The curve \`y = ${polyStr(f)}\` lies above the x-axis between x = ${num(a)} and x = ${num(b)}. Find the area between the curve, the x-axis and these two lines.${WHOLE}`
        : `Evaluate \`∫ (${polyStr(f)}) dx\` from x = ${num(a)} to x = ${num(b)}.${WHOLE}`;
    const explanation = [
      kind === "area" ? "The curve is above the x-axis, so the area is the definite integral." : "Integrate, then substitute the limits.",
      intLines(f).join("\n"),
      `\`F(x) = ${polyStr(F)}\``,
      `\`F(${num(b)}) = ${num(evalAt(F, b))}\` and \`F(${num(a)}) = ${num(evalAt(F, a))}\`.`,
      `\`F(${num(b)}) − F(${num(a)})\` = **${num(exact)}**.`,
    ].join("\n\n");
    return finishNum(
      {
        prompt, explanation,
        hints: [ruleD, `\`F(x) = ${polyStr(F)}\`. Substitute x = ${num(b)} and x = ${num(a)} and subtract, upper minus lower (in the calculator, put F in rows for \`_b\` and \`_a\`).`],
        given: [{ label: "_a", value: a }, { label: "_b", value: b }],
        params: { sub: "integration", kind, f, a, b },
      },
      exact, false, [-exact, evalAt(F, b), evalAt(f, b) - evalAt(f, a), evalAt(deriv(f), b) - evalAt(deriv(f), a)], rng, 0.25,
    );
  }

  if (kind === "enclosed") {
    const { s, r1, r2, ex } = draw(
      () => {
        const s0 = rng.int(1, 3), a0 = rng.int(-4, 3), w = rng.int(2, 6);
        return { s: s0, r1: a0, r2: a0 + w, ex: (s0 * w ** 3) / 6 };
      },
      (o) => !nearHalf(o.ex),
    );
    // y = s(x − r1)(r2 − x) = −s x² + s(r1 + r2) x − s r1 r2
    const f = norm([T(-s, 2), T(s * (r1 + r2), 1), T(-s * r1 * r2, 0)]);
    const F = integ(f);
    return {
      prompt: `The curve \`y = ${polyStr(f)}\` crosses the x-axis at two points and lies above it in between. Find the area enclosed by the curve and the x-axis.${DP2}`,
      answerType: "number", answer: round2(ex), tolerance: 0.005,
      explanation: [
        `Find where the curve meets the x-axis, then integrate between those points.`,
        `\`${polyStr(f)} = 0\` gives x = ${num(r1)} and x = ${num(r2)}.`,
        `\`F(x) = ${polyStr(F)}\``,
        `Area = \`F(${num(r2)}) − F(${num(r1)})\` = ${rat(evalAt(F, r2) - evalAt(F, r1))} ≈ ${num(ex)}, which rounds to **${fmt2(ex)}**.`,
      ].join("\n\n"),
      hints: [
        `Solve \`${polyStr(f)} = 0\` to find the limits (divide by ${par(-s)} and factorise).`,
        `\`F(x) = ${polyStr(F)}\`. Work out F at the larger root minus F at the smaller root, then round to 2 decimal places.`,
      ],
      params: { sub: "integration", kind, f, a: r1, b: r2, rounded: true },
    };
  }

  if (kind === "split") {
    // y = s(x − r)(x − t), with exactly one root strictly inside [a, b].
    const o = draw(
      () => {
        const s0 = rng.pick([1, -1, 2, -2]), r = rng.int(-4, 2), t = r + rng.int(2, 5);
        const inside = rng.pick(["r", "t"]);
        const root = inside === "r" ? r : t;
        const lo = inside === "r" ? root - rng.int(1, 2) : rng.int(r + 1, t - 1);
        const hi = inside === "r" ? rng.int(r + 1, t) : root + rng.int(1, 2);
        const ff = norm([T(s0, 2), T(-s0 * (r + t), 1), T(s0 * r * t, 0)]);
        const ex = Math.abs(defInt(ff, lo, root)) + Math.abs(defInt(ff, root, hi));
        return { f: ff, a: lo, b: hi, root, ex, net: defInt(ff, lo, hi) };
      },
      (v) => v.a < v.root && v.root < v.b && !nearHalf(v.ex) && Math.abs(v.ex - Math.abs(v.net)) > 0.05,
    );
    const { f, a, b, root, ex, net } = o;
    const F = integ(f);
    const p1 = defInt(f, a, root), p2 = defInt(f, root, b);
    return {
      prompt: `Find the total area between the curve \`y = ${polyStr(f)}\` and the x-axis from x = ${num(a)} to x = ${num(b)}. Count every region as positive.${DP2}`,
      answerType: "number", answer: round2(ex), tolerance: 0.005,
      explanation: [
        `The curve crosses the x-axis at x = ${num(root)} inside the interval, so split the integral there.`,
        `\`F(x) = ${polyStr(F)}\``,
        `From ${num(a)} to ${num(root)}: \`F(${num(root)}) − F(${num(a)})\` = ${rat(p1)}. From ${num(root)} to ${num(b)}: ${rat(p2)}.`,
        `One part is below the axis, so take the size of each: ${rat(Math.abs(p1))} + ${rat(Math.abs(p2))} ≈ ${num(ex)}, which rounds to **${fmt2(ex)}**.`,
      ].join("\n\n"),
      hints: [
        `First find where \`${polyStr(f)} = 0\` and check which root lies between ${num(a)} and ${num(b)}.`,
        `Integrate separately on each side of that root with \`F(x) = ${polyStr(F)}\`. One integral comes out negative because that part is below the axis.`,
        `Add the sizes (absolute values) of the two parts, then round to 2 decimal places.`,
      ],
      given: [{ label: "_a", value: a }, { label: "_b", value: b }],
      params: { sub: "integration", kind, f, a, b, rounded: true, net },
    };
  }

  // fracDef and multi: powers like √x and 1/x².
  const f = hardIntTerms(rng);
  const F = integ(f);
  const pairs = [[1, 4], [1, 9], [4, 9], [1, 2], [2, 5], [1, 3], [4, 16], [2, 4]];
  let [a, b] = rng.pick(pairs);
  for (let i = 0; i < pairs.length && nearHalf(defInt(f, a, b)); i++) [a, b] = pairs[(pairs.findIndex((pp) => pp[0] === a && pp[1] === b) + 1) % pairs.length];
  const exact = defInt(f, a, b);
  const rewrite = `As powers of x: \`${polyStr(f)}\`.`;
  const explanation = [
    `Write each term as a power of x, integrate, then substitute the limits.`,
    rewrite,
    intLines(f).join("\n"),
    `\`F(x) = ${polyStr(F)}\``,
    `\`F(${num(b)}) − F(${num(a)})\` ≈ ${num(exact)}, which rounds to **${fmt2(exact)}**.`,
  ].join("\n\n");
  const params = { sub: "integration", kind, f, a, b, rounded: true };
  if (kind === "multi") {
    const answer = `${polyStr(F)} + C`;
    const choices = pick4(answer, intMistakes(f), rng, (k) => `${polyStr([...F, T(k % 2 ? k : -k, 1)])} + C`);
    return {
      prompt: `Let \`f(x) = ${prettyStr(f)}\`.`,
      answerType: "multi",
      parts: [
        { id: "integral", label: "Integral", ask: `Which is \`∫ f(x) dx\`?${NAT_NOTE}`, answerType: "choice", answer, choices, hint: `${rewrite} Then raise each power by 1 and divide by the new power.` },
        { id: "value", label: "Definite value", ask: `Evaluate \`∫ f(x) dx\` from x = ${num(a)} to x = ${num(b)}.${DP2}`, answerType: "number", answer: round2(exact), tolerance: 0.005, hint: "Use your antiderivative without + C: F(upper) − F(lower). In the calculator write powers like `_b^(3/2)`." },
      ],
      explanation,
      hints: [ruleI],
      given: [{ label: "_a", value: a }, { label: "_b", value: b }],
      params,
    };
  }
  return {
    prompt: `Evaluate \`∫ (${prettyStr(f)}) dx\` from x = ${num(a)} to x = ${num(b)}.${DP2}`,
    answerType: "number", answer: round2(exact), tolerance: 0.005,
    explanation,
    hints: [`${rewrite} Negative and fractional powers follow the same rule.`, ruleI.replace(" Add + C for an indefinite integral.", ""), `\`F(x) = ${polyStr(F)}\`. Work out F(${num(b)}) − F(${num(a)}) (in the calculator: \`${calcExpr(F, "_b")}\` minus the same with \`_a\`), then round.`],
    given: [{ label: "_a", value: a }, { label: "_b", value: b }],
    params,
  };
}

// ---------------------------------------------------------------------------------------------
// Expert: multi-step questions (easy/medium/hard above are untouched; this branch runs first and
// only for "expert", so the other levels never consume extra rng draws). Every template draws all
// of its rng values before building text; hints use only values already drawn.

const X_NATURES = NATURES.slice();
const givenRows = (rows) => rows.map(([label, value]) => ({ label, value }));
// "kx³ + 2x² − 5x + 1": the coefficient of x^kPow shown as the letter k.
function polyWithK(coefs, kPow, letter = "k") {
  // coefs: { power: value } for powers 3..0 (value ignored at kPow)
  const out = [];
  for (let n = 3; n >= 0; n--) {
    if (n === kPow) {
      out.push({ neg: false, s: `${letter}${powStr(n, 1)}` });
      continue;
    }
    const c = coefs[n] || 0;
    if (!c) continue;
    out.push({ neg: c < 0, s: body(T(c, n)) });
  }
  return out.map((t, i) => (i === 0 ? (t.neg ? MINUS : "") + t.s : (t.neg ? ` ${MINUS} ` : " + ") + t.s)).join("");
}
// "2x² + bx + c" with the x and constant coefficients as letters.
function quadLetters(a) {
  const lead = a === 1 ? "x²" : a === -1 ? `${MINUS}x²` : `${num(a)}x²`;
  return `${lead} + bx + c`;
}
// Interval wording for "where is f increasing" choices.
const between = (lo, hi) => `${num(lo)} < x < ${num(hi)}`;
const outside = (lo, hi) => `x < ${num(lo)} or x > ${num(hi)}`;

// derivatives / expert, template 0: unknown coefficient from a gradient, then a second derivative.
function genDerivBack(rng) {
  const kPow = rng.pick([3, 2]);
  const k = nz(rng, -5, 5);
  const a3 = nz(rng, -4, 4); // used when k sits on x²
  const b = rng.int(-6, 6);
  const c = rng.int(-9, 9);
  const d = rng.int(-9, 9);
  const x0 = nz(rng, -3, 3);
  let x2 = rng.int(-3, 3);
  if (x2 === x0) x2 = x0 === 3 ? -3 : x0 + 1;

  const coefs = kPow === 3 ? { 3: k, 2: b, 1: c, 0: d } : { 3: a3, 2: k, 1: c, 0: d };
  const f = norm([T(coefs[3], 3), T(coefs[2], 2), T(coefs[1], 1), T(coefs[0], 0)]);
  const d1 = deriv(f), d2 = deriv(d1);
  const G = evalAt(d1, x0);
  const ans2 = evalAt(d2, x2);
  const shown = polyWithK(coefs, kPow);
  // f'(x0) = K·k + R, where K is the coefficient k picks up.
  const K = kPow === 3 ? 3 * x0 * x0 : 2 * x0;
  const R = G - K * k;
  const kTerm = kPow === 3 ? "kx³" : "kx²";
  const dkTerm = kPow === 3 ? "3kx²" : "2kx";
  const dRest = deriv(f.filter((t) => t.p !== kPow));
  const dShown = `${dkTerm}${dRest.length ? (dRest[0].c < 0 ? ` ${MINUS} ` : " + ") + polyStr(dRest).replace(/^−/, "") : ""}`;
  const steps = [
    `Differentiate, keeping k as a letter: \`f'(x) = ${dShown}\`.`,
    `Substitute x = ${num(x0)}: \`f'(${num(x0)}) = ${num(K)}k ${R < 0 ? MINUS : "+"} ${num(Math.abs(R))}\`.`,
    `Set it equal to ${num(G)}: \`${num(K)}k = ${num(G - R)}\`, so **k = ${num(k)}**.`,
    `Now \`f(x) = ${polyStr(f)}\`, \`f'(x) = ${polyStr(d1)}\` and \`f''(x) = ${polyStr(d2)}\`.`,
    `\`f''(${num(x2)})\` = **${num(ans2)}**.`,
  ];
  return {
    prompt: `\`f(x) = ${shown}\`, where k is a constant. The gradient of the curve at x = ${num(x0)} is ${num(G)}.`,
    answerType: "multi",
    parts: [
      { id: "k", label: "k", ask: `Find k.${WHOLE}`, answerType: "number", answer: k, tolerance: 0,
        hint: `Differentiate with k kept as a letter (\`${kTerm}\` becomes \`${dkTerm}\`), substitute x = ${num(x0)}, and set the result equal to ${num(G)}.` },
      { id: "second", label: "Second derivative", ask: `Using your k, find \`f''(${num(x2)})\`.${WHOLE}`, answerType: "number", answer: ans2, tolerance: 0,
        hint: `Put your k back into f(x), differentiate twice, then substitute x = ${num(x2)}.` },
    ],
    explanation: [`Work backwards from the gradient to find k, then differentiate twice.`, ...steps].join("\n\n"),
    hints: [
      "The gradient at a point is `f'(x)` at that x. Differentiate term by term, treating k like any other number.",
      `\`f'(x) = ${dShown}\`. Substitute x = ${num(x0)}: you get a linear equation in k.`,
    ],
    given: givenRows([["_x0", x0], ["_G", G], ["_x2", x2]]),
    params: { sub: "expert", kind: "x-dback", f: [], coefs, kPow, x0, G, x2 },
  };
}

// derivatives / expert, template 1: a quotient to rewrite as powers, then f'(s) and f''(s).
function genDerivQuot(rng) {
  const den = rng.pick(["sqrt", "x", "x2"]);
  const p = nz(rng, -6, 6);
  const q = nz(rng, -9, 9);
  const r = nz(rng, -9, 9);
  const pool = den === "sqrt" ? [4, 9, 1, 16, 25] : [2, 3, 1, 4, 5];
  let i = rng.int(0, pool.length - 1);

  const dHalf = den === "sqrt" ? 1 : den === "x" ? 2 : 4; // denominator x^(dHalf/2)
  const f = norm([T(p, 4 - dHalf, 2), T(q, 2 - dHalf, 2), T(r, -dHalf, 2)]);
  const d1 = deriv(f), d2 = deriv(d1);
  let s = pool[i];
  for (let tries = 0; tries < pool.length && (nearHalf(evalAt(d1, s)) || nearHalf(evalAt(d2, s))); tries++) {
    i = (i + 1) % pool.length;
    s = pool[i];
  }
  const v1 = evalAt(d1, s), v2 = evalAt(d2, s);
  const numer = polyStr([T(p, 2), T(q, 1), T(r, 0)]);
  const denStr = den === "sqrt" ? "√x" : den === "x" ? "x" : "x²";
  const steps = [
    `Divide each term of the top by ${denStr}: \`f(x) = ${polyStr(f)}\`.`,
    diffLines(f).join("\n"),
    `\`f'(x) = ${polyStr(d1)}\``,
    `Differentiate again: \`f''(x) = ${polyStr(d2)}\``,
    `At x = ${num(s)}: \`f'(${num(s)})\` ≈ ${num(v1)}, which rounds to **${fmt2(v1)}**, and \`f''(${num(s)})\` ≈ ${num(v2)}, which rounds to **${fmt2(v2)}**.`,
  ];
  return {
    prompt: `\`f(x) = (${numer})/${denStr}\` for x > 0.`,
    answerType: "multi",
    parts: [
      { id: "first", label: "First derivative", ask: `Find \`f'(${num(s)})\`.${DP2}`, answerType: "number", answer: round2(v1), tolerance: 0.005,
        hint: `Split the fraction into ${3} separate powers of x first, then use the power rule on each.` },
      { id: "second", label: "Second derivative", ask: `Find \`f''(${num(s)})\`.${DP2}`, answerType: "number", answer: round2(v2), tolerance: 0.005,
        hint: "Differentiate your `f'(x)` once more, term by term, then substitute." },
    ],
    explanation: [`There is no quotient rule needed: rewrite as powers of x, then differentiate twice.`, ...steps].join("\n\n"),
    hints: [
      `Divide every term of \`${numer}\` by ${denStr}${den === "sqrt" ? " (that is, by x^(1/2))" : ""}, and write each result as a single power of x.`,
      `As powers: \`f(x) = ${polyStr(f)}\`. Now multiply by each power and lower it by 1.`,
      `In the calculator, put \`_x\` = ${num(s)} and type each term with powers like \`_x^(-3/2)\`. Round at the end.`,
    ],
    given: givenRows([["_x", s]]),
    params: { sub: "expert", kind: "x-dquot", f: [], p, q, r, dHalf, s },
  };
}

// derivatives / expert, template 2: where a cubic increases, its inflection point and the gradient there.
function genDerivShape(rng) {
  const a = rng.pick([1, -1, 2, -2, 1, -1]);
  const { p, q } = draw(() => ({ p: rng.int(-5, 3), q: rng.int(-3, 6) }), (o) => o.p < o.q && (o.p + o.q) % 2 === 0 && o.p + o.q !== 0);
  const D = rng.int(-9, 9);
  const f = norm([T(a, 3), T((-3 * a * (p + q)) / 2, 2), T(3 * a * p * q, 1), T(D, 0)]);
  const d1 = deriv(f), d2 = deriv(d1);
  const xi = (p + q) / 2;
  const gi = evalAt(d1, xi);
  const inc = a > 0 ? outside(p, q) : between(p, q);
  const choices = rng.shuffle([inc, a > 0 ? between(p, q) : outside(p, q), outside(-q, -p), between(-q, -p)]);
  const factor = (v) => (v === 0 ? "x" : `(x ${v < 0 ? "+" : MINUS} ${Math.abs(v)})`);
  const steps = [
    `\`f'(x) = ${polyStr(d1)} = ${num(3 * a)}${factor(p)}${factor(q)}\`, which is 0 at x = ${num(p)} and x = ${num(q)}.`,
    `${a > 0 ? "The x² coefficient of f'(x) is positive, so f'(x) > 0 outside the roots" : "The x² coefficient of f'(x) is negative, so f'(x) > 0 between the roots"}: f is increasing for **${inc}**.`,
    `\`f''(x) = ${polyStr(d2)} = 0\` gives x = **${num(xi)}** (halfway between the stationary points).`,
    `\`f'(${num(xi)})\` = **${num(gi)}**: the ${a > 0 ? "steepest downhill" : "steepest uphill"} gradient between the stationary points.`,
  ];
  return {
    prompt: `\`f(x) = ${polyStr(f)}\`.`,
    answerType: "multi",
    parts: [
      { id: "inc", label: "Increasing", ask: "For which x is f increasing (f'(x) > 0)?", answerType: "choice", answer: inc, choices,
        hint: `Factorise \`f'(x) = ${polyStr(d1)}\`, then test the sign of f'(x) between and outside its roots.` },
      { id: "xinf", label: "Inflection x", ask: `The x-coordinate of the point of inflection (where \`f''(x) = 0\`).${WHOLE}`, answerType: "number", answer: xi, tolerance: 0,
        hint: `Differentiate f'(x) again and solve \`f''(x) = 0\`.` },
      { id: "ginf", label: "Gradient there", ask: `The gradient \`f'(x)\` at the point of inflection.${WHOLE}`, answerType: "number", answer: gi, tolerance: 0,
        hint: "Substitute the inflection x into f'(x), not into f(x)." },
    ],
    explanation: [`Use the first derivative for where f rises and falls, and the second derivative for the inflection.`, ...steps].join("\n\n"),
    hints: [
      "f is increasing where `f'(x) > 0`. Find where f'(x) = 0 first: those x-values split the number line into three pieces.",
      `\`f'(x) = ${polyStr(d1)}\`. Divide by ${par(3 * a)} and factorise, then check the sign of f'(x) on each piece (try x = ${num(q + 1)}).`,
      "The point of inflection is where `f''(x) = 0`; for a cubic it lies exactly halfway between the stationary points.",
    ],
    params: { sub: "expert", kind: "x-dshape", f },
  };
}

// tangents / expert, template 0: work backwards from a given tangent to the curve's coefficients.
function genTanBack(rng) {
  const a = nz(rng, -3, 3);
  const b = rng.int(-8, 8);
  const c = rng.int(-9, 9);
  const t = nz(rng, -4, 4);
  const m = 2 * a * t + b;
  const y0 = a * t * t + b * t + c;
  const k = y0 - m * t;
  const tangent = lineStr(m, k);
  const steps = [
    `\`dy/dx = ${num(2 * a)}x + b\`, so the gradient at x = ${num(t)} is \`${num(2 * a * t)} + b\`.`,
    `It must equal the tangent's gradient ${num(m)}: \`b = ${num(m)} ${2 * a * t < 0 ? "+" : MINUS} ${num(Math.abs(2 * a * t))}\` = **${num(b)}**.`,
    `The tangent and curve share the point at x = ${num(t)}: on the tangent, y = ${par(m)} × ${par(t)} ${k < 0 ? MINUS : "+"} ${num(Math.abs(k))} = ${num(y0)}.`,
    `On the curve: \`${num(a)} × ${par(t)}² + ${par(b)} × ${par(t)} + c = ${num(y0)}\`, so \`c = ${num(y0)} − ${par(a * t * t + b * t)}\` = **${num(c)}**.`,
  ];
  return {
    prompt: `The tangent to the curve \`y = ${quadLetters(a)}\` at the point where x = ${num(t)} is \`${tangent}\`. Find the constants b and c.`,
    answerType: "multi",
    parts: [
      { id: "b", label: "b", ask: `Value of b.${WHOLE}`, answerType: "number", answer: b, tolerance: 0,
        hint: `Differentiate the curve with b as a letter and match its gradient at x = ${num(t)} to the tangent's gradient.` },
      { id: "c", label: "c", ask: `Value of c.${WHOLE}`, answerType: "number", answer: c, tolerance: 0,
        hint: `Find the tangent's y-value at x = ${num(t)}; the curve has the same y-value there. Use your b.` },
    ],
    explanation: [`A tangent touches the curve: same gradient and same point.`, ...steps].join("\n\n"),
    hints: [
      `Two facts at x = ${num(t)}: the curve's gradient equals the tangent's gradient, and the curve passes through the tangent's point.`,
      `\`dy/dx = ${num(2 * a)}x + b\`. The tangent \`${tangent}\` has gradient ${num(m)}.`,
      `The point: substitute x = ${num(t)} into the tangent's equation to get y, then into the curve to get an equation in c.`,
    ],
    given: givenRows([["_t", t], ["_m", m], ["_k", k]]),
    params: { sub: "expert", kind: "x-tback", f: [], a, t, m, k },
  };
}

// tangents / expert, template 1: tangent meets the axes; area of the triangle it makes with them.
function genTanTriangle(rng) {
  const o = draw(
    () => {
      const ff = randPoly(rng, 2, 3, 8);
      const xx = nz(rng, -4, 4);
      const dd = deriv(ff);
      const mm = evalAt(dd, xx), yy = evalAt(ff, xx), cc = yy - mm * xx;
      return { f: ff, x0: xx, m: mm, y0: yy, c: cc };
    },
    (v) => v.m !== 0 && v.c !== 0 && !nearHalf(-v.c / v.m) && !nearHalf((v.c * v.c) / Math.abs(2 * v.m)),
  );
  const { f, x0, m, y0, c } = o;
  const xi = -c / m;
  const area = (c * c) / Math.abs(2 * m);
  const steps = [
    `The point: \`y = ${calcExpr(f, par(x0)).replace(/\*/g, " × ").replace(/-/g, "−")}\` = ${num(y0)}.`,
    `\`dy/dx = ${polyStr(deriv(f))}\`, so m = ${num(m)} at x = ${num(x0)}.`,
    `\`c = ${num(y0)} − ${par(m)} × ${par(x0)}\` = **${num(c)}**, so the tangent is \`${lineStr(m, c)}\`.`,
    `It crosses the x-axis where y = 0: \`x = −c / m = ${rat(xi)}\` ≈ ${num(xi)}, which rounds to **${fmt2(xi)}**.`,
    `The triangle has legs |${num(c)}| (up the y-axis) and |${rat(xi)}| (along the x-axis): area = ½ × ${num(Math.abs(c))} × ${rat(Math.abs(xi))} ≈ ${num(area)}, which rounds to **${fmt2(area)}**.`,
  ];
  return {
    prompt: `The tangent to the curve \`y = ${polyStr(f)}\` at x = ${num(x0)} crosses both axes, making a triangle with them.`,
    answerType: "multi",
    parts: [
      { id: "c", label: "y-intercept", ask: `Where the tangent crosses the y-axis.${WHOLE}`, answerType: "number", answer: c, tolerance: 0,
        hint: `Find the gradient m and the point at x = ${num(x0)}, then \`c = y − m × x\`.` },
      { id: "xint", label: "x-intercept", ask: `Where the tangent crosses the x-axis.${DP2}`, answerType: "number", answer: round2(xi), tolerance: 0.005,
        hint: "Set y = 0 in `y = mx + c` and solve for x." },
      { id: "area", label: "Triangle area", ask: `The area of the triangle made by the tangent and the two axes.${DP2}`, answerType: "number", answer: round2(area), tolerance: 0.005,
        hint: "It is a right-angled triangle at the origin: ½ × (distance along x) × (distance along y). Use sizes, not signs." },
    ],
    explanation: [`Find the tangent, then where it meets each axis.`, ...steps].join("\n\n"),
    hints: [
      `Tangent at x = ${num(x0)}: m is \`dy/dx\` there, and the point is (${num(x0)}, y) on the curve.`,
      `\`dy/dx = ${polyStr(deriv(f))}\`. Then \`c = y − m × x\` (calculator: \`_y - _m*_x\` after adding rows for _y and _m).`,
      "The axes and the tangent make a right-angled triangle with its corner at the origin.",
    ],
    given: givenRows([["_x", x0]]),
    params: { sub: "expert", kind: "x-ttri", f, x0 },
  };
}

// tangents / expert, template 2: the tangent to a cubic meets the curve again.
function genTanAgain(rng) {
  const a = rng.pick([1, -1]);
  const t = nz(rng, -3, 3);
  const B = draw(() => rng.int(-6, 6), (v) => v !== -3 * a * t);
  const C = rng.int(-9, 9);
  const D = rng.int(-9, 9);
  const f = norm([T(a, 3), T(B, 2), T(C, 1), T(D, 0)]);
  const d1 = deriv(f);
  const m = evalAt(d1, t), y0 = evalAt(f, t), k = y0 - m * t;
  const s = -2 * t - B / a;
  const ys = evalAt(f, s);
  const diff = norm([...f, T(-m, 1), T(-k, 0)]);
  const factor = (v) => (v === 0 ? "x" : `(x ${v < 0 ? "+" : MINUS} ${Math.abs(v)})`);
  const steps = [
    `At x = ${num(t)}: y = ${num(y0)} and \`dy/dx = ${polyStr(d1)}\` = **${num(m)}**, so the tangent is \`${lineStr(m, k)}\`.`,
    `Where they meet: \`${polyStr(f)} = ${lineStr(m, k).slice(4)}\`, so \`${polyStr(diff)} = 0\`.`,
    `x = ${num(t)} is a double root (the tangent touches there), so this factorises as \`${a === -1 ? MINUS : ""}${factor(t)}²${factor(s)} = 0\`.`,
    `The other meeting point is x = **${num(s)}**, where \`y = ${polyStr(f)}\` = **${num(ys)}**.`,
  ];
  return {
    prompt: `The tangent to the curve \`y = ${polyStr(f)}\` at x = ${num(t)} meets the curve again at another point.`,
    answerType: "multi",
    parts: [
      { id: "m", label: "Gradient", ask: `The gradient of the tangent.${WHOLE}`, answerType: "number", answer: m, tolerance: 0,
        hint: `Differentiate and substitute x = ${num(t)}.` },
      { id: "x", label: "Other x", ask: `The x-coordinate where the tangent meets the curve again.${WHOLE}`, answerType: "number", answer: s, tolerance: 0,
        hint: `Set curve = tangent. The cubic you get has x = ${num(t)} as a double root; the sum of its three roots is −(x² coefficient) ÷ (x³ coefficient).` },
      { id: "y", label: "Other y", ask: `The y-coordinate of that point.${WHOLE}`, answerType: "number", answer: ys, tolerance: 0,
        hint: "Substitute your x into the curve (or the tangent: they agree there)." },
    ],
    explanation: [`Find the tangent, then solve curve = tangent.`, ...steps].join("\n\n"),
    hints: [
      `Find the tangent at x = ${num(t)} first: m from \`dy/dx\`, the point from the curve, then \`c = y − m × x\`.`,
      "Set the curve equal to the tangent and move everything to one side. You get a cubic equal to 0.",
      `The tangent touches at x = ${num(t)}, so \`(x ${t < 0 ? "+" : MINUS} ${Math.abs(t)})²\` is a factor. Divide it out to find the last factor.`,
    ],
    given: givenRows([["_t", t]]),
    params: { sub: "expert", kind: "x-tagain", f, t },
  };
}

// stationary / expert, template 0: build the cubic from its stationary points (working backwards).
function genStatBack(rng) {
  const a = rng.pick([1, -1, 2, -2]);
  const { p, q } = draw(() => ({ p: rng.int(-4, 3), q: rng.int(-3, 5) }), (o) => o.p < o.q && ((o.p + o.q) % 2 === 0 || a % 2 === 0));
  const K = rng.int(-15, 15);
  const which = rng.pick(["maximum", "minimum"]);
  const b = (-3 * a * (p + q)) / 2;
  const c = 3 * a * p * q;
  const xMax = a > 0 ? p : q, xMin = a > 0 ? q : p;
  const xw = which === "maximum" ? xMax : xMin;
  const d = K - (a * xw ** 3 + b * xw ** 2 + c * xw);
  const f = norm([T(a, 3), T(b, 2), T(c, 1), T(d, 0)]);
  const lead = a === 1 ? "x³" : a === -1 ? `${MINUS}x³` : `${num(a)}x³`;
  const factor = (v) => (v === 0 ? "x" : `(x ${v < 0 ? "+" : MINUS} ${Math.abs(v)})`);
  const steps = [
    `Stationary points at x = ${num(p)} and x = ${num(q)} mean \`dy/dx = ${num(3 * a)}${factor(p)}${factor(q)}\` (the leading term of dy/dx is ${num(3 * a)}x²).`,
    `Expand: \`dy/dx = ${polyStr(norm([T(3 * a, 2), T(2 * b, 1), T(c, 0)]))}\`. Compare with \`${num(3 * a)}x² + 2bx + c\`: **b = ${num(b)}** and **c = ${num(c)}**.`,
    `The local ${which} is at x = ${num(xw)} (${a > 0 ? "a positive" : "a negative"} x³ coefficient puts the maximum first). There y = ${num(K)}, so \`d = ${num(K)} − (${num(a * xw ** 3 + b * xw ** 2 + c * xw)})\` = **${num(d)}**.`,
    `So \`y = ${polyStr(f)}\`.`,
  ];
  return {
    prompt: `The curve \`y = ${lead} + bx² + cx + d\` has stationary points at x = ${num(p)} and x = ${num(q)}. Its local ${which} has y-coordinate ${num(K)}.`,
    answerType: "multi",
    parts: [
      { id: "b", label: "b", ask: `Value of b.${WHOLE}`, answerType: "number", answer: b, tolerance: 0,
        hint: `\`dy/dx = ${num(3 * a)}x² + 2bx + c\` must have roots ${num(p)} and ${num(q)}, so it equals \`${num(3 * a)}${factor(p)}${factor(q)}\`. Expand and compare.` },
      { id: "c", label: "c", ask: `Value of c.${WHOLE}`, answerType: "number", answer: c, tolerance: 0,
        hint: "Compare the constant terms of the two forms of dy/dx." },
      { id: "d", label: "d", ask: `Value of d.${WHOLE}`, answerType: "number", answer: d, tolerance: 0,
        hint: `Decide which stationary point is the local ${which} (use \`d²y/dx²\`), then substitute its x and y into the curve.` },
    ],
    explanation: [`Work backwards: the roots of dy/dx give b and c, and the known point gives d.`, ...steps].join("\n\n"),
    hints: [
      `Differentiate with the letters: \`dy/dx = ${num(3 * a)}x² + 2bx + c\`.`,
      `Stationary points are the roots of dy/dx, so \`dy/dx = ${num(3 * a)}${factor(p)}${factor(q)}\`. Expand this and match coefficients.`,
      `\`d²y/dx² = ${num(6 * a)}x + 2b\`: negative at a maximum, positive at a minimum.`,
    ],
    given: givenRows([["_p", p], ["_q", q], ["_K", K]]),
    params: { sub: "expert", kind: "x-sback", f: [], a, p, q, K, which },
  };
}

const OPT_CONTEXTS = [
  { id: "box", unit: "cm", items: ["a square sheet of card", "a square sheet of metal", "a square piece of cardboard"] },
  { id: "fence", unit: "m", items: ["a wall", "a river", "a hedge"] },
  { id: "open", unit: "cm", items: ["an open-topped tank", "an open storage box", "an open planter"] },
  { id: "closed", unit: "cm", items: ["a closed box", "a closed crate", "a closed container"] },
];

// stationary / expert, template 1: optimisation set up from words.
function genStatOpt(rng) {
  const ctx = rng.pick(OPT_CONTEXTS);
  const item = rng.pick(ctx.items);
  const n = rng.int(2, 12);
  const u = ctx.unit;
  let prompt, ask1, ask2, x, best, steps, hints, model;
  if (ctx.id === "box") {
    const L = 6 * n;
    x = n;
    best = 16 * n ** 3;
    model = { L };
    prompt = `An open box is made from ${item} ${L} ${u} wide: a square of side x ${u} is cut from each corner and the sides are folded up.`;
    ask1 = `The value of x that gives the largest volume (${u}).${WHOLE}`;
    ask2 = `The largest volume (${u}³).${WHOLE}`;
    steps = [
      `The base is \`(${L} − 2x)\` square and the height is x, so \`V = x(${L} − 2x)²\`.`,
      `Expand: \`V = 4x³ − ${4 * L}x² + ${L * L}x\`, so \`dV/dx = 12x² − ${8 * L}x + ${L * L}\` = 0.`,
      `Divide by 4: \`3x² − ${2 * L}x + ${L * L / 4} = 0\`, giving \`(3x − ${L / 2})(x − ${L / 2}) = 0\`: x = ${L / 6} or x = ${L / 2}. x = ${L / 2} leaves no base, so **x = ${x}**.`,
      `\`d²V/dx² = 24x − ${8 * L}\` < 0 at x = ${x}: a maximum. V = ${x} × ${L - 2 * x}² = **${best}**.`,
    ];
    hints = [
      `Write the volume in terms of x: the base is a square of side ${L} − 2x and the height is x.`,
      `Expand \`V = x(${L} − 2x)²\`, differentiate, and set \`dV/dx = 0\`.`,
      `You get two solutions; one of them makes the base size 0, so it can't be the answer.`,
    ];
  } else if (ctx.id === "fence") {
    const P = 4 * n * 2;
    x = P / 4;
    best = (P * P) / 8;
    model = { P };
    prompt = `A farmer has ${P} m of fencing to make a rectangular pen against ${item}, which forms the fourth side. The two sides at right angles to ${item.replace(/^an? /, "the ")} are each x m long.`;
    ask1 = `The value of x that gives the largest area (m).${WHOLE}`;
    ask2 = `The largest area (m²).${WHOLE}`;
    steps = [
      `The side parallel to ${item.replace(/^an? /, "the ")} is \`${P} − 2x\`, so \`A = x(${P} − 2x) = ${P}x − 2x²\`.`,
      `\`dA/dx = ${P} − 4x = 0\`, so **x = ${x}**.`,
      `\`d²A/dx² = −4\` < 0: a maximum. A = ${x} × ${P - 2 * x} = **${best}**.`,
    ];
    hints = [
      `The fence covers three sides: two of length x and one of length ${P} − 2x.`,
      `Area = x(${P} − 2x). Differentiate and set the result to 0.`,
    ];
  } else if (ctx.id === "open") {
    const side = 2 * n;
    const V = 4 * n ** 3;
    x = side;
    best = 3 * side * side;
    model = { V };
    prompt = `${item[0].toUpperCase()}${item.slice(1)} has a square base of side x ${u} and must hold ${V} ${u}³. Its surface area (base + 4 sides, no lid) is to be as small as possible.`;
    ask1 = `The base side x (${u}).${WHOLE}`;
    ask2 = `The smallest surface area (${u}²).${WHOLE}`;
    steps = [
      `Height h: \`x²h = ${V}\`, so \`h = ${V}/x²\`.`,
      `Surface area: \`S = x² + 4xh = x² + ${4 * V}/x\` = \`x² + ${4 * V}x⁻¹\`.`,
      `\`dS/dx = 2x − ${4 * V}x⁻² = 0\` gives \`x³ = ${2 * V}\`, so **x = ${x}**.`,
      `\`d²S/dx² = 2 + ${8 * V}x⁻³\` > 0: a minimum. S = ${x}² + ${4 * V}/${x} = **${best}**.`,
    ];
    hints = [
      "Use the volume to write the height in terms of x, so the surface area has only one variable.",
      `\`S = x² + 4xh\` with \`h = ${V}/x²\`. Simplify, write it with a negative power, and differentiate.`,
      "Set `dS/dx = 0` and solve: you get x³ equal to a number.",
    ];
  } else {
    const side = n;
    const V = n ** 3;
    x = side;
    best = 6 * side * side;
    model = { V };
    prompt = `${item[0].toUpperCase()}${item.slice(1)} has a square base of side x ${u}, a lid, and must hold ${V} ${u}³. Its total surface area is to be as small as possible.`;
    ask1 = `The base side x (${u}).${WHOLE}`;
    ask2 = `The smallest surface area (${u}²).${WHOLE}`;
    steps = [
      `Height h: \`x²h = ${V}\`, so \`h = ${V}/x²\`.`,
      `Surface area: \`S = 2x² + 4xh = 2x² + ${4 * V}x⁻¹\`.`,
      `\`dS/dx = 4x − ${4 * V}x⁻² = 0\` gives \`x³ = ${V}\`, so **x = ${x}** (the box is a cube).`,
      `\`d²S/dx² = 4 + ${8 * V}x⁻³\` > 0: a minimum. S = 2 × ${x}² + ${4 * V}/${x} = **${best}**.`,
    ];
    hints = [
      "Use the volume to write the height in terms of x, so the surface area has only one variable.",
      `\`S = 2x² + 4xh\` with \`h = ${V}/x²\`. Simplify, write it with a negative power, and differentiate.`,
      "Set `dS/dx = 0` and solve: you get x³ equal to a number.",
    ];
  }
  const label2 = ctx.id === "box" ? "Volume" : ctx.id === "fence" ? "Area" : "Surface area";
  return {
    prompt,
    answerType: "multi",
    parts: [
      { id: "x", label: "x", ask: ask1, answerType: "number", answer: x, tolerance: 0,
        hint: "Write the quantity as a function of x only, differentiate, and set the derivative to 0." },
      { id: "best", label: label2, ask: ask2, answerType: "number", answer: best, tolerance: 0,
        hint: "Substitute your x back into the formula for the quantity (not into its derivative)." },
    ],
    explanation: [`Set up a formula in one variable, then find its stationary point.`, ...steps].join("\n\n"),
    hints,
    given: givenRows(Object.entries(model).map(([k, v]) => [`_${k}`, v])),
    params: { sub: "expert", kind: "x-sopt", f: [], ctx: ctx.id, ...model },
  };
}

// stationary / expert, template 2: the second-derivative test fails (it gives 0).
function genStatEdge(rng) {
  const n = rng.pick([3, 4]);
  const a = rng.pick([1, -1, 2, -2]);
  const h = nz(rng, -3, 3);
  const k = rng.int(-9, 9);
  const binom = n === 3 ? [1, 3, 3, 1] : [1, 4, 6, 4, 1];
  // a(x − h)^n + k, expanded
  const terms = binom.map((bc, i) => T(a * bc * (-h) ** i, n - i));
  const f = norm([...terms, T(k, 0)]);
  const d1 = deriv(f), d2 = deriv(d1);
  const nature = n === 3 ? "Point of inflection" : a > 0 ? "Minimum point" : "Maximum point";
  const factored = `${a === 1 ? "" : a === -1 ? MINUS : num(a)}(x ${h < 0 ? "+" : MINUS} ${Math.abs(h)})${sup(n)}${k ? ` ${k < 0 ? MINUS : "+"} ${Math.abs(k)}` : ""}`;
  const dFact = `${num(n * a)}(x ${h < 0 ? "+" : MINUS} ${Math.abs(h)})${sup(n - 1)}`;
  const steps = [
    `\`dy/dx = ${polyStr(d1)}\`, which factorises as \`${dFact}\`. It is 0 only at **x = ${num(h)}**.`,
    `\`d²y/dx² = ${polyStr(d2)}\`, which is **0** at x = ${num(h)}, so the second-derivative test tells you nothing.`,
    `Check the sign of dy/dx either side instead: at x = ${num(h - 1)} it is ${num(evalAt(d1, h - 1))}, at x = ${num(h + 1)} it is ${num(evalAt(d1, h + 1))}.`,
    n === 3
      ? `The sign does not change, so the curve keeps going the same way: a **point of inflection**. (In fact \`y = ${factored}\`.)`
      : `The sign changes from ${a > 0 ? "negative to positive" : "positive to negative"}: a **${nature.toLowerCase()}**. (In fact \`y = ${factored}\`.)`,
  ];
  return {
    prompt: `The curve \`y = ${polyStr(f)}\` has exactly one stationary point.`,
    answerType: "multi",
    parts: [
      { id: "x", label: "x-coordinate", ask: `Its x-coordinate.${WHOLE}`, answerType: "number", answer: h, tolerance: 0,
        hint: `Solve \`dy/dx = 0\`. Take out the common factor ${num(n * a)}; what is left is a perfect ${n === 3 ? "square" : "cube"}.` },
      { id: "y", label: "y-coordinate", ask: `Its y-coordinate.${WHOLE}`, answerType: "number", answer: evalAt(f, h), tolerance: 0,
        hint: "Substitute your x into the curve itself, not into dy/dx." },
      { id: "nature", label: "Nature", ask: "What kind of stationary point is it?", answerType: "choice", answer: nature, choices: rng.shuffle(X_NATURES.slice()),
        hint: "If the second derivative can't decide, look at the sign of dy/dx just to the left and just to the right of the point." },
    ],
    explanation: [`Find the stationary point, then classify it; here the usual test fails.`, ...steps].join("\n\n"),
    hints: [
      `\`dy/dx = ${polyStr(d1)}\`. Look for a common factor and a pattern like \`x² − 2hx + h²\`.`,
      "When `d²y/dx² = 0` the point could be a maximum, a minimum or an inflection. Use the first-derivative sign test.",
    ],
    params: { sub: "expert", kind: "x-sedge", f },
  };
}

// integration / expert, template 0: area between a parabola and a line.
function genIntBetween(rng) {
  const o = draw(
    () => {
      const s0 = rng.pick([1, -1, 2, -2, 3, -3]);
      const r1 = rng.int(-4, 2), w = rng.int(1, 6);
      const m0 = rng.int(-5, 5), c0 = rng.int(-8, 8);
      return { s: s0, r1, r2: r1 + w, m: m0, c: c0, area: (Math.abs(s0) * w ** 3) / 6 };
    },
    (v) => !nearHalf(v.area),
  );
  const { s, r1, r2, m, c, area } = o;
  // curve = line + s(x − r1)(x − r2)
  const f = norm([T(s, 2), T(m - s * (r1 + r2), 1), T(c + s * r1 * r2, 0)]);
  const line = lineStr(m, c);
  const diff = norm([T(s, 2), T(-s * (r1 + r2), 1), T(s * r1 * r2, 0)]);
  const upper = s < 0 ? "curve" : "line";
  const top = s < 0 ? norm(diff.map((t) => T(t.c, t.p))) : norm(diff.map((t) => T(-t.c, t.p)));
  const F = integ(top);
  const steps = [
    `Where they meet: \`${polyStr(f)} = ${line.slice(4)}\`, so \`${polyStr(diff)} = 0\`, which gives x = **${num(r1)}** and x = **${num(r2)}**.`,
    `Between them the ${upper} is on top, so integrate (top − bottom) = \`${polyStr(top)}\`.`,
    `Antiderivative: \`${polyStr(F)}\`. From ${num(r1)} to ${num(r2)} this gives ${rat(area)} ≈ ${num(area)}, which rounds to **${fmt2(area)}**.`,
  ];
  return {
    prompt: `The curve \`y = ${polyStr(f)}\` and the line \`${line}\` enclose a region.`,
    answerType: "multi",
    parts: [
      { id: "lo", label: "Left x", ask: `The smaller x-coordinate where they meet.${WHOLE}`, answerType: "number", answer: r1, tolerance: 0,
        hint: "Set the curve equal to the line, move everything to one side and factorise." },
      { id: "hi", label: "Right x", ask: `The larger x-coordinate where they meet.${WHOLE}`, answerType: "number", answer: r2, tolerance: 0,
        hint: "The same quadratic has a second root." },
      { id: "area", label: "Area", ask: `The area of the enclosed region.${DP2}`, answerType: "number", answer: round2(area), tolerance: 0.005,
        hint: "Integrate (top − bottom) between the two meeting points. Check which one is on top with a test x between them." },
    ],
    explanation: [`Find the meeting points, then integrate the difference between the two graphs.`, ...steps].join("\n\n"),
    hints: [
      "The region is bounded where the graphs meet: solve curve = line.",
      `\`${polyStr(diff)} = 0\` after moving everything to one side.`,
      "Area between two graphs = ∫ (top − bottom) dx between the meeting points. That is never negative.",
    ],
    given: givenRows([["_m", m], ["_c", c]]),
    params: { sub: "expert", kind: "x-ibetween", f, m, c },
  };
}

// integration / expert, template 1: working backwards to an unknown limit or coefficient.
function genIntBack(rng) {
  const mode = rng.pick(["limit", "coef"]);
  if (mode === "limit") {
    const a = rng.int(1, 3), b = rng.int(0, 3), c = rng.int(1, 6);
    const K = rng.int(1, 5);
    // ∫₀ᴷ (3a x² + 2b x + c) dx = aK³ + bK² + cK
    const f = norm([T(3 * a, 2), T(2 * b, 1), T(c, 0)]);
    const F = integ(f);
    const N = evalAt(F, K);
    return {
      prompt: `k is a positive number and \`∫ (${polyStr(f)}) dx\` from x = 0 to x = k equals ${num(N)}. Find k.${WHOLE}`,
      answer: K, answerType: "number", tolerance: 0, choices: undefined,
      explanation: [
        `Integrate, then put in the limits with k as a letter.`,
        `\`F(x) = ${polyStr(F)}\`, and F(0) = 0.`,
        `So \`${polyStr(F).replace(/x/g, "k")} = ${num(N)}\`.`,
        `Every term is positive for k > 0 and grows with k, so there is only one positive solution. Trying k = 1, 2, 3, … gives F(${K}) = ${num(N)}, so **k = ${K}**.`,
      ].join("\n\n"),
      hints: [
        "Integrate first, then substitute the limits: F(k) − F(0).",
        `\`F(x) = ${polyStr(F)}\`, so you need \`F(k) = ${num(N)}\`. That's a cubic in k.`,
        "The answer is a whole number. Try small whole numbers for k in the calculator until F(k) matches.",
      ],
      given: givenRows([["_N", N]]),
      params: { sub: "expert", kind: "x-iback", f, mode, N },
    };
  }
  const alpha = rng.int(-3, 2);
  const beta = alpha + 3;
  const k = nz(rng, -5, 5);
  const c = 2 * rng.int(-3, 3);
  const d = rng.int(-6, 6);
  const f = norm([T(k, 2), T(c, 1), T(d, 0)]);
  const N = defInt(f, alpha, beta);
  const known = defInt(norm([T(c, 1), T(d, 0)]), alpha, beta);
  const kCoef = (beta ** 3 - alpha ** 3) / 3;
  const rest = norm([T(c, 1), T(d, 0)]);
  const shown = `kx²${rest.length ? (rest[0].c < 0 ? ` ${MINUS} ` : " + ") + polyStr(rest).replace(/^−/, "") : ""}`;
  return {
    prompt: `\`∫ (${shown}) dx\` from x = ${num(alpha)} to x = ${num(beta)} equals ${num(N)}, where k is a constant. Find k.${WHOLE}`,
    answer: k, answerType: "number", tolerance: 0, choices: undefined,
    explanation: [
      `Integrate with k as a letter, then substitute the limits.`,
      `\`F(x) = (k/3)x³${rest.length ? (integ(rest)[0].c < 0 ? ` ${MINUS} ` : " + ") + polyStr(integ(rest)).replace(/^−/, "") : ""}\`.`,
      `The k term gives \`(k/3)(${par(beta)}³ − ${par(alpha)}³)\` = ${num(kCoef)}k. The other terms give ${num(known)}.`,
      `So \`${num(kCoef)}k + ${par(known)} = ${num(N)}\`, so \`k = ${num(N - known)} ÷ ${num(kCoef)}\` = **${num(k)}**.`,
    ].join("\n\n"),
    hints: [
      "Integrate term by term with k kept as a letter: `kx²` becomes `(k/3)x³`.",
      `Substitute x = ${num(beta)} and x = ${num(alpha)} and subtract. You get a linear equation in k.`,
    ],
    given: givenRows([["_a", alpha], ["_b", beta], ["_N", N]]),
    params: { sub: "expert", kind: "x-iback", f: rest, mode, alpha, beta, N },
  };
}

// integration / expert, template 2: find a curve from its gradient and a point.
function genIntCurve(rng) {
  const g = randPoly(rng, rng.int(2, 3), 3, 4, intMult);
  const x0 = rng.int(-3, 3);
  const y0 = rng.int(-20, 20);
  let x1 = rng.int(-3, 3);
  if (x1 === x0) x1 = x0 === 3 ? -2 : x0 + 1;
  const F = integ(g);
  const C = y0 - evalAt(F, x0);
  const y1 = evalAt(F, x1) + C;
  return {
    prompt: `A curve has gradient \`dy/dx = ${polyStr(g)}\` and passes through the point (${num(x0)}, ${num(y0)}).`,
    answerType: "multi",
    parts: [
      { id: "C", label: "Constant C", ask: `Writing the curve as \`y = (integral without a constant) + C\`, find C. (C is also where the curve crosses the y-axis.)${WHOLE}`, answerType: "number", answer: C, tolerance: 0,
        hint: `Integrate dy/dx, then substitute x = ${num(x0)} and y = ${num(y0)} to solve for C.` },
      { id: "y1", label: `y at x = ${num(x1)}`, ask: `The curve's y-value at x = ${num(x1)}.${WHOLE}`, answerType: "number", answer: y1, tolerance: 0,
        hint: `Put x = ${num(x1)} into your full equation, including C.` },
    ],
    explanation: [
      `Integrate the gradient to get y, then use the point to fix + C.`,
      intLines(g).join("\n"),
      `\`y = ${polyStr(F)} + C\`.`,
      `At (${num(x0)}, ${num(y0)}): \`${num(y0)} = ${num(evalAt(F, x0))} + C\`, so **C = ${num(C)}**.`,
      `At x = ${num(x1)}: \`y = ${num(evalAt(F, x1))} + ${par(C)}\` = **${num(y1)}**.`,
    ].join("\n\n"),
    hints: [
      "Integrating dy/dx gives y, up to a constant + C.",
      `\`y = ${polyStr(F)} + C\`. The curve passes through (${num(x0)}, ${num(y0)}), which pins down C.`,
    ],
    given: givenRows([["_x0", x0], ["_y0", y0], ["_x1", x1]]),
    params: { sub: "expert", kind: "x-icurve", f: g, x0, y0, x1 },
  };
}

function genExpert(subtopic, rng) {
  if (subtopic === "derivatives") {
    const t = rng.int(0, 2);
    return t === 0 ? genDerivBack(rng) : t === 1 ? genDerivQuot(rng) : genDerivShape(rng);
  }
  if (subtopic === "tangents") {
    const t = rng.int(0, 2);
    return t === 0 ? genTanBack(rng) : t === 1 ? genTanTriangle(rng) : genTanAgain(rng);
  }
  if (subtopic === "stationary") {
    const t = rng.int(0, 2);
    return t === 0 ? genStatBack(rng) : t === 1 ? genStatOpt(rng) : genStatEdge(rng);
  }
  if (subtopic === "integration") {
    const t = rng.int(0, 2);
    return t === 0 ? genIntBetween(rng) : t === 1 ? genIntBack(rng) : genIntCurve(rng);
  }
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "derivatives") return genDerivatives(difficulty, rng);
  if (subtopic === "tangents") return genTangents(difficulty, rng);
  if (subtopic === "stationary") return genStationary(difficulty, rng);
  if (subtopic === "integration") return genIntegration(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// Independent verification

const SUPR = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

// Parses "6x² − 4x + 1", "−2x^(−1/2) + 3x⁻²", "x³ + 5 + C" into [{ c, e }] (+ whether "+ C" ends it).
function parseExpr(s) {
  let str = String(s ?? "").trim();
  let plusC = false;
  if (str.endsWith(" + C")) {
    plusC = true;
    str = str.slice(0, -4);
  }
  if (!str) return null;
  const toks = str.split(/ ([+−]) /);
  const out = [];
  for (let i = 0; i < toks.length; i += 2) {
    let t = toks[i];
    let sign = i === 0 ? 1 : toks[i - 1] === "+" ? 1 : -1;
    if (t.startsWith("−") || t.startsWith("-")) {
      if (i !== 0) return null;
      sign = -1;
      t = t.slice(1);
    }
    const m = t.match(/^(\d+)?(?:\((\d+)\/(\d+)\))?(x)?(?:([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)|\^\(([-−]?\d+)\/(\d+)\))?$/);
    if (!m || (!m[1] && !m[2] && !m[4])) return null;
    if ((m[5] || m[6]) && !m[4]) return null;
    let c = m[1] ? Number(m[1]) : m[2] ? Number(m[2]) / Number(m[3]) : 1;
    let e = 0;
    if (m[4]) {
      if (m[5]) e = Number(m[5].split("").map((ch) => SUPR[ch]).join(""));
      else if (m[6]) e = Number(m[6].replace("−", "-")) / Number(m[7]);
      else e = 1;
    }
    out.push({ c: sign * c, e });
  }
  return { terms: out, plusC };
}
const evalParsed = (terms, x) => terms.reduce((s, t) => s + t.c * Math.pow(x, t.e), 0);

// f from params, evaluated straight from its { c, p, q } list.
const fOf = (terms) => (x) => terms.reduce((s, t) => s + t.c * Math.pow(x, t.p / t.q), 0);
const dNum = (g, x, h = 1e-4) => (g(x + h) - g(x - h)) / (2 * h);
const d2Num = (g, x, h = 1e-3) => (g(x + h) - 2 * g(x) + g(x - h)) / (h * h);
const close = (a, b, rel = 1e-5) => Math.abs(a - b) <= rel * (1 + Math.abs(a) + Math.abs(b));

// Composite Simpson's rule.
function simpson(g, a, b, n = 2000) {
  const h = (b - a) / n;
  let s = g(a) + g(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g(a + i * h);
  return (s * h) / 3;
}
// Total (unsigned) area: split at every sign change found by scanning + bisection.
function absArea(g, a, b) {
  const cuts = [a];
  const N = 100;
  // Offset grid, so a root that lands exactly on a grid point is still bracketed.
  const pts = [a, ...Array.from({ length: N }, (_, i) => a + ((b - a) * (i + 0.37)) / N), b];
  for (let i = 0; i + 1 < pts.length; i++) {
    let lo = pts[i], hi = pts[i + 1];
    if (g(lo) * g(hi) < 0) {
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2;
        if (g(lo) * g(mid) <= 0) hi = mid;
        else lo = mid;
      }
      cuts.push((lo + hi) / 2);
    }
  }
  cuts.push(b);
  let s = 0;
  for (let i = 0; i + 1 < cuts.length; i++) s += Math.abs(simpson(g, cuts[i], cuts[i + 1]));
  return s;
}
// Roots of g on [lo, hi] by scanning for sign changes (grid offset so whole numbers aren't grid points).
function roots(g, lo = -20.00037, hi = 20, step = 0.05) {
  const out = [];
  for (let x = lo; x < hi; x += step) {
    const y1 = g(x), y2 = g(x + step);
    if (y1 === 0) out.push(x);
    else if (y1 * y2 < 0) {
      let l = x, r = x + step;
      for (let k = 0; k < 60; k++) {
        const m = (l + r) / 2;
        if (g(l) * g(m) <= 0) r = m;
        else l = m;
      }
      out.push((l + r) / 2);
    }
  }
  return out;
}
// Stationary points of f, found from the numerical gradient: [{ x, kind: "max" | "min" }].
function statPoints(f) {
  const g = (x) => dNum(f, x);
  return roots(g).map((x) => ({ x, kind: g(x - 0.05) > 0 && g(x + 0.05) < 0 ? "max" : g(x - 0.05) < 0 && g(x + 0.05) > 0 ? "min" : "flat" }));
}

// Whole-number answer checks: exactly an integer, matching the independent value.
const intOk = (x, truth) => Number.isInteger(x) && Math.abs(x - truth) < 1e-4;
// 2-decimal answer checks: within 0.005 of the independent value and safely away from a tie.
const dpOk = (x, truth) => Number.isFinite(x) && Math.abs(x - truth) < 0.005 - 1e-6 && Math.abs(round2(x) - x) < 1e-9;
const numOk = (x, truth, rounded) => (rounded ? dpOk(x, truth) : intOk(x, truth));

function fourChoices(q, answer) {
  const ch = q.choices;
  return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && ch.includes(String(answer));
}

// Parse "y = 5x − 3" into { m, c }.
function parseLine(s) {
  const m = String(s ?? "").match(/^y = (.+)$/);
  if (!m) return null;
  const p = parseExpr(m[1]);
  if (!p || p.plusC || p.terms.some((t) => t.e !== 0 && t.e !== 1)) return null;
  return { m: p.terms.filter((t) => t.e === 1).reduce((s, t) => s + t.c, 0), c: p.terms.filter((t) => t.e === 0).reduce((s, t) => s + t.c, 0) };
}

const SAMPLE_POS = [0.7, 1.3, 2.2, 3.1, 4.6];
const SAMPLE_ALL = [-2.3, -0.9, 0.6, 1.7, 2.9];

// A chosen derivative string matches the numerical derivative of f at several points.
function derivChoiceOk(f, s) {
  const p = parseExpr(s);
  if (!p || p.plusC) return false;
  const xs = f.some((t) => t.q !== 1 || t.p < 0) ? SAMPLE_POS : SAMPLE_ALL;
  const g = fOf(f);
  return xs.every((x) => close(evalParsed(p.terms, x), dNum(g, x, 1e-5), 1e-5));
}
// A chosen antiderivative string (with + C) differentiates back to f at several points.
function intChoiceOk(f, s) {
  const p = parseExpr(s);
  if (!p || !p.plusC) return false;
  const xs = f.some((t) => t.q !== 1 || t.p < 0) ? SAMPLE_POS : SAMPLE_ALL;
  const g = fOf(f);
  const G = (x) => evalParsed(p.terms, x);
  return xs.every((x) => close(dNum(G, x, 1e-5), g(x), 1e-5));
}

function verifyDerivatives(q, answer, p) {
  const f = p.f;
  const g = fOf(f);
  if (p.kind === "choice") return derivChoiceOk(f, answer);
  if (p.kind === "multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    return derivChoiceOk(f, a.derivative) && dpOk(Number(a.value), dNum(g, p.x, 1e-5));
  }
  const x = Number(answer);
  if (p.kind === "coef") return intOk(x, p.which === "x" ? d2Num(g, 0) : dNum(g, 0));
  const truth = p.order === 2 ? d2Num(g, p.x) : dNum(g, p.x, 1e-5);
  return numOk(x, truth, p.rounded);
}

function verifyTangents(q, answer, p) {
  const g = fOf(p.f);
  const x = Number(answer);
  switch (p.kind) {
    case "grad":
      return intOk(x, dNum(g, p.x0));
    case "xAtGrad": {
      const rs = roots((t) => dNum(g, t) - p.m);
      return rs.length === 1 && intOk(x, rs[0]);
    }
    case "tangentChoice":
    case "intercept": {
      const m = dNum(g, p.x0), c = g(p.x0) - m * p.x0;
      if (p.kind === "intercept") return intOk(x, c);
      const l = parseLine(answer);
      return !!l && close(l.m, m, 1e-6) && close(l.c, c, 1e-6);
    }
    case "cubicX":
    case "xMulti": {
      const rs = roots((t) => dNum(g, t) - p.k);
      if (rs.length !== 2) return false;
      if (p.kind === "xMulti") {
        const a = answer && typeof answer === "object" ? answer : {};
        return intOk(Number(a.smaller), rs[0]) && intOk(Number(a.larger), rs[1]);
      }
      return intOk(x, p.which === "larger" ? rs[1] : rs[0]);
    }
    case "tangentMulti":
    case "normal": {
      const a = answer && typeof answer === "object" ? answer : {};
      const mt = dNum(g, p.x0);
      if (p.kind === "tangentMulti") return intOk(Number(a.m), mt) && intOk(Number(a.c), g(p.x0) - mt * p.x0);
      const mn = -1 / mt;
      return dpOk(Number(a.m), mn) && dpOk(Number(a.c), g(p.x0) - mn * p.x0);
    }
    default:
      return false;
  }
}

const NATURE_OF = { max: "Maximum point", min: "Minimum point" };

function verifyStationary(q, answer, p) {
  const f = fOf(p.f);
  const sp = statPoints(f);
  const x = Number(answer);
  const find = (kind) => sp.filter((s) => s.kind === kind);
  switch (p.kind) {
    case "quadX":
      return sp.length === 1 && intOk(x, sp[0].x);
    case "quadY":
      return sp.length === 1 && intOk(x, f(sp[0].x));
    case "quadNature":
      return sp.length === 1 && answer === NATURE_OF[sp[0].kind];
    case "cubicNature": {
      const s = sp.find((t) => Math.abs(t.x - p.x0) < 1e-4);
      return sp.length === 2 && !!s && answer === NATURE_OF[s.kind];
    }
    case "cubicX":
    case "cubicY":
    case "f2": {
      const k = find(p.which === "maximum" ? "max" : "min");
      if (sp.length !== 2 || k.length !== 1) return false;
      const truth = p.kind === "cubicX" ? k[0].x : p.kind === "cubicY" ? f(k[0].x) : d2Num(f, k[0].x);
      return intOk(x, truth);
    }
    case "multi": {
      if (sp.length !== 2) return false;
      const s = p.side === "smaller" ? sp[0] : sp[1];
      const a = answer && typeof answer === "object" ? answer : {};
      return intOk(Number(a.x), s.x) && intOk(Number(a.y), f(s.x)) && a.nature === NATURE_OF[s.kind];
    }
    default:
      return false;
  }
}

function verifyIntegration(q, answer, p) {
  const f = p.f;
  const g = fOf(f);
  if (p.kind === "indef") return intChoiceOk(f, answer);
  if (p.kind === "multi") {
    const a = answer && typeof answer === "object" ? answer : {};
    return intChoiceOk(f, a.integral) && dpOk(Number(a.value), simpson(g, p.a, p.b));
  }
  const x = Number(answer);
  if (p.kind === "enclosed") {
    const rs = roots(g);
    if (rs.length !== 2 || Math.abs(rs[0] - p.a) > 1e-6 || Math.abs(rs[1] - p.b) > 1e-6) return false;
    return dpOk(x, absArea(g, rs[0], rs[1]));
  }
  if (p.kind === "split") return dpOk(x, absArea(g, p.a, p.b));
  if (p.kind === "area") {
    for (let i = 0; i <= 200; i++) if (!(g(p.a + ((p.b - p.a) * i) / 200) > 0)) return false;
  }
  const truth = simpson(g, p.a, p.b);
  return numOk(x, truth, p.rounded);
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !p.sub || !Array.isArray(p.f)) return false; // regenerate from the seed to get params back
  if (answer === "" || answer === null || answer === undefined) return false;
  if (question.answerType === "choice" && !fourChoices(question, answer)) return false;
  if (question.answerType === "multi") {
    for (const part of question.parts || []) if (part.answerType === "choice" && !fourChoices(part, answer?.[part.id])) return false;
  }
  try {
    // A choice holding a number is checked as that number.
    const ans = question.answerType === "choice" && /^-?\d+(\.\d+)?$/.test(String(answer)) ? Number(answer) : answer;
    if (p.sub === "derivatives") return verifyDerivatives(question, ans, p);
    if (p.sub === "tangents") return verifyTangents(question, ans, p);
    if (p.sub === "stationary") return verifyStationary(question, ans, p);
    if (p.sub === "integration") return verifyIntegration(question, ans, p);
    if (p.sub === "expert") return verifyExpert(question, ans, p);
  } catch {
    return false;
  }
  return false;
}

// ---- Expert verification: numerical derivatives, Simpson integrals, scans and substitution ----

const partNum = (a, id) => {
  const v = a && typeof a === "object" ? a[id] : undefined;
  return v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v);
};
const unMinus = (s) => String(s).replace(/−/g, "-");
// "a < x < b" or "x < a or x > b" -> membership test.
function parseInterval(s) {
  const t = unMinus(s);
  let m = /^(-?\d+) < x < (-?\d+)$/.exec(t);
  if (m) { const lo = Number(m[1]), hi = Number(m[2]); return (x) => x > lo && x < hi; }
  m = /^x < (-?\d+) or x > (-?\d+)$/.exec(t);
  if (m) { const lo = Number(m[1]), hi = Number(m[2]); return (x) => x < lo || x > hi; }
  return null;
}
// Golden-section search for the extreme of g on [lo, hi].
function extremum(g, lo, hi, max) {
  const sgn = max ? -1 : 1;
  let best = lo, bv = Infinity;
  const N = 4000;
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const v = sgn * g(x);
    if (v < bv) { bv = v; best = x; }
  }
  let a = best - (hi - lo) / N, b = best + (hi - lo) / N;
  for (let k = 0; k < 100; k++) {
    const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
    if (sgn * g(m1) < sgn * g(m2)) b = m2; else a = m1;
  }
  const x = (a + b) / 2;
  return { x, v: g(x) };
}

function verifyExpert(q, answer, p) {
  const A = answer && typeof answer === "object" ? answer : {};
  switch (p.kind) {
    case "x-dback": {
      const k = partNum(A, "k"), s2 = partNum(A, "second");
      if (!Number.isInteger(k)) return false;
      const c = { ...p.coefs, [p.kPow]: k };
      const g = (x) => c[3] * x ** 3 + c[2] * x ** 2 + c[1] * x + c[0];
      return close(dNum(g, p.x0, 1e-4), p.G, 1e-6) && intOk(s2, d2Num(g, p.x2));
    }
    case "x-dquot": {
      // f straight from the quotient, never rewritten.
      const g = (x) => (p.p * x * x + p.q * x + p.r) / Math.pow(x, p.dHalf / 2);
      return dpOk(partNum(A, "first"), dNum(g, p.s, 1e-5)) && dpOk(partNum(A, "second"), d2Num(g, p.s, 1e-3));
    }
    case "x-dshape": {
      const g = fOf(p.f);
      const inc = parseInterval(A.inc);
      if (!inc) return false;
      for (let x = -15.13; x < 15; x += 0.25) {
        const d = dNum(g, x);
        if (Math.abs(d) < 1e-6) continue;
        if ((d > 0) !== inc(x)) return false;
      }
      const infl = roots((x) => d2Num(g, x));
      if (infl.length !== 1) return false;
      return intOk(partNum(A, "xinf"), infl[0]) && intOk(partNum(A, "ginf"), dNum(g, infl[0]));
    }
    case "x-tback": {
      const b = partNum(A, "b"), c = partNum(A, "c");
      if (!Number.isInteger(b) || !Number.isInteger(c)) return false;
      const g = (x) => p.a * x * x + b * x + c;
      return close(dNum(g, p.t), p.m, 1e-6) && close(g(p.t), p.m * p.t + p.k, 1e-9);
    }
    case "x-ttri": {
      const g = fOf(p.f);
      const m = dNum(g, p.x0), c = g(p.x0) - m * p.x0;
      const L = (x) => m * x + c;
      const xr = roots(L, -1000.00037, 1000, 0.5);
      if (xr.length !== 1) return false;
      const area = Math.abs(simpson(L, Math.min(0, xr[0]), Math.max(0, xr[0])));
      return intOk(partNum(A, "c"), c) && dpOk(partNum(A, "xint"), xr[0]) && dpOk(partNum(A, "area"), area);
    }
    case "x-tagain": {
      const g = fOf(p.f);
      const m = dNum(g, p.t), c = g(p.t) - m * p.t;
      const rs = roots((x) => g(x) - (m * x + c), -30.00037, 30, 0.05).filter((r) => Math.abs(r - p.t) > 0.01);
      if (rs.length !== 1) return false;
      return intOk(partNum(A, "m"), m) && intOk(partNum(A, "x"), rs[0]) && intOk(partNum(A, "y"), g(rs[0]));
    }
    case "x-sback": {
      const b = partNum(A, "b"), c = partNum(A, "c"), d = partNum(A, "d");
      if (![b, c, d].every(Number.isInteger)) return false;
      const g = (x) => p.a * x ** 3 + b * x * x + c * x + d;
      const sp = statPoints(g);
      if (sp.length !== 2 || !intOk(p.p, sp[0].x) || !intOk(p.q, sp[1].x)) return false;
      const s = sp.find((t) => t.kind === (p.which === "maximum" ? "max" : "min"));
      return !!s && close(g(s.x), p.K, 1e-6);
    }
    case "x-sopt": {
      let g, lo, hi, max;
      if (p.ctx === "box") { g = (x) => x * (p.L - 2 * x) * (p.L - 2 * x); lo = 0; hi = p.L / 2; max = true; }
      else if (p.ctx === "fence") { g = (x) => x * (p.P - 2 * x); lo = 0; hi = p.P / 2; max = true; }
      else if (p.ctx === "open") { g = (x) => x * x + 4 * x * (p.V / (x * x)); lo = 0.5; hi = 200; max = false; }
      else { g = (x) => 2 * x * x + 4 * x * (p.V / (x * x)); lo = 0.5; hi = 200; max = false; }
      const e = extremum(g, lo, hi, max);
      return intOk(partNum(A, "x"), e.x) && intOk(partNum(A, "best"), e.v);
    }
    case "x-sedge": {
      const g = fOf(p.f);
      const x = partNum(A, "x");
      if (!Number.isInteger(x) || Math.abs(dNum(g, x)) > 1e-5) return false;
      // The only stationary point: |f'| is clearly non-zero away from x.
      for (let t = -12.03; t < 12; t += 0.1) if (Math.abs(t - x) > 0.3 && Math.abs(dNum(g, t)) < 1e-3) return false;
      const L1 = g(x - 0.2) - g(x), R1 = g(x + 0.2) - g(x);
      const truth = L1 < 0 && R1 < 0 ? "Maximum point" : L1 > 0 && R1 > 0 ? "Minimum point" : "Point of inflection";
      return intOk(partNum(A, "y"), g(x)) && A.nature === truth;
    }
    case "x-ibetween": {
      const g = fOf(p.f);
      const h = (x) => g(x) - (p.m * x + p.c);
      const rs = roots(h);
      if (rs.length !== 2) return false;
      return intOk(partNum(A, "lo"), rs[0]) && intOk(partNum(A, "hi"), rs[1]) && dpOk(partNum(A, "area"), Math.abs(simpson(h, rs[0], rs[1])));
    }
    case "x-iback": {
      const x = Number(answer);
      if (!Number.isInteger(x)) return false;
      if (p.mode === "limit") {
        const g = fOf(p.f);
        return x > 0 && close(simpson(g, 0, x), p.N, 1e-7);
      }
      const g = (t) => x * t * t + fOf(p.f)(t);
      return close(simpson(g, p.alpha, p.beta), p.N, 1e-7);
    }
    case "x-icurve": {
      const g = fOf(p.f);
      return intOk(partNum(A, "C"), p.y0 + simpson(g, p.x0, 0)) && intOk(partNum(A, "y1"), p.y0 + simpson(g, p.x0, p.x1));
    }
    default:
      return false;
  }
}
