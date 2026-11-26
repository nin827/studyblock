// Management generator. Uses only the seeded rng passed in by the engine.
// Subtopics: motivation (Maslow, Herzberg), leadership (styles, McGregor X/Y), structure (span of
// control, levels, chain of command, delayering; small computed questions) and porter (Porter's
// generic strategies). Standard textbook frameworks only; firms and people are made up.
// Compound options use segmented choices (`choiceCols` + array choices); every wrong option differs
// from the right one in some columns but never all of them.
// params.kind tells verify() how to recheck. verify() never trusts the generator's answer: it
// rebuilds the expected answer from params with its own rule tables (or by counting/brute force).

// ---------------------------------------------------------------------------------------------
// Shared helpers

const segsOf = (c) => (Array.isArray(c) ? c.map(String) : String(c).split(" | "));
const keyOf = (t) => segsOf(t).join(" | ");
const diffCount = (a, b) => a.reduce((n, s, i) => n + (s !== b[i] ? 1 : 0), 0);

// A segmented choice: the right tuple plus wrong tuples that differ in 1..n-1 columns. Easy has
// exactly 3 options, other levels 5. `extraSegs` ([[column label, value]]) are Build-mode decoys:
// every value seen in the candidates (plus `extra`) that no option already shows in that column.
const OPTION_COUNT = { easy: 3, medium: 5, hard: 5, expert: 5 };
const MIN_DECOYS = { easy: 1, medium: 3, hard: 6, expert: 9 };
// Mixed distances (ticket 022): some wrong option differs in 2+ columns, and the answer is not the
// strictly most common value in every column.
function mixOk(tuples, correct) {
  const wrong = tuples.filter((t) => keyOf(t) !== keyOf(correct));
  if (!wrong.some((t) => diffCount(t, correct) >= 2)) return false;
  const major = (j) => {
    const cnt = (v) => tuples.filter((t) => t[j] === v).length;
    return tuples.every((t) => t[j] === correct[j] || cnt(t[j]) < cnt(correct[j]));
  };
  return !correct.every((_, j) => major(j));
}
// Counting attack: the answer is the only option with the highest sum of its values' counts.
function countPick(tuples, correct) {
  const cnt = (j, v) => tuples.filter((t) => t[j] === v).length;
  const score = (t) => t.reduce((s, v, j) => s + cnt(j, v), 0);
  const a = score(correct), key = keyOf(correct);
  return tuples.every((t) => keyOf(t) === key || score(t) < a);
}
function segChoice(cols, correct, candidates, rng, diff, extra = []) {
  const n = cols.length;
  const want = OPTION_COUNT[diff];
  const ok = [];
  const seen = new Set([keyOf(correct)]);
  for (const c of candidates) {
    const d = c.length === n ? diffCount(c, correct) : 0;
    if (d < 1 || (n > 2 && d >= n) || seen.has(keyOf(c))) continue;
    seen.add(keyOf(c));
    ok.push(c);
  }
  // Redraw (same rng) until the option set cannot be solved by counting.
  // A set that is only mixOk is kept as a fallback if no set also beats counting.
  let wrong = [], fallback = [];
  for (let tries = 0; tries < 600; tries++) {
    wrong = rng.shuffle(ok).slice(0, want - 1);
    if (wrong.length === want - 1 && mixOk([correct, ...wrong], correct)) {
      if (!countPick([correct, ...wrong], correct)) break;
      if (!fallback.length) fallback = wrong;
    }
    wrong = [];
  }
  if (!wrong.length) wrong = fallback;
  if (wrong.length !== want - 1) throw new Error("not enough segmented options");
  const shown = cols.map((_, i) => new Set([correct, ...wrong].map((t) => t[i])));
  const extraSegs = [];
  const add = (i, v) => { if (!shown[i].has(v)) { shown[i].add(v); extraSegs.push([cols[i], v]); } };
  for (const c of candidates) c.forEach((v, i) => add(i, v));
  for (const [col, v] of extra) add(cols.indexOf(col), v);
  return { answerType: "choice", choiceCols: cols, choices: rng.shuffle([correct, ...wrong]), answer: correct, extraSegs: extraSegs.slice(0, 14) };
}

function plainChoice(correct, candidates, rng, max = 4) {
  const wrong = rng.shuffle(candidates.filter((c) => c !== correct)).slice(0, max - 1);
  return { answerType: "choice", choices: rng.shuffle([correct, ...wrong]), answer: correct };
}

// Choice check shared by verify(): shape, distinct options, exactly one right, wrong options never
// differ in every column, and `answer` is that right option.
function choiceOk(q, answer, isRight) {
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length < 2 || ch.length > 6) return false;
  const tuples = ch.map(segsOf);
  const n = q.choiceCols ? q.choiceCols.length : 1;
  if (q.choiceCols && (n < 2 || n > 4)) return false;
  if (tuples.some((t) => t.length !== n)) return false;
  if (new Set(tuples.map((t) => t.join(" | "))).size !== tuples.length) return false;
  const right = tuples.filter((t) => isRight(t));
  if (right.length !== 1) return false;
  if (n > 2 && tuples.some((t) => diffCount(t, right[0]) === n)) return false;
  const a = segsOf(answer);
  if (a.length !== n || diffCount(a, right[0]) !== 0) return false;
  if (!q.choiceCols) return true;
  // Segmented: option count by level, enough Build decoys, and no other block combination right.
  const diff = q.params && q.params.diff;
  if (!OPTION_COUNT[diff] || tuples.length !== OPTION_COUNT[diff]) return false;
  const pools = q.choiceCols.map((_, i) => new Set(tuples.map((t) => t[i])));
  for (const [col, v] of Array.isArray(q.extraSegs) ? q.extraSegs : []) {
    const i = q.choiceCols.indexOf(col);
    if (i < 0 || typeof v !== "string" || !v) return false;
    pools[i].add(v);
  }
  const decoys = pools.reduce((s, p) => s + p.size - 1, 0);
  if (decoys < MIN_DECOYS[diff]) return false;
  let rightCombos = 0;
  const walk = (i, acc) => {
    if (i === n) { if (isRight(acc)) rightCombos++; return; }
    for (const v of pools[i]) walk(i + 1, [...acc, v]);
  };
  walk(0, []);
  return rightCombos === 1;
}

const eqT = (want) => (t) => t.length === want.length && diffCount(t, want) === 0;

const PEOPLE = ["Ana", "Ben", "Chloe", "Dev", "Ella", "Femi", "Grace", "Hugo", "Isla", "Jon", "Kai", "Lena", "Max", "Nia", "Omar", "Priya", "Raj", "Sara", "Tom", "Uma", "Vic", "Wen", "Yara", "Zoe"];
const FIRMS = ["Brightway", "Northfield Food Co", "Kestrel Print", "Bluewater Tool Co", "Oakridge Hotel Group", "Pinecrest Freight", "Redfern Bakery", "Silverline Software", "Harbour Café Co", "Tallow & Wick", "Meadow Dairy", "Ironbridge Engineering"];

function checkDifficulty(d) {
  if (!["easy", "medium", "hard", "expert"].includes(d)) throw new Error(`unknown difficulty ${d}`);
}

