// Geometry generator. Uses only the seeded rng passed in by the engine.
// Whole-number answers are exact; anything with π or a square root is rounded to 2 decimals
// (tolerance 0.005). Every prompt says which, and gives the unit.

// Round half away from zero; the 1e-9 nudge absorbs binary error (e.g. 2.525*100 = 252.4999...).
const round2 = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;

// Answer/choice formatter: whole numbers as-is, rounded answers with exactly 2 decimals; never "-0".
function fmtAns(n, rounded) {
  const r = round2(n);
  const v = Object.is(r, -0) ? 0 : r;
  return rounded ? v.toFixed(2) : String(v);
}

// Given values and intermediate steps: shortest form (up to 4 decimals); never "-0".
function num(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}

const WHOLE = " Give a whole number.";
const ROUND = " Round to 2 decimal places.";
const PI_ROUND = " Use π (not 3.14) and round to 2 decimal places.";
const DEG = " Answer in degrees, as a number without the ° sign.";

// Final line of an explanation: "= **48 cm²**" or "≈ 50.2655 cm², which rounds to **50.27 cm²**".
function result(exact, rounded, unit) {
  const shown = fmtAns(exact, rounded);
  const u = unit === "°" ? "°" : ` ${unit}`;
  if (!rounded || Math.abs(exact - Number(shown)) < 1e-9) return `= **${shown}${u}**`;
  return `≈ ${exact.toFixed(4)}${u}, which rounds to **${shown}${u}**`;
}

// 4 unique choices: correct + 3 distractors from common mistakes, topped up with nearby values.
// Whole-number questions only get whole-number distractors; no negative or zero options.
function buildChoices(correct, candidates, rounded, rng) {
  const correctStr = fmtAns(correct, rounded);
  const seen = new Set([correctStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v) || v <= 0) return;
    if (!rounded && !Number.isInteger(round2(v))) return;
    const s = fmtAns(v, rounded);
    if (Math.abs(Number(s) - correct) <= 0.005 + 1e-9) return; // would also count as correct (e.g. 0.87 when the exact value is 0.875)
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  candidates.forEach(tryAdd);
  for (let k = 1; out.length < 3; k++) {
    tryAdd(correct + k);
    tryAdd(correct - k);
  }
  return { answer: correctStr, choices: rng.shuffle([correctStr, ...out]) };
}

// Turn a solved question into either a typed-number or a multiple-choice question.
function finish(base, exact, rounded, candidates, rng) {
  if (rng.next() < 0.35) {
    const { answer, choices } = buildChoices(exact, candidates, rounded, rng);
    return { ...base, answer, answerType: "choice", choices };
  }
  return { ...base, answer: rounded ? round2(exact) : exact, answerType: "number", choices: undefined };
}

function checkDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// Pre-filled calculator rows (question.given) for questions with two or more stated numbers.
// [[label, value], ...] -> { given: [{ label, value }, ...] }, or {} when there is nothing to pre-fill.
const givenRows = (pairs) => (pairs ? { given: pairs.map(([label, value]) => ({ label, value })) } : {});

const dec1 = (rng, lo, hi) => rng.int(lo * 10, hi * 10) / 10; // one decimal place

function genPerimArea(difficulty, rng) {
  checkDifficulty(difficulty);
  const kinds = {
    easy: ["rect-area", "rect-perim", "tri-area"],
    medium: ["rect-area", "rect-perim", "tri-area", "tri-perim", "circle-area", "circle-circ"],
    hard: ["rect-area", "tri-area", "circle-area", "circle-circ", "circle-radius"],
  }[difficulty];
  const kind = rng.pick(kinds);
  const hard = difficulty === "hard";
  let prompt, exact, rounded, unit, explanation, candidates, values, gv, hints;

  if (kind === "rect-area" || kind === "rect-perim") {
    let l, w;
    if (hard) {
      l = dec1(rng, 2, 30);
      w = dec1(rng, 1, 20);
    } else {
      const max = difficulty === "easy" ? 15 : 40;
      l = rng.int(2, max);
      w = rng.int(1, max);
      if (w === l) w = l === 1 ? 2 : l - 1;
    }
    values = { l, w };
    gv = [["_l", l], ["_w", w]];
    rounded = hard;
    const end = rounded ? ROUND : WHOLE;
    if (kind === "rect-area") {
      exact = l * w;
      unit = "cm²";
      prompt = `A rectangle is ${num(l)} cm long and ${num(w)} cm wide. What is its area, in cm²?${end}`;
      explanation = `Area of a rectangle = length × width.\n\n\`${num(l)} × ${num(w)}\` ${result(exact, rounded, unit)}`;
      candidates = [2 * (l + w), l + w, 2 * l * w]; // perimeter instead, added, doubled
      hints = [
        "Area of a rectangle = length × width.",
        `Multiply \`_l × _w\`: \`${num(l)} × ${num(w)}\`.${rounded ? " Then round to 2 decimal places." : ""}`,
      ];
    } else {
      exact = 2 * (l + w);
      unit = "cm";
      prompt = `A rectangle is ${num(l)} cm long and ${num(w)} cm wide. What is its perimeter, in cm?${end}`;
      explanation = `Perimeter of a rectangle = 2 × (length + width).\n\n\`2 × (${num(l)} + ${num(w)}) = 2 × ${num(l + w)}\` ${result(exact, rounded, unit)}`;
      candidates = [l * w, l + w, 2 * l + w]; // area instead, forgot to double, doubled one side only
      hints = [
        "The perimeter is the distance all the way round: 2 × (length + width), because there are two of each side.",
        `Add one length and one width first: \`_l + _w = ${num(l)} + ${num(w)} = ${num(l + w)}\`.`,
        `Now double it.${rounded ? " Round to 2 decimal places if needed." : ""}`,
      ];
    }
  } else if (kind === "tri-area") {
    let b, h;
    if (hard) {
      b = dec1(rng, 2, 30);
      h = dec1(rng, 2, 30);
    } else {
      const max = difficulty === "easy" ? 12 : 30;
      do {
        b = rng.int(2, max);
        h = rng.int(2, max);
      } while ((b * h) % 2 !== 0); // keep the area whole
    }
    values = { b, h };
    gv = [["_b", b], ["_h", h]];
    rounded = hard;
    exact = (b * h) / 2;
    unit = "cm²";
    prompt = `A triangle has a base of ${num(b)} cm and a perpendicular height of ${num(h)} cm. What is its area, in cm²?${rounded ? ROUND : WHOLE}`;
    explanation = `Area of a triangle = ½ × base × height.\n\n\`½ × ${num(b)} × ${num(h)} = ½ × ${num(b * h)}\` ${result(exact, rounded, unit)}`;
    candidates = [b * h, b + h, (b + h) / 2]; // forgot the half, added, averaged
    hints = [
      "Area of a triangle = ½ × base × perpendicular height (half of the rectangle around it).",
      `Multiply \`_b × _h = ${num(b)} × ${num(h)} = ${num(b * h)}\`.`,
      `Now halve it.${rounded ? " Round to 2 decimal places." : ""}`,
    ];
  } else if (kind === "tri-perim") {
    // Three sides that satisfy the triangle inequality.
    let a, b, c;
    do {
      a = rng.int(3, 25);
      b = rng.int(3, 25);
      c = rng.int(3, 25);
    } while (a + b <= c || a + c <= b || b + c <= a);
    values = { a, b, c };
    gv = [["_a", a], ["_b", b], ["_c", c]];
    rounded = false;
    exact = a + b + c;
    unit = "cm";
    prompt = `A triangle has sides of ${a} cm, ${b} cm and ${c} cm. What is its perimeter, in cm?${WHOLE}`;
    explanation = `The perimeter is the sum of the sides.\n\n\`${a} + ${b} + ${c}\` ${result(exact, false, unit)}`;
    candidates = [a + b, a * b, 2 * (a + b)];
    hints = [
      "The perimeter of a triangle is its three sides added together.",
      `Add two first: \`_a + _b = ${a} + ${b} = ${a + b}\`. Then add \`_c\` (${c}).`,
    ];
  } else {
    // Circles: always π and 2 decimals.
    rounded = true;
    let r, byDiameter;
    if (hard) {
      r = dec1(rng, 1, 25);
      byDiameter = rng.next() < 0.5;
    } else {
      r = rng.int(1, 20);
      byDiameter = rng.next() < 0.3;
    }
    const d = 2 * r;
    const given = byDiameter ? `a diameter of ${num(d)} cm` : `a radius of ${num(r)} cm`;
    const toR = byDiameter ? `The radius is half the diameter: \`r = ${num(d)} / 2 = ${num(r)}\`.\n\n` : "";
    const radiusHint = `You are given the diameter, ${num(d)} cm. The radius is half of it: \`r = ${num(d)} / 2 = ${num(r)}\`.`;
    if (kind === "circle-area") {
      values = { r };
      exact = Math.PI * r * r;
      unit = "cm²";
      prompt = `A circle has ${given}. What is its area, in cm²?${PI_ROUND}`;
      explanation = `${toR}Area of a circle = π × r².\n\n\`π × ${num(r)}² = π × ${num(r * r)}\` ${result(exact, true, unit)}`;
      candidates = [Math.PI * d * d, 2 * Math.PI * r, 3.14 * r * r]; // used the diameter, gave the circumference, used 3.14
      hints = [
        ...(byDiameter ? [radiusHint] : []),
        "Area of a circle = π × r²: square the radius, then multiply by π.",
        `Square the radius: \`${num(r)}² = ${num(r * r)}\`.`,
        "Multiply by π (type `pi` in the calculator, not 3.14), then round to 2 decimal places.",
      ];
    } else if (kind === "circle-circ") {
      values = { r };
      exact = 2 * Math.PI * r;
      unit = "cm";
      prompt = `A circle has ${given}. What is its circumference, in cm?${PI_ROUND}`;
      explanation = `${toR}Circumference = 2 × π × r (or π × d).\n\n\`2 × π × ${num(r)}\` ${result(exact, true, unit)}`;
      candidates = [Math.PI * r, Math.PI * r * r, 3.14 * d]; // forgot the 2, gave the area, used 3.14
      hints = [
        "Circumference = π × diameter, which is the same as 2 × π × r.",
        byDiameter
          ? `The diameter is ${num(d)} cm, so work out \`pi * ${num(d)}\`.`
          : `The diameter is \`2 × ${num(r)} = ${num(d)}\` cm, so work out \`pi * ${num(d)}\`.`,
        "Use π itself (type `pi`), not 3.14, and round to 2 decimal places.",
      ];
    } else {
      // circle-radius (hard): area given, rounded to 2 decimals, find the radius.
      const A = round2(Math.PI * r * r);
      values = { A };
      exact = Math.sqrt(A / Math.PI);
      unit = "cm";
      prompt = `A circle has an area of ${A.toFixed(2)} cm². What is its radius, in cm?${PI_ROUND}`;
      explanation = `Rearrange \`A = π × r²\` to \`r = √(A / π)\`.\n\n\`√(${A.toFixed(2)} / π) = √${(A / Math.PI).toFixed(4)}\` ${result(exact, true, unit)}`;
      candidates = [A / Math.PI, 2 * exact, Math.sqrt(A)]; // forgot the square root, gave the diameter, forgot π
      hints = [
        "Work backwards from A = π × r²: divide by π to get r², then take the square root.",
        `\`${A.toFixed(2)} ÷ π ≈ ${(A / Math.PI).toFixed(4)}\`: that is r².`,
        "Now take the square root (`sqrt(...)` in the calculator) and round to 2 decimal places.",
      ];
    }
  }

  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values, rounded }, ...givenRows(gv) };
  return { ...finish(base, exact, rounded, candidates, rng), hints };
}

