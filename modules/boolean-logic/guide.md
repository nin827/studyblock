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

**Expert: circuits of gates.** Work out the wires in order, one input row at a time, and write a column for each wire. A NAND or NOR gate with both inputs joined is a NOT gate. To find which single gate a circuit matches, compare its OUT column with each gate's truth table. To see whether OUT depends on A, compare rows that differ only in A (000 and 100, 001 and 101, …).

## Expressions

1. Substitute the input values into the expression.
2. Work from the innermost brackets outwards, writing each result down.
3. Apply each NOT to the single letter or bracket right after it.
4. Finish with the outer operation.

Example: with A = 1, B = 1, C = 0, `(A AND NOT B) OR C` → NOT B = 0 → 1 AND 0 = 0 → 0 OR 0 = **0**.

**Watch out:** `NOT A AND B` means `(NOT A) AND B`, not `NOT (A AND B)`.

**Expert: equivalent expressions.** Two expressions are equivalent when they agree on every row, so build both columns and compare. De Morgan: `NOT (X AND Y)` = `NOT X OR NOT Y` and `NOT (X OR Y)` = `NOT X AND NOT Y`: both sides get a NOT and the operator flips. A double NOT cancels.

## Truth tables

1. Count the inputs. n inputs give 2ⁿ rows: 2 → 4, 3 → 8, 4 → 16.
2. List the rows in counting order, from all 0s up to all 1s.
3. Evaluate the expression for each row.
4. Count the rows that give 1.

**Watch out:** a letter that appears twice is still one input, so it does not add rows.

**Expert: tables to expressions.** To pick the expression for a table, test each option on a few rows (000, 111, then a row with output 1): one wrong row rules it out. For a rule in words, first turn it into an 8-row table; watch "at least", "exactly" and "unless".

## Write the expression

1. Type the expression with `AND`, `OR`, `XOR`, `NOT` and brackets (capitals or not). NAND, NOR and XNOR aren't allowed: write `NOT (A AND B)`, `NOT (A OR B)`, `NOT (A XOR B)`.
2. **From a truth table:** look at the rows that give 1. One row only? Join its inputs with AND, putting NOT on each 0 (`A AND NOT B`). All rows but one? Think of the opposite and use OR, or NOT around an AND. Outputs 1 when two inputs differ? That's XOR.
3. **From a circuit:** write each wire as an expression, starting from the gates nearest the inputs. Then put it, in brackets, wherever that wire is used.
4. **From a rule in words:** split it at the main "and" / "or" / "unless". "At least one of X and Y" is `X OR Y`, "X and Y are different" is `X XOR Y`, "X matches Y" is `NOT (X XOR Y)`, "unless" means AND NOT.
5. Test your expression on every row before you check it.

Example: rows 01 and 10 give 1 and the others 0, so the output is 1 when A and B differ: `A XOR B`.

**Watch out:** bracket an operation that sits inside another one. `A AND B OR C` could mean `(A AND B) OR C` or `A AND (B OR C)`, so it isn't accepted. A chain of one operator, like `A AND B AND C`, is fine.

Any expression with the right truth table counts, not only the one shown as the answer. With Blocks, place a `( … )` block and fill it with the blocks that go inside the brackets.
