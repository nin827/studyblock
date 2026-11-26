// Recipes and scaling generator: scaling recipes, kitchen measures and cooking times.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Every rounded answer states its rounding, and draws that would land
// exactly on a rounding half-step are redrawn inside generate() (same rng, still deterministic).
// Kitchen factors are always stated in the question (1 cup = 16 tbsp, 1 tbsp = 3 tsp, ...).

const pad = (n) => String(n).padStart(2, "0");
const mod = (a, n) => ((a % n) + n) % n;
const t24 = (min) => `${pad(Math.floor(mod(min, 1440) / 60))}:${pad(mod(min, 1440) % 60)}`;
function acc24(min) {
  const s = t24(min);
  const [H, M] = s.split(":");
  const out = new Set([`${+H}:${M}`, `${H}${M}`, `${H}.${M}`, `${+H}.${M}`]);
  out.delete(s);
  return [...out];
}
const readClock = (s) => {
  const m = String(s ?? "").trim().match(/^(\d{2}):(\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
};
function dur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
const TIME24 = " Give the time in 24-hour format (hh:mm).";

// Shortest form, up to 4 decimals; never "-0" (and the gcd below): mathutil.
import { fmtNum, gcd } from "../../js/lib/mathutil.js";
const num = (n) => fmtNum(n);
// Round to a step (1 = whole, 0.1, 0.01), half away from zero, with a nudge for binary error.
const roundTo = (x, step) => Math.round(x / step + 1e-9) * step;
const fix = (x, step) => Number(roundTo(x, step).toFixed(step < 1 ? Math.round(-Math.log10(step)) : 0));
// True when x sits (almost) exactly on a rounding half-step, or so close that the
// rounding is fragile; such draws are redrawn.
const nearTie = (x, step) => Math.abs((x / step) - Math.floor(x / step) - 0.5) < 1e-6;
// "= 2.625" when exact to 4 decimals, else "≈ 2.6667" (k decimals).
const approx = (x, k) => (Math.abs(x * 10000 - Math.round(x * 10000)) < 1e-6 ? `= ${num(x)}` : `≈ ${x.toFixed(k)}`);
const EXACT = { fuzzyNumber: 0 }; // whole counts (servings, packs, bakes, minutes) are exact

// `given` rows for the stated numbers ([label, value] pairs); left out when one equals the answer.
const givenOf = (ans, list) => (list.some(([, v]) => v === ans) ? {} : { given: list.map(([label, value]) => ({ label, value })) });

const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾", [1 / 3]: "⅓", [2 / 3]: "⅔" };
function cupText(c) {
  const whole = Math.floor(c + 1e-9);
  const frac = c - whole;
  const key = Object.keys(FRACTIONS).find((k) => Math.abs(+k - frac) < 1e-9);
  if (key === undefined) return num(c);
  return `${whole || ""}${FRACTIONS[key]}`;
}

const DISHES = ["pancakes", "muffins", "risotto", "porridge", "vegetable soup", "lentil curry", "cookies", "flatbreads", "fried rice", "pasta bake"];
// name, unit, min, max, step (base amounts per recipe)
const INGR = [
  ["flour", "g", 150, 600, 25], ["sugar", "g", 50, 300, 10], ["butter", "g", 50, 250, 10],
  ["milk", "mL", 100, 600, 25], ["rice", "g", 150, 500, 25], ["stock", "mL", 250, 1000, 50],
  ["oats", "g", 80, 300, 10], ["yoghurt", "g", 100, 500, 25], ["cheese", "g", 50, 250, 10],
  ["pasta", "g", 200, 500, 50], ["lentils", "g", 100, 400, 20], ["cream", "mL", 100, 400, 25],
];
const amountOf = (rng, [, , lo, hi, step]) => step * rng.int(Math.ceil(lo / step), Math.floor(hi / step));
const unitWord = (u) => (u === "g" ? "gram" : "millilitre");

// =====================================================================
// Scaling recipes
// =====================================================================
function genScaling(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["scale", "scale", "eggs"]);
    const s = rng.pick([2, 4, 6, 8]);
    const n = rng.pick(s % 2 === 0 && s > 2 ? [s / 2, 2 * s, 3 * s] : [2 * s, 3 * s]);
    const dish = rng.pick(DISHES);
    if (kind === "eggs") {
      const e = rng.int(1, 4);
      const ok = Number.isInteger((e * n) / s);
      const eggs = ok ? e : 2 * e; // keep the answer whole
      return {
        prompt: `A recipe for ${dish} serves **${s}** and uses **${eggs} eggs**. How many eggs do you need to serve **${n}**?`,
        answerType: "number", answer: (eggs * n) / s, tolerance: 0, ...EXACT,
        given: [{ label: "_serves", value: s }, { label: "_new", value: n }, { label: "_eggs", value: eggs }],
        explanation: `Scale factor = \`_new / _serves\` = ${n} / ${s} = ${num(n / s)}. Eggs: \`_eggs * _new / _serves\` = ${eggs} × ${num(n / s)} = **${(eggs * n) / s}**.`,
        hints: [`Find the scale factor: how many times bigger (or smaller) is ${n} than ${s}?`, `Multiply the ${eggs} eggs by that factor.`],
        params: { kind, s, n, a: eggs },
      };
    }
    const ing = rng.pick(INGR);
    const a = amountOf(rng, ing) * (n < s ? 2 : 1);
    const ans = (a * n) / s;
    return {
      prompt: `A recipe for ${dish} serves **${s}** and uses **${a} ${ing[1]} of ${ing[0]}**. How much ${ing[0]} do you need to serve **${n}**? Answer in ${ing[1]}.`,
      answerType: "number", answer: ans, tolerance: 0,
      given: [{ label: "_serves", value: s }, { label: "_new", value: n }, { label: "_amount", value: a }],
      explanation: `Scale factor = \`_new / _serves\` = ${n} / ${s} = ${num(n / s)}. Then \`_amount * _new / _serves\` = ${a} × ${num(n / s)} = **${ans} ${ing[1]}**.`,
      hints: [`Find the scale factor: ${n} servings ÷ ${s} servings.`, `Multiply the ${a} ${ing[1]} by that factor.`],
      params: { kind, s, n, a },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["scale", "servings", "ratio"]);
    const dish = rng.pick(DISHES);
    if (kind === "scale") {
      let s, n, a, ing, exact;
      do {
        s = rng.pick([4, 6, 8, 10, 12]);
        n = rng.int(2, 16);
        ing = rng.pick(INGR);
        a = amountOf(rng, ing);
        exact = (a * n) / s;
      } while (Number.isInteger(n / s) || Number.isInteger(s / n) || nearTie(exact, 1));
      const ans = fix(exact, 1);
      return {
        prompt: `A recipe for ${dish} serves **${s}** and uses **${a} ${ing[1]} of ${ing[0]}**. How much ${ing[0]} do you need to serve **${n}**? Round to the nearest ${unitWord(ing[1])}.`,
        answerType: "number", answer: ans, tolerance: 0,
        given: [{ label: "_serves", value: s }, { label: "_new", value: n }, { label: "_amount", value: a }],
        explanation: `Per serving: ${a} / ${s} = ${num(a / s)} ${ing[1]}. For ${n}: \`_amount / _serves * _new\` = ${num(a / s)} × ${n}` +
          (Number.isInteger(exact) ? ` = **${ans} ${ing[1]}**.` : ` ≈ ${exact.toFixed(2)}, which rounds to **${ans} ${ing[1]}**.`),
        hints: [`Find the amount for one serving first: ${a} ÷ ${s}.`, `Multiply by ${n}, then round to the nearest whole ${unitWord(ing[1])}.`],
        params: { kind, s, n, a, step: 1 },
      };
    }
    if (kind === "servings") {
      let s, n, a, b, ing;
      do {
        s = rng.pick([2, 4, 5, 6, 8]);
        n = rng.int(3, 20);
        ing = rng.pick(INGR);
        a = amountOf(rng, ing);
        b = (a * n) / s;
      } while (n === s || !Number.isInteger(b));
      return {
        prompt: `A recipe that serves **${s}** uses **${a} ${ing[1]} of ${ing[0]}**. You scaled it up or down and used **${b} ${ing[1]}** of ${ing[0]}. How many people does your batch serve?`,
        answerType: "number", answer: n, tolerance: 0, ...EXACT,
        given: [{ label: "_serves", value: s }, { label: "_amount", value: a }, { label: "_used", value: b }],
        explanation: `Scale factor = \`_used / _amount\` = ${b} / ${a} = ${num(b / a)}. Servings: \`_serves * _used / _amount\` = ${s} × ${num(b / a)} = **${n}**.`,
        hints: [`How many times the original amount did you use? ${b} ÷ ${a}.`, `Multiply the original ${s} servings by that factor.`],
        params: { kind, s, a, b },
      };
    }
    // ratio
    const pairs = [["oil", "vinegar", "salad dressing"], ["rice", "water", "a pot of rice"], ["flour", "water", "a simple dough"], ["juice", "sparkling water", "a fruit punch"], ["cordial", "water", "a drink"]];
    const [x, y, what] = rng.pick(pairs);
    const p = rng.int(1, 5);
    let q;
    do q = rng.int(1, 6); while (q === p || gcd(p, q) !== 1);
    const k = rng.int(3, 30) * 5;
    const total = (p + q) * k;
    const unit = x === "rice" || x === "flour" ? "g" : "mL";
    return {
      prompt: `For ${what}, mix ${x} and ${y} in the ratio **${p} : ${q}** (by ${unit === "g" ? "mass" : "volume"}). How much **${x}** do you need for **${total} ${unit}** in total?`,
      answerType: "number", answer: p * k, tolerance: 0,
      given: [{ label: "_p", value: p }, { label: "_q", value: q }, { label: "_total", value: total }],
      explanation: `There are ${p} + ${q} = ${p + q} parts. One part = \`_total / (_p + _q)\` = ${total} / ${p + q} = ${k} ${unit}. ${x[0].toUpperCase() + x.slice(1)}: ${p} × ${k} = **${p * k} ${unit}**.`,
      hints: [`Add the ratio numbers to get the number of equal parts: ${p} + ${q}.`, `Find one part (${total} ÷ the number of parts), then take ${p} of them.`],
      params: { kind, p, q, total },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["limit", "by-mass", "eggs-up"]);
    const dish = rng.pick(DISHES);
    if (kind === "limit") {
      let s, A, B, E, X, Y, Z, best;
      do {
        s = rng.pick([4, 6, 8, 12]);
        A = 25 * rng.int(8, 20); // flour
        B = 10 * rng.int(6, 20); // butter
        E = rng.int(2, 4); // eggs
        X = 50 * rng.int(4, 30);
        Y = 25 * rng.int(4, 24);
        Z = rng.int(2, 12);
        best = Math.min(Math.floor((X * s) / A), Math.floor((Y * s) / B), Math.floor((Z * s) / E));
      } while (best < 2 || best > 60 || new Set([Math.floor((X * s) / A), Math.floor((Y * s) / B), Math.floor((Z * s) / E)]).size < 3);
      const per = [["flour", A / s, X, "g"], ["butter", B / s, Y, "g"], ["eggs", E / s, Z, ""]];
      return {
        prompt: `A recipe for ${dish} for **${s}** people needs **${A} g flour**, **${B} g butter** and **${E} eggs**. You have **${X} g flour**, **${Y} g butter** and **${Z} eggs**. The recipe can be scaled to any whole number of servings. What is the most servings you can make?`,
        answerType: "number", answer: best, tolerance: 0, ...EXACT,
        given: [{ label: "_serves", value: s }, { label: "_flour", value: A }, { label: "_butter", value: B }, { label: "_eggs", value: E }, { label: "_have_flour", value: X }, { label: "_have_butter", value: Y }, { label: "_have_eggs", value: Z }],
        explanation: `Servings each ingredient allows (have ÷ amount per serving):\n\n${per.map(([n, ps, h, u]) => `- ${n}: ${h}${u ? " " + u : ""} ÷ ${num(ps)} = ${num(h / ps)} → ${Math.floor(h / ps + 1e-9)}`).join("\n")}\n\nThe smallest limits you: **${best}** servings.`,
        hints: ["Work out each ingredient separately: how many servings would it allow on its own?", "Per serving = recipe amount ÷ the recipe's servings; then divide what you have by that and round down.", "The ingredient that runs out first sets the answer."],
        params: { kind, s, need: [A, B, E], have: [X, Y, Z] },
      };
    }
    if (kind === "by-mass") {
      let M, A, T, exact;
      do {
        M = 50 * rng.int(12, 40);
        A = 25 * rng.int(Math.ceil((M * 0.4) / 25), Math.floor((M * 0.65) / 25));
        T = 50 * rng.int(6, 60);
        exact = (A * T) / M;
      } while (T === M || nearTie(exact, 1));
      const what = rng.pick(["bread dough", "pizza dough", "pastry", "cookie dough"]);
      const ans = fix(exact, 1);
      return {
        prompt: `A recipe makes **${M} g of ${what}** and uses **${A} g of flour**. How much flour do you need to make **${T} g** of ${what}? Round to the nearest gram.`,
        answerType: "number", answer: ans, tolerance: 0,
        given: [{ label: "_batch", value: M }, { label: "_flour", value: A }, { label: "_want", value: T }],
        explanation: `Flour is ${A} / ${M} = ${num(A / M)} of the mass. \`_flour * _want / _batch\` = ${A} × ${T} / ${M}` +
          (Number.isInteger(exact) ? ` = **${ans} g**.` : ` ≈ ${exact.toFixed(2)}, which rounds to **${ans} g**.`),
        hints: [`Scale by the total mass: the factor is ${T} ÷ ${M}.`, "Multiply the flour by that factor and round to the nearest gram."],
        params: { kind, M, A, T, step: 1 },
      };
    }
    // eggs-up: non-whole egg count, round up
    let s, n, e, exact;
    do {
      s = rng.pick([4, 6, 8]);
      n = rng.int(3, 20);
      e = rng.int(2, 5);
      exact = (e * n) / s;
    } while (n === s || Number.isInteger(exact));
    const ans = Math.ceil(exact);
    return {
      prompt: `A recipe for ${dish} for **${s}** people uses **${e} eggs**. You are cooking for **${n}**. Eggs only come whole, so you round **up**. How many eggs do you use?`,
      answerType: "number", answer: ans, tolerance: 0, ...EXACT,
      given: [{ label: "_serves", value: s }, { label: "_new", value: n }, { label: "_eggs", value: e }],
      explanation: `\`_eggs * _new / _serves\` = ${e} × ${n} / ${s} = ${num(exact)} eggs. Rounding up: **${ans}**.`,
      hints: [`Scale the eggs: ${e} × ${n} ÷ ${s}.`, "The result is not whole; round up to the next whole egg (not to the nearest)."],
      params: { kind, s, n, e },
    };
  }

  // expert
  const kind = rng.pick(["party", "dough", "limit-left"]);
  if (kind === "party") {
    let s, A, N, P, need;
    do {
      s = rng.pick([4, 6, 8, 10, 12]);
      A = 25 * rng.int(8, 24);
      N = rng.int(15, 80);
      P = rng.pick([500, 1000, 1500]);
      need = (A * N) / s;
    } while (!Number.isInteger(need) || need % P === 0 || need < P);
    const packs = Math.ceil(need / P);
    const dish = rng.pick(["pancakes", "muffins", "flatbreads", "a tray bake", "scones"]);
    return {
      prompt: `Your recipe for ${dish} serves **${s}** and uses **${A} g of flour**. You are making enough for **${N}** people. Flour is sold in **${P} g** bags.`,
      answerType: "multi",
      given: [{ label: "_serves", value: s }, { label: "_flour", value: A }, { label: "_people", value: N }, { label: "_bag", value: P }],
      parts: [
        { id: "flour", label: "Flour", ask: "How much flour do you need, in grams?", answerType: "number", answer: need, tolerance: 0, hint: `Scale the flour by ${N} ÷ ${s}.` },
        { id: "bags", label: "Bags", ask: "How many bags must you buy?", answerType: "number", answer: packs, tolerance: 0, ...EXACT, hint: `Divide the flour needed by ${P} and round up: a part-bag still has to be bought whole.` },
        { id: "left", label: "Left", ask: "How many grams of flour are left over?", answerType: "number", answer: packs * P - need, tolerance: 0, ...EXACT, hint: "Flour bought (bags × bag size) minus flour used." },
      ],
      explanation: `Flour: \`_flour * _people / _serves\` = ${A} × ${N} / ${s} = **${need} g**.\n\nBags: ${need} / ${P} = ${num(need / P)}, rounded up to **${packs}**.\n\nLeft over: ${packs} × ${P} − ${need} = **${packs * P - need} g**.`,
      params: { kind, s, A, N, P },
    };
  }
  if (kind === "dough") {
    // Baker's percentages: water h%, salt 2%, yeast 1% of the flour.
    let D, h, flourX, waterX, flour, water;
    do {
      D = 50 * rng.int(12, 40);
      h = rng.int(55, 80);
      flourX = D / (1 + h / 100 + 0.03);
      flour = fix(flourX, 1);
      waterX = (flourX * h) / 100;
      water = fix(waterX, 1);
    } while (nearTie(flourX, 1) || nearTie(waterX, 1) || fix((flour * h) / 100, 1) !== water || nearTie((flour * h) / 100, 1));
    const sum = 100 + h + 3;
    return {
      prompt: `Bakers give dough recipes as percentages of the flour. A bread uses **${h}% water**, **2% salt** and **1% yeast** (all by mass, as a percent of the flour). You want **${D} g** of dough in total.`,
      answerType: "multi",
      given: [{ label: "_dough", value: D }, { label: "_water_pct", value: h }],
      parts: [
        { id: "flour", label: "Flour", ask: "How much flour, in grams? Round to the nearest gram.", answerType: "number", answer: flour, tolerance: 0, hint: `Flour is 100%, so the whole dough is 100 + ${h} + 2 + 1 = ${sum}% of the flour. Divide the dough by ${num(sum / 100)}.` },
        { id: "water", label: "Water", ask: "How much water, in grams? Round to the nearest gram.", answerType: "number", answer: water, tolerance: 0, hint: `Water is ${h}% of the flour: multiply the flour by ${num(h / 100)}.` },
      ],
      explanation: `The dough is ${sum}% of the flour, so flour = \`_dough / (1 + _water_pct / 100 + 0.03)\` = ${D} / ${num(sum / 100)} ≈ ${flourX.toFixed(2)}, which rounds to **${flour} g**.\n\nWater = ${h}% of the flour ≈ ${waterX.toFixed(2)}, which rounds to **${water} g** (the same from your rounded flour).`,
      params: { kind, D, h },
    };
  }
  // limit-left: the limiting ingredient sets the servings; how much of another is left
  let s, A, B, X, Y, best, used;
  do {
    s = rng.pick([4, 6, 8]);
    A = 25 * rng.int(6, 16);
    B = 10 * rng.int(8, 30);
    X = 50 * rng.int(4, 20);
    Y = 50 * rng.int(4, 30);
    best = Math.min(Math.floor((X * s) / A), Math.floor((Y * s) / B));
    used = (B * best) / s;
  } while (best < 2 || Math.floor((X * s) / A) >= Math.floor((Y * s) / B) || !Number.isInteger(used) || Y - used <= 0);
  const dish = rng.pick(["pancakes", "a crumble", "biscuits", "a pie"]);
  return {
    prompt: `A recipe for ${dish} serves **${s}** and needs **${A} g of oats** and **${B} g of sugar**. You have **${X} g of oats** and **${Y} g of sugar**. You make as many whole servings as you can.`,
    answerType: "multi",
    given: [{ label: "_serves", value: s }, { label: "_oats", value: A }, { label: "_sugar", value: B }, { label: "_have_oats", value: X }, { label: "_have_sugar", value: Y }],
    parts: [
      { id: "servings", label: "Servings", ask: "How many servings can you make?", answerType: "number", answer: best, tolerance: 0, ...EXACT, hint: "Find the servings each ingredient allows on its own (round down); the smaller one wins." },
      { id: "sugar", label: "Sugar left", ask: "How many grams of sugar are left over?", answerType: "number", answer: Y - used, tolerance: 0, ...EXACT, hint: `Sugar used = ${B} ÷ ${s} per serving × your servings; take that from ${Y} g.` },
    ],
    explanation: `Oats allow ${X} / (${A} / ${s}) = ${num((X * s) / A)} → ${Math.floor((X * s) / A)} servings; sugar allows ${Y} / (${B} / ${s}) = ${num((Y * s) / B)} → ${Math.floor((Y * s) / B)}. Oats run out first: **${best}** servings.\n\nSugar used: ${num(B / s)} × ${best} = ${used} g, so **${Y - used} g** is left.`,
    params: { kind, s, A, B, X, Y },
  };
}

