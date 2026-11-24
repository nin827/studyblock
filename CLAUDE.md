# StudyBlock

Procedurally generated quiz app. Plain HTML/CSS/JS, runs entirely in the browser, stores everything locally.

## Hard rules

- **No build step, no npm.** Native ES modules only (`<script type="module">`). Node is not installed.
- **No third-party assets except Lucide icons**, loaded from a pinned CDN URL in `index.html`
  (`https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`). No markdown/CSV/UI libraries — those are hand-rolled in `js/lib/`.
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
- **Group commits.** Commit one coherent unit of work (a feature, a module, a fix set), not every small file change. Only commit when asked or at the end of a completed task.

## Layout

```
index.html              app shell, loads Lucide + js/app.js
css/style.css           theme tokens (light/dark), layout
js/app.js               bootstrap + hash router
js/views/*.js           home, module, quiz, results, settings views
js/lib/markdown.js      tiny markdown -> HTML (escape first, then format)
js/lib/csv.js           RFC4180-ish CSV parser (quotes, commas, newlines, "")
js/lib/rng.js           seeded PRNG (mulberry32) + helpers
js/lib/storage.js       localStorage store, cookie cache, import/export
js/lib/engine.js        loads modules, generates + verifies questions, checks answers
modules/index.json      registry: list of module ids
modules/<id>/module.json
modules/<id>/intro.md   optional markdown shown on the module page
modules/<id>/generator.js   (type "generator")
modules/<id>/questions.csv  (type "csv")
```

## Routes (hash router)

`#/` home · `#/m/<module>` module page · `#/q/<module>/<subtopic>/<difficulty>` quiz · `#/results` · `#/settings`

## Module contract

`modules/index.json`:
```json
{ "modules": ["arithmetic", "capitals"] }
```

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

### CSV modules — `questions.csv`

Header: `subtopic,difficulty,prompt,answer,choices,explanation`
- `choices` is `|`-separated; empty means free-text answer.
- `difficulty` may be empty (applies to all).
The engine samples rows with the seeded rng and shuffles choices.

### Answer checking

- number: parse float, `|user - answer| <= tolerance` (default 1e-9).
- text: trim, collapse whitespace, case-insensitive.
- choice: exact match of the chosen string.

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
        { "seed": 123, "prompt": "...", "answer": 7, "userAnswer": "7", "correct": true }
      ],
      "score": 9, "total": 10
    }
  ]
}
```
Scores per module/subtopic/difficulty are derived from attempts.

**Cookies** are a small cache only (≤ ~1KB): last module, last difficulty, theme. `SameSite=Lax; path=/`. Never store history in cookies.

**Export** downloads the full JSON via Blob. **Import** reads a file, validates `version` + shape, and asks merge (dedupe by attempt id) or replace.

## Adding a module

1. Create `modules/<id>/` with `module.json` and either `generator.js` (+ `verify`) or `questions.csv`.
2. Optionally add `intro.md`.
3. Append the id to `modules/index.json`.
