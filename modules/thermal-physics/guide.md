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

**Expert: experiments and losses.** Energy supplied is `P × t`; if a percentage is lost, only the rest heats the object, so multiply by (100 - loss) / 100 before using `c = E / (m × ΔT)`. Ignoring losses makes c look too big. When a container is heated too, add its own `m × c × ΔT`, and use the heater's useful power (power × efficiency / 100) for the time.

## Latent heat

1. During melting or boiling the temperature stays the same, so use `E = m × L`.
2. Match the units: kg with J/kg gives J; kg with kJ/kg gives kJ.
3. For a heating curve, split it into stages. Use `m × c × ΔT` where the temperature changes and `m × L` where the state changes, then add.

Example: melting 0.5 kg of ice with L = 334 kJ/kg takes `0.5 × 334 = 167` kJ.

**Watch out:** freezing and condensing give out the same energy that melting and boiling take in.

**Expert: timing a heating curve.** List every stage from start to finish (warm the ice, melt, warm the water, boil), add their energies, and divide by the power for the time. A time partway through only counts the stages done by then. To measure L from a boiling kettle, use only the power that isn't lost to the room: `L = (P - P_loss) × t / m`.

## Temperature scales

1. Celsius to kelvin: add the offset the question gives (273, or 273.15). Kelvin to Celsius: subtract it.
2. Celsius to Fahrenheit: multiply by 9/5, then add 32.
3. Fahrenheit to Celsius: subtract 32, then multiply by 5/9.
4. Kelvin and Fahrenheit: go through Celsius.

Example: 25 °C = 25 + 273 = 298 K, and 25 × 9/5 + 32 = 77 °F.

**Watch out:** a temperature *change* is the same in °C and K, and a change in °F is just 9/5 of the change in °C. Never add 273 or 32 to a change.

**Expert: any linear scale.** Turn a reading into the fraction of the way from the freezing point to the boiling point, `(reading - freezing) / (boiling - freezing)`, then turn that fraction into the other scale (× 100 for °C, × 180 + 32 for °F). Uncalibrated thermometers work the same way with their ice-point and steam-point readings. For "°F is k times °C", solve `1.8C + 32 = kC`.

## Mixing & heat transfer

1. Heaters: `E = P × t`, with P in W and t in s. Only the efficiency's share is useful: `useful = P × t × efficiency / 100`.
2. Efficiency: `useful energy out / total energy in × 100`.
3. Mixing: energy lost by the hot object = energy gained by the cold one. Write `m1 × c1 × (T1 - T) = m2 × c2 × (T - T2)` and solve for T.
4. Two lots of water: c cancels, so `T = (m1 × T1 + m2 × T2) / (m1 + m2)`.

Example: 1 kg of water at 20 °C mixed with 1 kg at 60 °C ends at `(20 + 60) / 2 = 40` °C.

**Watch out:** the final temperature must lie between the two starting temperatures. If it doesn't, check your signs.

**Expert: ice in a drink.** First compare the energy the drink gives out cooling to 0 °C with what the ice needs to warm to 0 °C and melt. If there's enough, the spare energy warms all the water (drink + melted ice). If not, the mix stays at 0 °C and only `spare energy / L` of ice melts. With a calorimeter cup, the cup warms too: add its `m × c` to the water's.
