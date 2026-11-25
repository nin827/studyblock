// Algorithms generator. Uses only the seeded rng passed in by the engine.
// Language-neutral: lists are shown as [4, 9, 2, 7], indexes start at 0, and steps are plain English.
// List answers are always multiple choice (a typed list would depend on comma spacing).
//
// Algorithm variants (guide.md describes the same ones):
//   Linear search: compare items from index 0 rightwards; found at index i = i + 1 comparisons,
//     not in the list = n comparisons.
//   Binary search: lo = 0, hi = n - 1; while lo <= hi: mid = floor((lo + hi) / 2), compare the
//     target with list[mid] (one comparison); equal = found; smaller = hi = mid - 1; bigger = lo = mid + 1.
//   Bubble sort (ascending): pass p compares neighbours at indexes j, j+1 for j = 0 .. n-1-p, swapping
//     when the left is bigger. Every pass runs (no early exit; it doesn't change any answer asked here).
//   Insertion sort: pass p (1 .. n-1) takes the item at index p and slides it left past every bigger
//     item in the sorted part on its left. After pass p the first p+1 items are sorted.
//   Selection sort: pass p (1 .. n-1) finds the smallest item from index p-1 onwards and swaps it
//     into index p-1 (no swap if it is already there).
// Every list holds distinct values.

// ---------- helpers ----------

const fmt = (a) => `[${a.join(", ")}]`;
const code = (a) => "`" + fmt(a) + "`";
const asc = (a) => a.slice().sort((x, y) => x - y);
const ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ord = (k) => ORD[k - 1] || `${k}th`;

function distinct(rng, n, lo, hi) {
  const s = new Set();
  while (s.size < n) s.add(rng.int(lo, hi));
  return [...s];
}

// 4 list choices: the correct list + 3 distinct wrong lists from `candidates` (plausible mistakes),
// topped up with the correct list with one neighbouring pair swapped. null if impossible.
function listChoices(correct, candidates, rng) {
  const ans = fmt(correct);
  const seen = new Set([ans]);
  const out = [];
  const add = (a) => {
    if (!a || out.length >= 3) return;
    const s = fmt(a);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  rng.shuffle(candidates.filter(Boolean)).forEach(add);
  const start = rng.int(0, Math.max(0, correct.length - 2));
  for (let k = 0; out.length < 3 && k < correct.length - 1; k++) {
    const i = (start + k) % (correct.length - 1);
    const b = correct.slice();
    [b[i], b[i + 1]] = [b[i + 1], b[i]];
    add(b);
  }
  if (out.length < 3) return null;
  return { answer: ans, choices: rng.shuffle([ans, ...out]) };
}

// ---------- searching (generation side) ----------

function binaryTrace(a, t) {
  const steps = [];
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const v = a[mid];
    const res = v === t ? "found" : t < v ? "left" : "right";
    steps.push({ lo, hi, mid, v, res });
    if (res === "found") break;
    if (res === "left") hi = mid - 1;
    else lo = mid + 1;
  }
  return { steps, found: steps.length > 0 && steps[steps.length - 1].res === "found", lo, hi };
}

function stepLine(s, t, i) {
  const head = `Step ${i + 1}: lo = ${s.lo}, hi = ${s.hi}, mid = floor((${s.lo} + ${s.hi}) / 2) = ${s.mid}, which holds ${s.v}.`;
  if (s.res === "found") return `${head} That is ${t}: found.`;
  if (s.res === "left") return `${head} ${t} < ${s.v}, so keep the left part: hi = ${s.mid - 1}.`;
  return `${head} ${t} > ${s.v}, so keep the right part: lo = ${s.mid + 1}.`;
}

function sortedList(rng, n) {
  const a = [];
  let v = rng.int(1, 9);
  for (let i = 0; i < n; i++) {
    a.push(v);
    v += rng.int(2, 9);
  }
  return a;
}

// A value that is not in the sorted list `a` (between items, or just outside them).
function missingValue(rng, a) {
  for (let t = 0; t < 50; t++) {
    const v = rng.int(Math.max(1, a[0] - 3), a[a.length - 1] + 3);
    if (!a.includes(v)) return v;
  }
  return a[a.length - 1] + 1;
}

const BS_RULE =
  "Binary search keeps a range lo..hi (start: lo = 0, hi = last index). Each step looks at mid = floor((lo + hi) / 2): if the target is smaller, set hi = mid - 1; if bigger, set lo = mid + 1.";

