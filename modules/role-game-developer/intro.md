# Applied scenarios (Game Developer)

Expert+ questions for the **Game Developer** role. Each one is a single scenario with several linked answers, and each answer uses a different skill: vectors, timing, probability, geometric series, logarithms or cost per frame. A later part often builds on an earlier one, so work in order. The calculator is on, and the numbers from the prompt are already in it where that helps.

Every part says how to round. If you reuse a rounded earlier answer, the later answer still comes out the same. All rules (frame rates, limits, thresholds) are stated in the question, and every game is made up.

## Movement and collision

A character moves by a constant velocity vector each frame towards a wall. Find its speed, the frame it hits the wall, the time that takes, and whether a rule is met. At Expert+ you work backwards from the frames observed to the velocity, speed and heading.

## Loot odds and pity

A drop table gives a rare item with a stated chance per pull. Find the chance of at least one rare in n pulls, the expected pulls, and what a pity cap changes. At Expert+ you find how many pulls a target confidence needs, and judge the plan against a budget.

## XP curves and levelling

Each level needs a fixed multiple of the XP of the one before. Find the cost of a level, the total to reach it and the hours it takes. At Expert+ you start from XP earned so far and work out the level reached and the time to the next.

## Frame budget and loop cost

A frame has only so many milliseconds. Find the budget at a frame rate, how many entities fit, and what pairwise collision checks cost. At Expert+ you work backwards from a measured frame time to the cost per entity and judge how much to cut.
