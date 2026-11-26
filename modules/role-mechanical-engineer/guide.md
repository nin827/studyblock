## General

Mechanical scenarios chain simple steps, so work in order and keep the units straight (mm, µm, N, kN, N·m, N/mm², bar, rpm, kW).

1. Read the stated rules first: the torque formula, the stress areas, π = 3.14, how the stack-up is combined.
2. Write down which number each part asks for, and its rounding.
3. Convert units before you divide: kN to N, mm to µm, L/min to mm³/s.
4. For a catalogue pick, work out the number needed first, then take the smallest listed size that is at least that.
5. For a verdict, find the numbers first, then compare them using the stated rule.

## Gear train and motor sizing

Ratio of a stage = driven teeth ÷ driver teeth. Overall ratio = the product of the stages. Output speed = motor speed ÷ overall ratio.

Motor torque (N·m) = 9550 × power (kW) ÷ speed (rpm). Output torque = motor torque × overall ratio × efficiency (as a fraction). A slower output means a bigger torque, less the losses.

Working backwards: torque needed at the motor shaft = load torque ÷ (overall ratio × efficiency). Compare it with each motor's rated torque (9550 × kW ÷ rpm) and take the smallest motor that is at least as big.

When each stage has its own efficiency, the overall efficiency is their product (two equal stages: the efficiency squared). A verdict that needs both a speed band and a torque is Yes only if both hold.

## Bolt and shaft stress check

Force per bolt = total load ÷ number of bolts. Stress (N/mm²) = force in newtons ÷ stress area in mm². Factor of safety = yield strength ÷ stress.

Working backwards: stress allowed = yield ÷ required factor of safety, so area needed = force per bolt (N) ÷ stress allowed. Take the smallest listed bolt whose area is at least that, then use its own area for the actual factor of safety.

For a solid shaft: torque from power and speed (9550 × kW ÷ rpm), then shear stress = 16 × torque (N·mm) ÷ (π × diameter³). Shear yield = 0.6 × tensile yield, and the factor of safety = shear yield ÷ shear stress. Because the diameter is cubed, a small step up in size gives a big gain in safety: try the listed sizes from the smallest up.

## Fits and assembly tolerances

Convert every size to micrometres (1 mm = 1000 µm) before subtracting. Largest clearance = largest hole − smallest shaft. Smallest clearance = smallest hole − largest shaft. A negative clearance is an interference.

Fit type: if the smallest clearance is positive, it is a clearance fit. If even the largest is negative, it is an interference fit. Otherwise (smallest negative, largest positive) it is a transition fit.

Stack-up: gap = housing − the sum of the parts. Worst case adds all the tolerances: largest gap = nominal + total, smallest gap = nominal − total. Root-sum-square (RSS) squares each tolerance, adds the squares and takes the square root, which is smaller than the plain total. A design passes when its smallest gap is at least the required gap.

## Hydraulic cylinder and pump

Area = 3.14 × d² ÷ 4. Pressure (N/mm²) = force in newtons ÷ area, and bar = N/mm² × 10. Flow in mm³/s = L/min × 1 000 000 ÷ 60, and speed = flow ÷ area.

Hydraulic power (kW) = pressure (bar) × flow (L/min) ÷ 600. A motor must supply more than that because the pump is not perfect: motor power needed = hydraulic power ÷ pump efficiency, then take the smallest listed motor at or above it.

A double-acting cylinder pushes on the full piston area when extending, but pulls on the ring-shaped area (piston area minus rod area) when retracting. A smaller area means a smaller force at the same pressure and a faster stroke at the same flow.
