// Patterns generator: number sequences, letter patterns and codes, and shape sequences in text.
// Uses only the seeded rng passed in by the engine.
//
// verify() never trusts the generator's rule: it looks at the terms shown in the prompt, tries a
// fixed family of rules (constant step, constant ratio, steps that grow steadily, ...), requires
// every rule that fits to agree, and checks the answer against that. Generators redraw until their
// own verify passes, so no puzzle shown has two reasonable answers within those families.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ORDN = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10];
  return `${n}${s}`;
};
const DIST = { easy: [0, 1], medium: [2, 3], hard: [4, 6], expert: [6, 10] };

// ======================================================================
// Number sequences
// ======================================================================

// Families: each builds `len` terms from its parameters.
function build(f, len) {
  const t = [];
  for (let i = 0; i < len; i++) {
    if (f.k === "arith") t.push(f.a + f.d * i);
    else if (f.k === "geom") t.push(f.a * f.r ** i);
    else if (f.k === "quad") t.push(f.a + f.d * i + (f.c * i * (i - 1)) / 2);
    else if (f.k === "cube") t.push((i + f.s) ** 3 + f.c);
    else if (f.k === "square") t.push((i + f.s) ** 2 + f.c);
    else if (f.k === "fib") t.push(i === 0 ? f.a : i === 1 ? f.b : t[i - 1] + t[i - 2]);
    else if (f.k === "linrec") t.push(i === 0 ? f.a : f.r * t[i - 1] + f.c);
    else if (f.k === "inter") t.push(i % 2 === 0 ? f.a + f.d * (i / 2) : f.b + f.e * ((i - 1) / 2));
    else if (f.k === "altop") {
      if (i === 0) t.push(f.a);
      else t.push((i - 1) % 2 === f.ph ? t[i - 1] + f.p : t[i - 1] * f.q);
    } else throw new Error(f.k);
  }
  return t;
}

// How each family is described in explanations and hints (no answers).
function ruleText(f) {
  switch (f.k) {
    case "arith": return { rule: `add ${f.d} each time`.replace("add -", "subtract "), hint: "Look at the difference between neighbouring terms." };
    case "geom": return { rule: `multiply by ${f.r} each time`, hint: "The terms grow faster and faster: try dividing each term by the one before." };
    case "quad": return { rule: `the differences ${f.c > 0 ? "go up" : "go down"} by ${Math.abs(f.c)} each time`, hint: "Write down the differences between neighbouring terms, then the differences of those." };
    case "square": return { rule: `square numbers${f.c ? ` ${f.c > 0 ? "plus" : "minus"} ${Math.abs(f.c)}` : ""}: ${f.s}², ${f.s + 1}², ${f.s + 2}², …`, hint: "Compare the terms with the square numbers 1, 4, 9, 16, 25, 36, …" };
    case "cube": return { rule: `cube numbers${f.c ? ` ${f.c > 0 ? "plus" : "minus"} ${Math.abs(f.c)}` : ""}: ${f.s}³, ${f.s + 1}³, ${f.s + 2}³, …`, hint: "Compare the terms with the cube numbers 1, 8, 27, 64, 125, 216, …" };
    case "fib": return { rule: "each term is the sum of the two before it", hint: "Compare each term with the two terms just before it." };
    case "linrec": return { rule: `multiply by ${f.r}, then ${f.c > 0 ? `add ${f.c}` : `subtract ${-f.c}`}`, hint: `The terms grow by roughly a factor of ${f.r}. Multiply a term by ${f.r} and compare with the next one.` };
    case "inter": return { rule: `two sequences take turns: one ${f.d > 0 ? `goes up by ${f.d}` : `goes down by ${-f.d}`}, the other ${f.e > 0 ? `goes up by ${f.e}` : `goes down by ${-f.e}`}`, hint: "Look at every other term: the 1st, 3rd, 5th, … and the 2nd, 4th, 6th, …" };
    case "altop": return { rule: `the steps alternate: ${f.ph === 0 ? `add ${f.p}, multiply by ${f.q}` : `multiply by ${f.q}, add ${f.p}`}`, hint: "The steps between terms are not all the same kind: check whether some are additions and some multiplications." };
    default: throw new Error(f.k);
  }
}

function drawFamily(rng, difficulty) {
  const neg = () => (rng.next() < 0.5 ? 1 : -1);
  if (difficulty === "easy") {
    if (rng.next() < 0.7) {
      const d = rng.int(2, 12) * (rng.next() < 0.3 ? -1 : 1);
      return { k: "arith", a: d < 0 ? rng.int(60, 120) : rng.int(1, 30), d };
    }
    return { k: "geom", a: rng.int(1, 5), r: rng.pick([2, 2, 3]) };
  }
  if (difficulty === "medium") {
    const k = rng.pick(["quad", "square", "fib", "inter"]);
    if (k === "quad") return { k, a: rng.int(1, 20), d: rng.int(1, 6), c: rng.int(1, 3) };
    if (k === "square") return { k, s: rng.int(1, 5), c: rng.int(-3, 3) };
    if (k === "fib") { const a = rng.int(1, 6); return { k, a, b: rng.int(a, a + 5) }; }
    return { k, a: rng.int(1, 20), d: rng.int(2, 6), b: rng.int(25, 60), e: -rng.int(1, 5) };
  }
  // hard + expert
  const k = rng.pick(["linrec", "altop", "cube", "quad", "inter"]);
  if (k === "linrec") return { k, a: rng.int(1, 5), r: rng.pick([2, 3]), c: rng.pick([-2, -1, 1, 2, 3]) };
  if (k === "altop") return { k, a: rng.int(1, 9), p: rng.int(1, 6), q: rng.pick([2, 3]), ph: rng.int(0, 1) };
  if (k === "cube") return { k, s: rng.int(0, 3), c: rng.int(-5, 5) };
  if (k === "quad") return { k, a: rng.int(-10, 40), d: rng.int(-8, 12), c: rng.int(2, 5) * neg() };
  return { k, a: rng.int(-10, 20), d: rng.int(2, 9) * neg(), b: rng.int(-10, 60), e: rng.int(2, 9) * neg() };
}

const fmtSeq = (ts) => ts.map((v) => (v === null ? "?" : String(v))).join(", ");

