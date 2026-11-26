## General

Electrical scenarios chain simple steps, so work in order and keep the units straight (W, kW, A, V, Ω, mV/A/m, kWh).

1. Read the stated rules first: the supply voltage, the list of breakers, the cable table, the 80% rule, the drop limit and the price per kWh.
2. Convert units before you calculate: 1 kW = 1000 W; 1 V = 1000 mV; energy in kWh = power in kW × hours.
3. Round only as each part asks. The chained answers here do not change if you use an earlier rounded answer.
4. For a verdict, find the number first, then compare it with the stated rule. For a "smallest" choice, take the first size in the list that passes every test.

## Circuit load and breaker

Total current = total power ÷ voltage (P = V × I). A breaker must be rated at or above the current, so take the first listed rating that is not below it. Spare capacity = rating − current.

With an 80% rule the current may be at most 0.8 × the rating, so the rating must be at least current ÷ 0.8. Working backwards: largest current = 0.8 × rating, largest power = voltage × that current, and spare power = largest power − what is already connected. Round counts of whole appliances down.

## Cable and voltage drop

Choose by current rating first: the smallest cable whose rating is at least the load current. Voltage drop (V) = mV/A/m × current × length ÷ 1000. As a percentage of the supply: drop ÷ supply × 100.

To work backwards, largest drop = limit % × supply ÷ 100, and largest mV/A/m = largest drop × 1000 ÷ (current × length). A cable must pass both the rating test and the mV/A/m test.

## Resistor networks and faults

In series, resistances add. For two in parallel, R = (R2 × R3) ÷ (R2 + R3), or add the reciprocals. Treat a parallel pair as one resistor in the series chain, then use I = V ÷ R. The same p.d. is across both branches of a pair, so each branch current = that p.d. ÷ the branch resistance. Power P = I² × R or V × I.

To find a fault, turn the measured current into a resistance (R = V ÷ I). An open-circuit branch leaves only the other branch; a short across a part removes that part. Match the resistance to the fault that gives it.

## Running cost and payback

Energy (kWh) = power (kW) × hours. Cost = energy × price per kWh. Efficiency = output ÷ input, so input power = output ÷ efficiency (as a fraction).

Saving per year = (old input − new input) × hours per year × price. Payback = extra cost ÷ saving per year. Working backwards: energy saved = money saved ÷ price, and hours = energy saved ÷ power saved.
