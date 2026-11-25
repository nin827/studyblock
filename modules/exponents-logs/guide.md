# Exponents & Logarithms: how to solve

## General

- Index laws (same base): `aᵐ × aⁿ = aᵐ⁺ⁿ`, `aᵐ ÷ aⁿ = aᵐ⁻ⁿ`, `(aᵐ)ⁿ = aᵐⁿ`, and `a⁰ = 1`.
- `log_b x = y` means `bʸ = x`. The log is the power.
- Give exact answers as whole numbers or simplest fractions; round only when the question says so.

## Index laws

1. Check the bases match. If not, rewrite them as powers of one base (4 = 2², 27 = 3³).
2. Multiplying adds indices, dividing subtracts them, and a power of a power multiplies them.
3. A negative index means a reciprocal: `a⁻ⁿ = 1/aⁿ`.
4. A fractional index `a^(p/q)` means: take the q-th root, then raise to the power p.

Example: `8^(−2/3)`: the cube root of 8 is 2, `2² = 4`, and the minus sign gives 1/4.

**Watch out:** `2³ × 2⁴` is `2⁷`, not `4⁷` and not `2¹²`. The base stays the same and only the indices combine.

**Expert: several powers at once.** Work out each power separately (root first, then the power; a negative power flips it), then multiply or divide the fractions. To find an unknown index, write every number as a power of one prime, combine the left side into one index, and set the two indices equal: `4ⁿ × 2³ = 32` → `2^(2n + 3) = 2⁵` → n = 1. A power outside a bracket applies to the number and the letter inside: `(9x⁴)^(1/2) = 3x²`.

## Logarithms

1. To evaluate `log_b x`, write x as a power of b. The index is the answer.
2. If b and x are both powers of the same number, write both that way: `log₄ 8` is the power with `(2²)ʸ = 2³`, so y = 3/2.
3. Combine logs with the same base first: adding multiplies, subtracting divides, and a number in front becomes a power.
4. For a value that isn't exact, use change of base: `log_b x = log x / log b`.

Example: `log₂ 12 − log₂ 3 = log₂ 4 = 2`.

**Watch out:** `log a + log b` is `log(ab)`, not `log(a + b)`.

**Expert: log equations.** Combine the logs into one, write it in index form and solve the quadratic. Then check each root in the original brackets: a log of a negative number (or 0) doesn't exist, so that root is rejected. Example: `log₂ x + log₂(x + 2) = 3` → `x(x + 2) = 8` → x = 2 or x = −4, and only x = 2 works.

**Expert: different bases.** Change every log to ln (`log_b x = ln x / ln b`), write each number as a power of a prime and cancel: `log₄ 27 × log₃ 2 = (3 ln 3 / 2 ln 2) × (ln 2 / ln 3) = 3/2`. Given `log_b x = u`, split the expression with the log laws and replace `log_b x` by u.

## Solving equations

1. If both sides are powers of the same base, set the indices equal and solve.
2. A log equation `log_b (expression) = k` becomes `expression = bᵏ`.
3. Otherwise, get the power on its own (divide by any number in front), then take logs: `x = log N / log a`.
4. Round only at the end.

Example: `3 × 2ˣ = 48` gives `2ˣ = 16`, so x = 4.

**Watch out:** in `3 × 2ˣ`, divide by 3 first. It is not `6ˣ`.

**Expert: hidden quadratics.** `a^(2x) = (aˣ)²`, so put y = aˣ and solve the quadratic in y. aˣ is always positive: reject a negative y, then take logs. **Different bases:** take logs of both sides, expand, collect the x terms and factor out x. **Inequalities:** `(2/3)ⁿ < 0.01` gives `n log(2/3) < log 0.01`; log(2/3) is negative, so dividing by it reverses the sign. Round up for the smallest whole n.

## Growth & decay

1. Growth by r% each period multiplies by `1 + r/100`; decay by r% multiplies by `1 − r/100`.
2. After n periods: `A = P × (multiplier)ⁿ`.
3. Half-life T: the amount left after time t is `N₀ × (1/2)^(t/T)`. Doubling works the same way with 2.
4. To find a time, divide by the starting amount, then take logs: `t = log(A/P) / log(multiplier)`.

Example: $200 at 5% for 2 years gives `200 × 1.05² = 220.5`, which is $220.50.

**Watch out:** a 20% loss each year is a multiplier of 0.8, not 0.2. And "after how many whole years" means round the time up.

**Expert: setting it up yourself.** From two data points, the yearly multiplier is `g = (N₂/N₁)^(1/years between)`; the rate is 100 × (g − 1), and predictions multiply on from the latest value. For two investments, set `P₁ × g₁ᵗ = P₂ × g₂ᵗ`, rearrange to `(g₂/g₁)ᵗ = P₁/P₂` and take logs. With a half-life, working backwards multiplies by `2^(t/T)`, and "how long until p% remains" doesn't depend on the starting amount.