function numberChoices(rng, answer, cands) {
  const out = [String(answer)];
  for (const c of cands.concat([answer + 1, answer - 1, answer + 2, answer - 2, answer + 10])) {
    if (out.length === 4) break;
    if (Number.isInteger(c) && !out.includes(String(c))) out.push(String(c));
  }
  return rng.shuffle(out);
}

function numHints(f, extra) {
  const r = ruleText(f);
  return [r.hint, `The rule: ${r.rule}.`, extra];
}

function genNumbers(difficulty, rng) {
  for (let tries = 0; tries < 60; tries++) {
    const f = drawFamily(rng, difficulty);
    const r = ruleText(f);
    if (difficulty === "easy" || difficulty === "medium") {
      const L = difficulty === "easy" ? 5 : f.k === "inter" ? 7 : 6;
      const all = build(f, L + 1);
      const shown = all.slice(0, L);
      const ans = all[L];
      const base = {
        prompt: `What is the next term?\n\n**${fmtSeq(shown)}, ?**`,
        explanation: `The rule: ${r.rule}. So the next term is **${ans}**.`,
        hints: numHints(f, "Apply the rule once more to the last term (or the last few terms)."),
        params: { kind: "next", shown },
      };
      const q = difficulty === "easy" && rng.next() < 0.3
        ? { ...base, answerType: "choice", answer: String(ans), choices: numberChoices(rng, ans, [all[L - 1] + (all[L - 1] - all[L - 2]) + 1, all[L - 1] * 2, ans - (all[L - 1] - all[L - 2])]) }
        : { ...base, answerType: "number", answer: ans };
      if (verify(q, q.answer)) return q;
      continue;
    }
    if (difficulty === "hard") {
      const L = f.k === "linrec" || f.k === "altop" ? 5 : 6;
      const all = build(f, L + 2);
      const shown = all.slice(0, L);
      const [n1, n2] = [all[L], all[L + 1]];
      if (n1 === n2 || Math.abs(n2) > 9999) continue;
      const answer = `${n1}, ${n2}`;
      const d = n1 - all[L - 1];
      const decoys = [];
      for (const c of [n1 + 1, n1 - 1, n2 + 1, n2 - 1, n1 + d, n2 - d, n2 + d, all[L - 1] + 2 * d, n1 * 2, n2 + 2]) {
        if (Number.isInteger(c) && c !== n1 && c !== n2 && !decoys.includes(c)) decoys.push(c);
      }
      const nd = rng.int(DIST.hard[0], DIST.hard[1]);
      const q = {
        prompt: `Write the **next two terms**, separated by a comma.\n\n**${fmtSeq(shown)}, ?, ?**`,
        answerType: "text",
        answer,
        blocks: { tiles: rng.shuffle([String(n1), String(n2), ...decoys.slice(0, nd).map(String)]), joiner: ", ", useAll: false },
        explanation: `The rule: ${r.rule}. So the next two terms are **${n1}** and **${n2}**.`,
        hints: numHints(f, "Apply the rule to get the next term, then apply it again to that one."),
        params: { kind: "next2", shown },
      };
      if (verify(q, q.answer)) return q;
      continue;
    }
    // expert
    const mode = rng.pick(["missing", "nth", "over"]);
    if (mode === "missing") {
      const L = 7;
      const all = build(f, L + 1);
      const gap = rng.int(2, 4);
      const shown = all.slice(0, L).map((v, i) => (i === gap ? null : v));
      const q = {
        prompt: `One term is missing, marked **?**. Find it, and find the next term after the last one shown.\n\n**${fmtSeq(shown)}, …**`,
        answerType: "multi",
        parts: [
          { id: "missing", label: "Missing", ask: `The missing ${ORDN(gap + 1)} term`, answerType: "number", answer: all[gap], hint: "Work out the rule from a stretch of terms with no gap, then check it across the gap." },
          { id: "next", label: "Next", ask: `The ${ORDN(L + 1)} term (after ${all[L - 1]})`, answerType: "number", answer: all[L], hint: "Apply the rule once more to the end of the sequence." },
        ],
        explanation: `The rule: ${r.rule}. The missing term is **${all[gap]}** and the next term is **${all[L]}**.\n\nFull sequence: ${fmtSeq(all)}.`,
        hints: [r.hint, "Use the terms on either side of the gap: the rule has to work across it in both directions.", `The rule: ${r.rule}.`],
        params: { kind: "missing", shown },
      };
      if (Math.abs(all[L]) > 99999) continue;
      if (verify(q, { missing: all[gap], next: all[L] })) return q;
      continue;
    }
    if (mode === "nth") {
      // Steadily growing differences: the learner needs a formula (or a clever count), not 20 steps.
      const g = { k: "quad", a: rng.int(1, 30), d: rng.int(2, 9), c: rng.int(2, 4) };
      const n = rng.int(15, 30);
      const shown = build(g, 5);
      const ans = build(g, n)[n - 1];
      const gr = ruleText(g);
      const q = {
        prompt: `The first term of this sequence is term 1. What is **term ${n}**?\n\n**${fmtSeq(shown)}, …**`,
        answerType: "number",
        answer: ans,
        explanation: `The differences are ${g.d}, ${g.d + g.c}, ${g.d + 2 * g.c}, …: they go up by ${g.c}. From term 1 to term ${n} there are ${n - 1} differences, ${g.d} + ${g.d + g.c} + … + ${g.d + (n - 2) * g.c}, which add up to ${n - 1} × (${g.d} + ${g.d + (n - 2) * g.c}) ÷ 2 = ${ans - g.a}. So term ${n} = ${g.a} + ${ans - g.a} = **${ans}**.`,
        hints: [
          gr.hint,
          `The differences go up by ${g.c}, so the k-th difference is ${g.d} + ${g.c}(k − 1).`,
          `Term ${n} = first term + the sum of the first ${n - 1} differences. Add an arithmetic list as (number of values) × (first + last) ÷ 2.`,
        ],
        params: { kind: "nth", shown, n },
      };
      if (verify(q, ans)) return q;
      continue;
    }
    // "over": the first term above a limit.
    const g = rng.pick([
      { k: "geom", a: rng.int(2, 7), r: rng.pick([2, 3]) },
      { k: "linrec", a: rng.int(1, 5), r: 2, c: rng.pick([1, 3, 5]) },
      { k: "quad", a: rng.int(1, 10), d: rng.int(3, 9), c: rng.int(3, 8) },
    ]);
    const limit = rng.pick([500, 1000, 2000, 5000]);
    const shown = build(g, 5);
    if (shown[4] >= limit) continue;
    let n = 1;
    while (build(g, n)[n - 1] <= limit) n++;
    const val = build(g, n)[n - 1];
    const gr = ruleText(g);
    const q = {
      prompt: `The first term of this sequence is term 1. Which term is the **first one greater than ${limit}**? Give its term number.\n\n**${fmtSeq(shown)}, …**`,
      answerType: "number",
      answer: n,
      explanation: `The rule: ${gr.rule}. Continuing: ${fmtSeq(build(g, n).slice(4))}. Term ${n - 1} is ${build(g, n)[n - 2]} (not above ${limit}) and term ${n} is ${val}, so the answer is **term ${n}**.`,
      hints: [gr.hint, `The rule: ${gr.rule}.`, "Keep a count of the term numbers as you extend the sequence, and stop at the first term above the limit."],
      params: { kind: "over", shown, limit },
    };
    if (verify(q, n)) return q;
  }
  throw new Error("no number sequence");
}

