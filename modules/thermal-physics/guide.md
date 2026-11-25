# Thermal Physics: how to solve

## General

- Write down what you know, with units, and what you want.
- Convert first: g to kg (÷ 1000), kJ to J (× 1000), kJ/kg to J/kg (× 1000), kW to W (× 1000), minutes to s (× 60).
- Rearrange the formula so the unknown is on its own, then substitute.
- Easy and medium answers are whole numbers. On hard questions keep full precision and round to 2 decimal places only at the end.

## Specific heat capacity

1. Find the temperature change ΔT: the bigger temperature minus the smaller one.
2. Use `E = m × c × ΔT` with m in kg and E in J.
3. Rearrange if needed: `m = E / (c × ΔT)`, `c = E / (m × ΔT)`, `ΔT = E / (m × c)`.
4. For a final temperature, add ΔT when heating or subtract it when cooling.

Example: 2 kg of water (c = 4200 J/kg °C) heated by 10 °C needs `2 × 4200 × 10 = 84000` J.

**Watch out:** ΔT is a change, not a temperature. Heating from 20 °C to 35 °C is ΔT = 15 °C.

## Latent heat

1. During melting or boiling the temperature stays the same, so use `E = m × L`.
2. Match the units: kg with J/kg gives J; kg with kJ/kg gives kJ.
3. For a heating curve, split it into stages. Use `m × c × ΔT` where the temperature changes and `m × L` where the state changes, then add.

Example: melting 0.5 kg of ice with L = 334 kJ/kg takes `0.5 × 334 = 167` kJ.

**Watch out:** freezing and condensing give out the same energy that melting and boiling take in.

## Temperature scales

1. Celsius to kelvin: add the offset the question gives (273, or 273.15). Kelvin to Celsius: subtract it.
2. Celsius to Fahrenheit: multiply by 9/5, then add 32.
3. Fahrenheit to Celsius: subtract 32, then multiply by 5/9.
4. Kelvin and Fahrenheit: go through Celsius.

Example: 25 °C = 25 + 273 = 298 K, and 25 × 9/5 + 32 = 77 °F.

**Watch out:** a temperature *change* is the same in °C and K, and a change in °F is just 9/5 of the change in °C. Never add 273 or 32 to a change.

## Mixing & heat transfer

1. Heaters: `E = P × t`, with P in W and t in s. Only the efficiency's share is useful: `useful = P × t × efficiency / 100`.
2. Efficiency: `useful energy out / total energy in × 100`.
3. Mixing: energy lost by the hot object = energy gained by the cold one. Write `m1 × c1 × (T1 - T) = m2 × c2 × (T - T2)` and solve for T.
4. Two lots of water: c cancels, so `T = (m1 × T1 + m2 × T2) / (m1 + m2)`.

Example: 1 kg of water at 20 °C mixed with 1 kg at 60 °C ends at `(20 + 60) / 2 = 40` °C.

**Watch out:** the final temperature must lie between the two starting temperatures. If it doesn't, check your signs.
