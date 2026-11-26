> [!WARNING] Exercise rules only
> These are arithmetic scenarios with made-up figures. The page sizes, fan-outs, fill levels, speeds, pool rules and recovery limits are rules set for each exercise, not how any real database product behaves or advice for a real system. Measure and test your own system.

# Applied scenarios (Database Administrator)

Scenario questions for the **Database Administrator** role, from Medium to Expert+. Each one is a single made-up scenario with several linked answers, and each answer uses a different skill: rounding up to whole pages or connections, powers and logarithms, unit conversions (bytes, GB, MB/s, minutes), percentages, and a decision against a stated limit. A later part usually builds on an earlier one, so work in order. The calculator is on, and the numbers from the prompt are already in it where that helps.

Every rule is stated in the question: 1 GB is 10⁹ bytes for sizes and 1000 MB for transfers, and each part says how to round.

## Index or full scan

A table is stored in pages. A full scan reads them all; an index lookup walks a tree of a stated fan-out and then reads one page per matching row. You count pages, find the tree height, compare the page reads, and later compare times for sequential and random reads. At Expert+ the table grows and you find how many matches the index can afford before the scan wins.

## Table and index sizing

Rows fit a whole number of times on a page that is only partly filled, so rows per page rounds down and pages round up. You turn pages into gigabytes, size an index from its entry size, and at Expert+ grow the table, add a second index and check the total against a disk quota.

## Backups and recovery time

A restore reads a full backup plus the incrementals taken since. You size that chain, turn it into a restore time at a stated speed, and check it against a recovery-time limit. Later the transaction logs must be replayed too, and at Expert+ you compare two backup plans on storage and recovery time.

## Connections and replicas

Each query holds a connection for a few milliseconds, so the busy connections follow from the query rate; the pool is sized so only a share of it is busy, and checked against a server limit. Later a write burst leaves a replica behind and you work out the lag and the time to catch up. At Expert+ the reads are shared across replicas and every pool is sized against a cluster limit.
