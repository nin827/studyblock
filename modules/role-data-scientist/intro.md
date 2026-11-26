# Applied scenarios (Data Scientist)

Expert+ questions for the **Data Scientist** role. Each one is a single scenario with several linked answers, and each answer uses a different skill: reading a confusion matrix, turning percentages into counts, splitting data into batches, taking gradient-descent steps, testing an A/B result against a z cut-off, or fitting a least-squares line from sums. A later part often builds on an earlier one, so work in order. The calculator is on, and the numbers from the prompt are already in it where that helps.

All figures are made up for practice. Every rule is stated in the question: the formulas for precision, recall, F1, SE, z and the least-squares line, the cut-offs (such as |z| at least 1.96 for a 95% test), the sample-size formula, and every "ship", "flag" or "act" rule. Answers are exact or rounded to the number of decimal places the question states, and the numbers are chosen so that working from an earlier rounded answer gives the same later answer. This is general textbook statistics and machine learning arithmetic, not any one library's behaviour.

## Classifier scores

A confusion matrix gives precision, recall and F1, and a stated rule picks the better model. Expert+ starts from a base rate, sensitivity and specificity, turns them into counts of true and false positives, and decides whether the precision is high enough to act on.

## Splits and gradient descent

A dataset split gives training rows, batches per epoch (rounded up) and optimiser steps. Later parts take gradient-descent steps on a simple loss (w − a)². Expert+ works back from one step to the best weight, counts the steps to settle, and judges whether a doubled learning rate would still converge.

## Experiments and z-scores

A z-score flags an outlier against a stated cut-off. An A/B test gives the lift, the pooled rate, z, a 95% interval and a ship decision with two separate conditions. Expert+ plans the next test: the sample size, the days it needs, and whether it fits a deadline.

## Least-squares lines

Stated sums give the slope and intercept of a fitted line, a prediction and the residual of a new point, with a rule for flagging an anomaly. Expert+ works back from the slope to a lost sum, finds the x for a target y, and asks whether that x lies inside the data's range.