function genAngles(difficulty, rng) {
  checkDifficulty(difficulty);
  const kinds = {
    easy: ["triangle", "supplementary", "complementary"],
    medium: ["triangle", "isosceles", "polygon-sum", "regular-each", "supplementary"],
    hard: ["isosceles", "regular-each", "regular-sides", "polygon-missing"],
  }[difficulty];
  const kind = rng.pick(kinds);
  const NAMES = { 3: "triangle", 4: "quadrilateral", 5: "pentagon", 6: "hexagon", 7: "heptagon", 8: "octagon", 9: "nonagon", 10: "decagon", 12: "dodecagon" };
  const shape = (n) => (NAMES[n] ? `${NAMES[n]} (${n} sides)` : `${n}-sided polygon`);
  let prompt, exact, rounded = false, explanation, candidates, values, gv, hints;

  if (kind === "triangle") {
    let a, b;
    do {
      a = rng.int(15, 120);
      b = rng.int(15, 120);
    } while (180 - a - b < 10);
    values = { angles: [a, b], total: 180 };
    gv = [["_a", a], ["_b", b]];
    exact = 180 - a - b;
    prompt = `Two angles of a triangle are ${a}° and ${b}°. What is the third angle?${DEG}`;
    explanation = `The angles in a triangle add up to 180°.\n\n\`180 - ${a} - ${b}\` ${result(exact, false, "°")}`;
    candidates = [a + b, 360 - a - b, 90 - Math.abs(a - b)];
    hints = [
      "The three angles in a triangle add up to 180°.",
      `Add the two you know: \`_a + _b = ${a} + ${b} = ${a + b}\`.`,
      "Take that away from 180.",
    ];
  } else if (kind === "supplementary" || kind === "complementary") {
    const total = kind === "supplementary" ? 180 : 90;
    const a = rng.int(5, total - 5);
    values = { angles: [a], total };
    exact = total - a;
    prompt = `Two angles are ${kind}. One of them is ${a}°. What is the other?${DEG}`;
    explanation = `${kind === "supplementary" ? "Supplementary angles add up to 180°" : "Complementary angles add up to 90°"}.\n\n\`${total} - ${a}\` ${result(exact, false, "°")}`;
    candidates = [270 - total - a, 360 - a, total + a]; // mixed up 90 and 180, used 360, added
    hints = [
      kind === "supplementary"
        ? "Supplementary angles add up to 180°, a straight line (**s**upplementary, **s**traight)."
        : "Complementary angles add up to 90°, a right angle (**c**omplementary, **c**orner).",
      `So take ${a} away from ${total}.`,
    ];
  } else if (kind === "isosceles") {
    // Apex angle given; the two base angles are equal.
    const apex = difficulty === "medium" ? 2 * rng.int(10, 80) : rng.int(20, 160);
    rounded = apex % 2 !== 0;
    values = { apex };
    exact = (180 - apex) / 2;
    prompt = `An isosceles triangle has an angle of ${apex}° between its two equal sides. What is each of the other two angles?${DEG}${rounded ? ROUND : WHOLE}`;
    explanation = `The two base angles are equal and all three add up to 180°.\n\n\`(180 - ${apex}) / 2 = ${180 - apex} / 2\` ${result(exact, rounded, "°")}`;
    candidates = [180 - apex, apex, (180 - apex) / 3]; // forgot to halve, copied the apex, split three ways
    hints = [
      "In an isosceles triangle the two base angles are equal, and all three angles add up to 180°.",
      `Take the given angle away from 180: \`180 - ${apex} = ${180 - apex}\`. The two equal angles share that.`,
      `Split ${180 - apex} equally between the two base angles.${rounded ? " Round to 2 decimal places." : ""}`,
    ];
  } else if (kind === "polygon-sum") {
    const n = rng.int(4, 12);
    values = { n };
    exact = (n - 2) * 180;
    prompt = `What is the sum of the interior angles of a ${shape(n)}?${DEG}`;
    explanation = `Sum of interior angles = (n - 2) × 180°.\n\n\`(${n} - 2) × 180 = ${n - 2} × 180\` ${result(exact, false, "°")}`;
    candidates = [n * 180, (n - 1) * 180, 360]; // forgot the -2, off by one, used the exterior sum
    hints = [
      "Sum of the interior angles = (n - 2) × 180°, because lines from one corner split the polygon into n - 2 triangles.",
      `This shape has ${n} sides, so it splits into \`${n} - 2 = ${n - 2}\` triangles. Multiply that by 180.`,
    ];
  } else if (kind === "regular-each") {
    let n;
    if (difficulty === "medium") {
      n = rng.pick([3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36]);
    } else {
      n = rng.int(5, 24);
    }
    rounded = difficulty === "hard";
    values = { n };
    exact = ((n - 2) * 180) / n;
    prompt = `What is the size of each interior angle of a regular ${shape(n)}?${DEG}${rounded ? ROUND : WHOLE}`;
    explanation =
      `Sum of interior angles = (n - 2) × 180° = \`${n - 2} × 180 = ${(n - 2) * 180}\`.\n\n` +
      `A regular polygon has equal angles, so divide by ${n}: \`${(n - 2) * 180} / ${n}\` ${result(exact, rounded, "°")}`;
    candidates = [360 / n, (n - 2) * 180, ((n - 1) * 180) / n]; // exterior angle, the sum, used (n - 1)
    hints = [
      "First find the sum of all the interior angles: (n - 2) × 180°.",
      `With ${n} sides: \`(${n} - 2) × 180 = ${(n - 2) * 180}\`.`,
      `A regular polygon has ${n} equal angles, so share ${(n - 2) * 180} equally between them.${rounded ? " Round to 2 decimal places." : ""}`,
    ];
  } else if (kind === "regular-sides") {
    // Each interior angle given (a whole number); find how many sides.
    const n = rng.pick([5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60]);
    const angle = ((n - 2) * 180) / n;
    values = { angle };
    exact = n;
    prompt = `Each interior angle of a regular polygon is ${angle}°. How many sides does it have?${WHOLE}`;
    explanation =
      `Each exterior angle is \`180 - ${angle} = ${180 - angle}°\`, and the exterior angles add up to 360°.\n\n` +
      `Number of sides = \`360 / ${180 - angle}\` ${result(exact, false, "sides")}`;
    candidates = [360 / angle, 180 / (180 - angle), n + 2]; // divided by the interior angle, used 180, off by two
    hints = [
      "Use the exterior angles: each interior angle and its exterior angle make a straight line (180°), and the exterior angles of any polygon add up to 360°.",
      `Each exterior angle is \`180 - ${angle} = ${180 - angle}\`°.`,
      `How many angles of ${180 - angle}° fit into 360°? Divide.`,
    ];
  } else {
    // polygon-missing (hard): all but one interior angle of an irregular polygon are given.
    const n = rng.int(5, 8);
    const sum = (n - 2) * 180;
    let angles, missing;
    for (;;) {
      angles = [];
      for (let i = 0; i < n - 1; i++) angles.push(rng.int(70, 175));
      missing = sum - angles.reduce((s, x) => s + x, 0);
      if (missing >= 40 && missing <= 179) break;
    }
    values = { angles, total: sum };
    gv = [["_n", n], ...angles.map((x, i) => [`_a${i + 1}`, x])]; // n ≤ 8, so at most 8 rows
    exact = missing;
    const known = angles.reduce((s, x) => s + x, 0);
    prompt = `A ${shape(n)} has interior angles of ${angles.map((x) => `${x}°`).join(", ")} and one unknown angle. What is the unknown angle?${DEG}`;
    explanation =
      `Sum of interior angles = \`(${n} - 2) × 180 = ${sum}°\`. The known angles add up to ${known}°.\n\n` +
      `\`${sum} - ${known}\` ${result(exact, false, "°")}`;
    candidates = [n * 180 - known, (n - 1) * 180 - known, 360 - (known % 360)];
    hints = [
      "First find what all the interior angles add up to: (n - 2) × 180°.",
      `This shape has \`_n\` = ${n} sides: \`(${n} - 2) × 180 = ${sum}\`.`,
      `The known angles (\`_a1\` to \`_a${n - 1}\`) add up to ${known}. The missing angle is whatever is left of ${sum}.`,
    ];
  }

  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values, rounded }, ...givenRows(gv) };
  return { ...finish(base, exact, rounded, candidates, rng), hints };
}

