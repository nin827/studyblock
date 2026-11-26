// Marketing generator. Uses only the seeded rng passed in by the engine.
// Subtopics: marketing-mix, ansoff, boston, life-cycle, pricing, segmentation. Standard textbook
// frameworks only (4Ps, Ansoff matrix, Boston matrix, product life cycle, pricing strategies,
// segmentation bases), with fictional firms and made-up numbers.
//
// Options that combine two or more facts are segmented choices: `choiceCols` names the columns
// and each choice is an array with one segment per column. Distractors differ from the answer in
// one or two segments, never all of them.
//
// params.kind tells verify() how to recheck. Classification answers are rechecked by looking the
// stated item up in the grouped fact banks (so an item filed under two groups fails), and the
// rule-based ones (Ansoff, Boston, life cycle) are recomputed from the stated conditions.
// All rng draws happen before any hint or explanation text is built.

// ---------------------------------------------------------------------------------------------
// Shared helpers

const SEP = " | ";
const segsOf = (c) => (Array.isArray(c) ? c.map(String) : String(c).split(SEP));
const keyOf = (c) => segsOf(c).join(SEP);

const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const cash = (n) => (Number.isInteger(n) ? fmt(n) : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money = (n) => (n < 0 ? `−$${cash(-n)}` : `$${cash(n)}`);
const round1 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 10 + 1e-9) / 10;
const round2 = (n) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;
const signed = (n) => (n > 0 ? `+${fmt(n)}%` : n < 0 ? `−${fmt(-n)}%` : "0%");
// A 2-decimal answer must not sit on a half-cent step.
const safe2 = (v) => Math.abs((Math.abs(v * 100) % 1) - 0.5) > 1e-4;
const growTxt = (g) => (g > 0 ? `growing at ${g}% a year` : g < 0 ? `shrinking by ${-g}% a year` : "not growing at all");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

