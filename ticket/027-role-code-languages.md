# 027 — Several code languages per run, and four new languages

**Status:** phase 1 and the shared picker built (2026-11-27); phase 2 in progress; phase 3 built as a Frontend Engineer role (no subroles, ticket 028)
**Raised:** 2026-11-27

## Request
- Coding roles can include more than one industry-standard language (Python, C#, C++, Rust…). GDScript and other non-industry languages are excluded there.
- No score bonus (user, 2026-11-27): results and History show which languages were used instead.
- The language choice lives in **Settings**, settable before starting a quiz or role run.
- Add **JavaScript, TypeScript, Java and Go** (user: "add all 4").

## Defaults chosen
- **Settings → Code languages** becomes a multi-select (toggle chips, `aria-pressed`, at least one on), replacing the single `sb_codeLang` pick. Stored as the `sb_codeLangs` cookie (comma-separated ids); an old `sb_codeLang` value seeds it.
- **One shared choice, set anywhere before starting** (user, 2026-11-27): the same language picker shows in Settings, on the Code Writing and Code Reviewing module pages, and on role/subrole pages that show code. All of them read and write the one `sb_codeLangs` preference, so a change in one place shows everywhere (a page re-reads it on render). A role page greys out non-industry languages that are on (e.g. GDScript: "not used in role runs") but never turns them off.
- **Per question:** each code question's language is picked from the chosen set (intersected with the module's `languages`) by a hash of the question's seed, never the generator's rng, so a seed's logic is unchanged. The question stores `lang` as today. One chosen language behaves exactly as before.
- **Roles:** only industry-standard languages count (`industry: true` in `languages.js`: everything except GDScript). If the chosen set has none, role runs use Python.
- **Results and History** show "Code: Python, Rust" for an attempt whose questions carry `lang` (derived from the stored questions, nothing new stored).

## New languages
- Ids `javascript`, `typescript`, `java`, `go`, all industry-standard.
- Phase 1: `languages.js`, `codelang.js` renderers and the blocks lexer, Code Writing and Role Software Engineer (incl. `floatcode.js`).
- Phase 2: Code Reviewing, including hand-written language-feature templates (JavaScript `==`/`===`, hoisting, `this`; TypeScript types vs runtime; Java overflow, `==` on strings, autoboxing; Go slices sharing arrays, zero values, `:=` shadowing).
- Phase 3: a **Frontend Engineer** subrole (Software Engineer) once JavaScript/TypeScript exist (ticket 025 left it out).
- Existing languages generate identical snippets per seed (fingerprinted per language).

## Built: shared picker (rules chosen)
- The last language on can't be turned off, overall or among the chips a page shows (e.g. Code Reviewing with Java + Python on: Python stays). If none of a page's chips are on, the status line says which language is used.
- Role pages show GDScript only when it is on, greyed ("· not used in role runs"); turning off the last industry language there is allowed and role runs then use Python.
- **Behaviour change:** with only GDScript chosen, Software Engineer and Game Developer runs now use Python (previously GDScript), as specified above.
- *Open:* whether to show GDScript on role pages at all when it's on (current: greyed), and whether Game Developer should be the one role that allows GDScript.
