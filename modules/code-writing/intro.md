# Code Writing

Each question shows a short program with a gap marked `___`. Your job is to complete it so the program does what the question asks. You never type whole programs: you either **type a number** for the blank or **pick** the expression, condition or line that fits.

## Your language

Code is shown in the language you pick: **Python, C#, C++, GDScript or Rust**. Change it on this page or in Settings. Every question works the same way in all five, so you can switch at any time.

## Reading a question

- Read the goal first: what the program should print, or what a function should return. The examples tell you exactly what counts as right.
- Then trace the code line by line with the numbers from the question.
- When a question asks for the **smallest** number, several values would work. Give the lowest one (0 or more).
- Two-part questions ask for the blank **and** what the finished program prints.

## Levels

- **Easy** and **Medium**: one blank in a short program, with the goal spelled out.
- **Hard**: longer snippets, conditions joined with and/or, nested loops, and two-part questions.
- **Expert**: longer programs you have to trace over many steps, then work **backwards** from the output. Expect nested loops with `break`, functions that call other functions or themselves, `if`/`elif` chains where the order of the checks matters, and edge cases such as the first and last position. Most Expert questions have two parts: the blank, then what the finished program prints.

## Things that often trip people up

- **Positions start at 0.** The first item of a list, or the first letter of a word, is at position 0. The last is at length − 1.
- **Ranges stop before their end value.** `range(1, 5)` in Python and GDScript, `1..5` in Rust, and `for (int i = 1; i < 5; i++)` in C# and C++ all count 1, 2, 3, 4.
- **Whole-number division drops the remainder.** `7 // 2` in Python and `7 / 2` in the other languages give 3.
- **`%` gives the remainder.** `7 % 2` is 1, so `n % 2 == 0` means "n is even".
- **`>=` includes the number; `>` does not.** "At least 18" is `>= 18`, and "more than 18" is `> 18`.
- **Order of operations:** brackets first, then `*`, `/` and `%`, then `+` and `-`.