// ======================================================================
// Letter patterns and codes
// ======================================================================

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const L = (i) => ABC[((i % 26) + 26) % 26];
const P = (ch) => ABC.indexOf(ch);
const WRAP = "The alphabet wraps around: after Z comes A.";

const WORDS4 = [
  "CAT", "DOG", "SUN", "MOON", "STAR", "TREE", "FISH", "BIRD", "LAMP", "BOOK", "DOOR", "RAIN", "SNOW", "WIND",
  "ROAD", "SHIP", "CAKE", "MILK", "GOLD", "SALT", "ROSE", "FROG", "BELL", "KITE", "NEST", "DESK", "COAT", "HAND",
  "FARM", "WOLF", "BEAR", "LION", "PARK", "RING", "DRUM", "HILL", "LEAF", "WAVE", "ROCK", "MAP", "PEN", "BOX",
];

function letterChoices(rng, answer, cands) {
  const out = [answer];
  const near = [1, -1, 2, -2, 3, -3].map((d) => L(P(answer) + d));
  for (const c of cands.concat(near)) {
    if (out.length === 4) break;
    if (!out.includes(c)) out.push(c);
  }
  return rng.shuffle(out);
}

function genLetters(difficulty, rng) {
  for (let tries = 0; tries < 60; tries++) {
    if (difficulty === "easy") {
      const step = rng.int(1, 4) * (rng.next() < 0.25 ? -1 : 1);
      const len = rng.int(4, 6);
      const start = step > 0 ? rng.int(0, 25 - step * len) : rng.int(-step * len, 25);
      const seq = [...Array(len + 1)].map((_, i) => L(start + step * i));
      const ans = seq[len];
      const q = {
        prompt: `Which letter comes next?\n\n**${seq.slice(0, len).join(", ")}, ?**`,
        answerType: rng.next() < 0.5 ? "choice" : "text",
        answer: ans,
        explanation: `Each letter is ${Math.abs(step)} place${Math.abs(step) === 1 ? "" : "s"} ${step > 0 ? "later" : "earlier"} in the alphabet than the one before, so the next letter is **${ans}**.`,
        hints: ["Write each letter's place in the alphabet (A = 1, B = 2, …).", "Find how far apart neighbouring letters are.", "Move the same distance once more from the last letter."],
        params: { kind: "lseq", shown: seq.slice(0, len), wrap: false },
      };
      if (q.answerType === "choice") q.choices = letterChoices(rng, ans, [L(P(ans) + 1), L(P(ans) - 1), L(P(seq[len - 1]) + step + Math.sign(step) * 2), L(P(ans) + 2)]);
      if (verify(q, ans)) return q;
      continue;
    }
    if (difficulty === "medium") {
      const kind = rng.pick(["grow", "pair", "wrap"]);
      if (kind === "grow") {
        // Gaps 1, 2, 3, ... (or a larger start).
        const g0 = rng.int(1, 3);
        const start = rng.int(0, 8);
        const seq = [start];
        for (let i = 0; i < 5; i++) seq.push(seq[i] + g0 + i);
        if (seq[5] > 25) continue;
        const shown = seq.slice(0, 5).map(L);
        const ans = L(seq[5]);
        const q = {
          prompt: `Which letter comes next?\n\n**${shown.join(", ")}, ?**`,
          answerType: "choice",
          answer: ans,
          choices: letterChoices(rng, ans, [L(seq[5] - 1), L(seq[5] + 1), L(seq[4] + g0 + 3), L(seq[5] - 2)]),
          explanation: `The gaps between letters grow by one each time: ${seq.slice(1, 6).map((v, i) => v - seq[i]).join(", ")}. So the next letter is **${ans}**.`,
          hints: ["Write each letter's place in the alphabet (A = 1, B = 2, …).", "Look at the gaps between neighbouring letters: are they all the same?", "The gaps follow their own pattern: continue it once more."],
          params: { kind: "lseq", shown, wrap: false },
        };
        if (verify(q, ans)) return q;
        continue;
      }
      if (kind === "pair") {
        // Letter + number codes: B2, D4, F6, ... (the number is the letter's place).
        const step = rng.int(1, 4);
        const start = rng.int(0, 10);
        const items = [...Array(5)].map((_, i) => start + step * i);
        if (items[4] > 25) continue;
        const code = (p) => `${L(p)}${p + 1}`;
        const ans = code(items[4]);
        const q = {
          prompt: `What comes next? (Type it the same way: a letter and a number.)\n\n**${items.slice(0, 4).map(code).join(", ")}, ?**`,
          answerType: "text",
          answer: ans,
          explanation: `Each letter moves ${step} place${step === 1 ? "" : "s"} on, and the number is that letter's place in the alphabet. Next: **${ans}**.`,
          hints: ["How far apart are the letters?", "Compare each number with its letter's place in the alphabet (A = 1, B = 2, …)."],
          params: { kind: "lcode", shown: items.slice(0, 4).map(code) },
        };
        if (verify(q, ans)) return q;
        continue;
      }
      const step = rng.int(2, 5) * (rng.next() < 0.3 ? -1 : 1);
      // Start close enough to the end (or the start, going backwards) that the sequence wraps.
      const start = step > 0 ? rng.int(26 - 3 * step, 25) : rng.int(0, -3 * step - 1);
      const seq = [...Array(6)].map((_, i) => L(start + step * i));
      const ans = seq[5];
      const q = {
        prompt: `Which letter comes next? ${WRAP}\n\n**${seq.slice(0, 5).join(", ")}, ?**`,
        answerType: "choice",
        answer: ans,
        choices: letterChoices(rng, ans, [L(P(ans) + 1), L(P(ans) - 1), L(P(seq[4]) + step + 1), L(P(ans) + 2)]),
        explanation: `Each letter is ${Math.abs(step)} places ${step > 0 ? "after" : "before"} the one before it, going round ${step > 0 ? "from Z back to A" : "from A back to Z"}. So the next letter is **${ans}**.`,
        hints: ["Write each letter's place in the alphabet.", "Count from one letter to the next, carrying on round the alphabet (Z to A, or A back to Z) when you pass the end."],
        params: { kind: "lseq", shown: seq.slice(0, 5), wrap: true },
      };
      if (verify(q, ans)) return q;
      continue;
    }
    if (difficulty === "hard") {
      const kind = rng.pick(["mirror", "inter", "alt"]);
      if (kind === "mirror") {
        // AZ, BY, CX, ... : a letter and its mirror, stepping by k.
        const k = rng.int(1, 3);
        const start = rng.int(0, 4);
        const pairs = [...Array(5)].map((_, i) => `${L(start + k * i)}${L(25 - start - k * i)}`);
        const ans = pairs[4];
        const q = {
          prompt: `What comes next? (Type the two letters.)\n\n**${pairs.slice(0, 4).join(", ")}, ?**`,
          answerType: "text",
          answer: ans,
          explanation: `The first letters go ${pairs.slice(0, 4).map((p) => p[0]).join(", ")} (${k} on each time) and each second letter is the first one's mirror in the alphabet (A↔Z, B↔Y, …). Next: **${ans}**.`,
          hints: ["Look at the first letters on their own, then the second letters on their own.", "Compare each pair: where is the second letter, counting from the end of the alphabet?"],
          params: { kind: "lpairs", shown: pairs.slice(0, 4) },
        };
        if (verify(q, ans)) return q;
        continue;
      }
      if (kind === "inter") {
        // Two sequences take turns: A, Z, C, X, E, ?
        const s1 = rng.int(0, 4);
        const k1 = rng.int(1, 3);
        const s2 = rng.int(21, 25);
        const k2 = -rng.int(1, 3);
        const seq = [...Array(7)].map((_, i) => (i % 2 === 0 ? L(s1 + k1 * (i / 2)) : L(s2 + k2 * ((i - 1) / 2))));
        const ans = seq[6];
        const q = {
          prompt: `Which letter comes next?\n\n**${seq.slice(0, 6).join(", ")}, ?**`,
          answerType: "choice",
          answer: ans,
          choices: letterChoices(rng, ans, [seq[5] === ans ? L(P(ans) + 1) : L(P(seq[5]) + k2), L(P(ans) + 1), L(P(ans) - 1), L(P(ans) + 2)]),
          explanation: `Two sequences take turns. The 1st, 3rd, 5th letters go ${seq[0]}, ${seq[2]}, ${seq[4]} (${k1} on each time); the 2nd, 4th, 6th go ${seq[1]}, ${seq[3]}, ${seq[5]} (${-k2} back each time). The 7th letter continues the first sequence: **${ans}**.`,
          hints: ["Split the list into every other letter: the 1st, 3rd, 5th, … and the 2nd, 4th, 6th, …", "The missing letter is the 7th, so it belongs to the first sequence."],
          params: { kind: "lseq", shown: seq.slice(0, 6), wrap: false },
        };
        if (verify(q, ans)) return q;
        continue;
      }
      // Gaps alternate: A, B, D, E, G, H, ? (gaps 1, 2, 1, 2, ...)
      const ga = rng.int(1, 3);
      let gb = rng.int(1, 3);
      if (gb === ga) gb = ga === 3 ? 1 : ga + 1;
      const start = rng.int(0, 3);
      const seq = [start];
      for (let i = 0; i < 6; i++) seq.push(seq[i] + (i % 2 === 0 ? ga : gb));
      if (seq[6] > 25) continue;
      const shown = seq.slice(0, 6).map(L);
      const ans = L(seq[6]);
      const q = {
        prompt: `Which letter comes next?\n\n**${shown.join(", ")}, ?**`,
        answerType: "choice",
        answer: ans,
        choices: letterChoices(rng, ans, [L(seq[5] + gb), L(seq[6] - 1), L(seq[6] + 1), L(seq[5] + ga + gb)]),
        explanation: `The gaps between letters alternate: ${ga}, ${gb}, ${ga}, ${gb}, ${ga}. The next gap is ${gb}, so the next letter is **${ans}**.`,
        hints: ["Write each letter's place in the alphabet.", "Look at the gaps between neighbouring letters: they are not all the same, but they repeat."],
        params: { kind: "lseq", shown, wrap: false },
      };
      if (verify(q, ans)) return q;
      continue;
    }
    // expert: codes, typed or built from letter blocks.
    const kind = rng.pick(["shift", "shift", "step", "mirror"]);
    const [w1, w2] = rng.shuffle(WORDS4.slice()).slice(0, 2);
    const s = kind === "shift" ? rng.int(1, 5) * (rng.next() < 0.3 ? -1 : 1) : 0;
    const enc = (w) => [...w].map((ch, i) => (kind === "shift" ? L(P(ch) + s) : kind === "step" ? L(P(ch) + i + 1) : L(25 - P(ch)))).join("");
    const decode = kind !== "mirror" && rng.next() < 0.4;
    const ans = decode ? w2 : enc(w2);
    const asked = decode ? enc(w2) : w2;
    const nd = rng.int(DIST.expert[0], DIST.expert[1]);
    const pool = [...ABC].filter((c) => !ans.includes(c));
    const decoys = rng.shuffle(pool).slice(0, nd);
    const how = kind === "shift"
      ? `each letter moves ${Math.abs(s)} place${Math.abs(s) === 1 ? "" : "s"} ${s > 0 ? "forward" : "back"} in the alphabet`
      : kind === "step" ? "the 1st letter moves 1 place forward, the 2nd moves 2, the 3rd moves 3, and so on" : "each letter is swapped with its mirror in the alphabet (A↔Z, B↔Y, C↔X, …)";
    const q = {
      prompt: `In a code, **${w1}** is written as **${enc(w1)}**. ${WRAP}\n\n${decode ? `Which word is written as **${asked}**?` : `How is **${w2}** written in the same code?`}`,
      answerType: "text",
      answer: ans,
      blocks: { tiles: rng.shuffle([...ans, ...decoys]), joiner: "", useAll: false },
      explanation: `Compare ${w1} with ${enc(w1)} letter by letter: ${how}. ${decode ? `Undo that for ${asked}: **${ans}**.` : `Do the same to ${w2}: **${ans}**.`}`,
      hints: [
        `Line up ${w1} and ${enc(w1)} and count how far each letter moves (A = 1, B = 2, …).`,
        "Check whether every letter moves the same distance, or the distance depends on the letter's position, or the code mirrors the alphabet.",
        decode ? "To decode, apply the rule backwards." : "Apply the same rule to each letter of the new word.",
      ],
      params: { kind: "code", w1, c1: enc(w1), asked, decode },
    };
    if (verify(q, ans)) return q;
  }
  throw new Error("no letter pattern");
}