function verifyScaling(q, ans) {
  const p = q.params;
  const x = Number(ans);
  switch (p.kind) {
    case "scale":
    case "eggs": {
      // Unit rate check: answer / new servings should match amount / old servings.
      if (p.step) return Math.abs(x * p.s - p.a * p.n) <= 0.5 * p.s + 1e-9 && Number.isInteger(x);
      return Math.abs(x * p.s - p.a * p.n) < 1e-9;
    }
    case "servings": return Math.abs(p.a * x - p.b * p.s) < 1e-9;
    case "ratio": {
      // oil : rest should be p : q and add up to the total.
      const other = p.total - x;
      return other > 0 && Math.abs(x * p.q - other * p.p) < 1e-9;
    }
    case "limit": {
      // Try serving counts upward until an ingredient is short.
      let k = 0;
      while (p.need.every((amt, i) => (amt * (k + 1)) / p.s <= p.have[i] + 1e-9)) k++;
      return x === k;
    }
    case "by-mass": return Number.isInteger(x) && Math.abs(x * p.M - p.A * p.T) <= 0.5 * p.M + 1e-9;
    case "eggs-up": return Number.isInteger(x) && x * p.s >= p.e * p.n && (x - 1) * p.s < p.e * p.n;
    case "party": {
      const f = Number(ans.flour), b = Number(ans.bags), l = Number(ans.left);
      if (f * p.s !== p.A * p.N) return false;
      return Number.isInteger(b) && b * p.P >= f && (b - 1) * p.P < f && l === b * p.P - f;
    }
    case "dough": {
      const f = Number(ans.flour), w = Number(ans.water);
      // Rebuild the dough from the parts: flour + water + 3% should be the target within rounding.
      if (!Number.isInteger(f) || !Number.isInteger(w)) return false;
      const fx = (p.D * 100) / (100 + p.h + 3);
      return Math.abs(f - fx) <= 0.5 && Math.abs(w - (fx * p.h) / 100) <= 0.5;
    }
    case "limit-left": {
      const k = Number(ans.servings), left = Number(ans.sugar);
      const fits = (n) => (p.A * n) / p.s <= p.X + 1e-9 && (p.B * n) / p.s <= p.Y + 1e-9;
      if (!Number.isInteger(k) || !fits(k) || fits(k + 1)) return false;
      return Math.abs(left + (p.B * k) / p.s - p.Y) < 1e-9;
    }
    default: return false;
  }
}

