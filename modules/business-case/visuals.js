// Question visuals for Business Case (ticket 026). Pure post-processing: visualFor() reads the
// finished question (its params, and for multi-part the part labels) and returns a `visual` object
// or undefined. It never calls the rng, so every seed gives the same question as before.
//
// Easy-Hard: the visual only restates numbers that are already in the prompt (a written-style
// table of price and cost, a break-even chart, a cash-flow bar chart). Expert: the same, with no
// values omitted (every Expert question needs all of its numbers, and nothing here is read off a
// chart), so verify() and the hints are unchanged.

import { fmtNum, round2 } from "../../js/lib/mathutil.js";

// Dollar amounts as the prompts write them: "$240", "$12.50", "-$3.75".
function usd(n) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  const s = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(2);
  return v < 0 ? `-$${s}` : `$${s}`;
}
const pct = (n) => `${fmtNum(n)}%`;

function table(caption, rows, columns = ["Item", "Value"], align) {
  return { kind: "table", caption, columns, rows, align: align || columns.map((_, i) => (i === 0 ? "left" : "right")) };
}

// "Break-even units" style asked row, only for single-part questions (a multi-part one asks several things).
const asked = (q, label) => (q.params && q.params.multi ? [] : [[label, "?"]]);

// The smallest 1/2/2.5/5 x 10^k at or above x.
function niceCeil(x) {
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= x) return m * mag;
  return 10 * mag;
}

// ---- Break-even ----

function breakEven(q, difficulty) {
  const p = q.params;
  const k = p.kind;
  const v = p.values;
  if (k === "revenue-ratio") {
    return table("Break-even facts", [
      ["Fixed costs / month", usd(v.F)],
      ["Contribution margin ratio", pct(v.r)],
      ...(v.S !== undefined ? [["Expected sales / month", usd(v.S)]] : []),
      ...asked(q, "Break-even revenue"),
    ]);
  }
  const unitCost = v.costs ? v.costs.reduce((a, b) => a + b, 0) : v.C;
  // Medium: chart of revenue against total cost; the learner sees where the lines cross.
  if (difficulty === "medium" && (k === "units" || k === "revenue") && v.P > unitCost) {
    const N = Math.ceil((v.F / (v.P - unitCost)) * (1 - 1e-12));
    const xMax = niceCeil(N * 1.6);
    return {
      kind: "line",
      caption: "Revenue and total cost per month",
      series: [
        { name: "Revenue", points: [[0, 0], [xMax, round2(v.P * xMax)]] },
        { name: "Total cost", points: [[0, v.F], [xMax, round2(v.F + unitCost * xMax)]] },
      ],
      xLabel: "Units sold per month",
      yLabel: "Dollars per month",
      xMin: 0,
      yMin: 0,
      showPoints: false,
      showValues: false,
    };
  }
  const rows = [];
  if (k === "price-change") {
    rows.push(["Selling price now", usd(v.P)], ["Planned price change", `${v.u > 0 ? "+" : "-"}${Math.abs(v.u)}%`]);
  } else {
    rows.push(["Selling price", usd(v.P)]);
  }
  if (v.costs) {
    v.costs.forEach((c, i) => rows.push([`Variable cost (part ${i + 1})`, usd(c)]));
  } else {
    rows.push(["Variable cost per unit", usd(v.C)]);
  }
  rows.push(["Fixed costs / month", usd(v.F)]);
  if (v.T) rows.push(["Target profit / month", usd(v.T)]);
  if (v.D !== undefined) rows.push(["Expected sales (units)", String(v.D)]);
  if (v.S !== undefined) rows.push(["Expected sales / month", usd(v.S)]);
  if (k === "units") rows.push(...asked(q, "Break-even units"));
  else if (k === "target-units") rows.push(...asked(q, "Units for the target"));
  else if (k === "price-change") rows.push(...asked(q, "New break-even units"));
  else if (k === "target-revenue" || k === "revenue") rows.push(...asked(q, "Revenue needed"));
  return table("Price and cost", rows);
}

// ---- Unit economics ----

