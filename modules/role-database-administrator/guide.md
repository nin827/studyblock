## General

Database scenarios chain simple steps, so work in order and keep the units straight (rows, pages, bytes, GB, MB/s, minutes, connections).

1. Read the stated rules first: rows per page, fill level, fan-out, speeds, the busy share, the limit.
2. Write down which number each part asks for, and its rounding.
3. Things that come in whole units round the way the rule says: rows per page **down**, pages and connections **up**.
4. For a yes or no, find the numbers first, then compare them with the stated limit (equal to the limit counts as within it).

## Index or full scan

Pages = rows ÷ rows per page, rounded up. A full scan reads every page.

Tree height h = the fewest levels with fan-out^h at least the number of rows (try 1, 2, 3 levels). Index reads = h + one data page per matching row. The cheaper plan is the one reading fewer pages.

With times: scan time = pages × time per sequential page; index time = reads × time per random read. Compare the two times, not the page counts.

When the table grows, work everything on the new row count. The break-even is the largest number of matches for which h + matches is still below the scan's pages: matches = pages − h − 1.

## Table and index sizing

Usable bytes per page = page size × fill %. Rows per page = usable ÷ row size, rounded **down**. Pages = rows ÷ rows per page, rounded **up**. Table size = pages × page size in bytes; ÷ 10⁹ for GB.

An index leaf entry has its own size: entries per page = usable ÷ entry size (down), index pages = rows ÷ entries per page (up). Total = table + indexes. With growth, increase the rows by the percentage first.

## Backups and recovery time

Incremental = its % of the database size. Chain = the full backup + each incremental you need. Restore time: GB × 1000 = MB; ÷ MB/s = seconds; ÷ 60 = minutes.

Log replay time = log size ÷ replay speed (GB per hour) × 60 minutes; log size = log rate × hours. Total downtime = restore + replay.

Comparing plans: weekly full + 6 incrementals stores full + 6 × incremental; seven daily fulls store 7 × full. A plan qualifies only if its worst-day restore is within the limit; choose the cheapest that qualifies, or neither.

## Connections and replicas

Busy connections = queries per second × (milliseconds ÷ 1000). Pool = busy ÷ allowed busy share, rounded up. Compare with the stated server or cluster limit.

Replication: backlog = (write rate − apply rate) × burst seconds. Lag = backlog ÷ the write rate at that moment. After the burst the backlog shrinks at (apply rate − new write rate): catch-up seconds = backlog ÷ that, ÷ 60 for minutes.

With replicas, the reads are split equally among them and the rest go to the primary; size each server's pool separately, then add them: primary + replicas × per-replica pool.