function genSearching(difficulty, rng) {
  if (difficulty === "easy" || (difficulty === "medium" && rng.next() < 0.3)) {
    // Linear search.
    const n = difficulty === "easy" ? rng.int(6, 8) : rng.int(8, 10);
    const a = distinct(rng, n, 1, 60);
    const missing = rng.next() < (difficulty === "easy" ? 0.25 : 0.4);
    const intro = `Linear search checks the items one at a time from the start (index 0) until it finds the target.`;
    if (missing) {
      let t;
      do t = rng.int(1, 60); while (a.includes(t));
      return {
        prompt: `${intro}

List: ${code(a)}

How many comparisons does it make before it reports that ${t} is **not** in the list?`,
        answer: n,
        answerType: "number",
        tolerance: 0,
        explanation: `${t} is not in the list, so linear search compares it with every item before giving up.\n\nThe list has ${n} items, so it makes **${n}** comparisons.`,
        params: { kind: "linear-count", a, t },
        hints: [
          "Linear search can only stop early when it finds the target. Is the target anywhere in the list?",
          `${t} is not there, so every item gets compared once. Count the items in the list.`,
        ],
      };
    }
    const i = rng.int(1, n - 1);
    const t = a[i];
    const askIndex = difficulty === "easy" && rng.next() < 0.4;
    const before = a.slice(0, i);
    if (askIndex) {
      return {
        prompt: `${intro}

List: ${code(a)}

At which index does it find ${t}? Indexes start at 0.`,
        answer: i,
        answerType: "number",
        tolerance: 0,
        explanation: `Walk along the list counting from index 0:\n\n${a.slice(0, i + 1).map((v, k) => `- index ${k}: ${v}${k === i ? " ← found" : ""}`).join("\n")}\n\nSo it finds ${t} at index **${i}**.`,
        params: { kind: "linear-index", a, t },
        hints: [
          "The first item is at index 0, and each item after it is one index higher.",
          `Find ${t} in the list and count how many items come before it. That count is its index.`,
        ],
      };
    }
    return {
      prompt: `${intro}

List: ${code(a)}

How many comparisons does it make to find ${t}?`,
      answer: i + 1,
      answerType: "number",
      tolerance: 0,
      explanation: `Linear search compares ${t} with each item in turn:\n\n${a.slice(0, i + 1).map((v, k) => `- comparison ${k + 1}: ${v}${k === i ? " ← found" : ""}`).join("\n")}\n\nSo it makes **${i + 1}** comparisons (its index ${i}, plus 1).`,
      params: { kind: "linear-count", a, t },
      hints: [
        "Every item it looks at counts as one comparison, including the one that matches.",
        `It compares ${t} with ${before.join(", then ")} and none of these match. Count those, then add the comparison that finds ${t}.`,
      ],
    };
  }

  const roll = rng.next();
  // Max comparisons for n items.
  if (difficulty === "hard" && roll < 0.25) {
    const n = rng.pick([rng.int(10, 31), rng.int(33, 127), rng.int(129, 1000)]);
    let p = 1;
    let k = 0;
    while (p * 2 <= n) {
      p *= 2;
      k++;
    }
    return {
      prompt: `Binary search runs on a sorted list of ${n} distinct items. What is the **largest** number of comparisons it can ever need, whatever the target?`,
      answer: k + 1,
      answerType: "number",
      tolerance: 0,
      explanation: `Each comparison roughly halves the range, and the worst case is floor(log2 n) + 1 comparisons.\n\nThe largest power of 2 that is at most ${n} is ${p} = 2^${k}, so floor(log2 ${n}) = ${k}.\n\nWorst case: ${k} + 1 = **${k + 1}** comparisons.`,
      params: { kind: "binary-max", n },
      hints: [
        "In the worst case binary search keeps halving the range until one item is left, then compares that one too. The formula is floor(log2 n) + 1.",
        `Find the largest power of 2 that is not bigger than ${n}. Its exponent is floor(log2 ${n}).`,
        `That power is ${p} = 2^${k}. Now finish the formula.`,
      ],
    };
  }

  const n = difficulty === "medium" ? rng.int(7, 11) : rng.int(11, 16);
  const a = sortedList(rng, n);
  const missing = difficulty === "hard" && rng.next() < 0.45;

  let t, tr;
  for (let tries = 0; tries < 40; tries++) {
    t = missing ? missingValue(rng, a) : rng.pick(a);
    tr = binaryTrace(a, t);
    if (tr.steps.length >= (difficulty === "hard" ? 3 : 2)) break;
  }
  const len = tr.steps.length;
  const lines = tr.steps.map((s, i) => `- ${stepLine(s, t, i)}`);
  if (!tr.found) lines.push(`- Now lo = ${tr.lo} is bigger than hi = ${tr.hi}, so the range is empty: ${t} is not in the list.`);
  const prompt0 = `Binary search looks for ${t} in this sorted list. Indexes start at 0, and each step checks mid = floor((lo + hi) / 2).

List: ${code(a)}

`;

  // Value checked at step k.
  const stepQ = (k) => {
    const s = tr.steps[k - 1];
    const prev = tr.steps.slice(0, k - 1).map((x, i) => stepLine(x, t, i));
    return {
      prompt: `${prompt0}Which **value** does it compare ${t} with at step ${k}?`,
      answer: s.v,
      answerType: "number",
      tolerance: 0,
      explanation: `Trace the search:\n\n${lines.slice(0, k).join("\n")}\n\nSo step ${k} compares with **${s.v}**.`,
      params: { kind: "binary-step", a, t, k },
      hints: [BS_RULE, prev.join(" "), `Now lo = ${s.lo} and hi = ${s.hi}. Work out mid for step ${k} and read the item at that index.`],
    };
  };

  if (difficulty === "hard" && roll < 0.55 && len >= 3) {
    // Multi-part: value at step 2 + total comparisons.
    const s2 = tr.steps[1];
    const ask = tr.found ? `How many comparisons does it make in total to find ${t}?` : `How many comparisons does it make before it reports that ${t} is not in the list?`;
    return {
      prompt: `${prompt0}Answer both parts.`,
      answerType: "multi",
      parts: [
        {
          id: "step2",
          label: "Step 2",
          ask: `Which value does it compare ${t} with at step 2?`,
          answerType: "number",
          answer: s2.v,
          tolerance: 0,
          hint: `${stepLine(tr.steps[0], t, 0)} Now work out mid for the new range lo = ${s2.lo}, hi = ${s2.hi}.`,
        },
        {
          id: "count",
          label: "Comparisons",
          ask,
          answerType: "number",
          answer: len,
          tolerance: 0,
          hint: tr.found
            ? `Keep halving until the middle item is ${t}. Count every middle item you look at, including the one that matches.`
            : `Keep halving until lo is bigger than hi. Count every middle item you compare with; the empty range at the end costs nothing.`,
        },
      ],
      explanation: `Trace the search:\n\n${lines.join("\n")}\n\nStep 2 compares with **${s2.v}**, and the search makes **${len}** comparisons in total.`,
      params: { kind: "binary-multi", a, t },
      hints: [BS_RULE],
    };
  }

  if (roll < 0.5 && len >= 2) {
    const k = difficulty === "medium" ? rng.int(2, Math.min(3, len)) : rng.int(Math.min(3, len), Math.min(4, len));
    return stepQ(k);
  }

  const ask = tr.found ? `How many comparisons does it make to find ${t}?` : `How many comparisons does it make before it reports that ${t} is **not** in the list?`;
  return {
    prompt: `${prompt0}${ask}`,
    answer: len,
    answerType: "number",
    tolerance: 0,
    explanation: `Trace the search, counting one comparison per middle item:\n\n${lines.join("\n")}\n\nThat is **${len}** comparisons.`,
    params: { kind: "binary-count", a, t },
    hints: [
      BS_RULE,
      stepLine(tr.steps[0], t, 0),
      tr.found
        ? `Carry on from the new range until the middle item is ${t}, and count every middle item you compared with, including the match.`
        : `Carry on until lo is bigger than hi, and count every middle item you compared with.`,
    ],
  };
}

// ---------- sorting (generation side: classic in-place loops) ----------

function bubbleStates(a) {
  const states = [a.slice()];
  const swaps = [0];
  const b = a.slice();
  for (let p = 1; p < b.length; p++) {
    let s = 0;
    for (let j = 0; j < b.length - p; j++) {
      if (b[j] > b[j + 1]) {
        [b[j], b[j + 1]] = [b[j + 1], b[j]];
        s++;
      }
    }
    states.push(b.slice());
    swaps.push(s);
  }
  return { states, swaps };
}

function insertionStates(a) {
  const states = [a.slice()];
  const shifts = [0];
  const b = a.slice();
  for (let p = 1; p < b.length; p++) {
    const v = b[p];
    let j = p - 1;
    let s = 0;
    while (j >= 0 && b[j] > v) {
      b[j + 1] = b[j];
      j--;
      s++;
    }
    b[j + 1] = v;
    states.push(b.slice());
    shifts.push(s);
  }
  return { states, shifts };
}

function selectionStates(a) {
  const states = [a.slice()];
  const b = a.slice();
  for (let p = 1; p < b.length; p++) {
    const i = p - 1;
    let m = i;
    for (let j = i + 1; j < b.length; j++) if (b[j] < b[m]) m = j;
    if (m !== i) [b[i], b[m]] = [b[m], b[i]];
    states.push(b.slice());
  }
  return { states };
}

const ALGO_NAME = { bubble: "Bubble sort", insertion: "Insertion sort", selection: "Selection sort" };
const ALGO_RULE = {
  bubble:
    "Bubble sort: each pass goes left to right, comparing neighbours and swapping them when the left one is bigger. Each pass stops one place earlier than the last, because the biggest items have already bubbled to the end.",
  insertion:
    "Insertion sort: pass 1 takes the item at index 1 and slides it left past every bigger item; pass 2 does the same with the item at index 2, and so on. After pass k the first k + 1 items are in order.",
  selection:
    "Selection sort: pass 1 finds the smallest item and swaps it into index 0; pass 2 finds the smallest of the rest and swaps it into index 1, and so on.",
};

// Plain-English detail of one pass, for explanations.
function bubblePassLines(before, p) {
  const b = before.slice();
  const out = [];
  for (let j = 0; j < b.length - p; j++) {
    if (b[j] > b[j + 1]) {
      out.push(`${b[j]} > ${b[j + 1]}: swap`);
      [b[j], b[j + 1]] = [b[j + 1], b[j]];
    } else out.push(`${b[j]} < ${b[j + 1]}: no swap`);
  }
  return out;
}

