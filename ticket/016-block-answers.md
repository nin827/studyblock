# 016 — Block (tiles) answers and the Blocks score multiplier

**Status:** open (partly resolved; see Resolution)
**Raised:** 2026-11-26

## What's built

A new answer type, `tiles`: the learner drags or taps blocks into an answer row. The joined values are checked like a text answer. The first module to use it is Timelines → Ordering, which used to be multiple choice; seeds still give the same events and answer.

## Decisions (defaults chosen)

1. **Score multiplier for Blocks.** Where a question can be answered by typing *or* with blocks, a **Type | Blocks** switch appears. If the learner uses Blocks, the credit is multiplied by a per-difficulty factor set in `module.json` (`tilesMultiplier`).
   - SQL Queries, Code Reviewing, Code Writing: easy 1, medium 1, hard 0.85, expert 0.7 (set by the user).
   - The attempt stores the mode and the multiplier on each question, so old scores never change.
2. **Which other modules get a penalty.** Only where blocks replace *typing*, because then blocks give away the pieces of the answer.
   - Suggested: Boolean Logic (building expressions), Algorithms (typed traces), Genetics (gametes/genotypes), Word Roots and Grammar (if typed versions are added). Same 1 / 1 / 0.85 / 0.7.
   - No penalty where blocks replace multiple choice (Timelines ordering, Chords, Intervals & Scales, Number Theory factorisation, Algorithms sorting, SQL row order): blocks are harder than picking an option.
3. **Filtering.** Hard and Expert questions carry more decoy blocks. The limit is 24 blocks, and a "Filter blocks" search box appears once more than 10 blocks are in the bank.
   - *Alternative reading:* "filtering" means only the decoy count per difficulty, with no search box.
4. **Unordered sets** (chord tones, gametes, factors) are checked as one joined string, so the prompt must state an order. *Alternative:* add an `unordered` flag that sorts both sides before comparing.

## Candidates (from the module survey)

Top picks: SQL Queries order-limit, Algorithms sorting and data structures, Chords (triads, in-key, sevenths), Intervals & Scales scales, Number Theory prime factorisation, Algorithms binary-search trace, an Ecology food chain. Stretch: putting code lines in order in Code Writing, building words in Word Roots (CSV needs a tiles column).

## Resolution (2026-11-26)

- Go ahead with the Type | Blocks switch and the multiplier (SQL Queries, Code Writing, Code Reviewing: 1 / 1 / 0.85 / 0.7), and with blocks in more modules (SQL row order, Algorithms data structures, Chords, Scales).
- **Nested blocks** were added on request: a block can have a slot (e.g. `COUNT(…)`) that other blocks are dragged into.
- Still open, built with defaults:
  - Type is the default mode, remembered per module for the session.
  - New typed subtopics give the Blocks alternative: SQL "Write the query", Code Writing "Write the line", Code Reviewing "Rewrite the buggy line".
  - Algorithms sorting stays multi-part (blocks aren't a part type yet).
