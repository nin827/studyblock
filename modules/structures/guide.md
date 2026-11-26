# Structures: how to solve

## General

- Write every quantity with its unit, and convert before you calculate: 1 kN = 1000 N, 1 m = 1000 mm, 1 m² = 10⁶ mm², 1 GPa = 1000 MPa.
- Force in N with area in mm² gives stress in N/mm², which is MPa.
- Draw a quick sketch and mark each force and its distance from a point you choose.
- Round only at the end, to what the question asks.

## Moments

1. Moment = force × **perpendicular** distance from the pivot. It is in N·m when the force is in N and the distance in m.
2. A body is balanced when the total clockwise moment equals the total anticlockwise moment about the pivot.
3. A uniform beam's weight acts at its midpoint, so it makes a moment of weight × (distance from midpoint to pivot).
4. With two unknown forces, take moments about one of the unknowns: its own moment is zero, which leaves one equation with one unknown. Then use "up = down" for the other.
5. A plank is about to tip when the reaction at the support it would lift from is zero.

Example: 300 N at 2 m on one side balances a force F at 1.5 m on the other: `F = 300 × 2 ÷ 1.5 = 400` N.

**Watch out:** centimetres must become metres (÷ 100) before giving N·m, and g cancels on a see-saw of masses.

## Stress and strain

1. Stress = force ÷ area. With F in N and A in mm² the answer is in MPa.
2. Strain = change in length ÷ original length, in the same unit for both. Multiply by 100 for a percentage.
3. Young's modulus E = stress ÷ strain. With stress in MPa and E in GPa, remember E × 1000 to get MPa.
4. Extension ΔL = F × L ÷ (A × E).
5. A circular bar has area π × d² ÷ 4.
6. For a minimum area, use the allowed stress: A = F ÷ allowed stress. For a limit on both stress and extension, work out the load each allows and take the **smaller**.

Example: 20 kN on 100 mm² is `20000 ÷ 100 = 200` MPa.

**Watch out:** the extension at a given stress does not depend on the area: ΔL = (σ ÷ E) × L.

## Beams and reactions

1. A beam in equilibrium has RA + RB equal to the total downward load.
2. Take moments about A to find RB: RB = (sum of load × its distance from A) ÷ (distance from A to B). Then RA = total − RB.
3. Check by taking moments about B instead.
4. A UDL acts as w × length at the middle of its length.
5. Shear at a section = RA − all the downward loads to the left of it (a UDL counts only the part to the left). Check it by working from the right: shear = −(RB − the loads to the right).
6. If the answer for one reaction comes out negative, the beam would lift off that support: re-check the distances.

Example: a 10 kN load 2 m from A on a 5 m beam gives `RB = 10 × 2 ÷ 5 = 4` kN and `RA = 6` kN.

**Watch out:** an overhanging load is measured from A, not from B.

## Factor of safety

1. Factor of safety (FoS) = failure (ultimate) stress ÷ working stress, or failure load ÷ working load.
2. Working (allowed) stress = failure stress ÷ FoS, and safe load = working stress × area.
3. If a load is shared by several parts, divide it first.
4. To pick a section, find the minimum area (load × FoS ÷ failure stress), then take the **smallest** standard section whose area is at least that. The FoS it actually gives is then a little higher than required.
5. For a number of cables or bolts, round **up**.
6. For a hanging mass: load = mass × g.

Example: a rod that fails at 400 MPa and works at 160 MPa has `FoS = 400 ÷ 160 = 2.5`.

**Watch out:** a section that is only just too small is still too small: never round the choice down.