// ---------------------------------------------------------------------------------------------
// Motivation: Maslow and Herzberg

const MASLOW = ["Physiological", "Safety", "Social", "Esteem", "Self-actualisation"];
const HERZ = ["Hygiene factor", "Motivator"];
const HERZ_EFFECT = { "Hygiene factor": "Removes dissatisfaction", Motivator: "Increases motivation" };
const EFFECTS = ["Removes dissatisfaction", "Increases motivation", "Has no effect at all", "Causes dissatisfaction"];

// m: Maslow level index (or null), h: Herzberg index (or null).
const MOT_ITEMS = [
  { id: "pay", text: "a pay rise that covers the rising cost of food and rent", m: 0, h: 0 },
  { id: "breaks", text: "proper rest breaks and a heated staff room", m: 0, h: 0 },
  { id: "meals", text: "free hot meals in the staff canteen", m: 0, h: null },
  { id: "contract", text: "a permanent contract instead of a temporary one", m: 1, h: 0 },
  { id: "ppe", text: "safety equipment and a safer factory floor", m: 1, h: 0 },
  { id: "pension", text: "a company pension and sick-pay scheme", m: 1, h: 0 },
  { id: "colleagues", text: "good relationships with friendly colleagues", m: 2, h: 0 },
  { id: "socials", text: "team social events and a staff sports club", m: 2, h: null },
  { id: "praise", text: "public praise from the manager for good work", m: 3, h: 1 },
  { id: "award", text: "an employee-of-the-month award", m: 3, h: 1 },
  { id: "promotion", text: "promotion to a senior role", m: 3, h: 1 },
  { id: "office", text: "a bigger office and a grander job title", m: 3, h: 0 },
  { id: "creative", text: "challenging, creative work that uses their full potential", m: 4, h: 1 },
  { id: "training", text: "training to develop new skills and grow as a person", m: 4, h: 1 },
  { id: "responsibility", text: "responsibility for running a whole project", m: null, h: 1 },
  { id: "achievement", text: "the chance to achieve a difficult target", m: null, h: 1 },
  { id: "supervision", text: "fair, less heavy-handed supervision", m: null, h: 0 },
  { id: "policy", text: "clearer and fairer company rules and policies", m: null, h: 0 },
];

const motHints = {
  maslow: ["Maslow's five levels, bottom to top: physiological (food, rest, basic pay), safety (security, safe work), social (belonging, colleagues), esteem (status, recognition), self-actualisation (reaching your potential).", "Ask which need the scheme satisfies, not how valuable it is."],
  herz: ["Herzberg's hygiene factors are about the job's surroundings: pay, conditions, security, supervision, policies, status and relationships.", "Motivators are about the work itself: achievement, recognition, responsibility, advancement and personal growth."],
};

function genMotivation(diff, rng) {
  const name = rng.pick(PEOPLE);
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    if (rng.next() < 0.55) {
      const it = rng.pick(MOT_ITEMS.filter((x) => x.m !== null));
      const c = plainChoice(MASLOW[it.m], MASLOW, rng);
      return {
        prompt: `${firm} offers ${name} ${it.text}. Using **Maslow's hierarchy of needs**, which level of need does this mainly meet?`,
        ...c,
        explanation: `${it.text[0].toUpperCase()}${it.text.slice(1)} meets a **${MASLOW[it.m].toLowerCase()}** need (level ${it.m + 1} of 5).`,
        hints: motHints.maslow,
        params: { diff, kind: "maslow", item: it.id },
      };
    }
    const it = rng.pick(MOT_ITEMS.filter((x) => x.h !== null));
    return {
      prompt: `${firm} offers its staff ${it.text}. Under **Herzberg's two-factor theory**, is this a hygiene factor or a motivator?`,
      answerType: "choice",
      choices: HERZ.slice(),
      answer: HERZ[it.h],
      explanation: `It is a **${HERZ[it.h].toLowerCase()}**: ${it.h === 0 ? "it is about the conditions around the job, so lacking it causes dissatisfaction" : "it comes from the work itself, so it can actively motivate"}.`,
      hints: motHints.herz,
      params: { diff, kind: "herz", item: it.id },
    };
  }
  if (diff === "medium") {
    if (rng.next() < 0.5) {
      const it = rng.pick(MOT_ITEMS.filter((x) => x.h !== null));
      const correct = [HERZ[it.h], HERZ_EFFECT[HERZ[it.h]]];
      const cands = [];
      for (const h of HERZ) for (const e of EFFECTS) cands.push([h, e]);
      return {
        prompt: `${firm} improves ${it.text}. Using **Herzberg's two-factor theory**, what kind of factor is this, and what does improving it do?`,
        ...segChoice(["Factor", "Effect of improving it"], correct, cands, rng, diff),
        explanation: `It is a **${HERZ[it.h].toLowerCase()}**. ${it.h === 0 ? "Improving a hygiene factor **removes dissatisfaction**, but Herzberg says it does not motivate on its own." : "Improving a motivator **increases motivation**, because it comes from the job itself."}`,
        hints: [...motHints.herz, "Herzberg: hygiene factors only stop people being unhappy; motivators make them want to work harder."],
        params: { diff, kind: "herzeffect", item: it.id },
      };
    }
    const met = rng.int(0, 3);
    const up = met < 3 ? rng.next() < 0.6 : false;
    const lvl = up ? met + 1 : met;
    const ask = up
      ? `${name}'s ${MASLOW[met].toLowerCase()} needs are now met. According to **Maslow's hierarchy**, which level of need motivates ${name} next?`
      : `According to **Maslow's hierarchy**, ${name} is now motivated by ${MASLOW[met + 1].toLowerCase()} needs. Which level must already have been met (the level just below)?`;
    const c = plainChoice(MASLOW[lvl], MASLOW, rng);
    return {
      prompt: `${name} works at ${firm}. ${ask}`,
      ...c,
      explanation: `Maslow's levels, bottom to top: ${MASLOW.join(" → ")}. ${up ? `The level after ${MASLOW[met].toLowerCase()} is **${MASLOW[lvl].toLowerCase()}**.` : `The level below ${MASLOW[met + 1].toLowerCase()} is **${MASLOW[lvl].toLowerCase()}**.`}`,
      hints: ["List Maslow's five levels from the bottom: physiological, safety, social, esteem, self-actualisation.", "People move up one level at a time once the lower need is met."],
      params: { diff, kind: "maslowstep", met, up },
    };
  }
  // hard
  if (rng.next() < 0.6) {
    const it = rng.pick(MOT_ITEMS.filter((x) => x.m !== null && x.h !== null));
    const correct = [MASLOW[it.m], HERZ[it.h]];
    const cands = [];
    for (const m of MASLOW) for (const h of HERZ) cands.push([m, h]);
    return {
      prompt: `${firm} introduces ${it.text}. Classify it with **both** frameworks: which **Maslow** level does it meet, and is it a **Herzberg** hygiene factor or motivator?`,
      ...segChoice(["Maslow level", "Herzberg"], correct, cands, rng, diff, [["Herzberg", "Neither"]]),
      explanation: `Maslow: a **${MASLOW[it.m].toLowerCase()}** need. Herzberg: a **${HERZ[it.h].toLowerCase()}**.${it.id === "office" ? " Status meets esteem needs for Maslow, but Herzberg lists status as a hygiene factor." : ""}`,
      hints: [motHints.maslow[0], motHints.herz[0] + " " + motHints.herz[1]],
      params: { diff, kind: "both", item: it.id },
    };
  }
  const mot = rng.pick(MOT_ITEMS.filter((x) => x.h === 1));
  const hyg = rng.shuffle(MOT_ITEMS.filter((x) => x.h === 0)).slice(0, 3);
  const opts = [mot, ...hyg].map((x) => x.text[0].toUpperCase() + x.text.slice(1));
  const answer = opts[0];
  return {
    prompt: `The managers at ${firm} want staff to work harder, not just complain less. Under **Herzberg's two-factor theory**, which change is most likely to actually motivate them?`,
    answerType: "choice",
    choices: rng.shuffle(opts),
    answer,
    explanation: `Only **${mot.text}** is a motivator. The others are hygiene factors: they remove dissatisfaction but, says Herzberg, do not motivate.`,
    hints: motHints.herz,
    params: { diff, kind: "pickmotivator", items: [mot.id, ...hyg.map((x) => x.id)] },
  };
}