function passDetail(algo, before, after, p) {
  if (algo === "bubble") return `Pass ${p}: ${bubblePassLines(before, p).join("; ")} → ${fmt(after)}`;
  if (algo === "insertion") {
    const v = before[p];
    const moved = before.slice(0, p).filter((x) => x > v);
    return `Pass ${p}: insert ${v}; ${moved.length ? `it slides left past ${moved.join(", ")}` : "nothing to its left is bigger, so it stays"} → ${fmt(after)}`;
  }
  const rest = before.slice(p - 1);
  const m = Math.min(...rest);
  return `Pass ${p}: the smallest of ${fmt(rest)} is ${m}; ${before[p - 1] === m ? "it is already at index " + (p - 1) : `swap it with ${before[p - 1]} at index ${p - 1}`} → ${fmt(after)}`;
}

function statesOf(algo, a) {
  if (algo === "bubble") return bubbleStates(a).states;
  if (algo === "insertion") return insertionStates(a).states;
  return selectionStates(a).states;
}

// "List after pass k" question data, or null if the pass changes nothing (retry).
function passListData(algo, a, k, rng) {
  const st = statesOf(algo, a);
  if (fmt(st[k]) === fmt(st[k - 1])) return null;
  const others = Object.keys(ALGO_NAME).filter((x) => x !== algo).map((x) => statesOf(x, a)[k]);
  const cands = [st[k - 1], st[k + 1], ...others, asc(a)];
  const ch = listChoices(st[k], cands, rng);
  if (!ch) return null;
  const lines = [];
  for (let p = 1; p <= k; p++) lines.push(`- ${passDetail(algo, st[p - 1], st[p], p)}`);
  return { st, ch, lines };
}

function passListHints(algo, st, k) {
  const h = [ALGO_RULE[algo]];
  if (k > 1) h.push(`After pass ${k - 1} the list is ${code(st[k - 1])}.`);
  if (algo === "bubble") h.push(`Pass ${k} compares neighbours from index 0 up to index ${st[0].length - k}. Work through each pair in turn.`);
  else if (algo === "insertion") h.push(`Pass ${k} takes the item at index ${k} (${st[k - 1][k]}) and slides it left past every bigger item before it.`);
  else h.push(`Pass ${k} finds the smallest item from index ${k - 1} onwards and swaps it into index ${k - 1}.`);
  return h;
}

function genSorting(difficulty, rng) {
  const n = difficulty === "easy" ? 5 : difficulty === "medium" ? 6 : 7;
  const roll = rng.next();
  for (let tries = 0; tries < 60; tries++) {
    const a = distinct(rng, n, 1, 50);
    if (fmt(a) === fmt(asc(a))) continue;

    // Bubble sort: swaps in one pass.
    if ((difficulty !== "hard" && roll < 0.3) || (difficulty === "hard" && roll < 0.15)) {
      const k = difficulty === "easy" ? 1 : difficulty === "medium" ? rng.int(1, 2) : rng.int(2, 3);
      const { states, swaps } = bubbleStates(a);
      if (swaps[k] === 0) continue;
      const pre = states[k - 1];
      return {
        prompt: `${ALGO_RULE.bubble}

Start: ${code(a)}

How many **swaps** happen in pass ${k}?`,
        answer: swaps[k],
        answerType: "number",
        tolerance: 0,
        explanation: `${k > 1 ? `First get the list ready for pass ${k}:\n\n${[...Array(k - 1)].map((_, i) => `- ${passDetail("bubble", states[i], states[i + 1], i + 1)}`).join("\n")}\n\nNow pass ${k}, starting from ${code(pre)}:` : `Pass 1, starting from ${code(pre)}:`}\n\n${bubblePassLines(pre, k).map((l) => `- ${l}`).join("\n")}\n\nThat is **${swaps[k]}** swaps.`,
        params: { kind: "bubble-swaps", a, k },
        hints: [
          ALGO_RULE.bubble,
          ...(k > 1 ? [`Before pass ${k} the list is ${code(pre)}.`] : []),
          `${k === 1 ? "Pass 1 compares every neighbouring pair, from the first two items to the last two." : `Pass ${k} compares neighbouring pairs from the start, leaving out the items earlier passes already moved to the end.`} Each swap changes the list before the next comparison, so keep the list updated as you count the swaps.`,
        ],
      };
    }

    // Bubble sort: total swaps (hard).
    if (difficulty === "hard" && roll < 0.35) {
      const { swaps } = bubbleStates(a);
      const total = swaps.reduce((s, x) => s + x, 0);
      if (total < 4) continue;
      return {
        prompt: `${ALGO_RULE.bubble}

Start: ${code(a)}

How many swaps does bubble sort make **in total** to sort this list into ascending order?`,
        answer: total,
        answerType: "number",
        tolerance: 0,
        explanation: `Each bubble-sort swap fixes exactly one pair of items that are in the wrong order (an *inversion*), so the total number of swaps equals the number of inversions.\n\n${a.map((x, i) => {
          const c = a.slice(i + 1).filter((y) => y < x);
          return `- ${x} is before ${c.length ? `${c.join(", ")} (smaller)` : "nothing smaller"}: ${c.length}`;
        }).join("\n")}\n\nTotal: **${total}** swaps. (Passes: ${swaps.slice(1).join(" + ")}.)`,
        params: { kind: "bubble-total", a },
        hints: [
          "Every swap in bubble sort puts one out-of-order pair right, so the total number of swaps equals the number of pairs (bigger before smaller) in the starting list.",
          `For each item, count how many smaller items come after it. For example, ${a[0]} has ${a.slice(1).filter((y) => y < a[0]).length} smaller item(s) after it.`,
          "Do the same for every other item in the list, then add all the counts.",
        ],
      };
    }

    // Multi-part (hard): list after pass k + swaps/shifts in that pass.
    if (difficulty === "hard" && roll < 0.65) {
      const algo = rng.pick(["bubble", "insertion"]);
      const k = rng.int(2, 3);
      const d = passListData(algo, a, k, rng);
      if (!d) continue;
      const cnt = algo === "bubble" ? bubbleStates(a).swaps[k] : insertionStates(a).shifts[k];
      const pre = d.st[k - 1];
      const unit = algo === "bubble" ? "swaps" : "items that slide one place right";
      return {
        prompt: `${ALGO_RULE[algo]}

Start: ${code(a)}

Answer both parts about pass ${k}.`,
        answerType: "multi",
        parts: [
          {
            id: "list",
            label: "List",
            ask: `What is the list after pass ${k}?`,
            answerType: "choice",
            answer: d.ch.answer,
            choices: d.ch.choices,
            hint: `Before pass ${k} the list is ${code(pre)}. ${passListHints(algo, d.st, k).slice(-1)[0]}`,
          },
          {
            id: "count",
            label: algo === "bubble" ? "Swaps" : "Shifts",
            ask: algo === "bubble" ? `How many swaps happen in pass ${k}?` : `In pass ${k}, how many items slide one place to the right to make room?`,
            answerType: "number",
            answer: cnt,
            tolerance: 0,
            hint:
              algo === "bubble"
                ? `Count the neighbour pairs in pass ${k} where the left one is bigger at the moment you compare them.`
                : `Count the items before index ${k} in ${code(pre)} that are bigger than ${pre[k]}.`,
          },
        ],
        explanation: `Trace ${ALGO_NAME[algo].toLowerCase()} pass by pass:\n\n${d.lines.join("\n")}\n\nAfter pass ${k}: **${d.ch.answer}**, with **${cnt}** ${unit} in that pass.`,
        params: { kind: "sort-multi", algo, a, k },
        hints: [ALGO_RULE[algo], ...(k > 1 ? [`After pass ${k - 1} the list is ${code(pre)}.`] : [])],
      };
    }

    // List after pass k (choice).
    let algo, k;
    if (difficulty === "easy") {
      algo = rng.pick(["bubble", "selection", "insertion"]);
      k = algo === "insertion" ? 2 : 1;
    } else if (difficulty === "medium") {
      algo = rng.pick(["bubble", "selection", "insertion"]);
      k = algo === "insertion" ? rng.int(2, 3) : 2;
    } else {
      algo = rng.pick(["bubble", "selection", "insertion"]);
      k = algo === "insertion" ? rng.int(3, 4) : 3;
    }
    const d = passListData(algo, a, k, rng);
    if (!d) continue;
    return {
      prompt: `${ALGO_RULE[algo]}

Start: ${code(a)}

What is the list after pass ${k}?`,
      answer: d.ch.answer,
      answerType: "choice",
      choices: d.ch.choices,
      explanation: `Trace ${ALGO_NAME[algo].toLowerCase()} pass by pass:\n\n${d.lines.join("\n")}\n\nSo after pass ${k} the list is **${d.ch.answer}**.`,
      params: { kind: "sort-pass", algo, a, k },
      hints: passListHints(algo, d.st, k),
    };
  }
  throw new Error("could not build a sorting question");
}