// ======================================================================
// Shape patterns (text symbols)
// ======================================================================

const SHAPES = [["▲", "△"], ["●", "○"], ["■", "□"], ["◆", "◇"], ["★", "☆"]];
const SHAPE_NAMES = ["triangle", "circle", "square", "diamond", "star"];
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const LEGEND = "Filled shapes are ▲ ● ■ ◆ ★; hollow ones are △ ○ □ ◇ ☆.";

// Items are separated by em spaces (U+2003), which HTML doesn't collapse.
const SEP = "\u2003";
const show = (items) => `**${items.join(SEP)}**`;

function shapeChoices(rng, answer, cands) {
  const out = [answer];
  for (const c of cands) {
    if (out.length === 4) break;
    if (!out.includes(c)) out.push(c);
  }
  for (const pair of SHAPES) for (const c of pair) if (out.length < 4 && !out.includes(c)) out.push(c);
  return rng.shuffle(out);
}

// Items from a shape cycle and a fill cycle (each a list, repeated).
const itemAt = (shapeCyc, fillCyc, i) => SHAPES[shapeCyc[i % shapeCyc.length]][fillCyc[i % fillCyc.length]];

function genShapes(difficulty, rng) {
  for (let tries = 0; tries < 60; tries++) {
    if (difficulty === "easy") {
      const p = rng.int(2, 3);
      const cyc = rng.shuffle([0, 1, 2, 3, 4]).slice(0, p);
      const syms = cyc.map((sh) => SHAPES[sh][rng.next() < 0.7 ? 0 : 1]);
      const n = 2 * p + rng.int(1, 2);
      const items = [...Array(n + 1)].map((_, i) => syms[i % p]);
      const ans = items[n];
      const q = {
        prompt: `What comes next?\n\n${show(items.slice(0, n))}${SEP}**?**`,
        answerType: "choice",
        answer: ans,
        choices: shapeChoices(rng, ans, syms.concat(syms.map((c) => SHAPES[shapeOf(c)][1 - fillOf(c)]))),
        explanation: `The pattern repeats every ${p} items: ${syms.join(" ")}. Item ${n + 1} is **${ans}**.`,
        hints: ["Find where the pattern starts to repeat.", "Count how many items are in one repeat, then carry on from the last item."],
        params: { kind: "cycle", shown: items.slice(0, n), at: n + 1 },
      };
      if (verify(q, ans)) return q;
      continue;
    }
    if (difficulty === "medium") {
      const kind = rng.pick(["far", "arrow", "next3"]);
      if (kind === "arrow") {
        const step = rng.pick([1, 2, -1, -2]);
        const start = rng.int(0, 7);
        const items = [...Array(7)].map((_, i) => ARROWS[(((start + step * i) % 8) + 8) % 8]);
        const ans = items[6];
        const q = {
          prompt: `The arrow turns the same way each time. What comes next?\n\n${show(items.slice(0, 6))}${SEP}**?**`,
          answerType: "choice",
          answer: ans,
          choices: shapeChoices(rng, ans, [ARROWS[(((start + step * 4) % 8) + 8) % 8], ARROWS[(((start + step * 6 + 4) % 8) + 8) % 8], ARROWS[(((start + step * 6 + 1) % 8) + 8) % 8], ARROWS[(((start + step * 6 - 1) % 8) + 8) % 8]]),
          explanation: `Each arrow is turned ${Math.abs(step) * 45}° ${step > 0 ? "clockwise" : "anticlockwise"} from the one before. Next: **${ans}**.`,
          hints: ["Compare each arrow with the one before: which way does it turn, and by how much?", "A quarter turn is 90°; halfway between two quarter turns is 45°."],
          params: { kind: "arrow", shown: items.slice(0, 6), at: 7 },
        };
        if (verify(q, ans)) return q;
        continue;
      }
      // A cycle of 3-4 items with one shape repeated.
      const p = rng.int(3, 4);
      const kinds = rng.shuffle([0, 1, 2, 3, 4]).slice(0, p - 1);
      const cyc = rng.shuffle(kinds.concat([kinds[0]]));
      const fills = cyc.map(() => 0);
      const n = 2 * p + rng.int(0, 2);
      const items = [...Array(n + 3)].map((_, i) => SHAPES[cyc[i % p]][fills[i % p]]);
      if (kind === "next3") {
        const ans3 = items.slice(n, n + 3);
        const nd = rng.int(DIST.medium[0], DIST.medium[1]);
        const others = SHAPES.map((s) => s[0]).filter((c) => !ans3.includes(c));
        const q = {
          prompt: `Build the **next three** items, in order.\n\n${show(items.slice(0, n))}${SEP}**?${SEP}?${SEP}?**`,
          answerType: "tiles",
          tiles: rng.shuffle(ans3.concat(rng.shuffle(others).slice(0, nd).concat(ans3.slice(0, Math.max(0, nd - others.length))))),
          joiner: " ",
          useAll: false,
          answer: ans3.join(" "),
          explanation: `The pattern repeats every ${p} items: ${cyc.map((s) => SHAPES[s][0]).join(" ")}. The next three are **${ans3.join(" ")}**.`,
          hints: ["Find the block of items that repeats (one shape appears twice in it).", "Carry on the repeat from the last item shown."],
          params: { kind: "cycle", shown: items.slice(0, n), at: n + 1, count: 3 },
        };
        if (verify(q, q.answer)) return q;
        continue;
      }
      const at = rng.int(15, 30);
      const ans = SHAPES[cyc[(at - 1) % p]][0];
      const q = {
        prompt: `This pattern keeps repeating. What is the **${ORDN(at)}** item?\n\n${show(items.slice(0, n))}${SEP}**…**`,
        answerType: "choice",
        answer: ans,
        choices: shapeChoices(rng, ans, cyc.map((s) => SHAPES[s][0]).concat(SHAPES.map((s) => s[0]))),
        explanation: `The pattern repeats every ${p} items: ${cyc.map((s) => SHAPES[s][0]).join(" ")}. ${at} ÷ ${p} leaves remainder ${at % p}${at % p === 0 ? `, so item ${at} is the last in a repeat` : `, so item ${at} is item ${at % p} of a repeat`}: **${ans}**.`,
        hints: [`Find how many items are in one repeat.`, "Divide the position by the length of the repeat: the remainder tells you where in the repeat you land (remainder 0 means the last item)."],
        params: { kind: "cycle", shown: items.slice(0, n), at },
      };
      if (verify(q, ans)) return q;
      continue;
    }
    // hard / expert: shape and fill change on different cycles.
    const [p, qf] = rng.pick([[2, 3], [3, 2], [3, 4], [4, 3], [2, 4], [4, 2]].filter(([a, b]) => difficulty === "expert" || (a <= 3 && b <= 3)));
    const shapeCyc = rng.shuffle([0, 1, 2, 3, 4]).slice(0, p);
    let fillCyc = [...Array(qf)].map((_, i) => (i === 0 ? 0 : rng.int(0, 1)));
    if (!fillCyc.includes(1)) fillCyc[qf - 1] = 1;
    if (qf === 4 && fillCyc.join("") === "0101") fillCyc = [0, 0, 1, 1];
    const n = 2 * Math.max(p, qf) + rng.int(0, 2);
    const items = [...Array(n)].map((_, i) => itemAt(shapeCyc, fillCyc, i));
    const lcm = (a, b) => (a * b) / (function g(x, y) { return y ? g(y, x % y) : x; })(a, b);
    const both = `The shapes repeat every ${p} items (${shapeCyc.map((s) => SHAPES[s][0]).join(" ")}), and filled/hollow repeats every ${qf} items (${fillCyc.map((f) => (f ? "hollow" : "filled")).join(", ")}).`;
    const pickMode = difficulty === "hard" ? rng.pick(["next", "far"]) : rng.pick(["far", "far", "count", "countShape"]);
    if (pickMode === "next" || pickMode === "far") {
      const at = pickMode === "next" ? n + 1 : difficulty === "hard" ? rng.int(13, 24) : rng.int(40, 99);
      const ans = itemAt(shapeCyc, fillCyc, at - 1);
      const si = shapeCyc[(at - 1) % p];
      const fi = fillCyc[(at - 1) % qf];
      const q = {
        prompt: `${LEGEND} The shape and the filling each follow their own repeating pattern. What is ${pickMode === "next" ? "the next item" : `the **${ORDN(at)}** item`}?\n\n${show(items)}${SEP}**${pickMode === "next" ? "?" : "…"}**`,
        answerType: "choice",
        answer: ans,
        choices: shapeChoices(rng, ans, [SHAPES[si][1 - fi], SHAPES[shapeCyc[at % p]][fi], SHAPES[shapeCyc[at % p]][1 - fi], SHAPES[shapeCyc[(at + 1) % p]][fi]]),
        explanation: `${both} For item ${at}: ${at} ÷ ${p} leaves ${at % p}, so the shape is the ${SHAPE_NAMES[si]}; ${at} ÷ ${qf} leaves ${at % qf}, so it is ${fi ? "hollow" : "filled"}. (Remainder 0 means the last in the repeat.) Answer: **${ans}**.`,
        hints: [
          "Look at the shapes only (ignore filled or hollow) and find their repeat.",
          "Now look at filled/hollow only and find that repeat. It has a different length.",
          "Work out the shape and the filling separately for the position you need, using the remainder after dividing by each repeat length.",
        ],
        params: { kind: "two", shown: items, at },
      };
      if (verify(q, ans)) return q;
      continue;
    }
    // Counting over the first N items.
    const N = rng.int(30, 60);
    const all = [...Array(N)].map((_, i) => itemAt(shapeCyc, fillCyc, i));
    if (pickMode === "count") {
      const cnt = all.filter((c) => SHAPES.some((s) => s[0] === c)).length;
      const per = lcm(p, qf);
      const q = {
        prompt: `${LEGEND} The shape and the filling each follow their own repeating pattern. How many of the **first ${N} items** are **filled**?\n\n${show(items)}${SEP}**…**`,
        answerType: "number",
        answer: cnt,
        explanation: `${both} Filling depends only on the filled/hollow repeat: ${fillCyc.filter((f) => !f).length} of every ${qf} items are filled. ${N} = ${Math.floor(N / qf)} × ${qf} + ${N % qf}, so the count is ${Math.floor(N / qf)} × ${fillCyc.filter((f) => !f).length} + ${fillCyc.slice(0, N % qf).filter((f) => !f).length} = **${cnt}**.`,
        hints: [
          "The shapes don't matter here: look only at filled or hollow.",
          `Find the filled/hollow repeat and count the filled items in one repeat.`,
          `Count how many whole repeats fit in ${N} items, then add the filled ones in the part-repeat left over.`,
        ],
        params: { kind: "countFill", shown: items, N, per },
      };
      if (verify(q, cnt)) return q;
      continue;
    }
    const target = shapeCyc[rng.int(0, p - 1)];
    const tf = rng.int(0, 1);
    const sym = SHAPES[target][tf];
    const cnt = all.filter((c) => c === sym).length;
    const per = lcm(p, qf);
    const perCnt = all.slice(0, per).filter((c) => c === sym).length;
    const q = {
      prompt: `${LEGEND} The shape and the filling each follow their own repeating pattern. How many of the **first ${N} items** are exactly **${sym}** (a ${tf ? "hollow" : "filled"} ${SHAPE_NAMES[target]})?\n\n${show(items)}${SEP}**…**`,
      answerType: "number",
      answer: cnt,
      explanation: `${both} Together they repeat every ${per} items (the lowest common multiple of ${p} and ${qf}), and ${sym} appears ${perCnt} time${perCnt === 1 ? "" : "s"} in each block of ${per}. ${N} = ${Math.floor(N / per)} × ${per} + ${N % per}, so the count is ${Math.floor(N / per)} × ${perCnt} + ${all.slice(0, N % per).filter((c) => c === sym).length} = **${cnt}**.`,
      hints: [
        "Find the shape repeat and the filled/hollow repeat separately.",
        `The whole pattern repeats when both line up again: after the lowest common multiple of the two lengths.`,
        `Count ${sym} in one full repeat, then work out how many full repeats fit in ${N} and add the leftover part.`,
      ],
      params: { kind: "countSym", shown: items, N, sym },
    };
    if (verify(q, cnt)) return q;
  }
  throw new Error("no shape pattern");
}

