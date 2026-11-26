# Data Analyst scenarios: how to solve

## General

- Read the whole case first, then answer the parts in order: later parts use earlier results.
- The calculator starts with the scenario's numbers as rows (`_n`, `_ca`, `_t0`, …). Build each step on those labels and round only when you type an answer.
- Apply stated rules exactly: "at least" includes the limit, "more than" does not.
- Percentage points compare two percentages; a percentage change compares two amounts.

## A/B test

1. **Rate** = conversions ÷ visitors × 100 for each version.
2. **Lift** = B's rate − A's rate, in percentage points (a fall is negative).
3. **Extra conversions** = monthly volume × lift ÷ 100.
4. **Decision:** compare the lift (or each check) with its limit.
5. **Probability of at least one:** 1 − (1 − p)^m, with p as a fraction.
6. **Working backwards:** visitors needed = conversions wanted ÷ rate; round up.

**Watch out:** relative lift (B − A) ÷ A is not the lift in points.

## KPI review

1. Add the segments to get the totals for each quarter.
2. **Total change %** = (this − last) ÷ last × 100.
3. **Contribution** of a segment = its own change in money ÷ last quarter's **total** × 100.
4. **Share** = segment ÷ total of the same quarter × 100.
5. **Working backwards:** target total = this quarter's total × (1 + growth); subtract the segments that stay flat.

**Watch out:** the segment with the biggest total is not always the one that added the most.

## Query results and outliers

1. Test each row against **every** condition joined by AND; `>=` keeps a row equal to the limit, `>` drops it, and `<>` means "not equal".
2. Write the returned values in a list; the count is the number of rows.
3. **Mean** = sum ÷ count. **Median** = the middle value (or the average of the middle two).
4. **Outlier rule** is stated in the question; use the median, not the mean, in it unless told otherwise.
5. A single outlier drags the mean but barely moves the median.

## Data storage cost

1. **Bytes per record** = characters × bytes per character + header.
2. **Size** = records × bytes per record; 1 GB = 1,000,000,000 bytes.
3. **Compression** by P% leaves (100 − P)% of the size.
4. **Cost** = GB × price per GB per month.
5. **Growth** by g% multiplies size and cost by (1 + g/100).
6. **Working backwards:** budget ÷ price = GB you can afford; divide by the GB per million records, round down.
