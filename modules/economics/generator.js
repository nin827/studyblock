// Economics generator. Uses only the seeded rng passed in by the engine.
// Subtopics: supply-demand, elasticity, macro, interventions. Textbook models only: straight-line
// demand Qd = a − bP and supply Qs = c + dP, prices in dollars, fictional countries.
// Number formats: whole numbers (tolerance 0) or "2dp" (tolerance 0.005). Percent answers are typed
// without the % sign. params.kind tells verify() how to recheck; verify() finds equilibria by
// bisection, substitutes answers back, and recomputes revenues directly instead of using the
// generator's closed-form formulas.

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

// Dollar amounts: "$240", "$12.50", "-$3.75".
function cash(n) {
  const r = round2(Math.abs(n));
  const s = Number.isInteger(r) ? String(r) : r.toFixed(2);
  return round2(n) < 0 ? `-$${s}` : `$${s}`;
}

const DP2 = " Round to 2 decimal places.";
const PCT_NOTE = " Answer as a number without the % sign.";

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

function finishNum(base, exact, fmt, candidates, rng, allowNeg = false) {
  const rounded = fmt === "2dp";
  const q = { ...base, tolerance: rounded ? 0.005 : 0 };
  if (candidates && rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng, allowNeg);
    return { ...q, answer, answerType: "choice", choices };
  }
  return { ...q, answer: rounded ? round2(exact) : exact, answerType: "number" };
}

const numPart = (id, label, ask, value, fmt, hint) => ({
  id, label, ask, answerType: "number",
  answer: fmt === "2dp" ? round2(value) : value,
  tolerance: fmt === "2dp" ? 0.005 : 0,
  hint,
});

const givenFrom = (values) => Object.entries(values).map(([k, value]) => ({ label: `_${k}`, value }));

