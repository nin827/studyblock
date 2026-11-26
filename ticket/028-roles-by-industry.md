# 028 — Group roles by industry

**Status:** grouping built; new roles planned (waiting for the user's pick)
**Raised:** 2026-11-27

## Request
The Roles page is "all over the place". Group it as **Industry → Role → Subrole**.

## Built (user, 2026-11-27, second pass)
- **Technology:** Software Engineer, Data Analyst, Data Scientist, Network Engineer, Game Developer
- **Business:** Accountant, Business Analyst, Economist, Project Manager
- **Science:** Mathematician, Physicist, Chemist, Biologist
- **Engineering:** Civil Engineer, Electrical Engineer, Electrician, Architect, Land Surveyor
- **Operations:** Operations Manager, Pilot (transport and logistics)
- **Service:** Retail Manager, Chef, Nutritionist
- **Humanities:** Teacher, Historian, Geographer, Linguist
- **Miscellaneous** (niche roles): Music Theorist, Investigator
- *Not done yet:* the industry in the role page's breadcrumb.

## Plan: more roles (user: no more subroles needed)
New roles are **role-only**: a mix of existing subjects plus a role-only module with 4 scenario types (like today's roles), but **no subroles**. Health stays out (Medical rules: no doses or diagnosis). Recommended first in **bold**, one or two per thin industry.

| Industry | New roles | Scenario ideas (all arithmetic on stated, made-up figures) |
|---|---|---|
| Technology | **Cloud / DevOps Engineer**, Database Administrator, Frontend Engineer (once JavaScript/TypeScript land, ticket 027) | uptime % and error budgets, autoscaling and cost per hour, storage growth; index vs scan row counts, backups |
| Business | **Marketing Manager**, HR Manager, Insurance Underwriter | funnel conversion, CAC, ROAS, budget split; payroll, turnover rate, overtime; expected loss, premium from stated risk tables |
| Science | **Environmental Scientist**, Astronomer | pollutant concentrations and dilution, carbon footprint, sampling; parallax, magnitudes, light travel time |
| Engineering | **Mechanical Engineer**, Aerospace Engineer | gears, torque, fluids, tolerances (subjects already exist); thrust/weight, lift, fuel fraction |
| Operations | **Logistics / Supply Chain Manager**, Ship Navigator, Air Traffic Planner | EOQ, routes and loads, lead times; tides, ETA and fuel at sea, bearings; separation times and slot planning |
| Service | **Hotel Manager**, Event Planner, Travel Agent | occupancy, ADR and RevPAR, housekeeping staffing; per-head costing, seating, timelines; time zones, currency and fare comparisons |
| Humanities | **Archaeologist**, Philosopher, Journalist | radiocarbon half-lives, stratigraphy order, finds density; argument validity (Logic subjects); word counts, readability, source dating |
| Miscellaneous | **Sports Analyst**, Farmer / Agronomist, Puzzle Designer | pace, splits and league tables; yield per hectare, fertiliser rates, rainfall; unique-solution logic puzzles |

Each new role is one agent: role JSON + `modules/role-<id>/` (4 subtopics × medium/hard/expert/expert-plus, verify, hints, given rows, intro and guide). About a day's work each, so build in batches of 3–4.

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
