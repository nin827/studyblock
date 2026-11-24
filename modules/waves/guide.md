# How to solve: Waves

## General

- Convert to SI units first: Hz, m, s. Then convert the result to the unit the question asks for.
- Prefixes: kHz × 10³, MHz × 10⁶, THz × 10¹²; ms × 10⁻³, μs × 10⁻⁶; cm × 10⁻², mm × 10⁻³, nm × 10⁻⁹.
- Light and radio waves travel at 3 × 10⁸ m/s.
- The calculator's trig works in degrees. Round only at the end, as the question says.

## Wave equation

1. Write down what you know: speed `v`, frequency `f`, wavelength `λ`.
2. Use `v = f × λ`, or rearrange it: `f = v / λ` and `λ = v / f`.
3. Convert the result to the asked unit.

Example: 340 m/s at 170 Hz gives λ = 340 / 170 = 2 m.

**Watch out:** a MHz or kHz frequency has to be turned into Hz before you divide.

## Period and frequency

1. Period and frequency are reciprocals: `T = 1 / f` and `f = 1 / T`, with T in seconds.
2. **Counting waves:** N = f × t, so f = N / t and T = t / N.
3. **Oscilloscope:** period = divisions × time per division. Convert it to seconds, then f = 1 / T.
4. **Speed from a period:** v = λ / T.

Example: f = 50 Hz gives T = 1 / 50 = 0.02 s = 20 ms.

**Watch out:** a period in ms must be divided by 1000 before you take 1 / T.

## Refraction

1. **Index from speeds:** `n = c / v`, so `v = c / n`. Working in units of 10⁸ m/s, c = 3.
2. **Snell's law:** `n1 sin θ1 = n2 sin θ2`, with angles from the normal. From air (n = 1): `sin r = sin i / n`.
3. To get an angle, take the inverse sine: `asin(…)`.
4. **Critical angle:** `sin C = n2 / n1` (going into the lower index), or `sin C = 1 / n` into air.

Example: from air into glass (n = 1.5) at 30°: r = asin(sin 30 / 1.5) ≈ 19.5°.

**Watch out:** don't divide the angles themselves; divide their sines.

## Thin lenses

1. Use `1/f = 1/u + 1/v`, with real-is-positive signs: u > 0, a real image has v > 0, a virtual image has v < 0, and a diverging lens has f < 0.
2. Rearrange for the unknown, e.g. `1/v = 1/f - 1/u`, then take the reciprocal.
3. **Size ratio:** magnification = |v| ÷ u, and image height = object height × |v| ÷ u.
4. **Power:** P = 1 / f with f in **metres**, in dioptres.

Example: u = 15 cm and f = 10 cm give 1/v = 1/10 − 1/15 = 1/30, so v = 30 cm.

**Watch out:** remember the final reciprocal: 1/v is not v.
