// Shopping and money generator: unit prices, discounts and tax, budgets, and currency exchange.
// Uses only the seeded rng passed in by the engine. Hints are built from values already drawn
// (no rng calls in hint code). Money is in a generic "$" (dollars and cents); prices are kept in
// whole cents while generating. Every rounded answer states its rounding, and draws that land on a
// rounding half-step are redrawn inside generate(). Exchange rates are made up and always stated.

// Round half away from zero to k decimals, with a nudge for binary error.
const roundK = (x, k) => Math.sign(x) * Math.round(Math.abs(x) * 10 ** k + 1e-9) / 10 ** k;
const nearTie = (x, k) => {
  const v = Math.abs(x) * 10 ** k;
  return Math.abs(v - Math.floor(v) - 0.5) < 1e-6;
};
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
// "$4.20", "$12" (whole dollars), from dollars.
function cash(d) {
  const r = roundK(d, 2);
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}
const cash2 = (d) => `$${roundK(d, 2).toFixed(2)}`; // always 2 decimals (results)
const approx = (x, k = 4) => (Math.abs(x * 10 ** k - Math.round(x * 10 ** k)) < 1e-6 ? `= ${num(x)}` : `≈ ${x.toFixed(k)}`);
const EXACT = { fuzzyNumber: 0 };
const CENTS = " Give your answer in dollars, rounded to the nearest cent.";
const letters = ["A", "B", "C", "D"];

const PRODUCTS = [
  ["cereal", "g"], ["coffee", "g"], ["rice", "g"], ["washing powder", "g"], ["pasta", "g"], ["tea bags", "g"],
  ["olive oil", "mL"], ["shampoo", "mL"], ["orange juice", "mL"], ["washing-up liquid", "mL"], ["milk", "mL"], ["yoghurt", "g"],
];
const ITEMS = [["pens", "pen"], ["batteries", "battery"], ["bread rolls", "roll"], ["eggs", "egg"], ["muffins", "muffin"], ["tins of beans", "tin"], ["apples", "apple"], ["notebooks", "notebook"]];

