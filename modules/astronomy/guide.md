# Astronomy: how to solve

## General

1. Write down the values and constants the question gives you, with their units.
2. Convert to matching units (usually km and seconds) before you multiply or divide.
3. Pick the relation: distance = speed × time, T² = a³, model ÷ real = scale, angle = size ÷ distance.
4. Keep full precision and round only at the end, as the question asks.

Example: 3 AU in km is `3 × 1.5e8 = 4.5e8` km.

**Watch out:** "million km" means × 10⁶ km. Leaving it out makes the answer a million times too small.

## Distances & light

1. Change the distance to km (AU × 1.50 × 10⁸, ly × 9.46 × 10¹²).
2. Time = distance ÷ speed, giving seconds.
3. Change the seconds into what is asked (÷ 60 for minutes, ÷ 3600 for hours, ÷ 3.16 × 10⁷ for years).
4. For A × 10ⁿ answers, divide by 10ⁿ and round A.

Example: 2 AU at light speed: `2 × 1.5e8 / 3e5 = 1000` s, about 16.7 minutes.

**Watch out:** a radio "round trip" (there and back) covers the distance twice.

**Expert: parallax and planet distances.** Distance in parsecs = 1 ÷ parallax (arcseconds); multiply by 3.26 for light-years. For two planets on circular orbits, they are closest on the same side of the Sun (subtract the orbit radii) and farthest on opposite sides (add them).

## Orbits

1. For the Sun, use T² = a³ (T in years, a in AU). Another star of mass M: T² = a³ ÷ M.
2. To find T, cube a and take the square root. To find a, square T and take the cube root.
3. For two planets around the same star, T₂ = T₁ × (a₂ ÷ a₁)^1.5.
4. For orbital speed, change r to km and T to seconds, then speed = 2πr ÷ T.

Example: a = 4 AU gives T² = 64, so T = 8 years.

**Watch out:** the cube root of x is `x^(1/3)` in the calculator; don't use `x^1/3`, which divides by 3.

**Expert: other stars and ellipses.** Around a star of mass M, `T² = a³ ÷ M` (T in years), so `M = a³ ÷ T²`; for two planets of the same star, compare them with `T² ∝ a³` and the mass cancels. For an ellipse, a is the average of the closest and farthest distances, so they add up to 2a.

## Scale models

1. Find the scale: model size ÷ real size, in the same units.
2. Multiply every real length by that scale.
3. Change the result into the unit asked (10 mm = 1 cm, 100 cm = 1 m, 100 000 cm = 1 km).

Example: if 1 cm stands for 2 million km, Mars at 228 million km goes `228 / 2 = 114` cm from the Sun.

**Watch out:** a scale of 1 : N needs both sides in the same unit, so convert km to m or cm first.

**Expert: one length fixes the scale.** Whatever is given on both sides (the farthest planet at the end of a field, or the size of the model Earth) gives model length per real length. Multiply every other real length by that, keeping units matched, then convert to the unit asked for.

## Apparent size & gravity

1. Small angles: angle in radians = diameter ÷ distance (same units).
2. Degrees = radians × 180 ÷ π; arcseconds = degrees × 3600. Reverse these steps to find a size or a distance.
3. Gravity compared with Earth = mass ratio ÷ (radius ratio)².
4. Weight = mass × g, and g there = gravity ratio × 9.8 N/kg.

Example: twice Earth's mass and twice its radius gives `2 / 2² = 0.5` times Earth's gravity.

**Watch out:** mass (kg) stays the same everywhere; only weight (N) changes.

**Expert: eclipses and G × M ÷ R².** Work out the Moon's and the Sun's angular sizes the same way; if the Moon looks bigger the eclipse is total, if smaller it is annular. For gravity, use `g = G × M ÷ R²` with R in metres; backwards, `R = √(G × M ÷ g)`.
