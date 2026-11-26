# 014 — Follow-ups from the module review

**Status:** resolved (2026-11-26): to build
**Raised:** 2026-11-25

Three reviewers checked all 50 subjects. They found no wrong answers in the generated subjects and fixed every factual and wording problem that had a clear fix. The items below were left alone, either because the fix would change many seeds or because it's a judgement call.

## Variety

1. **Small question pools in the fact-list subjects.** Most CSV topic/difficulty cells have only 4–5 rows, so a quiz on one cell shows almost the same set every time.
   - Anatomy repeats facts: the smallest bone is asked at both medium and hard, and the kneecap and femur each come up twice.
   - Elements has 4 rows per cell.
   - *Option:* a careful pass adding checked rows to every fact-list subject.
2. **Thin generator cells** (distinct prompts per 300 seeds):

   | Cell | Distinct prompts |
   |---|---|
   | boolean-logic gates/easy | 16 |
   | boolean-logic truth-tables/easy | 20 |
   | number-bases binary/easy | 42 |
   | geometry pythagoras/easy | 56 |
   | electricity series-parallel/medium | 89 |
   | algorithms complexity/easy | 88 |

   Chemistry balancing has 18 equations per level. health-statistics screening/hard has one template, cells sa-volume/medium has two, and vital-signs temperature medium and hard share a template.
3. **The same prompt at two difficulties** (same seed):
   - collision boxes easy ≈ medium, circles easy ≈ hard, grids medium ≈ hard;
   - boolean-logic gates easy ≈ medium.

   Also, collision rays/medium (one part) is easier than rays/easy (two parts).

## Answer choices and wording

4. **Two wrong options that mean the same thing** (never a second right answer):
   - code-reviewing fix-the-bug offers `x > c` next to `c < x` (about 2–5% of questions);
   - code-writing conditionals/hard offers `== M` next to `not (!= M)`.
5. **Trivial sub-expressions** in boolean-logic truth-tables/hard, such as `B XOR B`.
6. **Hints that are too close to the answer:**
   - ratios/medium when the smallest share is 1 part;
   - waves at 1 MHz (300 / f gives the answer directly);
   - percentages/easy when the original is 100.
7. **Code Writing division note:** the integer-division note shows even when the snippet has no division.
8. **Number shown with decimals:** health-statistics shows a whole-number median or IQR as `56.00` in the choices.

## Rounding

9. **Rounding ties:** algebra linear/hard and arithmetic division/hard can produce exact x.xx5 answers. They round half away from zero, but no intro says so. *Option:* redraw ties, as business-case, networking and the new subjects now do.
10. **verify vs checkAnswer:** in rhythm, ecology and health-statistics, `verify` compares an answer with the unrounded value, so it can disagree with `checkAnswer` near the edges of the tolerance. Grading is unaffected, because the engine only calls `verify` on the generator's own answer.

## Realism (odd but not wrong)

11. Electricity:
    - a "lamp" at 14 mA, 47 kΩ and 658 V;
    - a "196 W LED circuit";
    - a microwave running 10 hours a day.

    Forces & Energy:
    - a 7 kg go-kart;
    - a sandbag thrown up at 42 m/s;
    - a tractor at 108 km/h.

## Already changed by the review (for the record)

- **Old seeds that now rebuild differently:**
  - cells-microscopy magnification/hard, which now uses realistic specimen sizes;
  - business-case (12 of 5,400 seeds) and networking data-transfer (8 of 3,600), which now redraw half-cent answers instead of failing.
- Stored attempts keep their own prompt and answer, so History is unaffected.

## Found later

12. **Networking data-transfer/hard "Size in bits"** can need up to 12 significant digits, but the calculator's **Use** copies only 10. Typing the answer works; Use alone doesn't give it exactly. *Option:* cap sizes so the bit count stays within 10 digits, or ask in a larger unit.

## Resolution (cleared 2026-11-26)

Fix all of them: variety (2–3), choices and hints (4–8), rounding (9, 10, 12) and realistic numbers (11). Item 1 is covered by the fact-list expansion (ticket 013).

**Built 2026-11-26:**
- Items 2–12 are done.
- Item 1 (fact lists) is in progress in batch 2.
- Left as is: momentum/expert "trolleys" at up to about 19 m/s (not in this ticket).
