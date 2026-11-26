# Code Reviewing

Read short functions the way a reviewer does: work out what they do, spot the line that's wrong, and say how to fix it.

**Pick your language.** Snippets can be shown in Python, C#, C++, GDScript or Rust. Choose one on this page or in Settings. Each question is the same in every language; only the spelling changes (except *Language features*, below).

**Line numbers.** Every snippet has a line number on the left, before the `|`. When a question asks for a line, use that number. Brace-only lines count too, so the same bug can sit on a different line in C# than in Python.

## Common bugs

- **Off-by-one error**: a loop runs one time too many or too few, for example stopping before the last value.
- **Wrong comparison**: `<` where it should be `<=`, or `>` where it should be `<`.
- **Wrong operator**: `-` or `*` where the code should add.
- **Wrong starting value**: a total that starts at 1 instead of 0, or a product that starts at 0.
- **Overwrites instead of adding**: `total = x` where it should be `total += x`.
- **Wrong index**: reading `xs[0]` where it should read `xs[i]`.
- **Returns too early**: a `return` inside the loop, so the function stops after the first pass.
- **Infinite loop**: the loop variable never changes, so the loop never ends.

## Rewrite the buggy line

Instead of picking a fix, type the corrected line yourself. The trailing `:`, `;` or `{` is optional, and so are spaces around operators. Easy and Medium tell you which line is wrong; Hard and Expert leave that to you. You can also switch to **Blocks** and build the line from blocks, including slot blocks such as `range(…)` that hold other blocks. At Hard and Expert, block answers earn a little less credit (85% and 70%) than typed ones.

## Language features

These questions are about what makes **your** language different, so they exist only in the language you picked. Unlike the other topics, the same question is not shown in the other languages: switch language and you get that language's questions instead.

- **Python:** `/` vs `//` and `%` with negative numbers, lists shared between names, copies, slices, `==` vs `is`, and mutable default arguments.
- **C#:** whole-number division and casts, immutable strings, `struct` (copied) vs `class` (shared), `ref`, `int` overflow and `checked`, and lines that don't compile.
- **C++:** pass by value, by reference (`int&`) and by pointer (`int*`), integer division, references that can't be re-seated, and spotting undefined behaviour (you are never asked what it prints).
- **GDScript:** `int` vs `float` division, Arrays and Dictionaries shared by reference, `duplicate()`, `for` loops, and typed variables (`: int`, `:=`).
- **Rust:** moves and `clone()`, borrowing (`&` vs `&mut`), `mut`, shadowing, and `u8` overflow in debug builds.

Some ask what is printed, some which line the compiler rejects and why, and some ask you to type a corrected line (or build it from blocks). Medium, Hard and Expert only.

## Levels

- **Easy** to **Hard**: one bug per function, with short programs to predict.
- **Expert**: longer programs that keep changing state (a list being sorted in place, a running total that resets, Euclid's remainder loop, loops over pairs). Bug questions may hide **two** bugs on different lines, and each one matters on its own. In *Fix the bug*, three examples are given and some replacements fix the first example but break another: the right fix has to work for all of them.

## Tip

Every bug question gives an example input and the result it should produce. Trace the code with that input: write down each variable as it changes, line by line. The first place your trace goes wrong is usually the bug.
