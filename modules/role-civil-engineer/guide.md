## General

Engineering scenarios chain simple steps, so work in order and keep the units straight (kN, m, N/mm², cm³, m³).

1. Read the stated rules first: allowable stress, yield stress, E, waste allowance, bulking, tolerances.
2. Convert units before you calculate: 1 kN = 1000 N; 1 kN·m = 10⁶ N·mm; 1 cm³ = 10³ mm³; 1 GPa = 1000 MPa; thickness in mm ÷ 1000 for metres.
3. Round only as each part asks. The chained answers here do not change if you use an earlier rounded answer.
4. Counts of trucks and lorry loads always round up. For a verdict, find the number first, then compare it with the stated rule.

## Beams and section checks

A UDL of w over a length acts as w × length at the middle of that length. Take moments about one support to find the other reaction; the reactions add up to the total load.

The bending moment at a point is the sum of the moments of everything on one side: reaction × distance, minus loads between the support and the point × their own distance to it. With a symmetric load the maximum is at midspan: PL/4 for a central point load and wL²/8 for a UDL.

Required section modulus Z = M ÷ allowable stress (M in N·mm, Z in mm³; divide by 1000 for cm³). A section is adequate if its Z is at least that.

Working backwards: capacity M = Z × stress, then subtract the UDL's share to find what is left for the point load.

## Tie rods and factor of safety

Area of a round rod = π d² ÷ 4 (mm²). Stress = force (N) ÷ area (mm²), in MPa. Factor of safety = yield stress ÷ working stress.

Extension = (stress ÷ E) × length. With E in MPa (GPa × 1000) and the length in mm, the answer is in mm; with the length in metres the shortcut is stress × length ÷ 200 for steel with E = 200 GPa.

To size a rod: minimum area = force × FoS ÷ yield. Take the smallest standard size whose area reaches it, then use that rod's exact area for the extension.

## Concrete quantities and loads

Volume = length × width × thickness, in metres (thickness mm ÷ 1000). Pad footings: number × length × width × depth.

A waste allowance of p% multiplies the volume by 1 + p ÷ 100. Trucks = order ÷ truck size, rounded up, and every truck is billed in full.

Working backwards: volume placed = trucks delivered × truck size − left over. Waste % = left over ÷ ordered volume × 100.

## Levels, cut and fill, setting out

A gradient of 1 in N means 1 m of rise per N m along: rise = length ÷ N. As a percentage it is 100 ÷ N.

The formation level at the far end is the start level plus or minus the rise. Cut means the ground is above the formation (soil is dug out); fill means it is below. The depth is the difference between the two levels.

Volume of a cutting = width × length × average depth (mean of the depths at the two ends). Loosened soil takes up more room: multiply by the stated swell factor, then divide by the lorry size and round up.

For setting out, the horizontal distance and the rise are the two short sides of a right-angled triangle: tan(angle) = rise ÷ horizontal, and the tape length (slope distance) is the hypotenuse.

## Pipes and drainage

A full pipe's flow is Q = A × v, with A = π d² ÷ 4 and d in metres; Q in m³/s × 1000 is L/s. Time to fill = volume ÷ flow (1 m³ = 1000 L).

The invert is the inside bottom of a pipe. Fall = upstream invert − downstream invert, and a gradient of 1 in N has N = length ÷ fall. Further along at the same gradient the invert drops by extra length ÷ N. An outfall clearance check is invert − flood level, compared with the stated gap.

Pump head = static lift (top water level − sump level) + friction loss. Hydraulic power = ρ g Q H (1000 kg/m³, 9.81 N/kg, Q in m³/s) gives watts; input power = hydraulic ÷ efficiency; energy = kW × hours.

Sizing a main works backwards: area needed = Q ÷ maximum velocity, then take the smallest stock diameter whose area reaches it. For a tank against a demand profile, keep a running total of (supply − demand) volume from 0; the storage needed is the highest total minus the lowest.

## Ground and slopes

Total vertical stress σ = Σ(unit weight × thickness) of every band of soil above the point (kN/m³ × m = kPa). Use the stated weight above the water table and the saturated weight below it.

Pore water pressure u = γw × depth below the water table, with γw = 9.81 kN/m³. Effective stress σ′ = σ − u; as a check, it equals the dry weight above the water table plus (γ − γw) × thickness below it.

A pad footing's weight is its volume × the concrete's unit weight. Bearing pressure = (column load + footing weight) ÷ plan area, and its factor of safety = ultimate bearing capacity ÷ bearing pressure.

For a block on a slip plane use the formulas given: disturbing = W sin θ, resisting = c × L + W cos θ × tan φ, FoS = resisting ÷ disturbing. An anchor force T up the slope adds to the resisting side, so the force needed is T = required FoS × disturbing − resisting. Each anchor carries T × spacing; pick the smallest working capacity that is at least that.