// =====================================================================
// Unit prices and best buys
// =====================================================================
function genUnit(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["per-item", "cheaper"]);
    const [items, one] = rng.pick(ITEMS);
    if (kind === "per-item") {
      const n = rng.int(3, 12);
      const u = 5 * rng.int(5, 40);
      const p = n * u;
      return {
        prompt: `A pack of **${n} ${items}** costs **${cash(p / 100)}**. How much is that per ${one}, in dollars?`,
        answerType: "number", answer: u / 100, tolerance: 0.005,
        given: [{ label: "_price", value: p / 100 }, { label: "_count", value: n }],
        explanation: `\`_price / _count\` = ${num(p / 100)} / ${n} = **${cash2(u / 100)}** per ${one}.`,
        hints: ["Price per item = pack price ÷ number of items.", `Divide ${cash(p / 100)} by ${n}.`],
        params: { kind, n, p },
      };
    }
    let nA, nB, uA, uB;
    do {
      nA = rng.int(2, 8);
      nB = rng.int(3, 12);
      uA = 5 * rng.int(6, 30);
      uB = 5 * rng.int(6, 30);
    } while (nA === nB || Math.abs(uA - uB) < 10);
    const ans = uA < uB ? "Pack A" : "Pack B";
    return {
      prompt: `Which pack of ${items} is cheaper per ${one}?\n\n- **Pack A:** ${nA} for ${cash((nA * uA) / 100)}\n- **Pack B:** ${nB} for ${cash((nB * uB) / 100)}`,
      answerType: "choice", answer: ans, choices: ["Pack A", "Pack B"],
      explanation: `Pack A: ${cash((nA * uA) / 100)} / ${nA} = ${cash2(uA / 100)} each. Pack B: ${cash((nB * uB) / 100)} / ${nB} = ${cash2(uB / 100)} each. **${ans}** is cheaper per ${one}.`,
      hints: ["The bigger pack is not always the better deal: compare the price of one item.", "Divide each pack's price by the number of items in it."],
      params: { kind, packs: [[nA, nA * uA], [nB, nB * uB]] },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["per-100", "best-of-3"]);
    const [prod, u] = rng.pick(PRODUCTS);
    if (kind === "per-100") {
      let size, p, exact;
      do {
        size = 50 * rng.int(3, 20);
        p = rng.int(99, 899);
        exact = p / (size / 100);
      } while (nearTie(exact, 0) || Number.isInteger(exact));
      return {
        prompt: `A ${size} ${u} pack of ${prod} costs **${cash(p / 100)}**. What is the price per 100 ${u}?${CENTS}`,
        answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
        given: [{ label: "_price", value: p / 100 }, { label: "_size", value: size }],
        explanation: `${size} ${u} is ${num(size / 100)} lots of 100 ${u}. \`_price / (_size / 100)\` = ${num(p / 100)} / ${num(size / 100)} ${approx(exact / 100)}, which rounds to **${cash2(roundK(exact, 0) / 100)}**.`,
        hints: [`How many lots of 100 ${u} are in ${size} ${u}?`, "Divide the price by that number, then round to the nearest cent."],
        params: { kind, size, p },
      };
    }
    let packs;
    for (;;) {
      packs = [0, 1, 2].map(() => [50 * rng.int(4, 30), rng.int(99, 1499)]);
      const per = packs.map(([s, p]) => p / s);
      const sorted = per.slice().sort((a, b) => a - b);
      if (new Set(packs.map((x) => x[0])).size === 3 && sorted[1] / sorted[0] > 1.03) break;
    }
    const per = packs.map(([s, p]) => p / s);
    const best = per.indexOf(Math.min(...per));
    return {
      prompt: `Which size of ${prod} is the best value (lowest price per ${u})?\n\n${packs.map(([s, p], i) => `- **${letters[i]}:** ${s} ${u} for ${cash(p / 100)}`).join("\n")}`,
      answerType: "choice", answer: letters[best], choices: ["A", "B", "C"],
      explanation: `Price per 100 ${u}: ${packs.map(([s, p], i) => `${letters[i]} ${cash(p / 100)} / ${num(s / 100)} ≈ ${cash2(p / s)}`).join("; ")}. The lowest is **${letters[best]}**.`,
      hints: [`Compare the same amount of each: work out the price per 100 ${u} (or per ${u}).`, "Divide each price by its size; the smallest result is the best value."],
      params: { kind, packs },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["per-kg", "multibuy", "order"]);
    if (kind === "per-kg") {
      let size, p, exact, prod, u;
      do {
        [prod, u] = rng.pick(PRODUCTS);
        size = 25 * rng.int(6, 60);
        p = rng.int(120, 1599);
        exact = (p * 1000) / size; // cents per kg or per L
      } while (nearTie(exact, 0) || Number.isInteger(exact) || size % 1000 === 0);
      const big = u === "g" ? "kg" : "L";
      return {
        prompt: `A ${size} ${u} pack of ${prod} costs **${cash(p / 100)}**. What is the price per ${big}?${CENTS}`,
        answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
        given: [{ label: "_price", value: p / 100 }, { label: "_size", value: size }],
        explanation: `${size} ${u} = ${num(size / 1000)} ${big}. \`_price / (_size / 1000)\` = ${num(p / 100)} / ${num(size / 1000)} ${approx(exact / 100)}, which rounds to **${cash2(roundK(exact, 0) / 100)}** per ${big}.`,
        hints: [`Change the size to ${big} first: 1 ${big} = 1000 ${u}.`, `Divide the price by the size in ${big} (a pack under 1 ${big} gives a price per ${big} bigger than the pack price).`],
        params: { kind, size, p },
      };
    }
    if (kind === "multibuy") {
      const [items, one] = rng.pick(ITEMS);
      const single = 5 * rng.int(10, 60);
      const k = rng.int(7, 20);
      const free = rng.next() < 0.5;
      let ans, how;
      if (free) {
        const paid = k - Math.floor(k / 3);
        ans = (paid * single) / 100;
        how = `Every 3rd ${one} is free: ${k} ${items} = ${Math.floor(k / 3)} free and ${paid} paid. ${paid} × ${cash(single / 100)} = **${cash2(ans)}**.`;
        return {
          prompt: `${items[0].toUpperCase() + items.slice(1)} cost **${cash(single / 100)}** each, with a **"buy 2, get 1 free"** offer (every 3rd one is free). How much do **${k}** cost, in dollars?`,
          answerType: "number", answer: ans, tolerance: 0.005,
          given: [{ label: "_each", value: single / 100 }, { label: "_count", value: k }],
          explanation: how,
          hints: [`In every group of 3 you pay for 2. How many full groups of 3 are in ${k}?`, "Count the free ones, take them away, and pay for the rest."],
          params: { kind, single, k, free },
        };
      }
      const deal = 3 * single - 5 * rng.int(2, Math.floor((single * 3) / 25));
      const groups = Math.floor(k / 3);
      ans = (groups * deal + (k % 3) * single) / 100;
      return {
        prompt: `${items[0].toUpperCase() + items.slice(1)} cost **${cash(single / 100)}** each, or **3 for ${cash(deal / 100)}**. What is the cheapest price for **${k}**, in dollars?`,
        answerType: "number", answer: ans, tolerance: 0.005,
        given: [{ label: "_each", value: single / 100 }, { label: "_deal", value: deal / 100 }, { label: "_count", value: k }],
        explanation: `Use the 3-for deal as often as you can: ${k} = 3 × ${groups} + ${k % 3}. ${groups} × ${cash(deal / 100)} + ${k % 3} × ${cash(single / 100)} = **${cash2(ans)}**.`,
        hints: [`The deal is cheaper than 3 singles, so use it as many times as ${k} allows.`, "Pay the single price for any left over."],
        params: { kind, single, k, free, deal },
      };
    }
    // order: four packs, best value first (tiles)
    const [prod, u] = rng.pick(PRODUCTS);
    let packs, per;
    for (;;) {
      packs = [0, 1, 2, 3].map(() => [rng.pick([125, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000]), rng.int(99, 1999)]);
      per = packs.map(([s, p]) => p / s);
      const sorted = per.slice().sort((a, b) => a - b);
      if (new Set(packs.map((x) => x[0])).size === 4 && sorted.every((v, i) => i === 0 || v / sorted[i - 1] > 1.04)) break;
    }
    const order = [0, 1, 2, 3].sort((i, j) => per[i] - per[j]);
    const answer = order.map((i) => letters[i]).join(", ");
    return {
      prompt: `Put these packs of ${prod} in order of value, **best value first** (lowest price per ${u}):\n\n${packs.map(([s, p], i) => `- **${letters[i]}:** ${s} ${u} for ${cash(p / 100)}`).join("\n")}`,
      answerType: "tiles",
      tiles: letters.map((l, i) => ({ value: l, label: `${l}: ${packs[i][0]} ${u} for ${cash(packs[i][1] / 100)}` })),
      joiner: ", ",
      useAll: true,
      answer,
      explanation: `Price per 100 ${u}: ${order.map((i) => `${letters[i]} ≈ ${cash2(per[i])}`).join(", ")}. Order: **${answer}**.`,
      hints: [`Work out each pack's price per 100 ${u}: price ÷ (size ÷ 100).`, "The lowest price per 100 is the best value; put it first."],
      params: { kind, packs },
    };
  }

  // expert
  const kind = rng.pick(["coupon", "big-vs-small"]);
  if (kind === "coupon") {
    const [prod] = rng.pick(PRODUCTS.filter(([, u]) => u === "g"));
    let sA, pA, sB, pB, off, perA, perB, rA, rB;
    do {
      sA = 50 * rng.int(6, 30);
      pA = rng.int(250, 1500);
      sB = 50 * rng.int(6, 30);
      pB = rng.int(250, 1500);
      off = 5 * rng.int(4, 30);
      perA = (pA * 1000) / sA;
      perB = ((pB - off) * 1000) / sB;
      rA = roundK(perA, 0);
      rB = roundK(perB, 0);
    } while (sA === sB || pB - off <= 0 || nearTie(perA, 0) || nearTie(perB, 0) || Math.abs(rA - rB) < 5 || (rA < rB) !== (perA < perB) || (pA * 1000) / sA < (pB * 1000) / sB === perA < perB);
    // ^ the coupon must change which brand is cheaper per kg, so it matters.
    const ans = rA < rB ? "Brand A" : "Brand B";
    return {
      prompt: `Two brands of ${prod}:\n\n- **Brand A:** ${sA} g for ${cash(pA / 100)}\n- **Brand B:** ${sB} g for ${cash(pB / 100)}, and you have a coupon for **${cash(off / 100)} off** one pack of Brand B.`,
      answerType: "multi",
      given: [{ label: "_size_a", value: sA }, { label: "_price_a", value: pA / 100 }, { label: "_size_b", value: sB }, { label: "_price_b", value: pB / 100 }, { label: "_coupon", value: off / 100 }],
      parts: [
        { id: "a", label: "A per kg", ask: "Brand A price per kg, in dollars (nearest cent)", answerType: "number", answer: rA / 100, tolerance: 0.005, hint: `Change ${sA} g to kg, then divide the price by it.` },
        { id: "b", label: "B per kg", ask: "Brand B price per kg after the coupon, in dollars (nearest cent)", answerType: "number", answer: rB / 100, tolerance: 0.005, hint: "Take the coupon off the pack price first, then divide by the size in kg." },
        { id: "best", label: "Best", ask: "Which is better value with the coupon?", answerType: "choice", answer: ans, choices: ["Brand A", "Brand B"], hint: "Lower price per kg is better value." },
      ],
      explanation: `A: ${num(pA / 100)} / ${num(sA / 1000)} ${approx(perA / 100)} → **${cash2(rA / 100)}** per kg.\n\nB: (${num(pB / 100)} − ${num(off / 100)}) / ${num(sB / 1000)} = ${num((pB - off) / 100)} / ${num(sB / 1000)} ${approx(perB / 100)} → **${cash2(rB / 100)}** per kg.\n\nWithout the coupon B would cost ${cash2(pB / sB * 10)} per kg, so the coupon changes the answer: **${ans}**.`,
      params: { kind, sA, pA, sB, pB, off },
    };
  }
  // big-vs-small: how many small packs to match a big one, and the extra cost
  const [prod, u] = rng.pick(PRODUCTS);
  let small, big, pS, pBig, n, extra;
  do {
    small = 50 * rng.int(4, 12);
    big = 250 * rng.int(6, 16);
    pS = rng.int(150, 699);
    pBig = Math.round((pS * big) / small * (0.7 + 0.25 * rng.next()));
    n = Math.ceil(big / small);
    extra = n * pS - pBig;
  } while (big % small === 0 || extra <= 0);
  return {
    prompt: `${prod[0].toUpperCase() + prod.slice(1)} comes in a **${small} ${u}** pack for **${cash(pS / 100)}** or a **${big} ${u}** pack for **${cash(pBig / 100)}**. You need at least ${big} ${u}.`,
    answerType: "multi",
    given: [{ label: "_small", value: small }, { label: "_small_price", value: pS / 100 }, { label: "_big", value: big }, { label: "_big_price", value: pBig / 100 }],
    parts: [
      { id: "packs", label: "Packs", ask: `How many small packs would you need to get at least ${big} ${u}?`, answerType: "number", answer: n, tolerance: 0, ...EXACT, hint: `Divide ${big} by ${small} and round up.` },
      { id: "extra", label: "Extra", ask: "How much more do those small packs cost than one big pack, in dollars?", answerType: "number", answer: extra / 100, tolerance: 0.005, hint: "Small packs × small price, minus the big pack's price." },
    ],
    explanation: `${big} / ${small} = ${num(big / small)}, so **${n} packs** (${n * small} ${u}). They cost ${n} × ${cash(pS / 100)} = ${cash2((n * pS) / 100)}, which is **${cash2(extra / 100)}** more than ${cash(pBig / 100)}.`,
    params: { kind, small, big, pS, pBig },
  };
}