// ======================================================================

export function generate({ subtopic, difficulty, rng }) {
  if (!DIST[difficulty]) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "numbers") return genNumbers(difficulty, rng);
  if (subtopic === "letters") return genLetters(difficulty, rng);
  if (subtopic === "shapes") return genShapes(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ======================================================================
// verify: infer the rule from the shown terms only
// ======================================================================

// Each rule: min = terms needed so it is checked at least twice; start = first term it predicts;
// fit(seq) reads its constants from the first terms (one or more ways); next(seq, k) predicts the next term.
const RULES = [
  { name: "constant step", min: 3, start: 2, next: (s) => 2 * s[s.length - 1] - s[s.length - 2] },
  { name: "steady growth of steps", min: 4, start: 3, next: (s) => 3 * s[s.length - 1] - 3 * s[s.length - 2] + s[s.length - 3] },
  { name: "third differences", min: 6, start: 4, next: (s) => 4 * s[s.length - 1] - 6 * s[s.length - 2] + 4 * s[s.length - 3] - s[s.length - 4] },
  { name: "every other term", min: 6, start: 4, next: (s) => 2 * s[s.length - 2] - s[s.length - 4] },
  { name: "sum of two before", min: 4, start: 2, next: (s) => s[s.length - 1] + s[s.length - 2] },
  {
    name: "constant ratio", min: 3, start: 2,
    fit: (s) => (s[0] !== 0 && Number.isInteger(s[1] / s[0]) && Math.abs(s[1] / s[0]) >= 2 ? { r: s[1] / s[0] } : null),
    next: (s, k) => s[s.length - 1] * k.r,
  },
  {
    name: "multiply then add", min: 5, start: 3,
    fit: (s) => {
      if (s[1] === s[0]) return null;
      const r = (s[2] - s[1]) / (s[1] - s[0]);
      return Number.isInteger(r) && r >= 2 ? { r, c: s[1] - r * s[0] } : null;
    },
    next: (s, k) => k.r * s[s.length - 1] + k.c,
  },
  {
    name: "alternate add and multiply", min: 5, start: 3,
    fit: (s) => {
      // Either step 1 adds and step 2 multiplies, or the other way round.
      const out = [];
      const q1 = s[2] / s[1];
      if (s[1] !== 0 && Number.isInteger(q1) && q1 >= 2) out.push({ add: s[1] - s[0], mul: q1, first: "add" });
      const q0 = s[1] / s[0];
      if (s[0] !== 0 && Number.isInteger(q0) && q0 >= 2) out.push({ add: s[2] - s[1], mul: q0, first: "mul" });
      return out.length ? out : null;
    },
    next: (s, k) => {
      const i = s.length - 1; // the step from term i to i+1
      const addStep = (i % 2 === 0) === (k.first === "add");
      return addStep ? s[i] + k.add : s[i] * k.mul;
    },
  },
];

// Every way the shown terms fit: [{ rule, k }].
function fits(seq) {
  const out = [];
  for (const rule of RULES) {
    if (seq.length < rule.min) continue;
    const ks = rule.fit ? rule.fit(seq) : {};
    if (!ks) continue;
    for (const k of Array.isArray(ks) ? ks : [ks]) {
      let ok = true;
      for (let i = rule.start; i < seq.length && ok; i++) if (rule.next(seq.slice(0, i), k) !== seq[i]) ok = false;
      if (ok) out.push({ rule, k });
    }
  }
  return out;
}

// Extend the sequence by `more` terms; null unless at least one rule fits and all fitting rules agree.
function extend(seq, more) {
  const fs = fits(seq);
  if (!fs.length) return null;
  let result = null;
  for (const f of fs) {
    const s = seq.slice();
    for (let i = 0; i < more; i++) s.push(f.rule.next(s, f.k));
    const tail = s.slice(seq.length);
    if (!tail.every(Number.isFinite)) return null;
    if (result === null) result = tail;
    else if (result.join() !== tail.join()) return null;
  }
  return result;
}

const toInt = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));

