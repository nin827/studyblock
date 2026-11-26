## General

These are navigation scenarios that chain simple steps, so work in order and keep the units straight (kt, nm, tonnes, metres, minutes, degrees).

1. Read the stated rules first: the rule of twelfths, the fuel rule, the reserve, the safety limit, the time zones.
2. Convert before you calculate: time in hours = minutes ÷ 60; distance ÷ speed gives hours, × 60 for minutes.
3. Round only as each part asks. The chained answers here do not change if you use an earlier rounded answer.
4. For a verdict, find the number first, then compare it with the stated limit.

## Passage time, ETA and fuel

Time at sea in minutes = distance ÷ speed × 60. Trip fuel = burn rate per hour × time in hours.

For the arrival time, add the time at sea to the departure time, then add the difference between the two UTC offsets (the destination clock is ahead when its offset is larger). A reserve of R% of the trip fuel means the fuel to carry is trip fuel × (1 + R ÷ 100).

Slow steaming: when the burn rate is proportional to the cube of the speed, rate = full-speed rate × (speed ÷ full speed)³. Fuel for the whole passage = rate × distance ÷ speed, so fuel per nautical mile falls with the square of the speed.

## Set, drift and course made good

Set is the direction the current flows toward; drift is its speed. Along the heading a current adds (same direction) or subtracts (opposite).

At right angles the water speed and the drift are the two short sides of a right triangle: ground speed = √(water² + drift²), and the track angle has tan = drift ÷ water speed. The ship is carried toward the side the current flows.

At another angle, let θ be the angle between the heading and the set: along = drift × cos(θ) and across = drift × sin(θ). Ground speed = √((water + along)² + across²) and the track angle is tan⁻¹(across ÷ (water + along)).

To make good a track, steer into the current: sin(angle) = across ÷ water speed, steered away from the side the current pushes, then ground speed = water × cos(angle) + along.

## Tides and under-keel clearance

Range = high water − low water. One twelfth of the range is the unit. From low water the tide has risen 1, 3, 6, 9, 11 and 12 twelfths after 1 to 6 hours; after high water it falls by the same amounts.

Height of tide = low water + the twelfths risen (or high water − the twelfths fallen). Under-keel clearance = charted depth + height of tide − draught.

To cross a bar, the tide must supply draught + minimum clearance − charted depth. Find the first whole hour whose height reaches that, and add the hours to the clock time of low water.

## Closest approach of two ships

Head-on, the gap closes at the sum of the speeds; overtaking, at the difference. Time = gap ÷ closing speed.

For other cases use east and north parts: a ship's east part is speed × sin(course) and north part is speed × cos(course). Relative velocity v = the other ship's velocity − own velocity. The other ship's position from you is r (range × sin(bearing), range × cos(bearing)).

Closest approach is at t = −(r · v) ÷ |v|² (r · v = r_east × v_east + r_north × v_north), and the closest distance is the length of r + v × t.

From two plots, the movement between them is the relative motion: divide by the time between plots to get v, then add own velocity to get the other ship's true velocity. The closest distance from your ship to the line through the two plotted points is |x₁y₂ − x₂y₁| ÷ the distance between the points.
