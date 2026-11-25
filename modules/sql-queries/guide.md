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

## ORDER BY and LIMIT

1. Apply WHERE first, if there is one.
2. Sort the remaining rows: ASC is smallest (or A) first, DESC is largest first.
3. With two sort columns, the first decides; the second only orders rows that tie on the first.
4. OFFSET skips rows from the top, then LIMIT keeps that many.

Example: prices 5, 9, 2 with `ORDER BY price DESC LIMIT 2` gives 9, 5.

**Watch out:** LIMIT is a maximum: if fewer rows pass WHERE, you get fewer.

## Aggregates

1. Apply WHERE to find the rows that are used.
2. `COUNT(*)` counts them; `SUM` adds a column; `AVG` is the sum ÷ the count.
3. `MIN` and `MAX` pick the smallest and largest value.
4. A subquery in brackets runs first and gives one value to compare with.

Example: scores 4, 6 and 11 give `AVG(score)` = 21 ÷ 3 = 7.

**Watch out:** `COUNT(DISTINCT col)` counts each different value only once.

## GROUP BY and JOIN

1. GROUP BY: sort the rows into piles with the same value; each pile becomes one result row.
2. Work out the aggregate for each pile.
3. HAVING keeps only the piles whose aggregate passes its test.
4. INNER JOIN: for each row of the first table, find the rows of the second table with the same key, and drop rows with no match.

Example: species Cat, Dog, Cat with `GROUP BY species` gives 2 rows: Cat (2) and Dog (1).

**Watch out:** WHERE filters rows before grouping; HAVING filters whole groups after.