// ---------------------------------------------------------------------------------------------
// Leadership: styles and McGregor

const STYLES = ["Autocratic", "Democratic", "Laissez-faire", "Paternalistic"];
const STYLE_BEHAVIOUR = {
  Autocratic: [
    "makes every decision alone and tells staff exactly what to do",
    "sets strict rules, checks work closely and does not ask for opinions",
    "gives orders in a weekly briefing and expects them to be followed without discussion",
    "decides the new rota without asking anyone and posts it on the wall",
    "keeps information back and only passes down instructions",
  ],
  Democratic: [
    "holds a team meeting, asks for ideas and lets the group vote on the plan",
    "discusses options with staff and makes the final choice with their input",
    "shares the problem with the team and builds the decision around their suggestions",
    "asks staff to help set their own targets before agreeing them",
    "runs a workshop where everyone helps design the new process",
  ],
  "Laissez-faire": [
    "sets a broad goal and leaves the team to decide how to reach it",
    "gives skilled staff complete freedom and only steps in if asked",
    "lets the design team set their own deadlines and methods with little direction",
    "hands the whole project to the team and rarely checks on progress",
  ],
  Paternalistic: [
    "decides alone but explains how each decision protects staff welfare",
    "makes the choices personally, acting like a caring parent who knows what is best for staff",
    "chooses the new benefits without consulting staff, believing they are in staff's best interests",
    "makes decisions centrally but puts staff wellbeing and social needs first",
  ],
};
const DECIDER = { Autocratic: "Manager alone, orders only", Democratic: "Manager with team input", "Laissez-faire": "Team members themselves", Paternalistic: "Manager, staff welfare first" };
const WHO_TXT = { Autocratic: "the manager alone, who simply gives orders", Democratic: "the manager, after taking the team's input", "Laissez-faire": "the team members themselves", Paternalistic: "the manager, who puts staff welfare first" };
const COMMS = { Autocratic: "One-way, top down", Democratic: "Two-way, with discussion", "Laissez-faire": "Little direction given", Paternalistic: "Top down, with explanation" };
const MCG = ["Theory X", "Theory Y"];
const STYLE_VIEW = { Autocratic: "Theory X", Democratic: "Theory Y", "Laissez-faire": "Theory Y" };
const X_BELIEFS = [
  "most workers dislike work and avoid it if they can",
  "staff only work hard if they are closely watched",
  "employees mainly work for money and need the threat of punishment",
  "workers avoid responsibility and prefer to be told what to do",
  "people need strict targets and checks or they will slack off",
];
const Y_BELIEFS = [
  "most workers enjoy work when it is meaningful",
  "staff will seek out responsibility under the right conditions",
  "employees can direct themselves towards goals they believe in",
  "people are creative and want to use their ideas at work",
  "workers are motivated by achievement, not just pay",
];

const styleHints = [
  "Ask who makes the decision: the manager alone (autocratic or paternalistic), the manager with the team (democratic), or the team itself (laissez-faire).",
  "Paternalistic leaders also decide alone, but explain and put staff welfare first.",
];
const mcgHints = ["McGregor's Theory X manager assumes people are lazy and need control; a Theory Y manager assumes people enjoy work and seek responsibility.", "Theory X managers tend to lead autocratically; Theory Y managers tend to consult and delegate."];

function pickBehaviour(rng, styles) {
  const style = rng.pick(styles);
  const idx = rng.int(0, STYLE_BEHAVIOUR[style].length - 1);
  return { style, idx, text: STYLE_BEHAVIOUR[style][idx] };
}

