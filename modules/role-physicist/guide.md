# How to solve: Applied scenarios (Physicist)

## General

- Read the whole scenario first, then work the parts in order: later parts usually reuse earlier results.
- Write down the stated constants (g, c, specific heats) and put them in calculator rows.
- Keep full precision in the calculator and round only when you type each answer. Using an earlier rounded answer still gives the same later answer.
- Keep units consistent: joules with watts and seconds, km with km/s, hours with per-hour rates.
- For a yes or no judgement, compare your computed number with the stated limit.

## Launch and slide

**Ramp**

1. Along a smooth slope the acceleration is g sin(angle).
2. From rest, L = ½ a t², so t = √(2L ÷ a), and v = a t.
3. Kinetic energy = ½ m v², which equals m g h with h = L sin(angle).
4. With friction, m a = m g sin(angle) − μ m g cos(angle); the mass cancels, so μ = (g sin(angle) − a) ÷ (g cos(angle)). The friction force is μ m g cos(angle).

**Projectile**

1. Vertical speed = u sin(angle), horizontal speed = u cos(angle).
2. Flight time = 2 × vertical speed ÷ g.
3. Range = horizontal speed × flight time. Maximum height = vy² ÷ (2g).
4. For a wall: time to the wall = distance ÷ horizontal speed, then height = vy t − ½ g t².

## Orbits and signals

**Light delay**

1. One-way time = distance ÷ c, in seconds when the distance is in km and c in km/s.
2. Round trip = 2 × one-way. Add any processing time (convert seconds to minutes).

**Kepler's third law**

1. For a Sun-like star, T² = a³ (years, AU). For a star of M solar masses, T² = a³ ÷ M.
2. Orbital speed = 2π a ÷ T, after converting AU to km and years to seconds.
3. Light time from the star = a (in km) ÷ c.

## Decay and safe handling

**Half-life and activity**

1. Each half-life halves the activity. A whole number of half-lives n gives A₀ ÷ 2ⁿ.
2. In general λ = ln 2 ÷ half-life and A = A₀ e^(−λt).
3. Time to reach a limit S: t = ln(A₀ ÷ S) ÷ λ.

**From two readings**

1. A₂ = A₁ × (½)^(Δt ÷ T), so T = Δt × ln 2 ÷ ln(A₁ ÷ A₂).
2. Run the decay backwards for the starting activity: A₀ = A₁ × 2^(t₁ ÷ T).

## Heating and power

**Heating**

1. Energy Q = m c ΔT (joules when c is in J/kg°C).
2. Power is energy per second: time = Q ÷ (efficiency × P).
3. Current I = P ÷ V. Choose the smallest standard fuse rated above the current.

**Unknown metal**

1. Energy supplied = efficiency × P × time. Then c = energy ÷ (m ΔT).
2. Pick the table metal with the closest c, and use its tabulated value for later steps.
3. Cost = power in kW × time in hours × price per kWh.
