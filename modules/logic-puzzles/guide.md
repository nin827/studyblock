# How to solve: Logic Puzzles

## General

- Every puzzle has exactly one answer. If two answers seem to fit, re-read the clues: one of them rules something out.
- Work by **cases**: suppose something is true, follow what it forces, and look for a contradiction.
- Check your final answer against every clue or statement, one at a time.

## Knights and knaves

1. Pick one islander and suppose they are a knight: their statement must be true.
2. Follow what that forces about the others, and check their statements too.
3. If you hit a contradiction, the islander must be a knave instead, so their statement is false.
4. Repeat until everyone is decided.

Useful facts:

- Nobody can say "I am a knave": a knight would be lying and a knave would be telling the truth.
- "A and I are the same kind", said by anyone, means A is a knight (a knave saying it would make it true).
- "B would say that X": if B is a knight, B would say X only if X is true; a knave says the opposite. So the statement is true exactly when B and X agree (knight and true, or knave and false).
- "Or" means at least one part is true. A knave's "or" statement is false, so **both** parts are false.
- "If P, then Q" is false only when P is true and Q is false.

## Ordering puzzles

1. Draw the places in a row: 1st, 2nd, 3rd, …
2. Place anyone whose position is fixed (first, last, "3rd").
3. Clues like "directly in front of" and "exactly two between" tie two people together: treat them as a block and try each place it fits.
4. Use "somewhere ahead", "not next to" and "not first" to cross out the arrangements that don't work.

**Expert** never gives a place: start with the tightest link (a "directly" or "exactly k between" clue), and try each position for it.

## Whodunits

1. Suppose the first suspect did it. Mark each statement true or false.
2. Count the false statements and compare with the rule ("exactly one is lying").
3. Move on to the next suspect. Exactly one suspect fits.

A statement like "Ben is lying" is true exactly when Ben's statement is false. Decide the statement it points to first.

**Expert:** the culprit is one of exactly two liars. Once you find the culprit, the other false statement belongs to the other liar.
