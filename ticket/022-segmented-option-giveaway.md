# 022 — Segmented choices can give the answer away

**Status:** open (found in review, 2026-11-26)
**Raised:** 2026-11-26

## The problem
The segmented-choice rule is that wrong options differ from the answer in 1 to n−1 columns. When every wrong option differs in exactly **one** column, the answer is always the option whose value in each column appears most often across the options. So a learner can pick it by counting, without knowing the topic.

Example: Teacher Expert+ "Error type | Next step" with 5 options. The answer's type and next step each appear 3 times, and every other value appears at most twice.

This affects Choose mode only. Build mode draws its decoys from the other options, then extras, so it has the same bias, but less clearly.

## Options
1. **Mixed distances (suggested):** at least one wrong option differs in 2+ columns, and the answer's value isn't the most common in at least one column. The engine checks this in `segChoiceSpec`, and the generator redraws if it fails.
2. **Balanced values:** each value in a column appears the same number of times across the options, where the column has enough plausible values.
3. Leave it as is, and rely on Build being the default mode.

## Scope
Every generator with segmented choices: the converted subject questions (CLAUDE.md "Block-list choices") and the role modules. Changing it changes those questions per seed.