function genLeadership(diff, rng) {
  const name = rng.pick(PEOPLE);
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    if (rng.next() < 0.6) {
      const b = pickBehaviour(rng, STYLES);
      return {
        prompt: `${name}, a manager at ${firm}, ${b.text}. Which **leadership style** is this?`,
        answerType: "choice",
        choices: rng.shuffle(STYLES.slice()),
        answer: b.style,
        explanation: `This is **${b.style.toLowerCase()}** leadership: decisions are made by ${WHO_TXT[b.style]}.`,
        hints: styleHints,
        params: { diff, kind: "style", style: b.style, idx: b.idx },
      };
    }
    const y = rng.next() < 0.5;
    const list = y ? Y_BELIEFS : X_BELIEFS;
    const idx = rng.int(0, list.length - 1);
    return {
      prompt: `${name}, a manager at ${firm}, believes that ${list[idx]}. Which of **McGregor's** theories does this belief match?`,
      answerType: "choice",
      choices: MCG.slice(),
      answer: MCG[y ? 1 : 0],
      explanation: `This is a **${MCG[y ? 1 : 0]}** view: ${y ? "people want to work and can be trusted" : "people dislike work and must be controlled"}.`,
      hints: mcgHints.slice(0, 1),
      params: { diff, kind: "mcg", y, idx },
    };
  }
  if (diff === "medium") {
    if (rng.next() < 0.5) {
      const y = rng.next() < 0.5;
      const list = y ? Y_BELIEFS : X_BELIEFS;
      const idx = rng.int(0, list.length - 1);
      const view = MCG[y ? 1 : 0];
      const style = y ? "Democratic" : "Autocratic";
      // Only clearly wrong pairings: no (Theory Y, laissez-faire) or (Theory X, paternalistic).
      const pool = y ? ["Autocratic", "Democratic", "Paternalistic", "Bureaucratic"] : ["Autocratic", "Democratic", "Laissez-faire", "Charismatic"];
      const cands = [];
      for (const v of MCG) for (const st of pool) cands.push([v, st]);
      return {
        prompt: `${name}, a manager at ${firm}, believes that ${list[idx]}. Which **McGregor** theory is this, and which leadership style is ${name} most likely to use?`,
        ...segChoice(["McGregor", "Likely style"], [view, style], cands, rng, diff),
        explanation: `The belief is **${view}**. ${y ? "A manager who trusts staff tends to involve them: **democratic**." : "A manager who distrusts staff tends to control them: **autocratic**."}`,
        hints: mcgHints,
        params: { diff, kind: "mcgstyle", y, idx },
      };
    }
    const b = pickBehaviour(rng, STYLES);
    const cands = [];
    for (const s of STYLES) for (const s2 of STYLES) cands.push([s, DECIDER[s2]]);
    return {
      prompt: `${name}, a manager at ${firm}, ${b.text}. Which **leadership style** is this, and who effectively makes the decisions?`,
      ...segChoice(["Style", "Who decides"], [b.style, DECIDER[b.style]], cands, rng, diff),
      explanation: `**${b.style}**: decisions are made by **${WHO_TXT[b.style]}**.`,
      hints: styleHints,
      params: { diff, kind: "stylewho", style: b.style, idx: b.idx },
    };
  }
  // hard
  if (rng.next() < 0.5) {
    const b = pickBehaviour(rng, ["Autocratic", "Democratic", "Laissez-faire"]);
    const cands = [];
    for (const s of STYLES) for (const v of MCG) cands.push([s, v]);
    return {
      prompt: `At ${firm}, ${name} ${b.text}. Name the **leadership style**, and the **McGregor** assumption about workers that it reflects.`,
      ...segChoice(["Style", "McGregor"], [b.style, STYLE_VIEW[b.style]], cands, rng, diff, [["Style", "Bureaucratic"], ["Style", "Charismatic"]]),
      explanation: `The behaviour is **${b.style.toLowerCase()}**. ${b.style === "Autocratic" ? "Close control reflects **Theory X**: staff are not trusted." : "Trusting staff with decisions reflects **Theory Y**."}`,
      hints: [styleHints[0], mcgHints[1]],
      params: { diff, kind: "styleview", style: b.style, idx: b.idx },
    };
  }
  const b = pickBehaviour(rng, STYLES);
  const cands = [];
  for (const s of STYLES) for (const d of STYLES) for (const c of STYLES) cands.push([s, DECIDER[d], COMMS[c]]);
  return {
    prompt: `At ${firm}, ${name} ${b.text}. Describe this **leadership style**: its name, who decides, and how communication flows.`,
    ...segChoice(["Style", "Who decides", "Communication"], [b.style, DECIDER[b.style], COMMS[b.style]], cands, rng, diff),
    explanation: `**${b.style}** leadership: decisions are made by ${WHO_TXT[b.style]}; communication is ${COMMS[b.style].toLowerCase()}.`,
    hints: [...styleHints, "Autocratic: orders flow down. Democratic: ideas flow both ways. Laissez-faire: the manager gives little direction. Paternalistic: orders flow down but are explained."],
    params: { diff, kind: "style3", style: b.style, idx: b.idx },
  };
}

// ---------------------------------------------------------------------------------------------
// Organisational structure

const CHAIN = ["Chief executive", "Operations director", "Regional manager", "Store manager", "Department supervisor", "Team leader", "Sales assistant"];
const STRUCT_HINTS = {
  span: ["Span of control = the number of people who report **directly** to one manager."],
  levels: ["Levels of hierarchy count every layer, including the person at the top and the bottom layer.", "With the same span s on every level, each level has s times as many people as the one above."],
};

