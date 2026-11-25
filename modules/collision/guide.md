# Collision: how to solve

## General

- Touching does not count as overlapping in this subject: the shared area must be more than 0, and a distance exactly at the limit is a "No".
- Split 2D checks into one axis at a time where you can.
- Boxes, circles and rays use y up. Tile grids use screen coordinates, with y down.

## Boxes

1. Write each box as an x range and a y range.
2. On each axis, overlap = min(the two high ends) − max(the two low ends).
3. The boxes overlap only if both overlaps are more than 0. Area = x overlap × y overlap.
4. Penetration depth on x: compare pushing A left (A's right edge − B's left edge) with pushing it right (B's right edge − A's left edge), and take the smaller.

Example: x ranges [2, 8] and [5, 12] overlap by min(8, 12) − max(2, 5) = 3.

**Watch out:** an overlap of exactly 0 means the boxes only touch, which is a "No".

## Circles

1. Find dx and dy between the centres (or between the centre and the point).
2. Two circles overlap when dx² + dy² < (r1 + r2)². A point is inside when dx² + dy² < r².
3. If you need the real distance, take √(dx² + dy²).
4. Penetration depth = r1 + r2 − distance.

Example: centres 5 apart with radii 2 and 4: 25 < 36, so they overlap, by 6 − 5 = 1.

**Watch out:** square the sum of the radii, (r1 + r2)², not r1² + r2².

## Rays & lines

1. Pick the coordinate the wall fixes: x for a vertical wall, y for a horizontal one.
2. Solve `start + velocity × t = wall`, so `t = (wall − start) / velocity`.
3. For the contact point, put that t into the other coordinate's motion.
4. In a room, only the walls it moves toward matter. The smaller time is hit first.

Example: from x = 2 at 3 per second to the wall x = 14: t = 12 / 3 = 4 s.

**Watch out:** moving toward a wall at a smaller value means both the top and the bottom of the fraction are negative, so the time still comes out positive.

## Grids & tiles

1. Tile of a point: `col = floor(x / size)`, `row = floor(y / size)`.
2. Array index: `row × width + col`. Back again: `row = floor(index / width)`, `col = index % width`.
3. Tiles a box touches: columns from floor(left / size) to ceil(right / size) − 1, and the same for rows.
4. Multiply the column count by the row count for the total.

Example: with 32 px tiles, (70, 40) is in col 2, row 1. On a map 10 tiles wide that is index 1 × 10 + 2 = 12.

**Watch out:** a point on a grid line belongs to the tile to its right or below, but a box edge on a grid line doesn't reach into the next tile.
