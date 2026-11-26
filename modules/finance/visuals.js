// Question visuals for Finance (ticket 026). Pure post-processing: visualFor() reads the finished
// question's params and returns a `visual` or undefined. It never calls the rng, so every seed
// gives the same question as before. Every number shown is already in the prompt; "?" marks the
// asked cell. Expert questions show their stated facts only (nothing omitted, nothing read off a
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
const yrs = (n) => (n === 1 ? "1 year" : `${n} years`);

function facts(caption, rows) {
  return { kind: "table", caption, columns: ["Item", "Value"], rows, align: ["left", "right"] };
}

// ---- Depreciation ----

function depreciation(p, difficulty) {
  const k = p.kind;
  const v = p.values;
  if (k === "sl-charge" || k === "sl-book") {
    return {
      kind: "line",
      caption: "Straight-line book value",
      series: [{ name: "Book value", points: [[0, v.C], [v.n, v.S]] }],
      xLabel: "Year",
      yLabel: "Book value ($)",
      xMin: 0,
      xMax: v.n,
      yMin: 0,
      showPoints: true,
      showValues: false,
    };
  }
  if (k === "rb-rate") {
    return facts("Reducing balance", [["Cost", usd(v.C)], ["Years", String(v.k)], ["Book value after that", usd(v.BV)], ["Yearly rate (%)", "?"]]);
  }
  const rows = [["Cost", usd(v.C)], ["Rate (reducing balance)", pct(v.r)]];
  if (k === "rb-book") rows.push(["Years", String(v.k)], ["Book value then", "?"]);
  else rows.push(["Year of the charge", String(v.k)], ["Charge that year", "?"]);
  return facts("Reducing balance", rows);
}

// ---- Loans ----

function loans(p) {
  const v = p.values;
  const rows = [["Loan", usd(v.P)], ["Rate per year", pct(v.rate)], ["Term", yrs(v.yrs)], ["Monthly payments", String(12 * v.yrs)]];
  if (p.kind === "interest-given") rows.push(["Each payment", usd(v.M)], ["Total interest", "?"]);
  else if (p.kind === "payment") rows.push(["Monthly payment", "?"]);
  else if (p.kind === "total-interest") rows.push(["Total interest", "?"]);
  else rows.push(["After payment number", String(v.k)], ["Still owed", "?"]);
  return facts("The loan", rows);
}

// ---- Annuities and savings ----

function annuities(p, difficulty) {
  const k = p.kind;
  const v = p.values;
  if (k === "fv" || k === "pv") {
    if (difficulty === "easy") {
      const fv = k === "fv";
      const flows = Array.from({ length: v.n }, (_, i) => [String(i + 1), usd(v.D)]);
      const rows = fv ? [...flows, [`Balance after year ${v.n}`, "?"]] : [["Needed today", "?"], ...flows];
      return {
        kind: "table",
        caption: `${pct(v.r)} a year, compounded yearly`,
        columns: ["Year", fv ? "Deposit (end of year)" : "Payout (end of year)"],
        rows,
        align: ["left", "right"],
      };
    }
    return facts("Monthly plan", [
      [k === "fv" ? "Deposit each month" : "Payout each month", usd(v.D)],
      ["Rate per year", pct(v.r)],
      ["Compounded", "monthly"],
      ["Term", yrs(v.n / 12)],
      [k === "fv" ? "Balance after last deposit" : "Needed today", "?"],
    ]);
  }
  if (k === "years-to-goal") {
    return facts("Savings plan", [["Deposit each year", usd(v.D)], ["Rate per year", pct(v.r)], ["Goal", usd(v.G)], ["Years to reach it", "?"]]);
  }
  if (k === "deposit-for-goal") {
    return facts("Savings plan", [["Goal", usd(v.G)], ["Rate per year", pct(v.r)], ["Compounded", "monthly"], ["Term", yrs(v.n / 12)], ["Deposit each month", "?"]]);
  }
  return facts("Savings plan", [
    ["Opening balance", usd(v.L)],
    ["Deposit each month", usd(v.D)],
    ["Rate per year", pct(v.r)],
    ["Compounded", "monthly"],
    ["Term", yrs(v.n / 12)],
    ["Balance after last deposit", "?"],
  ]);
}

// ---- Expert (stated facts only) ----

function expert(p) {
  const v = p.values;
  switch (p.kind) {
    case "x-disposal":
      return facts("The asset", [["Cost", usd(v.C)], ["Salvage value", usd(v.S)], ["Planned life", yrs(v.n)], ["Sold after", yrs(v.k)], ["Sale price", usd(v.X)]]);
    case "x-rbback":
      return facts("The asset", [["Method", "reducing balance"], ["Rate per year", pct(v.r)], ["Years", String(v.k)], ["Book value then", usd(v.BV)]]);
    case "x-compare":
      return facts("The asset", [["Cost", usd(v.C)], ["Life", yrs(v.n)], ["Salvage value", "$0"], ["Reducing-balance rate", pct(v.r)], ["Compare after", yrs(v.k)]]);
    case "x-payoff":
    case "x-split":
      return facts("The loan", [["Loan", usd(v.P)], ["Rate per year", pct(v.rate)], ["Term", yrs(v.yrs)], ["Payment number", String(v.k)]]);
    case "x-afford":
      return facts("The offer", [["Can afford per month", usd(v.Mb)], ["Rate per year", pct(v.rate)], ["Term", yrs(v.yrs)]]);
    case "x-extra":
      return facts("The loan", [["Loan", usd(v.P)], ["Rate per year", pct(v.rate)], ["Term", yrs(v.yrs)], ["Extra each month", usd(v.E)]]);
    case "x-retire":
      return facts("The plan", [["Deposit each month", usd(v.D)], ["Rate per year", pct(v.r)], ["Years saving", String(v.y1)], ["Years paying out", String(v.y2)]]);
    case "x-delay":
      return facts("Two savers", [["Goal each", usd(v.G)], ["Rate per year", pct(v.r)], ["Years to goal", String(v.Y)], ["Saver B waits", yrs(v.k)]]);
    case "x-due":
      return facts("The plan", [["Deposit each month", usd(v.D)], ["Rate per year", pct(v.r)], ["Years", String(v.yrs)]]);
    case "x-drawdown":
      return facts("The fund", [["Invested", usd(v.F)], ["Rate per year", pct(v.r)], ["Withdrawal each year", usd(v.W)]]);
    default:
      return undefined;
  }
}

export function visualFor(q, subtopic, difficulty) {
  const p = q && q.params;
  if (!p || !p.values) return undefined;
  if (difficulty === "expert") return expert(p);
  switch (subtopic) {
    case "depreciation": return depreciation(p, difficulty);
    case "loans": return loans(p);
    case "annuities-savings": return annuities(p, difficulty);
    default: return undefined;
  }
}