// "= **15**" or "≈ 5.3333, which rounds to **5.33**"; dress adds $ or %.
function result(exact, rounded, dress = (s) => s) {
  const shown = fmtAns(exact, rounded);
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${dress(shown)}**`;
  return `≈ ${dress(num(exact))}, which rounds to **${dress(shown)}**`;
}
const $ = (s) => (s.startsWith("-") ? `-$${s.slice(1)}` : `$${s}`);
const pct = (s) => `${s}%`;

// A rounded answer must not sit on a half-step, so exactly one 2-decimal value is right.
const safe2 = (v) => {
  const f = Math.abs(v * 100) % 1;
  return Math.abs(f - 0.5) > 1e-4;
};

function checkDifficulty(d) {
  if (d !== "easy" && d !== "medium" && d !== "hard") throw new Error(`Unknown difficulty: ${d}`);
}

// ---------------------------------------------------------------------------------------------
// Markets

const GOODS = [
  "concert tickets", "coffees", "bike rentals", "phone cases", "bus passes", "bags of apples", "notebooks",
  "pizza slices", "cinema seats", "phone chargers", "umbrellas", "yoga classes", "car washes", "houseplants",
  "board games", "smoothies", "haircuts", "paperback books",
];

const coefP = (k) => (k === 1 ? "P" : `${num(k)}P`);
const demandEq = (a, b) => `Qd = ${num(a)} − ${coefP(b)}`;
const supplyEq = (c, d) => (c > 0 ? `Qs = ${num(c)} + ${coefP(d)}` : c < 0 ? `Qs = ${coefP(d)} − ${num(-c)}` : `Qs = ${coefP(d)}`);
const marketTxt = (good, a, b, c, d) =>
  `In a market for ${good}, demand is \`${demandEq(a, b)}\` and supply is \`${supplyEq(c, d)}\`, where P is the price in dollars and Q the quantity.`;

// A market with a whole-number equilibrium (P, Q).
function intMarket(rng, pLo = 3, pHi = 40) {
  const P = rng.int(pLo, pHi);
  const b = rng.int(1, 12), d = rng.int(1, 12);
  const Q = rng.int(Math.max(30, d * 2), 600);
  return { a: Q + b * P, b, c: Q - d * P, d, P, Q };
}

// A market whose equilibrium price is not a whole number.
function fracMarket(rng) {
  for (;;) {
    const b = rng.int(2, 15), d = rng.int(2, 15);
    const a = rng.int(150, 900), c = rng.int(-120, 80);
    const P = (a - c) / (b + d);
    const Q = a - b * P;
    if (!Number.isInteger(P) && Q > 10 && P > 1 && safe2(P) && safe2(Q)) return { a, b, c, d, P, Q };
  }
}

function genSD(diff, rng) {
  checkDifficulty(diff);
  const good = rng.pick(GOODS);

  if (diff === "easy") {
    let m;
    do m = intMarket(rng); while (m.P === m.Q);
    const { a, b, c, d, P, Q } = m;
    const askP = rng.next() < 0.5;
    const solve = `\`${num(a)} − ${coefP(b)} = ${c >= 0 ? `${num(c)} + ${coefP(d)}` : `${coefP(d)} − ${num(-c)}`}\`, so \`${num(a - c)} = ${coefP(b + d)}\``;
    const base = {
      prompt: `${marketTxt(good, a, b, c, d)} What is the equilibrium ${askP ? "price, in dollars" : "quantity"}?`,
      explanation:
        `At equilibrium the quantity demanded equals the quantity supplied.\n\n` +
        `- Set Qd = Qs: ${solve}\n- P = ${num(a - c)} ÷ ${b + d} = ${P}` +
        (askP ? `, so the equilibrium price is **$${P}**` : `\n- Q = ${num(a)} − ${b} × ${P} = **${Q}**`),
      hints: [
        "At equilibrium Qd = Qs. Set the two expressions equal and solve for P.",
        `${solve}. Divide to find P (in the calculator: \`(_a - _c) / (_b + _d)\`).` + (askP ? "" : " Then put P into either equation."),
      ],
      given: givenFrom({ a, b, c, d }),
      params: { kind: askP ? "eqP" : "eqQ", a, b, c, d, fmt: "int" },
    };
    const wrong = askP ? [(a + c) / (b + d), b !== d ? (a - c) / Math.abs(b - d) : NaN, a / b] : [a - b * ((a + c) / (b + d)), a, c + d * (a / b)];
    return finishNum(base, askP ? P : Q, "int", wrong, rng);
  }

  if (diff === "medium") {
    const kind = rng.pick(["excess", "excessnum", "eq2dp"]);
    if (kind === "eq2dp") {
      const { a, b, c, d, P, Q } = fracMarket(rng);
      const askP = rng.next() < 0.5;
      const base = {
        prompt: `${marketTxt(good, a, b, c, d)} What is the equilibrium ${askP ? "price, in dollars" : "quantity"}?${DP2}`,
        explanation:
          `Set Qd = Qs and solve for P${askP ? "" : ", then substitute back"}.\n\n` +
          `- ${num(a)} − ${coefP(b)} = ${c >= 0 ? `${num(c)} + ${coefP(d)}` : `${coefP(d)} − ${num(-c)}`}, so ${num(a - c)} = ${coefP(b + d)}\n` +
          `- P = ${num(a - c)} ÷ ${b + d} ${askP ? result(P, true, $) : `≈ ${num(P)}`}` +
          (askP ? "" : `\n- Q = ${num(a)} − ${b} × P ${result(Q, true)}`),
        hints: [
          "At equilibrium Qd = Qs. Collect the P terms on one side and the numbers on the other.",
          `P = (${num(a)} − ${c < 0 ? `(${num(c)})` : num(c)}) ÷ (${b} + ${d}) (in the calculator: \`(_a - _c) / (_b + _d)\`).` +
            (askP ? " Then round." : " Keep P unrounded and put it into the demand equation, then round Q."),
        ],
        given: givenFrom({ a, b, c, d }),
        params: { kind: askP ? "eqP" : "eqQ", a, b, c, d, fmt: "2dp" },
      };
      const wrong = askP ? [(a + c) / (b + d), a / b, (a - c) / (b + d + 1)] : [a - b * Math.round(P), a - (b * (a + c)) / (b + d), c + d * (a / b)];
      return finishNum(base, askP ? P : Q, "2dp", wrong, rng);
    }
    const { a, b, c, d, P } = intMarket(rng, 6, 40);
    let k;
    do k = rng.int(-Math.min(P - 1, 12), 12); while (k === 0);
    const Ps = P + k; // set price
    const qd = a - b * Ps, qs = c + d * Ps;
    const ex = qd - qs;
    const type = ex > 0 ? "shortage" : "surplus";
    const steps =
      `- Qd = ${num(a)} − ${b} × ${Ps} = ${qd}\n- Qs = ${c >= 0 ? `${num(c)} + ${d} × ${Ps}` : `${d} × ${Ps} − ${num(-c)}`} = ${qs}\n- Qd − Qs = ${ex}`;
    const hints = [
      "Put the set price into both equations. If buyers want more than sellers offer (Qd > Qs) there is a shortage; if sellers offer more, a surplus.",
      `Work out Qd = ${num(a)} − ${b} × ${Ps} and Qs at the same price (in the calculator: \`_a - _b * _p\` and \`_c + _d * _p\`), then compare them.`,
    ];
    if (kind === "excess") {
      const X = Math.abs(ex), Y = b * Math.abs(k);
      const opt = (t, n) => `${t} of ${n} units`;
      const answer = opt(type === "shortage" ? "Shortage" : "Surplus", X);
      return {
        prompt: `${marketTxt(good, a, b, c, d)} The price is fixed at $${Ps}. What happens in the market?`,
        explanation: `Compare the quantity demanded and supplied at $${Ps}.\n\n${steps}\n\nDemand is ${ex > 0 ? "bigger" : "smaller"} than supply, so there is a **${answer.toLowerCase()}**.`,
        hints,
        given: givenFrom({ a, b, c, d, p: Ps }),
        answerType: "choice",
        answer,
        choices: rng.shuffle([opt("Shortage", X), opt("Surplus", X), opt("Shortage", Y), opt("Surplus", Y)]),
        params: { kind: "excess", a, b, c, d, Ps },
      };
    }
    const base = {
      prompt: `${marketTxt(good, a, b, c, d)} The price is fixed at $${Ps}. What is Qd − Qs at this price? A positive answer means a shortage and a negative one a surplus.`,
      explanation: `Put $${Ps} into both equations and subtract.\n\n${steps}\n\nSo Qd − Qs = **${ex}**, a ${type}.`,
      hints,
      given: givenFrom({ a, b, c, d, p: Ps }),
      params: { kind: "excessnum", a, b, c, d, Ps },
    };
    return finishNum(base, ex, "int", [-ex, qd, -qs, b * k], rng, true);
  }

  // Hard
  const kind = rng.pick(["shift", "spend", "inverse"]);
  if (kind === "inverse") {
    // Inverse curves: demand P = α − βQ, supply P = γ + δQ.
    let al, be, ga, de, Q;
    do {
      al = rng.int(20, 120);
      ga = rng.int(1, al - 10);
      be = rng.int(1, 40) / 20;
      de = rng.int(1, 40) / 20;
      Q = (al - ga) / (be + de);
    } while (Number.isInteger(Q) || !safe2(Q) || !safe2(al - be * Q));
    const askP = rng.next() < 0.5;
    const P = al - be * Q;
    const base = {
      prompt:
        `Written with price on the left, demand for ${good} is \`P = ${al} − ${num(be)}Q\` and supply is \`P = ${ga} + ${num(de)}Q\` (P in dollars). ` +
        `What is the equilibrium ${askP ? "price, in dollars" : "quantity"}?${DP2}`,
      explanation:
        `At equilibrium both give the same price, so set them equal.\n\n` +
        `- ${al} − ${num(be)}Q = ${ga} + ${num(de)}Q, so ${al - ga} = ${num(be + de)}Q\n- Q = ${al - ga} ÷ ${num(be + de)} ${askP ? `≈ ${num(Q)}` : result(Q, true)}` +
        (askP ? `\n- P = ${al} − ${num(be)} × Q ${result(P, true, $)}` : ""),
      hints: [
        "Both curves give a price. At equilibrium they are equal, so set the right-hand sides equal and solve for Q.",
        `Q = (${al} − ${ga}) ÷ (${num(be)} + ${num(de)}) (in the calculator: \`(_alpha - _gamma) / (_beta + _delta)\`).` + (askP ? " Keep Q unrounded and put it into either curve." : " Then round."),
      ],
      given: givenFrom({ alpha: al, beta: be, gamma: ga, delta: de }),
      params: { kind: askP ? "invP" : "invQ", al, be, ga, de },
    };
    const wrong = askP ? [ga + be * Q, (al + ga) / 2, al - de * Q] : [(al - ga) / Math.abs(be - de || 1), (al + ga) / (be + de), al / (be + de)];
    return finishNum(base, askP ? P : Q, "2dp", wrong, rng);
  }
  if (kind === "spend") {
    const { a, b, c, d, P, Q } = fracMarket(rng);
    const S = P * Q;
    if (!safe2(S)) return genSD("hard", rng);
    const parts = [
      numPart("price", "Price", "Equilibrium price, in dollars (2 decimal places)", P, "2dp", `Set ${demandEq(a, b)} equal to ${supplyEq(c, d)} and solve for P.`),
      numPart("qty", "Quantity", "Equilibrium quantity (2 decimal places)", Q, "2dp", "Put the unrounded price into the demand equation."),
      numPart("spend", "Spending", "Total spending P × Q, in dollars (2 decimal places)", S, "2dp", "Multiply the unrounded price by the unrounded quantity, then round."),
    ];
    return {
      prompt: `${marketTxt(good, a, b, c, d)} Find the equilibrium and the total amount buyers spend. Use unrounded values in each step and round each answer to 2 decimal places.`,
      answerType: "multi",
      parts,
      explanation:
        `Solve Qd = Qs, then multiply.\n\n- P = (${num(a)} − ${c < 0 ? `(${num(c)})` : num(c)}) ÷ (${b} + ${d}) ${result(P, true, $)}\n` +
        `- Q = ${num(a)} − ${b} × P ${result(Q, true)}\n- Spending = P × Q ${result(S, true, $)}`,
      hints: ["At equilibrium Qd = Qs. Keep full precision in the calculator and round only the answers you type."],
      given: givenFrom({ a, b, c, d }),
      params: { kind: "spend", a, b, c, d },
    };
  }
  // shift: demand moves by D units at every price.
  let m, D, P2, Q2;
  do {
    m = intMarket(rng, 5, 40);
    D = 5 * rng.int(-20, 30);
    P2 = (m.a + D - m.c) / (m.b + m.d);
    Q2 = m.a + D - m.b * P2;
  } while (D === 0 || Number.isInteger(P2) || Q2 <= 10 || !safe2(P2) || !safe2(Q2));
  const { a, b, c, d, P, Q } = m;
  const why = D > 0
    ? rng.pick(["a viral video raises demand", "higher incomes raise demand", "a heatwave raises demand", "a new festival raises demand"])
    : rng.pick(["a rival product cuts demand", "lower incomes cut demand", "bad reviews cut demand", "a rainy season cuts demand"]);
  const parts = [
    numPart("price", "New price", "New equilibrium price, in dollars (2 decimal places)", P2, "2dp", `The new demand is Qd = ${num(a + D)} − ${coefP(b)}. Set it equal to supply and solve for P.`),
    numPart("qty", "New quantity", "New equilibrium quantity (2 decimal places)", Q2, "2dp", "Put the unrounded new price into the new demand equation (or the supply equation)."),
  ];
  return {
    prompt:
      `${marketTxt(good, a, b, c, d)} The equilibrium is $${P} and ${Q} units. Then ${why} by ${Math.abs(D)} units at every price, ` +
      `so demand becomes \`Qd = ${num(a + D)} − ${coefP(b)}\`. Find the new equilibrium.`,
    answerType: "multi",
    parts,
    explanation:
      `Shift the demand curve, then solve Qd = Qs again.\n\n- New demand: Qd = ${num(a + D)} − ${coefP(b)}\n` +
      `- P = (${num(a + D)} − ${c < 0 ? `(${num(c)})` : num(c)}) ÷ (${b} + ${d}) ${result(P2, true, $)}\n- Q = ${num(a + D)} − ${b} × P ${result(Q2, true)}`,
    hints: [`A shift of ${Math.abs(D)} units at every price changes the number at the front of the demand equation by ${Math.abs(D)}. The supply equation stays the same.`],
    given: givenFrom({ a: a + D, b, c, d }),
    params: { kind: "shift", a: a + D, b, c, d },
  };
}

// ---------------------------------------------------------------------------------------------
// Elasticity. PED = % change in quantity demanded ÷ % change in price, given as its size (no minus).

const ABS_NOTE = "Give the size of the PED as a positive number (ignore the minus sign).";
const CLASS = ["Elastic", "Inelastic", "Unit elastic", "Perfectly inelastic"];

function genEl(diff, rng) {
  checkDifficulty(diff);
  const good = rng.pick(GOODS);

  if (diff === "easy") {
    const up = rng.next() < 0.5;
    if (rng.next() < 0.55) {
      let E, dp, dq;
      do {
        E = rng.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 1.2, 1.25, 1.5, 2, 2.5, 3, 4]);
        dp = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40]);
        dq = E * dp;
      } while (!Number.isInteger(Math.round(dq * 1e6) / 1e6) || dq < 1 || dq > 90 || dq === dp);
      dq = Math.round(dq);
      const base = {
        prompt:
          `The price of ${good} ${up ? "rises" : "falls"} by ${dp}% and the quantity demanded ${up ? "falls" : "rises"} by ${dq}%. ` +
          `Using PED = % change in quantity demanded ÷ % change in price, what is the price elasticity of demand? ${ABS_NOTE} It comes out exact; round to 2 decimal places if needed.`,
        explanation: `Divide the percentage change in quantity by the percentage change in price.\n\n\`${dq} ÷ ${dp}\` = **${num(E)}**\n\nThe real PED is −${num(E)}, because price and quantity move in opposite directions; its size is ${num(E)}.`,
        hints: [
          "PED compares how strongly the quantity reacts with how much the price changed: % change in quantity ÷ % change in price.",
          `Work out ${dq} ÷ ${dp} (in the calculator: \`_dq / _dp\`).`,
        ],
        given: givenFrom({ dq, dp }),
        params: { kind: "pedpct", dq, dp },
      };
      return finishNum(base, E, "2dp", [dp / dq, dq - dp, dq * dp / 100], rng);
    }
    // Classify.
    const kind = rng.pick(["Elastic", "Inelastic", "Unit elastic", "Perfectly inelastic", "Elastic", "Inelastic"]);
    const dp = rng.pick([4, 5, 8, 10, 12, 15, 20, 25]);
    let dq;
    if (kind === "Perfectly inelastic") dq = 0;
    else if (kind === "Unit elastic") dq = dp;
    else if (kind === "Elastic") dq = rng.int(Math.ceil(dp * 1.2), Math.min(90, dp * 4));
    else dq = rng.int(1, Math.floor(dp * 0.8));
    const E = dq / dp;
    const prompt =
      `When the price of ${good} ${up ? "rises" : "falls"} by ${dp}%, the quantity demanded ` +
      (dq === 0 ? "does not change at all." : `${up ? "falls" : "rises"} by ${dq}%.`) +
      ` Using PED = % change in quantity demanded ÷ % change in price (size only), how is demand best described?`;
    return {
      prompt,
      explanation:
        `Work out the size of the PED and compare it with 1.\n\n- PED = ${dq} ÷ ${dp} = ${num(E)}\n` +
        `- Above 1 is elastic, below 1 (but above 0) inelastic, exactly 1 unit elastic, and 0 perfectly inelastic.\n\nSo demand is **${kind.toLowerCase()}**.`,
      hints: [
        "Work out PED = % change in quantity ÷ % change in price, ignoring the minus sign.",
        "Compare it with 1: more than 1 is elastic, less than 1 (but not 0) is inelastic, exactly 1 is unit elastic, and 0 is perfectly inelastic.",
      ],
      given: dq === 0 ? givenFrom({ dp }) : givenFrom({ dq, dp }), // "does not change" is stated in words
      answerType: "choice",
      answer: kind,
      choices: rng.shuffle(CLASS.slice()),
      params: { kind: "classify", dq, dp },
    };
  }

  if (diff === "medium") {
    const kind = rng.pick(["pedpq", "revchange", "newq"]);
    if (kind === "newq") {
      const E = rng.pick([0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.2, 1.5, 1.8, 2, 2.5, 3]);
      const dp = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
      const up = rng.next() < 0.5;
      let Q1, Q2;
      do {
        Q1 = 10 * rng.int(20, 900);
        Q2 = Q1 * (1 + ((up ? -1 : 1) * E * dp) / 100);
      } while (!Number.isInteger(Math.round(Q2 * 1e6) / 1e6) || Q2 <= 0);
      Q2 = Math.round(Q2);
      const base = {
        prompt:
          `A shop sells ${Q1} ${good} a month. The price elasticity of demand is ${num(E)} in size (PED = % change in quantity ÷ % change in price). ` +
          `If the price ${up ? "rises" : "falls"} by ${dp}%, how many will it sell per month?`,
        explanation:
          `Find the percentage change in quantity, then apply it.\n\n- % change in quantity = ${num(E)} × ${dp} = ${num(E * dp)}%, a${up ? " fall" : " rise"}\n` +
          `- New quantity = ${Q1} × (1 ${up ? "−" : "+"} ${num(E * dp / 100)}) = **${Q2}**`,
        hints: [
          `Rearrange PED: % change in quantity = PED × % change in price. A price ${up ? "rise" : "fall"} makes quantity ${up ? "fall" : "rise"}.`,
          `The quantity changes by ${num(E)} × ${dp}%. Apply that to ${Q1} (in the calculator: \`_q * (1 ${up ? "-" : "+"} _ped * _dp / 100)\`).`,
        ],
        given: givenFrom({ q: Q1, ped: E, dp }),
        params: { kind: "newq", Q1, E10: Math.round(E * 10), dp, up },
      };
      return finishNum(base, Q2, "int", [Q1 * (1 + ((up ? 1 : -1) * E * dp) / 100), Q1 * (1 + ((up ? -1 : 1) * dp) / (100 * E)), Q1 - (up ? 1 : -1) * E * dp].map(Math.round), rng);
    }
    let P1, P2, Q1, Q2;
    do {
      P1 = rng.int(4, 80);
      P2 = P1 + (rng.next() < 0.5 ? 1 : -1) * rng.int(1, Math.max(1, Math.floor(P1 / 3)));
      Q1 = 10 * rng.int(5, 120);
      Q2 = 10 * rng.int(5, 120);
    } while (P2 <= 0 || P2 === P1 || Q2 === Q1 || (P2 - P1) * (Q2 - Q1) > 0 || P1 * Q1 === P2 * Q2);
    if (kind === "revchange") {
      const ch = P2 * Q2 - P1 * Q1;
      const base = {
        prompt:
          `A seller changes the price of ${good} from $${P1} to $${P2}, and sales go from ${Q1} to ${Q2} a week. ` +
          `By how many dollars does weekly total revenue (price × quantity) change? Use a negative number for a fall.`,
        explanation: `Total revenue = price × quantity.\n\n- Before: ${P1} × ${Q1} = $${P1 * Q1}\n- After: ${P2} × ${Q2} = $${P2 * Q2}\n- Change: ${P2 * Q2} − ${P1 * Q1} = **${cash(ch)}**`,
        hints: ["Work out the revenue before and after (price × quantity), then subtract before from after.", `Work out ${P2} × ${Q2} − ${P1} × ${Q1} (in the calculator: \`_p2 * _q2 - _p1 * _q1\`).`],
        given: givenFrom({ p1: P1, q1: Q1, p2: P2, q2: Q2 }),
        params: { kind: "revchange", P1, P2, Q1, Q2 },
      };
      return finishNum(base, ch, "int", [-ch, (P2 - P1) * (Q2 - Q1), P2 * Q1 - P1 * Q1], rng, true);
    }
    const E = Math.abs(((Q2 - Q1) / Q1) / ((P2 - P1) / P1));
    if (!safe2(E)) return genEl(diff, rng);
    const base = {
      prompt:
        `The price of ${good} changes from $${P1} to $${P2} and the quantity demanded changes from ${Q1} to ${Q2}. ` +
        `Measuring each % change from the original value, what is the price elasticity of demand? ${ABS_NOTE}${DP2}`,
      explanation:
        `Work out both percentage changes from the original values, then divide.\n\n` +
        `- % change in quantity = (${Q2} − ${Q1}) ÷ ${Q1} × 100 = ${num(((Q2 - Q1) / Q1) * 100)}%\n` +
        `- % change in price = (${P2} − ${P1}) ÷ ${P1} × 100 = ${num(((P2 - P1) / P1) * 100)}%\n` +
        `- PED = ${num(((Q2 - Q1) / Q1) * 100)} ÷ ${num(((P2 - P1) / P1) * 100)}, size ${result(E, true)}`,
      hints: [
        "% change = (new − old) ÷ old × 100. Do this for quantity and for price, then divide quantity by price.",
        `% change in quantity = (${Q2} − ${Q1}) ÷ ${Q1} × 100 and % change in price = (${P2} − ${P1}) ÷ ${P1} × 100 (in the calculator: \`((_q2 - _q1) / _q1) / ((_p2 - _p1) / _p1)\`). Divide and drop the minus sign.`,
      ],
      given: givenFrom({ p1: P1, p2: P2, q1: Q1, q2: Q2 }),
      params: { kind: "pedpq", P1, P2, Q1, Q2 },
    };
    const mid = Math.abs(((Q2 - Q1) / ((Q1 + Q2) / 2)) / ((P2 - P1) / ((P1 + P2) / 2)));
    return finishNum(base, E, "2dp", [1 / E, mid, Math.abs((Q2 - Q1) / (P2 - P1))], rng);
  }

  // Hard: midpoint (arc) method.
  let P1, P2, Q1, Q2, E;
  do {
    P1 = rng.int(4, 90);
    P2 = P1 + (rng.next() < 0.5 ? 1 : -1) * rng.int(1, Math.max(1, Math.floor(P1 / 2)));
    Q1 = 10 * rng.int(5, 150);
    Q2 = 10 * rng.int(5, 150);
    E = Math.abs(((Q2 - Q1) / ((Q1 + Q2) / 2)) / ((P2 - P1) / ((P1 + P2) / 2)));
  } while (P2 <= 0 || P2 === P1 || Q2 === Q1 || (P2 - P1) * (Q2 - Q1) > 0 || Math.abs(E - 1) < 0.1 || Math.abs(E - 2) < 0.005 || !safe2(E)); // 2 would echo the "÷ 2" in the hint
  const midTxt = "Use the midpoint method: % change = change ÷ average of the two values × 100.";
  const steps =
    `- % change in quantity = (${Q2} − ${Q1}) ÷ ${num((Q1 + Q2) / 2)} × 100 ≈ ${num(((Q2 - Q1) / ((Q1 + Q2) / 2)) * 100)}%\n` +
    `- % change in price = (${P2} − ${P1}) ÷ ${num((P1 + P2) / 2)} × 100 ≈ ${num(((P2 - P1) / ((P1 + P2) / 2)) * 100)}%\n` +
    `- PED size ${result(E, true)}`;
  const pedHint = `Average quantity = (${Q1} + ${Q2}) ÷ 2 and average price = (${P1} + ${P2}) ÷ 2. PED = (change in Q ÷ average Q) ÷ (change in P ÷ average P), size only (in the calculator: \`((_q2 - _q1) / ((_q1 + _q2) / 2)) / ((_p2 - _p1) / ((_p1 + _p2) / 2))\`).`;
  const given = givenFrom({ p1: P1, p2: P2, q1: Q1, q2: Q2 });
  if (rng.next() < 0.4) {
    const base = {
      prompt: `The price of ${good} moves from $${P1} to $${P2}, and the quantity demanded from ${Q1} to ${Q2}. ${midTxt} What is the price elasticity of demand? ${ABS_NOTE}${DP2}`,
      explanation: `Use averages as the base for both percentage changes.\n\n${steps}`,
      hints: ["With the midpoint method, each % change is the change divided by the average of the old and new values.", pedHint],
      given,
      params: { kind: "pedmid", P1, P2, Q1, Q2 },
    };
    return finishNum(base, E, "2dp", [Math.abs(((Q2 - Q1) / Q1) / ((P2 - P1) / P1)), 1 / E, Math.abs(((Q2 - Q1) / Q2) / ((P2 - P1) / P2))], rng);
  }
  const elastic = E > 1;
  const up = P2 > P1;
  const rises = P2 * Q2 > P1 * Q1;
  const parts = [
    numPart("ped", "PED", "Size of the PED, midpoint method (2 decimal places)", E, "2dp", pedHint),
    { id: "type", label: "Type", ask: "Is demand elastic or inelastic over this range?", answerType: "choice", answer: elastic ? "Elastic" : "Inelastic", choices: ["Elastic", "Inelastic"], hint: "Compare the size of the PED with 1." },
    { id: "rev", label: "Revenue", ask: "What happens to total revenue (price × quantity)?", answerType: "choice", answer: rises ? "Rises" : "Falls", choices: ["Rises", "Falls", "Stays the same"],
      hint: `With elastic demand, revenue moves the opposite way to the price; with inelastic demand, the same way. Here the price ${up ? "goes up" : "goes down"}.` },
  ];
  return {
    prompt: `The price of ${good} moves from $${P1} to $${P2}, and the quantity demanded from ${Q1} to ${Q2}. ${midTxt}`,
    answerType: "multi",
    parts,
    explanation:
      `Find the PED, classify it, then check the revenue.\n\n${steps}\n- ${num(E)} is ${elastic ? "more" : "less"} than 1, so demand is **${elastic ? "elastic" : "inelastic"}**\n` +
      `- Revenue goes from ${P1} × ${Q1} = $${P1 * Q1} to ${P2} × ${Q2} = $${P2 * Q2}: it **${rises ? "rises" : "falls"}**`,
    hints: ["The midpoint method uses the average of the old and new values as the base for each % change."],
    given,
    params: { kind: "elmulti", P1, P2, Q1, Q2 },
  };
}

