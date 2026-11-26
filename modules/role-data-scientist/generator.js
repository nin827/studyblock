// Data Scientist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills. Hints and explanations use only values
// already drawn (no rng calls in hint code), and verify() recomputes every part by another route
// (F1 as a harmonic mean, z from raw counts and a square root, centred sums for least squares,
// day/step loops instead of closed forms, a simulated run for gradient descent).
// Every figure is made up. Numbers are drawn so that each chained answer is exact or, where an answer is
// rounded to 2 decimals, so that working from an earlier rounded answer gives the same later answer and no
// answer sits on a rounding half-step.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   classifier-scores  confusion matrix -> precision, recall -> F1 -> best model by a stated rule;
//                      expert-plus: prevalence, sensitivity, specificity -> TP, FP -> precision -> act or not
//   model-training     train/test split rows -> batches per epoch -> steps; gradient descent on L(w) = (w - a)^2;
//                      expert-plus works back from one step to the minimiser, then steps to converge and a doubled rate
//   experiment-test    z-score and an outlier call; A/B test lift, pooled rate, z, 95% interval and a ship rule;
//                      expert-plus plans the next test (sample size, days, feasible?)
//   regression-fit     least-squares slope and intercept from stated sums -> prediction -> residual -> anomaly;
//                      expert-plus works back from the slope to the lost sum, then the x for a target y and a range call

import { roundTo, isHalfStep } from "../../js/lib/mathutil.js";

const TRY = 800;
const sum = (a) => a.reduce((s, x) => s + x, 0);
// Thousands separators by hand: the first locale-formatting call warms up Intl (~10–20 ms).
const fmt = (n) => { const [i, d] = String(n).split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? `.${d}` : ""); };
const r2 = (x) => roundTo(x, 2);
const f2 = (x) => r2(x).toFixed(2);
const half2 = (x) => isHalfStep(x, 2, 1e-6);
const ex2 = (x) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;
const close = (a, b) => Math.abs(a - b) < 1e-6;
const sg = (x) => (x < 0 ? "−" : "") + Math.abs(roundTo(x, 4));
const pn = (x) => (x < 0 ? `(${sg(x)})` : sg(x)); // a negative factor in brackets
const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tooMany = () => { throw new Error("role-data-scientist: no suitable draw"); };

// ---------- part builders ----------
const numPart = (id, label, ask, answer, hint, exact = true) => {
  const p = { id, label, ask, answerType: "number", answer, tolerance: 0, hint };
  if (exact) p.fuzzyNumber = 0;
  return p;
};
const yesNo = (rng, id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: rng.shuffle(["Yes", "No"]), hint });
const pickOne = (rng, id, label, ask, correct, others, hint) => {
  const wrong = [...new Set(others)].filter((o) => o !== correct);
  return { id, label, ask, answerType: "choice", answer: correct, choices: rng.shuffle([correct, ...wrong]), hint };
};
// Segmented part: the full grid of column values, shuffled; the answer is one row.
function segPart(rng, id, label, ask, cols, values, answerRow, hint) {
  let rows = [[]];
  for (const vs of values) rows = rows.flatMap((r) => vs.map((v) => [...r, v]));
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices: rng.shuffle(rows), answer: answerRow, hint };
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  return { prompt, answerType: "multi", parts, explanation, params: { kind, ...params }, given: givenRows(given), hints };
}

// =====================================================================
// classifier-scores
// =====================================================================
const CTX = [
  { sys: "A fraud filter", items: "transactions", pos: "fraudulent" },
  { sys: "A spam filter", items: "emails", pos: "spam" },
  { sys: "A defect detector on a production line", items: "parts", pos: "defective" },
  { sys: "A fault detector", items: "sensor readings", pos: "faulty" },
  { sys: "A moderation model", items: "posts", pos: "rule-breaking" },
];
const CM_TERMS = "Precision = TP ÷ (TP + FP). Recall = TP ÷ (TP + FN). F1 = 2 × precision × recall ÷ (precision + recall).";
const cmTable = (c) => ["| | Predicted positive | Predicted negative |", "| --- | --- | --- |", `| Actually positive | ${c.TP} | ${c.FN} |`, `| Actually negative | ${c.FP} | ${c.TN} |`].join("\n");

function drawExact(rng) {
  const SET = [20, 25, 40, 50, 80, 100, 200];
  for (let t = 0; t < TRY; t++) {
    const PP = rng.pick(SET), AP = rng.pick(SET);
    const max = Math.min(PP, AP) - 2;
    if (max < 8) continue;
    const TP = rng.int(Math.ceil(max * 0.4), max), FP = PP - TP, FN = AP - TP;
    const P = TP / PP, R = TP / AP;
    if (FP < 1 || FN < 1 || !ex2(P) || !ex2(R) || P === R) continue;
    return { TP, FP, FN, TN: rng.int(10, 90) * 10, P, R };
  }
  return tooMany();
}
function drawApprox(rng) {
  for (let t = 0; t < TRY; t++) {
    const TP = rng.int(30, 180), FP = rng.int(8, 70), FN = rng.int(8, 70), TN = rng.int(200, 900);
    const P = TP / (TP + FP), R = TP / (TP + FN), F = (2 * TP) / (2 * TP + FP + FN);
    if (half2(P) || half2(R) || half2(F)) continue;
    const P2 = r2(P), R2 = r2(R);
    if (P2 === R2) continue;
    const Fb = (2 * P2 * R2) / (P2 + R2);
    if (half2(Fb) || r2(Fb) !== r2(F)) continue;
    return { TP, FP, FN, TN, P, R, F };
  }
  return tooMany();
}
const cmGiven = (c) => [["_tp", c.TP], ["_fp", c.FP], ["_fn", c.FN], ["_tn", c.TN]];
const precHint = "Of everything the model flagged as positive, what share really was? The flagged total is TP + FP.";
const recHint = "Of everything that really is positive, what share did the model catch? The real positives are TP + FN.";
const f1Hint = "Use the harmonic-mean formula; working from the counts or from precision and recall rounded to 2 decimals gives the same 2-decimal F1 here.";

function modelWins(rule, A, B, X) {
  if (rule === "f1") return A.F > B.F ? "A" : "B";
  const okA = A.P >= X, okB = B.P >= X;
  if (okA && okB) return A.R > B.R ? "A" : "B";
  return okA ? "A" : "B";
}

