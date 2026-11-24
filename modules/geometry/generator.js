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
  let prompt, exact, rounded, unit, explanation, candidates, values;

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
    rounded = hard;
    const end = rounded ? ROUND : WHOLE;
    if (kind === "rect-area") {
      exact = l * w;
      unit = "cm²";
      prompt = `A rectangle is ${num(l)} cm long and ${num(w)} cm wide. What is its area, in cm²?${end}`;
      explanation = `Area of a rectangle = length × width.\n\n\`${num(l)} × ${num(w)}\` ${result(exact, rounded, unit)}`;
      candidates = [2 * (l + w), l + w, 2 * l * w]; // perimeter instead, added, doubled
    } else {
      exact = 2 * (l + w);
      unit = "cm";
      prompt = `A rectangle is ${num(l)} cm long and ${num(w)} cm wide. What is its perimeter, in cm?${end}`;
      explanation = `Perimeter of a rectangle = 2 × (length + width).\n\n\`2 × (${num(l)} + ${num(w)}) = 2 × ${num(l + w)}\` ${result(exact, rounded, unit)}`;
      candidates = [l * w, l + w, 2 * l + w]; // area instead, forgot to double, doubled one side only
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
    rounded = hard;
    exact = (b * h) / 2;
    unit = "cm²";
    prompt = `A triangle has a base of ${num(b)} cm and a perpendicular height of ${num(h)} cm. What is its area, in cm²?${rounded ? ROUND : WHOLE}`;
    explanation = `Area of a triangle = ½ × base × height.\n\n\`½ × ${num(b)} × ${num(h)} = ½ × ${num(b * h)}\` ${result(exact, rounded, unit)}`;
    candidates = [b * h, b + h, (b + h) / 2]; // forgot the half, added, averaged
  } else if (kind === "tri-perim") {
    // Three sides that satisfy the triangle inequality.
    let a, b, c;
    do {
      a = rng.int(3, 25);
      b = rng.int(3, 25);
      c = rng.int(3, 25);
    } while (a + b <= c || a + c <= b || b + c <= a);
    values = { a, b, c };
    rounded = false;
    exact = a + b + c;
    unit = "cm";
    prompt = `A triangle has sides of ${a} cm, ${b} cm and ${c} cm. What is its perimeter, in cm?${WHOLE}`;
    explanation = `The perimeter is the sum of the sides.\n\n\`${a} + ${b} + ${c}\` ${result(exact, false, unit)}`;
    candidates = [a + b, a * b, 2 * (a + b)];
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
    if (kind === "circle-area") {
      values = { r };
      exact = Math.PI * r * r;
      unit = "cm²";
      prompt = `A circle has ${given}. What is its area, in cm²?${PI_ROUND}`;
      explanation = `${toR}Area of a circle = π × r².\n\n\`π × ${num(r)}² = π × ${num(r * r)}\` ${result(exact, true, unit)}`;
      candidates = [Math.PI * d * d, 2 * Math.PI * r, 3.14 * r * r]; // used the diameter, gave the circumference, used 3.14
    } else if (kind === "circle-circ") {
      values = { r };
      exact = 2 * Math.PI * r;
      unit = "cm";
      prompt = `A circle has ${given}. What is its circumference, in cm?${PI_ROUND}`;
      explanation = `${toR}Circumference = 2 × π × r (or π × d).\n\n\`2 × π × ${num(r)}\` ${result(exact, true, unit)}`;
      candidates = [Math.PI * r, Math.PI * r * r, 3.14 * d]; // forgot the 2, gave the area, used 3.14
    } else {
      // circle-radius (hard): area given, rounded to 2 decimals, find the radius.
      const A = round2(Math.PI * r * r);
      values = { A };
      exact = Math.sqrt(A / Math.PI);
      unit = "cm";
      prompt = `A circle has an area of ${A.toFixed(2)} cm². What is its radius, in cm?${PI_ROUND}`;
      explanation = `Rearrange \`A = π × r²\` to \`r = √(A / π)\`.\n\n\`√(${A.toFixed(2)} / π) = √${(A / Math.PI).toFixed(4)}\` ${result(exact, true, unit)}`;
      candidates = [A / Math.PI, 2 * exact, Math.sqrt(A)]; // forgot the square root, gave the diameter, forgot π
    }
  }

  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values, rounded } };
  return finish(base, exact, rounded, candidates, rng);
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
  let prompt, exact, rounded = false, explanation, candidates, values;

  if (kind === "triangle") {
    let a, b;
    do {
      a = rng.int(15, 120);
      b = rng.int(15, 120);
    } while (180 - a - b < 10);
    values = { angles: [a, b], total: 180 };
    exact = 180 - a - b;
    prompt = `Two angles of a triangle are ${a}° and ${b}°. What is the third angle?${DEG}`;
    explanation = `The angles in a triangle add up to 180°.\n\n\`180 - ${a} - ${b}\` ${result(exact, false, "°")}`;
    candidates = [a + b, 360 - a - b, 90 - Math.abs(a - b)];
  } else if (kind === "supplementary" || kind === "complementary") {
    const total = kind === "supplementary" ? 180 : 90;
    const a = rng.int(5, total - 5);
    values = { angles: [a], total };
    exact = total - a;
    prompt = `Two angles are ${kind}. One of them is ${a}°. What is the other?${DEG}`;
    explanation = `${kind === "supplementary" ? "Supplementary angles add up to 180°" : "Complementary angles add up to 90°"}.\n\n\`${total} - ${a}\` ${result(exact, false, "°")}`;
    candidates = [270 - total - a, 360 - a, total + a]; // mixed up 90 and 180, used 360, added
  } else if (kind === "isosceles") {
    // Apex angle given; the two base angles are equal.
    const apex = difficulty === "medium" ? 2 * rng.int(10, 80) : rng.int(20, 160);
    rounded = apex % 2 !== 0;
    values = { apex };
    exact = (180 - apex) / 2;
    prompt = `An isosceles triangle has an angle of ${apex}° between its two equal sides. What is each of the other two angles?${DEG}${rounded ? ROUND : WHOLE}`;
    explanation = `The two base angles are equal and all three add up to 180°.\n\n\`(180 - ${apex}) / 2 = ${180 - apex} / 2\` ${result(exact, rounded, "°")}`;
    candidates = [180 - apex, apex, (180 - apex) / 3]; // forgot to halve, copied the apex, split three ways
  } else if (kind === "polygon-sum") {
    const n = rng.int(4, 12);
    values = { n };
    exact = (n - 2) * 180;
    prompt = `What is the sum of the interior angles of a ${shape(n)}?${DEG}`;
    explanation = `Sum of interior angles = (n - 2) × 180°.\n\n\`(${n} - 2) × 180 = ${n - 2} × 180\` ${result(exact, false, "°")}`;
    candidates = [n * 180, (n - 1) * 180, 360]; // forgot the -2, off by one, used the exterior sum
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
    exact = missing;
    const known = angles.reduce((s, x) => s + x, 0);
    prompt = `A ${shape(n)} has interior angles of ${angles.map((x) => `${x}°`).join(", ")} and one unknown angle. What is the unknown angle?${DEG}`;
    explanation =
      `Sum of interior angles = \`(${n} - 2) × 180 = ${sum}°\`. The known angles add up to ${known}°.\n\n` +
      `\`${sum} - ${known}\` ${result(exact, false, "°")}`;
    candidates = [n * 180 - known, (n - 1) * 180 - known, 360 - (known % 360)];
  }

  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values, rounded } };
  return finish(base, exact, rounded, candidates, rng);
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
  let prompt, exact, explanation, candidates, values;
  if (find === "hyp") {
    values = { a, b };
    exact = Math.sqrt(a * a + b * b);
    prompt = `A right triangle has legs of ${num(a)} cm and ${num(b)} cm. How long is the hypotenuse, in cm?${end}`;
    explanation =
      `Pythagoras: \`c² = a² + b²\`.\n\n` +
      `\`c² = ${num(a)}² + ${num(b)}² = ${num(a * a)} + ${num(b * b)} = ${num(a * a + b * b)}\`\n\n` +
      `\`c = √${num(a * a + b * b)}\` ${result(exact, rounded, "cm")}`;
    candidates = [a + b, a * a + b * b, Math.sqrt(Math.abs(a * a - b * b))]; // added the sides, forgot the root, subtracted
  } else {
    values = { a, c };
    exact = Math.sqrt(c * c - a * a);
    prompt = `A right triangle has a hypotenuse of ${num(c)} cm and one leg of ${num(a)} cm. How long is the other leg, in cm?${end}`;
    explanation =
      `Pythagoras: \`a² + b² = c²\`, so \`b² = c² - a²\`.\n\n` +
      `\`b² = ${num(c)}² - ${num(a)}² = ${num(c * c)} - ${num(a * a)} = ${num(c * c - a * a)}\`\n\n` +
      `\`b = √${num(c * c - a * a)}\` ${result(exact, rounded, "cm")}`;
    candidates = [Math.sqrt(c * c + a * a), c - a, c * c - a * a]; // added the squares, subtracted the sides, forgot the root
  }
  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind: find, values, rounded } };
  return finish(base, exact, rounded, candidates, rng);
}