const TRIPLES = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [9, 40, 41],
  [12, 35, 37],
];

function genPythagoras(difficulty, rng) {
  checkDifficulty(difficulty);
  let a, b, c, find;
  if (difficulty === "hard") {
    find = rng.pick(["hyp", "leg"]);
    a = dec1(rng, 2, 30);
    b = dec1(rng, 2, 30);
    c = dec1(rng, Math.ceil(a) + 1, Math.ceil(a) + 25); // only used for "leg"; hypotenuse c > leg a
  } else {
    const [p, q, r] = rng.pick(TRIPLES);
    const k = rng.int(1, difficulty === "easy" ? 4 : 8);
    [a, b] = rng.next() < 0.5 ? [p * k, q * k] : [q * k, p * k];
    c = r * k;
    find = difficulty === "easy" ? "hyp" : rng.pick(["hyp", "leg"]);
  }
  const rounded = difficulty === "hard";
  const end = rounded ? ROUND : WHOLE;
  let prompt, exact, explanation, candidates, values, gv, hints;
  if (find === "hyp") {
    values = { a, b };
    gv = [["_a", a], ["_b", b]];
    exact = Math.sqrt(a * a + b * b);
    prompt = `A right triangle has legs of ${num(a)} cm and ${num(b)} cm. How long is the hypotenuse, in cm?${end}`;
    explanation =
      `Pythagoras: \`c² = a² + b²\`.\n\n` +
      `\`c² = ${num(a)}² + ${num(b)}² = ${num(a * a)} + ${num(b * b)} = ${num(a * a + b * b)}\`\n\n` +
      `\`c = √${num(a * a + b * b)}\` ${result(exact, rounded, "cm")}`;
    candidates = [a + b, a * a + b * b, Math.sqrt(Math.abs(a * a - b * b))]; // added the sides, forgot the root, subtracted
    hints = [
      "The hypotenuse is the longest side, opposite the right angle. Pythagoras: `c² = a² + b²`.",
      `Square both legs and add: \`_a² + _b² = ${num(a * a)} + ${num(b * b)} = ${num(a * a + b * b)}\`. That is c².`,
      `Take the square root of ${num(a * a + b * b)}.${rounded ? " Round to 2 decimal places." : " It comes out as a whole number."}`,
    ];
  } else {
    values = { a, c };
    gv = [["_c", c], ["_a", a]];
    exact = Math.sqrt(c * c - a * a);
    prompt = `A right triangle has a hypotenuse of ${num(c)} cm and one leg of ${num(a)} cm. How long is the other leg, in cm?${end}`;
    explanation =
      `Pythagoras: \`a² + b² = c²\`, so \`b² = c² - a²\`.\n\n` +
      `\`b² = ${num(c)}² - ${num(a)}² = ${num(c * c)} - ${num(a * a)} = ${num(c * c - a * a)}\`\n\n` +
      `\`b = √${num(c * c - a * a)}\` ${result(exact, rounded, "cm")}`;
    candidates = [Math.sqrt(c * c + a * a), c - a, c * c - a * a]; // added the squares, subtracted the sides, forgot the root
    hints = [
      "You know the hypotenuse, so rearrange Pythagoras: `b² = c² - a²` (subtract the squares, don't add them).",
      `\`_c² - _a² = ${num(c * c)} - ${num(a * a)} = ${num(c * c - a * a)}\`. That is b².`,
      `Take the square root of ${num(c * c - a * a)}.${rounded ? " Round to 2 decimal places." : " It comes out as a whole number."}`,
    ];
  }
  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind: find, values, rounded }, ...givenRows(gv) };
  return { ...finish(base, exact, rounded, candidates, rng), hints };
}

function genVolume(difficulty, rng) {
  if (difficulty !== "medium" && difficulty !== "hard") throw new Error(`volume has no "${difficulty}" level`);
  const hard = difficulty === "hard";
  const kind = rng.pick(["cuboid", "cylinder", "sphere"]);
  let prompt, exact, rounded, explanation, candidates, values, gv, hints;

  if (kind === "cuboid") {
    let l, w, h;
    if (hard) {
      l = dec1(rng, 1, 20);
      w = dec1(rng, 1, 20);
      h = dec1(rng, 1, 20);
    } else {
      l = rng.int(2, 15);
      w = rng.int(2, 15);
      h = rng.int(2, 15);
    }
    rounded = hard;
    values = { l, w, h };
    gv = [["_l", l], ["_w", w], ["_h", h]];
    exact = l * w * h;
    prompt = `A cuboid is ${num(l)} cm long, ${num(w)} cm wide and ${num(h)} cm high. What is its volume, in cm³?${rounded ? ROUND : WHOLE}`;
    explanation = `Volume of a cuboid = length × width × height.\n\n\`${num(l)} × ${num(w)} × ${num(h)}\` ${result(exact, rounded, "cm³")}`;
    candidates = [2 * (l * w + w * h + l * h), l * w + w * h + l * h, l + w + h]; // surface area, half of it, added
    hints = [
      "Volume of a cuboid = length × width × height.",
      `Multiply two of them first: \`_l × _w = ${num(l)} × ${num(w)} = ${num(l * w)}\` (the area of the base).`,
      `Now multiply by the height, \`_h\` = ${num(h)}.${rounded ? " Round to 2 decimal places." : ""}`,
    ];
  } else {
    rounded = true;
    let r, h, byDiameter;
    if (hard) {
      r = dec1(rng, 1, 15);
      h = dec1(rng, 1, 30);
      byDiameter = rng.next() < 0.5;
    } else {
      r = rng.int(1, 12);
      h = rng.int(1, 20);
      byDiameter = false;
    }
    const d = 2 * r;
    const toR = byDiameter ? `The radius is half the diameter: \`r = ${num(d)} / 2 = ${num(r)}\`.\n\n` : "";
    const given = byDiameter ? `a diameter of ${num(d)} cm` : `a radius of ${num(r)} cm`;
    if (kind === "cylinder") {
      values = { r, h };
      gv = [byDiameter ? ["_d", d] : ["_r", r], ["_h", h]]; // whichever the prompt states
      exact = Math.PI * r * r * h;
      prompt = `A cylinder has ${given} and a height of ${num(h)} cm. What is its volume, in cm³?${PI_ROUND}`;
      explanation = `${toR}Volume of a cylinder = π × r² × h.\n\n\`π × ${num(r)}² × ${num(h)} = π × ${num(r * r * h)}\` ${result(exact, true, "cm³")}`;
      candidates = [Math.PI * d * d * h, 2 * Math.PI * r * h, 3.14 * r * r * h]; // used the diameter, curved surface, used 3.14
      hints = [
        "Volume of a cylinder = area of the circle × height = π × r² × h.",
        ...(byDiameter ? [`You are given the diameter (\`_d\` = ${num(d)}), so halve it: r = ${num(r)}.`] : []),
        `\`${num(r)}² × ${num(h)} = ${num(r * r)} × ${num(h)} = ${num(r * r * h)}\`.`,
        "Multiply by π (type `pi`, not 3.14), then round to 2 decimal places.",
      ];
    } else {
      values = { r };
      exact = (4 / 3) * Math.PI * r ** 3;
      prompt = `A sphere has ${given}. What is its volume, in cm³?${PI_ROUND}`;
      explanation = `${toR}Volume of a sphere = 4/3 × π × r³.\n\n\`4/3 × π × ${num(r)}³ = 4/3 × π × ${num(r ** 3)}\` ${result(exact, true, "cm³")}`;
      candidates = [4 * Math.PI * r * r, Math.PI * r ** 3, (4 / 3) * 3.14 * r ** 3]; // surface area, forgot 4/3, used 3.14
      hints = [
        "Volume of a sphere = 4/3 × π × r³.",
        ...(byDiameter ? [`You are given the diameter, ${num(d)} cm, so halve it: r = ${num(r)}.`] : []),
        `Cube the radius: \`${num(r)}³ = ${num(r)} × ${num(r)} × ${num(r)} = ${num(r ** 3)}\`.`,
        "Multiply by 4/3 and by π (for example `4/3 * pi * ...` in the calculator), then round to 2 decimal places.",
      ];
    }
  }
  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values, rounded }, ...givenRows(gv) };
  return { ...finish(base, exact, rounded, candidates, rng), hints };
}

// ---- Expert: multi-step questions (easy/medium/hard above are untouched) ----
//
// Each template draws its rng values first (re-drawing while a rounded answer would sit on a
// ±0.005 tie), then builds text. Hints use only values already drawn (no rng) and never state a
// final answer. Params use "x-" kinds, checked by verifyExpert below.

