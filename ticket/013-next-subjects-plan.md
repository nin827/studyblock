# 013 — Next subjects: plan

**Status:** open (batch 3 built 2026-11-25; new domains and fact-list growth still open)
**Raised:** 2026-11-25

## Where things stand

50 subjects in 11 domains. Counts per domain: Math 9, Science 7, Computing 7, Business 4, Biology 4, Medical 5, Geography 3, Language 3, Game Dev 3, Music 3, History 2.

- **Strong:** Math, Science, Computing. These are calculation-heavy, so the questions can be generated and checked by a second method.
- **Thin:** History (2), Geography (3) and Language (3). All are fixed fact lists, so they can repeat and every fact needs checking by hand.
- **Rule of thumb:** prefer subjects where answers can be **computed and independently verified**. Fact lists need careful sourcing and grow slowly.

## Batch 3 (recommended): 16 subjects, all generated and verifiable

| Domain | Subject | Subtopics (sketch) |
|---|---|---|
| Math | **Calculus basics** | derivatives of polynomials, gradient at a point, stationary points, simple integrals and areas |
| Math | **Exponents & logarithms** | index laws, log laws, solving `a^x = b`, growth/decay |
| Math | **Number theory** | primes and factors, GCD/LCM, divisibility, modular arithmetic |
| Math | **Coordinate geometry** | gradient, midpoint, distance, line equations, parallel/perpendicular |
| Science | **Thermal physics** | specific heat, latent heat, temperature scales, heat transfer arithmetic |
| Science | **Radioactivity** | half-life, decay counts, nuclear notation (A/Z) |
| Science | **Gases & pressure** | P = F/A, Boyle/Charles/combined gas law, liquid pressure |
| Science | **Astronomy** | light-years and AU, orbital period (Kepler's third law), scale models, apparent size |
| Computing | **Data representation** | image/sound/video file sizes, colour depth, ASCII/Unicode codes, compression ratio |
| Computing | **SQL queries** | predict the result of SELECT/WHERE/ORDER BY/COUNT/GROUP BY on a small generated table |
| Computing | **Cryptography basics** | Caesar/Vigenère, modular inverse, toy RSA, key-space size |
| Business | **Economics** | supply and demand equilibrium, elasticity, GDP growth, inflation/real values |
| Geography | **Map skills** | scale and distance, grid references, bearings, time zones, contour gradient |
| History | **Timelines** | years between events, BC/AD arithmetic, centuries/decades, ordering events (from a checked date list) |
| Game Dev | **Pixels & colour** | hex ↔ RGB, alpha blending, resolution and aspect ratio, sprite-sheet frames |
| Game Dev | **Balancing & progression** | XP curves, damage scaling, DPS/TTK, economy sinks and faucets |

Notes:
- **Time zones:** use fixed UTC offsets stated in the question, with no daylight saving.
- **Timelines:** uses a small fixed date list that is checked once. The questions are computed from it.

## Possible new domains (batch 4, if wanted)

- **Logic & Puzzles:**
  - knights and knaves, ordering puzzles, syllogisms, number patterns
  - all generated and checked by brute force
- **Everyday Math:**
  - time and dates, recipe scaling, travel and fuel, unit prices and discounts, tipping and splitting bills
  - Overlaps a little with Business Math, but aimed at daily life.

## Deliberately not planned

- **Medical:** dosage or drug calculations, which would break the Medical scope rule.
- **Foreign-language vocabulary:** hard to verify, and needs accents and scripts in typed answers.
- **Flags, maps and anything visual:** the app uses no image assets.
- **Ear training:** the app has no audio.
- **Country-specific tax or law:** it goes out of date and varies by place.

## Open choices

1. Build batch 3 as listed, or a subset first?
2. Add one or both of the new domains?
3. **Fact-list growth:** for History, Geography and Language, should agents add more checked CSV rows? It's slower and needs a careful review pass.