// Expert: Model A from a matrix, Model B from stated precision and recall; a stated rule picks the winner (balanced A/B).
function drawPair(rng) {
  const want = rng.next() < 0.5 ? "A" : "B";
  const rule = rng.next() < 0.5 ? "f1" : "floor";
  for (let a = 0; a < 20; a++) {
    const c = drawApprox(rng);
    for (let t = 0; t < 60; t++) {
      const PB = rng.int(50, 95) / 100, RB = rng.int(50, 95) / 100;
      const B = { P: PB, R: RB, F: (2 * PB * RB) / (PB + RB) };
      const X = rng.pick([0.7, 0.75, 0.8, 0.85]);
      if (rule === "f1") {
        if (Math.abs(c.F - B.F) < 0.04) continue;
      } else {
        if (Math.abs(c.P - X) < 0.02 || Math.abs(PB - X) < 0.02) continue;
        const okA = c.P >= X, okB = PB >= X;
        if (!okA && !okB) continue;
        if (okA && okB && Math.abs(c.R - RB) < 0.04) continue;
      }
      if (modelWins(rule, c, B, X) !== want) continue;
      return { c, B, X, rule, want };
    }
  }
  return tooMany();
}

function genClassifier(rng, tier) {
  const ctx = rng.pick(CTX);
  if (tier === "expert-plus") return genScreening(rng, ctx);
  const pair = tier === "expert" ? drawPair(rng) : null;
  const c = pair ? pair.c : tier === "medium" ? drawExact(rng) : drawApprox(rng);
  const N = c.TP + c.FP + c.FN + c.TN;
  const head = `${ctx.sys} was tested on **${fmt(N)} ${ctx.items}**; "positive" means ${ctx.pos}. Its results:\n\n${cmTable(c)}\n\n${CM_TERMS} Round to 2 decimal places.`;
  const exPR = `Flagged positive = TP + FP = ${c.TP} + ${c.FP} = ${c.TP + c.FP}, so precision = ${c.TP} ÷ ${c.TP + c.FP} = **${f2(c.P)}**. Real positives = TP + FN = ${c.TP} + ${c.FN} = ${c.TP + c.FN}, so recall = ${c.TP} ÷ ${c.TP + c.FN} = **${f2(c.R)}**.`;
  const parts = [
    numPart("precision", "Precision", "Precision (2 decimal places)", r2(c.P), precHint, false),
    numPart("recall", "Recall", "Recall (2 decimal places)", r2(c.R), recHint, false),
  ];
  const base = { tier, c: { TP: c.TP, FP: c.FP, FN: c.FN, TN: c.TN } };
  if (tier === "medium") {
    return finish(`${head}\n\nFind the precision and the recall.`, parts, exPR, "ds-cls", base, cmGiven(c), ["Read TP, FP and FN from the table, then divide.", precHint]);
  }
  const F2 = f2(c.F);
  const exF = `${exPR} F1 = 2 × ${f2(c.P)} × ${f2(c.R)} ÷ (${f2(c.P)} + ${f2(c.R)}) = **${F2}**.`;
  if (tier === "hard") {
    parts.push(numPart("f1", "F1", "F1 score (2 decimal places)", r2(c.F), f1Hint, false));
    return finish(`${head}\n\nFind the precision, the recall and the F1 score.`, parts, exF, "ds-cls", base, cmGiven(c), ["Precision and recall first, then combine them into F1.", f1Hint]);
  }
  const { B, X, rule, want } = pair;
  const ruleText = rule === "f1" ? "Choose the model with the **higher F1 score**." : `Choose the model with the **higher recall**, but only a model whose precision is **at least ${X.toFixed(2)}** may be chosen.`;
  const FBs = f2(B.F);
  const why = rule === "f1"
    ? `Model B: F1 = 2 × ${f2(B.P)} × ${f2(B.R)} ÷ (${f2(B.P)} + ${f2(B.R)}) = ${FBs}. ${F2} against ${FBs}: **Model ${want}** has the higher F1.`
    : `Precision of A is ${f2(c.P)} and of B is ${f2(B.P)}; the floor is ${X.toFixed(2)}, so ${c.P >= X ? "A is allowed" : "A is not allowed"} and ${B.P >= X ? "B is allowed" : "B is not allowed"}. ${c.P >= X && B.P >= X ? `Both are allowed, so the higher recall wins (A ${f2(c.R)}, B ${f2(B.R)}): **Model ${want}**.` : `Only **Model ${want}** may be chosen.`}`;
  parts.push(numPart("f1", "F1", "Model A's F1 score (2 decimal places)", r2(c.F), f1Hint, false));
  parts.push(pickOne(rng, "choice", "Best model", "Which model should be chosen?", `Model ${want}`, ["Model A", "Model B"], rule === "f1" ? "Work out the F1 of the summarised model from its precision and recall, then compare the two F1 scores." : "First see which models pass the precision floor; among those allowed, the higher recall wins."));
  return finish(
    `${head}\n\nModel B's results are only summarised: precision **${f2(B.P)}**, recall **${f2(B.R)}**. ${ruleText}\n\nFind Model A's precision, recall and F1, and the model to choose.`,
    parts, `${exF}\n\n${why}`, "ds-cls",
    { ...base, B: { P: B.P, R: B.R }, rule, X },
    [...cmGiven(c), ["_pB", B.P], ["_rB", B.R], ...(rule === "floor" ? [["_floor", X]] : [])],
    ["Model A's precision and recall come straight from its table.", rule === "f1" ? "Model B's F1 comes from its stated precision and recall." : "Check each model against the precision floor before comparing recall."],
  );
}

function genScreening(rng, ctx) {
  const yes = rng.next() < 0.5;
  for (let t = 0; t < TRY; t++) {
    const N = rng.pick([1000, 2000]), k = rng.pick([1, 2, 4, 5, 10, 20]), s = rng.pick([80, 85, 90, 95, 98, 99]), cs = rng.pick([90, 92, 95, 96, 98, 99]);
    const pos = (N * k) / 100, neg = N - pos;
    const TP = (pos * s) / 100, FP = (neg * (100 - cs)) / 100;
    if (!isInt(TP) || !isInt(FP) || TP < 5 || FP < 5) continue;
    const P = TP / (TP + FP);
    if (half2(P)) continue;
    const Xs = [];
    for (let x = 30; x <= 95; x += 5) { const X = x / 100; if (Math.abs(P - X) >= 0.03 && (P >= X) === yes) Xs.push(X); }
    if (!Xs.length) continue;
    const X = rng.pick(Xs);
    return finish(
      `A screening model is run on a made-up batch of **${fmt(N)} ${ctx.items}**. **${k}%** of them really are ${ctx.pos} ("positive"). The model flags **${s}%** of the positive ${ctx.items} (its sensitivity) and correctly clears **${cs}%** of the negative ones (its specificity). Everything it flags is sent on. Precision = TP ÷ (TP + FP). Find the number of positive ${ctx.items} it flags correctly (TP), the number of negative ones it flags wrongly (FP), and the precision (2 decimal places). The rule is to let the model act on its own only if the precision is **at least ${X.toFixed(2)}**: may it?`,
      [
        numPart("tp", "True positives", `Positive ${ctx.items} flagged correctly (TP)`, TP, "Find the number of positives first (the share of the batch), then take the sensitivity share of them."),
        numPart("fp", "False positives", `Negative ${ctx.items} flagged wrongly (FP)`, FP, "Find the number of negatives, then the share that is NOT cleared (100% minus the specificity)."),
        numPart("precision", "Precision", "Precision (2 decimal places)", r2(P), "TP ÷ (TP + FP): of everything flagged, the share that is really positive.", false),
        yesNo(rng, "act", "Act alone?", `May the model act on its own (precision at least ${X.toFixed(2)})?`, P >= X, "Compare the precision with the stated limit."),
      ],
      `Positives = ${fmt(N)} × ${k}% = ${pos}; negatives = ${neg}. TP = ${pos} × ${s}% = **${TP}**. FP = ${neg} × ${100 - cs}% = **${FP}**. Precision = ${TP} ÷ (${TP} + ${FP}) = **${f2(P)}**, which is ${P >= X ? "at least" : "below"} ${X.toFixed(2)}: **${P >= X ? "Yes" : "No"}**.`,
      "ds-screen", { N, k, s, cs, X }, [["_n", N], ["_prev", k], ["_sens", s], ["_spec", cs], ["_limit", X]],
      ["Turn the percentages into counts of items first.", "Precision uses only the flagged items, so FP matters as much as TP."],
    );
  }
  return tooMany();
}