function verifyUnit(q, ans) {
  const p = q.params;
  const c = Math.round(Number(ans) * 100); // answers in cents
  switch (p.kind) {
    case "per-item": return c * p.n === p.p;
    case "cheaper": {
      const [[nA, pA], [nB, pB]] = p.packs;
      return ans === (pA * nB < pB * nA ? "Pack A" : "Pack B"); // cross-multiply instead of dividing
    }
    case "per-100": return Math.abs(c * p.size - 100 * p.p) <= 0.5 * p.size;
    case "per-kg": return Math.abs(c * p.size - 1000 * p.p) <= 0.5 * p.size;
    case "best-of-3": {
      const i = letters.indexOf(ans);
      return i >= 0 && p.packs.every(([s, pr], j) => j === i || p.packs[i][1] * s < pr * p.packs[i][0]);
    }
    case "multibuy": {
      // Try every way to split k into deals and singles (or count frees item by item).
      if (p.free) {
        let total = 0;
        for (let i = 1; i <= p.k; i++) if (i % 3 !== 0) total += p.single;
        return c === total;
      }
      let best = Infinity;
      for (let g = 0; 3 * g <= p.k; g++) best = Math.min(best, g * p.deal + (p.k - 3 * g) * p.single);
      return c === best;
    }
    case "order": {
      const ls = String(ans).split(",").map((x) => x.trim());
      if (ls.length !== 4 || new Set(ls).size !== 4) return false;
      const packs = ls.map((l) => p.packs[letters.indexOf(l)]);
      return packs.every((x, i) => x && (i === 0 || packs[i - 1][1] * x[0] < x[1] * packs[i - 1][0]));
    }
    case "coupon": {
      const a = Math.round(Number(ans.a) * 100), b = Math.round(Number(ans.b) * 100);
      const okA = Math.abs(a * p.sA - 1000 * p.pA) <= 0.5 * p.sA;
      const okB = Math.abs(b * p.sB - 1000 * (p.pB - p.off)) <= 0.5 * p.sB;
      const better = p.pA * p.sB < (p.pB - p.off) * p.sA ? "Brand A" : "Brand B";
      return okA && okB && ans.best === better;
    }
    case "big-vs-small": {
      const n = Number(ans.packs);
      if (!Number.isInteger(n) || n * p.small < p.big || (n - 1) * p.small >= p.big) return false;
      return Math.round(Number(ans.extra) * 100) + p.pBig === n * p.pS;
    }
    default: return false;
  }
}

// =====================================================================
// Discounts and tax
// =====================================================================
const GOODS = ["a jacket", "a pair of trainers", "a lamp", "a backpack", "a bike helmet", "a kettle", "a desk chair", "headphones", "a tent", "a board game"];

