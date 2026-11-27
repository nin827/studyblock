# 029 — Follow-ups from the unattended session (2026-11-27)

**Status:** open
**Raised:** 2026-11-27

While you were away, the following was built, tested in the 8100 preview and pushed to `origin main`:
- Expert read-off-the-picture templates in Statistics, Kinematics, Business Case, Finance, Trigonometry, Geometry and Coordinate Geometry (809c67b).
- 12 new roles without subroles: Logistics Manager, Hotel Manager, Archaeologist, Sports Analyst; Cloud Engineer, Marketing Manager, Environmental Scientist, Mechanical Engineer; Frontend Engineer, Astronomer, Event Planner, Farmer. There are now 41 roles in 8 industries (ticket 028).
- The industry now shows in the role page breadcrumb and links to its section of the Roles list.
- JavaScript, TypeScript, Java and Go in Code Writing, Code Reviewing and Role Software Engineer, plus one shared multi-language picker (ticket 027).

These decisions were left for you. Each one lists its default first.

## 1. Offline bundle not rebuilt
`dist/studyblock.html` was not rebuilt or checked with the visuals, new roles or new languages, because `py tools/bundle.py` isn't on the agents' allowed-command list.
*Options:* you run it and open the file (recommended), or allow agents to run it.

## 2. Sight-only Expert questions
14 read-off templates can't be solved with a screen reader. See ticket 026.
*Options:* keep as is (current), or add a Settings toggle "Describe chart values" that puts the hidden values in the alt text.

## 3. "Exercise rules only" warning on new roles
Most new roles open their About card with a Warning callout that the figures and rules are made up. That is louder than older roles such as Chef or Retail Manager, which have no warning.
*Options:* keep (current), soften to a Note callout, or drop it where nothing safety-related is involved.

## 4. GDScript in role runs (resolved)
With only GDScript chosen, Software Engineer and Game Developer now use Python, as ticket 027 specified.
*Resolved (user: "add other language used in game dev too"):* Game Developer now accepts GDScript and Lua through a `roleLangs` field; other roles are unchanged.

## 5. Next roles
Every planned role is now built (51 roles: batches 4 and 5 were added after this ticket was filed).
*Options:* stop here (default), or suggest new roles.

## 6. Code Writing Blocks for the new languages (resolved, no decision needed)
Some JS/TS/Java/Go lines have no Blocks alternative in Code Writing. The extended lexer that fixes this is used only in Code Reviewing, because turning it on in Code Writing changes those questions per seed.
*Options:* turn it on, which changes only the new languages' questions (recommended), or keep as is.
*Checked:* every new-language Write the line question already had a Blocks alternative. Code Writing now uses the extended lexer for the new languages too, for consistency, and no question changed.