const tie2 = (x) => Math.abs(((Math.abs(x) * 100) % 1) - 0.5) < 1e-4;
const f2 = (x) => fmtAns(x, true); // 2-decimal display
const xPart = (id, label, ask, exact, rounded, hint) => ({
  id, label, ask, answerType: "number", answer: rounded ? round2(exact) : exact, tolerance: rounded ? 0.005 : 0, hint,
});
const xChoice = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });
// "3x + 10", "x - 5", "4x"
const xLin = (m, c) => `${m === 1 ? "" : m}x${c === 0 ? "" : c < 0 ? ` - ${-c}` : ` + ${c}`}`;
const xGiven = (pairs) => ({ given: pairs.map(([label, value]) => ({ label, value })) });
const xGivenIf = (pairs) => (pairs.length >= 2 ? xGiven(pairs) : {});

// perimeter-area 0: rectangle with a semicircle added to / cut out of one end.
function xComposite(rng) {
  let L, W, cut, area, perim;
  for (;;) {
    L = rng.int(6, 30);
    W = rng.int(4, 20);
    cut = rng.next() < 0.5;
    const semi = (Math.PI * W * W) / 8;
    area = cut ? L * W - semi : L * W + semi;
    perim = 2 * L + W + (Math.PI * W) / 2;
    if (L > W / 2 + 2 && !tie2(area) && !tie2(perim)) break;
  }
  const r = W / 2;
  const semi = (Math.PI * W * W) / 8;
  const prompt =
    `A shape is a rectangle ${L} cm long and ${W} cm wide, with a semicircle ${cut ? "cut out of" : "added to"} one of its ${W} cm ends ` +
    `(the semicircle's diameter is that whole end).${PI_ROUND}`;
  const explanation = [
    `Rectangle: \`${L} × ${W} = ${L * W}\` cm². Semicircle: radius \`${W} / 2 = ${num(r)}\`, area \`½ × π × ${num(r)}² ≈ ${semi.toFixed(4)}\` cm².`,
    `Area = \`${L * W} ${cut ? "-" : "+"} ${semi.toFixed(4)}\` ${result(area, true, "cm²")}`,
    `Perimeter: the two long sides, the straight end without the semicircle, and the curved arc (half of π × ${W}). The end with the semicircle is not part of the outline.`,
    `\`2 × ${L} + ${W} + π × ${W} / 2\` ${result(perim, true, "cm")}`,
  ].join("\n\n");
  return {
    prompt,
    answerType: "multi",
    parts: [
      xPart("area", "Area", "Area of the shape (cm²)", area, true, `Area of the rectangle ${cut ? "minus" : "plus"} the area of the semicircle (half of π × r²).`),
      xPart("perimeter", "Perimeter", "Perimeter of the shape (cm)", perim, true,
        "Go round the outside: two long sides, one straight end, and the arc. The arc is half of π × diameter."),
    ],
    explanation,
    params: { kind: "x-composite", L, W, cut },
    ...xGiven([["_L", L], ["_W", W]]),
    hints: [
      `Split the shape into a rectangle (\`_L × _W\`) and a semicircle of diameter ${W} cm.`,
      `The semicircle's radius is \`_W / 2 = ${num(r)}\` cm, and its area is half of π × r².`,
      `For the perimeter, the straight ${W} cm end under the semicircle is inside the shape's outline${cut ? " (it was cut away)" : ""}: replace it with the arc.`,
    ],
  };
}

// perimeter-area 1: rectangle from its perimeter and area (working backwards).
function xRectBack(rng) {
  const l = rng.int(5, 30);
  const w = rng.int(2, l - 1);
  const P = 2 * (l + w);
  const A = l * w;
  const S = l + w;
  return {
    prompt: `A rectangle has a perimeter of ${P} cm and an area of ${A} cm². Its sides are whole numbers of cm. Find its length and width. Give whole numbers.`,
    answerType: "multi",
    parts: [
      xPart("length", "Length", "Length, the longer side (cm)", l, false, "The longer of the two numbers that add to half the perimeter and multiply to the area."),
      xPart("width", "Width", "Width, the shorter side (cm)", w, false, "The shorter of the same two numbers."),
    ],
    explanation: [
      `Perimeter = 2 × (l + w), so \`l + w = ${P} / 2 = ${S}\`.`,
      `Area: \`l × w = ${A}\`. Find two numbers that add to ${S} and multiply to ${A} (or solve \`w(${S} - w) = ${A}\`).`,
      `They are **${l}** and **${w}**: \`${l} + ${w} = ${S}\` and \`${l} × ${w} = ${A}\`.`,
    ].join("\n\n"),
    params: { kind: "x-rectback", P, A },
    ...xGiven([["_P", P], ["_A", A]]),
    hints: [
      `Halve the perimeter: \`_P / 2 = ${S}\`. That is length + width.`,
      `Look for two whole numbers that add to ${S} and multiply to ${A}. Try factor pairs of ${A}.`,
    ],
  };
}

// perimeter-area 2: path of constant width around a rectangular lawn.
function xBorder(rng) {
  const L = rng.int(4, 25);
  const W = rng.int(3, L);
  const p = rng.int(1, 6) / 2;
  const OL = L + 2 * p;
  const OW = W + 2 * p;
  const path = OL * OW - L * W;
  const outer = 2 * (OL + OW);
  return {
    prompt: `A rectangular lawn is ${L} m long and ${W} m wide. A path ${num(p)} m wide runs all the way round the outside of it. Give exact answers (they may be decimals).`,
    answerType: "multi",
    parts: [
      xPart("path", "Path area", "Area of the path (m²)", path, true, "Outer rectangle area minus the lawn's area."),
      xPart("outer", "Outer perimeter", "Perimeter of the outer edge of the path (m)", outer, true, "Use the outer rectangle's length and width."),
    ],
    explanation: [
      `The path adds ${num(p)} m on **both** sides, so the outer rectangle is \`${L} + 2 × ${num(p)} = ${num(OL)}\` m by \`${W} + 2 × ${num(p)} = ${num(OW)}\` m.`,
      `Path area = outer area - lawn area = \`${num(OL)} × ${num(OW)} - ${L} × ${W} = ${num(OL * OW)} - ${L * W}\` = **${num(path)} m²**.`,
      `Outer perimeter = \`2 × (${num(OL)} + ${num(OW)})\` = **${num(outer)} m**.`,
    ].join("\n\n"),
    params: { kind: "x-border", L, W, p },
    ...xGiven([["_L", L], ["_W", W], ["_p", p]]),
    hints: [
      "Draw it: the path makes a bigger rectangle around the lawn.",
      `The path is on both ends and both sides, so each outer measurement is the lawn's plus \`2 × _p\` (${num(2 * p)} m).`,
      "Path area = outer rectangle's area - lawn's area.",
    ],
  };
}

// perimeter-area 3: one wire bent into a circle or a square.
function xWire(rng) {
  let X, r, diff;
  for (;;) {
    X = rng.int(20, 200);
    r = X / (2 * Math.PI);
    diff = (X * X) / (4 * Math.PI) - (X * X) / 16;
    if (!tie2(r) && !tie2(diff)) break;
  }
  return {
    prompt: `A piece of wire ${X} cm long is bent into a circle. The same length of wire could instead be bent into a square.${PI_ROUND}`,
    answerType: "multi",
    parts: [
      xPart("radius", "Radius", "Radius of the circle (cm)", r, true, "Circumference = 2 × π × r, and the circumference is the whole wire."),
      xPart("extra", "Extra area", "How much more area the circle encloses than the square (cm²)", diff, true,
        "Circle area π × r² minus square area (side × side). Use the unrounded radius."),
    ],
    explanation: [
      `The circumference is ${X} cm, so \`r = ${X} / (2π)\` ${result(r, true, "cm")}`,
      `Circle area = \`π × r² = ${X}² / (4π) ≈ ${((X * X) / (4 * Math.PI)).toFixed(4)}\` cm².`,
      `The square's side is \`${X} / 4 = ${num(X / 4)}\` cm, so its area is \`${num((X * X) / 16)}\` cm².`,
      `Difference: \`${((X * X) / (4 * Math.PI)).toFixed(4)} - ${num((X * X) / 16)}\` ${result(diff, true, "cm²")}`,
    ].join("\n\n"),
    params: { kind: "x-wire", X },
    hints: [
      `The wire becomes the circumference: \`2 × π × r = ${X}\`. Rearrange for r.`,
      `As a square, the same ${X} cm is shared between 4 equal sides.`,
      "Work out both areas, keeping the radius unrounded, then subtract.",
    ],
  };
}

const X_DIV180 = [5, 6, 9, 10, 12, 15, 18, 20, 30, 36, 45, 60]; // exterior angles that divide 180 (and 360)
const X_EXT = [5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60, 72]; // exterior angles < 90 dividing 360