// =====================================================================
// model-training
// =====================================================================
const GD_CONV = [0.1, 0.2, 0.25, 0.3, 0.4, 0.6, 0.75];
const GD_DIV = [1.1, 1.2, 1.25, 1.5];
const GD_DOUBLE_OK = [0.1, 0.2, 0.25, 0.3, 0.4];
const GD_DOUBLE_BAD = [0.6, 0.75];
const GD_RULE = "Gradient descent updates the weight each step by **w ← w − η × L′(w)**, where L′ is the gradient (the derivative of the loss) and η the learning rate.";

function genTraining(rng, tier) {
  if (tier === "medium" || tier === "hard") {
    for (let t = 0; t < TRY; t++) {
      const N = 100 * rng.int(8, 60);
      const B = rng.pick([25, 32, 40, 50, 64, 100, 128, 200]);
      if (tier === "medium") {
        const r = rng.pick([70, 75, 80, 85]);
        const train = (N * r) / 100;
        if (!isInt(train) || train % B === 0 || train < 3 * B) continue;
        const batches = Math.ceil(train / B);
        return finish(
          `A dataset has **${fmt(N)} labelled rows**. **${r}%** of them are used for training and the rest for testing. Training reads **${B} rows** at a time (a batch); an epoch is one pass over the training rows, and a last smaller batch still counts as a batch. Find the number of training rows and the number of batches in one epoch.`,
          [
            numPart("train", "Training rows", "Number of training rows", train, "Take the training percentage of the whole dataset."),
            numPart("batches", "Batches per epoch", "Batches in one epoch", batches, `Divide the training rows by ${B} and round up: a part batch is still a batch.`),
          ],
          `Training rows = ${fmt(N)} × ${r}% = **${fmt(train)}**. Batches = ${fmt(train)} ÷ ${B} = ${(train / B).toFixed(2)}, rounded **up** to **${batches}**.`,
          "ds-split", { tier, N, r, B }, [["_rows", N], ["_pct", r], ["_batch", B]],
          ["Percentage first, then divide by the batch size.", "Round up: the last batch is smaller but still happens."],
        );
      }
      const r = rng.pick([60, 70, 80]), v = rng.pick([10, 15, 20]);
      const train = (N * r) / 100, val = (N * v) / 100;
      if (!isInt(train) || !isInt(val) || train % B === 0 || train < 3 * B || r + v >= 100) continue;
      const batches = Math.ceil(train / B), E = rng.int(3, 12);
      return finish(
        `A dataset has **${fmt(N)} labelled rows**, split **${r}% training, ${v}% validation** and the rest test. The model trains on batches of **${B} rows** (a last smaller batch still counts as a batch), and each batch is **one optimiser step**. It trains for **${E} epochs** (an epoch is one pass over the training rows). Find the number of training rows, the batches per epoch, and the total number of optimiser steps.`,
        [
          numPart("train", "Training rows", "Number of training rows", train, "Take the training percentage of the whole dataset (validation and test rows are not trained on)."),
          numPart("batches", "Batches per epoch", "Batches in one epoch", batches, `Divide the training rows by ${B} and round up.`),
          numPart("steps", "Optimiser steps", `Total optimiser steps in ${E} epochs`, batches * E, "One step per batch, so multiply the batches per epoch by the number of epochs."),
        ],
        `Training rows = ${fmt(N)} × ${r}% = **${fmt(train)}**. Batches = ${fmt(train)} ÷ ${B} = ${(train / B).toFixed(2)}, rounded up to **${batches}**. Steps = ${batches} × ${E} = **${batches * E}**.`,
        "ds-split", { tier, N, r, v, B, E }, [["_rows", N], ["_pct", r], ["_batch", B], ["_epochs", E]],
        ["Training percentage first.", "Round the batches up before multiplying by the epochs."],
      );
    }
    return tooMany();
  }
  const dist = (d0, eta, k) => Math.abs(d0 * Math.pow(1 - 2 * eta, k));
  if (tier === "expert") {
    const lower = rng.next() < 0.5;
    const eta = rng.pick(lower ? GD_CONV : GD_DIV);
    const a = rng.int(1, 12);
    const d0 = rng.pick([-1, 1]) * rng.int(4, 24);
    const w0 = a + d0, r = 1 - 2 * eta;
    const w1 = a + r * d0, w2 = a + r * r * d0, grad = 2 * d0;
    return finish(
      `A tiny model has one weight *w* and the loss **L(w) = (w − ${a})²**. ${GD_RULE} Take **η = ${eta}** and start at **w = ${sg(w0)}**. Find the gradient at the start, the weight after step 1 and after step 2, and say whether the loss after 2 steps is lower than the loss at the start.`,
      [
        numPart("grad", "Gradient", `Gradient L′(${sg(w0)}) at the start`, grad, `Differentiate (w − ${a})² (chain rule), then put in the starting weight.`),
        numPart("w1", "After step 1", "Weight after step 1", roundTo(w1, 4), "New weight = old weight − η × gradient at the old weight.", false),
        numPart("w2", "After step 2", "Weight after step 2", roundTo(w2, 4), "Repeat the update from the weight after step 1: recompute the gradient there first.", false),
        yesNo(rng, "lower", "Loss lower?", "Is the loss after 2 steps lower than at the start?", Math.abs(w2 - a) < Math.abs(w0 - a), `The loss is the squared distance from ${a}, so compare how far each weight is from ${a}.`),
      ],
      `L′(w) = 2(w − ${a}). At w = ${sg(w0)}: gradient **${sg(grad)}**. Step 1: w = ${sg(w0)} − ${eta} × ${pn(grad)} = **${sg(w1)}**. Step 2: gradient = 2 × (${sg(w1)} − ${a}) = ${sg(2 * (w1 - a))}, so w = ${sg(w1)} − ${eta} × ${pn(2 * (w1 - a))} = **${sg(w2)}**. Distance from ${a}: ${Math.abs(d0)} at the start, ${sg(Math.abs(w2 - a))} after 2 steps, so the loss is **${lower ? "lower" : "higher"}** (${lower ? "Yes" : "No"}).`,
      "ds-gd", { tier, a, w0, eta }, [["_a", a], ["_w0", w0], ["_eta", eta]],
      ["The gradient of (w − a)² is 2(w − a).", "Each step uses the gradient at the weight you have just reached."],
    );
  }
  // expert-plus: unknown a; w1 given
  const ok = rng.next() < 0.5; // verdict decided once, before the redraw loop, so Yes/No stay balanced
  for (let t = 0; t < TRY; t++) {
    const eta = rng.pick(ok ? GD_DOUBLE_OK : GD_DOUBLE_BAD);
    const a = rng.int(1, 12);
    const d0 = rng.pick([-1, 1]) * rng.int(4, 24);
    const eps = rng.pick([0.1, 0.25, 0.5, 1, 2]);
    const r = 1 - 2 * eta;
    let k = 0;
    while (dist(d0, eta, k) > eps && k < 60) k++;
    if (k < 3 || k > 12) continue;
    if (dist(d0, eta, k) > eps * 0.99 || dist(d0, eta, k - 1) < eps * 1.01) continue;
    const w0 = a + d0, w1 = a + r * d0, w2 = a + r * r * d0;
    const r2x = 1 - 4 * eta;
    return finish(
      `A one-weight model has the loss **L(w) = (w − a)²** with an unknown best weight *a*. ${GD_RULE} Training starts at **w = ${sg(w0)}** with **η = ${eta}**, and after the first step the weight is **${sg(w1)}**. Find *a*, then the weight after step 2, then the number of steps from the start until *w* is within **${eps}** of *a* (|w − a| ≤ ${eps}). Last, if η were **doubled** (to ${roundTo(2 * eta, 4)}), would the distance |w − a| still shrink towards 0?`,
      [
        numPart("a", "Best weight", "The best weight a", a, "L′(w) = 2(w − a), so one step changes w by η × 2(w₀ − a). Use the change you were given and solve for a."),
        numPart("w2", "After step 2", "Weight after step 2", roundTo(w2, 4), "Use the gradient at the weight after step 1, with the value of a you found.", false),
        numPart("steps", "Steps to settle", `Steps until |w − a| ≤ ${eps}`, k, "Each step multiplies the distance from a by the same factor. Keep multiplying (or use logarithms) until the distance is at most the limit."),
        yesNo(rng, "double", "Doubled η?", "With η doubled, does |w − a| still shrink towards 0?", Math.abs(r2x) < 1, "Find the factor 1 − 2η by which the distance is multiplied each step. The distance shrinks only if that factor is between −1 and 1."),
      ],
      `Step 1 moved w from ${sg(w0)} to ${sg(w1)}: change ${sg(w1 - w0)} = −η × 2(${sg(w0)} − a), so 2(${sg(w0)} − a) = ${sg((w0 - w1) / eta)} and **a = ${a}**. Each step multiplies the distance from a by 1 − 2η = ${sg(r)}, starting from ${Math.abs(d0)}. After step 2 the weight is **${sg(w2)}**. The distance first drops to at most ${eps} after **${k}** steps (${sg(dist(d0, eta, k))}, against ${sg(dist(d0, eta, k - 1))} one step earlier). With η doubled the factor is 1 − 4η = ${sg(r2x)}, which ${Math.abs(r2x) < 1 ? "is between −1 and 1, so it still shrinks (Yes)" : "has size above 1, so the distance grows (No)"}.`,
      "ds-gd-back", { tier, w0, w1, eta, eps }, [["_w0", w0], ["_w1", w1], ["_eta", eta], ["_eps", eps]],
      ["The step you were given fixes a.", "The same factor applies at every step."],
    );
  }
  return tooMany();
}

