# Collision

Games constantly ask "are these two things touching?". This subject practises the maths behind the answer: boxes, circles, moving points hitting walls, and tile grids.

| Shape | Test |
| --- | --- |
| Two boxes (AABB) | the x ranges overlap **and** the y ranges overlap |
| Two circles | distance between centres < r1 + r2 (or compare squares: dx² + dy² < (r1 + r2)²) |
| Point in circle | dx² + dy² < r² |
| Moving point and a wall | solve `start + velocity × t = wall` for t |
| Point to tile | `col = floor(x / size)`, `row = floor(y / size)` |

**The one rule:** touching does **not** count as overlapping. Two boxes that share only an edge, circles exactly r1 + r2 apart, or a point exactly on a circle's edge are all "No". Every question repeats the rule.

**Axes:** boxes, circles and rays use y up. Tile grids use screen coordinates, with y growing **down** and tile (0, 0) at the top-left.

**Answers:** yes/no questions also ask why, or for the numbers behind the decision, each in its own box. Tile positions are given as column and row. Decimal answers say "round to 2 decimal places" (answers within 0.005 count).