function genDiscount(difficulty, rng) {
  const item = rng.pick(GOODS);
  if (difficulty === "easy") {
    const kind = rng.pick(["sale", "saving"]);
    const pct = rng.pick([10, 20, 25, 50]);
    const price = (pct === 25 ? 4 : pct === 50 ? 2 : 10) * rng.int(2, 30);
    const off = (price * pct) / 100;
    if (kind === "sale") {
      return {
        prompt: `${item[0].toUpperCase() + item.slice(1)} costs **$${price}**. In a sale it is **${pct}% off**. What is the sale price, in dollars?`,
        answerType: "number", answer: price - off, tolerance: 0,
        given: [{ label: "_price", value: price }, { label: "_pct", value: pct }],
        explanation: `${pct}% of $${price} = ${num(pct / 100)} × ${price} = $${off}. Sale price: ${price} − ${off} = **$${price - off}**.`,
        hints: [pct === 50 ? "50% is a half." : pct === 25 ? "25% is a quarter." : `${pct}% is ${pct / 10} tenths: find 10% first (divide by 10).`, "Work out the discount, then take it off the price."],
        params: { kind, price, pct },
      };
    }
    return {
      prompt: `${item[0].toUpperCase() + item.slice(1)} costs **$${price}** and is **${pct}% off**. How many dollars do you save?`,
      answerType: "number", answer: off, tolerance: 0,
      given: [{ label: "_price", value: price }, { label: "_pct", value: pct }],
      explanation: `\`_price * _pct / 100\` = ${price} × ${pct} / 100 = **$${off}**.`,
      hints: [pct === 50 ? "50% is a half." : pct === 25 ? "25% is a quarter." : "10% is a tenth: divide by 10.", `The saving is ${pct}% of the price (not the sale price).`],
      params: { kind, price, pct },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["sale-cents", "tax"]);
    let pc, pct, exact;
    do {
      pc = rng.int(500, 25000);
      pct = kind === "tax" ? rng.int(3, 12) : rng.int(5, 60);
      exact = kind === "tax" ? (pc * (100 + pct)) / 100 : (pc * (100 - pct)) / 100;
    } while (nearTie(exact, 0) || Number.isInteger(exact));
    const ans = roundK(exact, 0) / 100;
    if (kind === "tax") {
      return {
        prompt: `${item[0].toUpperCase() + item.slice(1)} is priced at **${cash(pc / 100)}** before tax. Sales tax is **${pct}%**. What is the price including tax?${CENTS}`,
        answerType: "number", answer: ans, tolerance: 0.005,
        given: [{ label: "_price", value: pc / 100 }, { label: "_tax", value: pct }],
        explanation: `Including tax is ${100 + pct}% of the price: \`_price * (1 + _tax / 100)\` = ${num(pc / 100)} × ${num(1 + pct / 100)} ${approx(exact / 100)}, which rounds to **${cash2(ans)}**.`,
        hints: [`Adding ${pct}% means paying ${100 + pct}% of the price.`, `Multiply by ${num(1 + pct / 100)} and round to the nearest cent.`],
        params: { kind, pc, pct },
      };
    }
    return {
      prompt: `${item[0].toUpperCase() + item.slice(1)} costs **${cash(pc / 100)}** and is reduced by **${pct}%**. What is the sale price?${CENTS}`,
      answerType: "number", answer: ans, tolerance: 0.005,
      given: [{ label: "_price", value: pc / 100 }, { label: "_pct", value: pct }],
      explanation: `After ${pct}% off you pay ${100 - pct}%: \`_price * (1 - _pct / 100)\` = ${num(pc / 100)} × ${num(1 - pct / 100)} ${approx(exact / 100)}, which rounds to **${cash2(ans)}**.`,
      hints: [`Taking ${pct}% off leaves ${100 - pct}% of the price.`, `Multiply by ${num(1 - pct / 100)} and round to the nearest cent.`],
      params: { kind, pc, pct },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["successive", "original", "discount-tax"]);
    if (kind === "successive") {
      let a, b;
      do {
        a = 5 * rng.int(2, 10);
        b = rng.int(5, 30);
      } while (a === b);
      const total = 100 - ((100 - a) * (100 - b)) / 100;
      return {
        prompt: `A shop takes **${a}% off** ${item}, then a further **${b}% off** the reduced price at the till. What single percentage discount is that overall? Answer as a number without the % sign.`,
        answerType: "number", answer: total, tolerance: 0.001,
        given: [{ label: "_first", value: a }, { label: "_second", value: b }],
        explanation: `You pay ${100 - a}% of ${100 - b}%: ${num(1 - a / 100)} × ${num(1 - b / 100)} = ${num(((100 - a) * (100 - b)) / 10000)}. So the discount is 1 − ${num(((100 - a) * (100 - b)) / 10000)} = **${num(total)}%** (not ${a + b}%).`,
        hints: ["The second discount is taken from the already reduced price, so you can't just add them.", `Multiply what's left after each one: ${num(1 - a / 100)} × ${num(1 - b / 100)}, then see what fraction is taken off.`],
        params: { kind, a, b },
      };
    }
    if (kind === "original") {
      let pct, paid, exact;
      do {
        pct = rng.int(10, 60);
        paid = rng.int(800, 30000);
        exact = (paid * 100) / (100 - pct);
      } while (nearTie(exact, 0) || Number.isInteger(exact));
      const ans = roundK(exact, 0) / 100;
      return {
        prompt: `After **${pct}% off**, ${item} costs **${cash(paid / 100)}**. What was the price before the discount?${CENTS}`,
        answerType: "number", answer: ans, tolerance: 0.005,
        given: [{ label: "_paid", value: paid / 100 }, { label: "_pct", value: pct }],
        explanation: `${cash(paid / 100)} is ${100 - pct}% of the original, so divide: \`_paid / (1 - _pct / 100)\` = ${num(paid / 100)} / ${num(1 - pct / 100)} ${approx(exact / 100)}, which rounds to **${cash2(ans)}**.`,
        hints: [`The sale price is ${100 - pct}% of the original price.`, `Divide by ${num(1 - pct / 100)} (adding ${pct}% back on is not the same).`],
        params: { kind, pct, paid },
      };
    }
    let pc, pct, tax, exact;
    do {
      pc = rng.int(1000, 40000);
      pct = rng.int(5, 50);
      tax = rng.int(4, 12);
      exact = (pc * (100 - pct) * (100 + tax)) / 10000;
    } while (nearTie(exact, 0) || Number.isInteger(exact));
    const ans = roundK(exact, 0) / 100;
    return {
      prompt: `${item[0].toUpperCase() + item.slice(1)} is marked **${cash(pc / 100)}**. It is **${pct}% off**, and then **${tax}% sales tax** is added to the sale price. What do you pay? Round only at the end.${CENTS}`,
      answerType: "number", answer: ans, tolerance: 0.005,
      given: [{ label: "_price", value: pc / 100 }, { label: "_off", value: pct }, { label: "_tax", value: tax }],
      explanation: `\`_price * (1 - _off / 100) * (1 + _tax / 100)\` = ${num(pc / 100)} × ${num(1 - pct / 100)} × ${num(1 + tax / 100)} ${approx(exact / 100)}, which rounds to **${cash2(ans)}**.`,
      hints: [`First the discount: you pay ${100 - pct}% of the price.`, `Then the tax adds ${tax}% to that: multiply by ${num(1 + tax / 100)}. Round at the end.`],
      params: { kind, pc, pct, tax },
    };
  }

  // expert
  const kind = rng.pick(["compare", "backwards"]);
  if (kind === "compare") {
    let pc, a, d, m, tax, tA, tB;
    do {
      pc = rng.int(4000, 30000);
      a = rng.int(10, 35);
      m = 1000 * rng.int(2, Math.floor(pc / 1000));
      d = 500 * rng.int(1, 12);
      tax = rng.int(5, 10);
      tA = (pc * (100 - a) * (100 + tax)) / 10000;
      tB = ((pc - d) * (100 + tax)) / 100;
    } while (nearTie(tA, 0) || nearTie(tB, 0) || Math.abs(roundK(tA, 0) - roundK(tB, 0)) < 20 || d >= pc || m > pc);
    const rA = roundK(tA, 0), rB = roundK(tB, 0);
    const ans = rA < rB ? "Store A" : "Store B";
    return {
      prompt: `${item[0].toUpperCase() + item.slice(1)} is **${cash(pc / 100)}** in two stores. **Store A** takes **${a}% off**. **Store B** takes **${cash(d / 100)} off** any purchase of ${cash(m / 100)} or more. Both then add **${tax}% sales tax** to the reduced price.`,
      answerType: "multi",
      given: [{ label: "_price", value: pc / 100 }, { label: "_pct", value: a }, { label: "_off", value: d / 100 }, { label: "_tax", value: tax }],
      parts: [
        { id: "a", label: "Store A", ask: "Total at Store A, in dollars (nearest cent)", answerType: "number", answer: rA / 100, tolerance: 0.005, hint: `Pay ${100 - a}% of the price, then add ${tax}% tax.` },
        { id: "b", label: "Store B", ask: "Total at Store B, in dollars (nearest cent)", answerType: "number", answer: rB / 100, tolerance: 0.005, hint: `The price qualifies for the ${cash(d / 100)} off; take it off, then add ${tax}% tax.` },
        { id: "best", label: "Cheaper", ask: "Which store is cheaper?", answerType: "choice", answer: ans, choices: ["Store A", "Store B"], hint: "Compare the two totals." },
      ],
      explanation: `A: ${num(pc / 100)} × ${num(1 - a / 100)} × ${num(1 + tax / 100)} ${approx(tA / 100)} → **${cash2(rA / 100)}**.\n\nB: (${num(pc / 100)} − ${num(d / 100)}) × ${num(1 + tax / 100)} ${approx(tB / 100)} → **${cash2(rB / 100)}**.\n\n**${ans}** is cheaper.`,
      params: { kind, pc, a, d, m, tax },
    };
  }
  // backwards: total paid includes tax after a discount; find the marked price and the saving
  let pct, tax, paid, orig, saved;
  do {
    pct = rng.int(10, 40);
    tax = rng.int(5, 12);
    paid = rng.int(2000, 30000);
    orig = (paid * 10000) / ((100 - pct) * (100 + tax));
    saved = (orig * pct) / 100;
  } while (nearTie(orig, 0) || nearTie(saved, 0) || roundK((roundK(orig, 0) * pct) / 100, 0) !== roundK(saved, 0) || nearTie((roundK(orig, 0) * pct) / 100, 0));
  return {
    prompt: `You paid **${cash(paid / 100)}** for ${item}. That price includes **${tax}% sales tax**, added after a **${pct}% discount**.`,
    answerType: "multi",
    given: [{ label: "_paid", value: paid / 100 }, { label: "_off", value: pct }, { label: "_tax", value: tax }],
    parts: [
      { id: "orig", label: "Marked", ask: "What was the marked price before the discount and tax? Dollars, nearest cent.", answerType: "number", answer: roundK(orig, 0) / 100, tolerance: 0.005, hint: `Undo the steps in reverse order: divide by ${num(1 + tax / 100)} to remove the tax, then by ${num(1 - pct / 100)} to undo the discount.` },
      { id: "saved", label: "Saved", ask: "How much was the discount, in dollars (before tax), to the nearest cent?", answerType: "number", answer: roundK(saved, 0) / 100, tolerance: 0.005, hint: `The discount is ${pct}% of the marked price.` },
    ],
    explanation: `Without tax: ${num(paid / 100)} / ${num(1 + tax / 100)} ${approx(paid / (100 + tax))}. Undo the discount: / ${num(1 - pct / 100)} ${approx(orig / 100)} → **${cash2(roundK(orig, 0) / 100)}**.\n\nDiscount: ${pct}% of that ${approx(saved / 100)} → **${cash2(roundK(saved, 0) / 100)}** (the same from your rounded price).`,
    params: { kind, pct, tax, paid },
  };
}

