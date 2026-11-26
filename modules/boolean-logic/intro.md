# Boolean Logic

Digital circuits work with just two values: **1** (true, on) and **0** (false, off). Logic gates combine these values, and Boolean expressions describe whole circuits. Answer most questions with `0` or `1`.

## The gates

| Gate | Output is 1 when… | 0 0 | 0 1 | 1 0 | 1 1 |
| --- | --- | --- | --- | --- | --- |
| AND | both inputs are 1 | 0 | 0 | 0 | 1 |
| OR | at least one input is 1 | 0 | 1 | 1 | 1 |
| XOR | the inputs differ | 0 | 1 | 1 | 0 |
| NAND | not both are 1 (NOT AND) | 1 | 1 | 1 | 0 |
| NOR | both are 0 (NOT OR) | 1 | 0 | 0 | 0 |
| XNOR | the inputs are the same (NOT XOR) | 1 | 0 | 0 | 1 |

**NOT** has a single input and flips it: NOT 0 = 1, NOT 1 = 0.

Gates with **three inputs** follow the same idea: AND needs all inputs to be 1, OR needs at least one, and XOR gives 1 when an **odd** number of inputs are 1. NAND and NOR are the opposites of AND and OR.

## Reading expressions

- Every inner operation is wrapped in brackets, so you never need precedence rules. Work from the innermost brackets outwards.
- `NOT` applies only to the letter or bracket right after it: `NOT A AND B` means `(NOT A) AND B`.

For example, with A = 1, B = 1, C = 0:

`(A AND NOT B) OR C` → NOT B = 0 → A AND 0 = 0 → 0 OR C = 0 OR 0 = **0**.

## Truth tables

A truth table lists every combination of inputs. Each input can be 0 or 1, so **n inputs give 2ⁿ rows**: 2 inputs → 4 rows, 3 → 8, 4 → 16.

To count how many rows give 1, go through the rows one by one and evaluate the expression for each.

| Level | Gates | Expressions | Truth tables | Write the expression |
| --- | --- | --- | --- | --- |
| Easy | AND and OR (two or three inputs), NOT | 2 inputs, one AND/OR, maybe a NOT | single gates and 2-input expressions, a missing output; up to 5 inputs | one operator on 2 inputs |
| Medium | XOR, NAND, NOR, XNOR | 3 inputs, 2 operators including XOR | 3-input expressions; up to 6 inputs | 3 inputs, 2 operators |
| Hard | three-input gates | 3–4 inputs, 3–4 operators including NAND and NOR | 3–4 input expressions; up to 10 inputs | 2–3 operators, NOT on brackets, NAND/NOR gates in circuits |
| Expert | circuits built only from NAND or NOR; when an input stops mattering | simplifying, checking a De Morgan rewrite | truth table to expression, word rules to tables | four-gate circuits, rules in words |

**Expert** questions combine ideas: you build small truth tables yourself and compare them. Expressions in the options use the same bracket style, and `NOT` still applies only to the letter or bracket right after it.

## Writing expressions

**Write the expression** asks you to type an expression yourself, for a truth table, a circuit or a rule in words. Use `AND`, `OR`, `XOR`, `NOT` and brackets. Any expression with the right truth table counts, and the feedback names a row where a wrong one goes astray. You can also switch to **Blocks** and build it from pieces, including bracket blocks you fill. On Hard and Expert, Blocks earns a little less credit (85% and 70%), because the pieces give part of the answer away.
