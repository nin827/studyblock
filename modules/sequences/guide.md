# How to solve: Sequences and Series

## General

- Decide the type first. If the terms **add** the same amount each time, the sequence is arithmetic (difference d). If they **multiply** by the same amount, it is geometric (ratio r).
- Term n uses **n - 1** steps from the first term, not n.
- Store a, d or r and n in calculator rows (`_a`, `_d`, `_r`, `_n`); `^` is a power, so `_a * _r^(_n - 1)` works as written.
- Give plain numbers with a minus sign for negatives, and just n when the answer is a term number. Round to 2 decimal places only when asked.

## Arithmetic sequences

1. Find d by subtracting a term from the one after it, `u2 - u1`.
2. Any term: `u(n) = a + (n - 1) × d`.
3. Formula `pn + q`: p = d, and q = a - d (the "zeroth term").
4. Which term equals a value: solve `a + (n - 1) × d = value` for n. For "first term above a limit", solve the equation and then round **up**.
5. Two terms known: d = (difference in values) ÷ (difference in positions).

Example: for 5, 8, 11, …, d = 3, so u(20) = 5 + 19 × 3 = 62.

**Watch out:** a decreasing sequence has a negative d. Keep the sign when you subtract.

**Expert: terms written in x.** Consecutive terms have equal differences, so `2 × (2nd) = 1st + 3rd`. Expand, solve for x, then substitute x back to get the actual terms. Example: x + 1, 2x, 4x - 3 → 4x = 5x - 2 → x = 2, so the terms are 3, 4, 5.

**Expert: a term and a sum.** Write two equations, `a + (p - 1)d = u(p)` and `n/2 × (2a + (n - 1)d) = S`. Divide the sum by n/2, double the term equation, and subtract to eliminate a.

**Expert: first negative term.** Solve `a + (n - 1)d < 0` and round up. If the result is already whole, that term is exactly 0, which is not negative, so the first negative term is the next one.

## Geometric sequences

1. Find r by dividing a term by the one before it, `u2 / u1`.
2. Any term: `u(n) = a × r^(n - 1)`.
3. Which term equals a value: divide by a, then find which power of r you get. That power is n - 1.
4. Two terms known: `r^(gap) = later term ÷ earlier term`, then take the root. Step back to a by dividing by r.
5. First term above a limit: use logs, `n = log(limit / a) / log(r) + 1`, then round up.

Example: for 3, 6, 12, …, r = 2, so u(6) = 3 × 2⁵ = 96.

**Watch out:** a negative r makes the signs alternate, so check your answer's sign.

**Expert: terms written in x.** Equal ratios give `(2nd)² = 1st × 3rd`. Expand both sides: the x² terms cancel, leaving a linear equation. Example: x, x + 6, x + 18 → (x + 6)² = x(x + 18) → 12x + 36 = 18x → x = 6, so the terms are 6, 12, 24 and r = 2.

**Expert: growth and decay.** A rise of p% each year multiplies by `1 + p/100`, and a fall by `1 - p/100`. After t years the value is `V × r^t`: the start is year 0, so the power is t. For the first year past a limit, solve `V × r^t = limit` with logs and round up. When r < 1, log(r) is negative.

## Series

1. Arithmetic sum: `S(n) = n / 2 × (2a + (n - 1) × d)`, or `n × (first + last) / 2` when you know the last term.
2. If you know only the last term, count the terms first: `(last - first) / d + 1`.
3. Geometric sum: `S(n) = a × (r^n - 1) / (r - 1)`. The power is n here.
4. Sum to infinity (only when -1 < r < 1): `S = a / (1 - r)`. To find r instead, use `r = 1 - a / S`.

Example: 1 + 2 + … + 100 has 100 terms, so S = 100 × (1 + 100) / 2 = 5050.

**Watch out:** counting from 7 to 30 gives 30 - 7 + 1 = 24 numbers. Don't forget the + 1.

**Expert: how many terms make a sum.** Set `n/2 × (2a + (n - 1)d) = S`, multiply out to `dn² + (2a - d)n - 2S = 0` and solve. Keep the positive whole-number root.

**Expert: running totals that grow by a percentage.** The amounts form a geometric sequence. For when the total first passes T, rearrange `a(r^m - 1)/(r - 1) > T` to `r^m > 1 + T(r - 1)/a`, then use logs and round up.

**Expert: sum to infinity backwards.** With S and the 2nd term u₂: a = S(1 - r) and `a × r = u₂`, so `S r² - S r + u₂ = 0`. Its two roots add to 1; keep the one the question allows.

**Expert: a block of terms.** Terms m to M: count = M - m + 1. Find the first and last terms of the block, then `S = count × (first + last) / 2`. A sum written with Σ works the same way: substitute the first and last k.
