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

**Expert (working backwards):** a whole-number division like `y / 5` (`y // 5` in Python) printing 4 only tells you `y` is somewhere from 20 to 24. Turn the printed value into that range first, then find the smallest input that lands in it. For digits: `n / 100` is the hundreds digit, `n / 10 % 10` the tens and `n % 10` the units (Python uses `//`).

## Conditionals

1. Say the rule in words: "at least 18", "from 10 to 20", "even".
2. Pick the operator: "at least" is `>=`, "more than" is `>`, "at most" is `<=`, "less than" is `<`.
3. Join checks: both must hold → and (`and` in Python and GDScript, `&&` in C#, C++ and Rust); either is enough → or (`or` / `||`).
4. Test the edge values: the number itself, one below and one above.

**Watch out:** `>=` includes the number and `>` does not. With `>`, a threshold blank is one less than the first value that counts.

**Expert (order of checks):** in an `if`/`elif` chain only the first true branch runs, so a later branch only sees values the earlier ones let through. Mark on a number line which values each branch takes, then count.

## Loops

1. Find the start and end, and how much the loop variable changes each pass.
2. Remember that ranges stop before the end: in Python and GDScript `range(1, 5)`, in C# and C++ `i < 5`, in Rust `1..5` all count 1, 2, 3, 4.
3. Count the passes, or list the values the variable takes.
4. For a `while` loop, check the condition before every pass, including the one that stops it.

Example: a loop starts `i` at 2, adds `i` to a total each pass, and the total should be 9. 2 + 3 + 4 = 9, so the last value is 4 and the end is 5.

**Watch out:** the end value of a range is never used itself, so the end is one more than the last value.

**Expert (nested loops and two moving values):** count one outer pass at a time and keep a running total. `break` leaves only the inner loop. When two variables move towards each other, the gap closes by both steps each pass.

## Lists and strings

1. Positions start at 0. The last item is at length − 1.
2. Write the items (or letters) with their positions under them.
3. For a loop over positions, check what it reads on each pass.

Example: in `"rocket"`, `k` is at position 3 (r=0, o=1, c=2, k=3).

**Watch out:** an answer that only works for one list length is wrong. Use the length (`len(xs)`, `xs.Count`, `xs.size()`, `xs.len()`) instead of a fixed number.

**Expert (streaks and mirrors):** a streak counter must restart from 0 when the streak breaks. To compare a word with itself backwards, position `i` pairs with `length - 1 - i`; `length - i` runs one past the end.

## Functions

1. Match each argument in the call to its parameter, in order.
2. Run the function body with those values and find what it returns.
3. If one function calls another, work out the inner call first.
4. Set up the equation for the blank and solve it.

Example: a function returns `n * ___ + 2`, and calling it with 4 prints 14. So 4 × ___ = 12, and the blank is 3.

**Watch out:** a blank inside the function is the same value on every call, so the second call uses it too.

**Expert (recursion and helpers):** for a function that calls itself, start at the stopping case and build the values upwards: f(stop), f(stop + 1), … For a helper called inside a loop, work out the helper's result for each value first, then count.

## Write the line

1. Read what the function should return, and both examples.
2. Look at where the blank sits: after `return` it is a value; after `if` or `while` it is a condition that is true or false.
3. Use the pieces the question names (a variable, a number, a helper function) and nothing else.
4. Check your expression with each example before you submit it.

Example: "true when `age` is at least 18" is the comparison `age >= 18`. It is already true or false, so it needs no `if`.

**Watch out:** write only the expression, without `if`, `while`, `return` or the brackets around a C# or C++ condition. In C# and C++ "and" is `&&`; in Python and GDScript it is `and`.

**Lengths and calls:** the length of a list is `len(xs)` in Python, `xs.Count` in C#, `xs.size()` in C++ and GDScript, and `xs.len()` in Rust (`xs.len() as i64` when it is used as a number). A call is the function name followed by its arguments in brackets, separated by commas.

**Expert (several checks):** when one check guards another, such as "the position is valid" before "the item there is positive", put the guard first: `and` stops at the first false part, so the item is never read outside the list.

**Blocks:** a block with `(…)` or `[…]` holds other blocks. Place it first, then fill its slot.

