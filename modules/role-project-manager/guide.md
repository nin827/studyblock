## General

Project problems chain a few small calculations, so work in order and keep the units straight (working days, dollars, hours, people).

1. Read the stated rules first: Monday to Friday, start date is day 1, the holidays, round-up, and any penalty or escalation rule.
2. Work out the network or the indexes before you touch the calendar or the decision.
3. Whole days stay whole: the chained answers here are exact, so a rounded earlier answer gives the same later answer.
4. For a decision, find the numbers for each option first, then compare.

## Delays and finish dates

Duration = the longest route from a start to the end. Float of an activity = project duration minus the longest route through it. The critical path is the route with no float.

A slip adds to the project only by the part that is more than the float: new duration = old duration + max(0, slip − float).

To turn working days into a date, count with the start date as day 1 and skip Saturdays, Sundays and the listed holidays. To go backwards from a deadline, count back the same way (the deadline is the last day).

Days late = working days after the deadline, up to and including the new finish date. Penalty = days late × penalty per day. Crashing the slipped activity by the late days costs days late × crash cost per day. Pick the cheaper; if the deadline is met do nothing.

## Crashing and cost

Only activities on the critical path shorten the project, and only if they can still be crashed. Cut **one day at a time** and re-find the critical path after each day: when two routes are critical, both must be shortened that day, so the cheapest cut may be one activity common to both or one on each.

Total direct cost after crashing = normal direct cost + crash cost. Net saving = overheads saved (days × overhead per day) − crash cost.

For a budget, list the running total after 1 day, 2 days, 3 days… and take the largest number of days whose total is within the budget.

## Earned value and forecasts

EV = BAC × share of work done. PV = BAC × share planned. CPI = EV ÷ AC (cost). SPI = EV ÷ PV, which is the same as share done ÷ share planned (schedule). Above 1 is good: under budget, ahead of schedule.

EAC = BAC ÷ CPI (same efficiency to the end). Forecast overrun = EAC − BAC.

Working backwards: CPI = BAC ÷ EAC, then AC = EV ÷ CPI.

## Team effort and calendar

Hours per day for a team = people × productive hours per person. Working days = effort ÷ hours per day, **rounded up**.

A task that starts the working day after another finishes begins on the next Monday–Friday that is not a holiday. Labour cost = person-days × hours per day × hourly rate (paid for the whole day).

Working backwards: count the working days between the start and the deadline (both included), then smallest team = effort ÷ (days available × hours per person), rounded up.
