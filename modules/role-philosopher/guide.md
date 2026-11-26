## General

These scenarios are settled by checking every case, so work systematically and read each stated rule first.

1. Note what each part asks for: a count, a verdict or a choice, and its format.
2. When rows or assignments are involved, list them in a fixed order so none is missed or counted twice.
3. For a verdict, find the counts or values first, then compare them using the stated rule.
4. Different rules can disagree. Apply each one exactly as written, and do not carry one rule's answer over to another.

## Argument forms

An argument is valid when no assignment of true and false makes every premise true and the conclusion false. One such assignment (a counter-example) makes it invalid.

Standard shapes: from "if P then Q" and P you may conclude Q; from "if P then Q" and not Q you may conclude not P; from "P or Q" and not P you may conclude Q; from "if P then Q" and "if Q then R" you may conclude "if P then R". Reversing these goes wrong: affirming the consequent (Q, so P), denying the antecedent (not P, so not Q), affirming a disjunct (P, so not Q) and reversing a chain (if R then P) are all invalid.

Dilemmas combine "P or R" with two conditionals. Concluding "Q or S" holds, while concluding "Q and S" does not.

To count rows, list every assignment (2 letters give 4 rows, 3 give 8, 4 give 16) and test each premise in turn. A row counts only if every premise is true in it.

## Truth tables

Build the table column by column: first each letter, then each smaller part, then the whole statement. "P → Q" is false only on rows where P is true and Q is false. "P ↔ Q" is true when both have the same value.

A tautology is true in every row, a contradiction in none, and anything else is neither. Two statements are equivalent when their final columns match in every row.

A entails B when B is true in every row where A is true. Rows where A is false never count against it. Rows where they differ = rows where only A is true + rows where only B is true.

## Decisions under risk

Expected value = sum of (payoff × probability of its state). Write the percentages as decimals first.

Maximin: take the lowest payoff in each option's row, then choose the option whose lowest payoff is largest.

Regret = the best payoff in that state − this option's payoff. An option's maximum regret is its largest regret across the states, and minimax regret chooses the option with the smallest of those.

Value of perfect information = (sum over states of the best payoff in that state × its probability) − the best expected value of any single option.

## Ballots and voting

Pairwise: a choice beats another when more members rank it higher. Add the member counts of every row that puts the first above the second; the other side gets the rest of the members.

A Condorcet winner beats every other choice. Wins can go round in a loop (A beats B, B beats C, C beats A), and then there is none.

Borda: with m choices, first place earns m − 1 points down to 0 for last. Multiply each row's points by its member count and add them up. Plurality uses first places only.

Instant runoff: count first places among the choices still in the race, remove the one with the fewest and move its ballots to their next remaining choice, and repeat until one choice has more than half the members.