function unitEconomics(q, difficulty) {
  const p = q.params;
  const k = p.kind;
  const v = p.values;
  if (k === "cm-ratio") {
    const rows = [["Selling price", usd(v.P)]];
    if (v.costs.length === 1) rows.push(["Variable cost per unit", usd(v.costs[0])]);
    else v.costs.forEach((c, i) => rows.push([`Variable cost (part ${i + 1})`, usd(c)]));
    rows.push(...asked(q, "Margin ratio (%)"));
    return table("Price and cost", rows);
  }
  if (k === "ltv") {
    const rows = difficulty === "easy"
      ? [["Gross profit per order", usd(v.X)], ["Orders per year", String(v.k)], ["Years as a customer", String(v.y)]]
      : [["Average order", usd(v.A)], ["Gross margin", pct(v.g)], ["Orders per year", String(v.k)], ["Years as a customer", String(v.y)]];
    return table("Per customer", [...rows, ...asked(q, "Lifetime value (LTV)")]);
  }
  if (k === "ltv-cac") {
    const rows = difficulty === "easy"
      ? [["Gross profit per year", usd(v.Y)], ["Years as a customer", String(v.y)], ["Cost to win (CAC)", usd(v.CAC)]]
      : [["Gross profit per order", usd(v.X)], ["Orders per year", String(v.k)], ["Years as a customer", String(v.y)], ["Cost to win (CAC)", usd(v.CAC)]];
    return table("Per customer", [...rows, ...asked(q, "LTV:CAC ratio")]);
  }
  // Hard: subscription with monthly churn.
  const rows = [["Monthly fee", usd(v.fee)], ["Gross margin", pct(v.g)], ["Monthly churn", pct(v.c)]];
  if (v.CAC !== undefined) rows.push(["Cost to win (CAC)", usd(v.CAC)]);
  if (v.t !== undefined) rows.push(["Target LTV:CAC", `${v.t}:1`]);
  if (k === "churn-ltv") rows.push(...asked(q, "Lifetime value (LTV)"));
  else if (k === "churn-ratio") rows.push(...asked(q, "LTV:CAC ratio"));
  else if (k === "max-cac") rows.push(...asked(q, "Most it can spend (CAC)"));
  return table("Subscription facts", rows);
}

// ---- Investment ----

function investment(q, difficulty) {
  const p = q.params;
  const k = p.kind;
  const v = p.values;
  if (k === "roi") {
    if (difficulty === "easy") {
      return table("Investment", [["Cost", usd(v.costs[0])], ["Extra profit (total)", usd(v.yearly)], ...asked(q, "ROI (%)")]);
    }
    const rows = [["Purchase price", usd(v.costs[0])], ["Installation", usd(v.costs[1])], ["Extra profit per year", usd(v.yearly)], ["Years", String(v.years)]];
    if (v.resale > 0) rows.push(["Sale value at the end", usd(v.resale)]);
    return table("Investment", [...rows, ...asked(q, "ROI (%)")]);
  }
  if (k === "payback") {
    const rows = [["Cost", usd(v.cost)], [v.monthly ? "Extra profit per month" : "Extra profit per year", usd(v.inflow)], ["Upkeep per year", usd(v.upkeep)]];
    return table("Investment", [...rows, ...asked(q, "Payback (years)")]);
  }
  // NPV: cash flows by year, as a table (medium) or a bar chart with the cost below zero (hard).
  const flows = v.flows;
  if (difficulty === "hard") {
    return {
      kind: "bar",
      caption: `Cash flows, discount rate ${pct(v.r)}`,
      categories: ["Year 0", ...flows.map((_, i) => `Year ${i + 1}`)],
      series: [{ name: "Cash flow ($)", values: [-v.cost, ...flows] }],
      xLabel: "Year",
      yLabel: "Cash flow ($)",
      showValues: true,
    };
  }
  return table(`Cash flows, discount rate ${pct(v.r)}`, [
    ["0 (today)", usd(-v.cost)],
    ...flows.map((f, i) => [String(i + 1), usd(f)]),
  ], ["Year", "Cash flow"]);
}

// ---- Pricing decisions ----

function pricing(q) {
  const p = q.params;
  const k = p.kind;
  const v = p.values;
  if (k === "price-ab") {
    return table("The two prices", [
      ["Price", usd(v.PA), usd(v.PB)],
      ["Cost per unit", usd(v.C), usd(v.C)],
      ["Units / month", String(v.QA), String(v.QB)],
    ], ["", "Option A", "Option B"]);
  }
  if (k === "price-raise") {
    return table("Now and after the change", [
      ["Price", usd(v.P), `+${v.up}%`],
      ["Units / month", String(v.Q), `-${v.drop}%`],
      ["Cost per unit", usd(v.C), "same"],
    ], ["", "Now", "Change"]);
  }
  if (k === "make-buy") {
    const rows = [["Set-up cost", usd(v.S), null], ["Cost per unit", usd(v.v), usd(v.L)]];
    if (v.d > 0) rows.push(["Discount", null, `${v.d}%`], ["Shipping", null, usd(v.ship)]);
    return table(`Order of ${v.Q} units`, rows, ["", "Make", "Buy"]);
  }
  // suppliers
  const rows = [["Unit price", usd(v.a), usd(v.L)]];
  if (v.d > 0) rows.push(["Discount", null, `${v.d}%`]);
  rows.push(["Delivery fee", usd(v.s), "free"]);
  return table(`Order of ${v.Q} units`, rows, ["", "Supplier A", "Supplier B"]);
}

// ---- Inventory ----

