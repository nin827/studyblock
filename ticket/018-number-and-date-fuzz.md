# 018 — Close whole numbers (per module) and date answers

**Status:** resolved (2026-11-26): built; years-between keeps close credit
**Raised:** 2026-11-26

## Request
- Whole numbers can get close-answer credit too, with sensitivity set per module.
- History: 1 off → 50%, 2 off → 0.
- Support month/year and day/month/year answers.

## Defaults chosen

**Per-module number profile** (`module.json` `"fuzzyNumber"`, a question can override it):

| Profile | Rule | Used for |
|---|---|---|
| `exact` | no close credit | modules where the exact whole number is the skill: arithmetic, fractions, number bases, number theory, algorithms, code, SQL, networking, boolean logic, data representation, chemistry balancing, elements, music, probability counts, sequences |
| `relative` (default) | decimals **and** whole numbers: ≤ 0.1% → 90%, ≤ 1% → 75%, ≤ 2% → 50% | physics, business, geography, astronomy, economics, statistics, medical and other measurement subjects |
| `years` | 1 off → 50%, 2+ off → 0 (no year 0: 1 BC → AD 1 is 1 off) | timelines, world history, inventions |

- Small whole numbers stay effectively exact under `relative`, because 2% of 49 is under 1. For example, 245 vs 243 (0.8%) → 75%, but 12 vs 13 → 0.
- **Timelines "years between"** answers also use `years`, so a classic no-year-zero slip (off by 1) earns 50%. *Alternative:* keep years-between exact.

**Dates:** a new answer type `date` with a precision of year, month or day.
- Accepted formats include `July 1969`, `Jul 1969`, `7/1969`, `1969-07`, `20 July 1969`, `July 20, 1969`, `20th July 1969`, `20/7/1969` and `1969-07-20`.
- Numeric dates are read **day first** (UK style), and a live "Read as: 20 July 1969" preview shows how the app understood it. *Alternative:* month first, or month names only.
- **Credit:** 1 unit off at the answer's precision → 50% (1 month off for month/year, 1 day off for full dates, including across month or year ends); otherwise 0.
- CSV modules gain an optional `type` column (`date`), with the precision taken from the answer's own format.
- New hand-checked date rows go in World History and Inventions.

## Update: leniency is a number (user, 2026-11-26)

The named profiles are replaced by a number. 0 means exact, 1 means normal (the bands above), and higher means more lenient; fractions are allowed.
- **Text:** `"fuzzy": n`. Up to floor(n) typos are allowed, and each extra typo costs 15% more (never below 25%). `false` still means 0.
- **Numbers:** `"fuzzyNumber": n` scales the relative bands. For example, at 2: ≤ 0.2% → 90%, ≤ 2% → 75%, ≤ 4% → 50%.
- **Years and dates:** `"fuzzyNumber": { "mode": "years", "level": n }`. Being up to n years (or months/days) off earns 50%.
- **Smooth years and dates** (user): off by d earns 1 − d / (level + 1). At level 1: 1 off → 50%, 2 off → 0. At level 2: 1 off → 67%, 2 off → 33%, 3 off → 0.

## Decision (user, 2026-11-26)
Timelines "years between" keeps years-mode close credit (1 off → 50%), as built.
