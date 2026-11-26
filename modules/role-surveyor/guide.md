## General

Surveying scenarios chain simple steps, so work in order and keep the signs and units straight (metres, degrees, mm for misclosures).

1. Read the stated rules first: the bearing convention, the accuracy limit, the plot rules, the allowance.
2. Coordinates are Easting (E, across) then Northing (N, up). A bearing is measured clockwise from north, from 0° to 360°.
3. Round only as each part asks. The chained answers here do not change if you use an earlier rounded answer.
4. For a verdict, find the number first, then compare it with the stated rule.

## Bearings and coordinates

For a line of length d on bearing θ: ΔE = d × sin θ and ΔN = d × cos θ. The signs come out right by themselves if you use the full bearing: west half (180° to 360°) gives negative ΔE, south half (90° to 270°) gives negative ΔN. New coordinate = old coordinate + change.

To go back from coordinates to a line: distance = √(ΔE² + ΔN²). The bearing is tan⁻¹(ΔE ÷ ΔN) as an acute angle, then put it in the right quadrant: add 180° if ΔN is negative, add 360° if ΔE is negative and ΔN positive. A line at right angles to a bearing θ has bearing θ + 90° (or θ − 90°).

## Traverse closure

In a closed traverse the east components add up to zero, and so do the north components. What is left over is the closing error: ΣΔE and ΣΔN, keeping every sign. The misclosure is √(ΣΔE² + ΣΔN²).

Linear accuracy is 1 in N with N = perimeter ÷ misclosure, where the perimeter is the sum of the leg lengths. A bigger N is a better traverse. Working backwards: the largest misclosure for 1 in M is perimeter ÷ M.

## Plot area by coordinates

Shoelace: for the corners in order, add up (Eᵢ × Nᵢ₊₁ − Eᵢ₊₁ × Nᵢ), going back to the first corner at the end; the area is half the size of the sum. 1 ha = 10 000 m².

Plots: take the share left after roads, divide by the plot size and round down. Working backwards for a missing Northing: write the sum with the unknown, set it equal to twice the stated area (it is positive when the corners are listed anticlockwise) and solve.

## Level books and misclosure

Height of instrument: HI = RL of the point read on the backsight + BS; the RL of any other point seen from that setup = HI − its reading. At a change point the new HI starts from the change point's RL.

Rise and fall: change = BS − FS (or reading before − reading after); positive is a rise. Arithmetic check: ΣBS − ΣFS = last RL − first RL.

Misclosure = computed RL of the closing benchmark − its known RL. The run is accepted if the size of the misclosure is no more than the allowance, here 10 mm × √K with K in km.