// =====================================================================
// experiment-test
// =====================================================================
// Table of (pooled rate %, visitors per arm n) whose pooled standard error, in percentage points, is a multiple of 0.25.
const AB = [];
for (const k of [5, 10, 15, 20, 25, 30, 40, 50]) {
  for (let n = 200; n <= 8000; n += 50) {
    const se = Math.sqrt((2 * k * (100 - k)) / n);
    if (Math.abs(se * 4 - Math.round(se * 4)) < 1e-9 && se >= 0.5 && se <= 4) AB.push({ k, n, se });
  }
}
const AB_RULE = "Lift = rate B − rate A (in percentage points). Pooled rate p̄ = (conversions A + conversions B) ÷ (visitors A + visitors B). SE = √(p̄ × (1 − p̄) × (1 ÷ visitors A + 1 ÷ visitors B)), and z = lift ÷ SE (lift and SE in the same units).";
const SIGNUP = [
  ["new checkout page", "bought", "buy"],
  ["shorter sign-up form", "signed up", "sign up"],
  ["redesigned landing page", "clicked through", "click through"],
  ["new onboarding email", "activated", "activate"],
];

// A/B draw: combo plus a z that is a multiple of 0.25 and a lift (points) that is a multiple of 0.25, with whole conversion counts.
function drawAB(rng, accept) {
  for (let t = 0; t < TRY; t++) {
    const cb = rng.pick(AB);
    const z = rng.int(2, 14) * 0.25 * (rng.next() < 0.2 ? -1 : 1);
    const d = z * cb.se;
    if (Math.abs(d * 4 - Math.round(d * 4)) > 1e-9 || Math.abs(d) > 8 || cb.k - Math.abs(d) / 2 < 1.5) continue;
    const c1 = (cb.n * (cb.k - d / 2)) / 100, c2 = (cb.n * (cb.k + d / 2)) / 100;
    if (!isInt(c1) || !isInt(c2)) continue;
    const ab = { ...cb, z, d, c1: Math.round(c1), c2: Math.round(c2) };
    if (accept && !accept(ab)) continue;
    return ab;
  }
  return tooMany();
}
const abText = (ab, who) => `The **${who[0]}** (B) was shown to **${fmt(ab.n)}** visitors and the current one (A) to **${fmt(ab.n)}** visitors. **${fmt(ab.c2)}** of B's visitors and **${fmt(ab.c1)}** of A's ${who[1]}.`;

const OUT_CTX = [
  ["Daily orders", "orders", 800, 1600],
  ["Daily page views", "views", 3000, 9000],
  ["Weekly sign-ups", "sign-ups", 400, 1200],
  ["Response time", "ms", 150, 600],
];

