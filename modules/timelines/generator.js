// Timelines generator. Uses only the seeded rng passed in by the engine.
// Years are stored astronomically signed for convenience (-44 = 44 BC) but always shown as
// "44 BC" / "AD 79" / "1066". There is NO year 0: 1 BC is followed directly by AD 1, and every
// prompt that crosses it says so.
// Every subtopic except "Famous dates (recall)" gives the dates in the prompt, so the skill is the
// date reasoning, not memory. verify() is independent: it counts years one at a time (skipping 0),
// finds centuries/decades by scanning ranges, and checks orders pair by pair.

// ---------- events: well-established years only ----------
// [year, phrase used in a sentence]. Negative = BC. Each event has a unique year.
const EVENTS = [
  [-490, "the Battle of Marathon"],
  [-480, "the Battle of Thermopylae"],
  [-399, "the trial and death of Socrates"],
  [-331, "the Battle of Gaugamela"],
  [-323, "the death of Alexander the Great"],
  [-221, "the unification of China under Qin Shi Huang"],
  [-216, "the Battle of Cannae"],
  [-202, "the Battle of Zama"],
  [-146, "the destruction of Carthage by Rome"],
  [-49, "Julius Caesar crossing the Rubicon"],
  [-44, "the assassination of Julius Caesar"],
  [-31, "the Battle of Actium"],
  [43, "the Roman invasion of Britain under Claudius"],
  [64, "the Great Fire of Rome"],
  [79, "the eruption of Vesuvius that buried Pompeii"],
  [330, "the dedication of Constantinople as the new Roman capital"],
  [410, "the sack of Rome by the Visigoths"],
  [476, "the deposition of the last Western Roman emperor"],
  [800, "the crowning of Charlemagne as emperor"],
  [1066, "the Battle of Hastings"],
  [1086, "the completion of the Domesday Book"],
  [1202, "Fibonacci publishing his arithmetic book Liber Abaci"],
  [1215, "the sealing of Magna Carta"],
  [1314, "the Battle of Bannockburn"],
  [1347, "the arrival of the Black Death in Europe"],
  [1415, "the Battle of Agincourt"],
  [1453, "the fall of Constantinople"],
  [1485, "the Battle of Bosworth Field"],
  [1492, "Columbus reaching the Americas"],
  [1498, "Vasco da Gama reaching India by sea"],
  [1509, "Henry VIII becoming King of England"],
  [1517, "Martin Luther's Ninety-five Theses"],
  [1522, "the return of the first round-the-world voyage (Magellan and Elcano)"],
  [1543, "Copernicus publishing his Sun-centred model"],
  [1571, "the Battle of Lepanto"],
  [1588, "the defeat of the Spanish Armada"],
  [1605, "the Gunpowder Plot"],
  [1607, "the founding of Jamestown"],
  [1610, "Galileo observing the moons of Jupiter"],
  [1620, "the Mayflower voyage to America"],
  [1648, "the Peace of Westphalia"],
  [1666, "the Great Fire of London"],
  [1687, "Newton publishing the Principia"],
  [1707, "the Acts of Union joining England and Scotland"],
  [1769, "James Watt patenting his improved steam engine"],
  [1776, "the US Declaration of Independence"],
  [1783, "the first crewed hot-air balloon flight (Montgolfier brothers)"],
  [1787, "the signing of the US Constitution"],
  [1789, "the storming of the Bastille"],
  [1803, "the Louisiana Purchase"],
  [1805, "the Battle of Trafalgar"],
  [1815, "the Battle of Waterloo"],
  [1825, "the opening of the Stockton and Darlington Railway"],
  [1848, "the start of the California Gold Rush"],
  [1851, "the Great Exhibition in London"],
  [1859, "Darwin publishing On the Origin of Species"],
  [1865, "the assassination of Abraham Lincoln"],
  [1869, "the opening of the Suez Canal"],
  [1876, "Bell patenting the telephone"],
  [1883, "the eruption of Krakatoa"],
  [1889, "the completion of the Eiffel Tower"],
  [1895, "Röntgen discovering X-rays"],
  [1896, "the first modern Olympic Games in Athens"],
  [1903, "the Wright brothers' first powered flight"],
  [1906, "the San Francisco earthquake"],
  [1908, "the launch of the Ford Model T"],
  [1912, "the sinking of the Titanic"],
  [1914, "the start of the First World War"],
  [1917, "the Russian Revolution"],
  [1918, "the end of the First World War"],
  [1922, "the discovery of Tutankhamun's tomb"],
  [1927, "Lindbergh's solo flight across the Atlantic"],
  [1928, "Fleming discovering penicillin"],
  [1929, "the Wall Street Crash"],
  [1930, "the first FIFA World Cup"],
  [1939, "the start of the Second World War in Europe"],
  [1945, "the end of the Second World War"],
  [1953, "the first ascent of Mount Everest"],
  [1957, "the launch of Sputnik 1"],
  [1961, "Yuri Gagarin becoming the first person in space"],
  [1969, "the Apollo 11 Moon landing"],
  [1980, "the eruption of Mount St Helens"],
  [1989, "the fall of the Berlin Wall"],
  [1990, "the launch of the Hubble Space Telescope"],
  [1994, "the opening of the Channel Tunnel"],
].map(([year, name]) => ({ year, name }));

// Left out of exact-year recall questions: the year is standard, but sources word the event
// in ways where a neighbouring year can be argued (first arrival vs spread, etc.).
const SOFT = new Set([1347, 1517, -221]);

const BC = EVENTS.filter((e) => e.year < 0);
const AD = EVENTS.filter((e) => e.year > 0);

// ---------- helpers ----------

