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

## Geometric sequences

1. Find r by dividing a term by the one before it, `u2 / u1`.
2. Any term: `u(n) = a × r^(n - 1)`.
3. Which term equals a value: divide by a, then find which power of r you get. That power is n - 1.
4. Two terms known: `r^(gap) = later term ÷ earlier term`, then take the root. Step back to a by dividing by r.
5. First term above a limit: use logs, `n = log(limit / a) / log(r) + 1`, then round up.

Example: for 3, 6, 12, …, r = 2, so u(6) = 3 × 2⁵ = 96.

**Watch out:** a negative r makes the signs alternate, so check your answer's sign.

## Series

1. Arithmetic sum: `S(n) = n / 2 × (2a + (n - 1) × d)`, or `n × (first + last) / 2` when you know the last term.
2. If you know only the last term, count the terms first: `(last - first) / d + 1`.
3. Geometric sum: `S(n) = a × (r^n - 1) / (r - 1)`. The power is n here.
4. Sum to infinity (only when -1 < r < 1): `S = a / (1 - r)`. To find r instead, use `r = 1 - a / S`.

Example: 1 + 2 + … + 100 has 100 terms, so S = 100 × (1 + 100) / 2 = 5050.

**Watch out:** counting from 7 to 30 gives 30 - 7 + 1 = 24 numbers. Don't forget the + 1.
