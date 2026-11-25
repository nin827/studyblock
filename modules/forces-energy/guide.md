# Forces & Energy: how to solve

## General

- Write down what you know, with units, and what you want. Then pick the law that links them.
- Convert everything to SI first: g to kg (÷ 1000), km/h to m/s (÷ 3.6), minutes to s (× 60), kJ to J (× 1000), km to m (× 1000), kN to N (× 1000), ms to s (÷ 1000).
- Rearrange before you substitute, so the unknown is on its own.
- Easy and medium answers are whole numbers. On hard questions keep full precision and round to 2 decimal places only at the end.

## Forces

1. Find the resultant force: add forces that point the same way, subtract ones that point the opposite way (friction, weight against a lift cable).
2. Use `F = m × a` in the form you need: `a = F / m` or `m = F / a`.
3. For weight use `W = m × g`, with the g given in the question.

Example: 80 N forward, 30 N friction, 10 kg gives `a = (80 - 30) / 10 = 5` m/s².

**Watch out:** only the resultant force accelerates an object, so subtract friction first.

**Expert:** for connected objects (a truck and trailer, a lift and passenger), first treat everything as one body to find the shared acceleration. Then apply `F = m × a` to one part alone to find an internal force: the tow bar tension, or the scale reading `R = m(g + a)`. To find a braking force from a speed and distance, get the deceleration from `v² = u² + 2as` first.

## Work & power

1. Work done: `W = F × d`, with d in metres.
2. Power: `P = E / t` with t in seconds, or `P = F × v` at a steady speed.
3. Efficiency: `useful out / total in × 100`; wasted energy is `total in - useful out`.

Example: 2 kJ in 40 s gives `P = 2000 / 40 = 50` W.

**Watch out:** minutes and kJ must be converted first, or the answer is off by 60 or 1000.

**Expert:** at a steady top speed the driving force equals the resistance, so `F = P / v`. A pull at an angle θ to the motion does work `F cos θ × d`. Working backwards with efficiency: energy supplied = useful energy ÷ (efficiency ÷ 100), which is always the bigger number.

## Energy

1. Kinetic energy: `Ek = ½ × m × v²`; for the speed, `v = √(2 × Ek / m)`.
2. Potential energy: `Ep = m × g × h`; for the height, `h = Ep / (m × g)`.
3. Falling or thrown up with no air resistance, energy is conserved: `½mv² = mgh`, so `v = √(2gh)` and `h = v² / (2g)`.

Example: 2 kg at 3 m/s gives `Ek = ½ × 2 × 3² = 9` J.

**Watch out:** square the speed before multiplying, and don't forget the square root when finding v.

**Expert:** use an energy balance: energy at the start = energy at the end + energy lost. Friction along a slope wastes `force × slope length`. A bounce that keeps a fraction k of the energy multiplies the height by k and the speed by √k. If a percentage is lost, divide by the fraction kept to work back to the start height.

## Momentum

1. Momentum: `p = m × v`.
2. Collisions and explosions: total momentum before = total momentum after. Objects that stick together share one velocity with mass `m1 + m2`; things pushed apart from rest get equal and opposite momentum.
3. Impulse: `F × t = dp = m × (v - u)`, where dp is the change in momentum.

Example: 2 kg at 6 m/s hits a still 1 kg trolley and they stick: `v = 12 / 3 = 4` m/s.

**Watch out:** direction matters. A velocity the other way is negative, and a bounce changes velocity by `u + v`, not `u - v`.

**Expert:** momentum is always conserved in a collision; kinetic energy is conserved only if it is elastic. Compare the total ½mv² before and after. For recoil, the total momentum is zero, so `M V = m v`. A force that stops the recoil over a distance d satisfies `F × d = ½MV²`.