function verifyNumbers(p, answer) {
  if (p.kind === "next") {
    const t = extend(p.shown, 1);
    return t !== null && toInt(answer) === t[0];
  }
  if (p.kind === "next2") {
    const t = extend(p.shown, 2);
    return t !== null && t[0] !== t[1] && String(answer) === `${t[0]}, ${t[1]}`;
  }
  if (p.kind === "nth") {
    const t = extend(p.shown, p.n - p.shown.length);
    return t !== null && toInt(answer) === t[t.length - 1];
  }
  if (p.kind === "over") {
    const t = extend(p.shown, 40);
    if (t === null) return false;
    const all = p.shown.concat(t);
    const idx = all.findIndex((v) => v > p.limit);
    return idx >= p.shown.length && toInt(answer) === idx + 1;
  }
  if (p.kind === "missing") {
    if (!answer || typeof answer !== "object") return false;
    const gap = p.shown.indexOf(null);
    const known = p.shown.filter((v) => v !== null);
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    const span = hi - lo + 50;
    const found = [];
    for (let v = lo - span; v <= hi + span; v++) {
      const s = p.shown.slice();
      s[gap] = v;
      const t = extend(s, 1);
      if (t !== null) found.push([v, t[0]]);
      if (found.length > 1) return false;
    }
    return found.length === 1 && toInt(answer.missing) === found[0][0] && toInt(answer.next) === found[0][1];
  }
  return false;
}