function genStructure(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    const r = rng.next();
    if (r < 0.35) {
      const k = rng.int(3, 9);
      const boss = rng.pick(PEOPLE);
      const team = rng.shuffle(PEOPLE.filter((p) => p !== boss)).slice(0, k);
      const deeper = rng.pick(PEOPLE.filter((p) => p !== boss && !team.includes(p)));
      const under = team[0];
      return {
        prompt: `At ${firm}, these people report directly to ${boss}: ${team.join(", ")}. ${deeper} reports to ${under}, not to ${boss}. What is ${boss}'s **span of control**?`,
        answerType: "number", answer: k, tolerance: 0,
        explanation: `Count only direct reports: ${team.length} people. ${deeper} reports to ${under}, so is not counted. Span of control = **${k}**.`,
        hints: STRUCT_HINTS.span,
        params: { diff, kind: "span", team, deeper },
      };
    }
    if (r < 0.7) {
      const L = rng.int(3, 4), s = rng.int(2, 6);
      const ans = s ** (L - 1);
      return {
        prompt: `${firm} has **${L} levels of hierarchy** with one person at the top. Every manager has a **span of control of ${s}**. How many people work on the bottom level?`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `Each level has ${s} times as many people as the one above: ${Array.from({ length: L }, (_, i) => s ** i).join(" → ")}. The bottom level has **${ans}**.`,
        hints: STRUCT_HINTS.levels,
        given: [{ label: "_s", value: s }, { label: "_levels", value: L }],
        params: { diff, kind: "bottom", L, s },
      };
    }
    const L1 = rng.int(3, 7);
    let L2 = rng.int(3, 7);
    if (L2 === L1) L2 = L1 === 7 ? 3 : L1 + 1;
    const taller = L1 > L2;
    const correct = [taller ? "Taller" : "Flatter", taller ? "Narrower" : "Wider"];
    const cands = [["Taller", "Narrower"], ["Taller", "Wider"], ["Flatter", "Narrower"], ["Flatter", "Wider"]];
    return {
      prompt: `${firm} has **${L1} levels** of hierarchy. A rival with the same number of staff has **${L2} levels**. Compared with the rival, ${firm}'s structure is…`,
      ...segChoice(["Structure", "Spans of control"], correct, cands, rng, diff),
      explanation: `More levels means a **taller** structure. With the same number of staff spread over ${taller ? "more" : "fewer"} levels, each manager has ${taller ? "fewer" : "more"} direct reports, so spans are **${taller ? "narrower" : "wider"}**.`,
      hints: ["More levels for the same number of people means a taller structure.", "Tall structures have narrow spans of control; flat structures have wide spans."],
      params: { diff, kind: "tallflat", L1, L2 },
    };
  }
  if (diff === "medium") {
    const r = rng.next();
    if (r < 0.35) {
      const L = rng.int(3, 5), s = rng.int(3, 7);
      const ans = Array.from({ length: L }, (_, i) => s ** i).reduce((a, b) => a + b, 0);
      if (ans > 3000) return genStructure("medium", rng);
      return {
        prompt: `${firm} has **${L} levels of hierarchy**: one chief executive at the top, and every manager has a **span of control of ${s}**. How many people work at ${firm} in total, counting every level?`,
        answerType: "number", answer: ans, tolerance: 0,
        explanation: `People on each level: ${Array.from({ length: L }, (_, i) => s ** i).join(" + ")} = **${ans}**.`,
        hints: STRUCT_HINTS.levels,
        given: [{ label: "_s", value: s }, { label: "_levels", value: L }],
        params: { diff, kind: "total", L, s },
      };
    }
    if (r < 0.65) {
      const len = rng.int(5, 7);
      const chain = CHAIN.slice(0, len);
      const i = rng.int(0, len - 3);
      const j = rng.int(i + 2, len - 1);
      return {
        prompt: `The **chain of command** at ${firm}, from top to bottom, is: ${chain.join(" → ")}. An instruction from the ${chain[i].toLowerCase()} is passed down the chain to a ${chain[j].toLowerCase()}. How many people pass it on in between (not counting the sender or the receiver)?`,
        answerType: "number", answer: j - i - 1, tolerance: 0,
        explanation: `Between the ${chain[i].toLowerCase()} and the ${chain[j].toLowerCase()} are: ${chain.slice(i + 1, j).join(", ")}. That is **${j - i - 1}** people.`,
        hints: ["Find the sender and receiver in the chain, then count only the roles strictly between them."],
        params: { diff, kind: "chain", len, i, j },
      };
    }
    const L1 = rng.int(3, 7);
    let L2 = rng.int(3, 7);
    if (L2 === L1) L2 = L1 === 3 ? 4 : L1 - 1;
    const sA = L1 > L2 ? rng.int(3, 5) : rng.int(8, 12);
    const sB = L1 > L2 ? rng.int(8, 12) : rng.int(3, 5);
    const taller = L1 > L2;
    const correct = [taller ? "Taller" : "Flatter", taller ? "Narrower" : "Wider", taller ? "Slower" : "Faster"];
    const cands = [];
    for (const a of ["Taller", "Flatter"]) for (const b of ["Narrower", "Wider"]) for (const c of ["Slower", "Faster"]) cands.push([a, b, c]);
    return {
      prompt: `${firm} has **${L1} levels** of hierarchy and managers with an average span of control of **${sA}**. A rival has **${L2} levels** and an average span of **${sB}**. Compared with the rival, describe ${firm}'s structure and how quickly messages pass from top to bottom.`,
      ...segChoice(["Structure", "Spans of control", "Communication"], correct, cands, rng, diff),
      explanation: `${L1} levels against ${L2} makes ${firm} **${correct[0].toLowerCase()}**. A span of ${sA} against ${sB} is **${correct[1].toLowerCase()}**. ${taller ? "More" : "Fewer"} layers means messages pass through ${taller ? "more" : "fewer"} people, so vertical communication is **${correct[2].toLowerCase()}**.`,
      hints: ["Compare the number of levels first, then the spans.", "Each extra layer is another person a message has to pass through."],
      params: { diff, kind: "compare", L1, L2, sA, sB },
    };
  }
  if (diff === "hard") {
    if (rng.next() < 0.5) {
      const M = rng.int(3, 8), K = rng.int(3, 6), W = rng.int(4, 9);
      return {
        prompt: `${firm} has 1 chief executive, **${M} managers** who report to the chief executive, **${K} supervisors** under each manager, and **${W} workers** under each supervisor. It **delayers** by removing every supervisor job; the workers now report straight to the managers.`,
        answerType: "multi",
        parts: [
          { id: "cut", label: "Jobs cut", ask: "How many supervisor jobs are removed?", answerType: "number", answer: M * K, tolerance: 0, hint: "Every manager had the same number of supervisors." },
          { id: "span", label: "New span", ask: "What is each manager's new span of control?", answerType: "number", answer: K * W, tolerance: 0, hint: "Each manager now has all the workers who used to report to that manager's supervisors." },
          { id: "levels", label: "Levels", ask: "How many levels of hierarchy are there now?", answerType: "number", answer: 3, tolerance: 0, hint: "Count the layers left: who is at the top, in the middle and at the bottom?" },
        ],
        explanation: `- Supervisor jobs: ${M} × ${K} = **${M * K}**\n- Each manager now leads ${K} × ${W} = **${K * W}** workers\n- Levels left: chief executive, managers, workers = **3** (one fewer than before)`,
        given: [{ label: "_managers", value: M }, { label: "_supervisors", value: K }, { label: "_workers", value: W }],
        params: { diff, kind: "delayer", M, K, W },
      };
    }
    const s = rng.int(3, 6), L = rng.int(3, 5);
    const W = s ** (L - 1);
    if (W > 1300) return genStructure("hard", rng);
    const managers = Array.from({ length: L - 1 }, (_, i) => s ** i).reduce((a, b) => a + b, 0);
    return {
      prompt: `${firm} has **${W} front-line staff** on the bottom level. Every manager above them has a **span of control of exactly ${s}**, all the way up to a single chief executive. How many managers (every level above the front-line staff, including the chief executive) does ${firm} have?`,
      answerType: "number", answer: managers, tolerance: 0,
      explanation: `Work upwards, dividing by ${s} each time: ${Array.from({ length: L - 1 }, (_, i) => W / s ** (i + 1)).join(", ")}. Total managers = ${Array.from({ length: L - 1 }, (_, i) => W / s ** (i + 1)).join(" + ")} = **${managers}**.`,
      hints: ["The level above the front-line staff has (staff ÷ span) managers.", "Keep dividing by the span until you reach 1 person, then add up every level above the staff."],
      given: [{ label: "_staff", value: W }, { label: "_s", value: s }],
      params: { diff, kind: "managers", W, s },
    };
  }
  // expert: working backwards from a maximum span
  if (rng.next() < 0.55) {
    const s = rng.int(3, 8);
    let W = rng.int(40, 900);
    if (W % s === 0) W += 1;
    const levels = [W];
    while (levels[levels.length - 1] > 1) levels.push(Math.ceil(levels[levels.length - 1] / s));
    const above = levels[1];
    const total = levels.slice(1).reduce((a, b) => a + b, 0);
    return {
      prompt: `${firm} is planning a new division with **${W} front-line staff**. No manager may have **more than ${s}** direct reports, and the structure ends in a single head of division. Use as few managers as possible on every level.`,
      answerType: "multi",
      parts: [
        { id: "above", label: "First level", ask: "How many managers are needed on the level directly above the front-line staff?", answerType: "number", answer: above, tolerance: 0, hint: `Divide the staff by the maximum span and round **up**: nobody may have more than ${s} reports.` },
        { id: "levels", label: "Levels", ask: "How many levels of hierarchy are there, counting the front-line staff and the head?", answerType: "number", answer: levels.length, tolerance: 0, hint: "Repeat the divide-and-round-up step until one person is left, then count the levels." },
        { id: "total", label: "Managers", ask: "How many managers are there in total, including the head?", answerType: "number", answer: total, tolerance: 0, hint: "Add the people on every level above the front-line staff." },
      ],
      explanation: `Divide by ${s} and round up at each level: ${levels.join(" → ")}.\n\n- Level above the staff: **${above}** managers\n- Levels: **${levels.length}**\n- Managers: ${levels.slice(1).join(" + ")} = **${total}**`,
      given: [{ label: "_staff", value: W }, { label: "_maxspan", value: s }],
      params: { diff, kind: "plan", W, s },
    };
  }
  const M = rng.int(6, 16);
  const s = rng.int(5, 9);
  const staff = M * s;
  const divisors = [];
  for (let d = 2; d < M; d++) if (staff % d === 0 && staff / d !== s) divisors.push(d);
  if (!divisors.length) return genStructure("expert", rng);
  const M2 = rng.pick(divisors);
  const newSpan = staff / M2;
  const limit = rng.pick([8, 10, 12, 15]);
  const within = newSpan <= limit;
  return {
    prompt: `${firm} has **${M} team managers**, each with a span of control of **${s}** staff. To cut costs it reorganises to **${M2} team managers**, sharing the same staff equally. Its HR policy says no manager should have more than **${limit}** direct reports.`,
    answerType: "multi",
    parts: [
      { id: "staff", label: "Staff", ask: "How many staff report to the team managers in total?", answerType: "number", answer: staff, tolerance: 0, hint: "Managers × span of control." },
      { id: "span", label: "New span", ask: "What is each team manager's new span of control?", answerType: "number", answer: newSpan, tolerance: 0, hint: "Share the same staff between the new number of managers." },
      { id: "ok", label: "Policy", ask: "Does the new structure meet the HR policy?", answerType: "choice", answer: within ? "Yes" : "No", choices: ["Yes", "No"], hint: `Compare the new span with ${limit}.` },
    ],
    explanation: `- Staff: ${M} × ${s} = **${staff}**\n- New span: ${staff} ÷ ${M2} = **${newSpan}**\n- ${newSpan} is ${within ? "within" : "above"} the limit of ${limit}: **${within ? "Yes" : "No"}**`,
    given: [{ label: "_managers", value: M }, { label: "_span", value: s }, { label: "_new", value: M2 }],
    params: { diff, kind: "reorg", M, s, M2, limit },
  };
}

