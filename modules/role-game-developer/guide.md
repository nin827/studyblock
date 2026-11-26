## General

Game maths is ordinary maths with a frame clock. Read the stated rules first: the frame rate, the limits and the thresholds.

1. Work in order. Each part usually feeds the next.
2. Round only as each part asks. A rounded earlier answer gives the same later answer.
3. For a Yes/No part, find the number first, then compare it with the stated rule.
4. For a two-column choice, decide each column on its own, then pick the option that matches both.

## Movement and collision

Speed is the length of the velocity vector: the square root of vx² + vy². Position after t frames is the start plus velocity × t. A wall is reached on the first whole frame whose position is at or past it, so round the frame count up. Time = frames ÷ frames per second (× 1000 for ms).

Working backwards, the velocity is the distance divided by the frames. The heading above the x-axis is the angle whose tangent is vy ÷ vx.

## Loot odds and pity

The chance of at least one rare in n pulls is 1 − (1 − p)ⁿ, where p is the chance per pull. The expected pulls to the first rare is 1 ÷ p. With a pity cap at pull H, the expected pulls is (1 − (1 − p)^H) ÷ p.

To find the pulls for a target confidence t, solve (1 − p)ⁿ ≤ 1 − t with logarithms and round up.

## XP curves and levelling

Level 1 costs b XP and each level costs r times the one before, so level L costs b × r^(L−1). The total to reach level L is b × (r^L − 1) ÷ (r − 1). Hours = XP ÷ XP per hour.

Working backwards from total XP earned, add the level costs one at a time until the next would pass it. What is left is the remaining XP to the next level.

## Frame budget and loop cost

The frame budget in ms is 1000 ÷ fps. Entities that fit = (budget − fixed cost) ÷ cost per entity, rounded down. Headroom % = (budget − used) ÷ budget × 100.

Checking every pair of n entities means n × (n − 1) ÷ 2 checks, which grows with n². Working backwards, cost per entity = (measured time − fixed cost) ÷ entities.
