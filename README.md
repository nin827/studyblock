# StudyBlock

**Practice that never runs out of questions.**

StudyBlock is a small quiz app with 77 subjects across 12 areas: Math, Science, Computing, Geography, History, Business, Language, Music Theory, Biology, Medical, Logic & Puzzles and Engineering — from fractions and calculus to forces, beams and stress, gears, hydraulics, resistor colour codes and tolerances, radioactivity, astronomy, binary, SQL, ciphers, code in five programming languages, map bearings, timelines, economics, project schedules, chords, genetics, loot drops and BMI, at up to four levels from Easy to Expert. Most questions aren't drawn from a fixed list; they're generated on the spot. Each answer is computed when the question is made and double-checked by a separate method before you see it, so you can practise as long as you like without memorising one set.

Everything happens in your browser. There's no account and no server-side database, and none of your progress leaves your device unless you export it.

---

## What you can do

- **Pick a domain and drill down.** Start from one of 12 broad areas (Math, Science, Computing, Business, Music, Biology, Engineering and more), or open the **Domains** tab to see every subject at once, sorted into sections. Open a subdomain such as Algebra or Kinematics, then choose a subtopic and a difficulty.
- **Practise for a role.** Roles such as Business Analyst, Software Engineer, Mathematician, Data Analyst, Physicist, Accountant, Chemist, Electrical Engineer, Biologist, Game Developer, Network Engineer, Music Theorist, Operations Manager, Teacher, Nutritionist, Economist, Historian, Geographer, Linguist, Civil Engineer, Architect, Project Manager, Electrician, Pilot, Data Scientist, Land Surveyor, Investigator, Chef, Retail Manager, Logistics Manager, Hotel Manager, Archaeologist and Sports Analyst mix the right subjects one level harder, and their Expert+ level has scenarios that combine several subjects.
- **Build answers from blocks.** Many questions let you drag or tap blocks instead of typing, from ordering events to building SQL queries.
- **Write real book entries.** Accounting journal entries go in a proper Account | Debit | Credit table: type into the cells or drop account and amount blocks onto them.
- **Think through real cases.** Business Case questions give you a scenario and ask for several answers at once, such as the calculation and your recommendation.
- **Read and write code.** Code Writing and Code Reviewing show short programs in Python, C#, C++, GDScript or Rust (your pick): fill the gaps, predict the output, find the bug and choose the fix.
- **Practise with a guide.** Switch any subject to **Guided** for hints, unlimited tries and a Show solution button. Guided sets are never scored.
- **Mix it up.** Build a quiz that pulls from several domains at once. You decide how often each one appears by giving it a weight; everything starts at 1.
- **Save your favourite mixes.** Keep mixes as presets, or start from the official ones that ship with the app. A mix you're still working on is kept until you save it or clear it.
- **Work it out on screen.** A built-in calculator starts with the question's numbers filled in, and lets you name values (`_price`, `_cost`) and build on them. Change an early step and everything after it updates live. Switch to **Graph** to plot functions and find where they cross zero or each other.
- **Keep it going.** Earn XP and levels, build a daily streak and collect badges. It's all worked out from your history, and you can switch it off in Settings.
- **Learn from mistakes.** Every question comes with a worked explanation, and your history keeps every question, answer and your working for review.
- **Keep your progress safe.** Progress is saved automatically in the browser. You can also export it to a file, or sync it to a folder on your computer.
- **Use it anywhere.** It's laid out for phones as well as desktops, can be installed as an app, and works offline.

## Make it yours

- Choose an accent colour from 24 hues or neutral grey; the default is purple.
- Light, dark or follow-your-system theme.
- Add your own subjects. A topic can be a small generator script or just a spreadsheet-style CSV of questions.

## Getting started

Pick whichever suits you. Each option is explained step by step in the guide.

| I want to… | Do this |
|---|---|
| Use it as an app on my phone or computer | Open **[nin827.github.io/studyblock](https://nin827.github.io/studyblock/)**, then choose **Install StudyBlock** |
| Open it from a file, with no setup | Double-click `dist/studyblock.html` (build it once with `py tools/bundle.py`) |
| Run it from this folder | Double-click **`launcher_win.bat`** (Windows) or **`launcher_mac.command`** (Mac), or run **`./launcher_linux.sh`** (Linux). Close the window to stop. |

## Guide

📘 **[INSTRUCTION.md](INSTRUCTION.md)** — the full user guide: installing and running, taking quizzes, building mixes and presets, keeping your data safe, adding your own subjects, and troubleshooting.

## Under the hood

Plain HTML, CSS and JavaScript, with no build step, no frameworks and no third-party assets except [Lucide](https://lucide.dev) icons. Built with Claude, under human supervision. For personal or non-serious uses, keep expectations low.
