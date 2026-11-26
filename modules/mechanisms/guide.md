# Mechanisms: how to solve

## General

- Write each quantity with its unit. Keep both distances in the same unit (both cm, or both m) when you divide one by the other.
- An ideal machine has MA = VR. A real one has MA < VR, and efficiency = MA ÷ VR.
- Friction never changes a speed or a distance moved, only the force or torque you get.
- Efficiency as a decimal: 85% = 0.85. Divide by it to find the input you need; multiply by it to find the output you get.
- Round only at the end, to what the question asks.

## Levers

1. Balance: effort × effort distance = load × load distance, both measured from the pivot.
2. MA = load ÷ effort. VR = effort distance ÷ load distance (the arms, or the distances the two ends move).
3. With an efficiency: real effort = ideal effort ÷ efficiency.
4. Lever class depends on what is in the middle: pivot (class 1), load (class 2) or effort (class 3).
5. Levers in series (a compound lever) multiply their MAs.
6. To find the shortest arm for a limited effort, solve for the arm, then round **up**: a shorter arm would need too much effort.

Example: a 600 N load 0.2 m from the pivot, effort 1.2 m away: `E = 600 × 0.2 ÷ 1.2 = 100` N.

**Watch out:** a mass must become a weight (× g) before it goes into a moment.

## Gears

1. Gear ratio = driven teeth ÷ driver teeth = input speed ÷ output speed.
2. For two meshing gears, teeth × rpm is the same on both. A bigger driven gear turns slower.
3. Torque goes the other way: ideal output torque = input torque × ratio. With losses, × the efficiency too.
4. Each mesh reverses the direction. An idler gear reverses it again but does not change the overall ratio.
5. In a compound train, gears on the same shaft turn together at the same speed. Multiply the stage ratios.
6. To hit a target speed, find the ratio needed (input ÷ output speed), then the teeth that give it.

Example: a 20-tooth gear at 1500 rpm drives a 60-tooth gear: `1500 × 20 ÷ 60 = 500` rpm.

**Watch out:** a pair written the wrong way round gives the inverse ratio and speeds the output up.

## Pulleys and belt drives

1. In a pulley system, count the rope sections holding up the moving block: that is the VR, and the ideal MA.
2. Ideal effort = load ÷ number of sections. Rope pulled = sections × height raised.
3. Efficiency = MA ÷ VR = (load × height) ÷ (effort × rope pulled).
4. A belt moves at one speed over both pulleys, so diameter × rpm is the same for both.
5. Belt speed = π × D × rpm ÷ 60, with D in metres, gives m/s.
6. For the fewest rope sections with a limited effort, solve for the number, then round **up**.

Example: 4 supporting sections, 800 N load: `effort = 800 ÷ 4 = 200` N, and raising it 1 m pulls 4 m of rope.

**Watch out:** diameters are often in mm: divide by 1000 before working out a belt speed in m/s.

## Torque and power

1. ω (rad/s) = 2π × rpm ÷ 60.
2. P = T × ω: N·m × rad/s = W. Divide by 1000 for kW.
3. Output power = input power × efficiency; power lost = input − output.
4. Stages in series: multiply the efficiencies (0.95 × 0.90 = 0.855, so 85.5%), never add the losses.
5. Through a gearbox or belt: speed ÷ ratio, torque × ratio × efficiency.
6. To size a motor, find the power the load needs, divide by the efficiency, then choose the first standard size at or above it.

Example: 20 N·m at 1500 rpm: `ω = 2π × 1500 ÷ 60 ≈ 157.08` rad/s, so `P ≈ 3141.6` W.

**Watch out:** rpm is not rad/s. Convert before using P = Tω.