function verifyDiscount(q, ans) {
  const p = q.params;
  const c = (v) => Math.round(Number(v) * 100);
  switch (p.kind) {
    case "sale": return (p.price - Number(ans)) * 100 === p.price * p.pct;
    case "saving": return Number(ans) * 100 === p.price * p.pct;
    case "sale-cents": return Math.abs(c(ans) * 100 - p.pc * (100 - p.pct)) <= 50;
    case "tax": return Math.abs(c(ans) * 100 - p.pc * (100 + p.pct)) <= 50;
    case "successive": {
      // Apply both to $100 and to the single % to $100: same result.
      const two = 100 * (1 - p.a / 100) * (1 - p.b / 100);
      return Math.abs(100 * (1 - Number(ans) / 100) - two) < 1e-6;
    }
    case "original": return Math.abs(c(ans) * (100 - p.pct) - p.paid * 100) <= 0.5 * (100 - p.pct);
    case "discount-tax": return Math.abs(c(ans) * 10000 - p.pc * (100 - p.pct) * (100 + p.tax)) <= 5000;
    case "compare": {
      const a = c(ans.a), b = c(ans.b);
      const okA = Math.abs(a * 10000 - p.pc * (100 - p.a) * (100 + p.tax)) <= 5000;
      const okB = p.pc >= p.m && Math.abs(b * 100 - (p.pc - p.d) * (100 + p.tax)) <= 50;
      return okA && okB && ans.best === (a < b ? "Store A" : "Store B");
    }
    case "backwards": {
      // Forward from the candidate marked price: discount then tax should give the paid amount.
      const o = c(ans.orig), s = c(ans.saved);
      const fwd = (o * (100 - p.pct) * (100 + p.tax)) / 10000;
      return Math.abs(fwd - p.paid) <= 0.5 * ((100 - p.pct) * (100 + p.tax)) / 10000 + 1e-9 && Math.abs(s * 100 - o * p.pct) <= 50;
    }
    default: return false;
  }
}

// =====================================================================
// Bills, pay and budgets
// =====================================================================
const SHOP = [["bread", 120, 450], ["a magazine", 250, 900], ["milk", 90, 350], ["a sandwich", 250, 799], ["a bus ticket", 150, 450], ["coffee", 180, 550], ["a phone case", 500, 1999], ["socks", 299, 899], ["a cake", 350, 1599]];

