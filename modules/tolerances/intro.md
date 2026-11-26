# Tolerances & Fits

No part is ever made to an exact size, so a drawing says how far it may vary. This module covers reading those limits, how a hole and a shaft go together, how small errors add up along a chain of parts, and how far you can trust a measurement.

| Idea | Meaning |
| --- | --- |
| nominal size | the size named on the drawing, e.g. Ø25 mm |
| deviations | how far the limits sit from nominal: 25 +0.021 / 0 means 25.000 to 25.021 mm |
| tolerance | upper limit − lower limit (the width of the band) |
| bilateral / unilateral | the band spreads on both sides of nominal / sits on one side only |
| clearance | hole − shaft; negative means interference |
| worst-case stack | tolerances along a chain add up |
| RSS stack | √(sum of the squared tolerances): what most real stacks stay within |
| absolute / percentage error | the size of measured − true, and that ÷ true × 100 |

**Conventions:** all sizes are in mm, and answers are given to 3 decimal places (0.001 mm = 1 µm) unless the question says otherwise. A size exactly on a limit counts as in spec. A reading's uncertainty is half the instrument's smallest division. Fits use explicit limits, not ISO fit tables.

> [!TIP]
> Work in micrometres if the decimals get fiddly: 0.025 mm is 25 µm, so 25.012 − 24.987 is just 12 + 13 = 25 µm.

| Level | What to expect |
| --- | --- |
| Easy | One limit, a tolerance band, an in-spec check, one clearance, one stack total, one error |
| Medium | Deviations to limits, unilateral or bilateral, fits from deviations, gaps in a housing, calibration offsets |
| Hard | Batches of parts, deviations from limits, mean clearance, measured pairs, unequal deviations, percentage uncertainty |
| Expert | Machine setting and rework, designing shaft limits for a fit, RSS against worst case, tolerance budgets, accept/reject with uncertainty, choosing an instrument |
