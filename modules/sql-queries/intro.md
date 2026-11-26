# SQL Queries

SQL is how programs ask databases questions. Most questions here show one or two small tables and a query; your job is to work out what the database would answer, by hand. In **Write the query** it's the other way round: you get a task and write the query yourself.

## Answer formats

| You're asked for | Answer like |
| --- | --- |
| How many rows | a whole number |
| A single value | the number (each question says if it needs rounding) or the text, like `Luna` |
| Which rows | pick the option; names are listed alphabetically unless the query has ORDER BY |
| Rows in order | build the list from the blocks (one per table row), first result row first |
| A query (Write the query) | type it on one line, or switch to **Blocks** and build it; Blocks earn up to 85% credit at Hard and 70% at Expert. Press **Run** to test it on the table first |

## Key facts

- The database works in this order: **FROM / JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT**.
- **WHERE** keeps rows; **AND** needs both conditions, **OR** needs at least one, **NOT** flips. `BETWEEN a AND b` includes both ends.
- **ORDER BY** sorts (ASC = smallest or A first, DESC = largest first). **LIMIT n** keeps the first n rows; **OFFSET m** skips m rows first.
- **Aggregates:** `COUNT(*)` counts rows, `SUM`, `AVG` (the exact mean), `MIN` and `MAX` work on a column.
- **GROUP BY** makes one row per group; **HAVING** filters whole groups.
- **INNER JOIN** pairs rows whose key columns match; rows with no partner are dropped.
- The tables never contain NULL (empty) values, and text matches exactly.

| Level | What to expect |
| --- | --- |
| Easy | One condition, top or bottom row, `COUNT`, `MIN`, `MAX`, counts per group |
| Medium | AND, OR and BETWEEN, top-n lists, `SUM`, `AVG`, `COUNT(DISTINCT …)`, values per group |
| Hard | Brackets and NOT, OFFSET and two sort keys, subqueries, HAVING, joins, questions with several parts |
| Expert | Working backwards (a missing number in the query or the table, the ORDER BY that gives an order), AND before OR without brackets, pages with LIMIT and OFFSET, and queries that combine JOIN, WHERE, subqueries, GROUP BY and HAVING |

## Write the query

Each task says which columns to show, in which order, and what to filter, sort or count. The prompt asks for one tidy form (keywords in capitals, columns in the order given, text in single quotes like `'Dog'`, one space each side of `=` and `>`, no spaces inside brackets such as `COUNT(*)`, and an optional semicolon at the end), but any query that does the same job counts too.

A query that isn't in that exact form is run against the table and marked by its **output**:

- It must return the same rows and columns, in the order given. Row order only matters when the task asks for sorting.
- It may only use the values the task gives. Picking the right rows by hand, for example `WHERE name IN ('Luna', 'Max')`, or adding a `LIMIT` the task didn't ask for, is marked wrong with a note, even when the output happens to match.
- It must give the same answer when the table's values are reshuffled. A different condition that matches this table only by chance is marked wrong.

The feedback tells you which of these your query missed.

| Level | You write |
| --- | --- |
| Easy | `SELECT` columns (or `*`) `FROM` a table |
| Medium | plus `WHERE` with one or two conditions |
| Hard | `ORDER BY` with `ASC`/`DESC` and `LIMIT`, or one aggregate: `COUNT(*)`, `SUM`, `AVG`, `MAX`, `MIN` |
| Expert | `GROUP BY` with `HAVING`, `IN (…)`, or an `INNER JOIN … ON` with table names on every column |
