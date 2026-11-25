# Calculus Basics: how to solve

## General

- Power rule for derivatives: `axⁿ` becomes `n·a·xⁿ⁻¹`. A constant becomes 0.
- Power rule for integrals: `axⁿ` becomes `a·xⁿ⁺¹ / (n + 1)`. Add `+ C` when there are no limits.
- Rewrite roots and fractions as powers first: `√x = x^(1/2)` and `3/x² = 3x⁻²`.
- Work term by term, and keep track of minus signs.

## Derivatives

1. Rewrite every term as a power of x.
2. For each term, multiply by the power, then lower the power by 1.
3. Drop the constant term.
4. For a value like `f'(2)`, substitute x = 2 into `f'(x)`. For `f''`, differentiate twice first.

Example: `f(x) = 4x³ − 5x + 2` gives `f'(x) = 12x² − 5`, so `f'(1) = 7`.

**Watch out:** lower the power after multiplying by the old one. `x⁻²` becomes `−2x⁻³`, not `−2x⁻¹`.

**Expert:** for a missing coefficient k, differentiate with k as a letter, substitute the x-value and solve the linear equation. For `(ax² + bx + c)/√x`, divide each term by `x^(1/2)` first; no quotient rule is needed. f is increasing where `f'(x) > 0`: factorise f'(x) and test the sign on each side of its roots. The point of inflection of a cubic is where `f''(x) = 0`.

## Gradients & tangents

1. Differentiate to get `dy/dx`.
2. Gradient at a point: substitute its x-value into `dy/dx`.
3. Where the gradient is k: solve `dy/dx = k` for x.
4. Tangent at x = a: m = `dy/dx` at a, the point is (a, y(a)), then `c = y − m × a`.
5. A normal is perpendicular to the tangent, so its gradient is `−1/m`.

Example: `y = x² + 3x` at x = 1 has m = 2 × 1 + 3 = 5 and y = 4, so c = 4 − 5 = −1 and the tangent is `y = 5x − 1`.

**Watch out:** the gradient comes from `dy/dx`, but the point's y-value comes from the curve itself.

**Expert:** if the tangent is given, it fixes two things at the point: the gradient (`dy/dx` = m) and the y-value. To find where a tangent meets a cubic again, set curve = tangent; the touching point is a double root, so the three roots add up to −(x² coefficient) ÷ (x³ coefficient). The triangle a tangent makes with the axes has legs |c| and |x-intercept|.

## Stationary points

1. Differentiate and solve `dy/dx = 0`. Divide out any common factor, then factorise.
2. Substitute each x into the curve (not into `dy/dx`) to get y.
3. Find `d²y/dx²` and substitute each x.
4. Positive means a minimum point; negative means a maximum point.

Example: `y = x² − 6x + 1` gives `dy/dx = 2x − 6 = 0`, so x = 3, y = −8, and `d²y/dx² = 2 > 0`: a minimum.

**Watch out:** don't guess from the order. When the x³ coefficient is negative, the minimum comes first (smaller x) and the maximum second, so classify each point with `d²y/dx²`.

**Expert:** to build a cubic from its stationary points p and q, write `dy/dx = 3a(x − p)(x − q)`, expand and compare coefficients; a known point gives the constant. For optimisation, write the quantity in one variable (use the fixed volume or fence length to eliminate the other), differentiate, set to 0 and reject impossible answers. If `d²y/dx² = 0`, the test can't decide: check the sign of dy/dx just left and right of the point (same sign means a point of inflection).

## Integration

1. Rewrite every term as a power of x.
2. For each term, raise the power by 1 and divide by the new power. A constant k becomes kx.
3. Indefinite integral: add `+ C`.
4. Definite integral from a to b: work out F(b) − F(a), upper minus lower.
5. Area: if the curve dips below the x-axis, split at the roots and add the sizes of the parts.

Example: `∫ (6x² + 2) dx = 2x³ + 2x + C`, and from 0 to 1 it is (2 + 2) − 0 = 4.

**Watch out:** an integral of a part below the x-axis comes out negative; an area is never negative.

**Expert:** the area between a curve and a line is ∫ (top − bottom) dx between the x-values where they meet. To find a curve from `dy/dx` and a point, integrate, then substitute the point to find C. For an unknown limit or coefficient, integrate with the letter kept in and solve the equation you get.
