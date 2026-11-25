# How to solve: Geometry

## General

- Write down the formula first, then put the numbers in.
- Lengths are in cm, areas in cm², volumes in cm³ and angles in degrees. Type just the number.
- With π, type `pi` in the calculator (not 3.14) and round to 2 decimal places. Answers within 0.005 are accepted.
- Given a diameter but need a radius? Halve it first.

## Perimeter and area

1. Rectangle: area = length × width; perimeter = 2 × (length + width).
2. Triangle: area = ½ × base × perpendicular height; perimeter = the three sides added.
3. Circle: area = π × r²; circumference = 2 × π × r (or π × d).
4. Radius from an area: work backwards, `r = √(A ÷ π)`.

Example: a circle with radius 3 has area `π × 9 ≈ 28.27` cm².

**Watch out:** area and perimeter are different things. Area multiplies, perimeter adds up the edges.

**Expert: composite shapes.** Split the shape into pieces you know (a rectangle and a semicircle), then add or subtract areas. For the perimeter, walk round the outside only: an edge that is now inside the shape doesn't count, and a semicircle's arc is half of π × d.

**Expert: working backwards.** From a perimeter and an area, halve the perimeter to get length + width, then find two numbers with that sum and the area as product. A path of width p round a rectangle adds 2p to each outer measurement; path area = outer area - inner area.

## Angles

1. A triangle's angles add up to 180°. Supplementary angles add to 180°; complementary angles add to 90°.
2. Isosceles triangle: the two base angles are equal, so each is `(180 - apex) ÷ 2`.
3. Polygon with n sides: the interior angles add up to `(n - 2) × 180°`. In a regular one, each angle is that sum ÷ n.
4. Number of sides from an angle: the exterior angle is `180 - interior`, and the exterior angles add to 360°, so `n = 360 ÷ exterior`.

Example: a regular hexagon has angles adding to `4 × 180 = 720°`, so each is 120°.

**Watch out:** it's (n - 2) × 180, not n × 180.

**Expert: interior vs exterior.** Call the exterior angle e, so the interior angle is 180 - e. Turn the sentence into an equation (for example `180 - e = 4e`), solve for e, then n = 360 ÷ e.

**Expert: angles in x or in a ratio.** Add every expression and set it equal to the angle sum (180° or (n - 2) × 180°), solve for x, then substitute back. For a ratio, add the ratio numbers, divide the angle sum by that to get one share, and multiply.

## Pythagoras

1. Find the hypotenuse: the longest side, opposite the right angle.
2. Finding the hypotenuse: square both legs, add them, then take the square root: `c = √(a² + b²)`.
3. Finding a leg: square both, **subtract**, then take the square root: `b = √(c² - a²)`.
4. Easy and medium answers are whole numbers (multiples of triples like 3, 4, 5); hard ones round to 2 decimal places.

Example: legs 6 and 8 → `36 + 64 = 100` → hypotenuse 10.

**Watch out:** don't skip the square root at the end, and don't just add the sides.

**Expert: two steps of Pythagoras.** In a box, first find the base diagonal `√(l² + w²)`, then use it with the height: space diagonal = `√(l² + w² + h²)`. For a slipping ladder, the ladder's length stays the same: find the old height, take off the slip, and use Pythagoras again for the new foot distance. Keep values unrounded until the end.

**Expert: points on a grid.** The distance between two points is `√(Δx² + Δy²)`. A triangle is right-angled only if the two smaller squared lengths add up exactly to the largest; compare the whole-number squares, not rounded lengths.

## Volume

1. Cuboid: volume = length × width × height.
2. Cylinder: volume = π × r² × h (the circle's area times the height).
3. Sphere: volume = 4/3 × π × r³.
4. Halve a diameter first, then put the radius in the formula and round to 2 decimal places.

Example: a cylinder with r = 2 and h = 5 has volume `π × 4 × 5 ≈ 62.83` cm³.

**Watch out:** r³ means r × r × r, not r × 3.

**Expert: working backwards and combining.** From a volume, rearrange: `h = V ÷ (π × r²)` (convert litres to cm³ first: × 1000). Poured liquid keeps its volume, so new depth = volume ÷ new base area. For a solid made of parts, find each volume (the question gives the cone or hemisphere formula) and add. Similar solids with length scale factor k have areas × k² and volumes × k³, so k = ∛(volume ratio).