// angles 0: regular polygon from a relation between interior and exterior angles.
function xPolyExt(rng) {
  const variant = rng.int(0, 2);
  let e, k, D, S;
  if (variant === 0) {
    e = rng.pick(X_DIV180);
    k = 180 / e - 1;
  } else if (variant === 1) {
    e = rng.pick(X_EXT);
    D = 180 - 2 * e;
  } else {
    e = rng.pick(X_EXT.concat([90, 120]));
  }
  const n = 360 / e;
  const interior = 180 - e;
  const total = (n - 2) * 180;
  if (variant === 2) S = total;
  const relation = variant === 0
    ? `each interior angle is ${k} times as big as each exterior angle`
    : variant === 1
      ? `each interior angle is ${D}° bigger than each exterior angle`
      : `the interior angles add up to ${S}°`;
  const prompt = `In a regular polygon, ${relation}.${variant === 2 ? DEG : ""} Give whole numbers.`;
  const firstStep = variant === 0
    ? `Let each exterior angle be e. The interior angle is 180 - e, so \`180 - e = ${k}e\`, giving \`${k + 1}e = 180\` and e = ${e}°.`
    : variant === 1
      ? `Let each exterior angle be e. The interior angle is 180 - e, so \`(180 - e) - e = ${D}\`, giving \`2e = ${180 - D}\` and e = ${e}°.`
      : `\`(n - 2) × 180 = ${S}\`, so \`n - 2 = ${S / 180}\` and **n = ${n}**.`;
  const parts = variant === 2
    ? [
      xPart("sides", "Sides", "Number of sides", n, false, "Divide the total by 180, then add 2."),
      xPart("exterior", "Exterior angle", "Each exterior angle (degrees)", e, false, "The exterior angles of any polygon add up to 360°, and in a regular one they are all equal."),
    ]
    : [
      xPart("sides", "Sides", "Number of sides", n, false, "Find the exterior angle first, then divide 360 by it."),
      xPart("total", "Angle sum", "Sum of the interior angles (degrees)", total, false, "Use (n - 2) × 180, or n × each interior angle."),
    ];
  const explanation = variant === 2
    ? [firstStep, `Exterior angles add up to 360°, so each is \`360 / ${n}\` = **${e}°**.`].join("\n\n")
    : [
      firstStep,
      `Exterior angles add up to 360°, so \`n = 360 / ${e}\` = **${n}** sides.`,
      `Interior angle sum = \`(${n} - 2) × 180\` = **${total}°** (check: \`${n} × ${interior} = ${n * interior}\`).`,
    ].join("\n\n");
  const hints = variant === 2
    ? ["Interior angle sum = (n - 2) × 180°. Set that equal to the total and solve for n.", "Then use the exterior angles: they add up to 360°."]
    : [
      "Call each exterior angle e. Interior and exterior angles make a straight line, so each interior angle is 180 - e.",
      variant === 0 ? `Write the equation \`180 - e = ${k} × e\` and solve for e.` : `Write the equation \`(180 - e) - e = ${D}\` and solve for e.`,
      "The exterior angles add up to 360°, so the number of sides is 360 ÷ e.",
    ];
  return { prompt, answerType: "multi", parts, explanation, params: { kind: "x-polyext", variant, k, D, S }, hints };
}

// angles 1: angles written in terms of x (triangle or quadrilateral).
function xAlgAngles(rng) {
  const quad = rng.next() < 0.4;
  const total = quad ? 360 : 180;
  const cnt = quad ? 4 : 3;
  const x = rng.int(4, 25);
  let vals;
  for (;;) {
    vals = [];
    for (let i = 0; i < cnt - 1; i++) vals.push(quad ? rng.int(40, 150) : rng.int(20, 110));
    const last = total - vals.reduce((s, v) => s + v, 0);
    if (last >= (quad ? 40 : 20) && last <= (quad ? 170 : 140)) { vals.push(last); break; }
  }
  let ms, cs, M, C;
  do { // re-draw if the collected constant would equal x (the hint shows it)
    ms = vals.map(() => rng.int(1, 5));
    cs = vals.map((v, i) => v - ms[i] * x);
    M = ms.reduce((s, m) => s + m, 0);
    C = cs.reduce((s, c) => s + c, 0);
  } while (Math.abs(C) === x || M === x);
  const exprs = ms.map((m, i) => `(${xLin(m, cs[i])})°`);
  const listed = `${exprs.slice(0, -1).join(", ")} and ${exprs[exprs.length - 1]}`;
  const largest = Math.max(...vals);
  return {
    prompt: `The angles of a ${quad ? "quadrilateral" : "triangle"} are ${listed}. Find x, then the size of the largest angle. Give whole numbers.`,
    answerType: "multi",
    parts: [
      xPart("x", "x", "Value of x", x, false, `Set the sum of the expressions equal to ${total} and solve.`),
      xPart("largest", "Largest angle", "Largest angle (degrees)", largest, false, "Substitute x into every angle and pick the biggest: the one with the biggest x coefficient isn't always it."),
    ],
    explanation: [
      `The angles of a ${quad ? "quadrilateral add up to 360°" : "triangle add up to 180°"}. Adding the expressions: \`${xLin(M, C)} = ${total}\`.`,
      `\`${M}x = ${total - C}\`, so **x = ${x}**.`,
      `Angles: ${vals.map((v) => `${v}°`).join(", ")}. Largest: **${largest}°**.`,
    ].join("\n\n"),
    params: { kind: "x-algangles", ms, cs, total },
    ...xGivenIf(cs.map((c, i) => [`_c${i + 1}`, c]).filter(([, c]) => c !== 0)),
    hints: [
      `The angles of a ${quad ? "quadrilateral" : "triangle"} add up to ${total}°. Add all the expressions together.`,
      `Collect the x terms and the numbers: you should get \`${xLin(M, C)} = ${total}\`.`,
      "Solve for x, then put it back into each angle.",
    ],
  };
}

// angles 2: polygon angles in a given ratio.
function xRatioAngles(rng) {
  let n, rs, total, R;
  for (;;) {
    n = rng.int(3, 7);
    rs = [];
    for (let i = 0; i < n; i++) rs.push(rng.int(1, 9));
    total = (n - 2) * 180;
    R = rs.reduce((s, v) => s + v, 0);
    if (total % R === 0 && (Math.max(...rs) * total) / R < 180 && new Set(rs).size > 1) break;
  }
  const unit = total / R;
  const small = Math.min(...rs) * unit;
  const large = Math.max(...rs) * unit;
  const NAMES = { 3: "triangle", 4: "quadrilateral", 5: "pentagon", 6: "hexagon", 7: "heptagon" };
  return {
    prompt: `The interior angles of a ${NAMES[n]} are in the ratio ${rs.join(" : ")}. Find the smallest and the largest angle. Give whole numbers.`,
    answerType: "multi",
    parts: [
      xPart("smallest", "Smallest", "Smallest angle (degrees)", small, false, `Multiply one share by the smallest ratio number, ${Math.min(...rs)}.`),
      xPart("largest", "Largest", "Largest angle (degrees)", large, false, `Multiply one share by the largest ratio number, ${Math.max(...rs)}.`),
    ],
    explanation: [
      `Interior angle sum = \`(${n} - 2) × 180 = ${total}°\`.`,
      `Ratio parts: \`${rs.join(" + ")} = ${R}\`, so one part is \`${total} / ${R} = ${unit}°\`.`,
      `Smallest: \`${Math.min(...rs)} × ${unit}\` = **${small}°**. Largest: \`${Math.max(...rs)} × ${unit}\` = **${large}°**.`,
    ].join("\n\n"),
    params: { kind: "x-ratioangles", rs },
    ...xGiven(rs.map((v, i) => [`_r${i + 1}`, v])),
    hints: [
      `First find the interior angle sum of a ${NAMES[n]}: (n - 2) × 180° with n = ${n}.`,
      `Add the ratio numbers to find how many equal shares there are (${R}).`,
      "Divide the angle sum by the number of shares to get one share.",
    ],
  };
}

// pythagoras 0: cuboid face and space diagonals, plus does a rod fit.
function xCuboid(rng) {
  let l, w, h, d1, d2, R;
  for (;;) {
    l = rng.int(3, 30);
    w = rng.int(2, 25);
    h = rng.int(2, 25);
    d1 = Math.hypot(l, w);
    d2 = Math.sqrt(l * l + w * w + h * h);
    R = Math.round(d2) + rng.pick([-3, -2, -1, 1, 2, 3]);
    if (!tie2(d1) && !tie2(d2) && Math.abs(R - d2) >= 0.3 && R > d1) break;
  }
  const fits = R <= d2 ? "Yes" : "No";
  return {
    prompt: `A box (cuboid) is ${l} cm long, ${w} cm wide and ${h} cm high. A thin straight rod is ${R} cm long. Round lengths to 2 decimal places.`,
    answerType: "multi",
    parts: [
      xPart("base", "Base diagonal", "Diagonal of the base (cm)", d1, true, "Pythagoras on the base: length and width are the legs."),
      xPart("space", "Space diagonal", "Diagonal from a bottom corner to the opposite top corner (cm)", d2, true,
        "A second right triangle: the base diagonal and the height are its legs."),
      xChoice("fits", "Fits?", "Can the rod fit inside the closed box?", fits, ["Yes", "No"],
        "The longest straight line inside a box is the space diagonal. Compare the rod with it."),
    ],
    explanation: [
      `Base diagonal: \`√(${l}² + ${w}²) = √${l * l + w * w}\` ${result(d1, true, "cm")}`,
      `Space diagonal: \`√(base diagonal² + ${h}²) = √(${l * l + w * w} + ${h * h}) = √${l * l + w * w + h * h}\` ${result(d2, true, "cm")}`,
      `The longest rod that fits is the space diagonal, about ${f2(d2)} cm. The rod is ${R} cm, so: **${fits}**.`,
    ].join("\n\n"),
    params: { kind: "x-cuboid", l, w, h, R },
    ...xGiven([["_l", l], ["_w", w], ["_h", h], ["_R", R]]),
    hints: [
      "Start on the floor of the box: the base diagonal is the hypotenuse of a right triangle with legs `_l` and `_w`.",
      "The space diagonal is the hypotenuse of an upright right triangle: its legs are the base diagonal and the height `_h`.",
      `So the space diagonal is √(_l² + _w² + _h²) = √${l * l + w * w + h * h}.`,
    ],
  };
}

