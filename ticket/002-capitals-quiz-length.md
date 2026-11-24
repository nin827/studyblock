# 002 — Quiz length for small CSV banks

**Status:** resolved (2026-11-24): every module gets "All topics" and "All difficulties" options that draw from the whole bank (10 questions for CSV subjects).
**Raised:** 2026-11-24

## Question
The `capitals` CSV module has only 4–5 rows per subtopic × difficulty, so `questionsPerQuiz` is set to 4 instead of 10.

How should small static banks behave?

## Options
- **Keep per-module length** (current) — quiz is short but has no repeats.
- **Fall back to mixed difficulty** — fill up to N with rows from neighbouring difficulties.
- **Add an "All" difficulty / "All" subtopic** option for CSV modules to draw from the whole bank.
- **Grow the bank** — add more rows (more content work).