const NO_ZERO = "There is no year 0: 1 BC is followed directly by AD 1.";
const yr = (y) => (y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : String(y));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function ord(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}
// Years from a to b (a < b), with no year 0.
const span = (a, b) => (a < 0 && b > 0 ? b - a - 1 : b - a);
// The year n years after y (n may be negative), skipping year 0.
function shift(y, n) {
  let r = y + n;
  if (y < 0 && r >= 0) r += 1;
  else if (y > 0 && r <= 0) r -= 1;
  return r;
}
const centuryOf = (y) => Math.ceil(Math.abs(y) / 100); // 1450 -> 15; 490 BC -> 5 (BC)
const centStr = (y) => `${ord(centuryOf(y))} century${y < 0 ? " BC" : y < 100 ? " AD" : ""}`;
const pick2 = (rng, pool, ok) => {
  let a, b;
  do { [a, b] = rng.shuffle(pool).slice(0, 2); } while (!ok(a, b));
  return a.year < b.year ? [a, b] : [b, a];
};
const G = (label, value) => ({ label, value });
const exampleNot = (ans, a, b) => (ans === a ? b : a);

function numberChoices(correct, cands, rng, fmt = String) {
  const c = fmt(correct);
  const seen = new Set([c]);
  const out = [];
  for (const v of [...cands, correct + 1, correct - 1, correct + 10, correct - 10, correct + 100]) {
    if (out.length >= 3 || !Number.isFinite(v) || v <= 0) continue;
    const s = fmt(v);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return { answer: c, choices: rng.shuffle([c, ...out]) };
}

// Number question (65%) or choice (35%).
function numQ(q, rng, rate = 0.35) {
  const base = { prompt: q.prompt, explanation: q.explanation, hints: q.hints, params: q.params, tolerance: 0 };
  if (q.given) base.given = q.given;
  if (rng.next() < rate) {
    const { answer, choices } = numberChoices(q.exact, q.cands, rng);
    return { ...base, prompt: base.prompt.replace(q.typeNote || "\u0000", ""), answer, answerType: "choice", choices };
  }
  return { ...base, answer: q.exact, answerType: "number" };
}

// ======================================================================================
// Years between

function genBetween(d, rng) {
  if (d === "easy") {
    const [a, b] = pick2(rng, AD, (x, y) => Math.abs(x.year - y.year) >= 5);
    const exact = b.year - a.year;
    const order = rng.next() < 0.5;
    const [p, q] = order ? [a, b] : [b, a];
    return numQ({
      prompt: `${cap(p.name)} was in ${yr(p.year)}, and ${q.name} was in ${yr(q.year)}. How many years apart were they?`,
      exact,
      explanation: `Both years are AD, so subtract the earlier year from the later one.\n\n\`${b.year} - ${a.year}\` = **${exact}** years.`,
      hints: ["When both years are AD, the gap is just later year − earlier year.", `Work out \`${b.year} - ${a.year}\` (in the calculator: \`_later - _earlier\`).`],
      cands: [exact + 1, exact - 1, exact + 100],
      params: { kind: "between", a: a.year, b: b.year },
      given: [G("_earlier", a.year), G("_later", b.year)],
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["bc-ad", "bc-ad", "bc-bc"]);
    let a, b;
    if (kind === "bc-ad") { a = rng.pick(BC); b = rng.pick(AD.filter((e) => e.year < 1600)); }
    else [a, b] = pick2(rng, BC, (x, y) => x.year !== y.year);
    const exact = span(a.year, b.year);
    const cross = kind === "bc-ad";
    return numQ({
      prompt: `${cap(a.name)} was in ${yr(a.year)}, and ${b.name} was in ${yr(b.year)}. How many years passed between them? ${NO_ZERO}`,
      exact,
      explanation: cross
        ? `From ${yr(a.year)} to 1 BC is ${-a.year - 1} years, one more takes you to AD 1, and from AD 1 to ${yr(b.year)} is ${b.year - 1} years.\n\nAltogether: \`${-a.year} + ${b.year} - 1\` = **${exact}** years. (Adding the two numbers counts one year too many, because there is no year 0.)`
        : `Both years are BC, and BC years count down towards AD 1, so the bigger BC number is earlier.\n\n\`${-a.year} - ${-b.year}\` = **${exact}** years.`,
      hints: cross
        ? ["Count from the BC year up to AD 1, then on to the AD year.", `Adding ${-a.year} and ${b.year} would count a year 0 that doesn't exist, so take 1 away.`]
        : ["BC years count down: the larger BC number is the earlier date.", `Subtract the smaller BC number from the larger one: \`${-a.year} - ${-b.year}\`.`],
      cands: cross ? [-a.year + b.year, Math.abs(b.year + a.year), exact - 2] : [-a.year + -b.year, exact + 1, exact - 1],
      params: { kind: "between", a: a.year, b: b.year },
      given: cross ? [G("_bc", -a.year), G("_ad", b.year)] : [G("_earlier_bc", -a.year), G("_later_bc", -b.year)],
    }, rng);
  }

  // hard: two spans (multi) or a person's age across BC/AD
  if (rng.next() < 0.5) {
    const a = rng.pick(BC);
    const [b, c] = pick2(rng, AD, (x, y) => y.year - x.year >= 20 || x.year - y.year >= 20);
    const s1 = span(a.year, b.year), s2 = span(b.year, c.year);
    return {
      prompt: `Three events: ${a.name} (${yr(a.year)}), ${b.name} (${yr(b.year)}) and ${c.name} (${yr(c.year)}). ${NO_ZERO}`,
      answerType: "multi",
      hints: ["Work out each gap separately; only a gap that crosses from BC into AD needs the no-year-0 correction."],
      parts: [
        { id: "first", label: "First gap", ask: `Years from ${yr(a.year)} to ${yr(b.year)}.`, answerType: "number", answer: s1, tolerance: 0,
          hint: `This gap crosses from BC to AD: add ${-a.year} and ${b.year}, then take away 1.` },
        { id: "second", label: "Second gap", ask: `Years from ${yr(b.year)} to ${yr(c.year)}.`, answerType: "number", answer: s2, tolerance: 0,
          hint: `Both years are AD, so subtract: \`${c.year} - ${b.year}\`.` },
      ],
      explanation: `- ${yr(a.year)} to ${yr(b.year)} crosses into AD: \`${-a.year} + ${b.year} - 1\` = **${s1}** years.\n- ${yr(b.year)} to ${yr(c.year)}: \`${c.year} - ${b.year}\` = **${s2}** years.`,
      params: { multi: true, parts: [{ id: "first", kind: "between", a: a.year, b: b.year }, { id: "second", kind: "between", a: b.year, b: c.year }] },
      given: [G("_bc", -a.year), G("_ad1", b.year), G("_ad2", c.year)],
    };
  }
  const NAMES = ["A Roman senator", "A Greek scholar", "A merchant from Alexandria", "A soldier", "A poet", "A farmer in Gaul", "A scribe", "A potter"];
  const bornBC = rng.int(10, 80);
  const died = rng.int(1, 60);
  const age = span(-bornBC, died);
  if (age < 15 || age > 99) return genBetween("hard", rng);
  const who = rng.pick(NAMES);
  return numQ({
    prompt: `${who} was born in ${bornBC} BC and died in AD ${died}, on their birthday. How old were they when they died? ${NO_ZERO}`,
    exact: age,
    explanation: `From ${bornBC} BC to AD 1 is ${bornBC} years (counting down to 1 BC, then one more step to AD 1). From AD 1 to AD ${died} is ${died - 1} more.\n\n\`${bornBC} + ${died} - 1\` = **${age}** years old.`,
    hints: ["Count the years from the birth year, through the change from BC to AD, to the death year.", `Adding ${bornBC} and ${died} counts a year 0 that never happened, so take 1 away.`],
    cands: [bornBC + died, Math.abs(died - bornBC) || age + 2, age - 1],
    params: { kind: "between", a: -bornBC, b: died },
    given: [G("_born_bc", bornBC), G("_died_ad", died)],
  }, rng);
}

// ======================================================================================
// Centuries & decades

function genCenturies(d, rng) {
  const ev = () => rng.pick(AD.filter((e) => e.year >= 100));
  if (d === "easy") {
    const kind = rng.pick(["century", "century", "decade"]);
    const e = rng.next() < 0.6 ? ev() : { year: rng.int(101, 1999), name: null };
    if (e.year % 100 === 0) return genCenturies("easy", rng);
    const lead = e.name ? `${cap(e.name)} was in ${e.year}.` : `Something happened in the year ${e.year}.`;
    if (kind === "decade") {
      const exact = Math.floor(e.year / 10) * 10;
      return numQ({
        prompt: `${lead} In which decade was that? Type the decade as its first year (a year ending in 0).`,
        exact,
        typeNote: " Type the decade as its first year (a year ending in 0).",
        explanation: `A decade such as the 1960s runs from a year ending in 0 to the next year ending in 9. Replace the last digit of ${e.year} with 0: **${exact}s**, typed as **${exact}**.`,
        hints: ["A decade like the 1830s covers the years ending in 0 to 9 that start the same way.", `Keep the first three digits of ${e.year} and make the last digit 0.`],
        cands: [exact + 10, exact - 10, Math.floor(e.year / 100) * 100],
        params: { kind: "decade", y: e.year },
      }, rng);
    }
    const c = centuryOf(e.year);
    const ex = exampleNot(c, 3, 7);
    return numQ({
      prompt: `${lead} Which century was that? Type just the number (for example, ${ex} for the ${ord(ex)} century).`,
      exact: c,
      typeNote: ` Type just the number (for example, ${ex} for the ${ord(ex)} century).`,
      explanation: `The 1st century is years 1–100, the 2nd is 101–200, and so on. So the century number is one more than the hundreds in the year (unless the year ends in 00).\n\n${e.year} is in the **${ord(c)} century**.`,
      hints: ["The 1st century was years 1 to 100, so the century number is one ahead of the hundreds digits.", `Take the hundreds part of ${e.year} (${Math.floor(e.year / 100)}) and think about which century that is.`],
      cands: [c - 1, c + 1, c + 2],
      params: { kind: "century", y: e.year },
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["edge", "bc", "start"]);
    if (kind === "edge") {
      const base = 100 * rng.int(2, 30);
      const y = base + rng.pick([0, 0, 1]);
      const c = centuryOf(y);
      const ex = exampleNot(c, 4, 9);
      return numQ({
        prompt: `Which century is the year ${y} in? Type just the number (for example, ${ex} for the ${ord(ex)} century).`,
        exact: c,
        typeNote: ` Type just the number (for example, ${ex} for the ${ord(ex)} century).`,
        explanation: `Each century starts in a year ending in 01 and ends in a year ending in 00 (the 1st century was 1–100).\n\n${y} is ${y % 100 === 0 ? "the last year" : "the first year"} of the **${ord(c)} century**.`,
        hints: ["Centuries run from a year ending in 01 to a year ending in 00, because the 1st century was years 1 to 100.", `Is ${y} the last year of one century or the first year of the next?`],
        cands: [c + 1, c - 1, Math.floor(y / 100) + (y % 100 === 0 ? 1 : 2)],
        params: { kind: "century", y },
      }, rng);
    }
    if (kind === "bc") {
      const e = rng.next() < 0.6 ? rng.pick(BC) : { year: -rng.int(101, 999), name: null };
      const c = centuryOf(e.year);
      const ans = `${ord(c)} century BC`;
      const opts = [ans, `${ord(c)} century AD`, `${ord(c + 1)} century BC`, `${ord(Math.max(1, c - 1) === c ? c + 2 : c - 1)} century BC`];
      const lead = e.name ? `${cap(e.name)} was in ${yr(e.year)}.` : `A temple was built in ${yr(e.year)}.`;
      return {
        prompt: `${lead} Which century was that? (BC centuries count backwards: the 1st century BC is 100 BC to 1 BC.)`,
        answer: ans,
        answerType: "choice",
        choices: rng.shuffle([...new Set(opts)]),
        explanation: `BC centuries work like AD ones, counting back from 1 BC: the 1st century BC is 100–1 BC, the 2nd is 200–101 BC, and so on.\n\n${yr(e.year)} is in the **${ans}**.`,
        hints: [c === 1 ? "BC centuries count back from 1 BC in blocks of 100 years: for example, the 3rd century BC is 300 BC to 201 BC." : "BC centuries count back from 1 BC in blocks of 100 years: for example, the 1st century BC is 100 BC to 1 BC.", `So ${-e.year} BC is in the century one ahead of its hundreds digits (${Math.floor(-e.year / 100)}), as long as the year doesn't end in 00.`],
        params: { kind: "century-bc", y: e.year },
      };
    }
    const c = rng.int(2, 30);
    const end = rng.next() < 0.5;
    const exact = end ? c * 100 : (c - 1) * 100 + 1;
    return numQ({
      prompt: `What is the ${end ? "last" : "first"} year of the ${ord(c)} century AD?`,
      exact,
      explanation: `The 1st century was years 1–100, so the ${ord(c)} century runs from ${(c - 1) * 100 + 1} to ${c * 100}.\n\nIts ${end ? "last" : "first"} year is **${exact}**.`,
      hints: ["The 1st century was years 1 to 100, so every century ends in a year ending in 00 and begins in a year ending in 01.", end ? `The last year of a century is its number of hundreds: the ${ord(c)} century ends after ${c} hundreds of years.` : `The ${ord(c)} century begins just after the ${ord(c - 1)} century ends.`],
      cands: end ? [(c - 1) * 100, c * 100 - 1, (c + 1) * 100] : [(c - 1) * 100, c * 100 + 1, c * 100],
      params: { kind: end ? "cent-last" : "cent-first", c },
    }, rng);
  }

  // hard: millennium, or multi (century + decade + years into the century)
  if (rng.next() < 0.35) {
    const y = rng.pick([rng.int(1, 2999), 1000 * rng.int(1, 2), 1000 * rng.int(1, 2) + 1]);
    const m = Math.ceil(y / 1000);
    const ex = exampleNot(m, 4, 5);
    return numQ({
      prompt: `Which millennium AD is the year ${y} in? Type just the number (for example, ${ex} for the ${ord(ex)} millennium).`,
      exact: m,
      typeNote: ` Type just the number (for example, ${ex} for the ${ord(ex)} millennium).`,
      explanation: `Millennia work like centuries: the 1st millennium was years 1–1000, the 2nd 1001–2000, the 3rd 2001–3000.\n\n${y} is in the **${ord(m)} millennium**.`,
      hints: ["A millennium is 1000 years, counted from the start of AD, so every millennium ends in a year ending in 000.", `Find the first year ending in 000 that is not before ${y}; its thousands digit is the millennium number.`],
      cands: [m + 1, m - 1, m + 2],
      params: { kind: "millennium", y },
    }, rng);
  }
  const e = rng.next() < 0.6 ? ev() : { year: rng.int(101, 1999), name: null };
  if (e.year % 10 === 0) return genCenturies("hard", rng);
  const c = centuryOf(e.year);
  const dec = Math.floor(e.year / 10) * 10;
  const into = e.year - (c - 1) * 100;
  const lead = e.name ? `${cap(e.name)} was in ${e.year}.` : `A bridge was finished in ${e.year}.`;
  const ex = exampleNot(c, 3, 7);
  return {
    prompt: lead,
    answerType: "multi",
    hints: ["Centuries start in a year ending in 01 and end in a year ending in 00; decades start in a year ending in 0."],
    parts: [
      { id: "century", label: "Century", ask: `Which century? Type just the number (for example, ${ex} for the ${ord(ex)}).`, answerType: "number", answer: c, tolerance: 0,
        hint: `The century number is one ahead of the hundreds part of ${e.year} (${Math.floor(e.year / 100)}).` },
      { id: "decade", label: "Decade", ask: "Which decade? Type its first year (a year ending in 0).", answerType: "number", answer: dec, tolerance: 0,
        hint: `Keep the first three digits of ${e.year} and make the last digit 0.` },
      { id: "into", label: "Year of the century", ask: "Counting the first year of the century as year 1, which year of its century was it?", answerType: "number", answer: into, tolerance: 0,
        hint: `The century began in ${(c - 1) * 100 + 1}, which counts as year 1. Count on from there to ${e.year}.` },
    ],
    explanation: `- Century: ${e.year} lies between ${(c - 1) * 100 + 1} and ${c * 100}, so it is the **${ord(c)} century** (**${c}**).\n- Decade: **${dec}s** (**${dec}**).\n- The century began in ${(c - 1) * 100 + 1} (year 1), so ${e.year} is year \`${e.year} - ${(c - 1) * 100}\` = **${into}**.`,
    params: { multi: true, parts: [{ id: "century", kind: "century", y: e.year }, { id: "decade", kind: "decade", y: e.year }, { id: "into", kind: "into", y: e.year }] },
  };
}

// ======================================================================================
// Ordering (dates given)

const LETTERS = ["A", "B", "C", "D"];

// The correct order (letters) plus 3 distinct wrong orders, preferring the given plausible ones.
function orderChoices(items, wrongOrders, rng) {
  const key = (arr) => arr.map((i) => LETTERS[i]).join(", ");
  const correct = key(items.map((it, i) => i).sort((i, j) => items[i].year - items[j].year));
  const seen = new Set([correct]);
  const out = [];
  const add = (arr) => {
    const s = key(arr);
    if (out.length < 3 && !seen.has(s)) { seen.add(s); out.push(s); }
  };
  wrongOrders.forEach(add);
  for (let t = 0; out.length < 3 && t < 50; t++) add(rng.shuffle(items.map((_, i) => i)));
  return { answer: correct, choices: rng.shuffle([correct, ...out]) };
}

function genOrdering(d, rng) {
  const n = d === "easy" ? 3 : 4;
  let picked;
  if (d === "easy") {
    do picked = rng.shuffle(AD).slice(0, 3); while (new Set(picked.map((e) => e.year)).size < 3);
  } else {
    do {
      picked = [...rng.shuffle(BC).slice(0, 2), ...rng.shuffle(AD.filter((e) => e.year < 1000)).slice(0, 1), ...rng.shuffle(AD).slice(0, 1)];
      picked = rng.shuffle(picked);
    } while (new Set(picked.map((e) => e.year)).size < 4);
  }
  const latest = rng.next() < 0.3; // ask latest-to-earliest sometimes
  let items = picked.map((e) => ({ ...e, shown: yr(e.year), rel: null }));

  // hard: two of the dates are given relative to another event
  if (d === "hard") {
    const idx = rng.shuffle([0, 1, 2, 3]);
    const anchor = idx[0];
    for (const k of [idx[1], idx[2]]) {
      const gap = span(Math.min(items[anchor].year, items[k].year), Math.max(items[anchor].year, items[k].year));
      const after = items[k].year > items[anchor].year;
      items[k] = { ...items[k], rel: { anchor, gap, after }, shown: `${gap} years ${after ? "after" : "before"} event ${LETTERS[anchor]}` };
    }
  }
  const asc = (arr) => arr.slice().sort((i, j) => items[i].year - items[j].year);
  const ids = items.map((_, i) => i);
  const order = asc(ids);
  // plausible wrong orders: reversed; BC treated like AD (sorted by the plain number); first two swapped
  const plain = ids.slice().sort((i, j) => Math.abs(items[i].year) - Math.abs(items[j].year));
  const swapped = [order[1], order[0], ...order.slice(2)];
  const lastSwap = [...order.slice(0, n - 2), order[n - 1], order[n - 2]];
  // orderChoices still runs (it draws from the rng), so every seed keeps its events and answer;
  // only its answer is used now that the order is built from blocks.
  const { answer } = orderChoices(items, [order.slice().reverse(), plain, swapped, lastSwap], rng);
  // orderChoices builds the earliest-first key (letters joined by ", "); flip for latest-first
  const flip = (s) => s.split(", ").reverse().join(", ");
  const ans = latest ? flip(answer) : answer;

  const lines = items.map((it, i) => `- **${LETTERS[i]}:** ${cap(it.name)} (${it.shown})`).join("\n");
  const dir = latest ? "from latest to earliest" : "from earliest to latest";
  const zero = d === "easy" ? "" : ` ${NO_ZERO}`;
  const sorted = order.map((i) => `${LETTERS[i]} (${yr(items[i].year)})`).join(", ");
  const relLines = items.filter((it) => it.rel).map((it) => {
    const a = items[it.rel.anchor];
    return `- ${it.rel.gap} years ${it.rel.after ? "after" : "before"} ${yr(a.year)} is ${yr(it.year)}.`;
  }).join("\n");
  return {
    prompt: `Drag the blocks into order ${dir}, or tap them in turn.${zero}\n\n${lines}`,
    answer: ans,
    answerType: "tiles",
    tiles: items.map((it, i) => ({ value: LETTERS[i], label: `${cap(it.name)} (${it.shown})` })),
    joiner: ", ",
    useAll: true,
    explanation: `${relLines ? `First turn the relative dates into years:\n\n${relLines}\n\n` : ""}${d === "easy" ? "" : "BC years count down towards AD 1, so a bigger BC number is earlier, and every BC year is before every AD year.\n\n"}Earliest to latest: ${sorted}.\n\n${latest ? `The question asks for latest to earliest, which is the reverse: **${ans}**.` : `So the answer is **${ans}**.`}`,
    hints: [
      d === "hard" ? `First work out the actual years of the events dated relative to event ${LETTERS[items.find((it) => it.rel).rel.anchor]}. Crossing from BC to AD, remember there is no year 0.` : "Write each date on a number line, with BC dates to the left of AD 1.",
      d === "easy" ? "Smaller AD years are earlier." : "Among BC dates, the bigger number is earlier. All BC dates come before all AD dates.",
    ],
    params: { kind: "order", items: items.map((it) => ({ year: it.year, rel: it.rel })), latest },
  };
}

// ======================================================================================
// Before, after & spans

function genSpans(d, rng) {
  const now = rng.int(2020, 2030);
  const NOW = `Take the current year to be ${now}.`;
  if (d === "easy") {
    const kind = rng.pick(["ago", "after"]);
    if (kind === "ago") {
      const e = rng.pick(AD);
      const exact = now - e.year;
      return numQ({
        prompt: `${cap(e.name)} was in ${yr(e.year)}. ${NOW} How many years ago was that?`,
        exact,
        explanation: `Subtract the event's year from the current year: \`${now} - ${e.year}\` = **${exact}** years ago.`,
        hints: ["Years ago = current year − the event's year.", `Work out \`${now} - ${e.year}\` (in the calculator: \`_now - _year\`).`],
        cands: [exact + 1, exact - 1, exact + 10],
        params: { kind: "ago", y: e.year, now },
        given: [G("_now", now), G("_year", e.year)],
      }, rng);
    }
    const e = rng.pick(AD.filter((x) => x.year < 1900));
    const n = 5 * rng.int(2, 40);
    const exact = e.year + n;
    return numQ({
      prompt: `${cap(e.name)} was in ${yr(e.year)}. Which year was ${n} years later?`,
      exact,
      explanation: `Add the years: \`${e.year} + ${n}\` = **${exact}**.`,
      hints: ["Later means add.", `Work out \`${e.year} + ${n}\`.`],
      cands: [exact - 1, e.year - n, exact + 10],
      params: { kind: "shift", y: e.year, n },
    }, rng);
  }

  if (d === "medium") {
    const kind = rng.pick(["ago-bc", "anniv", "first-by"]);
    if (kind === "ago-bc") {
      const e = rng.pick(BC);
      const exact = span(e.year, now);
      return numQ({
        prompt: `${cap(e.name)} was in ${yr(e.year)}. ${NOW} How many years ago was that? ${NO_ZERO}`,
        exact,
        explanation: `From ${yr(e.year)} to AD 1 is ${-e.year} years, and from AD 1 to ${now} is ${now - 1} more.\n\n\`${-e.year} + ${now} - 1\` = **${exact}** years ago.`,
        hints: ["Count up from the BC year to AD 1, then on to the current year.", `Adding ${-e.year} and ${now} counts a year 0 that never happened, so take 1 away.`],
        cands: [-e.year + now, now - -e.year, exact - 1],
        params: { kind: "ago", y: e.year, now },
        given: [G("_bc", -e.year), G("_now", now)],
      }, rng);
    }
    if (kind === "anniv") {
      const e = rng.pick(AD);
      const n = rng.pick([10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 1000].filter((k) => e.year + k <= 2100));
      const exact = e.year + n;
      return numQ({
        prompt: `${cap(e.name)} was in ${yr(e.year)}. In which year was (or will be) its ${ord(n)} anniversary?`,
        exact,
        explanation: `The ${ord(n)} anniversary is ${n} years after the event: \`${e.year} + ${n}\` = **${exact}**.`,
        hints: [`An anniversary falls a whole number of years after the event; the ${ord(n)} is ${n} years later.`, `Add ${n} to ${e.year}.`],
        cands: [exact - 1, exact + 1, e.year + n * 10],
        params: { kind: "shift", y: e.year, n },
      }, rng);
    }
    const [a, b] = pick2(rng, AD, (x, y) => Math.abs(x.year - y.year) >= 3);
    const [p, q] = rng.next() < 0.5 ? [a, b] : [b, a];
    const gap = b.year - a.year;
    return {
      prompt: `${cap(p.name)} was in ${yr(p.year)}, and ${q.name} was in ${yr(q.year)}. Which came first, and by how many years?`,
      answerType: "multi",
      hints: ["Compare the two years first, then find the gap between them."],
      parts: [
        { id: "first", label: "Which first", ask: "Which happened first?", answerType: "choice", answer: cap(a.name), choices: [cap(p.name), cap(q.name)],
          hint: "The smaller AD year is earlier." },
        { id: "gap", label: "Years between", ask: "By how many years?", answerType: "number", answer: gap, tolerance: 0,
          hint: "Subtract the earlier year from the later one." },
      ],
      explanation: `${yr(a.year)} is earlier than ${yr(b.year)}, so **${a.name}** came first, by \`${b.year} - ${a.year}\` = **${gap}** years.`,
      params: { multi: true, parts: [{ id: "first", kind: "first", names: [p, q].map((x) => ({ name: cap(x.name), year: x.year })) }, { id: "gap", kind: "between", a: a.year, b: b.year }] },
      given: [G("_year1", p.year), G("_year2", q.year)],
    };
  }

  // hard: N years after a BC date (crossing into AD), or the BC/AD "which came first" multi
  if (rng.next() < 0.5) {
    const e = rng.pick(BC);
    let n;
    do n = 5 * rng.int(4, 120); while (e.year + n < 0 || e.year + n > 1500);
    const exact = shift(e.year, n);
    const naive = e.year + n; // forgot there is no year 0 (one year short)
    const ans = yr(exact);
    const opts = [...new Set([ans, yr(naive >= 1 ? naive : exact + 1), `${exact} BC`, yr(n - e.year), yr(exact + 10), yr(exact + 2)])].slice(0, 4);
    return {
      prompt: `${cap(e.name)} was in ${yr(e.year)}. Which year was exactly ${n} years later? ${NO_ZERO}`,
      answer: ans,
      answerType: "choice",
      choices: rng.shuffle(opts),
      explanation: `From ${yr(e.year)} it takes ${-e.year - 1} years to reach 1 BC and one more to reach AD 1, so ${-e.year} years in total. That leaves \`${n} - ${-e.year}\` = ${n + e.year} more years after AD 1.\n\nAD 1 + ${n + e.year} years = **${ans}**.`,
      hints: [`It takes ${-e.year} years to get from ${yr(e.year)} to AD 1 (there is no year 0).`, `So ${n} years later is ${n + e.year} years after AD 1. Which year is that?`],
      params: { kind: "shift-choice", y: e.year, n },
    };
  }
  const a = rng.pick(BC);
  const b = rng.pick(AD.filter((e) => e.year < 1700));
  const [p, q] = rng.next() < 0.5 ? [a, b] : [b, a];
  const gap = span(a.year, b.year);
  return {
    prompt: `${cap(p.name)} was in ${yr(p.year)}, and ${q.name} was in ${yr(q.year)}. ${NO_ZERO}`,
    answerType: "multi",
    hints: ["Every BC date is before every AD date. For the gap, count up to AD 1 and then on, with no year 0."],
    parts: [
      { id: "first", label: "Which first", ask: "Which happened first?", answerType: "choice", answer: cap(a.name), choices: [cap(p.name), cap(q.name)],
        hint: "BC dates come before AD dates." },
      { id: "gap", label: "Years between", ask: "How many years passed between them?", answerType: "number", answer: gap, tolerance: 0,
        hint: `Add ${-a.year} and ${b.year}, then take away 1 because there is no year 0.` },
    ],
    explanation: `${yr(a.year)} is a BC year, so **${a.name}** came first.\n\nGap: \`${-a.year} + ${b.year} - 1\` = **${gap}** years.`,
    params: { multi: true, parts: [{ id: "first", kind: "first", names: [p, q].map((x) => ({ name: cap(x.name), year: x.year })) }, { id: "gap", kind: "between", a: a.year, b: b.year }] },
    given: [G("_bc", -a.year), G("_ad", b.year)],
  };
}

// ======================================================================================
// Famous dates (recall): no dates in the prompt

function spread(list, minGap) {
  const ys = list.map((e) => e.year).sort((x, y) => x - y);
  for (let i = 1; i < ys.length; i++) if (span(ys[i - 1], ys[i]) < minGap) return false;
  return true;
}

// True when y falls in the chronologically first half of its century (AD 1401-1450, 500-451 BC).
function earlyHalf(y) {
  const r = Math.abs(y) % 100;
  return y > 0 ? r >= 1 && r <= 50 : r === 0 || r >= 51;
}

function genRecall(d, rng) {
  if (d === "easy" || d === "medium") {
    const gap = d === "easy" ? 150 : 40;
    let four;
    do four = rng.shuffle(EVENTS).slice(0, 4); while (!spread(four, gap));
    const first = rng.next() < 0.6;
    const target = four.reduce((m, e) => (first ? (e.year < m.year ? e : m) : (e.year > m.year ? e : m)));
    const sorted = four.slice().sort((x, y) => x.year - y.year);
    return {
      prompt: `Which of these happened ${first ? "first (earliest)" : "most recently (latest)"}?\n\n${four.map((e) => `- ${cap(e.name)}`).join("\n")}`,
      answer: cap(target.name),
      answerType: "choice",
      choices: rng.shuffle(four.map((e) => cap(e.name))),
      explanation: `In order: ${sorted.map((e) => `${e.name} (${yr(e.year)})`).join("; ")}.\n\nSo the ${first ? "earliest" : "latest"} is **${target.name}**.`,
      hints: [
        "Place each event in its era first: ancient (BC), Roman and medieval, early modern (1500s to 1700s), or modern (1800s on).",
        d === "easy" ? "The events are at least 150 years apart, so the era alone is enough." : "Within the same era, think about which century each one belongs to.",
      ],
      params: { kind: "extreme", years: Object.fromEntries(four.map((e) => [cap(e.name), e.year])), first },
    };
  }
  // hard: exact year (choice) or century (choice)
  if (rng.next() < 0.6) {
    const e = rng.pick(EVENTS.filter((x) => !SOFT.has(x.year)));
    const ans = yr(e.year);
    const deltas = rng.shuffle([1, -1, 10, -10, 100, -100, 2, -2]);
    const opts = [ans];
    for (const k of deltas) {
      const y2 = shift(e.year, k);
      const s = yr(y2);
      if (opts.length < 4 && !opts.includes(s) && Math.abs(y2) <= 2000) opts.push(s);
    }
    return {
      prompt: `In which year did ${e.name} happen?`,
      answer: ans,
      answerType: "choice",
      choices: rng.shuffle(opts),
      explanation: `${cap(e.name)} happened in **${ans}**.`,
      hints: [`Start with the century: ${e.name} happened in the ${centStr(e.year)}.`, `Now narrow it down: it happened in the ${earlyHalf(e.year) ? "first" : "second"} half of that century.`],
      params: { kind: "year", y: e.year },
    };
  }
  const e = rng.pick(EVENTS);
  const c = centuryOf(e.year);
  const opts = [centStr(e.year)];
  const adLabel = (k) => `${ord(k)} century${k === 1 ? " AD" : ""}`;
  const others = e.year < 0
    ? [`${ord(c)} century AD`, `${ord(c + 1)} century BC`, `${ord(c > 1 ? c - 1 : c + 2)} century BC`]
    : [adLabel(c + 1), adLabel(c > 1 ? c - 1 : c + 2), `${ord(c)} century BC`];
  for (const s of others) if (!opts.includes(s) && opts.length < 4) opts.push(s);
  return {
    prompt: `In which century did ${e.name} happen?`,
    answer: centStr(e.year),
    answerType: "choice",
    choices: rng.shuffle(opts),
    explanation: `${cap(e.name)} happened in ${yr(e.year)}, which is in the **${centStr(e.year)}**.`,
    hints: ["Think of the era first: ancient (BC), Roman and medieval, early modern or modern.", `Remember the century number is one ahead of the hundreds in the year: ${c === 15 || c === 5 || c === 1 ? "1850 is in the 19th century" : "1450 is in the 15th century"}.`],
    params: { kind: "century-recall", y: e.year },
  };
}

// ======================================================================================

// Draws until verify() accepts the question. Only the rng passed in is used, so a seed always
// gives the same question.
export function generate(args) {
  let q;
  for (let i = 0; i < 25; i++) {
    q = make(args);
    const own = q.answerType === "multi" ? Object.fromEntries(q.parts.map((p) => [p.id, p.answer])) : q.answer;
    if (verify(q, own)) return q;
  }
  return q;
}

function make({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "years-between") return genBetween(difficulty, rng);
  if (subtopic === "centuries") return genCenturies(difficulty, rng);
  if (subtopic === "ordering") return genOrdering(difficulty, rng);
  if (subtopic === "spans") return genSpans(difficulty, rng);
  if (subtopic === "famous-dates") return genRecall(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ======================================================================================
// Independent checks: count years one by one (never stepping on year 0), scan century and decade
// ranges, and compare orders pair by pair.

const nextYear = (y) => (y === -1 ? 1 : y + 1);
const prevYear = (y) => (y === 1 ? -1 : y - 1);
function countYears(a, b) {
  let n = 0;
  for (let y = a; y < b; y = nextYear(y)) n++;
  return n;
}
function walk(y, n) {
  let r = y;
  for (let i = 0; i < Math.abs(n); i++) r = n > 0 ? nextYear(r) : prevYear(r);
  return r;
}
// Parse "44 BC", "AD 79", "1066".
function parseYear(s) {
  const t = String(s ?? "").trim();
  let m = t.match(/^(\d+) BC$/);
  if (m) return -Number(m[1]);
  m = t.match(/^(?:AD )?(\d+)$/);
  return m ? Number(m[1]) : NaN;
}
function centuryScan(y) {
  const a = Math.abs(y);
  for (let c = 1; c <= 40; c++) if (a >= (c - 1) * 100 + 1 && a <= c * 100) return c;
  return NaN;
}
function parseCentury(s) {
  const m = String(s ?? "").match(/^(\d+)(st|nd|rd|th) century( BC| AD)?$/);
  if (!m) return null;
  return { c: Number(m[1]), bc: m[3] === " BC", suffixOk: ord(Number(m[1])) === `${m[1]}${m[2]}` };
}
function centuryLabelOk(y, s) {
  const p = parseCentury(s);
  if (!p || !p.suffixOk) return false;
  return p.bc === (y < 0) && p.c === centuryScan(y);
}

function intOk(x, want) {
  const s = String(x ?? "").trim();
  return /^-?\d+$/.test(s) && Number(s) === want;
}

function checkNum(p, a) {
  switch (p.kind) {
    case "between": return intOk(a, countYears(p.a, p.b));
    case "ago": return intOk(a, countYears(p.y, p.now));
    case "shift": return intOk(a, walk(p.y, p.n));
    case "century": return intOk(a, centuryScan(p.y));
    case "decade": { const x = Number(a); return intOk(a, x) && x % 10 === 0 && p.y >= x && p.y < x + 10; }
    case "into": { const c = centuryScan(p.y); return intOk(a, countYears((c - 1) * 100 + 1, p.y) + 1); }
    case "millennium": { for (let m = 1; m <= 3; m++) if (p.y >= (m - 1) * 1000 + 1 && p.y <= m * 1000) return intOk(a, m); return false; }
    case "cent-first": { let y = 1; while (centuryScan(y) < p.c) y++; return intOk(a, y); }
    case "cent-last": { let y = 1; while (centuryScan(y + 1) <= p.c) y++; return intOk(a, y); }
    default: return false;
  }
}

function fourDistinct(ch) {
  return Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4;
}

function checkOrder(p, s) {
  const letters = String(s).split(", ");
  if (letters.length !== p.items.length || new Set(letters).size !== letters.length) return false;
  // resolve relative dates by walking year by year from the anchor
  const years = p.items.map((it) => it.year);
  p.items.forEach((it, i) => {
    if (it.rel) years[i] = walk(p.items[it.rel.anchor].year, it.rel.after ? it.rel.gap : -it.rel.gap);
  });
  const idx = letters.map((L) => LETTERS.indexOf(L));
  if (idx.some((i) => i < 0 || i >= years.length)) return false;
  for (let k = 1; k < idx.length; k++) {
    const earlier = p.latest ? idx[k] : idx[k - 1];
    const later = p.latest ? idx[k - 1] : idx[k];
    if (!(countYears(years[earlier], years[later]) > 0)) return false;
  }
  return true;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false; // regenerate from the seed to get params back
  try {
    if (p.multi) {
      const a = answer && typeof answer === "object" ? answer : {};
      return p.parts.every((s) => {
        if (s.kind === "first") {
          const [x, y] = s.names;
          const first = countYears(x.year, y.year) > 0 ? x : y;
          return a[s.id] === first.name && x.name !== y.name;
        }
        return checkNum(s, a[s.id]);
      });
    }
    if (p.kind === "order" && question.answerType === "tiles") {
      // Blocks: one tile per event, values A, B, C(, D) in prompt order, all placed.
      const t = question.tiles;
      if (!Array.isArray(t) || t.length !== p.items.length) return false;
      if (!t.every((x, i) => (x && typeof x === "object" ? x.value : x) === LETTERS[i])) return false;
      return checkOrder(p, answer);
    }
    const choice = question.answerType === "choice";
    const ch = question.choices;
    if (choice && (!fourDistinct(ch) || !ch.includes(String(answer)))) return false;
    let ok;
    switch (p.kind) {
      case "order": ok = (v) => checkOrder(p, v); break;
      case "century-bc": case "century-recall": ok = (v) => centuryLabelOk(p.y, v); break;
      case "shift-choice": ok = (v) => parseYear(v) === walk(p.y, p.n) && (parseYear(v) > 0 ? !/BC$/.test(v) : /BC$/.test(v)); break;
      case "year": ok = (v) => parseYear(v) === p.y && String(v) === (p.y < 0 ? `${-p.y} BC` : p.y < 1000 ? `AD ${p.y}` : String(p.y)); break;
      case "extreme": {
        const ys = Object.values(p.years);
        const target = p.first ? Math.min(...ys) : Math.max(...ys);
        if (new Set(ys).size !== ys.length) return false;
        ok = (v) => Object.prototype.hasOwnProperty.call(p.years, v) && p.years[v] === target;
        break;
      }
      default: ok = (v) => checkNum(p, v);
    }
    if (choice && ch.filter((c) => ok(c)).length !== 1) return false;
    return ok(answer);
  } catch {
    return false;
  }
}
