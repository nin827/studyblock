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
- **Agent models:** Sonnet for general coding and basic research. Opus for critical or sensitive coding, sub-orchestrating, and deeper research. Haiku only for data retrieval or querying.
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
js/lib/dates.js         date parsing/formatting/distance for date answers
js/lib/calc.js          calculator parser/evaluator + live sheet (no eval)
js/lib/languages.js     code languages list (python, csharp, cpp, gdscript, rust)
js/lib/codelang.js      language-neutral code AST, 5 renderers, interpreter
js/lib/music.js         note/interval/scale/chord helpers (build + independent check) for Music Theory
js/lib/audio.js         pitch from spelled notes (A4 = 440, equal temperament), Web Audio synth, play descriptions
js/views/playbtn.js     Play button + Sound preference
js/lib/journal.js       journal entries: spec check, canonical string, line matching
js/views/journal.js     journal table + blocks, static tables for review/History
js/lib/gamify.js        XP, levels, streaks and badges derived from attempts; sb_game preference
js/lib/chem.js          element table (symbol, name, Z, rounded school Ar), formula parser/mass
js/lib/sql.js           SQL: query-tree render/evaluate + executor for the taught grammar (runQuery/execQuery)
js/lib/ciphers.js       letters A=0…Z=25, Caesar, Vigenère, affine, gcd/lcm, modular inverse
js/lib/net.js           IPv4 octets/ints, masks, network/broadcast, usable hosts, same subnet
js/lib/mathutil.js      gcd/lcm, round-half-away (round1/round2/roundTo), isHalfStep, fmtNum/fmtAnswer, bin8 (ciphers.js and net.js re-export them)
js/views/guided.js      guided-mode helpers (mode switch, hint steps, guide.md)
js/lib/graph.js         graph maths: sampling, ticks, zeros/extrema/intersections
js/lib/visual.js        question visuals: sanitizeVisual (validation), visualAxes (the axes the renderer draws)
js/views/visual.js      question visuals renderer (visualHtml: HTML table or inline SVG)
js/views/calculator.js  calculator panel (Sheet | Graph); js/views/graph.js = graph UI
js/views/roles.js       Roles pages (roles/ = registry)
js/views/domains.js     Domains tab (#/domains): every domain with its groups and subjects
js/views/calcpage.js    standalone #/calc page; js/views/staticgraph.js = <sb-graph> static plot for reviews
modules/index.json      registry: list of module ids
modules/<id>/module.json
modules/<id>/intro.md   optional markdown shown on the module page
modules/<id>/guide.md   optional "How to solve" notes for Guided mode
modules/<id>/generator.js   (type "generator")
modules/<id>/questions.csv  (type "csv")
```

## Shared knowledge libraries

Knowledge used by more than one module lives once in `js/lib/` (mathutil, chem, sql, ciphers, net, music, codelang, dates' calendar helpers). **Libraries hold knowledge only:** reference data and the engines that apply it. **Checks, settings and setups stay in each module:** `verify` and its check helpers (so verify stays independent of generate), settings such as constants (R = 8.31, 24 dm³/mol, g = 10), rounding, unit conventions and which subset a module uses, and the scenario setup (ranges, wording, distractors, hints). A library may export standard values, but each module picks and states its own (Role Chemist keeps Cu = 64 locally). Modules import with relative paths (`'../../js/lib/chem.js'`), and new lib files go in `sw.js` PRECACHE. Moving code into a library must keep every cell's questions identical per seed (fingerprint before and after). Only generation, hint and explanation code switches to a library; where a module's `verify` used the same helper it keeps a local copy (e.g. `round1` in role-business-analyst, `gcd` in fractions), and a module's own tolerance or rounding rule stays as a one-line wrapper (`isTie = x => isHalfStep(x, 2, 1e-4)`).

## Hierarchy

**Domain** (Math, Science, Geography, Business, …) → optional **group** (display only) → **Subdomain** = a module (Arithmetic, Algebra, …) → **subtopic** → **difficulty**.
Domains are just groupings in `modules/index.json`; module folders stay flat under `modules/`. A module id belongs to exactly one domain. Groups (ticket 024) only sort a big domain's subjects into sections on the domain page, the Domains tab and the mix builder; mixes, presets, stats and export never see them.

## Routes (hash router)

`#/` home (domain cards) · `#/domains` Domains tab (every domain with its groups and subjects) · `#/d/<domain>` domain page (its subdomain/module cards) · `#/m/<module>` module page · `#/q/<module>/<subtopic>/<difficulty>` quiz (either part may be `all`: whole-module quiz) · `#/g/<module>/<subtopic>/<difficulty>` guided run (same rules, never scored) · `#/mix` multi-domain builder · `#/mix/play` mixed quiz · `#/mix/guided` guided mixed run · `#/results` · `#/settings` · `#/calc` standalone Calculator · `#/roles`, `#/roles/<role>`, `#/roles/<role>/<subrole>` role pages · `#/rq/<role>[~<subrole>]/<level>` role quiz · `#/rg/…` guided role run · `#/badges` badges, level and streak

## Registry — `modules/index.json`

```json
{
  "domains": [
    { "id": "math", "title": "Math", "icon": "sigma", "description": "…", "modules": ["arithmetic", "algebra", "time-dates"],
      "groups": [ { "id": "number", "title": "Number", "modules": ["arithmetic"] }, … ] }
  ],
  "domainAliases": { "game-dev": "computing", "everyday-math": "math" }
}
```
Domain ids follow the same `^[a-z0-9-]+$` rule. A domain with an empty `modules` list shows as "coming soon".

**Groups (optional, display only):** `{ id, title, modules }`, ids matching `^[a-z0-9-]+$`. The domain's `modules` list stays the source of truth: group entries not in it are dropped with a warning, a module sits in at most one group, and any ungrouped module goes into a trailing "Other" group. Use groups only where a domain has enough subjects for each group to hold 2+.

**Domain aliases:** `domainAliases` maps a retired domain id to the domain that absorbed it (Game Dev → Computing, Everyday Math → Math, ticket 024). Drafts and user presets are translated through it on load, so their old weights carry over (a domain that was off keeps its subjects off). Old mixed attempts keep their stored `domain`, so the retired tints stay in CSS.

**Archived modules:** an optional top-level `"archived": [{ "id", "title" }]` lists retired subjects. Their folders stay in `modules/`, but they are never loaded, shown or sampled, and `tools/bundle.py` skips them. `loadArchived()` / `titleLookup()` in `engine.js` give old attempts their title. History groups them under "Archived", and Home "Recent" tags them. An id that is still listed in a domain stays active, with a warning. Restoring a subject means moving its id back into a domain.

## Multi-domain mix

The `#/mix` builder lets the user:
1. Tick domains to include (all ticked by default).
2. Within each ticked domain, tick/untick subdomains (modules) — all ticked by default.
3. Set a **weight** (number ≥ 0, default **1**) on every ticked domain and every ticked subdomain. 0 = excluded.
4. Pick difficulty: `any` (default) or `easy`/`medium`/`hard`/`expert` (a module without the chosen level uses its closest one, so Expert falls back to Hard); and question count (default 10, 5–50; `normalizeMixConfig` raises older drafts, presets and imports below 5 to 5).

Sampling per question (seeded): pick a domain with probability ∝ domain weight, then a subdomain within it ∝ subdomain weight, then a subtopic uniformly from that module, then difficulty (the chosen one if the subtopic supports it, else the closest available; `any` = uniform over the subtopic's difficulties). Domains/subdomains whose effective weight is 0 are skipped. The builder shows each subdomain's resulting share as a percentage.

**Builder layout:**
- Each domain is a collapsed row: include checkbox, domain dot, a disclosure button (title, "n of m subjects" or "Not included", chevron, `aria-expanded`), share % and weight stepper. Opening one shows its subjects (checkbox, share, weight) in a 2-column grid on desktop and 1 column on phones. Ticking a subject in an unticked domain ticks the domain.
- Above the list: "Find a subject" search (matches subject titles, or a domain title for all its subjects; opens domains with matches; clearing or Esc restores the open state), the tally "X of N domains · Y of M subjects", and All / None / Expand all (Collapse all). All/None tick or untick every domain and subject through the normal draft auto-save; weights are kept.
- Which domains are open is per-tab UI state (sessionStorage `studyblock:mixOpen`), never in the draft or presets.
- The summary ("Your mix") shows a per-domain share bar and one row per included domain (dot, title, "n subjects", share), plus Practice/Guided, Difficulty, Questions and Start.

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
- `presets/index.json` → `{ "presets": ["daily-warmup", "stem-focus"] }` (today 7: daily-warmup across all domains, stem-focus, world-and-money, humanities, code-and-logic, life-sciences, everyday-skills; keep them covering the current domains). Ids match `^[a-z0-9-]+$` and are loaded only if listed here.
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

## Roles and Subroles (ticket 020)

A role is a hand-made weighted mix with a difficulty shift, plus role-only Expert+ scenarios. A subrole is a narrower mix under its role.
- **Registry:**
  - `roles/index.json` holds `{ "roles": [ids] }`, and `roles/<id>.json` holds `{ id, title, icon, description, exclusive, mix: { module: { weight, subtopics? } }, subroles: [{ id, title, description, mix?, icon?, exclusiveSubtopics }] }`.
  - A subrole without `mix` inherits the role's. An empty `exclusiveSubtopics` means all of them.
  - Unknown modules or subtopics are dropped with one warning per role.
- **Levels:** `easy`, `medium`, `hard`, `expert` (`ROLE_LEVELS`). Easy draws subject Medium, Medium draws Hard, Hard draws Expert (closest level the subtopic has). The last ceil(20% × count) questions are role scenarios at tier `medium`/`hard`/`expert` (`roleScenarioTier`), limited to the subrole's `exclusiveSubtopics`; a missing tier means no scenarios that run (one warning). **Expert** is scenarios only, at tier `expert-plus` (flame pill). Old ids `normal`/`expert-plus` are aliases for easy/expert (`normalizeRoleLevel`).
- **Count:** default 10 (Expert 5), adjustable 5–50 on the role page (one control for Easy–Hard, one for Expert), stored in localStorage `studyblock:roleCount` as `{ "<role>[~<subrole>]": { std, expert } }`. Route: `#/rq/<role>[~<subrole>]/<level>[?n=<count>]` (n omitted when default).
- **Weighted score:** a scenario question's `weight` = its number of parts (1–6). Attempt `score` = Σ credit × weight, `total` = Σ weight. A "×N" tag shows in the quiz, review and History; the by-module breakdown is weighted. Subject stats stay unweighted; guided runs count questions. `weight` is stored only when > 1 and is optional on import (integer 1–6).
- **Role-only modules** (`modules/role-*/`, `"roleOnly": true`, every subtopic `["medium", "hard", "expert", "expert-plus"]`: medium 2 parts, hard 3, expert 3–4 and lighter than expert-plus): `loadModule` refuses them, so they never appear on domain pages, Home, mixes, `#/m` or `#/q`. `loadRoleOnlyModule` loads them only as a listed role's `exclusive`. `expert-plus` is valid only there. They are multi-part scenarios (3–4 parts, each a different subject skill) with independent verify, hints and given rows.
  - Business Analyst (`role-business-analyst`): sales-review, statement-review, investment-case, campaign-pricing.
  - Software Engineer (`role-software-engineer`, language-aware: all five code languages): api-endpoint, ledger-check, hot-loop, fx-payout. Hot-loop code is built with codelang and the hot line is named by its line number; the ledger float bug uses hand-written per-language snippets in `floatcode.js` (codelang has no float type); calendar maths uses `dates.js`.
  - Mathematician (`role-mathematician`): quality-control, claims-pricing, growth-model, check-derivation (role level only; population SD, end-of-year discounting).
  - Data Analyst (`role-data-analyst`): ab-test, kpi-review, query-outliers, storage-cost. Lifts are percentage points; a segment's contribution is its change ÷ last period's total; outlier = more than 2 × the median of the returned rows; 1 GB = 10^9 bytes.
  - Physicist (`role-physicist`, g = 10 m/s², constants stated): launch-motion, orbit-signals, decay-safety, heating-power, optics-bench (Optical Physicist; real-is-positive lenses worded as in Waves, magnification = |v| ÷ u with orientation as an Image | Orientation choice, c = 3.00 × 10⁸ m/s and h = 6.63 × 10⁻³⁴ J s stated, answers in units of 10⁸ m/s, 10¹⁴ Hz and 10⁻¹⁹ J; Expert+ is two converging lenses (lens 2 never gets a virtual object) or a fibre worked back from its core–cladding critical angle).
  - Accountant (`role-accountant`): transaction-review, audit-review, asset-review, break-even-review, budget-variance (flexed budget, price/volume/cost variances, investigate by a stated %; whole-dollar figures, 365-day year, covenant and materiality rules stated in each prompt, no country-specific law).
  - Chemist (`role-chemist`): yield-purity, titration, gas-vessel, batch-cost (relative atomic masses, R = 8.31 and 24 dm³/mol at RTP stated in each prompt).
  - Electrical Engineer (`role-electrical-engineer`): power-circuit, battery-energy, register-flags, sensor-data (1 kB = 1000 bytes, bits numbered from 0 at the right, fuse and cable ratings stated).
  - Biologist (`role-biologist`): cross-counts, hardy-weinberg, field-ecology, growth-diversity, dilution-counts (chi-square cut-offs, Lincoln–Petersen, transfer % and Simpson's formula stated; dilution-counts (Microbiologist): step factor (v + d) ÷ v, CFU/mL = colonies ÷ (volume × dilution), an inclusive stated countable range, N = N₀ × 2^(t/g) and C₁V₁ = C₂V₂ stated; large counts are "A × 10ⁿ CFU/mL, type A" to 2 dp with n given and A exact; dilution factors, CFU mantissas, tube counts and expected colonies exact; lab practice only, no organisms named as health risks).
  - Game Developer (`role-game-developer`): move-collide, loot-odds, xp-curve, frame-budget (first frame at or past the wall, geometric XP curve where level 1 costs the base, pity cap at pull H, frame cost = fixed + per entity, pairs = n(n−1)/2).
  - Network Engineer (`role-network-engineer`): subnet-plan, transfer-window, cipher-decode, log-flags (usable hosts 2^h − 2, /31 and /32 never, 1 MB = 8 megabits, A = 0 … Z = 25, affine keys coprime to 26, flag weights and lockout rules stated).
  - Music Theorist (`role-music-theorist`): key-chords, progression, bar-timing, transposition (uses `js/lib/music.js` build/check toolkits; notes are choice parts; no double accidentals; cadence rule, tempo ranges and instrument transpositions stated; tempo in quarter notes per minute).
  - Operations Manager (`role-operations-manager`): route-timing, load-planning, staffing-plan, stock-reorder (fixed UTC offsets, 15-minute break per full 2 hours of driving, counts round up, stock-count convention stated).
  - Teacher (`role-teacher`): mark-equations, mark-fractions, diagnose-data, diagnose-moles. A student's worked answer as numbered steps with exactly one first mistake (later lines follow from it; a wrong-operation line shows the student's own working). Parts: the wrong step, corrected value, right answer, marks under a stated made-up scheme (follow-through stated), and Error type | Next step. No real exam board's rules.
  - Nutritionist (`role-nutritionist`): label-energy, label-scale, activity-energy, fluid-volume. Calculation practice only: figures are made up and say so, 4/4/9 kcal per g, 1 kcal = 4.184 kJ, MET × kg × h and 1 kg = 1 L stated; no advice, targets, doses or "is this normal"; cut-offs are worded as rules "for this exercise". It has a `startNotice`.
  - Economist (`role-economist`): inflation-real, elasticity-revenue, tax-incidence, growth-doubling. Real wage = wage ÷ index × 100, midpoint elasticity, linear curves with the tax on sellers, and the rule of 70 or ln 2 ÷ ln(1 + r) are stated in each prompt; made-up figures, no country-specific rules.
  - Historian (`role-historian`): dating-sources, calendar-spans, object-labels, exhibit-timeline. Reasons from stated years and dates, no recall: BC years count down with no year 0 (`dates.js` calendar maths), year answers are year-precision date parts ("44 BC"), the Gregorian calendar, a stated 2026 opening year, whole years by anniversary, a stated weekday to count from, and gallery/room rules in each prompt.
  - Geographer (`role-geographer`): scale-journey, grid-route, contour-slope, climate-table. 6-figure grid references (3 + 3 figures in tenths of a km), bearings clockwise from grid north, a stated "1 in R" steepness rule, stated temperature/rainfall bands and a 3×3 biome table; made-up data, no real-place facts.
  - Linguist (`role-linguist`): agreement-edit, readability, word-building, made-up-language. Numbered words with exactly one wrong (nouns always right; collective nouns and "each of" singular; this/these near, that/those far; stated conventions); generic fixes that fit several rules so Rule | Fix isn't a giveaway; a made-up Plain Index = ASL + 10 × ASW with bands < 28, 28 to < 34, ≥ 34; word building from a stated glossary and spelling rules; a made-up language with stated word order, plural suffix, past particle (Expert+ infers them from examples), and a blocklist for generated words. British English.
  - Civil Engineer (`role-civil-engineer`): beam-check, tie-rod, concrete-batches, setting-out, pipe-drainage (Water Engineer), ground-stress (Geotechnical Engineer). Water 1000 kg/m³, g = 9.81 N/kg and γw = 9.81 kN/m³ stated; Q = A·v, pump head = static lift + friction, hydraulic power ρgQH ÷ efficiency, gradient 1 in N = length ÷ fall between inverts, tank storage = highest − lowest running total of (supply − demand) over 4-hour blocks, mains and anchors picked from a stock list; σ = Σγh, u = γw × depth below the water table, σ′ = σ − u, bearing pressure = (load + footing weight) ÷ area, block-on-plane FoS = (cL + W cos θ tan φ) ÷ W sin θ with anchors adding resistance; whole-number parts exact. kN, m, N/mm², E = 200 GPa; allowable/yield stresses, swell 25%, waste allowances and tolerances stated in each prompt; trucks and lorry loads round up and are billed in full; RL = reduced level in m, formation = the earthworks level; no country's code.
  - Architect (`role-architect`, 5 subtopics): plan-scale, stair-rule, daylight-glazing, ramp-access, planting-paving. Plan scales 1:50/100/200, the 2R + G 600–650 mm comfort range, pitch limits, glazing minimum/maximum %, wall piers, ramp landings, budgets and contingency are stated in each prompt; counts round up for "enough" and down for "how many fit"; paving slabs are laid in a grid from one corner (slabs per side rounded up, offcuts not reused); no country's building code.
  - Project Manager (`role-project-manager`): delay-finish, crash-decision, earned-value, resource-plan. Uses project-scheduling's conventions (Mon–Fri with the start date as day 1, stated holidays, crash networks where greedy equals the optimum, EV formulas); tasks round up to whole days; penalty, bonus and escalation rules stated; SPI kept to 0.6–1.5 where the planned share is stated.
  - Electrician (`role-electrician`): breaker-load, cable-drop, fault-finding, running-cost. 230 V, a stated breaker list, a made-up cable table (ratings, mV/A/m), the 80% load rule and drop limits stated; voltage drop = mV/A/m × I × L ÷ 1000. Arithmetic practice only, never real wiring; has a `startNotice`.
  - Pilot (`role-pilot`): wind-triangle, fuel-planning, chart-work, eta-descent. kt, nm (1 nm = 1852 m), true bearings, fuel in litres; the sine rule for the wind correction angle and wind components stated; fixed UTC offsets (incl. half hours), no daylight saving; reserve, 10% contingency, curfew and clearance rules stated. Not for real flight planning; has a `startNotice`.
  - Data Scientist (`role-data-scientist`): classifier-scores, model-training, experiment-test, regression-fit. Precision/recall/F1 (stated formulas), screening counts from prevalence/sensitivity/specificity, batches rounded up, gradient descent on (w − a)², A/B tests with pooled SE, z, a 95% interval (1.96) and the sample size 2(1.96 + 0.84)²p̄(1 − p̄)/δ² rounded up, least squares from stated sums. Distinct from Data Analyst (no SQL/KPI dashboards).
  - Land Surveyor (`role-surveyor`): coordinates, traverse-closure, plot-area, levelling. Whole-circle bearings clockwise from grid north, ΔE = d sin θ, ΔN = d cos θ; linear accuracy 1 in N = perimeter ÷ misclosure; shoelace area, 1 ha = 10 000 m²; level books by height of instrument or rise and fall with the ΣBS − ΣFS check; allowable misclosure 10 mm × √K stated.
  - Investigator (`role-investigator`): timeline, statements, record-patterns, flag-odds. People named by job only, no violence; one-liar statements brute-forced to a unique liar and culprit (verify refuses any other); arrival = last seen + journey, 24-hour `HH:MM` text answers; a stated first-digit rule (30% of 1s, 5% of 9s, a "more than" ±25% band); natural-frequency base rates; made-up figures.
  - Chef (`role-chef`): recipe-scaling, service-timing, dish-cost, stock-waste. Yield % (raw = usable ÷ yield), pack sizes, plating and hold times, waste tolerance (% of stock used) and target GP are stated "for this exercise", no food-safety law; packs, eggs and batches round up, whole portions round down, target prices round up to 5 cents; times are 24-hour HH:MM text parts.
  - Retail Manager (`role-retail-manager`): footfall-staffing, markup-margin, deal-compare, stock-shrinkage. Markup = profit ÷ cost, margin = profit ÷ price; deals (3 for 2, x% off, half-price 2nd/3rd, any 2 for $Y) with left-over items at full price; stock and sales at cost, shrinkage = opening + purchases − sales − counted closing, stock turn = sales ÷ average stock; made-up figures, generic $.
- **Subroles** (four per role; ticket 025 added the second pair): Financial Analyst, Marketing Analyst, Operations Analyst and Strategy Analyst; Backend Engineer, Fintech Engineer, Security Engineer and Systems Programmer; Statistician, Actuary, Pure Mathematician and Applied Mathematician; BI Analyst, Research Analyst, Product Analyst and Analytics Engineer; Astrophysicist, Nuclear Physicist, Optical Physicist and Geophysicist; Auditor, Management Accountant, Tax Accountant and Forensic Accountant; Analytical Chemist, Industrial Chemist, Environmental Chemist and Physical Chemist; Embedded Engineer, Power Engineer, Electronics Engineer and Control Engineer; Geneticist, Ecologist, Microbiologist and Bioinformatician; Gameplay Programmer, Game Designer, Graphics Programmer and Economy Designer; Network Admin, Security Analyst, Network Architect and Network Support Technician; Composer, Arranger, Music Analyst and Music Producer; Logistics Coordinator, Production Planner, Warehouse Manager and Workforce Planner; Examiner, Tutor, Moderator and Learning Support; Food Label Analyst, Sports Nutrition Analyst, Menu Planner and Nutrition Researcher; Macroeconomist, Market Analyst, Policy Economist and Financial Economist; Archivist, Museum Curator, Ancient Historian and Science Historian; Cartographer, Climate Analyst, GIS Analyst and Physical Geographer; Editor, Translator, Lexicographer and Computational Linguist; Structural Engineer, Site Engineer, Water Engineer and Geotechnical Engineer; Building Designer, Landscape Architect, Interior Architect and Architectural Technologist; Scheduler, Cost Controller, Construction Project Manager and IT Project Manager; Installation Electrician, Maintenance Electrician, Solar PV Installer and Controls Electrician; Flight Planner, Navigator, Flight Instructor and Cargo Pilot; ML Engineer, Experiment Analyst, Forecasting Analyst and Quantitative Researcher; Boundary Surveyor, Levelling Surveyor, Engineering Surveyor and Topographic Surveyor; Case Analyst, Fraud Examiner, Digital Forensics Investigator and Insurance Investigator; Head Chef, Kitchen Manager, Pastry Chef and Catering Chef; Store Manager, Merchandiser, Retail Buyer and E-commerce Manager. There are no "X Teacher" subroles: Teacher is a general role, with subroles by task.
- **Storage:** a role attempt is stored as `module: "role"`, `subtopic: "<role>"` or `"<role>~<subrole>"`, and `difficulty: <role level>`.
  - Questions carry their own origin, and their stored difficulty is the subject level drawn (`expert-plus` for scenarios). They count toward subject stats like mixes do; role-only modules count only under the role.
  - History has a "Roles" group, and Home Recent shows the role tag. Role runs don't set the last-module cookies.
- **Flags and About this role:** a role and each subrole may set `"flags": [ids]` (a subrole shows the role's flags plus its own, deduped; unknown ids dropped with one warning per role; the legacy `"experience_based": true` and id `experience_based` mean `experience_heavy`). Ids and tags: `experience_heavy` (Experience-led), `safety_critical` (Safety-critical), `authority_required` (Authority required), `license_oriented` (License-oriented), `region_specific` (Varies by country), `tool_heavy` (Tool-driven), `tool_specific` (Tool-specific: questions tied to a named language, tool, standard or gear; set on Software Engineer (the chosen code language), Data Analyst (SQL), Network Engineer (IPv4) the Arranger subrole (transposing instruments) and the Bioinformatician subrole (SQL and the chosen code language)), `creative_oriented` (Creative-oriented), `theory_heavy` (Theory-led; tag only). Tags are neutral icon + text chips on role cards and under the page title. The "About this role" card (the exclusive module's `intro.md`) opens with one callout per flag, in the fixed order safety_critical, authority_required, experience_heavy, license_oriented, region_specific, tool_specific, tool_heavy, creative_oriented (`FLAGS` in `roles.js`, which reads the role JSON itself). Practice-based roles are experience_heavy; academic ones (Mathematician, Physicist, Chemist, Biologist, Music Theorist) are theory_heavy.
- **Start notice:** a role or subrole may set `"startNotice": { "title" (≤ 60), "text" (≤ 600, markdown) }` (strings only; invalid ignored with one warning per role; a subrole's own replaces the role's). Starting a run (`#/rq`, `#/rg`, from the role page or a direct URL) first shows a confirmation screen: the title, the text as a Warning callout, and "I understand · Start" / "Back to role". It's remembered per role in sessionStorage `studyblock:roleAck`, so it's asked once per browser session; Retry and Another set don't ask again. The role page shows the notice as the first callout in "About this role".
- **Industries (ticket 028, display only):** `roles/index.json` may list `industries: [{ id, title, icon, roles }]` (Technology, Business, Science, Engineering, Operations, Service, Humanities, Miscellaneous for niche roles). `roles` stays the source of truth; unknown or repeated ids are dropped and unlisted roles go into a trailing "Other" (`loadRoleIndustries` in `engine.js`). URLs, attempts and stats never see them.
- **Roles list page:** rendered from sections (one per industry, `<h2>` with icon and count; role card titles are then level 3). From 1024px a sticky side table of contents (scroll-spy `aria-current`, buttons that scroll and focus the card without changing the hash); below that a sticky "Jump to role" `<select>` with optgroups. A "Find a role" filter matches role and subrole titles, hides empty sections, Esc clears. Home's Roles card reads "N careers in M industries: …".
- **UI:** a desktop nav link "Roles" (`briefcase-business`) and a Home card, while the phone tab bar stays at 4 tabs. The Domains tab (`#/domains`, `library` icon) is reached the same way: a desktop nav link before Roles and an "All domains" Home card. Expert+ prompts keep inline code at text size (`.is-code`).
- **Bundle:** `tools/bundle.py` includes `roles/**` and the exclusive modules of listed roles.

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

**Difficulties** are `easy`, `medium`, `hard` and `expert` (`DIFFICULTY_ORDER` in `engine.js`), offered per subtopic. 41 deep subjects add Expert and the other 24 (fact lists and simple skills) stop at Hard; a subtopic may stop at Medium where Hard wouldn't be harder (none does yet, ticket 015). Unknown values and duplicates are dropped with one warning per module, and a subtopic left with none is skipped. The module grid shows only the levels a module offers.
- **Expert** means multi-step or multi-concept problems, working backwards, or a problem the learner sets up, not bigger numbers. It is added as a separate branch in `generate()`/`verify()` (dispatching on `difficulty` and `params.kind`), so existing levels never change per seed. `modules/algebra/` is the reference.
- **UI:** Expert shows a `flame` icon plus its label (`difficultyHtml`/`difficultyTag` in `ui.js`), with a pill in the accent tokens, so it never relies on colour alone.
- **Expert conventions:** every part states its rounding, and chained parts must not change answer when worked from an earlier rounded answer (redraw instead). Part ids stay lowercase (`multiShapeOk`); labels of 3 characters or fewer (`b`, `k`, `x1`) keep their case in the quiz (`.part-label.keep-case`), longer ones show in capitals.

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

The engine does **not** shuffle generator `choices`: a generator must shuffle its own options (with the rng), or the answer sits in a fixed position. The engine seeds `rng` per question and stores the seed, so any question can be regenerated. After `generate`, the engine calls `verify(question, question.answer)`; if it fails, it discards and regenerates (max 20 tries, then logs an error).

### Question visuals (ticket 026)

A generator question may carry one `visual` (data only, never markup): `{ kind: "table"|"bar"|"line"|"triangle"|"shape"|"coords", caption?, … }`. The fields, limits and generator rules are in ticket 026.
- **Engine:** `sanitizeVisual` (`js/lib/visual.js`) keeps known fields only and drops a broken visual whole, with one warning per module. It is stored on the attempt and re-checked on import. CSV modules don't get visuals.
- **Display:** `visualHtml` (`js/views/visual.js`) draws it under the prompt (outside `.prompt`, so answer notes are unchanged), in feedback, the review and History. Tables are a ruled-paper HTML table; the rest are inline SVG (`VB_W` 280, max 380px wide on desktop, tick text ≥ 12px at 360px).
- **Defaults:** `showValues`, `showPoints`, `toScale` false; `showGrid` true; a `null`/`""` label is left off; captions sit above. Axes, ticks, axis labels, legends and the right-angle marker always draw.
- **Shape dims:** rectangle width/height; circle radius (label also `diameter`); composite-l width/height/cutWidth/cutHeight (cut at top right; labels also `topWidth`, `rightHeight`); cuboid length/width/height; cylinder radius/height; sector radius/angle (label also `arc`).
- **Rules for generators:** no rng calls in visual code (fingerprint before and after); Easy–Hard keep the prompt text unchanged; Expert may omit labels, and an omitted value is then absent from the prompt, `given`, hints and alt text; an omitted length needs `toScale: true`, and a value read off a chart sits on a gridline (`visualAxes(v)` gives the drawn ticks, for `verify`) or within tolerance.
- **Alt text** describes structure and visible labels only; hidden values are never in it.
- **Subjects with visuals** (first pass): Business Math (one-row written tables, `?` in the asked cell), Business Case and Finance (fact and cash-flow tables, break-even lines, NPV cash-flow bars; helpers in each module's `visuals.js`), Statistics (frequency and marble bar charts, weighted-average tables, running-mean line), Kinematics (distance–time, speed–time and velocity–time lines; none where the graph would plot an answer), Trigonometry and Geometry (triangles and shapes; slivers and extreme ratios are schematic, "Not drawn to scale"), Coordinate Geometry (grids that include the origin and never plot a point that is the answer). Easy–Hard prompts are unchanged. **Expert read-off templates** (about 1 in 4 Expert questions in those cells) leave values off the picture on purpose: Statistics `x-readfreq`, `x-readbars`; Kinematics `x-readvt`, `x-readdt`; Business Case `be-chart`, `inv-chart`; Finance `x-chartdep`; Trigonometry `x-estR`, `x-estG` (to-scale angle estimates as choice parts 15° apart, true angles multiples of 5°; later parts use the true angle) and the ladder's foot distance; Geometry `x-gridplate`, `x-gridread`; Coordinate Geometry `x-readpts`, `x-readline`. Conventions: `showValues: false`; every read value is a whole number of axis steps (grids: step 1, every point on an intersection); at most 8 ticks per axis so every tick is labelled; the axis ends a step above the data; the prompt says to read values from the chart; rates avoid multiples of 5; the explanation states the read values. `verify` re-sanitizes `question.visual`, checks values sit on `visualAxes` ticks and recomputes from the picture. A negative bar's value sits inside the bar when it would hit the category labels.

### Code languages (Code Writing, Code Reviewing)

- `module.json` may list `"languages"` (a subset of `js/lib/languages.js` ids, in display order; unknown ids dropped with a warning; generator modules only). Empty or absent = not language-aware.
- The effective language is the `sb_codeLang` preference if the module lists it, else its first listed language. It's picked on the module page or in Settings → Code language.
- Language-aware generators are called as `generate({ subtopic, difficulty, rng, lang })`; other modules never get `lang`, so their questions are unchanged. The engine keeps `lang` across verify retries and puts it on the question. `verify` doesn't receive `lang`: generators put it (and a `meta` with template + params) on the returned question.
- Generators draw **all** rng values before rendering, so one seed is the same logic in every language. Snippets are built once with `js/lib/codelang.js` (its header documents the AST, `check` rules, `render`/`lineOf`, `run`) and shown in a fence tagged `LANGUAGES[].fence`. Code choices are wrapped in backticks (choices go through `renderInline`), and the stored answer is the same string.
- `verify` rebuilds the program from `meta`, substitutes the candidate answer and `run()`s it against plain-JS references. Number blanks are unique in a scanned range or worded "smallest (0 or more)"; exactly one choice passes all tests.
- A stored question may carry `lang` (checked with `isLang` on save and import); `regenerate(module, subtopic, difficulty, seed, lang)` rebuilds the same snippet.
- **Blocks for one line** (`codelang.js`): `lineTree` splits a rendered line into blocks. Calls `f(…)`, indexes `xs[…]`, C-style `for (…)`/`if (…)` headers and bare groups become slot tiles. `,` `;` and a trailing `:` stick to the previous block; C++ `(int)`, C# `!` and Rust `&` stick to the next. `blocksFor(text, { distractors, count, seed })` returns a shuffled `{ tiles, solution }` (seeded, no rng from the generator). Also exported: `serialiseBlocks`, `decoyTokens`, `spacingVariants` and `textKey`.
- **Typed subtopics:** Code Writing *Write the line* and Code Reviewing *Rewrite the buggy line*. Both are typed with a Blocks alternative. `accepts` holds spacing variants and equivalents that were run against the tests (flipped comparisons, `i <= n`, Rust `1..=n`, a trailing `:`/`;`/`{`); the buggy line is never accepted. Both modules set `fuzzy: false` and `tilesMultiplier`.
- **Language features** (Code Reviewing, Medium–Expert, `modules/code-reviewing/langfeatures.js`, a helper file imported by `generator.js`; module folders may hold such helpers): hand-written per-language templates instead of codelang, so a seed gives a different question in each language. They cover Python division and aliasing, C# structs, overflow and compile rules, C++ references, pointers and UB, GDScript references and typing, and Rust ownership, borrowing and overflow. `verify` rebuilds from `meta` and checks the answer with per-family semantic models or line checkers. Undefined behaviour is only ever identified, never predicted. Stated assumptions: an English culture (C#), a 32-bit int (C++), Godot 4, and a rustc debug build. Lexer: `(double)` sticks like `(int)`, and C++ `int&` keeps the `&` on the type block.
- Code renders without ligatures (`font-variant-ligatures: none`), so `<=` never shows as ≤. Snippets aren't compiled in tests; see ticket 010.

### CSV modules — `questions.csv`

Header: `subtopic,difficulty,prompt,answer,choices,explanation`
- `choices` is `|`-separated; empty means free-text answer.
- `difficulty` may be empty (applies to all).
- Optional `type` column: empty = as above, `date` = a date answer (see Date answers), `tiles` = a pure blocks question.
- Optional `hints` column: 1–4 `|`-separated hint steps (same rules as generator hints); empty = the explanation-split fallback.
- Optional `tiles` (`|`-separated; label = value, no nesting) and `joiner` columns. An empty joiner means `" "`, and `(none)` means no joiner (`bio` + `logy`). With `type` empty and a free-text answer, `tiles` makes a dual Type | Blocks row that uses the module's `tilesMultiplier`. `useAll` is set only when the answer needs every tile. A row whose answer the tiles can't build, or that has tiles together with choices or a date, is skipped with one warning per module.
The engine samples rows with the seeded rng and shuffles choices.

### Answer checking

- number: parse float, `|user - answer| <= tolerance` (default 1e-9).
- text: `−` read as `-`, trim, collapse whitespace, case-insensitive, and spaces around `:` and `,` ignored (so `2 : 7` matches `2:7`, `2,4` matches `2, 4`).
  - **Equivalent fractions:** when the answer is a plain fraction `a/b`, any equal plain fraction is accepted (`2/6` for `1/3`), and the feedback adds "In simplest form: 1/3". Whole-number answers don't accept `4/2`, and mixed numbers are compared as text. A generator sets `exactForm: true` on a question (or part) to require the exact form; Fractions → Simplifying does.

**Answer-format notes.** Trailing sentences of a prompt that only say how to write the answer ("Give your answer as…", "Round to 2 decimal places.", "Type the number without the % sign.") are split off at display time (`splitAnswerNote` in `quiz.js`) and shown as a small muted note with an `info` icon under the question. Only the last paragraph is looked at (never code, tables or lists), and sentences that are the task itself ("Give the x-coordinate of that point.") stay in the question. Generators keep writing notes at the end of the prompt; stored prompts are unchanged.
- choice: exact match of the chosen string. **Select, then Check:** on single-answer choice questions (and Choose mode of segmented ones) a click, tap, Enter/Space or number key 1–9 only selects (`aria-pressed`, a "✓ Selected" cue; key repeat ignored); **Check**, or Enter with an option selected, submits. Guided: a wrong try disables that option and clears the selection. Multi-part choice parts already worked this way.
- tiles: the serialised blocks, then the text rules.
- `accepts`, close-answer credit and the Blocks multiplier are described below.

### Block answers (`answerType: "tiles"`)

The learner builds the answer from blocks (tickets 016, 017). Generator-only; not a multi-part part type.
```js
{ answerType: "tiles", tiles: [{ value: "A", label: "Moon landing (1969)" }, "B"], joiner: ", ", useAll: true, answer: "B, A" }
```
- **Contract:** 2–24 tiles; a string is shorthand for `{ value: s, label: s }`; duplicate values are allowed. `joiner` is a string of at most 5 characters (default `" "`). `useAll: true` means every tile must be placed (no distractors); otherwise Check needs at least one placed tile. Without a `solution`, the engine rejects (and regenerates) a question whose `answer` can't be built from distinct tiles joined by `joiner`.
- **Nested blocks:** a tile may have `slot: { open, close, sep }` (defaults `(`, `)`, `", "`; open/close ≤ 3 chars, may be empty or a space). A slot tile serialises to `value + open + kids joined by sep + close`. Any slot tile requires `solution`, a tree of tile indices (`[0, { t: 1, kids: [2] }, 3]`). Each index is used once, kids only under slot tiles, at most 3 slots deep, and the tree must serialise to `answer` (`cleanSolution`/`serialiseTree` in `engine.js`). Show solution and the "correct blocks" row use it.
- **Distractors** scale with difficulty: easy 0–1, medium 2–3, hard 4–6, expert 6–10.
- **UI:** a "Your answer" row above a "Blocks" bank.
  - Tapping places a bank block into the *active target*: the answer row, or the slot of the placed slot tile last tapped (accent outline). Tapping an active slot tile again returns it with its kids.
  - Pointer Events drag places, reorders and returns blocks, including into nested slots (6px threshold, `touch-action: none` on tiles only).
  - Keys: Enter/Space toggle; arrows move focus; Alt/Shift+←/→ move a placed block; Delete returns it; Esc makes the answer row active. Placements are announced politely.
  - Reset returns all blocks. A "Filter blocks" box appears when the bank holds more than 10. Number keys don't answer, and the calculator's Use is disabled. A wrong answer shows the correct blocks. In Guided mode a wrong try stays editable, and Show solution lays out the tree.
- **Storage:** `userAnswer` is the serialised string.

### Typed or Blocks (dual questions)

A typed **text** question may also give `blocks: { tiles, joiner, useAll, solution }`, whose solution must serialise to `answer`.
- **Switch:** the quiz shows a **Type | Blocks** switch (`aria-pressed`), defaulting to Type. The choice is remembered per module in sessionStorage `studyblock:answerMode`, and switching keeps the work done in the other mode.
- **Multiplier:** `module.json` `"tilesMultiplier": { "easy": 1, "medium": 1, "hard": 0.85, "expert": 0.7 }` (0–1; missing level = 1). It's set on SQL Queries, Code Writing and Code Reviewing. A Blocks answer earns credit × multiplier and stores `mode: "blocks"` and `multiplier`. A note reads "Blocks: up to 85% credit at Hard", and feedback reads "Correct · Blocks ×0.85". Pure tiles questions never get a multiplier.
- **`accepts`** (any text question, ≤ 20): extra strings that also count as correct, by the text rules. Prompts pin the form (clause order, column order) so the list stays small.

### Close answers (partial credit)

A near miss earns part credit; `correct` stays false. This applies to single questions and to each multi-part part (whose credits are averaged). Never for choice, tiles or Blocks mode. Tickets 017 and 018.
- **Leniency levels** (numbers, 0–5; 0 = exact, 1 = normal, higher = more lenient; fractions allowed), set in `module.json` and overridable per question or part:
  - `"fuzzy": <level>` sets text leniency. `false` = 0; `true` or missing = 1.
  - `"fuzzyNumber": <level>` sets relative number leniency, or `{ "mode": "years", "level": n }` for years. Missing = relative at 1, or 0 when `fuzzy` is 0.
- **Text** (Damerau-Levenshtein after the text rules; an adjacent swap is 1 typo): up to floor(L) typos. The first typo gives a base by answer length: 4–7 chars 0.75, 8–14 chars 0.85, 15+ chars 0.90. Each extra typo costs 0.15, down to a minimum of 0.25. Answers of 1–3 characters, and any answer containing a digit, must be exact.
- **Numbers, relative mode:** the band edges are × L. Within 0.1%·L → 0.90, 1%·L → 0.75, 2%·L → 0.50. Applies to integers and decimals; the answer must be non-zero and the sign right. Without an explicit `fuzzyNumber`, it applies only when the calculator is on.
- **Years mode and dates:** off by d earns max(0, 1 − d/(L+1)), at 2 dp. At L = 1: 1 off 0.5. At L = 2: 1 off 0.67, 2 off 0.33. There is no year 0, so 1 BC → AD 1 is 1 off. "44 BC" and "AD 79" are read, including on CSV year answers.
- **Per module:** `fuzzyNumber` is 1 for every Math module (number-theory keeps text exact). It is 0 for radioactivity, map-skills, elements, chemistry, number-bases, boolean-logic, algorithms, networking, data-representation, sql-queries, vocabulary, word-roots, grammar, intervals-scales, chords and rhythm (and code via `fuzzy: false`). It is `{mode: "years", level: 1}` for timelines, world-history and inventions, and 1 elsewhere. Text `fuzzy: false` is set on the exact-answer modules (bases, data representation, networking, number theory, elements, chemistry, boolean logic, rhythm, grammar, vocabulary, word roots, SQL, algorithms, code, music).
- **Lookalikes:** an exact match for another real answer (another answer in the same CSV subtopic, or in the question's `nearMisses`) earns 0.
- **Display and storage:**
  - Feedback reads "Close · 85% credit" (`circle-dot`, warn colours). In Guided mode it reads "Almost", and a retry is allowed.
  - Stored as `fuzzy` (or `parts[i].close`) in one of these shapes: `{kind:"text", typos, factor, level}`, `{kind:"number", relErr, factor, level}`, `{kind:"number", mode:"years", off, factor, level}` or `{kind:"date", off, factor, level}`.
  - All of these are optional and validated on import.

### Date answers (`answerType: "date"`)

- **Shape:** `{ answerType: "date", precision: "year" | "month" | "day", answer: "20 July 1969" }`. The answer is canonical text ("1969", "July 1969", "20 July 1969"); BC is allowed only at year precision. Dates can also be multi-part parts. A malformed one regenerates.
- **Parsing:** `js/lib/dates.js` (pure). It accepts month names and abbreviations, ordinals, `Month D, YYYY`, ISO `Y-M(-D)`, and numeric D/M/Y read **day first**. All-numeric dates need a 3–4 digit year. Real dates only: no 31 April, and leap years are honoured.
- **Checking:** correct means the same value at the answer's precision; extra detail is ignored. Less detail is wrong, with the hint "give the month and year". Close credit uses the years formula, in units of the precision, across month and year ends.
- **UI:** a text field with a placeholder that fits the precision. A live "Read as: …" line (aria-live) shows the parsed date, or "Not a date yet". Check needs a value that parses. Feedback repeats "Your answer read as: …". Use is disabled.
- **CSV:** an optional `type` column. `date` makes the row a date answer, with its precision taken from the answer's format. Bad rows are skipped with one warning per module. Date rows are in World History and Inventions, and the Time and Dates generator (`calendar`) uses day-precision date answers.

### Grading hook and case

- **`grade()`:** a generator may export `grade(question, answerString) → { correct, note? } | null`. For text questions with `gradeByOutput: true`, in Type or Blocks mode, the engine calls it only when the text/accepts check fails.
  - Its verdict is final: correct earns credit (with the Blocks multiplier) and stores `gradedBy: "output"`; false earns 0 with no close credit; `null` means no opinion.
  - The `note` (≤ 300 chars, escaped) shows in feedback, guided and review.
  - Used by SQL *Write the query* (same output by running the query, no hard-coded literals or unasked-for LIMIT, and re-run on reshuffled and shifted copies of the tables to catch chance matches) and Boolean Logic *Write the expression* (same truth table).
- **`caseSensitive: true`** (text/tiles questions and parts): no lowercasing when checking, and no close credit. Used by Genetics *Write gametes & genotypes*.

### Run (test the output)

- **Module export:** `run(question, answerString) → { columns, rows } | { error }`. It must be pure and synchronous, use no eval, never throw, and return ≤ 200 rows. A question opts in with `runnable: true`, and keeps the data `run` needs in `meta`, which is in memory only and not stored.
- **Engine:** `runAnswer(q, answer)` calls it.
- **Quiz:** a **Run** button (Ctrl/Cmd+Enter) works in Type and Blocks modes. It shows an escaped Output table (20 rows, then "n more") or the error. It's unlimited, never scored, and allowed in Guided mode. Feedback and review also show the expected output.
- **Used by:** SQL Queries *Write the query*. Its hand-written SQL engine covers only the grammar the subtopic teaches.

### Block-list choices (segmented options) and Build | Choose

Options that combine several facts show as aligned blocks under column labels (ticket 019), e.g. `Elastic | Price ↓ | Revenue ↑`.
- **Generator shape:** `answerType: "choice"`, `choiceCols: [2–4 labels ≤ 24 chars]`, `choices: [[segment per column], …]` (segments ≤ 40 chars, no `|`), `answer` = the right array or its joined string, and optional `extraSegs: [[column label or index, value], …]` decoys.
  - Options: exactly 3 at Easy and 5 at Medium and above (the engine warns otherwise). **Mixed distances (ticket 022):** at least one wrong option differs from the answer in 2+ columns; the answer's value is never the strict majority in every column (a tie clears it); with 3+ columns no wrong option differs in every column, with 2 columns one may. Easy (3 options): both wrong options change one shared column and one also changes a second. Generators redraw until this holds and prefer plausible combinations (the answer must not be the only option whose columns make sense together). `segMixIssues` in `engine.js` checks every question and part and warns once per module; nothing is rejected.
  - The engine stores each option as one string joined by `" | "`, so checking, storage and History are unchanged. It keeps `choiceCols`/`choiceSegs` in memory. A bad shape regenerates.
  - Multi-part choice parts accept the same fields; they are Choose-only, at full credit.
- **CSV:** an optional `cols` column (labels `|`-separated) splits each choice into segments by ` ; `. An optional `extra` column holds `Column=value ; …` decoys. A mismatched row is skipped with one warning per module.
- **Build | Choose switch** (sessionStorage `studyblock:answerMode`, default **Build**):
  - **Build:** one slot per column. Bank blocks are tagged with their column, so `↑` under Assets and under Liabilities are different blocks. Order never matters, and a second block in a column replaces the first.
  - Build decoys come from other options, then extras: Easy 1–2, Medium 3–5, Hard 6–9, Expert 9–14 (≤ 24 blocks). The bank is shuffled by a generator seeded from the question seed, so the question never changes.
  - Build keeps Filter blocks (above 10), Reset, keys and ✓/✗ per column after Check. It earns full credit.
  - **Choose:** pick an option. Credit × `chooseMultiplier` (module.json; default easy 1, medium 1, hard 0.85, expert 0.7), stored as `mode: "choose"` and `multiplier`. The note reads "Choose: up to 85% credit at Hard".
- **Converted questions:** chords (root | quality | position), Accounting Terms equation rows, networking gateway, economics shortage/surplus, Boolean which-row, map-skills day | time, genetics ratios and parents, vectors position and turn, and biology photosynthesis. `extraSegs` should name columns by **index** when labels differ only in case (`TT`/`Tt`/`tt`), because label matching ignores case.
- **Storage:** optional `choiceCols`/`partCols` on stored questions, validated on import, so review and History show chips. Answer chips in feedback, review and History show their column label as a caption ("Measurable: Yes"). The calculator's Use note reads "place the blocks" (Build) or "pick an option" (Choose).
- **Case-sensitive notice:** any question or part with `caseSensitive: true` shows a warn box ("Case-sensitive: capital letters matter", `triangle-alert`), linked to the answer by `aria-describedby`.

### Journal entries (`answerType: "journal"`)

A table of Account | Debit | Credit lines (book entries). Generator-only; not a multi-part part type.
```js
{ answerType: "journal", accounts: ["Inventory", "Cash", "Capital"], amounts: [500, 800], rows: 3,
  answer: [{ account: "Inventory", side: "dr", amount: 500 }, { account: "Cash", side: "cr", amount: 500 }],
  accepts: { "Bank": "Cash" } }
```
- **Contract** (`cleanJournalSpec` in `js/lib/journal.js`): 2–6 answer lines, account+side unique, debits total = credits total, amounts positive with ≤ 2 dp, every answer account listed in `accounts` (2–12 distinct names, no `;`, ≤ 60 chars: the account blocks and the typing suggestions). `amounts` (≤ 8, optional) are the amount blocks. `rows` (2–6, ≥ lines) blank rows are shown. `accepts` (≤ 20) maps typed aliases to accounts; an alias naming a listed account or an unknown target is invalid. A bad shape regenerates.
- **Stored:** `answer` and `userAnswer` are canonical strings, `"Dr Inventory 500; Cr Cash 500"` (debits first, then credits, each by account; gaps written `?`), plus `journal: true` (optional, validated on import: both strings must parse).
- **Grading:** blank rows are ignored; lines match in any order by the text rules (after `accepts`), side and amount (± 0.005). Credit = matched answer lines ÷ max(answer lines, non-blank user lines); `correct` only with no extra lines. Duplicate lines are never merged. No close credit, no multiplier.
- **UI** (`js/views/journal.js`): every cell is typeable (datalist for accounts; `inputmode="decimal"` amounts accepting `$` and thousands commas; an amount clears the other side of its row) or filled from reusable blocks: drag (Pointer Events, 6px threshold, edge auto-scroll), tap a cell then a block or a block then a cell, Enter on a block fills the last-focused cell; placements are announced. + Row / remove (2–6), Reset, and a "Debits · Credits · Balanced/Not balanced" footer (informational). Check needs one row with an account and an amount; after Check each row shows Right/Wrong (icon + text) and, when wrong, the correct entry as a table (the explanation gives the effects in words, not a second table). Guided: right lines lock, wrong ones stay editable; Show solution fills the table. The calculator's Use fills the last-focused Debit/Credit cell. Phones (< 640px) show each line as a card. Review and History draw tables from the stored strings.
- Used by Accounting Theory *Journal entries*: Easy 2-line cash entries (rows 2), Medium 2-line credit/adjustment entries (rows 3), Hard 3-line compound entries (rows 4), Expert 3–4 line linked transactions as one compound entry (rows 5). Trade payables (goods for resale) and Other payables (anything else on credit) are never offered together; Bank is an alias of Cash.

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

### Callouts (standard notices in markdown)

`markdown.js` renders GitHub-style callouts: a blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` (any case), with an optional custom title after the marker (`> [!WARNING] For learning only`). Output is `<aside class="callout callout-<kind>" role="note">` with an icon and label (never colour alone); the body is full escaped markdown. All notices in `intro.md`/`guide.md` use them: the Medical/Biology disclaimer is `> [!WARNING] For learning only`, answer-format tips are `> [!TIP]`. Tokens are `--callout-*` (light and dark); the quiz `.case-note` matches the Warning callout. A plain blockquote renders as before.

### Audio previews (ticket 023)

After an answer is checked, music questions show a **Play** button (`volume-2` + "Play", 44px, `aria-label` "Play the chord/interval/note/scale/chord progression") in the feedback (including guided solved/solution) and the end-of-quiz review; never before answering, and not in History (stored attempts don't keep it).
- `js/lib/audio.js` synthesises with Web Audio: no files, works offline, a lazy AudioContext on the first click, a soft triangle with two quiet partials, one playback at a time (stopped on Next and when leaving). The button is hidden when there is no AudioContext.
- Generators attach `play` (`{ mode: note|interval|chord|scale|progression, notes|chords, semis? }`, notes `{l, a}`, optional octave `o`) with `withPlay(q, spec)` in a thin wrapper around their old `generate`, derived from `params`: no rng, so prompts and answers are unchanged. The engine keeps `meta` but drops unknown fields, so `withPlay` mirrors it to `meta.play`; the quiz reads `q.play ?? q.meta.play`. Never stored.
- Used by Intervals & Scales, Chords and Role Music Theorist (not bar-timing or the downward transpositions). Settings → Sound (cookie `sb_sound`, default on) hides every Play button when off.

## Game elements

Light gamification: icon + text only, no animations beyond existing transitions, no sounds or confetti.
- **Logic** (`js/lib/gamify.js`, pure; the rules live only there), derived from stored attempts, so export/import carries it:
  - XP per practice attempt: per question credit × weight × level points (easy 10, medium 15, hard 20, expert 30, expert-plus 40; the question's own difficulty, else the attempt's), +5 for finishing, ×1.2 for a perfect score, rounded. Guided attempts give 0.
  - Levels: level L → L+1 costs 100 + 50(L − 1) XP.
  - Streak: consecutive local calendar days with any attempt (guided counts), DST-safe; `{ current, best, today, atRisk }`.
  - 15 badges (first quiz, flawless, expert attempt/flawless, 10/50/200 quizzes, 3/7/30-day streaks, explorer (5 domains), all-rounder (every level of one module), first role, first mix, guided learner) with `earnedAt` and `progress`.
- **UI** (`js/views/game.js` shared pieces and the cached `gameContext()` = `{ domainOf, levelsOf }` from the registry; `js/views/badges.js`):
  - Settings → Game elements (cookie `sb_game`, "0" = off, default on) hides everything below.
  - Home: a "Your progress" card (level pill, XP progressbar, streak line with "Practise today to keep it" when at risk and "best N", hidden when both are 0; next badge with progress; "All badges (n of 15)"; a "New badge: …" line for earned badges not yet seen).
  - Results (practice, mix and role runs; never guided): "+N XP" with a short "how" line (left out when more than 2 levels scored), "Level up" when it happened, and newly earned badges; then all earned ids are saved as seen.
  - `#/badges` (History nav highlighted; not in the nav or tab bar; linked from Home and the top of History): level, streak and badge count, then badge cards (earned with date; others with "n of m" and a bar). Opening it marks earned badges as seen. When off, it says so and links to Settings.
- **Storage:** localStorage `studyblock:seenBadges` (per-browser list of ids, never exported). The first time it is missing, badges already earned are marked seen silently, so existing users aren't shown every old badge as new.

## Guided mode

- Module page: a **Practice | Guided** switch (sessionStorage `studyblock:quizMode`; opening `#/q` or `#/g` sets it). In Guided mode grid links go to `#/g/…` and cells show "Guided" instead of scores.
- Guided runs reuse `runQuiz` with `opts.guided`: a "Guided · not scored" pill, hints in an aria-live list (**Hint n of N** or the H key), unlimited tries (a wrong choice is disabled; correct multi-part parts lock), and **Show solution** always available.
- **Saved but never scored (ticket 011):**
  - A guided run is saved as an attempt with `guided: true`. Its `score` is the number solved first try, and each question has `outcome: "first" | "after" | "solution"`.
  - Guided attempts are excluded from every stat, best score, summary row and Home's continue card.
  - History and Home Recent show them with a Guided tag (`compass` icon + text). On import, `guided` must be a boolean.
- **Guided mixes:** the Mix builder has a Practice | Guided switch (the shared `studyblock:quizMode`, never stored in the draft or presets). Guided mode opens `#/mix/guided`, where each question shows its own module's guide card.
- **Show solution** stays `aria-disabled` ("Try once first") until the first checked wrong or close answer, or until every hint is shown. The end screen counts solved first try / solved after hints or tries / used the solution, lists the questions, and offers Another guided set and Practice for real.
- **Generator hints (optional):** `hints: [markdown]` (1–4 progressive steps that never state the final answer) and/or `parts[i].hint` on multi-part questions. The engine keeps non-empty strings ≤ 600 chars, max 4, dropping others with one console.warn per module. Never stored.
- **CSV hints** come from the `hints` column. **Fallback:** with no hints, the explanation is split into steps (blank-line blocks, list items, else lines; never inside code fences) and all but the last become hints. CSV modules use this fallback.
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
- On every question except those from modules with `"calculator": false` in `module.json`. Arithmetic, Fractions, Number Bases, Code Writing, Code Reviewing, Algorithms, Number Theory, SQL Queries, Intervals & Scales, Chords, Vocabulary, Word Roots, Grammar and the three Logic modules set this, because working it out yourself is the point (or there's nothing to calculate).
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
- **Storage:** the optional `mode` and `graph: { fns: [{ slot, expr, hidden }], view }` fields sit in the same `studyblock:calc` record. Older records still load.
- **Saved with answers (ticket 009):** when an answer is checked and the graph has a non-empty function (given ones count), the question stores `graph: { fns: [{slot, expr, hidden}], view }` next to `work`. Review and History show a collapsible "Your graph": a static `<sb-graph>` plot redrawn from the functions (`_a` uses the saved working), plus the function list. On import it's optional and validated: ≤ 6 functions, unique slots 1–6, each expression 1–200 chars, and a bad view falls back to the default.
- **Given graph functions:** a generator question may carry `graphFns: [{ expr, label? }]` (1–3, graph grammar) and an optional `graphView`. The engine validates them with calc's parser (invalid ones are dropped, one warning per module), and they are never stored in attempts. They fill the lowest free slots with a "given" tag, and are replaced on the next question unless edited. The question's view applies while it's shown. No module uses them yet.
- **Standalone page** `#/calc`: the same Sheet | Graph panel full-page, without Use, saved in localStorage `studyblock:calcPage` with Clear all. It's reached from the desktop nav and a Home card; the phone tab bar stays at 4 tabs.
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
  | Game Dev (retired; old attempts only) | `#FCE4EE` / `#9D1B52` | `#D02A6E` |
  | Music | `#FBF1D2` / `#765300` | `#B07D0A` |
  | Biology | `#DFF3E4` / `#1B5E2B` | `#2E8B47` |
  | Medical | `#DDF4F8` / `#0A5866` | `#0E8FA6` |
  | Logic | `#E4E8EE` / `#334155` | `#52637A` |
  | Everyday Math (retired; old attempts only) | `#F1E7DD` / `#5E4126` | `#8C6239` |
  | Engineering | `#ECE8FA` / `#4C2F8F` | `#6A4BC4` |

  A domain can override these with `color` in `index.json`.
- **Home domain cards:** the subject list is one line in a fresh random order per render (display only), a seamless marquee (two copies, the second `aria-hidden`, ~35 px/s, edge fades) only when it overflows; it pauses on hover and focus and stays still with an ellipsis under `prefers-reduced-motion`. Phones still hide it.
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
   - Module folders not listed in any domain (archived ones) are left out.
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

- **Domain merges (ticket 024):** Game Dev became Computing's *Game development* group and Everyday Math became Math's *Everyday maths* group. Module ids are unchanged, so old attempts still count.
- **Biology domain:** the fact-list `biology` module (title "Biology Basics") moved from Science into its own Biology domain; its id is unchanged, so old attempts still count.
- **Trimmed subjects (ticket 015):** Balancing & Progression, Pixels & Colour, Collision, Vital Signs and Health Statistics are archived. Cryptography Basics was merged into Number Theory (Ciphers, Keys & RSA, worked by hand), and Anatomy into Biology Basics (Skeleton, Organs and body systems).
- **Medical domain:** general facts and standard calculations only (Body Measurements, Nutrition). No medications or doses, symptoms, diagnosis, treatment or "is this normal?" questions. Every Medical `intro.md` opens with a "For learning only, not medical advice" note, BMI shows only numeric WHO adult ranges, and each question states its formula and factors.
- **Music Theory:** written notation, no staff images; sound only through the Play button after answering (below). Single spelled notes, intervals and chord names are choice questions (text checks can't equate `#` with ♯). Spelling a whole chord or scale is built from note blocks (from the root/tonic up, wrong spellings as distractors); multi-part questions keep choice parts. Double sharps/flats (𝄪/𝄫) appear only where theory needs them (Hard/Expert diminished and augmented triads, G♯ and D♯ harmonic minor); Easy, Medium and major keys stay single-accidental. Expert diatonic sevenths include viiø7 (m7♭5). 𝄪/𝄫 rely on the OS symbol font. `js/lib/music.js` has separate build and check toolkits so verify stays independent.
- **SQL Queries:** *ORDER BY and LIMIT* row-order questions are built from blocks (same seeds). *Write the query* is typed or built from blocks (`SELECT …`, aggregate and `IN (…)` slot tiles), with `accepts`, Run, and the Blocks multiplier.
- **Algorithms:** final stack or queue contents are built from blocks (same seeds). *Write the trace* is typed (`4, 9, 2`) with Blocks: binary-search comparisons, the list after a sort pass, stack/queue values.
- **Boolean Logic:** *Write the expression* is typed with Blocks (letters, AND/OR/XOR/NOT, a bracket slot). Any expression with the same truth table counts (`grade()`); operators may not be mixed at one bracket level without brackets.
- **Genetics:** *Write gametes & genotypes* is typed with Blocks, case-sensitive, in the order stated in the prompt (capital first, then alphabetical).
- **Word Roots and Grammar:** every cell has at least 10 rows. Word Roots has build-the-word rows (dual Type | Blocks and pure blocks, joiner `(none)`). Grammar has sentence-ordering rows (capitalised first block, punctuated last block, wrong-form distractors such as is/are) and dual verb-form rows in Tenses. Both set `tilesMultiplier`. Vocabulary also has 10 rows per cell.
- **Logic & Puzzles:** logic-puzzles (knights and knaves, ordering, whodunits), syllogisms (categorical and if-then) and number-patterns (numbers, letters, shapes). Every puzzle is brute-forced to a unique answer, and verify() re-solves it independently. Number-patterns' verify infers the rule from the shown terms, trying several rule families that must agree. Conventions: syllogisms assume every group has a member and use made-up nouns; "or" is inclusive; "A unless B" means "if not B then A"; letter wrap-around is stated. All are exact (`fuzzy: false`, `fuzzyNumber: 0`); number-patterns has `tilesMultiplier`.
- **Everyday maths** (a group in Math since ticket 024; was the Everyday Math domain): time-dates, recipes-scaling, shopping-money and travel. Conventions: fixed UTC offsets with no daylight saving; a generic `$`; made-up exchange rates, always stated; kitchen conversion factors stated in the question. `fuzzyNumber` is 1, and whole counts (days, minutes, servings, bags) set `fuzzyNumber: 0` per question.
- **Project Scheduling** (Business): critical-path, float (and crashing), gantt-dates, earned-value. Networks of 5–8 activities, whole-day durations, a unique critical path (redrawn otherwise); an activity starts when all predecessors finish, times count from day 0; free float = the smallest earliest start among its successors − its earliest finish (stated). Generation uses forward/backward passes and greedy crashing; verify enumerates paths and brute-forces crash plans (a question is redrawn unless greedy equals the minimum). Working days are Mon–Fri with the start date as day 1, plus stated holidays at Hard/Expert (`dates.js` helpers; day-precision date answers). Earned value: generic `$`, CV = EV − AC, SV = EV − PV, CPI = EV ÷ AC, SPI = EV ÷ PV, EAC = BAC ÷ CPI, VAC = BAC − EAC, ETC = EAC − AC, indices exact to 2 dp, sign rule stated. Money is formatted by hand: never `toLocaleString` in a generator (its first call loads Intl data and costs ~20 ms). Whole days are exact (`fuzzyNumber: 0`).
- **Engineering / Structures:** moments, stress-strain, beams, factor-of-safety. General textbook practice only, no design code. A light beam has no weight; a uniform beam's weight acts at its midpoint; a UDL acts as w × length at the middle of its length; shear = sum of vertical forces to the left of the section, upward positive. 1 N/mm² = 1 MPa, 1 GPa = 1000 MPa, 1 m² = 10⁶ mm², g stated as 10 or 9.81. Realistic sizes (spanners, doors, pad foundations). Counts and round up/down answers are exact (`fuzzyNumber: 0`); verify takes moments about a different point or uses inverse relations. No segmented choices.
- **Engineering, newer subjects (ticket 024):** general textbook practice, no design codes; counts and catalogue picks are exact (`fuzzyNumber: 0` per question), the rest use relative close credit. No segmented choices.
  - **Mechanisms:** gear ratio = driven teeth ÷ driver teeth (input speed ÷ output speed); g = 10 N/kg; machines ideal unless an efficiency is given; belts don't slip. Work and energy appear only inside efficiency checks (no overlap with Forces & Energy); levers are about MA, VR and efficiency, not beam moments (Structures).
  - **Fluids & Hydraulics** (`fluid-systems`): g = 9.81 N/kg and water 1000 kg/m³ stated where used; 1 bar = 100 000 Pa = 0.1 N/mm²; 1 m³ = 1000 L; pipes run full and speed is the average speed; friction ignored unless an efficiency is given; generic `$`. Catalogue pipe and bore picks verify as "this size passes and the next size down fails". Hydraulics Easy/Medium sits close to Gases & Pressure → *Pressure in context* (ticket 024).
  - **Electronics:** colour bands are read from the end away from the tolerance band; E12 picks are "next value at or above" for LED resistors and "closest" for dividers and delays; full charge is 5τ; the V(t) formula is given in Hard prompts. Ohm's law and series/parallel appear only as steps (no overlap with Electricity).
  - **Tolerances & Fits** (`tolerances`): sizes are computed in whole micrometres and answered in mm to 3 decimal places (the 10:1-rule uncertainty to 4); hole-basis fits with explicit limits, no ISO fit tables; a size exactly on a limit is in spec; reading uncertainty is half a division. `fuzzyNumber: 0` for the whole module, since 1 µm off is the skill being tested.
- **Business theory:** Marketing (4Ps, Ansoff, Boston, life cycle, pricing, segmentation), Business Theory (ownership, stakeholders, SMART, SWOT, PESTLE), Management (Maslow/Herzberg, leadership, structure, Porter), Accounting Theory (double entry, journal entries, concepts, classification, accounting equation; journal entries use the journal table, the rest block-list choices) and Finance Theory (sources, risk/return, ratios, appraisal) use block-list choices. Accounting conventions: goods bought go to Inventory, sales record revenue only, depreciation goes to Accumulated depreciation, and "Accruals (matching)" is one concept. Every rule a judgement depends on (Porter 10%/15%, Boston thresholds, life-cycle stage rules, the "achievable" rule) is stated in the prompt. Ownership forms are the general textbook versions, with no country-specific law.
- **Networking:** KB/MB = 1000, KiB/MiB = 1024, subnet zero allowed, /31 and /32 never generated.
- **Timelines:** *Ordering* is built from blocks (tiles A–D in prompt order); seeds give the same events and answers as the old choice version. A fixed, hand-checked event list inside the generator; only the *Famous dates (recall)* subtopic relies on memorised years, and arguable years (1347, 1517, 221 BC) are kept out of recall.
- **Rounding ties:** generators should never produce an answer that sits exactly on a rounding half-step. Newer generators redraw inside `generate()` (same rng, so still deterministic) until their own `verify` passes, rather than leaving it to the engine's retry.
- Open choices for these are in tickets 012–014.

## Adding a module

1. Create `modules/<id>/` with `module.json` and either `generator.js` (+ `verify`) or `questions.csv`.
2. Optionally add `intro.md`.
3. Append the id to the right domain's `modules` list in `modules/index.json` (add a new domain entry if needed).