// ---------- complexity ----------

const BIGO = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(n³)"];

// 3 plausible wrong Big-O options: the nearest classes on either side.
function bigoChoices(answer, rng) {
  const i = BIGO.indexOf(answer);
  const near = BIGO.map((b, j) => ({ b, d: Math.abs(j - i) + rng.next() * 0.5 })).filter((x) => x.b !== answer);
  near.sort((x, y) => x.d - y.d);
  return rng.shuffle([answer, ...near.slice(0, 3).map((x) => x.b)]);
}

// Algorithm facts (easy). Each id has an independent check table in verify.
const FACTS = [
  { id: "index", text: "Reading the item at a given index of an array of n items", o: "O(1)", why: "The position is computed directly, so it takes the same time however long the array is." },
  { id: "push", text: "Pushing one item onto a stack that already holds n items", o: "O(1)", why: "It only touches the top of the stack, whatever its size." },
  { id: "swapEnds", text: "Swapping the first and last items of an array of n items", o: "O(1)", why: "It touches exactly two positions, however long the array is." },
  { id: "linear", text: "Linear search through an unsorted list of n items, in the worst case", o: "O(n)", why: "In the worst case it compares the target with every one of the n items." },
  { id: "max", text: "Finding the largest value in an unsorted list of n items", o: "O(n)", why: "Every item must be looked at once, and once is enough." },
  { id: "sum", text: "Adding up all n items in a list", o: "O(n)", why: "One pass over the list, one addition per item." },
  { id: "binary", text: "Binary search on a sorted list of n items, in the worst case", o: "O(log n)", why: "Each comparison halves the range, so it needs about log2 n steps." },
  { id: "bubble", text: "Bubble sort on n items, in the worst case", o: "O(n²)", why: "About n passes, each comparing up to n neighbours." },
  { id: "selection", text: "Selection sort on n items", o: "O(n²)", why: "Each of about n passes scans the rest of the list to find the smallest." },
  { id: "insertion", text: "Insertion sort on n items, in the worst case (list in reverse order)", o: "O(n²)", why: "Each new item can slide past every item before it: 1 + 2 + … + (n - 1) moves." },
  { id: "pairs", text: "Comparing every item in a list of n items with every other item", o: "O(n²)", why: "There are n(n - 1)/2 pairs, which grows like n²." },
  { id: "merge", text: "Merge sort on n items", o: "O(n log n)", why: "About log2 n levels of splitting, and each level does about n work to merge." },
  { id: "triples", text: "Checking every group of three items (every i, j, k) in a list of n items", o: "O(n³)", why: "Three nested choices of n items each: about n × n × n combinations." },
];

// Loop shapes in plain English. count(n) is the generation formula; verify simulates the loops.
const LOOPS = [
  { id: "single", gen: (c) => "The statement runs once per value of i: n times.", o: "O(n)", text: () => "A loop runs i from 1 to n, and the statement runs once each time round.", count: (n) => n, why: (n) => `The statement runs once for each i: ${n} times.` },
  { id: "nested", gen: (c) => "n values of i, each with n values of j: n × n = n² runs.", o: "O(n²)", text: () => "A loop runs i from 1 to n. Inside it, a second loop runs j from 1 to n, and the statement is inside that.", count: (n) => n * n, why: (n) => `${n} values of i, each with ${n} values of j: ${n} × ${n} = ${n * n}.` },
  { id: "triangle", gen: (c) => "The inner loop runs 1, 2, …, n times: 1 + 2 + … + n = n(n + 1)/2 runs, which is about n²/2.", o: "O(n²)", text: () => "A loop runs i from 1 to n. Inside it, a second loop runs j from 1 to i (not n), and the statement is inside that.", count: (n) => (n * (n + 1)) / 2, why: (n) => `The inner loop runs 1, 2, …, ${n} times: 1 + 2 + … + ${n} = ${n} × ${n + 1} / 2 = ${(n * (n + 1)) / 2}. That is about n²/2, which is still O(n²).` },
  { id: "doubling", gen: (c) => "i goes 1, 2, 4, 8, … so the loop runs about log2 n + 1 times.", o: "O(log n)", text: () => "i starts at 1. While i ≤ n, the statement runs and then i doubles.", count: (n) => Math.floor(Math.log2(n) + 1e-9) + 1, why: (n) => `i takes the values ${powersUpTo(n).join(", ")}: ${powersUpTo(n).length} values.` },
  { id: "halving", gen: (c) => "i goes n, n/2, n/4, … down to 1, so the loop runs about log2 n + 1 times.", o: "O(log n)", text: () => "i starts at n. While i ≥ 1, the statement runs and then i is halved, rounding down.", count: (n) => Math.floor(Math.log2(n) + 1e-9) + 1, why: (n) => `i takes the values ${halvings(n).join(", ")}: ${halvings(n).length} values.` },
  { id: "nlogn", gen: (c) => "For each of the n values of i, the doubling j loop runs about log2 n + 1 times: about n × log2 n runs.", o: "O(n log n)", text: () => "A loop runs i from 1 to n. Inside it, j starts at 1 and doubles while j ≤ n, and the statement runs once for each value of j.", count: (n) => n * (Math.floor(Math.log2(n) + 1e-9) + 1), why: (n) => `For each of the ${n} values of i, j takes ${powersUpTo(n).length} values (${powersUpTo(n).join(", ")}): ${n} × ${powersUpTo(n).length} = ${n * powersUpTo(n).length}.` },
  { id: "sequence", gen: (c) => "The loops run one after the other, not nested: n + n = 2n runs. Constant factors are dropped.", o: "O(n)", text: () => "One loop runs i from 1 to n with the statement inside. After it finishes, a separate loop runs j from 1 to n with the statement inside.", count: (n) => 2 * n, why: (n) => `The loops run one after the other, not nested: ${n} + ${n} = ${2 * n}. Doubling the work is still O(n).` },
  { id: "fixed", gen: (c) => `The loop always runs ${c} times; n never appears in it.`, o: "O(1)", text: (c) => `A loop runs i from 1 to ${c}, whatever n is, with the statement inside.`, count: (n, c) => c, why: (n, c) => `The loop always runs ${c} times; n never appears in it, so it is O(1).` },
  { id: "fixedInner", gen: (c) => `The outer loop runs n times and the inner loop always ${c} times: ${c}n runs. The fixed ${c} is a constant factor.`, o: "O(n)", text: (c) => `A loop runs i from 1 to n. Inside it, a loop runs j from 1 to ${c} (always ${c}), and the statement is inside that.`, count: (n, c) => c * n, why: (n, c) => `${n} values of i, each with ${c} values of j: ${n} × ${c} = ${c * n}. The fixed ${c} is a constant, so it is O(n).` },
  { id: "triple", gen: (c) => "n × n × n = n³ runs.", o: "O(n³)", text: () => "Three loops are nested: i, j and k each run from 1 to n, and the statement is inside the innermost one.", count: (n) => n * n * n, why: (n) => `${n} × ${n} × ${n} = ${n * n * n}.` },
];

