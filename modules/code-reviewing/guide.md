# How to solve: Code Reviewing

## General

- Read the spec and the example first, so you know what the function **should** return.
- Trace by hand: write each variable down every time it changes, line by line. Don't guess from the function's name.
- Line numbers are the ones on the left of the `|`. Brace-only lines count, so the same line can have a different number in C# than in Python.
- Loops stop before their end: `range(a, b)` in Python and GDScript, `i < b` in C#, C++, Java, JavaScript, TypeScript and Go, and `a..b` in Rust all stop before `b`.
- Whole-number division drops the remainder: `//` in Python, `Math.floor(a / b)` in JavaScript and TypeScript, `/` in the other languages. `%` gives the remainder.

## Predict the output

1. Find where the program starts: the top-level lines in Python, C#, JavaScript and TypeScript, `main` in C++, Rust, Java and Go, and `_ready` in GDScript.
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

**Watch out:** keep the rest of the line exactly as it was: the same names and the same order. In C#, C++, Java, JavaScript, TypeScript and Go a loop that should include `n` can end with `i < n + 1` or `i <= n`; in Rust, `1..n + 1` or `1..=n`. In JavaScript and TypeScript, `==` is accepted for `===` here because both sides are numbers.

**Blocks:** the blocks include pieces of the buggy line, so don't just rebuild what is already there.

## Language features

1. Read the question first: is it asking what is printed, which line fails to compile, or for a corrected line?
2. For "what is printed", decide for every variable whether it holds its **own value** or **shares** an object with another name. Then trace line by line.
3. For "which line fails", check each suspicious line against the language rule it might break. Most snippets contain look-alike lines that are fine; compare them.
4. For "type the line", change only what the rule needs and keep the rest of the line as it is.

**Python**

- `/` always gives a float; `//` rounds **down** (so `-7 // 2` is -4); `%` takes the sign of the divisor (`-7 % 2` is 1); `int(x)` cuts towards zero.
- `b = a` shares one list. `a[:]`, `list(a)` and `a.copy()` make a new one. `append`, `xs[i] = …` and `+=` change a list in place; `xs = xs + [v]` builds a new list.
- `[[0] * 3] * 2` repeats **one** inner list; use a comprehension for separate rows.
- A default like `bag=[]` is created once, when `def` runs, and shared by every call that leaves it out.
- `==` compares contents, `is` compares identity. Don't use `is` on numbers or strings.

**C#**

- `int / int` cuts towards zero, even when stored in a `double`. Cast one side first: `(double)a / b`.
- `string` methods return a new string; the old one never changes.
- A `struct` is copied by assignment and by a normal parameter; a `class` is shared. `ref` passes the caller's variable itself. A `List` indexer returns a copy of a struct; an array element doesn't.
- Arithmetic on `int` variables wraps around by default; `checked` throws `OverflowException`; a constant expression that overflows doesn't compile.

**C++**

- `int x` is a copy, `int& x` is the caller's variable, `int* x` points at it (`*x` reaches it, `&v` passes it).
- A reference is bound once: `r = b;` copies b's value into what `r` refers to.
- `/` and `%` truncate towards zero, so `-7 / 2` is -3 and `-7 % 2` is -1.
- Undefined behaviour compiles but has no defined result: an index past the end, reading an uninitialised variable, signed `int` overflow, division by zero, and using a pointer to a variable whose block has ended. Unsigned overflow is defined: it wraps.

**GDScript**

- `int / int` is whole-number division (towards zero); use `float(a) / b` or `a / 2.0`. `posmod` is always 0 or more.
- Arrays and Dictionaries are shared by reference, including when passed to a function; `int`s are copied. `duplicate()` copies the outer container only; `duplicate(true)` copies nested ones too.
- `var x: int = …` and `var x := …` fix the type; plain `var x = …` doesn't. An `int` may go into a `float` variable.
- `range(a, b, s)` stops before b; `for i in 5` counts 0 to 4.

**Rust**