function genExperiment(rng, tier) {
  if (tier === "medium") {
    const [what, unit, lo, hi] = rng.pick(OUT_CTX);
    const yes = rng.next() < 0.5;
    const cut = rng.pick([2, 2.5, 3]);
    for (let t = 0; t < TRY; t++) {
      const sd = rng.pick([8, 12, 16, 20, 24, 40]), mu = rng.int(lo, hi);
      const mag = yes ? cut + rng.int(1, 6) * 0.25 : rng.int(1, Math.round((cut - 0.25) / 0.25)) * 0.25;
      const z = mag * (rng.next() < 0.5 ? -1 : 1);
      const x = mu + z * sd;
      if (!isInt(x) || x <= 0) continue;
      return finish(
        `${what} (${unit}) in a made-up system have mean **${fmt(mu)}** and standard deviation **${sd}**. Today's value is **${fmt(x)}**. The z-score is z = (value − mean) ÷ SD. A value is flagged as an outlier if |z| is **more than ${cut}**. Find the z-score and say whether today's value is flagged.`,
        [
          numPart("z", "z-score", "z-score (2 decimal places)", r2(z), "Subtract the mean from today's value, then divide by the standard deviation; keep the sign."),
          yesNo(rng, "outlier", "Flagged?", `Is today's value flagged (|z| more than ${cut})?`, Math.abs(z) > cut, "Compare the size of z, ignoring its sign, with the cut-off."),
        ],
        `z = (${fmt(x)} − ${fmt(mu)}) ÷ ${sd} = ${sg(x - mu)} ÷ ${sd} = **${sg(z)}**. |z| = ${Math.abs(z)} is ${Math.abs(z) > cut ? "more" : "not more"} than ${cut}: **${Math.abs(z) > cut ? "Yes" : "No"}**.`,
        "ds-z", { mu, sd, x, cut }, [["_mean", mu], ["_sd", sd], ["_value", x], ["_cut", cut]],
        ["Distance from the mean, measured in standard deviations.", "The sign only says above or below."],
      );
    }
    return tooMany();
  }
  const who = rng.pick(SIGNUP);
  if (tier === "hard") {
    const ab = drawAB(rng);
    return finish(
      `A test compares a new version with the current one. ${abText(ab, who)} ${AB_RULE} Find the lift in percentage points, the pooled rate (as a percentage) and the z statistic (2 decimal places).`,
      [
        numPart("lift", "Lift", "Lift (percentage points)", ab.d, `Rate B minus rate A, each as conversions ÷ ${fmt(ab.n)} visitors, in percentage points.`, false),
        numPart("pooled", "Pooled rate", "Pooled rate (%)", ab.k, "Add both conversion counts and divide by the total visitors in both groups."),
        numPart("z", "z statistic", "z (2 decimal places)", ab.z, "Put the pooled rate (as a proportion) in the SE formula, then divide the lift by the SE, using the same units for both.", false),
      ],
      `Rate A = ${fmt(ab.c1)} ÷ ${fmt(ab.n)} = ${roundTo((ab.c1 / ab.n) * 100, 3)}%, rate B = ${fmt(ab.c2)} ÷ ${fmt(ab.n)} = ${roundTo((ab.c2 / ab.n) * 100, 3)}%, lift **${sg(ab.d)}** points. Pooled rate = (${fmt(ab.c1)} + ${fmt(ab.c2)}) ÷ ${fmt(2 * ab.n)} = **${ab.k}%**. SE = √(${ab.k / 100} × ${roundTo(1 - ab.k / 100, 4)} × 2 ÷ ${fmt(ab.n)}) = ${ab.se} points, so z = ${sg(ab.d)} ÷ ${ab.se} = **${sg(ab.z)}**.`,
      "ds-ab", { tier, k: ab.k, n: ab.n, c1: ab.c1, c2: ab.c2 }, [["_nA", ab.n], ["_nB", ab.n], ["_cA", ab.c1], ["_cB", ab.c2]],
      ["Convert each count to a rate before subtracting.", "SE uses the pooled rate, not the two separate rates."],
    );
  }
  if (tier === "expert") {
    const m = rng.pick([1, 2, 3]);
    const sigYes = rng.next() < 0.5, bigYes = rng.next() < 0.5;
    const ab = drawAB(rng, (a) => (sigYes ? Math.abs(a.z) >= 2 : Math.abs(a.z) <= 1.75) && (bigYes ? a.d > m : a.d < m) && a.d !== m);
    const lo = ab.d - 1.96 * ab.se;
    const row = [sigYes ? "Yes" : "No", bigYes ? "Yes" : "No"];
    return finish(
      `A test compares a new version with the current one. ${abText(ab, who)} ${AB_RULE} A 95% interval for the lift is lift ± 1.96 × SE. The rule is to **ship** only if the lift is significant (|z| at least 1.96) **and** at least **${m} percentage point${m === 1 ? "" : "s"}**. Find the lift, z (2 decimal places) and the lower end of the 95% interval (percentage points, 2 decimal places), then say which of the two ship conditions hold.`,
      [
        numPart("lift", "Lift", "Lift (percentage points)", ab.d, `Rate B minus rate A, each as conversions ÷ ${fmt(ab.n)} visitors, in percentage points.`, false),
        numPart("z", "z statistic", "z (2 decimal places)", ab.z, "SE comes from the pooled rate; z is the lift divided by the SE in matching units.", false),
        numPart("ci-low", "Interval low end", "Lower end of the 95% interval (points, 2 decimal places)", r2(lo), "Lift minus 1.96 × SE, with SE in percentage points.", false),
        segPart(rng, "ship", "Ship conditions", "Which of the two ship conditions hold?", ["Significant", `Lift ≥ ${m}`], [["Yes", "No"], ["Yes", "No"]], row, `Compare |z| with 1.96, and the lift with ${m} point${m === 1 ? "" : "s"}; the two checks are independent.`),
      ],
      `Lift = ${sg(ab.c2 / ab.n * 100)}% − ${sg(ab.c1 / ab.n * 100)}% = **${sg(ab.d)}** points. Pooled rate ${ab.k}%, SE = ${ab.se} points, z = ${sg(ab.d)} ÷ ${ab.se} = **${sg(ab.z)}**. Lower end = ${sg(ab.d)} − 1.96 × ${ab.se} = **${sg(r2(lo))}**. |z| is ${Math.abs(ab.z) >= 1.96 ? "at least" : "below"} 1.96 (**${row[0]}**) and the lift is ${ab.d >= m ? "at least" : "below"} ${m} (**${row[1]}**), so ${row[0] === "Yes" && row[1] === "Yes" ? "ship it" : "do not ship"}.`,
      "ds-ab", { tier, k: ab.k, n: ab.n, c1: ab.c1, c2: ab.c2, m }, [["_nA", ab.n], ["_nB", ab.n], ["_cA", ab.c1], ["_cB", ab.c2], ["_min", m]],
      ["Rates, then the lift, then the SE from the pooled rate.", "The interval is built from the lift and the SE."],
    );
  }
  // expert-plus: plan the next test from the last one
  for (let t = 0; t < TRY; t++) {
    const k = rng.pick([5, 8, 10, 12, 15, 20, 25, 30]), m = rng.pick([1, 2, 3]);
    const nPrev = rng.pick([2000, 4000, 5000, 8000, 10000]);
    const per = (nPrev * k) / 100;
    const tshift = rng.int(1, Math.max(1, Math.floor(per * 0.15)));
    const c1 = per - tshift, c2 = per + tshift;
    if (!isInt(per) || c1 < 1) continue;
    // n = 15.68 p(1-p) / delta^2 with p = k/100, delta = m/100, in exact integer arithmetic (rounded up)
    const num = 392 * k * (100 - k), den = 25 * m * m;
    const n = Math.floor((num + den - 1) / den);
    const traffic = rng.pick([500, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000]);
    const days = Math.floor((2 * n + traffic - 1) / traffic);
    if (days < 3 || days > 25) continue;
    const feasible = rng.next() < 0.5;
    const D = feasible ? days + rng.int(1, 5) : days - rng.int(1, Math.min(5, days - 1));
    return finish(
      `The last test showed each version to **${fmt(nPrev)}** visitors: version A had **${fmt(c1)}** conversions and version B **${fmt(c2)}**. Plan the next test so it can detect a lift of **${m} percentage point${m === 1 ? "" : "s"}**. Use the pooled rate p̄ of the last test (as a proportion) and δ = ${m / 100}, and take the visitors per version as **n = 2 × (1.96 + 0.84)² × p̄ × (1 − p̄) ÷ δ²**, rounded **up** to a whole visitor. Both versions get n visitors, **${fmt(traffic)} visitors arrive each day** (split between the two versions), and days are whole (round up). Find the pooled rate (%), n per version, the days needed, and whether the test can finish within **${D} days**.`,
      [
        numPart("pooled", "Pooled rate", "Pooled rate of the last test (%)", k, "Add both conversion counts and divide by the visitors in both groups."),
        numPart("n", "Visitors per version", "Visitors per version n", n, "Put p̄ and δ in the formula as proportions, work it out, and round up."),
        numPart("days", "Days needed", "Days needed (whole days)", days, "Both versions together need 2n visitors; divide by the daily traffic and round up."),
        yesNo(rng, "feasible", "Fits?", `Can the test finish within ${D} days?`, days <= D, "Compare the days needed with the limit."),
      ],
      `Pooled rate = (${fmt(c1)} + ${fmt(c2)}) ÷ ${fmt(2 * nPrev)} = **${k}%**. n = 2 × 2.8² × ${k / 100} × ${roundTo(1 - k / 100, 4)} ÷ ${m / 100}² = ${roundTo(15.68 * (k / 100) * (1 - k / 100) / ((m / 100) ** 2), 3)}, rounded up to **${fmt(n)}** per version. Total visitors ${fmt(2 * n)}; ${fmt(2 * n)} ÷ ${fmt(traffic)} = ${(2 * n / traffic).toFixed(2)}, rounded up to **${days}** days, which ${days <= D ? "fits" : "does not fit"} ${D} days: **${days <= D ? "Yes" : "No"}**.`,
      "ds-plan", { k, m, nPrev, c1, c2, traffic, D }, [["_nPrev", nPrev], ["_cA", c1], ["_cB", c2], ["_delta", m / 100], ["_traffic", traffic]],
      ["The pooled rate comes from the last test's counts.", "Round n up first, then count total visitors."],
    );
  }
  return tooMany();
}

