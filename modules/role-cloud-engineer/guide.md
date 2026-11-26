## General

Cloud scenarios chain simple steps, so work in order and keep the units straight (minutes, hours, requests per second, instances, GB, MB, $).

1. Read the stated rules first: the month length, the headroom, the billing rule, the backup schedule.
2. Write down which number each part asks for, and its rounding.
3. Whole machines (instances, zones) round **up** when you need enough capacity.
4. For a yes or no, find the numbers first, then compare them using the stated rule.

## Uptime and error budgets

Allowed downtime = (100 − target %) ÷ 100 × the minutes in the month (43,200 for 30 days). Total downtime = the outages added up in one unit (turn hours into minutes). Budget burned % = downtime used ÷ allowed downtime × 100.

A release freeze applies when the share burned is above the stated limit.

For layers in series, all must be up, so multiply the availabilities as fractions. A redundant pair is down only when both are down: its availability = 1 − (chance of one being down)². Expected downtime = (1 − availability) × the minutes in the month. Compare availability with the target: at or above meets it.

## Autoscaling and fleet size

Usable capacity per instance = maximum × utilisation %. Instances = peak load ÷ usable capacity, rounded up. Cost = instances × hourly price × hours (720 in a 30-day month).

With a peak and a quiet period, size each fleet separately (never below any stated minimum). Instance-hours a day = peak fleet × peak hours + quiet fleet × the other hours; × 30 days × price. The saving is the cost of the peak fleet all day minus that.

With three zones and one lost, two zones must carry the peak. Each zone needs peak ÷ (2 × usable capacity), rounded up; the fleet is 3 times that. Extra cost % = extra instances ÷ plain fleet × 100.

## The monthly cloud bill

On-demand bill = instances × hourly price × hours. Break-even hours = reserved fee ÷ hourly price: above it reserved is cheaper, below it on-demand wins.

A mixed fleet: reserved instances × fee, plus the on-demand instances × price × hours. Saving % = (all-on-demand bill − actual bill) ÷ all-on-demand bill × 100.

Storage: MB ÷ 1000 = GB, then × price per GB. Tiered transfer: free block, then each block at its own rate; price each block separately and add. A commitment bills all 720 hours at a discounted price, so compare n × price × (1 − discount) × 720 with n × price × hours run.

## Storage growth and backups

Weekly growth = growth % × today's size (the same amount each week). Size after w weeks = today + growth × w. Weeks to quota = (quota − today) ÷ weekly growth, rounded up.

A weekly backup cycle = one full backup + 6 incrementals, each a % of the data size. Retained storage = cycle × number of cycles kept; monthly cost = GB × price per GB.

Restore time = size in MB ÷ speed in MB/s gives seconds; ÷ 3600 for hours. Compare with the limit.