// ---------------------------------------------------------------------------------------------
// Porter's generic strategies

const STRATS = ["Cost leadership", "Differentiation", "Cost focus", "Differentiation focus"];
const SCOPES = ["Broad", "Narrow"];
const ADVS = ["Lower cost", "Uniqueness"];
// Strategy index = scope index * 2 + advantage index.
const PORTER_FIRMS = {
  "Cost leadership": [
    "sells basic groceries to shoppers across the whole country at the lowest prices, using huge bulk orders",
    "runs a no-frills airline on many routes, keeping costs down with one aircraft type and online-only booking",
    "makes standard office paper for every kind of customer in very large, highly automated factories",
    "offers cheap everyday clothing to the mass market, with costs kept low by a lean supply chain",
  ],
  Differentiation: [
    "sells smartphones to the whole market with a premium design and features rivals lack, at a higher price",
    "runs a nationwide coffee chain known for its distinctive stores and service, charging more than rivals",
    "makes cars for all kinds of drivers, famous for reliability and style, priced above competitors",
    "sells sportswear to the mass market with a strong brand and unique fabric technology",
  ],
  "Cost focus": [
    "sells very cheap, basic furniture only to students in university towns",
    "offers the lowest-priced car insurance, but only to drivers aged over 60",
    "runs budget hostels aimed only at backpackers, with minimal facilities",
    "supplies low-cost cleaning products only to small local cafés",
  ],
  "Differentiation focus": [
    "makes handmade racing bikes only for professional cyclists, at very high prices",
    "sells luxury watches to a small group of wealthy collectors",
    "runs a high-end clinic offering bespoke fitness plans only to elite athletes",
    "produces premium left-handed golf clubs with custom fitting",
  ],
};
const porterHints = [
  "Porter's two questions: is the target market **broad** (the whole market) or **narrow** (a niche)? Is the advantage **lower cost** or **uniqueness** (differentiation)?",
  "Broad + lower cost = cost leadership; broad + uniqueness = differentiation; narrow + lower cost = cost focus; narrow + uniqueness = differentiation focus.",
];

const pct = (a, b) => Math.round(((a - b) / b) * 1000) / 10;

function porterData(rng, allowStuck, base) {
  const avgCost = base ? base.avgCost : rng.int(20, 80);
  const avgPrice = base ? base.avgPrice : avgCost + rng.int(5, 30);
  const segs = base ? base.segs : rng.int(4, 8);
  const narrow = rng.next() < 0.5;
  const kind = allowStuck && !narrow && rng.next() < 0.3 ? "stuck" : rng.next() < 0.5 ? "cost" : "diff";
  let cost, price;
  if (kind === "cost") {
    cost = Math.round(avgCost * (rng.int(65, 85) / 100));
    price = Math.round(avgPrice * (rng.int(85, 100) / 100));
  } else if (kind === "diff") {
    cost = Math.round(avgCost * (rng.int(100, 120) / 100));
    price = Math.round(avgPrice * (rng.int(125, 160) / 100));
  } else {
    cost = Math.round(avgCost * (rng.int(96, 104) / 100));
    price = Math.round(avgPrice * (rng.int(95, 105) / 100));
  }
  return { avgCost, avgPrice, segs, served: narrow ? 1 : segs, cost, price };
}

// Independent rule (also used by verify()).
function porterRule(d) {
  const costAdv = d.cost <= d.avgCost * 0.9;
  const priceAdv = d.price >= d.avgPrice * 1.15;
  const scope = d.served === d.segs ? "Broad" : d.served === 1 ? "Narrow" : null;
  if (costAdv === priceAdv || !scope) return null;
  return { scope, adv: costAdv ? "Lower cost" : "Uniqueness" };
}

function porterText(d, who) {
  return `${who}: unit cost **$${d.cost}** (industry average $${d.avgCost}), price **$${d.price}** (industry average $${d.avgPrice}), sells to **${d.served === d.segs ? `all ${d.segs}` : `only 1 of the ${d.segs}`}** customer segments.`;
}
const RULE_TXT = "Treat a unit cost at least 10% below the industry average as a cost advantage, and a price at least 15% above the average (for features buyers value) as uniqueness.";

