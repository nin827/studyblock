# 025 — More subroles (specialisations)

**Status:** open (built with the defaults below)
**Raised:** 2026-11-27

## Request
More specialisations under each role.

## Defaults chosen
- Every role now has **four** subroles (58 new, 116 in total). Each new one is a weighted mix of existing subjects (including the new Engineering subjects) plus the role's existing scenario types that fit it best.
- **No new scenario types** were written, so some new subroles share scenarios with a sibling. Their subject mixes differ.
- **Left out on purpose:**
  - Medical Physicist, Clinical or Pharmaceutical Chemist, clinical Biologist: they lean on doses or radiation, which the Medical rules exclude.
  - Frontend Engineer: there is no web or UI subject, and the code languages are Python, C#, C++, GDScript and Rust.
- **Extra flags:** Digital Forensics Investigator, Music Producer, GIS Analyst and Computational Linguist add `tool_heavy`; Bioinformatician adds `tool_heavy` and `tool_specific`. No new start notices.

## Open: new scenario types that would fit better
Each would be a new subtopic in the role's `modules/role-*/` generator (multi-part, verify, hints). *Recommended first:* the ones where the subrole currently borrows a loosely related scenario (Water Engineer, Geotechnical Engineer, Optical Physicist, Microbiologist).
- **Civil Engineer:** Water Engineer → pipe network and drainage (flow, velocity, pump head, tank against demand); Geotechnical Engineer → soil stress at depth, water pressure, slope factor of safety.
- **Physicist:** Optical Physicist → lenses and optics.
- **Biologist:** Microbiologist → serial dilution and colony counts; Bioinformatician → sequence or query scenario.
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
