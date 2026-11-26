# 017 — Close answers (typos and small numeric errors) get partial credit

**Status:** resolved (being built)
**Raised:** 2026-11-26

## Text: close spelling

A typo is one added, missing or wrong letter, or two neighbouring letters swapped. The normal text cleanup (case, spaces, `−`) runs first.

| Answer length | Typos allowed → credit |
|---|---|
| 1–3 chars | none |
| 4–7 | 1 → 75% |
| 8–14 | 1 → 85%, 2 → 60% |
| 15+ | 1 → 90%, 2 → 75%, 3 → 50% |

Samples: Paris/Pairs 75%; Canberra/Canbera 85%; Mitochondria/Mitocondira 60%; Treaty of Versailles/Treaty of Versaille 90%; Fe/Fr 0%.

Safeguards:
- Never for choice or tiles answers.
- Modules opt out with `"fuzzy": false`: code, SQL, number bases, data representation, ciphers, chemical symbols and formulas, music.
- If the typed text is an exact match for another real answer in the same question set (Austria vs Australia), it gets 0.

## Numbers: small relative error

The question's own tolerance still gives 100%. Beyond that: relative error ≤ 0.1% → 90%, ≤ 1% → 75%, ≤ 2% → 50%, more → 0%.

Samples: 12.57/12.56 90%; 9.81/9.8 90%; 245.3/243 75%; 1.85/1.82 50%; 0.475/0.45 0%.

Safeguards:
- Decimal answers only; whole-number answers stay exact.
- Never for a wrong sign, an answer of 0, or modules with the calculator off.
- A generator can opt out per question.

## Display and stacking

- Feedback reads "Close · NN% credit" with the `circle-dot` icon, plus the correct answer.
- Close credit multiplies with the Blocks multiplier (ticket 016): 0.60 × 0.85 = 51%.
- Multi-part questions get close credit per part.
- Guided mode treats a close answer as "almost" and allows a retry.
- Stored questions record the close-match details (`fuzzy: { kind, typos | relErr, factor }`), optional on import.

## Open

- Should 2 typos give any credit?
- Should the number bands be tighter (e.g. only ≤ 0.5%)?

## Resolution (2026-11-26)

Build it as proposed, except that **2 or more typos give no credit**. Text tiers are now: 1–3 chars exact only; 4–7 chars, 1 typo → 75%; 8–14, 1 typo → 85%; 15+, 1 typo → 90%. The number tiers are unchanged.
