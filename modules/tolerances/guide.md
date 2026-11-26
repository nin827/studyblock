# Tolerances & Fits: how to solve

## General

- Turn every size into its **upper and lower limits** first. Most questions are then a subtraction.
- Keep signs on deviations: 25 −0.020 / −0.041 means 24.980 to 24.959 mm.
- If the decimals get fiddly, work in µm (× 1000) and convert back at the end.
- Give answers in mm to 3 decimal places unless told otherwise.

## Limits and tolerances

1. Upper limit = nominal + upper deviation. Lower limit = nominal + lower deviation (both keep their signs).
2. Tolerance = upper limit − lower limit = upper deviation − lower deviation.
3. Bilateral: the band spreads on both sides of nominal (one + and one − deviation). Unilateral: it sits on one side (a deviation of 0 counts as that side).
4. A part is in spec if lower limit ≤ size ≤ upper limit.
5. Mean (mid) size = (upper + lower) ÷ 2; the equal ± tolerance is half the band.
6. To rework an oversize shaft to the middle of the band, the diameter drops by measured − mid size, and the depth of cut is half that.

Example: 40 +0.025 / −0.010 has limits 40.025 and 39.990, so the tolerance is `0.025 − (−0.010) = 0.035` mm.

**Watch out:** minus a negative deviation adds.

## Fits

1. Largest clearance = largest hole − smallest shaft.
2. Smallest clearance = smallest hole − largest shaft.
3. Both clearances positive: **clearance fit**. Both negative: **interference fit**. One of each: **transition fit**.
4. Interference is the same subtraction the other way round: shaft − hole.
5. Mean clearance = mid hole − mid shaft = (largest clearance + smallest clearance) ÷ 2.
6. To design a shaft for a clearance range: largest shaft = smallest hole − minimum clearance, and smallest shaft = largest hole − maximum clearance. For an interference range, add instead.

Example: hole 25.000 to 25.021, shaft 24.967 to 24.980. Largest clearance `25.021 − 24.967 = 0.054`, smallest `25.000 − 24.980 = 0.020`: a clearance fit.

**Watch out:** the shaft tolerance left over is the clearance range minus the hole tolerance. If that comes out negative, no shaft can meet the spec.

## Tolerance stack-up

1. Worst case: the tolerances of a chain all add, whatever the direction of the dimensions.
2. Gap = housing − sum of the parts. Largest gap: longest housing, shortest parts. Smallest gap: shortest housing, longest parts.
3. The parts always fit only if the smallest gap is at least 0.
4. With unequal deviations, use each part's limits rather than a ± value.
5. RSS (root sum square) = √(t₁² + t₂² + …). It is smaller than the worst case and is what most real assemblies stay within.
6. To budget one unknown tolerance: smallest gap = nominal gap − every tolerance. Set it to the minimum allowed and solve.

Example: parts ±0.02, ±0.03 and ±0.05 give a worst case of `±0.10` and an RSS of `√(0.0004 + 0.0009 + 0.0025) ≈ ±0.062` mm.

**Watch out:** the housing's own tolerance belongs in the stack too.

## Measurement error

1. Absolute error = |measured − true|. Percentage error = absolute error ÷ true × 100.
2. Reading uncertainty = ± half the smallest division. Percentage uncertainty = that ÷ the reading × 100.
3. Zero error or offset = what it reads on a known size − the true size. Corrected size = reading − offset.
4. Repeated readings: report the mean ± half the range.
5. With uncertainty u, the true size is somewhere in corrected size ± u. It is certainly in spec only if that whole range is inside the limits.
6. A common workshop rule: the instrument's uncertainty should be no more than a tenth of the tolerance band.

Example: a micrometer reads +0.003 when closed and 12.457 on a part, so the part is `12.457 − 0.003 = 12.454` mm.

**Watch out:** a negative zero error means the reading is too low, so the correction adds.