// pythagoras 1: ladder against a wall slips down.
function xLadder(rng) {
  let L, d, s, h, d2, move;
  for (;;) {
    L = rng.int(4, 12);
    d = rng.int(10, L * 5) / 10;
    s = rng.int(2, 15) / 10;
    h = Math.sqrt(L * L - d * d);
    if (h - s <= 0.5) continue;
    d2 = Math.sqrt(L * L - (h - s) ** 2);
    move = d2 - d;
    if (!tie2(h) && !tie2(move)) break;
  }
  return {
    prompt: `A ${L} m ladder leans against a vertical wall on flat ground, with its foot ${num(d)} m from the wall. The top of the ladder then slides ${num(s)} m down the wall.${ROUND}${UNROUNDED_G}`,
    answerType: "multi",
    parts: [
      xPart("height", "Height", "How high up the wall the ladder reaches at first (m)", h, true, "The ladder is the hypotenuse; the wall and the ground are the legs."),
      xPart("slide", "Foot moves", "How far the foot of the ladder moves away from the wall (m)", move, true,
        "Find the new distance of the foot from the wall, then subtract the old distance."),
    ],
    explanation: [
      `At first: \`h = √(${L}² - ${num(d)}²) = √${num(L * L - d * d)}\` ${result(h, true, "m")}`,
      `After slipping, the top is at \`h - ${num(s)} ≈ ${(h - s).toFixed(4)}\` m. The ladder is still ${L} m long.`,
      `New foot distance: \`√(${L}² - ${(h - s).toFixed(4)}²) ≈ ${d2.toFixed(4)}\` m.`,
      `The foot moves \`${d2.toFixed(4)} - ${num(d)}\` ${result(move, true, "m")}`,
    ].join("\n\n"),
    params: { kind: "x-ladder", L, d, s },
    ...xGiven([["_L", L], ["_d", d], ["_s", s]]),
    hints: [
      "Draw the right triangle: wall (height), ground (distance of the foot) and the ladder as the hypotenuse.",
      "Height at first: `sqrt(_L^2 - _d^2)`. Keep it unrounded in the calculator.",
      "After slipping the height is smaller by `_s`, but the ladder's length is the same. Use Pythagoras again for the new foot distance, then compare it with `_d`.",
    ],
  };
}
const UNROUNDED_G = " Keep unrounded values in your working.";

// pythagoras 2: coordinates: side lengths and is the triangle right-angled.
function xCoord(rng) {
  let A, B, C, right;
  for (;;) {
    A = [rng.int(-8, 8), rng.int(-8, 8)];
    const p = rng.int(-6, 6);
    const q = rng.int(-6, 6);
    const k = rng.int(1, 2);
    right = rng.next() < 0.5;
    B = [A[0] + p, A[1] + q];
    C = [A[0] - k * q, A[1] + k * p];
    if (!right) {
      const nudge = rng.pick([[1, 0], [0, 1], [-1, 0], [0, -1]]);
      C = [C[0] + nudge[0], C[1] + nudge[1]];
    }
    if (p === 0 && q === 0) continue;
    const pts = [A, B, C];
    const dots = [0, 1, 2].map((i) => {
      const P = pts[i], Q = pts[(i + 1) % 3], R = pts[(i + 2) % 3];
      return (Q[0] - P[0]) * (R[0] - P[0]) + (Q[1] - P[1]) * (R[1] - P[1]);
    });
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (cross === 0) continue;
    if (!right && dots.some((x) => x === 0)) continue;
    const ab = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const bc = Math.hypot(C[0] - B[0], C[1] - B[1]);
    if (!tie2(ab) && !tie2(bc)) break;
  }
  const pt = (P) => `(${P[0]}, ${P[1]})`;
  const sq = (P, Q) => (Q[0] - P[0]) ** 2 + (Q[1] - P[1]) ** 2;
  const [ab2, bc2, ca2] = [sq(A, B), sq(B, C), sq(C, A)];
  const ab = Math.sqrt(ab2), bc = Math.sqrt(bc2);
  const big = Math.max(ab2, bc2, ca2);
  const ans = right ? "Yes" : "No";
  return {
    prompt: `A triangle has corners A${pt(A)}, B${pt(B)} and C${pt(C)}. Round lengths to 2 decimal places where needed.`,
    answerType: "multi",
    parts: [
      xPart("ab", "AB", "Length of AB", ab, true, "Horizontal change and vertical change are the legs of a right triangle; AB is its hypotenuse."),
      xPart("bc", "BC", "Length of BC", bc, true, "Same method: square the x-change and the y-change, add, square root."),
      xChoice("right", "Right angle?", "Is triangle ABC right-angled?", ans, ["Yes", "No"],
        "Compare the squared lengths: it is right-angled only if the two smaller squares add up exactly to the largest."),
    ],
    explanation: [
      `\`AB² = ${B[0] - A[0]}² + ${B[1] - A[1]}² = ${ab2}\`, so AB ${result(ab, true, "units")}`,
      `\`BC² = ${C[0] - B[0]}² + ${C[1] - B[1]}² = ${bc2}\`, so BC ${result(bc, true, "units")}`,
      `\`CA² = ${A[0] - C[0]}² + ${A[1] - C[1]}² = ${ca2}\`.`,
      `Converse of Pythagoras: the two smaller squares add to \`${ab2 + bc2 + ca2 - big}\`, the largest is \`${big}\`. ${right ? "They are equal" : "They are not equal"}, so the answer is **${ans}**.`,
    ].join("\n\n"),
    params: { kind: "x-coord", A, B, C },
    ...xGiven([["_x1", A[0]], ["_y1", A[1]], ["_x2", B[0]], ["_y2", B[1]], ["_x3", C[0]], ["_y3", C[1]]]),
    hints: [
      "The distance between two points is the hypotenuse of a right triangle: legs are the change in x and the change in y.",
      "For AB in the calculator: `sqrt((_x2 - _x1)^2 + (_y2 - _y1)^2)`.",
      "For the right angle, work with the squared lengths (whole numbers) so rounding can't fool you.",
    ],
  };
}

// volume 0: cylindrical tank: capacity in litres -> height, then depth for part-filled.
function xTank(rng) {
  let V, r, Q, h, dQ;
  for (;;) {
    V = rng.int(5, 300);
    r = rng.int(8, 40);
    Q = rng.int(1, V - 1);
    h = (1000 * V) / (Math.PI * r * r);
    dQ = (1000 * Q) / (Math.PI * r * r);
    if (h >= 5 && h <= 400 && !tie2(h) && !tie2(dQ)) break;
  }
  return {
    prompt: `A cylindrical tank has an inside radius of ${r} cm and holds ${V} litres when full (1 litre = 1000 cm³). Later it holds only ${Q} litres.${PI_ROUND}`,
    answerType: "multi",
    parts: [
      xPart("height", "Height", "Inside height of the tank (cm)", h, true, "Convert litres to cm³, then divide by the area of the circular base."),
      xPart("depth", "Depth", `Depth of the water when it holds ${Q} litres (cm)`, dQ, true, "Same base, different volume: divide that volume (in cm³) by the base area."),
    ],
    explanation: [
      `Volume = \`${V} × 1000 = ${V * 1000}\` cm³. Base area = \`π × ${r}² ≈ ${(Math.PI * r * r).toFixed(4)}\` cm².`,
      `Height = volume ÷ base area: \`${V * 1000} / (π × ${r}²)\` ${result(h, true, "cm")}`,
      `With ${Q} litres: \`${Q * 1000} / (π × ${r}²)\` ${result(dQ, true, "cm")}`,
    ].join("\n\n"),
    params: { kind: "x-tank", V, r, Q },
    ...xGiven([["_r", r], ["_V", V], ["_Q", Q]]),
    hints: [
      "Work backwards from V = π × r² × h: h = V ÷ (π × r²).",
      "The volume must be in cm³ to match the radius in cm: multiply litres by 1000.",
      "For the part-filled tank, the water is a shorter cylinder with the same base.",
    ],
  };
}