// =====================================================================
// Kitchen measures
// =====================================================================
const SPOONED = ["baking powder", "cinnamon", "vanilla extract", "honey", "soy sauce", "olive oil", "cocoa powder", "salt", "lemon juice", "curry powder"];
const CUPPED = ["flour", "sugar", "milk", "oats", "rice", "water", "yoghurt", "chopped nuts"];
const BAKES = ["brownies", "a sponge cake", "bread rolls", "roast vegetables", "a fruit crumble", "flapjacks", "a pizza", "shortbread"];

function genUnits(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["tbsp-tsp", "tsp-tbsp", "cup-tbsp", "cup-ml"]);
    if (kind === "tbsp-tsp") {
      const n = rng.int(2, 20);
      const what = rng.pick(SPOONED);
      return { prompt: `Use **1 tablespoon (tbsp) = 3 teaspoons (tsp)**. A recipe needs **${n} tbsp** of ${what}. How many teaspoons is that?`, answerType: "number", answer: 3 * n, tolerance: 0,
        explanation: `Teaspoons are smaller, so multiply: ${n} × 3 = **${3 * n} tsp**.`, hints: ["A teaspoon is the smaller spoon, so you need more of them.", `Multiply ${n} by 3.`], params: { kind, n },
        ...givenOf(3 * n, [["_tbsp", n], ["_tsp_per_tbsp", 3]]) };
    }
    if (kind === "tsp-tbsp") {
      const n = 3 * rng.int(2, 20);
      const what = rng.pick(SPOONED);
      return { prompt: `Use **1 tablespoon (tbsp) = 3 teaspoons (tsp)**. A recipe needs **${n} tsp** of ${what}. How many tablespoons is that?`, answerType: "number", answer: n / 3, tolerance: 0,
        explanation: `Tablespoons are bigger, so divide: ${n} / 3 = **${n / 3} tbsp**.`, hints: ["A tablespoon is the bigger spoon, so you need fewer of them.", `Divide ${n} by 3.`], params: { kind, n },
        ...givenOf(n / 3, [["_tsp", n], ["_tsp_per_tbsp", 3]]) };
    }
    if (kind === "cup-tbsp") {
      const n = rng.int(2, 8);
      const what = rng.pick(CUPPED);
      return { prompt: `Use **1 cup = 16 tablespoons (tbsp)**. How many tablespoons of ${what} are in **${n} cups**?`, answerType: "number", answer: 16 * n, tolerance: 0,
        explanation: `${n} × 16 = **${16 * n} tbsp**.`, hints: ["A cup holds many tablespoons, so multiply.", `Multiply ${n} by 16.`], params: { kind, n },
        ...givenOf(16 * n, [["_cups", n], ["_tbsp_per_cup", 16]]) };
    }
    const n = rng.int(2, 8);
    const what = rng.pick(["milk", "water", "stock", "cream", "juice", "coconut milk"]);
    return { prompt: `Use **1 cup = 240 mL**. How many millilitres of ${what} are in **${n} cups**?`, answerType: "number", answer: 240 * n, tolerance: 0,
      explanation: `${n} × 240 = **${240 * n} mL**.`, hints: ["Each cup holds the same amount, so multiply.", `Multiply ${n} by the millilitres in one cup.`], params: { kind, n },
      ...givenOf(240 * n, [["_cups", n], ["_ml_per_cup", 240]]) };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["frac-cup", "ml-tsp", "oz-g", "c-f", "f-c"]);
    if (kind === "frac-cup") {
      const c = rng.pick([0.25, 0.5, 0.75, 1.25, 1.5, 2.5, 2.75, 1 / 3, 2 / 3]);
      const what = rng.pick(CUPPED);
      const third = Math.abs(c * 3 - Math.round(c * 3)) < 1e-9 && !Number.isInteger(c * 4);
      if (third) {
        const ans = Math.round(c * 48);
        return { prompt: `Use **1 cup = 16 tbsp** and **1 tbsp = 3 tsp**. How many **teaspoons** of ${what} are in **${cupText(c)} cup**?`, answerType: "number", answer: ans, tolerance: 0,
          explanation: `1 cup = 16 × 3 = 48 tsp. ${cupText(c)} of 48 = **${ans} tsp**.`, hints: ["First find how many teaspoons are in a whole cup: 16 tbsp × 3.", `Then take ${cupText(c)} of that.`], params: { kind, c, to: "tsp" },
          ...givenOf(ans, [["_tbsp_per_cup", 16], ["_tsp_per_tbsp", 3]]) }; // c is a third, shown as a fraction: not given
      }
      const ans = Math.round(c * 16);
      return { prompt: `Use **1 cup = 16 tablespoons**. How many tablespoons of ${what} are in **${cupText(c)} cup${c > 1 ? "s" : ""}**?`, answerType: "number", answer: ans, tolerance: 0,
        explanation: `${num(c)} × 16 = **${ans} tbsp**.`, hints: [`Write ${cupText(c)} as a decimal: ${num(c)}.`, "Multiply it by 16."], params: { kind, c, to: "tbsp" },
        ...givenOf(ans, [["_cups", c], ["_tbsp_per_cup", 16]]) };
    }
    if (kind === "ml-tsp") {
      const n = 5 * rng.int(2, 30);
      const what = rng.pick(["vanilla extract", "soy sauce", "lemon juice", "olive oil", "maple syrup"]);
      return { prompt: `Use **1 teaspoon = 5 mL**. How many teaspoons is **${n} mL** of ${what}?`, answerType: "number", answer: n / 5, tolerance: 0,
        explanation: `${n} / 5 = **${n / 5} tsp**.`, hints: ["Each teaspoon holds 5 mL.", `Divide ${n} by 5.`], params: { kind, n },
        ...givenOf(n / 5, [["_ml", n], ["_ml_per_tsp", 5]]) };
    }
    if (kind === "oz-g") {
      const n = rng.int(2, 32);
      const what = rng.pick(["cheese", "chocolate", "butter", "pasta", "nuts", "raisins"]);
      return { prompt: `Use **1 ounce (oz) = 28 g**. How many grams is **${n} oz** of ${what}?`, answerType: "number", answer: 28 * n, tolerance: 0,
        explanation: `${n} × 28 = **${28 * n} g**.`, hints: ["Grams are smaller than ounces, so multiply.", `Multiply ${n} by 28.`], params: { kind, n },
        ...givenOf(28 * n, [["_oz", n], ["_g_per_oz", 28]]) };
    }
    if (kind === "c-f") {
      const c = 5 * rng.int(24, 50);
      const what = rng.pick(BAKES);
      return { prompt: `A recipe for ${what} says to bake at **${c} °C**. What is that in °F? Use **°F = °C × 9 / 5 + 32**.`, answerType: "number", answer: (c * 9) / 5 + 32, tolerance: 0,
        explanation: `${c} × 9 / 5 = ${(c * 9) / 5}; + 32 = **${(c * 9) / 5 + 32} °F**.`, hints: [`Multiply ${c} by 9 and divide by 5 first.`, "Then add 32."], params: { kind, c },
        ...givenOf((c * 9) / 5 + 32, [["_C", c], ["_offset", 32]]) };
    }
    let f;
    do f = 5 * rng.int(50, 95); while ((((f - 32) * 5) % 9) === 0);
    const what = rng.pick(BAKES);
    const exact = ((f - 32) * 5) / 9;
    const ans = fix(exact, 1);
    return { prompt: `A recipe for ${what} says to bake at **${f} °F**. What is that in °C? Use **°C = (°F − 32) × 5 / 9** and round to the nearest degree.`, answerType: "number", answer: ans, tolerance: 0,
      explanation: `${f} − 32 = ${f - 32}; × 5 / 9 ≈ ${exact.toFixed(2)}, which rounds to **${ans} °C**.`, hints: [`Subtract 32 from ${f} first.`, "Then multiply by 5 and divide by 9, and round."], params: { kind, f },
      ...givenOf(ans, [["_F", f], ["_offset", 32]]) };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["g-cups", "cups-g", "butter", "lb-g", "ml-cups"]);
    if (kind === "g-cups" || kind === "cups-g") {
      const [ing, per] = rng.pick([["flour", 125], ["sugar", 200], ["rolled oats", 90], ["rice", 185], ["brown sugar", 220], ["cocoa powder", 100]]);
      if (kind === "cups-g") {
        const c = rng.pick([0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.25, 2.5, 3]);
        let ans = per * c;
        const exact = ans;
        ans = fix(exact, 1);
        if (nearTie(exact, 1)) return genUnits("hard", rng); // e.g. ¼ of 90: redraw (same rng stream)
        return { prompt: `Use **1 cup of ${ing} = ${per} g**. How many grams is **${cupText(c)} cup${c > 1 ? "s" : ""}** of ${ing}? Round to the nearest gram.`, answerType: "number", answer: ans, tolerance: 0,
          given: [{ label: "_per_cup", value: per }, { label: "_cups", value: c }],
          explanation: `\`_cups * _per_cup\` = ${num(c)} × ${per} = ${num(exact)}${Number.isInteger(exact) ? "" : `, which rounds to ${ans}`}: **${ans} g**.`,
          hints: [`Write ${cupText(c)} as a decimal: ${num(c)}.`, `Multiply by ${per} g per cup.`], params: { kind, per, c } };
      }
      let g, exact;
      do {
        g = 5 * rng.int(10, 120);
        exact = g / per;
      } while (nearTie(exact, 0.01) || Number.isInteger(exact * 4));
      const ans = fix(exact, 0.01);
      return { prompt: `Use **1 cup of ${ing} = ${per} g**. A metric recipe needs **${g} g** of ${ing}. How many cups is that? Round to 2 decimal places.`, answerType: "number", answer: ans, tolerance: 0.005,
        given: [{ label: "_grams", value: g }, { label: "_per_cup", value: per }],
        explanation: `\`_grams / _per_cup\` = ${g} / ${per} ≈ ${exact.toFixed(4)}, which rounds to **${ans.toFixed(2)} cups**.`,
        hints: ["Each cup weighs the same, so divide the grams by the grams in one cup.", "Round to 2 decimal places at the end."], params: { kind, per, g } };
    }
    if (kind === "butter") {
      let g, exact;
      do {
        g = rng.int(20, 250);
        exact = g / 14;
      } while (nearTie(exact, 0.1) || g % 14 === 0);
      const ans = fix(exact, 0.1);
      return { prompt: `Use **1 tbsp of butter = 14 g**. How many tablespoons is **${g} g** of butter? Round to 1 decimal place.`, answerType: "number", answer: ans, tolerance: 0.05,
        explanation: `${g} / 14 ≈ ${exact.toFixed(3)}, which rounds to **${ans.toFixed(1)} tbsp**.`, hints: ["Divide the grams by the grams in one tablespoon.", "Round to 1 decimal place."], params: { kind, g },
        ...givenOf(ans, [["_g", g], ["_g_per_tbsp", 14]]) };
    }
    if (kind === "lb-g") {
      let lb, oz, exact;
      do {
        lb = rng.int(1, 5);
        oz = rng.int(1, 15);
        exact = (lb * 16 + oz) * 28.35;
      } while (nearTie(exact, 1));
      const ans = fix(exact, 1);
      return { prompt: `A roast weighs **${lb} lb ${oz} oz**. Use **1 lb = 16 oz** and **1 oz = 28.35 g**. What is its mass in grams? Round to the nearest gram.`, answerType: "number", answer: ans, tolerance: 0,
        given: [{ label: "_lb", value: lb }, { label: "_oz", value: oz }],
        explanation: `\`_lb * 16 + _oz\` = ${lb} × 16 + ${oz} = ${lb * 16 + oz} oz. × 28.35 = ${num(exact)}, which rounds to **${ans} g**.`,
        hints: ["Turn everything into ounces first: pounds × 16, plus the ounces.", "Then multiply by 28.35 and round."], params: { kind, lb, oz } };
    }
    // ml-cups
    let ml, exact;
    do {
      ml = 10 * rng.int(5, 100);
      exact = ml / 240;
    } while (nearTie(exact, 0.01) || Number.isInteger(exact * 4));
    const ans = fix(exact, 0.01);
    return { prompt: `Use **1 cup = 240 mL**. How many cups is **${ml} mL** of milk? Round to 2 decimal places.`, answerType: "number", answer: ans, tolerance: 0.005,
      explanation: `${ml} / 240 ≈ ${exact.toFixed(4)}, which rounds to **${ans.toFixed(2)} cups**.`, hints: ["Divide the millilitres by 240.", "Round to 2 decimal places."], params: { kind, ml },
      ...givenOf(ans, [["_ml", ml], ["_ml_per_cup", 240]]) };
  }

  // expert
  const kind = rng.pick(["convert-scale", "fan-oven"]);
  if (kind === "convert-scale") {
    const [ing, per] = rng.pick([["sugar", 200], ["flour", 125], ["oats", 90], ["rice", 185], ["brown sugar", 220]]);
    let c, s, n, cups, gX, tX;
    do {
      c = rng.pick([0.5, 0.75, 1.25, 1.5, 2 / 3, 1 / 3, 1.75]);
      s = rng.pick([4, 6, 8]);
      n = rng.int(3, 20);
      cups = (c * n) / s;
      gX = cups * per;
      tX = cups * 16;
    } while (n === s || nearTie(gX, 1) || nearTie(tX, 1) || fix((fix(gX, 1) / per) * 16, 1) !== fix(tX, 1));
    return {
      prompt: `A recipe for **${s}** uses **${cupText(c)} cup${c > 1 ? "s" : ""}** of ${ing}. You are making it for **${n}**. Use **1 cup of ${ing} = ${per} g** and **1 cup = 16 tbsp**.`,
      answerType: "multi",
      given: [{ label: "_serves", value: s }, { label: "_new", value: n }, { label: "_cups", value: c }, { label: "_per_cup", value: per }],
      parts: [
        { id: "grams", label: "Grams", ask: `How many grams of ${ing}? Round to the nearest gram.`, answerType: "number", answer: fix(gX, 1), tolerance: 0, hint: `Scale the cups first (× ${n} ÷ ${s}), then turn cups into grams.` },
        { id: "tbsp", label: "tbsp", ask: "How many tablespoons is that? Round to the nearest tablespoon.", answerType: "number", answer: fix(tX, 1), tolerance: 0, ...EXACT, hint: "Use the scaled cups (not the grams): cups × 16." },
      ],
      explanation: `Scaled cups: \`_cups * _new / _serves\` = ${num(c)} × ${n} / ${s} ${approx(cups, 4)} cups.\n\nGrams: × ${per} ${approx(gX, 2)} → **${fix(gX, 1)} g**.\n\nTablespoons: × 16 ${approx(tX, 2)} → **${fix(tX, 1)} tbsp**.`,
      params: { kind, c, s, n, per },
    };
  }
  // fan-oven: °F recipe, convert to °C (nearest degree), then fan oven 20 °C lower, rounded to the nearest 5 °C
  let f, cX, fanX;
  do {
    f = 5 * rng.int(60, 95);
    cX = ((f - 32) * 5) / 9;
    fanX = cX - 20;
  } while (nearTie(cX, 1) || nearTie(fanX, 5) || fix(fix(cX, 1) - 20, 5) !== fix(fanX, 5));
  const what = rng.pick(BAKES);
  return {
    prompt: `An American recipe for ${what} says to bake at **${f} °F**. Your oven is a fan oven, which should be set **20 °C lower** than a conventional oven. Use **°C = (°F − 32) × 5 / 9**.`,
    answerType: "multi",
    parts: [
      { id: "c", label: "°C", ask: "The conventional oven temperature in °C, rounded to the nearest degree", answerType: "number", answer: fix(cX, 1), tolerance: 0, hint: `Subtract 32 from ${f} first, then × 5 / 9.` },
      { id: "fan", label: "Fan", ask: "The fan oven setting in °C, rounded to the nearest 5 °C (oven dials go in 5s)", answerType: "number", answer: fix(fanX, 5), tolerance: 0, ...EXACT, hint: "Take 20 off the conventional temperature, then round to the nearest multiple of 5." },
    ],
    explanation: `(${f} − 32) × 5 / 9 ≈ ${cX.toFixed(2)} → **${fix(cX, 1)} °C**. Fan: ${fix(cX, 1)} − 20 = ${fix(cX, 1) - 20}, nearest 5 → **${fix(fanX, 5)} °C**.`,
    params: { kind, f },
  };
}

