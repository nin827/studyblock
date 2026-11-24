# How to solve: Trigonometry

## General

- Draw a quick sketch, mark the angle you know or want, and name each side from that angle.
- Everything is in degrees. The quiz calculator's `sin`, `cos`, `tan`, `asin`, `acos` and `atan` already work in degrees.
- Keep full precision: store each step in a calculator row (`_angle`, `_hyp`, …) and round to 2 decimal places only at the end.
- Type angles as plain numbers without the ° sign.

## Exact values

1. Remember two triangles: the half-square triangle (sides 1, 1, √2, angles 45°) and the half-equilateral triangle (sides 1, √3, 2).
2. In the half-equilateral triangle, the side of length 1 is opposite the smallest angle and √3 is opposite the largest acute angle.
3. Read off SOH CAH TOA from the right triangle. 0° and 90° come from the unit circle: cos is x and sin is y.
4. For a "work out" question, replace each part with its exact value, then do the arithmetic.

Example: sin(30°) = 1/2, so 4 × sin(30°) = 2.

**Watch out:** `sin(45°)²` means square the value: (√2/2)² = 1/2.

## Right triangles: sides

1. Name the sides from the angle: **hypotenuse** (opposite the right angle), **opposite** and **adjacent**.
2. Pick the ratio that links the side you know and the side you want: SOH (sin = opp / hyp), CAH (cos = adj / hyp) or TOA (tan = opp / adj).
3. If the unknown is on top of the ratio, multiply, as in `_hyp * sin(_angle)`. If it is on the bottom, divide, as in `_opp / sin(_angle)`.
4. In word problems, a ladder is the hypotenuse, and an angle of depression equals the angle of elevation from the other end. Add an eye height at the end.

Example: hypotenuse 10 cm, angle 30°, so the opposite side is 10 × sin(30) = 5 cm.

**Watch out:** the hypotenuse is always the longest side. If your answer for a leg is longer than the hypotenuse, you multiplied when you should have divided.

## Right triangles: angles

1. Name the two sides you know from the angle θ.
2. Choose sin, cos or tan from those two sides.
3. Work out the ratio, then use the inverse function: `asin(_opp / _hyp)`, `acos(_adj / _hyp)` or `atan(_opp / _adj)`.
4. For isosceles triangles, split the triangle down the middle first: the adjacent side is half the base.

Example: opposite 5 and adjacent 5, so θ = atan(1) = 45.

**Watch out:** an acute angle is between 0° and 90°. A tiny answer such as 0.79 means the calculator gave radians.

## Sine and cosine rules

1. **Sine rule** (`a / sin(A) = b / sin(B)`): use it when you know a side and its opposite angle, plus one more side or angle.
2. **Cosine rule** (`a² = b² + c² - 2bc × cos(A)`): use it for two sides and the angle between them. Take the square root at the end.
3. Three sides: `cos(A) = (b² + c² - a²) / (2bc)`, then use acos. The side you subtract is the one opposite the angle.
4. Area: `½ × a × b × sin(C)`, where C is the angle between a and b. With three sides, find an angle first.
5. If you need the third angle, remember that angles add up to 180°.

Example: b = 3, c = 4 and A = 90°, so a² = 9 + 16 - 0 = 25 and a = 5.

**Watch out:** side a is always opposite angle A. Match each side with the angle across from it, not the one next to it.
