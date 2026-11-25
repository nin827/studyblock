# 012 — New domains: placement and scope

**Status:** open (built with the defaults below)
**Raised:** 2026-11-25

Four new domains were added: **Game Dev**, **Music Theory**, **Biology** and **Medical**. New subjects were also added to Math, Science and Computing.

**Defaults chosen**
1. **Biology moved out of Science.** The existing fact-list Biology subject is now "Biology Basics" in the new Biology domain, alongside the generated subjects Cells & Microscopy, Genetics and Ecology. Your past results for it are kept, because they're stored by subject id, which didn't change. *Alternative:* keep it in Science and leave the Biology domain with only the new subjects.
2. **Medical sticks to general facts and standard calculations**, as you asked:
   - Topics: anatomy, body measurements (BMI and unit conversions), vital-sign arithmetic, food energy and population health statistics.
   - It never covers medication or doses, symptoms or diagnosis, treatment, or "is this normal?" questions.
   - Every Medical subject starts with an "educational, not medical advice" note.
   - BMI shows only the general WHO adult categories, as a simple classification.
3. **Music Theory is written notation only.** There's no audio and there are no staff images, because the app uses no media assets.
4. **Domain colours:**
   - Game Dev: pink
   - Music: gold
   - Biology: green
   - Medical: cyan

   Medical sits between Science's teal and Computing's blue. Each card also has its own icon and title, so colour is never the only cue.

**Convention choices made while building (all stated in the questions)**
5. **Networking:** subnet counts allow subnet zero (2^s); /31 and /32 are never generated; KB/MB = 1000 and KiB/MiB = 1024, link speeds always 1000; addresses typed in canonical dotted form.
6. **Music:** American note names (British names in the intro); no double sharps or flats; in 6/8 the tempo beat is a dotted quarter. A few easy cells have small pools because only so many keys exist.
7. **Collision:** touching never counts as overlapping. Game Dev turns are left-positive; grids are y-down, everything else y-up.
8. **Forces & Energy:** g = 9.8 N/kg; some weight questions use the Moon (1.6) or Mars (3.7), always stated.
9. **Medical:** UK/EU label reference intakes (2000 kcal, 70 g fat…); MAP uses the ⅓ estimate; BMI shown as numeric ranges only. Exertion contexts were removed from pulse questions, and waist-ratio questions skip 0.50 (a quoted rule of thumb). Health Statistics leaves out number needed to treat. Rate-change questions say "using the unrounded rates".
10. **Anatomy:** calculator stays on (like Biology Basics). Fact wordings to double-check: "Immune and lymphatic system" as one label; sweat glands as integumentary; red blood cells "mainly made in bone marrow"; liver "the largest organ inside the body".
11. **Genetics:** sex-linked examples are haemophilia, red-green colour blindness and G6PD deficiency; Hardy–Weinberg "1 in N" cases use a generic "inherited recessive condition".
12. **Text answers:** spaces around commas are now ignored, like colons.
