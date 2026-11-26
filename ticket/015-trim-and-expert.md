# 015 — Trimmed subjects and the Expert difficulty

**Status:** resolved (2026-11-26): to build
**Raised:** 2026-11-25

## Removed (archived)

Balancing & Progression, Pixels & Colour, Collision, Vital Signs and Health Statistics have been taken out of the app. Their folders stay in `modules/`, and they're listed under `archived` in `modules/index.json`. That keeps old History entries showing proper titles. Restoring one means moving its id back into a domain.

Two subjects were merged into broader ones:
- **Cryptography Basics → Number Theory.** The cipher and key topics became Number Theory subtopics.
- **Anatomy → Biology Basics.** The anatomy rows became a human-body subtopic, with duplicates dropped.

**Default chosen:** Medical keeps **Body Measurements** and **Nutrition**. Both are general, everyday health maths.
- *Alternative:* fold both into Biology or Math and remove the Medical domain.

## Difficulty levels: Easy, Medium, Hard, Expert

Each subject offers the levels that make sense for it.

| Level | Subjects |
|---|---|
| **Expert** | Deep subjects with room above Hard: multi-step, multi-concept problems, not just bigger numbers |
| **Hard** (top level) | Most fact lists and simple skills |
| **Medium** (top level) | Only where Hard is no harder than Medium. That Hard tier was removed; old attempts at it stay in History |

The per-subject decisions are in each module's `module.json`. Agents reported any subject where they moved away from the draft plan.

**Result:**
- **35 subjects offer Expert:**
  - Algebra, Geometry, Statistics, Probability, Trigonometry, Sequences, Calculus, Exponents & Logs, Coordinate Geometry, Number Theory.
  - Kinematics, Forces & Energy, Electricity, Waves, Chemistry, Thermal Physics, Gases & Pressure, Astronomy.
  - Number Bases, Boolean Logic, Algorithms, Networking, Data Representation, SQL Queries, Code Writing, Code Reviewing.
  - Business Case, Finance, Economics, Vectors & Movement, Game Probability, Intervals & Scales, Chords, Genetics, Ecology.
- **24 subjects stop at Hard.** Each was checked, and its Hard level is harder than Medium.
- **One subtopic stays Easy-only:** Trigonometry's *Exact values*, a small recall table.
- **Checks:** every existing Easy, Medium and Hard question is byte-identical per seed (fingerprinted before and after, all languages for the code subjects).

**Small Expert pools, by design:**

| Cell | Distinct prompts | Why |
|---|---|---|
| Intervals & Scales *Keys* | 35 per 300 | only 30 key signatures |
| Chemistry *Balancing* | 60 | fixed list of real reactions |

**Judgement calls, left as built:**
1. **Game Probability, Pity and streaks.** The gem-budget question comes out as "certain, 100%" in about 44% of seeds. Narrowing the pull range would make that rarer.
2. **Probability.** Expert tables use decimals (`0.35`), while the other levels use fractions.
3. **Geometry.** Expert bearings are to 2 decimal places, not whole degrees.
4. **Music Theory.** No double sharps or flats. Seventh chords skip degree vii (half-diminished). Harmonic-minor III is called augmented (III+).
5. **Thermal Physics.** "When do °F and K show the same number?" is a single fixed question, about 6% of Temperature-scales Expert.
6. **Code Writing, C++ palindrome question.** A wrong option reads past the end of the text. In C++ that gives a wrong result rather than an error, and the explanation now says so for C++.

## Cap check on the fact lists and simple skills

No subject was capped. In all 12 checked, Hard is at least somewhat harder than Medium. They are capitals, continents, physical-geography, world-history, inventions, vocabulary, word-roots, grammar, map-skills, timelines, body-measurements and nutrition.

Borderline cases, left as they are:
- **Hard is only slightly harder than Medium** in these cells:
  - timelines years-between and centuries;
  - nutrition energy-from-food and energy-units.
- **Nutrition `grams-from-kcal`** is identical on Medium and Hard: its rounding is a no-op, `generator.js` line 307.
- **Fact-list cells with a few Hard rows easier than some Medium rows:**
  - inventions: paper, Channel Tunnel;
  - vocabulary: commonly confused words;
  - world-history: Sputnik;
  - continents: Uruguay;
  - word-roots: semi-, trans-.

**Why nothing was changed:** relabelling CSV rows or removing a level would change which questions existing seeds produce, including in all/all and mixes. Any future cap should be done together with the fact-list expansion in ticket 014.

## Resolution (cleared 2026-11-26)

- Keep the Medical domain.
- Change all four judgement calls: make the gem-budget 'certain' case rarer; Probability Expert uses fractions; Geometry Expert bearings to whole degrees; Music adds half-diminished vii7 and double sharps/flats.
- Nutrition grams-from-kcal: **make Hard harder**.

**Built 2026-11-26:**
- All four judgement calls are done (III+ naming kept), and Nutrition Hard now has a percentage step.
- Fact-list cells now have 10+ rows.
- "Hard easier than Medium" rows relabelled: Sputnik, Uruguay, paper, the Channel Tunnel, principal/principles, semi-, trans-.
