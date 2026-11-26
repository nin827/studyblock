# Software Engineer scenarios: how to solve

## General

- Read the whole scenario first, then answer the parts in order: later parts often reuse an earlier answer.
- Use the calculator rows that are filled in (`_n`, `_mbps`, …) and add your own for each step, so a later part can reference them.
- Work money in whole cents where you can, and only round where the part says.
- Units: bytes × 8 = bits; megabits ÷ Mbps = seconds; 1 MB = 1,000,000 bytes.

## Speed up an API endpoint

1. **SQL:** split the WHERE into its two tests and tick each sample row that passes both. `<>` means "not equal"; `>` leaves the value itself out and `>=` keeps it.
2. **Indexes:** without an index the database reads rows one by one (n), or sorts them all (n log n). A B-tree index is a sorted, balanced tree: one lookup, or finding the smallest key, is one root-to-leaf path (log n), and reading every row in key order is a walk along the leaves (n).
3. **Binary search:** each comparison halves what is left. The worst case is ⌊log₂ n⌋ + 1 comparisons: find the power of two just at or below n. In the calculator, `log(_n) / log(2)` gives log₂ n.
4. **Transfer:** scale the sample count up (matches × production rows ÷ 8), multiply by bytes per row and by 8 for bits, then divide by Mbps × 1,000,000.

Example: 3 of 8 sample rows on 800,000 rows → 300,000 rows × 200 bytes × 8 = 480,000,000 bits; at 100 Mbps that is 4.8 s.

## Reconcile a payment ledger

1. **SQL:** keep the rows for the account with kind 'card' and add the amounts. Add cents as whole numbers to avoid rounding drift.
2. **Fees:** work out each payment's fee on its own (amount × rate ÷ 100, rounded to the cent, plus the fixed fee), then add them. Rounding once on the total can differ by a cent or more.
3. **Floats:** most cent values can't be stored exactly in binary, so a float total can print a hair above or below the true value. `int()` cuts towards zero: a total a hair *below* loses a whole cent, a hair *above* survives.
4. **Fix:** a correct line rounds to the nearest cent (per amount, or on the total) instead of truncating, and works in cents. Check each option against the amounts: `int(total) * 100` loses the cents, `round(total)` gives dollars, not cents.

**Watch out:** Python 3's `round(x)` with one argument returns a whole number.

## Profile a hot loop

1. **Trace:** make a small table of i against how many times the hot line runs, then add up. `range(i + 1, n)` runs n − 1 − i times; a `while j < n: j *= 2` loop from 1 runs ⌈log₂ n⌉ times.
2. **Big-O:** time follows the total number of steps; memory follows how many items end up in the list. Drop constants (3n is O(n)) and halving (n(n − 1)/2 is O(n²)).
3. **Size:** bits per pair ÷ 8 = bytes per pair. Count the pairs for the production n with the same rule as the trace, multiply, divide by 1,000,000 for MB.
4. **Upload:** MB × 8 = megabits; ÷ Mbps = seconds.

Example: two 64-bit integers = 16 bytes; 1,000,000 pairs = 16 MB; at 100 Mbps that is 1.28 s.

## Ship an international payout

1. **Fee:** percent of the amount, rounded to the cent, then take the larger of that and the minimum fee.
2. **Conversion:** subtract the fee from the dollars, multiply by the rate, then round **down** to the cent (drop the extra digits).
3. **Settlement:** find the start day first: the same day only on a weekday before 16:00, otherwise the next weekday. Then count that many weekdays forward, skipping Saturday and Sunday.
4. **Batch:** groups = payouts ÷ requests at a time, rounded **up**; seconds = groups × ms per group ÷ 1000.

Example: submitted Friday at 17:30, T+2 → starts Monday, arrives Wednesday.
