# Probability: how to solve

## General

- When every outcome is equally likely, P(event) = favourable outcomes ÷ all outcomes.
- A probability is between 0 and 1. Simplify the fraction at the end by dividing the top and bottom by their greatest common factor.
- "And" for independent events: multiply. "Or" for events that can't both happen: add.
- "At least one" is easiest as 1 - P(none).

## Basic probability

1. Count all the equally likely outcomes: the die's sides, the cards in the deck, the items in the bag.
2. Count the outcomes that match the event. Read the wording carefully: "greater than 4" leaves out 4, "4 or higher" includes it.
3. For "A or B", add the two counts and take away the ones that are both (they were counted twice).
4. Write favourable ÷ all, and simplify.

Example: a heart or a king from 52 cards gives 13 + 4 - 1 = 16 cards, so P = 16/52 = 4/13.

**Watch out:** 1 is not a prime number, and items taken out of a bag change both the count and the total.

**Expert: working backwards.** If 6 red make P(red) = 2/5, then 2 parts are 6, so the whole bag is 5 parts = 15. With two probabilities (before and after adding some), write the colour you know about as a fraction of an unknown total T, set up one equation and solve for T. Adding items changes the total and the colour you add, not the other colours.

## Combined events

1. Decide whether the events are independent (dice, coins, picks with replacement) or dependent (picks without replacement).
2. For "and", multiply along the route. Without replacement, the second fraction has one fewer on the bottom, and one fewer on top if it's the same colour.
3. If there are several routes (like "exactly one"), work out each route and add them.
4. For "at least one", find P(none) and subtract it from 1.

Example: 3 red and 2 blue, two picks without replacement: P(both red) = 3/5 × 2/4 = 6/20 = 3/10.

**Watch out:** with two dice, (1, 2) and (2, 1) are different outcomes. There are 36, not 21.

**Expert: tree diagrams and "given that".** Multiply along each branch and add the branches that end in the event: P(late) = P(rain) × P(late | rain) + P(dry) × P(late | dry). For "given that it was late, was it rainy?", divide the rainy-and-late branch by P(late). Working with whole percentages (out of 10000) keeps it tidy.

**Expert: Venn diagrams.** Put the "both" count in the middle first, then subtract it from each group. "Neither" is what's left outside both circles. "Given that they're in B" means the bottom of the fraction is the size of B, not the whole group.

## Counting

1. Ask whether order matters. Places, codes and arrangements: it does. Teams and groups: it doesn't.
2. Order matters, no repeats: multiply down, e.g. 10 × 9 × 8 for 3 places from 10 (nPr).
3. Order doesn't matter: work out nPr, then divide by r! (nCr).
4. Repeats allowed: multiply the same number of choices for every position. Repeated letters in a word: divide n! by the factorial of each letter's count.

Example: a team of 3 from 8 people is (8 × 7 × 6) ÷ (3 × 2 × 1) = 56.

**Watch out:** separate independent choices multiply (the product rule); don't add them.

**Expert: restrictions.** To keep two letters together, glue them into one block, arrange the block with the other letters, and multiply by 2 for the order inside the block. "Not together" is the total minus "together". For "at least one" of a group in a committee, take the total minus the committees with none of them. For exactly one, multiply the ways to choose each group (e.g. 4 × C(8, 2)).

## Expected value

1. List every outcome with its payout (0 for a loss).
2. Multiply each payout by its probability.
3. Add these up: that's the expected win or score per play.
4. If it costs money to play, subtract the cost to get the expected profit. Round at the very end.

Example: win $6 on a 6 with a fair die costs $1.50: 6 × 1/6 - 1.50 = -0.50, so you lose 50 cents per game on average.

**Watch out:** a negative expected profit means the game favours the organiser. Keep the minus sign.

**Expert: fair games and missing values.** A game is fair when the expected winnings equal the cost, so the expected profit is 0: write the expected winnings with the prize as X, set it equal to the cost and solve. In a table, the probabilities add to 1, which gives a missing probability; if E(X) is given and a value is missing, write E(X) = Σ x × P(x) with the unknown and solve for it.