// The answer plus up to n − 1 distractors, each differing from it in 1–2 segments (never all).
// `prefer` candidates are tried first (the likeliest mistakes), then random single/double swaps.
function segChoices(rng, answer, opts, prefer = [], n = 4) {
  const cols = answer.length;
  const seen = new Set([answer.join(SEP)]);
  const out = [answer];
  const add = (c) => {
    if (out.length >= n) return;
    const d = c.filter((v, i) => v !== answer[i]).length;
    if (d < 1 || d >= cols || d > 2) return;
    const k = c.join(SEP);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  prefer.forEach(add);
  for (let g = 0; out.length < n && g < 400; g++) {
    const k = cols > 2 && rng.next() < 0.5 ? 2 : 1;
    const idx = rng.shuffle([...Array(cols).keys()]).slice(0, k);
    const c = answer.slice();
    for (const i of idx) {
      const alt = opts[i].filter((v) => v !== answer[i]);
      if (alt.length) c[i] = rng.pick(alt);
    }
    add(c);
  }
  return rng.shuffle(out);
}

// The answer plus n − 1 other names from the pool.
function plainChoices(rng, answer, pool, n = 4) {
  const others = rng.shuffle(pool.filter((x) => x !== answer)).slice(0, n - 1);
  return rng.shuffle([answer, ...others]);
}

// A segmented choice question: 3 options at Easy, 5 above. `opts[i]` lists the values random
// distractors may use in column i; `decoys[i]` adds Build-mode decoy blocks for column i (never
// the answer's value, so no other combination of blocks is correct). params.diff lets verify()
// check the counts.
const optionCount = (diff) => (diff === "easy" ? 3 : 5);
function segQ(rng, diff, prompt, cols, answer, opts, prefer, decoys, rest) {
  const choices = segChoices(rng, answer, opts, prefer, optionCount(diff));
  const extraSegs = [];
  cols.forEach((c, i) => {
    for (const v of new Set([...(opts[i] || []), ...((decoys && decoys[i]) || [])])) if (v !== answer[i]) extraSegs.push([c, v]);
  });
  return {
    prompt, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, ...rest,
    params: { ...rest.params, diff },
  };
}
const plain = (prompt, answer, choices, rest) => ({ prompt, answerType: "choice", choices, answer, ...rest });

// Which group of a { group: [items] } bank lists this item? null unless exactly one does.
function groupOf(bank, item) {
  const hits = Object.keys(bank).filter((g) => bank[g].includes(item));
  return hits.length === 1 ? hits[0] : null;
}

function checkDifficulty(d, allowed) {
  if (!allowed.includes(d)) throw new Error(`Unknown difficulty: ${d}`);
}

// ---------------------------------------------------------------------------------------------
// Marketing mix (4Ps)

const PS = ["Product", "Price", "Place", "Promotion"];

const FOOD_FIRMS = [
  { firm: "Crunchy Co", item: "crisps" }, { firm: "Sunny Dairy", item: "yoghurts" },
  { firm: "Bean There", item: "coffee pods" }, { firm: "Golden Oats", item: "breakfast cereals" },
  { firm: "Fizz Lab", item: "soft drinks" }, { firm: "Choco Loco", item: "chocolate bars" },
];
const GOODS_FIRMS = [
  { firm: "SoundWave", item: "wireless headphones" }, { firm: "Zoomer", item: "electric scooters" },
  { firm: "TickTech", item: "smartwatches" }, { firm: "Boomly", item: "bluetooth speakers" },
  { firm: "BrightSmile", item: "electric toothbrushes" }, { firm: "TrailCam", item: "action cameras" },
];

// Templates by P; a leading "f:" or "g:" limits a template to food or goods firms.
const MIX = {
  Product: [
    "f:adds a sugar-free version of its {item}", "f:adds two new flavours to its {item} range",
    "f:changes the recipe of its {item} to make them vegan", "redesigns the packaging of its {item}",
    "g:extends the warranty on its {item} to three years", "g:gives its {item} a longer-lasting battery",
    "g:launches a waterproof model of its {item}",
  ],
  Price: [
    "raises the price of its {item} by 5%", "cuts the price of its {item} to match its main rival",
    "sets the prices of its {item} to end in .99", "g:lets customers pay for its {item} in 12 monthly instalments",
    "sets the price of its {item} at unit cost plus a 40% markup",
  ],
  Place: [
    "starts selling its {item} through its own website", "f:gets its {item} stocked by a national supermarket chain",
    "g:gets its {item} stocked by a large electronics retailer", "uses a wholesaler to supply its {item} to small shops",
    "opens a pop-up shop for its {item} at a railway station", "offers next-day home delivery of its {item}",
    "moves its warehouse for {item} closer to its customers",
  ],
  Promotion: [
    "runs TV adverts for its {item}", "pays a social media influencer to review its {item}",
    "sponsors a local football team to raise awareness of its {item}", "f:gives away free samples of its {item} in shopping centres",
    "puts up billboard posters for its {item}", "sends an email newsletter about its {item} to past customers",
    "g:shows its {item} at a technology trade fair",
  ],
};
// Harder items (Hard only): textbook calls that people often get wrong.
const MIX_HARD = {
  Product: ["adds an after-sales repair service for its {item}", "gives its {item} a new brand name"],
  Price: ["offers a lower price on its {item} to customers who buy in bulk"],
  Place: ["sells its {item} through vending machines in train stations"],
  Promotion: ["runs a two-week 'buy one, get one free' offer on its {item}", "puts its logo on the shirts of a cycling team"],
};

const fitsFirm = (t, food) => !(t.startsWith("f:") && !food) && !(t.startsWith("g:") && food);
const stripTag = (t) => t.replace(/^[fg]:/, "");

function genMix(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard"]);
  const food = rng.next() < 0.5;
  const f = rng.pick(food ? FOOD_FIRMS : GOODS_FIRMS);
  const n = diff === "easy" ? 1 : diff === "medium" ? 2 : 3;
  const banks = diff === "hard" ? [MIX, MIX_HARD] : [MIX];
  const all = [];
  for (const b of banks) for (const P of PS) for (const t of b[P]) if (fitsFirm(t, food)) all.push({ P, t });
  const picked = rng.shuffle(all).slice(0, n);
  const choices = n === 1 ? rng.shuffle(PS.slice()) : null;

  const items = picked.map((x) => fill(stripTag(x.t), f));
  const params = { kind: "mix", templates: picked.map((x) => x.t), hard: diff === "hard" };
  const hints = [
    "Product is what is sold (features, design, packaging, brand, after-sales). Price is what customers pay and how. Place is how it reaches them (shops, online, distribution). Promotion is how they hear about it (adverts, sponsorship, sales offers).",
    "Ask what the decision changes: the thing itself, what it costs, where it is sold, or how it is communicated.",
  ];
  const why = (x, i) =>
    `- ${n > 1 ? `Decision ${i + 1}: ` : ""}${cap(fill(stripTag(x.t), f))}: **${x.P}**. ${MIX_WHY[x.P]}`;
  const explanation = `In the marketing mix (the 4Ps):\n\n${picked.map(why).join("\n")}`;
  if (n === 1) {
    return plain(
      `**${f.firm}** ${items[0]}. In the marketing mix (the 4Ps), which P is this decision about?`,
      picked[0].P, choices, { explanation, hints, params });
  }
  const list = items.map((s, i) => `${i + 1}. ${cap(s)}.`).join("\n");
  return segQ(rng, diff,
    `**${f.firm}** plans these decisions:\n\n${list}\n\nIn the marketing mix (the 4Ps), which P is each decision about?`,
    items.map((_, i) => `Decision ${i + 1}`), picked.map((x) => x.P), picked.map(() => PS), [], null, { explanation, hints, params });
}

const MIX_WHY = {
  Product: "It changes the item itself or what comes with it.",
  Price: "It changes what customers pay or how they pay.",
  Place: "It changes where and how customers can get the item.",
  Promotion: "It is about telling or persuading customers to buy.",
};

// ---------------------------------------------------------------------------------------------
// Ansoff matrix

const ANSOFF = ["Market penetration", "Product development", "Market development", "Diversification"];
const ansoffOf = (prodNew, mktNew) => (prodNew ? (mktNew ? "Diversification" : "Product development") : mktNew ? "Market development" : "Market penetration");
const RISK = { "Market penetration": 1, "Product development": 2, "Market development": 2, Diversification: 3 };

const ANSOFF_FIRMS = [
  { firm: "Riverside Bakery", prod: "sourdough bread", mkt: "shoppers in its home town", newProd: "a range of birthday cakes", newMkt: "hotels in other cities" },
  { firm: "Peak Outdoor", prod: "hiking boots", mkt: "walkers in its home country", newProd: "a line of tents", newMkt: "customers in Japan" },
  { firm: "Nova Phones", prod: "budget smartphones", mkt: "students in its home country", newProd: "smartwatches", newMkt: "business customers abroad" },
  { firm: "Bloom Skincare", prod: "face creams", mkt: "women aged 30 to 50", newProd: "a range of sun creams", newMkt: "teenagers" },
  { firm: "FreshBox", prod: "weekly meal kits", mkt: "families in large cities", newProd: "ready-made baby food", newMkt: "office canteens" },
  { firm: "Spark Bikes", prod: "electric bikes", mkt: "commuters in Europe", newProd: "electric scooters", newMkt: "delivery companies" },
  { firm: "Harbour Coffee", prod: "coffee beans", mkt: "cafés in its region", newProd: "coffee machines", newMkt: "supermarket shoppers abroad" },
  { firm: "PixelPlay", prod: "puzzle games for phones", mkt: "adult players", newProd: "a handheld games console", newMkt: "primary schools" },
];

const ANSOFF_PLANS = {
  "Market penetration": [
    "runs a loyalty card scheme to sell more {prod} to {mkt}",
    "cuts the price of its {prod} to win customers from rivals among {mkt}",
    "doubles its advertising of {prod} aimed at {mkt}",
  ],
  "Product development": [
    "launches {newProd} for {mkt}",
    "develops {newProd} to sell to {mkt}",
  ],
  "Market development": [
    "starts selling its existing {prod} to {newMkt}",
    "takes its existing {prod} to a new market: {newMkt}",
  ],
  Diversification: [
    "launches {newProd} aimed at {newMkt}",
    "develops {newProd} to sell to a new market: {newMkt}",
  ],
};
// Product and market newness for each plan, written separately from the matrix itself.
const PLAN_NEWNESS = {
  "Market penetration": { prodNew: false, mktNew: false },
  "Product development": { prodNew: true, mktNew: false },
  "Market development": { prodNew: false, mktNew: true },
  Diversification: { prodNew: true, mktNew: true },
};

const ANSOFF_HINTS = [
  "The Ansoff matrix asks two questions: is the product existing or new, and is the market (the customers) existing or new?",
  "Existing product + existing market = market penetration; new product + existing market = product development; existing product + new market = market development; new product + new market = diversification.",
];

function ansoffExplain(f, plan, strat) {
  const nw = PLAN_NEWNESS[strat];
  return `${cap(fill(plan, f))}: the product is **${nw.prodNew ? "new" : "existing"}** (${f.firm} already sells ${f.prod}) and the market is **${nw.mktNew ? "new" : "existing"}** (its customers are ${f.mkt}), so it is **${strat}**.`;
}

function genAnsoff(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard"]);
  const f = rng.pick(ANSOFF_FIRMS);
  const intro = `**${f.firm}** sells ${f.prod} to ${f.mkt}.`;
  if (diff !== "hard") {
    const strat = rng.pick(ANSOFF);
    const plan = rng.pick(ANSOFF_PLANS[strat]);
    const params = { kind: "ansoff", firm: f.firm, plans: [plan], strats: [strat], seg: diff === "medium" };
    const explanation = ansoffExplain(f, plan, strat);
    if (diff === "easy") {
      return plain(`${intro} Next year it ${fill(plan, f)}. Using the Ansoff matrix, which growth strategy is this?`,
        strat, rng.shuffle(ANSOFF.slice()), { explanation, hints: ANSOFF_HINTS, params });
    }
    const nw = PLAN_NEWNESS[strat];
    const ans = [nw.prodNew ? "New" : "Existing", nw.mktNew ? "New" : "Existing", strat];
    const flip = (v) => (v === "New" ? "Existing" : "New");
    const prefer = [
      [flip(ans[0]), ans[1], ansoffOf(!nw.prodNew, nw.mktNew)],
      [ans[0], flip(ans[1]), ansoffOf(nw.prodNew, !nw.mktNew)],
      [ans[0], ans[1], ansoffOf(!nw.prodNew, !nw.mktNew)],
    ];
    return segQ(rng, diff, `${intro} Next year it ${fill(plan, f)}. Using the Ansoff matrix, is the product new, is the market new, and which growth strategy is this?`,
      ["Product", "Market", "Strategy"], ans, [["Existing", "New"], ["Existing", "New"], ANSOFF], rng.shuffle(prefer), null, { explanation, hints: ANSOFF_HINTS, params });
  }
  // Hard: two plans with different risk; which is riskier?
  let s1, s2;
  do { s1 = rng.pick(ANSOFF); s2 = rng.pick(ANSOFF); } while (RISK[s1] === RISK[s2]);
  const p1 = rng.pick(ANSOFF_PLANS[s1]), p2 = rng.pick(ANSOFF_PLANS[s2]);
  const ans = [s1, s2, RISK[s1] > RISK[s2] ? "Plan A" : "Plan B"];
  const params = { kind: "ansoff", firm: f.firm, plans: [p1, p2], strats: [s1, s2] };
  return segQ(rng, diff,
    `${intro} It is choosing between two plans:\n\n- **Plan A:** it ${fill(p1, f)}.\n- **Plan B:** it ${fill(p2, f)}.\n\nUsing the Ansoff matrix, name each plan's strategy and say which plan carries more risk.`,
    ["Plan A", "Plan B", "Riskier plan"], ans, [ANSOFF, ANSOFF, ["Plan A", "Plan B"]], [[s1, s2, ans[2] === "Plan A" ? "Plan B" : "Plan A"]], null,
    {
      explanation:
        `- Plan A: ${ansoffExplain(f, p1, s1)}\n- Plan B: ${ansoffExplain(f, p2, s2)}\n\n` +
        `Risk rises the further a firm moves from what it knows: market penetration is the safest, product and market development are in the middle, and diversification is the riskiest. So **${ans[2]}** is riskier.`,
      hints: [...ANSOFF_HINTS, "Risk grows with each new thing: one new dimension (product or market) is riskier than none, and two is the riskiest."],
      params,
    });
}

// ---------------------------------------------------------------------------------------------
// Boston matrix

const BCG = ["Star", "Cash cow", "Question mark", "Dog"];
const BCG_GROWTH = 10; // high growth: above 10% a year
const BCG_SHARE = 1; // high relative share: above 1
const bcgOf = (highGrowth, highShare) => (highGrowth ? (highShare ? "Star" : "Question mark") : highShare ? "Cash cow" : "Dog");
const BCG_RULE = "Use the Boston matrix with high market growth meaning above 10% a year and high relative market share meaning above 1.";
const BCG_HINTS = [
  "Relative market share = the product's share (or sales) ÷ the largest rival's share (or sales). Above 1 means it leads the market.",
  "High growth + high share = Star; low growth + high share = Cash cow; high growth + low share = Question mark; low growth + low share = Dog.",
];
const PRODUCTS = ["the Zest energy drink", "the Orbit smartwatch", "the Cosy slipper range", "the Tempo fitness app", "the Breeze desk fan", "the Pebble phone case", "the Nimbus pillow", "the Spark cola", "the Echo speaker", "the Trail running shoe"];

// Market sizes ($m) and sales ($m) that give exact 1-dp growth and 2-dp relative share.
function bcgNumbers(rng, highG, highS) {
  for (;;) {
    const A = rng.pick([200, 250, 500]);
    const delta = highG ? rng.int(Math.ceil(0.12 * A), Math.floor(0.3 * A)) : rng.int(-Math.floor(0.05 * A), Math.floor(0.08 * A));
    const B = A + delta;
    const R = rng.pick([20, 25, 50, 100]);
    const S = highS ? rng.int(Math.ceil(1.15 * R), Math.floor(3 * R)) : rng.int(Math.ceil(0.15 * R), Math.floor(0.85 * R));
    if (S + R <= 0.8 * B) return { A, B, S, R };
  }
}

function genBoston(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard", "expert"]);
  const prod = rng.pick(PRODUCTS);
  if (diff === "easy") {
    const highG = rng.next() < 0.5, highS = rng.next() < 0.5;
    const g = highG ? rng.int(12, 28) : rng.int(-4, 8);
    const r10 = highS ? rng.int(12, 30) : rng.int(2, 8); // relative share × 10
    const cat = bcgOf(highG, highS);
    return plain(
      `The market for ${prod} is ${growTxt(g)}, and its relative market share is ${fmt(r10 / 10)}. ${BCG_RULE} Which category is it?`,
      cat, rng.shuffle(BCG.slice()),
      {
        explanation: `Growth of ${g}% is ${highG ? "above" : "not above"} 10%, so growth is **${highG ? "high" : "low"}**. A relative share of ${fmt(r10 / 10)} is ${highS ? "above" : "below"} 1, so share is **${highS ? "high" : "low"}**. That makes it a **${cat}**.`,
        hints: BCG_HINTS, params: { kind: "bcgEasy", g, r10 },
      });
  }
  if (diff === "medium") {
    const highG = rng.next() < 0.5, highS = rng.next() < 0.5;
    const g = highG ? rng.int(12, 28) : rng.int(-4, 8);
    let s, t;
    do {
      s = rng.int(4, 45); t = rng.int(4, 45);
    } while (s + t > 85 || (highS ? s < 1.15 * t : s > 0.85 * t));
    const hs = s > t;
    const ans = [highG ? "High" : "Low", hs ? "High" : "Low", bcgOf(highG, hs)];
    const flip = (v) => (v === "High" ? "Low" : "High");
    const prefer = [
      [ans[0], flip(ans[1]), bcgOf(highG, !hs)],
      [flip(ans[0]), ans[1], bcgOf(!highG, hs)],
      [ans[0], ans[1], bcgOf(!highG, !hs)],
    ];
    const rival = hs ? "the next-biggest brand" : "the market leader";
    return segQ(rng, diff,
      `The market for ${prod} is ${growTxt(g)}. ${cap(prod)} has a ${s}% share of the market, and ${rival} has ${t}%. ${BCG_RULE} Classify its growth, its relative share and its category.`,
      ["Market growth", "Relative share", "Category"], ans, [["High", "Low"], ["High", "Low"], BCG], rng.shuffle(prefer), null,
      {
        explanation: `- Growth: ${g}% is ${highG ? "above" : "not above"} 10%, so **${ans[0].toLowerCase()}**.\n- Relative share = ${s} ÷ ${t} ≈ ${fmt(round2(s / t))}, ${hs ? "above" : "below"} 1, so **${ans[1].toLowerCase()}**.\n- ${ans[0]} growth and ${ans[1].toLowerCase()} share make it a **${ans[2]}**.`,
        hints: BCG_HINTS, params: { kind: "bcgMed", g, s, t },
      });
  }
  if (diff === "hard") {
    const highG = rng.next() < 0.5, highS = rng.next() < 0.5;
    const { A, B, S, R } = bcgNumbers(rng, highG, highS);
    const g = round1(((B - A) / A) * 100), r = round2(S / R);
    const gWrong = round1(((B - A) / B) * 100), rWrong = round2(R / S);
    const ans = [signed(g), fmt(r), bcgOf(g > BCG_GROWTH, r > BCG_SHARE)];
    const prefer = [
      [signed(gWrong), fmt(r), bcgOf(gWrong > BCG_GROWTH, r > BCG_SHARE)],
      [signed(g), fmt(rWrong), bcgOf(g > BCG_GROWTH, rWrong > BCG_SHARE)],
      [signed(g), fmt(r), bcgOf(!(g > BCG_GROWTH), r > BCG_SHARE)],
      [signed(g), fmt(r), bcgOf(g > BCG_GROWTH, !(r > BCG_SHARE))],
      [signed(gWrong), fmt(rWrong), ans[2]],
    ];
    const gDecoys = [gWrong, round1((B / A) * 100), round1(((B - A) / A) * 10)].map(signed);
    const rDecoys = [rWrong, round2(S / (S + R)), round2((S - R) / R)].filter((x) => x > 0).map(fmt);
    return segQ(rng, diff,
      `The market for ${prod} was worth $${A} million last year and $${B} million this year. ${cap(prod)} sold $${S} million this year; its largest rival sold $${R} million. ${BCG_RULE} Work out the market growth (to 1 decimal place), the relative market share (to 2 decimal places) and the category.`,
      ["Market growth", "Relative share", "Category"], ans, [[signed(gWrong)], [fmt(rWrong)], BCG], rng.shuffle(prefer), [gDecoys, rDecoys, []],
      {
        explanation:
          `- Market growth = (${B} − ${A}) ÷ ${A} × 100 = **${signed(g)}**, so growth is ${g > BCG_GROWTH ? "high" : "low"}.\n` +
          `- Relative share = ${S} ÷ ${R} = **${fmt(r)}**, so share is ${r > BCG_SHARE ? "high" : "low"}.\n- So it is a **${ans[2]}**.`,
        hints: [
          "Growth % = (this year − last year) ÷ last year × 100. Divide by last year's size, not this year's.",
          "Relative share = your sales ÷ the largest rival's sales (yours on top).",
          BCG_HINTS[1],
        ],
        given: [{ label: "_last", value: A }, { label: "_now", value: B }, { label: "_sales", value: S }, { label: "_rival", value: R }],
        params: { kind: "bcgHard", A, B, S, R },
      });
  }
  // Expert: a portfolio of three products, each needing growth and relative share worked out.
  const prods = rng.shuffle(PRODUCTS.slice()).slice(0, 3);
  const cats = [];
  const data = prods.map(() => {
    const highG = rng.next() < 0.5, highS = rng.next() < 0.5;
    cats.push(bcgOf(highG, highS));
    return bcgNumbers(rng, highG, highS);
  });
  const ans = cats;
  const labels = ["A", "B", "C"];
  const rows = data.map((d, i) => `| ${labels[i]}: ${prods[i]} | $${d.A}m | $${d.B}m | $${d.S}m | $${d.R}m |`).join("\n");
  return segQ(rng, diff,
    `A firm's portfolio has three products. Market sizes and this year's sales:\n\n| Product | Market last year | Market this year | Its sales | Largest rival's sales |\n| --- | --- | --- | --- | --- |\n${rows}\n\n${BCG_RULE} Place each product in the matrix.`,
    ["Product A", "Product B", "Product C"], ans, [BCG, BCG, BCG], [], null,
    {
      explanation: data.map((d, i) => {
        const g = ((d.B - d.A) / d.A) * 100, r = d.S / d.R;
        return `- **${labels[i]}:** growth = (${d.B} − ${d.A}) ÷ ${d.A} × 100 = ${signed(round1(g))}; relative share = ${d.S} ÷ ${d.R} = ${fmt(round2(r))}. **${ans[i]}**.`;
      }).join("\n") + "\n\nA typical plan uses the cash cows' cash to build question marks and hold stars, and divests dogs.",
      hints: [
        "Work through one product at a time: market growth first, then relative share.",
        "Growth % = (this year − last year) ÷ last year × 100. Relative share = its sales ÷ the largest rival's sales.",
        BCG_HINTS[1],
      ],
      params: { kind: "bcgExpert", data },
    });
}

// ---------------------------------------------------------------------------------------------
// Product life cycle

const PLC = ["Introduction", "Growth", "Maturity", "Decline"];
const PLC_DESC = {
  Introduction: [
    "{P} has just been launched. Sales are low, few shops stock it, and it is making a loss because of heavy launch advertising.",
    "{P} went on sale two months ago. Only a few early buyers have tried it, and its development costs have not yet been covered.",
    "{P} is brand new. Most customers have never heard of it, and the firm is spending heavily to make them aware of it.",
  ],
  Growth: [
    "Sales of {P} are rising quickly, more shops want to stock it, and it has just started to make a profit.",
    "Word of mouth about {P} is spreading: sales doubled this year, rivals are starting to copy it, and profits are rising.",
    "Demand for {P} is climbing fast as more people learn about it, and the firm is adding new stockists every month.",
  ],
  Maturity: [
    "{P} has been on sale for years. Sales have stopped growing, most likely buyers already have it, and profits are at their highest.",
    "Sales of {P} are high but flat, and the market is crowded with similar products competing on price.",
    "{P} is a household name with steady sales; the firm now spends mainly on reminder advertising to keep its customers.",
  ],
  Decline: [
    "Sales of {P} have fallen for three years in a row as customers switch to newer products, and profits are shrinking.",
    "Fewer shops stock {P} each year, sales keep falling, and the firm has cut its advertising budget.",
    "{P} is being overtaken by newer technology; sales and profits are falling and the firm is thinking of withdrawing it.",
  ],
};
const PLC_FOCUS = {
  Introduction: "Informative advertising",
  Growth: "Widen distribution",
  Maturity: "Extension strategy",
  Decline: "Cut support or withdraw",
};
const PLC_RULE = "Use these rules: **Introduction** = sales rising but a loss; **Growth** = sales up 15% or more with a profit; **Maturity** = sales within 5% of last year with a profit; **Decline** = sales down 5% or more.";
const PLC_HINTS = [
  "Work out the % change in sales from last year to this year: (this year − last year) ÷ last year × 100.",
  "Then check profit: a loss with rising sales is Introduction. With a profit, the size of the change decides between Growth, Maturity and Decline.",
];

// Stage from last year's and this year's sales plus this year's profit (independent rule).
function plcOf(L, T, profit) {
  const ch = ((T - L) * 100) / L;
  if (ch <= -5) return "Decline";
  if (profit < 0) return ch > 0 ? "Introduction" : null;
  if (ch >= 15) return "Growth";
  if (Math.abs(ch) < 5) return "Maturity";
  return null;
}

// Sales (units) for a stage: L from a list that keeps the % change exact to 1 dp.
function plcNumbers(rng, stage) {
  const L = rng.pick([20000, 25000, 50000, 100000]);
  const pct = stage === "Introduction" ? rng.int(20, 120) : stage === "Growth" ? rng.int(16, 60) : stage === "Maturity" ? rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]) : -rng.int(6, 35);
  const T = L + Math.round((L * pct) / 100 / 100) * 100 + rng.pick([-100, 0, 100]) * (stage === "Maturity" ? 0 : 1);
  const profit = stage === "Introduction" ? -rng.int(5, 80) * 1000 : stage === "Decline" ? rng.int(-20, 60) * 1000 : rng.int(10, 200) * 1000;
  return { L, T, profit: profit === 0 ? 5000 : profit };
}