// ---------------------------------------------------------------------------------------------
// Macro measures

const COUNTRIES = ["Arland", "Belmora", "Corvia", "Dunmere", "Estavia", "Fenmark", "Galora", "Hestria", "Karvos", "Lumeria", "Norvale", "Pellam", "Quorra", "Rendal", "Tarvos", "Valdora"];
const ctry = (rng) => rng.pick(COUNTRIES);
const bn = (n) => `$${num(n)} billion`;

function genMacro(diff, rng) {
  checkDifficulty(diff);
  const C = ctry(rng);
  const y1 = rng.int(2001, 2040);

  if (diff === "easy") {
    if (rng.next() < 0.5) {
      const g = rng.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15]);
      const G1 = 100 * rng.int(1, 40) ;
      const G2 = (G1 * (100 + g)) / 100;
      const base = {
        prompt: `The fictional country of ${C} had a GDP of ${bn(G1)} in ${y1} and ${bn(G2)} in ${y1 + 1}. What was its GDP growth rate, in percent? Use a negative number for a fall.${PCT_NOTE}`,
        explanation: `Growth % = (new − old) ÷ old × 100.\n\n\`(${num(G2)} − ${G1}) ÷ ${G1} × 100\` = ${num(G2 - G1)} ÷ ${G1} × 100 = **${g}%**`,
        hints: ["Growth % = (new GDP − old GDP) ÷ old GDP × 100.", `Work out (${num(G2)} − ${G1}) ÷ ${G1} × 100 (in the calculator: \`(_g2 - _g1) / _g1 * 100\`).`],
        given: givenFrom({ g1: G1, g2: G2 }),
        params: { kind: "growth", G1, G2, fmt: "int" },
      };
      return finishNum(base, g, "int", [((G2 - G1) / G2) * 100, G2 - G1, -g], rng, true);
    }
    const pop = rng.int(2, 90);
    const pc = 100 * rng.int(10, 600);
    const G = (pc * pop) / 1000; // $ billion
    const base = {
      prompt: `${C} (a fictional country) has a GDP of ${bn(G)} and a population of ${pop} million. What is its GDP per person, in dollars?`,
      explanation:
        `GDP per person = GDP ÷ population, with both in plain numbers.\n\n- ${bn(G)} = ${num(G * 1e9)} dollars and ${pop} million = ${pop * 1e6} people\n` +
        `- ${num(G * 1e9)} ÷ ${pop * 1e6} = **$${pc}**`,
      hints: [
        "GDP per person = GDP ÷ population. Write both as plain numbers first: a billion is 1,000,000,000 and a million is 1,000,000.",
        `Work out ${num(G)} billion ÷ ${pop} million, which is ${num(G)} ÷ ${pop} × 1000 (in the calculator: \`_gdp_bn / _pop_m * 1000\`).`,
      ],
      given: givenFrom({ gdp_bn: G, pop_m: pop }),
      params: { kind: "percap", G, pop, fmt: "int" },
    };
    return finishNum(base, pc, "int", [pc / 1000, pc * 10, (G / pop) * 1e6], rng);
  }

  if (diff === "medium") {
    const kind = rng.pick(["inflation", "real", "index", "percap"]);
    if (kind === "inflation") {
      let I1, I2, inf;
      do {
        I1 = rng.int(1000, 2500) / 10;
        I2 = Math.round(I1 * (1 + rng.int(-20, 120) / 1000) * 10) / 10;
        inf = ((I2 - I1) / I1) * 100;
      } while (I2 === I1 || !safe2(inf));
      const base = {
        prompt: `${C}'s consumer price index (CPI) was ${num(I1)} in ${y1} and ${num(I2)} in ${y1 + 1}. What was the inflation rate between the two years, in percent? Use a negative number for deflation.${PCT_NOTE}${DP2}`,
        explanation: `Inflation is the percentage change in the price index.\n\n\`(${num(I2)} − ${num(I1)}) ÷ ${num(I1)} × 100\` ${result(inf, true, pct)}`,
        hints: ["Inflation % = (new index − old index) ÷ old index × 100.", `Work out (${num(I2)} − ${num(I1)}) ÷ ${num(I1)} × 100 (in the calculator: \`(_cpi2 - _cpi1) / _cpi1 * 100\`).`],
        given: givenFrom({ cpi1: I1, cpi2: I2 }),
        params: { kind: "growth", G1: I1, G2: I2, fmt: "2dp" },
      };
      return finishNum(base, inf, "2dp", [I2 - I1, ((I2 - I1) / I2) * 100, (I2 / I1) * 100], rng, true);
    }
    if (kind === "real") {
      let N, D, R;
      do {
        N = rng.int(500, 50000) / 10;
        D = rng.int(800, 1600) / 10;
        R = (N * 100) / D;
      } while (D === 100 || !safe2(R));
      const base = {
        prompt: `${C}'s nominal GDP is ${bn(N)} and its GDP deflator is ${num(D)} (base year = 100). Using real GDP = nominal GDP × 100 ÷ deflator, what is real GDP in $ billion?${DP2}`,
        explanation: `Real GDP removes the effect of prices.\n\n\`${num(N)} × 100 ÷ ${num(D)}\` ${result(R, true)} (in $ billion)`,
        hints: ["Real GDP = nominal GDP × 100 ÷ deflator. A deflator above 100 means prices are higher than in the base year, so real GDP is smaller.", `Work out ${num(N)} × 100 ÷ ${num(D)} (in the calculator: \`_nominal * 100 / _deflator\`).`],
        given: givenFrom({ nominal: N, deflator: D }),
        params: { kind: "real", N, D },
      };
      return finishNum(base, R, "2dp", [(N * D) / 100, N - (D - 100), N / D], rng);
    }
    if (kind === "index") {
      let B0, B1, I;
      do {
        B0 = rng.int(2000, 40000) / 100;
        B1 = rng.int(Math.round(B0 * 80), Math.round(B0 * 180)) / 100;
        I = (B1 / B0) * 100;
      } while (B1 === B0 || !safe2(I));
      const basket = rng.pick(["a weekly shopping basket", "a basket of school supplies", "a basket of fuel and transport", "a basket of groceries"]);
      const base = {
        prompt: `In ${C}, ${basket} cost ${cash(B0)} in the base year ${y1} and ${cash(B1)} in ${y1 + rng.int(1, 9)}. With index = cost this year ÷ cost in the base year × 100, what is the price index this year?${DP2}`,
        explanation: `The base year scores 100, and other years are scaled to match.\n\n\`${num(B1)} ÷ ${num(B0)} × 100\` ${result(I, true)}`,
        hints: ["Index = cost this year ÷ cost in the base year × 100, so the base year is 100.", `Work out ${num(B1)} ÷ ${num(B0)} × 100 (in the calculator: \`_cost / _base_cost * 100\`).`],
        given: givenFrom({ base_cost: B0, cost: B1 }),
        params: { kind: "index", B0, B1 },
      };
      return finishNum(base, I, "2dp", [(B0 / B1) * 100, ((B1 - B0) / B0) * 100, B1 - B0], rng);
    }
    let G, pop, pc;
    do {
      G = rng.int(50, 20000) / 10;
      pop = rng.int(15, 1500) / 10;
      pc = (G * 1000) / pop;
    } while (Number.isInteger(Math.round(pc * 1e6) / 1e6) || Math.abs((pc % 1) - 0.5) < 1e-3);
    const ans = Math.round(pc);
    const base = {
      prompt: `${C} has a GDP of ${bn(G)} and a population of ${num(pop)} million. What is its GDP per person, in dollars? Round to the nearest dollar.`,
      explanation: `GDP per person = GDP ÷ population.\n\n- ${num(G)} billion ÷ ${num(pop)} million = ${num(G)} ÷ ${num(pop)} × 1000\n- ≈ ${num(pc)}, which rounds to **$${ans}**`,
      hints: ["Billions ÷ millions leaves a factor of 1000: GDP per person = GDP in billions ÷ population in millions × 1000.", `Work out ${num(G)} ÷ ${num(pop)} × 1000 (in the calculator: \`_gdp_bn / _pop_m * 1000\`), then round.`],
      given: givenFrom({ gdp_bn: G, pop_m: num(pop) * 1 }),
      params: { kind: "percapr", G, pop },
    };
    return finishNum(base, ans, "int", [Math.round(pc / 1000), Math.round(pc * 1000), Math.round((pop * 1000) / G)], rng);
  }

  // Hard
  const kind = rng.pick(["realgrowth", "realgrowth", "adjust", "realmulti"]);
  if (kind === "adjust") {
    let price, I1, I2, v;
    do {
      price = rng.int(100, 99999) / 100;
      I1 = rng.int(600, 1500) / 10;
      I2 = rng.int(Math.round(I1 * 10), Math.round(I1 * 25)) / 10;
      v = (price * I2) / I1;
    } while (I1 === I2 || !safe2(v));
    const item = rng.pick(["a game console", "a bicycle", "a month's rent", "a train season ticket", "a laptop", "a winter coat", "a guitar"]);
    const base = {
      prompt:
        `Some years ago, ${item} in ${C} cost ${cash(price)}, when the CPI was ${num(I1)}. The CPI is now ${num(I2)}. ` +
        `Using price today = old price × CPI now ÷ CPI then, what is that price in today's dollars?${DP2}`,
      explanation: `Scale the old price by how much the price index has grown.\n\n\`${num(price)} × ${num(I2)} ÷ ${num(I1)}\` ${result(v, true, $)}`,
      hints: ["Prices scale with the index: price today = old price × (CPI now ÷ CPI then).", `Work out ${num(price)} × ${num(I2)} ÷ ${num(I1)} (in the calculator: \`_price * _cpi_now / _cpi_then\`).`],
      given: givenFrom({ price, cpi_then: I1, cpi_now: I2 }),
      params: { kind: "adjust", price, I1, I2 },
    };
    return finishNum(base, v, "2dp", [(price * I1) / I2, price + (I2 - I1), price * (1 + (I2 - I1) / 100)], rng);
  }
  let N1, N2, D1, D2, R1, R2, g;
  do {
    N1 = rng.int(1000, 90000) / 10;
    N2 = Math.round(N1 * (1 + rng.int(-30, 150) / 1000) * 10) / 10;
    D1 = rng.int(900, 1300) / 10;
    D2 = Math.round(D1 * (1 + rng.int(-10, 80) / 1000) * 10) / 10;
    R1 = (N1 * 100) / D1;
    R2 = (N2 * 100) / D2;
    g = ((R2 - R1) / R1) * 100;
  } while (D1 === D2 || N1 === N2 || !safe2(g) || !safe2(R1) || !safe2(R2) || Math.abs(g) < 0.05);
  const nomg = ((N2 - N1) / N1) * 100;
  const intro =
    `${C}'s nominal GDP was ${bn(N1)} in ${y1} and ${bn(N2)} in ${y1 + 1}. The GDP deflator was ${num(D1)} and then ${num(D2)}. ` +
    `Use real GDP = nominal GDP × 100 ÷ deflator.`;
  const steps =
    `- Real ${y1}: ${num(N1)} × 100 ÷ ${num(D1)} ≈ ${num(R1)}\n- Real ${y1 + 1}: ${num(N2)} × 100 ÷ ${num(D2)} ≈ ${num(R2)}\n` +
    `- Real growth = (${num(R2)} − ${num(R1)}) ÷ ${num(R1)} × 100 ${result(g, true, pct)}`;
  const given = givenFrom({ n1: N1, n2: N2, d1: D1, d2: D2 });
  if (kind === "realmulti") {
    const parts = [
      numPart("r1", `Real GDP ${y1}`, `Real GDP in ${y1}, in $ billion (2 decimal places)`, R1, "2dp", `Work out ${num(N1)} × 100 ÷ ${num(D1)}.`),
      numPart("r2", `Real GDP ${y1 + 1}`, `Real GDP in ${y1 + 1}, in $ billion (2 decimal places)`, R2, "2dp", `Work out ${num(N2)} × 100 ÷ ${num(D2)}.`),
      numPart("g", "Real growth", "Real GDP growth in percent, from the unrounded real GDPs (2 decimal places, negative for a fall)", g, "2dp", "Growth % = (new real GDP − old real GDP) ÷ old real GDP × 100. Use the unrounded values."),
    ];
    return {
      prompt: intro,
      answerType: "multi",
      parts,
      explanation: `Turn each year's GDP into real terms, then compare.\n\n${steps}`,
      hints: ["Remove price changes first: convert each year's nominal GDP to real GDP, then work out the growth."],
      given,
      params: { kind: "realmulti", N1, N2, D1, D2 },
    };
  }
  const base = {
    prompt: `${intro} What was the real GDP growth rate, in percent? Use a negative number for a fall.${PCT_NOTE}${DP2}`,
    explanation: `Turn each year's GDP into real terms, then work out the growth.\n\n${steps}`,
    hints: [
      "Nominal growth mixes up output and prices. Convert both years to real GDP first, then work out the % change.",
      `Real GDP each year = nominal × 100 ÷ deflator (in the calculator: \`_n1 * 100 / _d1\` and \`_n2 * 100 / _d2\`).`,
      "Then growth % = (new real GDP − old real GDP) ÷ old real GDP × 100. Keep full precision until the end.",
    ],
    given,
    params: { kind: "realgrowth", N1, N2, D1, D2 },
  };
  return finishNum(base, g, "2dp", [nomg, nomg - ((D2 - D1) / D1) * 100, ((R2 - R1) / R2) * 100], rng, true);
}

