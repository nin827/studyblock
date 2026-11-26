# Genetics: how to solve

## General

- Write each parent's genotype first, then the gametes each can make. A gamete gets **one** allele of each gene.
- Draw a Punnett square: one parent's gametes across the top, the other's down the side. Each box is equally likely.
- Read the question's denominator carefully: "of all offspring", "of the sons" and "of the offspring that show the dominant trait" give different answers.
- Type percentages without the % sign, and fractions in simplest form like `3/4`.

## Punnett squares

1. Write the gametes: `Tt` makes `T` and `t`; `TT` makes only `T`; `tt` makes only `t`.
2. Fill the 2 × 2 square, one allele from each parent per box.
3. Count boxes: any box with a capital letter shows the dominant phenotype; only the double lower-case box shows the recessive one.
4. Each box is 1/4 (25%) of the offspring. Multiply by the number of offspring for an expected count.

Example: `Tt × tt` gives `Tt, Tt, tt, tt`, so 50% are short and the ratio tall : short is 1 : 1.

**Watch out:** "of the tall offspring, what fraction are `Tt`?" only counts the tall boxes, so for `Tt × Tt` it is 2/3, not 1/2.

**Expert: uncertain parents and new evidence.** A dominant-looking parent from `Tt × Tt` is `Tt` with probability 2/3. Multiply the chances that each parent is a carrier by 1/4 for a recessive offspring. Evidence updates these chances: one recessive offspring proves both parents are `Tt`; after n dominant test-cross offspring, use Bayes' rule, `prior × (1/2)^n ÷ (prior × (1/2)^n + (1 - prior))`. Self-pollinating halves the heterozygous share every generation.

## Dihybrid crosses

1. Check that the genes assort independently (they are on different chromosomes).
2. Split the cross into two one-gene crosses, for example `Rr × Rr` and `Yy × yy`.
3. Find the fraction for each gene, then multiply: P(round and green) = P(round) × P(green).
4. For a full 4 × 4 square, list the four gametes of each parent (`RrYy` makes `RY, Ry, rY, ry`).

Example: `RrYy × RrYy` gives round 3/4 and green 1/4, so round green = 3/16, and the full ratio is 9 : 3 : 3 : 1.

**Watch out:** a gamete has one allele per gene: `RY` is a gamete, `Rr` is not.

**Expert: one gene at a time.** To identify a cross from counts, split them by trait: about 3 : 1 for a gene means both parents are heterozygous for it, 1 : 1 means heterozygous × homozygous recessive, no recessives means a homozygous dominant parent. With three genes, do three one-gene crosses and multiply the probabilities.

## Sex-linked & blood groups

1. X-linked: a son gets his X from his mother and the Y from his father; a daughter gets one X from each parent.
2. Draw the square with the mother's X alleles down the side and the father's `X` and `Y` across the top.
3. Blood groups: `I^A` and `I^B` are codominant and both dominate `i`. Draw the square, then turn each box into A, B, AB or O.
4. If a parent's genotype isn't given, use their family: someone with group A whose mother was group O must be `I^A i`.

Example: carrier mother `X^H X^h` × father `X^H Y`: half the sons are `X^h Y` (affected), half the daughters are carriers.

**Watch out:** "probability a son is affected" counts sons only; "probability a child is an affected son" counts all children.

**Expert: family trees.** An affected male got his recessive X from his mother, so she is a carrier. Walk down the tree: each unaffected daughter of a carrier (and an unaffected father) is a carrier with probability 1/2. For two sons of a possible carrier, add the cases (not a carrier; carrier and both sons unaffected) instead of squaring. For blood groups, find each parent's possible genotypes first, then the chance of passing on `I^A`, `I^B` or `i`.

## Population genetics

1. The recessive phenotype frequency is q². Turn percentages or "1 in N" into a decimal first.
2. q = √(q²), then p = 1 − q.
3. Homozygous dominant = p², carriers (heterozygous) = 2pq. Multiply by 100 for a percentage.
4. Keep full precision until the end, then round as asked.

Example: 16% recessive phenotype → q² = 0.16, q = 0.4, p = 0.6, carriers 2pq = 0.48 = 48%.

**Watch out:** the dominant phenotype is p² + 2pq, so never take the square root of it. Work from the recessive phenotype.

**Expert: risk and selection.** Among people without the recessive trait, the carrier share is `2pq ÷ (1 - q²)`; two such parents have a recessive child with probability `(that)² × 1/4`. When every recessive individual is removed before breeding, `q → q ÷ (1 + q)`, which means 1/q goes up by exactly 1 per generation.

## Write gametes & genotypes

1. **Gametes:** a gamete gets one allele of each gene. Each heterozygous gene doubles the number of gamete types: `RrYy` makes 4 (`RY, Ry, rY, ry`), `RRYy` makes 2 (`RY, Ry`).
2. **Offspring genotypes:** split the cross into one-gene crosses (`Rr × rr` gives `Rr, rr`; `Yy × Yy` gives `YY, Yy, yy`), then combine every option of the first gene with every option of the second.
3. **Writing them:** gene by gene in the order the question gives, capital first within a gene (`Rr`, not `rR`). List them in alphabetical order with each capital before its lower-case letter: the first gene decides the order, then the second. Separate them with commas.
4. **Expert, described parents:** work out each genotype first. A parent that shows the dominant trait but whose mother showed the recessive one is heterozygous. One that shows the recessive trait is homozygous recessive. One from a true-breeding line is homozygous dominant.

Example: `RrYy × rrYy` gives `Rr, rr` for the first gene and `YY, Yy, yy` for the second, so the answer is `RrYY, RrYy, Rryy, rrYY, rrYy, rryy`.

**Watch out:** capitals matter here: `Rr` and `rr` are different genotypes. With Blocks, some blocks are decoys: an impossible genotype, a whole genotype offered as a gamete, or `Rr` as a "gamete" (a gamete never has two letters of one gene).
