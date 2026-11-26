# Electronics

The small calculations behind real circuits: reading a resistor's colour bands, setting a voltage with two resistors, keeping an LED from burning out, and timing things with a capacitor.

| Formula | Meaning |
| --- | --- |
| value = digits × multiplier | resistor colour code; tolerance gives the range nominal × (1 ± tolerance) |
| Vout = Vin × R2 ÷ (R1 + R2) | voltage divider; R1 on top, R2 at the bottom across the output |
| R = (Vs − Vf) ÷ I | LED series resistor; then fit the next E12 value at or above |
| P = V × I = I² × R | power the resistor turns into heat |
| τ = R × C | time constant; 1 kΩ × 1 µF = 1 ms |
| V = Vs × (1 − e^(−t ÷ τ)) | a capacitor charging from 0 V; about 63% after 1τ, full after 5τ |

**Conventions:** colour bands are read from the end away from the tolerance band. The E12 series per decade is 1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8 and 8.2. Each question says whether to fit the next E12 value at or above, or the closest one. A capacitor counts as fully charged after 5 time constants. Ohm's law (V = I × R) is used as a step; the Electricity subject practises it on its own.

> [!TIP]
> Most slips here are prefixes. Write k (× 1000), M (× 1 000 000), m (÷ 1000), µ (÷ 1 000 000) and n (÷ 1 000 000 000) next to every number, and convert before you calculate.

| Level | What to expect |
| --- | --- |
| Easy | Read a 4-band code, one divider voltage, one LED resistor, one time constant |
| Medium | 5-band codes and choosing bands, finding a divider resistor, rounding up to E12, unit prefixes |
| Hard | Tolerance ranges, closest-E12 dividers and sensors, actual LED current and power, capacitor voltage over time |
| Expert | Picking a resistor that fits a window or a worn band, loaded dividers, LED strings and power ratings, choosing R for a delay or finding C from a measurement |