// ---------------------------------------------------------------------------------------------
// Taxes and price controls

function genInt(diff, rng) {
  checkDifficulty(diff);
  const good = rng.pick(GOODS);

  if (diff === "easy") {
    const { a, b, c, d, P } = intMarket(rng, 8, 40);
    const ceiling = rng.next() < 0.5;
    let k, Pc, qd, qs;
    do {
      k = rng.int(1, Math.min(P - 2, 10));
      Pc = ceiling ? P - k : P + k;
      qd = a - b * Pc;
      qs = c + d * Pc;
    } while (Math.min(qd, qs) <= 0);
    const traded = Math.min(qd, qs);
    const askGap = rng.next() < 0.5;
    const ctl = ceiling ? `a price ceiling (a maximum price) of $${Pc}` : `a price floor (a minimum price) of $${Pc}`;
    const steps = `- Qd = ${num(a)} − ${b} × ${Pc} = ${qd}\n- Qs = ${c >= 0 ? `${num(c)} + ${d} × ${Pc}` : `${d} × ${Pc} − ${num(-c)}`} = ${qs}`;
    const base = {
      prompt:
        `${marketTxt(good, a, b, c, d)} The equilibrium price is $${P}. The government sets ${ctl}. ` +
        (askGap ? `How big is the ${ceiling ? "shortage" : "surplus"} it causes, in units?` : "How many units are actually bought and sold? (Trade can't exceed what either side is willing to do.)"),
      explanation: askGap
        ? `Compare demand and supply at the controlled price.\n\n${steps}\n- ${ceiling ? "Shortage" : "Surplus"} = ${Math.max(qd, qs)} − ${traded} = **${Math.abs(qd - qs)}**`
        : `Only the smaller of demand and supply can actually trade.\n\n${steps}\n- The ${ceiling ? "sellers" : "buyers"} are the short side, so **${traded}** units trade.`,
      hints: [
        `A ${ceiling ? "ceiling below" : "floor above"} the equilibrium price is binding. Put $${Pc} into both the demand and the supply equation.`,
        askGap
          ? `Work out Qd and Qs at $${Pc} (in the calculator: \`_a - _b * _p\` and \`_c + _d * _p\`); the gap between them is the answer.`
          : `Work out Qd and Qs at $${Pc}. ${ceiling ? "Sellers" : "Buyers"} can't be forced to trade more than they want, so the smaller one is traded.`,
      ],
      given: givenFrom({ a, b, c, d, p: Pc }),
      params: { kind: askGap ? "gap" : "traded", a, b, c, d, Pc },
    };
    const ans = askGap ? Math.abs(qd - qs) : traded;
    const wrong = askGap ? [b * k, d * k, qd] : [Math.max(qd, qs), a - b * P, Math.abs(qd - qs)];
    return finishNum(base, ans, "int", wrong, rng);
  }

  // Per-unit tax on sellers: supply becomes Qs = c + d(P − t).
  const taxMarket = (wholeOnly) => {
    for (;;) {
      const m = intMarket(rng, 6, 40);
      const t = rng.int(1, Math.min(12, m.P));
      const Pb = m.P + (m.d * t) / (m.b + m.d);
      const Q1 = m.a - m.b * Pb;
      if (Q1 <= 5) continue;
      if (wholeOnly && !Number.isInteger(Math.round(Pb * 1e6) / 1e6)) continue;
      if (!wholeOnly && (Number.isInteger(Math.round(Pb * 1e6) / 1e6) || !safe2(Pb) || !safe2(Q1))) continue;
      if (wholeOnly) { // snap away binary error, e.g. 12.999999999 -> 13
        const pb = Math.round(Pb), q1 = Math.round(Q1);
        return { ...m, t, Pb: pb, Ps: pb - t, Q1: q1 };
      }
      return { ...m, t, Pb, Ps: Pb - t, Q1 };
    }
  };
  const dP = (m) => `${m.d === 1 ? "" : num(m.d)}(P − ${m.t})`;
  const taxedS = (m) => (m.c > 0 ? `${num(m.c)} + ${dP(m)}` : m.c < 0 ? `${dP(m)} − ${num(-m.c)}` : dP(m));
  const taxTxt = (m) => `${marketTxt(good, m.a, m.b, m.c, m.d)} The government adds a tax of $${m.t} per unit, paid by sellers, so supply becomes \`Qs = ${taxedS(m)}\`, where P is the price buyers pay.`;
  const solveTxt = (m) => `Set ${demandEq(m.a, m.b)} equal to the taxed supply and solve for P`;

  if (diff === "medium") {
    let m, ask, ans;
    do { // the answer never equals a slope, which the hint writes as a bare number
      m = taxMarket(true);
      ask = rng.pick(["Pb", "Ps", "Q1", "rev"]);
      ans = ask === "Pb" ? m.Pb : ask === "Ps" ? m.Ps : ask === "Q1" ? m.Q1 : m.t * m.Q1;
    } while (ans === m.b || ans === m.d || ans === m.b + m.d);
    const q = {
      Pb: "What price do buyers now pay, in dollars?",
      Ps: "How much do sellers keep per unit after paying the tax, in dollars?",
      Q1: "How many units are traded after the tax?",
      rev: "How much tax does the government collect, in dollars?",
    }[ask];
    const steps =
      `- ${num(m.a)} − ${coefP(m.b)} = ${taxedS(m)}, so ${num(m.a - m.c + m.d * m.t)} = ${coefP(m.b + m.d)}\n` +
      `- Buyers pay P = ${num(m.a - m.c + m.d * m.t)} ÷ ${m.b + m.d} = $${m.Pb}\n- Sellers keep ${m.Pb} − ${m.t} = $${m.Ps}\n- Quantity: ${num(m.a)} − ${m.b} × ${m.Pb} = ${m.Q1}` +
      (ask === "rev" ? `\n- Tax revenue = ${m.t} × ${m.Q1} = **$${ans}**` : "");
    const base = {
      prompt: `${taxTxt(m)} ${q}`,
      explanation: `A tax opens a gap between what buyers pay and what sellers keep.\n\n${steps}` + (ask === "rev" ? "" : `\n\nSo the answer is **${ask === "Q1" ? ans : `$${ans}`}**.`),
      hints: [
        `${solveTxt(m)}: that is the price buyers pay. Sellers keep that price minus the $${m.t} tax.`,
        `${num(m.a)} − ${coefP(m.b)} = ${taxedS(m)} gives P = (${num(m.a)} − ${m.c < 0 ? `(${num(m.c)})` : num(m.c)} + ${m.d} × ${m.t}) ÷ (${m.b} + ${m.d}) (in the calculator: \`(_a - _c + _d * _t) / (_b + _d)\`).` +
          (ask === "Ps" ? " Then subtract the tax." : ask === "Q1" ? " Then put that price into the demand equation." : ask === "rev" ? " Then find the quantity from demand and multiply by the tax." : ""),
      ],
      given: givenFrom({ a: m.a, b: m.b, c: m.c, d: m.d, t: m.t }),
      params: { kind: "tax", ask, a: m.a, b: m.b, c: m.c, d: m.d, t: m.t, fmt: "int" },
    };
    const wrong = {
      Pb: [m.P + m.t, m.P, m.Ps],
      Ps: [m.P - m.t, m.P, m.Pb],
      Q1: [m.a - m.b * (m.P + m.t), m.a - m.b * m.P, m.c + m.d * m.Pb],
      rev: [m.t * (m.a - m.b * m.P), m.Pb * m.Q1, m.t * m.Q1 / 2],
    }[ask];
    return finishNum(base, ans, "int", wrong, rng);
  }

  // Hard
  const kind = rng.pick(["share", "dwl", "taxmulti", "floorcost"]);
  if (kind === "floorcost") {
    const { a, b, c, d, P } = intMarket(rng, 8, 40);
    const k = rng.int(1, 10);
    const Pf = P + k;
    const qd = a - b * Pf, qs = c + d * Pf;
    if (qd <= 0) return genInt(diff, rng);
    const cost = Pf * (qs - qd);
    const base = {
      prompt: `${marketTxt(good, a, b, c, d)} The government sets a price floor of $${Pf} and promises to buy any unsold surplus at that price. How much does it spend, in dollars?`,
      explanation:
        `Find the surplus at the floor, then pay the floor price for each unit.\n\n- Qd = ${num(a)} − ${b} × ${Pf} = ${qd}\n- Qs = ${c >= 0 ? `${num(c)} + ${d} × ${Pf}` : `${d} × ${Pf} − ${num(-c)}`} = ${qs}\n` +
        `- Surplus = ${qs} − ${qd} = ${qs - qd}\n- Spending = ${Pf} × ${qs - qd} = **$${cost}**`,
      hints: [
        "At a binding floor, sellers offer more than buyers want. The government buys that surplus at the floor price.",
        `Work out Qs − Qd at $${Pf} (in the calculator: \`(_c + _d * _p) - (_a - _b * _p)\`), then multiply by ${Pf}.`,
      ],
      given: givenFrom({ a, b, c, d, p: Pf }),
      params: { kind: "floorcost", a, b, c, d, Pf },
    };
    return finishNum(base, cost, "int", [qs - qd, P * (qs - qd), Pf * qs], rng);
  }
  const whole = rng.next() < 0.5;
  const m = taxMarket(whole);
  const fmt = whole ? "int" : "2dp";
  const sh = (m.d / (m.b + m.d)) * 100; // buyers' share of the tax, %
  const dwl = 0.5 * m.t * (m.Q - m.Q1);
  const given = givenFrom({ a: m.a, b: m.b, c: m.c, d: m.d, t: m.t });
  const pHint = `P = (${num(m.a)} − ${m.c < 0 ? `(${num(m.c)})` : num(m.c)} + ${m.d} × ${m.t}) ÷ (${m.b} + ${m.d}) (in the calculator: \`(_a - _c + _d * _t) / (_b + _d)\`).`;
  const solve =
    `- Before the tax: P = (${num(m.a)} − ${m.c < 0 ? `(${num(m.c)})` : num(m.c)}) ÷ (${m.b} + ${m.d}) = $${m.P}, Q = ${m.Q}\n` +
    `- After: buyers pay P = ${num(m.a - m.c + m.d * m.t)} ÷ ${m.b + m.d} ${whole ? `= $${m.Pb}` : `≈ $${num(m.Pb)}`}, and Q = ${num(m.a)} − ${m.b} × P ${whole ? `= ${m.Q1}` : `≈ ${num(m.Q1)}`}`;
  if (kind === "share") {
    if (!safe2(sh) || Number.isInteger(sh)) return genInt(diff, rng);
    const base = {
      prompt: `${taxTxt(m)} What percentage of the tax do buyers end up paying (the rise in the buyers' price as a share of the tax)?${PCT_NOTE}${DP2}`,
      explanation: `Compare the buyers' price before and after.\n\n${solve}\n- Buyers' share = (${num(m.Pb)} − ${m.P}) ÷ ${m.t} × 100 ${result(sh, true, pct)}`,
      hints: [
        "Find the equilibrium price without the tax, then the price buyers pay with it. The rise, divided by the tax, is the buyers' share.",
        `Without the tax P = (${num(m.a)} − ${m.c < 0 ? `(${num(m.c)})` : num(m.c)}) ÷ (${m.b} + ${m.d}). With it, ${pHint}`,
        "Buyers' share = (price with tax − price without) ÷ tax × 100. Keep full precision until the end.",
      ],
      given,
      params: { kind: "share", a: m.a, b: m.b, c: m.c, d: m.d, t: m.t },
    };
    return finishNum(base, sh, "2dp", [100 - sh, (m.b / (m.b + m.d)) * 100, 50], rng);
  }
  if (kind === "dwl") {
    if (!safe2(dwl)) return genInt(diff, rng);
    const dfmt = Number.isInteger(Math.round(dwl * 1e6) / 1e6) ? "int" : "2dp";
    const base = {
      prompt: `${taxTxt(m)} Using deadweight loss = ½ × tax × (quantity before the tax − quantity after), what is the deadweight loss in dollars?${dfmt === "int" ? "" : DP2}`,
      explanation: `Find the quantity with and without the tax, then use the triangle formula.\n\n${solve}\n- DWL = ½ × ${m.t} × (${m.Q} − ${num(m.Q1)}) ${result(dwl, dfmt === "2dp", $)}`,
      hints: [
        "Find the quantity traded before the tax (Qd = Qs) and after it (with the taxed supply).",
        `Before: P = (${num(m.a)} − ${m.c < 0 ? `(${num(m.c)})` : num(m.c)}) ÷ (${m.b} + ${m.d}). After: ${pHint} Put each price into the demand equation.`,
        "DWL = ½ × tax × (Q before − Q after).",
      ],
      given,
      params: { kind: "dwl", a: m.a, b: m.b, c: m.c, d: m.d, t: m.t, fmt: dfmt },
    };
    return finishNum(base, dfmt === "int" ? Math.round(dwl) : dwl, dfmt, [m.t * (m.Q - m.Q1), m.t * m.Q1, 0.5 * m.t * m.Q1], rng);
  }
  const rev = m.t * m.Q1;
  if (!whole && !safe2(rev)) return genInt(diff, rng);
  const parts = [
    numPart("buyers", "Buyers pay", `Price buyers pay, in dollars${whole ? "" : " (2 decimal places)"}`, m.Pb, fmt, `${solveTxt(m)}: ${pHint}`),
    numPart("qty", "Quantity", `Quantity traded after the tax${whole ? "" : " (2 decimal places)"}`, m.Q1, fmt, "Put the unrounded price buyers pay into the demand equation."),
    numPart("rev", "Tax revenue", `Tax collected, in dollars${whole ? "" : " (2 decimal places, from the unrounded quantity)"}`, rev, fmt, `Tax revenue = $${m.t} × the quantity traded after the tax.`),
  ];
  return {
    prompt: taxTxt(m),
    answerType: "multi",
    parts,
    explanation: `Solve the taxed market, then multiply.\n\n${solve}\n- Tax revenue = ${m.t} × ${num(m.Q1)} ${result(rev, !whole, $)}`,
    hints: ["The tax shifts supply: sellers only keep P − tax. Solve demand = taxed supply for the price buyers pay."],
    given,
    params: { kind: "taxmulti", a: m.a, b: m.b, c: m.c, d: m.d, t: m.t, fmt },
  };
}

