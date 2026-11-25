# Vectors & Movement: how to solve

## General

- Work on x and y separately whenever you can. Most vector sums are two ordinary sums.
- Check the axes: these questions use y up unless they say "screen coordinates" (y down).
- Put negative numbers in brackets when you substitute, and keep full precision until the final rounding.

## Vectors

1. To add or subtract, combine matching components: x with x, y with y.
2. To scale by k, multiply both components by k.
3. Length: `√(x² + y²)`. The distance between two points is the length of their difference.
4. Normalise: divide each component by the length. Dot product: `ax·bx + ay·by`; its sign says in front (+), behind (−) or exactly to the side (0).

Example: a = (3, −2) and b = (1, 4) give a + b = (4, 2) and a · b = 3 − 8 = −5.

**Watch out:** the dot product is one number, not a vector, and the vector from A to B is B − A, not A − B.

**Expert: bounce, closest point, perpendicular.** A mirror bounce off a wall with normal n is `r = v − 2 × (v·n / n·n) × n`. The closest point on a segment A→B is at `t = (AP · AB) / (AB · AB)`, clamped into 0 to 1 (below 0 means A, above 1 means B). To make `a + k·b` perpendicular to c, solve `a·c + k(b·c) = 0`.

## Movement

1. Position after t seconds: `start + velocity × t`, for each axis.
2. Each frame, move `speed × delta time`, where `delta time = 1 / fps`.
3. Frames needed: distance ÷ (distance per frame), rounded up.
4. Semi-implicit Euler: each step do `v = v + a·dt` first, then `p = p + v·dt` with the new v. Keep a table.

Example: 300 px/s at 60 fps moves 300 / 60 = 5 px per frame.

**Watch out:** without delta time, movement speeds up on faster monitors: px per second = px per frame × fps.

**Expert: intercepts, dashes and jumps.** To hit a moving target, set `|d + u·t| = s·t` (d = target − shooter), square it into `(u·u − s²)t² + 2(d·u)t + d·d = 0` and keep the positive root. A dash that speeds up to a top speed covers `vmax² / (2a)` while speeding up, then `vmax` per second. For a step-by-step jump, after n steps `y = y0 + n·v0·dt + a·dt²·n(n + 1)/2`: the peak is at the last step with v above 0, and it lands on the first step with y ≤ 0.

## Interpolation

1. Lerp: `a + (b − a) × t`. t = 0 gives a, t = 1 gives b.
2. Inverse lerp: `t = (value − a) / (b − a)`.
3. Remap: inverse lerp in the first range, then lerp in the second.
4. Smoothing by a fraction f per frame leaves `(1 − f)` of the gap each frame: after n frames, `x = target − (target − x0) × (1 − f)^n`.

Example: lerp(10, 30, 0.25) = 10 + 20 × 0.25 = 15.

**Watch out:** smoothing never quite reaches the target. Each frame removes a fraction of what is left, not a fixed amount.

**Expert: new frame rates, curves and easing.** Smoothing tuned at F1 fps keeps `(1 − f)^F1` of the gap per second; at F2 fps use `r = (1 − f)^(F1/F2)` per frame and close `1 − r`. A quadratic Bézier is three lerps with the same t (P0→P1, P1→P2, then between those); it heads along Q1 − Q0. Easing: clamp t into 0 to 1 first, then `s = t² × (3 − 2t)`, then lerp with s.

## Angles & direction

1. Find the angle to the x axis: `atan(|y| / |x|)`.
2. Fix it for the quarter the vector is in: top-right as it is, top-left 180° − it, bottom-left 180° + it, bottom-right 360° − it.
3. Heading to a target: use the vector target − start.
4. Rotate 90° counter-clockwise: (x, y) → (−y, x). Clockwise: (x, y) → (y, −x). 180°: (−x, −y).

Example: (−3, 3) points at 135°, and rotating (2, 5) by 90° counter-clockwise gives (−5, 2).

**Watch out:** in screen coordinates (y down), flip the sign of y before measuring a y-up angle. For a turn, wrap the difference into −180 to 180.

**Expert: any rotation, turn rates and view cones.** Rotating counter-clockwise by φ: `x' = x·cos φ − y·sin φ`, `y' = x·sin φ + y·cos φ` (clockwise is a negative φ). With a turn rate, the time is |turn| ÷ rate, and the heading part-way is facing ± rate × time, wrapped into 0 to 360. A guard sees you only if the angle between its facing and you is at most half the cone **and** you are within range.
