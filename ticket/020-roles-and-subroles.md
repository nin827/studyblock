# 020 — Roles and Subroles (career mixes with Expert+)

**Status:** open (being built with the defaults below)
**Raised:** 2026-11-26

## Decided by the user
- The naming is **Roles** (general) and **Subroles** (specialised).
- **Expert+** has role-only questions: mixed-subject scenarios that exist nowhere else.
- Start with **Business Analyst**, **Software Engineer** and **Mathematician**.

## Defaults chosen
- **Structure:** a role is a hand-made weighted mix of subjects and topics. A subrole is a narrower mix under its role, and it shares the role's Expert+ generator with its own emphasis.
  - **Business Analyst:** Financial Analyst, Marketing Analyst.
  - **Software Engineer:** Backend Engineer, Fintech Engineer.
  - **Mathematician:** Statistician, Math Teacher.
- **Difficulty shift:**
  - Role Easy draws subject Medium, Medium draws Hard, and Hard draws Expert (or the closest level the subject has).
  - Role Expert is **Expert+**: only the role's own multi-subject questions.
  - The page shows the levels as Normal, Hard, Expert and Expert+.
- **Where it lives:**
  - `#/roles` lists the roles, `#/roles/<role>` is a role page listing its subroles, and `#/roles/<role>/<subrole>` is a subrole page.
  - Quizzes run at `#/rq/<id>/<level>`, with guided runs at `#/rg/…`.
  - The desktop nav gets a "Roles" link. On phones, Roles is a Home card, so the tab bar stays at 4 tabs.
- **Scores:** one attempt per run with `module: "role"`, `subtopic: <role or subrole id>`. Each question carries its own module, subtopic and difficulty, as in mixes. History shows the role name.
- **Registry:** `roles/index.json` lists the roles in order. `roles/<id>.json` holds `{ id, title, icon, description, mix, subroles: [{ id, title, description, mix }], exclusive: "<module id>" }`, and ids follow the usual rule. The role-only generator modules (`modules/role-*/`) set `"roleOnly": true`. They're never shown on domain pages or sampled by mixes, and they're the only modules with the `expert-plus` difficulty.
