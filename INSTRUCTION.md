# StudyBlock — User Guide

This guide covers everything from opening StudyBlock for the first time to adding your own subjects. For a short introduction, see the [README](README.md).

**Contents**

1. [Ways to run StudyBlock](#1-ways-to-run-studyblock)
2. [Finding your way around](#2-finding-your-way-around)
3. [Taking a quiz](#3-taking-a-quiz)
4. [Mixed quizzes](#4-mixed-quizzes)
5. [Presets](#5-presets)
6. [Your progress and data](#6-your-progress-and-data)
7. [Appearance](#7-appearance)
8. [Adding your own subjects](#8-adding-your-own-subjects)
9. [Writing official presets](#9-writing-official-presets)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Ways to run StudyBlock

### A. Install it as an app (recommended)

StudyBlock is live at **https://nin827.github.io/studyblock/**. Open it and install it from there; nothing to set up. To host your own copy, publish it once as below.

**Publish it once**
1. Push the repository to GitHub.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**. Select `main` and the **/ (root)** folder, then press **Save**.
4. About a minute later the site is live at `https://<your-user>.github.io/<repo>/`.

**Install it**
- **Chrome, Edge (desktop or Android):** open the site and choose **Settings → Install StudyBlock**, or use the install icon in the address bar.
- **iPhone and iPad (Safari):** tap **Share**, then **Add to Home Screen**.

Once installed, it opens in its own window and works offline. When you publish a new version, a small **Update available · Reload** message appears. It never interrupts a quiz in progress.

### B. Open it as a single file (no setup)

Run this once to build the file:

```
py tools/bundle.py
```

That creates `dist/studyblock.html`. Double-click it, or copy it to a USB stick or a shared drive. Everything the app needs is inside that one file.

Things to know about the single file:
- It works fully offline, icons included.
- Browsers can clear storage for local files more easily, so StudyBlock will ask you to **connect a data folder** (see [section 6](#6-your-progress-and-data)).
- Rebuild the file after adding or changing subjects or presets.

### C. Use the local launcher

This runs the project folder directly, which is handy if you edit subjects or presets.

Pick the launcher for your system. All three are in the main project folder.

| Your computer | Launch this file | How |
|---|---|---|
| **Windows** | **`launcher_win.bat`** | Double-click it |
| **macOS** | **`launcher_mac.command`** | Double-click it. The first time, macOS may block it: right-click → **Open** → **Open**. |
| **Linux** | **`launcher_linux.sh`** | Run `./launcher_linux.sh` in a terminal |

A small window opens and your browser goes to StudyBlock at `http://127.0.0.1:8000`. The server:
- only accepts connections from this computer
- always serves your latest files
- if StudyBlock is already running, just opens it again instead of starting a second copy

**To stop it, close the window,** or press Ctrl+C. Nothing keeps running in the background.

The launcher needs Python 3, which it uses as a tiny web server. If Python isn't installed, the window tells you so; use option B instead.

To run the server by hand, use `py tools/serve.py`. It takes these options:
- `--port 8123` to use a different port (your data there is separate)
- `--no-browser` to skip opening a tab

If you double-click `index.html` itself, you'll only see a notice, because browsers won't run the app's code straight from the project folder. Use the launcher or option B.

**Install it as an app from the launcher, with no GitHub needed**
1. Start the launcher. In Chrome or Edge, open **Settings → Install StudyBlock**, or click the install icon at the right of the address bar.
2. StudyBlock now has its own window and Start-menu entry, and it works **offline even after you close the launcher**, because the app keeps a copy of itself.
3. Start the launcher again whenever you want the app to pick up changes you made to subjects or presets.

> **Keep the same address.** Your progress, settings and installed app belong to one exact address, port number included (`http://127.0.0.1:8000`). If port 8000 is taken by another program, the launcher uses a different port and warns you. Everything will look empty there, because it's a separate address. Free port 8000 and relaunch to get your usual StudyBlock back.

You can't install from `index.html` opened directly (a `file:///…` address), or from the single file. Browsers only allow installing from `http://localhost`, `http://127.0.0.1` or an `https://` site.

---

## 2. Finding your way around

| Page | What's there |
|---|---|
| **Home** | Domain cards with your progress, a "Continue" shortcut, and the mixed quiz with quick-start presets |
| **Domain** | The subdomains in that domain (for example, Math → Arithmetic, Algebra, Fractions…) |
| **Module** | An introduction to the topic, then a grid of subtopic × difficulty with your best score in each. Each subject offers the levels that suit it: Easy, Medium and Hard, and **Expert** (marked with a flame) for subjects with room for multi-step problems. |
| **Mix** | The mixed-quiz builder and your presets |
| **History** | Every quiz you've taken, with full question-by-question review |
| **Settings** | Theme, accent colour, installing, data folder, export, import, clearing data |

On phones the menu sits at the bottom of the screen.

---

## 3. Taking a quiz

1. From a module page, choose a subtopic and difficulty and press **Start**. To practise a whole subject, use the **All topics** row or the **All** column: questions come from every topic and/or difficulty (10 per quiz for the hand-written subjects), and History labels them "All topics" / "All difficulties".
2. Answer each question:
   - **Number answers:** type the number. On phones the number keypad opens. If the question says "round to 2 decimal places", answers within ±0.005 count as correct. You can type `-` or `−` for negatives.
   - **Text answers:** capital letters and extra spaces don't matter, including spaces around `:` and `,` (so `2,4` matches `2, 4`). A typed `−` counts the same as `-`.
   - **Multiple choice:** tap an option, or press keys **1–9**.
   - **Blocks:** build the answer by tapping blocks in turn, or dragging them into the "Your answer" row. Tap a placed block (or drag it back) to remove it, drag to reorder, and use **Reset** to start again. On a keyboard, Enter places a block and Alt+←/→ moves it. When there are many blocks, type in **Filter blocks** to find one. Timelines → Ordering uses blocks.
   - **Blocks inside blocks:** some blocks have brackets, like `COUNT(…)`. Tap one you've placed to give it an outline, and blocks you then tap go inside it. You can also drag blocks into it. Press Esc to go back to the main row.
   - **Type or Blocks:** some questions (SQL Write the query, and the new Code Writing and Code Reviewing topics) let you choose **Type** or **Blocks**. Typing earns full credit. Blocks earn up to 85% at Hard and 70% at Expert, because the blocks give you the pieces.
   - **Run:** in SQL *Write the query*, **Run** (or Ctrl/Cmd+Enter) runs your query on the table and shows the result or an error. Running is free and never scored.
   - **Close answers:** a small typo or a slightly-off number earns part credit, shown as "Close · 85% credit". By default, one typo in a word of 4+ letters earns 75–90%, and two typos earn nothing. A number within 0.1%, 1% or 2% earns 90%, 75% or 50%. History years earn 50% when 1 year out. Each subject sets how lenient it is: codes, symbols, spelling subjects, code and SQL must be exact.
   - **Typed answers with blocks:** SQL *Write the query*, Code *Write the line* and *Rewrite the buggy line*, Boolean Logic *Write the expression*, Algorithms *Write the trace* and Genetics *Write gametes & genotypes*. Equivalent SQL queries and Boolean expressions count when they give the same output or truth table. Hard-coded SQL values don't count. In Genetics, capitals matter.
   - **Guided practice** is saved in History with a Guided tag, but never counts toward scores. **Show solution** unlocks after your first try or once you've seen every hint. The Mix builder also has a Guided mode.
   - **Calculator page:** open **Calculator** from the top bar (or the Home card on phones) for the same Sheet and Graph outside quizzes. It's saved in this browser. Graphs you draw during a quiz are saved with your answer and show as "Your graph" in the review and History.
   - **Block-list answers (Build or Choose):** some questions, like the Business theory ones, combine several facts, e.g. `Assets ↑ | Liabilities – | Equity ↑`. In **Build** (the default) you place one block per column from the bank; order doesn't matter. In **Choose** you pick a listed option, which earns up to 85% at Hard and 70% at Expert.
   - **Case-sensitive questions** (Genetics) show a warning: capital letters matter.
   - **Code Reviewing → Language features** (Medium to Expert) asks questions that only make sense in your chosen language: Python `//` and aliasing, C# structs and overflow, C++ references and undefined behaviour, GDScript references and typing, and Rust ownership and borrowing. Switching language gives you that language's questions.
   - **Roles:** open **Roles** (top bar, or the Home card) for career-style practice: Business Analyst, Software Engineer, Mathematician, Data Analyst, Physicist, Accountant, Chemist, Electrical Engineer, Biologist, Game Developer, Network Engineer, Music Theorist, Operations Manager, Teacher, Nutritionist, Economist, Historian, Geographer, Linguist, Civil Engineer, Architect, Project Manager, Electrician, Pilot, Data Scientist, Land Surveyor, Investigator, Chef and Retail Manager, each with specialised subroles (Financial or Marketing Analyst, Backend or Fintech Engineer, Statistician or Actuary, BI or Research Analyst, Astrophysicist or Nuclear Physicist, Auditor or Management Accountant, Analytical or Industrial Chemist, Embedded or Power Engineer, Geneticist or Ecologist, Gameplay Programmer or Game Designer, Network Admin or Security Analyst, Composer or Arranger, Logistics Coordinator or Production Planner, Examiner or Tutor, Food Label Analyst or Sports Nutrition Analyst, Macroeconomist or Market Analyst, Archivist or Museum Curator, Cartographer or Climate Analyst, Editor or Translator, Structural or Site Engineer, Building Designer or Landscape Architect, Scheduler or Cost Controller, Installation or Maintenance Electrician, Flight Planner or Navigator, ML Engineer or Experiment Analyst, Boundary or Levelling Surveyor, Case Analyst or Fraud Examiner, Head Chef or Kitchen Manager, Store Manager or Merchandiser). Levels run one step harder than usual: **Easy** asks subject questions at Medium, **Medium** at Hard and **Hard** at Expert; the last 20% of questions (rounded up) are multi-part role scenarios mixing several subjects. **Expert** is scenarios only, the hardest kind (tagged Expert+). A scenario is worth one point per part, shown as "×3", so scores can read like 13.5 / 16. Set the number of questions on the role page (5–50; default 10, or 5 at Expert). Role results show under Roles in History and also count toward each subject. A role page's **About this role** card explains its scenarios; role pages also show small tags about the real job (for example Experience-led, Safety-critical, License-oriented, Tool-driven, Tool-specific), and the card opens with a box explaining each one: for example, an experience-led role depends mostly on experience and judgement, and these questions practise only the theory and knowledge part. The questions are practice, not professional advice. Some roles (such as Nutritionist, Electrician and Pilot) show a short notice before a run starts: read it and press **I understand · Start** (asked once per role each browser session), or **Back to role**. Notes, tips and warnings in subject introductions appear as boxes with an icon and a label.
   - **Dates:** type a year (`1969`, `44 BC`), a month and year (`July 1969`, `7/1969`) or a full date (`20 July 1969`, `20/7/1969`, `July 20, 1969`). Numbers are read day first, and a "Read as" line shows how the app understood you. One month or one day out earns half credit. There is no year 0, so 1 BC to AD 1 is one year.
   - **Fractions:** type them exactly as the question shows, in simplest form: `3/4`, `-7/4`, or a mixed number like `2 1/3`. `6/8` counts as wrong when the answer is `3/4`.
   - **Ratios:** type them like `3:4`.
   - **Percentages:** type the number without the `%` sign, with a minus for a decrease.
   - **Scientific sizes:** some answers ask for a number "× 10²³" or "× 10⁸ m/s"; type just the number in front.
   - **Lenses (Waves):** every question states the sign convention; virtual images give negative answers, so include the minus sign.
   - Angles are always in **degrees**. Every question says how to round.
3. Press **Check** (or **Enter**). You'll see whether you were right and how the answer is worked out.
4. Press **Next** (or **Enter** again).
5. At the end you get your score and a full review. **Retry** gives you a fresh set of questions on the same topic.

Every question has a hidden seed, so StudyBlock can rebuild exactly the same question later for review.

### Guided mode

On a subject's page, switch **Practice | Guided** to **Guided** to practise step by step. It works for every topic and difficulty, including **All**.
- **Hint** (or the **H** key) reveals the next step, and each part of a multi-part question can have its own hint. Hints use the question's own numbers and stop one step before the answer. A **How to solve** card above the question gives the method for that topic.
- **Try as often as you like.** A wrong choice is crossed out, and parts you've got right lock in place.
- **Show solution** reveals the answer and the full working.
- **Nothing is scored or saved.** The end screen counts what you solved first try, solved with help, or looked up. **Practice for real** starts a normal quiz on the same topic.

### Code subjects

**Code Writing** and **Code Reviewing** (in Computing) show short programs in the language you choose: **Python, C#, C++, GDScript or Rust**. Pick it on the subject page (**Language**) or in **Settings → Code language**. Both change the same setting, which applies to your next quiz. Each question shows its language as a tag, and answered questions keep the language they were asked in.
- **Code Writing:** each program has a gap `___`. Type the number that fills it, or pick the expression, condition or line that makes the program do what's asked. Some hard questions also ask what the finished program prints. When a question asks for the *smallest* number, give the lowest that works (0 or more).
- **Code Reviewing:** predict what a program prints, find the line with the bug, choose the line that fixes it, or name the kind of bug. Line numbers sit at the left, and brace-only lines count, so the same bug can be on a different line in C# than in Python. Hard questions have several parts.
- You never type whole programs. There's no calculator in these subjects.

### Subject notes

- **Calculus Basics:** derivatives, integrals and tangent lines are multiple choice, written like `6x² − 4x + 1`, `x⁻²` and `x^(1/2)`, with `+ C` on indefinite integrals. Hard answers are rounded to 2 decimal places; an area counts every part as positive.
- **Exponents & Logarithms:** exact answers are a whole number or a simplest fraction like `3/2` (improper, never mixed). In the calculator `log` is base 10 and `ln` is base e; for another base use `log(x) / log(b)`.
- **Number Theory:** whole numbers, words or choices, no calculator. **Ciphers**: Caesar shifts go forward and wrap from Z to A, Vigenère uses A = 0, and you type words like `APPLE`. **Keys & RSA**: counting keys, inverses mod 26 and toy RSA with small primes, all by hand. `p^k` means p to the power k; *a mod n* is the remainder from 0 to n − 1; a 12-hour clock shows 1–12 and a 24-hour clock 0–23.
- **Coordinate Geometry:** type gradients and intercepts as a whole number or a simplest fraction like `-3/4`. Points, surds like `3√5` and line equations are picked from a list.
- **Probability:** probabilities are fractions in simplest form, like `3/8`. Counting answers are whole numbers; expected values are rounded to 2 decimal places (a loss is negative).
- **Forces & Energy:** SI units throughout. Medium and hard questions may state values in g, km/h, minutes, kJ, km, kN or ms, so convert first; a calculator label like `_m_g` or `_t_min` shows the unit of the given value. Head-on collision velocities can be negative.
- **Thermal Physics, Gases & Pressure:** every constant is given in the question. Convert to kg, J, m², Pa and s first; gas-law temperatures go in kelvin (K = °C + 273).
- **Radioactivity:** nuclides are written mass number on top, atomic number below (²³⁸₉₂U) and picked from a list. Subtract the background count before halving.
- **Astronomy:** every constant and planet value is given. Very large answers ask for A × 10ⁿ: type just A. Orbits use T² = a³ with T in years and a in AU.
- **Data Representation:** each size question says whether KB means 1000 or KiB 1024; files are uncompressed. Run-length encoding is count then character, like `3W2B1W`.
- **SQL Queries:** work out by hand what the query returns from the small table shown. No calculator.
- **Algorithms:** lists are written like `[4, 9, 2, 7]`, with indexes starting at 0. Whole lists are picked from options; counts, values and indexes are whole numbers. Each question states the exact version of the algorithm it uses.
- **Networking:** type addresses in dotted decimal with no leading zeros, like `192.168.1.0`. A binary octet needs all 8 bits (`00101101`); a prefix length is just the number (`26` for /26). Each data question says whether its prefixes mean 1000 (MB, Mbps) or 1024 (MiB, GiB); link speeds always use 1000.
- **Structures (Engineering):** answers are numbers in the units each question names (N, kN, N·m, MPa, mm). Every formula and unit conversion is in the introduction, and the calculator starts with each question's numbers filled in. Expert questions have several parts: both support reactions plus the shear at a point, a rod sized for stress and stretch, or a bar chosen from a stock list.
- **Project Scheduling:** type dates like `20 July 2027`, and money as plain numbers with no `$` or commas (a minus sign for a negative variance). Each question states its conventions, such as Monday-to-Friday work with the start date as day 1, and "a positive SV means ahead of schedule".
- **Economics:** every formula is stated; price elasticity is given as a positive number. Countries are fictional.
- **Map Skills:** grid references are digits with no spaces, easting first (`343176`). Bearings can be `045` or `45`. Times are 24-hour `HH:MM` with two digits each (`07:05`); time zones use the fixed UTC offsets given, with no daylight saving.
- **Timelines:** there is no year 0, so 44 BC to AD 79 is 122 years. Centuries are a number (`15` for the 15th century) and decades their first year (`1960`). Only *Famous dates (recall)* needs memorised years; every other topic gives them.
- **Game Dev:** vectors and positions ask for x and y in separate boxes. Angles are degrees from +x, counter-clockwise (0 to under 360); turns run from −180 to 180, left positive. Questions use y up unless they say screen coordinates (y down). Game Probability percentages are typed without `%`, to 2 decimal places.
- **Music Theory:** written notation. After you check an answer on a note, interval, chord or scale question, a **Play** button sounds it, so you can hear what you just worked out (also in the end-of-quiz review; never before you answer). The sounds are made in your browser and work offline; turn them off in Settings → Sound. Notes, intervals, keys and chord names are multiple choice, and whole chords and scales are spelled with note blocks, so you never type ♯ or ♭; counts are whole numbers. Rhythm treats a quarter note as one beat unless told otherwise (in 6/8, a dotted quarter).
- **Biology:** Genetics, Cells & Microscopy and Ecology build fresh crosses, micrographs and field data every time. Genotypes and ratios are picked from a list, in the order the question names; probabilities are typed as a percentage or a simplest-form fraction, as asked. Sizes use µm and nm; a magnification is a plain number (`400` for ×400).
- **Medical:** every question states its formula and conversion factors, so nothing needs memorising. These subjects are for learning only and are **not medical advice**: they stick to general facts and standard calculations, with no medication, diagnosis or treatment.

### Expert questions

Expert is offered in subjects with room above Hard: most of Math, Science, Computing, Business, Game Dev and Music Theory, plus Genetics and Ecology. Fact lists and simple skills (for example Capitals, Vocabulary, Elements, Unit Conversion) stop at Hard. Expert questions aren't bigger numbers. They combine two or more ideas, work backwards from a result, test edge cases, or ask you to set up a realistic problem yourself. Most have 2–4 parts.
- **Rounding:** each part says how to round. Keep unrounded values in calculator rows between parts, and don't retype a rounded earlier answer.
- **Round up / round down:** some parts ask for a whole number rounded up or down (strokes of a jack, snowshoe area, animals a reserve can support). Type that exact whole number.
- **Other formats:** a "1 in X" risk is typed as just X. "Type 0 if …" means 0 is a valid answer. Binary fractions are written like `110.101`, with no trailing zeros. A hex IPv4 address is 8 digits with leading zeros (`0A000001`), and each UTF-8 byte is 2 hex digits (`C3`).
- **Code subjects:** you trace longer programs, work a blank out backwards from the output, and hunt for two bugs at once. In Expert *Fix the bug*, the right fix must pass all three examples.
- **Number Theory:** Expert stays by hand, without a calculator. It includes cracking an affine cipher and breaking a toy RSA key.

### Questions with several answers

Some questions, such as Business Case and every Expert level, ask for more than one thing about the same scenario, for example a **Calculation** (the NPV) and a **Recommendation** (invest or not). Each part has its own numbered box:

- Fill in every part, then press **Check**. Tapping a choice in a part only selects it; it doesn't submit.
- **Enter** jumps to the next empty part, and checks the answer once every part is filled.
- The calculator's **Use** fills whichever part you were last in.
- You get **partial credit**: 2 of 3 parts right scores 0.67 of a question and shows as **Partly correct**, so quiz scores like `6.5 / 8` are possible. The feedback, the review and History show a ✓ or ✗ for each part, with the right answer for any you missed.

### The calculator

Every subject has a calculator during quizzes, except those where working it out by hand is the point: Arithmetic, Fractions, Number Bases, Code Writing, Code Reviewing, Algorithms, Number Theory, SQL Queries, Intervals & Scales, Chords and the three Language subjects. On a computer it sits beside the question. On a phone, tap **Calculator** in the bar at the bottom.

It works like a tiny spreadsheet. Each row has a **name**, a **calculation** and a live **result**:

```
_price     = 4.50
_cost      = 1.20
_margin    = _price - _cost          → 3.3
_breakeven = ceil(3300 / _margin)    → 1000
```

- **Names start with an underscore**, like `_price`. StudyBlock suggests `_a`, `_b`, `_c`…, and you can type any name; the `_` is added for you. Names without an underscore are built-ins, so `e` is always Euler's number (2.718…) and `_e` is your own value.
- **Use a stored value** by typing its name in another row.
- **Change an earlier row and everything that depends on it updates instantly.** You can rework a whole chain by editing its first step.
- **Rename a row** and every calculation that uses it is updated too.
- **Use** copies a row's result into the answer box (on a multi-part question, the part you were last in). It's off for multiple-choice answers.
- **Keys:**
  - **Enter** adds a new row, and never submits your answer by accident.
  - **Ctrl+K** (⌘K on a Mac) jumps to the calculator.
  - **Esc** jumps back to the answer.

**What you can type**

| | |
|---|---|
| Operators | `+ - * / ^` and brackets. `×`, `÷` and `−` work too. `%` is the remainder (`10 % 3` = 1). |
| Constants | `pi`, `e` |
| Functions | `sqrt`, `abs`, `round(x, digits)`, `floor`, `ceil`, `min`, `max`, `log` (base 10), `ln`, `exp`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`. Angles are in **degrees**. |

If something's wrong, that row shows why, for example "unknown value: _x" or "circular reference: _a → _b → _a". The other rows keep working.

**Given values.** Many questions fill in their starting numbers for you, as rows marked *given*, named like the rows in the worked explanation (for example `_price = 4.5`). They're replaced when the next question appears, unless you've edited them; an edited given row becomes one of your own rows and stays.

Your rows stay for the whole quiz, so values from one question can be reused in the next, and they survive a page reload. A new quiz starts with a clean sheet. When you check an answer, your rows are saved with it and shown as **Your working** in the review and in History.

**Graphing.** Switch the calculator from **Sheet** to **Graph** to plot up to six functions of x, `y1` to `y6`.
- **Typing a function:** for example `x^2 - 4` or `2*x + 1`. Write `2*x`, not `2x`. Trig is in degrees, so try a window from -360 to 360 for `sin(x)`.
- **Sheet values:** you can use them, as in `_a*x`. The curve follows the sheet as you edit it, and renaming a row updates the functions too.
- **Moving around:** drag to move, and scroll or pinch to zoom, or use the buttons. **Fit y** fits the curves on screen, and **Window** sets exact ranges.
- **Keys:** with the graph focused, the arrow keys move the view, **+** and **−** zoom, and **0** resets it.
- **Reading values:** tap a curve to read its value, then use Shift + ←/→ to step along it.
- **Points:** lists a function's zeros, lowest and highest points, and where it crosses the other curves, within the current view. **Add x** and **Add y** copy a value into the sheet, ready for **Use**.
- The graph is kept if you reload, and cleared when a new quiz starts. It isn't saved with your answers.

---

## 4. Mixed quizzes

Open **Mix** to build a quiz across several domains.

1. **Tick the domains** you want. Within each one, tick or untick its subdomains.
2. **Set weights.** Each domain and subdomain has a weight, starting at **1**. A weight of 2 appears about twice as often as a weight of 1, and **0** leaves it out.
3. Watch the **share bar** and the percentages update as you change things.
4. Choose a **difficulty** (Any, Easy, Medium, Hard or Expert; a subject without Expert uses Hard) and the **number of questions** (5–50).
5. Press **Start**.

How a question is picked: first a domain (by domain weight), then a subdomain inside it (by subdomain weight), then a random subtopic. If a subtopic doesn't have the difficulty you chose, the closest one is used.

Results from mixed quizzes also count toward each subject's own statistics.

---

## 5. Presets

### Your current mix (the draft)
Whatever you set up in the builder is saved automatically as your **draft**. It stays, even after closing the browser, until you save it as a preset or press **Clear draft**, which resets everything to weight 1.

### Your presets
- **Save as new:** give the current mix a name of up to 40 characters. Each name must be unique.
- **Update:** after changing a mix you loaded from one of your presets, save the changes back into it. The status badge shows **Unsaved changes** until you do.
- **Load, Rename, Delete:** from the preset chips. Deleting asks you to confirm first.

### Official presets
Presets marked with a ✓ badge come with the app. You can load them and start from them, but not change them. To keep a changed version, use **Save as new**.

Presets also appear on Home as one-tap quick starts.

---

## 6. Your progress and data

### Where your progress is kept
- **In the browser:** saved automatically after every quiz.
- **In a data folder (optional):** in Chrome, Edge and other Chromium browsers, StudyBlock can also keep a copy in a folder you choose.
- **In an export file:** a backup you make yourself.

StudyBlock also asks the browser to keep its storage permanently, so it isn't cleared to save space.

### Data folder
1. Go to **Settings → Data folder → Connect data folder** and pick a folder. A backed-up or cloud-synced folder works well.
2. StudyBlock creates `studyblock-data.json` there and updates it about a second after every change.
3. The folder is remembered. On later visits it syncs automatically. If the browser asks for permission again, **your first click anywhere on the page** re-grants it. Choose **Allow on every visit** when Chrome offers it, and you won't be asked again.
4. When you connect or reconnect, the file and your browser's progress are merged, with no duplicates.

StudyBlock only ever touches `studyblock-data.json` in that folder; it never reads, lists or deletes anything else. Firefox and Safari don't support data folders; use export and import there.

### Export and import
- **Export** downloads `studyblock-progress-YYYY-MM-DD.json`, containing your history, your presets and your current mix.
- **Import** reads such a file. Choose:
  - **Merge** to add it to what you have; duplicates are skipped.
  - **Replace** to swap everything for the file's contents.

  Official presets are never imported or exported; they come from the app.

### Retired subjects
A few subjects have been retired or merged into others: Cryptography Basics is now part of Number Theory, and Anatomy part of Biology Basics. Your past attempts on retired subjects stay in History, grouped under **Archived**.

### Clearing data
**Settings → Clear all data** deletes your quiz history, after you confirm. Export first if you might want it back.

---

## 7. Appearance

- **Theme:** System, Light or Dark.
- **Accent colour:** 24 hues around the colour wheel, plus grey. The default is purple. Every option is tuned so that text on buttons stays readable.
- Each domain keeps its own colour (Math, Science, Geography, Business), whichever accent you pick.

---

## 8. Adding your own subjects

Subjects live in `modules/`, one folder each, and are grouped into domains in `modules/index.json`.

### Step 1: create the folder
`modules/<id>/`, where `<id>` uses lowercase letters, digits and dashes, for example `fractions`.

### Step 2: describe it in `module.json`
```json
{
  "id": "fractions",
  "title": "Fractions",
  "description": "Add, simplify and compare fractions.",
  "icon": "percent",
  "type": "generator",
  "questionsPerQuiz": 10,
  "subtopics": [
    { "id": "simplify", "title": "Simplify", "difficulties": ["easy", "medium", "hard", "expert"] }
  ]
}
```
`icon` is any [Lucide](https://lucide.dev/icons) icon name. `type` is `"generator"` or `"csv"`. Add `"calculator": false` to hide the quiz calculator for this subject, as Arithmetic does.

### Step 3a: a generator (`generator.js`)
Questions are made by code, so they never run out.
```js
export function generate({ subtopic, difficulty, rng }) {
  const a = rng.int(2, 9), b = rng.int(2, 9);
  return {
    prompt: `What is \`${a} × ${b}\`?`,
    answer: a * b,
    answerType: 'number',
    explanation: `${a} × ${b} = ${a * b}`,
    params: { a, b }
  };
}

// Check the answer a different way.
export function verify(question, answer) {
  const { a, b } = question.params;
  return answer / b === a;
}
```
- Use only the `rng` you're given (`int`, `pick`, `shuffle`, `next`), never `Math.random`. That way every question can be rebuilt from its seed.
- `verify` should check the answer by an independent route, such as working backwards. Questions that fail it are thrown away and remade.
- For multiple choice, set `answerType: 'choice'` and `choices: [...]`; the answer must be one of the choices.
- For rounded answers, add `tolerance: 0.005`.

### Step 3b: or a question list (`questions.csv`)
```csv
subtopic,difficulty,prompt,answer,choices,explanation
simplify,easy,Simplify 2/4,1/2,,Divide both by 2.
simplify,medium,Which equals 3/9?,1/3,1/3|1/6|3/1|2/3,Divide both by 3.
```
- `choices` are separated by `|`. Leave it empty for a typed answer.
- Leave `difficulty` empty to use the row at every difficulty.
- Put fields containing commas inside double quotes.

### Step 4: optional introduction (`intro.md`)
Plain Markdown shown on the module page: headings, lists, tables, `code`, links.

Optionally add `guide.md` for Guided mode: a `## General` section, then one `## <Subtopic title>` section per subtopic, using the exact titles from `module.json`. Generators can also return `hints: ["…", "…"]` (1–4 steps that never give the final answer). Without hints, Guided mode reveals the worked explanation step by step.

### Step 5: add it to a domain
In `modules/index.json`, add the id to a domain's `modules` list, or add a new domain:
```json
{ "id": "math", "title": "Math", "icon": "sigma", "description": "…", "modules": ["arithmetic", "algebra", "fractions"] }
```

Reload the app to see it. Rebuild the single file (`py tools/bundle.py`) if you use one.

---

## 9. Writing official presets

Official presets live in `presets/`.

1. Create `presets/<id>.json`:
   ```json
   {
     "id": "exam-week",
     "name": "Exam week",
     "description": "Heavy on algebra, a little of everything else.",
     "config": {
       "domains": {
         "math": { "weight": 3, "modules": { "algebra": 2, "arithmetic": 1 } },
         "science": { "weight": 1 },
         "geography": { "weight": 1 }
       },
       "difficulty": "medium",
       "count": 20
     }
   }
   ```
2. Add `"exam-week"` to the list in `presets/index.json`.

Rules:
- A domain you leave out isn't included.
- A domain without `modules` includes all of its subdomains, each at weight 1.
- `difficulty` is `any`, `easy`, `medium`, `hard` or `expert`; `count` is 5–50 (older values below 5 are raised to 5).
- Unknown domain or module ids are skipped, with a warning in the browser console.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| Blank page, or a "needs a server" notice, when opening `index.html` | Double-click the launcher for your system (`launcher_win.bat`, `launcher_mac.command` or `launcher_linux.sh`), or use the single file (`dist/studyblock.html`) or the installed app; see [section 1](#1-ways-to-run-studyblock) |
| The launcher window flashes and closes | Run it from a terminal to read the message. Usually Python isn't installed; get it from python.org, or use the single file. |
| No icons | Reload the page. If you're using the single file, rebuild it with `py tools/bundle.py`. Everything still works without icons. |
| "Click anywhere to resume syncing" | Your browser needs permission for the data folder again. Click once, and choose **Allow on every visit** if offered. |
| Data folder option missing | Your browser doesn't support it (Firefox, Safari). Use Export/Import. |
| A new subject or preset doesn't show up | Check that its id is listed in `modules/index.json` or `presets/index.json`. Reload twice if the app is installed, since the first reload fetches the update. Rebuild the single file if you use one. |
| Progress disappeared | Re-import your last export, or reconnect your data folder; both are merged back in. |
| Install button doesn't appear | It only appears over `https://` or localhost in supporting browsers, and is hidden once installed. On iPhone use **Share → Add to Home Screen**. |