function genVolume(difficulty, rng) {
  if (difficulty !== "medium" && difficulty !== "hard") throw new Error(`volume has no "${difficulty}" level`);
  const hard = difficulty === "hard";
  const kind = rng.pick(["cuboid", "cylinder", "sphere"]);
  let prompt, exact, rounded, explanation, candidates, values;

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
    exact = l * w * h;
    prompt = `A cuboid is ${num(l)} cm long, ${num(w)} cm wide and ${num(h)} cm high. What is its volume, in cm³?${rounded ? ROUND : WHOLE}`;
    explanation = `Volume of a cuboid = length × width × height.\n\n\`${num(l)} × ${num(w)} × ${num(h)}\` ${result(exact, rounded, "cm³")}`;
    candidates = [2 * (l * w + w * h + l * h), l * w + w * h + l * h, l + w + h]; // surface area, half of it, added
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
      exact = Math.PI * r * r * h;
      prompt = `A cylinder has ${given} and a height of ${num(h)} cm. What is its volume, in cm³?${PI_ROUND}`;
      explanation = `${toR}Volume of a cylinder = π × r² × h.\n\n\`π × ${num(r)}² × ${num(h)} = π × ${num(r * r * h)}\` ${result(exact, true, "cm³")}`;
      candidates = [Math.PI * d * d * h, 2 * Math.PI * r * h, 3.14 * r * r * h]; // used the diameter, curved surface, used 3.14
    } else {
      values = { r };
      exact = (4 / 3) * Math.PI * r ** 3;
      prompt = `A sphere has ${given}. What is its volume, in cm³?${PI_ROUND}`;
      explanation = `${toR}Volume of a sphere = 4/3 × π × r³.\n\n\`4/3 × π × ${num(r)}³ = 4/3 × π × ${num(r ** 3)}\` ${result(exact, true, "cm³")}`;
      candidates = [4 * Math.PI * r * r, Math.PI * r ** 3, (4 / 3) * 3.14 * r ** 3]; // surface area, forgot 4/3, used 3.14
    }
  }
  const base = { prompt, tolerance: rounded ? 0.005 : 0, explanation, params: { kind, values, rounded } };
  return finish(base, exact, rounded, candidates, rng);
}

export function generate({ subtopic, difficulty, rng }) {
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
