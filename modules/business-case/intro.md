# Business Case

Short scenarios from small businesses: a café, a bike shop, a print shop, a SaaS startup. Some ask a single question; about half are **multi-part**: one scenario with two or three labelled answers, such as a *Calculation* and a *Recommendation*. Inventory and hiring scenarios ask things like "Should it reorder now?" or "Hire or don't hire?". Work through it in the calculator, one labelled row per step. Amounts are in dollars.

**Multi-part questions.** Each part has its own field. Fill them all, then press **Check**: the question counts as correct only when every part is right, and the feedback marks each part. Enter jumps to the next empty part. The calculator's **Use** fills the part you were last in. A *Recommendation* always follows a rule stated in the scenario, for example "invests only if the NPV is positive" or "healthy if LTV:CAC is at least 3:1", so work out the number first and apply the rule to it.

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
| `reorder point = daily demand × lead time + safety stock` | order when stock falls to this level |
| `ordering cost = demand / order size × cost per order` | yearly cost of placing orders |
| `holding cost = order size / 2 × holding cost per unit` | yearly cost of keeping stock (average stock is half an order) |
| `EOQ = √(2 × demand × cost per order / holding cost)` | order size that balances the two |
| `hire cost = salary × (1 + overhead) / 12` | full monthly cost of a new employee |
| `net gain = extra sales × margin - hire cost` | what a hire adds each month |
| `payback months = up-front cost / net gain` | round **up** to whole months |

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
| Hard | Target profits, churn, NPV over 3 years, EOQ costs, hiring payback, 3–4 steps with 2-decimal answers |
| Expert | Multi-part cases that combine ideas or work backwards from a goal: see below |

**Expert** cases are all multi-part and need more setting up. You work **backwards** from a goal (the lowest price that hits a profit target, the highest churn investors accept, the yearly inflow that makes NPV zero, the order cost an EOQ implies, the sales a hire must bring in), or combine two ideas: margin of safety and operating leverage, a two-product sales mix, blended versus per-channel CAC, two projects with different lives and resale values, discounted payback, a price change against expected sales, a special order with limited capacity, a bulk discount versus the EOQ, and an employee versus a contractor.

> [!TIP]
> Store each given value in its own row (`_price`, `_fixed`, …) and build later rows from those labels. If you mistype a number, fix that one row and every row after it updates. Rows also carry over to the next question. Each prompt says how to round: "round up to whole units" means `ceil`, and "2 decimal places" accepts answers within 0.005. Type percents and ratios as plain numbers: `25` for 25%, `3.5` for 3.5:1.