function genBudget(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["change", "wage"]);
    if (kind === "change") {
      const picks = rng.shuffle(SHOP.slice()).slice(0, rng.int(2, 3));
      const prices = picks.map(([, lo, hi]) => rng.int(lo, hi));
      const total = prices.reduce((a, b) => a + b, 0);
      const note = [1000, 2000, 5000].find((n) => n > total);
      return {
        prompt: `You buy ${picks.map(([w], i) => `${w} (${cash(prices[i] / 100)})`).join(", ").replace(/, ([^,]*)$/, " and $1")} and pay with a **${cash(note / 100)}** note. How much change do you get, in dollars?`,
        answerType: "number", answer: (note - total) / 100, tolerance: 0.005,
        given: prices.map((v, i) => ({ label: `_${"abc"[i]}`, value: v / 100 })),
        explanation: `Total: ${prices.map((v) => num(v / 100)).join(" + ")} = ${cash2(total / 100)}. Change: ${note / 100} − ${num(total / 100)} = **${cash2((note - total) / 100)}**.`,
        hints: ["Add up the prices first.", `Then subtract the total from ${cash(note / 100)} (counting up from the total works too).`],
        params: { kind, prices, note },
      };
    }
    const h = rng.int(3, 40);
    const r = rng.int(9, 30);
    const job = rng.pick(["at a café", "in a shop", "as a lifeguard", "at a cinema", "in a warehouse"]);
    return {
      prompt: `You work **${h} hours** ${job} at **$${r} per hour**. How much do you earn, in dollars?`,
      answerType: "number", answer: h * r, tolerance: 0,
      given: [{ label: "_hours", value: h }, { label: "_rate", value: r }],
      explanation: `\`_hours * _rate\` = ${h} × ${r} = **$${h * r}**.`,
      hints: ["Pay = hours × hourly rate.", `Multiply ${h} by ${r}.`],
      params: { kind, h, r },
    };
  }

  if (difficulty === "medium") {
    const kind = rng.pick(["split", "weekly"]);
    if (kind === "split") {
      let bill, tip, n, exact;
      do {
        bill = rng.int(2500, 25000);
        tip = rng.pick([10, 12, 15, 18, 20]);
        n = rng.int(2, 8);
        exact = (bill * (100 + tip)) / 100 / n;
      } while (nearTie(exact, 0) || Number.isInteger(exact));
      const ans = roundK(exact, 0) / 100;
      return {
        prompt: `A restaurant bill is **${cash(bill / 100)}**. The group adds a **${tip}% tip** and splits the total equally between **${n} people**. How much does each person pay?${CENTS}`,
        answerType: "number", answer: ans, tolerance: 0.005,
        given: [{ label: "_bill", value: bill / 100 }, { label: "_tip", value: tip }, { label: "_people", value: n }],
        explanation: `With the tip: ${num(bill / 100)} × ${num(1 + tip / 100)} ${approx((bill * (100 + tip)) / 10000)}. Each: \`_bill * (1 + _tip / 100) / _people\` ${approx(exact / 100)}, which rounds to **${cash2(ans)}**.`,
        hints: [`Add the tip first: multiply the bill by ${num(1 + tip / 100)}.`, `Then share it between ${n} and round to the nearest cent.`],
        params: { kind, bill, tip, n },
      };
    }
    const h = rng.int(8, 40) + (rng.next() < 0.5 ? 0.5 : 0);
    const r = 2 * rng.int(550, 1500); // even cents keep half hours whole
    const pay = h * r;
    return {
      prompt: `You work **${num(h)} hours** this week at **${cash(r / 100)} per hour**. What is your pay for the week, in dollars?`,
      answerType: "number", answer: pay / 100, tolerance: 0.005,
      given: [{ label: "_hours", value: h }, { label: "_rate", value: r / 100 }],
      explanation: `\`_hours * _rate\` = ${num(h)} × ${num(r / 100)} = **${cash2(pay / 100)}**.`,
      hints: ["Pay = hours × hourly rate.", "Half an hour is 0.5 of an hour."],
      params: { kind, h, r },
    };
  }

  if (difficulty === "hard") {
    const kind = rng.pick(["budget-left", "save-weeks", "per-year"]);
    if (kind === "budget-left") {
      const income = 50 * rng.int(30, 120);
      const rent = rng.int(25, 40);
      const food = rng.int(10, 20);
      const fixed = 5 * rng.int(10, 60);
      const left = income - (income * rent) / 100 - (income * food) / 100 - fixed;
      return {
        prompt: `Your monthly take-home pay is **$${income}**. Rent is **${rent}%** of it, food is **${food}%**, and transport is **$${fixed}** a month. How much is left each month, in dollars?`,
        answerType: "number", answer: roundK(left, 2), tolerance: 0.005,
        given: [{ label: "_income", value: income }, { label: "_rent", value: rent }, { label: "_food", value: food }, { label: "_transport", value: fixed }],
        explanation: `Rent: ${rent}% of ${income} = ${num((income * rent) / 100)}. Food: ${food}% = ${num((income * food) / 100)}. Left: ${income} − ${num((income * rent) / 100)} − ${num((income * food) / 100)} − ${fixed} = **${cash2(left)}**.`,
        hints: ["Turn each percentage into dollars: percent ÷ 100 × income.", "Subtract every cost (the percentages and the fixed amount) from the income."],
        params: { kind, income, rent, food, fixed },
      };
    }
    if (kind === "save-weeks") {
      let goal, have, w;
      do {
        goal = 10 * rng.int(20, 150);
        have = 5 * rng.int(0, 40);
        w = rng.int(12, 60);
      } while (have >= goal || (goal - have) % w === 0);
      const weeks = Math.ceil((goal - have) / w);
      const thing = rng.pick(["a bike", "a games console", "a guitar", "a weekend trip", "a laptop"]);
      return {
        prompt: `You want to buy ${thing} for **$${goal}**. You have **$${have}** saved and can save **$${w} a week**. How many weeks until you can afford it?`,
        answerType: "number", answer: weeks, tolerance: 0, ...EXACT,
        given: [{ label: "_goal", value: goal }, { label: "_have", value: have }, { label: "_weekly", value: w }],
        explanation: `Still needed: ${goal} − ${have} = $${goal - have}. ${goal - have} / ${w} = ${num((goal - have) / w)}, so **${weeks} weeks** (round up: after ${weeks - 1} weeks you'd be $${goal - have - (weeks - 1) * w} short).`,
        hints: ["Find how much more you need first.", "Divide by the weekly saving and round up: a part-week still has to be waited."],
        params: { kind, goal, have, w },
      };
    }
    const wk = 5 * rng.int(10, 60);
    let mo;
    do mo = 25 * rng.int(8, 60); while (mo * 12 === wk * 52);
    const diff = Math.abs(wk * 52 - mo * 12);
    const more = wk * 52 > mo * 12 ? "the weekly one" : "the monthly one";
    return {
      prompt: `One gym costs **$${wk} a week** and another costs **$${mo} a month**. Use 52 weeks and 12 months in a year. How many dollars a year more does the dearer one cost?`,
      answerType: "number", answer: diff, tolerance: 0,
      given: [{ label: "_weekly", value: wk }, { label: "_monthly", value: mo }],
      explanation: `Weekly: ${wk} × 52 = $${wk * 52}. Monthly: ${mo} × 12 = $${mo * 12}. The dearer is ${more}, by **$${diff}** a year.`,
      hints: ["Put both on the same footing: cost per year.", "Weekly × 52 and monthly × 12, then subtract the smaller from the bigger."],
      params: { kind, wk, mo },
    };
  }

  // expert
  const kind = rng.pick(["plans", "payslip"]);
  if (kind === "plans") {
    let a, inc, x, b, u, cA, cB;
    do {
      a = 100 * rng.int(8, 30) - rng.pick([0, 1, 5]);
      inc = rng.int(2, 20);
      x = 50 * rng.int(2, 12);
      b = 100 * rng.int(15, 60) - rng.pick([0, 1, 5]);
      u = rng.int(1, 40);
      cA = a + Math.max(0, u - inc) * x;
      cB = b;
    } while (cA === cB || u <= inc || Math.abs(cA - cB) < 50 || b <= a);
    const ans = cA < cB ? "Plan A" : "Plan B";
    return {
      prompt: `Two phone plans:\n\n- **Plan A:** ${cash(a / 100)} a month, including **${inc} GB** of data, then **${cash(x / 100)} per extra GB**.\n- **Plan B:** ${cash(b / 100)} a month with unlimited data.\n\nThis month you use **${u} GB**.`,
      answerType: "multi",
      given: [{ label: "_a", value: a / 100 }, { label: "_included", value: inc }, { label: "_extra", value: x / 100 }, { label: "_b", value: b / 100 }, { label: "_used", value: u }],
      parts: [
        { id: "a", label: "Plan A", ask: "Cost of Plan A this month, in dollars", answerType: "number", answer: cA / 100, tolerance: 0.005, hint: `Only the GB above ${inc} are charged extra.` },
        { id: "b", label: "Plan B", ask: "Cost of Plan B this month, in dollars", answerType: "number", answer: cB / 100, tolerance: 0.005, hint: "Unlimited data: the monthly price is all you pay." },
        { id: "best", label: "Cheaper", ask: "Which plan is cheaper this month?", answerType: "choice", answer: ans, choices: ["Plan A", "Plan B"], hint: "Compare the two costs." },
      ],
      explanation: `Plan A: ${u} − ${inc} = ${u - inc} extra GB × ${cash(x / 100)} = ${cash2(((u - inc) * x) / 100)}, plus ${cash(a / 100)} = **${cash2(cA / 100)}**. Plan B: **${cash2(cB / 100)}**. **${ans}** is cheaper.`,
      params: { kind, a, inc, x, b, u },
    };
  }
  // payslip: base + overtime at 1.5x, tax on gross, net
  let h1, h2, r, t, gross, taxX;
  do {
    h1 = rng.int(30, 40);
    h2 = rng.int(2, 12) + (rng.next() < 0.5 ? 0.5 : 0);
    r = 4 * rng.int(300, 650); // multiple of 4 cents keeps 1.5 × half hours whole
    t = rng.int(10, 25);
    gross = h1 * r + h2 * r * 1.5;
    taxX = (gross * t) / 100;
  } while (nearTie(taxX, 0) || Number.isInteger(taxX));
  const tax = roundK(taxX, 0);
  return {
    prompt: `This week you worked **${h1} normal hours** at **${cash(r / 100)} per hour** and **${num(h2)} hours of overtime** at **1.5 times** that rate. **${t}%** of your gross pay is taken as tax.`,
    answerType: "multi",
    given: [{ label: "_hours", value: h1 }, { label: "_overtime", value: h2 }, { label: "_rate", value: r / 100 }, { label: "_tax", value: t }],
    parts: [
      { id: "gross", label: "Gross", ask: "Gross pay (before tax), in dollars", answerType: "number", answer: gross / 100, tolerance: 0.005, hint: "Normal hours × rate, plus overtime hours × rate × 1.5." },
      { id: "tax", label: "Tax", ask: "Tax, in dollars, rounded to the nearest cent", answerType: "number", answer: tax / 100, tolerance: 0.005, hint: `Tax is ${t}% of the gross pay.` },
      { id: "net", label: "Net", ask: "Take-home pay (gross minus your rounded tax), in dollars", answerType: "number", answer: (gross - tax) / 100, tolerance: 0.005, hint: "Subtract the tax from the gross pay." },
    ],
    explanation: `Normal: ${h1} × ${num(r / 100)} = ${cash2((h1 * r) / 100)}. Overtime rate: ${num(r / 100)} × 1.5 = ${num((r * 1.5) / 100)}; × ${num(h2)} = ${cash2((h2 * r * 1.5) / 100)}. Gross: **${cash2(gross / 100)}**.\n\nTax: ${t}% of ${num(gross / 100)} ${approx(taxX / 100)} → **${cash2(tax / 100)}**. Net: **${cash2((gross - tax) / 100)}**.`,
    params: { kind, h1, h2, r, t },
  };
}

