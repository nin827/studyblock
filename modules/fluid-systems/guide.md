# Fluids & Hydraulics: how to solve

## General

- Write every quantity with its unit, and convert before you calculate: 1 m = 1000 mm, 1 m³ = 1000 L, 1 minute = 60 s, 1 bar = 100 000 Pa = 0.1 N/mm², 1 kW = 1000 W.
- A round pipe or piston has area π × d² ÷ 4. Keep the diameter in the unit you want the area in (mm gives mm², m gives m²).
- Where water's weight matters, use ρ = 1000 kg/m³ and g = 9.81 N/kg (the question says so).
- In a chain of steps, keep the unrounded value in the calculator and round only what each part asks for.

## Flow rate and continuity

1. Flow rate Q = area × average speed. With A in m² and v in m/s, Q is in m³/s; × 1000 gives L/s.
2. To find a speed, v = Q ÷ A; to find an area, A = Q ÷ v.
3. A full pipe passes the same flow everywhere: A1 × v1 = A2 × v2.
4. Area goes with the diameter squared, so v2 = v1 × (d1 ÷ d2)².
5. Where a pipe splits, the branch flows add up to the main flow.
6. To size a pipe for a speed limit, find the minimum area Q ÷ v_max, then d = √(4A ÷ π). Choose the smallest stocked pipe at least that wide.

Example: a 100 mm pipe at 2 m/s carries `pi * 0.1^2 / 4 * 2 = 0.0157` m³/s, which is 15.7 L/s.

**Watch out:** halving the diameter does not double the speed. It makes it 4 times as fast.

## Hydraulic presses and jacks

1. Pascal's principle: the pressure is the same on every piston, so F1 ÷ A1 = F2 ÷ A2.
2. Mechanical advantage = load ÷ effort = large area ÷ small area.
3. The oil's volume does not change: small area × small piston's travel = large area × large piston's rise.
4. Cylinder force = pressure × area. With the pressure in N/mm² (bar × 0.1) and the area in mm², the force is in N.
5. A double-acting cylinder pushes on the full bore, π × D² ÷ 4, but pulls back on the ring around the rod, π × (D² − d²) ÷ 4. It pulls with less force and retracts faster.
6. Piston speed = oil flow ÷ area. Convert L/min to mm³/s: × 1 000 000 ÷ 60.
7. For pump strokes, round **up**. For a catalogue bore, take the smallest one at least as big as the minimum.

Example: 100 bar on a 50 mm bore gives `10 * pi * 50^2 / 4 = 19635` N, about 19.6 kN.

**Watch out:** if friction lets only 90% of the force through, divide the load by 0.9 before sizing the bore.

## Pumps and power

1. Hydraulic power P = ρ × g × Q × H in W, with Q in m³/s and H in m. With Q in L/s, P = 9.81 × Q × H.
2. From a pressure: P = p × Q (Pa × m³/s = W; kPa × L/s = W too).
3. Efficiency = output ÷ input. So input = output ÷ efficiency, which is always bigger.
4. Efficiencies in a chain multiply: overall = motor efficiency × pump efficiency.
5. Energy in kWh = input power in kW × hours. Cost = kWh × price per kWh.
6. Working back from a motor: available hydraulic power = motor power × efficiency, then Q = P ÷ (ρgH).
7. Payback = extra purchase price ÷ yearly saving.

Example: 20 L/s up 15 m gives `9.81 * 20 * 15 = 2943` W. At 70% efficiency the pump takes in 2943 ÷ 0.7 = 4204 W.

**Watch out:** multiplying by the efficiency gives the output, not the input. Check that the input comes out bigger.

## Tanks: filling and draining

1. Box tank: volume = length × width × depth. Round tank: volume = π × d² ÷ 4 × depth. m³ × 1000 gives litres.
2. Time to fill = volume ÷ flow rate. Keep the units matched (litres with L/min gives minutes).
3. With flow in and flow out together, use the net flow: in − out. If it is negative, the level falls.
4. Rate of level change = net flow (m³/s) ÷ base area (m²), in m/s. × 100 × 60 gives cm/min.
5. Time to reach a level = change in depth ÷ rate of change.
6. Working backwards to a pump or supply flow: the volume to move ÷ the time allowed gives the net flow needed. Then add back (or take away) what flows out at the same time.

Example: a 2 m by 1.5 m tank with 3 L/s net inflow rises `0.003 / 3 * 100 * 60 = 6` cm/min.

**Watch out:** the base area is what matters for the level, not the tank's whole volume.