const profitTxt = (p) => (p < 0 ? `a loss of $${fmt(-p)}` : `a profit of $${fmt(p)}`);

function genPLC(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard", "expert"]);
  const prod = rng.pick(PRODUCTS);
  const stage = rng.pick(PLC);
  if (diff === "easy") {
    const d = rng.pick(PLC_DESC[stage]);
    return plain(`${cap(fill(d, { P: prod }))} Which stage of the product life cycle is it in?`, stage, rng.shuffle(PLC.slice()),
      {
        explanation: `${PLC_EXPLAIN[stage]} So it is in **${stage}**.`,
        hints: ["Look at the sales trend (low, rising fast, flat or falling) and at profit (a loss, rising, highest or shrinking).", "Introduction: low sales and a loss. Growth: fast-rising sales and profit. Maturity: high, flat sales. Decline: falling sales and profit."],
        params: { kind: "plcEasy", desc: d },
      });
  }
  const { L, T, profit } = plcNumbers(rng, stage);
  const ch = round1(((T - L) / L) * 100);
  const chWrong = round1(((T - L) / T) * 100);
  const chDecoys = [chWrong, round1((T / L) * 100), -ch, round1((T - L) / 1000), round1(ch * 10)].map(signed);
  const data = `Last year ${prod} sold ${fmt(L)} units; this year it sold ${fmt(T)} units and made ${profitTxt(profit)}.`;
  const why = `Sales change = (${fmt(T)} − ${fmt(L)}) ÷ ${fmt(L)} × 100 = ${signed(ch)}, with ${profitTxt(profit)}, so it is in **${stage}**.`;
  if (diff === "medium") {
    const ans = [signed(ch), stage];
    const others = rng.shuffle(PLC.filter((s) => s !== stage));
    const prefer = [[signed(chWrong), stage], [signed(ch), others[0]], [signed(ch), others[1]], [signed(ch), others[2]]];
    return segQ(rng, diff, `${data} ${PLC_RULE} Work out the sales change (to 1 decimal place) and the life-cycle stage.`,
      ["Sales change", "Stage"], ans, [chDecoys, PLC], prefer, null,
      { explanation: why, hints: PLC_HINTS, given: [{ label: "_last", value: L }, { label: "_now", value: T }], params: { kind: "plc", L, T, profit } });
  }
  if (diff === "hard") {
    // Four years of history; only the latest change and profit decide the stage.
    // Earlier years fit the story so far (a launch, then growth, then perhaps a peak).
    const r100 = (x) => Math.round(x / 100) * 100;
    const loss = () => -rng.int(20, 90) * 1000, gain = () => rng.int(10, 90) * 1000;
    const hist = stage === "Introduction" ? [[r100(L * rng.pick([0.3, 0.5])), loss()]]
      : stage === "Growth" ? [[r100(L * rng.pick([0.3, 0.4])), loss()], [r100(L * rng.pick([0.6, 0.7])), gain()]]
        : stage === "Maturity" ? [[r100(L * rng.pick([0.4, 0.5])), gain()], [r100(L * rng.pick([0.7, 0.8])), gain()]]
          : [[r100(L * rng.pick([0.9, 0.95])), gain()], [r100(L * rng.pick([1.1, 1.2])), gain()]];
    const lastProfit = stage === "Introduction" ? loss() : gain();
    const rows = [...hist, [L, lastProfit], [T, profit]];
    const ans = [stage, PLC_FOCUS[stage]];
    const others = rng.shuffle(PLC.filter((s) => s !== stage));
    const prefer = [[others[0], PLC_FOCUS[stage]], [stage, PLC_FOCUS[others[1]]], [stage, PLC_FOCUS[others[2]]], [others[0], PLC_FOCUS[others[0]] === ans[1] ? PLC_FOCUS[others[1]] : ans[1]]];
    return segQ(rng, diff,
      `Sales and profit for ${prod}:\n\n| Year | Units sold | Profit |\n| --- | --- | --- |\n${rows.map((r, i) => `| ${i + 1}${i === rows.length - 1 ? " (this year)" : ""} | ${fmt(r[0])} | ${money(r[1])} |`).join("\n")}\n\n${PLC_RULE} Judge the stage from the latest year. Which stage is it in now, and what is the usual marketing focus at that stage?`,
      ["Stage now", "Usual focus"], ans, [PLC, PLC.map((s) => PLC_FOCUS[s])], prefer, null,
      {
        explanation: `Only the change from last year to this year matters: ${why}\n\nThe usual focus: Introduction → informative advertising; Growth → widen distribution; Maturity → extension strategies (new uses, new markets, updated versions); Decline → cut support or withdraw. Here: **${ans[1]}**.`,
        hints: [...PLC_HINTS, "Usual focus: tell people the product exists, then get it into more places, then extend its life, then cut costs or withdraw."],
        given: [{ label: "_last", value: L }, { label: "_now", value: T }],
        params: { kind: "plcHard", L, T, profit },
      });
  }
  // Expert: life cycle and Boston matrix together.
  const highG = rng.next() < 0.5, highS = rng.next() < 0.5;
  const g = highG ? rng.int(12, 28) : rng.int(-4, 8);
  const r10 = highS ? rng.int(12, 30) : rng.int(2, 8);
  const cat = bcgOf(highG, highS);
  const ans = [signed(ch), stage, cat];
  const oS = rng.shuffle(PLC.filter((s) => s !== stage)), oC = rng.shuffle(BCG.filter((c) => c !== cat));
  const prefer = [[signed(chWrong), stage, cat], [signed(ch), oS[0], cat], [signed(ch), stage, oC[0]], [signed(chWrong), oS[1], cat], [signed(ch), oS[2], oC[1]]];
  return segQ(rng, diff,
    `${data} Its market is ${growTxt(g)}, and its relative market share is ${fmt(r10 / 10)}.\n\n${PLC_RULE} ${BCG_RULE} Work out the sales change (to 1 decimal place), then name the life-cycle stage and the Boston matrix category.`,
    ["Sales change", "Life-cycle stage", "Boston category"], ans, [chDecoys, PLC, BCG], prefer, null,
    {
      explanation: `- Life cycle: ${why}\n- Boston matrix: growth ${g}% is ${highG ? "above" : "not above"} 10% and relative share ${fmt(r10 / 10)} is ${highS ? "above" : "below"} 1, so it is a **${cat}**.\n\nThe two frameworks look at different things: the life cycle follows the product's own sales and profit, while the Boston matrix compares its market's growth and its share against rivals.`,
      hints: [PLC_HINTS[0], PLC_HINTS[1], BCG_HINTS[1]],
      given: [{ label: "_last", value: L }, { label: "_now", value: T }],
      params: { kind: "plcExpert", L, T, profit, g, r10 },
    });
}