function verifyBudget(q, ans) {
  const p = q.params;
  const c = (v) => Math.round(Number(v) * 100);
  switch (p.kind) {
    case "change": return c(ans) + p.prices.reduce((s, v) => s + v, 0) === p.note;
    case "wage": return Number(ans) / p.h === p.r;
    case "split": return Math.abs(c(ans) * p.n * 100 - p.bill * (100 + p.tip)) <= 50 * p.n;
    case "weekly": return Math.abs(c(ans) - p.h * p.r) < 1e-6;
    case "budget-left": return Math.abs(Number(ans) + p.fixed - p.income * (1 - (p.rent + p.food) / 100)) < 0.006;
    case "save-weeks": {
      // Week by week until the savings reach the goal.
      let s = p.have, k = 0;
      while (s < p.goal) { s += p.w; k++; }
      return Number(ans) === k;
    }
    case "per-year": return Number(ans) === Math.abs(p.wk * 52 - p.mo * 12);
    case "plans": {
      let a = p.a;
      for (let g = p.inc + 1; g <= p.u; g++) a += p.x;
      return c(ans.a) === a && c(ans.b) === p.b && ans.best === (a < p.b ? "Plan A" : "Plan B");
    }
    case "payslip": {
      const g = c(ans.gross), t = c(ans.tax), n = c(ans.net);
      const gross = p.h1 * p.r + (p.h2 * p.r * 3) / 2;
      return g === gross && Math.abs(t * 100 - gross * p.t) <= 50 && n === g - t;
    }
    default: return false;
  }
}

// =====================================================================
// Currency exchange (made-up rates, always stated)
// =====================================================================
const CURRENCIES = ["pesos", "rand", "baht", "kronor", "rupees", "dirhams", "zloty", "reais", "lira", "francs"];

function genCurrency(difficulty, rng) {
  const cur = rng.pick(CURRENCIES);
  if (difficulty === "easy") {
    const d = 10 * rng.int(1, 50);
    const rate = rng.int(2, 40) + (rng.next() < 0.4 ? 0.5 : 0);
    return {
      prompt: `Use the rate **$1 = ${num(rate)} ${cur}**. How many ${cur} do you get for **$${d}**?`,
      answerType: "number", answer: d * rate, tolerance: 0,
      given: [{ label: "_dollars", value: d }, { label: "_rate", value: rate }],
      explanation: `Each dollar buys ${num(rate)} ${cur}: \`_dollars * _rate\` = ${d} × ${num(rate)} = **${num(d * rate)} ${cur}**.`,
      hints: [`Every $1 becomes ${num(rate)} ${cur}.`, `Multiply ${d} by ${num(rate)}.`],
      params: { kind: "to-foreign", d, rate },
    };
  }
  if (difficulty === "medium") {
    const kind = rng.pick(["to-dollars", "to-foreign-dec"]);
    if (kind === "to-dollars") {
      let f, rate, exact;
      do {
        rate = rng.int(150, 4000) / 100;
        f = 5 * rng.int(4, 400);
        exact = (f * 100) / rate; // cents
      } while (nearTie(exact, 0) || Number.isInteger(exact));
      return {
        prompt: `Use the rate **$1 = ${num(rate)} ${cur}**. A souvenir costs **${f} ${cur}**. How much is that in dollars?${CENTS}`,
        answerType: "number", answer: roundK(exact, 0) / 100, tolerance: 0.005,
        given: [{ label: "_price", value: f }, { label: "_rate", value: rate }],
        explanation: `Going back to dollars, divide: \`_price / _rate\` = ${f} / ${num(rate)} ${approx(exact / 100)}, which rounds to **${cash2(roundK(exact, 0) / 100)}**.`,
        hints: ["You have the foreign amount and want dollars, so divide by the rate.", "Round to the nearest cent."],
        params: { kind, f, rate },
      };
    }
    let d, rate, exact;
    do {
      d = rng.int(20, 800);
      rate = rng.int(150, 4000) / 100;
      exact = d * rate * 100;
    } while (nearTie(exact, 0) || Number.isInteger(d * rate));
    return {
      prompt: `Use the rate **$1 = ${num(rate)} ${cur}**. How many ${cur} do you get for **$${d}**? Round to 2 decimal places.`,
      answerType: "number", answer: roundK(d * rate, 2), tolerance: 0.005,
      given: [{ label: "_dollars", value: d }, { label: "_rate", value: rate }],
      explanation: `\`_dollars * _rate\` = ${d} × ${num(rate)} = ${num(d * rate)}${Number.isInteger(exact) ? "" : `, which rounds to ${roundK(d * rate, 2).toFixed(2)}`}: **${roundK(d * rate, 2).toFixed(2)} ${cur}**.`,
      hints: ["Dollars to the foreign currency: multiply by the rate.", "Round to 2 decimal places."],
      params: { kind, d, rate },
    };
  }
  if (difficulty === "hard") {
    const kind = rng.pick(["fee-pct", "fee-flat", "which-better"]);
    if (kind === "fee-pct" || kind === "fee-flat") {
      let d, rate, fee, exact;
      do {
        d = 10 * rng.int(5, 100);
        rate = rng.int(150, 4000) / 100;
        fee = kind === "fee-pct" ? rng.pick([1, 1.5, 2, 2.5, 3, 3.5, 4]) : rng.int(2, 9);
        const left = kind === "fee-pct" ? d * (1 - fee / 100) : d - fee;
        exact = left * rate;
      } while (nearTie(exact, 2));
      const feeText = kind === "fee-pct" ? `a **${num(fee)}% commission**` : `a flat fee of **$${fee}**`;
      const left = kind === "fee-pct" ? d * (1 - fee / 100) : d - fee;
      return {
        prompt: `A bureau changes **$${d}** at **$1 = ${num(rate)} ${cur}**, but first takes ${feeText} from the dollars. How many ${cur} do you get? Round to 2 decimal places.`,
        answerType: "number", answer: roundK(exact, 2), tolerance: 0.005,
        given: [{ label: "_dollars", value: d }, { label: "_rate", value: rate }, { label: "_fee", value: fee }],
        explanation: `${kind === "fee-pct" ? `Fee: ${num(fee)}% of ${d} = $${num((d * fee) / 100)}` : `Fee: $${fee}`}, leaving $${num(left)}. × ${num(rate)} ${approx(exact, 4)}` +
          (Math.abs(exact * 100 - Math.round(exact * 100)) < 1e-6 ? ` = **${roundK(exact, 2).toFixed(2)} ${cur}**.` : `, which rounds to **${roundK(exact, 2).toFixed(2)} ${cur}**.`),
        hints: ["Take the fee off the dollars first.", `Change what is left at ${num(rate)} ${cur} per dollar, then round.`],
        params: { kind, d, rate, fee },
      };
    }
    let d, r1, r2, fee, gA, gB;
    do {
      d = 50 * rng.int(2, 20);
      r1 = rng.int(500, 4000) / 100;
      fee = rng.int(3, 15);
      r2 = Math.round(r1 * (0.93 + 0.06 * rng.next()) * 100) / 100;
      gA = (d - fee) * r1;
      gB = d * r2;
    } while (Math.abs(gA - gB) / Math.max(gA, gB) < 0.01 || r2 >= r1);
    const ans = gA > gB ? "Bureau A" : "Bureau B";
    return {
      prompt: `You want to change **$${d}** into ${cur}.\n\n- **Bureau A:** $1 = ${num(r1)} ${cur}, minus a **$${fee}** fee taken from your dollars first.\n- **Bureau B:** $1 = ${num(r2)} ${cur}, no fee.\n\nWhich gives you more ${cur}?`,
      answerType: "choice", answer: ans, choices: ["Bureau A", "Bureau B"],
      given: [{ label: "_dollars", value: d }, { label: "_rate_a", value: r1 }, { label: "_fee", value: fee }, { label: "_rate_b", value: r2 }],
      explanation: `A: (${d} − ${fee}) × ${num(r1)} = ${num(gA)} ${cur}. B: ${d} × ${num(r2)} = ${num(gB)} ${cur}. **${ans}** gives more.`,
      hints: ["Work out how many you'd get from each bureau.", "For A, take off the fee before multiplying by the rate."],
      params: { kind, d, r1, r2, fee },
    };
  }
  // expert
  const kind = rng.pick(["trip", "abroad-price"]);
  if (kind === "trip") {
    let d, r1, c, spend, r2, recv, recvR, left, backX;
    do {
      d = 50 * rng.int(4, 40);
      r1 = rng.int(500, 4000) / 100;
      c = rng.pick([1, 1.5, 2, 2.5, 3]);
      recv = d * (1 - c / 100) * r1;
      recvR = roundK(recv, 2);
      spend = Math.round(recvR * (0.5 + 0.4 * rng.next()));
      left = roundK(recvR - spend, 2);
      r2 = Math.round(r1 * (1.04 + 0.06 * rng.next()) * 100) / 100;
      backX = left / r2;
    } while (nearTie(recv, 2) || nearTie(backX, 2) || Math.abs(recv * 100 - Math.round(recv * 100)) < 1e-6 || left <= 0);
    return {
      prompt: `Before a trip you change **$${d}** at **$1 = ${num(r1)} ${cur}**, with a **${num(c)}% commission** taken from the dollars. On the trip you spend **${spend} ${cur}**. When you get home, the bank buys your leftover ${cur} back at **$1 = ${num(r2)} ${cur}** (no fee).`,
      answerType: "multi",
      given: [{ label: "_dollars", value: d }, { label: "_rate_out", value: r1 }, { label: "_fee", value: c }, { label: "_spent", value: spend }, { label: "_rate_back", value: r2 }],
      parts: [
        { id: "recv", label: "Received", ask: `How many ${cur} did you get? Round to 2 decimal places.`, answerType: "number", answer: recvR, tolerance: 0.005, hint: `Take the ${num(c)}% off the dollars, then multiply by ${num(r1)}.` },
        { id: "left", label: "Left", ask: `How many ${cur} are left after the trip (from your rounded amount)?`, answerType: "number", answer: left, tolerance: 0.005, hint: "Subtract what you spent." },
        { id: "back", label: "Back", ask: "How many dollars do you get back? Nearest cent.", answerType: "number", answer: roundK(backX, 2), tolerance: 0.005, hint: `Back to dollars: divide by ${num(r2)}.` },
      ],
      explanation: `After commission: ${d} × ${num(1 - c / 100)} = $${num(d * (1 - c / 100))}; × ${num(r1)} ${approx(recv)} → **${recvR.toFixed(2)} ${cur}**.\n\nLeft: ${recvR.toFixed(2)} − ${spend} = **${left.toFixed(2)} ${cur}**.\n\nBack: ${left.toFixed(2)} / ${num(r2)} ${approx(backX)} → **${cash2(roundK(backX, 2))}**.`,
      params: { kind, d, r1, c, spend, r2 },
    };
  }
  let home, f, rate, inD;
  do {
    rate = rng.int(500, 15000) / 100;
    home = rng.int(1500, 20000);
    f = Math.round(((home / 100) * rate * (0.8 + 0.4 * rng.next())) / 5) * 5;
    inD = (f * 100) / rate;
  } while (nearTie(inD, 0) || Math.abs(roundK(inD, 0) - home) < 20);
  const abroad = roundK(inD, 0);
  const ans = abroad < home ? "Abroad" : "At home";
  const item = rng.pick(GOODS);
  return {
    prompt: `${item[0].toUpperCase() + item.slice(1)} costs **${f} ${cur}** abroad and **${cash(home / 100)}** at home. The rate is **$1 = ${num(rate)} ${cur}**.`,
    answerType: "multi",
    given: [{ label: "_abroad", value: f }, { label: "_rate", value: rate }, { label: "_home", value: home / 100 }],
    parts: [
      { id: "usd", label: "In $", ask: "The price abroad in dollars, to the nearest cent", answerType: "number", answer: abroad / 100, tolerance: 0.005, hint: `Divide the ${cur} price by ${num(rate)}.` },
      { id: "where", label: "Cheaper", ask: "Where is it cheaper?", answerType: "choice", answer: ans, choices: ["Abroad", "At home"], hint: "Compare the dollar prices." },
      { id: "diff", label: "Saving", ask: "By how many dollars (using your rounded price)?", answerType: "number", answer: Math.abs(home - abroad) / 100, tolerance: 0.005, hint: "Bigger dollar price minus smaller." },
    ],
    explanation: `${f} / ${num(rate)} ${approx(inD / 100)} → **${cash2(abroad / 100)}**. That is ${abroad < home ? "less" : "more"} than ${cash(home / 100)}, so it is cheaper **${ans.toLowerCase()}**, by **${cash2(Math.abs(home - abroad) / 100)}**.`,
    params: { kind, f, rate, home },
  };
}

