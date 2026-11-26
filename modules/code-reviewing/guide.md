# How to solve: Code Reviewing

## General

- Read the spec and the example first, so you know what the function **should** return.
- Trace by hand: write each variable down every time it changes, line by line. Don't guess from the function's name.
- Line numbers are the ones on the left of the `|`. Brace-only lines count, so the same line can have a different number in C# than in Python.
- Loops stop before their end: `range(a, b)` in Python and GDScript, `i < b` in C# and C++, and `a..b` in Rust all stop before `b`.
- Whole-number division drops the remainder: `//` in Python, `/` in the other languages. `%` gives the remainder.

## Predict the output

1. Find where the program starts: the top-level lines in Python and C#, `main` in C++ and Rust, and `_ready` in GDScript.
2. Make a small table with one column per variable.
3. Go through the program line by line. Each time a value changes, add a row to the table.
4. For a loop, write down the loop variable on every pass. Stop as soon as the condition is false.
5. Read off what is printed, in order.

Example: a loop that starts `i` at 1, adds 2 each pass and stops before 7 runs with `i` = 1, 3, 5. If each pass prints `i * 2`, it prints 2, 6 and 10.

**Watch out:** a value that changes inside the loop carries over to the next pass. Don't restart it.

**Expert:** keep a full table. For a list that is changed in place (swaps), rewrite the whole list after each change. For a remainder loop such as `b = a % b`, save the old value before it is overwritten, exactly as the code does.

## Find the bug

1. Work out what the function should return for the example (the question tells you).
2. Trace the code with the example input, line by line.
3. Compare your trace with what the spec needs. The first line where they disagree is the bug.
4. Check the usual suspects: the starting value, the loop's first and last pass, the comparison, the update line, and where the `return` sits.

**Watch out:** the bug is the line that is *wrong*, not the line where the wrong number first shows up later.

**Expert (two bugs):** after you find one wrong line, keep checking the rest. Fix the first bug in your head and trace again: if the answer is still wrong, there is a second bug.

## Fix the bug

1. Find the wrong line, as in *Find the bug*.
2. Say in words what that line should do: "start at 0", "stop after the last item", "add, don't replace".
3. Put each replacement in its place and rerun the example.
4. Keep the one that gives the right answer **and** would work for any input.

**Watch out:** a replacement can match the example by luck. Test it on a second, different input in your head.

**Expert:** three examples are given on purpose. Some replacements fix the first example and break the second or third; run every example before you choose.

## Bug types

1. Find the wrong line first.
2. Name the kind of mistake from the list below.

| Bug type | What it looks like |
|---|---|
| Off-by-one error | the loop runs one time too many or too few |
| Wrong comparison | `<` instead of `<=`, or `>` instead of `<` |
| Wrong operator | `-` or `*` where it should add |
| Wrong starting value | a total starting at 1, or a product starting at 0 |
| Overwrites instead of adding | `total = x` instead of `total += x` |
| Wrong index | reads `xs[0]` instead of `xs[i]` |
| Returns too early | `return` inside the loop |
| Infinite loop | the loop variable never moves towards the end |

**Watch out:** a changed loop *end* is usually an off-by-one error, even though it is written with a comparison or a `+ 1`.

**Expert (two bugs):** name each bug on its own line. A changed inner-loop start (such as `j` starting at `i` instead of `i + 1`) is an off-by-one error too.

## Rewrite the buggy line

1. Read the spec and the example result.
2. Trace the example and find the first line where the trace goes wrong (Easy and Medium tell you the line).
3. Work out what that line should do, and change only the part that is wrong.
4. Type the whole corrected line. The trailing `:`, `;` or `{` is optional.
5. Trace the example again with your line in place.

Example: the spec is "1 + 2 + … + n" and the loop line is `for i in range(1, n):`. It stops before `n`, so the fix is `for i in range(1, n + 1)`.

**Watch out:** keep the rest of the line exactly as it was: the same names and the same order. In C# and C++ a loop that should include `n` can end with `i < n + 1` or `i <= n`; in Rust, `1..n + 1` or `1..=n`.

**Blocks:** the blocks include pieces of the buggy line, so don't just rebuild what is already there.