const PLC_EXPLAIN = {
  Introduction: "Low sales, few stockists and a loss (or uncovered costs) while the firm builds awareness are signs of the launch stage.",
  Growth: "Fast-rising sales, new stockists, rivals copying and profit starting to rise are signs of growth.",
  Maturity: "High but flat sales, a crowded market and peak profit (or reminder advertising) are signs of maturity.",
  Decline: "Falling sales and profits as customers move to newer products are signs of decline.",
};

// ---------------------------------------------------------------------------------------------
// Pricing strategies

const PRICING = {
  "Penetration pricing": [
    "{F} launches its new {item} at a very low price to win market share quickly, planning to raise the price later.",
    "{F} enters a crowded market for {item} with a launch price well below rivals' to build a customer base fast.",
  ],
  "Price skimming": [
    "{F} launches its new {item}, which no rival can match yet, at a high price for keen early buyers, then lowers it over time.",
    "{F} sets a high launch price for its patented {item}, then cuts the price step by step as rivals catch up.",
  ],
  "Cost-plus pricing": [
    "{F} works out the full cost of making each of its {item} and adds 30% on top to set the price.",
    "{F} sets the price of its {item} by adding a fixed markup to the cost per unit.",
  ],
  "Competitive pricing": [
    "{F} checks what rivals charge for similar {item} and sets its price at the same level.",
    "{F} prices its {item} in line with the market leader, because customers compare prices online.",
  ],
  "Psychological pricing": [
    "{F} prices its {item} at $49.99 rather than $50 so they seem cheaper.",
    "{F} changes the price of its {item} from $100 to $99 so it looks like 'under a hundred'.",
  ],
  "Premium pricing": [
    "{F} keeps the price of its {item} far above rivals' to signal luxury and top quality.",
    "{F} sells hand-finished {item} at a high price that it never discounts, to protect its exclusive image.",
  ],
  "Loss leader": [
    "{R} sells {li} below cost, so shoppers come in and buy other, more profitable items.",
    "{R} prices {li} at less than it pays for them to pull customers into the store.",
  ],
  "Price discrimination": [
    "{V} charges different prices to different groups for the same {seat}: less for students and pensioners than for other adults.",
    "{V} charges more for a {seat} at busy peak times than at quiet off-peak times, for exactly the same service.",
  ],
};
const PRICE_FIRMS = ["Volt Electronics", "Nordic Home", "Luma Labs", "Atlas Gear", "Kestrel Audio", "Orchid Living"];
const PRICE_ITEMS = ["wireless earbuds", "fitness trackers", "robot vacuums", "coffee machines", "e-readers", "smart lamps"];
const RETAILERS = [{ R: "A supermarket", li: "milk and bread" }, { R: "A games shop", li: "new release games" }, { R: "A DIY store", li: "light bulbs" }, { R: "A stationery shop", li: "printer paper" }];
const VENUES = [{ V: "A cinema", seat: "film ticket" }, { V: "A rail company", seat: "train journey" }, { V: "A theme park", seat: "day pass" }, { V: "A swimming pool", seat: "swim session" }];
const STRATS = Object.keys(PRICING);

