# How to solve: Statistics

## General

- Sort the data first. Most of these questions get easier once the list is in order.
- Round to 2 decimal places when the answer isn't a whole number (answers within 0.005 are accepted).
- Probabilities are asked for as a decimal like `0.25` or as a simplified fraction like `3/8` (no spaces). The question says which.
- Negative values count: -8 is smaller than -2.

## Mean, median and mode

1. **Mean:** add all the values and divide by how many there are.
2. **Median:** sort the values. For an odd count, it's the middle one. For an even count, it's halfway between the two middle ones.
3. **Mode:** the value that appears most often. Tally each value's count.

Example: for `2, 3, 3, 8`, the mean is 16 ÷ 4 = 4, the median is (3 + 3) ÷ 2 = 3, and the mode is 3.

**Watch out:** the median of an unsorted list is not just the middle of what you see. Sort it first.

## Range and IQR

1. **Range** = largest - smallest.
2. For quartiles, sort the values and split them into a lower and an upper half. With an odd count, leave the middle value out of both halves.
3. **Q1** is the median of the lower half; **Q3** is the median of the upper half.
4. **IQR** = Q3 - Q1.

Example: `1, 3, 5, 7, 9, 11, 13` → lower half `1, 3, 5` (Q1 = 3), upper half `9, 11, 13` (Q3 = 11), IQR = 8.

**Watch out:** the range uses the smallest and largest values, not the first and last ones in an unsorted list.

## Probability

1. One event: P = favourable outcomes ÷ all equally likely outcomes.
2. Two independent events (a marble put back, a coin and a die): multiply, `P(A and B) = P(A) × P(B)`.
3. "At least one": work out the chance of none and subtract from 1, `1 - P(none)`. For n tries, P(none) = (chance of failing once)ⁿ.
4. Simplify a fraction answer, or round a decimal to 2 places.

Example: two dice, both showing a 6: `1/6 × 1/6 = 1/36`.

**Watch out:** "at least one in 3 rolls" is not 3 × P(one roll). Use 1 - P(none).

## Weighted average

1. Multiply each score by its weight.
2. Add the products.
3. Divide by the total of the weights: 100 for percentage weights, or the total credits for a GPA.
4. Score needed for a target: write `(known products + weight × x) ÷ 100 = target`, then solve for x.

Example: 80 (weight 60%) and 70 (weight 40%) → `(4800 + 2800) ÷ 100 = 76`.

**Watch out:** don't take a plain average of the scores. Heavier weights count more.