function verifyLetters(p, question, answer) {
  const A = String(answer).toUpperCase();
  const idx = (c) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(c);
  if (p.kind === "lseq") {
    const nums = p.shown.map(idx);
    // With wrap-around, unwrap so the sequence keeps going up.
    // With wrap-around, unwrap so each step is the short way round (at most 13 places).
    if (p.wrap) {
      for (let i = 1; i < nums.length; i++) {
        while (nums[i] - nums[i - 1] > 13) nums[i] -= 26;
        while (nums[i] - nums[i - 1] <= -13) nums[i] += 26;
      }
    }
    const t = extend(nums, 1);
    if (t === null) return false;
    const want = t[0];
    if (!p.wrap && (want < 0 || want > 25)) return false;
    return A === "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[((want % 26) + 26) % 26] && (question.answerType !== "choice" || question.choices.includes(String(answer)));
  }
  if (p.kind === "lcode") {
    const letters = p.shown.map((x) => idx(x[0]));
    const nums = p.shown.map((x) => Number(x.slice(1)));
    if (!nums.every((n, i) => n === letters[i] + 1)) return false;
    const t = extend(letters, 1);
    if (t === null || t[0] < 0 || t[0] > 25) return false;
    return A === `${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[t[0]]}${t[0] + 1}`;
  }
  if (p.kind === "lpairs") {
    const first = p.shown.map((x) => idx(x[0]));
    if (!p.shown.every((x) => idx(x[0]) + idx(x[1]) === 25)) return false;
    const t = extend(first, 1);
    if (t === null || t[0] < 0 || t[0] > 25) return false;
    return A === "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[t[0]] + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[25 - t[0]];
  }
  if (p.kind === "code") {
    if (p.w1.length !== p.c1.length) return false;
    const offs = [...p.w1].map((c, i) => (((idx(p.c1[i]) - idx(c)) % 26) + 26) % 26);
    const hyps = [];
    if (offs.every((o) => o === offs[0]) && offs[0] !== 0) hyps.push((c, i, back) => (idx(c) + (back ? -offs[0] : offs[0]) + 26) % 26);
    if (offs.every((o, i) => o === i + 1)) hyps.push((c, i, back) => (idx(c) + (back ? -(i + 1) : i + 1) + 26) % 26);
    if ([...p.w1].every((c, i) => idx(p.c1[i]) === 25 - idx(c))) hyps.push((c) => 25 - idx(c));
    if (hyps.length !== 1) return false;
    const want = [...p.asked].map((c, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[hyps[0](c, i, p.decode)]).join("");
    return A === want;
  }
  return false;
}

// Smallest repeat length of a list that is seen at least twice in it (0 if none).
function period(xs) {
  for (let p = 1; 2 * p <= xs.length; p++) if (xs.every((x, i) => i < p || x === xs[i - p])) return p;
  return 0;
}
const FILLED = "▲●■◆★";
const HOLLOW = "△○□◇☆";
const shapeOf = (c) => Math.max(FILLED.indexOf(c), HOLLOW.indexOf(c));
const fillOf = (c) => (FILLED.includes(c) ? 0 : HOLLOW.includes(c) ? 1 : -1);
const symOf = (s, f) => (f ? HOLLOW : FILLED)[s];

function verifyShapes(p, question, answer) {
  const A = String(answer);
  if (question.answerType === "choice" && !question.choices.includes(A)) return false;
  if (p.kind === "cycle") {
    const per = period(p.shown);
    if (!per) return false;
    const at = (n) => p.shown[(n - 1) % per];
    if (p.count) return A === [...Array(p.count)].map((_, i) => at(p.at + i)).join(" ");
    return A === at(p.at);
  }
  if (p.kind === "arrow") {
    const dirs = p.shown.map((c) => "↑↗→↘↓↙←↖".indexOf(c));
    if (dirs.includes(-1)) return false;
    const steps = dirs.slice(1).map((d, i) => (d - dirs[i] + 8) % 8);
    if (!steps.every((s) => s === steps[0]) || steps[0] === 0 || steps[0] === 4) return false;
    return A === "↑↗→↘↓↙←↖"[(dirs[dirs.length - 1] + steps[0] * (p.at - p.shown.length)) % 8];
  }
  const shapes = p.shown.map(shapeOf);
  const fills = p.shown.map(fillOf);
  if (shapes.includes(-1) || fills.includes(-1)) return false;
  const ps = period(shapes);
  const pf = period(fills);
  if (!ps || !pf || ps === pf) return false;
  const itemN = (n) => symOf(shapes[(n - 1) % ps], fills[(n - 1) % pf]);
  if (p.kind === "two") return A === itemN(p.at);
  let c = 0;
  for (let n = 1; n <= p.N; n++) {
    const it = itemN(n);
    if (p.kind === "countFill" ? fillOf(it) === 0 : it === p.sym) c++;
  }
  return toInt(answer) === c;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  try {
    if (["next", "next2", "nth", "over", "missing"].includes(p.kind)) {
      if (question.answerType === "choice" && !question.choices.includes(String(answer))) return false;
      return verifyNumbers(p, answer);
    }
    if (["lseq", "lcode", "lpairs", "code"].includes(p.kind)) return verifyLetters(p, question, answer);
    if (["cycle", "arrow", "two", "countFill", "countSym"].includes(p.kind)) return verifyShapes(p, question, answer);
  } catch {
    return false;
  }
  return false;
}