// Hard segmented rows: strategy | price level | main aim.
const PRICE_ROWS = {
  "Price skimming": ["High", "Recover development costs fast"],
  "Penetration pricing": ["Low", "Win market share quickly"],
  "Premium pricing": ["High", "Signal quality and exclusivity"],
  "Loss leader": ["Below cost", "Attract buyers of other items"],
  "Competitive pricing": ["Close to rivals'", "Avoid losing customers to rivals"],
};
const PRICE_SCEN = {
  "Price skimming": [
    "{F} is launching a new {item}. Nothing like it exists yet, it is protected by a patent, and tech fans are keen to be the first to own one.",
    "{F} spent heavily developing a new {item} with a feature no rival has, and expects copies to appear within two years.",
  ],
  "Penetration pricing": [
    "{F} is entering a crowded market for {item} where customers switch easily between brands. It wants a large share of the market as fast as possible.",
    "{F} is new to the {item} market and wants to build a big customer base quickly, accepting low profit at first.",
  ],
  "Premium pricing": [
    "{F} makes {item} by hand in small numbers for wealthy buyers and wants the brand to stand for exclusivity.",
    "{F} uses the best materials in its {item} and wants buyers to see it as the luxury choice.",
  ],
  "Loss leader": [
    "{R} wants more shoppers through the door and plans to make its money on the other things they buy once inside; it picks {li} for this.",
  ],
  "Competitive pricing": [
    "{F} sells {item} that are almost identical to its rivals'; customers compare prices online before buying.",
    "{F} is one of many firms selling standard {item}, and none of them stands out on quality.",
  ],
};

