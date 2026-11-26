## General

Operations problems chain simple steps, so work in order and keep the units straight (minutes, units, pallets, dollars).

1. Read the stated rules: break rules, paid hours, safety limits and the date convention.
2. Counts of things (trucks, workers, pallets) round **up**; a limit measured in whole items (pallets by weight) rounds **down**.
3. Round only as each part asks. The chained answers here are exact, so a rounded earlier answer gives the same later answer.
4. For a Yes/No or segmented verdict, find the number first, then compare it with the stated rule.

## Routes and arrival times

Driving time (minutes) = distance ÷ speed × 60. Breaks: count the **full** 2-hour blocks of driving and add 15 minutes for each.

Arrival (local) = departure + total trip time + the gap between the two UTC offsets (add it if the destination is further east, subtract it if further west).

To work backwards from a deadline, start at the required arrival, subtract the total trip time and the gap, and you have the latest departure.

## Loads and trucks

Boxes = units ÷ units per box, rounded up. Pallets = boxes ÷ boxes per pallet, rounded up. Trucks = pallets ÷ pallets per truck, rounded up.

With a weight limit, pallets by weight = payload ÷ weight of a full pallet, rounded **down**. A truck carries the smaller of the space and weight limits, and that smaller one is the binding limit.

## Staffing and labour cost

Output per worker per shift = units per productive hour × productive hours. Workers needed = demand ÷ that, rounded up. Cost = workers × paid hours × wage.

For a weekly shortfall, extra workers = shortfall ÷ (output per shift × days), rounded up. Overtime pays only for the productive hours needed: shortfall ÷ units per hour, at the overtime rate. Saving % = (dearer − cheaper) ÷ dearer × 100.

## Stock and reorder dates

Reorder point = daily usage × lead time + safety stock. Days until order = (current stock − reorder point) ÷ daily usage. The order date is the count date plus those days.

Working backwards: usage = (reorder point − safety stock) ÷ lead time. Days of cover from safety stock = safety stock ÷ daily usage.