// volume 1: cylinder topped with a hemisphere or a cone.
function xCompSolid(rng) {
  let r, h, c, cone, byD, cyl, tot;
  for (;;) {
    r = rng.int(2, 15);
    h = rng.int(3, 30);
    cone = rng.next() < 0.5;
    c = rng.int(3, 20);
    byD = rng.next() < 0.4;
    cyl = Math.PI * r * r * h;
    tot = cyl + (cone ? (Math.PI * r * r * c) / 3 : (2 * Math.PI * r ** 3) / 3);
    if (!tie2(cyl) && !tie2(tot)) break;
  }
  const d = 2 * r;
  const size = byD ? `a diameter of ${d} cm` : `a radius of ${r} cm`;
  const top = cone
    ? `a cone of the same radius and height ${c} cm on top (volume of a cone = 1/3 × π × r² × h)`
    : `a hemisphere of the same radius on top (volume of a hemisphere = 2/3 × π × r³)`;
  const topVol = cone ? (Math.PI * r * r * c) / 3 : (2 * Math.PI * r ** 3) / 3;
  return {
    prompt: `A solid is a cylinder with ${size} and a height of ${h} cm, with ${top}.${PI_ROUND}`,
    answerType: "multi",
    parts: [
      xPart("cylinder", "Cylinder", "Volume of the cylinder part (cm³)", cyl, true, "π × r² × h, with the radius (not the diameter)."),
      xPart("total", "Total", "Volume of the whole solid (cm³)", tot, true, `Add the ${cone ? "cone" : "hemisphere"} using the formula in the question. Add unrounded values.`),
    ],
    explanation: [
      ...(byD ? [`Radius = \`${d} / 2 = ${r}\` cm.`] : []),
      `Cylinder: \`π × ${r}² × ${h}\` ${result(cyl, true, "cm³")}`,
      cone
        ? `Cone: \`1/3 × π × ${r}² × ${c} ≈ ${topVol.toFixed(4)}\` cm³.`
        : `Hemisphere: \`2/3 × π × ${r}³ ≈ ${topVol.toFixed(4)}\` cm³.`,
      `Total: \`${cyl.toFixed(4)} + ${topVol.toFixed(4)}\` ${result(tot, true, "cm³")}`,
    ].join("\n\n"),
    params: { kind: "x-compsolid", d, h, c: cone ? c : null },
    ...xGiven(byD ? (cone ? [["_d", d], ["_h", h], ["_c", c]] : [["_d", d], ["_h", h]]) : (cone ? [["_r", r], ["_h", h], ["_c", c]] : [["_r", r], ["_h", h]])),
    hints: [
      `Split the solid into a cylinder and a ${cone ? "cone" : "hemisphere"}, and find each volume.`,
      ...(byD ? [`You are given the diameter: the radius is half of ${d}.`] : []),
      `Both parts share the same radius. Keep both volumes unrounded, add them, and only round at the end.`,
    ],
  };
}

// volume 2: water from a full cuboid tank poured into a cylinder.
function xPour(rng) {
  let l, w, hc, r, H, depth;
  for (;;) {
    l = rng.int(5, 30);
    w = rng.int(5, 30);
    hc = rng.int(3, 20);
    r = rng.int(4, 15);
    depth = (l * w * hc) / (Math.PI * r * r);
    H = Math.max(1, Math.round(depth) + rng.pick([-6, -4, -2, 2, 4, 6]));
    if (depth >= 2 && depth <= 200 && !tie2(depth) && Math.abs(H - depth) >= 0.5) break;
  }
  const over = H < depth ? "Yes" : "No";
  return {
    prompt: `A cuboid tank ${l} cm × ${w} cm × ${hc} cm is full of water. All the water is poured into an empty cylinder with an inside radius of ${r} cm and a height of ${H} cm.${PI_ROUND}`,
    answerType: "multi",
    parts: [
      xPart("depth", "Depth", "Depth the water would reach in a tall enough cylinder (cm)", depth, true, "The volume of water stays the same: divide it by the cylinder's base area."),
      xChoice("overflow", "Overflow?", "Does the cylinder overflow?", over, ["Yes", "No"], "Compare the depth the water needs with the cylinder's height."),
    ],
    explanation: [
      `Water volume = \`${l} × ${w} × ${hc} = ${l * w * hc}\` cm³.`,
      `Cylinder base area = \`π × ${r}² ≈ ${(Math.PI * r * r).toFixed(4)}\` cm².`,
      `Depth = \`${l * w * hc} / (π × ${r}²)\` ${result(depth, true, "cm")}`,
      `The cylinder is ${H} cm tall, so it ${over === "Yes" ? "**does** overflow" : "does **not** overflow"}: **${over}**.`,
    ].join("\n\n"),
    params: { kind: "x-pour", l, w, hc, r, H },
    ...xGiven([["_l", l], ["_w", w], ["_hc", hc], ["_r", r], ["_H", H]]),
    hints: [
      "Pouring doesn't change the volume: first find the volume of water in the cuboid.",
      "In the cylinder that volume = π × r² × depth. Rearrange for the depth.",
      "Overflow happens only if that depth is more than the cylinder's height.",
    ],
  };
}

const X_SCALES = [[3, 2], [2, 1], [5, 2], [3, 1], [4, 3], [5, 4]];

// volume 3: similar solids: length, area and volume scale factors.
function xSimilar(rng) {
  const [p, q] = rng.pick(X_SCALES);
  const m = rng.int(2, 40);
  const t = rng.int(2, 12);
  const findH = rng.next() < 0.5;
  const thing = rng.pick(["bottles", "vases", "jugs", "cones", "tins"]);
  const V1 = q ** 3 * m;
  const V2 = p ** 3 * m;
  const h1 = q * t;
  const h2 = p * t;
  const k = p / q;
  const prompt = findH
    ? `Two mathematically similar ${thing} have volumes of ${V1} cm³ and ${V2} cm³. The smaller one is ${h1} cm tall. Round to 2 decimal places where needed.`
    : `Two mathematically similar ${thing} are ${h1} cm and ${h2} cm tall. The smaller one has a volume of ${V1} cm³. Round to 2 decimal places where needed.`;
  const target = findH ? h2 : V2;
  return {
    prompt,
    answerType: "multi",
    parts: [
      xPart("k", "Length scale", "Length scale factor, large ÷ small", k, true,
        findH ? "The volume scale factor is the length scale factor cubed, so take the cube root of the volume ratio." : "Divide the heights."),
      xPart("target", findH ? "Height" : "Volume", findH ? "Height of the larger one (cm)" : "Volume of the larger one (cm³)", target, true,
        findH ? "Multiply the smaller height by the length scale factor." : "Volumes scale by the length scale factor cubed."),
      xPart("area", "Area scale", "Surface area scale factor, large ÷ small", k * k, true, "Areas scale by the length scale factor squared."),
    ],
    explanation: [
      findH
        ? `Volume scale factor = \`${V2} / ${V1} = ${num(V2 / V1)}\`. Length scale factor = \`∛${num(V2 / V1)}\` = **${num(k)}**${Number.isInteger(k * 100) ? "" : ` (≈ ${f2(k)})`}.`
        : `Length scale factor = \`${h2} / ${h1}\` = **${num(k)}**${Number.isInteger(k * 100) ? "" : ` (≈ ${f2(k)})`}.`,
      findH
        ? `Larger height = \`${h1} × ${num(k)}\` = **${h2} cm**.`
        : `Larger volume = \`${V1} × ${num(k)}³ = ${V1} × ${num(k ** 3)}\` = **${V2} cm³**.`,
      `Area scale factor = \`${num(k)}²\` = **${num(k * k)}**${Number.isInteger(k * k * 100) ? "" : ` (≈ ${f2(k * k)})`}.`,
    ].join("\n\n"),
    params: { kind: "x-similar", findH, V1, h1, X: findH ? V2 : h2 },
    ...xGiven(findH ? [["_V1", V1], ["_V2", V2], ["_h1", h1]] : [["_h1", h1], ["_h2", h2], ["_V1", V1]]),
    hints: [
      "For similar solids: lengths scale by k, areas by k², volumes by k³.",
      findH ? "Find the volume ratio `_V2 / _V1` first; k is its cube root (`(_V2/_V1)^(1/3)`)." : "Find k from the heights: `_h2 / _h1`.",
      "Use k (or k², k³) on the matching kind of measurement.",
    ],
  };
}