function inventory(q, difficulty) {
  const p = q.params;
  const k = p.kind;
  const v = p.values;
  if (k === "reorder-point") {
    let rows;
    if (difficulty === "easy") rows = [["Demand per day", String(v.A)], ["Lead time (days)", String(v.L)], ["Safety stock", String(v.ss)]];
    else if (difficulty === "medium") rows = [["Demand per year", String(v.A)], ["Days open per year", String(v.W)], ["Lead time (days)", String(v.L)], ["Safety stock", String(v.ss)]];
    else rows = [["Demand per week", String(v.A)], ["Days open per week", String(v.W)], ["Lead time (days)", String(v.L)], ["Safety stock (days)", String(v.sd)]];
    if (v.onHand !== undefined) rows.push(["Stock on hand now", String(v.onHand)]);
    return table("Stock facts", [...rows, ...asked(q, "Reorder point")]);
  }
  if (k === "inv-costs") {
    return table("Ordering and holding", [
      ["Demand per year", String(v.D)],
      ["Order size", String(v.Q)],
      ["Cost per order", usd(v.S)],
      ["Holding cost / unit / year", usd(v.H)],
    ]);
  }
  // eoq / eoq-cost
  const rows = [["Demand per year", String(v.D)], ["Cost per order", usd(v.S)], ["Holding cost / unit / year", usd(v.H)]];
  if (v.N !== undefined) rows.push(["Current order size", String(v.N)]);
  if (v.T !== undefined) rows.push(["Minimum saving", usd(v.T)]);
  return table("Ordering and holding", rows);
}

// ---- Hiring ----

function hiring(q) {
  const p = q.params;
  const k = p.kind;
  const v = p.values;
  const rows = [["Salary per year", usd(v.salary)], ["Overheads on top", pct(v.o)]];
  if (v.G !== undefined) rows.push(["Extra gross profit / month", usd(v.G)]);
  if (v.R !== undefined) rows.push(["Extra sales / month", usd(v.R)], ["Gross margin", pct(v.g)]);
  if (v.F !== undefined) rows.push(["Up-front cost", usd(v.F)]);
  if (v.T !== undefined) rows.push(["Pay back within (months)", String(v.T)]);
  if (k === "hire-cost") rows.push(...asked(q, "Full monthly cost"));
  return table("The hire", rows);
}

// ---- Expert ----

function expert(q) {
  const p = q.params;
  switch (p.x) {
    case "be-price":
      return table("Plan facts", [
        ["Variable cost per unit", usd(p.Cc / 100)],
        ["Fixed costs / month", usd(p.F)],
        ["Expected sales / month", String(p.D)],
        ["Target profit / month", usd(p.T)],
        ["Customers pay at most", usd(p.maxC / 100)],
      ]);
    case "be-leverage":
      return table("Monthly figures", [
        ["Units sold", String(p.Q)],
        ["Selling price", usd(p.Pc / 100)],
        ["Variable cost per unit", usd(p.Cc / 100)],
        ["Fixed costs", usd(p.F)],
        ["Sales growth planned", pct(p.g)],
      ]);
    case "be-mix": {
      const name = (i, fb) => {
        const l = q.parts && q.parts[i] && String(q.parts[i].label || "");
        const m = /^Break-even (.+)$/.exec(l || "");
        return m ? m[1] : fb;
      };
      return table(`Fixed costs ${usd(p.F)} a month`, [
        ["Price", usd(p.Pa / 100), usd(p.Pb / 100)],
        ["Unit cost", usd(p.Ca / 100), usd(p.Cb / 100)],
        ["Per mix set", String(p.ra), String(p.rb)],
      ], ["", name(1, "Product A"), name(2, "Product B")]);
    }
    case "inv-annuity":
      return table("The project", [
        ["Cost today", usd(p.C)],
        ["Life (years)", String(p.n)],
        ["Discount rate", pct(p.r)],
        ["Owner's estimate / year", usd(p.E)],
      ]);
    case "inv-compare":
      return table(`Discount rate ${pct(p.r)}`, [
        ["Cost today", usd(p.a.C), usd(p.b.C)],
        ["Cash a year", usd(p.a.f), usd(p.b.f)],
        ["Years", String(p.a.n), String(p.b.n)],
        ["Sale value", usd(p.a.R), usd(p.b.R)],
      ], ["", "Project A", "Project B"]);
    case "inv-dpay":
      return {
        kind: "bar",
        caption: `Cash flows, discount rate ${pct(p.r)}`,
        categories: ["Year 0", ...p.flows.map((_, i) => `Year ${i + 1}`)],
        series: [{ name: "Cash flow ($)", values: [-p.C, ...p.flows] }],
        xLabel: "Year",
        yLabel: "Cash flow ($)",
        showValues: true,
      };
    default:
      return undefined;
  }
}

export function visualFor(q, subtopic, difficulty) {
  if (!q || !q.params) return undefined;
  if (typeof q.params.x === "string") return expert(q);
  if (!q.params.values) return undefined;
  switch (subtopic) {
    case "break-even": return breakEven(q, difficulty);
    case "unit-economics": return unitEconomics(q, difficulty);
    case "investment": return investment(q, difficulty);
    case "pricing-decision": return pricing(q);
    case "inventory": return inventory(q, difficulty);
    case "hiring": return hiring(q);
    default: return undefined;
  }
}
