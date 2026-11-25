# Ecology: how to solve

## General

- Put each number from the question in its own calculator row, then build the answer from those rows.
- Check the units before you calculate: quadrat and field areas must both be in m².
- Keep full precision until the end, then round as the question asks.
- Type percentages without the % sign.

## Energy transfer

1. Efficiency (%) = energy passed to the next level ÷ energy at this level × 100.
2. To go up one level, multiply by the efficiency as a decimal (10% = 0.1).
3. Count the transfers: producers are level 1, so level 3 is two transfers away.
4. Energy not passed on = energy in − energy passed on (lost as heat, waste and uneaten parts).

Example: 20 000 kJ in grass with 10% transfers gives 2000 kJ to rabbits and 200 kJ to foxes.

**Watch out:** multiply once per transfer, not once per level.

**Expert: backwards and budgets.** Going up a chain, divide by each efficiency; energy needed ÷ energy fixed per m² gives an area (1 ha = 10 000 m²). Round a number of animals down: part of an animal can't live there. For one consumer, energy eaten = faeces + respiration + new biomass, and only the new biomass can be passed on.

## Population estimates

1. Mark–recapture: `N = (M × C) ÷ R` (marked first × caught second ÷ marked recaught).
2. Quadrats: find the mean count per quadrat.
3. Divide the field area by one quadrat's area to find how many quadrats would fit, then multiply by the mean.
4. A 50 cm × 50 cm quadrat is 0.25 m².

Example: 40 marked, 50 caught later, 10 of them marked: N = 40 × 50 ÷ 10 = 200.

**Watch out:** 50 cm × 50 cm is 0.25 m², not 2500 (that's cm²) and not 0.5.

**Expert: when assumptions fail.** If marked animals die before the second sample, use the number still alive as M; ignoring the deaths gives an estimate that is too high. Trap-happy marked animals make R too big, so the estimate comes out too low. To plan a study, set M × C ÷ N equal to the number of marked recaptures you want and round M up.

## Population growth

1. Change in a year = births − deaths (+ arrivals − departures, if any).
2. Growth rate (%) = change ÷ starting population × 100. Per-1000 rates: (birth rate − death rate) ÷ 10 gives % per year.
3. Steady % growth multiplies each year: `P = P0 × (1 + r/100)ⁿ`.
4. Doubling every T years: number of doublings = time ÷ T, then multiply by 2 that many times.

Example: 500 growing by 10% a year for 2 years: 500 × 1.1² = 605.

**Watch out:** % growth compounds; don't add the first year's increase every year.

**Expert: rates and removals.** From two counts n years apart, the yearly factor is `(later ÷ earlier)^(1/n)` and the rate is (factor - 1) × 100. To reach a target, use `ln(target ÷ now) ÷ ln(factor)` and round up. With a fixed number removed each year, grow first, then subtract; the population holds steady when the removals equal one year's growth. Doubling time is `ln 2 ÷ ln(factor)`.

## Biodiversity

1. Species richness = number of different species (count each only once).
2. Percentage cover = covered squares ÷ total squares × 100.
3. Simpson's index: find N (total individuals), then add up n(n − 1) for each species.
4. `D = 1 − (that sum) ÷ (N(N − 1))`. A higher D means a more diverse site.

Example: counts 3, 2, 1 → N = 6, Σ n(n − 1) = 6 + 2 + 0 = 8, D = 1 − 8 ÷ 30 ≈ 0.73.

**Watch out:** a species with only one individual adds 0 to the sum (1 × 0), but still counts in N.

**Expert: evenness and working backwards.** For the same N and number of species, D is highest when the individuals are shared out as evenly as possible (counts differ by at most 1); evenness = D ÷ that highest D. With only two species, try values of n above N ÷ 2 in the formula until D matches.