function verifyUnits(q, ans) {
  const p = q.params;
  const x = Number(ans);
  const within = (a, target, half) => Math.abs(a - target) <= half + 1e-9;
  // A rounded answer has at most k decimals.
  const dp = (v, k) => Math.abs(v * 10 ** k - Math.round(v * 10 ** k)) < 1e-6;
  switch (p.kind) {
    case "tbsp-tsp": return x / 3 === p.n;
    case "tsp-tbsp": return x * 3 === p.n;
    case "cup-tbsp": return x / 16 === p.n;
    case "cup-ml": return x / 240 === p.n;
    case "frac-cup": return Math.abs(x / (p.to === "tsp" ? 48 : 16) - p.c) < 1e-9;
    case "ml-tsp": return x * 5 === p.n;
    case "oz-g": return x / 28 === p.n;
    case "c-f": return Math.abs(((x - 32) * 5) / 9 - p.c) < 1e-9;
    case "f-c": return Number.isInteger(x) && within((x * 9) / 5 + 32, p.f, 0.9); // 0.5 °C = 0.9 °F
    case "cups-g": return Number.isInteger(x) && within(x / p.per, p.c, 0.5 / p.per);
    case "g-cups": return dp(x, 2) && within(x * p.per, p.g, 0.005 * p.per);
    case "butter": return dp(x, 1) && within(x * 14, p.g, 0.05 * 14);
    case "lb-g": return Number.isInteger(x) && within(x / 28.35, p.lb * 16 + p.oz, 0.5 / 28.35);
    case "ml-cups": return dp(x, 2) && within(x * 240, p.ml, 0.005 * 240);
    case "convert-scale": {
      const g = Number(ans.grams), t = Number(ans.tbsp);
      // Back to the original recipe: grams → cups → per serving × original servings.
      return Number.isInteger(g) && Number.isInteger(t)
        && within(((g / p.per) * p.s) / p.n, p.c, (0.5 / p.per) * (p.s / p.n))
        && within(((t / 16) * p.s) / p.n, p.c, (0.5 / 16) * (p.s / p.n));
    }
    case "fan-oven": {
      const c = Number(ans.c), fan = Number(ans.fan);
      return Number.isInteger(c) && within((c * 9) / 5 + 32, p.f, 0.9) && fan % 5 === 0 && within(fan + 20, ((p.f - 32) * 5) / 9, 2.5);
    }
    default: return false;
  }
}