// =====================================================================
// regression-fit
// =====================================================================
const REG_CTX = [
  ["ad spend ($ thousand)", "sign-ups (hundreds)"],
  ["hours of study", "test score"],
  ["server load (hundreds of requests)", "response time (ms)"],
  ["temperature (°C)", "cold drinks sold (tens)"],
  ["training rows (thousands)", "error count"],
];
const REG_RULE = "Least-squares line ŷ = a + b·x with **b = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²)** and **a = (Σy − b·Σx) ÷ n**.";
const sums = (xs, ys) => ({ n: xs.length, sx: sum(xs), sy: sum(ys), sxy: sum(xs.map((x, i) => x * ys[i])), sxx: sum(xs.map((x) => x * x)) });
function drawReg(rng) {
  for (let t = 0; t < TRY; t++) {
    const n = rng.pick([4, 5, 5, 5]), step = rng.pick([1, 1, 2, 5, 10]), x0 = rng.pick([0, 1, 2, 5, 10, 20]);
    const xs = Array.from({ length: n }, (_, i) => x0 + i * step);
    const m = rng.pick([-3, -2, -1, 0.5, 1, 1.5, 2, 2.5, 3, 4]) / (step >= 5 ? step / 2 : 1), a0 = rng.int(10, 60);
    const ys = xs.map((x) => Math.round(a0 + m * x + rng.int(-4, 4)));
    if (ys.some((y) => y < 1)) continue;
    const s = sums(xs, ys);
    const Sxx = s.n * s.sxx - s.sx * s.sx, Sxy = s.n * s.sxy - s.sx * s.sy;
    const b = Sxy / Sxx, a = (s.sy - b * s.sx) / s.n;
    if (!ex2(b) || !ex2(a) || Math.abs(b) < 0.3 || ys.every((y) => y === ys[0])) continue;
    return { xs, ys, step, s, b: roundTo(b, 2), a: roundTo(a, 2) };
  }
  return tooMany();
}
const sumsText = (s) => `n = ${s.n}, Σx = ${s.sx}, Σy = ${s.sy}, Σxy = ${s.sxy}, Σx² = ${s.sxx}`;
const regGiven = (s) => [["_n", s.n], ["_sx", s.sx], ["_sy", s.sy], ["_sxy", s.sxy], ["_sxx", s.sxx]];
const regStep = (d) => `b = (${d.s.n}×${d.s.sxy} − ${d.s.sx}×${d.s.sy}) ÷ (${d.s.n}×${d.s.sxx} − ${d.s.sx}²) = ${d.s.n * d.s.sxy - d.s.sx * d.s.sy} ÷ ${d.s.n * d.s.sxx - d.s.sx * d.s.sx} = **${sg(d.b)}**. a = (${d.s.sy} − ${pn(d.b)}×${d.s.sx}) ÷ ${d.s.n} = **${sg(d.a)}**.`;
const bHint = "Work out the top and the bottom of the fraction separately first; the bottom is nΣx² minus (Σx)².";
const aHint = "Use the slope you found: the intercept is the mean of y minus b times the mean of x, written with the sums.";

