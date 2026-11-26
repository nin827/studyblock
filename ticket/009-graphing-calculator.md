# 009 — Graphing calculator choices

**Status:** resolved (2026-11-26): built
**Raised:** 2026-11-24

The calculator panel now has a **Sheet | Graph** switch. Graph plots up to six functions of `x` (`y1 … y6`), which can use your sheet rows such as `_a`.

**Defaults chosen**
1. **Where it lives:** only inside the quiz calculator, so it's hidden for subjects with the calculator off (Arithmetic, Fractions, …). *Alternative:* also a standalone Calculator page in the nav, usable outside quizzes.
2. **Trig on the graph uses degrees,** like the sheet. So `sin(x)` needs a wide window (x from -360 to 360) to look like a wave. *Alternative:* radians on the graph only (inconsistent with the sheet).
3. **Graphs aren't saved with your answers.** "Your working" keeps only the sheet rows; points you add to the sheet from the graph are kept. *Alternative:* also save the function list with each answer.
4. **Questions don't come with graphs.** *Alternative:* let generators pre-fill a function (like given values), e.g. for algebra and kinematics questions.

## Resolution (cleared 2026-11-26)

1. **Also a standalone Calculator page** (Sheet | Graph) in the nav, usable outside quizzes.
2. Trig stays in **degrees**.
3. **Save the graph** (function list) with each answer's working.
4. **Questions may pre-fill graph functions** (e.g. algebra, kinematics), like given values.
