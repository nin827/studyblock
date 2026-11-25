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

**Expert: several copies, targets and two drops.** "At least k" = 1 − P(0) − P(1) − … − P(k − 1), each from C(n, j) × p^j × (1 − p)^(n − j). To find the rate for a target T within n tries, undo the steps: p = 1 − (1 − T)^(1/n). For two independent drops, multiply the chances of owning each; the average wait for both is 1/a + 1/b − 1/(1 − (1 − a)(1 − b)).

## Critical hits and damage

1. Expected damage per hit = damage × (1 + crit chance × (multiplier - 1)).
2. If attacks can miss, multiply by the hit chance (crits only happen on hits).
3. DPS = expected damage per attack × attacks per second. One attack every t seconds is 1 / t attacks per second.
4. To find the crit chance for a target, undo the steps: c = (target ÷ damage - 1) ÷ (multiplier - 1).

Example: 50 damage, 20% crit at 2× gives 50 × (1 + 0.2 × 1) = 60 per hit.

**Watch out:** a 2× crit deals 2 × damage in total, so it only adds 1 × damage on top. Use (multiplier - 1).

**Expert: kills, caps and armour.** To defeat an enemy within k hits, find the fewest crits that reach its HP, then add the binomial chances of that many crits or more. Crit chance stops at 100%: anything past it is wasted. Flat armour is subtracted from each hit after the crit multiplier, but a hit never deals less than 1.

## Loot tables

1. Add up all the weights to get the total weight.
2. One item's chance = its weight ÷ the total weight.
3. A group of items (a rarity tier): add their weights, then divide by the total.
4. Expected gold = (sum of weight × gold) ÷ total weight. Several chests: multiply by the number of chests.

Example: weights 60, 30 and 10, so the item with weight 10 has a 10 / 100 = 10% chance.

**Watch out:** a weight isn't a percentage unless the weights happen to add up to 100.

**Expert: new weights, pairs and collections.** A new item with weight w has chance w ÷ (total + w); solve for w and round up, and remember every other chance shrinks. Two chests give the same item with the sum of (each chance)². To collect two items A and B (one per chest), average chests = 1/a + 1/b − 1/(a + b), and P(both in n) = 1 − (1 − a)^n − (1 − b)^n + (1 − a − b)^n.

## Pity and streaks

1. A run of k misses has probability (1 - p)^k.
2. Before the pity pull, every pull is ordinary: first hit on pull k is (1 - p)^(k - 1) × p.
3. You reach pity pull N only if the first N - 1 pulls all miss: (1 - p)^(N - 1).
4. Expected pulls with pity at N: (1 - (1 - p)^N) ÷ p. That's a little less than 1 / p.

Example: 10% per pull with pity at 10 gives (1 - 0.9^10) ÷ 0.1 ≈ 6.51 pulls on average.

**Watch out:** reaching pull N needs N - 1 misses, not N. Pull N itself is guaranteed.

**Expert: soft pity, 50/50 and budgets.** Expected pulls = P(T > 0) + P(T > 1) + …; with soft pity, after the fixed-rate part each term is the previous one times the next pull's miss chance. With a 50/50 featured rule you need 1.5 prizes on average, and the worst case is twice the pity. With a counter already at j, only the N − j pulls left matter: if you can afford them all, the prize is certain.
