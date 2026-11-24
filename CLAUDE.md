# StudyBlock

Procedurally generated quiz app. Plain HTML/CSS/JS, runs entirely in the browser, stores everything locally.

> AI-coded with human supervision.

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
- **Group commits, then push as a checkpoint.** Commit one coherent unit of work (a feature, a module, a fix set), not every small file change. Commit only finished, tested work: never half-written files a running agent still owns. After each grouped commit, push to `origin main`.

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

## Hierarchy

**Domain** (Math, Science, Geography, Business, …) → **Subdomain** = a module (Arithmetic, Algebra, …) → **subtopic** → **difficulty**.
Domains are just groupings in `modules/index.json`; module folders stay flat under `modules/`. A module id belongs to exactly one domain.

## Routes (hash router)

`#/` home (domain cards) · `#/d/<domain>` domain page (its subdomain/module cards) · `#/m/<module>` module page · `#/q/<module>/<subtopic>/<difficulty>` quiz · `#/mix` multi-domain builder · `#/mix/play` mixed quiz · `#/results` · `#/settings`

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

## Calculator with stored values

The quiz screen has a calculator panel that works like a small live worksheet.

**Where it appears**
- On every question except those from modules with `"calculator": false` in `module.json`. Arithmetic sets this, because doing the sums yourself is the point of it.
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
- **Use:** puts that row's value into the answer field, at full precision, trimmed to at most 10 significant digits. It's disabled on choice questions and once an answer has been checked.
- Clear the sheet, after confirming.
- Keyboard:
  - Ctrl/Cmd+K focuses the calculator.
  - Esc returns to the answer.
  - Plain Enter inside the calculator never submits the quiz answer.

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
   - Lucide is inlined in the bundle only if it's vendored (ticket 001). Otherwise icons fall back to text labels offline.
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
  - It never caches cross-origin requests apart from the pinned Lucide CDN URL, which is cache-first.
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

## Adding a module

1. Create `modules/<id>/` with `module.json` and either `generator.js` (+ `verify`) or `questions.csv`.
2. Optionally add `intro.md`.
3. Append the id to the right domain's `modules` list in `modules/index.json` (add a new domain entry if needed).