function powersUpTo(n) {
  const out = [];
  for (let p = 1; p <= n; p *= 2) out.push(p);
  return out;
}
function halvings(n) {
  const out = [];
  for (let i = n; i >= 1; i = Math.floor(i / 2)) out.push(i);
  return out;
}

function loopN(loop, rng, difficulty) {
  switch (loop.id) {
    case "single":
    case "sequence":
      return rng.int(5, 40);
    case "nested":
    case "triangle":
      return difficulty === "hard" ? rng.int(8, 20) : rng.int(3, 10);
    case "triple":
      return rng.int(2, difficulty === "hard" ? 7 : 5);
    case "doubling":
    case "halving":
      return rng.int(10, difficulty === "hard" ? 1000 : 64);
    case "nlogn":
      return rng.int(3, difficulty === "hard" ? 20 : 10);
    default:
      return rng.int(4, 30);
  }
}

function loopHints(loop, n, c) {
  const base = "Ask how the number of repeats changes as n grows: does n appear in each loop's limit, and are the loops nested or one after the other?";
  switch (loop.id) {
    case "single":
      return ["The statement runs once each time the loop goes round.", `i goes 1, 2, 3, … up to n = ${n}. How many values is that?`];
    case "nested":
      return [base, `For each value of i, the inner loop runs once for every j from 1 to ${n}. Multiply the number of i values by the number of j values.`];
    case "triangle":
      return [base, `When i = 1 the inner loop runs once, when i = 2 twice, and so on up to i = ${n}.`, `Add 1 + 2 + … + ${n}. The shortcut is n × (n + 1) / 2.`];
    case "doubling":
      return ["i goes 1, 2, 4, … doubling each time, and stops once it is bigger than n.", `List the powers of 2 that are at most ${n}, starting from 1, and count them.`];
    case "halving":
      return ["i is halved (rounding down) each time and the loop stops once i reaches 0.", `Start at ${n} and keep halving: ${n}, ${Math.floor(n / 2)}, … Write the values down until you reach 1, then count them.`];
    case "nlogn":
      return [base, `For one value of i, count the values of j: the powers of 2 from 1 up to ${n}.`, `Then multiply that count by the ${n} values of i.`];
    case "sequence":
      return ["The two loops are not nested: the second starts only after the first has finished.", `Each loop runs once per value from 1 to ${n}. Add the two counts.`];
    case "fixed":
      return [`Read the loop's limit: is it n, or a fixed number?`, `The loop always runs from 1 to ${c}. Count those values.`];
    case "fixedInner":
      return [base, `The outer loop runs ${n} times, and each time the inner loop runs ${c} times. Multiply.`];
    default:
      return [base, `Each of the three loops runs ${n} times, and they are nested. Multiply the three counts.`];
  }
}

const SCALE_FN = {
  "O(1)": { label: "constant: it doesn't depend on n" },
  "O(n)": { label: "proportional to n" },
  "O(n²)": { label: "proportional to n²" },
  "O(n³)": { label: "proportional to n³" },
  "O(log n)": { label: "proportional to log n (base 2)" },
  "O(n log n)": { label: "proportional to n × log n (base 2)" },
};
const POW = { "O(1)": 0, "O(n)": 1, "O(n²)": 2, "O(n³)": 3 };

function genComplexity(difficulty, rng) {
  const roll = rng.next();

  if (difficulty === "easy" && roll < 0.35) {
    const f = rng.pick(FACTS);
    return {
      prompt: `What is the time complexity (Big-O) of this? ${f.text}.`,
      answer: f.o,
      answerType: "choice",
      choices: bigoChoices(f.o, rng),
      explanation: `${f.why}\n\nSo it is **${f.o}**.`,
      params: { kind: "fact", id: f.id },
      hints: [
        "Think about how the work grows when the list gets bigger. Does it stay the same, add one step each time n doubles, grow in step with n, or grow with every pair of items?",
        "Match the pattern: the same work whatever n is → constant; halving the range each step → logarithmic; one look at each item → linear; splitting in halves and merging → n log n; every pair of items → quadratic; every group of three → cubic.",
      ],
    };
  }

  // Growth factor when n is multiplied by m (easy: doubling; medium: x2 or x3).
  if ((difficulty === "easy" && roll < 0.55) || (difficulty === "medium" && roll < 0.3)) {
    const o = rng.pick(["O(1)", "O(n)", "O(n²)", "O(n³)"]);
    const m = difficulty === "easy" ? rng.pick([2, 3]) : rng.pick([2, 3, 10]);
    const ans = m ** POW[o];
    const word = m === 2 ? "doubles (is multiplied by 2)" : m === 3 ? "triples (is multiplied by 3)" : "is multiplied by 10";
    return {
      prompt: `An algorithm is ${o}: its running time is ${SCALE_FN[o].label}. When n ${word}, the new running time is how many times the old one? Assume the time follows the formula exactly.`,
      answer: ans,
      answerType: "number",
      tolerance: 0,
      explanation: `n is multiplied by ${m}. ${o === "O(1)" ? `The time doesn't depend on n, so the new time is the same as the old one: **1** times it.` : `For ${o} the time is multiplied by ${m}${POW[o] > 1 ? `^${POW[o]}` : ""} = **${ans}**.`}`,
      params: { kind: "factor", o, m },
      hints: [
        `Write the time as a formula in n, then replace n with ${m} × n.`,
        o === "O(1)" ? "A constant time has no n in it at all." : `For ${o}, multiplying n by ${m} multiplies the time by ${m} raised to the power of n's exponent (${POW[o]}).`,
      ],
    };
  }

  // Scaling a measured time (hard).
  if (difficulty === "hard" && roll < 0.35) {
    const o = rng.pick(["O(n)", "O(n²)", "O(n³)", "O(log n)", "O(n log n)"]);
    let n1, n2, T, ans, steps, hints;
    if (POW[o] !== undefined) {
      n1 = rng.pick([100, 200, 250, 500, 1000, 2000]);
      const m = o === "O(n³)" ? rng.int(2, 3) : rng.int(2, 5);
      n2 = n1 * m;
      T = rng.int(2, 9);
      ans = T * m ** POW[o];
      steps = `n grows from ${n1} to ${n2}, a factor of ${n2} / ${n1} = ${m}.\n\nFor ${o} the time grows by ${m}${POW[o] > 1 ? `^${POW[o]} = ${m ** POW[o]}` : ""}.\n\n${T} × ${m ** POW[o]} = **${ans}** seconds.`;
      hints = [`Work out how many times bigger the new n is: ${n2} / ${n1}.`, `For ${o}, raise that factor to the power ${POW[o]}, then multiply the ${T} seconds by the result.`];
    } else {
      const a = rng.int(8, 12);
      const b = o === "O(log n)" ? rng.pick([a + rng.int(2, 6), 2 * a]) : a + rng.int(1, 2);
      n1 = 2 ** a;
      n2 = 2 ** b;
      if (o === "O(log n)") {
        const c = rng.int(2, 5);
        T = c * a;
        ans = c * b;
        steps = `log2 ${n1} = ${a} and log2 ${n2} = ${b}, so the time grows by ${b} / ${a}.\n\n${T} × ${b} / ${a} = **${ans}** seconds.`;
        hints = [`Find log2 of each size: ${n1} = 2^${a} and ${n2} = 2^${b}.`, `The time grows by the ratio of those logs. Multiply the ${T} seconds by that ratio.`];
      } else {
        const c = rng.int(2, 4);
        T = c * a;
        ans = (T * (n2 * b)) / (n1 * a);
        steps = `n log2 n is ${n1} × ${a} at the start and ${n2} × ${b} at the end, so the time grows by (${n2} × ${b}) / (${n1} × ${a}) = ${2 ** (b - a)} × ${b} / ${a}.\n\n${T} × ${2 ** (b - a)} × ${b} / ${a} = **${ans}** seconds.`;
        hints = [`Work out n × log2 n for both sizes: ${n1} = 2^${a} and ${n2} = 2^${b}.`, `The time grows by (${n2} × ${b}) / (${n1} × ${a}). Simplify that ratio, then multiply the ${T} seconds by it.`];
      }
    }
    return {
      prompt: `An algorithm's running time is ${SCALE_FN[o].label} (${o}). It takes ${T} seconds when n = ${n1}. How many seconds should it take when n = ${n2}? Assume the time follows the formula exactly.`,
      answer: ans,
      answerType: "number",
      tolerance: 0,
      explanation: steps,
      params: { kind: "scale", o, n1, n2, T },
      hints,
    };
  }

  // Loop structures: Big-O (choice), count for a given n (number), or both (hard multi-part).
  const pool = difficulty === "easy" ? LOOPS.filter((l) => ["single", "nested", "fixed", "sequence"].includes(l.id)) : LOOPS;
  const loop = rng.pick(pool);
  const c = rng.pick([10, 20, 50, 100]);
  const n = loopN(loop, rng, difficulty);
  const desc = loop.text(c);
  const cnt = loop.count(n, c);
  const choices = bigoChoices(loop.o, rng);
  const why = loop.why(n, c);
  const growth = {
    "O(1)": "The count never depends on n",
    "O(log n)": "Doubling n adds only one more repeat",
    "O(n)": "Doubling n doubles the count",
    "O(n log n)": "n repeats of a log n inner loop",
    "O(n²)": "Doubling n multiplies the count by about 4",
    "O(n³)": "Doubling n multiplies the count by 8",
  }[loop.o];

  if (difficulty === "hard" && roll < 0.7) {
    const h = loopHints(loop, n, c);
    return {
      prompt: `${desc} Answer both parts.`,
      answerType: "multi",
      parts: [
        { id: "count", label: "Count", ask: `How many times does the statement run when n = ${n}?`, answerType: "number", answer: cnt, tolerance: 0, hint: h[h.length - 1] },
        { id: "bigo", label: "Big-O", ask: "What is the time complexity?", answerType: "choice", answer: loop.o, choices, hint: h[0] },
      ],
      explanation: `${why}\n\n${growth}, so it is **${loop.o}**. With n = ${n} the statement runs **${cnt}** times.`,
      params: { kind: "loop-multi", loop: loop.id, n, c },
      hints: [h[0]],
    };
  }

  if ((difficulty === "easy" && roll < 0.8) || (difficulty !== "easy" && roll < 0.65)) {
    return {
      prompt: `${desc} How many times does the statement run when n = ${n}?`,
      answer: cnt,
      answerType: "number",
      tolerance: 0,
      explanation: `${why}\n\nSo it runs **${cnt}** times.`,
      params: { kind: "loop-count", loop: loop.id, n, c },
      hints: loopHints(loop, n, c),
    };
  }
  return {
    prompt: `${desc} What is the time complexity (Big-O) in terms of n?`,
    answer: loop.o,
    answerType: "choice",
    choices,
    explanation: `${loop.gen(c)}

${growth}, so it is **${loop.o}**.`,
    params: { kind: "loop-bigo", loop: loop.id, c },
    hints: [
      "Ask how the number of repeats changes as n grows: does n appear in each loop's limit, and are the loops nested or one after the other?",
      "Imagine n doubles. Does the count stay the same, go up by one, double, or go up four times?",
    ],
  };
}

