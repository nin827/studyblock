> [!WARNING] Exercise rules only
> These are arithmetic scenarios with made-up figures. The prices, headroom rules, month length, backup schedules and recovery limits are rules set for each exercise, not any provider's price list or advice for a real system. Check your own provider's pricing and your own reliability targets.

# Applied scenarios (Cloud Engineer)

Scenario questions for the **Cloud Engineer** role, from Medium to Expert+. Each one is a single made-up scenario with several linked answers, and each answer uses a different skill: percentages of a month, rounding up to whole machines, unit conversions, comparing two prices, and a yes or no decision. A later part usually builds on an earlier one, so work in order. The calculator is on, and the numbers from the prompt are already in it where that helps.

Money is in a generic `$`. A month is 30 days, 1 GB is 1000 MB, and every rule is stated in the question, with each part saying how to round.

## Uptime and error budgets

An availability target means a small amount of allowed downtime each month. You turn the target into minutes, add up the outages, and see how much of the error budget is burned. Later you apply a release-freeze rule, and at Expert+ you work out the availability of a system built from layers in series with a redundant pair.

## Autoscaling and fleet size

A peak load and the usable capacity of one instance (after headroom) tell you how many instances to run, rounded up, and what they cost for the month. Later the load changes between peak and quiet hours, and at Expert+ the fleet is spread over three zones and must survive losing one.

## The monthly cloud bill

On-demand instances cost per hour, reserved ones cost a fixed fee. You find the bill, the break-even hours and the cheaper plan, then mix the two. At Expert+ you add storage (converting megabytes to gigabytes) and tiered data-transfer prices, and decide whether a commitment discount pays off.

## Storage growth and backups

Data grows by a stated amount each week towards a quota. You find the growth, the size later on and the weeks until the quota is reached. Then a backup plan of full and incremental backups sets how much storage is used and what it costs, and at Expert+ you check whether the whole chain can be restored within a recovery-time limit.
