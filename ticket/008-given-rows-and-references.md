# 008 — Your rows that use a given value

**Status:** open (built with the default below)
**Raised:** 2026-11-24

Questions fill the calculator with *given* rows such as `_price = 9`. When the next question appears, untouched given rows are replaced by the new question's values.

If you wrote your own row that uses one, like `_total = _price * 2`, it keeps working on the **new** question's `_price` (9 → 18). If the new question has no `_price`, your row shows "unknown value: _price".

**Default:** keep it that way. Your own rows act like a template that re-runs on each question's numbers.

**Alternatives**
- **Freeze it:** a given row that one of your rows uses becomes your own row and stays as it was. The new question's value then appears as `_price_2`, so its name no longer matches the explanation.
- **Ask:** show a small "keep old values?" choice when this happens.
