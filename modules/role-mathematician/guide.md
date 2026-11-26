# How to solve: Applied scenarios (Mathematician)

## General

- Read the whole scenario first, then work the parts in order: later parts usually reuse earlier results.
- Keep full precision in the calculator and round only when you type each answer. Using an earlier rounded answer still gives the same later answer.
- Store each result in a calculator row (`_mean`, `_sd`, `_p`, `_k`) so you can reuse it.
- Check the units and the rounding asked for in each part.

## Quality-control report

**Summary statistics**

1. Mean = sum of the values ÷ n.
2. Population standard deviation = √( Σ(x − mean)² ÷ n ). The same value comes from √( Σx² ÷ n − mean² ).
3. z-score = (reading − mean) ÷ standard deviation. Below the mean gives a negative z.
4. Flag the reading when |z| > 2 (ignore the sign).

**Defect rate and binomial model**

1. p = total defects ÷ total items inspected.
2. For a box of n items: P(X = k) = C(n, k) × p^k × (1 − p)^(n − k). "At most 1" means P(0) + P(1) = (1 − p)^n + n × p × (1 − p)^(n − 1).
3. Expected count = number of items × p.
4. Compare the probability with the target (for example 0.9).

## Pricing insurance risk

**Life table**

1. lₓ is the number alive at age x. Deaths in a year = lₓ at the start − lₓ at the end.
2. Survival probability over 3 years = l at the end ÷ l at the start.
3. Expected deaths in a group = group size × (deaths in that year ÷ starting l).
4. Expected present value of a benefit paid at the end of the year of death: add, for each year k, benefit × (deaths in year k ÷ starting l) ÷ (1 + i)^k.
5. A loading of L% multiplies the expected present value by (1 + L/100).

**Frequency and severity**

1. Average claim = Σ(claim size × its probability).
2. Expected yearly loss = probability of a claim × average claim.
3. P(at least one claim among m) = 1 − (1 − p)^m.
4. Present value of the same amount paid at the end of each of n years = amount × (1 − (1 + i)^−n) ÷ i, or add amount ÷ (1 + i)^k for k = 1 … n.

## Growth and decay model

**Growth by a fixed percentage**

1. P(t) = P₀ × rᵗ. Two years apart: r² = later ÷ earlier, so r = √(later ÷ earlier). Growth rate = (r − 1) × 100%.
2. Time to a target T: rᵗ = T ÷ P₀, so t = ln(T ÷ P₀) ÷ ln r (log base 10 works too).
3. Rate of change: dP/dt = P₀ × rᵗ × ln r.

**Half-life**

1. A(t) = A₀ e^(−kt). From the half-life h: k = ln 2 ÷ h.
2. Amount after t: A₀ e^(−kt), which equals A₀ × ½^(t ÷ h).
3. Time to fall to F%: t = ln(100 ÷ F) ÷ k.
4. Rate of decrease: |dA/dt| = k × A(t).

## Checking a derivation

1. Redo each step yourself, starting from the line before it, not from the original problem.
2. The first line whose number doesn't follow from the line above is the wrong step. Later lines may look strange but follow correctly from it.
3. Redo that step from the line above it: that is the corrected number.
4. Finish the derivation correctly for the final answer, and check it in the original problem.

Things to check in each kind:

- **Equation with a fraction:** the order is subtract, multiply, divide, add. Watch signs when moving a number across.
- **Tangent to y = ax² + bx + c at x = p:** the gradient is 2ap + b (don't drop the 2), the point is ap² + bp + c (square p, don't double it), and the intercept is q = y − m × p. A quick check: q always equals c − ap².
- **Variance:** recompute Σx and Σx² from the data. Variance = Σx² ÷ n − mean², with the mean squared.
