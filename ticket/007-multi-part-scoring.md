# 007 — Scoring multi-part questions

**Status:** open (built with the default below)
**Raised:** 2026-11-24

Business Case questions can have several answer fields (for example *Calculation* + *Recommendation*).

**Default:** the question counts as correct only if **every** part is right. The review still shows a ✓ or ✗ for each part, so you can see what you got right.

**Alternatives**
- **Partial credit:** 2 of 3 parts right counts as 0.67 of a question, and quiz scores become decimals (for example 6.5 / 8).
- **Weighted:** the calculation is worth more than the recommendation, or the other way round.