function genPorter(diff, rng) {
  const firm = rng.pick(FIRMS);
  if (diff === "easy") {
    if (rng.next() < 0.5) {
      const strat = rng.pick(STRATS);
      const idx = rng.int(0, 3);
      return {
        prompt: `${firm} ${PORTER_FIRMS[strat][idx]}. Which of **Porter's generic strategies** is it following?`,
        answerType: "choice", choices: rng.shuffle(STRATS.slice()), answer: strat,
        explanation: `${porterHints[1]} So this is **${strat.toLowerCase()}**.`,
        hints: porterHints.slice(0, 1),
        params: { diff, kind: "pdesc", strat, idx },
      };
    }
    const sc = rng.int(0, 1), ad = rng.int(0, 1);
    const scopeTxt = sc === 0 ? rng.pick(["the whole market", "every type of customer", "the mass market"]) : rng.pick(["one small niche", "a single narrow segment", "one specialist group of buyers"]);
    const advTxt = ad === 0 ? rng.pick(["having the lowest costs", "being cheaper to run than any rival", "keeping costs below competitors'"]) : rng.pick(["offering something unique that buyers will pay more for", "standing out with distinctive features", "a premium product that rivals cannot copy"]);
    const strat = STRATS[sc * 2 + ad];
    return {
      prompt: `Using **Porter's generic strategies**: ${firm} targets ${scopeTxt} and competes by ${advTxt}. Which strategy is this?`,
      answerType: "choice", choices: rng.shuffle(STRATS.slice()), answer: strat,
      explanation: `Scope: **${SCOPES[sc].toLowerCase()}**. Advantage: **${ADVS[ad].toLowerCase()}**. ${porterHints[1]} So: **${strat}**.`,
      hints: porterHints,
      params: { diff, kind: "pattr", sc, ad },
    };
  }
  const cands = [];
  for (const s of SCOPES) for (const a of ADVS) for (const t of STRATS) cands.push([s, a, t]);
  const cols = ["Market scope", "Advantage", "Strategy"];
  if (diff === "medium") {
    const strat = rng.pick(STRATS);
    const idx = rng.int(0, 3);
    const si = STRATS.indexOf(strat);
    const correct = [SCOPES[si >> 1], ADVS[si & 1], strat];
    return {
      prompt: `${firm} ${PORTER_FIRMS[strat][idx]}. Analyse it with **Porter's generic strategies**: its market scope, its source of competitive advantage, and the strategy.`,
      ...segChoice(cols, correct, cands, rng, diff),
      explanation: `Scope: **${correct[0].toLowerCase()}**; advantage: **${correct[1].toLowerCase()}**; so the strategy is **${strat.toLowerCase()}**.`,
      hints: porterHints,
      params: { diff, kind: "pdesc3", strat, idx },
    };
  }
  if (diff === "hard") {
    const d = porterData(rng, false);
    const r = porterRule(d);
    if (!r) return genPorter("hard", rng);
    const strat = STRATS[SCOPES.indexOf(r.scope) * 2 + ADVS.indexOf(r.adv)];
    return {
      prompt: `Industry data. ${porterText(d, firm)} ${RULE_TXT} Which of **Porter's generic strategies** fits?`,
      ...segChoice(cols, [r.scope, r.adv, strat], cands, rng, diff, [["Strategy", "Stuck in the middle"]]),
      explanation: `- Cost: $${d.cost} vs $${d.avgCost} is ${pct(d.cost, d.avgCost)}%\n- Price: $${d.price} vs $${d.avgPrice} is ${pct(d.price, d.avgPrice) > 0 ? "+" : ""}${pct(d.price, d.avgPrice)}%\n- So the advantage is **${r.adv.toLowerCase()}**, the scope is **${r.scope.toLowerCase()}**, and the strategy is **${strat.toLowerCase()}**.`,
      hints: ["Work out the cost and price as a % difference from the industry averages: (firm − average) ÷ average × 100.", porterHints[1]],
      given: [{ label: "_cost", value: d.cost }, { label: "_avgcost", value: d.avgCost }, { label: "_price", value: d.price }, { label: "_avgprice", value: d.avgPrice }],
      params: { diff, kind: "pdata", ...d },
    };
  }
  // expert: two firms, one may be stuck in the middle
  const a = porterData(rng, false);
  const b = porterData(rng, true, a);
  const ra = porterRule(a);
  const stuckB = b.served === b.segs && b.cost > b.avgCost * 0.9 && b.price < b.avgPrice * 1.15;
  const rb = porterRule(b);
  if (!ra || (!rb && !stuckB)) return genPorter("expert", rng);
  const gap = Math.round(((a.avgCost - a.cost) / a.avgCost) * 1000) / 10;
  const exact = ((a.avgCost - a.cost) / a.avgCost) * 100;
  if (Math.abs(exact * 10 - Math.round(exact * 10)) > 0.499 && Math.abs(exact * 10 - Math.round(exact * 10)) < 0.501) return genPorter("expert", rng);
  const name = (r) => (r ? STRATS[SCOPES.indexOf(r.scope) * 2 + ADVS.indexOf(r.adv)] : "Stuck in the middle");
  const opts = [...STRATS, "Stuck in the middle"];
  return {
    prompt: `Two firms in the same industry (unit cost average $${a.avgCost}, price average $${a.avgPrice}, ${a.segs} customer segments).\n\n- ${porterText(a, "**Firm A**")}\n- ${porterText(b, "**Firm B**")}\n\n${RULE_TXT} A broad firm with neither advantage is what Porter calls **stuck in the middle**.`,
    answerType: "multi",
    parts: [
      { id: "gap", label: "Cost gap", ask: "How far below the industry average is Firm A's unit cost, in %? (Negative if above.) Round to 1 decimal place.", answerType: "number", answer: gap, tolerance: 0.05, hint: "(average − Firm A's cost) ÷ average × 100." },
      { id: "a", label: "Firm A", ask: "Which strategy is Firm A following?", answerType: "choice", answer: name(ra), choices: opts.slice(), hint: "Check Firm A's cost, price and scope against the stated thresholds." },
      { id: "b", label: "Firm B", ask: "Which strategy is Firm B following?", answerType: "choice", answer: name(stuckB ? null : rb), choices: opts.slice(), hint: "Does Firm B have either advantage? If it is broad with neither, Porter says it is stuck in the middle." },
    ],
    explanation: `- Firm A's cost gap: (${a.avgCost} − ${a.cost}) ÷ ${a.avgCost} × 100 ≈ **${gap}%**\n- Firm A: **${name(ra)}**\n- Firm B: cost ${pct(b.cost, b.avgCost)}%, price ${pct(b.price, b.avgPrice)}% against the averages, ${b.served === 1 ? "narrow" : "broad"}: **${name(stuckB ? null : rb)}**`,
    given: [{ label: "_avgcost", value: a.avgCost }, { label: "_avgprice", value: a.avgPrice }, { label: "_costA", value: a.cost }, { label: "_costB", value: b.cost }, { label: "_priceA", value: a.price }, { label: "_priceB", value: b.price }],
    params: { diff, kind: "ptwo", a, b },
  };
}

// ---------------------------------------------------------------------------------------------

export function generate({ subtopic, difficulty, rng }) {
  checkDifficulty(difficulty);
  switch (subtopic) {
    case "motivation": if (difficulty === "expert") break; return genMotivation(difficulty, rng);
    case "leadership": if (difficulty === "expert") break; return genLeadership(difficulty, rng);
    case "structure": return genStructure(difficulty, rng);
    case "porter": return genPorter(difficulty, rng);
  }
  throw new Error(`unknown subtopic/difficulty ${subtopic}/${difficulty}`);
}

// ---------------------------------------------------------------------------------------------
// verify(): independent rule tables

