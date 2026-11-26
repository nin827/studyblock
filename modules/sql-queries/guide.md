# SQL Queries: how to solve

## General

- Run the query in the database's order: FROM / JOIN, then WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT.
- Keep a tick list: go down the table and mark each row in or out.
- Text must match exactly, and the tables have no NULL values.

## SELECT and WHERE

1. Read the WHERE condition and split it into simple tests.
2. For each row, mark every simple test true or false.
3. Combine them: brackets first, then NOT, then AND (both true), then OR (at least one true).
4. Count the rows that pass, or read the column that SELECT asks for.

Example: `WHERE age > 5 AND species = 'Dog'` keeps only dogs older than 5.

**Watch out:** `>` leaves out the value itself; `>=` includes it.

**Expert: missing numbers and precedence.** For `col > ?`, the returned rows must pass and every other row the AND lets through must fail, so ? sits between the two groups; check both edge values. Without brackets, AND is worked out before OR: `a OR b AND c` means `a OR (b AND c)`.

## ORDER BY and LIMIT

1. Apply WHERE first, if there is one.
2. Sort the remaining rows: ASC is smallest (or A) first, DESC is largest first.
3. With two sort columns, the first decides; the second only orders rows that tie on the first.
4. OFFSET skips rows from the top, then LIMIT keeps that many.

Example: prices 5, 9, 2 with `ORDER BY price DESC LIMIT 2` gives 9, 5.

**Watch out:** LIMIT is a maximum: if fewer rows pass WHERE, you get fewer.

**Expert: pages and sort keys.** Page p of k rows is `LIMIT k OFFSET (p − 1) × k`. To find which ORDER BY gives an order, see which column keeps equal values together (the first key, A to Z or Z to A), then how the rows run inside each group (the second key).

## Aggregates

1. Apply WHERE to find the rows that are used.
2. `COUNT(*)` counts them; `SUM` adds a column; `AVG` is the sum ÷ the count.
3. `MIN` and `MAX` pick the smallest and largest value.
4. A subquery in brackets runs first and gives one value to compare with.

Example: scores 4, 6 and 11 give `AVG(score)` = 21 ÷ 3 = 7.

**Watch out:** `COUNT(DISTINCT col)` counts each different value only once.

**Expert: working backwards from an average.** AVG × number of rows = their total; take away the values you can see to find a hidden one. A subquery like `(SELECT AVG(x) FROM t)` is one number for the whole table, worked out first.

## GROUP BY and JOIN

1. GROUP BY: sort the rows into piles with the same value; each pile becomes one result row.
2. Work out the aggregate for each pile.
3. HAVING keeps only the piles whose aggregate passes its test.
4. INNER JOIN: for each row of the first table, find the rows of the second table with the same key, and drop rows with no match.

Example: species Cat, Dog, Cat with `GROUP BY species` gives 2 rows: Cat (2) and Dog (1).

**Watch out:** WHERE filters rows before grouping; HAVING filters whole groups after.

**Expert: long queries.** Work in this order: subquery, JOIN (unmatched rows drop out), WHERE, GROUP BY, HAVING. A subquery on the left table still averages every row of it, even rows that won't join. A name with no joined rows makes no group at all.

## Write the query

1. Read the task and list what it asks for: which columns (in that order), which rows, any sorting, counting or grouping.
2. Start with `SELECT` and the columns, separated by commas, then `FROM` and the table.
3. Add the clauses you need, always in this order: `JOIN … ON`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`.
4. Turn the words into signs: "more than" is `>`, "less than" is `<`, "at least" is `>=`, "at most" is `<=`, "is not" is `<>`. Text goes in single quotes; numbers don't.
5. Press **Run** to see what your query returns, and compare it with what the task wants.

Example: "the name of every pet whose age is at least 5, oldest first" is `SELECT name FROM pets WHERE age >= 5 ORDER BY age DESC`.

| Task words | SQL |
| --- | --- |
| how many rows | `COUNT(*)` |
| total / average | `SUM(col)` / `AVG(col)` |
| highest / lowest | `MAX(col)` / `MIN(col)`, or `ORDER BY col DESC` / `ASC` with `LIMIT` |
| for each … | `GROUP BY col`, with col in the SELECT list too |
| only groups where … | `HAVING` (WHERE runs before grouping, so it can't test COUNT or SUM) |
| is A or B | `col IN ('A', 'B')` |

**Watch out:** in Blocks mode, `SELECT …`, `COUNT(…)` and `IN (…)` are blocks with a space inside: place them first, then tap them and add the blocks that go inside.

**Expert: joins.** With two tables, write every column as `table.column`. `INNER JOIN other ON first.key = other.key` goes straight after `FROM first`; rows with no match drop out.
