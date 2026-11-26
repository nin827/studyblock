# 025 — More subroles (specialisations)

**Status:** open (built with the defaults below)
**Raised:** 2026-11-27

## Request
More specialisations under each role.

## Defaults chosen
- Every role now has **four** subroles (58 new, 116 in total). Each new one is a weighted mix of existing subjects (including the new Engineering subjects) plus the role's existing scenario types that fit it best.
- At first **no new scenario types** were written, so some new subroles share scenarios with a sibling (their subject mixes differ). Four have since been added (2026-11-27, below).
- **Left out on purpose:**
  - Medical Physicist, Clinical or Pharmaceutical Chemist, clinical Biologist: they lean on doses or radiation, which the Medical rules exclude.
  - Frontend Engineer: there is no web or UI subject, and the code languages are Python, C#, C++, GDScript and Rust.
- **Extra flags:** Digital Forensics Investigator, Music Producer, GIS Analyst and Computational Linguist add `tool_heavy`; Bioinformatician adds `tool_heavy` and `tool_specific`. No new start notices.

## Built (2026-11-27)
- Water Engineer → `pipe-drainage` (Pipes and drainage); Geotechnical Engineer → `ground-stress` (Ground and slopes); Optical Physicist → `optics-bench` (Lenses and light); Microbiologist → `dilution-counts` (Dilutions and colony counts).
- Each subrole keeps one older scenario next to the new one (Water: setting-out; Geotechnical: tie-rod; Optical: orbit-signals, which its description promises; Microbiologist: growth-diversity). *Option:* make them new-scenario only.
- Civil Engineer's new whole-number measurement parts (filling time, gradient N, tank storage, anchor force) are exact like the module's other whole-number parts. *Option:* give them close-answer credit.

## Open: new scenario types that would fit better
Each would be a new subtopic in the role's `modules/role-*/` generator (multi-part, verify, hints). 
- **Biologist:** Bioinformatician → sequence or query scenario.
- **Software Engineer:** Security Engineer → cipher, key or access-log investigation.
- **Accountant:** Tax Accountant → tax computation with stated made-up bands.
- **Mathematician:** Pure Mathematician → proof or number-theory scenario.
- **Electrical Engineer:** Control Engineer → sensor → logic → actuator.
- **Game Developer:** Economy Designer → currency sinks and faucets.
- **Economist:** Financial Economist → bond and loan pricing.
- **Music Theorist:** Music Producer → tempo to milliseconds, sample rate to file size.
- **Network Engineer:** Network Architect → capacity planning.
- **Geographer:** GIS Analyst → map overlay, area from coordinates.
- **Teacher:** Moderator → marker consistency against a tolerance.
- **Pilot:** Cargo Pilot → weight and balance (centre of gravity).
- **Electrician:** Solar PV Installer → panel count, string voltage, payback.
- **Investigator:** Digital Forensics → hex/IP log timelines; Insurance Investigator → claim payout and excess.
- **Architect:** Interior Architect → finishes quantities and FF&E budget; Architectural Technologist → tolerance stack-up on an assembly.
- **Data Scientist:** Forecasting Analyst → moving averages, smoothing, MAE/MAPE; Quantitative Researcher → Sharpe ratio.
- **Land Surveyor:** Engineering Surveyor → cut and fill from levels; Topographic Surveyor → contour interpolation.
- **Chef:** Pastry Chef → baker's percentages; Catering Chef → per-head event costing.
- **Retail Manager:** Retail Buyer → landed cost and open-to-buy; E-commerce Manager → conversion funnel and average order value.
- **Project Manager:** IT Project Manager → sprint velocity and burndown.
