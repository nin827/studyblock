# How to solve: Applied scenarios (Electrical Engineer)

## General

- Read the whole scenario first, then work the parts in order: later parts usually reuse earlier results.
- Write down the stated values (supply voltage, fuse ratings, tariffs, units) and put them in calculator rows.
- Keep full precision in the calculator and round only when you type each answer. Using an earlier rounded answer still gives the same later answer.
- Keep units consistent: watts with volts and amps, watt-hours with hours, bytes with bits (÷ 8).
- For a yes or no judgement, compare your computed number with the stated limit.

## Circuit, power and fuse

1. Combine a parallel pair first: 1/R = 1/R₂ + 1/R₃ (for two resistors, product ÷ sum). Then add series resistors.
2. Current from the supply: I = V ÷ total resistance.
3. Power: P = V × I = V² ÷ R.
4. Fuse: the smallest listed rating above the circuit current. Cable: the smallest rating at least equal to the fuse.
5. Working backwards: R = V² ÷ P for the whole circuit, subtract the series resistor to get the parallel block, then solve 1/R₃ = 1/R_block − 1/R₂.

## Battery and energy cost

1. Energy in Wh = voltage × capacity in Ah (mAh ÷ 1000).
2. Usable energy = stored energy × the allowed percentage.
3. Runtime in hours = usable energy ÷ power in watts.
4. Charging cost: mains energy = stored energy ÷ charger efficiency; convert Wh to kWh, multiply by the tariff.
5. Sizing a pack: energy needed = power × time ÷ usable fraction; capacity = energy ÷ pack voltage; strings in parallel = capacity needed ÷ one cell's capacity, rounded up.

## Registers and flags

1. Each hex digit is four bits: 8 = 1000, 4 = 0100, 2 = 0010, 1 = 0001. Add the weights for the digit.
2. Bits are numbered from 0 at the right. Read a named flag from its bit.
3. AND clears (mask has 0 where you clear), OR sets (mask has 1 where you set), XOR toggles (and applying it twice undoes it).
4. Decimal value = 16 × (first hex digit) + (second hex digit).
5. A logic output such as A AND NOT B is high only when A is 1 and B is 0.

## Sensor data and storage

1. Data rate in bit/s = samples per second × bits per sample. Divide by 8 for bytes.
2. Storage = rate × seconds; per hour use 3600 s, per day 86 400 s. Use the stated meaning of kB, MB and GB.
3. Time to fill = card size ÷ data per hour (or per day).
4. Upload time = bits to send ÷ usable link rate, where the usable rate is the link rate minus overhead.
5. An n-bit converter has 2ⁿ levels. Step = reference ÷ levels; voltage = code × step; code = voltage ÷ step. Bits needed: 2ⁿ ≥ reference ÷ target step, so n = log₂(…) rounded up.
6. Nyquist: sample at least twice the highest signal frequency. Backwards from storage: rate = raw bits per day ÷ (bits per sample × 86 400).
