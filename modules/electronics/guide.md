# Electronics: how to solve

## General

- Write every quantity with its unit and prefix, and convert before you calculate: 1 kΩ = 1000 Ω, 1 MΩ = 1 000 000 Ω, 1 mA = 0.001 A, 1 µF = 0.000001 F, 1 nF = 0.001 µF.
- Handy pairs: V ÷ mA gives kΩ, V × mA gives mW, and kΩ × µF gives ms.
- In a series circuit the voltages add up to the supply, and the same current flows through every part.
- Round only at the end, to what the question asks. When an E12 value is fitted, work the later parts with that value, not the exact one.

## Resistor colour codes

1. Hold the resistor so the tolerance band (often gold or silver, set a little apart) is on the right, and read from the left.
2. 4-band: two digit bands, then the multiplier, then the tolerance. 5-band: three digit bands, then the multiplier, then the tolerance.
3. The multiplier band's digit is the number of zeros to add. Gold means ÷ 10 and silver means ÷ 100.
4. Lowest value = nominal × (1 − tolerance ÷ 100); highest = nominal × (1 + tolerance ÷ 100).
5. To choose bands for a value, write it in ohms and split it into the digits and the number of zeros.

| Colour | Digit | Multiplier | Tolerance |
| --- | --- | --- | --- |
| black | 0 | × 1 | |
| brown | 1 | × 10 | ±1% |
| red | 2 | × 100 | ±2% |
| orange | 3 | × 1000 | |
| yellow | 4 | × 10 000 | |
| green | 5 | × 100 000 | ±0.5% |
| blue | 6 | × 1 000 000 | ±0.25% |
| violet | 7 | | ±0.1% |
| grey | 8 | | ±0.05% |
| white | 9 | | |
| gold | | ÷ 10 | ±5% |
| silver | | ÷ 100 | ±10% |

Example: yellow, violet, red, gold is 47 with two zeros: `4700` Ω = 4.7 kΩ, ±5%.

**Watch out:** a resistor only fits a window if its *whole* range (lowest to highest) is inside it, not just its nominal value.

## Voltage dividers

1. R1 is the top resistor (supply to output) and R2 the bottom one (output to 0 V). Vout is across R2.
2. Vout = Vin × R2 ÷ (R1 + R2). The resistors only need the same unit as each other.
3. The voltages split in the same ratio as the resistances: R1 ÷ R2 = (Vin − Vout) ÷ Vout. Use this to find a missing resistor.
4. A load across the output is in parallel with R2: combine them first (R2 × RL ÷ (R2 + RL)), then use that in place of R2. The output always drops.
5. For a sensor (LDR or thermistor), work out Vout for each of its resistances.

Example: 9 V with R1 = 10 kΩ and R2 = 20 kΩ gives `9 × 20 ÷ 30 = 6` V.

**Watch out:** if the load's resistance is not much bigger than R2, the output drops a lot.

## LED resistors

1. The resistor takes the voltage the LED does not: Vs − Vf (for a string of LEDs, Vs − the sum of their Vf).
2. R = (Vs − Vf) ÷ I, with I in amps. Volts ÷ mA gives kΩ.
3. To keep the current at or below the target, fit the next E12 value **at or above** the exact R.
4. Actual current = (Vs − Vf) ÷ the fitted resistor.
5. Power in the resistor: P = V × I or I² × R. Choose a rating with room to spare, as the question states.

Example: 5 V, a 2 V LED and 20 mA: `R = 3 ÷ 0.02 = 150` Ω.

**Watch out:** rounding the resistor down lets more current flow than the LED is meant to take.

## Capacitors and RC timing

1. τ = R × C. In base units (Ω × F) it is in seconds; kΩ × µF gives ms.
2. Charging from 0 V: about 63% of the supply after 1τ, 86% after 2τ, 95% after 3τ, and it counts as full after 5τ.
3. Charging: V = Vs × (1 − e^(−t ÷ τ)). Discharging from V0: V = V0 × e^(−t ÷ τ).
4. Time to reach V while charging: t = −τ × ln(1 − V ÷ Vs), the same as τ × ln(Vs ÷ (Vs − V)).
5. To find R or C for a time, rearrange: R = t ÷ (C × ln(…)), or C = τ ÷ R.

Example: 10 kΩ and 100 µF give `τ = 10 × 100 = 1000` ms = 1 s, so full charge takes about 5 s.

**Watch out:** on a calculator, `ln` is the natural log and `log` is base 10.