function genExpert(subtopic, rng) {
  if (subtopic === "perimeter-area") return [xComposite, xRectBack, xBorder, xWire][rng.int(0, 3)](rng);
  if (subtopic === "angles") return [xPolyExt, xAlgAngles, xRatioAngles][rng.int(0, 2)](rng);
  if (subtopic === "pythagoras") return [xCuboid, xLadder, xCoord][rng.int(0, 2)](rng);
  if (subtopic === "volume") return [xTank, xCompSolid, xPour, xSimilar][rng.int(0, 3)](rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

export function generate({ subtopic, difficulty, rng }) {
  if (difficulty === "expert") return genExpert(subtopic, rng);
  if (subtopic === "perimeter-area") return genPerimArea(difficulty, rng);
  if (subtopic === "angles") return genAngles(difficulty, rng);
  if (subtopic === "pythagoras") return genPythagoras(difficulty, rng);
  if (subtopic === "volume") return genVolume(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// Independent check: substitute the answer back into the defining relation (diameter forms for
// circles, squares for Pythagoras, angle sums) and look at the residual. For rounded answers the
// allowed residual is 0.005 × (how strongly the relation reacts to the answer).
export function verify(question, answer) {
  const p = question && question.params;
  if (p && typeof p.kind === "string" && p.kind.startsWith("x-")) return verifyExpert(p, answer);
  if (!p || !p.values) return false;

  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
    if (!ch.includes(String(answer))) return false;
  }

  if (answer === "" || answer === null || answer === undefined) return false;
  const x = Number(answer);
  if (!Number.isFinite(x) || x <= 0) return false;

  const k = p.values;
  const sumOf = (arr) => arr.reduce((s, v) => s + v, 0);
  let residual, sens;
  switch (p.kind) {
    case "rect-area": // x / w = l
      residual = x - k.l * k.w;
      sens = 1;
      break;
    case "rect-perim":
      residual = x / 2 - k.l - k.w;
      sens = 0.5;
      break;
    case "tri-area": // 2x = b·h
      residual = 2 * x - k.b * k.h;
      sens = 2;
      break;
    case "tri-perim":
      residual = x - k.a - k.b - k.c;
      sens = 1;
      break;
    case "circle-area": // 4x = π·d²
      residual = 4 * x - Math.PI * (2 * k.r) ** 2;
      sens = 4;
      break;
    case "circle-circ": // x = π·d
      residual = x - Math.PI * (2 * k.r);
      sens = 1;
      break;
    case "circle-radius": // π·x² = A
      residual = Math.PI * x * x - k.A;
      sens = Math.PI * (2 * x + 0.01);
      break;
    case "triangle":
    case "supplementary":
    case "complementary":
    case "polygon-missing":
      residual = x + sumOf(k.angles) - k.total;
      sens = 1;
      break;
    case "isosceles": // two base angles + apex = 180
      residual = 2 * x + k.apex - 180;
      sens = 2;
      break;
    case "polygon-sum":
      residual = x - (k.n * 180 - 360);
      sens = 1;
      break;
    case "regular-each": // n equal angles fill the sum
      residual = k.n * x - (k.n * 180 - 360);
      sens = k.n;
      break;
    case "regular-sides": // exterior angles: x·(180 - angle) = 360
      if (!Number.isInteger(x)) return false;
      residual = x * (180 - k.angle) - 360;
      sens = 180 - k.angle;
      break;
    case "hyp": // x² = a² + b²
      residual = x * x - k.a * k.a - k.b * k.b;
      sens = 2 * x + 0.01;
      break;
    case "leg": // x² + a² = c²
      if (!(k.c > k.a)) return false;
      residual = x * x + k.a * k.a - k.c * k.c;
      sens = 2 * x + 0.01;
      break;
    case "cuboid":
      residual = x - k.l * k.w * k.h;
      sens = 1;
      break;
    case "cylinder": // 4x = π·d²·h
      residual = 4 * x - Math.PI * (2 * k.r) ** 2 * k.h;
      sens = 4;
      break;
    case "sphere": // 6x = π·d³
      residual = 6 * x - Math.PI * (2 * k.r) ** 3;
      sens = 6;
      break;
    default:
      return false;
  }
  if (!Number.isFinite(residual)) return false;
  if (p.rounded) return Math.abs(residual) <= 0.005 * sens + 1e-6;
  return Number.isInteger(x) && Math.abs(residual) <= 1e-9;
}

// ---- Expert verification: substitute the candidate answers back into the defining relations ----
// A rounded answer x passes when the relation's residual is within 0.005 × (its sensitivity to x).

const xv = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const xp = (a, id) => (a && typeof a === "object" ? xv(a[id]) : NaN);
const xs = (a, id) => (a && typeof a === "object" && a[id] !== undefined ? String(a[id]) : "");
const okRes = (res, sens) => Number.isFinite(res) && Math.abs(res) <= 0.005 * Math.abs(sens) + 1e-6;
const isWhole = (x) => Number.isInteger(x);

function verifyExpert(p, a) {
  switch (p.kind) {
    case "x-composite": {
      const x = xp(a, "area"), y = xp(a, "perimeter");
      const { L, W, cut } = p;
      // 8·area = 8·L·W ± π·W²  (semicircle = π·W²/8); 2·(perimeter - 2L - W) = π·W (half circumference)
      const resA = cut ? 8 * (L * W - x) - Math.PI * W * W : 8 * (x - L * W) - Math.PI * W * W;
      return okRes(resA, 8) && okRes(2 * (y - 2 * L - W) - Math.PI * W, 2);
    }
    case "x-rectback": {
      const l = xp(a, "length"), w = xp(a, "width");
      return isWhole(l) && isWhole(w) && w > 0 && l > w && 2 * l + 2 * w === p.P && l * w === p.A;
    }
    case "x-border": {
      const x = xp(a, "path"), y = xp(a, "outer");
      const { L, W, p: t } = p;
      // path = two long strips + two short strips + four corner squares
      const strips = 2 * L * t + 2 * W * t + 4 * t * t;
      return okRes(x - strips, 1) && okRes(y - (2 * L + 2 * W + 8 * t), 1);
    }
    case "x-wire": {
      const r = xp(a, "radius"), e = xp(a, "extra");
      const X = p.X;
      return r > 0 && okRes(2 * Math.PI * r - X, 2 * Math.PI) && okRes(4 * Math.PI * (e + (X / 4) ** 2) - X * X, 4 * Math.PI);
    }
    case "x-polyext": {
      const n = xp(a, "sides");
      if (!isWhole(n) || n < 3 || 360 % n !== 0) return false;
      const e = 360 / n;
      const interior = 180 - e;
      if (p.variant === 0) return interior === p.k * e && xp(a, "total") === n * interior;
      if (p.variant === 1) return interior - e === p.D && xp(a, "total") === n * interior;
      // variant 2: brute force the polygon whose angles (n triangles from a centre, minus 360) total S
      return n * 180 - 360 === p.S && xp(a, "exterior") * n === 360;
    }
    case "x-algangles": {
      const x = xp(a, "x"), big = xp(a, "largest");
      if (!isWhole(x)) return false;
      const angles = p.ms.map((m, i) => m * x + p.cs[i]);
      return angles.every((v) => v > 0 && v < 180) && angles.reduce((s, v) => s + v, 0) === p.total && big === Math.max(...angles);
    }
    case "x-ratioangles": {
      const s = xp(a, "smallest"), b = xp(a, "largest");
      const rmin = Math.min(...p.rs), rmax = Math.max(...p.rs);
      if (!isWhole(s) || !isWhole(b) || s <= 0) return false;
      const unit = s / rmin;
      const total = p.rs.reduce((acc, r) => acc + r * unit, 0);
      return Math.abs(total - (p.rs.length - 2) * 180) < 1e-9 && Math.abs(b - rmax * unit) < 1e-9;
    }
    case "x-cuboid": {
      const d1 = xp(a, "base"), d2 = xp(a, "space");
      const { l, w, h, R } = p;
      if (!(d1 > 0 && d2 > 0)) return false;
      const ok1 = okRes(d1 * d1 - l * l - w * w, 2 * d1 + 0.01);
      const ok2 = okRes(d2 * d2 - l * l - w * w - h * h, 2 * d2 + 0.01);
      const fits = R * R <= l * l + w * w + h * h ? "Yes" : "No";
      return ok1 && ok2 && xs(a, "fits") === fits;
    }
    case "x-ladder": {
      const h = xp(a, "height"), m = xp(a, "slide");
      const { L, d, s } = p;
      if (!(h > 0) || !Number.isFinite(m)) return false;
      if (!okRes(h * h + d * d - L * L, 2 * h + 0.01)) return false;
      // Bisection for the true height (independent of the formula used to generate), then check the new foot.
      let lo = 0, hi = L;
      for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (mid * mid + d * d < L * L) lo = mid; else hi = mid; }
      const top = lo - s;
      const foot = d + m;
      return foot > 0 && okRes(foot * foot + top * top - L * L, 2 * foot + 0.01);
    }
    case "x-coord": {
      const ab = xp(a, "ab"), bc = xp(a, "bc");
      const [A, B, C] = [p.A, p.B, p.C];
      const sq = (P, Q) => (Q[0] - P[0]) ** 2 + (Q[1] - P[1]) ** 2;
      if (!(ab > 0 && bc > 0)) return false;
      if (!okRes(ab * ab - sq(A, B), 2 * ab + 0.01) || !okRes(bc * bc - sq(B, C), 2 * bc + 0.01)) return false;
      // Right angle by dot products at each corner (not by Pythagoras).
      const pts = [A, B, C];
      const right = [0, 1, 2].some((i) => {
        const P = pts[i], Q = pts[(i + 1) % 3], R = pts[(i + 2) % 3];
        return (Q[0] - P[0]) * (R[0] - P[0]) + (Q[1] - P[1]) * (R[1] - P[1]) === 0;
      });
      return xs(a, "right") === (right ? "Yes" : "No");
    }
    case "x-tank": {
      const h = xp(a, "height"), dq = xp(a, "depth");
      const base = Math.PI * p.r * p.r;
      return h > 0 && dq > 0 && okRes(base * h - 1000 * p.V, base) && okRes(base * dq - 1000 * p.Q, base);
    }
    case "x-compsolid": {
      const cy = xp(a, "cylinder"), tot = xp(a, "total");
      const { d, h, c } = p;
      // Using the diameter: cylinder = π·d²·h/4; hemisphere = π·d³/12; cone = π·d²·c/12.
      const okC = okRes(4 * cy - Math.PI * d * d * h, 4);
      const okT = c === null
        ? okRes(12 * tot - Math.PI * (3 * d * d * h + d ** 3), 12)
        : okRes(12 * tot - Math.PI * d * d * (3 * h + c), 12);
      return okC && okT;
    }
    case "x-pour": {
      const dep = xp(a, "depth");
      const water = p.l * p.w * p.hc;
      const base = Math.PI * p.r * p.r;
      const over = base * p.H < water ? "Yes" : "No";
      return dep > 0 && okRes(base * dep - water, base) && xs(a, "overflow") === over;
    }
    case "x-similar": {
      const k = xp(a, "k"), t = xp(a, "target"), ar = xp(a, "area");
      if (!(k > 0 && t > 0 && ar > 0)) return false;
      const { findH, V1, h1, X } = p;
      // True k from the data: cube root of the volume ratio, or the height ratio.
      const kTrue = findH ? Math.cbrt(X / V1) : X / h1;
      const okK = okRes(k - kTrue, 1);
      const okT = findH ? okRes(t ** 3 - h1 ** 3 * (X / V1), 3 * t * t + 0.01) : okRes(t - V1 * (X / h1) ** 3, 1);
      const okA = okRes(ar - kTrue * kTrue, 1);
      return okK && okT && okA;
    }
    default:
      return false;
  }
}
