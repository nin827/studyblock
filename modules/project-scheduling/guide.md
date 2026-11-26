# Project Scheduling: how to solve

## General

- Draw the network: each activity is a box, with arrows from its predecessors.
- All times are days from the start of the project (day 0). The early times come from a **forward pass**, the late times from a **backward pass**.
- Money answers are plain numbers: no `$`, no commas. Dates are typed as `20 July 2027`.

## Critical path

1. List every route from an activity with no predecessor to the last activity.
2. Add up the durations along each route. The longest is the **critical path** and its length is the project duration.
3. Activities on it have no float: any delay to them delays the project.
4. Forward pass: ES = the largest EF of the predecessors (0 if none), EF = ES + duration.
5. Backward pass: LF = the smallest LS of the successors (the project duration for the last activity), LS = LF − duration.

Example: routes of 12, 15 and 9 days give a 15-day project.

**Watch out:** if you shorten a critical activity, the project only gets as short as the next-longest route allows.

## Float and crashing

1. Total float = LS − ES (the same as LF − EF). It is shared by the activities on a route.
2. A delay up to the float doesn't change the finish; a bigger delay moves the finish by the extra.
3. Free float = the smallest earliest start among the activities that follow it (or the project duration if none follows) − the activity's EF.
4. Crashing: shorten the critical path one day at a time, always by the cheapest activity that can still be shortened.
5. After each day, check the critical routes again. If a second route is now as long, both must be shortened that day.

Example: a route with 3 days of float can absorb a 2-day delay with no change, but a 5-day delay costs 2 days.

**Watch out:** crashing a non-critical activity wastes money.

## Working-day dates

1. Day 1 is the start date itself. An activity of *n* days ends after you have counted *n* working days, so count *n − 1* more after the start.
2. Skip Saturdays and Sundays, and any listed holiday, exactly as if they weren't in the calendar.
3. Five working days make a calendar week: whole weeks first, then the remaining days.
4. For a deadline, count backwards: the deadline is the last day of the activity.
5. A following task starts on the first working day after the previous one finishes. With two tasks feeding one, wait for the later finish.

Example: 5 working days from Monday end on Friday of the same week; 6 end on the next Monday.

## Earned value

1. EV is the budgeted value of the work done, PV the budgeted value of the work planned by now, AC the money spent, BAC the whole budget.
2. CV = EV − AC and SV = EV − PV. Positive is good: under budget, ahead of schedule.
3. CPI = EV ÷ AC and SPI = EV ÷ PV. Above 1 is good.
4. EAC = BAC ÷ CPI: the forecast final cost if cost efficiency stays the same. VAC = BAC − EAC. ETC = EAC − AC.
5. From percentages: EV = BAC × % done, PV = BAC × % planned.

Example: EV 45000 and AC 50000 give CV −5000 (over budget) and CPI 0.9.

**Watch out:** don't mix up the two variances: cost uses AC, schedule uses PV.
