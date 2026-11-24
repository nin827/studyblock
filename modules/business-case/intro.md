# Business Case

Short scenarios from small businesses: a café, a bike shop, a print shop, a SaaS startup. Each one asks a single question that takes a few steps to answer. Work through it in the calculator, one labelled row per step. Amounts are in dollars.

| Formula | Meaning |
| --- | --- |
| `margin = price - variable cost` | contribution margin per unit |
| `CM ratio = margin / price` | share of each sales dollar left after variable costs |
| `break-even units = fixed / margin` | round **up** to whole units |
| `break-even revenue = fixed / CM ratio` | sales needed to cover fixed costs |
| `target units = (fixed + target) / margin` | units for a profit goal, rounded up |
| `LTV = profit per order × orders per year × years` | customer lifetime value |
| `lifetime = 1 / churn` | average lifetime when a share of customers cancels each period |
| `LTV:CAC = LTV / CAC` | value of a customer versus the cost of winning one |
| `ROI = (return - cost) / cost × 100` | net gain as a percent of the cost |
| `payback = cost / net cash per year` | years to earn the cost back |
| `NPV = CF1 / (1 + r) + CF2 / (1 + r)^2 + … - cost` | today's value of future cash, minus the cost paid now |

## Worked example

A café sells coffee for $4.50 a cup. Each cup costs $1.20 in variable costs, and fixed costs are $3300 a month. How many cups must it sell each month to break even? Round up to whole cups.

- `_price = 4.50`
- `_unit_cost = 1.20`
- `_fixed = 3300`
- `_margin = _price - _unit_cost` → 3.30
- `_units = ceil(_fixed / _margin)` → **1000 cups**

| Level | What to expect |
| --- | --- |
| Easy | Round numbers, whole-number answers, about 2 steps |
| Medium | Prices with cents, rounding up to whole units, about 3 steps |
| Hard | Target profits, churn, NPV over 3 years, 3–4 steps with 2-decimal answers |

**Tip:** store each given value in its own row (`_price`, `_fixed`, …) and build later rows from those labels. If you mistype a number, fix that one row and every row after it updates. Rows also carry over to the next question. Each prompt says how to round: "round up to whole units" means `ceil`, and "2 decimal places" accepts answers within 0.005. Type percents and ratios as plain numbers: `25` for 25%, `3.5` for 3.5:1.
