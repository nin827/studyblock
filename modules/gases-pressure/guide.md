# Gases & Pressure: how to solve

## General

- Write down what you know, with units, and what you want.
- Convert first: cm² to m² (÷ 10 000), mm² to m² (÷ 1 000 000), cm to m (÷ 100), kPa to Pa (× 1000), °C to K (+ 273).
- Rearrange the formula so the unknown is on its own, then substitute.
- Easy and medium answers are whole numbers. On hard questions keep full precision and round to 2 decimal places only at the end.

## Pressure

1. Find the force. For something resting on the floor it is its weight, `W = m × g`.
2. Find the contact area in m². For a rectangle, convert each side to metres before multiplying.
3. Use `P = F / A`, or rearrange: `F = P × A`, `A = F / P`.

Example: 600 N on 300 cm² = 0.03 m² gives `P = 600 / 0.03 = 20000` Pa.

**Watch out:** 1 cm² is 1/10 000 of a m², not 1/100. Square the length factor.

## Liquid pressure

1. Use `P = ρ × g × h` with ρ in kg/m³, g = 9.8 N/kg and h in metres.
2. Rearrange if needed: `h = P / (ρ × g)`, `ρ = P / (g × h)`.
3. For a difference between two depths, use the difference in depth: `ΔP = ρ × g × Δh`.

Example: water (1000 kg/m³) at 5 m: `1000 × 9.8 × 5 = 49000` Pa.

**Watch out:** h is the depth below the surface, not the height from the bottom.

## Gas laws

1. Decide what stays constant: temperature (Boyle), pressure (Charles), volume (pressure law), or nothing (combined).
2. Convert every temperature to kelvin: K = °C + 273.
3. Write the law, rearrange for the unknown and substitute. Pressure and volume units only need to match each other.
4. If the answer is a temperature in °C, convert back from kelvin at the end.

Example: 300 cm³ at 100 kPa squeezed to 150 kPa at constant temperature: `V2 = 100 × 300 / 150 = 200` cm³.

**Watch out:** doubling the °C temperature does not double the volume. Only kelvin temperatures are proportional.

## Pressure in context

1. Hydraulics: the pressure is the same on both pistons, so `F1 / A1 = F2 / A2` and `F2 = F1 × A2 / A1`, with both areas in the same unit.
2. For circular pistons the area ratio is `(d2 / d1)²`.
3. Total pressure at depth: `P = P_atm + ρ × g × h`. Subtract P_atm first when you are given a total.
4. Force on a surface: pressure (Pa) × area (m²).

Example: 50 N on 5 cm², large piston 100 cm²: `F2 = 50 × 100 / 5 = 1000` N.

**Watch out:** atmospheric pressure acts on both sides of a hatch with air inside, so only the liquid's pressure gives a resultant force.
