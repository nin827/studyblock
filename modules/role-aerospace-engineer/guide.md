## General

Aerospace scenarios chain simple steps, so work in order and keep the units straight (kg, N, kN, m/s, km/h, tonnes).

1. Read the stated rules first: g = 9.81 N/kg, air density 1.2 kg/m³, the formulas and any pass mark.
2. Write down which number each part asks for, and its rounding.
3. Convert units before you divide: kN to N, tonnes to kg, m/s to km/h (multiply by 3.6).
4. For a list pick, work out the number needed first, then take the smallest listed size that is at least that.
5. For a verdict, find the numbers first, then compare them using the stated rule. Equal to a limit counts as passing only where the prompt says "at least" or "at most".

## Thrust-to-weight and lift-off

Weight = mass × 9.81 (in newtons; divide by 1000 for kN). Thrust-to-weight ratio = thrust ÷ weight, both in the same units. A ratio above 1 means the thrust beats the weight and the vehicle can leave the pad.

Total mass = dry mass + propellant + payload. A stated launch rule (such as a ratio of at least 1.2) is a minimum: compare the ratio with it.

Acceleration = (thrust − weight) ÷ mass, in newtons and kilograms (1 kN = 1000 N). As propellant burns, the mass falls (burn rate × time) while the thrust stays the same, so the acceleration grows. To compare two accelerations, divide one by the other.

## Lift and stall speed

Dynamic pressure q = ½ × 1.2 × v². Lift = q × wing area × lift coefficient. Weight = mass × 9.81. Level flight needs lift at least equal to weight.

Working backwards, wing area needed = weight ÷ (q × lift coefficient). Take the smallest listed wing that is at least that big.

At the stall, lift equals weight with the lift coefficient at its maximum, so v = √(2 × weight ÷ (1.2 × area × C_L,max)). Approach speed = 1.3 × stall speed. Multiply m/s by 3.6 to get km/h before comparing with a limit in km/h.

## Rocket equation and staging

Mass ratio = starting mass ÷ final mass. Δv = exhaust speed × ln(mass ratio), with the natural log (the ln key on a calculator). A mission is met when Δv is at least the target.

Working backwards, the mass ratio = e^(Δv ÷ exhaust speed). Starting mass = final mass × ratio, and propellant = starting mass − final mass.

For two stages, do each stage separately: stage 1 runs from the full stack mass to the mass left after its propellant is burned, then its empty structure is dropped. Stage 2 starts from what remains. Add the two Δv values.

## Mass and balance

Moment = mass × arm. Total mass = sum of the masses, total moment = sum of the moments, and CG = total moment ÷ total mass. A loading is within limits only if the mass is under the maximum and the CG is between both limits.

When fuel is burned, subtract its mass from the total and its mass × its arm from the total moment, then divide again.

To bring the CG back: moving x kg from one hold to another changes the total moment by x × (destination arm − source arm), and the total mass stays the same. Set the new CG equal to the limit that was broken and solve for x, then round up to a whole kg so the CG ends up inside the limit.

> [!WARNING] Exercise rules only
> These are arithmetic scenarios with made-up vehicles and figures. The formulas, limits and pass marks are set for each exercise, not an aviation or space standard. Never load, plan or size a real aircraft or rocket from these figures: follow the approved data and procedures that apply to your job.
