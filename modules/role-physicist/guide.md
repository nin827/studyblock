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

## Lenses and light

**Refraction**

1. Snell's law: n1 sin θ1 = n2 sin θ2, with angles from the normal. From air (n = 1.00): n = sin i ÷ sin r.
2. Speed in the material: v = c ÷ n. Working in units of 10⁸ m/s, c = 3.
3. Critical angle: sin C = 1 ÷ n into air, or sin C = n(lower) ÷ n(higher) between two materials.
4. Total internal reflection happens only going into the lower index, at an angle bigger than C.

**Thin lenses**

1. Use 1/f = 1/u + 1/v with real-is-positive signs: u > 0, a real image has v > 0, a virtual image has v < 0, and a diverging lens has f < 0.
2. Rearrange to 1/v = 1/f − 1/u, then take the reciprocal.
3. Size ratio = |v| ÷ u, so image height = object height × |v| ÷ u.
4. For one lens, a real image is inverted and a virtual image is upright. Power = 1 ÷ f with f in metres (dioptres).

**Two lenses**

1. Solve lens 1 on its own.
2. The object distance for lens 2 = the lens separation − the first image distance.
3. Solve lens 2, then multiply the two size ratios for the final height.
4. Each lens that forms a real image turns the picture upside down: count the flips to get the final orientation.

**Light and photons**

1. c = f × λ with λ in metres, so f = c ÷ λ.
2. Photon energy E = h × f, with h = 6.63 × 10⁻³⁴ J s.
3. In a material the frequency stays the same, so λ(material) = λ(air) ÷ n.

**Optical fibre**

1. Work backwards from the critical angle: n(core) = n(cladding) ÷ sin C.
2. Travel time = length ÷ (c ÷ n).
3. A beam entering the end face at angle i refracts to r, then meets the side wall at 90° − r. It stays in the core if that angle is bigger than C.
