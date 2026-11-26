# Business Analyst scenarios: how to solve

## General

- Read the whole case first, then answer the parts in order: later parts use earlier results.
- The calculator starts with the scenario's numbers as rows (`_cost`, `_equity`, …). Build each step on those labels and round only when you type an answer.
- Every rule you need is in the question. Apply it exactly: "at least" includes the limit, and "above" doesn't.

## Sales review

1. **Query:** write one line of SQL, keywords in capitals, text in single quotes (`'Snacks'`), one space each side of `=`, `<>`, `>`, `<`. A column can be compared with another column: `WHERE rev_2026 > rev_2025`. Always write `ASC` or `DESC` after the `ORDER BY` column.
2. Run the query in your head: the first row it returns (or its only row) is the product under review.
3. **Market growth** uses the **markets** table, not the product's own sales: `(size_2026 - size_2025) / size_2025 * 100`.
4. **Relative market share** = the product's `rev_2026` ÷ its `rival_2026`. Above 1 means it leads its market.
5. **Boston matrix** (high growth = above 10%, high share = above 1):

| | High share | Low share |
| --- | --- | --- |
| **High growth** | Star | Question mark |
| **Low growth** | Cash cow | Dog |

Strategy: hold stars, harvest cash cows, build question marks, divest dogs.

**Watch out:** the product's own sales change (`rev_2025` → `rev_2026`) is not the market's growth.

## Loan application review

1. Current assets = inventory + trade receivables + cash.
2. **Current ratio** = current assets ÷ current liabilities. **Acid test** = (current assets − inventory) ÷ current liabilities.
3. **Gearing** = non-current liabilities ÷ (non-current liabilities + equity) × 100.
4. Compare with last year: for liquidity ratios below about 2, higher is better; for gearing, lower is better.
5. The bank's decision checks both limits separately. If any test fails, the answer names which one failed (or both).

**Watch out:** the acid test leaves out inventory, because stock may be slow to sell.

## Investment case

1. Each year's inflow = extra units × contribution per unit.
2. **Payback:** add the inflows until they cover the cost. For the last part-year, months = amount still needed ÷ that year's inflow × 12. Answer in months in all (2 years 6 months = 30).
3. **NPV** = sum of (inflow × discount factor) − cost. The cost is paid today, so it is not discounted.
4. **Sensitivity:** if every inflow falls by x%, their present value falls by x% too, so x = NPV ÷ present value of the inflows × 100.
5. Apply the board's three tests in the order given; a rejection names the first one that fails.

## Launch and pricing plan

1. **Segment size** = population × first share × second share, for example `_pop * _share1 * _share2`.
2. **Sales change** = (this year − last year) ÷ last year × 100. Then find the stage with the rules below.
3. **Contribution** for each plan = segment × take-up % × (price − unit cost). The gap is Plan S minus Plan P.
4. The team's rule: Decline → don't launch; Growth or Maturity → penetration pricing; Introduction → the plan with the higher contribution.

Life-cycle rules:

- **Introduction:** sales rising but a loss.
- **Growth:** up 15% or more with a profit.
- **Maturity:** within 5% of last year with a profit.
- **Decline:** down 5% or more.

**Watch out:** in Growth and Maturity, the rule picks penetration pricing even when skimming earns more.