// ---------- stacks and queues ----------

function makeOps(rng, kind, count, minRemovals) {
  for (let tries = 0; tries < 100; tries++) {
    const ops = [];
    const vals = distinct(rng, count, 1, 99);
    let size = 0;
    let vi = 0;
    let removals = 0;
    for (let i = 0; i < count; i++) {
      const remove = size > 0 && rng.next() < 0.42;
      if (remove) {
        ops.push({ op: "remove" });
        size--;
        removals++;
      } else {
        ops.push({ op: "add", v: vals[vi++] });
        size++;
      }
    }
    if (removals >= minRemovals && size >= 1) return ops;
  }
  return null;
}

// Generation-side simulation (array push/pop or push/shift).
function runOps(kind, ops) {
  const s = [];
  const removed = [];
  const states = [];
  for (const o of ops) {
    if (o.op === "add") s.push(o.v);
    else removed.push(kind === "stack" ? s.pop() : s.shift());
    states.push(s.slice());
  }
  return { final: s, removed, states };
}

const opText = (kind, o) => (o.op === "add" ? `${kind === "stack" ? "push" : "enqueue"} ${o.v}` : kind === "stack" ? "pop" : "dequeue");
const opsText = (kind, ops) => ops.map((o) => opText(kind, o)).join(", ");
const DS_RULE = {
  stack: "A stack is last in, first out: push puts an item on top, and pop removes the item on top (the newest).",
  queue: "A queue is first in, first out: enqueue adds an item at the back, and dequeue removes the item at the front (the oldest).",
};
const ORDER = { stack: "bottom to top", queue: "front to back" };

function traceLines(kind, ops, states, removed) {
  let r = 0;
  return ops.map((o, i) => `- \`${opText(kind, o)}\`${o.op === "remove" ? ` returns ${removed[r++]}` : ""} → ${fmt(states[i])}`);
}