- `let b = a;` or passing `a` by value **moves** a `String` or `Vec`; using `a` afterwards is error E0382. Integers are `Copy`. `.clone()` makes a real copy; `&a` borrows.
- Many `&` borrows, or one `&mut`, at a time. A borrow lasts until its **last use**, not until the end of the block.
- Changing a variable needs `let mut`. `let x = x + 1;` makes a new, shadowing variable instead.
- In a debug build, `u8` overflow panics ("attempt to add with overflow"); `wrapping_`, `saturating_` and `checked_` methods say what to do instead.

**JavaScript**

- `===` compares type and value with no conversion. `==` converts first: strings and booleans become numbers (`""`, `"0"` and `false` are all `== 0`), `null` and `undefined` equal only each other, and `NaN` equals nothing.
- `var` is hoisted and holds `undefined` until its line runs, and it ignores blocks. `let` and `const` belong to their block and throw a `ReferenceError` if read before their line (the temporal dead zone). Function declarations are hoisted with their body.
- `this` comes from how a function is called: `obj.method()` sets it; a method copied out and called on its own, or passed as a callback, gets `undefined` (class code is always strict). Arrow functions keep the surrounding `this`; `.bind(obj)` fixes it.
- `sort()` with no compare function sorts numbers as text (`1, 10, 100, 9`). Use `(a, b) => a - b` (or `b - a` for largest first).
- A `let` in a `for` header is a new variable on every pass; a `var` (or a `let` declared before the loop) is one shared variable, so closures made in the loop all see its final value.

**TypeScript**

- Types are erased when TypeScript compiles to JavaScript. `x as number` converts nothing: use `Number(x)`, `parseInt(x, 10)` or `+x` to convert at run time.
- `any` (for example from `JSON.parse`) is never checked, so a `number[]` can still hold strings, and `+` then joins text.
- `bonus?: number` may be `undefined`. Strict mode rejects arithmetic on it; `x ?? d` falls back only for `null`/`undefined`, `x || d` for any falsy value (0 included), and `x!` only silences the compiler.
- Strict mode also rejects a `string` in a `number` variable, `as` between unrelated types (`"5" as number`), assigning a `const` again, and an object literal missing a required property.

**Java**

- `int` arithmetic wraps around silently, even for constants (`Integer.MAX_VALUE + 1` compiles). `Math.addExact` and `Math.multiplyExact` throw `ArithmeticException`. `long bigger = x + 1;` still adds in `int` first, so cast: `(long) x + 1`.
- On objects (`String`, `Integer`, `Long`), `==` asks "same object?" and `equals` compares contents. String literals and constant expressions are shared; `new String(…)` and run-time concatenation make new objects. Boxed `Integer`s are only guaranteed to be shared from -128 to 127; outside that, `==` is not guaranteed either way. `Integer == Long` doesn't compile.
- `int / int` drops the remainder even when stored in a `double`, and `println` prints a `double` with `.0`. `%` keeps the sign of the left side; `Math.floorDiv` and `Math.floorMod` round down.
- A `char` is a number: `'a' + 1` is the `int` 98, `(char) ('a' + 1)` is `'b'`, and `"" + c + 1` joins text. `c += 1` compiles (it hides a cast); `c = c + 1` doesn't.

**Go**

- A slice is a window (start, length, capacity) onto an array. Slicing and assigning a slice share the array. `append` writes into the same array while the capacity has room (`make([]int, 3, 5)`, `a[:2]`) and copies to a new one when it doesn't (a literal, or `a[:2:2]`). Use `slices.Clone` for a real copy.
- `append` returns the new slice: always store it (`xs = append(xs, v)`).
- Every variable starts at its zero value (0, `""`, `false`, `nil`); a missing map key reads as the zero value.
- `:=` inside a block declares a **new** variable that shadows the outer one until the `}`; `=` assigns to the existing one. With several names, `:=` reuses a name only if it was declared in the same block.
- `for _, p := range xs` gives `p` a copy of each element; write through `xs[i]` or a pointer to change the slice. Since Go 1.22 each pass of a `for` loop has its own loop variable.