export function generate({ subtopic, difficulty, rng }) {
  if (subtopic === "supply-demand") return genSD(difficulty, rng);
  if (subtopic === "elasticity") return genEl(difficulty, rng);
  if (subtopic === "macro") return genMacro(difficulty, rng);
  if (subtopic === "interventions") return genInt(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =============================================================================================
// Independent verification

const numLike = (x) =>
  (typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)));
const isDp2 = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
// fmt "int": the exact whole number. "2dp": the unique 2-decimal value within 0.005 (ties fail).
const near = (v, fmt) => (x) => {
  if (!numLike(x) || !Number.isFinite(v)) return false;
  const n = Number(x);
  if (fmt === "int") return Number.isInteger(n) && Math.abs(n - v) < 1e-6;
  if (fmt === "r0") return Number.isInteger(n) && Math.abs(n - v) < 0.5 - 1e-7;
  return isDp2(n) && Math.abs(n - v) < 0.005 - 1e-7;
};
// Exact answers that may have up to 2 decimals (e.g. PED 2.5).
const exactDec = (v) => (x) => numLike(x) && isDp2(Number(x)) && Math.abs(Number(x) - v) < 1e-9;

// Root of a decreasing excess-demand function by bisection.
function bisect(f, lo = -1e4, hi = 1e5) {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const eqPrice = (p, t = 0) => bisect((P) => (p.a - p.b * P) - (p.c + p.d * (P - t)));

function checkers(p) {
  switch (p.kind) {
    case "eqP": return { _: near(eqPrice(p), p.fmt) };
    case "eqQ": { const P = eqPrice(p); return { _: near(p.c + p.d * P, p.fmt) }; }
    case "excess":
      return {
        _: (x) => {
          const mm = typeof x === "string" && x.match(/^(Shortage|Surplus) of (\d+) units$/);
          if (!mm) return false;
          // Excess demand = (b + d) × (P* − set price), with P* found by bisection.
          const ex = (p.b + p.d) * (eqPrice(p) - p.Ps);
          return (mm[1] === "Shortage") === (ex > 0) && Math.abs(Number(mm[2]) - Math.abs(ex)) < 1e-6;
        },
      };
    case "excessnum": return { _: near((p.b + p.d) * (eqPrice(p) - p.Ps), "int") };
    case "invP":
    case "invQ": {
      const Q = bisect((q) => (p.al - p.be * q) - (p.ga + p.de * q), 0, 1e6);
      return { _: near(p.kind === "invQ" ? Q : p.ga + p.de * Q, "2dp") };
    }
    case "spend": {
      const P = eqPrice(p), Q = p.c + p.d * P;
      return { price: near(P, "2dp"), qty: near(Q, "2dp"), spend: near(P * Q, "2dp") };
    }
    case "shift": { const P = eqPrice(p); return { price: near(P, "2dp"), qty: near(p.c + p.d * P, "2dp") }; }
    case "pedpct": return { _: (x) => exactDec(p.dq / p.dp)(x) && Math.abs(Number(x) * p.dp - p.dq) < 1e-9 }; // cross-multiplied
    case "classify": {
      // Cross-multiplied comparison of dq/dp with 1.
      const want = p.dq === 0 ? "Perfectly inelastic" : p.dq > p.dp ? "Elastic" : p.dq < p.dp ? "Inelastic" : "Unit elastic";
      return { _: (x) => x === want };
    }
    case "newq": { // substitute: the % change in quantity ÷ the % change in price must equal PED
      return {
        _: (x) => {
          if (!numLike(x) || !Number.isInteger(Number(x))) return false;
          const target = p.Q1 * (1000 + (p.up ? -1 : 1) * p.E10 * p.dp) ; // = 1000 × new Q
          return Math.abs(Number(x) * 1000 - target) < 500;
        },
      };
    }
    case "revchange": {
      let r1 = 0, r2 = 0;
      for (let i = 0; i < p.Q1; i++) r1 += p.P1;
      for (let i = 0; i < p.Q2; i++) r2 += p.P2;
      return { _: near(r2 - r1, "int") };
    }
    case "pedpq": return { _: near(Math.abs(((p.Q2 / p.Q1) - 1) / ((p.P2 / p.P1) - 1)), "2dp") };
    case "pedmid": return { _: near(Math.abs(((p.Q2 - p.Q1) * (p.P1 + p.P2)) / ((p.P2 - p.P1) * (p.Q1 + p.Q2))), "2dp") };
    case "elmulti": {
      const E = Math.abs(((p.Q2 - p.Q1) * (p.P1 + p.P2)) / ((p.P2 - p.P1) * (p.Q1 + p.Q2)));
      const r1 = p.P1 * p.Q1, r2 = p.P2 * p.Q2;
      return {
        ped: near(E, "2dp"),
        type: (x) => x === (E > 1 ? "Elastic" : "Inelastic"),
        rev: (x) => x === (r2 > r1 ? "Rises" : r2 < r1 ? "Falls" : "Stays the same"),
      };
    }
    case "growth": // substitute: old × (1 + g/100) should give new
      return {
        _: (x) => {
          if (!numLike(x)) return false;
          const n = Number(x);
          if (p.fmt === "int") return Number.isInteger(n) && Math.abs(p.G1 * (1 + n / 100) - p.G2) < 1e-6;
          if (!isDp2(n)) return false;
          return Math.abs(p.G1 * (1 + n / 100) - p.G2) < (0.005 - 1e-7) * p.G1 / 100;
        },
      };
    case "percap": return { _: (x) => numLike(x) && Number.isInteger(Number(x)) && Math.abs(Number(x) * p.pop * 1e6 - p.G * 1e9) < 1e-3 };
    case "percapr": return { _: (x) => numLike(x) && Number.isInteger(Number(x)) && Math.abs(Number(x) * p.pop * 1e6 - p.G * 1e9) < (0.5 - 1e-7) * p.pop * 1e6 };
    case "real": return { _: (x) => numLike(x) && isDp2(Number(x)) && Math.abs(Number(x) * p.D - p.N * 100) < (0.005 - 1e-7) * p.D };
    case "index": return { _: (x) => numLike(x) && isDp2(Number(x)) && Math.abs(Number(x) * p.B0 - p.B1 * 100) < (0.005 - 1e-7) * p.B0 };
    case "adjust": return { _: (x) => numLike(x) && isDp2(Number(x)) && Math.abs(Number(x) * p.I1 - p.price * p.I2) < (0.005 - 1e-7) * p.I1 };
    case "realgrowth":
    case "realmulti": {
      const R1 = p.N1 / (p.D1 / 100), R2 = p.N2 / (p.D2 / 100);
      const g = (R2 / R1 - 1) * 100;
      if (p.kind === "realgrowth") return { _: near(g, "2dp") };
      return { r1: near(R1, "2dp"), r2: near(R2, "2dp"), g: near(g, "2dp") };
    }
    case "gap":
    case "traded": {
      if (p.kind === "gap") return { _: near(Math.abs((p.b + p.d) * (eqPrice(p) - p.Pc)), "int") };
      // The short side trades: buyers above equilibrium, sellers below it.
      const above = p.Pc > eqPrice(p);
      return { _: near(above ? p.a - p.b * p.Pc : p.c + p.d * p.Pc, "int") };
    }
    case "floorcost": return { _: near(p.Pf * (p.b + p.d) * (p.Pf - eqPrice(p)), "int") };
    case "tax":
    case "share":
    case "dwl":
    case "taxmulti": {
      const P0 = eqPrice(p), Q0 = p.a - p.b * P0;
      const Pb = eqPrice(p, p.t), Q1 = p.a - p.b * Pb;
      if (p.kind === "tax") {
        const v = { Pb, Ps: Pb - p.t, Q1, rev: p.t * Q1 }[p.ask];
        return { _: near(v, "int") };
      }
      if (p.kind === "share") return { _: near(((Pb - P0) / p.t) * 100, "2dp") };
      if (p.kind === "dwl") return { _: near(((Q0 - Q1) * p.t) / 2, p.fmt) };
      return { buyers: near(Pb, p.fmt), qty: near(Q1, p.fmt), rev: near(p.t * Q1, p.fmt) };
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