function genStructures(difficulty, rng) {
  const kind = rng.pick(["stack", "queue"]);
  const count = difficulty === "easy" ? rng.int(4, 6) : difficulty === "medium" ? rng.int(6, 8) : rng.int(8, 11);
  const roll = rng.next();
  const ops = makeOps(rng, kind, count, difficulty === "easy" ? 1 : 2);
  if (!ops) throw new Error("could not build operations");
  const { final, removed, states } = runOps(kind, ops);
  const rem = kind === "stack" ? "pop" : "dequeue";
  const end = kind === "stack" ? "top" : "front";
  const intro = `An empty ${kind} runs these operations in order:

${opsText(kind, ops)}

`;
  const lines = traceLines(kind, ops, states, removed);
  const legend = `Lists show the ${kind} from ${ORDER[kind]}.`;
  let half = Math.floor(ops.length / 2);
  while (half > 1 && fmt(states[half - 1]) === fmt(final)) half--;
  const midHint = `After the first ${half} operations the ${kind} is ${code(states[half - 1])} (${ORDER[kind]}).`;
  const endVal = kind === "stack" ? final[final.length - 1] : final[0];

  // Hard multi-part: last removed value + size + top/front.
  if (difficulty === "hard" && roll < 0.4) {
    return {
      prompt: `${intro}Answer all three parts.`,
      answerType: "multi",
      parts: [
        { id: "last", label: "Last removed", ask: `What value does the last ${rem} return?`, answerType: "number", answer: removed[removed.length - 1], tolerance: 0, hint: `Find the last ${rem} in the list and work out what is at the ${end} just before it.` },
        { id: "size", label: "Size", ask: `How many items are in the ${kind} at the end?`, answerType: "number", answer: final.length, tolerance: 0, hint: `Every ${kind === "stack" ? "push" : "enqueue"} adds one item and every ${rem} removes one. Count each kind of operation.` },
        { id: "end", label: kind === "stack" ? "Top" : "Front", ask: `Which value is at the ${end} at the end?`, answerType: "number", answer: endVal, tolerance: 0, hint: `${midHint} Carry on with the remaining operations.` },
      ],
      explanation: `${DS_RULE[kind]} ${legend}\n\n${lines.join("\n")}\n\nThe last ${rem} returns **${removed[removed.length - 1]}**, the ${kind} ends with **${final.length}** items, and **${endVal}** is at the ${end}.`,
      params: { kind: "ds-multi", ds: kind, ops },
      hints: [DS_RULE[kind]],
    };
  }

  // Final contents (choice).
  const wantFinal = (difficulty === "medium" && roll < 0.35) || (difficulty === "hard" && roll < 0.65);
  if (wantFinal && final.length >= 2) {
    const other = runOps(kind === "stack" ? "queue" : "stack", ops).final;
    const before = states[states.length - 2];
    const cands = [other, final.slice().reverse(), before, kind === "stack" ? other.slice().reverse() : null];
    const ch = listChoices(final, cands, rng);
    if (ch) {
      return {
        prompt: `${intro}What does the ${kind} hold at the end, listed from ${ORDER[kind]}?`,
        answer: ch.answer,
        answerType: "choice",
        choices: ch.choices,
        explanation: `${DS_RULE[kind]} ${legend}\n\n${lines.join("\n")}\n\nAt the end it holds **${ch.answer}**.`,
        params: { kind: "ds-final", ds: kind, ops },
        hints: [DS_RULE[kind], midHint, "Carry on with the remaining operations, writing the contents down after each one."],
      };
    }
  }

  // Value returned by the r-th removal.
  if ((difficulty === "easy" && roll < 0.5) || (difficulty === "medium" && roll < 0.7) || (difficulty === "hard" && roll < 0.8)) {
    const r = rng.int(1, removed.length);
    const idx = ops.map((o, i) => (o.op === "remove" ? i : -1)).filter((i) => i >= 0)[r - 1];
    const which = removed.length === 1 ? `the ${rem}` : `the ${ord(r)} ${rem}`;
    const before = idx > 0 ? states[idx - 1] : [];
    return {
      prompt: `${intro}What value does ${which} return?`,
      answer: removed[r - 1],
      answerType: "number",
      tolerance: 0,
      explanation: `${DS_RULE[kind]} ${legend}\n\n${lines.slice(0, idx + 1).join("\n")}\n\nSo ${which} returns **${removed[r - 1]}**.`,
      params: { kind: "ds-removed", ds: kind, ops, r },
      hints: [
        DS_RULE[kind],
        `Just before ${which}, the ${kind} is ${code(before)} (${ORDER[kind]}). Which end does it take from?`,
      ],
    };
  }

  // Sum of all removed values (hard) or value at the end (easy/medium).
  if (difficulty === "hard") {
    const sum = removed.reduce((s, x) => s + x, 0);
    return {
      prompt: `${intro}What is the **sum** of all the values returned by the ${rem} operations?`,
      answer: sum,
      answerType: "number",
      tolerance: 0,
      explanation: `${DS_RULE[kind]} ${legend}\n\n${lines.join("\n")}\n\nThe ${rem}s return ${removed.join(", ")}, which add up to **${sum}**.`,
      params: { kind: "ds-sum", ds: kind, ops },
      hints: [DS_RULE[kind], midHint, `Carry on to the end, noting the value each ${rem} returns, then add them up.`],
    };
  }
  return {
    prompt: `${intro}Which value is at the **${end}** at the end?`,
    answer: endVal,
    answerType: "number",
    tolerance: 0,
    explanation: `${DS_RULE[kind]} ${legend}\n\n${lines.join("\n")}\n\nThe ${end} is **${endVal}**.`,
    params: { kind: "ds-end", ds: kind, ops },
    hints: [DS_RULE[kind], midHint, "Carry on with the remaining operations, then read the value at the right end."],
  };
}

// ---------- entry point ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  switch (subtopic) {
    case "searching":
      return genSearching(difficulty, rng);
    case "sorting":
      return genSorting(difficulty, rng);
    case "complexity":
      return genComplexity(difficulty, rng);
    case "data-structures":
      return genStructures(difficulty, rng);
    default:
      throw new Error(`Unknown subtopic: ${subtopic}`);
  }
}

// =====================================================================================
// verify: independent re-implementations (different loop shapes / methods from above).
// =====================================================================================

// Binary search by recursing on sub-lists; returns the values compared, in order.
function vBinary(arr, t, out = []) {
  if (!arr.length) return out;
  const m = Math.floor((arr.length - 1) / 2);
  out.push(arr[m]);
  if (arr[m] === t) return out;
  return t < arr[m] ? vBinary(arr.slice(0, m), t, out) : vBinary(arr.slice(m + 1), t, out);
}

// One bubble pass over the first `len` items, as a "carried bubble" fold; returns { list, swaps }.
function vBubblePass(a, len) {
  const out = [];
  let carry = a[0];
  let swaps = 0;
  for (let j = 1; j < len; j++) {
    if (carry > a[j]) {
      out.push(a[j]);
      swaps++;
    } else {
      out.push(carry);
      carry = a[j];
    }
  }
  out.push(carry);
  return { list: out.concat(a.slice(len)), swaps };
}
function vBubble(a, k) {
  let cur = a.slice();
  let swaps = 0;
  for (let p = 1; p <= k; p++) {
    const r = vBubblePass(cur, a.length - p + 1);
    cur = r.list;
    swaps = r.swaps;
  }
  return { list: cur, swaps };
}
// Insertion sort closed form: the first k + 1 items sorted, the rest untouched.
const vInsertion = (a, k) => asc(a.slice(0, k + 1)).concat(a.slice(k + 1));
// Selection sort: pass p moves the p-th smallest value overall into index p - 1.
function vSelection(a, k) {
  const b = a.slice();
  const order = asc(a);
  for (let p = 1; p <= k; p++) {
    const want = order[p - 1];
    const at = b.indexOf(want);
    b[at] = b[p - 1];
    b[p - 1] = want;
  }
  return b;
}
const vPass = (algo, a, k) => (algo === "bubble" ? vBubble(a, k).list : algo === "insertion" ? vInsertion(a, k) : vSelection(a, k));

const FACT_CHECK = {
  index: "O(1)", push: "O(1)", swapEnds: "O(1)", linear: "O(n)", max: "O(n)", sum: "O(n)", binary: "O(log n)",
  bubble: "O(n²)", selection: "O(n²)", insertion: "O(n²)", pairs: "O(n²)", merge: "O(n log n)", triples: "O(n³)",
};

