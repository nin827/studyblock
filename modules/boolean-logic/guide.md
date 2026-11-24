# Boolean Logic: how to solve

## General

- There are only two values: **1** (true) and **0** (false). Most answers are `0` or `1`.
- AND needs every input to be 1. OR needs at least one. XOR needs an odd number of 1s.
- NAND, NOR and XNOR are the opposites of AND, OR and XOR: work out the plain gate, then flip the result.
- NOT applies only to the letter or bracket right after it.

## Logic gates

1. Write down the inputs and count how many are 1.
2. Apply the gate's rule: AND means all are 1, OR means at least one is 1, XOR means an odd count.
3. For NAND, NOR or XNOR, flip the result of the plain gate.
4. For "which gate could it be?", test every option on the given rows and rule out the ones that disagree.

Example: a three-input XOR with A = 1, B = 1, C = 1 has three 1s. Three is odd, so the output is **1**.

**Watch out:** NOR gives 1 only when **every** input is 0.

## Expressions

1. Substitute the input values into the expression.
2. Work from the innermost brackets outwards, writing each result down.
3. Apply each NOT to the single letter or bracket right after it.
4. Finish with the outer operation.

Example: with A = 1, B = 1, C = 0, `(A AND NOT B) OR C` → NOT B = 0 → 1 AND 0 = 0 → 0 OR 0 = **0**.

**Watch out:** `NOT A AND B` means `(NOT A) AND B`, not `NOT (A AND B)`.

## Truth tables

1. Count the inputs. n inputs give 2ⁿ rows: 2 → 4, 3 → 8, 4 → 16.
2. List the rows in counting order, from all 0s up to all 1s.
3. Evaluate the expression for each row.
4. Count the rows that give 1.

**Watch out:** a letter that appears twice is still one input, so it does not add rows.