// =====================================================================
// Cooking times and planning
// =====================================================================
const roastRules = [
  { per: 20, unit: 500, extra: 20, what: "chicken" },
  { per: 25, unit: 500, extra: 25, what: "lamb" },
  { per: 30, unit: 500, extra: 30, what: "pork" },
  { per: 40, unit: 1000, extra: 20, what: "beef" },
];

function genCooking(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["batches", "ready"]);
    if (kind === "batches") {
      const t = rng.pick([6, 8, 9, 10, 12]);
      let n;
      do n = rng.int(10, 60); while (n % t === 0 && rng.next() < 0.6);
      const m = rng.int(8, 20);
      const what = rng.pick(["cookies", "muffins", "scones", "rolls", "biscuits"]);
      const b = Math.ceil(n / t);
      return {
        prompt: `You are baking **${n} ${what}**. One tray holds **${t}**, and only one tray fits in the oven at a time. Each tray bakes for **${m} minutes**. How many minutes of baking is that in total?`,
        answerType: "number", answer: b * m, tolerance: 0, ...EXACT,
        given: [{ label: "_items", value: n }, { label: "_per_tray", value: t }, { label: "_minutes", value: m }],
        explanation: `Trays: ${n} / ${t} = ${num(n / t)}${n % t ? `, so ${b} trays (the last one part-full)` : ` trays`}. Time: ${b} × ${m} = **${b * m} minutes**.`,
        hints: [`How many trays? ${n} ÷ ${t}, rounded up: a part-full tray still needs baking.`, `Multiply the trays by ${m} minutes.`],
        params: { kind, n, t, m },
      };
    }
    const start = 5 * rng.int(132, 240);
    const d = 5 * rng.int(3, 18);
    const what = rng.pick(["A lasagne goes into the oven", "A pot of rice starts cooking", "A tray of potatoes goes in to roast", "A pie goes into the oven"]);
    return {
      prompt: `${what} at **${t24(start)}** and needs **${d} minutes**. What time is it ready?${TIME24}`,
      answerType: "text", answer: t24(start + d), accepts: acc24(start + d),
      explanation: `${t24(start)} + ${d} min = **${t24(start + d)}**.`,
      hints: ["Add the minutes to the start time.", "If the minutes pass 60, carry 1 hour."],
      params: { kind, start, d },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["roast", "per-kg", "start"]);
    if (kind === "roast") {
      let r, mass, total;
      do {
        r = rng.pick(roastRules.filter((x) => x.unit === 500));
        mass = 250 * rng.int(3, 12);
        total = (r.per * mass) / 500 + r.extra;
      } while (!Number.isInteger(total));
      return {
        prompt: `Roast ${r.what} for **${r.per} minutes per 500 g, plus ${r.extra} minutes**. How many minutes does a **${num(mass / 1000)} kg** ${r.what} need?`,
        answerType: "number", answer: total, tolerance: 0, ...EXACT,
        given: [{ label: "_grams", value: mass }],
        explanation: `${num(mass / 1000)} kg = ${mass} g = ${num(mass / 500)} lots of 500 g. ${num(mass / 500)} × ${r.per} = ${(r.per * mass) / 500}; + ${r.extra} = **${total} minutes**.`,
        hints: [`Change kg to g and count the 500 g lots: \`_grams / 500\`.`, `Multiply by ${r.per}, then add the extra ${r.extra} minutes.`],
        params: { kind, per: r.per, unit: 500, extra: r.extra, mass },
      };
    }
    if (kind === "per-kg") {
      const per = rng.pick([36, 40, 44, 48, 60]);
      const extra = rng.pick([0, 10, 15, 20]);
      const mass = 250 * rng.int(4, 14);
      const total = (per * mass) / 1000 + extra;
      const what = rng.pick(["a ham", "a turkey crown", "a nut roast", "a joint of beef"]);
      return {
        prompt: `Cook ${what} for **${per} minutes per kg${extra ? `, plus ${extra} minutes` : ""}**. How many minutes does a **${num(mass / 1000)} kg** one need?`,
        answerType: "number", answer: total, tolerance: 0, ...EXACT,
        given: [{ label: "_kg", value: mass / 1000 }, { label: "_per_kg", value: per }],
        explanation: `\`_kg * _per_kg\` = ${num(mass / 1000)} × ${per} = ${(per * mass) / 1000}${extra ? `; + ${extra} = **${total} minutes**` : ` = **${total} minutes**`}.`,
        hints: ["Multiply the mass in kg by the minutes per kg.", extra ? `Then add the extra ${extra} minutes.` : "There is no extra time to add."],
        params: { kind, per, unit: 1000, extra, mass },
      };
    }
    const serve = 5 * rng.int(210, 264);
    const d = 5 * rng.int(9, 40);
    const what = rng.pick(["A stew needs", "A loaf needs", "A pot of chilli needs", "A baked dish needs"]);
    return {
      prompt: `${what} **${dur(d)}** to cook. You want to eat at **${t24(serve)}**. What is the latest time to start cooking?${TIME24}`,
      answerType: "text", answer: t24(serve - d), accepts: acc24(serve - d),
      explanation: `Count back: ${t24(serve)} − ${dur(d)} = **${t24(serve - d)}**.`,
      hints: ["Work backwards from the time you want to eat.", `Take off ${dur(d)}: the hours first, then the minutes.`],
      params: { kind, serve, d },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["roast-start", "two-trays"]);
    if (kind === "roast-start") {
      const r = rng.pick(roastRules);
      const mass = 250 * rng.int(4, 14);
      const rest = 5 * rng.int(2, 6);
      const serve = 5 * rng.int(216, 252);
      const cook = (r.per * mass) / r.unit + r.extra;
      if (!Number.isInteger(cook)) return genCooking("hard", rng);
      const start = serve - rest - cook;
      return {
        prompt: `Roast ${r.what} for **${r.per} minutes per ${r.unit === 500 ? "500 g" : "kg"}, plus ${r.extra} minutes**, then let it **rest for ${rest} minutes** before serving. Your ${r.what} weighs **${num(mass / 1000)} kg** and you want to serve at **${t24(serve)}**. When must it go into the oven?${TIME24}`,
        answerType: "text", answer: t24(start), accepts: acc24(start),
        given: [{ label: "_grams", value: mass }, { label: "_rest", value: rest }],
        explanation: `Cooking: ${num(mass / r.unit)} × ${r.per} + ${r.extra} = ${cook} min. With the rest: ${cook} + ${rest} = ${cook + rest} min = ${dur(cook + rest)}. ${t24(serve)} − ${dur(cook + rest)} = **${t24(start)}**.`,
        hints: [`Work out the cooking time from the rule first (${num(mass / r.unit)} lots of ${r.unit === 500 ? "500 g" : "1 kg"}).`, "Add the resting time, then count back from the serving time."],
        params: { kind, per: r.per, unit: r.unit, extra: r.extra, mass, rest, serve },
      };
    }
    const t = rng.pick([8, 9, 10, 12]);
    const n = rng.int(30, 120);
    const m = rng.int(9, 18);
    const gap = rng.int(2, 5);
    const rounds = Math.ceil(n / (2 * t));
    const total = rounds * m + (rounds - 1) * gap;
    return {
      prompt: `You are baking **${n} cookies**. Each tray holds **${t}**, and **two trays** fit in the oven at once. A bake takes **${m} minutes**, and swapping in the next trays takes **${gap} minutes** between bakes. How many minutes from putting in the first trays to taking out the last ones?`,
      answerType: "number", answer: total, tolerance: 0, ...EXACT,
      given: [{ label: "_cookies", value: n }, { label: "_per_tray", value: t }, { label: "_bake", value: m }, { label: "_swap", value: gap }],
      explanation: `Each bake holds 2 × ${t} = ${2 * t} cookies, so ${n} / ${2 * t} = ${num(n / (2 * t))} → **${rounds} bakes**. Time: ${rounds} × ${m} + ${rounds - 1} swaps × ${gap} = **${total} minutes**.`,
      hints: [`One bake holds 2 trays of ${t}. How many bakes (rounded up)?`, `There is a swap between bakes, so one fewer swap than bakes.`],
      params: { kind, t, n, m, gap },
    };
  }

  // expert
  const kind = rng.pick(["dinner", "batch-plan"]);
  if (kind === "dinner") {
    let r, mass, rest, serve, side, cook;
    do {
      r = rng.pick(roastRules);
      mass = 250 * rng.int(4, 14);
      rest = 5 * rng.int(3, 6);
      serve = 5 * rng.int(216, 252);
      side = 5 * rng.int(5, 14);
      cook = (r.per * mass) / r.unit + r.extra;
    } while (!Number.isInteger(cook) || side <= rest);
    const start = serve - rest - cook;
    const sideIn = serve - side;
    const [sideWhat, needs] = rng.pick([["Roast potatoes", "need"], ["A tray of vegetables", "needs"], ["Stuffing", "needs"], ["Yorkshire puddings", "need"]]);
    return {
      prompt: `Dinner is at **${t24(serve)}**. A **${num(mass / 1000)} kg** ${r.what} roasts for **${r.per} minutes per ${r.unit === 500 ? "500 g" : "kg"}, plus ${r.extra} minutes**, then rests out of the oven for **${rest} minutes**. ${sideWhat} (the side dish) ${needs} **${side} minutes** in the oven and must come out at ${t24(serve)}.`,
      answerType: "multi",
      given: [{ label: "_grams", value: mass }, { label: "_rest", value: rest }, { label: "_side", value: side }],
      parts: [
        { id: "cook", label: "Roast", ask: `How many minutes does the ${r.what} roast for?`, answerType: "number", answer: cook, tolerance: 0, ...EXACT, hint: `Count the ${r.unit === 500 ? "500 g" : "1 kg"} lots in ${num(mass / 1000)} kg, × ${r.per}, then + ${r.extra}.` },
        { id: "in", label: "In", ask: `When does the ${r.what} go in? (24-hour, hh:mm)`, answerType: "text", answer: t24(start), accepts: acc24(start), hint: "Count back from dinner: the rest first, then the roasting time." },
        { id: "side", label: "Side", ask: "When does the side dish go in? (24-hour, hh:mm)", answerType: "text", answer: t24(sideIn), accepts: acc24(sideIn), hint: `The side dish comes out at dinner time, so count back ${side} minutes.` },
      ],
      explanation: `Roast: ${num(mass / r.unit)} × ${r.per} + ${r.extra} = **${cook} min**. It must come out ${rest} min before dinner, at ${t24(serve - rest)}, so it goes in at ${t24(serve - rest)} − ${dur(cook)} = **${t24(start)}**.\n\nSide: ${t24(serve)} − ${side} min = **${t24(sideIn)}**.`,
      params: { kind, per: r.per, unit: r.unit, extra: r.extra, mass, rest, serve, side },
    };
  }
  const t = rng.pick([8, 10, 12]);
  const n = 5 * rng.int(12, 40);
  const m = rng.int(9, 15);
  const gap = rng.int(3, 6);
  const start = 5 * rng.int(156, 192);
  const rounds = Math.ceil(n / (2 * t));
  const total = rounds * m + (rounds - 1) * gap;
  return {
    prompt: `A bake sale needs **${n} cookies**. Each tray holds **${t}** and **two trays** bake at once. A bake takes **${m} min**, and swapping trays between bakes takes **${gap} min**. The first trays go in at **${t24(start)}**.`,
    answerType: "multi",
    given: [{ label: "_cookies", value: n }, { label: "_per_tray", value: t }, { label: "_bake", value: m }, { label: "_swap", value: gap }],
    parts: [
      { id: "bakes", label: "Bakes", ask: "How many bakes are needed?", answerType: "number", answer: rounds, tolerance: 0, ...EXACT, hint: `Each bake holds 2 × ${t} cookies; divide and round up.` },
      { id: "done", label: "Done", ask: "When do the last trays come out? (24-hour, hh:mm)", answerType: "text", answer: t24(start + total), accepts: acc24(start + total), hint: "Total time = bakes × bake time + (bakes − 1) × swap time; add it to the start." },
    ],
    explanation: `Bakes: ${n} / ${2 * t} = ${num(n / (2 * t))} → **${rounds}**. Time: ${rounds} × ${m} + ${rounds - 1} × ${gap} = ${total} min = ${dur(total)}. ${t24(start)} + ${dur(total)} = **${t24(start + total)}**.`,
    params: { kind, t, n, m, gap, start },
  };
}