// Maslow keywords by level (bottom to top), and Herzberg's lists, written separately from MOT_ITEMS.
const V_MASLOW = { pay: 1, breaks: 1, meals: 1, contract: 2, ppe: 2, pension: 2, colleagues: 3, socials: 3, praise: 4, award: 4, promotion: 4, office: 4, creative: 5, training: 5 };
const V_HYGIENE = new Set(["pay", "breaks", "contract", "ppe", "pension", "colleagues", "office", "supervision", "policy"]);
const V_MOTIVATOR = new Set(["praise", "award", "promotion", "creative", "training", "responsibility", "achievement"]);
const V_LEVEL = ["", "Physiological", "Safety", "Social", "Esteem", "Self-actualisation"];
const vHerz = (id) => (V_HYGIENE.has(id) ? "Hygiene factor" : V_MOTIVATOR.has(id) ? "Motivator" : null);
const V_WHO = { Autocratic: "Manager alone, orders only", Paternalistic: "Manager, staff welfare first", Democratic: "Manager with team input", "Laissez-faire": "Team members themselves" };
const V_COMM = { Autocratic: "One-way, top down", Paternalistic: "Top down, with explanation", Democratic: "Two-way, with discussion", "Laissez-faire": "Little direction given" };
const V_VIEW = { Autocratic: "Theory X", Democratic: "Theory Y", "Laissez-faire": "Theory Y" };
const V_STRAT = { "Broad|Lower cost": "Cost leadership", "Broad|Uniqueness": "Differentiation", "Narrow|Lower cost": "Cost focus", "Narrow|Uniqueness": "Differentiation focus" };
const V_ATTR = Object.fromEntries(Object.entries(V_STRAT).map(([k, v]) => [v, k.split("|")]));

function vPorter(d) {
  const costAdv = d.cost * 10 <= d.avgCost * 9;
  const priceAdv = d.price * 100 >= d.avgPrice * 115;
  if (costAdv && priceAdv) return undefined;
  const scope = d.served === 1 ? "Narrow" : d.served === d.segs ? "Broad" : undefined;
  if (!scope) return undefined;
  if (!costAdv && !priceAdv) return scope === "Broad" ? "Stuck in the middle" : undefined;
  return V_STRAT[`${scope}|${costAdv ? "Lower cost" : "Uniqueness"}`];
}

function expected(p) {
  switch (p.kind) {
    case "maslow": return V_MASLOW[p.item] ? [V_LEVEL[V_MASLOW[p.item]]] : null;
    case "herz": return vHerz(p.item) ? [vHerz(p.item)] : null;
    case "herzeffect": {
      const h = vHerz(p.item);
      return h ? [h, h === "Motivator" ? "Increases motivation" : "Removes dissatisfaction"] : null;
    }
    case "maslowstep": return [V_LEVEL[p.met + 1 + (p.up ? 1 : 0)]];
    case "both": return V_MASLOW[p.item] && vHerz(p.item) ? [V_LEVEL[V_MASLOW[p.item]], vHerz(p.item)] : null;
    case "pickmotivator": {
      const mots = p.items.filter((id) => vHerz(id) === "Motivator");
      if (mots.length !== 1 || p.items.length !== 4) return null;
      const t = MOT_ITEMS.find((x) => x.id === mots[0]).text;
      return [t[0].toUpperCase() + t.slice(1)];
    }
    case "style": return STYLE_BEHAVIOUR[p.style]?.[p.idx] ? [p.style] : null;
    case "mcg": return [p.y ? "Theory Y" : "Theory X"];
    case "mcgstyle": return p.y ? ["Theory Y", "Democratic"] : ["Theory X", "Autocratic"];
    case "stylewho": return [p.style, V_WHO[p.style]];
    case "styleview": return V_VIEW[p.style] ? [p.style, V_VIEW[p.style]] : null;
    case "style3": return [p.style, V_WHO[p.style], V_COMM[p.style]];
    case "tallflat": return p.L1 > p.L2 ? ["Taller", "Narrower"] : ["Flatter", "Wider"];
    case "compare": {
      if ((p.L1 > p.L2) !== (p.sA < p.sB)) return null;
      return p.L1 > p.L2 ? ["Taller", "Narrower", "Slower"] : ["Flatter", "Wider", "Faster"];
    }
    case "pdesc": return PORTER_FIRMS[p.strat]?.[p.idx] ? [p.strat] : null;
    case "pattr": return [V_STRAT[`${["Broad", "Narrow"][p.sc]}|${["Lower cost", "Uniqueness"][p.ad]}`]];
    case "pdesc3": return [...V_ATTR[p.strat], p.strat];
    case "pdata": {
      const s = vPorter(p);
      return s && V_ATTR[s] ? [...V_ATTR[s], s] : null;
    }
    default: return null;
  }
}

function numEq(a, b, tol = 0) {
  const n = typeof a === "number" ? a : Number(String(a).trim());
  return Number.isFinite(n) && Math.abs(n - b) <= tol + 1e-9;
}

function multiExpected(p) {
  switch (p.kind) {
    case "delayer": return { cut: p.M * p.K, span: p.K * p.W, levels: 3 };
    case "plan": {
      // Brute force: the fewest managers on each level is the smallest m with m × s ≥ people below.
      let below = p.W, levels = 1, total = 0, above = null;
      while (below > 1) {
        let m = 1;
        while (m * p.s < below) m++;
        if (above === null) above = m;
        total += m; levels++; below = m;
      }
      return { above, levels, total };
    }
    case "reorg": {
      const staff = p.M * p.s;
      if (staff % p.M2 !== 0) return null;
      const span = staff / p.M2;
      return { staff, span, ok: span <= p.limit ? "Yes" : "No" };
    }
    case "ptwo": {
      const sa = vPorter(p.a), sb = vPorter(p.b);
      if (!sa || !sb || sa === "Stuck in the middle") return null;
      return { gap: ((p.a.avgCost - p.a.cost) / p.a.avgCost) * 100, a: sa, b: sb };
    }
    default: return null;
  }
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (question.answerType === "multi") {
    const exp = multiExpected(p);
    const parts = question.parts;
    if (!exp || !Array.isArray(parts) || !answer || typeof answer !== "object") return false;
    if (parts.length !== Object.keys(exp).length) return false;
    return parts.every((pt) => {
      if (!(pt.id in exp)) return false;
      const want = exp[pt.id];
      const v = answer[pt.id];
      if (pt.answerType === "choice") {
        if (!Array.isArray(pt.choices) || pt.choices.filter((c) => c === want).length !== 1) return false;
        return v === want;
      }
      if (pt.id === "gap") {
        // Rounded to 1 dp; never on a half step.
        const r = Math.round(want * 10) / 10;
        return Math.abs(Math.abs(want * 10 - Math.trunc(want * 10)) - 0.5) > 1e-6 && numEq(v, r, 0.05);
      }
      return numEq(v, want);
    });
  }
  if (question.answerType === "number") {
    switch (p.kind) {
      case "span": return Array.isArray(p.team) && !p.team.includes(p.deeper) && numEq(answer, new Set(p.team).size);
      case "bottom": { let n = 1; for (let i = 1; i < p.L; i++) n *= p.s; return numEq(answer, n); }
      case "total": { let n = 0, lvl = 1; for (let i = 0; i < p.L; i++) { n += lvl; lvl *= p.s; } return numEq(answer, n); }
      case "chain": return p.j > p.i + 1 && p.j < p.len && numEq(answer, p.j - p.i - 1);
      case "managers": {
        let below = p.W, n = 0;
        while (below > 1) { if (below % p.s) return false; below /= p.s; n += below; }
        return numEq(answer, n);
      }
      default: return false;
    }
  }
  if (question.answerType === "choice") {
    const want = expected(p);
    if (!want) return false;
    if (question.choiceCols && question.choiceCols.length !== want.length) return false;
    return choiceOk(question, answer, eqT(want));
  }
  return false;
}
