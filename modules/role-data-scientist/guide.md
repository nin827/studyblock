## General

These problems chain a few small calculations, so work in order and keep the units straight (counts, proportions, percentage points).

1. Read the stated formulas and cut-offs first. Every rule you need is in the question.
2. Turn percentages into counts, or counts into rates, before you use a formula.
3. Do the numbers part before the yes/no part. The decision is a comparison with a stated limit.
4. Rounding is stated: the chained answers here come out the same whether you carry full precision or the rounded earlier answer.

## Classifier scores

Precision = TP ÷ (TP + FP): of everything flagged, the share that is really positive. Recall = TP ÷ (TP + FN): of everything really positive, the share found. F1 = 2 × precision × recall ÷ (precision + recall), which is also 2TP ÷ (2TP + FP + FN).

To choose between models, apply the stated rule exactly: "higher F1" means compare the two F1 values; "higher recall, but only models with precision at least X" means drop any model below X first, then compare recall.

With a base rate, sensitivity and specificity: positives = batch × prevalence, TP = positives × sensitivity, FP = negatives × (100% − specificity). Even a good test has low precision when the condition is rare.

## Splits and gradient descent

Rows in a split = total × percentage. Batches per epoch = training rows ÷ batch size, rounded up, because a last smaller batch still counts. Steps = batches × epochs.

For L(w) = (w − a)² the gradient is L′(w) = 2(w − a). Each step: new w = w − η × L′(w). Because the distance from a is multiplied by 1 − 2η every step, the weights settle towards a only when that factor is between −1 and 1, and the loss falls each step then.

To find a from one step, use w₀ − w₁ = η × 2(w₀ − a) and solve for a. To count steps to get within ε, multiply the distance by the factor until it is at most ε (or solve |factor|ᵏ × distance ≤ ε with logarithms).

## Experiments and z-scores

z = (value − mean) ÷ SD measures how many standard deviations a value is from the mean. Compare |z| with the cut-off, ignoring the sign.

For an A/B test: lift = rate B − rate A; pooled rate p̄ = total conversions ÷ total visitors; SE = √(p̄(1 − p̄)(1/n₁ + 1/n₂)); z = lift ÷ SE with lift and SE in the same units. A 95% interval is lift ± 1.96 × SE. "Significant" and "big enough" are separate checks.

For planning: n per version = 2 × (1.96 + 0.84)² × p̄(1 − p̄) ÷ δ², rounded up. Days = 2n ÷ visitors per day, rounded up.

## Least-squares lines

b = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²) and a = (Σy − bΣx) ÷ n. Work out the top and bottom of b separately.

Prediction: ŷ = a + b·x. Residual = observed y − predicted y; its sign says whether the point is above or below the line. To work back from a stated slope, rearrange the formula: nΣxy = b × (nΣx² − (Σx)²) + ΣxΣy. To find x for a target y, solve y = a + b·x for x. A prediction for x outside the data's range is an extrapolation and is less trustworthy.