function genRegression(rng, tier) {
  const [xn, yn] = rng.pick(REG_CTX);
  if (tier === "expert-plus") {
    const inside = rng.next() < 0.5;
    for (let t = 0; t < TRY; t++) {
      const d = drawReg(rng);
      const xmin = d.xs[0], xmax = d.xs[d.xs.length - 1];
      const xt = inside ? rng.int(xmin + 1, xmax - 1) : rng.next() < 0.6 ? xmax + rng.int(1, 3 * d.step) : Math.max(0, xmin - rng.int(1, Math.max(1, d.step))) ;
      if (!inside && xt >= xmin && xt <= xmax) continue;
      if (inside && (xt < xmin || xt > xmax)) continue;
      const Y = roundTo(d.a + d.b * xt, 2);
      if (Y < 1) continue;
      return finish(
        `A study of **${xn}** (x) against **${yn}** (y) gave **${d.s.n} pairs**, with x running from **${xmin}** to **${xmax}**. The sums were Σx = ${d.s.sx}, Σy = ${d.s.sy} and Σx² = ${d.s.sxx}, but Σxy was lost; the fitted slope was **b = ${sg(d.b)}**. ${REG_RULE} Find Σxy, then the intercept a, then the value of x at which the line predicts **y = ${Y}**. Rule: trust a prediction only for x **inside the range of the data** (${xmin} to ${xmax}): is that x inside it?`,
        [
          numPart("sxy", "Σxy", "The lost sum Σxy", d.s.sxy, "Rearrange the slope formula: nΣxy = b × (nΣx² − (Σx)²) + ΣxΣy, then divide by n."),
          numPart("a", "Intercept", "Intercept a (2 decimal places)", d.a, "Intercept = (Σy − b·Σx) ÷ n, with the slope you were given.", false),
          numPart("x", "x for the target", `x at which the line predicts y = ${Y}`, xt, "Solve y = a + b·x for x: subtract a, then divide by b."),
          yesNo(rng, "inside", "Inside the data?", `Is that x inside the data's range (${xmin} to ${xmax})?`, xt >= xmin && xt <= xmax, "Compare x with the two ends of the range."),
        ],
        `nΣx² − (Σx)² = ${d.s.n * d.s.sxx - d.s.sx * d.s.sx}, so nΣxy = ${sg(d.b)} × ${d.s.n * d.s.sxx - d.s.sx * d.s.sx} + ${d.s.sx} × ${d.s.sy} = ${d.s.n * d.s.sxy}, giving **Σxy = ${d.s.sxy}**. a = (${d.s.sy} − ${pn(d.b)} × ${d.s.sx}) ÷ ${d.s.n} = **${sg(d.a)}**. x = (${Y} − ${pn(d.a)}) ÷ ${sg(d.b)} = **${xt}**, which is ${xt >= xmin && xt <= xmax ? "inside" : "outside"} ${xmin} to ${xmax}: **${xt >= xmin && xt <= xmax ? "Yes" : "No"}**.`,
        "ds-reg-back", { tier, xs: d.xs, ys: d.ys, b: d.b, Y }, [["_n", d.s.n], ["_sx", d.s.sx], ["_sy", d.s.sy], ["_sxx", d.s.sxx], ["_b", d.b], ["_target", Y]],
        ["The slope formula can be turned round to give Σxy.", "A prediction outside the data is an extrapolation."],
      );
    }
    return tooMany();
  }
  const d = drawReg(rng);
  const given = regGiven(d.s);
  const head = `A study of **${xn}** (x) against **${yn}** (y) gave these sums: ${sumsText(d.s)}. ${REG_RULE}`;
  const baseParts = [numPart("slope", "Slope", "Slope b (2 decimal places)", d.b, bHint, false), numPart("intercept", "Intercept", "Intercept a (2 decimal places)", d.a, aHint, false)];
  const xmax = d.xs[d.xs.length - 1];
  if (tier === "medium") {
    return finish(`${head} Find the slope and the intercept.`, baseParts, regStep(d), "ds-reg", { tier, xs: d.xs, ys: d.ys }, given, ["Slope first, then the intercept.", bHint]);
  }
  if (tier === "hard") {
    const xp = xmax + d.step;
    const yp = roundTo(d.a + d.b * xp, 2);
    return finish(`${head} Find the slope, the intercept, and the value the line predicts at x = **${xp}**.`,
      [...baseParts, numPart("pred", "Prediction", `Predicted y at x = ${xp}`, yp, "Put x into ŷ = a + b·x with the slope and intercept you found.", false)],
      `${regStep(d)} ŷ(${xp}) = ${sg(d.a)} + ${pn(d.b)} × ${xp} = **${sg(yp)}**.`, "ds-reg", { tier, xs: d.xs, ys: d.ys, xp }, given.concat([["_x", xp]]),
      ["Slope, then intercept, then substitute.", "The prediction is a + b times the new x."]);
  }
  // expert: new observation, residual, anomaly rule
  const yes = rng.next() < 0.5;
  for (let t = 0; t < TRY; t++) {
    const xo = rng.int(d.xs[0], xmax), T = rng.int(3, 8);
    const pred = d.a + d.b * xo;
    const mag = yes ? T + rng.int(1, 8) : rng.int(0, T - 1) + rng.pick([0, 0.5]);
    const yo = Math.round(pred + mag * (rng.next() < 0.5 ? -1 : 1));
    const res = roundTo(yo - pred, 2);
    if (yo < 1 || Math.abs(Math.abs(res) - T) < 0.2 || (Math.abs(res) > T) !== yes) continue;
    return finish(
      `${head} A new observation arrives: x = **${xo}**, y = **${yo}**. The residual is observed y − predicted y. The point is flagged as an anomaly if |residual| is **more than ${T}**. Find the slope, the intercept, the residual (2 decimal places) and whether the point is flagged.`,
      [
        ...baseParts,
        numPart("residual", "Residual", "Residual (2 decimal places)", res, `Predict y at x = ${xo} with the fitted line, then subtract it from the observed value; keep the sign.`, false),
        yesNo(rng, "anomaly", "Flagged?", `Is the point flagged (|residual| more than ${T})?`, Math.abs(res) > T, "Compare the size of the residual, ignoring its sign, with the limit."),
      ],
      `${regStep(d)} Predicted y at ${xo} = ${sg(d.a)} + ${pn(d.b)} × ${xo} = ${sg(roundTo(pred, 2))}, so the residual = ${yo} − ${sg(roundTo(pred, 2))} = **${sg(res)}**. |residual| = ${Math.abs(res)} is ${Math.abs(res) > T ? "more" : "not more"} than ${T}: **${Math.abs(res) > T ? "Yes" : "No"}**.`,
      "ds-reg", { tier, xs: d.xs, ys: d.ys, xo, yo, T }, given.concat([["_xnew", xo], ["_ynew", yo], ["_limit", T]]),
      ["Fit the line first, then use it on the new x.", "A residual is how far the real point is from the line."],
    );
  }
  return tooMany();
}

