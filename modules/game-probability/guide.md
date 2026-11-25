# Game Probability: how to solve

## General

- Turn percentages into decimals first: 5% is 0.05, so a miss is 1 - 0.05 = 0.95.
- Independent tries multiply: missing 3 times in a row is 0.95 × 0.95 × 0.95.
- "At least one" = 1 - P(none).
- Expected values add up: the average over 10 chests is 10 × the average of one.
- Keep full precision, then multiply by 100 for a percentage and round at the end.

## Drop rates

1. Write the drop chance p as a decimal, and the miss chance as 1 - p.
2. No drop in n tries: (1 - p)^n. At least one drop: 1 - (1 - p)^n.
3. Average tries until the first drop: 1 / p.
4. Tries needed for a target chance T: solve (1 - p)^n ≤ 1 - T with n ≥ ln(1 - T) / ln(1 - p), then round up.

Example: a 10% drop over 5 tries gives 1 - 0.9^5 ≈ 0.4095, so 40.95%.

**Watch out:** chances don't add up. Five tries at 10% is not 50%.

## Critical hits and damage

1. Expected damage per hit = damage × (1 + crit chance × (multiplier - 1)).
2. If attacks can miss, multiply by the hit chance (crits only happen on hits).
3. DPS = expected damage per attack × attacks per second. One attack every t seconds is 1 / t attacks per second.
4. To find the crit chance for a target, undo the steps: c = (target ÷ damage - 1) ÷ (multiplier - 1).

Example: 50 damage, 20% crit at 2× gives 50 × (1 + 0.2 × 1) = 60 per hit.

**Watch out:** a 2× crit deals 2 × damage in total, so it only adds 1 × damage on top. Use (multiplier - 1).

## Loot tables

1. Add up all the weights to get the total weight.
2. One item's chance = its weight ÷ the total weight.
3. A group of items (a rarity tier): add their weights, then divide by the total.
4. Expected gold = (sum of weight × gold) ÷ total weight. Several chests: multiply by the number of chests.

Example: weights 60, 30 and 10, so the item with weight 10 has a 10 / 100 = 10% chance.

**Watch out:** a weight isn't a percentage unless the weights happen to add up to 100.

## Pity and streaks

1. A run of k misses has probability (1 - p)^k.
2. Before the pity pull, every pull is ordinary: first hit on pull k is (1 - p)^(k - 1) × p.
3. You reach pity pull N only if the first N - 1 pulls all miss: (1 - p)^(N - 1).
4. Expected pulls with pity at N: (1 - (1 - p)^N) ÷ p. That's a little less than 1 / p.

Example: 10% per pull with pity at 10 gives (1 - 0.9^10) ÷ 0.1 ≈ 6.51 pulls on average.

**Watch out:** reaching pull N needs N - 1 misses, not N. Pull N itself is guaranteed.