function genPricing(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard", "expert"]);
  const F = rng.pick(PRICE_FIRMS), item = rng.pick(PRICE_ITEMS);
  const rt = rng.pick(RETAILERS), vn = rng.pick(VENUES);
  const vars = { F, item, ...rt, ...vn };
  const pricingHints = [
    "Look for the clue: is the price set from costs, from rivals, from how it looks, from who is buying, or to change over time?",
    "High at launch then lowered = skimming; low at launch then raised = penetration; always high for image = premium; below cost to bring people in = loss leader; different prices for the same thing = price discrimination.",
  ];
  if (diff === "easy") {
    const strat = rng.pick(STRATS);
    const t = rng.pick(PRICING[strat]);
    return plain(`${fill(t, vars)} Which pricing strategy is this?`, strat, plainChoices(rng, strat, STRATS),
      { explanation: `${PRICE_WHY[strat]} This is **${strat.toLowerCase()}**.`, hints: pricingHints, params: { kind: "priceEasy", t } });
  }
  if (diff === "medium") {
    // Cost-plus price from variable cost, fixed costs and a markup on full unit cost.
    let v, fu, n, m, price;
    do {
      v = rng.int(4, 60) + rng.pick([0, 0.5, 0.25, 0.75]);
      n = rng.pick([500, 1000, 2000, 2500, 4000, 5000]);
      fu = rng.int(2, 40) + rng.pick([0, 0.5, 0.25]);
      m = rng.pick([20, 25, 30, 35, 40, 50, 60]);
      price = (v + fu) * (1 + m / 100);
    } while (!safe2(price));
    const Fc = Math.round(fu * n);
    const unit = v + fu;
    return {
      prompt: `${F} makes ${item}. The variable cost is ${money(v)} per unit, fixed costs are ${money(Fc)} a year, and it expects to sell ${fmt(n)} units a year. Using **cost-plus pricing** with a ${m}% markup on the full cost per unit, what price should it charge? Round to 2 decimal places.`,
      answerType: "number", answer: round2(price), tolerance: 0.005,
      explanation: `- Fixed cost per unit = ${money(Fc)} ÷ ${fmt(n)} = ${money(fu)}\n- Full cost per unit = ${money(v)} + ${money(fu)} = ${money(unit)}\n- Price = ${money(unit)} × ${fmt(1 + m / 100)} = **${money(round2(price))}**`,
      hints: [
        "Full cost per unit = variable cost per unit + fixed costs ÷ units.",
        `Then add the markup: multiply the full cost by (1 + ${m} ÷ 100). In the calculator: \`(_v + _fixed / _units) * (1 + _markup / 100)\`.`,
      ],
      given: [{ label: "_v", value: v }, { label: "_fixed", value: Fc }, { label: "_units", value: n }, { label: "_markup", value: m }],
      params: { kind: "costplus", v, Fc, n, m },
    };
  }
  if (diff === "hard") {
    if (rng.next() < 0.5) {
      const strat = rng.pick(Object.keys(PRICE_SCEN));
      const t = rng.pick(PRICE_SCEN[strat]);
      const ans = [strat, ...PRICE_ROWS[strat]];
      const keys = Object.keys(PRICE_ROWS);
      return segQ(rng, diff,`${fill(t, vars)} Which pricing strategy fits best, what price level does it set, and what is its main aim?`,
        ["Strategy", "Price level", "Main aim"], ans, [keys, [...new Set(keys.map((k) => PRICE_ROWS[k][0]))], keys.map((k) => PRICE_ROWS[k][1])], [], [STRATS, [], []],
        {
          explanation: `${PRICE_WHY[strat]} So: **${ans.join(" · ")}**.`,
          hints: ["Ask what the firm most wants: quick market share, early profit from keen buyers, an exclusive image, more shoppers, or not to lose sales to similar rivals.", pricingHints[1]],
          params: { kind: "priceScen", t },
        });
    }
    // Markup and margin from cost and price.
    let c, p, mk, mg;
    do {
      c = rng.int(8, 120);
      p = c + rng.int(Math.ceil(c * 0.15), Math.floor(c * 1.2));
      mk = ((p - c) / c) * 100; mg = ((p - c) / p) * 100;
    } while (!safe2(mk) || !safe2(mg));
    return {
      prompt: `${F} buys ${item} for ${money(c)} each and sells them for ${money(p)}. Work out the markup and the profit margin, as percentages rounded to 2 decimal places.`,
      answerType: "multi",
      parts: [
        { id: "markup", label: "Markup", ask: "Markup (% of cost)", answerType: "number", answer: round2(mk), tolerance: 0.005, hint: "Markup = profit per unit ÷ cost × 100." },
        { id: "margin", label: "Margin", ask: "Profit margin (% of price)", answerType: "number", answer: round2(mg), tolerance: 0.005, hint: "Margin = profit per unit ÷ selling price × 100." },
      ],
      explanation: `Profit per unit = ${money(p)} − ${money(c)} = ${money(p - c)}.\n\n- Markup = ${fmt(p - c)} ÷ ${fmt(c)} × 100 = **${fmt(round2(mk))}%**\n- Margin = ${fmt(p - c)} ÷ ${fmt(p)} × 100 = **${fmt(round2(mg))}%**\n\nThe markup is always the bigger number, because cost is smaller than price.`,
      hints: ["Both use the same profit per unit (price − cost); they divide by different things."],
      given: [{ label: "_cost", value: c }, { label: "_price", value: p }],
      params: { kind: "markup", c, p },
    };
  }
  // Expert: skimming versus penetration over two years, by total contribution.
  let v, p1, q1, p2, q2, pp, r1, r2, cs, cp;
  do {
    v = rng.int(10, 60);
    p1 = v + rng.int(60, 160); q1 = rng.int(2, 12) * 500;
    p2 = v + rng.int(20, Math.min(59, p1 - v - 1)); q2 = q1 + rng.int(2, 16) * 500;
    pp = v + rng.int(8, 40); r1 = rng.int(8, 30) * 500; r2 = r1 + rng.int(0, 12) * 500;
    cs = (p1 - v) * q1 + (p2 - v) * q2;
    cp = (pp - v) * (r1 + r2);
  } while (Math.abs(cs - cp) < 20000);
  const better = cs > cp ? "Price skimming" : "Penetration pricing";
  return {
    prompt: `${F} is launching new ${item}. Each unit costs ${money(v)} to make (variable cost), and fixed costs are the same whichever plan it picks.\n\n- **Plan S (skimming):** ${money(p1)} in year 1, selling ${fmt(q1)} units; then ${money(p2)} in year 2, selling ${fmt(q2)} units.\n- **Plan P (penetration):** ${money(pp)} in both years, selling ${fmt(r1)} units in year 1 and ${fmt(r2)} in year 2.\n\nWork out each plan's total contribution over the two years, and pick the plan that earns more.`,
    answerType: "multi",
    parts: [
      { id: "skim", label: "Plan S", ask: "Total contribution of Plan S ($)", answerType: "number", answer: cs, tolerance: 0, hint: "Contribution per unit = price − variable cost; multiply by units, for each year, then add the years." },
      { id: "pen", label: "Plan P", ask: "Total contribution of Plan P ($)", answerType: "number", answer: cp, tolerance: 0, hint: "The price is the same both years, so add the units first." },
      { id: "rec", label: "Recommendation", ask: "Which plan earns more?", answerType: "choice", answer: better, choices: ["Price skimming", "Penetration pricing"], hint: "Fixed costs are the same in both plans, so the bigger total contribution means the bigger profit." },
    ],
    explanation:
      `Contribution = (price − variable cost) × units.\n\n- Plan S: (${p1} − ${v}) × ${fmt(q1)} + (${p2} − ${v}) × ${fmt(q2)} = ${fmt((p1 - v) * q1)} + ${fmt((p2 - v) * q2)} = **${money(cs)}**\n` +
      `- Plan P: (${pp} − ${v}) × (${fmt(r1)} + ${fmt(r2)}) = **${money(cp)}**\n\nFixed costs are equal, so **${better.toLowerCase()}** earns more, by ${money(Math.abs(cs - cp))}.`,
    hints: ["Ignore fixed costs: they are the same in both plans.", "Work out contribution per unit for each price, then multiply by the units sold at that price."],
    given: [{ label: "_v", value: v }, { label: "_p1", value: p1 }, { label: "_q1", value: q1 }, { label: "_p2", value: p2 }, { label: "_q2", value: q2 }, { label: "_pp", value: pp }, { label: "_r1", value: r1 }, { label: "_r2", value: r2 }],
    params: { kind: "skimpen", v, p1, q1, p2, q2, pp, r1, r2 },
  };
}

