# 024 — Domains tab, merged domains, groups inside a domain, more Engineering

**Status:** open (built with the defaults below)
**Raised:** 2026-11-26

## Request
- A Domains tab, like Roles.
- Merge small domains, e.g. Game Dev into Computing, and split big domains into sections (Computing: Data, Architecture, Code, Game…).
- Expand Engineering, which had one subject (Structures).

## Defaults chosen

**Merges** (module ids unchanged, so old attempts still count):
- Game Dev → Computing (asked for).
- Everyday Math → Math, as an "Everyday maths" group.
- *Not merged:* Medical stays its own domain because of its "not medical advice" rules, and Biology was split out on purpose. *Alternatives:* Medical → "Biology & Health"; Geography + History → "Humanities"; Logic & Puzzles → Math.

**Groups** are display-only: `groups: [{ id, title, modules }]` on a domain in `modules/index.json`. The domain's `modules` list stays the source of truth; mixes, presets and export are unchanged (no group weights).
- Math: Number · Algebra & calculus · Geometry · Data & chance · Everyday maths
- Computing: Code · Data · Architecture & networks · Game development
- Science: Physics · Chemistry · Space & measurement
- Business: Accounting · Finance · Economics & markets · Management
- Other domains have too few subjects to group (a group needs 2+). *Alternative:* group Engineering once it has more subjects.

**Saved mixes:** `domainAliases` (`game-dev → computing`, `everyday-math → math`) maps old domain ids in drafts and user presets, so a preset that had Game Dev at weight 0 doesn't suddenly include its subjects. Official presets were rewritten by hand.

**Domains tab:** `#/domains` lists every domain with its groups and subjects. It's in the desktop nav next to Roles; on phones it's a Home card, because the bottom bar stays at four tabs. Home keeps its domain grid, and breadcrumbs still start at Home. *Alternative:* replace Home's domain grid with a link to the tab.

**Engineering:** four new subjects that avoid Science and the role modules:
- Mechanisms (levers, gears, pulleys, torque and power transmission)
- Fluids & Hydraulics (flow rate and continuity, hydraulic presses, pump power, tanks)
- Electronics (resistor colour codes, voltage dividers, LED resistors, RC time constants)
- Tolerances & Fits (limits, fits, tolerance stack-up, measurement error)

**Small overlaps to decide later:**
- Fluids & Hydraulics → Hydraulics Easy/Medium (mechanical advantage, piston travel, pressure needed) is close to Gases & Pressure → *Pressure in context*. Harder levels are engineering-specific (bores, rod-side force, pump flow). *Options:* leave it (recommended), or trim the Easy/Medium kinds.
- Tolerances & Fits → one 10:1-rule question can show a loose 2.6–4 mm band so a steel rule is the right instrument. *Options:* keep, or drop that branch.
- Old sparse mix configs that name `game-dev` without listing its subjects fall back to Computing's defaults. Drafts and presets saved by the builder always list every subject, so this only affects hand-written configs.
