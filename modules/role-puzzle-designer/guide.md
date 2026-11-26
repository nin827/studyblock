## General

Puzzle design questions chain a count or a statistic with a decision, so work in order and read each part's rounding.

1. Read the rule that defines a valid puzzle, or what counts as "the same" design.
2. Counts are whole numbers and exact; list or branch systematically so nothing is missed or counted twice.
3. For a yes or no, find the numbers first, then compare using the stated rule. Equal to a limit counts as within it unless the rule says "more than" or "fewer than".
4. The calculator is on and the numbers from the prompt are already in it where that helps.

## Grid puzzles

Candidates for a cell: the digits not already shown in its row or its column. That is only a first filter; the full solution count needs the whole grid.

Count completions by branching on one cell at a time and keeping only branches that never repeat a digit in a row or column. Forced cells never change from one completion to the next. A clue keeps only the completions that agree with it, so it can only lower the count. A puzzle is fair when exactly one completion is left. A clue is needed if deleting it lets more than one completion in; two clues that are each unneeded alone may still be needed together.

## Magic squares

Every row, column and diagonal adds to S. Find S from a line with no blank, then finish any line with one blank (the blank equals S minus the other two). In a draft with one typo, add all eight lines: the typo is the cell lying on every failing line and on no working line, and the correct value makes a failing line add to S. A cell lies on 2 lines (edge), 3 (corner) or 4 (centre).

For 1 to 9 each once with every line adding to 15, the centre is 5, and the only squares are the rotations and reflections of one pattern, so test each against the clues.

## Counting designs

Multiply the number of choices position by position. A free symbol each time: n to the power L. No repeats: n × (n − 1) × (n − 2) × … Not equal to the neighbour: n for the first, then n − 1 for each later position. "At least one repeat" is all codes minus the codes with no repeat.

Counting a code and its reverse as the same: palindromes are counted once and the others pair up, so (all + palindromes) ÷ 2, with n to the power of half the length (rounded up) palindromes. For a ring, patterns that turn into each other count as one; flipping the ring over merges still more. Count the families, not the patterns.

## Playtest results

Median = the middle time of the solvers (put them in order). Solved % = solvers ÷ all testers × 100, and those who gave up still count as testers. Difficulty rating = median + 0.1 × the percentage who did not solve it. A lower rating means easier, so the easier puzzle opens the pack.

Trimmed mean: drop one fastest and one slowest time, then average the rest. Verdict rules are stated in the question; check the conditions as worded ("or" needs only one, "and" needs both) and note whether the limit is inclusive.
