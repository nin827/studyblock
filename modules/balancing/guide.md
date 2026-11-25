# Balancing & Progression: how to solve

## General

- Copy the formula from the question and substitute the numbers. Every game has its own rules.
- Counting levels: from level 1 to level L there are L − 1 level-ups.
- When you can't do a partial hit or run, divide and round up.
- Keep full precision in the calculator and round only the answer you type.

## XP curves

1. XP(k) is the cost of going from level k to k + 1. Reaching level n from level 1 needs XP(1) + … + XP(n − 1).
2. For a linear curve, total = count × (first + last) ÷ 2.
3. For a geometric curve (each level × r), total = first × (r^count − 1) ÷ (r − 1).
4. To find a player's level, keep a running total and stop before the level-up that won't fit.

Example: XP(k) = 100 + 50(k − 1) to reach level 4 is 100 + 150 + 200 = 450.

**Watch out:** reaching level n takes n − 1 level-ups, not n.

## Damage and armour

1. Flat armour: damage − armour (watch for a minimum such as 1).
2. A percentage block keeps (1 − block ÷ 100) of the damage.
3. The armour formula damage × 100 ÷ (100 + armour) never reaches zero. With penetration, reduce the armour first.
4. Hits = HP ÷ damage, rounded up. If the first hit lands at 0 s, the time is (hits − 1) × the gap.

Example: 100 damage into 25 armour gives 100 × 100 ÷ 125 = 80.

**Watch out:** do the reductions in the order the question gives. Flat-then-percent is not the same as percent-then-flat.

## Stat scaling

1. Linear growth: base + growth × (L − 1).
2. Compound growth: base × (1 + p ÷ 100)^(L − 1).
3. Additive stacking: add the bonuses, then apply the total once.
4. Multiplicative stacking: multiply by each (1 + bonus) in turn.

Example: 100 with +20% and +30% is 150 additively, but 100 × 1.2 × 1.3 = 156 multiplicatively.

**Watch out:** compound growth multiplies L − 1 times, starting from level 1.

## Game economy

1. Net gold per run = pay − costs, such as repairs.
2. Runs needed = (price − gold you already have) ÷ net gold per run, rounded up.
3. Gold per hour = net gold per run × (60 ÷ minutes per run).
4. Faucets create gold and sinks remove it. The total changes by players × (faucets − sinks) each day.

Example: a 1000-gold mount at 90 gold a run is 1000 ÷ 90 ≈ 11.1, so 12 runs.

**Watch out:** selling loot to an NPC creates new gold (a faucet). Fees and repairs paid to the game are sinks.
