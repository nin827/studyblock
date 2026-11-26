# 011 — Guided mode choices

**Status:** resolved (2026-11-26): to build
**Raised:** 2026-11-24

Every subject has a **Practice | Guided** switch on its page. Guided runs use the same generated questions at any difficulty, with hints, unlimited tries and a "Show solution" button. They are never scored or saved.

**Defaults chosen**
1. **Hints:** every generated subject gives 1–4 step hints per question, and all 32 subjects have a "How to solve" card (`guide.md`). The fixed-list subjects (capitals, grammar, …) have the card only: their single-line explanations don't split into hint steps.
2. **Nothing is saved:** guided runs don't appear in History or stats. *Alternative:* save them in History marked "Guided", still excluded from scores.
3. **No guided mixes:** Mix stays scored only. *Alternative:* add a Guided switch to the Mix builder.
4. **Show solution needs no confirmation**, one click. *Alternative:* require one try first.

## Resolution (cleared 2026-11-26)

All four alternatives were chosen:
- **Step hints for the fact-list subjects** (CSV rows get hint steps).
- **Save guided runs in History**, marked "Guided" and never scored.
- **Guided mixes:** a Guided switch in the Mix builder.
- **Show solution needs one try first.**
