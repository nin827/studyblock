# 026 — Visuals inside questions (tables, charts, triangles, shapes)

**Status:** open (being built with the defaults below)
**Raised:** 2026-11-27

## Request
Questions show a small visual where it helps: a written-style table of price and cost, a trigonometry triangle, a bar chart, and so on. Roles get them through the subjects they draw from. In Expert, some numbers and labels may be left off on purpose so the learner estimates from the picture, but standard parts (axes, ticks, axis labels) always show.

## Contract: `visual` on a generator question
One optional `visual` per question, at question level (multi-part questions share it). Data only, never markup or markdown: every string is plain text and escaped by the renderer.

```js
visual: {
  kind: "table" | "bar" | "line" | "triangle" | "shape" | "coords",
  caption: "Sales by month",          // optional, ≤ 80 chars
  ...kind fields (below)
}
```

| kind | fields | limits |
|---|---|---|
| `table` | `columns: [string]`, `rows: [[string \| number \| null]]`, `align?: ["left"\|"right"…]`. `null` = blank cell, `"?"` = the asked cell | ≤ 6 columns, ≤ 10 rows, cell ≤ 30 chars |
| `bar` | `categories: [string]`, `series: [{ name, values: [number \| null] }]`, `xLabel`, `yLabel`, `yMax?`, `yStep?`, `showValues: bool` | ≤ 10 categories, ≤ 3 series |
| `line` | `series: [{ name, points: [[x, y]] }]`, `xLabel`, `yLabel`, `xMin/xMax/yMin/yMax?`, `xStep?/yStep?`, `showPoints: bool`, `showValues: bool` | ≤ 3 series, ≤ 20 points each |
| `triangle` | `vertices: [{ label }] ×3`, `sides: [{ label \| null }] ×3` (side i is opposite vertex i), `angles: [{ label \| null, right?: bool }] ×3`, `lengths?: [a, b, c]` (true lengths, used to draw), `toScale: bool` | labels ≤ 12 chars |
| `shape` | `shape: "rectangle" \| "circle" \| "composite-l" \| "cuboid" \| "cylinder" \| "sector"`, `dims: { name: number }` (for drawing), `labels: { name: string \| null }`, `toScale: bool` | |
| `coords` | `xMin/xMax/yMin/yMax`, `points: [{ x, y, label? }]`, `segments: [[i, j]]`, `lines: [{ m, c } \| { x }]`, `showGrid: true` | ≤ 8 points, ≤ 4 lines |

- **Standard parts always draw:** axes, tick marks and tick numbers, axis labels, legends, the right-angle marker. Only data labels and side/angle labels may be omitted.
- **Engine:** `sanitizeVisual` (like `sanitizeGiven`): known kinds only, limits above, finite numbers only, invalid visuals dropped with one warning per module.
- **Stored on attempts** as an optional `visual` field (validated again on import, like `work`), so History and the review show it. CSV modules don't get visuals.

## Rules for generators
1. Built only from values already drawn: **no rng calls** in visual code, so every seed gives the same question as before. Fingerprint touched cells before and after.
2. Easy–Hard: add the visual without changing the prompt text (the numbers stay in the prompt too).
3. **Expert omissions** (only in Expert branches, which may change prompt text): a value left off the visual must also be absent from the prompt, the `given` rows, every hint and the visual's alt text. The explanation may state it.
4. **Estimable:** an omitted length or angle needs `toScale: true` (drawn from true lengths); a value read off a chart must sit on a gridline, or the part's tolerance must be at least half a gridline step, or the part is a choice. `verify` checks this.

## Rendering
- Tables: real HTML `<table>` in `.table-wrap`, styled like a ruled paper note (no web fonts). Charts and shapes: inline SVG with a `viewBox`, theme colours, legible at 360px (minimum text size), series told apart by pattern or marker as well as colour. Axis ticks reuse the nice-ticks helper in `js/lib/graph.js`.
- Shown above the answer in practice, guided, mixes and roles; in feedback/review and History.

## Scope of the first pass
Subjects: Business (business-math, business-case, finance), Trigonometry, Geometry, Statistics, Coordinate Geometry, Kinematics. Roles use them automatically. **Not yet:** role-only scenario modules and other subjects (a later pass).

## Open questions
- **Screen readers and omitted values:** the alt text describes the structure and the visible values only, so a screen-reader user can't estimate a hidden value. *Options:* keep it (default), or give hidden values in the alt text, or skip omissions when a screen reader is detected (not reliably possible).
- **Which other subjects next** (physics graphs, economics supply and demand, structures beams).
