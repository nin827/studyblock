# Radioactivity: how to solve

## General

- In nuclide notation, like ²³⁸₉₂U, the top number A is the mass number (protons + neutrons) and the bottom number Z is the atomic number (protons).
- Neutrons = A - Z. A neutral atom has Z electrons.
- In every decay equation the top numbers balance and the bottom numbers balance.
- Easy and medium answers are whole numbers or simplest fractions; hard answers are rounded to 2 decimal places.

## Nuclear notation

1. Read A (top) and Z (bottom) from the notation, or A from the name: carbon-14 has A = 14.
2. Protons = Z, nucleons = A, neutrons = A - Z.
3. Isotopes have the same Z (same element) but a different A, so they differ only in neutrons.

Example: ¹⁴₆C has 6 protons and 14 - 6 = 8 neutrons.

**Watch out:** two nuclei with the same mass number but different atomic numbers are different elements, not isotopes.

## Decay equations

1. For each alpha decay: A - 4, Z - 2. For each beta decay: A stays, Z + 1. Gamma changes neither.
2. Apply the changes in order (or add up the totals), then find the new symbol from the new Z.
3. To find what was emitted, compare A and Z before and after: the particle makes up the difference.
4. To count decays in a chain: alphas = (drop in A) / 4, then betas = (2 × alphas) - (drop in Z).

Example: ²²⁶₈₈Ra emits an alpha particle: A = 226 - 4 = 222, Z = 88 - 2 = 86, so ²²²₈₆Rn.

**Watch out:** beta decay *raises* Z by 1 (a neutron turns into a proton), even though an electron leaves.

## Half-life

1. Find the number of half-lives: n = time / half-life (same time units).
2. Whole n: halve the starting value n times. Fraction left = 1 / 2^n; fraction decayed = 1 - 1 / 2^n.
3. Any n: `N = N0 × 0.5 ^ n`. To find n from N0 and N: `n = log(N0 / N) / log(2)`, then time = n × half-life.
4. Background: subtract it from every reading before halving, and add it back if you want what the counter shows.

Example: 800 Bq with a half-life of 2 days, after 6 days: 3 half-lives, 800 → 400 → 200 → 100 Bq.

**Watch out:** after 3 half-lives 1/8 is left, not 1/6. Halve each time; don't divide by the number of half-lives.
