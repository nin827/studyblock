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

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

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

export function generate({ subtopic, difficulty, rng }) {
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
  } catch {
    return false;
  }
  return false;
}
