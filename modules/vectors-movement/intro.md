# Vectors & Movement

Every moving thing in a game is driven by a little 2D maths. Here you practise it without any code: just numbers.

| Idea | Formula |
| --- | --- |
| Length of a vector | `√(x² + y²)` |
| Dot product | `a · b = ax·bx + ay·by` (positive: same way, negative: opposite, 0: at right angles) |
| Moving one frame | `distance = speed × delta time`, with `delta time = 1 / fps` |
| Lerp | `lerp(a, b, t) = a + (b − a) × t` |
| Angle of a vector | `atan2(y, x)`, measured from +x, counter-clockwise |

**Axes:** questions use **y up** (+x right, +y up), like maths class. Many 2D engines draw +y *down* on screen; when a question uses screen coordinates it says so.

**Answers:**
- Questions about a vector or a position ask for each component in its own box (x, then y).
- Whole-number answers are exact. Anything else says "round to 2 decimal places" (answers within 0.005 count).
- Angles are in degrees, from 0 up to (not including) 360. Turns are between −180 and 180, with left (counter-clockwise) positive.

The calculator is on, and most questions fill in their starting numbers for you.