const PRICE_WHY = {
  "Penetration pricing": "A low launch price to win customers quickly, raised later once the product has a following.",
  "Price skimming": "A high launch price for keen early buyers while the product has no rivals, lowered over time.",
  "Cost-plus pricing": "The price is the cost per unit plus a set markup.",
  "Competitive pricing": "The price is set at the level rivals charge for similar products.",
  "Psychological pricing": "A price just below a round number looks noticeably cheaper.",
  "Premium pricing": "A price kept high on purpose to signal quality and exclusivity.",
  "Loss leader": "One item is sold below cost to bring in customers who buy other, profitable items.",
  "Price discrimination": "The same product is sold at different prices to different groups or at different times.",
};

// ---------------------------------------------------------------------------------------------
// Market segmentation

const BASES = ["Demographic", "Geographic", "Psychographic", "Behavioural"];
const SEGS = {
  Demographic: ["people aged 18 to 24", "families with young children", "households earning over $100,000 a year", "retired people over 65", "women aged 30 to 45", "university students", "single-person households"],
  Geographic: ["people living in cold northern regions", "city-centre residents", "people in rural villages", "customers in coastal towns", "people in hot, dry climates", "customers living within 5 km of the store"],
  Psychographic: ["people who value an eco-friendly lifestyle", "thrill-seekers who love adventure", "people who see themselves as fashion leaders", "people with a busy, on-the-go lifestyle", "people whose values put animal welfare first", "outgoing people who love social events"],
  Behavioural: ["customers who buy every week", "first-time buyers", "loyal customers who always buy the same brand", "people who buy only as a gift for special occasions", "heavy users who use the product every day", "customers who have not bought anything for a year"],
};
const SEG_FIRMS = ["A chocolate brand", "A clothing brand", "A coffee chain", "A bookshop chain", "A phone maker", "A sportswear firm", "A cosmetics brand"];
const SEG_HINTS = [
  "Demographic = who people are (age, gender, income, family, occupation). Geographic = where they are (region, climate, town or country).",
  "Psychographic = how they live and think (lifestyle, values, personality). Behavioural = how they act towards the product (how often they buy, loyalty, occasion, benefits sought).",
];

function genSeg(diff, rng) {
  checkDifficulty(diff, ["easy", "medium", "hard"]);
  const firm = rng.pick(SEG_FIRMS);
  const n = diff === "easy" ? 1 : 2;
  const bases = rng.shuffle(BASES.slice()).slice(0, n);
  const crit = bases.map((b) => rng.pick(SEGS[b]));
  const explanation = crit.map((c, i) => `- "${cap(c)}": **${bases[i]}**. ${SEG_WHY[bases[i]]}`).join("\n");
  if (diff === "easy") {
    return plain(`${firm} targets ${crit[0]}. Which basis of market segmentation is this?`, bases[0], rng.shuffle(BASES.slice()),
      { explanation, hints: SEG_HINTS, params: { kind: "seg", crit } });
  }
  if (diff === "medium") {
    return segQ(rng, diff,`${firm} defines its target segment with two criteria:\n\n1. ${cap(crit[0])}\n2. ${cap(crit[1])}\n\nWhich basis of market segmentation does each criterion use?`,
      ["Criterion 1", "Criterion 2"], bases, [BASES, BASES], [], null, { explanation, hints: SEG_HINTS, params: { kind: "seg", crit } });
  }
  // Hard: size of a two-criterion segment plus the basis of the second criterion.
  const N = rng.int(4, 60) * 10000;
  const a = rng.int(2, 16) * 5, b = rng.int(2, 16) * 5;
  const size = (N * a * b) / 10000;
  return {
    prompt: `${firm} is studying a town of ${fmt(N)} people. ${a}% of them are ${crit[0]}, and ${b}% of those are also ${crit[1]}. How many people are in the segment that meets both criteria, and which basis of segmentation does the second criterion use?`,
    answerType: "multi",
    parts: [
      { id: "size", label: "Segment size", ask: "People in the segment", answerType: "number", answer: size, tolerance: 0, hint: "Take the first percentage of the town, then the second percentage of that group." },
      { id: "basis", label: "Basis", ask: `Basis of "${crit[1]}"`, answerType: "choice", answer: bases[1], choices: rng.shuffle(BASES.slice()), hint: "Ask whether the criterion says who the people are, where they are, how they live and think, or how they buy and use the product." },
    ],
    explanation: `- Size = ${fmt(N)} × ${a}% × ${b}% = ${fmt(N)} × ${fmt(a / 100)} × ${fmt(b / 100)} = **${fmt(size)}**\n- "${cap(crit[1])}": **${bases[1]}**. ${SEG_WHY[bases[1]]}`,
    hints: ["The second percentage is a share of the first group, not of the whole town, so multiply the two."],
    given: [{ label: "_town", value: N }, { label: "_pct1", value: a }, { label: "_pct2", value: b }],
    params: { kind: "segHard", N, a, b, crit },
  };
}

const SEG_WHY = {
  Demographic: "It describes who the customers are.",
  Geographic: "It describes where the customers are.",
  Psychographic: "It describes their lifestyle, values or personality.",
  Behavioural: "It describes how they buy or use the product.",
};

// ---------------------------------------------------------------------------------------------
// Entry point

