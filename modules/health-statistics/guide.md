# Health Statistics: how to solve

## General
- Read the definition in the question: it tells you exactly what goes on top and what goes underneath.
- Pick the right group first (a row, a column, or the whole population), then divide.
- Keep full precision in the calculator and round only at the end, as the question says.
- Percentages are typed without the `%` sign; a decrease gets a minus sign.

## Rates
1. Prevalence: people who have the condition now ÷ population, × 100 for a percentage.
2. Incidence: *new* cases in the period ÷ population, × 1,000 or × 100,000 as asked.
3. Percentage change: (new - old) ÷ old × 100.
4. When populations differ between years, compare rates, not raw counts.

Example: 45 new cases in 30,000 people is `45 / 30000 * 1000 = 1.5` per 1,000 per year.

Watch out: "per 1,000" and "per 100,000" differ by a factor of 100; check which one is asked.

## Screening tests
1. Label the table: TP top left, FP top right, FN bottom left, TN bottom right.
2. Sensitivity and specificity use the **columns** (has / doesn't have the condition).
3. PPV and NPV use the **rows** (tested positive / tested negative).
4. To build a table: people with the condition = N × prevalence; TP = that × sensitivity; TN = the rest × specificity; FN and FP are what's left.

Example: 90 TP and 10 FN give sensitivity `90 / 100 * 100 = 90`%.

Watch out: a test with high sensitivity can still have a low PPV when the condition is rare, because false positives outnumber true ones.

## Risk
1. Risk in a group = outcomes ÷ that group's total.
2. Relative risk = exposed risk ÷ unexposed risk; risk difference = exposed risk - unexposed risk.
3. Odds in a group = outcomes ÷ non-outcomes (a ÷ b, c ÷ d).
4. Odds ratio = exposed odds ÷ unexposed odds, or the shortcut `(a × d) ÷ (b × c)`.

Example: a = 20, b = 80, c = 10, d = 90 gives RR `0.2 / 0.1 = 2` and OR `(20 × 90) / (80 × 10) = 2.25`.

Watch out: risk divides by the group total, odds divide by the people *without* the outcome.

## Averages and spread
1. Mean: add all the values and divide by how many there are.
2. Median: sort, then take the middle value (or halfway between the two middle values).
3. Range: largest - smallest.
4. IQR: split the sorted list into halves (leave out the middle value for an odd count); Q3 - Q1, the medians of the halves.

Example: 60, 64, 70, 72, 84 has mean `350 / 5 = 70`, median 70, range 24.

Watch out: sort before finding the median or range; the first and last values shown may not be the smallest and largest.
