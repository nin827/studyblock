# How to solve: Syllogisms & Arguments

## General

- **Valid** means: in every situation where the premises are true, the conclusion is true too.
- To show an argument is **invalid**, find one counter-example: a situation where the premises are true and the conclusion is false.
- Ignore whether a statement sounds true in real life. Only the form matters.

## Categorical syllogisms

1. Draw one circle per group, overlapping.
2. Shade the parts that must be empty (see the list below).
3. Mark the parts that must have something in them.
4. Every group has at least one member, so a group with only one unshaded part has something there.
5. Read the conclusion off the diagram. If it could still be false, it doesn't follow.

What each statement does to the diagram:

- "All X are Y": shade the part of X outside Y.
- "No X are Y": shade the overlap of X and Y.
- "Some X are Y": mark the overlap of X and Y.
- "Some X are not Y": mark the part of X outside Y.
- If a mark could go in either of two parts, put it on the line between them: it doesn't count for either one.

Common traps:

- "All X are Y" and "All Z are Y" say nothing about X and Z (the shared group Y is never fully covered).
- "Some X are Y" does not mean "some X are not Y".
- "No X are Y" and "No Y are X" say the same thing; so do "Some X are Y" and "Some Y are X". "All X are Y" and "All Y are X" do not.

**Expert:** chain the premises through the shared groups: find the premise with the first group, follow the shared group to the next premise, and so on. Then test each option for a counter-example.

## If-then arguments

The four classic forms, for "If P, then Q":

| Given | Conclusion | Name | Valid? |
| --- | --- | --- | --- |
| P | Q | affirming the antecedent (modus ponens) | Valid |
| not Q | not P | denying the consequent (modus tollens) | Valid |
| Q | P | affirming the consequent | Invalid |
| not P | not Q | denying the antecedent | Invalid |

Rewriting rules:

- "P only if Q" means "if P, then Q".
- "Q if P" means "if P, then Q".
- "Q unless P" means "if not P, then Q".
- "If P, then Q" means the same as "if not Q, then not P" (the contrapositive). The converse ("if Q, then P") and the inverse ("if not P, then not Q") are different claims.
- "Either P or Q (or both)" means "if not P, then Q".
- "Not both P and Q" means "if P, then not Q".

For chains, start from the fact and apply one rule at a time. A rule fires forwards when you know its if-part, or backwards when you know its then-part is false. Anything you can't reach is "can't tell".
