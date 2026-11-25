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

**Expert.** Work backwards to a price: `price = variable cost + (fixed + target) / units`, rounded **up** to the cent. Margin of safety = profit ÷ contribution × 100, and operating leverage = contribution ÷ profit (a 10% rise in sales lifts profit by leverage × 10%). For a sales mix, treat one mix set as a single product, find the whole sets needed, then multiply by each product's share.

## Unit economics

1. Contribution margin ratio = `(_price - _unit_cost) * 100 / _price`.
2. LTV = profit per order × orders per year × years. If you are given revenue and a gross margin, keep only the margin share.
3. With monthly churn, lifetime = `1 / (_churn / 100)` months, and LTV = monthly gross profit × lifetime.
4. LTV:CAC = `_ltv / _cac`. The most you can spend on CAC = `_ltv / _target`.

**Watch out:** divide LTV by CAC, not the other way round.

**Expert.** To work backwards from a target ratio, write LTV = target × CAC and solve for the unknown: the highest churn is `gross profit / (target * CAC) * 100`. CAC payback = `ceil(CAC / monthly gross profit)`. With two channels, blended CAC = total spend ÷ total customers, but also check each channel's own CAC: a good blend can hide a weak channel.

## Investment returns

1. ROI = `(total return - total cost) * 100 / total cost`. Include installation in the cost, and resale in the return.
2. Payback = cost ÷ net cash per year. Turn monthly profit into yearly profit and subtract upkeep first.
3. NPV: discount each cash flow by `(1 + _rate)^year`, add them up, then subtract the cost paid today.

**Watch out:** the cost paid today is not discounted.

**Expert.** The annuity factor `(1 - (1 + r)^(-n)) / r` turns an equal yearly flow into today's money, so the flow that makes NPV zero is `cost / factor`. Discount a resale value once, at the end of the project's life. For discounted payback, keep a running total of the discounted flows and find the first year it reaches the cost.

## Pricing decisions

1. Pricing options: profit = `(price - variable cost) * quantity` for each option. Fixed costs cancel out.
2. Make or buy, or two suppliers: work out the **total cost** of each option. Revenue is the same, so the cheaper one wins.
3. Apply any discount first (`_list * (1 - _discount)`), and remember setup, shipping or delivery fees.
4. "How much more profit" is the difference between the two totals, as a positive number.

**Watch out:** a price rise with falling sales needs both the new price **and** the new quantity.

**Expert.** For a price change, profit stays the same when sales × margin stays the same: a rise can afford a sales fall of `(1 - old margin / new margin) * 100`%, and a cut needs a rise of `(old margin / new margin - 1) * 100`%. For a special order, count its margin, minus any setup, minus the full margin on regular sales it pushes out when capacity runs short.

## Inventory

1. Reorder point = daily demand × lead time + safety stock. Find the daily demand first if you are given yearly or weekly demand.
2. Ordering cost = `(demand / order size) * cost per order`. Holding cost = `order size / 2 * holding cost per unit`.
3. EOQ = `sqrt(2 * demand * order cost / holding cost)`, rounded to the nearest whole unit.
4. The cost at the EOQ uses the same two formulas, with the EOQ as the order size.

**Watch out:** average stock is **half** the order size.

**Expert.** With a bulk discount, compare **total** yearly cost including purchases: `demand * price + demand / Q * order cost + Q / 2 * holding`, where holding is a percent of the (discounted) price. Working backwards from an EOQ, square both sides: order cost = `EOQ^2 * holding / (2 * demand)`. At the EOQ, ordering cost equals holding cost.

## Hiring

1. Full monthly cost = `_salary * (1 + _overhead / 100) / 12`.
2. Extra gross profit = extra sales × margin ÷ 100.
3. Net monthly gain = extra gross profit − full monthly cost.
4. Payback months = `ceil(_upfront / _net)`.

**Watch out:** include the overheads. The salary alone understates the cost.

**Expert.** To find the sales a hire needs, add the up-front cost spread over the payback months to the monthly cost, then divide by the margin (`/ (_margin / 100)`) and round up. Against a contractor, the break-even hours are the employee's monthly cost ÷ the hourly rate: more hours than that, and the employee is cheaper.
