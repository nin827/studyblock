# Finance

How money changes value over time: assets that lose value as they're used, loans repaid in monthly instalments, and savings built from regular deposits. Amounts are in dollars. Simple and compound interest on a single sum live in **Business Math**.

| Formula | Meaning |
| --- | --- |
| `straight-line charge = (cost - salvage) / life` | the same depreciation every year |
| `book value = cost - charge × years` | straight-line value after some years |
| `book value = cost × (1 - rate)^years` | reducing balance: the same percentage of what's left each year |
| `rate = 1 - (book value / cost)^(1 / years)` | reducing-balance rate from two values |
| `i = annual rate / 12`, `n = years × 12` | monthly rate and number of monthly payments |
| `payment = loan × i / (1 - (1 + i)^-n)` | monthly payment on an amortising loan |
| `total interest = payment × n - loan` | interest over the life of the loan |
| `balance = loan × (1 + i)^k - payment × ((1 + i)^k - 1) / i` | still owed after k payments |
| `FV = deposit × ((1 + i)^n - 1) / i` | future value of regular deposits |
| `PV = payment × (1 - (1 + i)^-n) / i` | what a stream of payments is worth today |

**Conventions.** Payments and deposits happen at the **end** of each period. A monthly rate is the annual rate divided by 12, compounded monthly. When a loan question says to round the payment to the cent, use the rounded payment in every later step, just as a bank would. Write rates as decimals inside the formulas, so 6% becomes 0.06.

## Worked example

A $12000 loan at 6% a year is repaid over 3 years with monthly payments. What is the monthly payment? Round to 2 decimal places.

- `_loan = 12000`
- `_rate = 6`
- `_years = 3`
- `_i = _rate / 100 / 12` → 0.005
- `_n = _years * 12` → 36
- `_payment = _loan * _i / (1 - (1 + _i)^(-_n))` → 365.0632, which rounds to **$365.06**

| Level | What to expect |
| --- | --- |
| Easy | Straight-line depreciation with whole numbers, short loans, yearly deposits |
| Medium | Reducing balance, longer loans and total interest, monthly deposits and withdrawals |
| Hard | Finding a depreciation rate, remaining loan balances, saving toward a goal |
| Expert | Multi-part problems that combine steps: see below |

**Expert** questions have two or three answers each: selling an asset early (book value, then gain or loss), working back from a book value to the cost, straight-line versus reducing balance, paying a loan off early, the biggest loan a budget allows, splitting a payment into interest and principal, overpaying a loan, saving then drawing an income, the cost of starting to save late, deposits at the start versus the end of the month, and how long a fund lasts. Keep full precision between steps and round each answer at the end.

> [!TIP]
> The calculator handles `^`, `ln` and `round(x, 2)`. Store the rate and the number of periods in their own rows (`_i`, `_n`) and reuse them: most of these questions use both twice.