function verifyCooking(q, ans) {
  const p = q.params;
  // Simulate the oven tray by tray (an independent method from ceil-based formulas).
  const simulate = (n, perBake, m, gap) => {
    let left = n, clock = 0, bakes = 0;
    while (left > 0) {
      if (bakes > 0) clock += gap;
      clock += m;
      left -= perBake;
      bakes++;
    }
    return { clock, bakes };
  };
  const cookOf = () => {
    let c = p.extra;
    for (let g = 0; g < p.mass; g += p.unit / 4) c += p.per / 4; // quarter-unit steps
    return c;
  };
  switch (p.kind) {
    case "batches": return Number(ans) === simulate(p.n, p.t, p.m, 0).clock;
    case "ready": return readClock(ans) === mod(p.start + p.d, 1440);
    case "roast": case "per-kg": return Number(ans) === cookOf();
    case "start": return mod(readClock(ans) + p.d, 1440) === p.serve;
    case "roast-start": return mod(readClock(ans) + cookOf() + p.rest, 1440) === p.serve;
    case "two-trays": return Number(ans) === simulate(p.n, 2 * p.t, p.m, p.gap).clock;
    case "dinner": {
      const c = Number(ans.cook);
      return c === cookOf() && mod(readClock(ans.in) + c + p.rest, 1440) === p.serve && mod(readClock(ans.side) + p.side, 1440) === p.serve;
    }
    case "batch-plan": {
      const sim = simulate(p.n, 2 * p.t, p.m, p.gap);
      return Number(ans.bakes) === sim.bakes && readClock(ans.done) === mod(p.start + sim.clock, 1440);
    }
    default: return false;
  }
}

// =====================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard", "expert"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const make = { scaling: genScaling, "kitchen-units": genUnits, "cooking-times": genCooking }[subtopic];
  if (!make) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = make(difficulty, rng);
  for (const k of Object.keys(q)) if (q[k] === undefined) delete q[k];
  q.params.sub = subtopic;
  return q;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || answer === undefined || answer === null || answer === "") return false;
  if (question.answerType === "multi" && typeof answer !== "object") return false;
  try {
    if (p.sub === "scaling") return verifyScaling(question, answer);
    if (p.sub === "kitchen-units") return verifyUnits(question, answer);
    if (p.sub === "cooking-times") return verifyCooking(question, answer);
    return false;
  } catch {
    return false;
  }
}
