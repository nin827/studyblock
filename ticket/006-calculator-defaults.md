# 006 — Calculator: defaults to confirm

**Status:** open (built with the defaults below)
**Raised:** 2026-11-24

The calculator is being built with these choices. Change any you disagree with.

1. **How long the stored values last.** One sheet per quiz run: values carry across questions in the same quiz, survive a reload, and are cleared when a new quiz starts.
   - Alternative: keep the sheet across quizzes until cleared.
   - Alternative: a fresh sheet for every question.
2. **Trig functions use degrees.** Alternative: radians, or a DEG/RAD toggle.
3. **Shown on text-only subjects too.** World Capitals and Chemical Elements get the calculator as well, since "all except Arithmetic" was the request. Alternative: hide it where no question has a number answer.
4. **Your working is saved.** A snapshot of the rows (up to 30) is stored with each answered question and shown in the review and History. Alternative: don't store it.
5. **`%` means modulo** (`10 % 3 = 1`), not percent. Alternative: `%` as percent (`50% = 0.5`) with `mod()` for modulo.
6. **Renaming a label updates references to it.** Rename `_a` to `_speed` and `_b = _a*3` becomes `_b = _speed*3`.
7. **Labels start with an underscore** (your request). `_e` is your value and `e` is Euler's number. A label typed without `_` gets one added.
