# StudyBlock

**Practice that never runs out of questions.**

StudyBlock is a small quiz app with 30 subjects across seven areas: Math, Science, Computing, Geography, History, Business and Language — from fractions and trigonometry to chemistry, binary, world capitals, loans and word roots. Most questions aren't drawn from a fixed list; they're generated on the spot. Each answer is computed when the question is made and double-checked by a separate method before you see it, so you can practise as long as you like without memorising one set.

Everything happens in your browser. There's no account and no server-side database, and none of your progress leaves your device unless you export it.

---

## What you can do

- **Pick a domain and drill down.** Start from a broad area (Math, Science, Computing, Geography, History, Business, Language), open a subdomain such as Algebra or Kinematics, then choose a subtopic and a difficulty.
- **Think through real cases.** Business Case questions give you a scenario and ask for several answers at once, such as the calculation and your recommendation.
- **Mix it up.** Build a quiz that pulls from several domains at once. You decide how often each one appears by giving it a weight; everything starts at 1.
- **Save your favourite mixes.** Keep mixes as presets, or start from the official ones that ship with the app. A mix you're still working on is kept until you save it or clear it.
- **Work it out on screen.** A built-in calculator starts with the question's numbers filled in, and lets you name values (`_price`, `_cost`) and build on them. Change an early step and everything after it updates live. Switch to **Graph** to plot functions and find where they cross zero or each other.
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
