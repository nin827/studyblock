# Electricity: how to solve

## General

- Write down what you know and what you want, then pick the formula that links them.
- Work in base units (V, A, Ω, W). Convert mA to A (÷ 1000) and kΩ to Ω (× 1000) first.
- Rearrange the formula before you substitute, so the unknown is on its own.
- Easy and medium answers are whole numbers. On hard questions round to 2 decimal places at the end.

## Ohm's law

1. Use `V = I × R`.
2. Rearrange it for what you want: `I = V / R` or `R = V / I`.
3. Convert mA and kΩ if the question uses them, then substitute.
4. Convert the result back if the question asks for mA or kΩ.

Example: 12 V across 4 Ω gives `I = 12 / 4 = 3` A.

**Watch out:** mA × kΩ already gives volts, but V ÷ kΩ gives mA, not A.

## Power and energy

1. Choose the power formula that uses what you know: `P = V × I` (V and I), `P = I² × R` (I and R) or `P = V² / R` (V and R).
2. Rearrange it if the unknown is not P. For example `I = P / V` or `I = √(P / R)`.
3. For energy, use `E = P × t` with P in kW and t in hours, which gives kWh.
4. For cost, multiply the kWh by the price per kWh.

Example: a 2000 W heater for 3 h uses `2 × 3 = 6` kWh.

**Watch out:** square only the current (or the voltage), not the whole product. And divide watts by 1000 before working out kWh.

## Series and parallel

1. Series: add the resistances, `R = R1 + R2 + …`.
2. Two in parallel: product over sum, `R = (R1 × R2) / (R1 + R2)`.
3. Combined circuits: work from the inside out. Simplify the inner group first, then combine it with the rest.

Example: 6 Ω and 3 Ω in parallel give `(6 × 3) / (6 + 3) = 18 / 9 = 2` Ω.

**Watch out:** a parallel combination is always smaller than the smallest resistor in it. If yours isn't, check your working.
