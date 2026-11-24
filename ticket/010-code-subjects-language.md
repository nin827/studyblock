# 010 — Code subjects: languages and answer style

**Status:** open (built with the defaults below)
**Raised:** 2026-11-24

Code Writing and Code Reviewing show short code snippets in the language you pick: **Python, C#, C++, GDScript or Rust**. Each question is built once in a language-neutral form and shown in your language, so the same question works in all five. You choose on the subject page or in Settings; Python is the default.

**Defaults chosen — please confirm**
1. **"C+" was read as C#**, which pairs with GDScript in Godot. *Alternative:* plain C instead of, or as well as, C#.
2. **Answers are checkable:** a number, a choice, or a line number. You never type whole programs. *Alternative:* free-typed code, checked by a small built-in interpreter. That is much bigger work, and it means running user code safely without `eval`.
3. **Shared subset only:** questions use features every language has (whole numbers, lists, strings, loops, if/else, functions). They avoid negative numbers with `/` and `%`, because the languages disagree there. *Alternative:* add language-specific questions, such as Rust ownership or C++ pointers.
4. **Snippets aren't compiled during testing.** No compilers are installed here, so the C#, C++, GDScript and Rust output was reviewed by reading it, and the logic was checked by a built-in interpreter.
