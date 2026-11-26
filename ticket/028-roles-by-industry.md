# 028 — Group roles by industry

**Status:** built (2026-11-27) with the user's simpler names
**Raised:** 2026-11-27

## Request
The Roles page is "all over the place". Group it as **Industry → Role → Subrole**.

## Built (user, 2026-11-27: simpler names)
- **Technology:** Software Engineer, Data Analyst, Data Scientist, Network Engineer, Game Developer
- **Business:** Accountant, Business Analyst, Economist, Project Manager
- **Science:** Mathematician, Physicist, Chemist, Biologist
- **Engineering:** Civil Engineer, Electrical Engineer, Electrician, Architect, Land Surveyor
- **Operations & Service:** Operations Manager, Retail Manager, Chef, Nutritionist, Pilot, Investigator
- **Humanities:** Teacher, Historian, Geographer, Linguist, Music Theorist
- No "Miscellaneous" was needed: every role fits one. A role left out of every industry would show under "Other".
- *Not done yet:* the industry in the role page's breadcrumb.

## First proposal (superseded)

| Industry | Roles |
|---|---|
| **Technology & Data** (`cpu`) | Software Engineer, Data Analyst, Data Scientist, Network Engineer, Game Developer |
| **Business & Finance** (`landmark`) | Accountant, Business Analyst, Economist, Project Manager |
| **Science & Research** (`flask-conical`) | Mathematician, Physicist, Chemist, Biologist |
| **Engineering & Construction** (`hard-hat`) | Civil Engineer, Electrical Engineer, Electrician, Architect, Land Surveyor |
| **Operations, Retail & Food** (`store`) | Operations Manager, Retail Manager, Chef, Nutritionist |
| **Arts & Humanities** (`palette`) | Historian, Geographer, Linguist, Music Theorist |
| **Education, Transport & Public Service** (`shield`) | Teacher, Pilot, Investigator |

- Every industry has 3–5 roles, so no section is a lone card.
- Order inside an industry: alphabetical (or by how many people practise it, later).

## How it is stored
- `roles/index.json` gets an optional display-only list, like domain groups:
  ```json
  { "roles": ["software-engineer", …],
    "industries": [ { "id": "tech", "title": "Technology & Data", "icon": "cpu", "roles": ["software-engineer", "data-analyst", …] } ] }
  ```
- `roles` stays the source of truth. A role not in any industry goes into a trailing "Other". Role ids, URLs (`#/roles/<role>`, `#/rq/…`), stored attempts and stats don't change.

## How the Roles page looks
```
Roles                                          [ Find a role…        ]
┌─ On this page ─────────┐  Technology & Data · 5 roles
│ Technology & Data    5 │  ┌────────────────────────────────────────┐
│   Software Engineer    │  │ </> Software Engineer      Tool-specific│
│   Data Analyst         │  │ Backend · Fintech · Security · Systems  │
│   …                    │  └────────────────────────────────────────┘
│ Business & Finance   4 │  ┌────────────────────────────────────────┐
│ Science & Research   4 │  │ 📊 Data Analyst                          │
│ …                      │  │ BI · Research · Product · Analytics Eng │
└────────────────────────┘  └────────────────────────────────────────┘
                             Business & Finance · 4 roles
                             …
```
- **Sections:** one heading per industry (icon, title, role count), its role cards under it.
- **Role card:** title, flags, and the four subroles as chips that open the subrole directly.
- **Side table of contents (desktop):** industries, each expanding to its roles; the one in view is highlighted. **Phones:** a "Jump to" menu (industries and roles) plus the filter.
- **Filter:** matches industry, role and subrole names; empty industries hide.
- **Role page:** breadcrumb `Home › Roles › Technology & Data › Software Engineer` (the industry link jumps to its section).
- **Home Roles card:** "Career mixes in 7 industries" instead of the long role list.

## Optional tidy-ups (not done unless asked)
- Overlapping subroles across roles stay where they are, with a small "see also": Security Engineer (Software) ↔ Security Analyst (Network); Construction Project Manager (Project Manager) ↔ Site Engineer (Civil); Quantitative Researcher (Data Scientist) ↔ Financial Economist (Economist) ↔ Actuary (Mathematician).
- New roles later slot into an industry. A Health industry stays out because of the Medical rules (no doses or diagnosis).
