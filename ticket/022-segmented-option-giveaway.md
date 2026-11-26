# 022 — Segmented choices can give the answer away

**Status:** resolved (2026-11-26): option 1, mixed distances, built
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

## Notes from review (2026-11-26)
- New generators already follow option 1 (mixed distances).
- **Two columns:** option 1 needs a wrong option that differs in both columns, which breaks the spec's "differ in 1 to n−1 columns" rule. Linguist (Rule | Fix, Prefix | Suffix) does this. If option 1 is chosen, the spec should allow n columns when n = 2.
- **Coherence giveaway:** separate from counting, an answer can be the only option whose columns make sense together (Linguist's old rule-specific fixes; Project Scheduling's float "slip", now a multi-part). Critical-path/medium still has a weaker form: the right option is often the only one whose duration matches its path's sum. Fixing that fully conflicts with the counting rule.

## Decision (user, 2026-11-26)
Option 1, **mixed distances**:
- At least one wrong option differs from the answer in 2+ columns, and the answer's value is not the most common in at least one column.
- With 2 columns, a wrong option may differ in both columns; the spec's "1 to n−1 columns" rule is relaxed for n = 2.
- The engine checks this in `segChoiceSpec` (warning once per module) and generators redraw until it holds; questions change per seed where they didn't comply.
- Also avoid the coherence giveaway: the answer must not be the only option whose columns make sense together.

## Built (2026-11-26)
Engine check `segMixIssues` (warn once per module). All 42 modules with segmented options pass at 300 seeds per cell (156 cells, 0 failing). Where only 3–4 sensible combinations exist (networking gateway, vectors, Data Analyst binary pairs), one or two wrong options read as unlikely combinations, but the answer is never the only sensible one. A cruder "sum of value counts" heuristic still finds the answer 1–24% of the time in some 3-column Marketing/Management cells.