export function generate({ subtopic, difficulty, rng }) {
  switch (subtopic) {
    case "marketing-mix": return genMix(difficulty, rng);
    case "ansoff": return genAnsoff(difficulty, rng);
    case "boston": return genBoston(difficulty, rng);
    case "life-cycle": return genPLC(difficulty, rng);
    case "pricing": return genPricing(difficulty, rng);
    case "segmentation": return genSeg(difficulty, rng);
    default: throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Verify: recompute the expected answer from the stated facts, then check the question's shape.
// Returns an array (segmented), a string (plain choice), a number, or { partId: value } (multi).

function findPricing(t) {
  const easy = groupOf(PRICING, t);
  return easy;
}

function expected(p) {
  switch (p.kind) {
    case "mix": {
      const banks = p.hard ? [MIX, MIX_HARD] : [MIX];
      const out = p.templates.map((t) => {
        const hits = banks.map((b) => groupOf(b, t)).filter(Boolean);
        const inBoth = banks.length === 2 && PS.some((P) => MIX[P].includes(t)) && PS.some((P) => MIX_HARD[P].includes(t));
        return hits.length === 1 && !inBoth ? hits[0] : null;
      });
      if (out.includes(null)) return null;
      return out.length === 1 ? out[0] : out;
    }
    case "ansoff": {
      // Find each plan's template group, then apply the matrix to its newness.
      const strats = p.plans.map((t) => {
        const g = groupOf(ANSOFF_PLANS, t);
        if (!g) return null;
        const usesNewProd = t.includes("{newProd}"), usesNewMkt = t.includes("{newMkt}");
        return ansoffOf(usesNewProd, usesNewMkt) === g ? g : null;
      });
      if (strats.includes(null)) return null;
      if (strats.length === 1) {
        if (!p.seg) return strats[0];
        const t = p.plans[0];
        return [t.includes("{newProd}") ? "New" : "Existing", t.includes("{newMkt}") ? "New" : "Existing", strats[0]];
      }
      const r = (s) => ({ "Market penetration": 0, Diversification: 2 }[s] ?? 1);
      if (r(strats[0]) === r(strats[1])) return null;
      return [strats[0], strats[1], r(strats[0]) > r(strats[1]) ? "Plan A" : "Plan B"];
    }
    case "bcgEasy": return bcgOf(p.g > 10, p.r10 > 10);
    case "bcgMed": {
      if (Math.abs(p.s / p.t - 1) < 0.1) return null;
      const hg = p.g > 10, hs = p.s > p.t;
      return [hg ? "High" : "Low", hs ? "High" : "Low", bcgOf(hg, hs)];
    }
    case "bcgHard": {
      // Growth via ratio, share via cross-multiplication.
      const growth = (p.B / p.A - 1) * 100;
      if (Math.abs(growth - 10) < 1 || Math.abs(p.S - p.R) < 0.1 * p.R) return null;
      return [signed(round1(growth)), fmt(round2(p.S / p.R)), bcgOf(p.B * 10 > p.A * 11, p.S > p.R)];
    }
    case "bcgExpert":
      return p.data.map((d) => bcgOf(d.B * 10 > d.A * 11, d.S > d.R));
    case "plcEasy": return groupOf(PLC_DESC, p.desc);
    case "plc":
    case "plcHard":
    case "plcExpert": {
      const st = plcOf(p.L, p.T, p.profit);
      if (!st) return null;
      if (p.kind === "plc") return [signed(round1((p.T / p.L - 1) * 100)), st];
      if (p.kind === "plcHard") return [st, PLC_FOCUS[st]];
      if (Math.abs(p.g - 10) < 1 || Math.abs(p.r10 - 10) < 1) return null;
      return [signed(round1((p.T / p.L - 1) * 100)), st, bcgOf(p.g > 10, p.r10 > 10)];
    }
    case "priceEasy": return findPricing(p.t);
    case "priceScen": {
      const g = groupOf(PRICE_SCEN, p.t);
      return g ? [g, ...PRICE_ROWS[g]] : null;
    }
    case "costplus": return round2(((p.v * p.n + p.Fc) / p.n) * ((100 + p.m) / 100));
    case "markup": return { markup: round2(((p.p - p.c) * 100) / p.c), margin: round2(100 - (p.c * 100) / p.p) };
    case "skimpen": {
      const rev = p.p1 * p.q1 + p.p2 * p.q2, cost = p.v * (p.q1 + p.q2);
      const revP = p.pp * p.r1 + p.pp * p.r2, costP = p.v * p.r1 + p.v * p.r2;
      const s = rev - cost, pe = revP - costP;
      if (s === pe) return null;
      return { skim: s, pen: pe, rec: s > pe ? "Price skimming" : "Penetration pricing" };
    }
    case "seg": {
      const b = p.crit.map((c) => groupOf(SEGS, c));
      if (b.includes(null)) return null;
      return b.length === 1 ? b[0] : b;
    }
    case "segHard": {
      const b = groupOf(SEGS, p.crit[1]);
      if (!b || !groupOf(SEGS, p.crit[0])) return null;
      return { size: Math.round(p.N * (p.a / 100) * (p.b / 100)), basis: b };
    }
    default: return null;
  }
}

function checkPlainChoice(choices, want, answer) {
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 6) return false;
  const keys = choices.map(keyOf);
  if (new Set(keys).size !== keys.length) return false;
  if (keys.filter((k) => k === want).length !== 1) return false;
  return keyOf(answer) === want;
}

// Build mode: every block is (column, value). Within a column no two blocks may read the same
// (ignoring case, spacing and the minus sign), so the only correct set of one block per column is
// the answer's; and there must be enough distractor blocks for the difficulty's range.
const BLOCK_MIN = { easy: 1, medium: 3, hard: 6, expert: 9 };
const normSeg = (v) => String(v).trim().toLowerCase().replace(/\s+/g, " ").replace(/−/g, "-");
function blocksOk(q, want, diff) {
  const cols = q.choiceCols;
  const perCol = cols.map(() => new Map());
  const add = (j, v) => {
    const k = normSeg(v);
    const m = perCol[j];
    if (m.has(k) && m.get(k) !== v) return false; // two different spellings of one value
    m.set(k, v);
    return true;
  };
  for (const c of q.choices) if (!segsOf(c).every((v, j) => add(j, v))) return false;
  const extra = q.extraSegs || [];
  if (!Array.isArray(extra)) return false;
  for (const e of extra) {
    const j = cols.indexOf(e[0]);
    if (j < 0 || typeof e[1] !== "string" || !e[1] || e[1].length > 40 || e[1].includes("|")) return false;
    if (normSeg(e[1]) === normSeg(want[j])) return false;
    if (!add(j, e[1])) return false;
  }
  const distractors = perCol.reduce((n, m, j) => n + [...m.keys()].filter((k) => k !== normSeg(want[j])).length, 0);
  return distractors >= (BLOCK_MIN[diff] ?? 3);
}

function checkSegChoice(q, p, want, answer) {
  const cols = q.choiceCols;
  if (!Array.isArray(cols) || cols.length !== want.length || cols.length < 2 || cols.length > 4) return false;
  if (cols.some((c) => typeof c !== "string" || !c || c.length > 24)) return false;
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length !== optionCount(p.diff)) return false;
  if (!blocksOk(q, want, p.diff)) return false;
  for (const c of ch) {
    const s = segsOf(c);
    if (s.length !== want.length || s.some((x) => !x || x.length > 40)) return false;
    const d = s.filter((x, i) => x !== want[i]).length;
    if (d === want.length) return false; // a distractor must share at least one segment
  }
  return checkPlainChoice(ch, want.join(SEP), answer);
}

const numOk = (x, want, tol) => typeof x === "number" ? Math.abs(x - want) <= Math.max(tol, 1e-9) : x !== "" && x !== null && Number.isFinite(Number(x)) && Math.abs(Number(x) - want) <= Math.max(tol, 1e-9);

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  const want = expected(p);
  if (want === null || want === undefined) return false;
  if (question.answerType === "multi") {
    const parts = question.parts;
    if (!Array.isArray(parts) || !answer || typeof answer !== "object") return false;
    if (parts.length !== Object.keys(want).length) return false;
    return parts.every((pt) => {
      if (!(pt.id in want)) return false;
      if (pt.answerType === "number") return numOk(answer[pt.id], want[pt.id], pt.tolerance || 0);
      if (pt.answerType === "choice") return checkPlainChoice(pt.choices, String(want[pt.id]), answer[pt.id]);
      return false;
    });
  }
  if (question.answerType === "number") return typeof want === "number" && numOk(answer, want, question.tolerance || 0);
  if (question.answerType !== "choice") return false;
  if (Array.isArray(want)) return checkSegChoice(question, p, want, answer);
  if (question.choiceCols !== undefined) return false;
  return checkPlainChoice(question.choices, want, answer);
}
