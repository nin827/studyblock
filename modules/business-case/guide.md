# Business Case: how to solve

## General

- Put each number from the scenario in its own calculator row (`_price`, `_fixed`, …), then build every later row from those labels.
- Work the **number** first. A *Recommendation* always follows a rule stated in the scenario, so apply that rule to your number.
- Follow the rounding the question asks for: "round up to whole units" means `ceil`, and "2 decimal places" accepts answers within 0.005.
- Type percents and ratios as plain numbers: `25` for 25%, `3.5` for 3.5:1.

## Break-even

1. Find the margin per unit: `_margin = _price - _unit_cost`. Add up the cost parts first if there are several.
2. Break-even units = `ceil(_fixed / _margin)`. With a target profit, use `ceil((_fixed + _target) / _margin)`.
3. For revenue, multiply the rounded-up units by the price, or use `_fixed / _cm_ratio` when you are given the margin ratio.
4. If the price changes, work out the new price first, then the new margin.

Example: price $4.50, cost $1.20, fixed $3300 → margin 3.30 → 3300 / 3.30 = **1000 cups**.

**Watch out:** always round units **up**. One unit short is still a loss.

## Unit economics

1. Contribution margin ratio = `(_price - _unit_cost) * 100 / _price`.
2. LTV = profit per order × orders per year × years. If you are given revenue and a gross margin, keep only the margin share.
3. With monthly churn, lifetime = `1 / (_churn / 100)` months, and LTV = monthly gross profit × lifetime.
4. LTV:CAC = `_ltv / _cac`. The most you can spend on CAC = `_ltv / _target`.

**Watch out:** divide LTV by CAC, not the other way round.

## Investment returns

1. ROI = `(total return - total cost) * 100 / total cost`. Include installation in the cost, and resale in the return.
2. Payback = cost ÷ net cash per year. Turn monthly profit into yearly profit and subtract upkeep first.
3. NPV: discount each cash flow by `(1 + _rate)^year`, add them up, then subtract the cost paid today.

**Watch out:** the cost paid today is not discounted.

## Pricing decisions

1. Pricing options: profit = `(price - variable cost) * quantity` for each option. Fixed costs cancel out.
2. Make or buy, or two suppliers: work out the **total cost** of each option. Revenue is the same, so the cheaper one wins.
3. Apply any discount first (`_list * (1 - _discount)`), and remember setup, shipping or delivery fees.
4. "How much more profit" is the difference between the two totals, as a positive number.

**Watch out:** a price rise with falling sales needs both the new price **and** the new quantity.

## Inventory

1. Reorder point = daily demand × lead time + safety stock. Find the daily demand first if you are given yearly or weekly demand.
2. Ordering cost = `(demand / order size) * cost per order`. Holding cost = `order size / 2 * holding cost per unit`.
3. EOQ = `sqrt(2 * demand * order cost / holding cost)`, rounded to the nearest whole unit.
4. The cost at the EOQ uses the same two formulas, with the EOQ as the order size.

**Watch out:** average stock is **half** the order size.

## Hiring

1. Full monthly cost = `_salary * (1 + _overhead / 100) / 12`.
2. Extra gross profit = extra sales × margin ÷ 100.
3. Net monthly gain = extra gross profit − full monthly cost.
4. Payback months = `ceil(_upfront / _net)`.

**Watch out:** include the overheads. The salary alone understates the cost.