function verifyCurrency(q, ans) {
  const p = q.params;
  const x = Number(ans);
  switch (p.kind) {
    case "to-foreign": return Math.abs(x / p.rate - p.d) < 1e-9;
    case "to-dollars": return Math.abs(x * p.rate - p.f) <= 0.005 * p.rate + 1e-9;
    case "to-foreign-dec": return Math.abs(x / p.rate - p.d) <= 0.005 / p.rate + 1e-9;
    case "fee-pct": case "fee-flat": {
      // Back from the foreign amount to dollars, then add the fee back.
      const usd = x / p.rate;
      const before = p.kind === "fee-pct" ? usd / (1 - p.fee / 100) : usd + p.fee;
      const sens = p.kind === "fee-pct" ? p.rate * (1 - p.fee / 100) : p.rate;
      return Math.abs(before - p.d) <= 0.005 / sens + 1e-9;
    }
    case "which-better": {
      const a = (p.d - p.fee) * p.r1, b = p.d * p.r2;
      return ans === (a > b ? "Bureau A" : "Bureau B");
    }
    case "trip": {
      const r = Number(ans.recv), l = Number(ans.left), b = Number(ans.back);
      const okR = Math.abs(r / p.r1 / (1 - p.c / 100) - p.d) <= 0.005 / (p.r1 * (1 - p.c / 100)) + 1e-9;
      const okL = Math.abs(l + p.spend - r) < 1e-6;
      const okB = Math.abs(b * p.r2 - l) <= 0.005 * p.r2 + 1e-9;
      return okR && okL && okB;
    }
    case "abroad-price": {
      const usd = Math.round(Number(ans.usd) * 100);
      if (Math.abs(usd * p.rate - p.f * 100) > 0.5 * p.rate + 1e-9) return false;
      return ans.where === (usd < p.home ? "Abroad" : "At home") && Math.round(Number(ans.diff) * 100) === Math.abs(p.home - usd);
    }
    default: return false;
  }
}

// =====================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard", "expert"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const make = { "unit-price": genUnit, discounts: genDiscount, budgets: genBudget, currency: genCurrency }[subtopic];
  if (!make) throw new Error(`Unknown subtopic: ${subtopic}`);
  const q = make(difficulty, rng);
  q.params.sub = subtopic;
  return q;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || answer === undefined || answer === null || answer === "") return false;
  if (question.answerType === "choice" && !question.choices.includes(String(answer))) return false;
  if (question.answerType === "multi") {
    if (typeof answer !== "object") return false;
    for (const part of question.parts) if (part.answerType === "choice" && !part.choices.includes(String(answer[part.id]))) return false;
  }
  try {
    if (p.sub === "unit-price") return verifyUnit(question, answer);
    if (p.sub === "discounts") return verifyDiscount(question, answer);
    if (p.sub === "budgets") return verifyBudget(question, answer);
    if (p.sub === "currency") return verifyCurrency(question, answer);
    return false;
  } catch {
    return false;
  }
}