// Run the loop shape literally and count statement executions.
function vLoopCount(id, n, c) {
  let k = 0;
  switch (id) {
    case "single":
      for (let i = 1; i <= n; i++) k++;
      break;
    case "nested":
      for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) k++;
      break;
    case "triangle":
      for (let i = 1; i <= n; i++) for (let j = 1; j <= i; j++) k++;
      break;
    case "doubling":
      for (let i = 1; i <= n; i *= 2) k++;
      break;
    case "halving":
      for (let i = n; i >= 1; i = Math.floor(i / 2)) k++;
      break;
    case "nlogn":
      for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j *= 2) k++;
      break;
    case "sequence":
      for (let i = 1; i <= n; i++) k++;
      for (let j = 1; j <= n; j++) k++;
      break;
    case "fixed":
      for (let i = 1; i <= c; i++) k++;
      break;
    case "fixedInner":
      for (let i = 1; i <= n; i++) for (let j = 1; j <= c; j++) k++;
      break;
    case "triple":
      for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) for (let l = 1; l <= n; l++) k++;
      break;
    default:
      return NaN;
  }
  return k;
}
// Classify growth from simulated counts at n = 32 and n = 64 (log2 of the ratio).
function vClassify(id, c) {
  const r = Math.log2(vLoopCount(id, 64, c) / vLoopCount(id, 32, c));
  const ref = [["O(1)", 0], ["O(log n)", Math.log2(7 / 6)], ["O(n)", 1], ["O(n log n)", 1 + Math.log2(7 / 6)], ["O(n²)", 2], ["O(n³)", 3]];
  let best = null;
  for (const [o, v] of ref) if (!best || Math.abs(v - r) < best[1]) best = [o, Math.abs(v - r)];
  return best[0];
}
// Work units for a size under a growth class, by counting (no closed forms).
function vWork(o, n) {
  let lg = 0;
  for (let x = n; x > 1; x /= 2) lg++;
  return { "O(1)": 1, "O(n)": n, "O(n²)": n * n, "O(n³)": n * n * n, "O(log n)": lg, "O(n log n)": n * lg }[o];
}

// Stack/queue with explicit indexes instead of push/pop/shift.
function vRun(ds, ops) {
  const buf = [];
  let head = 0;
  let top = -1;
  const removed = [];
  for (const o of ops) {
    if (o.op === "add") {
      top++;
      buf[top] = o.v;
    } else if (ds === "stack") {
      if (top < head) return null;
      removed.push(buf[top]);
      top--;
    } else {
      if (top < head) return null;
      removed.push(buf[head]);
      head++;
    }
  }
  return { removed, final: buf.slice(head, top + 1) };
}

const numEq = (x, y) => typeof y === "number" && Number.isFinite(y) && Math.abs(Number(x) - y) < 1e-9 && String(x).trim() !== "";
const isDistinct = (a) => Array.isArray(a) && new Set(a).size === a.length;

function choiceOk(q, answer, expected) {
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
  return ch.filter((c) => c === expected).length === 1 && String(answer) === expected;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  switch (p.kind) {
    case "linear-count": {
      if (!isDistinct(p.a)) return false;
      const fromEnd = p.a.slice().reverse().indexOf(p.t);
      return numEq(answer, fromEnd < 0 ? p.a.length : p.a.length - fromEnd);
    }
    case "linear-index": {
      let i = 0;
      while (i < p.a.length && p.a[i] !== p.t) i++;
      return i < p.a.length && numEq(answer, i);
    }
    case "binary-step": {
      if (!isDistinct(p.a)) return false;
      const seq = vBinary(p.a, p.t);
      return seq.length >= p.k && numEq(answer, seq[p.k - 1]);
    }
    case "binary-count":
      return isDistinct(p.a) && numEq(answer, vBinary(p.a, p.t).length);
    case "binary-multi": {
      if (!isDistinct(p.a) || !answer || typeof answer !== "object") return false;
      const seq = vBinary(p.a, p.t);
      return seq.length >= 3 && numEq(answer.step2, seq[1]) && numEq(answer.count, seq.length);
    }
    case "binary-max": {
      // Longest path through the search's split structure: a range of len items compares its
      // middle, then continues in the left part (m items) or the right part (len - m - 1 items).
      const memo = new Map();
      const worst = (len) => {
        if (len <= 0) return 0;
        if (!memo.has(len)) {
          const m = Math.floor((len - 1) / 2);
          memo.set(len, 1 + Math.max(worst(m), worst(len - m - 1)));
        }
        return memo.get(len);
      };
      // Cross-check small sizes by searching for every present target and every gap.
      if (p.n <= 40) {
        const arr = Array.from({ length: p.n }, (_, i) => 2 * i + 2);
        let w = 0;
        for (let t = 1; t <= 2 * p.n + 1; t++) w = Math.max(w, vBinary(arr, t).length);
        if (w !== worst(p.n)) return false;
      }
      return numEq(answer, worst(p.n));
    }
    case "bubble-swaps":
      return isDistinct(p.a) && numEq(answer, vBubble(p.a, p.k).swaps);
    case "bubble-total": {
      if (!isDistinct(p.a)) return false;
      let inv = 0;
      p.a.forEach((x, i) => p.a.forEach((y, j) => { if (i < j && x > y) inv++; }));
      // Cross-check by running every pass.
      let cur = p.a.slice();
      let sw = 0;
      for (let len = p.a.length; len > 1; len--) {
        const r = vBubblePass(cur, len);
        cur = r.list;
        sw += r.swaps;
      }
      return inv === sw && numEq(answer, inv);
    }
    case "sort-pass":
      return isDistinct(p.a) && choiceOk(question, answer, fmt(vPass(p.algo, p.a, p.k)));
    case "sort-multi": {
      if (!isDistinct(p.a) || !answer || typeof answer !== "object") return false;
      const listPart = question.parts && question.parts.find((x) => x.id === "list");
      if (!listPart || !choiceOk(listPart, answer.list, fmt(vPass(p.algo, p.a, p.k)))) return false;
      const cnt = p.algo === "bubble" ? vBubble(p.a, p.k).swaps : p.a.slice(0, p.k).filter((x) => x > p.a[p.k]).length;
      // Insertion: the item at index k is still the original one, since passes 1..k-1 only touch 0..k-1.
      return numEq(answer.count, cnt);
    }
    case "fact":
      return question.choices?.length === 4 && new Set(question.choices).size === 4 && question.choices.includes(FACT_CHECK[p.id]) && answer === FACT_CHECK[p.id];
    case "factor": {
      // Time for n = 10 and n = 10m by counting.
      const r = vWork(p.o, 10 * p.m) / vWork(p.o, 10);
      return numEq(answer, r);
    }
    case "scale":
      return numEq(answer, (p.T * vWork(p.o, p.n2)) / vWork(p.o, p.n1));
    case "loop-count":
      return numEq(answer, vLoopCount(p.loop, p.n, p.c));
    case "loop-bigo": {
      const ch = question.choices;
      return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && ch.includes(answer) && answer === vClassify(p.loop, p.c);
    }
    case "loop-multi": {
      if (!answer || typeof answer !== "object") return false;
      const bp = question.parts && question.parts.find((x) => x.id === "bigo");
      if (!bp || bp.choices.length !== 4 || new Set(bp.choices).size !== 4) return false;
      return numEq(answer.count, vLoopCount(p.loop, p.n, p.c)) && answer.bigo === vClassify(p.loop, p.c);
    }
    case "ds-removed": {
      const r = vRun(p.ds, p.ops);
      return !!r && r.removed.length >= p.r && numEq(answer, r.removed[p.r - 1]);
    }
    case "ds-end": {
      const r = vRun(p.ds, p.ops);
      return !!r && r.final.length > 0 && numEq(answer, p.ds === "stack" ? r.final[r.final.length - 1] : r.final[0]);
    }
    case "ds-final": {
      const r = vRun(p.ds, p.ops);
      return !!r && choiceOk(question, answer, fmt(r.final));
    }
    case "ds-sum": {
      const r = vRun(p.ds, p.ops);
      return !!r && numEq(answer, r.removed.reduce((s, x) => s + x, 0));
    }
    case "ds-multi": {
      const r = vRun(p.ds, p.ops);
      if (!r || !answer || typeof answer !== "object" || !r.removed.length || !r.final.length) return false;
      return (
        numEq(answer.last, r.removed[r.removed.length - 1]) &&
        numEq(answer.size, r.final.length) &&
        numEq(answer.end, p.ds === "stack" ? r.final[r.final.length - 1] : r.final[0])
      );
    }
    default:
      return false;
  }
}
