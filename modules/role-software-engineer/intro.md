# Software Engineer scenarios

**Expert+** questions for the Software Engineer role. Each one is a single workplace scenario with three or four parts, and every part uses a different skill: SQL, algorithms and Big-O, data sizes, networking, floating point and money, or dates. A later part often builds on an earlier answer, so work through them in order.

Code is shown in the language you pick in Settings (Python, C#, C++, GDScript or Rust); the maths and answers are the same in each. Loop code is shown with line numbers, and questions refer to lines by number. The calculator starts with the scenario's numbers filled in.

## Scenarios

| Scenario | Skills it combines | Fits |
| --- | --- | --- |
| Speed up an API endpoint | SQL on a sample table, B-tree index growth, binary search, transfer time | Backend Engineer |
| Reconcile a payment ledger | SQL `SUM`, per-payment fees, float truncation, the fix | Fintech Engineer |
| Profile a hot loop | loop trace, time and memory Big-O, bytes per record, upload time | Both |
| Ship an international payout | fee with a minimum, currency conversion rounded down, settlement date, batch throughput | Fintech Engineer |

## Answer formats

| You're asked for | Answer like |
| --- | --- |
| A count (rows, runs, comparisons) | a whole number |
| Money, megabytes or seconds | a number rounded as the part says, usually 2 decimal places, without `$`, `€` or units |
| Growth | pick the option, or build it from the blocks (one per column) |
| A code fix | pick the line |
| A date | any clear form, like `19 May 2027` or `19/05/2027` (day first) |

## Conventions

- 1 MB = 1,000,000 bytes and 1 Mbps = 1,000,000 bits per second. Latency, headers and protocol overhead are ignored.
- Exchange rates are made up and always stated.
- Business days are Monday to Friday, with no public holidays.