// =====================================================================
export function generate({ subtopic, difficulty, rng }) {
  switch (subtopic) {
    case "classifier-scores": return genClassifier(rng, difficulty);
    case "model-training": return genTraining(rng, difficulty);
    case "experiment-test": return genExperiment(rng, difficulty);
    case "regression-fit": return genRegression(rng, difficulty);
    default: throw new Error(`unknown subtopic ${subtopic}`);
  }
}

// =====================================================================
// verify(): independent recomputation
// =====================================================================
const vCeilDiv = (a, b) => { let k = 0; while (k * b < a) k++; return k; };
// centred least squares from raw data
function vReg(xs, ys) {
  const n = xs.length, mx = sum(xs) / n, my = sum(ys) / n;
  const b = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map((x) => (x - mx) ** 2));
  return { b, a: my - b * mx };
}
const vGD = (w, a, eta, steps) => { for (let i = 0; i < steps; i++) w -= eta * 2 * (w - a); return w; };

function expected(p) {
  switch (p.kind) {
    case "ds-cls": {
      const { TP, FP, FN } = p.c;
      const P = TP / (TP + FP), R = TP / (TP + FN);
      const F = (2 * P * R) / (P + R);
      const out = { precision: r2(P), recall: r2(R) };
      if (p.tier === "medium") return out;
      out.f1 = r2(F);
      if (p.tier === "hard") return out;
      const B = p.B;
      const FB = (2 * B.P * B.R) / (B.P + B.R);
      let win;
      if (p.rule === "f1") win = F > FB ? "A" : "B";
      else {
        const cands = [["A", P, R], ["B", B.P, B.R]].filter((c) => c[1] >= p.X).sort((u, v) => v[2] - u[2]);
        win = cands.length ? cands[0][0] : null;
      }
      out.choice = win ? `Model ${win}` : null;
      return out;
    }
    case "ds-screen": {
      const pos = (p.N * p.k) / 100;
      const TP = pos * (p.s / 100), FP = (p.N - pos) * (1 - p.cs / 100);
      return { tp: roundTo(TP, 4), fp: roundTo(FP, 4), precision: r2(TP / (TP + FP)), act: TP / (TP + FP) >= p.X ? "Yes" : "No" };
    }
    case "ds-split": {
      const train = (p.N * p.r) / 100;
      const batches = vCeilDiv(train, p.B);
      const out = { train, batches };
      if (p.tier === "hard") out.steps = batches * p.E;
      return out;
    }
    case "ds-gd": {
      const w1 = vGD(p.w0, p.a, p.eta, 1), w2 = vGD(p.w0, p.a, p.eta, 2);
      return { grad: 2 * (p.w0 - p.a), w1: roundTo(w1, 4), w2: roundTo(w2, 4), lower: (w2 - p.a) ** 2 < (p.w0 - p.a) ** 2 ? "Yes" : "No" };
    }
    case "ds-gd-back": {
      const a = (p.w1 - p.w0 * (1 - 2 * p.eta)) / (2 * p.eta);
      const w2 = vGD(p.w1, a, p.eta, 1);
      let w = p.w0, k = 0;
      while (Math.abs(w - a) > p.eps && k < 500) { w = vGD(w, a, p.eta, 1); k++; }
      const far = vGD(p.w0, a, 2 * p.eta, 80);
      return { a: roundTo(a, 4), w2: roundTo(w2, 4), steps: k, double: Math.abs(far - a) < 1e-3 * Math.abs(p.w0 - a) ? "Yes" : "No" };
    }
    case "ds-z": {
      const z = (p.x - p.mu) / p.sd;
      return { z: r2(z), outlier: Math.abs(z) > p.cut ? "Yes" : "No" };
    }
    case "ds-ab": {
      const rA = p.c1 / p.n, rB = p.c2 / p.n, pool = (p.c1 + p.c2) / (p.n + p.n);
      const se = Math.sqrt(pool * (1 - pool) * (1 / p.n + 1 / p.n));
      const lift = (rB - rA) * 100, z = (rB - rA) / se;
      if (p.tier === "hard") return { lift: roundTo(lift, 4), pooled: roundTo(pool * 100, 4), z: r2(z) };
      return { lift: roundTo(lift, 4), z: r2(z), "ci-low": r2(lift - 1.96 * se * 100), ship: `${Math.abs(z) >= 1.96 ? "Yes" : "No"} | ${lift >= p.m ? "Yes" : "No"}` };
    }
    case "ds-plan": {
      const pool = (p.c1 + p.c2) / (2 * p.nPrev);
      const n = Math.ceil((2 * (1.96 + 0.84) ** 2 * pool * (1 - pool)) / (p.m / 100) ** 2 - 1e-6);
      const days = vCeilDiv(2 * n, p.traffic);
      return { pooled: roundTo(pool * 100, 4), n, days, feasible: days <= p.D ? "Yes" : "No" };
    }
    case "ds-reg": {
      const { a, b } = vReg(p.xs, p.ys);
      const out = { slope: r2(b), intercept: r2(a) };
      if (p.tier === "medium") return out;
      if (p.tier === "hard") { out.pred = r2(a + b * p.xp); return out; }
      const pred = a + b * p.xo;
      out.residual = r2(p.yo - pred);
      out.anomaly = Math.abs(p.yo - pred) > p.T ? "Yes" : "No";
      return out;
    }
    case "ds-reg-back": {
      const { a, b } = vReg(p.xs, p.ys);
      const x = (p.Y - a) / b;
      return { sxy: sum(p.xs.map((v, i) => v * p.ys[i])), a: r2(a), x: roundTo(x, 4), inside: x >= p.xs[0] - 1e-9 && x <= p.xs[p.xs.length - 1] + 1e-9 ? "Yes" : "No" };
    }
  }
  return null;
}

function sameItem(item, given, want) {
  if (want === null || want === undefined) return false;
  if (item.answerType === "number") return typeof given === "number" && typeof want === "number" && Number.isFinite(given) && close(given, want);
  if (item.answerType === "choice") {
    const opts = (item.choices || []).map((o) => (Array.isArray(o) ? o.join(" | ") : String(o)));
    if (opts.filter((o) => o === want).length !== 1) return false;
    return (Array.isArray(given) ? given.join(" | ") : String(given)) === want;
  }
  return false;
}

export function verify(question, answer) {
  try {
    const p = question.params;
    if (!p || !answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
    const want = expected(p);
    if (!want || question.parts.length !== Object.keys(want).length) return false;
    return question.parts.every((part) => sameItem(part, answer[part.id], want[part.id]));
  } catch {
    return false;
  }
}
