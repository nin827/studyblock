# How to solve: Finance

## General

- Write rates as decimals inside formulas: 6% = 0.06.
- For monthly questions, use `_i = _rate / 100 / 12` and `_n = _years * 12`. Keep them in their own calculator rows, because most formulas use both twice.
- Payments and deposits happen at the **end** of each period.
- Round to 2 decimal places at the end. When a loan question says to round the payment to the cent, use that rounded payment in every later step.

## Depreciation

1. **Straight-line:** yearly charge = `(cost - salvage) / life`.
2. Straight-line book value after k years = `cost - charge × k`.
3. **Reducing balance:** book value = `cost × (1 - rate)^years`. The charge in year k = rate × the book value at the start of that year.
4. **Rate from two values:** `rate = 1 - (book / cost)^(1 / years)`.

Example: $10000 cost, $2000 salvage, 4-year life gives a charge of 8000 / 4 = $2000 a year.

**Watch out:** with reducing balance, the percentage applies to what's left, never to the original cost again.

**Expert.** *Selling early:* find the straight-line book value on the sale date; gain or loss = sale price − book value (negative for a loss). *Working backwards:* cost = book value ÷ (1 − rate)^years. *Crossover year:* the reducing-balance charge in year y is cost × (1 − rate)^(y − 1) × rate; check the years in order until it drops below cost ÷ life.

## Loans

1. Work out the monthly rate `_i` and the number of payments `_n`.
2. **Payment:** `_loan * _i / (1 - (1 + _i)^(-_n))`.
3. **Total interest:** payment × n − loan (with the payment rounded to the cent).
4. **Balance after k payments:** `_loan * (1 + _i)^_k - _payment * ((1 + _i)^_k - 1) / _i`.

Example: $12000 at 6% for 3 years gives i = 0.005 and n = 36, so the payment is $365.06.

**Watch out:** forgetting to divide the rate by 12 gives a far too big payment.

**Expert.** *Paying off early:* interest saved = payment × remaining payments − balance. *Biggest loan for a budget:* loan = budget × (1 − (1 + i)^-n) ÷ i. *Interest in payment k:* the balance after k − 1 payments × i, rounded to the cent; the rest of the payment is principal. *Overpaying:* with a bigger payment, the number of payments is −ln(1 − loan × i ÷ payment) ÷ ln(1 + i), rounded up (the last one is smaller).

## Annuities and savings

1. Find the rate per period `_i` and the number of periods `_n` (yearly or monthly, as the question says).
2. **Future value of deposits:** `deposit × ((1 + i)^n - 1) / i`.
3. **Present value of payments:** `payment × (1 - (1 + i)^-n) / i`.
4. **Deposit for a goal:** `goal × i / ((1 + i)^n - 1)`. **Years to a goal:** `n = ln(1 + goal × i / deposit) / ln(1 + i)`, rounded **up**.
5. With a starting balance, grow it separately (`start × (1 + i)^n`) and add the deposits' future value.

Example: $1000 a year for 3 years at 5% grows to 1000 × (1.05³ − 1) / 0.05 = $3152.50.

**Watch out:** payment × number of periods ignores interest; it's only a rough check.

**Expert.** *Save, then draw an income:* the pot from the deposits becomes the "loan" in the payment formula for the payout months. *Starting late:* the same deposit-for-a-goal formula with fewer months. *Deposits at the start of each month:* multiply the end-of-month answer by (1 + i). *How long a fund lasts:* n = −ln(1 − fund × i ÷ withdrawal) ÷ ln(1 + i), rounded down for full withdrawals; what's left = fund × (1 + i)^n − withdrawal × ((1 + i)^n − 1) ÷ i.
