# StudyBlock

Procedurally generated quiz app. Plain HTML/CSS/JS, runs entirely in the browser, stores everything locally.

> AI-coded with human supervision.

## Hard rules

- **No build step, no npm.** Native ES modules only (`<script type="module">`). Node is not installed.
- **No third-party assets except Lucide icons**, vendored as `vendor/lucide.min.js` (v0.460.0, ISC, licence in `vendor/LICENSE-lucide.txt`) and loaded by `index.html`. Nothing is loaded from a CDN, so the app works fully offline. To upgrade, replace the file with a pinned version (download only with the user's OK). No markdown/CSV/UI libraries — those are hand-rolled in `js/lib/`.
- **Must be served over HTTP** (ES modules, `fetch`, and cookies don't work on `file://`):
  ```
  py -m http.server 8000
  ```
  (`py` works on this machine; `python` does not.) Preview config lives in `.claude/launch.json`.
- Never put personal details (names, emails) in project files.

## Safety

- **Commands:** only read-only commands, `git status/diff/log/add/commit`, and the local dev server. No `rm -rf`, `git reset --hard`, `git push --force`, `git clean`, installers, downloads, or anything outside the project folder. The dev server binds to localhost only: `py -m http.server 8000 --bind 127.0.0.1`.
- **Code:** no `eval`, `new Function`, or `innerHTML` of unescaped text — escape all CSV, markdown, imported-file and user-input content. Markdown links allow only `http:`, `https:` and relative URLs. Module ids must match `^[a-z0-9-]+$` before being used in a fetch/import path; only load modules listed in `modules/index.json`. Imported progress files are validated as data and never executed.
- **Tests:** run in the in-app browser preview against the localhost server only.

## Workflow

- **Main chat orchestrates; subagents implement or fetch.** The main session plans, writes contracts/instructions, reviews diffs and verifies in the browser. Implementation and web lookups go to subagents with a narrow, explicit brief. Parallel agents must never touch the same files.
- **Don't block on questions.** Open questions/decisions go into `ticket/NNN-slug.md` (see `ticket/README.md`) and work continues with a sensible default. When the user says "clear tickets", walk through the open ones.
- **Group commits, then push as a checkpoint.** Commit one coherent unit of work (a feature, a module, a fix set), not every small file change. Commit only finished, tested work: never half-written files a running agent still owns. After each grouped commit, push to `origin main`.

## Layout

```
index.html              app shell, loads vendor/lucide.min.js + js/app.js
vendor/                 Lucide (the only third-party file) + its licence
css/style.css           theme tokens (light/dark), layout
js/app.js               bootstrap + hash router
js/views/*.js           home, module, quiz, results, settings views
js/lib/markdown.js      tiny markdown -> HTML (escape first, then format)
js/lib/csv.js           RFC4180-ish CSV parser (quotes, commas, newlines, "")
js/lib/rng.js           seeded PRNG (mulberry32) + helpers
js/lib/storage.js       localStorage store, cookie cache, import/export
js/lib/engine.js        loads modules, generates + verifies questions, checks answers
js/lib/calc.js          calculator parser/evaluator + live sheet (no eval)
js/lib/languages.js     code languages list (python, csharp, cpp, gdscript, rust)
js/lib/codelang.js      language-neutral code AST, 5 renderers, interpreter
js/lib/music.js         note/interval/scale/chord helpers (build + independent check) for Music Theory
js/views/guided.js      guided-mode helpers (mode switch, hint steps, guide.md)
js/lib/graph.js         graph maths: sampling, ticks, zeros/extrema/intersections
js/views/calculator.js  calculator panel (Sheet | Graph); js/views/graph.js = graph UI
modules/index.json      registry: list of module ids
modules/<id>/module.json
modules/<id>/intro.md   optional markdown shown on the module page
modules/<id>/guide.md   optional "How to solve" notes for Guided mode
modules/<id>/generator.js   (type "generator")
modules/<id>/questions.csv  (type "csv")
```

## Hierarchy

**Domain** (Math, Science, Geography, Business, …) → **Subdomain** = a module (Arithmetic, Algebra, …) → **subtopic** → **difficulty**.
Domains are just groupings in `modules/index.json`; module folders stay flat under `modules/`. A module id belongs to exactly one domain.

## Routes (hash router)

`#/` home (domain cards) · `#/d/<domain>` domain page (its subdomain/module cards) · `#/m/<module>` module page · `#/q/<module>/<subtopic>/<difficulty>` quiz (either part may be `all`: whole-module quiz) · `#/g/<module>/<subtopic>/<difficulty>` guided run (same rules, never scored) · `#/mix` multi-domain builder · `#/mix/play` mixed quiz · `#/results` · `#/settings`

## Registry — `modules/index.json`

```json
{
  "domains": [
    { "id": "math", "title": "Math", "icon": "sigma", "description": "…", "modules": ["arithmetic", "algebra"] }
  ]
}
```
Domain ids follow the same `^[a-z0-9-]+$` rule. A domain with an empty `modules` list shows as "coming soon".

## Multi-domain mix

The `#/mix` builder lets the user:
1. Tick domains to include (all ticked by default).
2. Within each ticked domain, tick/untick subdomains (modules) — all ticked by default.
3. Set a **weight** (number ≥ 0, default **1**) on every ticked domain and every ticked subdomain. 0 = excluded.
4. Pick difficulty: `any` (default) or `easy`/`medium`/`hard`; and question count (default 10, 1–50).

Sampling per question (seeded): pick a domain with probability ∝ domain weight, then a subdomain within it ∝ subdomain weight, then a subtopic uniformly from that module, then difficulty (the chosen one if the subtopic supports it, else the closest available; `any` = uniform over the subtopic's difficulties). Domains/subdomains whose effective weight is 0 are skipped. The builder shows each subdomain's resulting share as a percentage.

Mix config `{ domains: { <id>: { weight, modules: { <id>: weight } } }, difficulty, count }`.

**Draft and presets.** Both are stored in localStorage, never in cookies (too big).
- **Draft** (`studyblock:mix`, shaped `{ config, presetId|null }`):
  - The builder's current config, auto-saved on every change.
  - It survives reloads until the user saves it as a preset or presses **Clear**, which resets it to the defaults (all ticked, weight 1, any, 10).
  - `presetId` records which preset it was loaded from or saved to. The builder shows "Unsaved changes" when the draft differs from that preset.
- **Presets** (`studyblock:mixPresets`, a list of `{ id, name, config, createdAt, updatedAt }`). The user can:
  - **Save as new**: prompts for a name, 1–40 characters, trimmed. Names are unique, case-insensitive.
  - **Update** the linked preset.
  - **Load** a preset into the draft, rename it, or delete it (after confirming).
- Loading a preset whose domains or modules no longer exist drops those entries silently. New domains or modules are added ticked, with weight 1.
- Export/import includes `mixPresets` and the draft as optional fields; the version stays 1. On merge, presets dedupe by id. A preset name that clashes gets " (2)" appended.
- Home shows saved presets as quick-start chips next to "Start last mix".

**Official presets** are maintained by hand in the repo under `presets/`:
- `presets/index.json` → `{ "presets": ["daily-warmup", "stem-focus"] }`. Ids match `^[a-z0-9-]+$` and are loaded only if listed here.
- `presets/<id>.json` →
  ```json
  {
    "id": "stem-focus",
    "name": "STEM focus",
    "description": "Math and Science, weighted toward algebra.",
    "config": {
      "domains": { "math": { "weight": 2, "modules": { "algebra": 2, "arithmetic": 1 } } },
      "difficulty": "medium",
      "count": 15
    }
  }
  ```
  - A domain left out of `domains` is excluded.
  - A module left out of a listed domain's `modules` is excluded.
  - Omitting `modules` entirely means every module in that domain, at weight 1.
  - Unknown ids are ignored with a `console.warn`.
- **Official presets are read-only.**
  - They show first, in an "Official" group with a badge icon (`badge-check`).
  - Loading one copies it into the draft. "Save as new" then creates a user preset; there is no Update for official ones.
  - They are never exported or imported; they come from the repo.

A mixed quiz is saved as one attempt with `module: "mix"`, `subtopic: "mix"`, `difficulty: <chosen or "any">`, and **each question carries its own `module`, `subtopic`, `difficulty`** so stats can be attributed per module.

## Module contract

`modules/<id>/module.json`:
```json
{
  "id": "arithmetic",
  "title": "Arithmetic",
  "description": "Short blurb",
  "icon": "calculator",            // Lucide icon name
  "type": "generator",             // "generator" | "csv"
  "questionsPerQuiz": 10,
  "subtopics": [
    { "id": "addition", "title": "Addition", "difficulties": ["easy", "medium", "hard"] }
  ]
}
```

`all` is a reserved id: a subtopic with id `all` is skipped with a console warning.

### Whole-module quizzes (`all`)

- The module page has an **All topics** row (2+ subtopics) and an **All** difficulty column (2+ difficulties).
- Per question: pick a subtopic uniformly from the allowed ones (a fixed difficulty skips subtopics that lack it), then a difficulty uniformly from that subtopic's list (`all`), or the fixed one. A subtopic with no list counts as `medium`.
- Each question is drawn from its own cell, so its seed regenerates it, and carries `module`, `subtopic`, `difficulty` (as in mixes).
- Length: CSV = min(max(questionsPerQuiz, 10), unique prompts across the cells), never repeating a prompt; generators = questionsPerQuiz.
- The attempt stores `subtopic`/`difficulty` as chosen (`all`). Stats count it whole for its module and its own `all` cell, and slice it by question origin for specific cells.

### Generator modules — `generator.js`

```js
// rng: object from js/lib/rng.js ({ next(), int(min,max), pick(arr), shuffle(arr) })
export function generate({ subtopic, difficulty, rng }) {
  return {
    prompt: "What is 3 + 4?",     // markdown allowed
    answer: 7,                    // computed in real time
    answerType: "number",         // "number" | "text" | "choice"
    choices: undefined,           // array of strings when answerType === "choice"
    tolerance: 0,                 // numeric tolerance (optional)
    explanation: "3 + 4 = 7"      // optional, markdown
  };
}

// Independent check (substitution / alternate method). Return true if `answer` is correct for `question`.
export function verify(question, answer) { ... }
```

The engine seeds `rng` per question and stores the seed, so any question can be regenerated. After `generate`, the engine calls `verify(question, question.answer)`; if it fails, it discards and regenerates (max 20 tries, then logs an error).

### Code languages (Code Writing, Code Reviewing)

- `module.json` may list `"languages"` (a subset of `js/lib/languages.js` ids, in display order; unknown ids dropped with a warning; generator modules only). Empty or absent = not language-aware.
- The effective language is the `sb_codeLang` preference if the module lists it, else its first listed language. It's picked on the module page or in Settings → Code language.
- Language-aware generators are called as `generate({ subtopic, difficulty, rng, lang })`; other modules never get `lang`, so their questions are unchanged. The engine keeps `lang` across verify retries and puts it on the question. `verify` doesn't receive `lang`: generators put it (and a `meta` with template + params) on the returned question.
- Generators draw **all** rng values before rendering, so one seed is the same logic in every language. Snippets are built once with `js/lib/codelang.js` (its header documents the AST, `check` rules, `render`/`lineOf`, `run`) and shown in a fence tagged `LANGUAGES[].fence`. Code choices are wrapped in backticks (choices go through `renderInline`), and the stored answer is the same string.
- `verify` rebuilds the program from `meta`, substitutes the candidate answer and `run()`s it against plain-JS references. Number blanks are unique in a scanned range or worded "smallest (0 or more)"; exactly one choice passes all tests.
- A stored question may carry `lang` (checked with `isLang` on save and import); `regenerate(module, subtopic, difficulty, seed, lang)` rebuilds the same snippet.
- Code renders without ligatures (`font-variant-ligatures: none`), so `<=` never shows as ≤. Snippets aren't compiled in tests; see ticket 010.

### CSV modules — `questions.csv`

Header: `subtopic,difficulty,prompt,answer,choices,explanation`
- `choices` is `|`-separated; empty means free-text answer.
- `difficulty` may be empty (applies to all).
The engine samples rows with the seeded rng and shuffles choices.

### Answer checking

- number: parse float, `|user - answer| <= tolerance` (default 1e-9).
- text: `−` read as `-`, trim, collapse whitespace, case-insensitive, and spaces around `:` and `,` ignored (so `2 : 7` matches `2:7`, `2,4` matches `2, 4`).
- choice: exact match of the chosen string.

### Multi-part questions (`answerType: "multi"`)

One scenario, several labelled answer fields. Used by Business Case for things like *Calculation* + *Recommendation*.

```js
{
  prompt: "…scenario…",
  answerType: "multi",
  parts: [
    { id: "calc", label: "Calculation", ask: "Break-even units (round up)", answerType: "number", answer: 1000, tolerance: 0 },
    { id: "rec",  label: "Recommendation", ask: "Should the café open?", answerType: "choice", answer: "Yes", choices: ["Yes", "No"] }
  ],
  explanation: "…"
}
```
- **Parts:** 2–4. Each part is a mini-question with its own `answerType` (`number`, `text` or `choice`), `answer`, `tolerance` and `choices`, checked by the rules above. `id` matches `^[a-z0-9-]+$`, and `label` is a short heading such as *Calculation*, *Recommendation* or *Risk*.
- **Generators:** `verify(question, answer)` gets `answer` as an object `{ [partId]: value }` and must check every part. The engine calls it with the generator's own answers.
- **Scoring (partial credit, ticket 007):**
  - Each stored question has `credit` (0–1): single questions 1 or 0; multi-part = parts right / parts total. `correct` is true only if every part is right.
  - Attempt `score` = sum of credits, rounded to 2 decimals (may be decimal, ≤ total); percentages are score/total. Scores display without trailing zeros: 6.5 / 8, 6.67 / 8.
  - A partly right question shows "Partly correct · n of m parts right" (`circle-dot` icon, warn colours) in feedback, progress, results and review. 0 parts right is "Incorrect".
  - Stats use `credit`, falling back to `correct ? 1 : 0` for older data.
- **Quiz UI:**
  - One field per part, stacked, each with its label and `ask` text: number/text inputs, or a choice button group, which doesn't submit on click.
  - **Check** submits all parts together, once each part has a value.
  - Enter moves to the next empty part, and submits on the last one.
  - The calculator's **Use** fills the part that last had focus.
  - Feedback shows ✓/✗ per part, with the correct value for each wrong one.
- **Storage:** on the stored question, `answer` and `userAnswer` become objects keyed by part id, and `parts: [{id, label, correct}]` is added. These fields are optional on import.
- **CSV modules:** not supported; multi-part is generator-only.

## Guided mode

- Module page: a **Practice | Guided** switch (sessionStorage `studyblock:quizMode`; opening `#/q` or `#/g` sets it). In Guided mode grid links go to `#/g/…` and cells show "Guided" instead of scores.
- Guided runs reuse `runQuiz` with `opts.guided`: a "Guided · not scored" pill, hints in an aria-live list (**Hint n of N** or the H key), unlimited tries (a wrong choice is disabled; correct multi-part parts lock), and **Show solution** always available.
- They never call `saveAttempt` and never touch stats, History or best scores; only the last-module/difficulty cookies update. The end screen counts solved first try / solved after hints or tries / used the solution, lists the questions, and offers Another guided set and Practice for real.
- **Generator hints (optional):** `hints: [markdown]` (1–4 progressive steps that never state the final answer) and/or `parts[i].hint` on multi-part questions. The engine keeps non-empty strings ≤ 600 chars, max 4, dropping others with one console.warn per module. Never stored.
- **Fallback:** with no hints, the explanation is split into steps (blank-line blocks, list items, else lines; never inside code fences) and all but the last become hints. CSV modules use this fallback.
- **`modules/<id>/guide.md` (optional):** `## General` plus `## <Subtopic title>` sections (case-insensitive; text before the first `##` ignored). Loaded with `loadGuide` and shown as a collapsible "How to solve" card for the current question's subtopic. Every module has one. Keep tables and sub-lists after a numbered list, not inside it: markdown.js can't nest them.
- **Every generator returns `hints`** (multi-part: a `hint` on each part), built only from values already drawn: no rng calls in hint code, so adding or editing hints never changes a question. When changing hints, fingerprint each cell's questions (hints stripped) before and after, and check that no hint states the answer.
- Open choices are in ticket 011.

## Storage

**localStorage** (`studyblock:data`) is the source of truth:
```json
{
  "version": 1,
  "attempts": [
    {
      "id": "uuid", "ts": 0,
      "module": "arithmetic", "subtopic": "addition", "difficulty": "easy",
      "questions": [
        { "seed": 123, "prompt": "...", "answer": 7, "userAnswer": "7", "correct": true, "credit": 1 }
      ],
      "score": 9, "total": 10
    }
  ]
}
```
Scores per module/subtopic/difficulty are derived from attempts. On import, `credit` is optional and clamped to 0–1; `score` may be a decimal ≥ 0 and ≤ total.

**Cookies** are a small cache only (≤ ~1KB): last module, last difficulty, theme, code language (`sb_codeLang`, default `python`). `SameSite=Lax; path=/`. Never store history in cookies.

**Export** downloads the full JSON via Blob. **Import** reads a file, validates `version` + shape, and asks merge (dedupe by attempt id) or replace.

## Calculator with stored values

The quiz screen has a calculator panel that works like a small live worksheet.

**Where it appears**
- On every question except those from modules with `"calculator": false` in `module.json`. Arithmetic, Fractions, Number Bases, Code Writing, Code Reviewing, Algorithms, Number Theory, SQL Queries, Intervals & Scales, Chords, Vocabulary, Word Roots and Grammar set this, because working it out yourself is the point (or there's nothing to calculate).
- In mixed quizzes it follows each question's own module, so it shows and hides as you go.

**Rows**

The panel is a list of rows. Each row has:
- a **label**: a variable name that **must start with an underscore** and match `^_[A-Za-z0-9_]{1,23}$`, unique ignoring case. A new row suggests the next free name: `_a`, `_b`, `_c`, …
  - The underscore keeps your values apart from built-in names. `_e` is your variable; `e` is Euler's number, 2.718….
  - Typing a label without the underscore adds it automatically, so `speed` becomes `_speed`.
  - In expressions, any name starting with `_` is a row reference. Names without `_` are only constants and functions. An unknown `_name` is an "unknown value" error; an unknown bare name is an "unknown function or constant" error.
- an **expression**
- a live **result**, or an inline error message.

**Expressions**
- **Numbers:** decimals and `1e-3` notation. Commas used as thousands separators are not accepted, to keep things unambiguous.
- **Operators:** `+ - * / ^ %`. `%` is modulo; precedence is the usual one, with `^` right-associative. Also unary minus and parentheses, and `×`, `÷`, `−` are accepted as aliases.
- **Constants:** `pi`, `e`.
- **Functions:** `sqrt abs round(x[,digits]) floor ceil min max log (base 10) ln exp sin cos tan asin acos atan`. Trig functions take degrees; the result shows a small "deg" hint.
- **References to other rows** by label, in any order.

**Evaluation**
- **Live:** every keystroke re-evaluates the whole sheet in dependency order. Editing an early row updates every row that depends on it, straight away.
- **Errors:** each one appears on its own row only; unaffected rows keep their values. The messages:
  - "circular reference: _a → _b → _a"
  - "unknown value: _x"
  - "unknown function or constant: foo"
  - "_a is empty" (a reference to a blank row)
  - "_a has an error" (a row that depends on a failing row)
  - "invalid name: … already used" (a duplicate label)
  - Division by zero, overflow and tan at 90° + k·180° are errors too.
  - `%` follows JavaScript's sign rule: `-7 % 3` is -1.
- **Renaming a label** rewrites references to it in other rows, matching whole tokens only.

**Safety:** expressions are parsed by a hand-written tokenizer and recursive-descent parser in `js/lib/calc.js`. No `eval` or `new Function`. Labels and expressions are escaped wherever they're displayed.

**Actions**
- Add a row with Enter in the last expression, or the "+ Row" button.
- Delete a row.
- **Use:** puts that row's value into the answer field, at full precision, trimmed to at most 10 significant digits. It's disabled on choice questions (and when the last-focused part of a multi-part question is a choice) and once an answer has been checked.
- Clear the sheet, after confirming.
- Keyboard:
  - Ctrl/Cmd+K focuses the calculator.
  - Esc returns to the answer.
  - Plain Enter inside the calculator never submits the quiz answer.

**Given values (pre-filled rows)**

A generator question may hand the calculator its starting numbers, so the user doesn't retype them:
```js
given: [ { label: "_price", value: 4.5 }, { label: "_cost", value: 1.2 } ]
```
- **Generators:** optional, 1–8 entries. Only numbers stated in the prompt (never the answer or an intermediate step). Labels follow the row rule (`^_[A-Za-z0-9_]{1,23}$`, unique ignoring case) and should match the labels used in the explanation, so the worked steps can be followed in the calculator. Add it to questions with two or more numeric inputs; skip it where the point is to work by hand. CSV modules don't support it.
- **Engine:** validates `given` (drops bad labels, duplicates and non-finite values, max 8) and passes it through on the question. It isn't stored in attempts; `work` already captures the rows.
- **Calculator:** when a question appears, rows still marked *given* from the previous question are removed, unless the user has edited them, and the new question's given rows are added at the top with a small "given" tag. Editing a given row's label or expression turns it into a normal row. A label clash with a user row gets a suffix (`_price_2`). A *blank* row whose label matches a given label moves to the next free name; non-blank user rows are never touched. Values are written with up to 12 significant digits, and the tag is visible text plus a screen-reader label. User rows that reference a given label follow the current question's value (ticket 008).
- Shown only when the calculator itself is shown.

**Sheet | Graph**

A two-button switch (`aria-pressed`) at the top of the calculator picks the mode. Sheet is the row calculator above; Graph plots functions (`js/views/graph.js` for the UI, `js/lib/graph.js` for the maths, with no DOM). Open choices are in ticket 009.
- **Functions:** up to 6, in fixed slots `y1 … y6`. Deleting y2 keeps y3's name and colour. Each slot has its own colour (`--graph-1..6`, light and dark) and its name drawn on the plot. There is a show/hide toggle and a delete button. Enter in the last function adds one.
- **Grammar:** the sheet grammar plus the variable `x`, allowed only here: `parse(src, { vars: ['x'] })` → `{k:'var'}`, and `evaluate(ast, lookup, { x })`. In a sheet row, `x` stays "unknown function or constant: x". Graph mode suggests "write 2*x, not 2x". Trig is in degrees.
- **Sheet references:** `_a` takes the sheet's live value via `calc.sheetLookup`. A blank or failing row shows "_a is empty" / "_a has an error" under the function. Renaming a sheet label rewrites graph references too (whole tokens only).
- **Plot:** a canvas (devicePixelRatio aware, ResizeObserver, redraws batched per animation frame), with the default window x, y ∈ [−10, 10] and "nice" ticks.
  - Curves break at errors and asymptotes instead of drawing vertical lines.
  - Drag pans, and wheel or pinch zooms (`touch-action: none` on the canvas only). There are zoom in/out/reset buttons and **Fit y** (IQR-based, ignores outliers).
  - A **Window** disclosure has x/y min/max fields (expressions allowed; finite, min < max, span 1e-6 to 1e9).
  - Keys on the focusable canvas: arrows pan, + / − zoom, 0 resets, and Shift+←/→ moves the trace.
  - Tapping traces the nearest curve; the readout is aria-live polite.
- **Points:** for one function, within the visible x range: zeros, minima, maxima and intersections with the other visible functions, up to 10 of each. They are drawn as rings on the plot. **Add x / Add y** writes the value to the sheet (12 significant digits, in a trailing blank row or the next free label; "sheet is full" at 30 rows).
- **Storage:** the optional `mode` and `graph: { fns: [{ slot, expr, hidden }], view }` fields sit in the same `studyblock:calc` record. Older records still load. `work` stays sheet-only.
- **Phone:** in the bottom sheet, the plot height is min(75% of width, 30% of the viewport), at least 150px.

**Lifetime**
- One sheet per quiz run. It carries over between questions, so values can be reused later, and it's cleared when a new quiz starts.
- The live sheet is kept in `sessionStorage` (`studyblock:calc`), so a reload during a quiz doesn't lose it.
- When an answer is checked, a snapshot of the rows (`[{label, expr, value}]`, at most 30 rows) is saved on that question as `work`. Only rows that have an expression are kept, and a failing row is stored as `value: null`. The quiz review and History show it as "Your working".
- `work` is optional on import.

**Layout**
- **Desktop (≥ 900px):** a panel beside the question, collapsible and remembered.
- **Phone:** a "Calculator" button in the sticky action bar opens a bottom sheet. The sheet stays above the keyboard, and expression inputs use `inputmode="text"` so operators can be typed.

## Visual design

The reference design is the "StudyBlock Visual Refresh" design canvas: https://claude.ai/artifact/4PzANTrTiRc2zi3XnGDESV
- Warm neutrals: paper `#F6F5F1`, surface `#FFF`, sunken `#EFEDE7`, line `#E3E0D8`, muted `#6B675E`, ink `#1B1A17`. System UI font stack, plus a monospace stack for equations. No web fonts.
- **Accent:** the user picks one of 24 hues (0–345° in 15° steps) or grey. **Default is purple, 300°.**
  - accent `oklch(0.50 0.16 H)`
  - soft `oklch(0.95 0.035 H)`
  - ink `oklch(0.40 0.14 H)`
  - Grey uses chroma 0.
  - Dark theme: the hue stays the same and lightness goes to about 0.72.
  - The choice is stored in the `sb_accent` cookie (`0`–`345` or `grey`).
- **Domain tints are fixed and independent of the accent.** Each domain has a tint (light background + dark text) and a solid colour:
  | Domain | Tint | Solid |
  |---|---|---|
  | Math | `#E8E9FB` / `#3730A3` | `#5B54E8` |
  | Science | `#DDF1EE` / `#0F5E56` | `#14857A` |
  | Geography | `#FBEBD9` / `#8A4B0F` | `#C2671B` |
  | Business | `#F3E6F1` / `#7A2E6B` | `#9C3D8C` |
  | Computing | `#DCEFFA` / `#0B5A86` | `#1A7FC1` |
  | History | `#F8E3DF` / `#8E2A1E` | `#B23A2E` |
  | Language | `#E8EFD9` / `#44591A` | `#6B8A23` |
  | Game Dev | `#FCE4EE` / `#9D1B52` | `#D02A6E` |
  | Music | `#FBF1D2` / `#765300` | `#B07D0A` |
  | Biology | `#DFF3E4` / `#1B5E2B` | `#2E8B47` |
  | Medical | `#DDF4F8` / `#0A5866` | `#0E8FA6` |

  A domain can override these with `color` in `index.json`.
- Correct and incorrect states always show an icon and a label, not colour alone.
- Radius is 12 on controls, 16 on cards and 20 on hero cards. Touch targets are at least 44px.

## Mobile

Mobile is a first-class target: build mobile-first, so the layout works from 360px wide upward.
- **Page setup:**
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and a `theme-color` meta.
  - No horizontal page scroll.
  - Respect `env(safe-area-inset-*)`.
- **Navigation:**
  - Below 640px, the top nav becomes a fixed **bottom tab bar** with four tabs: Home, Mix, History, Settings, each an icon over a label.
  - The header shrinks to the logo plus the page title.
  - Leave bottom padding on the content so the tab bar never covers it.
- **Inputs:**
  - Input text is at least 16px, so iOS doesn't zoom in on focus.
  - Number answers use `inputmode="decimal"`, with `enterkeyhint="go"` or `"next"`.
  - Never use hover-only affordances.
  - Choice buttons sit in one column on phones and two columns from 640px.
- **Quiz:** the Check/Next button sits in a sticky bottom action bar on phones, so it stays reachable when the keyboard is open.
- **Mix builder on phones:**
  - Preset chips scroll horizontally.
  - The summary collapses into a sticky bottom bar (share bar + "Start · N questions"); tapping it expands the full summary sheet.
- **Tables** (history, module grid): turn into stacked cards on phones, or sit in an `overflow-x: auto` box.
- The mobile reference artboards are on the design canvas (Mobile — Home / Quiz / Mix).

## Running modes

The same code runs in three places.

1. **Local server:** `launcher_win.bat`, `launcher_mac.command` (opens in Terminal on double-click) or `launcher_linux.sh`. All three run `tools/serve.py`.
   - Standard library only. It binds 127.0.0.1 on port 8000, sends `Cache-Control: no-cache` and opens the browser.
     - If StudyBlock is already running on 8000, it opens that instead.
     - If another program holds 8000, it warns and uses the next free port.
   - The launcher window stays open until the user closes it, and closing it stops the server.
   - **Port 8000 belongs to the user's real data.** Agents test on **port 8100** via `.claude/launch.json` (`preview_start` "studyblock"). Never start a server on 8000, and never leave test data in the user's 8000 storage.
2. **GitHub Pages / any static HTTPS host:** works as-is. Rules:
   - Every path is relative: no leading `/` in fetches, imports or links.
   - Add a `.nojekyll` file at the repo root.
   - Cookies use `path=<the app's directory>`, not `/`. `username.github.io` is shared by every repo of that user, and keys are prefixed `sb_` / `studyblock:`.
3. **Offline single file (no server):** `py tools/bundle.py` writes `dist/studyblock.html`, which opens by double-click.
   - Browsers block external ES modules and `fetch()` on `file://`. So the bundle embeds every JS file, `modules/**` and `presets/**` as text, and loads code via an import map. Specifiers are rewritten to `sb:/<path>`, each mapped to a `data:` URL.
   - All file access goes through `js/lib/source.js`:
     - `loadText(path)` and `loadJSON(path)`: `fetch` normally, or read the embedded bundle.
     - `loadModule(path)`: dynamic `import()` normally, or the mapped specifier.
   - No other file may call `fetch` or `import()` on project paths.
   - Lucide is inlined in the bundle from `vendor/lucide.min.js`.
   - The bundler uses only the Python standard library and writes only inside `dist/`.

## Installable web app (PWA)

Applies when the app is served over http(s): GitHub Pages or localhost. It is off on `file://`, where service workers don't exist; the bundle stays a plain page there.
- **Manifest:** `manifest.webmanifest`
  - `name` "StudyBlock", `short_name` "StudyBlock", `start_url` "./", `scope` "./", `display` "standalone".
  - `background_color` #F6F5F1, `theme_color` = the default accent purple.
  - Icons from `icons/`: 192 and 512 PNG, plus a 512 maskable. They're generated by `py tools/make_icons.py` using the Python standard library only (zlib PNG writer), drawn from the logo (three blocks on the accent square). Also `icons/icon.svg`, and a 180px `apple-touch-icon`.
  - All paths are relative, so it works under `/<repo>/` on GitHub Pages.
- **Service worker:** `sw.js` at the app root, registered with `scope: './'` from `js/lib/pwa.js`.
  - `CACHE_VERSION` is a constant to bump on release.
  - It precaches the app shell (`index.html`, css, all `js/**`) and `modules/index.json` + `presets/index.json`.
  - Same-origin GETs: stale-while-revalidate, so modules and presets get cached on first use. Navigations fall back to the cached `index.html` when offline.
  - `vendor/lucide.min.js` is precached with the shell. Cross-origin requests are never cached.
  - Activating a new version deletes old caches.
- **Updates:** a new service worker waits. The app shows a small "Update available · Reload" toast; reloading posts `SKIP_WAITING`. Nothing auto-reloads while a quiz is in progress.
- **Install button:**
  - `js/lib/pwa.js` captures `beforeinstallprompt` and exposes `canInstall()`, `promptInstall()` and an `onChange` subscription.
  - Settings, and a dismissible Home card, show "Install StudyBlock" when available.
  - On iOS Safari, which has no prompt, they show "Share → Add to Home Screen" instructions instead.
  - Installed (`display-mode: standalone`) hides the button.
- **Storage:** on first save, call `navigator.storage.persist()`, so the browser doesn't evict progress.

## Data folder (optional; prompted on file://)

Uses the File System Access API (`showDirectoryPicker`), which only Chromium browsers support.
- **Connecting:** Settings → "Connect data folder". The user picks any folder, and the app reads and writes `studyblock-data.json` there. That file holds the same shape as an export: attempts, mix presets and the draft.
- **Remembering the folder, as automatically as the browser allows:**
  - **The handle:** only IndexedDB can hold it, so it's stored in the `studyblock` db, `handles` store. A small cookie, `sb_folder` (or a `studyblock:prefs` key on `file://`), records the folder's display name and that one is connected. That gives the UI and banner an instant "Connected to <name>" without waiting for IndexedDB.
  - **On boot:** the app calls `queryPermission({mode:'readwrite'})`.
    - If it returns `granted` (Chrome's "Allow on every visit", or a permission still alive this session), it syncs silently, with no UI.
  - **If it returns `prompt`:**
    - The app shows no button first. It registers a one-time capture listener for the first `pointerdown`/`keydown` anywhere on the page, and calls `requestPermission` from it, so the user's first natural click re-grants access. Chrome then offers "Allow on every visit", which makes later visits fully automatic.
    - The banner text says this: "Click anywhere to resume syncing to <name>". A Reconnect button stays as a fallback.
    - If the user denies, the app doesn't ask again this session and shows the Reconnect button.
  - **Never** call `showDirectoryPicker` automatically; picking a new folder always needs an explicit button press.
  - **Disconnect** clears the IndexedDB handle and the `sb_folder` marker.
- **Sync rule:**
  - localStorage stays the working cache.
  - Every save also writes the folder file (debounced about 1s, written to a temp name then renamed where supported, otherwise overwritten).
  - On connect or reconnect, the folder file is merged into the cache: attempts and presets dedupe by id. Then the merged result is written back.
- **Where it's shown:**
  - On `file://`, a banner asks the user to connect a folder, because `file://` storage is easy to lose.
  - Unsupported browsers (Firefox, Safari) hide the feature and point to export/import instead.
- **Safety:**
  - The app touches only `studyblock-data.json` in the chosen folder; it never lists, reads or deletes other files.
  - The file's contents are validated the same way as an import.

## Docs

- `README.md` is an introduction for newcomers: what StudyBlock is, what it can do, a three-way quick start, and a link to the guide. Keep it short and friendly, not a manual.
- `INSTRUCTION.md` is the full user guide (running, using, data, adding subjects, presets, troubleshooting). Update it whenever user-facing behaviour changes.
- `CLAUDE.md` is the developer and agent spec. The main session owns all three; agents report doc changes instead of editing them.

## Subject notes

- **Biology domain:** the fact-list `biology` module (title "Biology Basics") moved from Science into its own Biology domain; its id is unchanged, so old attempts still count.
- **Medical domain:** general facts and standard calculations only. No medications or doses, symptoms, diagnosis, treatment or "is this normal?" questions. Every Medical `intro.md` opens with a "For learning only, not medical advice" note, BMI shows only numeric WHO adult ranges, and each question states its formula and factors.
- **Music Theory:** written notation, no audio or staff images. Spelled notes/intervals/chords are always choice questions (text checks can't equate `#` with ♯); `js/lib/music.js` has separate build and check toolkits so verify stays independent.
- **Collision:** touching never counts as overlapping. **Networking:** KB/MB = 1000, KiB/MiB = 1024, subnet zero allowed, /31 and /32 never generated.
- **Timelines:** a fixed, hand-checked event list inside the generator; only the *Famous dates (recall)* subtopic relies on memorised years, and arguable years (1347, 1517, 221 BC) are kept out of recall.
- **Rounding ties:** generators should never produce an answer that sits exactly on a rounding half-step. Newer generators redraw inside `generate()` (same rng, so still deterministic) until their own `verify` passes, rather than leaving it to the engine's retry.
- Open choices for these are in tickets 012–014.

## Adding a module

1. Create `modules/<id>/` with `module.json` and either `generator.js` (+ `verify`) or `questions.csv`.
2. Optionally add `intro.md`.
3. Append the id to the right domain's `modules` list in `modules/index.json` (add a new domain entry if needed).
