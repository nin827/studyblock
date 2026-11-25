# SQL Queries

SQL is how programs ask databases questions. Each question here shows one or two small tables and a query; your job is to work out what the database would answer, by hand.

## Answer formats

| You're asked for | Answer like |
| --- | --- |
| How many rows | a whole number |
| A single value | the number (each question says if it needs rounding) or the text, like `Luna` |
| Which rows | pick the option; names are listed alphabetically unless the query has ORDER BY |
| Rows in order | pick the option that lists them in result order |

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
