# How to solve: Code Writing

## General

- Read the goal first: what the program should print or what the function should return. The examples tell you exactly what counts as right.
- Trace the code line by line with the question's numbers. Write each variable down as it changes.
- For a number blank, write the line as a small equation (`7 + ___ = 12`) and undo it.
- For a choice, put the example values into every option. Only one matches all the examples.
- If the question asks for the **smallest** number, several values work: give the lowest one (0 or more).

## Expressions

1. Replace each variable with its value.
2. Work in the usual order: brackets, then `*`, `/` and `%`, then `+` and `-`.
3. Write it as an equation with the blank, then undo the steps from the outside in.

Example: `a + b * ___` prints 23 with `a = 3`, `b = 4`. So `4 * ___` must be 20, and the blank is 5.

**Watch out:** whole-number division drops the remainder. Python writes it `7 // 2`; C#, C++, GDScript and Rust write `7 / 2`. Both give 3, and `7 % 2` gives 1.

## Conditionals

1. Say the rule in words: "at least 18", "from 10 to 20", "even".
2. Pick the operator: "at least" is `>=`, "more than" is `>`, "at most" is `<=`, "less than" is `<`.
3. Join checks: both must hold → and (`and` in Python and GDScript, `&&` in C#, C++ and Rust); either is enough → or (`or` / `||`).
4. Test the edge values: the number itself, one below and one above.

**Watch out:** `>=` includes the number and `>` does not. With `>`, a threshold blank is one less than the first value that counts.

## Loops

1. Find the start and end, and how much the loop variable changes each pass.
2. Remember that ranges stop before the end: in Python and GDScript `range(1, 5)`, in C# and C++ `i < 5`, in Rust `1..5` all count 1, 2, 3, 4.
3. Count the passes, or list the values the variable takes.
4. For a `while` loop, check the condition before every pass, including the one that stops it.

Example: a loop starts `i` at 2, adds `i` to a total each pass, and the total should be 9. 2 + 3 + 4 = 9, so the last value is 4 and the end is 5.

**Watch out:** the end value of a range is never used itself, so the end is one more than the last value.

## Lists and strings

1. Positions start at 0. The last item is at length − 1.
2. Write the items (or letters) with their positions under them.
3. For a loop over positions, check what it reads on each pass.

Example: in `"rocket"`, `k` is at position 3 (r=0, o=1, c=2, k=3).

**Watch out:** an answer that only works for one list length is wrong. Use the length (`len(xs)`, `xs.Count`, `xs.size()`, `xs.len()`) instead of a fixed number.

## Functions

1. Match each argument in the call to its parameter, in order.
2. Run the function body with those values and find what it returns.
3. If one function calls another, work out the inner call first.
4. Set up the equation for the blank and solve it.

Example: a function returns `n * ___ + 2`, and calling it with 4 prints 14. So 4 × ___ = 12, and the blank is 3.

**Watch out:** a blank inside the function is the same value on every call, so the second call uses it too.
