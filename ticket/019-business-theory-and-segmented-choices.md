# 019 — Business theory subjects and segmented (block-list) choices

**Status:** resolved (2026-11-26): built as decided
**Raised:** 2026-11-26

## What Business had
Business Math, Business Case, Finance and Economics are all calculations; Accounting Terms is a short fact list. There was no theory coverage.

## Added (defaults)
- **Marketing:** 4Ps, Ansoff, Boston matrix, product life cycle, pricing strategies, segmentation.
- **Business Theory:** ownership types, stakeholders, SMART objectives, SWOT and PESTLE.
- **Management:** Maslow, Herzberg, McGregor X/Y, leadership styles, span of control and structure, Porter's generic strategies.
- **Accounting Theory:**
  - double entry (debit | credit);
  - accounting concepts;
  - classifying items;
  - a transaction's effect on assets | liabilities | equity.
- **Finance Theory:** sources of finance, risk and return, interpreting ratios, investment appraisal.

Where a rule decides the answer (Ansoff, Boston matrix, debit/credit), the questions are generated, so they're varied and checked. Pure definitions are fixed lists. Only standard textbook frameworks are used; no country-specific law or tax.

## Segmented choices
Options that combine several facts show as aligned blocks with column labels, e.g. `Elastic | Price ↓ | Revenue ↑`, instead of a sentence.
- Wrong options differ from the answer in 1–2 blocks, so options can be compared column by column.
- Stored answers stay plain text (`Elastic | Price ↓ | Revenue ↑`).
- CSV gets a `cols` column; segments are separated by ` ; `.
- *Alternative:* "build the combination". The learner picks one value per column, like a combination lock, instead of choosing among 4 whole options. That's harder, and it fits Type | Blocks with a multiplier.
- Existing compound options in other subjects are being surveyed for conversion.

## Decisions (user, 2026-11-26)
- **Build | Choose** for block-list questions, defaulting to Build.
  - **Build:** assemble one block per column from a bank with decoys. Order never matters. Full credit.
  - **Choose:** pick one listed option, scored ×1 / 1 / 0.85 / 0.7 (`chooseMultiplier`).
- **Option count:** 3 at Easy, 5 at Medium, Hard and Expert. This applies only to block-list questions; other multiple choice is unchanged.
- **Build decoys** grow with difficulty: 1–2 / 3–5 / 6–9 / 9–14. Filter blocks appears above 10. Each block shows its column, so `↑` under Assets and `↑` under Liabilities are different blocks.

## Closed (user, 2026-11-26)
Built as decided: Build | Choose (default Build), 3/5 options, decoys growing with difficulty.
